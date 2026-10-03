// Free reverse geocoding via the US Census Geocoder.
//
// No API key, no rate-limit gate, no TOS that restricts automated calls. The
// endpoint returns the state, county, and incorporated place (or county
// subdivision / township when the point falls outside an incorporated place)
// for any lat/lon in the United States.
//
// Endpoint reference:
//   https://geocoding.geo.census.gov/geocoder/Geographies_layers.html

export interface GeocodeResult {
  state?: string;     // full state name, e.g. "Pennsylvania"
  county?: string;    // bare basename, no " County" suffix
  place?: string;     // "Schwenksville" (preferred) or township name (fallback)
  placeType?: 'incorporated' | 'subdivision';
  source: 'census-geocoder';
}

const ENDPOINT = 'https://geocoding.geo.census.gov/geocoder/geographies/coordinates';

export async function reverseGeocodeViaCensus(lat: number, lon: number, signal?: AbortSignal): Promise<GeocodeResult> {
  const url = `${ENDPOINT}?x=${encodeURIComponent(lon)}&y=${encodeURIComponent(lat)}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`Census geocoder returned ${r.status}`);
  const body = await r.json();
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
