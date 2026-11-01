/**
 * esriContourAttributes — read a contour line's elevation from an Esri
 * feature's attribute bag.
 *
 * Contour services in the wild name the elevation field a dozen different
 * ways, and ArcGIS Server preserves the layer's casing (the USGS National Map
 * returns `contourelevation`, all lowercase). The previous inline lookup in
 * App.tsx matched exact-case names and then fell back to "first numeric field
 * that is not an id/length/area" — which, on the USGS service, selected
 * `fcode` (10101, 10102…) instead of the elevation. Everything downstream
 * (z coordinate, index/intermediate classification) was therefore wrong for
 * that service.
 *
 * Matching order:
 *   1. exact normalized name against a preferred list (`contourelevation`
 *      first, since that is the 3DEP schema);
 *   2. any numeric field whose name mentions elevation;
 *   3. any remaining numeric field that is not obviously metadata.
 *
 * Values are normalized to feet because the rest of the app (contour
 * interval, labels, DXF elevation) is feet-based. `contourunits` follows the
 * 3DEP domain: 1 = feet, 2 = meters, 99 = unknown.
 */

export type ContourUnits = 'feet' | 'meters' | 'unknown';

export interface ContourElevationReading {
  /** Elevation in feet (meters converted when `units` is 'meters'). */
  elevation: number | null;
  /** Elevation exactly as the service reported it. */
  rawElevation: number | null;
  units: ContourUnits;
  /** Attribute the value came from (debugging / fieldbook logs). */
  attribute?: string;
}

const METERS_TO_FEET = 1 / 0.3048;

/** Normalized keys checked first, in priority order. */
const PREFERRED_KEYS = [
  'contourelevation',
  'contourelev',
  'contourelevft',
  'contourelevationft',
  'elevation',
  'elev',
  'elevft',
  'elevm',
  'contour',
  'contourft',
  'contourfeet',
  'contourm',
  'contourmeters',
  'contlevel',
  'contourvalue',
];

/** Numeric fields that are never the contour elevation. */
const BLOCKED_KEYS = new Set([
  'objectid',
  'oid',
  'fid',
  'fcode',
  'shape',
  'shapelength',
  'shapearea',
  'contourinterval',
  'contourunits',
  'nedresolution',
  'permanentidentifier',
  'globalid',
  'sourcefeatureid',
  'loaddate',
  'loadeddate',
  'cellid',
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Read the unit domain from `contourunits`, tolerating numeric or text codes. */
export function readContourUnits(attrs: Record<string, unknown>): ContourUnits {
  const entry = Object.entries(attrs).find(([k]) => normalizeKey(k) === 'contourunits');
  if (!entry) return 'unknown';
  const raw = entry[1];
  const code = toNumber(raw);
  if (code === 1) return 'feet';
  if (code === 2) return 'meters';
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase();
    if (s === 'feet' || s === 'foot' || s === 'ft') return 'feet';
    if (s === 'meters' || s === 'metres' || s === 'meter' || s === 'm') return 'meters';
  }
  return 'unknown';
}

/**
 * Resolve the elevation (in feet) for one contour feature.
 * Returns `elevation: null` when no plausible attribute exists.
 */
export function readContourElevation(attrs: Record<string, unknown>): ContourElevationReading {
  const units = readContourUnits(attrs);
  const normalized = new Map<string, unknown>();
  for (const [key, value] of Object.entries(attrs)) {
    const nk = normalizeKey(key);
    if (!normalized.has(nk)) normalized.set(nk, value);
  }

  let attribute: string | undefined;
  let rawElevation: number | null = null;

  for (const key of PREFERRED_KEYS) {
    const value = toNumber(normalized.get(key));
    if (value !== null) {
      rawElevation = value;
      attribute = key;
      break;
    }
  }

  if (rawElevation === null) {
    for (const [key, value] of normalized) {
      if (BLOCKED_KEYS.has(key)) continue;
      if (!key.includes('elev') && !key.startsWith('contour')) continue;
      const n = toNumber(value);
      if (n !== null) {
        rawElevation = n;
        attribute = key;
        break;
      }
    }
  }

  if (rawElevation === null) {
    for (const [key, value] of normalized) {
      if (BLOCKED_KEYS.has(key)) continue;
      if (key.includes('length') || key.includes('area') || key.includes('id')) continue;
      if (key.includes('interval') || key.includes('units') || key.includes('resolution')) continue;
      if (key.includes('date')) continue;
      const n = toNumber(value);
      if (n !== null) {
        rawElevation = n;
        attribute = key;
        break;
      }
    }
  }

  const elevation = rawElevation === null
    ? null
    : (units === 'meters' ? rawElevation * METERS_TO_FEET : rawElevation);

  return { elevation, rawElevation, units, attribute };
}

/** Convert an elevation in feet to meters (for display of metric sources). */
export function feetToMeters(feet: number): number {
  return feet * 0.3048;
}
