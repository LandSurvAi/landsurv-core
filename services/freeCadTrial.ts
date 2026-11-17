import { getDeviceFingerprint, type FingerprintSignals } from './deviceFingerprint.ts';
import { FREE_CAD_DEED_LIMIT, FREE_CAD_PROMPT_LIMIT } from './freeCadPolicy.ts';
import { TRIAL_TERMS_VERSION } from '../data/trialTermsContent.ts';

/**
 * Free CAD trial client
 *
 * The server ledger is authoritative when reachable. A local mirror keeps the
 * badge and the last-known count usable across refreshes and offline periods.
 * The 20-prompt cap is lifetime per device and one prompt is consumed at the
 * start of a model turn.
 */

const ACCEPTANCE_KEY = 'landsurv_free_cad_trial_acceptance_v1';
const USAGE_KEY = 'landsurv_free_cad_trial_usage_v1';
const CACHE_KEY = 'landsurv_free_cad_trial_snapshot_v1';
const REQUEST_TIMEOUT_MS = 8000;

export type TrialSource = 'server' | 'cache' | 'offline';

export interface FreeCadTrialSnapshot {
  limit: number;
  used: number;
  remaining: number;
  deedLimit: number;
  deedUsed: number;
  deedRemaining: number;
  accepted: boolean;
  termsVersion: string;
  source: TrialSource;
  checkedAt: number;
  unverified?: boolean;
  fingerprintRequired?: boolean;
  ephemeral?: boolean;
}

export interface TrialAcceptanceRecord {
  termsVersion: string;
  acceptedAt: string;
  fingerprintId: string;
  userAgent: string;
  surface: 'welcome-free-cad';
  /** Raw device signals so the visitor record carries the full fingerprint. */
  fingerprintSignals?: FingerprintSignals;
}

export interface ConsumeTrialPromptResult {
  allowed: boolean;
  snapshot: FreeCadTrialSnapshot;
  turnId?: string;
  reason?: 'exhausted' | 'deed-limit' | 'terms-stale' | 'offline' | 'error';
}

interface StoredUsage {
  fingerprintId: string;
  used: number;
  limit: number;
  deedUsed?: number;
  deedLimit?: number;
  updatedAt: number;
}

interface ServerStatusResponse {
  accepted?: boolean;
  termsVersion?: string;
  limit?: number;
  used?: number;
  remaining?: number;
  deedLimit?: number;
  deedUsed?: number;
  deedRemaining?: number;
  ephemeral?: boolean;
  error?: string;
  code?: string;
}

let activeTurnId: string | null = null;
let activeTurnExpiresAt = 0;

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function apiBase(): string {
  const env = (import.meta as any)?.env;
  const configured = env?.VITE_API_URL as string | undefined;
  if (!configured) return '';
  return configured.replace(/\/api\/?$/, '');
}

function readJson<T>(key: string): T | null {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* non-fatal */
  }
}

function clampLimit(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return FREE_CAD_PROMPT_LIMIT;
  return Math.max(1, Math.min(1000, Math.floor(number)));
}

function clampDeedLimit(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return FREE_CAD_DEED_LIMIT;
  return Math.max(1, Math.min(20, Math.floor(number)));
}

function buildSnapshot(params: {
  used?: unknown;
  limit?: unknown;
  deedUsed?: unknown;
  deedLimit?: unknown;
  accepted?: unknown;
  termsVersion?: unknown;
  source: TrialSource;
  unverified?: boolean;
  fingerprintRequired?: boolean;
  ephemeral?: boolean;
}): FreeCadTrialSnapshot {
  const limit = clampLimit(params.limit);
  const usedRaw = Number(params.used);
  const used = Number.isFinite(usedRaw) ? Math.max(0, Math.min(limit, Math.floor(usedRaw))) : 0;
  const deedLimit = clampDeedLimit(params.deedLimit);
  const deedUsedRaw = Number(params.deedUsed);
  const deedUsed = Number.isFinite(deedUsedRaw) ? Math.max(0, Math.min(deedLimit, Math.floor(deedUsedRaw))) : 0;
  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
    deedLimit,
    deedUsed,
    deedRemaining: Math.max(0, deedLimit - deedUsed),
    accepted: params.accepted === true,
    termsVersion: typeof params.termsVersion === 'string' ? params.termsVersion : TRIAL_TERMS_VERSION,
    source: params.source,
    checkedAt: Date.now(),
    unverified: params.unverified,
    fingerprintRequired: params.fingerprintRequired,
    ephemeral: params.ephemeral,
  };
}

export function getTrialAcceptanceRecord(): TrialAcceptanceRecord | null {
  return readJson<TrialAcceptanceRecord>(ACCEPTANCE_KEY);
}

export function hasAcceptedTrialTerms(): boolean {
  const record = getTrialAcceptanceRecord();
  return Boolean(record && record.termsVersion === TRIAL_TERMS_VERSION && record.acceptedAt);
}

export function isTrialTermsCurrent(): boolean {
  const record = getTrialAcceptanceRecord();
  return Boolean(record && record.termsVersion === TRIAL_TERMS_VERSION);
}

export function getCachedTrialSnapshot(): FreeCadTrialSnapshot | null {
  const cached = readJson<FreeCadTrialSnapshot>(CACHE_KEY);
  if (cached) {
    return {
      ...buildSnapshot({
        used: cached.used,
        limit: cached.limit,
        deedUsed: cached.deedUsed,
        deedLimit: cached.deedLimit,
        accepted: cached.accepted,
        termsVersion: cached.termsVersion,
        source: cached.source === 'server' ? 'cache' : (cached.source ?? 'cache'),
        unverified: cached.unverified,
        ephemeral: cached.ephemeral,
      }),
      checkedAt: Number(cached.checkedAt) || Date.now(),
    };
  }

  const usage = readJson<StoredUsage>(USAGE_KEY);
  if (!usage) return null;
  return buildSnapshot({
    used: usage.used,
    limit: usage.limit,
    deedUsed: usage.deedUsed,
    deedLimit: usage.deedLimit,
    accepted: hasAcceptedTrialTerms(),
    source: 'cache',
    unverified: true,
  });
}

function getLocalSnapshot(fingerprintId?: string | null): FreeCadTrialSnapshot {
  const usage = readJson<StoredUsage>(USAGE_KEY);
  const matches = !fingerprintId || !usage?.fingerprintId || usage.fingerprintId === fingerprintId;
  return buildSnapshot({
    used: matches ? usage?.used : 0,
    limit: matches ? usage?.limit : FREE_CAD_PROMPT_LIMIT,
    deedUsed: matches ? usage?.deedUsed : 0,
    deedLimit: matches ? usage?.deedLimit : FREE_CAD_DEED_LIMIT,
    accepted: hasAcceptedTrialTerms(),
    source: 'offline',
    unverified: true,
    fingerprintRequired: !fingerprintId,
  });
}

function writeUsage(
  fingerprintId: string,
  used: number,
  limit: number,
  deedUsed = 0,
  deedLimit = FREE_CAD_DEED_LIMIT,
): void {
  writeJson(USAGE_KEY, {
    fingerprintId,
    used: Math.max(0, Math.min(limit, Math.floor(used))),
    limit,
    deedUsed: Math.max(0, Math.min(deedLimit, Math.floor(deedUsed))),
    deedLimit,
    updatedAt: Date.now(),
  } satisfies StoredUsage);
}

function writeSnapshotCache(snapshot: FreeCadTrialSnapshot): void {
  writeJson(CACHE_KEY, snapshot);
}

async function resolveFingerprintId(): Promise<string | null> {
  try {
    const fingerprint = await getDeviceFingerprint();
    return fingerprint.id || null;
  } catch {
    return null;
  }
}

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: T | null }> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
  try {
    const response = await fetch(`${apiBase()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: controller?.signal,
    });
    const data = (await response.json().catch(() => null)) as T | null;
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function acceptTrialTerms(record: TrialAcceptanceRecord): Promise<void> {
  writeJson(ACCEPTANCE_KEY, record);
  const response = await postJson<{
    accepted?: boolean;
    termsVersion?: string;
    limit?: number;
    deedLimit?: number;
    deedUsed?: number;
  }>('/api/trial/accept', {
    fingerprintId: record.fingerprintId,
    termsVersion: record.termsVersion,
    acceptedAt: record.acceptedAt,
    userAgent: record.userAgent,
    surface: record.surface,
    fingerprintSignals: record.fingerprintSignals,
  });
  const local = getLocalSnapshot(record.fingerprintId);
  const limit = clampLimit(response.data?.limit ?? local.limit);
  const snapshot = buildSnapshot({
    used: local.used,
    limit,
    deedUsed: response.data?.deedUsed ?? local.deedUsed,
    deedLimit: response.data?.deedLimit ?? local.deedLimit,
    accepted: response.data?.accepted === true || response.ok,
    termsVersion: record.termsVersion,
    source: response.ok ? 'server' : 'offline',
    unverified: !response.ok,
  });
  writeSnapshotCache(snapshot);
  writeUsage(record.fingerprintId, snapshot.used, snapshot.limit, snapshot.deedUsed, snapshot.deedLimit);
}

export async function refreshTrialStatus(): Promise<FreeCadTrialSnapshot> {
  const fingerprintId = await resolveFingerprintId();
  if (!fingerprintId) {
    return getLocalSnapshot(null);
  }

  const response = await postJson<ServerStatusResponse>('/api/trial/status', { fingerprintId });
  if (response.ok && response.data) {
    const snapshot = buildSnapshot({
      used: response.data.used,
      limit: response.data.limit,
      deedUsed: response.data.deedUsed,
      deedLimit: response.data.deedLimit,
      accepted: response.data.accepted === true || hasAcceptedTrialTerms(),
      termsVersion: response.data.termsVersion,
      source: 'server',
      ephemeral: response.data.ephemeral,
    });
    writeSnapshotCache(snapshot);
    writeUsage(fingerprintId, snapshot.used, snapshot.limit, snapshot.deedUsed, snapshot.deedLimit);
    return snapshot;
  }

  const cached = getCachedTrialSnapshot();
  return cached ?? getLocalSnapshot(fingerprintId);
}

export async function consumeTrialPrompt(
  options?: { kind?: 'general' | 'deed' },
): Promise<ConsumeTrialPromptResult> {
  const isDeed = options?.kind === 'deed';
  const fingerprintId = await resolveFingerprintId();
  if (!fingerprintId) {
    const snapshot = getLocalSnapshot(null);
    return { allowed: false, snapshot, reason: 'error' };
  }

  const response = await postJson<ServerStatusResponse & { allowed?: boolean; turnId?: string; expiresAt?: string }>(
    '/api/trial/consume',
    { fingerprintId, termsVersion: TRIAL_TERMS_VERSION, kind: isDeed ? 'deed' : 'general' },
  );

  if (response.data) {
    const snapshot = buildSnapshot({
      used: response.data.used,
      limit: response.data.limit,
      deedUsed: response.data.deedUsed,
      deedLimit: response.data.deedLimit,
      accepted: true,
      termsVersion: response.data.termsVersion,
      source: 'server',
      ephemeral: response.data.ephemeral,
    });
    writeSnapshotCache(snapshot);
    writeUsage(fingerprintId, snapshot.used, snapshot.limit, snapshot.deedUsed, snapshot.deedLimit);
    if (response.data.allowed === true && response.data.turnId) {
      activeTurnId = response.data.turnId;
      activeTurnExpiresAt = response.data.expiresAt ? new Date(response.data.expiresAt).getTime() : Date.now() + 10 * 60 * 1000;
      return { allowed: true, snapshot, turnId: activeTurnId };
    }
    activeTurnId = null;
    activeTurnExpiresAt = 0;
    const code = response.data.code;
    return {
      allowed: false,
      snapshot,
      reason: code === 'TRIAL_TERMS_STALE' || code === 'TRIAL_NOT_ACCEPTED'
        ? 'terms-stale'
        : code === 'TRIAL_DEED_EXHAUSTED'
          ? 'deed-limit'
          : 'exhausted',
    };
  }

  // Backend unreachable: keep the honest-user trial working locally. AI calls
  // will also be unreachable in this state, but the count stays consistent.
  const local = getLocalSnapshot(fingerprintId);
  if (local.remaining <= 0) {
    activeTurnId = null;
    activeTurnExpiresAt = 0;
    return { allowed: false, snapshot: local, reason: 'exhausted' };
  }
  if (isDeed && local.deedRemaining <= 0) {
    activeTurnId = null;
    activeTurnExpiresAt = 0;
    return { allowed: false, snapshot: local, reason: 'deed-limit' };
  }
  const nextUsed = local.used + 1;
  const nextDeedUsed = local.deedUsed + (isDeed ? 1 : 0);
  writeUsage(fingerprintId, nextUsed, local.limit, nextDeedUsed, local.deedLimit);
  const snapshot = buildSnapshot({
    used: nextUsed,
    limit: local.limit,
    deedUsed: nextDeedUsed,
    deedLimit: local.deedLimit,
    accepted: hasAcceptedTrialTerms(),
    source: 'offline',
    unverified: true,
  });
  writeSnapshotCache(snapshot);
  activeTurnId = null;
  activeTurnExpiresAt = 0;
  return { allowed: true, snapshot, reason: 'offline' };
}

export function getActiveTrialTurnId(): string | null {
  if (!activeTurnId || Date.now() > activeTurnExpiresAt) {
    activeTurnId = null;
    activeTurnExpiresAt = 0;
    return null;
  }
  return activeTurnId;
}

export function clearActiveTrialTurn(): void {
  activeTurnId = null;
  activeTurnExpiresAt = 0;
}

/** Alias used by the app shell for the boot/status refresh. */
export const getTrialSnapshot = refreshTrialStatus;

/** Clears local acceptance, usage, and cached status. */
export function clearLocalTrialState(): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(ACCEPTANCE_KEY);
    storage.removeItem(USAGE_KEY);
    storage.removeItem(CACHE_KEY);
  } catch {
    /* non-fatal */
  }
  clearActiveTrialTurn();
}
