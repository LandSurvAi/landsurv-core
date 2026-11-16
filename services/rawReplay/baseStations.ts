import type { RawBaseInfo, RawSurvey } from './types';

export type GnssReferenceKind = 'local-base' | 'network-base' | 'approximate';

export interface ResolvedBase {
  label: string;
  source: 'file' | 'ntrip' | 'registry' | 'synthetic';
  /** Local tripod base vs network/VRS/NTRIP reference vs approximate fallback. */
  reference: GnssReferenceKind;
  approximate: boolean;
  bearingDeg: number;
  distanceM: number;
  visualDistanceM: number;
  easting?: number;
  northing?: number;
  elevation?: number;
  note: string;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const haversineMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const earthRadius = 6371008.8;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const initialBearingDegrees = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const lambda = toRadians(lon2 - lon1);
  const y = Math.sin(lambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda);
  return (Math.atan2(y, x) * 180) / Math.PI;
};

const deterministicHash = (text: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const centroid = (survey: RawSurvey): { easting: number; northing: number } | undefined => {
  if (survey.bounds) {
    return {
      easting: (survey.bounds.minE + survey.bounds.maxE) / 2,
      northing: (survey.bounds.minN + survey.bounds.maxN) / 2,
    };
  }
  const points = survey.observations.filter(point => point.easting != null && point.northing != null);
  if (points.length === 0) return undefined;
  return {
    easting: points.reduce((sum, point) => sum + (point.easting ?? 0), 0) / points.length,
    northing: points.reduce((sum, point) => sum + (point.northing ?? 0), 0) / points.length,
  };
};

const firstGnssCoordinate = (survey: RawSurvey): { latitude: number; longitude: number } | undefined => {
  for (const observation of survey.observations) {
    if (observation.gnss?.latitude != null && observation.gnss.longitude != null) {
      return { latitude: observation.gnss.latitude, longitude: observation.gnss.longitude };
    }
  }
  return undefined;
};

const mountpointFor = (survey: RawSurvey): string | undefined =>
  survey.base?.mountpoint
  ?? survey.setups.find(setup => setup.mountpoint)?.mountpoint;

const hasLocalBaseSetup = (survey: RawSurvey): boolean =>
  survey.setups.some(setup => setup.equipment === 'gnss-base');

const syntheticBase = (survey: RawSurvey, reference: GnssReferenceKind = 'approximate'): ResolvedBase => {
  const hash = deterministicHash(`${survey.fileName}|${survey.stats.fieldStartMs ?? 'no-time'}|${survey.stats.shotCount}`);
  const bearingDeg = (hash % 3600) / 10;
  const distanceM = 1200 + ((hash >>> 9) % 4200);
  const mountpoint = mountpointFor(survey);
  const local = reference === 'local-base';
  return {
    label: local
      ? 'Local base'
      : mountpoint
        ? `NTRIP ${mountpoint}`
        : 'Approximate network base',
    source: local ? 'file' : mountpoint ? 'ntrip' : 'synthetic',
    reference,
    approximate: true,
    bearingDeg,
    distanceM,
    visualDistanceM: clamp(distanceM, 900, 5000),
    note: local
      ? 'A local GNSS base setup was recorded but its coordinates were not. The reference is shown at a deterministic approximate bearing; the base/rover relationship is preserved.'
      : mountpoint
        ? `The raw file names NTRIP mountpoint ${mountpoint} but does not include its coordinates. The reference is shown at a deterministic approximate bearing until a caster lookup or registry entry is available.`
        : 'No base station or mountpoint was present in this file. A deterministic distant reference is shown and labelled approximate. GNSS still uses a base/rover model; a total station is never drawn for these epochs.',
  };
};

export const resolveBase = (survey: RawSurvey): ResolvedBase | null => {
  const base: RawBaseInfo | undefined = survey.base;
  const mountpoint = mountpointFor(survey);
  const localBase = hasLocalBaseSetup(survey);
  const hasGnss = survey.stats.equipmentKinds.includes('gnss-rover') || survey.stats.equipmentKinds.includes('gnss-base');

  if (base?.easting != null && base.northing != null) {
    const center = centroid(survey);
    const bearingDeg = center
      ? (Math.atan2(base.easting - center.easting, base.northing - center.northing) * 180) / Math.PI
      : 0;
    const distanceM = center ? Math.hypot(base.easting - center.easting, base.northing - center.northing) : 0;
    const reference: GnssReferenceKind = mountpoint ? 'network-base' : 'local-base';
    return {
      label: mountpoint
        ? `NTRIP ${mountpoint}`
        : base.id
          ? `Local base ${base.id}`
          : 'Local base',
      source: 'file',
      reference,
      approximate: false,
      bearingDeg,
      distanceM,
      visualDistanceM: clamp(distanceM, 700, 5600),
      easting: base.easting,
      northing: base.northing,
      elevation: base.elevation,
      note: mountpoint
        ? `Base coordinates read from the raw file and associated with NTRIP mountpoint ${mountpoint}. The scene preserves the true bearing and distance.`
        : 'Local base position read directly from the raw file. The scene preserves its true bearing and labels the true horizontal distance.',
    };
  }

  if (base?.latitude != null && base.longitude != null) {
    const rover = firstGnssCoordinate(survey);
    const reference: GnssReferenceKind = mountpoint ? 'network-base' : 'local-base';
    if (rover) {
      const bearingDeg = initialBearingDegrees(rover.latitude, rover.longitude, base.latitude, base.longitude);
      const distanceM = haversineMeters(rover.latitude, rover.longitude, base.latitude, base.longitude);
      return {
        label: mountpoint
          ? `NTRIP ${mountpoint}`
          : base.id
            ? `Local base ${base.id}`
            : 'Local base',
        source: 'file',
        reference,
        approximate: false,
        bearingDeg,
        distanceM,
        visualDistanceM: clamp(distanceM, 700, 5600),
        easting: base.easting,
        northing: base.northing,
        elevation: base.elevation,
        note: 'Base latitude/longitude and a GNSS rover coordinate were both present. The reference bearing and distance are derived from those coordinates; no grid reprojection was invented.',
      };
    }
    return {
      ...syntheticBase(survey, reference),
      label: mountpoint
        ? `NTRIP ${mountpoint}`
        : base.id
          ? `Local base ${base.id}`
          : 'Local base',
      source: mountpoint ? 'ntrip' : 'file',
      note: 'The file contains base latitude/longitude but no rover latitude/longitude with which to derive a bearing. The visual placement is approximate; the base coordinates remain available in the raw record.',
    };
  }

  const reference: GnssReferenceKind = mountpoint
    ? 'network-base'
    : localBase
      ? 'local-base'
      : 'approximate';

  if (base?.mountpoint || base?.id || mountpoint || localBase) {
    return {
      ...syntheticBase(survey, reference),
      label: mountpoint
        ? `NTRIP ${mountpoint}`
        : base?.id
          ? `Local base ${base.id}`
          : localBase
            ? 'Local base'
            : 'Approximate base reference',
      source: mountpoint ? 'ntrip' : 'file',
      note: mountpoint
        ? `The raw file names NTRIP mountpoint ${mountpoint} but does not include its coordinates. The reference is shown at an approximate bearing until a caster lookup or base registry entry is available.`
        : 'A local GNSS base was recorded without usable coordinates. The reference is shown at an approximate bearing; the base/rover relationship is preserved.',
    };
  }

  if (hasGnss) return syntheticBase(survey, 'approximate');
  return null;
};

export const gnssReferenceLabel = (reference: GnssReferenceKind): string => {
  if (reference === 'local-base') return 'Local base';
  if (reference === 'network-base') return 'Network / NTRIP base';
  return 'Approximate reference';
};

export const compassLabel = (bearingDeg: number): string => {
  const normalized = ((bearingDeg % 360) + 360) % 360;
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return directions[Math.round(normalized / 45) % 8];
};

export const formatBearing = (bearingDeg: number): string => {
  const normalized = ((bearingDeg % 360) + 360) % 360;
  return `${normalized.toFixed(0)}° ${compassLabel(normalized)}`;
};
