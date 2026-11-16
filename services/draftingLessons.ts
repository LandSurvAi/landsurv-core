/**
 * Approved Civil Drafter lessons from SurveyBrain.
 *
 * This endpoint returns text only. The annotated source images stay private in
 * the DevOps review surface and in the offline training export.
 *
 * Retrieval sits on the pre-model critical path. A slow or unavailable RAG must
 * never hold a draw request open: lookups get a short deadline and a cooldown
 * after a failure, and their state is published to the draft diagnostics.
 */

import { civilDrafterDiagnostics } from './civilDrafterDiagnostics.ts';

export interface DraftingLessonHit {
  id: number | string;
  lesson_id: string;
  chunk_index: number;
  content: string;
  metadata: Record<string, unknown> | null;
  title: string;
  task: string;
  intent: string;
  image_available: boolean;
  score: number;
}

interface LessonContextResponse {
  query: string;
  limit: number;
  hits: DraftingLessonHit[];
}

interface CacheEntry {
  expiresAt: number;
  hits: DraftingLessonHit[];
}

export interface DraftingLessonsStatus {
  state: 'idle' | 'ok' | 'unavailable';
  lastAttemptAt: number | null;
  lastLatencyMs: number | null;
  lastHitCount: number;
  lastError: string | null;
}

const CACHE_TTL_MS = 2 * 60 * 1000;
const CACHE_MAX_ENTRIES = 24;
const DEFAULT_TIMEOUT_MS = 2_500;
/** Skip retrieval entirely for this long after a failure. */
const FAILURE_COOLDOWN_MS = 60_000;
const cache = new Map<string, CacheEntry>();

let unavailableUntil = 0;
let status: DraftingLessonsStatus = {
  state: 'idle',
  lastAttemptAt: null,
  lastLatencyMs: null,
  lastHitCount: 0,
  lastError: null,
};

const MAX_CONTEXT_CHARS = 5_000;

export function clearDraftingLessonCache(): void {
  cache.clear();
}

export function resetDraftingLessonsStatus(): void {
  unavailableUntil = 0;
  status = {
    state: 'idle',
    lastAttemptAt: null,
    lastLatencyMs: null,
    lastHitCount: 0,
    lastError: null,
  };
}

export function getDraftingLessonsStatus(): DraftingLessonsStatus {
  return status;
}

function publishRag(
  state: 'ok' | 'unavailable' | 'skipped',
  hitCount: number,
  latencyMs: number,
  error?: string,
): void {
  civilDrafterDiagnostics.recordRag({
    status: state,
    hitCount,
    latencyMs,
    ...(error ? { error } : {}),
  });
}

function isLessonHit(value: unknown): value is DraftingLessonHit {
  if (!value || typeof value !== 'object') return false;
  const hit = value as Record<string, unknown>;
  return (
    typeof hit.lesson_id === 'string'
    && typeof hit.title === 'string'
    && typeof hit.content === 'string'
    && typeof hit.score === 'number'
  );
}

export async function fetchDraftingLessons(
  query: string,
  options: {
    limit?: number;
    signal?: AbortSignal;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<DraftingLessonHit[]> {
  const text = (query ?? '').trim().slice(0, 2000);
  if (text.length < 2) return [];
  const limit = Math.max(1, Math.min(8, Math.floor(options.limit ?? 4)));
  const cacheKey = `${limit}:${text.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    publishRag('ok', cached.hits.length, 0);
    return cached.hits;
  }

  // A recent failure means the backend is likely slow/down. Return immediately
  // rather than adding another multi-second wait to every draw request.
  if (Date.now() < unavailableUntil) {
    publishRag('unavailable', 0, 0, status.lastError ?? 'retrieval cooldown active');
    return [];
  }

  const startedAt = Date.now();
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = Math.max(250, Math.min(8_000, Math.round(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)));
  try {
    const response = await fetchImpl('/api/rag/lessons/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: text, limit }),
      signal: options.signal ?? AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`Drafting lesson lookup failed with HTTP ${response.status}`);
    }
    const payload = await response.json() as LessonContextResponse;
    const hits = Array.isArray(payload?.hits) ? payload.hits.filter(isLessonHit) : [];
    const latencyMs = Date.now() - startedAt;

    if (cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value as string | undefined;
      if (oldest) cache.delete(oldest);
    }
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, hits });
    unavailableUntil = 0;
    status = {
      state: 'ok',
      lastAttemptAt: Date.now(),
      lastLatencyMs: latencyMs,
      lastHitCount: hits.length,
      lastError: null,
    };
    publishRag('ok', hits.length, latencyMs);
    return hits;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    unavailableUntil = Date.now() + FAILURE_COOLDOWN_MS;
    status = {
      state: 'unavailable',
      lastAttemptAt: Date.now(),
      lastLatencyMs: Date.now() - startedAt,
      lastHitCount: 0,
      lastError: message,
    };
    publishRag('unavailable', 0, Date.now() - startedAt, message);
    throw error;
  }
}

/**
 * Format only enough reviewed guidance to fit the drafting turn.  Keep the
 * authority boundary explicit: these are internal lessons, not code citations.
 */
export function buildDraftingLessonsContext(
  hits: DraftingLessonHit[],
  maxChars = MAX_CONTEXT_CHARS,
): string {
  if (!Array.isArray(hits) || hits.length === 0) return '';
  const lessons = new Map<string, DraftingLessonHit>();
  for (const hit of [...hits].sort((a, b) => b.score - a.score)) {
    if (!hit?.lesson_id || !hit.content?.trim()) continue;
    if (!lessons.has(hit.lesson_id)) lessons.set(hit.lesson_id, hit);
  }
  if (lessons.size === 0) return '';

  const header = [
    '---BEGIN APPROVED CIVIL DRAFTER LESSONS---',
    'Operator-reviewed internal guidance, not a published agency standard. Apply it to the requested drafting task. Project evidence and explicit user instructions override a lesson when they conflict. Do not mention this retrieval unless it is materially useful.',
    '',
  ].join('\n');
  let body = '';
  for (const lesson of lessons.values()) {
    const task = String(lesson.task || 'drafting.general');
    const title = String(lesson.title || 'Drafting lesson');
    const intent = String(lesson.intent || '').trim();
    const section = [
      `### ${title}`,
      `Task: ${task}`,
      ...(intent ? [`When: ${intent}`] : []),
      lesson.content.trim(),
      '',
    ].join('\n');
    if (body.length + section.length > maxChars) continue;
    body += section;
  }
  if (!body.trim()) return '';
  return `${header}${body}---END APPROVED CIVIL DRAFTER LESSONS---\n\n`;
}
