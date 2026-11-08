import { SurveyLine, MapAreaFeature } from '../types.ts';
import { queryEsriFeatures, makePointConverter } from './esriRestClient.ts';
import { buildAreaLoops, areaCentroid, areaSquareUnits, wrapAreaLabelText } from '../utils/areaGeometry.ts';

/**
 * floodService (v26.05.17.16) \u2014 FEMA National Flood Hazard Layer (NFHL) fetcher.
 *
 * Pulls regulatory flood-hazard polygons (Zones A / AE / AH / AO / VE / X /
 * X-Shaded / 0.2% annual chance / floodway) for any bounding box, converts the
 * polygon RINGS to SurveyLines tagged `layer='FEMA-NFHL'` / `type='flood'` so
 * they render on the canvas as flood-zone linework with zone code preserved
 * in the layer name for downstream styling.
 *
 * Service: https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Flood_Hazard_Reduced_Set_gdb/FeatureServer/0
 *   (USA Flood Hazard Reduced Set — S_FLD_HAZ_AR, native EPSG:4326)
 *   NOTE: The original FEMA hazards.fema.gov/arcgis MapServer/28 query endpoint
 *   returned HTTP 500 as of 2025-05. Replaced with ArcGIS Online FEMA dataset
 *   which has identical field names (FLD_ZONE, ZONE_SUBTY, STATIC_BFE, etc.).
 *
 * Mirrors handleFetchEsriContours's bbox → ArcGIS REST query → client-side
 * proj4 reprojection → SurveyLine[] pipeline.
 */

export const FEMA_NFHL_FLOOD_HAZ_URL =
  'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Flood_Hazard_Reduced_Set_gdb/FeatureServer/0';

/**
 * NFHL layer 16 — Base Flood Elevations (S_BFE). The ArcGIS-Online reduced
 * set used for the polygon rings has no BFE layer, so BFE linework is queried
 * from FEMA's authoritative NFHL map service instead.
 */
export const FEMA_NFHL_BFE_URL =
  'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/16';

/** NFHL map-export endpoint used for FIRMETTE-style flood-map exhibits. */
export const FEMA_NFHL_EXPORT_URL =
  'https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/export';

const FIRMETTE_LAYERS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 19, 20, 21, 24, 25, 27, 28].join(',');

/**
 * Build the FEMA NFHL export URL used for FIRMETTE imagery. The canvas uses
 * PNG for the on-screen preview; the downloaded deliverable is wrapped into a
 * PDF by femaReportPdf.
 */
export function buildFemaFirmetteImageUrl(
  bbox: string,
  options: { width?: number; height?: number } = {},
): string {
  const width = Math.max(100, Math.round(options.width ?? 850));
  const height = Math.max(100, Math.round(options.height ?? 1100));
  const params = new URLSearchParams({
    bbox,
    bboxSR: '4326',
    size: `${width},${height}`,
    imageSR: '4326',
    layers: `show:${FIRMETTE_LAYERS}`,
    format: 'png32',
    transparent: 'false',
    f: 'image',
    dpi: '96',
  });
  return `${FEMA_NFHL_EXPORT_URL}?${params.toString()}`;
}

export interface FloodFetchResult {
  lines: SurveyLine[];
  /** Closed polygons for editable canvas hatches and centroid annotations. */
  areas: MapAreaFeature[];
  featureCount: number;
  zoneCounts: Record<string, number>;
  /** Optional FEMA Base Flood Elevation linework (layer FEMA-BFE). */
  bfeLines: SurveyLine[];
  bfeCount: number;
  bfeDatum: string | null;
  /** Present when BFE linework was requested but could not be retrieved. */
  bfeError?: string;
  exceededTransferLimit?: boolean;
  queryUrl: string;
}

export interface FloodFetchOptions {
  /** Also pull FEMA Base Flood Elevation lines. Default true. */
  includeBfe?: boolean;
}

export interface BfeLineFetchResult {
  lines: SurveyLine[];
  count: number;
  elevations: number[];
  datum: string | null;
  queryUrl: string;
  exceededTransferLimit?: boolean;
}

/**
 * Fetch FEMA Base Flood Elevation lines (NFHL S_BFE) for a WGS84 bbox.
 * Each feature becomes SurveyLines tagged `type='bfe'` / `layer='FEMA-BFE'`;
 * one segment per feature carries a `labelText` callout so the elevation is
 * annotated exactly once along the longest run.
 */
export async function fetchFemaBfeLines(
  bboxWgs84: [number, number, number, number],
  targetEpsg?: number,
): Promise<BfeLineFetchResult> {
  type BfeAttrs = { ELEV?: number; LEN_UNIT?: string; V_DATUM?: string; SOURCE_CIT?: string };

  const result = await queryEsriFeatures<BfeAttrs>({
    url: FEMA_NFHL_BFE_URL,
    bboxWgs84,
    where: 'ELEV > 0',
    outFields: 'ELEV,LEN_UNIT,V_DATUM,SOURCE_CIT',
    autoGeneralizePxBudget: 6000,
    // BFE lines are an optional enhancement — do not let a slow NFHL layer
    // hold the flood-zone results hostage for the full default retry budget.
    timeoutMs: 15000,
    retries: 1,
  });

  const ptConvert = targetEpsg
    ? await makePointConverter(result.outWkid, targetEpsg)
    : null;

  // Never plot BFE linework in the service's native lon/lat when the project
  // is in a projected CRS and no converter is registered — that would place
  // the lines at nonsense coordinates. Surface the failure to the caller.
  if (targetEpsg && targetEpsg !== result.outWkid && !ptConvert) {
    throw new Error(
      `BFE layer is EPSG:${result.outWkid}; no converter to project EPSG:${targetEpsg} is registered.`,
    );
  }

  const lines: SurveyLine[] = [];
  const elevations: number[] = [];
  let datum: string | null = null;

  result.features.forEach((feature, fi) => {
    const paths = feature.geometry?.paths;
    if (!paths || paths.length === 0) return;

    const elevRaw = Number(feature.attributes?.ELEV);
    const elev = Number.isFinite(elevRaw) && elevRaw > 0 ? elevRaw : null;
    if (elev !== null) elevations.push(elev);
    const featureDatum = (feature.attributes?.V_DATUM || '').toString().trim() || null;
    if (!datum && featureDatum) datum = featureDatum;
    const labelText = elev !== null ? `BFE ${elev.toFixed(1)} FT` : 'BFE';

    // Put the callout on the middle segment of the longest path so long BFE
    // lines get one readable annotation instead of a label per segment.
    let longest = 0;
    for (let pi = 1; pi < paths.length; pi++) {
      if (paths[pi].length > paths[longest].length) longest = pi;
    }
    const midSegment = Math.max(0, Math.floor((paths[longest].length - 2) / 2));

    paths.forEach((path, pi) => {
      const polylineId = `fema-bfe-${fi}-${pi}`;
      for (let i = 0; i < path.length - 1; i++) {
        let [x1, y1] = path[i];
        let [x2, y2] = path[i + 1];
        if (ptConvert) {
          [x1, y1] = ptConvert([x1, y1]);
          [x2, y2] = ptConvert([x2, y2]);
        }
        lines.push({
          from: '', to: '',
          fromPt: { x: x1, y: y1, z: 0 },
          toPt:   { x: x2, y: y2, z: 0 },
          type: 'bfe',
          layer: 'FEMA-BFE',
          polylineId,
          bearing: labelText,
          labelText: pi === longest && i === midSegment ? labelText : undefined,
          bfeElevation: elev ?? undefined,
          bfeDatum: featureDatum ?? undefined,
        });
      }
    });
  });

  return {
    lines,
    count: result.features.length,
    elevations,
    datum,
    queryUrl: result.queryUrl,
    exceededTransferLimit: result.truncated,
  };
}

/**
 * Fetch FEMA NFHL flood-hazard polygons within a WGS84 bbox and convert each
 * polygon ring to a list of SurveyLine segments in the supplied target EPSG.
 *
 * `bboxWgs84` is [xmin, ymin, xmax, ymax] in WGS84 longitude/latitude.
 * `targetEpsg` is the project coordinate system. If undefined, raw service
 * coordinates are returned untransformed.
 */
export async function fetchFemaFloodHazards(
  bboxWgs84: [number, number, number, number],
  targetEpsg?: number,
  options: FloodFetchOptions = {},
): Promise<FloodFetchResult> {
  // Hardened shared client: cached svc-info, timeout+retry, full pagination,
  // and server-side generalization sized to the AOI (regulatory zone
  // boundaries at display fidelity — dramatically fewer vertices).
  type FeatureAttrs = { FLD_ZONE?: string; ZONE_SUBTY?: string; STATIC_BFE?: number; SFHA_TF?: string; FLD_AR_ID?: string };

  // BFE lines live on a different service; start that request alongside the
  // polygon query and degrade gracefully when the BFE layer is unavailable.
  const bfePromise: Promise<{ result: BfeLineFetchResult | null; error?: string }> =
    options.includeBfe === false
      ? Promise.resolve({ result: null, error: 'BFE lines not requested.' })
      : fetchFemaBfeLines(bboxWgs84, targetEpsg).then(
          result => ({ result }),
          err => ({ result: null, error: err instanceof Error ? err.message : String(err) }),
        );

  const result = await queryEsriFeatures<FeatureAttrs>({
    url: FEMA_NFHL_FLOOD_HAZ_URL,
    bboxWgs84,
    outFields: 'FLD_ZONE,ZONE_SUBTY,STATIC_BFE,SFHA_TF,FLD_AR_ID',
    autoGeneralizePxBudget: 4000,
  });

  // Client-side reprojection: service-native SR → project EPSG.
  const ptConvert = targetEpsg
    ? await makePointConverter(result.outWkid, targetEpsg)
    : null;

  const features = result.features;

  const lines: SurveyLine[] = [];
  const areas: MapAreaFeature[] = [];
  const zoneCounts: Record<string, number> = {};

  for (let fi = 0; fi < features.length; fi++) {
    const feature = features[fi];
    const rings = feature.geometry?.rings;
    if (!rings || rings.length === 0) continue;
    const zone = (feature.attributes?.FLD_ZONE || 'UNKNOWN').toString().toUpperCase();
    const subty = (feature.attributes?.ZONE_SUBTY || '').toString().trim();
    zoneCounts[zone] = (zoneCounts[zone] || 0) + 1;
    // Distinct layer per zone code so the CAD-Manager / Data Visibility panel
    // can hide / restyle each (e.g. AE vs X separately).
    const layerName = `FEMA-FLOOD-${zone}`;

    // Closed loops + interior anchor for hatching and the centroid annotation.
    const loops = buildAreaLoops(rings, ptConvert);
    const centroid = areaCentroid(loops);
    if (loops.length > 0 && centroid) {
      const bfeRaw = Number(feature.attributes?.STATIC_BFE);
      const bfe = Number.isFinite(bfeRaw) && bfeRaw > 0 ? bfeRaw : null;
      const sfha = feature.attributes?.SFHA_TF ? feature.attributes.SFHA_TF === 'T' : undefined;
      const labelLines = [`FEMA ZONE ${zone}`];
      if (subty) labelLines.push(...wrapAreaLabelText(subty.toUpperCase(), 40, 2));
      if (bfe !== null) labelLines.push(`BFE ${bfe.toFixed(1)} FT`);
      const rawId = `fema-${fi}-${feature.attributes?.FLD_AR_ID ?? ''}`;
      areas.push({
        id: rawId.replace(/[^A-Za-z0-9_-]+/g, '-'),
        source: 'fema-flood',
        layer: layerName,
        loops,
        centroid,
        areaSqFt: areaSquareUnits(loops),
        labelLines,
        attributes: {
          zone,
          subtype: subty || null,
          bfe,
          sfha: sfha ?? null,
        },
      });
    }

    rings.forEach((ring, ri) => {
      // One polylineId per ring so the legacy screen-space fill can still
      // reconstruct each closed ring when managed hatches are hidden.
      const polylineId = `fema-${fi}-${ri}`;
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
          type: 'flood',
          layer: layerName,
          polylineId,
          // Stash subtype in bearing field so CAD export can read it; harmless
          // for canvas rendering. (Existing pattern from parcel layer.)
          bearing: subty ? `${zone} \u2014 ${subty}` : zone,
        });
      }
    });
  }

  const bfe = await bfePromise;
  const requestedBfe = options.includeBfe !== false;
  const bfeLines = bfe.result?.lines ?? [];
  const bfeCount = bfe.result?.count ?? 0;
  const bfeDatum = bfe.result?.datum ?? null;
  const bfeError = requestedBfe && !bfe.result ? bfe.error : undefined;

  return {
    lines,
    areas,
    featureCount: features.length,
    zoneCounts,
    bfeLines,
    bfeCount,
    bfeDatum,
    bfeError,
    exceededTransferLimit: result.truncated,
    queryUrl: result.queryUrl,
  };
}

/**
 * Geocode a free-text description via OpenStreetMap Nominatim and return a
 * WGS84 bbox. Mirrors the description-mode branch of handleFetchEsriContours.
 */
export async function geocodeAreaDescription(desc: string): Promise<[number, number, number, number]> {
  const trimmed = desc.trim();
  if (!trimmed) throw new Error('Please enter an area description.');
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(trimmed)}&format=json&limit=1`;
  const resp = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'LandSurv.ai/1.0' } });
  if (!resp.ok) throw new Error(`Geocoding failed: ${resp.statusText}`);
  const arr = await resp.json();
  if (!arr || arr.length === 0) throw new Error(`No location found for "${trimmed}". Try a more specific description.`);
  const hit = arr[0];
  let [south, north, west, east] = (hit.boundingbox as string[]).map(Number);
  const lat = parseFloat(hit.lat);
  const lon = parseFloat(hit.lon);
  const MIN = 0.1;
  if ((north - south) < MIN) { south = lat - MIN / 2; north = lat + MIN / 2; }
  if ((east  - west)  < MIN) { west  = lon - MIN / 2; east  = lon + MIN / 2; }
  return [west, south, east, north];
}
