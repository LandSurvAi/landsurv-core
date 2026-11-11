/**
 * Roading Agent CACP Skill Handlers
 *
 * Implements the 5 deterministic Roading Agent skills:
 *   1. `roading_synthesize_existing` — combines survey points (EP, CL, CURB, TBC, ROW),
 *      background aerial imagery optical width calibration (`calibrateRoadWidthFromVision`),
 *      and OpenStreetMap road ways (`extractAuthoritativeRoads`) into CAD polylines,
 *      syncs a horizontal `Centerline` with `CENTERLINE_STATIONING`, and emits `StreetLabel`s.
 *   2. `roading_design_corridor` — builds a proposed road corridor from a `Centerline`
 *      (or point chain) and a `RoadTypicalSection` (lanes, crown %, curb & gutter,
 *      sidewalk, ROW, stationed templates), coordinating with `CENTERLINE_STATIONING`,
 *      `POINT_EDITOR`, `CAD_MANAGER`, and `PROFILE_AGENT`.
 *   3. `roading_generate_profile_and_sections` — delegates to `PROFILE_AGENT` to compute
 *      centerline elevation profiles and cross sections along the road alignment.
 *   4. `roading_add_culdesac_or_fillet` — generates cul-de-sac turnaround bulbs, curb
 *      fillets, or driveway apron tie-ins (`synthesizeDrivewayToHouse`).
 *   5. `roading_clear` — removes generated road corridor linework and runs.
 */

import { interAgentComm, type AgentMessage, type AgentResponse } from './InterAgentCommunication';
import {
  AgentType,
  type Centerline,
  type CenterlinePI,
  type PointList,
  type ProfileInfo,
  type ProfilePoint,
  type RoadCorridorRun,
  type RoadTypicalSection,
  type Settings,
  type StreetLabel,
  type SurveyLine,
  type SurveyPoint,
} from '../types';
import {
  extractAuthoritativeRoads,
  synthesizeDrivewayToHouse,
  sortSurveyPointChain,
} from './roadExtractionService';
import {
  calculateCenterlineLength,
  calculateCurveGeometry,
  calculatePointFromStationOffset,
  formatStation,
  parseStationFromDescription,
  resolveBeginStation,
} from '../utils/stationing';
import { ROAD_CENTERLINE_LINETYPE } from '../utils/roadStyles';
import { generateProfile } from '../utils/contouring';
import { isPointRelevantForCorridor, smoothSplinePoints } from '../utils/civilDrafterVision';
import {
  MAX_SHOT_GAP_FT,
  longestChainRun,
  medianShotGap,
  orderPointsAlongFeature,
  polylinesCross,
  polylineSelfIntersects,
  splitChainsAtGaps,
} from '../utils/linework';
import { formatSynthesisQaSummary, verifySynthesizedLinework } from '../utils/synthesisVerification';
import {
  extractRoadGrounding,
  formatRoadTakeSummary,
  runRoadTakeReview,
} from '../utils/roadTakeReview';
import { knowledgeBase } from './KnowledgeBase';
import { isExperimentalAgentEnabled } from '../utils/experimentalAgents';

export interface RoadingHandlerDeps {
  points: SurveyPoint[];
  pointLists: PointList[];
  setPointLists: React.Dispatch<React.SetStateAction<PointList[]>>;
  lines: SurveyLine[];
  setLines: React.Dispatch<React.SetStateAction<SurveyLine[]>>;
  centerlines: Centerline[];
  setCenterlines?: React.Dispatch<React.SetStateAction<Centerline[]>>;
  roadCorridors?: RoadCorridorRun[];
  setRoadCorridors?: React.Dispatch<React.SetStateAction<RoadCorridorRun[]>>;
  streetLabels?: StreetLabel[];
  setStreetLabels?: React.Dispatch<React.SetStateAction<StreetLabel[]>>;
  setProfileData: React.Dispatch<React.SetStateAction<ProfilePoint[]>>;
  setProfileInfo: React.Dispatch<React.SetStateAction<ProfileInfo | null>>;
  settings: Settings;
  canvas2dRef?: React.RefObject<any>;
  logActionToFieldbook: (msg: string) => void;
}

function respond(
  msg: AgentMessage,
  success: boolean,
  data?: Record<string, unknown>,
  error?: string,
): AgentResponse {
  return {
    requestId: msg.id,
    from: AgentType.ROADING_AGENT,
    success,
    data,
    error,
    timestamp: Date.now(),
  };
}

const ROADING_EXPERIMENTAL_DISABLED_MESSAGE =
  'Roading Agent is experimental and disabled. Enable it in Settings > Experimental Agents to use its road tools.';

function roadingExperimentalGate(message: AgentMessage): AgentResponse | null {
  if (isExperimentalAgentEnabled(AgentType.ROADING_AGENT)) return null;
  return respond(message, false, undefined, ROADING_EXPERIMENTAL_DISABLED_MESSAGE);
}

/** Render visible background map overlay tiles to an offscreen canvas for optical width calibration. */
function renderMapTilesForRoading(
  tiles: Array<{ image: CanvasImageSource; bbox: [number, number, number, number] }>,
  bounds: { minE: number; maxE: number; minN: number; maxN: number },
  width = 1024,
  height = 1024,
): HTMLCanvasElement | null {
  if (!tiles || tiles.length === 0 || typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, width, height);

    const spanE = Math.max(bounds.maxE - bounds.minE, 1.0);
    const spanN = Math.max(bounds.maxN - bounds.minN, 1.0);

    for (const t of tiles) {
      if (!t.image || !t.bbox) continue;
      const [tMinE, tMinN, tMaxE, tMaxN] = t.bbox;
      const x0 = ((tMinE - bounds.minE) / spanE) * width;
      const x1 = ((tMaxE - bounds.minE) / spanE) * width;
      const yTop = ((bounds.maxN - tMaxN) / spanN) * height;
      const yBottom = ((bounds.maxN - tMinN) / spanN) * height;
      const w = x1 - x0;
      const h = yBottom - yTop;
      if (w > 0 && h > 0) {
        ctx.drawImage(t.image, x0, yTop, w, h);
      }
    }
    return canvas;
  } catch {
    return null;
  }
}

function computeProjectBounds(points: SurveyPoint[], lines: SurveyLine[]): {
  minE: number;
  maxE: number;
  minN: number;
  maxN: number;
} {
  let minE = Infinity;
  let maxE = -Infinity;
  let minN = Infinity;
  let maxN = -Infinity;
  let count = 0;

  for (const p of points) {
    if (Number.isFinite(p.easting) && Number.isFinite(p.northing)) {
      if (p.easting < minE) minE = p.easting;
      if (p.easting > maxE) maxE = p.easting;
      if (p.northing < minN) minN = p.northing;
      if (p.northing > maxN) maxN = p.northing;
      count++;
    }
  }

  if (count < 2) {
    for (const l of lines) {
      if (l.fromPt && Number.isFinite(l.fromPt.x) && Number.isFinite(l.fromPt.y)) {
        minE = Math.min(minE, l.fromPt.x);
        maxE = Math.max(maxE, l.fromPt.x);
        minN = Math.min(minN, l.fromPt.y);
        maxN = Math.max(maxN, l.fromPt.y);
        count++;
      }
      if (l.toPt && Number.isFinite(l.toPt.x) && Number.isFinite(l.toPt.y)) {
        minE = Math.min(minE, l.toPt.x);
        maxE = Math.max(maxE, l.toPt.x);
        minN = Math.min(minN, l.toPt.y);
        maxN = Math.max(maxN, l.toPt.y);
        count++;
      }
    }
  }

  if (count < 2 || !Number.isFinite(minE)) {
    return { minE: 1000, maxE: 1400, minN: 1000, maxN: 1400 };
  }

  const padE = Math.max(40, (maxE - minE) * 0.2);
  const padN = Math.max(40, (maxN - minN) * 0.2);
  return {
    minE: minE - padE,
    maxE: maxE + padE,
    minN: minN - padN,
    maxN: maxN + padN,
  };
}

function perpendicularDistanceToSegment(
  point: { easting: number; northing: number },
  start: { easting: number; northing: number },
  end: { easting: number; northing: number },
): number {
  const dx = end.easting - start.easting;
  const dy = end.northing - start.northing;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1e-12) {
    return Math.hypot(point.easting - start.easting, point.northing - start.northing);
  }
  const t = Math.max(
    0,
    Math.min(1, ((point.easting - start.easting) * dx + (point.northing - start.northing) * dy) / lengthSq),
  );
  return Math.hypot(
    point.easting - (start.easting + t * dx),
    point.northing - (start.northing + t * dy),
  );
}

/** Ramer–Douglas–Peucker simplification, keeping the centerline within `toleranceFt` of the source. */
function simplifyCenterlineVertices(
  coords: Array<{ easting: number; northing: number }>,
  toleranceFt = 0.1,
): Array<{ easting: number; northing: number }> {
  if (coords.length <= 2) return coords;

  const keep = new Uint8Array(coords.length);
  keep[0] = 1;
  keep[coords.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, coords.length - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let maxDistance = -1;
    let maxIndex = -1;
    for (let i = start + 1; i < end; i++) {
      const distance = perpendicularDistanceToSegment(coords[i], coords[start], coords[end]);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }
    if (maxIndex !== -1 && maxDistance > toleranceFt) {
      keep[maxIndex] = 1;
      stack.push([start, maxIndex], [maxIndex, end]);
    }
  }

  return coords.filter((_, index) => keep[index] === 1);
}

function polylineLength(coords: Array<{ easting: number; northing: number }>): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += Math.hypot(coords[i].easting - coords[i - 1].easting, coords[i].northing - coords[i - 1].northing);
  }
  return total;
}

/** Resample a polyline to at most `maxVertices` evenly spaced vertices by arc length. */
function resampleByArcLength(
  coords: Array<{ easting: number; northing: number }>,
  maxVertices: number,
): Array<{ easting: number; northing: number }> {
  if (coords.length <= maxVertices || maxVertices < 2) return coords;
  const total = polylineLength(coords);
  if (total <= 0) return [coords[0], coords[coords.length - 1]];

  const step = total / (maxVertices - 1);
  const out = [coords[0]];
  let segment = 0;
  let segmentStart = 0;
  let target = step;

  while (out.length < maxVertices - 1 && segment < coords.length - 1) {
    const a = coords[segment];
    const b = coords[segment + 1];
    const segLen = Math.hypot(b.easting - a.easting, b.northing - a.northing);
    if (segmentStart + segLen >= target) {
      const t = segLen > 0 ? (target - segmentStart) / segLen : 0;
      out.push({
        easting: a.easting + (b.easting - a.easting) * t,
        northing: a.northing + (b.northing - a.northing) * t,
      });
      target += step;
    } else {
      segmentStart += segLen;
      segment += 1;
    }
  }

  out.push(coords[coords.length - 1]);
  return out;
}

/**
 * Estimate a circular-curve radius through three consecutive vertices. The radius
 * is kept only when a normal curve would fit inside both adjacent tangents, which
 * avoids overlapping curves on tight, shot-driven alignments.
 */
function fitCurveRadius(
  prev: { easting: number; northing: number },
  curr: { easting: number; northing: number },
  next: { easting: number; northing: number },
): number | undefined {
  const a = Math.hypot(next.easting - curr.easting, next.northing - curr.northing);
  const b = Math.hypot(next.easting - prev.easting, next.northing - prev.northing);
  const c = Math.hypot(curr.easting - prev.easting, curr.northing - prev.northing);
  const twiceArea = Math.abs(
    (curr.easting - prev.easting) * (next.northing - prev.northing) -
      (curr.northing - prev.northing) * (next.easting - prev.easting),
  );
  if (a < 1 || c < 1 || twiceArea < 1e-6) return undefined;

  const bearingIn = Math.atan2(curr.easting - prev.easting, curr.northing - prev.northing);
  const bearingOut = Math.atan2(next.easting - curr.easting, next.northing - curr.northing);
  let delta = bearingOut - bearingIn;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  if (Math.abs(delta) < 0.035) return undefined;

  const circumradius = (a * b * c) / (2 * twiceArea);
  const maxRadius = (0.42 * Math.min(a, c)) / Math.tan(Math.abs(delta) / 2);
  if (!Number.isFinite(circumradius) || maxRadius < 40) return undefined;
  return Math.round(Math.min(Math.max(circumradius, 40), maxRadius));
}

/** Convert a polyline of `{ easting, northing }` vertices into a PI list for a `Centerline`. */
export function buildCenterlineFromVertices(
  coords: Array<{ easting: number; northing: number }>,
  name: string,
  idPrefix = 'cl-road',
  beginStation = 0,
): Centerline {
  // Drop collinear source vertices first — a straight OSM way should stay one offset
  // segment — but keep every genuine break. The old 12-PI index cap skipped whole
  // curves; thinning now happens by arc length, so curvature survives.
  const finite = coords.filter((p) => Number.isFinite(p.easting) && Number.isFinite(p.northing));
  const simplified = simplifyCenterlineVertices(finite, 0.15);
  const sampled = resampleByArcLength(simplified, 64);
  const fitRadii = sampled.length <= 16;

  const pis: CenterlinePI[] = sampled.map((pt, idx) => ({
    id: `pi-${Date.now()}-${idx}`,
    pointNumber: idx === 0 ? 'POB' : idx === sampled.length - 1 ? 'END' : `PI-${idx}`,
    northing: pt.northing,
    easting: pt.easting,
    curveRadius:
      fitRadii && idx > 0 && idx < sampled.length - 1
        ? fitCurveRadius(sampled[idx - 1], pt, sampled[idx + 1])
        : undefined,
  }));

  return {
    id: `${idPrefix}-${Date.now()}`,
    name,
    beginStation: Number.isFinite(beginStation) ? beginStation : 0,
    pis,
  };
}

/** Emit a coordinate chain as one grouped polyline of canvas line segments. */
export function emitChainLines(
  coords: Array<{ easting: number; northing: number; pointNumber?: string; elevation?: number }>,
  layer: string,
  lineType: string,
  polyPrefix: string,
): SurveyLine[] {
  if (coords.length < 2) return [];
  const polyId = `${polyPrefix}-${Date.now()}`;
  const lines: SurveyLine[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    lines.push({
      id: `line-${polyId}-${i}`,
      from: a.pointNumber || `${polyPrefix}-${i}`,
      to: b.pointNumber || `${polyPrefix}-${i + 1}`,
      fromPt: { x: a.easting, y: a.northing, z: a.elevation ?? 0 },
      toPt: { x: b.easting, y: b.northing, z: b.elevation ?? 0 },
      layer,
      lineType,
      polylineId: polyId,
    });
  }
  return lines;
}

export interface SurveyRoadCorridor {
  centerline: Array<{ easting: number; northing: number; pointNumber?: string; elevation?: number; description?: string }>;
  edgeA: Array<{ easting: number; northing: number; pointNumber?: string; elevation?: number; description?: string }>;
  edgeB: Array<{ easting: number; northing: number; pointNumber?: string; elevation?: number; description?: string }>;
  widthFt: number;
  shotCount: number;
  lengthFt: number;
  /** Station written on the first station-labeled shot along the corridor, when present. */
  beginStation?: number;
}

const GENERATED_ROAD_POINT = /^(EP|CL|DW|ROAD|POLY|TRIM)-/i;
const EDGE_SHOT = /\b(EP|EOP|ER|EDGE|ES|EG|EC|ET|CURB|TBC|TC|BC|GUTTER|PAV|PVMT|SHLD|SH|DEP[0-9]*)\b/i;
const CENTERLINE_SHOT = /\b(CL|CTR|CENTER|CENTERLINE)\b/i;
const WIDTH_CODE_RE = /(\d+(?:\.\d+)?)\s*W\b/i;

type RoadCoord = { easting: number; northing: number; pointNumber?: string; elevation?: number; description?: string };

function roadMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function roadPercentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * Math.max(0, Math.min(1, fraction));
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (pos - lower);
}

/** Rolling median removes single-shot spikes without rounding real horizontal curves. */
function rollingMedian(values: number[], radius: number): number[] {
  return values.map((_, index) => {
    const window = values.slice(Math.max(0, index - radius), Math.min(values.length, index + radius + 1));
    return roadMedian(window);
  });
}

/** Light moving average used after a spline so a noisy station bin cannot overshoot. */
function smoothRoadPolyline(coords: RoadCoord[], passes = 2): RoadCoord[] {
  let current = coords;
  for (let pass = 0; pass < passes; pass++) {
    if (current.length < 3) return current;
    current = current.map((point, index) => {
      if (index === 0 || index === current.length - 1) return point;
      const prev = current[index - 1];
      const next = current[index + 1];
      return {
        easting: prev.easting * 0.25 + point.easting * 0.5 + next.easting * 0.25,
        northing: prev.northing * 0.25 + point.northing * 0.5 + next.northing * 0.25,
      };
    });
  }
  return current;
}

/** Project a shot onto the nearest centerline segment; offset is positive to the left. */
function projectPointToRoadPolyline(
  point: RoadCoord,
  line: RoadCoord[],
): { station: number; offset: number; distance: number } {
  let best = { station: 0, offset: 0, distance: Infinity };
  let station = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const dx = b.easting - a.easting;
    const dy = b.northing - a.northing;
    const lengthSq = dx * dx + dy * dy;
    const length = Math.sqrt(lengthSq);
    if (length < 1e-9) continue;
    const t = Math.max(
      0,
      Math.min(1, ((point.easting - a.easting) * dx + (point.northing - a.northing) * dy) / lengthSq),
    );
    const projectedE = a.easting + dx * t;
    const projectedN = a.northing + dy * t;
    const distance = Math.hypot(point.easting - projectedE, point.northing - projectedN);
    if (distance < best.distance) {
      best = {
        station: station + length * t,
        offset: (dx * (point.northing - a.northing) - dy * (point.easting - a.easting)) / length,
        distance,
      };
    }
    station += length;
  }
  return best;
}

/** Starting station written on a shot at the beginning of a corridor. */
function firstStationOnCorridor(
  centerline: RoadCoord[],
  points: SurveyPoint[],
): number | undefined {
  const start = centerline[0];
  let first: { distance: number; station: number } | null = null;
  for (const point of points) {
    const station = parseStationFromDescription(point.description);
    if (station === null) continue;
    const distance = Math.hypot(point.easting - start.easting, point.northing - start.northing);
    // Only the POB end of the corridor can define its beginning station.
    if (distance > 60) continue;
    if (!first || distance < first.distance) {
      first = { distance, station };
    }
  }
  return first?.station;
}

/** Uniform parallel offset. Edges come from one smooth CL, so they cannot swap or loop. */
function offsetRoadPolyline(coords: RoadCoord[], offsetFt: number): RoadCoord[] {
  return coords.map((point, index) => {
    const prev = coords[Math.max(0, index - 1)];
    const next = coords[Math.min(coords.length - 1, index + 1)];
    const dx = next.easting - prev.easting;
    const dy = next.northing - prev.northing;
    const length = Math.hypot(dx, dy) || 1;
    return {
      easting: point.easting - (dy / length) * offsetFt,
      northing: point.northing + (dx / length) * offsetFt,
    };
  });
}

/**
 * Pick the single OSM frontage road that the survey shots belong to. A project
 * bounding box commonly contains an entire street network; drawing all of it is
 * what produced the tangled 500-segment output.
 */
function choosePrimaryRoadIndex(centerlines: RoadCoord[][], points: SurveyPoint[]): number {
  if (centerlines.length <= 1) return 0;
  const roadPoints = points.filter(
    (p) => Number.isFinite(p.easting) && Number.isFinite(p.northing) && isPointRelevantForCorridor(p.description, 'road'),
  );
  if (roadPoints.length === 0) {
    let longestIdx = 0;
    let longest = -1;
    centerlines.forEach((cl, idx) => {
      const length = polylineLength(cl);
      if (length > longest) {
        longest = length;
        longestIdx = idx;
      }
    });
    return longestIdx;
  }
  let bestIdx = 0;
  let bestNear = -1;
  let bestLength = -1;
  centerlines.forEach((cl, idx) => {
    let near = 0;
    const stride = Math.max(1, Math.floor(cl.length / 48));
    for (let i = 0; i < cl.length; i += stride) {
      for (const p of roadPoints) {
        if (Math.hypot(p.easting - cl[i].easting, p.northing - cl[i].northing) <= 100) {
          near++;
          break;
        }
      }
    }
    const length = polylineLength(cl);
    if (near > bestNear || (near === bestNear && length > bestLength)) {
      bestNear = near;
      bestLength = length;
      bestIdx = idx;
    }
  });
  return bestIdx;
}

/**
 * Reconstruct one road corridor from field shots the way a civil drafter does:
 * establish a smooth centerline first (CL shots, else robust cross-section
 * medians, staggered windows, or opposite-edge pairs), infer the cartway width
 * from the shots, and chain the actual surveyed left/right edge points in
 * station order along each side of the corridor without crossing the road bed.
 */
export function traceSurveyRoadCorridor(points: SurveyPoint[]): SurveyRoadCorridor | null {
  const shots = points.filter(
    (p) =>
      Number.isFinite(p.easting) &&
      Number.isFinite(p.northing) &&
      isPointRelevantForCorridor(p.description, 'road') &&
      !GENERATED_ROAD_POINT.test(p.pointNumber || '') &&
      // A pure CL shot sits between the curbs; it is alignment evidence, not an edge.
      (!CENTERLINE_SHOT.test(p.description || '') || EDGE_SHOT.test(p.description || '')),
  );

  const centerlineShots = points.filter(
    (p) =>
      Number.isFinite(p.easting) &&
      Number.isFinite(p.northing) &&
      CENTERLINE_SHOT.test(p.description || '') &&
      !EDGE_SHOT.test(p.description || '') &&
      isPointRelevantForCorridor(p.description, 'road') &&
      !GENERATED_ROAD_POINT.test(p.pointNumber || ''),
  );

  if (shots.length < 4 && centerlineShots.length < 2) return null;

  let centerline: RoadCoord[] | null = null;
  let widthFt: number | undefined;
  let fromWidthCodedCenterline = false;

  // 1. Best evidence: actual centerline shots (including width-coded centerlines like "24W CL").
  if (centerlineShots.length >= 2) {
    const clByPn = new Map(centerlineShots.map((p) => [p.pointNumber, p]));
    const orderedPns = orderPointsAlongFeature(
      centerlineShots.map((p) => ({
        pointNumber: p.pointNumber,
        easting: p.easting,
        northing: p.northing,
      })),
    );
    const ordered = orderedPns
      .map((pn) => clByPn.get(pn))
      .filter((p): p is SurveyPoint => Boolean(p))
      .map((p) => ({
        easting: p.easting,
        northing: p.northing,
        pointNumber: p.pointNumber,
        elevation: p.elevation,
      }));

    const codedWidths = centerlineShots
      .map((p) => Number((p.description || '').match(WIDTH_CODE_RE)?.[1]))
      .filter((w) => Number.isFinite(w) && w >= 8 && w <= 100);

    // A centreline is a run of observed CL shots. Do not bridge an implausible
    // gap to one isolated shot just because it happens to carry a CL code.
    const primaryClRun = longestChainRun(splitChainsAtGaps(ordered));
    if (primaryClRun.length >= 3) {
      const smoothed = smoothRoadPolyline(smoothSplinePoints(primaryClRun, 6, false), 2);
      centerline = resampleByArcLength(simplifyCenterlineVertices(smoothed, 0.1), 64);
    } else if (primaryClRun.length === 2 && codedWidths.length > 0) {
      centerline = primaryClRun;
    }

    if (centerline) {
      const absOffsets = shots
        .map((p) => Math.abs(projectPointToRoadPolyline(p, centerline!).offset))
        .filter((value) => value >= 3 && value <= 80);
      if (absOffsets.length >= 4) {
        // Edge shots sit at half-width on both sides. The median is immune to a
        // handful of driveway/side-road shots farther from the centerline.
        widthFt = roadMedian(absOffsets) * 2;
      } else if (codedWidths.length > 0) {
        widthFt = roadMedian(codedWidths);
        fromWidthCodedCenterline = true;
      }
    }
  }

  // 2. No CL shots: recover the centerline from cross-section midpoints (including staggered stations & curves).
  if (!centerline && shots.length >= 4) {
    const meanE = shots.reduce((sum, p) => sum + p.easting, 0) / shots.length;
    const meanN = shots.reduce((sum, p) => sum + p.northing, 0) / shots.length;
    let covEE = 0;
    let covNN = 0;
    let covEN = 0;
    for (const p of shots) {
      const dx = p.easting - meanE;
      const dy = p.northing - meanN;
      covEE += dx * dx;
      covNN += dy * dy;
      covEN += dx * dy;
    }
    const axisAngle = 0.5 * Math.atan2(2 * covEN, covEE - covNN);
    const ux = Math.cos(axisAngle);
    const uy = Math.sin(axisAngle);
    const nx = -uy;
    const ny = ux;

    const projected = shots.map((p) => {
      const dx = p.easting - meanE;
      const dy = p.northing - meanN;
      return { s: dx * ux + dy * uy, h: dx * nx + dy * ny, p };
    });
    const sMin = Math.min(...projected.map((v) => v.s));
    const sMax = Math.max(...projected.map((v) => v.s));
    const span = sMax - sMin;
    if (span < 20) return null;

    const binSize = Math.max(10, Math.min(30, span / 70));
    const bins = new Map<number, Array<{ s: number; h: number }>>();
    for (const item of projected) {
      // Nearest bin, not floor: opposing edges of one cross-section differ by a
      // few hundredths of a foot and must never be split across a bin boundary.
      const key = Math.round((item.s - sMin) / binSize);
      const bin = bins.get(key);
      if (bin) bin.push(item);
      else bins.set(key, [item]);
    }

    let mids: Array<{ s: number; h: number }> = [];
    let binWidths: number[] = [];
    for (const [, bin] of [...bins.entries()].sort((a, b) => a[0] - b[0])) {
      if (bin.length === 0) continue;
      const hs = bin.map((v) => v.h);
      const low = bin.length >= 4 ? roadPercentile(hs, 0.15) : Math.min(...hs);
      const high = bin.length >= 4 ? roadPercentile(hs, 0.85) : Math.max(...hs);
      const spread = high - low;
      if (spread < 8 || spread > 100) continue;
      mids.push({ s: bin.reduce((sum, v) => sum + v.s, 0) / bin.length, h: (low + high) / 2 });
      binWidths.push(spread);
    }

    // 2b. Staggered cross-section fallback: field crews often walk down one edge
    // and back up the other, so left and right shots do not land in the same 15-ft bin.
    // Overlapping windows along the corridor axis capture both staggered edges.
    if (mids.length < 3 || binWidths.length < 3) {
      const windowMids: Array<{ s: number; h: number }> = [];
      const windowWidths: number[] = [];
      const windowWidth = Math.max(35, Math.min(110, span / 3));
      const stepCount = Math.max(6, Math.min(20, Math.round(span / (windowWidth * 0.45))));
      for (let w = 0; w <= stepCount; w++) {
        const centerS = sMin + (span * w) / stepCount;
        const inWin = projected.filter((item) => Math.abs(item.s - centerS) <= windowWidth / 2);
        if (inWin.length < 2) continue;
        const hs = inWin.map((v) => v.h);
        const low = inWin.length >= 6 ? roadPercentile(hs, 0.15) : Math.min(...hs);
        const high = inWin.length >= 6 ? roadPercentile(hs, 0.85) : Math.max(...hs);
        const spread = high - low;
        if (spread < 8 || spread > 100) continue;
        windowMids.push({
          s: inWin.reduce((sum, v) => sum + v.s, 0) / inWin.length,
          h: (low + high) / 2,
        });
        windowWidths.push(spread);
      }
      if (windowMids.length >= 3 && windowWidths.length >= 3) {
        mids = windowMids;
        binWidths = windowWidths;
      }
    }

    if (mids.length >= 3 && binWidths.length >= 3) {
      const medianWidth = roadMedian(binWidths);
      const widthDeviation = roadMedian(binWidths.map((value) => Math.abs(value - medianWidth)));
      if (medianWidth >= 8 && medianWidth <= 100 && widthDeviation <= Math.max(5, medianWidth * 0.28)) {
        const smoothedH = rollingMedian(mids.map((m) => m.h), 1);
        const rawCenter = mids.map((m, index) => ({
          easting: meanE + ux * m.s + nx * smoothedH[index],
          northing: meanN + uy * m.s + ny * smoothedH[index],
        }));
        const smoothed = smoothRoadPolyline(smoothSplinePoints(rawCenter, 6, false), 3);
        centerline = resampleByArcLength(simplifyCenterlineVertices(smoothed, 0.1), 64);
        // Refine widthFt perpendicular to the curved centerline so curved alignments
        // are not foreshortened by the global PCA axis angle.
        const perpOffsets = shots
          .map((p) => Math.abs(projectPointToRoadPolyline(p, centerline!).offset))
          .filter((v) => v >= 3 && v <= 80);
        widthFt = perpOffsets.length >= 4 ? roadMedian(perpOffsets) * 2 : medianWidth;
      }
    }

    // 2c. Curved corridor without CL shots: when a road curves strongly (e.g. 60–90° bend),
    // global PCA projection mixes stations along the curve. Recover the curved spine from
    // opposite-edge shot pairs that are perpendicular to the local edge tangent.
    if (!centerline && shots.length >= 6) {
      const pairMids: Array<RoadCoord & { id: string; span: number }> = [];
      for (let i = 0; i < shots.length; i++) {
        const a = shots[i];
        // Find nearest neighbor along the same edge to estimate local travel tangent
        let sameEdgeNeighbor: SurveyPoint | null = null;
        let sameDist = Infinity;
        for (let j = 0; j < shots.length; j++) {
          if (i === j) continue;
          const d = Math.hypot(shots[j].easting - a.easting, shots[j].northing - a.northing);
          if (d >= 4 && d < sameDist) {
            sameDist = d;
            sameEdgeNeighbor = shots[j];
          }
        }
        if (!sameEdgeNeighbor || sameDist > 80) continue;
        const tx = (sameEdgeNeighbor.easting - a.easting) / sameDist;
        const ty = (sameEdgeNeighbor.northing - a.northing) / sameDist;

        let bestOpposite: SurveyPoint | null = null;
        let bestCrossDist = Infinity;
        for (let j = i + 1; j < shots.length; j++) {
          const b = shots[j];
          const dx = b.easting - a.easting;
          const dy = b.northing - a.northing;
          const dist = Math.hypot(dx, dy);
          if (dist < 8 || dist > 90) continue;
          const along = Math.abs(dx * tx + dy * ty);
          if (along <= Math.max(12, dist * 0.45) && dist < bestCrossDist) {
            bestCrossDist = dist;
            bestOpposite = b;
          }
        }
        if (bestOpposite) {
          pairMids.push({
            id: `mid-${i}`,
            easting: (a.easting + bestOpposite.easting) / 2,
            northing: (a.northing + bestOpposite.northing) / 2,
            span: bestCrossDist,
          });
        }
      }

      if (pairMids.length >= 4) {
        const spans = pairMids.map((m) => m.span);
        const medianSpan = roadMedian(spans);
        const spanDev = roadMedian(spans.map((s) => Math.abs(s - medianSpan)));
        if (medianSpan >= 8 && medianSpan <= 100 && spanDev <= Math.max(5, medianSpan * 0.25)) {
          const inlierMids = pairMids.filter((m) => Math.abs(m.span - medianSpan) <= Math.max(6, medianSpan * 0.35));
          if (inlierMids.length >= 3) {
            const byId = new Map(inlierMids.map((m) => [m.id, m]));
            const orderedIds = orderPointsAlongFeature(
              inlierMids.map((m) => ({
                pointNumber: m.id,
                easting: m.easting,
                northing: m.northing,
              })),
            );
            const orderedMids = orderedIds
              .map((id) => byId.get(id)!)
              .filter(Boolean)
              .map((m) => ({ easting: m.easting, northing: m.northing }));
            const smoothed = smoothRoadPolyline(smoothSplinePoints(orderedMids, 6, false), 2);
            centerline = resampleByArcLength(simplifyCenterlineVertices(smoothed, 0.1), 64);
            widthFt = medianSpan;
          }
        }
      }
    }
  }

  if (!centerline || centerline.length < 2) return null;

  // PCA/curve builders see every shot, including one isolated far-off shot that
  // can stretch the alignment through empty ground. Keep the dominant
  // contiguous centreline run before deriving any offset edges.
  centerline = longestChainRun(splitChainsAtGaps(
    centerline,
    Math.max(MAX_SHOT_GAP_FT, medianShotGap(centerline) * 8),
  ));
  if (centerline.length < 2) return null;

  if (!widthFt || !Number.isFinite(widthFt) || widthFt < 8 || widthFt > 100) return null;

  const halfWidth = widthFt / 2;
  const beginStation = firstStationOnCorridor(centerline, points);

  if (!fromWidthCodedCenterline) {
    // 3. The centerline must actually be supported by edge shots on both sides.
    const projectedShots = shots.map((p) => ({
      p,
      ...projectPointToRoadPolyline(p, centerline!),
    }));
    const supportOffsets = projectedShots
      .filter((item) => Math.abs(item.offset) <= 120)
      .map((item) => item.offset);
    const leftSupport = supportOffsets.filter((value) => value >= widthFt! * 0.2).length;
    const rightSupport = supportOffsets.filter((value) => value <= -widthFt! * 0.2).length;
    if (leftSupport < 2 || rightSupport < 2 || leftSupport + rightSupport < 5) return null;

    // 4. Chain the actual surveyed left-edge and right-edge shots in station order
    // (Civil Drafter style) when both edges are well-represented along the corridor,
    // while filtering out side-road / driveway branch outliers.
    const bandTol = Math.max(5, halfWidth * 0.42);
    const leftInBand = projectedShots
      .filter((item) => item.offset > 0 && Math.abs(item.offset - halfWidth) <= bandTol)
      .sort((a, b) => a.station - b.station);
    const rightInBand = projectedShots
      .filter((item) => item.offset < 0 && Math.abs(Math.abs(item.offset) - halfWidth) <= bandTol)
      .sort((a, b) => a.station - b.station);

    type EdgeShot = {
      easting: number;
      northing: number;
      station: number;
      point: SurveyPoint;
    };
    const edgeRun = (items: typeof leftInBand): EdgeShot[] => {
      const mapped: EdgeShot[] = items.map((item) => ({
        easting: item.p.easting,
        northing: item.p.northing,
        station: item.station,
        point: item.p,
      }));
      return longestChainRun(splitChainsAtGaps(mapped));
    };
    const dedupeByStation = (items: EdgeShot[]): RoadCoord[] => {
      const out: RoadCoord[] = [];
      for (const item of items) {
        const coord: RoadCoord = {
          easting: item.point.easting,
          northing: item.point.northing,
          pointNumber: item.point.pointNumber,
          elevation: item.point.elevation,
        };
        if (out.length === 0) {
          out.push(coord);
          continue;
        }
        const prev = out[out.length - 1];
        if (Math.hypot(coord.easting - prev.easting, coord.northing - prev.northing) >= 0.25) {
          out.push(coord);
        }
      }
      return out;
    };

    // One long gap must not extend an edge through unsupported ground. Keep the
    // dominant run on each side, then refuse the shot-chain result if the two
    // edges cross each other or an individual edge doubles back on itself.
    const leftRun = edgeRun(leftInBand);
    const rightRun = edgeRun(rightInBand);
    const leftChain = dedupeByStation(leftRun);
    const rightChain = dedupeByStation(rightRun);
    const clLen = polylineLength(centerline);
    const leftSpan = leftRun.length >= 2
      ? leftRun[leftRun.length - 1].station - leftRun[0].station
      : 0;
    const rightSpan = rightRun.length >= 2
      ? rightRun[rightRun.length - 1].station - rightRun[0].station
      : 0;
    const edgeChainsAreSimple =
      !polylineSelfIntersects(leftChain) &&
      !polylineSelfIntersects(rightChain) &&
      !polylinesCross(leftChain, rightChain);

    if (
      leftChain.length >= 3 &&
      rightChain.length >= 3 &&
      clLen > 0 &&
      leftSpan >= clLen * 0.6 &&
      rightSpan >= clLen * 0.6 &&
      edgeChainsAreSimple
    ) {
      return {
        centerline,
        edgeA: leftChain,
        edgeB: rightChain,
        widthFt: parseFloat(widthFt.toFixed(1)),
        shotCount: shots.length,
        lengthFt: parseFloat(clLen.toFixed(1)),
        beginStation,
      };
    }
  }

  return {
    centerline,
    edgeA: offsetRoadPolyline(centerline, halfWidth),
    edgeB: offsetRoadPolyline(centerline, -halfWidth),
    widthFt: parseFloat(widthFt.toFixed(1)),
    shotCount: shots.length + centerlineShots.length,
    lengthFt: parseFloat(polylineLength(centerline).toFixed(1)),
    beginStation,
  };
}

/**
 * Build the pavement/ROW arc for a cul-de-sac bulb. The arc stops at the two
 * points where the approaching pavement edges meet the circle, so it no longer
 * draws a full circle across the road mouth.
 */
function buildTangentBulbPolyline(
  centerE: number,
  centerN: number,
  radiusFt: number,
  halfWidthFt: number,
  travelBearing: number,
): Array<{ easting: number; northing: number }> {
  const radius = Math.max(radiusFt, halfWidthFt + 1);
  const w = Math.min(halfWidthFt, radius * 0.9);
  const back = Math.sqrt(Math.max(radius * radius - w * w, 0));
  const tx = Math.sin(travelBearing);
  const ty = Math.cos(travelBearing);
  const nx = Math.cos(travelBearing);
  const ny = -Math.sin(travelBearing);

  const startAngle = Math.atan2(-tx * back + nx * w, -ty * back + ny * w);
  const endAngle = Math.atan2(-tx * back - nx * w, -ty * back - ny * w);
  const normalize = (angle: number) => {
    let value = angle;
    while (value < 0) value += Math.PI * 2;
    while (value >= Math.PI * 2) value -= Math.PI * 2;
    return value;
  };
  const mouthSpan = normalize(endAngle - startAngle);
  const farSideOffset = normalize(travelBearing - startAngle);
  const sweep = farSideOffset <= mouthSpan ? mouthSpan : mouthSpan - Math.PI * 2;
  const steps = Math.max(12, Math.ceil((Math.abs(sweep) * radius) / 4));

  const coords: Array<{ easting: number; northing: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + sweep * (i / steps);
    coords.push({
      easting: centerE + radius * Math.cos(angle),
      northing: centerN + radius * Math.sin(angle),
    });
  }
  return coords;
}

type OffsetVertex = { x: number; y: number };

/** Perpendicular offset from a tangent. Positive is to the right of travel. */
function offsetVertexOnBearing(
  easting: number,
  northing: number,
  bearing: number,
  offsetFt: number,
): OffsetVertex {
  return {
    x: easting + offsetFt * Math.cos(bearing),
    y: northing - offsetFt * Math.sin(bearing),
  };
}

/** Intersect the two offset lines at a tangent vertex so the polyline corner is mitered. */
function miteredOffsetVertex(
  easting: number,
  northing: number,
  inBearing: number,
  outBearing: number,
  offsetFt: number,
): OffsetVertex {
  const n1x = Math.cos(inBearing);
  const n1y = -Math.sin(inBearing);
  const n2x = Math.cos(outBearing);
  const n2y = -Math.sin(outBearing);
  const mx = n1x + n2x;
  const my = n1y + n2y;
  const mLen = Math.hypot(mx, my);
  const denominator = mLen > 1e-9 ? (mx / mLen) * n1x + (my / mLen) * n1y : 0;

  // Near-reversing tangents produce an unusable miter — fall back to a square corner.
  if (denominator < 0.2) {
    return offsetVertexOnBearing(easting, northing, inBearing, offsetFt);
  }

  const miterLength = offsetFt / denominator;
  return { x: easting + (mx / mLen) * miterLength, y: northing + (my / mLen) * miterLength };
}

function pushOffsetVertex(vertices: OffsetVertex[], vertex: OffsetVertex): void {
  const last = vertices[vertices.length - 1];
  if (last && Math.hypot(last.x - vertex.x, last.y - vertex.y) < 1e-6) return;
  vertices.push(vertex);
}

/**
 * Generate a parallel offset polyline along a Centerline.
 *
 * Vertices are placed only at real geometry breaks — tangent PIs (mitered), PC/PT,
 * and samples through each curve. Sampling the alignment at a fixed station step
 * instead produced a straight ROW line as dozens of tiny segments that selected
 * as individual lines. `stepFt` is now the maximum chord length used on curves.
 */
export function generateParallelOffsetLinesForCenterline(
  cl: Centerline,
  offsetFt: number,
  layer: string,
  lineType: string,
  polyPrefix: string,
  stepFt = 10,
): SurveyLine[] {
  const totalLen = calculateCenterlineLength(cl);
  if (totalLen <= 0 || (cl.pis?.length ?? 0) < 2) return [];

  const pis = cl.pis;
  const vertices: OffsetVertex[] = [];
  const firstBearing = Math.atan2(pis[1].easting - pis[0].easting, pis[1].northing - pis[0].northing);
  pushOffsetVertex(vertices, offsetVertexOnBearing(pis[0].easting, pis[0].northing, firstBearing, offsetFt));

  let last = { x: pis[0].easting, y: pis[0].northing };

  for (let i = 1; i < pis.length; i++) {
    const prev = pis[i - 1];
    const curr = pis[i];
    const curve = i < pis.length - 1 && curr.curveRadius
      ? calculateCurveGeometry(prev, curr, pis[i + 1], curr.curveRadius)
      : null;

    if (curve) {
      const inBearing = Math.atan2(curve.pcEasting - last.x, curve.pcNorthing - last.y);
      pushOffsetVertex(vertices, offsetVertexOnBearing(curve.pcEasting, curve.pcNorthing, inBearing, offsetFt));

      // Sample the arc in chords; tight radii get a smaller chord so they stay round.
      const chord = Math.max(2, Math.min(stepFt, curve.radius * 0.2));
      const steps = Math.max(2, Math.ceil(curve.L / chord));
      const offsetRadius = curve.radius - offsetFt * (curve.turnRight ? 1 : -1);
      // Azimuth convention matches calculatePointFromStationOffset: E = sin(angle), N = cos(angle).
      const startAngle = Math.atan2(curve.pcEasting - curve.centerEasting, curve.pcNorthing - curve.centerNorthing);
      for (let k = 1; k <= steps; k++) {
        const angle = startAngle + curve.delta * (k / steps);
        pushOffsetVertex(vertices, {
          x: curve.centerEasting + offsetRadius * Math.sin(angle),
          y: curve.centerNorthing + offsetRadius * Math.cos(angle),
        });
      }

      last = { x: curve.ptEasting, y: curve.ptNorthing };
      continue;
    }

    const inBearing = Math.atan2(curr.easting - last.x, curr.northing - last.y);
    if (i < pis.length - 1) {
      const outBearing = Math.atan2(pis[i + 1].easting - curr.easting, pis[i + 1].northing - curr.northing);
      pushOffsetVertex(vertices, miteredOffsetVertex(curr.easting, curr.northing, inBearing, outBearing, offsetFt));
    } else {
      pushOffsetVertex(vertices, offsetVertexOnBearing(curr.easting, curr.northing, inBearing, offsetFt));
    }
    last = { x: curr.easting, y: curr.northing };
  }

  const lines: SurveyLine[] = [];
  const polyId = `${polyPrefix}-${Date.now()}-${Math.round(offsetFt * 10)}`;
  for (let i = 0; i < vertices.length - 1; i++) {
    lines.push({
      id: `line-${polyId}-${i}`,
      from: `${polyPrefix}-${i}`,
      to: `${polyPrefix}-${i + 1}`,
      fromPt: { x: vertices[i].x, y: vertices[i].y, z: 0 },
      toPt: { x: vertices[i + 1].x, y: vertices[i + 1].y, z: 0 },
      layer,
      lineType,
      polylineId: polyId,
    });
  }
  return lines;
}

export function registerRoadingSkillHandlers(getDeps: () => RoadingHandlerDeps): () => void {
  const unsubs: Array<() => void> = [];

  // ── 1. roading_synthesize_existing ─────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('roading_synthesize_existing', async (message) => {
      const blocked = roadingExperimentalGate(message);
      if (blocked) return blocked;
      const deps = getDeps();
      const d = (message.data ?? {}) as Record<string, unknown>;

      const defaultRoadWidthProvided =
        typeof d.defaultRoadWidthFt === 'number' && Number.isFinite(d.defaultRoadWidthFt) && d.defaultRoadWidthFt > 0;
      const defaultRoadWidthFt = defaultRoadWidthProvided ? (d.defaultRoadWidthFt as number) : 24;

      // Every input is optional: draw from the loaded points/imagery/OSM first.
      // ROW is a legal limit, so it is never invented — when it is omitted the
      // pavement and centerline are drawn and V-ROAD-ROW is simply skipped.
      const rowWidthSpecified =
        typeof d.rowWidthFt === 'number' && Number.isFinite(d.rowWidthFt) && d.rowWidthFt > 0;
      const rowWidthFt = rowWidthSpecified ? (d.rowWidthFt as number) : 0;
      const useSurveyPoints = d.useSurveyPoints !== false;
      const useBackgroundImagery = d.useBackgroundImagery !== false;
      const useOsmWays = d.useOsmWays !== false;
      const syncCenterline = d.syncCenterline !== false;
      const clLayer = typeof d.clLayer === 'string' && d.clLayer.trim() ? d.clLayer.trim() : 'C-ROAD-CNTR';
      const edgeLayer = typeof d.edgeLayer === 'string' && d.edgeLayer.trim() ? d.edgeLayer.trim() : 'L-ROAD';
      const rowLayer = typeof d.rowLayer === 'string' && d.rowLayer.trim() ? d.rowLayer.trim() : 'V-ROAD-ROW';

      const bounds = computeProjectBounds(deps.points, deps.lines);
      const tiles = useBackgroundImagery ? (deps.canvas2dRef?.current?.getMapOverlayTiles?.() ?? []) : [];
      const offscreenCanvas = useBackgroundImagery ? renderMapTilesForRoading(tiles, bounds, 1024, 1024) : null;

      const res = await extractAuthoritativeRoads({
        bounds,
        projectEpsg: useOsmWays ? deps.settings.projection?.epsg : null,
        defaultRoadWidthFt,
        existingPoints: useSurveyPoints ? deps.points : [],
        clLayer,
        edgeLayer,
        canvas: offscreenCanvas,
      });

      let clCoordsList = [...res.roadCenterlines];
      let generatedLines = [...res.lines];
      const generatedPoints = [...res.points];
      const roadNames = [...res.roadNames];

      // Field evidence outranks the map, exactly as the Civil Drafter works.
      // When the shots define a consistent corridor, it is the ONLY road geometry
      // drawn. OSM ways and the legacy surveyed-corridor builder are suppressed so
      // duplicate or conflicting linework cannot stack on the canvas.
      const surveyCorridor = useSurveyPoints ? traceSurveyRoadCorridor(deps.points) : null;
      let effectiveWidthFt = defaultRoadWidthFt;
      let geometrySource: 'survey-shots' | 'osm' | 'project-fallback' = 'project-fallback';

      if (surveyCorridor) {
        effectiveWidthFt = surveyCorridor.widthFt;
        geometrySource = 'survey-shots';
        generatedLines = [
          ...emitChainLines(surveyCorridor.centerline, clLayer, ROAD_CENTERLINE_LINETYPE, 'road-survey-cl'),
          ...emitChainLines(surveyCorridor.edgeA, edgeLayer, 'CONTINUOUS', 'road-survey-edge-a'),
          ...emitChainLines(surveyCorridor.edgeB, edgeLayer, 'CONTINUOUS', 'road-survey-edge-b'),
        ];
        clCoordsList = [surveyCorridor.centerline];
        generatedPoints.length = 0;
        roadNames.length = 0;
        roadNames.push('Surveyed Road Corridor (ER/EP)');
      } else if (generatedLines.length > 0) {
        geometrySource = 'osm';
        // A project bbox commonly contains an entire street network. Roading
        // synthesizes the one frontage road the shots belong to — never every way.
        const primaryIdx = choosePrimaryRoadIndex(res.roadCenterlines, deps.points);
        const primaryIds = new Set([
          `road-cl-${primaryIdx + 1}`,
          `road-edge-left-${primaryIdx + 1}`,
          `road-edge-right-${primaryIdx + 1}`,
        ]);
        const primaryLines = res.lines.filter((line) => primaryIds.has(line.polylineId ?? ''));
        if (primaryLines.length > 0) {
          generatedLines = primaryLines;
          if (res.roadCenterlines[primaryIdx]) {
            clCoordsList = [res.roadCenterlines[primaryIdx]];
          }
        }
      }

      // Fallback: if neither OSM nor two-sided EP/ER points produced a road, synthesize from CL shots, single-side frontage EP shots, or project axis
      if (generatedLines.length === 0) {
        const pureClPoints = deps.points.filter(
          (p) =>
            Number.isFinite(p.easting) &&
            Number.isFinite(p.northing) &&
            CENTERLINE_SHOT.test(p.description || '') &&
            !EDGE_SHOT.test(p.description || '') &&
            !GENERATED_ROAD_POINT.test(p.pointNumber || ''),
        );
        const singleEdgePoints = deps.points.filter(
          (p) =>
            Number.isFinite(p.easting) &&
            Number.isFinite(p.northing) &&
            EDGE_SHOT.test(p.description || '') &&
            !GENERATED_ROAD_POINT.test(p.pointNumber || ''),
        );

        if (pureClPoints.length >= 2) {
          const byPn = new Map(pureClPoints.map((p) => [p.pointNumber, p]));
          const orderedPns = orderPointsAlongFeature(
            pureClPoints.map((p) => ({
              pointNumber: p.pointNumber,
              easting: p.easting,
              northing: p.northing,
            })),
          );
          const orderedClCoords = orderedPns
            .map((pn) => byPn.get(pn)!)
            .filter(Boolean)
            .map((p) => ({
              easting: p.easting,
              northing: p.northing,
              pointNumber: p.pointNumber,
              elevation: p.elevation,
              description: p.description,
            }));
          // Keep only the dominant contiguous CL run; a single far-off CL shot
          // must not stretch the road through the rest of the lot.
          const primaryClRun = longestChainRun(splitChainsAtGaps(orderedClCoords));
          geometrySource = 'survey-shots';
          clCoordsList = [primaryClRun];
          generatedLines.push(
            ...emitChainLines(primaryClRun, clLayer, ROAD_CENTERLINE_LINETYPE, 'road-survey-cl'),
            ...emitChainLines(offsetRoadPolyline(primaryClRun, defaultRoadWidthFt / 2), edgeLayer, 'CONTINUOUS', 'road-ep-lt'),
            ...emitChainLines(offsetRoadPolyline(primaryClRun, -defaultRoadWidthFt / 2), edgeLayer, 'CONTINUOUS', 'road-ep-rt'),
          );
          roadNames.push('Surveyed Road Corridor (CL)');
        } else if (singleEdgePoints.length >= 2) {
          const byPn = new Map(singleEdgePoints.map((p) => [p.pointNumber, p]));
          const orderedPns = orderPointsAlongFeature(
            singleEdgePoints.map((p) => ({
              pointNumber: p.pointNumber,
              easting: p.easting,
              northing: p.northing,
            })),
          );
          const nearEdgeCoords = longestChainRun(splitChainsAtGaps(
            orderedPns
              .map((pn) => byPn.get(pn)!)
              .filter(Boolean)
              .map((p) => ({
                easting: p.easting,
                northing: p.northing,
                pointNumber: p.pointNumber,
                elevation: p.elevation,
              })),
          ));

          // Orient streetward offset away from non-road lot interior points when available
          const nonRoadPts = deps.points.filter(
            (p) => Number.isFinite(p.easting) && Number.isFinite(p.northing) && !isPointRelevantForCorridor(p.description, 'road'),
          );
          const lotCenterE =
            nonRoadPts.length > 0
              ? nonRoadPts.reduce((s, p) => s + p.easting, 0) / nonRoadPts.length
              : (bounds.minE + bounds.maxE) / 2;
          const lotCenterN =
            nonRoadPts.length > 0
              ? nonRoadPts.reduce((s, p) => s + p.northing, 0) / nonRoadPts.length
              : (bounds.minN + bounds.maxN) / 2;

          const plusTest = offsetRoadPolyline(nearEdgeCoords, defaultRoadWidthFt / 2);
          const minusTest = offsetRoadPolyline(nearEdgeCoords, -defaultRoadWidthFt / 2);
          const midIdx = Math.floor(nearEdgeCoords.length / 2);
          const distPlus = Math.hypot(plusTest[midIdx].easting - lotCenterE, plusTest[midIdx].northing - lotCenterN);
          const distMinus = Math.hypot(minusTest[midIdx].easting - lotCenterE, minusTest[midIdx].northing - lotCenterN);
          const sign = distPlus >= distMinus ? 1 : -1;

          const clCoords = offsetRoadPolyline(nearEdgeCoords, sign * (defaultRoadWidthFt / 2));
          const farEdgeCoords = offsetRoadPolyline(nearEdgeCoords, sign * defaultRoadWidthFt);
          geometrySource = 'survey-shots';
          clCoordsList = [clCoords];
          generatedLines.push(
            ...emitChainLines(clCoords, clLayer, ROAD_CENTERLINE_LINETYPE, 'road-survey-cl'),
            ...emitChainLines(nearEdgeCoords, edgeLayer, 'CONTINUOUS', 'road-survey-edge-a'),
            ...emitChainLines(farEdgeCoords, edgeLayer, 'CONTINUOUS', 'road-survey-edge-b'),
          );
          roadNames.push('Surveyed Road Corridor (ER/EP)');
        } else {
          const seedPts = deps.points.slice(0, 2);
          const p0 = seedPts[0] ?? { easting: bounds.minE + 40, northing: (bounds.minN + bounds.maxN) / 2, elevation: 0 };
          const p1 = seedPts[seedPts.length - 1] ?? { easting: bounds.maxE - 40, northing: (bounds.minN + bounds.maxN) / 2, elevation: 0 };
          const fallbackClCoords =
            seedPts.length >= 2
              ? seedPts.map((p) => ({ easting: p.easting, northing: p.northing }))
              : [
                  { easting: p0.easting, northing: p0.northing },
                  { easting: p1.easting, northing: p1.northing },
                ];
          clCoordsList = [fallbackClCoords];
          const tempCl = buildCenterlineFromVertices(fallbackClCoords, 'Synthesized Road CL');
          generatedLines.push(
            ...generateParallelOffsetLinesForCenterline(tempCl, 0, clLayer, ROAD_CENTERLINE_LINETYPE, 'road-cl'),
            ...generateParallelOffsetLinesForCenterline(tempCl, -defaultRoadWidthFt / 2, edgeLayer, 'CONTINUOUS', 'road-ep-lt'),
            ...generateParallelOffsetLinesForCenterline(tempCl, defaultRoadWidthFt / 2, edgeLayer, 'CONTINUOUS', 'road-ep-rt'),
          );
          roadNames.push('Synthesized Road Corridor');
        }
      }

      // Sync primary centerline to Stationing & CL
      let syncedCenterlineId: string | undefined;
      const primaryCoords = clCoordsList[0];

      // Obtain the real street name for the drawn alignment from OSM so a road
      // drafted from survey shots is labeled automatically. Name lookup is
      // best-effort: offline projects still draw the corridor.
      let fetchedStreetLabels: StreetLabel[] = [];
      if (useOsmWays && deps.setStreetLabels && primaryCoords && primaryCoords.length >= 2) {
        try {
          const { fetchRoadLabelsAlongAlignment } = await import('./streetNameService.ts');
          fetchedStreetLabels = await fetchRoadLabelsAlongAlignment(
            primaryCoords.map((coord) => ({ x: coord.easting, y: coord.northing })),
            deps.settings.projection?.epsg,
            {
              toleranceFt: Math.max(40, effectiveWidthFt * 2),
              maxLabels: 1,
              existingLabels: deps.streetLabels ?? [],
            },
          );
        } catch {
          // Keep the locally synthesized name when the streets service is unavailable.
        }
      }
      const fetchedRoadName = fetchedStreetLabels[0]?.text?.trim();
      if (
        fetchedRoadName &&
        !roadNames.some((existingName) => existingName.trim().toLowerCase() === fetchedRoadName.toLowerCase())
      ) {
        roadNames.unshift(fetchedRoadName);
      }

      let primaryCl: Centerline | undefined;
      if (primaryCoords && primaryCoords.length >= 2) {
        const clName = roadNames[0] || 'Synthesized Road CL';
        const pointStartStation = surveyCorridor?.beginStation
          ?? resolveBeginStation(undefined, (primaryCoords[0] as { description?: string } | undefined)?.description);
        primaryCl = buildCenterlineFromVertices(primaryCoords, clName, 'cl-road', pointStartStation);
        syncedCenterlineId = primaryCl.id;
        if (syncCenterline && deps.setCenterlines) {
          const toSync = primaryCl;
          deps.setCenterlines((prev) => [toSync, ...prev.filter((c) => c.name !== toSync.name)]);
        }

        // Emit ROW lines if requested
        if (rowWidthSpecified) {
          generatedLines.push(
            ...generateParallelOffsetLinesForCenterline(primaryCl, -rowWidthFt / 2, rowLayer, 'DASHED', 'road-row-lt'),
            ...generateParallelOffsetLinesForCenterline(primaryCl, rowWidthFt / 2, rowLayer, 'DASHED', 'road-row-rt'),
          );
        }

        // Place the OSM-derived label on the drawn alignment. Fall back to the
        // synthesis name only when no existing road was matched.
        if (deps.setStreetLabels) {
          if (fetchedStreetLabels.length > 0) {
            deps.setStreetLabels((prev) => [...prev, ...fetchedStreetLabels]);
          } else if (roadNames.length > 0) {
            const labelText = roadNames[0];
            const alreadyPlaced = (deps.streetLabels ?? []).some(
              (label) => label.text.trim().toLowerCase() === labelText.trim().toLowerCase(),
            );
            if (!alreadyPlaced) {
              const midIdx = Math.floor(primaryCoords.length / 2);
              const m0 = primaryCoords[Math.max(0, midIdx - 1)];
              const m1 = primaryCoords[Math.min(primaryCoords.length - 1, midIdx + 1)];
              const angleDeg = (Math.atan2(m1.northing - m0.northing, m1.easting - m0.easting) * 180) / Math.PI;
              const newLabel: StreetLabel = {
                x: primaryCoords[midIdx].easting,
                y: primaryCoords[midIdx].northing,
                text: labelText,
                angle: angleDeg,
              };
              deps.setStreetLabels((prev) => [...prev, newLabel]);
            }
          }
        }
      }

      // ── CIVIL DRAFTER · MULTI-TAKE ROAD REVIEW ──────────────────────────
      // Imagery-free civil-sense pass. Continuity, crossings, stubs, duplicate
      // lines and alignment grounding are checked before the take reaches the
      // canvas, so a clean synthesis does not depend on having usable imagery.
      if (generatedLines.length > 0) {
        try {
          const canvasGrounding = extractRoadGrounding(deps.lines);
          const review = runRoadTakeReview(generatedLines, {
            parcelLines: canvasGrounding.parcelLines,
            osmWays: [
              ...(canvasGrounding.osmWays ?? []),
              ...res.roadCenterlines.slice(0, 8).map((vertices, index) => ({
                name: res.roadNames[index] || `OSM road ${index + 1}`,
                vertices: vertices.map(vertex => ({ easting: vertex.easting, northing: vertex.northing })),
                source: 'osm' as const,
              })),
            ],
          }, { maxTakes: 3 });
          deps.logActionToFieldbook(formatRoadTakeSummary(review.report));
          for (const repair of review.report.repairs) {
            deps.logActionToFieldbook(`  • ${repair}`);
          }
          if (review.report.remaining.length > 0) {
            deps.logActionToFieldbook(`  ! Take still needs a redraw: ${review.report.remaining.slice(0, 5).join(' | ')}`);
          }
          if (review.changed) generatedLines = review.lines;
        } catch (reviewErr) {
          console.warn('[RoadingTakeReview] review pass failed:', reviewErr);
        }
      }

      // ── GIMBAL VISION · SYNTHESIS QA (PASS 2) ────────────────────────────
      // Audit the synthesized corridor against the active background imagery
      // before it reaches the canvas. A centreline that leaves the pavement or
      // an edge drawn through the road bed is snapped back to image truth; the
      // pass is evidence-gated and never rewrites a clean synthesis.
      if (generatedLines.length > 0 && tiles.length > 0) {
        try {
          const qa = verifySynthesizedLinework(generatedLines, { bounds, mapTiles: tiles });
          if (qa.report.status === 'unverified') {
            // Say WHY the image was unusable — usually tree canopy over the road.
            deps.logActionToFieldbook(formatSynthesisQaSummary(qa.report));
          } else {
            deps.logActionToFieldbook(formatSynthesisQaSummary(qa.report));
            for (const repair of qa.report.repairs) {
              deps.logActionToFieldbook(`  • ${repair}`);
            }
            if (qa.changed) generatedLines = qa.lines;
          }
        } catch (qaErr) {
          console.warn('[RoadingSynthesisQA] verification pass failed:', qaErr);
        }
      }

      if (generatedLines.length > 0) {
        // Re-running synthesis replaces only prior roading-generated linework
        // (polyline IDs `road-...`). The old tangled corridor must not remain on
        // the canvas beside the clean rebuild; design corridors (`corridor-...`)
        // and user linework are left alone.
        deps.setLines((prev) => [
          ...prev.filter((line) => !(line.polylineId ?? '').startsWith('road-')),
          ...generatedLines,
        ]);
      }

      const corridorId = `road-synth-${Date.now()}`;
      const corridorRun: RoadCorridorRun = {
        id: corridorId,
        name: roadNames[0] || 'Existing Road Synthesis',
        mode: 'existing-synthesis',
        centerlineId: syncedCenterlineId,
        typicalSection: {
          laneCount: 2,
          laneWidthFt: effectiveWidthFt / 2,
          crownSlopePct: 2.0,
          includeCurbAndGutter: false,
          curbWidthFt: 0.5,
          gutterWidthFt: 1.5,
          includeSidewalk: false,
          sidewalkWidthFt: 5,
          sidewalkOffsetFt: 4,
          rowWidthFt,
          stationIntervalFt: 50,
        },
        drawnPointIds: generatedPoints.map((p) => p.pointNumber),
        drawnLineIds: generatedLines.map((l) => l.id || '').filter(Boolean),
        roadNames,
        createdAt: new Date().toISOString(),
      };

      deps.setRoadCorridors?.((prev) => [...prev, corridorRun]);

      // Record ROW/width fact in KnowledgeBase
      knowledgeBase.recordFact({
        category: 'deed.row',
        subject: roadNames[0] || 'Frontage Road',
        predicate: 'pavementWidth',
        value: effectiveWidthFt,
        units: 'ft',
        source: AgentType.ROADING_AGENT,
        confidence: 0.9,
      });

      deps.logActionToFieldbook(
        `Roading Agent: synthesized existing road "${corridorRun.name}" (${generatedLines.length} segments, width ${effectiveWidthFt} ft${rowWidthSpecified ? `, ${rowWidthFt} ft ROW` : ', ROW width not specified \u2014 no ROW lines drawn'}${syncedCenterlineId ? ', synced to Stationing & CL' : ''}).`,
      );

      return respond(message, true, {
        corridorId,
        addedPoints: generatedPoints.length,
        rowLinesDrawn: rowWidthSpecified,
        notice: rowWidthSpecified
          ? undefined
          : 'Drawn from the available points/imagery without ROW lines. Supply the deeded right-of-way width to add V-ROAD-ROW lines without redrawing the pavement.',
        addedLines: generatedLines.length,
        centerlineId: syncedCenterlineId,
        roadNames,
        streetNames: fetchedStreetLabels.map((label) => label.text),
        streetLabelsPlaced: fetchedStreetLabels.length,
        effectiveWidthFt,
        geometrySource,
      });
    }),
  );

  // ── 2. roading_design_corridor ─────────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('roading_design_corridor', async (message) => {
      const blocked = roadingExperimentalGate(message);
      if (blocked) return blocked;
      const deps = getDeps();
      const d = (message.data ?? {}) as Record<string, unknown>;

      const requestedName = typeof d.name === 'string' && d.name.trim() ? d.name.trim() : '';
      let name = requestedName || 'Proposed Road A';
      // Typical-section inputs are optional. Draw immediately with conventional
      // defaults; the user can refine any value on a later pass.
      const laneCount =
        typeof d.laneCount === 'number' && Number.isFinite(d.laneCount) && d.laneCount >= 1
          ? Math.round(d.laneCount)
          : 2;
      const laneWidthFt =
        typeof d.laneWidthFt === 'number' && Number.isFinite(d.laneWidthFt) && d.laneWidthFt > 0
          ? d.laneWidthFt
          : 12;
      const crownSlopePct = typeof d.crownSlopePct === 'number' ? d.crownSlopePct : 2.0;
      const includeCurbAndGutter = d.includeCurbAndGutter !== false;
      const curbWidthFt = typeof d.curbWidthFt === 'number' && d.curbWidthFt >= 0 ? d.curbWidthFt : 0.5;
      const gutterWidthFt = typeof d.gutterWidthFt === 'number' && d.gutterWidthFt >= 0 ? d.gutterWidthFt : 1.5;
      const includeSidewalk = d.includeSidewalk === true;
      const sidewalkWidthFt = typeof d.sidewalkWidthFt === 'number' && d.sidewalkWidthFt > 0 ? d.sidewalkWidthFt : 5.0;
      const sidewalkOffsetFt = typeof d.sidewalkOffsetFt === 'number' && d.sidewalkOffsetFt >= 0 ? d.sidewalkOffsetFt : 4.0;
      // ROW is never invented: an omitted width simply skips V-ROAD-ROW.
      const rowWidthSpecified =
        typeof d.rowWidthFt === 'number' && Number.isFinite(d.rowWidthFt) && d.rowWidthFt > 0;
      const rowWidthFt = rowWidthSpecified ? (d.rowWidthFt as number) : 0;
      const stationIntervalFt =
        typeof d.stationIntervalFt === 'number' && d.stationIntervalFt > 0 ? d.stationIntervalFt : 50;
      const designGradePct = typeof d.designGradePct === 'number' ? d.designGradePct : undefined;
      const autoGenerateProfile = d.autoGenerateProfile !== false;

      // 1. Resolve or create the target horizontal Centerline
      let targetCl: Centerline | undefined;
      const clIdArg = typeof d.centerlineId === 'string' ? d.centerlineId.trim() : '';
      if (clIdArg) {
        targetCl = deps.centerlines.find(
          (c) => c.id === clIdArg || c.name.toLowerCase() === clIdArg.toLowerCase(),
        );
      }

      if (!targetCl && Array.isArray(d.pointNumbers) && d.pointNumbers.length >= 2) {
        const pns = (d.pointNumbers as unknown[]).map(String);
        const matchedPts = pns
          .map((pn) => deps.points.find((p) => p.pointNumber === pn))
          .filter((p): p is SurveyPoint => Boolean(p));
        if (matchedPts.length >= 2) {
          // Fit real curves through the shot chain instead of forcing a sharp PI
          // at every surveyed vertex.
          targetCl = buildCenterlineFromVertices(
            matchedPts.map((pt) => ({ easting: pt.easting, northing: pt.northing })),
            name,
            'cl-road',
            resolveBeginStation(undefined, matchedPts[0].description),
          );
          deps.setCenterlines?.((prev) => [targetCl!, ...prev]);
        }
      }

      if (!targetCl) {
        targetCl = deps.centerlines.find((c) => (c.pis?.length ?? 0) >= 2 && calculateCenterlineLength(c) > 0);
      }

      // Fallback: create a centerline across the project bounds or first two points
      if (!targetCl) {
        const bounds = computeProjectBounds(deps.points, deps.lines);
        const p0 = deps.points[0] ?? {
          pointNumber: 'POB',
          easting: bounds.minE + 50,
          northing: (bounds.minN + bounds.maxN) / 2,
        };
        const p1 = deps.points[1] ?? {
          pointNumber: 'END',
          easting: bounds.maxE - 50,
          northing: (bounds.minN + bounds.maxN) / 2,
        };
        targetCl = {
          id: `cl-road-${Date.now()}`,
          name,
          beginStation: resolveBeginStation(undefined, (p0 as { description?: string }).description),
          pis: [
            { id: `pi-${Date.now()}-0`, pointNumber: p0.pointNumber || 'POB', northing: p0.northing, easting: p0.easting },
            { id: `pi-${Date.now()}-1`, pointNumber: p1.pointNumber || 'END', northing: p1.northing, easting: p1.easting },
          ],
        };
        deps.setCenterlines?.((prev) => [targetCl!, ...prev]);
      }

      const totalTravelWidth = laneCount * laneWidthFt;
      const halfTravel = totalTravelWidth / 2;
      const newLines: SurveyLine[] = [];
      const layersCreated = new Set<string>(['C-ROAD-CNTR', 'L-ROAD']);

      // Centerline & Travelway Edges
      newLines.push(
        ...generateParallelOffsetLinesForCenterline(targetCl, 0, 'C-ROAD-CNTR', ROAD_CENTERLINE_LINETYPE, 'corridor-cl'),
        ...generateParallelOffsetLinesForCenterline(targetCl, -halfTravel, 'L-ROAD', 'CONTINUOUS', 'corridor-ep-lt'),
        ...generateParallelOffsetLinesForCenterline(targetCl, halfTravel, 'L-ROAD', 'CONTINUOUS', 'corridor-ep-rt'),
      );

      // Multi-lane interior striping when laneCount > 2
      if (laneCount > 2) {
        layersCreated.add('C-ROAD-LANE');
        for (let laneIdx = 1; laneIdx < laneCount / 2; laneIdx++) {
          const off = laneIdx * laneWidthFt;
          newLines.push(
            ...generateParallelOffsetLinesForCenterline(targetCl, -off, 'C-ROAD-LANE', 'DASHED', `corridor-lane-lt-${laneIdx}`),
            ...generateParallelOffsetLinesForCenterline(targetCl, off, 'C-ROAD-LANE', 'DASHED', `corridor-lane-rt-${laneIdx}`),
          );
        }
      }

      // Curb & Gutter
      let outerCurbOffset = halfTravel;
      if (includeCurbAndGutter && (gutterWidthFt > 0 || curbWidthFt > 0)) {
        layersCreated.add('V-ROAD-CURB');
        const faceOfCurb = halfTravel + gutterWidthFt;
        const backOfCurb = faceOfCurb + curbWidthFt;
        outerCurbOffset = backOfCurb;
        newLines.push(
          ...generateParallelOffsetLinesForCenterline(targetCl, -faceOfCurb, 'V-ROAD-CURB', 'CONTINUOUS', 'corridor-foc-lt'),
          ...generateParallelOffsetLinesForCenterline(targetCl, faceOfCurb, 'V-ROAD-CURB', 'CONTINUOUS', 'corridor-foc-rt'),
          ...generateParallelOffsetLinesForCenterline(targetCl, -backOfCurb, 'V-ROAD-CURB', 'CONTINUOUS', 'corridor-boc-lt'),
          ...generateParallelOffsetLinesForCenterline(targetCl, backOfCurb, 'V-ROAD-CURB', 'CONTINUOUS', 'corridor-boc-rt'),
        );
      }

      // Sidewalks
      if (includeSidewalk && sidewalkWidthFt > 0) {
        layersCreated.add('V-SITE-SWLK');
        const swInner = outerCurbOffset + sidewalkOffsetFt;
        const swOuter = swInner + sidewalkWidthFt;
        newLines.push(
          ...generateParallelOffsetLinesForCenterline(targetCl, -swInner, 'V-SITE-SWLK', 'CONTINUOUS', 'corridor-sw-in-lt'),
          ...generateParallelOffsetLinesForCenterline(targetCl, swInner, 'V-SITE-SWLK', 'CONTINUOUS', 'corridor-sw-in-rt'),
          ...generateParallelOffsetLinesForCenterline(targetCl, -swOuter, 'V-SITE-SWLK', 'CONTINUOUS', 'corridor-sw-out-lt'),
          ...generateParallelOffsetLinesForCenterline(targetCl, swOuter, 'V-SITE-SWLK', 'CONTINUOUS', 'corridor-sw-out-rt'),
        );
      }

      // Right-of-Way (ROW)
      if (rowWidthSpecified) {
        layersCreated.add('V-ROAD-ROW');
        const halfRow = rowWidthFt / 2;
        newLines.push(
          ...generateParallelOffsetLinesForCenterline(targetCl, -halfRow, 'V-ROAD-ROW', 'DASHED', 'corridor-row-lt'),
          ...generateParallelOffsetLinesForCenterline(targetCl, halfRow, 'V-ROAD-ROW', 'DASHED', 'corridor-row-rt'),
        );
      }

      // Stationed template points along CL and pavement edges
      const totalLen = calculateCenterlineLength(targetCl);
      const endSta = targetCl.beginStation + totalLen;

      // Resolve the existing street name along this alignment while the
      // stationing work runs. The label is placed once the corridor is drawn.
      const nameSampleStep = Math.max(10, Math.min(stationIntervalFt, 25));
      const alignmentSamples: Array<{ x: number; y: number }> = [];
      for (let s = targetCl.beginStation; s <= endSta + 0.01; s += nameSampleStep) {
        const sample = calculatePointFromStationOffset(targetCl, Math.min(s, endSta), 0);
        if (sample) alignmentSamples.push({ x: sample.easting, y: sample.northing });
      }
      const roadNameLookup: Promise<StreetLabel[]> =
        deps.setStreetLabels && alignmentSamples.length >= 2
          ? (async () => {
              try {
                const { fetchRoadLabelsAlongAlignment } = await import('./streetNameService.ts');
                return await fetchRoadLabelsAlongAlignment(
                  alignmentSamples,
                  deps.settings.projection?.epsg,
                  {
                    toleranceFt: Math.max(40, totalTravelWidth / 2 + 30),
                    maxLabels: 1,
                    existingLabels: deps.streetLabels ?? [],
                  },
                );
              } catch {
                return [];
              }
            })()
          : Promise.resolve([]);

      const generatedPts: SurveyPoint[] = [];
      let nextPn = deps.points.length + 1001;
      try {
        const stationsCount = Math.max(2, Math.floor(totalLen / stationIntervalFt) + 2);
        const peerResp = await interAgentComm.askPeer(
          AgentType.POINT_EDITOR,
          'request_next_point_number',
          { count: stationsCount * 3 },
          { timeoutMs: 1500 },
        );
        if (peerResp?.success && Array.isArray((peerResp.data as any)?.numbers)) {
          const first = parseInt((peerResp.data as any).numbers[0], 10);
          if (Number.isFinite(first)) nextPn = first;
        }
      } catch {
        // Use fallback sequence
      }

      const baseElev = deps.points.find((p) => Number.isFinite(p.elevation))?.elevation ?? 100;
      for (let s = targetCl.beginStation; s <= endSta + 0.01; s += stationIntervalFt) {
        const sta = Math.min(s, endSta);
        const distFromStart = sta - targetCl.beginStation;
        const clElev =
          designGradePct !== undefined
            ? parseFloat((baseElev + (distFromStart * designGradePct) / 100).toFixed(2))
            : baseElev;
        const edgeElev = parseFloat((clElev - (halfTravel * crownSlopePct) / 100).toFixed(2));

        const clCoord = calculatePointFromStationOffset(targetCl, sta, 0);
        const ltCoord = calculatePointFromStationOffset(targetCl, sta, -halfTravel);
        const rtCoord = calculatePointFromStationOffset(targetCl, sta, halfTravel);

        if (clCoord) {
          generatedPts.push({
            pointNumber: String(nextPn++),
            northing: clCoord.northing,
            easting: clCoord.easting,
            elevation: clElev,
            description: `ROAD CL STA ${formatStation(sta)}`,
            layer: 'C-ROAD-CNTR',
          });
        }
        if (ltCoord) {
          generatedPts.push({
            pointNumber: String(nextPn++),
            northing: ltCoord.northing,
            easting: ltCoord.easting,
            elevation: edgeElev,
            description: `EP LT STA ${formatStation(sta)}`,
            layer: 'L-ROAD',
          });
        }
        if (rtCoord) {
          generatedPts.push({
            pointNumber: String(nextPn++),
            northing: rtCoord.northing,
            easting: rtCoord.easting,
            elevation: edgeElev,
            description: `EP RT STA ${formatStation(sta)}`,
            layer: 'L-ROAD',
          });
        }
        if (sta >= endSta) break;
      }

      deps.setLines((prev) => [...prev, ...newLines]);

      // Place the existing road's name on the drawing, then name the run and
      // point list from it unless the user supplied an explicit corridor name.
      const obtainedStreetLabels = await roadNameLookup;
      if (obtainedStreetLabels.length > 0 && deps.setStreetLabels) {
        const existingNames = new Set(
          (deps.streetLabels ?? []).map((label) => label.text.trim().toLowerCase()),
        );
        const labelsToAdd = obtainedStreetLabels.filter(
          (label) => !existingNames.has(label.text.trim().toLowerCase()),
        );
        if (labelsToAdd.length > 0) {
          deps.setStreetLabels((prev) => [...prev, ...labelsToAdd]);
        }
      }
      const resolvedName = requestedName || obtainedStreetLabels[0]?.text?.trim() || name;
      name = resolvedName;

      if (generatedPts.length > 0) {
        deps.setPointLists((prev) => {
          const listId = `road-corridor-${targetCl!.id}`;
          const filtered = prev.filter((l) => l.id !== listId);
          return [
            ...filtered,
            {
              id: listId,
              name: `Road: ${name}`,
              points: generatedPts,
              isVisible: true,
            },
          ];
        });
      }

      // Coordinate with Profile Agent if autoGenerateProfile is enabled
      let profileGenerated = false;
      if (autoGenerateProfile && targetCl.pis.length >= 2) {
        const firstPi = targetCl.pis[0];
        const lastPi = targetCl.pis[targetCl.pis.length - 1];
        const pStart: SurveyPoint = {
          pointNumber: firstPi.pointNumber || 'CL-START',
          northing: firstPi.northing,
          easting: firstPi.easting,
          elevation: baseElev,
        };
        const pEnd: SurveyPoint = {
          pointNumber: lastPi.pointNumber || 'CL-END',
          northing: lastPi.northing,
          easting: lastPi.easting,
          elevation:
            designGradePct !== undefined
              ? parseFloat((baseElev + (totalLen * designGradePct) / 100).toFixed(2))
              : baseElev,
        };
        const contourSegments = deps.lines.filter((l) => l.type?.startsWith('contour'));
        const profPts = generateProfile(pStart, pEnd, [...deps.points, ...generatedPts], contourSegments);
        if (profPts.length > 0) {
          deps.setProfileData(profPts);
          deps.setProfileInfo({ name: `${name} CL Profile`, type: 'centerline' });
          profileGenerated = true;
        }
      }

      const typicalSection: RoadTypicalSection = {
        laneCount,
        laneWidthFt,
        crownSlopePct,
        includeCurbAndGutter,
        curbWidthFt,
        gutterWidthFt,
        includeSidewalk,
        sidewalkWidthFt,
        sidewalkOffsetFt,
        rowWidthFt,
        stationIntervalFt,
        designGradePct,
      };

      const corridorId = `road-design-${Date.now()}`;
      const run: RoadCorridorRun = {
        id: corridorId,
        name,
        mode: 'corridor-design',
        centerlineId: targetCl.id,
        typicalSection,
        drawnPointIds: generatedPts.map((p) => p.pointNumber),
        drawnLineIds: newLines.map((l) => l.id || '').filter(Boolean),
        roadNames: obtainedStreetLabels.length > 0 ? obtainedStreetLabels.map((label) => label.text) : undefined,
        profileGenerated,
        createdAt: new Date().toISOString(),
      };
      deps.setRoadCorridors?.((prev) => [...prev, run]);

      deps.logActionToFieldbook(
        `Roading Agent: designed "${name}" corridor (${totalTravelWidth}' travelway, ${rowWidthSpecified ? `${rowWidthFt}' ROW` : 'ROW width not specified \u2014 no ROW lines drawn'}, ${newLines.length} segments, ${generatedPts.length} stationed points).`,
      );

      return respond(message, true, {
        corridorId,
        corridorName: name,
        centerlineId: targetCl.id,
        roadNames: obtainedStreetLabels.map((label) => label.text),
        streetLabelsPlaced: obtainedStreetLabels.length,
        totalWidthFt: totalTravelWidth,
        rowWidthFt,
        addedPoints: generatedPts.length,
        rowLinesDrawn: rowWidthSpecified,
        notice: rowWidthSpecified
          ? undefined
          : 'Drawn from the available points/imagery without ROW lines. Supply the deeded right-of-way width to add V-ROAD-ROW lines without redrawing the pavement.',
        addedLines: newLines.length,
        layersCreated: Array.from(layersCreated),
        profileGenerated,
      });
    }),
  );

  // ── 3. roading_generate_profile_and_sections ───────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('roading_generate_profile_and_sections', async (message) => {
      const blocked = roadingExperimentalGate(message);
      if (blocked) return blocked;
      const deps = getDeps();
      const d = (message.data ?? {}) as Record<string, unknown>;

      const clId = typeof d.centerlineId === 'string' ? d.centerlineId.trim() : '';
      const cl =
        deps.centerlines.find((c) => c.id === clId || c.name.toLowerCase() === clId.toLowerCase()) ??
        deps.centerlines[0];

      if (!cl || (cl.pis?.length ?? 0) < 2) {
        return respond(
          message,
          false,
          undefined,
          'No active road centerline found. Synthesize an existing road or design a road alignment first.',
        );
      }

      const sampleIntervalFt =
        typeof d.sampleIntervalFt === 'number' && d.sampleIntervalFt > 0 ? d.sampleIntervalFt : 25;
      const halfWidthFt = typeof d.halfWidthFt === 'number' && d.halfWidthFt > 0 ? d.halfWidthFt : 30;
      const designGradePct = typeof d.designGradePct === 'number' ? d.designGradePct : undefined;

      const firstPi = cl.pis[0];
      const lastPi = cl.pis[cl.pis.length - 1];
      const totalLen = calculateCenterlineLength(cl);
      const baseElev = deps.points.find((p) => Number.isFinite(p.elevation))?.elevation ?? 100;

      const fromPt: SurveyPoint = {
        pointNumber: firstPi.pointNumber || 'CL-START',
        northing: firstPi.northing,
        easting: firstPi.easting,
        elevation: baseElev,
      };
      const toPt: SurveyPoint = {
        pointNumber: lastPi.pointNumber || 'CL-END',
        northing: lastPi.northing,
        easting: lastPi.easting,
        elevation:
          designGradePct !== undefined
            ? parseFloat((baseElev + (totalLen * designGradePct) / 100).toFixed(2))
            : baseElev,
      };

      const contourSegments = deps.lines.filter((l) => l.type?.startsWith('contour'));
      const profilePts = generateProfile(fromPt, toPt, deps.points, contourSegments);
      deps.setProfileData(profilePts);
      deps.setProfileInfo({ name: `${cl.name} Road Profile`, type: 'centerline' });

      // Also invoke Profile Agent's cross section skill at midpoint station
      const midSta = cl.beginStation + totalLen / 2;
      try {
        await interAgentComm.askPeer(
          AgentType.PROFILE_AGENT,
          'generate_cross_section',
          {
            centerlineId: cl.id,
            station: formatStation(midSta),
            leftOffset: halfWidthFt,
            rightOffset: halfWidthFt,
            interval: 5,
          },
          { timeoutMs: 2000 },
        );
      } catch {
        // Non-fatal if Profile Agent handler not needed
      }

      const elevations = profilePts.map((p) => p.elevation);
      const minElevation = elevations.length > 0 ? Math.min(...elevations) : baseElev;
      const maxElevation = elevations.length > 0 ? Math.max(...elevations) : baseElev;
      const crossSectionCount = Math.max(1, Math.floor(totalLen / sampleIntervalFt) + 1);

      deps.logActionToFieldbook(
        `Roading Agent: generated road centerline profile (${profilePts.length} samples) and ${crossSectionCount} cross sections along "${cl.name}".`,
      );

      return respond(message, true, {
        sampleCount: profilePts.length,
        lengthFt: Math.round(totalLen * 100) / 100,
        minElevation,
        maxElevation,
        crossSectionCount,
      });
    }),
  );

  // ── 4. roading_add_culdesac_or_fillet ──────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('roading_add_culdesac_or_fillet', async (message) => {
      const blocked = roadingExperimentalGate(message);
      if (blocked) return blocked;
      const deps = getDeps();
      const d = (message.data ?? {}) as Record<string, unknown>;

      const featureKind =
        typeof d.featureKind === 'string' &&
        ['cul-de-sac', 'driveway-apron', 'intersection-fillet'].includes(d.featureKind)
          ? (d.featureKind as 'cul-de-sac' | 'driveway-apron' | 'intersection-fillet')
          : 'cul-de-sac';

      if (featureKind === 'driveway-apron') {
        const drivewayWidthFt =
          typeof d.drivewayWidthFt === 'number' && d.drivewayWidthFt > 0 ? d.drivewayWidthFt : 14;
        const bounds = computeProjectBounds(deps.points, deps.lines);
        const roadEdgeLines = deps.lines.filter((l) => l.layer === 'L-ROAD' && l.fromPt && l.toPt && !l.hidden);
        const byPolyline = new Map<string, SurveyLine[]>();
        for (const line of roadEdgeLines) {
          const key = line.polylineId || line.layer || 'L-ROAD';
          const group = byPolyline.get(key);
          if (group) group.push(line);
          else byPolyline.set(key, [line]);
        }
        // One chain per pavement edge — never one flattened line through every shot.
        const roadEdges = [...byPolyline.values()].map((chain) =>
          [chain[0].fromPt!, ...chain.map((line) => line.toPt!)].map((pt) => ({
            easting: pt.x,
            northing: pt.y,
          })),
        );

        const dwRes = synthesizeDrivewayToHouse({
          roadEdges,
          controlPoints: deps.points,
          bounds,
          drivewayWidthFt,
          clLayer: 'L-DRIVEWAY-CL',
          edgeLayer: 'L-DRIVEWAY',
        });

        if (dwRes.lines.length > 0) {
          deps.setLines((prev) => [...prev, ...dwRes.lines]);
        }
        deps.logActionToFieldbook(
          `Roading Agent: synthesized ${drivewayWidthFt}' driveway apron tie-in (${dwRes.lines.length} segments).`,
        );
        return respond(message, true, {
          featureKind,
          addedLines: dwRes.lines.length,
          addedPoints: dwRes.points.length,
          layer: 'L-DRIVEWAY',
        });
      }

      // Cul-de-sac bulb or real intersection curb return at the alignment terminus
      const clId = typeof d.centerlineId === 'string' ? d.centerlineId.trim() : '';
      const cl =
        deps.centerlines.find((c) => c.id === clId || c.name.toLowerCase() === clId.toLowerCase()) ??
        deps.centerlines[0];

      const bounds = computeProjectBounds(deps.points, deps.lines);
      const atEnd = d.atEnd !== false;
      const bulbRadiusFt = typeof d.bulbRadiusFt === 'number' && d.bulbRadiusFt > 0 ? d.bulbRadiusFt : 45;
      const rowBulbRadiusFt =
        typeof d.rowBulbRadiusFt === 'number' && d.rowBulbRadiusFt > 0 ? d.rowBulbRadiusFt : bulbRadiusFt + 10;
      const corridor = deps.roadCorridors?.find((run) => run.centerlineId === cl?.id);
      const pavementHalfWidthFt =
        typeof d.pavementHalfWidthFt === 'number' && d.pavementHalfWidthFt > 0
          ? d.pavementHalfWidthFt
          : corridor
            ? (corridor.typicalSection.laneCount * corridor.typicalSection.laneWidthFt) / 2
            : 12;
      const rowHalfWidthFt =
        typeof d.rowHalfWidthFt === 'number' && d.rowHalfWidthFt > 0
          ? d.rowHalfWidthFt
          : corridor && corridor.typicalSection.rowWidthFt > 0
            ? corridor.typicalSection.rowWidthFt / 2
            : pavementHalfWidthFt + 10;

      // Draw a true curb-return fillet at a PI. The previous implementation
      // ignored this feature kind and dropped a full circle in the middle of the
      // alignment, which is why road intersections read as blobs.
      if (featureKind === 'intersection-fillet') {
        if (!cl || cl.pis.length < 3) {
          return respond(
            message,
            false,
            undefined,
            'An intersection fillet needs a centerline with at least one interior PI. Build the alignment in Stationing & CL first.',
          );
        }
        const filletRadiusFt =
          typeof d.filletRadiusFt === 'number' && d.filletRadiusFt > 0 ? d.filletRadiusFt : 25;
        const piIndex = Math.max(
          1,
          Math.min(
            cl.pis.length - 2,
            typeof d.piIndex === 'number' ? Math.round(d.piIndex) : atEnd ? cl.pis.length - 2 : 1,
          ),
        );
        const curve = calculateCurveGeometry(
          cl.pis[piIndex - 1],
          cl.pis[piIndex],
          cl.pis[piIndex + 1],
          filletRadiusFt,
        );
        if (!curve) {
          return respond(
            message,
            false,
            undefined,
            'The selected PI has no deflection, so it cannot take a curb return fillet.',
          );
        }

        const filletLines: SurveyLine[] = [];
        for (const side of [-1, 1]) {
          const offsetRadius = Math.max(
            1,
            curve.radius - side * pavementHalfWidthFt * (curve.turnRight ? 1 : -1),
          );
          const steps = Math.max(6, Math.ceil((Math.abs(curve.delta) * offsetRadius) / 3));
          const coords = Array.from({ length: steps + 1 }, (_, k) => {
            const angle = curve.startAngle - curve.delta * (k / steps);
            return {
              easting: curve.centerEasting + offsetRadius * Math.cos(angle),
              northing: curve.centerNorthing + offsetRadius * Math.sin(angle),
            };
          });
          filletLines.push(
            ...emitChainLines(coords, 'V-ROAD-CURB', 'CONTINUOUS', `road-fillet-${side < 0 ? 'lt' : 'rt'}`),
          );
        }

        deps.setLines((prev) => [...prev, ...filletLines]);
        deps.logActionToFieldbook(
          `Roading Agent: built ${filletRadiusFt}' curb return fillets at PI ${cl.pis[piIndex].pointNumber}.`,
        );
        return respond(message, true, {
          featureKind,
          pi: cl.pis[piIndex].pointNumber,
          filletRadiusFt,
          addedLines: filletLines.length,
          addedPoints: 0,
          layer: 'V-ROAD-CURB',
        });
      }

      let centerE = (bounds.minE + bounds.maxE) / 2;
      let centerN = (bounds.minN + bounds.maxN) / 2;
      let travelBearing = 0;
      if (cl && cl.pis.length >= 2) {
        const targetPi = atEnd ? cl.pis[cl.pis.length - 1] : cl.pis[0];
        const otherPi = atEnd ? cl.pis[cl.pis.length - 2] : cl.pis[1];
        centerE = targetPi.easting;
        centerN = targetPi.northing;
        travelBearing = Math.atan2(
          targetPi.easting - otherPi.easting,
          targetPi.northing - otherPi.northing,
        );
      }

      const newLines: SurveyLine[] = [
        ...emitChainLines(
          buildTangentBulbPolyline(centerE, centerN, bulbRadiusFt, pavementHalfWidthFt, travelBearing),
          'L-ROAD',
          'CONTINUOUS',
          'road-culdesac',
        ),
        ...emitChainLines(
          buildTangentBulbPolyline(centerE, centerN, rowBulbRadiusFt, rowHalfWidthFt, travelBearing),
          'V-ROAD-ROW',
          'DASHED',
          'road-culdesac-row',
        ),
      ];

      deps.setLines((prev) => [...prev, ...newLines]);
      deps.logActionToFieldbook(
        `Roading Agent: added ${featureKind} (R=${bulbRadiusFt}' pavement, R=${rowBulbRadiusFt}' ROW) with curb-return mouth.`,
      );

      return respond(message, true, {
        featureKind,
        addedLines: newLines.length,
        addedPoints: 0,
        layer: 'L-ROAD',
      });
    }),
  );

  // ── 5. roading_clear ───────────────────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('roading_clear', async (message) => {
      const blocked = roadingExperimentalGate(message);
      if (blocked) return blocked;
      const deps = getDeps();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const corridorId = typeof d.corridorId === 'string' ? d.corridorId.trim() : '';

      const roadLayers = new Set([
        'C-ROAD-CNTR',
        'L-ROAD',
        'C-ROAD-LANE',
        'V-ROAD-CURB',
        'V-SITE-SWLK',
        'V-ROAD-ROW',
      ]);

      let removedLines = 0;
      let removedCorridors = 0;

      if (corridorId && deps.roadCorridors) {
        const target = deps.roadCorridors.find((c) => c.id === corridorId);
        const lineIds = new Set(target?.drawnLineIds ?? []);
        deps.setLines((prev) => {
          const kept = prev.filter((l) => !lineIds.has(l.id || ''));
          removedLines = prev.length - kept.length;
          return kept;
        });
        deps.setRoadCorridors?.((prev) => {
          const kept = prev.filter((c) => c.id !== corridorId);
          removedCorridors = prev.length - kept.length;
          return kept;
        });
      } else {
        deps.setLines((prev) => {
          const kept = prev.filter((l) => !roadLayers.has(l.layer || ''));
          removedLines = prev.length - kept.length;
          return kept;
        });
        deps.setRoadCorridors?.((prev) => {
          removedCorridors = prev.length;
          return [];
        });
      }

      deps.logActionToFieldbook(`Roading Agent: cleared ${removedLines} road corridor line segment(s).`);

      return respond(message, true, {
        removedLines,
        removedCorridors,
      });
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
