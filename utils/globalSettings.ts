/**
 * Global Settings — world-wide configuration served by the backend.
 *
 * Source of truth lives in the Postgres `global_settings` table on the
 * backend; see backend/src/routes/devops.ts. Every browser fetches the
 * current settings on app boot via the unauthenticated
 *   GET /api/devops/public/global-settings
 * endpoint, caches them in memory + localStorage (for offline boot),
 * and re-fetches on a slow interval. Admins push changes from the
 * DevOps Console with PUT /api/devops/global-settings (token-gated).
 *
 * Components don't import this directly for retired-agent logic — that
 * still goes through utils/retiredAgents.ts, which now reads through
 * this cache. Components that want banner / maintenance-mode reactivity
 * use subscribe() / getGlobalSettings().
 */

import { useEffect, useState } from 'react';
import type { AgentType } from '../types';
import { isOssBuild } from './ossMode';

export interface GlobalSettings {
  /** AgentType values that are hidden from the public UI globally. */
  retiredAgents: string[];
  /** If set, shown as a banner at the top of the app for every user. */
  announcementBanner: string | null;
  /** If true, the app renders a full-page maintenance notice instead of the UI. */
  maintenanceMode: boolean;
  /** Generic on/off feature flags. */
  featureFlags: Record<string, boolean>;
  /** Optional custom voicemail greeting audio (base64) recorded by DevOps. */
  voicemailWelcomeAudioBase64?: string | null;
  /** Mime type for voicemailWelcomeAudioBase64. */
  voicemailWelcomeAudioMimeType?: string | null;
  /**
   * Optional admin-controlled ordering for the homepage agent cards.
   * AgentType string values (and synthetic ids like 'show_civil3d') in the
   * order they should appear. Unknown / missing keys fall back to the static
   * default order at the end. `null` / undefined / empty = use the built-in
   * order with no overrides.
   */
  agentOrderHome?: string[] | null;
  /**
   * Optional admin-controlled ordering for the in-session sidebar agent tabs.
   * Same semantics as agentOrderHome.
   */
  agentOrderSidebar?: string[] | null;
  /**
   * Optional admin-controlled release stage override by agent/action id.
   * Example: { "DEED_READER": "ga", "show_civil3d": "beta" }
   */
  agentReleaseStages?: Record<string, 'pre-alpha' | 'alpha' | 'beta' | 'rc' | 'ga'>;
  /** Manual control for how many compute units represent one day of normal use. */
  creditRunwayUnitsPerDay?: number | null;
}

export interface GlobalSettingsEnvelope {
  settings: GlobalSettings;
  version: number;
  updatedAt: string;
  /** True when the backend served defaults because of an error. */
  degraded?: boolean;
}

const DEFAULTS: GlobalSettings = {
  // Mirrors the seed in backend/src/utils/database.ts and the legacy
  // localStorage defaults in utils/retiredAgents.ts so a totally offline
  // first boot still hides the same agents.
  retiredAgents: ['RAW_CRAWLER', 'IMAGE_ANALYZER'],
  announcementBanner: null,
  maintenanceMode: false,
  featureFlags: {},
  voicemailWelcomeAudioBase64: null,
  voicemailWelcomeAudioMimeType: null,
  agentOrderHome: null,
  agentOrderSidebar: null,
  agentReleaseStages: {},
  creditRunwayUnitsPerDay: 75,
};

const LOCAL_CACHE_KEY = 'landsurv-global-settings-cache';
const DEFAULT_DEVOPS_BACKEND = 'https://landsurv-backend-y55gmt77ga-uw.a.run.app';
function resolveApiBase(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    const isLocal =
      host === 'localhost'
      || host === '127.0.0.1'
      || host === '::1'
      || host.endsWith('.localhost');
    const isFirstParty = host === 'landsurv.ai' || host.endsWith('.landsurv.ai');
    if (isLocal || isFirstParty) {
      return window.location.origin.replace(/\/$/, '');
    }
  }

  const envBase = String((import.meta as any)?.env?.VITE_API_URL || '').trim();
  if (envBase) return envBase.replace(/\/$/, '');

  return DEFAULT_DEVOPS_BACKEND;
}

const RESOLVED_API_BASE = resolveApiBase();
const PUBLIC_URL = `${RESOLVED_API_BASE}/api/devops/public/global-settings`;
const ADMIN_URL = `${RESOLVED_API_BASE}/api/devops/global-settings`;
const REFRESH_INTERVAL_MS = 60 * 1000; // 1 minute background poll
const CHANGE_EVENT = 'landsurv-global-settings-changed';

let current: GlobalSettingsEnvelope = readLocalCache() ?? {
  settings: DEFAULTS,
  version: 0,
  updatedAt: new Date(0).toISOString(),
};

let pollTimer: ReturnType<typeof setInterval> | null = null;
let inflight: Promise<GlobalSettingsEnvelope> | null = null;

function readLocalCache(): GlobalSettingsEnvelope | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.settings) return null;
    return {
      settings: { ...DEFAULTS, ...parsed.settings },
      version: typeof parsed.version === 'number' ? parsed.version : 0,
      updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

function writeLocalCache(env: GlobalSettingsEnvelope) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(env));
  } catch {
    /* quota / disabled — ignore */
  }
}

function notify() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: current }));
  // Keep the legacy event firing too so existing Sidebar / InitialAgentSelection
  // listeners (which already subscribe to 'retired-agents-changed') pick up
  // server-pushed retirement changes without any modification.
  window.dispatchEvent(
    new CustomEvent('retired-agents-changed', {
      detail: current.settings.retiredAgents,
    })
  );
}

function applyEnvelope(env: GlobalSettingsEnvelope) {
  const changed =
    env.version !== current.version ||
    JSON.stringify(env.settings) !== JSON.stringify(current.settings);
  current = {
    settings: { ...DEFAULTS, ...env.settings },
    version: env.version,
    updatedAt: env.updatedAt,
    degraded: env.degraded,
  };
  writeLocalCache(current);
  if (changed) notify();
}

/**
 * Fetch the current world-state from the backend. Safe to call repeatedly;
 * concurrent calls share a single in-flight request.
 */
export async function refreshGlobalSettings(): Promise<GlobalSettingsEnvelope> {
  // OSS/local-mode build: there is no backend to call. Stay on defaults.
  if (isOssBuild()) return current;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(PUBLIC_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as GlobalSettingsEnvelope;
      applyEnvelope(body);
      return current;
    } catch (err) {
      // Stay on whatever we have (cache or defaults). Don't blast the console
      // on every retry — just one tagged warning.
      console.warn('[globalSettings] refresh failed:', err);
      return current;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Synchronous accessor — returns the most recently fetched (or cached, or
 * default) settings. Safe to call from anywhere.
 */
export function getGlobalSettings(): GlobalSettings {
  return current.settings;
}

export function getCreditRunwayUnitsPerDay(settings: GlobalSettings = current.settings): number {
  const value = settings.creditRunwayUnitsPerDay;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  return 75;
}

export function useGlobalSettings(): GlobalSettings {
  const [settings, setSettings] = useState<GlobalSettings>(() => getGlobalSettings());

  useEffect(() => subscribeGlobalSettings((env) => setSettings(env.settings)), []);

  return settings;
}

export function getGlobalSettingsEnvelope(): GlobalSettingsEnvelope {
  return current;
}

/**
 * Subscribe to changes. Returns an unsubscribe function.
 */
export function subscribeGlobalSettings(
  cb: (env: GlobalSettingsEnvelope) => void
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => cb((e as CustomEvent<GlobalSettingsEnvelope>).detail);
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

/**
 * Start background polling. Call once from app boot.
 */
export function startGlobalSettingsPolling() {
  if (typeof window === 'undefined') return;
  if (isOssBuild()) return; // no backend to poll in local mode
  refreshGlobalSettings();
  if (pollTimer) return;
  pollTimer = setInterval(refreshGlobalSettings, REFRESH_INTERVAL_MS);
}

/**
 * Admin — push a partial update to the backend. `token` must be a valid
 * DevOps session token. On success, updates the local cache and notifies
 * subscribers immediately.
 */
export async function saveGlobalSettings(
  token: string,
  patch: Partial<GlobalSettings>,
  expectedVersion?: number
): Promise<GlobalSettingsEnvelope> {
  const res = await fetch(ADMIN_URL, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ settings: patch, expectedVersion }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Save failed (HTTP ${res.status})`);
  }
  const env = (await res.json()) as GlobalSettingsEnvelope;
  applyEnvelope({
    settings: env.settings,
    version: env.version,
    updatedAt: env.updatedAt,
  });
  return env;
}

/**
 * Admin — load full settings + audit history (token-gated).
 */
export async function loadAdminGlobalSettings(token: string): Promise<
  GlobalSettingsEnvelope & {
    updatedBy: string | null;
    history: Array<{
      id: string;
      version: number;
      updated_by: string | null;
      ip_address: string | null;
      user_agent: string | null;
      created_at: string;
      previous_settings: GlobalSettings | null;
      new_settings: GlobalSettings;
    }>;
  }
> {
  const res = await fetch(ADMIN_URL, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Load failed (HTTP ${res.status})`);
  }
  const env = await res.json();
  // Refresh local cache while we're at it.
  applyEnvelope({
    settings: env.settings,
    version: env.version,
    updatedAt: env.updatedAt,
  });
  return env;
}

/**
 * Admin — reset to factory defaults (token-gated).
 */
export async function resetGlobalSettings(token: string): Promise<GlobalSettingsEnvelope> {
  const res = await fetch(`${ADMIN_URL}/reset`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Reset failed (HTTP ${res.status})`);
  }
  const env = (await res.json()) as GlobalSettingsEnvelope;
  applyEnvelope({
    settings: env.settings,
    version: env.version,
    updatedAt: env.updatedAt,
  });
  return env;
}

/**
 * Admin — hit the health endpoint.
 */
export async function fetchDevopsHealth(): Promise<{
  status: 'healthy' | 'degraded';
  db: boolean;
  uptimeSeconds: number;
  activeDevopsSessions: number;
  timestamp: string;
}> {
  const res = await fetch(`${RESOLVED_API_BASE}/api/devops/health`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Admin — full stats panel.
 */
export async function fetchDevopsStats(token: string): Promise<{
  subscriberCount: number;
  globalSettingsVersion: number;
  globalSettingsUpdatedAt: string;
  globalSettingsUpdatedBy: string | null;
  changesLast7Days: number;
  retiredAgentCount: number;
  uptimeSeconds: number;
  activeDevopsSessions: number;
}> {
  const res = await fetch(`${RESOLVED_API_BASE}/api/devops/stats`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Stats failed (HTTP ${res.status})`);
  }
  return res.json();
}

// Type-only marker import to keep AgentType in the public surface for
// callers without forcing them to also import from ../types.
export type { AgentType };
