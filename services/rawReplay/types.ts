/**
 * Raw Replay — canonical raw-survey domain model.
 *
 * This module is deliberately independent of React and Babylon. A raw file is
 * parsed once into this shape, then every other part of Raw Replay (summary,
 * transport, 3D scene, import) reads it. Keeping the model pure makes the
 * parsers testable without a browser.
 */

export type RawFormat = 'rw5' | 'legacy-raw' | 'tds' | 'gsi' | 'generic';

export type RawUnit = 'international-feet' | 'us-survey-feet' | 'meter';

export type EquipmentKind =
  | 'total-station'
  | 'gnss-rover'
  | 'gnss-base'
  | 'level'
  | 'unknown';

export type GnssQuality = 'fixed' | 'float' | 'dgps' | 'autonomous' | 'unknown';

export type TimeQuality = 'recorded' | 'derived' | 'estimated';

export interface RawJob {
  name?: string;
  dateText?: string;
  timeText?: string;
  dateMs?: number;
  units: RawUnit;
  azimuthNorth: boolean;
  scaleFactor?: number;
  angleUnit?: 'dms' | 'gons';
}

export interface RawSetup {
  id: string;
  sequence: number;
  equipment: EquipmentKind;
  occupyPoint?: string;
  easting?: number;
  northing?: number;
  elevation?: number;
  instrumentHeight?: number;
  rodHeight?: number;
  backsightPoint?: string;
  backsightAngle?: number;
  backsightEasting?: number;
  backsightNorthing?: number;
  backsightElevation?: number;
  backsightAzimuthDeg?: number;
  baseId?: string;
  mountpoint?: string;
  gnssQuality?: GnssQuality;
  satellites?: number;
  pdop?: number;
  hdop?: number;
  vdop?: number;
  fieldTimeMs?: number;
  sourceRecordIndex: number;
}

export interface RawObservation {
  id: string;
  sequence: number;
  setupId: string;
  kind: 'sideshot' | 'traverse' | 'backsight' | 'foresight' | 'gps' | 'stakeout' | 'unknown';
  pointNumber?: string;
  easting?: number;
  northing?: number;
  elevation?: number;
  description?: string;
  /** True when the instrument was firing reflectorless / direct-reflex. */
  reflectorless?: boolean;
  instrumentHeight?: number;
  rodHeight?: number;
  horizontalDistance?: number;
  slopeDistance?: number;
  azimuthDeg?: number;
  zenithDeg?: number;
  fieldTimeMs?: number;
  timeQuality: TimeQuality;
  recordedTimeText?: string;
  gnss?: {
    latitude?: number;
    longitude?: number;
    ellipsoidHeight?: number;
    quality?: GnssQuality;
    satellites?: number;
    pdop?: number;
    hdop?: number;
    vdop?: number;
    baseId?: string;
    mountpoint?: string;
    vector?: { dx: number; dy: number; dz: number };
  };
  sourceRecordIndex: number;
  warnings?: string[];
}

export interface RawBounds {
  minE: number;
  maxE: number;
  minN: number;
  maxN: number;
  minZ: number;
  maxZ: number;
}

export interface RawSurveyStats {
  shotCount: number;
  uniquePointCount: number;
  setupCount: number;
  coordinateCount: number;
  traverseLegCount: number;
  gnssEpochCount: number;
  missingElevationCount: number;
  duplicatePointCount: number;
  zeroLengthShotCount: number;
  longestShot: number;
  traverseDistance: number;
  highestPoint?: number;
  lowestPoint?: number;
  elevationRange?: number;
  fieldStartMs?: number;
  fieldEndMs?: number;
  fieldSpanMs?: number;
  replayDurationMs: number;
  qualityScore: number;
  equipmentKinds: EquipmentKind[];
  timeSource: 'recorded' | 'partial' | 'none';
}

export interface RawParseWarning {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  recordIndex?: number;
  line?: string;
}

export interface RawSkippedRecord {
  recordIndex: number;
  code: string;
  line: string;
  reason: string;
}

export interface RawBaseInfo {
  id?: string;
  mountpoint?: string;
  easting?: number;
  northing?: number;
  elevation?: number;
  latitude?: number;
  longitude?: number;
  source: 'file' | 'ntrip' | 'registry' | 'synthetic';
}

export interface RawSurvey {
  schemaVersion: 1;
  format: RawFormat;
  fileName: string;
  fileSize: number;
  parsedAt: string;
  job: RawJob;
  setups: RawSetup[];
  observations: RawObservation[];
  base?: RawBaseInfo;
  stats: RawSurveyStats;
  bounds?: RawBounds;
  warnings: RawParseWarning[];
  skipped: RawSkippedRecord[];
  /** True when the parser found at least one usable observation or point. */
  usable: boolean;
}

export interface RawImportOptions {
  pointList: boolean;
  traverse: boolean;
  tin: boolean;
  attachRaw: boolean;
}

export const RAW_REPLAY_ACCEPT =
  '.rw5,.raw,.txt,.fbk,.gsi,text/plain';

export const RAW_UNIT_TO_LINEAR_UNIT: Record<RawUnit, 'foot' | 'usSurveyFoot' | 'meter'> = {
  'international-feet': 'foot',
  'us-survey-feet': 'usSurveyFoot',
  meter: 'meter',
};
