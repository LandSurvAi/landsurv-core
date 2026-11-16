import { lazy, Suspense, useMemo, useState } from 'react';
import { Compass, Layers, Map as MapIcon, Ruler } from 'lucide-react';
import type { LinearUnit } from '../../utils/linearUnits';
import type {
  BoundaryFile,
  CanvasHatch,
  CanvasTextAnnotation,
  Centerline,
  ContourGeneration,
  ContourLabel,
  RasterUnderlay,
  Settings,
  SurveyLine,
  SurveyPoint,
  TinSurface,
} from '../../types';
import type { RawObservation, RawSurvey } from '../../services/rawReplay/types';
import type { Basemap3DType, Scene3DTool } from './useRawReplayController';

const RawReplayScene = lazy(() => import('./RawReplayScene'));

interface Project3DViewProps {
  points: SurveyPoint[];
  lines: SurveyLine[];
  tinSurfaces: TinSurface[];
  contourGenerations?: ContourGeneration[];
  contourLabels?: ContourLabel[];
  centerlines?: Centerline[];
  boundaryFiles?: BoundaryFile[];
  hatches?: CanvasHatch[];
  rasterUnderlays?: RasterUnderlay[];
  textAnnotations?: CanvasTextAnnotation[];
  settings?: Settings;
  linearUnit: LinearUnit;
  onRequestProjection?: () => void;
  onAddPoint?: (point: SurveyPoint) => void;
  onAddLine?: (line: SurveyLine) => void;
  nextAvailablePointNumber?: number;
  onClose: () => void;
}

const unitToRaw = (unit: LinearUnit): RawSurvey['job']['units'] => (
  unit === 'meter' || unit === 'centimeter' || unit === 'millimeter' || unit === 'kilometer'
    ? 'meter'
    : unit === 'usSurveyFoot'
      ? 'us-survey-feet'
      : 'international-feet'
);

export default function Project3DView({
  points,
  lines,
  tinSurfaces,
  contourGenerations = [],
  contourLabels = [],
  centerlines = [],
  boundaryFiles = [],
  hatches = [],
  rasterUnderlays = [],
  textAnnotations = [],
  settings,
  linearUnit,
  onRequestProjection,
  onAddPoint,
  onAddLine,
  nextAvailablePointNumber = 1000,
  onClose,
}: Project3DViewProps) {
  const [showProjectLines, setShowProjectLines] = useState(true);
  const [showContours, setShowContours] = useState(true);
  const [showTin, setShowTin] = useState(true);
  const [showTinWireframe, setShowTinWireframe] = useState(false);
  const [showPoints, setShowPoints] = useState(true);
  const [showBasemap, setShowBasemap] = useState(() => Boolean(settings?.googleMaps?.enabled));
  const [basemapType, setBasemapType] = useState<Basemap3DType>(
    () => (settings?.googleMaps?.mapType as Basemap3DType | undefined) ?? 'hybrid',
  );
  const [basemapOpacity, setBasemapOpacity] = useState(() => settings?.googleMaps?.opacity ?? 0.85);
  const [verticalExaggeration, setVerticalExaggeration] = useState(1);
  const [active3DTool, setActive3DTool] = useState<Scene3DTool>('select');

  const survey = useMemo<RawSurvey>(() => {
    const visiblePoints = points.filter(point => !point.hidden);
    const observations: RawObservation[] = visiblePoints.map((point, index) => ({
      id: `project-point-${point.pointNumber}-${index}`,
      sequence: index + 1,
      setupId: 'project-view',
      kind: 'unknown',
      pointNumber: point.pointNumber,
      easting: point.easting,
      northing: point.northing,
      elevation: point.elevation,
      description: point.description,
      timeQuality: 'estimated',
      sourceRecordIndex: index,
    }));
    let minE = Number.POSITIVE_INFINITY;
    let maxE = Number.NEGATIVE_INFINITY;
    let minN = Number.POSITIVE_INFINITY;
    let maxN = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    visiblePoints.forEach(point => {
      minE = Math.min(minE, point.easting);
      maxE = Math.max(maxE, point.easting);
      minN = Math.min(minN, point.northing);
      maxN = Math.max(maxN, point.northing);
      if (point.elevation != null && point.elevation > -9000 && Math.abs(point.elevation) > 1e-4) {
        minZ = Math.min(minZ, point.elevation);
        maxZ = Math.max(maxZ, point.elevation);
      }
    });
    const bounds = Number.isFinite(minE) && Number.isFinite(minN)
      ? {
        minE,
        maxE,
        minN,
        maxN,
        minZ: Number.isFinite(minZ) ? minZ : 0,
        maxZ: Number.isFinite(maxZ) ? maxZ : 0,
      }
      : undefined;
    return {
      schemaVersion: 1,
      format: 'generic',
      fileName: 'Project 3D Model',
      fileSize: 0,
      parsedAt: 'project-model-v1',
      job: { units: unitToRaw(linearUnit), azimuthNorth: true },
      setups: [],
      observations,
      stats: {
        shotCount: observations.length,
        uniquePointCount: visiblePoints.length,
        setupCount: 0,
        coordinateCount: observations.length,
        traverseLegCount: 0,
        gnssEpochCount: 0,
        missingElevationCount: observations.filter(observation => observation.elevation == null).length,
        duplicatePointCount: 0,
        zeroLengthShotCount: 0,
        longestShot: 0,
        traverseDistance: 0,
        replayDurationMs: 0,
        qualityScore: 100,
        equipmentKinds: [],
        timeSource: 'none',
      },
      bounds,
      warnings: [],
      skipped: [],
      usable: true,
    };
  }, [points, linearUnit]);

  const buttonClass = (active: boolean) => `rounded border px-2 py-1 text-[10px] font-medium transition ${
    active
      ? 'border-cyan-300/45 bg-cyan-300/12 text-cyan-100'
      : 'border-white/10 bg-slate-900/45 text-slate-400 hover:border-white/20 hover:text-slate-200'
  }`;

  const toolClass = (tool: Scene3DTool) => `flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium transition ${
    active3DTool === tool
      ? 'border-amber-300/55 bg-amber-400/15 text-amber-100'
      : 'border-white/10 bg-slate-900/45 text-slate-400 hover:border-white/20 hover:text-slate-200'
  }`;

  const contourCount = useMemo(
    () => contourGenerations.reduce((sum, g) => sum + (g.visible ? g.isoPaths.length : 0), 0),
    [contourGenerations],
  );

  return (
    <div className="absolute inset-0 z-[60] overflow-hidden bg-[#061019] text-slate-100">
      <div className="pointer-events-none absolute inset-x-3 top-2.5 z-20 flex items-start justify-between gap-2">
        <div className="pointer-events-auto flex max-w-[calc(100%-8rem)] flex-wrap items-center gap-1.5 rounded-lg border border-cyan-300/20 bg-[#07131d]/92 p-1.5 shadow-xl backdrop-blur">
          <span className="flex items-center gap-1 px-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <Layers className="h-3 w-3" />
            3D CAD View
          </span>
          <button type="button" onClick={() => setShowPoints(value => !value)} aria-pressed={showPoints} className={buttonClass(showPoints)}>
            Points
          </button>
          <button type="button" onClick={() => setShowProjectLines(value => !value)} aria-pressed={showProjectLines} className={buttonClass(showProjectLines)}>
            Linework
          </button>
          <button type="button" onClick={() => setShowContours(value => !value)} aria-pressed={showContours} className={buttonClass(showContours)}>
            Contours
          </button>
          <button type="button" onClick={() => setShowTin(value => !value)} aria-pressed={showTin} className={buttonClass(showTin)}>
            TIN
          </button>
          {showTin && (
            <button type="button" onClick={() => setShowTinWireframe(value => !value)} aria-pressed={showTinWireframe} className={buttonClass(showTinWireframe)}>
              Wireframe
            </button>
          )}

          <span className="mx-0.5 h-4 w-px bg-white/10" />

          {/* Background Map Controls */}
          <button
            type="button"
            onClick={() => setShowBasemap(value => !value)}
            aria-pressed={showBasemap}
            className={`flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium transition ${
              showBasemap
                ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-100'
                : 'border-white/10 bg-slate-900/45 text-slate-400 hover:text-slate-200'
            }`}
          >
            <MapIcon className="h-3 w-3" />
            Map
          </button>
          {showBasemap && (
            <>
              <select
                value={basemapType}
                onChange={e => setBasemapType(e.target.value as Basemap3DType)}
                className="rounded border border-white/15 bg-[#091824] px-1.5 py-1 text-[10px] text-slate-200 outline-none"
                aria-label="3D Map Type"
              >
                <option value="naip">NAIP Aerial</option>
                <option value="hybrid">Google Hybrid</option>
                <option value="satellite">Satellite</option>
                <option value="terrain">Terrain</option>
                <option value="roadmap">Roadmap</option>
              </select>
              <input
                type="range"
                min={0.15}
                max={1}
                step={0.05}
                value={basemapOpacity}
                onChange={e => setBasemapOpacity(Number(e.target.value))}
                className="h-1 w-14 cursor-pointer accent-emerald-400"
                title={`Map opacity: ${Math.round(basemapOpacity * 100)}%`}
              />
            </>
          )}

          <span className="mx-0.5 h-4 w-px bg-white/10" />

          {/* Vertical Exaggeration */}
          <label className="flex items-center gap-1 text-[10px] text-slate-400">
            <span>Z-Scale</span>
            <select
              value={verticalExaggeration}
              onChange={e => setVerticalExaggeration(Number(e.target.value))}
              className="rounded border border-white/15 bg-[#091824] px-1 py-0.5 text-[10px] text-cyan-200 outline-none"
            >
              {[0.5, 1, 1.5, 2, 3, 5, 10].map(v => (
                <option key={v} value={v}>{v}×</option>
              ))}
            </select>
          </label>

          <span className="mx-0.5 h-4 w-px bg-white/10" />

          {/* 3D Interactive Tools */}
          <button type="button" onClick={() => setActive3DTool('select')} className={toolClass('select')} title="Click 3D points and geometry to inspect. Right-drag or Ctrl-drag to orbit.">
            Inspect
          </button>
          <button type="button" onClick={() => setActive3DTool('orbit')} className={toolClass('orbit')} title="Left-drag Turntable Orbit. Clicking does not inspect in this mode.">
            <Compass className="h-3 w-3" />
            Orbit
          </button>
          <button type="button" onClick={() => setActive3DTool('measure')} className={toolClass('measure')} title="3D Point-to-Point Inverse & Slope Measure (M)">
            <Ruler className="h-3 w-3" />
            Measure
          </button>
          {onAddPoint && (
            <button type="button" onClick={() => setActive3DTool('point')} className={toolClass('point')} title="Place 3D Survey Point on TIN/Ground">
              + Point
            </button>
          )}
          {onAddLine && (
            <button type="button" onClick={() => setActive3DTool('polyline')} className={toolClass('polyline')} title="Draw 3D Linework across points/surface">
              + 3D Line
            </button>
          )}

          <span className="hidden px-1.5 text-[9px] text-slate-500 lg:inline">
            {survey.observations.length.toLocaleString()} pts · {lines.length.toLocaleString()} lines
            {contourCount > 0 ? ` · ${contourCount.toLocaleString()} contours` : ''}
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="pointer-events-auto shrink-0 rounded-lg border border-cyan-300/35 bg-[#07131d]/92 px-3 py-1.5 text-[10px] font-semibold text-cyan-100 shadow-xl backdrop-blur hover:border-cyan-300/70 hover:bg-[#0a1c2b]"
        >
          ← 2D Plan View
        </button>
      </div>

      <Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-slate-400">Preparing 3D project view…</div>}>
        <RawReplayScene
          survey={survey}
          base={null}
          playhead={Math.max(0, survey.observations.length - 1)}
          equipmentOverride="auto"
          showProjectLines={showProjectLines}
          showSurveyLines={false}
          showTraverse={false}
          showSightRays={false}
          showTower={false}
          showTin={showTin}
          showTinWireframe={showTinWireframe}
          showContours={showContours}
          showEquipment={false}
          showPoints={showPoints}
          showBasemap={showBasemap}
          basemapType={basemapType}
          basemapOpacity={basemapOpacity}
          verticalExaggeration={verticalExaggeration}
          active3DTool={active3DTool}
          onActive3DToolChange={setActive3DTool}
          projectPoints={points}
          projectLines={lines}
          tinSurfaces={tinSurfaces}
          contourGenerations={contourGenerations}
          contourLabels={contourLabels}
          centerlines={centerlines}
          boundaryFiles={boundaryFiles}
          hatches={hatches}
          rasterUnderlays={rasterUnderlays}
          textAnnotations={textAnnotations}
          settings={settings}
          onRequestProjection={onRequestProjection}
          onAddPoint={onAddPoint}
          onAddLine={onAddLine}
          nextAvailablePointNumber={nextAvailablePointNumber}
        />
      </Suspense>
    </div>
  );
}
