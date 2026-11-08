/**
 * CACP ↔ A2UI Surface Bridge
 *
 * Watches the CACP activity log and raises a review surface when inter-agent
 * traffic needs a human decision: blocked sends, policy warnings, errors,
 * no-handler broadcasts, and `cacp:offer` negotiations.
 *
 * The bridge is intentionally conservative:
 *   - It only looks at NEW log entries after it starts.
 *   - Informational traffic is batched inside a short debounce window.
 *   - Opening is entirely opt-in through `shouldOpen` (wired to the user's
 *     `settings.a2ui.autoOpenCacpReview` preference).
 *   - Re-dispatch always goes back through `interAgentComm`, so ownership,
 *     schema, and rate policy are evaluated again. A2UI never bypasses CACP.
 */

import type { A2UICacpReviewContext, A2UICacpReviewItem } from '../types.ts';
import { AgentType } from '../types.ts';
import { interAgentComm, type CacpLogEntry } from './InterAgentCommunication.ts';

function entryId(entry: CacpLogEntry): string {
  return `${entry.messageId}:${entry.phase}:${entry.seq}`;
}

function summaryFor(entry: CacpLogEntry): string {
  switch (entry.phase) {
    case 'send':
      return entry.policyStatus === 'blocked'
        ? `Send blocked by CACP policy for ${entry.command}`
        : `Sent ${entry.command} to ${entry.to}`;
    case 'handler':
      return `Handler invoked for ${entry.command}`;
    case 'response':
      return entry.success === false
        ? `Peer returned a failure for ${entry.command}`
        : `Peer completed ${entry.command}`;
    case 'error':
      return entry.error || `Error while dispatching ${entry.command}`;
    case 'no-handler':
      return `No handler registered for ${entry.command}`;
    default:
      return entry.command;
  }
}

export function toCacpReviewItem(entry: CacpLogEntry): A2UICacpReviewItem {
  return {
    id: entryId(entry),
    command: entry.command,
    from: String(entry.from),
    to: String(entry.to),
    phase: entry.phase,
    summary: summaryFor(entry),
    preview: entry.preview,
    timestamp: entry.timestamp,
    policyStatus: entry.policyStatus,
    policyWarnings: entry.policyWarnings,
    traceId: entry.traceId,
    success: entry.success,
    latencyMs: entry.latencyMs,
    data: entry.data,
  };
}

/** Traffic worth interrupting the user for. */
export function isNotableCacpEntry(entry: CacpLogEntry): boolean {
  return (
    entry.policyStatus === 'blocked' ||
    entry.policyStatus === 'warn' ||
    entry.phase === 'error' ||
    entry.phase === 'no-handler' ||
    entry.command === 'cacp:offer'
  );
}

/**
 * Build a review context from log entries. Highest-signal entries come first
 * (blocked, then errors, then warnings/offers), with a stable newest-first tie
 * break so the surface stays useful when traffic is noisy.
 */
export function buildCacpReviewContext(
  entries: CacpLogEntry[],
  limit = 20,
): A2UICacpReviewContext {
  const score = (entry: CacpLogEntry): number => {
    if (entry.policyStatus === 'blocked') return 0;
    if (entry.phase === 'error') return 1;
    if (entry.policyStatus === 'warn') return 2;
    if (entry.phase === 'no-handler') return 3;
    if (entry.command === 'cacp:offer') return 4;
    return 5;
  };

  const seen = new Set<string>();
  const items = [...entries]
    .sort((a, b) => {
      const delta = score(a) - score(b);
      if (delta !== 0) return delta;
      return b.timestamp - a.timestamp;
    })
    .filter(entry => {
      const id = entryId(entry);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, Math.max(1, limit))
    .map(toCacpReviewItem);

  const focus = items.find(item => item.policyStatus === 'blocked') ?? items[0];

  return {
    items,
    title:
      items.length === 1
        ? 'One CACP event needs attention.'
        : `${items.length} CACP events need attention.`,
    focusTraceId: focus?.traceId,
  };
}

export interface CacpSurfaceBridgeOptions {
  /** Called with a batched review context. */
  onOpen: (context: A2UICacpReviewContext) => void;
  /** Return false to suppress opening (e.g. the preference is off). */
  shouldOpen?: () => boolean;
  /** Batching window for bursts of traffic. Default: 150ms. */
  debounceMs?: number;
  /** Cap per batch. Default: 20. */
  limit?: number;
}

/**
 * Start watching CACP traffic. Returns an unsubscribe function. Only entries
 * appended after startup are considered, so opening the bridge never replays
 * historical log data.
 */
export function startCacpSurfaceBridge({
  onOpen,
  shouldOpen,
  debounceMs = 150,
  limit = 20,
}: CacpSurfaceBridgeOptions): () => void {
  if (typeof window === 'undefined') return () => {};

  const initial = interAgentComm.getLog();
  let lastSeq = initial.length > 0 ? initial[initial.length - 1].seq : 0;
  let pending: CacpLogEntry[] = [];
  let timer: number | null = null;

  const flush = () => {
    timer = null;
    if (pending.length === 0) return;
    const batch = pending;
    pending = [];
    if (shouldOpen && !shouldOpen()) return;
    onOpen(buildCacpReviewContext(batch, limit));
  };

  const unsubscribe = interAgentComm.onLog(entries => {
    const fresh = entries.filter(entry => entry.seq > lastSeq);
    if (fresh.length === 0) return;
    lastSeq = fresh[fresh.length - 1].seq;

    const notable = fresh.filter(isNotableCacpEntry);
    if (notable.length === 0) return;

    pending = [...pending, ...notable].slice(-limit);
    if (timer !== null) return;
    timer = window.setTimeout(flush, debounceMs);
  });

  return () => {
    unsubscribe();
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    pending = [];
  };
}

/**
 * Re-dispatch the original message behind a review item. Policy is evaluated
 * again by the bus, so a blocked command stays blocked unless the underlying
 * cause is fixed.
 */
export async function retryCacpReviewItem(item: A2UICacpReviewItem) {
  if (item.from === 'system') {
    throw new Error('Cannot re-dispatch a system-originated CACP event.');
  }
  const to = item.to === 'broadcast' ? 'broadcast' : (item.to as AgentType);
  const data =
    item.data && typeof item.data === 'object' && !Array.isArray(item.data)
      ? (item.data as Record<string, unknown>)
      : {};

  return interAgentComm.sendMessage(item.from as AgentType, to, item.command, data, {
    context: 'Re-dispatched from the CACP review surface',
    traceId: item.traceId,
  });
}
