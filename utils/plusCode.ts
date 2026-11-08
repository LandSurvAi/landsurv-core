/**
 * Google Plus Code / Open Location Code decoding.
 *
 * Point Tools, A2UI, and CACP all accept a full Plus Code such as
 * `87G8Q2PQ+5X`. Shortened codes (for example `Q2PQ+5X`) intentionally require
 * a reference location, so they are rejected rather than guessed.
 */

const ALPHABET = '23456789CFGHJMPQRVWX';
const ALPHABET_INDEX = new Map(Array.from(ALPHABET, (char, index) => [char, index]));

const FULL_CODE_RE = /^[23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{2,3}$/i;
const EXTRACT_CODE_RE = /\b[23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{2,3}\b/i;

export interface DecodedPlusCode {
  /** Normalized upper-case code, including the `+` separator. */
  code: string;
  latitude: number;
  longitude: number;
  /** Approximate north-south cell size in metres. */
  resolutionMeters: number;
}

export function normalizePlusCode(input: string): string | null {
  const normalized = input.trim().replace(/\s+/g, '').toUpperCase();
  return FULL_CODE_RE.test(normalized) ? normalized : null;
}

export function isPlusCode(input: string): boolean {
  return normalizePlusCode(input) !== null;
}

/**
 * Find the first full Plus Code in free text. The returned value is normalized.
 */
export function extractPlusCode(input: string): string | null {
  const match = EXTRACT_CODE_RE.exec(input);
  return match ? normalizePlusCode(match[0]) : null;
}

/**
 * Decode a full Open Location Code to its WGS84 center point.
 *
 * The first five character pairs narrow the location from a 20-degree cell to
 * a 0.000125-degree cell. An optional 11th character adds one 4x5 grid
 * refinement step.
 */
export function decodePlusCode(input: string): DecodedPlusCode | null {
  const code = normalizePlusCode(input);
  if (!code) return null;

  const digits = code.replace('+', '');
  let latitude = -90;
  let longitude = -180;
  let latitudeResolution = 20;
  let longitudeResolution = 20;

  for (let index = 0; index < 10; index += 2) {
    const latitudeDigit = ALPHABET_INDEX.get(digits[index]);
    const longitudeDigit = ALPHABET_INDEX.get(digits[index + 1]);
    if (latitudeDigit === undefined || longitudeDigit === undefined) return null;

    latitude += latitudeDigit * latitudeResolution;
    longitude += longitudeDigit * longitudeResolution;
    latitudeResolution /= 20;
    longitudeResolution /= 20;
  }

  if (digits.length === 11) {
    const gridDigit = ALPHABET_INDEX.get(digits[10]);
    if (gridDigit === undefined) return null;

    // Grid refinement is 4 columns by 5 rows.
    latitude += Math.floor(gridDigit / 4) * latitudeResolution;
    longitude += (gridDigit % 4) * longitudeResolution;
    latitudeResolution /= 5;
    longitudeResolution /= 4;
    latitude += latitudeResolution / 2;
    longitude += longitudeResolution / 2;
  } else {
    // The pair loop leaves the resolution at the next smaller cell. Ten of
    // those units is the center of the cell represented by the last pair.
    latitude += latitudeResolution * 10;
    longitude += longitudeResolution * 10;
  }

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return {
    code,
    latitude,
    longitude,
    resolutionMeters: latitudeResolution * 111_320,
  };
}
