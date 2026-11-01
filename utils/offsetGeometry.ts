/**
 * Pure geometry helpers for the canvas OFFSET command.
 *
 * Everything works in world coordinates (x = easting, y = northing).
 * The drawing model has no first-class polyline entity, so a "polyline" is a
 * chain of SurveyLine segments that share endpoints (or a polylineId). These
 * helpers order such a chain and build the parallel copy, supporting straight
 * segments, arcs and full circles.
 */

import { parseBearingToRadians } from './cogo.ts';

export interface Point2D {
  x: number;
  y: number;
}

export interface ArcGeometry {
  center: Point2D;
  radius: number;
  /** Math angle (radians from +x/easting) of the arc start. */
  startAngle: number;
  /** Math angle of the arc end in the travel direction. */
  endAngle: number;
  /** Positive sweep magnitude in radians. */
  centralAngle: number;
  /** True when travelling from → to turns left (counter-clockwise). */
  isLeftCurve: boolean;
}

export interface ChainSegment {
  id: string;
  from: Point2D;
  to: Point2D;
  /** Present when this segment is a circular arc rather than a straight line. */
  curve?: ArcGeometry;
}

export interface OrderedChain {
  /** Segments oriented head-to-tail. */
  segments: ChainSegment[];
  /** True when the chain returns to its first vertex. */
  closed: boolean;
}

export type OffsetEntitySegment =
  | { kind: 'line'; from: Point2D; to: Point2D }
  | {
      kind: 'arc';
      from: Point2D;
      to: Point2D;
      center: Point2D;
      radius: number;
      centralAngle: number;
      isLeftCurve: boolean;
    }
  | { kind: 'circle'; center: Point2D; radius: number };

export interface OffsetChainResult {
  segments: OffsetEntitySegment[];
  closed: boolean;
}

export interface ArcSource {
  radius: number;
  arcLength: number;
  /** Known center (e.g. DXF arcs) — preferred over bearing reconstruction. */
  center?: Point2D;
  curveDirection?: 'left' | 'right';
  tangentBearing?: string;
  chordBearing?: string;
  bearing?: string;
}

const EPSILON = 1e-9;
const NODE_PRECISION = 1000; // match endpoints within 0.001 world unit
const TWO_PI = Math.PI * 2;

function nodeKey(p: Point2D): string {
  return `${Math.round(p.x * NODE_PRECISION)}:${Math.round(p.y * NODE_PRECISION)}`;
}

function normalizeAngle(a: number): number {
  let n = a % TWO_PI;
  if (n < 0) n += TWO_PI;
  return n;
}

function reverseSegment(s: ChainSegment): ChainSegment {
  const curve = s.curve
    ? {
        ...s.curve,
        startAngle: s.curve.endAngle,
        endAngle: s.curve.startAngle,
        isLeftCurve: !s.curve.isLeftCurve,
      }
    : undefined;
  return { ...s, from: s.to, to: s.from, curve };
}

/**
 * Reconstructs an arc's center/angles from the SurveyLine fields used by the
 * drawing model (radius, arc length, direction, tangent/chord bearings).
 * Mirrors the geometry resolution used by hit-testing and rendering.
 */
export function resolveArcGeometry(p1: Point2D, p2: Point2D, source: ArcSource): ArcGeometry | null {
  const radius = source.radius;
  if (!(radius > EPSILON) || !(source.arcLength > EPSILON)) return null;
  const centralAngle = source.arcLength / radius;
  if (!(centralAngle > EPSILON) || centralAngle > TWO_PI + 1e-6) return null;

  let isLeftCurve = source.curveDirection === 'left';
  if (source.curveDirection !== 'left' && source.curveDirection !== 'right') {
    if (source.center) {
      // Pick the direction whose sweep matches the known arc length; the
      // endpoint cross product alone cannot tell a minor arc from a major arc.
      const a1 = Math.atan2(p1.y - source.center.y, p1.x - source.center.x);
      const a2 = Math.atan2(p2.y - source.center.y, p2.x - source.center.x);
      const ccwSweep = normalizeAngle(a2 - a1);
      isLeftCurve = Math.abs(ccwSweep - centralAngle) <= Math.abs(TWO_PI - ccwSweep - centralAngle);
    } else {
      const tempTangent = source.tangentBearing ? parseBearingToRadians(source.tangentBearing) : null;
      if (tempTangent !== null) {
        const dirBearingStr = source.chordBearing || source.bearing;
        if (dirBearingStr) {
          const dirRad = parseBearingToRadians(dirBearingStr);
          if (dirRad !== null) {
            const halfDelta = centralAngle / 2;
            const expectedRightChord = normalizeAngle(tempTangent + halfDelta);
            const expectedLeftChord = normalizeAngle(tempTangent - halfDelta);
            const dirNorm = normalizeAngle(dirRad);
            const diffRight = Math.min(
              Math.abs(dirNorm - expectedRightChord),
              TWO_PI - Math.abs(dirNorm - expectedRightChord),
            );
            const diffLeft = Math.min(
              Math.abs(dirNorm - expectedLeftChord),
              TWO_PI - Math.abs(dirNorm - expectedLeftChord),
            );
            if (diffLeft < diffRight) isLeftCurve = true;
          }
        }
      }
    }
  }

  if (source.center) {
    const startAngle = Math.atan2(p1.y - source.center.y, p1.x - source.center.x);
    const endAngle = isLeftCurve ? startAngle + centralAngle : startAngle - centralAngle;
    return {
      center: source.center,
      radius,
      startAngle,
      endAngle,
      centralAngle,
      isLeftCurve,
    };
  }

  // Endpoints are authoritative (same as canvas hit-testing/rendering); the
  // stored chord/tangent bearings are only a fallback for degenerate chords.
  let chordRad: number | null = null;
  const dE = p2.x - p1.x;
  const dN = p2.y - p1.y;
  if (Math.hypot(dE, dN) > 1e-4) {
    chordRad = normalizeAngle(Math.atan2(dE, dN));
  }
  if (chordRad === null) {
    const chordStr = source.chordBearing || source.bearing;
    if (chordStr) {
      chordRad = parseBearingToRadians(chordStr);
    }
  }

  const signedDelta = isLeftCurve ? -centralAngle : centralAngle;
  const tangentAngle = chordRad !== null
    ? chordRad - signedDelta / 2
    : (source.tangentBearing ? parseBearingToRadians(source.tangentBearing) : null);
  if (tangentAngle === null) return null;

  const canvasTangentAngle = Math.PI / 2 - tangentAngle;
  const centerOffsetAngle = isLeftCurve
    ? canvasTangentAngle + Math.PI / 2
    : canvasTangentAngle - Math.PI / 2;
  const center = {
    x: p1.x + radius * Math.cos(centerOffsetAngle),
    y: p1.y + radius * Math.sin(centerOffsetAngle),
  };
  const startAngle = Math.atan2(p1.y - center.y, p1.x - center.x);
  const endAngle = isLeftCurve ? startAngle + centralAngle : startAngle - centralAngle;

  return { center, radius, startAngle, endAngle, centralAngle, isLeftCurve };
}

/**
 * Orders every segment connected to `seedId` head-to-tail. Walks forward from
 * the seed's `to` endpoint, then backward from its `from` endpoint. A branch
 * stops the walk, so the result is the contiguous path through the seed.
 */
export function orderConnectedChain(seedId: string, segments: ChainSegment[]): OrderedChain | null {
  const seed = segments.find(s => s.id === seedId);
  if (!seed) return null;

  const used = new Set<string>([seed.id]);
  const chain: ChainSegment[] = [seed];

  const neighboursAt = (key: string): ChainSegment[] =>
    segments.filter(s => !used.has(s.id) && (nodeKey(s.from) === key || nodeKey(s.to) === key));

  const startKey = nodeKey(seed.from);
  let endKey = nodeKey(seed.to);
  let closed = startKey === endKey;

  while (!closed) {
    const candidates = neighboursAt(endKey);
    if (candidates.length !== 1) break;
    const next = candidates[0];
    const oriented = nodeKey(next.from) === endKey ? next : reverseSegment(next);
    used.add(next.id);
    chain.push(oriented);
    endKey = nodeKey(oriented.to);
    if (endKey === startKey) closed = true;
  }

  if (!closed) {
    let start = nodeKey(chain[0].from);
    while (true) {
      const candidates = neighboursAt(start);
      if (candidates.length !== 1) break;
      const prev = candidates[0];
      const oriented = nodeKey(prev.to) === start ? prev : reverseSegment(prev);
      used.add(prev.id);
      chain.unshift(oriented);
      start = nodeKey(oriented.from);
      if (start === endKey) {
        closed = true;
        break;
      }
    }
  }

  return { segments: chain, closed };
}

function intersectInfiniteLines(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D): Point2D | null {
  const rx = a2.x - a1.x;
  const ry = a2.y - a1.y;
  const sx = b2.x - b1.x;
  const sy = b2.y - b1.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < EPSILON) return null;
  const t = ((b1.x - a1.x) * sy - (b1.y - a1.y) * sx) / denom;
  return { x: a1.x + t * rx, y: a1.y + t * ry };
}

function intersectLineCircle(a1: Point2D, a2: Point2D, center: Point2D, radius: number): Point2D[] {
  const dx = a2.x - a1.x;
  const dy = a2.y - a1.y;
  const a = dx * dx + dy * dy;
  if (a < EPSILON) return [];
  const fx = a1.x - center.x;
  const fy = a1.y - center.y;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < -1e-9) return [];
  const root = Math.sqrt(Math.max(0, disc));
  return [(-b + root) / (2 * a), (-b - root) / (2 * a)].map(t => ({
    x: a1.x + t * dx,
    y: a1.y + t * dy,
  }));
}

function intersectCircles(c1: Point2D, r1: number, c2: Point2D, r2: number): Point2D[] {
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const d = Math.hypot(dx, dy);
  if (d < EPSILON || d > r1 + r2 + 1e-9 || d < Math.abs(r1 - r2) - 1e-9) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - a * a;
  if (h2 < -1e-9) return [];
  const h = Math.sqrt(Math.max(0, h2));
  const mx = c1.x + (a * dx) / d;
  const my = c1.y + (a * dy) / d;
  const ox = (-dy / d) * h;
  const oy = (dx / d) * h;
  return [
    { x: mx + ox, y: my + oy },
    { x: mx - ox, y: my - oy },
  ];
}

type Primitive =
  | { kind: 'line'; from: Point2D; to: Point2D }
  | {
      kind: 'arc';
      from: Point2D;
      to: Point2D;
      center: Point2D;
      radius: number;
      isLeftCurve: boolean;
      originalCentralAngle: number;
    };

function intersectPrimitives(a: Primitive, b: Primitive): Point2D[] {
  if (a.kind === 'line' && b.kind === 'line') {
    const p = intersectInfiniteLines(a.from, a.to, b.from, b.to);
    return p ? [p] : [];
  }
  if (a.kind === 'line' && b.kind === 'arc') {
    return intersectLineCircle(a.from, a.to, b.center, b.radius);
  }
  if (a.kind === 'arc' && b.kind === 'line') {
    return intersectLineCircle(b.from, b.to, a.center, a.radius);
  }
  if (a.kind === 'arc' && b.kind === 'arc') {
    return intersectCircles(a.center, a.radius, b.center, b.radius);
  }
  return [];
}

function nearestPoint(candidates: Point2D[], target: Point2D): Point2D {
  let best = candidates[0];
  let bestDist = Math.hypot(best.x - target.x, best.y - target.y);
  for (let i = 1; i < candidates.length; i++) {
    const dist = Math.hypot(candidates[i].x - target.x, candidates[i].y - target.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidates[i];
    }
  }
  return best;
}

function determineSide(seed: ChainSegment, sidePoint: Point2D): 1 | -1 {
  if (seed.curve) {
    const inside = Math.hypot(sidePoint.x - seed.curve.center.x, sidePoint.y - seed.curve.center.y) < seed.curve.radius;
    const leftIsInside = seed.curve.isLeftCurve;
    return inside === leftIsInside ? 1 : -1;
  }
  const sdx = seed.to.x - seed.from.x;
  const sdy = seed.to.y - seed.from.y;
  const cross = sdx * (sidePoint.y - seed.from.y) - sdy * (sidePoint.x - seed.from.x);
  return cross >= 0 ? 1 : -1;
}

/**
 * Builds the mitered parallel of an ordered chain. `sidePoint` is the point
 * the user clicked to choose a side; it only needs to be off the seed line.
 * Returns null when the distance or a segment is degenerate.
 */
export function offsetOrderedChain(
  chain: OrderedChain,
  distance: number,
  sidePoint: Point2D,
  seedId: string,
): OffsetChainResult | null {
  if (!(distance > 0) || chain.segments.length === 0) return null;

  const seed = chain.segments.find(s => s.id === seedId) ?? chain.segments[0];
  const side = determineSide(seed, sidePoint);

  const primitives: Primitive[] = [];
  for (const seg of chain.segments) {
    if (seg.curve) {
      const radiusDelta = (seg.curve.isLeftCurve ? -1 : 1) * distance * side;
      const radius = seg.curve.radius + radiusDelta;
      if (!(radius > 1e-6)) return null;
      primitives.push({
        kind: 'arc',
        from: {
          x: seg.curve.center.x + radius * Math.cos(seg.curve.startAngle),
          y: seg.curve.center.y + radius * Math.sin(seg.curve.startAngle),
        },
        to: {
          x: seg.curve.center.x + radius * Math.cos(seg.curve.endAngle),
          y: seg.curve.center.y + radius * Math.sin(seg.curve.endAngle),
        },
        center: seg.curve.center,
        radius,
        isLeftCurve: seg.curve.isLeftCurve,
        originalCentralAngle: seg.curve.centralAngle,
      });
    } else {
      const dx = seg.to.x - seg.from.x;
      const dy = seg.to.y - seg.from.y;
      const len = Math.hypot(dx, dy);
      if (len < EPSILON) return null;
      const nx = (-dy / len) * distance * side;
      const ny = (dx / len) * distance * side;
      primitives.push({
        kind: 'line',
        from: { x: seg.from.x + nx, y: seg.from.y + ny },
        to: { x: seg.to.x + nx, y: seg.to.y + ny },
      });
    }
  }

  const n = primitives.length;
  const applyJoint = (prevIndex: number, currIndex: number, originalJoint: Point2D) => {
    const prev = primitives[prevIndex];
    const curr = primitives[currIndex];
    const candidates = intersectPrimitives(prev, curr);
    const joint = candidates.length > 0
      ? nearestPoint(candidates, originalJoint)
      : {
          x: (prev.to.x + curr.from.x) / 2,
          y: (prev.to.y + curr.from.y) / 2,
        };
    prev.to = joint;
    curr.from = joint;
  };

  if (chain.closed && n > 1) {
    for (let i = 0; i < n; i++) {
      applyJoint((i - 1 + n) % n, i, chain.segments[i].from);
    }
  } else if (!chain.closed) {
    for (let i = 1; i < n; i++) {
      applyJoint(i - 1, i, chain.segments[i].from);
    }
  }

  const segments: OffsetEntitySegment[] = [];
  for (const p of primitives) {
    if (p.kind === 'line') {
      if (Math.hypot(p.to.x - p.from.x, p.to.y - p.from.y) < 1e-6) continue;
      segments.push({ kind: 'line', from: p.from, to: p.to });
      continue;
    }

    const startAngle = Math.atan2(p.from.y - p.center.y, p.from.x - p.center.x);
    const endAngle = Math.atan2(p.to.y - p.center.y, p.to.x - p.center.x);
    let sweep = p.isLeftCurve
      ? normalizeAngle(endAngle - startAngle)
      : normalizeAngle(startAngle - endAngle);
    const altSweep = TWO_PI - sweep;
    if (Math.abs(altSweep - p.originalCentralAngle) < Math.abs(sweep - p.originalCentralAngle)) {
      sweep = altSweep;
    }
    if (!(sweep > EPSILON)) continue;
    segments.push({
      kind: 'arc',
      from: p.from,
      to: p.to,
      center: p.center,
      radius: p.radius,
      centralAngle: sweep,
      isLeftCurve: p.isLeftCurve,
    });
  }

  return { segments, closed: chain.closed };
}

/** New radius for a full circle offset toward the side the user clicked. */
export function offsetCircleRadius(
  center: Point2D,
  radius: number,
  distance: number,
  sidePoint: Point2D,
): number | null {
  if (!(radius > 0) || !(distance > 0)) return null;
  const outside = Math.hypot(sidePoint.x - center.x, sidePoint.y - center.y) >= radius;
  const next = outside ? radius + distance : radius - distance;
  return next > 1e-6 ? next : null;
}
