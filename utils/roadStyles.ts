/**
 * Canonical road line styling.
 *
 * Road centerlines are always C-ROAD-CNTR and DASHED. The old take used
 * `lineType: 'CENTERLINE'`, which is a DXF-import linetype name but is not in
 * the project CAD linetype standard, so `getLinetypePattern` fell back to a
 * solid stroke. Different drafting paths produced different centerline styles
 * for that reason; every road path now runs through this helper.
 */

import type { SurveyLine } from '../types.ts';
import { groupRoadFeatures } from './roadTakeReview.ts';

export const ROAD_CENTERLINE_LAYER = 'C-ROAD-CNTR';
export const ROAD_CENTERLINE_LINETYPE = 'DASHED';

export const isRoadCenterlineLayer = (layer?: string): boolean =>
  (layer ?? '').trim().toUpperCase() === ROAD_CENTERLINE_LAYER;

export const isRoadCenterlineLine = (line: Pick<SurveyLine, 'layer'>): boolean =>
  isRoadCenterlineLayer(line.layer);

/**
 * A line drawn through DYL/DBL or WL/SWL shots is paint, even when the model
 * put it on a generic or construction-centerline layer. Promote it to the
 * paint layer before the baseline stripper and the road reviewer run.
 */
export const roadPaintLayerForDescriptor = (
  descriptor: string,
  currentLayer?: string,
): 'L-ROAD-PAINT-Y' | 'L-ROAD-PAINT-W' | null => {
  if (/\b(?:DYL|DBL)\b|DOUBLE\s+YELLOW/i.test(descriptor)) {
    return /^L-ROAD-PAINT-Y$/i.test((currentLayer ?? '').trim()) ? null : 'L-ROAD-PAINT-Y';
  }
  if (/\b(?:SWL|WL)\b|SINGLE\s+WHITE/i.test(descriptor)) {
    return /^L-ROAD-PAINT-W$/i.test((currentLayer ?? '').trim()) ? null : 'L-ROAD-PAINT-W';
  }
  return null;
};

/** Center-to-center separation of the two DYL bands: 8 inches each side. */
export const DYL_BAND_SEPARATION_FT = (8 * 2) / 12;

const DYL_HALF_SEPARATION_FT = DYL_BAND_SEPARATION_FT / 2;

export interface DoubleYellowCompletion<T extends SurveyLine> {
  lines: T[];
  changed: boolean;
  /** Number of single yellow runs that were expanded into two bands. */
  completedRuns: number;
}

function distanceToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function polylineLengthFt(vertices: Array<{ easting: number; northing: number }>): number {
  let total = 0;
  for (let i = 0; i < vertices.length - 1; i++) {
    total += Math.hypot(vertices[i + 1].easting - vertices[i].easting, vertices[i + 1].northing - vertices[i].northing);
  }
  return total;
}

function meanDistanceToVertices(
  vertices: Array<{ easting: number; northing: number }>,
  other: Array<{ easting: number; northing: number }>,
): number {
  if (vertices.length === 0 || other.length < 2) return Infinity;
  let total = 0;
  for (const vertex of vertices) {
    let best = Infinity;
    for (let i = 0; i < other.length - 1; i++) {
      const d = distanceToSegment(
        { x: vertex.easting, y: vertex.northing },
        { x: other[i].easting, y: other[i].northing },
        { x: other[i + 1].easting, y: other[i + 1].northing },
      );
      if (d < best) best = d;
    }
    total += best;
  }
  return total / vertices.length;
}

function offsetVertices(
  vertices: Array<{ easting: number; northing: number }>,
  offsetFt: number,
): Array<{ easting: number; northing: number }> {
  return vertices.map((vertex, index) => {
    const prev = vertices[Math.max(0, index - 1)];
    const next = vertices[Math.min(vertices.length - 1, index + 1)];
    const dx = next.easting - prev.easting;
    const dy = next.northing - prev.northing;
    const length = Math.hypot(dx, dy) || 1;
    return {
      easting: vertex.easting - (dy / length) * offsetFt,
      northing: vertex.northing + (dx / length) * offsetFt,
    };
  });
}

/**
 * DYL is two yellow bands, not one yellow centerline. If a take contains a
 * single yellow run (for example the model chained DYL shots as one line),
 * complete it into two bands 16 inches apart. An existing yellow pair — the
 * normal road_paint output — is left untouched.
 */
export function ensureDoubleYellowBands<T extends SurveyLine>(
  lines: T[],
): DoubleYellowCompletion<T> {
  const yellow = groupRoadFeatures(lines).filter(feature =>
    feature.role === 'paint' && /PAINT-Y/i.test(feature.layer ?? ''),
  );
  if (yellow.length === 0) return { lines, changed: false, completedRuns: 0 };

  const paired = new Set<string>();
  for (let i = 0; i < yellow.length; i++) {
    for (let j = i + 1; j < yellow.length; j++) {
      const a = yellow[i];
      const b = yellow[j];
      if (a.vertices.length < 2 || b.vertices.length < 2) continue;
      const aLength = polylineLengthFt(a.vertices);
      const bLength = polylineLengthFt(b.vertices);
      const ratio = Math.min(aLength, bLength) / Math.max(aLength, bLength, 1);
      if (ratio < 0.6) continue;
      const separation = meanDistanceToVertices(a.vertices, b.vertices);
      if (separation >= 0.5 && separation <= 2.5) {
        paired.add(a.id);
        paired.add(b.id);
      }
    }
  }

  const unpaired = yellow.filter(feature => !paired.has(feature.id));
  if (unpaired.length === 0) return { lines, changed: false, completedRuns: 0 };

  const replaceIndexes = new Set(unpaired.flatMap(feature => feature.sourceLineIndexes));
  const kept = lines.filter((_, index) => !replaceIndexes.has(index));
  const bands: T[] = [];

  for (const feature of unpaired) {
    const templateIndex = feature.sourceLineIndexes.find(index => lines[index]);
    if (templateIndex === undefined) continue;
    const template = lines[templateIndex];
    const baseId = (template.polylineId || feature.id).replace(/[^a-zA-Z0-9_-]/g, '_');

    for (const side of [-1, 1] as const) {
      const vertices = offsetVertices(feature.vertices, side * DYL_HALF_SEPARATION_FT);
      const polylineId = `${baseId}-dyl-${side < 0 ? 'a' : 'b'}`;
      for (let i = 0; i < vertices.length - 1; i++) {
        const a = vertices[i];
        const b = vertices[i + 1];
        bands.push({
          ...template,
          id: `${polylineId}-${i}`,
          from: `${polylineId}-${i}`,
          to: `${polylineId}-${i + 1}`,
          fromPt: { x: a.easting, y: a.northing, z: template.fromPt?.z ?? 0 },
          toPt: { x: b.easting, y: b.northing, z: template.toPt?.z ?? 0 },
          layer: 'L-ROAD-PAINT-Y',
          lineType: 'CONTINUOUS',
          polylineId,
          bearing: undefined,
          distance: undefined,
          chordBearing: undefined,
          chordDistance: undefined,
          tangentBearing: undefined,
          isCurve: false,
          isCircle: false,
          curveRadius: undefined,
          arcLength: undefined,
          curveDirection: undefined,
          circleCenter: undefined,
        } as T);
      }
    }
  }

  return { lines: [...kept, ...bands], changed: true, completedRuns: unpaired.length };
};

/** Terms that explicitly ask for a baseline/centerline deliverable. */
const BASELINE_TERM_RE = /\b(?:base\s*line|baseline|center\s*line|centerline|centre\s*line|centreline|alignment|stationing|cl|c-road-cntr)\b/i;

/**
 * A request can mention the centerline only to exclude it ("no baseline",
 * "don't draw a centerline"). Those are not requests to draw one.
 */
const NEGATED_BASELINE_RE = /\b(?:no|without|not|don'?t|do\s+not|skip|omit|exclude)\b[^\n.]{0,64}\b(?:base\s*line|baseline|center\s*line|centerline|centre\s*line|centreline|alignment|stationing|cl|c-road-cntr)\b/i;

/**
 * True only when the user explicitly asked for a centerline/baseline-style
 * deliverable. A plain "draw the road" request is pavement edges + paint.
 */
export const queryRequestsRoadBaseline = (query: string): boolean => {
  const text = (query ?? '').trim();
  if (!text) return false;
  return BASELINE_TERM_RE.test(text) && !NEGATED_BASELINE_RE.test(text);
};

/**
 * Keep a road take free of baseline/centerline geometry unless the user asked
 * for it. CL shots are internal ordering evidence, not a default deliverable.
 */
const isBaselineLayer = (layer?: string): boolean => {
  const value = (layer ?? '').trim();
  return isRoadCenterlineLayer(value)
    || /^(?:CL|CTR|CENTER|CENTRE|CENTERLINE|CENTRELINE|BASELINE|BASE-LINE)$/i.test(value);
};

export const stripUnrequestedRoadBaselines = (
  lines: SurveyLine[],
  query: string,
): SurveyLine[] => {
  if (queryRequestsRoadBaseline(query)) return lines;
  return lines.filter(line => !isBaselineLayer(line.layer));
};

/** Force the canonical dashed centerline style on C-ROAD-CNTR linework. */
export const applyRoadCenterlineStyle = (line: SurveyLine): SurveyLine => {
  if (!isRoadCenterlineLine(line)) return line;
  if (line.lineType === ROAD_CENTERLINE_LINETYPE) return line;
  return { ...line, lineType: ROAD_CENTERLINE_LINETYPE };
};

export const applyRoadCenterlineStyles = (lines: SurveyLine[]): SurveyLine[] =>
  lines.map(applyRoadCenterlineStyle);
