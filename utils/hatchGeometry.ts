import type { CanvasHatch } from '../types.ts';
import type { PlanarPoint, PlanarTransform } from './cadTransforms.ts';

export interface HatchBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  center: PlanarPoint;
}

/** World-space bounding box for one or more hatches. */
export function getHatchesBounds(hatches: readonly CanvasHatch[]): HatchBounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const hatch of hatches) {
    for (const loop of hatch.loops) {
      for (const vertex of loop.vertices ?? []) {
        minX = Math.min(minX, vertex.x);
        minY = Math.min(minY, vertex.y);
        maxX = Math.max(maxX, vertex.x);
        maxY = Math.max(maxY, vertex.y);
      }
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return {
    minX,
    minY,
    maxX,
    maxY,
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
  };
}

/** Every world point on a hatch, used for selection pivots and transform radii. */
export function getHatchWorldPoints(hatch: CanvasHatch): PlanarPoint[] {
  const points: PlanarPoint[] = [];
  for (const loop of hatch.loops) {
    for (const vertex of loop.vertices ?? []) {
      points.push({ x: vertex.x, y: vertex.y });
    }
  }
  return points;
}

/**
 * Apply a planar transform to a hatch's boundary and pattern.
 *
 * The pattern direction is transformed as a vector, so rotation and mirror
 * affect it correctly. Uniform scaling also scales the PAT spacing and area.
 */
export function transformHatch(
  hatch: CanvasHatch,
  transform: PlanarTransform,
  options: { newId?: string; newCreatedAt?: boolean } = {},
): CanvasHatch {
  const loops = hatch.loops.map(loop => ({
    ...loop,
    vertices: (loop.vertices ?? []).map(vertex => {
      const point = transform.apply({ x: vertex.x, y: vertex.y });
      return { ...vertex, x: point.x, y: point.y };
    }),
  }));

  const patternRad = (hatch.angleDeg * Math.PI) / 180;
  const origin = transform.apply({ x: 0, y: 0 });
  const direction = transform.apply({
    x: Math.cos(patternRad),
    y: Math.sin(patternRad),
  });
  const transformedAngle = (Math.atan2(direction.y - origin.y, direction.x - origin.x) * 180) / Math.PI;
  const scaleFactor = Math.abs(transform.scaleFactor) || 1;

  const next: CanvasHatch = {
    ...hatch,
    id: options.newId ?? hatch.id,
    loops,
    angleDeg: ((transformedAngle % 360) + 360) % 360,
    scale: Math.max(0.05, hatch.scale * scaleFactor),
  };

  if (typeof hatch.areaSqFt === 'number') {
    next.areaSqFt = hatch.areaSqFt * scaleFactor * scaleFactor;
  }
  if (options.newCreatedAt) {
    next.createdAt = new Date().toISOString();
  }

  return next;
}
