/**
 * roadTakeReview.ts
 *
 * CIVIL DRAFTER — MULTI-TAKE ROAD REVIEW
 * ─────────────────────────────────────
 * A road is not just a set of points: it is a continuous corridor with two
 * parallel pavement edges, a centerline, and branches that T into it. A drafter
 * looks at a take, sees the gaps / crossing line / orphan stub, and draws it
 * again. This module gives the Civil Drafter the same discipline without needing
 * background imagery:
 *
 *   TAKE 1  audit the emitted linework for civil-sense defects — gaps in an
 *           edge, edges that cross, sawtooth self-intersections, orphan stubs,
 *           duplicates, a centerline that runs past its pavement, an alignment
 *           with no OSM / parcel support.
 *   TAKE 2  repair what is unambiguous — stitch two collinear runs that were
 *           separated by a survey gap, drop orphan stubs and duplicate lines,
 *           remove a short stray line that cuts across the corridor.
 *   TAKE 3  re-audit the repaired take, stitch again where a dropped fragment
 *           exposed another gap, and keep the result only when the score
 *           improves. Anything still wrong is returned as a critique so the
 *           caller can show it to the model (or the user) instead of pretending
 *           the take is clean.
 *
 * GROUNDING
 * ─────────
 * When the aerial is all tree canopy the imagery cannot support a synthesis.
 * Parcel frontage lines and OpenStreetMap road ways still say where a road can
 * run, so they are accepted as grounding evidence: they may justify stitching a
 * broad survey gap and they let the reviewer say "this line has no parcel or OSM
 * support" rather than guessing from the pixels.
 *
 * All geometry is in project coordinates (feet unless the project CRS says
 * otherwise).
 */

import type { SurveyLine } from '../types.ts';
import { formatBearing, inverse } from './cogo.ts';
import { polylinesCross, polylineSelfIntersects } from './linework.ts';
import {
  isPavementLayer,
  isRoadPaintLayer,
  pavementRoleFor,
  type DraftLineLike,
  type DraftVertex,
  type PavementRole,
  type SynthesisBounds,
} from './synthesisVerification.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** A road way used as grounding evidence (OSM or an already-drafted OSM way). */
export interface GroundingWay {
  name?: string;
  vertices: DraftVertex[];
  source?: 'osm' | 'canvas';
}

/** Extra evidence the reviewer can lean on when the imagery is unusable. */
export interface RoadGrounding {
  /** Tax-parcel frontage linework already on the canvas. */
  parcelLines?: DraftLineLike[];
  /** OpenStreetMap road ways reprojected into the project frame. */
  osmWays?: GroundingWay[];
}

export type RoadDefectKind =
  | 'gap'
  | 'crossing'
  | 'self_intersection'
  | 'stub'
  | 'duplicate'
  | 'unsupported_alignment'
  | 'corridor_incomplete'
  | 'convergence'
  | 'unused_survey';

export interface RoadDefect {
  kind: RoadDefectKind;
  severity: 'red' | 'yellow';
  featureId: string;
  otherFeatureId?: string;
  at: DraftVertex;
  /** 0..1, how bad the offence is. */
  metric: number;
  detail: string;
}

export interface RoadFeature {
  id: string;
  layer?: string;
  polylineId?: string;
  role: PavementRole;
  vertices: DraftVertex[];
  isClosed: boolean;
  /** Indexes into the caller's line array. */
  sourceLineIndexes: number[];
}

export interface RoadTakeReport {
  status: 'clean' | 'corrected' | 'needs_retake';
  /** Number of review takes actually run (1..maxTakes). */
  takes: number;
  scoreBefore: number;
  scoreAfter: number;
  defectsFound: number;
  defectsCorrected: number;
  featuresAudited: number;
  repairs: string[];
  /** Unresolved defects as plain civil-drafting language. */
  remaining: string[];
  grounding: {
    osmWays: number;
    parcelSegments: number;
    supportedFeatures: number;
    unsupportedFeatures: number;
  };
  /** True when the take had no pavement layer, so road geometry was inferred from shape. */
  inferredFromGeometry?: boolean;
  durationMs: number;
}

export interface RoadTakeResult<T extends DraftLineLike> {
  lines: T[];
  changed: boolean;
  report: RoadTakeReport;
}

export interface RoadSurveyPoint {
  easting: number;
  northing: number;
  description?: string;
  pointNumber?: string;
}

export interface RoadTakeOptions {
  maxTakes?: number;
  /** A gap at or below this is always bridgeable along a continuous corridor. */
  autoBridgeFt?: number;
  /** A gap up to this is bridgeable when an OSM way or parcel line supports it. */
  maxBridgeFt?: number;
  /** Consecutive-vertex break that counts as a defect (default: adaptive). */
  maxGapFt?: number;
  /** Audit long unlabeled linework (L-LINEWORK, blank layer) when the take has
   * no explicit pavement layer. Civil Drafter's default layer is L-LINEWORK. */
  inferUnlabeledRoads?: boolean;
  /** Field shots used to extend a terminal edge/centerline to the last surveyed
   * road point. Parcel geometry is deliberately not used for this. */
  surveyPoints?: RoadSurveyPoint[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometry helpers
// ─────────────────────────────────────────────────────────────────────────────

function distance(a: DraftVertex, b: DraftVertex): number {
  return Math.hypot(a.easting - b.easting, a.northing - b.northing);
}

function polylineLength(vertices: DraftVertex[]): number {
  let total = 0;
  for (let i = 0; i < vertices.length - 1; i++) total += distance(vertices[i], vertices[i + 1]);
  return total;
}

function pointToSegmentDistance(p: DraftVertex, a: DraftVertex, b: DraftVertex): number {
  const dx = b.easting - a.easting;
  const dy = b.northing - a.northing;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p.easting - a.easting) * dx + (p.northing - a.northing) * dy) / lenSq));
  return Math.hypot(p.easting - (a.easting + t * dx), p.northing - (a.northing + t * dy));
}

function pointToPolylineDistance(p: DraftVertex, vertices: DraftVertex[]): number {
  if (vertices.length === 0) return Infinity;
  if (vertices.length === 1) return distance(p, vertices[0]);
  let best = Infinity;
  for (let i = 0; i < vertices.length - 1; i++) {
    const d = pointToSegmentDistance(p, vertices[i], vertices[i + 1]);
    if (d < best) best = d;
  }
  return best;
}

function meanDistanceToPolyline(points: DraftVertex[], polyline: DraftVertex[]): number {
  if (points.length === 0 || polyline.length < 2) return Infinity;
  let total = 0;
  for (const p of points) total += pointToPolylineDistance(p, polyline);
  return total / points.length;
}

function medianStep(vertices: DraftVertex[]): number {
  if (vertices.length < 2) return 0;
  const gaps: number[] = [];
  for (let i = 1; i < vertices.length; i++) {
    const d = distance(vertices[i - 1], vertices[i]);
    if (d > 0.25) gaps.push(d);
  }
  if (gaps.length === 0) return 0;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

/** True when one feature terminates on the other (a T-junction / corner), which
 * is a legal connection rather than a line crossing the corridor. */
function featuresMeetAtJunction(a: RoadFeature, b: RoadFeature, tolerance = 2): boolean {
  const aEnds = [a.vertices[0], a.vertices[a.vertices.length - 1]];
  const bEnds = [b.vertices[0], b.vertices[b.vertices.length - 1]];
  return aEnds.some(point => pointToPolylineDistance(point, b.vertices) <= tolerance)
    || bEnds.some(point => pointToPolylineDistance(point, a.vertices) <= tolerance);
}

function unitVector(from: DraftVertex, to: DraftVertex): { x: number; y: number } | null {
  const dx = to.easting - from.easting;
  const dy = to.northing - from.northing;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return null;
  return { x: dx / length, y: dy / length };
}

function midpoint(a: DraftVertex, b: DraftVertex): DraftVertex {
  return { easting: (a.easting + b.easting) / 2, northing: (a.northing + b.northing) / 2 };
}

function roadFeatureLabel(role: RoadFeature['role']): string {
  if (role === 'centerline') return 'centerline';
  if (role === 'paint') return 'paint run';
  return 'pavement edge';
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
  if (Math.hypot(tx - fx, ty - fy) < 1e-6) return null;
  return [
    { easting: fx, northing: fy },
    { easting: tx, northing: ty },
  ];
}

function pointsClose(a: DraftVertex, b: DraftVertex, eps = 0.05): boolean {
  return Math.abs(a.easting - b.easting) <= eps && Math.abs(a.northing - b.northing) <= eps;
}

/** Chain unordered segments of one group into ordered vertex runs. */
function chainSegments(segments: SegmentLike[]): DraftVertex[][] {
  const edges: Array<[DraftVertex, DraftVertex]> = [];
  for (const segment of segments) {
    const ends = lineEndpoints(segment.line);
    if (ends) edges.push(ends);
  }
  if (edges.length === 0) return [];

  const used = new Array<boolean>(edges.length).fill(false);
  const runs: DraftVertex[][] = [];

  for (let seed = 0; seed < edges.length; seed++) {
    if (used[seed]) continue;
    used[seed] = true;
    const path = [edges[seed][0], edges[seed][1]];

    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < edges.length; i++) {
        if (used[i]) continue;
        const [a, b] = edges[i];
        const head = path[0];
        const tail = path[path.length - 1];
        if (pointsClose(tail, a)) {
          path.push(b);
        } else if (pointsClose(tail, b)) {
          path.push(a);
        } else if (pointsClose(head, b)) {
          path.unshift(a);
        } else if (pointsClose(head, a)) {
          path.unshift(b);
        } else {
          continue;
        }
        used[i] = true;
        grew = true;
      }
    }

    if (path.length >= 2) {
      const closed = path.length > 3 && pointsClose(path[0], path[path.length - 1]);
      runs.push(closed ? path.slice(0, -1) : path);
    }
  }

  return runs;
}

/** Layers/ids that must never be inferred as road linework when the model omits
 * an explicit pavement layer. */
const GENERIC_ROAD_EXCLUDE_RE = /(PARCEL|TAX.?LOT|BOUNDARY|DEED|PROPERTY|CONTOUR|TOPO|UTIL|FEMA|FLOOD|SOILS|TREE|VEG|SHRINK|BUILDING|BLDG|HOUSE|ROOF|WALL|FENCE|LABEL|TEXT|HATCH|DIMENSION|GRID)/i;

function isGenericRoadCandidate(line: DraftLineLike): boolean {
  if (line.isCurve || line.isCircle || line.curveRadius) return false;
  const value = `${line.layer ?? ''} ${line.polylineId ?? ''}`;
  if (GENERIC_ROAD_EXCLUDE_RE.test(value)) return false;
  const ends = lineEndpoints(line);
  return Boolean(ends && distance(ends[0], ends[1]) >= 20);
}

/** Group pavement lines into ordered corridor features. When
 * `includeGenericLinework` is set, long unlabeled lines are treated as pavement
 * edges — this is how a take emitted on `L-LINEWORK` still gets reviewed. */
export function groupRoadFeatures(
  lines: DraftLineLike[],
  options: { includeGenericLinework?: boolean } = {},
): RoadFeature[] {
  const includeGeneric = options.includeGenericLinework === true;
  const groups = new Map<string, SegmentLike[]>();

  lines.forEach((line, index) => {
    if (line.hidden) return;
    if (line.isCurve || line.isCircle || line.curveRadius) return; // curves are left untouched
    const paint = isRoadPaintLayer(line.layer, line.polylineId);
    const explicitPavement = isPavementLayer(line.layer, line.polylineId);
    if (!explicitPavement && !paint && (!includeGeneric || !isGenericRoadCandidate(line))) return;
    if (!lineEndpoints(line)) return;
    // Prefer the polyline grouping; loose segments on the same layer are chained
    // together below so a take emitted as individual lines still reads as one
    // corridor.
    const key = line.polylineId && line.polylineId.trim()
      ? `pid:${line.polylineId}`
      : `loose:${line.layer ?? 'unknown'}`;
    const bucket = groups.get(key) ?? [];
    bucket.push({ line, index });
    groups.set(key, bucket);
  });

  const features: RoadFeature[] = [];
  let sequence = 0;
  for (const [key, segments] of groups.entries()) {
    const first = segments[0].line;
    const paint = isRoadPaintLayer(first.layer, first.polylineId);
    const explicitPavement = isPavementLayer(first.layer, first.polylineId);
    const role = paint ? 'paint' : explicitPavement ? pavementRoleFor(first.layer, first.polylineId) : 'edge';
    const runs = chainSegments(segments);
    runs.forEach((vertices, runIndex) => {
      const closed = vertices.length > 3 && pointsClose(vertices[0], vertices[vertices.length - 1]);
      // A closed generic run is a building/parcel/pond, not a road edge.
      if (!explicitPavement && !paint && closed) return;
      features.push({
        id: `${key.replace(/[^a-zA-Z0-9_-]/g, '_')}-${sequence++}${runIndex > 0 ? `-r${runIndex}` : ''}`,
        layer: first.layer,
        polylineId: first.polylineId,
        role,
        vertices,
        isClosed: closed,
        sourceLineIndexes: segments.map(s => s.index),
      });
    });
  }

  return mergeConnectedFeatures(features);
}

/** Merge features that share an endpoint (covers line IDs emitted one per segment). */
function mergeConnectedFeatures(features: RoadFeature[]): RoadFeature[] {
  const merged = features.map(feature => ({
    ...feature,
    vertices: feature.vertices.map(v => ({ ...v })),
    sourceLineIndexes: [...feature.sourceLineIndexes],
  }));

  let didMerge = true;
  while (didMerge) {
    didMerge = false;
    for (let i = 0; i < merged.length && !didMerge; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        const a = merged[i];
        const b = merged[j];
        if (a.isClosed || b.isClosed || a.role !== b.role) continue;

        const aFirst = a.vertices[0];
        const aLast = a.vertices[a.vertices.length - 1];
        const bFirst = b.vertices[0];
        const bLast = b.vertices[b.vertices.length - 1];

        let combined: DraftVertex[] | null = null;
        if (pointsClose(aLast, bFirst)) combined = [...a.vertices, ...b.vertices.slice(1)];
        else if (pointsClose(aLast, bLast)) combined = [...a.vertices, ...b.vertices.slice(0, -1).reverse()];
        else if (pointsClose(aFirst, bFirst)) combined = [...a.vertices.slice().reverse(), ...b.vertices.slice(1)];
        else if (pointsClose(aFirst, bLast)) combined = [...b.vertices, ...a.vertices.slice(1)];

        if (!combined) continue;
        merged[i] = {
          ...a,
          vertices: combined,
          isClosed: false,
          sourceLineIndexes: [...a.sourceLineIndexes, ...b.sourceLineIndexes],
        };
        // Fold b's grouping identity into a single feature id.
        merged.splice(j, 1);
        didMerge = true;
        break;
      }
    }
  }

  return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// Grounding evidence
// ─────────────────────────────────────────────────────────────────────────────

interface EvidencePolyline {
  vertices: DraftVertex[];
  label: string;
  kind: 'osm' | 'parcel';
}

function buildEvidence(grounding: RoadGrounding): EvidencePolyline[] {
  const evidence: EvidencePolyline[] = [];

  for (const [index, way] of (grounding.osmWays ?? []).entries()) {
    if (!way.vertices || way.vertices.length < 2) continue;
    evidence.push({
      vertices: way.vertices,
      label: way.name?.trim() ? `OSM way "${way.name}"` : `OSM way ${index + 1}`,
      kind: 'osm',
    });
  }

  for (const line of grounding.parcelLines ?? []) {
    if (line.hidden) continue;
    const ends = lineEndpoints(line);
    if (!ends) continue;
    evidence.push({ vertices: ends, label: 'parcel frontage', kind: 'parcel' });
  }

  return evidence;
}

function nearestEvidence(
  point: DraftVertex,
  evidence: EvidencePolyline[],
  kind?: 'osm' | 'parcel',
): { distance: number; label: string } | null {
  let best: { distance: number; label: string } | null = null;
  for (const item of evidence) {
    if (kind && item.kind !== kind) continue;
    const d = pointToPolylineDistance(point, item.vertices);
    if (!best || d < best.distance) best = { distance: d, label: item.label };
  }
  return best;
}

/** Build grounding from linework already on the canvas (parcels + prior OSM ways). */
export function extractRoadGrounding(lines: DraftLineLike[]): RoadGrounding {
  const parcelLines = lines.filter(line =>
    !line.hidden
    && /PARCEL|TAX.?LOT|CADASTRE/i.test(line.layer ?? '')
    && Boolean(lineEndpoints(line)),
  );

  // Only OSM-derived centerlines are grounding evidence. Prior edge linework is
  // the thing under review, so it must never ground its own replacement.
  const osmLines = lines.filter(line =>
    !line.hidden
    && (line.polylineId ?? '').toLowerCase().startsWith('road-cl-')
    && Boolean(lineEndpoints(line)),
  );
  const osmWays: GroundingWay[] = [];
  const grouped = new Map<string, DraftLineLike[]>();
  for (const line of osmLines) {
    const key = line.polylineId ?? 'road';
    const bucket = grouped.get(key) ?? [];
    bucket.push(line);
    grouped.set(key, bucket);
  }
  for (const [polylineId, group] of grouped.entries()) {
    const runs = chainSegments(group.map((line, index) => ({ line, index })));
    for (const vertices of runs) {
      osmWays.push({ name: polylineId, vertices, source: 'canvas' });
    }
  }

  return { parcelLines, osmWays };
}

/**
 * Fetch OpenStreetMap road ways for the work area and reproject them into the
 * project frame. Read-only and best-effort: any failure returns an empty list so
 * the take review still runs on parcel/survey evidence.
 */
export async function fetchOsmGroundingWays(
  bounds: SynthesisBounds,
  projectEpsg?: number | null,
): Promise<GroundingWay[]> {
  if (typeof fetch !== 'function') return [];
  const spanE = bounds.maxE - bounds.minE;
  const spanN = bounds.maxN - bounds.minN;
  if (!(spanE > 0) || !(spanN > 0)) return [];

  try {
    let bbox: [number, number, number, number];
    if (!projectEpsg || projectEpsg === 4326) {
      bbox = [bounds.minE, bounds.minN, bounds.maxE, bounds.maxN];
    } else {
      const proj4mod = (await import('proj4')).default;
      const corners = [
        [bounds.minE, bounds.minN],
        [bounds.maxE, bounds.minN],
        [bounds.maxE, bounds.maxN],
        [bounds.minE, bounds.maxN],
      ].map(([e, n]) => proj4mod(`EPSG:${projectEpsg}`, 'EPSG:4326', [e, n]) as [number, number]);
      bbox = [
        Math.min(...corners.map(c => c[0])),
        Math.min(...corners.map(c => c[1])),
        Math.max(...corners.map(c => c[0])),
        Math.max(...corners.map(c => c[1])),
      ];
    }

    const { fetchStreetWays } = await import('../services/streetNameService.ts');
    const ways = await fetchStreetWays(bbox);
    const project = !projectEpsg || projectEpsg === 4326
      ? (lon: number, lat: number) => ({ easting: lon, northing: lat })
      : await (async () => {
          const proj4mod = (await import('proj4')).default;
          return (lon: number, lat: number) => {
            const [e, n] = proj4mod('EPSG:4326', `EPSG:${projectEpsg}`, [lon, lat]) as [number, number];
            return { easting: e, northing: n };
          };
        })();

    const result: GroundingWay[] = [];
    for (const way of ways) {
      if (!way.nodes || way.nodes.length < 2) continue;
      const vertices = way.nodes
        .map(node => project(node.lon, node.lat))
        .filter(point => Number.isFinite(point.easting) && Number.isFinite(point.northing));
      if (vertices.length < 2) continue;
      result.push({ name: way.name, vertices, source: 'osm' });
      if (result.length >= 12) break;
    }
    return result;
  } catch {
    return [];
  }
}

/**
 * Compact prompt block that grounds road drafting in parcel frontage and OSM
 * ways. Used when the imagery is useless (canopy/shadow) or as a cross-check on
 * the model's take.
 */
export function buildRoadGroundingContext(args: {
  parcelLines?: DraftLineLike[];
  osmWays?: GroundingWay[];
  review?: RoadTakeReport | null;
}): string {
  const ways = (args.osmWays ?? []).slice(0, 8);
  const parcels = (args.parcelLines ?? []).filter(l => l.fromPt && l.toPt).slice(0, 16);
  const review = args.review;

  const wayLines = ways.length > 0
    ? ways.map(way => {
        const shown = way.vertices.slice(0, 6)
          .map(v => `(${v.easting.toFixed(1)}, ${v.northing.toFixed(1)})`)
          .join(' → ');
        const more = way.vertices.length > 6 ? ` (+${way.vertices.length - 6} more)` : '';
        return `  - ${way.name?.trim() || 'unnamed road'}: ${shown}${more}`;
      })
    : ['  - none available (offline or missing projection) — rely on field shots and corridor logic; parcel lines are a sanity check only'];

  const parcelBlocks = parcels.length > 0
    ? parcels.map(line => {
        const from = line.fromPt!;
        const to = line.toPt!;
        return `  - (${from.x.toFixed(1)}, ${from.y.toFixed(1)}) → (${to.x.toFixed(1)}, ${to.y.toFixed(1)})`;
      })
    : ['  - none loaded (fetch county/tax parcels to strengthen the alignment)'];

  const reviewLine = review
    ? [
        `LAST TAKE REVIEW: ${review.scoreAfter}% · ${review.repairs.length} repair(s) · ` +
        `${review.remaining.length} unresolved defect(s).`,
        ...review.remaining.slice(0, 6).map(detail => `  - ${detail}`),
      ]
    : [];

  return [
    '---BEGIN ROAD GROUNDING — PARCEL LINES & OSM WAYS---',
    'OpenStreetMap road ways in this work area:',
    ...wayLines,
    'Tax-parcel frontage linework near the corridor:',
    ...parcelBlocks,
    ...reviewLine,
    'RULES FOR USING THIS GROUNDING:',
    '• Parcel lines are GUIDANCE ONLY. Never snap, trace, or attach a road endpoint to a parcel line, parcel vertex, or parcel intersection.',
    '• Draw the road from survey shots/points and corridor logic: continuity, bearing, inferred width, and opposite-edge pairing. OSM ways may guide the alignment, but field shots outrank them.',
    '• Use parcel lines only to understand where frontage/road plausibly runs and to sanity-check a gap between field runs. The actual road line must be drawn from the shots and the corridor logic, not copied from parcel geometry.',
    '• When the aerial imagery is covered by tree canopy/shadow and the pavement is not visible, say so plainly and draft from the field shots and corridor logic. Do not pretend the image supports a synthesis.',
    '• Each pavement edge must be one continuous line: no gaps, no duplicate, no orphan stub. Opposite edges never cross; a side road T-intersects, it never cuts across the pavement.',
    '---END ROAD GROUNDING — PARCEL LINES & OSM WAYS---',
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Stitching
// ─────────────────────────────────────────────────────────────────────────────

const CONTINUATION_MIN_DOT = 0.45;
const EVIDENCE_SUPPORT_FT = 90;

interface StitchOutcome {
  features: RoadFeature[];
  repairs: string[];
  extended: number;
}

interface StitchCandidate {
  i: number;
  j: number;
  gap: number;
  combined: DraftVertex[];
  label: string;
  supported: boolean;
}

/** Gap between two collinear runs of the same corridor feature, when it reads
 * as a continuation rather than two distinct roads meeting at an angle. */
function collinearRunGap(
  a: RoadFeature,
  b: RoadFeature,
  limitFt = 400,
): { gap: number; from: DraftVertex; to: DraftVertex } | null {
  if (a.isClosed || b.isClosed || a.role !== b.role || a.role === 'unknown') return null;
  if ((a.layer ?? '') !== (b.layer ?? '')) return null;
  if (a.vertices.length < 2 || b.vertices.length < 2) return null;

  const aFirst = a.vertices[0];
  const aLast = a.vertices[a.vertices.length - 1];
  const bFirst = b.vertices[0];
  const bLast = b.vertices[b.vertices.length - 1];

  const options: Array<{
    from: DraftVertex;
    to: DraftVertex;
    aPrev: DraftVertex;
    bNext: DraftVertex;
  }> = [
    { from: aLast, to: bFirst, aPrev: a.vertices[a.vertices.length - 2], bNext: b.vertices[1] },
    { from: aLast, to: bLast, aPrev: a.vertices[a.vertices.length - 2], bNext: b.vertices[b.vertices.length - 2] },
    { from: aFirst, to: bFirst, aPrev: a.vertices[1], bNext: b.vertices[1] },
    { from: aFirst, to: bLast, aPrev: a.vertices[1], bNext: b.vertices[b.vertices.length - 2] },
  ];

  let best: { gap: number; from: DraftVertex; to: DraftVertex } | null = null;
  for (const option of options) {
    const gap = distance(option.from, option.to);
    if (gap < 0.05 || gap > limitFt) continue;
    const toward = unitVector(option.from, option.to);
    if (!toward) continue;
    if (!stitchDirectionOk(option.from, option.aPrev, option.to, option.bNext, toward)) continue;
    if (!best || gap < best.gap) best = { gap, from: option.from, to: option.to };
  }
  return best;
}

function bridgeClearsOtherRoads(
  from: DraftVertex,
  to: DraftVertex,
  features: RoadFeature[],
  skipI: number,
  skipJ: number,
): boolean {
  const mid = midpoint(from, to);
  const bridgeDirection = unitVector(from, to);
  for (let k = 0; k < features.length; k++) {
    if (k === skipI || k === skipJ) continue;
    const vertices = features[k].vertices;
    if (vertices.length < 2) continue;
    // The bridge may not land on a non-parallel third corridor (that is a
    // cross-road, not a continuation) or cross it. A parallel line merely
    // running alongside the continuation is a duplicate/adjacent run, not a
    // blocker: treating it as one is what left simple 15–50 ft gaps unstitched.
    const featureDirectionVector = featureDirection(features[k]);
    const parallel = Boolean(bridgeDirection && featureDirectionVector
      && Math.abs(bridgeDirection.x * featureDirectionVector.x + bridgeDirection.y * featureDirectionVector.y) >= ROAD_PARALLEL_DOT);
    if (!parallel) {
      if (pointToPolylineDistance(from, vertices) <= 0.5) return false;
      if (pointToPolylineDistance(to, vertices) <= 0.5) return false;
      if (pointToPolylineDistance(mid, vertices) <= 4) return false;
    }
    if (polylinesCross([from, to], vertices)) return false;
  }
  return true;
}

/** A parallel line sitting in the continuation gap is a fragment/duplicate,
 * not a road crossing. Report it instead of silently leaving the edge broken. */
function parallelBridgeBlocker(
  from: DraftVertex,
  to: DraftVertex,
  features: RoadFeature[],
  skipI: number,
  skipJ: number,
): RoadFeature | null {
  const axis = unitVector(from, to);
  if (!axis) return null;
  const mid = midpoint(from, to);
  for (let k = 0; k < features.length; k++) {
    if (k === skipI || k === skipJ) continue;
    const feature = features[k];
    const direction = featureDirection(feature);
    if (!direction) continue;
    if (Math.abs(direction.x * axis.x + direction.y * axis.y) < ROAD_PARALLEL_DOT) continue;
    if (pointToPolylineDistance(mid, feature.vertices) <= 12
      || pointToPolylineDistance(from, feature.vertices) <= 4
      || pointToPolylineDistance(to, feature.vertices) <= 4) {
      return feature;
    }
  }
  return null;
}

function stitchDirectionOk(
  aEnd: DraftVertex,
  aPrev: DraftVertex,
  bStart: DraftVertex,
  bNext: DraftVertex,
  toward: { x: number; y: number },
): boolean {
  const aDir = unitVector(aPrev, aEnd);
  const bDir = unitVector(bStart, bNext);
  if (!aDir || !bDir) return false;
  const dotA = aDir.x * toward.x + aDir.y * toward.y;
  const dotB = bDir.x * toward.x + bDir.y * toward.y;
  return dotA >= CONTINUATION_MIN_DOT && dotB >= CONTINUATION_MIN_DOT;
}

function findStitchCandidate(
  features: RoadFeature[],
  evidence: EvidencePolyline[],
  autoBridgeFt: number,
  maxBridgeFt: number,
): StitchCandidate | null {
  let best: StitchCandidate | null = null;

  for (let i = 0; i < features.length; i++) {
    for (let j = i + 1; j < features.length; j++) {
      const a = features[i];
      const b = features[j];
      if (a.isClosed || b.isClosed || a.role !== b.role || a.role === 'unknown') continue;
      if (a.vertices.length < 2 || b.vertices.length < 2) continue;

      const aFirst = a.vertices[0];
      const aLast = a.vertices[a.vertices.length - 1];
      const bFirst = b.vertices[0];
      const bLast = b.vertices[b.vertices.length - 1];
      const aPrev = a.vertices[a.vertices.length - 2];

      const options: Array<{
        from: DraftVertex;
        to: DraftVertex;
        combined: DraftVertex[];
        aPrev: DraftVertex;
        bNext: DraftVertex;
      }> = [
        {
          from: aLast,
          to: bFirst,
          combined: [...a.vertices, ...b.vertices],
          aPrev,
          bNext: b.vertices[1],
        },
        {
          from: aLast,
          to: bLast,
          combined: [...a.vertices, ...b.vertices.slice().reverse()],
          aPrev,
          bNext: b.vertices[b.vertices.length - 2],
        },
        {
          from: aFirst,
          to: bFirst,
          combined: [...a.vertices.slice().reverse(), ...b.vertices],
          aPrev: a.vertices[1],
          bNext: b.vertices[1],
        },
        {
          from: aFirst,
          to: bLast,
          combined: [...b.vertices, ...a.vertices],
          aPrev: a.vertices[1],
          bNext: b.vertices[b.vertices.length - 2],
        },
      ];

      for (const option of options) {
        const gap = distance(option.from, option.to);
        if (gap < 0.05 || gap > maxBridgeFt) continue;

        const toward = unitVector(option.from, option.to);
        if (!toward) continue;
        if (!stitchDirectionOk(option.from, option.aPrev, option.to, option.bNext, toward)) continue;
        if (!bridgeClearsOtherRoads(option.from, option.to, features, i, j)) continue;

        const mid = midpoint(option.from, option.to);
        const near = nearestEvidence(mid, evidence);
        const supported = Boolean(near && near.distance <= EVIDENCE_SUPPORT_FT);
        if (gap > autoBridgeFt && !supported) continue;

        const candidate: StitchCandidate = {
          i,
          j,
          gap,
          combined: option.combined,
          label: supported && near ? `${near.label} supports the continuation` : 'collinear field runs continue',
          supported,
        };

        // Prefer the shortest justified bridge; favour grounded candidates at
        // similar distances.
        const cost = candidate.gap - (candidate.supported ? 25 : 0);
        const bestCost = best ? best.gap - (best.supported ? 25 : 0) : Infinity;
        if (cost < bestCost) best = candidate;
      }
    }
  }

  return best;
}

const ROAD_EDGE_SHOT_RE = /\b(?:ER\d*|EP\d*|EOP\d*|EDGE\d*|PAV\w*|PVMT\d*|CURB\d*|TC\d*|BC\d*|TBC\d*|GUTTER\d*|FL\d*|FLOW\d*|TIE|ROAD)\b/i;
const ROAD_CENTERLINE_SHOT_RE = /\b(?:CL\d*|CTR\d*|CENTERLINE)\b/i;

function surveyPointMatchesFeature(point: RoadSurveyPoint, role: RoadFeature['role']): boolean {
  const description = point.description?.trim();
  if (!description) return true;
  if (!Number.isFinite(point.easting) || !Number.isFinite(point.northing)) return false;
  if (role === 'centerline') return ROAD_CENTERLINE_SHOT_RE.test(description);
  return ROAD_EDGE_SHOT_RE.test(description);
}

function surveyPointCoveredByOtherFeature(
  point: RoadSurveyPoint,
  features: RoadFeature[],
  skipIndex: number,
): boolean {
  const vertex = { easting: point.easting, northing: point.northing };
  return features.some((feature, index) =>
    index !== skipIndex && pointToPolylineDistance(vertex, feature.vertices) <= 8,
  );
}

/**
 * Choose the next survey shots in station order, following the existing
 * tangent. Stepping through points (rather than snapping to the farthest one)
 * is what lets a curved run become a curve instead of a single chord. Parcel
 * geometry is never a candidate here.
 */
function selectSurveyCurvePath(
  endpoint: DraftVertex,
  outward: { x: number; y: number },
  role: RoadFeature['role'],
  surveyPoints: RoadSurveyPoint[],
  features: RoadFeature[],
  featureIndex: number,
  maxBridgeFt: number,
): RoadSurveyPoint[] {
  const candidates = surveyPoints.filter(point => {
    if (!Number.isFinite(point.easting) || !Number.isFinite(point.northing)) return false;
    if (!surveyPointMatchesFeature(point, role)) return false;
    if (surveyPointCoveredByOtherFeature(point, features, featureIndex)) return false;
    const dx = point.easting - endpoint.easting;
    const dy = point.northing - endpoint.northing;
    const ahead = dx * outward.x + dy * outward.y;
    const lateral = Math.abs(dx * outward.y - dy * outward.x);
    return ahead >= 8 && ahead <= maxBridgeFt && lateral <= 80;
  });
  if (candidates.length === 0) return [];

  const path: RoadSurveyPoint[] = [];
  const used = new Set<RoadSurveyPoint>();
  let current = endpoint;
  let heading = outward;

  for (let step = 0; step < 10; step++) {
    let best: { point: RoadSurveyPoint; distance: number; direction: { x: number; y: number }; score: number } | null = null;
    for (const point of candidates) {
      if (used.has(point)) continue;
      const stepDistance = distance(current, point);
      if (stepDistance < 8 || stepDistance > 200) continue;
      const direction = unitVector(current, point);
      if (!direction) continue;
      const turn = direction.x * heading.x + direction.y * heading.y;
      if (turn < 0.35) continue;
      const lateral = Math.abs(
        (point.easting - current.easting) * heading.y
        - (point.northing - current.northing) * heading.x,
      );
      if (lateral > 30) continue;
      const score = stepDistance + (1 - turn) * 100;
      if (!best || score < best.score) best = { point, distance: stepDistance, direction, score };
    }
    if (!best) break;
    path.push(best.point);
    used.add(best.point);
    current = { easting: best.point.easting, northing: best.point.northing };
    heading = best.direction;
  }

  if (path.length > 0) return path;

  // One isolated shot is still valid endpoint evidence. Keep this fallback
  // narrower so a boundary shot off to the side cannot become a road end.
  let fallback: { point: RoadSurveyPoint; ahead: number } | null = null;
  for (const point of candidates) {
    const dx = point.easting - endpoint.easting;
    const dy = point.northing - endpoint.northing;
    const ahead = dx * outward.x + dy * outward.y;
    const lateral = Math.abs(dx * outward.y - dy * outward.x);
    if (ahead < 8 || ahead > maxBridgeFt || lateral > (role === 'centerline' ? 20 : 24)) continue;
    if (!fallback || ahead > fallback.ahead) fallback = { point, ahead };
  }
  return fallback ? [fallback.point] : [];
}

/**
 * Extend a road edge/centerline endpoint through the surveyed road shots ahead
 * of it. This uses the field points themselves, never a parcel vertex or parcel
 * intersection: parcel geometry is guidance only.
 */
function extendEndsToSurveyPoints(
  features: RoadFeature[],
  surveyPoints: RoadSurveyPoint[],
  maxBridgeFt: number,
): { features: RoadFeature[]; repairs: string[]; extended: number } {
  if (surveyPoints.length === 0) return { features, repairs: [], extended: 0 };

  const working = features.map(feature => ({
    ...feature,
    vertices: feature.vertices.map(v => ({ ...v })),
    sourceLineIndexes: [...feature.sourceLineIndexes],
  }));
  const repairs: string[] = [];
  let extended = 0;

  for (let featureIndex = 0; featureIndex < working.length; featureIndex++) {
    const feature = working[featureIndex];
    if (feature.isClosed || feature.vertices.length < 2 || feature.role === 'paint' || feature.role === 'unknown') continue;
    const vertices = [...feature.vertices];
    let changed = false;

    for (const end of ['start', 'end'] as const) {
      const atStart = end === 'start';
      const endpoint = atStart ? vertices[0] : vertices[vertices.length - 1];
      const previous = atStart ? vertices[1] : vertices[vertices.length - 2];
      const outward = unitVector(previous, endpoint);
      if (!outward) continue;

      const path = selectSurveyCurvePath(
        endpoint,
        outward,
        feature.role,
        surveyPoints,
        working,
        featureIndex,
        maxBridgeFt,
      );
      if (path.length === 0) continue;

      let cursor = endpoint;
      const accepted: DraftVertex[] = [];
      for (const point of path) {
        const target: DraftVertex = { easting: point.easting, northing: point.northing };
        if (!bridgeClearsOtherRoads(cursor, target, working, featureIndex, featureIndex)) break;
        accepted.push(target);
        cursor = target;
      }
      if (accepted.length === 0) continue;

      if (atStart) vertices.unshift(...accepted.slice().reverse());
      else vertices.push(...accepted);

      const lastPoint = path[accepted.length - 1];
      const shot = lastPoint.pointNumber ? `shot ${lastPoint.pointNumber}` : 'the last surveyed road shot';
      const ahead = distance(endpoint, accepted[accepted.length - 1]);
      repairs.push(
        `extended ${feature.role === 'centerline' ? 'the centerline' : 'a pavement edge'} ${ahead.toFixed(0)} ft to ${shot} ` +
        `through ${accepted.length} surveyed road shot${accepted.length === 1 ? '' : 's'} — the drawn road now reaches the surveyed limit`,
      );
      extended++;
      changed = true;
    }

    if (changed) working[featureIndex] = { ...feature, vertices };
  }

  return { features: working, repairs, extended };
}

function stitchRoadRuns(
  features: RoadFeature[],
  evidence: EvidencePolyline[],
  surveyPoints: RoadSurveyPoint[],
  autoBridgeFt: number,
  maxBridgeFt: number,
): StitchOutcome {
  const working = features.map(feature => ({
    ...feature,
    vertices: feature.vertices.map(v => ({ ...v })),
    sourceLineIndexes: [...feature.sourceLineIndexes],
  }));
  const repairs: string[] = [];

  for (let guard = 0; guard < features.length; guard++) {
    const candidate = findStitchCandidate(working, evidence, autoBridgeFt, maxBridgeFt);
    if (!candidate) break;
    const a = working[candidate.i];
    const b = working[candidate.j];
    working[candidate.i] = {
      ...a,
      vertices: candidate.combined,
      sourceLineIndexes: [...a.sourceLineIndexes, ...b.sourceLineIndexes],
      isClosed: false,
    };
    working.splice(candidate.j, 1);
    repairs.push(
      `stitched a ${candidate.gap.toFixed(0)} ft gap in ${a.role === 'paint' ? 'the paint run' : a.role === 'centerline' ? 'the centerline' : 'a pavement edge'} ` +
      `(${candidate.label}) — the road is drawn as one continuous line`,
    );
  }

  const extended = extendEndsToSurveyPoints(working, surveyPoints, maxBridgeFt);
  return { features: extended.features, repairs: [...repairs, ...extended.repairs], extended: extended.extended };
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit
// ─────────────────────────────────────────────────────────────────────────────

function featureCoverageShare(shorter: DraftVertex[], longer: DraftVertex[], tolerance = 2): number {
  let samples = 0;
  let covered = 0;
  for (let i = 0; i < shorter.length - 1; i++) {
    const a = shorter[i];
    const b = shorter[i + 1];
    const steps = Math.max(1, Math.ceil(distance(a, b) / 10));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const point: DraftVertex = {
        easting: a.easting + (b.easting - a.easting) * t,
        northing: a.northing + (b.northing - a.northing) * t,
      };
      samples++;
      if (pointToPolylineDistance(point, longer) <= tolerance) covered++;
    }
  }
  return samples > 0 ? covered / samples : 0;
}

const ROAD_JOIN_TOL_FT = 5;
const ROAD_PARALLEL_DOT = 0.8;

function featureDirection(feature: RoadFeature): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestLength = 0;
  for (let i = 1; i < feature.vertices.length; i++) {
    const length = distance(feature.vertices[i - 1], feature.vertices[i]);
    if (length <= bestLength) continue;
    const direction = unitVector(feature.vertices[i - 1], feature.vertices[i]);
    if (!direction) continue;
    best = direction;
    bestLength = length;
  }
  return best;
}

function rangeAlongFeatureAxis(
  vertices: DraftVertex[],
  origin: DraftVertex,
  axis: { x: number; y: number },
): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const vertex of vertices) {
    const t = (vertex.easting - origin.easting) * axis.x
      + (vertex.northing - origin.northing) * axis.y;
    if (t < min) min = t;
    if (t > max) max = t;
  }
  return { min, max };
}

function featureProjectionOverlap(a: RoadFeature, b: RoadFeature): number {
  const axis = featureDirection(a) ?? featureDirection(b);
  if (!axis) return 0;
  const aRange = rangeAlongFeatureAxis(a.vertices, a.vertices[0], axis);
  const bRange = rangeAlongFeatureAxis(b.vertices, a.vertices[0], axis);
  const shorter = Math.min(aRange.max - aRange.min, bRange.max - bRange.min);
  if (shorter <= 1) return 0;
  const intersection = Math.max(0, Math.min(aRange.max, bRange.max) - Math.max(aRange.min, bRange.min));
  return Math.min(1, intersection / shorter);
}

function featuresTouch(a: RoadFeature, b: RoadFeature, tolerance = ROAD_JOIN_TOL_FT): boolean {
  const aEnds = [a.vertices[0], a.vertices[a.vertices.length - 1]];
  const bEnds = [b.vertices[0], b.vertices[b.vertices.length - 1]];
  const directionA = featureDirection(a);
  const directionB = featureDirection(b);
  const parallel = Boolean(directionA && directionB
    && Math.abs(directionA.x * directionB.x + directionA.y * directionB.y) >= ROAD_PARALLEL_DOT);
  if (parallel) {
    // Endpoint-to-endpoint only. A parallel edge 3 ft away is a stacked run,
    // not a T-junction; connecting it would hide the fragment.
    return aEnds.some(aEnd => bEnds.some(bEnd => distance(aEnd, bEnd) <= tolerance));
  }
  return aEnds.some(point => pointToPolylineDistance(point, b.vertices) <= tolerance)
    || bEnds.some(point => pointToPolylineDistance(point, a.vertices) <= tolerance);
}

function featuresFormCorridorPair(a: RoadFeature, b: RoadFeature): boolean {
  if (a.role !== b.role || a.role === 'unknown') return false;
  if (a.vertices.length < 2 || b.vertices.length < 2) return false;
  const directionA = featureDirection(a);
  const directionB = featureDirection(b);
  if (!directionA || !directionB) return false;
  if (Math.abs(directionA.x * directionB.x + directionA.y * directionB.y) < ROAD_PARALLEL_DOT) return false;
  if (featureProjectionOverlap(a, b) < 0.5) return false;
  const separation = meanDistanceToPolyline(a.vertices, b.vertices);
  // Both bands of a DYL are one paint run, even though they are only 16 in apart.
  if (a.role === 'paint') return separation >= 0.5 && separation <= 4;
  return separation >= 6 && separation <= 90;
}

/**
 * Group features into road components. Two edges of one corridor are linked by
 * their parallel pairing; branches link at endpoints/T-junctions. A component
 * that does not connect to the main run is a fragment, not a road.
 */
function roadComponents(features: RoadFeature[]): RoadFeature[][] {
  const parent = features.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== index) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };

  for (let i = 0; i < features.length; i++) {
    for (let j = i + 1; j < features.length; j++) {
      const a = features[i];
      const b = features[j];
      if (a.role !== b.role || a.role === 'unknown') continue;
      if (featuresTouch(a, b) || featuresFormCorridorPair(a, b)) union(i, j);
    }
  }

  const groups = new Map<number, RoadFeature[]>();
  features.forEach((feature, index) => {
    const root = find(index);
    const group = groups.get(root) ?? [];
    group.push(feature);
    groups.set(root, group);
  });
  return [...groups.values()];
}

function componentMaxLength(component: RoadFeature[]): number {
  return Math.max(0, ...component.map(feature => polylineLength(feature.vertices)));
}

function componentDirection(component: RoadFeature[]): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestLength = 0;
  for (const feature of component) {
    const length = polylineLength(feature.vertices);
    if (length <= bestLength) continue;
    const direction = featureDirection(feature);
    if (!direction) continue;
    best = direction;
    bestLength = length;
  }
  return best;
}

function componentSeparation(a: RoadFeature[], b: RoadFeature[]): number {
  let best = Infinity;
  for (const featureA of a) {
    for (const featureB of b) {
      for (const vertex of featureA.vertices) {
        best = Math.min(best, pointToPolylineDistance(vertex, featureB.vertices));
      }
      for (const vertex of featureB.vertices) {
        best = Math.min(best, pointToPolylineDistance(vertex, featureA.vertices));
      }
    }
  }
  return best;
}

function disconnectedFragmentDefects(features: RoadFeature[]): RoadDefect[] {
  const defects: RoadDefect[] = [];
  const byRole = new Map<RoadFeature['role'], RoadFeature[]>();
  for (const feature of features) {
    const bucket = byRole.get(feature.role) ?? [];
    bucket.push(feature);
    byRole.set(feature.role, bucket);
  }

  for (const [role, group] of byRole.entries()) {
    if (role === 'unknown' || group.length < 2) continue;
    const components = roadComponents(group);
    if (components.length < 2) continue;
    const ranked = components
      .map(component => ({
        component,
        maxLength: componentMaxLength(component),
        direction: componentDirection(component),
      }))
      .sort((a, b) => b.maxLength - a.maxLength);
    const main = ranked[0];
    if (!main.direction) continue;
    const mainFeature = main.component.reduce((longest, feature) =>
      polylineLength(feature.vertices) > polylineLength(longest.vertices) ? feature : longest,
    );
    const groupRange = rangeAlongFeatureAxis(
      group.flatMap(feature => feature.vertices),
      mainFeature.vertices[0],
      main.direction,
    );
    const envelopeSpan = Math.max(0, groupRange.max - groupRange.min);
    if (group.length >= 3 && main.maxLength < envelopeSpan * 0.5) {
      defects.push({
        kind: 'corridor_incomplete',
        severity: 'red',
        featureId: mainFeature.id,
        at: mainFeature.vertices[0],
        metric: 1,
        detail:
          `the longest continuous ${roadFeatureLabel(role)} run is only ${main.maxLength.toFixed(0)} ft ` +
          `while the take spans ${envelopeSpan.toFixed(0)} ft — the corridor is fragmented into disconnected pieces; ` +
          `join them into one continuous run`,
      });
    }

    for (let i = 1; i < ranked.length; i++) {
      const candidate = ranked[i];
      if (!candidate.direction) continue;
      if (Math.abs(main.direction.x * candidate.direction.x + main.direction.y * candidate.direction.y) < 0.5) continue;
      if (componentSeparation(main.component, candidate.component) > 120) continue;
      const fragmented = candidate.maxLength < main.maxLength * 0.35 || ranked.length >= 4;
      if (!fragmented) continue;

      const representative = candidate.component.reduce((longest, feature) =>
        polylineLength(feature.vertices) > polylineLength(longest.vertices) ? feature : longest,
      );
      defects.push({
        kind: 'corridor_incomplete',
        severity: candidate.maxLength < main.maxLength * 0.2 ? 'red' : 'yellow',
        featureId: representative.id,
        at: representative.vertices[0],
        metric: 1,
        detail:
          `${roadFeatureLabel(role)} run is a ${candidate.maxLength.toFixed(0)} ft disconnected fragment ` +
          `near the main ${roadFeatureLabel(role)} corridor — remove the parallel fragments and draw one continuous run`,
      });
    }
  }
  return defects;
}

/**
 * A corridor has one pavement edge on each side. When several overlapping
 * parallel runs sit on the same side, they are stacked fragments, even if the
 * component pass can chain them together through a valid opposite edge.
 */
function parallelEdgeCongestionDefects(features: RoadFeature[]): RoadDefect[] {
  const edges = features.filter(feature =>
    feature.role === 'edge'
    && !feature.isClosed
    && feature.vertices.length >= 2
  );
  if (edges.length < 3) return [];

  const main = edges.reduce((longest, feature) =>
    polylineLength(feature.vertices) > polylineLength(longest.vertices) ? feature : longest,
  );
  const axis = featureDirection(main);
  if (!axis) return [];
  const origin = main.vertices[0];
  const sideCounts = new Map<number, RoadFeature[]>();

  for (const feature of edges) {
    if (feature.id === main.id) {
      // The main run establishes the reference line; count it on the right.
      const bucket = sideCounts.get(1) ?? [];
      bucket.push(feature);
      sideCounts.set(1, bucket);
      continue;
    }
    const direction = featureDirection(feature);
    if (!direction || Math.abs(direction.x * axis.x + direction.y * axis.y) < ROAD_PARALLEL_DOT) continue;
    if (featureProjectionOverlap(main, feature) < 0.5) continue;

    let offsetSum = 0;
    for (const vertex of feature.vertices) {
      const dx = vertex.easting - origin.easting;
      const dy = vertex.northing - origin.northing;
      offsetSum += dx * axis.y - dy * axis.x;
    }
    const side = offsetSum / feature.vertices.length >= 0 ? 1 : -1;
    const bucket = sideCounts.get(side) ?? [];
    bucket.push(feature);
    sideCounts.set(side, bucket);
  }

  const defects: RoadDefect[] = [];
  for (const [side, bucket] of sideCounts.entries()) {
    if (bucket.length <= 2) continue;
    const representative = bucket[0];
    defects.push({
      kind: 'corridor_incomplete',
      severity: 'red',
      featureId: representative.id,
      at: representative.vertices[0],
      metric: 1,
      detail:
        `${bucket.length} parallel pavement edge runs overlap on the ${side > 0 ? 'same' : 'opposite'} side ` +
        `of the corridor — a road has one continuous edge per side; merge the stacked fragments into two continuous edges`,
    });
  }
  return defects;
}

const DEFECT_WEIGHT: Record<RoadDefectKind, number> = {
  gap: 1.6,
  crossing: 2.2,
  self_intersection: 1.7,
  stub: 0.7,
  duplicate: 0.8,
  unsupported_alignment: 0.6,
  corridor_incomplete: 1.2,
  convergence: 2.6,
  unused_survey: 2.0,
};

function adaptiveGapLimit(features: RoadFeature[], override?: number): number {
  if (override && override > 0) return override;
  const steps = features.map(feature => medianStep(feature.vertices)).filter(step => step > 0);
  if (steps.length === 0) return 60;
  steps.sort((a, b) => a - b);
  const median = steps[Math.floor(steps.length / 2)];
  return Math.min(600, Math.max(80, median * 6));
}

/**
 * Raw-line convergence check. `mergeConnectedFeatures` can turn a fan of
 * several lines sharing one endpoint into a single sawtooth feature, hiding the
 * defect from the feature-level audit. A road may have a T or a cross, but it
 * must never neck down to a point with multiple near-parallel rays.
 */
function rawConvergenceDefects(
  lines: DraftLineLike[],
  features: RoadFeature[],
): RoadDefect[] {
  const roadLineIndexes = new Set(features.flatMap(feature => feature.sourceLineIndexes));
  const endpoints: Array<{
    point: DraftVertex;
    lineIndex: number;
    key: string;
    direction: { x: number; y: number };
  }> = [];

  lines.forEach((line, lineIndex) => {
    if (!roadLineIndexes.has(lineIndex)) return;
    if (line.hidden || line.isCurve || line.isCircle || line.curveRadius) return;
    const ends = lineEndpoints(line);
    if (!ends || distance(ends[0], ends[1]) < 1) return;
    const key = line.polylineId?.trim() || line.id || `line-${lineIndex}`;
    const firstDirection = unitVector(ends[0], ends[1]);
    const lastDirection = unitVector(ends[1], ends[0]);
    if (firstDirection) endpoints.push({ point: ends[0], lineIndex, key, direction: firstDirection });
    if (lastDirection) endpoints.push({ point: ends[1], lineIndex, key, direction: lastDirection });
  });

  if (endpoints.length < 6) return [];

  const parent = endpoints.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== index) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };

  for (let i = 0; i < endpoints.length; i++) {
    for (let j = i + 1; j < endpoints.length; j++) {
      if (distance(endpoints[i].point, endpoints[j].point) <= 6) union(i, j);
    }
  }

  const clusters = new Map<number, typeof endpoints>();
  endpoints.forEach((endpoint, index) => {
    const root = find(index);
    const bucket = clusters.get(root) ?? [];
    bucket.push(endpoint);
    clusters.set(root, bucket);
  });

  const defects: RoadDefect[] = [];
  for (const cluster of clusters.values()) {
    const unique = new Map<string, { lineIndex: number; direction: { x: number; y: number } }>();
    for (const endpoint of cluster) {
      if (!unique.has(endpoint.key)) {
        unique.set(endpoint.key, { lineIndex: endpoint.lineIndex, direction: endpoint.direction });
      }
    }
    if (unique.size < 3) continue;

    const directions = [...unique.values()].map(item => item.direction);
    let nearParallelPair = false;
    for (let i = 0; i < directions.length && !nearParallelPair; i++) {
      for (let j = i + 1; j < directions.length; j++) {
        if (directions[i].x * directions[j].x + directions[i].y * directions[j].y
          >= Math.cos((25 * Math.PI) / 180)) {
          nearParallelPair = true;
          break;
        }
      }
    }
    if (!nearParallelPair) continue;

    const at = cluster.reduce(
      (sum, endpoint) => ({
        easting: sum.easting + endpoint.point.easting / cluster.length,
        northing: sum.northing + endpoint.point.northing / cluster.length,
      }),
      { easting: 0, northing: 0 },
    );
    const representativeIndex = unique.values().next().value?.lineIndex;
    const feature = features.find(item => representativeIndex !== undefined
      && item.sourceLineIndexes.includes(representativeIndex));
    defects.push({
      kind: 'convergence',
      severity: 'red',
      featureId: feature?.id ?? features[0]?.id ?? 'raw-linework',
      at,
      metric: 1,
      detail:
        `${unique.size} pavement lines converge to one point near ` +
        `(${at.easting.toFixed(1)}, ${at.northing.toFixed(1)}) — a road cannot come to a point; ` +
        `rebuild it as two continuous parallel edges through the surveyed shots`,
    });
  }

  return defects;
}

function surveyPointRole(point: RoadSurveyPoint): 'edge' | 'centerline' | null {
  const description = point.description?.trim();
  if (!description) return null;
  if (ROAD_CENTERLINE_SHOT_RE.test(description) && !ROAD_EDGE_SHOT_RE.test(description)) return 'centerline';
  if (ROAD_EDGE_SHOT_RE.test(description)) return 'edge';
  return null;
}

function unusedSurveyDefects(
  features: RoadFeature[],
  evidence: EvidencePolyline[],
  surveyPoints: RoadSurveyPoint[],
): RoadDefect[] {
  const parcelEvidence = evidence.filter(item => item.kind === 'parcel');
  if (parcelEvidence.length === 0 || surveyPoints.length === 0 || features.length === 0) return [];

  const unused = surveyPoints.filter(point => {
    if (!Number.isFinite(point.easting) || !Number.isFinite(point.northing)) return false;
    const role = surveyPointRole(point);
    if (!role) return false;
    const matchingFeatures = features.filter(feature => feature.role === role);
    if (matchingFeatures.length === 0) return false;

    const pointVertex = { easting: point.easting, northing: point.northing };
    const nearestFeature = Math.min(
      ...matchingFeatures.map(feature => pointToPolylineDistance(pointVertex, feature.vertices)),
    );
    if (nearestFeature <= 10 || nearestFeature > 380) return false;

    const nearestParcel = Math.min(
      ...parcelEvidence.map(item => pointToPolylineDistance(pointVertex, item.vertices)),
    );
    return nearestParcel <= 90;
  });

  if (unused.length === 0) return [];

  // Keep one critique per cluster, not one per shot.
  const visited = new Set<number>();
  const defects: RoadDefect[] = [];
  for (let i = 0; i < unused.length; i++) {
    if (visited.has(i)) continue;
    const cluster = [unused[i]];
    visited.add(i);
    for (let j = i + 1; j < unused.length; j++) {
      if (visited.has(j)) continue;
      if (cluster.some(item => distance(
        { easting: item.easting, northing: item.northing },
        { easting: unused[j].easting, northing: unused[j].northing },
      ) <= 100)) {
        cluster.push(unused[j]);
        visited.add(j);
      }
    }

    const first = cluster[0];
    const firstVertex = { easting: first.easting, northing: first.northing };
    const nearestFeature = features.reduce((best, feature) => {
      const distanceToFeature = pointToPolylineDistance(firstVertex, feature.vertices);
      return distanceToFeature < best.distance ? { feature, distance: distanceToFeature } : best;
    }, { feature: features[0], distance: Infinity });

    defects.push({
      kind: 'unused_survey',
      severity: cluster.length >= 2 ? 'red' : 'yellow',
      featureId: nearestFeature.feature.id,
      at: firstVertex,
      metric: 1,
      detail:
        `${cluster.length} surveyed road shot${cluster.length === 1 ? '' : 's'} inside the parcel corridor near ` +
        `(${first.easting.toFixed(1)}, ${first.northing.toFixed(1)}) ${cluster.length === 1 ? 'is' : 'are'} not on any pavement edge — ` +
        `the corridor evidence says a curve here; fit the missing pavement curve through ${cluster.length === 1 ? 'that shot' : 'those shots'}`,
    });
  }

  return defects;
}

function auditFeatures(
  features: RoadFeature[],
  evidence: EvidencePolyline[],
  maxGapFt?: number,
  surveyPoints: RoadSurveyPoint[] = [],
  sourceLines: DraftLineLike[] = [],
): { defects: RoadDefect[]; score: number; supportedFeatures: number; unsupportedFeatures: number } {
  const defects: RoadDefect[] = [];
  const gapLimit = adaptiveGapLimit(features, maxGapFt);
  let supportedFeatures = 0;
  let unsupportedFeatures = 0;

  for (const feature of features) {
    // Continuity: a corridor edge or centerline cannot stop in mid-air. A
    // two/three-vertex feature is one long straight run, not a gap — interior
    // breaks are only meaningful once the feature has real intermediate shots.
    for (let i = 1; feature.vertices.length >= 4 && i < feature.vertices.length; i++) {
      const gap = distance(feature.vertices[i - 1], feature.vertices[i]);
      if (gap > gapLimit) {
        defects.push({
          kind: 'gap',
          severity: gap > gapLimit * 2 ? 'red' : 'yellow',
          featureId: feature.id,
          at: feature.vertices[i - 1],
          metric: Math.min(1, (gap - gapLimit) / (gapLimit * 2)),
          detail: `${roadFeatureLabel(feature.role)} has a ${gap.toFixed(0)} ft gap near (${feature.vertices[i - 1].easting.toFixed(1)}, ${feature.vertices[i - 1].northing.toFixed(1)})`,
        });
      }
    }

    if (!feature.isClosed && polylineSelfIntersects(feature.vertices)) {
      defects.push({
        kind: 'self_intersection',
        severity: 'red',
        featureId: feature.id,
        at: feature.vertices[0],
        metric: 1,
        detail: 'line doubles back and crosses itself (sawtooth ordering)',
      });
    }

    const length = polylineLength(feature.vertices);

    // Orphan stub: a short line that touches nothing. A paint fragment is left
    // for the stitch pass instead of being deleted — DYL/WL must not vanish
    // just because the first take stopped short.
    if (feature.role !== 'paint' && features.length > 1 && length < 35) {
      const others = features.filter(other => other.id !== feature.id);
      const connects = feature.vertices.some(vertex =>
        others.some(other => other.vertices.some(otherVertex => distance(vertex, otherVertex) < 3)),
      ) || others.some(other => meanDistanceToPolyline(feature.vertices, other.vertices) < 6);
      if (!connects) {
        defects.push({
          kind: 'stub',
          severity: 'yellow',
          featureId: feature.id,
          at: feature.vertices[0],
          metric: 0.8,
          detail: `isolated ${length.toFixed(0)} ft stub at (${feature.vertices[0].easting.toFixed(1)}, ${feature.vertices[0].northing.toFixed(1)}) — it belongs to no road`,
        });
      }
    }

    // Grounding: only judge alignment when OSM ways were actually supplied.
    const osmEvidence = evidence.filter(item => item.kind === 'osm');
    if (osmEvidence.length > 0 && feature.role === 'centerline' && length >= 80) {
      let samples = 0;
      let far = 0;
      for (let i = 0; i < feature.vertices.length - 1; i++) {
        const a = feature.vertices[i];
        const b = feature.vertices[i + 1];
        const steps = Math.max(1, Math.ceil(distance(a, b) / 25));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const sample: DraftVertex = {
            easting: a.easting + (b.easting - a.easting) * t,
            northing: a.northing + (b.northing - a.northing) * t,
          };
          samples++;
          const near = nearestEvidence(sample, evidence, 'osm');
          if (!near || near.distance > 120) far++;
        }
      }
      const farShare = samples > 0 ? far / samples : 0;
      if (farShare >= 0.6) {
        unsupportedFeatures++;
        defects.push({
          kind: 'unsupported_alignment',
          severity: 'yellow',
          featureId: feature.id,
          at: feature.vertices[0],
          metric: Math.min(1, farShare),
          detail: `no OSM road within 120 ft along ${Math.round(farShare * 100)}% of this centerline — it is not grounded on a known street`,
        });
      } else {
        supportedFeatures++;
      }
    }
  }

  // Two runs of the same edge/centerline that stop in mid-air are a gap even
  // though each individual run is internally continuous.
  for (let i = 0; i < features.length; i++) {
    for (let j = i + 1; j < features.length; j++) {
      const gap = collinearRunGap(features[i], features[j]);
      if (!gap) continue;
      // Two side-road legs on opposite sides of a through road are not one
      // broken edge; bridging them would cross the through corridor. But a
      // parallel line sitting in the gap is a fragment/duplicate: report the
      // break instead of silently accepting it.
      const bridgeBlocked = !bridgeClearsOtherRoads(gap.from, gap.to, features, i, j);
      const blocker = bridgeBlocked
        ? parallelBridgeBlocker(gap.from, gap.to, features, i, j)
        : null;
      if (bridgeBlocked && !blocker) continue;
      const role = features[i].role === 'centerline' ? 'centerline' : 'pavement edge';
      defects.push({
        kind: 'gap',
        severity: gap.gap > 120 ? 'red' : 'yellow',
        featureId: features[i].id,
        otherFeatureId: features[j].id,
        at: midpoint(gap.from, gap.to),
        metric: Math.min(1, gap.gap / 250),
        detail: blocker
          ? `${role} stops ${gap.gap.toFixed(0)} ft short of the next run, but a parallel line blocks the continuation — remove the extra parallel line and join the edge into one continuous run`
          : `${role} stops ${gap.gap.toFixed(0)} ft short of the next run — the road is broken, not continuous`,
      });
    }
  }

  // Crossings between features: opposite edges, or a branch line through a road.
  for (let i = 0; i < features.length; i++) {
    for (let j = i + 1; j < features.length; j++) {
      const a = features[i];
      const b = features[j];
      if (a.vertices.length < 2 || b.vertices.length < 2) continue;
      // A branch that ends ON the corridor is a T-junction, not a crossing.
      if (featuresMeetAtJunction(a, b)) continue;
      if (!polylinesCross(a.vertices, b.vertices)) continue;
      const shortA = polylineLength(a.vertices) < polylineLength(b.vertices);
      defects.push({
        kind: 'crossing',
        severity: 'red',
        featureId: shortA ? a.id : b.id,
        otherFeatureId: shortA ? b.id : a.id,
        at: a.vertices[0],
        metric: 1,
        detail: `${shortA ? 'edge/branch' : 'corridor line'} crosses the ${shortA ? 'main corridor' : 'other corridor'} instead of T-ing into it`,
      });
    }
  }

  // Duplicate geometry. Compare the COVERAGE of the shorter line, not the mean
  // distance between whole features: a duplicate of one 300 ft run inside a
  // 1,600 ft stitched edge must still be caught.
  for (let i = 0; i < features.length; i++) {
    for (let j = i + 1; j < features.length; j++) {
      const a = features[i];
      const b = features[j];
      if (a.role !== b.role) continue;
      if (a.vertices.length < 2 || b.vertices.length < 2) continue;
      // The two bands of a double-yellow line are a pair, not duplicates. Only
      // remove paint that actually sits on top of another paint run.
      if (a.role === 'paint' && meanDistanceToPolyline(a.vertices, b.vertices) > 0.75) continue;
      const aLength = polylineLength(a.vertices);
      const bLength = polylineLength(b.vertices);
      const shorter = aLength <= bLength ? a : b;
      const longer = aLength <= bLength ? b : a;
      if (polylineLength(shorter.vertices) < 20) continue;
      if (featureCoverageShare(shorter.vertices, longer.vertices) >= 0.8) {
        defects.push({
          kind: 'duplicate',
          severity: 'yellow',
          featureId: shorter.id,
          otherFeatureId: longer.id,
          at: shorter.vertices[0],
          metric: 1,
          detail: 'duplicate line laid over an existing corridor line',
        });
      }
    }
  }

  // A centerline that runs well past the drawn pavement edges is an incomplete
  // corridor even when each individual line looks smooth.
  const edgeFeatures = features.filter(feature => feature.role === 'edge');
  for (const centerline of features.filter(feature => feature.role === 'centerline')) {
    if (edgeFeatures.length === 0) continue;
    const probe = [
      centerline.vertices[0],
      centerline.vertices[centerline.vertices.length - 1],
    ];
    const farEnd = probe.find(endpoint =>
      edgeFeatures.every(edge => pointToPolylineDistance(endpoint, edge.vertices) > 45),
    );
    if (farEnd) {
      defects.push({
        kind: 'corridor_incomplete',
        severity: 'yellow',
        featureId: centerline.id,
        at: farEnd,
        metric: 0.7,
        detail: `centerline runs past the drawn pavement edges by more than 45 ft near (${farEnd.easting.toFixed(1)}, ${farEnd.northing.toFixed(1)})`,
      });
    }
  }

  // A road is one connected corridor network, not a pile of short parallel
  // runs. This is deliberately separate from the local gap check: a crowded
  // take can block every bridge and otherwise look clean.
  defects.push(...disconnectedFragmentDefects(features));
  defects.push(...parallelEdgeCongestionDefects(features));
  defects.push(...rawConvergenceDefects(sourceLines, features));
  defects.push(...unusedSurveyDefects(features, evidence, surveyPoints));

  let totalPenalty = 0;
  for (const feature of features) {
    let penalty = 0;
    for (const defect of defects) {
      if (defect.featureId === feature.id) penalty += DEFECT_WEIGHT[defect.kind] * defect.metric;
    }
    totalPenalty += Math.min(1, penalty);
  }
  const score = features.length === 0
    ? 100
    : Math.round(100 * Math.max(0, 1 - totalPenalty / features.length));

  return { defects, score, supportedFeatures, unsupportedFeatures };
}

// ─────────────────────────────────────────────────────────────────────────────
// Repairs
// ─────────────────────────────────────────────────────────────────────────────

interface DropOutcome {
  features: RoadFeature[];
  repairs: string[];
}

function dropDefectiveFeatures(features: RoadFeature[], defects: RoadDefect[]): DropOutcome {
  const dropIds = new Set<string>();
  const repairs: string[] = [];

  for (const defect of defects) {
    if (defect.kind === 'stub') {
      dropIds.add(defect.featureId);
      repairs.push(defect.detail);
      continue;
    }
    if (defect.kind === 'duplicate' && !dropIds.has(defect.featureId)) {
      dropIds.add(defect.featureId);
      repairs.push('removed a duplicate line laid over the same corridor');
      continue;
    }
  }

  // A short stray line that cuts across a much longer corridor is the classic
  // "line crosses the road" defect. Remove the stray, never the corridor.
  const longest = Math.max(0, ...features.map(feature => polylineLength(feature.vertices)));
  for (const defect of defects) {
    if (defect.kind !== 'crossing' || !defect.otherFeatureId) continue;
    const feature = features.find(item => item.id === defect.featureId);
    if (!feature) continue;
    if (polylineLength(feature.vertices) > longest * 0.4) continue;
    if (dropIds.has(feature.id)) continue;
    dropIds.add(feature.id);
    repairs.push(`removed a stray line that cut across the road corridor near (${feature.vertices[0].easting.toFixed(1)}, ${feature.vertices[0].northing.toFixed(1)})`);
  }

  return {
    features: features.filter(feature => !dropIds.has(feature.id)),
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
    id: template.id ? `${template.id}-take-${segmentIndex}` : undefined,
    from: `TAKE-${featureId}-${segmentIndex}`,
    to: `TAKE-${featureId}-${segmentIndex + 1}`,
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
    polylineId: `${template.polylineId || featureId}-take`,
  } as T;
}

function rebuildLines<T extends DraftLineLike>(
  lines: T[],
  originalFeatures: RoadFeature[],
  reviewedFeatures: RoadFeature[],
): T[] {
  const changedFeatureIds = new Set<string>();

  for (const original of originalFeatures) {
    const current = reviewedFeatures.find(feature => feature.id === original.id);
    if (!current) {
      changedFeatureIds.add(original.id);
      continue;
    }
    const moved = original.vertices.length !== current.vertices.length
      || original.vertices.some((vertex, index) => {
        const other = current.vertices[index];
        return !other || distance(vertex, other) > 0.01;
      });
    if (moved) changedFeatureIds.add(original.id);
  }

  if (changedFeatureIds.size === 0) return lines;

  const changedIndexes = new Set<number>();
  for (const feature of originalFeatures) {
    if (!changedFeatureIds.has(feature.id)) continue;
    for (const index of feature.sourceLineIndexes) changedIndexes.add(index);
  }

  const kept = lines.filter((_, index) => !changedIndexes.has(index));
  const rebuilt: T[] = [];
  for (const feature of reviewedFeatures) {
    if (!changedFeatureIds.has(feature.id)) continue;
    // A stitched feature carries the source indexes of both parents; use the
    // first template that actually changed.
    const templateIndex = feature.sourceLineIndexes.find(index => changedIndexes.has(index))
      ?? feature.sourceLineIndexes[0];
    if (templateIndex === undefined) continue;
    const template = lines[templateIndex];
    if (!template) continue;
    const rebuiltHere: T[] = [];
    for (let i = 0; i < feature.vertices.length - 1; i++) {
      rebuiltHere.push(buildLineFromTemplate(template, feature.vertices[i], feature.vertices[i + 1], feature.id, i));
    }
    rebuilt.push(...rebuiltHere);
  }

  return [...kept, ...rebuilt];
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

export function formatRoadTakeSummary(report: RoadTakeReport): string {
  const base = `Civil Drafter road review — ${report.takes} take${report.takes === 1 ? '' : 's'}, ` +
    `${report.featuresAudited} corridor line${report.featuresAudited === 1 ? '' : 's'}, ` +
    `${report.scoreBefore}% → ${report.scoreAfter}%`;
  const grounding = report.grounding.osmWays > 0
    ? ` · grounded on ${report.grounding.osmWays} OSM way(s) and ${report.grounding.parcelSegments} parcel line(s)`
    : report.grounding.parcelSegments > 0
      ? ` · grounded on ${report.grounding.parcelSegments} parcel line(s)`
      : ' · no OSM/parcel grounding available';
  const inferred = report.inferredFromGeometry ? ' · road layer inferred from geometry' : '';
  if (report.featuresAudited === 0) {
    return `${base}${grounding}. No road/pavement linework was recognized, so no continuity review ran — check that the road edges use a road layer (L-ROAD/C-ROAD-CNTR).`;
  }
  if (report.status === 'needs_retake') {
    return `${base}${grounding}${inferred}. ${report.remaining.length} defect(s) still need a redraw: ${report.remaining.slice(0, 4).join('; ')}`;
  }
  if (report.status === 'clean') {
    return `${base}${grounding}${inferred}. Take accepted — no gaps, crossings, stubs or duplicates found.`;
  }
  return `${base}${grounding}${inferred}. Accepted after ${report.repairs.length} repair(s).`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Model retake support (second / third take)
// ─────────────────────────────────────────────────────────────────────────────

/** A corrected chain emitted by the model on a retake. */
export interface RoadRetakeChain {
  polylineId?: string;
  layer?: string;
  lineType?: string;
  pointNumbers: string[];
}

/** A corrected segment emitted by the model on a retake. Either existing point
 * numbers (`from`/`to`) or explicit project coordinates may be supplied. */
export interface RoadRetakeLine {
  from?: string;
  to?: string;
  fromPt?: { x: number; y: number };
  toPt?: { x: number; y: number };
  layer?: string;
  lineType?: string;
  polylineId?: string;
}

export interface RoadRetakeDraft {
  chains: RoadRetakeChain[];
  lines: RoadRetakeLine[];
}

function firstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseLooseJsonObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  for (const candidate of [fenced?.[1], text]) {
    if (!candidate) continue;
    const trimmed = candidate.trim();
    const objectText = trimmed.startsWith('{') ? trimmed : firstJsonObject(trimmed);
    if (!objectText) continue;
    try {
      const parsed = JSON.parse(objectText);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function retakePoint(raw: unknown): { x: number; y: number } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const point = raw as Record<string, unknown>;
  const x = Number(point.x ?? point.easting);
  const y = Number(point.y ?? point.northing);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
}

/** Parse the model's retake response. Accepts a ```json fence or a bare object. */
export function parseRoadRetakeResponse(text: string): RoadRetakeDraft | null {
  const parsed = parseLooseJsonObject(text);
  if (!parsed) return null;
  const root = parsed.retake && typeof parsed.retake === 'object' && !Array.isArray(parsed.retake)
    ? parsed.retake as Record<string, unknown>
    : parsed;

  const chains: RoadRetakeChain[] = [];
  if (Array.isArray(root.chains)) {
    for (const raw of root.chains) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      const pointNumbers = Array.isArray(item.pointNumbers)
        ? item.pointNumbers.map(value => String(value)).filter(Boolean)
        : [];
      if (pointNumbers.length < 2) continue;
      chains.push({
        polylineId: typeof item.polylineId === 'string' ? item.polylineId : undefined,
        layer: typeof item.layer === 'string' ? item.layer : undefined,
        lineType: typeof item.lineType === 'string' ? item.lineType : undefined,
        pointNumbers,
      });
    }
  }

  const lines: RoadRetakeLine[] = [];
  if (Array.isArray(root.lines)) {
    for (const raw of root.lines) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      const fromPt = retakePoint(item.fromPt);
      const toPt = retakePoint(item.toPt);
      const from = typeof item.from === 'string' ? item.from : undefined;
      const to = typeof item.to === 'string' ? item.to : undefined;
      if ((!from || !to) && (!fromPt || !toPt)) continue;
      lines.push({
        from,
        to,
        fromPt,
        toPt,
        layer: typeof item.layer === 'string' ? item.layer : undefined,
        lineType: typeof item.lineType === 'string' ? item.lineType : undefined,
        polylineId: typeof item.polylineId === 'string' ? item.polylineId : undefined,
      });
    }
  }

  return chains.length > 0 || lines.length > 0 ? { chains, lines } : null;
}

/** Extra first-pass evidence the caller can hand to the redraw model. The
 * mathematical station/width brief is built outside this module so the take
 * reviewer stays independent of the Gimbal model. */
export interface RoadRetakeBriefing {
  /** Output of formatGimbalMathBrief() — station/offset/width targets. */
  mathModelBrief?: string;
  /** Compact verdict from the previous second-pass gimbal inspection. */
  inspectionSummary?: string;
  /** Measured mismatches from that inspection. */
  inspectionDefects?: string[];
  /** Coordinates/termini of the parcel and OSM evidence, not just counts. */
  groundingContext?: string;
  /** Road shots left unused by the current take, for curve recovery. */
  surveyPoints?: RoadSurveyPoint[];
}

/**
 * Build the model prompt for a second/third take. It states the reviewer's
 * critique, lists the take as drawn, and requires corrected geometry only —
 * no prose — so the caller can re-audit and accept it on score.
 */
export function formatRoadRetakePrompt(
  report: RoadTakeReport,
  lines: DraftLineLike[],
  maxLines = 60,
  briefing: RoadRetakeBriefing = {},
): string {
  const pavement = lines.filter(line =>
    !line.hidden
    && (pavementRoleFor(line.layer, line.polylineId) !== 'unknown' || isGenericRoadCandidate(line))
    && Boolean(lineEndpoints(line)),
  );
  const shown = pavement.slice(0, maxLines);
  const rows = shown.map(line => {
    const ends = lineEndpoints(line)!;
    const from = ends[0];
    const to = ends[1];
    return `  - ${line.polylineId ?? line.layer ?? 'line'} [${line.layer ?? '?'}] ` +
      `${line.from} (${from.easting.toFixed(1)}, ${from.northing.toFixed(1)}) → ` +
      `${line.to} (${to.easting.toFixed(1)}, ${to.northing.toFixed(1)})`;
  });

  const unusedSurveyPoints = (briefing.surveyPoints ?? [])
    .filter(point => {
      if (!surveyPointRole(point)) return false;
      const vertex = { easting: point.easting, northing: point.northing };
      return pavement.every(line => {
        const ends = lineEndpoints(line);
        return !ends || pointToPolylineDistance(vertex, ends) > 10;
      });
    })
    .filter(point => pavement.some(line => {
      const ends = lineEndpoints(line);
      return Boolean(ends && Math.min(
        distance(ends[0], { easting: point.easting, northing: point.northing }),
        distance(ends[1], { easting: point.easting, northing: point.northing }),
      ) <= 500);
    }))
    .slice(0, 12);

  return [
    '---BEGIN CIVIL DRAFTER SELF-REVIEW RETAKE---',
    report.status === 'needs_retake'
      ? `Your previous take scored ${report.scoreAfter}% and is not accepted: ${report.remaining.length} defect(s) remain.`
      : `Your previous take scored ${report.scoreAfter}% and passed the deterministic review. This is the mandatory second-pass Gimbal redraw: redraw the same road from the same shots and the first-pass math model. Preserve every corridor and paint run; do not add or drop linework.`,
    ...(report.remaining.length > 0
      ? ['Defects the reviewer found:', ...report.remaining.slice(0, 8).map(detail => `  - ${detail}`)]
      : ['No unresolved reviewer defects. Redraw the accepted geometry exactly as inspected so the second pass can confirm it.']),
    `Grounding available: ${report.grounding.osmWays} OSM way(s), ${report.grounding.parcelSegments} parcel line(s).`,
    ...(briefing.groundingContext ? ['', briefing.groundingContext, ''] : []),
    ...(briefing.mathModelBrief ? ['', briefing.mathModelBrief, ''] : []),
    ...(briefing.inspectionSummary || (briefing.inspectionDefects?.length ?? 0) > 0
      ? [
          'PREVIOUS SECOND-PASS GIMBAL INSPECTION:',
          ...(briefing.inspectionSummary ? [`  ${briefing.inspectionSummary}`] : []),
          ...(briefing.inspectionDefects ?? []).slice(0, 8).map(defect => `  - ${defect}`),
          '',
        ]
      : []),
    'Previous take (match these coordinates to existing shots in the point database):',
    ...rows,
    ...(pavement.length > shown.length ? [`  (+${pavement.length - shown.length} more segments)`] : []),
    ...(unusedSurveyPoints.length > 0
      ? [
          'REMAINING SURVEYED ROAD SHOTS INSIDE THE CORRIDOR (fit the missing curve through them):',
          ...unusedSurveyPoints.map(point =>
            `  - ${point.pointNumber ?? 'shot'}: (${point.easting.toFixed(1)}, ${point.northing.toFixed(1)})` +
            `${point.description ? ` [${point.description}]` : ''}`,
          ),
          '',
        ]
      : []),
    'REDRAW RULES:',
    '• Every pavement edge is ONE continuous line through existing shots: no gaps, no duplicate, no orphan stub.',
    '• Opposite edges stay parallel and never cross. A side road T-intersects the near edge; it never cuts across the pavement.',
    '• A sweeping four-way intersection is a continuous through-corridor with branch edges that stop at the through edge.',
    '• Start and end the pavement/centerline at the outer surveyed ROAD SHOTS. If the line stops short, extend along the same bearing to the farthest surveyed road point; never snap to a parcel line, vertex, or intersection.',
    '• Parcel lines are guidance only. Do not draw along parcel geometry or use it as pavement; use the shots and corridor logic to decide where the road runs.',
    '• A parallel line beside a continuation is not a crossing. Join same-edge runs across the gap even when another parallel line (opposite edge, centerline, or duplicate) is nearby.',
    '• A road never necks down to a point. Rebuild converging lines as two continuous parallel edges with a consistent width; a T or cross is allowed only where a branch actually exists.',
    '• If surveyed road shots remain inside the parcel corridor but no edge reaches them, synthesize a smooth curve through those shots. Do not draw a straight chord across them and do not snap to parcel geometry.',
    '• If the aerial is all tree canopy/vegetation, do not claim image support; use the field shots and corridor logic. OSM and parcel lines are guidance only.',
    '• Use existing point numbers from the database — never invent points. Explicit fromPt/toPt coordinates are also accepted.',
    '• DYL/DBL shots are PAINT, not a baseline: draw two continuous yellow stripes on L-ROAD-PAINT-Y. Never redraw them on C-ROAD-CNTR.',
    '• WL/SWL shots are one continuous white stripe on L-ROAD-PAINT-W.',
    '• A C-ROAD-CNTR dashed line is only for an explicitly requested baseline/centerline; paint runs stay on the paint layers with lineType CONTINUOUS.',
    '• Paint runs are stitched like pavement edges: one continuous stripe per run, no gap, no duplicate, and do not delete one band of a double-yellow pair.',
    'Return ONLY a ```json block, no prose:',
    '{"chains":[{"polylineId":"edge-north","layer":"L-ROAD","lineType":"CONTINUOUS","pointNumbers":["101","102"]}],"lines":[{"layer":"L-ROAD","fromPt":{"x":0,"y":25},"toPt":{"x":100,"y":25}}]}',
    '---END CIVIL DRAFTER SELF-REVIEW RETAKE---',
  ].join('\n');
}

/**
 * Run the multi-take road review: audit, repair, re-audit, and keep only the
 * take that improves the score. Returns the ORIGINAL lines when nothing improved.
 */
export function runRoadTakeReview<T extends DraftLineLike>(
  lines: T[],
  grounding: RoadGrounding = {},
  opts: RoadTakeOptions = {},
): RoadTakeResult<T> {
  const startedAt = Date.now();
  const evidence = buildEvidence(grounding);
  const maxTakes = Math.max(1, Math.min(5, Math.round(opts.maxTakes ?? 3)));
  const autoBridgeFt = Math.max(0, opts.autoBridgeFt ?? 60);
  const maxBridgeFt = Math.max(autoBridgeFt, opts.maxBridgeFt ?? 350);

  let originalFeatures = groupRoadFeatures(lines);
  let inferredFromGeometry = false;
  if (originalFeatures.length === 0 && opts.inferUnlabeledRoads) {
    originalFeatures = groupRoadFeatures(lines, { includeGenericLinework: true });
    inferredFromGeometry = originalFeatures.length > 0;
  }
  const groundingSummary = {
    osmWays: (grounding.osmWays ?? []).filter(way => way.vertices?.length >= 2).length,
    parcelSegments: (grounding.parcelLines ?? []).length,
    supportedFeatures: 0,
    unsupportedFeatures: 0,
  };

  if (originalFeatures.length === 0) {
    return {
      lines,
      changed: false,
      report: {
        status: 'clean',
        takes: 0,
        scoreBefore: 100,
        scoreAfter: 100,
        defectsFound: 0,
        defectsCorrected: 0,
        featuresAudited: 0,
        repairs: [],
        remaining: [],
        grounding: groundingSummary,
        inferredFromGeometry: false,
        durationMs: Date.now() - startedAt,
      },
    };
  }

  const initialAudit = auditFeatures(
    originalFeatures,
    evidence,
    opts.maxGapFt,
    opts.surveyPoints ?? [],
    lines,
  );
  const scoreBefore = initialAudit.score;
  const defectsFound = initialAudit.defects.length;

  let current = originalFeatures.map(feature => ({
    ...feature,
    vertices: feature.vertices.map(v => ({ ...v })),
    sourceLineIndexes: [...feature.sourceLineIndexes],
  }));
  let currentAudit = initialAudit;
  const repairs: string[] = [];
  let takes = 0;

  // Endpoint extension is a deterministic pre-pass: unlike a gap repair, the
  // initial audit has no defect to score when a road simply stops short of its
  // surveyed frontage. Apply it once and keep it only if it does not make the
  // take worse.
  const initialExtension = extendEndsToSurveyPoints(current, opts.surveyPoints ?? [], maxBridgeFt);
  if (initialExtension.extended > 0) {
    const extendedAudit = auditFeatures(
      initialExtension.features,
      evidence,
      opts.maxGapFt,
      opts.surveyPoints ?? [],
      lines,
    );
    if (extendedAudit.score >= initialAudit.score
      && extendedAudit.defects.length <= initialAudit.defects.length) {
      current = initialExtension.features;
      currentAudit = extendedAudit;
      repairs.push(...initialExtension.repairs);
      takes = 1;
    }
  }

  for (let take = 1; take <= maxTakes; take++) {
    takes = take;
    if (currentAudit.defects.length === 0) break;

    let working = current;
    const takeRepairs: string[] = [];

    if (take === 1 || take >= 3) {
      const stitched = stitchRoadRuns(working, evidence, opts.surveyPoints ?? [], autoBridgeFt, maxBridgeFt);
      if (stitched.repairs.length > 0) {
        working = stitched.features;
        takeRepairs.push(...stitched.repairs);
      }
    }

    if (take >= 2) {
      const auditForDrop = auditFeatures(
        working,
        evidence,
        opts.maxGapFt,
        opts.surveyPoints ?? [],
        lines,
      );
      const dropped = dropDefectiveFeatures(working, auditForDrop.defects);
      if (dropped.repairs.length > 0) {
        working = dropped.features;
        takeRepairs.push(...dropped.repairs);
      }
    }

    if (takeRepairs.length === 0) {
      // Take 1 only stitches. When there is no gap to stitch, proceed to the
      // drop take instead of stopping with a known crossing/stub in the take.
      if (take === 1) continue;
      break;
    }

    const candidateAudit = auditFeatures(
      working,
      evidence,
      opts.maxGapFt,
      opts.surveyPoints ?? [],
      lines,
    );
    const improved = candidateAudit.score > currentAudit.score
      || (candidateAudit.score === currentAudit.score && candidateAudit.defects.length < currentAudit.defects.length);
    if (!improved) continue;

    current = working;
    currentAudit = candidateAudit;
    repairs.push(...takeRepairs);
  }

  const finalAudit = auditFeatures(
    current,
    evidence,
    opts.maxGapFt,
    opts.surveyPoints ?? [],
    lines,
  );
  const finalCounts = {
    ...groundingSummary,
    supportedFeatures: finalAudit.supportedFeatures,
    unsupportedFeatures: finalAudit.unsupportedFeatures,
  };

  // Keep only real evidence features; re-run the count from the final take.
  const reviewedAudit = finalAudit;
  const remaining = reviewedAudit.defects
    .slice()
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'red' ? -1 : 1))
    .map(defect => defect.detail);

  const reviewedLines = rebuildLines(lines, originalFeatures, current);
  const changed = reviewedLines !== lines;
  // Any unresolved defect means the take is not accepted, even when other
  // defects were repaired in the same pass. Reporting "corrected" while a gap
  // or crossing still exists would be dishonest.
  const status: RoadTakeReport['status'] = remaining.length > 0
    ? 'needs_retake'
    : changed ? 'corrected' : 'clean';

  return {
    lines: reviewedLines,
    changed,
    report: {
      status,
      takes,
      scoreBefore,
      scoreAfter: reviewedAudit.score,
      defectsFound,
      defectsCorrected: Math.max(0, defectsFound - reviewedAudit.defects.length),
      featuresAudited: current.length,
      repairs,
      remaining,
      grounding: finalCounts,
      inferredFromGeometry,
      durationMs: Date.now() - startedAt,
    },
  };
}

// Convenience alias used by the canvas pipeline, mirroring the synthesis QA API.
export type RoadTakeLine = SurveyLine;
