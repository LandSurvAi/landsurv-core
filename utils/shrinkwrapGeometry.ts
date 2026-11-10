/**
 * Geometry helpers for the interactive shrinkwrap editor.
 *
 * The canvas owns hit-testing and drawing; these helpers stay pure so the
 * "points inside this freehand loop" and "pin this point onto the hull"
 * behavior can be tested without a DOM.
 */

export interface ShrinkwrapPoint2D {
  easting: number;
  northing: number;
}

function pointOnSegment(
  point: ShrinkwrapPoint2D,
  a: ShrinkwrapPoint2D,
  b: ShrinkwrapPoint2D,
): boolean {
  const cross =
    (b.easting - a.easting) * (point.northing - a.northing) -
    (b.northing - a.northing) * (point.easting - a.easting);
  if (Math.abs(cross) > 1e-7) return false;

  const dot =
    (point.easting - a.easting) * (b.easting - a.easting) +
    (point.northing - a.northing) * (b.northing - a.northing);
  if (dot < 0) return false;

  const lengthSq =
    (b.easting - a.easting) ** 2 + (b.northing - a.northing) ** 2;
  return dot <= lengthSq;
}

/** Ray-casting test. Points exactly on an edge count as inside. */
export function pointInPolygon(
  point: ShrinkwrapPoint2D,
  polygon: ShrinkwrapPoint2D[],
): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j];
    const b = polygon[i];
    if (pointOnSegment(point, a, b)) return true;

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

export function partitionPointsByPolygon<T extends ShrinkwrapPoint2D>(
  points: T[],
  polygon: ShrinkwrapPoint2D[],
): { inside: T[]; outside: T[] } {
  const inside: T[] = [];
  const outside: T[] = [];
  for (const point of points) {
    (pointInPolygon(point, polygon) ? inside : outside).push(point);
  }
  return { inside, outside };
}

function distanceSqToSegment(
  point: ShrinkwrapPoint2D,
  a: ShrinkwrapPoint2D,
  b: ShrinkwrapPoint2D,
): number {
  const dx = b.easting - a.easting;
  const dy = b.northing - a.northing;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1e-12) {
    return (point.easting - a.easting) ** 2 + (point.northing - a.northing) ** 2;
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.easting - a.easting) * dx + (point.northing - a.northing) * dy) /
        lengthSq,
    ),
  );
  const closestE = a.easting + t * dx;
  const closestN = a.northing + t * dy;
  return (point.easting - closestE) ** 2 + (point.northing - closestN) ** 2;
}

/**
 * Make a point an actual hull vertex by inserting it into the nearest edge.
 * Used when the user clicks a green "+" on a point outside the current hull.
 * The rest of the hull is left intact, so adding one outlier does not make the
 * whole boundary convex (or "spider out").
 */
export function insertPinnedPointsIntoHull<T extends ShrinkwrapPoint2D>(
  hull: T[],
  pinned: T[],
): T[] {
  if (hull.length < 3) return hull.slice();

  let result = hull.slice();
  for (const point of pinned) {
    if (
      result.some(
        existing =>
          Math.abs(existing.easting - point.easting) < 1e-9 &&
          Math.abs(existing.northing - point.northing) < 1e-9,
      )
    ) {
      continue;
    }

    let insertAfter = 0;
    let nearest = Infinity;
    for (let i = 0; i < result.length; i++) {
      const a = result[i];
      const b = result[(i + 1) % result.length];
      const distance = distanceSqToSegment(point, a, b);
      if (distance < nearest) {
        nearest = distance;
        insertAfter = i;
      }
    }
    result = [
      ...result.slice(0, insertAfter + 1),
      point,
      ...result.slice(insertAfter + 1),
    ];
  }
  return result;
}
