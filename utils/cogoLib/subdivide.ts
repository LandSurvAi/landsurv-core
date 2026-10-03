// Parcel subdivision routines. All inputs are closed polygons in (E,N).

import { Pt } from './types';
import { signedArea, shoelaceArea } from './area';
import { intersectLL } from './intersect';

/** Cut a polygon with a directed line a→b. Returns left and right halves (relative to a→b). */
export function cutPolygonByLine(polygon: Pt[], a: Pt, b: Pt): { left: Pt[]; right: Pt[] } | null {
  // Walk polygon edges; for each edge collect intersections with the cut line.
  const dE = b.easting - a.easting;
  const dN = b.northing - a.northing;
  const sideOf = (p: Pt) => (p.easting - a.easting) * dN - (p.northing - a.northing) * dE;
  const left: Pt[] = [];
  const right: Pt[] = [];
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const cur = polygon[i];
    const nxt = polygon[(i + 1) % n];
    const sCur = sideOf(cur);
    const sNxt = sideOf(nxt);
    if (sCur >= 0) left.push(cur);
    if (sCur <= 0) right.push(cur);
    if ((sCur > 0 && sNxt < 0) || (sCur < 0 && sNxt > 0)) {
      const xpt = intersectLL(cur, nxt, a, b);
      if (xpt) { left.push(xpt); right.push(xpt); }
    }
  }
  if (left.length < 3 || right.length < 3) return null;
  return { left, right };
}

/** Equal-area swing line: rotate a chord pivoting at vertex `pivotIndex` until the polygon
 *  splits into two pieces of areas (target, total - target). Binary-searches the swing angle.
 *  Direction is defined by an initial guess azimuth (radians from north). */
export function swingEqualArea(polygon: Pt[], pivotIndex: number, targetArea: number, initialAzimuth: number): { cutEnd: Pt; left: Pt[]; right: Pt[]; azimuth: number } | null {
  const total = shoelaceArea(polygon);
  if (targetArea <= 0 || targetArea >= total) return null;
  const pivot = polygon[pivotIndex];
  // Angular bracket: search ±π/2 around initialAzimuth.
  let lo = initialAzimuth - Math.PI / 2;
  let hi = initialAzimuth + Math.PI / 2;
  // Far-end probe distance: 10× the polygon diagonal — guarantees the chord exits.
  let maxDim = 0;
  for (const p of polygon) {
    for (const q of polygon) {
      const d = Math.hypot(p.easting - q.easting, p.northing - q.northing);
      if (d > maxDim) maxDim = d;
    }
  }
  const probe = maxDim * 10;
  const areaAt = (az: number) => {
    const end: Pt = {
      easting: pivot.easting + probe * Math.sin(az),
      northing: pivot.northing + probe * Math.cos(az),
    };
    const split = cutPolygonByLine(polygon, pivot, end);
    if (!split) return null;
    return { left: shoelaceArea(split.left), right: shoelaceArea(split.right), end, split };
  };
  // Define f(az) = leftArea(az) - targetArea; find zero.
  const sign = (a: ReturnType<typeof areaAt>) => a ? a.left - targetArea : NaN;
  let fLo = sign(areaAt(lo));
  let fHi = sign(areaAt(hi));
  // Sweep to find a sign change if initial bracket fails.
  if (isNaN(fLo) || isNaN(fHi) || fLo * fHi > 0) {
    let found = false;
    for (let i = 0; i < 32; i++) {
      const az = initialAzimuth - Math.PI / 2 + (Math.PI * i / 32);
      const v = sign(areaAt(az));
      if (!isNaN(v) && (isNaN(fLo) || v * fLo < 0)) { hi = az; fHi = v; found = true; break; }
      if (isNaN(fLo)) { lo = az; fLo = v; }
    }
    if (!found) return null;
  }
  // Bisection.
  let mid = (lo + hi) / 2;
  let result = areaAt(mid);
  for (let i = 0; i < 60; i++) {
    mid = (lo + hi) / 2;
    result = areaAt(mid);
    const fMid = sign(result);
    if (isNaN(fMid)) break;
    if (Math.abs(fMid) < 1e-6) break;
    if (fMid * fLo < 0) { hi = mid; fHi = fMid; }
    else { lo = mid; fLo = fMid; }
  }
  if (!result) return null;
  return { cutEnd: result.end, left: result.split.left, right: result.split.right, azimuth: mid };
}

/** Equal-area parallel cut: parallel to a given azimuth, slid along the perpendicular axis until
 *  the polygon splits into two pieces of areas (target, total-target). */
export function parallelEqualArea(polygon: Pt[], targetArea: number, azimuth: number): { a: Pt; b: Pt; left: Pt[]; right: Pt[] } | null {
  const total = shoelaceArea(polygon);
  if (targetArea <= 0 || targetArea >= total) return null;
  // Direction unit:
  const dE = Math.sin(azimuth), dN = Math.cos(azimuth);
  // Perpendicular axis direction (right of forward):
  const pE = dN, pN = -dE;
  // Project all polygon vertices onto perpendicular axis to find sweep range.
  const ts = polygon.map(v => v.easting * pE + v.northing * pN);
  const tMin = Math.min(...ts), tMax = Math.max(...ts);
  const polyMidE = polygon.reduce((s, v) => s + v.easting, 0) / polygon.length;
  const polyMidN = polygon.reduce((s, v) => s + v.northing, 0) / polygon.length;
  const probe = Math.hypot(tMax - tMin, tMax - tMin) * 10 + 1;
  const cutAt = (t: number) => {
    // Anchor point on the perpendicular at offset t (relative to centroid projection).
    const cE = polyMidE * pE + polyMidN * pN;
    const off = t - cE;
    const aE = polyMidE + off * pE - probe * dE;
    const aN = polyMidN + off * pN - probe * dN;
    const bE = polyMidE + off * pE + probe * dE;
    const bN = polyMidN + off * pN + probe * dN;
    const a: Pt = { easting: aE, northing: aN };
    const b: Pt = { easting: bE, northing: bN };
    const split = cutPolygonByLine(polygon, a, b);
    return split ? { a, b, ...split, leftArea: shoelaceArea(split.left), rightArea: shoelaceArea(split.right) } : null;
  };
  // Bisection on t.
  let lo = tMin - 1, hi = tMax + 1;
  let res = cutAt((lo + hi) / 2);
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    res = cutAt(mid);
    if (!res) { lo = mid; continue; }
    const f = res.leftArea - targetArea;
    if (Math.abs(f) < 1e-6) break;
    if (f > 0) hi = mid; else lo = mid;
  }
  if (!res) return null;
  return { a: res.a, b: res.b, left: res.left, right: res.right };
}

/** Reverse the orientation of a polygon if its signed area is negative (so it reads CCW). */
export function ensureCCW(polygon: Pt[]): Pt[] {
  return signedArea(polygon) < 0 ? polygon.slice().reverse() : polygon.slice();
}
