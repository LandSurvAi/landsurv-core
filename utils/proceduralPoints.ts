/**
 * Deterministic procedural point generation.
 *
 * Asking a language model to emit hundreds or thousands of coordinate pairs is
 * a token-budget race: the response starts confidently, then truncates long
 * before the requested count. Requests that describe a synthetic point cloud
 * geometrically (for example "a 100 ft base, 12 ft tall mound using 800
 * points") are parsed here and generated locally in full, with no model call.
 *
 * Dimensions are interpreted in project linear units. `sourceUnit` records an
 * explicit unit found in the request so the host can convert it when the
 * project uses a different unit.
 */

import type { SurveyPoint } from '../types.ts';

/** Upper bound for a single local generation (protects the render loop). */
export const MAX_PROCEDURAL_POINT_COUNT = 50_000;

/** Golden angle used for an even sunflower distribution over a disk. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export type ProceduralDistanceUnit = 'foot' | 'meter';

export interface ProceduralPointCenter {
  northing: number;
  easting: number;
}

export interface MoundPointIntent {
  kind: 'mound';
  pointCount: number;
  /** Diameter of the base, in the unit named by `sourceUnit` (or project units). */
  baseDiameter: number;
  /** Height above the base elevation, in the same unit. */
  height: number;
  center?: ProceduralPointCenter;
  baseElevation?: number;
  /** Unit explicitly named in the request, when one was detected. */
  sourceUnit: ProceduralDistanceUnit | null;
}

const GENERATION_ACTION_RE =
  /\b(?:draw|create|generate|make|build|model|place|put|add|plot|construct|populate|fill|scatter|spread)\b/;

const MOUND_NOUN_RE =
  /\b(?:mound|hill|dome|knoll|berm|pile|stockpile)\b/;

function normalize(raw: string): string {
  return raw
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201c\u201d\u2033]/g, '"')
    .replace(/\u00a0/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function readPointCount(text: string): number | null {
  const patterns = [
    /\b(?:using|with|containing|consisting\s+of|made\s+of|composed\s+of|of)?\s*([\d][\d,]*(?:\.\d+)?)\s*(?:points?|pts?)\b/,
    /\b([\d][\d,]*)[-\s]point(?:s)?\b/,
    /\bpoint\s+count\s+(?:of|is|=|:)?\s*([\d][\d,]*(?:\.\d+)?)\b/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = parseNumber(match?.[1]);
    if (value !== null) return Math.round(value);
  }
  return null;
}

function readDiameter(text: string): number | null {
  const patterns = [
    /\b(?:base\s+)?diameter(?:\s+(?:at|of|across)\s+(?:the\s+)?base)?\s*(?:is|of|=|:)?\s*([\d][\d,]*(?:\.\d+)?)\s*(?:'|′|ft|feet|foot)?/,
    /\b([\d][\d,]*(?:\.\d+)?)\s*(?:'|′|ft|feet|foot)?\s+(?:in\s+)?(?:base\s+)?diameter\b/,
    /\b([\d][\d,]*(?:\.\d+)?)\s*(?:'|′|ft|feet|foot)\s*(?:wide|across)\s+(?:at\s+the\s+)?base\b/,
  ];
  for (const pattern of patterns) {
    const value = parseNumber(text.match(pattern)?.[1]);
    if (value !== null && value > 0) return value;
  }
  return null;
}

function readRadius(text: string): number | null {
  const patterns = [
    /\b(?:base\s+)?radius(?:\s+(?:at|of)\s+(?:the\s+)?base)?\s*(?:is|of|=|:)?\s*([\d][\d,]*(?:\.\d+)?)\s*(?:'|′|ft|feet|foot)?/,
    /\b([\d][\d,]*(?:\.\d+)?)\s*(?:'|′|ft|feet|foot)?\s+(?:in\s+)?(?:base\s+)?radius\b/,
  ];
  for (const pattern of patterns) {
    const value = parseNumber(text.match(pattern)?.[1]);
    if (value !== null && value > 0) return value;
  }
  return null;
}

function readHeight(text: string): number | null {
  const patterns = [
    /\b(?:height|tallness|rise|rises)\s*(?:is|of|=|:|at)?\s*([\d][\d,]*(?:\.\d+)?)\s*(?:'|′|ft|feet|foot)?/,
    /\b([\d][\d,]*(?:\.\d+)?)\s*(?:'|′|ft|feet|foot|")\s*(?:tall|high|in\s+height)\b/,
    /\b([\d][\d,]*(?:\.\d+)?)\s+(?:in|of)\s+height\b/,
  ];
  for (const pattern of patterns) {
    const value = parseNumber(text.match(pattern)?.[1]);
    if (value !== null && value > 0) return value;
  }
  return null;
}

function readCenter(text: string): ProceduralPointCenter | null {
  const patterns = [
    /\bcent(?:er|re)(?:ed|d)?\s+(?:at|on)\s+(?:n(?:orthing)?\s*)?(-?[\d][\d,]*(?:\.\d+)?)\s*(?:,|and)?\s*(?:e(?:asting)?\s*)?(-?[\d][\d,]*(?:\.\d+)?)\b/,
    /\b(?:at|on)\s+n(?:orthing)?\s*(-?[\d][\d,]*(?:\.\d+)?)\s*(?:,|and)?\s*e(?:asting)?\s*(-?[\d][\d,]*(?:\.\d+)?)\b/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const northing = parseNumber(match[1]);
    const easting = parseNumber(match[2]);
    if (northing !== null && easting !== null) return { northing, easting };
  }
  return null;
}

function readBaseElevation(text: string): number | null {
  const patterns = [
    /\b(?:base|ground|existing)\s+elevation\s*(?:is|of|=|:)?\s*(-?[\d][\d,]*(?:\.\d+)?)/,
    /\b(?:at|with)\s+(?:a\s+)?(?:base\s+)?elevation\s+(?:of\s+)?(-?[\d][\d,]*(?:\.\d+)?)/,
  ];
  for (const pattern of patterns) {
    const value = parseNumber(text.match(pattern)?.[1]);
    if (value !== null) return value;
  }
  return null;
}

function detectSourceUnit(text: string): ProceduralDistanceUnit | null {
  if (/\d\s*(?:'|′)/.test(text) || /\b(?:ft|feet|foot)\b/.test(text)) return 'foot';
  if (/\d\s*(?:m|meter|meters|metre|metres)\b/.test(text)) return 'meter';
  return null;
}

/**
 * Parse a request for a synthetic mound point cloud. Returns null unless the
 * request clearly asks to generate points for a mound with a stated point
 * count, base diameter (or radius) and height — so ordinary mound questions
 * still flow to the agents.
 */
export function parseMoundPointIntent(raw: string): MoundPointIntent | null {
  if (!raw || !raw.trim()) return null;
  const text = normalize(raw);

  if (!MOUND_NOUN_RE.test(text) || !GENERATION_ACTION_RE.test(text)) return null;

  const pointCount = readPointCount(text);
  if (pointCount === null) return null;
  if (!Number.isInteger(pointCount) || pointCount < 1 || pointCount > MAX_PROCEDURAL_POINT_COUNT) {
    return null;
  }

  let baseDiameter = readDiameter(text);
  if (baseDiameter === null) {
    const radius = readRadius(text);
    if (radius !== null) baseDiameter = radius * 2;
  }
  const height = readHeight(text);
  if (baseDiameter === null || height === null) return null;
  if (!(baseDiameter > 0) || !(height > 0)) return null;

  const center = readCenter(text);
  const baseElevation = readBaseElevation(text);

  return {
    kind: 'mound',
    pointCount,
    baseDiameter,
    height,
    ...(center ? { center } : {}),
    ...(baseElevation !== null ? { baseElevation } : {}),
    sourceUnit: detectSourceUnit(text),
  };
}

export interface ProceduralPointGenerationOptions {
  /** Exact point numbers to assign, in generation order. */
  pointNumbers: readonly string[];
  /** Existing project points used for placement and local ground elevation. */
  existingPoints?: ReadonlyArray<Pick<SurveyPoint, 'northing' | 'easting' | 'elevation'>>;
  description?: string;
}

export interface GeneratedMoundPoints {
  points: SurveyPoint[];
  center: ProceduralPointCenter;
  baseElevation: number;
  apexElevation: number;
}

function centroidOf(
  points: ReadonlyArray<Pick<SurveyPoint, 'northing' | 'easting'>>,
): ProceduralPointCenter | null {
  let count = 0;
  let northing = 0;
  let easting = 0;
  for (const point of points) {
    if (!Number.isFinite(point.northing) || !Number.isFinite(point.easting)) continue;
    northing += point.northing;
    easting += point.easting;
    count++;
  }
  return count > 0 ? { northing: northing / count, easting: easting / count } : null;
}

function nearestElevation(
  points: ReadonlyArray<Pick<SurveyPoint, 'northing' | 'easting' | 'elevation'>>,
  center: ProceduralPointCenter,
): number | null {
  let bestElevation: number | null = null;
  let bestDistance = Infinity;
  for (const point of points) {
    if (
      !Number.isFinite(point.northing) ||
      !Number.isFinite(point.easting) ||
      typeof point.elevation !== 'number' ||
      !Number.isFinite(point.elevation)
    ) {
      continue;
    }
    const dn = point.northing - center.northing;
    const de = point.easting - center.easting;
    const distance = dn * dn + de * de;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestElevation = point.elevation;
    }
  }
  return bestElevation;
}

/**
 * Generate the full mound point cloud.
 *
 * Points are distributed with a golden-angle sunflower so coverage of the
 * circular base is even for any point count. Elevation follows a smooth dome
 * profile: full height at the center, base elevation at the rim.
 */
export function generateMoundPoints(
  intent: MoundPointIntent,
  options: ProceduralPointGenerationOptions,
): GeneratedMoundPoints {
  if (!Number.isInteger(intent.pointCount) || intent.pointCount < 1) {
    throw new Error('Mound point count must be a positive integer.');
  }
  if (intent.pointCount > MAX_PROCEDURAL_POINT_COUNT) {
    throw new Error(`Mound point count exceeds the local limit of ${MAX_PROCEDURAL_POINT_COUNT}.`);
  }
  if (!(intent.baseDiameter > 0) || !(intent.height > 0)) {
    throw new Error('Mound base diameter and height must be greater than zero.');
  }
  if (options.pointNumbers.length !== intent.pointCount) {
    throw new Error(
      `Expected ${intent.pointCount} point numbers, received ${options.pointNumbers.length}.`,
    );
  }

  const existing = options.existingPoints ?? [];
  const center = intent.center ?? centroidOf(existing) ?? { northing: 0, easting: 0 };
  const baseElevation = intent.baseElevation ?? nearestElevation(existing, center) ?? 0;
  const radius = intent.baseDiameter / 2;
  const description = options.description ?? 'MOUND';

  const points: SurveyPoint[] = [];
  for (let i = 0; i < intent.pointCount; i++) {
    const radialFraction = intent.pointCount === 1 ? 0 : Math.sqrt(i / intent.pointCount);
    const distance = radius * radialFraction;
    const angle = i * GOLDEN_ANGLE;
    const elevation = baseElevation + intent.height * Math.cos((radialFraction * Math.PI) / 2);

    points.push({
      pointNumber: options.pointNumbers[i],
      northing: center.northing + distance * Math.sin(angle),
      easting: center.easting + distance * Math.cos(angle),
      elevation,
      description,
    });
  }

  return {
    points,
    center,
    baseElevation,
    apexElevation: baseElevation + intent.height,
  };
}

/** Short numeric formatting for chat replies and point-list names. */
export function formatProceduralDimension(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** Display name for the generated point list. */
export function buildMoundPointListName(
  intent: Pick<MoundPointIntent, 'baseDiameter' | 'height'>,
  unitLabel: string,
): string {
  return `Mound (${formatProceduralDimension(intent.baseDiameter)} ${unitLabel} base, ${formatProceduralDimension(intent.height)} ${unitLabel} high)`;
}
