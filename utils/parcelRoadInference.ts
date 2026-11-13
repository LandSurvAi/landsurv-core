/**
 * parcelRoadInference.ts
 *
 * PARCEL FABRIC → ROAD CANDIDATES
 * ───────────────────────────────
 * County parcel layers are polygons, not a road centerline layer. A street is
 * the strip BETWEEN two different parcel fabrics: the frontage on one side of
 * the right-of-way faces the frontage on the other side, and the strip itself
 * has no parcel polygon in it.
 *
 * This module turns that observation into explicit, auditable road candidates.
 * It is deliberately conservative:
 *
 *   • both frontages must be long enough and parallel;
 *   • they must overlap along the street for a meaningful distance;
 *   • the gap must be a plausible street width, not a parcel interior;
 *   • when parcel ids are present, the two sides must belong to DIFFERENT
 *     parcels;
 *   • adjacent gap pieces are merged only when they continue in the same
 *     direction, so a cross street does not become part of the through road.
 *
 * The result is evidence, not surveyed pavement. The model must still use the
 * field shots for the final edge geometry, but it no longer has to guess where
 * a road exists just because the road strip has no parcel linework in it.
 */

import type { DraftLineLike, DraftVertex } from './synthesisVerification.ts';

export interface ParcelGapRoad {
  id: string;
  /** Centre of the parcel-fabric gap, in project coordinates. */
  vertices: DraftVertex[];
  /** Median frontage-to-frontage width. */
  widthFt: number;
  lengthFt: number;
  /** 0–1 confidence from parallelism, overlap and frontage consistency. */
  confidence: number;
  frontageLineIds: string[];
  parcelIds: string[];
  source: 'parcel_gap';
}

export interface ParcelGapRoadOptions {
  /** Narrowest strip treated as a street (default 14 ft). */
  minWidthFt?: number;
  /** Widest strip treated as a street (default 180 ft). */
  maxWidthFt?: number;
  /** Minimum centreline length (default 30 ft). */
  minLengthFt?: number;
  /** Minimum absolute dot product of the two frontage directions (default 0.72). */
  minParallelDot?: number;
  /** Minimum overlap along the street (default 24 ft / 20% of the shorter run). */
  minOverlapFt?: number;
  /** Maximum frontage-to-frontage distance variation (default 8 ft). */
  maxWidthSpreadFt?: number;
  /** Maximum endpoint gap when joining adjacent candidates (default 45 ft). */
  maxJoinGapFt?: number;
}

type ParcelLineLike = DraftLineLike & {
  parcelId?: string;
  type?: string;
};

interface FrontageSegment {
  line: ParcelLineLike;
  index: number;
  id: string;
  a: DraftVertex;
  b: DraftVertex;
  length: number;
  direction: { x: number; y: number };
  parcelId?: string;
}

interface GapCandidate {
  vertices: DraftVertex[];
  widthFt: number;
  confidence: number;
  frontageLineIds: string[];
  parcelIds: string[];
}

const PARCEL_LAYER_RE = /PARCEL|TAX.?LOT|CADASTRE|ASSESSOR/i;

function distance(a: DraftVertex, b: DraftVertex): number {
  return Math.hypot(a.easting - b.easting, a.northing - b.northing);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function lineEndpoints(line: DraftLineLike): [DraftVertex, DraftVertex] | null {
  if (!line.fromPt || !line.toPt) return null;
  const a = { easting: line.fromPt.x, northing: line.fromPt.y };
  const b = { easting: line.toPt.x, northing: line.toPt.y };
  if (!Number.isFinite(a.easting) || !Number.isFinite(a.northing)
    || !Number.isFinite(b.easting) || !Number.isFinite(b.northing)) return null;
  return distance(a, b) > 0.5 ? [a, b] : null;
}

function unitVector(a: DraftVertex, b: DraftVertex): { x: number; y: number } | null {
  const dx = b.easting - a.easting;
  const dy = b.northing - a.northing;
  const length = Math.hypot(dx, dy);
  return length < 1e-6 ? null : { x: dx / length, y: dy / length };
}

function pointOnSegment(a: DraftVertex, b: DraftVertex, t: number): DraftVertex {
  return {
    easting: a.easting + (b.easting - a.easting) * t,
    northing: a.northing + (b.northing - a.northing) * t,
  };
}

function projectOnSegment(point: DraftVertex, a: DraftVertex, b: DraftVertex): {
  point: DraftVertex;
  t: number;
} {
  const dx = b.easting - a.easting;
  const dy = b.northing - a.northing;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1e-9) return { point: a, t: 0 };
  const t = clamp(
    ((point.easting - a.easting) * dx + (point.northing - a.northing) * dy) / lengthSq,
    0,
    1,
  );
  return { point: pointOnSegment(a, b, t), t };
}

function isParcelLine(line: ParcelLineLike): boolean {
  if (line.hidden || line.fromPt === undefined || line.toPt === undefined) return false;
  if (line.type === 'parcel') return true;
  return PARCEL_LAYER_RE.test(`${line.layer ?? ''} ${line.polylineId ?? ''}`);
}

function lineId(line: ParcelLineLike, index: number): string {
  return String(line.id ?? line.polylineId ?? `parcel-${index}`);
}

function buildFrontages(lines: DraftLineLike[]): FrontageSegment[] {
  const frontages: FrontageSegment[] = [];
  lines.forEach((raw, index) => {
    const line = raw as ParcelLineLike;
    if (!isParcelLine(line)) return;
    const ends = lineEndpoints(line);
    if (!ends) return;
    const direction = unitVector(ends[0], ends[1]);
    if (!direction) return;
    frontages.push({
      line,
      index,
      id: lineId(line, index),
      a: ends[0],
      b: ends[1],
      length: distance(ends[0], ends[1]),
      direction,
      parcelId: line.parcelId,
    });
  });
  return frontages;
}

function overlapAlongAxis(
  a: FrontageSegment,
  b: FrontageSegment,
): { start: number; end: number; overlap: number } {
  const bA = {
    easting: (b.a.easting - a.a.easting) * a.direction.x + (b.a.northing - a.a.northing) * a.direction.y,
    northing: (b.a.easting - a.a.easting) * a.direction.y - (b.a.northing - a.a.northing) * a.direction.x,
  };
  const bB = {
    easting: (b.b.easting - a.a.easting) * a.direction.x + (b.b.northing - a.a.northing) * a.direction.y,
    northing: (b.b.easting - a.a.easting) * a.direction.y - (b.b.northing - a.a.northing) * a.direction.x,
  };
  const start = Math.max(0, Math.min(bA.easting, bB.easting));
  const end = Math.min(a.length, Math.max(bA.easting, bB.easting));
  return { start, end, overlap: Math.max(0, end - start) };
}

/**
 * Two parcel lines bound a street when they are parallel, face each other
 * across a plausible width, and overlap along the street. The centerline is the
 * midpoint between the two frontages over the shared run.
 */
function gapBetweenFrontages(
  a: FrontageSegment,
  b: FrontageSegment,
  options: Required<Pick<ParcelGapRoadOptions,
    'minWidthFt' | 'maxWidthFt' | 'minLengthFt' | 'minParallelDot'
    | 'minOverlapFt' | 'maxWidthSpreadFt'>>,
): GapCandidate | null {
  const parallel = Math.abs(a.direction.x * b.direction.x + a.direction.y * b.direction.y);
  if (parallel < options.minParallelDot) return null;

  const overlap = overlapAlongAxis(a, b);
  const overlapRequired = Math.max(options.minOverlapFt, Math.min(a.length, b.length) * 0.2);
  if (overlap.overlap < overlapRequired) return null;

  // A strip whose two frontages belong to the same parcel is almost always a
  // parcel interior, not a road. Only apply this when the source ids are known.
  if (a.parcelId && b.parcelId && a.parcelId === b.parcelId) return null;

  const startA = pointOnSegment(a.a, a.b, overlap.start / a.length);
  const endA = pointOnSegment(a.a, a.b, overlap.end / a.length);
  const startB = projectOnSegment(startA, b.a, b.b).point;
  const endB = projectOnSegment(endA, b.a, b.b).point;
  const sepStart = distance(startA, startB);
  const sepEnd = distance(endA, endB);
  const widthFt = (sepStart + sepEnd) / 2;
  if (widthFt < options.minWidthFt || widthFt > options.maxWidthFt) return null;
  if (Math.abs(sepStart - sepEnd) > options.maxWidthSpreadFt) return null;

  const start = {
    easting: (startA.easting + startB.easting) / 2,
    northing: (startA.northing + startB.northing) / 2,
  };
  const end = {
    easting: (endA.easting + endB.easting) / 2,
    northing: (endA.northing + endB.northing) / 2,
  };
  const lengthFt = distance(start, end);
  if (lengthFt < options.minLengthFt) return null;

  const overlapShare = overlap.overlap / Math.max(1, Math.min(a.length, b.length));
  const parallelScore = clamp((parallel - options.minParallelDot) / (1 - options.minParallelDot), 0, 1);
  const widthScore = 1 - clamp(Math.abs(sepStart - sepEnd) / options.maxWidthSpreadFt, 0, 1);
  const parcelScore = a.parcelId && b.parcelId && a.parcelId !== b.parcelId ? 1 : 0.55;
  const confidence = clamp(
    0.30 + parallelScore * 0.28 + overlapShare * 0.22 + widthScore * 0.12 + parcelScore * 0.08,
    0.35,
    0.98,
  );

  return {
    vertices: [start, end],
    widthFt,
    confidence,
    frontageLineIds: [a.id, b.id],
    parcelIds: [a.parcelId, b.parcelId].filter((id): id is string => Boolean(id)),
  };
}

function sameDirection(a: DraftVertex[], b: DraftVertex[]): boolean {
  if (a.length < 2 || b.length < 2) return false;
  const da = unitVector(a[0], a[a.length - 1]);
  const db = unitVector(b[0], b[b.length - 1]);
  if (!da || !db) return false;
  return Math.abs(da.x * db.x + da.y * db.y) >= 0.78;
}

function joinCandidate(chain: GapCandidate, next: GapCandidate): GapCandidate {
  const chainStart = chain.vertices[0];
  const chainEnd = chain.vertices[chain.vertices.length - 1];
  const nextStart = next.vertices[0];
  const nextEnd = next.vertices[next.vertices.length - 1];
  const options = [
    { gap: distance(chainEnd, nextStart), vertices: [...chain.vertices, ...next.vertices], width: next.widthFt },
    { gap: distance(chainEnd, nextEnd), vertices: [...chain.vertices, ...next.vertices.slice().reverse()], width: next.widthFt },
    { gap: distance(chainStart, nextEnd), vertices: [...next.vertices, ...chain.vertices], width: next.widthFt },
    { gap: distance(chainStart, nextStart), vertices: [...next.vertices.slice().reverse(), ...chain.vertices], width: next.widthFt },
  ];
  const best = options.sort((a, b) => a.gap - b.gap)[0];
  const width = median([chain.widthFt, next.widthFt]) ?? chain.widthFt;
  return {
    vertices: best.vertices,
    widthFt: width,
    confidence: Math.max(chain.confidence, next.confidence),
    frontageLineIds: [...new Set([...chain.frontageLineIds, ...next.frontageLineIds])],
    parcelIds: [...new Set([...chain.parcelIds, ...next.parcelIds])],
  };
}

function mergeCandidates(
  candidates: GapCandidate[],
  maxJoinGapFt: number,
): GapCandidate[] {
  const remaining = [...candidates].sort((a, b) => b.confidence - a.confidence || b.vertices.length - a.vertices.length);
  const merged: GapCandidate[] = [];

  while (remaining.length > 0) {
    let chain = remaining.shift()!;
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];
        if (!sameDirection(chain.vertices, candidate.vertices)) continue;
        const starts = [chain.vertices[0], chain.vertices[chain.vertices.length - 1]];
        const ends = [candidate.vertices[0], candidate.vertices[candidate.vertices.length - 1]];
        const nearest = Math.min(...starts.flatMap(a => ends.map(b => distance(a, b))));
        if (nearest > maxJoinGapFt) continue;
        if (Math.abs(chain.widthFt - candidate.widthFt) > 18) continue;
        chain = joinCandidate(chain, candidate);
        remaining.splice(i, 1);
        grew = true;
        break;
      }
    }
    merged.push(chain);
  }

  return merged;
}

/**
 * Infer road corridors from the gaps between parcel frontages.
 *
 * The result is sorted north-to-south / west-to-east and capped so a very dense
 * county fabric cannot flood a prompt. Callers should treat every result as a
 * road candidate, not as surveyed pavement.
 */
export function inferParcelGapRoads(
  lines: DraftLineLike[],
  options: ParcelGapRoadOptions = {},
): ParcelGapRoad[] {
  const resolved = {
    minWidthFt: options.minWidthFt ?? 14,
    maxWidthFt: options.maxWidthFt ?? 180,
    minLengthFt: options.minLengthFt ?? 30,
    minParallelDot: options.minParallelDot ?? 0.72,
    minOverlapFt: options.minOverlapFt ?? 24,
    maxWidthSpreadFt: options.maxWidthSpreadFt ?? 8,
    maxJoinGapFt: options.maxJoinGapFt ?? 45,
  };
  const frontages = buildFrontages(lines);
  if (frontages.length < 2) return [];

  const candidates: GapCandidate[] = [];
  for (let i = 0; i < frontages.length; i++) {
    for (let j = i + 1; j < frontages.length; j++) {
      const candidate = gapBetweenFrontages(frontages[i], frontages[j], resolved);
      if (candidate) candidates.push(candidate);
    }
  }
  if (candidates.length === 0) return [];

  // If two parcel pairs describe the same strip, keep the stronger one rather
  // than letting a duplicate pair become a second road.
  const deduped: GapCandidate[] = [];
  for (const candidate of candidates.sort((a, b) => b.confidence - a.confidence)) {
    const duplicate = deduped.some(existing => {
      const aStart = existing.vertices[0];
      const aEnd = existing.vertices[existing.vertices.length - 1];
      const bStart = candidate.vertices[0];
      const bEnd = candidate.vertices[candidate.vertices.length - 1];
      return Math.abs(existing.widthFt - candidate.widthFt) <= 6
        && Math.min(
          distance(aStart, bStart) + distance(aEnd, bEnd),
          distance(aStart, bEnd) + distance(aEnd, bStart),
        ) <= 30;
    });
    if (!duplicate) deduped.push(candidate);
  }

  return mergeCandidates(deduped, resolved.maxJoinGapFt)
    .map((candidate, index) => ({
      id: `PGR-${index + 1}`,
      vertices: candidate.vertices,
      widthFt: parseFloat(candidate.widthFt.toFixed(2)),
      lengthFt: parseFloat(
        candidate.vertices
          .slice(1)
          .reduce((sum, vertex, vertexIndex) => sum + distance(candidate.vertices[vertexIndex], vertex), 0)
          .toFixed(2),
      ),
      confidence: parseFloat(candidate.confidence.toFixed(2)),
      frontageLineIds: candidate.frontageLineIds,
      parcelIds: candidate.parcelIds,
      source: 'parcel_gap' as const,
    }))
    .filter(candidate => candidate.lengthFt >= resolved.minLengthFt)
    .sort((a, b) => {
      const aMid = a.vertices[Math.floor(a.vertices.length / 2)];
      const bMid = b.vertices[Math.floor(b.vertices.length / 2)];
      return (bMid.northing - aMid.northing) || (bMid.easting - aMid.easting);
    })
    .slice(0, 80);
}

/** Compact prompt block used by the road grounding context. */
export function formatParcelGapRoad(road: ParcelGapRoad): string {
  const start = road.vertices[0];
  const end = road.vertices[road.vertices.length - 1];
  return `${road.id}: ${road.widthFt.toFixed(1)} ft wide · ${road.lengthFt.toFixed(0)} ft long · ` +
    `centre (${start.easting.toFixed(1)}, ${start.northing.toFixed(1)}) → ` +
    `(${end.easting.toFixed(1)}, ${end.northing.toFixed(1)}) · ` +
    `${Math.round(road.confidence * 100)}% confidence · ` +
    `frontage ${road.frontageLineIds.join(', ')}`;
}
