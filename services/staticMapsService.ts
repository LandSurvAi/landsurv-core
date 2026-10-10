/**
 * staticMapsService — Google Static Maps with a single-key cascade.
 *
 * Users should never NEED a second API key just for map imagery. Resolution
 * order for every request:
 *
 *   1. `user-maps`   — explicit Google Maps key from Settings (power-user
 *                      override; always trusted).
 *   2. `user-gemini` — the user's AI-Studio/Gemini key. AI Studio keys are
 *                      standard GCP API keys: when the underlying project has
 *                      the Static Maps API enabled + billing, the SAME key
 *                      works for maps. We probe once and cache the verdict.
 *   3. `proxy`       — backend `/api/maps/static` proxy signed with the
 *                      app's own server-side key (rate-limited).
 *
 * All fetches return a data-URL so the imagery can be attached directly as a
 * Gemini Vision inlineData part.
 */

import { readPersisted, writePersisted } from '../utils/mapTileCache.ts';

export type StaticMapSource = 'user-maps' | 'user-gemini' | 'proxy' | 'naip-proxy';

// Google imagery is kept short-lived to stay within Maps terms; NAIP is public domain.
const STATIC_PERSIST_TTL_MS = 24 * 60 * 60 * 1000;
const NAIP_PERSIST_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface StaticMapRequest {
  lat: number;
  lng: number;
  zoom?: number;              // default 18
  width?: number;             // default 640 (max 640)
  height?: number;            // default 640 (max 640)
  maptype?: 'roadmap' | 'satellite' | 'hybrid' | 'terrain' | 'naip';
  /** Optional markers as "lat,lng|lat,lng". */
  markers?: string;
  /**
   * CRS-native NAIP request: a projected bbox [minX, minY, maxX, maxY] plus
   * `sr` (EPSG code). When provided (naip only), the image is fetched and
   * reprojected server-side into that SR so it can be drawn 1:1 into the map
   * extent with no lat/lng→grid warping. Overrides lat/lng/zoom for NAIP.
   */
  projectedBbox?: [number, number, number, number];
  /** EPSG code that `projectedBbox` is expressed in. */
  sr?: number;
}

export interface StaticMapResult {
  /** data:image/png;base64,… */
  dataUrl: string;
  /** base64 payload only (for inlineData parts). */
  base64: string;
  mimeType: string;
  source: StaticMapSource;
  /**
   * Actual projected extent [minX, minY, maxX, maxY] the returned NAIP image
   * occupies, in the requested `sr`. Present only for CRS-native NAIP results.
   */
  extent?: [number, number, number, number];
}

export interface StaticMapKeys {
  /** The user's AI-Studio / Gemini key (settings.userApiKey). */
  geminiKey?: string;
  /** Explicit Google Maps key (settings.googleMaps?.apiKey). */
  mapsKey?: string;
}

const UPSTREAM = 'https://maps.googleapis.com/maps/api/staticmap';
const PROXY = '/api/maps/static';
const NAIP_PROXY = '/api/maps/naip';
const PROBE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── Gemini-key probe cache ───────────────────────────────────────────────────

function probeCacheKey(key: string): string {
  // Never persist the key itself — a stable non-reversible-ish tag suffices
  // for cache identity (key is already in localStorage elsewhere).
  return `staticmaps-probe:${key.length}:${key.slice(-6)}`;
}

function readProbeCache(key: string): boolean | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(probeCacheKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; ok: boolean };
    if (Date.now() - parsed.at > PROBE_TTL_MS) return null;
    return parsed.ok;
  } catch { return null; }
}

function writeProbeCache(key: string, ok: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(probeCacheKey(key), JSON.stringify({ at: Date.now(), ok }));
  } catch { /* ignore */ }
}

/** Test hook. */
export function clearStaticMapsProbeCache(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const kill: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('staticmaps-probe:')) kill.push(k);
    }
    kill.forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

/**
 * Probe whether a (Gemini) key can call the Static Maps API. One cheap
 * 100×100 request; verdict cached for 7 days.
 */
export async function probeKeyForStaticMaps(key: string): Promise<boolean> {
  const cached = readProbeCache(key);
  if (cached !== null) return cached;
  try {
    const params = new URLSearchParams({
      center: '0,0', zoom: '1', size: '100x100', maptype: 'roadmap', key,
    });
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 10_000);
    try {
      const resp = await fetch(`${UPSTREAM}?${params.toString()}`, { signal: ctl.signal });
      const ok = resp.ok && (resp.headers.get('content-type') ?? '').startsWith('image/');
      writeProbeCache(key, ok);
      return ok;
    } finally {
      clearTimeout(t);
    }
  } catch {
    // Network/CORS failure — do NOT cache negative verdicts from transient
    // errors for the full TTL; treat as not-usable this session only.
    return false;
  }
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function blobToDataUrl(blob: Blob): Promise<{ dataUrl: string; base64: string; mimeType: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
  const comma = dataUrl.indexOf(',');
  const header = dataUrl.slice(0, comma);
  const base64 = dataUrl.slice(comma + 1);
  const mimeType = header.match(/^data:([^;]+)/)?.[1] ?? 'image/png';
  return { dataUrl, base64, mimeType };
}

function buildParams(req: StaticMapRequest, key?: string): URLSearchParams {
  const params = new URLSearchParams({
    center: `${req.lat},${req.lng}`,
    zoom: String(req.zoom ?? 18),
    size: `${Math.min(req.width ?? 640, 640)}x${Math.min(req.height ?? 640, 640)}`,
    scale: '2',
    maptype: req.maptype === 'naip' ? 'satellite' : (req.maptype ?? 'satellite'),
  });
  if (req.markers) params.set('markers', req.markers);
  if (key) params.set('key', key);
  return params;
}

// ─── NAIP result cache (in-memory LRU) ───────────────────────────────────────
// The canvas re-requests imagery on every pan/zoom/re-render. Identical view
// requests (revisiting an extent, toggling opacity, StrictMode double-render,
// debounce trailing calls) should reuse the already-decoded image instead of
// re-hitting the backend proxy — which is both slow and bounded by a per-IP
// daily limit. Keyed by the exact request URL so results are always correct.
const NAIP_CACHE_MAX = 60;
const naipCache = new Map<string, StaticMapResult>();

export function clearStaticMapsCache(): void {
  naipCache.clear();
}

function naipCacheGet(key: string): StaticMapResult | undefined {
  const hit = naipCache.get(key);
  if (hit) {
    // Refresh recency (Map preserves insertion order → move to newest).
    naipCache.delete(key);
    naipCache.set(key, hit);
  }
  return hit;
}

function naipCacheSet(key: string, value: StaticMapResult): void {
  if (naipCache.has(key)) naipCache.delete(key);
  naipCache.set(key, value);
  while (naipCache.size > NAIP_CACHE_MAX) {
    const oldest = naipCache.keys().next().value;
    if (oldest === undefined) break;
    naipCache.delete(oldest);
  }
}

function buildNaipParams(req: StaticMapRequest): URLSearchParams {
  // NAIP is served by the USGS ImageServer (not Google Static Maps), so it can
  // render larger than the 640px Static-Maps free-tier cap — allow up to 1280px
  // per dimension for 2× retina imagery.
  const NAIP_MAX_DIM = 1280;
  // CRS-native path: projected bbox + SR (drawn 1:1 by the caller).
  if (req.projectedBbox && typeof req.sr === 'number') {
    const [minX, minY, maxX, maxY] = req.projectedBbox;
    return new URLSearchParams({
      bbox: `${minX},${minY},${maxX},${maxY}`,
      sr: String(req.sr),
      size: `${Math.min(req.width ?? 640, NAIP_MAX_DIM)}x${Math.min(req.height ?? 640, NAIP_MAX_DIM)}`,
    });
  }
  return new URLSearchParams({
    center: `${req.lat},${req.lng}`,
    zoom: String(req.zoom ?? 18),
    size: `${Math.min(req.width ?? 640, NAIP_MAX_DIM)}x${Math.min(req.height ?? 640, NAIP_MAX_DIM)}`,
  });
}

/** Fetch an image and expose the raw Response so callers can read headers. */
async function fetchImageWithResponse(url: string, timeoutMs = 20_000): Promise<{ blob: Blob; response: Response }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: ctl.signal });
    if (!resp.ok) {
      let detail = `${resp.status} ${resp.statusText}`;
      try {
        const body = await resp.json();
        if (body?.error) detail = String(body.error);
      } catch { /* image/text body */ }
      throw new Error(`Static map fetch failed: ${detail}`);
    }
    const ct = resp.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/')) throw new Error(`Static map returned non-image content (${ct})`);
    return { blob: await resp.blob(), response: resp };
  } finally {
    clearTimeout(t);
  }
}

async function fetchImage(url: string, timeoutMs = 20_000): Promise<Blob> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: ctl.signal });
    if (!resp.ok) {
      let detail = `${resp.status} ${resp.statusText}`;
      try {
        const body = await resp.json();
        if (body?.error) detail = String(body.error);
      } catch { /* image/text body */ }
      throw new Error(`Static map fetch failed: ${detail}`);
    }
    const ct = resp.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/')) throw new Error(`Static map returned non-image content (${ct})`);
    return await resp.blob();
  } finally {
    clearTimeout(t);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch a static map through the key cascade. Throws only when every source
 * fails (including the proxy).
 */
export async function getStaticMap(req: StaticMapRequest, keys: StaticMapKeys = {}): Promise<StaticMapResult> {
  const errors: string[] = [];

  // NAIP imagery is fetched from the app proxy (USGS/ArcGIS backend source).
  if (req.maptype === 'naip') {
    const naipUrl = `${NAIP_PROXY}?${buildNaipParams(req)}`;
    const cached = naipCacheGet(naipUrl);
    if (cached) return cached;
    const persistedNaip = await readPersisted<StaticMapResult>(`naip|${naipUrl}`, NAIP_PERSIST_TTL_MS);
    if (persistedNaip) {
      naipCacheSet(naipUrl, persistedNaip);
      return persistedNaip;
    }
    try {
      const { blob, response } = await fetchImageWithResponse(naipUrl);
      const base = { ...(await blobToDataUrl(blob)), source: 'naip-proxy' as const };
      const extentHeader = response.headers.get('X-Naip-Extent');
      let result: StaticMapResult = base;
      if (extentHeader) {
        const parts = extentHeader.split(',').map(Number);
        if (parts.length === 4 && parts.every(n => Number.isFinite(n))) {
          result = { ...base, extent: [parts[0], parts[1], parts[2], parts[3]] };
        }
      }
      naipCacheSet(naipUrl, result);
      void writePersisted(`naip|${naipUrl}`, result);
      return result;
    } catch (e) {
      errors.push(`naip-proxy: ${e instanceof Error ? e.message : String(e)}`);
      throw new Error(`NAIP static map fetch failed — ${errors.join(' | ')}`);
    }
  }

  // 1. Explicit user Maps key.
  const staticKey = `static|${buildParams(req).toString()}`;
  const persistedStatic = await readPersisted<StaticMapResult>(staticKey, STATIC_PERSIST_TTL_MS);
  if (persistedStatic) return persistedStatic;
  const remember = (result: StaticMapResult): StaticMapResult => {
    void writePersisted(staticKey, result);
    return result;
  };

  if (keys.mapsKey) {
    try {
      const blob = await fetchImage(`${UPSTREAM}?${buildParams(req, keys.mapsKey)}`);
      return remember({ ...(await blobToDataUrl(blob)), source: 'user-maps' });
    } catch (e) {
      errors.push(`user-maps: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 2. User's Gemini key (probe-verified).
  if (keys.geminiKey && await probeKeyForStaticMaps(keys.geminiKey)) {
    try {
      const blob = await fetchImage(`${UPSTREAM}?${buildParams(req, keys.geminiKey)}`);
      return remember({ ...(await blobToDataUrl(blob)), source: 'user-gemini' });
    } catch (e) {
      errors.push(`user-gemini: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 3. Backend proxy.
  try {
    const blob = await fetchImage(`${PROXY}?${buildParams(req)}`);
    return remember({ ...(await blobToDataUrl(blob)), source: 'proxy' });
  } catch (e) {
    errors.push(`proxy: ${e instanceof Error ? e.message : String(e)}`);
  }

  throw new Error(`All static map sources failed — ${errors.join(' | ')}`);
}
