import {
  SurveyLine,
  SteepSlopeBand,
  SteepSlopeComponentSummary,
  SteepSlopeRunResult,
  SteepSlopeRunSettings,
  SteepSlopeTriangleSummary,
  TinSurface,
} from '../types.ts';

interface TriangleMetrics {
  triangleIndex: number;
  slopePercent: number;
  minElevation: number;
  maxElevation: number;
  centroidX: number;
  centroidY: number;
  centroidZ: number;
  gradX: number;
  gradY: number;
  bandId: string | null;
}

interface ComponentBuild {
  id: string;
  triangleIndices: number[];
  minElevation: number;
  maxElevation: number;
  verticalSpan: number;
  linearSpan: number;
  kept: boolean;
}

const DEFAULT_BANDS: SteepSlopeBand[] = [
  { id: 'ss-0-15', minPercent: 0, maxPercent: 15, color: '#10b981', layerName: 'SS_0_15' },
  { id: 'ss-15-30', minPercent: 15, maxPercent: 30, color: '#f59e0b', layerName: 'SS_15_30' },
  { id: 'ss-30-plus', minPercent: 30, maxPercent: Number.POSITIVE_INFINITY, color: '#ef4444', layerName: 'SS_30_PLUS' },
];

const EPSILON = 1e-9;

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function classifyBand(slopePercent: number, bands: SteepSlopeBand[]): string | null {
  for (const band of bands) {
    if (slopePercent >= band.minPercent && slopePercent < band.maxPercent) {
      return band.id;
    }
  }

  if (bands.length > 0 && slopePercent === bands[bands.length - 1].maxPercent) {
    return bands[bands.length - 1].id;
  }

  return null;
}

function computeTriangleSlopeData(tin: TinSurface, triangle: [number, number, number]): { slopePercent: number; gradX: number; gradY: number } {
  const [ia, ib, ic] = triangle;
  const a = tin.vertices[ia];
  const b = tin.vertices[ib];
  const c = tin.vertices[ic];

  const ux = b.easting - a.easting;
  const uy = b.northing - a.northing;
  const uz = b.elevation - a.elevation;

  const vx = c.easting - a.easting;
  const vy = c.northing - a.northing;
  const vz = c.elevation - a.elevation;

  // Normal of triangle plane from cross product u x v.
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;

  if (Math.abs(nz) < EPSILON) {
    return { slopePercent: Number.POSITIVE_INFINITY, gradX: 0, gradY: 0 };
  }

  const dzdx = -nx / nz;
  const dzdy = -ny / nz;
  const riseOverRun = Math.hypot(dzdx, dzdy);
  const gradMag = Math.hypot(dzdx, dzdy);

  if (gradMag < EPSILON) {
    return { slopePercent: riseOverRun * 100, gradX: 0, gradY: 0 };
  }

  return {
    slopePercent: riseOverRun * 100,
    gradX: dzdx / gradMag,
    gradY: dzdy / gradMag,
  };
}

function computeTriangleMetrics(tin: TinSurface, bands: SteepSlopeBand[]): TriangleMetrics[] {
  return tin.triangles.map((triangle, triangleIndex) => {
    const [ia, ib, ic] = triangle;
    const va = tin.vertices[ia];
    const vb = tin.vertices[ib];
    const vc = tin.vertices[ic];
    const za = va.elevation;
    const zb = vb.elevation;
    const zc = vc.elevation;
    const minElevation = Math.min(za, zb, zc);
    const maxElevation = Math.max(za, zb, zc);
    const slopeData = computeTriangleSlopeData(tin, triangle);
    const slopePercent = slopeData.slopePercent;
    const bandId = classifyBand(slopePercent, bands);

    return {
      triangleIndex,
      slopePercent,
      minElevation,
      maxElevation,
      centroidX: (va.easting + vb.easting + vc.easting) / 3,
      centroidY: (va.northing + vb.northing + vc.northing) / 3,
      centroidZ: (za + zb + zc) / 3,
      gradX: slopeData.gradX,
      gradY: slopeData.gradY,
      bandId,
    };
  });
}

function buildTriangleAdjacency(tin: TinSurface): Map<number, Set<number>> {
  const adjacency = new Map<number, Set<number>>();
  const edgeOwners = new Map<string, number[]>();

  for (let i = 0; i < tin.triangles.length; i++) {
    adjacency.set(i, new Set<number>());
    const [a, b, c] = tin.triangles[i];

    for (const [u, v] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) {
      const key = edgeKey(u, v);
      const owners = edgeOwners.get(key);
      if (!owners) {
        edgeOwners.set(key, [i]);
      } else {
        owners.push(i);
      }
    }
  }

  for (const owners of edgeOwners.values()) {
    if (owners.length < 2) continue;
    for (let i = 0; i < owners.length; i++) {
      for (let j = i + 1; j < owners.length; j++) {
        adjacency.get(owners[i])?.add(owners[j]);
        adjacency.get(owners[j])?.add(owners[i]);
      }
    }
  }

  return adjacency;
}

function buildComponents(
  metrics: TriangleMetrics[],
  adjacency: Map<number, Set<number>>,
  bands: SteepSlopeBand[],
  minComponentLinearSpan: number,
): { components: ComponentBuild[]; triangleToComponent: Map<number, string> } {
  const components: ComponentBuild[] = [];
  const triangleToComponent = new Map<number, string>();
  const visited = new Set<number>();

  // The gentlest band (minPercent === 0) represents the background terrain. It
  // is always kept and is never subject to small-outlier removal. Every steeper
  // band is evaluated INDEPENDENTLY: regions are grouped within a single band,
  // and small non-continuous outliers are removed band-by-band (per range).
  let gentleBandId: string | null = null;
  let lowestMin = Number.POSITIVE_INFINITY;
  for (const band of bands) {
    if (band.minPercent < lowestMin) {
      lowestMin = band.minPercent;
      gentleBandId = band.minPercent <= EPSILON ? band.id : null;
    }
  }

  for (const metric of metrics) {
    if (metric.bandId === null || visited.has(metric.triangleIndex)) continue;

    const seedBandId = metric.bandId;
    const seedIsSteep = seedBandId !== gentleBandId;

    const queue = [metric.triangleIndex];
    const triangleIndices: number[] = [];
    let minElevation = Number.POSITIVE_INFINITY;
    let maxElevation = Number.NEGATIVE_INFINITY;

    while (queue.length > 0) {
      const current = queue.pop()!;
      if (visited.has(current)) continue;

      const currentMetric = metrics[current];
      if (!currentMetric || currentMetric.bandId === null) continue;
      // Group strictly within a single slope band (per-range evaluation).
      if (currentMetric.bandId !== seedBandId) continue;

      visited.add(current);
      triangleIndices.push(current);
      minElevation = Math.min(minElevation, currentMetric.minElevation);
      maxElevation = Math.max(maxElevation, currentMetric.maxElevation);

      const neighbors = adjacency.get(current);
      if (!neighbors) continue;

      // Full edge-adjacency growth within the band — do not fragment terrain.
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        const neighborMetric = metrics[neighbor];
        if (!neighborMetric || neighborMetric.bandId === null) continue;
        if (neighborMetric.bandId !== seedBandId) continue;
        queue.push(neighbor);
      }
    }

    if (triangleIndices.length === 0) continue;

    const verticalSpan = maxElevation - minElevation;

    // Gentle background terrain is always kept. A steep region is retained only
    // if it forms a CONNECTED RUN OF MULTIPLE TRIANGLES that together descend at
    // least `minComponentLinearSpan` feet of elevation. We measure this with the
    // span of triangle CENTROID elevations (not vertex elevations):
    //   - A lone steep triangle has a single centroid -> span 0 -> always
    //     removed, no matter how steep. This fixes the 30%+ band, where a single
    //     steep triangle's vertices alone could clear 6 ft and never get culled.
    //   - The 6 ft must be accumulated across several stacked triangles stepping
    //     down the slope, which is exactly the "continuous multi-triangle run".
    //   - It is band-independent, so 30%+ shards are filtered like 15-30% ones.
    let linearSpan = verticalSpan;
    let kept = true;
    if (seedIsSteep) {
      let minCentroidZ = Number.POSITIVE_INFINITY;
      let maxCentroidZ = Number.NEGATIVE_INFINITY;
      for (const idx of triangleIndices) {
        const cz = metrics[idx]?.centroidZ;
        if (cz === undefined) continue;
        if (cz < minCentroidZ) minCentroidZ = cz;
        if (cz > maxCentroidZ) maxCentroidZ = cz;
      }
      const centroidSpan = (Number.isFinite(minCentroidZ) && Number.isFinite(maxCentroidZ))
        ? maxCentroidZ - minCentroidZ
        : 0;
      linearSpan = centroidSpan;
      kept = triangleIndices.length >= 2 && centroidSpan >= minComponentLinearSpan;
    }

    const componentId = `comp-${components.length + 1}`;
    for (const triangleIndex of triangleIndices) {
      triangleToComponent.set(triangleIndex, componentId);
    }

    components.push({
      id: componentId,
      triangleIndices,
      minElevation,
      maxElevation,
      verticalSpan,
      linearSpan,
      kept,
    });
  }

  return { components, triangleToComponent };
}

export function defaultSteepSlopeSettings(partial: Partial<SteepSlopeRunSettings> = {}): SteepSlopeRunSettings {
  const minLinear = partial.minComponentLinearSpan ?? partial.minComponentVerticalSpan ?? 6;
  return {
    sourceTinId: partial.sourceTinId,
    includeBoundaryId: partial.includeBoundaryId ?? null,
    minComponentLinearSpan: minLinear,
    minComponentVerticalSpan: minLinear,
    bands: partial.bands && partial.bands.length > 0 ? partial.bands : DEFAULT_BANDS,
  };
}

export function runSteepSlopeAnalysis(
  tin: TinSurface,
  settingsInput: Partial<SteepSlopeRunSettings> = {},
): SteepSlopeRunResult {
  const settings = defaultSteepSlopeSettings(settingsInput);
  const metrics = computeTriangleMetrics(tin, settings.bands);
  const adjacency = buildTriangleAdjacency(tin);
  const { components, triangleToComponent } = buildComponents(
    metrics,
    adjacency,
    settings.bands,
    settings.minComponentLinearSpan ?? settings.minComponentVerticalSpan ?? 6,
  );

  const componentMap = new Map<string, ComponentBuild>();
  for (const component of components) {
    componentMap.set(component.id, component);
  }

  const triangleSummaries: SteepSlopeTriangleSummary[] = [];
  let keptTriangleCount = 0;
  let removedTriangleCount = 0;

  for (const metric of metrics) {
    if (metric.bandId === null) continue;
    const componentId = triangleToComponent.get(metric.triangleIndex);
    if (!componentId) continue;

    const component = componentMap.get(componentId);
    if (!component) continue;

    if (component.kept) keptTriangleCount += 1;
    else removedTriangleCount += 1;

    triangleSummaries.push({
      triangleIndex: metric.triangleIndex,
      slopePercent: metric.slopePercent,
      componentId,
      bandId: metric.bandId,
    });
  }

  const componentSummaries: SteepSlopeComponentSummary[] = components.map(component => ({
    id: component.id,
    triangleCount: component.triangleIndices.length,
    minElevation: component.minElevation,
    maxElevation: component.maxElevation,
    verticalSpan: component.verticalSpan,
    linearSpan: component.linearSpan,
    kept: component.kept,
  }));

  return {
    id: `steep-slope-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: `Steep Slope ${new Date().toLocaleString()}`,
    createdAt: new Date().toISOString(),
    settings,
    sourceTinId: settings.sourceTinId ?? tin.id,
    analyzedTriangleCount: metrics.filter(m => m.bandId !== null).length,
    keptTriangleCount,
    removedTriangleCount,
    components: componentSummaries,
    triangles: triangleSummaries,
  };
}

export function steepSlopeRunToSurveyLines(tin: TinSurface, run: SteepSlopeRunResult): SurveyLine[] {
  const componentKept = new Map<string, boolean>();
  for (const component of run.components) componentKept.set(component.id, component.kept);

  const bandById = new Map<string, SteepSlopeBand>();
  for (const band of run.settings.bands) bandById.set(band.id, band);

  const fillTriangles: SurveyLine[] = [];

  for (const tri of run.triangles) {
    if (!componentKept.get(tri.componentId)) continue;

    const t = tin.triangles[tri.triangleIndex];
    if (!t) continue;

    const band = bandById.get(tri.bandId);
    const layerName = band?.layerName ?? 'SS_UNMAPPED';
    const color = band?.color ?? '#ef4444';
    const aV = tin.vertices[t[0]];
    const bV = tin.vertices[t[1]];
    const cV = tin.vertices[t[2]];
    if (!aV || !bV || !cV) continue;

    fillTriangles.push({
      id: `ss-fill-${run.id}-${tri.triangleIndex}`,
      from: `ss-${t[0]}`,
      to: `ss-${t[1]}`,
      type: 'steep-slope',
      layer: layerName,
      color,
      lineType: 'CONTINUOUS',
      fromPt: { x: aV.easting, y: aV.northing, z: aV.elevation },
      toPt: { x: bV.easting, y: bV.northing, z: bV.elevation },
      fillPath: [
        { x: aV.easting, y: aV.northing, z: aV.elevation },
        { x: bV.easting, y: bV.northing, z: bV.elevation },
        { x: cV.easting, y: cV.northing, z: cV.elevation },
      ],
    });
  }

  return fillTriangles;
}
