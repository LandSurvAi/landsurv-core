/**
 * Parcel GIS Service — fetches public tax-parcel boundaries from ArcGIS REST
 * FeatureServer / MapServer endpoints and converts the returned polygon rings
 * into SurveyLine segments that the canvas already knows how to render.
 * Mirrors the architecture of handleFetchEsriContours in App.tsx
 * (service-info → reproject bbox → query → reproject back), but for polygons
 * rather than polylines and with no elevation lookup.
 *
 * Coverage strategy (nationwide, no license required):
 *   1. PUBLISHED STATEWIDE LAYERS — ~22 states publish one parcel fabric
 *      covering every county (PARCEL_STATEWIDE_SERVICES).
 *   2. PUBLISHED COUNTY LAYERS — curated counties (PARCEL_COUNTY_SERVICES).
 *   3. USER SERVERS — any ArcGIS layer a user pastes in, saved to localStorage
 *      (addCustomParcelService) after being validated by describeParcelService.
 *   4. ON-DEMAND DISCOVERY — searchParcelServicesNearby() asks ArcGIS Online
 *      for parcel feature services intersecting the AOI, so a user in any of
 *      the ~3,100 US counties can find their county's layer without us
 *      maintaining a list of thousands of endpoints.
 *
 * Around 1,900 of the ~3,100 counties publish GIS parcel data; roughly 60% of
 * those are reachable through ArcGIS Online discovery or a state layer. The
 * remainder are on-prem servers with no public REST endpoint (custom URL is a
 * dead end there) or are only available from commercial aggregators — see
 * PARCEL_DATA_NATIONWIDE.md for the licensed options.
 */

import type { ParcelLabelTextData, SurveyLine } from '../types.ts';
import { queryEsriFeatures, fetchEsriJson, getServiceInfo, makePointConverter } from './esriRestClient.ts';

export const PARCEL_LAYER_TAG = 'COUNTY-PARCEL';

export interface ParcelGisServiceDef {
  /** Stable id used in the panel dropdown. */
  id: string;
  /** Human-readable label. */
  label: string;
  /** Short subtitle (county/state). */
  region: string;
  /** Full ArcGIS REST endpoint to the parcel layer (no trailing /query). */
  url: string;
  /**
   * Field names (in priority order) that hold the parcel identifier. When
   * omitted, the fields are inferred from the layer metadata (see
   * `inferParcelIdFields`) — which is what custom/discovered services use.
   */
  parcelIdFields?: string[];
  /** Field names (in priority order) that hold the owner / taxpayer name. */
  ownerFields?: string[];
  /** USPS state abbreviation (e.g. 'PA'), used for county → state fallback. */
  state?: string;
  /** Where the entry came from. Defaults to 'county' for built-ins. */
  scope?: 'county' | 'statewide' | 'custom';
  /** Optional secondary layer for owner/deed enrichment by parcel id. */
  attributeLookup?: ParcelAttributeLookupDef;
}

export interface ParcelAttributeLookupDef {
  /** ArcGIS REST layer endpoint used only for attribute enrichment. */
  url: string;
  /** Field names (in priority order) used to match parcel IDs. */
  parcelIdFields: string[];
  /** Optional owner fields on the lookup layer. */
  ownerFields?: string[];
  /** Optional deed book fields on the lookup layer. */
  deedBookFields?: string[];
  /** Optional deed page fields on the lookup layer. */
  deedPageFields?: string[];
  /** Optional block fields on the lookup layer. */
  blockFields?: string[];
  /** Optional unit fields on the lookup layer. */
  unitFields?: string[];
}

/**
 * Registry of supported county parcel services.  Each entry points at a
 * public ArcGIS REST layer that returns esriGeometryPolygon features.
 */
/**
 * STATEWIDE parcel fabrics — one layer per state covering every county.
 * Every URL below was verified live on 2026-10-28 (layer metadata + a sample
 * bbox query returning polygons). Where `parcelIdFields`/`ownerFields` are
 * omitted the layer's own field names drive detection (see inferParcelFields);
 * that keeps entries working when a publisher renames columns.
 *
 * These also act as the fallback when a county isn't in the registry: a deed in
 * Lancaster County, TX can still pull parcel linework from the Texas layer.
 */
export const PARCEL_STATEWIDE_SERVICES: ParcelGisServiceDef[] = [
  {
    id: 'ak-statewide',
    label: 'Alaska Statewide Parcels',
    region: 'Alaska',
    state: 'AK',
    scope: 'statewide',
    url: 'https://services1.arcgis.com/7HDiw78fcUiM2BWn/arcgis/rest/services/AK_Parcels/FeatureServer/0',
  },
  {
    id: 'ar-statewide',
    label: 'Arkansas Statewide Parcels',
    region: 'Arkansas',
    state: 'AR',
    scope: 'statewide',
    url: 'https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/Planning_Cadastre/FeatureServer/3',
  },
  {
    id: 'ca-statewide',
    label: 'California Statewide Parcels',
    region: 'California',
    state: 'CA',
    scope: 'statewide',
    url: 'https://bz1uwWPKUInZBK94.svcs5.arcgis.com/bz1uwWPKUInZBK94/arcgis/rest/services/CA_Statewide_Parcels_Public_view/FeatureServer/0',
  },
  {
    id: 'co-statewide',
    label: 'Colorado Public Parcels',
    region: 'Colorado',
    state: 'CO',
    scope: 'statewide',
    url: 'https://gis.colorado.gov/public/rest/services/Address_and_Parcel/Colorado_Public_Parcels/FeatureServer/0',
    parcelIdFields: ['parcel_id', 'account'],
    ownerFields: ['owner', 'owner2'],
  },
  {
    id: 'ct-statewide',
    label: 'Connecticut CAMA & Parcel Layer',
    region: 'Connecticut',
    state: 'CT',
    scope: 'statewide',
    url: 'https://services3.arcgis.com/3FL1kr7L4LvwA2Kb/arcgis/rest/services/Connecticut_CAMA_and_Parcel_Layer/FeatureServer/0',
  },
  {
    id: 'fl-statewide',
    label: 'Florida Statewide Cadastral',
    region: 'Florida',
    state: 'FL',
    scope: 'statewide',
    url: 'https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0',
  },
  {
    id: 'hi-statewide',
    label: 'Hawaii Statewide TMKs',
    region: 'Hawaii',
    state: 'HI',
    scope: 'statewide',
    url: 'https://geodata.hawaii.gov/arcgis/rest/services/ParcelsZoning/MapServer/25',
    parcelIdFields: ['tmk', 'tmk_txt'],
  },
  {
    id: 'id-statewide',
    label: 'Idaho Public Parcels',
    region: 'Idaho',
    state: 'ID',
    scope: 'statewide',
    url: 'https://services1.arcgis.com/CNPdEkvnGl65jCX8/arcgis/rest/services/Public_Idaho_Parcels_/FeatureServer/7',
    parcelIdFields: ['PARCEL_ID'],
    ownerFields: ['OWNER1', 'OWNER2'],
  },
  {
    id: 'ma-statewide',
    label: 'Massachusetts Property Tax Parcels',
    region: 'Massachusetts',
    state: 'MA',
    scope: 'statewide',
    url: 'https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Property_Tax_Parcels/FeatureServer/0',
    parcelIdFields: ['MAP_PAR_ID', 'LOC_ID', 'PROP_ID'],
    ownerFields: ['OWNER1'],
  },
  {
    id: 'me-statewide',
    label: 'Maine Parcels (Organized Towns)',
    region: 'Maine',
    state: 'ME',
    scope: 'statewide',
    url: 'https://services1.arcgis.com/RbMX0mRVOFNTdLzd/arcgis/rest/services/Maine_Parcels_Organized_Towns/FeatureServer/10',
    parcelIdFields: ['STATE_ID', 'MAP_BK_LOT'],
  },
  {
    id: 'mn-statewide',
    label: 'Minnesota Public Parcels',
    region: 'Minnesota',
    state: 'MN',
    scope: 'statewide',
    url: 'https://utility.arcgis.com/usrsvcs/servers/1627519e8d3f42bcb55532d48e9a61e5/rest/services/OpenParcels/plan_parcels_open/MapServer/0',
    parcelIdFields: ['county_pin', 'state_pin'],
    ownerFields: ['owner_name'],
  },
  {
    id: 'nc-statewide',
    label: 'North Carolina Parcels',
    region: 'North Carolina',
    state: 'NC',
    scope: 'statewide',
    url: 'https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/MapServer/1',
    parcelIdFields: ['parno', 'altparno'],
    ownerFields: ['ownname', 'ownname2'],
  },
  {
    id: 'nd-statewide',
    label: 'North Dakota Parcels',
    region: 'North Dakota',
    state: 'ND',
    scope: 'statewide',
    url: 'https://services1.arcgis.com/GOcSXpzwBHyk2nog/arcgis/rest/services/NDGISHUB_Parcels/FeatureServer/0',
    parcelIdFields: ['UniqueGISID', 'GISID'],
    ownerFields: ['Ownership'],
  },
  {
    id: 'ne-statewide',
    label: 'Nebraska Statewide Parcels',
    region: 'Nebraska',
    state: 'NE',
    scope: 'statewide',
    url: 'https://gis.ne.gov/Enterprise/rest/services/StatewideParcelsExternal/FeatureServer/0',
  },
  {
    id: 'nj-statewide',
    label: 'New Jersey Parcels & MOD-IV',
    region: 'New Jersey',
    state: 'NJ',
    scope: 'statewide',
    url: 'https://maps.nj.gov/arcgis/rest/services/Framework/Cadastral/MapServer/0',
  },
  {
    id: 'ny-statewide',
    label: 'New York Tax Parcels',
    region: 'New York',
    state: 'NY',
    scope: 'statewide',
    url: 'https://services6.arcgis.com/EbVsqZ18sv1kVJ3k/arcgis/rest/services/NYS_Tax_Parcels_Public/FeatureServer/1',
    parcelIdFields: ['PRINT_KEY', 'SWIS_SBL_ID', 'SBL', 'MUNI_PARCEL_ID'],
    ownerFields: ['PRIMARY_OWNER', 'ADD_OWNER'],
  },
  {
    id: 'oh-statewide',
    label: 'Ohio Statewide Parcels',
    region: 'Ohio',
    state: 'OH',
    scope: 'statewide',
    url: 'https://services2.arcgis.com/MlJ0G8iWUyC7jAmu/arcgis/rest/services/OhioStatewidePacels_full_view/FeatureServer/0',
    parcelIdFields: ['StateParcelID', 'LocalParcelID'],
  },
  {
    id: 'ut-statewide',
    label: 'Utah Statewide Parcels',
    region: 'Utah',
    state: 'UT',
    scope: 'statewide',
    url: 'https://services1.arcgis.com/99lidPhWCzftIe9K/arcgis/rest/services/UtahStatewideParcels/FeatureServer/0',
  },
  {
    id: 'va-statewide',
    label: 'Virginia Statewide Parcels',
    region: 'Virginia',
    state: 'VA',
    scope: 'statewide',
    url: 'https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VA_Base_Layers/VA_Parcels/MapServer/0',
  },
  {
    id: 'vt-statewide',
    label: 'Vermont Standardized Parcels',
    region: 'Vermont',
    state: 'VT',
    scope: 'statewide',
    url: 'https://services1.arcgis.com/BkFxaEFNwHqX3tAw/arcgis/rest/services/FS_VCGI_OPENDATA_Cadastral_VTPARCELS_poly_standardized_parcels_SP_v1/FeatureServer/0',
    parcelIdFields: ['SPAN', 'PARCID', 'MAPID'],
    ownerFields: ['OWNER1', 'OWNER2'],
  },
  {
    id: 'wa-statewide',
    label: 'Washington Current Parcels',
    region: 'Washington',
    state: 'WA',
    scope: 'statewide',
    url: 'https://services.arcgis.com/jsIt88o09Q0r1j8h/arcgis/rest/services/Current_Parcels/FeatureServer/0',
  },
  {
    id: 'wi-statewide',
    label: 'Wisconsin Statewide Parcels',
    region: 'Wisconsin',
    state: 'WI',
    scope: 'statewide',
    url: 'https://services3.arcgis.com/n6uYoouQZW75n5WI/arcgis/rest/services/Wisconsin_Statewide_Parcels_DB/FeatureServer/0',
  },
];

const PARCEL_COUNTY_SERVICES: ParcelGisServiceDef[] = [
  {
    id: 'montco-pa',
    label: 'Montgomery County, PA',
    region: 'Pennsylvania',
    state: 'PA',
    scope: 'county',
    // Montgomery County PA public parcel layer (ArcGIS REST FeatureServer).
    // Verified 2026-05-17: /Parcels/Montgomery_County_Parcels/FeatureServer/10
    // is the esriGeometryPolygon parcel fabric. The older /Parcels/MapServer/0
    // path 404s.
    url: 'https://gis.montcopa.org/arcgis/rest/services/Parcels/Montgomery_County_Parcels/FeatureServer/10',
    // TAXPIN is the canonical id; ALTERNATEID is a secondary key. Owner data
    // is NOT in this layer — owner/deed metadata is in GIS_BOA_LAND table.
    parcelIdFields: ['TAXPIN', 'ALTERNATEID', 'PARCELID', 'PARCEL_ID', 'PIN', 'PARCEL', 'PARID'],
    ownerFields: ['OWNER', 'OWNER_NAME', 'TAXPAYER', 'OWNERNAME'],
    attributeLookup: {
      // Verified 2026-06-25: table contains PARCEL (12-char key), OWN1/OWN2,
      // DEED_BOOK/DEED_PAGE, BLOCK, UNIT.
      url: 'https://gis.montcopa.org/arcgis/rest/services/Parcels/GIS_BOA_LAND/FeatureServer/0',
      parcelIdFields: ['PARCEL'],
      ownerFields: ['OWN1', 'OWN2', 'OWNER', 'OWNER_NAME', 'TAXPAYER'],
      deedBookFields: ['DEED_BOOK', 'DEEDBOOK', 'BOOK', 'BOOK_NO', 'BOOKNUM', 'BOOKNUMBER', 'DBOOK', 'BK'],
      deedPageFields: ['DEED_PAGE', 'DEEDPAGE', 'PAGE', 'PAGE_NO', 'PAGENUM', 'PAGENUMBER', 'DPAGE', 'PG'],
      blockFields: ['BLOCK', 'BLOCK_NO', 'BLOCKNUM', 'BLK'],
      unitFields: ['UNIT', 'UNIT_NO', 'UNITNUM', 'UNT'],
    },
  },
  {
    id: 'bucks-pa',
    label: 'Bucks County, PA',
    region: 'Pennsylvania',
    state: 'PA',
    scope: 'county',
    // Verified 2026-05-17 via ArcGIS Hub search (owner=BucksCountyGIS).
    // Layer 0 is esriGeometryPolygon (wkid 3857) with PARCEL_NUM + OWNER1/OWNER2.
    url: 'https://services3.arcgis.com/SP47Tddf7RK32lBU/arcgis/rest/services/Bucks_County_Parcels/FeatureServer/0',
    parcelIdFields: ['PARCEL_NUM', 'PARCELNUM', 'PARCELID', 'PIN', 'PARID'],
    ownerFields: ['OWNER1', 'OWNER2', 'OWNER', 'OWNER_NAME', 'TAXPAYER'],
  },
  {
    id: 'berks-pa',
    label: 'Berks County, PA',
    region: 'Pennsylvania',
    state: 'PA',
    scope: 'county',
    // Verified 2026-05-19: V1 (Berks_County_Parcels_Public/FeatureServer/0) was
    // decommissioned by BerksCountyGIS — queries return 400 Invalid query parameters.
    // Replaced with V2 (Berks_County_Parcels_V2/FeatureServer/2, wkid 2272).
    // Layer 2 is esriGeometryPolygon, same PROPID/NAME1 field schema.
    url: 'https://services3.arcgis.com/dGYe1jDYrTw1wwpc/arcgis/rest/services/Berks_County_Parcels_V2/FeatureServer/2',
    parcelIdFields: ['PROPID', 'PARCELID', 'PARCEL_ID', 'PIN', 'PARID'],
    ownerFields: ['NAME1', 'OWNER', 'OWNER_NAME', 'TAXPAYER'],
  },
  {
    id: 'lehigh-pa',
    label: 'Lehigh County, PA',
    region: 'Pennsylvania',
    state: 'PA',
    scope: 'county',
    // Verified 2026-05-17 via ArcGIS Hub search (owner=LehighCountyPA).
    // FeatureServer/0 is a POINT layer (owner records); FeatureServer/1 is the
    // esriGeometryPolygon parcel boundaries layer (wkid 2272). Owner names live
    // on the point layer, not the polygon layer — only PIN is on the polygon.
    url: 'https://services1.arcgis.com/XWDNR4PQlDQwrRCL/arcgis/rest/services/ATestParcel/FeatureServer/1',
    parcelIdFields: ['PIN', 'PARCELID', 'PARCEL_ID', 'PARID'],
    ownerFields: ['OWNER', 'OWNER_NAME', 'TAXPAYER', 'OWNERNAME'],
    // Lehigh keeps owner metadata on layer 0 (points). We enrich by PIN after
    // fetching parcel polygons from layer 1.
    attributeLookup: {
      url: 'https://services1.arcgis.com/XWDNR4PQlDQwrRCL/arcgis/rest/services/ATestParcel/FeatureServer/0',
      parcelIdFields: ['PIN', 'PARCELID', 'PARCEL_ID', 'PARID'],
      ownerFields: ['OWNER1', 'OWNER2', 'OWNER', 'OWNER_NAME', 'NAME1', 'NAME2', 'TAXPAYER'],
      deedBookFields: ['DEED_BOOK', 'DEEDBOOK', 'BOOK', 'BOOK_NO', 'BOOKNUM', 'BOOKNUMBER', 'DBOOK', 'BK'],
      deedPageFields: ['DEED_PAGE', 'DEEDPAGE', 'PAGE', 'PAGE_NO', 'PAGENUM', 'PAGENUMBER', 'DPAGE', 'PG'],
      blockFields: ['BLOCK', 'BLOCK_NO', 'BLOCKNUM', 'BLK'],
      unitFields: ['UNIT', 'UNIT_NO', 'UNITNUM', 'UNT'],
    },
  },
  {
    id: 'philly-pa',
    label: 'Philadelphia County, PA',
    region: 'Pennsylvania',
    state: 'PA',
    scope: 'county',
    // City of Philadelphia public parcel registry (Department of Revenue).
    // Verified 2026-05-17 (owner=maps.phl.data, wkid 3857). Field `parcel` is
    // the registry parcel number; ownership lives in OPA/AVI not in this layer.
    url: 'https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/DOR_Parcel/FeatureServer/0',
    parcelIdFields: ['parcel', 'mapreg', 'basereg', 'PARCEL_ID', 'PARCELID'],
    ownerFields: ['OWNER', 'OWNER_NAME', 'TAXPAYER'],
  },
  {
    id: 'chester-pa',
    label: 'Chester County, PA',
    region: 'Pennsylvania',
    state: 'PA',
    scope: 'county',
    // Chester County (ChescoMaps / mjlittle_Chesco) Parcels_owners FeatureServer.
    // Verified 2026-05-17 via ArcGIS item 743f6f125f1e41589c0c9841d65a0ade
    // (wkid 102729 = PA State Plane South). UPI is the canonical Uniform Parcel
    // Identification Number; OWN1/OWN2 carry the owner of record.
    url: 'https://services.arcgis.com/G4S1dGvn7PIgYd6Y/arcgis/rest/services/Parcels_owners/FeatureServer/0',
    parcelIdFields: ['UPI', 'PIN_COMMON', 'PIN_MAP', 'PIN_ASMNT', 'PARCELID', 'PARCEL_ID', 'PARID'],
    ownerFields: ['OWN1', 'OWN2', 'OWNER', 'OWNER_NAME', 'TAXPAYER'],
  },
  {
    id: 'lancaster-pa',
    label: 'Lancaster County, PA',
    region: 'Pennsylvania',
    state: 'PA',
    scope: 'county',
    // Verified 2026-10-28: Lancaster County GIS Hub parcel fabric (layer 0).
    url: 'https://services1.arcgis.com/I6XnrlnguPDoEObn/arcgis/rest/services/Parcels_HUBnew/FeatureServer/0',
  },
];

/** Built-in statewide layers + curated county layers. Custom user servers
 *  are NOT in here — use getAllParcelServices() when you need the full set. */
export const PARCEL_GIS_SERVICES: ParcelGisServiceDef[] = [
  ...PARCEL_STATEWIDE_SERVICES,
  ...PARCEL_COUNTY_SERVICES,
];

/** One-line coverage hint used in agent/error messages. */
export const ALL_PARCEL_SERVICES_LABEL = (() => {
  const states = PARCEL_STATEWIDE_SERVICES.map((s) => s.state).filter(Boolean).join(', ');
  return `Supported: ${PARCEL_COUNTY_SERVICES.length} curated counties plus statewide layers for ${states}. ` +
    'Use the Boundary Agent\u2019s "Find layers here" button to locate any other county, or paste its ArcGIS server URL.';
})();

// ─── Field detection ─────────────────────────────────────────────────────────

/** Exact field names (highest confidence first) that hold a parcel identifier. */
const PARCEL_ID_EXACT = [
  'TAXPIN', 'PARCEL_ID', 'PARCELID', 'PARCEL_NUMBER', 'PARCEL_NUM', 'PARCELNO', 'PARCEL_NO',
  'PARCEL_ID_NR', 'PARCEL', 'PARNO', 'ALTPARNO', 'MAP_PAR_ID', 'PROP_ID', 'PROPERTY_ID', 'APN',
  'PAMS_PIN', 'PIN', 'PARID', 'PARCID', 'MAPID', 'SPAN', 'STATE_ID', 'COUNTY_PIN', 'STATE_PIN',
  'UNIQUEGISID', 'GISID', 'PRINT_KEY', 'SWIS_SBL_ID', 'SBL', 'UPI', 'ACCOUNT', 'TAX_ID',
  'KEY_PARCEL', 'ALTERNATEID', 'STATEPARCELID', 'LOCALPARCELID', 'STATE_PARCEL_ID', 'LOCAL_PARCEL_ID',
];

/** Field-name fragments that make a field a plausible parcel id. */
const PARCEL_ID_PATTERNS = [/PARCEL/, /\bPIN\b/, /\bAPN\b/, /PROP.*ID/, /TAX.*ID/];

/** Exact field names (highest confidence first) that hold an owner name. */
const OWNER_EXACT = [
  'OWNER', 'OWNER1', 'OWN1', 'OWN2', 'OWN3', 'OWNER2', 'OWNER3', 'OWNER_NAME', 'OWNERNAME', 'PRIMARY_OWNER', 'TAXPAYER',
  'TAX_NAME', 'OWN_NAME', 'NAME1', 'OWNERNM1', 'FULL_OWNER', 'OWNER_1', 'OWN_NAME1',
  'OWNNAME', 'OWNNAME1', 'OWNNAME2', 'OWNER_NAME1', 'OWNER_NAME2',
];

/** Filters out owner-adjacent fields that hold addresses, not names. */
const OWNER_NOISE = /(ADDR|ADDRESS|MAIL|CITY|STATE|ZIP|PHONE|EMAIL|_CO$|_CTY$)/;

const NOT_ID = /^(OBJECTID|OID|FID|SHAPE|SHAPE__AREA|SHAPE__LENGTH|CREATED|LAST_EDITED)/;

function normalizeFieldName(f: string): string {
  return String(f ?? '').trim().toUpperCase();
}

/** Pick the most likely parcel-id field names from a layer's field list. */
export function inferParcelIdFields(fieldNames: string[]): string[] {
  const fields = fieldNames.map(normalizeFieldName).filter((f) => f && !NOT_ID.test(f));
  const byExact = PARCEL_ID_EXACT.filter((candidate) => fields.includes(candidate));
  const byPattern = fields.filter((f) =>
    PARCEL_ID_PATTERNS.some((re) => re.test(f)) &&
    !OWNER_NOISE.test(f) &&
    !/OWNER|OWNERSHIP|NAME|TYPE|USE|CLASS|DESC/.test(f),
  );
  // Preserve exact-match priority, then pattern hits in layer order.
  return Array.from(new Set([...byExact, ...byPattern])).slice(0, 6);
}

/** Pick the most likely owner-name field names from a layer's field list. */
export function inferOwnerFields(fieldNames: string[]): string[] {
  const fields = fieldNames.map(normalizeFieldName).filter((f) => f && !NOT_ID.test(f));
  const exact = OWNER_EXACT.filter((candidate) => fields.includes(candidate));
  const pattern = fields.filter((f) =>
    /OWNER|TAXPAYER|OWN_NAME/.test(f) && !OWNER_NOISE.test(f),
  );
  return Array.from(new Set([...exact, ...pattern])).slice(0, 4);
}

/** Resolve the fields to read for a service, falling back to inference. */
export function resolveParcelFields(
  service: ParcelGisServiceDef,
  availableFields: string[],
): { parcelIdFields: string[]; ownerFields: string[] } {
  const parcelIdFields = service.parcelIdFields?.length
    ? service.parcelIdFields
    : inferParcelIdFields(availableFields);
  const ownerFields = service.ownerFields?.length
    ? service.ownerFields
    : inferOwnerFields(availableFields);
  return { parcelIdFields, ownerFields };
}

// ─── User-defined servers ────────────────────────────────────────────────────

export const CUSTOM_PARCEL_SERVICES_KEY = 'landsurv.parcel.customServices.v1';

export function loadCustomParcelServices(): ParcelGisServiceDef[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(CUSTOM_PARCEL_SERVICES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s): s is ParcelGisServiceDef => !!s && typeof s.url === 'string' && typeof s.id === 'string')
      .map((s) => ({ ...s, scope: 'custom' as const }));
  } catch {
    return [];
  }
}

function writeCustomParcelServices(services: ParcelGisServiceDef[]): ParcelGisServiceDef[] {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CUSTOM_PARCEL_SERVICES_KEY, JSON.stringify(services));
    }
  } catch { /* quota / private mode — in-memory callers still get the list */ }
  return services;
}

/** Add or replace a user server (matched by URL). Returns the new full list. */
export function saveCustomParcelService(def: ParcelGisServiceDef): ParcelGisServiceDef[] {
  const existing = loadCustomParcelServices().filter((s) => s.url !== def.url && s.id !== def.id);
  return writeCustomParcelServices([...existing, { ...def, scope: 'custom' }]);
}

export function deleteCustomParcelService(id: string): ParcelGisServiceDef[] {
  return writeCustomParcelServices(loadCustomParcelServices().filter((s) => s.id !== id));
}

/** Built-ins plus whatever the user has added on this device. */
export function getAllParcelServices(): ParcelGisServiceDef[] {
  const custom = loadCustomParcelServices();
  const customUrls = new Set(custom.map((s) => s.url));
  return [...PARCEL_GIS_SERVICES.filter((s) => !customUrls.has(s.url)), ...custom];
}

export function findParcelServiceById(id: string): ParcelGisServiceDef | null {
  return getAllParcelServices().find((s) => s.id === id) ?? null;
}

/** Statewide layer for a USPS abbreviation or full state name, if we have one. */
export function findStatewideParcelService(state?: string): ParcelGisServiceDef | null {
  const raw = (state ?? '').trim();
  if (!raw) return null;
  const abbr = raw.length === 2
    ? raw.toUpperCase()
    : (US_STATE_ABBR[raw.toLowerCase()] ?? raw.toUpperCase());
  return PARCEL_STATEWIDE_SERVICES.find((s) => s.state === abbr) ?? null;
}

const US_STATE_ABBR: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
  pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
  tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA',
  washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
};

// ─── Probe an arbitrary ArcGIS endpoint ──────────────────────────────────────

export interface ParcelServiceProbe {
  /** Ready-to-use service definition (id/url/label/region/inferred fields). */
  def: ParcelGisServiceDef;
  /** Layer name reported by the server. */
  layerName: string;
  geometryType: string;
  wkid?: number;
  fieldNames: string[];
}

/**
 * Normalize whatever the user pasted into a layer endpoint.
 * Accepts a layer URL (`…/FeatureServer/0`), a service root (`…/FeatureServer`),
 * an AGOL item page, or a URL with `?f=json` / `/query` tacked on.
 */
export function normalizeParcelServiceUrl(input: string): string {
  let raw = String(input ?? '').trim();
  if (!raw) return '';
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  raw = raw.split('#')[0].split('?')[0];
  const match = raw.match(/^(https?:\/\/[^/]+\/.*?\/(?:FeatureServer|MapServer))\/?(\d+)?\/?$/i);
  if (match) return match[2] ? `${match[1]}/${match[2]}` : match[1];
  return raw.replace(/\/query$/i, '').replace(/\/+$/, '');
}

function stableServiceId(url: string): string {
  let hash = 5381;
  for (let i = 0; i < url.length; i++) hash = ((hash << 5) + hash + url.charCodeAt(i)) | 0;
  return `custom-${(hash >>> 0).toString(36)}`;
}

interface ArcgisLayerMeta {
  name?: string;
  geometryType?: string;
  maxRecordCount?: number;
  fields?: Array<{ name?: string }>;
  extent?: { spatialReference?: { wkid?: number; latestWkid?: number } };
  error?: { message?: string; code?: number };
  layers?: Array<{ id: number; name?: string }>;
}

async function fetchLayerMeta(url: string): Promise<ArcgisLayerMeta> {
  try {
    return await fetchEsriJson<ArcgisLayerMeta>(`${url}?f=json`, { timeoutMs: 15_000, retries: 1 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not reach that server (${msg}). Open the URL in a browser tab and confirm it returns ArcGIS REST JSON.`);
  }
}

/**
 * Validate an ArcGIS endpoint and turn it into a parcel service definition.
 * If given a service root, probes its layers and picks the polygon layer whose
 * name looks like parcels. Throws a user-facing Error when the endpoint is not
 * usable for parcel polygons.
 */
export async function describeParcelService(
  input: string,
  opts: { label?: string; state?: string; log?: (msg: string, payload?: unknown) => void } = {},
): Promise<ParcelServiceProbe> {
  const normalized = normalizeParcelServiceUrl(input);
  if (!normalized) throw new Error('Enter an ArcGIS REST service URL.');
  if (!/\/(?:FeatureServer|MapServer)(?:\/\d+)?$/i.test(normalized)) {
    throw new Error('That does not look like an ArcGIS layer URL. It should end in /FeatureServer or /FeatureServer/0.');
  }

  let layerUrl = normalized;
  let meta = await fetchLayerMeta(layerUrl);
  if (meta.error) throw new Error(`ArcGIS error: ${meta.error.message ?? 'invalid endpoint'}`);

  if (meta.layers?.length) {
    // Service root — pick the best polygon layer.
    const candidates = meta.layers.slice(0, 40);
    const probes: Array<{ url: string; meta: ArcgisLayerMeta }> = [];
    for (const layer of candidates) {
      const url = `${normalized}/${layer.id}`;
      try {
        const layerMeta = await fetchLayerMeta(url);
        if (!layerMeta.error) probes.push({ url, meta: layerMeta });
      } catch { /* skip unreadable layer */ }
    }
    const polygon = probes.filter((p) => /polygon/i.test(p.meta.geometryType ?? ''));
    const named = polygon.filter((p) => /parcel|taxlot|cadastr|tmk|property/i.test(`${p.meta.name ?? ''}`));
    const chosen = named[0] ?? polygon[0];
    if (!chosen) throw new Error('No polygon layer found on that service. Use the layer URL (…/FeatureServer/N) for the parcel polygons.');
    layerUrl = chosen.url;
    meta = chosen.meta;
  }

  if (!/polygon/i.test(meta.geometryType ?? '')) {
    throw new Error(`That layer is ${meta.geometryType ?? 'not a polygon layer'} — parcels need esriGeometryPolygon.`);
  }

  const fieldNames = (meta.fields ?? []).map((f) => String(f.name ?? '')).filter(Boolean);
  const { parcelIdFields, ownerFields } = resolveParcelFields(
    { id: '', label: '', region: '', url: layerUrl },
    fieldNames,
  );

  const host = (() => { try { return new URL(layerUrl).hostname.replace(/^www\./, ''); } catch { return 'arcgis'; } })();
  const layerName = meta.name?.trim() || 'Parcel layer';
  const def: ParcelGisServiceDef = {
    id: stableServiceId(layerUrl),
    label: opts.label?.trim() || layerName,
    region: host,
    url: layerUrl,
    state: opts.state,
    scope: 'custom',
    parcelIdFields,
    ownerFields,
  };
  opts.log?.('[Parcel] custom service verified', { layerUrl, layerName, fieldCount: fieldNames.length });
  return {
    def,
    layerName,
    geometryType: meta.geometryType ?? '',
    wkid: meta.extent?.spatialReference?.latestWkid ?? meta.extent?.spatialReference?.wkid,
    fieldNames,
  };
}

// ─── Discovery (ArcGIS Online) ───────────────────────────────────────────────

export interface ParcelServiceCandidate {
  itemId: string;
  title: string;
  publisher: string;
  /** Service root or layer URL, ready to hand to describeParcelService(). */
  url: string;
  /** Search-result snippet (usually a description fragment). */
  snippet?: string;
}

const AGOL_SEARCH_URL = 'https://www.arcgis.com/sharing/rest/search';

/**
 * Ask ArcGIS Online which parcel feature services cover an AOI.
 * This is what makes coverage nationwide without shipping thousands of URLs:
 * most county/state GIS departments publish their parcel fabric to AGOL.
 */
export async function searchParcelServicesNearby(
  bbox: WgsBbox,
  opts: { limit?: number; log?: (msg: string, payload?: unknown) => void } = {},
): Promise<ParcelServiceCandidate[]> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 50);
  const params = new URLSearchParams({
    q: 'title:parcels type:"Feature Service"',
    bbox: `${bbox.xmin},${bbox.ymin},${bbox.xmax},${bbox.ymax}`,
    f: 'json',
    num: String(limit),
  });
  const data = await fetchEsriJson<{
    results?: Array<{
      id?: string;
      title?: string;
      owner?: string;
      url?: string;
      snippet?: string;
      type?: string;
      /** [[xmin, ymin], [xmax, ymax]] in WGS84. */
      extent?: [[number, number], [number, number]];
    }>;
  }>(`${AGOL_SEARCH_URL}?${params.toString()}`, { timeoutMs: 15_000, retries: 1, log: opts.log });

  // AGOL's bbox filter is deliberately loose (it also matches items *near* the
  // AOI), and it happily returns national datasets. Filter properly: the item
  // extent must actually reach the AOI, and it must be regional rather than
  // nationwide, then rank the most local layer first.
  const pad = 0.001;
  const scored: Array<{ candidate: ParcelServiceCandidate; area: number }> = [];
  const seen = new Set<string>();
  for (const item of data.results ?? []) {
    const url = normalizeParcelServiceUrl(item.url ?? '');
    if (!url || !/\/(?:FeatureServer|MapServer)(?:\/\d+)?$/i.test(url)) continue;
    if (!/parcel/i.test(item.title ?? '')) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;

    let area = Number.POSITIVE_INFINITY;
    if (item.extent?.[0] && item.extent?.[1]) {
      const [xmin, ymin] = item.extent[0];
      const [xmax, ymax] = item.extent[1];
      const outside =
        xmax < bbox.xmin - pad || xmin > bbox.xmax + pad ||
        ymax < bbox.ymin - pad || ymin > bbox.ymax + pad;
      if (outside) continue;
      const w = Math.abs(xmax - xmin);
      const h = Math.abs(ymax - ymin);
      // National / global layers match every AOI but hold no local parcel ids.
      if (w > 20 || h > 15) continue;
      area = w * h;
    }

    seen.add(key);
    scored.push({
      area,
      candidate: {
        itemId: String(item.id ?? ''),
        title: (item.title ?? 'Parcel layer').trim(),
        publisher: (item.owner ?? '').trim(),
        url,
        snippet: (item.snippet ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 220) || undefined,
      },
    });
  }

  scored.sort((a, b) => a.area - b.area || a.candidate.title.localeCompare(b.candidate.title));
  const out = scored.map((s) => s.candidate);
  opts.log?.('[Parcel] discovery', { bbox, found: out.length });
  return out;
}

// ─── Owner / deed enrichment (second-layer lookup) ───────────────────────────

/** Summary of a secondary-layer lookup, surfaced in the Boundary Agent panel. */
export interface ParcelEnrichmentSummary {
  /** Layer URL the owner/deed attributes came from. */
  source: string;
  /** Sibling layer name reported by the server, when known. */
  sourceName?: string;
  /** Parcels the lookup returned a record for. */
  matched: number;
  /** Parcels actually filled in with owner and/or deed data. */
  enriched: number;
  /** True when the layer was auto-detected rather than configured. */
  auto: boolean;
}

const DEED_BOOK_PATTERNS = [/DEED.*BOOK/, /^BOOK(_|$)/, /DBOOK/, /BOOK_?NO/, /^BK$/];
const DEED_PAGE_PATTERNS = [/DEED.*PAGE/, /^PAGE(_|$)/, /DPAGE/, /PAGE_?NO/, /^PG$/];
const BLOCK_PATTERNS = [/^BLOCK/, /BLOCK_?NO/, /^BLK$/];
const UNIT_PATTERNS = [/^UNIT/, /UNIT_?NO/, /^UNT$/];

function pickFieldsByPattern(fieldNames: string[], patterns: RegExp[], limit = 2): string[] {
  const out: string[] = [];
  for (const name of fieldNames) {
    const upper = normalizeFieldName(name);
    if (!upper || NOT_ID.test(upper)) continue;
    if (!patterns.some((re) => re.test(upper))) continue;
    if (!out.includes(name)) out.push(name);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Score a sibling layer/table as a source of owner + deed attributes.
 * Higher is better; 0 means "not useful". Exported for tests.
 */
export function scoreAttributeLookupCandidate(args: {
  candidateName: string;
  candidateFields: string[];
  primaryIdFields: string[];
}): number {
  const fields = args.candidateFields.map(normalizeFieldName).filter(Boolean);
  if (fields.length === 0) return 0;

  const ownerFields = inferOwnerFields(fields);
  const deedFields = [
    ...pickFieldsByPattern(fields, DEED_BOOK_PATTERNS),
    ...pickFieldsByPattern(fields, DEED_PAGE_PATTERNS),
  ];
  // A layer with neither owner names nor deed references buys us nothing.
  if (ownerFields.length === 0 && deedFields.length === 0) return 0;

  const nameScore = /(cama|assess|owner|tax|boa|land|deed|parcel|prop)/i.test(args.candidateName) ? 3 : 0;
  const fieldSet = new Set(fields);
  const sharesId = args.primaryIdFields.some((f) => fieldSet.has(normalizeFieldName(f)));
  const hasJoinableId = sharesId || inferParcelIdFields(fields).length > 0;

  let score = nameScore + (ownerFields.length ? 2 : 0) + (deedFields.length ? 2 : 0);
  if (sharesId) score += 3;
  if (!hasJoinableId) score -= 5; // no key to join on
  return score;
}

/** Service root for a layer URL (`…/FeatureServer/0` → `…/FeatureServer`). */
export function parcelServiceRoot(layerUrl: string): string | null {
  const match = String(layerUrl ?? '').match(/^(.*\/(?:FeatureServer|MapServer))\/\d+$/i);
  return match ? match[1] : null;
}

/**
 * Layers of *neighbouring services* in the same ArcGIS folder. Counties
 * routinely publish the parcel fabric and the assessment/CAMA table as two
 * services side by side (e.g. /Parcels/Montgomery_County_Parcels and
 * /Parcels/GIS_BOA_LAND), so the sibling-layer pass alone misses them.
 */
async function folderSiblingLayers(
  root: string,
  log?: (msg: string, payload?: unknown) => void,
): Promise<Array<{ url: string; name: string }>> {
  const match = root.match(/^(.*)\/([^/]+)\/(?:FeatureServer|MapServer)$/i);
  if (!match) return [];
  const [, folderUrl, currentService] = match;
  // Only inside a real folder — never enumerate an org's root services.
  if (/\/rest\/services$/i.test(folderUrl)) return [];
  const servicesRoot = folderUrl.match(/^(.*\/rest\/services)\/.*$/i)?.[1];
  if (!servicesRoot) return [];

  let folderInfo: { services?: Array<{ name?: string; type?: string }> };
  try {
    folderInfo = await fetchEsriJson(`${folderUrl}?f=json`, { timeoutMs: 12_000, retries: 0, log });
  } catch {
    return [];
  }

  // Folder listings return names like "Parcels/GIS_BOA_LAND", relative to the
  // REST services root — not relative to the folder we are standing in.
  const byName = new Map<string, { name: string; type: string }>();
  for (const service of folderInfo.services ?? []) {
    const name = String(service?.name ?? '');
    if (!name) continue;
    const leaf = name.split('/').pop();
    if (!leaf || leaf === currentService) continue;
    if (!/(boa|cama|own|assess|tax|deed|land|prop)/i.test(leaf)) continue;
    const type = String(service.type ?? 'FeatureServer');
    const existing = byName.get(name);
    // Prefer the FeatureServer flavour of a service published both ways.
    if (!existing || type === 'FeatureServer') byName.set(name, { name, type });
  }
  const neighbours = Array.from(byName.values()).slice(0, 2).map((service) => ({
    name: service.name,
    url: `${servicesRoot}/${service.name}/${service.type}`,
  }));

  const layers: Array<{ url: string; name: string }> = [];
  for (const neighbour of neighbours) {
    try {
      const info = await getServiceInfo(neighbour.url, { log });
      for (const layer of (info.layers ?? []).slice(0, 2)) {
        layers.push({ url: `${neighbour.url}/${layer.id}`, name: `${neighbour.name} / ${layer.name}` });
      }
      for (const table of (info.tables ?? []).slice(0, 2)) {
        layers.push({ url: `${neighbour.url}/${table.id}`, name: `${neighbour.name} / ${table.name}` });
      }
    } catch { /* service unavailable — skip */ }
  }
  if (layers.length > 0) log?.('[Parcel] enrichment-folder-scan', { folderUrl, layers: layers.map((l) => l.url) });
  return layers;
}

/**
 * Look for a sibling layer/table on the same ArcGIS service that carries owner
 * and deed references keyed by the parcel id. Counties routinely split geometry
 * (parcel fabric) from assessment data (CAMA), so this is the difference
 * between "parcel 40-00-12345" and "JOHN SMITH, Deed Bk/Pg 5420/182".
 */
export async function discoverAttributeLookups(
  service: ParcelGisServiceDef,
  primaryIdFields: string[],
  log?: (msg: string, payload?: unknown) => void,
): Promise<Array<{ def: ParcelAttributeLookupDef; name: string; score: number }>> {
  const root = parcelServiceRoot(service.url);
  if (!root) return [];

  let rootInfo;
  try {
    rootInfo = await getServiceInfo(root, { log });
  } catch (e) {
    log?.('[Parcel] enrichment-root-error', { root, error: String(e) });
    return [];
  }

  const scoreLayer = async (candidate: { url: string; name: string }) => {
    let info;
    try {
      info = await getServiceInfo(candidate.url, { log });
    } catch { return null; }
    if (info.fieldNames.length === 0) return null;
    const score = scoreAttributeLookupCandidate({
      candidateName: candidate.name,
      candidateFields: info.fieldNames,
      primaryIdFields,
    });
    if (score <= 0) return null;

    const idCandidates = inferParcelIdFields(info.fieldNames);
    const sharedIds = idCandidates.filter((f) =>
      primaryIdFields.some((p) => normalizeFieldName(p) === normalizeFieldName(f)),
    );
    return {
      name: candidate.name,
      score,
      def: {
        url: candidate.url,
        parcelIdFields: (sharedIds.length ? sharedIds : idCandidates).slice(0, 3),
        ownerFields: inferOwnerFields(info.fieldNames),
        deedBookFields: pickFieldsByPattern(info.fieldNames, DEED_BOOK_PATTERNS),
        deedPageFields: pickFieldsByPattern(info.fieldNames, DEED_PAGE_PATTERNS),
        blockFields: pickFieldsByPattern(info.fieldNames, BLOCK_PATTERNS),
        unitFields: pickFieldsByPattern(info.fieldNames, UNIT_PATTERNS),
      } as ParcelAttributeLookupDef,
    };
  };

  // Pass 1 — other layers/tables on the same service.
  const siblings = [
    ...(rootInfo.layers ?? []).map((l) => ({ id: l.id, name: l.name })),
    ...(rootInfo.tables ?? []).map((t) => ({ id: t.id, name: t.name })),
  ]
    .filter((s) => `${root}/${s.id}` !== service.url)
    .slice(0, 12)
    .map((s) => ({ url: `${root}/${s.id}`, name: s.name }));

  const scored: Array<{ def: ParcelAttributeLookupDef; name: string; score: number }> = [];
  for (const candidate of siblings) {
    const entry = await scoreLayer(candidate);
    if (entry) scored.push(entry);
  }

  // Pass 2 — CAMA/assessment services sitting next to the parcel service in
  // the same ArcGIS folder (Montco: /Parcels/GIS_BOA_LAND).
  let probedCount = siblings.length;
  if (!scored.some((s) => s.def.parcelIdFields.length > 0)) {
    const neighbours = await folderSiblingLayers(root, log);
    probedCount += neighbours.length;
    for (const candidate of neighbours) {
      const entry = await scoreLayer(candidate);
      if (entry) scored.push(entry);
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const usable = scored.filter((s) => s.def.parcelIdFields.length > 0).slice(0, 3);
  log?.('[Parcel] enrichment-candidates', {
    root,
    probed: probedCount,
    ranked: usable.map((s) => ({ name: s.name, score: s.score, url: s.def.url })),
  });
  return usable;
}

export interface ParcelFeatureSummary extends ParcelLabelTextData {
  attributes: Record<string, unknown>;
}

export interface ParcelFetchResult {
  /** New SurveyLine segments tagged with layer=COUNTY-PARCEL, type='parcel'. */
  lines: SurveyLine[];
  /** Original feature count (one per parcel polygon). */
  featureCount: number;
  /** Set true when the ArcGIS server truncated the response. */
  exceededTransferLimit: boolean;
  /** Lightweight summary of every parcel returned (id + owner). */
  parcels: ParcelFeatureSummary[];
  /** Centroid of each parcel's outer ring, in the project coordinate system. Used for text label placement. */
  labelPoints: Array<{ x: number; y: number; parcelId: string | null; owner: string | null; deedBook: string | null; deedPage: string | null; block: string | null; unit: string | null; deedRef: string | null }>;
  /** Set when owner/deed attributes were filled in from a secondary layer. */
  enrichment?: ParcelEnrichmentSummary;
}

/** Bbox in WGS84 (xmin/ymin/xmax/ymax = west/south/east/north). */
export interface WgsBbox {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

/**
 * Query a county parcel layer for everything intersecting the given WGS84
 * bbox and convert the returned polygon rings into SurveyLine segments in
 * the project's EPSG.  Caller is responsible for supplying a bbox (either
 * from an inclusion polygon or a geocoded description) — this module does
 * not geocode or read user-drawn lines.
 *
 * The function follows the same five-step contract as handleFetchEsriContours
 * so debugging is consistent across the two services:
 *   1. Determine bbox  (caller-supplied here)
 *   2. Fetch service metadata, reproject bbox into native SR
 *   3. Issue the /query request
 *   4. Walk the polygon rings, reproject back to project EPSG, emit lines
 *   5. Return result envelope
 */
export async function fetchParcelsForBbox(
  service: ParcelGisServiceDef,
  bbox: WgsBbox,
  projectEpsg: number | undefined,
  log?: (msg: string, payload?: unknown) => void,
): Promise<ParcelFetchResult> {
  const dbg = (msg: string, payload?: unknown) => log?.(`[Parcel] ${msg}`, payload);
  const normalizeParcelId = (id: string | null | undefined): string | null => {
    if (!id) return null;
    const v = id.trim().toLowerCase();
    return v.length > 0 ? v : null;
  };

  // Field detection: configured fields win, otherwise infer from the layer's
  // own metadata. getServiceInfo is cached by the shared client, so this does
  // not add a round-trip on repeat fetches.
  let resolvedIdFields = service.parcelIdFields ?? [];
  let resolvedOwnerFields = service.ownerFields ?? [];
  if (resolvedIdFields.length === 0 || resolvedOwnerFields.length === 0) {
    const info = await getServiceInfo(service.url, { log: dbg });
    const resolved = resolveParcelFields(service, info.fieldsUpper);
    resolvedIdFields = resolved.parcelIdFields;
    resolvedOwnerFields = resolved.ownerFields;
    dbg('field-detection', {
      configured: { id: service.parcelIdFields ?? null, owner: service.ownerFields ?? null },
      resolved: { id: resolvedIdFields, owner: resolvedOwnerFields },
    });
  }

  // ── 2+3. Hardened shared client ─────────────────────────────────────────
  // Cached svc-info → native-SR bbox → paged /query with retry + timeout.
  // Full pagination means dense parcel fabrics are never silently truncated.
  // A high pixel budget keeps parcel corners survey-tight while trimming
  // vertex spam on large AOIs.
  const result = await queryEsriFeatures<Record<string, unknown>>({
    url: service.url,
    bboxWgs84: [bbox.xmin, bbox.ymin, bbox.xmax, bbox.ymax],
    outFields: '*',
    autoGeneralizePxBudget: 12000,
    log: dbg,
  });
  const features = result.features as Array<{
    geometry?: { rings?: number[][][] };
    attributes?: Record<string, unknown>;
  }>;
  dbg('response', { featureCount: features.length, pages: result.pages, truncated: result.truncated });

  // ── 4. Client-side reprojection (native SR → project EPSG) ────────────
  const ptConvert = projectEpsg
    ? await makePointConverter(result.outWkid, projectEpsg)
    : null;
  if (ptConvert) dbg('client-convert', { from: result.outWkid, to: projectEpsg });

  const toAttrKeyMap = (attrs: Record<string, unknown>): Record<string, string> => {
    const map: Record<string, string> = {};
    for (const key of Object.keys(attrs)) map[key.toLowerCase()] = key;
    return map;
  };

  const readAttr = (attrs: Record<string, unknown>, keyMap: Record<string, string>, field: string): string | null => {
    const originalKey = keyMap[field.toLowerCase()];
    if (!originalKey) return null;
    const raw = attrs[originalKey];
    if (raw == null) return null;
    const value = String(raw).trim();
    return value.length > 0 ? value : null;
  };

  const pickAttr = (attrs: Record<string, unknown>, keyMap: Record<string, string>, fields: string[]): string | null => {
    for (const f of fields) {
      const val = readAttr(attrs, keyMap, f);
      if (val) return val;
    }
    return null;
  };

  const pickOwner = (attrs: Record<string, unknown>, keyMap: Record<string, string>, fields: string[]): string | null => {
    const values: string[] = [];
    for (const f of fields) {
      const val = readAttr(attrs, keyMap, f);
      if (val && !values.includes(val)) values.push(val);
    }
    return values.length > 0 ? values.join(' & ') : null;
  };

  const pickByRegex = (attrs: Record<string, unknown>, keyMap: Record<string, string>, patterns: RegExp[]): string | null => {
    for (const [lowerKey, originalKey] of Object.entries(keyMap)) {
      if (!patterns.some((re) => re.test(lowerKey))) continue;
      const raw = attrs[originalKey];
      if (raw == null) continue;
      const value = String(raw).trim();
      if (value.length > 0) return value;
    }
    return null;
  };

  const formatDeedRef = (
    deedBook: string | null,
    deedPage: string | null,
    block: string | null,
    unit: string | null,
  ): string | null => {
    const parts: string[] = [];
    if (deedBook || deedPage) {
      if (deedBook && deedPage) parts.push(`Deed Bk/Pg ${deedBook}/${deedPage}`);
      else if (deedBook) parts.push(`Deed Book ${deedBook}`);
      else if (deedPage) parts.push(`Deed Page ${deedPage}`);
    }
    if (block || unit) {
      if (block && unit) parts.push(`Block/Unit ${block}/${unit}`);
      else if (block) parts.push(`Block ${block}`);
      else if (unit) parts.push(`Unit ${unit}`);
    }
    return parts.length > 0 ? parts.join(' | ') : null;
  };

  const extractParcelFields = (
    attrs: Record<string, unknown>,
    idFields: string[],
    ownerFields: string[],
    deedBookFields?: string[],
    deedPageFields?: string[],
    blockFields?: string[],
    unitFields?: string[],
  ) => {
    const keyMap = toAttrKeyMap(attrs);
    const parcelId = pickAttr(attrs, keyMap, idFields);
    const owner = pickOwner(attrs, keyMap, ownerFields)
      ?? pickByRegex(attrs, keyMap, [/owner/, /taxpayer/, /^name1$/, /^owner1$/, /^owner_name$/]);

    const deedBook = pickAttr(attrs, keyMap, deedBookFields ?? ['DEED_BOOK', 'DEEDBOOK', 'BOOK', 'BOOK_NO', 'BOOKNUM', 'BOOKNUMBER', 'DBOOK', 'BK']);
    const deedPage = pickAttr(attrs, keyMap, deedPageFields ?? ['DEED_PAGE', 'DEEDPAGE', 'PAGE', 'PAGE_NO', 'PAGENUM', 'PAGENUMBER', 'DPAGE', 'PG']);
    const block = pickAttr(attrs, keyMap, blockFields ?? ['BLOCK', 'BLOCK_NO', 'BLOCKNUM', 'BLK']);
    const unit = pickAttr(attrs, keyMap, unitFields ?? ['UNIT', 'UNIT_NO', 'UNITNUM', 'UNT']);

    const deedBookFallback = deedBook ?? pickByRegex(attrs, keyMap, [/deed.*book/, /book(_|)no/, /^book$/]);
    const deedPageFallback = deedPage ?? pickByRegex(attrs, keyMap, [/deed.*page/, /page(_|)no/, /^page$/]);
    const blockFallback = block ?? pickByRegex(attrs, keyMap, [/^block$/, /block(_|)no/, /^blk$/]);
    const unitFallback = unit ?? pickByRegex(attrs, keyMap, [/^unit$/, /unit(_|)no/, /^unt$/]);

    return {
      parcelId,
      owner,
      deedBook: deedBookFallback,
      deedPage: deedPageFallback,
      block: blockFallback,
      unit: unitFallback,
      deedRef: formatDeedRef(deedBookFallback, deedPageFallback, blockFallback, unitFallback),
    };
  };

  const newLines: SurveyLine[] = [];
  const parcels: ParcelFeatureSummary[] = [];
  const labelPoints: Array<{ x: number; y: number; parcelId: string | null; owner: string | null; deedBook: string | null; deedPage: string | null; block: string | null; unit: string | null; deedRef: string | null }> = [];
  for (const feature of features) {
    const rings = feature.geometry?.rings;
    if (!rings) continue;
    const attrs = feature.attributes ?? {};
    const parsed = extractParcelFields(attrs, resolvedIdFields, resolvedOwnerFields);
    const { parcelId, owner, deedBook, deedPage, block, unit, deedRef } = parsed;

    parcels.push({
      parcelId,
      owner,
      deedBook,
      deedPage,
      block,
      unit,
      deedRef,
      attributes: attrs,
    });
    // Compute centroid of outer ring (ring[0]) for text label placement.
    const outerRing = rings[0];
    if (outerRing && outerRing.length > 0) {
      let cx = 0, cy = 0;
      for (const pt of outerRing) {
        cx += pt[0];
        cy += pt[1];
      }
      cx /= outerRing.length;
      cy /= outerRing.length;
      let [lx, ly] = ptConvert ? ptConvert([cx, cy]) : [cx, cy];
      labelPoints.push({ x: lx, y: ly, parcelId, owner, deedBook, deedPage, block, unit, deedRef });
    }
    for (const ring of rings) {
      for (let i = 0; i < ring.length - 1; i++) {
        let [x1, y1] = ring[i];
        let [x2, y2] = ring[i + 1];
        if (ptConvert) {
          [x1, y1] = ptConvert([x1, y1]);
          [x2, y2] = ptConvert([x2, y2]);
        }
        newLines.push({
          from: '',
          to: '',
          fromPt: { x: x1, y: y1, z: 0 },
          toPt: { x: x2, y: y2, z: 0 },
          type: 'parcel',
          layer: PARCEL_LAYER_TAG,
        });
      }
    }
  }

  // ── 4b. Secondary-layer owner/deed enrichment ───────────────────────────
  // Counties split geometry (parcel fabric) from assessment data (CAMA). When
  // the primary layer carries no owner column, look for a sibling layer/table
  // on the same service and join on the parcel id. Configured lookups always
  // run; auto-detected ones only when the primary has no owner data at all
  // (otherwise we'd spend four queries per fetch chasing deed book/page).
  let enrichment: ParcelEnrichmentSummary | undefined;
  // Decide from the data, not from configuration: a layer can advertise an
  // owner column that is empty for every feature (Montco's parcel fabric does).
  const parcelsWithId = parcels.filter((p) => p.parcelId);
  const missingOwner = parcelsWithId.filter((p) => !p.owner).length;
  const autoEligible =
    parcelsWithId.length > 0 &&
    missingOwner >= Math.max(1, Math.ceil(parcelsWithId.length * 0.5));
  const needsAttributeLookup =
    parcelsWithId.length > 0 &&
    (service.attributeLookup
      ? parcelsWithId.some((p) => !p.owner || !p.deedRef)
      : autoEligible);

  if (needsAttributeLookup && parcels.length > 0) {
    const lookups: Array<{ def: ParcelAttributeLookupDef; auto: boolean; name?: string }> = [];
    if (service.attributeLookup) {
      lookups.push({ def: service.attributeLookup, auto: false });
    } else {
      const discovered = await discoverAttributeLookups(service, resolvedIdFields, dbg);
      for (const candidate of discovered) {
        lookups.push({ def: candidate.def, auto: true, name: candidate.name });
      }
      if (discovered.length === 0) dbg('enrichment-no-candidates', { url: service.url });
    }

    const escapeSqlString = (value: string) => value.replace(/'/g, "''");
    const buildWhereForBatch = (ids: string[], idFields: string[]): string => {
      const quoted = ids.map((id) => `'${escapeSqlString(id)}'`);
      const fieldClauses = idFields.map((field) => {
        // String-safe IN clause only. Some ArcGIS layers return 400 when
        // mixing numeric literals against text parcel-id fields.
        return `(${field} IN (${quoted.join(',')}))`;
      });
      return fieldClauses.join(' OR ');
    };

    for (const lookupEntry of lookups) {
      const lookup = lookupEntry.def;
      const missing = parcels.filter((p) => p.parcelId && (!p.owner || !p.deedRef));
      const uniqueIds = Array.from(new Set(missing.map((p) => p.parcelId as string)));
      if (uniqueIds.length === 0) break;
      // Auto-detected lookups are best-effort: cap the work so a 4,000-parcel
      // AOI never turns into dozens of speculative round-trips.
      const maxIds = lookupEntry.auto ? 1000 : 5000;
      const idsToQuery = uniqueIds.slice(0, maxIds);

      const lookupMap = new Map<string, Omit<ParcelFeatureSummary, 'attributes'>>();
      const BATCH_SIZE = 50;
      try {
        let lookupIdFields = lookup.parcelIdFields;
        try {
          const lookupInfo = await getServiceInfo(lookup.url, { log: dbg });
          if (lookupInfo.fieldsUpper.length > 0) {
            const existing = new Set(lookupInfo.fieldsUpper);
            const filtered = lookup.parcelIdFields.filter((f) => existing.has(f.toUpperCase()));
            if (filtered.length > 0) lookupIdFields = filtered;
          }
          dbg('lookup-id-fields', { lookupUrl: lookup.url, configured: lookup.parcelIdFields, usable: lookupIdFields });
        } catch (e) {
          dbg('lookup-id-fields-error', { lookupUrl: lookup.url, error: String(e) });
        }
        if (lookupIdFields.length === 0) {
          dbg('lookup-no-id-fields', { lookupUrl: lookup.url });
          continue;
        }

        const fetchBatch = async (batchIds: string[]): Promise<void> => {
          const where = buildWhereForBatch(batchIds, lookupIdFields);
          const params = new URLSearchParams({
            where,
            outFields: '*',
            returnGeometry: 'false',
            f: 'json',
          });
          const lookupQueryUrl = `${lookup.url}/query?${params.toString()}`;
          let lookupData: { error?: unknown; features?: Array<{ attributes?: Record<string, unknown> }> };
          try {
            lookupData = await fetchEsriJson(lookupQueryUrl, { log: dbg });
          } catch (e) {
            dbg('lookup-service-error', { lookupUrl: lookup.url, error: String(e) });
            return;
          }
          const lookupFeatures: Array<{ attributes?: Record<string, unknown> }> = lookupData.features ?? [];
          for (const lf of lookupFeatures) {
            const attrs = lf.attributes ?? {};
            const parsed = extractParcelFields(
              attrs,
              lookup.parcelIdFields,
              lookup.ownerFields ?? resolvedOwnerFields,
              lookup.deedBookFields,
              lookup.deedPageFields,
              lookup.blockFields,
              lookup.unitFields,
            );
            const normId = normalizeParcelId(parsed.parcelId);
            if (!normId) continue;
            const prev = lookupMap.get(normId);
            lookupMap.set(normId, {
              parcelId: parsed.parcelId,
              owner: parsed.owner ?? prev?.owner ?? null,
              deedBook: parsed.deedBook ?? prev?.deedBook ?? null,
              deedPage: parsed.deedPage ?? prev?.deedPage ?? null,
              block: parsed.block ?? prev?.block ?? null,
              unit: parsed.unit ?? prev?.unit ?? null,
              deedRef: parsed.deedRef ?? prev?.deedRef ?? null,
            });
          }
        };

        // 50 ids per request, four requests in flight — a dense AOI with 1,000
        // parcels resolves in a handful of round-trips instead of twenty.
        const batches: string[][] = [];
        for (let i = 0; i < idsToQuery.length; i += BATCH_SIZE) batches.push(idsToQuery.slice(i, i + BATCH_SIZE));
        const concurrency = Math.min(4, batches.length);
        await Promise.all(Array.from({ length: concurrency }, async (_, workerIndex) => {
          for (let b = workerIndex; b < batches.length; b += concurrency) {
            await fetchBatch(batches[b]);
          }
        }));

        let enrichedCount = 0;
        for (const parcel of parcels) {
          const normId = normalizeParcelId(parcel.parcelId);
          if (!normId) continue;
          const match = lookupMap.get(normId);
          if (!match) continue;
          const beforeOwner = parcel.owner;
          const beforeDeedRef = parcel.deedRef;
          if (!parcel.owner && match.owner) parcel.owner = match.owner;
          if (!parcel.deedBook && match.deedBook) parcel.deedBook = match.deedBook;
          if (!parcel.deedPage && match.deedPage) parcel.deedPage = match.deedPage;
          if (!parcel.block && match.block) parcel.block = match.block;
          if (!parcel.unit && match.unit) parcel.unit = match.unit;
          if (!parcel.deedRef) parcel.deedRef = formatDeedRef(parcel.deedBook, parcel.deedPage, parcel.block, parcel.unit);
          if (parcel.owner !== beforeOwner || parcel.deedRef !== beforeDeedRef) enrichedCount++;
        }

        if (enrichedCount > 0) {
          const parcelIndexByNormId = new Map<string, ParcelFeatureSummary>();
          for (const p of parcels) {
            const normId = normalizeParcelId(p.parcelId);
            if (normId) parcelIndexByNormId.set(normId, p);
          }
          for (const lp of labelPoints) {
            const normId = normalizeParcelId(lp.parcelId);
            if (!normId) continue;
            const merged = parcelIndexByNormId.get(normId);
            if (!merged) continue;
            if (!lp.owner && merged.owner) lp.owner = merged.owner;
            if (!lp.deedRef && merged.deedRef) lp.deedRef = merged.deedRef;
          }
        }

        dbg('lookup-result', {
          lookupUrl: lookup.url,
          auto: lookupEntry.auto,
          requestedIds: idsToQuery.length,
          matchedIds: lookupMap.size,
          enrichedCount,
        });

        if (lookupMap.size > 0) {
          enrichment = {
            source: lookup.url,
            sourceName: lookupEntry.name,
            matched: lookupMap.size,
            enriched: enrichedCount,
            auto: lookupEntry.auto,
          };
          break; // first lookup that matches wins
        }
      } catch (e) {
        dbg('lookup-error', { lookupUrl: lookup.url, error: String(e) });
      }
    }
  }

  dbg('built-lines', { lineCount: newLines.length, parcelCount: parcels.length });

  return {
    lines: newLines,
    featureCount: features.length,
    exceededTransferLimit: result.truncated,
    parcels,
    labelPoints,
    enrichment,
  };
}
