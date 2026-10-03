import { type SurveyPoint, type SurveyLine, type ContourLabel, type ProfilePoint, type IsoPath, type TinSurface } from '../types.ts';

// Types for Delaunay triangulation
type DPoint = { x: number; y: number; z: number; };
type DTriangle = { p1: number; p2: number; p3: number; circumcenter: { x: number; y: number }; circumradiusSq: number; };

function createTriangle(p1Idx: number, p2Idx: number, p3Idx: number, points: DPoint[]): DTriangle {
    const p1 = points[p1Idx];
    const p2 = points[p2Idx];
    const p3 = points[p3Idx];
    
    // Using robust determinant calculation to avoid floating point issues with collinear points
    const D = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
    
    if (Math.abs(D) < 1e-10) {
        // Collinear points, return a degenerate triangle with a huge circumcircle so it gets removed.
        return { p1: p1Idx, p2: p2Idx, p3: p3Idx, circumcenter: { x: Infinity, y: Infinity }, circumradiusSq: Infinity };
    }

    const ux = ((p1.x ** 2 + p1.y ** 2) * (p2.y - p3.y) + (p2.x ** 2 + p2.y ** 2) * (p3.y - p1.y) + (p3.x ** 2 + p3.y ** 2) * (p1.y - p2.y)) / D;
    const uy = ((p1.x ** 2 + p1.y ** 2) * (p3.x - p2.x) + (p2.x ** 2 + p2.y ** 2) * (p1.x - p3.x) + (p3.x ** 2 + p3.y ** 2) * (p2.x - p1.x)) / D;

    const circumcenter = { x: ux, y: uy };
    const circumradiusSq = (p1.x - ux) ** 2 + (p1.y - uy) ** 2;

    return { p1: p1Idx, p2: p2Idx, p3: p3Idx, circumcenter, circumradiusSq };
}

function delaunay(points: DPoint[]): { p1: number; p2: number; p3: number }[] {
    const n = points.length;
    if (n < 3) return [];

    let minX = points[0].x, minY = points[0].y, maxX = points[0].x, maxY = points[0].y;
    for (let i = 1; i < n; i++) {
        minX = Math.min(minX, points[i].x);
        minY = Math.min(minY, points[i].y);
        maxX = Math.max(maxX, points[i].x);
        maxY = Math.max(maxY, points[i].y);
    }

    const dx = maxX - minX;
    const dy = maxY - minY;
    const deltaMax = Math.max(dx, dy);
    const midX = minX + dx / 2;
    const midY = minY + dy / 2;

    const p0 = { x: midX - 20 * deltaMax, y: midY - deltaMax, z: 0 };
    const p1 = { x: midX, y: midY + 20 * deltaMax, z: 0 };
    const p2 = { x: midX + 20 * deltaMax, y: midY - deltaMax, z: 0 };

    const allPoints = [...points, p0, p1, p2];

    let triangles: DTriangle[] = [createTriangle(n, n + 1, n + 2, allPoints)];

    for (let i = 0; i < n; i++) {
        const point = points[i];
        const badTriangles: DTriangle[] = [];
        const polygon: { p1: number; p2: number }[] = [];

        for (const triangle of triangles) {
            const distSq = (point.x - triangle.circumcenter.x) ** 2 + (point.y - triangle.circumcenter.y) ** 2;
            if (distSq < triangle.circumradiusSq) {
                badTriangles.push(triangle);
            }
        }
        
        const badTriangleSet = new Set(badTriangles);
        triangles = triangles.filter(t => !badTriangleSet.has(t));

        const edgeSet = new Map<string, { p1: number; p2: number; count: number }>();
        for (const triangle of badTriangles) {
            const edges = [{ p1: triangle.p1, p2: triangle.p2 }, { p1: triangle.p2, p2: triangle.p3 }, { p1: triangle.p3, p2: triangle.p1 }];
            for (const edge of edges) {
                const key = `${Math.min(edge.p1, edge.p2)}-${Math.max(edge.p1, edge.p2)}`;
                if (edgeSet.has(key)) {
                    edgeSet.get(key)!.count++;
                } else {
                    edgeSet.set(key, { ...edge, count: 1 });
                }
            }
        }

        for (const edge of edgeSet.values()) {
            if (edge.count === 1) {
                polygon.push({ p1: edge.p1, p2: edge.p2 });
            }
        }

        for (const edge of polygon) {
            const newTriangle = createTriangle(edge.p1, edge.p2, i, allPoints);
            triangles.push(newTriangle);
        }
    }
    
    return triangles
        .filter(t => t.p1 < n && t.p2 < n && t.p3 < n)
        .map(t => ({ p1: t.p1, p2: t.p2, p3: t.p3 }));
}

// Chaikin's corner cutting algorithm for smoothing
const chaikinSmooth = (points: {x: number, y: number}[], iterations: number): {x: number, y: number}[] => {
    if (iterations === 0 || points.length < 2) {
        return points;
    }
    
    let smoothed = points;
    for (let i = 0; i < iterations; i++) {
        const nextSmoothed: {x: number, y: number}[] = [];
        if (smoothed.length > 0) {
            nextSmoothed.push(smoothed[0]);
        }
        for (let j = 0; j < smoothed.length - 1; j++) {
            const p1 = smoothed[j];
            const p2 = smoothed[j+1];
            
            const q = { x: p1.x * 0.75 + p2.x * 0.25, y: p1.y * 0.75 + p2.y * 0.25 };
            const r = { x: p1.x * 0.25 + p2.x * 0.75, y: p1.y * 0.25 + p2.y * 0.75 };

            nextSmoothed.push(q, r);
        }
         if (smoothed.length > 1) {
            nextSmoothed.push(smoothed[smoothed.length - 1]);
        }
        smoothed = nextSmoothed;
    }
    return smoothed;
}

// Slider + agent inputs can arrive as non-integers/strings; contour smoothing
// expects discrete Chaikin passes.
const normalizeSmoothingIterations = (value: number): number => {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.round(value));
};

const epsilon = 1e-9;
function pointsAreSame(pA: DPoint, pB: DPoint): boolean {
    return Math.abs(pA.x - pB.x) < epsilon && Math.abs(pA.y - pB.y) < epsilon;
}

function segmentsIntersect(p1: DPoint, q1: DPoint, p2: DPoint, q2: DPoint): boolean {
    // Check if segments are the same
    if ((pointsAreSame(p1, p2) && pointsAreSame(q1, q2)) || (pointsAreSame(p1, q2) && pointsAreSame(q1, p2))) {
        return false;
    }
    // Check for shared endpoints, which is not a true intersection for this purpose
    if (pointsAreSame(p1, p2) || pointsAreSame(p1, q2) || pointsAreSame(q1, p2) || pointsAreSame(q1, q2)) {
        return false;
    }

    const denominator = ((q2.y - p2.y) * (q1.x - p1.x) - (q2.x - p2.x) * (q1.y - p1.y));
    if (Math.abs(denominator) < epsilon) return false; // Parallel or collinear

    const ua_num = ((q2.x - p2.x) * (p1.y - p2.y) - (q2.y - p2.y) * (p1.x - p2.x));
    const ub_num = ((q1.x - p1.x) * (p1.y - p2.y) - (q1.y - p1.y) * (p1.x - p2.x));
    
    const ua = ua_num / denominator;
    const ub = ub_num / denominator;

    // Use epsilon for endpoint checks to avoid floating point issues
    const intersectEpsilon = 1e-6;
    return ua > intersectEpsilon && ua < (1 - intersectEpsilon) && ub > intersectEpsilon && ub < (1 - intersectEpsilon);
}

// ── Polygon helpers for inclusion/exclusion zones ─────────────────────────────

/** Extract {x1,y1,x2,y2} pairs from SurveyLine segments using fromPt/toPt. */
function getSegPairs(surveyLines: SurveyLine[]): Array<{ x1: number; y1: number; x2: number; y2: number }> {
    const result: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    for (const l of surveyLines) {
        if (l.fromPt && l.toPt) {
            result.push({ x1: l.fromPt.x, y1: l.fromPt.y, x2: l.toPt.x, y2: l.toPt.y });
        }
    }
    return result;
}

/** Chain loose line segments into a polygon ring. */
function buildPolygonFromSegments(segs: Array<{ x1: number; y1: number; x2: number; y2: number }>): { x: number; y: number }[] {
    if (segs.length === 0) return [];
    const tolSq = 0.01; // 0.1-unit endpoint matching tolerance
    const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2;
    const used = new Set<number>();
    const poly: { x: number; y: number }[] = [{ x: segs[0].x1, y: segs[0].y1 }, { x: segs[0].x2, y: segs[0].y2 }];
    used.add(0);
    for (let iter = 0; iter < segs.length; iter++) {
        let extended = false;
        const head = poly[poly.length - 1];
        const tail = poly[0];
        for (let i = 0; i < segs.length; i++) {
            if (used.has(i)) continue;
            const { x1, y1, x2, y2 } = segs[i];
            if (dist2(head.x, head.y, x1, y1) <= tolSq) { poly.push({ x: x2, y: y2 }); used.add(i); extended = true; break; }
            if (dist2(head.x, head.y, x2, y2) <= tolSq) { poly.push({ x: x1, y: y1 }); used.add(i); extended = true; break; }
            if (dist2(tail.x, tail.y, x1, y1) <= tolSq) { poly.unshift({ x: x2, y: y2 }); used.add(i); extended = true; break; }
            if (dist2(tail.x, tail.y, x2, y2) <= tolSq) { poly.unshift({ x: x1, y: y1 }); used.add(i); extended = true; break; }
        }
        if (!extended) break;
    }
    return poly;
}

/** Ray-casting point-in-polygon test (works for any simple polygon). */
function pointInPolygon(px: number, py: number, poly: { x: number; y: number }[]): boolean {
    if (poly.length < 3) return false;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}

// ── Elevation blunder rejection ───────────────────────────────────────────────

export interface ElevationFilterOptions {
    /** 'auto' (default) rejects non-finite elevations plus far-detached blunder
     *  clusters. 'off' rejects only non-finite elevations. */
    mode?: 'auto' | 'off';
    /** Hard lower bound. Elevations below this are always rejected. */
    minElevation?: number | null;
    /** Hard upper bound. Elevations above this are always rejected. */
    maxElevation?: number | null;
    /** Contour interval, used to scale the auto detachment threshold. */
    contourInterval?: number;
}

export interface ElevationFilterReport {
    /** Points dropped because elevation was missing, null, NaN or infinite. */
    missingElevation: number;
    /** Points dropped because elevation fell outside the accepted range. */
    outOfRange: number;
    /** Elevation range actually contoured, or null when nothing survived. */
    acceptedMin: number | null;
    acceptedMax: number | null;
    /** True when a detached cluster was detected but left in place because
     *  dropping it would have discarded too much of the survey. */
    suppressed: boolean;
}

export const emptyElevationReport = (): ElevationFilterReport => ({
    missingElevation: 0,
    outOfRange: 0,
    acceptedMin: null,
    acceptedMax: null,
    suppressed: false,
});

/** Auto-rejection refuses to discard more than this share of the survey. A real
 *  terrain feature is represented by many shots; blunders are a handful. */
const MAX_AUTO_DROP_FRACTION = 0.05;
/** Below this count the distribution is too small to judge outliers. */
const MIN_POINTS_FOR_AUTO_FILTER = 12;

function percentile(sortedAsc: number[], p: number): number {
    if (sortedAsc.length === 0) return NaN;
    if (sortedAsc.length === 1) return sortedAsc[0];
    const idx = (sortedAsc.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sortedAsc[lo];
    return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

/**
 * Determine which elevations should be contoured.
 *
 * Contour levels are driven by the min/max of the input, so a single blunder
 * (0, -9999, a mis-keyed rod height) forces every level between the blunder and
 * the real surface to be generated. Those levels only exist in the few triangles
 * touching the bad point, producing a dense hairball there while the rest of the
 * site looks fine.
 *
 * A surveyed surface is continuous, so a wide empty band in the sorted
 * elevations means the far side is a blunder cluster rather than terrain. The
 * tolerance scales with the survey's own relief, so sites with genuine benches
 * or cliffs are left alone, and detection is skipped entirely if it would
 * discard a meaningful share of the points.
 */
export function computeAcceptedElevationRange(
    elevations: number[],
    options: ElevationFilterOptions = {},
): { min: number; max: number; suppressed: boolean } {
    const hardMin = typeof options.minElevation === 'number' && Number.isFinite(options.minElevation)
        ? options.minElevation : -Infinity;
    const hardMax = typeof options.maxElevation === 'number' && Number.isFinite(options.maxElevation)
        ? options.maxElevation : Infinity;

    if (options.mode === 'off' || elevations.length < MIN_POINTS_FOR_AUTO_FILTER) {
        return { min: hardMin, max: hardMax, suppressed: false };
    }

    const sorted = [...elevations].sort((a, b) => a - b);
    // IQR rather than a P10/P90 band: the interquartile range stays anchored to
    // the real surface even when a large share of the survey is blundered.
    const iqr = percentile(sorted, 0.75) - percentile(sorted, 0.25);
    const interval = options.contourInterval && options.contourInterval > 0 ? options.contourInterval : 1;
    // Deliberately generous: a gap must dwarf the site's own relief before it is
    // treated as a blunder boundary, so benches, cliffs and ponds survive.
    const gapTolerance = Math.max(3 * iqr, 50 * interval);

    const medianIdx = Math.floor((sorted.length - 1) / 2);
    let lo = medianIdx;
    while (lo > 0 && sorted[lo] - sorted[lo - 1] <= gapTolerance) lo--;
    let hi = medianIdx;
    while (hi < sorted.length - 1 && sorted[hi + 1] - sorted[hi] <= gapTolerance) hi++;

    const dropped = sorted.length - (hi - lo + 1);
    if (dropped === 0) {
        return { min: hardMin, max: hardMax, suppressed: false };
    }
    if (dropped > sorted.length * MAX_AUTO_DROP_FRACTION) {
        return { min: hardMin, max: hardMax, suppressed: true };
    }
    return { min: Math.max(hardMin, sorted[lo]), max: Math.min(hardMax, sorted[hi]), suppressed: false };
}

/**
 * Drop points that cannot be triangulated meaningfully: missing/NaN elevations
 * (previously coerced to 0 by `p.elevation || 0`, which turned a 2D point into a
 * 400ft sinkhole) and elevations detached from the surveyed surface.
 */
export function filterPointsByElevation(
    points: SurveyPoint[],
    options: ElevationFilterOptions = {},
): { points: SurveyPoint[]; report: ElevationFilterReport } {
    const report = emptyElevationReport();
    const finite: number[] = [];
    for (const p of points) {
        if (typeof p.elevation === 'number' && Number.isFinite(p.elevation)) finite.push(p.elevation);
        else report.missingElevation++;
    }

    const { min, max, suppressed } = computeAcceptedElevationRange(finite, options);
    report.suppressed = suppressed;

    const kept: SurveyPoint[] = [];
    for (const p of points) {
        const z = p.elevation;
        if (typeof z !== 'number' || !Number.isFinite(z)) continue;
        if (z < min || z > max) { report.outOfRange++; continue; }
        if (report.acceptedMin === null || z < report.acceptedMin) report.acceptedMin = z;
        if (report.acceptedMax === null || z > report.acceptedMax) report.acceptedMax = z;
        kept.push(p);
    }

    return { points: kept, report };
}

// FIX: Update function signature to accept label options and return labels.
export function generateContours(
    surveyPoints: SurveyPoint[], 
    contourInterval: number, 
    majorInterval: number, 
    smoothing: number,
    showLabels: boolean,
    labelDensity: number,
    breaklines: SurveyLine[],
    inclusionLines?: SurveyLine[],
    exclusionLines?: SurveyLine[],
    elevationFilter?: ElevationFilterOptions
): { lines: SurveyLine[], labels: ContourLabel[], elevationReport: ElevationFilterReport } {
    if (surveyPoints.length < 3) return { lines: [], labels: [], elevationReport: emptyElevationReport() };

    // ── Build inclusion/exclusion polygons ─────────────────────────────────
    const inclSegs = getSegPairs(inclusionLines ?? []);
    const inclPoly = inclSegs.length >= 3 ? buildPolygonFromSegments(inclSegs) : null;

    const exclSegs = getSegPairs(exclusionLines ?? []);
    const exclPoly = exclSegs.length >= 3 ? buildPolygonFromSegments(exclSegs) : null;

    // ── Filter survey points by inclusion/exclusion zones ──────────────────
    let activePoints = surveyPoints;
    if (inclPoly && inclPoly.length >= 3) {
        activePoints = activePoints.filter(p => pointInPolygon(p.easting, p.northing, inclPoly));
    }
    if (exclPoly && exclPoly.length >= 3) {
        activePoints = activePoints.filter(p => !pointInPolygon(p.easting, p.northing, exclPoly));
    }

    // Reject unusable elevations before they can widen the contour level range.
    const { points: usablePoints, report: elevationReport } = filterPointsByElevation(activePoints, {
        contourInterval,
        ...elevationFilter,
    });
    activePoints = usablePoints;
    if (activePoints.length < 3) return { lines: [], labels: [], elevationReport };

    const dPoints: DPoint[] = activePoints.map(p => ({ x: p.easting, y: p.northing, z: p.elevation as number }));
    
    const pointNumberToIndex = new Map<string, number>();
    activePoints.forEach((p, i) => pointNumberToIndex.set(p.pointNumber, i));
    
    const breaklineEdges = breaklines
        .map(bl => {
            const idx1 = pointNumberToIndex.get(bl.from);
            const idx2 = pointNumberToIndex.get(bl.to);
            if (idx1 !== undefined && idx2 !== undefined && dPoints[idx1] && dPoints[idx2]) {
                return { p1: dPoints[idx1], p2: dPoints[idx2] };
            }
            return null;
        })
        .filter((e): e is {p1: DPoint, p2: DPoint} => e !== null);

    const triangles = delaunay(dPoints);

    const validTriangles = triangles.filter(tri => {
        const t_p1 = dPoints[tri.p1];
        const t_p2 = dPoints[tri.p2];
        const t_p3 = dPoints[tri.p3];
        if (!t_p1 || !t_p2 || !t_p3) return false;

        const triEdges = [[t_p1, t_p2], [t_p2, t_p3], [t_p3, t_p1]];

        for (const bEdge of breaklineEdges) {
            for (const tEdge of triEdges) {
                if (segmentsIntersect(tEdge[0], tEdge[1], bEdge.p1, bEdge.p2)) {
                    return false; // Invalid triangle: it crosses a breakline.
                }
            }
        }
        return true;
    });

    const contourPaths = new Map<number, { x: number; y: number }[][]>();

    const minElev = Math.min(...dPoints.map(p => p.z));
    const maxElev = Math.max(...dPoints.map(p => p.z));

    const startContour = Math.ceil(minElev / contourInterval) * contourInterval;

    for (let elev = startContour; elev <= maxElev; elev += contourInterval) {
        if (contourInterval <= 0) break; // prevent infinite loop
        
        const edgesForLevel: { p1: {x:number, y:number}, p2: {x:number, y:number} }[] = [];

        for (const tri of validTriangles) {
            const p1 = dPoints[tri.p1];
            const p2 = dPoints[tri.p2];
            const p3 = dPoints[tri.p3];

            if (!p1 || !p2 || !p3) continue;

            const contourPoints: { x: number, y: number }[] = [];
            const edgePoints = [[p1, p2], [p2, p3], [p3, p1]];

            for (const edge of edgePoints) {
                const [ep1, ep2] = edge;
                if ((ep1.z < elev && ep2.z >= elev) || (ep1.z >= elev && ep2.z < elev)) {
                    const dz = ep2.z - ep1.z;
                    if (Math.abs(dz) < 1e-9) continue;
                    
                    const ratio = (elev - ep1.z) / dz;
                    if (isFinite(ratio) && ratio >= 0 && ratio <= 1) {
                        contourPoints.push({
                            x: ep1.x + ratio * (ep2.x - ep1.x),
                            y: ep1.y + ratio * (ep2.y - ep1.y)
                        });
                    }
                }
            }

            if (contourPoints.length === 2) {
                edgesForLevel.push({p1: contourPoints[0], p2: contourPoints[1]});
            }
        }
        
        // Basic edge linking to form polylines
        const paths: { x: number; y: number }[][] = [];
        const visited = new Set<number>();
        for(let i = 0; i < edgesForLevel.length; i++) {
            if(visited.has(i)) continue;
            
            const path = [edgesForLevel[i].p1, edgesForLevel[i].p2];
            visited.add(i);

            let changed = true;
            while(changed) {
                changed = false;
                for(let j = 0; j < edgesForLevel.length; j++) {
                    if(visited.has(j)) continue;

                    const edge = edgesForLevel[j];
                    const head = path[path.length - 1];
                    const tail = path[0];

                    const dist = (p1: {x:number, y:number}, p2: {x:number, y:number}) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
                    
                    if (dist(head, edge.p1) < 1e-5) {
                        path.push(edge.p2);
                        visited.add(j);
                        changed = true;
                    } else if (dist(head, edge.p2) < 1e-5) {
                        path.push(edge.p1);
                        visited.add(j);
                        changed = true;
                    } else if (dist(tail, edge.p1) < 1e-5) {
                        path.unshift(edge.p2);
                        visited.add(j);
                        changed = true;
                    } else if (dist(tail, edge.p2) < 1e-5) {
                        path.unshift(edge.p1);
                        visited.add(j);
                        changed = true;
                    }
                }
            }
            paths.push(path);
        }
        contourPaths.set(elev, paths);
    }
    
    const lines: SurveyLine[] = [];
    const labels: ContourLabel[] = [];
    const minLabelSpacingSq = (200 * (1 / (labelDensity || 0.5))) ** 2;
    const lastLabelPos: { [key: number]: {x: number, y: number} } = {};

    for (const [elev, paths] of contourPaths.entries()) {
        const isMajor = Math.abs(elev % majorInterval) < 1e-6 || Math.abs(elev % majorInterval - majorInterval) < 1e-6;
        for (const path of paths) {
            const smoothedPath = smoothing > 0 ? chaikinSmooth(path, smoothing) : path;
            const renderedPaths = inclPoly && inclPoly.length >= 3
                ? clipIsoPathsToPolygon([{ elevation: elev, isMajor, vertices: smoothedPath }], inclPoly)
                : [{ elevation: elev, isMajor, vertices: smoothedPath }];
            for (const renderedPath of renderedPaths) {
                for (let i = 0; i < renderedPath.vertices.length - 1; i++) {
                    const p1 = renderedPath.vertices[i];
                    const p2 = renderedPath.vertices[i+1];
                lines.push({
                    from: '',
                    to: '',
                    fromPt: { x: p1.x, y: p1.y, z: elev },
                    toPt: { x: p2.x, y: p2.y, z: elev },
                    type: isMajor ? 'contour-major' : 'contour-minor'
                });

                if (showLabels && isMajor) {
                    const segmentLengthSq = (p2.x - p1.x)**2 + (p2.y - p1.y)**2;
                    if (segmentLengthSq < 50**2) continue;

                    const midX = (p1.x + p2.x) / 2;
                    const midY = (p1.y + p2.y) / 2;
                    
                    const lastPos = lastLabelPos[elev];
                    const distSq = lastPos ? (midX - lastPos.x)**2 + (midY - lastPos.y)**2 : Infinity;

                    if (distSq > minLabelSpacingSq) {
                        const dx = p2.x - p1.x;
                        const dy = p2.y - p1.y;
                        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
                        if (angle < -90 || angle > 90) angle += 180;
                        
                        labels.push({
                            x: midX,
                            y: midY,
                            text: elev.toFixed(0),
                            angle: angle
                        });
                        lastLabelPos[elev] = {x: midX, y: midY};
                    }
                }
            }
            }
        }
    }
    
    return { lines, labels, elevationReport };
}

/**
 * Same algorithm as generateContours but preserves the polyline structure
 * as IsoPath[] rather than decomposing into individual SurveyLine segments.
 * This is the "mathematical representation" used for ContourGeneration objects
 * — it enables show/hide, auto-regeneration, and ESRI blend without having to
 * re-run the TIN on every toggle.
 */
export function generateContoursAsIsoPaths(
    surveyPoints: SurveyPoint[],
    contourInterval: number,
    majorInterval: number,
    smoothing: number,
    showLabels: boolean,
    labelDensity: number,
    breaklines: SurveyLine[],
    inclusionLines?: SurveyLine[],
    exclusionLines?: SurveyLine[],
    elevationFilter?: ElevationFilterOptions
): { isoPaths: IsoPath[], labels: ContourLabel[], elevationReport: ElevationFilterReport } {
    if (surveyPoints.length < 3) return { isoPaths: [], labels: [], elevationReport: emptyElevationReport() };

    const inclSegs = getSegPairs(inclusionLines ?? []);
    const inclPoly = inclSegs.length >= 3 ? buildPolygonFromSegments(inclSegs) : null;

    const exclSegs = getSegPairs(exclusionLines ?? []);
    const exclPoly = exclSegs.length >= 3 ? buildPolygonFromSegments(exclSegs) : null;

    let activePoints = surveyPoints;
    if (inclPoly && inclPoly.length >= 3) {
        activePoints = activePoints.filter(p => pointInPolygon(p.easting, p.northing, inclPoly));
    }
    if (exclPoly && exclPoly.length >= 3) {
        activePoints = activePoints.filter(p => !pointInPolygon(p.easting, p.northing, exclPoly));
    }

    // Reject unusable elevations before they can widen the contour level range.
    const { points: usablePoints, report: elevationReport } = filterPointsByElevation(activePoints, {
        contourInterval,
        ...elevationFilter,
    });
    activePoints = usablePoints;
    if (activePoints.length < 3) return { isoPaths: [], labels: [], elevationReport };

    const dPoints: DPoint[] = activePoints.map(p => ({ x: p.easting, y: p.northing, z: p.elevation as number }));

    const pointNumberToIndex = new Map<string, number>();
    activePoints.forEach((p, i) => pointNumberToIndex.set(p.pointNumber, i));

    const breaklineEdges = breaklines
        .map(bl => {
            const idx1 = pointNumberToIndex.get(bl.from);
            const idx2 = pointNumberToIndex.get(bl.to);
            if (idx1 !== undefined && idx2 !== undefined && dPoints[idx1] && dPoints[idx2]) {
                return { p1: dPoints[idx1], p2: dPoints[idx2] };
            }
            return null;
        })
        .filter((e): e is { p1: DPoint; p2: DPoint } => e !== null);

    const triangles = delaunay(dPoints);

    const validTriangles = triangles.filter(tri => {
        const t_p1 = dPoints[tri.p1];
        const t_p2 = dPoints[tri.p2];
        const t_p3 = dPoints[tri.p3];
        if (!t_p1 || !t_p2 || !t_p3) return false;
        const triEdges = [[t_p1, t_p2], [t_p2, t_p3], [t_p3, t_p1]];
        for (const bEdge of breaklineEdges) {
            for (const tEdge of triEdges) {
                if (segmentsIntersect(tEdge[0], tEdge[1], bEdge.p1, bEdge.p2)) return false;
            }
        }
        return true;
    });

    const contourPaths = new Map<number, { x: number; y: number }[][]>();

    const minElev = Math.min(...dPoints.map(p => p.z));
    const maxElev = Math.max(...dPoints.map(p => p.z));
    const startContour = Math.ceil(minElev / contourInterval) * contourInterval;

    for (let elev = startContour; elev <= maxElev; elev += contourInterval) {
        if (contourInterval <= 0) break;
        const edgesForLevel: { p1: { x: number; y: number }; p2: { x: number; y: number } }[] = [];
        for (const tri of validTriangles) {
            const p1 = dPoints[tri.p1];
            const p2 = dPoints[tri.p2];
            const p3 = dPoints[tri.p3];
            if (!p1 || !p2 || !p3) continue;
            const contourPoints: { x: number; y: number }[] = [];
            const edgePoints = [[p1, p2], [p2, p3], [p3, p1]];
            for (const edge of edgePoints) {
                const [ep1, ep2] = edge;
                if ((ep1.z < elev && ep2.z >= elev) || (ep1.z >= elev && ep2.z < elev)) {
                    const dz = ep2.z - ep1.z;
                    if (Math.abs(dz) < 1e-9) continue;
                    const ratio = (elev - ep1.z) / dz;
                    if (isFinite(ratio) && ratio >= 0 && ratio <= 1) {
                        contourPoints.push({ x: ep1.x + ratio * (ep2.x - ep1.x), y: ep1.y + ratio * (ep2.y - ep1.y) });
                    }
                }
            }
            if (contourPoints.length === 2) {
                edgesForLevel.push({ p1: contourPoints[0], p2: contourPoints[1] });
            }
        }
        const paths: { x: number; y: number }[][] = [];
        const visited = new Set<number>();
        for (let i = 0; i < edgesForLevel.length; i++) {
            if (visited.has(i)) continue;
            const path = [edgesForLevel[i].p1, edgesForLevel[i].p2];
            visited.add(i);
            let changed = true;
            while (changed) {
                changed = false;
                for (let j = 0; j < edgesForLevel.length; j++) {
                    if (visited.has(j)) continue;
                    const edge = edgesForLevel[j];
                    const head = path[path.length - 1];
                    const tail = path[0];
                    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
                    if (dist(head, edge.p1) < 1e-5) { path.push(edge.p2); visited.add(j); changed = true; }
                    else if (dist(head, edge.p2) < 1e-5) { path.push(edge.p1); visited.add(j); changed = true; }
                    else if (dist(tail, edge.p1) < 1e-5) { path.unshift(edge.p2); visited.add(j); changed = true; }
                    else if (dist(tail, edge.p2) < 1e-5) { path.unshift(edge.p1); visited.add(j); changed = true; }
                }
            }
            paths.push(path);
        }
        contourPaths.set(elev, paths);
    }

    const isoPaths: IsoPath[] = [];
    const labels: ContourLabel[] = [];
    const minLabelSpacingSq = (200 * (1 / (labelDensity || 0.5))) ** 2;
    const lastLabelPos: { [key: number]: { x: number; y: number } } = {};

    for (const [elev, paths] of contourPaths.entries()) {
        const isMajor = Math.abs(elev % majorInterval) < 1e-6 || Math.abs(elev % majorInterval - majorInterval) < 1e-6;
        for (const path of paths) {
            const smoothedPath = smoothing > 0 ? chaikinSmooth(path, smoothing) : path;
            const renderedPaths = inclPoly && inclPoly.length >= 3
                ? clipIsoPathsToPolygon([{ elevation: elev, isMajor, vertices: smoothedPath }], inclPoly)
                : [{ elevation: elev, isMajor, vertices: smoothedPath }];
            isoPaths.push(...renderedPaths);

            if (showLabels && isMajor) {
                for (const renderedPath of renderedPaths) {
                    for (let i = 0; i < renderedPath.vertices.length - 1; i++) {
                        const p1 = renderedPath.vertices[i];
                        const p2 = renderedPath.vertices[i + 1];
                    const segLenSq = (p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2;
                    if (segLenSq < 50 ** 2) continue;
                    const midX = (p1.x + p2.x) / 2;
                    const midY = (p1.y + p2.y) / 2;
                    const lastPos = lastLabelPos[elev];
                    const distSq = lastPos ? (midX - lastPos.x) ** 2 + (midY - lastPos.y) ** 2 : Infinity;
                    if (distSq > minLabelSpacingSq) {
                        const dx = p2.x - p1.x;
                        const dy = p2.y - p1.y;
                        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
                        if (angle < -90 || angle > 90) angle += 180;
                        labels.push({ x: midX, y: midY, text: elev.toFixed(0), angle });
                        lastLabelPos[elev] = { x: midX, y: midY };
                        break; // one label per path per elevation
                    }
                    }
                }
            }
        }
    }

    return { isoPaths, labels, elevationReport };
}

export function generateTinContoursAsIsoPaths(
    tin: TinSurface,
    contourInterval: number,
    majorInterval: number,
    smoothing: number,
    showLabels: boolean,
    labelDensity: number,
    inclusionLines?: SurveyLine[],
    exclusionLines?: SurveyLine[],
    elevationFilter?: ElevationFilterOptions
): { isoPaths: IsoPath[]; labels: ContourLabel[]; elevationReport: ElevationFilterReport } {
    if (!tin.vertices || tin.vertices.length < 3 || !tin.triangles || tin.triangles.length === 0) {
        return { isoPaths: [], labels: [], elevationReport: emptyElevationReport() };
    }

    const inclSegs = getSegPairs(inclusionLines ?? []);
    const inclPoly = inclSegs.length >= 3 ? buildPolygonFromSegments(inclSegs) : null;

    const exclSegs = getSegPairs(exclusionLines ?? []);
    const exclPoly = exclSegs.length >= 3 ? buildPolygonFromSegments(exclSegs) : null;

    // TIN triangles reference vertices by index, so unusable vertices are kept in
    // place and the triangles that touch them are skipped instead.
    const dPoints: DPoint[] = tin.vertices.map(v => ({
        x: v.easting,
        y: v.northing,
        z: typeof v.elevation === 'number' && Number.isFinite(v.elevation) ? v.elevation : NaN,
    }));

    const elevationReport = emptyElevationReport();
    const finiteElevations: number[] = [];
    for (const p of dPoints) {
        if (Number.isFinite(p.z)) finiteElevations.push(p.z);
        else elevationReport.missingElevation++;
    }

    const accepted = computeAcceptedElevationRange(finiteElevations, {
        contourInterval,
        ...elevationFilter,
    });
    elevationReport.suppressed = accepted.suppressed;

    const vertexUsable = dPoints.map(p => Number.isFinite(p.z) && p.z >= accepted.min && p.z <= accepted.max);
    for (let i = 0; i < dPoints.length; i++) {
        if (Number.isFinite(dPoints[i].z) && !vertexUsable[i]) elevationReport.outOfRange++;
    }

    const usableTriangles = tin.triangles.filter(
        ([ia, ib, ic]) => vertexUsable[ia] && vertexUsable[ib] && vertexUsable[ic],
    );
    if (usableTriangles.length === 0) return { isoPaths: [], labels: [], elevationReport };

    const smoothingIterations = normalizeSmoothingIterations(smoothing);
    // TIN coordinates are often large; use a slightly looser endpoint tolerance
    // so shared-edge intersections reliably stitch into longer contour paths.
    const contourJoinTolerance = 1e-3;
    const contourPaths = new Map<number, { x: number; y: number }[][]>();

    let minElev = Infinity;
    let maxElev = -Infinity;
    for (const [ia, ib, ic] of usableTriangles) {
        for (const idx of [ia, ib, ic]) {
            const z = dPoints[idx].z;
            if (z < minElev) minElev = z;
            if (z > maxElev) maxElev = z;
        }
    }
    elevationReport.acceptedMin = Number.isFinite(minElev) ? minElev : null;
    elevationReport.acceptedMax = Number.isFinite(maxElev) ? maxElev : null;

    const startContour = Math.ceil(minElev / contourInterval) * contourInterval;

    for (let elev = startContour; elev <= maxElev; elev += contourInterval) {
        if (contourInterval <= 0) break;

        const edgesForLevel: { p1: { x: number; y: number }; p2: { x: number; y: number } }[] = [];
        for (const [ia, ib, ic] of usableTriangles) {
            const p1 = dPoints[ia];
            const p2 = dPoints[ib];
            const p3 = dPoints[ic];
            if (!p1 || !p2 || !p3) continue;

            const contourPoints: { x: number; y: number }[] = [];
            const edgePoints = [[p1, p2], [p2, p3], [p3, p1]];
            for (const [ep1, ep2] of edgePoints) {
                if ((ep1.z < elev && ep2.z >= elev) || (ep1.z >= elev && ep2.z < elev)) {
                    const dz = ep2.z - ep1.z;
                    if (Math.abs(dz) < 1e-9) continue;
                    const ratio = (elev - ep1.z) / dz;
                    if (isFinite(ratio) && ratio >= 0 && ratio <= 1) {
                        contourPoints.push({
                            x: ep1.x + ratio * (ep2.x - ep1.x),
                            y: ep1.y + ratio * (ep2.y - ep1.y),
                        });
                    }
                }
            }

            if (contourPoints.length !== 2) continue;

            const midX = (contourPoints[0].x + contourPoints[1].x) / 2;
            const midY = (contourPoints[0].y + contourPoints[1].y) / 2;
            if (exclPoly && exclPoly.length >= 3 && pointInPolygon(midX, midY, exclPoly)) continue;

            edgesForLevel.push({ p1: contourPoints[0], p2: contourPoints[1] });
        }

        const paths: { x: number; y: number }[][] = [];
        const visited = new Set<number>();
        for (let i = 0; i < edgesForLevel.length; i++) {
            if (visited.has(i)) continue;
            const path = [edgesForLevel[i].p1, edgesForLevel[i].p2];
            visited.add(i);
            let changed = true;
            while (changed) {
                changed = false;
                for (let j = 0; j < edgesForLevel.length; j++) {
                    if (visited.has(j)) continue;
                    const edge = edgesForLevel[j];
                    const head = path[path.length - 1];
                    const tail = path[0];
                    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
                    if (dist(head, edge.p1) < contourJoinTolerance) { path.push(edge.p2); visited.add(j); changed = true; }
                    else if (dist(head, edge.p2) < contourJoinTolerance) { path.push(edge.p1); visited.add(j); changed = true; }
                    else if (dist(tail, edge.p1) < contourJoinTolerance) { path.unshift(edge.p2); visited.add(j); changed = true; }
                    else if (dist(tail, edge.p2) < contourJoinTolerance) { path.unshift(edge.p1); visited.add(j); changed = true; }
                }
            }
            paths.push(path);
        }

        contourPaths.set(elev, paths);
    }

    const isoPaths: IsoPath[] = [];
    const labels: ContourLabel[] = [];
    const minLabelSpacingSq = (200 * (1 / (labelDensity || 0.5))) ** 2;
    const lastLabelPos: { [key: number]: { x: number; y: number } } = {};

    for (const [elev, paths] of contourPaths.entries()) {
        const isMajor = Math.abs(elev % majorInterval) < 1e-6 || Math.abs(elev % majorInterval - majorInterval) < 1e-6;
        for (const path of paths) {
            const smoothedPath = smoothingIterations > 0 ? chaikinSmooth(path, smoothingIterations) : path;
            const renderedPaths = inclPoly && inclPoly.length >= 3
                ? clipIsoPathsToPolygon([{ elevation: elev, isMajor, vertices: smoothedPath }], inclPoly)
                : [{ elevation: elev, isMajor, vertices: smoothedPath }];
            isoPaths.push(...renderedPaths);

            if (showLabels && isMajor) {
                for (const renderedPath of renderedPaths) {
                    for (let i = 0; i < renderedPath.vertices.length - 1; i++) {
                        const p1 = renderedPath.vertices[i];
                        const p2 = renderedPath.vertices[i + 1];
                    const segLenSq = (p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2;
                    if (segLenSq < 50 ** 2) continue;
                    const midX = (p1.x + p2.x) / 2;
                    const midY = (p1.y + p2.y) / 2;
                    const lastPos = lastLabelPos[elev];
                    const distSq = lastPos ? (midX - lastPos.x) ** 2 + (midY - lastPos.y) ** 2 : Infinity;
                    if (distSq > minLabelSpacingSq) {
                        const dx = p2.x - p1.x;
                        const dy = p2.y - p1.y;
                        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
                        if (angle < -90 || angle > 90) angle += 180;
                        labels.push({ x: midX, y: midY, text: elev.toFixed(0), angle });
                        lastLabelPos[elev] = { x: midX, y: midY };
                        break;
                    }
                    }
                }
            }
        }
    }

    return { isoPaths, labels, elevationReport };
}

/**
 * Convert IsoPath[] back to individual SurveyLine segments for canvas rendering.
 * Optionally tags each segment with the ContourGeneration id.
 */
export function isoPathsToSurveyLines(isoPaths: IsoPath[], contourGenId?: string): SurveyLine[] {
    const lines: SurveyLine[] = [];
    for (const path of isoPaths) {
        for (let i = 0; i < path.vertices.length - 1; i++) {
            const v1 = path.vertices[i];
            const v2 = path.vertices[i + 1];
            lines.push({
                from: '',
                to: '',
                fromPt: { x: v1.x, y: v1.y, z: path.elevation },
                toPt: { x: v2.x, y: v2.y, z: path.elevation },
                type: path.isMajor ? 'contour-major' : 'contour-minor',
                source: 'survey',
                ...(contourGenId ? { contourGenId } : {}),
            });
        }
    }
    return lines;
}

function pointsClose(a: { x: number; y: number }, b: { x: number; y: number }, eps = 1e-6): boolean {
    return Math.hypot(a.x - b.x, a.y - b.y) <= eps;
}

function lineSegmentIntersection(
    x1: number, y1: number,
    x2: number, y2: number,
    x3: number, y3: number,
    x4: number, y4: number
): { x: number; y: number; t: number; u: number } | null {
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-12) return null;

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / denom;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;

    return {
        x: x1 + t * (x2 - x1),
        y: y1 + t * (y2 - y1),
        t,
        u,
    };
}

function clipSegmentToPolygon(
    a: { x: number; y: number },
    b: { x: number; y: number },
    polygon: { x: number; y: number }[]
): Array<{ a: { x: number; y: number }; b: { x: number; y: number } }> {
    const aInside = pointInPolygon(a.x, a.y, polygon);
    const bInside = pointInPolygon(b.x, b.y, polygon);
    const intersections: Array<{ x: number; y: number; t: number }> = [];

    for (let i = 0; i < polygon.length; i++) {
        const p1 = polygon[i];
        const p2 = polygon[(i + 1) % polygon.length];
        const hit = lineSegmentIntersection(a.x, a.y, b.x, b.y, p1.x, p1.y, p2.x, p2.y);
        if (hit) intersections.push({ x: hit.x, y: hit.y, t: hit.t });
    }

    intersections.sort((p, q) => p.t - q.t);
    const uniqueIntersections: Array<{ x: number; y: number; t: number }> = [];
    for (const hit of intersections) {
        const last = uniqueIntersections[uniqueIntersections.length - 1];
        if (!last || !pointsClose(hit, last, 1e-5)) uniqueIntersections.push(hit);
    }

    if (aInside && bInside) {
        return [{ a, b }];
    }

    if (!aInside && !bInside) {
        if (uniqueIntersections.length >= 2) {
            return [{
                a: { x: uniqueIntersections[0].x, y: uniqueIntersections[0].y },
                b: { x: uniqueIntersections[1].x, y: uniqueIntersections[1].y },
            }];
        }
        return [];
    }

    if (uniqueIntersections.length === 0) return [];
    const i0 = { x: uniqueIntersections[0].x, y: uniqueIntersections[0].y };
    return aInside ? [{ a, b: i0 }] : [{ a: i0, b }];
}

/**
 * Clips IsoPath geometry to a polygon and returns split/trimmed paths.
 */
export function clipIsoPathsToPolygon(isoPaths: IsoPath[], polygon: { x: number; y: number }[]): IsoPath[] {
    if (!polygon || polygon.length < 3) return isoPaths;
    const out: IsoPath[] = [];

    for (const path of isoPaths) {
        if (!path.vertices || path.vertices.length < 2) continue;
        let current: Array<{ x: number; y: number }> = [];

        for (let i = 0; i < path.vertices.length - 1; i++) {
            const v1 = path.vertices[i];
            const v2 = path.vertices[i + 1];
            const clipped = clipSegmentToPolygon(v1, v2, polygon);

            if (clipped.length === 0) {
                if (current.length >= 2) out.push({ ...path, vertices: current });
                current = [];
                continue;
            }

            for (const seg of clipped) {
                if (current.length === 0) {
                    current.push(seg.a, seg.b);
                } else {
                    const tail = current[current.length - 1];
                    if (!pointsClose(tail, seg.a, 1e-5)) {
                        if (current.length >= 2) out.push({ ...path, vertices: current });
                        current = [seg.a, seg.b];
                    } else {
                        current.push(seg.b);
                    }
                }
            }
        }

        if (current.length >= 2) out.push({ ...path, vertices: current });
    }

    return out;
}

/**
 * Re-clips ESRI/State contour lines so that segments whose midpoint falls
 * inside the given polygon are suppressed.  Returns the input array with
 * affected lines marked `hidden: true`.  Used for ESRI blend mode so that
 * survey contours are the sole source inside an inclusion boundary.
 */
export function suppressEsriContoursInsidePolygon(
    lines: SurveyLine[],
    blendPolygon: { x: number; y: number }[]
): SurveyLine[] {
    if (blendPolygon.length < 3) return lines;
    return lines.map(l => {
        if (l.layer !== 'ESRI-CONTOUR' && l.source !== 'esri') return l;
        if (!l.fromPt || !l.toPt) return l;
        const midX = (l.fromPt.x + l.toPt.x) / 2;
        const midY = (l.fromPt.y + l.toPt.y) / 2;
        if (pointInPolygon(midX, midY, blendPolygon)) {
            return { ...l, hidden: true };
        }
        return l;
    });
}

// Re-export polygon helpers for use in App.tsx blend logic
export { buildPolygonFromSegments, pointInPolygon, getSegPairs, clipSegmentToPolygon };

// FIX: Added 'generateProfile' function to create elevation profiles.
// Now also consults contour SurveyLines (e.g. fetched from PASDA / state DEM
// services) — any contour segment that crosses the profile line contributes a
// (station, elevation) sample where they intersect. Without this, profiles
// drawn through a tile that has ONLY contour data (no survey points) come back
// empty and the chart appears blank.
export function generateProfile(
  fromPoint: SurveyPoint,
  toPoint: SurveyPoint,
  allPoints: SurveyPoint[],
  contourLines: SurveyLine[] = []
): ProfilePoint[] {
  const profilePoints: ProfilePoint[] = [];

  const { northing: N1, easting: E1, elevation: Z1 = 0 } = fromPoint;
  const { northing: N2, easting: E2, elevation: Z2 = 0 } = toPoint;

  const dN = N2 - N1;
  const dE = E2 - E1;

  const lineLengthSq = dN * dN + dE * dE;
  const lineLength = Math.sqrt(lineLengthSq);

  if (lineLength < 1e-6) {
    throw new Error('Start and end points for profile are too close or identical.');
  }

  // Add start and end points
  profilePoints.push({ station: 0, elevation: Z1 });
  profilePoints.push({ station: lineLength, elevation: Z2 });

  // Define a tolerance for how far a point can be from the line to be included
  const tolerance = 5.0; // 5 survey feet

  for (const p of allPoints) {
    if (p.pointNumber === fromPoint.pointNumber || p.pointNumber === toPoint.pointNumber) {
      continue;
    }
    
    const { northing: Np, easting: Ep, elevation: Zp = 0 } = p;

    // Project point p onto the line defined by fromPoint and toPoint
    const t = ((Ep - E1) * dE + (Np - N1) * dN) / lineLengthSq;

    // Check if the projection is within the line segment
    if (t >= 0 && t <= 1) {
      const station = t * lineLength;
      
      const projectionE = E1 + t * dE;
      const projectionN = N1 + t * dN;
      
      const perpendicularDistance = Math.hypot(Ep - projectionE, Np - projectionN);

      if (perpendicularDistance <= tolerance) {
        profilePoints.push({ station: station, elevation: Zp });
      }
    }
  }

  // ── Contour-line intersections ─────────────────────────────────────────────
  // The profile line in canvas coordinates runs from (E1, N1) to (E2, N2).
  // Contour SurveyLines store endpoints as { fromPt: {x,y,z}, toPt: {x,y,z} }
  // where x=easting, y=northing, z=elevation. For each contour segment, solve
  // the 2D parametric intersection with the profile line; if the intersection
  // lies inside BOTH segments, emit a profile sample at that station.
  //
  // Parametric form:
  //   profile:  P(t) = (E1, N1) + t * (dE, dN),         t ∈ [0,1]
  //   contour:  Q(u) = (cx1, cy1) + u * (cdx, cdy),     u ∈ [0,1]
  // Solve P(t) = Q(u) — 2 equations, 2 unknowns. Skip when nearly parallel.
  for (const seg of contourLines) {
    if (!seg.fromPt || !seg.toPt) continue;
    const cx1 = seg.fromPt.x, cy1 = seg.fromPt.y;
    const cx2 = seg.toPt.x,   cy2 = seg.toPt.y;
    const cdx = cx2 - cx1, cdy = cy2 - cy1;

    // Denominator of Cramer's rule for the 2x2 system:
    //   [ dE  -cdx ] [t]   [ cx1 - E1 ]
    //   [ dN  -cdy ] [u] = [ cy1 - N1 ]
    const denom = dE * (-cdy) - dN * (-cdx);   // = -dE*cdy + dN*cdx
    if (Math.abs(denom) < 1e-9) continue;       // parallel / colinear → skip

    const rhsX = cx1 - E1;
    const rhsY = cy1 - N1;
    const t = (rhsX * (-cdy) - rhsY * (-cdx)) / denom;
    const u = (dE * rhsY    - dN * rhsX)    / denom;

    if (t < 0 || t > 1 || u < 0 || u > 1) continue;

    // Interpolate elevation along the contour segment (almost always constant
    // since fromPt.z === toPt.z, but be safe in case future sources vary it).
    const z1 = seg.fromPt.z ?? 0;
    const z2 = seg.toPt.z   ?? 0;
    const zAtIntersection = z1 + u * (z2 - z1);

    profilePoints.push({ station: t * lineLength, elevation: zAtIntersection });
  }

  // Sort by station
  profilePoints.sort((a, b) => a.station - b.station);

  return profilePoints;
}
