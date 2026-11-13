/**
 * civilDrafterVision.ts
 *
 * Civil Drafter Gimbal Vision System
 * ───────────────────────────────────
 * Gives the Civil Drafter AI a multi-zoom "camera" that can look at the survey
 * scene — wide angle first, then progressive zoom into every region of
 * interest — before generating linework.
 *
 * How it works:
 *  1. Renders the canvas to an offscreen HTMLCanvasElement at several viewports.
 *  2. Each viewport is captured as a base64 PNG (no upload, entirely client-side).
 *  3. The frames are assembled into a Gemini multimodal Part[] alongside the
 *     spatial narrative so the model "sees" the data before drafting.
 *
 * Visual survey sequence:
 *   Frame 1 – OVERVIEW    Full survey extent (all points visible)
 *   Frame 2–N – ZONES     Zoom into top-N density grid cells (4×3 grid)
 *   Frame N+1–M – DETAIL  Tight zoom on the 2 busiest clusters
 */

import type { SurveyPoint, SurveyLine, BoundaryFile } from '../types';
import { parseBearingToRadians, parseDistance, direct, directCurve } from './cogo';
import { resolveArcGeometry } from './offsetGeometry';
import { inferParcelGapRoads } from './parcelRoadInference';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface BoundaryVertex {
  easting: number;
  northing: number;
  label?: string;
}

export interface BoundarySegment {
  fromPt: { easting: number; northing: number };
  toPt: { easting: number; northing: number };
  isCurve?: boolean;
  curveRadius?: number;
  arcLength?: number;
  curveDirection?: 'left' | 'right';
  label?: string;
}

export interface VisionFrame {
  /** Base64-encoded PNG (no data URI prefix) */
  base64: string;
  /** Short label rendered on the frame image */
  label: string;
  /** Verbose description sent as text to the model */
  description: string;
  /** Points whose bounding box intersects this viewport */
  pointCount: number;
  /** Zoom multiplier relative to the overview frame (1.0 = full extent) */
  zoomLevel: number;
  width: number;
  height: number;
  /** Survey coordinate bounds of this viewport */
  bounds: { minE: number; maxE: number; minN: number; maxN: number };
  /** Top-N description categories visible in this frame */
  topDescriptions: string[];
}

/** A capture is either the primary point/parcel geometry pass or a separate
 * background-only pass. The two are never composited into the same frame. */
export type VisionPass = 'geometry' | 'imagery';

export interface VisionSurvey {
  frames: VisionFrame[];
  /** Multi-sentence spatial narrative injected before the user query */
  spatialNarrative: string;
  totalPoints: number;
  totalLines: number;
  surveyExtentFt: { width: number; height: number };
  capturedAt: number;
  /** Which pass produced these frames. Defaults to the geometry pass. */
  pass?: VisionPass;
  hasBackgroundImagery?: boolean;
  /** False when parcel/frontage lines were used for grounding but deliberately
   *  left out of the raster so the road evidence stays legible. */
  parcelLinesRendered?: boolean;
}

export interface MapOverlayTile {
  image: CanvasImageSource;
  bbox: [number, number, number, number];
  quad?: [number, number][];
  opacity?: number;
}

export interface VisionFailureWindow {
  /** Corridor label, e.g. R2. */
  corridorId: string;
  /** Gate that produced this window, e.g. continuity. */
  gate: string;
  stationStartFt: number;
  stationEndFt: number;
  bounds: { minE: number; maxE: number; minN: number; maxN: number };
  /** Pre-formatted label shown on the frame and in the prompt. */
  label: string;
}

export interface VisionDefectMarker {
  easting: number;
  northing: number;
  label: string;
  severity: 'red' | 'amber';
}

export interface VisionCaptureOptions {
  /** Maximum cluster-zoom frames to capture (default 5) */
  maxClusterFrames?: number;
  /** Maximum detail (tight-zoom) frames to capture (default 2) */
  maxDetailFrames?: number;
  canvasWidth?: number;
  canvasHeight?: number;
  /** Optional boundary files to render onto the vision frames and use for extent calculation */
  boundaryFiles?: BoundaryFile[];
  /** Optional background image / aerial photo to composite onto the canvas frames */
  backgroundImage?: {
    image: CanvasImageSource;
    bounds?: { minE: number; maxE: number; minN: number; maxN: number };
  } | null;
  /** Optional map overlay tiles directly from the canvas (e.g. NAIP or Google basemap).
   *  Only rendered when `pass` is `'imagery'`. */
  mapTiles?: MapOverlayTile[];
  /**
   * Evidence pass. `geometry` is the primary point/parcel pass and deliberately
   * renders no background imagery. `imagery` is a separate background-only
   * pass. Defaults to `geometry`.
   */
  pass?: VisionPass;
  /** Render survey points, parcel/boundary linework and labels. Default true. */
  renderVectors?: boolean;
  /** Draw parcel/tax-lot linework into the frames. They still participate in
   *  parcel-gap inference and grounding when false. Defaults to true. */
  renderParcelLines?: boolean;
  /**
   * Second Gimbal inspection: render the just-drafted take over the field
   * shots (overview + corridor sweep) and label the frames as PASS 2 so the
   * redraw model can see its own first attempt. Geometry-only; never imagery.
   */
  draftInspection?: boolean;
  /** Targeted pass-2 windows. When present, only the overview and these
   *  windows are captured — no zone/detail tour. */
  failureWindows?: VisionFailureWindow[];
  /** Pass-1 target geometry, rendered dashed magenta under the current take. */
  referenceLines?: SurveyLine[];
  /** Defect pins rendered at the failed station with a short label. */
  defectMarkers?: VisionDefectMarker[];
  /** Active area of interest in project coordinates. When present, it replaces
   *  the computed survey extent so Surveyors Eye only frames the held AOI. */
  aoiBounds?: { minE: number; maxE: number; minN: number; maxN: number };
}

/** Parcel/tax-lot linework is grounding evidence, not road pavement geometry. */
export function isParcelVisionLine(line: Pick<SurveyLine, 'type' | 'layer'>): boolean {
  return line.type === 'parcel' || /PARCEL|TAX.?LOT|CADASTRE/i.test(line.layer ?? '');
}

/**
 * Road takes keep parcel frontage in memory but out of the raster. Keeping this
 * filter pure makes the visual scope testable without a canvas.
 */
export function filterVisionRenderLines<T extends Pick<SurveyLine, 'type' | 'layer'>>(
  lines: T[],
  renderParcelLines = true,
): T[] {
  return renderParcelLines ? lines : lines.filter(line => !isParcelVisionLine(line));
}

/** Clamp a camera window to the held AOI. Returns null when the window is fully
 *  outside it, so no frame can show land beyond the area of interest. */
export function clampVisionBoundsToAoi(
  bounds: { minE: number; maxE: number; minN: number; maxN: number },
  aoi: { minE: number; maxE: number; minN: number; maxN: number } | null | undefined,
): { minE: number; maxE: number; minN: number; maxN: number } | null {
  if (!aoi) return bounds;
  const clipped = {
    minE: Math.max(bounds.minE, aoi.minE),
    maxE: Math.min(bounds.maxE, aoi.maxE),
    minN: Math.max(bounds.minN, aoi.minN),
    maxN: Math.min(bounds.maxN, aoi.maxN),
  };
  return clipped.minE < clipped.maxE && clipped.minN < clipped.maxN ? clipped : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_W = 800;
const DEFAULT_H = 600;
// Vision frames get their own, larger raster. This is deliberately separate
// from DEFAULT_W/H, which is also used by featureTrace coordinate conversion.
// Higher-resolution frames carry more shot detail per glance. The model has
// the headroom; road edges and shot spacing need the extra pixels.
const VISION_W  = 1600;
const VISION_H  = 1200;
const MARGIN    = 48; // px padding around rendered survey bounds

// ─────────────────────────────────────────────────────────────────────────────
// Colour helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Survey description → point colour (based on industry naming conventions) */
const DESC_PALETTE: Array<[RegExp, string]> = [
  [/^(EP|EOP|EDGE|ROAD|ROW|DYL|DBL)/i,                      '#FFD700'], // road edge/paint – gold
  [/^(WL|SWL|W\/L)/i,                                       '#FFFFFF'], // white line paint – white
  [/^(TC|BC|DEP|CURB|GUTTER|GR|FL|RAMP)/i,                     '#FFC107'], // curb / flow   – amber
  [/^(BLDG|WALL|COR|CORNER|FOUND|FOOTING|FND)/i,           '#FF8C00'], // building      – orange
  [/^(TREE|VEG|SHRUB|PLANT|BRUSH|HEDGE)/i,                 '#4CAF50'], // vegetation    – green
  [/^(CL|CENTER|C\/L|STA|STAT)/i,                          '#FF4081'], // centreline    – pink
  [/^(UTIL|MH|WM|WL|GV|ELEC|TEL|GAS|SS|WW|HYDRANT|CB)/i,  '#64B5F6'], // utility       – light blue
  [/^(PROP|IRON|RIR|MON|MONUMENT|SPIKE|PIN|STAKE|BM)/i,    '#CE93D8'], // boundary/mon  – lavender
  [/^(FENCE|RET|RETWALL|WALL)/i,                           '#FF7043'], // fence/wall    – deep orange
  [/^(DITCH|SW|SWALE|STREAM|CREEK|WATER|POND|LAKE)/i,     '#4DD0E1'], // water/drain   – cyan
  [/^(SHOT|TMP|TEMP|TP|HUB|SETUP)/i,                       '#90A4AE'], // setup/temp    – grey-blue
  [/^(SIGN|SIGNAL|LIGHT|LAMP)/i,                           '#FFD54F'], // signage       – light gold
  [/^(RR|RAIL|TRACK)/i,                                    '#A1887F'], // rail          – brown
];

function descColor(desc: string | undefined): string {
  const d = (desc ?? '').trim().toUpperCase();
  for (const [rx, col] of DESC_PALETTE) {
    if (rx.test(d)) return col;
  }
  return '#B0BEC5'; // default silver
}

const ROAD_CORRIDOR_POINT_RE = /^(EP|EOP|EDGE|ER|ES|EG|EC|ET|ROAD|ROW|CL|C\/L|CENTER|CTR|CURB|GUTTER|TC|BC|DEP|TBC|FL|FLOW|PAV|PVMT|DYL|WL|SWL|SHOULDER|SHLD|(?:POC|PC|PT)\b)/i;

/** True when a shot belongs to the road corridor rather than site/topo clutter. */
export function isRoadCorridorPoint(p: SurveyPoint): boolean {
  return ROAD_CORRIDOR_POINT_RE.test((p.description ?? '').trim());
}

/** Deterministic colour derived from a CAD layer name */
function layerColor(layer: string | undefined): string {
  const PALETTE = [
    '#FFD700', '#FF8C00', '#FF4081', '#64B5F6', '#4CAF50',
    '#CE93D8', '#4DD0E1', '#FF7043', '#FFC107', '#80CBC4',
    '#AED581', '#F48FB1', '#81D4FA', '#FFCC02', '#A5D6A7',
  ];
  let h = 5381;
  for (let i = 0; i < (layer ?? '').length; i++) {
    h = (h * 33) ^ layer!.charCodeAt(i);
  }
  return PALETTE[Math.abs(h) % PALETTE.length];
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometry helpers
// ─────────────────────────────────────────────────────────────────────────────

interface Extent {
  minE: number; maxE: number;
  minN: number; maxN: number;
  cE: number;   cN: number;
  spanE: number; spanN: number;
}

/**
 * Extract 2D boundary line segments and vertex positions from BoundaryFile items.
 */
export function extractBoundaryGeometry(
  boundaryFiles: BoundaryFile[] = [],
  pointMap: Map<string, { easting: number; northing: number }> = new Map(),
): { vertices: BoundaryVertex[]; segments: BoundarySegment[] } {
  const vertices: BoundaryVertex[] = [];
  const segments: BoundarySegment[] = [];

  for (const bf of boundaryFiles) {
    if (bf.hidden || !bf.calls || bf.calls.length === 0) continue;
    const synthMap = new Map<string, { easting: number; northing: number }>();
    const lookupPt = (pn: string | undefined): { easting: number; northing: number } | undefined => {
      if (!pn) return undefined;
      const pm = pointMap.get(pn);
      if (pm) return { easting: pm.easting, northing: pm.northing };
      return synthMap.get(pn);
    };

    const firstCall = bf.calls[0];
    const pobFromMap = firstCall.from ? pointMap.get(firstCall.from) : undefined;
    const pob: { easting: number; northing: number } = pobFromMap
      ? { easting: pobFromMap.easting, northing: pobFromMap.northing }
      : bf.pobOverride
      ? { easting: bf.pobOverride.easting, northing: bf.pobOverride.northing }
      : { easting: 0, northing: 0 };

    if (firstCall.from) synthMap.set(firstCall.from, pob);
    let cursor = pob;
    const rawSegments: BoundarySegment[] = [];

    for (const call of bf.calls) {
      const fromHere = lookupPt(call.from) ?? cursor;
      if (!fromHere) continue;
      let endPt: { easting: number; northing: number } | null = null;
      if (call.isCurve && typeof call.curveRadius === 'number' && Number.isFinite(call.curveRadius)
          && typeof call.arcLength === 'number' && Number.isFinite(call.arcLength) && call.arcLength !== 0) {
        const centralAngle = call.arcLength / call.curveRadius;
        const chordStr = call.chordBearing || call.bearing;
        const chordRad = chordStr ? parseBearingToRadians(chordStr) : null;
        if (chordRad !== null) {
          endPt = directCurve(fromHere, chordRad - centralAngle / 2, call.curveRadius, centralAngle);
        }
      } else {
        const bStr = call.bearing || call.chordBearing;
        const bRad = bStr ? parseBearingToRadians(bStr) : null;
        const dist = call.distance
          ? parseDistance(call.distance)
          : (typeof (call as any).distanceFt === 'number' ? (call as any).distanceFt : null);
        if (bRad !== null && typeof dist === 'number' && Number.isFinite(dist)) {
          endPt = direct(fromHere, bRad, dist);
        }
      }
      if (endPt) {
        if (call.to && !lookupPt(call.to)) synthMap.set(call.to, endPt);
        rawSegments.push({
          fromPt: fromHere,
          toPt: endPt,
          isCurve: call.isCurve,
          curveRadius: call.curveRadius,
          arcLength: call.arcLength,
          curveDirection: call.curveDirection,
          label: `${call.bearing || ''} ${call.distance || ''}`.trim(),
        });
        cursor = endPt;
      }
    }

    const bfFirstPt = lookupPt(bf.calls[0].from);
    const bfTxE = bf.translationE ?? 0;
    const bfTxN = bf.translationN ?? 0;
    const bfRotRad = ((bf.rotationDeg ?? 0) * Math.PI) / 180;
    const hasTransform = (bfTxE !== 0 || bfTxN !== 0 || bfRotRad !== 0) && !!bfFirstPt;

    const transformPoint = (pt: { easting: number; northing: number }) => {
      let e = pt.easting, n = pt.northing;
      if (hasTransform && bfFirstPt) {
        const dx = e - bfFirstPt.easting;
        const dy = n - bfFirstPt.northing;
        e = bfFirstPt.easting + (dx * Math.cos(bfRotRad) - dy * Math.sin(bfRotRad)) + bfTxE;
        n = bfFirstPt.northing + (dx * Math.sin(bfRotRad) + dy * Math.cos(bfRotRad)) + bfTxN;
      }
      return { easting: e, northing: n };
    };

    for (const [key, pt] of synthMap.entries()) {
      const transformed = transformPoint(pt);
      vertices.push({ ...transformed, label: key });
    }

    for (const seg of rawSegments) {
      segments.push({
        ...seg,
        fromPt: transformPoint(seg.fromPt),
        toPt: transformPoint(seg.toPt),
      });
    }
  }

  return { vertices, segments };
}

function computeExtent(
  pts: SurveyPoint[],
  lines: SurveyLine[] = [],
  boundaryVertices: BoundaryVertex[] = [],
): Extent | null {
  let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
  let count = 0;

  for (const p of pts) {
    if (!Number.isFinite(p.easting) || !Number.isFinite(p.northing)) continue;
    if (p.easting < minE) minE = p.easting;
    if (p.easting > maxE) maxE = p.easting;
    if (p.northing < minN) minN = p.northing;
    if (p.northing > maxN) maxN = p.northing;
    count++;
  }

  for (const l of lines) {
    if (l.hidden) continue;

    // A circle's stored endpoints are its center, so using only from/to clips
    // the vision frame to the middle of the circle. Include the full radius.
    // Legacy full circles may omit `isCircle` but still have coincident
    // endpoints and no chord/tangent bearings.
    const endpointsCoincide = Boolean(
      l.fromPt &&
      l.toPt &&
      Math.hypot(l.fromPt.x - l.toPt.x, l.fromPt.y - l.toPt.y) < 1e-6,
    );
    const circleLike = Boolean(
      l.isCircle ||
      (l.isCurve && l.curveRadius && endpointsCoincide && !l.chordBearing && !l.tangentBearing),
    );
    if (circleLike) {
      const center = l.circleCenter ?? l.fromPt;
      const radius = l.curveRadius ?? 0;
      if (center && Number.isFinite(center.x) && Number.isFinite(center.y) && radius > 0) {
        minE = Math.min(minE, center.x - radius);
        maxE = Math.max(maxE, center.x + radius);
        minN = Math.min(minN, center.y - radius);
        maxN = Math.max(maxN, center.y + radius);
        count++;
        continue;
      }
    }

    if (l.fromPt && Number.isFinite(l.fromPt.x) && Number.isFinite(l.fromPt.y)) {
      if (l.fromPt.x < minE) minE = l.fromPt.x;
      if (l.fromPt.x > maxE) maxE = l.fromPt.x;
      if (l.fromPt.y < minN) minN = l.fromPt.y;
      if (l.fromPt.y > maxN) maxN = l.fromPt.y;
      count++;
    }
    if (l.toPt && Number.isFinite(l.toPt.x) && Number.isFinite(l.toPt.y)) {
      if (l.toPt.x < minE) minE = l.toPt.x;
      if (l.toPt.x > maxE) maxE = l.toPt.x;
      if (l.toPt.y < minN) minN = l.toPt.y;
      if (l.toPt.y > maxN) maxN = l.toPt.y;
      count++;
    }
  }

  for (const v of boundaryVertices) {
    if (!Number.isFinite(v.easting) || !Number.isFinite(v.northing)) continue;
    if (v.easting < minE) minE = v.easting;
    if (v.easting > maxE) maxE = v.easting;
    if (v.northing < minN) minN = v.northing;
    if (v.northing > maxN) maxN = v.northing;
    count++;
  }

  if (count === 0 || !Number.isFinite(minE) || !Number.isFinite(maxE)) return null;
  const spanE = Math.max(maxE - minE, 1);
  const spanN = Math.max(maxN - minN, 1);
  return { minE, maxE, minN, maxN, cE: (minE + maxE) / 2, cN: (minN + maxN) / 2, spanE, spanN };
}

/** Survey-to-screen coordinate transform for a given viewport */
export function makeTransform(
  minE: number, maxE: number,
  minN: number, maxN: number,
  W: number, H: number,
  margin: number,
) {
  const spanE = Math.max(maxE - minE, 1);
  const spanN = Math.max(maxN - minN, 1);
  const scaleX = (W - 2 * margin) / spanE;
  const scaleY = (H - 2 * margin) / spanN;
  const scale  = Math.min(scaleX, scaleY);
  const offX   = margin + ((W - 2 * margin) - spanE * scale) / 2;
  const offY   = margin + ((H - 2 * margin) - spanN * scale) / 2;

  return {
    scale,
    toScreen(e: number, n: number): [number, number] {
      return [
        offX + (e - minE) * scale,
        H - offY - (n - minN) * scale, // north = up → flip Y
      ];
    },
    toWorld(screenX: number, screenY: number): [number, number] {
      return [
        minE + (screenX - offX) / scale,
        minN + (H - offY - screenY) / scale,
      ];
    },
  };
}

export function convertNormPosToWorld(
  normPos: [number, number] | { y: number; x: number },
  bounds: { minE: number; maxE: number; minN: number; maxN: number },
  canvasWidth: number = DEFAULT_W,
  canvasHeight: number = DEFAULT_H,
  margin: number = MARGIN,
): { easting: number; northing: number } {
  const y = Array.isArray(normPos) ? normPos[0] : normPos.y;
  const x = Array.isArray(normPos) ? normPos[1] : normPos.x;
  const { toWorld } = makeTransform(bounds.minE, bounds.maxE, bounds.minN, bounds.maxN, canvasWidth, canvasHeight, margin);
  const screenX = (x / 1000) * canvasWidth;
  const screenY = (y / 1000) * canvasHeight;
  const [easting, northing] = toWorld(screenX, screenY);
  return { easting, northing };
}

export interface CorridorWindow {
  minE: number;
  maxE: number;
  minN: number;
  maxN: number;
  /** Along-corridor distance from the first road shot, in feet. */
  alongStartFt: number;
  alongEndFt: number;
}

function corridorAxis(points: SurveyPoint[]): { cE: number; cN: number; ux: number; uy: number } {
  const cE = points.reduce((sum, p) => sum + p.easting, 0) / points.length;
  const cN = points.reduce((sum, p) => sum + p.northing, 0) / points.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of points) {
    const dx = p.easting - cE;
    const dy = p.northing - cN;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { cE, cN, ux: Math.cos(theta), uy: Math.sin(theta) };
}

/**
 * Build overlapping viewports along the principal axis of the road shots.
 *
 * The old camera only zoomed into the five densest grid cells. On a long,
 * linear corridor those cells can sit in the middle and miss the shots at
 * either end, which is exactly how a drafted road "ends short" despite visible
 * shots further down the corridor. These windows collectively cover the full
 * shot run; adjacent windows overlap so there is no gap between frames.
 */
export function buildCorridorWindows(points: SurveyPoint[]): CorridorWindow[] {
  const finite = points.filter(p => Number.isFinite(p.easting) && Number.isFinite(p.northing));
  if (finite.length < 4) return [];

  const axis = corridorAxis(finite);
  const along = finite.map(p => (p.easting - axis.cE) * axis.ux + (p.northing - axis.cN) * axis.uy);
  const cross = finite.map(p => -(p.easting - axis.cE) * axis.uy + (p.northing - axis.cN) * axis.ux);
  const minA = Math.min(...along);
  const maxA = Math.max(...along);
  const span = maxA - minA;
  if (span < 120) return [];

  // More, tighter corridor glances than the old 4-frame/700-ft sweep. The
  // windows still overlap, so no shot falls between two frames.
  const count = Math.min(5, Math.max(2, Math.ceil(span / 450)));
  const overlap = 0.30;
  const windowSpan = span / (count - (count - 1) * overlap);
  const step = windowSpan * (1 - overlap);
  const crossMin = Math.min(...cross);
  const crossMax = Math.max(...cross);
  const centerC = (crossMin + crossMax) / 2;
  const halfCross = Math.max((crossMax - crossMin) / 2, 60) * 1.25;
  const halfLen = (windowSpan / 2) * 1.04;

  const windows: CorridorWindow[] = [];
  for (let i = 0; i < count; i++) {
    const centerA = minA + i * step + windowSpan / 2;
    let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
    for (const a of [centerA - halfLen, centerA + halfLen]) {
      for (const c of [centerC - halfCross, centerC + halfCross]) {
        const e = axis.cE + axis.ux * a - axis.uy * c;
        const n = axis.cN + axis.uy * a + axis.ux * c;
        if (e < minE) minE = e;
        if (e > maxE) maxE = e;
        if (n < minN) minN = n;
        if (n > maxN) maxN = n;
      }
    }
    windows.push({
      minE, maxE, minN, maxN,
      alongStartFt: i * step,
      alongEndFt: i * step + windowSpan,
    });
  }
  return windows;
}

export interface GimbalMentalModelInput {
  totalPoints: number;
  totalLines: number;
  extentFt: { width: number; height: number };
  pointTypes: string[];
  roadShotCount: number;
  roadSpanFt: number;
  corridorFrameCount: number;
  zoneFrameCount: number;
  detailFrameCount: number;
  centerlineShotCount: number;
  parcelLineCount: number;
  /** False when parcel frontage is grounding-only and not visible in the frames. */
  parcelLinesRendered?: boolean;
  /** High-confidence road corridors inferred from gaps between parcel fabrics. */
  parcelGapRoadCount?: number;
  boundaryCallCount: number;
}

/**
 * Compose the scene-level picture a drafter keeps in their head while zooming.
 * Frames alone leave the model looking at separate crops; this makes the
 * relationship between the wide view, the corridor run, and the details explicit.
 */
export function buildGimbalMentalModel(input: GimbalMentalModelInput): string {
  const {
    totalPoints, totalLines, extentFt, pointTypes, roadShotCount, roadSpanFt,
    corridorFrameCount, zoneFrameCount, detailFrameCount, centerlineShotCount,
    parcelLineCount, parcelLinesRendered = true, parcelGapRoadCount = 0, boundaryCallCount,
  } = input;
  const plural = (n: number, one: string, many = `${one}s`) => n === 1 ? one : many;

  const roadLine = roadShotCount === 0
    ? 'Road corridor: no coded road/curb/centerline shots; do not invent a corridor from parcels or imagery.'
    : corridorFrameCount > 0
      ? `Road corridor: ${roadShotCount} coded road/curb/centerline shots over ${roadSpanFt.toFixed(0)} ft; ${corridorFrameCount} overlapping CORRIDOR ${plural(corridorFrameCount, 'frame')} cover the full run end-to-end.`
      : `Road corridor: ${roadShotCount} coded road shots are too few or too tightly grouped for a dedicated sweep; use the overview and detail views.`;

  const detailLine = detailFrameCount > 0
    ? `Detail: ${zoneFrameCount} zone ${plural(zoneFrameCount, 'frame')} and ${detailFrameCount} detail ${plural(detailFrameCount, 'frame')} resolve the densest shot clusters.`
    : 'Detail: no separate detail frames; the corridor and zone frames carry the close-up evidence.';

  const parcelLine = parcelLineCount > 0
    ? parcelLinesRendered
      ? `Parcel context: ${parcelLineCount} cyan cadastral/frontage ${plural(parcelLineCount, 'line')} — frontage/boundary context, not pavement edges. The strip between two different parcel fabrics is a road candidate, not vacant land.`
      : `Parcel context: ${parcelLineCount} cadastral/frontage ${plural(parcelLineCount, 'line')} are held in memory for right-of-way and parcel-gap inference but are NOT drawn in these frames. Do not claim to see cyan parcel lines; use the road shots and boundary geometry only.`
    : 'Parcel context: no parcel/tax-lot linework; rely on field shots and ROW geometry.';

  const parcelGapLine = parcelGapRoadCount > 0
    ? `Parcel-fabric gaps: ${parcelGapRoadCount} high-confidence road ${plural(parcelGapRoadCount, 'corridor')} inferred where different parcel frontages face each other across an empty strip. Draft these gaps as roads when the request covers them; never fill them with buildings or arbitrary linework.`
    : 'Parcel-fabric gaps: no high-confidence road gap inferred from the available parcel frontages; do not invent a road through a parcel interior.';

  const intersectionLine = 'Intersections: classify every T, cross, skew and Y from the drawn centre lines. Preserve the arm count, angle, station and absolute location; a skewed crossing is still a crossing, not a T.';

  const centerline = centerlineShotCount > 0
    ? `Centerline: ${centerlineShotCount} coded CL ${plural(centerlineShotCount, 'shot')} anchor the corridor cross-section order — internal reference only; do not draw a baseline/centerline unless requested.`
    : 'Centerline: no coded CL shots; infer cross-section order from paired edge shots, never from a guessed center. Do not draw a baseline/centerline unless requested.';

  const boundary = boundaryCallCount > 0
    ? `Boundary: ${boundaryCallCount} boundary ${plural(boundaryCallCount, 'call')} enclose the site.`
    : 'Boundary: no boundary calls loaded.';

  return [
    'MENTAL PICTURE — build this before drawing:',
    `Wide: ${totalPoints} ${plural(totalPoints, 'shot')} and ${totalLines} existing ${plural(totalLines, 'line')} across ${extentFt.width.toFixed(0)} × ${extentFt.height.toFixed(0)} ft; ${pointTypes.length ? pointTypes.join(', ') : 'boundary geometry only'}.`,
    roadLine,
    detailLine,
    parcelLine,
    parcelGapLine,
    intersectionLine,
    centerline,
    boundary,
    'Zoom out: after the detail frames, return to the wide overview and reconcile every line to the full scene. A frame edge is not an endpoint.',
  ].join('\n');
}

export interface FeatureTraceInput {
  type?: 'driveway' | 'road' | 'street' | 'sidewalk' | 'walk' | string;
  layer?: string;
  widthFt?: number | number[];
  centerline?: Array<[number, number] | { y: number; x: number }>;
  polygon?: Array<[number, number] | { y: number; x: number }>;
  outline?: Array<[number, number] | { y: number; x: number }>;
  perimeter?: Array<[number, number] | { y: number; x: number }>;
  apron?: Array<[number, number] | { y: number; x: number }>;
  parking?: Array<[number, number] | { y: number; x: number }>;
  edges?: Array<{
    polylineId?: string;
    layer?: string;
    isClosed?: boolean;
    points: Array<[number, number] | { y: number; x: number }>;
  }>;
}

/**
 * Checks whether an existing survey point description is relevant for road/driveway corridor snapping.
 * Disqualifies boundary pins, traverse spikes, utility poles, trees, and non-corridor markers.
 */
export function isPointRelevantForCorridor(desc: string | undefined, featureType?: string): boolean {
  if (!desc) return true;
  // Strip common field coding symbols (* for side-shots, # for point notes) and clean whitespace
  const d = desc.trim().toUpperCase().replace(/[*#]/g, ' ');
  const f = (featureType || '').toLowerCase();

  // Codes that should NEVER be snapped to for road or driveway corridors unless they explicitly carry a road/driveway token:
  const IRRELEVANT_PATTERNS = [
    /\b(IP|IR|PIN|MON|MONUMENT|REBAR|RB|PIPE|ROD)\b/, // Boundary markers
    /\b(TSPK|SPK|PK|MAG|NAIL)\b/,                     // Traverse / control spikes
    /\b(TREE|OAK|PINE|MAPLE|BIRCH|CEDAR)\b/,         // Trees / vegetation
    /\b(POLE|PP|UTIL|VALVE|METER|HYD|HYDRANT)\b/,    // Utilities
    /\b(BM|TBM|BENCH|CALC)\b/,                       // Benchmarks
    /\b(COR|CORNER)\b/,                              // Boundary corners (unless DW COR)
    /\b(BLDG|HOUSE|SHED|GAR|GARAGE)\b/,              // Buildings
  ];

  // Driveway-specific tokens (driveways, aprons, entrances, cuts)
  const DRIVEWAY_TOKENS = /\b(DW\d*|DRV\d*|DRIVE\d*|DRWY\d*|APRON\d*|ENTRANCE)\b/;

  // Road-specific tokens (edges of pavement/road, curbs, centerlines)
  const ROAD_TOKENS = /\b(ER\d*|EP\d*|EOP\d*|ET\d*|ES\d*|EG\d*|EC\d*|EDGE\d*|PAV\d*|PVMT\d*|ROAD\d*|CURB\d*|TC\d*|BC\d*|TBC\d*|GUTTER\d*|FL\d*|FLOW\d*|CL\d*|CTR\d*|TIE|POC\d*|PC\d*|PT\d*)\b/;

  const DEP_CURB_TOKEN = /(^| )DEP[0-9]*( |$)/i;

  if (f.includes('drive')) {
    return DRIVEWAY_TOKENS.test(d);
  }
  if (f.includes('road')) {
    return ROAD_TOKENS.test(d) || DEP_CURB_TOKEN.test(d);
  }

  // General corridor check (either road or driveway)
  if (DRIVEWAY_TOKENS.test(d) || ROAD_TOKENS.test(d) || DEP_CURB_TOKEN.test(d)) {
    return true;
  }

  // If it matches an irrelevant pattern and has NO road/driveway token:
  for (const rx of IRRELEVANT_PATTERNS) {
    if (rx.test(d)) return false;
  }

  return false;
}

/**
 * Searches for the nearest existing survey point within snapRadiusFt (ground truth control).
 * Only snaps to survey points relevant to the given featureType.
 */
export function findNearestSurveyPoint(
  targetE: number,
  targetN: number,
  existingPoints: SurveyPoint[] = [],
  maxDistFt: number = 25,
  featureType?: string,
): SurveyPoint | null {
  let closest: SurveyPoint | null = null;
  let minDist = maxDistFt;

  for (const p of existingPoints) {
    const e = typeof p.easting === 'number' ? p.easting : (p as any).x;
    const n = typeof p.northing === 'number' ? p.northing : (p as any).y;
    if (typeof e !== 'number' || typeof n !== 'number' || !Number.isFinite(e) || !Number.isFinite(n)) continue;

    if (featureType && !isPointRelevantForCorridor(p.description, featureType)) {
      continue;
    }

    const dist = Math.hypot(e - targetE, n - targetN);
    if (dist < minDist) {
      minDist = dist;
      closest = p;
    }
  }
  return closest;
}

/**
 * Interpolates 3D elevations along an ordered chain of survey points.
 * Uses any non-zero elevations from snapped survey points to estimate elevations for intermediate points.
 */
export function interpolateChainElevations(pts: SurveyPoint[]): void {
  if (pts.length < 2) return;
  const knownIndices: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (typeof pts[i].elevation === 'number' && pts[i].elevation !== 0 && Number.isFinite(pts[i].elevation)) {
      knownIndices.push(i);
    }
  }

  if (knownIndices.length === 0) return;

  // Single known elevation: propagate to all
  if (knownIndices.length === 1) {
    const baseElev = pts[knownIndices[0]].elevation!;
    for (let i = 0; i < pts.length; i++) {
      if (pts[i].elevation === 0 || pts[i].elevation === undefined) {
        pts[i].elevation = parseFloat(baseElev.toFixed(2));
      }
    }
    return;
  }

  // Multiple known elevations: calculate cumulative distances and interpolate
  const cumDist: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].easting - pts[i - 1].easting, pts[i].northing - pts[i - 1].northing);
    cumDist.push(cumDist[i - 1] + d);
  }

  for (let k = 0; k < knownIndices.length - 1; k++) {
    const i0 = knownIndices[k];
    const i1 = knownIndices[k + 1];
    const z0 = pts[i0].elevation!;
    const z1 = pts[i1].elevation!;
    const d0 = cumDist[i0];
    const d1 = cumDist[i1];
    const span = d1 - d0;

    for (let j = i0 + 1; j < i1; j++) {
      if (span > 0.01) {
        const frac = (cumDist[j] - d0) / span;
        pts[j].elevation = parseFloat((z0 + frac * (z1 - z0)).toFixed(2));
      } else {
        pts[j].elevation = parseFloat(z0.toFixed(2));
      }
    }
  }

  // Extrapolate before first known
  const firstKnown = knownIndices[0];
  if (firstKnown > 0) {
    const zFirst = pts[firstKnown].elevation!;
    for (let j = 0; j < firstKnown; j++) {
      pts[j].elevation = parseFloat(zFirst.toFixed(2));
    }
  }

  // Extrapolate after last known
  const lastKnown = knownIndices[knownIndices.length - 1];
  if (lastKnown < pts.length - 1) {
    const zLast = pts[lastKnown].elevation!;
    for (let j = lastKnown + 1; j < pts.length; j++) {
      pts[j].elevation = parseFloat(zLast.toFixed(2));
    }
  }
}

/**
 * Evaluates a Catmull-Rom spline through an array of points to produce smooth curvilinear geometry.
 * Spacing between generated vertices is approximately 2 to 4 survey feet.
 */
export function smoothSplinePoints(
  controlPoints: Array<{ easting: number; northing: number }>,
  subdivisionsPerSegment = 6,
  isClosed = false,
): Array<{ easting: number; northing: number }> {
  if (controlPoints.length < 3) return controlPoints;

  const n = controlPoints.length;
  const result: Array<{ easting: number; northing: number }> = [];

  const getPt = (idx: number) => {
    if (isClosed) {
      return controlPoints[(idx + n) % n];
    }
    if (idx < 0) {
      const p0 = controlPoints[0];
      const p1 = controlPoints[1];
      return { easting: 2 * p0.easting - p1.easting, northing: 2 * p0.northing - p1.northing };
    }
    if (idx >= n) {
      const pn1 = controlPoints[n - 1];
      const pn2 = controlPoints[n - 2];
      return { easting: 2 * pn1.easting - pn2.easting, northing: 2 * pn1.northing - pn2.northing };
    }
    return controlPoints[idx];
  };

  const segments = isClosed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const p0 = getPt(i - 1);
    const p1 = getPt(i);
    const p2 = getPt(i + 1);
    const p3 = getPt(i + 2);

    for (let s = 0; s < subdivisionsPerSegment; s++) {
      const t = s / subdivisionsPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;

      const e = 0.5 * (
        (2 * p1.easting) +
        (-p0.easting + p2.easting) * t +
        (2 * p0.easting - 5 * p1.easting + 4 * p2.easting - p3.easting) * t2 +
        (-p0.easting + 3 * p1.easting - 3 * p2.easting + p3.easting) * t3
      );
      const nor = 0.5 * (
        (2 * p1.northing) +
        (-p0.northing + p2.northing) * t +
        (2 * p0.northing - 5 * p1.northing + 4 * p2.northing - p3.northing) * t2 +
        (-p0.northing + 3 * p1.northing - 3 * p2.northing + p3.northing) * t3
      );
      result.push({ easting: parseFloat(e.toFixed(2)), northing: parseFloat(nor.toFixed(2)) });
    }
  }

  if (!isClosed) {
    const last = controlPoints[n - 1];
    result.push({ easting: parseFloat(last.easting.toFixed(2)), northing: parseFloat(last.northing.toFixed(2)) });
  } else if (result.length > 0) {
    result.push({ ...result[0] });
  }

  return result;
}

/**
 * Searches for existing road linework or survey points to anchor and calibrate driveway tie-ins.
 */
export function findRoadTieInOffset(
  entrancePt: { easting: number; northing: number },
  existingLines: SurveyLine[] = [],
  existingPoints: SurveyPoint[] = []
): { deltaE: number; deltaN: number } {
  // Find road lines on the canvas (e.g. V-ROAD-CNTR, V-ROAD-EDGE, L-ROAD, L-EDGE-PAVEMENT)
  const roadLines = existingLines.filter(l => 
    (l.layer && /road|pave|street|edge|ep|er/i.test(l.layer)) ||
    (l.polylineId && /road/i.test(l.polylineId)) ||
    (l.lineType && /center/i.test(l.lineType))
  );

  let bestDist = Infinity;
  let targetRoadPt: { easting: number; northing: number } | null = null;

  for (const l of roadLines) {
    if (!l.fromPt || !l.toPt) continue;
    const x1 = l.fromPt.x, y1 = l.fromPt.y;
    const x2 = l.toPt.x, y2 = l.toPt.y;
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1) continue;

    // Project entrance onto this road line segment
    const t = Math.max(0, Math.min(1, ((entrancePt.easting - x1) * dx + (entrancePt.northing - y1) * dy) / lenSq));
    const projE = x1 + t * dx;
    const projN = y1 + t * dy;
    const d = Math.hypot(entrancePt.easting - projE, entrancePt.northing - projN);

    if (d < bestDist) {
      bestDist = d;
      targetRoadPt = { easting: projE, northing: projN };
    }
  }

  // If the entrance is within reasonable frontage distance (e.g. 180 ft), snap its entrance directly onto the road edge line
  if (targetRoadPt && bestDist < 180 && bestDist > 1) {
    return {
      deltaE: targetRoadPt.easting - entrancePt.easting,
      deltaN: targetRoadPt.northing - entrancePt.northing,
    };
  }

  // Fallback: Check road survey points (EP, ER, DYL)
  const roadPts = existingPoints.filter(p => isPointRelevantForCorridor(p.description, 'road'));
  if (roadPts.length >= 2) {
    let closestPt: SurveyPoint | null = null;
    let minD = Infinity;
    for (const p of roadPts) {
      const pe = typeof p.easting === 'number' ? p.easting : (p as any).x;
      const pn = typeof p.northing === 'number' ? p.northing : (p as any).y;
      const d = Math.hypot(entrancePt.easting - pe, entrancePt.northing - pn);
      if (d < minD) {
        minD = d;
        closestPt = p;
      }
    }
    if (closestPt && minD < 180 && minD > 1) {
      return {
        deltaE: closestPt.easting - entrancePt.easting,
        deltaN: closestPt.northing - entrancePt.northing,
      };
    }
  }

  return { deltaE: 0, deltaN: 0 };
}

export function expandFeatureTrace(
  trace: FeatureTraceInput,
  bounds: { minE: number; maxE: number; minN: number; maxN: number },
  startPointNumber: number = 100,
  canvasWidth: number = DEFAULT_W,
  canvasHeight: number = DEFAULT_H,
  margin: number = MARGIN,
  existingPoints?: SurveyPoint[],
  snapRadiusFt: number = 25,
  existingLines?: SurveyLine[],
): { points: SurveyPoint[]; lines: SurveyLine[] } {
  const generatedPoints: SurveyPoint[] = [];
  const generatedLines: SurveyLine[] = [];
  let pn = startPointNumber;

  const featureType = (trace.type || 'driveway').toLowerCase();
  const isDriveway = featureType.includes('drive');
  const clLayer = isDriveway ? 'L-DRIVEWAY-CL' : 'L-CENTERLINE';
  const edgeLayer = trace.layer || (isDriveway ? 'L-DRIVEWAY' : 'L-ROAD');

  const resolvePoint = (
    worldCoord: { easting: number; northing: number },
    defaultDesc: string,
    targetLayer: string,
  ): SurveyPoint => {
    const snapped = findNearestSurveyPoint(worldCoord.easting, worldCoord.northing, existingPoints, snapRadiusFt, featureType);
    if (snapped) {
      return snapped;
    }
    const newPt: SurveyPoint = {
      pointNumber: String(pn++),
      easting: worldCoord.easting,
      northing: worldCoord.northing,
      elevation: 0,
      description: defaultDesc,
      layer: targetLayer,
    };
    generatedPoints.push(newPt);
    return newPt;
  };

  const addChainLines = (pts: SurveyPoint[], layer: string, polylineId: string, isClosed = false) => {
    if (pts.length < 2) return;
    interpolateChainElevations(pts);
    for (let i = 0; i < pts.length - 1; i++) {
      generatedLines.push({
        from: pts[i].pointNumber,
        to: pts[i + 1].pointNumber,
        layer,
        polylineId,
      });
    }
    if (isClosed && pts.length > 2) {
      generatedLines.push({
        from: pts[pts.length - 1].pointNumber,
        to: pts[0].pointNumber,
        layer,
        polylineId,
      });
    }
  };

  // 1. Convert raw coordinates to world space
  const rawCenterline = Array.isArray(trace.centerline) && trace.centerline.length >= 2 ? trace.centerline : null;
  const rawPolygon = (trace.polygon || trace.outline || trace.perimeter) && Array.isArray(trace.polygon || trace.outline || trace.perimeter)
    ? (trace.polygon || trace.outline || trace.perimeter)!
    : null;

  let clWorld = rawCenterline ? rawCenterline.map(pt => convertNormPosToWorld(pt, bounds, canvasWidth, canvasHeight, margin)) : [];
  let polyWorld = rawPolygon && rawPolygon.length >= 3 ? rawPolygon.map(pt => convertNormPosToWorld(pt, bounds, canvasWidth, canvasHeight, margin)) : [];

  // 2. Automatic Road Tie-in & Alignment Calibration
  if (isDriveway && existingLines && existingLines.length > 0) {
    const entrancePt = clWorld[0] || polyWorld[0];
    if (entrancePt) {
      const { deltaE, deltaN } = findRoadTieInOffset(entrancePt, existingLines, existingPoints);
      if (Math.abs(deltaE) > 0.01 || Math.abs(deltaN) > 0.01) {
        if (clWorld.length > 0) {
          clWorld = clWorld.map(p => ({ easting: p.easting + deltaE, northing: p.northing + deltaN }));
        }
        if (polyWorld.length > 0) {
          polyWorld = polyWorld.map(p => ({ easting: p.easting + deltaE, northing: p.northing + deltaN }));
        }
      }
    }
  }

  // 3. Centerline Alignment & Smooth Corridor Curves
  if (clWorld.length >= 2) {
    // Apply Catmull-Rom spline interpolation to eliminate 8-bit straight lines
    const smoothCl = smoothSplinePoints(clWorld, 6, false);
    const clPoints: SurveyPoint[] = [];

    for (let i = 0; i < smoothCl.length; i++) {
      const cur = smoothCl[i];
      const desc = i === 0 ? 'DW CL ENTRANCE' : i === smoothCl.length - 1 ? 'DW CL APRON' : 'DW CL';
      const pt = resolvePoint(cur, desc, clLayer);
      clPoints.push(pt);
    }

    addChainLines(clPoints, clLayer, `${featureType}-cl`, false);

    // Generate smooth parallel edges from centerline with entrance bell flare
    const defaultWidth = typeof trace.widthFt === 'number' && trace.widthFt > 0 ? trace.widthFt : 14;
    const leftPoints: SurveyPoint[] = [];
    const rightPoints: SurveyPoint[] = [];
    const totalPts = smoothCl.length;

    for (let i = 0; i < totalPts; i++) {
      const cur = smoothCl[i];
      let halfWidth = defaultWidth / 2;

      // Bell flare at road entrance (first 25% of approach widens out to meet road)
      if (i < totalPts * 0.25) {
        const flareRatio = 1 - (i / (totalPts * 0.25));
        const flareW = 10 * (flareRatio * flareRatio); // Smooth quadratic flare
        halfWidth += flareW;
      }

      let dx = 0;
      let dy = 0;
      if (i === 0) {
        dx = smoothCl[1].easting - cur.easting;
        dy = smoothCl[1].northing - cur.northing;
      } else if (i === totalPts - 1) {
        dx = cur.easting - smoothCl[i - 1].easting;
        dy = cur.northing - smoothCl[i - 1].northing;
      } else {
        dx = smoothCl[i + 1].easting - smoothCl[i - 1].easting;
        dy = smoothCl[i + 1].northing - smoothCl[i - 1].northing;
      }

      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;

      const lWorld = { easting: cur.easting + nx * halfWidth, northing: cur.northing + ny * halfWidth };
      const rWorld = { easting: cur.easting - nx * halfWidth, northing: cur.northing - ny * halfWidth };

      const lPt = resolvePoint(lWorld, i === 0 ? 'DW NORTH ENTRANCE' : 'DW NORTH EDGE', edgeLayer);
      const rPt = resolvePoint(rWorld, i === 0 ? 'DW SOUTH ENTRANCE' : 'DW SOUTH EDGE', edgeLayer);

      leftPoints.push(lPt);
      rightPoints.push(rPt);
    }

    addChainLines(leftPoints, edgeLayer, `${featureType}-edge-left`, false);
    addChainLines(rightPoints, edgeLayer, `${featureType}-edge-right`, false);
  } else if (polyWorld.length >= 3) {
    // If only polygon provided, smooth the polygon vertices with spline interpolation
    const smoothPoly = smoothSplinePoints(polyWorld, 5, true);
    const polyPoints: SurveyPoint[] = [];

    for (let i = 0; i < smoothPoly.length; i++) {
      const cur = smoothPoly[i];
      const desc = i === 0 || i === smoothPoly.length - 1 ? 'DW ENTRANCE' : 'DW EDGE';
      const pt = resolvePoint(cur, desc, edgeLayer);
      polyPoints.push(pt);
    }

    addChainLines(polyPoints, edgeLayer, `${featureType}-perimeter`, true);
  }

  // 4. Separate Parking Apron / Turnaround Court
  const rawApron = trace.apron || trace.parking;
  if (Array.isArray(rawApron) && rawApron.length >= 3) {
    let apronWorld = rawApron.map(pt => convertNormPosToWorld(pt, bounds, canvasWidth, canvasHeight, margin));
    const smoothApron = smoothSplinePoints(apronWorld, 4, true);
    const apronPoints: SurveyPoint[] = [];

    for (let i = 0; i < smoothApron.length; i++) {
      const cur = smoothApron[i];
      const pt = resolvePoint(cur, 'DW APRON', edgeLayer);
      apronPoints.push(pt);
    }

    addChainLines(apronPoints, edgeLayer, `${featureType}-apron`, true);
  }

  // 5. Custom Edge Chains
  if (Array.isArray(trace.edges) && trace.edges.length > 0) {
    for (let eIdx = 0; eIdx < trace.edges.length; eIdx++) {
      const edge = trace.edges[eIdx];
      if (!Array.isArray(edge.points) || edge.points.length < 2) continue;
      const ptsWorld = edge.points.map(pt => convertNormPosToWorld(pt, bounds, canvasWidth, canvasHeight, margin));
      const smoothEdge = smoothSplinePoints(ptsWorld, 5, edge.isClosed || false);
      const edgePts: SurveyPoint[] = [];

      for (let i = 0; i < smoothEdge.length; i++) {
        const pt = resolvePoint(smoothEdge[i], 'DW EDGE', edge.layer || edgeLayer);
        edgePts.push(pt);
      }

      addChainLines(edgePts, edge.layer || edgeLayer, edge.polylineId || `${featureType}-edge-${eIdx + 1}`, edge.isClosed || false);
    }
  }

  return { points: generatedPoints, lines: generatedLines };
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas renderer
// ─────────────────────────────────────────────────────────────────────────────

interface RenderOpts {
  frameLabel?: string;
  fadedPtNums?: Set<string>; // point numbers to dim (outside focus)
  boundarySegments?: BoundarySegment[];
  boundaryVertices?: BoundaryVertex[];
  backgroundImage?: {
    image: CanvasImageSource;
    bounds?: { minE: number; maxE: number; minN: number; maxN: number };
  } | null;
  mapTiles?: MapOverlayTile[];
  referenceLines?: SurveyLine[];
  defectMarkers?: VisionDefectMarker[];
  draftInspection?: boolean;
}

function renderToCanvas(
  canvas: HTMLCanvasElement,
  points: SurveyPoint[],
  lines: SurveyLine[],
  minE: number, maxE: number,
  minN: number, maxN: number,
  opts: RenderOpts = {},
): void {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;
  const { scale, toScreen } = makeTransform(minE, maxE, minN, maxN, W, H, MARGIN);

  // ── Background ──────────────────────────────────────────────────────────────
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, W, H);

  const hasMapImagery = (opts.mapTiles && opts.mapTiles.length > 0) || !!opts.backgroundImage?.image;

  // ── Background Map Imagery Overlay (NAIP / satellite tiles) ─────────────────
  if (opts.mapTiles && opts.mapTiles.length > 0) {
    for (const tile of opts.mapTiles) {
      if (!tile.image) continue;
      const opacity = tile.opacity ?? 0.95;
      const src = tile.image as HTMLImageElement;
      const iw = src.naturalWidth || (src as any).width || 256;
      const ih = src.naturalHeight || (src as any).height || 256;
      if (!iw || !ih) continue;

      if (tile.quad && tile.quad.length >= 4) {
        const [tlX, tlY] = toScreen(tile.quad[0][0], tile.quad[0][1]);
        const [trX, trY] = toScreen(tile.quad[1][0], tile.quad[1][1]);
        const [blX, blY] = toScreen(tile.quad[3][0], tile.quad[3][1]);
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.translate(tlX, tlY);
        ctx.transform((trX - tlX) / iw, (trY - tlY) / iw, (blX - tlX) / ih, (blY - tlY) / ih, 0, 0);
        try {
          ctx.drawImage(tile.image, 0, 0, iw, ih);
        } catch (e) {
          console.warn('[civilDrafterVision] draw quad tile failed:', e);
        }
        ctx.restore();
      } else if (tile.bbox) {
        const [tMinE, tMinN, tMaxE, tMaxN] = tile.bbox;
        const [x0, yTop] = toScreen(tMinE, tMaxN);
        const [x1, yBottom] = toScreen(tMaxE, tMinN);
        const w = x1 - x0;
        const h = yBottom - yTop;
        if (w > 0 && h > 0) {
          ctx.save();
          ctx.globalAlpha = opacity;
          try {
            ctx.drawImage(tile.image, x0, yTop, w, h);
          } catch (e) {
            console.warn('[civilDrafterVision] draw bbox tile failed:', e);
          }
          ctx.restore();
        }
      }
    }
  } else if (opts.backgroundImage?.image) {
    const bgBounds = opts.backgroundImage.bounds || { minE, maxE, minN, maxN };
    const [x0, yTop] = toScreen(bgBounds.minE, bgBounds.maxN);
    const [x1, yBottom] = toScreen(bgBounds.maxE, bgBounds.minN);
    ctx.save();
    ctx.globalAlpha = 0.90;
    try {
      ctx.drawImage(opts.backgroundImage.image, x0, yTop, x1 - x0, yBottom - yTop);
    } catch (e) {
      console.warn('[civilDrafterVision] Failed to draw background image:', e);
    }
    ctx.restore();
  }

  // ── Coordinate grid ──────────────────────────────────────────────────────────
  {
    const rawStep = Math.max(maxE - minE, maxN - minN) / 8;
    const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(rawStep, 1))));
    const gridStep  = Math.ceil(rawStep / magnitude) * magnitude;
    ctx.strokeStyle = hasMapImagery ? 'rgba(255, 255, 255, 0.15)' : '#1a2233';
    ctx.lineWidth   = 0.5;
    ctx.setLineDash(hasMapImagery ? [4, 4] : []);
    ctx.beginPath();
    for (let e = Math.floor(minE / gridStep) * gridStep; e <= maxE + gridStep; e += gridStep) {
      const [x0] = toScreen(e, minN);
      const [x1] = toScreen(e, maxN);
      ctx.moveTo(x0, H - MARGIN);
      ctx.lineTo(x1, MARGIN);
    }
    for (let n = Math.floor(minN / gridStep) * gridStep; n <= maxN + gridStep; n += gridStep) {
      const [x0, y0] = toScreen(minE, n);
      const [x1, y1] = toScreen(maxE, n);
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Coordinate grid labels (Easting along bottom, Northing along left)
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    for (let e = Math.floor(minE / gridStep) * gridStep; e <= maxE + gridStep; e += gridStep) {
      const [x0] = toScreen(e, minN);
      if (x0 >= MARGIN - 10 && x0 <= W - MARGIN + 10) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(x0 - 24, H - MARGIN + 2, 48, 12);
        ctx.fillStyle = '#E5E7EB';
        ctx.fillText(`E ${Math.round(e)}`, x0, H - MARGIN + 11);
      }
    }
    ctx.textAlign = 'right';
    for (let n = Math.floor(minN / gridStep) * gridStep; n <= maxN + gridStep; n += gridStep) {
      const [, y0] = toScreen(minE, n);
      if (y0 >= MARGIN - 10 && y0 <= H - MARGIN + 10) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(MARGIN - 48, y0 - 6, 46, 12);
        ctx.fillStyle = '#E5E7EB';
        ctx.fillText(`N ${Math.round(n)}`, MARGIN - 4, y0 + 3);
      }
    }
  }

  // ── Boundary Overlay (Amber #F59E0B) ────────────────────────────────────────
  if (opts.boundarySegments && opts.boundarySegments.length > 0) {
    ctx.save();
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 4;
    for (const seg of opts.boundarySegments) {
      const [x1, y1] = toScreen(seg.fromPt.easting, seg.fromPt.northing);
      const [x2, y2] = toScreen(seg.toPt.easting, seg.toPt.northing);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    if (opts.boundaryVertices) {
      ctx.fillStyle = '#FBBF24';
      for (const v of opts.boundaryVertices) {
        const [vx, vy] = toScreen(v.easting, v.northing);
        ctx.beginPath();
        ctx.arc(vx, vy, 4, 0, Math.PI * 2);
        ctx.fill();
        if (v.label && scale > 0.12) {
          ctx.fillStyle = '#FEF08A';
          ctx.font = 'bold 9px monospace';
          ctx.fillText(v.label, vx + 5, vy - 2);
          ctx.fillStyle = '#FBBF24';
        }
      }
    }
    ctx.restore();
  }

  // ── Build point lookup ───────────────────────────────────────────────────────
  const ptMap = new Map<string, SurveyPoint>();
  for (const p of points) ptMap.set(p.pointNumber, p);

  // ── Linework ────────────────────────────────────────────────────────────────
  const resolveEndpoint = (
    line: SurveyLine,
    side: 'from' | 'to',
  ): { easting: number; northing: number } | null => {
    const explicit = side === 'from' ? line.fromPt : line.toPt;
    if (explicit && Number.isFinite(explicit.x) && Number.isFinite(explicit.y)) {
      return { easting: explicit.x, northing: explicit.y };
    }
    const ref = String((side === 'from' ? line.from : line.to) ?? '').trim();
    const mapped = ptMap.get(ref);
    if (mapped && Number.isFinite(mapped.easting) && Number.isFinite(mapped.northing)) {
      return { easting: mapped.easting, northing: mapped.northing };
    }
    return null;
  };

  const drawSegment = (
    a: { easting: number; northing: number },
    b: { easting: number; northing: number },
    layer: string | undefined,
    alpha = 0.85,
  ) => {
    const isParcel = /PARCEL|TAX.?LOT|CADASTRE/i.test(layer ?? '');
    ctx.globalAlpha = alpha * (isParcel ? 0.62 : 1);
    ctx.strokeStyle = isParcel ? '#22D3EE' : layerColor(layer ?? 'default');
    ctx.lineWidth = isParcel ? 1 : 1.5;
    ctx.beginPath();
    ctx.moveTo(...toScreen(a.easting, a.northing));
    ctx.lineTo(...toScreen(b.easting, b.northing));
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  // Entity-by-entity rendering: manual circles/arcs store their geometry on
  // fromPt/toPt/circleCenter rather than in the point database. Resolving only
  // point IDs made them vanish from every vision frame.
  for (const l of lines) {
    if (l.hidden) continue;
    const fp = resolveEndpoint(l, 'from');
    const tp = resolveEndpoint(l, 'to');
    const center = l.circleCenter
      ? { easting: l.circleCenter.x, northing: l.circleCenter.y }
      : fp;
    const endpointsCoincide = Boolean(
      fp && tp && Math.hypot(fp.easting - tp.easting, fp.northing - tp.northing) < 1e-6,
    );
    const isCircle = Boolean(
      l.isCircle ||
      (l.isCurve && l.curveRadius && endpointsCoincide && !l.chordBearing && !l.tangentBearing),
    );

    const isParcelLine = /PARCEL|TAX.?LOT|CADASTRE/i.test(l.layer ?? '');
    ctx.strokeStyle = isParcelLine ? '#22D3EE' : layerColor(l.layer ?? 'default');

    if (isCircle && center && l.curveRadius && l.curveRadius > 0) {
      const [cx, cy] = toScreen(center.easting, center.northing);
      ctx.globalAlpha = isParcelLine ? 0.62 : 0.9;
      ctx.lineWidth = isParcelLine ? 1 : 1.8;
      ctx.beginPath();
      ctx.arc(cx, cy, l.curveRadius * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      continue;
    }

    if (!fp || !tp) continue;

    if (l.isCurve && l.curveRadius && l.arcLength) {
      const arc = resolveArcGeometry(
        { x: fp.easting, y: fp.northing },
        { x: tp.easting, y: tp.northing },
        {
          radius: l.curveRadius,
          arcLength: l.arcLength,
          center: l.circleCenter ? { x: l.circleCenter.x, y: l.circleCenter.y } : undefined,
          curveDirection: l.curveDirection,
          tangentBearing: l.tangentBearing,
          chordBearing: l.chordBearing,
          bearing: l.bearing,
        },
      );
      if (arc) {
        const [cx, cy] = toScreen(arc.center.x, arc.center.y);
        const [sx, sy] = toScreen(fp.easting, fp.northing);
        const startAngle = Math.atan2(sy - cy, sx - cx);
        const endAngle = startAngle + (arc.isLeftCurve ? -arc.centralAngle : arc.centralAngle);
        ctx.globalAlpha = isParcelLine ? 0.62 : 0.88;
        ctx.lineWidth = isParcelLine ? 1 : 1.8;
        ctx.beginPath();
        ctx.arc(cx, cy, arc.radius * scale, startAngle, endAngle, arc.isLeftCurve);
        ctx.stroke();
        ctx.globalAlpha = 1;
        continue;
      }
    }

    drawSegment(fp, tp, l.layer, 0.88);
  }

  // ── Pass-1 target reference (dashed magenta) ────────────────────────────────
  // The pass-2 model must see the corridor it is being measured against, not
  // just its own redraw. This layer is reference only; it is never linework.
  if (opts.referenceLines && opts.referenceLines.length > 0) {
    ctx.save();
    ctx.strokeStyle = '#E879F9';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.78;
    ctx.setLineDash([7, 5]);
    for (const line of opts.referenceLines) {
      if (line.hidden) continue;
      const a = resolveEndpoint(line, 'from');
      const b = resolveEndpoint(line, 'to');
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(...toScreen(a.easting, a.northing));
      ctx.lineTo(...toScreen(b.easting, b.northing));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ── Survey points ────────────────────────────────────────────────────────────
  // Vision frames are evidence, not a CAD screen. At a dense cluster, glow
  // halos plus hundreds of overlapping point-number labels turn the shots into
  // an unreadable white cloud. Keep every shot visible as a crisp mark, make
  // road/curb/centerline shots dominant, and only label sparse frames.
  const visiblePoints = points.filter(p =>
    Number.isFinite(p.easting) && Number.isFinite(p.northing)
    && p.easting >= minE && p.easting <= maxE
    && p.northing >= minN && p.northing <= maxN,
  );
  const densePointCloud = visiblePoints.length > 60;
  const showLabels = !densePointCloud && scale > 0.65;
  const pointRadius = densePointCloud ? 1.35 : 2.1;
  const roadRadius = densePointCloud ? 2.35 : 2.9;
  const isRoadShot = isRoadCorridorPoint;

  const drawPoint = (p: SurveyPoint, emphasized: boolean) => {
    const faded = opts.fadedPtNums?.has(p.pointNumber) ?? false;
    const [sx, sy] = toScreen(p.easting, p.northing);
    const col = descColor(p.description);
    const r = faded
      ? Math.max(0.8, pointRadius - 0.5)
      : emphasized ? roadRadius : pointRadius;

    ctx.globalAlpha = faded
      ? (densePointCloud ? 0.10 : 0.18)
      : emphasized ? 1 : densePointCloud ? 0.55 : 0.85;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();

    // A dark keyline stops adjacent shots from bleeding into each other.
    if (!faded && (emphasized || !densePointCloud)) {
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = 'rgba(3, 7, 18, 0.9)';
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }

    if (showLabels && !faded && emphasized) {
      const fontSize = Math.max(7, Math.min(10, r * 2.8));
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = col;
      ctx.font = `${fontSize}px monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(p.pointNumber, sx + r + 1.5, sy - 1.5);
    }

    ctx.globalAlpha = 1;
  };

  // Non-road shots first; road/curb/centerline shots last so they stay legible.
  for (const p of visiblePoints) {
    if (!isRoadShot(p)) drawPoint(p, false);
  }
  for (const p of visiblePoints) {
    if (isRoadShot(p)) drawPoint(p, true);
  }

  // ── Defect pins ──────────────────────────────────────────────────────────────
  if (opts.defectMarkers && opts.defectMarkers.length > 0) {
    ctx.save();
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    for (const marker of opts.defectMarkers) {
      const [mx, my] = toScreen(marker.easting, marker.northing);
      const color = marker.severity === 'red' ? '#FB7185' : '#FBBF24';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mx, my, 9, 0, Math.PI * 2);
      ctx.stroke();
      const text = marker.label;
      const width = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(3, 7, 18, 0.88)';
      ctx.fillRect(mx + 12, my - 9, width + 8, 14);
      ctx.fillStyle = color;
      ctx.fillText(text, mx + 16, my + 2);
    }
    ctx.restore();
  }

  // ── Frame HUD overlay ───────────────────────────────────────────────────────

  // Top banner
  if (opts.frameLabel) {
    ctx.fillStyle = 'rgba(0,0,0,0.70)';
    ctx.fillRect(0, 0, W, 24);
    ctx.fillStyle = '#64B5F6';
    ctx.font      = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(opts.frameLabel, 8, 16);
  }

  // Compass rose (top-right corner)
  {
    const cx = W - 30, cy = 32, r = 15;
    ctx.globalAlpha = 0.75;
    // N arrow shaft
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
    ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
    ctx.stroke();
    // N label
    ctx.fillStyle = '#ffffff';
    ctx.font      = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', cx, cy - r - 3);
    // Tick marks on intercardinals
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (const angle of [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4]) {
      const x0 = cx + Math.cos(angle) * (r - 4);
      const y0 = cy + Math.sin(angle) * (r - 4);
      const x1 = cx + Math.cos(angle) * r;
      const y1 = cy + Math.sin(angle) * r;
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Scale bar (bottom-left corner)
  if (scale > 0) {
    const rawFt    = 100 / scale;
    const mag      = Math.pow(10, Math.floor(Math.log10(Math.max(rawFt, 1))));
    const niceFt   = Math.round(rawFt / mag) * mag;
    const barPx    = niceFt * scale;
    const bx = 12, by = H - 14;

    ctx.globalAlpha = 0.80;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(bx,          by); ctx.lineTo(bx + barPx, by);
    ctx.moveTo(bx,          by - 5); ctx.lineTo(bx,          by + 5);
    ctx.moveTo(bx + barPx,  by - 5); ctx.lineTo(bx + barPx,  by + 5);
    ctx.stroke();
    ctx.fillStyle  = '#ffffff';
    ctx.font       = '10px monospace';
    ctx.textAlign  = 'left';
    ctx.fillText(`${niceFt.toLocaleString()} ft`, bx, by - 7);
    ctx.globalAlpha = 1;
  }

  // Crosshair at centre (gimbal aim)
  {
    const cx = W / 2, cy = H / 2;
    ctx.globalAlpha  = 0.12;
    ctx.strokeStyle  = '#64B5F6';
    ctx.lineWidth    = 0.5;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(cx, 0);    ctx.lineTo(cx, H);
    ctx.moveTo(0, cy);    ctx.lineTo(W, cy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Density grid (spatial partitioning for zoom targets)
// ─────────────────────────────────────────────────────────────────────────────

interface GridCell {
  col: number; row: number;
  minE: number; maxE: number;
  minN: number; maxN: number;
  cE: number; cN: number;
  points: SurveyPoint[];
}

function computeGridCells(pts: SurveyPoint[], ext: Extent, cols = 4, rows = 3): GridCell[] {
  const cellW = ext.spanE / cols;
  const cellH = ext.spanN / rows;
  const cells: GridCell[] = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const minE = ext.minE + c * cellW;
      const maxE = minE + cellW;
      const minN = ext.minN + r * cellH;
      const maxN = minN + cellH;
      cells.push({ col: c, row: r, minE, maxE, minN, maxN, cE: (minE + maxE) / 2, cN: (minN + maxN) / 2, points: [] });
    }
  }
  for (const p of pts) {
    const c = Math.min(cols - 1, Math.floor((p.easting  - ext.minE) / cellW));
    const r = Math.min(rows - 1, Math.floor((p.northing - ext.minN) / cellH));
    cells[c * rows + r].points.push(p);
  }
  return cells.filter(c => c.points.length > 0).sort((a, b) => b.points.length - a.points.length);
}

/** Cardinal direction label for a cluster relative to survey centre */
function cardinalOf(cell: GridCell, ext: Extent): string {
  return (cell.cN > ext.cN ? 'N' : 'S') + (cell.cE > ext.cE ? 'E' : 'W');
}

// ─────────────────────────────────────────────────────────────────────────────
// Description statistics helper
// ─────────────────────────────────────────────────────────────────────────────

function topDescriptions(pts: SurveyPoint[], n = 6): string[] {
  const counts = new Map<string, number>();
  for (const p of pts) {
    const root = (p.description ?? 'UNKNOWN').split(/\d/)[0].trim().toUpperCase() || 'UNKNOWN';
    counts.set(root, (counts.get(root) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([d, c]) => `${d}(${c})`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — capture vision survey
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Capture a multi-zoom visual survey of the survey scene.
 *
 * Returns a VisionSurvey containing PNG frames (base64) that can be fed to
 * Gemini Vision alongside the survey text data for spatially-aware drafting.
 */
export async function captureVisionSurvey(
  points: SurveyPoint[],
  lines: SurveyLine[],
  opts: VisionCaptureOptions = {},
): Promise<VisionSurvey> {
  const {
    maxClusterFrames = 6,
    maxDetailFrames  = 3,
    canvasWidth      = VISION_W,
    canvasHeight     = VISION_H,
    pass             = 'geometry',
    renderVectors    = true,
    renderParcelLines = true,
    draftInspection  = false,
  } = opts;

  // Keep the passes physically separate. A geometry frame must never pick up
  // background pixels, and an imagery frame must never carry vector geometry.
  const backgroundImage = pass === 'imagery' ? opts.backgroundImage : null;
  const mapTiles = pass === 'imagery' ? opts.mapTiles : undefined;

  const frames: VisionFrame[] = [];
  const canvas  = document.createElement('canvas');
  canvas.width  = canvasWidth;
  canvas.height = canvasHeight;

  const boundaryGeom = extractBoundaryGeometry(opts.boundaryFiles);
  const aoi = opts.aoiBounds;
  const renderedLines = filterVisionRenderLines(lines, renderParcelLines);
  const insideAoi = (p: SurveyPoint) =>
    !aoi ||
    (p.easting >= aoi.minE && p.easting <= aoi.maxE
      && p.northing >= aoi.minN && p.northing <= aoi.maxN);
  const pointsInScope = points.filter(insideAoi);
  const ext: Extent | null = aoi
    ? {
        ...aoi,
        cE: (aoi.minE + aoi.maxE) / 2,
        cN: (aoi.minN + aoi.maxN) / 2,
        spanE: Math.max(1, aoi.maxE - aoi.minE),
        spanN: Math.max(1, aoi.maxN - aoi.minN),
      }
    : computeExtent(points, lines, boundaryGeom.vertices);

  if (!ext || (pointsInScope.length < 2 && boundaryGeom.vertices.length < 2 && lines.length === 0)) {
    return {
      frames: [],
      spatialNarrative: 'Insufficient spatial data for visual survey — no points or boundary lines loaded.',
      totalPoints: pointsInScope.length,
      totalLines: lines.length,
      surveyExtentFt: { width: 0, height: 0 },
      capturedAt: Date.now(),
    };
  }

  // If survey points are sparse/empty, synthesize reference points from boundary vertices
  // so the grid partitioning and quadrant clustering zoom in on key sections of the property.
  const effectivePoints: SurveyPoint[] = pointsInScope.length >= 2
    ? pointsInScope
    : [
        ...pointsInScope,
        ...boundaryGeom.vertices.map((v, i) => ({
          pointNumber: v.label || `BND-${i + 1}`,
          northing: v.northing,
          easting: v.easting,
          elevation: 0,
          description: 'PROPERTY BOUNDARY',
        })),
      ];

  // Helper: render a viewport → VisionFrame
  const capture = (
    minE: number, maxE: number,
    minN: number, maxN: number,
    label: string,
    zoomLevel: number,
    fadedPtNums?: Set<string>,
  ): VisionFrame => {
    const passTag = draftInspection
      ? 'PASS 2 · DRAFT INSPECTION'
      : pass === 'imagery' ? 'PASS B · IMAGERY' : 'PASS A · GEOMETRY';
    renderToCanvas(canvas, renderVectors ? pointsInScope : [], renderVectors ? renderedLines : [], minE, maxE, minN, maxN, {
      frameLabel: `${passTag} | ${label}`,
      fadedPtNums,
      boundarySegments: renderVectors ? boundaryGeom.segments : undefined,
      boundaryVertices: renderVectors ? boundaryGeom.vertices : undefined,
      backgroundImage,
      mapTiles,
      referenceLines: draftInspection ? opts.referenceLines : undefined,
      defectMarkers: draftInspection ? opts.defectMarkers : undefined,
      draftInspection,
    });
    const dataUrl = canvas.toDataURL('image/png');
    const base64  = dataUrl.split(',')[1];
    const visible = renderVectors
      ? pointsInScope.filter(p =>
          p.easting  >= minE && p.easting  <= maxE &&
          p.northing >= minN && p.northing <= maxN,
        )
      : [];
    const topDesc = topDescriptions(visible);
    return {
      base64, label,
      description: `${label} | ${visible.length} pts visible | `
        + `E ${minE.toFixed(0)}–${maxE.toFixed(0)}, N ${minN.toFixed(0)}–${maxN.toFixed(0)} | `
        + `Types: ${topDesc.join(', ')}`,
      pointCount: visible.length,
      zoomLevel,
      width: canvasWidth,
      height: canvasHeight,
      bounds: { minE, maxE, minN, maxN },
      topDescriptions: topDesc,
    };
  };

  // Every camera window is clipped to the held AOI. The overview is exactly the
  // AOI bounds; there is no outer padding that would pull neighboring parcels
  // back into the first frame.
  const captureInBounds = (
    minE: number, maxE: number,
    minN: number, maxN: number,
    label: string,
    zoomLevel: number,
    fadedPtNums?: Set<string>,
  ): void => {
    const clipped = clampVisionBoundsToAoi({ minE, maxE, minN, maxN }, aoi);
    if (!clipped) return;
    frames.push(capture(
      clipped.minE, clipped.maxE, clipped.minN, clipped.maxN,
      label, zoomLevel, fadedPtNums,
    ));
  };

  // ── Frame 1: Overview (exactly the held AOI when one is active) ────────────
  const padE = aoi ? 0 : ext.spanE * 0.15;
  const padN = aoi ? 0 : ext.spanN * 0.15;
  const overviewCountLabel = !renderVectors
    ? 'background only'
    : pointsInScope.length > 0
      ? `${pointsInScope.length} pts`
      : `${boundaryGeom.segments.length} boundary lines`;
  captureInBounds(
    ext.minE - padE, ext.maxE + padE,
    ext.minN - padN, ext.maxN + padN,
    `FRAME 1/? | OVERVIEW  ${overviewCountLabel}  ${ext.spanE.toFixed(0)}ft × ${ext.spanN.toFixed(0)}ft`,
    1.0,
  );

  // ── Targeted pass-2 failure windows ────────────────────────────────────────
  // A redraw turn looks at the station that failed, not another full tour.
  const targetedWindows = draftInspection ? (opts.failureWindows ?? []) : [];
  for (const win of targetedWindows) {
    const inside = (p: SurveyPoint) =>
      p.easting >= win.bounds.minE && p.easting <= win.bounds.maxE
      && p.northing >= win.bounds.minN && p.northing <= win.bounds.maxN;
    const faded = new Set(pointsInScope.filter(p => !inside(p)).map(p => p.pointNumber));
    captureInBounds(
      win.bounds.minE, win.bounds.maxE, win.bounds.minN, win.bounds.maxN,
      win.label,
      1,
      faded,
    );
  }

  // ── Corridor sweep: cover the whole road, not just the densest cells ──────
  const corridorPoints = pass === 'geometry' ? pointsInScope.filter(isRoadCorridorPoint) : [];
  const corridorWindows = targetedWindows.length > 0 ? [] : buildCorridorWindows(corridorPoints);
  for (let i = 0; i < corridorWindows.length; i++) {
    const win = corridorWindows[i];
    const inside = (p: SurveyPoint) =>
      p.easting >= win.minE && p.easting <= win.maxE
      && p.northing >= win.minN && p.northing <= win.maxN;
    const faded = new Set(pointsInScope.filter(p => !inside(p)).map(p => p.pointNumber));
    const ov = ext.spanE * ext.spanN;
    const zv = (win.maxE - win.minE) * (win.maxN - win.minN);
    const roadInWindow = corridorPoints.filter(inside).length;
    captureInBounds(
      win.minE, win.maxE, win.minN, win.maxN,
      `FRAME ${frames.length + 1}/? | CORRIDOR ${i + 1}/${corridorWindows.length}  ${win.alongStartFt.toFixed(0)}–${win.alongEndFt.toFixed(0)} ft  ${roadInWindow} road shots`,
      ov / Math.max(zv, 1),
      faded,
    );
  }

  // ── Frames 2–N: Top density clusters (zone zoom) ───────────────────────────
  const clusters  = computeGridCells(effectivePoints, ext, 4, 3);
  // When a corridor sweep exists, spend fewer slots on generic density cells so
  // the total frame budget stays bounded.
  const zoneLimit = corridorWindows.length > 0 ? Math.min(maxClusterFrames, 3) : maxClusterFrames;
  const detailLimit = corridorWindows.length > 0 ? Math.min(maxDetailFrames, 2) : maxDetailFrames;
  const topCells  = targetedWindows.length > 0 ? [] : clusters.slice(0, zoneLimit);
  const detailFrames = targetedWindows.length > 0 ? 0 : Math.min(detailLimit, topCells.length);

  for (let i = 0; i < topCells.length; i++) {
    const cell    = topCells[i];
    const spanMax = Math.max(cell.maxE - cell.minE, cell.maxN - cell.minN);
    const pad     = spanMax * 0.28;
    const dir     = cardinalOf(cell, ext);
    const faded   = new Set(pointsInScope.filter(p => !cell.points.includes(p)).map(p => p.pointNumber));
    const ov      = ext.spanE * ext.spanN;
    const zv      = (cell.maxE - cell.minE + 2 * pad) * (cell.maxN - cell.minN + 2 * pad);
    const zoom    = ov / Math.max(zv, 1);
    captureInBounds(
      cell.minE - pad, cell.maxE + pad,
      cell.minN - pad, cell.maxN + pad,
      `FRAME ${frames.length + 1}/? | ZONE ${dir}  ${cell.points.length} features`,
      zoom, faded,
    );
  }

  // ── Frames N+1…M: Detail zoom on densest clusters ─────────────────────────
  for (let i = 0; i < detailFrames; i++) {
    const cell      = topCells[i];
    const cellExt   = computeExtent(cell.points, [], boundaryGeom.vertices)!;
    const pad       = Math.max(cellExt.spanE, cellExt.spanN) * 0.30;
    const dir       = cardinalOf(cell, ext);
    const ov        = ext.spanE * ext.spanN;
    const zv        = (cellExt.spanE + 2 * pad) * (cellExt.spanN + 2 * pad);
    const zoom      = ov / Math.max(zv, 1);
    captureInBounds(
      cellExt.minE - pad, cellExt.maxE + pad,
      cellExt.minN - pad, cellExt.maxN + pad,
      `FRAME ${frames.length + 1}/? | DETAIL ${dir}  ${cell.points.length} features`,
      zoom,
    );
  }

  // Fix the /? placeholder now that we know total count
  const total = frames.length;
  for (const f of frames) {
    f.label = f.label.replace('/? |', `/${total} |`);
  }

  // ── Spatial narrative ──────────────────────────────────────────────────────
  const descSummary   = pointsInScope.length > 0 ? topDescriptions(pointsInScope, 12) : ['BOUNDARY CORNERS'];
  const layerNames    = [...new Set(renderedLines.map(l => l.layer ?? '').filter(Boolean))].slice(0, 8);
  const clusterSummary = topCells.map(c => `${cardinalOf(c, ext)}(${c.points.length})`).join(', ');
  const hasImagery    = Boolean((mapTiles && mapTiles.length > 0) || backgroundImage?.image);
  const corridorSpanFt = corridorWindows.length > 0
    ? corridorWindows[corridorWindows.length - 1].alongEndFt
    : 0;
  const corridorNarrative = targetedWindows.length > 0
    ? `Targeted failure windows: ${targetedWindows.length} close-up${targetedWindows.length === 1 ? '' : 's'} at the failed stations. These are not the whole corridor — fix the labelled station, then re-check the full run on the overview.`
    : corridorWindows.length > 0
      ? `Road corridor sweep: ${corridorPoints.length} road/curb/centerline shots span ${corridorSpanFt.toFixed(0)} ft; ${corridorWindows.length} overlapping frames cover the full run. Frame boundaries are NOT road endpoints — follow the shot row from the first shot to the last, even where density drops.`
      : 'Road corridor sweep: no dedicated corridor frames this turn; use the overview and zone frames.';
  const centerlineShotCount = corridorPoints.filter(p =>
    /^(CL|C\/L|CENTER|CTR)/i.test((p.description ?? '').trim()),
  ).length;
  const parcelLineCount = lines.filter(isParcelVisionLine).length;
  const parcelGapRoadCount = inferParcelGapRoads(lines).length;
  const mentalModel = pass === 'geometry'
    ? buildGimbalMentalModel({
        totalPoints: pointsInScope.length,
        totalLines: lines.length,
        extentFt: { width: ext.spanE, height: ext.spanN },
        pointTypes: descSummary,
        roadShotCount: corridorPoints.length,
        roadSpanFt: corridorSpanFt,
        corridorFrameCount: corridorWindows.length,
        zoneFrameCount: topCells.length,
        detailFrameCount: detailFrames,
        centerlineShotCount,
        parcelLineCount,
        parcelLinesRendered: renderParcelLines,
        parcelGapRoadCount,
        boundaryCallCount: boundaryGeom.segments.length,
      })
    : '';

  const passNarrative = draftInspection
    ? 'Pass type: SECOND GIMBAL INSPECTION — the drafted take is drawn over the field shots and frontage geometry. Background imagery is excluded; this is a geometry check, not a new site read.'
    : pass === 'imagery'
      ? 'Pass type: BACKGROUND IMAGERY ONLY — no survey points, parcel linework, or other vectors are rendered in these frames.'
      : 'Pass type: POINT + PARCEL GEOMETRY ONLY — background imagery is deliberately excluded from every frame so shot and frontage geometry is not read through aerial pixels.';

  const spatialNarrative = [
    `Visual survey complete — ${total} frames captured.`,
    passNarrative,
    `Survey spans ${ext.spanE.toFixed(0)} ft East–West × ${ext.spanN.toFixed(0)} ft North–South.`,
    `Total: ${points.length} survey points, ${lines.length} existing line segments.`,
    draftInspection
      ? 'Second gimbal inspection: compare the coloured draft lines with the field shots and the first-pass station/width model. Look for short ends, edges that stop mid-run, opposite edges that cross, width jumps, and branches that cut through the corridor instead of T-ing in.'
      : pass === 'geometry' ? 'Gimbal scan path: WIDE overview → CORRIDOR sweep → ZONE/DETAIL close-ups → WIDE reconciliation.' : '',
    pass === 'geometry' ? mentalModel : '',
    pass === 'geometry' ? corridorNarrative : '',
    boundaryGeom.segments.length > 0 && renderVectors ? `Property boundary: ${boundaryGeom.segments.length} calls enclosing site (highlighted in amber #F59E0B).` : '',
    pass === 'geometry'
      ? renderParcelLines
        ? `Parcel / tax-lot frontage lines are rendered in cyan (#22D3EE); they are property boundaries, not pavement edges.`
        : `Parcel / tax-lot frontage (${parcelLineCount} lines) is held in memory for right-of-way and parcel-gap reasoning but is NOT drawn in this pass. Only road evidence, field shots and boundary geometry are visible.`
      : '',
    hasImagery ? `Background aerial imagery (NAIP/satellite): ACTIVE in this separate imagery pass only.` : '',
    pass === 'geometry' ? `Background aerial imagery: NOT RENDERED in this pass. Do not infer geometry from the dark canvas background.` : '',
    `Point type distribution: ${descSummary.join(', ')}.`,
    `Existing linework layers: ${layerNames.length ? layerNames.join(', ') : 'none yet'}.`,
    `Spatial density (quadrant → feature count): ${clusterSummary}.`,
    pass === 'imagery'
      ? `Use this pass only for background context (canopy, buildings, driveways, visible pavement). It is not a geometry source and must not override the point/parcel pass.`
      : `Use the point, parcel/frontage and boundary geometry in these frames as the primary evidence for drafting decisions. The background is intentionally blank.`,
  ].filter(Boolean).join('\n');

  return {
    frames,
    spatialNarrative,
    totalPoints: pointsInScope.length,
    totalLines: renderedLines.length,
    surveyExtentFt: { width: ext.spanE, height: ext.spanN },
    capturedAt: Date.now(),
    pass,
    hasBackgroundImagery: hasImagery,
    parcelLinesRendered: renderParcelLines,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Gemini multimodal Part builder
// ─────────────────────────────────────────────────────────────────────────────

type TextPart       = { text: string };
type InlineDataPart = { inlineData: { mimeType: string; data: string } };
export type VisionPart = TextPart | InlineDataPart;

/** A georeferenced aerial/roadmap image attached to the vision briefing. */
export interface VisionAerialImage {
  mimeType: string;
  data: string;
  label?: string;
}

export interface MatchedBackgroundCaptureOptions {
  backgroundImage?: {
    image: CanvasImageSource;
    bounds?: { minE: number; maxE: number; minN: number; maxN: number };
  } | null;
  mapTiles?: MapOverlayTile[];
  /** Maximum matched frames to capture; defaults to 5. */
  maxFrames?: number;
  canvasWidth?: number;
  canvasHeight?: number;
}

/**
 * Capture background-only frames at the EXACT bounds of the geometry frames.
 *
 * This is what makes the second pass useful: Pass A may have an overview plus
 * zone/detail views, but a single full-extent aerial cannot be compared with
 * those zoom levels. Each returned image is still background-only and is never
 * composited with points or parcel lines.
 */
export function captureMatchedBackgroundPass(
  survey: VisionSurvey,
  opts: MatchedBackgroundCaptureOptions = {},
): VisionAerialImage[] {
  if (typeof document === 'undefined' || !survey.frames?.length) return [];
  if (!opts.backgroundImage?.image && (!opts.mapTiles || opts.mapTiles.length === 0)) return [];

  const frames = survey.frames.slice(0, Math.max(1, opts.maxFrames ?? 5));
  const width = opts.canvasWidth ?? frames[0]?.width ?? DEFAULT_W;
  const height = opts.canvasHeight ?? frames[0]?.height ?? DEFAULT_H;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const out: VisionAerialImage[] = [];
  for (const frame of frames) {
    const bounds = frame.bounds;
    if (!bounds) continue;
    renderToCanvas(canvas, [], [], bounds.minE, bounds.maxE, bounds.minN, bounds.maxN, {
      frameLabel: `PASS B · IMAGERY | MATCHES PASS A ${frame.label} | BACKGROUND ONLY`,
      backgroundImage: opts.backgroundImage,
      mapTiles: opts.mapTiles,
    });
    const base64 = canvas.toDataURL('image/png').split(',')[1];
    if (!base64) continue;
    out.push({
      mimeType: 'image/png',
      data: base64,
      label:
        `PASS B · MATCHES PASS A ${frame.label} — same extents, background only. ` +
        `Compare only with that Pass A frame; never composite or trace over the point/parcel linework.`,
    });
  }
  return out;
}

/**
 * Assemble a Gemini-ready Part[] from a VisionSurvey.
 *
 * Interleaves text descriptions with image parts so the model receives a
 * structured visual briefing before acting on the user's drafting request.
 */
export function buildVisionParts(
  vision: VisionSurvey,
  userQuery: string,
  textContext = '',
  aerialImages: VisionAerialImage[] = [],
): VisionPart[] {
  const parts: VisionPart[] = [];
  const hasBackgroundPass = aerialImages.length > 0;
  const allBackgroundFramesMatched = hasBackgroundPass
    && aerialImages.every(img => /MATCHES PASS A/i.test(img.label ?? ''));
  const backgroundAlignmentText = allBackgroundFramesMatched
    ? `Each label names the Pass A frame with the SAME extents. Compare matched pairs only; do not\n` +
      `mosaic them or transfer detail from one zoom level to another.\n`
    : `These are full-extent background captures, not matched to a specific Pass A zoom; use them\n` +
      `only as broad context and do not assume pixel alignment with a particular frame.\n`;

  // ── PASS A: primary point + parcel geometry ────────────────────────────────
  parts.push({
    text:
      `${textContext}\n\n` +
      `CIVIL DRAFTER — SURVEYORS EYE · TWO SEPARATE PASSES\n` +
      `PASS A — POINT + PARCEL GEOMETRY (PRIMARY, ${vision.frames.length} frames)\n` +
      `This pass is rendered on a clean dark canvas. Background imagery is deliberately absent.\n` +
      (vision.parcelLinesRendered === false
        ? `The frames show field shots, road linework and boundary geometry only. Parcel/tax-lot\n` +
          `frontage is retained in memory for right-of-way and parcel-gap reasoning, but is NOT drawn.\n`
        : `The frames show the actual field shots, parcel/frontage lines and boundary geometry only.\n`) +
      `The camera starts wide, sweeps the full corridor, then zooms into the densest zones.\n` +
      `Before drafting, zoom back out and reconcile every detail against the overview.\n\n` +
      `Study PASS A for:\n` +
      `  • Road / corridor alignments (parallel EP / EOP / CL shot rows) and paint rows (DYL/DBL/WL/SWL)\n` +
      `  • Complete corridor coverage — follow the shot row through the overlapping CORRIDOR frames;\n` +
      `    never stop at the densest cluster or at a frame edge\n` +
      `  • Intersections and cul-de-sacs\n` +
      `  • Parcel frontage and right-of-way relationships\n` +
      `  • Building footprint shot clusters\n` +
      `  • Utility corridors\n` +
      `  • Property / boundary features\n` +
      `  • Topographic relief hints (density of topo shots)\n\n` +
      `SPATIAL SUMMARY:\n${vision.spatialNarrative}\n`,
  });

  for (const frame of vision.frames) {
    parts.push({ text: `\n─── PASS A · ${frame.label} ───\n${frame.description}` });
    parts.push({ inlineData: { mimeType: 'image/png', data: frame.base64 } });
  }

  // ── PASS B: optional, separately captured background imagery ───────────────
  if (hasBackgroundPass) {
    parts.push({
      text:
        `\n═══ PASS B — BACKGROUND IMAGERY (SECONDARY, SEPARATE CAPTURE) ═══\n` +
        `These ${aerialImages.length} background frame${aerialImages.length === 1 ? '' : 's'} were captured separately from Pass A. They contain\n` +
        `background pixels only — no survey points, parcel lines, or drafted vectors were drawn into them.\n` +
        backgroundAlignmentText +
        `Pass B is context, not geometry. It must never be merged with Pass A in your reasoning.\n` +
        `\nPASS B RULES:\n` +
        `• Pass A is the geometry authority wherever it has shots or parcel frontage. If Pass A and Pass B disagree, Pass A wins.\n` +
        `• Use Pass B to understand tree canopy, shadows, buildings, driveways, sidewalks and visible pavement.\n` +
        `• Do NOT move, delete, or re-order surveyed road geometry to match Pass B.\n` +
        `• If a corridor has NO field edge/centerline shots and no parcel frontage, you may use Pass B\n` +
        `  to sketch a coarse image-only alignment; label it as image-derived and keep it separate from surveyed linework.\n` +
        `• If Pass B is canopy/shadow over the road, say so and fall back to the field shots, parcel frontage and OSM ways.\n` +
        `• Dark/no-data areas in Pass B are missing imagery, not pavement or shade.\n` +
        `• If multiple driveways exist or the imagery is ambiguous, ASK clarifying questions with selectable\n` +
        `  options in the question/options JSON format before or alongside drafting.`,
    });
    for (const img of aerialImages) {
      if (img.label) parts.push({ text: `\n${img.label}` });
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    }
  } else {
    parts.push({
      text:
        `\n═══ PASS B — BACKGROUND IMAGERY: NOT CAPTURED FOR THIS TURN ═══\n` +
        `Do not claim imagery support and do not invent pavement or canopy observations.\n` +
        `Draft from the point/parcel geometry in Pass A and the text grounding.\n` +
        `If background images are appended later in this message, treat them as separate secondary context only — never as Pass A geometry.`,
    });
  }

  // ── Human zoom-out reconciliation ───────────────────────────────────────────
  parts.push({
    text:
      `\n─── ZOOM BACK OUT — RECONCILE THE SCENE ───\n` +
      `You have looked wide, moved down the corridor, and inspected the close details. Now do what a\n` +
      `drafter does before committing: zoom back out. Re-place every detail on the overview, continue\n` +
      `each road through all CORRIDOR frames, and check the linework against the whole scene.\n` +
      `A detail frame is not the whole site, and a frame edge is not a road endpoint. Only after\n` +
      `this reconciliation should you emit the take.`,
  });

  // ── Road evidence hierarchy ────────────────────────────────────────────────
  parts.push({
    text:
      `\n─── ROAD EVIDENCE HIERARCHY (HIGHEST FIRST) ───\n` +
      `1. FIELD SHOTS — exact plan position. Parallel EP/EOP/CL/CURB/ROW rows define the corridor.\n` +
      `2. PARCEL / ROW FRONTAGE — legal corridor context. It can keep a road in the right-of-way\n` +
      `   and continue it across a shot gap, but a parcel line is not a pavement edge. The empty\n` +
      `   strip between two DIFFERENT parcel fabrics is the road corridor itself; do not treat it\n` +
      `   as vacant land or fill it with arbitrary linework.\n` +
      `3. OSM ROAD WAY — street continuity, name and alignment context. It is not a survey.\n` +
      `4. BACKGROUND IMAGERY — pavement width, canopy, driveways and visible edge context. It may\n` +
      `   supply a coarse image-only alignment only when ranks 1–3 are absent for that corridor.\n` +
      `Do not average two sources. If a lower-ranked source conflicts with a higher-ranked one,\n` +
      `keep the higher-ranked geometry and state the conflict explicitly.\n` +
      `\n─── ROAD OUTPUT SCOPE (DEFAULT) ───\n` +
      `• Draw shot-supported pavement edges, curbs, shoulders and paint lines. If DYL/DBL or WL/SWL\n` +
      `  shots exist, draw them even when there is no centerline.\n` +
      `• Paint layers: DYL/DBL → L-ROAD-PAINT-Y; WL/SWL → L-ROAD-PAINT-W; both CONTINUOUS.\n` +
      `• EP is a reference edge, never paint.\n` +
      `• PC/PT/POC marks a bend: approximate it with a smooth curve through the shots; a rough\n` +
      `  fitted arc is acceptable and preferred over a hard straight chord.\n` +
      `• Do NOT emit a baseline/centerline (CL, CTR, C-ROAD-CNTR) unless the user explicitly asks\n` +
      `  for a centerline, baseline, alignment, or stationing. CL shots are internal ordering evidence.\n`,
  });

  // ── Self-review & evidence gate ────────────────────────────────────────────
  parts.push({
    text:
      `\n─── SELF-REVIEW & EVIDENCE GATE (APPLY BEFORE YOU ANSWER) ───\n` +
      `1. PASS A IS THE GEOMETRY AUTHORITY. It shows the field shots and parcel/frontage lines\n` +
      `   with no background pixels. Derive road edges, paint lines, corridor continuity and\n` +
      `   frontage from Pass A (centerlines only when requested). The dark background is intentional —\n` +
      `   do not treat it as missing imagery.\n` +
      `2. PASS B IS SUPPORTING CONTEXT ONLY. It was captured separately and must never be merged\n` +
      `   with Pass A in your reasoning. If it shows canopy, shadow, or plain vegetation over the road,\n` +
      `   say so plainly and fall back to field shots, parcel frontage and OSM ways.\n` +
      `   Do NOT pretend you can see pavement that is not there. Never move surveyed geometry to match\n` +
      `   Pass B. If a corridor has no field road shots at all, Pass B may supply a coarse image-only\n` +
      `   alignment — label it clearly and keep it separate from surveyed linework.\n` +
      `3. TAKE IT TWO OR THREE TIMES. Audit your own linework before emitting it:\n` +
      `   (a) every pavement edge and paint line is ONE continuous line spanning the corridor — no gaps;\n` +
      `   (b) the two edges never cross and each stays on its own side of the road;\n` +
      `   (c) a side road or driveway T-s into the edge — it never cuts across the pavement;\n` +
      `   (d) no orphan stub, no duplicate, no stray line left lying across the road;\n` +
      `   (d2) every T, cross, skew and Y has the same arm count, angle and station as the target;\n` +
      `   (e) the road reaches the true first and last road shots. If the shot row continues past the\n` +
      `       last vertex, or a CORRIDOR frame shows more shots beyond it, the take is incomplete.\n` +
      `   If the take fails any check, fix it and re-check. Never send a take you can see is wrong.\n` +
      `4. GROUND THE ALIGNMENT. An OSM road way or parcel frontage must support where you put the road.\n` +
      `   Parcel lines are legal frontage/boundary evidence, not pavement edges — never snap a road edge\n` +
      `   to a parcel line unless the shots agree. Use parcel lines to keep the corridor in the right-of-way\n` +
      `   and to continue a road across a survey gap. When the shots cover only part of it, continue on the\n` +
      `   grounded alignment instead of stopping in mid-air.`,
  });

  // ── Drafting request ───────────────────────────────────────────────────────
  parts.push({
    text:
      `\nVISUAL SURVEY COMPLETE — PROCEEDING WITH DRAFTING REQUEST\n\n` +
      `You have seen Pass A${hasBackgroundPass ? ' and the separate Pass B background capture' : '; Pass B was not captured'}.\n` +
      `Now apply expert civil drafting judgment to the following request.\n` +
      `Your linework must be derived from Pass A, the field shots and the text grounding.\n` +
      `Pass B may add context where Pass A is silent, but it never overrides surveyed Pass A geometry.\n\n` +
      `USER REQUEST:\n${userQuery}`,
  });

  return parts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Draw-intent detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true when the user message contains a clear drafting / drawing intent
 * that would benefit from a visual survey before the model responds.
 */
export function isDrawIntent(query: string): boolean {
  return /\b(draw|draft|create|generate|make|produce|build|trace|connect|plot|linework|polyline|road|edge|driveway|drive|street|pavement|building|corridor|boundary|topo|contour|all points|feature|map|surveyed|survey|everything)\b/i.test(query);
}
