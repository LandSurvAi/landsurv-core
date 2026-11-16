import { rawReplayUnitLabel } from './parser';
import type { RawSurvey } from './types';

export interface RawSummaryRow {
  label: string;
  value: string;
  note?: string;
}

export interface RawSummary {
  title: string;
  formatLabel: string;
  narrative: string[];
  jobRows: RawSummaryRow[];
  equipmentRows: RawSummaryRow[];
  productionRows: RawSummaryRow[];
  qaRows: RawSummaryRow[];
  qualityScore: number;
  qualityLabel: string;
  qualityTone: 'good' | 'caution' | 'bad';
  generatedFrom: string;
}

const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

const formatNumber = (value: number | undefined, digits = 2): string => {
  if (value == null || !Number.isFinite(value)) return '—';
  return numberFormatter.format(Number(value.toFixed(digits)));
};

const formatDistance = (value: number | undefined): string => {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${formatNumber(value, value < 10 ? 2 : 1)} ft`;
};

const formatDuration = (ms: number | undefined): string => {
  if (ms == null || !Number.isFinite(ms)) return 'Not recorded';
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const formatClock = (ms: number | undefined): string => {
  if (ms == null || !Number.isFinite(ms)) return 'Not recorded';
  const date = new Date(ms);
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')} UTC`;
};

const formatFormat = (format: RawSurvey['format']): string => {
  switch (format) {
    case 'rw5':
      return 'RW5';
    case 'tds':
      return 'TDS / Survey Pro';
    case 'gsi':
      return 'Leica GSI';
    case 'legacy-raw':
      return 'legacy RAW';
    default:
      return 'text survey';
  }
};

const qualityFor = (score: number): { label: string; tone: RawSummary['qualityTone'] } => {
  if (score >= 92) return { label: 'Field-ready', tone: 'good' };
  if (score >= 80) return { label: 'Review recommended', tone: 'good' };
  if (score >= 62) return { label: 'Needs review', tone: 'caution' };
  return { label: 'Incomplete', tone: 'bad' };
};

const uniqueSetupCount = (survey: RawSurvey, equipment: string): number => (
  survey.setups.filter(setup => setup.equipment === equipment).length
);

export const buildRawSummary = (survey: RawSurvey): RawSummary => {
  const units = rawReplayUnitLabel(survey.job.units);
  const stats = survey.stats;
  const quality = qualityFor(stats.qualityScore);
  const formatLabel = formatFormat(survey.format);
  const title = survey.job.name?.trim() || survey.fileName.replace(/\.[^.]+$/, '');
  const equipment = survey.stats.equipmentKinds;
  const hasGnss = equipment.includes('gnss-rover') || equipment.includes('gnss-base');
  const hasTotalStation = equipment.includes('total-station') || equipment.includes('unknown');
  const fieldStart = formatClock(stats.fieldStartMs);
  const fieldEnd = formatClock(stats.fieldEndMs);
  const timeSourceLabel = stats.timeSource === 'recorded'
    ? 'Recorded field timestamps'
    : stats.timeSource === 'partial'
      ? 'Partially recorded, partly interpolated'
      : 'Observation order only (no timestamps)';

  const narrative: string[] = [];
  narrative.push(
    `${survey.fileName} is a ${formatLabel} raw survey containing ${formatNumber(stats.shotCount, 0)} observation${stats.shotCount === 1 ? '' : 's'} across ${formatNumber(stats.setupCount, 0)} setup${stats.setupCount === 1 ? '' : 's'}. ` +
    `The file resolves ${formatNumber(stats.uniquePointCount, 0)} unique point${stats.uniquePointCount === 1 ? '' : 's'}${stats.coordinateCount > 0 ? `, with ${formatNumber(stats.coordinateCount, 0)} carrying local grid coordinates` : ', but it does not contain local grid coordinates'}.`,
  );

  if (hasTotalStation && stats.traverseLegCount > 0) {
    narrative.push(
      `The traverse moves ${formatDistance(stats.traverseDistance)} across ${formatNumber(stats.traverseLegCount, 0)} leg${stats.traverseLegCount === 1 ? '' : 's'}. ` +
      `The longest observation from its instrument is ${formatDistance(stats.longestShot)}. ` +
      `This is a record of what was observed, not a least-squares adjustment; no coordinates were recomputed.`,
    );
  } else if (hasTotalStation) {
    narrative.push(
      `The observations are stored as setup-relative shots. The longest shot is ${formatDistance(stats.longestShot)}. ` +
      `No closing traverse legs were present, so the replay shows the observation fan rather than a closed loop.`,
    );
  }

  if (hasGnss) {
    narrative.push(
      `${formatNumber(stats.gnssEpochCount, 0)} GNSS epoch${stats.gnssEpochCount === 1 ? '' : 's'} are preserved in sequence. ` +
      `Where the raw file supplied --GS grid values, those local coordinates are used for the scene; the raw latitude/longitude values remain in the summary and are never substituted with a fabricated grid.`,
    );
  }

  if (stats.elevationRange != null) {
    narrative.push(
      `Ground relief across the observed points is ${formatDistance(stats.elevationRange)}, from ${formatDistance(stats.lowestPoint)} to ${formatDistance(stats.highestPoint)}. ` +
      `Missing or sentinel elevations are held at the local ground plane and called out in quality control rather than being invented.`,
    );
  }

  narrative.push(
    `Replay timing is ${timeSourceLabel.toLowerCase()}. ` +
    (stats.fieldSpanMs != null
      ? `The recorded field window runs from ${fieldStart} to ${fieldEnd} (${formatDuration(stats.fieldSpanMs)}). `
      : 'No reliable field window is available, so the replay uses a steady observation cadence. ') +
    `The transport sequence is the authoritative clock; timestamps label the work and compress long gaps, but they do not reorder observations.`,
  );

  narrative.push(
    stats.qualityScore >= 80
      ? `Quality control is ${quality.label.toLowerCase()} at ${stats.qualityScore}/100. The remaining checks are listed below; review them before using the file as a source of record.`
      : `Quality control is ${quality.label.toLowerCase()} at ${stats.qualityScore}/100. The file is still fully replayable, but the listed gaps should be resolved before the data is treated as complete.`,
  );

  const jobRows: RawSummaryRow[] = [
    { label: 'Job', value: title },
    { label: 'Source file', value: survey.fileName },
    { label: 'Format', value: formatLabel },
    { label: 'Units', value: survey.job.units === 'meter' ? 'Meters' : survey.job.units === 'international-feet' ? 'International feet' : 'US survey feet' },
    { label: 'Field date', value: survey.job.dateText ?? (stats.fieldStartMs != null ? new Date(stats.fieldStartMs).toISOString().slice(0, 10) : 'Not recorded') },
    { label: 'Field window', value: stats.fieldSpanMs != null ? `${fieldStart} – ${fieldEnd}` : 'Not recorded', note: stats.fieldSpanMs != null ? formatDuration(stats.fieldSpanMs) : undefined },
    { label: 'Clock source', value: timeSourceLabel },
  ];

  const equipmentRows: RawSummaryRow[] = [
    { label: 'Setups', value: formatNumber(stats.setupCount, 0) },
    { label: 'Total-station setups', value: formatNumber(uniqueSetupCount(survey, 'total-station'), 0) },
    { label: 'GNSS rover setups', value: formatNumber(uniqueSetupCount(survey, 'gnss-rover'), 0) },
    { label: 'GNSS epochs', value: formatNumber(stats.gnssEpochCount, 0) },
    { label: 'Base / mountpoint', value: survey.base?.mountpoint ?? survey.base?.id ?? 'Not present in file' },
    { label: 'Instrument model', value: 'Inferred from record grammar', note: 'Overridable at playback' },
  ];

  const productionRows: RawSummaryRow[] = [
    { label: 'Observations', value: formatNumber(stats.shotCount, 0) },
    { label: 'Unique points', value: formatNumber(stats.uniquePointCount, 0) },
    { label: 'Coordinate coverage', value: `${formatNumber(stats.coordinateCount, 0)} / ${formatNumber(stats.shotCount, 0)}`, note: stats.shotCount > 0 ? `${Math.round((stats.coordinateCount / stats.shotCount) * 100)}%` : undefined },
    { label: 'Traverse legs', value: formatNumber(stats.traverseLegCount, 0) },
    { label: 'Traverse distance', value: stats.traverseLegCount > 0 ? formatDistance(stats.traverseDistance) : '—' },
    { label: 'Longest shot', value: formatDistance(stats.longestShot) },
    { label: 'Elevation range', value: stats.elevationRange != null ? formatDistance(stats.elevationRange) : '—' },
    { label: 'Replay length', value: formatDuration(stats.replayDurationMs), note: 'Normalized transport clock' },
  ];

  const qaRows: RawSummaryRow[] = [
    { label: 'Quality score', value: `${stats.qualityScore} / 100`, note: quality.label },
    { label: 'Missing elevation', value: formatNumber(stats.missingElevationCount, 0), note: stats.missingElevationCount ? 'Held at ground plane' : 'Complete' },
    { label: 'Duplicate point numbers', value: formatNumber(stats.duplicatePointCount, 0), note: stats.duplicatePointCount ? 'Sequence preserved' : 'None' },
    { label: 'Zero-length shots', value: formatNumber(stats.zeroLengthShotCount, 0) },
    { label: 'Ignored records', value: formatNumber(survey.skipped.length, 0), note: survey.skipped.length ? 'Non-geometry only' : 'None' },
    { label: 'Clock', value: timeSourceLabel },
  ];

  return {
    title,
    formatLabel,
    narrative,
    jobRows,
    equipmentRows,
    productionRows,
    qaRows,
    qualityScore: stats.qualityScore,
    qualityLabel: quality.label,
    qualityTone: quality.tone,
    generatedFrom: `${survey.fileName} · ${units}`,
  };
};

const distanceBetween = (
  from: { easting?: number; northing?: number },
  to: { easting?: number; northing?: number },
): number => {
  if (from.easting == null || from.northing == null || to.easting == null || to.northing == null) return 0;
  return Math.hypot(to.easting - from.easting, to.northing - from.northing);
};

/**
 * Builds the summary through a replay position, not the whole file. This is
 * intentionally derived from the field record rather than from progress UI:
 * every count, time, setup and quality row is what had actually been observed
 * by that point in the sequence. At the final observation it is identical to
 * buildRawSummary().
 */
export const buildRawSummaryAt = (survey: RawSurvey, index: number): RawSummary => {
  const observations = survey.observations;
  if (observations.length === 0) return buildRawSummary(survey);
  const safeIndex = Math.max(0, Math.min(index, observations.length - 1));
  if (safeIndex === observations.length - 1) return buildRawSummary(survey);

  const visible = observations.slice(0, safeIndex + 1);
  const setupIds = new Set(visible.map(observation => observation.setupId));
  const visibleSetups = survey.setups.filter(setup => setupIds.has(setup.id));
  const coordinateObservations = visible.filter(
    observation => observation.easting != null && observation.northing != null,
  );

  let minE = Number.POSITIVE_INFINITY;
  let maxE = Number.NEGATIVE_INFINITY;
  let minN = Number.POSITIVE_INFINITY;
  let maxN = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  coordinateObservations.forEach(observation => {
    minE = Math.min(minE, observation.easting!);
    maxE = Math.max(maxE, observation.easting!);
    minN = Math.min(minN, observation.northing!);
    maxN = Math.max(maxN, observation.northing!);
    if (observation.elevation != null && observation.elevation > -9000) {
      minZ = Math.min(minZ, observation.elevation);
      maxZ = Math.max(maxZ, observation.elevation);
    }
  });
  const hasBounds = Number.isFinite(minE) && Number.isFinite(minN);
  const bounds = hasBounds
    ? {
      minE,
      maxE,
      minN,
      maxN,
      minZ: Number.isFinite(minZ) ? minZ : 0,
      maxZ: Number.isFinite(maxZ) ? maxZ : 0,
    }
    : survey.bounds;

  const pointKeys = new Set<string>();
  let duplicatePointCount = 0;
  visible.forEach(observation => {
    const key = observation.pointNumber
      ?? (observation.easting != null && observation.northing != null
        ? `${observation.easting.toFixed(3)}|${observation.northing.toFixed(3)}`
        : observation.id);
    if (pointKeys.has(key)) duplicatePointCount += 1;
    pointKeys.add(key);
  });

  const setupMap = new Map(visibleSetups.map(setup => [setup.id, setup]));
  let longestShot = 0;
  let zeroLengthShotCount = 0;
  coordinateObservations.forEach(observation => {
    const setup = setupMap.get(observation.setupId);
    const distance = setup ? distanceBetween(setup, observation) : 0;
    longestShot = Math.max(longestShot, distance);
    if (distance < 0.01 && setup?.easting != null) zeroLengthShotCount += 1;
  });

  let traverseDistance = 0;
  let previousTraverse: RawSurvey['observations'][number] | undefined;
  visible.filter(observation => observation.kind === 'traverse').forEach(observation => {
    if (previousTraverse) traverseDistance += distanceBetween(previousTraverse, observation);
    previousTraverse = observation;
  });

  const times = visible
    .map(observation => observation.fieldTimeMs)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const fieldStartMs = times.length > 0 ? Math.min(...times) : survey.stats.fieldStartMs;
  const fieldEndMs = times.length > 0 ? Math.max(...times) : survey.stats.fieldEndMs;
  const fieldSpanMs = fieldStartMs != null && fieldEndMs != null ? fieldEndMs - fieldStartMs : undefined;
  const timestampFraction = times.length / Math.max(1, visible.length);
  const timeSource: RawSurvey['stats']['timeSource'] = timestampFraction >= 0.99
    ? 'recorded'
    : timestampFraction > 0
      ? 'partial'
      : 'none';
  const elevationValues = coordinateObservations
    .map(observation => observation.elevation)
    .filter((value): value is number => value != null && value > -9000);
  const lowestPoint = elevationValues.length > 0 ? Math.min(...elevationValues) : undefined;
  const highestPoint = elevationValues.length > 0 ? Math.max(...elevationValues) : undefined;

  const stats: RawSurvey['stats'] = {
    ...survey.stats,
    shotCount: visible.length,
    uniquePointCount: pointKeys.size,
    setupCount: visibleSetups.length,
    coordinateCount: coordinateObservations.length,
    traverseLegCount: visible.filter(observation => observation.kind === 'traverse').length,
    gnssEpochCount: visible.filter(observation => observation.kind === 'gps' || observation.gnss != null).length,
    missingElevationCount: coordinateObservations.filter(observation => observation.elevation == null).length,
    duplicatePointCount,
    zeroLengthShotCount,
    longestShot,
    traverseDistance,
    highestPoint,
    lowestPoint,
    elevationRange: highestPoint != null && lowestPoint != null ? highestPoint - lowestPoint : undefined,
    fieldStartMs,
    fieldEndMs,
    fieldSpanMs,
    replayDurationMs: Math.round(
      survey.stats.replayDurationMs * (visible.length / Math.max(1, survey.stats.shotCount)),
    ),
    qualityScore: survey.stats.qualityScore,
    equipmentKinds: Array.from(new Set(visibleSetups.map(setup => setup.equipment))),
    timeSource,
  };

  const lastRecordIndex = visible[visible.length - 1]?.sourceRecordIndex ?? -1;
  const prefixSurvey: RawSurvey = {
    ...survey,
    setups: visibleSetups,
    observations: visible,
    bounds,
    stats,
    warnings: survey.warnings.filter(
      warning => warning.recordIndex == null || warning.recordIndex <= lastRecordIndex,
    ),
    skipped: survey.skipped.filter(skipped => skipped.recordIndex <= lastRecordIndex),
  };

  const summary = buildRawSummary(prefixSurvey);
  const current = visible[visible.length - 1];
  const pointLabel = current?.pointNumber ? `PN ${current.pointNumber}` : `shot ${current?.sequence ?? 0}`;
  summary.generatedFrom = `${survey.fileName} · through ${pointLabel} · ${visible.length} of ${observations.length} observations`;
  return summary;
};
