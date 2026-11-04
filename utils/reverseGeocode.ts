// Free reverse geocoding for US coordinates.
//
// Primary: the US Census Geocoder — no API key, no rate-limit gate, and it
// returns the state, county, and incorporated place (or county subdivision /
// township) for any point in the United States.
//
// Fallback: OpenStreetMap Nominatim's reverse endpoint. Census is occasionally
// slow or blocked by corporate/school networks, and this module is used to
// pre-select a jurisdiction in the UI — an unreachable provider must never
// leave a spinner running.
//
// Endpoint references:
//   https://geocoding.geo.census.gov/geocoder/Geographies_layers.html
//   https://nominatim.org/release-docs/latest/api/Reverse/

export interface GeocodeResult {
  state?: string;     // full state name, e.g. "Pennsylvania"
  county?: string;    // bare basename, no " County" suffix
  place?: string;     // "Schwenksville" (preferred) or township name (fallback)
  placeType?: 'incorporated' | 'subdivision';
  source: 'census-geocoder' | 'nominatim' | 'projection';
}

const CENSUS_ENDPOINT = 'https://geocoding.geo.census.gov/geocoder/geographies/coordinates';
const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';

/** Per-provider ceiling. Two providers worst-case ≈ 8 s, and the parcel
 *  panel adds its own watchdog so the UI always resolves. */
const REQUEST_TIMEOUT_MS = 4_000;

/** fetch + JSON with a hard timeout, composed with the caller's signal. */
async function fetchJson(
  url: string,
  signal?: AbortSignal,
  init: RequestInit = {},
): Promise<any> {
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  if (signal) {
    if (signal.aborted) ctl.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, REQUEST_TIMEOUT_MS);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (err) {
    if (timedOut) throw new Error(`timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Census reverse geocode. Throws on HTTP failure, timeout, or abort. */
export async function reverseGeocodeViaCensus(lat: number, lon: number, signal?: AbortSignal): Promise<GeocodeResult> {
  const url = `${CENSUS_ENDPOINT}?x=${encodeURIComponent(lon)}&y=${encodeURIComponent(lat)}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
  const body = await fetchJson(url, signal);
  const g = body?.result?.geographies || {};
  const stateRow = (g['States'] || [])[0];
  const countyRow = (g['Counties'] || [])[0];
  const placeRow = (g['Incorporated Places'] || [])[0];
  const subdivisionRow = (g['County Subdivisions'] || [])[0];

  let place: string | undefined;
  let placeType: 'incorporated' | 'subdivision' | undefined;
  if (placeRow?.BASENAME) { place = String(placeRow.BASENAME); placeType = 'incorporated'; }
  else if (subdivisionRow?.BASENAME) { place = String(subdivisionRow.BASENAME); placeType = 'subdivision'; }

  return {
    state: stateRow?.NAME ? String(stateRow.NAME) : undefined,
    county: countyRow?.BASENAME ? String(countyRow.BASENAME) : undefined,
    place,
    placeType,
    source: 'census-geocoder',
  };
}

/** OpenStreetMap Nominatim reverse geocode — the fallback provider. */
export async function reverseGeocodeViaNominatim(lat: number, lon: number, signal?: AbortSignal): Promise<GeocodeResult> {
  const url = `${NOMINATIM_ENDPOINT}?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=14&addressdetails=1&accept-language=en`;
  const body = await fetchJson(url, signal, {
    headers: { 'Accept-Language': 'en' },
  });
  const a = body?.address || {};

  const state = a.state || a.province || undefined;
  const countyRaw = a.county || a.district || undefined;
  const county = countyRaw
    ? String(countyRaw).replace(/\s+(County|Parish|Borough|Census Area|Municipio)$/i, '')
    : undefined;

  const placeRaw = a.city || a.town || a.village || a.borough || a.hamlet || a.township || a.municipality || a.suburb;
  const place = placeRaw
    ? String(placeRaw).replace(/\s+(Township|Borough|City|Town|Village)$/i, '')
    : undefined;
  const placeType: 'incorporated' | 'subdivision' | undefined = place
    ? ((a.township || a.borough) && !a.city ? 'subdivision' : 'incorporated')
    : undefined;

  return {
    state: state ? String(state) : undefined,
    county,
    place,
    placeType,
    source: 'nominatim',
  };
}

/**
 * Reverse-geocode a US coordinate, trying Census first and OpenStreetMap
 * second. Throws only when both providers fail (with both reasons in the
 * message so the UI can surface something actionable).
 */
export async function reverseGeocodeUs(lat: number, lon: number, signal?: AbortSignal): Promise<GeocodeResult> {
  const errors: string[] = [];
  try {
    return await reverseGeocodeViaCensus(lat, lon, signal);
  } catch (err) {
    if (signal?.aborted) throw err;
    errors.push(`Census: ${describeError(err)}`);
  }
  try {
    return await reverseGeocodeViaNominatim(lat, lon, signal);
  } catch (err) {
    errors.push(`OpenStreetMap: ${describeError(err)}`);
  }
  throw new Error(`geocoding service unavailable (${errors.join(' · ')})`);
}

/** Promise wrapper around `navigator.geolocation.getCurrentPosition`. */
export function getBrowserPosition(opts: PositionOptions = { enableHighAccuracy: false, timeout: 10000, maximumAge: 60_000 }): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation API not available in this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, opts);
  });
}
