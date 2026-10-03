/**
 * buildingRectifier (v26.05.31) — deterministic, client-side rectification
 * engine for the Structures Agent.
 *
 * Inputs (any combination of):
 *   - Survey BLDG corner points (partial: 1, 2, 3, 4+ corners per building)
 *   - OSM building footprints (real polygons, but may be slightly displaced)
 *   - FEMA NSI centroids w/ sqft_ft + num_story attribute hints
 *
 * Pipeline (each pass consumes its inputs so later passes never double-count):
 *
 *   PASS 1 — OSM + BLDG snap (HIGH confidence)
 *     For each OSM polygon, find the BLDG cluster whose points lie inside or
 *     within 5 ft. Pair each BLDG point to its nearest OSM vertex (greedy,
 *     within tolerance). With ≥2 pairs, run a 2D Helmert (rotation +
 *     translation, no scale) — pure rigid-body fit that preserves the OSM
 *     geometry. With 1 pair, translate only.
 *
 *   PASS 2 — OSM unmatched (MEDIUM)
 *     Emit OSM polygons that had no BLDG cluster as-is. They are still real
 *     observed geometry — better than synthesizing rectangles from a centroid.
 *
 *   PASS 3 — BLDG-only COGO (HIGH for 3+, MEDIUM for 1–2)
 *     For BLDG clusters with no OSM match, synthesise a closed rectangle:
 *       • 1 pt  → square centered on point, side √(nsi.sqft or default 900 sqft).
 *       • 2 pts → AB as one edge; perpendicular side from nsi.sqft / |AB|
 *                 (else square). Default orientation: extrude AB to the side
 *                 that includes the nearest NSI centroid, else to the left.
 *       • 3 pts → identify the corner with interior angle nearest 90°; force
 *                 to exactly 90°; complete the parallelogram (4th = corner +
 *                 edgeA + edgeB).
 *       • ≥4 pts → minimum-area enclosing rectangle (rotating calipers).
 *
 *   PASS 4 — NSI-only fallback (LOW)
 *     For NSI centroids unconsumed by passes 1 & 3, drop a square footprint
 *     of side √sqft_ft, oriented to the street grid (if provided) else N.
 *
 * Output: closed polygons as SurveyLine[] on the STRUCTURES layer with a
 * shared polylineId per building, plus a stats/confidence breakdown.
 *
 * All geometry is in PROJECT coordinates (easting/northing). The caller is
 * responsible for reprojecting OSM/NSI to project EPSG first. The single
 * conversion knob is `unitsPerFoot` — used to convert NSI's sqft_ft into
 * project-unit side lengths (1.0 for foot-based EPSG, 0.3048 for meters).
 */

import type { SurveyLine, SurveyPoint } from '../types.ts';
import type { BuildingFootprint } from './osmBuildingsService.ts';
import type { NsiStructureProps } from './structuresService.ts';

// ───────────────────────────────────────────────────────────────────────────
// Public types
// ───────────────────────────────────────────────────────────────────────────

export type RectifyConfidence = 'high' | 'medium' | 'low';
export type RectifySource =
  | 'osm-bldg-snap'   // OSM polygon, Helmert-snapped to BLDG corners
  | 'osm-asis'        // OSM polygon, no BLDG cluster nearby
  | 'cogo-bldg-mer'   // ≥4 BLDG corners → minimum enclosing rectangle
  | 'cogo-bldg-3'     // 3 BLDG corners → parallelogram completion
  | 'cogo-bldg-2'     // 2 BLDG corners → perpendicular extrusion
  | 'cogo-bldg-1'     // 1 BLDG corner → centered square
  | 'nsi-only';       // NSI centroid + sqft only

export interface RectifyOptions {
  /** Output layer for the closed polygons (default 'STRUCTURES'). */
  layer?: string;
  /** Project units per foot. 1 for ft-based EPSG, 0.3048 for meters. */
  unitsPerFoot?: number;
  /** Dominant street-grid bearing in radians (CCW from +x/east). When
   *  omitted, COGO/NSI fallbacks orient to project north. */
  streetBearingRad?: number;
  /** Max distance (project units) between two BLDG points to belong to the
   *  same cluster. Defaults to 75 * unitsPerFoot. */
  clusterToleranceUnits?: number;
  /** Snap tolerance (project units) for pairing BLDG points to OSM vertices.
   *  Defaults to max(5 * unitsPerFoot, edgeLength * 0.25, capped at 25 ft). */
  vertexSnapToleranceUnits?: number;
  /** Default rectangle side (project units) when no size hint is available. */
  defaultBuildingSideUnits?: number;
  /** Skip OSM polygons smaller than this (sq project units). Default 200. */
  minOsmAreaSqUnits?: number;
}

export interface RectifiedBuilding {
  id: string;
  /** Closed ring (open form — first != last). Wound CCW. */
  ring: Pt[];
  /** Source pipeline. */
  source: RectifySource;
  /** Confidence. */
  confidence: RectifyConfidence;
  /** Survey BLDG point numbers that influenced this footprint. */
  bldgPointNumbers: string[];
  /** Joined NSI attributes (if any) — for downstream attribute display. */
  nsi?: NsiStructureProps & { matchedCount?: number; pointNumbers?: string[] };
  /** Polygon area in project units². */
  area: number;
  /** Human-readable rectification note (telemetry, fieldbook). */
  note: string;
}

export interface RectifyStats {
  osmSnapped: number;
  osmAsIs: number;
  cogoMer: number;
  cogo3: number;
  cogo2: number;
  cogo1: number;
  nsiOnly: number;
  bldgClustersIn: number;
  osmIn: number;
  nsiIn: number;
  warnings: string[];
}

export interface RectifyResult {
  buildings: RectifiedBuilding[];
  /** Closed SurveyLine[] ready to merge into App.tsx `lines` state. */
  lines: SurveyLine[];
  stats: RectifyStats;
}

// ───────────────────────────────────────────────────────────────────────────
// Geometry primitives (kept local; no dep on the rest of the app)
// ───────────────────────────────────────────────────────────────────────────

type Pt = { x: number; y: number };

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const dist2 = (a: Pt, b: Pt) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

function shoelaceArea(ring: Pt[]): number {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) * 0.5;
}

function ringCentroid(ring: Pt[]): Pt {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
    a += f;
  }
  if (Math.abs(a) < 1e-9) {
    const m = ring.reduce((s, r) => ({ x: s.x + r.x, y: s.y + r.y }), { x: 0, y: 0 });
    return { x: m.x / ring.length, y: m.y / ring.length };
  }
  a *= 0.5;
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

function pointInPolygon(p: Pt, ring: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x, yi = ring[i].y, xj = ring[j].x, yj = ring[j].y;
    const intersect = ((yi > p.y) !== (yj > p.y)) && (p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-12) + xi);
    if (intersect) hit = !hit;
  }
  return hit;
}

function ringBBox(ring: Pt[]): { xmin: number; ymin: number; xmax: number; ymax: number } {
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (const v of ring) {
    if (v.x < xmin) xmin = v.x; if (v.y < ymin) ymin = v.y;
    if (v.x > xmax) xmax = v.x; if (v.y > ymax) ymax = v.y;
  }
  return { xmin, ymin, xmax, ymax };
}

function minEdgeLen(ring: Pt[]): number {
  let m = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const d = dist(ring[i], ring[(i + 1) % ring.length]);
    if (d > 0 && d < m) m = d;
  }
  return isFinite(m) ? m : 0;
}

/** 2D rigid-body Helmert (rotation + translation, no scale). */
function solveHelmert(pairs: Array<{ src: Pt; tgt: Pt }>): { rot: number; tx: number; ty: number } {
  if (pairs.length === 0) return { rot: 0, tx: 0, ty: 0 };
  if (pairs.length === 1) return { rot: 0, tx: pairs[0].tgt.x - pairs[0].src.x, ty: pairs[0].tgt.y - pairs[0].src.y };
  const n = pairs.length;
  const msx = pairs.reduce((s, p) => s + p.src.x, 0) / n;
  const msy = pairs.reduce((s, p) => s + p.src.y, 0) / n;
  const mtx = pairs.reduce((s, p) => s + p.tgt.x, 0) / n;
  const mty = pairs.reduce((s, p) => s + p.tgt.y, 0) / n;
  let sumCross = 0, sumDot = 0;
  for (const { src, tgt } of pairs) {
    const sx = src.x - msx, sy = src.y - msy;
    const tx = tgt.x - mtx, ty = tgt.y - mty;
    sumCross += sx * ty - sy * tx;
    sumDot   += sx * tx + sy * ty;
  }
  const rot = Math.atan2(sumCross, sumDot);
  const c = Math.cos(rot), s = Math.sin(rot);
  return { rot, tx: mtx - (c * msx - s * msy), ty: mty - (s * msx + c * msy) };
}

function applyHelmert(p: Pt, t: { rot: number; tx: number; ty: number }): Pt {
  const c = Math.cos(t.rot), s = Math.sin(t.rot);
  return { x: c * p.x - s * p.y + t.tx, y: s * p.x + c * p.y + t.ty };
}

/** Convex hull (Andrew's monotone chain). Returns CCW open ring. */
function convexHull(pts: Pt[]): Pt[] {
  if (pts.length < 3) return pts.slice();
  const ps = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: Pt[] = [];
  for (const p of ps) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop();
    lo.push(p);
  }
  const up: Pt[] = [];
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop();
    up.push(p);
  }
  lo.pop(); up.pop();
  return lo.concat(up);
}

/** Minimum-area enclosing rectangle via rotating calipers on convex hull. */
function minAreaRectangle(pts: Pt[]): Pt[] {
  const hull = convexHull(pts);
  if (hull.length < 2) {
    // Degenerate — return a tiny square around the single point.
    const p = pts[0] ?? { x: 0, y: 0 };
    return [
      { x: p.x - 1, y: p.y - 1 },
      { x: p.x + 1, y: p.y - 1 },
      { x: p.x + 1, y: p.y + 1 },
      { x: p.x - 1, y: p.y + 1 },
    ];
  }
  let best: { area: number; rect: Pt[] } | null = null;
  const n = hull.length;
  for (let i = 0; i < n; i++) {
    const a = hull[i], b = hull[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    const ux = dx / len, uy = dy / len;       // edge direction (axis u)
    const vx = -uy,       vy = ux;            // perpendicular (axis v)
    let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
    for (const h of hull) {
      const pu = (h.x - a.x) * ux + (h.y - a.y) * uy;
      const pv = (h.x - a.x) * vx + (h.y - a.y) * vy;
      if (pu < umin) umin = pu; if (pu > umax) umax = pu;
      if (pv < vmin) vmin = pv; if (pv > vmax) vmax = pv;
    }
    const w = umax - umin, h = vmax - vmin, area = w * h;
    if (!best || area < best.area) {
      const corners: Pt[] = [
        { x: a.x + umin * ux + vmin * vx, y: a.y + umin * uy + vmin * vy },
        { x: a.x + umax * ux + vmin * vx, y: a.y + umax * uy + vmin * vy },
        { x: a.x + umax * ux + vmax * vx, y: a.y + umax * uy + vmax * vy },
        { x: a.x + umin * ux + vmax * vx, y: a.y + umin * uy + vmax * vy },
      ];
      best = { area, rect: corners };
    }
  }
  return best ? best.rect : hull;
}

// ───────────────────────────────────────────────────────────────────────────
// BLDG clustering (union-find on distance threshold)
// ───────────────────────────────────────────────────────────────────────────

interface BldgCluster {
  /** Indices into the original bldg points array. */
  indices: number[];
  pts: SurveyPoint[];
  centroid: Pt;
  bbox: { xmin: number; ymin: number; xmax: number; ymax: number };
}

function clusterBldgPoints(bldg: SurveyPoint[], tolUnits: number): BldgCluster[] {
  const n = bldg.length;
  if (n === 0) return [];
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => parent[i] === i ? i : (parent[i] = find(parent[i]));
  const tol2 = tolUnits * tolUnits;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d2 = (bldg[i].easting - bldg[j].easting) ** 2 + (bldg[i].northing - bldg[j].northing) ** 2;
      if (d2 <= tol2) {
        const ri = find(i), rj = find(j);
        if (ri !== rj) parent[ri] = rj;
      }
    }
  }
  const byRoot = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const arr = byRoot.get(r);
    if (arr) arr.push(i); else byRoot.set(r, [i]);
  }
  const out: BldgCluster[] = [];
  for (const indices of byRoot.values()) {
    const pts = indices.map(i => bldg[i]);
    const cx = pts.reduce((s, p) => s + p.easting, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.northing, 0) / pts.length;
    let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
    for (const p of pts) {
      if (p.easting < xmin) xmin = p.easting; if (p.northing < ymin) ymin = p.northing;
      if (p.easting > xmax) xmax = p.easting; if (p.northing > ymax) ymax = p.northing;
    }
    out.push({ indices, pts, centroid: { x: cx, y: cy }, bbox: { xmin, ymin, xmax, ymax } });
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// Rectangle synthesis from N corners
// ───────────────────────────────────────────────────────────────────────────

/** Square centered on `c`, side length `side`, rotated by `bearingRad`. */
function rectFromCenter(c: Pt, sideU: number, sideV: number, bearingRad: number): Pt[] {
  const cr = Math.cos(bearingRad), sr = Math.sin(bearingRad);
  const hu = sideU * 0.5, hv = sideV * 0.5;
  const corners: Array<[number, number]> = [[-hu, -hv], [hu, -hv], [hu, hv], [-hu, hv]];
  return corners.map(([u, v]) => ({ x: c.x + cr * u - sr * v, y: c.y + sr * u + cr * v }));
}

/** Rectangle from two corners (A, B) forming one edge; extrude `perp` on the
 *  side closest to `hint` (or to the left of AB if hint is null). */
function rectFromTwoCorners(a: Pt, b: Pt, perp: number, hint: Pt | null): Pt[] {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L;   // along AB
  const nx = -uy,    ny = ux;       // left perpendicular (CCW)
  const sgn = (() => {
    if (!hint) return 1;
    const mx = (a.x + b.x) * 0.5, my = (a.y + b.y) * 0.5;
    return ((hint.x - mx) * nx + (hint.y - my) * ny) >= 0 ? 1 : -1;
  })();
  const c = { x: b.x + sgn * perp * nx, y: b.y + sgn * perp * ny };
  const d = { x: a.x + sgn * perp * nx, y: a.y + sgn * perp * ny };
  return [a, b, c, d];
}

/** Three corners → parallelogram completed at the right angle. */
function rectFromThreeCorners(pts: Pt[]): Pt[] {
  // Find which point is the "corner" (interior angle nearest 90°).
  let bestIdx = 0;
  let bestDelta = Infinity;
  for (let i = 0; i < 3; i++) {
    const a = pts[(i + 2) % 3], b = pts[i], c = pts[(i + 1) % 3];
    const v1x = a.x - b.x, v1y = a.y - b.y;
    const v2x = c.x - b.x, v2y = c.y - b.y;
    const l1 = Math.hypot(v1x, v1y) || 1, l2 = Math.hypot(v2x, v2y) || 1;
    const cosA = (v1x * v2x + v1y * v2y) / (l1 * l2);
    const ang = Math.acos(Math.max(-1, Math.min(1, cosA)));   // 0..π
    const delta = Math.abs(ang - Math.PI / 2);
    if (delta < bestDelta) { bestDelta = delta; bestIdx = i; }
  }
  const corner = pts[bestIdx];
  const a = pts[(bestIdx + 2) % 3];
  const c = pts[(bestIdx + 1) % 3];
  // Edges from the corner.
  const ea = { x: a.x - corner.x, y: a.y - corner.y };
  const ec = { x: c.x - corner.x, y: c.y - corner.y };
  const la = Math.hypot(ea.x, ea.y) || 1;
  const lc = Math.hypot(ec.x, ec.y) || 1;
  // Snap the SHORTER edge perpendicular to the longer (preserves long wall).
  let uA: Pt, uC: Pt, lenA: number, lenC: number;
  if (la >= lc) {
    uA = { x: ea.x / la, y: ea.y / la };
    // perp to uA on the side of original ec
    const nx = -uA.y, ny = uA.x;
    const sgn = (ec.x * nx + ec.y * ny) >= 0 ? 1 : -1;
    uC = { x: sgn * nx, y: sgn * ny };
    lenA = la; lenC = lc;
  } else {
    uC = { x: ec.x / lc, y: ec.y / lc };
    const nx = -uC.y, ny = uC.x;
    const sgn = (ea.x * nx + ea.y * ny) >= 0 ? 1 : -1;
    uA = { x: sgn * nx, y: sgn * ny };
    lenA = la; lenC = lc;
  }
  const pA = { x: corner.x + uA.x * lenA, y: corner.y + uA.y * lenA };
  const pC = { x: corner.x + uC.x * lenC, y: corner.y + uC.y * lenC };
  const pD = { x: corner.x + uA.x * lenA + uC.x * lenC, y: corner.y + uA.y * lenA + uC.y * lenC };
  // Build CCW: corner → pA → pD → pC (this depends on hand of the chosen perpendicular).
  const ring = [corner, pA, pD, pC];
  // Force CCW.
  let signed = 0;
  for (let i = 0; i < 4; i++) {
    const p = ring[i], q = ring[(i + 1) % 4];
    signed += p.x * q.y - q.x * p.y;
  }
  return signed < 0 ? ring.slice().reverse() : ring;
}

// ───────────────────────────────────────────────────────────────────────────
// Main entry point
// ───────────────────────────────────────────────────────────────────────────

export interface RectifyInput {
  bldgPoints: SurveyPoint[];
  osmFootprints: Array<BuildingFootprint & {
    nsi?: NsiStructureProps & { matchedCount?: number; pointNumbers?: string[] };
  }>;
  /** Full NSI centroid SurveyPoints (typically the FEMA-NSI PointList). */
  nsiCentroids: SurveyPoint[];
  /** Sidecar NSI attribute bag keyed by SurveyPoint.pointNumber. */
  nsiAttrs: Record<string, NsiStructureProps>;
  options?: RectifyOptions;
}

export function rectifyBuildings(input: RectifyInput): RectifyResult {
  const opts = input.options ?? {};
  const unitsPerFoot = opts.unitsPerFoot ?? 1;
  const clusterTol = opts.clusterToleranceUnits ?? 75 * unitsPerFoot;
  const layer = opts.layer ?? 'STRUCTURES';
  const defaultSide = opts.defaultBuildingSideUnits ?? 30 * unitsPerFoot;
  const minOsmArea = opts.minOsmAreaSqUnits ?? 200 * unitsPerFoot * unitsPerFoot;
  const streetBearing = opts.streetBearingRad ?? 0;
  const warnings: string[] = [];

  const stats: RectifyStats = {
    osmSnapped: 0, osmAsIs: 0, cogoMer: 0, cogo3: 0, cogo2: 0, cogo1: 0, nsiOnly: 0,
    bldgClustersIn: 0, osmIn: input.osmFootprints.length, nsiIn: input.nsiCentroids.length,
    warnings,
  };

  // 1. Cluster BLDG points.
  const clusters = clusterBldgPoints(input.bldgPoints, clusterTol);
  stats.bldgClustersIn = clusters.length;

  // Track consumed clusters / OSM polygons / NSI point numbers.
  const consumedClusters = new Set<number>();
  const consumedOsm = new Set<number>();
  const consumedNsi = new Set<string>();
  const buildings: RectifiedBuilding[] = [];
  let buildingSeq = 0;

  // Helper: find the nearest unconsumed NSI centroid within a search radius.
  const findNearestNsi = (c: Pt, maxDistU: number): SurveyPoint | null => {
    let best: SurveyPoint | null = null;
    let bestD2 = maxDistU * maxDistU;
    for (const np of input.nsiCentroids) {
      if (consumedNsi.has(np.pointNumber)) continue;
      const d2 = (np.easting - c.x) ** 2 + (np.northing - c.y) ** 2;
      if (d2 <= bestD2) { bestD2 = d2; best = np; }
    }
    return best;
  };

  // ─── PASS 1: OSM polygon + BLDG snap ─────────────────────────────────────
  for (let oi = 0; oi < input.osmFootprints.length; oi++) {
    const osm = input.osmFootprints[oi];
    if (osm.area < minOsmArea) { consumedOsm.add(oi); continue; }

    // Find candidate BLDG cluster: at least one point inside polygon OR within
    // bbox-expanded buffer of 5 ft.
    const buf = 5 * unitsPerFoot;
    const ob = ringBBox(osm.ring);
    let bestCluster = -1;
    let bestInsideCount = 0;
    for (let ci = 0; ci < clusters.length; ci++) {
      if (consumedClusters.has(ci)) continue;
      const c = clusters[ci];
      // Quick bbox reject.
      if (c.bbox.xmax < ob.xmin - buf || c.bbox.xmin > ob.xmax + buf) continue;
      if (c.bbox.ymax < ob.ymin - buf || c.bbox.ymin > ob.ymax + buf) continue;
      let inside = 0;
      for (const p of c.pts) {
        const pp = { x: p.easting, y: p.northing };
        if (pointInPolygon(pp, osm.ring)) inside++;
      }
      if (inside > bestInsideCount) { bestInsideCount = inside; bestCluster = ci; }
    }

    let ring = osm.ring.slice();
    let source: RectifySource = 'osm-asis';
    let confidence: RectifyConfidence = 'medium';
    let bldgPns: string[] = [];
    let note = 'OSM building outline (no survey BLDG match nearby).';

    if (bestCluster >= 0 && bestInsideCount > 0) {
      const cluster = clusters[bestCluster];
      // Pair each BLDG point to its nearest OSM vertex (greedy).
      const minE = minEdgeLen(osm.ring);
      const snapTol = opts.vertexSnapToleranceUnits
        ?? Math.min(25 * unitsPerFoot, Math.max(5 * unitsPerFoot, minE * 0.25));
      const pairs: Array<{ src: Pt; tgt: Pt; vi: number; pn: string }> = [];
      const usedVerts = new Set<number>();
      // Sort BLDG points by distance to ring centroid for deterministic pairing.
      const bldgSorted = cluster.pts
        .map(p => ({ p, d: dist2({ x: p.easting, y: p.northing }, osm.centroid) }))
        .sort((a, b) => a.d - b.d)
        .map(x => x.p);
      for (const bp of bldgSorted) {
        const tgt = { x: bp.easting, y: bp.northing };
        let bestVi = -1; let bestD2 = snapTol * snapTol;
        for (let vi = 0; vi < osm.ring.length; vi++) {
          if (usedVerts.has(vi)) continue;
          const d2 = dist2(osm.ring[vi], tgt);
          if (d2 <= bestD2) { bestD2 = d2; bestVi = vi; }
        }
        if (bestVi >= 0) {
          usedVerts.add(bestVi);
          pairs.push({ src: osm.ring[bestVi], tgt, vi: bestVi, pn: bp.pointNumber });
        }
      }

      if (pairs.length >= 1) {
        const t = solveHelmert(pairs.map(p => ({ src: p.src, tgt: p.tgt })));
        ring = osm.ring.map(v => applyHelmert(v, t));
        source = 'osm-bldg-snap';
        confidence = 'high';
        bldgPns = pairs.map(p => p.pn);
        const rotDeg = (t.rot * 180 / Math.PI).toFixed(2);
        note = `OSM outline snapped to ${pairs.length} BLDG point(s); Δrot=${rotDeg}° Δtrans=(${t.tx.toFixed(2)}, ${t.ty.toFixed(2)}).`;
        stats.osmSnapped++;
      } else {
        warnings.push(`OSM ${osm.id}: BLDG cluster overlapped but no vertex within snap tol — left as-is.`);
        stats.osmAsIs++;
      }

      // Consume the cluster (so PASS 3 doesn't double-handle it).
      consumedClusters.add(bestCluster);
    } else {
      stats.osmAsIs++;
    }

    // Consume any NSI centroid inside this OSM polygon (joined attrs already on osm.nsi).
    for (const np of input.nsiCentroids) {
      if (consumedNsi.has(np.pointNumber)) continue;
      if (pointInPolygon({ x: np.easting, y: np.northing }, osm.ring)) consumedNsi.add(np.pointNumber);
    }
    consumedOsm.add(oi);

    buildings.push({
      id: `STR-${++buildingSeq}`,
      ring,
      source,
      confidence,
      bldgPointNumbers: bldgPns,
      nsi: osm.nsi,
      area: shoelaceArea(ring),
      note,
    });
  }

  // ─── PASS 3: BLDG-only COGO (clusters with no OSM match) ─────────────────
  for (let ci = 0; ci < clusters.length; ci++) {
    if (consumedClusters.has(ci)) continue;
    const cluster = clusters[ci];
    const pts: Pt[] = cluster.pts.map(p => ({ x: p.easting, y: p.northing }));

    // Try to attach an NSI hint nearby (size only — we don't move the survey).
    const nsiNear = findNearestNsi(cluster.centroid, 100 * unitsPerFoot);
    const nsiAttrs = nsiNear ? input.nsiAttrs[nsiNear.pointNumber] : undefined;
    const sqftHint = nsiAttrs?.sqft_ft;
    const sideHint = sqftHint && sqftHint > 0 ? Math.sqrt(sqftHint) * unitsPerFoot : null;
    if (nsiNear) consumedNsi.add(nsiNear.pointNumber);

    let ring: Pt[];
    let source: RectifySource;
    let confidence: RectifyConfidence;
    let note: string;

    if (pts.length === 1) {
      const side = sideHint ?? defaultSide;
      ring = rectFromCenter(pts[0], side, side, streetBearing);
      source = 'cogo-bldg-1';
      confidence = sideHint ? 'medium' : 'low';
      note = `Single BLDG corner → ${side.toFixed(1)}-unit square (${sideHint ? `NSI ${sqftHint?.toFixed(0)} sq ft` : 'default size'}).`;
      stats.cogo1++;
    } else if (pts.length === 2) {
      const edgeLen = dist(pts[0], pts[1]);
      const perp = sqftHint && edgeLen > 0
        ? (sqftHint * unitsPerFoot * unitsPerFoot) / edgeLen
        : edgeLen;
      ring = rectFromTwoCorners(pts[0], pts[1], perp, nsiNear ? { x: nsiNear.easting, y: nsiNear.northing } : null);
      source = 'cogo-bldg-2';
      confidence = sqftHint ? 'medium' : 'low';
      note = `Two BLDG corners (${edgeLen.toFixed(1)} edge) → rectangle ${perp.toFixed(1)} perpendicular${sqftHint ? ` (NSI ${sqftHint.toFixed(0)} sq ft)` : ''}.`;
      stats.cogo2++;
    } else if (pts.length === 3) {
      ring = rectFromThreeCorners(pts);
      source = 'cogo-bldg-3';
      confidence = 'high';
      note = 'Three BLDG corners → 90°-snapped parallelogram completion.';
      stats.cogo3++;
    } else {
      ring = minAreaRectangle(pts);
      source = 'cogo-bldg-mer';
      confidence = 'high';
      note = `${pts.length} BLDG corners → minimum-area enclosing rectangle.`;
      stats.cogoMer++;
    }

    buildings.push({
      id: `STR-${++buildingSeq}`,
      ring,
      source,
      confidence,
      bldgPointNumbers: cluster.pts.map(p => p.pointNumber),
      nsi: nsiAttrs ? { ...nsiAttrs, matchedCount: 1, pointNumbers: nsiNear ? [nsiNear.pointNumber] : [] } : undefined,
      area: shoelaceArea(ring),
      note,
    });
  }

  // ─── PASS 4: NSI-only fallback ───────────────────────────────────────────
  for (const np of input.nsiCentroids) {
    if (consumedNsi.has(np.pointNumber)) continue;
    const attrs = input.nsiAttrs[np.pointNumber];
    const sqft = attrs?.sqft_ft;
    if (!sqft || sqft < 50) continue;   // tiny / missing → skip
    const side = Math.sqrt(sqft) * unitsPerFoot;
    const ring = rectFromCenter({ x: np.easting, y: np.northing }, side, side, streetBearing);
    buildings.push({
      id: `STR-${++buildingSeq}`,
      ring,
      source: 'nsi-only',
      confidence: 'low',
      bldgPointNumbers: [],
      nsi: attrs,
      area: shoelaceArea(ring),
      note: `NSI-only synthetic footprint (${sqft.toFixed(0)} sq ft, oriented to street grid).`,
    });
    stats.nsiOnly++;
  }

  // ─── Emit SurveyLines ────────────────────────────────────────────────────
  const lines: SurveyLine[] = [];
  for (const b of buildings) {
    const polylineId = `struct-${b.id}-${Date.now().toString(36)}`;
    const n = b.ring.length;
    for (let i = 0; i < n; i++) {
      const a = b.ring[i], q = b.ring[(i + 1) % n];
      lines.push({
        id: `${b.id}-e${i}`,
        from: `${b.id}-V${i + 1}`,
        to:   `${b.id}-V${((i + 1) % n) + 1}`,
        fromPt: { x: a.x, y: a.y, z: 0 },
        toPt:   { x: q.x, y: q.y, z: 0 },
        layer,
        lineType: 'CONTINUOUS',
        polylineId,
        source: 'survey',
      });
    }
  }

  return { buildings, lines, stats };
}
