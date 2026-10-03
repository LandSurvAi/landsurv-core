/**
 * streetNameService (v26.05.19.4)
 *
 * Fetches named road centerlines for a WGS84 bounding box from the LandSurv
 * backend proxy (which in turn queries OpenStreetMap Overpass API).
 *
 * Each road way returned by Overpass is converted to a StreetLabel at the
 * midpoint of its centremost segment, rotated to the road bearing.  Street
 * labels are placed in the project coordinate system (same units as survey
 * points / lines) so they align correctly with the canvas.
 */

import type { StreetLabel } from '../types.ts';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface OverpassRoad {
  name: string;
  nodes: { lat: number; lon: number }[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Compute the bearing in degrees (0 = east, CCW positive) between two WGS84
 * coordinates after reprojection to easting/northing.
 */
function computeBearing(
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let angle = Math.atan2(dy, dx) * (180 / Math.PI);
  // Keep in range [-90, 90] so text is never upside-down
  if (angle < -90) angle += 180;
  if (angle > 90)  angle -= 180;
  return angle;
}

/**
 * Pick the segment closest to the midpoint of the polyline (by cumulative
 * length) and return its midpoint coordinates and bearing.
 */
function pickLabelPoint(projected: { x: number; y: number }[]): {
  x: number;
  y: number;
  angle: number;
} | null {
  if (projected.length < 2) return null;

  // Compute cumulative lengths
  const lens: number[] = [0];
  for (let i = 1; i < projected.length; i++) {
    const dx = projected[i].x - projected[i - 1].x;
    const dy = projected[i].y - projected[i - 1].y;
    lens.push(lens[i - 1] + Math.hypot(dx, dy));
  }
  const totalLen = lens[lens.length - 1];
  if (totalLen < 1) return null;

  const target = totalLen / 2;
  let segIdx = 0;
  for (let i = 1; i < lens.length; i++) {
    if (lens[i] >= target) { segIdx = i - 1; break; }
  }

  const p1 = projected[segIdx];
  const p2 = projected[Math.min(segIdx + 1, projected.length - 1)];

  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
    angle: computeBearing(p1.x, p1.y, p2.x, p2.y),
  };
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Fetch named roads for a WGS84 bbox and convert to StreetLabel[] in the
 * project coordinate system.
 *
 * @param bboxWgs84  [xmin, ymin, xmax, ymax] in WGS84 lon/lat
 * @param targetEpsg  Project EPSG (e.g. 32618 for UTM 18N). If 4326 or
 *                    undefined, raw lon/lat are used as easting/northing.
 */
export async function fetchStreetLabels(
  bboxWgs84: [number, number, number, number],
  targetEpsg?: number,
): Promise<StreetLabel[]> {
  const [xmin, ymin, xmax, ymax] = bboxWgs84;
  const params = new URLSearchParams({ bbox: `${xmin},${ymin},${xmax},${ymax}` });
  const resp = await fetch(`/api/streets?${params.toString()}`, {
    headers: { 'Accept': 'application/json' },
  });

  if (!resp.ok) {
    throw new Error(`Streets API error: ${resp.status} ${resp.statusText}`);
  }

  const roads: OverpassRoad[] = await resp.json();

  // Set up reprojection if needed
  let project: ((lon: number, lat: number) => { x: number; y: number }) | null = null;
  if (targetEpsg && targetEpsg !== 4326 && roads.length > 0) {
    try {
      const proj4mod = (await import('proj4')).default;
      project = (lon, lat) => {
        const [ex, ny] = proj4mod('EPSG:4326', `EPSG:${targetEpsg}`, [lon, lat]) as [number, number];
        return { x: ex, y: ny };
      };
    } catch {
      // fall through to geographic coords
    }
  }

  const labels: StreetLabel[] = [];

  for (const road of roads) {
    const projected: { x: number; y: number }[] = road.nodes.map(n =>
      project ? project(n.lon, n.lat) : { x: n.lon, y: n.lat }
    );

    const pt = pickLabelPoint(projected);
    if (!pt) continue;

    labels.push({ x: pt.x, y: pt.y, text: road.name, angle: pt.angle });
  }

  return labels;
}
