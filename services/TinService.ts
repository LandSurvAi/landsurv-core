import { SurveyPoint, TinSurface, TinVertex } from '../types.ts';

/**
 * TinService (v26.05.17.15) — minimal MVP for Triangulated Irregular Networks.
 *
 * Capabilities:
 *  - `buildTinFromPoints(points)`: Delaunay-triangulate a set of points-with-Z
 *    into a TinSurface (vertex array + triangle index triples).
 *  - `sampleElevationAt(tin, e, n)`: barycentric Z interpolation at any (E,N).
 *    Returns null if the point lies outside every triangle.
 *  - `sampleElevationsForPoints(tin, points)`: convenience wrapper that returns
 *    updated point objects with new elevations (only for points inside the TIN).
 *
 * The triangulation uses a Bowyer-Watson incremental Delaunay (self-contained,
 * no external dependency). This mirrors the approach already in
 * utils/contouring.ts but is exposed as a reusable surface object.
 */

interface BWPoint { x: number; y: number; z: number; idx: number; }
interface BWTriangle { a: number; b: number; c: number; }

function circumcircleContains(t: BWTriangle, pts: BWPoint[], px: number, py: number): boolean {
  const a = pts[t.a], b = pts[t.b], c = pts[t.c];
  const ax = a.x - px, ay = a.y - py;
  const bx = b.x - px, by = b.y - py;
  const cx = c.x - px, cy = c.y - py;
  const det =
    (ax * ax + ay * ay) * (bx * cy - cx * by) -
    (bx * bx + by * by) * (ax * cy - cx * ay) +
    (cx * cx + cy * cy) * (ax * by - bx * ay);
  return det > 1e-12;
}

function bowyerWatson(points: BWPoint[]): BWTriangle[] {
  if (points.length < 3) return [];
  // Super-triangle that encloses all points.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const dx = (maxX - minX) || 1;
  const dy = (maxY - minY) || 1;
  const dmax = Math.max(dx, dy) * 20;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const augmented: BWPoint[] = [
    ...points,
    { x: cx - dmax, y: cy - dmax, z: 0, idx: -1 },
    { x: cx + dmax, y: cy - dmax, z: 0, idx: -2 },
    { x: cx,       y: cy + dmax, z: 0, idx: -3 },
  ];
  const stIdx0 = points.length;
  const stIdx1 = points.length + 1;
  const stIdx2 = points.length + 2;

  let triangles: BWTriangle[] = [{ a: stIdx0, b: stIdx1, c: stIdx2 }];

  for (let i = 0; i < points.length; i++) {
    const p = augmented[i];
    const badTriangles: BWTriangle[] = [];
    for (const t of triangles) {
      if (circumcircleContains(t, augmented, p.x, p.y)) badTriangles.push(t);
    }
    // Find boundary edges (edges that belong to exactly one bad triangle).
    const edgeCount = new Map<string, { a: number; b: number; count: number }>();
    const key = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    for (const t of badTriangles) {
      for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) {
        const k = key(u, v);
        const existing = edgeCount.get(k);
        if (existing) existing.count++;
        else edgeCount.set(k, { a: u, b: v, count: 1 });
      }
    }
    triangles = triangles.filter(t => !badTriangles.includes(t));
    for (const { a, b, count } of edgeCount.values()) {
      if (count === 1) triangles.push({ a, b, c: i });
    }
  }

  // Strip any triangle that still touches the super-triangle vertices.
  return triangles.filter(t => t.a < stIdx0 && t.b < stIdx0 && t.c < stIdx0);
}

export function buildTinFromPoints(
  points: SurveyPoint[],
  opts: { name?: string; color?: string } = {}
): TinSurface | null {
  const usable = points.filter(
    p => typeof p.elevation === 'number' && Number.isFinite(p.elevation) &&
         Number.isFinite(p.northing) && Number.isFinite(p.easting)
  );
  if (usable.length < 3) return null;

  const bw: BWPoint[] = usable.map((p, idx) => ({
    x: p.easting,
    y: p.northing,
    z: p.elevation as number,
    idx,
  }));
  const tris = bowyerWatson(bw);
  if (tris.length === 0) return null;

  const vertices: TinVertex[] = usable.map(p => ({
    easting: p.easting,
    northing: p.northing,
    elevation: p.elevation as number,
  }));

  return {
    id: `tin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: opts.name || `TIN ${new Date().toLocaleString()}`,
    createdAt: new Date().toISOString(),
    vertices,
    triangles: tris.map(t => [t.a, t.b, t.c] as [number, number, number]),
    sourcePointIds: usable.map(p => p.pointNumber),
    color: opts.color || '#06b6d4',
  };
}

/** Barycentric containment + interpolation for one triangle. */
function interpolateTriangle(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  px: number, py: number
): number | null {
  const denom = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(denom) < 1e-12) return null;
  const wA = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / denom;
  const wB = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / denom;
  const wC = 1 - wA - wB;
  const eps = -1e-9;
  if (wA < eps || wB < eps || wC < eps) return null;
  return wA * az + wB * bz + wC * cz;
}

export function sampleElevationAt(tin: TinSurface, easting: number, northing: number): number | null {
  for (const [ia, ib, ic] of tin.triangles) {
    const a = tin.vertices[ia];
    const b = tin.vertices[ib];
    const c = tin.vertices[ic];
    const z = interpolateTriangle(
      a.easting, a.northing, a.elevation,
      b.easting, b.northing, b.elevation,
      c.easting, c.northing, c.elevation,
      easting, northing
    );
    if (z !== null) return z;
  }
  return null;
}

export function sampleElevationsForPoints(
  tin: TinSurface,
  points: SurveyPoint[]
): { updated: SurveyPoint[]; sampled: number; skipped: number } {
  let sampled = 0;
  let skipped = 0;
  const updated = points.map(p => {
    const z = sampleElevationAt(tin, p.easting, p.northing);
    if (z === null) { skipped++; return p; }
    sampled++;
    return { ...p, elevation: z };
  });
  return { updated, sampled, skipped };
}

/**
 * Build a TIN from contour lines by extracting elevation-tagged vertices.
 * Each vertex in each contour line becomes a sample point at that contour's elevation.
 * Returns null if fewer than 3 usable points are extracted.
 */
export function buildTinFromContours(
  contourLines: Array<{ fromPt?: { x: number; y: number; z?: number }; toPt?: { x: number; y: number; z?: number }; elevation?: number }>,
  opts: { name?: string; color?: string } = {}
): TinSurface | null {
  const points = new Set<string>();
  const bw: BWPoint[] = [];
  const pointMap = new Map<string, BWPoint>();

  for (const line of contourLines) {
    const elev = line.elevation ?? line.fromPt?.z ?? line.toPt?.z ?? 0;
    
    if (line.fromPt) {
      const key = `${line.fromPt.x},${line.fromPt.y}`;
      if (!pointMap.has(key)) {
        const pt: BWPoint = { x: line.fromPt.x, y: line.fromPt.y, z: elev, idx: bw.length };
        bw.push(pt);
        pointMap.set(key, pt);
      }
    }
    
    if (line.toPt) {
      const key = `${line.toPt.x},${line.toPt.y}`;
      if (!pointMap.has(key)) {
        const pt: BWPoint = { x: line.toPt.x, y: line.toPt.y, z: elev, idx: bw.length };
        bw.push(pt);
        pointMap.set(key, pt);
      }
    }
  }

  if (bw.length < 3) return null;

  const tris = bowyerWatson(bw);
  if (tris.length === 0) return null;

  const vertices: TinVertex[] = bw.map(p => ({
    easting: p.x,
    northing: p.y,
    elevation: p.z,
  }));

  return {
    id: `tin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: opts.name || `TIN from Contours ${new Date().toLocaleString()}`,
    createdAt: new Date().toISOString(),
    vertices,
    triangles: tris.map(t => [t.a, t.b, t.c] as [number, number, number]),
    sourcePointIds: bw.map((_, i) => `contour-${i}`),
    color: opts.color || '#06b6d4',
  };
}
