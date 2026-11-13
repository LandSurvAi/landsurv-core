/**
 * projectClusters — split uploaded project points into distinct locations.
 *
 * A single project file often carries more than one site: a boundary parcel,
 * a separate right-of-way corridor, a stockpile, a well pad. Estimating one
 * footprint over all of them puts the "project" somewhere in the empty space
 * between, which is the wrong answer for jurisdiction, parcel, flood, and
 * soils lookups.
 *
 * This module:
 *   1. Measures the typical point spacing (median nearest neighbour).
 *   2. Derives a linkage distance from that spacing, so a tightly shot site
 *      stays together while separate sites fall apart.
 *   3. Runs single-linkage connected components over a spatial grid.
 *   4. Assigns linework and centerline PIs to the nearest cluster.
 *   5. Estimates each cluster's footprint with `estimateProjectLocation`.
 *
 * Pure and synchronous — safe to run on every render. Jurisdiction lookups
 * (network) live in services/projectLocationService.ts.
 */

import type {
  Centerline,
  ProjectLocationCluster,
  ProjectLocationClusterSet,
  ProjectLocationJurisdiction,
  ProjectLocationEstimate,
  SurveyLine,
  SurveyPoint,
} from '../types.ts';
import { estimateProjectLocation } from './projectLocation.ts';

/**
 * Smallest gap ever used to link two points, in project units (feet). A site
 * routinely has gaps between shot groups (tree lines, road crossings, a
 * missing cul-de-sac), so gaps under about 1,500 ft are treated as the same
 * location. Genuinely separate sites are normally farther apart than this.
 */
export const MIN_CLUSTER_LINKAGE = 1_500;
/** Largest gap ever used to link two points, in project units (feet). */
export const MAX_CLUSTER_LINKAGE = 5_280;
/** Fallback linkage when spacing cannot be measured. */
export const DEFAULT_CLUSTER_LINKAGE = 2_000;

interface XY {
  easting: number;
  northing: number;
}

export interface BuildProjectLocationClustersInput {
  points?: SurveyPoint[];
  lines?: SurveyLine[];
  centerlines?: Centerline[];
  /** Project CRS. Without it clusters are still grouped but not georeferenced. */
  epsg?: number | null;
  /** Live GPS fix used when the drawing has no points or linework yet. */
  gpsFix?: { latitude: number; longitude: number } | null;
  /** Margin applied around each cluster footprint for its WGS84 bbox. */
  marginProjected?: number;
  /** Override the auto-derived linkage distance, in project units. */
  linkDistance?: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isUsablePoint(point: SurveyPoint): boolean {
  return isFiniteNumber(point.easting) && isFiniteNumber(point.northing);
}

/**
 * Median distance from each point to its nearest neighbour, measured on a
 * grid so it stays linear for large point files. Null when fewer than two
 * usable points exist.
 */
export function medianNearestNeighborDistance(points: SurveyPoint[]): number | null {
  const valid = points.filter(isUsablePoint);
  const n = valid.length;
  if (n < 2) return null;

  // Sort by easting and sweep both directions. A candidate farther east/west
  // than the best distance found so far cannot be closer, so the two sweeps
  // cover every true nearest neighbour without an O(n²) full comparison.
  const sorted = [...valid].sort((a, b) => a.easting - b.easting);
  const nearest: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let best = Infinity;
    for (let j = i + 1; j < sorted.length; j++) {
      const dx = sorted[j].easting - sorted[i].easting;
      if (dx >= best) break;
      const distance = Math.hypot(dx, sorted[j].northing - sorted[i].northing);
      if (distance < best) best = distance;
    }
    for (let j = i - 1; j >= 0; j--) {
      const dx = sorted[i].easting - sorted[j].easting;
      if (dx >= best) break;
      const distance = Math.hypot(dx, sorted[i].northing - sorted[j].northing);
      if (distance < best) best = distance;
    }
    if (Number.isFinite(best)) nearest.push(best);
  }

  if (nearest.length === 0) return null;
  nearest.sort((a, b) => a - b);
  return nearest[Math.floor(nearest.length / 2)];
}

/** Derive a defensible clustering gap from the project's point spacing. */
export function deriveClusterLinkage(points: SurveyPoint[]): number {
  const spacing = medianNearestNeighborDistance(points);
  if (spacing == null || spacing <= 0) return DEFAULT_CLUSTER_LINKAGE;
  const raw = Math.min(Math.max(spacing * 10, MIN_CLUSTER_LINKAGE), MAX_CLUSTER_LINKAGE);
  // Snap to 25 ft so the threshold stays a readable round number.
  return Math.min(Math.max(Math.round(raw / 25) * 25, MIN_CLUSTER_LINKAGE), MAX_CLUSTER_LINKAGE);
}

/** Vertices a line contributes to its cluster's footprint. */
function lineVertices(line: SurveyLine, pointMap: Map<string, SurveyPoint>): XY[] {
  const out: XY[] = [];
  const push = (easting: unknown, northing: unknown) => {
    if (isFiniteNumber(easting) && isFiniteNumber(northing)) out.push({ easting, northing });
  };

  if (line.fromPt) push(line.fromPt.x, line.fromPt.y);
  if (line.toPt) push(line.toPt.x, line.toPt.y);
  if (line.fillPath && line.fillPath.length > 0) {
    for (const vertex of line.fillPath) push(vertex.x, vertex.y);
  }
  if (line.fromPt == null && line.from) {
    const from = pointMap.get(line.from);
    if (from) push(from.easting, from.northing);
  }
  if (line.toPt == null && line.to) {
    const to = pointMap.get(line.to);
    if (to) push(to.easting, to.northing);
  }
  if (line.isCircle && line.circleCenter && isFiniteNumber(line.curveRadius)) {
    const radius = Math.abs(line.curveRadius);
    push(line.circleCenter.x - radius, line.circleCenter.y - radius);
    push(line.circleCenter.x + radius, line.circleCenter.y + radius);
  }
  return out;
}

function distanceToBox(point: XY, box: ClusterBox): number {
  const dx = Math.max(box.minEasting - point.easting, 0, point.easting - box.maxEasting);
  const dy = Math.max(box.minNorthing - point.northing, 0, point.northing - box.maxNorthing);
  return Math.hypot(dx, dy);
}

interface ClusterBox {
  minEasting: number;
  minNorthing: number;
  maxEasting: number;
  maxNorthing: number;
  center: XY;
}

function boxFor(points: XY[], pad: number): ClusterBox | null {
  if (points.length === 0) return null;
  let minEasting = Infinity;
  let minNorthing = Infinity;
  let maxEasting = -Infinity;
  let maxNorthing = -Infinity;
  for (const point of points) {
    if (point.easting < minEasting) minEasting = point.easting;
    if (point.easting > maxEasting) maxEasting = point.easting;
    if (point.northing < minNorthing) minNorthing = point.northing;
    if (point.northing > maxNorthing) maxNorthing = point.northing;
  }
  return {
    minEasting: minEasting - pad,
    minNorthing: minNorthing - pad,
    maxEasting: maxEasting + pad,
    maxNorthing: maxNorthing + pad,
    center: { easting: (minEasting + maxEasting) / 2, northing: (minNorthing + maxNorthing) / 2 },
  };
}

/**
 * Group points into single-linkage clusters. Exported separately so callers
 * that only need membership (and not footprints) can use it.
 */
export function groupPointsIntoClusters(
  points: SurveyPoint[],
  linkDistance: number,
): SurveyPoint[][] {
  const valid = points.filter(isUsablePoint);
  if (valid.length === 0) return [];
  const gap = Math.max(linkDistance, 1e-6);

  const parent = valid.map((_, index) => index);
  const find = (index: number): number => {
    let current = index;
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]];
      current = parent[current];
    }
    return current;
  };
  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };

  const bucketKey = (cx: number, cy: number) => `${cx}:${cy}`;
  const buckets = new Map<string, number[]>();
  const cells: Array<{ cx: number; cy: number }> = [];
  for (let i = 0; i < valid.length; i++) {
    const cx = Math.floor(valid[i].easting / gap);
    const cy = Math.floor(valid[i].northing / gap);
    cells.push({ cx, cy });
    const key = bucketKey(cx, cy);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(i);
    else buckets.set(key, [i]);
  }

  for (let i = 0; i < valid.length; i++) {
    const { cx, cy } = cells[i];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = buckets.get(bucketKey(cx + dx, cy + dy));
        if (!bucket) continue;
        for (const j of bucket) {
          if (j <= i) continue;
          const distance = Math.hypot(
            valid[j].easting - valid[i].easting,
            valid[j].northing - valid[i].northing,
          );
          if (distance <= gap) union(i, j);
        }
      }
    }
  }

  const groups = new Map<number, SurveyPoint[]>();
  for (let i = 0; i < valid.length; i++) {
    const root = find(i);
    const group = groups.get(root);
    if (group) group.push(valid[i]);
    else groups.set(root, [valid[i]]);
  }
  return [...groups.values()];
}

/**
 * Build the cluster set for the current drawing. Returns a cluster for
 * linework-only projects so the panel is never dead, and an empty set when
 * there is nothing to locate.
 */
export function buildProjectLocationClusters(
  input: BuildProjectLocationClustersInput = {},
): ProjectLocationClusterSet {
  const {
    points = [],
    lines = [],
    centerlines = [],
    epsg = null,
    gpsFix = null,
    marginProjected = 200,
  } = input;

  const usablePoints = points.filter(isUsablePoint);
  const linkDistance = isFiniteNumber(input.linkDistance) && input.linkDistance > 0
    ? input.linkDistance
    : deriveClusterLinkage(usablePoints);

  const warnings: string[] = [];
  if (!epsg) {
    warnings.push('No project projection (EPSG) is set — clusters are grouped, but they cannot be placed on the earth.');
  }

  const groups = groupPointsIntoClusters(usablePoints, linkDistance);
  const pointMap = new Map(usablePoints.map(point => [point.pointNumber, point]));

  // Cluster working records before linework assignment.
  const working = groups
    .map(group => {
      const box = boxFor(group.map(point => ({ easting: point.easting, northing: point.northing })), 0);
      return { points: group, box, lines: [] as SurveyLine[], centerlines: [] as Centerline[] };
    })
    .filter((record): record is { points: SurveyPoint[]; box: ClusterBox; lines: SurveyLine[]; centerlines: Centerline[] } => record.box != null);

  // A one- or two-shot group is usually a stray topo shot, not its own project.
  // Absorb it into the nearest real cluster (3+ points) within a mile, so the
  // location list does not sprout single-point "sites" beside the main work.
  const absorbDistance = 5_280;
  const majors = working.filter(record => record.points.length >= 3);
  if (majors.length > 0 && working.some(record => record.points.length < 3)) {
    const kept: typeof working = [];
    for (const record of working) {
      if (record.points.length >= 3) {
        kept.push(record);
        continue;
      }
      let best: (typeof working)[number] | null = null;
      let bestDistance = Infinity;
      for (const candidate of majors) {
        const distance = distanceToBox(record.box.center, candidate.box);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = candidate;
        }
      }
      if (best && bestDistance <= absorbDistance) {
        best.points.push(...record.points);
        const box = boxFor(
          best.points.map(point => ({ easting: point.easting, northing: point.northing })),
          0,
        );
        if (box) best.box = box;
      } else {
        kept.push(record);
      }
    }
    working.length = 0;
    working.push(...kept);
  }

  /**
   * Only linework that stays inside a cluster's own point extent (plus the
   * linkage tolerance) may contribute to that cluster. Assigning a long
   * polyline by its first vertex is what used to stretch a 10-point cluster
   * across 18,000 ft and report thousands of acres that were not there.
   */
  const locateLocal = (vertices: XY[]): (typeof working)[number] | null => {
    for (const record of working) {
      if (record.points.length < 3) continue;
      if (vertices.every(vertex => distanceToBox(vertex, record.box) <= linkDistance)) {
        return record;
      }
    }
    return null;
  };

  for (const line of lines) {
    if (line.hidden) continue;
    const vertices = lineVertices(line, pointMap);
    if (vertices.length === 0) continue;
    const target = locateLocal(vertices);
    if (target) target.lines.push(line);
  }

  for (const centerline of centerlines) {
    const pis = (centerline.pis ?? []).filter(
      pi => isFiniteNumber(pi.easting) && isFiniteNumber(pi.northing),
    );
    if (pis.length === 0) continue;
    const target = locateLocal(pis.map(pi => ({ easting: pi.easting, northing: pi.northing })));
    if (target) target.centerlines.push(centerline);
  }

  // Linework-only fallback: one drawing-wide location.
  if (working.length === 0 && (lines.length > 0 || centerlines.length > 0)) {
    const estimate = estimateProjectLocation({ lines, centerlines, epsg, marginProjected });
    if (estimate.bounds) {
      const clusters: ProjectLocationCluster[] = [{
        id: 'cluster-1',
        index: 1,
        label: 'Drawing extent',
        pointCount: 0,
        pointNumbers: [],
        estimate,
        jurisdiction: null,
      }];
      warnings.push('No survey points are loaded — the drawing extent is shown as a single location.');
      return {
        clusters,
        epsg: epsg ?? null,
        totalPoints: 0,
        linkageDistance: linkDistance,
        createdAt: Date.now(),
        warnings,
      };
    }
  }

  // Empty drawing with a live GPS fix: locate the project at the fix so the
  // CRS and jurisdiction surfaces still work before the first point is stored.
  if (working.length === 0 && gpsFix && epsg) {
    const estimate = estimateProjectLocation({ gpsFix, epsg, marginProjected });
    if (estimate.bounds) {
      return {
        clusters: [{
          id: 'cluster-1',
          index: 1,
          label: 'Current GPS fix',
          pointCount: 0,
          pointNumbers: [],
          estimate,
          jurisdiction: null,
        }],
        epsg,
        totalPoints: 0,
        linkageDistance: linkDistance,
        createdAt: Date.now(),
        warnings: [
          ...warnings,
          'No survey points are loaded — using the current GPS fix as the project location.',
        ],
      };
    }
  }

  if (working.length === 0) {
    return {
      clusters: [],
      epsg: epsg ?? null,
      totalPoints: 0,
      linkageDistance: linkDistance,
      createdAt: Date.now(),
      warnings: [...warnings, 'No survey points are loaded yet — upload or collect points to locate the project.'],
    };
  }

  // Present the largest cluster first; ties break west-to-east for stability.
  working.sort((a, b) =>
    b.points.length - a.points.length || a.box.center.easting - b.box.center.easting,
  );

  const clusters: ProjectLocationCluster[] = working.map((record, index) => {
    const estimate: ProjectLocationEstimate = estimateProjectLocation({
      points: record.points,
      lines: record.lines,
      centerlines: record.centerlines,
      epsg,
      marginProjected,
    });
    return {
      id: `cluster-${index + 1}`,
      index: index + 1,
      label: record.points.length > 0 ? `Point cluster ${index + 1}` : `Drawing extent ${index + 1}`,
      pointCount: record.points.length,
      pointNumbers: record.points.map(point => point.pointNumber),
      estimate,
      jurisdiction: null,
    };
  });

  if (clusters.length > 1) {
    warnings.push(
      `${clusters.length} separate project locations detected — each is located and queried independently. Nearby shots (within ${linkDistance.toFixed(0)} ft) are grouped into one location.`,
    );
  }
  if (clusters.some(cluster => cluster.pointCount === 1)) {
    warnings.push('A single point defines at least one cluster — treat that location as a best guess.');
  }

  return {
    clusters,
    epsg: epsg ?? null,
    totalPoints: usablePoints.length,
    linkageDistance: linkDistance,
    createdAt: Date.now(),
    warnings,
  };
}

/** Stable key for caching jurisdiction resolution against a cluster set. */
export function clusterSetSignature(set: ProjectLocationClusterSet): string {
  const parts = set.clusters.map(cluster => {
    const center = cluster.estimate.centerWgs84;
    const centerKey = center
      ? `${center.latitude.toFixed(4)},${center.longitude.toFixed(4)}`
      : cluster.estimate.center
        ? `${cluster.estimate.center.easting.toFixed(1)},${cluster.estimate.center.northing.toFixed(1)}`
        : 'none';
    return `${cluster.pointCount}:${centerKey}:${cluster.estimate.bboxWgs84?.map(value => value.toFixed(4)).join(',') ?? 'no-bbox'}`;
  });
  return `${set.epsg ?? 'no-epsg'}|${set.totalPoints}|${parts.join(';')}`;
}

/** One line per cluster, for chat answers and CACP payloads. */
export function describeProjectLocationClusters(set: ProjectLocationClusterSet): string {
  if (set.clusters.length === 0) {
    return 'No project points are loaded yet — upload a point file, then ask again.';
  }
  const header = `${set.clusters.length === 1 ? '1 project location' : `${set.clusters.length} project locations`} from ${set.totalPoints.toLocaleString()} point${set.totalPoints === 1 ? '' : 's'}${set.epsg ? ` (EPSG:${set.epsg})` : ' (no projection)'}:`;
  const rows = set.clusters.map(cluster => {
    const jurisdiction = cluster.jurisdiction?.label ?? 'jurisdiction pending';
    const center = cluster.estimate.centerWgs84
      ? `${cluster.estimate.centerWgs84.latitude.toFixed(6)}, ${cluster.estimate.centerWgs84.longitude.toFixed(6)}`
      : cluster.estimate.center
        ? `N ${cluster.estimate.center.northing.toFixed(2)}, E ${cluster.estimate.center.easting.toFixed(2)}`
        : 'no centre';
    const area = cluster.estimate.areaAcres > 0 ? `, ${cluster.estimate.areaAcres.toFixed(2)} ac` : '';
    return `${cluster.index}. ${jurisdiction} — ${cluster.pointCount.toLocaleString()} points${area} · centre ${center}`;
  });
  return [header, ...rows].join('\n');
}

/** Jurisdiction line for a cluster card; degrades cleanly when unresolved. */
export function clusterJurisdictionLabel(
  cluster: ProjectLocationCluster,
  jurisdiction?: ProjectLocationJurisdiction | null,
): string {
  const resolved = jurisdiction ?? cluster.jurisdiction;
  if (resolved?.label) return resolved.label;
  if (!cluster.estimate.centerWgs84) return 'Set the project projection to resolve state, county, and municipality.';
  return 'Resolving state / county / municipality…';
}
