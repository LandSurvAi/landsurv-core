/**
 * esriRestClient — shared, hardened ArcGIS REST client.
 *
 * Every Esri-backed fetcher in the app (FEMA flood, county parcels, contours,
 * future connectors) previously duplicated the same fragile pipeline:
 *   svc-info `?f=json` → proj4 bbox reproject → envelope /query → client
 *   reproject → geometry walk.
 * This module centralizes that pipeline and makes it bulletproof + fast:
 *
 *   • Service-info caching (in-memory + sessionStorage, 24 h TTL) — repeat
 *     fetches skip the metadata round-trip entirely.
 *   • Timeouts (AbortController) + retry with jittered exponential backoff
 *     on network errors / HTTP 5xx / 429.
 *   • Normalized ArcGIS `{error:{code,message}}` handling.
 *   • FULL result pagination via `resultOffset` — `exceededTransferLimit`
 *     responses are transparently resolved instead of silently truncated.
 *   • Server-side geometry generalization (`maxAllowableOffset` +
 *     `geometryPrecision`) so large AOIs return display-fidelity geometry
 *     instead of megabytes of vertices — fast to load, fast to render.
 *   • proj4 helpers (lazy-loaded) for bbox + point reprojection using all
 *     four corners (correct for rotated/conic projections).
 *   • Douglas–Peucker path simplification for optional client-side thinning.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EsriServiceInfoLite {
  /** Native spatial reference (latestWkid preferred over wkid). */
  nativeWkid?: number;
  /** Server page size limit (maxRecordCount), when advertised. */
  maxRecordCount?: number;
  /** True when the layer supports resultOffset pagination. */
  supportsPagination: boolean;
  /** OBJECTID field name, used for stable pagination ordering. */
  objectIdField?: string;
  /** Uppercased field names present on the layer. */
  fieldsUpper: string[];
  /** esriGeometryPolygon / esriGeometryPolyline / esriGeometryPoint … */
  geometryType?: string;
}

export interface EsriFetchRetryOptions {
  /** Per-request timeout in ms (default 20 000). */
  timeoutMs?: number;
  /** Retry count on retryable failures (default 2). */
  retries?: number;
  /** External abort signal (chained to the internal timeout). */
  signal?: AbortSignal;
  /** Debug logger. */
  log?: (msg: string, payload?: unknown) => void;
}

export interface EsriQueryOptions extends EsriFetchRetryOptions {
  /** Layer endpoint (…/FeatureServer/N or …/MapServer/N), no trailing /query. */
  url: string;
  /** Envelope in WGS84 [xmin, ymin, xmax, ymax]. Omit for attribute-only queries. */
  bboxWgs84?: [number, number, number, number];
  /** SQL where clause (default '1=1'). */
  where?: string;
  /** Comma-separated field list (default '*'). */
  outFields?: string;
  /** Include geometry in response (default true). */
  returnGeometry?: boolean;
  /**
   * Server-side generalization tolerance in *native SR units*. Use
   * `autoGeneralizationTolerance` to derive one from the bbox, or 0/undefined
   * to disable (full fidelity).
   */
  maxAllowableOffset?: number;
  /**
   * When set, the client derives `maxAllowableOffset` automatically from the
   * NATIVE-SR query bbox using this pixel budget (see
   * `autoGeneralizationTolerance`). Ignored when `maxAllowableOffset` is set
   * explicitly. Correct regardless of whether the service is in degrees,
   * meters or feet, because the tolerance is computed post-reprojection.
   */
  autoGeneralizePxBudget?: number;
  /** Decimal places for returned coordinates (default 3 when generalizing). */
  geometryPrecision?: number;
  /** Safety cap on pagination pages (default 10). */
  maxPages?: number;
}

export interface EsriFeature<A = Record<string, unknown>> {
  geometry?: { rings?: number[][][]; paths?: number[][][]; x?: number; y?: number };
  attributes?: A;
}

export interface EsriQueryResult<A = Record<string, unknown>> {
  features: EsriFeature<A>[];
  /** Spatial reference of the returned geometry (native SR of the service). */
  outWkid: number;
  /** Number of pages fetched. */
  pages: number;
  /**
   * True only when results are STILL truncated after pagination (server does
   * not paginate, or maxPages hit). Callers should surface this.
   */
  truncated: boolean;
  /** First-page query URL (debugging). */
  queryUrl: string;
}

// ─── Hardened fetch ───────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RETRIES = 2;

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

/**
 * fetch JSON with timeout + retry/backoff + ArcGIS error normalization.
 * Throws Error with a human-readable message on unrecoverable failure.
 */
export async function fetchEsriJson<T = Record<string, unknown>>(
  url: string,
  opts: EsriFetchRetryOptions = {},
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, retries = DEFAULT_RETRIES, signal, log } = opts;
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) throw new Error('Request aborted');
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const onOuterAbort = () => ctl.abort();
    signal?.addEventListener('abort', onOuterAbort, { once: true });
    try {
      const resp = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
      if (!resp.ok) {
        if (isRetryableStatus(resp.status) && attempt < retries) {
          lastErr = new Error(`HTTP ${resp.status} ${resp.statusText}`);
          log?.(`[esri] retryable HTTP ${resp.status}, attempt ${attempt + 1}/${retries + 1}`, { url });
          await backoff(attempt);
          continue;
        }
        throw new Error(`ArcGIS request failed: ${resp.status} ${resp.statusText}`);
      }
      const data = await resp.json() as T & { error?: { code?: number; message?: string; details?: unknown } };
      if (data && typeof data === 'object' && 'error' in data && data.error) {
        const e = data.error;
        // ArcGIS wraps some transient failures (e.g. 500/503) in HTTP 200 JSON.
        if (e.code && isRetryableStatus(e.code) && attempt < retries) {
          lastErr = new Error(`ArcGIS error ${e.code}: ${e.message ?? ''}`);
          log?.(`[esri] retryable service error ${e.code}, attempt ${attempt + 1}/${retries + 1}`, { url });
          await backoff(attempt);
          continue;
        }
        throw new Error(`ArcGIS error ${e.code ?? ''}: ${e.message ?? JSON.stringify(e)}`.trim());
      }
      return data;
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      if (signal?.aborted) throw new Error('Request aborted');
      const msg = isAbort ? `Request timed out after ${timeoutMs} ms` : (err instanceof Error ? err.message : String(err));
      lastErr = new Error(msg);
      // Timeouts + network errors are retryable; normalized ArcGIS errors above re-throw directly.
      const retryable = isAbort || !(err instanceof Error) || !msg.startsWith('ArcGIS');
      if (!retryable || attempt >= retries) throw lastErr;
      log?.(`[esri] ${msg} — retrying (${attempt + 1}/${retries + 1})`, { url });
      await backoff(attempt);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onOuterAbort);
    }
  }
  throw lastErr ?? new Error('ArcGIS request failed');
}

function backoff(attempt: number): Promise<void> {
  const ms = 400 * Math.pow(2, attempt) + Math.random() * 250;
  return new Promise(res => setTimeout(res, ms));
}

// ─── Service-info cache ───────────────────────────────────────────────────────

const SVC_INFO_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
const svcInfoMemCache = new Map<string, { at: number; info: EsriServiceInfoLite }>();

function readSessionCache(url: string): EsriServiceInfoLite | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(`esri-svcinfo:${url}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; info: EsriServiceInfoLite };
    if (Date.now() - parsed.at > SVC_INFO_TTL_MS) return null;
    return parsed.info;
  } catch { return null; }
}

function writeSessionCache(url: string, info: EsriServiceInfoLite): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(`esri-svcinfo:${url}`, JSON.stringify({ at: Date.now(), info }));
  } catch { /* quota / privacy mode — memory cache still works */ }
}

/** Test hook: clear all cached service metadata. */
export function clearEsriServiceInfoCache(): void {
  svcInfoMemCache.clear();
  try {
    if (typeof sessionStorage !== 'undefined') {
      const kill: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k?.startsWith('esri-svcinfo:')) kill.push(k);
      }
      kill.forEach(k => sessionStorage.removeItem(k));
    }
  } catch { /* ignore */ }
}

/**
 * Fetch layer metadata (`?f=json`) with caching. Never throws — returns a
 * conservative default on failure so queries can still proceed in WGS84.
 */
export async function getServiceInfo(url: string, opts: EsriFetchRetryOptions = {}): Promise<EsriServiceInfoLite> {
  const mem = svcInfoMemCache.get(url);
  if (mem && Date.now() - mem.at < SVC_INFO_TTL_MS) return mem.info;
  const ses = readSessionCache(url);
  if (ses) {
    svcInfoMemCache.set(url, { at: Date.now(), info: ses });
    return ses;
  }

  const fallback: EsriServiceInfoLite = { supportsPagination: false, fieldsUpper: [] };
  try {
    const svcInfo = await fetchEsriJson<{
      spatialReference?: { wkid?: number; latestWkid?: number };
      extent?: { spatialReference?: { wkid?: number; latestWkid?: number } };
      maxRecordCount?: number;
      advancedQueryCapabilities?: { supportsPagination?: boolean };
      supportsPagination?: boolean;
      objectIdField?: string;
      fields?: Array<{ name?: string; type?: string }>;
      geometryType?: string;
    }>(`${url}?f=json`, { ...opts, retries: opts.retries ?? 1 });

    const srObj = svcInfo?.spatialReference ?? svcInfo?.extent?.spatialReference;
    const nativeWkid = srObj?.latestWkid ?? srObj?.wkid;
    const oidFromFields = svcInfo?.fields?.find(f => f?.type === 'esriFieldTypeOID')?.name;
    const info: EsriServiceInfoLite = {
      nativeWkid,
      maxRecordCount: svcInfo?.maxRecordCount,
      supportsPagination: !!(svcInfo?.advancedQueryCapabilities?.supportsPagination ?? svcInfo?.supportsPagination),
      objectIdField: svcInfo?.objectIdField ?? oidFromFields,
      fieldsUpper: (svcInfo?.fields ?? []).map(f => String(f?.name ?? '').toUpperCase()).filter(Boolean),
      geometryType: svcInfo?.geometryType,
    };
    svcInfoMemCache.set(url, { at: Date.now(), info });
    writeSessionCache(url, info);
    return info;
  } catch (e) {
    opts.log?.('[esri] svc-info fetch failed — proceeding with WGS84 defaults', { url, error: String(e) });
    return fallback;
  }
}

// ─── proj4 helpers ────────────────────────────────────────────────────────────

type Proj4Fn = ((from: string, to: string, xy: [number, number]) => [number, number]) & {
  defs: (name: string) => unknown;
};

let proj4Cache: Proj4Fn | null = null;

async function loadProj4(): Promise<Proj4Fn> {
  if (proj4Cache) return proj4Cache;
  const [{ default: proj4mod }, { initProjections }] = await Promise.all([
    import('proj4'),
    import('../utils/projections.ts'),
  ]);
  // Idempotent — registers WGS84 / WebMercator / all State Plane zones.
  initProjections();
  proj4Cache = proj4mod as unknown as Proj4Fn;
  return proj4Cache;
}

function hasDef(proj4mod: Proj4Fn, epsg: number): boolean {
  // EPSG:4326/3857 always registered by initProjections; proj4 also ships 4326.
  try { return !!proj4mod.defs(`EPSG:${epsg}`); } catch { return false; }
}

/**
 * Reproject a bbox by transforming ALL FOUR corners and taking the min/max —
 * correct for conic projections where sw/ne alone under-covers the envelope.
 * Returns null when the target EPSG has no registered proj4 definition.
 */
export async function reprojectBbox(
  bbox: [number, number, number, number],
  fromEpsg: number,
  toEpsg: number,
): Promise<[number, number, number, number] | null> {
  if (fromEpsg === toEpsg) return bbox;
  try {
    const proj4mod = await loadProj4();
    if (!hasDef(proj4mod, fromEpsg) || !hasDef(proj4mod, toEpsg)) return null;
    const [xmin, ymin, xmax, ymax] = bbox;
    const corners: [number, number][] = [
      [xmin, ymin], [xmax, ymin], [xmax, ymax], [xmin, ymax],
    ];
    const out = corners.map(c => proj4mod(`EPSG:${fromEpsg}`, `EPSG:${toEpsg}`, c));
    const xs = out.map(p => p[0]);
    const ys = out.map(p => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  } catch {
    return null;
  }
}

/**
 * Build a point converter fromEpsg → toEpsg, or null when identical / no defs.
 */
export async function makePointConverter(
  fromEpsg: number,
  toEpsg: number,
): Promise<((xy: [number, number]) => [number, number]) | null> {
  if (fromEpsg === toEpsg) return null;
  try {
    const proj4mod = await loadProj4();
    if (!hasDef(proj4mod, fromEpsg) || !hasDef(proj4mod, toEpsg)) return null;
    return (xy) => proj4mod(`EPSG:${fromEpsg}`, `EPSG:${toEpsg}`, xy);
  } catch {
    return null;
  }
}

// ─── Generalization helpers ───────────────────────────────────────────────────

/**
 * Derive a server-side generalization tolerance from the query bbox: the
 * AOI's longest dimension divided by a pixel budget. At the default 4 000 px
 * budget a 1 000 ft site gets 0.25 ft tolerance — invisible on screen, but
 * cuts vertex counts by an order of magnitude on dense layers.
 */
export function autoGeneralizationTolerance(
  bboxNative: [number, number, number, number],
  pxBudget = 4000,
): number {
  const [xmin, ymin, xmax, ymax] = bboxNative;
  const dim = Math.max(Math.abs(xmax - xmin), Math.abs(ymax - ymin));
  if (!Number.isFinite(dim) || dim <= 0) return 0;
  return dim / pxBudget;
}

/**
 * Douglas–Peucker simplification for a coordinate path.
 * `tolerance` in the path's coordinate units. Keeps endpoints.
 */
export function simplifyPath(path: number[][], tolerance: number): number[][] {
  if (tolerance <= 0 || path.length <= 2) return path;
  const sqTol = tolerance * tolerance;

  const sqSegDist = (p: number[], a: number[], b: number[]): number => {
    let x = a[0], y = a[1];
    let dx = b[0] - x, dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) { x = b[0]; y = b[1]; }
      else if (t > 0) { x += dx * t; y += dy * t; }
    }
    dx = p[0] - x; dy = p[1] - y;
    return dx * dx + dy * dy;
  };

  const keep = new Uint8Array(path.length);
  keep[0] = 1; keep[path.length - 1] = 1;
  const stack: [number, number][] = [[0, path.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let maxD = 0, idx = -1;
    for (let i = first + 1; i < last; i++) {
      const d = sqSegDist(path[i], path[first], path[last]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > sqTol && idx !== -1) {
      keep[idx] = 1;
      stack.push([first, idx], [idx, last]);
    }
  }
  const out: number[][] = [];
  for (let i = 0; i < path.length; i++) if (keep[i]) out.push(path[i]);
  return out;
}

// ─── Main paged query ─────────────────────────────────────────────────────────

const DEFAULT_MAX_PAGES = 10;
const FALLBACK_PAGE_SIZE = 2000;

/**
 * Query an ArcGIS layer with full pagination, retries and optional
 * server-side generalization. Geometry is returned in the service's NATIVE
 * spatial reference (callers reproject with `makePointConverter`) — querying
 * native-in/native-out avoids the classic silent-zero-features bug on older
 * ArcGIS Server instances.
 */
export async function queryEsriFeatures<A = Record<string, unknown>>(
  opts: EsriQueryOptions,
): Promise<EsriQueryResult<A>> {
  const {
    url, bboxWgs84, where = '1=1', outFields = '*', returnGeometry = true,
    maxAllowableOffset, autoGeneralizePxBudget, geometryPrecision,
    maxPages = DEFAULT_MAX_PAGES, timeoutMs, retries, signal, log,
  } = opts;

  const info = await getServiceInfo(url, { timeoutMs, retries, signal, log });
  const nativeWkid = info.nativeWkid ?? 4326;

  // Reproject the WGS84 bbox into the service's native SR when possible.
  let geometryParam: string | null = null;
  let inSR = 4326;
  let bboxNative: [number, number, number, number] | null = null;
  if (bboxWgs84) {
    bboxNative = bboxWgs84;
    if (nativeWkid !== 4326) {
      const re = await reprojectBbox(bboxWgs84, 4326, nativeWkid);
      if (re) { bboxNative = re; inSR = nativeWkid; }
      else log?.('[esri] no proj4 def for native SR — querying in WGS84', { url, nativeWkid });
    }
    geometryParam = bboxNative.join(',');
  }

  const baseParams: Record<string, string> = {
    where,
    outFields,
    returnGeometry: String(returnGeometry),
    outSR: String(nativeWkid),
    f: 'json',
  };
  if (geometryParam) {
    baseParams.geometry = geometryParam;
    baseParams.geometryType = 'esriGeometryEnvelope';
    baseParams.inSR = String(inSR);
    baseParams.spatialRel = 'esriSpatialRelIntersects';
  }
  let effectiveOffset = maxAllowableOffset ?? 0;
  if (!effectiveOffset && autoGeneralizePxBudget && bboxNative) {
    effectiveOffset = autoGeneralizationTolerance(bboxNative, autoGeneralizePxBudget);
  }
  if (returnGeometry && effectiveOffset > 0) {
    baseParams.maxAllowableOffset = String(effectiveOffset);
    baseParams.geometryPrecision = String(geometryPrecision ?? (inSR === 4326 ? 7 : 3));
  }

  const pageSize = Math.max(1, Math.min(info.maxRecordCount ?? FALLBACK_PAGE_SIZE, FALLBACK_PAGE_SIZE));
  const features: EsriFeature<A>[] = [];
  let pages = 0;
  let truncated = false;
  let firstUrl = '';

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams(baseParams);
    if (page > 0 || info.supportsPagination) {
      // Stable ordering is required for reliable resultOffset pagination.
      params.set('resultOffset', String(page * pageSize));
      params.set('resultRecordCount', String(pageSize));
      if (info.objectIdField) params.set('orderByFields', info.objectIdField);
    }
    const queryUrl = `${url}/query?${params.toString()}`;
    if (page === 0) firstUrl = queryUrl;
    log?.('[esri] query', { page, queryUrl });

    const data = await fetchEsriJson<{
      features?: EsriFeature<A>[];
      exceededTransferLimit?: boolean;
    }>(queryUrl, { timeoutMs, retries, signal, log });

    const pageFeatures = data.features ?? [];
    features.push(...pageFeatures);
    pages++;

    const exceeded = !!data.exceededTransferLimit || pageFeatures.length >= pageSize;
    if (!exceeded || pageFeatures.length === 0) { truncated = false; break; }
    if (!info.supportsPagination && page === 0) {
      // Server truncated and cannot paginate — surface it honestly.
      truncated = true;
      log?.('[esri] exceededTransferLimit and service does not support pagination', { url });
      break;
    }
    truncated = true; // provisional — cleared when a subsequent page completes the set
    if (page === maxPages - 1) log?.('[esri] maxPages reached — results truncated', { url, maxPages });
  }

  log?.('[esri] query complete', { url, featureCount: features.length, pages, truncated });
  return { features, outWkid: nativeWkid, pages, truncated, queryUrl: firstUrl };
}
