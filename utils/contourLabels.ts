import type { ContourLabel, IsoPath, SurveyLine } from '../types.ts';
import { surveyLinesToIsoPaths } from './contouring.ts';

export interface Point2D {
  x: number;
  y: number;
}

export interface ContourLabelOptions {
  /** Existing contour-label density control: 0.5 => roughly 400 ft between labels. */
  labelDensity?: number;
  /** When true, only index/major contours receive labels. Defaults to false. */
  majorOnly?: boolean;
  /** Paths shorter than this (project units) are left unlabeled. */
  minPathLength?: number;
}

export interface StrikeContourLabelsOptions {
  labels: ContourLabel[];
  lines: SurveyLine[];
  start: Point2D;
  end: Point2D;
  mode: 'place' | 'erase';
  /** World-space distance from the strike line that counts as a label hit. */
  eraseTolerance?: number;
  /** World-space distance used to avoid stacking a new label on an existing one. */
  duplicateTolerance?: number;
}

export interface StrikeContourLabelsResult {
  labels: ContourLabel[];
  added: number;
  removed: number;
  removedLabels: ContourLabel[];
}

function normalizeLabelAngle(degrees: number): number {
  let angle = degrees;
  while (angle <= -180) angle += 360;
  while (angle > 180) angle -= 360;
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  return angle;
}

/** `104.5` stays `104.5`; `104.00` becomes `104`. */
export function formatContourElevation(elevation: number): string {
  const rounded = Math.round(elevation * 100) / 100;
  return String(rounded);
}

function isContourLine(line: SurveyLine): boolean {
  return Boolean(
    line.type?.startsWith('contour')
    || /contour/i.test(line.layer ?? '')
  );
}

function distancePointToSegment(point: Point2D, start: Point2D, end: Point2D): number {
  const vx = end.x - start.x;
  const vy = end.y - start.y;
  const lengthSq = vx * vx + vy * vy;
  if (lengthSq < 1e-12) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * vx + (point.y - start.y) * vy) / lengthSq));
  return Math.hypot(point.x - (start.x + t * vx), point.y - (start.y + t * vy));
}

function segmentIntersection(
  a1: Point2D,
  a2: Point2D,
  b1: Point2D,
  b2: Point2D,
): Point2D | null {
  const r = { x: a2.x - a1.x, y: a2.y - a1.y };
  const s = { x: b2.x - b1.x, y: b2.y - b1.y };
  const denominator = r.x * s.y - r.y * s.x;
  if (Math.abs(denominator) < 1e-12) return null;

  const qpx = b1.x - a1.x;
  const qpy = b1.y - a1.y;
  const t = (qpx * s.y - qpy * s.x) / denominator;
  const u = (qpx * r.y - qpy * r.x) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;

  return { x: a1.x + t * r.x, y: a1.y + t * r.y };
}

/**
 * Distribute labels along every contour path. The default behaviour labels
 * every contour (not only index/major lines) so a freshly generated or fetched
 * surface is readable without opening the label tools first.
 */
export function generateContourLabelsFromIsoPaths(
  isoPaths: IsoPath[],
  options: ContourLabelOptions = {},
): ContourLabel[] {
  const density = Math.max(0.1, options.labelDensity ?? 0.5);
  const spacing = Math.max(20, 200 / density);
  const minPathLength = Math.max(0, options.minPathLength ?? 20);
  const labels: ContourLabel[] = [];

  for (const path of isoPaths) {
    if (!Number.isFinite(path.elevation) || path.vertices.length < 2) continue;
    if (options.majorOnly && !path.isMajor) continue;

    const segmentLengths: number[] = [];
    let totalLength = 0;
    for (let i = 0; i < path.vertices.length - 1; i++) {
      const a = path.vertices[i];
      const b = path.vertices[i + 1];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      segmentLengths.push(length);
      totalLength += length;
    }
    if (totalLength < minPathLength) continue;

    const labelCount = Math.max(1, Math.ceil(totalLength / spacing));
    for (let labelIndex = 0; labelIndex < labelCount; labelIndex++) {
      const target = totalLength * ((labelIndex + 0.5) / labelCount);
      let walked = 0;
      for (let i = 0; i < segmentLengths.length; i++) {
        const length = segmentLengths[i];
        if (length <= 0) continue;
        if (walked + length < target) {
          walked += length;
          continue;
        }

        const a = path.vertices[i];
        const b = path.vertices[i + 1];
        const t = Math.max(0, Math.min(1, (target - walked) / length));
        labels.push({
          x: a.x + t * (b.x - a.x),
          y: a.y + t * (b.y - a.y),
          text: formatContourElevation(path.elevation),
          angle: normalizeLabelAngle(Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI)),
        });
        break;
      }
    }
  }

  return labels;
}

/** Rebuild labels from rendered contour segments (e.g. imported ESRI lines). */
export function generateContourLabelsFromLines(
  lines: SurveyLine[],
  options: ContourLabelOptions = {},
): ContourLabel[] {
  const contourLines = lines.filter(line =>
    !line.hidden
    && line.fromPt
    && line.toPt
    && isContourLine(line)
  );
  return generateContourLabelsFromIsoPaths(surveyLinesToIsoPaths(contourLines), options);
}

/**
 * Strike a line across contours to place a label at every crossing, or strike
 * through labels to erase the ones the line passes through.
 */
export function strikeContourLabels(options: StrikeContourLabelsOptions): StrikeContourLabelsResult {
  const {
    labels,
    lines,
    start,
    end,
    mode,
    eraseTolerance = 10,
    duplicateTolerance = 6,
  } = options;

  if (mode === 'erase') {
    const removedLabels = labels.filter(label =>
      distancePointToSegment({ x: label.x, y: label.y }, start, end) <= eraseTolerance
    );
    if (removedLabels.length === 0) {
      return { labels, added: 0, removed: 0, removedLabels: [] };
    }
    const removed = new Set(removedLabels);
    return {
      labels: labels.filter(label => !removed.has(label)),
      added: 0,
      removed: removedLabels.length,
      removedLabels,
    };
  }

  const added: ContourLabel[] = [];
  const allLabels = [...labels];
  for (const line of lines) {
    if (line.hidden || !line.fromPt || !line.toPt || !isContourLine(line)) continue;

    const intersection = segmentIntersection(start, end, line.fromPt, line.toPt);
    if (!intersection) continue;

    const elevation = line.fromPt.z ?? line.toPt.z;
    if (typeof elevation !== 'number' || !Number.isFinite(elevation)) continue;

    const tooClose = allLabels.some(label =>
      Math.hypot(label.x - intersection.x, label.y - intersection.y) <= duplicateTolerance
    );
    if (tooClose) continue;

    const label: ContourLabel = {
      x: intersection.x,
      y: intersection.y,
      text: formatContourElevation(elevation),
      angle: normalizeLabelAngle(
        Math.atan2(line.toPt.y - line.fromPt.y, line.toPt.x - line.fromPt.x) * (180 / Math.PI),
      ),
    };
    added.push(label);
    allLabels.push(label);
  }

  if (added.length === 0) {
    return { labels, added: 0, removed: 0, removedLabels: [] };
  }
  return {
    labels: [...labels, ...added],
    added: added.length,
    removed: 0,
    removedLabels: [],
  };
}
