/**
 * Stormwater Agent CACP Skill Handlers
 *
 * Runtime implementations for the skills declared in
 * services/stormwaterSkillSchemas.ts:
 *   - stormwater_compute_runoff
 *   - stormwater_compute_detention
 *   - stormwater_time_of_concentration
 *   - stormwater_surface_catalog
 *   - stormwater_format_report
 *   - stormwater_open_quickcheck
 *   - stormwater_clear_quickcheck
 */

import { interAgentComm, type AgentMessage, type AgentResponse } from './InterAgentCommunication';
import { AgentType } from '../types';
import { isExperimentalAgentEnabled } from '../utils/experimentalAgents';
import { fetchNoaaAtlas14Rainfall } from './stormwaterRainfall';
import {
  clearLatestHydraulics,
  computeManningChannel,
  generateModifiedRationalHydrograph,
  getLatestChannel,
  getLatestHydrograph,
  getLatestRouting,
  routeDetentionBasin,
  setLatestChannel,
  setLatestHydrograph,
  setLatestRouting,
} from './stormwaterHydraulics';
import {
  STORMWATER_DURATIONS,
  STORMWATER_RETURN_PERIODS,
  STORMWATER_SURFACE_TYPES,
  calculateTimeOfConcentrationFaa,
  calculateWeightedC,
  clearLatestStormwaterRunoff,
  computeStormwaterDetention,
  computeStormwaterRunoff,
  formatStormwaterReport,
  getLatestStormwaterDetention,
  getLatestStormwaterRunoff,
  getRecommendedDuration,
  isStormwaterReturnPeriod,
  setLatestStormwaterDetention,
  setLatestStormwaterRunoff,
  type StormwaterRainfall,
  type StormwaterReturnPeriod,
  type StormwaterSurface,
} from './stormwaterService';

export interface StormwaterHandlerDeps {
  /** Raise the Stormwater Quick-Check surface in chat. */
  openQuickCheck?: () => void;
  logActionToFieldbook: (message: string) => void;
}

function respond(
  message: AgentMessage,
  success: boolean,
  data?: Record<string, unknown>,
  error?: string,
): AgentResponse {
  return {
    requestId: message.id,
    from: AgentType.STORMWATER_AGENT,
    success,
    data,
    error,
    timestamp: Date.now(),
  };
}

async function resolveRainfall(
  data: Record<string, unknown>,
): Promise<StormwaterRainfall | null> {
  if (data.rainfall && typeof data.rainfall === 'object') {
    return data.rainfall as StormwaterRainfall;
  }
  const latitude = typeof data.latitude === 'number' ? data.latitude : NaN;
  const longitude = typeof data.longitude === 'number' ? data.longitude : NaN;
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return fetchNoaaAtlas14Rainfall(latitude, longitude);
  }
  return null;
}

const STORMWATER_EXPERIMENTAL_DISABLED_MESSAGE =
  'Stormwater Agent is experimental and disabled. Enable it in Settings > Experimental Agents to use its stormwater tools.';

const registerGatedCommand = (
  command: string,
  handler: (message: AgentMessage) => Promise<AgentResponse>,
): (() => void) =>
  interAgentComm.onCommand(command, async (message) => {
    if (!isExperimentalAgentEnabled(AgentType.STORMWATER_AGENT)) {
      return respond(message, false, undefined, STORMWATER_EXPERIMENTAL_DISABLED_MESSAGE);
    }
    return handler(message);
  });

function parseSurfaces(raw: unknown): StormwaterSurface[] {
  if (!Array.isArray(raw)) return [];
  const surfaces: StormwaterSurface[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const value = entry as Record<string, unknown>;
    const type = typeof value.type === 'string' ? value.type : '';
    const areaSqFt =
      typeof value.areaSqFt === 'number'
        ? value.areaSqFt
        : typeof value.area_sqft === 'number'
          ? value.area_sqft
          : typeof value.area === 'number'
            ? value.area
            : NaN;
    if (!type || !Number.isFinite(areaSqFt) || areaSqFt <= 0) continue;
    surfaces.push({
      type,
      areaSqFt,
      coefficient: typeof value.coefficient === 'number' ? value.coefficient : undefined,
    });
  }
  return surfaces;
}

export function registerStormwaterSkillHandlers(
  getDeps: () => StormwaterHandlerDeps,
): () => void {
  const unsubs: Array<() => void> = [];

  unsubs.push(
    registerGatedCommand('stormwater_compute_runoff', async (message) => {
      const deps = getDeps();
      const data = (message.data ?? {}) as Record<string, unknown>;
      const surfaces = parseSurfaces(data.surfaces);
      if (surfaces.length === 0) {
        return respond(
          message,
          false,
          undefined,
          'At least one surface with a type and a positive areaSqFt is required.',
        );
      }
      const rawReturnPeriod =
        typeof data.returnPeriod === 'number'
          ? data.returnPeriod
          : typeof data.return_period === 'number'
            ? data.return_period
            : 25;
      if (!isStormwaterReturnPeriod(rawReturnPeriod)) {
        return respond(
          message,
          false,
          undefined,
          `returnPeriod must be one of ${STORMWATER_RETURN_PERIODS.join(', ')}.`,
        );
      }

      try {
        const manualIntensity =
          typeof data.rainfallIntensity === 'number' ? data.rainfallIntensity : undefined;
        const rainfall =
          manualIntensity === undefined ? await resolveRainfall(data) : null;
        if (manualIntensity === undefined && !rainfall) {
          return respond(
            message,
            false,
            undefined,
            'NOAA Atlas 14 rainfall is required. Provide latitude/longitude or a rainfallIntensity (in/hr).',
          );
        }
        const result = computeStormwaterRunoff({
          surfaces,
          returnPeriod: rawReturnPeriod as StormwaterReturnPeriod,
          durationMinutes: typeof data.durationMinutes === 'number' ? data.durationMinutes : undefined,
          flowLengthFt: typeof data.flowLengthFt === 'number' ? data.flowLengthFt : undefined,
          slopePercent: typeof data.slopePercent === 'number' ? data.slopePercent : undefined,
          location: typeof data.location === 'string' ? data.location : undefined,
          latitude: typeof data.latitude === 'number' ? data.latitude : undefined,
          longitude: typeof data.longitude === 'number' ? data.longitude : undefined,
          rainfall: rainfall ?? undefined,
          designIntensityInPerHr: manualIntensity,
        });
        setLatestStormwaterRunoff(result);
        setLatestHydrograph(null);
        setLatestRouting(null);
        // A new runoff scenario invalidates any detention result sized from older inputs.
        setLatestStormwaterDetention(null);
        deps.logActionToFieldbook(
          `Stormwater Agent: ${result.returnPeriod}-yr ${result.durationLabel} peak runoff ` +
            `${result.peakRunoffCfs.toFixed(2)} cfs from ${result.totalAreaAcres.toFixed(2)} ac ` +
            `(weighted C ${result.weightedC.toFixed(3)}).`,
        );
        return respond(message, true, {
          peakRunoffCfs: result.peakRunoffCfs,
          peakRunoffGpm: result.peakRunoffGpm,
          weightedC: result.weightedC,
          totalAreaSqFt: result.totalAreaSqFt,
          totalAreaAcres: result.totalAreaAcres,
          rainfallIntensity: result.rainfallIntensity,
          returnPeriod: result.returnPeriod,
          durationMinutes: result.durationMinutes,
          recommendedDurationMinutes: result.recommendedDurationMinutes,
          durationSource: result.durationSource,
          tcMinutes: result.tcMinutes ?? undefined,
          warnings: result.warnings,
          citation: result.citation,
          rainfallSource: result.rainfallSource,
          report: formatStormwaterReport(result),
        });
      } catch (error) {
        return respond(
          message,
          false,
          undefined,
          error instanceof Error ? error.message : String(error),
        );
      }
    }),
  );

  unsubs.push(
    registerGatedCommand('stormwater_time_of_concentration', async (message) => {
      const data = (message.data ?? {}) as Record<string, unknown>;
      const surfaces = parseSurfaces(data.surfaces);
      const weightedC =
        typeof data.weightedC === 'number'
          ? data.weightedC
          : typeof data.weighted_c === 'number'
            ? data.weighted_c
            : surfaces.length > 0
              ? calculateWeightedC(surfaces)
              : NaN;
      const flowLengthFt = typeof data.flowLengthFt === 'number' ? data.flowLengthFt : NaN;
      const slopePercent = typeof data.slopePercent === 'number' ? data.slopePercent : NaN;

      if (!Number.isFinite(weightedC)) {
        return respond(message, false, undefined, 'weightedC or surfaces is required.');
      }
      if (!Number.isFinite(flowLengthFt) || flowLengthFt <= 0) {
        return respond(message, false, undefined, 'flowLengthFt must be a positive number.');
      }
      if (!Number.isFinite(slopePercent) || slopePercent <= 0) {
        return respond(message, false, undefined, 'slopePercent must be a positive number.');
      }

      const tcMinutes = calculateTimeOfConcentrationFaa(weightedC, flowLengthFt, slopePercent);
      return respond(message, true, {
        tcMinutes,
        weightedC,
        recommendedDurationMinutes: getRecommendedDuration(tcMinutes),
        method: 'FAA',
        note: 'Preliminary estimate; verify with site-specific analysis.',
      });
    }),
  );

  unsubs.push(
    registerGatedCommand('stormwater_compute_detention', async (message) => {
      const deps = getDeps();
      const data = (message.data ?? {}) as Record<string, unknown>;
      const surfaces = parseSurfaces(data.surfaces);
      if (surfaces.length === 0) {
        return respond(
          message,
          false,
          undefined,
          'At least one surface with a type and a positive areaSqFt is required.',
        );
      }
      const rawReturnPeriod =
        typeof data.returnPeriod === 'number'
          ? data.returnPeriod
          : typeof data.return_period === 'number'
            ? data.return_period
            : 25;
      if (!isStormwaterReturnPeriod(rawReturnPeriod)) {
        return respond(
          message,
          false,
          undefined,
          `returnPeriod must be one of ${STORMWATER_RETURN_PERIODS.join(', ')}.`,
        );
      }
      const allowableOutflowCfs =
        typeof data.allowableOutflowCfs === 'number'
          ? data.allowableOutflowCfs
          : typeof data.allowable_outflow_cfs === 'number'
            ? data.allowable_outflow_cfs
            : NaN;
      if (!Number.isFinite(allowableOutflowCfs) || allowableOutflowCfs < 0) {
        return respond(message, false, undefined, 'allowableOutflowCfs must be zero or greater.');
      }

      try {
        const rainfall = await resolveRainfall(data);
        if (!rainfall) {
          return respond(
            message,
            false,
            undefined,
            'Detention sizing needs a full IDF curve. Provide latitude/longitude for the NOAA Atlas 14 lookup.',
          );
        }
        const detention = computeStormwaterDetention({
          surfaces,
          returnPeriod: rawReturnPeriod as StormwaterReturnPeriod,
          allowableOutflowCfs,
          safetyFactor: typeof data.safetyFactor === 'number' ? data.safetyFactor : undefined,
          flowLengthFt: typeof data.flowLengthFt === 'number' ? data.flowLengthFt : undefined,
          slopePercent: typeof data.slopePercent === 'number' ? data.slopePercent : undefined,
          location: typeof data.location === 'string' ? data.location : undefined,
          latitude: typeof data.latitude === 'number' ? data.latitude : undefined,
          longitude: typeof data.longitude === 'number' ? data.longitude : undefined,
          rainfall,
        });
        const governingRunoff = computeStormwaterRunoff({
          surfaces,
          returnPeriod: rawReturnPeriod as StormwaterReturnPeriod,
          durationMinutes: detention.governingDurationMinutes,
          flowLengthFt: typeof data.flowLengthFt === 'number' ? data.flowLengthFt : undefined,
          slopePercent: typeof data.slopePercent === 'number' ? data.slopePercent : undefined,
          location: typeof data.location === 'string' ? data.location : undefined,
          latitude: typeof data.latitude === 'number' ? data.latitude : undefined,
          longitude: typeof data.longitude === 'number' ? data.longitude : undefined,
        });
        setLatestStormwaterRunoff(governingRunoff);
        setLatestStormwaterDetention(detention);
        deps.logActionToFieldbook(
          `Stormwater Agent: ${detention.returnPeriod}-yr detention storage ` +
            `${detention.requiredStorageCf.toFixed(0)} cf (${detention.requiredStorageAcreFt.toFixed(3)} ac-ft) ` +
            `at ${detention.allowableOutflowCfs.toFixed(2)} cfs allowable outflow; ` +
            `governing ${detention.governingDurationLabel}.`,
        );
        return respond(message, true, {
          requiredStorageCf: detention.requiredStorageCf,
          requiredStorageAcreFt: detention.requiredStorageAcreFt,
          requiredStorageGallons: detention.requiredStorageGallons,
          allowableOutflowCfs: detention.allowableOutflowCfs,
          safetyFactor: detention.safetyFactor,
          governingDurationMinutes: detention.governingDurationMinutes,
          peakInflowCfs: detention.peakInflowCfs,
          trials: detention.trials,
          method: detention.method,
          warnings: detention.warnings,
          report: formatStormwaterReport(governingRunoff, detention),
        });
      } catch (error) {
        return respond(
          message,
          false,
          undefined,
          error instanceof Error ? error.message : String(error),
        );
      }
    }),
  );

  unsubs.push(
    registerGatedCommand('stormwater_surface_catalog', async (message) => {
      return respond(message, true, {
        surfaces: STORMWATER_SURFACE_TYPES,
        returnPeriods: [...STORMWATER_RETURN_PERIODS],
        durationsMinutes: [...STORMWATER_DURATIONS],
        dataSource: 'Rational Method reference coefficient table (editable per surface)',
      });
    }),
  );

  unsubs.push(
    registerGatedCommand('stormwater_format_report', async (message) => {
      const result = getLatestStormwaterRunoff();
      if (!result) {
        return respond(
          message,
          false,
          undefined,
          'No stormwater calculation is stored in this session. Run stormwater_compute_runoff first.',
        );
      }
      const detention = getLatestStormwaterDetention();
      return respond(message, true, {
        report: formatStormwaterReport(result, detention, {
          hydrograph: getLatestHydrograph(),
          routing: getLatestRouting(),
          channel: getLatestChannel(),
        }),
        peakRunoffCfs: result.peakRunoffCfs,
        requiredStorageCf: detention?.requiredStorageCf,
        requiredStorageAcreFt: detention?.requiredStorageAcreFt,
        governingDurationMinutes: detention?.governingDurationMinutes,
        computedAt: result.computedAt,
      });
    }),
  );

  unsubs.push(
    registerGatedCommand('stormwater_open_quickcheck', async (message) => {
      getDeps().openQuickCheck?.();
      return respond(message, true, { opened: true, mounted: 'chat' });
    }),
  );

  unsubs.push(
    registerGatedCommand('stormwater_clear_quickcheck', async (message) => {
      clearLatestStormwaterRunoff();
      clearLatestHydraulics();
      return respond(message, true, { cleared: true });
    }),
  );

  unsubs.push(
    registerGatedCommand('stormwater_generate_hydrograph', async (message) => {
      const data = (message.data ?? {}) as Record<string, unknown>;
      const surfaces = parseSurfaces(data.surfaces);
      if (surfaces.length === 0) {
        return respond(message, false, undefined, 'At least one positive-area surface is required.');
      }
      const returnPeriod =
        typeof data.returnPeriod === 'number' ? data.returnPeriod : 25;
      if (!isStormwaterReturnPeriod(returnPeriod)) {
        return respond(message, false, undefined, 'A valid returnPeriod is required.');
      }
      try {
        const rainfall = await resolveRainfall(data);
        if (!rainfall) {
          return respond(
            message,
            false,
            undefined,
            'NOAA Atlas 14 rainfall is required. Provide latitude/longitude.',
          );
        }
        const hydrograph = generateModifiedRationalHydrograph({
          surfaces,
          returnPeriod: returnPeriod as StormwaterReturnPeriod,
          tcMinutes: typeof data.tcMinutes === 'number' ? data.tcMinutes : undefined,
          flowLengthFt: typeof data.flowLengthFt === 'number' ? data.flowLengthFt : undefined,
          slopePercent: typeof data.slopePercent === 'number' ? data.slopePercent : undefined,
          durationMinutes: typeof data.durationMinutes === 'number' ? data.durationMinutes : undefined,
          rainfall,
        });
        setLatestHydrograph(hydrograph);
        setLatestRouting(null);
        return respond(message, true, {
          peakFlowCfs: hydrograph.peakFlowCfs,
          timeToPeakMinutes: hydrograph.timeToPeakMinutes,
          timeBaseMinutes: hydrograph.timeBaseMinutes,
          stormDurationMinutes: hydrograph.stormDurationMinutes,
          runoffVolumeCf: hydrograph.runoffVolumeCf,
          points: hydrograph.points,
          warnings: hydrograph.warnings,
        });
      } catch (error) {
        return respond(message, false, undefined, error instanceof Error ? error.message : String(error));
      }
    }),
  );

  unsubs.push(
    registerGatedCommand('stormwater_route_detention', async (message) => {
      const data = (message.data ?? {}) as Record<string, unknown>;
      const surfaces = parseSurfaces(data.surfaces);
      if (surfaces.length === 0) {
        return respond(message, false, undefined, 'At least one positive-area surface is required.');
      }
      const returnPeriod = typeof data.returnPeriod === 'number' ? data.returnPeriod : 25;
      if (!isStormwaterReturnPeriod(returnPeriod)) {
        return respond(message, false, undefined, 'A valid returnPeriod is required.');
      }
      const basin = (data.basin ?? {}) as Record<string, unknown>;
      const outlet = (data.outlet ?? {}) as Record<string, unknown>;
      try {
        const rainfall = await resolveRainfall(data);
        if (!rainfall) {
          return respond(message, false, undefined, 'NOAA Atlas 14 rainfall is required. Provide latitude/longitude.');
        }
        const hydrograph = generateModifiedRationalHydrograph({
          surfaces,
          returnPeriod: returnPeriod as StormwaterReturnPeriod,
          tcMinutes: typeof data.tcMinutes === 'number' ? data.tcMinutes : undefined,
          flowLengthFt: typeof data.flowLengthFt === 'number' ? data.flowLengthFt : undefined,
          slopePercent: typeof data.slopePercent === 'number' ? data.slopePercent : undefined,
          rainfall,
        });
        const routing = routeDetentionBasin({
          hydrograph,
          basin: {
            bottomWidthFt: typeof basin.bottomWidthFt === 'number' ? basin.bottomWidthFt : NaN,
            bottomLengthFt: typeof basin.bottomLengthFt === 'number' ? basin.bottomLengthFt : NaN,
            sideSlopeHv: typeof basin.sideSlopeHv === 'number' ? basin.sideSlopeHv : 0,
            maxDepthFt: typeof basin.maxDepthFt === 'number' ? basin.maxDepthFt : NaN,
          },
          outlet: {
            orificeDiameterIn: typeof outlet.orificeDiameterIn === 'number' ? outlet.orificeDiameterIn : 0,
            weirLengthFt: typeof outlet.weirLengthFt === 'number' ? outlet.weirLengthFt : 0,
            weirCrestFt: typeof outlet.weirCrestFt === 'number' ? outlet.weirCrestFt : 0,
          },
          allowableOutflowCfs:
            typeof data.allowableOutflowCfs === 'number' ? data.allowableOutflowCfs : undefined,
        });
        setLatestHydrograph(hydrograph);
        setLatestRouting(routing);
        return respond(message, true, {
          peakInflowCfs: routing.peakInflowCfs,
          peakOutflowCfs: routing.peakOutflowCfs,
          maxStageFt: routing.maxStageFt,
          maxStorageCf: routing.maxStorageCf,
          maxStorageAcreFt: routing.maxStorageAcreFt,
          inflowVolumeCf: routing.inflowVolumeCf,
          outflowVolumeCf: routing.outflowVolumeCf,
          passesAllowable: routing.passesAllowable,
          basinExceeded: routing.basinExceeded,
          warnings: routing.warnings,
          points: routing.points,
        });
      } catch (error) {
        return respond(message, false, undefined, error instanceof Error ? error.message : String(error));
      }
    }),
  );

  unsubs.push(
    registerGatedCommand('stormwater_channel_capacity', async (message) => {
      const data = (message.data ?? {}) as Record<string, unknown>;
      try {
        const result = computeManningChannel({
          shape:
            data.shape === 'rectangular' || data.shape === 'triangular' || data.shape === 'circular'
              ? data.shape
              : 'trapezoidal',
          bottomWidthFt: typeof data.bottomWidthFt === 'number' ? data.bottomWidthFt : undefined,
          sideSlopeHv: typeof data.sideSlopeHv === 'number' ? data.sideSlopeHv : undefined,
          diameterFt: typeof data.diameterFt === 'number' ? data.diameterFt : undefined,
          depthFt: typeof data.depthFt === 'number' ? data.depthFt : NaN,
          slope: typeof data.slope === 'number' ? data.slope : NaN,
          manningsN: typeof data.manningsN === 'number' ? data.manningsN : 0.013,
          designFlowCfs: typeof data.designFlowCfs === 'number' ? data.designFlowCfs : undefined,
        });
        setLatestChannel(result);
        return respond(message, true, {
          capacityCfs: result.capacityCfs,
          velocityFps: result.velocityFps,
          normalDepthFt: result.normalDepthFt,
          criticalDepthFt: result.criticalDepthFt,
          froude: result.froude,
          flowRegime: result.flowRegime,
          warnings: result.warnings,
        });
      } catch (error) {
        return respond(message, false, undefined, error instanceof Error ? error.message : String(error));
      }
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
