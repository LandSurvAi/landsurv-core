import type { SurveyLine } from '../types.ts';

export interface DividedPoint {
  easting: number;
  northing: number;
  sourceLineId: string;
}

/**
 * Parse a divide request such as "divide these lines into 5 points".
 * Returns null unless both an entity type and a point count are present.
 */
export function parseDivideSelectionIntent(query: string): { pointCount: number } | null {
  const text = query.trim();
  if (!/\bdivide\b/i.test(text)) return null;
  if (!/\b(?:line|lines|arc|arcs|polyline|polylines|entity|entities)\b/i.test(text)) return null;

  const countMatch =
    text.match(/\b(?:into|in|to)\s+(\d{1,4})\s*(?:equal\s+)?(?:points?|segments?|parts?)?/i) ||
    text.match(/\b(\d{1,4})\s*(?:equal\s+)?(?:points?|segments?|parts?)\b/i);
  if (!countMatch) return null;

  const pointCount = Number(countMatch[1]);
  return Number.isFinite(pointCount) && pointCount > 0 && pointCount <= 500
    ? { pointCount }
    : null;
}

function lineId(line: SurveyLine): string {
  return line.id || `${line.from}-${line.to}`;
}

function equalPointCount(count: number): number {
  return Math.max(1, Math.min(500, Math.floor(count)));
}

function pointAtFraction(line: SurveyLine, t: number): { easting: number; northing: number } | null {
  const p1 = line.fromPt;
  const p2 = line.toPt;
  if (!p1 || !p2) return null;

  if (line.isCircle) {
    const center = line.circleCenter;
    if (!center) return null;
    const start = Math.atan2(p1.y - center.y, p1.x - center.x);
    const direction = line.curveDirection === 'left' ? -1 : 1;
    const angle = start + direction * Math.PI * 2 * t;
    return {
      easting: center.x + Math.hypot(p1.x - center.x, p1.y - center.y) * Math.cos(angle),
      northing: center.y + Math.hypot(p1.x - center.x, p1.y - center.y) * Math.sin(angle),
    };
  }

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const chord = Math.hypot(dx, dy);
  if (chord <= 0) return null;

  const radius = line.curveRadius;
  const arcLength =
    typeof line.arcLength === 'number' && Number.isFinite(line.arcLength) && line.arcLength > 0
      ? line.arcLength
      : 0;

  if (!line.isCurve || !radius || radius <= 0 || arcLength <= 0) {
    return { easting: p1.x + dx * t, northing: p1.y + dy * t };
  }

  const halfChord = chord / 2;
  const hSquared = radius * radius - halfChord * halfChord;
  if (hSquared < 0) {
    return { easting: p1.x + dx * t, northing: p1.y + dy * t };
  }

  // The center sits on the inside of the turn. A left-hand curve bulges to
  // the left of the chord, so its center is on the chord's right, and vice versa.
  const direction = line.curveDirection === 'left' ? 1 : -1;
  const h = Math.sqrt(hSquared);
  const cx = (p1.x + p2.x) / 2 + (dy / chord) * h * direction;
  const cy = (p1.y + p2.y) / 2 - (dx / chord) * h * direction;
  const startAngle = Math.atan2(p1.y - cy, p1.x - cx);
  const sweep = arcLength / radius;
  const sign = line.curveDirection === 'left' ? -1 : 1;
  const angle = startAngle + sign * sweep * t;

  return {
    easting: cx + radius * Math.cos(angle),
    northing: cy + radius * Math.sin(angle),
  };
}

/**
 * Place `count` equally spaced new points between each selected entity's
 * endpoints. Endpoints are intentionally excluded so dividing an existing
 * line does not duplicate its existing end points.
 */
export function divideLinesIntoPoints(lines: SurveyLine[], count: number): DividedPoint[] {
  const pointCount = equalPointCount(count);
  const out: DividedPoint[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    for (let i = 1; i <= pointCount; i++) {
      const point = pointAtFraction(line, i / (pointCount + 1));
      if (!point) continue;
      const key = `${point.easting.toFixed(6)}|${point.northing.toFixed(6)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...point, sourceLineId: lineId(line) });
    }
  }

  return out;
}
