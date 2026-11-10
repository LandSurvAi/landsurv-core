/**
 * Google Plus Code / Open Location Code decoding.
 *
 * Point Tools, A2UI, and CACP accept a full Plus Code such as
 * `87G8Q2PQ+5X`. A shortened code such as `Q2PQ+5X` is also accepted when a
 * reference location (the project centre or a GPS fix) is supplied: the decoder
 * recovers the nearest full code, which is how Google Maps treats local codes.
 */

const ALPHABET = '23456789CFGHJMPQRVWX';
const ALPHABET_INDEX = new Map(Array.from(ALPHABET, (char, index) => [char, index]));

const FULL_CODE_RE = /^[23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{2,3}$/i;
const SHORT_CODE_RE = /^[23456789CFGHJMPQRVWX]{2,6}\+[23456789CFGHJMPQRVWX]{2,3}$/i;
const EXTRACT_CODE_RE = /\b[23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{2,3}\b/i;
const EXTRACT_SHORT_CODE_RE = /(?:^|[^23456789CFGHJMPQRVWX])([23456789CFGHJMPQRVWX]{2,6}\+[23456789CFGHJMPQRVWX]{2,3})(?![23456789CFGHJMPQRVWX])/i;
const FULL_LOOKING_RE = /[23456789CFGHJMPQRVWX]{8,}\+[23456789CFGHJMPQRVWX]{2,3}/i;

export interface PlusCodeReference {
  latitude: number;
  longitude: number;
}

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

export function normalizeShortPlusCode(input: string): string | null {
  const normalized = input.trim().replace(/\s+/g, '').toUpperCase();
  return SHORT_CODE_RE.test(normalized) ? normalized : null;
}

export function isPlusCode(input: string): boolean {
  return normalizePlusCode(input) !== null;
}

export function isShortPlusCode(input: string): boolean {
  return normalizeShortPlusCode(input) !== null;
}

/**
 * Find the first Plus Code in free text. Full codes are always preferred; a
 * short code is returned only when the caller supplied a reference location.
 */
export function extractPlusCode(
  input: string,
  reference?: PlusCodeReference | null,
): string | null {
  const fullMatch = EXTRACT_CODE_RE.exec(input);
  if (fullMatch) return normalizePlusCode(fullMatch[0]);
  if (!reference || !isValidReference(reference)) return null;
  return extractShortPlusCode(input);
}

/** Find a shortened Plus Code without needing a reference. */
export function extractShortPlusCode(input: string): string | null {
  if (FULL_LOOKING_RE.test(input)) return null;
  const match = EXTRACT_SHORT_CODE_RE.exec(input);
  return match?.[1] ? normalizeShortPlusCode(match[1]) : null;
}

function isValidReference(reference: PlusCodeReference | null | undefined): reference is PlusCodeReference {
  return Boolean(
    reference
    && Number.isFinite(reference.latitude)
    && Number.isFinite(reference.longitude)
    && reference.latitude >= -90
    && reference.latitude <= 90
    && reference.longitude >= -180
    && reference.longitude <= 180,
  );
}

function mod20(value: number): number {
  return ((value % 20) + 20) % 20;
}

/** Decode a normalized full Open Location Code to its WGS84 center point. */
function decodeFullPlusCode(code: string): DecodedPlusCode | null {
  if (!FULL_CODE_RE.test(code)) return null;

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

function distanceMeters(a: PlusCodeReference, b: PlusCodeReference): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(b.longitude - a.longitude);
  const haversine =
    Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

/**
 * Recover the nearest full code for a shortened code.
 *
 * The omitted prefix is chosen coarse-to-fine from the reference location, then
 * the neighbouring grid cells are checked so a reference near a cell edge
 * cannot select the wrong full code.
 */
function recoverNearestFullPlusCode(
  shortCode: string,
  reference: PlusCodeReference,
): string | null {
  const plusIndex = shortCode.indexOf('+');
  if (plusIndex < 0) return null;

  const before = shortCode.slice(0, plusIndex);
  const after = shortCode.slice(plusIndex);
  const missingChars = 8 - before.length;
  if (missingChars <= 0 || missingChars % 2 !== 0) return null;

  const missingPairs = missingChars / 2;
  const padded = `${'2'.repeat(missingChars)}${before}${after}`;
  const base = decodeFullPlusCode(padded);
  if (!base) return null;

  const digits: Array<{ latitude: number; longitude: number }> = [];
  let currentLatitude = base.latitude;
  let currentLongitude = base.longitude;

  for (let pair = 0; pair < missingPairs; pair += 1) {
    const resolution = 20 ** (1 - pair);
    const latitudeDigit = mod20(Math.round((reference.latitude - currentLatitude) / resolution));
    const longitudeDigit = mod20(Math.round((reference.longitude - currentLongitude) / resolution));
    digits.push({ latitude: latitudeDigit, longitude: longitudeDigit });
    currentLatitude += latitudeDigit * resolution;
    currentLongitude += longitudeDigit * resolution;
  }

  let bestCode: string | null = null;
  let bestDistance = Infinity;
  const offsets = [-2, -1, 0, 1, 2];
  const combinations = offsets.length ** (missingPairs * 2);

  for (let combination = 0; combination < combinations; combination += 1) {
    let cursor = combination;
    let prefix = '';
    for (let pair = 0; pair < missingPairs; pair += 1) {
      const latitudeOffset = offsets[cursor % offsets.length];
      cursor = Math.floor(cursor / offsets.length);
      const longitudeOffset = offsets[cursor % offsets.length];
      cursor = Math.floor(cursor / offsets.length);
      const latitudeDigit = mod20(digits[pair].latitude + latitudeOffset);
      const longitudeDigit = mod20(digits[pair].longitude + longitudeOffset);
      prefix += ALPHABET[latitudeDigit] + ALPHABET[longitudeDigit];
    }

    const candidate = decodeFullPlusCode(`${prefix}${before}${after}`);
    if (!candidate) continue;
    const distance = distanceMeters(reference, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestCode = candidate.code;
    }
  }

  return bestCode;
}

/**
 * Decode a Plus Code. Short codes require a reference location; without one
 * they are rejected rather than guessed.
 */
export function decodePlusCode(
  input: string,
  reference?: PlusCodeReference | null,
): DecodedPlusCode | null {
  const fullCode = normalizePlusCode(input);
  if (fullCode) return decodeFullPlusCode(fullCode);

  const shortCode = normalizeShortPlusCode(input);
  if (!shortCode || !isValidReference(reference)) return null;

  const recovered = recoverNearestFullPlusCode(shortCode, reference);
  return recovered ? decodeFullPlusCode(recovered) : null;
}
