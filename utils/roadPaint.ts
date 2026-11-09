/**
 * Road paint marking geometry.
 *
 * Surveyors locate the pavement with EP (edge of pavement) shots and describe
 * the striping with WL / SWL (single white line) or DYL (double yellow). Paint
 * is a real 4-inch-wide band, not a CAD lineweight, so each stripe is emitted
 * as a run of filled quads that follow the stationing centerline at a fixed
 * offset (8 inches by default). EP is a reference feature and is never painted.
 *
 * The geometry is deliberately pure: the CACP handler, the A2UI studio preview,
 * and the tests all call the same functions.
 */

import type {
  Centerline,
  RoadPaintMarkingId,
  RoadPaintSpec,
  RoadPaintStripeMeta,
  RoadPaintSide,
  StreetLabel,
  SurveyLine,
} from '../types.ts';
import {
  calculateCenterlineLength,
  calculateCenterlineTangentBearing,
  calculatePointFromStationOffset,
  formatStation,
  parseStation,
} from './stationing.ts';

export const INCHES_PER_FOOT = 12;
export const DEFAULT_PAINT_WIDTH_IN = 4;
export const DEFAULT_PAINT_OFFSET_IN = 8;
/** A 4-inch stripe at 8 inches each side leaves a 12-inch gap between DYL bands. */
export const DEFAULT_DYL_SEPARATION_IN = 8;

export interface RoadPaintPreset {
  id: RoadPaintMarkingId;
  label: string;
  abbreviation: string;
  /** EP is a surveyed reference; everything else is actual paint. */
  paint: boolean;
  color: string;
  layer: string;
  lineType: string;
  /** Stripe center offsets from the centerline, in inches (+ right, − left). */
  stripeOffsetsIn: number[];
  defaultWidthIn: number;
  description: string;
}

export const ROAD_PAINT_PRESETS: RoadPaintPreset[] = [
  {
    id: 'EP',
    label: 'Edge of pavement',
    abbreviation: 'EP',
    paint: false,
    color: '#94A3B8',
    layer: 'L-ROAD-EP',
    lineType: 'CONTINUOUS',
    stripeOffsetsIn: [],
    defaultWidthIn: 0,
    description:
      'Surveyed pavement limit used to fit and check the centerline. Reference only — EP is not a painted stripe.',
  },
  {
    id: 'WL',
    label: 'White line',
    abbreviation: 'WL',
    paint: true,
    color: '#FFFFFF',
    layer: 'L-ROAD-PAINT-W',
    lineType: 'CONTINUOUS',
    stripeOffsetsIn: [DEFAULT_PAINT_OFFSET_IN],
    defaultWidthIn: DEFAULT_PAINT_WIDTH_IN,
    description:
      'One white line for a lane, shoulder, or edge line. A single 4-inch band offset from the centerline.',
  },
  {
    id: 'SWL',
    label: 'Single white line',
    abbreviation: 'SWL',
    paint: true,
    color: '#FFFFFF',
    layer: 'L-ROAD-PAINT-W',
    lineType: 'CONTINUOUS',
    stripeOffsetsIn: [DEFAULT_PAINT_OFFSET_IN],
    defaultWidthIn: DEFAULT_PAINT_WIDTH_IN,
    description:
      'Single white line — one 4-inch white band 8 inches off the centerline on the selected side.',
  },
  {
    id: 'DYL',
    label: 'Double yellow line',
    abbreviation: 'DYL',
    paint: true,
    color: '#FFD400',
    layer: 'L-ROAD-PAINT-Y',
    lineType: 'CONTINUOUS',
    stripeOffsetsIn: [-DEFAULT_DYL_SEPARATION_IN, DEFAULT_DYL_SEPARATION_IN],
    defaultWidthIn: DEFAULT_PAINT_WIDTH_IN,
    description:
      'Double yellow line — two 4-inch yellow bands, one 8 inches each side of the centerline.',
  },
];

export function getRoadPaintPreset(marking: RoadPaintMarkingId): RoadPaintPreset | undefined {
  return ROAD_PAINT_PRESETS.find(preset => preset.id === marking);
}

export interface ResolvedRoadPaintSpec {
  marking: RoadPaintMarkingId;
  label: string;
  centerlineId: string;
  centerlineName: string;
  stripeOffsetsIn: number[];
  widthIn: number;
  color: string;
  layer: string;
  lineType: string;
  startStation: number;
  endStation: number;
  stationStepFt: number;
  labelIntervalFt: number;
  annotate: boolean;
}

export type RoadPaintResolveResult =
  | { ok: true; spec: ResolvedRoadPaintSpec }
  | { ok: false; error: string };

const parseStationInput = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) return parseStation(value.trim());
  return null;
};

const finiteOr = (value: unknown, fallback: number): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/** Resolve defaults, offsets and station limits against a real alignment. */
export function resolveRoadPaintSpec(
  spec: RoadPaintSpec,
  centerline: Centerline,
): RoadPaintResolveResult {
  const marking = String(spec.marking ?? '').trim().toUpperCase() as RoadPaintMarkingId;
  const preset = getRoadPaintPreset(marking);
  if (!preset) {
    return {
      ok: false,
      error: `Unknown road paint marking "${spec.marking ?? ''}". Use EP, WL, SWL or DYL.`,
    };
  }
  if (!preset.paint) {
    return {
      ok: false,
      error:
        'EP (edge of pavement) is a surveyed reference, not paint. Fit the centerline between the EP shots, then apply WL, SWL or DYL.',
    };
  }

  const length = calculateCenterlineLength(centerline);
  if (length <= 0 || centerline.pis.length < 2) {
    return {
      ok: false,
      error: `Centerline "${centerline.name}" has no usable length. Create or repair the alignment in Stationing & CL first.`,
    };
  }

  const begin = centerline.beginStation;
  const end = begin + length;
  const requestedStart = parseStationInput(spec.startStation);
  const requestedEnd = parseStationInput(spec.endStation);
  const startStation = Math.min(end, Math.max(begin, requestedStart ?? begin));
  const endStation = Math.min(end, Math.max(begin, requestedEnd ?? end));
  if (endStation - startStation <= 0) {
    return {
      ok: false,
      error: `Paint station range ${formatStation(startStation)} to ${formatStation(endStation)} is empty. The alignment runs ${formatStation(begin)} to ${formatStation(end)}.`,
    };
  }

  const widthIn = finiteOr(spec.widthIn, preset.defaultWidthIn || DEFAULT_PAINT_WIDTH_IN);
  if (widthIn <= 0 || widthIn > 24) {
    return { ok: false, error: `Paint width must be between 0 and 24 inches (received ${widthIn}).` };
  }

  let stripeOffsetsIn: number[];
  if (marking === 'DYL') {
    const separation = Math.abs(
      finiteOr(
        spec.separationIn,
        finiteOr(spec.offsetIn, DEFAULT_DYL_SEPARATION_IN),
      ),
    );
    if (!Number.isFinite(separation) || separation <= widthIn / 2) {
      return {
        ok: false,
        error: `Double yellow separation must be greater than half the stripe width (${widthIn / 2} in).`,
      };
    }
    stripeOffsetsIn = [-separation, separation];
  } else {
    const magnitude = Math.abs(finiteOr(spec.offsetIn, DEFAULT_PAINT_OFFSET_IN));
    const side: RoadPaintSide = spec.side === 'left' || spec.side === 'both' ? spec.side : 'right';
    stripeOffsetsIn =
      side === 'both' ? [-magnitude, magnitude] : [side === 'left' ? -magnitude : magnitude];
  }

  const stationStepFt = Math.max(2, finiteOr(spec.stationStepFt, 10));
  const labelIntervalFt = Math.max(10, finiteOr(spec.labelIntervalFt, 100));

  return {
    ok: true,
    spec: {
      marking,
      label: preset.label,
      centerlineId: centerline.id,
      centerlineName: centerline.name,
      stripeOffsetsIn,
      widthIn,
      color: spec.color?.trim() || preset.color,
      layer: spec.layer?.trim() || preset.layer,
      lineType: spec.lineType?.trim() || preset.lineType,
      startStation,
      endStation,
      stationStepFt,
      labelIntervalFt,
      annotate: spec.annotate !== false,
    },
  };
}

export interface RoadPaintBuildResult {
  runId: string;
  lines: SurveyLine[];
  labels: StreetLabel[];
  stripeCount: number;
  segmentCount: number;
  lengthFt: number;
  paintedAreaSqFt: number;
}

/** Canvas text rotation (degrees) that aligns a label with the paint band. */
export const paintLabelAngleDegrees = (bearing: number): number => {
  // bearing is clockwise from north; canvas text runs along the tangent.
  const bearingDeg = (bearing * 180) / Math.PI;
  let angle = 90 - bearingDeg;
  while (angle > 90) angle -= 180;
  while (angle <= -90) angle += 180;
  return angle;
};

/**
 * Build the paint bands and station callouts along a resolved centerline.
 * Each band segment carries a 4-vertex fillPath (true width) plus its center
 * line for selection and DXF export.
 */
export function buildRoadPaintMarkings(
  centerline: Centerline,
  resolved: ResolvedRoadPaintSpec,
): RoadPaintBuildResult {
  const runId = `paint-${resolved.marking}-${centerline.id}-${Date.now().toString(36)}`;
  const lines: SurveyLine[] = [];
  const labels: StreetLabel[] = [];
  const span = resolved.endStation - resolved.startStation;
  const segmentCount = Math.max(1, Math.ceil(span / resolved.stationStepFt));
  const actualStep = span / segmentCount;
  const halfWidthFt = resolved.widthIn / (2 * INCHES_PER_FOOT);
  const stripeCount = resolved.stripeOffsetsIn.length;
  const lengthFt = span;

  resolved.stripeOffsetsIn.forEach((offsetIn, stripeIndex) => {
    const centerOffsetFt = offsetIn / INCHES_PER_FOOT;
    const polylineId = `${runId}-s${stripeIndex}`;
    const meta: RoadPaintStripeMeta = {
      marking: resolved.marking,
      centerlineId: centerline.id,
      centerlineName: centerline.name,
      offsetIn,
      widthIn: resolved.widthIn,
      stripeIndex,
      stripeCount,
      startStation: resolved.startStation,
      endStation: resolved.endStation,
    };

    for (let i = 0; i < segmentCount; i++) {
      const s0 = resolved.startStation + i * actualStep;
      const s1 = i === segmentCount - 1 ? resolved.endStation : s0 + actualStep;

      const c0 = calculatePointFromStationOffset(centerline, s0, 0);
      const c1 = calculatePointFromStationOffset(centerline, s1, 0);
      const a0 = calculatePointFromStationOffset(centerline, s0, centerOffsetFt - halfWidthFt);
      const b0 = calculatePointFromStationOffset(centerline, s0, centerOffsetFt + halfWidthFt);
      const b1 = calculatePointFromStationOffset(centerline, s1, centerOffsetFt + halfWidthFt);
      const a1 = calculatePointFromStationOffset(centerline, s1, centerOffsetFt - halfWidthFt);
      if (!c0 || !c1 || !a0 || !b0 || !b1 || !a1) continue;

      lines.push({
        id: `${polylineId}-${i}`,
        from: `${polylineId}-${i}`,
        to: `${polylineId}-${i + 1}`,
        fromPt: { x: c0.easting, y: c0.northing, z: 0 },
        toPt: { x: c1.easting, y: c1.northing, z: 0 },
        type: 'road-paint',
        color: resolved.color,
        layer: resolved.layer,
        lineType: resolved.lineType,
        polylineId,
        roadPaint: meta,
        fillPath: [
          { x: a0.easting, y: a0.northing, z: 0 },
          { x: b0.easting, y: b0.northing, z: 0 },
          { x: b1.easting, y: b1.northing, z: 0 },
          { x: a1.easting, y: a1.northing, z: 0 },
        ],
      });
    }

    if (!resolved.annotate) return;

    const labelStations = [resolved.startStation];
    for (
      let station = Math.ceil(resolved.startStation / resolved.labelIntervalFt) * resolved.labelIntervalFt;
      station < resolved.endStation - 1e-6;
      station += resolved.labelIntervalFt
    ) {
      if (station > resolved.startStation + 1e-6) labelStations.push(station);
    }
    labelStations.push(resolved.endStation);

    labelStations.forEach((station, index) => {
      const bearing = calculateCenterlineTangentBearing(centerline, station);
      if (bearing === null) return;
      const awayFromCenter = offsetIn === 0 ? 1 : Math.sign(offsetIn);
      const labelOffsetFt = centerOffsetFt + awayFromCenter * (halfWidthFt + 1.5);
      const anchor = calculatePointFromStationOffset(centerline, station, labelOffsetFt);
      if (!anchor) return;

      const isStart = index === 0;
      const isEnd = index === labelStations.length - 1 && labelStations.length > 1;
      const prefix = isStart ? 'BEG ' : isEnd ? 'END ' : '';
      labels.push({
        x: anchor.easting,
        y: anchor.northing,
        text: `${prefix}${resolved.marking} ${formatStation(station)}`,
        angle: paintLabelAngleDegrees(bearing),
        roadPaint: { marking: resolved.marking, centerlineId: centerline.id },
      });
    });
  });

  return {
    runId,
    lines,
    labels,
    stripeCount,
    segmentCount,
    lengthFt,
    paintedAreaSqFt: lengthFt * (resolved.widthIn / INCHES_PER_FOOT) * stripeCount,
  };
}

const PAINT_ACTION_RE =
  /\b(?:draw|paint|stripe|striping|mark|marking|markings|add|apply|put|lay|place|create|make|show|stake)\b/i;
const PAINT_QUESTION_RE = /\b(?:what|why|how|does|do|is|are|explain|meaning|mean)\b/i;

/**
 * Find a pavement-marking code in free text. DYL (double yellow) and WL/SWL
 * (white line / single white line) are the codes a surveyor says out loud.
 * EP is a reference feature, not paint, so it is never returned.
 */
export function detectRoadPaintMarking(text: string): RoadPaintMarkingId | null {
  if (!text) return null;
  if (
    /\bDYL\b|\bDOUBLE\s+(?:YELLOW|SOLID\s+YELLOW)\b|\bYELLOW\s+(?:LINE|LINES|STRIPE|STRIPES|MARKING|MARKINGS|PAINT)\b/i.test(
      text,
    )
  ) {
    return 'DYL';
  }
  if (
    /\bSWL\b|\bSINGLE\s+WHITE(?:\s+LINE)?\b|\bWHITE\s+(?:LINE|LINES|STRIPE|STRIPES|MARKING|MARKINGS|PAINT)\b/i.test(
      text,
    )
  ) {
    return 'SWL';
  }
  if (/\bWL\b/i.test(text)) return 'WL';
  return null;
}

/**
 * Treat a marking mention as a draw command. A bare code ("DYL") or any
 * draw/paint verb is a request; a question such as "what does DYL mean?" is
 * not. This is the deterministic half of "if it says DYL, draw double yellow".
 */
export function detectRoadPaintRequest(text: string): RoadPaintMarkingId | null {
  const marking = detectRoadPaintMarking(text);
  if (!marking) return null;
  const trimmed = text.trim();
  const hasAction = PAINT_ACTION_RE.test(trimmed);
  if (!hasAction && PAINT_QUESTION_RE.test(trimmed)) return null;
  if (!hasAction && trimmed.length > 40) return null;
  return marking;
}
