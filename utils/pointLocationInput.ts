import {
  decodePlusCode,
  extractPlusCode,
  extractShortPlusCode,
  isShortPlusCode,
  type PlusCodeReference,
} from './plusCode.ts';

export type PointLocationKind = 'plus-code' | 'latlon';

export interface ParsedPointLocation {
  latitude: number;
  longitude: number;
  kind: PointLocationKind;
  /** Present when the location came from a Plus Code. */
  plusCode?: string;
}

export interface PointLocationParseResult {
  location: ParsedPointLocation | null;
  error?: string;
}

const ADD_POINT_COMMAND_RE =
  /\b(?:add|create|enter|place|drop|put|mark|set)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:survey\s+|project\s+)?point\b/i;

// Decimal pairs only, so a point number like "add point 5" cannot be mistaken
// for a latitude. Direction suffixes and optional lat/lon labels are accepted.
const DECIMAL_PAIR_RE =
  /([+-]?\d{1,3}\.\d+)\s*(?:°\s*)?([NS])?\s*(?:[,/]\s*|\s+)(?:lon(?:g(?:itude)?)?\s*[:=]?\s*)?([+-]?\d{1,3}\.\d+)\s*(?:°\s*)?([EW])?/i;

// A broad detector for something that looks like a Plus Code but may have an
// invalid character or length. It lets callers explain the problem instead of
// silently treating the request as a bare "add point".
const PLUS_CODE_LOOKING_RE = /\b[0-9A-Z]{8}\+[0-9A-Z]{2,3}\b/i;

export function isAddPointCommand(input: string): boolean {
  return ADD_POINT_COMMAND_RE.test(input);
}

function directionSign(direction: string | undefined, fallback: number): number {
  if (!direction) return fallback;
  const upper = direction.toUpperCase();
  if (upper === 'S' || upper === 'W') return -1;
  return 1;
}

export function parsePointLocation(
  input: string,
  reference?: PlusCodeReference | null,
): PointLocationParseResult {
  const plusCode = extractPlusCode(input, reference);
  if (plusCode) {
    const decoded = decodePlusCode(plusCode, reference);
    if (decoded) {
      return {
        location: {
          latitude: decoded.latitude,
          longitude: decoded.longitude,
          kind: 'plus-code',
          plusCode: decoded.code,
        },
      };
    }
    if (isShortPlusCode(plusCode)) {
      return {
        location: null,
        error: reference
          ? 'That short Plus Code could not be resolved near the current project location. Try the full code.'
          : 'Short Plus Codes need a project location or GPS fix. Enter the full code or set a project location.',
      };
    }
  }

  if (!plusCode) {
    const shortCode = extractShortPlusCode(input);
    if (shortCode) {
      return {
        location: null,
        error: reference
          ? 'That short Plus Code could not be resolved near the current project location. Try the full code.'
          : 'Short Plus Codes need a project location or GPS fix. Enter the full code or set a project location.',
      };
    }
  }

  if (!plusCode && PLUS_CODE_LOOKING_RE.test(input)) {
    return {
      location: null,
      error: 'That Plus Code is not valid. Use a full Google Plus Code such as 87G8Q2PQ+5X, or a short code when a project location is available.',
    };
  }

  const match = DECIMAL_PAIR_RE.exec(input);
  if (!match) return { location: null };

  const latitude = Number(match[1]) * directionSign(match[2], 1);
  const longitude = Number(match[3]) * directionSign(match[4], 1);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return { location: null, error: 'Latitude must be -90 to 90 and longitude must be -180 to 180.' };
  }

  return { location: { latitude, longitude, kind: 'latlon' } };
}
