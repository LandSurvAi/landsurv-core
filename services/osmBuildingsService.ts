/**
 * osmBuildingsService (v26.05.31) — OpenStreetMap building footprint fetcher.
 *
 * The FEMA NSI API only returns building centroids. To produce real building
 * outlines, we pull `building=*` polygons from the public Overpass API and
 * reproject them into the active project EPSG. Overpass returns CORS headers,
 * so we can call it directly from the browser without a backend proxy.
 *
 * Output is a `BuildingFootprint[]` — open ring (no duplicate close vertex),
 * project coordinates, with the original OSM tag bag preserved for later
 * attribute join (e.g. building:levels, height, name, addr:*).
 */

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
];

export interface BuildingFootprint {
  /** Stable id, e.g. "osm-way-12345678" or "osm-rel-998877". */
  id: string;
  /** Outer ring in project coordinates (open — first != last). Wound CCW after fetch. */
  ring: { x: number; y: number }[];
  /** OSM tag bag (building, building:levels, name, addr:*, etc.). */
  tags: Record<string, string>;
  /** Source provenance. */
  source: 'osm';
  /** Centroid in project coordinates (computed). */
  centroid: { x: number; y: number };
  /** Polygon area in project units². */
  area: number;
  /** Original lon/lat ring for debug + reverse joins. */
  ringLonLat: { lon: number; lat: number }[];
}

export interface OsmBuildingsFetchResult {
  buildings: BuildingFootprint[];
  bboxWgs84: [number, number, number, number];
  queryUrl: string;
  truncated: boolean;
}

interface OverpassGeomNode { lat: number; lon: number; }
interface OverpassElement {
  type: 'way' | 'relation' | 'node';
  id: number;
  tags?: Record<string, string>;
  geometry?: OverpassGeomNode[];
  members?: Array<{ type: string; role: string; geometry?: OverpassGeomNode[] }>;
}

/** Shoelace area (signed). */
function signedArea(ring: { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function centroidOf(ring: { x: number; y: number }[]): { x: number; y: number } {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
    a += f;
  }
  if (Math.abs(a) < 1e-9) {
    const m = ring.reduce((s, r) => ({ x: s.x + r.x, y: s.y + r.y }), { x: 0, y: 0 });
    return { x: m.x / ring.length, y: m.y / ring.length };
  }
  a *= 0.5;
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

function dropClosingVertex(ring: OverpassGeomNode[]): OverpassGeomNode[] {
  if (ring.length >= 2) {
    const f = ring[0], l = ring[ring.length - 1];
    if (Math.abs(f.lat - l.lat) < 1e-9 && Math.abs(f.lon - l.lon) < 1e-9) {
      return ring.slice(0, -1);
    }
  }
  return ring;
}

/**
 * Fetch OSM building footprints inside a WGS84 bbox and reproject to project EPSG.
 *
 * @param bboxWgs84 [xmin, ymin, xmax, ymax] (lon/lat)
 * @param targetEpsg Project EPSG. Omit to keep lon/lat as easting/northing.
 * @param opts.minAreaSqUnits Drop tiny polygons (default 50 sq units).
 */
export async function fetchOsmBuildings(
  bboxWgs84: [number, number, number, number],
  targetEpsg?: number,
  opts: { minAreaSqUnits?: number; timeoutMs?: number } = {},
): Promise<OsmBuildingsFetchResult> {
  const [xmin, ymin, xmax, ymax] = bboxWgs84;
  const south = Math.min(ymin, ymax);
  const west  = Math.min(xmin, xmax);
  const north = Math.max(ymin, ymax);
  const east  = Math.max(xmin, xmax);

  // Overpass QL — ways AND relations carrying any building=* tag.
  const query = `
[out:json][timeout:25];
(
  way["building"](${south},${west},${north},${east});
  relation["building"](${south},${west},${north},${east});
);
out tags geom;
`.trim();

  const body = `data=${encodeURIComponent(query)}`;
  let resp: Response | null = null;
  let lastErr: unknown = null;
  let queryUrl = '';
  for (const endpoint of OVERPASS_URLS) {
    try {
      queryUrl = endpoint;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30000);
      resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        body,
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (resp.ok) break;
      lastErr = new Error(`Overpass ${endpoint} → HTTP ${resp.status}`);
      resp = null;
    } catch (err) {
      lastErr = err;
      resp = null;
    }
  }
  if (!resp) {
    throw new Error(`Overpass unreachable: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
  }

  const data = await resp.json() as { elements?: OverpassElement[]; remark?: string };
  const elements = data.elements ?? [];
  const truncated = typeof data.remark === 'string' && /timeout|memory|exceed/i.test(data.remark);

  // Coordinate converter.
  let convert: ((lon: number, lat: number) => [number, number]) | null = null;
  if (targetEpsg && targetEpsg !== 4326) {
    try {
      const proj4mod = (await import('proj4')).default;
      convert = (lon, lat) => proj4mod('EPSG:4326', `EPSG:${targetEpsg}`, [lon, lat]) as [number, number];
    } catch { /* fall back to lon/lat */ }
  }
  const toProj = (lon: number, lat: number): { x: number; y: number } => {
    if (!convert) return { x: lon, y: lat };
    const [x, y] = convert(lon, lat);
    return { x, y };
  };

  const buildings: BuildingFootprint[] = [];
  const minArea = opts.minAreaSqUnits ?? 50;

  for (const el of elements) {
    if (!el.tags || !el.tags.building) continue;

    // Extract the outer ring. Ways carry it directly; relations carry it on
    // members with role="outer". We use the first outer ring only (no holes —
    // building footprints are simple polygons for drafting purposes).
    let geom: OverpassGeomNode[] | undefined;
    if (el.type === 'way') {
      geom = el.geometry;
    } else if (el.type === 'relation') {
      const outer = (el.members ?? []).find(m => m.role === 'outer' && m.geometry?.length);
      geom = outer?.geometry;
    }
    if (!geom || geom.length < 3) continue;

    const lonLat = dropClosingVertex(geom).map(n => ({ lon: n.lon, lat: n.lat }));
    if (lonLat.length < 3) continue;

    const ringRaw = lonLat.map(p => toProj(p.lon, p.lat));
    // Force CCW winding (positive signed area). OSM rings are often CW.
    const area2 = signedArea(ringRaw);
    const ring = area2 < 0 ? ringRaw.slice().reverse() : ringRaw;
    const lonLatOrdered = area2 < 0 ? lonLat.slice().reverse() : lonLat;
    const area = Math.abs(area2);
    if (area < minArea) continue;

    buildings.push({
      id: `osm-${el.type}-${el.id}`,
      ring,
      ringLonLat: lonLatOrdered,
      tags: el.tags,
      source: 'osm',
      centroid: centroidOf(ring),
      area,
    });
  }

  // Deduplicate: relations sometimes duplicate a member way. Keep the larger.
  const byCentroidKey = new Map<string, BuildingFootprint>();
  for (const b of buildings) {
    const k = `${b.centroid.x.toFixed(2)},${b.centroid.y.toFixed(2)}`;
    const prev = byCentroidKey.get(k);
    if (!prev || b.area > prev.area) byCentroidKey.set(k, b);
  }

  return {
    buildings: Array.from(byCentroidKey.values()),
    bboxWgs84,
    queryUrl,
    truncated,
  };
}
