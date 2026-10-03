// Area & polygon utilities. All inputs are arrays of Pt {northing, easting}.

import { Pt } from './types';

const SQFT_PER_ACRE = 43560;

/** Shoelace area for a closed polygon (last vertex need not equal first). Returns positive sqft. */
export function shoelaceArea(vertices: Pt[]): number {
  if (vertices.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    sum += a.easting * b.northing - b.easting * a.northing;
  }
  return Math.abs(sum) / 2;
}

/** Signed shoelace area — positive when vertices are counter-clockwise in (E,N). */
export function signedArea(vertices: Pt[]): number {
  if (vertices.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    sum += a.easting * b.northing - b.easting * a.northing;
  }
  return sum / 2;
}

/** Convert sqft → acres. */
export function sqftToAcres(sqft: number): number { return sqft / SQFT_PER_ACRE; }

/** Convert acres → sqft. */
export function acresToSqft(acres: number): number { return acres * SQFT_PER_ACRE; }

/** Perimeter (open polyline length). */
export function perimeter(vertices: Pt[], closed = true): number {
  let total = 0;
  const n = vertices.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    total += Math.hypot(b.easting - a.easting, b.northing - a.northing);
  }
  return total;
}

/** Centroid of a closed polygon (Bourke's formula). */
export function centroid(vertices: Pt[]): Pt {
  const A = signedArea(vertices);
  if (Math.abs(A) < 1e-12) {
    let sumE = 0, sumN = 0;
    for (const v of vertices) { sumE += v.easting; sumN += v.northing; }
    return { easting: sumE / vertices.length, northing: sumN / vertices.length };
  }
  let cx = 0, cy = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    const cross = a.easting * b.northing - b.easting * a.northing;
    cx += (a.easting + b.easting) * cross;
    cy += (a.northing + b.northing) * cross;
  }
  return { easting: cx / (6 * A), northing: cy / (6 * A) };
}

/** Segment area between a chord and its arc (positive). For curve-included parcels. */
export function segmentArea(radius: number, deltaRad: number): number {
  const r = Math.abs(radius);
  const t = Math.abs(deltaRad);
  return (r * r / 2) * (t - Math.sin(t));
}

/** Point-in-polygon (ray casting). */
export function pointInPolygon(p: Pt, polygon: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].easting, yi = polygon[i].northing;
    const xj = polygon[j].easting, yj = polygon[j].northing;
    const intersect = ((yi > p.northing) !== (yj > p.northing)) &&
      (p.easting < ((xj - xi) * (p.northing - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Convex hull (Andrew's monotone chain). Returns counter-clockwise vertices. */
export function convexHull(points: Pt[]): Pt[] {
  if (points.length <= 1) return points.slice();
  const sorted = points.slice().sort((a, b) =>
    a.easting === b.easting ? a.northing - b.northing : a.easting - b.easting
  );
  const cross = (O: Pt, A: Pt, B: Pt) =>
    (A.easting - O.easting) * (B.northing - O.northing) -
    (A.northing - O.northing) * (B.easting - O.easting);
  const lower: Pt[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

/** Minimum bounding rectangle (rotating calipers). Returns 4 corners + width, height, rotation. */
export function minimumBoundingRect(points: Pt[]): { corners: [Pt, Pt, Pt, Pt]; width: number; height: number; rotation: number; area: number } | null {
  const hull = convexHull(points);
  if (hull.length < 3) return null;
  let best = { area: Infinity, corners: [hull[0], hull[0], hull[0], hull[0]] as [Pt, Pt, Pt, Pt], width: 0, height: 0, rotation: 0 };
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const ux = b.easting - a.easting, uy = b.northing - a.northing;
    const len = Math.hypot(ux, uy);
    if (len < 1e-12) continue;
    const ex = ux / len, ey = uy / len; // edge unit
    const px = -ey, py = ex;            // perpendicular unit
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of hull) {
      const dx = p.easting - a.easting, dy = p.northing - a.northing;
      const u = dx * ex + dy * ey;
      const v = dx * px + dy * py;
      if (u < minU) minU = u; if (u > maxU) maxU = u;
      if (v < minV) minV = v; if (v > maxV) maxV = v;
    }
    const w = maxU - minU, h = maxV - minV;
    const area = w * h;
    if (area < best.area) {
      const corner = (u: number, v: number): Pt => ({
        easting:  a.easting  + ex * u + px * v,
        northing: a.northing + ey * u + py * v,
      });
      best = {
        area,
        corners: [corner(minU, minV), corner(maxU, minV), corner(maxU, maxV), corner(minU, maxV)],
        width: w, height: h,
        rotation: Math.atan2(ex, ey), // azimuth of edge
      };
    }
  }
  return best;
}
