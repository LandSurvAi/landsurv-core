import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { buildStormwaterReportPdf } from '../services/stormwaterReportPdf.ts';
import { fetchNoaaAtlas14Rainfall } from '../services/stormwaterRainfall.ts';
import {
  STORMWATER_DURATIONS,
  STORMWATER_DURATION_LABELS,
  STORMWATER_RETURN_PERIODS,
  STORMWATER_SURFACE_TYPES,
  calculateTimeOfConcentrationFaa,
  calculateWeightedC,
  computeStormwaterDetention,
  computeStormwaterRunoff,
  formatStormwaterReport,
  getLatestStormwaterDetention,
  getLatestStormwaterRunoff,
  getRecommendedDuration,
  setLatestStormwaterDetention,
  setLatestStormwaterRunoff,
  subscribeStormwaterDetention,
  subscribeStormwaterRunoff,
  type StormwaterDetentionResult,
  type StormwaterRainfall,
  type StormwaterReturnPeriod,
  type StormwaterRunoffResult,
  type StormwaterSurface,
} from '../services/stormwaterService.ts';
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
  type ChannelShape,
  type DetentionRoutingResult,
  type ManningChannelResult,
  type StormwaterHydrographResult,
} from '../services/stormwaterHydraulics.ts';

export interface StormwaterDrawnArea {
  id: string;
  name: string;
  areaSqFt: number;
  source: 'hatch' | 'boundary' | 'inclusion' | 'other';
}

interface StormwaterPanelProps {
  onClose?: () => void;
  logActionToFieldbook?: (message: string) => void;
  /** Closed areas drawn on the canvas (hatches or boundary files). */
  drawnAreas?: StormwaterDrawnArea[];
  /** 'panel' keeps the local header; 'surface' lets the A2UI shell own the chrome. */
  chrome?: 'panel' | 'surface';
}

const SURFACE_SHORT: Record<string, string> = {
  'Pavement and Roofs': 'Pavement',
  'Gravel Areas': 'Gravel',
  'Bare Soil': 'Bare soil',
  Lawns: 'Lawns',
  'Landscaped Areas': 'Landscape',
  Pasture: 'Pasture',
  'Light Forest': 'Light forest',
  'Dense Forest': 'Dense forest',
  'Open Water': 'Water',
};

type ChipTone = 'slate' | 'sky' | 'emerald' | 'amber' | 'violet' | 'fuchsia' | 'cyan';

/** Per-surface chip colors so the row reads at a glance instead of a wall of gray. */
const SURFACE_TONE: Record<string, ChipTone> = {
  'Pavement and Roofs': 'slate',
  'Gravel Areas': 'amber',
  'Bare Soil': 'amber',
  Lawns: 'emerald',
  'Landscaped Areas': 'emerald',
  Pasture: 'emerald',
  'Light Forest': 'cyan',
  'Dense Forest': 'cyan',
  'Open Water': 'sky',
};

const CHIP_TONES: Record<ChipTone, { idle: string; active: string }> = {
  slate: {
    idle: 'border-slate-500/30 bg-slate-500/10 text-slate-300 hover:border-slate-400/60 hover:text-slate-100',
    active: 'border-slate-300/80 bg-slate-400/25 text-white',
  },
  sky: {
    idle: 'border-sky-500/30 bg-sky-500/10 text-sky-300 hover:border-sky-400/60 hover:text-sky-100',
    active: 'border-sky-300/80 bg-sky-500/30 text-sky-50',
  },
  emerald: {
    idle: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:border-emerald-400/60 hover:text-emerald-100',
    active: 'border-emerald-300/80 bg-emerald-500/30 text-emerald-50',
  },
  amber: {
    idle: 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:border-amber-400/60 hover:text-amber-100',
    active: 'border-amber-300/80 bg-amber-500/30 text-amber-50',
  },
  violet: {
    idle: 'border-violet-500/30 bg-violet-500/10 text-violet-300 hover:border-violet-400/60 hover:text-violet-100',
    active: 'border-violet-300/80 bg-violet-500/30 text-violet-50',
  },
  fuchsia: {
    idle: 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300 hover:border-fuchsia-400/60 hover:text-fuchsia-100',
    active: 'border-fuchsia-300/80 bg-fuchsia-500/30 text-fuchsia-50',
  },
  cyan: {
    idle: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:border-cyan-400/60 hover:text-cyan-100',
    active: 'border-cyan-300/80 bg-cyan-500/30 text-cyan-50',
  },
};

const Chip: React.FC<{
  active?: boolean;
  disabled?: boolean;
  title?: string;
  tone?: ChipTone;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active = false, disabled = false, title, tone = 'slate', onClick, children }) => {
  const styles = CHIP_TONES[tone];
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium leading-tight transition-colors ${
        active ? styles.active : styles.idle
      } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
    >
      {children}
    </button>
  );
};

interface SurfaceRow {
  id: string;
  type: string;
  areaSqFt: string;
  coefficient: string;
}

const SQFT_PER_ACRE = 43560;

const createRowId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sw-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const createRow = (type = 'Pavement and Roofs', areaSqFt = ''): SurfaceRow => ({
  id: createRowId(),
  type,
  areaSqFt,
  coefficient: '',
});

const coefficientFor = (type: string): number =>
  STORMWATER_SURFACE_TYPES.find((surface) => surface.key === type)?.coefficient ?? 0;

const RoutingChart: React.FC<{ routing: DetentionRoutingResult }> = ({ routing }) => {
  const points = routing.points;
  const maxTime = Math.max(1, ...points.map((point) => point.timeMinutes));
  const maxFlow = Math.max(0.1, routing.peakInflowCfs, routing.peakOutflowCfs);
  const pathFor = (key: 'inflowCfs' | 'outflowCfs'): string =>
    points
      .map((point, index) => {
        const x = (point.timeMinutes / maxTime) * 100;
        const y = 36 - (point[key] / maxFlow) * 32;
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');

  return (
    <div className="space-y-1">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-24 w-full">
        {[8, 18, 28].map((y) => (
          <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="#374151" strokeWidth="0.25" />
        ))}
        <path d={pathFor('inflowCfs')} fill="none" stroke="#f59e0b" strokeWidth="0.9" />
        <path d={pathFor('outflowCfs')} fill="none" stroke="#38bdf8" strokeWidth="0.9" />
      </svg>
      <div className="flex items-center gap-3 text-[10px] text-gray-500">
        <span className="inline-flex items-center gap-1">
          <span className="h-0.5 w-3 bg-amber-500" /> Inflow
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-0.5 w-3 bg-sky-400" /> Outflow
        </span>
        <span className="ml-auto">0–{maxTime.toFixed(0)} min</span>
      </div>
    </div>
  );
};

export const StormwaterPanel: React.FC<StormwaterPanelProps> = ({
  onClose,
  logActionToFieldbook,
  drawnAreas = [],
  chrome = 'panel',
}) => {
  const [rows, setRows] = useState<SurfaceRow[]>(() => [createRow('Pavement and Roofs', '10000')]);
  const [returnPeriod, setReturnPeriod] = useState<StormwaterReturnPeriod>(25);
  const [durationMinutes, setDurationMinutes] = useState<number>(15);
  const [useTimeOfConcentration, setUseTimeOfConcentration] = useState(false);
  const [flowLengthFt, setFlowLengthFt] = useState('');
  const [slopePercent, setSlopePercent] = useState('');
  const [location, setLocation] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [rainfall, setRainfall] = useState<StormwaterRainfall | null>(null);
  const [useManualIntensity, setUseManualIntensity] = useState(false);
  const [manualIntensity, setManualIntensity] = useState('');
  const [isFetchingRainfall, setIsFetchingRainfall] = useState(false);
  const [detentionEnabled, setDetentionEnabled] = useState(true);
  const [allowableOutflowCfs, setAllowableOutflowCfs] = useState('0.5');
  const [safetyFactor, setSafetyFactor] = useState('1.0');
  const [result, setResult] = useState<StormwaterRunoffResult | null>(() =>
    getLatestStormwaterRunoff(),
  );
  const [detentionResult, setDetentionResult] = useState<StormwaterDetentionResult | null>(() =>
    getLatestStormwaterDetention(),
  );
  const [hydrograph, setHydrograph] = useState<StormwaterHydrographResult | null>(() =>
    getLatestHydrograph(),
  );
  const [routing, setRouting] = useState<DetentionRoutingResult | null>(() => getLatestRouting());
  const [channelResult, setChannelResult] = useState<ManningChannelResult | null>(() =>
    getLatestChannel(),
  );
  const [basinWidth, setBasinWidth] = useState('20');
  const [basinLength, setBasinLength] = useState('20');
  const [basinSideSlope, setBasinSideSlope] = useState('2');
  const [basinDepth, setBasinDepth] = useState('4');
  const [orificeDiameter, setOrificeDiameter] = useState('6');
  const [weirLength, setWeirLength] = useState('');
  const [weirCrest, setWeirCrest] = useState('3');
  const [routingAllowable, setRoutingAllowable] = useState('0.5');
  const [channelShape, setChannelShape] = useState<ChannelShape>('trapezoidal');
  const [channelBottom, setChannelBottom] = useState('4');
  const [channelSide, setChannelSide] = useState('3');
  const [channelDiameter, setChannelDiameter] = useState('2');
  const [channelDepth, setChannelDepth] = useState('1.5');
  const [channelSlope, setChannelSlope] = useState('0.005');
  const [channelN, setChannelN] = useState('0.013');
  const [channelFlow, setChannelFlow] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  useEffect(() => subscribeStormwaterRunoff(setResult), []);
  useEffect(() => subscribeStormwaterDetention(setDetentionResult), []);

  const surfaces = useMemo<StormwaterSurface[]>(
    () =>
      rows
        .map((row) => ({
          type: row.type,
          areaSqFt: Number(row.areaSqFt),
          coefficient:
            row.coefficient.trim() === '' ? undefined : Number(row.coefficient),
        }))
        .filter(
          (surface) =>
            Number.isFinite(surface.areaSqFt) &&
            surface.areaSqFt > 0 &&
            (surface.coefficient === undefined ||
              (Number.isFinite(surface.coefficient) &&
                surface.coefficient >= 0 &&
                surface.coefficient <= 1)),
        ),
    [rows],
  );

  const totalAreaSqFt = useMemo(
    () => surfaces.reduce((sum, surface) => sum + surface.areaSqFt, 0),
    [surfaces],
  );
  const totalAreaAcres = totalAreaSqFt / SQFT_PER_ACRE;
  const weightedC = useMemo(
    () => (surfaces.length > 0 ? calculateWeightedC(surfaces) : 0),
    [surfaces],
  );

  const tcPreview = useMemo(() => {
    if (!useTimeOfConcentration || surfaces.length === 0) return null;
    const length = Number(flowLengthFt);
    const slope = Number(slopePercent);
    if (!Number.isFinite(length) || length <= 0) return null;
    if (!Number.isFinite(slope) || slope <= 0) return null;
    return calculateTimeOfConcentrationFaa(weightedC, length, slope);
  }, [useTimeOfConcentration, surfaces.length, weightedC, flowLengthFt, slopePercent]);

  const hasManualIntensity =
    useManualIntensity && Number.isFinite(Number(manualIntensity)) && Number(manualIntensity) > 0;

  const updateRow = useCallback((id: string, patch: Partial<SurfaceRow>) => {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }, []);

  const fetchRainfallForSite = useCallback(async (): Promise<StormwaterRainfall | null> => {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) return null;
    const data = await fetchNoaaAtlas14Rainfall(lat, lon);
    setRainfall(data);
    setUseManualIntensity(false);
    logActionToFieldbook?.(
      `Stormwater Agent: loaded NOAA Atlas 14 rainfall for ${lat.toFixed(4)}, ${lon.toFixed(4)} ` +
        `(${data.label}).`,
    );
    return data;
  }, [latitude, longitude, logActionToFieldbook]);

  const handleFetchRainfall = useCallback(async () => {
    setIsFetchingRainfall(true);
    setError(null);
    try {
      const data = await fetchRainfallForSite();
      if (!data) {
        setError('Enter a valid latitude and longitude to look up NOAA Atlas 14 rainfall.');
      }
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setIsFetchingRainfall(false);
    }
  }, [fetchRainfallForSite]);

  const handleCompute = useCallback(async () => {
    setError(null);
    if (surfaces.length === 0) {
      setError('Add at least one surface with a positive area.');
      return;
    }
    if (useTimeOfConcentration && tcPreview === null) {
      setError('Enter a positive flow-path length and average slope to use time of concentration.');
      return;
    }
    let activeRainfall = rainfall;
    if (!activeRainfall && !hasManualIntensity) {
      // Try the NOAA lookup automatically when coordinates are present.
      try {
        activeRainfall = await fetchRainfallForSite();
        if (!activeRainfall) {
          setError(
            'Load NOAA Atlas 14 rainfall (enter coordinates) or use a manual design intensity.',
          );
          return;
        }
      } catch (fetchError) {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : 'Load NOAA Atlas 14 rainfall or use a manual design intensity.',
        );
        return;
      }
    }

    const outflow = Number(allowableOutflowCfs);
    const factor = Number(safetyFactor);
    if (detentionEnabled && (!Number.isFinite(outflow) || outflow < 0)) {
      setError('Allowable release rate must be zero or greater.');
      return;
    }
    if (detentionEnabled && (!Number.isFinite(factor) || factor < 1)) {
      setError('Detention safety factor must be at least 1.0.');
      return;
    }

    try {
      const computed = computeStormwaterRunoff({
        surfaces,
        returnPeriod,
        durationMinutes: useTimeOfConcentration ? undefined : durationMinutes,
        flowLengthFt: useTimeOfConcentration ? Number(flowLengthFt) : undefined,
        slopePercent: useTimeOfConcentration ? Number(slopePercent) : undefined,
        location: location.trim() || undefined,
        latitude: latitude.trim() === '' ? undefined : Number(latitude),
        longitude: longitude.trim() === '' ? undefined : Number(longitude),
        rainfall: activeRainfall ?? undefined,
        designIntensityInPerHr:
          useManualIntensity && Number(manualIntensity) > 0 ? Number(manualIntensity) : undefined,
      });
      setLatestStormwaterRunoff(computed);
      setHydrograph(null);
      setRouting(null);
      setLatestHydrograph(null);
      setLatestRouting(null);

      let storage: StormwaterDetentionResult | null = null;
      if (detentionEnabled) {
        if (!activeRainfall) {
          setLatestStormwaterDetention(null);
          setError('Detention sizing needs a full IDF curve. Load NOAA Atlas 14 rainfall first.');
        } else {
          try {
            storage = computeStormwaterDetention({
              surfaces,
              returnPeriod,
              flowLengthFt: useTimeOfConcentration ? Number(flowLengthFt) : undefined,
              slopePercent: useTimeOfConcentration ? Number(slopePercent) : undefined,
              allowableOutflowCfs: outflow,
              safetyFactor: factor,
              location: location.trim() || undefined,
              rainfall: activeRainfall,
            });
            setLatestStormwaterDetention(storage);
          } catch (detentionError) {
            setLatestStormwaterDetention(null);
            setError(
              detentionError instanceof Error ? detentionError.message : String(detentionError),
            );
          }
        }
      } else {
        setLatestStormwaterDetention(null);
      }

      logActionToFieldbook?.(
        `Stormwater Agent: ${computed.returnPeriod}-yr ${computed.durationLabel} peak runoff ` +
          `${computed.peakRunoffCfs.toFixed(2)} cfs from ${computed.totalAreaAcres.toFixed(2)} ac ` +
          `(weighted C ${computed.weightedC.toFixed(3)}, ${computed.dataSource})` +
          (storage
            ? `; detention ${storage.requiredStorageCf.toFixed(0)} cf at ` +
              `${storage.allowableOutflowCfs.toFixed(2)} cfs allowable outflow.`
            : '.'),
      );
    } catch (computeError) {
      setError(computeError instanceof Error ? computeError.message : String(computeError));
    }
  }, [
    surfaces,
    useTimeOfConcentration,
    tcPreview,
    rainfall,
    hasManualIntensity,
    fetchRainfallForSite,
    allowableOutflowCfs,
    safetyFactor,
    detentionEnabled,
    returnPeriod,
    durationMinutes,
    flowLengthFt,
    slopePercent,
    location,
    latitude,
    longitude,
    useManualIntensity,
    manualIntensity,
    logActionToFieldbook,
  ]);

  const handleRouteBasin = useCallback(() => {
    setError(null);
    if (!result) {
      setError('Compute peak runoff before routing the basin.');
      return;
    }
    if (!rainfall) {
      setError('Basin routing needs a full NOAA Atlas 14 IDF curve.');
      return;
    }
    try {
      const hydro = generateModifiedRationalHydrograph({
        surfaces,
        returnPeriod,
        tcMinutes: result.tcMinutes ?? undefined,
        flowLengthFt: useTimeOfConcentration ? Number(flowLengthFt) : undefined,
        slopePercent: useTimeOfConcentration ? Number(slopePercent) : undefined,
        durationMinutes: useTimeOfConcentration ? undefined : durationMinutes,
        rainfall,
      });
      const routed = routeDetentionBasin({
        hydrograph: hydro,
        basin: {
          bottomWidthFt: Number(basinWidth),
          bottomLengthFt: Number(basinLength),
          sideSlopeHv: Number(basinSideSlope),
          maxDepthFt: Number(basinDepth),
        },
        outlet: {
          orificeDiameterIn: Number(orificeDiameter) || 0,
          weirLengthFt: Number(weirLength) || 0,
          weirCrestFt: Number(weirCrest) || 0,
        },
        allowableOutflowCfs: Number(routingAllowable),
      });
      setLatestHydrograph(hydro);
      setLatestRouting(routed);
      setHydrograph(hydro);
      setRouting(routed);
      logActionToFieldbook?.(
        `Stormwater Agent: routed ${hydro.stormDurationMinutes.toFixed(0)}-min hydrograph; ` +
          `peak outflow ${routed.peakOutflowCfs.toFixed(2)} cfs at stage ` +
          `${routed.maxStageFt.toFixed(2)} ft (${routed.maxStorageCf.toFixed(0)} cf stored).`,
      );
    } catch (routeError) {
      setError(routeError instanceof Error ? routeError.message : String(routeError));
    }
  }, [
    result,
    rainfall,
    surfaces,
    returnPeriod,
    useTimeOfConcentration,
    flowLengthFt,
    slopePercent,
    durationMinutes,
    basinWidth,
    basinLength,
    basinSideSlope,
    basinDepth,
    orificeDiameter,
    weirLength,
    weirCrest,
    routingAllowable,
    logActionToFieldbook,
  ]);

  const handleComputeChannel = useCallback(() => {
    setError(null);
    try {
      const computed = computeManningChannel({
        shape: channelShape,
        bottomWidthFt: Number(channelBottom),
        sideSlopeHv: Number(channelSide),
        diameterFt: Number(channelDiameter),
        depthFt: Number(channelDepth),
        slope: Number(channelSlope),
        manningsN: Number(channelN),
        designFlowCfs: channelFlow.trim() === '' ? undefined : Number(channelFlow),
      });
      setLatestChannel(computed);
      setChannelResult(computed);
      logActionToFieldbook?.(
        `Stormwater Agent: ${channelShape} channel capacity ${computed.capacityCfs.toFixed(2)} cfs ` +
          `at ${computed.depthFt.toFixed(2)} ft depth (${computed.velocityFps.toFixed(2)} fps, ${computed.flowRegime}).`,
      );
    } catch (channelError) {
      setError(channelError instanceof Error ? channelError.message : String(channelError));
    }
  }, [
    channelShape,
    channelBottom,
    channelSide,
    channelDiameter,
    channelDepth,
    channelSlope,
    channelN,
    channelFlow,
    logActionToFieldbook,
  ]);

  const addDrawnArea = useCallback((area: StormwaterDrawnArea) => {
    setRows((current) => [
      ...current,
      createRow('Pavement and Roofs', area.areaSqFt.toFixed(0)),
    ]);
    logActionToFieldbook?.(
      `Stormwater Agent: added drawn area "${area.name}" (${(area.areaSqFt / SQFT_PER_ACRE).toFixed(3)} ac).`,
    );
  }, [logActionToFieldbook]);

  const handleClear = useCallback(() => {
    setLatestStormwaterRunoff(null);
    setLatestStormwaterDetention(null);
    clearLatestHydraulics();
    setResult(null);
    setDetentionResult(null);
    setHydrograph(null);
    setRouting(null);
    setChannelResult(null);
    setError(null);
    setCopied(false);
  }, []);

  const handleCopyReport = useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(
        formatStormwaterReport(result, detentionResult, {
          hydrograph,
          routing,
          channel: channelResult,
        }),
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Could not copy the report to the clipboard.');
    }
  }, [result, detentionResult, hydrograph, routing, channelResult]);

  const handleDownloadPdf = useCallback(() => {
    if (!result) return;
    setIsExportingPdf(true);
    setError(null);
    try {
      const artifact = buildStormwaterReportPdf({
        result,
        detention: detentionResult,
        hydraulics: { hydrograph, routing, channel: channelResult },
        projectName: location.trim() || undefined,
      });
      const url = URL.createObjectURL(artifact.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = artifact.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      logActionToFieldbook?.(`Stormwater Agent: exported ${artifact.fileName}.`);
    } catch (pdfError) {
      setError(pdfError instanceof Error ? pdfError.message : String(pdfError));
    } finally {
      setIsExportingPdf(false);
    }
  }, [
    result,
    detentionResult,
    hydrograph,
    routing,
    channelResult,
    location,
    logActionToFieldbook,
  ]);

  const effectiveDuration = useTimeOfConcentration
    ? (tcPreview !== null ? getRecommendedDuration(tcPreview) : null)
    : durationMinutes;

  return (
    <div
      className={`flex flex-col bg-gray-900 text-gray-100 ${
        chrome === 'panel' ? 'h-full overflow-hidden' : ''
      }`}
    >
      {chrome === 'panel' && (
        <div className="flex items-start justify-between gap-3 border-b border-gray-700 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Stormwater Quick-Check</h2>
            <p className="mt-0.5 text-[11px] text-gray-500">
              National Rational Method · NOAA Atlas 14 · Experimental
            </p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-gray-700 px-2 py-1 text-[11px] text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
            >
              Close
            </button>
          )}
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <section className="space-y-2 rounded-md border border-gray-700 bg-gray-800/40 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Rainfall (NOAA Atlas 14)
            </span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                rainfall
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : hasManualIntensity
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'bg-gray-700/60 text-gray-400'
              }`}
            >
              {rainfall ? 'NOAA' : hasManualIntensity ? 'Manual' : 'Not set'}
            </span>
          </div>
          <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-1.5">
            <label className="block">
              <span className="mb-1 block text-[10px] text-gray-500">Latitude</span>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={latitude}
                onChange={(event) => setLatitude(event.target.value)}
                placeholder="39.9526"
                className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100 placeholder:text-gray-600"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] text-gray-500">Longitude</span>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={longitude}
                onChange={(event) => setLongitude(event.target.value)}
                placeholder="-75.1652"
                className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100 placeholder:text-gray-600"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                void handleFetchRainfall();
              }}
              disabled={isFetchingRainfall}
              className="rounded-md border border-sky-500/50 px-2 py-1.5 text-[11px] font-semibold text-sky-300 transition-colors hover:bg-sky-500/20 disabled:opacity-50"
            >
              {isFetchingRainfall ? 'Loading…' : 'Fetch'}
            </button>
          </div>
          {rainfall && (
            <p className="text-[10px] leading-snug text-emerald-300/80">
              {rainfall.label} · {rainfall.latitude?.toFixed(4)}, {rainfall.longitude?.toFixed(4)}
            </p>
          )}
          <label className="flex items-center gap-2 text-[11px] text-gray-300">
            <input
              type="checkbox"
              checked={useManualIntensity}
              onChange={(event) => setUseManualIntensity(event.target.checked)}
              className="accent-sky-500"
            />
            Use a manual design intensity (single storm only)
          </label>
          {useManualIntensity && (
            <label className="block">
              <span className="mb-1 block text-[10px] text-gray-500">Intensity (in/hr)</span>
              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={manualIntensity}
                onChange={(event) => setManualIntensity(event.target.value)}
                placeholder="1.60"
                className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100 placeholder:text-gray-600"
              />
            </label>
          )}
          <p className="text-[10px] leading-snug text-gray-500">
            Lookup uses the point NOAA Atlas 14 service. Locations outside Atlas 14 coverage need a
            local intensity from the jurisdiction.
          </p>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Contributing surfaces
            </span>
            <button
              type="button"
              onClick={() => setRows((current) => [...current, createRow()])}
              className="rounded border border-gray-700 px-2 py-0.5 text-[11px] text-gray-300 transition-colors hover:bg-gray-800"
            >
              + Add
            </button>
          </div>
          <div className="space-y-1.5 rounded-md border border-sky-500/20 bg-sky-500/5 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-300/80">
                Drawn areas
              </span>
              {drawnAreas.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setRows(
                      drawnAreas.map((area) =>
                        createRow('Pavement and Roofs', area.areaSqFt.toFixed(0)),
                      ),
                    )
                  }
                  className="text-[10px] font-semibold text-sky-300 underline decoration-sky-400/30 underline-offset-2 hover:text-sky-200"
                >
                  Use all
                </button>
              )}
            </div>
            {drawnAreas.length === 0 ? (
              <p className="text-[10px] leading-snug text-gray-500">
                Hatch a closed area or draw a boundary on the canvas; its area appears here as a
                chip you can add as a contributing surface.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {drawnAreas.map((area) => (
                  <Chip
                    key={area.id}
                    tone="fuchsia"
                    title={`${area.name} - ${area.areaSqFt.toFixed(0)} sq ft`}
                    onClick={() => addDrawnArea(area)}
                  >
                    {area.name} · {(area.areaSqFt / SQFT_PER_ACRE).toFixed(2)} ac
                  </Chip>
                ))}
              </div>
            )}
          </div>
          {rows.map((row) => (
            <div
              key={row.id}
              className="space-y-1 rounded-md border border-gray-700 bg-gray-800/30 p-1.5"
            >
              <div className="flex flex-wrap gap-1">
                {STORMWATER_SURFACE_TYPES.map((surface) => (
                  <Chip
                    key={surface.key}
                    active={row.type === surface.key}
                    tone={SURFACE_TONE[surface.key] ?? 'slate'}
                    title={surface.description}
                    onClick={() => updateRow(row.id, { type: surface.key })}
                  >
                    {SURFACE_SHORT[surface.key] ?? surface.key} {surface.coefficient.toFixed(2)}
                  </Chip>
                ))}
              </div>
              <div className="grid grid-cols-[1fr_58px_24px] items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={row.areaSqFt}
                  onChange={(event) => updateRow(row.id, { areaSqFt: event.target.value })}
                  placeholder="Area (sq ft)"
                  className="rounded border border-gray-700 bg-gray-800 px-1.5 py-1 text-[11px] text-gray-100 placeholder:text-gray-600"
                />
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  inputMode="decimal"
                  value={row.coefficient}
                  onChange={(event) => updateRow(row.id, { coefficient: event.target.value })}
                  placeholder={coefficientFor(row.type).toFixed(2)}
                  title="Optional C override"
                  className="rounded border border-gray-700 bg-gray-800 px-1.5 py-1 text-[11px] text-gray-100 placeholder:text-gray-600"
                />
                <button
                  type="button"
                  onClick={() =>
                    setRows((current) =>
                      current.length > 1 ? current.filter((item) => item.id !== row.id) : current,
                    )
                  }
                  className="rounded px-1 text-sm leading-none text-gray-500 transition-colors hover:text-red-400"
                  title="Remove surface"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          <p className="text-[10px] text-gray-500">
            {surfaces.length} surface{surfaces.length === 1 ? '' : 's'} ·{' '}
            {Math.round(totalAreaSqFt).toLocaleString()} sq ft ({totalAreaAcres.toFixed(3)} ac) ·
            weighted C {weightedC.toFixed(3)}
          </p>
          <p className="text-[10px] leading-snug text-gray-500">
            Blank C uses the table value. Edit C per surface to match the jurisdiction or a
            site-specific analysis.
          </p>
        </section>

        <div className="space-y-2">
          <div>
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Return period
            </span>
            <div className="flex flex-wrap gap-1">
              {STORMWATER_RETURN_PERIODS.map((period) => (
                <Chip
                  key={period}
                  active={returnPeriod === period}
                  tone="sky"
                  onClick={() => setReturnPeriod(period as StormwaterReturnPeriod)}
                >
                  {period}-yr
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Duration
            </span>
            <div className="flex flex-wrap gap-1">
              {STORMWATER_DURATIONS.map((duration) => (
                <Chip
                  key={duration}
                  active={effectiveDuration === duration}
                  disabled={useTimeOfConcentration}
                  tone="violet"
                  title={useTimeOfConcentration ? 'Duration follows Tc' : undefined}
                  onClick={() => setDurationMinutes(duration)}
                >
                  {STORMWATER_DURATION_LABELS[duration]}
                </Chip>
              ))}
            </div>
            {useTimeOfConcentration && (
              <p className="mt-1 text-[10px] text-gray-500">
                Duration follows the Tc-recommended storm.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2 rounded-md border border-gray-700 bg-gray-800/40 p-2.5">
          <label className="flex items-center gap-2 text-[11px] font-medium text-gray-300">
            <input
              type="checkbox"
              checked={useTimeOfConcentration}
              onChange={(event) => setUseTimeOfConcentration(event.target.checked)}
              className="accent-sky-500"
            />
            Calculate time of concentration (FAA)
          </label>
          {useTimeOfConcentration && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[10px] text-gray-500">Flow path (ft)</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={flowLengthFt}
                    onChange={(event) => setFlowLengthFt(event.target.value)}
                    placeholder="500"
                    className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100 placeholder:text-gray-600"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] text-gray-500">Slope (%)</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={slopePercent}
                    onChange={(event) => setSlopePercent(event.target.value)}
                    placeholder="2"
                    className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100 placeholder:text-gray-600"
                  />
                </label>
              </div>
              {tcPreview !== null && (
                <p className="text-[10px] text-sky-300/90">
                  Tc ≈ {tcPreview.toFixed(1)} min → use the{' '}
                  {STORMWATER_DURATION_LABELS[getRecommendedDuration(tcPreview)]} storm.
                </p>
              )}
            </>
          )}
        </div>

        <div className="space-y-2 rounded-md border border-gray-700 bg-gray-800/40 p-2.5">
          <label className="flex items-center gap-2 text-[11px] font-medium text-gray-300">
            <input
              type="checkbox"
              checked={detentionEnabled}
              onChange={(event) => setDetentionEnabled(event.target.checked)}
              className="accent-sky-500"
            />
            Size detention storage
          </label>
          {detentionEnabled && (
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[10px] text-gray-500">
                  Allowable release (cfs)
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={allowableOutflowCfs}
                  onChange={(event) => setAllowableOutflowCfs(event.target.value)}
                  placeholder="0.5"
                  className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100 placeholder:text-gray-600"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] text-gray-500">Safety factor</span>
                <input
                  type="number"
                  min="1"
                  step="0.05"
                  inputMode="decimal"
                  value={safetyFactor}
                  onChange={(event) => setSafetyFactor(event.target.value)}
                  placeholder="1.0"
                  className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100 placeholder:text-gray-600"
                />
              </label>
            </div>
          )}
          <p className="text-[10px] leading-snug text-gray-500">
            Critical-duration Modified Rational Method. Routing below verifies the basin and outlet.
          </p>
        </div>

        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Location (optional)
          </span>
          <input
            type="text"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="Address or site description"
            className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-100 placeholder:text-gray-600"
          />
        </label>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void handleCompute();
            }}
            className="flex-1 rounded-md bg-sky-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-500"
          >
            Compute Peak Runoff
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="rounded-md border border-gray-700 px-3 py-2 text-xs text-gray-300 transition-colors hover:bg-gray-800"
          >
            Clear
          </button>
        </div>

        {error && (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300">
            {error}
          </p>
        )}

        {result && (
          <div className="space-y-2 rounded-md border border-sky-500/40 bg-sky-500/10 p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-300/80">
                Peak runoff
              </span>
              <span className="text-[10px] text-gray-400">
                {result.returnPeriod}-yr · {result.durationLabel}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-sky-300">
                {result.peakRunoffCfs.toFixed(2)}
              </span>
              <span className="text-xs text-gray-400">cfs</span>
              <span className="text-[11px] text-gray-500">
                / {result.peakRunoffGpm.toFixed(0)} gpm
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <div className="flex justify-between">
                <dt className="text-gray-500">C</dt>
                <dd>{result.weightedC.toFixed(3)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Area</dt>
                <dd>{result.totalAreaAcres.toFixed(2)} ac</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Intensity</dt>
                <dd>{result.rainfallIntensity.toFixed(2)} in/hr</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Tc</dt>
                <dd>{result.tcMinutes !== null ? `${result.tcMinutes.toFixed(1)} min` : '—'}</dd>
              </div>
            </dl>
            <p className="text-[10px] leading-snug text-gray-500">{result.citation}</p>
          </div>
        )}

        {detentionResult && (
          <div className="space-y-2 rounded-md border border-blue-500/40 bg-blue-500/10 p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-300/80">
                Required detention storage
              </span>
              <span className="text-[10px] text-gray-400">
                {detentionResult.returnPeriod}-yr · {detentionResult.governingDurationLabel}
              </span>
            </div>
            <div className="flex flex-wrap items-baseline gap-1.5">
              <span className="text-xl font-bold text-blue-300">
                {Math.round(detentionResult.requiredStorageCf).toLocaleString()}
              </span>
              <span className="text-xs text-gray-400">cf</span>
              <span className="text-[11px] text-gray-500">
                {detentionResult.requiredStorageAcreFt.toFixed(3)} ac-ft ·{' '}
                {Math.round(detentionResult.requiredStorageGallons).toLocaleString()} gal
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <div className="flex justify-between">
                <dt className="text-gray-500">Allowable out</dt>
                <dd>{detentionResult.allowableOutflowCfs.toFixed(2)} cfs</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Peak inflow</dt>
                <dd>{detentionResult.peakInflowCfs.toFixed(2)} cfs</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Safety factor</dt>
                <dd>{detentionResult.safetyFactor.toFixed(2)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Critical storm</dt>
                <dd>{detentionResult.governingDurationLabel}</dd>
              </div>
            </dl>
            <details className="rounded border border-blue-500/20 bg-gray-900/30 px-2 py-1.5">
              <summary className="cursor-pointer text-[10px] font-semibold text-blue-200/80">
                Duration trials
              </summary>
              <table className="mt-1 w-full text-[10px]">
                <thead>
                  <tr className="text-gray-500">
                    <th className="text-left font-medium">Storm</th>
                    <th className="text-right font-medium">Q in</th>
                    <th className="text-right font-medium">Storage</th>
                  </tr>
                </thead>
                <tbody>
                  {detentionResult.trials.map((trial) => (
                    <tr
                      key={trial.durationMinutes}
                      className={
                        trial.durationMinutes === detentionResult.governingDurationMinutes
                          ? 'font-semibold text-blue-200'
                          : 'text-gray-400'
                      }
                    >
                      <td className="py-0.5 text-left">{trial.durationLabel}</td>
                      <td className="text-right">{trial.peakInflowCfs.toFixed(2)} cfs</td>
                      <td className="text-right">{Math.round(trial.storageCf).toLocaleString()} cf</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>
        )}

        {result && result.warnings.length > 0 && (
          <ul className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[10px] leading-snug text-amber-200/90">
            {result.warnings.map((warning) => (
              <li key={warning}>• {warning}</li>
            ))}
          </ul>
        )}

        {result && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                void handleCopyReport();
              }}
              className="rounded-md border border-sky-500/50 px-2 py-1.5 text-xs font-semibold text-sky-300 transition-colors hover:bg-sky-500/20"
            >
              {copied ? 'Report copied' : 'Copy report'}
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isExportingPdf}
              className="rounded-md border border-blue-500/50 px-2 py-1.5 text-xs font-semibold text-blue-300 transition-colors hover:bg-blue-500/20 disabled:opacity-50"
            >
              {isExportingPdf ? 'Building PDF…' : 'Download PDF'}
            </button>
          </div>
        )}

        <details className="rounded-md border border-gray-700 bg-gray-800/30 px-2.5 py-2">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Hydrograph & detention routing
          </summary>
          <div className="mt-2 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[10px] text-gray-500">Bottom width (ft)</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={basinWidth}
                  onChange={(event) => setBasinWidth(event.target.value)}
                  className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] text-gray-500">Bottom length (ft)</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={basinLength}
                  onChange={(event) => setBasinLength(event.target.value)}
                  className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] text-gray-500">Side slope (H:V)</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={basinSideSlope}
                  onChange={(event) => setBasinSideSlope(event.target.value)}
                  className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] text-gray-500">Max depth (ft)</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={basinDepth}
                  onChange={(event) => setBasinDepth(event.target.value)}
                  className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] text-gray-500">Orifice dia. (in)</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={orificeDiameter}
                  onChange={(event) => setOrificeDiameter(event.target.value)}
                  className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] text-gray-500">Weir length (ft)</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={weirLength}
                  onChange={(event) => setWeirLength(event.target.value)}
                  placeholder="optional"
                  className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100 placeholder:text-gray-600"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] text-gray-500">Weir crest (ft)</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={weirCrest}
                  onChange={(event) => setWeirCrest(event.target.value)}
                  className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] text-gray-500">Allowable out (cfs)</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={routingAllowable}
                  onChange={(event) => setRoutingAllowable(event.target.value)}
                  className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={handleRouteBasin}
              className="w-full rounded-md border border-sky-500/50 px-2 py-1.5 text-[11px] font-semibold text-sky-300 transition-colors hover:bg-sky-500/20"
            >
              Generate Hydrograph & Route Basin
            </button>
            {routing && (
              <div className="space-y-2 rounded border border-sky-500/30 bg-sky-500/10 px-2 py-2 text-[10px] text-gray-300">
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                  <span>Peak in: {routing.peakInflowCfs.toFixed(2)} cfs</span>
                  <span>Peak out: {routing.peakOutflowCfs.toFixed(2)} cfs</span>
                  <span>Max stage: {routing.maxStageFt.toFixed(2)} ft</span>
                  <span>Max storage: {Math.round(routing.maxStorageCf).toLocaleString()} cf</span>
                  <span>Volume in: {Math.round(routing.inflowVolumeCf).toLocaleString()} cf</span>
                  <span>Passes: {routing.passesAllowable === null ? 'n/a' : routing.passesAllowable ? 'YES' : 'NO'}</span>
                </div>
                {routing.basinExceeded && (
                  <p className="font-semibold text-amber-300">
                    Basin overtops the entered depth. Increase storage or outlet capacity.
                  </p>
                )}
                <RoutingChart routing={routing} />
              </div>
            )}
          </div>
        </details>

        <details className="rounded-md border border-gray-700 bg-gray-800/30 px-2.5 py-2">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Manning channel / pipe capacity
          </summary>
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap gap-1">
              {([
                ['trapezoidal', 'Trapezoidal'],
                ['rectangular', 'Rectangular'],
                ['triangular', 'Triangular'],
                ['circular', 'Circular pipe'],
              ] as const).map(([shape, label]) => (
                <Chip
                  key={shape}
                  active={channelShape === shape}
                  tone="amber"
                  onClick={() => setChannelShape(shape)}
                >
                  {label}
                </Chip>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[10px] text-gray-500">Depth (ft)</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={channelDepth}
                  onChange={(event) => setChannelDepth(event.target.value)}
                  className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100"
                />
              </label>
              {channelShape !== 'circular' && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-[10px] text-gray-500">Bottom width (ft)</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={channelBottom}
                      onChange={(event) => setChannelBottom(event.target.value)}
                      className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] text-gray-500">Side slope (H:V)</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={channelSide}
                      onChange={(event) => setChannelSide(event.target.value)}
                      className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                </>
              )}
              {channelShape === 'circular' && (
                <label className="block">
                  <span className="mb-1 block text-[10px] text-gray-500">Diameter (ft)</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={channelDiameter}
                    onChange={(event) => setChannelDiameter(event.target.value)}
                    className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100"
                  />
                </label>
              )}
              <label className="block">
                <span className="mb-1 block text-[10px] text-gray-500">Slope (ft/ft)</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={channelSlope}
                  onChange={(event) => setChannelSlope(event.target.value)}
                  className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] text-gray-500">Manning n</span>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={channelN}
                  onChange={(event) => setChannelN(event.target.value)}
                  className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] text-gray-500">Design flow (cfs)</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={channelFlow}
                  onChange={(event) => setChannelFlow(event.target.value)}
                  placeholder="optional"
                  className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100 placeholder:text-gray-600"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={handleComputeChannel}
              className="w-full rounded-md border border-sky-500/50 px-2 py-1.5 text-[11px] font-semibold text-sky-300 transition-colors hover:bg-sky-500/20"
            >
              Compute Channel Capacity
            </button>
            {channelResult && (
              <div className="space-y-1 rounded border border-sky-500/30 bg-sky-500/10 px-2 py-2 text-[10px] text-gray-300">
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                  <span>Capacity: {channelResult.capacityCfs.toFixed(2)} cfs</span>
                  <span>Velocity: {channelResult.velocityFps.toFixed(2)} fps</span>
                  <span>Area: {channelResult.areaSqFt.toFixed(2)} sq ft</span>
                  <span>R: {channelResult.hydraulicRadiusFt.toFixed(2)} ft</span>
                  <span>Froude: {channelResult.froude !== null ? channelResult.froude.toFixed(2) : 'n/a'}</span>
                  <span>Regime: {channelResult.flowRegime}</span>
                  <span>Normal depth: {channelResult.normalDepthFt !== null ? `${channelResult.normalDepthFt.toFixed(2)} ft` : 'n/a'}</span>
                  <span>Critical depth: {channelResult.criticalDepthFt !== null ? `${channelResult.criticalDepthFt.toFixed(2)} ft` : 'n/a'}</span>
                </div>
              </div>
            )}
          </div>
        </details>

        <p className="text-[10px] leading-relaxed text-gray-500">
          Experimental screening tools. NOAA Atlas 14 rainfall, Rational Method hydrology, level-pool
          routing, and Manning capacity do not replace a full unsteady model or a licensed engineer&apos;s
          review. Verify against the governing jurisdiction.
        </p>
      </div>
    </div>
  );
};

export default StormwaterPanel;
