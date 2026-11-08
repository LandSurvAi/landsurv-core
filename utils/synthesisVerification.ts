/**
 * synthesisVerification.ts
 *
 * GIMBAL VISION — PASS 2: SYNTHESIS VERIFICATION
 * ───────────────────────────────────────────────
 * Pass 1 of Gimbal Vision lets the Civil Drafter *see* the site before it
 * drafts. This module is the second pass: after the model has committed
 * linework, we render the background orthophoto into an evidence raster, build
 * a pavement mask + signed distance field from the actual pixels, and audit the
 * drafted polylines against that imagery.
 *
 * Why this exists
 * ---------------
 * A point-to-point synthesis can look plausible in CAD and still be wrong on
 * the ground: a driveway edge that cuts diagonally through the road bed, a
 * centreline that wanders off the cartway, a sawtooth that connects opposing
 * edges of one corridor, a duplicate line laid over an existing one. The model
 * cannot reliably catch these because it never re-examines its own output
 * against the imagery. This module does exactly that, deterministically, and
 * then repairs the geometry:
 *
 *   • EDGE features snap to the nearest visible pavement boundary.
 *   • CENTRELINE features snap to the medial axis of the pavement.
 *   • Sawtooth / self-intersecting features are re-ordered onto one side of the
 *     corridor before snapping, so the line no longer crosses the road bed.
 *   • Duplicate and spur geometry is removed.
 *
 * Every repair is re-audited and the whole result is accepted only when the
 * evidence score improves. A verification pass can therefore never make the
 * drafted linework worse.
 *
 * All geometry is in project coordinates (feet). Raster rows run north-up:
 * row 0 is the northern edge of the bounds.
 */

import { formatBearing, inverse } from './cogo.ts';
import { isPavementPixel } from './geoRasterSegmentation.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface SynthesisBounds {
  minE: number;
  maxE: number;
  minN: number;
  maxN: number;
}

/** A north-up RGBA raster tied to project coordinates. */
export interface RasterEvidence {
  width: number;
  height: number;
  /** RGBA, row-major, row 0 = maxN. */
  data: Uint8ClampedArray;
  bounds: SynthesisBounds;
  label?: string;
}

export interface SynthesisMapTile {
  image: CanvasImageSource;
  bbox: [number, number, number, number];
  quad?: [number, number][];
  opacity?: number;
}

export interface SynthesisBackgroundImage {
  image: CanvasImageSource;
  bounds?: SynthesisBounds;
}

export interface DraftVertex {
  easting: number;
  northing: number;
}

export type PavementRole = 'edge' | 'centerline' | 'unknown';

/** The minimal SurveyLine surface the verifier needs. Extra fields survive. */
export interface DraftLineLike {
  id?: string;
  from: string;
  to: string;
  fromPt?: { x: number; y: number; z?: number };
  toPt?: { x: number; y: number; z?: number };
  layer?: string;
  polylineId?: string;
  lineType?: string;
  isCurve?: boolean;
  isCircle?: boolean;
  curveRadius?: number;
  arcLength?: number;
  circleCenter?: { x: number; y: number; z?: number };
  hidden?: boolean;
}

export interface DraftFeature {
  id: string;
  layer?: string;
  polylineId?: string;
  role: PavementRole;
  vertices: DraftVertex[];
  isClosed: boolean;
  /** Indexes into the caller's line array. */
  sourceLineIndexes: number[];
}

export type SynthesisDefectKind =
  | 'off_surface'
  | 'edge_offset'
  | 'off_center'
  | 'self_intersection'
  | 'zigzag'
  | 'duplicate'
  | 'spur';

export interface SynthesisDefect {
  kind: SynthesisDefectKind;
  severity: 'red' | 'yellow';
  featureId: string;
  otherFeatureId?: string;
  at: DraftVertex;
  /** 0..1, how bad the offence is. */
  metric: number;
  detail: string;
}

export interface SynthesisAudit {
  usable: boolean;
  reason?: string;
  /** 0..100 — 100 means every audited feature is fully supported by imagery. */
  score: number;
  defects: SynthesisDefect[];
  featuresAudited: number;
  pavementCoverage: number;
}

export interface SynthesisRepair {
  kind: 'reorder' | 'snap_edge' | 'snap_center' | 'despike' | 'dedupe';
  featureId: string;
  detail: string;
}

export interface SynthesisQaReport {
  status: 'clean' | 'corrected' | 'unverified';
  scoreBefore: number;
  scoreAfter: number;
  defectsFound: number;
  defectsCorrected: number;
  featuresAudited: number;
  repairs: string[];
  pavementCoverage: number;
  evidenceLabel?: string;
  /** Annotated before/after raster for the Gimbal HUD. */
  overlayDataUrl?: string;
  durationMs: number;
}

export interface SynthesisVerificationResult<T extends DraftLineLike> {
  lines: T[];
  report: SynthesisQaReport;
  changed: boolean;
}

export interface SynthesisVerifyOptions {
  bounds: SynthesisBounds;
  mapTiles?: SynthesisMapTile[];
  backgroundImage?: SynthesisBackgroundImage | null;
  maxIterations?: number;
  /** Override the pavement classifier (used by tests / custom imagery). */
  pavementPixelTest?: (r: number, g: number, b: number) => boolean;
  /** Generate the annotated overlay for the HUD (default true in a browser). */
  renderOverlay?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pavement field (mask + signed distance)
// ─────────────────────────────────────────────────────────────────────────────

export interface PavementField {
  width: number;
  height: number;
  /** 1 = pavement. */
  mask: Uint8Array;
  /**
   * Signed distance in pixels. Positive inside pavement (distance to the
   * nearest edge), negative outside (distance to the nearest pavement pixel).
   */
  signed: Float32Array;
  /** Largest interior distance — half-width of the widest paved area. */
  maxInside: number;
  coverage: number;
  pxPerFtE: number;
  pxPerFtN: number;
}

const SQRT2 = Math.SQRT2;
const INF = 1e9;

/** Two-pass 8-neighbour chamfer distance transform. Seeds are 0. */
function chamferTransform(field: Float32Array, width: number, height: number): void {
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const i = row + x;
      let v = field[i];
      if (x > 0) v = Math.min(v, field[i - 1] + 1);
      if (y > 0) {
        v = Math.min(v, field[i - width] + 1);
        if (x > 0) v = Math.min(v, field[i - width - 1] + SQRT2);
        if (x < width - 1) v = Math.min(v, field[i - width + 1] + SQRT2);
      }
      field[i] = v;
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    const row = y * width;
    for (let x = width - 1; x >= 0; x--) {
      const i = row + x;
      let v = field[i];
      if (x < width - 1) v = Math.min(v, field[i + 1] + 1);
      if (y < height - 1) {
        v = Math.min(v, field[i + width] + 1);
        if (x < width - 1) v = Math.min(v, field[i + width + 1] + SQRT2);
        if (x > 0) v = Math.min(v, field[i + width - 1] + SQRT2);
      }
      field[i] = v;
    }
  }
}

export function buildPavementField(
  evidence: RasterEvidence,
  pixelTest: (r: number, g: number, b: number) => boolean = isPavementPixel,
): PavementField {
  const { width, height, data } = evidence;
  const n = width * height;
  const mask = new Uint8Array(n);
  let pavementCount = 0;

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const a = data[o + 3];
    if (a === 0) continue; // transparent = no evidence
    if (pixelTest(data[o], data[o + 1], data[o + 2])) {
      mask[i] = 1;
      pavementCount++;
    }
  }

  // Distance to the nearest pavement pixel (0 inside) and to the nearest
  // non-pavement pixel (0 outside). Their signed combination gives a field
  // whose zero crossing is exactly the visible pavement edge.
  const toPavement = new Float32Array(n);
  const toVoid = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    toPavement[i] = mask[i] ? 0 : INF;
    toVoid[i] = mask[i] ? INF : 0;
  }
  chamferTransform(toPavement, width, height);
  chamferTransform(toVoid, width, height);

  const signed = new Float32Array(n);
  let maxInside = 0;
  for (let i = 0; i < n; i++) {
    if (mask[i]) {
      const d = Math.min(toVoid[i], INF);
      signed[i] = d;
      if (d > maxInside) maxInside = d;
    } else {
      signed[i] = -Math.min(toPavement[i], INF);
    }
  }

  const spanE = Math.max(evidence.bounds.maxE - evidence.bounds.minE, 1e-9);
  const spanN = Math.max(evidence.bounds.maxN - evidence.bounds.minN, 1e-9);

  return {
    width,
    height,
    mask,
    signed,
    maxInside,
    coverage: pavementCount / Math.max(1, n),
    pxPerFtE: width / spanE,
    pxPerFtN: height / spanN,
  };
}

export function sampleSigned(field: PavementField, x: number, y: number): number {
  const { width, height, signed } = field;
  const cx = Math.max(0, Math.min(width - 1, x));
  const cy = Math.max(0, Math.min(height - 1, y));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = cx - x0;
  const fy = cy - y0;
  const a = signed[y0 * width + x0];
  const b = signed[y0 * width + x1];
  const c = signed[y1 * width + x0];
  const d = signed[y1 * width + x1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

export function isPavementPixelAt(field: PavementField, x: number, y: number): boolean {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= field.width || py >= field.height) return false;
  return field.mask[py * field.width + px] === 1;
}

interface BoundaryHit {
  x: number;
  y: number;
  dist: number;
  angle: number;
}

const RAY_COUNT = 16;

/**
 * Cast rays outward and return the first pavement/void crossing in each
 * direction. This is the raw evidence used by both edge and centreline snaps.
 */
export function findBoundaryHits(
  field: PavementField,
  x: number,
  y: number,
  maxRadius = 40,
): BoundaryHit[] {
  const startInside = isPavementPixelAt(field, x, y);
  const hits: BoundaryHit[] = [];

  for (let k = 0; k < RAY_COUNT; k++) {
    const angle = (k / RAY_COUNT) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let previousInside = startInside;
    let found = -1;

    for (let r = 1; r <= maxRadius; r++) {
      const px = x + dx * r;
      const py = y + dy * r;
      if (px < 0 || py < 0 || px >= field.width || py >= field.height) break;
      const inside = isPavementPixelAt(field, px, py);
      if (inside !== previousInside) {
        found = r;
        break;
      }
      previousInside = inside;
    }

    if (found < 0) continue;

    // Bisect between the last pixel of the old region and the first of the new
    // one so the hit lands on the boundary, not a full pixel past it.
    let lo = found - 1;
    let hi = found;
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;
      const inside = isPavementPixelAt(field, x + dx * mid, y + dy * mid);
      if (inside === startInside) lo = mid;
      else hi = mid;
    }
    const dist = (lo + hi) / 2;
    hits.push({ x: x + dx * dist, y: y + dy * dist, dist, angle });
  }

  return hits;
}

/**
 * Edge snap: the nearest visible pavement boundary, biased toward the previous
 * sample so a repaired line follows one edge instead of hopping across the
 * corridor.
 */
function snapEdgePoint(
  field: PavementField,
  x: number,
  y: number,
  maxRadius: number,
  hint?: { x: number; y: number },
): { x: number; y: number } | null {
  const hits = findBoundaryHits(field, x, y, maxRadius);
  if (hits.length === 0) return null;
  let best = hits[0];
  let bestCost = Infinity;
  for (const hit of hits) {
    const continuity = hint ? Math.hypot(hit.x - hint.x, hit.y - hint.y) : 0;
    const cost = hit.dist + continuity * 0.55;
    if (cost < bestCost) {
      bestCost = cost;
      best = hit;
    }
  }
  return { x: best.x, y: best.y };
}

/** Continue a ray from a boundary hit to the far side of the same paved run. */
function nextCrossingFrom(
  field: PavementField,
  x: number,
  y: number,
  angle: number,
  maxRadius: number,
): { x: number; y: number } | null {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const insideAtStart = isPavementPixelAt(field, x + dx * 0.75, y + dy * 0.75);
  let previousInside = insideAtStart;
  for (let r = 1; r <= maxRadius; r++) {
    const px = x + dx * r;
    const py = y + dy * r;
    if (px < 0 || py < 0 || px >= field.width || py >= field.height) return null;
    const inside = isPavementPixelAt(field, px, py);
    if (inside !== previousInside) {
      let lo = r - 1;
      let hi = r;
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        const midInside = isPavementPixelAt(field, x + dx * mid, y + dy * mid);
        if (midInside === previousInside) lo = mid;
        else hi = mid;
      }
      const dist = (lo + hi) / 2;
      return { x: x + dx * dist, y: y + dy * dist };
    }
    previousInside = inside;
  }
  return null;
}

/**
 * Centreline snap: midpoint between the two facing pavement boundaries. When a
 * sample starts outside the pavement, the nearest hit is followed through the
 * paved run to the far side before taking the midpoint.
 */
function snapCenterPoint(
  field: PavementField,
  x: number,
  y: number,
  maxRadius: number,
  hint?: { x: number; y: number },
): { x: number; y: number } | null {
  const hits = findBoundaryHits(field, x, y, maxRadius);
  let best: { x: number; y: number } | null = null;
  let bestCost = Infinity;

  for (let i = 0; i < hits.length; i++) {
    for (let j = i + 1; j < hits.length; j++) {
      const a = hits[i];
      const b = hits[j];
      const dot = Math.cos(a.angle) * Math.cos(b.angle) + Math.sin(a.angle) * Math.sin(b.angle);
      // Only nearly opposite rays define a corridor cross-section. Allowing
      // 135-degree pairs let oblique rays meet at a midpoint that still lies on
      // the pavement edge, which biased the "centreline" toward the kerb.
      if (dot > -0.9) continue;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const continuity = hint ? Math.hypot(mx - hint.x, my - hint.y) : 0;
      const cost = a.dist + b.dist + continuity * 0.55;
      if (cost < bestCost) {
        bestCost = cost;
        best = { x: mx, y: my };
      }
    }
  }
  if (best) return best;

  // Outside the pavement: enter through the nearest edge, exit the far side,
  // and take the midpoint of that paved run.
  if (hits.length === 0) return null;
  let nearest = hits[0];
  for (const hit of hits) if (hit.dist < nearest.dist) nearest = hit;
  const far = nextCrossingFrom(field, nearest.x, nearest.y, nearest.angle, maxRadius);
  if (!far) return null;
  return { x: (nearest.x + far.x) / 2, y: (nearest.y + far.y) / 2 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometry helpers
// ─────────────────────────────────────────────────────────────────────────────

function distance(a: DraftVertex, b: DraftVertex): number {
  return Math.hypot(a.easting - b.easting, a.northing - b.northing);
}

function centroid(vertices: DraftVertex[]): DraftVertex {
  let e = 0;
  let n = 0;
  for (const v of vertices) {
    e += v.easting;
    n += v.northing;
  }
  return { easting: e / vertices.length, northing: n / vertices.length };
}

/** Dominant axis of a vertex set (same PCA used by the linework engine). */
function principalAxis(vertices: DraftVertex[]): { ux: number; uy: number } {
  const c = centroid(vertices);
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const v of vertices) {
    const dx = v.easting - c.easting;
    const dy = v.northing - c.northing;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const trace = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
  const lambda = trace / 2 + disc;
  let ux: number;
  let uy: number;
  if (Math.abs(sxy) > 1e-9) {
    ux = lambda - syy;
    uy = sxy;
  } else if (sxx >= syy) {
    ux = 1;
    uy = 0;
  } else {
    ux = 0;
    uy = 1;
  }
  const mag = Math.hypot(ux, uy) || 1;
  return { ux: ux / mag, uy: uy / mag };
}

/** Re-order vertices along the feature's dominant axis (kills sawtooth order). */
export function orderAlongPrincipalAxis(vertices: DraftVertex[]): DraftVertex[] {
  if (vertices.length < 3) return [...vertices];
  const { ux, uy } = principalAxis(vertices);
  const c = centroid(vertices);
  return [...vertices].sort((a, b) => {
    const pa = (a.easting - c.easting) * ux + (a.northing - c.northing) * uy;
    const pb = (b.easting - c.easting) * ux + (b.northing - c.northing) * uy;
    return pa - pb;
  });
}

function orientation(a: DraftVertex, b: DraftVertex, c: DraftVertex): number {
  return (b.easting - a.easting) * (c.northing - a.northing)
    - (b.northing - a.northing) * (c.easting - a.easting);
}

function segmentsProperlyIntersect(
  a: DraftVertex, b: DraftVertex, c: DraftVertex, d: DraftVertex,
): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

export function countSelfIntersections(vertices: DraftVertex[], isClosed = false): number {
  let count = 0;
  const n = vertices.length;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n - 1; j++) {
      // Adjacent segments share an endpoint — not a defect.
      if (j === i + 1) continue;
      if (isClosed && i === 0 && j === n - 2) continue;
      if (segmentsProperlyIntersect(vertices[i], vertices[i + 1], vertices[j], vertices[j + 1])) {
        count++;
      }
    }
  }
  return count;
}

/** Number of transverse reversals along the dominant axis. */
export function countZigzags(vertices: DraftVertex[]): number {
  if (vertices.length < 4) return 0;
  const { ux, uy } = principalAxis(vertices);
  const c = centroid(vertices);
  const offsets = vertices.map(v => -(v.easting - c.easting) * uy + (v.northing - c.northing) * ux);

  let reversals = 0;
  let previousSign = 0;
  let previousOffset = offsets[0];
  for (let i = 1; i < offsets.length; i++) {
    const jump = offsets[i] - previousOffset;
    if (Math.abs(jump) < 4) continue;
    const sign = jump > 0 ? 1 : -1;
    if (previousSign !== 0 && sign !== previousSign) reversals++;
    previousSign = sign;
    previousOffset = offsets[i];
  }
  return reversals;
}

function countSpurs(vertices: DraftVertex[]): number {
  let spurs = 0;
  for (let i = 1; i < vertices.length - 1; i++) {
    const a = vertices[i - 1];
    const b = vertices[i];
    const c = vertices[i + 1];
    const ab = distance(a, b);
    const bc = distance(b, c);
    if (ab < 1 || bc < 1) continue;
    const cross = Math.abs(orientation(a, b, c));
    const sinAngle = cross / (ab * bc);
    if (sinAngle < 0.5 || (ab < 2 && bc < 2)) spurs++;
  }
  return spurs;
}

function pointToSegmentDistance(
  p: DraftVertex,
  a: DraftVertex,
  b: DraftVertex,
): number {
  const dx = b.easting - a.easting;
  const dy = b.northing - a.northing;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p.easting - a.easting) * dx + (p.northing - a.northing) * dy) / lenSq));
  return Math.hypot(p.easting - (a.easting + t * dx), p.northing - (a.northing + t * dy));
}

function meanDistanceToPolyline(points: DraftVertex[], polyline: DraftVertex[]): number {
  if (polyline.length < 2) return Infinity;
  let total = 0;
  for (const p of points) {
    let best = Infinity;
    for (let i = 0; i < polyline.length - 1; i++) {
      const d = pointToSegmentDistance(p, polyline[i], polyline[i + 1]);
      if (d < best) best = d;
    }
    total += best;
  }
  return total / Math.max(1, points.length);
}

/** Ramer–Douglas–Peucker in raster pixel space. */
function simplifyPixelPath(points: Array<{ x: number; y: number }>, epsilon: number): Array<{ x: number; y: number }> {
  if (points.length <= 2) return points;
  let maxDist = 0;
  let index = 0;
  const first = points[0];
  const last = points[points.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const lenSq = dx * dx + dy * dy;

  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    let dist: number;
    if (lenSq === 0) {
      dist = Math.hypot(p.x - first.x, p.y - first.y);
    } else {
      const t = Math.max(0, Math.min(1, ((p.x - first.x) * dx + (p.y - first.y) * dy) / lenSq));
      dist = Math.hypot(p.x - (first.x + t * dx), p.y - (first.y + t * dy));
    }
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyPixelPath(points.slice(0, index + 1), epsilon);
    const right = simplifyPixelPath(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

const PAVEMENT_LAYER_RE = /(ROAD|DRIVEWAY|DRIVE|PAVE|PAV\b|PVMT|CURB|GUTTER|SIDEWALK|WALK|LANE|EOP|\bEP\b|\bER\b|EDGE|SHOULDER|SHLD|C-ROAD|L-ROAD|L-DRIVEWAY)/i;
const CENTERLINE_RE = /(CNTR|CENTER|C-ROAD-CNTR|DRIVEWAY-CL|\bCL\b)/i;

export function isPavementLayer(layer: string | undefined, polylineId?: string): boolean {
  const value = `${layer ?? ''} ${polylineId ?? ''}`;
  if (!value.trim()) return false;
  // Deed boundaries, contours, utilities etc. are never pavement features.
  if (/(BOUNDARY|L-DEED|PROPERTY|CONTOUR|TOPO|UTIL|FEMA|FLOOD|SOILS|TREE|VEG)/i.test(value)) {
    return false;
  }
  return PAVEMENT_LAYER_RE.test(value);
}

export function pavementRoleFor(layer: string | undefined, polylineId?: string): PavementRole {
  const value = `${layer ?? ''} ${polylineId ?? ''}`;
  if (CENTERLINE_RE.test(value)) return 'centerline';
  if (isPavementLayer(layer, polylineId)) return 'edge';
  return 'unknown';
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature assembly
// ─────────────────────────────────────────────────────────────────────────────

interface SegmentLike {
  line: DraftLineLike;
  index: number;
}

function lineEndpoints(line: DraftLineLike): [DraftVertex, DraftVertex] | null {
  if (!line.fromPt || !line.toPt) return null;
  const { x: fx, y: fy } = line.fromPt;
  const { x: tx, y: ty } = line.toPt;
  if (![fx, fy, tx, ty].every(Number.isFinite)) return null;
  return [
    { easting: fx, northing: fy },
    { easting: tx, northing: ty },
  ];
}

function endpointKey(v: DraftVertex): string {
  return `${v.easting.toFixed(2)},${v.northing.toFixed(2)}`;
}

/** Chain segments in a polylineId group into one ordered vertex path. */
function chainSegments(segments: SegmentLike[]): { vertices: DraftVertex[]; isClosed: boolean } | null {
  const resolved: Array<{ a: DraftVertex; b: DraftVertex }> = [];
  for (const segment of segments) {
    const ends = lineEndpoints(segment.line);
    if (ends) resolved.push({ a: ends[0], b: ends[1] });
  }
  if (resolved.length === 0) return null;

  const used = new Array<boolean>(resolved.length).fill(false);
  const startIndex = 0;
  used[startIndex] = true;
  const vertices: DraftVertex[] = [resolved[startIndex].a, resolved[startIndex].b];

  for (let guard = 0; guard < resolved.length * 2; guard++) {
    const tail = vertices[vertices.length - 1];
    let matched = -1;
    let reversed = false;
    for (let i = 0; i < resolved.length; i++) {
      if (used[i]) continue;
      if (distance(resolved[i].a, tail) < 0.05) {
        matched = i;
        break;
      }
      if (distance(resolved[i].b, tail) < 0.05) {
        matched = i;
        reversed = true;
        break;
      }
    }
    if (matched < 0) break;
    used[matched] = true;
    const seg = resolved[matched];
    const next = reversed ? seg.a : seg.b;
    if (distance(next, vertices[0]) < 0.05 && used.every(Boolean)) {
      return { vertices, isClosed: true };
    }
    vertices.push(next);
  }

  // If chaining stalled (branching or out-of-order segments), fall back to a
  // principal-axis ordering of every distinct endpoint.
  if (used.some(u => !u)) {
    const unique: DraftVertex[] = [];
    const seen = new Set<string>();
    for (const seg of resolved) {
      for (const v of [seg.a, seg.b]) {
        const key = endpointKey(v);
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(v);
      }
    }
    if (unique.length < 2) return null;
    return { vertices: orderAlongPrincipalAxis(unique), isClosed: false };
  }

  const closed = vertices.length > 2 && distance(vertices[0], vertices[vertices.length - 1]) < 0.05;
  if (closed) vertices.pop();
  return { vertices, isClosed: closed };
}

/** Group pavement linework into features ready for evidence auditing. */
export function groupLinesIntoFeatures(lines: DraftLineLike[]): DraftFeature[] {
  const groups = new Map<string, SegmentLike[]>();

  lines.forEach((line, index) => {
    if (line.hidden) return;
    if (line.isCurve || line.isCircle || line.curveRadius) return; // curves are left untouched
    if (!isPavementLayer(line.layer, line.polylineId)) return;
    if (!lineEndpoints(line)) return;
    const key = line.polylineId && line.polylineId.trim()
      ? `pid:${line.polylineId}`
      : `layer:${line.layer ?? 'unknown'}:${index}`;
    const bucket = groups.get(key) ?? [];
    bucket.push({ line, index });
    groups.set(key, bucket);
  });

  const features: DraftFeature[] = [];
  let sequence = 0;
  for (const [key, segments] of groups.entries()) {
    const chained = chainSegments(segments);
    if (!chained || chained.vertices.length < 2) continue;
    const first = segments[0].line;
    features.push({
      id: `${key.replace(/[^a-zA-Z0-9_-]/g, '_')}-${sequence++}`,
      layer: first.layer,
      polylineId: first.polylineId,
      role: pavementRoleFor(first.layer, first.polylineId),
      vertices: chained.vertices,
      isClosed: chained.isClosed,
      sourceLineIndexes: segments.map(s => s.index),
    });
  }

  return features;
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit
// ─────────────────────────────────────────────────────────────────────────────

function densify(vertices: DraftVertex[], field: PavementField, bounds: SynthesisBounds): Array<{ x: number; y: number }> {
  const spanE = Math.max(bounds.maxE - bounds.minE, 1e-9);
  const spanN = Math.max(bounds.maxN - bounds.minN, 1e-9);
  const toPixel = (v: DraftVertex) => ({
    x: ((v.easting - bounds.minE) / spanE) * field.width,
    y: ((bounds.maxN - v.northing) / spanN) * field.height,
  });

  const pixels = vertices.map(toPixel);
  const samples: Array<{ x: number; y: number }> = [];
  const MAX_SAMPLES = 240;

  for (let i = 0; i < pixels.length - 1; i++) {
    const a = pixels[i];
    const b = pixels[i + 1];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(length / 3));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      samples.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  samples.push(pixels[pixels.length - 1]);

  if (samples.length <= MAX_SAMPLES) return samples;
  const stride = samples.length / MAX_SAMPLES;
  const reduced: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < MAX_SAMPLES; i++) reduced.push(samples[Math.floor(i * stride)]);
  reduced[reduced.length - 1] = samples[samples.length - 1];
  return reduced;
}

function pixelToWorld(x: number, y: number, field: PavementField, bounds: SynthesisBounds): DraftVertex {
  const spanE = Math.max(bounds.maxE - bounds.minE, 1e-9);
  const spanN = Math.max(bounds.maxN - bounds.minN, 1e-9);
  return {
    easting: bounds.minE + (x / field.width) * spanE,
    northing: bounds.maxN - (y / field.height) * spanN,
  };
}

function featureSamples(feature: DraftFeature, field: PavementField, bounds: SynthesisBounds) {
  return densify(feature.vertices, field, bounds);
}

function auditFeature(
  feature: DraftFeature,
  field: PavementField,
  bounds: SynthesisBounds,
): SynthesisDefect[] {
  const defects: SynthesisDefect[] = [];
  const ftPerPx = 2 / Math.max(1e-9, field.pxPerFtE + field.pxPerFtN);
  const samples = featureSamples(feature, field, bounds);
  if (samples.length === 0) return defects;

  const signedValues = samples.map(s => sampleSigned(field, s.x, s.y));
  const onPavement = signedValues.filter(v => v >= 0).length / samples.length;
  const worstIndex = signedValues.reduce(
    (best, v, i) => (v < signedValues[best] ? i : best),
    0,
  );
  const worstAt = pixelToWorld(samples[worstIndex].x, samples[worstIndex].y, field, bounds);

  if (!feature.isClosed && feature.role !== 'unknown') {
    if (onPavement < 0.4) {
      defects.push({
        kind: 'off_surface',
        severity: 'red',
        featureId: feature.id,
        at: worstAt,
        metric: Math.min(1, 1 - onPavement),
        detail: `${Math.round((1 - onPavement) * 100)}% of the line is off the visible pavement`,
      });
    } else if (feature.role === 'edge') {
      const meanOffsetFt =
        signedValues.reduce((sum, v) => sum + Math.abs(Math.max(v, -4)), 0) / signedValues.length * ftPerPx;
      if (meanOffsetFt > 3) {
        defects.push({
          kind: 'edge_offset',
          severity: meanOffsetFt > 8 ? 'red' : 'yellow',
          featureId: feature.id,
          at: worstAt,
          metric: Math.min(1, Math.max(0.05, (meanOffsetFt - 3) / 12)),
          detail: `drawn edge sits ${meanOffsetFt.toFixed(1)} ft from the visible pavement edge`,
        });
      }
    } else if (feature.role === 'centerline') {
      const medialRatio = field.maxInside > 0
        ? signedValues.reduce((sum, v) => sum + Math.max(0, v), 0) / signedValues.length / field.maxInside
        : 0;
      if (medialRatio < 0.4) {
        defects.push({
          kind: 'off_center',
          severity: medialRatio < 0.2 ? 'red' : 'yellow',
          featureId: feature.id,
          at: worstAt,
          metric: Math.min(1, Math.max(0.05, (0.5 - medialRatio) / 0.5)),
          detail: `centreline is ${Math.round(medialRatio * 100)}% of the way to the pavement centre`,
        });
      }
    }
  }

  if (!feature.isClosed) {
    const intersections = countSelfIntersections(feature.vertices);
    if (intersections > 0) {
      defects.push({
        kind: 'self_intersection',
        severity: 'red',
        featureId: feature.id,
        at: feature.vertices[0],
        metric: Math.min(1, intersections / 3),
        detail: `line crosses itself ${intersections} time${intersections === 1 ? '' : 's'} (sawtooth connection)`,
      });
    }

    const zigzags = countZigzags(feature.vertices);
    if (zigzags >= 2) {
      defects.push({
        kind: 'zigzag',
        severity: zigzags > 4 ? 'red' : 'yellow',
        featureId: feature.id,
        at: feature.vertices[0],
        metric: Math.min(1, zigzags / 6),
        detail: `line reverses across the corridor ${zigzags} times`,
      });
    }
  }

  const spurs = countSpurs(feature.vertices);
  if (spurs > 0) {
    defects.push({
      kind: 'spur',
      severity: 'yellow',
      featureId: feature.id,
      at: feature.vertices[1] ?? feature.vertices[0],
      metric: Math.min(1, spurs / 3),
      detail: `${spurs} spike${spurs === 1 ? '' : 's'} in the linework`,
    });
  }

  return defects;
}

const DEFECT_WEIGHT: Record<SynthesisDefectKind, number> = {
  off_surface: 1.5,
  edge_offset: 1.2,
  off_center: 1.0,
  self_intersection: 1.5,
  zigzag: 1.0,
  duplicate: 0.8,
  spur: 0.5,
};

export function auditSynthesisFeatures(
  features: DraftFeature[],
  field: PavementField,
  bounds: SynthesisBounds,
): SynthesisAudit {
  if (features.length === 0) {
    return { usable: true, score: 100, defects: [], featuresAudited: 0, pavementCoverage: field.coverage };
  }
  if (field.coverage < 0.01 || field.coverage > 0.97 || field.maxInside < 2) {
    return {
      usable: false,
      reason: 'background imagery does not contain a reliable pavement mask',
      score: 0,
      defects: [],
      featuresAudited: features.length,
      pavementCoverage: field.coverage,
    };
  }

  const defects: SynthesisDefect[] = [];
  for (const feature of features) {
    defects.push(...auditFeature(feature, field, bounds));
  }

  // Duplicate geometry: a second line laid on top of the first.
  for (let i = 0; i < features.length; i++) {
    for (let j = i + 1; j < features.length; j++) {
      const a = features[i];
      const b = features[j];
      if (a.vertices.length < 2 || b.vertices.length < 2) continue;
      if (a.role !== b.role) continue;
      const forward = meanDistanceToPolyline(a.vertices, b.vertices);
      const backward = meanDistanceToPolyline(b.vertices, a.vertices);
      if (Math.max(forward, backward) < 2 && Math.min(a.vertices.length, b.vertices.length) >= 2) {
        defects.push({
          kind: 'duplicate',
          severity: 'yellow',
          featureId: b.id,
          otherFeatureId: a.id,
          at: b.vertices[0],
          metric: 1,
          detail: 'duplicate line laid over an existing feature',
        });
      }
    }
  }

  let totalPenalty = 0;
  for (const feature of features) {
    let featurePenalty = 0;
    for (const defect of defects) {
      if (defect.featureId === feature.id) {
        featurePenalty += DEFECT_WEIGHT[defect.kind] * defect.metric;
      }
    }
    totalPenalty += Math.min(1, featurePenalty);
  }

  const score = Math.round(100 * Math.max(0, 1 - totalPenalty / features.length));
  return { usable: true, score, defects, featuresAudited: features.length, pavementCoverage: field.coverage };
}

// ─────────────────────────────────────────────────────────────────────────────
// Repair
// ─────────────────────────────────────────────────────────────────────────────

/** Remove spikes and near-duplicate consecutive vertices. */
export function despikeVertices(vertices: DraftVertex[]): DraftVertex[] {
  const cleaned: DraftVertex[] = [];
  for (const v of vertices) {
    if (cleaned.length === 0 || distance(cleaned[cleaned.length - 1], v) > 0.02) {
      cleaned.push(v);
    }
  }
  let changed = true;
  while (changed && cleaned.length > 2) {
    changed = false;
    for (let i = 1; i < cleaned.length - 1; i++) {
      const a = cleaned[i - 1];
      const b = cleaned[i];
      const c = cleaned[i + 1];
      const ab = distance(a, b);
      const bc = distance(b, c);
      if (ab < 2 && bc < 2) {
        // Spike: replace the point with the chord midpoint.
        cleaned.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return cleaned;
}

interface SnapOutcome {
  vertices: DraftVertex[];
  movedFt: number;
  accepted: boolean;
  method: 'snap_edge' | 'snap_center';
}

function snapFeatureToEvidence(
  feature: DraftFeature,
  field: PavementField,
  bounds: SynthesisBounds,
): SnapOutcome | null {
  if (feature.isClosed || feature.role === 'unknown') return null;
  const method = feature.role === 'centerline' ? 'snap_center' : 'snap_edge';
  const samples = featureSamples(feature, field, bounds);
  if (samples.length < 2) return null;

  const ftPerPx = 2 / Math.max(1e-9, field.pxPerFtE + field.pxPerFtN);
  // Edge quality is "close to a boundary" (small |signed|); centreline quality
  // is "far from both boundaries" (large signed distance, toward the medial
  // axis). Score each role with its own objective.
  const evidenceCost = (x: number, y: number) => {
    const signed = sampleSigned(field, x, y);
    return method === 'snap_edge' ? Math.abs(signed) : signed;
  };
  const beforeCost = samples.reduce((sum, s) => sum + evidenceCost(s.x, s.y), 0) / samples.length;

  const maxRadius = Math.max(16, Math.min(120, Math.round(Math.min(field.width, field.height) * 0.45)));
  const snapped: Array<{ x: number; y: number }> = [];
  let hint: { x: number; y: number } | undefined;
  let misses = 0;

  for (const sample of samples) {
    const point = method === 'snap_edge'
      ? snapEdgePoint(field, sample.x, sample.y, maxRadius, hint)
      : snapCenterPoint(field, sample.x, sample.y, maxRadius, hint);
    if (!point) {
      misses++;
      snapped.push(sample);
      hint = sample;
    } else {
      snapped.push(point);
      hint = point;
    }
  }

  // Not enough image support — leave the feature alone rather than guess.
  if (misses > snapped.length * 0.5) return null;

  // Smooth the snapped path so per-sample jitter does not become CAD vertices.
  let smoothed = snapped;
  for (let pass = 0; pass < 2; pass++) {
    const next = [...smoothed];
    for (let i = 1; i < smoothed.length - 1; i++) {
      next[i] = {
        x: smoothed[i - 1].x * 0.25 + smoothed[i].x * 0.5 + smoothed[i + 1].x * 0.25,
        y: smoothed[i - 1].y * 0.25 + smoothed[i].y * 0.5 + smoothed[i + 1].y * 0.25,
      };
    }
    smoothed = next;
  }

  const simplified = simplifyPixelPath(smoothed, 0.9);
  const vertices = simplified.map(p => pixelToWorld(p.x, p.y, field, bounds));
  if (vertices.length < 2) return null;

  const afterCost = simplified.reduce((sum, p) => sum + evidenceCost(p.x, p.y), 0) / simplified.length;

  // Never accept a repair that collapses the feature or fails to improve the
  // image evidence. Extent along the dominant axis (not raw path length) is the
  // collapse guard: a legitimate sawtooth repair removes cross-corridor travel.
  const extentBefore = axisExtent(feature.vertices);
  const extentAfter = axisExtent(vertices);
  if (extentAfter < extentBefore * 0.6) return null;
  const improved = method === 'snap_edge'
    ? afterCost < beforeCost - 0.25
    : afterCost > beforeCost + 0.25;
  if (!improved) return null;

  // Mean displacement in feet, for the fieldbook log.
  let moved = 0;
  for (let i = 0; i < Math.min(feature.vertices.length, vertices.length); i++) {
    moved += distance(feature.vertices[i], vertices[i]);
  }
  moved /= Math.max(1, Math.min(feature.vertices.length, vertices.length));

  return {
    vertices,
    movedFt: moved,
    accepted: moved > 0.25,
    method,
  };
}

function polylineLength(vertices: DraftVertex[]): number {
  let total = 0;
  for (let i = 0; i < vertices.length - 1; i++) total += distance(vertices[i], vertices[i + 1]);
  return total;
}

/** Spread of the feature along its dominant axis — a collapse guard. */
function axisExtent(vertices: DraftVertex[]): number {
  if (vertices.length < 2) return 0;
  const { ux, uy } = principalAxis(vertices);
  const c = centroid(vertices);
  let min = Infinity;
  let max = -Infinity;
  for (const v of vertices) {
    const p = (v.easting - c.easting) * ux + (v.northing - c.northing) * uy;
    if (p < min) min = p;
    if (p > max) max = p;
  }
  return max - min;
}

function pickConsistentSide(vertices: DraftVertex[]): DraftVertex[] {
  if (vertices.length < 4) return vertices;
  const { ux, uy } = principalAxis(vertices);
  const c = centroid(vertices);
  const offsets = vertices.map(v => -(v.easting - c.easting) * uy + (v.northing - c.northing) * ux);
  const firstSign = offsets[0] >= 0 ? 1 : -1;
  let positive = 0;
  let negative = 0;
  for (const offset of offsets) {
    if (offset > 2) positive++;
    else if (offset < -2) negative++;
  }
  const keepSign = positive === negative ? firstSign : positive > negative ? 1 : -1;
  const kept = vertices.filter((_, i) => {
    const offset = offsets[i];
    if (Math.abs(offset) <= 2) return true; // centre points do not choose a side
    return (offset >= 0 ? 1 : -1) === keepSign;
  });
  return kept.length >= 2 ? kept : vertices;
}

interface FeatureRepairOutcome {
  feature: DraftFeature;
  changed: boolean;
  repairs: SynthesisRepair[];
}

function repairFeature(
  feature: DraftFeature,
  field: PavementField,
  bounds: SynthesisBounds,
  defects: SynthesisDefect[],
): FeatureRepairOutcome {
  const repairs: SynthesisRepair[] = [];
  let vertices = feature.vertices;
  let changed = false;

  const featureDefects = defects.filter(d => d.featureId === feature.id);
  const hasZigzag = featureDefects.some(d => d.kind === 'zigzag' || d.kind === 'self_intersection');
  const hasSpur = featureDefects.some(d => d.kind === 'spur');

  // 1. Sawtooth / crossing connections: force one corridor side and order the
  //    points along the feature before any image snapping.
  if (hasZigzag && !feature.isClosed && vertices.length >= 4) {
    const sided = pickConsistentSide(vertices);
    const ordered = orderAlongPrincipalAxis(sided);
    if (ordered.length >= 2) {
      vertices = ordered;
      changed = true;
      repairs.push({
        kind: 'reorder',
        featureId: feature.id,
        detail: `re-ordered ${feature.vertices.length} vertices onto one corridor side (no more cross-corridor sawtooth)`,
      });
    }
  }

  // 2. Spikes.
  if (hasSpur) {
    const cleaned = despikeVertices(vertices);
    if (cleaned.length >= 2 && cleaned.length !== vertices.length) {
      vertices = cleaned;
      changed = true;
      repairs.push({
        kind: 'despike',
        featureId: feature.id,
        detail: `removed ${feature.vertices.length - cleaned.length} spike vertex(es)`,
      });
    }
  }

  // 3. Image-truth snap. This is the pass that pulls a line out of the middle
  //    of a road bed and onto the painted/visible edge (or centreline).
  const candidate: DraftFeature = { ...feature, vertices };
  const snap = snapFeatureToEvidence(candidate, field, bounds);
  if (snap && snap.accepted) {
    vertices = snap.vertices;
    changed = true;
    repairs.push({
      kind: snap.method,
      featureId: feature.id,
      detail: snap.method === 'snap_edge'
        ? `snapped edge to the visible pavement boundary (moved ${snap.movedFt.toFixed(1)} ft)`
        : `snapped centreline to the pavement medial axis (moved ${snap.movedFt.toFixed(1)} ft)`,
    });
  }

  return {
    feature: { ...feature, vertices },
    changed,
    repairs,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rebuild draft lines
// ─────────────────────────────────────────────────────────────────────────────

function buildLineFromTemplate<T extends DraftLineLike>(
  template: T,
  a: DraftVertex,
  b: DraftVertex,
  featureId: string,
  segmentIndex: number,
): T {
  const inv = inverse(
    { easting: a.easting, northing: a.northing },
    { easting: b.easting, northing: b.northing },
  );
  const z = template.fromPt?.z ?? template.toPt?.z ?? 0;

  return {
    ...template,
    // Keep a stable id so run-tracking (e.g. Roading corridor clear) can still
    // remove these rebuilt segments.
    id: template.id ? `${template.id}-qa-${segmentIndex}` : undefined,
    from: `QA-${featureId}-${segmentIndex}`,
    to: `QA-${featureId}-${segmentIndex + 1}`,
    fromPt: { x: a.easting, y: a.northing, z },
    toPt: { x: b.easting, y: b.northing, z },
    bearing: formatBearing(inv.bearing),
    distance: inv.distance.toFixed(2),
    chordBearing: undefined,
    chordDistance: undefined,
    tangentBearing: undefined,
    isCurve: false,
    isCircle: false,
    curveRadius: undefined,
    arcLength: undefined,
    curveDirection: undefined,
    circleCenter: undefined,
    polylineId: `${template.polylineId || featureId}-qa`,
  } as T;
}

function rebuildLines<T extends DraftLineLike>(
  lines: T[],
  originalFeatures: DraftFeature[],
  repairedFeatures: DraftFeature[],
  changedFeatureIds: Set<string>,
): T[] {
  if (changedFeatureIds.size === 0) return lines;

  // Collect source lines from the ORIGINAL features so dropped duplicates are
  // removed too, then rebuild only the surviving repaired features.
  const changedIndexes = new Set<number>();
  for (const feature of originalFeatures) {
    if (!changedFeatureIds.has(feature.id)) continue;
    for (const index of feature.sourceLineIndexes) changedIndexes.add(index);
  }
  const changedFeatures = repairedFeatures.filter(feature => changedFeatureIds.has(feature.id));

  const kept = lines.filter((_, index) => !changedIndexes.has(index));
  const rebuilt: T[] = [];
  for (const feature of changedFeatures) {
    const template = lines[feature.sourceLineIndexes[0]];
    if (!template) continue;
    for (let i = 0; i < feature.vertices.length - 1; i++) {
      rebuilt.push(buildLineFromTemplate(template, feature.vertices[i], feature.vertices[i + 1], feature.id, i));
    }
    if (feature.isClosed && feature.vertices.length > 2) {
      rebuilt.push(buildLineFromTemplate(
        template,
        feature.vertices[feature.vertices.length - 1],
        feature.vertices[0],
        feature.id,
        feature.vertices.length - 1,
      ));
    }
  }

  return [...kept, ...rebuilt];
}

// ─────────────────────────────────────────────────────────────────────────────
// Overlay (annotated before/after evidence frame for the HUD)
// ─────────────────────────────────────────────────────────────────────────────

export function renderSynthesisOverlay(
  evidence: RasterEvidence,
  before: DraftFeature[],
  after: DraftFeature[],
  defects: SynthesisDefect[],
): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const maxSide = 520;
    const scale = Math.min(1, maxSide / Math.max(evidence.width, evidence.height));
    const width = Math.max(64, Math.round(evidence.width * scale));
    const height = Math.max(64, Math.round(evidence.height * scale));

    const source = document.createElement('canvas');
    source.width = evidence.width;
    source.height = evidence.height;
    const sourceCtx = source.getContext('2d');
    if (!sourceCtx) return null;
    const imageData = sourceCtx.createImageData(evidence.width, evidence.height);
    imageData.data.set(evidence.data);
    sourceCtx.putImageData(imageData, 0, 0);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, width, height);

    const spanE = Math.max(evidence.bounds.maxE - evidence.bounds.minE, 1e-9);
    const spanN = Math.max(evidence.bounds.maxN - evidence.bounds.minN, 1e-9);
    const sx = (v: DraftVertex) => ((v.easting - evidence.bounds.minE) / spanE) * width;
    const sy = (v: DraftVertex) => ((evidence.bounds.maxN - v.northing) / spanN) * height;

    const strokeFeature = (feature: DraftFeature, color: string, dashed: boolean) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash(dashed ? [5, 4] : []);
      ctx.beginPath();
      feature.vertices.forEach((v, i) => {
        if (i === 0) ctx.moveTo(sx(v), sy(v));
        else ctx.lineTo(sx(v), sy(v));
      });
      if (feature.isClosed) ctx.closePath();
      ctx.stroke();
      ctx.restore();
    };

    for (const feature of before) strokeFeature(feature, 'rgba(248,113,113,0.9)', true);
    for (const feature of after) strokeFeature(feature, 'rgba(52,211,153,0.95)', false);

    for (const defect of defects) {
      const x = sx(defect.at);
      const y = sy(defect.at);
      ctx.save();
      ctx.fillStyle = defect.severity === 'red' ? '#F43F5E' : '#FBBF24';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, width, 18);
    ctx.fillStyle = '#93C5FD';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('SYNTHESIS QA  ·  red = drafted  ·  green = corrected', 6, 12);
    ctx.restore();

    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Raster capture
// ─────────────────────────────────────────────────────────────────────────────

function imageSize(image: CanvasImageSource): { width: number; height: number } {
  const anyImage = image as any;
  return {
    width: anyImage.naturalWidth || anyImage.width || 256,
    height: anyImage.naturalHeight || anyImage.height || 256,
  };
}

/**
 * Render the active background imagery into a north-up evidence raster tied to
 * project coordinates. Returns null when no imagery is available or the canvas
 * is tainted (CORS).
 */
export function captureRasterEvidence(opts: {
  bounds: SynthesisBounds;
  mapTiles?: SynthesisMapTile[];
  backgroundImage?: SynthesisBackgroundImage | null;
  maxSide?: number;
  label?: string;
}): RasterEvidence | null {
  if (typeof document === 'undefined') return null;

  const { bounds } = opts;
  const spanE = bounds.maxE - bounds.minE;
  const spanN = bounds.maxN - bounds.minN;
  if (!(spanE > 0) || !(spanN > 0)) return null;

  const maxSide = opts.maxSide ?? 640;
  const pxPerFt = maxSide / Math.max(spanE, spanN);
  const width = Math.max(64, Math.min(1600, Math.round(spanE * pxPerFt)));
  const height = Math.max(64, Math.min(1600, Math.round(spanN * pxPerFt)));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, width, height);

  const toScreen = (e: number, n: number): [number, number] => [
    ((e - bounds.minE) / spanE) * width,
    ((bounds.maxN - n) / spanN) * height,
  ];

  let drewImagery = false;

  for (const tile of opts.mapTiles ?? []) {
    if (!tile.image) continue;
    const opacity = tile.opacity ?? 0.95;
    const { width: iw, height: ih } = imageSize(tile.image);
    if (!iw || !ih) continue;

    if (tile.quad && tile.quad.length >= 4) {
      const [tlX, tlY] = toScreen(tile.quad[0][0], tile.quad[0][1]);
      const [trX, trY] = toScreen(tile.quad[1][0], tile.quad[1][1]);
      const [blX, blY] = toScreen(tile.quad[3][0], tile.quad[3][1]);
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.translate(tlX, tlY);
      ctx.transform((trX - tlX) / iw, (trY - tlY) / iw, (blX - tlX) / ih, (blY - tlY) / ih, 0, 0);
      try {
        ctx.drawImage(tile.image, 0, 0, iw, ih);
        drewImagery = true;
      } catch {
        // Skip an unriffable tile; others may still cover the extent.
      }
      ctx.restore();
    } else if (tile.bbox) {
      const [tMinE, tMinN, tMaxE, tMaxN] = tile.bbox;
      const [x0, yTop] = toScreen(tMinE, tMaxN);
      const [x1, yBottom] = toScreen(tMaxE, tMinN);
      const w = x1 - x0;
      const h = yBottom - yTop;
      if (w > 0 && h > 0) {
        ctx.save();
        ctx.globalAlpha = opacity;
        try {
          ctx.drawImage(tile.image, x0, yTop, w, h);
          drewImagery = true;
        } catch {
          // Ignore individual tile failures.
        }
        ctx.restore();
      }
    }
  }

  if (!drewImagery && opts.backgroundImage?.image) {
    const bgBounds = opts.backgroundImage.bounds ?? bounds;
    const [x0, yTop] = toScreen(bgBounds.minE, bgBounds.maxN);
    const [x1, yBottom] = toScreen(bgBounds.maxE, bgBounds.minN);
    try {
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.drawImage(opts.backgroundImage.image, x0, yTop, x1 - x0, yBottom - yTop);
      ctx.restore();
      drewImagery = true;
    } catch {
      drewImagery = false;
    }
  }

  if (!drewImagery) return null;

  try {
    const imageData = ctx.getImageData(0, 0, width, height);
    return {
      width,
      height,
      data: imageData.data,
      bounds,
      label: opts.label ?? 'background imagery',
    };
  } catch {
    // Tainted canvas — the imagery is cross-origin and unreadable.
    return null;
  }
}

/** Padded bounds covering every line endpoint. */
export function boundsFromLines(
  lines: Array<{ fromPt?: { x: number; y: number }; toPt?: { x: number; y: number } }>,
  padRatio = 0.15,
): SynthesisBounds | null {
  let minE = Infinity;
  let maxE = -Infinity;
  let minN = Infinity;
  let maxN = -Infinity;
  for (const line of lines) {
    for (const pt of [line.fromPt, line.toPt]) {
      if (!pt) continue;
      if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
      if (pt.x < minE) minE = pt.x;
      if (pt.x > maxE) maxE = pt.x;
      if (pt.y < minN) minN = pt.y;
      if (pt.y > maxN) maxN = pt.y;
    }
  }
  if (!Number.isFinite(minE) || !Number.isFinite(minN)) return null;
  if (maxE <= minE || maxN <= minN) {
    minE -= 10;
    maxE += 10;
    minN -= 10;
    maxN += 10;
  }
  const padE = Math.max((maxE - minE) * padRatio, 10);
  const padN = Math.max((maxN - minN) * padRatio, 10);
  return { minE: minE - padE, maxE: maxE + padE, minN: minN - padN, maxN: maxN + padN };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public verification entry points
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Audit + repair drafted linework against an evidence raster.
 *
 * The returned lines are the ORIGINAL array unless a repair was accepted, and a
 * repair is only accepted when the audited evidence score improves.
 */
export function verifySynthesizedLineworkWithEvidence<T extends DraftLineLike>(
  lines: T[],
  evidence: RasterEvidence,
  opts: {
    maxIterations?: number;
    pavementPixelTest?: (r: number, g: number, b: number) => boolean;
    renderOverlay?: boolean;
  } = {},
): SynthesisVerificationResult<T> {
  const startedAt = Date.now();
  const bounds = evidence.bounds;
  const field = buildPavementField(evidence, opts.pavementPixelTest);
  const features = groupLinesIntoFeatures(lines);

  const before = auditSynthesisFeatures(features, field, bounds);
  if (!before.usable || features.length === 0) {
    return {
      lines,
      changed: false,
      report: {
        status: 'unverified',
        scoreBefore: before.score,
        scoreAfter: before.score,
        defectsFound: before.defects.length,
        defectsCorrected: 0,
        featuresAudited: features.length,
        repairs: [],
        pavementCoverage: field.coverage,
        evidenceLabel: evidence.label,
        durationMs: Date.now() - startedAt,
      },
    };
  }

  let bestFeatures = features;
  let bestAudit = before;
  let bestRepairs: SynthesisRepair[] = [];
  const maxIterations = Math.max(1, Math.min(3, opts.maxIterations ?? 2));

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    if (bestAudit.score >= 98 && bestAudit.defects.length === 0) break;

    const repairedFeatures: DraftFeature[] = [];
    const repairs: SynthesisRepair[] = [];
    const duplicateIds = new Set(
      bestAudit.defects.filter(d => d.kind === 'duplicate').map(d => d.featureId),
    );

    for (const feature of bestFeatures) {
      if (duplicateIds.has(feature.id)) {
        repairs.push({
          kind: 'dedupe',
          featureId: feature.id,
          detail: 'removed duplicate line laid over an existing feature',
        });
        continue;
      }
      const outcome = repairFeature(feature, field, bounds, bestAudit.defects);
      repairedFeatures.push(outcome.feature);
      repairs.push(...outcome.repairs);
    }

    const candidate = auditSynthesisFeatures(repairedFeatures, field, bounds);
    if (!candidate.usable) break;

    const accepted = candidate.score > bestAudit.score
      || (candidate.score === bestAudit.score && candidate.defects.length < bestAudit.defects.length);
    if (!accepted) break;

    bestFeatures = repairedFeatures;
    bestAudit = candidate;
    bestRepairs = repairs;

    if (repairs.length === 0) break;
  }

  const changedFeatureIds = new Set(
    bestFeatures
      .filter((feature, index) => {
        const original = features.find(f => f.id === feature.id);
        if (!original) return false;
        return original.vertices.length !== feature.vertices.length
          || original.vertices.some((v, i) => distance(v, feature.vertices[i] ?? v) > 0.01);
      })
      .map(feature => feature.id),
  );

  // Features dropped as duplicates are also a change.
  const survivingIds = new Set(bestFeatures.map(f => f.id));
  for (const feature of features) {
    if (!survivingIds.has(feature.id)) changedFeatureIds.add(feature.id);
  }

  const repairedLines = rebuildLines(lines, features, bestFeatures, changedFeatureIds);
  const scoreImproved = bestAudit.score > before.score
    || bestAudit.defects.length < before.defects.length;

  if (!scoreImproved) {
    return {
      lines,
      changed: false,
      report: {
        status: before.defects.length === 0 ? 'clean' : 'unverified',
        scoreBefore: before.score,
        scoreAfter: before.score,
        defectsFound: before.defects.length,
        defectsCorrected: 0,
        featuresAudited: features.length,
        repairs: [],
        pavementCoverage: field.coverage,
        evidenceLabel: evidence.label,
        durationMs: Date.now() - startedAt,
      },
    };
  }

  const repairText = bestRepairs.map(r => r.detail);
  const overlay = opts.renderOverlay === false
    ? undefined
    : renderSynthesisOverlay(evidence, features, bestFeatures, before.defects);

  return {
    lines: repairedLines,
    changed: changedFeatureIds.size > 0,
    report: {
      status: changedFeatureIds.size > 0 ? 'corrected' : 'clean',
      scoreBefore: before.score,
      scoreAfter: bestAudit.score,
      defectsFound: before.defects.length,
      defectsCorrected: Math.max(0, before.defects.length - bestAudit.defects.length),
      featuresAudited: features.length,
      repairs: repairText,
      pavementCoverage: field.coverage,
      evidenceLabel: evidence.label,
      overlayDataUrl: overlay ?? undefined,
      durationMs: Date.now() - startedAt,
    },
  };
}

/**
 * Capture the active background imagery and run the synthesis verification
 * pass. Safe to call on every synthesis turn: returns an `unverified` report
 * (and the untouched lines) when there is no usable imagery.
 */
export function verifySynthesizedLinework<T extends DraftLineLike>(
  lines: T[],
  opts: SynthesisVerifyOptions,
): SynthesisVerificationResult<T> {
  const evidence = captureRasterEvidence({
    bounds: opts.bounds,
    mapTiles: opts.mapTiles,
    backgroundImage: opts.backgroundImage,
    label: 'background imagery',
  });

  if (!evidence) {
    return {
      lines,
      changed: false,
      report: {
        status: 'unverified',
        scoreBefore: 0,
        scoreAfter: 0,
        defectsFound: 0,
        defectsCorrected: 0,
        featuresAudited: 0,
        repairs: [],
        pavementCoverage: 0,
        durationMs: 0,
      },
    };
  }

  return verifySynthesizedLineworkWithEvidence(lines, evidence, {
    maxIterations: opts.maxIterations,
    pavementPixelTest: opts.pavementPixelTest,
    renderOverlay: opts.renderOverlay,
  });
}

/** One-line fieldbook summary of a QA pass. */
export function formatSynthesisQaSummary(report: SynthesisQaReport): string {
  if (report.status === 'unverified') {
    return 'Gimbal Synthesis QA: imagery could not be verified (no readable pavement evidence) — linework left unchanged.';
  }
  if (report.status === 'clean') {
    return `Gimbal Synthesis QA: linework verified against background imagery (${report.scoreBefore}% → ${report.scoreAfter}%, ${report.featuresAudited} feature${report.featuresAudited === 1 ? '' : 's'}).`;
  }
  return `Gimbal Synthesis QA: corrected ${report.defectsCorrected} of ${report.defectsFound} defect${report.defectsFound === 1 ? '' : 's'} against background imagery (${report.scoreBefore}% → ${report.scoreAfter}%, ${report.featuresAudited} feature${report.featuresAudited === 1 ? '' : 's'}).`;
}
