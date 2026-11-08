/**
 * areaHatchService — turn GIS area features into editable canvas hatches and
 * centroid annotations.
 *
 * Flood and soils fetches used to stop at dashed SurveyLine rings. This builder
 * creates first-class CanvasHatch entities (editable in Hatch Manager and
 * exported to DXF) plus MapAreaLabel annotations for the same polygons.
 */

import type {
  AreaHatchSettings,
  CanvasHatch,
  MapAreaFeature,
  MapAreaLabel,
} from '../types.ts';
import {
  ALL_BUILT_IN_HATCHES,
  getHatchByName,
  getHatchForFemaZone,
  type HatchDefinition,
} from './hatchLibrary.ts';
import { wrapAreaLabelText } from '../utils/areaGeometry.ts';

export type AreaHatchKind = 'flood' | 'soils';

export interface SoilReportLookup {
  [mukey: string]: {
    hydgrpdcd?: string;
    drclassdcd?: string;
    taxclname?: string;
    farmlndcl?: string;
  };
}

export const DEFAULT_FLOOD_HATCH: Required<AreaHatchSettings> = {
  style: 'lines',
  patternName: 'AUTO',
  scale: 50,
  angleDeg: 0,
  opacity: 0.35,
  color: '#22d3ee',
  showLabels: true,
};

export const DEFAULT_SOIL_HATCH: Required<AreaHatchSettings> = {
  style: 'lines',
  patternName: 'AUTO',
  // Feet between hatch lines. Soil sheets are reviewed at site scale, so the
  // old 100-ft default read as a few giant stripes rather than soil texture.
  scale: 25,
  angleDeg: 0,
  opacity: 0.3,
  color: '#d6b98c',
  showLabels: true,
};

function fallbackPattern(): HatchDefinition {
  return getHatchByName('EARTH') ?? ALL_BUILT_IN_HATCHES[0];
}

function autoFloodPattern(area: MapAreaFeature): HatchDefinition {
  const subtype = String(area.attributes?.subtype ?? '').toUpperCase();
  if (subtype.includes('FLOODWAY')) return getHatchForFemaZone('FLOODWAY');
  const zone = String(area.attributes?.zone ?? 'AE').toUpperCase();
  return getHatchForFemaZone(zone);
}

function autoSoilPattern(area: MapAreaFeature, report?: SoilReportLookup | null): HatchDefinition {
  const mukey = String(area.attributes?.mukey ?? '');
  const hydGroup = report?.[mukey]?.hydgrpdcd?.toUpperCase()
    ?? String(area.attributes?.hydgrpdcd ?? '').toUpperCase();
  if (hydGroup === 'A') return getHatchByName('SAND') ?? fallbackPattern();
  if (hydGroup === 'B') return getHatchByName('GRAVEL') ?? fallbackPattern();
  if (hydGroup === 'C') return getHatchByName('EARTH') ?? fallbackPattern();
  if (hydGroup === 'D') return getHatchByName('MUDST') ?? fallbackPattern();

  const name = `${area.attributes?.muname ?? ''} ${area.attributes?.musym ?? ''}`.toLowerCase();
  if (/(sand|sandy)/.test(name)) return getHatchByName('SAND') ?? fallbackPattern();
  if (/(gravel|gravelly|shingle|stone)/.test(name)) return getHatchByName('GRAVEL') ?? fallbackPattern();
  if (/(clay|clayey|shrink)/.test(name)) return getHatchByName('MUDST') ?? fallbackPattern();
  if (/(muck|peat|marsh|wetland|swamp)/.test(name)) return getHatchByName('SWAMP') ?? fallbackPattern();
  return getHatchByName('EARTH') ?? fallbackPattern();
}

export function resolveAreaPattern(
  area: MapAreaFeature,
  rawSettings: Partial<AreaHatchSettings> | null | undefined,
  kind: AreaHatchKind,
  report?: SoilReportLookup | null,
): HatchDefinition | null {
  const settings = {
    ...(kind === 'flood' ? DEFAULT_FLOOD_HATCH : DEFAULT_SOIL_HATCH),
    ...(rawSettings ?? {}),
  };
  if (settings.patternName === 'none' || settings.style === 'none') return null;

  if (settings.patternName && settings.patternName !== 'AUTO') {
    const explicit = getHatchByName(settings.patternName);
    if (explicit) return explicit;
  }

  if (kind === 'flood') {
    if (settings.style === 'cross') return getHatchByName('CROSS') ?? autoFloodPattern(area);
    if (settings.style === 'dots') return getHatchByName('DOTS') ?? autoFloodPattern(area);
    if (settings.style === 'chevron') return autoFloodPattern(area);
    return autoFloodPattern(area);
  }

  return autoSoilPattern(area, report);
}

/**
 * Convert desired world spacing (feet) into the CanvasHatch scale multiplier.
 * createCanvasHatchPattern uses 16 drawing units per pattern unit at scale 1,
 * so spacing = patternDelta × 16 × scale.
 */
export function hatchScaleForSpacing(pattern: HatchDefinition, spacingFt: number): number {
  const deltas = pattern.lines
    .map(line => Math.max(Math.abs(line.deltaY), Math.abs(line.deltaX)))
    .filter(value => Number.isFinite(value) && value > 0);
  const delta = deltas.length > 0 ? Math.min(...deltas) : 0.125;
  const spacing = Number.isFinite(spacingFt) && spacingFt > 0 ? spacingFt : 50;
  return Math.max(0.05, Math.min(500, spacing / (delta * 16)));
}

export function buildAreaHatches(
  areas: MapAreaFeature[],
  rawSettings: Partial<AreaHatchSettings> | null | undefined,
  kind: AreaHatchKind,
  report?: SoilReportLookup | null,
): CanvasHatch[] {
  const settings = {
    ...(kind === 'flood' ? DEFAULT_FLOOD_HATCH : DEFAULT_SOIL_HATCH),
    ...(rawSettings ?? {}),
  };
  const createdAt = new Date().toISOString();

  const hatches: CanvasHatch[] = [];
  for (const area of areas) {
    if (!area.loops || area.loops.length === 0) continue;
    const pattern = resolveAreaPattern(area, settings, kind, report);
    if (!pattern) continue;
    hatches.push({
      id: `${area.source}-hatch-${area.id}`,
      name: area.labelLines[0] || pattern.name,
      patternName: pattern.name,
      loops: area.loops,
      scale: hatchScaleForSpacing(pattern, settings.scale),
      angleDeg: settings.angleDeg ?? 0,
      color: settings.color || pattern.previewColor || (kind === 'flood' ? '#22d3ee' : '#d6b98c'),
      opacity: settings.opacity,
      layer: area.layer,
      areaSqFt: area.areaSqFt,
      sourceMode: 'agent',
      createdAt,
    });
  }
  return hatches;
}

function soilLabelLines(
  area: MapAreaFeature,
  report?: SoilReportLookup | null,
): string[] {
  const mukey = String(area.attributes?.mukey ?? '');
  const musym = String(area.attributes?.musym ?? 'SOIL').toUpperCase();
  const muname = String(area.attributes?.muname ?? '').trim();
  const hydGroup = report?.[mukey]?.hydgrpdcd?.toUpperCase()
    ?? String(area.attributes?.hydgrpdcd ?? '').toUpperCase();

  const lines = [`SOIL ${musym}`];
  lines.push(...wrapAreaLabelText(muname, 34, 2));
  if (hydGroup) lines.push(`HSG ${hydGroup}`);
  return lines.filter(Boolean);
}

export function buildAreaLabels(
  areas: MapAreaFeature[],
  rawSettings: Partial<AreaHatchSettings> | null | undefined,
  kind: AreaHatchKind,
  report?: SoilReportLookup | null,
): MapAreaLabel[] {
  const settings = {
    ...(kind === 'flood' ? DEFAULT_FLOOD_HATCH : DEFAULT_SOIL_HATCH),
    ...(rawSettings ?? {}),
  };
  if (settings.showLabels === false) return [];

  return areas
    .filter(area => area.loops.length > 0)
    .map(area => ({
      id: `${area.source}-label-${area.id}`,
      x: area.centroid.x,
      y: area.centroid.y,
      angle: 0,
      lines: kind === 'flood' ? area.labelLines : soilLabelLines(area, report),
      category: kind === 'flood' ? 'flood-zones' : 'soil-map-units',
      source: area.source,
    }))
    .filter(label => label.lines.length > 0);
}
