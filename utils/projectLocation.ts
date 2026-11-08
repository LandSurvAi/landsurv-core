/**
 * projectLocation — estimate where a project sits from drawing geometry.
 *
 * Field workflows usually start with points and linework before anyone records
 * a project address. This module derives a defensible project footprint from
 * whatever is actually on the drawing:
 *
 *   - survey points (including hidden/layer-filtered ones only if supplied)
 *   - line vertices (`fromPt` / `toPt`), including polylines, parcels, contours
 *   - circle centres + radii
 *   - centreline PI vertices
 *
 * The projected extents are always available. Geographic coordinates require
 * the project EPSG; `initProjections()` supplies the bundled State Plane defs
 * and proj4 handles the conversion. This is the per-cluster footprint primitive
 * used by utils/projectClusters and the LSAI Agent's `lsvz_project_locations`
 * CACP skill. GPS Rover no longer owns project location.
 */

import proj4 from 'proj4';
import type {
  Centerline,
  ProjectLocationEstimate,
  SurveyLine,
  SurveyPoint,
} from '../types.ts';
import { initProjections } from './projections.ts';

const DEFAULT_MARGIN = 200; // project units (feet for US State Plane)
const SQFT_PER_ACRE = 43_560;
const FT_PER_METER = 3.280839895013123;

interface XY {
  easting: number;
  northing: number;
}

interface EstimateProjectLocationInput {
  points?: SurveyPoint[];
  lines?: SurveyLine[];
  centerlines?: Centerline[];
  /** Project CRS. Without it the estimate still returns projected extents. */
  epsg?: number | null;
  /** Margin applied around the projected extent when building the WGS84 bbox. */
  marginProjected?: number;
  /** Set false to ignore linework and estimate from points only. */
  includeLinework?: boolean;
  /** Optional live GPS fix used when the drawing is still empty. */
  gpsFix?: { latitude: number; longitude: number } | null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function pushVertex(out: XY[], easting: unknown, northing: unknown): boolean {
  if (!isFiniteNumber(easting) || !isFiniteNumber(northing)) return false;
  out.push({ easting, northing });
  return true;
}

/** Convert a WGS84 fix into project coordinates (northing/easting). */
export function wgs84ToProjected(
  latitude: number,
  longitude: number,
  epsg: number | null | undefined,
): { northing: number; easting: number } | null {
  if (!epsg || !isFiniteNumber(latitude) || !isFiniteNumber(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  try {
    initProjections();
    const [easting, northing] = proj4('EPSG:4326', `EPSG:${epsg}`, [longitude, latitude]);
    if (!isFiniteNumber(easting) || !isFiniteNumber(northing)) return null;
    return { northing, easting };
  } catch {
    return null;
  }
}

/** Convert a project-space coordinate into WGS84 (latitude/longitude). */
export function projectedToWgs84(
  easting: number,
  northing: number,
  epsg: number | null | undefined,
): { latitude: number; longitude: number } | null {
  if (!epsg || !isFiniteNumber(easting) || !isFiniteNumber(northing)) return null;
  try {
    initProjections();
    const [longitude, latitude] = proj4(`EPSG:${epsg}`, 'EPSG:4326', [easting, northing]);
    if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) return null;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
    return { latitude, longitude };
  } catch {
    return null;
  }
}

/** Convert metres (the browser Geolocation unit) to project feet. */
export function metersToFeet(meters: number | null | undefined): number | null {
  return isFiniteNumber(meters) ? meters * FT_PER_METER : null;
}

/**
 * Build the WGS84 bbox by sampling the projected envelope generously. Four
 * corners alone under-cover curved State Plane graticules near the edges, so
 * edge midpoints and the centre are included too.
 */
function projectedBboxToWgs84(
  bounds: NonNullable<ProjectLocationEstimate['bounds']>,
  epsg: number,
  margin: number,
): [number, number, number, number] | null {
  const minE = bounds.minEasting - margin;
  const maxE = bounds.maxEasting + margin;
  const minN = bounds.minNorthing - margin;
  const maxN = bounds.maxNorthing + margin;
  const midE = (minE + maxE) / 2;
  const midN = (minN + maxN) / 2;

  const samples: XY[] = [
    { easting: minE, northing: minN },
    { easting: midE, northing: minN },
    { easting: maxE, northing: minN },
    { easting: minE, northing: midN },
    { easting: midE, northing: midN },
    { easting: maxE, northing: midN },
    { easting: minE, northing: maxN },
    { easting: midE, northing: maxN },
    { easting: maxE, northing: maxN },
  ];

  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const sample of samples) {
    const wgs = projectedToWgs84(sample.easting, sample.northing, epsg);
    if (!wgs) continue;
    if (wgs.longitude < west) west = wgs.longitude;
    if (wgs.longitude > east) east = wgs.longitude;
    if (wgs.latitude < south) south = wgs.latitude;
    if (wgs.latitude > north) north = wgs.latitude;
  }

  if (![west, south, east, north].every(Number.isFinite)) return null;
  return [west, south, east, north];
}

function formatCoordinate(latitude: number, longitude: number): string {
  const ns = latitude >= 0 ? 'N' : 'S';
  const ew = longitude >= 0 ? 'E' : 'W';
  return `${Math.abs(latitude).toFixed(6)}° ${ns}, ${Math.abs(longitude).toFixed(6)}° ${ew}`;
}

export interface ProjectLocationQuickThoughtOptions {
  /** Human-readable job/site label, when the project has one. */
  siteLabel?: string | null;
  /** State inferred from the project CRS or a jurisdiction lookup. */
  stateName?: string | null;
}

/**
 * One-line location answer for Quick Thought. Keep the full estimate — source
 * counts, area, confidence, warnings — in the conversation; this is only the
 * part that answers "where is the project?".
 */
export function formatProjectLocationQuickThought(
  estimate: ProjectLocationEstimate,
  options: ProjectLocationQuickThoughtOptions = {},
): string {
  const place = [options.siteLabel, options.stateName]
    .map(value => value?.trim())
    .filter(Boolean)
    .join(', ');

  if (estimate.source === 'none') {
    return place
      ? `${place} — no project geometry yet; add points or get a GPS fix.`
      : 'No project geometry yet — add points or linework, or get a GPS fix.';
  }

  const coordinates = estimate.centerWgs84
    ? formatCoordinate(estimate.centerWgs84.latitude, estimate.centerWgs84.longitude)
    : estimate.center
      ? `N ${estimate.center.northing.toFixed(2)}, E ${estimate.center.easting.toFixed(2)}`
      : '';
  const area = estimate.areaAcres > 0 ? `${estimate.areaAcres.toFixed(2)} ac` : '';
  const detail = coordinates || area;

  if (!place) return detail ? `Project location · ${detail}` : estimate.summary;
  return detail ? `${place} · ${detail}` : place;
}

/**
 * Estimate the project footprint from drawing geometry. Pure and synchronous,
 * with no network access, so it is safe to call on every render or CACP turn.
 */
export function estimateProjectLocation(
  input: EstimateProjectLocationInput = {},
): ProjectLocationEstimate {
  const {
    points = [],
    lines = [],
    centerlines = [],
    epsg = null,
    marginProjected = DEFAULT_MARGIN,
    includeLinework = true,
    gpsFix = null,
  } = input;

  const margin = isFiniteNumber(marginProjected) && marginProjected >= 0
    ? marginProjected
    : DEFAULT_MARGIN;

  const vertices: XY[] = [];
  const pointMap = new Map<string, SurveyPoint>();
  let pointCount = 0;
  for (const point of points) {
    pointMap.set(point.pointNumber, point);
    if (pushVertex(vertices, point.easting, point.northing)) pointCount += 1;
  }

  let lineCount = 0;
  if (includeLinework) {
    for (const line of lines) {
      if (line.hidden) continue;
      let added = false;

      if (line.fromPt) {
        added = pushVertex(vertices, line.fromPt.x, line.fromPt.y) || added;
      }
      if (line.toPt) {
        added = pushVertex(vertices, line.toPt.x, line.toPt.y) || added;
      }
      if (line.fillPath && line.fillPath.length > 0) {
        for (const vertex of line.fillPath) {
          added = pushVertex(vertices, vertex.x, vertex.y) || added;
        }
      }
      // Resolve references when the line only carries point numbers.
      if (!line.fromPt && line.from) {
        const from = pointMap.get(line.from);
        if (from) added = pushVertex(vertices, from.easting, from.northing) || added;
      }
      if (!line.toPt && line.to) {
        const to = pointMap.get(line.to);
        if (to) added = pushVertex(vertices, to.easting, to.northing) || added;
      }
      // Circles have no path vertices; include their full extent.
      if (line.isCircle && line.circleCenter && isFiniteNumber(line.curveRadius)) {
        const { x, y } = line.circleCenter;
        const r = Math.abs(line.curveRadius);
        added = pushVertex(vertices, x - r, y - r) || added;
        added = pushVertex(vertices, x + r, y + r) || added;
      }

      if (added) lineCount += 1;
    }
  }

  let centerlineCount = 0;
  if (includeLinework) {
    for (const centerline of centerlines) {
      let added = false;
      for (const pi of centerline.pis ?? []) {
        added = pushVertex(vertices, pi.easting, pi.northing) || added;
      }
      if (added) centerlineCount += 1;
    }
  }

  let bounds: ProjectLocationEstimate['bounds'] = null;
  if (vertices.length > 0) {
    let minEasting = Infinity;
    let minNorthing = Infinity;
    let maxEasting = -Infinity;
    let maxNorthing = -Infinity;
    for (const vertex of vertices) {
      if (vertex.easting < minEasting) minEasting = vertex.easting;
      if (vertex.easting > maxEasting) maxEasting = vertex.easting;
      if (vertex.northing < minNorthing) minNorthing = vertex.northing;
      if (vertex.northing > maxNorthing) maxNorthing = vertex.northing;
    }
    if ([minEasting, minNorthing, maxEasting, maxNorthing].every(Number.isFinite)) {
      bounds = { minEasting, minNorthing, maxEasting, maxNorthing };
    }
  }

  const width = bounds ? Math.max(0, bounds.maxEasting - bounds.minEasting) : 0;
  const height = bounds ? Math.max(0, bounds.maxNorthing - bounds.minNorthing) : 0;
  const areaAcres = (width * height) / SQFT_PER_ACRE;
  const diagonal = Math.hypot(width, height);
  const center = bounds
    ? {
        easting: (bounds.minEasting + bounds.maxEasting) / 2,
        northing: (bounds.minNorthing + bounds.maxNorthing) / 2,
      }
    : null;

  const hasPoints = pointCount > 0;
  const hasLinework = lineCount > 0 || centerlineCount > 0;
  let source: ProjectLocationEstimate['source'] = 'none';
  if (hasPoints && hasLinework) source = 'points-and-linework';
  else if (hasPoints) source = 'points';
  else if (hasLinework) source = 'linework';

  let centerWgs84 = center && epsg
    ? projectedToWgs84(center.easting, center.northing, epsg)
    : null;

  // Empty drawing: fall back to the live rover fix so the surface can still
  // answer "where is this project?" before the first shot is stored.
  if (!bounds && gpsFix) {
    source = 'gps-fix';
    const projected = wgs84ToProjected(gpsFix.latitude, gpsFix.longitude, epsg);
    if (projected) {
      bounds = {
        minEasting: projected.easting,
        minNorthing: projected.northing,
        maxEasting: projected.easting,
        maxNorthing: projected.northing,
      };
    }
    centerWgs84 = { latitude: gpsFix.latitude, longitude: gpsFix.longitude };
  }

  const bboxWgs84 = bounds && epsg ? projectedBboxToWgs84(bounds, epsg, margin) : null;

  if (!centerWgs84 && bboxWgs84) {
    centerWgs84 = {
      latitude: (bboxWgs84[1] + bboxWgs84[3]) / 2,
      longitude: (bboxWgs84[0] + bboxWgs84[2]) / 2,
    };
  }

  const warnings: string[] = [];
  if (!epsg) {
    warnings.push('No project projection is set — set a State Plane / EPSG code to resolve latitude and longitude.');
  }
  if (vertices.length === 1) {
    warnings.push('A single vertex defines the footprint — treat the location as a best guess.');
  }
  if (vertices.length > 1 && (width === 0 || height === 0)) {
    warnings.push('The drawing geometry is collinear — the footprint has no area.');
  }

  let confidence: ProjectLocationEstimate['confidence'] = 'none';
  // Linework that encloses area is the strongest signal; points alone are a
  // reasonable guesstimate but not a boundary.
  if (hasLinework && vertices.length >= 3 && width > 0 && height > 0) confidence = 'high';
  else if (vertices.length > 0) confidence = 'medium';
  else if (source === 'gps-fix') confidence = 'low';

  const locationText = centerWgs84
    ? formatCoordinate(centerWgs84.latitude, centerWgs84.longitude)
    : 'geographic location unavailable';

  let summary: string;
  if (source === 'none') {
    summary = 'No points or linework are on the drawing yet — add geometry or acquire a GPS fix.';
  } else if (source === 'gps-fix') {
    summary = `Project location estimated from the live GPS fix at ${locationText}.`;
  } else {
    const parts: string[] = [];
    if (pointCount > 0) parts.push(`${pointCount} point${pointCount === 1 ? '' : 's'}`);
    if (lineCount > 0) parts.push(`${lineCount} line${lineCount === 1 ? '' : 's'}`);
    if (centerlineCount > 0) parts.push(`${centerlineCount} centerline${centerlineCount === 1 ? '' : 's'}`);
    summary =
      `Project footprint estimated from ${parts.join(' and ')} — centre ${locationText}` +
      (width > 0 || height > 0
        ? `, ${width.toFixed(1)} × ${height.toFixed(1)} project units.`
        : '.');
  }

  return {
    hasGeometry: vertices.length > 0,
    source,
    confidence,
    epsg: epsg ?? null,
    marginProjected: margin,
    pointCount,
    lineCount,
    centerlineCount,
    vertexCount: vertices.length,
    bounds,
    center,
    width,
    height,
    areaAcres,
    diagonal,
    bboxWgs84,
    centerWgs84,
    summary,
    warnings,
  };
}
