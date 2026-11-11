/**
 * stormwaterRainfall — national rainfall intensity lookup.
 *
 * NOAA Atlas 14 point precipitation frequency estimates are served by NOAA's
 * PFDS endpoint as a small CSV. Browsers cannot call it directly (no CORS),
 * so the app asks the LandSurv backend, which fetches and normalizes the CSV.
 */

import type { StormwaterRainfall } from './stormwaterService.ts';

interface NoaaAtlas14Payload {
  label: string;
  citation: string;
  volume: string;
  projectArea: string;
  intensities: Record<number, Record<number, number>>;
}

export interface NoaaAtlas14LookupResult extends StormwaterRainfall {
  projectArea: string;
  volume: string;
}

export async function fetchNoaaAtlas14Rainfall(
  latitude: number,
  longitude: number,
): Promise<NoaaAtlas14LookupResult> {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error('Latitude must be between -90 and 90.');
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('Longitude must be between -180 and 180.');
  }

  const params = new URLSearchParams({
    lat: latitude.toFixed(6),
    lon: longitude.toFixed(6),
  });
  let response: Response;
  try {
    response = await fetch(`/api/stormwater/noaa-idf?${params.toString()}`);
  } catch {
    throw new Error(
      'Could not reach the rainfall service. Enter a manual design intensity or retry when the backend is available.',
    );
  }

  if (!response.ok) {
    let message = `NOAA Atlas 14 lookup failed (${response.status}).`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload?.error) message = payload.error;
    } catch {
      /* keep the status message */
    }
    throw new Error(message);
  }

  const payload = (await response.json()) as NoaaAtlas14Payload;
  if (!payload?.intensities || !payload.intensities[25]?.[15]) {
    throw new Error('NOAA Atlas 14 returned no usable intensity data for this location.');
  }

  return {
    source: 'noaa-atlas14',
    label: payload.label,
    citation: payload.citation,
    intensitiesByReturnPeriod: payload.intensities,
    latitude,
    longitude,
    projectArea: payload.projectArea,
    volume: payload.volume,
  };
}
