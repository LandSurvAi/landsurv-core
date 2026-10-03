// 2D intersection primitives (clean-room from standard formulas, e.g.
// Wolf & Ghilani "Elementary Surveying" §11). Inputs use Pt {northing, easting}.
// Azimuths are radians from north.

import { Pt, Circle2, IntersectSolution, normalizeAzimuth } from './types';

const EPS = 1e-9;

/** Bearing-bearing intersection — two rays from p1 (az1) and p2 (az2). */
export function intersectBB(p1: Pt, az1: number, p2: Pt, az2: number): Pt | null {
  // Convert to (E, N) parametric: E = E0 + t*sin(az), N = N0 + t*cos(az).
  const s1 = Math.sin(az1), c1 = Math.cos(az1);
  const s2 = Math.sin(az2), c2 = Math.cos(az2);
  // Solve: E1 + t1*s1 = E2 + t2*s2, N1 + t1*c1 = N2 + t2*c2.
  const det = s1 * (-c2) - (-s2) * c1;
  if (Math.abs(det) < EPS) return null; // parallel
  const dE = p2.easting - p1.easting;
  const dN = p2.northing - p1.northing;
  const t1 = (dE * (-c2) - (-s2) * dN) / det;
  return {
    easting: p1.easting + t1 * s1,
    northing: p1.northing + t1 * c1,
  };
}

/** Bearing-distance intersection — ray from p1 (az1) intersects circle radius d2 at p2.
 *  Returns 0, 1, or 2 solutions. */
export function intersectBD(p1: Pt, az1: number, p2: Pt, d2: number): IntersectSolution<Pt> {
  // Project p1 onto ray direction; solve quadratic for distance along ray.
  const sE = Math.sin(az1), cN = Math.cos(az1);
  const dE = p1.easting - p2.easting;
  const dN = p1.northing - p2.northing;
  // |p1 + t*dir - p2|² = d2² → t² + 2*(dir·(p1-p2))*t + |p1-p2|² - d2² = 0
  const b = 2 * (sE * dE + cN * dN);
  const c = dE * dE + dN * dN - d2 * d2;
  const disc = b * b - 4 * c;
  if (disc < -EPS) return { count: 0, solutions: [] };
  const sqrt = Math.sqrt(Math.max(0, disc));
  const t1 = (-b - sqrt) / 2;
  const t2 = (-b + sqrt) / 2;
  // Reject negative t (behind ray origin).
  const sols: Pt[] = [];
  for (const t of [t1, t2]) {
    if (t < -EPS) continue;
    sols.push({ easting: p1.easting + t * sE, northing: p1.northing + t * cN });
  }
  if (sols.length === 0) return { count: 0, solutions: [] };
  return { count: sols.length as 1 | 2, solutions: sols };
}

/** Distance-distance intersection — circles centered at p1 (radius d1) and p2 (radius d2). */
export function intersectDD(p1: Pt, d1: number, p2: Pt, d2: number): IntersectSolution<Pt> {
  const dx = p2.easting - p1.easting;
  const dy = p2.northing - p1.northing;
  const D = Math.hypot(dx, dy);
  if (D < EPS) return { count: 0, solutions: [] };
  if (D > d1 + d2 + EPS) return { count: 0, solutions: [] };
  if (D < Math.abs(d1 - d2) - EPS) return { count: 0, solutions: [] };

  const a = (d1 * d1 - d2 * d2 + D * D) / (2 * D);
  const hSq = d1 * d1 - a * a;
  const h = Math.sqrt(Math.max(0, hSq));
  const ux = dx / D, uy = dy / D;
  const baseE = p1.easting + a * ux;
  const baseN = p1.northing + a * uy;
  if (h < EPS) {
    return { count: 1, solutions: [{ easting: baseE, northing: baseN }] };
  }
  // Perpendicular offset: rotate (ux,uy) by 90°.
  return {
    count: 2,
    solutions: [
      { easting: baseE + h * (-uy), northing: baseN + h * ux },
      { easting: baseE - h * (-uy), northing: baseN - h * ux },
    ],
  };
}

/** Line-line (segment) intersection. Returns the unique point or null if parallel/coincident. */
export function intersectLL(a1: Pt, a2: Pt, b1: Pt, b2: Pt): Pt | null {
  const aE = a2.easting - a1.easting, aN = a2.northing - a1.northing;
  const bE = b2.easting - b1.easting, bN = b2.northing - b1.northing;
  const det = aE * bN - aN * bE;
  if (Math.abs(det) < EPS) return null;
  const t = ((b1.easting - a1.easting) * bN - (b1.northing - a1.northing) * bE) / det;
  return { easting: a1.easting + t * aE, northing: a1.northing + t * aN };
}

/** Line-circle intersection. */
export function intersectLC(a: Pt, b: Pt, circle: Circle2): IntersectSolution<Pt> {
  const dE = b.easting - a.easting;
  const dN = b.northing - a.northing;
  const fE = a.easting - circle.center.easting;
  const fN = a.northing - circle.center.northing;
  const A = dE * dE + dN * dN;
  const B = 2 * (fE * dE + fN * dN);
  const C = fE * fE + fN * fN - circle.radius * circle.radius;
  const disc = B * B - 4 * A * C;
  if (disc < -EPS) return { count: 0, solutions: [] };
  const sqrt = Math.sqrt(Math.max(0, disc));
  const t1 = (-B - sqrt) / (2 * A);
  const t2 = (-B + sqrt) / (2 * A);
  const sols: Pt[] = [];
  if (Math.abs(t1 - t2) < EPS) {
    sols.push({ easting: a.easting + t1 * dE, northing: a.northing + t1 * dN });
    return { count: 1, solutions: sols };
  }
  sols.push({ easting: a.easting + t1 * dE, northing: a.northing + t1 * dN });
  sols.push({ easting: a.easting + t2 * dE, northing: a.northing + t2 * dN });
  return { count: 2, solutions: sols };
}

/** Circle-circle intersection (alias for intersectDD). */
export const intersectCC = intersectDD;

/** Three-point circle: returns center and radius of unique circle through p1, p2, p3. */
export function circleThrough3(p1: Pt, p2: Pt, p3: Pt): Circle2 | null {
  const ax = p1.easting, ay = p1.northing;
  const bx = p2.easting, by = p2.northing;
  const cx = p3.easting, cy = p3.northing;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < EPS) return null; // collinear
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  const center: Pt = { easting: ux, northing: uy };
  const radius = Math.hypot(ux - ax, uy - ay);
  return { center, radius };
}

/** Perpendicular foot of point p onto line a-b (infinite line). */
export function perpendicularFoot(p: Pt, a: Pt, b: Pt): Pt {
  const dE = b.easting - a.easting, dN = b.northing - a.northing;
  const denom = dE * dE + dN * dN;
  if (denom < EPS) return { ...a };
  const t = ((p.easting - a.easting) * dE + (p.northing - a.northing) * dN) / denom;
  return { easting: a.easting + t * dE, northing: a.northing + t * dN };
}

/** Signed perpendicular offset of p from line a→b. Positive = right of forward direction. */
export function offsetFromLine(p: Pt, a: Pt, b: Pt): number {
  const dE = b.easting - a.easting, dN = b.northing - a.northing;
  const len = Math.hypot(dE, dN);
  if (len < EPS) return 0;
  // Right-of-line in surveying = (forward direction × point) where forward is azimuth.
  // Forward vector in (E,N): (dE, dN). Rotated 90° clockwise (right side): (dN, -dE).
  return ((p.easting - a.easting) * dN - (p.northing - a.northing) * dE) / len;
}
