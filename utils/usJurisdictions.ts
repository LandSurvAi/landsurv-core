// Free US jurisdiction lookups via the Census Bureau TIGERweb ArcGIS REST API.
//
// Why TIGERweb instead of the older `api.census.gov/data` ACS endpoints?
// As of 2025 the ACS data API requires an API key for every call. TIGERweb
// (the underlying TIGER/Line geographic service) remains key-free, public
// domain, and CORS-enabled for browser apps.
//
// Endpoints used (all GET, JSON):
//   Counties:                /Generalized_ACS2023/State_County/MapServer/13
//   Incorporated Places:     /Generalized_ACS2023/Places_CouSub_ConCity_SubMCD/MapServer/10
//   County Subdivisions:     /Generalized_ACS2023/Places_CouSub_ConCity_SubMCD/MapServer/7
//
// Each query is cached in localStorage forever (data is stable year-over-year)
// so we make at most ONE HTTP call per (state, kind) tuple across all sessions.

import { useEffect, useState } from 'react';

// --- State FIPS map (the only bundled data, ~1 KB) --------------------------
export const STATE_FIPS_BY_NAME: Record<string, string> = {
  'Alabama': '01', 'Alaska': '02', 'Arizona': '04', 'Arkansas': '05',
  'California': '06', 'Colorado': '08', 'Connecticut': '09', 'Delaware': '10',
  'District of Columbia': '11', 'Florida': '12', 'Georgia': '13', 'Hawaii': '15',
  'Idaho': '16', 'Illinois': '17', 'Indiana': '18', 'Iowa': '19',
  'Kansas': '20', 'Kentucky': '21', 'Louisiana': '22', 'Maine': '23',
  'Maryland': '24', 'Massachusetts': '25', 'Michigan': '26', 'Minnesota': '27',
  'Mississippi': '28', 'Missouri': '29', 'Montana': '30', 'Nebraska': '31',
  'Nevada': '32', 'New Hampshire': '33', 'New Jersey': '34', 'New Mexico': '35',
  'New York': '36', 'North Carolina': '37', 'North Dakota': '38', 'Ohio': '39',
  'Oklahoma': '40', 'Oregon': '41', 'Pennsylvania': '42', 'Rhode Island': '44',
  'South Carolina': '45', 'South Dakota': '46', 'Tennessee': '47', 'Texas': '48',
  'Utah': '49', 'Vermont': '50', 'Virginia': '51', 'Washington': '53',
  'West Virginia': '54', 'Wisconsin': '55', 'Wyoming': '56',
};

const TIGER_BASE = 'https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2023';
const COUNTIES_LAYER = `${TIGER_BASE}/State_County/MapServer/13/query`;
const PLACES_LAYER   = `${TIGER_BASE}/Places_CouSub_ConCity_SubMCD/MapServer/10/query`;
const COUSUB_LAYER   = `${TIGER_BASE}/Places_CouSub_ConCity_SubMCD/MapServer/7/query`;

const CACHE_VERSION = 'v2-tigerweb';
const LS_PREFIX = `landsurv.census.${CACHE_VERSION}.`;
const PAGE_SIZE = 2000;
const MAX_RECORDS_SAFETY = 50000;

// --- Cache helpers ----------------------------------------------------------
function cacheGet(key: string): string[] | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : null;
  } catch { return null; }
}

function cacheSet(key: string, value: string[]): void {
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); } catch { /* quota */ }
}

function titleCaseSuffix(name: string): string {
  return name.replace(/\b(township|borough|city|town|village|county|parish|municipality|cdp)\b/gi, m => {
    if (m.toLowerCase() === 'cdp') return 'CDP';
    return m.charAt(0).toUpperCase() + m.slice(1).toLowerCase();
  });
}

// --- TIGERweb pagination ----------------------------------------------------
async function tigerQuery(
  url: string,
  stateFips: string,
  outField: 'BASENAME' | 'NAME',
): Promise<string[]> {
  const out: string[] = [];
  let offset = 0;
  while (offset < MAX_RECORDS_SAFETY) {
    const qs = new URLSearchParams({
      where: `STATE='${stateFips}'`,
      outFields: outField,
      f: 'json',
      returnGeometry: 'false',
      resultRecordCount: String(PAGE_SIZE),
      resultOffset: String(offset),
    });
    const r = await fetch(`${url}?${qs.toString()}`);
    if (!r.ok) throw new Error(`TIGERweb HTTP ${r.status}`);
    const j = await r.json() as any;
    if (j?.error) throw new Error(`TIGERweb error: ${j.error.message || 'unknown'}`);
    const features = (j?.features || []) as Array<{ attributes: Record<string, any> }>;
    for (const f of features) {
      const v = f?.attributes?.[outField];
      if (v) out.push(String(v));
    }
    if (!j?.exceededTransferLimit || features.length === 0) break;
    offset += features.length;
  }
  return out;
}

// Lower-level variant that returns full attribute records (used when we need
// more than a single field — e.g. NAME + COUNTY, or BASENAME + GEOID).
async function tigerQueryRecords(
  url: string,
  where: string,
  outFields: string[],
): Promise<Array<Record<string, any>>> {
  const out: Array<Record<string, any>> = [];
  let offset = 0;
  while (offset < MAX_RECORDS_SAFETY) {
    const qs = new URLSearchParams({
      where,
      outFields: outFields.join(','),
      f: 'json',
      returnGeometry: 'false',
      resultRecordCount: String(PAGE_SIZE),
      resultOffset: String(offset),
    });
    const r = await fetch(`${url}?${qs.toString()}`);
    if (!r.ok) throw new Error(`TIGERweb HTTP ${r.status}`);
    const j = await r.json() as any;
    if (j?.error) throw new Error(`TIGERweb error: ${j.error.message || 'unknown'}`);
    const features = (j?.features || []) as Array<{ attributes: Record<string, any> }>;
    for (const f of features) {
      if (f?.attributes) out.push(f.attributes);
    }
    if (!j?.exceededTransferLimit || features.length === 0) break;
    offset += features.length;
  }
  return out;
}

// --- Counties ---------------------------------------------------------------
export async function loadCountiesForState(stateName: string): Promise<string[]> {
  const fips = STATE_FIPS_BY_NAME[stateName];
  if (!fips) return [];
  const key = `counties.${fips}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const raw = await tigerQuery(COUNTIES_LAYER, fips, 'BASENAME');
  const out = Array.from(new Set(raw))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  cacheSet(key, out);
  return out;
}

// Same data set but keyed by lowercase county name → 3-digit county FIPS.
// Needed to filter the municipality COUSUB layer by county.
const countyFipsMemo = new Map<string, Record<string, string>>();
export async function loadCountyFipsMap(stateName: string): Promise<Record<string, string>> {
  const fips = STATE_FIPS_BY_NAME[stateName];
  if (!fips) return {};
  if (countyFipsMemo.has(fips)) return countyFipsMemo.get(fips)!;
  const key = `countyFips.${fips}`;
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string>;
      countyFipsMemo.set(fips, parsed);
      return parsed;
    }
  } catch { /* ignore */ }

  const records = await tigerQueryRecords(
    COUNTIES_LAYER,
    `STATE='${fips}'`,
    ['BASENAME', 'COUNTY', 'GEOID'],
  );
  const map: Record<string, string> = {};
  for (const r of records) {
    const name = String(r.BASENAME || '').trim();
    // Prefer COUNTY (3-digit) if present, else derive from GEOID (5-digit = state+county).
    let cfips = r.COUNTY ? String(r.COUNTY).padStart(3, '0') : '';
    if (!cfips && r.GEOID && String(r.GEOID).length >= 5) cfips = String(r.GEOID).slice(2, 5);
    if (name && cfips) map[name.toLowerCase()] = cfips;
  }
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(map)); } catch { /* quota */ }
  countyFipsMemo.set(fips, map);
  return map;
}

// --- Municipalities (places + county subdivisions) --------------------------
// Many US municipalities are county subdivisions (PA, NJ, NY, MI, WI
// townships) rather than incorporated places. Both layers are queried in
// parallel and merged.
export async function loadMunicipalitiesForState(stateName: string): Promise<string[]> {
  const fips = STATE_FIPS_BY_NAME[stateName];
  if (!fips) return [];
  const key = `municipalities.${fips}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const [places, subs] = await Promise.allSettled([
    tigerQuery(PLACES_LAYER, fips, 'NAME'),
    tigerQuery(COUSUB_LAYER, fips, 'NAME'),
  ]);

  const merged = new Set<string>();
  const collect = (s: PromiseSettledResult<string[]>) => {
    if (s.status === 'fulfilled') {
      for (const raw of s.value) {
        const clean = titleCaseSuffix(raw).replace(/\s*\(part\)\s*$/i, '').trim();
        if (clean.length > 1) merged.add(clean);
      }
    }
  };
  collect(places);
  collect(subs);

  if (places.status === 'rejected' && subs.status === 'rejected') {
    throw new Error(`TIGERweb places+subdivisions failed: ${(places.reason as Error)?.message || ''}`);
  }

  const out = Array.from(merged).sort((a, b) => a.localeCompare(b));
  cacheSet(key, out);
  return out;
}

// Municipalities (county subdivisions) within a specific county. Returns
// only the COUSUB layer rows whose COUNTY field matches \u2014 which is the
// authoritative municipality list for "MCD states" like PA, NJ, NY, MI, WI,
// MA, CT, RI, VT, NH, ME, MN, WI. Returns [] for unknown counties so the
// caller can fall back to the state-wide list.
export async function loadMunicipalitiesForCounty(
  stateName: string,
  countyName: string,
): Promise<string[]> {
  const stateFips = STATE_FIPS_BY_NAME[stateName];
  if (!stateFips || !countyName) return [];

  // Strip trailing " County" / " Parish" the user may have typed.
  const cleanedCounty = countyName.replace(/\s+(county|parish|borough|municipality|census area)\s*$/i, '').trim();
  if (!cleanedCounty) return [];

  const fipsMap = await loadCountyFipsMap(stateName);
  const countyFips = fipsMap[cleanedCounty.toLowerCase()];
  if (!countyFips) return [];

  const cacheKey = `municipalities.${stateFips}.${countyFips}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const where = `STATE='${stateFips}' AND COUNTY='${countyFips}'`;
  const records = await tigerQueryRecords(COUSUB_LAYER, where, ['NAME']);
  const merged = new Set<string>();
  for (const r of records) {
    const raw = String(r.NAME || '').trim();
    if (!raw) continue;
    const clean = titleCaseSuffix(raw).replace(/\s*\(part\)\s*$/i, '').trim();
    if (clean.length > 1) merged.add(clean);
  }
  const out = Array.from(merged).sort((a, b) => a.localeCompare(b));
  cacheSet(cacheKey, out);
  return out;
}

// --- React helper hook ------------------------------------------------------
export interface JurisdictionListState {
  loading: boolean;
  error: string | null;
  list: string[];
}

export function useJurisdictionList(
  loader: (state: string) => Promise<string[]>,
  stateName: string | undefined,
): JurisdictionListState {
  const [list, setList] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!stateName || !STATE_FIPS_BY_NAME[stateName]) { setList([]); setError(null); return; }
    let cancelled = false;
    setLoading(true); setError(null);
    loader(stateName).then(r => { if (!cancelled) setList(r); })
      .catch(e => { if (!cancelled) setError(String(e?.message || e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [stateName, loader]);

  return { list, loading, error };
}

// Municipality list scoped to a specific county. Falls back to empty list
// when the county can't be resolved (caller can substitute the state-wide
// list in that case). Debounced 250 ms so it doesn\u2019t fire on every
// keystroke as the user types the county name.
export function useMunicipalitiesForCounty(
  stateName: string | undefined,
  countyName: string | undefined,
): JurisdictionListState {
  const [list, setList] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!stateName || !STATE_FIPS_BY_NAME[stateName] || !countyName || countyName.trim().length < 2) {
      setList([]); setError(null); setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true); setError(null);
    const t = window.setTimeout(() => {
      loadMunicipalitiesForCounty(stateName, countyName)
        .then(r => { if (!cancelled) setList(r); })
        .catch(e => { if (!cancelled) setError(String(e?.message || e)); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [stateName, countyName]);

  return { list, loading, error };
}
