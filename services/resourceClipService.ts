/**
 * resourceClipService — trim fetched GIS area resources to a closed boundary.
 *
 * A bbox fetch returns complete soil / flood polygons, including the parts that
 * extend past the inclusion boundary. This service intersects each polygon with
 * the boundary loops, recomputes its area, and places its annotation at an
 * interior point of the clipped shape. The caller can then rebuild linework
 * from the clipped loops so the canvas shows the trimmed resource rather than
 * the original bbox extent.
 */

import type { HatchBoundaryLoop, MapAreaFeature, SurveyLine } from '../types.ts';
import { clipSegmentToPolygon } from '../utils/contouring.ts';
import * as polygonClippingModule from 'polygon-clipping';

// polygon-clipping's ESM bundle exposes its API as the default export while
// its published declaration exposes named exports. Normalize both shapes.
type PolygonClippingApi = {
  intersection: (subject: unknown, clip: unknown) => number[][][][];
};
const polygonClippingApi: PolygonClippingApi = (
  (polygonClippingModule as unknown as { default?: PolygonClippingApi }).default
  ?? (polygonClippingModule as unknown as PolygonClippingApi)
);

type Ring = number[][];
type Polygon = Ring[];
type MultiPolygon = Polygon[];

const MIN_AREA_SQFT = 0.01;
const RING_CLOSE_EPSILON = 1e-8;

function ringArea(ring: Ring): number {
  if (ring.length < 3) return 0;
  let sum = 0;
  for (let index = 0; index < ring.length; index++) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[(index + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

function ringAbsArea(ring: Ring): number {
  return Math.abs(ringArea(ring));
}

/** Remove a duplicated closing vertex so the loop stores vertices once. */
function ringFromVertices(vertices: Array<{ x: number; y: number }>): Ring {
  const ring: Ring = vertices.map(vertex => [vertex.x, vertex.y]);
  if (ring.length > 1) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= RING_CLOSE_EPSILON) {
      ring.pop();
    }
  }
  return ring;
}

function closedRing(ring: Ring): Ring {
  if (ring.length === 0) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= RING_CLOSE_EPSILON) {
    return ring;
  }
  return [...ring, [first[0], first[1]]];
}

function verticesFromRing(ring: Ring): Array<{ x: number; y: number }> {
  return ringFromVertices(
    ring.map(([x, y]) => ({ x, y })),
  ).map(([x, y]) => ({ x, y }));
}

function pointInRing(point: { x: number; y: number }, ring: Ring): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [xi, yi] = ring[index];
    const [xj, yj] = ring[previous];
    if ((yi > point.y) !== (yj > point.y)
      && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Even-odd scanline point that is guaranteed to be inside the ring. */
function ringInteriorPoint(ring: Ring): { x: number; y: number } | null {
  if (ring.length < 3) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX) || maxX - minX <= 0 || maxY - minY <= 0) return null;

  for (const fraction of [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9]) {
    const y = minY + (maxY - minY) * fraction;
    const crossings: number[] = [];
    for (let index = 0; index < ring.length; index++) {
      const [x1, y1] = ring[index];
      const [x2, y2] = ring[(index + 1) % ring.length];
      if ((y1 > y) === (y2 > y)) continue;
      crossings.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    }
    crossings.sort((a, b) => a - b);
    for (let index = 0; index + 1 < crossings.length; index += 2) {
      const candidate = { x: (crossings[index] + crossings[index + 1]) / 2, y };
      if (pointInRing(candidate, ring)) return candidate;
    }
  }

  const average = ring.reduce(
    (sum, [x, y]) => ({ x: sum.x + x, y: sum.y + y }),
    { x: 0, y: 0 },
  );
  return { x: average.x / ring.length, y: average.y / ring.length };
}

function ringCentroid(ring: Ring): { x: number; y: number } | null {
  if (ring.length < 3) return null;
  let cx = 0;
  let cy = 0;
  let signed = 0;
  for (let index = 0; index < ring.length; index++) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[(index + 1) % ring.length];
    const cross = x1 * y2 - x2 * y1;
    signed += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (Math.abs(signed) <= RING_CLOSE_EPSILON) return ringInteriorPoint(ring);
  return { x: cx / (3 * signed), y: cy / (3 * signed) };
}

interface ClassifiedRing {
  ring: Ring;
  area: number;
  explicitHole: boolean;
  sample: { x: number; y: number } | null;
}

/**
 * Build a polygon-clipping multipolygon from loops. ArcGIS rings come back as
 * outer + hole(s) without an isHole flag, so rings that fall inside another
 * ring are treated as holes unless the caller already marked them explicitly.
 */
function loopsToMultiPolygon(loops: HatchBoundaryLoop[]): MultiPolygon {
  const classified: ClassifiedRing[] = loops
    .map(loop => ({
      ring: ringFromVertices(loop.vertices),
      area: 0,
      explicitHole: loop.isHole === true,
      sample: null as { x: number; y: number } | null,
    }))
    .filter(entry => entry.ring.length >= 3)
    .map(entry => ({
      ...entry,
      area: ringAbsArea(entry.ring),
      sample: ringInteriorPoint(entry.ring),
    }))
    .filter(entry => entry.area > MIN_AREA_SQFT && entry.sample !== null);

  if (classified.length === 0) return [];

  const parentOf = new Map<number, number>();
  for (let index = 0; index < classified.length; index++) {
    const entry = classified[index];
    if (entry.explicitHole) continue;
    let parent = -1;
    let parentArea = Infinity;
    for (let other = 0; other < classified.length; other++) {
      if (other === index) continue;
      const candidate = classified[other];
      if (candidate.area <= entry.area) continue;
      if (!pointInRing(entry.sample!, candidate.ring)) continue;
      if (candidate.area < parentArea) {
        parent = other;
        parentArea = candidate.area;
      }
    }
    if (parent >= 0) parentOf.set(index, parent);
  }

  // Explicit holes need a containing outer; when no map was needed (all holes
  // flagged), find the smallest non-hole containing ring.
  for (let index = 0; index < classified.length; index++) {
    const entry = classified[index];
    if (!entry.explicitHole || parentOf.has(index)) continue;
    let parent = -1;
    let parentArea = Infinity;
    for (let other = 0; other < classified.length; other++) {
      if (other === index || classified[other].explicitHole) continue;
      const candidate = classified[other];
      if (candidate.area <= entry.area) continue;
      if (!pointInRing(entry.sample!, candidate.ring)) continue;
      if (candidate.area < parentArea) {
        parent = other;
        parentArea = candidate.area;
      }
    }
    if (parent >= 0) parentOf.set(index, parent);
  }

  const polygons: MultiPolygon = [];
  for (let index = 0; index < classified.length; index++) {
    if (classified[index].explicitHole || parentOf.has(index)) continue;
    const holes: Ring[] = [];
    for (const [child, parent] of parentOf) {
      if (parent === index) holes.push(closedRing(classified[child].ring));
    }
    polygons.push([closedRing(classified[index].ring), ...holes]);
  }
  return polygons;
}

function netLoopArea(loops: HatchBoundaryLoop[]): number {
  return loops.reduce((sum, loop) => (
    sum + (loop.isHole ? -1 : 1) * ringAbsArea(ringFromVertices(loop.vertices))
  ), 0);
}

/** Interior anchor for a clipped polygon: centroid when safe, else scanline. */
function interiorPointForLoops(loops: HatchBoundaryLoop[]): { x: number; y: number } | null {
  const outer = loops.filter(loop => !loop.isHole).sort(
    (a, b) => ringAbsArea(ringFromVertices(b.vertices)) - ringAbsArea(ringFromVertices(a.vertices)),
  )[0];
  if (!outer) return null;
  const outerRing = ringFromVertices(outer.vertices);
  const holeRings = loops
    .filter(loop => loop.isHole)
    .map(loop => ringFromVertices(loop.vertices));
  const inside = (point: { x: number; y: number }) => (
    pointInRing(point, outerRing)
    && !holeRings.some(hole => pointInRing(point, hole))
  );

  const centroid = ringCentroid(outerRing);
  if (centroid && inside(centroid)) return centroid;

  const point = ringInteriorPoint(outerRing);
  if (point && inside(point)) return point;

  // The scanline may have landed in a hole. Search a few more scanlines and
  // pick the midpoint of an outer interval that is outside every hole.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of outerRing) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  for (const fraction of [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9]) {
    const y = minY + (maxY - minY) * fraction;
    const intersections: number[] = [];
    for (let index = 0; index < outerRing.length; index++) {
      const [x1, y1] = outerRing[index];
      const [x2, y2] = outerRing[(index + 1) % outerRing.length];
      if ((y1 > y) === (y2 > y)) continue;
      intersections.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    }
    intersections.sort((a, b) => a - b);
    for (let index = 0; index + 1 < intersections.length; index += 2) {
      const candidate = { x: (intersections[index] + intersections[index + 1]) / 2, y };
      if (inside(candidate)) return candidate;
    }
  }
  return centroid && inside(centroid) ? centroid : null;
}

function loopsFromPolygon(polygon: Polygon): HatchBoundaryLoop[] {
  return polygon
    .map((ring, index) => ({
      vertices: verticesFromRing(ring),
      isHole: index > 0,
    }))
    .filter(loop => loop.vertices.length >= 3);
}

/**
 * Intersect area features with a closed boundary. Each resulting polygon piece
 * becomes its own feature so a label is placed inside every visible fragment.
 * Features wholly outside the boundary are dropped.
 */
export function clipMapAreaFeatures(
  areas: MapAreaFeature[],
  boundaryLoops: HatchBoundaryLoop[],
): MapAreaFeature[] {
  if (boundaryLoops.length === 0) return areas;
  const boundary = loopsToMultiPolygon(boundaryLoops);
  if (boundary.length === 0) return areas;

  const clippedAreas: MapAreaFeature[] = [];
  for (const area of areas) {
    const subject = loopsToMultiPolygon(area.loops);
    if (subject.length === 0) continue;
    let clipped: MultiPolygon;
    try {
      clipped = polygonClippingApi.intersection(subject, boundary);
    } catch {
      // A malformed source ring should not take down the whole fetch. Drop
      // that feature rather than drawing untrimmed geometry outside the line.
      continue;
    }

    const polygons = clipped.filter(polygon => (
      polygon.length > 0 && ringAbsArea(polygon[0]) > MIN_AREA_SQFT
    ));
    polygons.forEach((polygon, index) => {
      const loops = loopsFromPolygon(polygon);
      const centroid = interiorPointForLoops(loops);
      if (!centroid) return;
      clippedAreas.push({
        ...area,
        id: polygons.length > 1 ? `${area.id}-trim-${index}` : area.id,
        loops,
        centroid,
        areaSqFt: netLoopArea(loops),
      });
    });
  }
  return clippedAreas;
}

/**
 * Trim two-point linework to closed boundary loops. Segments that cross the
 * boundary are split and only the inside pieces survive; segments wholly
 * outside the boundary are dropped. A segment that survives uncut keeps its
 * id so parcel record lookups continue to resolve.
 */
export function clipSurveyLinesToBoundaries(
  lines: SurveyLine[],
  boundaryLoops: HatchBoundaryLoop[],
): SurveyLine[] {
  const polygons = boundaryLoops
    .filter(loop => loop.isHole !== true)
    .map(loop => loop.vertices.map(vertex => ({ x: vertex.x, y: vertex.y })))
    .filter(polygon => polygon.length >= 3);
  if (polygons.length === 0) return lines;

  const clipped: SurveyLine[] = [];
  for (const line of lines) {
    if (!line.fromPt || !line.toPt) continue;
    const pieces: SurveyLine[] = [];
    for (const polygon of polygons) {
      const inside = clipSegmentToPolygon(
        { x: line.fromPt.x, y: line.fromPt.y },
        { x: line.toPt.x, y: line.toPt.y },
        polygon,
      );
      for (const piece of inside) {
        pieces.push({
          ...line,
          fromPt: { ...line.fromPt, x: piece.a.x, y: piece.a.y },
          toPt: { ...line.toPt, x: piece.b.x, y: piece.b.y },
        });
      }
    }
    if (pieces.length === 0) continue;
    if (pieces.length === 1) {
      clipped.push(pieces[0]);
      continue;
    }
    pieces.forEach((piece, index) => {
      clipped.push({
        ...piece,
        id: piece.id ? `${piece.id}-p${index}` : piece.id,
      });
    });
  }
  return clipped;
}

/** Rebuild canvas boundary linework from trimmed area loops. */
export function areaFeaturesToSurveyLines(
  areas: MapAreaFeature[],
  kind: 'soils' | 'flood',
): SurveyLine[] {
  const lines: SurveyLine[] = [];
  for (const area of areas) {
    area.loops.forEach((loop, ringIndex) => {
      const vertices = loop.vertices;
      if (vertices.length < 2) return;
      const polylineId = `${area.id}-ring-${ringIndex}`;
      const zone = String(area.attributes?.zone ?? '').toUpperCase();
      const subtype = String(area.attributes?.subtype ?? '').trim();
      const bearing = kind === 'flood'
        ? (subtype ? `${zone} — ${subtype}` : zone)
        : String(area.attributes?.muname ?? area.attributes?.musym ?? '');
      for (let index = 0; index < vertices.length; index++) {
        const from = vertices[index];
        const to = vertices[(index + 1) % vertices.length];
        lines.push({
          id: `${area.id}-ring-${ringIndex}-${index}`,
          from: '',
          to: '',
          fromPt: { x: from.x, y: from.y, z: 0 },
          toPt: { x: to.x, y: to.y, z: 0 },
          type: kind,
          layer: area.layer,
          polylineId,
          bearing,
        });
      }
    });
  }
  return lines;
}
