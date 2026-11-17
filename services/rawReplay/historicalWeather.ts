/**
 * Raw Replay — historical weather for the recorded field time and place.
 *
 * Raw files carry a local field clock plus GNSS/base coordinates. Open-Meteo's
 * ERA5 archive (1940–present) gives the matching hourly conditions, which drive
 * cloud cover, haze, sun dimming and precipitation in the replay sky.
 *
 * Open-Meteo data is CC BY 4.0. Attribution is shown in the Raw Replay sky HUD.
 */
import { resolveSkyContext, wallClockToUtcMs } from './astronomy';
import type { RawSurvey } from './types';

export type WeatherPrecipitation = 'none' | 'rain' | 'snow' | 'mixed';

export type WeatherCondition =
  | 'clear'
  | 'mostly-clear'
  | 'partly-cloudy'
  | 'overcast'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'heavy-rain'
  | 'snow'
  | 'sleet'
  | 'thunderstorm';

export interface HistoricalWeather {
  condition: WeatherCondition;
  conditionLabel: string;
  weatherCode: number;
  /** Total cloud cover as a fraction of the sky (0..1). */
  cloudCover: number;
  /** Portion of the sky hidden by a solid deck (0..1). */
  overcast: number;
  precipitation: WeatherPrecipitation;
  /** Precipitation strength normalised to 0..1. */
  precipitationIntensity: number;
  /** Reported horizontal visibility in metres, when available. */
  visibilityM: number | null;
  /** Haze/fog strength normalised to 0..1. */
  haze: number;
  windSpeedKph: number;
  windDirectionDeg: number;
  temperatureC: number | null;
  sourceLabel: string;
  sourceUrl: string;
  approximateLocation: boolean;
  approximateTime: boolean;
}

export interface HistoricalWeatherContext {
  latitudeDeg: number;
  longitudeDeg: number;
  /** True UTC instant represented by the raw field clock. */
  dateMs: number;
  /** Local wall-clock epoch from the raw file, encoded as UTC. */
  clockMs: number;
  approximateLocation: boolean;
  approximateTime: boolean;
}

interface OpenMeteoHourly {
  time?: string[];
  cloud_cover?: Array<number | null>;
  precipitation?: Array<number | null>;
  rain?: Array<number | null>;
  snowfall?: Array<number | null>;
  weather_code?: Array<number | null>;
  visibility?: Array<number | null>;
  wind_speed_10m?: Array<number | null>;
  wind_direction_10m?: Array<number | null>;
  temperature_2m?: Array<number | null>;
}

interface OpenMeteoArchiveResponse {
  utc_offset_seconds?: number;
  hourly?: OpenMeteoHourly;
}

const CACHE_PREFIX = 'landsurv.rawReplay.weather.v1:';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const numberOr = (value: number | null | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const dayIso = (value: Date): string => value.toISOString().slice(0, 10);

const addDays = (isoDate: string, days: number): string => {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return dayIso(date);
};

const conditionFor = (code: number): { condition: WeatherCondition; label: string } => {
  if (code === 0) return { condition: 'clear', label: 'Clear' };
  if (code === 1) return { condition: 'mostly-clear', label: 'Mostly clear' };
  if (code === 2) return { condition: 'partly-cloudy', label: 'Partly cloudy' };
  if (code === 3) return { condition: 'overcast', label: 'Overcast' };
  if (code === 45 || code === 48) return { condition: 'fog', label: 'Fog' };
  if (code >= 51 && code <= 57) return { condition: 'drizzle', label: 'Drizzle' };
  if (code === 66 || code === 67) return { condition: 'sleet', label: 'Freezing rain' };
  if (code === 65 || code === 82) return { condition: 'heavy-rain', label: 'Heavy rain' };
  if (code >= 61 && code <= 67) return { condition: 'rain', label: 'Rain' };
  if (code >= 80 && code <= 82) return { condition: 'rain', label: 'Rain showers' };
  if (code >= 71 && code <= 77) return { condition: 'snow', label: 'Snow' };
  if (code === 85 || code === 86) return { condition: 'snow', label: 'Snow showers' };
  if (code >= 95) return { condition: 'thunderstorm', label: 'Thunderstorm' };
  return { condition: 'partly-cloudy', label: 'Mixed sky' };
};

const precipitationFor = (
  code: number,
  rainMm: number,
  snowfallCm: number,
  precipitationMm: number,
): { kind: WeatherPrecipitation; intensity: number } => {
  const isSnowCode = (code >= 71 && code <= 77) || code === 85 || code === 86;
  const isRainCode = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
  const kind: WeatherPrecipitation = isSnowCode
    ? (rainMm > 0.05 ? 'mixed' : 'snow')
    : isRainCode
      ? (snowfallCm > 0.05 ? 'mixed' : 'rain')
      : snowfallCm > 0.05 && rainMm > 0.05
        ? 'mixed'
        : snowfallCm > 0.05
          ? 'snow'
          : rainMm > 0.05 || precipitationMm > 0.05
            ? 'rain'
            : 'none';
  const rainIntensity = clamp(rainMm / 4.5, 0, 1);
  const snowIntensity = clamp(snowfallCm / 3, 0, 1);
  const codeIntensity = code >= 95 ? 0.9 : code === 65 || code === 67 || code === 82 ? 0.85 : isRainCode || isSnowCode ? 0.35 : 0;
  return { kind, intensity: Math.max(rainIntensity, snowIntensity, codeIntensity) };
};

/** Map an Open-Meteo archive payload to the replay weather model. */
export const mapHistoricalWeather = (
  payload: OpenMeteoArchiveResponse,
  context: HistoricalWeatherContext,
): HistoricalWeather | null => {
  const hourly = payload.hourly;
  const times = hourly?.time;
  if (!hourly || !times || times.length === 0) return null;

  // The raw file already records a local wall clock. Match it against the
  // archive's local timestamps directly: a longitude-derived UTC offset can be
  // an hour off from the political time zone (and its DST rules).
  const local = new Date(context.clockMs);
  const targetHour = local.getUTCHours();
  const targetDate = dayIso(local);
  const targetKey = `${targetDate}T${String(targetHour).padStart(2, '0')}:00`;
  let index = times.findIndex(time => time.startsWith(targetKey));
  if (index < 0) {
    // The archive can omit the exact hour at dataset edges; use the closest
    // local hour on the same date instead of dropping the weather.
    let bestDiff = Number.POSITIVE_INFINITY;
    times.forEach((time, timeIndex) => {
      if (!time.startsWith(targetDate)) return;
      const hour = Number(time.slice(11, 13));
      if (!Number.isFinite(hour)) return;
      const diff = Math.abs(hour - targetHour);
      if (diff < bestDiff) {
        bestDiff = diff;
        index = timeIndex;
      }
    });
  }
  if (index < 0) return null;

  const cloudCover = clamp(numberOr(hourly.cloud_cover?.[index], 0) / 100, 0, 1);
  const weatherCode = Math.round(numberOr(hourly.weather_code?.[index], 0));
  const rainMm = Math.max(0, numberOr(hourly.rain?.[index], 0));
  const snowfallCm = Math.max(0, numberOr(hourly.snowfall?.[index], 0));
  const precipitationMm = Math.max(0, numberOr(hourly.precipitation?.[index], 0));
  const visibilityM = hourly.visibility?.[index] != null
    ? Math.max(0, numberOr(hourly.visibility?.[index], 0))
    : null;
  const windSpeedKph = Math.max(0, numberOr(hourly.wind_speed_10m?.[index], 0));
  const windDirectionDeg = numberOr(hourly.wind_direction_10m?.[index], 0);
  const temperatureC = hourly.temperature_2m?.[index] != null
    ? numberOr(hourly.temperature_2m?.[index], 0)
    : null;
  const { condition, label } = conditionFor(weatherCode);
  const { kind, intensity } = precipitationFor(
    weatherCode,
    rainMm,
    snowfallCm,
    precipitationMm,
  );
  const overcast = clamp((cloudCover - 0.4) / 0.6, 0, 1);
  const visibilityHaze = visibilityM != null ? clamp(1 - visibilityM / 12000, 0, 1) : 0;
  const haze = clamp(
    weatherCode === 45 || weatherCode === 48
      ? 1
      : visibilityHaze * 0.8 + overcast * 0.1 + intensity * 0.2,
    0,
    1,
  );

  return {
    condition,
    conditionLabel: label,
    weatherCode,
    cloudCover,
    overcast,
    precipitation: kind,
    precipitationIntensity: intensity,
    visibilityM,
    haze,
    windSpeedKph,
    windDirectionDeg,
    temperatureC,
    sourceLabel: 'Open-Meteo ERA5 historical reanalysis',
    sourceUrl: 'https://open-meteo.com/',
    approximateLocation: context.approximateLocation,
    approximateTime: context.approximateTime,
  };
};

/** Resolve the field time/place, optionally overridden by the forced sky clock. */
export const resolveHistoricalWeatherContext = (
  survey: RawSurvey,
  forcedClockMs?: number,
): HistoricalWeatherContext => {
  const sky = resolveSkyContext(survey);
  const clockMs = forcedClockMs ?? sky.fieldClockMs ?? Date.now();
  const dateMs = forcedClockMs != null
    ? wallClockToUtcMs(forcedClockMs, sky.longitudeDeg)
    : sky.dateMs;
  return {
    latitudeDeg: sky.latitudeDeg,
    longitudeDeg: sky.longitudeDeg,
    dateMs,
    clockMs,
    approximateLocation: sky.approximateLocation,
    approximateTime: sky.approximateTime,
  };
};

const readCachedWeather = (key: string): HistoricalWeather | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HistoricalWeather;
    return parsed && typeof parsed.cloudCover === 'number' && typeof parsed.condition === 'string'
      ? parsed
      : null;
  } catch {
    return null;
  }
};

const writeCachedWeather = (key: string, weather: HistoricalWeather): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(weather));
  } catch {
    // Storage can be full or blocked; the next fetch simply re-queries.
  }
};

/** Fetch the recorded hour's historical weather. Returns null when unavailable. */
export const fetchHistoricalWeather = async (
  context: HistoricalWeatherContext,
  signal?: AbortSignal,
): Promise<HistoricalWeather | null> => {
  const clock = new Date(context.clockMs);
  const dateIso = dayIso(clock);
  const cacheKey = [
    context.latitudeDeg.toFixed(2),
    context.longitudeDeg.toFixed(2),
    dateIso,
    String(clock.getUTCHours()).padStart(2, '0'),
  ].join('|');
  const cached = readCachedWeather(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    latitude: context.latitudeDeg.toFixed(4),
    longitude: context.longitudeDeg.toFixed(4),
    start_date: addDays(dateIso, -1),
    end_date: addDays(dateIso, 1),
    hourly: [
      'cloud_cover',
      'precipitation',
      'rain',
      'snowfall',
      'weather_code',
      'visibility',
      'wind_speed_10m',
      'wind_direction_10m',
      'temperature_2m',
    ].join(','),
    timezone: 'auto',
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm',
  });

  try {
    const response = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`, {
      signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const payload = await response.json() as OpenMeteoArchiveResponse;
    const weather = mapHistoricalWeather(payload, context);
    if (weather) writeCachedWeather(cacheKey, weather);
    return weather;
  } catch {
    return null;
  }
};
