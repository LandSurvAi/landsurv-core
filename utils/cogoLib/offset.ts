// Polyline parallel offset (left/right). Miter/bevel join handling.
// Pure 2D in (E,N). Open and closed polylines supported.

import { Pt } from './types';

const EPS = 1e-9;

/** Offset polyline by `distance` (positive = right of forward direction; negative = left).
 *  join: 'miter' (default) | 'bevel'. miterLimit caps miter spike length. */
export function offsetPolyline(
  vertices: Pt[],
  distance: number,
  closed = false,
  join: 'miter' | 'bevel' = 'miter',
  miterLimit = 10,
): Pt[] {
  if (vertices.length < 2) return [];
  // Compute right-perpendicular unit vector for each segment.
  const segPerp: { e: number; n: number }[] = [];
  const n = vertices.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    const dE = b.easting - a.easting;
    const dN = b.northing - a.northing;
    const len = Math.hypot(dE, dN);
    if (len < EPS) { segPerp.push({ e: 0, n: 0 }); continue; }
    // Right-of-forward perpendicular: rotate (dE, dN) clockwise 90° → (dN, -dE).
    segPerp.push({ e: dN / len, n: -dE / len });
  }
  // Offset each segment, then compute miter at each interior vertex.
  const out: Pt[] = [];
  const offsetVertex = (idx: number): Pt | Pt[] => {
    if (!closed && (idx === 0 || idx === n - 1)) {
      const sIdx = idx === 0 ? 0 : last - 1;
      const p = vertices[idx];
      const perp = segPerp[sIdx];
      return { easting: p.easting + distance * perp.e, northing: p.northing + distance * perp.n };
    }
    const inIdx = (idx - 1 + last) % last;
    const outIdx = idx % last;
    const inP = segPerp[inIdx];
    const outP = segPerp[outIdx];
    const p = vertices[idx];
    // Miter direction = bisector of the two perpendiculars.
    const mE = (inP.e + outP.e);
    const mN = (inP.n + outP.n);
    const mLen = Math.hypot(mE, mN);
    if (mLen < EPS) {
      // Anti-parallel — use either perpendicular.
      return { easting: p.easting + distance * inP.e, northing: p.northing + distance * inP.n };
    }
    // Miter scale: distance / cos(half-angle), where cos = (in·m̂).
    const halfBisE = mE / mLen, halfBisN = mN / mLen;
    const cosHalf = inP.e * halfBisE + inP.n * halfBisN;
    if (cosHalf < EPS) {
      return { easting: p.easting + distance * halfBisE, northing: p.northing + distance * halfBisN };
    }
    const miterLen = distance / cosHalf;
    if (join === 'bevel' || Math.abs(miterLen) > Math.abs(distance) * miterLimit) {
      return [
        { easting: p.easting + distance * inP.e,  northing: p.northing + distance * inP.n },
        { easting: p.easting + distance * outP.e, northing: p.northing + distance * outP.n },
      ];
    }
    return { easting: p.easting + miterLen * halfBisE, northing: p.northing + miterLen * halfBisN };
  };

  for (let i = 0; i < n; i++) {
    const v = offsetVertex(i);
    if (Array.isArray(v)) out.push(...v);
    else out.push(v);
  }
  return out;
}

/** Single-side parallel offset of a single segment (no joins). */
export function offsetSegment(a: Pt, b: Pt, distance: number): { a: Pt; b: Pt } {
  const dE = b.easting - a.easting;
  const dN = b.northing - a.northing;
  const len = Math.hypot(dE, dN);
  if (len < EPS) return { a: { ...a }, b: { ...b } };
  const pE = dN / len, pN = -dE / len; // right perpendicular
  return {
    a: { easting: a.easting + distance * pE, northing: a.northing + distance * pN },
    b: { easting: b.easting + distance * pE, northing: b.northing + distance * pN },
  };
}
