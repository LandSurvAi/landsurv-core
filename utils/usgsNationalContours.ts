/**
 * usgsNationalContours — built-in USGS National Map contour sources.
 *
 * The National Map publishes 1:24,000-scale contour vectors for the whole
 * country. They are derived from 1/3 arc-second (~10 m) 3DEP data — USGS does
 * not publish a nationwide *1-meter* contour product; 1 m refers to the DEM.
 * The same lines are available two ways:
 *
 *   • ArcGIS MapServer (what we use): query by AOI, CORS-enabled, returns
 *     elevation/units/interval attributes. Only the features inside the area
 *     of interest cross the wire.
 *   • S3 staged products: `s3://prd-tnm/StagedProducts/Contours/Shape/…`
 *     1°×1° shapefiles (25–104 MB each). Public HTTPS, no AWS account, but
 *     far too heavy for a single site.
 *
 * Layer ids on `contours/MapServer`:
 *   25 Normal Index (nominally 50 ft)
 *   26 Normal Intermediate (nominally 10 ft)
 *   27 Normal Supplemental (nominally 5 ft)
 *
 * Actual intervals are assigned per 7.5-minute quadrangle, so the labels are
 * nominal; the returned `contourinterval` attribute is authoritative.
 */

export const USGS_CONTOUR_SERVICE_URL =
  'https://carto.nationalmap.gov/arcgis/rest/services/contours/MapServer';

/** Naming prefix for every imported USGS contour layer. */
export const USGS_CONTOUR_LAYER_PREFIX = 'USGS-CONTOUR';

export type NationalContourType = 'contour-major' | 'contour-minor';

/** Options understood by App.handleFetchEsriContours. */
export interface ContourFetchOptions {
  /** CAD layer to tag the imported segments with. */
  layerName?: string;
  /** Existing layers starting with this prefix are replaced by the fetch. */
  clearPrefix?: string;
  /** Force a contour class instead of deriving it from the elevation. */
  contourType?: NationalContourType;
}

export interface NationalContourSource {
  id: string;
  name: string;
  /** Full layer URL (…/MapServer/N). */
  url: string;
  /** Nominal published interval, feet. Varies by quadrangle. */
  intervalFt: number;
  contourType: NationalContourType;
  layerName: string;
  attribution: string;
  notes: string;
}

export const USGS_NATIONAL_CONTOUR_SOURCES: NationalContourSource[] = [
  {
    id: 'index',
    name: 'Index contours',
    url: `${USGS_CONTOUR_SERVICE_URL}/25`,
    intervalFt: 50,
    contourType: 'contour-major',
    layerName: `${USGS_CONTOUR_LAYER_PREFIX}-INDEX`,
    attribution: 'USGS The National Map: 3D Elevation Program (public domain)',
    notes: 'nominally 50 ft · index lines only',
  },
  {
    id: 'intermediate',
    name: 'Intermediate contours',
    url: `${USGS_CONTOUR_SERVICE_URL}/26`,
    intervalFt: 10,
    contourType: 'contour-minor',
    layerName: `${USGS_CONTOUR_LAYER_PREFIX}-INTERMEDIATE`,
    attribution: 'USGS The National Map: 3D Elevation Program (public domain)',
    notes: 'nominally 10 ft · the usual working set',
  },
  {
    id: 'supplemental',
    name: 'Supplemental contours',
    url: `${USGS_CONTOUR_SERVICE_URL}/27`,
    intervalFt: 5,
    contourType: 'contour-minor',
    layerName: `${USGS_CONTOUR_LAYER_PREFIX}-SUPPLEMENTAL`,
    attribution: 'USGS The National Map: 3D Elevation Program (public domain)',
    notes: 'nominally 5 ft · densest, largest download',
  },
];

/**
 * Build the App handler options for a built-in source.
 *
 * `clearPrefix` is the source's own layer, not the shared USGS prefix: index,
 * intermediate and supplemental contours are complementary, so downloading one
 * must not wipe the others from the drawing. Re-downloading the same class
 * replaces just that class.
 */
export function nationalContourFetchOptions(source: NationalContourSource): ContourFetchOptions {
  return {
    layerName: source.layerName,
    clearPrefix: source.layerName,
    contourType: source.contourType,
  };
}
