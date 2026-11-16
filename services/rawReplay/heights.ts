import type { RawObservation, RawParseWarning, RawSetup, RawUnit } from './types';

export type HeightKind = 'instrument' | 'rod';

const METRES_PER_UNIT: Record<RawUnit, number> = {
  meter: 1,
  'international-feet': 0.3048,
  'us-survey-feet': 1200 / 3937,
};

/**
 * Generous working ranges in metres, not design limits. A short tripod and a
 * long prism pole both fit; values outside are far more likely a typo or a
 * metre/feet mix-up than real field equipment.
 */
const PLAUSIBLE_METRES: Record<HeightKind, { min: number; max: number }> = {
  instrument: { min: 0.6, max: 3.0 },
  rod: { min: 0.5, max: 8.0 },
};

/** A rod moving further than this between consecutive shots is worth a look. */
const ROD_JUMP_METRES = 2.5;

const MAX_HEIGHT_WARNINGS = 8;

const unitLabel = (unit: RawUnit) => (unit === 'meter' ? 'm' : 'ft');

export const plausibleHeightRange = (unit: RawUnit, kind: HeightKind): { min: number; max: number } => {
  const perUnit = 1 / METRES_PER_UNIT[unit];
  return {
    min: PLAUSIBLE_METRES[kind].min * perUnit,
    max: PLAUSIBLE_METRES[kind].max * perUnit,
  };
};

/** Keeps the 3D rigs in a rational size even when the file carries a bad value. */
export const resolveHeight = (
  value: number | null | undefined,
  unit: RawUnit,
  kind: HeightKind,
  fallback: number,
): number => {
  if (value == null || !Number.isFinite(value)) return fallback;
  const range = plausibleHeightRange(unit, kind);
  return Math.min(range.max, Math.max(range.min, value));
};

export const isHeightSuspected = (
  value: number | null | undefined,
  unit: RawUnit,
  kind: HeightKind,
): boolean => suspectedHeightIssue(value, unit, kind) != null;

const likelyUnit = (value: number, unit: RawUnit, kind: HeightKind): RawUnit | undefined => {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const metres = value * METRES_PER_UNIT[unit];
  const range = PLAUSIBLE_METRES[kind];
  if (metres >= range.min && metres <= range.max) return undefined;
  if (unit === 'meter') {
    const asFeetMetres = value * METRES_PER_UNIT['international-feet'];
    if (asFeetMetres >= range.min && asFeetMetres <= range.max) return 'international-feet';
  } else if (value >= range.min && value <= range.max) {
    return 'meter';
  }
  return undefined;
};

/**
 * A plain-language explanation for a suspect height, or undefined when the
 * value is within the plausible range. Shared by parser warnings and the HUD.
 */
export const suspectedHeightIssue = (
  value: number | null | undefined,
  unit: RawUnit,
  kind: HeightKind,
): string | undefined => {
  if (value == null || !Number.isFinite(value)) return undefined;
  const range = plausibleHeightRange(unit, kind);
  if (value >= range.min && value <= range.max) return undefined;

  const label = kind === 'rod' ? 'Rod height' : 'Instrument height';
  const code = kind === 'rod' ? 'HR' : 'HI';
  const likely = likelyUnit(value, unit, kind);
  const hint = likely
    ? ` It looks like ${likely === 'meter' ? 'metres' : 'feet'} (${(value * METRES_PER_UNIT[likely]).toFixed(2)} m).`
    : '';
  return `${label} ${value.toFixed(2)} ${unitLabel(unit)} is outside the plausible `
    + `${range.min.toFixed(2)}–${range.max.toFixed(2)} ${unitLabel(unit)} range.${hint} Check the ${code} entry.`;
};

/**
 * Audits parsed heights. This never rewrites field values: it reports what is
 * physically doubtful so the user can decide, and so the 3D view can clamp.
 */
export const analyseRawHeights = (
  setups: RawSetup[],
  observations: RawObservation[],
  unit: RawUnit,
): RawParseWarning[] => {
  const warnings: RawParseWarning[] = [];
  const seen = new Set<string>();

  const add = (
    kind: HeightKind,
    value: number | null | undefined,
    label: string,
    recordIndex: number,
    dedupeKey: string,
  ) => {
    if (warnings.length >= MAX_HEIGHT_WARNINGS) return;
    const issue = suspectedHeightIssue(value, unit, kind);
    if (!issue || seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    warnings.push({
      code: kind === 'rod' ? 'rod-height-suspect' : 'instrument-height-suspect',
      severity: 'warning',
      message: `${label}: ${issue}`,
      recordIndex,
    });
  };

  const setupById = new Map(setups.map(setup => [setup.id, setup]));
  const firstObservationBySetup = new Map<string, RawObservation>();
  observations.forEach(observation => {
    if (!firstObservationBySetup.has(observation.setupId)) {
      firstObservationBySetup.set(observation.setupId, observation);
    }
  });

  setups.forEach((setup, index) => {
    const label = `Setup ${index + 1}`;
    // Point the warning at the setup's first shot so the UI can jump there.
    const recordIndex = firstObservationBySetup.get(setup.id)?.sourceRecordIndex ?? setup.sourceRecordIndex;
    add('instrument', setup.instrumentHeight, label, recordIndex, `hi:${setup.id}`);
    add('rod', setup.rodHeight, label, recordIndex, `hr:${setup.id}`);
  });
  observations.forEach(observation => {
    const setup = setupById.get(observation.setupId);
    const label = `PN ${observation.pointNumber ?? observation.sequence}`;
    if (
      observation.instrumentHeight != null
      && (setup?.instrumentHeight == null
        || Math.abs(observation.instrumentHeight - setup.instrumentHeight) > 1e-9)
    ) {
      add(
        'instrument',
        observation.instrumentHeight,
        label,
        observation.sourceRecordIndex,
        `hi:${observation.setupId}:${Math.round(observation.instrumentHeight * 100)}`,
      );
    }
    if (
      observation.rodHeight != null
      && (setup?.rodHeight == null
        || Math.abs(observation.rodHeight - setup.rodHeight) > 1e-9)
    ) {
      add(
        'rod',
        observation.rodHeight,
        label,
        observation.sourceRecordIndex,
        `hr:${observation.setupId}:${Math.round(observation.rodHeight * 100)}`,
      );
    }
  });

  // A sudden rod change is more often a mistyped HR than a real move.
  let previous: RawObservation | undefined;
  observations.forEach(observation => {
    const current = observation.rodHeight;
    if (current == null || !Number.isFinite(current)) {
      previous = undefined;
      return;
    }
    if (
      previous
      && previous.setupId === observation.setupId
      && previous.rodHeight != null
      && !isHeightSuspected(current, unit, 'rod')
      && !isHeightSuspected(previous.rodHeight, unit, 'rod')
      && Math.abs(current - previous.rodHeight) * METRES_PER_UNIT[unit] > ROD_JUMP_METRES
      && warnings.length < MAX_HEIGHT_WARNINGS
    ) {
      warnings.push({
        code: 'rod-height-jump',
        severity: 'warning',
        message: `Rod height jumped ${previous.rodHeight.toFixed(2)} → ${current.toFixed(2)} ${unitLabel(unit)} between consecutive shots`
          + `${observation.pointNumber ? ` (PN ${observation.pointNumber})` : ''}. Verify the HR entry.`,
        recordIndex: observation.sourceRecordIndex,
      });
    }
    previous = observation;
  });

  return warnings;
};
