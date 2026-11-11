import type { TinSurface, TinVertex } from '../types.ts';

/**
 * Clip a TIN surface to a simple inclusion-boundary polygon.
 *
 * Delaunay triangulation of already-clipped contour vertices fills the convex
 * hull of the samples, so the mesh still bridges every concave notch in an
 * inclusion boundary. This module cuts the actual triangles at the boundary so
 * the generated surface stops exactly on the inclusion lines.
 *
 * Clipped fragments keep the source triangle's plane: every intermediate
 * vertex carries barycentric weights and its elevation is interpolated, so the
 * trimmed edge follows the original terrain.
 */

export type TinBoundaryPoint = { x: number; y: number };
export type TinBoundaryMode = 'inside' | 'outside';

type WeightedPoint = TinBoundaryPoint & { w: [number, number, number] };

type TinPolygonSource = {
  fromPt?: { x: number; y: number };
  toPt?: { x: number; y: number };
};

function cross(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/** Float noise in a cross product at project coordinates (millions of feet). */
function crossEpsilon(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number {
  const scale = Math.max(
    1,
    Math.abs(ax),
    Math.abs(ay),
    Math.abs(bx),
    Math.abs(by),
    Math.abs(cx),
    Math.abs(cy),
  );
  return scale * scale * 1e-15;
}

function signedArea(poly: TinBoundaryPoint[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function ensureCCW(poly: TinBoundaryPoint[]): TinBoundaryPoint[] {
  return signedArea(poly) < 0 ? [...poly].reverse() : poly;
}

/** Drop repeated/duplicate closing vertices that would break ear clipping. */
function dedupeRing(poly: TinBoundaryPoint[]): TinBoundaryPoint[] {
  const out: TinBoundaryPoint[] = [];
  for (const p of poly) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1e-6) out.push(p);
  }
  if (out.length > 1) {
    const first = out[0];
    const last = out[out.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) <= 1e-6) out.pop();
  }
  return out;
}

function pointInTriangle(
  p: TinBoundaryPoint,
  a: TinBoundaryPoint,
  b: TinBoundaryPoint,
  c: TinBoundaryPoint,
): boolean {
  const eps = crossEpsilon(a.x, a.y, b.x, b.y, c.x, c.y);
  const c1 = cross(a.x, a.y, b.x, b.y, p.x, p.y);
  const c2 = cross(b.x, b.y, c.x, c.y, p.x, p.y);
  const c3 = cross(c.x, c.y, a.x, a.y, p.x, p.y);
  return c1 >= -eps && c2 >= -eps && c3 >= -eps;
}

function pointInPolygon(px: number, py: number, poly: TinBoundaryPoint[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Ear-clip a simple polygon into CCW triangles; [] when it cannot be split. */
function triangulatePolygon(poly: TinBoundaryPoint[]): TinBoundaryPoint[][] {
  const pts = ensureCCW(dedupeRing(poly));
  if (pts.length < 3) return [];

  const remaining = pts.map((_, i) => i);
  const out: TinBoundaryPoint[][] = [];
  let guard = pts.length * pts.length + 16;

  while (remaining.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < remaining.length; i++) {
      const ia = remaining[(i + remaining.length - 1) % remaining.length];
      const ib = remaining[i];
      const ic = remaining[(i + 1) % remaining.length];
      const a = pts[ia];
      const b = pts[ib];
      const c = pts[ic];
      if (cross(a.x, a.y, b.x, b.y, c.x, c.y) <= crossEpsilon(a.x, a.y, b.x, b.y, c.x, c.y)) {
        continue;
      }
      let containsOther = false;
      for (const j of remaining) {
        if (j === ia || j === ib || j === ic) continue;
        if (pointInTriangle(pts[j], a, b, c)) {
          containsOther = true;
          break;
        }
      }
      if (containsOther) continue;

      out.push([a, b, c]);
      remaining.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) return [];
  }

  if (remaining.length === 3) {
    const a = pts[remaining[0]];
    const b = pts[remaining[1]];
    const c = pts[remaining[2]];
    if (cross(a.x, a.y, b.x, b.y, c.x, c.y) > crossEpsilon(a.x, a.y, b.x, b.y, c.x, c.y)) {
      out.push([a, b, c]);
    }
  }
  return out;
}

function interpolateWeights(p: WeightedPoint, q: WeightedPoint, t: number): [number, number, number] {
  return [
    p.w[0] + (q.w[0] - p.w[0]) * t,
    p.w[1] + (q.w[1] - p.w[1]) * t,
    p.w[2] + (q.w[2] - p.w[2]) * t,
  ];
}

/**
 * Sutherland–Hodgman half-plane clip. `keep` is +1 for the left side of a→b
 * (CCW inside) and -1 for the right side (outside).
 */
function clipHalfPlane(
  poly: WeightedPoint[],
  a: TinBoundaryPoint,
  b: TinBoundaryPoint,
  keep: 1 | -1,
): WeightedPoint[] {
  if (poly.length === 0) return [];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-12) return poly;
  const eps = 1e-9 * Math.max(1, len);
  const side = (p: WeightedPoint) => keep * (dx * (p.y - a.y) - dy * (p.x - a.x));
  const out: WeightedPoint[] = [];

  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const sp = side(p);
    const sq = side(q);
    const pIn = sp >= -eps;
    const qIn = sq >= -eps;
    if (pIn) out.push(p);
    if (pIn !== qIn) {
      const denom = sp - sq;
      if (Math.abs(denom) > 1e-18) {
        const t = sp / denom;
        out.push({
          x: p.x + (q.x - p.x) * t,
          y: p.y + (q.y - p.y) * t,
          w: interpolateWeights(p, q, t),
        });
      }
    }
  }
  return out;
}

function intersectConvex(
  subject: WeightedPoint[],
  clipCCW: TinBoundaryPoint[],
): WeightedPoint[] {
  let out = subject;
  for (let i = 0; i < clipCCW.length && out.length > 0; i++) {
    out = clipHalfPlane(out, clipCCW[i], clipCCW[(i + 1) % clipCCW.length], 1);
  }
  return out;
}

/**
 * Subtract a union of disjoint convex pieces from one convex polygon. Parts
 * that fall outside a piece survive for the next piece; parts fully inside a
 * piece are discarded.
 */
function subtractConvexPieces(
  subject: WeightedPoint[],
  pieces: TinBoundaryPoint[][],
): WeightedPoint[][] {
  let candidates: WeightedPoint[][] = [subject];
  for (const clip of pieces) {
    const survivors: WeightedPoint[][] = [];
    for (const poly of candidates) {
      let splits: WeightedPoint[][] = [poly];
      for (let i = 0; i < clip.length && splits.length > 0; i++) {
        const a = clip[i];
        const b = clip[(i + 1) % clip.length];
        const nextSplits: WeightedPoint[][] = [];
        for (const piece of splits) {
          const outside = clipHalfPlane(piece, a, b, -1);
          const inside = clipHalfPlane(piece, a, b, 1);
          if (outside.length >= 3) survivors.push(outside);
          if (inside.length >= 3) nextSplits.push(inside);
        }
        splits = nextSplits;
      }
    }
    candidates = survivors;
    if (candidates.length === 0) break;
  }
  return candidates;
}

function clipByCentroid(
  tin: TinSurface,
  polygon: TinBoundaryPoint[],
  mode: TinBoundaryMode,
): TinSurface {
  const keepInside = mode !== 'outside';
  const triangles = tin.triangles.filter(([ia, ib, ic]) => {
    const a = tin.vertices[ia];
    const b = tin.vertices[ib];
    const c = tin.vertices[ic];
    if (!a || !b || !c) return false;
    const cx = (a.easting + b.easting + c.easting) / 3;
    const cy = (a.northing + b.northing + c.northing) / 3;
    return pointInPolygon(cx, cy, polygon) === keepInside;
  });
  return { ...tin, triangles };
}

/**
 * Build a closed inclusion-boundary ring from `type: 'inclusion'` survey lines.
 * Returns null when the lines do not form at least a triangle.
 */
export function tinBoundaryPolygonFromLines(lines: TinPolygonSource[]): TinBoundaryPoint[] | null {
  const segs: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (const line of lines) {
    if (!line.fromPt || !line.toPt) continue;
    segs.push({ x1: line.fromPt.x, y1: line.fromPt.y, x2: line.toPt.x, y2: line.toPt.y });
  }
  if (segs.length < 3) return null;

  const tolSq = 0.01; // 0.1-unit endpoint matching tolerance
  const dist2 = (ax: number, ay: number, bx: number, by: number) =>
    (ax - bx) ** 2 + (ay - by) ** 2;
  const used = new Set<number>();
  const poly: TinBoundaryPoint[] = [
    { x: segs[0].x1, y: segs[0].y1 },
    { x: segs[0].x2, y: segs[0].y2 },
  ];
  used.add(0);

  for (let iter = 0; iter < segs.length; iter++) {
    let extended = false;
    const head = poly[poly.length - 1];
    const tail = poly[0];
    for (let i = 0; i < segs.length; i++) {
      if (used.has(i)) continue;
      const { x1, y1, x2, y2 } = segs[i];
      if (dist2(head.x, head.y, x1, y1) <= tolSq) {
        poly.push({ x: x2, y: y2 });
        used.add(i);
        extended = true;
        break;
      }
      if (dist2(head.x, head.y, x2, y2) <= tolSq) {
        poly.push({ x: x1, y: y1 });
        used.add(i);
        extended = true;
        break;
      }
      if (dist2(tail.x, tail.y, x1, y1) <= tolSq) {
        poly.unshift({ x: x2, y: y2 });
        used.add(i);
        extended = true;
        break;
      }
      if (dist2(tail.x, tail.y, x2, y2) <= tolSq) {
        poly.unshift({ x: x1, y: y1 });
        used.add(i);
        extended = true;
        break;
      }
    }
    if (!extended) break;
  }

  const ring = dedupeRing(poly);
  return ring.length >= 3 ? ring : null;
}

/**
 * Trim `tin` to the polygon. `mode: 'inside'` keeps the surface inside the
 * inclusion boundary; `'outside'` removes the boundary area (used by contour
 * generations that intentionally leave an inside void for GIS contours).
 */
export function clipTinToPolygon(
  tin: TinSurface,
  polygon: TinBoundaryPoint[],
  mode: TinBoundaryMode = 'inside',
): TinSurface {
  const ring = dedupeRing(polygon);
  if (ring.length < 3 || tin.vertices.length === 0 || tin.triangles.length === 0) return tin;

  const pieces = triangulatePolygon(ring).map(ensureCCW);
  if (pieces.length === 0) return clipByCentroid(tin, ring, mode);

  const vertices: TinVertex[] = [];
  const vertexIndex = new Map<string, number>();
  const triangles: [number, number, number][] = [];

  const addPoint = (
    p: WeightedPoint,
    za: number,
    zb: number,
    zc: number,
  ): number => {
    const key = `${p.x.toFixed(6)}|${p.y.toFixed(6)}`;
    const existing = vertexIndex.get(key);
    if (existing !== undefined) return existing;
    const elevation = p.w[0] * za + p.w[1] * zb + p.w[2] * zc;
    vertexIndex.set(key, vertices.length);
    vertices.push({ easting: p.x, northing: p.y, elevation });
    return vertices.length - 1;
  };

  const addFragment = (
    fragment: WeightedPoint[],
    a: TinVertex,
    b: TinVertex,
    c: TinVertex,
  ) => {
    if (fragment.length < 3) return;
    const ids = fragment.map(p => addPoint(p, a.elevation, b.elevation, c.elevation));
    for (let i = 1; i < ids.length - 1; i++) {
      const ia = ids[0];
      const ib = ids[i];
      const ic = ids[i + 1];
      if (ia === ib || ib === ic || ia === ic) continue;
      const va = vertices[ia];
      const vb = vertices[ib];
      const vc = vertices[ic];
      const area2 =
        (vb.easting - va.easting) * (vc.northing - va.northing) -
        (vc.easting - va.easting) * (vb.northing - va.northing);
      if (Math.abs(area2) < 1e-9) continue;
      triangles.push([ia, ib, ic]);
    }
  };

  for (const [ia, ib, ic] of tin.triangles) {
    const a = tin.vertices[ia];
    const b = tin.vertices[ib];
    const c = tin.vertices[ic];
    if (!a || !b || !c) continue;

    const subject: WeightedPoint[] = [
      { x: a.easting, y: a.northing, w: [1, 0, 0] },
      { x: b.easting, y: b.northing, w: [0, 1, 0] },
      { x: c.easting, y: c.northing, w: [0, 0, 1] },
    ];

    if (mode === 'outside') {
      for (const fragment of subtractConvexPieces(subject, pieces)) {
        addFragment(fragment, a, b, c);
      }
    } else {
      for (const piece of pieces) {
        addFragment(intersectConvex(subject, piece), a, b, c);
      }
    }
  }

  return { ...tin, vertices, triangles };
}
