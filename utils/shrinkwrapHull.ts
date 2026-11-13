/**
 * Boundary hulls for the shrinkwrap editor.
 *
 * The concave walker is a Moreira–Santos style K-nearest-neighbour tour. K
 * controls how tightly the boundary follows the shots, so the walk is
 * inherently input-dependent: on a dense or clustered cloud the best-scoring
 * candidate can turn back into the cloud and the tour can close a ring that
 * leaves most of the shots outside it. A ring like that draws as a thin,
 * squiggly ribbon (or a bare quadrilateral) instead of a boundary.
 *
 * Every closed ring is therefore validated before it is accepted: it must be a
 * simple ring and it must wrap the cloud. Invalid rings are retried with a
 * larger K, and the convex hull is the guaranteed-good final fallback.
 */

export interface HullPoint {
  easting: number;
  northing: number;
}

/**
 * Andrew's monotone-chain 2-D convex hull on (easting=x, northing=y).
 * Returns hull vertices without duplicates / colinear vertices.
 */
export function computeConvexHullPoints<T extends HullPoint>(pts: T[]): T[] {
  if (pts.length < 3) return pts.slice();
  const sorted = [...pts].sort((a, b) =>
    a.easting === b.easting ? a.northing - b.northing : a.easting - b.easting
  );
  const cross = (o: T, a: T, b: T) =>
    (a.easting - o.easting) * (b.northing - o.northing) -
    (a.northing - o.northing) * (b.easting - o.easting);
  const lower: T[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: T[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/**
 * Proper interior segment crossing. Shared endpoints do not count, so adjacent
 * hull edges and the closing edge never disqualify each other.
 */
function segmentsIntersect(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number,
): boolean {
  const d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
  if (Math.abs(d) < 1e-12) return false;
  const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d;
  const u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d;
  const eps = 1e-9;
  return t > eps && t < 1 - eps && u > eps && u < 1 - eps;
}

function signedRingArea(hull: HullPoint[]): number {
  let sum = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    sum += a.easting * b.northing - b.easting * a.northing;
  }
  return sum / 2;
}

function isSimpleRing(hull: HullPoint[]): boolean {
  const n = hull.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      // Adjacent edges (including the closing pair) share a vertex.
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      const c = hull[j];
      const d = hull[(j + 1) % n];
      if (segmentsIntersect(a.easting, a.northing, b.easting, b.northing, c.easting, c.northing, d.easting, d.northing)) {
        return false;
      }
    }
  }
  return true;
}

function pointInRing(point: HullPoint, hull: HullPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = hull.length - 1; i < hull.length; j = i++) {
    const a = hull[j];
    const b = hull[i];
    const intersects =
      (a.northing > point.northing) !== (b.northing > point.northing) &&
      point.easting <
        ((b.easting - a.easting) * (point.northing - a.northing)) /
          (b.northing - a.northing) +
          a.easting;
    if (intersects) inside = !inside;
  }
  return inside;
}

function distanceToRing(point: HullPoint, hull: HullPoint[]): number {
  let nearest = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const dx = b.easting - a.easting;
    const dy = b.northing - a.northing;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq < 1e-12
      ? 0
      : Math.max(0, Math.min(1, ((point.easting - a.easting) * dx + (point.northing - a.northing) * dy) / lengthSq));
    nearest = Math.min(nearest, Math.hypot(
      point.easting - (a.easting + t * dx),
      point.northing - (a.northing + t * dy),
    ));
  }
  return nearest;
}

/**
 * How far a shot may sit outside a hull edge and still count as wrapped.
 * Boundary shots are never exactly collinear, so a fixed tolerance either
 * rejects every concave hull on a jittered edge or accepts real chords. One
 * percent of the cloud's diagonal scales with the site: about 5 ft on a
 * 500-ft parcel, while a chord that cuts across the site is still caught.
 */
function enclosureTolerance(points: HullPoint[]): number {
  let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
  for (const p of points) {
    if (p.easting < minE) minE = p.easting;
    if (p.easting > maxE) maxE = p.easting;
    if (p.northing < minN) minN = p.northing;
    if (p.northing > maxN) maxN = p.northing;
  }
  const diagonal = Math.hypot(maxE - minE, maxN - minN);
  return Math.max(0.05, diagonal * 0.01);
}

/**
 * True when the ring is a simple polygon that wraps every source point.
 * Points that land on (or within tolerance of) an edge count as inside.
 */
export function hullEnclosesPoints(hull: HullPoint[], points: HullPoint[]): boolean {
  if (hull.length < 3) return false;
  if (Math.abs(signedRingArea(hull)) < 1e-9) return false;
  if (!isSimpleRing(hull)) return false;

  const tolerance = enclosureTolerance(points);
  for (const point of points) {
    if (pointInRing(point, hull)) continue;
    if (distanceToRing(point, hull) <= tolerance) continue;
    return false;
  }
  return true;
}

/**
 * Concave hull (Moreira–Santos KNN algorithm) with a validity gate.
 *
 * Walks the point cloud from the lowest point, choosing the K-nearest unvisited
 * candidate ranked by the turn from the previous edge and skipping edges that
 * would cross the ring. K controls concavity: small K is tight, large K trends
 * toward the convex hull.
 *
 * A closed ring is only returned when `hullEnclosesPoints` accepts it. If the
 * requested K produces a ribbon, a collapsed quad, or a chord across the
 * cloud, K is incremented and the walk is retried. On total failure the convex
 * hull is returned, so the user is never left with a boundary that excludes
 * most of their shots.
 */
export function computeConcaveHullPoints<T extends HullPoint>(pts: T[], k: number): T[] {
  if (pts.length < 3) return pts.slice();
  // Dedupe by xy — duplicate points break the angle-sort and the visited set.
  const seen = new Map<string, T>();
  for (const p of pts) seen.set(`${p.easting.toFixed(4)},${p.northing.toFixed(4)}`, p);
  const unique = Array.from(seen.values());
  if (unique.length < 3) return unique;
  if (unique.length === 3) return unique;

  const startK = Math.max(3, Math.min(k, unique.length - 1));

  const tryHull = (kk: number): T[] | null => {
    // Start at the bottom-most point (tie-break leftmost) — guaranteed to be on
    // the boundary, and the initial "previous direction" of due-west gives a
    // deterministic first step.
    let startIdx = 0;
    for (let i = 1; i < unique.length; i++) {
      const p = unique[i];
      const s = unique[startIdx];
      if (p.northing < s.northing || (p.northing === s.northing && p.easting < s.easting)) startIdx = i;
    }
    const start = unique[startIdx];
    const hull: T[] = [start];
    // The start stays eligible: choosing it closes the ring. Validation below
    // rejects a premature close instead of trusting it blindly.
    const visited = new Set<T>();
    let current = start;
    let prevAngle = Math.PI;
    let step = 1;

    while (step <= unique.length) {
      const candidates = unique
        .filter(p => p !== current && !visited.has(p))
        .map(p => ({
          pt: p,
          dist: Math.hypot(p.easting - current.easting, p.northing - current.northing),
        }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, kk);

      if (candidates.length === 0) return null;

      // Sort by turn from the previous-direction vector.
      const angled = candidates
        .map(c => {
          const ang = Math.atan2(c.pt.northing - current.northing, c.pt.easting - current.easting);
          let turn = prevAngle - ang;
          while (turn <= 0) turn += 2 * Math.PI;
          while (turn > 2 * Math.PI) turn -= 2 * Math.PI;
          return { ...c, turn };
        })
        .sort((a, b) => a.turn - b.turn);

      // Pick the first candidate whose edge doesn't cross any prior hull edge.
      let chosen: typeof angled[number] | null = null;
      for (const cand of angled) {
        let intersects = false;
        for (let i = 0; i < hull.length - 1; i++) {
          if (segmentsIntersect(
            current.easting, current.northing,
            cand.pt.easting, cand.pt.northing,
            hull[i].easting, hull[i].northing,
            hull[i + 1].easting, hull[i + 1].northing,
          )) { intersects = true; break; }
        }
        if (!intersects) { chosen = cand; break; }
      }
      if (!chosen) return null;

      if (chosen.pt === start) {
        return hull.length >= 3 ? hull : null;
      }

      hull.push(chosen.pt);
      visited.add(chosen.pt);
      prevAngle = Math.atan2(
        current.northing - chosen.pt.northing,
        current.easting - chosen.pt.easting,
      );
      current = chosen.pt;
      step++;
    }
    return null;
  };

  // Retry with larger K when the requested K closes an invalid ring. Cap
  // retries so a stubborn cloud cannot stall the recompute.
  const maxAttempts = Math.min(10, unique.length - startK);
  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    const kk = Math.min(unique.length - 1, startK + attempt);
    const result = tryHull(kk);
    if (result && hullEnclosesPoints(result, unique)) return result;
  }
  // Convex hull always wraps every point and is always simple.
  return computeConvexHullPoints(pts);
}
