/**
 * projectionIntent — deterministic routing for CRS requests.
 *
 * "Set my projection from the point clusters" should change the setting, not
 * just return a recommendation. This module classifies the request and pulls
 * an explicit EPSG or named State Plane zone when the user supplied one.
 */

import { projectionFromText, projectionSettingForEpsg } from '../utils/projectionRecommendation.ts';

export type ProjectionIntentKind = 'set' | 'recommend' | 'open';

export interface ProjectionIntent {
  kind: ProjectionIntentKind;
  /** Explicit EPSG code named in the request, when present. */
  epsg?: number;
  /** Derive the CRS from the device GPS fix instead of the point clusters. */
  useGps?: boolean;
}

const PROJECTION_RE =
  /\b(?:projection|coordinate\s+system|state\s+plane|crs|epsg|datum)\b/i;
const OPEN_RE = /\b(?:open|show|controls?|settings?|panel|dialog)\b/i;
const SET_RE =
  /\b(?:set|apply|change|switch|use|update|fix|correct|make)\b/i;
const RECOMMEND_RE =
  /\b(?:what|which|recommend|suggest|should|best|right)\b/i;
const GPS_RE =
  /\b(?:gps|gnss|my\s+location|current\s+location|device\s+location)\b/i;

export function detectProjectionIntent(text: string): ProjectionIntent | null {
  const trimmed = String(text ?? '').trim();
  if (!trimmed || !PROJECTION_RE.test(trimmed)) return null;

  if (OPEN_RE.test(trimmed) && !SET_RE.test(trimmed)) {
    return { kind: 'open' };
  }

  const named = projectionFromText(trimmed);
  if (named?.projection.epsg) {
    return { kind: 'set', epsg: named.projection.epsg };
  }

  const explicitEpsg = /\bepsg\s*:?\s*([2-9]\d{3,4})\b/i.exec(trimmed);
  if (explicitEpsg) {
    return { kind: 'set', epsg: Number(explicitEpsg[1]) };
  }

  if (RECOMMEND_RE.test(trimmed)) return { kind: 'recommend' };
  if (SET_RE.test(trimmed)) {
    return GPS_RE.test(trimmed) ? { kind: 'set', useGps: true } : { kind: 'set' };
  }
  return { kind: 'recommend' };
}

/** Resolve a built-in zone for a quick-thought label. */
export function isKnownProjectionEpsg(epsg: number): boolean {
  return projectionSettingForEpsg(epsg) !== null;
}
