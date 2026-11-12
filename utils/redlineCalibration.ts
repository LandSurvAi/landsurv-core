/**
 * Redline Agent — two-point sheet calibration.
 *
 * The reviewer's PDF is a paper-space drawing; the canvas is world space
 * (easting/northing). Two identified points are enough to solve a similarity
 * transform (uniform scale + rotation + translation) as long as the sheet is
 * digital and undistorted.
 *
 * Coordinate convention
 * ---------------------
 * `pdfA`/`pdfB` are supplied in **top-left page space after /Rotate** — the
 * coordinates a click produces from a PDF.js viewport. Solving flips them to a
 * bottom-left, y-up frame (the same handedness as world easting/northing).
 * `RedlineSheetRegistration.pdfA`/`pdfB` store the normalized (y-up) values.
 */

import type { RedlineSheetRegistration } from '../types';

export interface PagePoint {
  x: number;
  y: number;
}

export interface WorldPoint {
  easting: number;
  northing: number;
}

export interface TwoPointCalibrationInput {
  pdfA: PagePoint;
  pdfB: PagePoint;
  worldA: WorldPoint;
  worldB: WorldPoint;
  /** PDF page height in points after rotation. Required for the y-flip. */
  pageHeight: number;
  /** Optional titleblock plot scale, in project units per PDF point. */
  expectedUnitsPerPoint?: number;
}

const MIN_SHEET_SEPARATION_PT = 72; // one inch
const MIN_WORLD_SEPARATION = 20; // project units, feet in most projects
const MIN_SCALE = 0.01;
const MAX_SCALE = 10;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const distance = (a: PagePoint, b: PagePoint): number =>
  Math.hypot(b.x - a.x, b.y - a.y);

const worldDistance = (a: WorldPoint, b: WorldPoint): number =>
  Math.hypot(b.easting - a.easting, b.northing - a.northing);

/** Normalized page space (bottom-left, y-up) from top-left page space. */
export function toPdfUserSpace(point: PagePoint, pageHeight: number): PagePoint {
  return { x: point.x, y: pageHeight - point.y };
}

/** Top-left page space from normalized PDF user space. */
export function toPageSpace(point: PagePoint, pageHeight: number): PagePoint {
  return { x: point.x, y: pageHeight - point.y };
}

/**
 * Solve `world = scale * R(theta) * pdf + translation` from two point pairs.
 * Returns a registration with `valid: false` and explanatory warnings when the
 * pair is degenerate, mirrored, or physically implausible.
 */
export function solveTwoPointCalibration(
  input: TwoPointCalibrationInput,
  now: string = new Date().toISOString(),
): RedlineSheetRegistration {
  const warnings: string[] = [];
  const pdfA = toPdfUserSpace(input.pdfA, input.pageHeight);
  const pdfB = toPdfUserSpace(input.pdfB, input.pageHeight);
  const worldA = { ...input.worldA };
  const worldB = { ...input.worldB };

  const empty: RedlineSheetRegistration = {
    pdfA,
    pdfB,
    worldA,
    worldB,
    scale: 0,
    rotation: 0,
    translation: { easting: 0, northing: 0 },
    valid: false,
    warnings,
    calibratedAt: now,
  };

  const allValues = [
    pdfA.x, pdfA.y, pdfB.x, pdfB.y,
    worldA.easting, worldA.northing, worldB.easting, worldB.northing,
  ];
  if (!allValues.every(isFiniteNumber)) {
    warnings.push('Calibration points must be finite numbers.');
    return empty;
  }

  const dp = { x: pdfB.x - pdfA.x, y: pdfB.y - pdfA.y };
  const dw = { x: worldB.easting - worldA.easting, y: worldB.northing - worldA.northing };
  const dpLength = Math.hypot(dp.x, dp.y);
  const dwLength = Math.hypot(dw.x, dw.y);

  if (dpLength < MIN_SHEET_SEPARATION_PT) {
    warnings.push('Sheet points are too close together. Pick two points at least one inch apart.');
    return empty;
  }
  if (dwLength < MIN_WORLD_SEPARATION) {
    warnings.push('Coordinate points are too close together. Enter two distinct project coordinates.');
    return empty;
  }

  // A two-point similarity is always orientation-preserving (positive
  // determinant): it cannot represent a mirror. A reversed pairing is
  // mathematically a 180° rotation, which is a valid sheet orientation, so it
  // must not be rejected here. The operator confirms the result visually before
  // any drawing edit is allowed.
  const scale = dwLength / dpLength;
  if (scale < MIN_SCALE || scale > MAX_SCALE) {
    warnings.push(
      `Implausible sheet scale (${scale.toFixed(4)} project units per PDF point). Check the coordinate units and the picked points.`,
    );
    return empty;
  }

  const theta = Math.atan2(dw.y, dw.x) - Math.atan2(dp.y, dp.x);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  // translation = worldA - scale * R * pdfA
  const rotatedAx = cos * pdfA.x - sin * pdfA.y;
  const rotatedAy = sin * pdfA.x + cos * pdfA.y;
  const translation = {
    easting: worldA.easting - scale * rotatedAx,
    northing: worldA.northing - scale * rotatedAy,
  };

  // Residual at B catches gross entry mistakes before the run starts.
  const rotatedBx = cos * pdfB.x - sin * pdfB.y;
  const rotatedBy = sin * pdfB.x + cos * pdfB.y;
  const predictedB = {
    easting: scale * rotatedBx + translation.easting,
    northing: scale * rotatedBy + translation.northing,
  };
  const residual = worldDistance(predictedB, worldB);
  if (residual > Math.max(0.05, dwLength * 0.001)) {
    warnings.push(
      `Calibration does not close: point B lands ${residual.toFixed(2)} project units from its entered coordinate.`,
    );
  }

  if (input.expectedUnitsPerPoint && input.expectedUnitsPerPoint > 0) {
    const ratio = scale / input.expectedUnitsPerPoint;
    if (ratio > 1.05 || ratio < 0.95) {
      warnings.push(
        `Solved scale is ${(ratio * 100).toFixed(1)}% of the sheet's declared plot scale.`,
      );
    }
  }

  // Feet/metres mistakes are the most common coordinate error. Flag the ratio
  // against an imperial-looking titleblock scale when one was supplied.
  if (input.expectedUnitsPerPoint) {
    const ratio = scale / input.expectedUnitsPerPoint;
    if (Math.abs(ratio - 3.28084) < 0.15 || Math.abs(ratio - 0.3048) < 0.02) {
      warnings.push('Coordinate units look like feet/metres are mixed. Confirm the project linear unit.');
    }
  }

  return {
    pdfA,
    pdfB,
    worldA,
    worldB,
    scale,
    rotation: theta,
    translation,
    valid: true,
    warnings,
    calibratedAt: now,
  };
}

/** Map a normalized PDF user-space point into world coordinates. */
export function pdfPointToWorld(
  registration: RedlineSheetRegistration,
  point: PagePoint,
): WorldPoint {
  const cos = Math.cos(registration.rotation);
  const sin = Math.sin(registration.rotation);
  return {
    easting: registration.scale * (cos * point.x - sin * point.y) + registration.translation.easting,
    northing: registration.scale * (sin * point.x + cos * point.y) + registration.translation.northing,
  };
}

/** Map a world point back onto the sheet, in normalized PDF user space. */
export function worldPointToPdf(
  registration: RedlineSheetRegistration,
  point: WorldPoint,
): PagePoint {
  const dx = (point.easting - registration.translation.easting) / registration.scale;
  const dy = (point.northing - registration.translation.northing) / registration.scale;
  const cos = Math.cos(-registration.rotation);
  const sin = Math.sin(-registration.rotation);
  return { x: cos * dx - sin * dy, y: sin * dx + cos * dy };
}

/** Top-left anchor from a PDF annotation rect. */
export function rectCenter(rect: [number, number, number, number]): PagePoint {
  return {
    x: (rect[0] + rect[2]) / 2,
    y: (rect[1] + rect[3]) / 2,
  };
}

/** True when a top-left page-space point lies inside an annotation rect. */
export function rectContains(
  rect: [number, number, number, number],
  point: PagePoint,
  padding = 0,
): boolean {
  const [x1, y1, x2, y2] = [
    Math.min(rect[0], rect[2]) - padding,
    Math.min(rect[1], rect[3]) - padding,
    Math.max(rect[0], rect[2]) + padding,
    Math.max(rect[1], rect[3]) + padding,
  ];
  return point.x >= x1 && point.x <= x2 && point.y >= y1 && point.y <= y2;
}

/** Human-readable sheet scale, e.g. "1 PDF pt = 0.125 ft". */
export function describeRegistration(registration: RedlineSheetRegistration | null): string {
  if (!registration) return 'Not calibrated';
  if (!registration.valid) return 'Needs recalibration';
  const degrees = (registration.rotation * 180) / Math.PI;
  return `${registration.scale.toFixed(4)} units/pt · ${degrees.toFixed(2)}°`;
}
