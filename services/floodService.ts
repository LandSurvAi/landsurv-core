import { SurveyLine } from '../types.ts';
import { queryEsriFeatures, makePointConverter } from './esriRestClient.ts';

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

export interface FloodFetchResult {
  lines: SurveyLine[];
  featureCount: number;
  zoneCounts: Record<string, number>;
  exceededTransferLimit?: boolean;
  queryUrl: string;
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
): Promise<FloodFetchResult> {
  // Hardened shared client: cached svc-info, timeout+retry, full pagination,
  // and server-side generalization sized to the AOI (regulatory zone
  // boundaries at display fidelity — dramatically fewer vertices).
  type FeatureAttrs = { FLD_ZONE?: string; ZONE_SUBTY?: string; STATIC_BFE?: number; SFHA_TF?: string };

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
  const zoneCounts: Record<string, number> = {};
  for (const feature of features) {
    const rings = feature.geometry?.rings;
    if (!rings) continue;
    const zone = (feature.attributes?.FLD_ZONE || 'UNKNOWN').toString().toUpperCase();
    const subty = (feature.attributes?.ZONE_SUBTY || '').toString();
    zoneCounts[zone] = (zoneCounts[zone] || 0) + 1;
    // Distinct layer per zone code so the CAD-Manager / Data Visibility panel
    // can hide / restyle each (e.g. AE vs X separately).
    const layerName = `FEMA-FLOOD-${zone}`;
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
          type: 'flood',
          layer: layerName,
          // Stash subtype in bearing field so CAD export can read it; harmless
          // for canvas rendering. (Existing pattern from parcel layer.)
          bearing: subty ? `${zone} \u2014 ${subty}` : zone,
        });
      }
    }
  }

  return {
    lines,
    featureCount: features.length,
    zoneCounts,
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
