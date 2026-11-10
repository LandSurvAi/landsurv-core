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

/** Root NFHL map service — source of the full layer stack. */
export const FEMA_NFHL_ROOT_URL =
  'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer';

/** NFHL map-export endpoint used for FIRMETTE-style flood-map exhibits. */
export const FEMA_NFHL_EXPORT_URL =
  'https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/export';

const FIRMETTE_LAYERS = [0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 34].join(',');

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
  /** Full NFHL map-stack linework (FIRM panels, cross-sections, political areas, etc.). */
  auxLines: SurveyLine[];
  /** Complete NFHL layer inventory + regulatory metadata for reports and agents. */
  nfhl: FemaNfhlSummary;
  exceededTransferLimit?: boolean;
  queryUrl: string;
}

export interface FloodFetchOptions {
  /** Also pull FEMA Base Flood Elevation lines. Default true. */
  includeBfe?: boolean;
  /** Pull the complete NFHL map stack, not just zone rings and BFE lines. Default true. */
  includeAllLayers?: boolean;
}

export interface BfeLineFetchResult {
  lines: SurveyLine[];
  count: number;
  elevations: number[];
  datum: string | null;
  queryUrl: string;
  exceededTransferLimit?: boolean;
}

export type FemaNfhlLayerGeometry = 'polygon' | 'polyline' | 'point';
export type FemaNfhlLineType =
  | 'fema-cross-section'
  | 'fema-firm-panel'
  | 'fema-political'
  | 'fema-lomr'
  | 'fema-loma'
  | 'fema-water'
  | 'fema-limwa'
  | 'fema-levee'
  | 'fema-structure'
  | 'fema-dune'
  | 'fema-hydrology'
  | 'fema-boundary'
  | 'fema-other';

export interface FemaNfhlLayerDef {
  id: number;
  name: string;
  cadLayer: string;
  geometry: FemaNfhlLayerGeometry;
  lineType: FemaNfhlLineType;
  /** Attribute fields to use for the on-canvas label, in priority order. */
  labelFields?: string[];
  /** Keep the layer's attributes/labels but never emit its polygon linework.
   *  FIRM panels and base-index sheets are rectangular reference tiles that
   *  otherwise draw a grid of white boxes across the flood map. */
  metadataOnly?: boolean;
}

/**
 * Every queryable NFHL map layer that contributes regulatory or reference
 * content to a FIRM/FIRMETTE. Flood Hazard Zones (28) and BFEs (16) are
 * handled by their dedicated pipelines; the rest are fetched generically.
 */
export const FEMA_NFHL_LAYERS: readonly FemaNfhlLayerDef[] = [
  { id: 0,  name: 'NFHL Availability',             cadLayer: 'FEMA-NFHL-AVAILABILITY', geometry: 'polygon',  lineType: 'fema-other' },
  { id: 1,  name: 'LOMRs',                         cadLayer: 'FEMA-NFHL-LOMR',         geometry: 'polygon',  lineType: 'fema-lomr',       labelFields: ['CASE_NO'] },
  { id: 3,  name: 'FIRM Panels',                   cadLayer: 'FEMA-NFHL-FIRM-PANEL',   geometry: 'polygon',  lineType: 'fema-firm-panel', labelFields: ['FIRM_PAN'], metadataOnly: true },
  { id: 4,  name: 'Base Index',                    cadLayer: 'FEMA-NFHL-BASE-INDEX',   geometry: 'polygon',  lineType: 'fema-firm-panel', labelFields: ['FIRM_PAN'], metadataOnly: true },
  { id: 5,  name: 'PLSS',                          cadLayer: 'FEMA-NFHL-PLSS',         geometry: 'polygon',  lineType: 'fema-other' },
  { id: 6,  name: 'Topographic Low Confidence',    cadLayer: 'FEMA-NFHL-LOW-CONF',     geometry: 'polygon',  lineType: 'fema-other' },
  { id: 7,  name: 'River Mile Markers',            cadLayer: 'FEMA-NFHL-RIVER-MILE',   geometry: 'point',    lineType: 'fema-other',      labelFields: ['RIVER_MILE', 'MILE'] },
  { id: 8,  name: 'Datum Conversion Points',       cadLayer: 'FEMA-NFHL-DATUM',        geometry: 'point',    lineType: 'fema-other',      labelFields: ['DATUM', 'NAME'] },
  { id: 9,  name: 'Coastal Gages',                 cadLayer: 'FEMA-NFHL-COASTAL-GAGE', geometry: 'point',    lineType: 'fema-hydrology',  labelFields: ['GAGE_ID', 'NAME'] },
  { id: 10, name: 'Gages',                         cadLayer: 'FEMA-NFHL-GAGE',         geometry: 'point',    lineType: 'fema-hydrology',  labelFields: ['GAGE_ID', 'NAME'] },
  { id: 11, name: 'Nodes',                         cadLayer: 'FEMA-NFHL-NODE',         geometry: 'point',    lineType: 'fema-hydrology',  labelFields: ['NODE_ID', 'NAME'] },
  { id: 12, name: 'High Water Marks',              cadLayer: 'FEMA-NFHL-HWM',          geometry: 'point',    lineType: 'fema-hydrology',  labelFields: ['HWM_ID', 'ELEV'] },
  { id: 13, name: 'Station Start Points',          cadLayer: 'FEMA-NFHL-STATION',      geometry: 'point',    lineType: 'fema-hydrology',  labelFields: ['START_ID', 'STREAM_STN'] },
  { id: 14, name: 'Cross-Sections',                cadLayer: 'FEMA-NFHL-XS',           geometry: 'polyline', lineType: 'fema-cross-section', labelFields: ['XS_LTR'] },
  { id: 15, name: 'Coastal Transects',             cadLayer: 'FEMA-NFHL-TRANSECT',     geometry: 'polyline', lineType: 'fema-other',      labelFields: ['TRANSECT_ID'] },
  { id: 17, name: 'Profile Baselines',             cadLayer: 'FEMA-NFHL-PROFILE',      geometry: 'polyline', lineType: 'fema-hydrology',  labelFields: ['SEGMT_NAME', 'WTR_NM'] },
  { id: 18, name: 'Transect Baselines',            cadLayer: 'FEMA-NFHL-TRANSECT-BASE', geometry: 'polyline', lineType: 'fema-other',     labelFields: ['TRANSECT_ID'] },
  { id: 19, name: 'Limit of Moderate Wave Action', cadLayer: 'FEMA-NFHL-LIMWA',        geometry: 'polyline', lineType: 'fema-limwa' },
  { id: 20, name: 'Water Lines',                   cadLayer: 'FEMA-NFHL-WATER',        geometry: 'polyline', lineType: 'fema-water',      labelFields: ['WTR_NM'] },
  { id: 22, name: 'Political Jurisdictions',       cadLayer: 'FEMA-NFHL-JURISDICTION', geometry: 'polygon',  lineType: 'fema-political',  labelFields: ['POL_NAME1'] },
  { id: 23, name: 'Levees',                        cadLayer: 'FEMA-NFHL-LEVEE',        geometry: 'polyline', lineType: 'fema-levee',      labelFields: ['LEVEE_NM'] },
  { id: 24, name: 'General Structures',            cadLayer: 'FEMA-NFHL-STRUCTURE',    geometry: 'polyline', lineType: 'fema-structure',  labelFields: ['STRUCT_NM', 'STRUCT_TYP'] },
  { id: 25, name: 'Primary Frontal Dunes',         cadLayer: 'FEMA-NFHL-DUNE',         geometry: 'polyline', lineType: 'fema-dune' },
  { id: 26, name: 'Hydrologic Reaches',            cadLayer: 'FEMA-NFHL-REACH',        geometry: 'polyline', lineType: 'fema-hydrology',  labelFields: ['WTR_NM', 'REACH_ID'] },
  { id: 27, name: 'Flood Hazard Boundaries',       cadLayer: 'FEMA-NFHL-BOUNDARY',     geometry: 'polyline', lineType: 'fema-boundary' },
  { id: 29, name: 'Seclusion Boundaries',          cadLayer: 'FEMA-NFHL-SECLUSION',    geometry: 'polygon',  lineType: 'fema-other',      labelFields: ['CASE_NO'] },
  { id: 30, name: 'Alluvial Fans',                 cadLayer: 'FEMA-NFHL-ALLUVIAL-FAN', geometry: 'polygon',  lineType: 'fema-other',      labelFields: ['ALLUVL_ID'] },
  { id: 31, name: 'Subbasins',                     cadLayer: 'FEMA-NFHL-SUBBASIN',     geometry: 'polygon',  lineType: 'fema-other',      labelFields: ['SUBBAS_NM', 'WTR_NM'] },
  { id: 32, name: 'Water Areas',                   cadLayer: 'FEMA-NFHL-WATER-AREA',   geometry: 'polygon',  lineType: 'fema-water',      labelFields: ['WTR_NM'] },
  { id: 34, name: 'LOMAs',                         cadLayer: 'FEMA-NFHL-LOMA',         geometry: 'point',    lineType: 'fema-loma',       labelFields: ['CASENUMBER'] },
];

export interface FemaFirmPanelInfo {
  panel: string;
  effectiveDate: string | null;
  scale: string | null;
  panelType: string | null;
  communityId: string | null;
}

export interface FemaJurisdictionInfo {
  name: string;
  communityNumber: string | null;
  cid: string | null;
  stateFips: string | null;
  countyFips: string | null;
}

export interface FemaCrossSectionInfo {
  id: string;
  letter: string | null;
  streamName: string | null;
  station: number | null;
  waterSurfaceElevation: number | null;
  streamBedElevation: number | null;
  datum: string | null;
}

export interface FemaLomrInfo {
  caseNumber: string | null;
  effectiveDate: string | null;
  status: string | null;
}

export interface FemaLomaInfo {
  caseNumber: string | null;
  status: string | null;
  projectName: string | null;
  communityName: string | null;
  determinationType: string | null;
  outcome: string | null;
  lat: number | null;
  lon: number | null;
}

export interface FemaNfhlLayerSummary {
  id: number;
  name: string;
  cadLayer: string;
  featureCount: number;
  lineCount: number;
  labelCount: number;
  error?: string;
}

export interface FemaNfhlSummary {
  layers: FemaNfhlLayerSummary[];
  firmPanels: FemaFirmPanelInfo[];
  jurisdictions: FemaJurisdictionInfo[];
  crossSections: FemaCrossSectionInfo[];
  lomrs: FemaLomrInfo[];
  lomas: FemaLomaInfo[];
  waterNames: string[];
  totalFeatures: number;
  layerCount: number;
  errorCount: number;
}

export function emptyFemaNfhlSummary(): FemaNfhlSummary {
  return {
    layers: [],
    firmPanels: [],
    jurisdictions: [],
    crossSections: [],
    lomrs: [],
    lomas: [],
    waterNames: [],
    totalFeatures: 0,
    layerCount: 0,
    errorCount: 0,
  };
}

const textValue = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text && text !== '-9999' ? text : null;
};

const numberValue = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n !== -9999 ? n : null;
};

/** ArcGIS date fields arrive as epoch milliseconds; normalize to ISO yyyy-mm-dd. */
export function formatFemaDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '' || value === -9999) return null;
  const numeric = typeof value === 'number' || /^\d{10,}$/.test(String(value)) ? Number(value) : NaN;
  const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/** Human label for a feature, based on the NFHL layer's published fields. */
export function femaFeatureLabel(
  def: FemaNfhlLayerDef,
  attrs: Record<string, unknown>,
): string | null {
  const first = (fields?: string[]): string | null => {
    for (const field of fields ?? []) {
      const value = textValue(attrs[field]);
      if (value) return value;
    }
    return null;
  };

  switch (def.id) {
    case 3:
    case 4: {
      const panel = textValue(attrs.FIRM_PAN) ?? first(['PANEL']);
      if (!panel) return null;
      const eff = formatFemaDate(attrs.EFF_DATE);
      return `${panel}${eff ? ` \u00b7 eff. ${eff}` : ''}`;
    }
    case 14: {
      const letter = textValue(attrs.XS_LTR) ?? textValue(attrs.PROFXS_TXT);
      return letter ? `XS ${letter}` : null;
    }
    case 22: {
      const name = textValue(attrs.POL_NAME1);
      const cid = textValue(attrs.CID);
      return name ? `${name}${cid ? ` \u00b7 ${cid}` : ''}` : null;
    }
    case 1: {
      const caseNo = textValue(attrs.CASE_NO);
      const eff = formatFemaDate(attrs.EFF_DATE);
      return caseNo ? `LOMR ${caseNo}${eff ? ` \u00b7 ${eff}` : ''}` : null;
    }
    case 34: {
      const caseNo = textValue(attrs.CASENUMBER);
      return caseNo ? `LOMA ${caseNo}` : null;
    }
    case 29: {
      const caseNo = textValue(attrs.CASE_NO);
      return caseNo ? `Seclusion ${caseNo}` : null;
    }
    case 30: {
      const id = textValue(attrs.ALLUVL_ID);
      return id ? `Alluvial fan ${id}` : null;
    }
    case 19:
      return 'LiMWA';
    default:
      return first(def.labelFields);
  }
}

interface FemaLayerFetchResult {
  lines: SurveyLine[];
  summary: FemaNfhlLayerSummary;
  firmPanels: FemaFirmPanelInfo[];
  jurisdictions: FemaJurisdictionInfo[];
  crossSections: FemaCrossSectionInfo[];
  lomrs: FemaLomrInfo[];
  lomas: FemaLomaInfo[];
  waterNames: string[];
}

function emptyLayerResult(def: FemaNfhlLayerDef, error?: string): FemaLayerFetchResult {
  return {
    lines: [],
    summary: {
      id: def.id,
      name: def.name,
      cadLayer: def.cadLayer,
      featureCount: 0,
      lineCount: 0,
      labelCount: 0,
      error,
    },
    firmPanels: [],
    jurisdictions: [],
    crossSections: [],
    lomrs: [],
    lomas: [],
    waterNames: [],
  };
}

function surveySegment(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  def: FemaNfhlLayerDef,
  polylineId: string,
): SurveyLine {
  return {
    from: '',
    to: '',
    fromPt: { x: x1, y: y1, z: 0 },
    toPt: { x: x2, y: y2, z: 0 },
    type: def.lineType,
    layer: def.cadLayer,
    polylineId,
    bearing: def.name,
  };
}

function labelAnchor(
  x: number,
  y: number,
  label: string,
  def: FemaNfhlLayerDef,
  polylineId: string,
): SurveyLine {
  return {
    ...surveySegment(x, y, x, y, def, polylineId),
    labelText: label,
    labelOnly: true,
  };
}

function collectFemaMetadata(
  def: FemaNfhlLayerDef,
  attrs: Record<string, unknown>,
  result: FemaLayerFetchResult,
): void {
  if (def.id === 3 || def.id === 4) {
    const panel = textValue(attrs.FIRM_PAN);
    if (panel) {
      result.firmPanels.push({
        panel,
        effectiveDate: formatFemaDate(attrs.EFF_DATE),
        scale: textValue(attrs.SCALE),
        panelType: textValue(attrs.PANEL_TYP),
        communityId: textValue(attrs.DFIRM_ID),
      });
    }
  } else if (def.id === 22) {
    const name = textValue(attrs.POL_NAME1);
    if (name) {
      result.jurisdictions.push({
        name,
        communityNumber: textValue(attrs.COMM_NO),
        cid: textValue(attrs.CID),
        stateFips: textValue(attrs.ST_FIPS),
        countyFips: textValue(attrs.CO_FIPS),
      });
    }
  } else if (def.id === 14) {
    result.crossSections.push({
      id: textValue(attrs.XS_LN_ID) ?? textValue(attrs.OBJECTID) ?? '',
      letter: textValue(attrs.XS_LTR),
      streamName: textValue(attrs.WTR_NM),
      station: numberValue(attrs.STREAM_STN),
      waterSurfaceElevation: numberValue(attrs.WSEL_REG),
      streamBedElevation: numberValue(attrs.STRMBED_EL),
      datum: textValue(attrs.V_DATUM),
    });
  } else if (def.id === 1) {
    result.lomrs.push({
      caseNumber: textValue(attrs.CASE_NO),
      effectiveDate: formatFemaDate(attrs.EFF_DATE),
      status: textValue(attrs.STATUS),
    });
  } else if (def.id === 34) {
    result.lomas.push({
      caseNumber: textValue(attrs.CASENUMBER),
      status: textValue(attrs.STATUS),
      projectName: textValue(attrs.PROJECTNAME),
      communityName: textValue(attrs.COMMUNITYNAME),
      determinationType: textValue(attrs.DETERMINATIONTYPE),
      outcome: textValue(attrs.OUTCOME),
      lat: numberValue(attrs.LAT),
      lon: numberValue(attrs.LON),
    });
  } else if (def.id === 20 || def.id === 32) {
    const name = textValue(attrs.WTR_NM);
    if (name) result.waterNames.push(name);
  }
}

async function fetchNfhlLayer(
  def: FemaNfhlLayerDef,
  bboxWgs84: [number, number, number, number],
  targetEpsg?: number,
): Promise<FemaLayerFetchResult> {
  try {
    const result = await queryEsriFeatures<Record<string, unknown>>({
      url: `${FEMA_NFHL_ROOT_URL}/${def.id}`,
      bboxWgs84,
      outFields: '*',
      autoGeneralizePxBudget: 5000,
      timeoutMs: 12000,
      retries: 1,
      maxPages: 2,
    });

    const ptConvert = targetEpsg
      ? await makePointConverter(result.outWkid, targetEpsg)
      : null;
    if (targetEpsg && targetEpsg !== result.outWkid && !ptConvert) {
      throw new Error(`Layer is EPSG:${result.outWkid}; no converter to EPSG:${targetEpsg}.`);
    }

    const out: FemaLayerFetchResult = {
      ...emptyLayerResult(def),
      summary: {
        id: def.id,
        name: def.name,
        cadLayer: def.cadLayer,
        featureCount: result.features.length,
        lineCount: 0,
        labelCount: 0,
      },
    };
    const lines = out.lines;

    result.features.forEach((feature, fi) => {
      const attrs = feature.attributes ?? {};
      collectFemaMetadata(def, attrs, out);
      const label = femaFeatureLabel(def, attrs);
      const geometry = feature.geometry;

      if (geometry?.rings && geometry.rings.length > 0) {
        const loops = buildAreaLoops(geometry.rings, ptConvert);
        const centroid = areaCentroid(loops);
        if (centroid && label) {
          lines.push(labelAnchor(centroid.x, centroid.y, label, def, `fema-nfhl-${def.id}-${fi}-label`));
          out.summary.labelCount += 1;
        }
        // FIRM panels / base-index sheets are regulatory metadata, not base
        // geometry. Drawing their rings creates a grid of large white boxes
        // over the flood zones, so stop here after preserving the metadata.
        if (def.metadataOnly) return;
        geometry.rings.forEach((ring, ri) => {
          const polylineId = `fema-nfhl-${def.id}-${fi}-${ri}`;
          for (let i = 0; i < ring.length - 1; i++) {
            let [x1, y1] = ring[i];
            let [x2, y2] = ring[i + 1];
            if (ptConvert) {
              [x1, y1] = ptConvert([x1, y1]);
              [x2, y2] = ptConvert([x2, y2]);
            }
            lines.push(surveySegment(x1, y1, x2, y2, def, polylineId));
          }
        });
      } else if (geometry?.paths && geometry.paths.length > 0) {
        const featureStart = lines.length;
        geometry.paths.forEach((path, pi) => {
          const polylineId = `fema-nfhl-${def.id}-${fi}-${pi}`;
          for (let i = 0; i < path.length - 1; i++) {
            let [x1, y1] = path[i];
            let [x2, y2] = path[i + 1];
            if (ptConvert) {
              [x1, y1] = ptConvert([x1, y1]);
              [x2, y2] = ptConvert([x2, y2]);
            }
            lines.push(surveySegment(x1, y1, x2, y2, def, polylineId));
          }
        });
        if (label && lines.length > featureStart) {
          const labelIndex = featureStart + Math.floor((lines.length - featureStart) / 2);
          lines[labelIndex].labelText = label;
          out.summary.labelCount += 1;
        }
      } else if (geometry && typeof geometry.x === 'number' && typeof geometry.y === 'number') {
        let x = geometry.x;
        let y = geometry.y;
        if (ptConvert) [x, y] = ptConvert([x, y]);
        if (label) {
          lines.push(labelAnchor(x, y, label, def, `fema-nfhl-${def.id}-${fi}-point`));
          out.summary.labelCount += 1;
        }
      }
    });

    out.summary.lineCount = lines.length;
    return out;
  } catch (error) {
    return emptyLayerResult(def, error instanceof Error ? error.message : String(error));
  }
}

async function fetchNfhlLayerStack(
  bboxWgs84: [number, number, number, number],
  targetEpsg?: number,
): Promise<{ lines: SurveyLine[]; nfhl: FemaNfhlSummary }> {
  const results: FemaLayerFetchResult[] = new Array(FEMA_NFHL_LAYERS.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(6, FEMA_NFHL_LAYERS.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= FEMA_NFHL_LAYERS.length) return;
      results[index] = await fetchNfhlLayer(FEMA_NFHL_LAYERS[index], bboxWgs84, targetEpsg);
    }
  });
  await Promise.all(workers);

  const nfhl = emptyFemaNfhlSummary();
  const lines: SurveyLine[] = [];
  const seenPanel = new Set<string>();
  const seenJurisdiction = new Set<string>();
  const seenCrossSection = new Set<string>();
  const seenLomr = new Set<string>();
  const seenLoma = new Set<string>();
  const seenWater = new Set<string>();

  for (const result of results) {
    if (!result) continue;
    lines.push(...result.lines);
    nfhl.layers.push(result.summary);
    if (result.summary.error) nfhl.errorCount += 1;
    nfhl.totalFeatures += result.summary.featureCount;
    for (const panel of result.firmPanels) {
      const key = `${panel.panel}|${panel.effectiveDate ?? ''}`;
      if (!seenPanel.has(key)) { seenPanel.add(key); nfhl.firmPanels.push(panel); }
    }
    for (const jurisdiction of result.jurisdictions) {
      const key = `${jurisdiction.name}|${jurisdiction.cid ?? ''}`;
      if (!seenJurisdiction.has(key)) { seenJurisdiction.add(key); nfhl.jurisdictions.push(jurisdiction); }
    }
    for (const xs of result.crossSections) {
      const key = xs.id || `${xs.letter}|${xs.station}`;
      if (!seenCrossSection.has(key)) { seenCrossSection.add(key); nfhl.crossSections.push(xs); }
    }
    for (const lomr of result.lomrs) {
      const key = lomr.caseNumber ?? JSON.stringify(lomr);
      if (!seenLomr.has(key)) { seenLomr.add(key); nfhl.lomrs.push(lomr); }
    }
    for (const loma of result.lomas) {
      const key = loma.caseNumber ?? JSON.stringify(loma);
      if (!seenLoma.has(key)) { seenLoma.add(key); nfhl.lomas.push(loma); }
    }
    for (const name of result.waterNames) {
      if (!seenWater.has(name)) { seenWater.add(name); nfhl.waterNames.push(name); }
    }
  }

  nfhl.firmPanels.sort((a, b) => a.panel.localeCompare(b.panel));
  nfhl.jurisdictions.sort((a, b) => a.name.localeCompare(b.name));
  nfhl.crossSections.sort((a, b) => (a.streamName ?? '').localeCompare(b.streamName ?? '') || (a.station ?? 0) - (b.station ?? 0));
  nfhl.waterNames.sort((a, b) => a.localeCompare(b));
  nfhl.layerCount = nfhl.layers.length;
  return { lines, nfhl };
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

  // The rest of the NFHL map stack (panels, cross-sections, jurisdictions,
  // LOMRs/LOMAs, water, levees, structures, etc.) starts alongside the zone
  // and BFE queries. One unavailable layer never blocks the core flood map.
  const auxPromise = options.includeAllLayers === false
    ? Promise.resolve({ lines: [] as SurveyLine[], nfhl: emptyFemaNfhlSummary() })
    : fetchNfhlLayerStack(bboxWgs84, targetEpsg).catch(() => ({
        lines: [] as SurveyLine[],
        nfhl: { ...emptyFemaNfhlSummary(), errorCount: 1 },
      }));

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

  const [bfe, aux] = await Promise.all([bfePromise, auxPromise]);
  const requestedBfe = options.includeBfe !== false;
  const bfeLines = bfe.result?.lines ?? [];
  const bfeCount = bfe.result?.count ?? 0;
  const bfeDatum = bfe.result?.datum ?? null;
  const bfeError = requestedBfe && !bfe.result ? bfe.error : undefined;

  // Complete NFHL inventory: zone rings + every supplementary layer + BFE.
  const nfhl = aux.nfhl;
  nfhl.layers.unshift({
    id: 28,
    name: 'Flood Hazard Zones',
    cadLayer: 'FEMA-FLOOD-*',
    featureCount: features.length,
    lineCount: lines.length,
    labelCount: areas.length,
  });
  nfhl.totalFeatures += features.length;
  if (requestedBfe) {
    nfhl.layers.push({
      id: 16,
      name: 'Base Flood Elevations',
      cadLayer: 'FEMA-BFE',
      featureCount: bfeCount,
      lineCount: bfeLines.length,
      labelCount: bfeCount,
      error: bfeError,
    });
    nfhl.totalFeatures += bfeCount;
    if (bfeError) nfhl.errorCount += 1;
  }
  nfhl.layerCount = nfhl.layers.length;

  return {
    lines,
    areas,
    featureCount: features.length,
    zoneCounts,
    bfeLines,
    bfeCount,
    bfeDatum,
    bfeError,
    auxLines: aux.lines,
    nfhl,
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
