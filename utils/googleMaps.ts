export interface ParsedLatLon {
  lat: number;
  lon: number;
}

const DECIMAL_PAIR_REGEX = /(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/;
const AT_COORDS_REGEX = /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/;
const D_BANG_REGEX = /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/;

const isValidLatLon = (lat: number, lon: number): boolean => {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
};

const parsePair = (latRaw: string | null, lonRaw: string | null): ParsedLatLon | null => {
  if (!latRaw || !lonRaw) return null;
  const lat = parseFloat(latRaw);
  const lon = parseFloat(lonRaw);
  return isValidLatLon(lat, lon) ? { lat, lon } : null;
};

export const isGoogleMapsShortLink = (input: string): boolean => {
  const trimmed = input.trim();
  return /https?:\/\/(?:www\.)?(?:maps\.app\.goo\.gl|goo\.gl)\//i.test(trimmed);
};

export const expandGoogleMapsShortLink = async (input: string): Promise<string | null> => {
  const trimmed = input.trim();
  if (!isGoogleMapsShortLink(trimmed)) return null;

  try {
    const response = await fetch(`/api/expand-short-url?url=${encodeURIComponent(trimmed)}`, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return typeof payload?.finalUrl === 'string' && payload.finalUrl ? payload.finalUrl : null;
  } catch {
    return null;
  }
};

export const parseGoogleMapsLatLon = (input: string): ParsedLatLon | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Allow direct paste of "lat,lon" without a URL.
  const directPair = DECIMAL_PAIR_REGEX.exec(trimmed);
  if (directPair) {
    const parsed = parsePair(directPair[1], directPair[2]);
    if (parsed) return parsed;
  }

  try {
    const url = new URL(trimmed);

    // Common Google Maps query styles.
    const queryPair = parsePair(
      url.searchParams.get('q')?.split(',')[0] ?? null,
      url.searchParams.get('q')?.split(',')[1] ?? null,
    );
    if (queryPair) return queryPair;

    const llPair = parsePair(
      url.searchParams.get('ll')?.split(',')[0] ?? null,
      url.searchParams.get('ll')?.split(',')[1] ?? null,
    );
    if (llPair) return llPair;

    const queryString = `${url.pathname}${url.search}${url.hash}`;

    const atCoords = AT_COORDS_REGEX.exec(queryString);
    if (atCoords) {
      const parsed = parsePair(atCoords[1], atCoords[2]);
      if (parsed) return parsed;
    }

    const dbang = D_BANG_REGEX.exec(queryString);
    if (dbang) {
      const parsed = parsePair(dbang[1], dbang[2]);
      if (parsed) return parsed;
    }

    return null;
  } catch {
    return null;
  }
};
