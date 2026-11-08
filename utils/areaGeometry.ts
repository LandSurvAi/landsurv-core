/**
 * areaGeometry — shared polygon helpers for GIS area overlays.
 *
 * FEMA NFHL and SSURGO both return rings. Their services flatten those rings
 * into SurveyLine segments for the canvas boundary, but hatches and labels need
 * the closed loops and a sensible interior point. These helpers keep that
 * conversion identical for both sources.
 */

import type { HatchBoundaryLoop } from '../types.ts';

export type AreaPointConverter = (xy: [number, number]) => [number, number];

/** Build closed hatch loops from raw ring coordinates, optionally reprojecting. */
export function buildAreaLoops(
  rings: number[][][],
  convert?: AreaPointConverter | null,
): HatchBoundaryLoop[] {
  const loops: HatchBoundaryLoop[] = [];
  for (const ring of rings) {
    if (!Array.isArray(ring) || ring.length < 3) continue;
    const vertices: Array<{ x: number; y: number }> = [];
    for (const vertex of ring) {
      if (!Array.isArray(vertex) || vertex.length < 2) continue;
      let x = Number(vertex[0]);
      let y = Number(vertex[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (convert) [x, y] = convert([x, y]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      vertices.push({ x, y });
    }
    // Services usually repeat the first vertex at the end.
    if (vertices.length > 1) {
      const first = vertices[0];
      const last = vertices[vertices.length - 1];
      if (Math.hypot(first.x - last.x, first.y - last.y) < 1e-8) vertices.pop();
    }
    if (vertices.length >= 3) loops.push({ vertices });
  }
  return loops;
}

/** Signed shoelace area in drawing units² (projected feet when EPSG is projected). */
export function signedLoopArea(loop: HatchBoundaryLoop): number {
  const vertices = loop.vertices;
  if (vertices.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function loopAreaAbs(loop: HatchBoundaryLoop): number {
  return Math.abs(signedLoopArea(loop));
}

/**
 * Area-weighted centroid of the largest ring. A centroid of the largest loop
 * is a better label anchor than the average of every ring when a feature has
 * islands or holes.
 */
export function areaCentroid(loops: HatchBoundaryLoop[]): { x: number; y: number } | null {
  if (loops.length === 0) return null;
  let main = loops[0];
  let mainArea = loopAreaAbs(main);
  for (let i = 1; i < loops.length; i++) {
    const area = loopAreaAbs(loops[i]);
    if (area > mainArea) {
      main = loops[i];
      mainArea = area;
    }
  }

  const vertices = main.vertices;
  if (vertices.length === 0) return null;
  if (mainArea < 1e-9) {
    const sum = vertices.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / vertices.length, y: sum.y / vertices.length };
  }

  let cx = 0;
  let cy = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const cross = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  const signed = signedLoopArea(main);
  if (Math.abs(signed) < 1e-9) {
    return { x: cx / (6 * signed || 1), y: cy / (6 * signed || 1) };
  }
  return { x: cx / (6 * signed), y: cy / (6 * signed) };
}

/**
 * Net area of the loops. Opposite winding (outer vs hole) subtracts correctly;
 * same-winding holes are rare and are accepted as additive.
 */
export function areaSquareUnits(loops: HatchBoundaryLoop[]): number {
  return Math.abs(loops.reduce((sum, loop) => sum + signedLoopArea(loop), 0));
}

/** Break a long soil/zone name into short annotation lines. */
export function wrapAreaLabelText(text: string, maxChars = 34, maxLines = 2): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxChars || maxLines <= 1) return [cleaned];

  const words = cleaned.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars || !current) {
      current = next;
    } else {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines - 1) break;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}
