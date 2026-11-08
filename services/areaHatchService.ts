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
  scale: 10,
  angleDeg: 0,
  opacity: 0.35,
  color: '#22d3ee',
  showLabels: true,
};

export const DEFAULT_SOIL_HATCH: Required<AreaHatchSettings> = {
  style: 'lines',
  patternName: 'SOLID',
  // Retained so switching back to a line pattern keeps the fine site-scale
  // spacing; solid color fills ignore spacing and angle.
  scale: 10,
  angleDeg: 0,
  opacity: 0.3,
  color: '#d6b98c',
  showLabels: true,
};

function autoFloodPattern(area: MapAreaFeature): HatchDefinition {
  const subtype = String(area.attributes?.subtype ?? '').toUpperCase();
  if (subtype.includes('FLOODWAY')) return getHatchForFemaZone('FLOODWAY');
  const zone = String(area.attributes?.zone ?? 'AE').toUpperCase();
  return getHatchForFemaZone(zone);
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

  // Soils default to solid fills. AUTO is treated as solid too so sessions
  // saved with the old automatic line patterns migrate on their next rebuild.
  return getHatchByName('SOLID') ?? ALL_BUILT_IN_HATCHES[0];
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

interface HslColor {
  h: number;
  s: number;
  l: number;
}

function hexToHsl(hex: string | undefined): HslColor {
  const normalized = (hex ?? '').trim().replace(/^#/, '');
  const expanded = normalized.length === 3
    ? normalized.split('').map(char => char + char).join('')
    : normalized;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) return { h: 36, s: 0.46, l: 0.69 };

  const r = parseInt(expanded.slice(0, 2), 16) / 255;
  const g = parseInt(expanded.slice(2, 4), 16) / 255;
  const b = parseInt(expanded.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;
  if (delta < 1e-6) return { h: 36, s: 0, l };

  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;

  return {
    h,
    s: Math.min(1, delta / Math.max(1e-6, 1 - Math.abs(2 * l - 1))),
    l,
  };
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const saturation = Math.max(0, Math.min(1, s));
  const lightness = Math.max(0, Math.min(1, l));
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - chroma / 2;

  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [chroma, x, 0];
  else if (hue < 120) [r, g, b] = [x, chroma, 0];
  else if (hue < 180) [r, g, b] = [0, chroma, x];
  else if (hue < 240) [r, g, b] = [0, x, chroma];
  else if (hue < 300) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];

  const channel = (value: number) => Math.round(
    Math.max(0, Math.min(1, value + m)) * 255,
  ).toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/**
 * Categorical soil colors use a golden-angle hue wheel seeded by the control's
 * base color. Successive map units land ~137.5° apart, which distributes
 * categories evenly without knowing how many will be fetched, while a muted
 * saturation/lightness band keeps labels readable over aerial imagery.
 */
function soilColorForIndex(index: number, baseColor: string | undefined): string {
  const base = hexToHsl(baseColor);
  const hue = (base.s < 0.04 ? 36 : base.h) + index * 137.508;
  const saturation = Math.min(0.46, Math.max(0.34, base.s));
  const lightness = Math.min(0.70, Math.max(0.60, base.l)) + (index % 2 === 0 ? 0 : 0.025);
  return hslToHex(hue, saturation, lightness);
}

function soilMapUnitKey(area: MapAreaFeature): string {
  const mukey = String(area.attributes?.mukey ?? '').trim();
  if (mukey) return `mukey:${mukey}`;
  const musym = String(area.attributes?.musym ?? '').trim();
  if (musym) return `musym:${musym}`;
  return `area:${area.id}`;
}

function buildSoilColorMap(
  areas: MapAreaFeature[],
  baseColor: string | undefined,
): Map<string, string> {
  const keys = Array.from(new Set(areas.map(soilMapUnitKey))).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const colors = new Map<string, string>();
  keys.forEach((key, index) => colors.set(key, soilColorForIndex(index, baseColor)));
  return colors;
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
  const soilColors = kind === 'soils'
    ? buildSoilColorMap(areas, settings.color)
    : null;

  const hatches: CanvasHatch[] = [];
  for (const area of areas) {
    if (!area.loops || area.loops.length === 0) continue;
    const pattern = resolveAreaPattern(area, settings, kind, report);
    if (!pattern) continue;
    const fallbackColor = settings.color || pattern.previewColor || (kind === 'flood' ? '#22d3ee' : '#d6b98c');
    const color = pattern.name === 'SOLID'
      ? soilColors?.get(soilMapUnitKey(area)) ?? fallbackColor
      : fallbackColor;
    hatches.push({
      id: `${area.source}-hatch-${area.id}`,
      name: area.labelLines[0] || pattern.name,
      patternName: pattern.name,
      loops: area.loops,
      scale: hatchScaleForSpacing(pattern, settings.scale),
      angleDeg: settings.angleDeg ?? 0,
      color,
      opacity: settings.opacity,
      layer: area.layer,
      generationId: area.generationId,
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
      generationId: area.generationId,
    }))
    .filter(label => label.lines.length > 0);
}
