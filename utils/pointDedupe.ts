/**
 * Point Import Dedupe
 *
 * Point numbers are the identity of a survey point across the app, so imports
 * must not add a point number that is already on the canvas or that appears
 * twice in the same incoming batch. Comparison is trimmed and case-insensitive
 * so " p100 " in one file and "P100" in another are treated as the same point.
 */

import { SurveyPoint } from '../types.ts';

export interface PointDedupeResult {
  /** Points safe to add, preserving their incoming order. */
  accepted: SurveyPoint[];
  /** Points that were dropped because their point number already existed. */
  skipped: SurveyPoint[];
}

export function normalizePointNumber(pointNumber: string | null | undefined): string {
  return String(pointNumber ?? '').trim().toUpperCase();
}

/**
 * Filters incoming points against points that are already loaded and against
 * earlier points in the same batch. A point with a blank point number is kept
 * (it cannot collide by number).
 */
export function dedupeIncomingPoints(
  incoming: readonly SurveyPoint[],
  existing: readonly SurveyPoint[],
): PointDedupeResult {
  const seen = new Set<string>();
  for (const point of existing) {
    const key = normalizePointNumber(point.pointNumber);
    if (key) seen.add(key);
  }

  const accepted: SurveyPoint[] = [];
  const skipped: SurveyPoint[] = [];

  for (const point of incoming) {
    const key = normalizePointNumber(point.pointNumber);
    if (key && seen.has(key)) {
      skipped.push(point);
      continue;
    }
    if (key) seen.add(key);
    accepted.push(point);
  }

  return { accepted, skipped };
}
