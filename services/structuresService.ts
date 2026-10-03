import { SurveyPoint } from '../types.ts';

/**
 * structuresService (v26.05.17) — FEMA National Structure Inventory (NSI) fetcher.
 *
 * Fetches building centroid data from the USACE NSI API for a WGS84 bbox and
 * converts each feature to a SurveyPoint tagged layer='FEMA-NSI' so the
 * structures overlay on the canvas alongside survey points.
 *
 * API: https://nsi.sec.usace.army.mil/nsiapi/structures?fmt=fc&bbox=xmin,ymin,xmax,ymax
 * Returns: GeoJSON FeatureCollection of Point features with occupancy/attribute data.
 *
 * Occupancy type reference (partial):
 *   RES1 = Single-Family Residential, RES2 = Mobile Home, RES3 = Multi-Family
 *   COM1-10 = Commercial, IND1-6 = Industrial, AGR1 = Agricultural
 *   GOV1-2 = Government, EDU1-2 = Education, REL1 = Religious
 */

/** Direct USACE URL — kept for reference. The browser cannot call it due to CORS. */
export const NSI_API_URL = 'https://nsi.sec.usace.army.mil/nsiapi/structures';
/** Backend proxy endpoint — all browser-side fetch calls use this instead. */
const NSI_PROXY_URL = '/api/nsi/structures';

export interface NsiStructureProps {
  /** NSI occupancy type code, e.g. 'RES1', 'COM1' */
  occtype: string;
  /** Foundation type code */
  found_type?: string;
  /** Ground elevation (ft above datum) */
  ground_elv?: number;
  /** Number of stories */
  num_story?: number;
  /** Structure area (sq ft) */
  sqft_ft?: number;
  /** Structure replacement value ($) */
  val_struct?: number;
  /** Year built (median estimate) */
  med_yr_blt?: number;
  /** Census block FIPS */
  cbfips?: string;
  /** NSI unique footprint ID */
  ftprntid?: string;
}

export interface NsiFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: NsiStructureProps;
}

export interface StructuresFetchResult {
  points: SurveyPoint[];
  featureCount: number;
  occupancyCounts: Record<string, number>;
  /** Human-readable occupancy category counts (Residential / Commercial / etc.) */
  categoryCounts: Record<string, number>;
  exceededTransferLimit?: boolean;
  queryUrl: string;
  /** Sidecar map: pointNumber -> raw NSI attributes (sqft_ft, num_story, etc.).
   *  Keyed by `SurveyPoint.pointNumber` (e.g. "NSI-12") so the rectifier and
   *  attribute-join helpers can recover the full attribute bag without losing
   *  data to description-string parsing. */
  attrsByPointNumber: Record<string, NsiStructureProps>;
}

/** Map NSI type codes to friendly category names for summary display. */
export function nsiOccupancyCategory(occtype: string): string {
  const prefix = (occtype ?? '').toUpperCase().slice(0, 3);
  switch (prefix) {
    case 'RES': return 'Residential';
    case 'COM': return 'Commercial';
    case 'IND': return 'Industrial';
    case 'AGR': return 'Agricultural';
    case 'GOV': return 'Government';
    case 'EDU': return 'Education';
    case 'REL': return 'Religious/Cultural';
    default:    return 'Other';
  }
}

/**
 * Fetch FEMA NSI structures within a WGS84 bbox and convert to SurveyPoints.
 *
 * `bboxWgs84` is [xmin, ymin, xmax, ymax] in WGS84 longitude/latitude.
 * `targetEpsg` is the project coordinate system. If undefined, raw geographic
 * coordinates (lon=easting, lat=northing) are used — suitable for WGS84 projects.
 */
export async function fetchNsiStructures(
  bboxWgs84: [number, number, number, number],
  targetEpsg?: number,
): Promise<StructuresFetchResult> {
  const [xmin, ymin, xmax, ymax] = bboxWgs84;

  // Route through the backend proxy to avoid CORS on the USACE server.
  const proxyParams = new URLSearchParams({ bbox: `${xmin},${ymin},${xmax},${ymax}` });
  const queryUrl = `${NSI_PROXY_URL}?${proxyParams.toString()}`;

  // Hardened fetch: 30 s timeout + 2 retries with backoff (NSI can be slow on
  // large bboxes and intermittently 5xxes under load).
  let resp: Response | null = null;
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= 2; attempt++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 30_000);
    try {
      const r = await fetch(queryUrl, { headers: { 'Accept': 'application/json' }, signal: ctl.signal });
      if (!r.ok && (r.status === 429 || r.status >= 500) && attempt < 2) {
        lastErr = new Error(`NSI HTTP ${r.status}`);
      } else {
        resp = r;
        break;
      }
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      lastErr = new Error(isAbort ? 'NSI request timed out after 30 s' : (err instanceof Error ? err.message : String(err)));
      if (attempt >= 2) throw lastErr;
    } finally {
      clearTimeout(t);
    }
    await new Promise(res => setTimeout(res, 400 * Math.pow(2, attempt) + Math.random() * 250));
  }
  if (!resp) throw lastErr ?? new Error('NSI structures request failed');
  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    const detail = (errBody as { error?: string }).error ?? resp.statusText;
    throw new Error(`NSI structures request failed: ${detail}`);
  }

  const data = await resp.json();
  const features: NsiFeature[] = (data.features ?? []);

  // Set up coordinate reprojection from WGS84 to project EPSG if needed.
  let ptConvert: ((lonLat: [number, number]) => [number, number]) | null = null;
  if (targetEpsg && targetEpsg !== 4326 && features.length > 0) {
    try {
      const proj4mod = (await import('proj4')).default;
      ptConvert = (lonLat) => proj4mod('EPSG:4326', `EPSG:${targetEpsg}`, lonLat) as [number, number];
    } catch { /* keep geographic coords */ }
  }

  const points: SurveyPoint[] = [];
  const occupancyCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  const attrsByPointNumber: Record<string, NsiStructureProps> = {};

  features.forEach((feat, idx) => {
    const [lon, lat] = feat.geometry?.coordinates ?? [0, 0];
    const props = feat.properties ?? {} as NsiStructureProps;
    const occtype = (props.occtype ?? 'UNKNOWN').toUpperCase();

    occupancyCounts[occtype] = (occupancyCounts[occtype] ?? 0) + 1;
    const cat = nsiOccupancyCategory(occtype);
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;

    let easting = lon;
    let northing = lat;
    if (ptConvert) {
      const projected = ptConvert([lon, lat]);
      easting = projected[0];
      northing = projected[1];
    }

    const stories = props.num_story ? ` ${props.num_story}s` : '';
    const yrBuilt = props.med_yr_blt ? ` (${props.med_yr_blt})` : '';
    const desc = `${occtype}${stories}${yrBuilt}`.trim();

    const pointNumber = `NSI-${idx + 1}`;
    points.push({
      pointNumber,
      northing,
      easting,
      elevation: props.ground_elv,
      description: desc,
      layer: 'FEMA-NSI',
      latitude: lat,
      longitude: lon,
    });
    attrsByPointNumber[pointNumber] = props;
  });

  const exceededTransferLimit = (data.features?.length ?? 0) >= 5000;

  return {
    points,
    featureCount: features.length,
    occupancyCounts,
    categoryCounts,
    exceededTransferLimit,
    queryUrl,
    attrsByPointNumber,
  };
}

/**
 * Join NSI centroid attributes onto building footprints by point-in-polygon.
 *
 * For each footprint, finds NSI centroids whose coordinates fall inside the
 * polygon and merges (occtype, sqft_ft, num_story, etc.) onto the footprint.
 * If multiple centroids fall inside, the one nearest the polygon centroid wins
 * but `sqft_ft` is summed and `num_story` is the max — multi-tenant buildings
 * frequently carry one centroid per occupancy.
 *
 * Returns the input footprints with `nsi` attached (does not mutate).
 */
export function joinNsiToFootprints<F extends { ring: { x: number; y: number }[]; centroid: { x: number; y: number } }>(
  footprints: F[],
  nsiPoints: SurveyPoint[],
  attrsByPointNumber: Record<string, NsiStructureProps>,
): Array<F & { nsi?: NsiStructureProps & { matchedCount: number; pointNumbers: string[] } }> {
  // Lightweight bbox prefilter to skip O(N×M) work on large fetches.
  const fpWithBbox = footprints.map(f => {
    let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
    for (const v of f.ring) {
      if (v.x < xmin) xmin = v.x; if (v.y < ymin) ymin = v.y;
      if (v.x > xmax) xmax = v.x; if (v.y > ymax) ymax = v.y;
    }
    return { f, xmin, ymin, xmax, ymax };
  });

  const inside = (px: number, py: number, ring: { x: number; y: number }[]): boolean => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i].x, yi = ring[i].y, xj = ring[j].x, yj = ring[j].y;
      const intersect = ((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi);
      if (intersect) hit = !hit;
    }
    return hit;
  };

  return fpWithBbox.map(({ f, xmin, ymin, xmax, ymax }) => {
    const matched: Array<{ pn: string; attrs: NsiStructureProps; d2: number }> = [];
    for (const np of nsiPoints) {
      const e = np.easting, n = np.northing;
      if (e < xmin || e > xmax || n < ymin || n > ymax) continue;
      if (!inside(e, n, f.ring)) continue;
      const attrs = attrsByPointNumber[np.pointNumber];
      if (!attrs) continue;
      const dx = e - f.centroid.x, dy = n - f.centroid.y;
      matched.push({ pn: np.pointNumber, attrs, d2: dx * dx + dy * dy });
    }
    if (matched.length === 0) return f as F & { nsi?: undefined };
    matched.sort((a, b) => a.d2 - b.d2);
    const primary = matched[0].attrs;
    const sqftSum = matched.reduce((s, m) => s + (m.attrs.sqft_ft ?? 0), 0);
    const storyMax = matched.reduce((s, m) => Math.max(s, m.attrs.num_story ?? 0), 0);
    return {
      ...f,
      nsi: {
        ...primary,
        sqft_ft: sqftSum > 0 ? sqftSum : primary.sqft_ft,
        num_story: storyMax > 0 ? storyMax : primary.num_story,
        matchedCount: matched.length,
        pointNumbers: matched.map(m => m.pn),
      },
    };
  });
}
