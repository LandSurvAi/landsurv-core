import { lazy, Suspense, useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Compass,
  Crosshair,
  Layers,
  Map as MapIcon,
  MousePointer2,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  Ruler,
  SkipBack,
  SkipForward,
  Square,
} from 'lucide-react';
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
import {
  formatClock,
  REPLAY_SPEED_OPTIONS,
  type Basemap3DType,
  type CameraFollowMode,
  type EquipmentScaleMode,
  type RawReplayController,
  type ReplayMotionMode,
  type ReplayTimingMode,
  type Scene3DTool,
} from './useRawReplayController';
import { suspectedHeightIssue } from '../../services/rawReplay/heights';

const RawReplayScene = lazy(() => import('./RawReplayScene'));

interface RawReplayCanvasProps {
  controller: RawReplayController;
  projectPoints: SurveyPoint[];
  projectLines: SurveyLine[];
  tinSurfaces: TinSurface[];
  contourGenerations?: ContourGeneration[];
  contourLabels?: ContourLabel[];
  centerlines?: Centerline[];
  boundaryFiles?: BoundaryFile[];
  hatches?: CanvasHatch[];
  rasterUnderlays?: RasterUnderlay[];
  textAnnotations?: CanvasTextAnnotation[];
  settings?: Settings;
  onRequestProjection?: () => void;
  onAddPoint?: (point: SurveyPoint) => void;
  onAddLine?: (line: SurveyLine) => void;
  nextAvailablePointNumber?: number;
  bottomInset?: number;
}

export default function RawReplayCanvas({
  controller,
  projectPoints,
  projectLines,
  tinSurfaces,
  contourGenerations,
  contourLabels,
  centerlines,
  boundaryFiles,
  hatches,
  rasterUnderlays,
  textAnnotations,
  settings,
  onRequestProjection,
  onAddPoint,
  onAddLine,
  nextAvailablePointNumber,
  bottomInset = 0,
}: RawReplayCanvasProps) {
  const [hudExpanded, setHudExpanded] = useState(true);
  const {
    survey,
    playhead,
    playheadProgress,
    playing,
    loop,
    setLoop,
    speed,
    setSpeed,
    timingMode,
    setTimingMode,
    cameraFollowMode,
    setCameraFollowMode,
    verticalExaggeration,
    setVerticalExaggeration,
    equipmentScaleMode,
    setEquipmentScaleMode,
    motionMode,
    setMotionMode,
    pointLabelMode,
    traceColorMode,
    sightRayMode,
    active3DTool,
    setActive3DTool,
    togglePlay,
    stop,
    seek,
    stepBack,
    stepForward,
    prevSetup,
    nextSetup,
    equipmentOverride,
    showProjectLines,
    setShowProjectLines,
    showSurveyLines,
    setShowSurveyLines,
    showTraverse,
    setShowTraverse,
    showSightRays,
    setShowSightRays,
    showTower,
    setShowTower,
    showGrid,
    setShowGrid,
    gridSpacing,
    gridOpacity,
    showTin,
    setShowTin,
    showTinWireframe,
    setShowTinWireframe,
    showContours,
    setShowContours,
    showBasemap,
    setShowBasemap,
    basemapType,
    setBasemapType,
    basemapOpacity,
    setBasemapOpacity,
    scrubberMarkers,
    heightChanges,
    liveHeightChanges,
    observations,
    lastIndex,
    current,
    currentSetup,
    base,
    progressPercent,
    focusShotSignal,
    requestFocusCurrentShot,
  } = controller;

  // Keyboard playback shortcuts when canvas is active
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      if (event.key === ' ' && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        togglePlay();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        if (event.shiftKey) nextSetup();
        else stepForward();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (event.shiftKey) prevSetup();
        else stepBack();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePlay, stepForward, stepBack, nextSetup, prevSetup]);

  if (!survey) return null;

  const unitLabel = survey.job.units === 'meter' ? 'm' : 'ft';
  const currentRodHeight = current?.rodHeight ?? currentSetup?.rodHeight ?? null;
  const currentInstrumentHeight = currentSetup?.instrumentHeight ?? null;
  const rodHeightIssue = currentRodHeight != null
    ? suspectedHeightIssue(currentRodHeight, survey.job.units, 'rod')
    : undefined;
  const instrumentHeightIssue = currentInstrumentHeight != null
    ? suspectedHeightIssue(currentInstrumentHeight, survey.job.units, 'instrument')
    : undefined;

  const chipClass = (active: boolean) => `flex min-w-0 items-center justify-between gap-1.5 rounded-md border px-1.5 py-1.5 text-left text-[9px] font-medium transition ${
    active
      ? 'border-cyan-300/30 bg-cyan-300/[0.07] text-cyan-100'
      : 'border-white/[0.07] bg-white/[0.02] text-slate-500 hover:border-white/[0.14] hover:text-slate-300'
  }`;

  const toolClass = (tool: Scene3DTool) => `flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[10px] font-medium transition ${
    active3DTool === tool
      ? 'bg-cyan-300/[0.08] text-cyan-100 shadow-[inset_2px_0_0_rgba(34,211,238,0.8)]'
      : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
  }`;

  const layerDotClass = (active: boolean) => `h-1.5 w-1.5 shrink-0 rounded-full ${
    active ? 'bg-cyan-300 shadow-[0_0_5px_rgba(34,211,238,0.55)]' : 'bg-slate-700'
  }`;

  const railSectionClass = 'mb-1.5 px-0.5 text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-500';

  return (
    <div
      className="absolute inset-0 z-[60] flex flex-col overflow-hidden bg-[#061019]"
      style={{ bottom: bottomInset }}
    >
      <div className="relative min-h-0 flex-1">
        {/* Left 3D Layer, Basemap & Tool Rail */}
        <div className="pointer-events-none absolute bottom-3 left-3 top-3 z-20 flex w-52">
          <div className="pointer-events-auto flex max-h-full w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-[#071018]/95 shadow-[0_18px_50px_-18px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md">
            <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-md border border-cyan-300/20 bg-cyan-300/[0.07] text-cyan-300">
                <Layers className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200/80">3D Layers</p>
                <p className="text-[8px] uppercase tracking-[0.14em] text-slate-500">Scene controls</p>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2.5">
              <section>
                <h3 className={railSectionClass}>Scene layers</h3>
                <div className="grid grid-cols-2 gap-1">
                  <button type="button" onClick={() => setShowSurveyLines(!showSurveyLines)} aria-pressed={showSurveyLines} className={chipClass(showSurveyLines)}>
                    <span className="truncate">Trace</span>
                    <span className={layerDotClass(showSurveyLines)} />
                  </button>
                  <button type="button" onClick={() => setShowProjectLines(!showProjectLines)} aria-pressed={showProjectLines} className={chipClass(showProjectLines)}>
                    <span className="truncate">Linework</span>
                    <span className={layerDotClass(showProjectLines)} />
                  </button>
                  <button type="button" onClick={() => setShowContours(!showContours)} aria-pressed={showContours} className={chipClass(showContours)}>
                    <span className="truncate">Contours</span>
                    <span className={layerDotClass(showContours)} />
                  </button>
                  <button type="button" onClick={() => setShowTin(!showTin)} aria-pressed={showTin} className={chipClass(showTin)}>
                    <span className="truncate">TIN</span>
                    <span className={layerDotClass(showTin)} />
                  </button>
                  {showTin && (
                    <button type="button" onClick={() => setShowTinWireframe(!showTinWireframe)} aria-pressed={showTinWireframe} className={chipClass(showTinWireframe)} title="Overlay TIN triangulation wireframe">
                      <span className="truncate">Wireframe</span>
                      <span className={layerDotClass(showTinWireframe)} />
                    </button>
                  )}
                  <button type="button" onClick={() => setShowSightRays(!showSightRays)} aria-pressed={showSightRays} className={chipClass(showSightRays)}>
                    <span className="truncate">Rays</span>
                    <span className={layerDotClass(showSightRays)} />
                  </button>
                  <button type="button" onClick={() => setShowTraverse(!showTraverse)} aria-pressed={showTraverse} className={chipClass(showTraverse)}>
                    <span className="truncate">Traverse</span>
                    <span className={layerDotClass(showTraverse)} />
                  </button>
                  <button type="button" onClick={() => setShowTower(!showTower)} aria-pressed={showTower} className={chipClass(showTower)}>
                    <span className="truncate">Tower</span>
                    <span className={layerDotClass(showTower)} />
                  </button>
                  <button type="button" onClick={() => setShowGrid(!showGrid)} aria-pressed={showGrid} title="Toggle CAD grid" className={chipClass(showGrid)}>
                    <span className="truncate">Grid</span>
                    <span className={layerDotClass(showGrid)} />
                  </button>
                </div>
              </section>

              <section className="border-t border-white/[0.06] pt-2.5">
                <h3 className={railSectionClass}>Map & terrain</h3>
                <button
                  type="button"
                  onClick={() => setShowBasemap(!showBasemap)}
                  aria-pressed={showBasemap}
                  className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-[10px] font-medium transition ${
                    showBasemap
                      ? 'border-emerald-300/30 bg-emerald-300/[0.07] text-emerald-100'
                      : 'border-white/[0.07] bg-white/[0.02] text-slate-500 hover:border-white/[0.14] hover:text-slate-300'
                  }`}
                  title="Toggle 3D Background Map & TIN Surface Draping"
                >
                  <MapIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 text-left">Background map</span>
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    showBasemap ? 'bg-emerald-300 shadow-[0_0_5px_rgba(110,231,183,0.55)]' : 'bg-slate-700'
                  }`} />
                </button>
                {showBasemap && (
                  <div className="mt-1.5 space-y-2 rounded-md border border-white/[0.06] bg-black/15 p-2">
                    <label className="block text-[9px] text-slate-500">
                      <span className="mb-1 block">Source</span>
                      <select
                        value={basemapType}
                        onChange={e => setBasemapType(e.target.value as Basemap3DType)}
                        className="w-full rounded-md border border-white/10 bg-[#050a10] px-2 py-1 text-[10px] text-slate-200 outline-none focus:border-cyan-300/30"
                        aria-label="3D Map Type"
                      >
                        <option value="naip">NAIP Aerial</option>
                        <option value="hybrid">Google Hybrid</option>
                        <option value="satellite">Satellite</option>
                        <option value="terrain">Terrain</option>
                        <option value="roadmap">Roadmap</option>
                      </select>
                    </label>
                    <label className="block text-[9px] text-slate-500">
                      <span className="flex items-center justify-between">
                        <span>Opacity</span>
                        <span className="font-mono text-slate-300">{Math.round(basemapOpacity * 100)}%</span>
                      </span>
                      <input
                        type="range"
                        min={0.15}
                        max={1}
                        step={0.05}
                        value={basemapOpacity}
                        onChange={e => setBasemapOpacity(Number(e.target.value))}
                        className="mt-1 h-1 w-full cursor-pointer accent-emerald-400"
                        title={`Map opacity: ${Math.round(basemapOpacity * 100)}%`}
                      />
                    </label>
                  </div>
                )}
              </section>

              <section className="border-t border-white/[0.06] pt-2.5">
                <h3 className={railSectionClass}>View</h3>
                <div className="flex items-center justify-between gap-2 rounded-md border border-white/[0.07] bg-white/[0.02] px-2 py-1.5">
                  <span className="text-[10px] text-slate-400">Z-Scale</span>
                  <select
                    value={verticalExaggeration}
                    onChange={e => setVerticalExaggeration(Number(e.target.value))}
                    className="rounded border border-white/10 bg-[#050a10] px-1.5 py-0.5 text-[10px] text-cyan-200 outline-none focus:border-cyan-300/30"
                  >
                    {[0.5, 1, 1.5, 2, 3, 5, 10].map(v => (
                      <option key={v} value={v}>{v}×</option>
                    ))}
                  </select>
                </div>
              </section>

              <section className="border-t border-white/[0.06] pt-2.5">
                <h3 className={railSectionClass}>Tools</h3>
                <div className="space-y-0.5">
                  <button type="button" onClick={() => setActive3DTool('select')} aria-pressed={active3DTool === 'select'} className={toolClass('select')} title="Click 3D points and geometry to inspect. Right-drag or Ctrl-drag to orbit.">
                    <MousePointer2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1 text-left">Inspect</span>
                  </button>
                  <button type="button" onClick={() => setActive3DTool('orbit')} aria-pressed={active3DTool === 'orbit'} className={toolClass('orbit')} title="Left-drag Turntable Orbit. Clicking does not inspect in this mode.">
                    <Compass className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1 text-left">Orbit</span>
                  </button>
                  <button type="button" onClick={() => setActive3DTool('measure')} aria-pressed={active3DTool === 'measure'} className={toolClass('measure')} title="3D Point-to-Point Inverse & Slope Measure (M)">
                    <Ruler className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1 text-left">Measure</span>
                  </button>
                  {onAddPoint && (
                    <button type="button" onClick={() => setActive3DTool('point')} aria-pressed={active3DTool === 'point'} className={toolClass('point')} title="Place 3D Survey Point on TIN/Ground">
                      <Plus className="h-3.5 w-3.5 shrink-0" />
                      <span className="flex-1 text-left">Point</span>
                    </button>
                  )}
                  {onAddLine && (
                    <button type="button" onClick={() => setActive3DTool('polyline')} aria-pressed={active3DTool === 'polyline'} className={toolClass('polyline')} title="Draw 3D Linework across points/surface">
                      <Pencil className="h-3.5 w-3.5 shrink-0" />
                      <span className="flex-1 text-left">3D Line</span>
                    </button>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>

        <Suspense
          fallback={(
            <div className="flex h-full items-center justify-center text-xs text-slate-400">
              <span className="mr-3 h-4 w-4 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
              Preparing 3D field replay…
            </div>
          )}
        >
          <RawReplayScene
            survey={survey}
            base={base}
            playhead={playhead}
            playheadProgress={playheadProgress}
            equipmentOverride={equipmentOverride}
            showProjectLines={showProjectLines}
            showSurveyLines={showSurveyLines}
            showTraverse={showTraverse}
            showSightRays={showSightRays}
            showTower={showTower}
            showGrid={showGrid}
            gridSpacing={gridSpacing}
            gridOpacity={gridOpacity}
            showTin={showTin}
            showTinWireframe={showTinWireframe}
            showContours={showContours}
            showBasemap={showBasemap}
            basemapType={basemapType}
            basemapOpacity={basemapOpacity}
            verticalExaggeration={verticalExaggeration}
            equipmentScaleMode={equipmentScaleMode}
            motionMode={motionMode}
            pointLabelMode={pointLabelMode}
            traceColorMode={traceColorMode}
            styleSettings={controller.styleSettings}
            sightRayMode={sightRayMode}
            cameraFollowMode={cameraFollowMode}
            active3DTool={active3DTool}
            onActive3DToolChange={setActive3DTool}
            focusShotSignal={focusShotSignal}
            projectPoints={projectPoints}
            projectLines={projectLines}
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
            leftRail
          />
        </Suspense>
      </div>

      {/* Bottom Cinematic CAD Transport Dock */}
      <div className="shrink-0 border-t border-cyan-400/20 bg-[#07131d]/95 px-3 py-2 text-slate-200 shadow-2xl backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          {/* Transport Buttons */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={stop}
              title="Stop and rewind to shot 1"
              className="flex h-7 w-7 items-center justify-center rounded border border-white/10 bg-white/[0.04] text-slate-300 hover:border-cyan-300/40 hover:text-cyan-100"
            >
              <Square className="h-3 w-3 fill-current" />
            </button>
            <button
              type="button"
              onClick={prevSetup}
              title="Previous instrument setup (Shift + ←)"
              className="flex h-7 w-7 items-center justify-center rounded border border-white/10 bg-white/[0.04] text-slate-300 hover:border-cyan-300/40 hover:text-cyan-100"
            >
              <SkipBack className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={stepBack}
              title="Previous observation (←)"
              className="flex h-7 w-7 items-center justify-center rounded border border-white/10 bg-white/[0.04] text-slate-300 hover:border-cyan-300/40 hover:text-cyan-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              title={playing ? 'Pause replay (Space)' : 'Play replay (Space)'}
              className="mx-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-cyan-400 text-slate-950 shadow-[0_0_16px_rgba(34,211,238,0.3)] transition hover:bg-cyan-300"
            >
              {playing ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />}
            </button>
            <button
              type="button"
              onClick={stepForward}
              title="Next observation (→)"
              className="flex h-7 w-7 items-center justify-center rounded border border-white/10 bg-white/[0.04] text-slate-300 hover:border-cyan-300/40 hover:text-cyan-100"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={nextSetup}
              title="Next instrument setup (Shift + →)"
              className="flex h-7 w-7 items-center justify-center rounded border border-white/10 bg-white/[0.04] text-slate-300 hover:border-cyan-300/40 hover:text-cyan-100"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setLoop(!loop)}
              title="Loop playback"
              className={`flex h-7 w-7 items-center justify-center rounded border transition ${
                loop
                  ? 'border-cyan-300/50 bg-cyan-400/15 text-cyan-200'
                  : 'border-white/10 bg-white/[0.04] text-slate-400 hover:text-slate-200'
              }`}
            >
              <Repeat className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={requestFocusCurrentShot}
              title="Center 3D camera on active survey pole"
              className="flex h-7 items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-2 text-[10px] text-slate-300 hover:border-cyan-300/40 hover:text-cyan-100"
            >
              <Crosshair className="h-3 w-3 text-cyan-300" />
              <span className="hidden sm:inline">Focus</span>
            </button>
          </div>

          {/* Multi-Track Scrubber with Setup / Traverse / QA Tick Markers */}
          <div className="relative min-w-[180px] flex-1 px-2">
            <div className="relative flex h-7 items-center">
              <div className="pointer-events-none absolute inset-x-0 h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-cyan-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              {scrubberMarkers.slice(0, 120).map((m, idx) => (
                m.kind === 'reflectorless' ? (
                  <button
                    key={`${m.kind}-${m.index}-${idx}`}
                    type="button"
                    onClick={() => seek(m.index)}
                    title={m.label}
                    aria-label={m.label}
                    style={{ left: `${m.percent}%` }}
                    className="absolute top-0 z-20 -translate-x-1/2 rounded-sm border border-red-400/60 bg-red-500/20 px-0.5 text-[8px] font-bold leading-none text-red-300 drop-shadow-[0_0_4px_rgba(248,113,113,0.8)] transition hover:scale-110"
                  >
                    R
                  </button>
                ) : m.kind === 'rod-height' || m.kind === 'instrument-height' ? (
                  <button
                    key={`${m.kind}-${m.index}-${idx}`}
                    type="button"
                    onClick={() => seek(m.index)}
                    title={m.label}
                    aria-label={m.label}
                    style={{ left: `${m.percent}%` }}
                    className={`absolute top-0 z-20 -translate-x-1/2 text-[9px] leading-none transition hover:scale-125 ${
                      m.kind === 'rod-height'
                        ? 'text-emerald-300 drop-shadow-[0_0_4px_rgba(52,211,153,0.65)] hover:text-emerald-200'
                        : 'text-cyan-300 drop-shadow-[0_0_4px_rgba(34,211,238,0.65)] hover:text-cyan-200'
                    }`}
                  >
                    ▲
                  </button>
                ) : (
                  <button
                    key={`${m.kind}-${m.index}-${idx}`}
                    type="button"
                    onClick={() => seek(m.index)}
                    title={m.label}
                    style={{ left: `${m.percent}%` }}
                    className={`absolute top-1.5 h-4 w-1 -translate-x-1/2 rounded-full transition hover:scale-y-125 ${
                      m.kind === 'setup'
                        ? 'bg-amber-400/90'
                        : m.kind === 'traverse'
                          ? 'bg-pink-400/85'
                          : 'bg-rose-400/85'
                    }`}
                  />
                )
              ))}
              <input
                type="range"
                min={0}
                max={lastIndex}
                value={Math.min(playhead, lastIndex)}
                onChange={event => seek(Number(event.target.value))}
                className="relative z-10 h-1.5 w-full cursor-pointer appearance-none bg-transparent accent-cyan-300"
                aria-label="Replay observation scrubber"
              />
            </div>
          </div>

          {/* Playback Settings Strip */}
          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            <select
              value={speed}
              onChange={e => setSpeed(Number(e.target.value))}
              className="rounded border border-white/15 bg-[#091824] px-1.5 py-1 font-mono text-[10px] text-cyan-200 outline-none"
              title="Playback speed"
            >
              {REPLAY_SPEED_OPTIONS.map(s => (
                <option key={s} value={s}>{s}×</option>
              ))}
            </select>

            <select
              value={timingMode}
              onChange={e => setTimingMode(e.target.value as ReplayTimingMode)}
              className="hidden rounded border border-white/15 bg-[#091824] px-1.5 py-1 text-[10px] text-slate-300 outline-none md:block"
              title="Clock timing mode"
            >
              <option value="steady">Steady Cadence</option>
              <option value="field-clock">Field Clock</option>
              <option value="pause-on-setup">Pause on Setup</option>
            </select>

            <select
              value={cameraFollowMode}
              onChange={e => setCameraFollowMode(e.target.value as CameraFollowMode)}
              className="rounded border border-white/15 bg-[#091824] px-1.5 py-1 text-[10px] text-slate-300 outline-none"
              title="3D Camera Follow Mode"
            >
              <option value="free">Cam: Free CAD</option>
              <option value="follow-shot">Cam: Follow Pole</option>
              <option value="instrument-pov">Cam: Instrument POV</option>
            </select>

            <select
              value={equipmentScaleMode}
              onChange={e => setEquipmentScaleMode(e.target.value as EquipmentScaleMode)}
              className="hidden rounded border border-white/15 bg-[#091824] px-1.5 py-1 text-[10px] text-slate-300 outline-none lg:block"
              title="3D Equipment Visual Scale"
            >
              <option value="auto">Rig: Auto Scale</option>
              <option value="true">Rig: True 1:1</option>
              <option value="2x">Rig: 2× Scale</option>
              <option value="4x">Rig: 4× Scale</option>
            </select>

            <select
              value={motionMode}
              onChange={e => setMotionMode(e.target.value as ReplayMotionMode)}
              className="hidden rounded border border-white/15 bg-[#091824] px-1.5 py-1 text-[10px] text-slate-300 outline-none xl:block"
              title="Pole transition motion"
            >
              <option value="glide">Glide</option>
              <option value="step">Step</option>
            </select>

            <button
              type="button"
              onClick={() => setHudExpanded(v => !v)}
              className="rounded border border-white/10 px-1.5 py-1 text-[9px] text-slate-400 hover:text-slate-200"
              title="Toggle telemetry readout"
            >
              {hudExpanded ? '▾' : '▴'}
            </button>
          </div>
        </div>

        {/* Live Telemetry Readout Strip */}
        {hudExpanded && current && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/[0.07] pt-1.5 font-mono text-[10px] text-slate-400">
            <span className="font-semibold text-cyan-200">
              Shot {Math.min(playhead, lastIndex) + 1}/{observations.length}
            </span>
            <span className="text-slate-200">
              {current.pointNumber ? `PN ${current.pointNumber}` : `#${current.sequence}`}
              {current.description ? <span className="font-sans text-slate-400"> · {current.description}</span> : null}
            </span>
            <span className="text-amber-200/90">
              {currentSetup
                ? `Setup ${currentSetup.sequence + 1} (${currentSetup.equipment.replace('-', ' ')}${currentSetup.occupyPoint ? ` @ ${currentSetup.occupyPoint}` : ''})`
                : 'Unassigned setup'}
            </span>
            {current.northing != null && current.easting != null && (
              <span>
                N {current.northing.toFixed(2)} · E {current.easting.toFixed(2)}
                {current.elevation != null ? ` · EL ${current.elevation.toFixed(2)}` : ' · EL —'}
              </span>
            )}
            {current.horizontalDistance != null && (
              <span className="hidden text-cyan-300/80 lg:inline">
                HD {current.horizontalDistance.toFixed(2)}
                {current.azimuthDeg != null ? ` · AZ ${current.azimuthDeg.toFixed(1)}°` : ''}
              </span>
            )}
            {current.gnss && (
              <span className={`rounded px-1.5 py-px text-[9px] uppercase ${
                current.gnss.quality === 'fixed'
                  ? 'bg-emerald-400/15 text-emerald-300'
                  : 'bg-amber-400/15 text-amber-300'
              }`}>
                GNSS {current.gnss.quality ?? 'RTK'}{current.gnss.satellites != null ? ` · ${current.gnss.satellites} SV` : ''}
              </span>
            )}
            <span className="ml-auto text-slate-300">
              Clock {formatClock(current.fieldTimeMs)}
            </span>
          </div>
        )}

        {(rodHeightIssue || instrumentHeightIssue) && (
          <div className="mt-1.5 flex items-start gap-1.5 rounded border border-amber-300/20 bg-amber-400/[0.05] px-2 py-1 text-[9px] leading-4 text-slate-300">
            <span className="shrink-0 font-semibold uppercase tracking-[0.14em] text-amber-300">Height check</span>
            <span>{[rodHeightIssue, instrumentHeightIssue].filter(Boolean).join(' ')}</span>
          </div>
        )}

        {/* Live Rod & Instrument Height Ledger */}
        {heightChanges.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-emerald-300/15 pt-1.5">
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-300/90">
              <span className="leading-none">▲</span>
              Height changes
              <span className="rounded border border-emerald-300/25 bg-emerald-300/[0.08] px-1 py-px font-mono text-[8px] tracking-normal text-emerald-200/90">
                {liveHeightChanges.length}/{heightChanges.length} reached
              </span>
              <span className="font-mono text-[9px] font-normal normal-case tracking-normal text-slate-400">
                <span className={rodHeightIssue ? 'text-amber-300' : undefined} title={rodHeightIssue ?? undefined}>
                  HR {currentRodHeight != null ? `${currentRodHeight.toFixed(2)} ${unitLabel}` : '—'}
                  {rodHeightIssue ? ' ⚠' : ''}
                </span>
                <span className="mx-1 text-slate-600">·</span>
                <span className={instrumentHeightIssue ? 'text-amber-300' : undefined} title={instrumentHeightIssue ?? undefined}>
                  HI {currentInstrumentHeight != null ? `${currentInstrumentHeight.toFixed(2)} ${unitLabel}` : '—'}
                  {instrumentHeightIssue ? ' ⚠' : ''}
                </span>
              </span>
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-0.5">
              {heightChanges.map(change => {
                const reached = change.index <= playhead;
                return (
                  <button
                    key={`height-change-${change.kind}-${change.index}`}
                    type="button"
                    onClick={() => seek(change.index)}
                    title={`${change.label}${change.fieldTimeMs != null ? ` · ${formatClock(change.fieldTimeMs)}` : ''}`}
                    className={`flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] transition ${
                      reached
                        ? 'border-emerald-300/35 bg-emerald-300/[0.08] text-emerald-100'
                        : 'border-white/10 bg-white/[0.02] text-slate-500 hover:border-emerald-300/25 hover:text-slate-300'
                    }`}
                  >
                    <span className={`rounded px-1 text-[7px] font-bold uppercase ${
                      change.kind === 'rod'
                        ? reached ? 'bg-emerald-400/20 text-emerald-300' : 'bg-white/[0.06] text-slate-500'
                        : reached ? 'bg-cyan-400/20 text-cyan-300' : 'bg-white/[0.06] text-slate-500'
                    }`}>
                      {change.kind === 'rod' ? 'HR' : 'HI'}
                    </span>
                    <span>{change.fromHeight.toFixed(2)} → {change.toHeight.toFixed(2)} {unitLabel}</span>
                    <span className={reached ? 'text-emerald-200/60' : 'text-slate-600'}>· Shot {change.sequence}</span>
                    {change.pointNumber && <span className="text-slate-500">PN {change.pointNumber}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
