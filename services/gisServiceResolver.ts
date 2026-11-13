/**
 * gisServiceResolver — "never stop at zero features".
 *
 * The app ships curated parcel/contour sources, but a county can rename,
 * retire, or never register its ArcGIS endpoint. This resolver fills those
 * gaps at runtime:
 *
 *   1. Built-in sources — PASDA/PAMAP for Pennsylvania contours, curated
 *      parcel fabrics, and the state ESRI registry for other states.
 *   2. ArcGIS Online discovery — parcel/contour/flood/soils services whose
 *      item extent actually reaches the AOI.
 *   3. LandSurv Scout — the Playwright GIS portal browser (e.g. PASDA county
 *      pages, county GIS hubs, search results) extracts live REST links.
 *   4. Verification — every candidate's metadata is checked for the right
 *      geometry type, then a `returnCountOnly` query confirms it has features
 *      inside the project footprint.
 *
 * Successful resolutions are cached in localStorage so the next retry is
 * instant, while a failed search can be forced to run again.
 */

import type { ParcelGisServiceDef } from './parcelGisService.ts';
import {
  normalizeParcelServiceUrl,
  planParcelServiceAttempts,
} from './parcelGisService.ts';
import { fetchEsriJson, getServiceInfo, reprojectBbox } from './esriRestClient.ts';
import { ESRI_STATE_SERVICES } from '../utils/esriStateServices.ts';
import { USGS_CONTOUR_WFS_SERVICE_URL } from '../utils/usgsNationalContours.ts';
import {
  candidateGroundingDecision,
  clearScoutGroundingCache,
  resolveScoutJurisdiction,
  SCOUT_GROUNDING_VERSION,
  type ScoutGroundingDecision,
} from '../utils/scoutGrounding.ts';
import type {
  ScoutCandidateAudit,
  ScoutJurisdictionResolution,
  ScoutRejectReason,
} from '../types.ts';

export type GisLayerKind = 'contours' | 'parcels' | 'flood' | 'soils' | 'custom';

export type GisSourceProvider = 'pasda' | 'federal' | 'state' | 'county' | 'agol' | 'scout' | 'custom';

export interface GisBbox {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

export interface GisResolvedSource {
  id: string;
  label: string;
  url: string;
  kind: GisLayerKind;
  provider: GisSourceProvider;
  geometryType?: string;
  featureCount?: number;
  wkid?: number;
  verified: boolean;
  portal?: string;
  notes?: string;
  /** Jurisdiction when the candidate declares one (curated/state layers). */
  state?: string;
  county?: string;
  /** Service extent in WGS84, used for the neighbor-clip rule. */
  extent?: [number, number, number, number];
}

export interface GisResolutionAttempt {
  label: string;
  url?: string;
  provider: GisSourceProvider | 'builtin';
  ok: boolean;
  message: string;
  featureCount?: number;
  decision?: ScoutCandidateAudit['decision'];
  reason?: ScoutRejectReason;
}

export interface GisResolution {
  kind: GisLayerKind;
  bboxWgs84: [number, number, number, number];
  sources: GisResolvedSource[];
  attempts: GisResolutionAttempt[];
  /** True when the AOI is in Pennsylvania, where PASDA is the primary portal. */
  pasdaAvailable: boolean;
  /** True when the result came from the on-device cache. */
  cached: boolean;
  resolvedAt: number;
  warnings: string[];
  /** The jurisdiction Scout grounded this run to. */
  jurisdiction?: ScoutJurisdictionResolution;
  /** Accepted and rejected candidates, preserved for the audit panel. */
  candidates?: ScoutCandidateAudit[];
  /** Present when the AOI touches multiple states and the caller requires a choice. */
  needsJurisdiction?: {
    options: Array<{ state: string; county?: string; label: string; reason: string }>;
  };
  groundingVersion?: number;
}

export interface GisActivityEvent {
  id?: number | string;
  at?: number;
  phase?: string;
  message: string;
  url?: string;
  level?: 'info' | 'success' | 'warn' | 'error';
  kind?: 'start' | 'jurisdiction' | 'agol' | 'portal' | 'probe' | 'verified' | 'rejected' | 'cache' | 'error' | 'done';
  candidateId?: string;
  reason?: ScoutRejectReason;
}

export interface ResolveGisOptions {
  kind: GisLayerKind;
  bboxWgs84: [number, number, number, number];
  state?: string;
  county?: string;
  /**
   * Free-form topic for `custom` requests, e.g. "school district lines",
   * "voting districts", "streams", "water bodies", or "state plane zones".
   * Passed to ArcGIS Online and Scout instead of relying on a fixed kind list.
   */
  query?: string;
  /** Extra portals the Scout browser should inspect (e.g. a state GIS hub). */
  portals?: string[];
  /** Set false to skip the Playwright Scout hop (tests / offline). */
  includeScout?: boolean;
  /** Max candidates to verify (default 10). */
  limit?: number;
  /** Ignore the cache and probe everything again. */
  force?: boolean;
  /** Explicit jurisdiction chosen by the user in Quick Thought. */
  jurisdiction?: { state: string; county?: string };
  /** Project identity used for the grounding cache. */
  projectKey?: string;
  /** Return needs_jurisdiction instead of crawling when the AOI is ambiguous. */
  requireJurisdiction?: boolean;
  /** Live activity stream for the A2UI Scout surface. */
  onActivity?: (event: GisActivityEvent) => void;
  /** Abort Scout discovery without throwing away already-running verification. */
  signal?: AbortSignal;
  log?: (msg: string, payload?: unknown) => void;
}

function emitActivity(
  opts: ResolveGisOptions,
  phase: string,
  message: string,
  extra: { url?: string; level?: GisActivityEvent['level'] } = {},
): void {
  try {
    opts.onActivity?.({ at: Date.now(), phase, message, ...extra });
  } catch {
    /* activity rendering must never interrupt discovery */
  }
}

// ─── PASDA / statewide sources ───────────────────────────────────────────────

export const PASDA_PORTAL_URL = 'https://www.pasda.psu.edu/';

/** Stable national fallback for State Plane / SPC zone requests. */
export const STATE_PLANE_ZONES_SOURCE = {
  id: 'esri-state-plane-zones-nad83',
  label: 'USA State Plane Zones (NAD 1983)',
  url: 'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_State_Plane_Zones_NAD83/FeatureServer/0',
  portal: 'https://www.arcgis.com/',
} as const;

function isStatePlaneTopic(query?: string): boolean {
  return /\b(?:spc|state\s*plane|state plane coordinate|coordinate (?:system|zone))\b/i.test(query ?? '');
}

/** Stable national fallback for watershed / basin requests (USGS WBD HUC10). */
export const WATERSHED_BOUNDARIES_SOURCE = {
  id: 'usgs-wbd-huc10',
  label: 'USGS Watershed Boundary Dataset (HUC10)',
  url: 'https://hydro.nationalmap.gov/arcgis/rest/services/wbd/MapServer/5',
  portal: 'https://hydro.nationalmap.gov/',
} as const;

function isWatershedTopic(query?: string): boolean {
  return /\b(?:watersheds?|subwatersheds?|basins?|subbasins?|huc\s*(?:8|10|12)?|drainage divide)\b/i.test(query ?? '');
}

/**
 * Complete PAMAP 2 ft contour mosaics. The combined `PAMAP_Contours` service's
 * north layer is only a small block, so it silently misses most of northern
 * Pennsylvania (e.g. Wayne County). These dedicated mosaics cover the state.
 */
export const PASDA_CONTOUR_SOURCES: Array<{
  id: string;
  label: string;
  url: string;
  notes: string;
}> = [
  {
    id: 'pasda-contours-north',
    label: 'PASDA PAMAP 2ft Contours (North PA)',
    url: 'https://services.pasda.psu.edu/arcgis/rest/services/PAMAP_Contour_Mosaic_North/MapServer/0',
    notes: 'LiDAR-derived 2-foot contours — complete northern Pennsylvania mosaic.',
  },
  {
    id: 'pasda-contours-south',
    label: 'PASDA PAMAP 2ft Contours (South PA)',
    url: 'https://services.pasda.psu.edu/arcgis/rest/services/PAMAP_Contour_Mosaic_South/MapServer/0',
    notes: 'LiDAR-derived 2-foot contours — complete southern Pennsylvania mosaic.',
  },
];

const PA_BOUNDS = { west: -80.7, south: 39.5, east: -74.5, north: 42.4 };

export function isLikelyPennsylvania(bbox: [number, number, number, number]): boolean {
  const [xmin, ymin, xmax, ymax] = bbox;
  const cx = (xmin + xmax) / 2;
  const cy = (ymin + ymax) / 2;
  return (
    cx >= PA_BOUNDS.west && cx <= PA_BOUNDS.east &&
    cy >= PA_BOUNDS.south && cy <= PA_BOUNDS.north
  );
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

export function normalizeStateAbbr(state?: string): string | null {
  const raw = String(state ?? '').trim();
  if (!raw) return null;
  if (raw.length === 2) return raw.toUpperCase();
  return US_STATE_ABBR[raw.toLowerCase()] ?? null;
}

function stateEntryFor(state?: string) {
  const abbr = normalizeStateAbbr(state);
  if (!abbr) return undefined;
  return ESRI_STATE_SERVICES.find(entry => entry.abbr === abbr);
}

function buildBuiltInCandidates(
  kind: GisLayerKind,
  bbox: [number, number, number, number],
  state?: string,
  county?: string,
  query?: string,
): GisResolvedSource[] {
  const out: GisResolvedSource[] = [];
  const abbr = normalizeStateAbbr(state) ?? (isLikelyPennsylvania(bbox) ? 'PA' : null);
  const stateEntry = stateEntryFor(abbr ?? undefined);
  const pa = abbr === 'PA' || (!abbr && isLikelyPennsylvania(bbox));

  if (kind === 'parcels') {
    // Curated county + statewide fabric. In PA the registry usually has no
    // statewide layer, so this is where the county entry (if any) comes from.
    for (const match of planParcelServiceAttempts({ state: abbr ?? undefined, county })) {
      out.push(parcelDefToSource(match.service));
    }
  }

  if (kind === 'custom' && isStatePlaneTopic(query)) {
    out.push({
      id: STATE_PLANE_ZONES_SOURCE.id,
      label: STATE_PLANE_ZONES_SOURCE.label,
      url: STATE_PLANE_ZONES_SOURCE.url,
      kind,
      provider: 'federal',
      verified: false,
      portal: STATE_PLANE_ZONES_SOURCE.portal,
      notes: 'Esri national State Plane Coordinate System zone polygons (NAD 1983).',
    });
  }

  if (kind === 'custom' && isWatershedTopic(query)) {
    out.push({
      id: WATERSHED_BOUNDARIES_SOURCE.id,
      label: WATERSHED_BOUNDARIES_SOURCE.label,
      url: WATERSHED_BOUNDARIES_SOURCE.url,
      kind,
      provider: 'federal',
      verified: false,
      portal: WATERSHED_BOUNDARIES_SOURCE.portal,
      notes: 'USGS Watershed Boundary Dataset — 10-digit hydrologic unit watersheds.',
    });
  }

  if (kind === 'contours') {
    if (pa) {
      // South/north ordering by AOI latitude; both remain candidates so a
      // footprint near the mosaic seam still resolves.
      const centerLat = (bbox[1] + bbox[3]) / 2;
      const ordered = centerLat >= 40.9
        ? [PASDA_CONTOUR_SOURCES[0], PASDA_CONTOUR_SOURCES[1]]
        : [PASDA_CONTOUR_SOURCES[1], PASDA_CONTOUR_SOURCES[0]];
      for (const source of ordered) {
        out.push({
          id: source.id,
          label: source.label,
          url: source.url,
          kind,
          provider: 'pasda',
          verified: false,
          portal: PASDA_PORTAL_URL,
          notes: source.notes,
        });
      }
    }

    // USGS's separate large-scale FeatureServer. The National Map MapServer
    // can return an empty footprint even when the 3DEP data exists; this
    // endpoint carries the same contourelevation/contourunits schema and is
    // queryable by AOI nationwide.
    out.push({
      id: 'usgs-contours-large-scale',
      label: 'USGS 3DEP Large-Scale Contours',
      url: USGS_CONTOUR_WFS_SERVICE_URL,
      kind,
      provider: 'federal',
      verified: false,
      portal: 'https://apps.nationalmap.gov/',
      notes: 'USGS National Map large-scale contours — variable interval.',
    });

    // State-level layers from the ESRI registry (PA's duplicate PASDA URLs are
    // deduped by URL later).
    for (const layer of stateEntry?.layers ?? []) {
      out.push({
        id: `state-${stateEntry!.abbr}-${out.length}`,
        label: layer.name,
        url: layer.url,
        kind,
        provider: stateEntry!.abbr === 'PA' ? 'pasda' : 'state',
        verified: false,
        portal: stateEntry!.portalUrl,
        state: stateEntry!.abbr,
        notes: layer.notes ?? layer.attribution,
      });
    }
  }

  return out;
}

function parcelDefToSource(def: ParcelGisServiceDef): GisResolvedSource {
  return {
    id: def.id,
    label: def.label,
    url: def.url,
    kind: 'parcels',
    provider: def.scope === 'statewide' ? 'state' : 'county',
    verified: false,
    portal: def.state === 'PA' ? PASDA_PORTAL_URL : undefined,
    notes: def.region,
    state: def.state,
  };
}

// ─── ArcGIS Online discovery ─────────────────────────────────────────────────

interface AgolItem {
  id?: string;
  title?: string;
  owner?: string;
  url?: string;
  type?: string;
  extent?: [[number, number], [number, number]];
}

const AGOL_SEARCH_URL = 'https://www.arcgis.com/sharing/rest/search';

function agolQueries(kind: GisLayerKind, county?: string, stateName?: string, query?: string): string[] {
  const queries: string[] = [];
  const countyKey = String(county ?? '')
    .replace(/\bcounty\b/gi, '')
    .replace(/["\\]/g, '')
    .trim();
  const statePhrase = stateName
    ? `"${stateName.replace(/["\\]/g, '')}"`
    : '';
  const locality = countyKey
    ? `"${countyKey} County"${statePhrase ? ` AND ${statePhrase}` : ''}`
    : statePhrase;
  const topic = String(query ?? '').trim().replace(/["\\]/g, ' ').replace(/\s+/g, ' ');

  // A free-form topic is the search intent. Do not append the old kind
  // vocabulary (parcel/contour/flood), which would drown out county lines,
  // school districts, voting precincts, streams, or water bodies. Add only
  // generic wording variants: ArcGIS titles say "boundary" far more often
  // than "lines", "precincts" more often than "voting districts", and
  // "hydrography" more often than "water bodies".
  if (topic) {
    const variants = new Set<string>();
    const base = topic
      .replace(/\b(?:lines?|boundar(?:y|ies)|areas?|zones?)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const lineIntent = /\b(?:lines?|boundar(?:y|ies))\b/i.test(topic);
    if (base && lineIntent) {
      // Searching the literal phrase "county lines" surfaces county parcels
      // and trails. ArcGIS titles use "county boundary".
      variants.add(`${base} boundary`);
    }
    if (base && /\bareas?\b/i.test(topic)) {
      variants.add(`${base} zones`);
    }
    if (!lineIntent && base) variants.add(topic);
    if (/\bstreams?\b|\bwater\s*bod(?:y|ies)\b|\brivers?\b/i.test(topic)) {
      variants.add('hydrography');
    }
    if (/\bwatersheds?\b|\bbasins?\b|\bhuc\s*\d*\b/i.test(topic)) {
      variants.add('watershed boundary');
      variants.add('WBD HUC10');
    }
    if (/\bvoting\b/i.test(topic)) {
      variants.add(topic.replace(/\bvoting\b/gi, 'election').replace(/\bdistricts?\b/gi, 'precincts'));
    }
    if (variants.size === 0) variants.add(topic);
    for (const searchTopic of [...variants].slice(0, 4)) {
      if (locality) {
        queries.push(`${locality} AND (${searchTopic}) AND type:"Feature Service"`);
        queries.push(`${locality} AND (${searchTopic})`);
      }
      queries.push(`(${searchTopic}) AND type:"Feature Service"`);
    }
    return queries;
  }

  // A bare national title search returns thousands of far-away parcel
  // services before the local one. Ask for the jurisdiction explicitly first;
  // the bbox and item-extent checks still verify coverage.
  if (locality) {
    switch (kind) {
      case 'parcels':
        queries.push(`${locality} AND (parcel OR parcels OR cadastral) AND type:"Feature Service"`);
        break;
      case 'contours':
        queries.push(`${locality} AND (contour OR contours OR elevation)`);
        break;
      case 'flood':
        queries.push(`${locality} AND (flood OR NFHL OR "flood hazard")`);
        break;
      case 'soils':
        queries.push(`${locality} AND (soils OR SSURGO OR "soil survey")`);
        break;
      default:
        queries.push(`${locality} AND (parcel OR contour OR flood OR soil)`);
    }
  }

  switch (kind) {
    case 'parcels':
      queries.push(
        '(title:parcels OR title:parcel OR title:cadastral OR title:"tax parcels") type:"Feature Service"',
        '(title:"property parcels" OR title:"tax map") type:"Feature Service"',
      );
      break;
    case 'contours':
      queries.push(
        '(title:contours OR title:contour OR title:elevation)',
        '(title:"contour lines" OR title:"topographic contours")',
      );
      break;
    case 'flood':
      queries.push('(title:flood OR title:NFHL OR title:"flood hazard")');
      break;
    case 'soils':
      queries.push('(title:soils OR title:SSURGO OR title:"soil survey")');
      break;
    default:
      queries.push('(title:parcels OR title:contours OR title:cadastral)');
  }
  return queries;
}

async function discoverAgolCandidates(
  kind: GisLayerKind,
  bbox: [number, number, number, number],
  county?: string,
  state?: string,
  limit = 20,
  query?: string,
): Promise<GisResolvedSource[]> {
  const [xmin, ymin, xmax, ymax] = bbox;
  const queries = agolQueries(kind, county, stateEntryFor(state)?.state, query);
  const results = await Promise.allSettled(queries.map(async (q) => {
    const params = new URLSearchParams({
      q,
      bbox: `${xmin},${ymin},${xmax},${ymax}`,
      f: 'json',
      num: String(limit),
    });
    return fetchEsriJson<{ results?: AgolItem[] }>(`${AGOL_SEARCH_URL}?${params.toString()}`, {
      timeoutMs: 12_000,
      retries: 1,
    });
  }));

  const countyKey = String(county ?? '').replace(/\bcounty\b/gi, '').trim().toLowerCase();
  const seen = new Set<string>();
  const out: GisResolvedSource[] = [];
  const pad = 0.001;

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const item of result.value.results ?? []) {
      const url = normalizeParcelServiceUrl(item.url ?? '');
      if (!url || !/\/(?:FeatureServer|MapServer)(?:\/\d+)?$/i.test(url)) continue;
      if (!item.url || !/arcgis|FeatureServer|MapServer/i.test(item.url)) continue;
      if (seen.has(url.toLowerCase())) continue;

      const extent: [number, number, number, number] | undefined = item.extent?.[0] && item.extent?.[1]
        ? [item.extent[0][0], item.extent[0][1], item.extent[1][0], item.extent[1][1]]
        : undefined;

      if (extent) {
        const [ixmin, iymin, ixmax, iymax] = extent;
        const outside =
          ixmax < xmin - pad || ixmin > xmax + pad ||
          iymax < ymin - pad || iymin > ymax + pad;
        if (outside) continue;
        // National / continental services match every AOI but carry no local
        // identifiers and often return empty geometry at parcel scale.
        if (Math.abs(ixmax - ixmin) > 20 || Math.abs(iymax - iymin) > 15) continue;
      }

      const title = String(item.title ?? '').trim() || 'ArcGIS service';
      seen.add(url.toLowerCase());
      out.push({
        id: `agol-${item.id ?? url}`,
        label: title,
        url,
        kind,
        provider: 'agol',
        verified: false,
        portal: 'https://www.arcgis.com/',
        extent,
        notes: [item.owner, countyKey && title.toLowerCase().includes(countyKey) ? 'county-name match' : '']
          .filter(Boolean).join(' · ') || undefined,
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

// ─── Playwright Scout ────────────────────────────────────────────────────────

const SCOUT_BASE = '/api/scout/v2';

function scoutSessionId(): string {
  try {
    return `s${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
  } catch {
    return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

interface ScoutCandidate {
  url?: string;
  label?: string;
  geometryType?: string;
  provider?: string;
  portal?: string;
  notes?: string;
  state?: string;
  county?: string;
  extent?: [number, number, number, number];
}

function allowedProvider(value: unknown): GisSourceProvider {
  return value === 'pasda' || value === 'federal' || value === 'state' || value === 'county' || value === 'agol' || value === 'scout'
    ? value
    : 'scout';
}

async function discoverWithScout(
  opts: ResolveGisOptions,
  portals: string[],
): Promise<{ candidates: GisResolvedSource[]; warning?: string }> {
  const session = scoutSessionId();
  let cursor = 0;
  let polling = true;

  const emit = (event: GisActivityEvent): void => {
    try {
      opts.onActivity?.(event);
    } catch {
      /* activity rendering must never interrupt discovery */
    }
  };

  const pollActivity = async (force = false): Promise<void> => {
    if (!polling && !force) return;
    try {
      const resp = await fetch(
        `${SCOUT_BASE}/activity?session=${encodeURIComponent(session)}&since=${cursor}`,
        { signal: opts.signal },
      );
      if (!resp.ok) return;
      const body = await resp.json() as { events?: GisActivityEvent[] };
      for (const event of body.events ?? []) {
        const id = Number(event.id);
        if (Number.isFinite(id)) cursor = Math.max(cursor, id);
        emit({
          ...event,
          at: event.at ?? Date.now(),
          phase: event.phase ?? 'scout',
          message: event.message ?? '',
        });
      }
    } catch {
      /* activity is best-effort; the resolved candidates are the result */
    }
  };

  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedulePoll = (): void => {
    timer = setTimeout(() => {
      void pollActivity().finally(() => {
        if (polling) schedulePoll();
      });
    }, 500);
  };
  void pollActivity();
  schedulePoll();
  try {
    const resp = await fetch(`${SCOUT_BASE}/tools/resolve_gis_service`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-scout-session': session,
      },
      signal: opts.signal,
      body: JSON.stringify({
        kind: opts.kind,
        query: opts.query ?? '',
        bbox_wgs84: opts.bboxWgs84,
        state: normalizeStateAbbr(opts.state) ?? opts.state ?? '',
        county: opts.county ?? '',
        portals,
      }),
    });
    if (!resp.ok) {
      const warning = `Scout unavailable (HTTP ${resp.status})`;
      emit({ at: Date.now(), phase: 'error', message: warning, level: 'warn' });
      return { candidates: [], warning };
    }
    const body = await resp.json() as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const text = body.content?.find(part => part.type === 'text')?.text ?? '';
    if (!text || text.startsWith('ERROR:')) {
      const warning = text.slice(0, 240) || 'Scout returned no result';
      emit({ at: Date.now(), phase: 'error', message: warning, level: 'warn' });
      return { candidates: [], warning };
    }
    const parsed = JSON.parse(text) as { candidates?: ScoutCandidate[] };
    const candidates = (parsed.candidates ?? [])
      .filter(c => typeof c.url === 'string' && /^https?:\/\//i.test(c.url))
      .slice(0, 14)
      .map((c, index): GisResolvedSource => ({
        id: `scout-${index}-${c.url}`,
        label: String(c.label ?? 'Discovered GIS service').slice(0, 160),
        url: normalizeParcelServiceUrl(String(c.url)),
        kind: opts.kind,
        provider: allowedProvider(c.provider),
        geometryType: c.geometryType,
        verified: false,
        portal: c.portal,
        notes: c.notes,
        state: c.state,
        county: c.county,
        extent: c.extent,
      }));
    return { candidates };
  } catch (error) {
    const warning = `Scout unavailable (${error instanceof Error ? error.message : String(error)})`;
    emit({ at: Date.now(), phase: 'error', message: warning, level: 'warn' });
    return { candidates: [], warning };
  } finally {
    polling = false;
    if (timer) clearTimeout(timer);
    if (!opts.signal?.aborted) await pollActivity(true);
  }
}

// ─── Verification ────────────────────────────────────────────────────────────

function queryGeometryPattern(query?: string): RegExp | null {
  const q = String(query ?? '');
  const hydroLine = /\b(?:streams?|rivers?|creeks?|flowlines?|watercourses?)\b/i.test(q);
  const waterArea = /\b(?:water\s*bod(?:y|ies)|lakes?|ponds?|reservoirs?|watersheds?|subwatersheds?|basins?|subbasins?|huc\s*(?:8|10|12)?)\b/i.test(q);
  if (hydroLine && !waterArea) return /polyline|line/i;
  if (waterArea) return /polygon/i;
  return null;
}

function kindGeometryPattern(kind: GisLayerKind, query?: string): RegExp {
  if (kind === 'custom') {
    const topicPattern = queryGeometryPattern(query);
    if (topicPattern) return topicPattern;
  }
  if (kind === 'contours') return /polyline|line/i;
  if (kind === 'parcels' || kind === 'flood' || kind === 'soils') return /polygon/i;
  return /polyline|polygon|line/i;
}

function kindNamePattern(kind: GisLayerKind, query?: string): RegExp {
  if (kind === 'custom' && query?.trim()) {
    // Use the user's own topic words so any public layer type works without a
    // central registry: school district, voting precinct, stream, water body,
    // oil/gas unit, historic district, etc.
    const stop = new Set(['show', 'draw', 'display', 'map', 'maps', 'layer', 'layers', 'lines', 'line', 'the', 'and', 'for', 'with']);
    const words = (query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])
      .filter(word => !stop.has(word))
      .slice(0, 5);
    if (words.length > 0) {
      const escaped = words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      return new RegExp(escaped.join('|'), 'i');
    }
  }
  if (kind === 'contours') return /contour|elevation|topo/i;
  if (kind === 'parcels') return /parcel|tax|cadastr|property/i;
  if (kind === 'flood') return /flood|nfhl|fema/i;
  if (kind === 'soils') return /soil|ssurgo/i;
  return /parcel|contour|feature/i;
}

interface LayerEndpoint {
  url: string;
  info: Awaited<ReturnType<typeof getServiceInfo>>;
}

/** Resolve a layer URL, picking the matching layer when given a service root. */
async function resolveLayerEndpoint(
  rawUrl: string,
  kind: GisLayerKind,
  log?: (msg: string, payload?: unknown) => void,
  query?: string,
): Promise<LayerEndpoint | null> {
  const url = normalizeParcelServiceUrl(rawUrl);
  if (!/^https?:\/\//i.test(url)) return null;
  const info = await getServiceInfo(url, { timeoutMs: 8_000, retries: 0, log });
  if (info.geometryType && kindGeometryPattern(kind, query).test(info.geometryType)) {
    return { url, info };
  }
  if (!info.layers?.length) return null;

  const nameRe = kindNamePattern(kind, query);
  const ordered = [...info.layers]
    .sort((a, b) => Number(nameRe.test(b.name)) - Number(nameRe.test(a.name)))
    .slice(0, 8);
  const probed = await Promise.all(ordered.map(async (layer) => {
    const layerUrl = `${url}/${layer.id}`;
    const layerInfo = await getServiceInfo(layerUrl, { timeoutMs: 8_000, retries: 0, log });
    return { url: layerUrl, info: layerInfo, named: nameRe.test(layer.name) };
  }));
  const matches = probed.filter(candidate =>
    candidate.info.geometryType && kindGeometryPattern(kind, query).test(candidate.info.geometryType),
  );
  matches.sort((a, b) =>
    Number(b.named) - Number(a.named) ||
    (b.info.fieldsUpper.length - a.info.fieldsUpper.length),
  );
  return matches[0] ?? null;
}

async function countFeaturesInBbox(
  endpoint: LayerEndpoint,
  bbox: [number, number, number, number],
  log?: (msg: string, payload?: unknown) => void,
): Promise<number | null> {
  const nativeWkid = endpoint.info.nativeWkid ?? 4326;
  let queryBbox = bbox;
  let inSR = 4326;
  if (nativeWkid !== 4326) {
    const reprojected = await reprojectBbox(bbox, 4326, nativeWkid);
    if (reprojected) {
      queryBbox = reprojected;
      inSR = nativeWkid;
    }
  }
  const params = new URLSearchParams({
    where: '1=1',
    geometry: queryBbox.join(','),
    geometryType: 'esriGeometryEnvelope',
    inSR: String(inSR),
    spatialRel: 'esriSpatialRelIntersects',
    returnCountOnly: 'true',
    f: 'json',
  });
  try {
    const data = await fetchEsriJson<{ count?: number }>(`${endpoint.url}/query?${params.toString()}`, {
      timeoutMs: 8_000,
      retries: 0,
      log,
    });
    if (typeof data.count === 'number') return data.count;
  } catch (error) {
    log?.('[GisResolver] count failed — trying ids', { url: endpoint.url, error: String(error) });
  }

  // Older ArcGIS Server builds occasionally reject returnCountOnly. Asking for
  // object ids still gives a cheap non-zero answer.
  try {
    const idParams = new URLSearchParams(params);
    idParams.delete('returnCountOnly');
    idParams.set('returnIdsOnly', 'true');
    const data = await fetchEsriJson<{ objectIds?: number[] | null }>(
      `${endpoint.url}/query?${idParams.toString()}`,
      { timeoutMs: 8_000, retries: 0, log },
    );
    return Array.isArray(data.objectIds) ? data.objectIds.length : 0;
  } catch {
    return null;
  }
}

async function verifyCandidate(
  candidate: GisResolvedSource,
  bbox: [number, number, number, number],
  log?: (msg: string, payload?: unknown) => void,
  query?: string,
): Promise<{ source: GisResolvedSource; attempt: GisResolutionAttempt }> {
  // AGOL/Scout can return any polyline or polygon that happens to overlap the
  // AOI (roads for contours, warrants for parcels). Curated sources are exempt
  // because their URLs are already chosen by hand.
  const discovered = candidate.provider === 'agol' || candidate.provider === 'scout';
  const hasExplicitTopic = candidate.kind === 'custom' && !!query?.trim();
  if (discovered && !hasExplicitTopic && !kindNamePattern(candidate.kind, query).test(`${candidate.label} ${candidate.url}`)) {
    return {
      source: candidate,
      attempt: {
        label: candidate.label,
        url: candidate.url,
        provider: candidate.provider,
        ok: false,
        message: 'Service name does not match the requested layer type.',
      },
    };
  }

  const endpoint = await resolveLayerEndpoint(candidate.url, candidate.kind, log, query);
  if (!endpoint) {
    return {
      source: candidate,
      attempt: {
        label: candidate.label,
        url: candidate.url,
        provider: candidate.provider,
        ok: false,
        message: 'Not a usable ArcGIS layer for this geometry type.',
      },
    };
  }
  const featureCount = await countFeaturesInBbox(endpoint, bbox, log);
  const verified = typeof featureCount === 'number' && featureCount > 0;
  const source: GisResolvedSource = {
    ...candidate,
    url: endpoint.url,
    geometryType: endpoint.info.geometryType,
    wkid: endpoint.info.nativeWkid,
    featureCount: featureCount ?? undefined,
    verified,
  };
  const message = verified
    ? `${featureCount!.toLocaleString()} feature(s) inside the project footprint.`
    : featureCount === 0
      ? 'Service responded but returned 0 features inside this footprint.'
      : 'Service responded, but the feature count could not be verified.';
  return {
    source,
    attempt: {
      label: candidate.label,
      url: endpoint.url,
      provider: candidate.provider,
      ok: verified,
      message,
      featureCount: featureCount ?? undefined,
    },
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

// ─── Ranking + cache ─────────────────────────────────────────────────────────

function scoreSource(source: GisResolvedSource, county?: string, query?: string): number {
  const label = source.label.toLowerCase();
  const countyKey = String(county ?? '').replace(/\bcounty\b/gi, '').trim().toLowerCase();
  let score = 0;
  if (source.verified) score += 100;
  if (typeof source.featureCount === 'number' && source.featureCount > 0) {
    score += Math.min(30, Math.log10(source.featureCount + 1) * 10);
  }
  if (countyKey && label.includes(countyKey)) score += 24;
  if (/county/.test(label)) score += 8;
  if (source.provider === 'pasda') score += 18;
  if (source.provider === 'county') score += 12;
  if (source.provider === 'federal') score += 6;
  if (source.provider === 'state') score += 8;
  if (source.provider === 'agol') score += 2;
  if (source.provider === 'scout') score -= 2;
  if (source.kind === 'contours' && /2\s*ft|2-foot|liDAR/i.test(label)) score += 6;
  const queryText = String(query ?? '').toLowerCase();
  const stop = new Set(['show', 'draw', 'display', 'lines', 'line', 'layer', 'layers', 'areas', 'area', 'data', 'public', 'map', 'maps']);
  const topicWords = (queryText.match(/[a-z0-9]{4,}/g) ?? []).filter(word => !stop.has(word));
  for (const word of new Set(topicWords)) {
    if (label.includes(word)) score += 4;
  }
  // "County lines" should outrank county parcels and trails; "water bodies"
  // should prefer hydrography over generic land-use polygons.
  const boundaryIntent = /\b(?:lines?|boundar(?:y|ies))\b/i.test(queryText);
  if (boundaryIntent && /boundar/i.test(label)) score += 24;
  if (boundaryIntent && /parcel|trail|land\s*use|zoning|election.*result/i.test(label)) score -= 20;
  const hydroIntent = /(?:stream|water|creek|river|hydro)/i.test(queryText);
  if (hydroIntent && /(?:stream|water|creek|river|hydro)/i.test(label)) score += 30;
  if (hydroIntent && /land\s*use|parcel|trail|zoning/i.test(label)) score -= 25;
  const votingIntent = /\b(?:voting|election|precinct)/i.test(queryText);
  if (votingIntent && /precinct|voting|election district/i.test(label)) score += 24;
  if (votingIntent && /result/i.test(label)) score -= 20;
  const watershedIntent = /\b(?:watershed|basin|subbasin|huc\s*(?:8|10|12))/i.test(queryText);
  if (watershedIntent && /watershed|huc|basin|wbd/i.test(label)) score += 30;
  if (watershedIntent && /parcel|trail|land\s*use|zoning|election.*result/i.test(label)) score -= 25;
  return score;
}

const CACHE_KEY = 'landsurv.gisResolver.v4';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CacheEntry {
  at: number;
  resolution: GisResolution;
}

type CacheMap = Record<string, CacheEntry>;

function readCache(): CacheMap {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as CacheMap : {};
  } catch {
    return {};
  }
}

function writeCache(map: CacheMap): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CACHE_KEY, JSON.stringify(map));
    }
  } catch { /* quota / private mode — resolution still works */ }
}

export function clearGisResolutionCache(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(CACHE_KEY);
      // Drop the pre-fallback caches too: they may contain layers that only
      // passed the old geometry check (watershed rings for streams, roads as
      // contours, warrants as parcels).
      localStorage.removeItem('landsurv.gisResolver.v3');
      localStorage.removeItem('landsurv.gisResolver.v2');
      localStorage.removeItem('landsurv.gisResolver.v1');
    }
  } catch { /* ignore */ }
  clearScoutGroundingCache();
}

function cacheKey(opts: ResolveGisOptions): string {
  const [xmin, ymin, xmax, ymax] = opts.bboxWgs84;
  const cx = ((xmin + xmax) / 2).toFixed(3);
  const cy = ((ymin + ymax) / 2).toFixed(3);
  const abbr = normalizeStateAbbr(opts.state) ?? '';
  const county = String(opts.county ?? '').replace(/[^a-z]/gi, '').toLowerCase();
  const query = String(opts.query ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return `v${SCOUT_GROUNDING_VERSION}|${opts.kind}|${query}|${abbr}|${county}|${cx},${cy}`;
}

/** Turn a resolved source + grounding decision into an audit record. */
function toCandidateAudit(
  source: GisResolvedSource,
  decision: ScoutGroundingDecision,
): ScoutCandidateAudit {
  return {
    id: source.id,
    label: source.label,
    url: source.url,
    provider: source.provider,
    kind: source.kind,
    jurisdiction: { state: source.state, county: source.county },
    extent: source.extent,
    geometryType: source.geometryType,
    featureCount: source.featureCount,
    verified: source.verified,
    decision: decision.decision,
    reason: decision.reason,
    message: decision.message,
  };
}

// ─── Main entry point ────────────────────────────────────────────────────────

export async function resolveGisServices(opts: ResolveGisOptions): Promise<GisResolution> {
  const log = opts.log ?? (() => {});
  const warnings: string[] = [];
  const bbox = opts.bboxWgs84;
  if (!bbox.every(Number.isFinite)) {
    throw new Error('A valid WGS84 bounding box is required to resolve a GIS service.');
  }

  const grounding = await resolveScoutJurisdiction(bbox, {
    state: opts.state,
    county: opts.county,
    explicit: opts.jurisdiction,
    projectKey: opts.projectKey,
    signal: opts.signal,
  });
  const abbr = grounding.resolution.stateAbbr
    ?? normalizeStateAbbr(grounding.resolution.state)
    ?? (isLikelyPennsylvania(bbox) ? 'PA' : undefined);
  const county = (grounding.resolution.county ?? opts.county?.trim()) || undefined;
  const pasdaAvailable = abbr === 'PA';

  if (grounding.ambiguous && opts.requireJurisdiction && !opts.jurisdiction) {
    emitActivity(
      opts,
      'jurisdiction',
      'This footprint touches more than one state — pick a jurisdiction before searching.',
      { level: 'warn' },
    );
    return {
      kind: opts.kind,
      bboxWgs84: bbox,
      sources: [],
      attempts: [],
      pasdaAvailable,
      cached: false,
      resolvedAt: Date.now(),
      warnings: ['Scout needs a jurisdiction before it can search this footprint.'],
      jurisdiction: grounding.resolution,
      candidates: [],
      needsJurisdiction: { options: grounding.options },
      groundingVersion: SCOUT_GROUNDING_VERSION,
    };
  }

  const key = cacheKey({ ...opts, state: abbr, county });
  if (!opts.force) {
    const cached = readCache()[key];
    if (cached && Date.now() - cached.at < CACHE_TTL_MS && cached.resolution.sources.length > 0) {
      log('[GisResolver] cache hit', { key, count: cached.resolution.sources.length });
      emitActivity(opts, 'cache', `Using ${cached.resolution.sources.length} cached live source(s).`);
      return { ...cached.resolution, cached: true };
    }
  }

  emitActivity(
    opts,
    'start',
    `Resolving ${opts.query?.trim() || opts.kind} for ${county ? `${county} County` : abbr ?? 'the project footprint'}.`,
  );
  const stateEntry = stateEntryFor(abbr);
  const portals = Array.from(new Set([
    ...(pasdaAvailable ? [PASDA_PORTAL_URL] : []),
    ...(stateEntry?.portalUrl ? [stateEntry.portalUrl] : []),
    ...(opts.portals ?? []),
  ]));

  const builtIns = buildBuiltInCandidates(opts.kind, bbox, abbr, county, opts.query);

  // PASDA is the authoritative contour source in Pennsylvania. Verify it
  // before ArcGIS Online or Scout discovery so a working PAMAP mosaic resolves
  // immediately and live activity never implies a Scout fallback was needed.
  if (pasdaAvailable && opts.kind === 'contours') {
    const pasdaBuiltIns = builtIns.filter(source => source.provider === 'pasda');
    if (pasdaBuiltIns.length > 0) {
      emitActivity(opts, 'pasda', 'Checking PASDA PAMAP contour mosaics first.');
      const pasdaChecks = await mapWithConcurrency(pasdaBuiltIns, 2, async (candidate) => {
        emitActivity(opts, 'probe', `Checking ${candidate.label}.`, { url: candidate.url });
        try {
          return await verifyCandidate(candidate, bbox, log, opts.query);
        } catch (error) {
          return {
            source: candidate,
            attempt: {
              label: candidate.label,
              url: candidate.url,
              provider: candidate.provider,
              ok: false,
              message: error instanceof Error ? error.message : String(error),
            },
          };
        }
      });
      const pasdaSources = pasdaChecks
        .map(entry => entry.source)
        .filter(source => source.verified)
        .sort((a, b) => scoreSource(b, county, opts.query) - scoreSource(a, county, opts.query));
      if (pasdaSources.length > 0) {
        const resolution: GisResolution = {
          kind: opts.kind,
          bboxWgs84: bbox,
          sources: pasdaSources,
          attempts: pasdaChecks.map(entry => entry.attempt),
          pasdaAvailable: true,
          cached: false,
          resolvedAt: Date.now(),
          warnings: [],
          jurisdiction: grounding.resolution,
          candidates: pasdaChecks.map((entry): ScoutCandidateAudit => {
            const decision = candidateGroundingDecision(entry.source, grounding.resolution, bbox);
            return {
              ...toCandidateAudit(entry.source, decision),
              geometryType: entry.source.geometryType,
              featureCount: entry.source.featureCount,
              verified: entry.source.verified,
              message: entry.attempt.message,
              decision: entry.source.verified ? decision.decision : 'rejected',
              reason: entry.source.verified ? decision.reason : 'zero_features',
            };
          }),
          groundingVersion: SCOUT_GROUNDING_VERSION,
        };
        const cache = readCache();
        for (const [entryKey, entry] of Object.entries(cache)) {
          if (Date.now() - entry.at > CACHE_TTL_MS) delete cache[entryKey];
        }
        cache[key] = { at: Date.now(), resolution };
        writeCache(cache);
        emitActivity(
          opts,
          'done',
          `${pasdaSources.length} PASDA contour source${pasdaSources.length === 1 ? '' : 's'} verified.`,
          { level: 'success' },
        );
        log('[GisResolver] PASDA resolved', {
          kind: opts.kind,
          county,
          verified: pasdaSources.length,
        });
        return resolution;
      }
      warnings.push('PASDA was checked first, but no PAMAP contour layer returned features for this footprint.');
      emitActivity(opts, 'pasda', 'PASDA returned no features; checking other live sources.', { level: 'warn' });
    }
  }

  const attempts: GisResolutionAttempt[] = builtIns.map(source => ({
    label: source.label,
    url: source.url,
    provider: source.provider,
    ok: false,
    message: 'Candidate queued for verification.',
  }));

  const candidates = new Map<string, GisResolvedSource>();
  for (const source of builtIns) {
    if (!candidates.has(source.url.toLowerCase())) candidates.set(source.url.toLowerCase(), source);
  }

  // ArcGIS Online discovery runs regardless of state: most county GIS
  // departments publish there, and it needs no browser hop.
  emitActivity(opts, 'agol', 'Searching ArcGIS Online for live layers.');
  try {
    const agol = await discoverAgolCandidates(opts.kind, bbox, county, abbr, 20, opts.query);
    for (const source of agol) {
      if (!candidates.has(source.url.toLowerCase())) candidates.set(source.url.toLowerCase(), source);
    }
    if (agol.length === 0) warnings.push('ArcGIS Online returned no matching services near this AOI.');
    emitActivity(opts, 'agol', `${agol.length} ArcGIS Online candidate(s) found.`);
    log('[GisResolver] agol discovery', { kind: opts.kind, found: agol.length });
  } catch (error) {
    warnings.push(`ArcGIS Online discovery failed (${error instanceof Error ? error.message : String(error)}).`);
    emitActivity(opts, 'agol', 'ArcGIS Online discovery failed.', { level: 'warn' });
  }

  if (opts.includeScout !== false) {
    emitActivity(opts, 'scout', 'Handing off to LandSurv Scout to inspect public GIS portals.');
    const scout = await discoverWithScout(opts, portals);
    for (const source of scout.candidates) {
      if (!candidates.has(source.url.toLowerCase())) candidates.set(source.url.toLowerCase(), source);
    }
    if (scout.warning) {
      warnings.push(scout.warning);
      emitActivity(opts, 'scout', scout.warning, { level: 'warn' });
    } else {
      emitActivity(opts, 'scout', `${scout.candidates.length} Scout candidate(s) found.`);
    }
    log('[GisResolver] scout discovery', { kind: opts.kind, found: scout.candidates.length, portals });
  }

  // Ground every candidate before spending a probe on it. Federal layers are
  // admitted on AOI coverage; local layers must match the grounded state or
  // actually clip the AOI (the riverfront/neighbor rule).
  const candidateDecisions = new Map<string, ScoutGroundingDecision>();
  const rejectedSources: Array<{ source: GisResolvedSource; decision: ScoutGroundingDecision }> = [];
  const admissible: GisResolvedSource[] = [];
  for (const source of candidates.values()) {
    const decision = candidateGroundingDecision(source, grounding.resolution, bbox);
    candidateDecisions.set(source.url.toLowerCase(), decision);
    if (decision.decision === 'rejected') {
      rejectedSources.push({ source, decision });
      emitActivity(opts, 'rejected', `${source.label}: ${decision.message}`, {
        level: 'warn',
        url: source.url,
      });
    } else {
      admissible.push(source);
    }
  }

  // Verify in a stable order: built-ins first (PASDA), then everything else.
  const ordered = admissible
    .sort((a, b) => scoreSource(b, county, opts.query) - scoreSource(a, county, opts.query))
    .slice(0, Math.max(1, Math.min(opts.limit ?? 10, 16)));

  emitActivity(opts, 'verify', `Verifying ${ordered.length} candidate layer(s) against the footprint.`);
  const verified = await mapWithConcurrency(ordered, 4, async (candidate) => {
    emitActivity(opts, 'probe', `Checking ${candidate.label}.`, { url: candidate.url });
    try {
      const entry = await verifyCandidate(candidate, bbox, log, opts.query);
      emitActivity(
        opts,
        entry.attempt.ok ? 'verified' : 'empty',
        `${candidate.label}: ${entry.attempt.message}`,
        { url: entry.attempt.url, level: entry.attempt.ok ? 'success' : 'warn' },
      );
      return entry;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emitActivity(opts, 'empty', `${candidate.label}: verification failed.`, {
        url: candidate.url,
        level: 'warn',
      });
      return {
        source: candidate,
        attempt: {
          label: candidate.label,
          url: candidate.url,
          provider: candidate.provider,
          ok: false,
          message,
        },
      };
    }
  });

  // Replace placeholder attempts for built-ins with their live verification.
  const liveAttempts = verified.map(entry => entry.attempt);
  const liveUrls = new Set(liveAttempts.map(attempt => attempt.url?.toLowerCase()).filter(Boolean));
  const remainingQueued = attempts.filter(attempt => !liveUrls.has(attempt.url?.toLowerCase()));

  const audited: ScoutCandidateAudit[] = [
    ...rejectedSources.map(({ source, decision }) => toCandidateAudit(source, decision)),
    ...verified.map(entry => {
      const decision = candidateDecisions.get(entry.source.url.toLowerCase())
        ?? candidateGroundingDecision(entry.source, grounding.resolution, bbox);
      const base = toCandidateAudit(entry.source, decision);
      return {
        ...base,
        geometryType: entry.source.geometryType,
        featureCount: entry.source.featureCount,
        verified: entry.source.verified,
        decision: entry.source.verified ? base.decision : 'rejected',
        reason: entry.source.verified ? base.reason : 'zero_features',
        message: entry.attempt.message,
      } satisfies ScoutCandidateAudit;
    }),
  ];

  const sources = verified
    .map(entry => entry.source)
    .filter(source => source.verified)
    .sort((a, b) => scoreSource(b, county, opts.query) - scoreSource(a, county, opts.query));

  // If nothing verified, keep valid layers in the list (callers may still try
  // them when the count endpoint itself is unavailable).
  if (sources.length === 0) {
    sources.push(...verified
      .map(entry => entry.source)
      .filter(source => !!source.geometryType)
      .sort((a, b) => scoreSource(b, county, opts.query) - scoreSource(a, county, opts.query)));
  }

  if (sources.length === 0) {
    warnings.push(
      pasdaAvailable
        ? 'PASDA and ArcGIS Online were checked; no live layer returned features for this footprint.'
        : 'No public layer returned features for this footprint.',
    );
  }

  const resolution: GisResolution = {
    kind: opts.kind,
    bboxWgs84: bbox,
    sources,
    attempts: [...liveAttempts, ...remainingQueued],
    pasdaAvailable,
    cached: false,
    resolvedAt: Date.now(),
    warnings,
    jurisdiction: grounding.resolution,
    candidates: audited,
    groundingVersion: SCOUT_GROUNDING_VERSION,
  };

  if (sources.some(source => source.verified)) {
    const cache = readCache();
    // Drop stale entries lazily so localStorage cannot grow forever.
    for (const [entryKey, entry] of Object.entries(cache)) {
      if (Date.now() - entry.at > CACHE_TTL_MS) delete cache[entryKey];
    }
    cache[key] = { at: Date.now(), resolution };
    writeCache(cache);
  }

  const verifiedCount = sources.filter(source => source.verified).length;
  emitActivity(
    opts,
    'done',
    verifiedCount > 0
      ? `${verifiedCount} verified live source(s) ready.`
      : 'No live source returned features for this footprint.',
    { level: verifiedCount > 0 ? 'success' : 'warn' },
  );
  log('[GisResolver] resolved', {
    kind: opts.kind,
    county,
    verified: verifiedCount,
    total: sources.length,
  });
  return resolution;
}

/** Human-readable one-liner for agent replies and failure guidance. */
export function describeGisResolution(resolution: GisResolution): string {
  if (resolution.sources.length === 0) {
    return resolution.warnings[0] ?? 'No public GIS service could be resolved for this area.';
  }
  const best = resolution.sources[0];
  const count = typeof best.featureCount === 'number'
    ? ` (${best.featureCount.toLocaleString()} feature${best.featureCount === 1 ? '' : 's'} at this footprint)`
    : '';
  return `Resolved ${resolution.sources.length} live source${resolution.sources.length === 1 ? '' : 's'}; using ${best.label}${count}.`;
}
