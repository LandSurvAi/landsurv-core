/**
 * Planar Boundary Loop & Island Tracer for CAD Hatching
 *
 * Supports both CAD Hatch workflows:
 *  1. `resolveHatchFromSelectedEntities` — Select Object mode:
 *     Extracts closed outer loops and nested island holes from selected
 *     SurveyLines (polylines, circles, chained segments) or BoundaryFiles.
 *  2. `traceEnclosingLoopAtPoint` — Click in Area (Pick Internal Point) mode:
 *     Builds a planar arrangement from all visible canvas geometry (lines,
 *     polylines, tessellated arcs/circles, and boundary file calls), snaps
 *     near-coincident endpoints, splits at intersections, finds the smallest
 *     enclosing face containing the cursor/click point, and automatically
 *     identifies interior island holes (`isHole: true`).
 */import type { BoundaryFile, HatchBoundaryLoop, SurveyLine, SurveyPoint } from '../types';
import { parseBearingToRadians } from './cogo';
import { resolveArcGeometry } from './offsetGeometry';

export interface Pt2D {
  x: number;
  y: number;
}

export interface TracedHatchRegion {
  outerLoop: HatchBoundaryLoop;
  holes: HatchBoundaryLoop[];
  loops: HatchBoundaryLoop[];
  boundingLineIds: string[];
  areaSqFt: number;
}

const EPS = 1e-4;

/** Signed shoelace area of a polygon ring (positive = CCW, negative = CW). */
export function computeSignedPolygonArea(vertices: Pt2D[]): number {
  const n = vertices.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum * 0.5;
}

export function computePolygonAreaAbs(vertices: Pt2D[]): number {
  return Math.abs(computeSignedPolygonArea(vertices));
}

/** Ray-casting point-in-polygon check. */
export function isPointInPolygon(pt: Pt2D, ring: Pt2D[]): boolean {
  const n = ring.length;
  if (n < 3) return false;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i].x, yi = ring[i].y;
    const xj = ring[j].x, yj = ring[j].y;
    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-15) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Remove consecutive duplicate vertices and trailing start duplicate. */
function cleanLoopVertices(pts: Pt2D[], tol = 1e-3): Pt2D[] {
  if (pts.length === 0) return [];
  const out: Pt2D[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = out[out.length - 1];
    if (Math.hypot(pts[i].x - prev.x, pts[i].y - prev.y) > tol) {
      out.push(pts[i]);
    }
  }
  if (
    out.length > 2 &&
    Math.hypot(out[out.length - 1].x - out[0].x, out[out.length - 1].y - out[0].y) <= tol
  ) {
    out.pop();
  }
  return out;
}

/** Resolve world coordinates for a SurveyLine's endpoints. */
export function getLineEndpoints(
  line: SurveyLine,
  pointMap: Map<string, SurveyPoint>,
): { p1: Pt2D; p2: Pt2D } | null {
  const sp1 = pointMap.get(line.from);
  const sp2 = pointMap.get(line.to);
  const p1 = sp1
    ? { x: sp1.easting, y: sp1.northing }
    : line.fromPt
      ? { x: line.fromPt.x, y: line.fromPt.y }
      : null;
  const p2 = sp2
    ? { x: sp2.easting, y: sp2.northing }
    : line.toPt
      ? { x: line.toPt.x, y: line.toPt.y }
      : null;
  if (!p1 || !p2) return null;
  if (!Number.isFinite(p1.x) || !Number.isFinite(p1.y) || !Number.isFinite(p2.x) || !Number.isFinite(p2.y)) {
    return null;
  }
  return { p1, p2 };
}/** Tessellate a full circle into a closed polygon ring. */
function tessellateCircle(center: Pt2D, radius: number, steps = 36): Pt2D[] {
  const pts: Pt2D[] = [];
  for (let i = 0; i < steps; i++) {
    const theta = (2 * Math.PI * i) / steps;
    pts.push({
      x: center.x + radius * Math.cos(theta),
      y: center.y + radius * Math.sin(theta),
    });
  }
  return pts;
}

/**
 * Split a SurveyLine into boundary segments, following the true arc when the
 * entity is curved. Chord-only tracing made concave arc boundaries leak hatch
 * fill outside the drawn linework.
 */
function tessellateSurveyLineSegments(
  line: SurveyLine,
  endpoints: { p1: Pt2D; p2: Pt2D },
  lineId: string,
): RawSegment[] {
  const chord: RawSegment[] = [{ p1: endpoints.p1, p2: endpoints.p2, lineId }];
  if (!line.isCurve || line.isCircle || !line.curveRadius || !line.arcLength) return chord;

  const arc = resolveArcGeometry(endpoints.p1, endpoints.p2, {
    radius: line.curveRadius,
    arcLength: line.arcLength,
    center: line.circleCenter ? { x: line.circleCenter.x, y: line.circleCenter.y } : undefined,
    curveDirection: line.curveDirection,
    tangentBearing: line.tangentBearing,
    chordBearing: line.chordBearing,
    bearing: line.bearing,
  });
  if (!arc || !(arc.centralAngle > 1e-6)) return chord;

  const steps = Math.max(4, Math.min(96, Math.ceil(arc.centralAngle / (Math.PI / 24))));
  const points: Pt2D[] = [{ ...endpoints.p1 }];
  for (let i = 1; i < steps; i++) {
    const theta = arc.isLeftCurve
      ? arc.startAngle + (arc.centralAngle * i) / steps
      : arc.startAngle - (arc.centralAngle * i) / steps;
    points.push({
      x: arc.center.x + arc.radius * Math.cos(theta),
      y: arc.center.y + arc.radius * Math.sin(theta),
    });
  }
  points.push({ ...endpoints.p2 });

  return points.slice(0, -1).map((p1, index) => ({ p1, p2: points[index + 1], lineId }));
}

/** Extract vertices from a BoundaryFile's calls using pointMap or pobOverride + bearings. */
export function extractBoundaryFileLoop(
  bf: BoundaryFile,
  pointMap: Map<string, SurveyPoint>,
): Pt2D[] | null {
  if (!bf.calls || bf.calls.length < 3) return null;
  const tx = bf.translationE ?? 0;
  const ty = bf.translationN ?? 0;
  const rotRad = ((bf.rotationDeg ?? 0) * Math.PI) / 180;

  const pts: Pt2D[] = [];
  const firstCall = bf.calls[0];
  const firstPt = pointMap.get(firstCall.from);
  let cur: Pt2D = firstPt
    ? { x: firstPt.easting, y: firstPt.northing }
    : bf.pobOverride
      ? { x: bf.pobOverride.easting, y: bf.pobOverride.northing }
      : { x: 0, y: 0 };

  const anchor = { ...cur };
  pts.push({ ...cur });

  for (const call of bf.calls) {
    const toSp = pointMap.get(call.to);
    if (toSp) {
      cur = { x: toSp.easting, y: toSp.northing };
      pts.push({ ...cur });
      continue;
    }
    const azRad = parseBearingToRadians(call.chordBearing || call.bearing || '');
    const dist = parseFloat(String(call.chordDistance ?? call.distance ?? '0'));
    if (azRad !== null && Number.isFinite(dist) && dist > 0) {
      cur = {
        x: cur.x + dist * Math.sin(azRad),
        y: cur.y + dist * Math.cos(azRad),
      };
      pts.push({ ...cur });
    }
  }

  const cleaned = cleanLoopVertices(pts, 0.05);
  if (cleaned.length < 3) return null;

  // Apply boundary file translation/rotation if any
  if (Math.abs(tx) > 1e-6 || Math.abs(ty) > 1e-6 || Math.abs(rotRad) > 1e-6) {
    const cos = Math.cos(rotRad);
    const sin = Math.sin(rotRad);
    return cleaned.map(p => {
      const dx = p.x - anchor.x;
      const dy = p.y - anchor.y;
      return {
        x: anchor.x + dx * cos - dy * sin + tx,
        y: anchor.y + dx * sin + dy * cos + ty,
      };
    });
  }
  return cleaned;
}

/**
 * Given a set of candidate closed loops, classify them into one or more regions
 * with outer boundaries and interior island holes.
 */
export function classifyOuterAndHoleLoops(
  rawLoops: Array<{ vertices: Pt2D[]; sourceLineIds?: string[] }>,
): TracedHatchRegion | null {
  const valid = rawLoops
    .map(l => ({
      vertices: cleanLoopVertices(l.vertices),
      sourceLineIds: l.sourceLineIds ?? [],
    }))
    .filter(l => l.vertices.length >= 3 && computePolygonAreaAbs(l.vertices) > 1e-3)
    .sort((a, b) => computePolygonAreaAbs(b.vertices) - computePolygonAreaAbs(a.vertices));

  if (valid.length === 0) return null;

  const outer = valid[0];
  const outerArea = computePolygonAreaAbs(outer.vertices);
  const holes: HatchBoundaryLoop[] = [];
  const allLineIds = new Set<string>(outer.sourceLineIds);
  let holeAreaSum = 0;

  for (let i = 1; i < valid.length; i++) {
    const candidate = valid[i];
    // A loop is an island hole if its first vertex lies strictly inside the outer loop
    if (isPointInPolygon(candidate.vertices[0], outer.vertices)) {
      holes.push({
        vertices: candidate.vertices,
        isHole: true,
        sourceLineIds: candidate.sourceLineIds,
      });
      holeAreaSum += computePolygonAreaAbs(candidate.vertices);
      candidate.sourceLineIds.forEach(id => allLineIds.add(id));
    }
  }

  const outerLoop: HatchBoundaryLoop = {
    vertices: outer.vertices,
    isHole: false,
    sourceLineIds: outer.sourceLineIds,
  };

  return {
    outerLoop,
    holes,
    loops: [outerLoop, ...holes],
    boundingLineIds: [...allLineIds],
    areaSqFt: Math.max(0, outerArea - holeAreaSum),
  };
}

/**
 * Mode 1 — Select Object(s):
 * Builds a hatch region from selected line IDs (or a single clicked line that
 * belongs to a closed polyline, circle, or connected segment chain).
 */
export function resolveHatchFromSelectedEntities(
  selectedLineIds: Iterable<string>,
  lines: SurveyLine[],
  pointMap: Map<string, SurveyPoint>,
  boundaryFiles: BoundaryFile[] = [],
  snapTolerance = 0.25,
): TracedHatchRegion | null {
  const idSet = new Set(selectedLineIds);
  if (idSet.size === 0) return null;

  // Expand selection: if any selected line has a `polylineId`, include all visible segments with that polylineId
  const expandedLines: SurveyLine[] = [];
  const seenLineKeys = new Set<string>();
  const polylineIds = new Set<string>();

  for (const line of lines) {
    if (line.hidden) continue;
    const lid = line.id || `${line.from}-${line.to}`;
    if (idSet.has(lid) && line.polylineId) {
      polylineIds.add(line.polylineId);
    }
  }

  for (const line of lines) {
    if (line.hidden) continue;
    const lid = line.id || `${line.from}-${line.to}`;
    if (idSet.has(lid) || (line.polylineId && polylineIds.has(line.polylineId))) {
      if (!seenLineKeys.has(lid)) {
        seenLineKeys.add(lid);
        expandedLines.push(line);
      }
    }
  }

  // If a single non-polyline segment was clicked, try to trace its connected closed chain among all visible lines
  if (expandedLines.length === 1 && !expandedLines[0].isCircle && !expandedLines[0].fillPath) {
    const single = expandedLines[0];
    const ep = getLineEndpoints(single, pointMap);
    if (ep) {
      const chainLoop = traceClosedChainFromSeedSegment(single, lines, pointMap, snapTolerance);
      if (chainLoop) {
        return classifyOuterAndHoleLoops([chainLoop]);
      }
    }
  }

  const extractedLoops: Array<{ vertices: Pt2D[]; sourceLineIds: string[] }> = [];
  const remainingSegments: Array<{ p1: Pt2D; p2: Pt2D; lineId: string }> = [];

  for (const line of expandedLines) {
    const lid = line.id || `${line.from}-${line.to}`;
    if (line.fillPath && line.fillPath.length >= 3) {
      extractedLoops.push({
        vertices: line.fillPath.map(p => ({ x: p.x, y: p.y })),
        sourceLineIds: [lid],
      });
      continue;
    }
    if (line.isCircle && line.curveRadius && line.curveRadius > 0) {
      const center = line.circleCenter
        ? { x: line.circleCenter.x, y: line.circleCenter.y }
        : getLineEndpoints(line, pointMap)?.p1;
      if (center) {
        extractedLoops.push({
          vertices: tessellateCircle(center, line.curveRadius),
          sourceLineIds: [lid],
        });
        continue;
      }
    }
    const ep = getLineEndpoints(line, pointMap);
    if (ep && Math.hypot(ep.p2.x - ep.p1.x, ep.p2.y - ep.p1.y) > EPS) {
      remainingSegments.push(...tessellateSurveyLineSegments(line, ep, lid));
    }
  }

  // Stitch remaining segments into closed loops
  const stitched = stitchSegmentsIntoLoops(remainingSegments, snapTolerance);
  extractedLoops.push(...stitched);

  if (extractedLoops.length === 0 && boundaryFiles.length > 0) {
    for (const bf of boundaryFiles) {
      if (bf.hidden) continue;
      if (bf.drawnLineIds?.some(id => idSet.has(id))) {
        const bfVerts = extractBoundaryFileLoop(bf, pointMap);
        if (bfVerts) {
          extractedLoops.push({ vertices: bfVerts, sourceLineIds: bf.drawnLineIds ?? [] });
        }
      }
    }
  }

  return classifyOuterAndHoleLoops(extractedLoops);
}

/** Stitch an unordered list of segments into closed polygon loops. */
function stitchSegmentsIntoLoops(
  segments: Array<{ p1: Pt2D; p2: Pt2D; lineId: string }>,
  tol = 0.25,
): Array<{ vertices: Pt2D[]; sourceLineIds: string[] }> {
  const used = new Array(segments.length).fill(false);
  const loops: Array<{ vertices: Pt2D[]; sourceLineIds: string[] }> = [];

  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const chain: Pt2D[] = [{ ...segments[i].p1 }, { ...segments[i].p2 }];
    const lineIds: string[] = [segments[i].lineId];

    let progressed = true;
    while (progressed) {
      progressed = false;
      const tail = chain[chain.length - 1];
      const head = chain[0];
      if (chain.length >= 4 && Math.hypot(tail.x - head.x, tail.y - head.y) <= tol) {
        break;
      }
      for (let j = 0; j < segments.length; j++) {
        if (used[j]) continue;
        const s = segments[j];
        if (Math.hypot(s.p1.x - tail.x, s.p1.y - tail.y) <= tol) {
          used[j] = true;
          chain.push({ ...s.p2 });
          lineIds.push(s.lineId);
          progressed = true;
          break;
        }
        if (Math.hypot(s.p2.x - tail.x, s.p2.y - tail.y) <= tol) {
          used[j] = true;
          chain.push({ ...s.p1 });
          lineIds.push(s.lineId);
          progressed = true;
          break;
        }
      }
    }

    if (
      chain.length >= 4 &&
      Math.hypot(chain[chain.length - 1].x - chain[0].x, chain[chain.length - 1].y - chain[0].y) <= tol
    ) {
      const cleaned = cleanLoopVertices(chain, tol * 0.5);
      if (cleaned.length >= 3) {
        loops.push({ vertices: cleaned, sourceLineIds: lineIds });
      }
    }
  }

  return loops;
}

/** BFS shortest closed cycle containing `seedLine` in the visible segment graph. */
function traceClosedChainFromSeedSegment(
  seedLine: SurveyLine,
  allLines: SurveyLine[],
  pointMap: Map<string, SurveyPoint>,
  tol = 0.25,
): { vertices: Pt2D[]; sourceLineIds: string[] } | null {
  const seedId = seedLine.id || `${seedLine.from}-${seedLine.to}`;
  const seedEp = getLineEndpoints(seedLine, pointMap);
  if (!seedEp) return null;

  const nodes: Pt2D[] = [];
  const getNodeIdx = (pt: Pt2D): number => {
    for (let i = 0; i < nodes.length; i++) {
      if (Math.hypot(nodes[i].x - pt.x, nodes[i].y - pt.y) <= tol) return i;
    }
    nodes.push({ ...pt });
    return nodes.length - 1;
  };

  const uSeed = getNodeIdx(seedEp.p1);
  const vSeed = getNodeIdx(seedEp.p2);
  if (uSeed === vSeed) return null;

  const adj = new Map<number, Array<{ to: number; lineId: string }>>();
  const addEdge = (a: number, b: number, lineId: string) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push({ to: b, lineId });
    adj.get(b)!.push({ to: a, lineId });
  };

  for (const ln of allLines) {
    if (ln.hidden || ln.isCircle) continue;
    const lid = ln.id || `${ln.from}-${ln.to}`;
    if (lid === seedId) continue;
    const ep = getLineEndpoints(ln, pointMap);
    if (!ep) continue;
    const u = getNodeIdx(ep.p1);
    const v = getNodeIdx(ep.p2);
    if (u !== v) addEdge(u, v, lid);
  }

  // BFS from vSeed to uSeed without using seedId
  const queue: number[] = [vSeed];
  const parent = new Map<number, { prev: number; lineId: string }>();
  const visited = new Set<number>([vSeed]);

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr === uSeed) break;
    for (const edge of adj.get(curr) ?? []) {
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        parent.set(edge.to, { prev: curr, lineId: edge.lineId });
        queue.push(edge.to);
      }
    }
  }

  if (!visited.has(uSeed)) return null;

  const vertices: Pt2D[] = [nodes[uSeed]];
  const lineIds: string[] = [seedId];
  let step = uSeed;
  while (step !== vSeed) {
    const p = parent.get(step);
    if (!p) break;
    vertices.push(nodes[p.prev]);
    lineIds.push(p.lineId);
    step = p.prev;
  }

  if (vertices.length < 2) return null;

  // Re-trace the closed cycle with arc segments so a concave curve does not
  // fall back to its chord when the user picks just one chain member. A chord
  // plus one arc is a valid two-edge loop once the arc is tessellated.
  const cycleSegments: RawSegment[] = [];
  for (const id of new Set(lineIds)) {
    const line = allLines.find(candidate => (candidate.id || `${candidate.from}-${candidate.to}`) === id);
    if (!line) continue;
    const ep = getLineEndpoints(line, pointMap);
    if (!ep) continue;
    cycleSegments.push(...tessellateSurveyLineSegments(line, ep, id));
  }
  const stitched = stitchSegmentsIntoLoops(cycleSegments, tol);
  if (stitched.length > 0) return stitched[0];

  return vertices.length >= 3 ? { vertices, sourceLineIds: lineIds } : null;
}

// ─── Mode 2: Click in Area (Planar Arrangement Face Finder) ──────────────────

interface RawSegment {
  p1: Pt2D;
  p2: Pt2D;
  lineId: string;
}

/** Compute segment-segment intersection parameter (t along A, u along B). */
function intersectSegments(
  a1: Pt2D,
  a2: Pt2D,
  b1: Pt2D,
  b2: Pt2D,
): { x: number; y: number; t: number; u: number } | null {
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) < 1e-10) return null;

  const dx = b1.x - a1.x;
  const dy = b1.y - a1.y;
  const t = (dx * dby - dy * dbx) / denom;
  const u = (dx * day - dy * dax) / denom;

  if (t >= -1e-5 && t <= 1 + 1e-5 && u >= -1e-5 && u <= 1 + 1e-5) {
    return {
      x: a1.x + t * dax,
      y: a1.y + t * day,
      t: Math.max(0, Math.min(1, t)),
      u: Math.max(0, Math.min(1, u)),
    };
  }
  return null;
}

/**
 * Mode 2 — Click in Area (Pick Internal Point):
 * Traces the smallest closed polygon enclosing `clickWorldPt` from all visible
 * canvas linework (SurveyLines, polylines, circles, and BoundaryFile parcels)
 * and detects any interior island holes inside that polygon.
 */
export function traceEnclosingLoopAtPoint(
  clickWorldPt: Pt2D,
  lines: SurveyLine[],
  pointMap: Map<string, SurveyPoint>,
  boundaryFiles: BoundaryFile[] = [],
  options?: { snapTolerance?: number; maxSegments?: number },
): TracedHatchRegion | null {
  const snapTol = options?.snapTolerance ?? 0.25;
  const maxSegments = options?.maxSegments ?? 1200;

  // 1. Collect standalone closed circles & boundary loops + raw line segments
  const standaloneLoops: Array<{ vertices: Pt2D[]; sourceLineIds: string[]; area: number }> = [];
  const rawSegments: RawSegment[] = [];

  for (const line of lines) {
    if (line.hidden) continue;
    if (line.type === 'contour-major' || line.type === 'contour-minor' || line.type === 'tin-edge' || line.type === 'steep-slope') {
      continue;
    }
    const lid = line.id || `${line.from}-${line.to}`;

    if (line.isCircle && line.curveRadius && line.curveRadius > 0) {
      const center = line.circleCenter
        ? { x: line.circleCenter.x, y: line.circleCenter.y }
        : getLineEndpoints(line, pointMap)?.p1;
      if (center) {
        const verts = tessellateCircle(center, line.curveRadius, 36);
        standaloneLoops.push({
          vertices: verts,
          sourceLineIds: [lid],
          area: computePolygonAreaAbs(verts),
        });
      }
      continue;
    }

    const ep = getLineEndpoints(line, pointMap);
    if (!ep) continue;
    if (Math.hypot(ep.p2.x - ep.p1.x, ep.p2.y - ep.p1.y) <= EPS) continue;
    rawSegments.push(...tessellateSurveyLineSegments(line, ep, lid));
  }

  for (const bf of boundaryFiles) {
    if (bf.hidden) continue;
    const bfVerts = extractBoundaryFileLoop(bf, pointMap);
    if (bfVerts && bfVerts.length >= 3) {
      standaloneLoops.push({
        vertices: bfVerts,
        sourceLineIds: bf.drawnLineIds ?? [`bf:${bf.id}`],
        area: computePolygonAreaAbs(bfVerts),
      });
      for (let i = 0; i < bfVerts.length; i++) {
        rawSegments.push({
          p1: bfVerts[i],
          p2: bfVerts[(i + 1) % bfVerts.length],
          lineId: bf.drawnLineIds?.[i] ?? `bf:${bf.id}:${i}`,
        });
      }
    }
  }

  // Cap segments near clickWorldPt if drawing is huge
  let activeSegments = rawSegments;
  if (activeSegments.length > maxSegments) {
    activeSegments = [...activeSegments]
      .sort((a, b) => {
        const da = Math.hypot((a.p1.x + a.p2.x) * 0.5 - clickWorldPt.x, (a.p1.y + a.p2.y) * 0.5 - clickWorldPt.y);
        const db = Math.hypot((b.p1.x + b.p2.x) * 0.5 - clickWorldPt.x, (b.p1.y + b.p2.y) * 0.5 - clickWorldPt.y);
        return da - db;
      })
      .slice(0, maxSegments);
  }

  // 2. Split segments at all pairwise intersections
  const splitParams: number[][] = activeSegments.map(() => [0, 1]);
  for (let i = 0; i < activeSegments.length; i++) {
    const si = activeSegments[i];
    const minXi = Math.min(si.p1.x, si.p2.x) - snapTol;
    const maxXi = Math.max(si.p1.x, si.p2.x) + snapTol;
    const minYi = Math.min(si.p1.y, si.p2.y) - snapTol;
    const maxYi = Math.max(si.p1.y, si.p2.y) + snapTol;

    for (let j = i + 1; j < activeSegments.length; j++) {
      const sj = activeSegments[j];
      if (
        Math.max(sj.p1.x, sj.p2.x) < minXi ||
        Math.min(sj.p1.x, sj.p2.x) > maxXi ||
        Math.max(sj.p1.y, sj.p2.y) < minYi ||
        Math.min(sj.p1.y, sj.p2.y) > maxYi
      ) {
        continue;
      }
      const hit = intersectSegments(si.p1, si.p2, sj.p1, sj.p2);
      if (hit) {
        splitParams[i].push(hit.t);
        splitParams[j].push(hit.u);
      }
    }
  }

  // 3. Build snapped planar graph vertices & undirected edges
  const vertices: Pt2D[] = [];
  const getOrAddVertex = (pt: Pt2D): number => {
    for (let i = 0; i < vertices.length; i++) {
      if (Math.hypot(vertices[i].x - pt.x, vertices[i].y - pt.y) <= snapTol) {
        return i;
      }
    }
    vertices.push({ x: pt.x, y: pt.y });
    return vertices.length - 1;
  };

  interface HalfEdge {
    id: number;
    from: number;
    to: number;
    twin: number;
    angle: number;
    lineId: string;
    next: number;
    visited: boolean;
  }

  const halfEdges: HalfEdge[] = [];
  const outgoing = new Map<number, number[]>();
  const edgePairSeen = new Set<string>();

  const addUndirectedEdge = (u: number, v: number, lineId: string) => {
    if (u === v) return;
    const key = u < v ? `${u}:${v}` : `${v}:${u}`;
    if (edgePairSeen.has(key)) return;
    edgePairSeen.add(key);

    const pu = vertices[u];
    const pv = vertices[v];
    const h1Id = halfEdges.length;
    const h2Id = h1Id + 1;

    halfEdges.push({
      id: h1Id,
      from: u,
      to: v,
      twin: h2Id,
      angle: Math.atan2(pv.y - pu.y, pv.x - pu.x),
      lineId,
      next: -1,
      visited: false,
    });
    halfEdges.push({
      id: h2Id,
      from: v,
      to: u,
      twin: h1Id,
      angle: Math.atan2(pu.y - pv.y, pu.x - pv.x),
      lineId,
      next: -1,
      visited: false,
    });

    if (!outgoing.has(u)) outgoing.set(u, []);
    if (!outgoing.has(v)) outgoing.set(v, []);
    outgoing.get(u)!.push(h1Id);
    outgoing.get(v)!.push(h2Id);
  };

  for (let i = 0; i < activeSegments.length; i++) {
    const seg = activeSegments[i];
    const ts = splitParams[i].sort((a, b) => a - b);
    let prevT = ts[0];
    for (let k = 1; k < ts.length; k++) {
      const curT = ts[k];
      if (curT - prevT < 1e-4) continue;
      const pA = {
        x: seg.p1.x + prevT * (seg.p2.x - seg.p1.x),
        y: seg.p1.y + prevT * (seg.p2.y - seg.p1.y),
      };
      const pB = {
        x: seg.p1.x + curT * (seg.p2.x - seg.p1.x),
        y: seg.p1.y + curT * (seg.p2.y - seg.p1.y),
      };
      const u = getOrAddVertex(pA);
      const v = getOrAddVertex(pB);
      addUndirectedEdge(u, v, seg.lineId);
      prevT = curT;
    }
  }

  // 4. Sort outgoing half-edges around each vertex by angle CCW and link `next`
  for (const [, edgeIds] of outgoing) {
    edgeIds.sort((a, b) => halfEdges[a].angle - halfEdges[b].angle);
  }

  for (const he of halfEdges) {
    const outAtTo = outgoing.get(he.to);
    if (!outAtTo || outAtTo.length === 0) continue;
    const twinPos = outAtTo.indexOf(he.twin);
    // For interior CCW faces, after arriving at `he.to` via `he` (whose reverse is `he.twin`),
    // we pick the next edge clockwise in the sorted CCW list: `(twinPos - 1 + len) % len`
    const nextIdx = (twinPos - 1 + outAtTo.length) % outAtTo.length;
    he.next = outAtTo[nextIdx];
  }

  // 5. Traverse all bounded faces
  const boundedFaces: Array<{ vertices: Pt2D[]; sourceLineIds: string[]; area: number }> = [];

  for (const startHe of halfEdges) {
    if (startHe.visited) continue;
    const cycleVerts: Pt2D[] = [];
    const cycleLines = new Set<string>();
    let curr: HalfEdge | undefined = startHe;
    let safety = 0;

    while (curr && !curr.visited && safety++ <= halfEdges.length + 2) {
      curr.visited = true;
      cycleVerts.push(vertices[curr.from]);
      cycleLines.add(curr.lineId);
      curr = curr.next >= 0 ? halfEdges[curr.next] : undefined;
      if (curr && curr.id === startHe.id) break;
    }

    const cleaned = cleanLoopVertices(cycleVerts, snapTol * 0.25);
    if (cleaned.length >= 3) {
      const signedArea = computeSignedPolygonArea(cleaned);
      // Bounded interior faces have positive signed area (CCW); the unbounded exterior face is negative (CW)
      if (signedArea > 1e-2) {
        boundedFaces.push({
          vertices: cleaned,
          sourceLineIds: [...cycleLines],
          area: signedArea,
        });
      }
    }
  }

  // Combine planar faces with standalone circles/loops
  const allCandidateFaces = [...boundedFaces, ...standaloneLoops];

  // Filter faces that contain `clickWorldPt`
  const containingFaces = allCandidateFaces
    .filter(f => isPointInPolygon(clickWorldPt, f.vertices))
    .sort((a, b) => a.area - b.area);

  if (containingFaces.length === 0) return null;

  // The smallest face containing the click point is our target outer loop
  const chosenOuter = containingFaces[0];

  // Find any direct island holes: bounded faces strictly inside `chosenOuter` that do NOT contain `clickWorldPt`
  const candidateHoles = allCandidateFaces
    .filter(
      f =>
        f !== chosenOuter &&
        f.area < chosenOuter.area - 1e-2 &&
        !isPointInPolygon(clickWorldPt, f.vertices) &&
        f.vertices.every(v => isPointInPolygon(v, chosenOuter.vertices)),
    )
    .sort((a, b) => b.area - a.area);

  // Keep only top-level holes (don't add a nested sub-island inside another hole as a second hole)
  const holes: HatchBoundaryLoop[] = [];
  const lineIds = new Set<string>(chosenOuter.sourceLineIds);
  let holeAreaSum = 0;

  for (const h of candidateHoles) {
    const insideAnotherHole = holes.some(existing =>
      isPointInPolygon(h.vertices[0], existing.vertices),
    );
    if (!insideAnotherHole) {
      holes.push({
        vertices: h.vertices,
        isHole: true,
        sourceLineIds: h.sourceLineIds,
      });
      holeAreaSum += h.area;
      h.sourceLineIds.forEach(id => lineIds.add(id));
    }
  }

  const outerLoop: HatchBoundaryLoop = {
    vertices: chosenOuter.vertices,
    isHole: false,
    sourceLineIds: chosenOuter.sourceLineIds,
  };

  return {
    outerLoop,
    holes,
    loops: [outerLoop, ...holes],
    boundingLineIds: [...lineIds],
    areaSqFt: Math.max(0, chosenOuter.area - holeAreaSum),
  };
}
