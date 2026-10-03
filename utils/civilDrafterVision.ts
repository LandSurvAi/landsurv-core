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

import type { SurveyPoint, SurveyLine } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

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

export interface VisionSurvey {
  frames: VisionFrame[];
  /** Multi-sentence spatial narrative injected before the user query */
  spatialNarrative: string;
  totalPoints: number;
  totalLines: number;
  surveyExtentFt: { width: number; height: number };
  capturedAt: number;
}

export interface VisionCaptureOptions {
  /** Maximum cluster-zoom frames to capture (default 5) */
  maxClusterFrames?: number;
  /** Maximum detail (tight-zoom) frames to capture (default 2) */
  maxDetailFrames?: number;
  canvasWidth?: number;
  canvasHeight?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_W = 800;
const DEFAULT_H = 600;
const MARGIN    = 48; // px padding around rendered survey bounds

// ─────────────────────────────────────────────────────────────────────────────
// Colour helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Survey description → point colour (based on industry naming conventions) */
const DESC_PALETTE: Array<[RegExp, string]> = [
  [/^(EP|EOP|EDGE|ROAD|ROW)/i,                              '#FFD700'], // road edge     – gold
  [/^(TC|BC|CURB|GUTTER|GR|FL|RAMP)/i,                     '#FFC107'], // curb / flow   – amber
  [/^(BLDG|WALL|COR|CORNER|FOUND|FOOTING|FND)/i,           '#FF8C00'], // building      – orange
  [/^(TREE|VEG|SHRUB|PLANT|BRUSH|HEDGE)/i,                 '#4CAF50'], // vegetation    – green
  [/^(CL|CENTER|C\/L|STA|STAT)/i,                          '#FF4081'], // centreline    – pink
  [/^(UTIL|MH|WM|WL|GV|ELEC|TEL|GAS|SS|WW|HYDRANT|CB)/i,  '#64B5F6'], // utility       – light blue
  [/^(PROP|IRON|RIR|MON|MONUMENT|SPIKE|PIN|STAKE|BM)/i,    '#CE93D8'], // boundary/mon  – lavender
  [/^(FENCE|RET|RETWALL|WALL)/i,                           '#FF7043'], // fence/wall    – deep orange
  [/^(DITCH|SW|SWALE|STREAM|CREEK|WATER|POND|LAKE|WL)/i,   '#4DD0E1'], // water/drain   – cyan
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

function computeExtent(pts: SurveyPoint[]): Extent | null {
  if (!pts.length) return null;
  let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
  for (const p of pts) {
    if (p.easting  < minE) minE = p.easting;
    if (p.easting  > maxE) maxE = p.easting;
    if (p.northing < minN) minN = p.northing;
    if (p.northing > maxN) maxN = p.northing;
  }
  const spanE = Math.max(maxE - minE, 1);
  const spanN = Math.max(maxN - minN, 1);
  return { minE, maxE, minN, maxN, cE: (minE + maxE) / 2, cN: (minN + maxN) / 2, spanE, spanN };
}

/** Survey-to-screen coordinate transform for a given viewport */
function makeTransform(
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
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas renderer
// ─────────────────────────────────────────────────────────────────────────────

interface RenderOpts {
  frameLabel?: string;
  fadedPtNums?: Set<string>; // point numbers to dim (outside focus)
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

  // ── Coordinate grid ──────────────────────────────────────────────────────────
  {
    const rawStep = Math.max(maxE - minE, maxN - minN) / 8;
    const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(rawStep, 1))));
    const gridStep  = Math.ceil(rawStep / magnitude) * magnitude;
    ctx.strokeStyle = '#1a2233';
    ctx.lineWidth   = 0.5;
    ctx.setLineDash([]);
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
  }

  // ── Build point lookup ───────────────────────────────────────────────────────
  const ptMap = new Map<string, SurveyPoint>();
  for (const p of points) ptMap.set(p.pointNumber, p);

  // ── Linework ────────────────────────────────────────────────────────────────
  // Group by polylineId for continuous paths
  const polyGroups = new Map<string, SurveyLine[]>();
  const standaloneLines: SurveyLine[] = [];
  for (const l of lines) {
    if (l.polylineId) {
      if (!polyGroups.has(l.polylineId)) polyGroups.set(l.polylineId, []);
      polyGroups.get(l.polylineId)!.push(l);
    } else {
      standaloneLines.push(l);
    }
  }

  const drawSegment = (a: SurveyPoint, b: SurveyPoint, layer: string | undefined, alpha = 0.85) => {
    ctx.globalAlpha  = alpha;
    ctx.strokeStyle  = layerColor(layer ?? 'default');
    ctx.lineWidth    = 1.5;
    ctx.beginPath();
    ctx.moveTo(...toScreen(a.easting, a.northing));
    ctx.lineTo(...toScreen(b.easting, b.northing));
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  for (const [, segs] of polyGroups) {
    if (!segs.length) continue;
    ctx.strokeStyle  = layerColor(segs[0].layer ?? 'default');
    ctx.lineWidth    = 1.8;
    ctx.globalAlpha  = 0.88;
    ctx.beginPath();
    let started = false;
    for (const s of segs) {
      const fp = ptMap.get(s.from);
      const tp = ptMap.get(s.to);
      if (!fp || !tp) continue;
      const [x1, y1] = toScreen(fp.easting, fp.northing);
      const [x2, y2] = toScreen(tp.easting, tp.northing);
      if (!started) { ctx.moveTo(x1, y1); started = true; }
      else            ctx.lineTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  for (const l of standaloneLines) {
    const fp = ptMap.get(l.from);
    const tp = ptMap.get(l.to);
    if (fp && tp) drawSegment(fp, tp, l.layer);
  }

  // ── Survey points ────────────────────────────────────────────────────────────
  const showLabels = scale > 0.4;
  const dotR       = Math.max(2.5, Math.min(5, 2.5 + scale * 0.015));

  for (const p of points) {
    const faded = opts.fadedPtNums?.has(p.pointNumber) ?? false;
    const [sx, sy] = toScreen(p.easting, p.northing);
    const col = descColor(p.description);

    // Glow halo
    if (!faded) {
      ctx.globalAlpha = 0.18;
      ctx.fillStyle   = col;
      ctx.beginPath();
      ctx.arc(sx, sy, dotR + 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Dot
    ctx.globalAlpha = faded ? 0.18 : 0.95;
    ctx.fillStyle   = col;
    ctx.beginPath();
    ctx.arc(sx, sy, dotR, 0, Math.PI * 2);
    ctx.fill();

    // Label
    if (showLabels && !faded) {
      const fontSize = Math.max(7, Math.min(10, dotR * 2.4));
      ctx.globalAlpha = 0.78;
      ctx.fillStyle   = col;
      ctx.font        = `${fontSize}px monospace`;
      ctx.textAlign   = 'left';
      ctx.fillText(p.pointNumber, sx + dotR + 1.5, sy - 1.5);
    }

    ctx.globalAlpha = 1;
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
    maxClusterFrames = 5,
    maxDetailFrames  = 2,
    canvasWidth      = DEFAULT_W,
    canvasHeight     = DEFAULT_H,
  } = opts;

  const frames: VisionFrame[] = [];
  const canvas  = document.createElement('canvas');
  canvas.width  = canvasWidth;
  canvas.height = canvasHeight;

  const ext = computeExtent(points);
  if (!ext || points.length < 2) {
    return {
      frames: [],
      spatialNarrative: 'Insufficient point data for visual survey — fewer than 2 points loaded.',
      totalPoints: points.length,
      totalLines: lines.length,
      surveyExtentFt: { width: 0, height: 0 },
      capturedAt: Date.now(),
    };
  }

  // Helper: render a viewport → VisionFrame
  const capture = (
    minE: number, maxE: number,
    minN: number, maxN: number,
    label: string,
    zoomLevel: number,
    fadedPtNums?: Set<string>,
  ): VisionFrame => {
    renderToCanvas(canvas, points, lines, minE, maxE, minN, maxN, { frameLabel: label, fadedPtNums });
    const dataUrl = canvas.toDataURL('image/png');
    const base64  = dataUrl.split(',')[1];
    const visible = points.filter(p =>
      p.easting  >= minE && p.easting  <= maxE &&
      p.northing >= minN && p.northing <= maxN,
    );
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

  // ── Frame 1: Overview (full extent + 15% padding) ──────────────────────────
  const padE = ext.spanE * 0.15;
  const padN = ext.spanN * 0.15;
  frames.push(capture(
    ext.minE - padE, ext.maxE + padE,
    ext.minN - padN, ext.maxN + padN,
    `FRAME 1/? | OVERVIEW  ${points.length} pts  ${ext.spanE.toFixed(0)}ft × ${ext.spanN.toFixed(0)}ft`,
    1.0,
  ));

  // ── Frames 2–N: Top density clusters (zone zoom) ───────────────────────────
  const clusters  = computeGridCells(points, ext, 4, 3);
  const topCells  = clusters.slice(0, maxClusterFrames);

  for (let i = 0; i < topCells.length; i++) {
    const cell    = topCells[i];
    const spanMax = Math.max(cell.maxE - cell.minE, cell.maxN - cell.minN);
    const pad     = spanMax * 0.28;
    const dir     = cardinalOf(cell, ext);
    const faded   = new Set(points.filter(p => !cell.points.includes(p)).map(p => p.pointNumber));
    const ov      = ext.spanE * ext.spanN;
    const zv      = (cell.maxE - cell.minE + 2 * pad) * (cell.maxN - cell.minN + 2 * pad);
    const zoom    = ov / Math.max(zv, 1);
    frames.push(capture(
      cell.minE - pad, cell.maxE + pad,
      cell.minN - pad, cell.maxN + pad,
      `FRAME ${i + 2}/? | ZONE ${dir}  ${cell.points.length} pts`,
      zoom, faded,
    ));
  }

  // ── Frames N+1…M: Detail zoom on densest clusters ─────────────────────────
  for (let i = 0; i < Math.min(maxDetailFrames, topCells.length); i++) {
    const cell      = topCells[i];
    const cellExt   = computeExtent(cell.points)!;
    const pad       = Math.max(cellExt.spanE, cellExt.spanN) * 0.30;
    const dir       = cardinalOf(cell, ext);
    const ov        = ext.spanE * ext.spanN;
    const zv        = (cellExt.spanE + 2 * pad) * (cellExt.spanN + 2 * pad);
    const zoom      = ov / Math.max(zv, 1);
    frames.push(capture(
      cellExt.minE - pad, cellExt.maxE + pad,
      cellExt.minN - pad, cellExt.maxN + pad,
      `FRAME ${frames.length + 1}/? | DETAIL ${dir}  ${cell.points.length} pts`,
      zoom,
    ));
  }

  // Fix the /? placeholder now that we know total count
  const total = frames.length;
  for (const f of frames) {
    f.label = f.label.replace('/? |', `/${total} |`);
  }

  // ── Spatial narrative ──────────────────────────────────────────────────────
  const descSummary   = topDescriptions(points, 12);
  const layerNames    = [...new Set(lines.map(l => l.layer ?? '').filter(Boolean))].slice(0, 8);
  const clusterSummary = topCells.map(c => `${cardinalOf(c, ext)}(${c.points.length})`).join(', ');

  const spatialNarrative = [
    `Visual survey complete — ${total} frames captured.`,
    `Survey spans ${ext.spanE.toFixed(0)} ft East–West × ${ext.spanN.toFixed(0)} ft North–South.`,
    `Total: ${points.length} survey points, ${lines.length} existing line segments.`,
    `Point type distribution (most frequent): ${descSummary.join(', ')}.`,
    `Existing linework layers: ${layerNames.length ? layerNames.join(', ') : 'none yet'}.`,
    `Spatial density (quadrant → point count): ${clusterSummary}.`,
    `Use the above visual evidence — spatial relationships, clusters, corridors, and alignments —`,
    `as the primary context for drafting decisions. Prioritise patterns visible in the images.`,
  ].join('\n');

  return {
    frames,
    spatialNarrative,
    totalPoints: points.length,
    totalLines: lines.length,
    surveyExtentFt: { width: ext.spanE, height: ext.spanN },
    capturedAt: Date.now(),
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

  // ── Briefing header ────────────────────────────────────────────────────────
  parts.push({
    text:
      `${textContext}\n\n` +
      `╔══════════════════════════════════════════════════════════════╗\n` +
      `║  CIVIL DRAFTER — GIMBAL VISION SURVEY  (${vision.frames.length} frames)         ║\n` +
      `╚══════════════════════════════════════════════════════════════╝\n\n` +
      `You are receiving a structured visual inspection of the survey.\n` +
      `The camera started wide (full survey extent) and progressively zoomed\n` +
      `into each spatial cluster — exactly as a professional drafter would walk\n` +
      `the site in their mind before picking up a pen.\n\n` +
      `Study every image carefully. Identify:\n` +
      `  • Road / corridor alignments (parallel EP shot rows)\n` +
      `  • Intersections and cul-de-sacs\n` +
      `  • Building footprint clusters\n` +
      `  • Utility corridors\n` +
      `  • Property / boundary features\n` +
      `  • Topographic relief hints (density of topo shots)\n\n` +
      `SPATIAL SUMMARY:\n${vision.spatialNarrative}\n`,
  });

  // ── Interleaved frames ─────────────────────────────────────────────────────
  for (const frame of vision.frames) {
    parts.push({ text: `\n─── ${frame.label} ───\n${frame.description}` });
    parts.push({ inlineData: { mimeType: 'image/png', data: frame.base64 } });
  }
  // ── Georeferenced aerial reference (NAIP / satellite) ─────────────────────
  if (aerialImages.length > 0) {
    parts.push({
      text:
        `\n─── AERIAL IMAGERY REFERENCE (${aerialImages.length} image${aerialImages.length > 1 ? 's' : ''}) ───\n` +
        `The following low-resolution aerial photo(s) cover the same survey extent\n` +
        `as the frames above (north up). Use them for ROUGH feature identification\n` +
        `only: confirm where roads, buildings, driveways, parking, fences, tree\n` +
        `lines and drainage actually are, and sanity-check the orientation and\n` +
        `general shape of what you draw. The survey points remain the geometric\n` +
        `authority — do not trace precise geometry off this imagery.`,
    });
    for (const img of aerialImages) {
      if (img.label) parts.push({ text: `\n${img.label}` });
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    }
  }
  // ── Drafting request ───────────────────────────────────────────────────────
  parts.push({
    text:
      `\n╔══════════════════════════════════════════════════════════════╗\n` +
      `║  VISUAL SURVEY COMPLETE — PROCEEDING WITH DRAFTING REQUEST   ║\n` +
      `╚══════════════════════════════════════════════════════════════╝\n\n` +
      `You have seen the full spatial scene from wide to detail.\n` +
      `Now apply expert civil drafting judgment to the following request.\n` +
      `Your linework must reflect the spatial patterns visible in the images.\n\n` +
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
  return /\b(draw|draft|create|generate|make|produce|build|trace|connect|plot|linework|polyline|road|edge|building|corridor|boundary|topo|contour|all points|feature|map|surveyed|survey|everything)\b/i.test(query);
}
