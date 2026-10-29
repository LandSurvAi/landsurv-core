/**
 * Deed Credits (client)
 *
 * Front-end side of the free-deed allowance: 5 deeds per device, metered by the
 * backend ledger in `backend/src/routes/deeds.ts` and keyed by the device
 * fingerprint from `services/deviceFingerprint.ts`.
 *
 * Behaviour
 *   - `refreshDeedCreditStatus()` reads the authoritative count from the server
 *     and caches it for instant paint on the next visit.
 *   - `consumeFreeDeed()` spends one deed atomically on the server. When the
 *     backend is unreachable it degrades to a local counter so offline users are
 *     not blocked mid-project; those snapshots are marked `unverified`.
 *   - Callers with a LandSurv key are not metered (the server confirms this and
 *     returns `unlimited: true`).
 */

import { getDeviceFingerprint } from './deviceFingerprint.ts';

/** Fallback allowance used for display before the server responds. */
export const FREE_DEED_LIMIT = 5;

const CACHE_KEY = 'landsurv_deed_credits_v1';
const LOCAL_COUNTER_KEY = 'landsurv_deed_credits_local_v1';
const REQUEST_TIMEOUT_MS = 8000;

export type DeedCreditSource = 'server' | 'cache' | 'offline';

export interface DeedCreditSnapshot {
  limit: number;
  used: number;
  remaining: number;
  unlimited: boolean;
  source: DeedCreditSource;
  checkedAt: number;
  /** True when the figures came from the local fallback rather than the ledger. */
  unverified?: boolean;
  /** True when the backend is running its in-memory ledger (no Firestore). */
  ephemeral?: boolean;
  /** Set when the device fingerprint could not be derived (server requires one). */
  fingerprintRequired?: boolean;
}

export interface ConsumeDeedCreditOptions {
  deedName?: string | null;
  fileType?: string | null;
}

export interface ConsumeDeedCreditOutcome {
  allowed: boolean;
  snapshot: DeedCreditSnapshot;
  reason?: 'exhausted' | 'unverified-offline' | 'error';
}

interface ServerStatusResponse {
  limit?: number;
  used?: number;
  remaining?: number;
  unlimited?: boolean;
  ephemeral?: boolean;
  fingerprintRequired?: boolean;
  error?: string;
}

function safeStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function clampLimit(value: unknown, fallback = FREE_DEED_LIMIT): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.floor(num);
}

function buildSnapshot(params: {
  limit?: unknown;
  used?: unknown;
  remaining?: unknown;
  unlimited?: unknown;
  source: DeedCreditSource;
  unverified?: boolean;
  ephemeral?: boolean;
  fingerprintRequired?: boolean;
}): DeedCreditSnapshot {
  const limit = clampLimit(params.limit);
  const remainingRaw = Number(params.remaining);
  const usedRaw = Number(params.used);
  const remaining = Number.isFinite(remainingRaw)
    ? Math.max(0, Math.min(limit, Math.floor(remainingRaw)))
    : Math.max(0, limit - (Number.isFinite(usedRaw) ? Math.floor(usedRaw) : 0));
  const used = Number.isFinite(usedRaw) ? Math.max(0, Math.floor(usedRaw)) : Math.max(0, limit - remaining);

  return {
    limit,
    used,
    remaining,
    unlimited: params.unlimited === true,
    source: params.source,
    checkedAt: Date.now(),
    unverified: params.unverified,
    ephemeral: params.ephemeral,
    fingerprintRequired: params.fingerprintRequired,
  };
}

export function writeCachedDeedCreditSnapshot(snapshot: DeedCreditSnapshot): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(
      CACHE_KEY,
      JSON.stringify({
        limit: snapshot.limit,
        used: snapshot.used,
        remaining: snapshot.remaining,
        unlimited: snapshot.unlimited,
        checkedAt: snapshot.checkedAt,
        ephemeral: snapshot.ephemeral === true,
      }),
    );
  } catch {
    /* non-fatal */
  }
}

export function getCachedDeedCreditSnapshot(): DeedCreditSnapshot | null {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ServerStatusResponse & { checkedAt?: number; ephemeral?: boolean };
    if (parsed?.limit === undefined && parsed?.remaining === undefined) return null;
    return buildSnapshot({
      limit: parsed.limit,
      used: parsed.used,
      remaining: parsed.remaining,
      unlimited: parsed.unlimited,
      source: 'cache',
      ephemeral: parsed.ephemeral === true,
    });
  } catch {
    return null;
  }
}

interface LocalCounter {
  fingerprintId: string;
  used: number;
  limit: number;
}

function readLocalCounter(fingerprintId: string, limit: number): LocalCounter {
  const storage = safeStorage();
  const fallback: LocalCounter = { fingerprintId, used: 0, limit };
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(LOCAL_COUNTER_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<LocalCounter>;
    // A different fingerprint means a different device profile — start fresh.
    if (parsed?.fingerprintId !== fingerprintId) return fallback;
    return {
      fingerprintId,
      used: Number.isFinite(Number(parsed.used)) ? Math.max(0, Math.floor(Number(parsed.used))) : 0,
      limit,
    };
  } catch {
    return fallback;
  }
}

function writeLocalCounter(counter: LocalCounter): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(LOCAL_COUNTER_KEY, JSON.stringify(counter));
  } catch {
    /* non-fatal */
  }
}

/** Clears the local fallback counter (tests / support). */
export function clearLocalDeedCreditCounter(): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(LOCAL_COUNTER_KEY);
  } catch {
    /* non-fatal */
  }
}

/** Active LandSurv key, if the browser has one. Sent so the server skips metering. */
export function readStoredLandSurvKey(): string | null {
  const storage = safeStorage();
  if (!storage) return null;
  const candidates = [
    storage.getItem('landsurv_service_key'),
    storage.getItem('landsurv_user_api_key'),
  ];
  for (const candidate of candidates) {
    const key = candidate?.trim();
    if (key && key.startsWith('lsa_') && key.length >= 20) return key;
  }
  return null;
}

function apiBase(): string {
  const env = (import.meta as any)?.env;
  const configured = env?.VITE_API_URL as string | undefined;
  if (!configured) return '';
  return configured.replace(/\/api\/?$/, '');
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

async function resolveFingerprintId(): Promise<string | null> {
  try {
    const fingerprint = await getDeviceFingerprint();
    return fingerprint.id || null;
  } catch {
    return null;
  }
}

/** Authoritative status from the ledger; falls back to cache/local on failure. */
export async function refreshDeedCreditStatus(): Promise<DeedCreditSnapshot> {
  const fingerprintId = await resolveFingerprintId();
  const serviceKey = readStoredLandSurvKey();

  if (!fingerprintId) {
    const cached = getCachedDeedCreditSnapshot();
    if (cached) return cached;
    return buildSnapshot({ limit: FREE_DEED_LIMIT, used: 0, remaining: FREE_DEED_LIMIT, source: 'cache', fingerprintRequired: true });
  }

  const { ok, data } = await postJson<ServerStatusResponse>('/api/deeds/status', {
    fingerprintId,
    ...(serviceKey ? { serviceKey } : {}),
  });

  if (ok && data && !data.fingerprintRequired) {
    const snapshot = buildSnapshot({
      limit: data.limit,
      used: data.used,
      remaining: data.remaining,
      unlimited: data.unlimited,
      source: 'server',
      ephemeral: data.ephemeral === true,
    });
    writeCachedDeedCreditSnapshot(snapshot);
    if (!snapshot.unlimited) {
      writeLocalCounter({ fingerprintId, used: snapshot.used, limit: snapshot.limit });
    }
    return snapshot;
  }

  const cached = getCachedDeedCreditSnapshot();
  if (cached) return cached;

  const local = readLocalCounter(fingerprintId, FREE_DEED_LIMIT);
  return buildSnapshot({
    limit: local.limit,
    used: local.used,
    remaining: Math.max(0, local.limit - local.used),
    source: 'offline',
    unverified: true,
  });
}

/**
 * Spend one free deed. Returns `allowed: false` with the current snapshot when
 * the device is out of deeds.
 */
export async function consumeFreeDeed(options: ConsumeDeedCreditOptions = {}): Promise<ConsumeDeedCreditOutcome> {
  const fingerprintId = await resolveFingerprintId();
  const serviceKey = readStoredLandSurvKey();

  if (!fingerprintId) {
    const snapshot = buildSnapshot({
      limit: FREE_DEED_LIMIT,
      used: 0,
      remaining: FREE_DEED_LIMIT,
      source: 'offline',
      unverified: true,
      fingerprintRequired: true,
    });
    return { allowed: true, snapshot, reason: 'unverified-offline' };
  }

  const { ok, status, data } = await postJson<ServerStatusResponse & { allowed?: boolean; reason?: string }>(
    '/api/deeds/consume',
    {
      fingerprintId,
      deedName: options.deedName ?? null,
      fileType: options.fileType ?? null,
      ...(serviceKey ? { serviceKey } : {}),
    },
  );

  if (data && (ok || status === 429)) {
    const snapshot = buildSnapshot({
      limit: data.limit,
      used: data.used,
      remaining: data.remaining,
      unlimited: data.unlimited,
      source: 'server',
      ephemeral: data.ephemeral === true,
    });
    writeCachedDeedCreditSnapshot(snapshot);
    if (!snapshot.unlimited && !snapshot.fingerprintRequired) {
      writeLocalCounter({ fingerprintId, used: snapshot.used, limit: snapshot.limit });
    }
    return {
      allowed: data.allowed === true || data.unlimited === true,
      snapshot,
      reason: data.allowed === true || data.unlimited === true ? undefined : 'exhausted',
    };
  }

  // Backend unreachable — keep the user working, but meter locally so the
  // allowance still ends after five deeds on this device.
  const fallbackLimit = getCachedDeedCreditSnapshot()?.limit ?? FREE_DEED_LIMIT;
  const local = readLocalCounter(fingerprintId, fallbackLimit);

  if (local.used >= local.limit) {
    const snapshot = buildSnapshot({
      limit: local.limit,
      used: local.used,
      remaining: 0,
      source: 'offline',
      unverified: true,
    });
    return { allowed: false, snapshot, reason: 'exhausted' };
  }

  const next: LocalCounter = { ...local, used: local.used + 1 };
  writeLocalCounter(next);
  const snapshot = buildSnapshot({
    limit: next.limit,
    used: next.used,
    remaining: Math.max(0, next.limit - next.used),
    source: 'offline',
    unverified: true,
  });
  writeCachedDeedCreditSnapshot(snapshot);
  return { allowed: true, snapshot, reason: 'unverified-offline' };
}

/** Short label used in the badge and welcome card. */
export function formatDeedCreditLabel(snapshot: Pick<DeedCreditSnapshot, 'remaining' | 'limit' | 'unlimited'> | null): string {
  if (!snapshot) return `${FREE_DEED_LIMIT} free deeds available`;
  if (snapshot.unlimited) return 'Unlimited deeds with your key';
  const remaining = Math.max(0, snapshot.remaining);
  if (remaining === 0) return 'No free deeds remaining';
  return `${remaining} of ${snapshot.limit} free deed${snapshot.limit === 1 ? '' : 's'} remaining`;
}
