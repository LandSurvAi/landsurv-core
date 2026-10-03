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
  for (const token of tokens) {
    const match = token.match(/^(TB|TBI|TOB|BB|BBI|BOB|TOE|FL|FLOW|EW|GB)(\d*)$/);
    if (!match) continue;
    const raw = match[1];
    index = match[2] ?? '';
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
  const assignments = new Array<number>(samples.length).fill(0);

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
    for (let i = 0; i < orderedPns.length - 1; i++) {
      out.push({
        from: orderedPns[i],
        to: orderedPns[i + 1],
        layer: chain.layer,
        lineType: chain.lineType,
        polylineId: chain.polylineId,
      });
    }
    // Close the ring if requested and it isn't already closed.
    if (chain.isClosed && orderedPns.length > 2) {
      const first = orderedPns[0];
      const last = orderedPns[orderedPns.length - 1];
      if (first !== last) {
        out.push({
          from: last,
          to: first,
          layer: chain.layer,
          lineType: chain.lineType,
          polylineId: chain.polylineId,
        });
      }
    }
  }
  return out;
}
