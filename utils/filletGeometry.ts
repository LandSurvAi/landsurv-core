/**
 * Pure geometry for the CAD FILLET command.
 *
 * A fillet is computed from two straight segments and a radius. The lines are
 * treated as infinite for their intersection; the retained side of each line is
 * the side extending to its farther endpoint. This matches the common corner
 * case (two segments meeting at an endpoint) and gives a deterministic result
 * for crossing segments without needing per-line pick points.
 *
 * World coordinates are x = easting, y = northing.
 */

export interface FilletPoint {
  x: number;
  y: number;
}

export interface FilletSegment {
  start: FilletPoint;
  end: FilletPoint;
}

export interface FilletGeometry {
  /** Tangency point on the first line, where the arc starts. */
  tangent1: FilletPoint;
  /** Tangency point on the second line, where the arc ends. */
  tangent2: FilletPoint;
  center: FilletPoint;
  radius: number;
  /** Arc sweep in radians (always the minor corner arc). */
  centralAngle: number;
  /** True when travelling tangent1 → tangent2 turns left. */
  isLeftCurve: boolean;
  /** First line after trimming: far endpoint → tangent point. */
  trimmed1: FilletSegment;
  /** Second line after trimming: tangent point → far endpoint. */
  trimmed2: FilletSegment;
}

export type FilletResult =
  | { ok: true; geometry: FilletGeometry }
  | { ok: false; error: string };

const EPSILON = 1e-9;

const distance = (a: FilletPoint, b: FilletPoint): number =>
  Math.hypot(b.x - a.x, b.y - a.y);

const cross = (ax: number, ay: number, bx: number, by: number): number =>
  ax * by - ay * bx;

const farEndpoint = (segment: FilletSegment, intersection: FilletPoint): FilletPoint =>
  distance(segment.start, intersection) >= distance(segment.end, intersection)
    ? segment.start
    : segment.end;

/**
 * Compute the fillet arc and the trimmed line segments.
 *
 * The radius is in world units. Returns a specific error for degenerate or
 * over-large input so the command line can explain why nothing changed.
 */
export function computeLineFillet(
  line1: FilletSegment,
  line2: FilletSegment,
  radius: number,
): FilletResult {
  if (!(radius > 0) || !Number.isFinite(radius)) {
    return { ok: false, error: 'FILLET: Radius must be a positive number.' };
  }

  const d1 = { x: line1.end.x - line1.start.x, y: line1.end.y - line1.start.y };
  const d2 = { x: line2.end.x - line2.start.x, y: line2.end.y - line2.start.y };
  const len1 = Math.hypot(d1.x, d1.y);
  const len2 = Math.hypot(d2.x, d2.y);

  if (len1 < EPSILON || len2 < EPSILON) {
    return { ok: false, error: 'FILLET: Both selected entities must have length.' };
  }

  const denominator = cross(d1.x, d1.y, d2.x, d2.y);
  if (Math.abs(denominator) <= EPSILON * len1 * len2) {
    return { ok: false, error: 'FILLET: The selected lines are parallel.' };
  }

  const offset = { x: line2.start.x - line1.start.x, y: line2.start.y - line1.start.y };
  const along1 = cross(offset.x, offset.y, d2.x, d2.y) / denominator;
  const intersection = {
    x: line1.start.x + d1.x * along1,
    y: line1.start.y + d1.y * along1,
  };

  const far1 = farEndpoint(line1, intersection);
  const far2 = farEndpoint(line2, intersection);
  const ray1 = { x: far1.x - intersection.x, y: far1.y - intersection.y };
  const ray2 = { x: far2.x - intersection.x, y: far2.y - intersection.y };
  const ray1Length = Math.hypot(ray1.x, ray1.y);
  const ray2Length = Math.hypot(ray2.x, ray2.y);

  if (ray1Length < EPSILON || ray2Length < EPSILON) {
    return { ok: false, error: 'FILLET: Could not resolve the selected lines.' };
  }

  const u1 = { x: ray1.x / ray1Length, y: ray1.y / ray1Length };
  const u2 = { x: ray2.x / ray2Length, y: ray2.y / ray2Length };
  const dot = Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y));
  const angle = Math.acos(dot);

  if (angle < 1e-4 || Math.PI - angle < 1e-4) {
    return { ok: false, error: 'FILLET: The selected lines do not form a corner.' };
  }

  // Distance from the corner intersection to each tangency point.
  const tangentDistance = radius / Math.tan(angle / 2);
  if (tangentDistance > ray1Length + 1e-6 || tangentDistance > ray2Length + 1e-6) {
    return { ok: false, error: 'FILLET: Radius is too large for the selected lines.' };
  }
  if (ray1Length - tangentDistance < 1e-6 || ray2Length - tangentDistance < 1e-6) {
    return { ok: false, error: 'FILLET: Radius would consume the selected lines.' };
  }

  const tangent1 = {
    x: intersection.x + u1.x * tangentDistance,
    y: intersection.y + u1.y * tangentDistance,
  };
  const tangent2 = {
    x: intersection.x + u2.x * tangentDistance,
    y: intersection.y + u2.y * tangentDistance,
  };

  const bisector = { x: u1.x + u2.x, y: u1.y + u2.y };
  const bisectorLength = Math.hypot(bisector.x, bisector.y);
  if (bisectorLength < EPSILON) {
    return { ok: false, error: 'FILLET: The selected lines do not form a corner.' };
  }
  const centerDistance = radius / Math.sin(angle / 2);
  const center = {
    x: intersection.x + (bisector.x / bisectorLength) * centerDistance,
    y: intersection.y + (bisector.y / bisectorLength) * centerDistance,
  };

  // The arc is a minor arc (π - interior angle) between the tangent points.
  const centralAngle = Math.PI - angle;
  const chord = { x: tangent2.x - tangent1.x, y: tangent2.y - tangent1.y };
  const toCenter = { x: center.x - tangent1.x, y: center.y - tangent1.y };
  const isLeftCurve = cross(chord.x, chord.y, toCenter.x, toCenter.y) > 0;

  return {
    ok: true,
    geometry: {
      tangent1,
      tangent2,
      center,
      radius,
      centralAngle,
      isLeftCurve,
      trimmed1: { start: far1, end: tangent1 },
      trimmed2: { start: tangent2, end: far2 },
    },
  };
}
