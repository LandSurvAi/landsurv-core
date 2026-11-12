/**
 * Redline Agent — entity matching.
 *
 * Given a markup anchor in world space and the current drawing entities,
 * propose the entity the reviewer most likely meant. Confidence is explicit and
 * every candidate carries its alternatives; nothing is picked merely because
 * it is nearest.
 */

import type {
  CanvasTextAnnotation,
  Centerline,
  RedlineConfidence,
  RedlineTarget,
  SurveyLine,
  SurveyPoint,
} from '../../types';
import { normalizeRedlineTextForMatching } from './markupInterpretation';

export interface RedlineEntitySnapshot {
  points: SurveyPoint[];
  lines: SurveyLine[];
  textAnnotations: CanvasTextAnnotation[];
  centerlines?: Centerline[];
}

export interface RedlineMatchInput {
  reviewerText: string;
  intentText: string;
  anchorWorld: { easting: number; northing: number } | null;
  entities: RedlineEntitySnapshot;
  /** Search radius in project units. Defaults to 15 ft. */
  radius?: number;
  /** Restrict matches to these entity types (e.g. text-only for text edits). */
  allowedEntityTypes?: Array<RedlineTarget['entityType']>;
}

interface Candidate {
  entityType: RedlineTarget['entityType'];
  entityId: string;
  label: string;
  layer?: string;
  /** Distance in project units, or Infinity when it cannot be placed. */
  distance: number;
  textCorpus: string;
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'to', 'from', 'with', 'and', 'or', 'of', 'on', 'in', 'at', 'by',
  'this', 'that', 'these', 'those', 'please', 'here', 'there', 'is', 'are', 'be',
  'change', 'replace', 'revise', 'update', 'delete', 'remove', 'del', 'rm', 'add',
  'show', 'insert', 'label', 'fix', 'correct', 'existing', 'new', 'match', 'per',
]);

function tokenize(text: string): string[] {
  return normalizeRedlineTextForMatching(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function textSimilarity(a: string, b: string): number {
  const aTokens = new Set(tokenize(a));
  const bTokens = new Set(tokenize(b));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of aTokens) if (bTokens.has(token)) overlap += 1;
  // Redline labels often change one token (LOT 12 -> LOT 14). Score the overlap
  // against the shorter label so a single changed value does not erase the
  // match, while still requiring the surrounding words to agree.
  const overlapRatio = overlap / Math.min(aTokens.size, bTokens.size);
  const aNorm = [...aTokens].join(' ');
  const bNorm = [...bTokens].join(' ');
  const containment = aNorm && bNorm && (aNorm.includes(bNorm) || bNorm.includes(aNorm)) ? 0.25 : 0;
  return Math.min(1, overlapRatio + containment);
}

const EXPECTED_LAYER_TOKENS: Array<{ intent: RegExp; tokens: string[] }> = [
  // Text rules run first: a label such as "LOT 14" also contains a property
  // word, but the edit belongs on the annotation layer.
  { intent: /\b(text|label|note|callout|annotation)\b/i, tokens: ['text', 'annot', 'note', 'label'] },
  { intent: /\b(fence)\b/i, tokens: ['fence', 'fenc'] },
  { intent: /\b(road|street|pavement|curb|gutter|sidewalk|eop|edge of pavement)\b/i, tokens: ['road', 'pave', 'curb', 'walk', 'row'] },
  { intent: /\b(property|boundary|lot|parcel|right of way|row)\b/i, tokens: ['prop', 'bound', 'lot', 'parcel', 'row', 'rw'] },
  { intent: /\b(contour|elevation|topo)\b/i, tokens: ['contour', 'topo', 'elev'] },
  { intent: /\b(stream|water|drain|ditch|swale)\b/i, tokens: ['stream', 'water', 'drain', 'ditch', 'swale'] },
  { intent: /\b(building|structure|wall)\b/i, tokens: ['bldg', 'build', 'struct', 'wall'] },
];

function layerScore(layer: string | undefined, intentText: string): number {
  if (!layer) return 0.35;
  const normalized = layer.toLowerCase();
  for (const rule of EXPECTED_LAYER_TOKENS) {
    if (!rule.intent.test(intentText)) continue;
    return rule.tokens.some((token) => normalized.includes(token)) ? 1 : 0.1;
  }
  return 0.5;
}

function pointMap(points: SurveyPoint[]): Map<string, SurveyPoint> {
  return new Map(points.map((point) => [point.pointNumber, point]));
}

function lineEndpoints(line: SurveyLine, points: Map<string, SurveyPoint>) {
  const from = line.fromPt ?? points.get(line.from);
  const to = line.toPt ?? points.get(line.to);
  if (!from || !to) return null;
  const fromPoint = from as unknown as { x?: number; y?: number; easting?: number; northing?: number };
  const toPoint = to as unknown as { x?: number; y?: number; easting?: number; northing?: number };
  const fromX = fromPoint.x ?? fromPoint.easting;
  const fromY = fromPoint.y ?? fromPoint.northing;
  const toX = toPoint.x ?? toPoint.easting;
  const toY = toPoint.y ?? toPoint.northing;
  if (![fromX, fromY, toX, toY].every((value) => typeof value === 'number' && Number.isFinite(value))) {
    return null;
  }
  return {
    from: { x: fromX!, y: fromY! },
    to: { x: toX!, y: toY! },
  };
}

function distanceToSegment(
  point: { easting: number; northing: number },
  from: { x: number; y: number },
  to: { x: number; y: number },
): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(point.easting - from.x, point.northing - from.y);
  const t = Math.max(0, Math.min(1, ((point.easting - from.x) * dx + (point.northing - from.y) * dy) / lengthSq));
  return Math.hypot(point.easting - (from.x + t * dx), point.northing - (from.y + t * dy));
}

function distance(a: { easting: number; northing: number }, b: { easting: number; northing: number }): number {
  return Math.hypot(a.easting - b.easting, a.northing - b.northing);
}

function lineLabel(line: SurveyLine, index: number): string {
  const layer = line.layer ? `${line.layer} — ` : '';
  const kind = line.type ? `${line.type} ` : '';
  return `${layer}${kind}line ${line.from}–${line.to}`.replace(/\s+/g, ' ').trim() || `Line ${index + 1}`;
}

function candidateScore(candidate: Candidate, radius: number, intentText: string): number {
  const proximity = Number.isFinite(candidate.distance)
    ? Math.max(0, 1 - candidate.distance / radius)
    : 0;
  const similarity = textSimilarity(intentText, candidate.textCorpus);
  const layer = layerScore(candidate.layer, intentText);
  return 0.55 * proximity + 0.3 * similarity + 0.15 * layer;
}

export function confidenceFromScore(score: number): RedlineConfidence {
  if (score >= 0.8) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}

/**
 * Return the best target plus alternatives, or null when no entity is inside
 * the search radius. A low score still returns the target so the UI can ask.
 */
export function matchRedlineTarget(input: RedlineMatchInput): RedlineTarget | null {
  const radius = input.radius && input.radius > 0 ? input.radius : 15;
  const anchor = input.anchorWorld;
  if (!anchor) return null;

  const points = pointMap(input.entities.points);
  const candidates: Candidate[] = [];

  for (const point of input.entities.points) {
    const position = {
      easting: (point as any).easting ?? (point as any).x,
      northing: (point as any).northing ?? (point as any).y,
    };
    if (!Number.isFinite(position.easting) || !Number.isFinite(position.northing)) continue;
    candidates.push({
      entityType: 'point',
      entityId: point.pointNumber,
      label: `Point ${point.pointNumber}${point.description ? ` — ${point.description}` : ''}`,
      layer: point.layer,
      distance: distance(anchor, position),
      textCorpus: `${point.pointNumber} ${point.description ?? ''}`,
    });
  }

  input.entities.lines.forEach((line, index) => {
    const endpoints = lineEndpoints(line, points);
    if (!endpoints) return;
    candidates.push({
      entityType: 'line',
      entityId: line.id || `line-${index}`,
      label: lineLabel(line, index),
      layer: line.layer,
      distance: distanceToSegment(anchor, endpoints.from, endpoints.to),
      textCorpus: `${line.from} ${line.to} ${line.layer ?? ''} ${line.type ?? ''}`,
    });
  });

  for (const annotation of input.entities.textAnnotations) {
    candidates.push({
      entityType: 'text',
      entityId: annotation.id,
      label: `Text "${annotation.text.slice(0, 60)}${annotation.text.length > 60 ? '…' : ''}"`,
      layer: annotation.layer,
      distance: distance(anchor, { easting: annotation.x, northing: annotation.y }),
      textCorpus: `${annotation.text} ${annotation.styleName ?? ''}`,
    });
  }

  // Centerlines are matched through their PI vertices when present.
  (input.entities.centerlines ?? []).forEach((centerline) => {
    const pis = centerline.pis ?? [];
    let best = Infinity;
    for (const pi of pis) {
      const easting = (pi as any).easting ?? (pi as any).x;
      const northing = (pi as any).northing ?? (pi as any).y;
      if (!Number.isFinite(easting) || !Number.isFinite(northing)) continue;
      best = Math.min(best, distance(anchor, { easting, northing }));
    }
    if (!Number.isFinite(best)) return;
    candidates.push({
      entityType: 'centerline',
      entityId: centerline.id,
      label: `Centerline ${centerline.name}`,
      distance: best,
      textCorpus: centerline.name,
    });
  });

  const scored = candidates
    .filter((candidate) => !input.allowedEntityTypes || input.allowedEntityTypes.includes(candidate.entityType))
    .map((candidate) => ({ candidate, score: candidateScore(candidate, radius, input.intentText) }))
    .filter(({ candidate }) => candidate.distance <= radius)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  const best = scored[0];
  return {
    entityType: best.candidate.entityType,
    entityId: best.candidate.entityId,
    label: best.candidate.label,
    matchConfidence: Number(best.score.toFixed(3)),
    alternatives: scored.slice(1, 4).map(({ candidate, score }) => ({
      entityType: candidate.entityType,
      entityId: candidate.entityId,
      label: candidate.label,
      score: Number(score.toFixed(3)),
    })),
  };
}
