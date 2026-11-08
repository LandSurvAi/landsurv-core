/**
 * GPS → project coordinate system.
 *
 * A surveyor should not have to hunt through a long zone list when the browser
 * already knows where they are. This resolver reverse-geocodes a WGS84 fix to a
 * US state, then picks the State Plane zone whose projection parameters are
 * nearest the fix. Outside the US (or when no State Plane zone matches) it
 * falls back to the nearest projected CRS from the EPSG registry.
 *
 * The caller owns the permission prompt: every function here takes coordinates
 * or calls getBrowserPosition explicitly. Nothing runs on page load.
 */

import type { ProjectionSetting } from '../types.ts';
import { projectionStates, projectionZones } from './projections.ts';
import {
  reverseGeocodeJurisdiction,
  type ProjectJurisdiction,
} from './projectJurisdiction.ts';
import { getBrowserPosition } from './reverseGeocode.ts';
import { ensureCrsRegistered, suggestCrsForLocation } from './crs/registry.ts';

export interface DetectedProjection {
  projection: ProjectionSetting;
  proj4def: string;
  label: string;
  source: 'state-plane' | 'epsg';
  latitude: number;
  longitude: number;
  jurisdiction?: ProjectJurisdiction | null;
}

export interface DetectProjectionOptions {
  signal?: AbortSignal;
  /** Optional pre-resolved state name, to skip a reverse-geocode round trip. */
  stateName?: string | null;
}

const readProj4Param = (definition: string, key: string): number | null => {
  const match = new RegExp(`\\+${key}=([^\\s]+)`).exec(definition);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
};

const angularDistance = (a: number, b: number): number => {
  const delta = Math.abs(a - b) % 360;
  return delta > 180 ? 360 - delta : delta;
};

/**
 * Choose the State Plane zone nearest a WGS84 point. LCC zones use the midpoint
 * of their standard parallels; transverse/oblique zones use their latitude of
 * origin. Longitude distance is weighted by latitude so east/west zones split
 * along the right meridian.
 */
export function findStatePlaneZone(
  latitude: number,
  longitude: number,
  stateName?: string | null,
): { state: string; zoneName: string; epsg: number; proj4def: string } | null {
  const normalized = stateName?.trim().toLowerCase();
  if (!normalized || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const state = projectionStates.find(
    candidate =>
      candidate.name.toLowerCase() === normalized ||
      candidate.code.toLowerCase() === normalized,
  );
  if (!state) return null;

  const zones = projectionZones[state.code] ?? [];
  if (zones.length === 0) return null;

  let best = zones[0];
  let bestScore = Number.POSITIVE_INFINITY;

  for (const zone of zones) {
    const lonOrigin =
      readProj4Param(zone.proj4def, 'lon_0') ??
      readProj4Param(zone.proj4def, 'lonc');
    const latOrigin = readProj4Param(zone.proj4def, 'lat_0');
    const lat1 = readProj4Param(zone.proj4def, 'lat_1');
    const lat2 = readProj4Param(zone.proj4def, 'lat_2');
    const latCenter =
      lat1 != null && lat2 != null ? (lat1 + lat2) / 2 : latOrigin;

    const lonPenalty = lonOrigin != null
      ? angularDistance(longitude, lonOrigin) *
        Math.cos((latitude * Math.PI) / 180)
      : 0;
    const latPenalty = latCenter != null ? Math.abs(latitude - latCenter) : 0;
    const score = latPenalty + lonPenalty;

    if (score < bestScore) {
      best = zone;
      bestScore = score;
    }
  }

  return {
    state: state.name,
    zoneName: best.name,
    epsg: best.epsg,
    proj4def: best.proj4def,
  };
}

/**
 * Resolve a projection for a WGS84 coordinate. Prefers a US State Plane zone;
 * otherwise selects the nearest projected CRS returned by the EPSG registry.
 */
export async function detectProjectionForCoordinates(
  latitude: number,
  longitude: number,
  options: DetectProjectionOptions = {},
): Promise<DetectedProjection> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('A valid GPS latitude and longitude are required.');
  }

  let jurisdiction: ProjectJurisdiction | null = null;
  let stateName = options.stateName?.trim() || null;

  if (!stateName) {
    try {
      jurisdiction = await reverseGeocodeJurisdiction(latitude, longitude, {
        aoiSource: 'browser',
        signal: options.signal,
      });
      stateName = jurisdiction?.state ?? null;
    } catch {
      // Geocoding can be blocked or offline; the EPSG fallback still works.
    }
  }

  if (stateName) {
    const zone = findStatePlaneZone(latitude, longitude, stateName);
    if (zone) {
      return {
        projection: {
          state: zone.state,
          zoneName: zone.zoneName,
          epsg: zone.epsg,
        },
        proj4def: zone.proj4def,
        label: `${zone.state} · ${zone.zoneName}`,
        source: 'state-plane',
        latitude,
        longitude,
        jurisdiction,
      };
    }
  }

  const suggestions = await suggestCrsForLocation(
    { lat: latitude, lon: longitude, label: 'your GPS location' },
    10,
  );
  const projected = suggestions.find(
    suggestion =>
      suggestion.kind === 'projected' &&
      suggestion.code !== 3857 &&
      suggestion.code !== 3395,
  );

  if (!projected) {
    throw new Error('No projected coordinate system was found for this location.');
  }

  const resolved = await ensureCrsRegistered(
    projected.code,
    { epoch: projected.epoch ?? null },
    projected,
  );
  const proj4def = resolved?.proj4 ?? projected.proj4;
  if (!proj4def) {
    throw new Error('No proj4 definition was found for this location.');
  }

  return {
    projection: {
      state: projected.country || 'International',
      zoneName: projected.name,
      epsg: projected.code,
      epoch: projected.epoch ?? null,
    },
    proj4def,
    label: projected.name,
    source: 'epsg',
    latitude,
    longitude,
    jurisdiction,
  };
}

/** Prompt for the browser's GPS fix, then resolve the local projection. */
export async function detectProjectionFromBrowser(
  options: DetectProjectionOptions = {},
): Promise<DetectedProjection> {
  const position = await getBrowserPosition();
  return detectProjectionForCoordinates(
    position.coords.latitude,
    position.coords.longitude,
    options,
  );
}
