import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { parseRawSurvey } from '../../services/rawReplay/parser';
import { buildRawSummary, buildRawSummaryAt } from '../../services/rawReplay/summary';
import { resolveBase } from '../../services/rawReplay/baseStations';
import type { EquipmentKind, RawImportOptions, RawObservation, RawSetup, RawSurvey } from '../../services/rawReplay/types';

export type EquipmentOverride = 'auto' | 'total-station' | 'gnss-rover';
export type ReplayTimingMode = 'steady' | 'field-clock' | 'pause-on-setup';
export type CameraFollowMode = 'free' | 'follow-shot' | 'instrument-pov';
export type EquipmentScaleMode = 'auto' | 'true' | '2x' | '4x' | '8x' | '12x';
export type ReplayMotionMode = 'glide' | 'step';
export type PointLabelMode = 'active' | 'recent' | 'all-past' | 'off';
export type TraceColorMode = 'equipment' | 'setup' | 'elevation' | 'custom';
export type SimulationLineType = 'solid' | 'dashed' | 'dotted' | 'dash-dot';
export type ShotMarkerShape = 'x' | 'plus' | 'dot' | 'square' | 'diamond';
export const RAW_REPLAY_LINE_TYPES: SimulationLineType[] = ['solid', 'dashed', 'dotted', 'dash-dot'];
export const RAW_REPLAY_MARKER_SHAPES: ShotMarkerShape[] = ['x', 'plus', 'dot', 'square', 'diamond'];

/** Per-equipment trace appearance used when trace color mode is `equipment`. */
export interface RawReplayTraceEquipmentStyle {
  color: string;
  lineType: SimulationLineType;
  lineWeight: number;
}

export const RAW_REPLAY_EQUIPMENT_KINDS: EquipmentKind[] = [
  'total-station',
  'gnss-rover',
  'gnss-base',
  'level',
  'unknown',
];

/** Distinct defaults keep each instrument legible before the user edits it. */
export const DEFAULT_TRACE_EQUIPMENT_STYLES: Record<EquipmentKind, RawReplayTraceEquipmentStyle> = {
  'total-station': { color: '#22d3ee', lineType: 'solid', lineWeight: 1 },
  'gnss-rover': { color: '#a3e635', lineType: 'solid', lineWeight: 1 },
  'gnss-base': { color: '#c084fc', lineType: 'solid', lineWeight: 1 },
  level: { color: '#fbbf24', lineType: 'solid', lineWeight: 1 },
  unknown: { color: '#38bdf8', lineType: 'solid', lineWeight: 1 },
};

export const equipmentKindLabel = (equipment: EquipmentKind): string => {
  switch (equipment) {
    case 'total-station':
      return 'Total station';
    case 'gnss-rover':
      return 'GNSS rover';
    case 'gnss-base':
      return 'GNSS base';
    case 'level':
      return 'Digital level';
    default:
      return 'Unclassified instrument';
  }
};

export const traceEquipmentStyleFor = (
  styles: Partial<Record<EquipmentKind, RawReplayTraceEquipmentStyle>> | undefined,
  equipment: EquipmentKind,
): RawReplayTraceEquipmentStyle => ({
  ...DEFAULT_TRACE_EQUIPMENT_STYLES[equipment],
  ...styles?.[equipment],
});

export type SightRayMode = 'live' | 'off';
export type Basemap3DType = 'naip' | 'satellite' | 'hybrid' | 'roadmap' | 'terrain';
export type Scene3DTool = 'select' | 'orbit' | 'pan' | 'measure' | 'point' | 'polyline';

/**
 * Agent-scoped visual style for the Raw Replay scene. This is a simulation
 * render kit only: it is stored under its own key and never merged into the
 * project's point styles, line styles, or drawing settings.
 */
export interface RawReplayStyleSettings {
  /** Multiplier applied to recorded-shot marker size. */
  pointSize: number;
  /** Additive glow strength for point markers (0..1). */
  pointGlow: number;
  /** Marker tint. */
  pointColor: string;
  /** Simulation glyph shape for recorded shots. */
  pointShape: ShotMarkerShape;
  /** Glyph bar thickness multiplier for recorded shots. */
  pointLineWeight: number;
  /** Seconds a past-shot marker remains visible; 0 keeps all past markers. */
  pointTtl: number;
  /** Draw markers for shots ahead of the playhead. */
  showFuturePoints: boolean;

  /** Opacity of the live survey trace (0..1). */
  traceGlow: number;
  /** Number of recent shots retained in the live survey trace. */
  traceTail: number;
  /** Custom trace color used when traceColorMode is custom. */
  traceColor: string;
  /** Simulation line pattern for the live survey trace. */
  traceLineType: SimulationLineType;
  /** Screen-space line weight for the live survey trace. */
  traceLineWeight: number;
  /** Seconds a trace segment remains visible after its shot; 0 keeps the tail. */
  traceTtl: number;
  /** Per-equipment color and line style used by trace color mode `equipment`. */
  traceEquipmentStyles: Partial<Record<EquipmentKind, RawReplayTraceEquipmentStyle>>;

  /** Sight-ray beam color. */
  rayColor: string;
  /** Simulation line pattern for sight rays and the live RTK link. */
  rayLineType: SimulationLineType;
  /** Screen-space line weight for sight rays. */
  rayLineWeight: number;
  /** Seconds the live sight-ray beam remains visible after a shot. */
  rayTtl: number;

  /** Traverse path color. */
  traverseColor: string;
  /** Opacity of the traverse glow tubes (0..1). */
  traverseGlow: number;
  /** Simulation line pattern for the traverse path. */
  traverseLineType: SimulationLineType;
  /** Screen-space line weight for the traverse path. */
  traverseLineWeight: number;
  /** Seconds the traverse remains visible after the last shot; 0 persists. */
  traverseTtl: number;

  /** Source line colors or one simulation color. */
  projectColorMode: 'source' | 'custom';
  /** Simulation color used when projectColorMode is custom. */
  projectColor: string;
  /** Simulation line pattern for project linework. */
  projectLineType: SimulationLineType;
  /** Screen-space line weight for project linework. */
  projectLineWeight: number;
  /** Opacity of project linework in the simulation (0..1). */
  projectOpacity: number;
  /** Seconds project linework remains visible after the last shot; 0 persists. */
  projectTtl: number;

  /** Minor contour color and linework style. */
  contourMinorColor: string;
  /** Major contour color and linework style. */
  contourMajorColor: string;
  /** Simulation line pattern for contours. */
  contourLineType: SimulationLineType;
  /** Screen-space line weight for contours. */
  contourLineWeight: number;
  /** Opacity of contour linework (0..1). */
  contourOpacity: number;
  /** Seconds contours remain visible after the last shot; 0 persists. */
  contourTtl: number;

  /** CAD grid color. */
  gridColor: string;
  /** Simulation line pattern for the CAD grid. */
  gridLineType: SimulationLineType;
  /** Screen-space line weight for the CAD grid. */
  gridLineWeight: number;
  /** Seconds the CAD grid remains visible after the last shot; 0 persists. */
  gridTtl: number;

  /** Text color for projected simulation callouts. */
  labelColor: string;
  /** Scale multiplier for projected simulation callouts. */
  labelScale: number;
  /** Seconds callouts remain visible after the last shot; 0 persists. */
  labelTtl: number;

  /** Sky clock source: the recorded field time or a forced local time. */
  skyTimeMode: 'recorded' | 'fixed';
  /** Local HH:MM clock used when skyTimeMode is fixed. */
  skyTime: string;
}

export const RAW_REPLAY_STYLE_STORAGE_KEY = 'landsurv.rawReplay.style.v1';

export const DEFAULT_RAW_REPLAY_STYLE: RawReplayStyleSettings = {
  pointSize: 1,
  pointGlow: 0.9,
  pointColor: '#ffffff',
  pointShape: 'x',
  pointLineWeight: 1,
  pointTtl: 0,
  showFuturePoints: true,
  traceGlow: 0.72,
  traceTail: 120,
  traceColor: '#22d3ee',
  traceLineType: 'solid',
  traceLineWeight: 1,
  traceTtl: 0,
  traceEquipmentStyles: {},
  rayColor: '#38bdf8',
  rayLineType: 'solid',
  rayLineWeight: 1,
  rayTtl: 1.2,
  traverseColor: '#7dd3fc',
  traverseGlow: 0.8,
  traverseLineType: 'solid',
  traverseLineWeight: 1,
  traverseTtl: 0,
  projectColorMode: 'source',
  projectColor: '#22d3ee',
  projectLineType: 'solid',
  projectLineWeight: 1,
  projectOpacity: 0.95,
  projectTtl: 0,
  contourMinorColor: '#38bdf8',
  contourMajorColor: '#fbbf24',
  contourLineType: 'solid',
  contourLineWeight: 1,
  contourOpacity: 0.9,
  contourTtl: 0,
  gridColor: '#38bdf8',
  gridLineType: 'solid',
  gridLineWeight: 1,
  gridTtl: 0,
  labelColor: '#ecfeff',
  labelScale: 1,
  labelTtl: 0,
  skyTimeMode: 'recorded',
  skyTime: '12:00',
};

export interface SetupPlaybackSummary {
  setup: RawSetup;
  firstIndex: number;
  lastIndex: number;
  shotCount: number;
  equipment: EquipmentKind;
}

export interface ScrubberMarker {
  index: number;
  percent: number;
  kind: 'setup' | 'traverse' | 'warning' | 'gnss-float' | 'rod-height' | 'instrument-height' | 'reflectorless';
  label: string;
}

export type HeightChangeKind = 'rod' | 'instrument';

export interface HeightChange {
  kind: HeightChangeKind;
  index: number;
  percent: number;
  sequence: number;
  pointNumber?: string;
  fromHeight: number;
  toHeight: number;
  fieldTimeMs?: number;
  label: string;
}

export const REPLAY_SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4, 8, 16, 32] as const;

interface UseRawReplayControllerOptions {
  rawFile: { name: string; content: string } | null;
  onImport: (survey: RawSurvey, options: RawImportOptions) => void;
}

export interface RawReplayController {
  rawFile: { name: string; content: string } | null;
  survey: RawSurvey | null;
  parseError: string | null;
  loading: boolean;
  playhead: number;
  /** Fractional interpolation progress (0..1) from the previous observation to `playhead`. */
  playheadProgress: number;
  setPlayhead: Dispatch<SetStateAction<number>>;
  playing: boolean;
  loop: boolean;
  setLoop: (value: boolean) => void;
  speed: number;
  setSpeed: (value: number) => void;
  timingMode: ReplayTimingMode;
  setTimingMode: (value: ReplayTimingMode) => void;
  cameraFollowMode: CameraFollowMode;
  setCameraFollowMode: (value: CameraFollowMode) => void;
  verticalExaggeration: number;
  setVerticalExaggeration: (value: number) => void;
  equipmentScaleMode: EquipmentScaleMode;
  setEquipmentScaleMode: (value: EquipmentScaleMode) => void;
  motionMode: ReplayMotionMode;
  setMotionMode: (value: ReplayMotionMode) => void;
  pointLabelMode: PointLabelMode;
  setPointLabelMode: (value: PointLabelMode) => void;
  traceColorMode: TraceColorMode;
  setTraceColorMode: (value: TraceColorMode) => void;
  styleSettings: RawReplayStyleSettings;
  updateStyleSettings: (patch: Partial<RawReplayStyleSettings>) => void;
  updateTraceEquipmentStyle: (equipment: EquipmentKind, patch: Partial<RawReplayTraceEquipmentStyle>) => void;
  resetStyleSettings: () => void;
  sightRayMode: SightRayMode;
  setSightRayMode: (value: SightRayMode) => void;
  active3DTool: Scene3DTool;
  setActive3DTool: (value: Scene3DTool) => void;
  togglePlay: () => void;
  stop: () => void;
  seek: (index: number) => void;
  stepBack: () => void;
  stepForward: () => void;
  stepBackTen: () => void;
  stepForwardTen: () => void;
  prevSetup: () => void;
  nextSetup: () => void;
  jumpToSetup: (setupId: string) => void;
  jumpToPoint: (pointQuery: string) => boolean;
  goToStart: () => void;
  goToEnd: () => void;
  equipmentOverride: EquipmentOverride;
  setEquipmentOverride: (value: EquipmentOverride) => void;
  showSurveyLines: boolean;
  setShowSurveyLines: (value: boolean) => void;
  showProjectLines: boolean;
  setShowProjectLines: (value: boolean) => void;
  showTraverse: boolean;
  setShowTraverse: (value: boolean) => void;
  showTin: boolean;
  setShowTin: (value: boolean) => void;
  showTinWireframe: boolean;
  setShowTinWireframe: (value: boolean) => void;
  showContours: boolean;
  setShowContours: (value: boolean) => void;
  showSightRays: boolean;
  setShowSightRays: (value: boolean) => void;
  showTower: boolean;
  setShowTower: (value: boolean) => void;
  showGrid: boolean;
  setShowGrid: (value: boolean) => void;
  gridSpacing: number;
  setGridSpacing: (value: number) => void;
  gridOpacity: number;
  setGridOpacity: (value: number) => void;
  showBasemap: boolean;
  setShowBasemap: (value: boolean) => void;
  basemapType: Basemap3DType;
  setBasemapType: (value: Basemap3DType) => void;
  basemapOpacity: number;
  setBasemapOpacity: (value: number) => void;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  selectedSetupFilter: string;
  setSelectedSetupFilter: (value: string) => void;
  filteredObservations: Array<{ observation: RawObservation; index: number }>;
  setupSummaries: SetupPlaybackSummary[];
  scrubberMarkers: ScrubberMarker[];
  /** Every recorded rod/prism and instrument height change in field order. */
  heightChanges: HeightChange[];
  /** Height changes reached by the current playhead (the live ledger). */
  liveHeightChanges: HeightChange[];
  importOpen: boolean;
  setImportOpen: (value: boolean) => void;
  importOptions: RawImportOptions;
  setImportOptions: Dispatch<SetStateAction<RawImportOptions>>;
  confirmImport: () => void;
  flash: string | null;
  observations: RawSurvey['observations'];
  lastIndex: number;
  current: RawSurvey['observations'][number] | undefined;
  previousObservation: RawSurvey['observations'][number] | undefined;
  currentSetup: RawSurvey['setups'][number] | undefined;
  base: ReturnType<typeof resolveBase>;
  summary: ReturnType<typeof buildRawSummary> | null;
  finalSummary: ReturnType<typeof buildRawSummary> | null;
  liveObservationCount: number;
  progressPercent: number;
  liveSetups: number;
  livePoints: number;
  /** Monotonic signal incremented when user requests a camera focus on the current shot. */
  focusShotSignal: number;
  requestFocusCurrentShot: () => void;
}

const clampIndex = (value: number, lastIndex: number): number => Math.min(lastIndex, Math.max(0, value));
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const asHex = (value: unknown, fallback: string): string =>
  typeof value === 'string' && HEX_COLOR.test(value) ? value : fallback;

const asLineType = (value: unknown, fallback: SimulationLineType): SimulationLineType =>
  RAW_REPLAY_LINE_TYPES.includes(value as SimulationLineType) ? value as SimulationLineType : fallback;

const asMarkerShape = (value: unknown, fallback: ShotMarkerShape): ShotMarkerShape =>
  RAW_REPLAY_MARKER_SHAPES.includes(value as ShotMarkerShape) ? value as ShotMarkerShape : fallback;

const asNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  const numeric = Number(value ?? fallback);
  return Number.isFinite(numeric) ? clamp(numeric, min, max) : fallback;
};

const asTraceEquipmentStyles = (
  value: unknown,
): Partial<Record<EquipmentKind, RawReplayTraceEquipmentStyle>> => {
  if (!value || typeof value !== 'object') return {};
  const parsed = value as Record<string, unknown>;
  const styles: Partial<Record<EquipmentKind, RawReplayTraceEquipmentStyle>> = {};
  RAW_REPLAY_EQUIPMENT_KINDS.forEach(equipment => {
    const entry = parsed[equipment];
    if (!entry || typeof entry !== 'object') return;
    const raw = entry as Record<string, unknown>;
    const fallback = DEFAULT_TRACE_EQUIPMENT_STYLES[equipment];
    styles[equipment] = {
      color: asHex(raw.color, fallback.color),
      lineType: asLineType(raw.lineType, fallback.lineType),
      lineWeight: asNumber(raw.lineWeight, fallback.lineWeight, 0.5, 6),
    };
  });
  return styles;
};

const asClockTime = (value: unknown, fallback: string): string =>
  typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;

const loadRawReplayStyle = (): RawReplayStyleSettings => {
  if (typeof window === 'undefined') return DEFAULT_RAW_REPLAY_STYLE;
  try {
    const raw = window.localStorage.getItem(RAW_REPLAY_STYLE_STORAGE_KEY);
    if (!raw) return DEFAULT_RAW_REPLAY_STYLE;
    const parsed = JSON.parse(raw) as Partial<RawReplayStyleSettings>;
    const d = DEFAULT_RAW_REPLAY_STYLE;
    return {
      pointSize: asNumber(parsed.pointSize, d.pointSize, 0.5, 2.5),
      pointGlow: asNumber(parsed.pointGlow, d.pointGlow, 0, 1),
      pointColor: asHex(parsed.pointColor, d.pointColor),
      pointShape: asMarkerShape(parsed.pointShape, d.pointShape),
      pointLineWeight: asNumber(parsed.pointLineWeight, d.pointLineWeight, 0.5, 3),
      pointTtl: asNumber(parsed.pointTtl, d.pointTtl, 0, 120),
      showFuturePoints: parsed.showFuturePoints !== false,
      traceGlow: asNumber(parsed.traceGlow, d.traceGlow, 0, 1),
      traceTail: Math.round(asNumber(parsed.traceTail, d.traceTail, 10, 600)),
      traceColor: asHex(parsed.traceColor, d.traceColor),
      traceLineType: asLineType(parsed.traceLineType, d.traceLineType),
      traceLineWeight: asNumber(parsed.traceLineWeight, d.traceLineWeight, 0.5, 6),
      traceTtl: asNumber(parsed.traceTtl, d.traceTtl, 0, 120),
      traceEquipmentStyles: asTraceEquipmentStyles(parsed.traceEquipmentStyles),
      rayColor: asHex(parsed.rayColor, d.rayColor),
      rayLineType: asLineType(parsed.rayLineType, d.rayLineType),
      rayLineWeight: asNumber(parsed.rayLineWeight, d.rayLineWeight, 0.5, 6),
      rayTtl: asNumber(parsed.rayTtl, d.rayTtl, 0.2, 30),
      traverseColor: asHex(parsed.traverseColor, d.traverseColor),
      traverseGlow: asNumber(parsed.traverseGlow, d.traverseGlow, 0, 1),
      traverseLineType: asLineType(parsed.traverseLineType, d.traverseLineType),
      traverseLineWeight: asNumber(parsed.traverseLineWeight, d.traverseLineWeight, 0.5, 6),
      traverseTtl: asNumber(parsed.traverseTtl, d.traverseTtl, 0, 120),
      projectColorMode: parsed.projectColorMode === 'custom' ? 'custom' : 'source',
      projectColor: asHex(parsed.projectColor, d.projectColor),
      projectLineType: asLineType(parsed.projectLineType, d.projectLineType),
      projectLineWeight: asNumber(parsed.projectLineWeight, d.projectLineWeight, 0.5, 6),
      projectOpacity: asNumber(parsed.projectOpacity, d.projectOpacity, 0.05, 1),
      projectTtl: asNumber(parsed.projectTtl, d.projectTtl, 0, 120),
      contourMinorColor: asHex(parsed.contourMinorColor, d.contourMinorColor),
      contourMajorColor: asHex(parsed.contourMajorColor, d.contourMajorColor),
      contourLineType: asLineType(parsed.contourLineType, d.contourLineType),
      contourLineWeight: asNumber(parsed.contourLineWeight, d.contourLineWeight, 0.5, 6),
      contourOpacity: asNumber(parsed.contourOpacity, d.contourOpacity, 0.05, 1),
      contourTtl: asNumber(parsed.contourTtl, d.contourTtl, 0, 120),
      gridColor: asHex(parsed.gridColor, d.gridColor),
      gridLineType: asLineType(parsed.gridLineType, d.gridLineType),
      gridLineWeight: asNumber(parsed.gridLineWeight, d.gridLineWeight, 0.5, 6),
      gridTtl: asNumber(parsed.gridTtl, d.gridTtl, 0, 120),
      labelColor: asHex(parsed.labelColor, d.labelColor),
      labelScale: asNumber(parsed.labelScale, d.labelScale, 0.6, 2.5),
      labelTtl: asNumber(parsed.labelTtl, d.labelTtl, 0, 120),
      skyTimeMode: parsed.skyTimeMode === 'fixed' ? 'fixed' : 'recorded',
      skyTime: asClockTime(parsed.skyTime, d.skyTime),
    };
  } catch {
    return DEFAULT_RAW_REPLAY_STYLE;
  }
};

export const formatClock = (ms: number | undefined): string => {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const date = new Date(ms);
  // Raw timestamps are the recorded local clock, encoded as a stable epoch.
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')}`;
};

export const formatDuration = (ms: number | undefined): string => {
  if (ms == null || !Number.isFinite(ms)) return 'not recorded';
  const seconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};

export const useRawReplayController = ({
  rawFile,
  onImport,
}: UseRawReplayControllerOptions): RawReplayController => {
  const [survey, setSurvey] = useState<RawSurvey | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [playheadProgress, setPlayheadProgress] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [timingMode, setTimingMode] = useState<ReplayTimingMode>('steady');
  const [cameraFollowMode, setCameraFollowMode] = useState<CameraFollowMode>('follow-shot');
  const [verticalExaggeration, setVerticalExaggeration] = useState(1);
  const [equipmentScaleMode, setEquipmentScaleMode] = useState<EquipmentScaleMode>('auto');
  const [motionMode, setMotionMode] = useState<ReplayMotionMode>('glide');
  const [pointLabelMode, setPointLabelMode] = useState<PointLabelMode>('recent');
  const [traceColorMode, setTraceColorMode] = useState<TraceColorMode>('equipment');
  const [styleSettings, setStyleSettings] = useState<RawReplayStyleSettings>(loadRawReplayStyle);
  const [sightRayMode, setSightRayMode] = useState<SightRayMode>('live');
  const [active3DTool, setActive3DTool] = useState<Scene3DTool>('select');
  const [equipmentOverride, setEquipmentOverride] = useState<EquipmentOverride>('auto');
  const [showSurveyLines, setShowSurveyLines] = useState(true);
  const [showProjectLines, setShowProjectLines] = useState(true);
  const [showTraverse, setShowTraverse] = useState(false);
  const [showTin, setShowTin] = useState(true);
  const [showTinWireframe, setShowTinWireframe] = useState(false);
  const [showContours, setShowContours] = useState(true);
  const [showSightRays, setShowSightRays] = useState(true);
  const [showTower, setShowTower] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [gridSpacing, setGridSpacing] = useState(1);
  const [gridOpacity, setGridOpacity] = useState(1);
  const [showBasemap, setShowBasemap] = useState(true);
  const [basemapType, setBasemapType] = useState<Basemap3DType>('hybrid');
  const [basemapOpacity, setBasemapOpacity] = useState(0.82);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSetupFilter, setSelectedSetupFilter] = useState<string>('all');
  const [importOpen, setImportOpen] = useState(false);
  const [importOptions, setImportOptions] = useState<RawImportOptions>({
    pointList: true,
    traverse: true,
    tin: false,
    attachRaw: true,
  });
  const [flash, setFlash] = useState<string | null>(null);
  const [focusShotSignal, setFocusShotSignal] = useState(0);

  const requestFocusCurrentShot = useCallback(() => {
    setCameraFollowMode(prev => (prev === 'free' ? 'follow-shot' : prev));
    setFocusShotSignal(prev => prev + 1);
  }, []);

  const updateStyleSettings = useCallback((patch: Partial<RawReplayStyleSettings>) => {
    setStyleSettings(prev => ({ ...prev, ...patch }));
  }, []);

  const updateTraceEquipmentStyle = useCallback((
    equipment: EquipmentKind,
    patch: Partial<RawReplayTraceEquipmentStyle>,
  ) => {
    setStyleSettings(prev => ({
      ...prev,
      traceEquipmentStyles: {
        ...prev.traceEquipmentStyles,
        [equipment]: { ...traceEquipmentStyleFor(prev.traceEquipmentStyles, equipment), ...patch },
      },
    }));
  }, []);

  const resetStyleSettings = useCallback(() => {
    setStyleSettings(DEFAULT_RAW_REPLAY_STYLE);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(RAW_REPLAY_STYLE_STORAGE_KEY, JSON.stringify(styleSettings));
    } catch {
      // Style persistence is best-effort; the live scene still updates.
    }
  }, [styleSettings]);

  useEffect(() => {
    if (!rawFile) {
      setSurvey(null);
      setParseError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setParseError(null);
    setSurvey(null);
    setPlayhead(0);
    setPlayheadProgress(1);
    setPlaying(false);
    const timer = window.setTimeout(() => {
      try {
        const parsed = parseRawSurvey(rawFile.name, rawFile.content);
        setSurvey(parsed);
        setLoading(false);
      } catch (error) {
        setParseError(error instanceof Error ? error.message : 'The raw file could not be parsed.');
        setLoading(false);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [rawFile]);

  useEffect(() => {
    if (!survey) return;
    setPlayhead(0);
    setPlayheadProgress(1);
    setPlaying(false);
    setEquipmentOverride('auto');
    setSelectedSetupFilter('all');
    setSearchQuery('');
  }, [survey]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 4200);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const observations = useMemo(() => survey?.observations ?? [], [survey]);
  const lastIndex = Math.max(0, observations.length - 1);
  const safePlayhead = Math.min(playhead, lastIndex);
  const current = observations[safePlayhead];
  const previousObservation = safePlayhead > 0 ? observations[safePlayhead - 1] : undefined;
  const currentSetup = useMemo(
    () => (current ? survey?.setups.find(setup => setup.id === current.setupId) : undefined),
    [current, survey],
  );
  const base = useMemo(() => (survey ? resolveBase(survey) : null), [survey]);
  const summary = useMemo(
    () => (survey ? buildRawSummaryAt(survey, safePlayhead) : null),
    [survey, safePlayhead],
  );
  const finalSummary = useMemo(() => (survey ? buildRawSummary(survey) : null), [survey]);
  const liveObservationCount = observations.length > 0 ? Math.min(observations.length, safePlayhead + 1) : 0;
  const progressPercent = observations.length > 0
    ? Math.round(((safePlayhead + 1) / observations.length) * 100)
    : 0;

  const setupSummaries = useMemo<SetupPlaybackSummary[]>(() => {
    if (!survey) return [];
    const byId = new Map<string, { firstIndex: number; lastIndex: number; shotCount: number }>();
    survey.observations.forEach((obs, index) => {
      const entry = byId.get(obs.setupId);
      if (!entry) {
        byId.set(obs.setupId, { firstIndex: index, lastIndex: index, shotCount: 1 });
      } else {
        entry.lastIndex = index;
        entry.shotCount += 1;
      }
    });
    return survey.setups.map(setup => {
      const range = byId.get(setup.id);
      return {
        setup,
        firstIndex: range?.firstIndex ?? 0,
        lastIndex: range?.lastIndex ?? 0,
        shotCount: range?.shotCount ?? 0,
        equipment: setup.equipment,
      };
    });
  }, [survey]);

  const heightChanges = useMemo<HeightChange[]>(() => {
    if (!survey || observations.length <= 1) return [];
    const unitLabel = survey.job.units === 'meter' ? 'm' : 'ft';
    const total = Math.max(1, observations.length - 1);
    const setupById = new Map(survey.setups.map(setup => [setup.id, setup]));
    const changes: HeightChange[] = [];
    let previousRodHeight: number | null = null;

    // Rod / prism height changes, recorded per observation.
    observations.forEach((obs, index) => {
      const rodHeight = obs.rodHeight ?? setupById.get(obs.setupId)?.rodHeight ?? null;
      if (rodHeight == null) return;
      if (previousRodHeight != null && Math.abs(rodHeight - previousRodHeight) > 0.005) {
        changes.push({
          kind: 'rod',
          index,
          percent: (index / total) * 100,
          sequence: obs.sequence,
          pointNumber: obs.pointNumber,
          fromHeight: previousRodHeight,
          toHeight: rodHeight,
          fieldTimeMs: obs.fieldTimeMs,
          label: `Rod height ${previousRodHeight.toFixed(2)} → ${rodHeight.toFixed(2)} ${unitLabel}${obs.pointNumber ? ` · PN ${obs.pointNumber}` : ''}`,
        });
      }
      previousRodHeight = rodHeight;
    });

    // Instrument height changes, recorded per setup (no HI field on observations).
    const firstIndexBySetup = new Map<string, number>();
    observations.forEach((obs, index) => {
      if (!firstIndexBySetup.has(obs.setupId)) firstIndexBySetup.set(obs.setupId, index);
    });
    let previousInstrumentHeight: number | null = null;
    [...survey.setups]
      .sort((a, b) => a.sequence - b.sequence)
      .forEach(setup => {
        const instrumentHeight = setup.instrumentHeight ?? null;
        if (instrumentHeight == null) return;
        const firstIndex = firstIndexBySetup.get(setup.id);
        if (
          firstIndex != null
          && previousInstrumentHeight != null
          && Math.abs(instrumentHeight - previousInstrumentHeight) > 0.005
        ) {
          const obs = observations[firstIndex];
          changes.push({
            kind: 'instrument',
            index: firstIndex,
            percent: (firstIndex / total) * 100,
            sequence: obs.sequence,
            pointNumber: obs.pointNumber,
            fromHeight: previousInstrumentHeight,
            toHeight: instrumentHeight,
            fieldTimeMs: obs.fieldTimeMs,
            label: `Instrument height ${previousInstrumentHeight.toFixed(2)} → ${instrumentHeight.toFixed(2)} ${unitLabel} · Setup ${setup.sequence + 1}`,
          });
        }
        previousInstrumentHeight = instrumentHeight;
      });

    return changes.sort((a, b) => a.index - b.index);
  }, [survey, observations]);

  const liveHeightChanges = useMemo(
    () => heightChanges.filter(change => change.index <= safePlayhead),
    [heightChanges, safePlayhead],
  );

  const scrubberMarkers = useMemo<ScrubberMarker[]>(() => {
    if (!survey || observations.length <= 1) return [];
    const markers: ScrubberMarker[] = heightChanges.map(change => ({
      index: change.index,
      percent: change.percent,
      kind: change.kind === 'rod' ? 'rod-height' : 'instrument-height',
      label: change.label,
    }));
    const total = Math.max(1, observations.length - 1);
    const seenSetupIds = new Set<string>();

    observations.forEach((obs, idx) => {
      const pct = (idx / total) * 100;
      if (!seenSetupIds.has(obs.setupId)) {
        seenSetupIds.add(obs.setupId);
        const setup = survey.setups.find(s => s.id === obs.setupId);
        if (idx > 0 && setup) {
          markers.push({
            index: idx,
            percent: pct,
            kind: 'setup',
            label: `Setup ${setup.sequence + 1}${setup.occupyPoint ? ` (${setup.occupyPoint})` : ''}`,
          });
        }
      }
      if (obs.kind === 'traverse') {
        markers.push({
          index: idx,
          percent: pct,
          kind: 'traverse',
          label: `Traverse FS ${obs.pointNumber ? `PN ${obs.pointNumber}` : `#${obs.sequence}`}`,
        });
      } else if (obs.gnss?.quality === 'float' || obs.gnss?.quality === 'autonomous') {
        markers.push({
          index: idx,
          percent: pct,
          kind: 'gnss-float',
          label: `GNSS ${obs.gnss.quality.toUpperCase()} · ${obs.pointNumber ? `PN ${obs.pointNumber}` : `#${obs.sequence}`}`,
        });
      }
      if (obs.reflectorless) {
        markers.push({
          index: idx,
          percent: pct,
          kind: 'reflectorless',
          label: `Reflectorless EDM · ${obs.pointNumber ? `PN ${obs.pointNumber}` : `#${obs.sequence}`}${obs.description ? ` · ${obs.description}` : ''}`,
        });
      }
    });
    return markers;
  }, [survey, observations, heightChanges]);

  const filteredObservations = useMemo(() => {
    if (!survey) return [];
    const q = searchQuery.trim().toLowerCase();
    return observations
      .map((observation, index) => ({ observation, index }))
      .filter(({ observation }) => {
        if (selectedSetupFilter !== 'all' && observation.setupId !== selectedSetupFilter) {
          return false;
        }
        if (!q) return true;
        const pn = (observation.pointNumber ?? '').toLowerCase();
        const desc = (observation.description ?? '').toLowerCase();
        const kind = observation.kind.toLowerCase();
        return pn.includes(q) || desc.includes(q) || kind.includes(q) || String(observation.sequence).includes(q);
      });
  }, [survey, observations, searchQuery, selectedSetupFilter]);

  const liveSetups = useMemo(() => {
    if (!survey) return 0;
    const seen = new Set(
      survey.observations
        .slice(0, liveObservationCount)
        .map(observation => observation.setupId),
    );
    return survey.setups.filter(setup => seen.has(setup.id)).length;
  }, [survey, liveObservationCount]);

  const livePoints = useMemo(() => {
    if (!survey) return 0;
    return new Set(
      survey.observations
        .slice(0, liveObservationCount)
        .map(observation => observation.pointNumber ?? observation.id),
    ).size;
  }, [survey, liveObservationCount]);

  // Compute step duration in ms for a given observation transition
  const getStepDurationMs = useCallback((targetIdx: number): number => {
    const baseMs = 950 / Math.max(0.1, speed);
    if (timingMode === 'steady') return clamp(baseMs, 28, 6000);
    const currObs = observations[targetIdx];
    const prevObs = observations[targetIdx - 1];
    if (!currObs || !prevObs) return clamp(baseMs, 28, 6000);
    const setupChanged = currObs.setupId !== prevObs.setupId;
    if (timingMode === 'field-clock' && currObs.fieldTimeMs != null && prevObs.fieldTimeMs != null && currObs.fieldTimeMs > prevObs.fieldTimeMs) {
      const fieldGap = clamp(currObs.fieldTimeMs - prevObs.fieldTimeMs, 400, 4800);
      const bonus = setupChanged ? 900 : 0;
      return clamp((fieldGap + bonus) / Math.max(0.1, speed), 32, 8000);
    }
    return clamp(baseMs + (setupChanged ? 500 / Math.max(0.25, speed) : 0), 28, 6000);
  }, [observations, speed, timingMode]);

  const stepStartRef = useRef<number>(0);
  const playheadRef = useRef<number>(playhead);
  playheadRef.current = playhead;

  useEffect(() => {
    if (!playing || observations.length === 0) {
      setPlayheadProgress(1);
      return;
    }

    let rafId = 0;
    stepStartRef.current = performance.now();
    if (motionMode === 'glide') setPlayheadProgress(0);

    const tick = (now: number) => {
      const currentIdx = playheadRef.current;
      const duration = getStepDurationMs(currentIdx);
      const elapsed = Math.max(0, now - stepStartRef.current);
      const t = clamp(elapsed / Math.max(16, duration), 0, 1);

      if (motionMode === 'glide') {
        setPlayheadProgress(t);
      } else {
        setPlayheadProgress(1);
      }

      if (t >= 1) {
        const nextIdx = currentIdx + 1;
        if (nextIdx >= observations.length) {
          if (loop && observations.length > 1) {
            playheadRef.current = 0;
            setPlayhead(0);
            stepStartRef.current = now;
            if (motionMode === 'glide') setPlayheadProgress(0);
          } else {
            setPlayheadProgress(1);
            setPlaying(false);
            return;
          }
        } else {
          const prevObs = observations[currentIdx];
          const nextObs = observations[nextIdx];
          const isNewSetup = prevObs && nextObs && prevObs.setupId !== nextObs.setupId;
          playheadRef.current = nextIdx;
          setPlayhead(nextIdx);
          stepStartRef.current = now;
          if (isNewSetup && timingMode === 'pause-on-setup') {
            const nextSetupObj = survey?.setups.find(s => s.id === nextObs.setupId);
            setPlayheadProgress(1);
            setPlaying(false);
            setFlash(`Paused at Setup ${(nextSetupObj?.sequence ?? 0) + 1}${nextSetupObj?.occupyPoint ? ` (${nextSetupObj.occupyPoint})` : ''}`);
            return;
          }
          if (motionMode === 'glide') setPlayheadProgress(0);
        }
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [playing, observations, getStepDurationMs, loop, motionMode, timingMode, survey]);

  const togglePlay = useCallback(() => {
    if (observations.length === 0) return;
    if (!playing && playhead >= lastIndex) {
      playheadRef.current = 0;
      setPlayhead(0);
    }
    setPlaying(value => !value);
  }, [lastIndex, observations.length, playhead, playing]);

  const stop = useCallback(() => {
    setPlaying(false);
    playheadRef.current = 0;
    setPlayhead(0);
    setPlayheadProgress(1);
  }, []);

  const seek = useCallback((index: number) => {
    setPlaying(false);
    const clamped = clampIndex(index, lastIndex);
    playheadRef.current = clamped;
    setPlayhead(clamped);
    setPlayheadProgress(1);
  }, [lastIndex]);

  const stepBack = useCallback(() => {
    setPlaying(false);
    setPlayhead(value => {
      const next = Math.max(0, value - 1);
      playheadRef.current = next;
      return next;
    });
    setPlayheadProgress(1);
  }, []);

  const stepForward = useCallback(() => {
    setPlaying(false);
    setPlayhead(value => {
      const next = Math.min(lastIndex, value + 1);
      playheadRef.current = next;
      return next;
    });
    setPlayheadProgress(1);
  }, [lastIndex]);

  const stepBackTen = useCallback(() => {
    setPlaying(false);
    setPlayhead(value => {
      const next = Math.max(0, value - 10);
      playheadRef.current = next;
      return next;
    });
    setPlayheadProgress(1);
  }, []);

  const stepForwardTen = useCallback(() => {
    setPlaying(false);
    setPlayhead(value => {
      const next = Math.min(lastIndex, value + 10);
      playheadRef.current = next;
      return next;
    });
    setPlayheadProgress(1);
  }, [lastIndex]);

  const prevSetup = useCallback(() => {
    if (setupSummaries.length === 0) {
      seek(0);
      return;
    }
    const currIdx = playheadRef.current;
    // Find setup containing currIdx
    const currentSetupSummaryIdx = setupSummaries.findIndex(
      s => currIdx >= s.firstIndex && currIdx <= s.lastIndex,
    );
    if (currentSetupSummaryIdx <= 0) {
      seek(0);
      return;
    }
    const currentSummary = setupSummaries[currentSetupSummaryIdx];
    if (currIdx > currentSummary.firstIndex) {
      seek(currentSummary.firstIndex);
    } else {
      seek(setupSummaries[currentSetupSummaryIdx - 1].firstIndex);
    }
  }, [setupSummaries, seek]);

  const nextSetup = useCallback(() => {
    if (setupSummaries.length === 0) {
      seek(lastIndex);
      return;
    }
    const currIdx = playheadRef.current;
    const nextSummary = setupSummaries.find(s => s.firstIndex > currIdx);
    if (nextSummary) {
      seek(nextSummary.firstIndex);
    } else {
      seek(lastIndex);
    }
  }, [setupSummaries, lastIndex, seek]);

  const jumpToSetup = useCallback((setupId: string) => {
    const match = setupSummaries.find(s => s.setup.id === setupId);
    if (match) {
      seek(match.firstIndex);
      requestFocusCurrentShot();
    }
  }, [setupSummaries, seek, requestFocusCurrentShot]);

  const jumpToPoint = useCallback((pointQuery: string): boolean => {
    const q = pointQuery.trim().toLowerCase();
    if (!q) return false;
    const exactIdx = observations.findIndex(obs => (obs.pointNumber ?? '').toLowerCase() === q);
    if (exactIdx >= 0) {
      seek(exactIdx);
      requestFocusCurrentShot();
      return true;
    }
    const partialIdx = observations.findIndex(
      obs => (obs.pointNumber ?? '').toLowerCase().includes(q) || (obs.description ?? '').toLowerCase().includes(q),
    );
    if (partialIdx >= 0) {
      seek(partialIdx);
      requestFocusCurrentShot();
      return true;
    }
    return false;
  }, [observations, seek, requestFocusCurrentShot]);

  const goToStart = useCallback(() => {
    seek(0);
  }, [seek]);

  const goToEnd = useCallback(() => {
    seek(lastIndex);
  }, [lastIndex, seek]);

  const confirmImport = useCallback(() => {
    if (!survey) return;
    onImport(survey, importOptions);
    setImportOpen(false);
    setFlash('Added to the project. The raw file remains attached and read-only.');
  }, [importOptions, onImport, survey]);

  return {
    rawFile,
    survey,
    parseError,
    loading,
    playhead: safePlayhead,
    playheadProgress,
    setPlayhead,
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
    setPointLabelMode,
    traceColorMode,
    setTraceColorMode,
    styleSettings,
    updateStyleSettings,
    updateTraceEquipmentStyle,
    resetStyleSettings,
    sightRayMode,
    setSightRayMode,
    active3DTool,
    setActive3DTool,
    togglePlay,
    stop,
    seek,
    stepBack,
    stepForward,
    stepBackTen,
    stepForwardTen,
    prevSetup,
    nextSetup,
    jumpToSetup,
    jumpToPoint,
    goToStart,
    goToEnd,
    equipmentOverride,
    setEquipmentOverride,
    showSurveyLines,
    setShowSurveyLines,
    showProjectLines,
    setShowProjectLines,
    showTraverse,
    setShowTraverse,
    showTin,
    setShowTin,
    showTinWireframe,
    setShowTinWireframe,
    showContours,
    setShowContours,
    showSightRays,
    setShowSightRays,
    showTower,
    setShowTower,
    showGrid,
    setShowGrid,
    gridSpacing,
    setGridSpacing,
    gridOpacity,
    setGridOpacity,
    showBasemap,
    setShowBasemap,
    basemapType,
    setBasemapType,
    basemapOpacity,
    setBasemapOpacity,
    searchQuery,
    setSearchQuery,
    selectedSetupFilter,
    setSelectedSetupFilter,
    filteredObservations,
    setupSummaries,
    scrubberMarkers,
    heightChanges,
    liveHeightChanges,
    importOpen,
    setImportOpen,
    importOptions,
    setImportOptions,
    confirmImport,
    flash,
    observations,
    lastIndex,
    current,
    previousObservation,
    currentSetup,
    base,
    summary,
    finalSummary,
    liveObservationCount,
    progressPercent,
    liveSetups,
    livePoints,
    focusShotSignal,
    requestFocusCurrentShot,
  };
};
