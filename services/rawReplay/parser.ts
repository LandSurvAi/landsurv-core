import type {
  EquipmentKind,
  GnssQuality,
  RawBaseInfo,
  RawBounds,
  RawFormat,
  RawJob,
  RawObservation,
  RawParseWarning,
  RawSetup,
  RawSkippedRecord,
  RawSurvey,
  RawUnit,
} from './types';
import { analyseRawHeights } from './heights';

/**
 * Raw survey parser.
 *
 * The RW5/TDS family is the primary target. The parser is intentionally
 * tolerant: it recognises the records that carry geometry and timing, skips
 * presentation-only records, and reports what it skipped instead of silently
 * inventing data. Leica GSI and simple legacy point dumps are supported as
 * secondary formats.
 */

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const toNumber = (raw: string | undefined): number | undefined => {
  if (raw == null) return undefined;
  const cleaned = String(raw).replace(/[^0-9+\-.]/g, '').trim();
  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '+') return undefined;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : undefined;
};

const parseAngleToDecimalDegrees = (raw: string | undefined): number | undefined => {
  const value = toNumber(raw);
  if (value == null) return undefined;
  const sign = value < 0 ? -1 : 1;
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutesAndSeconds = (absolute - degrees) * 100;
  const minutes = Math.floor(minutesAndSeconds);
  const seconds = (minutesAndSeconds - minutes) * 100;
  return sign * (degrees + minutes / 60 + seconds / 3600);
};

/**
 * Numeric RW5/TDS dates carry no timezone. Build the epoch with Date.UTC so the
 * recorded wall-clock time is identical in every viewer timezone; letting
 * Date.parse read them would shift the clock (and the sky) by the browser zone.
 */
const NUMERIC_DATE = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/;
const NUMERIC_DATE_TIME = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})[T,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
/** A time followed by Z or +/-hh:mm is already an absolute instant. */
const EXPLICIT_ZONE = /\d{1,2}:\d{2}(?::\d{2})?\s*(?:[zZ]|[+-]\d{2}:?\d{2})$/;

const buildNumericDate = (match: RegExpMatchArray): number => {
  const month = Number(match[1]);
  const day = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += year < 70 ? 2000 : 1900;
  return Date.UTC(year, month - 1, day);
};

const buildIsoDate = (match: RegExpMatchArray): number =>
  Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

const timeOfDayMs = (hours: string, minutes: string, seconds?: string): number =>
  Number(hours) * 3600000 + Number(minutes) * 60000 + Number(seconds ?? 0) * 1000;

const parseDateAny = (raw: string | undefined): number | undefined => {
  if (!raw) return undefined;
  const text = raw.trim();
  if (!text) return undefined;
  if (!EXPLICIT_ZONE.test(text)) {
    const isoDateTimeMatch = text.match(ISO_DATE_TIME);
    if (isoDateTimeMatch) {
      return buildIsoDate(isoDateTimeMatch) + timeOfDayMs(isoDateTimeMatch[4], isoDateTimeMatch[5], isoDateTimeMatch[6]);
    }
    const isoDateMatch = text.match(ISO_DATE);
    if (isoDateMatch) return buildIsoDate(isoDateMatch);
    const dateTimeMatch = text.match(NUMERIC_DATE_TIME);
    if (dateTimeMatch) {
      return buildNumericDate(dateTimeMatch) + timeOfDayMs(dateTimeMatch[4], dateTimeMatch[5], dateTimeMatch[6]);
    }
    const match = text.match(NUMERIC_DATE);
    if (match) return buildNumericDate(match);
  }
  const direct = Date.parse(text);
  return Number.isFinite(direct) ? direct : undefined;
};

const parseDateAndTime = (dateText?: string, timeText?: string): number | undefined => {
  if (!dateText || !timeText) return undefined;
  const date = parseDateAny(dateText);
  const timeMatch = timeText.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  const dateIsLocal = NUMERIC_DATE.test(dateText.trim()) || ISO_DATE.test(dateText.trim());
  if (date != null && timeMatch && dateIsLocal && !EXPLICIT_ZONE.test(timeText.trim())) {
    return date + timeOfDayMs(timeMatch[1], timeMatch[2], timeMatch[3]);
  }
  const direct = Date.parse(`${dateText} ${timeText}`);
  if (Number.isFinite(direct)) return direct;
  if (date == null) return undefined;
  if (!timeMatch) return date;
  return date + timeOfDayMs(timeMatch[1], timeMatch[2], timeMatch[3]);
};

interface FieldSet {
  fields: Map<string, string>;
  description: string;
}

const parseFields = (tokens: string[]): FieldSet => {
  const fields = new Map<string, string>();
  let description = '';
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index].trim();
    if (!token) continue;
    if (token.startsWith('--')) {
      description = [token.replace(/^--/, ''), ...tokens.slice(index + 1)]
        .join(',')
        .trim();
      break;
    }
    const match = token.match(/^([A-Za-z]+)\s*(.*)$/);
    if (!match) continue;
    const key = match[1].toUpperCase();
    const value = match[2].trim();
    if (!fields.has(key) || value) fields.set(key, value);
  }
  return { fields, description: description === 'GS' || description === 'RTK' ? '' : description };
};

const fieldNumber = (fields: Map<string, string>, ...keys: string[]): number | undefined => {
  for (const key of keys) {
    const value = toNumber(fields.get(key));
    if (value != null) return value;
  }
  return undefined;
};

const fieldText = (fields: Map<string, string>, ...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = fields.get(key)?.trim();
    if (value) return value;
  }
  return undefined;
};

const asPointNumber = (raw: string | undefined): string | undefined => {
  if (raw == null) return undefined;
  const text = String(raw).trim();
  return text || undefined;
};

const unitFromMarker = (raw: string | undefined): RawUnit => {
  const marker = toNumber(raw);
  if (marker === 1) return 'meter';
  if (marker === 0) return 'international-feet';
  return 'us-survey-feet';
};

const emptyBounds = (): RawBounds => ({
  minE: Number.POSITIVE_INFINITY,
  maxE: Number.NEGATIVE_INFINITY,
  minN: Number.POSITIVE_INFINITY,
  maxN: Number.NEGATIVE_INFINITY,
  minZ: Number.POSITIVE_INFINITY,
  maxZ: Number.NEGATIVE_INFINITY,
});

const finalizeBounds = (bounds: RawBounds): RawBounds | undefined => (
  Number.isFinite(bounds.minE) && Number.isFinite(bounds.minN)
    ? bounds
    : undefined
);

const isSentinelElevation = (value: number | undefined): boolean => (
  value != null && value < -9000
);

const distance2d = (
  a: { easting?: number; northing?: number },
  b: { easting?: number; northing?: number },
): number | undefined => {
  if (a.easting == null || a.northing == null || b.easting == null || b.northing == null) return undefined;
  return Math.hypot(a.easting - b.easting, a.northing - b.northing);
};

const createJob = (format: RawFormat): RawJob => ({
  units: format === 'gsi' ? 'meter' : 'us-survey-feet',
  azimuthNorth: true,
});

const buildStats = (
  setups: RawSetup[],
  observations: RawObservation[],
  skipped: RawSkippedRecord[],
  timedObservationCount: number,
  hasRecordedTime: boolean,
): RawSurvey['stats'] => {
  const pointCounts = new Map<string, number>();
  const coordinates: Array<{ easting: number; northing: number; elevation?: number }> = [];
  let missingElevationCount = 0;
  let gnssEpochCount = 0;
  let zeroLengthShotCount = 0;

  observations.forEach((observation, index) => {
    if (observation.pointNumber) {
      pointCounts.set(observation.pointNumber, (pointCounts.get(observation.pointNumber) ?? 0) + 1);
    }
    if (observation.easting != null && observation.northing != null) {
      coordinates.push({
        easting: observation.easting,
        northing: observation.northing,
        elevation: observation.elevation,
      });
    }
    if (observation.elevation == null || isSentinelElevation(observation.elevation)) {
      missingElevationCount += 1;
    }
    if (observation.gnss) gnssEpochCount += 1;
    const previous = observations[index - 1];
    if (previous && previous.setupId === observation.setupId) {
      const distance = distance2d(previous, observation);
      if (distance != null && distance < 0.005) zeroLengthShotCount += 1;
    }
  });

  const duplicatePointCount = Array.from(pointCounts.values()).filter(count => count > 1).length;
  const uniquePointCount = pointCounts.size;
  const setupById = new Map(setups.map(setup => [setup.id, setup]));

  let longestShot = 0;
  observations.forEach(observation => {
    const setup = setupById.get(observation.setupId);
    const distance = setup ? distance2d(setup, observation) : undefined;
    if (distance != null) longestShot = Math.max(longestShot, distance);
  });

  let traverseDistance = 0;
  let traverseLegCount = 0;
  for (let index = 1; index < setups.length; index += 1) {
    const distance = distance2d(setups[index - 1], setups[index]);
    if (distance != null && distance > 0.01) {
      traverseDistance += distance;
      traverseLegCount += 1;
    }
  }

  const elevations = coordinates
    .map(point => point.elevation)
    .filter((value): value is number => value != null && !isSentinelElevation(value));
  const highestPoint = elevations.length ? Math.max(...elevations) : undefined;
  const lowestPoint = elevations.length ? Math.min(...elevations) : undefined;

  const times = observations
    .map(observation => observation.fieldTimeMs)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const fieldStartMs = times.length ? Math.min(...times) : undefined;
  const fieldEndMs = times.length ? Math.max(...times) : undefined;

  let replayDurationMs = 0;
  for (let index = 0; index < observations.length; index += 1) {
    const previous = observations[index - 1];
    if (!previous) continue;
    const a = previous.fieldTimeMs;
    const b = observations[index].fieldTimeMs;
    const gap = a != null && b != null && b > a ? clamp(b - a, 450, 6000) : 1100;
    replayDurationMs += gap;
    if (previous.setupId !== observations[index].setupId) replayDurationMs += 1200;
  }
  if (observations.length > 0) replayDurationMs = Math.max(replayDurationMs, 1200);

  let qualityScore = 100;
  if (coordinates.length === 0 && observations.length > 0) qualityScore -= 40;
  qualityScore -= missingElevationCount * 1.5;
  qualityScore -= duplicatePointCount * 2;
  qualityScore -= zeroLengthShotCount * 3;
  qualityScore -= skipped.length * 0.35;
  if (!hasRecordedTime) qualityScore -= 5;

  const equipmentKinds = Array.from(new Set(setups.map(setup => setup.equipment)));

  return {
    shotCount: observations.length,
    uniquePointCount,
    setupCount: setups.length,
    coordinateCount: coordinates.length,
    traverseLegCount,
    gnssEpochCount,
    missingElevationCount,
    duplicatePointCount,
    zeroLengthShotCount,
    longestShot,
    traverseDistance,
    highestPoint,
    lowestPoint,
    elevationRange: highestPoint != null && lowestPoint != null ? highestPoint - lowestPoint : undefined,
    fieldStartMs,
    fieldEndMs,
    fieldSpanMs: fieldStartMs != null && fieldEndMs != null ? fieldEndMs - fieldStartMs : undefined,
    replayDurationMs,
    qualityScore: Math.round(clamp(qualityScore, 0, 100)),
    equipmentKinds,
    timeSource: !hasRecordedTime
      ? 'none'
      : timedObservationCount >= observations.length * 0.6
        ? 'recorded'
        : 'partial',
  };
};

const addObservationBounds = (bounds: RawBounds, observation: RawObservation) => {
  if (observation.easting == null || observation.northing == null) return;
  bounds.minE = Math.min(bounds.minE, observation.easting);
  bounds.maxE = Math.max(bounds.maxE, observation.easting);
  bounds.minN = Math.min(bounds.minN, observation.northing);
  bounds.maxN = Math.max(bounds.maxN, observation.northing);
  if (observation.elevation != null && !isSentinelElevation(observation.elevation)) {
    bounds.minZ = Math.min(bounds.minZ, observation.elevation);
    bounds.maxZ = Math.max(bounds.maxZ, observation.elevation);
  }
};

const parseRw5 = (fileName: string, content: string, format: RawFormat): RawSurvey => {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  const job: RawJob = createJob(format);
  const setups: RawSetup[] = [];
  const observations: RawObservation[] = [];
  const skipped: RawSkippedRecord[] = [];
  const warnings: RawParseWarning[] = [];
  const storedPoints = new Map<string, { easting?: number; northing?: number; elevation?: number; description?: string }>();
  const anchors: Array<{ recordIndex: number; ms: number }> = [];
  const bounds = emptyBounds();

  let currentSetup: RawSetup | undefined;
  let pendingObservation: RawObservation | undefined;
  let lastObservation: RawObservation | undefined;
  let lastInstrumentHeight: number | undefined;
  let lastRodHeight: number | undefined;
  let lastDateText: string | undefined;
  let lastTimeText: string | undefined;
  let jobTimestamp: number | undefined;
  let baseInfo: RawBaseInfo | undefined;
  let baseId: string | undefined;
  let mountpoint: string | undefined;
  let sequence = 0;
  let explicitTimeCount = 0;
  let reflectorlessMode = false;

  const createSetup = (equipment: EquipmentKind, recordIndex = 0): RawSetup => {
    const setup: RawSetup = {
      id: `setup-${setups.length + 1}`,
      sequence: setups.length,
      equipment,
      sourceRecordIndex: recordIndex,
    };
    setups.push(setup);
    return setup;
  };

  const getSetup = (equipment: EquipmentKind, recordIndex: number): RawSetup => {
    if (!currentSetup) currentSetup = createSetup(equipment, recordIndex);
    if (currentSetup.equipment === 'unknown' && equipment !== 'unknown') currentSetup.equipment = equipment;
    return currentSetup;
  };

  const nextObservation = (): RawObservation => {
    const setup = currentSetup ?? getSetup('unknown', 0);
    sequence += 1;
    return {
      id: `obs-${sequence}`,
      sequence,
      setupId: setup.id,
      kind: 'unknown',
      timeQuality: 'estimated',
      sourceRecordIndex: 0,
    };
  };

  const addObservation = (observation: RawObservation) => {
    observations.push(observation);
    pendingObservation = observation;
    lastObservation = observation;
    addObservationBounds(bounds, observation);
  };

  const stampPending = (ms: number, text?: string) => {
    if (pendingObservation) {
      pendingObservation.fieldTimeMs = ms;
      pendingObservation.timeQuality = 'recorded';
      pendingObservation.recordedTimeText = text;
      explicitTimeCount += 1;
      anchors.push({ recordIndex: pendingObservation.sourceRecordIndex, ms });
    }
  };

  lines.forEach((rawLine, lineIndex) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;

    const tokens = line.split(',');
    const code = (tokens.shift() ?? '').trim().toUpperCase();
    const { fields, description } = parseFields(tokens);

    // Vendor notes can switch the EDM between prism and reflectorless mode.
    if (code.startsWith('--')) {
      const modeNote = `${description} ${line}`;
      if (/\b(REFLECTORLESS|NOREF|NO[\s-]*PRISM)\b/i.test(modeNote)) reflectorlessMode = true;
      else if (/\b(PRISM|REFLECTOR)\s+MODE\b/i.test(modeNote)) reflectorlessMode = false;
    }

    if (code.startsWith('--RTK') || line.toUpperCase().startsWith('--RTK')) {
      const network = line.match(/NTRIP\s+([^\s,]+)/i)?.[1];
      const explicitMount = line.match(/MOUNTPOINT\s*[=:]\s*([^\s,]+)/i)?.[1];
      mountpoint = explicitMount ?? network ?? mountpoint;
      if (currentSetup && mountpoint) currentSetup.mountpoint = mountpoint;
      return;
    }

    if (code.startsWith('--HSDV')) {
      const qualityText = fieldText(fields, 'STATUS', 'QUALITY')?.toUpperCase();
      const quality: GnssQuality = qualityText?.includes('FIX')
        ? 'fixed'
        : qualityText?.includes('FLOAT')
          ? 'float'
          : qualityText?.includes('DGPS')
            ? 'dgps'
            : 'unknown';
      const satellites = fieldNumber(fields, 'SATS', 'SAT', 'NS');
      const pdop = fieldNumber(fields, 'PDOP');
      const hdop = fieldNumber(fields, 'HDOP');
      const vdop = fieldNumber(fields, 'VDOP');
      const setup = currentSetup ?? getSetup('gnss-rover', lineIndex);
      setup.gnssQuality = quality;
      if (satellites != null) setup.satellites = satellites;
      if (pdop != null) setup.pdop = pdop;
      if (hdop != null) setup.hdop = hdop;
      if (vdop != null) setup.vdop = vdop;
      if (pendingObservation?.gnss) {
        pendingObservation.gnss.quality = quality;
        pendingObservation.gnss.satellites = satellites;
        pendingObservation.gnss.pdop = pdop;
        pendingObservation.gnss.hdop = hdop;
        pendingObservation.gnss.vdop = vdop;
      }
      return;
    }

    if (code === '--DT' || code.startsWith('--DT,')) {
      lastDateText = (tokens[0] ?? line.replace(/^--DT[,\s]*/i, '')).trim() || lastDateText;
      const combined = parseDateAndTime(lastDateText, lastTimeText);
      if (combined != null) {
        if (pendingObservation && Math.abs(pendingObservation.sourceRecordIndex - lineIndex) <= 6) stampPending(combined, `${lastDateText} ${lastTimeText}`);
        anchors.push({ recordIndex: lineIndex, ms: combined });
      }
      return;
    }

    if (code === '--TM' || code.startsWith('--TM,')) {
      lastTimeText = (tokens[0] ?? line.replace(/^--TM[,\s]*/i, '')).trim() || lastTimeText;
      const combined = parseDateAndTime(lastDateText, lastTimeText);
      if (combined != null) {
        if (pendingObservation && Math.abs(pendingObservation.sourceRecordIndex - lineIndex) <= 6) stampPending(combined, `${lastDateText} ${lastTimeText}`);
        anchors.push({ recordIndex: lineIndex, ms: combined });
      }
      return;
    }

    if (code === '--GT' || code.startsWith('--GT,')) {
      const stampText = (tokens[0] ?? line.replace(/^--GT[,\s]*/i, '')).trim();
      const stamp = parseDateAny(stampText) ?? parseDateAndTime(lastDateText, stampText);
      if (stamp != null) {
        stampPending(stamp, stampText);
        anchors.push({ recordIndex: lineIndex, ms: stamp });
      }
      return;
    }

    if (code === 'JB') {
      const dateText = fieldText(fields, 'DT') ?? lastDateText;
      const timeText = fieldText(fields, 'TM') ?? lastTimeText;
      if (dateText) {
        job.dateText = dateText;
        lastDateText = dateText;
      }
      if (timeText) {
        job.timeText = timeText;
        lastTimeText = timeText;
      }
      jobTimestamp = parseDateAndTime(job.dateText, job.timeText);
      if (jobTimestamp != null) {
        job.dateMs = jobTimestamp;
        anchors.push({ recordIndex: lineIndex, ms: jobTimestamp });
      }
      job.name = fieldText(fields, 'JOB', 'NAME') ?? job.name;
      return;
    }

    if (code === 'MO') {
      job.units = unitFromMarker(fieldText(fields, 'UN'));
      job.scaleFactor = fieldNumber(fields, 'SF');
      const angleMarker = fieldNumber(fields, 'AU');
      if (angleMarker === 1) job.angleUnit = 'gons';
      const edmMode = fieldText(fields, 'RM', 'REF', 'EDM', 'MODE');
      if (edmMode) {
        if (/\b(REFLECTORLESS|NOREF|NO[\s-]*PRISM|REF(?:L)?|DR)\b/i.test(edmMode)) reflectorlessMode = true;
        else if (/\b(PRISM|REFLECT(?:OR)?|STD|STANDARD)\b/i.test(edmMode)) reflectorlessMode = false;
      }
      return;
    }

    if (code === 'SP') {
      const pointNumber = asPointNumber(fieldText(fields, 'PN', 'FP', 'OP'));
      if (!pointNumber) {
        skipped.push({ recordIndex: lineIndex, code, line, reason: 'stored point without a point number' });
        return;
      }
      if (/^(delete|void|dummy|omit)\b/i.test(description.trim())) {
        skipped.push({ recordIndex: lineIndex, code, line, reason: `point ${pointNumber} marked --${description.trim()}` });
        return;
      }
      const easting = fieldNumber(fields, 'E');
      const northing = fieldNumber(fields, 'N');
      let elevation = fieldNumber(fields, 'EL', 'Z', 'H');
      if (isSentinelElevation(elevation)) elevation = undefined;
      storedPoints.set(pointNumber, { easting, northing, elevation, description });
      if (currentSetup && currentSetup.occupyPoint === pointNumber) {
        if (currentSetup.easting == null && easting != null) currentSetup.easting = easting;
        if (currentSetup.northing == null && northing != null) currentSetup.northing = northing;
        if (currentSetup.elevation == null && elevation != null) currentSetup.elevation = elevation;
      }
      return;
    }

    if (code === 'OC') {
      const occupy = asPointNumber(fieldText(fields, 'OP', 'PN'));
      const stored = occupy ? storedPoints.get(occupy) : undefined;
      currentSetup = createSetup('unknown', lineIndex);
      currentSetup.occupyPoint = occupy;
      currentSetup.easting = fieldNumber(fields, 'E') ?? stored?.easting;
      currentSetup.northing = fieldNumber(fields, 'N') ?? stored?.northing;
      currentSetup.elevation = fieldNumber(fields, 'EL', 'Z') ?? stored?.elevation;
      if (occupy && currentSetup.easting != null && currentSetup.northing != null && !storedPoints.has(occupy)) {
        storedPoints.set(occupy, {
          easting: currentSetup.easting,
          northing: currentSetup.northing,
          elevation: currentSetup.elevation,
          description: description || 'Occupied station',
        });
      }
      pendingObservation = undefined;
      return;
    }

    if (code === 'BK') {
      const setup = getSetup('total-station', lineIndex);
      const bp = asPointNumber(fieldText(fields, 'BP', 'PN')) ?? (fields.has('BP') ? undefined : asPointNumber(fieldText(fields, 'OP')));
      setup.backsightPoint = bp ?? setup.backsightPoint;
      setup.backsightAngle = fieldNumber(fields, 'BS', 'BC');
      const bsStored = setup.backsightPoint ? storedPoints.get(setup.backsightPoint) : undefined;
      if (bsStored?.easting != null && bsStored.northing != null) {
        setup.backsightEasting = bsStored.easting;
        setup.backsightNorthing = bsStored.northing;
        setup.backsightElevation = bsStored.elevation;
        if (setup.easting != null && setup.northing != null) {
          const azRad = Math.atan2(bsStored.easting - setup.easting, bsStored.northing - setup.northing);
          setup.backsightAzimuthDeg = ((azRad * 180) / Math.PI + 360) % 360;
        }
      } else if (setup.backsightAngle != null) {
        const bsDec = parseAngleToDecimalDegrees(fieldText(fields, 'BS', 'BC')) ?? setup.backsightAngle;
        setup.backsightAzimuthDeg = ((bsDec % 360) + 360) % 360;
      }
      pendingObservation = undefined;
      return;
    }

    if (code === 'LS') {
      const setup = getSetup('total-station', lineIndex);
      lastInstrumentHeight = fieldNumber(fields, 'HI') ?? lastInstrumentHeight;
      lastRodHeight = fieldNumber(fields, 'HR') ?? lastRodHeight;
      if (lastInstrumentHeight != null) setup.instrumentHeight = lastInstrumentHeight;
      if (lastRodHeight != null) setup.rodHeight = lastRodHeight;
      return;
    }

    if (code === 'SS' || code === 'TR' || code === 'BD' || code === 'BR' || code === 'FD' || code === 'FR' || code === 'ST') {
      if (!currentSetup || currentSetup.equipment === 'gnss-rover' || currentSetup.equipment === 'gnss-base') {
        currentSetup = createSetup('total-station', lineIndex);
      }
      const setup = getSetup('total-station', lineIndex);
      const pointNumber = asPointNumber(fieldText(fields, 'FP', 'PN'));
      const stored = pointNumber ? storedPoints.get(pointNumber) : undefined;
      const hi = setup.instrumentHeight ?? lastInstrumentHeight ?? 0;
      const hr = fieldNumber(fields, 'HR') ?? setup.rodHeight ?? lastRodHeight ?? 0;

      let easting = fieldNumber(fields, 'E') ?? stored?.easting;
      let northing = fieldNumber(fields, 'N') ?? stored?.northing;
      let elevation = fieldNumber(fields, 'EL', 'Z', 'H') ?? stored?.elevation;
      if (isSentinelElevation(elevation)) elevation = undefined;

      // Parse polar measurements (angles & distances) for telemetry and coordinate reduction when N/E are not inline
      const arRaw = fieldText(fields, 'AR', 'HA');
      const alRaw = fieldText(fields, 'AL');
      const azRaw = fieldText(fields, 'AZ');
      const zeRaw = fieldText(fields, 'ZE');
      const vaRaw = fieldText(fields, 'VA', 'CE');
      const sdVal = fieldNumber(fields, 'SD');
      const hdVal = fieldNumber(fields, 'HD');

      const angleScale = job.angleUnit === 'gons' ? 0.9 : 1;
      const arDeg = arRaw != null ? (parseAngleToDecimalDegrees(arRaw) ?? 0) * angleScale : undefined;
      const alDeg = alRaw != null ? (parseAngleToDecimalDegrees(alRaw) ?? 0) * angleScale : undefined;
      const azDegExplicit = azRaw != null ? (parseAngleToDecimalDegrees(azRaw) ?? 0) * angleScale : undefined;
      const zeDeg = zeRaw != null
        ? (parseAngleToDecimalDegrees(zeRaw) ?? 90) * angleScale
        : vaRaw != null
          ? 90 - (parseAngleToDecimalDegrees(vaRaw) ?? 0) * angleScale
          : 90;

      const baseAzDeg = setup.backsightAzimuthDeg ?? 0;
      const resolvedAzDeg = azDegExplicit != null
        ? ((azDegExplicit % 360) + 360) % 360
        : arDeg != null
          ? ((baseAzDeg + arDeg) % 360 + 360) % 360
          : alDeg != null
            ? ((baseAzDeg - alDeg) % 360 + 360) % 360
            : undefined;

      const zeRad = (zeDeg * Math.PI) / 180;
      const horizontalDistance = hdVal != null
        ? hdVal
        : sdVal != null
          ? sdVal * Math.sin(zeRad)
          : undefined;
      const verticalDelta = sdVal != null
        ? sdVal * Math.cos(zeRad)
        : hdVal != null && Math.abs(Math.sin(zeRad)) > 1e-6
          ? hdVal * (Math.cos(zeRad) / Math.sin(zeRad))
          : 0;

      if ((easting == null || northing == null) && setup.easting != null && setup.northing != null && resolvedAzDeg != null && horizontalDistance != null) {
        const azRad = (resolvedAzDeg * Math.PI) / 180;
        const sf = job.scaleFactor ?? 1;
        easting = setup.easting + horizontalDistance * sf * Math.sin(azRad);
        northing = setup.northing + horizontalDistance * sf * Math.cos(azRad);
        if (elevation == null && setup.elevation != null) {
          elevation = setup.elevation + hi + verticalDelta - hr;
        }
        if (pointNumber) {
          storedPoints.set(pointNumber, {
            easting,
            northing,
            elevation,
            description: description || stored?.description,
          });
        }
      }

      const observation = nextObservation();
      observation.setupId = setup.id;
      observation.kind = code === 'TR' ? 'traverse' : code === 'ST' ? 'stakeout' : 'sideshot';
      observation.pointNumber = pointNumber;
      observation.easting = easting;
      observation.northing = northing;
      observation.elevation = elevation;
      observation.description = description || stored?.description;
      const edmMode = fieldText(fields, 'RM', 'REF', 'EDM', 'MODE');
      observation.reflectorless = reflectorlessMode
        || /\b(REFLECTORLESS|NOREF|NO[\s-]*PRISM|REF(?:L)?|DR)\b/i.test(`${description} ${edmMode ?? ''}`);
      observation.instrumentHeight = setup.instrumentHeight ?? lastInstrumentHeight;
      observation.rodHeight = fieldNumber(fields, 'HR') ?? setup.rodHeight ?? lastRodHeight;
      observation.horizontalDistance = horizontalDistance ?? (setup.easting != null && easting != null ? distance2d(setup, { easting, northing }) : undefined);
      observation.slopeDistance = sdVal ?? observation.horizontalDistance;
      observation.azimuthDeg = resolvedAzDeg ?? (setup.easting != null && setup.northing != null && easting != null && northing != null
        ? (((Math.atan2(easting - setup.easting, northing - setup.northing) * 180) / Math.PI) + 360) % 360
        : undefined);
      observation.zenithDeg = zeRaw != null || vaRaw != null ? zeDeg : undefined;
      observation.sourceRecordIndex = lineIndex;
      addObservation(observation);
      return;
    }

    if (code === 'GPS') {
      if (!currentSetup || currentSetup.equipment !== 'gnss-rover') {
        currentSetup = createSetup('gnss-rover', lineIndex);
      }
      const setup = getSetup('gnss-rover', lineIndex);
      const observation = nextObservation();
      observation.setupId = setup.id;
      observation.kind = 'gps';
      observation.pointNumber = asPointNumber(fieldText(fields, 'PN', 'FP'));
      observation.easting = fieldNumber(fields, 'E');
      observation.northing = fieldNumber(fields, 'N');
      let elevation = fieldNumber(fields, 'EL', 'Z', 'H');
      if (isSentinelElevation(elevation)) elevation = undefined;
      observation.elevation = elevation;
      observation.description = description;
      observation.sourceRecordIndex = lineIndex;
      const latitude = parseAngleToDecimalDegrees(fieldText(fields, 'LA', 'LAT'));
      const longitude = parseAngleToDecimalDegrees(fieldText(fields, 'LN', 'LON'));
      const ellipsoidHeight = fieldNumber(fields, 'EL', 'Z', 'H');
      observation.gnss = {
        latitude,
        longitude,
        ellipsoidHeight: isSentinelElevation(ellipsoidHeight) ? undefined : ellipsoidHeight,
        quality: setup.gnssQuality,
        satellites: setup.satellites,
        baseId,
        mountpoint,
      };
      addObservation(observation);
      return;
    }

    if (code === '--GS') {
      if (!currentSetup || currentSetup.equipment !== 'gnss-rover') {
        currentSetup = createSetup('gnss-rover', lineIndex);
      }
      const setup = getSetup('gnss-rover', lineIndex);
      const pointNumber = asPointNumber(fieldText(fields, 'PN', 'FP'));
      const target = pendingObservation?.gnss && pendingObservation.pointNumber === pointNumber
        ? pendingObservation
        : undefined;
      const observation = target ?? nextObservation();
      if (!target) {
        observation.setupId = setup.id;
        observation.kind = 'gps';
        observation.pointNumber = pointNumber;
        observation.sourceRecordIndex = lineIndex;
        observation.timeQuality = 'estimated';
      }
      observation.easting = fieldNumber(fields, 'E') ?? observation.easting;
      observation.northing = fieldNumber(fields, 'N') ?? observation.northing;
      let elevation = fieldNumber(fields, 'EL', 'Z') ?? observation.elevation;
      if (isSentinelElevation(elevation)) elevation = undefined;
      observation.elevation = elevation;
      observation.description = observation.description || description;
      if (target) {
        pendingObservation = target;
        lastObservation = target;
        addObservationBounds(bounds, target);
      } else {
        addObservation(observation);
      }
      return;
    }

    if (code === 'BP') {
      const baseEasting = fieldNumber(fields, 'E');
      const baseNorthing = fieldNumber(fields, 'N');
      const baseElevation = fieldNumber(fields, 'EL', 'Z');
      const latitude = parseAngleToDecimalDegrees(fieldText(fields, 'LA', 'LAT'));
      const longitude = parseAngleToDecimalDegrees(fieldText(fields, 'LN', 'LON'));
      baseInfo = {
        ...(baseInfo ?? {}),
        id: asPointNumber(fieldText(fields, 'PN', 'OP')) ?? baseInfo?.id,
        easting: baseEasting ?? baseInfo?.easting,
        northing: baseNorthing ?? baseInfo?.northing,
        elevation: baseElevation ?? baseInfo?.elevation,
        latitude: latitude ?? baseInfo?.latitude,
        longitude: longitude ?? baseInfo?.longitude,
        source: 'file',
      };
      if (currentSetup) {
        currentSetup.equipment = 'gnss-base';
        if (baseInfo.id) currentSetup.baseId = baseInfo.id;
      }
      return;
    }

    if (code === 'G0') {
      const stampText = (tokens[0] ?? '').trim();
      const stamp = parseDateAny(stampText);
      baseId = asPointNumber(tokens[1]) ?? baseId;
      if (stamp != null) {
        stampPending(stamp, stampText);
        anchors.push({ recordIndex: lineIndex, ms: stamp });
      }
      if (currentSetup) {
        currentSetup.baseId = baseId;
        if (currentSetup.equipment === 'unknown') currentSetup.equipment = 'gnss-rover';
      }
      return;
    }

    if (code === 'G1') {
      baseId = asPointNumber(tokens[0]) ?? baseId;
      if (currentSetup) currentSetup.baseId = baseId;
      return;
    }

    if (code === 'G2' || code === 'G3' || code === 'G4' || code === 'G5' || code === 'G6' || code === 'G7' || code === 'G8' || code === 'G9') {
      const vectorX = fieldNumber(fields, 'DX', 'X');
      const vectorY = fieldNumber(fields, 'DY', 'Y');
      const vectorZ = fieldNumber(fields, 'DZ', 'Z');
      if (pendingObservation?.gnss && vectorX != null && vectorY != null && vectorZ != null) {
        pendingObservation.gnss.vector = { dx: vectorX, dy: vectorY, dz: vectorZ };
      }
      return;
    }

    if (description && pendingObservation && !pendingObservation.description) {
      pendingObservation.description = description;
      return;
    }

    skipped.push({ recordIndex: lineIndex, code: code || '(blank)', line, reason: 'not a geometry or timing record' });
  });

  // A point dump with no occupy/shoot records is still useful. Treat stored
  // points as a single unknown setup so Raw Replay can show them in 3D.
  if (observations.length === 0 && storedPoints.size > 0) {
    const setup = createSetup('unknown', 0);
    storedPoints.forEach((point, pointNumber) => {
      sequence += 1;
      const observation: RawObservation = {
        id: `obs-${sequence}`,
        sequence,
        setupId: setup.id,
        kind: 'sideshot',
        pointNumber,
        easting: point.easting,
        northing: point.northing,
        elevation: point.elevation,
        description: point.description,
        timeQuality: 'estimated',
        sourceRecordIndex: 0,
      };
      observations.push(observation);
    });
  }

  // Sanitize sentinel EL=0.0 on 2D design/LOD shots when the site is clearly elevated,
  // and detect extreme decimal-point elevation typos (e.g. EL 27870.0 when site is ~278.7).
  const nonZeroElevations = observations
    .map(obs => obs.elevation)
    .filter((z): z is number => z != null && !isSentinelElevation(z) && Math.abs(z) > 1e-4)
    .sort((a, b) => a - b);

  if (nonZeroElevations.length >= 5) {
    const medianZ = nonZeroElevations[Math.floor(nonZeroElevations.length * 0.5)];
    const q1Z = nonZeroElevations[Math.floor(nonZeroElevations.length * 0.25)];
    const q3Z = nonZeroElevations[Math.floor(nonZeroElevations.length * 0.75)];
    const iqrZ = Math.max(10, q3Z - q1Z);
    const maxPlausibleDelta = Math.max(500, iqrZ * 25);

    let zeroElevationCleared = 0;
    let blunderElevationCleared = 0;
    observations.forEach(obs => {
      if (obs.elevation == null) return;
      if (Math.abs(obs.elevation) <= 1e-4 && Math.abs(medianZ) > 35) {
        obs.elevation = undefined;
        zeroElevationCleared += 1;
      } else if (nonZeroElevations.length >= 10 && Math.abs(obs.elevation - medianZ) > maxPlausibleDelta) {
        warnings.push({
          code: 'elevation-outlier',
          severity: 'warning',
          recordIndex: obs.sourceRecordIndex,
          message: `Point ${obs.pointNumber ?? obs.sequence} has outlier elevation ${obs.elevation.toFixed(2)} (site median ${medianZ.toFixed(2)}); held at datum to preserve 3D relief.`,
        });
        obs.elevation = undefined;
        blunderElevationCleared += 1;
      }
    });
    if (zeroElevationCleared > 0) {
      warnings.push({
        code: 'zero-elevation-2d',
        severity: 'info',
        message: `${zeroElevationCleared} 2D point${zeroElevationCleared === 1 ? '' : 's'} with EL=0.0 were placed on the terrain/ground datum (site median ${medianZ.toFixed(1)}).`,
      });
    }
    if (blunderElevationCleared > 0) {
      // Already logged individual outlier warnings above
    }
  }

  // Recompute clean bounds after outlier/sentinel sanitation
  const cleanBounds = emptyBounds();
  observations.forEach(obs => addObservationBounds(cleanBounds, obs));
  bounds.minE = cleanBounds.minE;
  bounds.maxE = cleanBounds.maxE;
  bounds.minN = cleanBounds.minN;
  bounds.maxN = cleanBounds.maxN;
  bounds.minZ = cleanBounds.minZ;
  bounds.maxZ = cleanBounds.maxZ;

  // Attach timing to observations that did not carry an explicit timestamp.
  anchors.sort((a, b) => a.recordIndex - b.recordIndex || a.ms - b.ms);
  if (anchors.length > 0) {
    observations.forEach(observation => {
      if (observation.fieldTimeMs != null) return;
      const previous = [...anchors].reverse().find(anchor => anchor.recordIndex <= observation.sourceRecordIndex);
      const next = anchors.find(anchor => anchor.recordIndex > observation.sourceRecordIndex);
      if (previous && next) {
        const span = Math.max(1, next.recordIndex - previous.recordIndex);
        observation.fieldTimeMs = previous.ms + ((next.ms - previous.ms) * (observation.sourceRecordIndex - previous.recordIndex)) / span;
        observation.timeQuality = 'derived';
      } else if (previous) {
        observation.fieldTimeMs = previous.ms + (observation.sourceRecordIndex - previous.recordIndex) * 1000;
        observation.timeQuality = 'estimated';
      } else if (next) {
        observation.fieldTimeMs = next.ms - Math.max(1, next.recordIndex - observation.sourceRecordIndex) * 1000;
        observation.timeQuality = 'estimated';
      }
    });
  } else if (job.dateMs != null) {
    observations.forEach((observation, index) => {
      observation.fieldTimeMs = job.dateMs! + index * 1000;
      observation.timeQuality = 'estimated';
    });
  }

  if (mountpoint && baseInfo) baseInfo.mountpoint = mountpoint;
  const usableCoordinates = observations.filter(observation => observation.easting != null && observation.northing != null).length;

  if (observations.length === 0) {
    warnings.push({
      code: 'no-geometry',
      severity: 'error',
      message: 'No survey shots or points were found in this file.',
    });
  }
  if (usableCoordinates === 0 && observations.length > 0) {
    warnings.push({
      code: 'no-local-coordinates',
      severity: 'warning',
      message: 'GNSS records were found but no local grid coordinates were present. The summary is available; 3D placement needs N/E values from --GS or a stored point.',
    });
  }
  const missingElevations = observations.filter(observation => observation.elevation == null || isSentinelElevation(observation.elevation)).length;
  if (missingElevations > 0) {
    warnings.push({
      code: 'missing-elevation',
      severity: 'warning',
      message: `${missingElevations} shot${missingElevations === 1 ? '' : 's'} have no usable elevation. These are shown at the project ground plane.`,
    });
  }
  const duplicatePoints = new Map<string, number>();
  observations.forEach(observation => {
    if (observation.pointNumber) duplicatePoints.set(observation.pointNumber, (duplicatePoints.get(observation.pointNumber) ?? 0) + 1);
  });
  const duplicateCount = Array.from(duplicatePoints.values()).filter(count => count > 1).length;
  if (duplicateCount > 0) {
    warnings.push({
      code: 'duplicate-points',
      severity: 'warning',
      message: `${duplicateCount} point number${duplicateCount === 1 ? '' : 's'} appear more than once. Keep both observations; Raw Replay preserves the field sequence.`,
    });
  }
  if (observations.length > 0 && anchors.length === 0) {
    warnings.push({
      code: 'no-field-time',
      severity: 'info',
      message: 'The file has no date/time records. Replay uses observation order with an estimated cadence.',
    });
  }
  if (skipped.length > 0) {
    const codes = Array.from(new Set(skipped.map(record => record.code))).slice(0, 8);
    warnings.push({
      code: 'skipped-records',
      severity: 'info',
      message: `${skipped.length} non-geometry record${skipped.length === 1 ? '' : 's'} were ignored (${codes.join(', ')}). No field data was dropped from the replay.`,
    });
  }

  warnings.push(...analyseRawHeights(setups, observations, job.units));

  const stats = buildStats(setups, observations, skipped, explicitTimeCount, anchors.length > 0);
  const coordinateBounds = finalizeBounds(bounds);

  return {
    schemaVersion: 1,
    format,
    fileName,
    fileSize: content.length,
    parsedAt: new Date().toISOString(),
    job,
    setups,
    observations,
    base: baseInfo,
    stats,
    bounds: coordinateBounds,
    warnings,
    skipped,
    usable: observations.length > 0,
  };
};

const parseGsi = (fileName: string, content: string): RawSurvey => {
  const observations: RawObservation[] = [];
  const skipped: RawSkippedRecord[] = [];
  const bounds = emptyBounds();
  const setup: RawSetup = {
    id: 'setup-1',
    sequence: 0,
    equipment: 'total-station',
    sourceRecordIndex: 0,
  };
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  let sequence = 0;

  lines.forEach((rawLine, lineIndex) => {
    const line = rawLine.trim();
    if (!line) return;
    const fields = new Map<string, string>();
    const tokenPattern = /(\d{2})([+-]\d+(?:\.\d+)?)/g;
    let match: RegExpExecArray | null;
    while ((match = tokenPattern.exec(line))) {
      fields.set(match[1], match[2]);
    }
    const pointNumber = fields.get('11')?.replace(/^\+0*/, '') || fields.get('11')?.replace(/^\+/, '');
    const easting = toNumber(fields.get('41'));
    const northing = toNumber(fields.get('42'));
    const elevation = toNumber(fields.get('43'));
    const hasObservation = fields.has('21') || fields.has('22') || fields.has('31');
    if (!pointNumber && easting == null && northing == null) {
      skipped.push({ recordIndex: lineIndex, code: 'GSI', line, reason: 'no point or coordinate codes' });
      return;
    }
    if (easting == null && northing == null && !hasObservation) {
      skipped.push({ recordIndex: lineIndex, code: 'GSI', line, reason: 'point without coordinates' });
      return;
    }
    sequence += 1;
    const observation: RawObservation = {
      id: `obs-${sequence}`,
      sequence,
      setupId: setup.id,
      kind: hasObservation ? 'sideshot' : 'unknown',
      pointNumber,
      easting,
      northing,
      elevation: isSentinelElevation(elevation) ? undefined : elevation,
      instrumentHeight: toNumber(fields.get('81')),
      rodHeight: toNumber(fields.get('82')),
      timeQuality: 'estimated',
      sourceRecordIndex: lineIndex,
    };
    observations.push(observation);
    addObservationBounds(bounds, observation);
  });

  const warnings: RawParseWarning[] = [];
  if (observations.length === 0) {
    warnings.push({ code: 'no-geometry', severity: 'error', message: 'No GSI point records were found.' });
  } else if (observations.every(observation => observation.easting == null || observation.northing == null)) {
    warnings.push({
      code: 'no-local-coordinates',
      severity: 'warning',
      message: 'GSI measurement blocks without coordinate blocks were found. The summary is available; 3D placement needs coordinate records.',
    });
  }
  warnings.push(...analyseRawHeights([setup], observations, 'meter'));
  const stats = buildStats([setup], observations, skipped, 0, false);
  return {
    schemaVersion: 1,
    format: 'gsi',
    fileName,
    fileSize: content.length,
    parsedAt: new Date().toISOString(),
    job: {
      units: 'meter',
      azimuthNorth: true,
    },
    setups: [setup],
    observations,
    stats,
    bounds: finalizeBounds(bounds),
    warnings,
    skipped,
    usable: observations.length > 0,
  };
};

const parseLegacyPointDump = (fileName: string, content: string): RawSurvey => {
  const observations: RawObservation[] = [];
  const skipped: RawSkippedRecord[] = [];
  const bounds = emptyBounds();
  const setup: RawSetup = {
    id: 'setup-1',
    sequence: 0,
    equipment: 'unknown',
    sourceRecordIndex: 0,
  };
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  let sequence = 0;

  lines.forEach((rawLine, lineIndex) => {
    const line = rawLine.trim();
    if (!line) return;
    const keyed = line.match(/^P(\d+)\s*:\s*(.*)$/i);
    let pointNumber: string | undefined;
    let easting: number | undefined;
    let northing: number | undefined;
    let elevation: number | undefined;
    let description: string | undefined;

    if (keyed) {
      pointNumber = keyed[1];
      keyed[2].split(',').forEach(pair => {
        const match = pair.match(/^\s*([A-Za-z]+)\s*=\s*(.*)$/);
        if (!match) return;
        const key = match[1].toUpperCase();
        const value = match[2].trim();
        if (key === 'N') northing = toNumber(value);
        else if (key === 'E') easting = toNumber(value);
        else if (key === 'Z' || key === 'EL' || key === 'H') elevation = toNumber(value);
        else if (key === 'DESC' || key === 'DESCRIPTION') description = value;
      });
    } else if (!/^[A-Za-z]/.test(line)) {
      const tokens = line.split(/[\s,]+/).filter(Boolean);
      if (tokens.length >= 4) {
        pointNumber = tokens[0];
        easting = toNumber(tokens[1]);
        northing = toNumber(tokens[2]);
        elevation = toNumber(tokens[3]);
      }
    }

    if (easting == null || northing == null) {
      skipped.push({ recordIndex: lineIndex, code: 'POINT', line, reason: 'line is not a point record with N/E' });
      return;
    }
    sequence += 1;
    const observation: RawObservation = {
      id: `obs-${sequence}`,
      sequence,
      setupId: setup.id,
      kind: 'sideshot',
      pointNumber: pointNumber ?? String(sequence),
      easting,
      northing,
      elevation: isSentinelElevation(elevation) ? undefined : elevation,
      description,
      timeQuality: 'estimated',
      sourceRecordIndex: lineIndex,
    };
    observations.push(observation);
    addObservationBounds(bounds, observation);
  });

  const warnings: RawParseWarning[] = [];
  if (observations.length === 0) {
    warnings.push({ code: 'no-geometry', severity: 'error', message: 'No point records with N/E coordinates were found.' });
  }
  const stats = buildStats([setup], observations, skipped, 0, false);
  return {
    schemaVersion: 1,
    format: 'legacy-raw',
    fileName,
    fileSize: content.length,
    parsedAt: new Date().toISOString(),
    job: {
      units: fileName.toLowerCase().endsWith('.raw') ? 'us-survey-feet' : 'us-survey-feet',
      azimuthNorth: true,
    },
    setups: [setup],
    observations,
    stats,
    bounds: finalizeBounds(bounds),
    warnings,
    skipped,
    usable: observations.length > 0,
  };
};

export const detectRawFormat = (fileName: string, content: string): RawFormat => {
  const lower = fileName.toLowerCase();
  const sample = content.slice(0, 24000).toUpperCase();
  if (lower.endsWith('.gsi') || /^\*?\d{2}[+-]\d/im.test(sample)) return 'gsi';
  if (lower.endsWith('.fbk')) return 'tds';
  if (/^P\d+\s*:/im.test(sample)) return 'legacy-raw';
  if (/(^|\n)\s*(JB|MO|SP|OC|BK|LS|SS|TR|GPS|BP|G0)\s*,/m.test(sample)) {
    return lower.endsWith('.rw5') ? 'rw5' : lower.endsWith('.raw') ? 'legacy-raw' : 'tds';
  }
  if (/N\s*=/.test(sample) || /E\s*=/.test(sample)) return 'generic';
  return 'generic';
};

export const parseRawSurvey = (fileName: string, content: string): RawSurvey => {
  if (!content || !content.trim()) {
    return {
      schemaVersion: 1,
      format: 'generic',
      fileName,
      fileSize: content.length,
      parsedAt: new Date().toISOString(),
      job: { units: 'us-survey-feet', azimuthNorth: true },
      setups: [],
      observations: [],
      stats: buildStats([], [], [], 0, false),
      warnings: [{ code: 'empty-file', severity: 'error', message: 'The raw file is empty.' }],
      skipped: [],
      usable: false,
    };
  }

  const format = detectRawFormat(fileName, content);
  if (format === 'gsi') return parseGsi(fileName, content);
  if (format === 'legacy-raw' && !/(^|\n)\s*(JB|MO|SP|OC|BK|LS|SS|TR|GPS|BP|G0)\s*,/m.test(content.toUpperCase())) {
    return parseLegacyPointDump(fileName, content);
  }
  return parseRw5(fileName, content, format);
};

export const rawReplayUnitLabel = (unit: RawUnit): string => (
  unit === 'meter' ? 'm' : unit === 'international-feet' ? 'ft' : 'US ft'
);

export const DEMO_RW5_FILE: { name: string; content: string } = {
  name: 'ridgeview_topographic_survey.rw5',
  content: [
    'JB,NM RIDGEVIEW_TOPO_2026,DT11-14-2026,TM08:15:00',
    'MO,AD0,UN2,SF1.00000000,EC0,EO0.0,AU0',
    '--Crew: Party Chief J. Vance / Instrument: Leica TS16 + GS18T RTK',
    'SP,PN1,N 2401800.93,E 1316179.38,EL 303.22,--MONUMENT FOUND',
    'SP,PN2,N 2402069.76,E 1316391.84,EL 297.79,--CONTROL NAIL',
    'SP,PN3,N 2402365.90,E 1316616.77,EL 289.56,--TRAVERSE HUB',
    'SP,PN4,N 2402023.68,E 1317072.59,EL 288.47,--TRAVERSE HUB',
    '--DT11-14-2026',
    '--TM08:18:10',
    'OC,OP1,N 2401800.93,E 1316179.38,EL 303.22,--SETUP 1 SOUTH MONUMENT',
    'BK,OP1,BP2,BS38.2215',
    'LS,HI5.25,HR5.50',
    'SS,OP1,FP101,N 2401746.20,E 1316156.76,EL 304.18,--IRON PIN FND',
    '--TM08:20:05',
    'SS,OP1,FP102,N 2401697.56,E 1316399.92,EL 301.38,--EPWEST',
    '--TM08:22:18',
    'SS,OP1,FP103,N 2401759.70,E 1316493.07,EL 304.10,--TOP BANK',
    '--TM08:24:40',
    'SS,OP1,FP104,N 2401813.18,E 1316487.94,EL 301.53,--TOP BANK',
    '--TM08:26:55',
    'SS,OP1,FP105,N 2401882.15,E 1316508.62,EL 301.53,--OAK 24"',
    '--TM08:29:12',
    'SS,OP1,FP106,N 2401926.14,E 1316596.56,EL 296.60,--CL ROAD',
    '--TM08:31:30',
    'TR,OP1,FP2,N 2402069.76,E 1316391.84,EL 297.79,--FS CONTROL 2',
    '--TM08:38:00',
    'OC,OP2,N 2402069.76,E 1316391.84,EL 297.79,--SETUP 2 WEST RIDGE',
    'BK,OP2,BP1,BS218.2215',
    'LS,HI5.32,HR6.00',
    'SS,OP2,FP201,N 2402001.67,E 1316410.30,EL 297.49,--ROW RT',
    '--TM08:40:15',
    'SS,OP2,FP202,N 2402051.69,E 1316446.92,EL 297.49,--ROW LT',
    '--TM08:42:30',
    'SS,OP2,FP203,N 2402144.78,E 1316486.19,EL 294.15,--EP ASPHALT',
    '--TM08:44:45',
    'SS,OP2,FP204,N 2402190.95,E 1316840.99,EL 288.10,--SMH RIM',
    '--TM08:47:10',
    'SS,OP2,FP205,N 2402099.94,E 1316770.14,EL 274.51,--STM INLET',
    '--TM08:49:25',
    'TR,OP2,FP3,N 2402365.90,E 1316616.77,EL 289.56,--FS TRAVERSE 3',
    '--TM08:56:00',
    'OC,OP3,N 2402365.90,E 1316616.77,EL 289.56,--SETUP 3 NORTH KNOB',
    'BK,OP3,BP2,BS217.1500',
    'LS,HI5.18,HR5.50',
    'SS,OP3,FP301,N 2402358.41,E 1316603.27,EL 289.62,--REBAR CAP',
    '--TM08:58:20',
    'SS,OP3,FP302,N 2402415.08,E 1316608.50,EL 277.10,--SAN MH',
    '--TM09:00:45',
    'SS,OP3,FP303,N 2402527.43,E 1316690.87,EL 278.13,--FLOWLINE',
    '--TM09:03:10',
    'SS,OP3,FP304,N 2402583.60,E 1316732.06,EL 283.07,--HEADWALL',
    '--TM09:05:35',
    'TR,OP3,FP4,N 2402023.68,E 1317072.59,EL 288.47,--FS TRAVERSE 4',
    '--TM09:14:00',
    '--RTK,Method: Network: NTRIP CORS_PA_NET',
    'BP,PN900,LA40.041200,LN-75.382100,N 2406200.00,E 1321400.00,EL 412.00',
    'LS,HI6.5617,HR6.5617',
    '--HSDV,STATUS:FIXED,SATS:16,PDOP:1.1,HDOP:0.6,VDOP:0.9',
    'G0,11/14/2026 09:16:00,CORS_PA_NET',
    'GPS,PN401,LA40.021100,LN-75.398200,EL272.40,--TOPO SWALE',
    '--GS,PN401,N 2401947.77,E 1317160.58,EL 271.89,--TOPO SWALE',
    '--TM09:17:30',
    '--HSDV,STATUS:FIXED,SATS:17,PDOP:1.0,HDOP:0.5,VDOP:0.8',
    'GPS,PN402,LA40.021250,LN-75.397900,EL271.14,--TOPO SWALE',
    '--GS,PN402,N 2401881.21,E 1317251.48,EL 271.14,--TOPO SWALE',
    '--TM09:19:00',
    '--HSDV,STATUS:FIXED,SATS:15,PDOP:1.2,HDOP:0.7,VDOP:1.0',
    'GPS,PN403,LA40.021450,LN-75.397300,EL267.50,--RETENTION BASIN',
    '--GS,PN403,N 2402151.15,E 1317449.13,EL 267.50,--RETENTION BASIN',
    '--TM09:20:40',
    '--HSDV,STATUS:FLOAT,SATS:11,PDOP:2.1,HDOP:1.3,VDOP:1.6',
    'GPS,PN404,LA40.021600,LN-75.396800,EL260.00,--TREE CANOPY EDGE',
    '--GS,PN404,N 2402044.05,E 1317468.63,EL 260.00,--TREE CANOPY EDGE',
    '--TM09:22:15',
    '--HSDV,STATUS:FIXED,SATS:18,PDOP:0.9,HDOP:0.5,VDOP:0.7',
    'GPS,PN405,LA40.021800,LN-75.396400,EL268.00,--SPILLWAY CREST',
    '--GS,PN405,N 2401905.68,E 1317632.47,EL 268.00,--SPILLWAY CREST',
    '--TM09:24:00',
    '--HSDV,STATUS:FIXED,SATS:18,PDOP:0.9,HDOP:0.5,VDOP:0.7',
    'GPS,PN406,LA40.021950,LN-75.395900,EL254.05,--RISER TOP',
    '--GS,PN406,N 2402081.45,E 1317855.32,EL 254.05,--RISER TOP',
  ].join('\n'),
};
