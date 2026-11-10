import type {
  ContourBlendStats,
  ContourGeneration,
  InclusionBoundary,
  IsoPath,
  SurveyLine,
} from '../types.ts';
import {
  buildPolygonFromSegments,
  clipIsoPathsToPolygon,
  getSegPairs,
  isoPathsToSurveyLines,
  pointInPolygon,
  type IsoPathLineLayers,
} from './contouring.ts';

type Point = { x: number; y: number };

export interface ContourBlendGeometryOptions {
  surveyPaths: IsoPath[];
  gisPaths: IsoPath[];
  boundary: Point[];
  /** Contour interval used to decide which elevations may join. */
  contourInterval: number;
  /** Optional override for the largest endpoint gap a curve may bridge. */
  maxJoinDistance?: number;
}

export interface ContourBlendGeometryResult {
  /** GIS paths trimmed exactly to the outside of the inclusion boundary. */
  gisOutsidePaths: IsoPath[];
  /** Smooth curves that extend trimmed GIS ends to matching survey ends. */
  connectors: IsoPath[];
  matchedEndpoints: number;
  unmatchedGisEndpoints: number;
  /** Joins rejected by the geometric rationality gate. */
  rejectedConnectorCount: number;
  /** Human-readable reasons the rejected joins were not drawn. */
  rationalityIssues: string[];
  maxJoinDistance: number;
}

export interface ContourConnectorRationality {
  acceptable: boolean;
  lengthRatio: number;
  maxBulge: number;
  maxTurnDeg: number;
  totalTurnDeg: number;
  boundaryCrossings: number;
  sourceCrossings: number;
  issues: string[];
}

export interface ContourConnectorRationalityContext {
  boundary: Point[];
  surveyPaths?: IsoPath[];
  gisPaths?: IsoPath[];
}

export interface ApplyContourBlendsResult {
  lines: SurveyLine[];
  stats: Record<string, ContourBlendStats>;
}

interface BoundaryEndpoint {
  point: Point;
  adjacent: Point;
  elevation: number;
  isMajor: boolean;
  /** Direction from the boundary into the contour's own domain. */
  inward: Point;
}

interface JoinCandidate {
  survey: BoundaryEndpoint;
  gis: BoundaryEndpoint;
  distance: number;
  connector: IsoPath;
  /** 0 is perfectly aligned; 180 is an opposing hand-off. */
  turnDeg: number;
  /** Lower is a better first choice: short and directionally aligned. */
  score: number;
}

const COORD_EPS = 1e-6;
const MAX_CONNECTOR_BULGE = 12;
const MAX_CONNECTOR_LENGTH_RATIO = 1.85;
const MAX_CONNECTOR_TURN_DEG = 60;
const MAX_CONNECTOR_TOTAL_TURN_DEG = 260;
const MAX_HANDOFF_DIRECTION_TURN_DEG = 110;

function pointDistance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalize(a: Point): Point | null {
  const length = Math.hypot(a.x, a.y);
  if (length <= COORD_EPS) return null;
  return { x: a.x / length, y: a.y / length };
}

function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const lengthSq = vx * vx + vy * vy;
  if (lengthSq <= COORD_EPS) return pointDistance(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / lengthSq));
  return pointDistance(p, { x: a.x + t * vx, y: a.y + t * vy });
}

function pointToPolygonBoundaryDistance(p: Point, polygon: Point[]): number {
  if (polygon.length < 2) return Infinity;
  let best = Infinity;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    best = Math.min(best, pointToSegmentDistance(p, a, b));
  }
  return best;
}

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
}

function angleDegrees(a: Point, b: Point): number {
  const length = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y);
  if (length <= COORD_EPS) return 180;
  return (Math.acos(Math.max(-1, Math.min(1, dot(a, b) / length))) * 180) / Math.PI;
}

function polylineLength(vertices: Point[]): number {
  let length = 0;
  for (let i = 1; i < vertices.length; i += 1) length += pointDistance(vertices[i - 1], vertices[i]);
  return length;
}

/** Proper interior intersection, excluding shared/end-touching segments. */
function segmentHit(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): { point: Point; t: number; u: number } | null {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const denominator = cross(r, s);
  if (Math.abs(denominator) <= 1e-12) return null;
  const qp = { x: c.x - a.x, y: c.y - a.y };
  const t = cross(qp, s) / denominator;
  const u = cross(qp, r) / denominator;
  const eps = 1e-6;
  if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null;
  return { point: { x: a.x + t * r.x, y: a.y + t * r.y }, t, u };
}

function maxDistanceFromChord(vertices: Point[]): number {
  if (vertices.length < 2) return 0;
  const start = vertices[0];
  const end = vertices[vertices.length - 1];
  const chord = { x: end.x - start.x, y: end.y - start.y };
  const chordLength = Math.hypot(chord.x, chord.y);
  if (chordLength <= COORD_EPS) return 0;
  let maximum = 0;
  for (const vertex of vertices) {
    const relative = { x: vertex.x - start.x, y: vertex.y - start.y };
    maximum = Math.max(maximum, Math.abs(cross(relative, chord)) / chordLength);
  }
  return maximum;
}

function turnMetrics(vertices: Point[]): { maxTurnDeg: number; totalTurnDeg: number; tangentTurnDeg: number } {
  let maxTurnDeg = 0;
  let totalTurnDeg = 0;
  let firstDirection: Point | null = null;
  let lastDirection: Point | null = null;
  for (let i = 1; i < vertices.length - 1; i += 1) {
    const before = normalize({ x: vertices[i].x - vertices[i - 1].x, y: vertices[i].y - vertices[i - 1].y });
    const after = normalize({ x: vertices[i + 1].x - vertices[i].x, y: vertices[i + 1].y - vertices[i].y });
    if (!before || !after) continue;
    firstDirection ??= before;
    lastDirection = after;
    const turn = angleDegrees(before, after);
    maxTurnDeg = Math.max(maxTurnDeg, turn);
    totalTurnDeg += turn;
  }
  return {
    maxTurnDeg,
    totalTurnDeg,
    tangentTurnDeg: firstDirection && lastDirection ? angleDegrees(firstDirection, lastDirection) : 0,
  };
}

function polylineSelfIntersects(vertices: Point[]): boolean {
  for (let i = 0; i < vertices.length - 1; i += 1) {
    for (let j = i + 2; j < vertices.length - 1; j += 1) {
      if (segmentHit(vertices[i], vertices[i + 1], vertices[j], vertices[j + 1])) return true;
    }
  }
  return false;
}

function polylinesCross(a: Point[], b: Point[]): boolean {
  for (let i = 0; i < a.length - 1; i += 1) {
    for (let j = 0; j < b.length - 1; j += 1) {
      if (segmentHit(a[i], a[i + 1], b[j], b[j + 1])) return true;
    }
  }
  return false;
}

function countPolylineCrossings(
  vertices: Point[],
  paths: IsoPath[],
  endpointClearance: number,
): number {
  if (vertices.length < 2) return 0;
  const start = vertices[0];
  const end = vertices[vertices.length - 1];
  let crossings = 0;
  for (const path of paths) {
    const other = path.vertices;
    if (!other || other.length < 2) continue;
    for (let i = 0; i < other.length - 1; i += 1) {
      for (let j = 0; j < vertices.length - 1; j += 1) {
        const hit = segmentHit(vertices[j], vertices[j + 1], other[i], other[i + 1]);
        if (!hit) continue;
        if (pointDistance(hit.point, start) <= endpointClearance) continue;
        if (pointDistance(hit.point, end) <= endpointClearance) continue;
        crossings += 1;
      }
    }
  }
  return crossings;
}

function countBoundaryCrossings(
  vertices: Point[],
  polygon: Point[],
  endpointClearance: number,
): number {
  if (vertices.length < 2 || polygon.length < 3) return 0;
  const start = vertices[0];
  const end = vertices[vertices.length - 1];
  let crossings = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    for (let j = 0; j < vertices.length - 1; j += 1) {
      const hit = segmentHit(vertices[j], vertices[j + 1], a, b);
      if (!hit) continue;
      if (pointDistance(hit.point, start) <= endpointClearance) continue;
      if (pointDistance(hit.point, end) <= endpointClearance) continue;
      crossings += 1;
    }
  }
  return crossings;
}

/**
 * Gimbal-style second look at one proposed transition curve.
 *
 * A contour hand-off is only rational when it is short, stays close to its
 * chord, keeps turning in one direction, and does not cross another contour or
 * the same boundary again. This is deliberately geometry-only: it catches the
 * loops and crossing struts produced by a bad endpoint pairing before they
 * reach the canvas.
 */
export function inspectContourConnectorRationality(
  connector: IsoPath,
  context: ContourConnectorRationalityContext,
): ContourConnectorRationality {
  const vertices = connector.vertices ?? [];
  const issues: string[] = [];
  if (vertices.length < 3) {
    return {
      acceptable: false,
      lengthRatio: 0,
      maxBulge: 0,
      maxTurnDeg: 0,
      totalTurnDeg: 0,
      boundaryCrossings: 0,
      sourceCrossings: 0,
      issues: ['transition curve has no usable geometry'],
    };
  }

  const start = vertices[0];
  const end = vertices[vertices.length - 1];
  const gap = pointDistance(start, end);
  if (gap <= 1e-4) {
    return {
      acceptable: false,
      lengthRatio: 0,
      maxBulge: 0,
      maxTurnDeg: 0,
      totalTurnDeg: 0,
      boundaryCrossings: 0,
      sourceCrossings: 0,
      issues: ['transition curve has a zero-length endpoint gap'],
    };
  }

  const length = polylineLength(vertices);
  const lengthRatio = length / gap;
  const maxBulge = maxDistanceFromChord(vertices);
  const turns = turnMetrics(vertices);
  const endpointClearance = Math.max(0.75, Math.min(6, gap * 0.2));
  const boundaryCrossings = countBoundaryCrossings(vertices, context.boundary, endpointClearance);
  const sourceCrossings = countPolylineCrossings(
    vertices,
    [...(context.surveyPaths ?? []), ...(context.gisPaths ?? [])],
    endpointClearance,
  );
  const bulgeLimit = Math.max(2, Math.min(MAX_CONNECTOR_BULGE, gap * 0.35));

  if (lengthRatio > MAX_CONNECTOR_LENGTH_RATIO) {
    issues.push(`curve length is ${lengthRatio.toFixed(2)}× the endpoint gap`);
  }
  if (maxBulge > bulgeLimit + 0.5) {
    issues.push(`curve bulges ${maxBulge.toFixed(1)} ft off the direct hand-off`);
  }
  if (turns.maxTurnDeg > MAX_CONNECTOR_TURN_DEG) {
    issues.push(`curve has a ${turns.maxTurnDeg.toFixed(0)}° kink`);
  }
  if (turns.totalTurnDeg > MAX_CONNECTOR_TOTAL_TURN_DEG) {
    issues.push(`curve doubles back ${turns.totalTurnDeg.toFixed(0)}°`);
  }
  if (turns.tangentTurnDeg > 120) {
    issues.push('curve ends point in opposing directions');
  }
  if (boundaryCrossings > 0) {
    issues.push(`curve re-crosses the boundary ${boundaryCrossings} time(s)`);
  }
  if (sourceCrossings > 0) {
    issues.push(`curve crosses existing contour linework ${sourceCrossings} time(s)`);
  }
  if (polylineSelfIntersects(vertices)) {
    issues.push('curve loops through itself');
  }

  // A connector that spends samples well outside the inclusion polygon is a
  // strut, not a hand-off. Small excursions next to an endpoint are tolerated
  // for coordinate rounding and boundary smoothing.
  const outsideSamples = vertices.filter(vertex =>
    !pointInPolygon(vertex.x, vertex.y, context.boundary)
    && pointToPolygonBoundaryDistance(vertex, context.boundary) > endpointClearance
  ).length;
  if (outsideSamples >= 2) {
    issues.push(`curve leaves the inclusion area at ${outsideSamples} sample(s)`);
  }

  return {
    acceptable: issues.length === 0,
    lengthRatio,
    maxBulge,
    maxTurnDeg: turns.maxTurnDeg,
    totalTurnDeg: turns.totalTurnDeg,
    boundaryCrossings,
    sourceCrossings,
    issues,
  };
}

function polygonExtent(polygon: Point[]): { width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of polygon) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return {
    width: Number.isFinite(minX) ? maxX - minX : 0,
    height: Number.isFinite(minY) ? maxY - minY : 0,
  };
}

function defaultMaxJoinDistance(polygon: Point[]): number {
  const { width, height } = polygonExtent(polygon);
  const diagonal = Math.hypot(width, height);
  return Math.max(50, Math.min(300, diagonal * 0.2));
}

/**
 * Endpoints produced by clipping land exactly on the boundary. The small
 * tolerance covers rounded coordinates and a smoothing pass that may stop a
 * fraction of a foot short of the line.
 */
function collectBoundaryEndpoints(
  paths: IsoPath[],
  polygon: Point[],
  domain: 'survey' | 'gis',
  boundaryTolerance: number,
): BoundaryEndpoint[] {
  const endpoints: BoundaryEndpoint[] = [];

  for (const path of paths) {
    const vertices = path.vertices;
    if (!vertices || vertices.length < 2 || !Number.isFinite(path.elevation)) continue;

    const candidates = [
      { index: 0, adjacentIndex: 1 },
      { index: vertices.length - 1, adjacentIndex: vertices.length - 2 },
    ];

    for (const candidate of candidates) {
      const endpoint = vertices[candidate.index];
      const adjacent = vertices[candidate.adjacentIndex];
      if (!endpoint || !adjacent) continue;
      // Closed paths duplicate their first vertex at the end.
      if (candidate.index === vertices.length - 1
        && pointDistance(vertices[0], vertices[vertices.length - 1]) <= COORD_EPS) {
        continue;
      }
      if (pointToPolygonBoundaryDistance(endpoint, polygon) > boundaryTolerance) continue;

      // For GIS, continue from the outside vertex toward the boundary. For
      // survey, continue from the boundary into the surveyed interior.
      const inward = domain === 'gis'
        ? normalize({ x: endpoint.x - adjacent.x, y: endpoint.y - adjacent.y })
        : normalize({ x: adjacent.x - endpoint.x, y: adjacent.y - endpoint.y });

      endpoints.push({
        point: { x: endpoint.x, y: endpoint.y },
        adjacent: { x: adjacent.x, y: adjacent.y },
        elevation: path.elevation,
        isMajor: path.isMajor,
        inward: inward ?? { x: 0, y: 0 },
      });
    }
  }

  return endpoints;
}

function buildConnector(
  gis: BoundaryEndpoint,
  survey: BoundaryEndpoint,
  maxJoinDistance: number,
): IsoPath | null {
  const start = gis.point;
  const end = survey.point;
  const gap = pointDistance(start, end);
  if (gap <= 1e-4) return null;

  const chord = normalize({ x: end.x - start.x, y: end.y - start.y }) ?? { x: 1, y: 0 };
  const startDir = normalize(gis.inward) ?? chord;
  const endDir = normalize(survey.inward) ?? chord;
  // Clamp the control handles to a narrow tube around the chord. Long handles
  // are what let a mismatched pair bow into a steep, unnatural-looking strut.
  const maxBulge = Math.max(1.5, Math.min(MAX_CONNECTOR_BULGE, gap * 0.2));
  const perpendicular = Math.max(
    0.05,
    Math.abs(cross(startDir, chord)),
    Math.abs(cross(endDir, chord)),
  );
  const handle = Math.min(
    gap * 0.45,
    maxJoinDistance * 0.3,
    maxBulge / (0.75 * perpendicular),
  );
  const control1 = { x: start.x + startDir.x * handle, y: start.y + startDir.y * handle };
  const control2 = { x: end.x - endDir.x * handle, y: end.y - endDir.y * handle };

  const vertices: Point[] = [{ ...start }];
  const samples = 12;
  for (let i = 1; i <= samples; i += 1) {
    const t = i / samples;
    const mt = 1 - t;
    const x = mt ** 3 * start.x
      + 3 * mt ** 2 * t * control1.x
      + 3 * mt * t ** 2 * control2.x
      + t ** 3 * end.x;
    const y = mt ** 3 * start.y
      + 3 * mt ** 2 * t * control1.y
      + 3 * mt * t ** 2 * control2.y
      + t ** 3 * end.y;
    vertices.push({ x, y });
  }
  // Preserve the survey endpoint exactly so the two contour pieces meet.
  vertices[vertices.length - 1] = { ...end };

  return {
    elevation: survey.elevation,
    isMajor: survey.isMajor,
    vertices,
  };
}

/**
 * Build the physical hand-off between an inside survey generation and outside
 * ESRI/State contours.
 *
 * Both sources are clipped against the inclusion boundary. Each ESRI end that
 * lands on the boundary is paired with the nearest survey end at the same
 * elevation. A cubic transition curve then extends the ESRI line into the
 * survey endpoint, so the outside GIS linework visually grows into the
 * surveyed ground truth instead of stopping at an unrelated boundary point.
 */
export function blendGisContoursToSurvey(
  options: ContourBlendGeometryOptions,
): ContourBlendGeometryResult {
  const { surveyPaths, gisPaths, boundary, contourInterval } = options;
  if (!boundary || boundary.length < 3) {
    return {
      gisOutsidePaths: gisPaths,
      connectors: [],
      matchedEndpoints: 0,
      unmatchedGisEndpoints: 0,
      rejectedConnectorCount: 0,
      rationalityIssues: [],
      maxJoinDistance: 0,
    };
  }

  const maxJoinDistance = Math.max(
    1,
    options.maxJoinDistance ?? defaultMaxJoinDistance(boundary),
  );
  const boundaryTolerance = 0.5;
  // Survey generations are already clipped to the inside of their inclusion
  // boundary. Re-clipping here can collapse a boundary endpoint into a
  // duplicate zero-length segment, so use the stored inside paths as-is.
  const gisOutside = clipIsoPathsToPolygon(gisPaths, boundary, 'outside');

  const surveyEndpoints = collectBoundaryEndpoints(
    surveyPaths,
    boundary,
    'survey',
    boundaryTolerance,
  );
  const gisEndpoints = collectBoundaryEndpoints(
    gisOutside,
    boundary,
    'gis',
    boundaryTolerance,
  );

  const elevationTolerance = Math.max(0.05, Math.min(0.25, Math.abs(contourInterval) * 0.1));
  const candidates: JoinCandidate[] = [];
  for (const survey of surveyEndpoints) {
    for (const gis of gisEndpoints) {
      if (Math.abs(survey.elevation - gis.elevation) > elevationTolerance) continue;
      const distance = pointDistance(survey.point, gis.point);
      if (distance > maxJoinDistance || distance <= 1e-4) continue;
      const connector = buildConnector(gis, survey, maxJoinDistance);
      if (!connector) continue;
      const turnDeg = angleDegrees(gis.inward, survey.inward);
      // Prefer a directionally aligned, short hand-off. Distance alone happily
      // chooses the opposite side of the boundary, which is what creates the
      // crossing transition curves this check exists to stop.
      const score = distance + (turnDeg / 180) * Math.min(maxJoinDistance, 60) * 0.4;
      candidates.push({ survey, gis, distance, connector, turnDeg, score });
    }
  }
  candidates.sort((a, b) => a.score - b.score);

  const usedSurvey = new Set<BoundaryEndpoint>();
  const usedGis = new Set<BoundaryEndpoint>();
  const connectors: IsoPath[] = [];
  const acceptedConnectors: IsoPath[] = [];
  const rationalityIssues: string[] = [];
  let rejectedConnectorCount = 0;

  const noteRejection = (issues: string[]) => {
    rejectedConnectorCount += 1;
    for (const issue of issues) {
      if (rationalityIssues.length < 6 && !rationalityIssues.includes(issue)) {
        rationalityIssues.push(issue);
      }
    }
  };

  for (const candidate of candidates) {
    if (usedSurvey.has(candidate.survey) || usedGis.has(candidate.gis)) continue;
    if (candidate.turnDeg > MAX_HANDOFF_DIRECTION_TURN_DEG) {
      noteRejection([
        `contour directions differ by ${candidate.turnDeg.toFixed(0)}° at the boundary`,
      ]);
      continue;
    }
    const inspection = inspectContourConnectorRationality(candidate.connector, {
      boundary,
      surveyPaths,
      gisPaths: gisOutside,
    });
    if (!inspection.acceptable) {
      noteRejection(inspection.issues);
      continue;
    }
    if (acceptedConnectors.some(existing => polylinesCross(existing.vertices, candidate.connector.vertices))) {
      noteRejection(['transition curve would cross an accepted blend']);
      continue;
    }
    usedSurvey.add(candidate.survey);
    usedGis.add(candidate.gis);
    acceptedConnectors.push(candidate.connector);
    connectors.push(candidate.connector);
  }

  return {
    gisOutsidePaths: gisOutside,
    connectors,
    matchedEndpoints: connectors.length,
    unmatchedGisEndpoints: Math.max(0, gisEndpoints.length - usedGis.size),
    rejectedConnectorCount,
    rationalityIssues,
    maxJoinDistance,
  };
}

function emptyStats(status: ContourBlendStats['status']): ContourBlendStats {
  return {
    status,
    connectorCount: 0,
    matchedEndpoints: 0,
    unmatchedGisEndpoints: 0,
    rejectedConnectorCount: 0,
    rationalityIssues: [],
    targetGenerationIds: [],
    maxJoinDistance: 0,
  };
}

function polygonForBoundary(lines: SurveyLine[], polylineId: string): Point[] {
  const boundaryLines = lines.filter(line =>
    line.type === 'inclusion' && line.polylineId === polylineId,
  );
  const segments = getSegPairs(boundaryLines);
  return segments.length >= 3 ? buildPolygonFromSegments(segments) : [];
}

function segmentMetadataKey(a: Point, b: Point): string {
  return `${a.x.toFixed(4)},${a.y.toFixed(4)}>${b.x.toFixed(4)},${b.y.toFixed(4)}`;
}

/**
 * Reconcile an IsoPath's elevation with the rendered SurveyLine metadata.
 *
 * Contour generations normally carry elevation on the path, but saved/imported
 * generations can have stale path metadata while every rendered segment still
 * has the authoritative Z from the source line. The blend must use that line
 * metadata: if a survey contour is at 10.0 and the ESRI contour is at 12.0,
 * they must not be joined just because the stale paths both say 0.
 */
export function resolveIsoPathElevationsFromLines(
  paths: IsoPath[],
  lines: SurveyLine[],
  generationId: string,
): IsoPath[] {
  const elevationBySegment = new Map<string, number>();

  for (const line of lines) {
    if (line.contourGenId !== generationId || line.blendDerived) continue;
    if (!line.fromPt || !line.toPt) continue;
    const elevation = Number.isFinite(line.fromPt.z)
      ? line.fromPt.z
      : Number.isFinite(line.toPt.z)
        ? line.toPt.z
        : null;
    if (elevation === null) continue;
    elevationBySegment.set(segmentMetadataKey(line.fromPt, line.toPt), elevation);
  }

  if (elevationBySegment.size === 0) return paths;

  return paths.map(path => {
    const counts = new Map<number, number>();
    for (let index = 0; index < path.vertices.length - 1; index += 1) {
      const elevation = elevationBySegment.get(
        segmentMetadataKey(path.vertices[index], path.vertices[index + 1]),
      );
      if (elevation === undefined) continue;
      counts.set(elevation, (counts.get(elevation) ?? 0) + 1);
    }

    let resolvedElevation: number | null = null;
    let bestCount = 0;
    for (const [elevation, count] of counts) {
      if (count > bestCount) {
        resolvedElevation = elevation;
        bestCount = count;
      }
    }

    return resolvedElevation !== null && resolvedElevation !== path.elevation
      ? { ...path, elevation: resolvedElevation }
      : path;
  });
}

/**
 * Rebuild rendered contour lines with every active survey/ESRI blend.
 *
 * The function is deliberately idempotent: derived curves and trimmed ESRI
 * pieces from a previous pass are discarded, source lines are restored, and the
 * current generation settings are applied again. That lets the App recompute a
 * blend after point regeneration, boundary edits, visibility toggles, or a new
 * ESRI download without accumulating duplicate curves.
 */
export function applyContourBlends(
  lines: SurveyLine[],
  generations: ContourGeneration[],
  boundaries: InclusionBoundary[],
  lineLayers: IsoPathLineLayers,
): ApplyContourBlendsResult {
  const hasDerivedLines = lines.some(line => line.blendDerived || line.blendHidden);
  const baseLines = lines
    .filter(line => !line.blendDerived)
    .map(line => {
      if (!line.blendHidden) return line;
      const restored: SurveyLine = {
        ...line,
        hidden: line.blendOriginalHidden ?? false,
      };
      delete restored.blendHidden;
      delete restored.blendOriginalHidden;
      return restored;
    });

  const active = generations.filter(generation =>
    generation.visible
    && generation.source !== 'esri'
    && generation.esriBlendEnabled
    && !!generation.esriBlendInclusionPolylineId,
  );
  if (active.length === 0) {
    return { lines: hasDerivedLines ? baseLines : lines, stats: {} };
  }

  const esriGenerations = generations.filter(generation =>
    generation.visible && generation.source === 'esri' && generation.isoPaths.length > 0,
  );
  if (esriGenerations.length === 0) {
    const stats: Record<string, ContourBlendStats> = {};
    for (const generation of active) stats[generation.id] = emptyStats('no-esri');
    return { lines: hasDerivedLines ? baseLines : lines, stats };
  }

  interface ActiveBlend {
    generation: ContourGeneration;
    boundary: Point[];
    esriGenerations: ContourGeneration[];
    geometry: ContourBlendGeometryResult;
  }

  const stats: Record<string, ContourBlendStats> = {};
  const activeBlends: ActiveBlend[] = [];

  for (const generation of active) {
    const boundary = boundaries.find(candidate =>
      candidate.polylineId === generation.esriBlendInclusionPolylineId,
    );
    if (!boundary) {
      stats[generation.id] = emptyStats('no-boundary');
      continue;
    }
    const polygon = polygonForBoundary(baseLines, boundary.polylineId);
    if (polygon.length < 3) {
      stats[generation.id] = emptyStats('no-boundary');
      continue;
    }

    const associated = esriGenerations.filter(candidate =>
      !candidate.activeInclusionBoundaryId || candidate.activeInclusionBoundaryId === boundary.id,
    );
    // Older sessions can have a different active-boundary id saved on the ESRI
    // generation. Fall back to every visible ESRI generation rather than
    // silently refusing to blend the contours already on the canvas.
    const targets = associated.length > 0 ? associated : esriGenerations;

    const surveyPaths = resolveIsoPathElevationsFromLines(
      generation.isoPaths,
      baseLines,
      generation.id,
    );
    const gisPaths = targets.flatMap(candidate =>
      resolveIsoPathElevationsFromLines(candidate.isoPaths, baseLines, candidate.id),
    );
    const geometry = blendGisContoursToSurvey({
      surveyPaths,
      gisPaths,
      boundary: polygon,
      contourInterval: generation.settings.contourInterval,
    });
    activeBlends.push({ generation, boundary: polygon, esriGenerations: targets, geometry });
    stats[generation.id] = {
      status: 'blended',
      connectorCount: geometry.connectors.length,
      matchedEndpoints: geometry.matchedEndpoints,
      unmatchedGisEndpoints: geometry.unmatchedGisEndpoints,
      rejectedConnectorCount: geometry.rejectedConnectorCount,
      rationalityIssues: geometry.rationalityIssues,
      targetGenerationIds: targets.map(candidate => candidate.id),
      maxJoinDistance: geometry.maxJoinDistance,
    };
  }

  if (activeBlends.length === 0) {
    return { lines: hasDerivedLines ? baseLines : lines, stats };
  }

  const targetIds = new Set(
    activeBlends.flatMap(blend => blend.esriGenerations.map(generation => generation.id)),
  );
  let result: SurveyLine[] = baseLines.map(line => {
    if (!line.contourGenId || !targetIds.has(line.contourGenId)) return line;
    return {
      ...line,
      hidden: true,
      blendHidden: true,
      blendOriginalHidden: !!line.hidden,
    };
  });

  const clippedKeys = new Set<string>();
  for (const blend of activeBlends) {
    const polylineId = blend.generation.esriBlendInclusionPolylineId;
    for (const esriGeneration of blend.esriGenerations) {
      const clipKey = `${polylineId}|${esriGeneration.id}`;
      if (clippedKeys.has(clipKey)) continue;
      clippedKeys.add(clipKey);

      const template = baseLines.find(line =>
        line.contourGenId === esriGeneration.id
        && !line.blendDerived
        && !!line.fromPt
        && !!line.toPt,
      );
      const clippedPaths = clipIsoPathsToPolygon(
        resolveIsoPathElevationsFromLines(esriGeneration.isoPaths, baseLines, esriGeneration.id),
        blend.boundary,
        'outside',
      );
      const clippedLines = isoPathsToSurveyLines(clippedPaths, esriGeneration.id, {
        majorLayer: template?.layer,
        minorLayer: template?.layer,
        majorLineType: template?.lineType,
        minorLineType: template?.lineType,
      }).map(line => ({
        ...line,
        source: 'esri' as const,
        ...(template?.color ? { color: template.color } : {}),
        blendDerived: true,
        blendOwnerId: blend.generation.id,
      }));
      result.push(...clippedLines);
    }

    const connectorLines = isoPathsToSurveyLines(
      blend.geometry.connectors,
      blend.generation.id,
      lineLayers,
    ).map(line => ({
      ...line,
      blendDerived: true,
      blendOwnerId: blend.generation.id,
    }));
    result.push(...connectorLines);
  }

  return { lines: result, stats };
}
