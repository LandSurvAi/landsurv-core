import { SurveyLine, SoilMapUnit } from '../types.ts';

/**
 * soilsService (v26.05.26.4) — USDA NRCS SSURGO soil survey fetcher.
 *
 * Fetches SSURGO soil map unit polygons via the USDA NRCS Soil Data Access
 * (SDA) REST API directly. The previously-used Esri Living Atlas hosted
 * feature service (`USA_Soils_Map_Units_2`) was retired and the unsuffixed
 * variant now requires an ArcGIS Online token, so we go straight to the
 * authoritative SDA source which is public and CORS-enabled.
 *
 * Polygon rings are tagged `layer='SOILS-<MUSYM>'` so each map unit symbol
 * gets its own CAD layer for independent visibility control.
 *
 * SDA endpoint: https://sdmdataaccess.nrcs.usda.gov/Tabular/post.rest
 */

const SDA_URL = 'https://sdmdataaccess.nrcs.usda.gov/Tabular/post.rest';

// Retained for backward-compat references elsewhere in the codebase.
export const SSURGO_MAP_UNITS_URL = SDA_URL;

export interface SoilsFetchResult {
  lines: SurveyLine[];
  mapUnits: SoilMapUnit[];
  featureCount: number;
  zoneCounts: Record<string, number>;   // musym → polygon count
  exceededTransferLimit: boolean;
  queryUrl: string;
}

/**
 * Parse an ArcGIS / OGC WKT POLYGON or MULTIPOLYGON string into an array of
 * rings, each ring an array of [x, y] coordinate pairs. Z/M coordinates are
 * silently dropped — only the first two ordinates of each vertex are kept.
 */
function parseWktPolygon(wkt: string): number[][][] {
  if (!wkt) return [];
  const upper = wkt.trim().toUpperCase();
  const rings: number[][][] = [];

  // Strip leading geometry-type token and any optional Z/M tag, leaving the
  // parenthesised coordinate list.
  let body = wkt.trim();
  body = body.replace(/^MULTIPOLYGON\s*(Z|M|ZM)?\s*/i, '');
  body = body.replace(/^POLYGON\s*(Z|M|ZM)?\s*/i, '');
  body = body.trim();

  const isMulti = upper.startsWith('MULTIPOLYGON');

  // For MULTIPOLYGON, split into individual POLYGON groups: each group is
  // wrapped in an extra set of parentheses → `(((...),(...)))`.
  const polygonGroups: string[] = [];
  if (isMulti) {
    // Drop the outer-most parentheses pair.
    if (body.startsWith('(') && body.endsWith(')')) body = body.slice(1, -1);
    // Now split on `)),((` which delimits adjacent polygons.
    const parts = body.split(/\)\s*\)\s*,\s*\(\s*\(/);
    for (let i = 0; i < parts.length; i++) {
      let p = parts[i];
      if (i === 0) p = p.replace(/^\(\s*\(/, '');
      if (i === parts.length - 1) p = p.replace(/\)\s*\)\s*$/, '');
      polygonGroups.push(p);
    }
  } else {
    // Single POLYGON: drop the outer-most parentheses pair.
    if (body.startsWith('(') && body.endsWith(')')) body = body.slice(1, -1);
    polygonGroups.push(body);
  }

  for (const group of polygonGroups) {
    // Each group is `(ring1),(ring2),…` — split on `),(`.
    const ringStrings = group.split(/\)\s*,\s*\(/);
    for (let i = 0; i < ringStrings.length; i++) {
      let rs = ringStrings[i];
      if (i === 0) rs = rs.replace(/^\(/, '');
      if (i === ringStrings.length - 1) rs = rs.replace(/\)$/, '');
      const pts: number[][] = [];
      for (const vertex of rs.split(',')) {
        const nums = vertex.trim().split(/\s+/).map(Number);
        if (nums.length >= 2 && Number.isFinite(nums[0]) && Number.isFinite(nums[1])) {
          pts.push([nums[0], nums[1]]);
        }
      }
      if (pts.length >= 2) rings.push(pts);
    }
  }
  return rings;
}

/**
 * Hardened SDA POST: 20 s timeout + 2 retries with jittered backoff on
 * network errors / HTTP 5xx / 429. SDA is a single-host service (no esri
 * REST envelope), so it gets its own small wrapper rather than the shared
 * esriRestClient query path.
 */
async function sdaPost(query: string): Promise<Response> {
  const body = new URLSearchParams({ query, format: 'JSON', p_type: 'CUSTOMQUERY' }).toString();
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= 2; attempt++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 20_000);
    try {
      const resp = await fetch(SDA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: ctl.signal,
      });
      if (!resp.ok && (resp.status === 429 || resp.status >= 500) && attempt < 2) {
        lastErr = new Error(`SDA HTTP ${resp.status}`);
      } else {
        return resp;
      }
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      lastErr = new Error(isAbort ? 'SDA request timed out after 20 s' : (err instanceof Error ? err.message : String(err)));
      if (attempt >= 2) throw lastErr;
    } finally {
      clearTimeout(t);
    }
    await new Promise(res => setTimeout(res, 400 * Math.pow(2, attempt) + Math.random() * 250));
  }
  throw lastErr ?? new Error('SDA request failed');
}

/**
 * Fetch SSURGO soil map unit polygons within a WGS84 bbox via SDA SQL.
 *
 * `bboxWgs84` is [xmin, ymin, xmax, ymax] in WGS84 longitude/latitude.
 * `targetEpsg` is the project coordinate system. When undefined or 4326, raw
 * geographic coordinates are returned untransformed.
 */
export async function fetchSsurgoSoils(
  bboxWgs84: [number, number, number, number],
  targetEpsg?: number,
): Promise<SoilsFetchResult> {
  const [xmin, ymin, xmax, ymax] = bboxWgs84;

  if (![xmin, ymin, xmax, ymax].every(v => Number.isFinite(v))) {
    throw new Error(`Invalid bbox (non-finite values): [${xmin}, ${ymin}, ${xmax}, ${ymax}]`);
  }
  if (xmin >= xmax || ymin >= ymax) {
    throw new Error(`Degenerate bbox (min ≥ max): [${xmin}, ${ymin}, ${xmax}, ${ymax}]`);
  }

  // Build a closed CCW polygon WKT in WGS84 lon/lat for the bbox.
  const bboxWkt =
    `POLYGON((${xmin} ${ymin}, ${xmax} ${ymin}, ${xmax} ${ymax}, ${xmin} ${ymax}, ${xmin} ${ymin}))`;

  // SDA SQL — use the spatial-index-optimized stored procedure
  // `SDA_Get_Mupolygonkey_from_intersection_with_WktWgs84` to pre-filter
  // candidate polygons by intersection (orders of magnitude faster than a
  // raw `STIntersects` scan), then join to `mupolygon` + `mapunit` to pull
  // geometry and attributes. Capped at 5000 rows.
  const sql = `
SELECT TOP 5000
  mu.mukey,
  mu.musym,
  mu.muname,
  mu.farmlndcl,
  mu.muacres,
  mp.mupolygongeo.STAsText() AS wkt
FROM mupolygon mp
INNER JOIN mapunit mu ON mu.mukey = mp.mukey
INNER JOIN SDA_Get_Mupolygonkey_from_intersection_with_WktWgs84('${bboxWkt}') AS k
  ON k.mupolygonkey = mp.mupolygonkey
`.trim();

  const resp = await sdaPost(sql);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`SDA request failed: ${resp.status} ${resp.statusText}${text ? ` — ${text.slice(0, 200)}` : ''}`);
  }
  const data = await resp.json().catch(() => null);
  if (!data) throw new Error('SDA returned empty / non-JSON response.');

  const rows: unknown[][] = data?.Table ?? [];

  // Reproject WGS84 → targetEpsg per vertex if a project CRS is supplied.
  let ptConvert: ((xy: [number, number]) => [number, number]) | null = null;
  if (targetEpsg && targetEpsg !== 4326) {
    try {
      const proj4mod = (await import('proj4')).default;
      ptConvert = (xy) => proj4mod('EPSG:4326', `EPSG:${targetEpsg}`, xy) as [number, number];
    } catch { /* keep WGS84 coords */ }
  }

  const lines: SurveyLine[] = [];
  const zoneCounts: Record<string, number> = {};
  const mapUnitMap = new Map<string, SoilMapUnit>();

  for (const row of rows) {
    const [mukeyRaw, musymRaw, munameRaw, farmlndclRaw, muacresRaw, wktRaw] = row as [
      string | number, string, string, string | null, string | number | null, string,
    ];
    const mukey = String(mukeyRaw ?? '');
    const musym = (musymRaw ?? 'UNKNOWN').toString().toUpperCase();
    const muname = munameRaw ?? '';
    const farmlndcl = farmlndclRaw ?? undefined;
    const acres = muacresRaw == null ? undefined : Number(muacresRaw);

    zoneCounts[musym] = (zoneCounts[musym] || 0) + 1;

    if (mukey && !mapUnitMap.has(mukey)) {
      mapUnitMap.set(mukey, {
        mukey,
        musym,
        muname,
        farmlndcl,
        drclassdcd: undefined, // populated lazily via fetchSoilReport
        taxorder: undefined,
        acres: Number.isFinite(acres) ? acres : undefined,
      });
    }

    const rings = parseWktPolygon(wktRaw || '');
    const layerName = `SOILS-${musym}`;

    for (const ring of rings) {
      for (let i = 0; i < ring.length - 1; i++) {
        let [x1, y1] = ring[i];
        let [x2, y2] = ring[i + 1];
        if (ptConvert) {
          [x1, y1] = ptConvert([x1, y1]);
          [x2, y2] = ptConvert([x2, y2]);
        }
        lines.push({
          from: '', to: '',
          fromPt: { x: x1, y: y1, z: 0 },
          toPt:   { x: x2, y: y2, z: 0 },
          type: 'soils',
          layer: layerName,
          bearing: muname || musym,
        });
      }
    }
  }

  return {
    lines,
    mapUnits: Array.from(mapUnitMap.values()),
    featureCount: rows.length,
    zoneCounts,
    exceededTransferLimit: rows.length >= 5000,
    queryUrl: SDA_URL,
  };
}

/**
 * Fetch tabular soil data from USDA Soil Data Access for the given MUKEY list.
 * Returns a map of mukey → tabular record with hydrologic group, drainage class,
 * taxonomy, and farmland classification.
 *
 * CORS: SDA supports cross-origin from the browser. Falls back to an empty
 * record per MUKEY if the request fails (network or CORS restriction).
 */
export async function fetchSoilReport(
  mukeys: string[],
): Promise<Record<string, { hydgrpdcd?: string; drclassdcd?: string; taxclname?: string; farmlndcl?: string }>> {
  if (mukeys.length === 0) return {};

  const mkList = mukeys.map(k => `'${k}'`).join(',');
  const query = `
SELECT
  mu.mukey,
  c.hydgrpdcd,
  c.drclassdcd,
  c.taxclname,
  mu.farmlndcl
FROM
  mapunit mu
  LEFT JOIN component c ON c.mukey = mu.mukey AND c.majcompflag = 'Yes'
WHERE
  mu.mukey IN (${mkList})
ORDER BY
  mu.mukey, c.comppct_r DESC
`.trim();

  try {
    const resp = await sdaPost(query);
    if (!resp.ok) throw new Error(`SDA ${resp.status}`);
    const data = await resp.json();
    const table: unknown[][] = data?.Table ?? [];
    const result: Record<string, { hydgrpdcd?: string; drclassdcd?: string; taxclname?: string; farmlndcl?: string }> = {};
    for (const row of table) {
      const [mukey, hydgrpdcd, drclassdcd, taxclname, farmlndcl] = row as string[];
      if (mukey && !result[mukey]) {
        result[mukey] = {
          hydgrpdcd: hydgrpdcd || undefined,
          drclassdcd: drclassdcd || undefined,
          taxclname: taxclname || undefined,
          farmlndcl: farmlndcl || undefined,
        };
      }
    }
    return result;
  } catch {
    // Non-fatal: return empty so the panel can still show SSURGO geometry
    return {};
  }
}

/**
 * Build a compact Markdown context string for the CACP / Gemini AI describing
 * the active SSURGO soil map units. Used by the Soils Agent chat context.
 */
export function getSoilsContextString(mapUnits: SoilMapUnit[]): string {
  if (mapUnits.length === 0) return 'No soil map units currently loaded.';
  const header = '| Symbol | Name | Drainage Class | Hydro Group | Farmland Class | Tax Order |';
  const sep    = '|--------|------|----------------|-------------|----------------|-----------|';
  const rows = mapUnits.map(u =>
    `| ${u.musym} | ${u.muname} | ${u.drclassdcd ?? '—'} | ${u.hydgrpdcd ?? '—'} | ${u.farmlndcl ?? '—'} | ${u.taxorder ?? '—'} |`
  );
  return [`## Active SSURGO Soil Map Units (${mapUnits.length})`, header, sep, ...rows].join('\n');
}
