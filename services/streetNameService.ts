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

export interface CorridorRoadLabelOptions {
  /** Max distance from the drawn alignment to the OSM way, in project units (ft). */
  toleranceFt?: number;
  /** Max number of distinct street names to return. Default 1. */
  maxLabels?: number;
  /** Labels already on the plan; matching names are skipped. */
  existingLabels?: StreetLabel[];
}

type LocalPoint = { x: number; y: number };

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

/** Parallel separation in degrees: 0 = same bearing, 90 = perpendicular. */
function parallelDifferenceDegrees(a: number, b: number): number {
  const raw = Math.abs(a - b) % 180;
  return raw > 90 ? 180 - raw : raw;
}

/** Distance and local bearing of the nearest segment of a polyline. */
function nearestPolylineSegment(
  px: number,
  py: number,
  poly: LocalPoint[],
): { distance: number; angle: number } {
  let best = { distance: Infinity, angle: 0 };
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i];
    const b = poly[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq > 0
      ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / lengthSq))
      : 0;
    const distance = Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t));
    if (distance < best.distance) {
      best = { distance, angle: computeBearing(a.x, a.y, b.x, b.y) };
    }
  }
  return best;
}

/** Bearing at a vertex, using its neighbours so curves still read cleanly. */
function bearingAtVertex(poly: LocalPoint[], index: number): number {
  const a = poly[Math.max(0, index - 1)];
  const b = poly[Math.min(poly.length - 1, index + 1)];
  return computeBearing(a.x, a.y, b.x, b.y);
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

// ── Main exports ───────────────────────────────────────────────────────────────

/** Fetch named OSM road ways for a WGS84 bbox from the backend proxy. */
export async function fetchStreetWays(
  bboxWgs84: [number, number, number, number],
): Promise<OverpassRoad[]> {
  const [xmin, ymin, xmax, ymax] = bboxWgs84;
  const params = new URLSearchParams({ bbox: `${xmin},${ymin},${xmax},${ymax}` });
  const resp = await fetch(`/api/streets?${params.toString()}`, {
    headers: { 'Accept': 'application/json' },
    // Keep road drafting prompt when the proxy is slow or offline.
    signal: AbortSignal.timeout(4000),
  });

  if (!resp.ok) {
    throw new Error(`Streets API error: ${resp.status} ${resp.statusText}`);
  }

  return await resp.json();
}

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
  const roads = await fetchStreetWays(bboxWgs84);

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

/**
 * Resolve the names of existing roads that run along a drawn alignment and
 * anchor those names on the alignment itself.
 *
 * The Roading Agent calls this after drafting a road so the plan is labeled
 * with the real street name from OpenStreetMap instead of a generic synthesis
 * name. Only roads that are roughly parallel to the alignment and within the
 * corridor tolerance are used, which keeps crossing streets from supplying the
 * name. The lookup is read-only; callers decide whether to add the labels.
 */
export async function fetchRoadLabelsAlongAlignment(
  alignment: Array<{ x: number; y: number }>,
  targetEpsg?: number,
  options: CorridorRoadLabelOptions = {},
): Promise<StreetLabel[]> {
  const coords = alignment.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (coords.length < 2) return [];

  const geographic = !targetEpsg || targetEpsg === 4326;
  // Project units are feet, but a 4326 project stores longitude/latitude.
  const tolerance = geographic
    ? Math.max(5, options.toleranceFt ?? 60) / 364000
    : Math.max(5, options.toleranceFt ?? 60);
  const maxLabels = Math.max(1, Math.round(options.maxLabels ?? 1));
  const existingNames = new Set(
    (options.existingLabels ?? [])
      .map(label => label.text.trim().toLowerCase())
      .filter(Boolean),
  );

  const minX = Math.min(...coords.map(p => p.x));
  const minY = Math.min(...coords.map(p => p.y));
  const maxX = Math.max(...coords.map(p => p.x));
  const maxY = Math.max(...coords.map(p => p.y));

  const pad = tolerance;

  let bbox: [number, number, number, number];
  if (geographic) {
    bbox = [minX - pad, minY - pad, maxX + pad, maxY + pad];
  } else {
    try {
      const proj4mod = (await import('proj4')).default;
      const corners: Array<[number, number]> = [
        [minX - pad, minY - pad],
        [maxX + pad, minY - pad],
        [maxX + pad, maxY + pad],
        [minX - pad, maxY + pad],
      ];
      let lon0 = Infinity, lat0 = Infinity, lon1 = -Infinity, lat1 = -Infinity;
      for (const corner of corners) {
        const [lon, lat] = proj4mod(
          `EPSG:${targetEpsg}`, 'EPSG:4326', corner,
        ) as [number, number];
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return [];
        lon0 = Math.min(lon0, lon); lat0 = Math.min(lat0, lat);
        lon1 = Math.max(lon1, lon); lat1 = Math.max(lat1, lat);
      }
      bbox = [lon0, lat0, lon1, lat1];
    } catch {
      return [];
    }
  }

  const ways = await fetchStreetWays(bbox);
  if (ways.length === 0) return [];

  let project: ((lon: number, lat: number) => LocalPoint) | null = null;
  if (!geographic) {
    try {
      const proj4mod = (await import('proj4')).default;
      project = (lon, lat) => {
        const [x, y] = proj4mod(
          'EPSG:4326', `EPSG:${targetEpsg}`, [lon, lat],
        ) as [number, number];
        return { x, y };
      };
    } catch {
      return [];
    }
  }

  const candidates: Array<{
    text: string;
    distance: number;
    x: number;
    y: number;
    angle: number;
  }> = [];
  const matchedNames = new Set<string>();

  for (const way of ways) {
    const name = way.name?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (existingNames.has(key) || matchedNames.has(key)) continue;

    const nodes: LocalPoint[] = (way.nodes ?? []).map(node =>
      project ? project(node.lon, node.lat) : { x: node.lon, y: node.lat },
    );
    if (nodes.length < 2) continue;

    // Anchor the label at the middle of the run where the drawn alignment
    // stays inside the existing road's tolerance band.
    const near: Array<{ index: number; distance: number }> = [];
    for (let i = 0; i < coords.length; i++) {
      const { distance } = nearestPolylineSegment(coords[i].x, coords[i].y, nodes);
      if (distance <= tolerance) near.push({ index: i, distance });
    }
    if (near.length === 0) continue;

    const anchor = near[Math.floor(near.length / 2)];
    const alignmentAngle = bearingAtVertex(coords, anchor.index);
    const road = nearestPolylineSegment(coords[anchor.index].x, coords[anchor.index].y, nodes);
    if (!Number.isFinite(road.distance)) continue;
    if (parallelDifferenceDegrees(alignmentAngle, road.angle) > 35) continue;

    candidates.push({
      text: name,
      distance: Math.min(...near.map(entry => entry.distance)),
      x: coords[anchor.index].x,
      y: coords[anchor.index].y,
      angle: alignmentAngle,
    });
    matchedNames.add(key);
  }

  return candidates
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxLabels)
    .map(({ text, x, y, angle }) => ({ text, x, y, angle }));
}
