/**
 * Stormwater Hydraulics
 *
 * Deterministic preliminary H&H tools that sit on top of the Rational Method
 * engine:
 *   - Modified Rational design hydrograph (trapezoidal inflow).
 *   - Level-pool (Modified Puls) detention-basin routing with an orifice
 *     and/or rectangular weir outlet.
 *   - Manning open-channel / pipe capacity with normal-depth and critical-depth
 *     solutions.
 *
 * These are screening tools for preliminary sizing. They do not replace a full
 * unsteady network model (EPA SWMM, HEC-HMS/HEC-RAS) for permit design.
 */

import {
  calculateTimeOfConcentrationFaa,
  calculateWeightedC,
  computeStormwaterRunoff,
  getRecommendedDuration,
  type StormwaterRainfall,
  type StormwaterReturnPeriod,
  type StormwaterSurface,
} from './stormwaterService.ts';

const GRAVITY_FPS2 = 32.2;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

// ---------------------------------------------------------------------------
// Design hydrograph
// ---------------------------------------------------------------------------

export interface StormwaterHydrographPoint {
  timeMinutes: number;
  flowCfs: number;
}

export interface StormwaterHydrographInput {
  surfaces: StormwaterSurface[];
  returnPeriod: StormwaterReturnPeriod;
  /** Storm duration. Defaults to the duration recommended from Tc. */
  durationMinutes?: number;
  flowLengthFt?: number;
  slopePercent?: number;
  /** Explicit Tc; overrides the FAA calculation when supplied. */
  tcMinutes?: number;
  /** Full IDF curve for the site. */
  rainfall?: StormwaterRainfall;
  timeStepMinutes?: number;
}

export interface StormwaterHydrographResult {
  peakFlowCfs: number;
  timeToPeakMinutes: number;
  timeBaseMinutes: number;
  stormDurationMinutes: number;
  tcMinutes: number;
  rainfallIntensity: number;
  weightedC: number;
  totalAreaAcres: number;
  runoffVolumeCf: number;
  points: StormwaterHydrographPoint[];
  warnings: string[];
  method: string;
  computedAt: number;
}

function resolveTcMinutes(input: {
  tcMinutes?: number;
  flowLengthFt?: number;
  slopePercent?: number;
  weightedC: number;
}): number {
  if (typeof input.tcMinutes === 'number' && input.tcMinutes > 0) {
    return input.tcMinutes;
  }
  if (
    typeof input.flowLengthFt === 'number' &&
    input.flowLengthFt > 0 &&
    typeof input.slopePercent === 'number' &&
    input.slopePercent > 0
  ) {
    return calculateTimeOfConcentrationFaa(
      input.weightedC,
      input.flowLengthFt,
      input.slopePercent,
    );
  }
  throw new Error(
    'A time of concentration is required. Supply tcMinutes or both flowLengthFt and slopePercent.',
  );
}

/**
 * Modified Rational hydrograph: linear rise over Tc, a plateau for the storm
 * duration, then a linear recession over Tc. The area under the trapezoid is
 * Qpeak x storm duration, matching the Rational Method runoff volume.
 */
export function generateModifiedRationalHydrograph(
  input: StormwaterHydrographInput,
): StormwaterHydrographResult {
  const surfaces = (input.surfaces ?? []).filter(
    (surface) => Number.isFinite(surface.areaSqFt) && surface.areaSqFt > 0,
  );
  if (surfaces.length === 0) {
    throw new Error('At least one contributing surface with a positive area is required.');
  }

  if (!input.rainfall) {
    throw new Error(
      'Hydrograph generation needs a full IDF curve. Fetch NOAA Atlas 14 rainfall for the site first.',
    );
  }
  const weightedC = calculateWeightedC(surfaces);
  const tcMinutes = resolveTcMinutes({
    tcMinutes: input.tcMinutes,
    flowLengthFt: input.flowLengthFt,
    slopePercent: input.slopePercent,
    weightedC,
  });
  const peakDuration = getRecommendedDuration(tcMinutes);
  const requestedDuration =
    typeof input.durationMinutes === 'number' && input.durationMinutes > 0
      ? input.durationMinutes
      : peakDuration;
  const stormDurationMinutes = Math.max(tcMinutes, requestedDuration);
  const stepMinutes = clamp(input.timeStepMinutes ?? 1, 0.25, 5);

  const runoff = computeStormwaterRunoff({
    surfaces,
    returnPeriod: input.returnPeriod,
    durationMinutes: peakDuration,
    flowLengthFt: input.flowLengthFt,
    slopePercent: input.slopePercent,
    rainfall: input.rainfall,
  });

  const peakFlowCfs = runoff.peakRunoffCfs;
  const timeBaseMinutes = stormDurationMinutes + tcMinutes;
  const points: StormwaterHydrographPoint[] = [];
  const timeAt = (t: number): number =>
    t <= tcMinutes ? peakFlowCfs * (t / tcMinutes) : peakFlowCfs;

  for (let time = 0; time < timeBaseMinutes; time += stepMinutes) {
    const flowCfs =
      time <= tcMinutes
        ? timeAt(time)
        : time <= stormDurationMinutes
          ? peakFlowCfs
          : peakFlowCfs * Math.max(0, (timeBaseMinutes - time) / tcMinutes);
    points.push({
      timeMinutes: Number(time.toFixed(3)),
      flowCfs: Number(flowCfs.toFixed(4)),
    });
  }
  points.push({ timeMinutes: Number(timeBaseMinutes.toFixed(3)), flowCfs: 0 });

  const warnings = [...runoff.warnings];
  if (requestedDuration < tcMinutes) {
    warnings.push(
      `The requested ${requestedDuration.toFixed(1)}-min storm is shorter than Tc, so the hydrograph uses ` +
        `a ${stormDurationMinutes.toFixed(1)}-min storm.`,
    );
  }
  warnings.push(
    'Modified Rational hydrograph is a simplified trapezoid. Use an NRCS or continuous-simulation ' +
      'hydrograph where the jurisdiction requires one.',
  );

  return {
    peakFlowCfs,
    timeToPeakMinutes: tcMinutes,
    timeBaseMinutes,
    stormDurationMinutes,
    tcMinutes,
    rainfallIntensity: runoff.rainfallIntensity,
    weightedC,
    totalAreaAcres: runoff.totalAreaAcres,
    runoffVolumeCf: peakFlowCfs * stormDurationMinutes * 60,
    points,
    warnings,
    method: 'Modified Rational trapezoidal hydrograph',
    computedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Detention basin routing
// ---------------------------------------------------------------------------

export interface DetentionBasinGeometry {
  bottomWidthFt: number;
  bottomLengthFt: number;
  /** Side slope, horizontal to vertical. 0 = vertical walls. */
  sideSlopeHv: number;
  maxDepthFt: number;
}

export interface DetentionOutlet {
  /** Orifice diameter in inches. Omit or 0 for no orifice. */
  orificeDiameterIn?: number;
  orificeCoefficient?: number;
  /** Rectangular weir length in feet. Omit or 0 for no weir. */
  weirLengthFt?: number;
  /** Weir crest elevation above the basin bottom, feet. */
  weirCrestFt?: number;
  /** Weir coefficient; 3.33 is typical for a sharp-crested rectangular weir. */
  weirCoefficient?: number;
}

export interface DetentionRoutingInput {
  hydrograph: StormwaterHydrographResult;
  basin: DetentionBasinGeometry;
  outlet: DetentionOutlet;
  allowableOutflowCfs?: number;
  timeStepMinutes?: number;
  /** Hours simulated after the inflow hydrograph ends. */
  drainDownHours?: number;
}

export interface DetentionRoutingPoint {
  timeMinutes: number;
  inflowCfs: number;
  outflowCfs: number;
  stageFt: number;
}

export interface DetentionRoutingResult {
  peakInflowCfs: number;
  peakOutflowCfs: number;
  maxStageFt: number;
  maxStorageCf: number;
  maxStorageAcreFt: number;
  timeToPeakOutflowMinutes: number;
  inflowVolumeCf: number;
  outflowVolumeCf: number;
  retainedVolumeCf: number;
  allowableOutflowCfs: number | null;
  passesAllowable: boolean | null;
  basinExceeded: boolean;
  massBalanceErrorCf: number;
  hydrographSummary: {
    peakFlowCfs: number;
    timeToPeakMinutes: number;
    timeBaseMinutes: number;
    stormDurationMinutes: number;
    tcMinutes: number;
    runoffVolumeCf: number;
  };
  points: DetentionRoutingPoint[];
  warnings: string[];
  method: string;
  computedAt: number;
}

/** Exact stage-storage for a prismatic trapezoidal basin with four side slopes. */
export function basinStorageAtStage(basin: DetentionBasinGeometry, stageFt: number): number {
  const h = Math.max(0, stageFt);
  const z = Math.max(0, basin.sideSlopeHv);
  const b = Math.max(0, basin.bottomWidthFt);
  const l = Math.max(0, basin.bottomLengthFt);
  return b * l * h + z * (b + l) * h * h + (4 / 3) * z * z * h * h * h;
}

export function basinSurfaceAreaAtStage(
  basin: DetentionBasinGeometry,
  stageFt: number,
): number {
  const h = Math.max(0, stageFt);
  const z = Math.max(0, basin.sideSlopeHv);
  return (Math.max(0, basin.bottomWidthFt) + 2 * z * h) *
    (Math.max(0, basin.bottomLengthFt) + 2 * z * h);
}

export function outletFlowAtStage(outlet: DetentionOutlet, stageFt: number): number {
  let flow = 0;
  const orificeDiameterIn = outlet.orificeDiameterIn ?? 0;
  if (orificeDiameterIn > 0) {
    const diameterFt = orificeDiameterIn / 12;
    const areaSqFt = (Math.PI * diameterFt * diameterFt) / 4;
    const headFt = Math.max(0, stageFt - diameterFt / 2);
    flow +=
      (outlet.orificeCoefficient ?? 0.6) * areaSqFt * Math.sqrt(2 * GRAVITY_FPS2 * headFt);
  }
  const weirLengthFt = outlet.weirLengthFt ?? 0;
  if (weirLengthFt > 0) {
    const headFt = Math.max(0, stageFt - (outlet.weirCrestFt ?? 0));
    flow += (outlet.weirCoefficient ?? 3.33) * weirLengthFt * Math.pow(headFt, 1.5);
  }
  return flow;
}

function interpolateHydrograph(points: StormwaterHydrographPoint[], timeMinutes: number): number {
  if (points.length === 0) return 0;
  if (timeMinutes <= points[0].timeMinutes) return points[0].flowCfs;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const next = points[index];
    if (timeMinutes <= next.timeMinutes) {
      const span = next.timeMinutes - previous.timeMinutes;
      if (span <= 0) return next.flowCfs;
      return (
        previous.flowCfs +
        (next.flowCfs - previous.flowCfs) * ((timeMinutes - previous.timeMinutes) / span)
      );
    }
  }
  return 0;
}

export function routeDetentionBasin(input: DetentionRoutingInput): DetentionRoutingResult {
  const { basin, outlet, hydrograph } = input;
  if (!hydrograph.points.length) {
    throw new Error('A design hydrograph with at least one point is required.');
  }
  if (!(basin.bottomWidthFt > 0) || !(basin.bottomLengthFt > 0)) {
    throw new Error('Basin bottom width and length must be positive.');
  }
  if (!(basin.maxDepthFt > 0)) {
    throw new Error('Basin maximum depth must be positive.');
  }
  if (basin.sideSlopeHv < 0) {
    throw new Error('Basin side slope cannot be negative.');
  }
  if ((outlet.orificeDiameterIn ?? 0) <= 0 && (outlet.weirLengthFt ?? 0) <= 0) {
    throw new Error('Provide an orifice diameter and/or a weir length so the basin can discharge.');
  }

  const stepMinutes = clamp(input.timeStepMinutes ?? 1, 0.25, 5);
  const dtSeconds = stepMinutes * 60;
  const drainHours = clamp(input.drainDownHours ?? 6, 0, 48);
  const simulationMinutes = hydrograph.timeBaseMinutes + drainHours * 60;
  const steps = Math.max(1, Math.ceil(simulationMinutes / stepMinutes));

  const stageLimit = Math.max(basin.maxDepthFt, basin.maxDepthFt * 1.5);
  const storageAt = (stage: number): number => basinStorageAtStage(basin, stage);
  const flowAt = (stage: number): number => outletFlowAtStage(outlet, stage);

  let stageFt = 0;
  let storageCf = 0;
  let outflowCfs = 0;
  let inflowVolumeCf = 0;
  let outflowVolumeCf = 0;
  let peakOutflowCfs = 0;
  let maxStageFt = 0;
  let maxStorageCf = 0;
  let timeToPeakOutflowMinutes = 0;
  let basinExceeded = false;

  const points: DetentionRoutingPoint[] = [
    { timeMinutes: 0, inflowCfs: 0, outflowCfs: 0, stageFt: 0 },
  ];

  for (let stepIndex = 1; stepIndex <= steps; stepIndex += 1) {
    const previousTime = (stepIndex - 1) * stepMinutes;
    const time = stepIndex * stepMinutes;
    const inflowPrevious = interpolateHydrograph(hydrograph.points, previousTime);
    const inflow = interpolateHydrograph(hydrograph.points, time);
    const rhs =
      inflowPrevious + inflow + (2 * storageCf) / dtSeconds - outflowCfs;

    const residual = (candidateStage: number): number =>
      (2 * storageAt(candidateStage)) / dtSeconds + flowAt(candidateStage) - rhs;

    let nextStage = 0;
    if (residual(0) < 0) {
      if (residual(stageLimit) < 0) {
        nextStage = stageLimit;
        basinExceeded = true;
      } else {
        let low = 0;
        let high = stageLimit;
        for (let iteration = 0; iteration < 60; iteration += 1) {
          const mid = (low + high) / 2;
          if (residual(mid) < 0) low = mid;
          else high = mid;
        }
        nextStage = (low + high) / 2;
      }
    }

    const nextStorage = storageAt(nextStage);
    const nextOutflow = flowAt(nextStage);

    inflowVolumeCf += ((inflowPrevious + inflow) / 2) * dtSeconds;
    outflowVolumeCf += ((outflowCfs + nextOutflow) / 2) * dtSeconds;

    stageFt = nextStage;
    storageCf = nextStorage;
    outflowCfs = nextOutflow;

    if (outflowCfs > peakOutflowCfs) {
      peakOutflowCfs = outflowCfs;
      timeToPeakOutflowMinutes = time;
    }
    if (stageFt > maxStageFt) maxStageFt = stageFt;
    if (storageCf > maxStorageCf) maxStorageCf = storageCf;

    points.push({
      timeMinutes: Number(time.toFixed(3)),
      inflowCfs: Number(inflow.toFixed(4)),
      outflowCfs: Number(outflowCfs.toFixed(4)),
      stageFt: Number(stageFt.toFixed(4)),
    });

    if (
      time > hydrograph.timeBaseMinutes &&
      stageFt < 0.01 &&
      outflowCfs < 0.005
    ) {
      break;
    }
  }

  const warnings: string[] = [];
  if (basinExceeded) {
    warnings.push(
      `The routed peak stage exceeds the basin depth (${basin.maxDepthFt.toFixed(2)} ft). ` +
        'Increase the basin footprint or the outlet capacity, and provide emergency spillway capacity.',
    );
  }
  if (input.allowableOutflowCfs !== undefined) {
    if (peakOutflowCfs > input.allowableOutflowCfs + 1e-6) {
      warnings.push(
        `Peak routed outflow ${peakOutflowCfs.toFixed(2)} cfs exceeds the allowable release of ` +
          `${input.allowableOutflowCfs.toFixed(2)} cfs. Enlarge the storage or restrict the outlet.`,
      );
    }
  }
  if (storageCf > 0.5 && stageFt > 0.02) {
    warnings.push(
      `The basin remains partly full at the end of the ${drainHours}-hour drain-down window ` +
        `(stage ${stageFt.toFixed(2)} ft, stored ${storageCf.toFixed(0)} cf). Verify the drawdown requirement.`,
    );
  }
  warnings.push(
    'Level-pool (Modified Puls) routing assumes a flat water surface and a fixed outlet rating. ' +
      'Confirm with a full unsteady model (EPA SWMM or HEC-HMS) for permit design.',
  );

  return {
    peakInflowCfs: hydrograph.peakFlowCfs,
    peakOutflowCfs,
    maxStageFt,
    maxStorageCf,
    maxStorageAcreFt: maxStorageCf / 43560,
    timeToPeakOutflowMinutes,
    inflowVolumeCf,
    outflowVolumeCf,
    retainedVolumeCf: storageCf,
    allowableOutflowCfs: input.allowableOutflowCfs ?? null,
    passesAllowable:
      input.allowableOutflowCfs === undefined
        ? null
        : peakOutflowCfs <= input.allowableOutflowCfs + 1e-6,
    basinExceeded,
    massBalanceErrorCf: inflowVolumeCf - outflowVolumeCf - storageCf,
    hydrographSummary: {
      peakFlowCfs: hydrograph.peakFlowCfs,
      timeToPeakMinutes: hydrograph.timeToPeakMinutes,
      timeBaseMinutes: hydrograph.timeBaseMinutes,
      stormDurationMinutes: hydrograph.stormDurationMinutes,
      tcMinutes: hydrograph.tcMinutes,
      runoffVolumeCf: hydrograph.runoffVolumeCf,
    },
    points,
    warnings,
    method: 'Level-pool (Modified Puls) routing, 1-min to 5-min time step',
    computedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Manning channel / pipe capacity
// ---------------------------------------------------------------------------

export type ChannelShape = 'rectangular' | 'trapezoidal' | 'triangular' | 'circular';

export interface ManningChannelInput {
  shape: ChannelShape;
  /** Bottom width for rectangular/trapezoidal sections. */
  bottomWidthFt?: number;
  /** Side slope, horizontal to vertical, for trapezoidal/triangular sections. */
  sideSlopeHv?: number;
  /** Pipe diameter for circular sections. */
  diameterFt?: number;
  depthFt: number;
  /** Longitudinal slope, ft/ft. */
  slope: number;
  manningsN: number;
  /** Optional target flow used to solve normal depth. */
  designFlowCfs?: number;
}

export interface ManningChannelResult {
  shape: ChannelShape;
  depthFt: number;
  areaSqFt: number;
  wettedPerimeterFt: number;
  topWidthFt: number;
  hydraulicRadiusFt: number;
  hydraulicDepthFt: number;
  velocityFps: number;
  capacityCfs: number;
  criticalDepthFt: number | null;
  normalDepthFt: number | null;
  froude: number | null;
  flowRegime: 'subcritical' | 'critical' | 'supercritical';
  freeboardToTopFt: number | null;
  warnings: string[];
  computedAt: number;
}

function channelGeometry(
  input: ManningChannelInput,
  depthFt: number,
): { area: number; perimeter: number; topWidth: number } {
  const bottomWidth = input.bottomWidthFt ?? 0;
  const sideSlope = input.sideSlopeHv ?? 0;

  if (input.shape === 'circular') {
    const diameter = input.diameterFt ?? 0;
    if (!(diameter > 0)) throw new Error('Pipe diameter must be positive.');
    const y = clamp(depthFt, 0, diameter);
    if (y >= diameter - 1e-9) {
      return {
        area: (Math.PI * diameter * diameter) / 4,
        perimeter: Math.PI * diameter,
        topWidth: 0,
      };
    }
    const theta = 2 * Math.acos(clamp(1 - (2 * y) / diameter, -1, 1));
    return {
      area: (diameter * diameter * (theta - Math.sin(theta))) / 8,
      perimeter: (diameter * theta) / 2,
      topWidth: diameter * Math.sin(theta / 2),
    };
  }

  if (input.shape === 'rectangular') {
    if (!(bottomWidth > 0)) throw new Error('Bottom width must be positive.');
    return { area: bottomWidth * depthFt, perimeter: bottomWidth + 2 * depthFt, topWidth: bottomWidth };
  }

  if (input.shape === 'triangular') {
    if (!(sideSlope > 0)) throw new Error('Side slope must be positive for a triangular channel.');
    return {
      area: sideSlope * depthFt * depthFt,
      perimeter: 2 * depthFt * Math.sqrt(1 + sideSlope * sideSlope),
      topWidth: 2 * sideSlope * depthFt,
    };
  }

  if (!(bottomWidth >= 0) || !(sideSlope >= 0)) {
    throw new Error('Bottom width and side slope must be zero or greater.');
  }
  return {
    area: (bottomWidth + sideSlope * depthFt) * depthFt,
    perimeter:
      bottomWidth + 2 * depthFt * Math.sqrt(1 + sideSlope * sideSlope),
    topWidth: bottomWidth + 2 * sideSlope * depthFt,
  };
}

function manningFlow(input: ManningChannelInput, depthFt: number): {
  flowCfs: number;
  velocityFps: number;
  area: number;
  perimeter: number;
  topWidth: number;
  hydraulicRadius: number;
  hydraulicDepth: number;
} {
  const geometry = channelGeometry(input, depthFt);
  if (!(geometry.area > 0)) {
    return {
      flowCfs: 0,
      velocityFps: 0,
      area: geometry.area,
      perimeter: geometry.perimeter,
      topWidth: geometry.topWidth,
      hydraulicRadius: 0,
      hydraulicDepth: 0,
    };
  }
  const hydraulicRadius = geometry.area / geometry.perimeter;
  const velocityFps =
    (1.486 / input.manningsN) *
    Math.pow(hydraulicRadius, 2 / 3) *
    Math.sqrt(input.slope);
  const hydraulicDepth =
    geometry.topWidth > 0 ? geometry.area / geometry.topWidth : hydraulicRadius;
  return {
    flowCfs: velocityFps * geometry.area,
    velocityFps,
    area: geometry.area,
    perimeter: geometry.perimeter,
    topWidth: geometry.topWidth,
    hydraulicRadius,
    hydraulicDepth,
  };
}

export function computeManningChannel(input: ManningChannelInput): ManningChannelResult {
  if (!(input.depthFt > 0)) throw new Error('Flow depth must be positive.');
  if (!(input.slope > 0)) throw new Error('Channel slope must be positive.');
  if (!(input.manningsN > 0)) throw new Error("Manning's n must be positive.");

  const depthFt =
    input.shape === 'circular'
      ? Math.min(input.depthFt, input.diameterFt ?? input.depthFt)
      : input.depthFt;
  const primary = manningFlow(input, depthFt);
  const capacityCfs = primary.flowCfs;
  const targetFlow = input.designFlowCfs ?? capacityCfs;
  const maxDepth =
    input.shape === 'circular'
      ? (input.diameterFt ?? depthFt)
      : Math.max(10, depthFt * 3);

  const warnings: string[] = [];
  let criticalDepthFt: number | null = null;
  if (primary.area > 0 && primary.topWidth > 0) {
    const froudeResidual = (candidateDepth: number): number => {
      const candidate = manningFlow(input, candidateDepth);
      if (!(candidate.area > 0) || !(candidate.topWidth > 0)) return Number.POSITIVE_INFINITY;
      return (
        (targetFlow * targetFlow * candidate.topWidth) /
          (GRAVITY_FPS2 * Math.pow(candidate.area, 3)) -
        1
      );
    };
    if (froudeResidual(maxDepth) <= 0 && froudeResidual(1e-4) > 0) {
      let low = 1e-4;
      let high = maxDepth;
      for (let iteration = 0; iteration < 60; iteration += 1) {
        const mid = (low + high) / 2;
        if (froudeResidual(mid) > 0) low = mid;
        else high = mid;
      }
      criticalDepthFt = (low + high) / 2;
    }
  }

  let normalDepthFt: number | null = null;
  if (input.designFlowCfs !== undefined && input.designFlowCfs > 0) {
    const capacityAtMax = manningFlow(input, maxDepth).flowCfs;
    if (capacityAtMax < input.designFlowCfs) {
      warnings.push(
        `The design flow ${input.designFlowCfs.toFixed(2)} cfs exceeds the ${maxDepth.toFixed(1)}-ft ` +
          'capacity of this section. Enlarge the section or increase the slope.',
      );
    } else if (manningFlow(input, 1e-4).flowCfs > input.designFlowCfs) {
      normalDepthFt = 1e-4;
    } else {
      let low = 1e-4;
      let high = maxDepth;
      for (let iteration = 0; iteration < 60; iteration += 1) {
        const mid = (low + high) / 2;
        if (manningFlow(input, mid).flowCfs < input.designFlowCfs) low = mid;
        else high = mid;
      }
      normalDepthFt = (low + high) / 2;
    }
  }

  const froude =
    primary.hydraulicDepth > 0
      ? primary.velocityFps / Math.sqrt(GRAVITY_FPS2 * primary.hydraulicDepth)
      : null;
  const flowRegime =
    froude === null
      ? 'critical'
      : froude < 0.95
        ? 'subcritical'
        : froude > 1.05
          ? 'supercritical'
          : 'critical';

  if (input.shape === 'circular' && depthFt >= (input.diameterFt ?? 0) - 1e-9) {
    warnings.push(
      'The pipe is analyzed at full flow. Full-flow pipe capacity is a conveyance check, not a ' +
        'HGL calculation; model the outlet and tailwater for actual capacity.',
    );
  }
  warnings.push(
    "Manning's equation assumes steady, uniform flow. Verify inlet/outlet control and the hydraulic " +
      'grade line before final design.',
  );

  return {
    shape: input.shape,
    depthFt,
    areaSqFt: primary.area,
    wettedPerimeterFt: primary.perimeter,
    topWidthFt: primary.topWidth,
    hydraulicRadiusFt: primary.hydraulicRadius,
    hydraulicDepthFt: primary.hydraulicDepth,
    velocityFps: primary.velocityFps,
    capacityCfs,
    criticalDepthFt,
    normalDepthFt,
    froude,
    flowRegime,
    freeboardToTopFt:
      input.shape === 'circular' && input.diameterFt
        ? Math.max(0, input.diameterFt - depthFt)
        : null,
    warnings,
    computedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Session store
// ---------------------------------------------------------------------------

let latestHydrograph: StormwaterHydrographResult | null = null;
let latestRouting: DetentionRoutingResult | null = null;
let latestChannel: ManningChannelResult | null = null;

export const getLatestHydrograph = (): StormwaterHydrographResult | null => latestHydrograph;
export const setLatestHydrograph = (value: StormwaterHydrographResult | null): void => {
  latestHydrograph = value;
};
export const getLatestRouting = (): DetentionRoutingResult | null => latestRouting;
export const setLatestRouting = (value: DetentionRoutingResult | null): void => {
  latestRouting = value;
};
export const getLatestChannel = (): ManningChannelResult | null => latestChannel;
export const setLatestChannel = (value: ManningChannelResult | null): void => {
  latestChannel = value;
};

export function clearLatestHydraulics(): void {
  latestHydrograph = null;
  latestRouting = null;
  latestChannel = null;
}
