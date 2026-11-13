/**
 * gimbalRoadModel.ts
 *
 * GIMBAL VISION — MATHEMATICAL ROAD MODEL FOR MULTI-PASS DRAFTING
 * ───────────────────────────────────────────────────────────────
 * A road take is not just linework: it is a corridor with a station, a bearing,
 * a width and an opposite edge at every cross-section. Frames are useful for
 * seeing the site, but they are a poor handoff between passes because each
 * glance is a separate crop. This module keeps the RELATIONSHIP between the
 * first-pass geometry as numbered cross-sections, so the second pass can be
 * told exactly which station is wrong, by how much, and what it must line up
 * with.
 *
 *   PASS 1 → buildRoadMathModel()       station/offset/width table + fix targets
 *   PASS 1 → formatGimbalMathBrief()    the table and numbered instructions
 *   PASS 2 → inspectGimbalRoadModel()   compare the redraw with the pass-1 model
 *
 * The model is deliberately deterministic and imagery-free. It is the
 * mathematical record that survives between Gimbal glances; pixel evidence and
 * the civil-sense take review remain separate checks.
 *
 * All coordinates are project coordinates in feet.
 */

import { groupRoadFeatures, type GroundingWay, type RoadFeature, type RoadTakeReport } from './roadTakeReview.ts';
import type { ParcelGapRoad } from './parcelRoadInference.ts';
import type { DraftLineLike, DraftVertex } from './synthesisVerification.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface RoadModelSection {
  /** Station along the corridor, measured from its first section. */
  stationFt: number;
  /** Model centre (midpoint of the two edges when paired). */
  easting: number;
  northing: number;
  /** Bearing from north, degrees 0–360. */
  bearingDeg: number;
  /** Edge-to-edge pavement width measured on this section, null when unpaired. */
  widthFt: number | null;
  /** Measured point on the near edge. */
  nearEdge?: DraftVertex;
  /** Measured point on the opposite edge. */
  farEdge?: DraftVertex;
  /** Bearing change per 100 ft from the previous section. */
  curvatureDegPer100Ft: number;
}

export interface RoadModelDefect {
  kind:
    | 'gap'
    | 'width_variance'
    | 'edge_unpaired'
    | 'coverage_short'
    | 'crossing'
    | 'self_intersection';
  severity: 'red' | 'yellow';
  stationFt: number | null;
  at: DraftVertex;
  detail: string;
}

export type RoadModelSource = 'drawn' | 'parcel_gap';

export interface RoadModelCorridor {
  id: string;
  kind: 'paired_edges' | 'centerline' | 'paint' | 'single_edge' | 'parcel_gap';
  /** Where this corridor came from. Omitted on older models means `drawn`. */
  source?: RoadModelSource;
  /** Confidence for inferred corridors (parcel gaps), 0–1. */
  confidence?: number;
  /** Parcel ids that bound an inferred gap corridor. */
  parcelIds?: string[];
  layer?: string;
  lengthFt: number;
  stationStartFt: number;
  stationEndFt: number;
  /** Median measured edge-to-edge width, null when there is no opposite edge. */
  widthFt: number | null;
  widthSpreadFt: number;
  edgeCount: number;
  hasCenterline: boolean;
  maxCurvatureDegPer100Ft: number;
  sections: RoadModelSection[];
  edgeFeatureIds: string[];
  centerlineFeatureId?: string;
  defects: RoadModelDefect[];
}

export type GimbalIntersectionKind = 't' | 'cross' | 'skew' | 'y' | 'l' | 'complex';

export interface GimbalIntersectionArm {
  corridorId: string;
  bearingDeg: number;
  stationFt: number;
}

export interface GimbalRoadIntersection {
  id: string;
  kind: GimbalIntersectionKind;
  /** Smallest angle between different corridors, 0–90°. */
  angleDeg: number;
  at: DraftVertex;
  corridorIds: string[];
  arms: GimbalIntersectionArm[];
  /** Station of the node on each corridor at the closest point. */
  stationByCorridor: Record<string, number>;
  label: string;
}

export interface RoadMathModel {
  corridors: RoadModelCorridor[];
  totalLengthFt: number;
  /** Median corridor width, null when every corridor is a single run. */
  widthFt: number | null;
  sections: number;
  unpairedEdges: number;
  builtAt: number;
  /** Explicit T / cross / skew nodes derived from corridor centre lines. */
  intersections?: GimbalRoadIntersection[];
  /** Number of parcel-gap road candidates carried into the model. */
  parcelGapRoads?: number;
  /** The civil-sense critique that accompanied this take, if available. */
  reviewRemaining: string[];
  reviewScore: number | null;
}

export interface GimbalRoadInspection {
  status: 'pass' | 'issues';
  acceptable: boolean;
  score: number;
  targetCorridors: number;
  inspectedCorridors: number;
  /** Percentage of the pass-1 station span covered by the redraw. */
  coveragePct: number;
  /** Median absolute difference between pass-1 and redraw width, ft. */
  widthDriftFt: number | null;
  defects: string[];
  notes: string[];
  summary: string;
}

export interface RoadMathModelOptions {
  /** Audit generic L-LINEWORK linework as road geometry. */
  includeGenericLinework?: boolean;
  /** Consecutive-vertex distance that counts as a broken edge (default 80 ft). */
  maxGapFt?: number;
  /** Cross-section spacing target (default 25 ft). */
  sectionIntervalFt?: number;
  /** Hard cap on sections per corridor (default 120). */
  maxSections?: number;
  /** Add inferred parcel-gap roads as target corridors (default false). */
  includeParcelGapRoads?: boolean;
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

function midpoint(a: DraftVertex, b: DraftVertex): DraftVertex {
  return { easting: (a.easting + b.easting) / 2, northing: (a.northing + b.northing) / 2 };
}

function unitVector(from: DraftVertex, to: DraftVertex): { x: number; y: number } | null {
  const dx = to.easting - from.easting;
  const dy = to.northing - from.northing;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return null;
  return { x: dx / length, y: dy / length };
}

function pointToSegmentDistance(p: DraftVertex, a: DraftVertex, b: DraftVertex): number {
  const dx = b.easting - a.easting;
  const dy = b.northing - a.northing;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p.easting - a.easting) * dx + (p.northing - a.northing) * dy) / lenSq));
  return Math.hypot(p.easting - (a.easting + t * dx), p.northing - (a.northing + t * dy));
}

function nearestPointOnPolyline(
  p: DraftVertex,
  vertices: DraftVertex[],
): { point: DraftVertex; distance: number; alongFt: number } | null {
  if (vertices.length === 0) return null;
  if (vertices.length === 1) {
    return { point: vertices[0], distance: distance(p, vertices[0]), alongFt: 0 };
  }
  let best: { point: DraftVertex; distance: number; alongFt: number } | null = null;
  let along = 0;
  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i];
    const b = vertices[i + 1];
    const dx = b.easting - a.easting;
    const dy = b.northing - a.northing;
    const lenSq = dx * dx + dy * dy;
    const segLength = Math.sqrt(lenSq);
    const t = lenSq < 1e-9
      ? 0
      : Math.max(0, Math.min(1, ((p.easting - a.easting) * dx + (p.northing - a.northing) * dy) / lenSq));
    const proj = { easting: a.easting + t * dx, northing: a.northing + t * dy };
    const d = distance(p, proj);
    if (!best || d < best.distance) {
      best = { point: proj, distance: d, alongFt: along + t * segLength };
    }
    along += segLength;
  }
  return best;
}

function pointToPolylineDistance(p: DraftVertex, vertices: DraftVertex[]): number {
  const nearest = nearestPointOnPolyline(p, vertices);
  return nearest ? nearest.distance : Infinity;
}

function bearingDeg(from: DraftVertex, to: DraftVertex): number {
  const dx = to.easting - from.easting;
  const dy = to.northing - from.northing;
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

function normalizeBearing(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function bearingDifference(a: number, b: number): number {
  let diff = normalizeBearing(a) - normalizeBearing(b);
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return diff;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

interface ResampledPoint extends DraftVertex {
  stationFt: number;
}

function resamplePolyline(vertices: DraftVertex[], targetCount: number): ResampledPoint[] {
  if (vertices.length < 2) return [];
  const totalLength = polylineLength(vertices);
  if (totalLength < 1) return [];

  const count = Math.max(2, Math.min(targetCount, Math.floor(totalLength / 5) + 1));
  const result: ResampledPoint[] = [];
  let segment = 0;
  let segmentStart = 0;

  for (let i = 0; i < count; i++) {
    const station = (i / (count - 1)) * totalLength;
    while (segment < vertices.length - 2) {
      const segLength = distance(vertices[segment], vertices[segment + 1]);
      if (segmentStart + segLength >= station) break;
      segmentStart += segLength;
      segment++;
    }
    let segLength = distance(vertices[segment], vertices[segment + 1]);
    if (segLength < 1e-6) segLength = 1;
    const t = Math.max(0, Math.min(1, (station - segmentStart) / segLength));
    const a = vertices[segment];
    const b = vertices[segment + 1];
    result.push({
      easting: a.easting + (b.easting - a.easting) * t,
      northing: a.northing + (b.northing - a.northing) * t,
      stationFt: station,
    });
  }
  return result;
}

function rangeAlongAxis(vertices: DraftVertex[], origin: DraftVertex, axis: { x: number; y: number }): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const vertex of vertices) {
    const t = (vertex.easting - origin.easting) * axis.x + (vertex.northing - origin.northing) * axis.y;
    if (t < min) min = t;
    if (t > max) max = t;
  }
  return { min, max };
}

function projectionOverlapShare(a: DraftVertex[], b: DraftVertex[]): number {
  const axis = unitVector(a[0], a[a.length - 1]) ?? unitVector(b[0], b[b.length - 1]);
  if (!axis) return 0;
  const aRange = rangeAlongAxis(a, a[0], axis);
  const bRange = rangeAlongAxis(b, a[0], axis);
  const intersection = Math.max(0, Math.min(aRange.max, bRange.max) - Math.max(aRange.min, bRange.min));
  const shorter = Math.min(aRange.max - aRange.min, bRange.max - bRange.min);
  return shorter > 1 ? Math.min(1, intersection / shorter) : 0;
}

function separationStats(a: DraftVertex[], b: DraftVertex[]): { mean: number; std: number } {
  const samples = resamplePolyline(a, 20);
  if (samples.length === 0) return { mean: Infinity, std: Infinity };
  const distances = samples.map(sample => pointToPolylineDistance(sample, b));
  const mean = distances.reduce((sum, value) => sum + value, 0) / distances.length;
  return { mean, std: stdDev(distances) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Intersection nodes
// ─────────────────────────────────────────────────────────────────────────────

function segmentHit(
  a: DraftVertex,
  b: DraftVertex,
  c: DraftVertex,
  d: DraftVertex,
): { at: DraftVertex; t: number; u: number } | null {
  const rx = b.easting - a.easting;
  const ry = b.northing - a.northing;
  const sx = d.easting - c.easting;
  const sy = d.northing - c.northing;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-9) return null;
  const qpx = c.easting - a.easting;
  const qpy = c.northing - a.northing;
  const t = (qpx * sy - qpy * sx) / denominator;
  const u = (qpx * ry - qpy * rx) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return {
    at: { easting: a.easting + t * rx, northing: a.northing + t * ry },
    t,
    u,
  };
}

function nearestPointDetailed(
  p: DraftVertex,
  vertices: DraftVertex[],
): { point: DraftVertex; distance: number; alongFt: number; t: number } | null {
  if (vertices.length === 0) return null;
  if (vertices.length === 1) {
    return { point: vertices[0], distance: distance(p, vertices[0]), alongFt: 0, t: 0 };
  }
  let best: { point: DraftVertex; distance: number; alongFt: number; t: number } | null = null;
  let along = 0;
  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i];
    const b = vertices[i + 1];
    const dx = b.easting - a.easting;
    const dy = b.northing - a.northing;
    const lengthSq = dx * dx + dy * dy;
    const length = Math.sqrt(lengthSq);
    const t = lengthSq < 1e-9
      ? 0
      : Math.max(0, Math.min(1, ((p.easting - a.easting) * dx + (p.northing - a.northing) * dy) / lengthSq));
    const point = { easting: a.easting + t * dx, northing: a.northing + t * dy };
    const d = distance(p, point);
    if (!best || d < best.distance) {
      best = { point, distance: d, alongFt: along + t * length, t };
    }
    along += length;
  }
  return best;
}

function corridorCenterline(corridor: RoadModelCorridor): DraftVertex[] {
  return corridor.sections.map(section => ({
    easting: section.easting,
    northing: section.northing,
  }));
}

function stationOnCorridor(corridor: RoadModelCorridor, point: DraftVertex): number {
  const nearest = nearestPointDetailed(point, corridorCenterline(corridor));
  return nearest ? nearest.alongFt : 0;
}

export function cardinalDirectionForBearing(bearingDeg: number): string {
  const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return labels[Math.round((((bearingDeg % 360) + 360) % 360) / 45) % 8];
}

function angleBetweenBearings(a: number, b: number): number {
  const difference = Math.abs(bearingDifference(a, b));
  return Math.min(difference, 180 - difference);
}

function segmentBearingDeg(a: DraftVertex, b: DraftVertex): number {
  return normalizeBearing(bearingDeg(a, b));
}

interface RawIntersection {
  at: DraftVertex;
  corridorIds: string[];
  arms: GimbalIntersectionArm[];
  angleDeg: number;
  throughCorridors: string[];
}

function armsForThrough(corridor: RoadModelCorridor, point: DraftVertex, bearing: number): GimbalIntersectionArm[] {
  const station = stationOnCorridor(corridor, point);
  return [
    { corridorId: corridor.id, bearingDeg: normalizeBearing(bearing), stationFt: station },
    { corridorId: corridor.id, bearingDeg: normalizeBearing(bearing + 180), stationFt: station },
  ];
}

function nodeLabel(kind: GimbalIntersectionKind, angleDeg: number, at: DraftVertex, stations: Record<string, number>): string {
  const stationText = Object.entries(stations)
    .map(([corridorId, station]) => `${corridorId} sta ${formatStation(station)}`)
    .join(' × ');
  return `${kind.toUpperCase()} · ${angleDeg.toFixed(0)}° · ${stationText} · (${at.easting.toFixed(1)}, ${at.northing.toFixed(1)})`;
}

function mergeIntersectionNodes(nodes: RawIntersection[]): RawIntersection[] {
  const merged: RawIntersection[] = [];
  for (const node of nodes) {
    const near = merged.find(existing => distance(existing.at, node.at) <= 15);
    if (!near) {
      merged.push({
        ...node,
        corridorIds: [...new Set(node.corridorIds)],
        throughCorridors: [...new Set(node.throughCorridors)],
      });
      continue;
    }
    const count = Math.max(1, merged.filter(existing => distance(existing.at, near.at) <= 15).length + 1);
    near.at = {
      easting: (near.at.easting * (count - 1) + node.at.easting) / count,
      northing: (near.at.northing * (count - 1) + node.at.northing) / count,
    };
    near.corridorIds = [...new Set([...near.corridorIds, ...node.corridorIds])];
    near.throughCorridors = [...new Set([...near.throughCorridors, ...node.throughCorridors])];
    const seenArms = new Set(near.arms.map(arm => `${arm.corridorId}:${Math.round(arm.bearingDeg)}`));
    for (const arm of node.arms) {
      const key = `${arm.corridorId}:${Math.round(arm.bearingDeg)}`;
      if (!seenArms.has(key)) {
        seenArms.add(key);
        near.arms.push(arm);
      }
    }
    near.angleDeg = Math.min(near.angleDeg, node.angleDeg);
  }
  return merged;
}

/**
 * Detect explicit intersection nodes from the corridor centre lines. A proper
 * interior crossing is a cross (near 90°) or a skew cross (any other angle);
 * a corridor endpoint that terminates on another corridor is a T; three or
 * more terminal corridors at one node are a Y. Every node keeps its angle,
 * arm count, station on each corridor and absolute coordinates so the drafter
 * can reproduce it instead of being told only "preserve the intersection".
 */
export function buildGimbalIntersections(corridors: RoadModelCorridor[]): GimbalRoadIntersection[] {
  const usable = corridors.filter(corridor => corridor.sections.length >= 2);
  if (usable.length < 2) return [];
  const raw: RawIntersection[] = [];

  for (let i = 0; i < usable.length; i++) {
    const a = usable[i];
    const aPoints = corridorCenterline(a);
    for (let j = i + 1; j < usable.length; j++) {
      const b = usable[j];
      const bPoints = corridorCenterline(b);
      let crossing: { at: DraftVertex; bearingA: number; bearingB: number; angleDeg: number } | null = null;

      const aLength = polylineLength(aPoints);
      const bLength = polylineLength(bPoints);
      for (let ai = 0; ai < aPoints.length - 1 && !crossing; ai++) {
        for (let bi = 0; bi < bPoints.length - 1; bi++) {
          const hit = segmentHit(aPoints[ai], aPoints[ai + 1], bPoints[bi], bPoints[bi + 1]);
          if (!hit) continue;
          // A crossing can land exactly on a 25-ft station boundary. Test its
          // along-corridor station, not the local segment parameter, so a
          // boundary hit is still an interior intersection.
          const alongA = nearestPointDetailed(hit.at, aPoints);
          const alongB = nearestPointDetailed(hit.at, bPoints);
          if (!alongA || !alongB) continue;
          if (alongA.alongFt <= 15 || alongA.alongFt >= aLength - 15) continue;
          if (alongB.alongFt <= 15 || alongB.alongFt >= bLength - 15) continue;
          const bearingA = segmentBearingDeg(aPoints[ai], aPoints[ai + 1]);
          const bearingB = segmentBearingDeg(bPoints[bi], bPoints[bi + 1]);
          crossing = { at: hit.at, bearingA, bearingB, angleDeg: angleBetweenBearings(bearingA, bearingB) };
          break;
        }
      }

      if (crossing) {
        raw.push({
          at: crossing.at,
          corridorIds: [a.id, b.id],
          arms: [
            ...armsForThrough(a, crossing.at, crossing.bearingA),
            ...armsForThrough(b, crossing.at, crossing.bearingB),
          ],
          angleDeg: crossing.angleDeg,
          throughCorridors: [a.id, b.id],
        });
        continue;
      }

      const aEndpoints = [aPoints[0], aPoints[aPoints.length - 1]];
      const bEndpoints = [bPoints[0], bPoints[bPoints.length - 1]];
      let terminal: { at: DraftVertex; branch: RoadModelCorridor; through: RoadModelCorridor; branchBearing: number; throughBearing: number; angleDeg: number } | null = null;

      const throughLength = polylineLength(bPoints);
      for (const endpoint of aEndpoints) {
        const near = nearestPointDetailed(endpoint, bPoints);
        if (!near || near.distance > 10 || near.alongFt <= 15 || near.alongFt >= throughLength - 15) continue;
        const branchBearing = distance(aPoints[0], endpoint) <= 0.5
          ? segmentBearingDeg(aPoints[1], aPoints[0])
          : segmentBearingDeg(aPoints[aPoints.length - 2], aPoints[aPoints.length - 1]);
        const throughBearing = segmentBearingDeg(bPoints[0], bPoints[1]);
        terminal = {
          at: near.point,
          branch: a,
          through: b,
          branchBearing,
          throughBearing,
          angleDeg: angleBetweenBearings(branchBearing, throughBearing),
        };
        break;
      }
      if (!terminal) {
        const aLength = polylineLength(aPoints);
        for (const endpoint of bEndpoints) {
          const near = nearestPointDetailed(endpoint, aPoints);
          if (!near || near.distance > 10 || near.alongFt <= 15 || near.alongFt >= aLength - 15) continue;
          const branchBearing = distance(bPoints[0], endpoint) <= 0.5
            ? segmentBearingDeg(bPoints[1], bPoints[0])
            : segmentBearingDeg(bPoints[bPoints.length - 2], bPoints[bPoints.length - 1]);
          const throughBearing = segmentBearingDeg(aPoints[0], aPoints[1]);
          terminal = {
            at: near.point,
            branch: b,
            through: a,
            branchBearing,
            throughBearing,
            angleDeg: angleBetweenBearings(branchBearing, throughBearing),
          };
          break;
        }
      }

      if (terminal) {
        raw.push({
          at: terminal.at,
          corridorIds: [terminal.branch.id, terminal.through.id],
          arms: [
            { corridorId: terminal.branch.id, bearingDeg: normalizeBearing(terminal.branchBearing), stationFt: stationOnCorridor(terminal.branch, terminal.at) },
            ...armsForThrough(terminal.through, terminal.at, terminal.throughBearing),
          ],
          angleDeg: terminal.angleDeg,
          throughCorridors: [terminal.through.id],
        });
        continue;
      }

      let joined = false;
      for (const aEnd of aEndpoints) {
        for (const bEnd of bEndpoints) {
          if (distance(aEnd, bEnd) > 12) continue;
          const aIndex = distance(aPoints[0], aEnd) <= 0.5 ? 1 : aPoints.length - 2;
          const bIndex = distance(bPoints[0], bEnd) <= 0.5 ? 1 : bPoints.length - 2;
          const aBearing = segmentBearingDeg(aPoints[aIndex], aEnd);
          const bBearing = segmentBearingDeg(bPoints[bIndex], bEnd);
          raw.push({
            at: midpoint(aEnd, bEnd),
            corridorIds: [a.id, b.id],
            arms: [
              { corridorId: a.id, bearingDeg: normalizeBearing(aBearing), stationFt: stationOnCorridor(a, aEnd) },
              { corridorId: b.id, bearingDeg: normalizeBearing(bBearing), stationFt: stationOnCorridor(b, bEnd) },
            ],
            angleDeg: angleBetweenBearings(aBearing, bBearing),
            throughCorridors: [],
          });
          joined = true;
          break;
        }
        if (joined) break;
      }
    }
  }

  return mergeIntersectionNodes(raw)
    .map((node, index) => {
      const armCount = node.arms.length;
      let kind: GimbalIntersectionKind;
      if (armCount >= 5) kind = 'complex';
      else if (armCount === 4) {
        kind = node.throughCorridors.length >= 2 && node.angleDeg >= 75 ? 'cross' : 'skew';
      } else if (armCount === 3) {
        kind = node.throughCorridors.length >= 1 ? 't' : 'y';
      } else if (armCount === 2) {
        kind = 'l';
      } else {
        kind = 'complex';
      }
      const stationByCorridor = Object.fromEntries(
        node.corridorIds.map(corridorId => {
          const corridor = usable.find(candidate => candidate.id === corridorId);
          return [corridorId, corridor ? stationOnCorridor(corridor, node.at) : 0];
        }),
      );
      return {
        id: `INT-${index + 1}`,
        kind,
        angleDeg: parseFloat(node.angleDeg.toFixed(1)),
        at: { easting: parseFloat(node.at.easting.toFixed(2)), northing: parseFloat(node.at.northing.toFixed(2)) },
        corridorIds: node.corridorIds,
        arms: node.arms,
        stationByCorridor,
        label: nodeLabel(kind, node.angleDeg, node.at, stationByCorridor),
      };
    })
    .sort((a, b) => a.at.northing - b.at.northing || a.at.easting - b.at.easting);
}

// ─────────────────────────────────────────────────────────────────────────────
// Corridor assembly
// ─────────────────────────────────────────────────────────────────────────────

interface EdgePair {
  primary: RoadFeature;
  secondary: RoadFeature;
  meanSeparationFt: number;
}

function pairEdgeFeatures(edges: RoadFeature[]): { pairs: EdgePair[]; unpaired: RoadFeature[] } {
  const candidates: Array<EdgePair & { score: number }> = [];

  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const a = edges[i];
      const b = edges[j];
      if (a.vertices.length < 2 || b.vertices.length < 2) continue;
      if ((a.layer ?? '') !== (b.layer ?? '')) continue;

      const overlap = projectionOverlapShare(a.vertices, b.vertices);
      if (overlap < 0.35) continue;
      const stats = separationStats(a.vertices, b.vertices);
      if (!Number.isFinite(stats.mean)) continue;
      // Two runs of the SAME edge are normally merged by groupRoadFeatures.
      // A separation this small is more likely a duplicate than an opposite edge.
      if (stats.mean < 6 || stats.mean > 90) continue;
      // A paired edge keeps a near-constant offset; a zig-zag or a crossing road
      // does not. Leave those to the take review instead of inventing a width.
      if (stats.std > 9) continue;

      const primary = polylineLength(a.vertices) >= polylineLength(b.vertices) ? a : b;
      const secondary = primary === a ? b : a;
      candidates.push({
        primary,
        secondary,
        meanSeparationFt: stats.mean,
        score: stats.mean + stats.std * 2 - overlap * 30,
      });
    }
  }

  candidates.sort((a, b) => a.score - b.score);
  const used = new Set<string>();
  const pairs: EdgePair[] = [];
  for (const candidate of candidates) {
    if (used.has(candidate.primary.id) || used.has(candidate.secondary.id)) continue;
    used.add(candidate.primary.id);
    used.add(candidate.secondary.id);
    pairs.push(candidate);
  }

  return { pairs, unpaired: edges.filter(edge => !used.has(edge.id)) };
}

function buildSections(
  primaryVertices: DraftVertex[],
  secondaryVertices: DraftVertex[] | null,
  intervalFt: number,
  maxSections: number,
): RoadModelSection[] {
  const totalLength = polylineLength(primaryVertices);
  const count = Math.max(2, Math.min(maxSections, Math.ceil(totalLength / Math.max(intervalFt, 5)) + 1));
  const samples = resamplePolyline(primaryVertices, count);
  const sections: RoadModelSection[] = [];

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const nearest = secondaryVertices ? nearestPointOnPolyline(sample, secondaryVertices) : null;
    const farEdge = nearest && nearest.distance <= 150 ? nearest.point : undefined;
    const center = farEdge ? midpoint(sample, farEdge) : { easting: sample.easting, northing: sample.northing };

    const prev = samples[Math.max(0, i - 1)];
    const next = samples[Math.min(samples.length - 1, i + 1)];
    let heading = 0;
    if (distance(prev, next) > 1e-6) {
      heading = normalizeBearing(bearingDeg(prev, next));
    } else if (i > 0) {
      heading = sections[i - 1].bearingDeg;
    }

    sections.push({
      stationFt: parseFloat(sample.stationFt.toFixed(2)),
      easting: parseFloat(center.easting.toFixed(2)),
      northing: parseFloat(center.northing.toFixed(2)),
      bearingDeg: parseFloat(heading.toFixed(2)),
      widthFt: farEdge ? parseFloat(distance(sample, farEdge).toFixed(2)) : null,
      nearEdge: { easting: parseFloat(sample.easting.toFixed(2)), northing: parseFloat(sample.northing.toFixed(2)) },
      farEdge: farEdge
        ? { easting: parseFloat(farEdge.easting.toFixed(2)), northing: parseFloat(farEdge.northing.toFixed(2)) }
        : undefined,
      curvatureDegPer100Ft: 0,
    });
  }

  for (let i = 1; i < sections.length; i++) {
    const stationDelta = Math.max(1, sections[i].stationFt - sections[i - 1].stationFt);
    const turn = bearingDifference(sections[i].bearingDeg, sections[i - 1].bearingDeg);
    sections[i].curvatureDegPer100Ft = parseFloat(((turn / stationDelta) * 100).toFixed(3));
  }

  return sections;
}

function featureGapDefects(feature: RoadFeature, maxGapFt: number): RoadModelDefect[] {
  // A two/three-vertex run is one long straight segment, not a gap.
  if (feature.vertices.length < 4) return [];
  const defects: RoadModelDefect[] = [];
  let station = 0;
  for (let i = 1; i < feature.vertices.length; i++) {
    const gap = distance(feature.vertices[i - 1], feature.vertices[i]);
    if (gap > maxGapFt) {
      defects.push({
        kind: 'gap',
        severity: gap > maxGapFt * 2 ? 'red' : 'yellow',
        stationFt: parseFloat(station.toFixed(1)),
        at: feature.vertices[i - 1],
        detail:
          `${feature.role === 'centerline' ? 'centerline' : feature.role === 'paint' ? 'paint run' : 'pavement edge'} jumps ` +
          `${gap.toFixed(0)} ft at station ${formatStation(station)} — one continuous line is required`,
      });
    }
    station += gap;
  }
  return defects;
}

function widthVarianceDefects(sections: RoadModelSection[], corridorLabel: string): RoadModelDefect[] {
  const widths = sections.map(section => section.widthFt).filter((width): width is number => width !== null);
  if (widths.length < 3) return [];
  const target = median(widths);
  if (target === null) return [];

  const defect = sections.find(section =>
    section.widthFt !== null && Math.abs(section.widthFt - target) > 3.5,
  );
  if (!defect) return [];

  return [{
    kind: 'width_variance',
    severity: Math.abs((defect.widthFt ?? target) - target) > 8 ? 'red' : 'yellow',
    stationFt: defect.stationFt,
    at: { easting: defect.nearEdge?.easting ?? defect.easting, northing: defect.nearEdge?.northing ?? defect.northing },
    detail:
      `${corridorLabel} width is ${defect.widthFt?.toFixed(1)} ft at station ${formatStation(defect.stationFt)} ` +
      `but the modelled corridor width is ${target.toFixed(1)} ft — hold the opposite edge parallel at ` +
      `${target.toFixed(1)} ft ± 2 ft`,
  }];
}

function groundingShortfall(
  primaryVertices: DraftVertex[],
  sections: RoadModelSection[],
  osmWays: GroundingWay[],
): RoadModelDefect | null {
  if (sections.length < 2 || osmWays.length === 0) return null;
  const first = sections[0];
  const last = sections[sections.length - 1];
  const spanLength = polylineLength(primaryVertices);
  const chordAxis = unitVector(
    { easting: first.easting, northing: first.northing },
    { easting: last.easting, northing: last.northing },
  );

  let best: { shortfall: number; defect: RoadModelDefect } | null = null;

  for (const way of osmWays) {
    if (!way.vertices || way.vertices.length < 2) continue;
    const endpoints = [way.vertices[0], way.vertices[way.vertices.length - 1]];
    for (const endpoint of endpoints) {
      const lateral = pointToPolylineDistance(endpoint, primaryVertices);
      if (lateral > 120) continue;

      // A side street T-ing into the middle of this corridor is not a missing
      // terminal. Only an OSM endpoint outside the modelled station span can
      // justify "extend the edge to that terminal".
      if (chordAxis) {
        const along = (endpoint.easting - first.easting) * chordAxis.x
          + (endpoint.northing - first.northing) * chordAxis.y;
        if (along >= -25 && along <= spanLength + 25) continue;
      }

      const toFirst = distance(endpoint, { easting: first.easting, northing: first.northing });
      const toLast = distance(endpoint, { easting: last.easting, northing: last.northing });
      const nearFirst = toFirst <= toLast;
      const shortfall = nearFirst ? toFirst : toLast;
      if (shortfall < 25 || shortfall > 600) continue;

      const label = way.name?.trim() ? `OSM way "${way.name}"` : 'the OSM way';
      const defect: RoadModelDefect = {
        kind: 'coverage_short',
        severity: 'yellow',
        stationFt: nearFirst ? 0 : last.stationFt,
        at: endpoint,
        detail:
          `corridor ends ${shortfall.toFixed(0)} ft short of ${label} at ` +
          `(${endpoint.easting.toFixed(1)}, ${endpoint.northing.toFixed(1)}) — extend the edge to that terminal`,
      };
      if (!best || shortfall < best.shortfall) best = { shortfall, defect };
    }
  }

  return best?.defect ?? null;
}

function assignCenterline(
  corridorSections: RoadModelSection[],
  centerlines: RoadFeature[],
): { hasCenterline: boolean; featureId?: string } {
  if (centerlines.length === 0 || corridorSections.length === 0) return { hasCenterline: false };
  const middle = corridorSections[Math.floor(corridorSections.length / 2)];
  let best: { feature: RoadFeature; distance: number } | null = null;
  for (const feature of centerlines) {
    const d = pointToPolylineDistance({ easting: middle.easting, northing: middle.northing }, feature.vertices);
    if (!best || d < best.distance) best = { feature, distance: d };
  }
  return best && best.distance <= 35
    ? { hasCenterline: true, featureId: best.feature.id }
    : { hasCenterline: false };
}

function buildCorridor(
  id: string,
  primary: RoadFeature,
  secondary: RoadFeature | null,
  centerlines: RoadFeature[],
  osmWays: GroundingWay[],
  options: Required<Pick<RoadMathModelOptions, 'maxGapFt' | 'sectionIntervalFt' | 'maxSections'>>,
): RoadModelCorridor {
  const sections = buildSections(
    primary.vertices,
    secondary?.vertices ?? null,
    options.sectionIntervalFt,
    options.maxSections,
  );
  const widths = sections.map(section => section.widthFt).filter((width): width is number => width !== null);
  const widthFt = median(widths);
  const widthSpreadFt = widths.length >= 2 && widthFt !== null
    ? stdDev(widths)
    : 0;
  const centerline = assignCenterline(sections, centerlines);
  const label = `${id} (${primary.layer ?? 'road layer'})`;

  const defects: RoadModelDefect[] = [
    ...featureGapDefects(primary, options.maxGapFt),
    ...(secondary ? featureGapDefects(secondary, options.maxGapFt) : []),
    ...widthVarianceDefects(sections, label),
  ];

  if (!secondary && primary.role === 'edge') {
    defects.push({
      kind: 'edge_unpaired',
      severity: 'yellow',
      stationFt: 0,
      at: primary.vertices[0],
      detail:
        `${id} has only one pavement edge — draw the opposite edge so the corridor has a measurable width`,
    });
  }

  const shortfall = groundingShortfall(primary.vertices, sections, osmWays);
  if (shortfall) defects.push(shortfall);

  const lengthFt = polylineLength(primary.vertices);
  return {
    id,
    kind: secondary
      ? 'paired_edges'
      : primary.role === 'centerline'
        ? 'centerline'
        : primary.role === 'paint'
          ? 'paint'
          : 'single_edge',
    source: 'drawn',
    layer: primary.layer,
    lengthFt: parseFloat(lengthFt.toFixed(2)),
    stationStartFt: 0,
    stationEndFt: parseFloat(lengthFt.toFixed(2)),
    widthFt: widthFt === null ? null : parseFloat(widthFt.toFixed(2)),
    widthSpreadFt: parseFloat(widthSpreadFt.toFixed(2)),
    edgeCount: secondary ? 2 : (primary.role === 'centerline' || primary.role === 'paint') ? 0 : 1,
    hasCenterline: centerline.hasCenterline,
    maxCurvatureDegPer100Ft: sections.reduce(
      (max, section) => Math.max(max, Math.abs(section.curvatureDegPer100Ft)),
      0,
    ),
    sections,
    edgeFeatureIds: secondary ? [primary.id, secondary.id] : [primary.id],
    centerlineFeatureId: centerline.featureId,
    defects,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public model builder
// ─────────────────────────────────────────────────────────────────────────────

function buildParcelGapCorridor(
  id: string,
  road: ParcelGapRoad,
  intervalFt: number,
  maxSections: number,
): RoadModelCorridor {
  const count = Math.max(2, Math.min(maxSections, Math.ceil(road.lengthFt / Math.max(intervalFt, 5)) + 1));
  const samples = resamplePolyline(road.vertices, count);
  const halfWidth = road.widthFt / 2;
  const sections: RoadModelSection[] = samples.map((sample, index) => {
    const prev = samples[Math.max(0, index - 1)];
    const next = samples[Math.min(samples.length - 1, index + 1)];
    const heading = distance(prev, next) > 1e-6
      ? normalizeBearing(bearingDeg(prev, next))
      : 0;
    const normal = {
      easting: Math.cos((heading * Math.PI) / 180),
      northing: -Math.sin((heading * Math.PI) / 180),
    };
    return {
      stationFt: parseFloat(sample.stationFt.toFixed(2)),
      easting: parseFloat(sample.easting.toFixed(2)),
      northing: parseFloat(sample.northing.toFixed(2)),
      bearingDeg: parseFloat(heading.toFixed(2)),
      widthFt: road.widthFt,
      nearEdge: {
        easting: parseFloat((sample.easting + normal.easting * halfWidth).toFixed(2)),
        northing: parseFloat((sample.northing + normal.northing * halfWidth).toFixed(2)),
      },
      farEdge: {
        easting: parseFloat((sample.easting - normal.easting * halfWidth).toFixed(2)),
        northing: parseFloat((sample.northing - normal.northing * halfWidth).toFixed(2)),
      },
      curvatureDegPer100Ft: 0,
    };
  });
  for (let i = 1; i < sections.length; i++) {
    const stationDelta = Math.max(1, sections[i].stationFt - sections[i - 1].stationFt);
    const turn = bearingDifference(sections[i].bearingDeg, sections[i - 1].bearingDeg);
    sections[i].curvatureDegPer100Ft = parseFloat(((turn / stationDelta) * 100).toFixed(3));
  }

  return {
    id,
    kind: 'parcel_gap',
    source: 'parcel_gap',
    confidence: road.confidence,
    parcelIds: road.parcelIds,
    layer: 'PARCEL-GAP-ROAD',
    lengthFt: parseFloat(road.lengthFt.toFixed(2)),
    stationStartFt: 0,
    stationEndFt: parseFloat(road.lengthFt.toFixed(2)),
    widthFt: parseFloat(road.widthFt.toFixed(2)),
    widthSpreadFt: 0,
    edgeCount: 0,
    hasCenterline: true,
    maxCurvatureDegPer100Ft: sections.reduce(
      (max, section) => Math.max(max, Math.abs(section.curvatureDegPer100Ft)),
      0,
    ),
    sections,
    edgeFeatureIds: [],
    defects: [],
  };
}

function gapCoveredByDrawnCorridor(road: ParcelGapRoad, corridors: RoadModelCorridor[]): boolean {
  if (corridors.length === 0) return false;
  const samples = resamplePolyline(road.vertices, 9);
  const covered = samples.filter(sample =>
    corridors.some(corridor =>
      corridor.sections.some(section =>
        Math.hypot(section.easting - sample.easting, section.northing - sample.northing) <= 30,
      ),
    ),
  ).length;
  return samples.length > 0 && covered / samples.length >= 0.6;
}

export function buildRoadMathModel<T extends DraftLineLike>(
  lines: T[],
  grounding: { osmWays?: GroundingWay[]; parcelGapRoads?: ParcelGapRoad[] } = {},
  report?: Pick<RoadTakeReport, 'scoreAfter' | 'remaining'> | null,
  options: RoadMathModelOptions = {},
): RoadMathModel {
  const features = groupRoadFeatures(lines, {
    includeGenericLinework: options.includeGenericLinework === true,
  });
  const maxGapFt = options.maxGapFt ?? 80;
  const sectionIntervalFt = options.sectionIntervalFt ?? 25;
  const maxSections = Math.max(2, options.maxSections ?? 120);

  const edges = features.filter(feature => feature.role === 'edge');
  // Paint is centerline evidence: DYL/WL runs describe the road's medial line,
  // not another pavement edge. Treat them as centerline features so a broken
  // paint run is stitched and handed back with the corridor model.
  const centerlines = features.filter(feature => feature.role === 'centerline' || feature.role === 'paint');
  const { pairs, unpaired } = pairEdgeFeatures(edges);
  const osmWays = (grounding.osmWays ?? []).filter(way => way.vertices?.length >= 2);

  const corridors: RoadModelCorridor[] = [];
  let sequence = 1;
  for (const pair of pairs) {
    corridors.push(buildCorridor(
      `R${sequence++}`,
      pair.primary,
      pair.secondary,
      centerlines,
      osmWays,
      { maxGapFt, sectionIntervalFt, maxSections },
    ));
  }
  const claimedCenterlines = new Set(
    corridors
      .map(corridor => corridor.centerlineFeatureId)
      .filter((id): id is string => Boolean(id)),
  );
  const hasEdgeCorridors = corridors.length > 0;
  for (const centerline of centerlines) {
    if (claimedCenterlines.has(centerline.id)) continue;
    // A DYL/WL paint run alongside a paired-edge corridor is that corridor's
    // centerline evidence, not a second road. A paint-only take still gets a
    // model corridor so its gaps can be handed back.
    if (hasEdgeCorridors && centerline.role === 'paint') continue;
    corridors.push(buildCorridor(
      `R${sequence++}`,
      centerline,
      null,
      [],
      osmWays,
      { maxGapFt, sectionIntervalFt, maxSections },
    ));
  }
  for (const edge of unpaired) {
    corridors.push(buildCorridor(
      `R${sequence++}`,
      edge,
      null,
      centerlines,
      osmWays,
      { maxGapFt, sectionIntervalFt, maxSections },
    ));
  }

  let addedGapRoads = 0;
  if (options.includeParcelGapRoads) {
    const drawnCorridors = [...corridors];
    for (const road of grounding.parcelGapRoads ?? []) {
      if (gapCoveredByDrawnCorridor(road, drawnCorridors)) continue;
      corridors.push(buildParcelGapCorridor(
        `R${sequence++}`,
        road,
        sectionIntervalFt,
        maxSections,
      ));
      addedGapRoads++;
    }
  }

  const widths = corridors.map(corridor => corridor.widthFt).filter((width): width is number => width !== null);
  return {
    corridors,
    totalLengthFt: parseFloat(corridors.reduce((sum, corridor) => sum + corridor.lengthFt, 0).toFixed(2)),
    widthFt: median(widths) === null ? null : parseFloat(median(widths)!.toFixed(2)),
    sections: corridors.reduce((sum, corridor) => sum + corridor.sections.length, 0),
    unpairedEdges: unpaired.length,
    builtAt: Date.now(),
    intersections: buildGimbalIntersections(corridors),
    parcelGapRoads: addedGapRoads,
    reviewRemaining: report?.remaining?.slice(0, 8) ?? [],
    reviewScore: report?.scoreAfter ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting — the mathematical handoff to the second pass
// ─────────────────────────────────────────────────────────────────────────────

export function formatStation(stationFt: number): string {
  const sign = stationFt < 0 ? '-' : '';
  const absolute = Math.abs(stationFt);
  const hundreds = Math.floor(absolute / 100);
  const remainder = Math.round(absolute % 100);
  return `${sign}${hundreds}+${String(remainder).padStart(2, '0')}`;
}

export const ROAD_ACCEPTANCE_RUBRIC: string[] = [
  'ROAD ACCEPTANCE RUBRIC — every applicable red gate must pass:',
  '  coverage      ≥ 95% of each pass-1 station range, both ends within the corridor endpoint tolerance.',
  '  pairing       every pass-1 paired edge survives; no lost opposite edge.',
  '  continuity    no unstitched pavement/paint/curb gap beyond the corridor gap tolerance; no orphan stub or duplicate run.',
  '  crossing      no opposite-edge crossing or self-intersection; branches stop at the through edge.',
  '  width         hold the adopted width within the pass-1 tolerance; no section below the floor or above the ceiling.',
  '  paint         DYL/DBL = two continuous yellow bands; WL/SWL = one continuous white band; correct paint layer; no deleted band.',
  '  curb          continuous curb/gutter/flow-line chain following its pavement edge within 3 ft of the pass-1 offset.',
  '  intersection  preserve every target node: arm count, T/cross/skew type, angle, station and location.',
  '  centerline    only when requested: one continuous alignment, monotonic stations, no kink over 15°.',
  '  shot_grounding ≥ 95% of coded road shots within 2.0 ft of drafted road/paint/curb geometry.',
];

function formatCorridorTable(corridor: RoadModelCorridor): string[] {
  const rows = corridor.sections.slice(0, 120).map(section => {
    const width = section.widthFt === null ? '—' : section.widthFt.toFixed(1);
    const near = section.nearEdge
      ? `(${section.nearEdge.easting.toFixed(1)}, ${section.nearEdge.northing.toFixed(1)})`
      : '—';
    const far = section.farEdge
      ? `(${section.farEdge.easting.toFixed(1)}, ${section.farEdge.northing.toFixed(1)})`
      : 'no opposite edge';
    return `  ${formatStation(section.stationFt).padEnd(7)} ` +
      `CTR (${section.easting.toFixed(1)}, ${section.northing.toFixed(1)})  ` +
      `${section.bearingDeg.toFixed(1).padStart(5)}° ${cardinalDirectionForBearing(section.bearingDeg).padEnd(3)} ` +
      `${width.padStart(5)} ft  NEAR ${near}  FAR ${far}`;
  });
  const hidden = corridor.sections.length > rows.length
    ? [`  (+${corridor.sections.length - rows.length} more sections)`]
    : [];
  return rows.concat(hidden);
}

export function formatGimbalIntersectionTargets(model: RoadMathModel): string[] {
  const intersections = model.intersections ?? [];
  if (intersections.length === 0) {
    return [
      'INTERSECTION TARGETS: none detected from the pass-1 centre lines. ' +
      'Do not invent a branch or crossing that is not in the take.',
    ];
  }
  return [
    `INTERSECTION TARGETS — ${intersections.length} node${intersections.length === 1 ? '' : 's'} to preserve exactly:`,
    ...intersections.map(node =>
      `  ${node.id} · ${node.label} · arms ${node.arms.length}`,
    ),
  ];
}

/**
 * Compact, precise brief for a redraw. The station table is the pass-1 record;
 * the fix targets are numbered, measured instructions for the second pass.
 */
export function formatGimbalMathBrief(model: RoadMathModel): string {
  if (model.corridors.length === 0) {
    return [
      '---BEGIN GIMBAL ROAD MATH MODEL — FIRST PASS TARGET---',
      'No pavement corridor could be modelled from the first take, so there is no station/width target to hand back.',
      'Rebuild the take so each pavement edge is one continuous chain on a road layer; the next pass needs two measurable edges.',
      '---END GIMBAL ROAD MATH MODEL — FIRST PASS TARGET---',
    ].join('\n');
  }

  const lines: string[] = [
    '---BEGIN GIMBAL ROAD MATH MODEL — FIRST PASS TARGET---',
    `Model recorded from take 1: ${model.corridors.length} corridor${model.corridors.length === 1 ? '' : 's'}, ` +
      `${model.sections} cross-sections, ${model.totalLengthFt.toFixed(0)} ft total` +
      `${model.widthFt !== null ? `, typical width ${model.widthFt.toFixed(1)} ft` : ', width not measurable (edge missing)'}` +
      `${model.parcelGapRoads ? `, ${model.parcelGapRoads} parcel-gap road${model.parcelGapRoads === 1 ? '' : 's'} adopted as target corridors` : ''}` +
      `${model.intersections?.length ? `, ${model.intersections.length} intersection node${model.intersections.length === 1 ? '' : 's'}` : ''}.`,
    'This table is the mathematical record of the first glance. The second pass must reproduce this corridor, station by station — not invent a new alignment. Every coordinate is a location anchor; use it when a frame edge or crop makes the site ambiguous.',
    '',
  ];

  for (const corridor of model.corridors) {
    lines.push(
      `CORRIDOR ${corridor.id} · ${corridor.kind.replace(/_/g, ' ')} · layer ${corridor.layer ?? '?'} · ` +
        `sta ${formatStation(corridor.stationStartFt)} → ${formatStation(corridor.stationEndFt)} · ` +
        `${corridor.lengthFt.toFixed(0)} ft · ${corridor.widthFt?.toFixed(1) ?? '—'} ft wide` +
        `${corridor.widthSpreadFt > 0 ? ` (±${corridor.widthSpreadFt.toFixed(1)} ft)` : ''} · ` +
        `${corridor.edgeCount} edge${corridor.edgeCount === 1 ? '' : 's'}` +
        `${corridor.hasCenterline ? ' + centreline' : ''}` +
        `${corridor.source === 'parcel_gap' ? ` · PARCEL-GAP CANDIDATE (${Math.round((corridor.confidence ?? 0) * 100)}% confidence; frontage parcels ${corridor.parcelIds?.join(', ') || 'unknown'})` : ''}`,
    );
    lines.push('  STA     CENTRE (E, N)                 BEARING CARD WIDTH   NEAR EDGE / FAR EDGE');
    lines.push(...formatCorridorTable(corridor));

    if (corridor.defects.length > 0) {
      lines.push('  FIX TARGETS:');
      corridor.defects.forEach((defect, index) => {
        const severity = defect.severity === 'red' ? 'RED' : 'AMBER';
        lines.push(
          `   ${index + 1}. [${severity}] ${defect.detail}` +
          `${defect.stationFt !== null ? ` (at ${formatStation(defect.stationFt)})` : ''}`,
        );
      });
    }
    lines.push('');
  }

  lines.push(...formatGimbalIntersectionTargets(model), '');

  if (model.reviewRemaining.length > 0) {
    lines.push('CIVIL-SENSE DEFECTS STILL OPEN FROM THE TAKE REVIEW:');
    for (const detail of model.reviewRemaining) lines.push(`  - ${detail}`);
    lines.push('');
  }

  lines.push(
    ...ROAD_ACCEPTANCE_RUBRIC,
    '',
    'SECOND-PASS RULES FOR USING THIS MODEL:',
    '• Keep the modelled station range and typical width. Every section is a hard anchor: start/end at the same stations, hold the opposite edge at the modelled width ± 2 ft.',
    '• Re-use the section centre coordinates and opposite-edge coordinates to place the redraw. If a defect target says "extend", extend along the same bearing from that station.',
    '• Do not shorten the corridor to the densest cluster or stop at a frame edge. Station coverage is part of the acceptance test.',
    '• Preserve edge pairing: two parallel edges, no crossing, no duplicate, no orphan stub. A branch T-intersects the through edge.',
    '• Preserve every intersection target: arm count, T/cross/skew type, angle and station. A skewed crossing is still a crossing; do not turn it into a T because the crop makes one arm hard to see.',
    '• A parcel-gap corridor is a road candidate adopted from the county fabric. Keep it in the take unless a surveyed shot or a stronger OSM alignment proves a different centerline; never fill the gap as vacant land.',
    '• If a section width or centre is genuinely wrong, say which station and give the corrected value in your response prose — do not silently change the alignment.',
    '---END GIMBAL ROAD MATH MODEL — FIRST PASS TARGET---',
  );

  return lines.join('\n');
}

export function formatGimbalMathSummary(model: RoadMathModel): string {
  if (model.corridors.length === 0) {
    return 'Gimbal math model: no pavement corridor recognized — the next pass has no station/width target.';
  }
  return `Gimbal math model: ${model.corridors.length} corridor${model.corridors.length === 1 ? '' : 's'}, ` +
    `${model.sections} cross-sections, ${model.totalLengthFt.toFixed(0)} ft` +
    `${model.widthFt !== null ? `, typical width ${model.widthFt.toFixed(1)} ft` : ''}` +
    `${model.unpairedEdges > 0 ? `, ${model.unpairedEdges} unpaired edge${model.unpairedEdges === 1 ? '' : 's'}` : ''}` +
    `${model.intersections?.length ? `, ${model.intersections.length} intersection node${model.intersections.length === 1 ? '' : 's'}` : ''}` +
    `${model.parcelGapRoads ? `, ${model.parcelGapRoads} parcel-gap corridor${model.parcelGapRoads === 1 ? '' : 's'}` : ''}.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Second-pass inspection
// ─────────────────────────────────────────────────────────────────────────────

function corridorChord(corridor: RoadModelCorridor): { origin: DraftVertex; axis: { x: number; y: number }; span: number } | null {
  if (corridor.sections.length < 2) return null;
  const first = corridor.sections[0];
  const last = corridor.sections[corridor.sections.length - 1];
  const origin = { easting: first.easting, northing: first.northing };
  const axis = unitVector(origin, { easting: last.easting, northing: last.northing });
  if (!axis) return null;
  return { origin, axis, span: corridor.lengthFt };
}

function corridorCoverage(
  target: RoadModelCorridor,
  candidate: RoadModelCorridor,
): number {
  const chord = corridorChord(target);
  if (!chord || candidate.sections.length === 0) return 0;
  const targetRange = rangeAlongAxis(
    target.sections.map(section => ({ easting: section.easting, northing: section.northing })),
    chord.origin,
    chord.axis,
  );
  const candidateRange = rangeAlongAxis(
    candidate.sections.map(section => ({ easting: section.easting, northing: section.northing })),
    chord.origin,
    chord.axis,
  );
  const targetLength = Math.max(1, targetRange.max - targetRange.min);
  const intersection = Math.max(0, Math.min(targetRange.max, candidateRange.max) - Math.max(targetRange.min, candidateRange.min));
  return Math.max(0, Math.min(1, intersection / targetLength));
}

function corridorMidpoint(corridor: RoadModelCorridor): DraftVertex | null {
  if (corridor.sections.length === 0) return null;
  return {
    easting: corridor.sections.reduce((sum, section) => sum + section.easting, 0) / corridor.sections.length,
    northing: corridor.sections.reduce((sum, section) => sum + section.northing, 0) / corridor.sections.length,
  };
}

/**
 * Compare the redraw with the pass-1 mathematical model. This is the second
 * Gimbal inspection: it catches a retake that improved the civil-sense score by
 * shortening the corridor, dropping an edge, or changing the width, which a
 * linework-only score can miss.
 */
export function inspectGimbalRoadModel(
  target: RoadMathModel,
  retakeLines: Array<DraftLineLike>,
  options: { includeGenericLinework?: boolean } = {},
): GimbalRoadInspection {
  const candidate = buildRoadMathModel(retakeLines, {}, null, {
    includeGenericLinework: options.includeGenericLinework,
  });
  const defects: string[] = [];
  const notes: string[] = [];
  const used = new Set<number>();
  let coverageSum = 0;
  let matched = 0;
  let missing = 0;
  let missingEdges = 0;
  const widthDrifts: number[] = [];

  for (const targetCorridor of target.corridors) {
    const targetMid = corridorMidpoint(targetCorridor);
    let bestIndex = -1;
    let bestScore = Infinity;
    for (let i = 0; i < candidate.corridors.length; i++) {
      if (used.has(i)) continue;
      const candidateMid = corridorMidpoint(candidate.corridors[i]);
      if (!targetMid || !candidateMid) continue;
      const separation = distance(targetMid, candidateMid);
      const coverage = corridorCoverage(targetCorridor, candidate.corridors[i]);
      const score = separation + (1 - coverage) * 200;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    if (bestIndex < 0 || bestScore > 260) {
      missing++;
      defects.push(`corridor ${targetCorridor.id} from the first pass has no matching redraw — draw it back at stations ${formatStation(0)} → ${formatStation(targetCorridor.lengthFt)}`);
      continue;
    }

    used.add(bestIndex);
    const candidateCorridor = candidate.corridors[bestIndex];
    const coverage = corridorCoverage(targetCorridor, candidateCorridor);
    coverageSum += coverage;
    matched++;

    notes.push(
      `${targetCorridor.id}: ${(coverage * 100).toFixed(0)}% of the pass-1 station span covered, ` +
      `${candidateCorridor.lengthFt.toFixed(0)} ft drawn vs ${targetCorridor.lengthFt.toFixed(0)} ft modelled`,
    );

    if (coverage < 0.92) {
      const missingFt = Math.max(0, (1 - coverage) * targetCorridor.lengthFt);
      defects.push(
        `corridor ${targetCorridor.id} covers only ${(coverage * 100).toFixed(0)}% of the pass-1 station range — ` +
        `about ${missingFt.toFixed(0)} ft is missing from one end; extend it to ${formatStation(targetCorridor.stationEndFt)}`,
      );
    }

    if (targetCorridor.edgeCount >= 2 && candidateCorridor.edgeCount < targetCorridor.edgeCount) {
      missingEdges++;
      defects.push(
        `corridor ${targetCorridor.id} lost its opposite pavement edge — the first pass had ${targetCorridor.edgeCount} paired edges; draw both edges at the modelled width`,
      );
    }

    if (targetCorridor.widthFt !== null && candidateCorridor.widthFt !== null) {
      const drift = Math.abs(targetCorridor.widthFt - candidateCorridor.widthFt);
      widthDrifts.push(drift);
      if (drift > 4) {
        defects.push(
          `corridor ${targetCorridor.id} width drifted ${drift.toFixed(1)} ft from the pass-1 model ` +
          `(${targetCorridor.widthFt.toFixed(1)} ft → ${candidateCorridor.widthFt.toFixed(1)} ft) — hold the opposite edge parallel at the modelled width`,
        );
      }
    } else if (targetCorridor.widthFt !== null && candidateCorridor.widthFt === null) {
      defects.push(
        `corridor ${targetCorridor.id} has no measurable width in the redraw — the two edges are not paired; restore the parallel opposite edge`,
      );
    }

    const gaps = candidateCorridor.defects.filter(defect => defect.kind === 'gap');
    for (const gap of gaps.slice(0, 2)) {
      defects.push(`corridor ${targetCorridor.id} redraw still has a continuity break: ${gap.detail}`);
    }
  }

  const coveragePct = matched > 0 ? (coverageSum / matched) * 100 : 0;
  const widthDriftFt = widthDrifts.length > 0
    ? median(widthDrifts)
    : null;

  let score = 100;
  score -= missing * 40;
  score -= Math.max(0, 1 - coverageSum / Math.max(1, target.corridors.length)) * 60;
  score -= missingEdges * 20;
  if (widthDriftFt !== null) score -= Math.min(15, Math.max(0, widthDriftFt - 4) * 1.5);
  score -= Math.min(20, defects.filter(defect => /continuity break/.test(defect)).length * 8);
  score = Math.round(Math.max(0, Math.min(100, score)));

  const acceptable = missing === 0
    && missingEdges === 0
    && coveragePct >= 92
    && score >= 78;

  const status: GimbalRoadInspection['status'] = acceptable && defects.length === 0 ? 'pass' : 'issues';
  const summary = acceptable
    ? `Second gimbal inspection: PASS — ${(coveragePct).toFixed(0)}% of the pass-1 station span preserved, ` +
      `${widthDriftFt !== null ? `${widthDriftFt.toFixed(1)} ft median width drift` : 'width unchanged'}, ${matched}/${target.corridors.length} corridor(s) matched.`
    : `Second gimbal inspection: ISSUES — ${defects.length} mathematical mismatch(es); ` +
      `${(coveragePct).toFixed(0)}% station coverage, ${matched}/${target.corridors.length} corridor(s) matched.`;

  return {
    status,
    acceptable,
    score,
    targetCorridors: target.corridors.length,
    inspectedCorridors: candidate.corridors.length,
    coveragePct: parseFloat(coveragePct.toFixed(1)),
    widthDriftFt: widthDriftFt === null ? null : parseFloat(widthDriftFt.toFixed(2)),
    defects,
    notes,
    summary,
  };
}

export function formatGimbalInspectionSummary(inspection: GimbalRoadInspection): string {
  const bits = [
    inspection.coveragePct.toFixed(0) + '% station coverage',
    inspection.widthDriftFt !== null ? inspection.widthDriftFt.toFixed(1) + ' ft width drift' : 'width unchanged',
    `${inspection.inspectedCorridors}/${inspection.targetCorridors} corridor(s)`,
  ];
  const head = inspection.acceptable ? 'Second gimbal inspection: PASS' : 'Second gimbal inspection: ISSUES';
  return `${head} — ${bits.join(' · ')}.` +
    (inspection.defects.length > 0 ? ` ${inspection.defects.length} mismatch(es) to correct.` : '');
}
