import type { CanvasHatch, SurveyLine } from '../types.ts';
import { CANVAS_HATCH_WORLD_TILE_UNITS, getHatchByName, type HatchDefinition } from '../services/hatchLibrary.ts';
import { isPointInPolygon } from './hatchBoundaryTracer.ts';
import { getHatchesBounds } from './hatchGeometry.ts';

interface Point {
  x: number;
  y: number;
}

export interface HatchExplodeOptions {
  customHatches?: HatchDefinition[];
  /** Safety cap so a dense pattern on a large site cannot freeze the browser. */
  maxSegments?: number;
}

function hatchContainsPoint(hatch: CanvasHatch, point: Point): boolean {
  let inside = false;
  for (const loop of hatch.loops) {
    if (!loop.vertices || loop.vertices.length < 3) continue;
    if (isPointInPolygon(point, loop.vertices)) inside = !inside;
  }
  return inside;
}

function lineId(hatch: CanvasHatch, index: number): { from: string; to: string } {
  return {
    from: `HATCHX_${hatch.id}_${index}_A`,
    to: `HATCHX_${hatch.id}_${index}_B`,
  };
}

function makeSurveyLine(hatch: CanvasHatch, index: number, a: Point, b: Point): SurveyLine {
  const refs = lineId(hatch, index);
  return {
    from: refs.from,
    to: refs.to,
    fromPt: { x: a.x, y: a.y, z: 0 },
    toPt: { x: b.x, y: b.y, z: 0 },
    layer: hatch.layer,
    color: hatch.color,
    isCurve: false,
    isCircle: false,
  };
}

/** Boundary segments for solid hatches (and patterns with no PAT linework). */
function explodeBoundary(hatch: CanvasHatch, maxSegments: number): SurveyLine[] {
  const lines: SurveyLine[] = [];
  for (const loop of hatch.loops) {
    const vertices = loop.vertices ?? [];
    if (vertices.length < 2) continue;
    for (let i = 0; i < vertices.length && lines.length < maxSegments; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % vertices.length];
      if (Math.hypot(b.x - a.x, b.y - a.y) <= 1e-9) continue;
      lines.push(makeSurveyLine(hatch, lines.length, a, b));
    }
  }
  return lines;
}

interface LineInterval {
  start: Point;
  end: Point;
}

/**
 * Clip an infinite line to the hatch's even-odd fill region. Intersections are
 * sorted along the line and each interval's midpoint is tested, which handles
 * concave outlines, multiple outers, and island holes without polygon winding
 * assumptions.
 */
function clipLineToHatch(hatch: CanvasHatch, start: Point, end: Point): LineInterval[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const denomLine = Math.hypot(dx, dy);
  if (denomLine <= 1e-12) return [];

  const params: number[] = [0, 1];
  for (const loop of hatch.loops) {
    const vertices = loop.vertices ?? [];
    if (vertices.length < 3) continue;
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % vertices.length];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const denom = dx * ey - dy * ex;
      if (Math.abs(denom) < 1e-12) continue;
      const qx = a.x - start.x;
      const qy = a.y - start.y;
      const t = (qx * ey - qy * ex) / denom;
      const u = (qx * dy - qy * dx) / denom;
      if (t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) {
        params.push(Math.max(0, Math.min(1, t)));
      }
    }
  }

  params.sort((a, b) => a - b);
  const intervals: LineInterval[] = [];
  for (let i = 0; i < params.length - 1; i++) {
    const t0 = params[i];
    const t1 = params[i + 1];
    if (t1 - t0 <= 1e-9) continue;
    const midT = (t0 + t1) / 2;
    const mid = { x: start.x + dx * midT, y: start.y + dy * midT };
    if (!hatchContainsPoint(hatch, mid)) continue;
    intervals.push({
      start: { x: start.x + dx * t0, y: start.y + dy * t0 },
      end: { x: start.x + dx * t1, y: start.y + dy * t1 },
    });
  }
  return intervals;
}

/** Apply a PAT dash cycle to one clipped interval. */
function dashInterval(
  interval: LineInterval,
  dashes: number[],
  patternUnit: number,
): LineInterval[] {
  const dx = interval.end.x - interval.start.x;
  const dy = interval.end.y - interval.start.y;
  const length = Math.hypot(dx, dy);
  if (length <= 1e-9) return [];

  const cycle = dashes.map(d => {
    if (d === 0) return { on: true, size: Math.max(0.005, patternUnit * 0.025) };
    return { on: d > 0, size: Math.abs(d) * patternUnit };
  }).filter(part => part.size > 1e-9);

  const cycleLength = cycle.reduce((sum, part) => sum + part.size, 0);
  if (cycleLength <= 1e-9) return [interval];

  const ux = dx / length;
  const uy = dy / length;
  const result: LineInterval[] = [];
  let distance = 0;
  let cycleIndex = 0;
  let remaining = cycle[0].size;

  while (distance < length - 1e-9 && result.length < 5000) {
    const part = cycle[cycleIndex % cycle.length];
    const run = Math.min(remaining, length - distance);
    if (part.on && run > 1e-9) {
      result.push({
        start: { x: interval.start.x + ux * distance, y: interval.start.y + uy * distance },
        end: { x: interval.start.x + ux * (distance + run), y: interval.start.y + uy * (distance + run) },
      });
    }
    distance += run;
    remaining -= run;
    if (remaining <= 1e-9) {
      cycleIndex++;
      remaining = cycle[cycleIndex % cycle.length].size;
    }
  }

  return result;
}

/**
 * Convert a placed hatch into real line entities.
 *
 * Patterned hatches become their clipped PAT linework (holes respected);
 * SOLID hatches become their boundary segments. The caller replaces the hatch
 * with the returned SurveyLines.
 */
export function explodeHatchToLines(
  hatch: CanvasHatch,
  options: HatchExplodeOptions = {},
): SurveyLine[] {
  const maxSegments = Math.max(1, options.maxSegments ?? 5000);
  const definition = getHatchByName(hatch.patternName, options.customHatches ?? []);
  const isSolid = hatch.patternName.toUpperCase() === 'SOLID' || !definition || definition.lines.length === 0;

  if (isSolid) return explodeBoundary(hatch, maxSegments);

  const bounds = getHatchesBounds([hatch]);
  if (!bounds) return [];

  const lines: SurveyLine[] = [];
  const patternUnit = (CANVAS_HATCH_WORLD_TILE_UNITS / 4) * Math.max(0.05, hatch.scale);
  const extent = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 1.5 + patternUnit * 2;

  for (const family of definition.lines) {
    const angle = ((family.angle + hatch.angleDeg) * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const normal = { x: -sin, y: cos };
    const rawDelta = family.deltaY !== 0
      ? Math.abs(family.deltaY)
      : family.deltaX !== 0
        ? Math.abs(family.deltaX)
        : 0.125;
    const spacing = Math.max(0.005, rawDelta * patternUnit);
    const originOffset =
      family.originX * patternUnit * normal.x + family.originY * patternUnit * normal.y;

    const corners: Point[] = [
      { x: bounds.minX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.maxY },
      { x: bounds.minX, y: bounds.maxY },
    ];
    let minProjection = Infinity;
    let maxProjection = -Infinity;
    for (const corner of corners) {
      const projection = corner.x * normal.x + corner.y * normal.y;
      minProjection = Math.min(minProjection, projection);
      maxProjection = Math.max(maxProjection, projection);
    }

    const firstIndex = Math.floor((minProjection - originOffset) / spacing) - 1;
    const lastIndex = Math.ceil((maxProjection - originOffset) / spacing) + 1;
    for (let index = firstIndex; index <= lastIndex && lines.length < maxSegments; index++) {
      const offset = originOffset + index * spacing;
      const base = { x: normal.x * offset, y: normal.y * offset };
      const start = { x: base.x - cos * extent, y: base.y - sin * extent };
      const end = { x: base.x + cos * extent, y: base.y + sin * extent };

      for (const interval of clipLineToHatch(hatch, start, end)) {
        const pieces = family.dashes && family.dashes.length > 0
          ? dashInterval(interval, family.dashes, patternUnit)
          : [interval];
        for (const piece of pieces) {
          if (lines.length >= maxSegments) break;
          if (Math.hypot(piece.end.x - piece.start.x, piece.end.y - piece.start.y) <= 1e-9) continue;
          lines.push(makeSurveyLine(hatch, lines.length, piece.start, piece.end));
        }
      }
    }
  }

  return lines;
}
