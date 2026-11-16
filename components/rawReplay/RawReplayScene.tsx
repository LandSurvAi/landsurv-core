import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArcRotateCamera,
  Camera,
  Color3,
  Color4,
  Constants,
  CreateGreasedLine,
  GreasedLineMeshMaterialType,
  DirectionalLight,
  DynamicTexture,
  Engine,
  HemisphericLight,
  Material,
  Matrix,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Plane,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexData,
} from '@babylonjs/core';
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
import type { ResolvedBase } from '../../services/rawReplay/baseStations';
import { formatBearing } from '../../services/rawReplay/baseStations';
import type { EquipmentKind, RawObservation, RawSurvey } from '../../services/rawReplay/types';
import { resolveHeight } from '../../services/rawReplay/heights';
import { resolveSkyContext } from '../../services/rawReplay/astronomy';
import { createCelestialSky, createSatelliteSkyRig, type CelestialSkyRig, type SatelliteSkyRig, type SkyState } from './celestialSky';
import {
  DEFAULT_RAW_REPLAY_STYLE,
  traceEquipmentStyleFor,
  type RawReplayStyleSettings,
  type RawReplayTraceEquipmentStyle,
  type SimulationLineType,
} from './useRawReplayController';
import type {
  Basemap3DType,
  CameraFollowMode,
  EquipmentOverride,
  EquipmentScaleMode,
  PointLabelMode,
  ReplayMotionMode,
  Scene3DTool,
  SightRayMode,
  TraceColorMode,
} from './useRawReplayController';
import {
  buildContourGenerationLines3D,
  createFastTinSampler,
  createGnssBaseRig,
  createGnssRoverRig,
  createSurveyPoleRig,
  createTextureFromCanvas,
  createTotalStationRig,
  elevationToHypsometricColor,
  loadBasemapCompositeCanvas,
  rawReplayBasemapExtent,
  tessellateBoundaryFile3D,
  tessellateCenterline3D,
  tessellateSurveyLine3D,
  type ArticulatedGnssBaseRig,
  type ArticulatedGnssRoverRig,
  type ArticulatedPrismPoleRig,
  type ArticulatedTotalStationRig,
  type FastTinSampler,
  type WorldMapping3D,
} from './scene3dHelpers';
import { createSurveyEnvironmentCubeTexture, getSurveyMaterialKit } from './equipmentMaterials';

export interface RawReplaySceneProps {
  survey: RawSurvey;
  base: ResolvedBase | null;
  playhead: number;
  playheadProgress?: number;
  equipmentOverride: EquipmentOverride;
  showProjectLines: boolean;
  showSurveyLines?: boolean;
  showTraverse: boolean;
  showSightRays: boolean;
  showTower: boolean;
  showTin: boolean;
  showTinWireframe?: boolean;
  showContours?: boolean;
  showGrid?: boolean;
  gridSpacing?: number;
  gridOpacity?: number;
  showEquipment?: boolean;
  showPoints?: boolean;
  showBasemap?: boolean;
  basemapType?: Basemap3DType;
  basemapOpacity?: number;
  verticalExaggeration?: number;
  equipmentScaleMode?: EquipmentScaleMode;
  motionMode?: ReplayMotionMode;
  pointLabelMode?: PointLabelMode;
  traceColorMode?: TraceColorMode;
  styleSettings?: RawReplayStyleSettings;
  sightRayMode?: SightRayMode;
  cameraFollowMode?: CameraFollowMode;
  active3DTool?: Scene3DTool;
  onActive3DToolChange?: (tool: Scene3DTool) => void;
  focusShotSignal?: number;
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
  /** Keeps scene overlays clear of the vertical tool rail on the left. */
  leftRail?: boolean;
}

interface PointWorld {
  observation: RawObservation;
  position: Vector3;
}

interface SnapCandidate3D {
  kind: 'point' | 'raw-shot' | 'line-end' | 'setup';
  label: string;
  pointNumber?: string;
  description?: string;
  easting: number;
  northing: number;
  elevation: number;
  worldPos: Vector3;
  observationIndex?: number;
}

interface InspectedEntity3D {
  title: string;
  subtitle?: string;
  easting: number;
  northing: number;
  elevation: number;
  details: Array<{ label: string; value: string }>;
}

interface HoverQuickView {
  x: number;
  y: number;
  title: string;
  subtitle: string;
  pointNumber?: string;
  description?: string;
  easting: number;
  northing: number;
  elevation: number;
  reflectorless: boolean;
}

interface MeasureResult3D {
  from: { easting: number; northing: number; elevation: number; label: string; worldPos: Vector3 };
  to: { easting: number; northing: number; elevation: number; label: string; worldPos: Vector3 };
  horizDist: number;
  slopeDist: number;
  deltaZ: number;
  bearingText: string;
  gradePercent: number;
}

interface DragState {
  mode: 'orbit' | 'pan';
  x: number;
  y: number;
  pointerId: number;
  moved: boolean;
}

const EMPTY_CONTOUR_GENS: ContourGeneration[] = [];
const EMPTY_CONTOUR_LABELS: ContourLabel[] = [];
const EMPTY_CENTERLINES: Centerline[] = [];
const EMPTY_BOUNDARIES: BoundaryFile[] = [];
const EMPTY_HATCHES: CanvasHatch[] = [];
const EMPTY_UNDERLAYS: RasterUnderlay[] = [];
const EMPTY_TEXT_ANNOTS: CanvasTextAnnotation[] = [];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const mixColor4 = (a: Color4, b: Color4, t: number): Color4 => new Color4(
  a.r + (b.r - a.r) * t,
  a.g + (b.g - a.g) * t,
  a.b + (b.b - a.b) * t,
  a.a + (b.a - a.a) * t,
);

/** Follow Pole distance multiplier limits around the auto-fit pole framing. */
const FOLLOW_MIN_ZOOM = 0.85;
const FOLLOW_MAX_ZOOM = 2.2;
const BASE_LOWER_BETA_LIMIT = 0.005;
const BASE_UPPER_BETA_LIMIT = Math.PI / 2 - 0.01;

/** Unit-sized simulation glyph used by the thin-instance shot markers. */
const createShotMarkerMesh = (
  scene: Scene,
  name: string,
  shape: RawReplayStyleSettings['pointShape'] = 'x',
  lineWeight = 1,
): Mesh => {
  const thickness = 0.11 * Math.min(3, Math.max(0.5, lineWeight));
  if (shape === 'dot') {
    const dot = MeshBuilder.CreateSphere(name, { diameter: 0.82, segments: 10 }, scene);
    dot.isPickable = false;
    return dot;
  }
  const bars: Mesh[] = [];
  const makeBar = (width: number, height: number, depth: number, rotationZ = 0) => {
    const bar = MeshBuilder.CreateBox(`${name}-bar-${bars.length}`, { width, height, depth }, scene);
    bar.rotation.z = rotationZ;
    bars.push(bar);
  };
  if (shape === 'square') {
    makeBar(0.92, thickness, 0.92);
    makeBar(thickness, 0.92, 0.92);
  } else if (shape === 'diamond') {
    makeBar(1, thickness, thickness, Math.PI / 4);
    makeBar(thickness, 1, thickness, Math.PI / 4);
  } else if (shape === 'plus') {
    makeBar(1, thickness, thickness, 0);
    makeBar(thickness, 1, thickness, 0);
  } else {
    makeBar(1, thickness, thickness, Math.PI / 4);
    makeBar(1, thickness, thickness, -Math.PI / 4);
  }
  // Depth bar keeps the glyph readable in plan and side views.
  makeBar(thickness, thickness, 1);
  const merged = Mesh.MergeMeshes(bars, true, true, undefined, false, false);
  const mesh = merged ?? MeshBuilder.CreateSphere(name, { diameter: 0.9, segments: 6 }, scene);
  mesh.name = name;
  mesh.isPickable = false;
  return mesh;
};

interface StyledLineSource {
  points: Vector3[];
  color: Color3;
}

const LINE_DASH_PATTERN: Record<Exclude<SimulationLineType, 'solid'>, number[]> = {
  dashed: [2.6, 1.7],
  dotted: [0.45, 1.6],
  'dash-dot': [2.6, 1.1, 0.45, 1.1],
};

/** Split a polyline into simulation dash segments while preserving its phase. */
const splitStyledLine = (points: Vector3[], lineType: SimulationLineType, unit: number): Vector3[][] => {
  if (lineType === 'solid' || points.length < 2) return [points];
  const pattern = LINE_DASH_PATTERN[lineType];
  const scale = clamp(unit, 0.02, 200);
  const pieces: Vector3[][] = [];
  let patternIndex = 0;
  let remaining = pattern[0] * scale;
  let drawing = true;
  for (let i = 1; i < points.length; i += 1) {
    const start = points[i - 1];
    const end = points[i];
    const segmentLength = Vector3.Distance(start, end);
    if (segmentLength < 1e-6) continue;
    let travelled = 0;
    let currentStart = start;
    while (travelled < segmentLength - 1e-7 && pieces.length < 20000) {
      const step = Math.min(remaining, segmentLength - travelled);
      const nextTravelled = travelled + step;
      const nextPoint = nextTravelled >= segmentLength - 1e-7
        ? end
        : Vector3.Lerp(start, end, nextTravelled / segmentLength);
      if (drawing && step > 1e-7) pieces.push([currentStart, nextPoint]);
      travelled = nextTravelled;
      currentStart = nextPoint;
      remaining -= step;
      if (remaining <= 1e-7) {
        patternIndex = (patternIndex + 1) % pattern.length;
        drawing = patternIndex % 2 === 0;
        remaining = pattern[patternIndex] * scale;
      }
    }
  }
  return pieces.length > 0 ? pieces : [points];
};

/**
 * Agent-scoped line renderer. Default solid 1px lines keep the cheap
 * LineSystem path; styled simulation lines use GreasedLine for width and
 * per-segment colors.
 */
const createStyledLineMesh = (
  scene: Scene,
  name: string,
  sources: StyledLineSource[],
  options: {
    alpha: number;
    lineType: SimulationLineType;
    lineWeight: number;
    dashUnit: number;
    renderingGroupId?: number;
  },
): Mesh | null => {
  const lines: Vector3[][] = [];
  const lineColors: Color3[] = [];
  const vertexColors: Color4[][] = [];
  sources.forEach(source => {
    const pieces = splitStyledLine(source.points, options.lineType, options.dashUnit);
    pieces.forEach(piece => {
      if (piece.length < 2) return;
      lines.push(piece);
      const alphaColor = new Color4(source.color.r, source.color.g, source.color.b, options.alpha);
      vertexColors.push(piece.map(() => alphaColor));
      piece.forEach(() => lineColors.push(source.color));
    });
  });
  if (lines.length === 0) return null;

  if (options.lineType === 'solid' && options.lineWeight <= 1.01) {
    const mesh = MeshBuilder.CreateLineSystem(name, {
      lines,
      colors: vertexColors,
      useVertexAlpha: true,
    }, scene);
    mesh.isPickable = false;
    mesh.renderingGroupId = options.renderingGroupId ?? 1;
    return mesh;
  }

  const mesh = CreateGreasedLine(name, { points: lines }, {
    color: Color3.White(),
    colors: lineColors,
    useColors: true,
    width: clamp(options.lineWeight, 0.5, 6),
    sizeAttenuation: true,
    materialType: GreasedLineMeshMaterialType.MATERIAL_TYPE_STANDARD,
  }, scene);
  const material = mesh.material;
  if (material instanceof StandardMaterial) {
    material.alpha = clamp(options.alpha, 0, 1);
    material.disableLighting = true;
    material.backFaceCulling = false;
  }
  mesh.isPickable = false;
  mesh.renderingGroupId = options.renderingGroupId ?? 1;
  return mesh as Mesh;
};

/** Replay-time age used by simulation TTLs; falls back to shot count when timestamps are absent. */
const observationAgeSeconds = (
  current: RawObservation | undefined,
  reference: RawObservation | undefined,
): number => {
  if (!current || !reference) return 0;
  if (current.fieldTimeMs != null && reference.fieldTimeMs != null) {
    return Math.max(0, (current.fieldTimeMs - reference.fieldTimeMs) / 1000);
  }
  return Math.max(0, current.sequence - reference.sequence);
};

const niceStep = (target: number): number => {
  const safe = Math.max(0.01, target);
  const power = 10 ** Math.floor(Math.log10(safe));
  const normalized = safe / power;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * power;
};

const toColor = (hex: string | undefined, fallback: string): Color3 => {
  if (!hex) return Color3.FromHexString(fallback);
  try {
    return Color3.FromHexString(hex.startsWith('#') ? hex : fallback);
  } catch {
    return Color3.FromHexString(fallback);
  }
};

const equipmentLabel = (equipment: EquipmentKind): string => {
  switch (equipment) {
    case 'total-station':
      return 'Total station';
    case 'gnss-rover':
      return 'GNSS RTK rover';
    case 'gnss-base':
      return 'GNSS base';
    case 'level':
      return 'Digital level';
    default:
      return 'Survey instrument';
  }
};

const setupPalette = [
  '#22d3ee',
  '#f59e0b',
  '#a3e635',
  '#f472b6',
  '#818cf8',
  '#34d399',
  '#fb7185',
  '#38bdf8',
];

/** Single source of truth for trace segment color in every trace color mode. */
const traceColorFor = (
  mode: TraceColorMode,
  observation: RawObservation,
  equipment: EquipmentKind,
  setupIndex: number,
  customColor: string,
  equipmentStyles: RawReplayStyleSettings['traceEquipmentStyles'],
  mapping: WorldMapping3D | null,
): Color3 => {
  if (mode === 'setup') {
    return Color3.FromHexString(setupPalette[setupIndex % setupPalette.length]);
  }
  if (mode === 'elevation') {
    const elevation = observation.elevation;
    const t = mapping && mapping.relief > 0 && elevation != null
      ? clamp((elevation - mapping.minZ) / mapping.relief, 0, 1)
      : 0.5;
    const hc = elevationToHypsometricColor(t);
    return new Color3(hc.r, hc.g, hc.b);
  }
  if (mode === 'custom') return toColor(customColor, '#22d3ee');
  return toColor(traceEquipmentStyleFor(equipmentStyles, equipment).color, '#22d3ee');
};

const defaultRodHeight = (survey: RawSurvey): number => (survey.job.units === 'meter' ? 2 : 6.56);
const defaultInstrumentHeight = (survey: RawSurvey): number => (survey.job.units === 'meter' ? 1.55 : 5.15);

const shortestAngle = (value: number): number => {
  const twoPi = Math.PI * 2;
  return ((value + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
};

const smoothStep = (edge0: number, edge1: number, value: number): number => {
  const t = clamp((value - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

const formatQuadrantBearing = (dE: number, dN: number): string => {
  if (Math.hypot(dE, dN) < 1e-6) return 'N 00°00\'00" E';
  const ns = dN >= 0 ? 'N' : 'S';
  const ew = dE >= 0 ? 'E' : 'W';
  const degTotal = (Math.atan2(Math.abs(dE), Math.abs(dN)) * 180) / Math.PI;
  const deg = Math.floor(degTotal);
  const minFloat = (degTotal - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = Math.round((minFloat - min) * 60);
  return `${ns} ${String(deg).padStart(2, '0')}°${String(min).padStart(2, '0')}'${String(sec).padStart(2, '0')}" ${ew}`;
};

const disposeNode = (node: TransformNode | null) => {
  node?.dispose(false, true);
};

const createMaterial = (
  scene: Scene,
  name: string,
  color: string,
  emissive = 0.12,
  alpha = 1,
): StandardMaterial => {
  const material = new StandardMaterial(name, scene);
  const base = Color3.FromHexString(color);
  material.diffuseColor = base;
  material.emissiveColor = base.scale(emissive);
  material.specularColor = new Color3(0.12, 0.16, 0.18);
  material.alpha = alpha;
  return material;
};

const addStrut = (
  scene: Scene,
  parent: TransformNode,
  name: string,
  from: Vector3,
  to: Vector3,
  radius: number,
  material: Material,
): Mesh => {
  const rail = MeshBuilder.CreateCylinder(name, {
    height: Vector3.Distance(from, to),
    diameter: radius * 2,
    tessellation: 8,
  }, scene);
  rail.parent = parent;
  rail.position = Vector3.Center(from, to);
  rail.rotationQuaternion = null;
  rail.alignWithNormal(to.subtract(from).normalize());
  rail.material = material;
  rail.isPickable = false;
  return rail;
};

const buildTower = (
  scene: Scene,
  parent: TransformNode,
  position: Vector3,
  span: number,
  height: number,
) => {
  const root = new TransformNode('raw-replay-base-tower', scene);
  root.parent = parent;
  root.position = position;

  const kit = getSurveyMaterialKit(scene);
  const steel = kit.hardenedSteel;
  const redSteel = new PBRMaterial('raw-replay-tower-red-pbr', scene);
  redSteel.albedoColor = Color3.FromHexString('#dc2626');
  redSteel.metallic = 0.25;
  redSteel.roughness = 0.36;
  redSteel.bumpTexture = kit.castGrainNormal;
  redSteel.bumpTexture.level = 0.28;
  redSteel.emissiveColor = Color3.FromHexString('#dc2626').scale(0.14);

  const whiteSteel = kit.radomeMatteWhite;
  const darkSteel = kit.castMagnesiumDark;
  const antenna = kit.machinedAluminum;
  const concrete = kit.castAnthracite;

  const baseRadius = Math.max(2.4, span * 0.012);
  const topRadius = Math.max(0.45, span * 0.0025);
  const mastRadius = Math.max(0.12, span * 0.0006);
  const pad = MeshBuilder.CreateCylinder('raw-replay-tower-pad', {
    height: 0.45,
    diameter: baseRadius * 2.8,
    tessellation: 12,
  }, scene);
  pad.parent = root;
  pad.position.y = 0.2;
  pad.material = concrete;
  pad.isPickable = false;

  const bases = [0, 1, 2].map(index => {
    const angle = (index / 3) * Math.PI * 2;
    return new Vector3(Math.cos(angle) * baseRadius, 0.35, Math.sin(angle) * baseRadius);
  });
  const tops = [0, 1, 2].map((_index, arrayIndex) => {
    const angle = (arrayIndex / 3) * Math.PI * 2;
    return new Vector3(Math.cos(angle) * topRadius, height, Math.sin(angle) * topRadius);
  });

  bases.forEach((foot, index) => {
    addStrut(scene, root, `raw-replay-tower-leg-${index}`, foot, tops[index], mastRadius * 1.6, steel);
  });

  const levels = 8;
  for (let level = 1; level <= levels; level += 1) {
    const t = level / levels;
    const radius = baseRadius + (topRadius - baseRadius) * t;
    const y = height * t;
    const bandMat = level >= 6 ? (level % 2 === 0 ? redSteel : whiteSteel) : steel;
    for (let side = 0; side < 3; side += 1) {
      const a = (side / 3) * Math.PI * 2;
      const b = ((side + 1) / 3) * Math.PI * 2;
      const from = new Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius);
      const to = new Vector3(Math.cos(b) * radius, y, Math.sin(b) * radius);
      addStrut(scene, root, `raw-replay-tower-brace-${level}-${side}`, from, to, mastRadius, bandMat);
      if (level < levels) {
        const nextA = new Vector3(
          Math.cos(a) * radius * 0.92,
          height * ((level + 1) / levels),
          Math.sin(a) * radius * 0.92,
        );
        addStrut(
          scene,
          root,
          `raw-replay-tower-diagonal-${level}-${side}`,
          from,
          nextA,
          mastRadius * 0.7,
          darkSteel,
        );
      }
    }
  }

  const head = new Vector3(0, height + 1.4, 0);
  addStrut(scene, root, 'raw-replay-tower-head', new Vector3(0, height, 0), head, mastRadius * 1.3, steel);
  const drum = MeshBuilder.CreateCylinder('raw-replay-tower-drum', {
    height: Math.max(1.2, height * 0.06),
    diameter: Math.max(2.2, span * 0.012),
    tessellation: 16,
  }, scene);
  drum.parent = root;
  drum.position = new Vector3(0, height * 0.78, 0);
  drum.rotation.z = Math.PI / 2;
  drum.material = antenna;
  drum.isPickable = false;

  for (let index = 0; index < 3; index += 1) {
    const angle = (index / 3) * Math.PI * 2;
    const panel = MeshBuilder.CreateBox(`raw-replay-tower-panel-${index}`, {
      width: Math.max(1.2, span * 0.006),
      height: Math.max(4, height * 0.17),
      depth: Math.max(0.3, span * 0.001),
    }, scene);
    panel.parent = root;
    panel.position = new Vector3(
      Math.cos(angle) * (topRadius + 0.75),
      height - Math.max(2, height * 0.1),
      Math.sin(angle) * (topRadius + 0.75),
    );
    panel.rotation.y = -angle;
    panel.material = antenna;
    panel.isPickable = false;
  }

  const beacon = MeshBuilder.CreateSphere('raw-replay-tower-beacon', { diameter: Math.max(0.7, span * 0.004), segments: 8 }, scene);
  beacon.parent = root;
  beacon.position = head.add(new Vector3(0, 0.7, 0));
  const beaconMaterial = new StandardMaterial('raw-replay-tower-beacon-mat', scene);
  beaconMaterial.emissiveColor = new Color3(0.96, 0.18, 0.14);
  beaconMaterial.disableLighting = true;
  beacon.material = beaconMaterial;
  beacon.isPickable = false;

  return {
    root,
    topPosition: position.add(head),
    anchor: new Vector3(position.x, position.y + height + Math.max(5, span * 0.025), position.z),
  };
};

export default function RawReplayScene({
  survey,
  base,
  playhead,
  playheadProgress = 1,
  equipmentOverride,
  showProjectLines,
  showSurveyLines = true,
  showTraverse,
  showSightRays,
  showTower,
  showTin,
  showTinWireframe = false,
  showContours = true,
  showGrid = true,
  gridSpacing = 1,
  gridOpacity = 1,
  showEquipment = true,
  showPoints = true,
  showBasemap = false,
  basemapType = 'hybrid',
  basemapOpacity = 0.82,
  verticalExaggeration = 1,
  equipmentScaleMode = 'auto',
  motionMode = 'glide',
  pointLabelMode = 'recent',
  traceColorMode = 'equipment',
  styleSettings = DEFAULT_RAW_REPLAY_STYLE,
  sightRayMode = 'live',
  cameraFollowMode = 'free',
  active3DTool = 'select',
  onActive3DToolChange,
  focusShotSignal = 0,
  projectPoints,
  projectLines,
  tinSurfaces,
  contourGenerations = EMPTY_CONTOUR_GENS,
  contourLabels = EMPTY_CONTOUR_LABELS,
  centerlines = EMPTY_CENTERLINES,
  boundaryFiles = EMPTY_BOUNDARIES,
  hatches = EMPTY_HATCHES,
  rasterUnderlays = EMPTY_UNDERLAYS,
  textAnnotations = EMPTY_TEXT_ANNOTS,
  settings,
  onRequestProjection,
  onAddPoint,
  onAddLine,
  nextAvailablePointNumber = 1000,
  leftRail = false,
}: RawReplaySceneProps) {
  const leftOverlayClass = leftRail ? 'left-56' : 'left-3';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<ArcRotateCamera | null>(null);

  // Persistent Scene Roots (never destroyed on playhead tick!)
  const staticRootRef = useRef<TransformNode | null>(null);
  const basemapRootRef = useRef<TransformNode | null>(null);
  const equipmentRootRef = useRef<TransformNode | null>(null);
  const authoringRootRef = useRef<TransformNode | null>(null);

  // Reusable Equipment Rigs (updated in-place at 60 FPS)
  const tsRigRef = useRef<ArticulatedTotalStationRig | null>(null);
  const prismPoleRigRef = useRef<ArticulatedPrismPoleRig | null>(null);
  const gnssRoverRigRef = useRef<ArticulatedGnssRoverRig | null>(null);
  const gnssBaseRigRef = useRef<ArticulatedGnssBaseRig | null>(null);
  const satelliteSkyRef = useRef<SatelliteSkyRig | null>(null);
  const celestialSkyRef = useRef<CelestialSkyRig | null>(null);
  const baseRigAnchorRef = useRef<Vector3 | null>(null);
  const sunLightRef = useRef<DirectionalLight | null>(null);
  const hemiLightRef = useRef<HemisphericLight | null>(null);
  const rimLightRef = useRef<DirectionalLight | null>(null);
  const shadowGeneratorRef = useRef<ShadowGenerator | null>(null);
  const activeSightRayMeshRef = useRef<Mesh | null>(null);
  const activeSightRayKeyRef = useRef<string>('');
  const activeSightRayStartedAtRef = useRef<number>(0);
  const activeTraceLeadMeshRef = useRef<Mesh | null>(null);
  const progressiveTraceMeshesRef = useRef<Mesh[]>([]);
  const progressiveTraceKeyRef = useRef<string>('');
  const rtkLinkMeshRef = useRef<Mesh | null>(null);
  /** Static simulation layers that honor a post-shot TTL. */
  const timedLayersRef = useRef<Array<{
    mesh: Mesh;
    key: 'project' | 'contours' | 'grid' | 'traverse';
  }>>([]);
  const lastShotAtRef = useRef(0);
  const snapMarkerMeshRef = useRef<Mesh | null>(null);

  // Thin-instance point pools
  const pastPointsRef = useRef<Mesh | null>(null);
  const futurePointsRef = useRef<Mesh | null>(null);
  const traverseGlowMaterialRef = useRef<StandardMaterial | null>(null);
  const traverseCoreMaterialRef = useRef<StandardMaterial | null>(null);
  const tinMeshesRef = useRef<Array<{ mesh: Mesh; minE: number; maxE: number; minN: number; maxN: number }>>([]);
  const basemapTextureRef = useRef<DynamicTexture | null>(null);
  /** Dark fallback ground. Hidden when imagery is draped on a TIN mesh. */
  const groundMeshRef = useRef<Mesh | null>(null);

  const pointWorldRef = useRef<PointWorld[]>([]);
  const snapCandidatesRef = useRef<SnapCandidate3D[]>([]);
  const worldRef = useRef<WorldMapping3D | null>(null);
  const samplerRef = useRef<FastTinSampler | null>(null);

  // Camera control refs
  const cameraViewRef = useRef<((target: Vector3, radius: number, alpha?: number, beta?: number) => void) | null>(null);
  const driveViewRef = useRef<((alpha: number, beta: number) => void) | null>(null);
  const frameCameraRef = useRef<(() => void) | null>(null);
  const toggleOrthoRef = useRef<(() => void) | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const spacePressedRef = useRef(false);
  /**
   * Instrument POV travel, 0..1:
   *  0.0  = camera parked behind the tripod looking over the instrument at the prism pole.
   *  0.55 = camera has slid onto the telescope eyepiece, looking straight down the sight axis.
   *  1.0  = 30x optical magnification through the telescope with the illuminated reticle.
   */
  const instrumentScopeZoomRef = useRef<number>(0.16);
  const instrumentScopeSmoothRef = useRef<number>(0.16);
  /** User zoom multiplier applied to the auto-fit follow distance (0.85 = tight full-pole, 3 = wide). */
  const followZoomFactorRef = useRef(1);
  /** Persistent world-space pan offset from the auto-framed pole anchor. */
  const followPanOffsetRef = useRef(new Vector3(0, 0, 0));
  /** Leashed, softly damped follow focus so playback reads smoothly without drifting. */
  const followTargetSmoothRef = useRef(new Vector3(0, 0, 0));
  const followTargetReadyRef = useRef(false);
  const followRadiusClampRef = useRef({ min: 0.1, max: 150000 });
  const baseRadiusLimitsRef = useRef({ lower: 1, upper: 150000 });
  /** Projection mode to restore when the orthographic scope view is left. */
  const scopeProjectionRef = useRef<number | null>(null);
  const lastScopeHudSyncRef = useRef<number>(0);
  /** Camera mode actually applied this frame (GNSS POV falls back to Follow Pole). */
  const effectiveCameraModeRef = useRef<CameraFollowMode>('free');

  // Live animation refs read inside scene.onBeforeRenderObservable (zero React re-renders needed)
  const liveStateRef = useRef({
    survey,
    playhead,
    playheadProgress,
    equipmentOverride,
    showEquipment,
    showSurveyLines,
    showSightRays,
    sightRayMode,
    equipmentScaleMode,
    motionMode,
    cameraFollowMode,
    pointLabelMode,
    traceColorMode,
    traceGlow: styleSettings.traceGlow,
    traceTail: styleSettings.traceTail,
    traceColor: styleSettings.traceColor,
    traceLineType: styleSettings.traceLineType,
    traceLineWeight: styleSettings.traceLineWeight,
    traceTtl: styleSettings.traceTtl,
    traceEquipmentStyles: styleSettings.traceEquipmentStyles,
    rayColor: styleSettings.rayColor,
    rayLineType: styleSettings.rayLineType,
    rayLineWeight: styleSettings.rayLineWeight,
    rayTtl: styleSettings.rayTtl,
    projectTtl: styleSettings.projectTtl,
    contourTtl: styleSettings.contourTtl,
    gridTtl: styleSettings.gridTtl,
    traverseTtl: styleSettings.traverseTtl,
    labelTtl: styleSettings.labelTtl,
    active3DTool,
  });
  liveStateRef.current = {
    survey,
    playhead,
    playheadProgress,
    equipmentOverride,
    showEquipment,
    showSurveyLines,
    showSightRays,
    sightRayMode,
    equipmentScaleMode,
    motionMode,
    cameraFollowMode,
    pointLabelMode,
    traceColorMode,
    traceGlow: styleSettings.traceGlow,
    traceTail: styleSettings.traceTail,
    traceColor: styleSettings.traceColor,
    traceLineType: styleSettings.traceLineType,
    traceLineWeight: styleSettings.traceLineWeight,
    traceTtl: styleSettings.traceTtl,
    traceEquipmentStyles: styleSettings.traceEquipmentStyles,
    rayColor: styleSettings.rayColor,
    rayLineType: styleSettings.rayLineType,
    rayLineWeight: styleSettings.rayLineWeight,
    rayTtl: styleSettings.rayTtl,
    projectTtl: styleSettings.projectTtl,
    contourTtl: styleSettings.contourTtl,
    gridTtl: styleSettings.gridTtl,
    traverseTtl: styleSettings.traverseTtl,
    labelTtl: styleSettings.labelTtl,
    active3DTool,
  };

  // HTML Label Overlay refs
  const currentLabelRef = useRef<HTMLDivElement | null>(null);
  const setupLabelRef = useRef<HTMLDivElement | null>(null);
  const towerLabelRef = useRef<HTMLDivElement | null>(null);
  const compassDialRef = useRef<HTMLDivElement | null>(null);
  const currentPointRef = useRef<Vector3 | null>(null);
  const currentSetupRef = useRef<Vector3 | null>(null);
  const towerAnchorRef = useRef<Vector3 | null>(null);
  const towerTopPosRef = useRef<Vector3 | null>(null);
  const framedSurveyRef = useRef<string | null>(null);
  const lastInstanceKeyRef = useRef<string>('');

  const [fatalError, setFatalError] = useState<string | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [isOrtho, setIsOrtho] = useState(false);
  const [basemapStatus, setBasemapStatus] = useState<string | null>(null);
  const [scopeHud, setScopeHud] = useState<{
    active: boolean;
    inScope: boolean;
    magnification: number;
    azDeg: number;
    zaDeg: number;
    slopeDist: number;
    horizDist: number;
    hi: number;
    hr: number;
    targetLabel: string;
    equipmentType: 'prism' | 'gnss';
  } | null>(null);
  const [cursorCoords, setCursorCoords] = useState<{ e: number; n: number; z: number; snapLabel?: string } | null>(null);

  /** Apply the file's sun altitude/azimuth to the scene sky, lights and shadows. */
  const applySkyLighting = useCallback((sky: SkyState, scene: Scene) => {
    const altitude = sky.sunAltitudeDeg;
    const daylight = clamp((altitude + 6) / 18, 0, 1);
    const twilight = clamp((altitude + 12) / 16, 0, 1);
    const night = new Color4(0.024, 0.043, 0.067, 1);
    const dusk = new Color4(0.20, 0.17, 0.25, 1);
    const day = new Color4(0.39, 0.61, 0.82, 1);
    scene.clearColor = mixColor4(mixColor4(night, dusk, twilight), day, daylight);

    const az = sky.sunAzimuthDeg * (Math.PI / 180);
    const alt = altitude * (Math.PI / 180);
    const sunDirection = new Vector3(
      -Math.sin(az) * Math.cos(alt),
      -Math.sin(alt),
      -Math.cos(az) * Math.cos(alt),
    ).normalize();

    const sun = sunLightRef.current;
    if (sun) {
      sun.direction = sunDirection;
      sun.intensity = 0.06 + daylight * 1.55;
      // A below-horizon sun still has a direction and would keep rendering a
      // shadow map lit from underneath. At night that projects a large false
      // shadow across the ground; only cast when the sun is actually up.
      sun.shadowEnabled = altitude > 0.5;
      sun.diffuse = Color3.Lerp(new Color3(1, 0.55, 0.32), new Color3(1, 0.98, 0.93), daylight);
      sun.specular = sun.diffuse;
    }
    const hemi = hemiLightRef.current;
    if (hemi) {
      hemi.intensity = 0.20 + daylight * 0.78;
      hemi.diffuse = Color3.Lerp(new Color3(0.36, 0.38, 0.48), new Color3(0.72, 0.84, 1), daylight);
      hemi.groundColor = Color3.Lerp(new Color3(0.07, 0.08, 0.12), new Color3(0.22, 0.26, 0.30), daylight);
    }
    const rim = rimLightRef.current;
    if (rim) rim.intensity = 0.08 + daylight * 0.5;
    const shadow = shadowGeneratorRef.current;
    if (shadow) shadow.darkness = 0.16 + daylight * 0.24;
    scene.ambientColor = Color3.Lerp(new Color3(0.12, 0.14, 0.18), new Color3(0.35, 0.42, 0.48), daylight);
  }, []);
  const [hoverQuickView, setHoverQuickView] = useState<HoverQuickView | null>(null);
  const [skyState, setSkyState] = useState<SkyState | null>(null);
  const [inspectedEntity, setInspectedEntity] = useState<InspectedEntity3D | null>(null);
  const [measureStart, setMeasureStart] = useState<MeasureResult3D['from'] | null>(null);
  const [measureResult, setMeasureResult] = useState<MeasureResult3D | null>(null);
  const [pendingPointDraft, setPendingPointDraft] = useState<{
    easting: number;
    northing: number;
    elevation: number;
    pointNumber: string;
    description: string;
  } | null>(null);
  const [polylineVertices, setPolylineVertices] = useState<Array<{
    easting: number;
    northing: number;
    elevation: number;
    pointNumber?: string;
    worldPos: Vector3;
  }>>([]);
  const hoveredSnapRef = useRef<SnapCandidate3D | null>(null);

  // ── 1. Boot Babylon WebGL2 Engine & Persistent Equipment Rigs ──────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let engine: Engine | null = null;

    try {
      engine = new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
        antialias: true,
        powerPreference: 'high-performance',
      }, true);
    } catch (error) {
      setFatalError(error instanceof Error ? error.message : 'WebGL 2 is not available in this browser.');
      return;
    }

    if (disposed) {
      engine.dispose();
      return;
    }

    const activeEngine = engine;
    const scene = new Scene(activeEngine);
    scene.clearColor = new Color4(0.024, 0.043, 0.067, 1);
    scene.ambientColor = new Color3(0.35, 0.42, 0.48);

    const camera = new ArcRotateCamera(
      'raw-replay-camera',
      -Math.PI / 4,
      0.96,
      140,
      new Vector3(0, 0, 0),
      scene,
    );
    camera.minZ = 0.5;
    camera.maxZ = 50000;
    camera.lowerBetaLimit = BASE_LOWER_BETA_LIMIT;
    camera.upperBetaLimit = BASE_UPPER_BETA_LIMIT;
    camera.lowerRadiusLimit = 1;
    camera.upperRadiusLimit = 150000;
    camera.inertia = 0;
    camera.inputs.clear();

    const hemi = new HemisphericLight('raw-replay-hemi', new Vector3(0.2, 1, 0.15), scene);
    hemi.intensity = 0.86;
    hemi.groundColor = new Color3(0.14, 0.19, 0.25);
    const sun = new DirectionalLight('raw-replay-sun', new Vector3(-0.48, -0.82, 0.36), scene);
    sun.intensity = 1.25;
    sun.diffuse = new Color3(1, 0.98, 0.93);
    sun.specular = new Color3(1, 0.99, 0.96);
    const rim = new DirectionalLight('raw-replay-rim', new Vector3(0.62, -0.42, -0.66), scene);
    rim.intensity = 0.58;
    rim.diffuse = new Color3(0.72, 0.88, 1.0);
    rim.specular = new Color3(0.78, 0.92, 1.0);
    sunLightRef.current = sun;
    hemiLightRef.current = hemi;
    rimLightRef.current = rim;

    // The sun's direction and shadow frustum are driven by the recorded field
    // time below. Keep a real shadow map ready; at night its intensity is low.
    const shadowGenerator = new ShadowGenerator(2048, sun);
    shadowGenerator.useBlurExponentialShadowMap = true;
    shadowGenerator.blurKernel = 16;
    shadowGenerator.darkness = 0.35;
    shadowGenerator.bias = 0.001;
    shadowGenerator.normalBias = 0.02;
    shadowGeneratorRef.current = shadowGenerator;

    const envCube = createSurveyEnvironmentCubeTexture(scene);
    if (envCube) {
      scene.environmentTexture = envCube;
      scene.environmentIntensity = 0.92;
    }

    // Create persistent Equipment Root and Rigs ONCE
    const eqRoot = new TransformNode('raw-replay-equipment-root', scene);
    equipmentRootRef.current = eqRoot;
    tsRigRef.current = createTotalStationRig(scene, eqRoot);
    prismPoleRigRef.current = createSurveyPoleRig(scene, eqRoot);
    gnssRoverRigRef.current = createGnssRoverRig(scene, eqRoot);
    gnssBaseRigRef.current = createGnssBaseRig(scene, eqRoot);
    satelliteSkyRef.current = createSatelliteSkyRig(scene, survey.fileName);

    // Equipment and the base tower cast real sun shadows onto the terrain.
    const registerShadowCasters = (node: TransformNode) => {
      const generator = shadowGeneratorRef.current;
      if (!generator) return;
      node.getChildMeshes().forEach(mesh => {
        mesh.receiveShadows = true;
        generator.addShadowCaster(mesh, true);
      });
    };
    registerShadowCasters(eqRoot);

    const snapMarker = MeshBuilder.CreateTorus('raw-replay-snap-marker', {
      diameter: 1.0,
      thickness: 0.12,
      tessellation: 24,
    }, scene);
    snapMarker.parent = eqRoot;
    const snapMat = createMaterial(scene, 'raw-replay-snap-mat', '#10b981', 0.95);
    snapMat.disableLighting = true;
    snapMarker.material = snapMat;
    snapMarker.isPickable = false;
    snapMarker.setEnabled(false);
    snapMarkerMeshRef.current = snapMarker;

    sceneRef.current = scene;
    cameraRef.current = camera;

    let targetAlpha = camera.alpha;
    let targetBeta = camera.beta;
    let targetRadius = camera.radius;
    let targetTarget = camera.getTarget().clone();

    cameraViewRef.current = (nextTarget, radius, alpha, beta) => {
      targetTarget = nextTarget.clone();
      targetRadius = clamp(radius, camera.lowerRadiusLimit ?? 1, camera.upperRadiusLimit ?? 150000);
      followZoomFactorRef.current = 1;
      followPanOffsetRef.current.setAll(0);
      followTargetReadyRef.current = false;
      if (alpha != null) targetAlpha = alpha;
      if (beta != null) targetBeta = clamp(beta, camera.lowerBetaLimit ?? 0.005, camera.upperBetaLimit ?? 1.56);
    };
    driveViewRef.current = (alpha, beta) => {
      targetAlpha = alpha;
      targetBeta = clamp(beta, camera.lowerBetaLimit ?? 0.005, camera.upperBetaLimit ?? 1.56);
    };

    toggleOrthoRef.current = () => {
      const nextOrtho = camera.mode !== Camera.ORTHOGRAPHIC_CAMERA;
      camera.mode = nextOrtho ? Camera.ORTHOGRAPHIC_CAMERA : Camera.PERSPECTIVE_CAMERA;
      setIsOrtho(nextOrtho);
    };

    const syncOrthoBounds = () => {
      if (camera.mode !== Camera.ORTHOGRAPHIC_CAMERA) return;
      const w = Math.max(1, activeEngine.getRenderWidth());
      const h = Math.max(1, activeEngine.getRenderHeight());
      const aspect = w / h;
      const halfH = Math.max(1, camera.radius * Math.tan(camera.fov / 2));
      const halfW = halfH * aspect;
      camera.orthoTop = halfH;
      camera.orthoBottom = -halfH;
      camera.orthoLeft = -halfW;
      camera.orthoRight = halfW;
    };

    // 60 FPS Camera Damping, Equipment Animation, Follow Modes, Scope Lens & Label Projection
    scene.onBeforeRenderObservable.add(() => {
      const dt = Math.min(64, activeEngine.getDeltaTime());
      const ease = 1 - Math.exp(-dt / 42);
      const state = liveStateRef.current;
      const mapping = worldRef.current;

      // Post-shot TTLs for static simulation layers. Defaults are 0 (persist),
      // so this never changes the normal drawing view unless the user opts in.
      const secondsSinceShot = (performance.now() - lastShotAtRef.current) / 1000;
      const ttlByLayer: Record<'project' | 'contours' | 'grid' | 'traverse', number> = {
        project: state.projectTtl,
        contours: state.contourTtl,
        grid: state.gridTtl,
        traverse: state.traverseTtl,
      };
      timedLayersRef.current.forEach(({ mesh, key }) => {
        const ttl = ttlByLayer[key];
        const alive = ttl <= 0 || secondsSinceShot <= ttl;
        mesh.setEnabled(alive);
        mesh.visibility = alive && ttl > 0
          ? clamp(1 - (secondsSinceShot - ttl) / 0.35, 0, 1)
          : 1;
      });
      const sampler = samplerRef.current;
      const projectUnitsPerMeter = state.survey.job.units === 'meter' ? 1 : 3.28084;

      // Update Articulated Equipment Rigs in-place at 60 FPS
      const observations = state.survey.observations;
      const obsCount = observations.length;
      const idx = clamp(state.playhead, 0, Math.max(0, obsCount - 1));
      const obs = observations[idx];
      const prevObs = idx > 0 ? observations[idx - 1] : undefined;
      const setup = obs ? state.survey.setups.find(s => s.id === obs.setupId) : undefined;
      const equipment: EquipmentKind = state.equipmentOverride === 'auto'
        ? (setup?.equipment ?? 'unknown')
        : state.equipmentOverride;

      // ── Live survey trace: strictly past shots, never pre-rendered ahead of the pole.
      const traceWorld = pointWorldRef.current;
      if (!state.showSurveyLines || traceWorld.length < 2 || !mapping || !obs) {
        progressiveTraceMeshesRef.current.forEach(mesh => mesh.setEnabled(false));
      } else {
        const traceKey = [
          state.survey.fileName,
          state.survey.parsedAt,
          idx,
          state.traceColorMode,
          state.traceColor,
          JSON.stringify(state.traceEquipmentStyles),
          state.traceLineType,
          state.traceLineWeight.toFixed(2),
          state.traceTtl.toFixed(2),
          state.traceGlow.toFixed(2),
          state.traceTail,
          mapping.originE.toFixed(2),
          mapping.originN.toFixed(2),
          mapping.span.toFixed(2),
          mapping.verticalExaggeration,
        ].join('|');
        if (progressiveTraceKeyRef.current !== traceKey) {
          progressiveTraceKeyRef.current = traceKey;
          progressiveTraceMeshesRef.current.forEach(mesh => mesh.dispose());
          progressiveTraceMeshesRef.current = [];

          const currentSequence = obs.sequence;
          const past = traceWorld.filter(point => point.observation.sequence < currentSequence);
          const maxTailSegments = Math.max(1, Math.round(state.traceTail));
          const start = Math.max(1, past.length - maxTailSegments);
          const traceGroups = new Map<string, { style: RawReplayTraceEquipmentStyle; sources: StyledLineSource[] }>();
          const setupOrder = new Map(state.survey.setups.map((setupItem, order) => [setupItem.id, order]));
          const setupMap = new Map(state.survey.setups.map(setupItem => [setupItem.id, setupItem]));
          const traceAlpha = clamp(0.18 + state.traceGlow * 0.72, 0.1, 1);

          for (let i = start; i < past.length; i++) {
            const prevPoint = past[i - 1];
            const currPoint = past[i];
            if (!prevPoint || !currPoint) continue;
            if (state.traceTtl > 0 && observationAgeSeconds(obs, currPoint.observation) > state.traceTtl) continue;
            if (Vector3.Distance(prevPoint.position, currPoint.position) < mapping.span * 0.00003) continue;

            const setupItem = setupMap.get(currPoint.observation.setupId);
            const equipment = setupItem?.equipment ?? 'unknown';
            const style = state.traceColorMode === 'equipment'
              ? traceEquipmentStyleFor(state.traceEquipmentStyles, equipment)
              : {
                  color: state.traceColor,
                  lineType: state.traceLineType,
                  lineWeight: state.traceLineWeight,
                };
            const groupKey = state.traceColorMode === 'equipment' ? equipment : 'all';
            const group = traceGroups.get(groupKey) ?? { style, sources: [] as StyledLineSource[] };
            group.sources.push({
              points: [
                prevPoint.position.add(new Vector3(0, 0.12, 0)),
                currPoint.position.add(new Vector3(0, 0.12, 0)),
              ],
              color: traceColorFor(
                state.traceColorMode,
                currPoint.observation,
                equipment,
                setupOrder.get(currPoint.observation.setupId) ?? 0,
                state.traceColor,
                state.traceEquipmentStyles,
                mapping,
              ),
            });
            traceGroups.set(groupKey, group);
          }

          if (equipmentRootRef.current) {
            traceGroups.forEach((group, groupKey) => {
              if (group.sources.length === 0) return;
              const liveTrace = createStyledLineMesh(scene, `raw-replay-live-survey-trace-${groupKey}`, group.sources, {
                alpha: traceAlpha,
                lineType: group.style.lineType,
                lineWeight: group.style.lineWeight,
                dashUnit: Math.max(0.15, mapping.span * 0.0035),
                renderingGroupId: 1,
              });
              if (liveTrace) {
                liveTrace.parent = equipmentRootRef.current;
                progressiveTraceMeshesRef.current.push(liveTrace);
              }
            });
          }
        }
        progressiveTraceMeshesRef.current.forEach(mesh => mesh.setEnabled(true));
      }

      const tsRig = tsRigRef.current;
      const prismRig = prismPoleRigRef.current;
      const gnssRig = gnssRoverRigRef.current;

      if (!mapping || !obs || obs.easting == null || obs.northing == null || !state.showEquipment) {
        tsRig?.root.setEnabled(false);
        prismRig?.root.setEnabled(false);
        gnssRig?.root.setEnabled(false);
        gnssBaseRigRef.current?.root.setEnabled(false);
        satelliteSkyRef.current?.setEnabled(false);
        activeSightRayMeshRef.current?.setEnabled(false);
        activeSightRayKeyRef.current = '';
        activeSightRayStartedAtRef.current = 0;
        activeTraceLeadMeshRef.current?.setEnabled(false);
        rtkLinkMeshRef.current?.setEnabled(false);
        currentPointRef.current = null;
        currentSetupRef.current = null;
        camera.fov = 0.8;
        if (performance.now() - lastScopeHudSyncRef.current > 180) {
          lastScopeHudSyncRef.current = performance.now();
          setScopeHud(prev => (prev ? null : prev));
        }
      } else {
        const zCurr = sampler
          ? sampler.resolveElevation(obs.elevation, obs.easting, obs.northing, 0)
          : (obs.elevation ?? mapping.originZ);
        const targetShotPos = mapping.toWorld(obs.easting, obs.northing, zCurr);

        let interpShotPos = targetShotPos;
        let fromPos: Vector3 | null = null;
        const t = clamp(state.playheadProgress, 0, 1);
        if (prevObs && prevObs.easting != null && prevObs.northing != null) {
          const zPrev = sampler
            ? sampler.resolveElevation(prevObs.elevation, prevObs.easting, prevObs.northing, 0)
            : (prevObs.elevation ?? mapping.originZ);
          fromPos = mapping.toWorld(prevObs.easting, prevObs.northing, zPrev);
          if (state.motionMode === 'glide' && t < 0.999 && prevObs.setupId === obs.setupId) {
            const smoothT = t * t * (3 - 2 * t);
            interpShotPos = Vector3.Lerp(fromPos, targetShotPos, smoothT);
            const stepDist = Vector3.Distance(fromPos, targetShotPos);
            const arcLift = Math.min(mapping.span * 0.014, stepDist * 0.15) * Math.sin(smoothT * Math.PI);
            interpShotPos.y += arcLift;
          }
        }

        const rodHeight = resolveHeight(
          obs.rodHeight ?? setup?.rodHeight,
          state.survey.job.units,
          'rod',
          defaultRodHeight(state.survey),
        );
        const instrumentHeight = resolveHeight(
          setup?.instrumentHeight,
          state.survey.job.units,
          'instrument',
          defaultInstrumentHeight(state.survey),
        );

        const isReflectorless = obs.reflectorless === true;
        const isGnss = !isReflectorless && (equipment === 'gnss-rover' || equipment === 'gnss-base' || (equipment === 'unknown' && obs.kind === 'gps') || obs.gnss != null);
        // GNSS is always a base + rover session. Instrument POV falls back to Follow
        // Pole so a total station is never drawn for a GNSS unit.
        const cameraMode = isGnss && state.cameraFollowMode === 'instrument-pov' ? 'follow-shot' : state.cameraFollowMode;
        effectiveCameraModeRef.current = cameraMode;

        // Instrument POV optical travel, smoothed so the wheel feels like a fluid dolly.
        const isInstrumentPov = cameraMode === 'instrument-pov';
        instrumentScopeSmoothRef.current += (clamp(instrumentScopeZoomRef.current, 0, 1) - instrumentScopeSmoothRef.current)
          * (1 - Math.exp(-dt / 90));
        const povZoom = clamp(instrumentScopeSmoothRef.current, 0, 1);
        const inScopeLens = isInstrumentPov && povZoom >= 0.55;
        // Through the eyepiece, hide the instrument so the view is just the
        // prism, pole, and data collector. In the world views the station stays.
        const hideInstrument = inScopeLens;

        // Equipment scale multiplier. Auto scale depends on the site extent only — never on
        // camera distance, which used to resize the rig (and move the orbit focus) mid-zoom.
        let scaleMult = 1;
        if (state.equipmentScaleMode === '2x') scaleMult = 2;
        else if (state.equipmentScaleMode === '4x') scaleMult = 4;
        else if (state.equipmentScaleMode === '8x') scaleMult = 8;
        else if (state.equipmentScaleMode === '12x') scaleMult = 12;
        else if (state.equipmentScaleMode === 'auto') {
          if (isInstrumentPov) {
            // Optical simulation is always modelled 1:1 so the tripod, telescope and reticle read true.
            scaleMult = 1;
          } else {
            const desiredPoleHeight = clamp(
              Math.max(rodHeight * 2.4, mapping.span * 0.045),
              rodHeight * 2.4,
              Math.max(rodHeight * 3.2, mapping.span * 0.16),
            );
            scaleMult = clamp(desiredPoleHeight / Math.max(1, rodHeight), 2.4, 24);
          }
        }

        // Resolve instrument setup position (with fallback station for point-dump or GNSS files so Instrument POV always works)
        let setupPos: Vector3 | null = null;
        if (setup?.easting != null && setup.northing != null) {
          setupPos = mapping.toWorld(
            setup.easting,
            setup.northing,
            sampler
              ? sampler.resolveElevation(setup.elevation, setup.easting, setup.northing, 0)
              : (setup.elevation ?? mapping.originZ),
          );
        } else if (isInstrumentPov || equipment === 'total-station') {
          const firstCoordObs = observations.find(o => o.easting != null && o.northing != null);
          // No recorded setup coordinates. Stand the fallback instrument off the
          // pole by at least a plumb sight: dropping it on the first observation
          // made the tripod look like it belonged to the prism pole, and put the
          // telescope camera inside the pole once the instrument was hidden.
          const standOff = Math.max(mapping.span * 0.12, Math.max(1, rodHeight) * 12);
          if (firstCoordObs) {
            const fZ = sampler
              ? sampler.resolveElevation(firstCoordObs.elevation, firstCoordObs.easting!, firstCoordObs.northing!, 0)
              : (firstCoordObs.elevation ?? mapping.originZ);
            const anchor = mapping.toWorld(firstCoordObs.easting!, firstCoordObs.northing!, fZ);
            setupPos = Vector3.Distance(anchor, interpShotPos) < standOff
              ? anchor.add(new Vector3(-standOff, 0, -standOff))
              : anchor;
          } else {
            setupPos = new Vector3(-mapping.span * 0.12, 0, -mapping.span * 0.12);
          }
        }

        // GNSS and reflectorless flags were resolved before camera-mode selection.
        const pulsePhase = state.playheadProgress < 1
          ? state.playheadProgress
          : ((performance.now() * 0.0014) % 1);

        const effRod = rodHeight * scaleMult;
        // Reflectorless shots hit the measured surface directly: no prism pole, and
        // the instrument aims at the hit point itself.
        let activeTargetHeadPos = isReflectorless
          ? interpShotPos.clone()
          : interpShotPos.add(new Vector3(0, effRod, 0));
        let instrumentOpticalCenter: Vector3 | null = null;

        if (isGnss) {
          tsRig?.root.setEnabled(false);
          prismRig?.root.setEnabled(false);
          if (gnssRig) {
            gnssRig.root.setEnabled(true);
            activeTargetHeadPos = gnssRig.updatePose(
              interpShotPos,
              rodHeight,
              scaleMult,
              obs.gnss?.quality ?? setup?.gnssQuality,
              pulsePhase,
              projectUnitsPerMeter,
            );
          }
          currentSetupRef.current = null;
          activeSightRayMeshRef.current?.setEnabled(false);
          activeSightRayKeyRef.current = '';
          activeSightRayStartedAtRef.current = 0;

          const baseRig = gnssBaseRigRef.current;
          if (baseRig && baseRigAnchorRef.current) {
            const baseTop = baseRig.updatePose(baseRigAnchorRef.current, scaleMult, projectUnitsPerMeter);
            baseRig.root.setEnabled(state.showEquipment);
            towerTopPosRef.current = baseTop;
            towerAnchorRef.current = baseTop;
          } else {
            baseRig?.root.setEnabled(false);
          }

          const satelliteCount = obs.gnss?.satellites ?? setup?.satellites ?? 0;
          satelliteSkyRef.current?.update(activeTargetHeadPos, satelliteCount, mapping.span, obs.id);
          satelliteSkyRef.current?.setEnabled(satelliteCount > 0);

          // Update RTK correction link from Base Tower to GNSS Rover dome — dashed red.
          if (towerTopPosRef.current && state.showSightRays && state.sightRayMode !== 'off') {
            const fromTower = towerTopPosRef.current;
            const mid = Vector3.Lerp(fromTower, activeTargetHeadPos, 0.5);
            mid.y += Math.max(14, Vector3.Distance(fromTower, activeTargetHeadPos) * 0.085);
            const curvePts: Vector3[] = [];
            const segs = 18;
            for (let i = 0; i <= segs; i++) {
              const u = i / segs;
              const omu = 1 - u;
              curvePts.push(new Vector3(
                omu * omu * fromTower.x + 2 * omu * u * mid.x + u * u * activeTargetHeadPos.x,
                omu * omu * fromTower.y + 2 * omu * u * mid.y + u * u * activeTargetHeadPos.y,
                omu * omu * fromTower.z + 2 * omu * u * mid.z + u * u * activeTargetHeadPos.z,
              ));
            }
            if (rtkLinkMeshRef.current) {
              rtkLinkMeshRef.current.dispose();
            }
            const rtkMesh = MeshBuilder.CreateDashedLines('raw-replay-rtk-link', {
              points: curvePts,
              dashSize: 2.4,
              gapSize: 1.5,
              dashNb: 30,
            }, scene);
            rtkMesh.parent = equipmentRootRef.current;
            rtkMesh.color = Color3.FromHexString('#ef4444');
            rtkMesh.alpha = 0.95;
            rtkMesh.isPickable = false;
            rtkMesh.renderingGroupId = 2;
            rtkLinkMeshRef.current = rtkMesh;
          } else if (rtkLinkMeshRef.current) {
            rtkLinkMeshRef.current.setEnabled(false);
          }
        } else {
          // Total station + prism pole. Never reached for a GNSS observation.
          gnssBaseRigRef.current?.root.setEnabled(false);
          satelliteSkyRef.current?.setEnabled(false);
          if (rtkLinkMeshRef.current) rtkLinkMeshRef.current.setEnabled(false);

          if (setupPos && tsRig) {
            tsRig.root.setEnabled(true);
            const pose = tsRig.updatePose(
              setupPos,
              instrumentHeight,
              scaleMult,
              activeTargetHeadPos,
              hideInstrument,
              projectUnitsPerMeter,
            );
            instrumentOpticalCenter = pose.opticalCenter;
            currentSetupRef.current = instrumentOpticalCenter.add(
              new Vector3(0, 0.45 * scaleMult * projectUnitsPerMeter, 0),
            );
          } else {
            tsRig?.root.setEnabled(false);
            currentSetupRef.current = null;
          }

          if (isReflectorless) {
            prismRig?.root.setEnabled(false);
            gnssRig?.root.setEnabled(false);
          } else if (isGnss) {
            prismRig?.root.setEnabled(false);
            if (gnssRig) {
              gnssRig.root.setEnabled(true);
              activeTargetHeadPos = gnssRig.updatePose(
                interpShotPos,
                rodHeight,
                scaleMult,
                obs.gnss?.quality ?? setup?.gnssQuality,
                pulsePhase,
                projectUnitsPerMeter,
              );
            }
          } else {
            gnssRig?.root.setEnabled(false);
            if (prismRig) {
              prismRig.root.setEnabled(true);
              activeTargetHeadPos = prismRig.updatePose(
                interpShotPos,
                rodHeight,
                scaleMult,
                instrumentOpticalCenter,
                pulsePhase,
                projectUnitsPerMeter,
              );
            }
          }

          // Re-aim Total Station to exact updated target head center
          if (setupPos && tsRig && instrumentOpticalCenter) {
            const pose = tsRig.updatePose(
              setupPos,
              instrumentHeight,
              scaleMult,
              activeTargetHeadPos,
              hideInstrument,
              projectUnitsPerMeter,
            );
            instrumentOpticalCenter = pose.opticalCenter;
          }

          // Sight rays are a live laser, never a historical fan. Each new shot
          // re-fires the beam, which fades out after the configured TTL.
          const rayEnabled = isReflectorless || (state.showSightRays && state.sightRayMode !== 'off');
          const rayKey = `${obs.id}:${isReflectorless ? 'reflectorless' : 'prism'}`;
          if (!rayEnabled) {
            activeSightRayKeyRef.current = '';
            activeSightRayStartedAtRef.current = 0;
            if (activeSightRayMeshRef.current) activeSightRayMeshRef.current.setEnabled(false);
          } else {
            if (activeSightRayKeyRef.current !== rayKey) {
              activeSightRayKeyRef.current = rayKey;
              activeSightRayStartedAtRef.current = performance.now();
            }
            const rayTtlMs = Math.max(200, state.rayTtl * 1000);
            const rayLife = clamp(1 - (performance.now() - activeSightRayStartedAtRef.current) / rayTtlMs, 0, 1);
            if (instrumentOpticalCenter && rayLife > 0.01) {
              if (activeSightRayMeshRef.current) {
                activeSightRayMeshRef.current.dispose();
              }
              const rayColor = isReflectorless ? new Color3(0.94, 0.27, 0.27) : toColor(state.rayColor, '#38bdf8');
              const ray = createStyledLineMesh(scene, 'raw-replay-active-sight-ray', [
                { points: [instrumentOpticalCenter, activeTargetHeadPos], color: rayColor },
              ], {
                alpha: (isReflectorless ? 1 : inScopeLens ? 0.35 : 0.92) * rayLife,
                lineType: state.rayLineType,
                lineWeight: state.rayLineWeight,
                dashUnit: Math.max(0.12, mapping.span * 0.003),
                renderingGroupId: 2,
              });
              if (ray) {
                ray.parent = equipmentRootRef.current;
                activeSightRayMeshRef.current = ray;
              }
            } else if (activeSightRayMeshRef.current) {
              activeSightRayMeshRef.current.setEnabled(false);
            }
          }
        }

        // Update live leading survey trace segment from previous shot to the gliding pole tip
        if (fromPos && state.showSurveyLines && Vector3.Distance(fromPos, interpShotPos) > 1e-3) {
          if (activeTraceLeadMeshRef.current) {
            activeTraceLeadMeshRef.current.dispose();
          }
          const currentEquipment = setup?.equipment ?? 'unknown';
          const currentSetupIndex = setup
            ? Math.max(0, state.survey.setups.findIndex(item => item.id === setup.id))
            : 0;
          const leadStyle = state.traceColorMode === 'equipment'
            ? traceEquipmentStyleFor(state.traceEquipmentStyles, currentEquipment)
            : {
                color: state.traceColor,
                lineType: state.traceLineType,
                lineWeight: state.traceLineWeight,
              };
          const leadLine = createStyledLineMesh(scene, 'raw-replay-active-trace-lead', [
            {
              points: [
                fromPos.add(new Vector3(0, 0.14, 0)),
                interpShotPos.add(new Vector3(0, 0.14, 0)),
              ],
              color: traceColorFor(
                state.traceColorMode,
                obs,
                currentEquipment,
                currentSetupIndex,
                state.traceColor,
                state.traceEquipmentStyles,
                mapping,
              ),
            },
          ], {
            alpha: 0.95,
            lineType: leadStyle.lineType,
            lineWeight: leadStyle.lineWeight,
            dashUnit: Math.max(0.12, mapping.span * 0.003),
            renderingGroupId: 2,
          });
          if (leadLine) {
            leadLine.parent = equipmentRootRef.current;
            activeTraceLeadMeshRef.current = leadLine;
          }
        } else if (activeTraceLeadMeshRef.current) {
          activeTraceLeadMeshRef.current.setEnabled(false);
        }

        currentPointRef.current = activeTargetHeadPos.add(
          new Vector3(0, 0.28 * scaleMult * projectUnitsPerMeter, 0),
        );

        // ── Camera Follow, Orbit-Around-Pole & Instrument Scope Lens Logic ────
        // Follow Pole pivots on a tip-anchored framing point and auto-fits the whole pole.
        if (cameraMode === 'follow-shot') {
          camera.fov = 0.8;
          camera.minZ = 0.05;
          camera.lowerRadiusLimit = 0.05;
          camera.upperRadiusLimit = 1_000_000;
          camera.lowerBetaLimit = BASE_LOWER_BETA_LIMIT;
          camera.upperBetaLimit = BASE_UPPER_BETA_LIMIT;

          // Distance follow rule: frame the whole pole, from the ground contact at the
          // tip to the prism / GNSS head, and keep that framing as the pole moves. The
          // radius is derived only from pole height so it cannot drift with setup height.
          const poleTip = interpShotPos;
          const poleHeight = Math.max(0.5, activeTargetHeadPos.y - poleTip.y);
          const fitRadius = Math.max(poleHeight * 2.15, 4);
          const zoomFactor = clamp(followZoomFactorRef.current, FOLLOW_MIN_ZOOM, FOLLOW_MAX_ZOOM);
          const minRadius = fitRadius * FOLLOW_MIN_ZOOM;
          const maxRadius = fitRadius * FOLLOW_MAX_ZOOM;
          const desiredRadius = clamp(fitRadius * zoomFactor, minRadius, maxRadius);
          followRadiusClampRef.current.min = minRadius;
          followRadiusClampRef.current.max = maxRadius;

          targetRadius += (desiredRadius - targetRadius) * (1 - Math.exp(-dt / 110));
          targetRadius = clamp(targetRadius, minRadius, maxRadius);

          // Aim low on the pole so the tip stays in the lower frame and the head sits
          // near the top, then add the user's persistent pan offset. Vertical pan is
          // bounded by the framing budget so the tip and head stay on screen.
          const pan = followPanOffsetRef.current;
          const frameHalf = desiredRadius * Math.tan(0.4) * 0.94;
          pan.x = clamp(pan.x, -poleHeight * 0.32, poleHeight * 0.32);
          pan.z = clamp(pan.z, -poleHeight * 0.32, poleHeight * 0.32);
          const lowerPan = Math.max(-poleHeight * 0.3, -(frameHalf - poleHeight * 0.68));
          const upperPan = Math.min(poleHeight * 0.35, frameHalf - poleHeight * 0.32);
          pan.y = lowerPan <= upperPan ? clamp(pan.y, lowerPan, upperPan) : 0;
          const poleFocus = poleTip
            .add(new Vector3(0, poleHeight * 0.32, 0))
            .add(pan);

          // Softly chase the pole with a hard leash so playback feels fluid but the
          // camera never lets the pole drift away.
          const followSmooth = followTargetSmoothRef.current;
          if (!followTargetReadyRef.current) {
            followSmooth.copyFrom(poleFocus);
            followTargetReadyRef.current = true;
          } else {
            Vector3.LerpToRef(followSmooth, poleFocus, 1 - Math.exp(-dt / 70), followSmooth);
            const lag = followSmooth.subtract(poleFocus);
            const lagDist = lag.length();
            const maxLag = Math.max(0.25, poleHeight * 0.12);
            if (lagDist > maxLag) {
              followSmooth.copyFrom(poleFocus.add(lag.scale(maxLag / lagDist)));
            }
          }
          targetTarget.copyFrom(followSmooth);

          if (performance.now() - lastScopeHudSyncRef.current > 180) {
            lastScopeHudSyncRef.current = performance.now();
            setScopeHud(prev => (prev ? null : prev));
          }
        } else if (cameraMode === 'instrument-pov' && instrumentOpticalCenter) {
          // The camera is mounted on the instrument: parked behind the tripod at wide
          // zoom, then sliding exactly onto the optical centre at the eyepiece.
          camera.lowerRadiusLimit = 0.05;
          camera.upperRadiusLimit = 1_000_000;
          camera.minZ = 0.05;
          // A scope must be able to look level or down at the prism, unlike the
          // above-ground orbit limits used by the free CAD camera.
          camera.lowerBetaLimit = 0.02;
          camera.upperBetaLimit = Math.PI - 0.02;

          const sightVec = activeTargetHeadPos.subtract(instrumentOpticalCenter);
          const sightDist = Math.max(1, sightVec.length());
          const sightDir = sightVec.scale(1 / sightDist);
          const horizDist = Math.hypot(sightVec.x, sightVec.z);
          const dolly = 1 - smoothStep(0, 0.55, povZoom);
          // Pull well back behind the tripod at full wide so the whole instrument
          // on its legs is framed, while the sight line still lands on the pole.
          // Stay on the gun's vertical sight plane and only lift a little to clear
          // the eyepiece: the lens, barrel, and prism read as one line. The lift
          // also fades to zero as the camera reaches the eyepiece.
          const behindDist = 2.75 * scaleMult * projectUnitsPerMeter;
          const behindLift = 0.14 * scaleMult * projectUnitsPerMeter;
          const povCameraPos = instrumentOpticalCenter
            .subtract(sightDir.scale(behindDist * Math.pow(dolly, 1.35)))
            .add(new Vector3(0, behindLift * dolly, 0));

          // Always look perfectly straight at the prism / GNSS head; orbit input is ignored.
          targetTarget.copyFrom(activeTargetHeadPos);
          const targetToCamera = povCameraPos.subtract(targetTarget);
          const cameraDist = Math.max(0.05, targetToCamera.length());
          targetRadius = cameraDist;
          targetAlpha = Math.atan2(targetToCamera.z, targetToCamera.x);
          targetBeta = clamp(
            Math.acos(clamp(targetToCamera.y / cameraDist, -0.999, 0.999)),
            0.02,
            Math.PI - 0.02,
          );

          // Optical magnification runs from 1x at the eyepiece to 30x at the stop.
          const mag = Math.exp(Math.log(30) * smoothStep(0.55, 1, povZoom));
          const scopeFov = 2 * Math.atan(Math.tan(0.52 / 2) / mag);
          const lensBlend = smoothStep(0.32, 0.55, povZoom);
          const desiredFov = 0.98 + (scopeFov - 0.98) * lensBlend;
          if (inScopeLens) {
            // Reticle mode is a true orthographic sight line down the barrel.
            camera.fov = desiredFov;
          } else {
            camera.fov += (desiredFov - camera.fov) * (1 - Math.exp(-dt / 55));
          }

          // Throttled update of Scope Reticle HUD telemetry
          const now = performance.now();
          if (now - lastScopeHudSyncRef.current > 90) {
            lastScopeHudSyncRef.current = now;
            const azDeg = ((Math.atan2(sightVec.x, sightVec.z) * 180) / Math.PI + 360) % 360;
            const zaDeg = 90 - (Math.atan2(sightVec.y, Math.max(1e-4, horizDist)) * 180) / Math.PI;
            const trueHorizDist = obs.horizontalDistance ?? (setup?.easting != null && setup.northing != null
              ? Math.hypot(obs.easting - setup.easting, obs.northing - setup.northing)
              : horizDist);
            const trueSlopeDist = obs.slopeDistance ?? trueHorizDist;
            const ptLabel = obs.pointNumber ? `PN ${obs.pointNumber}` : `Shot #${obs.sequence}`;
            setScopeHud({
              active: true,
              inScope: povZoom >= 0.55,
              magnification: Number(mag.toFixed(1)),
              azDeg,
              zaDeg,
              slopeDist: trueSlopeDist,
              horizDist: trueHorizDist,
              hi: instrumentHeight,
              hr: rodHeight,
              targetLabel: `${ptLabel}${obs.description ? ` · ${obs.description}` : ''}`,
              equipmentType: isGnss ? 'gnss' : 'prism',
            });
          }
        } else {
          camera.fov = 0.8;
          camera.lowerRadiusLimit = baseRadiusLimitsRef.current.lower;
          camera.upperRadiusLimit = baseRadiusLimitsRef.current.upper;
          camera.minZ = Math.max(0.25, mapping.span * 0.0005);
          camera.lowerBetaLimit = BASE_LOWER_BETA_LIMIT;
          camera.upperBetaLimit = BASE_UPPER_BETA_LIMIT;
          if (performance.now() - lastScopeHudSyncRef.current > 180) {
            lastScopeHudSyncRef.current = performance.now();
            setScopeHud(prev => (prev ? null : prev));
          }
        }
      }

      // Effective camera mode: GNSS POV requests were already mapped to Follow Pole.
      const tracking = effectiveCameraModeRef.current;
      const lensActive = tracking === 'instrument-pov' && instrumentScopeSmoothRef.current >= 0.55;
      const poseEase = lensActive
        ? 1
        : tracking === 'instrument-pov'
          ? 1 - Math.exp(-dt / 22)
          : tracking === 'follow-shot'
            ? 1 - Math.exp(-dt / 40)
            : ease;
      camera.alpha += shortestAngle(targetAlpha - camera.alpha) * poseEase;
      camera.beta += (targetBeta - camera.beta) * poseEase;
      camera.radius += (targetRadius - camera.radius) * poseEase;
      if (tracking === 'follow-shot') {
        camera.radius = clamp(
          camera.radius,
          followRadiusClampRef.current.min,
          followRadiusClampRef.current.max,
        );
      }
      const nextTarget = tracking === 'instrument-pov' || tracking === 'follow-shot'
        ? targetTarget.clone()
        : Vector3.Lerp(camera.getTarget(), targetTarget, ease);
      // Preserve the alpha/beta/radius we just computed. Without cloneAlphaBetaRadius,
      // Babylon rebuilds the orbit from the previous camera position on every target
      // move, which makes Follow Pole lose its distance and the scope pose drift.
      camera.setTarget(nextTarget, false, false, true);

      // Reticle mode forces an orthographic camera looking straight down the barrel;
      // leaving it restores whatever projection the user had before.
      if (lensActive) {
        if (scopeProjectionRef.current == null) scopeProjectionRef.current = camera.mode;
        if (camera.mode !== Camera.ORTHOGRAPHIC_CAMERA) {
          camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
          setIsOrtho(true);
        }
      } else if (scopeProjectionRef.current != null) {
        const restoreMode = scopeProjectionRef.current;
        scopeProjectionRef.current = null;
        camera.mode = restoreMode;
        setIsOrtho(restoreMode === Camera.ORTHOGRAPHIC_CAMERA);
      }
      syncOrthoBounds();

      // Rotate compass dial needle in top-right gizmo
      if (compassDialRef.current) {
        const northDeg = ((camera.alpha + Math.PI / 2) * 180) / Math.PI;
        compassDialRef.current.style.transform = `rotate(${northDeg.toFixed(1)}deg)`;
      }
    });

    const updateLabels = () => {
      const renderWidth = Math.max(1, activeEngine.getRenderWidth());
      const renderHeight = Math.max(1, activeEngine.getRenderHeight());
      const scaleX = canvas.clientWidth / renderWidth;
      const scaleY = canvas.clientHeight / renderHeight;
      const project = (position: Vector3) => {
        const viewport = camera.viewport.toGlobal(renderWidth, renderHeight);
        return Vector3.Project(position, Matrix.Identity(), scene.getTransformMatrix(), viewport);
      };
      const inLens = liveStateRef.current.cameraFollowMode === 'instrument-pov' && instrumentScopeSmoothRef.current >= 0.55;
      const labelTtl = liveStateRef.current.labelTtl;
      const labelExpired = labelTtl > 0
        && (performance.now() - lastShotAtRef.current) / 1000 > labelTtl;
      const place = (element: HTMLDivElement | null, position: Vector3 | null, hideInScope = false) => {
        if (!element) return;
        if (!position || labelExpired || liveStateRef.current.pointLabelMode === 'off' || (hideInScope && inLens)) {
          element.style.display = 'none';
          return;
        }
        const point = project(position);
        const x = point.x * scaleX;
        const y = point.y * scaleY;
        const visible = point.z > 0 && point.z < 1
          && Number.isFinite(x) && Number.isFinite(y)
          && x > 48 && x < canvas.clientWidth - 48
          && y > 32 && y < canvas.clientHeight - 28;
        element.style.display = visible ? 'block' : 'none';
        element.style.transform = `translate(-50%, -135%) translate(${x}px, ${y}px)`;
      };
      place(currentLabelRef.current, currentPointRef.current, false);
      place(setupLabelRef.current, currentSetupRef.current, true);
      place(towerLabelRef.current, towerAnchorRef.current, false);
    };
    scene.onAfterRenderObservable.add(updateLabels);

    // Helper to raycast 3D world point or ground plane under screen coordinates
    const pickWorldPoint = (screenX: number, screenY: number): Vector3 | null => {
      const pick = scene.pick(screenX, screenY, mesh => mesh.isPickable && mesh.isVisible);
      if (pick?.hit && pick.pickedPoint) {
        return pick.pickedPoint.clone();
      }
      const ray = scene.createPickingRay(screenX, screenY, Matrix.Identity(), camera);
      const horizPlane = Plane.FromPositionAndNormal(new Vector3(0, targetTarget.y, 0), Vector3.Up());
      const dist = ray.intersectsPlane(horizPlane);
      if (dist != null && dist > 0 && dist < 500000) {
        return ray.origin.add(ray.direction.scale(dist));
      }
      return null;
    };

    // Helper to find nearest 3D snap candidate in screen space
    const findSnapCandidate = (screenX: number, screenY: number): SnapCandidate3D | null => {
      const candidates = snapCandidatesRef.current;
      if (candidates.length === 0) return null;
      const renderWidth = Math.max(1, activeEngine.getRenderWidth());
      const renderHeight = Math.max(1, activeEngine.getRenderHeight());
      const scaleX = canvas.clientWidth / renderWidth;
      const scaleY = canvas.clientHeight / renderHeight;
      const viewport = camera.viewport.toGlobal(renderWidth, renderHeight);
      const transformMatrix = scene.getTransformMatrix();

      let best: SnapCandidate3D | null = null;
      let bestDistSq = 18 * 18; // 18px snap radius
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        const proj = Vector3.Project(c.worldPos, Matrix.Identity(), transformMatrix, viewport);
        if (proj.z <= 0 || proj.z >= 1) continue;
        const sx = proj.x * scaleX;
        const sy = proj.y * scaleY;
        const dSq = (sx - screenX) * (sx - screenX) + (sy - screenY) * (sy - screenY);
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          best = c;
        }
      }
      return best;
    };

    const onPointerDown = (event: PointerEvent) => {
      setHoverQuickView(null);
      const tool = liveStateRef.current.active3DTool;
      const pan =
        (event.button === 1 && !event.shiftKey)
        || (event.button === 0 && event.altKey)
        || (event.button === 0 && spacePressedRef.current)
        || (event.button === 0 && tool === 'pan');
      const orbit =
        !pan && (
          (event.button === 1 && event.shiftKey)
          || (event.button === 0 && event.ctrlKey)
          || event.button === 2
          // Inspect is click-to-select in free navigation. In Follow Pole the
          // camera is locked to the moving pole, so left-drag must still swing
          // around that lock; a click without movement falls through to inspect.
          || (event.button === 0 && tool === 'orbit')
          || (event.button === 0 && tool === 'select' && liveStateRef.current.cameraFollowMode === 'follow-shot')
        );

      if (orbit || pan) {
        dragRef.current = {
          mode: orbit ? 'orbit' : 'pan',
          x: event.clientX,
          y: event.clientY,
          pointerId: event.pointerId,
          moved: false,
        };
        event.preventDefault();
        event.stopPropagation();
        canvas.setPointerCapture(event.pointerId);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (drag) {
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (Math.hypot(dx, dy) > 3) drag.moved = true;
        drag.x = event.clientX;
        drag.y = event.clientY;
        if (drag.mode === 'orbit') {
          targetAlpha -= dx * 0.0062;
          targetBeta = clamp(
            targetBeta - dy * 0.0062,
            camera.lowerBetaLimit ?? 0.005,
            camera.upperBetaLimit ?? 1.56,
          );
        } else {
          // Analytical screen-plane basis vectors from camera.alpha and camera.beta
          // (100% singularity-free even in Top view where beta -> 0)
          const sinA = Math.sin(camera.alpha);
          const cosA = Math.cos(camera.alpha);
          const sinB = Math.sin(camera.beta);
          const cosB = Math.cos(camera.beta);
          const right = new Vector3(-sinA, 0, cosA);
          const up = new Vector3(-cosA * cosB, sinB, -sinA * cosB);
          const worldPerPixel = (2 * Math.tan(camera.fov / 2) * targetRadius) / Math.max(1, activeEngine.getRenderHeight());
          const panDelta = right.scale(-dx * worldPerPixel).add(up.scale(dy * worldPerPixel));
          if (liveStateRef.current.cameraFollowMode === 'follow-shot') {
            // Pan the follow framing itself; it stays offset (relative to the pole)
            // instead of being overwritten on the next animation frame.
            followPanOffsetRef.current.addInPlace(panDelta);
          } else {
            targetTarget = targetTarget.add(panDelta);
          }
        }
        event.preventDefault();
        return;
      }

      // Update live cursor coordinates and 3D snap indicator
      const mapping = worldRef.current;
      if (!mapping) return;
      const rect = canvas.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const snap = findSnapCandidate(sx, sy);
      hoveredSnapRef.current = snap;

      if (snap) {
        const obs = snap.observationIndex != null
          ? liveStateRef.current.survey.observations[snap.observationIndex]
          : undefined;
        const cardWidth = 240;
        const cardHeight = 156;
        const maxLeft = Math.max(8, canvas.clientWidth - cardWidth);
        const maxTop = Math.max(8, canvas.clientHeight - cardHeight);
        setHoverQuickView({
          x: Math.max(8, Math.min(maxLeft, sx + 16)),
          y: Math.max(8, Math.min(maxTop, sy + 16)),
          title: snap.label,
          subtitle: snap.kind === 'raw-shot'
            ? 'Raw shot'
            : snap.kind === 'setup'
              ? 'Occupied setup'
              : snap.kind === 'line-end'
                ? 'Line end'
                : 'Project point',
          pointNumber: snap.pointNumber,
          description: snap.description ?? obs?.description,
          easting: snap.easting,
          northing: snap.northing,
          elevation: snap.elevation,
          reflectorless: obs?.reflectorless === true,
        });
        setCursorCoords({
          e: snap.easting,
          n: snap.northing,
          z: snap.elevation,
          snapLabel: snap.label,
        });
        if (snapMarkerMeshRef.current) {
          snapMarkerMeshRef.current.setEnabled(true);
          snapMarkerMeshRef.current.position.copyFrom(snap.worldPos);
          const s = clamp(targetRadius * 0.015, 0.35, mapping.span * 0.03);
          snapMarkerMeshRef.current.scaling.setAll(s);
        }
      } else {
        setHoverQuickView(null);
        if (snapMarkerMeshRef.current) snapMarkerMeshRef.current.setEnabled(false);
        const picked = pickWorldPoint(sx, sy);
        if (picked) {
          const srv = mapping.toSurvey(picked);
          setCursorCoords({ e: srv.easting, n: srv.northing, z: srv.elevation });
        }
      }
    };

    const onPointerLeave = () => {
      setHoverQuickView(null);
      hoveredSnapRef.current = null;
      if (snapMarkerMeshRef.current) snapMarkerMeshRef.current.setEnabled(false);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (dragRef.current) {
        const wasMoved = dragRef.current.moved;
        dragRef.current = null;
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        if (wasMoved) return;
      }

      // Handle left-click for 3D Select / Inspect, 3D Measure, 3D Place Point, and 3D Draw Polyline
      if (event.button !== 0) return;
      const mapping = worldRef.current;
      if (!mapping) return;
      const rect = canvas.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const snap = findSnapCandidate(sx, sy);
      const pickedWorld = snap ? snap.worldPos.clone() : pickWorldPoint(sx, sy);
      if (!pickedWorld) return;
      const srv = snap
        ? { easting: snap.easting, northing: snap.northing, elevation: snap.elevation }
        : mapping.toSurvey(pickedWorld);
      const label = snap?.label ?? `N ${srv.northing.toFixed(2)}, E ${srv.easting.toFixed(2)}`;
      const tool = liveStateRef.current.active3DTool;

      if (tool === 'measure') {
        setMeasureStart(prev => {
          if (!prev) {
            setMeasureResult(null);
            return { ...srv, label, worldPos: pickedWorld };
          }
          const dE = srv.easting - prev.easting;
          const dN = srv.northing - prev.northing;
          const dZ = srv.elevation - prev.elevation;
          const horizDist = Math.hypot(dE, dN);
          const slopeDist = Math.hypot(horizDist, dZ);
          const gradePercent = horizDist > 1e-4 ? (dZ / horizDist) * 100 : 0;
          setMeasureResult({
            from: prev,
            to: { ...srv, label, worldPos: pickedWorld },
            horizDist,
            slopeDist,
            deltaZ: dZ,
            bearingText: formatQuadrantBearing(dE, dN),
            gradePercent,
          });
          return null;
        });
      } else if (tool === 'point') {
        setPendingPointDraft({
          easting: Number(srv.easting.toFixed(3)),
          northing: Number(srv.northing.toFixed(3)),
          elevation: Number(srv.elevation.toFixed(3)),
          pointNumber: String(nextAvailablePointNumber),
          description: '3D PICK',
        });
      } else if (tool === 'polyline') {
        setPolylineVertices(prev => {
          const nextVertex = {
            easting: srv.easting,
            northing: srv.northing,
            elevation: srv.elevation,
            pointNumber: snap?.pointNumber,
            worldPos: pickedWorld,
          };
          return [...prev, nextVertex];
        });
      } else if (tool === 'select') {
        if (snap) {
          const details: Array<{ label: string; value: string }> = [
            { label: 'Northing', value: snap.northing.toFixed(3) },
            { label: 'Easting', value: snap.easting.toFixed(3) },
            { label: 'Elevation', value: snap.elevation.toFixed(3) },
          ];
          if (snap.description) details.push({ label: 'Description', value: snap.description });
          if (snap.observationIndex != null) {
            const obs = liveStateRef.current.survey.observations[snap.observationIndex];
            if (obs) {
              details.push({ label: 'Sequence', value: `Shot #${obs.sequence}` });
              if (obs.horizontalDistance != null) {
                details.push({ label: 'Horiz Dist', value: obs.horizontalDistance.toFixed(2) });
              }
            }
          }
          setInspectedEntity({
            title: snap.label,
            subtitle: snap.kind === 'raw-shot' ? 'Field Observation' : snap.kind === 'setup' ? 'Occupied Setup' : 'Project Point',
            easting: snap.easting,
            northing: snap.northing,
            elevation: snap.elevation,
            details,
          });
        } else {
          setInspectedEntity(null);
        }
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      // Normalize line / page deltas to pixels so mice and trackpads share one feel.
      const delta = clamp(
        event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * 100 : event.deltaY,
        -240,
        240,
      );
      const mode = liveStateRef.current.cameraFollowMode;

      // Instrument POV: dolly from behind the tripod into the eyepiece, then zoom optically.
      if (mode === 'instrument-pov') {
        instrumentScopeZoomRef.current = clamp(
          instrumentScopeZoomRef.current - delta * 0.00115,
          0,
          1,
        );
        return;
      }

      const factor = Math.exp(delta * 0.00105);

      // Follow Pole: wheel adjusts the zoom multiplier on the auto-fit framing distance.
      if (mode === 'follow-shot') {
        followZoomFactorRef.current = clamp(
          followZoomFactorRef.current * factor,
          FOLLOW_MIN_ZOOM,
          FOLLOW_MAX_ZOOM,
        );
        return;
      }

      // Pure dolly along the camera sight axis toward the orbit pivot (never pans the pivot).
      targetRadius = clamp(
        targetRadius * factor,
        camera.lowerRadiusLimit ?? 0.5,
        camera.upperRadiusLimit ?? 150000,
      );
    };

    const onDoubleClick = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const picked = pickWorldPoint(event.clientX - rect.left, event.clientY - rect.top);
      if (picked) {
        targetTarget = picked.clone();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') spacePressedRef.current = true;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      if (event.key === 't' || event.key === 'T') {
        targetAlpha = -Math.PI / 2;
        targetBeta = 0.008;
      } else if (event.key === 'f' || event.key === 'F') {
        targetAlpha = -Math.PI / 2;
        targetBeta = 1.08;
      } else if (event.key === 'i' || event.key === 'I') {
        targetAlpha = -Math.PI / 4;
        targetBeta = 0.96;
      } else if (event.key === 'p' || event.key === 'P') {
        toggleOrthoRef.current?.();
      } else if (event.key === 'm' || event.key === 'M') {
        onActive3DToolChange?.(liveStateRef.current.active3DTool === 'measure' ? 'select' : 'measure');
      } else if (event.key === 'Escape') {
        setMeasureStart(null);
        setMeasureResult(null);
        setPendingPointDraft(null);
        setPolylineVertices([]);
        setInspectedEntity(null);
        onActive3DToolChange?.('select');
      } else if (event.key === 'Home' || event.key === '0') {
        frameCameraRef.current?.();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') spacePressedRef.current = false;
    };

    const preventAux = (event: Event) => event.preventDefault();
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDoubleClick);
    canvas.addEventListener('auxclick', preventAux);
    canvas.addEventListener('contextmenu', preventAux);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const resizeObserver = new ResizeObserver(() => activeEngine.resize());
    if (containerRef.current) resizeObserver.observe(containerRef.current);
    activeEngine.runRenderLoop(() => scene.render());
    setSceneReady(true);

    return () => {
      disposed = true;
      setSceneReady(false);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDoubleClick);
      canvas.removeEventListener('auxclick', preventAux);
      canvas.removeEventListener('contextmenu', preventAux);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      disposeNode(staticRootRef.current);
      disposeNode(equipmentRootRef.current);
      disposeNode(authoringRootRef.current);
      // Basemap root/texture are owned by the basemap effect. Static layer
      // rebuilds (grid/TIN toggles) must not destroy the loaded imagery.
      staticRootRef.current = null;
      groundMeshRef.current = null;
      equipmentRootRef.current = null;
      progressiveTraceMeshesRef.current = [];
      progressiveTraceKeyRef.current = '';
      authoringRootRef.current = null;
      pastPointsRef.current = null;
      futurePointsRef.current = null;
      traverseGlowMaterialRef.current = null;
      traverseCoreMaterialRef.current = null;
      scene.dispose();
      activeEngine.dispose();
      sceneRef.current = null;
      cameraRef.current = null;
      cameraViewRef.current = null;
      driveViewRef.current = null;
      frameCameraRef.current = null;
      toggleOrthoRef.current = null;
    };
  }, []);

  // Keep follow / scope state contiguous whenever the camera mode changes.
  useEffect(() => {
    followZoomFactorRef.current = 1;
    followPanOffsetRef.current.setAll(0);
    followTargetReadyRef.current = false;
    if (cameraFollowMode === 'instrument-pov') {
      instrumentScopeZoomRef.current = 0.16;
      instrumentScopeSmoothRef.current = 0.16;
    }
  }, [cameraFollowMode]);

  // ── 2. Build Static Scene Geometry (TIN, Contours, Lines, Grid, Tower) ──────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !sceneReady) return;

    disposeNode(staticRootRef.current);
    timedLayersRef.current = [];
    const root = new TransformNode('raw-replay-static', scene);
    staticRootRef.current = root;
    tinMeshesRef.current = [];
    groundMeshRef.current = null;
    lastInstanceKeyRef.current = '';

    const observationsWithCoordinates = survey.observations.filter(
      observation => observation.easting != null && observation.northing != null,
    );

    let minE = Number.POSITIVE_INFINITY;
    let maxE = Number.NEGATIVE_INFINITY;
    let minN = Number.POSITIVE_INFINITY;
    let maxN = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    const includeCoord = (e: number, n: number, z?: number) => {
      if (!Number.isFinite(e) || !Number.isFinite(n)) return;
      minE = Math.min(minE, e);
      maxE = Math.max(maxE, e);
      minN = Math.min(minN, n);
      maxN = Math.max(maxN, n);
      if (z != null && Number.isFinite(z) && z > -9000 && Math.abs(z) > 1e-4) {
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
    };

    if (survey.bounds) {
      minE = Math.min(minE, survey.bounds.minE);
      maxE = Math.max(maxE, survey.bounds.maxE);
      minN = Math.min(minN, survey.bounds.minN);
      maxN = Math.max(maxN, survey.bounds.maxN);
      if (Number.isFinite(survey.bounds.minZ) && Math.abs(survey.bounds.minZ) > 1e-4) {
        minZ = Math.min(minZ, survey.bounds.minZ);
        maxZ = Math.max(maxZ, survey.bounds.maxZ);
      }
    } else {
      observationsWithCoordinates.forEach(obs => includeCoord(obs.easting!, obs.northing!, obs.elevation));
    }

    projectPoints.forEach(point => {
      if (!point.hidden) includeCoord(point.easting, point.northing, point.elevation);
    });

    if (showTin) {
      tinSurfaces.filter(tin => !tin.hidden).forEach(tin => {
        tin.vertices.forEach(v => includeCoord(v.easting, v.northing, v.elevation));
      });
    }

    if (showContours) {
      contourGenerations.filter(g => g.visible).forEach(gen => {
        gen.isoPaths.forEach(path => {
          path.vertices.forEach(v => includeCoord(v.x, v.y, path.elevation));
        });
      });
    }

    if (!Number.isFinite(minE) || !Number.isFinite(minN)) {
      minE = 0;
      maxE = 100;
      minN = 0;
      maxN = 100;
    }
    if (!Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
      minZ = 0;
      maxZ = 0;
    }

    const spanE = Math.max(20, maxE - minE);
    const spanN = Math.max(20, maxN - minN);
    const relief = Math.max(0, maxZ - minZ);
    const span = Math.max(spanE, spanN, 25);
    const originE = (minE + maxE) / 2;
    const originN = (minN + maxN) / 2;
    const originZ = minZ;
    const vExag = clamp(verticalExaggeration, 0.25, 10);

    const mapping: WorldMapping3D = {
      originE,
      originN,
      originZ,
      minE,
      maxE,
      minN,
      maxN,
      minZ,
      maxZ,
      span,
      relief,
      verticalExaggeration: vExag,
      toWorld: (easting, northing, elevation) => new Vector3(
        easting - originE,
        ((elevation ?? originZ) - originZ) * vExag,
        northing - originN,
      ),
      toSurvey: (world) => ({
        easting: world.x + originE,
        northing: world.z + originN,
        elevation: world.y / vExag + originZ,
      }),
    };
    worldRef.current = mapping;

    // Create fast spatial TIN sampler for draping 2D entities
    const sampler = createFastTinSampler(tinSurfaces, originZ, minZ);
    samplerRef.current = sampler;

    const pointWorld: PointWorld[] = observationsWithCoordinates.map(observation => {
      const z = sampler.resolveElevation(observation.elevation, observation.easting!, observation.northing!, 0);
      return {
        observation,
        position: mapping.toWorld(observation.easting!, observation.northing!, z),
      };
    });
    pointWorldRef.current = pointWorld;

    // Build Snap Candidates for 3D Osnap, Inspection & Measurement
    const snaps: SnapCandidate3D[] = [];
    // Iterate the unfiltered list so observationIndex stays aligned with
    // survey.observations for the hover quickview lookup.
    survey.observations.forEach((obs, index) => {
      if (obs.easting == null || obs.northing == null) return;
      const z = sampler.resolveElevation(obs.elevation, obs.easting, obs.northing, 0);
      snaps.push({
        kind: 'raw-shot',
        label: obs.pointNumber ? `PN ${obs.pointNumber}` : `Shot #${obs.sequence}`,
        pointNumber: obs.pointNumber,
        description: obs.description,
        easting: obs.easting,
        northing: obs.northing,
        elevation: z,
        worldPos: mapping.toWorld(obs.easting, obs.northing, z),
        observationIndex: index,
      });
    });
    projectPoints.forEach(pt => {
      if (pt.hidden) return;
      const z = sampler.resolveElevation(pt.elevation, pt.easting, pt.northing, 0);
      snaps.push({
        kind: 'point',
        label: `PT ${pt.pointNumber}`,
        pointNumber: pt.pointNumber,
        description: pt.description,
        easting: pt.easting,
        northing: pt.northing,
        elevation: z,
        worldPos: mapping.toWorld(pt.easting, pt.northing, z),
      });
    });
    snapCandidatesRef.current = snaps;

    // Ground Plane & Adaptive CAD Grid
    // A finite square backdrop shows its far corner as a huge triangular slab
    // once the map/grid are hidden. Use a wide disc so there are no corners to
    // read as terrain, and push the rim past the normal camera range.
    const groundRadius = Math.max(span * 25, 4000);
    const ground = MeshBuilder.CreateDisc('raw-replay-ground', {
      radius: groundRadius,
      tessellation: 96,
    }, scene);
    ground.parent = root;
    // Rotate the XY disc into the XZ plane with its normal facing up.
    ground.rotation.x = -Math.PI / 2;
    // Keep the backdrop clearly below the basemap and remove the polygon
    // offset: the 0.11-unit gap plus ground zOffset 4 made the dark plane
    // punch through the imagery in patches while orbiting.
    ground.position.y = -Math.max(0.9, span * 0.0025);
    ground.receiveShadows = true;
    ground.isPickable = true;
    const groundMat = createMaterial(scene, 'raw-replay-ground-mat', '#08121b', 0.02);
    groundMat.zOffset = 0;
    // The disc normal points down after rotating it into the XZ plane.
    groundMat.backFaceCulling = false;
    ground.material = groundMat;
    groundMeshRef.current = ground;

    if (showGrid) {
      const gridExtent = Math.max(span * 1.6, 60);
      const minorStep = niceStep(span / 20) * clamp(gridSpacing, 0.25, 4);
      const majorStep = minorStep * 5;
      const minorLines: Vector3[][] = [];
      const majorLines: Vector3[][] = [];
      const gridY = -Math.max(0.06, span * 0.00025);
      for (let value = -Math.ceil(gridExtent / minorStep) * minorStep; value <= gridExtent; value += minorStep) {
        const target = Math.abs(value % majorStep) < minorStep * 0.01 ? majorLines : minorLines;
        target.push([new Vector3(value, gridY, -gridExtent), new Vector3(value, gridY, gridExtent)]);
        target.push([new Vector3(-gridExtent, gridY, value), new Vector3(gridExtent, gridY, value)]);
      }
      const gridColor = toColor(styleSettings.gridColor, '#38bdf8');
      const gridDashUnit = Math.max(0.2, span * 0.004);
      const minorGrid = createStyledLineMesh(
        scene,
        'raw-replay-grid-minor',
        minorLines.map(points => ({ points, color: gridColor.scale(0.68) })),
        {
          alpha: 0.22 * clamp(gridOpacity, 0.05, 1),
          lineType: styleSettings.gridLineType,
          lineWeight: styleSettings.gridLineWeight,
          dashUnit: gridDashUnit,
          renderingGroupId: 0,
        },
      );
      if (minorGrid) {
        minorGrid.parent = root;
        timedLayersRef.current.push({ mesh: minorGrid, key: 'grid' });
      }
      const majorGrid = createStyledLineMesh(
        scene,
        'raw-replay-grid-major',
        majorLines.map(points => ({ points, color: gridColor })),
        {
          alpha: 0.38 * clamp(gridOpacity, 0.05, 1),
          lineType: styleSettings.gridLineType,
          lineWeight: styleSettings.gridLineWeight,
          dashUnit: gridDashUnit,
          renderingGroupId: 0,
        },
      );
      if (majorGrid) {
        majorGrid.parent = root;
        timedLayersRef.current.push({ mesh: majorGrid, key: 'grid' });
      }
    }

    // 3D TIN Surfaces (with computed vertex normals, hypsometric colors, UV coordinates for basemap draping, and optional wireframe)
    if (showTin) {
      // Must match the composite basemap extent exactly. A tighter pad samples
      // a magnified crop of the texture and shows the map as offset chunks.
      const uvExtent = rawReplayBasemapExtent(mapping);
      const uvMinE = uvExtent.minE;
      const uvMaxE = uvExtent.maxE;
      const uvMinN = uvExtent.minN;
      const uvMaxN = uvExtent.maxN;

      tinSurfaces.filter(tin => !tin.hidden).forEach((tin, tinIndex) => {
        if (tin.vertices.length === 0 || tin.triangles.length === 0) return;
        const positions: number[] = [];
        const colors: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        const wireLines: Vector3[][] = [];

        tin.vertices.forEach(vertex => {
          const position = mapping.toWorld(vertex.easting, vertex.northing, vertex.elevation);
          positions.push(position.x, position.y, position.z);
          const t = relief > 0 ? clamp((vertex.elevation - minZ) / relief, 0, 1) : 0.5;
          const c = elevationToHypsometricColor(t);
          colors.push(c.r, c.g, c.b, 0.88);
          const u = (vertex.easting - uvMinE) / Math.max(1, uvMaxE - uvMinE);
          const v = (vertex.northing - uvMinN) / Math.max(1, uvMaxN - uvMinN);
          uvs.push(u, v);
        });

        tin.triangles.forEach(triangle => {
          const [i0, i1, i2] = triangle;
          if (i0 < tin.vertices.length && i1 < tin.vertices.length && i2 < tin.vertices.length) {
            indices.push(i0, i1, i2);
            if (showTinWireframe && wireLines.length < 18000) {
              const v0 = tin.vertices[i0];
              const v1 = tin.vertices[i1];
              const v2 = tin.vertices[i2];
              const p0 = mapping.toWorld(v0.easting, v0.northing, v0.elevation + 0.04);
              const p1 = mapping.toWorld(v1.easting, v1.northing, v1.elevation + 0.04);
              const p2 = mapping.toWorld(v2.easting, v2.northing, v2.elevation + 0.04);
              wireLines.push([p0, p1, p2, p0]);
            }
          }
        });
        if (indices.length === 0) return;

        const normals: number[] = [];
        VertexData.ComputeNormals(positions, indices, normals);

        const mesh = new Mesh(`raw-replay-tin-${tinIndex}`, scene);
        const data = new VertexData();
        data.positions = positions;
        data.indices = indices;
        data.normals = normals;
        data.colors = colors;
        data.uvs = uvs;
        data.applyToMesh(mesh, false);
        mesh.parent = root;
        mesh.receiveShadows = true;
        mesh.isPickable = true;
        // A draped TIN is the ground surface, not a veil over it. The
        // hypsometric vertex colors are for the no-imagery view; multiplying
        // them into the aerial texture is what produced the blue film. Keep
        // the draped mesh opaque and texture-only.
        const drapeTexture = showBasemap ? basemapTextureRef.current : null;
        mesh.hasVertexAlpha = !drapeTexture;
        mesh.useVertexColors = !drapeTexture;

        const material = new StandardMaterial(`raw-replay-tin-mat-${tinIndex}`, scene);
        material.diffuseColor = Color3.White();
        material.emissiveColor = drapeTexture
          ? new Color3(0.45, 0.45, 0.45)
          : new Color3(0.08, 0.14, 0.16);
        material.specularColor = new Color3(0.06, 0.08, 0.1);
        material.alpha = drapeTexture ? 1 : 0.88;
        material.backFaceCulling = false;
        material.zOffset = 1;
        if (drapeTexture) {
          material.diffuseTexture = drapeTexture;
        }
        mesh.material = material;
        tinMeshesRef.current.push({ mesh, minE: uvMinE, maxE: uvMaxE, minN: uvMinN, maxN: uvMaxN });

        if (wireLines.length > 0) {
          const wireMesh = MeshBuilder.CreateLineSystem(`raw-replay-tin-wire-${tinIndex}`, {
            lines: wireLines,
          }, scene);
          wireMesh.parent = root;
          wireMesh.color = toColor(tin.color, '#22d3ee');
          wireMesh.alpha = 0.45;
          wireMesh.isPickable = false;
          wireMesh.renderingGroupId = 1;
        }
      });
    }

    // A draped TIN owns the ground imagery. Hide the fallback disc so the map
    // cannot appear on a second flat surface outside the mesh.
    if (groundMeshRef.current) {
      const hasDrapedTin = showBasemap && Boolean(basemapTextureRef.current) && tinMeshesRef.current.length > 0;
      groundMeshRef.current.setEnabled(!hasDrapedTin);
    }

    // 3D Contour Generations (IsoPaths)
    if (showContours && contourGenerations.length > 0) {
      const { majorLines, minorLines } = buildContourGenerationLines3D(contourGenerations, mapping);
      const contourDashUnit = Math.max(0.2, span * 0.004);
      const contourOpacity = clamp(styleSettings.contourOpacity, 0.05, 1);
      const minorMesh = createStyledLineMesh(
        scene,
        'raw-replay-contours-minor',
        minorLines.map(points => ({ points, color: toColor(styleSettings.contourMinorColor, '#38bdf8') })),
        {
          alpha: 0.65 * contourOpacity,
          lineType: styleSettings.contourLineType,
          lineWeight: styleSettings.contourLineWeight,
          dashUnit: contourDashUnit,
          renderingGroupId: 1,
        },
      );
      if (minorMesh) {
        minorMesh.parent = root;
        timedLayersRef.current.push({ mesh: minorMesh, key: 'contours' });
      }
      const majorMesh = createStyledLineMesh(
        scene,
        'raw-replay-contours-major',
        majorLines.map(points => ({ points, color: toColor(styleSettings.contourMajorColor, '#fbbf24') })),
        {
          alpha: 0.96 * contourOpacity,
          lineType: styleSettings.contourLineType,
          lineWeight: styleSettings.contourLineWeight,
          dashUnit: contourDashUnit,
          renderingGroupId: 1,
        },
      );
      if (majorMesh) {
        majorMesh.parent = root;
        timedLayersRef.current.push({ mesh: majorMesh, key: 'contours' });
      }
    }

    // 3D Project Lines (including tessellated curves, circles, contour lines, breaklines), Centerlines & Boundaries
    if (showProjectLines) {
      const pointMap = new Map(projectPoints.map(point => [point.pointNumber, point]));
      const sources: StyledLineSource[] = [];
      const projectOverride = styleSettings.projectColorMode === 'custom'
        ? toColor(styleSettings.projectColor, '#22d3ee')
        : null;
      const projectOpacity = clamp(styleSettings.projectOpacity, 0.05, 1);

      projectLines.slice(0, 24000).forEach(line => {
        const isContourLine = line.type === 'contour-major' || line.type === 'contour-minor';
        if (isContourLine && !showContours) return;
        const pts = tessellateSurveyLine3D(line, pointMap, sampler, mapping);
        if (!pts || pts.length < 2) return;
        const fallbackHex = line.type === 'contour-major'
          ? '#fbbf24'
          : line.type === 'contour-minor'
            ? '#38bdf8'
            : line.type === 'breakline'
              ? '#f472b6'
              : '#22d3ee';
        sources.push({ points: pts, color: projectOverride ?? toColor(line.color, fallbackHex) });
      });

      centerlines.forEach(cl => {
        const pts = tessellateCenterline3D(cl, sampler, mapping);
        if (pts.length >= 2) {
          sources.push({ points: pts, color: projectOverride ?? new Color3(0.98, 0.38, 0.48) });
        }
      });

      boundaryFiles.forEach(bf => {
        const segs = tessellateBoundaryFile3D(bf, pointMap, sampler, mapping);
        segs.forEach(seg => {
          sources.push({ points: seg, color: projectOverride ?? new Color3(0.98, 0.78, 0.16) });
        });
      });

      hatches.forEach(hatch => {
        if (hatch.hidden || !hatch.loops) return;
        const hatchColor = projectOverride ?? toColor(hatch.color, '#34d399');
        hatch.loops.forEach(loop => {
          if (!loop.vertices || loop.vertices.length < 3) return;
          const pts = loop.vertices.map(v => {
            const z = sampler.resolveElevation(undefined, v.x, v.y, 0.16);
            return mapping.toWorld(v.x, v.y, z);
          });
          pts.push(pts[0].clone());
          sources.push({ points: pts, color: hatchColor });
        });
      });

      const projectMesh = createStyledLineMesh(scene, 'raw-replay-project-lines', sources, {
        alpha: projectOpacity,
        lineType: styleSettings.projectLineType,
        lineWeight: styleSettings.projectLineWeight,
        dashUnit: Math.max(0.2, span * 0.005),
        renderingGroupId: 1,
      });
      if (projectMesh) {
        projectMesh.parent = root;
        timedLayersRef.current.push({ mesh: projectMesh, key: 'project' });
      }
    }

    // Survey trace is drawn live in the render loop (past shots only, never pre-rendered).

    // Traverse Path connecting occupied setups — thin neon glow, not a heavy gold ribbon.
    traverseGlowMaterialRef.current = null;
    traverseCoreMaterialRef.current = null;
    if (showTraverse) {
      const setupPoints = survey.setups
        .filter(setup => setup.easting != null && setup.northing != null)
        .map(setup => {
          const z = sampler.resolveElevation(setup.elevation, setup.easting!, setup.northing!, 0.22);
          return mapping.toWorld(setup.easting!, setup.northing!, z);
        });
      if (setupPoints.length > 1) {
        // The traverse already has a 1px line; keep the glow tube slim so it
        // cannot become a giant cyan pipe in a close orbit.
        const coreRadius = clamp(span * 0.00012, 0.02, 0.12);
        const glowRadius = coreRadius * 2.8;

        const traverseColor = toColor(styleSettings.traverseColor, '#7dd3fc');
        const glowMaterial = new StandardMaterial('raw-replay-traverse-glow-mat', scene);
        glowMaterial.diffuseColor = Color3.Black();
        glowMaterial.emissiveColor = traverseColor;
        glowMaterial.disableLighting = true;
        glowMaterial.alpha = clamp(0.05 + styleSettings.traverseGlow * 0.2, 0.03, 0.4);
        glowMaterial.alphaMode = Constants.ALPHA_ADD;
        glowMaterial.backFaceCulling = false;
        traverseGlowMaterialRef.current = glowMaterial;
        const glow = MeshBuilder.CreateTube('raw-replay-traverse-glow', {
          path: setupPoints,
          radius: glowRadius,
          tessellation: 8,
        }, scene);
        glow.parent = root;
        glow.material = glowMaterial;
        glow.isPickable = false;
        glow.renderingGroupId = 2;
        timedLayersRef.current.push({ mesh: glow, key: 'traverse' });

        const coreMaterial = new StandardMaterial('raw-replay-traverse-core-mat', scene);
        coreMaterial.diffuseColor = Color3.Black();
        coreMaterial.emissiveColor = traverseColor.scale(1.15);
        coreMaterial.disableLighting = true;
        coreMaterial.alpha = clamp(0.55 + styleSettings.traverseGlow * 0.45, 0.35, 1);
        coreMaterial.alphaMode = Constants.ALPHA_ADD;
        coreMaterial.backFaceCulling = false;
        traverseCoreMaterialRef.current = coreMaterial;
        const core = MeshBuilder.CreateTube('raw-replay-traverse-core', {
          path: setupPoints,
          radius: coreRadius,
          tessellation: 8,
        }, scene);
        core.parent = root;
        core.material = coreMaterial;
        core.isPickable = false;
        core.renderingGroupId = 2;
        timedLayersRef.current.push({ mesh: core, key: 'traverse' });

        const traverseLine = createStyledLineMesh(scene, 'raw-replay-traverse-path', [
          { points: setupPoints, color: traverseColor },
        ], {
          alpha: 0.9,
          lineType: styleSettings.traverseLineType,
          lineWeight: styleSettings.traverseLineWeight,
          dashUnit: Math.max(0.2, span * 0.004),
          renderingGroupId: 2,
        });
        if (traverseLine) {
          traverseLine.parent = root;
          timedLayersRef.current.push({ mesh: traverseLine, key: 'traverse' });
        }
      }
    }

    // Setup Monument Ground Rings
    survey.setups.forEach(setup => {
      if (setup.easting == null || setup.northing == null) return;
      const z = sampler.resolveElevation(setup.elevation, setup.easting, setup.northing, 0.08);
      // Monument rings are scene dressing, not site-scaled linework. Scaling
      // the diameter with span produced enormous yellow hoops at close zoom.
      const ring = MeshBuilder.CreateTorus(`raw-replay-setup-ring-${setup.id}`, {
        diameter: clamp(span * 0.0035, 1.2, 6),
        thickness: clamp(span * 0.00035, 0.04, 0.2),
        tessellation: 32,
      }, scene);
      ring.parent = root;
      ring.position = mapping.toWorld(setup.easting, setup.northing, z);
      const material = new StandardMaterial(`raw-replay-ring-mat-${setup.id}`, scene);
      material.emissiveColor = new Color3(0.95, 0.62, 0.12);
      material.disableLighting = true;
      material.alpha = 0.65;
      ring.material = material;
      ring.isPickable = false;
    });

    // Past & Future Shot Markers — glowing X glyphs, sized through thin-instance matrices.
    const markerColor = Color3.FromHexString(styleSettings.pointColor || '#ffffff');
    const pastMaterial = new StandardMaterial('raw-replay-past-points-mat', scene);
    pastMaterial.emissiveColor = markerColor;
    pastMaterial.diffuseColor = Color3.Black();
    pastMaterial.disableLighting = true;
    pastMaterial.alpha = clamp(0.45 + styleSettings.pointGlow * 0.55, 0.25, 1);
    pastMaterial.alphaMode = Constants.ALPHA_ADD;
    pastMaterial.backFaceCulling = false;

    const futureMaterial = new StandardMaterial('raw-replay-future-points-mat', scene);
    futureMaterial.emissiveColor = markerColor;
    futureMaterial.diffuseColor = Color3.Black();
    futureMaterial.disableLighting = true;
    futureMaterial.alpha = clamp(0.12 + styleSettings.pointGlow * 0.22, 0.05, 0.65);
    futureMaterial.alphaMode = Constants.ALPHA_ADD;
    futureMaterial.backFaceCulling = false;

    const pastPoints = createShotMarkerMesh(scene, 'raw-replay-past-points', styleSettings.pointShape, styleSettings.pointLineWeight);
    pastPoints.parent = root;
    pastPoints.material = pastMaterial;
    pastPoints.renderingGroupId = 2;
    pastPoints.setEnabled(false); // Enabled only when thinInstanceCount > 0 so (0,0,0) never flashes!
    pastPointsRef.current = pastPoints;

    const futurePoints = createShotMarkerMesh(scene, 'raw-replay-future-points', styleSettings.pointShape, styleSettings.pointLineWeight);
    futurePoints.parent = root;
    futurePoints.material = futureMaterial;
    futurePoints.renderingGroupId = 2;
    futurePoints.setEnabled(false);
    futurePointsRef.current = futurePoints;

    // GNSS reference: a local tripod base or a distant network/NTRIP tower.
    const localBaseSetup = survey.setups.find(
      item => item.equipment === 'gnss-base' && item.easting != null && item.northing != null,
    );
    const isLocalBase = base?.reference === 'local-base';
    baseRigAnchorRef.current = null;
    gnssBaseRigRef.current?.root.setEnabled(false);

    if (isLocalBase && base && showTower) {
      const bearing = (base.bearingDeg * Math.PI) / 180;
      let baseWorld: Vector3;
      if (localBaseSetup?.easting != null && localBaseSetup.northing != null) {
        baseWorld = mapping.toWorld(
          localBaseSetup.easting,
          localBaseSetup.northing,
          sampler.resolveElevation(localBaseSetup.elevation, localBaseSetup.easting, localBaseSetup.northing, 0),
        );
      } else if (base.easting != null && base.northing != null) {
        baseWorld = mapping.toWorld(
          base.easting,
          base.northing,
          sampler.resolveElevation(base.elevation, base.easting, base.northing, 0),
        );
      } else {
        const localDistance = base.distanceM * (survey.job.units === 'meter' ? 1 : 3.28084);
        const visualDistance = clamp(localDistance, span * 0.42, span * 1.05);
        baseWorld = new Vector3(Math.sin(bearing) * visualDistance, 0, Math.cos(bearing) * visualDistance);
      }
      baseRigAnchorRef.current = baseWorld;
      towerAnchorRef.current = baseWorld;
      towerTopPosRef.current = null;
      gnssBaseRigRef.current?.updatePose(baseWorld, 1, 1);
      if (towerLabelRef.current) {
        towerLabelRef.current.style.display = 'block';
        towerLabelRef.current.textContent = `${base.label} · Local base · ${formatBearing(base.bearingDeg)} · ${(base.distanceM / 1000).toFixed(base.distanceM >= 10000 ? 0 : 1)} km${base.approximate ? ' · approx' : ''}`;
      }
    } else {
      const towerVisualDistance = base && showTower && base.reference !== 'local-base'
        ? (() => {
          const distanceInSceneUnits = base.visualDistanceM * (survey.job.units === 'meter' ? 1 : 3.28084);
          return clamp(distanceInSceneUnits, span * 1.35, span * 2.8);
        })()
        : 0;
      let towerHeight = 0;
      if (showTower && base && base.reference !== 'local-base') {
        const bearing = (base.bearingDeg * Math.PI) / 180;
        towerHeight = clamp(span * 0.11, 38, 210);
        const tower = buildTower(
          scene,
          root,
          new Vector3(Math.sin(bearing) * towerVisualDistance, 0, Math.cos(bearing) * towerVisualDistance),
          span,
          towerHeight,
        );
        towerAnchorRef.current = tower.anchor;
        towerTopPosRef.current = tower.topPosition;
        const towerShadow = shadowGeneratorRef.current;
        if (towerShadow) {
          tower.root.getChildMeshes().forEach(mesh => {
            mesh.receiveShadows = true;
            towerShadow.addShadowCaster(mesh, true);
          });
        }
        if (towerLabelRef.current) {
          towerLabelRef.current.textContent = `${base.label} · ${formatBearing(base.bearingDeg)} · ${(base.distanceM / 1000).toFixed(base.distanceM >= 10000 ? 0 : 1)} km${base.approximate ? ' · approx' : ''}`;
        }
      } else {
        towerAnchorRef.current = null;
        towerTopPosRef.current = null;
        if (towerLabelRef.current) towerLabelRef.current.style.display = 'none';
      }
    }

    // Celestial sky: real positions for the recorded field time and GNSS location.
    const skyContext = resolveSkyContext(survey);
    const skyRadius = clamp(span * 6, 3200, 45000);
    // The celestial horizon disc is a huge depth-writing plane. Drop it below
    // both ground layers with a real gap; otherwise it sits between the map
    // quad and the dark backdrop and flashes through the imagery at grazing
    // angles (even when the CAD grid is off). The added drop is a fraction of
    // a degree at the sky radius, so the visible horizon does not move.
    const groundBackdropY = -Math.max(0.9, span * 0.0025);
    const basemapQuadY = -Math.max(0.35, span * 0.001);
    const horizonFloorY = Math.min(groundBackdropY, basemapQuadY) - Math.max(4, span * 0.003);
    const celestial = createCelestialSky(
      scene,
      skyRadius,
      `${survey.fileName}|${survey.parsedAt}|${skyContext.dateMs}`,
      horizonFloorY,
    );
    celestial.root.parent = root;
    celestialSkyRef.current = celestial;
    const resolvedSky = celestial.update(skyContext.dateMs, skyContext.latitudeDeg, skyContext.longitudeDeg);
    setSkyState({
      ...resolvedSky,
      approximateLocation: skyContext.approximateLocation,
      approximateTime: skyContext.approximateTime,
    });

    const camera = cameraRef.current;
    if (camera) {
      camera.minZ = Math.max(0.25, span * 0.0005);
      camera.maxZ = Math.max(20000, span * 32);
      const fitRadius = Math.max(
        36,
        Math.max(spanE, spanN) * 1.35,
        relief * vExag * 2.2,
      );
      const baseLowerRadiusLimit = Math.max(0.8, span * 0.006);
      const baseUpperRadiusLimit = Math.max(8000, span * 25);
      baseRadiusLimitsRef.current = { lower: baseLowerRadiusLimit, upper: baseUpperRadiusLimit };
      camera.lowerRadiusLimit = baseLowerRadiusLimit;
      camera.upperRadiusLimit = baseUpperRadiusLimit;
      frameCameraRef.current = () => {
        cameraViewRef.current?.(
          new Vector3(0, (relief * vExag) * 0.25, 0),
          fitRadius,
          -Math.PI / 4,
          0.96,
        );
      };
      const frameKey = `${survey.fileName}|${survey.parsedAt}`;
      if (framedSurveyRef.current !== frameKey) {
        framedSurveyRef.current = frameKey;
        frameCameraRef.current();
      }
    }
  }, [
    survey,
    base,
    showProjectLines,
    showTraverse,
    showTower,
    showTin,
    showTinWireframe,
    showContours,
    showGrid,
    gridSpacing,
    gridOpacity,
    verticalExaggeration,
    projectPoints,
    projectLines,
    tinSurfaces,
    contourGenerations,
    centerlines,
    boundaryFiles,
    hatches,
    styleSettings.pointShape,
    styleSettings.pointLineWeight,
    styleSettings.gridColor,
    styleSettings.gridLineType,
    styleSettings.gridLineWeight,
    styleSettings.contourMinorColor,
    styleSettings.contourMajorColor,
    styleSettings.contourLineType,
    styleSettings.contourLineWeight,
    styleSettings.contourOpacity,
    styleSettings.projectColorMode,
    styleSettings.projectColor,
    styleSettings.projectLineType,
    styleSettings.projectLineWeight,
    styleSettings.projectOpacity,
    styleSettings.traverseColor,
    styleSettings.traverseLineType,
    styleSettings.traverseLineWeight,
    sceneReady,
  ]);

  // Re-evaluate the sky as the playhead advances through recorded field time.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!sceneReady || !scene) return;
    const context = resolveSkyContext(survey);
    const index = clamp(playhead, 0, Math.max(0, survey.observations.length - 1));
    const observation = survey.observations[index];
    const dateMs = observation?.fieldTimeMs ?? context.dateMs;
    const sky = celestialSkyRef.current?.update(dateMs, context.latitudeDeg, context.longitudeDeg);
    if (!sky) return;
    applySkyLighting(sky, scene);
    setSkyState({
      ...sky,
      approximateLocation: context.approximateLocation,
      approximateTime: context.approximateTime,
    });
  }, [playhead, sceneReady, survey, applySkyLighting]);

  // ── 3. Asynchronous 3D Background Map & TIN Texture Draping ─────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    const mapping = worldRef.current;
    if (!scene || !sceneReady || !mapping) return;

    disposeNode(basemapRootRef.current);
    basemapRootRef.current = null;
    basemapTextureRef.current?.dispose();
    basemapTextureRef.current = null;

    // Clear draped texture on TIN meshes if basemap is off. Restore the
    // hypsometric vertex colors and translucency only for the no-imagery view.
    tinMeshesRef.current.forEach(({ mesh }) => {
      if (mesh.material && mesh.material instanceof StandardMaterial) {
        mesh.material.diffuseTexture = null;
        mesh.material.emissiveColor = new Color3(0.08, 0.14, 0.16);
        mesh.material.alpha = 0.88;
        mesh.useVertexColors = true;
        mesh.hasVertexAlpha = true;
      }
    });

    if (!showBasemap) {
      groundMeshRef.current?.setEnabled(true);
      setBasemapStatus(null);
      return;
    }

    const hasEpsg = Boolean(settings?.projection?.epsg);
    const hasUnderlays = rasterUnderlays.some(u => u.visible && u.opacity > 0);
    if (!hasEpsg && !hasUnderlays) {
      groundMeshRef.current?.setEnabled(true);
      setBasemapStatus('Select a project EPSG coordinate system to load aerial/satellite map tiles in 3D.');
      return;
    }

    let cancelled = false;
    setBasemapStatus(`Loading ${basemapType.toUpperCase()} 3D imagery…`);

    void loadBasemapCompositeCanvas({
      mapping,
      mapType: basemapType,
      settings,
      rasterUnderlays,
      isCancelled: () => cancelled,
    }).then(result => {
      if (cancelled || !sceneRef.current || !worldRef.current) return;
      if (!result) {
        groundMeshRef.current?.setEnabled(true);
        setBasemapStatus('Map imagery unavailable for this extent.');
        return;
      }

      const activeScene = sceneRef.current;
      const mapRoot = new TransformNode('raw-replay-basemap-root', activeScene);
      basemapRootRef.current = mapRoot;

      const tex = createTextureFromCanvas(activeScene, 'raw-replay-basemap-tex', result.canvas);
      basemapTextureRef.current = tex;

      const hasDrapedTin = tinMeshesRef.current.length > 0;

      // When a TIN can receive the imagery, it is the only map surface. Do not
      // build the old flat basemap quad underneath it.
      if (!hasDrapedTin) {
        const widthWorld = result.maxE - result.minE;
        const heightWorld = result.maxN - result.minN;
        const centerE = (result.minE + result.maxE) / 2;
        const centerN = (result.minN + result.maxN) / 2;
        const quadPos = mapping.toWorld(centerE, centerN, mapping.originZ);

        const groundQuad = MeshBuilder.CreateGround('raw-replay-basemap-quad', {
          width: widthWorld,
          height: heightWorld,
          subdivisions: 2,
        }, activeScene);
        groundQuad.parent = mapRoot;
        groundQuad.receiveShadows = true;
        // Keep a real vertical gap from both the grid and the dark backdrop;
        // a 0.1-unit gap depth-fights at the far edge of the grid.
        groundQuad.position = new Vector3(quadPos.x, -Math.max(0.35, mapping.span * 0.001), quadPos.z);
        groundQuad.isPickable = true;

        const mat = new StandardMaterial('raw-replay-basemap-mat', activeScene);
        mat.diffuseTexture = tex;
        mat.emissiveColor = new Color3(0.72, 0.72, 0.72);
        mat.specularColor = Color3.Black();
        mat.alpha = clamp(basemapOpacity, 0.1, 1);
        mat.zOffset = 0;
        groundQuad.material = mat;
      }

      // Drape the composite imagery directly onto visible 3D TIN terrain surfaces!
      tinMeshesRef.current.forEach(({ mesh }) => {
        if (mesh.material && mesh.material instanceof StandardMaterial) {
          mesh.material.diffuseTexture = tex;
          mesh.material.emissiveColor = new Color3(0.45, 0.45, 0.45);
          // Opaque so nothing can show through the TIN and double-expose the map.
          mesh.material.alpha = 1;
          mesh.useVertexColors = false;
          mesh.hasVertexAlpha = false;
        }
      });

      // With a draped TIN there is no flat map surface and no fallback ground
      // under it; the terrain mesh is the only thing carrying the imagery.
      groundMeshRef.current?.setEnabled(!hasDrapedTin);

      setBasemapStatus(`${result.sourceLabel} · ${result.tileCount} tile${result.tileCount === 1 ? '' : 's'} ${hasDrapedTin ? 'draped' : 'loaded'}`);
    });

    return () => {
      cancelled = true;
    };
  }, [
    sceneReady,
    showBasemap,
    basemapType,
    basemapOpacity,
    settings,
    rasterUnderlays,
    survey,
    verticalExaggeration,
    showTin,
    tinSurfaces,
  ]);

  // Apply live basemapOpacity adjustments without re-fetching tiles
  useEffect(() => {
    const mapRoot = basemapRootRef.current;
    if (mapRoot) {
      mapRoot.getChildMeshes().forEach(m => {
        if (m.material && m.material instanceof StandardMaterial) {
          m.material.alpha = clamp(basemapOpacity, 0.1, 1);
        }
      });
    }
    if (showBasemap && basemapTextureRef.current) {
      tinMeshesRef.current.forEach(({ mesh }) => {
        if (mesh.material && mesh.material instanceof StandardMaterial) {
          // Draped TIN stays opaque; the opacity slider governs the flat map,
          // not a second translucent copy of the imagery above it.
          mesh.material.alpha = 1;
        }
      });
    }
  }, [basemapOpacity, showBasemap]);

  // Apply agent-scoped style changes without rebuilding the static scene.
  useEffect(() => {
    lastShotAtRef.current = performance.now();
  }, [playhead]);

  useEffect(() => {
    if (!sceneReady) return;
    const color = Color3.FromHexString(styleSettings.pointColor || '#ffffff');
    const applyMarkerMaterial = (mesh: Mesh | null, future: boolean) => {
      const material = mesh?.material;
      if (!(material instanceof StandardMaterial)) return;
      material.emissiveColor = color;
      material.diffuseColor = Color3.Black();
      material.alpha = future
        ? clamp(0.12 + styleSettings.pointGlow * 0.22, 0.05, 0.65)
        : clamp(0.45 + styleSettings.pointGlow * 0.55, 0.25, 1);
    };
    applyMarkerMaterial(pastPointsRef.current, false);
    applyMarkerMaterial(futurePointsRef.current, true);

    const glowMaterial = traverseGlowMaterialRef.current;
    if (glowMaterial) {
      glowMaterial.alpha = clamp(0.05 + styleSettings.traverseGlow * 0.2, 0.03, 0.4);
    }
    const coreMaterial = traverseCoreMaterialRef.current;
    if (coreMaterial) {
      coreMaterial.alpha = clamp(0.55 + styleSettings.traverseGlow * 0.45, 0.35, 1);
    }
  }, [sceneReady, styleSettings.pointColor, styleSettings.pointGlow, styleSettings.traverseGlow]);

  // ── 4. Update Thin-Instance Point Buffers & Floating Callouts (Zero Flicker)
  useEffect(() => {
    const scene = sceneRef.current;
    const mapping = worldRef.current;
    if (!scene || !sceneReady || !mapping) return;

    const observations = survey.observations;
    const index = clamp(playhead, 0, Math.max(0, observations.length - 1));
    const observation = observations[index];
    const setup = observation ? survey.setups.find(item => item.id === observation.setupId) : undefined;
    const equipment: EquipmentKind = equipmentOverride === 'auto'
      ? (setup?.equipment ?? 'unknown')
      : equipmentOverride;

    const currentSequence = observation?.sequence ?? 0;
    const baseMarkerScale = clamp(mapping.span * 0.0018, 0.1, 1.4) * styleSettings.pointSize;
    const instanceKey = `${survey.fileName}|${survey.parsedAt}|${currentSequence}|${showPoints}|${verticalExaggeration}|${styleSettings.pointSize}|${styleSettings.pointTtl}|${styleSettings.showFuturePoints}`;
    if (lastInstanceKeyRef.current !== instanceKey) {
      lastInstanceKeyRef.current = instanceKey;
      const pastMatrices: number[] = [];
      const futureMatrices: number[] = [];
      pointWorldRef.current.forEach(point => {
        const isPast = point.observation.sequence <= currentSequence;
        if (isPast && styleSettings.pointTtl > 0
          && observationAgeSeconds(observation, point.observation) > styleSettings.pointTtl) return;
        const scale = baseMarkerScale * (isPast ? 1 : 0.78);
        const matrix = Matrix.Scaling(scale, scale, scale);
        matrix.setTranslationFromFloats(
          point.position.x,
          point.position.y + scale * 0.55,
          point.position.z,
        );
        const destination = isPast ? pastMatrices : futureMatrices;
        for (let element = 0; element < 16; element += 1) destination.push(matrix.m[element]);
      });

      const setInstances = (mesh: Mesh | null, values: number[], visible: boolean) => {
        if (!mesh) return;
        const count = values.length / 16;
        if (!showPoints || !visible || count === 0) {
          mesh.thinInstanceCount = 0;
          mesh.setEnabled(false);
          return;
        }
        mesh.setEnabled(true);
        mesh.thinInstanceSetBuffer('matrix', new Float32Array(values), 16, false);
        mesh.thinInstanceCount = count;
      };
      setInstances(pastPointsRef.current, pastMatrices, true);
      setInstances(futurePointsRef.current, futureMatrices, styleSettings.showFuturePoints);
    }

    // Update Floating HTML Callout Label Text
    if (currentLabelRef.current && observation) {
      const pointLabel = observation.pointNumber ? `PN ${observation.pointNumber}` : `Shot #${observation.sequence}`;
      const elevText = observation.elevation != null ? ` · EL ${observation.elevation.toFixed(2)}` : '';
      currentLabelRef.current.textContent = `${pointLabel}${observation.description ? ` · ${observation.description}` : ''}${elevText}`;
    }
    if (setupLabelRef.current) {
      if (setup) {
        const hiVal = resolveHeight(setup.instrumentHeight, survey.job.units, 'instrument', defaultInstrumentHeight(survey));
        const hiUnit = survey.job.units === 'meter' ? 'm' : 'ft';
        setupLabelRef.current.textContent = `Setup ${setup.sequence + 1} · ${equipmentLabel(equipment)}${setup.occupyPoint ? ` (${setup.occupyPoint})` : ''} · HI ${hiVal.toFixed(2)} ${hiUnit}`;
      } else {
        setupLabelRef.current.textContent = equipmentLabel(equipment);
      }
    }

  }, [
    survey,
    playhead,
    equipmentOverride,
    showPoints,
    verticalExaggeration,
    styleSettings.pointSize,
    styleSettings.pointTtl,
    styleSettings.showFuturePoints,
    sceneReady,
  ]);

  // ── 5. Focus Camera on Current Shot When Requested ──────────────────────────
  useEffect(() => {
    if (focusShotSignal <= 0) return;
    const mapping = worldRef.current;
    const sampler = samplerRef.current;
    const camera = cameraRef.current;
    if (!mapping || !camera) return;
    const obs = survey.observations[clamp(playhead, 0, Math.max(0, survey.observations.length - 1))];
    if (!obs || obs.easting == null || obs.northing == null) return;
    const z = sampler
      ? sampler.resolveElevation(obs.elevation, obs.easting, obs.northing, 0)
      : (obs.elevation ?? mapping.originZ);
    const pos = mapping.toWorld(obs.easting, obs.northing, z);
    const focusRadius = clamp(mapping.span * 0.28, 28, Math.max(80, camera.radius * 0.65));
    cameraViewRef.current?.(pos, focusRadius);
  }, [focusShotSignal]);

  // ── 6. Render 3D Measurement & Polyline Authoring Overlays ──────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !sceneReady) return;
    disposeNode(authoringRootRef.current);
    const root = new TransformNode('raw-replay-authoring-root', scene);
    authoringRootRef.current = root;

    if (measureStart && !measureResult) {
      const m = MeshBuilder.CreateSphere('measure-start-pt', { diameter: 1.1, segments: 10 }, scene);
      m.parent = root;
      m.position.copyFrom(measureStart.worldPos);
      const mat = createMaterial(scene, 'measure-start-mat', '#fbbf24', 0.9);
      mat.disableLighting = true;
      m.material = mat;
      m.isPickable = false;
    }

    if (measureResult) {
      const p1 = measureResult.from.worldPos;
      const p2 = measureResult.to.worldPos;
      const corner = new Vector3(p2.x, p1.y, p2.z);

      // Direct slope line (amber) + horizontal/vertical components (cyan dashed feel)
      const slopeLine = MeshBuilder.CreateLines('measure-slope-line', {
        points: [p1, p2],
      }, scene);
      slopeLine.parent = root;
      slopeLine.color = Color3.FromHexString('#fbbf24');
      slopeLine.isPickable = false;
      slopeLine.renderingGroupId = 2;

      const legsLine = MeshBuilder.CreateLines('measure-legs-line', {
        points: [p1, corner, p2],
      }, scene);
      legsLine.parent = root;
      legsLine.color = Color3.FromHexString('#38bdf8');
      legsLine.alpha = 0.75;
      legsLine.isPickable = false;
      legsLine.renderingGroupId = 2;
    }

    if (polylineVertices.length >= 2) {
      const polyLine = MeshBuilder.CreateLines('author-polyline-preview', {
        points: polylineVertices.map(v => v.worldPos.add(new Vector3(0, 0.15, 0))),
      }, scene);
      polyLine.parent = root;
      polyLine.color = Color3.FromHexString('#10b981');
      polyLine.isPickable = false;
      polyLine.renderingGroupId = 2;
    }
  }, [sceneReady, measureStart, measureResult, polylineVertices]);

  const handleCommitPointDraft = useCallback(() => {
    if (!pendingPointDraft || !onAddPoint) return;
    onAddPoint({
      pointNumber: pendingPointDraft.pointNumber.trim() || String(nextAvailablePointNumber),
      easting: pendingPointDraft.easting,
      northing: pendingPointDraft.northing,
      elevation: pendingPointDraft.elevation,
      description: pendingPointDraft.description.trim() || '3D POINT',
    });
    setPendingPointDraft(null);
  }, [pendingPointDraft, onAddPoint, nextAvailablePointNumber]);

  const handleCommitPolyline = useCallback(() => {
    if (polylineVertices.length < 2 || !onAddLine) {
      setPolylineVertices([]);
      return;
    }
    const polyId = `poly3d-${Date.now()}`;
    for (let i = 1; i < polylineVertices.length; i++) {
      const a = polylineVertices[i - 1];
      const b = polylineVertices[i];
      onAddLine({
        id: `${polyId}-${i}`,
        from: a.pointNumber ?? `3D-${i}`,
        to: b.pointNumber ?? `3D-${i + 1}`,
        fromPt: { x: a.easting, y: a.northing, z: a.elevation },
        toPt: { x: b.easting, y: b.northing, z: b.elevation },
        color: '#22d3ee',
        polylineId: polyId,
      });
    }
    setPolylineVertices([]);
  }, [polylineVertices, onAddLine]);

  // Projected HTML Contour & Text Labels (capped for 60 FPS)
  const visibleContourLabels = useMemo(
    () => (showContours ? contourLabels.slice(0, 40) : []),
    [showContours, contourLabels],
  );
  const visibleTextAnnotations = useMemo(
    () => textAnnotations.slice(0, 30),
    [textAnnotations],
  );

  const gnssHud = useMemo(() => {
    if (!survey) return null;
    const observation = survey.observations[clamp(playhead, 0, Math.max(0, survey.observations.length - 1))];
    if (!observation) return null;
    const setup = survey.setups.find(item => item.id === observation.setupId);
    const equipment = equipmentOverride === 'auto' ? setup?.equipment : equipmentOverride;
    const isGnss = observation.kind === 'gps' || observation.gnss != null || equipment === 'gnss-rover' || equipment === 'gnss-base';
    if (!isGnss) return null;
    return {
      quality: observation.gnss?.quality ?? setup?.gnssQuality ?? 'unknown',
      satellites: observation.gnss?.satellites ?? setup?.satellites,
      reference: base?.reference ?? null,
    };
  }, [survey, playhead, equipmentOverride, base]);

  return (
    <div ref={containerRef} className="relative h-full w-full select-none overflow-hidden bg-[#061019]">
      <style>{`
        .raw-replay-label {
          position: absolute;
          top: 0;
          left: 0;
          pointer-events: none;
          white-space: nowrap;
          border-radius: 6px;
          padding: 3px 8px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: calc(10px * var(--raw-label-scale, 1));
          color: var(--raw-label-color, #ecfeff) !important;
          font-weight: 600;
          letter-spacing: 0.02em;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(6px);
          transition: opacity 120ms ease;
        }
        .raw-replay-label-current {
          background: rgba(7, 22, 34, 0.92);
          border: 1px solid rgba(34, 211, 238, 0.55);
          border-left: 3px solid #22d3ee;
          color: #ecfeff;
        }
        .raw-replay-label-setup {
          background: rgba(15, 23, 34, 0.9);
          border: 1px solid rgba(245, 158, 11, 0.5);
          border-left: 3px solid #f59e0b;
          color: #fef3c7;
        }
        .raw-replay-label-tower {
          background: rgba(15, 23, 34, 0.88);
          border: 1px solid rgba(163, 230, 53, 0.45);
          border-left: 3px solid #a3e635;
          color: #ecfccb;
        }
      `}</style>

      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none outline-none" />

      {/* Projected 3D Callout Badges */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{
          '--raw-label-color': styleSettings.labelColor,
          '--raw-label-scale': String(styleSettings.labelScale),
        } as React.CSSProperties}
      >
        <div ref={currentLabelRef} className="raw-replay-label raw-replay-label-current" style={{ display: 'none' }} />
        <div ref={setupLabelRef} className="raw-replay-label raw-replay-label-setup" style={{ display: 'none' }} />
        <div ref={towerLabelRef} className="raw-replay-label raw-replay-label-tower" style={{ display: 'none' }} />
      </div>

      {/* Total Station Optical Scope Overlay */}
      {cameraFollowMode === 'instrument-pov' && scopeHud && (
        <div className="pointer-events-none absolute inset-0 z-10">
          {scopeHud.inScope && (
            <>
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'radial-gradient(circle at 50% 50%, rgba(2,6,12,0) 0%, rgba(2,6,12,0) 30%, rgba(2,6,12,0.25) 33%, rgba(2,6,12,0.96) 35%, #02060c 46%)',
                }}
              />
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-rose-200/15"
                style={{ width: 'min(72vmin, 620px)', height: 'min(72vmin, 620px)' }}
              >
                <div className="absolute left-[8%] right-[50.4%] top-1/2 h-px bg-rose-300/75" />
                <div className="absolute left-[50.4%] right-[8%] top-1/2 h-px bg-rose-300/75" />
                <div className="absolute bottom-[50.4%] left-1/2 top-[8%] w-px bg-rose-300/75" />
                <div className="absolute bottom-[8%] left-1/2 top-[50.4%] w-px bg-rose-300/75" />
                {[-0.26, -0.18, -0.1, 0.1, 0.18, 0.26].map(offset => (
                  <div
                    key={`reticle-x-${offset}`}
                    className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-rose-300/60"
                    style={{ left: `${50 + offset * 100}%` }}
                  />
                ))}
                {[-0.2, -0.12, 0.12, 0.2].map(offset => (
                  <div
                    key={`reticle-y-${offset}`}
                    className="absolute left-1/2 h-px w-2 -translate-x-1/2 bg-rose-300/60"
                    style={{ top: `${50 + offset * 100}%` }}
                  />
                ))}
                <div className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-rose-300/35" />
                <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-200" />
              </div>
            </>
          )}

          <div className={`absolute ${leftOverlayClass} top-3 rounded-lg border border-rose-300/20 bg-[#07131d]/88 px-3 py-2 shadow-xl backdrop-blur`}>
            <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-rose-200/90">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-300 shadow-[0_0_8px_rgba(253,164,175,0.9)]" />
              Total Station · Optical
              <span className="rounded border border-rose-300/25 px-1 py-px text-[8px] tracking-normal text-rose-100/80">
                {scopeHud.magnification.toFixed(1)}×
              </span>
              {scopeHud.inScope && (
                <span className="rounded border border-cyan-300/25 px-1 py-px text-[8px] tracking-normal text-cyan-100/80">
                  ORTHO
                </span>
              )}
            </div>
            <div className="mt-1 font-mono text-[10px] text-slate-300">{scopeHud.targetLabel}</div>
          </div>

          <div className="absolute bottom-3 right-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-white/10 bg-[#07131d]/88 px-3 py-2 font-mono text-[10px] text-slate-300 shadow-lg backdrop-blur">
            <span>AZ <b className="float-right text-cyan-200">{scopeHud.azDeg.toFixed(3)}°</b></span>
            <span>ZA <b className="float-right text-cyan-200">{scopeHud.zaDeg.toFixed(3)}°</b></span>
            <span>SD <b className="float-right text-slate-100">{scopeHud.slopeDist.toFixed(3)}</b></span>
            <span>HD <b className="float-right text-slate-100">{scopeHud.horizDist.toFixed(3)}</b></span>
            <span>HI <b className="float-right text-slate-100">{scopeHud.hi.toFixed(3)}</b></span>
            <span>HR <b className="float-right text-slate-100">{scopeHud.hr.toFixed(3)}</b></span>
          </div>

          {!scopeHud.inScope && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-cyan-300/25 bg-[#07131d]/88 px-3 py-1 text-[10px] text-slate-300 shadow-lg backdrop-blur">
              Scroll up to move from behind the tripod into the eyepiece and reticle.
            </div>
          )}
        </div>
      )}


      {skyState && !(cameraFollowMode === 'instrument-pov' && scopeHud) && (
        <div className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-md border border-white/10 bg-[#07131d]/88 px-2.5 py-1.5 font-mono text-[9px] text-slate-400 shadow-lg backdrop-blur">
          <div className="flex items-center gap-2 text-[8px] uppercase tracking-[0.14em] text-slate-500">
            <span className="text-cyan-200/80">Sky</span>
            <span>{skyState.timeLabel}</span>
            {(skyState.approximateLocation || skyState.approximateTime) && <span className="text-amber-300/80">approx</span>}
          </div>
          <div className="mt-0.5 flex items-center gap-2.5">
            <span>SUN <b className="font-normal text-amber-200">{skyState.sunAltitudeDeg.toFixed(0)}°</b></span>
            <span>MOON <b className="font-normal text-slate-200">{skyState.moonAltitudeDeg.toFixed(0)}° · {(skyState.moonIllumination * 100).toFixed(0)}%</b></span>
          </div>
          <div className="mt-0.5 text-[8px] text-slate-500">
            {skyState.visiblePlanets.length > 0 ? skyState.visiblePlanets.join(' · ') : 'No planets above the horizon'}
          </div>
        </div>
      )}

      {/* Interactive 3D View Cube / Compass Orientation Gizmo (Top-Right) */}
      <div className="pointer-events-auto absolute right-3 top-14 z-20 flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-2 rounded-lg border border-cyan-400/20 bg-[#07131d]/90 p-2 shadow-xl backdrop-blur">
          <button
            type="button"
            onClick={() => driveViewRef.current?.(-Math.PI / 2, 0.008)}
            title="Click to orient North-Up Top View (T)"
            className="relative flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/25 bg-[#091926] hover:border-cyan-300/60"
          >
            <div ref={compassDialRef} className="relative h-8 w-8 transition-transform duration-75">
              <span className="absolute left-1/2 top-0 -translate-x-1/2 text-[8px] font-bold text-rose-400">N</span>
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[7px] text-slate-500">S</span>
              <span className="absolute right-0 top-1/2 -translate-y-1/2 text-[7px] text-slate-500">E</span>
              <span className="absolute left-0 top-1/2 -translate-y-1/2 text-[7px] text-slate-500">W</span>
              <div className="absolute left-1/2 top-1.5 h-2.5 w-0.5 -translate-x-1/2 rounded-full bg-rose-400" />
              <div className="absolute bottom-1.5 left-1/2 h-2.5 w-0.5 -translate-x-1/2 rounded-full bg-slate-600" />
            </div>
          </button>

          <div className="grid grid-cols-3 gap-1 text-[9px] font-semibold">
            <button
              type="button"
              onClick={() => driveViewRef.current?.(-Math.PI / 2, 0.008)}
              className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-1 text-slate-300 hover:border-cyan-300/40 hover:text-cyan-100"
              title="Top View (T)"
            >
              TOP
            </button>
            <button
              type="button"
              onClick={() => driveViewRef.current?.(-Math.PI / 2, 1.12)}
              className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-1 text-slate-300 hover:border-cyan-300/40 hover:text-cyan-100"
              title="Front View (F)"
            >
              FRT
            </button>
            <button
              type="button"
              onClick={() => driveViewRef.current?.(0, 1.12)}
              className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-1 text-slate-300 hover:border-cyan-300/40 hover:text-cyan-100"
              title="Right Side View"
            >
              RGT
            </button>
            <button
              type="button"
              onClick={() => driveViewRef.current?.(-Math.PI / 4, 0.94)}
              className="rounded border border-cyan-400/25 bg-cyan-400/10 px-1.5 py-1 text-cyan-200 hover:border-cyan-300/60"
              title="Isometric 3D View (I)"
            >
              ISO
            </button>
            <button
              type="button"
              onClick={() => toggleOrthoRef.current?.()}
              className={`rounded border px-1.5 py-1 ${
                isOrtho
                  ? 'border-amber-400/45 bg-amber-400/15 text-amber-200'
                  : 'border-white/10 bg-white/[0.04] text-slate-300 hover:border-cyan-300/40'
              }`}
              title="Toggle Perspective / Orthographic Projection (P)"
            >
              {isOrtho ? 'ORTHO' : 'PERSP'}
            </button>
            <button
              type="button"
              onClick={() => frameCameraRef.current?.()}
              className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-1 text-slate-300 hover:border-cyan-300/40 hover:text-cyan-100"
              title="Zoom Extents (Home)"
            >
              FIT
            </button>
          </div>
        </div>

        {basemapStatus && (
          <div className="flex items-center gap-2 rounded border border-cyan-300/20 bg-[#07131d]/90 px-2.5 py-1 text-[10px] text-slate-300 shadow-lg backdrop-blur">
            <span>{basemapStatus}</span>
            {!settings?.projection?.epsg && onRequestProjection && (
              <button
                type="button"
                onClick={onRequestProjection}
                className="rounded bg-cyan-400 px-1.5 py-0.5 text-[9px] font-semibold text-slate-950 hover:bg-cyan-300"
              >
                Set EPSG
              </button>
            )}
          </div>
        )}

        {gnssHud && (
          <div className="pointer-events-none flex items-center gap-2 rounded-md border border-emerald-300/25 bg-[#07131d]/90 px-2.5 py-1 font-mono text-[9px] text-slate-300 shadow-lg backdrop-blur">
            <span className={`h-1.5 w-1.5 rounded-full ${gnssHud.quality === 'fixed' ? 'bg-emerald-300' : 'bg-amber-300'}`} />
            <span className="font-semibold uppercase tracking-wide text-emerald-200/90">GNSS {gnssHud.quality}</span>
            {gnssHud.satellites != null && <span className="text-cyan-200">{gnssHud.satellites} SV</span>}
            <span className="text-slate-500" title="The raw file supplies the satellite count; per-satellite azimuth/elevation are representative sky geometry.">base + rover</span>
            <span className="rounded border border-white/10 px-1 py-px text-[8px] uppercase text-slate-400">
              {gnssHud.reference === 'local-base' ? 'local base' : gnssHud.reference === 'network-base' ? 'network/VRS' : 'approx ref'}
            </span>
          </div>
        )}
      </div>

      {/* 3D Measurement Callout Card */}
      {(measureStart || measureResult) && (
        <div className={`pointer-events-auto absolute ${leftOverlayClass} top-14 z-20 w-72 rounded-lg border border-amber-400/35 bg-[#081520]/95 p-3 text-xs text-slate-100 shadow-2xl backdrop-blur`}>
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300">3D Inverse / Measure</span>
            <button
              type="button"
              onClick={() => { setMeasureStart(null); setMeasureResult(null); }}
              className="text-[10px] text-slate-400 hover:text-slate-200"
            >
              Clear
            </button>
          </div>
          {measureStart && !measureResult && (
            <div className="mt-2 text-[11px] text-slate-300">
              <div>Start: <span className="font-mono text-amber-200">{measureStart.label}</span></div>
              <div className="mt-1 text-[10px] text-slate-400">Click a second 3D point or surface location to measure.</div>
            </div>
          )}
          {measureResult && (
            <div className="mt-2 space-y-1 text-[11px]">
              <div className="flex justify-between text-slate-400">
                <span>From → To</span>
                <span className="font-mono text-slate-200">{measureResult.from.label} → {measureResult.to.label}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Slope Distance</span>
                <span className="font-mono font-semibold text-amber-300">{measureResult.slopeDist.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Horiz Distance</span>
                <span className="font-mono text-cyan-200">{measureResult.horizDist.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Elevation ΔZ</span>
                <span className="font-mono text-emerald-300">{measureResult.deltaZ >= 0 ? '+' : ''}{measureResult.deltaZ.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Bearing</span>
                <span className="font-mono text-slate-200">{measureResult.bearingText}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Slope / Grade</span>
                <span className="font-mono text-slate-200">{measureResult.gradePercent >= 0 ? '+' : ''}{measureResult.gradePercent.toFixed(2)}%</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3D Point Placement Popover */}
      {pendingPointDraft && onAddPoint && (
        <div className={`pointer-events-auto absolute ${leftOverlayClass} top-14 z-20 w-72 rounded-lg border border-cyan-400/35 bg-[#081520]/95 p-3 text-xs text-slate-100 shadow-2xl backdrop-blur`}>
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">Place 3D Survey Point</span>
            <button type="button" onClick={() => setPendingPointDraft(null)} className="text-[10px] text-slate-400 hover:text-slate-200">Cancel</button>
          </div>
          <div className="mt-2 space-y-2 text-[11px]">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] text-slate-400">
                Point #
                <input
                  type="text"
                  value={pendingPointDraft.pointNumber}
                  onChange={e => setPendingPointDraft(d => d ? { ...d, pointNumber: e.target.value } : null)}
                  className="mt-0.5 w-full rounded border border-white/15 bg-slate-900 px-2 py-1 font-mono text-xs text-slate-100"
                />
              </label>
              <label className="text-[10px] text-slate-400">
                Elevation (Z)
                <input
                  type="number"
                  step="0.01"
                  value={pendingPointDraft.elevation}
                  onChange={e => setPendingPointDraft(d => d ? { ...d, elevation: Number(e.target.value) } : null)}
                  className="mt-0.5 w-full rounded border border-white/15 bg-slate-900 px-2 py-1 font-mono text-xs text-slate-100"
                />
              </label>
            </div>
            <label className="block text-[10px] text-slate-400">
              Description
              <input
                type="text"
                value={pendingPointDraft.description}
                onChange={e => setPendingPointDraft(d => d ? { ...d, description: e.target.value } : null)}
                className="mt-0.5 w-full rounded border border-white/15 bg-slate-900 px-2 py-1 text-xs text-slate-100"
              />
            </label>
            <div className="font-mono text-[10px] text-slate-400">
              N {pendingPointDraft.northing.toFixed(2)} · E {pendingPointDraft.easting.toFixed(2)}
            </div>
            <button
              type="button"
              onClick={handleCommitPointDraft}
              className="w-full rounded bg-cyan-400 py-1.5 text-[11px] font-semibold text-slate-950 hover:bg-cyan-300"
            >
              Commit Point to Project
            </button>
          </div>
        </div>
      )}

      {/* 3D Polyline Authoring Bar */}
      {active3DTool === 'polyline' && (
        <div className={`pointer-events-auto absolute ${leftOverlayClass} top-14 z-20 flex items-center gap-2 rounded-lg border border-emerald-400/35 bg-[#081520]/95 px-3 py-2 text-xs text-slate-100 shadow-2xl backdrop-blur`}>
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
            3D Polyline ({polylineVertices.length} pts)
          </span>
          <button
            type="button"
            disabled={polylineVertices.length < 2}
            onClick={handleCommitPolyline}
            className="rounded bg-emerald-400 px-2.5 py-1 text-[10px] font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-40"
          >
            Finish Linework
          </button>
          <button
            type="button"
            onClick={() => setPolylineVertices([])}
            className="rounded border border-white/15 px-2 py-1 text-[10px] text-slate-300 hover:bg-white/5"
          >
            Clear
          </button>
        </div>
      )}

      {/* 3D Entity Inspection Card */}
      {inspectedEntity && (
        <div className={`pointer-events-auto absolute ${leftOverlayClass} top-14 z-20 w-64 rounded-lg border border-cyan-400/30 bg-[#081520]/95 p-3 text-xs text-slate-100 shadow-2xl backdrop-blur`}>
          <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-1.5">
            <div>
              <div className="font-mono text-xs font-semibold text-cyan-200">{inspectedEntity.title}</div>
              {inspectedEntity.subtitle && <div className="text-[9px] uppercase tracking-wider text-slate-400">{inspectedEntity.subtitle}</div>}
            </div>
            <button type="button" onClick={() => setInspectedEntity(null)} className="text-[10px] text-slate-400 hover:text-slate-200">✕</button>
          </div>
          <dl className="mt-2 space-y-1 text-[11px]">
            {inspectedEntity.details.map(item => (
              <div key={item.label} className="flex justify-between gap-2">
                <dt className="text-slate-400">{item.label}</dt>
                <dd className="truncate font-mono text-slate-200">{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Floating Hover Quickview */}
      {hoverQuickView && (
        <div
          className="pointer-events-none absolute z-30 w-60 overflow-hidden rounded-lg border border-cyan-400/30 bg-[#07131d]/95 text-[10px] text-slate-200 shadow-2xl backdrop-blur"
          style={{ left: hoverQuickView.x, top: hoverQuickView.y }}
        >
          <div className="flex items-start justify-between gap-2 border-b border-white/10 px-2.5 py-1.5">
            <div className="min-w-0">
              <div className="truncate font-mono text-[11px] font-semibold text-cyan-200">{hoverQuickView.title}</div>
              <div className="text-[8px] uppercase tracking-[0.14em] text-slate-500">{hoverQuickView.subtitle}</div>
            </div>
            {hoverQuickView.reflectorless && (
              <span className="shrink-0 rounded border border-red-400/40 bg-red-500/15 px-1 py-0.5 text-[7px] font-bold uppercase tracking-wider text-red-300">
                Reflectorless
              </span>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 px-2.5 py-1.5 font-mono text-[10px]">
            <dt className="text-slate-500">N</dt>
            <dd className="text-right text-slate-200">{hoverQuickView.northing.toFixed(2)}</dd>
            <dt className="text-slate-500">E</dt>
            <dd className="text-right text-slate-200">{hoverQuickView.easting.toFixed(2)}</dd>
            <dt className="text-slate-500">EL</dt>
            <dd className="text-right text-cyan-300">{hoverQuickView.elevation.toFixed(2)}</dd>
            {hoverQuickView.pointNumber && (
              <>
                <dt className="text-slate-500">PN</dt>
                <dd className="text-right text-slate-200">{hoverQuickView.pointNumber}</dd>
              </>
            )}
          </dl>
          {hoverQuickView.description && (
            <div className="border-t border-white/10 px-2.5 py-1.5 text-[9px] leading-4 text-slate-400">
              {hoverQuickView.description}
            </div>
          )}
        </div>
      )}

      {/* Live 3D Cursor Coordinate & Snap Readout Pill (Bottom-Left) */}
      {cursorCoords && (
        <div className={`pointer-events-none absolute bottom-3 ${leftOverlayClass} z-10 flex items-center gap-2.5 rounded-md border border-white/10 bg-[#07131d]/85 px-2.5 py-1 font-mono text-[10px] text-slate-300 shadow-lg backdrop-blur`}>
          {cursorCoords.snapLabel && (
            <span className="rounded bg-emerald-400/20 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">
              SNAP · {cursorCoords.snapLabel}
            </span>
          )}
          <span>N {cursorCoords.n.toFixed(2)}</span>
          <span>E {cursorCoords.e.toFixed(2)}</span>
          <span className="text-cyan-300">EL {cursorCoords.z.toFixed(2)}</span>
          {verticalExaggeration !== 1 && (
            <span className="rounded border border-amber-400/30 bg-amber-400/10 px-1 text-[9px] text-amber-200">
              Z×{verticalExaggeration.toFixed(1)}
            </span>
          )}
          <span className="hidden text-[9px] text-slate-500 xl:inline">
            {visibleContourLabels.length > 0 ? `${visibleContourLabels.length} contour lbls · ` : ''}
            {visibleTextAnnotations.length > 0 ? `${visibleTextAnnotations.length} notes` : ''}
          </span>
        </div>
      )}

      {fatalError && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#071018]/95 p-6">
          <div className="max-w-md rounded-lg border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-amber-100">
            <div className="mb-2 font-semibold">3D view could not start</div>
            <p className="text-amber-100/80">{fatalError}</p>
            <p className="mt-3 text-xs text-amber-100/60">The drawing, Summary and field record remain available. Enable WebGL 2 to use the 3D scene.</p>
          </div>
        </div>
      )}    </div>
  );
}
