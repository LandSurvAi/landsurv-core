import type { SurveyPoint } from '../types.ts';

/**
 * Lightweight spatial index for survey points.
 *
 * Point snapping / hover hit-testing used to project every point on every
 * mouse move. That is O(n) per move with a `worldToScreen` call (and object
 * allocation) per point, which is the main source of lag with point clouds in
 * the thousands. Points are sorted by easting once, so a nearest query only
 * scans the narrow easting band around the cursor.
 */
export interface PointSpatialIndex {
  /** Points with finite coordinates, sorted by easting. */
  readonly points: readonly SurveyPoint[];
  /** Easting of each point, aligned with `points`, for binary search. */
  readonly eastings: Float64Array;
}

export function buildPointSpatialIndex(points: readonly SurveyPoint[]): PointSpatialIndex {
  const valid: SurveyPoint[] = [];
  for (const point of points) {
    if (!point) continue;
    if (!Number.isFinite(point.easting) || !Number.isFinite(point.northing)) continue;
    valid.push(point);
  }
  valid.sort((a, b) => a.easting - b.easting || a.northing - b.northing);

  const eastings = new Float64Array(valid.length);
  for (let i = 0; i < valid.length; i++) {
    eastings[i] = valid[i].easting;
  }
  return { points: valid, eastings };
}

function lowerBound(values: Float64Array, target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (values[mid] < target) low = mid + 1;
    else high = mid;
  }
  return low;
}

function upperBound(values: Float64Array, target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (values[mid] <= target) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * Nearest non-hidden point within `maxDistance` world units.
 *
 * Screen distance and world distance differ by the canvas scale only
 * (uniform scale + rotation), so callers can pass `thresholdPx / scale`
 * and get exactly the same result as a screen-space nearest search.
 */
export function findNearestPointInWorld(
  index: PointSpatialIndex,
  easting: number,
  northing: number,
  maxDistance: number,
): SurveyPoint | null {
  if (!Number.isFinite(easting) || !Number.isFinite(northing)) return null;
  if (!Number.isFinite(maxDistance) || maxDistance < 0) return null;
  if (index.points.length === 0) return null;

  const low = lowerBound(index.eastings, easting - maxDistance);
  const high = upperBound(index.eastings, easting + maxDistance);
  let best: SurveyPoint | null = null;
  let bestDistanceSq = maxDistance * maxDistance;

  for (let i = low; i < high; i++) {
    const point = index.points[i];
    if (point.hidden) continue;
    const dx = point.easting - easting;
    const dy = point.northing - northing;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      best = point;
    }
  }
  return best;
}

// ── Cache ────────────────────────────────────────────────────────────────
// The index is rebuilt only when point geometry/identity actually changes.
// Label-offset drags produce a new points array every pointer move, but the
// positions are unchanged, so a cheap signature lets those reuse the index.

const signatureFloat = new Float64Array(1);
const signatureInts = new Int32Array(signatureFloat.buffer);

function hashNumber(hash: number, value: number): number {
  signatureFloat[0] = Number.isFinite(value) ? value : Number.NaN;
  hash = Math.imul(hash ^ signatureInts[0], 16777619);
  hash = Math.imul(hash ^ signatureInts[1], 16777619);
  return hash;
}

function hashText(hash: number, text: string | undefined): number {
  if (!text) return Math.imul(hash ^ 0x9e3779b9, 16777619);
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  }
  return hash;
}

function computePointSignature(points: readonly SurveyPoint[]): number {
  let hash = Math.imul(points.length ^ 0x811c9dc5, 16777619);
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    hash = hashNumber(hash, point.easting);
    hash = hashNumber(hash, point.northing);
    hash = hashNumber(hash, point.elevation ?? Number.NaN);
    hash = hashText(hash, point.pointNumber);
    hash = hashText(hash, point.description);
    hash = hashText(hash, point.layer);
    hash = Math.imul(hash ^ (point.hidden ? 1 : 0), 16777619);
  }
  return hash >>> 0;
}

let cachedPoints: readonly SurveyPoint[] | null = null;
let cachedSignature = -1;
let cachedIndex: PointSpatialIndex | null = null;

/** Module-level cached index; safe for the single-canvas hit-testing path. */
export function getPointSpatialIndex(points: readonly SurveyPoint[]): PointSpatialIndex {
  if (cachedPoints === points && cachedIndex) return cachedIndex;

  const signature = computePointSignature(points);
  if (cachedIndex && signature === cachedSignature) {
    cachedPoints = points;
    return cachedIndex;
  }

  const index = buildPointSpatialIndex(points);
  cachedPoints = points;
  cachedSignature = signature;
  cachedIndex = index;
  return index;
}
