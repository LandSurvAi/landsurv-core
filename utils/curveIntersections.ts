/**
 * Tangent-aware 2D curve intersections for canvas drafting.
 *
 * CAD work regularly produces grazing intersections: a tangent-tangent-radius
 * circle is tangent to its lines by construction, so the line/circle quadratic
 * has a double root. Squared coordinates turn that double root into a value
 * that lands either side of zero after floating-point rounding, so a
 * discriminant-only test reports "no intersection" for geometry that touches
 * exactly — which made TRIM and INTERSECTION osnap blind to TTR tangencies.
 *
 * These helpers decide tangency geometrically (perpendicular distance from the
 * centre to the line) and return the perpendicular foot, which IS the tangency
 * point, so the result is exact regardless of coordinate magnitude.
 */

export interface XY {
  x: number;
  y: number;
}

export type CurveShape =
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'circle'; center: XY; radius: number }
  | { kind: 'arc'; center: XY; radius: number; startAngle: number; centralAngle: number; isLeftCurve: boolean };

export interface CurveHit extends XY {
  /** Parameter along the segment: 0 at the segment start, 1 at its end. */
  t: number;
  /** True when the segment only grazes the circle at a single point. */
  tangent: boolean;
}

const RELATIVE_EPS = 1e-9;
const ANGULAR_EPS = 1e-5;

/**
 * World-unit tolerance for coincidence tests. Scales with the largest
 * coordinate so state-plane sized drawings keep the same real-world accuracy
 * as a sketch near the origin.
 */
export function geometryTolerance(...values: Array<XY | number | undefined>): number {
  let scale = 1;
  for (const value of values) {
    if (value === undefined) continue;
    if (typeof value === 'number') scale = Math.max(scale, Math.abs(value));
    else scale = Math.max(scale, Math.abs(value.x), Math.abs(value.y));
  }
  return scale * RELATIVE_EPS;
}

/** Point on an arc at `sweep` radians from its start, following its direction. */
export function arcPoint(arc: { center: XY; radius: number; startAngle: number; isLeftCurve: boolean }, sweep: number): XY {
  const angle = arc.isLeftCurve ? arc.startAngle + sweep : arc.startAngle - sweep;
  return {
    x: arc.center.x + arc.radius * Math.cos(angle),
    y: arc.center.y + arc.radius * Math.sin(angle),
  };
}

/** True when `angle` lies on the drawn span of the arc. */
export function angleWithinArc(
  angle: number,
  startAngle: number,
  centralAngle: number,
  isLeftCurve: boolean,
  tolerance = ANGULAR_EPS,
): boolean {
  const tau = 2 * Math.PI;
  let sweep = isLeftCurve ? (angle - startAngle) % tau : (startAngle - angle) % tau;
  if (sweep < 0) sweep += tau;
  return sweep <= centralAngle + tolerance || sweep >= tau - tolerance;
}

/** Shortest distance from `point` to the drawn part of the curve. */
export function distanceToCurve(curve: CurveShape, point: XY): number {
  if (curve.kind === 'line') {
    const dx = curve.x2 - curve.x1;
    const dy = curve.y2 - curve.y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-18) return Math.hypot(point.x - curve.x1, point.y - curve.y1);
    let t = ((point.x - curve.x1) * dx + (point.y - curve.y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(point.x - (curve.x1 + t * dx), point.y - (curve.y1 + t * dy));
  }

  const centerDist = Math.hypot(point.x - curve.center.x, point.y - curve.center.y);
  if (curve.kind === 'circle') return Math.abs(centerDist - curve.radius);

  const angle = Math.atan2(point.y - curve.center.y, point.x - curve.center.x);
  if (angleWithinArc(angle, curve.startAngle, curve.centralAngle, curve.isLeftCurve)) {
    return Math.abs(centerDist - curve.radius);
  }
  const start = arcPoint(curve, 0);
  const end = arcPoint(curve, curve.centralAngle);
  return Math.min(
    Math.hypot(point.x - start.x, point.y - start.y),
    Math.hypot(point.x - end.x, point.y - end.y),
  );
}

/**
 * Intersections between segment `a→b` and a circle. Returns 0, 1 (tangent or
 * single crossing) or 2 points. A tangency is reported once, at the
 * perpendicular foot from the centre.
 */
export function segmentCircleIntersections(
  a: XY,
  b: XY,
  center: XY,
  radius: number,
  tolerance = geometryTolerance(a, b, center, radius),
): CurveHit[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-18 || radius <= 0) return [];
  const len = Math.sqrt(lenSq);

  const fx = a.x - center.x;
  const fy = a.y - center.y;

  // Geometric tangency test first. The foot of the perpendicular from the
  // centre is the exact tangency point for a TTR circle.
  const footT = -(fx * dx + fy * dy) / lenSq;
  const footX = a.x + footT * dx;
  const footY = a.y + footT * dy;
  const footDist = Math.hypot(center.x - footX, center.y - footY);

  if (Math.abs(footDist - radius) <= tolerance) {
    const endEps = tolerance / len;
    if (footT < -endEps || footT > 1 + endEps) return [];
    return [{ x: footX, y: footY, t: footT, tangent: true }];
  }

  const aa = lenSq;
  const bb = 2 * (fx * dx + fy * dy);
  const cc = fx * fx + fy * fy - radius * radius;
  const disc = bb * bb - 4 * aa * cc;
  if (disc < 0) return [];

  const sqrtDisc = Math.sqrt(disc);
  const t1 = (-bb - sqrtDisc) / (2 * aa);
  const t2 = (-bb + sqrtDisc) / (2 * aa);
  const endEps = tolerance / len;
  const hits: CurveHit[] = [];
  for (const t of [t1, t2]) {
    if (t < -endEps || t > 1 + endEps) continue;
    hits.push({ x: a.x + t * dx, y: a.y + t * dy, t, tangent: false });
  }
  return hits;
}

/**
 * Intersections between two circles. Coincident/tangent cases are returned
 * once, at the exact contact point on the centre line.
 */
export function circleCircleIntersections(
  center1: XY,
  radius1: number,
  center2: XY,
  radius2: number,
  tolerance = geometryTolerance(center1, center2, radius1, radius2),
): XY[] {
  if (radius1 <= 0 || radius2 <= 0) return [];
  const dx = center2.x - center1.x;
  const dy = center2.y - center1.y;
  const d = Math.hypot(dx, dy);
  if (d <= tolerance) return [];

  const ux = dx / d;
  const uy = dy / d;

  // External tangency: contact sits between the two centres.
  if (Math.abs(d - (radius1 + radius2)) <= tolerance) {
    return [{ x: center1.x + radius1 * ux, y: center1.y + radius1 * uy }];
  }

  // Internal tangency: contact sits on the centre line, on the side of the
  // smaller circle.
  if (Math.abs(d - Math.abs(radius1 - radius2)) <= tolerance) {
    const sign = radius1 >= radius2 ? 1 : -1;
    return [{ x: center1.x + sign * radius1 * ux, y: center1.y + sign * radius1 * uy }];
  }

  if (d > radius1 + radius2 || d < Math.abs(radius1 - radius2)) return [];

  const along = (radius1 * radius1 - radius2 * radius2 + d * d) / (2 * d);
  const hSq = radius1 * radius1 - along * along;
  const h = Math.sqrt(Math.max(0, hSq));
  const midX = center1.x + along * ux;
  const midY = center1.y + along * uy;

  if (h <= tolerance) {
    return [{ x: midX, y: midY }];
  }
  return [
    { x: midX - h * uy, y: midY + h * ux },
    { x: midX + h * uy, y: midY - h * ux },
  ];
}

function onCurve(curve: CurveShape, point: XY, tolerance: number): boolean {
  if (curve.kind === 'line') return true;
  if (curve.kind === 'circle') return true;
  const angle = Math.atan2(point.y - curve.center.y, point.x - curve.center.x);
  return angleWithinArc(angle, curve.startAngle, curve.centralAngle, curve.isLeftCurve, Math.max(ANGULAR_EPS, tolerance / Math.max(curve.radius, 1e-9)));
}

/** Intersections between any two supported curve shapes, trimmed to their drawn extent. */
export function curveCurveIntersections(a: CurveShape, b: CurveShape, tolerance?: number): XY[] {
  const tol = tolerance ?? geometryTolerance(
    ...(a.kind === 'line' ? [{ x: a.x1, y: a.y1 }, { x: a.x2, y: a.y2 }] : [a.center, a.radius]),
    ...(b.kind === 'line' ? [{ x: b.x1, y: b.y1 }, { x: b.x2, y: b.y2 }] : [b.center, b.radius]),
  );

  const lineCircle = (line: Extract<CurveShape, { kind: 'line' }>, circle: Extract<CurveShape, { kind: 'circle' | 'arc' }>): XY[] =>
    segmentCircleIntersections(
      { x: line.x1, y: line.y1 },
      { x: line.x2, y: line.y2 },
      circle.center,
      circle.radius,
      tol,
    )
      .map(hit => ({ x: hit.x, y: hit.y }))
      .filter(hit => onCurve(circle, hit, tol));

  if (a.kind === 'line' && b.kind === 'line') {
    const ax = a.x2 - a.x1;
    const ay = a.y2 - a.y1;
    const bx = b.x2 - b.x1;
    const by = b.y2 - b.y1;
    const lenA = Math.hypot(ax, ay);
    const lenB = Math.hypot(bx, by);
    if (lenA < 1e-12 || lenB < 1e-12) return [];
    const denom = ax * by - ay * bx;
    if (Math.abs(denom) <= 1e-12 * lenA * lenB) return [];

    const rx = b.x1 - a.x1;
    const ry = b.y1 - a.y1;
    const ta = (rx * by - ry * bx) / denom;
    const tb = (rx * ay - ry * ax) / denom;
    const epsA = tol / lenA;
    const epsB = tol / lenB;
    if (ta < -epsA || ta > 1 + epsA || tb < -epsB || tb > 1 + epsB) return [];
    return [{ x: a.x1 + ta * ax, y: a.y1 + ta * ay }];
  }

  if (a.kind === 'line') return lineCircle(a, b as Extract<CurveShape, { kind: 'circle' | 'arc' }>);
  if (b.kind === 'line') return lineCircle(b, a as Extract<CurveShape, { kind: 'circle' | 'arc' }>);

  return circleCircleIntersections(a.center, a.radius, b.center, b.radius, tol)
    .filter(hit => onCurve(a, hit, tol) && onCurve(b, hit, tol));
}
