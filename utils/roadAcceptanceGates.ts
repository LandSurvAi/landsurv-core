/**
 * roadAcceptanceGates.ts
 *
 * ROAD ACCEPTANCE GATES
 * ─────────────────────
 * The second Gimbal inspection used to answer one question: "did the redraw
 * keep 92% of the corridor and stay within 4 ft of the modelled width?" That
 * is a useful minimum, but it hides which road property actually failed and it
 * never looks at paint, curbs or intersections.
 *
 * This module turns the inspection into an explicit, per-corridor gate set:
 *
 *   coverage   the redraw still spans the pass-1 station range
 *   pairing    every paired edge is still a pair
 *   continuity no unstitched gap, stub or duplicate run
 *   crossing   opposite edges never cross; no self-intersection
 *   width      the corridor holds its modelled width within a derived tolerance
 *   paint      DYL/WL runs are continuous and on the correct layer
 *   curb       curb/gutter/flow-line chains are continuous and near their edge
 *   intersection branches meet the through edge; cul-de-sac bulbs close
 *   centerline the requested baseline is one continuous alignment
 *   shot_grounding  drafted linework actually uses the coded road shots
 *
 * The gate engine is deterministic and imagery-free. The frame builder at the
 * bottom turns failures into targeted pass-2 windows so the next drafter turn
 * looks at the exact station that failed, not another full site tour.
 *
 * All coordinates are project coordinates in feet.
 */

import {
  buildGimbalIntersections,
  buildRoadMathModel,
  formatGimbalMathBrief,
  formatStation,
  ROAD_ACCEPTANCE_RUBRIC,
  type RoadMathModel,
  type RoadModelCorridor,
} from './gimbalRoadModel.ts';
import {
  groupRoadFeatures,
  type RoadFeature,
  type RoadGrounding,
  type RoadSurveyPoint,
} from './roadTakeReview.ts';
import type { DraftLineLike, DraftVertex } from './synthesisVerification.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type RoadGateId =
  | 'coverage'
  | 'pairing'
  | 'continuity'
  | 'crossing'
  | 'width'
  | 'paint'
  | 'curb'
  | 'intersection'
  | 'centerline'
  | 'shot_grounding';

export const ROAD_GATE_IDS: RoadGateId[] = [
  'coverage',
  'pairing',
  'continuity',
  'crossing',
  'width',
  'paint',
  'curb',
  'intersection',
  'centerline',
  'shot_grounding',
];

export interface RoadGateResult {
  id: RoadGateId;
  /** False when the corridor has no such feature (e.g. no curbs, no requested CL). */
  applicable: boolean;
  passed: boolean;
  severity: 'red' | 'amber';
  measured: number | null;
  allowed: number | null;
  stationFt: number | null;
  at?: DraftVertex;
  detail: string;
  corridorIds?: string[];
  featureIds?: string[];
}

export interface RoadCorridorTolerance {
  corridorId: string;
  lengthFt: number;
  medianWidthFt: number | null;
  widthSpreadFt: number;
  widthTolFt: number;
  gapTolFt: number;
  endpointTolFt: number;
}

export type RoadWidthDecision = 'narrow' | 'wide' | 'transition' | 'custom' | 'assumed_narrow';

export interface RoadWidthConflict {
  corridorId: string;
  narrowWidthFt: number;
  wideWidthFt: number;
  narrowRange: { startFt: number; endFt: number };
  wideRange: { startFt: number; endFt: number };
  widthTolFt: number;
  question: string;
}

export interface RoadWidthResolution {
  corridorId: string;
  decision: RoadWidthDecision;
  /** Required when decision is 'custom'; ignored otherwise. */
  widthFt?: number;
}

export interface RoadAcceptanceRequest {
  wantsCenterline?: boolean;
  wantsPaint?: boolean;
}

export interface RoadAcceptanceVerdict {
  gates: RoadGateResult[];
  applicableCount: number;
  passedCount: number;
  failedRed: number;
  failedAmber: number;
  score: number;
  acceptable: boolean;
  coveragePct: number;
  widthDriftFt: number | null;
  shotRecallPct: number;
  corridorTolerances: RoadCorridorTolerance[];
  summary: string;
}

export interface RoadGateEvaluationInput {
  passOneModel: RoadMathModel;
  currentLines: DraftLineLike[];
  /** The take the pass-1 model was built from. Used for paint/curb counts. */
  passOneLines?: DraftLineLike[];
  grounding?: RoadGrounding;
  surveyPoints?: RoadSurveyPoint[];
  request?: RoadAcceptanceRequest;
  includeGenericLinework?: boolean;
  /** User-resolved corridor widths; these replace the pass-1 median for width gates. */
  widthTargets?: Record<string, number>;
  /** User chose a taper; section gates use the narrow–wide band instead of one width. */
  widthRanges?: Record<string, { minFt: number; maxFt: number }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Small geometry helpers
// ─────────────────────────────────────────────────────────────────────────────

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function distance(a: DraftVertex, b: DraftVertex): number {
  return Math.hypot(a.easting - b.easting, a.northing - b.northing);
}

function polylineLength(vertices: DraftVertex[]): number {
  let total = 0;
  for (let i = 0; i < vertices.length - 1; i++) total += distance(vertices[i], vertices[i + 1]);
  return total;
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

function pointToSegmentDistance(p: DraftVertex, a: DraftVertex, b: DraftVertex): number {
  const dx = b.easting - a.easting;
  const dy = b.northing - a.northing;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return distance(p, a);
  const t = clamp(((p.easting - a.easting) * dx + (p.northing - a.northing) * dy) / lenSq, 0, 1);
  return Math.hypot(p.easting - (a.easting + t * dx), p.northing - (a.northing + t * dy));
}

function pointToPolylineDistance(p: DraftVertex, vertices: DraftVertex[]): number {
  if (vertices.length === 0) return Infinity;
  if (vertices.length === 1) return distance(p, vertices[0]);
  let best = Infinity;
  for (let i = 0; i < vertices.length - 1; i++) {
    best = Math.min(best, pointToSegmentDistance(p, vertices[i], vertices[i + 1]));
  }
  return best;
}

function nearestPoint(p: DraftVertex, vertices: DraftVertex[]): { point: DraftVertex; distance: number } {
  if (vertices.length === 1) return { point: vertices[0], distance: distance(p, vertices[0]) };
  let best = { point: vertices[0], distance: Infinity };
  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i];
    const b = vertices[i + 1];
    const dx = b.easting - a.easting;
    const dy = b.northing - a.northing;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq < 1e-9 ? 0 : clamp(((p.easting - a.easting) * dx + (p.northing - a.northing) * dy) / lenSq, 0, 1);
    const point = { easting: a.easting + t * dx, northing: a.northing + t * dy };
    const d = distance(p, point);
    if (d < best.distance) best = { point, distance: d };
  }
  return best;
}

function unitVector(from: DraftVertex, to: DraftVertex): { x: number; y: number } | null {
  const dx = to.easting - from.easting;
  const dy = to.northing - from.northing;
  const length = Math.hypot(dx, dy);
  return length < 1e-6 ? null : { x: dx / length, y: dy / length };
}

function corridorMid(corridor: RoadModelCorridor): DraftVertex | null {
  if (corridor.sections.length === 0) return null;
  return {
    easting: corridor.sections.reduce((sum, s) => sum + s.easting, 0) / corridor.sections.length,
    northing: corridor.sections.reduce((sum, s) => sum + s.northing, 0) / corridor.sections.length,
  };
}

function corridorChord(corridor: RoadModelCorridor): { origin: DraftVertex; axis: { x: number; y: number } } | null {
  if (corridor.sections.length < 2) return null;
  const first = corridor.sections[0];
  const last = corridor.sections[corridor.sections.length - 1];
  const origin = { easting: first.easting, northing: first.northing };
  const axis = unitVector(origin, { easting: last.easting, northing: last.northing });
  return axis ? { origin, axis } : null;
}

function rangeAlong(vertices: DraftVertex[], origin: DraftVertex, axis: { x: number; y: number }) {
  let min = Infinity;
  let max = -Infinity;
  for (const v of vertices) {
    const t = (v.easting - origin.easting) * axis.x + (v.northing - origin.northing) * axis.y;
    if (t < min) min = t;
    if (t > max) max = t;
  }
  return { min, max };
}

/** Share of the target corridor's station range covered by the candidate. */
function corridorCoverage(target: RoadModelCorridor, candidate: RoadModelCorridor): number {
  const chord = corridorChord(target);
  if (!chord || candidate.sections.length === 0) return 0;
  const targetRange = rangeAlong(
    target.sections.map(s => ({ easting: s.easting, northing: s.northing })),
    chord.origin,
    chord.axis,
  );
  const candidateRange = rangeAlong(
    candidate.sections.map(s => ({ easting: s.easting, northing: s.northing })),
    chord.origin,
    chord.axis,
  );
  const targetLength = Math.max(1, targetRange.max - targetRange.min);
  const intersection = Math.max(
    0,
    Math.min(targetRange.max, candidateRange.max) - Math.max(targetRange.min, candidateRange.min),
  );
  return clamp(intersection / targetLength, 0, 1);
}

function bestCandidate(target: RoadModelCorridor, candidates: RoadModelCorridor[], used: Set<number>) {
  const targetMid = corridorMid(target);
  let bestIndex = -1;
  let bestScore = Infinity;
  let bestCoverage = 0;
  for (let i = 0; i < candidates.length; i++) {
    if (used.has(i)) continue;
    const candidateMid = corridorMid(candidates[i]);
    if (!targetMid || !candidateMid) continue;
    const coverage = corridorCoverage(target, candidates[i]);
    const score = distance(targetMid, candidateMid) + (1 - coverage) * 200;
    if (score < bestScore) {
      bestScore = score;
      bestIndex = i;
      bestCoverage = coverage;
    }
  }
  return bestIndex >= 0 && bestScore <= 260
    ? { corridor: candidates[bestIndex], index: bestIndex, coverage: bestCoverage }
    : null;
}

/** Greedily chain raw line segments that share endpoints (within 0.25 ft). */
function chainSegments(
  segments: Array<{ a: DraftVertex; b: DraftVertex }>,
): DraftVertex[][] {
  const remaining = segments.map(segment => ({ ...segment }));
  const runs: DraftVertex[][] = [];
  const close = (a: DraftVertex, b: DraftVertex) => distance(a, b) <= 0.25;

  while (remaining.length > 0) {
    const seed = remaining.shift()!;
    const run = [seed.a, seed.b];
    let extended = true;
    while (extended) {
      extended = false;
      const tail = run[run.length - 1];
      for (let i = 0; i < remaining.length; i++) {
        const segment = remaining[i];
        if (close(tail, segment.a)) {
          run.push(segment.b);
          remaining.splice(i, 1);
          extended = true;
          break;
        }
        if (close(tail, segment.b)) {
          run.push(segment.a);
          remaining.splice(i, 1);
          extended = true;
          break;
        }
      }
    }
    if (run.length >= 2) runs.push(run);
  }
  return runs;
}

function lineVertices(line: DraftLineLike): DraftVertex[] {
  if (!line.fromPt || !line.toPt) return [];
  return [
    { easting: line.fromPt.x, northing: line.fromPt.y },
    { easting: line.toPt.x, northing: line.toPt.y },
  ];
}

function layeredRuns(lines: DraftLineLike[], match: RegExp): DraftVertex[][] {
  const segments: Array<{ a: DraftVertex; b: DraftVertex }> = [];
  for (const line of lines) {
    if (line.hidden) continue;
    if (!match.test(`${line.layer ?? ''} ${line.polylineId ?? ''}`)) continue;
    const ends = lineVertices(line);
    if (ends.length === 2) segments.push({ a: ends[0], b: ends[1] });
  }
  return chainSegments(segments);
}

function segmentsCross(a: DraftVertex, b: DraftVertex, c: DraftVertex, d: DraftVertex): DraftVertex | null {
  const rx = b.easting - a.easting;
  const ry = b.northing - a.northing;
  const sx = d.easting - c.easting;
  const sy = d.northing - c.northing;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const qpx = c.easting - a.easting;
  const qpy = c.northing - a.northing;
  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * ry - qpy * rx) / denom;
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
  return { easting: a.easting + t * rx, northing: a.northing + t * ry };
}

function polylineCrossing(a: DraftVertex[], b: DraftVertex[]): DraftVertex | null {
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) {
      const hit = segmentsCross(a[i], a[i + 1], b[j], b[j + 1]);
      if (hit) return hit;
    }
  }
  return null;
}

function selfIntersection(vertices: DraftVertex[]): DraftVertex | null {
  for (let i = 0; i < vertices.length - 3; i++) {
    for (let j = i + 2; j < vertices.length - 1; j++) {
      if (j === i + 1) continue;
      const hit = segmentsCross(vertices[i], vertices[i + 1], vertices[j], vertices[j + 1]);
      if (hit) return hit;
    }
  }
  return null;
}

function terminalDirection(vertices: DraftVertex[], endpoint: DraftVertex): { x: number; y: number } | null {
  if (vertices.length < 2) return null;
  const isStart = distance(vertices[0], endpoint) <= 0.5;
  return isStart
    ? unitVector(vertices[1], vertices[0])
    : unitVector(vertices[vertices.length - 2], vertices[vertices.length - 1]);
}

/**
 * A gap is two separate runs whose facing endpoints are collinear and close.
 * Vertex spacing inside one run is not a gap: a 500 ft straight segment is one
 * line, not 500 ft of missing linework.
 */
function endpointGap(
  a: DraftVertex[],
  b: DraftVertex[],
): { gap: number; aEnd: DraftVertex; bEnd: DraftVertex } | null {
  if (a.length < 2 || b.length < 2) return null;
  let best: { gap: number; aEnd: DraftVertex; bEnd: DraftVertex } | null = null;
  for (const aEnd of [a[0], a[a.length - 1]]) {
    for (const bEnd of [b[0], b[b.length - 1]]) {
      const gap = distance(aEnd, bEnd);
      if (gap < 0.5 || gap > 350) continue;
      if (!best || gap < best.gap) best = { gap, aEnd, bEnd };
    }
  }
  if (!best) return null;

  const dirA = terminalDirection(a, best.aEnd);
  const dirB = terminalDirection(b, best.bEnd);
  const gapUnit = unitVector(best.aEnd, best.bEnd);
  if (!dirA || !dirB || !gapUnit) return null;
  const cosA = dirA.x * gapUnit.x + dirA.y * gapUnit.y;
  const cosB = dirB.x * gapUnit.x + dirB.y * gapUnit.y;
  // Same-road gap: A points at B, B points back at A. Parallel corridor
  // edges point across the gap, so they are excluded by the same test.
  if (cosA < 0.7 || cosB > -0.7) return null;
  return best;
}

function largestGapBetweenRuns(runs: DraftVertex[][]): number {
  let largest = 0;
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const info = endpointGap(runs[i], runs[j]);
      if (info && info.gap > largest) largest = info.gap;
    }
  }
  return largest;
}

function stationToVertex(vertices: DraftVertex[], target: DraftVertex): number {
  let station = 0;
  for (let i = 0; i < vertices.length; i++) {
    if (distance(vertices[i], target) <= 0.5) return station;
    if (i > 0) station += distance(vertices[i - 1], vertices[i]);
  }
  return 0;
}

function kinkDegrees(vertices: DraftVertex[]): number {
  let max = 0;
  for (let i = 1; i < vertices.length - 1; i++) {
    const a = unitVector(vertices[i - 1], vertices[i]);
    const b = unitVector(vertices[i], vertices[i + 1]);
    if (!a || !b) continue;
    const dot = clamp(a.x * b.x + a.y * b.y, -1, 1);
    max = Math.max(max, (Math.acos(dot) * 180) / Math.PI);
  }
  return max;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tolerances
// ─────────────────────────────────────────────────────────────────────────────

function shotSpacingForCorridor(corridor: RoadModelCorridor, shots: RoadSurveyPoint[]): number {
  const chord = corridorChord(corridor);
  if (!chord || shots.length < 2) return 0;
  const near = shots
    .map(shot => ({ shot, vertex: { easting: shot.easting, northing: shot.northing } }))
    .filter(({ vertex }) =>
      corridor.sections.some(section =>
        Math.hypot(section.easting - vertex.easting, section.northing - vertex.northing) <= 140,
      ),
    )
    .map(({ shot, vertex }) => ({
      along: (vertex.easting - chord.origin.easting) * chord.axis.x
        + (vertex.northing - chord.origin.northing) * chord.axis.y,
      shot,
    }))
    .sort((a, b) => a.along - b.along);
  if (near.length < 2) return 0;
  const gaps: number[] = [];
  for (let i = 1; i < near.length; i++) gaps.push(near[i].along - near[i - 1].along);
  return median(gaps.filter(gap => gap > 0.5)) ?? 0;
}

export function deriveCorridorTolerance(
  corridor: RoadModelCorridor,
  surveyPoints: RoadSurveyPoint[] = [],
): RoadCorridorTolerance {
  const lengthFt = Math.max(1, corridor.lengthFt);
  const shotSpacing = shotSpacingForCorridor(corridor, surveyPoints);
  return {
    corridorId: corridor.id,
    lengthFt,
    medianWidthFt: corridor.widthFt,
    widthSpreadFt: corridor.widthSpreadFt,
    widthTolFt: clamp(1.5 * corridor.widthSpreadFt, 2, 6),
    gapTolFt: clamp(Math.max(15, 2 * shotSpacing, 0.01 * lengthFt), 15, 80),
    endpointTolFt: clamp(Math.max(10, 0.02 * lengthFt), 10, 40),
  };
}

/**
 * Spec §9.4: a corridor with two stable width clusters (for example a normal
 * section and an intersection widening) cannot be accepted against one median.
 * Split at every interior station, take the widest median difference, and only
 * raise a conflict when it exceeds the corridor tolerance + 2 ft. Both sides
 * need at least two measured sections, so a single outlier cannot stop a draw.
 */
export function detectWidthConflicts(model: RoadMathModel): RoadWidthConflict[] {
  const conflicts: RoadWidthConflict[] = [];
  for (const corridor of model.corridors) {
    const sections = corridor.sections
      .filter(section => section.widthFt !== null)
      .slice()
      .sort((a, b) => a.stationFt - b.stationFt);
    if (sections.length < 4) continue;

    let best: {
      delta: number;
      leftMedian: number;
      rightMedian: number;
      left: typeof sections;
      right: typeof sections;
    } | null = null;
    for (let split = 2; split <= sections.length - 2; split++) {
      const left = sections.slice(0, split);
      const right = sections.slice(split);
      const leftMedian = median(left.map(section => section.widthFt!));
      const rightMedian = median(right.map(section => section.widthFt!));
      if (leftMedian === null || rightMedian === null) continue;
      const delta = rightMedian - leftMedian;
      if (!best || Math.abs(delta) > Math.abs(best.delta)) {
        best = { delta, leftMedian, rightMedian, left, right };
      }
    }
    if (!best) continue;

    const tolerance = deriveCorridorTolerance(corridor);
    if (Math.abs(best.delta) <= tolerance.widthTolFt + 2) continue;

    const narrowFirst = best.leftMedian <= best.rightMedian;
    const narrow = narrowFirst ? best.left : best.right;
    const wide = narrowFirst ? best.right : best.left;
    const narrowWidthFt = narrowFirst ? best.leftMedian : best.rightMedian;
    const wideWidthFt = narrowFirst ? best.rightMedian : best.leftMedian;
    const range = (items: typeof sections) => ({
      startFt: items[0].stationFt,
      endFt: items[items.length - 1].stationFt,
    });
    const narrowRange = range(narrow);
    const wideRange = range(wide);

    conflicts.push({
      corridorId: corridor.id,
      narrowWidthFt,
      wideWidthFt,
      narrowRange,
      wideRange,
      widthTolFt: tolerance.widthTolFt,
      question:
        `Corridor ${corridor.id} measures ${narrowWidthFt.toFixed(1)} ft between stations `
        + `${formatStation(narrowRange.startFt)}–${formatStation(narrowRange.endFt)} and `
        + `${wideWidthFt.toFixed(1)} ft between ${formatStation(wideRange.startFt)}–${formatStation(wideRange.endFt)}. `
        + 'Which width should the road hold?',
    });
  }
  return conflicts;
}

function toleranceForFeature(
  feature: RoadFeature,
  tolerances: RoadCorridorTolerance[],
  corridors: RoadModelCorridor[],
): RoadCorridorTolerance | null {
  const mid = feature.vertices[Math.floor(feature.vertices.length / 2)];
  let best: { tolerance: RoadCorridorTolerance; distance: number } | null = null;
  for (const corridor of corridors) {
    const corridorMidPoint = corridorMid(corridor);
    if (!corridorMidPoint) continue;
    const d = distance(mid, corridorMidPoint);
    if (!best || d < best.distance) {
      const tolerance = tolerances.find(item => item.corridorId === corridor.id);
      if (tolerance) best = { tolerance, distance: d };
    }
  }
  return best && best.distance <= 400 ? best.tolerance : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate helpers
// ─────────────────────────────────────────────────────────────────────────────

function gate(
  id: RoadGateId,
  passed: boolean,
  detail: string,
  opts: Partial<Omit<RoadGateResult, 'id' | 'passed' | 'detail'>> = {},
): RoadGateResult {
  return {
    id,
    applicable: opts.applicable ?? true,
    passed,
    severity: opts.severity ?? 'red',
    measured: opts.measured ?? null,
    allowed: opts.allowed ?? null,
    stationFt: opts.stationFt ?? null,
    at: opts.at,
    detail,
    corridorIds: opts.corridorIds,
    featureIds: opts.featureIds,
  };
}

function emptyGate(id: RoadGateId, detail: string): RoadGateResult {
  return gate(id, true, detail, { applicable: false, severity: 'red' });
}

export function createEmptyVerdict(summary = 'No road linework to gate.'): RoadAcceptanceVerdict {
  return {
    gates: [],
    applicableCount: 0,
    passedCount: 0,
    failedRed: 0,
    failedAmber: 0,
    score: 0,
    acceptable: false,
    coveragePct: 0,
    widthDriftFt: null,
    shotRecallPct: 0,
    corridorTolerances: [],
    summary,
  };
}

export function withGateResults(
  verdict: RoadAcceptanceVerdict,
  gates: RoadGateResult[],
): RoadAcceptanceVerdict {
  return recompute({ ...verdict, gates });
}

function consolidateGates(gates: RoadGateResult[]): RoadGateResult[] {
  const byId = new Map<RoadGateId, RoadGateResult>();
  const order: RoadGateId[] = [];
  for (const gate of gates) {
    const existing = byId.get(gate.id);
    if (!existing) {
      byId.set(gate.id, {
        ...gate,
        corridorIds: gate.corridorIds ? [...gate.corridorIds] : undefined,
        featureIds: gate.featureIds ? [...gate.featureIds] : undefined,
      });
      order.push(gate.id);
      continue;
    }
    const wasFailed = existing.applicable && !existing.passed;
    const nowFailed = gate.applicable && !gate.passed;
    existing.applicable = existing.applicable || gate.applicable;
    existing.passed = existing.passed && gate.passed;
    if (nowFailed) {
      if (gate.severity === 'red') existing.severity = 'red';
      existing.measured = gate.measured ?? existing.measured;
      existing.allowed = gate.allowed ?? existing.allowed;
      if (existing.stationFt === null) existing.stationFt = gate.stationFt;
      if (!existing.at && gate.at) existing.at = gate.at;
      existing.detail = wasFailed && existing.detail !== gate.detail
        ? `${existing.detail} · ${gate.detail}`
        : gate.detail;
    }
    if (gate.corridorIds?.length) {
      existing.corridorIds = [...new Set([...(existing.corridorIds ?? []), ...gate.corridorIds])];
    }
    if (gate.featureIds?.length) {
      existing.featureIds = [...new Set([...(existing.featureIds ?? []), ...gate.featureIds])];
    }
  }
  return order.map(id => byId.get(id)!);
}

function recompute(verdict: RoadAcceptanceVerdict): RoadAcceptanceVerdict {
  // Keep one result row per gate family. Two corridors failing coverage is one
  // failed gate, not two rows that inflate the denominator past 10.
  const gates = consolidateGates(verdict.gates);
  const applicableCount = gates.filter(g => g.applicable).length;
  const passedCount = gates.filter(g => g.applicable && g.passed).length;
  const failedRed = gates.filter(g => g.applicable && !g.passed && g.severity === 'red').length;
  const failedAmber = gates.filter(g => g.applicable && !g.passed && g.severity === 'amber').length;
  const acceptable = failedRed === 0;
  return {
    ...verdict,
    applicableCount,
    passedCount,
    failedRed,
    failedAmber,
    acceptable,
    summary: acceptable
      ? `Road acceptance: PASS — ${passedCount}/${applicableCount} gates, ${verdict.coveragePct.toFixed(0)}% coverage, ${verdict.widthDriftFt !== null ? `${verdict.widthDriftFt.toFixed(1)} ft width drift` : 'width unchanged'}`
      : `Road acceptance: ISSUES — ${failedRed} red gate${failedRed === 1 ? '' : 's'}, ${passedCount}/${applicableCount} passed, ${verdict.coveragePct.toFixed(0)}% coverage`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public evaluation
// ─────────────────────────────────────────────────────────────────────────────

export function evaluateRoadAcceptance(input: RoadGateEvaluationInput): RoadAcceptanceVerdict {
  const {
    passOneModel,
    currentLines,
    passOneLines,
    surveyPoints = [],
    request = {},
    includeGenericLinework = false,
    widthTargets = {},
    widthRanges = {},
  } = input;

  if (passOneModel.corridors.length === 0 || currentLines.length === 0) {
    return createEmptyVerdict(
      passOneModel.corridors.length === 0
        ? 'Pass 1 recorded no corridor, so there is no acceptance target.'
        : 'The redraw drew no road linework.',
    );
  }

  const candidateModel = buildRoadMathModel(currentLines, {}, null, { includeGenericLinework });
  const candidateFeatures = groupRoadFeatures(currentLines, { includeGenericLinework });
  const passOneFeatures = groupRoadFeatures(passOneLines ?? [], { includeGenericLinework });
  const tolerances = passOneModel.corridors.map(corridor => deriveCorridorTolerance(corridor, surveyPoints));
  const gates: RoadGateResult[] = [];
  const used = new Set<number>();
  let coverageSum = 0;
  let matched = 0;
  let missing = 0;
  const widthDrifts: number[] = [];
  const targetCorridorIds: string[] = [];
  const matches = new Map<string, RoadModelCorridor>();

  // ── coverage + pairing + width, per pass-1 corridor ────────────────────────
  for (const target of passOneModel.corridors) {
    targetCorridorIds.push(target.id);
    const match = bestCandidate(target, candidateModel.corridors, used);
    if (!match) {
      missing++;
      continue;
    }
    used.add(match.index);
    matched++;
    coverageSum += corridorCoverage(target, match.corridor);
    matches.set(target.id, match.corridor);

    const tolerance = tolerances.find(t => t.corridorId === target.id)!;

    if (target.edgeCount >= 2 && match.corridor.edgeCount < target.edgeCount) {
      gates.push(gate(
        'pairing',
        false,
        `${target.id} lost an opposite pavement edge — pass 1 had ${target.edgeCount}, redraw has ${match.corridor.edgeCount}`,
        {
          measured: match.corridor.edgeCount,
          allowed: target.edgeCount,
          corridorIds: [target.id, match.corridor.id],
          at: corridorMid(target) ?? undefined,
          severity: 'red',
        },
      ));
    }

    const widthRange = widthRanges[target.id];
    const widthTargetFt = widthRange
      ? (widthRange.minFt + widthRange.maxFt) / 2
      : (widthTargets[target.id] ?? target.widthFt);
    if (widthTargetFt !== null) {
      if (match.corridor.widthFt === null) {
        gates.push(gate(
          'width',
          false,
          `${target.id} has no measurable width in the redraw — the two edges are not paired`,
          { measured: null, allowed: widthTargetFt, corridorIds: [target.id], severity: 'red' },
        ));
      } else {
        const drift = Math.abs(widthTargetFt - match.corridor.widthFt);
        widthDrifts.push(drift);
        if (drift > tolerance.widthTolFt) {
          gates.push(gate(
            'width',
            false,
            `${target.id} width drifted ${drift.toFixed(1)} ft from the adopted model (${widthTargetFt.toFixed(1)} ft → ${match.corridor.widthFt.toFixed(1)} ft); allowed ±${tolerance.widthTolFt.toFixed(1)} ft`,
            {
              measured: drift,
              allowed: tolerance.widthTolFt,
              corridorIds: [target.id],
              severity: 'red',
            },
          ));
        }
        const floor = widthRange
          ? Math.max(8, 0.85 * widthRange.minFt)
          : Math.max(8, 0.85 * widthTargetFt);
        const ceiling = widthRange
          ? 1.15 * widthRange.maxFt
          : 1.15 * widthTargetFt;
        if (match.corridor.widthFt < floor || match.corridor.widthFt > ceiling) {
          gates.push(gate(
            'width',
            false,
            `${target.id} section width ${match.corridor.widthFt.toFixed(1)} ft is outside the adopted range ${floor.toFixed(1)}–${ceiling.toFixed(1)} ft`,
            {
              measured: match.corridor.widthFt,
              allowed: ceiling,
              corridorIds: [target.id],
              severity: 'red',
            },
          ));
        }
      }
    }
  }

  if (missing > 0) {
    gates.push(gate(
      'coverage',
      false,
      `${missing} pass-1 corridor${missing === 1 ? '' : 's'} have no matching redraw`,
      { measured: missing, allowed: 0, severity: 'red', corridorIds: targetCorridorIds },
    ));
  }

  const coveragePct = matched > 0 ? (coverageSum / matched) * 100 : 0;
  for (const target of passOneModel.corridors) {
    const match = matches.get(target.id);
    if (!match) continue;
    const cov = corridorCoverage(target, match);
    if (cov < 0.95) {
      gates.push(gate(
        'coverage',
        false,
        `${target.id} covers only ${(cov * 100).toFixed(0)}% of the pass-1 station range — about ${((1 - cov) * target.lengthFt).toFixed(0)} ft is missing from one end`,
        {
          measured: cov * 100,
          allowed: 95,
          corridorIds: [target.id],
          stationFt: cov * 100 < 50 ? 0 : target.lengthFt,
          severity: 'red',
          at: corridorMid(target) ?? undefined,
        },
      ));
    }
  }

  // Coverage is a single family; if every corridor passed, record one pass row.
  if (!gates.some(g => g.id === 'coverage')) {
    gates.push(gate(
      'coverage',
      true,
      `${matched}/${passOneModel.corridors.length} corridor(s) matched at ${coveragePct.toFixed(0)}% station coverage`,
      { measured: coveragePct, allowed: 95, corridorIds: targetCorridorIds },
    ));
  }
  if (!gates.some(g => g.id === 'pairing')) {
    gates.push(gate('pairing', true, 'Every paired pavement edge survived the redraw.'));
  }
  if (!gates.some(g => g.id === 'width')) {
    gates.push(gate(
      'width',
      true,
      widthDrifts.length > 0
        ? `Median width drift ${median(widthDrifts)!.toFixed(1)} ft across ${widthDrifts.length} corridor(s).`
        : 'Width is unchanged from the pass-1 model.',
      { measured: median(widthDrifts), allowed: 4 },
    ));
  }

  // ── continuity ────────────────────────────────────────────────────────────
  const continuityFeatures = candidateFeatures.filter(f => f.role === 'edge' || f.role === 'paint' || f.role === 'centerline');
  let gapViolation: { feature: RoadFeature; gap: number; station: number; tolerance: number; at: DraftVertex } | null = null;
  for (let i = 0; i < continuityFeatures.length; i++) {
    for (let j = i + 1; j < continuityFeatures.length; j++) {
      const a = continuityFeatures[i];
      const b = continuityFeatures[j];
      if (a.role !== b.role) continue;
      if ((a.layer ?? '') !== (b.layer ?? '')) continue;
      const info = endpointGap(a.vertices, b.vertices);
      if (!info) continue;
      const tolerance = toleranceForFeature(a, tolerances, candidateModel.corridors);
      const allowed = tolerance?.gapTolFt ?? 15;
      if (info.gap > allowed && (!gapViolation || info.gap > gapViolation.gap)) {
        gapViolation = {
          feature: a,
          gap: info.gap,
          station: stationToVertex(a.vertices, info.aEnd),
          tolerance: allowed,
          at: info.aEnd,
        };
      }
    }
  }
  if (gapViolation) {
    gates.push(gate(
      'continuity',
      false,
      `${gapViolation.feature.id} jumps ${gapViolation.gap.toFixed(0)} ft at station ${formatStation(gapViolation.station)} — allowed ${gapViolation.tolerance.toFixed(0)} ft`,
      {
        measured: gapViolation.gap,
        allowed: gapViolation.tolerance,
        stationFt: gapViolation.station,
        at: gapViolation.at,
        severity: 'red',
        featureIds: [gapViolation.feature.id],
      },
    ));
  } else {
    gates.push(gate('continuity', true, 'Every pavement, paint and centerline chain is continuous within its corridor tolerance.'));
  }

  // Duplicate runs: same role, high projection overlap, near-zero separation.
  let duplicate: { a: RoadFeature; b: RoadFeature; separation: number } | null = null;
  for (let i = 0; i < continuityFeatures.length && !duplicate; i++) {
    for (let j = i + 1; j < continuityFeatures.length; j++) {
      const a = continuityFeatures[i];
      const b = continuityFeatures[j];
      if (a.role !== b.role) continue;
      if (polylineLength(a.vertices) < 30 || polylineLength(b.vertices) < 30) continue;
      const separation = median(a.vertices.map(v => pointToPolylineDistance(v, b.vertices))) ?? Infinity;
      if (separation <= 2.5 && polylineCrossing(a.vertices, b.vertices) === null) {
        duplicate = { a, b, separation };
        break;
      }
    }
  }
  if (duplicate) {
    gates.push(gate(
      'continuity',
      false,
      `${duplicate.a.id} and ${duplicate.b.id} are duplicate parallel runs ${duplicate.separation.toFixed(1)} ft apart — keep one`,
      { measured: duplicate.separation, allowed: 2.5, severity: 'red', featureIds: [duplicate.a.id, duplicate.b.id] },
    ));
  }

  // ── crossing ──────────────────────────────────────────────────────────────
  let crossing: { a: RoadFeature; b: RoadFeature; at: DraftVertex } | null = null;
  for (let i = 0; i < continuityFeatures.length && !crossing; i++) {
    for (let j = i + 1; j < continuityFeatures.length; j++) {
      const a = continuityFeatures[i];
      const b = continuityFeatures[j];
      if (a.role !== 'edge' || b.role !== 'edge') continue;
      if (a.polylineId && b.polylineId && a.polylineId === b.polylineId) continue;
      const hit = polylineCrossing(a.vertices, b.vertices);
      if (hit) {
        crossing = { a, b, at: hit };
        break;
      }
    }
  }
  if (crossing) {
    gates.push(gate(
      'crossing',
      false,
      `${crossing.a.id} crosses ${crossing.b.id} — opposite edges must stay parallel; a branch must T into the through edge`,
      {
        at: crossing.at,
        measured: null,
        allowed: 0,
        severity: 'red',
        featureIds: [crossing.a.id, crossing.b.id],
      },
    ));
  } else {
    const selfHit = continuityFeatures
      .map(feature => ({ feature, at: selfIntersection(feature.vertices) }))
      .find(item => item.at !== null);
    if (selfHit?.at) {
      gates.push(gate(
        'crossing',
        false,
        `${selfHit.feature.id} intersects itself at (${selfHit.at.easting.toFixed(1)}, ${selfHit.at.northing.toFixed(1)})`,
        { at: selfHit.at, measured: null, allowed: 0, severity: 'red', featureIds: [selfHit.feature.id] },
      ));
    } else {
      gates.push(gate('crossing', true, 'No opposite-edge crossing or self-intersection.'));
    }
  }

  // ── paint ─────────────────────────────────────────────────────────────────
  const paintFeatures = candidateFeatures.filter(f => f.role === 'paint');
  const passOnePaint = passOneFeatures.filter(f => f.role === 'paint');
  const paintApplicable = paintFeatures.length > 0 || passOnePaint.length > 0 || request.wantsPaint === true;
  if (!paintApplicable) {
    gates.push(emptyGate('paint', 'No paint runs in this take.'));
  } else {
    const wrongLayer = paintFeatures.find(f => /CNTR|CENTER|BASELINE/i.test(f.layer ?? ''));
    const paintRuns = layeredRuns(currentLines, /PAINT|DYL|DBL|WL|SWL/i);
    const paintGapFt = largestGapBetweenRuns(paintRuns);
    const paintGap = paintGapFt > 80 ? { run: paintRuns[0], max: paintGapFt } : null;
    if (wrongLayer) {
      gates.push(gate(
        'paint',
        false,
        `${wrongLayer.id} is paint on a centerline/baseline layer — paint belongs on L-ROAD-PAINT-Y or L-ROAD-PAINT-W`,
        { featureIds: [wrongLayer.id], measured: null, allowed: 0, severity: 'red' },
      ));
    } else if (paintGap) {
      gates.push(gate(
        'paint',
        false,
        `paint run jumps ${paintGap.max.toFixed(0)} ft — paint is stitched like pavement, one continuous stripe per run`,
        {
          measured: paintGap.max,
          allowed: 80,
          at: paintGap.run[0],
          severity: 'red',
        },
      ));
    } else if (passOnePaint.length > 0 && paintFeatures.length < passOnePaint.length) {
      gates.push(gate(
        'paint',
        false,
        `paint runs dropped from ${passOnePaint.length} to ${paintFeatures.length} — do not delete a band, especially one half of a double-yellow pair`,
        { measured: paintFeatures.length, allowed: passOnePaint.length, severity: 'red' },
      ));
    } else {
      gates.push(gate(
        'paint',
        true,
        `${paintFeatures.length} paint run${paintFeatures.length === 1 ? '' : 's'} continuous on the correct layer.`,
        { measured: paintFeatures.length, allowed: passOnePaint.length || paintFeatures.length },
      ));
    }
  }

  // ── curb ──────────────────────────────────────────────────────────────────
  const curbRegex = /CURB|GUTTER|FLOW|VALLEY|(^|[^A-Z])TC([^A-Z]|$)|(^|[^A-Z])BC([^A-Z]|$)|(^|[^A-Z])DEP/i;
  const curbRuns = layeredRuns(currentLines, curbRegex);
  const passOneCurbRuns = layeredRuns(passOneLines ?? [], curbRegex);
  const curbApplicable = curbRuns.length > 0 || passOneCurbRuns.length > 0;
  if (!curbApplicable) {
    gates.push(emptyGate('curb', 'No curb/gutter/flow-line chains in this take.'));
  } else {
    const edgeFeatures = candidateFeatures.filter(f => f.role === 'edge');
    const curbGapFt = largestGapBetweenRuns(curbRuns);
    let worst = { run: curbRuns[0], maxGap: curbGapFt, distanceToEdge: Infinity };
    for (const run of curbRuns) {
      const mid = run[Math.floor(run.length / 2)];
      const distanceToEdge = edgeFeatures.length > 0
        ? Math.min(...edgeFeatures.map(feature => pointToPolylineDistance(mid, feature.vertices)))
        : Infinity;
      if (distanceToEdge < worst.distanceToEdge) worst = { run, maxGap: curbGapFt, distanceToEdge };
    }
    if (curbRuns.length === 0) {
      gates.push(gate(
        'curb',
        false,
        `pass 1 had ${passOneCurbRuns.length} curb run${passOneCurbRuns.length === 1 ? '' : 's'} but the redraw has none`,
        { measured: 0, allowed: passOneCurbRuns.length, severity: 'red' },
      ));
    } else if (worst.maxGap > 80) {
      gates.push(gate(
        'curb',
        false,
        `curb chain jumps ${worst.maxGap.toFixed(0)} ft — allowed 80 ft`,
        { measured: worst.maxGap, allowed: 80, at: worst.run[0], severity: 'red' },
      ));
    } else if (worst.distanceToEdge > 40) {
      gates.push(gate(
        'curb',
        false,
        `curb chain sits ${worst.distanceToEdge.toFixed(0)} ft from the pavement edge — it must follow its edge`,
        { measured: worst.distanceToEdge, allowed: 40, at: worst.run[0], severity: 'red' },
      ));
    } else {
      gates.push(gate(
        'curb',
        true,
        `${curbRuns.length} curb chain${curbRuns.length === 1 ? '' : 's'} continuous and within ${worst.distanceToEdge.toFixed(0)} ft of its edge.`,
        { measured: worst.maxGap, allowed: 80 },
      ));
    }
  }

  // ── intersection ──────────────────────────────────────────────────────────
  const closedRoad = candidateFeatures.find(feature => feature.isClosed && feature.role === 'edge');
  const branchEndpoints: Array<{ feature: RoadFeature; endpoint: DraftVertex; distance: number; other: RoadFeature }> = [];
  for (const feature of candidateFeatures) {
    if (feature.role !== 'edge' || feature.isClosed || feature.vertices.length < 2) continue;
    for (const endpoint of [feature.vertices[0], feature.vertices[feature.vertices.length - 1]]) {
      for (const other of candidateFeatures) {
        if (other === feature || other.role !== 'edge' || other.isClosed) continue;
        const near = nearestPoint(endpoint, other.vertices);
        if (near.distance > 25) continue;
        // Two paired parallel edges have endpoints near each other; that is a
        // corridor, not a branch. A real branch meets the INTERIOR of the
        // through edge, so ignore a nearest point that is the other run's end.
        const atOtherStart = distance(near.point, other.vertices[0]) <= 5;
        const atOtherEnd = distance(near.point, other.vertices[other.vertices.length - 1]) <= 5;
        if (atOtherStart || atOtherEnd) continue;
        branchEndpoints.push({ feature, endpoint, distance: near.distance, other });
        break;
      }
    }
  }
  const targetIntersections = (passOneModel.intersections
    ?? buildGimbalIntersections(passOneModel.corridors))
    .filter(node => node.kind !== 'l');
  const candidateIntersections = buildGimbalIntersections(candidateModel.corridors);
  let intersectionFailure: RoadGateResult | null = null;
  for (const targetNode of targetIntersections) {
    const candidateNode = candidateIntersections
      .map(node => ({ node, separation: distance(node.at, targetNode.at) }))
      .sort((a, b) => a.separation - b.separation)[0];
    if (!candidateNode || candidateNode.separation > 25) {
      intersectionFailure = gate(
        'intersection',
        false,
        `${targetNode.id} ${targetNode.kind.toUpperCase()} at (${targetNode.at.easting.toFixed(1)}, ${targetNode.at.northing.toFixed(1)}) is missing from the redraw — preserve the ${targetNode.arms.length}-arm node at ${targetNode.label}`,
        {
          measured: candidateNode ? candidateNode.separation : null,
          allowed: 25,
          at: targetNode.at,
          severity: 'red',
          corridorIds: targetNode.corridorIds,
        },
      );
      break;
    }
    if (candidateNode.node.arms.length < targetNode.arms.length) {
      intersectionFailure = gate(
        'intersection',
        false,
        `${targetNode.id} lost an intersection arm: pass 1 had ${targetNode.arms.length}, redraw has ${candidateNode.node.arms.length} — preserve the ${targetNode.kind.toUpperCase()} at ${targetNode.label}`,
        {
          measured: candidateNode.node.arms.length,
          allowed: targetNode.arms.length,
          at: candidateNode.node.at,
          severity: 'red',
          corridorIds: targetNode.corridorIds,
        },
      );
      break;
    }
    const angleDrift = Math.abs(candidateNode.node.angleDeg - targetNode.angleDeg);
    if (angleDrift > 20) {
      intersectionFailure = gate(
        'intersection',
        false,
        `${targetNode.id} intersection angle drifted ${angleDrift.toFixed(0)}° from the pass-1 ${targetNode.kind.toUpperCase()} (${targetNode.angleDeg.toFixed(0)}° → ${candidateNode.node.angleDeg.toFixed(0)}°) at ${targetNode.label}`,
        {
          measured: angleDrift,
          allowed: 20,
          at: candidateNode.node.at,
          severity: 'red',
          corridorIds: targetNode.corridorIds,
        },
      );
      break;
    }
  }

  const intersectionApplicable = Boolean(closedRoad) || branchEndpoints.length > 0;
  if (intersectionFailure) {
    gates.push(intersectionFailure);
  } else if (!intersectionApplicable) {
    gates.push(targetIntersections.length > 0
      ? gate(
          'intersection',
          true,
          `${targetIntersections.length} target intersection node${targetIntersections.length === 1 ? '' : 's'} preserved with the pass-1 arm count and angle.`,
        )
      : emptyGate('intersection', 'No branch or cul-de-sac geometry in this take.'));
  } else {
    const shortBranch = branchEndpoints
      .filter(item => item.distance > 5)
      .sort((a, b) => b.distance - a.distance)[0];
    const closureGap = closedRoad
      ? distance(closedRoad.vertices[0], closedRoad.vertices[closedRoad.vertices.length - 1])
      : 0;
    if (shortBranch) {
      gates.push(gate(
        'intersection',
        false,
        `branch ${shortBranch.feature.id} stops ${shortBranch.distance.toFixed(1)} ft short of ${shortBranch.other.id} — a T must meet the through edge within 5 ft`,
        {
          measured: shortBranch.distance,
          allowed: 5,
          at: shortBranch.endpoint,
          severity: 'red',
          featureIds: [shortBranch.feature.id, shortBranch.other.id],
        },
      ));
    } else if (closedRoad && closureGap > 2) {
      gates.push(gate(
        'intersection',
        false,
        `cul-de-sac bulb does not close — ${closureGap.toFixed(1)} ft gap, allowed 2 ft`,
        {
          measured: closureGap,
          allowed: 2,
          at: closedRoad.vertices[0],
          severity: 'red',
          featureIds: [closedRoad.id],
        },
      ));
    } else {
      gates.push(gate(
        'intersection',
        true,
        closedRoad
          ? 'Cul-de-sac bulb closes and branches meet the through edge.'
          : `${branchEndpoints.length} branch endpoint${branchEndpoints.length === 1 ? '' : 's'} meet the through edge.`,
      ));
    }
  }

  // ── centerline ────────────────────────────────────────────────────────────
  const centerlineFeatures = candidateFeatures.filter(f => f.role === 'centerline');
  if (!request.wantsCenterline) {
    gates.push(emptyGate('centerline', 'No baseline/centerline requested, so no centerline gate.'));
  } else if (centerlineFeatures.length === 0) {
    gates.push(gate(
      'centerline',
      false,
      'A baseline/centerline was requested but the redraw has none',
      { measured: 0, allowed: 1, severity: 'red' },
    ));
  } else {
    const worstKink = Math.max(...centerlineFeatures.map(feature => kinkDegrees(feature.vertices)));
    const broken = centerlineFeatures.length > 1;
    if (broken) {
      gates.push(gate(
        'centerline',
        false,
        `centerline is split into ${centerlineFeatures.length} chains — one continuous alignment is required`,
        { measured: centerlineFeatures.length, allowed: 1, severity: 'red' },
      ));
    } else if (worstKink > 15) {
      gates.push(gate(
        'centerline',
        false,
        `centerline kinks ${worstKink.toFixed(1)}° between adjacent segments — allowed 15°`,
        { measured: worstKink, allowed: 15, severity: 'red', at: centerlineFeatures[0].vertices[0] },
      ));
    } else {
      gates.push(gate('centerline', true, 'Requested centerline is one continuous alignment.'));
    }
  }

  // ── shot grounding ────────────────────────────────────────────────────────
  const roadShots = surveyPoints.filter(shot =>
    /^(EP|EOP|EDGE|ER|ES|EG|EC|ET|ROAD|ROW|CL|C\/L|CENTER|CTR|CURB|GUTTER|TC|BC|DEP|TBC|FL|FLOW|PAV|PVMT|DYL|DBL|WL|SWL|SHOULDER|SHLD)/i
      .test((shot.description ?? '').trim()),
  );
  let shotRecallPct = 100;
  let missedShot: { shot: RoadSurveyPoint; distance: number } | null = null;
  if (roadShots.length > 0 && candidateFeatures.length > 0) {
    let hit = 0;
    for (const shot of roadShots) {
      const vertex = { easting: shot.easting, northing: shot.northing };
      const best = Math.min(...candidateFeatures.map(feature => pointToPolylineDistance(vertex, feature.vertices)));
      if (best <= 2) hit++;
      else if (!missedShot || best > missedShot.distance) missedShot = { shot, distance: best };
    }
    shotRecallPct = (hit / roadShots.length) * 100;
    const allowed = 95;
    gates.push(gate(
      'shot_grounding',
      shotRecallPct >= allowed,
      shotRecallPct >= allowed
        ? `${shotRecallPct.toFixed(0)}% of coded road shots lie on the drafted linework.`
        : `only ${shotRecallPct.toFixed(0)}% of coded road shots lie within 2 ft of the linework${missedShot ? ` — shot ${missedShot.shot.pointNumber ?? ''} is ${missedShot.distance.toFixed(1)} ft away` : ''}`,
      {
        measured: shotRecallPct,
        allowed,
        severity: 'amber',
        at: missedShot ? { easting: missedShot.shot.easting, northing: missedShot.shot.northing } : undefined,
        stationFt: null,
      },
    ));
  } else {
    gates.push(emptyGate('shot_grounding', 'No coded road shots available to check.'));
  }

  const widthDriftFt = widthDrifts.length > 0 ? median(widthDrifts) : null;
  let score = 100;
  score -= missing * 40;
  score -= Math.max(0, 1 - coverageSum / Math.max(1, passOneModel.corridors.length)) * 40;
  score -= gates.filter(g => g.applicable && !g.passed && g.severity === 'red').length * 10;
  score -= gates.filter(g => g.applicable && !g.passed && g.severity === 'amber').length * 4;
  if (widthDriftFt !== null) {
    const allowed = Math.max(...tolerances.map(t => t.widthTolFt), 2);
    score -= Math.min(15, Math.max(0, widthDriftFt - allowed) * 2);
  }
  score = Math.round(clamp(score, 0, 100));

  const verdict = recompute({
    gates,
    applicableCount: 0,
    passedCount: 0,
    failedRed: 0,
    failedAmber: 0,
    score,
    acceptable: false,
    coveragePct: parseFloat(coveragePct.toFixed(1)),
    widthDriftFt: widthDriftFt === null ? null : parseFloat(widthDriftFt.toFixed(2)),
    shotRecallPct: parseFloat(shotRecallPct.toFixed(1)),
    corridorTolerances: tolerances,
    summary: '',
  });

  return verdict;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate brief for the next drafting turn
// ─────────────────────────────────────────────────────────────────────────────

export function formatRoadGateBrief(
  model: RoadMathModel,
  verdict: RoadAcceptanceVerdict,
  options: {
    turn?: number;
    maxTurns?: number;
    confirmation?: boolean;
    frameLabels?: string[];
    widthNote?: string;
  } = {},
): string {
  const turn = options.turn ?? 2;
  const maxTurns = options.maxTurns ?? 8;
  const failures = verdict.gates.filter(g => g.applicable && !g.passed);
  const target = model.corridors.map(corridor =>
    `${corridor.id} sta ${formatStation(corridor.stationStartFt)} → ${formatStation(corridor.stationEndFt)}`
    + `${corridor.widthFt !== null ? ` · ${corridor.widthFt.toFixed(1)} ft` : ''}`
    + `${corridor.edgeCount ? ` · ${corridor.edgeCount} edge${corridor.edgeCount === 1 ? '' : 's'}` : ''}`,
  );

  const lines = [
    `---BEGIN ROAD ACCEPTANCE — TURN ${turn}/${maxTurns}${options.confirmation ? ' (CONFIRMATION)' : ''}---`,
    `TARGET: ${target.join(' | ') || 'no modelled corridor'}`,
    `MEASURED: ${verdict.coveragePct.toFixed(0)}% coverage · ${verdict.widthDriftFt !== null ? `${verdict.widthDriftFt.toFixed(1)} ft width drift` : 'width unchanged'} · ${verdict.shotRecallPct.toFixed(0)}% shot grounding`,
    '',
    `GATES: ${verdict.passedCount} of ${verdict.applicableCount} passed`,
    ...failures.map(failure =>
      `  FAIL  ${failure.id} — ${failure.detail}`,
    ),
    ...verdict.gates
      .filter(g => g.applicable && g.passed)
      .map(g => `  PASS  ${g.id}`),
    '',
    ...(options.widthNote ? [`WIDTH: ${options.widthNote}`, ''] : []),
    ...(options.frameLabels?.length
      ? ['FRAMES IN THIS TURN:', ...options.frameLabels.map(label => `  • ${label}`), '']
      : []),
    ...ROAD_ACCEPTANCE_RUBRIC,
    '',
    formatGimbalMathBrief(model),
    '',
    options.confirmation
      ? 'This is the confirmation redraw. Reproduce the accepted road exactly; do not shorten, re-align, or drop a run. Any regression sends the verified take back to the canvas.'
      : 'Fix the failed stations only. Do not re-align the rest of the corridor.',
    'Return the same ```json geometry contract as the previous turn: {"chains":[...],"lines":[...]}',
    `---END ROAD ACCEPTANCE — TURN ${turn}/${maxTurns}---`,
  ];
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Targeted failure windows
// ─────────────────────────────────────────────────────────────────────────────

export interface RoadFailureWindow {
  corridorId: string;
  gate: RoadGateId;
  stationStartFt: number;
  stationEndFt: number;
  bounds: { minE: number; maxE: number; minN: number; maxN: number };
  label: string;
}

function corridorStationBounds(corridor: RoadModelCorridor): { minE: number; maxE: number; minN: number; maxN: number } | null {
  const vertices = corridor.sections.flatMap(section =>
    [section.nearEdge, section.farEdge].filter((edge): edge is DraftVertex => Boolean(edge)),
  );
  if (vertices.length === 0) return null;
  return {
    minE: Math.min(...vertices.map(v => v.easting)),
    maxE: Math.max(...vertices.map(v => v.easting)),
    minN: Math.min(...vertices.map(v => v.northing)),
    maxN: Math.max(...vertices.map(v => v.northing)),
  };
}

/**
 * Build up to five targeted pass-2 windows. Defects within 150 ft are merged so
 * one frame covers a cluster. A confirmation turn gets the full corridor sweep
 * instead, because the job is to prove the whole road survived.
 */
export function buildFailureWindows(
  model: RoadMathModel,
  verdict: RoadAcceptanceVerdict,
  options: { maxWindows?: number; confirmation?: boolean } = {},
): RoadFailureWindow[] {
  const maxWindows = Math.max(1, options.maxWindows ?? 5);
  if (options.confirmation) {
    return model.corridors.slice(0, Math.min(3, maxWindows)).map(corridor => {
      const bounds = corridorStationBounds(corridor) ?? {
        minE: 0, maxE: 1, minN: 0, maxN: 1,
      };
      const pad = Math.max(40, Math.max(bounds.maxE - bounds.minE, bounds.maxN - bounds.minN) * 0.08);
      return {
        corridorId: corridor.id,
        gate: 'coverage' as RoadGateId,
        stationStartFt: 0,
        stationEndFt: corridor.lengthFt,
        bounds: {
          minE: bounds.minE - pad,
          maxE: bounds.maxE + pad,
          minN: bounds.minN - pad,
          maxN: bounds.maxN + pad,
        },
        label: `PASS 2 · CONFIRM · ${corridor.id} sta ${formatStation(0)}–${formatStation(corridor.lengthFt)} · full corridor sweep`,
      };
    });
  }

  const failures = verdict.gates
    .filter(gateResult => gateResult.applicable && !gateResult.passed && gateResult.severity === 'red')
    .sort((a, b) => {
      const stationA = a.stationFt ?? 0;
      const stationB = b.stationFt ?? 0;
      return stationA - stationB;
    });

  const raw = failures.map(failure => {
    const corridor = model.corridors
      .map(candidate => ({
        candidate,
        distance: failure.at && corridorMid(candidate)
          ? distance(failure.at, corridorMid(candidate)!)
          : Infinity,
      }))
      .sort((a, b) => a.distance - b.distance)[0]?.candidate ?? model.corridors[0];
    const tolerance = verdict.corridorTolerances.find(t => t.corridorId === corridor?.id);
    const centre = failure.at ?? (corridor ? corridorMid(corridor) : null);
    if (!centre) return null;
    const radius = Math.max(
      120,
      (failure.id === 'continuity' || failure.id === 'paint' || failure.id === 'curb')
        ? 2 * (tolerance?.gapTolFt ?? 15)
        : 2 * (tolerance?.widthTolFt ?? 2),
    );
    const station = failure.stationFt ?? 0;
    return {
      corridorId: corridor?.id ?? 'R?',
      gate: failure.id,
      stationStartFt: Math.max(0, station - radius),
      stationEndFt: station + radius,
      bounds: {
        minE: centre.easting - radius,
        maxE: centre.easting + radius,
        minN: centre.northing - radius,
        maxN: centre.northing + radius,
      },
      label:
        `PASS 2 · FAILURE · ${corridor?.id ?? 'R?'} · sta ${formatStation(Math.max(0, station - radius))}`
        + `–${formatStation(station + radius)} · ${failure.id.toUpperCase()}`
        + `${failure.measured !== null ? ` ${failure.measured.toFixed(0)}` : ''}`
        + `${failure.allowed !== null ? ` (allowed ${failure.allowed.toFixed(0)})` : ''}`,
    } satisfies RoadFailureWindow;
  }).filter((item): item is RoadFailureWindow => item !== null);

  const merged: RoadFailureWindow[] = [];
  for (const window of raw) {
    const near = merged.find(existing =>
      Math.hypot(
        (existing.bounds.minE + existing.bounds.maxE) / 2 - (window.bounds.minE + window.bounds.maxE) / 2,
        (existing.bounds.minN + existing.bounds.maxN) / 2 - (window.bounds.minN + window.bounds.maxN) / 2,
      ) <= 150,
    );
    if (near) {
      near.bounds = {
        minE: Math.min(near.bounds.minE, window.bounds.minE),
        maxE: Math.max(near.bounds.maxE, window.bounds.maxE),
        minN: Math.min(near.bounds.minN, window.bounds.minN),
        maxN: Math.max(near.bounds.maxN, window.bounds.maxN),
      };
      near.label = `${near.label} + ${window.gate.toUpperCase()}`;
      near.stationEndFt = Math.max(near.stationEndFt, window.stationEndFt);
    } else {
      merged.push({ ...window });
    }
  }
  return merged.slice(0, maxWindows);
}
