import { SurveyPoint, TinSurface, TinVertex } from '../types.ts';
import { delaunay } from '../utils/contouring.ts';

/**
 * TinService (v26.05.17.15) — minimal MVP for Triangulated Irregular Networks.
 *
 * Capabilities:
 *  - `buildTinFromPoints(points)`: Delaunay-triangulate a set of points-with-Z
 *    into a TinSurface (vertex array + triangle index triples).
 *  - `sampleElevationAt(tin, e, n)`: barycentric Z interpolation at any (E,N).
 *    Returns null if the point lies outside every triangle.
 *  - `sampleElevationsForPoints(tin, points)`: convenience wrapper that returns
 *    updated point objects with new elevations (only for points inside the TIN).
 *
 * The triangulation uses a Bowyer-Watson incremental Delaunay (self-contained,
 * no external dependency). This mirrors the approach already in
 * utils/contouring.ts but is exposed as a reusable surface object.
 */

export function buildTinFromPoints(
  points: SurveyPoint[],
  opts: { name?: string; color?: string } = {}
): TinSurface | null {
  const usable = points.filter(
    p => typeof p.elevation === 'number' && Number.isFinite(p.elevation) &&
         Number.isFinite(p.northing) && Number.isFinite(p.easting)
  );
  if (usable.length < 3) return null;

  // Use the normalized, circumcenter-precomputed triangulator shared with
  // contour generation. The previous local Bowyer-Watson ballooned on rounded,
  // co-circular contours (3.2k vertices -> 184k triangles and ~44s).
  const tris = delaunay(usable.map(p => ({
    x: p.easting,
    y: p.northing,
    z: p.elevation as number,
  })));
  if (tris.length === 0) return null;

  const vertices: TinVertex[] = usable.map(p => ({
    easting: p.easting,
    northing: p.northing,
    elevation: p.elevation as number,
  }));

  return {
    id: `tin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: opts.name || `TIN ${new Date().toLocaleString()}`,
    createdAt: new Date().toISOString(),
    vertices,
    triangles: tris.map(t => [t.p1, t.p2, t.p3] as [number, number, number]),
    sourcePointIds: usable.map(p => p.pointNumber),
    color: opts.color || '#06b6d4',
  };
}

/** Barycentric containment + interpolation for one triangle. */
function interpolateTriangle(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  px: number, py: number
): number | null {
  const denom = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(denom) < 1e-12) return null;
  const wA = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / denom;
  const wB = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / denom;
  const wC = 1 - wA - wB;
  const eps = -1e-9;
  if (wA < eps || wB < eps || wC < eps) return null;
  return wA * az + wB * bz + wC * cz;
}

export function sampleElevationAt(tin: TinSurface, easting: number, northing: number): number | null {
  for (const [ia, ib, ic] of tin.triangles) {
    const a = tin.vertices[ia];
    const b = tin.vertices[ib];
    const c = tin.vertices[ic];
    const z = interpolateTriangle(
      a.easting, a.northing, a.elevation,
      b.easting, b.northing, b.elevation,
      c.easting, c.northing, c.elevation,
      easting, northing
    );
    if (z !== null) return z;
  }
  return null;
}

export function sampleElevationsForPoints(
  tin: TinSurface,
  points: SurveyPoint[]
): { updated: SurveyPoint[]; sampled: number; skipped: number } {
  let sampled = 0;
  let skipped = 0;
  const updated = points.map(p => {
    const z = sampleElevationAt(tin, p.easting, p.northing);
    if (z === null) { skipped++; return p; }
    sampled++;
    return { ...p, elevation: z };
  });
  return { updated, sampled, skipped };
}

/**
 * A contour source accepted by {@link buildTinFromContours}. Supports both the
 * legacy segment form (fromPt/toPt) used by older callers and the IsoPath form
 * (`vertices` + `elevation`) produced by contour generation.
 */
export interface TinContourSource {
  elevation?: number;
  fromPt?: { x: number; y: number; z?: number };
  toPt?: { x: number; y: number; z?: number };
  vertices?: Array<{ x: number; y: number }>;
}

/**
 * Build a TIN from contour lines by extracting elevation-tagged vertices.
 * Each vertex in each contour line becomes a sample point at that contour's elevation.
 * Returns null if fewer than 3 usable points are extracted.
 *
 * Smoothed contours can carry tens of thousands of nearly redundant vertices,
 * so dense input is evenly decimated to a responsive budget before
 * triangulation. Path endpoints are always kept.
 */
export const MAX_TIN_CONTOUR_VERTICES = 8_000;

export function buildTinFromContours(
  contourLines: TinContourSource[],
  opts: { name?: string; color?: string } = {}
): TinSurface | null {
  // Measure the contour network so decimation targets a total vertex budget
  // instead of thinning every path by an arbitrary count.
  let rawVertexCount = 0;
  let totalLength = 0;
  for (const line of contourLines) {
    if (line.vertices && line.vertices.length > 0) {
      rawVertexCount += line.vertices.length;
      for (let i = 0; i < line.vertices.length - 1; i++) {
        const a = line.vertices[i];
        const b = line.vertices[i + 1];
        totalLength += Math.hypot(b.x - a.x, b.y - a.y);
      }
      continue;
    }
    if (line.fromPt) rawVertexCount += 1;
    if (line.toPt) rawVertexCount += 1;
    if (line.fromPt && line.toPt) {
      totalLength += Math.hypot(
        line.toPt.x - line.fromPt.x,
        line.toPt.y - line.fromPt.y,
      );
    }
  }

  const spacing =
    rawVertexCount > MAX_TIN_CONTOUR_VERTICES && totalLength > 0
      ? totalLength / MAX_TIN_CONTOUR_VERTICES
      : 0;

  const points: Array<{ x: number; y: number; z: number }> = [];
  const pointMap = new Map<string, { x: number; y: number; z: number }>();

  // Contour stitching and smoothing can leave nearly coincident endpoints
  // (a closing ring differs from its start by ~1e-13). Exact-string dedupe
  // misses those, and the duplicates then produce degenerate triangles.
  const addVertex = (x: number, y: number, z: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)}`;
    if (pointMap.has(key)) return;
    const pt = { x, y, z };
    points.push(pt);
    pointMap.set(key, pt);
  };

  for (const line of contourLines) {
    const elev = line.elevation ?? line.fromPt?.z ?? line.toPt?.z ?? 0;

    if (line.vertices && line.vertices.length > 0) {
      if (spacing <= 0) {
        for (const v of line.vertices) addVertex(v.x, v.y, elev);
        continue;
      }
      const lastIndex = line.vertices.length - 1;
      let lastKept: { x: number; y: number } | null = null;
      for (let i = 0; i < line.vertices.length; i++) {
        const v = line.vertices[i];
        if (
          i === 0
          || i === lastIndex
          || !lastKept
          || Math.hypot(v.x - lastKept.x, v.y - lastKept.y) >= spacing
        ) {
          addVertex(v.x, v.y, elev);
          lastKept = v;
        }
      }
      continue;
    }

    if (line.fromPt) addVertex(line.fromPt.x, line.fromPt.y, elev);
    if (line.toPt) addVertex(line.toPt.x, line.toPt.y, elev);
  }

  if (points.length < 3) return null;

  const tris = delaunay(points);
  if (tris.length === 0) return null;

  const vertices: TinVertex[] = points.map(p => ({
    easting: p.x,
    northing: p.y,
    elevation: p.z,
  }));

  return {
    id: `tin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: opts.name || `TIN from Contours ${new Date().toLocaleString()}`,
    createdAt: new Date().toISOString(),
    vertices,
    triangles: tris.map(t => [t.p1, t.p2, t.p3] as [number, number, number]),
    sourcePointIds: points.map((_, i) => `contour-${i}`),
    color: opts.color || '#06b6d4',
  };
}

/** Escape text for XML attributes and element content. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Serialize a TIN to the native text `.tin` format understood by
 * `TinImportService` (VERTICES / TRIANGLES sections, one-based faces).
 */
export type TinSurfaceDisplayMode = 'wireframe' | 'shaded';

/** Per-surface canvas style, falling back to the workspace-wide shading toggle. */
export function tinSurfaceDisplayMode(
  surface: TinSurface,
  shadedByDefault = false,
): TinSurfaceDisplayMode {
  if (surface.displayMode === 'shaded' || surface.displayMode === 'wireframe') {
    return surface.displayMode;
  }
  return shadedByDefault ? 'shaded' : 'wireframe';
}

/** Plan-space bounds and elevation range for a surface, or null when empty. */
export function tinSurfaceBounds(surface: TinSurface): {
  minE: number;
  maxE: number;
  minN: number;
  maxN: number;
  minZ: number;
  maxZ: number;
} | null {
  const vertices = surface.vertices;
  if (!vertices || vertices.length === 0) return null;
  let minE = Infinity, maxE = -Infinity;
  let minN = Infinity, maxN = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (const v of vertices) {
    if (v.easting < minE) minE = v.easting;
    if (v.easting > maxE) maxE = v.easting;
    if (v.northing < minN) minN = v.northing;
    if (v.northing > maxN) maxN = v.northing;
    if (v.elevation < minZ) minZ = v.elevation;
    if (v.elevation > maxZ) maxZ = v.elevation;
  }
  return { minE, maxE, minN, maxN, minZ, maxZ };
}

/** Total plan (horizontal) area of the TIN triangles, in squared project units. */
export function tinSurfacePlanArea(surface: TinSurface): number {
  const vertices = surface.vertices;
  let area = 0;
  for (const tri of surface.triangles) {
    const a = vertices[tri[0]];
    const b = vertices[tri[1]];
    const c = vertices[tri[2]];
    if (!a || !b || !c) continue;
    area += Math.abs(
      (b.easting - a.easting) * (c.northing - a.northing) -
      (c.easting - a.easting) * (b.northing - a.northing),
    ) / 2;
  }
  return area;
}

export function tinSurfaceToNativeTin(tin: TinSurface): string {
  const lines: string[] = [
    '# LandSurv.ai TIN surface',
    `# name: ${tin.name}`,
    `# created: ${tin.createdAt}`,
    `# vertices: ${tin.vertices.length}`,
    `# triangles: ${tin.triangles.length}`,
    'VERTICES',
  ];
  for (const v of tin.vertices) {
    lines.push(`${v.easting} ${v.northing} ${v.elevation}`);
  }
  lines.push('TRIANGLES');
  for (const [a, b, c] of tin.triangles) {
    lines.push(`${a + 1} ${b + 1} ${c + 1}`);
  }
  return lines.join('\n');
}

/**
 * Serialize a TIN to LandXML 1.2 (surfaces / PNT + FCE), matching the importer
 * used by `TinImportService` and Civil 3D.
 */
export function tinSurfaceToLandXml(tin: TinSurface): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const name = escapeXml(tin.name || 'TIN Surface');

  const points = tin.vertices
    .map((v, i) => `          <P id="${i + 1}">${v.northing} ${v.easting} ${v.elevation}</P>`)
    .join('\n');
  const faces = tin.triangles
    .map(([a, b, c]) => `          <F>${a + 1} ${b + 1} ${c + 1}</F>`)
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<LandXML version="1.2" date="${date}" time="${time}" xmlns="http://www.landxml.org/schema/LandXML-1.2">`,
    '  <Units>',
    '    <Imperial linearUnit="USSurveyFoot" areaUnit="SquareFoot" volumeUnit="CubicFoot" temperatureUnit="Fahrenheit" pressureUnit="InchesOfMercury" directionUnit="DecimalDegrees"/>',
    '  </Units>',
    '  <Surfaces>',
    `    <Surface name="${name}" surfType="TIN">`,
    `      <Definition surfType="TIN">`,
    '        <Pnts>',
    points,
    '        </Pnts>',
    '        <Faces>',
    faces,
    '        </Faces>',
    '      </Definition>',
    '    </Surface>',
    '  </Surfaces>',
    '</LandXML>',
  ].join('\n');
}

/** File-system-safe base name for an exported surface. */
export function tinSurfaceFileBaseName(tin: TinSurface): string {
  const base = (tin.name || 'tin-surface')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9._-]+/gi, '_')
    .replace(/^_+|_+$/g, '');
  return base || 'tin-surface';
}
