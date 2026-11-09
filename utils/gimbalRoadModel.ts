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

export interface RoadModelCorridor {
  id: string;
  kind: 'paired_edges' | 'centerline' | 'paint' | 'single_edge';
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

export interface RoadMathModel {
  corridors: RoadModelCorridor[];
  totalLengthFt: number;
  /** Median corridor width, null when every corridor is a single run. */
  widthFt: number | null;
  sections: number;
  unpairedEdges: number;
  builtAt: number;
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
  /** Cross-section spacing target (default 50 ft, capped at 14 sections). */
  sectionIntervalFt?: number;
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
): RoadModelSection[] {
  const totalLength = polylineLength(primaryVertices);
  const maxSections = 14;
  const count = Math.max(2, Math.min(maxSections, Math.ceil(totalLength / Math.max(intervalFt, 10)) + 1));
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
  options: Required<Pick<RoadMathModelOptions, 'maxGapFt' | 'sectionIntervalFt'>>,
): RoadModelCorridor {
  const sections = buildSections(primary.vertices, secondary?.vertices ?? null, options.sectionIntervalFt);
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

export function buildRoadMathModel<T extends DraftLineLike>(
  lines: T[],
  grounding: { osmWays?: GroundingWay[] } = {},
  report?: Pick<RoadTakeReport, 'scoreAfter' | 'remaining'> | null,
  options: RoadMathModelOptions = {},
): RoadMathModel {
  const features = groupRoadFeatures(lines, {
    includeGenericLinework: options.includeGenericLinework === true,
  });
  const maxGapFt = options.maxGapFt ?? 80;
  const sectionIntervalFt = options.sectionIntervalFt ?? 50;

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
      { maxGapFt, sectionIntervalFt },
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
      { maxGapFt, sectionIntervalFt },
    ));
  }
  for (const edge of unpaired) {
    corridors.push(buildCorridor(
      `R${sequence++}`,
      edge,
      null,
      centerlines,
      osmWays,
      { maxGapFt, sectionIntervalFt },
    ));
  }

  const widths = corridors.map(corridor => corridor.widthFt).filter((width): width is number => width !== null);
  return {
    corridors,
    totalLengthFt: parseFloat(corridors.reduce((sum, corridor) => sum + corridor.lengthFt, 0).toFixed(2)),
    widthFt: median(widths) === null ? null : parseFloat(median(widths)!.toFixed(2)),
    sections: corridors.reduce((sum, corridor) => sum + corridor.sections.length, 0),
    unpairedEdges: unpaired.length,
    builtAt: Date.now(),
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

function formatCorridorTable(corridor: RoadModelCorridor): string[] {
  const rows = corridor.sections.slice(0, 14).map(section => {
    const width = section.widthFt === null ? '—' : section.widthFt.toFixed(1);
    const edge = section.farEdge
      ? `(${section.farEdge.easting.toFixed(1)}, ${section.farEdge.northing.toFixed(1)})`
      : 'no opposite edge';
    return `  ${formatStation(section.stationFt).padEnd(7)} ` +
      `(${section.easting.toFixed(1)}, ${section.northing.toFixed(1)})  ` +
      `${section.bearingDeg.toFixed(1).padStart(5)}°  ${width.padStart(5)} ft  opp ${edge}`;
  });
  const hidden = corridor.sections.length > rows.length
    ? [`  (+${corridor.sections.length - rows.length} more sections)`]
    : [];
  return rows.concat(hidden);
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
      `${model.widthFt !== null ? `, typical width ${model.widthFt.toFixed(1)} ft` : ', width not measurable (edge missing)'}.`,
    'This table is the mathematical record of the first glance. The second pass must reproduce this corridor, station by station — not invent a new alignment.',
    '',
  ];

  for (const corridor of model.corridors) {
    lines.push(
      `CORRIDOR ${corridor.id} · ${corridor.kind.replace(/_/g, ' ')} · layer ${corridor.layer ?? '?'} · ` +
        `sta ${formatStation(corridor.stationStartFt)} → ${formatStation(corridor.stationEndFt)} · ` +
        `${corridor.lengthFt.toFixed(0)} ft · ${corridor.widthFt?.toFixed(1) ?? '—'} ft wide` +
        `${corridor.widthSpreadFt > 0 ? ` (±${corridor.widthSpreadFt.toFixed(1)} ft)` : ''} · ` +
        `${corridor.edgeCount} edge${corridor.edgeCount === 1 ? '' : 's'}` +
        `${corridor.hasCenterline ? ' + centreline' : ''}`,
    );
    lines.push('  STA     CENTRE (E, N)                 BEARING  WIDTH   OPPOSITE EDGE');
    lines.push(...formatCorridorTable(corridor));

    if (corridor.defects.length > 0) {
      lines.push('  FIX TARGETS:');
      corridor.defects.slice(0, 8).forEach((defect, index) => {
        const severity = defect.severity === 'red' ? 'RED' : 'AMBER';
        lines.push(
          `   ${index + 1}. [${severity}] ${defect.detail}` +
          `${defect.stationFt !== null ? ` (at ${formatStation(defect.stationFt)})` : ''}`,
        );
      });
    }
    lines.push('');
  }

  if (model.reviewRemaining.length > 0) {
    lines.push('CIVIL-SENSE DEFECTS STILL OPEN FROM THE TAKE REVIEW:');
    for (const detail of model.reviewRemaining.slice(0, 8)) lines.push(`  - ${detail}`);
    lines.push('');
  }

  lines.push(
    'SECOND-PASS RULES FOR USING THIS MODEL:',
    '• Keep the modelled station range and typical width. Every section is a hard anchor: start/end at the same stations, hold the opposite edge at the modelled width ± 2 ft.',
    '• Re-use the section centre coordinates and opposite-edge coordinates to place the redraw. If a defect target says "extend", extend along the same bearing from that station.',
    '• Do not shorten the corridor to the densest cluster or stop at a frame edge. Station coverage is part of the acceptance test.',
    '• Preserve edge pairing: two parallel edges, no crossing, no duplicate, no orphan stub. A branch T-intersects the through edge.',
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
    `${model.unpairedEdges > 0 ? `, ${model.unpairedEdges} unpaired edge${model.unpairedEdges === 1 ? '' : 's'}` : ''}.`;
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
