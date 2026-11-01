/**
 * Dynamic proj4 injection for global CRSs.
 *
 * Resolution order for an EPSG code:
 *   1. bundled catalogue (instant, offline)
 *   2. localStorage definition cache (instant)
 *   3. backend `/api/crs/:code` (complete epsg-index dataset)
 *   4. epsg.io direct fallback (static deployments / backend offline)
 *
 * Definitions are registered into proj4 lazily, so the app never bundles the
 * whole EPSG dataset in the browser. Coordinate epochs (+t_epoch) and NTv2
 * grids (+nadgrids, loaded from a .gsb file) are carried through the injected
 * proj4 string.
 */
import proj4 from 'proj4';
import { GLOBAL_CRS, getBundledCrs } from './globalCatalog.ts';
import type { CrsDefinition, CrsKind, CrsSuggestion } from './types.ts';

const API_BASE = '/api/crs';
const CACHE_KEY = 'landsurv_crs_definition_cache_v1';
const CACHE_LIMIT = 250;
const inFlight = new Map<number, Promise<CrsDefinition | null>>();
const loadedGrids = new Set<string>();
let definitionCache: Map<number, CrsDefinition> | null = null;

export interface RegisterCrsOptions {
  /** Decimal survey epoch, e.g. 2026.5. Carried as +t_epoch for PROJ-aware clients. */
  epoch?: number | null;
  /** proj4 nadgrid key created by loadNtV2Grid(). */
  nadgridKey?: string | null;
}

/** Common names that do not literally appear in the EPSG CRS name. */
const LOCAL_ALIASES: Record<number, string> = {
  3857: 'web mercator pseudo mercator google',
  3395: 'world mercator',
  27700: 'british national grid osgb ordnance survey great britain',
  29903: 'irish grid ireland northern ireland',
  2154: 'lambert 93 rgf93 france',
  2193: 'nztm new zealand transverse mercator 2000',
  3035: 'laea europe etrs89 lambert azimuthal equal area',
  3034: 'lcc europe etrs89 lambert conformal conic',
  28992: 'rd new amersfoort netherlands',
  2056: 'lv95 switzerland',
  21781: 'lv03 switzerland',
  3006: 'sweref99 sweden',
  5514: 'krovak czechia slovakia',
  2180: 'cs92 poland',
  23700: 'eov hungary',
  3763: 'portugal tm06',
  31983: 'sirgas brazil utm 23s',
  5070: 'conus albers united states usa',
  6668: 'jgd2011 japan',
  7844: 'gda2020 australia',
  28348: 'gda94 mga australia',
};

function storageAvailable(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function readCache(): Map<number, CrsDefinition> {
  if (definitionCache) return definitionCache;
  definitionCache = new Map();
  if (!storageAvailable()) return definitionCache;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return definitionCache;
    const parsed = JSON.parse(raw) as Record<string, CrsDefinition>;
    for (const [key, value] of Object.entries(parsed)) {
      const code = Number(key);
      if (Number.isFinite(code) && value && Number.isFinite(Number(value.code))) {
        definitionCache.set(code, value);
      }
    }
  } catch {
    // Corrupt cache — start clean rather than breaking projection selection.
  }
  return definitionCache;
}

function persistCache(): void {
  if (!storageAvailable()) return;
  try {
    const cached = Array.from(readCache().values()).slice(-CACHE_LIMIT);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(cached.map(def => [def.code, def]))));
  } catch {
    // Quota / private mode — memory cache still works for this session.
  }
}

export function cacheCrsDefinition(definition: CrsDefinition): void {
  if (!definition || !Number.isFinite(Number(definition.code))) return;
  readCache().set(Number(definition.code), definition);
  persistCache();
}

function stripTypeSuffix(proj4Def: string): string {
  return proj4Def.replace(/\s+\+type=crs\b/gi, '').trim();
}

/**
 * Build the proj4 string that is injected for a CRS.
 *
 * If a CRS needs an NTv2 grid that has not been loaded, the +nadgrids term is
 * removed: proj4js otherwise silently returns NaN for every coordinate. The
 * CRS metadata still advertises the grid so the UI can offer to load it.
 */
export function composeProj4(definition: CrsDefinition, options: RegisterCrsOptions = {}): string | null {
  if (!definition.proj4) return null;
  let def = stripTypeSuffix(definition.proj4);

  const gridName = definition.gridShift || null;
  const gridLoaded = Boolean(options.nadgridKey) || (gridName ? loadedGrids.has(gridName) : false);

  if (!gridLoaded) {
    def = def.replace(/\s+\+nadgrids=(?!null\b|@null\b)[^\s]+/gi, '');
  }
  if (options.nadgridKey) {
    def = /\s\+nadgrids=/.test(def)
      ? def.replace(/\+nadgrids=[^\s]+/gi, `+nadgrids=${options.nadgridKey}`)
      : `${def} +nadgrids=${options.nadgridKey}`;
  }
  if (Number.isFinite(options.epoch as number)) {
    def = `${def} +t_epoch=${Number(options.epoch).toFixed(1)}`;
  }
  return def;
}

export interface RegisterResult {
  registered: boolean;
  proj4: string | null;
  reason?: string;
}

/** Register a CRS definition with proj4. Idempotent and safe to call eagerly. */
export function registerCrsDefinition(
  definition: CrsDefinition,
  options: RegisterCrsOptions = {},
): RegisterResult {
  const def = composeProj4(definition, options);
  if (!def) return { registered: false, proj4: null, reason: 'No proj4 definition is available' };
  try {
    proj4.defs(`EPSG:${definition.code}`, def);
    return { registered: true, proj4: def };
  } catch (err: any) {
    return { registered: false, proj4: def, reason: err?.message || 'proj4 rejected the definition' };
  }
}

/** Synchronously register a CRS that exists in the offline catalogue. */
export function registerBundledCrs(code: number, options: RegisterCrsOptions = {}): boolean {
  const bundled = getBundledCrs(code);
  if (!bundled) return false;
  return registerCrsDefinition(bundled, options).registered;
}

export function isCrsRegistered(code: number): boolean {
  return Boolean(proj4.defs(`EPSG:${code}`));
}

function normalizeRemote(raw: any): CrsDefinition | null {
  const code = Number(raw?.code);
  if (!Number.isFinite(code)) return null;
  const bbox = Array.isArray(raw.bbox) && raw.bbox.length === 4
    ? raw.bbox.map(Number) as [number, number, number, number]
    : null;
  return {
    code,
    name: String(raw.name || `EPSG:${code}`),
    kind: raw.kind === 'projected' || raw.kind === 'geographic' ? raw.kind : 'other',
    proj4: typeof raw.proj4 === 'string' ? raw.proj4 : null,
    wkt: typeof raw.wkt === 'string' ? raw.wkt : null,
    bbox: bbox && bbox.every(Number.isFinite) ? bbox : null,
    unit: raw.unit ?? null,
    area: raw.area ?? null,
    country: raw.country ?? null,
    accuracy: typeof raw.accuracy === 'number' ? raw.accuracy : null,
    epoch: typeof raw.transform?.epoch === 'number'
      ? raw.transform.epoch
      : (typeof raw.epoch === 'number' ? raw.epoch : null),
    dynamic: Boolean(raw.transform?.dynamic ?? raw.dynamic),
    gridShift: raw.transform?.gridShift ?? raw.gridShift ?? null,
    source: 'registry',
  };
}

async function fetchDefinition(code: number): Promise<CrsDefinition | null> {
  try {
    const res = await fetch(`${API_BASE}/${code}`, { headers: { accept: 'application/json' } });
    if (res.ok) {
      const def = normalizeRemote(await res.json());
      if (def) {
        cacheCrsDefinition(def);
        return def;
      }
    }
  } catch {
    // Backend offline or blocked — try epsg.io directly below.
  }

  try {
    const res = await fetch(`https://epsg.io/${code}.json`, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const def = normalizeRemote(await res.json());
    if (def) {
      def.source = 'epsg.io';
      cacheCrsDefinition(def);
      return def;
    }
  } catch {
    // No network path left.
  }
  return null;
}

/**
 * Guarantee that proj4 knows an EPSG code, fetching/injecting it if needed.
 * Concurrent callers share one request per code.
 */
export async function ensureCrsRegistered(
  code: number,
  options: RegisterCrsOptions = {},
  known?: CrsDefinition | null,
): Promise<CrsDefinition | null> {
  const key = `EPSG:${code}`;
  if (proj4.defs(key) && !options.epoch && !options.nadgridKey && !known) {
    return getBundledCrs(code) || readCache().get(code) || {
      code,
      name: `EPSG:${code}`,
      kind: 'other',
      proj4: String(proj4.defs(key)),
      source: 'registry',
    };
  }

  const pending = inFlight.get(code);
  if (pending) return pending;

  const job = (async (): Promise<CrsDefinition | null> => {
    const definition =
      known ||
      getBundledCrs(code) ||
      readCache().get(code) ||
      null;

    let resolved = definition;
    if (!resolved || !resolved.proj4) {
      resolved = (await fetchDefinition(code)) || resolved;
    }

    if (resolved && resolved.proj4) {
      const result = registerCrsDefinition(resolved, options);
      if (!result.registered) {
        console.warn(`[crs] Could not register EPSG:${code}:`, result.reason);
      }
      return resolved;
    }

    // The definition may have been registered earlier in this session (e.g.
    // persisted session) but is not in a cache.
    if (proj4.defs(key)) {
      return {
        code,
        name: resolved?.name || `EPSG:${code}`,
        kind: resolved?.kind || 'other',
        proj4: String(proj4.defs(key)),
        epoch: resolved?.epoch ?? null,
        dynamic: resolved?.dynamic ?? false,
        gridShift: resolved?.gridShift ?? null,
        source: resolved?.source || 'registry',
      };
    }
    return resolved;
  })();

  inFlight.set(code, job);
  try {
    return await job;
  } finally {
    inFlight.delete(code);
  }
}

function normalizeQuery(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^epsg\s*[:_]?\s*/i, '')
    .replace(/\bweb\s*mercator\b/g, 'pseudo-mercator')
    .replace(/\blambert\s+conformal\s+conic\b/g, 'lambert conic conformal')
    .replace(/\blambert\s+conformal\b/g, 'lambert conic conformal')
    .replace(/\s+/g, ' ');
}

function techniqueKeywords(name: string): string {
  const lower = name.toLowerCase();
  const terms: string[] = [];
  if (lower.includes('utm')) terms.push('utm universal transverse mercator');
  if (lower.includes('mga')) terms.push('mga map grid of australia utm');
  if (lower.includes('lambert')) terms.push('lambert conformal conic lcc');
  if (lower.includes('transverse mercator')) terms.push('transverse mercator tm');
  if (lower.includes('mercator')) terms.push('mercator');
  if (lower.includes('albers')) terms.push('albers equal area conic');
  if (lower.includes('stereographic')) terms.push('stereographic');
  if (lower.includes('krovak')) terms.push('krovak');
  if (lower.includes('azimuthal')) terms.push('azimuthal');
  return terms.join(' ');
}

function searchableText(def: CrsDefinition): string {
  return [
    def.code,
    def.name,
    def.area || '',
    def.country || '',
    def.unit || '',
    LOCAL_ALIASES[def.code] || '',
    techniqueKeywords(def.name),
  ].join(' ').toLowerCase();
}

function scoreCrs(def: CrsDefinition, query: string, tokens: string[]): number {
  const code = String(def.code);
  const name = def.name.toLowerCase();
  let score = 0;

  if (code === query) score += 1000;
  else if (code.startsWith(query)) score += 420;

  if (name === query) score += 850;
  else if (name.startsWith(query)) score += 360;
  else if (name.includes(query)) score += 230;

  if (def.country && def.country.toLowerCase().includes(query)) score += 190;
  if (def.area && def.area.toLowerCase().includes(query)) score += 120;

  if (score === 0) {
    if (!tokens.length || !tokens.every(token => searchableText(def).includes(token))) return -1;
    score += 90;
  }

  if (def.proj4) score += 15;
  if (def.kind === 'projected') score += 5;
  if (def.epoch != null) score += 3; // prefer the current realisation (GDA2020 over GDA94)
  score -= Math.min(25, name.length / 10);
  return score;
}

export function searchCrsLocal(query: string, limit = 20): CrsDefinition[] {
  const normalized = normalizeQuery(query);
  if (!normalized) return [];
  const tokens = normalized.split(' ').filter(Boolean);
  return GLOBAL_CRS
    .map(def => ({ def, score: scoreCrs(def, normalized, tokens) }))
    .filter(hit => hit.score >= 0)
    .sort((a, b) => b.score - a.score || a.def.code - b.def.code)
    .slice(0, Math.max(1, limit))
    .map(hit => hit.def);
}

function rankCrs(definitions: CrsDefinition[], query: string): CrsDefinition[] {
  const normalized = normalizeQuery(query);
  const tokens = normalized.split(' ').filter(Boolean);
  return definitions
    .map(def => ({ def, score: scoreCrs(def, normalized, tokens) }))
    .filter(hit => hit.score >= 0)
    .sort((a, b) => b.score - a.score || a.def.code - b.def.code)
    .map(hit => hit.def);
}

async function fetchRemoteSearch(query: string, limit: number): Promise<CrsDefinition[]> {
  try {
    const res = await fetch(
      `${API_BASE}/search?q=${encodeURIComponent(query)}&limit=${limit}`,
      { headers: { accept: 'application/json' } },
    );
    if (!res.ok) return [];
    const data = await res.json() as { results?: unknown[] };
    if (!Array.isArray(data.results)) return [];
    return data.results.map(normalizeRemote).filter((def): def is CrsDefinition => Boolean(def));
  } catch {
    return [];
  }
}

/**
 * Search the full EPSG registry (backend) plus the offline catalogue.
 * Falls back silently to the offline catalogue when the backend is unavailable.
 */
export async function searchCrs(query: string, limit = 20): Promise<CrsDefinition[]> {
  if (!query.trim()) return [];
  const local = searchCrsLocal(query, limit);
  const remote = await fetchRemoteSearch(query, limit);
  if (!remote.length) return local;

  const merged = new Map<number, CrsDefinition>();
  for (const def of remote) merged.set(def.code, def);
  for (const def of local) {
    merged.set(def.code, { ...merged.get(def.code), ...def, source: 'bundled' });
  }
  return rankCrs(Array.from(merged.values()), query).slice(0, Math.max(1, limit));
}

function bboxArea(bbox: [number, number, number, number]): number {
  const [west, south, east, north] = bbox;
  const width = east >= west ? east - west : 360 - (west - east);
  return Math.max(width, 0.0001) * Math.max(north - south, 0.0001);
}

function bboxContains(bbox: [number, number, number, number], lon: number, lat: number): boolean {
  const [west, south, east, north] = bbox;
  if (lat < south || lat > north) return false;
  return west <= east ? lon >= west && lon <= east : lon >= west || lon <= east;
}

/**
 * Rank bundled CRSs covering a point. National grids beat continental systems;
 * among UTM/MGA families the nearest central meridian wins.
 */
export function suggestCrsLocal(lat: number, lon: number, limit = 6): CrsSuggestion[] {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return [];

  const suggestions: CrsSuggestion[] = [];
  for (const def of GLOBAL_CRS) {
    if (!def.bbox || def.kind === 'other' || !bboxContains(def.bbox, lon, lat)) continue;

    let score = 100;
    score += Math.max(0, 45 - Math.log10(bboxArea(def.bbox) + 0.01) * 12);
    let reason = 'Regional grid covering this location';

    const zoneMatch = /zone\s+(\d{1,2})/i.exec(def.name);
    if (def.kind === 'projected') {
      score += 35;
      if (/UTM|MGA/i.test(def.name) && zoneMatch) {
        const centralMeridian = Number(zoneMatch[1]) * 6 - 183;
        score += 30 - Math.abs(lon - centralMeridian) * 2;
        reason = 'UTM/MGA zone containing this location';
      } else if (def.country && def.country !== 'Global') {
        score += 25;
        reason = `National grid for ${def.country}`;
      }
    } else {
      score -= 45;
      reason = 'Geographic coordinate system covering this location';
    }

    if (def.gridShift) score += 8;
    suggestions.push({ ...def, score, reason });
  }

  suggestions.sort((a, b) => b.score - a.score || a.code - b.code);
  const top = suggestions.slice(0, Math.max(1, limit));
  if (top.length === 0) {
    const wgs84 = getBundledCrs(4326);
    if (wgs84) top.push({ ...wgs84, score: 1, reason: 'Global geographic fallback' });
  }
  return top;
}

export interface CrsLocation {
  lat: number;
  lon: number;
  label?: string;
}

/** Convert a WGS84 [west, south, east, north] envelope to a centroid location. */
export function locationFromBbox(bbox: [number, number, number, number] | null | undefined): CrsLocation | null {
  if (!bbox || bbox.length !== 4 || !bbox.every(Number.isFinite)) return null;
  const [west, south, east, north] = bbox;
  const lon = east >= west ? (west + east) / 2 : ((west + east + 360) / 2) % 360 - 180;
  return { lat: (south + north) / 2, lon, label: 'your project area' };
}

/**
 * Local suggestions (instant) merged with the backend's EPSG-wide suggestions.
 * Remote extras are appended after the curated local matches.
 */
export async function suggestCrsForLocation(location: CrsLocation, limit = 6): Promise<CrsSuggestion[]> {
  const local = suggestCrsLocal(location.lat, location.lon, limit);
  const seen = new Set(local.map(def => def.code));

  try {
    const res = await fetch(
      `${API_BASE}/suggest?lat=${encodeURIComponent(location.lat)}&lon=${encodeURIComponent(location.lon)}&limit=${limit}`,
      { headers: { accept: 'application/json' } },
    );
    if (!res.ok) return local;
    const data = await res.json() as { suggestions?: any[] };
    if (!Array.isArray(data.suggestions)) return local;
    for (const raw of data.suggestions) {
      const def = normalizeRemote(raw);
      if (!def || seen.has(def.code)) continue;
      seen.add(def.code);
      local.push({
        ...def,
        score: typeof raw.score === 'number' ? raw.score : 0,
        reason: typeof raw.reason === 'string' ? raw.reason : 'Registry suggestion',
      });
    }
  } catch {
    // Offline-first: local results are already usable.
  }
  return local.slice(0, Math.max(1, limit));
}

/** Register a user-supplied NTv2 (.gsb) grid and remember its proj4 nadgrid key. */
export async function loadNtV2Grid(file: File, definition: CrsDefinition): Promise<string> {
  const key = file.name.replace(/[^A-Za-z0-9._-]/g, '_');
  const buffer = await file.arrayBuffer();
  const nadgrid = (proj4 as unknown as { nadgrid?: (name: string, data: ArrayBuffer) => unknown }).nadgrid;
  if (typeof nadgrid !== 'function') {
    throw new Error('This proj4 build does not support NTv2 grids');
  }
  nadgrid(key, buffer);
  loadedGrids.add(key);
  if (definition.gridShift) loadedGrids.add(definition.gridShift);
  return key;
}

/** Display helper for settings/UI. */
export function getCrsDisplayName(code: number | null | undefined): string | null {
  if (!code) return null;
  return getBundledCrs(code)?.name || readCache().get(code)?.name || null;
}

/** Test/UI helper: how many CRSs can be injected without any network request. */
export function availableOfflineCrsCount(): number {
  return GLOBAL_CRS.length;
}
