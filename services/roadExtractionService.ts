// services/roadExtractionService.ts
// Authoritative road network extraction and driveway corridor synthesis.
// Combines OpenStreetMap road ways with project survey points and basemap imagery.

import proj4 from 'proj4';
import type { SurveyPoint, SurveyLine } from '../types';
import { smoothSplinePoints, isPointRelevantForCorridor } from '../utils/civilDrafterVision';
import { isPavementPixel } from '../utils/geoRasterSegmentation';

export type BoundingBoxInput = {
  minE?: number;
  maxE?: number;
  minN?: number;
  maxN?: number;
  minX?: number;
  maxX?: number;
  minY?: number;
  maxY?: number;
};

export function normalizeBounds(bounds: BoundingBoxInput): {
  minE: number;
  maxE: number;
  minN: number;
  maxN: number;
} {
  const minE = bounds.minE ?? bounds.minX ?? 0;
  const maxE = bounds.maxE ?? bounds.maxX ?? 0;
  const minN = bounds.minN ?? bounds.minY ?? 0;
  const maxN = bounds.maxN ?? bounds.maxY ?? 0;
  return {
    minE: Math.min(minE, maxE),
    maxE: Math.max(minE, maxE),
    minN: Math.min(minN, maxN),
    maxN: Math.max(minN, maxN),
  };
}

export function isValidWgs84Bbox(minLon: number, minLat: number, maxLon: number, maxLat: number): boolean {
  return (
    Number.isFinite(minLon) &&
    Number.isFinite(minLat) &&
    Number.isFinite(maxLon) &&
    Number.isFinite(maxLat) &&
    minLon >= -180 && maxLon <= 180 &&
    minLat >= -90 && maxLat <= 90 &&
    minLon < maxLon && minLat < maxLat
  );
}

export interface RoadExtractionOptions {
  bounds: BoundingBoxInput;
  projectEpsg?: number | null;
  defaultRoadWidthFt?: number;
  existingPoints?: SurveyPoint[];
  startPointNumber?: number;
  clLayer?: string;
  edgeLayer?: string;
  canvas?: HTMLCanvasElement | null;
}

export interface ExtractedRoadResult {
  points: SurveyPoint[];
  lines: SurveyLine[];
  roadNames: string[];
  roadCenterlines: Array<Array<{ easting: number; northing: number }>>;
  roadEdges: Array<Array<{ easting: number; northing: number }>>;
}

/**
 * Orders a set of survey points along a linear alignment / chain.
 * Tries natural numeric ordering first (standard surveyor field procedure, e.g. 1000..1027),
 * falling back to a greedy nearest-neighbor walk if numbers are non-sequential.
 */
export function sortSurveyPointChain(points: SurveyPoint[]): SurveyPoint[] {
  if (points.length <= 2) return [...points];

  // Check if point numbers are numeric
  const parsed = points.map(p => {
    const m = String(p.pointNumber).match(/\d+/);
    return m ? parseInt(m[0], 10) : NaN;
  });

  if (parsed.every(n => Number.isFinite(n))) {
    const sorted = [...points].sort((a, b) => {
      const na = parseInt(String(a.pointNumber).match(/\d+/)![0], 10);
      const nb = parseInt(String(b.pointNumber).match(/\d+/)![0], 10);
      return na - nb;
    });

    let isContiguous = true;
    for (let i = 0; i < sorted.length - 1; i++) {
      const p1E = typeof sorted[i].easting === 'number' ? sorted[i].easting : (sorted[i] as any).x;
      const p1N = typeof sorted[i].northing === 'number' ? sorted[i].northing : (sorted[i] as any).y;
      const p2E = typeof sorted[i + 1].easting === 'number' ? sorted[i + 1].easting : (sorted[i + 1] as any).x;
      const p2N = typeof sorted[i + 1].northing === 'number' ? sorted[i + 1].northing : (sorted[i + 1] as any).y;
      const d = Math.hypot(p2E - p1E, p2N - p1N);
      if (d > 250) {
        isContiguous = false;
        break;
      }
    }
    if (isContiguous) return sorted;
  }

  // Nearest-neighbor chain walk
  const remaining = [...points];
  remaining.sort((a, b) => {
    const aN = typeof a.northing === 'number' ? a.northing : (a as any).y;
    const bN = typeof b.northing === 'number' ? b.northing : (b as any).y;
    return aN - bN;
  });

  const chain: SurveyPoint[] = [remaining.shift()!];
  while (remaining.length > 0) {
    const last = chain[chain.length - 1];
    const lE = typeof last.easting === 'number' ? last.easting : (last as any).x;
    const lN = typeof last.northing === 'number' ? last.northing : (last as any).y;

    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const pE = typeof remaining[i].easting === 'number' ? remaining[i].easting : (remaining[i] as any).x;
      const pN = typeof remaining[i].northing === 'number' ? remaining[i].northing : (remaining[i] as any).y;
      const d = Math.hypot(pE - lE, pN - lN);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    chain.push(remaining.splice(bestIdx, 1)[0]);
  }

  return chain;
}

export interface DrivewaySynthesisOptions {
  roadEdges: Array<Array<{ easting: number; northing: number }>>;
  controlPoints: SurveyPoint[];
  bounds: BoundingBoxInput;
  drivewayWidthFt?: number;
  startPointNumber?: number;
  clLayer?: string;
  edgeLayer?: string;
  buildingCentroid?: { x: number; y: number };
}

/**
 * Converts a bounding box in project CRS to WGS84 [minLon, minLat, maxLon, maxLat].
 * Returns null if the bounding box represents local coordinates without a valid geographic reference.
 */
export function projectBboxToWgs84(
  rawBounds: BoundingBoxInput,
  epsg?: number | null
): [number, number, number, number] | null {
  const bounds = normalizeBounds(rawBounds);
  if (!epsg || epsg === 4326) {
    if (isValidWgs84Bbox(bounds.minE, bounds.minN, bounds.maxE, bounds.maxN)) {
      return [bounds.minE, bounds.minN, bounds.maxE, bounds.maxN];
    }
    return null;
  }

  const projDef = `EPSG:${epsg}`;
  try {
    const sw = proj4(projDef, 'EPSG:4326', [bounds.minE, bounds.minN]) as [number, number];
    const ne = proj4(projDef, 'EPSG:4326', [bounds.maxE, bounds.maxN]) as [number, number];
    const nw = proj4(projDef, 'EPSG:4326', [bounds.minE, bounds.maxN]) as [number, number];
    const se = proj4(projDef, 'EPSG:4326', [bounds.maxE, bounds.minN]) as [number, number];

    const lons = [sw[0], ne[0], nw[0], se[0]];
    const lats = [sw[1], ne[1], nw[1], se[1]];

    const minLon = Math.min(...lons);
    const minLat = Math.min(...lats);
    const maxLon = Math.max(...lons);
    const maxLat = Math.max(...lats);

    if (isValidWgs84Bbox(minLon, minLat, maxLon, maxLat)) {
      return [minLon, minLat, maxLon, maxLat];
    }
    return null;
  } catch (err) {
    console.warn('[roadExtractionService] Reprojection to WGS84 failed:', err);
    return null;
  }
}

/**
 * "God's Eye View" visual verification and width calibration pass.
 * Casts cross-section rays across the road corridor directly on the aerial orthophoto canvas.
 * Measures the physical pavement boundary opposite the surveyor's frontage curb.
 * Accurately detects residential road widths from 11 ft to 38 ft, eliminating one-sided offset bias.
 */
/**
 * "God's Eye View" visual verification and width calibration pass.
 * Samples cross-sections directly on the aerial orthophoto canvas to:
 * 1. Automatically detect which side of the surveyed curb contains the asphalt pavement.
 * 2. Measure the physical pavement width across the street from the surveyed curb.
 * 3. Return the verified street normal direction and measured road width (defaulting to 26 ft).
 */
export function calibrateRoadWidthFromVision(
  envelope: Array<{ easting: number; northing: number }>,
  normals: Array<{ nx: number; ny: number }>,
  bounds: { minE: number; maxE: number; minN: number; maxN: number },
  canvas?: HTMLCanvasElement | null,
  fallbackWidthFt: number = 26
): {
  effectiveWidthFt: number;
  streetNormals: Array<{ nx: number; ny: number }>;
} {
  const defaultNormals = normals.map(n => ({ ...n }));
  if (!canvas || !canvas.width || !canvas.height) {
    return { effectiveWidthFt: fallbackWidthFt, streetNormals: defaultNormals };
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { effectiveWidthFt: fallbackWidthFt, streetNormals: defaultNormals };
  }

  const w = canvas.width;
  const h = canvas.height;
  let imgData: ImageData;
  try {
    imgData = ctx.getImageData(0, 0, w, h);
  } catch (err) {
    console.warn('[calibrateRoadWidthFromVision] canvas getImageData failed:', err);
    return { effectiveWidthFt: fallbackWidthFt, streetNormals: defaultNormals };
  }
  const data = imgData.data;

  const spanE = Math.max(bounds.maxE - bounds.minE, 1);
  const spanN = Math.max(bounds.maxN - bounds.minN, 1);

  // 1. Global Street Side Determination:
  // Sample +normal vs -normal across all curb points to determine which side of the line has asphalt
  let totalPlus = 0;
  let totalMinus = 0;

  for (let i = 0; i < envelope.length; i++) {
    const pt = envelope[i];
    const n = normals[i];
    if (!n) continue;

    for (const testD of [3.0, 6.0, 9.0]) {
      // Side +n
      const weP = pt.easting + n.nx * testD;
      const wnP = pt.northing + n.ny * testD;
      const pxP = Math.round(((weP - bounds.minE) / spanE) * w);
      const pyP = Math.round(((bounds.maxN - wnP) / spanN) * h);
      if (pxP >= 0 && pxP < w && pyP >= 0 && pyP < h) {
        const idx = (pyP * w + pxP) * 4;
        if (isPavementPixel(data[idx], data[idx + 1], data[idx + 2])) totalPlus++;
      }

      // Side -n
      const weM = pt.easting - n.nx * testD;
      const wnM = pt.northing - n.ny * testD;
      const pxM = Math.round(((weM - bounds.minE) / spanE) * w);
      const pyM = Math.round(((bounds.maxN - wnM) / spanN) * h);
      if (pxM >= 0 && pxM < w && pyM >= 0 && pyM < h) {
        const idx = (pyM * w + pxM) * 4;
        if (isPavementPixel(data[idx], data[idx + 1], data[idx + 2])) totalMinus++;
      }
    }
  }

  // If -n has more pavement than +n, flip the street normal
  const globalSign = (totalMinus > totalPlus) ? -1 : 1;
  const verifiedNormals: Array<{ nx: number; ny: number }> = normals.map(n => ({
    nx: globalSign * n.nx,
    ny: globalSign * n.ny,
  }));

  // 2. Measure actual curb-to-curb road width along verified street normal
  const observedWidths: number[] = [];
  const step = Math.max(1, Math.floor(envelope.length / 15));

  for (let i = 0; i < envelope.length; i += step) {
    const pt = envelope[i];
    const n = verifiedNormals[i];
    if (!n) continue;

    let roadEndDist = 0;
    let nonPaveCount = 0;
    let sawInitialPavement = false;

    for (let d = 1.5; d <= 42.0; d += 0.5) {
      const we = pt.easting + n.nx * d;
      const wn = pt.northing + n.ny * d;
      const px = Math.round(((we - bounds.minE) / spanE) * w);
      const py = Math.round(((bounds.maxN - wn) / spanN) * h);

      if (px < 0 || px >= w || py < 0 || py >= h) break;

      const idx = (py * w + px) * 4;
      const isPave = isPavementPixel(data[idx], data[idx + 1], data[idx + 2]);

      if (isPave) {
        sawInitialPavement = true;
        roadEndDist = d;
        nonPaveCount = 0;
      } else if (sawInitialPavement) {
        nonPaveCount++;
        // When 2 consecutive samples leave pavement, we found the opposite curb edge!
        if (nonPaveCount >= 3 && roadEndDist >= 12) {
          observedWidths.push(roadEndDist);
          break;
        }
      }
    }
  }

  let finalWidth = fallbackWidthFt;
  if (observedWidths.length >= 2) {
    observedWidths.sort((a, b) => a - b);
    const medianW = observedWidths[Math.floor(observedWidths.length / 2)];
    if (medianW >= 12 && medianW <= 38) {
      finalWidth = parseFloat(medianW.toFixed(1));
      console.log(`[calibrateRoadWidthFromVision] Optically verified road width: ${finalWidth} ft (from ${observedWidths.length} cross-section rays)`);
    }
  }

  return { effectiveWidthFt: finalWidth, streetNormals: verifiedNormals };
}

/**
 * Fetches authoritative road ways from OpenStreetMap via /api/streets,
 * reprojects nodes into the project CRS, and drafts road centerlines and parallel edges.
 */
export async function extractAuthoritativeRoads(
  opts: RoadExtractionOptions
): Promise<ExtractedRoadResult> {
  const {
    bounds,
    projectEpsg = null,
    defaultRoadWidthFt = 15,
    existingPoints = [],
    startPointNumber = 300,
    clLayer = 'C-ROAD-CNTR',
    edgeLayer = 'L-ROAD',
  } = opts;

  let pn = startPointNumber;
  const generatedPoints: SurveyPoint[] = [];
  const generatedLines: SurveyLine[] = [];
  const roadNames: string[] = [];
  const roadCenterlines: Array<Array<{ easting: number; northing: number }>> = [];
  const roadEdges: Array<Array<{ easting: number; northing: number }>> = [];

  const normBounds = normalizeBounds(bounds);
  const wgs84 = projectBboxToWgs84(normBounds, projectEpsg);
  let ways: Array<{ name: string; nodes: Array<{ lat: number; lon: number }> }> = [];

  if (wgs84) {
    const [minLon, minLat, maxLon, maxLat] = wgs84;
    const pad = 0.001; // ~300 ft margin for road approaches
    const url = `/api/streets?bbox=${minLon - pad},${minLat - pad},${maxLon + pad},${maxLat + pad}&all=true`;
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        ways = await res.json();
      }
    } catch (err) {
      console.warn('[roadExtractionService] /api/streets request failed:', err);
    }
  }

  // Filter road survey points if available (ignoring AI-generated points from previous runs)
  const roadSurveyPts = existingPoints.filter(p =>
    isPointRelevantForCorridor(p.description, 'road') &&
    !/^(EP|CL|DW|road|poly|TRIM)-/i.test(p.pointNumber)
  );

  const projDef = projectEpsg && projectEpsg !== 4326 ? `EPSG:${projectEpsg}` : null;
  const projectPoint = (lon: number, lat: number): { easting: number; northing: number } => {
    if (!projDef) return { easting: lon, northing: lat };
    try {
      const [e, n] = proj4('EPSG:4326', projDef, [lon, lat]) as [number, number];
      return { easting: e, northing: n };
    } catch {
      return { easting: lon, northing: lat };
    }
  };

  const halfWidth = defaultRoadWidthFt / 2;

  for (let rIdx = 0; rIdx < ways.length; rIdx++) {
    const way = ways[rIdx];
    if (!way.nodes || way.nodes.length < 2) continue;
    if (way.name && !roadNames.includes(way.name)) roadNames.push(way.name);

    // Reproject nodes to project survey frame
    const rawNodes = way.nodes.map(n => projectPoint(n.lon, n.lat));

    // Clip to bounding box with padding
    const padE = Math.max((normBounds.maxE - normBounds.minE) * 0.25, 100);
    const padN = Math.max((normBounds.maxN - normBounds.minN) * 0.25, 100);
    const validNodes = rawNodes.filter(
      n =>
        n.easting >= normBounds.minE - padE &&
        n.easting <= normBounds.maxE + padE &&
        n.northing >= normBounds.minN - padN &&
        n.northing <= normBounds.maxN + padN
    );

    if (validNodes.length < 2) continue;

    // Apply Catmull-Rom spline smoothing to roadway nodes
    const smoothCl = smoothSplinePoints(validNodes, 6, false);
    roadCenterlines.push(smoothCl);

    const clPolyId = `road-cl-${rIdx + 1}`;
    const leftPolyId = `road-edge-left-${rIdx + 1}`;
    const rightPolyId = `road-edge-right-${rIdx + 1}`;

    const clPts: SurveyPoint[] = [];
    const leftPts: SurveyPoint[] = [];
    const rightPts: SurveyPoint[] = [];
    const leftCoords: Array<{ easting: number; northing: number }> = [];
    const rightCoords: Array<{ easting: number; northing: number }> = [];

    const total = smoothCl.length;
    for (let i = 0; i < total; i++) {
      const cur = smoothCl[i];
      const clPt: SurveyPoint = {
        pointNumber: `CL-${pn++}`,
        easting: cur.easting,
        northing: cur.northing,
        elevation: 0,
        description: way.name ? `${way.name} CL` : 'ROAD CL',
        layer: clLayer,
      };
      clPts.push(clPt);

      // Compute normal vector
      let dx = 0;
      let dy = 0;
      if (i === 0) {
        dx = smoothCl[1].easting - cur.easting;
        dy = smoothCl[1].northing - cur.northing;
      } else if (i === total - 1) {
        dx = cur.easting - smoothCl[i - 1].easting;
        dy = cur.northing - smoothCl[i - 1].northing;
      } else {
        dx = smoothCl[i + 1].easting - smoothCl[i - 1].easting;
        dy = smoothCl[i + 1].northing - smoothCl[i - 1].northing;
      }
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;

      const lE = parseFloat((cur.easting + nx * halfWidth).toFixed(2));
      const lN = parseFloat((cur.northing + ny * halfWidth).toFixed(2));
      const rE = parseFloat((cur.easting - nx * halfWidth).toFixed(2));
      const rN = parseFloat((cur.northing - ny * halfWidth).toFixed(2));

      leftCoords.push({ easting: lE, northing: lN });
      rightCoords.push({ easting: rE, northing: rN });

      leftPts.push({
        pointNumber: `EP-${pn++}`,
        easting: lE,
        northing: lN,
        elevation: 0,
        description: 'EP',
        layer: edgeLayer,
      });

      rightPts.push({
        pointNumber: `EP-${pn++}`,
        easting: rE,
        northing: rN,
        elevation: 0,
        description: 'EP',
        layer: edgeLayer,
      });
    }

    roadEdges.push(leftCoords, rightCoords);
    generatedPoints.push(...clPts, ...leftPts, ...rightPts);

    // Emit chains with explicit fromPt/toPt coordinates for direct canvas rendering
    for (let i = 0; i < clPts.length - 1; i++) {
      generatedLines.push({
        id: `line-${clPolyId}-${i}`,
        from: clPts[i].pointNumber,
        to: clPts[i + 1].pointNumber,
        fromPt: { x: clPts[i].easting, y: clPts[i].northing, z: clPts[i].elevation },
        toPt: { x: clPts[i + 1].easting, y: clPts[i + 1].northing, z: clPts[i + 1].elevation },
        layer: clLayer,
        polylineId: clPolyId,
        lineType: 'CENTERLINE',
      });
    }
    for (let i = 0; i < leftPts.length - 1; i++) {
      generatedLines.push({
        id: `line-${leftPolyId}-${i}`,
        from: leftPts[i].pointNumber,
        to: leftPts[i + 1].pointNumber,
        fromPt: { x: leftPts[i].easting, y: leftPts[i].northing, z: leftPts[i].elevation },
        toPt: { x: leftPts[i + 1].easting, y: leftPts[i + 1].northing, z: leftPts[i + 1].elevation },
        layer: edgeLayer,
        polylineId: leftPolyId,
        lineType: 'CONTINUOUS',
      });
    }
    for (let i = 0; i < rightPts.length - 1; i++) {
      generatedLines.push({
        id: `line-${rightPolyId}-${i}`,
        from: rightPts[i].pointNumber,
        to: rightPts[i + 1].pointNumber,
        fromPt: { x: rightPts[i].easting, y: rightPts[i].northing, z: rightPts[i].elevation },
        toPt: { x: rightPts[i + 1].easting, y: rightPts[i + 1].northing, z: rightPts[i + 1].elevation },
        layer: edgeLayer,
        polylineId: rightPolyId,
        lineType: 'CONTINUOUS',
      });
    }
  }

  // 2. Authoritative Field Survey Control Corridor:
  // When the surveyor has collected road / curb shots (ER*, EP*, EOP*, EDGE*, etc.)
  // like points 1000..1028, construct the surveyed road corridor using civil engineering
  // fundamentals:
  // - Determine the corridor axis across the property frontage
  // - Filter out driveway/apron shots that deviate into the lot
  // - Average a smooth, continuous road centerline alignment that bridges through tree canopies
  // - Offset parallel, uniform-width road edges from that centerline
  if (generatedLines.length === 0 && roadSurveyPts.length >= 2) {
    // 1. Find the two furthest road shots to establish the primary road corridor axis
    let maxDistSq = 0;
    let pStart = roadSurveyPts[0];
    let pEnd = roadSurveyPts[1];
    for (let i = 0; i < roadSurveyPts.length; i++) {
      const pi = roadSurveyPts[i];
      const xi = typeof pi.easting === 'number' ? pi.easting : (pi as any).x;
      const yi = typeof pi.northing === 'number' ? pi.northing : (pi as any).y;
      for (let j = i + 1; j < roadSurveyPts.length; j++) {
        const pj = roadSurveyPts[j];
        const xj = typeof pj.easting === 'number' ? pj.easting : (pj as any).x;
        const yj = typeof pj.northing === 'number' ? pj.northing : (pj as any).y;
        const dSq = (xj - xi) ** 2 + (yj - yi) ** 2;
        if (dSq > maxDistSq) {
          maxDistSq = dSq;
          pStart = pi;
          pEnd = pj;
        }
      }
    }

    const startE = typeof pStart.easting === 'number' ? pStart.easting : (pStart as any).x;
    const startN = typeof pStart.northing === 'number' ? pStart.northing : (pStart as any).y;
    const endE = typeof pEnd.easting === 'number' ? pEnd.easting : (pEnd as any).x;
    const endN = typeof pEnd.northing === 'number' ? pEnd.northing : (pEnd as any).y;

    const chordDx = endE - startE;
    const chordDy = endN - startN;
    const chordLen = Math.hypot(chordDx, chordDy) || 1;
    const ux = chordDx / chordLen;
    const uy = chordDy / chordLen;
    const nx = -uy;
    const ny = ux;

    // Determine lot interior centroid to orient street offset outwards
    const nonRoadPts = existingPoints.filter(p => !isPointRelevantForCorridor(p.description, 'road'));
    let parcelCenterE = (normBounds.minE + normBounds.maxE) / 2;
    let parcelCenterN = (normBounds.minN + normBounds.maxN) / 2;
    if (nonRoadPts.length > 0) {
      const validInterior = nonRoadPts.filter(p => {
        const x = typeof p.easting === 'number' ? p.easting : (p as any).x;
        const y = typeof p.northing === 'number' ? p.northing : (p as any).y;
        return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y);
      });
      if (validInterior.length > 0) {
        parcelCenterE = validInterior.reduce((s, p) => s + (typeof p.easting === 'number' ? p.easting : (p as any).x), 0) / validInterior.length;
        parcelCenterN = validInterior.reduce((s, p) => s + (typeof p.northing === 'number' ? p.northing : (p as any).y), 0) / validInterior.length;
      }
    }

    const midE = (startE + endE) / 2;
    const midN = (startN + endN) / 2;
    const distWithNormal = Math.hypot(midE + nx * 50 - parcelCenterE, midN + ny * 50 - parcelCenterN);
    const distWithout = Math.hypot(midE - nx * 50 - parcelCenterE, midN - ny * 50 - parcelCenterN);
    const streetSideSign = distWithNormal >= distWithout ? 1 : -1;
    const streetNx = streetSideSign * nx;
    const streetNy = streetSideSign * ny;

    // Project each road survey point into (station s, offset towards street h)
    const projectedRoadPts = roadSurveyPts.map(p => {
      const pe = typeof p.easting === 'number' ? p.easting : (p as any).x;
      const pn = typeof p.northing === 'number' ? p.northing : (p as any).y;
      const dx = pe - startE;
      const dy = pn - startN;
      const s = dx * ux + dy * uy;
      const h = dx * streetNx + dy * streetNy;
      return { p, easting: pe, northing: pn, elevation: p.elevation ?? 0, s, h };
    });

    // Extract through-road outer envelope (bypassing recessed driveway shots and trees)
    // Bin by station in 35-foot increments, choosing the point with maximum streetward offset h
    const binSize = 35;
    const bins = new Map<number, typeof projectedRoadPts[0]>();
    for (const item of projectedRoadPts) {
      const binIdx = Math.floor(item.s / binSize);
      const existing = bins.get(binIdx);
      if (!existing || item.h > existing.h) {
        bins.set(binIdx, item);
      }
    }

    let envelope = Array.from(bins.keys())
      .sort((a, b) => a - b)
      .map(k => bins.get(k)!);

    // Fall back to endpoints if envelope too sparse
    if (envelope.length < 2) {
      envelope = [
        { p: pStart, easting: startE, northing: startN, elevation: pStart.elevation ?? 0, s: 0, h: 0 },
        { p: pEnd, easting: endE, northing: endN, elevation: pEnd.elevation ?? 0, s: chordLen, h: 0 },
      ];
    }

    // Compute local perpendicular normals at each envelope vertex along the frontage curb
    const envelopeNormals: Array<{ nx: number; ny: number }> = [];
    for (let i = 0; i < envelope.length; i++) {
      const cur = envelope[i];
      let dx = 0, dy = 0;
      if (i === 0) {
        dx = envelope[1].easting - cur.easting;
        dy = envelope[1].northing - cur.northing;
      } else if (i === envelope.length - 1) {
        dx = cur.easting - envelope[i - 1].easting;
        dy = cur.northing - envelope[i - 1].northing;
      } else {
        dx = envelope[i + 1].easting - envelope[i - 1].easting;
        dy = envelope[i + 1].northing - envelope[i - 1].northing;
      }
      const len = Math.hypot(dx, dy) || 1;
      let nxLocal = -dy / len;
      let nyLocal = dx / len;
      // Normal must point away from the parcel interior (outwards into the street)
      const toStreetX = cur.easting - parcelCenterE;
      const toStreetY = cur.northing - parcelCenterN;
      if (nxLocal * toStreetX + nyLocal * toStreetY < 0) {
        nxLocal = -nxLocal;
        nyLocal = -nyLocal;
      }
      envelopeNormals.push({ nx: nxLocal, ny: nyLocal });
    }

    // 2. Calibrate road width using "God's Eye View" visual verification pass across the aerial canvas:
    const { effectiveWidthFt, streetNormals } = calibrateRoadWidthFromVision(
      envelope,
      envelopeNormals,
      normBounds,
      opts.canvas,
      defaultRoadWidthFt >= 18 ? defaultRoadWidthFt : 26
    );
    const halfWidth = effectiveWidthFt / 2;

    // 3. Civil Engineering Corridor Construction from Surveyor's Frontage Curb:
    // - Near Edge: Exactly on the surveyor's physical curb shots (envelope) at 0 ft offset.
    // - Centerline: Exactly +halfWidth (+13 ft) down the middle of the road cartway.
    // - Far Edge: Exactly +effectiveWidthFt (+26 ft) along the opposite curb across the street.
    const smoothNearEdge = smoothSplinePoints(
      envelope.map(e => ({ easting: e.easting, northing: e.northing })),
      4,
      false
    );

    const startElev = envelope[0].elevation;
    const endElev = envelope[envelope.length - 1].elevation;
    const totalSteps = Math.max(smoothNearEdge.length - 1, 1);

    const clPolyId = `road-cl-surveyed-${Date.now()}`;
    const nearEdgePolyId = `road-edge-near-${Date.now()}`;
    const farEdgePolyId = `road-edge-far-${Date.now()}`;

    const clCoords: Array<{ easting: number; northing: number }> = [];
    const nearCoords: Array<{ easting: number; northing: number }> = [];
    const farCoords: Array<{ easting: number; northing: number }> = [];

    for (let j = 0; j < smoothNearEdge.length; j++) {
      const cur = smoothNearEdge[j];
      const t = j / totalSteps;
      const elev = parseFloat((startElev + t * (endElev - startElev)).toFixed(2));

      // Local tangent along smooth frontage curb
      let dx = 0;
      let dy = 0;
      if (j === 0) {
        dx = smoothNearEdge[1].easting - cur.easting;
        dy = smoothNearEdge[1].northing - cur.northing;
      } else if (j === smoothNearEdge.length - 1) {
        dx = cur.easting - smoothNearEdge[j - 1].easting;
        dy = cur.northing - smoothNearEdge[j - 1].northing;
      } else {
        dx = smoothNearEdge[j + 1].easting - smoothNearEdge[j - 1].easting;
        dy = smoothNearEdge[j + 1].northing - smoothNearEdge[j - 1].northing;
      }
      const len = Math.hypot(dx, dy) || 1;
      let snx = -dy / len;
      let sny = dx / len;

      // Align local normal with verified street normal from vision
      const normalIdx = Math.min(Math.floor((j / totalSteps) * (streetNormals.length - 1)), streetNormals.length - 1);
      const targetNx = streetNormals[normalIdx]?.nx ?? streetNx;
      const targetNy = streetNormals[normalIdx]?.ny ?? streetNy;
      if (snx * targetNx + sny * targetNy < 0) {
        snx = -snx;
        sny = -sny;
      }

      // Near Edge: sitting directly on the surveyed frontage curb (0 ft offset)
      const nearPt = { easting: cur.easting, northing: cur.northing };
      // Centerline: offset by halfWidth (+13 ft) down the middle of the street
      const clPt = {
        easting: parseFloat((cur.easting + snx * halfWidth).toFixed(2)),
        northing: parseFloat((cur.northing + sny * halfWidth).toFixed(2)),
      };
      // Far Edge: offset by full road width (+26 ft) onto opposite curb
      const farPt = {
        easting: parseFloat((cur.easting + snx * effectiveWidthFt).toFixed(2)),
        northing: parseFloat((cur.northing + sny * effectiveWidthFt).toFixed(2)),
      };

      nearCoords.push(nearPt);
      clCoords.push(clPt);
      farCoords.push(farPt);

      if (j > 0) {
        const prevCl = clCoords[j - 1];
        const prevNear = nearCoords[j - 1];
        const prevFar = farCoords[j - 1];
        const prevElev = parseFloat((startElev + ((j - 1) / totalSteps) * (endElev - startElev)).toFixed(2));

        // Centerline line (C-ROAD-CNTR)
        generatedLines.push({
          id: `line-${clPolyId}-${j}`,
          from: `${clPolyId}-${j - 1}`,
          to: `${clPolyId}-${j}`,
          fromPt: { x: prevCl.easting, y: prevCl.northing, z: prevElev },
          toPt: { x: clPt.easting, y: clPt.northing, z: elev },
          layer: clLayer,
          polylineId: clPolyId,
          lineType: 'CENTERLINE',
        });

        // Near frontage edge line (surveyed curb directly through control points)
        generatedLines.push({
          id: `line-${nearEdgePolyId}-${j}`,
          from: `${nearEdgePolyId}-${j - 1}`,
          to: `${nearEdgePolyId}-${j}`,
          fromPt: { x: prevNear.easting, y: prevNear.northing, z: prevElev },
          toPt: { x: nearPt.easting, y: nearPt.northing, z: elev },
          layer: edgeLayer,
          polylineId: nearEdgePolyId,
          lineType: 'CONTINUOUS',
        });

        // Far edge line (opposite curb across street)
        generatedLines.push({
          id: `line-${farEdgePolyId}-${j}`,
          from: `${farEdgePolyId}-${j - 1}`,
          to: `${farEdgePolyId}-${j}`,
          fromPt: { x: prevFar.easting, y: prevFar.northing, z: prevElev },
          toPt: { x: farPt.easting, y: farPt.northing, z: elev },
          layer: edgeLayer,
          polylineId: farEdgePolyId,
          lineType: 'CONTINUOUS',
        });
      }
    }

    roadCenterlines.push(clCoords);
    roadEdges.push(nearCoords, farCoords);
    roadNames.push('Surveyed Road Corridor (ER/EP)');
  }

  return {
    points: generatedPoints,
    lines: generatedLines,
    roadNames,
    roadCenterlines,
    roadEdges,
  };
}

/**
 * Synthesizes a realistic, high-precision driveway connecting the road edge to the residential building/apron,
 * flaring out with smooth entrance curb returns (bell returns) and parking court.
 */
export function synthesizeDrivewayToHouse(
  opts: DrivewaySynthesisOptions
): { points: SurveyPoint[]; lines: SurveyLine[] } {
  const {
    roadEdges,
    controlPoints = [],
    bounds,
    drivewayWidthFt = 14,
    startPointNumber = 500,
    clLayer = 'L-DRIVEWAY-CL',
    edgeLayer = 'L-DRIVEWAY',
    buildingCentroid,
  } = opts;

  let pn = startPointNumber;
  const generatedPoints: SurveyPoint[] = [];
  const generatedLines: SurveyLine[] = [];

  // Determine property center & building location from normalized bounds
  const normBounds = normalizeBounds(bounds);
  const spanE = Math.max(normBounds.maxE - normBounds.minE, 1);
  const spanN = Math.max(normBounds.maxN - normBounds.minN, 1);

  // House garage location:
  // Prefer buildingCentroid if provided by OSM.
  // Otherwise, if controlPoints has non-road points (e.g. boundary pins, traverse control, house shots), compute their centroid!
  const nonRoadPoints = controlPoints.filter(p => !isPointRelevantForCorridor(p.description, 'road'));
  let defaultHouseE = normBounds.minE + spanE * 0.55;
  let defaultHouseN = normBounds.minN + spanN * 0.50;
  if (nonRoadPoints.length > 0) {
    const validInterior = nonRoadPoints.filter(p => {
      const x = typeof p.easting === 'number' ? p.easting : (p as any).x;
      const y = typeof p.northing === 'number' ? p.northing : (p as any).y;
      return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y);
    });
    if (validInterior.length > 0) {
      const sumE = validInterior.reduce((s, p) => s + (typeof p.easting === 'number' ? p.easting : (p as any).x), 0);
      const sumN = validInterior.reduce((s, p) => s + (typeof p.northing === 'number' ? p.northing : (p as any).y), 0);
      defaultHouseE = sumE / validInterior.length;
      defaultHouseN = sumN / validInterior.length;
    }
  }
  const houseE = buildingCentroid?.x ?? defaultHouseE;
  const houseN = buildingCentroid?.y ?? defaultHouseN;

  // Check for physical survey shots taken on the driveway (e.g. Point 1048 "ER* / DW 1/2*")
  const surveyedDwPts = controlPoints.filter(p => isPointRelevantForCorridor(p.description, 'driveway'));
  let surveyedEntrancePt: { easting: number; northing: number } | null = null;
  if (surveyedDwPts.length > 0) {
    const sorted = sortSurveyPointChain(surveyedDwPts);
    const firstPt = sorted[0];
    surveyedEntrancePt = {
      easting: typeof firstPt.easting === 'number' ? firstPt.easting : (firstPt as any).x,
      northing: typeof firstPt.northing === 'number' ? firstPt.northing : (firstPt as any).y,
    };
  }

  // Find the road edge closest to the house or surveyed entrance
  let bestEntrancePt: { easting: number; northing: number } | null = surveyedEntrancePt;
  let bestDist = Infinity;

  if (!bestEntrancePt) {
    for (const edge of roadEdges) {
      for (let i = 0; i < edge.length - 1; i++) {
        const p1 = edge[i];
        const p2 = edge[i + 1];
        const dx = p2.easting - p1.easting;
        const dy = p2.northing - p1.northing;
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 1) continue;

        const t = Math.max(0, Math.min(1, ((houseE - p1.easting) * dx + (houseN - p1.northing) * dy) / lenSq));
        const projE = p1.easting + t * dx;
        const projN = p1.northing + t * dy;
        const d = Math.hypot(houseE - projE, houseN - projN);
        if (d < bestDist) {
          bestDist = d;
          bestEntrancePt = { easting: projE, northing: projN };
        }
      }
    }
  }

  // If no road edges found, derive entrance from western bounds
  const entrance = bestEntrancePt || {
    easting: normBounds.minE + spanE * 0.28,
    northing: houseN,
  };

  // Generate 4-point alignment from road entrance -> approach corridor -> garage court
  const rawCenterline: Array<{ easting: number; northing: number }> = [
    { easting: entrance.easting, northing: entrance.northing },
    {
      easting: entrance.easting + (houseE - entrance.easting) * 0.35,
      northing: entrance.northing + (houseN - entrance.northing) * 0.20,
    },
    {
      easting: entrance.easting + (houseE - entrance.easting) * 0.72,
      northing: entrance.northing + (houseN - entrance.northing) * 0.65,
    },
    { easting: houseE, northing: houseN },
  ];

  // Smooth centerline with 25+ detailed Catmull-Rom vertices
  const smoothCl = smoothSplinePoints(rawCenterline, 8, false);

  const clPts: SurveyPoint[] = [];
  const leftPts: SurveyPoint[] = [];
  const rightPts: SurveyPoint[] = [];
  const total = smoothCl.length;
  const halfWidth = drivewayWidthFt / 2;

  for (let i = 0; i < total; i++) {
    const cur = smoothCl[i];
    const clPt: SurveyPoint = {
      pointNumber: `DW-CL-${pn++}`,
      easting: cur.easting,
      northing: cur.northing,
      elevation: 0,
      description: i === 0 ? 'DW CL ENTRANCE' : i === total - 1 ? 'DW CL APRON' : 'DW CL',
      layer: clLayer,
    };
    clPts.push(clPt);

    // Bell flare at road entrance (quadratic widening for curb returns)
    let w = halfWidth;
    if (i < total * 0.3) {
      const ratio = 1 - (i / (total * 0.3));
      w += 10 * (ratio * ratio);
    }
    // Flare into garage parking court at house terminus
    if (i > total * 0.75) {
      const ratio = (i - total * 0.75) / (total * 0.25);
      w += 12 * (ratio * ratio);
    }

    let dx = 0;
    let dy = 0;
    if (i === 0) {
      dx = smoothCl[1].easting - cur.easting;
      dy = smoothCl[1].northing - cur.northing;
    } else if (i === total - 1) {
      dx = cur.easting - smoothCl[i - 1].easting;
      dy = cur.northing - smoothCl[i - 1].northing;
    } else {
      dx = smoothCl[i + 1].easting - smoothCl[i - 1].easting;
      dy = smoothCl[i + 1].northing - smoothCl[i - 1].northing;
    }
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    leftPts.push({
      pointNumber: `DW-${pn++}`,
      easting: parseFloat((cur.easting + nx * w).toFixed(2)),
      northing: parseFloat((cur.northing + ny * w).toFixed(2)),
      elevation: 0,
      description: i === 0 ? 'DW NORTH ENTRANCE' : 'DW EDGE',
      layer: edgeLayer,
    });

    rightPts.push({
      pointNumber: `DW-${pn++}`,
      easting: parseFloat((cur.easting - nx * w).toFixed(2)),
      northing: parseFloat((cur.northing - ny * w).toFixed(2)),
      elevation: 0,
      description: i === 0 ? 'DW SOUTH ENTRANCE' : 'DW EDGE',
      layer: edgeLayer,
    });
  }

  generatedPoints.push(...clPts, ...leftPts, ...rightPts);

  const clPolyId = `driveway-cl-${Date.now()}`;
  const leftPolyId = `driveway-edge-north-${Date.now()}`;
  const rightPolyId = `driveway-edge-south-${Date.now()}`;

  // Chain centerline with explicit fromPt/toPt coordinates
  for (let i = 0; i < clPts.length - 1; i++) {
    generatedLines.push({
      id: `line-${clPolyId}-${i}`,
      from: clPts[i].pointNumber,
      to: clPts[i + 1].pointNumber,
      fromPt: { x: clPts[i].easting, y: clPts[i].northing, z: clPts[i].elevation },
      toPt: { x: clPts[i + 1].easting, y: clPts[i + 1].northing, z: clPts[i + 1].elevation },
      layer: clLayer,
      polylineId: clPolyId,
      lineType: 'CENTERLINE',
    });
  }

  // Chain left edge
  for (let i = 0; i < leftPts.length - 1; i++) {
    generatedLines.push({
      id: `line-${leftPolyId}-${i}`,
      from: leftPts[i].pointNumber,
      to: leftPts[i + 1].pointNumber,
      fromPt: { x: leftPts[i].easting, y: leftPts[i].northing, z: leftPts[i].elevation },
      toPt: { x: leftPts[i + 1].easting, y: leftPts[i + 1].northing, z: leftPts[i + 1].elevation },
      layer: edgeLayer,
      polylineId: leftPolyId,
      lineType: 'CONTINUOUS',
    });
  }

  // Chain right edge
  for (let i = 0; i < rightPts.length - 1; i++) {
    generatedLines.push({
      id: `line-${rightPolyId}-${i}`,
      from: rightPts[i].pointNumber,
      to: rightPts[i + 1].pointNumber,
      fromPt: { x: rightPts[i].easting, y: rightPts[i].northing, z: rightPts[i].elevation },
      toPt: { x: rightPts[i + 1].easting, y: rightPts[i + 1].northing, z: rightPts[i + 1].elevation },
      layer: edgeLayer,
      polylineId: rightPolyId,
      lineType: 'CONTINUOUS',
    });
  }

  // Connect entrance tie line
  if (leftPts.length > 0 && rightPts.length > 0) {
    generatedLines.push({
      id: `line-${leftPolyId}-entrance`,
      from: leftPts[0].pointNumber,
      to: rightPts[0].pointNumber,
      fromPt: { x: leftPts[0].easting, y: leftPts[0].northing, z: leftPts[0].elevation },
      toPt: { x: rightPts[0].easting, y: rightPts[0].northing, z: rightPts[0].elevation },
      layer: edgeLayer,
      polylineId: leftPolyId,
      lineType: 'CONTINUOUS',
    });

    const last = leftPts.length - 1;
    generatedLines.push({
      id: `line-${leftPolyId}-apron`,
      from: leftPts[last].pointNumber,
      to: rightPts[last].pointNumber,
      fromPt: { x: leftPts[last].easting, y: leftPts[last].northing, z: leftPts[last].elevation },
      toPt: { x: rightPts[last].easting, y: rightPts[last].northing, z: rightPts[last].elevation },
      layer: edgeLayer,
      polylineId: leftPolyId,
      lineType: 'CONTINUOUS',
    });
  }

  return { points: generatedPoints, lines: generatedLines };
}
