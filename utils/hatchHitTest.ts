import type { CanvasHatch } from '../types.ts';
import { isPointInPolygon } from './hatchBoundaryTracer.ts';

/** True when a world point falls inside a hatch's filled region, excluding islands. */
export function isPointInsideHatch(
  hatch: CanvasHatch,
  easting: number,
  northing: number,
): boolean {
  const point = { x: easting, y: northing };
  let inside = false;

  // Even-odd parity mirrors the canvas fill rule, so nested holes and multiple
  // disjoint outer loops both behave the same way on hit-testing and explode.
  for (const loop of hatch.loops) {
    if (!loop.vertices || loop.vertices.length < 3) continue;
    if (isPointInPolygon(point, loop.vertices)) inside = !inside;
  }

  return inside;
}

/** Topmost visible hatch at a world point, or null. */
export function findHatchAtWorldPoint(
  hatches: readonly CanvasHatch[],
  easting: number,
  northing: number,
): CanvasHatch | null {
  for (let i = hatches.length - 1; i >= 0; i--) {
    const hatch = hatches[i];
    if (hatch.hidden) continue;
    if (isPointInsideHatch(hatch, easting, northing)) return hatch;
  }
  return null;
}
