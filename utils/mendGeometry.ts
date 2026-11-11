/**
 * Pure geometry for the line/arc MEND (M) closing curve.
 *
 * Unlike the old close, the closing arc does not merely end somewhere on the
 * first segment: it has to MATE with the segment tangentially. A circle that
 * leaves the chain's last point on the last segment's end tangent is a
 * one-parameter family; requiring it to touch the mating line cuts that down
 * to a finite set of solutions. The tangency point generally sits somewhere
 * off the segment's ends, so the segment is lengthened or shortened to meet
 * the curve. That adjustment is what makes the joint smooth.
 *
 * World coordinates are x = easting, y = northing, and bearings follow the
 * survey convention used by the canvas (azimuth from north, clockwise).
 */

import { formatBearing } from './cogo.ts';

export interface MendPoint {
  easting: number;
  northing: number;
}

export interface MendArc {
  centerEasting: number;
  centerNorthing: number;
  radius: number;
  arcLength: number;
  sweep: number;
  direction: 'left' | 'right';
  tangentBearing: string;
  chordBearing: string;
  end: MendPoint;
  endTangent: { x: number; y: number };
  /** Signed distance along the mating line's direction from its `from` end. */
  mateOffset: number;
}

export interface MendSegment {
  from: MendPoint;
  to: MendPoint;
}

export interface MendCandidate {
  arc: MendArc;
  /** End of the mating segment that has to move to meet the closing arc. */
  movedEnd: 'from' | 'to';
  newPoint: MendPoint;
  /** Signed length change of the mating segment (positive = lengthened). */
  adjustment: number;
  /** True when the closing arc arrives along the segment's from→to direction. */
  alongSegment: boolean;
}

/** A mating segment may grow by at most this many times its own length. */
const MAX_LENGTHEN_RATIO = 4;
const EPSILON = 1e-9;

const normalizeBearing = (angle: number): number => {
  let value = angle % (2 * Math.PI);
  if (value < 0) value += 2 * Math.PI;
  return value;
};

const unit = (vector: { x: number; y: number }): { x: number; y: number } | null => {
  const length = Math.hypot(vector.x, vector.y);
  if (!Number.isFinite(length) || length < EPSILON) return null;
  return { x: vector.x / length, y: vector.y / length };
};

/**
 * Every non-degenerate circle that starts at `start` tangent to
 * `startTangent` and touches the mating line (through `matePoint`, direction
 * `mateTangent`) tangentially.
 *
 * The tangent at the touch point is parallel to the mating line; both
 * directions are returned because a closing curve may merge into the segment
 * in either reading. Callers rank the results.
 */
export function computeTangentMendArcs(
  start: MendPoint,
  startTangent: { x: number; y: number },
  matePoint: MendPoint,
  mateTangent: { x: number; y: number },
): MendArc[] {
  const t = unit(startTangent);
  const u = unit(mateTangent);
  if (!t || !u) return [];

  // Signed perpendicular offset of the start from the mating line. A circle
  // tangent to the line on the start's side has this as its diameter distance.
  const q = (start.easting - matePoint.easting) * u.y
    - (start.northing - matePoint.northing) * u.x;
  const tDotU = t.x * u.x + t.y * u.y;
  const centeredTangentBearing = formatBearing(normalizeBearing(Math.atan2(t.x, t.y)));
  const solutions: MendArc[] = [];
  const seen = new Set<string>();

  for (const side of [1, -1] as const) {
    // Center sits on the chosen side of the start tangent.
    const normalX = -t.y * side;
    const normalY = t.x * side;
    // |(center - matePoint) × u| = radius gives two linear branches in r.
    const denominators = [1 + side * tDotU, side * tDotU - 1];
    for (const denominator of denominators) {
      if (Math.abs(denominator) < EPSILON) continue;
      const radius = q / denominator;
      if (!Number.isFinite(radius) || radius < 1e-6) continue;

      const centerEasting = start.easting + radius * normalX;
      const centerNorthing = start.northing + radius * normalY;
      const mateOffset =
        (centerEasting - matePoint.easting) * u.x
        + (centerNorthing - matePoint.northing) * u.y;
      const endEasting = matePoint.easting + mateOffset * u.x;
      const endNorthing = matePoint.northing + mateOffset * u.y;

      if (Math.hypot(endEasting - start.easting, endNorthing - start.northing) < 1e-6) continue;
      if (Math.abs(Math.hypot(centerEasting - endEasting, centerNorthing - endNorthing) - radius) > 1e-4) continue;

      const startAngle = Math.atan2(start.northing - centerNorthing, start.easting - centerEasting);
      const endAngle = Math.atan2(endNorthing - centerNorthing, endEasting - centerEasting);
      const rawSweep = side === 1 ? endAngle - startAngle : startAngle - endAngle;
      const sweep = ((rawSweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      if (sweep < 1e-6 || 2 * Math.PI - sweep < 1e-6) continue;

      const signedSweep = side === 1 ? sweep : -sweep;
      const cosSweep = Math.cos(signedSweep);
      const sinSweep = Math.sin(signedSweep);
      const endTangent = {
        x: t.x * cosSweep - t.y * sinSweep,
        y: t.x * sinSweep + t.y * cosSweep,
      };
      // A tangency solution always lands parallel to the mating line; reject
      // numeric drift so the preview can never show a kinked joint.
      if (Math.abs(endTangent.x * u.x + endTangent.y * u.y) < 1 - 1e-6) continue;

      const key = [
        centerEasting.toFixed(6),
        centerNorthing.toFixed(6),
        radius.toFixed(6),
        sweep.toFixed(6),
      ].join(':');
      if (seen.has(key)) continue;
      seen.add(key);

      solutions.push({
        centerEasting,
        centerNorthing,
        radius,
        arcLength: radius * sweep,
        sweep,
        direction: side === 1 ? 'left' : 'right',
        tangentBearing: centeredTangentBearing,
        chordBearing: formatBearing(normalizeBearing(Math.atan2(
          endEasting - start.easting,
          endNorthing - start.northing,
        ))),
        end: { easting: endEasting, northing: endNorthing },
        endTangent,
        mateOffset,
      });
    }
  }

  return solutions;
}

/**
 * Turn tangent-arc solutions into concrete mating-segment edits.
 *
 * `onlyMove` pins which end may be adjusted. The live chain's first segment
 * must keep its far end, because that joint is already committed; mending
 * into any other segment may move whichever end is nearer the tangency point.
 * Candidates that would flip the segment back on itself or stretch it beyond
 * the growth cap are dropped.
 */
export function resolveMendCandidates(
  start: MendPoint,
  startTangent: { x: number; y: number },
  segment: MendSegment,
  options?: { onlyMove?: 'from' | 'to' },
): MendCandidate[] {
  const direction = unit({
    x: segment.to.easting - segment.from.easting,
    y: segment.to.northing - segment.from.northing,
  });
  if (!direction) return [];
  const length = Math.hypot(
    segment.to.easting - segment.from.easting,
    segment.to.northing - segment.from.northing,
  );

  const candidates: MendCandidate[] = [];
  for (const arc of computeTangentMendArcs(start, startTangent, segment.from, direction)) {
    const offset = arc.mateOffset;
    let movedEnd: 'from' | 'to';
    if (options?.onlyMove === 'from') {
      // The tangency point has to stay on this side of the committed far end.
      if (offset > length - 1e-6) continue;
      movedEnd = 'from';
    } else if (options?.onlyMove === 'to') {
      if (offset < 1e-6) continue;
      movedEnd = 'to';
    } else {
      movedEnd = offset <= length / 2 ? 'from' : 'to';
    }

    const stays = movedEnd === 'from' ? segment.to : segment.from;
    if (Math.hypot(arc.end.easting - stays.easting, arc.end.northing - stays.northing) < 1e-6) continue;

    const adjustment = movedEnd === 'from' ? -offset : offset - length;
    if (adjustment > 0 && adjustment > length * MAX_LENGTHEN_RATIO) continue;

    candidates.push({
      arc,
      movedEnd,
      newPoint: { easting: arc.end.easting, northing: arc.end.northing },
      adjustment,
      alongSegment: arc.endTangent.x * direction.x + arc.endTangent.y * direction.y > 0,
    });
  }

  // Prefer a natural merge direction first, then the smallest change to the
  // drawn shape, then the tighter curve.
  return candidates.sort((a, b) => {
    if (a.alongSegment !== b.alongSegment) return a.alongSegment ? -1 : 1;
    const changeDelta = Math.abs(a.adjustment) - Math.abs(b.adjustment);
    if (Math.abs(changeDelta) > 1e-9) return changeDelta;
    return a.arc.radius - b.arc.radius;
  });
}
