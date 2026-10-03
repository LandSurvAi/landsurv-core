/**
 * Parcel GIS Service — fetches county tax-parcel boundaries from public
 * ArcGIS REST FeatureServer / MapServer endpoints and converts the returned
 * polygon rings into SurveyLine segments that the canvas already knows how
 * to render.  Mirrors the architecture of handleFetchEsriContours in App.tsx
 * (service-info → reproject bbox → query → reproject back), but for polygons
 * rather than polylines and with no elevation lookup.
 *
 * Starting county: Montgomery County, PA (gis.montcopa.org).  More counties
 * can be added by appending to PARCEL_GIS_SERVICES below.
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
  /** Field names (in priority order) that hold the parcel identifier. */
  parcelIdFields: string[];
  /** Field names (in priority order) that hold the owner / taxpayer name. */
  ownerFields: string[];
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
export const PARCEL_GIS_SERVICES: ParcelGisServiceDef[] = [
  {
    id: 'montco-pa',
    label: 'Montgomery County, PA',
    region: 'Pennsylvania',
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
    // Chester County (ChescoMaps / mjlittle_Chesco) Parcels_owners FeatureServer.
    // Verified 2026-05-17 via ArcGIS item 743f6f125f1e41589c0c9841d65a0ade
    // (wkid 102729 = PA State Plane South). UPI is the canonical Uniform Parcel
    // Identification Number; OWN1/OWN2 carry the owner of record.
    url: 'https://services.arcgis.com/G4S1dGvn7PIgYd6Y/arcgis/rest/services/Parcels_owners/FeatureServer/0',
    parcelIdFields: ['UPI', 'PIN_COMMON', 'PIN_MAP', 'PIN_ASMNT', 'PARCELID', 'PARCEL_ID', 'PARID'],
    ownerFields: ['OWN1', 'OWN2', 'OWNER', 'OWNER_NAME', 'TAXPAYER'],
  },
];

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
    const parsed = extractParcelFields(attrs, service.parcelIdFields, service.ownerFields);
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
      const [lx, ly] = ptConvert ? ptConvert([cx, cy]) : [cx, cy];
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

  // Optional 4b: secondary owner/deed enrichment for counties that split
  // geometry and assessment metadata across different layers.
  if (service.attributeLookup && parcels.length > 0) {
    const missing = parcels.filter((p) => p.parcelId && (!p.owner || !p.deedRef));
    if (missing.length > 0) {
      const lookup = service.attributeLookup;
      const uniqueIds = Array.from(new Set(missing.map((p) => p.parcelId as string)));
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

      const lookupMap = new Map<string, Omit<ParcelFeatureSummary, 'attributes'>>();
      const BATCH_SIZE = 50;
      try {
        let lookupIdFields = lookup.parcelIdFields;
        try {
          const lookupInfo = await getServiceInfo(lookup.url, { log: dbg });
          if (lookupInfo.fieldsUpper.length > 0) {
            const existing = new Set(lookupInfo.fieldsUpper);
            const filtered = lookup.parcelIdFields.filter((f) => existing.has(f.toUpperCase()));
            if (filtered.length > 0) {
              lookupIdFields = filtered;
            }
          }
          dbg('lookup-id-fields', { lookupUrl: lookup.url, configured: lookup.parcelIdFields, usable: lookupIdFields });
        } catch (e) {
          dbg('lookup-id-fields-error', { lookupUrl: lookup.url, error: String(e) });
        }

        if (lookupIdFields.length === 0) {
          dbg('lookup-no-id-fields', { lookupUrl: lookup.url });
        }

        for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
          const batchIds = uniqueIds.slice(i, i + BATCH_SIZE);
          if (lookupIdFields.length === 0) break;
          const where = buildWhereForBatch(batchIds, lookupIdFields);
          const params = new URLSearchParams({
            where,
            outFields: '*',
            returnGeometry: 'false',
            f: 'json',
          });
          const lookupUrl = `${lookup.url}/query?${params.toString()}`;
          let lookupData: { error?: unknown; features?: Array<{ attributes?: Record<string, unknown> }> };
          try {
            lookupData = await fetchEsriJson(lookupUrl, { log: dbg });
          } catch (e) {
            dbg('lookup-service-error', { lookupUrl: lookup.url, error: String(e) });
            continue;
          }
          const lookupFeatures: Array<{ attributes?: Record<string, unknown> }> = lookupData.features ?? [];
          for (const lf of lookupFeatures) {
            const attrs = lf.attributes ?? {};
            const parsed = extractParcelFields(
              attrs,
              lookup.parcelIdFields,
              lookup.ownerFields ?? service.ownerFields,
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
        }

        if (lookupMap.size > 0) {
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
            dbg('lookup-enriched', { lookupUrl: lookup.url, requestedIds: uniqueIds.length, matchedIds: lookupMap.size, enrichedCount });
          }
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
  };
}
