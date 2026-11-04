// Project jurisdiction resolver — answers "where is this project?" from the
// data already on the canvas, so jurisdiction pickers (Boundary Agent parcels,
// Zoning Agent) can pre-select instead of asking for state / county /
// municipality again.
//
// Source of truth is the WGS84 center of the project AOI: the drawn inclusion
// boundary when one exists, otherwise the auto-shrinkwrap hull of the loaded
// survey points (see utils/aoiResolver.ts). That center is reverse-geocoded
// through the key-free US Census geocoder, which returns the state, county and
// incorporated place (or county subdivision / township) for any US coordinate.
//
// Requires a project EPSG — without one the point coordinates are arbitrary
// local drafting units and cannot be placed on the earth.

import type { SurveyLine, SurveyPoint } from '../types.ts';
import { resolveAoi } from './aoiResolver.ts';
import { projectionEpsgStates, projectionStates, projectionZones } from './projections.ts';
import {
  getBrowserPosition,
  reverseGeocodeUs,
  type GeocodeResult,
} from './reverseGeocode.ts';

export interface ProjectJurisdiction extends GeocodeResult {
  /** WGS84 center of the project AOI that produced the match. */
  latitude?: number;
  longitude?: number;
  /** How the location was derived: 'inclusion' | 'shrinkwrap' | 'point_extent' |
   *  'browser' | 'epsg-projection'. */
  aoiSource: string;
  /** Human-readable line for the UI, e.g. "Norristown, Montgomery County, Pennsylvania". */
  label: string;
}

export interface ProjectJurisdictionInput {
  points: SurveyPoint[];
  /** Canvas linework; an inclusion boundary, when present, defines the AOI. */
  lines?: SurveyLine[];
  /** Project coordinate system (settings.projection.epsg). */
  epsg?: number | null;
  signal?: AbortSignal;
}

/** One line of jurisdiction for banners and agent prompts. */
export function jurisdictionLabel(j: { place?: string; county?: string; state?: string }): string {
  const county = j.county ? `${j.county.replace(/\s+county$/i, '')} County` : '';
  return [j.place, county, j.state].filter(Boolean).join(', ') || 'Unknown jurisdiction';
}

// County / municipality boundaries do not move measurably at ~100 m, so cache
// by the rounded center and skip repeat Census calls while the user edits
// points inside the same site.
const CACHE_PRECISION = 3;
const cache = new Map<string, ProjectJurisdiction>();

export function clearProjectJurisdictionCache(): void {
  cache.clear();
}

function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(CACHE_PRECISION)},${lon.toFixed(CACHE_PRECISION)}`;
}

/**
 * Reverse-geocode a WGS84 point to a US jurisdiction. Returns null when the
 * geocoder has no US state/county/place for the coordinates (e.g. offshore or
 * outside the US).
 */
export async function reverseGeocodeJurisdiction(
  lat: number,
  lon: number,
  opts: { aoiSource?: string; signal?: AbortSignal } = {},
): Promise<ProjectJurisdiction | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const key = cacheKey(lat, lon);
  const cached = cache.get(key);
  if (cached) return cached;

  const geo = await reverseGeocodeUs(lat, lon, opts.signal);
  if (!geo.state && !geo.county && !geo.place) return null;

  const result: ProjectJurisdiction = {
    ...geo,
    latitude: lat,
    longitude: lon,
    aoiSource: opts.aoiSource ?? 'browser',
    label: jurisdictionLabel(geo),
  };
  cache.set(key, result);
  return result;
}

/**
 * State named by a State Plane / projected coordinate system. Every zone in
 * utils/projections.ts belongs to exactly one state, so this tells us where a
 * project is even when both geocoders are unreachable.
 */
export function stateNameForEpsg(epsg?: number | null): string | null {
  const code = Number(epsg);
  if (!epsg || !Number.isFinite(code)) return null;
  const alias = projectionEpsgStates[code];
  if (alias) return projectionStates.find((s) => s.code === alias)?.name ?? alias;
  for (const [stateCode, zones] of Object.entries(projectionZones)) {
    if (zones.some((z) => z.epsg === code)) {
      return projectionStates.find((s) => s.code === stateCode)?.name ?? null;
    }
  }
  return null;
}

/**
 * Instant, network-free jurisdiction guess from the project's EPSG. Only the
 * state is known, so parcel lookup falls back to that state's parcel fabric.
 */
export function inferJurisdictionFromEpsg(epsg?: number | null): ProjectJurisdiction | null {
  const state = stateNameForEpsg(epsg);
  if (!state) return null;
  return {
    state,
    source: 'projection',
    aoiSource: 'epsg-projection',
    label: `${state} (project CRS)`,
  };
}

/**
 * Resolve the jurisdiction of the loaded project from its georeferenced
 * points. Returns null when there are no usable points or no project EPSG.
 */
export async function resolveProjectJurisdiction(
  input: ProjectJurisdictionInput,
): Promise<ProjectJurisdiction | null> {
  const epsg = input.epsg;
  const points = (input.points ?? []).filter(
    (p) => Number.isFinite(p.easting) && Number.isFinite(p.northing),
  );
  if (!epsg || points.length === 0) return null;

  let aoi;
  try {
    aoi = await resolveAoi({ points, lines: input.lines ?? [], projectEpsg: epsg });
  } catch {
    // No inclusion, no hull, no usable extent — nothing to locate.
    return null;
  }

  const [xmin, ymin, xmax, ymax] = aoi.bboxWgs84;
  if (![xmin, ymin, xmax, ymax].every(Number.isFinite)) return null;

  return reverseGeocodeJurisdiction((ymin + ymax) / 2, (xmin + xmax) / 2, {
    aoiSource: aoi.source,
    signal: input.signal,
  });
}

/**
 * Opt-in fallback for projects with no georeferenced points: locate the
 * browser's current position and reverse-geocode it. Prompts for permission.
 */
export async function detectJurisdictionFromBrowser(
  signal?: AbortSignal,
): Promise<ProjectJurisdiction | null> {
  const pos = await getBrowserPosition();
  return reverseGeocodeJurisdiction(pos.coords.latitude, pos.coords.longitude, {
    aoiSource: 'browser',
    signal,
  });
}
