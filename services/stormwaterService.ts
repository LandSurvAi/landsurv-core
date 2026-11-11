/**
 * Stormwater Quick-Check Engine
 *
 * Deterministic Rational Method (Q = C i A) hydrology for preliminary
 * stormwater runoff estimates, plus FAA time-of-concentration.
 *
 * Engineering data and method:
 *   - Rainfall: NOAA Atlas 14 point precipitation frequency (fetched per site),
 *     or a user-supplied design intensity for the selected storm.
 *   - Runoff coefficients: editable Rational Method reference table. Users can
 *     override C per surface to match the local jurisdiction.
 *   - FAA Tc: FAA AC 150/5320-5D.
 *
 * Adapted from the alexengineered/stormwater-quickcheck calculator
 * (https://github.com/alexengineered/stormwater-quickcheck, CC BY-NC 4.0).
 * The calculation model is retained; the UI and national rainfall lookup are
 * rebuilt for LandSurv.ai.
 *
 * Preliminary planning only. Many jurisdictions require continuous
 * simulation (EPA SWMM, HEC-HMS, or an approved local model) for permits.
 */

import type {
  DetentionRoutingResult,
  ManningChannelResult,
  StormwaterHydrographResult,
} from './stormwaterHydraulics.ts';

export const SQFT_PER_ACRE = 43560;
export const GPM_PER_CFS = 448.831;

export interface StormwaterHydraulicsSummary {
  hydrograph?: StormwaterHydrographResult | null;
  routing?: DetentionRoutingResult | null;
  channel?: ManningChannelResult | null;
}

/** Common limit for Rational Method conveyance sizing. */
export const MAX_AREA_ACRES_STRICT = 10;
/** Extended limit; above this the Rational Method is not appropriate. */
export const MAX_AREA_ACRES_EXTENDED = 50;


export const STORMWATER_RETURN_PERIODS = [2, 5, 10, 25, 50, 100] as const;
export type StormwaterReturnPeriod = (typeof STORMWATER_RETURN_PERIODS)[number];

export const STORMWATER_DURATIONS = [5, 10, 15, 30, 60, 120, 180] as const;
export type StormwaterDurationMinutes = (typeof STORMWATER_DURATIONS)[number];

export const STORMWATER_DURATION_LABELS: Record<number, string> = {
  5: '5-min',
  10: '10-min',
  15: '15-min',
  30: '30-min',
  60: '1-hour',
  120: '2-hour',
  180: '3-hour',
};

/**
 * Rainfall intensity data for the site. NOAA Atlas 14 is the primary source;
 * a manual single-storm intensity is supported for quick checks.
 */
export interface StormwaterRainfall {
  source: 'noaa-atlas14' | 'manual';
  /** Human-readable source name shown on reports. */
  label: string;
  citation: string;
  /** Intensity in in/hr keyed by return period, then duration minutes. */
  intensitiesByReturnPeriod: Record<number, Record<number, number>>;
  latitude: number | null;
  longitude: number | null;
}

export interface StormwaterSurfaceType {
  key: string;
  coefficient: number;
  description: string;
}

/**
 * Rational Method reference runoff coefficients. These are editable per
 * surface; the table is a starting point, not a jurisdiction mandate.
 */
export const STORMWATER_SURFACE_TYPES: StormwaterSurfaceType[] = [
  { key: 'Pavement and Roofs', coefficient: 0.9, description: 'Streets, parking lots, driveways, rooftops' },
  { key: 'Gravel Areas', coefficient: 0.8, description: 'Unpaved roads, gravel parking areas' },
  { key: 'Bare Soil', coefficient: 0.6, description: 'Exposed earth, construction sites' },
  { key: 'Lawns', coefficient: 0.25, description: 'Maintained grass areas' },
  { key: 'Landscaped Areas', coefficient: 0.2, description: 'Gardens, planted beds' },
  { key: 'Pasture', coefficient: 0.2, description: 'Pasture land, agricultural grass' },
  { key: 'Light Forest', coefficient: 0.15, description: 'Sparse tree cover, shrubs' },
  { key: 'Dense Forest', coefficient: 0.1, description: 'Undisturbed natural forest areas' },
  { key: 'Open Water', coefficient: 1.0, description: 'Ponds, lakes, and wetlands' },
];

export const STORMWATER_SURFACE_BY_KEY: Record<string, StormwaterSurfaceType> = Object.fromEntries(
  STORMWATER_SURFACE_TYPES.map((surface) => [surface.key, surface]),
);

export interface StormwaterSurface {
  /** One of STORMWATER_SURFACE_TYPES[].key. */
  type: string;
  areaSqFt: number;
  /** Overrides the table C value when the jurisdiction requires a different coefficient. */
  coefficient?: number;
}

export interface StormwaterSurfaceBreakdown extends StormwaterSurface {
  coefficient: number;
  acres: number;
  percentOfArea: number;
}

export interface StormwaterRunoffInput {
  surfaces: StormwaterSurface[];
  returnPeriod: StormwaterReturnPeriod;
  /** Design storm duration. Omit to use the Tc recommendation when Tc inputs are supplied. */
  durationMinutes?: number;
  /** Longest flow path length in feet (FAA Tc). */
  flowLengthFt?: number;
  /** Average slope along the flow path, percent (FAA Tc). */
  slopePercent?: number;
  location?: string;
  latitude?: number;
  longitude?: number;
  /** Full IDF curve for the site (NOAA Atlas 14 or equivalent). */
  rainfall?: StormwaterRainfall;
  /** Single design intensity override for the selected duration. */
  designIntensityInPerHr?: number;
}

export interface StormwaterRunoffResult {
  peakRunoffCfs: number;
  peakRunoffGpm: number;
  weightedC: number;
  totalAreaSqFt: number;
  totalAreaAcres: number;
  rainfallIntensity: number;
  returnPeriod: StormwaterReturnPeriod;
  durationMinutes: number;
  durationLabel: string;
  durationSource: 'time-of-concentration' | 'manual';
  recommendedDurationMinutes: number;
  tcMinutes: number | null;
  tcFlowLengthFt: number | null;
  tcSlopePercent: number | null;
  surfaces: StormwaterSurfaceBreakdown[];
  citation: string;
  dataSource: string;
  rainfallSource: 'noaa-atlas14' | 'manual';
  warnings: string[];
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  computedAt: number;
}

export interface StormwaterDetentionInput extends StormwaterRunoffInput {
  /** Allowable release rate to the downstream system, cfs. */
  allowableOutflowCfs: number;
  /** Multiplier on the net storage volume. Defaults to 1.0. */
  safetyFactor?: number;
}

export interface StormwaterDetentionTrial {
  durationMinutes: number;
  durationLabel: string;
  rainfallIntensity: number;
  peakInflowCfs: number;
  storageCf: number;
}

export interface StormwaterDetentionResult {
  returnPeriod: StormwaterReturnPeriod;
  allowableOutflowCfs: number;
  safetyFactor: number;
  requiredStorageCf: number;
  requiredStorageAcreFt: number;
  requiredStorageGallons: number;
  governingDurationMinutes: number;
  governingDurationLabel: string;
  peakInflowCfs: number;
  rainfallIntensity: number;
  weightedC: number;
  totalAreaSqFt: number;
  totalAreaAcres: number;
  tcMinutes: number | null;
  trials: StormwaterDetentionTrial[];
  method: string;
  warnings: string[];
  computedAt: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isStormwaterReturnPeriod(value: unknown): value is StormwaterReturnPeriod {
  return (
    typeof value === 'number' &&
    (STORMWATER_RETURN_PERIODS as readonly number[]).includes(value)
  );
}

/**
 * FAA time of concentration (minutes).
 *
 *   Tc = 1.8 * (1.1 - C) * L^0.5 / S^0.33
 *
 * Valid for small urban drainage areas. Returns the 5-minute floor for
 * non-positive length or slope, and caps at 180 minutes.
 */
export function calculateTimeOfConcentrationFaa(
  weightedC: number,
  flowLengthFt: number,
  slopePercent: number,
): number {
  if (!Number.isFinite(flowLengthFt) || !Number.isFinite(slopePercent)) return 5;
  if (flowLengthFt <= 0 || slopePercent <= 0) return 5;
  const c = clamp(weightedC, 0, 1);
  const tc = (1.8 * (1.1 - c) * Math.sqrt(flowLengthFt)) / Math.pow(slopePercent, 0.333);
  return clamp(tc, 5, 180);
}

/** Round a Tc up to the next available IDF duration. */
export function getRecommendedDuration(tcMinutes: number): StormwaterDurationMinutes {
  for (const duration of STORMWATER_DURATIONS) {
    if (duration >= tcMinutes) return duration;
  }
  return STORMWATER_DURATIONS[STORMWATER_DURATIONS.length - 1];
}

/** Area-weighted composite runoff coefficient. */
export function calculateWeightedC(surfaces: StormwaterSurface[]): number {
  const totalArea = surfaces.reduce((sum, surface) => sum + Math.max(0, surface.areaSqFt), 0);
  if (totalArea <= 0) return 0;
  const weighted = surfaces.reduce((sum, surface) => {
    const coefficient = resolveCoefficient(surface);
    return sum + Math.max(0, surface.areaSqFt) * coefficient;
  }, 0);
  return weighted / totalArea;
}

export function resolveCoefficient(surface: StormwaterSurface): number {
  if (typeof surface.coefficient === 'number' && Number.isFinite(surface.coefficient)) {
    return clamp(surface.coefficient, 0, 1);
  }
  return STORMWATER_SURFACE_BY_KEY[surface.type]?.coefficient ?? 0.9;
}

export function rainfallIntensityFor(
  rainfall: StormwaterRainfall | undefined,
  returnPeriod: StormwaterReturnPeriod,
  durationMinutes: number,
): number | null {
  const intensity = rainfall?.intensitiesByReturnPeriod?.[returnPeriod]?.[durationMinutes];
  return typeof intensity === 'number' && Number.isFinite(intensity) ? intensity : null;
}

/**
 * Compute peak runoff with the Rational Method.
 *
 * Q = C * i * A, with Q in cfs, i in in/hr, and A in acres.
 */
export function computeStormwaterRunoff(input: StormwaterRunoffInput): StormwaterRunoffResult {
  const surfaces = (input.surfaces ?? []).filter(
    (surface) => Number.isFinite(surface.areaSqFt) && surface.areaSqFt > 0,
  );
  if (surfaces.length === 0) {
    throw new Error('At least one contributing surface with a positive area is required.');
  }
  if (!isStormwaterReturnPeriod(input.returnPeriod)) {
    throw new Error(`Unsupported return period: ${String(input.returnPeriod)}`);
  }

  const totalAreaSqFt = surfaces.reduce((sum, surface) => sum + surface.areaSqFt, 0);
  const totalAreaAcres = totalAreaSqFt / SQFT_PER_ACRE;
  const weightedC = calculateWeightedC(surfaces);

  const hasTcInputs =
    typeof input.flowLengthFt === 'number' &&
    input.flowLengthFt > 0 &&
    typeof input.slopePercent === 'number' &&
    input.slopePercent > 0;
  const tcMinutes = hasTcInputs
    ? calculateTimeOfConcentrationFaa(weightedC, input.flowLengthFt as number, input.slopePercent as number)
    : null;
  const recommendedDurationMinutes = tcMinutes !== null
    ? getRecommendedDuration(tcMinutes)
    : 15;

  const requestedDuration =
    typeof input.durationMinutes === 'number' && Number.isFinite(input.durationMinutes)
      ? input.durationMinutes
      : null;
  const durationMinutes = requestedDuration ?? recommendedDurationMinutes;
  const durationSource: 'time-of-concentration' | 'manual' =
    requestedDuration === null && tcMinutes !== null ? 'time-of-concentration' : 'manual';

  const manualIntensity =
    typeof input.designIntensityInPerHr === 'number' &&
    Number.isFinite(input.designIntensityInPerHr) &&
    input.designIntensityInPerHr > 0
      ? input.designIntensityInPerHr
      : null;
  const intensity =
    manualIntensity ??
    rainfallIntensityFor(input.rainfall, input.returnPeriod, durationMinutes);
  if (intensity === null) {
    throw new Error(
      `No rainfall intensity is available for the ${input.returnPeriod}-year, ${durationMinutes}-minute storm. ` +
        'Fetch NOAA Atlas 14 rainfall for the site or enter a design intensity.',
    );
  }

  const peakRunoffCfs = weightedC * intensity * totalAreaAcres;
  const peakRunoffGpm = peakRunoffCfs * GPM_PER_CFS;

  const warnings: string[] = [];
  if (totalAreaAcres > MAX_AREA_ACRES_EXTENDED) {
    warnings.push(
      `Area (${totalAreaAcres.toFixed(2)} acres) exceeds ${MAX_AREA_ACRES_EXTENDED} acres. ` +
        'The Rational Method is not appropriate at this scale; use continuous simulation (EPA SWMM, HEC-HMS, or an approved local model).',
    );
  } else if (totalAreaAcres > MAX_AREA_ACRES_STRICT) {
    warnings.push(
      `Area (${totalAreaAcres.toFixed(2)} acres) exceeds ${MAX_AREA_ACRES_STRICT} acres. ` +
        'Many jurisdictions limit the Rational Method to under 10 acres for conveyance sizing; ' +
        'consider continuous simulation for permit applications.',
    );
  }
  if (weightedC > 0.95) {
    warnings.push('Very high composite runoff coefficient (C > 0.95). Verify the surface breakdown.');
  }

  const hasCoordinates =
    typeof input.latitude === 'number' &&
    Number.isFinite(input.latitude) &&
    typeof input.longitude === 'number' &&
    Number.isFinite(input.longitude);
  if (hasCoordinates && !input.rainfall && manualIntensity === null) {
    warnings.push(
      'Coordinates were supplied without NOAA Atlas 14 rainfall. Verify the design intensity against ' +
        'the local jurisdiction.',
    );
  }
  if (hasTcInputs && durationSource === 'manual' && durationMinutes < (tcMinutes as number)) {
    warnings.push(
      `The selected ${durationMinutes}-minute storm is shorter than the ${(tcMinutes as number).toFixed(1)}-minute Tc.`,
    );
  }

  const citation =
    input.rainfall?.citation ??
    'Manual design intensity supplied by the user; verify against the local jurisdiction.';

  const breakdown: StormwaterSurfaceBreakdown[] = surfaces.map((surface) => {
    const coefficient = resolveCoefficient(surface);
    return {
      ...surface,
      coefficient,
      acres: surface.areaSqFt / SQFT_PER_ACRE,
      percentOfArea: (surface.areaSqFt / totalAreaSqFt) * 100,
    };
  });

  return {
    peakRunoffCfs,
    peakRunoffGpm,
    weightedC,
    totalAreaSqFt,
    totalAreaAcres,
    rainfallIntensity: intensity,
    returnPeriod: input.returnPeriod,
    durationMinutes,
    durationLabel: STORMWATER_DURATION_LABELS[durationMinutes] ?? `${durationMinutes}-min`,
    durationSource,
    recommendedDurationMinutes,
    tcMinutes,
    tcFlowLengthFt: hasTcInputs ? (input.flowLengthFt as number) : null,
    tcSlopePercent: hasTcInputs ? (input.slopePercent as number) : null,
    surfaces: breakdown,
    citation,
    dataSource: input.rainfall?.label ?? 'Manual design intensity',
    rainfallSource: input.rainfall?.source ?? 'manual',
    warnings,
    location: input.location?.trim() || null,
    latitude: hasCoordinates ? (input.latitude as number) : null,
    longitude: hasCoordinates ? (input.longitude as number) : null,
    computedAt: Date.now(),
  };
}

/**
 * Preliminary detention storage with the Modified Rational Method.
 *
 * For each available storm duration the inflow peak is Q = C i(td) A and the
 * storage estimate is Vs = (Qin - Qout) x td, multiplied by the safety factor.
 * The governing (largest) volume across the trial durations is reported. The
 * duration search starts at the Tc-recommended storm when flow-path data is
 * supplied, otherwise it starts at the shortest available storm.
 *
 * This is a screening estimate. Route the design storm through the basin
 * (EPA SWMM, HEC-HMS, or an approved local model) before sizing the outlet.
 */
export function computeStormwaterDetention(
  input: StormwaterDetentionInput,
): StormwaterDetentionResult {
  if (!Number.isFinite(input.allowableOutflowCfs) || input.allowableOutflowCfs < 0) {
    throw new Error('allowableOutflowCfs must be zero or greater.');
  }
  if (!input.rainfall) {
    throw new Error(
      'Detention sizing needs a full IDF curve. Fetch NOAA Atlas 14 rainfall for the site first; ' +
        'a single manual intensity is not enough for the critical-duration search.',
    );
  }
  const safetyFactor = input.safetyFactor ?? 1;
  if (!Number.isFinite(safetyFactor) || safetyFactor < 1) {
    throw new Error('safetyFactor must be at least 1.0.');
  }

  const surfaces = (input.surfaces ?? []).filter(
    (surface) => Number.isFinite(surface.areaSqFt) && surface.areaSqFt > 0,
  );
  if (surfaces.length === 0) {
    throw new Error('At least one contributing surface with a positive area is required.');
  }

  const weightedC = calculateWeightedC(surfaces);
  const totalAreaSqFt = surfaces.reduce((sum, surface) => sum + surface.areaSqFt, 0);
  const totalAreaAcres = totalAreaSqFt / SQFT_PER_ACRE;
  const hasTcInputs =
    typeof input.flowLengthFt === 'number' &&
    input.flowLengthFt > 0 &&
    typeof input.slopePercent === 'number' &&
    input.slopePercent > 0;
  const tcMinutes = hasTcInputs
    ? calculateTimeOfConcentrationFaa(
        weightedC,
        input.flowLengthFt as number,
        input.slopePercent as number,
      )
    : null;
  const startDuration = tcMinutes !== null ? getRecommendedDuration(tcMinutes) : STORMWATER_DURATIONS[0];

  const trials: StormwaterDetentionTrial[] = [];
  const warningSet = new Set<string>();
  for (const duration of STORMWATER_DURATIONS) {
    if (duration < startDuration) continue;
    const runoff = computeStormwaterRunoff({
      surfaces,
      returnPeriod: input.returnPeriod,
      durationMinutes: duration,
      flowLengthFt: input.flowLengthFt,
      slopePercent: input.slopePercent,
      location: input.location,
      latitude: input.latitude,
      longitude: input.longitude,
      rainfall: input.rainfall,
    });
    for (const warning of runoff.warnings) warningSet.add(warning);
    const netOutflowCfs = Math.max(0, runoff.peakRunoffCfs - input.allowableOutflowCfs);
    trials.push({
      durationMinutes: duration,
      durationLabel: STORMWATER_DURATION_LABELS[duration] ?? `${duration}-min`,
      rainfallIntensity: runoff.rainfallIntensity,
      peakInflowCfs: runoff.peakRunoffCfs,
      storageCf: netOutflowCfs * duration * 60 * safetyFactor,
    });
  }

  if (trials.length === 0) {
    throw new Error('No storm duration is available for the detention estimate.');
  }

  const governing = trials.reduce(
    (largest, trial) => (trial.storageCf > largest.storageCf ? trial : largest),
    trials[0],
  );
  const requiredStorageCf = governing.storageCf;

  const warnings = Array.from(warningSet);
  if (requiredStorageCf <= 0) {
    warnings.push(
      'The allowable release rate meets or exceeds every trial inflow, so this estimate requires no detention ' +
        'storage. Verify the downstream capacity and the governing release rate.',
    );
  }
  if (!hasTcInputs) {
    warnings.push(
      'Time of concentration was not supplied, so the duration search starts at the shortest available storm. ' +
        'Add the longest flow path and average slope to anchor the search at Tc.',
    );
  }
  warnings.push(
    'Detention storage is a Modified Rational Method screening estimate. Route the design storm through the ' +
      'proposed basin (EPA SWMM, HEC-HMS, or an approved local model) before sizing the outlet.',
  );

  return {
    returnPeriod: input.returnPeriod,
    allowableOutflowCfs: input.allowableOutflowCfs,
    safetyFactor,
    requiredStorageCf,
    requiredStorageAcreFt: requiredStorageCf / SQFT_PER_ACRE,
    requiredStorageGallons: requiredStorageCf * GALLONS_PER_CF,
    governingDurationMinutes: governing.durationMinutes,
    governingDurationLabel: governing.durationLabel,
    peakInflowCfs: governing.peakInflowCfs,
    rainfallIntensity: governing.rainfallIntensity,
    weightedC,
    totalAreaSqFt,
    totalAreaAcres,
    tcMinutes,
    trials,
    method:
      'Modified Rational Method - critical duration: Vs = (Qin - Qout) x td, maximized over the available durations.',
    warnings,
    computedAt: Date.now(),
  };
}

/** Copy-ready report text for engineering documentation. */
export function formatStormwaterReport(
  result: StormwaterRunoffResult,
  detention?: StormwaterDetentionResult | null,
  hydraulics?: StormwaterHydraulicsSummary | null,
): string {
  const lines: string[] = [
    '='.repeat(70),
    'STORMWATER RUNOFF CALCULATION - RATIONAL METHOD',
    '='.repeat(70),
    '',
    'PROJECT LOCATION',
    '-'.repeat(40),
    `Address/Location: ${result.location ?? 'Not specified'}`,
  ];

  if (result.latitude !== null && result.longitude !== null) {
    lines.push(
      `Coordinates: ${result.latitude.toFixed(6)}N, ${Math.abs(result.longitude).toFixed(6)}W`,
    );
  }

  lines.push(
    '',
    'DESIGN STORM PARAMETERS',
    '-'.repeat(40),
    `Return Period: ${result.returnPeriod}-year storm`,
    `Duration: ${result.durationLabel}`,
    `Rainfall Intensity (i): ${result.rainfallIntensity.toFixed(2)} in/hr`,
  );

  if (result.tcMinutes !== null) {
    lines.push(
      '',
      'TIME OF CONCENTRATION (Tc)',
      '-'.repeat(40),
      `Calculated Tc: ${result.tcMinutes.toFixed(1)} minutes`,
      `Flow Path Length: ${(result.tcFlowLengthFt ?? 0).toFixed(0)} ft`,
      `Average Slope: ${(result.tcSlopePercent ?? 0).toFixed(1)}%`,
      'Method: FAA (Federal Aviation Administration)',
      'Note: Preliminary estimate - verify with site-specific analysis',
    );
  }

  lines.push('', 'SITE CHARACTERISTICS', '-'.repeat(40));
  for (const surface of result.surfaces) {
    lines.push(
      ` ${surface.type}:`,
      `  Area: ${surface.areaSqFt.toLocaleString(undefined, { maximumFractionDigits: 0 })} sq ft (${surface.percentOfArea.toFixed(1)}%)`,
      `  Runoff Coefficient (C): ${surface.coefficient.toFixed(2)}`,
    );
  }

  lines.push(
    '',
    `Total Drainage Area: ${result.totalAreaSqFt.toLocaleString(undefined, { maximumFractionDigits: 0 })} sq ft (${result.totalAreaAcres.toFixed(3)} acres)`,
    `Weighted Runoff Coefficient (C): ${result.weightedC.toFixed(3)}`,
    '',
    'CALCULATION',
    '-'.repeat(40),
    'Rational Method Formula: Q = C i A',
    '',
    ` Q = ${result.weightedC.toFixed(3)} x ${result.rainfallIntensity.toFixed(2)} in/hr x ${result.totalAreaAcres.toFixed(3)} acres`,
    ` Q = ${result.peakRunoffCfs.toFixed(3)} cfs`,
    '',
    'RESULT',
    '-'.repeat(40),
    `Peak Runoff (Q): ${result.peakRunoffCfs.toFixed(2)} cfs (${result.peakRunoffGpm.toFixed(1)} gpm)`,
    '',
  );

  if (detention) {
    lines.push(
      '',
      'DETENTION STORAGE (MODIFIED RATIONAL METHOD)',
      '-'.repeat(40),
      `Allowable Release Rate: ${detention.allowableOutflowCfs.toFixed(2)} cfs`,
      `Governing Storm: ${detention.returnPeriod}-year, ${detention.governingDurationLabel}`,
      `Peak Inflow: ${detention.peakInflowCfs.toFixed(2)} cfs`,
      `Required Storage: ${detention.requiredStorageCf.toFixed(0)} cf ` +
        `(${detention.requiredStorageAcreFt.toFixed(3)} ac-ft / ${detention.requiredStorageGallons.toFixed(0)} gallons)`,
      `Safety Factor: ${detention.safetyFactor.toFixed(2)}`,
      'Method: Vs = (Qin - Qout) x td, maximized over the available durations',
      '',
      'Duration trials:',
      ...detention.trials.map(
        (trial) =>
          ` ${trial.durationLabel.padEnd(8)} Qin ${trial.peakInflowCfs.toFixed(3)} cfs  Vs ${trial.storageCf.toFixed(0)} cf`,
      ),
      ...(detention.warnings.length > 0
        ? ['', 'Detention warnings:', ...detention.warnings.map((warning) => ` - ${warning}`)]
        : []),
    );
  }

  if (hydraulics?.hydrograph) {
    const hydrograph = hydraulics.hydrograph;
    lines.push(
      '',
      'DESIGN HYDROGRAPH (MODIFIED RATIONAL)',
      '-'.repeat(40),
      `Peak Inflow: ${hydrograph.peakFlowCfs.toFixed(2)} cfs`,
      `Time to Peak: ${hydrograph.timeToPeakMinutes.toFixed(1)} minutes`,
      `Storm Duration: ${hydrograph.stormDurationMinutes.toFixed(1)} minutes`,
      `Time Base: ${hydrograph.timeBaseMinutes.toFixed(1)} minutes`,
      `Runoff Volume: ${hydrograph.runoffVolumeCf.toFixed(0)} cf`,
    );
  }

  if (hydraulics?.routing) {
    const routing = hydraulics.routing;
    lines.push(
      '',
      'DETENTION BASIN ROUTING (LEVEL POOL)',
      '-'.repeat(40),
      `Peak Inflow: ${routing.peakInflowCfs.toFixed(2)} cfs`,
      `Peak Outflow: ${routing.peakOutflowCfs.toFixed(2)} cfs`,
      `Maximum Stage: ${routing.maxStageFt.toFixed(2)} ft`,
      `Maximum Storage: ${routing.maxStorageCf.toFixed(0)} cf (${routing.maxStorageAcreFt.toFixed(3)} ac-ft)`,
      `Allowable Release: ${routing.allowableOutflowCfs !== null ? `${routing.allowableOutflowCfs.toFixed(2)} cfs` : 'not specified'}`,
      `Passes Allowable: ${routing.passesAllowable === null ? 'n/a' : routing.passesAllowable ? 'YES' : 'NO'}`,
      `Basin Overtop Flag: ${routing.basinExceeded ? 'YES - increase storage or outlet' : 'no'}`,
      `Method: ${routing.method}`,
    );
  }

  if (hydraulics?.channel) {
    const channel = hydraulics.channel;
    lines.push(
      '',
      'CHANNEL / PIPE CAPACITY (MANNING)',
      '-'.repeat(40),
      `Section: ${channel.shape}`,
      `Depth: ${channel.depthFt.toFixed(2)} ft`,
      `Area: ${channel.areaSqFt.toFixed(2)} sq ft | Hydraulic Radius: ${channel.hydraulicRadiusFt.toFixed(2)} ft`,
      `Velocity: ${channel.velocityFps.toFixed(2)} fps | Capacity: ${channel.capacityCfs.toFixed(2)} cfs`,
      `Froude: ${channel.froude !== null ? channel.froude.toFixed(2) : 'n/a'} (${channel.flowRegime})`,
      `Normal Depth: ${channel.normalDepthFt !== null ? `${channel.normalDepthFt.toFixed(2)} ft` : 'n/a'} | Critical Depth: ${channel.criticalDepthFt !== null ? `${channel.criticalDepthFt.toFixed(2)} ft` : 'n/a'}`,
    );
  }

  if (result.warnings.length > 0) {
    lines.push('WARNINGS', '-'.repeat(40));
    for (const warning of result.warnings) lines.push(` - ${warning}`);
    lines.push('');
  }

  lines.push(
    'REFERENCES',
    '-'.repeat(40),
    'Rainfall Intensity Data:',
    ` ${result.dataSource}`,
    ` ${result.citation}`,
    '',
    'Runoff Coefficients:',
    ' Rational Method reference coefficients (editable per surface; verify',
    ' against the governing jurisdiction).',
    '',
    'Methodology:',
    ' Rational Method Q = C i A for small urban drainage areas.',
    ' Many jurisdictions require continuous simulation for permit applications;',
    ' use EPA SWMM, HEC-HMS, or the local jurisdiction approved model.',
    '',
    'DISCLAIMER',
    '-'.repeat(40),
    'This calculation is for preliminary planning purposes only.',
    'All values should be independently verified by a licensed professional engineer.',
    'Consult local jurisdiction requirements for design standards.',
    '',
    '='.repeat(70),
  );

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Session store — lets the panel and CACP skills share the latest calculation.
// ---------------------------------------------------------------------------

export const GALLONS_PER_CF = 7.48052;

let latestRunoffResult: StormwaterRunoffResult | null = null;
let latestDetentionResult: StormwaterDetentionResult | null = null;
const runoffListeners = new Set<(result: StormwaterRunoffResult | null) => void>();
const detentionListeners = new Set<(result: StormwaterDetentionResult | null) => void>();

export function getLatestStormwaterDetention(): StormwaterDetentionResult | null {
  return latestDetentionResult;
}

export function setLatestStormwaterDetention(result: StormwaterDetentionResult | null): void {
  latestDetentionResult = result;
  for (const listener of detentionListeners) listener(result);
}

export function getLatestStormwaterRunoff(): StormwaterRunoffResult | null {
  return latestRunoffResult;
}

export function setLatestStormwaterRunoff(result: StormwaterRunoffResult | null): void {
  latestRunoffResult = result;
  for (const listener of runoffListeners) listener(result);
}

export function clearLatestStormwaterRunoff(): void {
  setLatestStormwaterRunoff(null);
  setLatestStormwaterDetention(null);
}

export function subscribeStormwaterDetention(
  listener: (result: StormwaterDetentionResult | null) => void,
): () => void {
  detentionListeners.add(listener);
  return () => {
    detentionListeners.delete(listener);
  };
}

export function subscribeStormwaterRunoff(
  listener: (result: StormwaterRunoffResult | null) => void,
): () => void {
  runoffListeners.add(listener);
  return () => {
    runoffListeners.delete(listener);
  };
}
