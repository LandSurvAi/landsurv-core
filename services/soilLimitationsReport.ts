/**
 * soilLimitationsReport — compile a Pennsylvania E&S soil-limitations report.
 *
 * Inputs are the SSURGO map-unit polygons already on the canvas plus the
 * tabular SDA attributes (dominant component, HSG, drainage, hydric rating,
 * depth to water table / bedrock) and the PA E&S Manual Table E.1 chart.
 *
 * Areas are clipped against the active inclusion boundary when one exists.
 * Without a boundary the report still runs over the project AOI and carries an
 * advisory inviting the user to draw a boundary for exact area limits.
 */

import type {
  BoundaryFile,
  HatchBoundaryLoop,
  MapAreaFeature,
  SoilMapUnit,
  SurveyLine,
  SurveyPoint,
} from '../types.ts';
import { areaSquareUnits } from '../utils/areaGeometry.ts';
import { extractBoundaryFileLoop } from '../utils/hatchBoundaryTracer.ts';
import type { SoilReportRow } from './femaReportPdf.ts';
import {
  SOIL_LIMITATION_RESOLUTIONS,
  matchSoilSeries,
  normalizeSoilName,
  type SoilLimitationColumn,
  type SoilLimitationKey,
  type SoilLimitationsChart,
} from './soilLimitationsService.ts';
import * as polygonClippingModule from 'polygon-clipping';

// The package's ESM bundle exposes its API as the default export while the
// published type declaration lists named functions. Normalize both shapes once.
type PolygonClippingApi = {
  intersection: (subject: unknown, clip: unknown) => number[][][][];
};
const polygonClippingApi: PolygonClippingApi = (
  (polygonClippingModule as unknown as { default?: PolygonClippingApi }).default
  ?? (polygonClippingModule as unknown as PolygonClippingApi)
);

const SQFT_PER_ACRE = 43_560;
const CLOSE_TOLERANCE = 0.05;

export interface SoilLimitationFinding {
  key: SoilLimitationKey;
  label: string;
  /** Raw Table E.1 mark: X, C, S, or C/S. */
  value: string;
  /** Expanded corrosion qualifier, when applicable. */
  valueLabel: string;
}

export interface SoilLimitationsUnit {
  mukey: string;
  musym: string;
  muname: string;
  seriesName: string;
  matched: boolean;
  matchMethod: 'component' | 'map-unit' | 'partial' | 'none';
  sqft: number;
  acres: number;
  percent: number;
  hydrologicGroup?: string;
  drainageClass?: string;
  hydric?: string;
  depthToWaterTableIn?: number | null;
  depthToBedrockIn?: number | null;
  limitations: SoilLimitationFinding[];
  resolutions: string[];
}

export interface SoilLimitationsReport {
  state: 'PA';
  generatedAt: string;
  projectName?: string;
  boundaryName?: string | null;
  boundaryPresent: boolean;
  /** Which AOI produced the report: an inclusion polygon or a deed boundary. */
  boundaryKind: 'inclusion' | 'boundary' | null;
  areaLabel: string;
  boundaryAcres: number;
  soilAcres: number;
  units: SoilLimitationsUnit[];
  unmatched: string[];
  chartSource: string;
  chartCached: boolean;
  chartCacheSource?: string;
  limitationsCatalog: SoilLimitationColumn[];
  notes: string[];
  boundaryAdvisory?: string;
}

function toRing(loop: HatchBoundaryLoop): number[][] {
  return loop.vertices.map(vertex => [vertex.x, vertex.y]);
}

function loopsToPolygon(loops: HatchBoundaryLoop[]): number[][][] {
  const outer = loops.filter(loop => !loop.isHole);
  const holes = loops.filter(loop => loop.isHole);
  if (outer.length === 0) return [];
  if (outer.length === 1) return [toRing(outer[0]), ...holes.map(toRing)];
  // Separate outer rings are independent polygons; callers that need all of
  // them should pass a multipolygon, which `multiPolygonForLoops` provides.
  return [toRing(outer[0]), ...holes.map(toRing)];
}

function multiPolygonForLoops(loops: HatchBoundaryLoop[]): number[][][][] {
  const outer = loops.filter(loop => !loop.isHole);
  const holes = loops.filter(loop => loop.isHole);
  if (outer.length <= 1) {
    const polygon = loopsToPolygon(loops);
    return polygon.length > 0 ? [polygon] : [];
  }
  return outer.map(ring => [toRing(ring), ...holes.map(toRing)]);
}

function ringArea(ring: number[][]): number {
  if (ring.length < 3) return 0;
  let sum = 0;
  for (let index = 0; index < ring.length; index++) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[(index + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

function multiPolygonArea(polygons: number[][][][]): number {
  let total = 0;
  for (const polygon of polygons) {
    if (!polygon.length) continue;
    const outer = Math.abs(ringArea(polygon[0]));
    const holes = polygon.slice(1).reduce((sum, ring) => sum + Math.abs(ringArea(ring)), 0);
    total += Math.max(0, outer - holes);
  }
  return total;
}

function pointsCoincide(
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= CLOSE_TOLERANCE;
}

/** Stitch inclusion line segments into closed boundary loops. */
export function buildInclusionBoundaryLoops(
  lines: SurveyLine[],
  points: SurveyPoint[],
  polylineId?: string | null,
): HatchBoundaryLoop[] {
  const pointMap = new Map(points.map(point => [point.pointNumber, point]));
  const segments: Array<{
    a: { x: number; y: number };
    b: { x: number; y: number };
  }> = [];

  for (const line of lines) {
    if (line.type !== 'inclusion') continue;
    if (polylineId && line.polylineId !== polylineId) continue;
    const pointA = line.fromPt
      ? { x: line.fromPt.x, y: line.fromPt.y }
      : pointMap.has(line.from)
        ? { x: pointMap.get(line.from)!.easting, y: pointMap.get(line.from)!.northing }
        : null;
    const pointB = line.toPt
      ? { x: line.toPt.x, y: line.toPt.y }
      : pointMap.has(line.to)
        ? { x: pointMap.get(line.to)!.easting, y: pointMap.get(line.to)!.northing }
        : null;
    if (pointA && pointB && Number.isFinite(pointA.x) && Number.isFinite(pointA.y)
      && Number.isFinite(pointB.x) && Number.isFinite(pointB.y)) {
      segments.push({ a: pointA, b: pointB });
    }
  }

  const used = new Set<number>();
  const loops: HatchBoundaryLoop[] = [];
  for (let start = 0; start < segments.length; start++) {
    if (used.has(start)) continue;
    const first = segments[start];
    used.add(start);
    const vertices = [first.a, first.b];

    for (let guard = 0; guard < segments.length + 2; guard++) {
      const tail = vertices[vertices.length - 1];
      if (vertices.length >= 3 && pointsCoincide(tail, vertices[0])) {
        vertices.pop();
        break;
      }
      let nextIndex = -1;
      let nextPoint: { x: number; y: number } | null = null;
      for (let index = 0; index < segments.length; index++) {
        if (used.has(index)) continue;
        const segment = segments[index];
        if (pointsCoincide(segment.a, tail)) {
          nextIndex = index;
          nextPoint = segment.b;
          break;
        }
        if (pointsCoincide(segment.b, tail)) {
          nextIndex = index;
          nextPoint = segment.a;
          break;
        }
      }
      if (nextIndex < 0 || !nextPoint) break;
      used.add(nextIndex);
      vertices.push(nextPoint);
    }

    if (vertices.length >= 3) loops.push({ vertices });
  }
  return loops;
}

/**
 * Build AOI loops from deed boundary files. The active file wins; otherwise
 * every visible file contributes its parcel so multi-tract jobs still clip.
 */
export function buildBoundaryFileLoops(
  boundaryFiles: BoundaryFile[],
  points: SurveyPoint[],
  preferredId?: string | null,
): { loops: HatchBoundaryLoop[]; name: string | null } {
  if (boundaryFiles.length === 0) return { loops: [], name: null };
  const pointMap = new Map(points.map(point => [point.pointNumber, point]));

  const toLoop = (file: BoundaryFile): HatchBoundaryLoop | null => {
    if (file.hidden || !file.calls || file.calls.length < 3) return null;
    const vertices = extractBoundaryFileLoop(file, pointMap);
    if (!vertices || vertices.length < 3) return null;
    return { vertices: vertices.map(vertex => ({ x: vertex.x, y: vertex.y })) };
  };

  const preferred = preferredId
    ? boundaryFiles.find(file => file.id === preferredId)
    : undefined;
  if (preferred) {
    const loop = toLoop(preferred);
    return loop
      ? { loops: [loop], name: preferred.name }
      : { loops: [], name: null };
  }

  const loops: HatchBoundaryLoop[] = [];
  const names: string[] = [];
  for (const file of boundaryFiles) {
    const loop = toLoop(file);
    if (!loop) continue;
    loops.push(loop);
    names.push(file.name);
  }
  return {
    loops,
    name: names.length === 1 ? names[0] : null,
  };
}

function areaWithinBoundary(
  area: MapAreaFeature,
  boundaryLoops: HatchBoundaryLoop[],
): number {
  const wholeArea = area.areaSqFt ?? areaSquareUnits(area.loops);
  if (boundaryLoops.length === 0) return wholeArea;

  const subject = multiPolygonForLoops(area.loops);
  const clip = multiPolygonForLoops(boundaryLoops);
  if (subject.length === 0 || clip.length === 0) return 0;
  try {
    const clipped = polygonClippingApi.intersection(subject, clip);
    return multiPolygonArea(clipped);
  } catch {
    // A self-intersecting boundary should not kill the report; fall back to the
    // whole SSURGO polygon and let the report flag the boundary.
    return wholeArea;
  }
}

export function boundaryAreaAcres(loops: HatchBoundaryLoop[]): number {
  if (loops.length === 0) return 0;
  return areaSquareUnits(loops) / SQFT_PER_ACRE;
}

function depthLabel(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return `${Number(value).toFixed(0)}"`;
}

function formatAcres(value: number): string {
  if (!Number.isFinite(value)) return '0.00';
  if (value > 0 && value < 0.01) return '<0.01';
  return value.toFixed(2);
}

export function buildSoilLimitationsReport(input: {
  areas: MapAreaFeature[];
  mapUnits: SoilMapUnit[];
  reportData?: Record<string, SoilReportRow> | null;
  chart: SoilLimitationsChart;
  boundaryLoops?: HatchBoundaryLoop[];
  boundaryName?: string | null;
  boundaryKind?: 'inclusion' | 'boundary' | null;
  projectName?: string;
  generatedAt?: Date;
}): SoilLimitationsReport {
  const boundaryLoops = input.boundaryLoops ?? [];
  const boundaryPresent = boundaryLoops.length > 0;
  const resolvedBoundaryKind: 'inclusion' | 'boundary' | null = boundaryPresent
    ? (input.boundaryKind ?? 'inclusion')
    : null;
  const boundaryAcres = boundaryAreaAcres(boundaryLoops);

  const groups = new Map<string, {
    mukey: string;
    musym: string;
    muname: string;
    sqft: number;
  }>();

  if (input.areas.length > 0) {
    for (const area of input.areas) {
      const attributes = area.attributes ?? {};
      const mukey = String(attributes.mukey ?? '');
      const musym = String(attributes.musym ?? '');
      const muname = String(attributes.muname ?? '');
      const key = mukey || musym || area.layer;
      const existing = groups.get(key);
      const sqft = areaWithinBoundary(area, boundaryLoops);
      if (existing) {
        existing.sqft += sqft;
      } else {
        groups.set(key, { mukey, musym, muname, sqft });
      }
    }
  } else {
    // Fallback for callers that have tabular map units but no polygon geometry.
    for (const unit of input.mapUnits) {
      groups.set(unit.mukey || unit.musym, {
        mukey: unit.mukey,
        musym: unit.musym,
        muname: unit.muname,
        sqft: 0,
      });
    }
  }

  const unitByKey = new Map<string, SoilMapUnit>();
  for (const unit of input.mapUnits) {
    if (unit.mukey) unitByKey.set(unit.mukey, unit);
    if (unit.musym) unitByKey.set(unit.musym, unit);
  }

  const totalSoilSqft = Array.from(groups.values()).reduce((sum, group) => sum + group.sqft, 0);
  const denominatorAcres = boundaryPresent ? boundaryAcres : totalSoilSqft / SQFT_PER_ACRE;

  const units: SoilLimitationsUnit[] = [];
  for (const group of groups.values()) {
    const mapUnit = unitByKey.get(group.mukey) ?? unitByKey.get(group.musym);
    const report = group.mukey ? input.reportData?.[group.mukey] : undefined;
    const muname = group.muname || mapUnit?.muname || '';
    const match = matchSoilSeries(input.chart, muname, report?.compname);

    const limitations: SoilLimitationFinding[] = [];
    for (const column of input.chart.limitations) {
      const value = match.record.limitations[column.key];
      if (!value) continue;
      let valueLabel = '';
      if (column.key === 'corrosive_concrete_uncoated_steel') {
        switch (value.toUpperCase()) {
          case 'C':
            valueLabel = 'Concrete only';
            break;
          case 'S':
            valueLabel = 'Uncoated steel only';
            break;
          case 'C/S':
            valueLabel = 'Concrete and uncoated steel';
            break;
          default:
            valueLabel = 'Concrete and uncoated steel';
            break;
        }
      }
      limitations.push({
        key: column.key,
        label: column.label,
        value,
        valueLabel,
      });
    }

    const resolutions: string[] = [];
    for (const finding of limitations) {
      const resolution = SOIL_LIMITATION_RESOLUTIONS[finding.key];
      if (resolution && !resolutions.includes(resolution)) resolutions.push(resolution);
    }

    const acres = group.sqft / SQFT_PER_ACRE;
    units.push({
      mukey: group.mukey,
      musym: group.musym || mapUnit?.musym || '',
      muname,
      seriesName: match.record.name,
      matched: match.method !== 'none',
      matchMethod: match.method,
      sqft: group.sqft,
      acres,
      percent: denominatorAcres > 0 ? (acres / denominatorAcres) * 100 : 0,
      hydrologicGroup: report?.hydgrpdcd || mapUnit?.hydgrpdcd,
      drainageClass: report?.drclassdcd || mapUnit?.drclassdcd,
      hydric: report?.hydricrating,
      depthToWaterTableIn: report?.wtdepannmin ?? null,
      depthToBedrockIn: report?.brockdepmin ?? null,
      limitations,
      resolutions,
    });
  }

  // A fetched SSURGO polygon may lie entirely outside the inclusion boundary;
  // do not report those as 0-acre soil units.
  const visibleUnits = boundaryPresent ? units.filter(unit => unit.sqft > 0.01) : units;
  visibleUnits.sort((a, b) => b.acres - a.acres || a.musym.localeCompare(b.musym));
  const unmatched = visibleUnits
    .filter(unit => !unit.matched)
    .map(unit => unit.muname || unit.musym || unit.mukey);
  const soilAcres = visibleUnits.reduce((sum, unit) => sum + unit.acres, 0);
  const areaLabel = boundaryPresent
    ? `${resolvedBoundaryKind === 'boundary' ? 'Boundary' : 'Inclusion boundary'}${input.boundaryName ? ` "${input.boundaryName}"` : ''}`
    : 'Project AOI (no inclusion boundary)';

  return {
    state: 'PA',
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    projectName: input.projectName,
    boundaryName: input.boundaryName ?? null,
    boundaryPresent,
    boundaryKind: resolvedBoundaryKind,
    areaLabel,
    boundaryAcres,
    soilAcres,
    units: visibleUnits,
    unmatched,
    chartSource: input.chart.source,
    chartCached: input.chart.cached === true,
    chartCacheSource: input.chart.cacheSource,
    limitationsCatalog: input.chart.limitations,
    notes: input.chart.notes ?? [],
    boundaryAdvisory: boundaryPresent
      ? undefined
      : 'No inclusion boundary or deed boundary is present. Areas are reported for the project AOI; draw a boundary for exact within-AOI areas.',
  };
}

export function soilDepthSummary(unit: SoilLimitationsUnit): string {
  return `Depth to seasonal HWT: ${depthLabel(unit.depthToWaterTableIn)} · Depth to bedrock: ${depthLabel(unit.depthToBedrockIn)}`;
}

/**
 * Compact drawing-style text for a paper-space notes block. The limitation
 * labels and resolution wording are preserved; only the layout is compressed.
 */
export function buildSoilLimitationsSheetNotes(report: SoilLimitationsReport): string {
  const sections: string[] = [];
  for (const unit of report.units) {
    // Defensive: a stale report may still carry a unit the AOI clip zeroed out.
    if (report.boundaryPresent && !(unit.sqft > 0.01)) continue;
    const heading = `${unit.musym || '—'} — ${(unit.muname || unit.seriesName || 'SOIL').toUpperCase()}`;
    const limitations = unit.limitations.length > 0
      ? unit.limitations
        .map(item => `${item.label.toUpperCase()}${item.valueLabel ? ` (${item.valueLabel.toUpperCase()})` : ''}`)
        .join('; ')
      : 'NONE MARKED IN TABLE E.1';
    const resolutions = unit.resolutions.length > 0
      ? unit.resolutions.map((resolution, index) => `${index + 1}. ${resolution}`).join(' ')
      : 'NONE LISTED';
    sections.push(`${heading}\nLIMITATIONS: ${limitations}.\nRESOLUTIONS: ${resolutions}`);
  }
  return sections.join('\n\n');
}

export function formatSoilLimitationsMarkdown(report: SoilLimitationsReport): string {
  const lines: string[] = [];
  lines.push('## PA E&S Soil Limitations Report');
  lines.push(`**Area:** ${report.areaLabel}`);
  lines.push(`**Generated:** ${new Date(report.generatedAt).toLocaleString()}`);
  lines.push(`**Source:** ${report.chartSource} — Table E.1${report.chartCached ? ' (cached)' : ''}`);
  if (report.boundaryAdvisory) {
    lines.push('');
    lines.push(`> **No boundary:** ${report.boundaryAdvisory}`);
  }
  lines.push('');
  lines.push('| Symbol | Map unit | Acres | % of area |');
  lines.push('|---|---|---:|---:|');
  for (const unit of report.units) {
    lines.push(`| ${unit.musym || '—'} | ${unit.muname || unit.seriesName} | ${formatAcres(unit.acres)} | ${unit.percent.toFixed(1)}% |`);
  }
  lines.push(`| | **Total** | **${formatAcres(report.soilAcres)}** | **100%** |`);

  for (const unit of report.units) {
    lines.push('');
    lines.push(`### ${unit.musym} — ${unit.muname || unit.seriesName}`);
    if (unit.seriesName && normalizeSoilName(unit.seriesName) !== normalizeSoilName(unit.muname)) {
      lines.push(`Table E.1 series: **${unit.seriesName}**${unit.matched ? '' : ' (no Table E.1 row found)'}`);
    }
    lines.push(`- **Area:** ${formatAcres(unit.acres)} ac (${unit.percent.toFixed(1)}% of ${report.areaLabel})`);
    lines.push(`- **HSG:** ${unit.hydrologicGroup || '—'} · **Drainage:** ${unit.drainageClass || '—'} · **Hydric:** ${unit.hydric || '—'}`);
    lines.push(`- ${soilDepthSummary(unit)}`);
    if (unit.limitations.length === 0) {
      lines.push('- **Limitations:** none marked in Table E.1 (absence of an X does not mean no potential limitation).');
      continue;
    }
    lines.push(`- **Limitations:** ${unit.limitations.map(item => item.label + (item.valueLabel ? ` (${item.valueLabel})` : '')).join('; ')}`);
    lines.push('- **Resolutions:**');
    unit.resolutions.forEach((resolution, index) => {
      lines.push(`  ${index + 1}. ${resolution}`);
    });
  }

  if (report.unmatched.length > 0) {
    lines.push('');
    lines.push(`> **Unmatched map units:** ${report.unmatched.join(', ')}. Verify the series name against Appendix E before relying on the limitation list.`);
  }
  if (report.notes.length > 0) {
    lines.push('');
    lines.push(...report.notes.map(note => `_${note}_`));
  }
  return lines.join('\n');
}
