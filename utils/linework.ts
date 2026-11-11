/**
 * Deterministic linework ordering for the Civil Drafter.
 *
 * WHY THIS EXISTS
 * ----------------
 * Ordering a set of survey shots into a clean, non-crossing polyline (e.g. the
 * top-of-bank line running down one side of a stream) is a *geometry* problem,
 * not a language problem. Asking the LLM to emit the point sequence directly is
 * both unreliable (it produces "sawtooth" polylines that zigzag back and forth
 * across a corridor) and expensive (it spends its whole output budget listing
 * point numbers in prose).
 *
 * Instead the Civil Drafter only has to CLASSIFY points into feature groups
 * ("chains") — which bank, which bench — and this module deterministically
 * ORDERS each group into a smooth polyline on the client.
 *
 * ALGORITHM
 * ----------
 * A single bank / edge / bench line is a corridor feature: the points run
 * generally along one dominant direction. We recover that direction with a
 * 2-D principal-component analysis (PCA) of the group, project every point
 * onto the principal axis, and sort by that projection. This yields a
 * monotonic march along the feature with no cross-corridor zigzag, regardless
 * of the order the surveyor collected the shots in.
 *
 * For strongly meandering features PCA projection can still misorder a few
 * points, so after the PCA sort we run one light nearest-neighbour refinement
 * pass seeded at the PCA-first point. NN alone is unreliable (it can jump
 * across the corridor on noisy data); seeding it with the PCA order keeps it
 * stable.
 */

export interface OrderablePoint {
  pointNumber: string;
  easting: number;
  northing: number;
}

/** Mean easting/northing of a group. */
function centroid(pts: OrderablePoint[]): { e: number; n: number } {
  let e = 0;
  let n = 0;
  for (const p of pts) {
    e += p.easting;
    n += p.northing;
  }
  return { e: e / pts.length, n: n / pts.length };
}

/**
 * Principal axis (unit vector) of a point group via the 2x2 covariance
 * matrix's dominant eigenvector. Returns the direction of greatest variance.
 */
function principalAxis(pts: OrderablePoint[]): { ux: number; uy: number } {
  const c = centroid(pts);
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of pts) {
    const dx = p.easting - c.e;
    const dy = p.northing - c.n;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  // Eigenvector of the larger eigenvalue of [[sxx, sxy],[sxy, syy]].
  // Closed form for a symmetric 2x2 matrix.
  const trace = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
  const lambda = trace / 2 + disc; // larger eigenvalue
  let ux: number;
  let uy: number;
  if (Math.abs(sxy) > 1e-9) {
    ux = lambda - syy;
    uy = sxy;
  } else {
    // Diagonal covariance: axis is whichever of E/N has more spread.
    if (sxx >= syy) {
      ux = 1;
      uy = 0;
    } else {
      ux = 0;
      uy = 1;
    }
  }
  const mag = Math.hypot(ux, uy) || 1;
  return { ux: ux / mag, uy: uy / mag };
}

/**
 * Order a group of points along their dominant axis (PCA projection), then run
 * one nearest-neighbour refinement seeded at the PCA-first point.
 *
 * @returns the point numbers in drawing order. Input order is preserved for
 *          groups of fewer than 3 points (nothing to reorder).
 */
export function orderPointsAlongFeature(points: OrderablePoint[]): string[] {
  if (points.length < 3) return points.map(p => p.pointNumber);

  const { ux, uy } = principalAxis(points);
  const c = centroid(points);

  // Sort by signed projection onto the principal axis.
  const pcaSorted = [...points].sort((a, b) => {
    const pa = (a.easting - c.e) * ux + (a.northing - c.n) * uy;
    const pb = (b.easting - c.e) * ux + (b.northing - c.n) * uy;
    return pa - pb;
  });

  // Nearest-neighbour refinement seeded at the PCA-first point. This fixes
  // local misordering on meandering features while the PCA seed prevents the
  // classic NN cross-corridor jump.
  const remaining = pcaSorted.slice();
  const ordered: OrderablePoint[] = [remaining.shift()!];
  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = Math.hypot(remaining[i].easting - last.easting, remaining[i].northing - last.northing);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }

  return ordered.map(p => p.pointNumber);
}

/** Survey shots on one bound should be close enough to connect into one line. */
export const MAX_SHOT_GAP_FT = 150;
const MIN_SHOT_GAP_FT = 75;

type Point2D = { easting: number; northing: number };

/** Median straight-line distance between consecutive points in an ordered chain. */
export function medianShotGap(points: ReadonlyArray<Point2D>): number {
  if (points.length < 2) return 0;
  const gaps: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const gap = Math.hypot(
      points[i].easting - points[i - 1].easting,
      points[i].northing - points[i - 1].northing,
    );
    if (Number.isFinite(gap) && gap > 0.25) gaps.push(gap);
  }
  if (gaps.length === 0) return 0;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

/**
 * Adaptive observation-spacing limit. A shot 3x farther than the typical
 * spacing on the same bound, or more than 150 ft from its neighbour, is not a
 * bound connection a surveyor would have observed in one line. Never return
 * less than 75 ft so a sparse but plausible chain still draws.
 */
export function shotGapLimit(points: ReadonlyArray<Point2D>): number {
  const median = medianShotGap(points);
  if (median <= 0) return MAX_SHOT_GAP_FT;
  return Math.min(MAX_SHOT_GAP_FT, Math.max(MIN_SHOT_GAP_FT, median * 3));
}

/** Split an ordered shot chain at gaps no surveyor would connect in one bound. */
export function splitChainsAtGaps<T extends Point2D>(
  points: T[],
  maxGapFt?: number,
): T[][] {
  if (points.length === 0) return [];
  if (points.length === 1) return [points.slice()];
  const limit = maxGapFt ?? shotGapLimit(points);
  const runs: T[][] = [];
  let current: T[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const gap = Math.hypot(
      points[i].easting - points[i - 1].easting,
      points[i].northing - points[i - 1].northing,
    );
    if (gap > limit) {
      runs.push(current);
      current = [points[i]];
    } else {
      current.push(points[i]);
    }
  }
  runs.push(current);
  return runs;
}

/** Sum of the straight-line steps in a chain. */
export function chainRunLength(points: ReadonlyArray<Point2D>): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(
      points[i].easting - points[i - 1].easting,
      points[i].northing - points[i - 1].northing,
    );
  }
  return length;
}

/** The dominant contiguous run from a set of gap-split runs. */
export function longestChainRun<T extends Point2D>(runs: T[][]): T[] {
  let best: T[] = [];
  let bestLength = -1;
  for (const run of runs) {
    const length = chainRunLength(run);
    if (
      length > bestLength + 1e-9 ||
      (Math.abs(length - bestLength) <= 1e-9 && run.length > best.length)
    ) {
      best = run;
      bestLength = length;
    }
  }
  return best;
}

function orientation(a: Point2D, b: Point2D, c: Point2D): number {
  return (b.easting - a.easting) * (c.northing - a.northing)
    - (b.northing - a.northing) * (c.easting - a.easting);
}

function segmentsProperlyIntersect(
  a: Point2D,
  b: Point2D,
  c: Point2D,
  d: Point2D,
): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

/** True when two polylines properly cross (shared endpoints do not count). */
export function polylinesCross(
  a: ReadonlyArray<Point2D>,
  b: ReadonlyArray<Point2D>,
): boolean {
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) {
      if (segmentsProperlyIntersect(a[i], a[i + 1], b[j], b[j + 1])) return true;
    }
  }
  return false;
}

/** True when a polyline crosses itself. */
export function polylineSelfIntersects(
  points: ReadonlyArray<Point2D>,
  isClosed = false,
): boolean {
  const n = points.length;
  if (n < 4) return false;
  const segmentCount = isClosed ? n : n - 1;
  for (let i = 0; i < segmentCount; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    for (let j = i + 1; j < segmentCount; j++) {
      if (j === i + 1) continue;
      if (isClosed && i === 0 && j === segmentCount - 1) continue;
      const c = points[j];
      const d = points[(j + 1) % n];
      if (segmentsProperlyIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

/**
 * Split an ordered chain wherever the next segment would cross an earlier
 * segment. The crossing segment is omitted rather than drawn, so each returned
 * run is a simple, non-self-intersecting bound.
 */
export function splitChainsAtCrossings<T extends Point2D>(points: T[]): T[][] {
  if (points.length < 4) return points.length ? [points] : [];
  const runs: T[][] = [];
  let current: T[] = [points[0]];
  const emitted: Array<[T, T]> = [];
  for (let i = 1; i < points.length; i++) {
    const next = points[i];
    const previous = current[current.length - 1];
    const gap = Math.hypot(
      next.easting - previous.easting,
      next.northing - previous.northing,
    );
    if (gap < 0.25) continue;
    const crosses = emitted.some(([a, b]) =>
      segmentsProperlyIntersect(a, b, previous, next),
    );
    if (crosses) {
      if (current.length >= 2) runs.push(current);
      current = [next];
      continue;
    }
    current.push(next);
    emitted.push([previous, next]);
  }
  if (current.length >= 2) runs.push(current);
  return runs;
}

export interface DrafterChain {
  polylineId?: string;
  layer?: string;
  lineType?: string;
  isClosed?: boolean;
  pointNumbers: string[];
}

export interface WidthOffsetPoint extends OrderablePoint {
  elevation?: number;
  description?: string;
}

export interface WidthOffsetResult {
  chains: DrafterChain[];
  points: WidthOffsetPoint[];
}

const WIDTH_CODE_PATTERN = /(\d+(?:\.\d+)?)\s*W\b/i;
const CENTERLINE_CODE_PATTERN = /(?:^|[\s/_-])(?:CL|CENTER(?:LINE|\s+LINE)?)(?:[\s/_-]|$)/i;

/**
 * Converts chains whose survey descriptions identify a centerline and total
 * width into two offset edge chains. The centerline is construction geometry
 * only and is not returned in the resulting chains.
 */
export function expandWidthCodedChains(
  chains: DrafterChain[],
  lookup: (pointNumber: string) => WidthOffsetPoint | undefined,
): WidthOffsetResult {
  const generatedPoints: WidthOffsetPoint[] = [];
  const expanded: DrafterChain[] = [];
  let sequence = 0;

  for (const chain of chains) {
    const sourcePoints = (chain.pointNumbers ?? [])
      .map(pointNumber => lookup(String(pointNumber)))
      .filter((point): point is WidthOffsetPoint => Boolean(point));
    const widths = sourcePoints
      .filter(point => CENTERLINE_CODE_PATTERN.test(point.description ?? ''))
      .map(point => Number((point.description ?? '').match(WIDTH_CODE_PATTERN)?.[1]))
      .filter(width => Number.isFinite(width) && width > 0);
    const width = widths.length > 0 && widths.every(value => Math.abs(value - widths[0]) < 1e-9)
      ? widths[0]
      : undefined;

    if (!width || sourcePoints.length < 2) {
      expanded.push(chain);
      continue;
    }

    const ordered = orderPointsAlongFeature(sourcePoints);
      const orderedPoints = ordered.map(pointNumber => lookup(pointNumber)).filter(
        (point): point is WidthOffsetPoint => Boolean(point),
      );
    const halfWidth = width / 2;
    const leftNumbers: string[] = [];
    const rightNumbers: string[] = [];
    const id = chain.polylineId ?? `width-feature-${sequence}`;
    sequence++;

    orderedPoints.forEach((point, index) => {
      const previous = orderedPoints[Math.max(0, index - 1)];
      const next = orderedPoints[Math.min(orderedPoints.length - 1, index + 1)];
      const tangentE = next.easting - previous.easting;
      const tangentN = next.northing - previous.northing;
      const length = Math.hypot(tangentE, tangentN) || 1;
      const leftE = -tangentN / length;
      const leftN = tangentE / length;
      const base = `__WIDTH_${id}_${index}`;
      const leftNumber = `${base}_L`;
      const rightNumber = `${base}_R`;
      generatedPoints.push(
        {
          pointNumber: leftNumber,
          easting: point.easting + leftE * halfWidth,
          northing: point.northing + leftN * halfWidth,
          elevation: point.elevation,
          description: `OFFSET EDGE LEFT ${width}W`,
        },
        {
          pointNumber: rightNumber,
          easting: point.easting - leftE * halfWidth,
          northing: point.northing - leftN * halfWidth,
          elevation: point.elevation,
          description: `OFFSET EDGE RIGHT ${width}W`,
        },
      );
      leftNumbers.push(leftNumber);
      rightNumbers.push(rightNumber);
    });

    expanded.push(
      { ...chain, polylineId: `${id}-left`, pointNumbers: leftNumbers },
      { ...chain, polylineId: `${id}-right`, pointNumbers: rightNumbers },
    );
  }

  return { chains: expanded, points: generatedPoints };
}

export interface ChainPointMetadata {
  easting: number;
  northing: number;
  description?: string;
}

type BankCode = 'TB' | 'BB' | 'TOE' | 'FLOW' | 'EW' | 'GB';

interface BankCodeInfo {
  key: string;
  base: BankCode;
  island: boolean;
}

/** Normalize common field variants without conflating separate bank steps. */
function bankCode(description: string | undefined): BankCodeInfo | undefined {
  const compact = (description ?? '').toUpperCase().trim();
  if (!compact) return undefined;
  const tokens = compact.split(/[\s/,+&_.-]+/).filter(Boolean);
  const joined = tokens.join('');
  const island = tokens.includes('I') || tokens.includes('ISLAND')
    || /^(?:TB|BB|TOE|BOB)I(?:SLAND)?$/.test(joined);

  let base: BankCode | undefined;
  let index = '';
  for (const [tokenIndex, token] of tokens.entries()) {
    const match = token.match(/^(TB|TBI|TOB|BB|BBI|BOB|TOE|FL|FLOW|EW|GB)(\d*)$/);
    if (!match) continue;
    const raw = match[1];
    index = match[2] || (/^\d+$/.test(tokens[tokenIndex + 1] ?? '') ? tokens[tokenIndex + 1] : '');
    if (raw === 'TB' || raw === 'TBI' || raw === 'TOB') base = 'TB';
    else if (raw === 'BB' || raw === 'BBI' || raw === 'BOB') base = 'BB';
    else if (raw === 'TOE') base = 'TOE';
    else if (raw === 'FL' || raw === 'FLOW') base = 'FLOW';
    else if (raw === 'EW') base = 'EW';
    else if (raw === 'GB') base = 'GB';
    break;
  }
  if (!base) return undefined;
  return { key: `${base}${index}${island ? '-ISLAND' : ''}`, base, island };
}

function clusterByCrossCorridorOffset(points: OrderablePoint[], clusterCount: number): OrderablePoint[][] {
  if (clusterCount <= 1 || points.length < clusterCount * 2) return [points];
  const axis = principalAxis(points);
  const c = centroid(points);
  const samples = points.map(point => ({
    point,
    // Dot product with the principal-axis normal: signed offset across corridor.
    offset: -(point.easting - c.e) * axis.uy + (point.northing - c.n) * axis.ux,
  })).sort((a, b) => a.offset - b.offset);

  // Deterministic 1-D k-means, seeded at evenly spaced quantiles.
  let means = Array.from({ length: clusterCount }, (_, i) => {
    const idx = Math.round(((i + 0.5) / clusterCount) * (samples.length - 1));
    return samples[idx].offset;
  });
  let assignments = new Array<number>(samples.length).fill(0);

  for (let iteration = 0; iteration < 20; iteration++) {
    const sums = new Array<number>(clusterCount).fill(0);
    const counts = new Array<number>(clusterCount).fill(0);
    for (let i = 0; i < samples.length; i++) {
      let best = 0;
      let bestDistance = Infinity;
      for (let k = 0; k < means.length; k++) {
        const distance = Math.abs(samples[i].offset - means[k]);
        if (distance < bestDistance) {
          best = k;
          bestDistance = distance;
        }
      }
      assignments[i] = best;
      sums[best] += samples[i].offset;
      counts[best]++;
    }
    const nextMeans = means.map((mean, i) => counts[i] > 0 ? sums[i] / counts[i] : mean);
    if (nextMeans.every((mean, i) => Math.abs(mean - means[i]) < 1e-7)) break;
    means = nextMeans;
  }

  const groups = Array.from({ length: clusterCount }, () => [] as OrderablePoint[]);
  samples.forEach((sample, i) => groups[assignments[i]].push(sample.point));
  return groups.every(group => group.length >= 2) ? groups : [points];
}

/**
 * Repair LLM-classified stream/channel chains using survey geometry.
 *
 * Cross-section collection makes point numbers alternate between banks. This
 * separates TB from BB (including numbered steps/islands), merges side-mixed
 * model chains, then clusters each code by cross-corridor offset. Non-bank
 * chains pass through unchanged.
 */
export function repairBankCorridorChains(
  chains: DrafterChain[],
  lookup: (pointNumber: string) => ChainPointMetadata | undefined,
  candidatePointNumbers: string[] = [],
): DrafterChain[] {
  const bankGroups = new Map<string, {
    info: BankCodeInfo;
    points: Map<string, OrderablePoint>;
    sourceChains: DrafterChain[];
  }>();
  const passthrough: DrafterChain[] = [];

  for (const chain of chains) {
    const byCode = new Map<string, { info: BankCodeInfo; points: string[] }>();
    const unmatched: string[] = [];
    for (const rawPn of chain.pointNumbers ?? []) {
      const pn = String(rawPn);
      const info = bankCode(lookup(pn)?.description);
      if (!info) {
        unmatched.push(pn);
        continue;
      }
      const entry = byCode.get(info.key) ?? { info, points: [] };
      entry.points.push(pn);
      byCode.set(info.key, entry);
    }

    if (unmatched.length > 0) passthrough.push({ ...chain, pointNumbers: unmatched });
    for (const entry of byCode.values()) {
      let group = bankGroups.get(entry.info.key);
      if (!group) {
        group = { info: entry.info, points: new Map(), sourceChains: [] };
        bankGroups.set(entry.info.key, group);
      }
      group.sourceChains.push(chain);
      for (const pn of entry.points) {
        const point = lookup(pn);
        if (point) group.points.set(pn, { pointNumber: pn, easting: point.easting, northing: point.northing });
      }
    }
  }

  for (const rawPn of candidatePointNumbers) {
    const pn = String(rawPn);
    const point = lookup(pn);
    const info = bankCode(point?.description);
    const group = info && bankGroups.get(info.key);
    if (point && group) {
      group.points.set(pn, { pointNumber: pn, easting: point.easting, northing: point.northing });
    }
  }

  const repaired: DrafterChain[] = [...passthrough];
  for (const { info, points, sourceChains } of bankGroups.values()) {
    const template = sourceChains[0] ?? { pointNumbers: [] };
    const allPoints = [...points.values()];
    // Ordinary bank codes normally have two sides. Additional model-declared
    // chains can represent benches; cap at four to reject noisy over-splitting.
    const declaredCount = new Set(sourceChains.map(chain => chain.polylineId ?? chain)).size;
    const desiredCount = info.island ? 1 : Math.min(4, Math.max(2, declaredCount));
    const strands = clusterByCrossCorridorOffset(allPoints, desiredCount);
    strands.forEach((strand, index) => {
      if (strand.length < 2) return;
      repaired.push({
        ...template,
        polylineId: `bank-${info.key.toLowerCase()}-${index + 1}`,
        isClosed: info.island ? template.isClosed : false,
        pointNumbers: strand.map(point => point.pointNumber),
      });
    });
  }
  return repaired;
}

const ROAD_EDGE_DESC_RE = /\b(EP|EOP|ER|EDGE|ES|EG|EC|ET|CURB|TBC|TC|BC|DEP|GUTTER|PAV|PVMT|SHLD|SH|ROW)\b/i;
const ROAD_EDGE_LAYER_RE = /(?:ROAD|EP|PAV|CURB|SHLD|SHOULDER|ROW)/i;
const ROAD_CL_DESC_RE = /\b(CL|CTR|CENTER|CENTERLINE)\b/i;

/**
 * Repairs a road-edge or curb chain when the model accidentally grouped both
 * opposing sides of a road corridor into a single sawtooth chain.
 *
 * Genuine single-edge chains (including curved edges and T-intersection branches)
 * have small step-to-step transverse jumps along their principal axis and pass
 * through untouched. Only chains that repeatedly jump across a cartway width
 * (>= 8 ft) between two distinct parallel offset clusters are split into left
 * and right edge chains.
 */
export function repairRoadCorridorChains(
  chains: DrafterChain[],
  lookup: (pointNumber: string) => ChainPointMetadata | undefined,
): DrafterChain[] {
  const out: DrafterChain[] = [];

  for (const chain of chains) {
    if (!chain || chain.isClosed || !Array.isArray(chain.pointNumbers) || chain.pointNumbers.length < 4) {
      out.push(chain);
      continue;
    }

    const resolved: Array<OrderablePoint & { description?: string }> = [];
    for (const rawPn of chain.pointNumbers) {
      const pn = String(rawPn);
      const meta = lookup(pn);
      if (meta && Number.isFinite(meta.easting) && Number.isFinite(meta.northing)) {
        resolved.push({
          pointNumber: pn,
          easting: meta.easting,
          northing: meta.northing,
          description: meta.description,
        });
      }
    }

    if (resolved.length < 4) {
      out.push(chain);
      continue;
    }

    const roadEdgeMatches = resolved.filter(
      p => ROAD_EDGE_DESC_RE.test(p.description ?? '') && !ROAD_CL_DESC_RE.test(p.description ?? ''),
    ).length;
    const isRoadEdgeChain =
      roadEdgeMatches >= Math.ceil(resolved.length * 0.5) ||
      (ROAD_EDGE_LAYER_RE.test(chain.layer ?? '') && !/CNTR|CENTER|CL/i.test(chain.layer ?? ''));

    if (!isRoadEdgeChain) {
      out.push(chain);
      continue;
    }

    const axis = principalAxis(resolved);
    const c = centroid(resolved);
    const projected = resolved
      .map(point => ({
        point,
        s: (point.easting - c.e) * axis.ux + (point.northing - c.n) * axis.uy,
        offset: -(point.easting - c.e) * axis.uy + (point.northing - c.n) * axis.ux,
      }))
      .sort((a, b) => a.s - b.s);

    const strands = clusterByCrossCorridorOffset(resolved, 2);
    if (strands.length !== 2 || strands[0].length < 2 || strands[1].length < 2) {
      out.push(chain);
      continue;
    }

    const meanOffset = (pts: OrderablePoint[]) =>
      pts.reduce((sum, p) => sum + (-(p.easting - c.e) * axis.uy + (p.northing - c.n) * axis.ux), 0) / pts.length;
    const mean0 = meanOffset(strands[0]);
    const mean1 = meanOffset(strands[1]);
    const separation = Math.abs(mean1 - mean0);
    if (separation < 8 || separation > 100) {
      out.push(chain);
      continue;
    }

    const strandZeroSet = new Set(strands[0].map(p => p.pointNumber));
    let crossJumps = 0;
    for (let i = 1; i < projected.length; i++) {
      const prevSide = strandZeroSet.has(projected[i - 1].point.pointNumber) ? 0 : 1;
      const currSide = strandZeroSet.has(projected[i].point.pointNumber) ? 0 : 1;
      const deltaOffset = Math.abs(projected[i].offset - projected[i - 1].offset);
      if (prevSide !== currSide && deltaOffset >= separation * 0.55) {
        crossJumps++;
      }
    }

    // Require at least 2 cross-corridor jumps (sawtooth behavior) before splitting.
    if (crossJumps < 2) {
      out.push(chain);
      continue;
    }

    const baseId = chain.polylineId || 'road-edge';
    out.push(
      {
        ...chain,
        polylineId: `${baseId}-left`,
        pointNumbers: strands[0].map(p => p.pointNumber),
      },
      {
        ...chain,
        polylineId: `${baseId}-right`,
        pointNumbers: strands[1].map(p => p.pointNumber),
      },
    );
  }

  return out;
}

export interface ExpandedChainLine {
  from: string;
  to: string;
  layer?: string;
  lineType?: string;
  polylineId?: string;
}

/**
 * Expand Civil-Drafter "chains" (classified point groups) into ordered
 * from/to line segments. Points are resolved via `lookup` (point number →
 * coordinates); unknown point numbers are dropped. Chains are ordered
 * deterministically via {@link orderPointsAlongFeature} so the LLM never has
 * to sequence points itself.
 *
 * @param chains  groups emitted by the model
 * @param lookup  point-number → {easting, northing}
 * @returns flat list of line segments ready to merge into the normal pipeline
 */
export function expandChainsToLines(
  chains: DrafterChain[],
  lookup: (pointNumber: string) => { easting: number; northing: number } | undefined,
): ExpandedChainLine[] {
  const out: ExpandedChainLine[] = [];
  for (const chain of chains) {
    if (!chain || !Array.isArray(chain.pointNumbers) || chain.pointNumbers.length < 2) continue;

    const resolved: OrderablePoint[] = [];
    for (const pn of chain.pointNumbers) {
      const key = String(pn);
      const coord = lookup(key);
      if (coord) resolved.push({ pointNumber: key, easting: coord.easting, northing: coord.northing });
    }
    if (resolved.length < 2) continue;

    const orderedPns = orderPointsAlongFeature(resolved);
    const resolvedByPn = new Map(resolved.map(p => [p.pointNumber, p]));
    const orderedPoints = orderedPns
      .map(pn => resolvedByPn.get(pn))
      .filter((p): p is OrderablePoint => Boolean(p));

    // A bound is a run of shots the crew actually observed. Gaps larger than
    // the feature's own spacing break the run instead of drawing a long line
    // across ground nobody shot. Crossings are broken for the same reason: two
    // ends of one bound must not weave through each other.
    const gapRuns = splitChainsAtGaps(orderedPoints);
    const runs = gapRuns.flatMap(run => splitChainsAtCrossings(run));
    const canClose = chain.isClosed
      && gapRuns.length === 1
      && runs.length === 1
      && !polylineSelfIntersects(orderedPoints, true);

    let runIndex = 0;
    for (const run of runs) {
      if (run.length < 2) continue;
      const runPolylineId = runIndex === 0
        ? chain.polylineId
        : `${chain.polylineId || 'chain'}-run-${runIndex + 1}`;
      for (let i = 0; i < run.length - 1; i++) {
        out.push({
          from: run[i].pointNumber,
          to: run[i + 1].pointNumber,
          layer: chain.layer,
          lineType: chain.lineType,
          polylineId: runPolylineId,
        });
      }
      // Close the ring only when the whole feature survived as one clean run.
      if (canClose && run.length > 2) {
        const first = run[0];
        const last = run[run.length - 1];
        if (first.pointNumber !== last.pointNumber) {
          out.push({
            from: last.pointNumber,
            to: first.pointNumber,
            layer: chain.layer,
            lineType: chain.lineType,
            polylineId: runPolylineId,
          });
        }
      }
      runIndex++;
    }
  }
  return out;
}
