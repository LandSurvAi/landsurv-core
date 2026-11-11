/**
 * Dirt Volume Engine
 *
 * Deterministic earthwork quantity takeoffs for the Dirt Volume Agent:
 *   - End-area volumes from consecutive cross sections (average end area or
 *     Simpson's rule when the stations are uniformly spaced).
 *   - Grid volumes between existing-ground and proposed-surface elevations.
 *   - TIN-to-TIN cut/fill by sampling the overlap of two project surfaces.
 *   - Stockpile volume above a base elevation from a top-surface point set.
 *
 * All quantities are computed in cubic feet first and reported in cubic yards
 * (1 CY = 27 CF). Cut is bank / in-place material; fill is compacted in-place
 * material. Optional cut swell and fill shrink are applied only to the
 * haul-balance comparison and are shown separately.
 *
 * These are quantity takeoffs, not a substitute for a sealed earthwork design.
 */

import type { SurveyPoint, TinSurface } from '../types.ts';
import { buildTinFromPoints, sampleElevationAt } from './TinService.ts';

export const CF_PER_CY = 27;
export const SQFT_PER_ACRE = 43560;

export type DirtVolumeMethod = 'end-area' | 'grid' | 'tin' | 'stockpile';

export interface DirtVolumeAdjustments {
  /** Percent of bank volume gained when cut material is loosened for hauling. */
  cutSwellPercent?: number;
  /** Percent of compacted fill volume lost relative to bank volume. */
  fillShrinkPercent?: number;
}

export interface VolumeSection {
  /** Station in project feet. */
  station: number;
  /** Cut area at the section, square feet. */
  cutAreaSf: number;
  /** Fill area at the section, square feet. */
  fillAreaSf: number;
  description?: string;
}

export interface DirtVolumeSummary {
  method: DirtVolumeMethod;
  methodLabel: string;
  calculationMethod: string;
  cutCf: number;
  fillCf: number;
  cutCy: number;
  fillCy: number;
  /** Raw cut minus raw fill, cubic yards. */
  netCy: number;
  /** Cut volume after applying cut swell, cubic yards. */
  cutLooseCy: number;
  /** Bank volume required to place the compacted fill, cubic yards. */
  fillBankRequiredCy: number;
  /** cutCy - fillBankRequiredCy, cubic yards. Positive = surplus. */
  adjustedNetCy: number;
  /** cutCy / fillBankRequiredCy; null when there is no fill. */
  cutToFillRatio: number | null;
  cutSwellPercent: number;
  fillShrinkPercent: number;
  planAreaSf: number | null;
  planAreaAcres: number | null;
  lengthFt: number | null;
  sectionCount: number | null;
  cellsComputed: number | null;
  cellsSkipped: number | null;
  maxCutFt: number | null;
  maxFillFt: number | null;
  warnings: string[];
  computedAt: number;
}

export interface EndAreaVolumeResult extends DirtVolumeSummary {
  method: 'end-area';
  sections: VolumeSection[];
}

export interface GridVolumeInput extends DirtVolumeAdjustments {
  /** Project easting of grid column 0. */
  originEasting?: number;
  /** Project northing of grid row 0. */
  originNorthing?: number;
  /** Node spacing in the easting direction, feet. */
  spacingX: number;
  /** Node spacing in the northing direction, feet. */
  spacingY: number;
  /**
   * Existing-ground elevations, indexed [row][column]. Row 0 is the southern
   * edge; each row advances north by spacingY and each column east by spacingX.
   */
  existing: number[][];
  /** Proposed-surface elevations with the same dimensions as `existing`. */
  proposed: number[][];
  /** Ignore elevation differences smaller than this, feet. Default 0.001. */
  toleranceFt?: number;
}

export interface GridVolumeResult extends DirtVolumeSummary {
  method: 'grid';
}

export interface TinVolumeInput extends DirtVolumeAdjustments {
  existing: TinSurface;
  proposed: TinSurface;
  /** Sampling grid spacing, feet. Defaults to a 120 x 120 grid over the overlap. */
  spacingFt?: number;
  /** Ignore elevation differences smaller than this, feet. Default 0.01. */
  toleranceFt?: number;
}

export interface TinVolumeResult extends DirtVolumeSummary {
  method: 'tin';
  overlap: { minEasting: number; minNorthing: number; maxEasting: number; maxNorthing: number };
}

export interface StockpilePoint {
  easting: number;
  northing: number;
  elevation: number;
}

export interface StockpileVolumeInput extends DirtVolumeAdjustments {
  /** Flat base elevation the stockpile sits on, feet. */
  baseElevation: number;
  /** Top-surface shots defining the pile. At least three points are required. */
  points: StockpilePoint[];
  /** Sampling grid spacing, feet. Defaults to a 120 x 120 grid over the footprint. */
  spacingFt?: number;
}

export interface StockpileVolumeResult extends DirtVolumeSummary {
  method: 'stockpile';
  baseElevation: number;
}

export type DirtVolumeResult =
  | EndAreaVolumeResult
  | GridVolumeResult
  | TinVolumeResult
  | StockpileVolumeResult;

const METHOD_LABELS: Record<DirtVolumeMethod, string> = {
  'end-area': 'Average End Area',
  grid: 'Grid Method',
  tin: 'TIN-to-TIN Surface Comparison',
  stockpile: 'Stockpile Volume',
};

function finiteOrThrow(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`);
  }
  return value;
}

function nonNegative(value: unknown, field: string): number {
  const parsed = finiteOrThrow(value, field);
  if (parsed < 0) throw new Error(`${field} must be zero or greater.`);
  return parsed;
}

function resolveFactors(input: DirtVolumeAdjustments): {
  cutSwellPercent: number;
  fillShrinkPercent: number;
} {
  const cutSwellPercent = nonNegative(input.cutSwellPercent ?? 0, 'cutSwellPercent');
  const fillShrinkPercent = nonNegative(input.fillShrinkPercent ?? 0, 'fillShrinkPercent');
  if (fillShrinkPercent >= 100) {
    throw new Error('fillShrinkPercent must be less than 100.');
  }
  return { cutSwellPercent, fillShrinkPercent };
}

function buildSummary(args: {
  method: DirtVolumeMethod;
  calculationMethod: string;
  cutCf: number;
  fillCf: number;
  factors: { cutSwellPercent: number; fillShrinkPercent: number };
  planAreaSf?: number | null;
  lengthFt?: number | null;
  sectionCount?: number | null;
  cellsComputed?: number | null;
  cellsSkipped?: number | null;
  maxCutFt?: number | null;
  maxFillFt?: number | null;
  warnings: string[];
}): DirtVolumeSummary {
  const cutCy = args.cutCf / CF_PER_CY;
  const fillCy = args.fillCf / CF_PER_CY;
  const cutLooseCy = cutCy * (1 + args.factors.cutSwellPercent / 100);
  const fillBankRequiredCy = fillCy / (1 - args.factors.fillShrinkPercent / 100);
  const adjustedNetCy = cutCy - fillBankRequiredCy;
  const planAreaSf = args.planAreaSf ?? null;

  return {
    method: args.method,
    methodLabel: METHOD_LABELS[args.method],
    calculationMethod: args.calculationMethod,
    cutCf: args.cutCf,
    fillCf: args.fillCf,
    cutCy,
    fillCy,
    netCy: cutCy - fillCy,
    cutLooseCy,
    fillBankRequiredCy,
    adjustedNetCy,
    cutToFillRatio: fillBankRequiredCy > 0 ? cutCy / fillBankRequiredCy : null,
    cutSwellPercent: args.factors.cutSwellPercent,
    fillShrinkPercent: args.factors.fillShrinkPercent,
    planAreaSf,
    planAreaAcres: planAreaSf !== null ? planAreaSf / SQFT_PER_ACRE : null,
    lengthFt: args.lengthFt ?? null,
    sectionCount: args.sectionCount ?? null,
    cellsComputed: args.cellsComputed ?? null,
    cellsSkipped: args.cellsSkipped ?? null,
    maxCutFt: args.maxCutFt ?? null,
    maxFillFt: args.maxFillFt ?? null,
    warnings: args.warnings,
    computedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// End-area volumes
// ---------------------------------------------------------------------------

/**
 * Volumes from consecutive cross sections.
 *
 * Average end area: V = L x (A1 + A2) / 2 for each pair of sections.
 * Simpson's rule (optional, uniformly spaced sections with an even number of
 * intervals): V = L / 3 x (A1 + 4A2 + A3).
 */
export function computeEndAreaVolumes(
  sections: VolumeSection[],
  options: DirtVolumeAdjustments & { useSimpsonRule?: boolean } = {},
): EndAreaVolumeResult {
  if (!Array.isArray(sections) || sections.length < 2) {
    throw new Error('At least two cross sections are required.');
  }
  const factors = resolveFactors(options);
  const ordered = sections
    .map((section, index) => ({
      station: finiteOrThrow(section.station, `sections[${index}].station`),
      cutAreaSf: nonNegative(section.cutAreaSf, `sections[${index}].cutAreaSf`),
      fillAreaSf: nonNegative(section.fillAreaSf, `sections[${index}].fillAreaSf`),
      description: section.description,
    }))
    .sort((a, b) => a.station - b.station);

  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].station <= ordered[i - 1].station) {
      throw new Error('Cross-section stations must be unique and strictly increasing.');
    }
  }

  const warnings: string[] = [];
  const intervals = ordered.slice(1).map((section, index) => ({
    length: section.station - ordered[index].station,
    cut1: ordered[index].cutAreaSf,
    cut2: section.cutAreaSf,
    fill1: ordered[index].fillAreaSf,
    fill2: section.fillAreaSf,
  }));
  const lengthFt = ordered[ordered.length - 1].station - ordered[0].station;

  let calculationMethod = 'Average end area';
  let cutCf = intervals.reduce((sum, interval) => sum + interval.length * (interval.cut1 + interval.cut2) / 2, 0);
  let fillCf = intervals.reduce((sum, interval) => sum + interval.length * (interval.fill1 + interval.fill2) / 2, 0);

  if (options.useSimpsonRule) {
    const spacing = ordered[1].station - ordered[0].station;
    const uniform = intervals.every((interval) => Math.abs(interval.length - spacing) < 1e-6);
    const evenIntervals = intervals.length % 2 === 0;
    if (uniform && evenIntervals) {
      cutCf = 0;
      fillCf = 0;
      for (let i = 0; i < ordered.length - 2; i += 2) {
        cutCf += (spacing / 3) * (ordered[i].cutAreaSf + 4 * ordered[i + 1].cutAreaSf + ordered[i + 2].cutAreaSf);
        fillCf += (spacing / 3) * (ordered[i].fillAreaSf + 4 * ordered[i + 1].fillAreaSf + ordered[i + 2].fillAreaSf);
      }
      calculationMethod = "Simpson's rule";
    } else {
      warnings.push(
        'Simpson\'s rule needs uniformly spaced stations and an even number of intervals; average end area was used instead.',
      );
    }
  }

  if (ordered.some((section) => section.cutAreaSf === 0 && section.fillAreaSf === 0)) {
    warnings.push('One or more sections have zero cut and fill area; confirm the section takeoff.');
  }

  return {
    ...buildSummary({
      method: 'end-area',
      calculationMethod,
      cutCf,
      fillCf,
      factors,
      lengthFt,
      sectionCount: ordered.length,
      warnings,
    }),
    method: 'end-area',
    sections: ordered,
  };
}

// ---------------------------------------------------------------------------
// Grid volumes
// ---------------------------------------------------------------------------

/** Volumes between two elevation grids using the four-corner average cell method. */
export function computeGridVolumes(input: GridVolumeInput): GridVolumeResult {
  const spacingX = finiteOrThrow(input.spacingX, 'spacingX');
  const spacingY = finiteOrThrow(input.spacingY, 'spacingY');
  if (spacingX <= 0 || spacingY <= 0) {
    throw new Error('spacingX and spacingY must be positive.');
  }
  const existing = input.existing;
  const proposed = input.proposed;
  if (!Array.isArray(existing) || !Array.isArray(proposed)) {
    throw new Error('existing and proposed elevation grids are required.');
  }
  if (existing.length < 2 || proposed.length < 2) {
    throw new Error('Each elevation grid needs at least two rows and two columns.');
  }
  if (existing.length !== proposed.length) {
    throw new Error('existing and proposed grids must have the same number of rows.');
  }
  const columns = existing[0]?.length ?? 0;
  if (columns < 2) {
    throw new Error('Each elevation grid needs at least two columns.');
  }
  for (let row = 0; row < existing.length; row++) {
    if (existing[row]?.length !== columns || proposed[row]?.length !== columns) {
      throw new Error('existing and proposed grids must be rectangular and match in size.');
    }
  }

  const factors = resolveFactors(input);
  const toleranceFt = input.toleranceFt ?? 0.001;
  if (toleranceFt < 0) throw new Error('toleranceFt must be zero or greater.');
  const cellArea = spacingX * spacingY;

  let cutCf = 0;
  let fillCf = 0;
  let cellsComputed = 0;
  let cellsSkipped = 0;
  let maxCutFt = 0;
  let maxFillFt = 0;

  for (let row = 0; row < existing.length - 1; row++) {
    for (let column = 0; column < columns - 1; column++) {
      const corners = [
        existing[row][column],
        existing[row][column + 1],
        existing[row + 1][column],
        existing[row + 1][column + 1],
      ];
      const proposedCorners = [
        proposed[row][column],
        proposed[row][column + 1],
        proposed[row + 1][column],
        proposed[row + 1][column + 1],
      ];
      if (
        corners.some((value) => typeof value !== 'number' || !Number.isFinite(value)) ||
        proposedCorners.some((value) => typeof value !== 'number' || !Number.isFinite(value))
      ) {
        cellsSkipped++;
        continue;
      }
      const delta =
        corners.reduce((sum, value) => sum + value, 0) / 4 -
        proposedCorners.reduce((sum, value) => sum + value, 0) / 4;
      cellsComputed++;
      if (Math.abs(delta) < toleranceFt) continue;
      if (delta > 0) {
        cutCf += delta * cellArea;
        maxCutFt = Math.max(maxCutFt, delta);
      } else {
        fillCf += -delta * cellArea;
        maxFillFt = Math.max(maxFillFt, -delta);
      }
    }
  }

  const warnings: string[] = [];
  if (cellsSkipped > 0) {
    warnings.push(`${cellsSkipped} grid cell(s) were skipped because an elevation was missing or non-numeric.`);
  }
  if (cellsComputed === 0) {
    throw new Error('No complete grid cells were available for the volume calculation.');
  }

  return {
    ...buildSummary({
      method: 'grid',
      calculationMethod: 'Four-corner average over each grid cell',
      cutCf,
      fillCf,
      factors,
      planAreaSf: cellsComputed * cellArea,
      cellsComputed,
      cellsSkipped,
      maxCutFt,
      maxFillFt,
      warnings,
    }),
    method: 'grid',
  };
}

// ---------------------------------------------------------------------------
// TIN-to-TIN volumes
// ---------------------------------------------------------------------------

function tinBounds(tin: TinSurface): {
  minEasting: number;
  minNorthing: number;
  maxEasting: number;
  maxNorthing: number;
} | null {
  if (!tin?.vertices?.length) return null;
  let minEasting = Infinity;
  let minNorthing = Infinity;
  let maxEasting = -Infinity;
  let maxNorthing = -Infinity;
  for (const vertex of tin.vertices) {
    if (!Number.isFinite(vertex.easting) || !Number.isFinite(vertex.northing)) continue;
    minEasting = Math.min(minEasting, vertex.easting);
    minNorthing = Math.min(minNorthing, vertex.northing);
    maxEasting = Math.max(maxEasting, vertex.easting);
    maxNorthing = Math.max(maxNorthing, vertex.northing);
  }
  if (!Number.isFinite(minEasting)) return null;
  return { minEasting, minNorthing, maxEasting, maxNorthing };
}

/**
 * Cut/fill between two TIN surfaces over their overlapping footprint.
 *
 * The overlap is sampled on a regular grid; each complete cell contributes the
 * four-corner average elevation difference times the cell area. Cells outside
 * either surface are skipped, so the reported plan area is the sampled overlap,
 * not the full bounding rectangle.
 */
export function computeTinVolumes(input: TinVolumeInput): TinVolumeResult {
  if (!input.existing?.triangles?.length) {
    throw new Error('An existing-ground TIN surface is required.');
  }
  if (!input.proposed?.triangles?.length) {
    throw new Error('A proposed-surface TIN is required.');
  }
  const factors = resolveFactors(input);
  const toleranceFt = input.toleranceFt ?? 0.01;
  if (toleranceFt < 0) throw new Error('toleranceFt must be zero or greater.');

  const existingBounds = tinBounds(input.existing);
  const proposedBounds = tinBounds(input.proposed);
  if (!existingBounds || !proposedBounds) {
    throw new Error('Both surfaces need finite vertices.');
  }
  const overlap = {
    minEasting: Math.max(existingBounds.minEasting, proposedBounds.minEasting),
    minNorthing: Math.max(existingBounds.minNorthing, proposedBounds.minNorthing),
    maxEasting: Math.min(existingBounds.maxEasting, proposedBounds.maxEasting),
    maxNorthing: Math.min(existingBounds.maxNorthing, proposedBounds.maxNorthing),
  };
  if (overlap.maxEasting <= overlap.minEasting || overlap.maxNorthing <= overlap.minNorthing) {
    throw new Error('The two surfaces do not overlap in plan view.');
  }

  const width = overlap.maxEasting - overlap.minEasting;
  const height = overlap.maxNorthing - overlap.minNorthing;
  let spacing = input.spacingFt;
  if (spacing === undefined) {
    const longest = Math.max(width, height);
    spacing = Math.max(1, longest / 120);
  }
  if (!Number.isFinite(spacing) || spacing <= 0) {
    throw new Error('spacingFt must be a positive number.');
  }
  const columns = Math.max(2, Math.ceil(width / spacing) + 1);
  const rows = Math.max(2, Math.ceil(height / spacing) + 1);
  if (columns * rows > 250000) {
    throw new Error(
      `The requested sampling grid is ${columns} x ${rows} nodes. Use a larger spacingFt (250,000 node limit).`,
    );
  }
  const stepX = width / (columns - 1);
  const stepY = height / (rows - 1);
  const cellArea = stepX * stepY;

  const elevations = (tin: TinSurface): number[][] => {
    const grid: number[][] = [];
    for (let row = 0; row < rows; row++) {
      const northing = overlap.minNorthing + row * stepY;
      const values: number[] = [];
      for (let column = 0; column < columns; column++) {
        const easting = overlap.minEasting + column * stepX;
        values.push(sampleElevationAt(tin, easting, northing) ?? NaN);
      }
      grid.push(values);
    }
    return grid;
  };

  const existingGrid = elevations(input.existing);
  const proposedGrid = elevations(input.proposed);

  let cutCf = 0;
  let fillCf = 0;
  let cellsComputed = 0;
  let cellsSkipped = 0;
  let maxCutFt = 0;
  let maxFillFt = 0;

  for (let row = 0; row < rows - 1; row++) {
    for (let column = 0; column < columns - 1; column++) {
      const corners = [
        existingGrid[row][column],
        existingGrid[row][column + 1],
        existingGrid[row + 1][column],
        existingGrid[row + 1][column + 1],
      ];
      const proposedCorners = [
        proposedGrid[row][column],
        proposedGrid[row][column + 1],
        proposedGrid[row + 1][column],
        proposedGrid[row + 1][column + 1],
      ];
      if (
        corners.some((value) => !Number.isFinite(value)) ||
        proposedCorners.some((value) => !Number.isFinite(value))
      ) {
        cellsSkipped++;
        continue;
      }
      const delta =
        corners.reduce((sum, value) => sum + value, 0) / 4 -
        proposedCorners.reduce((sum, value) => sum + value, 0) / 4;
      cellsComputed++;
      if (Math.abs(delta) < toleranceFt) continue;
      if (delta > 0) {
        cutCf += delta * cellArea;
        maxCutFt = Math.max(maxCutFt, delta);
      } else {
        fillCf += -delta * cellArea;
        maxFillFt = Math.max(maxFillFt, -delta);
      }
    }
  }

  if (cellsComputed === 0) {
    throw new Error('No complete cells fell inside both surfaces. Check that the surfaces overlap.');
  }

  const warnings = [
    'TIN volumes are computed from a regular sampling grid over the surface overlap, not from the exact triangle prisms. ' +
      'Use a smaller spacingFt for a tighter estimate.',
  ];
  if (cellsSkipped > 0) {
    warnings.push(`${cellsSkipped} cell(s) crossed outside one of the surfaces and were skipped.`);
  }

  return {
    ...buildSummary({
      method: 'tin',
      calculationMethod: `Regular grid sampling (${columns} x ${rows} nodes, ${spacing.toFixed(2)} ft) over the TIN overlap`,
      cutCf,
      fillCf,
      factors,
      planAreaSf: cellsComputed * cellArea,
      cellsComputed,
      cellsSkipped,
      maxCutFt,
      maxFillFt,
      warnings,
    }),
    method: 'tin',
    overlap,
  };
}

// ---------------------------------------------------------------------------
// Stockpile volume
// ---------------------------------------------------------------------------

/** Volume of a stockpile above a flat base, built from a TIN of its top shots. */
export function computeStockpileVolume(input: StockpileVolumeInput): StockpileVolumeResult {
  const baseElevation = finiteOrThrow(input.baseElevation, 'baseElevation');
  if (!Array.isArray(input.points) || input.points.length < 3) {
    throw new Error('At least three stockpile top points are required.');
  }
  const points: StockpilePoint[] = input.points.map((point, index) => ({
    easting: finiteOrThrow(point.easting, `points[${index}].easting`),
    northing: finiteOrThrow(point.northing, `points[${index}].northing`),
    elevation: finiteOrThrow(point.elevation, `points[${index}].elevation`),
  }));

  const surveyPointsSubmit = points.map((point, index): SurveyPoint => ({
    pointNumber: `SP-${index + 1}`,
    easting: point.easting,
    northing: point.northing,
    elevation: point.elevation,
    description: 'STOCKPILE TOP',
  }));
  const tin = buildTinFromPoints(surveyPointsSubmit, { name: 'Stockpile top' });
  if (!tin) {
    throw new Error('The stockpile top points could not be triangulated. Check for duplicate or collinear points.');
  }
  const bounds = tinBounds(tin);
  if (!bounds) throw new Error('The stockpile surface has no finite extents.');

  const width = bounds.maxEasting - bounds.minEasting;
  const height = bounds.maxNorthing - bounds.minNorthing;
  let spacing = input.spacingFt;
  if (spacing === undefined) {
    spacing = Math.max(0.5, Math.max(width, height) / 120);
  }
  if (!Number.isFinite(spacing) || spacing <= 0) {
    throw new Error('spacingFt must be a positive number.');
  }
  const columns = Math.max(2, Math.ceil(width / spacing) + 1);
  const rows = Math.max(2, Math.ceil(height / spacing) + 1);
  if (columns * rows > 250000) {
    throw new Error(
      `The requested sampling grid is ${columns} x ${rows} nodes. Use a larger spacingFt (250,000 node limit).`,
    );
  }
  const stepX = width / (columns - 1);
  const stepY = height / (rows - 1);
  const cellArea = stepX * stepY;

  const topGrid: number[][] = [];
  for (let row = 0; row < rows; row++) {
    const northing = bounds.minNorthing + row * stepY;
    const values: number[] = [];
    for (let column = 0; column < columns; column++) {
      const easting = bounds.minEasting + column * stepX;
      values.push(sampleElevationAt(tin, easting, northing) ?? NaN);
    }
    topGrid.push(values);
  }

  const factors = resolveFactors(input);
  let cutCf = 0;
  let fillCf = 0;
  let cellsComputed = 0;
  let cellsSkipped = 0;
  let maxCutFt = 0;
  let maxFillFt = 0;

  for (let row = 0; row < rows - 1; row++) {
    for (let column = 0; column < columns - 1; column++) {
      const corners = [
        topGrid[row][column],
        topGrid[row][column + 1],
        topGrid[row + 1][column],
        topGrid[row + 1][column + 1],
      ];
      if (corners.some((value) => !Number.isFinite(value))) {
        cellsSkipped++;
        continue;
      }
      const top = corners.reduce((sum, value) => sum + value, 0) / 4;
      const thickness = top - baseElevation;
      cellsComputed++;
      if (thickness >= 0) {
        cutCf += thickness * cellArea;
        maxCutFt = Math.max(maxCutFt, thickness);
      } else {
        fillCf += -thickness * cellArea;
        maxFillFt = Math.max(maxFillFt, -thickness);
      }
    }
  }

  if (cellsComputed === 0) {
    throw new Error('No complete cells fell inside the stockpile footprint.');
  }
  const warnings = ['Stockpile volume assumes a flat, uniform base elevation across the entire footprint.'];
  if (cellsSkipped > 0) {
    warnings.push(`${cellsSkipped} cell(s) outside the triangulated stockpile footprint were skipped.`);
  }

  return {
    ...buildSummary({
      method: 'stockpile',
      calculationMethod: 'TIN top surface above a flat base elevation, sampled on a regular grid',
      cutCf,
      fillCf,
      factors,
      planAreaSf: cellsComputed * cellArea,
      cellsComputed,
      cellsSkipped,
      maxCutFt,
      maxFillFt,
      warnings,
    }),
    method: 'stockpile',
    baseElevation,
  };
}

// ---------------------------------------------------------------------------
// Scenario store (session)
// ---------------------------------------------------------------------------

export interface DirtVolumeScenario {
  id: string;
  name: string;
  notes: string;
  method: DirtVolumeMethod;
  methodLabel: string;
  calculationMethod: string;
  cutCy: number;
  fillCy: number;
  netCy: number;
  cutLooseCy: number;
  fillBankRequiredCy: number;
  adjustedNetCy: number;
  cutToFillRatio: number | null;
  cutSwellPercent: number;
  fillShrinkPercent: number;
  planAreaSf: number | null;
  planAreaAcres: number | null;
  lengthFt: number | null;
  sectionCount: number | null;
  cellsComputed: number | null;
  cellsSkipped: number | null;
  maxCutFt: number | null;
  maxFillFt: number | null;
  warnings: string[];
  computedAt: number;
}

export interface DirtVolumeComparisonRow extends DirtVolumeScenario {
  deltaCutCy: number;
  deltaFillCy: number;
  deltaNetCy: number;
  percentCutChange: number | null;
  percentFillChange: number | null;
}

export interface DirtVolumeComparison {
  baselineId: string;
  rows: DirtVolumeComparisonRow[];
  spreadNetCy: number;
  bestBalancedId: string;
}

let scenarios: DirtVolumeScenario[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* a broken subscriber must not block the rest */
    }
  }
}

export function subscribeDirtVolumeScenarios(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function scenarioId(): string {
  return `dv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function saveDirtVolumeResult(
  result: DirtVolumeSummary,
  name?: string,
  notes = '',
): DirtVolumeScenario {
  const scenario: DirtVolumeScenario = {
    id: scenarioId(),
    name: name?.trim() || `${result.methodLabel} ${new Date(result.computedAt).toLocaleString()}`,
    notes,
    method: result.method,
    methodLabel: result.methodLabel,
    calculationMethod: result.calculationMethod,
    cutCy: result.cutCy,
    fillCy: result.fillCy,
    netCy: result.netCy,
    cutLooseCy: result.cutLooseCy,
    fillBankRequiredCy: result.fillBankRequiredCy,
    adjustedNetCy: result.adjustedNetCy,
    cutToFillRatio: result.cutToFillRatio,
    cutSwellPercent: result.cutSwellPercent,
    fillShrinkPercent: result.fillShrinkPercent,
    planAreaSf: result.planAreaSf,
    planAreaAcres: result.planAreaAcres,
    lengthFt: result.lengthFt,
    sectionCount: result.sectionCount,
    cellsComputed: result.cellsComputed,
    cellsSkipped: result.cellsSkipped,
    maxCutFt: result.maxCutFt,
    maxFillFt: result.maxFillFt,
    warnings: [...result.warnings],
    computedAt: result.computedAt,
  };
  scenarios = [...scenarios, scenario];
  notify();
  return scenario;
}

export function listDirtVolumeScenarios(): DirtVolumeScenario[] {
  return [...scenarios];
}

export function getDirtVolumeScenario(id: string): DirtVolumeScenario | undefined {
  return scenarios.find((scenario) => scenario.id === id);
}

export function deleteDirtVolumeScenario(id: string): boolean {
  const before = scenarios.length;
  scenarios = scenarios.filter((scenario) => scenario.id !== id);
  if (scenarios.length === before) return false;
  notify();
  return true;
}

export function clearDirtVolumeScenarios(): void {
  if (scenarios.length === 0) return;
  scenarios = [];
  notify();
}

/**
 * Compare saved scenarios against a baseline (the first saved scenario unless
 * `baselineId` is supplied). Positive deltas mean the scenario has more cut or
 * fill than the baseline.
 */
export function compareDirtVolumeScenarios(
  ids?: string[],
  baselineId?: string,
): DirtVolumeComparison {
  const selected = ids?.length
    ? ids
        .map((id) => getDirtVolumeScenario(id))
        .filter((scenario): scenario is DirtVolumeScenario => Boolean(scenario))
    : listDirtVolumeScenarios();
  if (selected.length < 2) {
    throw new Error('At least two saved volume scenarios are required for a comparison.');
  }
  const baseline =
    (baselineId ? selected.find((scenario) => scenario.id === baselineId) : undefined) ??
    selected[0];
  const rows: DirtVolumeComparisonRow[] = selected.map((scenario) => ({
    ...scenario,
    deltaCutCy: scenario.cutCy - baseline.cutCy,
    deltaFillCy: scenario.fillCy - baseline.fillCy,
    deltaNetCy: scenario.adjustedNetCy - baseline.adjustedNetCy,
    percentCutChange: baseline.cutCy > 0 ? ((scenario.cutCy - baseline.cutCy) / baseline.cutCy) * 100 : null,
    percentFillChange: baseline.fillCy > 0 ? ((scenario.fillCy - baseline.fillCy) / baseline.fillCy) * 100 : null,
  }));
  const nets = rows.map((row) => row.adjustedNetCy);
  const bestBalanced = rows.reduce((best, row) =>
    Math.abs(row.adjustedNetCy) < Math.abs(best.adjustedNetCy) ? row : best,
  );
  return {
    baselineId: baseline.id,
    rows,
    spreadNetCy: Math.max(...nets) - Math.min(...nets),
    bestBalancedId: bestBalanced.id,
  };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const fmt = (value: number, digits = 2): string =>
  Number.isFinite(value)
    ? value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : '0';

export interface DirtVolumeReportInput {
  scenario?: DirtVolumeScenario | null;
  comparison?: DirtVolumeComparison | null;
  projectName?: string;
  location?: string;
  preparedBy?: string;
  notes?: string;
  generatedAt?: Date;
}

/** Copy-ready plain-text report for one scenario and optional comparison. */
export function formatDirtVolumeReport(input: DirtVolumeReportInput): string {
  const scenario = input.scenario ?? null;
  const comparison = input.comparison ?? null;
  if (!scenario && !comparison) {
    throw new Error('A volume scenario or comparison is required for the report.');
  }
  const generatedAt = input.generatedAt ?? new Date();
  const lines: string[] = [
    'DIRT VOLUME / EARTHWORK QUANTITY REPORT',
    '=======================================',
    '',
    `Project: ${input.projectName?.trim() || 'Not specified'}`,
    `Location: ${input.location?.trim() || 'Not specified'}`,
    `Prepared by: ${input.preparedBy?.trim() || 'Not specified'}`,
    `Generated: ${generatedAt.toLocaleString()}`,
    '',
  ];

  if (scenario) {
    lines.push(
      'VOLUME SCENARIO',
      '---------------',
      `Scenario: ${scenario.name}`,
      `Method: ${scenario.methodLabel}`,
      `Calculation: ${scenario.calculationMethod}`,
      `Computed: ${new Date(scenario.computedAt).toLocaleString()}`,
      '',
      'QUANTITIES',
      '----------',
      `Cut (bank): ${fmt(scenario.cutCy)} CY`,
      `Fill (compacted): ${fmt(scenario.fillCy)} CY`,
      `Raw net (cut - fill): ${fmt(scenario.netCy)} CY`,
      `Cut swell: ${fmt(scenario.cutSwellPercent, 1)}%`,
      `Fill shrink: ${fmt(scenario.fillShrinkPercent, 1)}%`,
      `Cut (loose): ${fmt(scenario.cutLooseCy)} CY`,
      `Fill (bank required): ${fmt(scenario.fillBankRequiredCy)} CY`,
      `Adjusted balance (positive = surplus): ${fmt(scenario.adjustedNetCy)} CY`,
      scenario.cutToFillRatio !== null ? `Cut-to-fill ratio: ${fmt(scenario.cutToFillRatio, 2)} : 1` : 'Cut-to-fill ratio: no fill',
    );
    if (scenario.planAreaAcres !== null) {
      lines.push(`Plan area: ${fmt(scenario.planAreaAcres, 3)} acres (${fmt(scenario.planAreaSf ?? 0, 0)} sq ft)`);
    }
    if (scenario.lengthFt !== null) lines.push(`Corridor length: ${fmt(scenario.lengthFt, 1)} ft`);
    if (scenario.sectionCount !== null) lines.push(`Cross sections: ${scenario.sectionCount}`);
    if (scenario.cellsComputed !== null) {
      lines.push(
        `Sampled cells: ${scenario.cellsComputed}${scenario.cellsSkipped ? ` (${scenario.cellsSkipped} skipped)` : ''}`,
      );
    }
    if (scenario.maxCutFt !== null || scenario.maxFillFt !== null) {
      lines.push(
        `Maximum cut / fill depth: ${scenario.maxCutFt !== null ? `${fmt(scenario.maxCutFt)} ft` : 'n/a'} / ` +
          `${scenario.maxFillFt !== null ? `${fmt(scenario.maxFillFt)} ft` : 'n/a'}`,
      );
    }
    if (scenario.notes.trim()) lines.push('', 'NOTES', '-----', scenario.notes.trim());
    if (scenario.warnings.length > 0) {
      lines.push('', 'WARNINGS', '--------', ...scenario.warnings.map((warning) => `- ${warning}`));
    }
    lines.push('');
  }

  if (comparison) {
    const baseline = comparison.rows.find((row) => row.id === comparison.baselineId);
    lines.push(
      'SCENARIO COMPARISON',
      '-------------------',
      `Baseline: ${baseline?.name ?? comparison.baselineId}`,
      '',
      'Name | Cut CY | Fill CY | Adj. Net CY | dCut CY | dFill CY | dNet CY',
    );
    for (const row of comparison.rows) {
      lines.push(
        `${row.name} | ${fmt(row.cutCy)} | ${fmt(row.fillCy)} | ${fmt(row.adjustedNetCy)} | ` +
          `${fmt(row.deltaCutCy)} | ${fmt(row.deltaFillCy)} | ${fmt(row.deltaNetCy)}`,
      );
    }
    const best = comparison.rows.find((row) => row.id === comparison.bestBalancedId);
    lines.push(
      '',
      `Net spread across scenarios: ${fmt(comparison.spreadNetCy)} CY`,
      `Best-balanced scenario: ${best?.name ?? comparison.bestBalancedId}`,
      '',
    );
  }

  if (input.notes?.trim()) lines.push('ADDITIONAL NOTES', '----------------', input.notes.trim(), '');
  lines.push(
    'METHOD NOTES',
    '------------',
    '- Quantities are reported in cubic yards (1 CY = 27 CF).',
    '- Cut is bank / in-place material; fill is compacted in-place material.',
    '- Cut swell and fill shrink are user-supplied factors applied only to the adjusted balance.',
    '- Average end area is exact for linear prisms; TIN and stockpile volumes sample a regular grid.',
    '',
    'DISCLAIMER',
    '----------',
    'This takeoff is for preliminary planning and quantity comparison. Verify section areas, surface models, ' +
      'shrinkswell factors, and the final quantities with a licensed professional before bidding, ' +
      'construction, or payment.',
  );
  return lines.join('\n');
}
