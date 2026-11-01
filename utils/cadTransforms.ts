/**
 * Pure planar transform and primitive-geometry helpers for the canvas CAD
 * command line. Kept free of React/DOM state so they can be unit-tested and
 * reused by any command handler.
 */

import type { SurveyLine } from '../types';

export interface PlanarPoint {
  x: number;
  y: number;
}

export interface PlanarTransform {
  apply: (point: PlanarPoint) => PlanarPoint;
  /** Uniform factor applied to curve radii and arc lengths. */
  scaleFactor: number;
  /** True when the transform reverses orientation (a reflection). */
  flipsOrientation: boolean;
}

export const translationTransform = (dx: number, dy: number): PlanarTransform => ({
  apply: ({ x, y }) => ({ x: x + dx, y: y + dy }),
  scaleFactor: 1,
  flipsOrientation: false,
});

export const rotationTransform = (pivot: PlanarPoint, angleRadians: number): PlanarTransform => {
  const cos = Math.cos(angleRadians);
  const sin = Math.sin(angleRadians);
  return {
    apply: ({ x, y }) => {
      const dx = x - pivot.x;
      const dy = y - pivot.y;
      return {
        x: pivot.x + dx * cos - dy * sin,
        y: pivot.y + dx * sin + dy * cos,
      };
    },
    scaleFactor: 1,
    flipsOrientation: false,
  };
};

export const scalingTransform = (pivot: PlanarPoint, factor: number): PlanarTransform => ({
  apply: ({ x, y }) => ({
    x: pivot.x + (x - pivot.x) * factor,
    y: pivot.y + (y - pivot.y) * factor,
  }),
  scaleFactor: factor,
  flipsOrientation: factor < 0,
});

export const reflectionTransform = (a: PlanarPoint, b: PlanarPoint): PlanarTransform => {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < 1e-12) {
    return {
      apply: point => ({ ...point }),
      scaleFactor: 1,
      flipsOrientation: false,
    };
  }
  const ux = (b.x - a.x) / length;
  const uy = (b.y - a.y) / length;
  return {
    apply: ({ x, y }) => {
      const vx = x - a.x;
      const vy = y - a.y;
      const projection = vx * ux + vy * uy;
      return {
        x: a.x + 2 * projection * ux - vx,
        y: a.y + 2 * projection * uy - vy,
      };
    },
    scaleFactor: 1,
    flipsOrientation: true,
  };
};

export interface SurveyLineTransformOptions {
  refA: string;
  refB: string;
  polylineId?: string;
  isCircle: boolean;
  /** Drop stale B/D, chord, tangent, and label annotations after a rotate/scale/mirror. */
  resetAnnotations: boolean;
}

/**
 * Build a transformed copy of a line/arc/circle entity. The source entity is
 * never mutated; the caller decides whether to replace or duplicate it.
 */
export function transformSurveyLine(
  line: SurveyLine,
  endpoints: { p1: PlanarPoint; p2: PlanarPoint },
  transform: PlanarTransform,
  options: SurveyLineTransformOptions,
): SurveyLine {
  const p1 = transform.apply(endpoints.p1);
  const p2 = transform.apply(endpoints.p2);

  const next: SurveyLine = {
    ...line,
    id: undefined,
    from: options.refA,
    to: options.refB,
    fromPt: { x: p1.x, y: p1.y, z: line.fromPt?.z ?? 0 },
    toPt: { x: p2.x, y: p2.y, z: line.toPt?.z ?? 0 },
    polylineId: options.polylineId,
  };

  if (options.isCircle) {
    const center = line.circleCenter
      ? { x: line.circleCenter.x, y: line.circleCenter.y }
      : endpoints.p1;
    const transformedCenter = transform.apply(center);
    next.fromPt = { x: transformedCenter.x, y: transformedCenter.y, z: line.circleCenter?.z ?? 0 };
    next.toPt = { ...next.fromPt };
    next.circleCenter = {
      x: transformedCenter.x,
      y: transformedCenter.y,
      z: line.circleCenter?.z ?? 0,
    };
  }

  if (typeof line.curveRadius === 'number') {
    next.curveRadius = line.curveRadius * transform.scaleFactor;
  }
  if (typeof line.arcLength === 'number') {
    next.arcLength = line.arcLength * transform.scaleFactor;
  }
  if (transform.flipsOrientation && line.curveDirection) {
    next.curveDirection = line.curveDirection === 'left' ? 'right' : 'left';
  }

  if (options.resetAnnotations) {
    delete next.bearing;
    delete next.distance;
    delete next.chordBearing;
    delete next.chordDistance;
    delete next.tangentBearing;
    delete next.labelOffset;
    delete next.labelRotation;
  }

  return next;
}

export interface ClosedSegmentOptions {
  refPrefix: string;
  polylineId: string;
  layer?: string;
}

/** Build a closed polyline as individual SurveyLine segments (last vertex → first). */
export function buildClosedSegments(points: PlanarPoint[], options: ClosedSegmentOptions): SurveyLine[] {
  if (points.length < 3) return [];
  return points.map((point, index) => {
    const nextPoint = points[(index + 1) % points.length];
    return {
      from: `${options.refPrefix}_${index}_A`,
      to: `${options.refPrefix}_${index}_B`,
      layer: options.layer,
      fromPt: { x: point.x, y: point.y, z: 0 },
      toPt: { x: nextPoint.x, y: nextPoint.y, z: 0 },
      polylineId: options.polylineId,
    };
  });
}

export function rectangleVertices(p1: PlanarPoint, p2: PlanarPoint): PlanarPoint[] | null {
  if (Math.abs(p2.x - p1.x) < 1e-9 || Math.abs(p2.y - p1.y) < 1e-9) return null;
  const minX = Math.min(p1.x, p2.x);
  const maxX = Math.max(p1.x, p2.x);
  const minY = Math.min(p1.y, p2.y);
  const maxY = Math.max(p1.y, p2.y);
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

/**
 * Inscribed regular polygon. The first vertex points toward +Y (north), which
 * matches the usual drafting orientation for a six-sided nut or lot symbol.
 */
export function polygonVertices(center: PlanarPoint, radius: number, sides: number): PlanarPoint[] {
  if (!Number.isFinite(radius) || radius <= 0 || !Number.isInteger(sides) || sides < 3) return [];
  const startAngle = Math.PI / 2;
  return Array.from({ length: sides }, (_, index) => {
    const angle = startAngle + (index * Math.PI * 2) / sides;
    return {
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    };
  });
}
