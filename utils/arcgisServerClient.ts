/**
 * arcgisServerClient — resilient client for public ArcGIS REST servers.
 *
 * The GIS Agent previously fetched everything through a single hard-coded
 * public CORS proxy (api.allorigins.win). When that proxy degraded, the whole
 * "load from ArcGIS URL" feature broke. This client fixes that:
 *
 *   1. DIRECT fetch first — most ArcGIS servers (ArcGIS Online, sampleserver6,
 *      and many federal/state servers) send permissive CORS headers, so no
 *      proxy is needed at all.
 *   2. PROXY FAILOVER — if the direct call is blocked (CORS, mixed content,
 *      network), fall back to the prioritized proxy list in utils/corsProxy.ts
 *      (codetabs → allorigins → corsproxy.io) with per-proxy timeouts.
 *
 * On top of the transport it adds ArcGIS-specific helpers:
 *   - classifyArcGisUrl: figure out what a pasted URL points at (query
 *     endpoint / layer / service root / server or folder directory).
 *   - listDirectory: browse a server or folder (folders, services, layers)
 *     like the QGIS/ArcGIS data-source managers do.
 *   - getLayerInfo: layer metadata (fields, geometry type, maxRecordCount).
 *   - queryLayerGeoJson: feature query returned as GeoJSON, with automatic
 *     esriJSON fallback + conversion for older servers.
 */

import { fetchViaProxy } from './corsProxy.ts';

// ─── URL classification ───────────────────────────────────────────────────────

export type ArcGisUrlKind =
  /** A pre-formatted .../query?where=... endpoint — fetch as-is. */
  | 'query'
  /** A layer endpoint: .../MapServer/0 or .../FeatureServer/12 */
  | 'layer'
  /** A service root: .../MapServer or .../FeatureServer (no layer id) */
  | 'service'
  /** A server root or folder: .../rest/services[/Folder/SubFolder] */
  | 'directory';

export interface ClassifiedArcGisUrl {
  kind: ArcGisUrlKind;
  /** URL with surrounding whitespace and trailing slashes removed. */
  cleanUrl: string;
}

const LAYER_RE = /\/(MapServer|FeatureServer)\/\d+$/i;
const SERVICE_RE = /\/(MapServer|FeatureServer|ImageServer)$/i;

export function classifyArcGisUrl(rawUrl: string): ClassifiedArcGisUrl {
  const cleanUrl = rawUrl.trim().replace(/\/+$/, '');
  if (/\/query(\?|$)/i.test(cleanUrl)) return { kind: 'query', cleanUrl };
  if (LAYER_RE.test(cleanUrl)) return { kind: 'layer', cleanUrl };
  if (SERVICE_RE.test(cleanUrl)) return { kind: 'service', cleanUrl };
  return { kind: 'directory', cleanUrl };
}

/** Human-readable label for a directory entry's service type. */
export function serviceTypeLabel(type: string): string {
  switch (type) {
    case 'MapServer': return 'Map';
    case 'FeatureServer': return 'Features';
    case 'ImageServer': return 'Imagery';
    case 'GPServer': return 'Geoprocessing';
    case 'GeocodeServer': return 'Geocoder';
    case 'GlobeServer': return 'Globe';
    case 'GeometryServer': return 'Geometry';
    default: return type;
  }
}

// ─── Resilient JSON transport ─────────────────────────────────────────────────

export interface FetchJsonOptions {
  /** Timeout for the direct (un-proxied) attempt. Default 25 s. */
  directTimeoutMs?: number;
  /** Timeout per CORS-proxy attempt. Default 20 s. */
  proxyTimeoutMs?: number;
}

interface ArcGisErrorBody {
  error?: { code?: number; message?: string; details?: string[] };
}

function normalizeArcGisError(url: string, body: ArcGisErrorBody): void {
  if (body && typeof body === 'object' && body.error) {
    const e = body.error;
    const details = e.details && e.details.length ? ` (${e.details.join('; ')})` : '';
    throw new Error(`ArcGIS error ${e.code ?? ''}: ${e.message ?? 'unknown'}${details}`.trim());
  }
}

/**
 * Fetch JSON from an ArcGIS endpoint: direct first, then CORS-proxy failover.
 * Throws an Error with a human-readable message when every path fails, or when
 * the server answers with an ArcGIS `{error}` body (which is authoritative and
 * therefore NOT proxied away).
 */
export async function fetchJsonResilient<T = unknown>(url: string, opts: FetchJsonOptions = {}): Promise<T> {
  // 25 s default: FEMA NFHL and similar federal servers are slow but do answer
  // — a shorter timeout aborts a working request and forces a slow proxy retry.
  const directTimeoutMs = opts.directTimeoutMs ?? 25_000;

  let directFailure: string | null = null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), directTimeoutMs);
  try {
    const resp = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (resp.ok) {
      const body = (await resp.json()) as T & ArcGisErrorBody;
      normalizeArcGisError(url, body);
      return body;
    }
    directFailure = `HTTP ${resp.status} ${resp.statusText}`;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('ArcGIS error')) throw err;
    directFailure = err instanceof Error && err.name === 'AbortError'
      ? `timed out after ${directTimeoutMs} ms`
      : err instanceof Error ? err.message : String(err);
  } finally {
    clearTimeout(timer);
  }

  // Direct path failed (CORS block, mixed content, server down for us) —
  // try the public CORS proxies in priority order.
  try {
    const resp = await fetchViaProxy(url, { perProxyTimeoutMs: opts.proxyTimeoutMs ?? 20_000 });
    const body = (await resp.json()) as T & ArcGisErrorBody;
    normalizeArcGisError(url, body);
    return body;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('ArcGIS error')) throw err;
    const proxyFailure = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not reach the GIS server. Direct request: ${directFailure}. Proxies: ${proxyFailure}`,
    );
  }
}

// ─── Server / folder / service directory browsing ────────────────────────────

export interface ArcGisFolderEntry { name: string; url: string; }
export interface ArcGisServiceEntry { name: string; type: string; url: string; }
export interface ArcGisLayerEntry { id: number; name: string; url: string; }

export interface ArcGisDirectoryListing {
  url: string;
  /** What this listing represents (drives which sections the UI shows). */
  kind: 'directory' | 'service';
  folders: ArcGisFolderEntry[];
  services: ArcGisServiceEntry[];
  layers: ArcGisLayerEntry[];
  /** Service metadata, present when listing a service root. */
  serviceName?: string;
  serviceDescription?: string;
  /** True when the server answered but with nothing browsable inside. */
  empty: boolean;
}

interface RawDirectoryJson {
  folders?: string[];
  services?: { name?: string; type?: string }[];
  layers?: { id?: number; name?: string }[];
  mapName?: string;
  name?: string;
  serviceDescription?: string;
  description?: string;
}

/** Strip a leading "Folder/" prefix ArcGIS puts on service names inside folders. */
function leafName(name: string): string {
  const idx = name.lastIndexOf('/');
  return idx >= 0 ? name.slice(idx + 1) : name;
}

/**
 * List the contents of an ArcGIS server root, folder, or service root so the
 * UI can offer drill-down browsing (folders → services → layers).
 */
export async function listDirectory(rawUrl: string, opts: FetchJsonOptions = {}): Promise<ArcGisDirectoryListing> {
  const { cleanUrl } = classifyArcGisUrl(rawUrl);
  const sep = cleanUrl.includes('?') ? '&' : '?';
  const data = await fetchJsonResilient<RawDirectoryJson>(`${cleanUrl}${sep}f=json`, opts);

  const isService = SERVICE_RE.test(cleanUrl);
  const folders: ArcGisFolderEntry[] = (data.folders ?? [])
    .filter((f): f is string => typeof f === 'string' && !!f)
    .map((name) => ({ name, url: `${cleanUrl}/${encodeURIComponent(name)}` }));
  const services: ArcGisServiceEntry[] = (data.services ?? [])
    .filter((s) => !!s && typeof s.name === 'string' && typeof s.type === 'string')
    .map((s) => ({
      name: s.name as string,
      type: s.type as string,
      url: `${cleanUrl}/${encodeURIComponent(leafName(s.name as string))}/${s.type}`,
    }));
  const layers: ArcGisLayerEntry[] = (data.layers ?? [])
    .filter((l) => !!l && typeof l.id === 'number' && typeof l.name === 'string')
    .map((l) => ({ id: l.id as number, name: l.name as string, url: `${cleanUrl}/${l.id}` }));

  return {
    url: cleanUrl,
    kind: isService ? 'service' : 'directory',
    folders,
    services,
    layers,
    serviceName: isService ? (data.mapName || data.name || leafName(cleanUrl.split('/').pop() ?? '')) : undefined,
    serviceDescription: data.serviceDescription || data.description || undefined,
    empty: folders.length + services.length + layers.length === 0,
  };
}

// ─── Layer metadata + feature queries ────────────────────────────────────────

export interface ArcGisFieldInfo { name: string; type: string; alias?: string; }

export interface ArcGisLayerInfo {
  name: string;
  geometryType?: string;
  fields: ArcGisFieldInfo[];
  maxRecordCount?: number;
  description?: string;
  /** True when the layer advertises f=geojson support (most 10.3+ servers do). */
}

export async function getLayerInfo(layerUrl: string, opts: FetchJsonOptions = {}): Promise<ArcGisLayerInfo> {
  const { cleanUrl } = classifyArcGisUrl(layerUrl);
  const sep = cleanUrl.includes('?') ? '&' : '?';
  const data = await fetchJsonResilient<{
    name?: string;
    geometryType?: string;
    fields?: { name?: string; type?: string; alias?: string }[];
    maxRecordCount?: number;
    description?: string;
  }>(`${cleanUrl}${sep}f=json`, opts);

  return {
    name: data.name ?? cleanUrl.split('/').pop() ?? 'layer',
    geometryType: data.geometryType,
    fields: (data.fields ?? [])
      .filter((f): f is { name: string; type: string; alias?: string } => !!f && typeof f.name === 'string')
      .map((f) => ({ name: f.name, type: f.type ?? '', alias: f.alias })),
    maxRecordCount: typeof data.maxRecordCount === 'number' ? data.maxRecordCount : undefined,
    description: data.description || undefined,
  };
}

export interface QueryLayerOptions extends FetchJsonOptions {
  /** SQL where clause (default '1=1'). */
  where?: string;
  /** Cap on returned features (default 10 000). */
  maxFeatures?: number;
  /** Comma-separated out fields (default '*'). */
  outFields?: string;
  /**
   * Area-of-interest envelope in WGS84 [xmin, ymin, xmax, ymax]. When set, the
   * query is spatially filtered (esriSpatialRelIntersects) — essential for
   * national/statewide layers whose full extent would never load.
   */
  bboxWgs84?: [number, number, number, number];
  /**
   * Server-side geometry generalization tolerance in DEGREES (the query always
   * requests outSR=4326). Cuts payload size 10-20× on dense county polygons
   * with no visible difference at map scale. Omit for full fidelity.
   */
  maxAllowableOffset?: number;
}

/** Build the /query URL for a layer (exposed for tests + debugging). */
export function buildQueryUrl(layerUrl: string, opts: QueryLayerOptions = {}, format: 'geojson' | 'json' = 'geojson'): string {
  const { cleanUrl } = classifyArcGisUrl(layerUrl);
  const where = opts.where ?? '1=1';
  const outFields = opts.outFields ?? '*';
  const max = opts.maxFeatures ?? 10_000;
  let url = `${cleanUrl}/query?where=${encodeURIComponent(where)}&outFields=${encodeURIComponent(outFields)}&f=${format}&resultRecordCount=${max}&outSR=4326`;
  if (opts.bboxWgs84) {
    const [xmin, ymin, xmax, ymax] = opts.bboxWgs84;
    url += `&geometry=${xmin},${ymin},${xmax},${ymax}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects`;
  }
  if (opts.maxAllowableOffset && opts.maxAllowableOffset > 0) {
    url += `&maxAllowableOffset=${opts.maxAllowableOffset}`;
  }
  return url;
}

/**
 * Probe how many features a where-clause matches (returnCountOnly). Cheap even
 * on million-record layers. Returns null when the server cannot tell us —
 * callers should treat null as "unknown, proceed cautiously".
 */
export async function getLayerFeatureCount(
  layerUrl: string,
  opts: { where?: string } & FetchJsonOptions = {},
): Promise<number | null> {
  const { cleanUrl } = classifyArcGisUrl(layerUrl);
  const where = encodeURIComponent(opts.where ?? '1=1');
  try {
    const data = await fetchJsonResilient<{ count?: number }>(
      `${cleanUrl}/query?where=${where}&returnCountOnly=true&f=json`,
      opts,
    );
    return typeof data.count === 'number' ? data.count : null;
  } catch {
    return null;
  }
}

// ─── Place geocoding ─────────────────────────────────────────────────────────

export interface GeocodedPlace {
  lon: number;
  lat: number;
  label: string;
}

/**
 * Geocode a US place/address. Primary: OSM Nominatim (CORS-enabled, mirrors
 * the flood/contour agents). Fallback: US Census onelineaddress via the proxy
 * chain, which handles exact street addresses Nominatim sometimes misses.
 * Returns null when neither finds a match.
 */
export async function geocodePlace(address: string, opts: FetchJsonOptions = {}): Promise<GeocodedPlace | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;

  // 1) Nominatim — permissive CORS, no key, best for city/place queries.
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), opts.directTimeoutMs ?? 12_000);
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(trimmed)}&format=json&limit=1&countrycodes=us`,
      { signal: ctl.signal, headers: { 'Accept-Language': 'en' } },
    );
    clearTimeout(timer);
    if (resp.ok) {
      const arr = await resp.json() as { lat?: string; lon?: string; display_name?: string }[];
      const hit = arr?.[0];
      const lat = parseFloat(hit?.lat ?? '');
      const lon = parseFloat(hit?.lon ?? '');
      if (isFinite(lat) && isFinite(lon)) {
        return { lon, lat, label: hit?.display_name ?? trimmed };
      }
    }
  } catch { /* fall through to Census */ }

  // 2) Census Bureau onelineaddress — better for exact street addresses.
  try {
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(trimmed)}&benchmark=2020&format=json`;
    const data = await fetchJsonResilient<{
      result?: { addressMatches?: { matchedAddress?: string; coordinates?: { x?: number; y?: number } }[] };
    }>(url, opts);
    const match = data.result?.addressMatches?.[0];
    const x = match?.coordinates?.x;
    const y = match?.coordinates?.y;
    if (match && typeof x === 'number' && typeof y === 'number') {
      return { lon: x, lat: y, label: match.matchedAddress ?? trimmed };
    }
  } catch { /* no match anywhere */ }

  return null;
}

/** WGS84 envelope of roughly `radiusMiles` around a lon/lat point. */
export function bboxAroundPoint(lon: number, lat: number, radiusMiles: number): [number, number, number, number] {
  const degLat = radiusMiles / 69.0;
  const degLon = radiusMiles / (69.0 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  return [lon - degLon, lat - degLat, lon + degLon, lat + degLat];
}

/**
 * Query a layer and return a GeoJSON FeatureCollection. Tries `f=geojson`
 * first and falls back to `f=json` + client-side conversion for servers that
 * predate GeoJSON output. Throws when the response contains no features.
 */
export async function queryLayerGeoJson(layerUrl: string, opts: QueryLayerOptions = {}): Promise<GeoJSONFeatureCollection> {
  const geojsonUrl = buildQueryUrl(layerUrl, opts, 'geojson');
  const first = await fetchJsonResilient<Record<string, unknown>>(geojsonUrl, opts);

  let geoJson: GeoJSONFeatureCollection;
  if (first.type === 'FeatureCollection') {
    geoJson = first as unknown as GeoJSONFeatureCollection;
    // f=geojson responses carry properties.exceededTransferLimit, not top-level
    if ((first as { properties?: { exceededTransferLimit?: boolean } }).properties?.exceededTransferLimit) {
      geoJson.exceededTransferLimit = true;
    }
  } else if (Array.isArray(first.features)) {
    geoJson = esriJsonToGeoJson(first);
    if ((first as { exceededTransferLimit?: boolean }).exceededTransferLimit) geoJson.exceededTransferLimit = true;
  } else {
    // Old server without GeoJSON support — retry as esriJSON.
    const esriUrl = buildQueryUrl(layerUrl, opts, 'json');
    const second = await fetchJsonResilient<Record<string, unknown>>(esriUrl, opts);
    geoJson = second.type === 'FeatureCollection'
      ? (second as unknown as GeoJSONFeatureCollection)
      : esriJsonToGeoJson(second);
    if ((second as { exceededTransferLimit?: boolean }).exceededTransferLimit) geoJson.exceededTransferLimit = true;
  }

  if (!Array.isArray(geoJson.features) || geoJson.features.length === 0) {
    throw new Error('The service returned no features. Check the URL or where-clause and try again.');
  }
  return geoJson;
}

/** Fetch a pre-formatted .../query?... URL and normalize the result to GeoJSON. */
export async function fetchQueryUrlGeoJson(queryUrl: string, opts: FetchJsonOptions = {}): Promise<GeoJSONFeatureCollection> {
  const data = await fetchJsonResilient<Record<string, unknown>>(queryUrl, opts);
  const geoJson = data.type === 'FeatureCollection'
    ? (data as unknown as GeoJSONFeatureCollection)
    : esriJsonToGeoJson(data);
  if (!Array.isArray(geoJson.features) || geoJson.features.length === 0) {
    throw new Error('The query returned no features. Check your query parameters and try again.');
  }
  return geoJson;
}

// ─── esriJSON → GeoJSON conversion ───────────────────────────────────────────

export interface GeoJSONFeature {
  type: 'Feature';
  geometry: { type: string; coordinates: unknown } | null;
  properties: Record<string, unknown>;
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
  /** Present when the server truncated the result (exceededTransferLimit). */
  exceededTransferLimit?: boolean;
}

interface EsriGeometry {
  x?: number; y?: number; z?: number;
  points?: number[][];
  paths?: number[][][];
  rings?: number[][][];
}

interface EsriFeatureJson {
  geometry?: EsriGeometry;
  attributes?: Record<string, unknown>;
}

/**
 * Signed ring area via the shoelace formula. Positive = counter-clockwise.
 * Esri delivers exterior rings clockwise and holes counter-clockwise, so the
 * sign is the authoritative way to split rings into polygons and holes
 * (the previous heuristic — "the biggest ring is the outer ring" — breaks for
 * any polygon whose hole spans more area than another exterior ring).
 */
function signedRingArea(ring: number[][]): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return area / 2;
}

/** Group esri rings into GeoJSON polygons: [ [exterior, hole, ...], ... ]. */
export function groupEsriRings(rings: number[][][]): number[][][][] {
  const polygons: number[][][][] = [];
  for (const ring of rings) {
    if (!Array.isArray(ring) || ring.length < 4) continue;
    if (signedRingArea(ring) < 0 || polygons.length === 0) {
      // Clockwise (esri exterior) — or the first ring seen, which must open a
      // polygon even if the server got the winding order wrong.
      polygons.push([ring]);
    } else {
      polygons[polygons.length - 1].push(ring);
    }
  }
  return polygons;
}

function convertGeometry(g: EsriGeometry | undefined): GeoJSONFeature['geometry'] {
  if (!g) return null;
  if (g.x !== undefined && g.y !== undefined) {
    const coords = g.z !== undefined ? [g.x, g.y, g.z] : [g.x, g.y];
    return { type: 'Point', coordinates: coords };
  }
  if (Array.isArray(g.points)) {
    return { type: 'MultiPoint', coordinates: g.points };
  }
  if (Array.isArray(g.paths)) {
    return g.paths.length === 1
      ? { type: 'LineString', coordinates: g.paths[0] }
      : { type: 'MultiLineString', coordinates: g.paths };
  }
  if (Array.isArray(g.rings)) {
    const polygons = groupEsriRings(g.rings);
    if (polygons.length === 0) return null;
    return polygons.length === 1
      ? { type: 'Polygon', coordinates: polygons[0] }
      : { type: 'MultiPolygon', coordinates: polygons };
  }
  return null;
}

/** Convert an esriJSON query response to a GeoJSON FeatureCollection. */
export function esriJsonToGeoJson(esriData: unknown): GeoJSONFeatureCollection {
  const features: GeoJSONFeature[] = [];
  const raw = (esriData as { features?: EsriFeatureJson[] })?.features;
  if (Array.isArray(raw)) {
    for (const f of raw) {
      const geometry = convertGeometry(f?.geometry);
      if (geometry) {
        features.push({ type: 'Feature', geometry, properties: f?.attributes ?? {} });
      }
    }
  }
  return { type: 'FeatureCollection', features };
}
