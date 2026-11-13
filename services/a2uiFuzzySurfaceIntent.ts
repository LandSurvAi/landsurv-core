/**
 * Free fuzzy baseline for the A2UI decision pilot.
 *
 * This is deliberately local, dependency-free, and not wired into the UI. It
 * exists to answer one question before paying for Decision 1: how much of the
 * regex miss rate can a simple synonym/overlap matcher recover? The benchmark
 * compares regex, this baseline, and Decision 1 on the same golden set.
 */

import {
  A2UI_DECISION_CATALOG,
  type A2UIDecisionCatalogEntry,
} from './a2uiDecisionCatalog.ts';

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'do', 'does', 'for',
  'from', 'how', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'please',
  'show', 'the', 'to', 'up', 'what', 'where', 'with', 'you',
]);

export interface FuzzySurfaceMatch {
  entry: A2UIDecisionCatalogEntry;
  score: number;
  runnerUpScore: number;
}

export function normalizeDecisionText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(text: string): Set<string> {
  const tokens = normalizeDecisionText(text).split(' ').filter(Boolean);
  return new Set(tokens.filter(token => token.length > 1 && !STOP_WORDS.has(token)));
}

function overlapScore(queryTokens: Set<string>, candidateTokens: Set<string>): number {
  if (queryTokens.size === 0 || candidateTokens.size === 0) return 0;
  let hits = 0;
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) hits += 1;
  }
  return hits / Math.sqrt(queryTokens.size * candidateTokens.size);
}

export function scoreCatalogEntry(query: string, entry: A2UIDecisionCatalogEntry): number {
  const normalized = normalizeDecisionText(query);
  if (!normalized) return 0;

  let score = 0;

  for (const example of entry.examples) {
    const normalizedExample = normalizeDecisionText(example);
    if (normalizedExample && normalized.includes(normalizedExample)) score += 3.5;
  }

  for (const keyword of entry.keywords) {
    const normalizedKeyword = normalizeDecisionText(keyword);
    if (normalizedKeyword && normalized.includes(normalizedKeyword)) score += 2.5;
  }

  const queryTokens = tokenSet(query);
  const entryTokens = tokenSet(
    [entry.label, entry.description, ...entry.examples, ...entry.keywords].join(' '),
  );
  score += overlapScore(queryTokens, entryTokens) * 3;

  return score;
}

/**
 * Returns a match only when the best candidate is clearly ahead of the
 * runner-up. Ambiguous queries return null, which is the honest outcome for a
 * free baseline and mirrors the clarification policy.
 */
export function resolveFuzzySurfaceIntent(query: string): FuzzySurfaceMatch | null {
  const trimmed = query.trim();
  if (trimmed.length < 6) return null;

  const scored = A2UI_DECISION_CATALOG
    .map(entry => ({ entry, score: scoreCatalogEntry(trimmed, entry) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const runnerUp = scored[1];
  if (!best || best.score < 3.5) return null;
  if (runnerUp && best.score - runnerUp.score < 0.75) return null;

  return {
    entry: best.entry,
    score: Number(best.score.toFixed(3)),
    runnerUpScore: Number((runnerUp?.score ?? 0).toFixed(3)),
  };
}
