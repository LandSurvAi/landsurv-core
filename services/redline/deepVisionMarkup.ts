/**
 * Redline Agent — Deep-mode visual markup helpers.
 *
 * The vision model returns normalized boxes (0–1000, top-left origin). These
 * pure helpers map those detections into the same page-space markup model used
 * by Fast mode and suppress re-detections of embedded annotations.
 */

import type { RedlineMarkup, RedlineMarkupKind } from '../../types';

export interface DeepVisionDetection {
  kind?: string;
  text?: string;
  box2dNorm?: number[];
  color?: string;
  confidence?: number;
}

export type NormalizedVisionBox = [number, number, number, number];

/** Map a model-proposed visual kind onto the Redline taxonomy. */
export function normalizeDeepVisionKind(raw: string | undefined): RedlineMarkupKind {
  switch ((raw ?? '').trim().toLowerCase()) {
    case 'callout':
    case 'freetext':
      return 'callout';
    case 'deletion':
    case 'delete':
    case 'strikeout':
      return 'deletion';
    case 'pointer':
    case 'arrow':
      return 'pointer';
    case 'cloud':
    case 'revision-cloud':
    case 'revision_cloud':
      return 'cloud';
    case 'highlight':
      return 'highlight';
    case 'note':
    case 'comment':
      return 'note';
    case 'dimension':
      return 'dimension';
    default:
      return 'other';
  }
}

/** Clamp and sort a 0–1000 normalized vision box. */
export function normalizeDeepVisionBox(raw: number[] | undefined): NormalizedVisionBox | null {
  if (!Array.isArray(raw) || raw.length < 4) return null;
  const values = raw.slice(0, 4).map((value) => Number(value));
  if (!values.every((value) => Number.isFinite(value))) return null;
  const [x1, y1, x2, y2] = values.map((value) => Math.max(0, Math.min(1000, value)));
  const box: NormalizedVisionBox = [
    Math.min(x1, x2),
    Math.min(y1, y2),
    Math.max(x1, x2),
    Math.max(y1, y2),
  ];
  if (box[2] - box[0] < 2 || box[3] - box[1] < 2) return null;
  return box;
}

/** Convert a normalized vision box into top-left PDF page-space points. */
export function deepVisionBoxToRect(
  box: NormalizedVisionBox,
  pageWidth: number,
  pageHeight: number,
): [number, number, number, number] {
  const width = Math.max(1, pageWidth);
  const height = Math.max(1, pageHeight);
  return [
    (box[0] / 1000) * width,
    (box[1] / 1000) * height,
    (box[2] / 1000) * width,
    (box[3] / 1000) * height,
  ];
}

function area(rect: [number, number, number, number]): number {
  return Math.max(0, rect[2] - rect[0]) * Math.max(0, rect[3] - rect[1]);
}

function intersectionArea(
  a: [number, number, number, number],
  b: [number, number, number, number],
): number {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[2], b[2]);
  const y2 = Math.min(a[3], b[3]);
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

/** True when a visual box substantially overlaps an already-extracted mark. */
export function isDeepVisionDuplicate(
  rect: [number, number, number, number],
  existing: [number, number, number, number],
): boolean {
  const inter = intersectionArea(rect, existing);
  if (inter <= 0) return false;
  const smaller = Math.min(area(rect), area(existing));
  if (smaller <= 0) return false;
  return inter / smaller >= 0.35;
}

/** Build a page-space markup from a vision detection, or null when unusable. */
export function buildDeepVisionMarkup(input: {
  sheetId: string;
  fileName: string;
  pageIndex: number;
  detection: DeepVisionDetection;
  index: number;
  pageWidth: number;
  pageHeight: number;
}): RedlineMarkup | null {
  const box = normalizeDeepVisionBox(input.detection.box2dNorm);
  if (!box) return null;
  const rect = deepVisionBoxToRect(box, input.pageWidth, input.pageHeight);
  const text = typeof input.detection.text === 'string'
    ? input.detection.text.replace(/\r\n/g, '\n').trim()
    : '';
  return {
    id: `${input.sheetId}-deep-${input.index}`,
    sheetId: input.sheetId,
    subtype: 'DeepVision',
    rawText: text,
    color: typeof input.detection.color === 'string' && /^#[0-9a-f]{6}$/i.test(input.detection.color)
      ? input.detection.color
      : undefined,
    rect,
    box2dNorm: box,
    kind: normalizeDeepVisionKind(input.detection.kind),
    sourceRef: `${input.fileName}#${input.sheetId}#deep-${input.index}`,
  };
}
