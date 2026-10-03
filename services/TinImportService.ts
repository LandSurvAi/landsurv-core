import { SessionFile, TinSurface, TinVertex } from '../types.ts';
import { buildTinFromPoints } from './TinService.ts';

function decodeBase64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeTinBytesAsText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return Array.from(bytes, b => String.fromCharCode(b)).join('');
  }
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const clamped = Math.max(0, Math.min(1, q));
  const idx = (sorted.length - 1) * clamped;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const t = idx - lo;
  return sorted[lo] * (1 - t) + sorted[hi] * t;
}

function filterByIqr(points: TinVertex[], fenceMultiplier = 3): TinVertex[] {
  if (points.length < 8) return points;
  const sortedE = points.map(v => v.easting).sort((a, b) => a - b);
  const sortedN = points.map(v => v.northing).sort((a, b) => a - b);

  const q1e = quantile(sortedE, 0.25);
  const q3e = quantile(sortedE, 0.75);
  const q1n = quantile(sortedN, 0.25);
  const q3n = quantile(sortedN, 0.75);
  const iqrE = Math.max(q3e - q1e, 1e-6);
  const iqrN = Math.max(q3n - q1n, 1e-6);

  const minE = q1e - iqrE * fenceMultiplier;
  const maxE = q3e + iqrE * fenceMultiplier;
  const minN = q1n - iqrN * fenceMultiplier;
  const maxN = q3n + iqrN * fenceMultiplier;

  return points.filter(v =>
    v.easting >= minE && v.easting <= maxE &&
    v.northing >= minN && v.northing <= maxN
  );
}

function filterByLocalDensity(points: TinVertex[]): TinVertex[] {
  if (points.length < 50) return points;

  let minE = Infinity;
  let maxE = -Infinity;
  let minN = Infinity;
  let maxN = -Infinity;
  for (const p of points) {
    if (p.easting < minE) minE = p.easting;
    if (p.easting > maxE) maxE = p.easting;
    if (p.northing < minN) minN = p.northing;
    if (p.northing > maxN) maxN = p.northing;
  }

  const rangeE = Math.max(maxE - minE, 1);
  const rangeN = Math.max(maxN - minN, 1);
  const area = Math.max(rangeE * rangeN, 1);
  const cellSize = Math.max(Math.sqrt(area / Math.max(points.length, 1)) * 0.75, 1);

  const grid = new Map<string, number[]>();
  const cellKey = (cx: number, cy: number) => `${cx}|${cy}`;

  points.forEach((p, i) => {
    const cx = Math.floor((p.easting - minE) / cellSize);
    const cy = Math.floor((p.northing - minN) / cellSize);
    const key = cellKey(cx, cy);
    const list = grid.get(key);
    if (list) list.push(i);
    else grid.set(key, [i]);
  });

  const nearDist2 = (cellSize * 2.5) * (cellSize * 2.5);
  const keep: TinVertex[] = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const cx = Math.floor((p.easting - minE) / cellSize);
    const cy = Math.floor((p.northing - minN) / cellSize);
    let neighborCount = 0;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = grid.get(cellKey(cx + dx, cy + dy));
        if (!bucket) continue;
        for (const j of bucket) {
          if (j === i) continue;
          const q = points[j];
          const dE = p.easting - q.easting;
          const dN = p.northing - q.northing;
          if (dE * dE + dN * dN <= nearDist2) {
            neighborCount++;
            if (neighborCount >= 1) break;
          }
        }
        if (neighborCount >= 1) break;
      }
      if (neighborCount >= 1) break;
    }

    if (neighborCount >= 1) keep.push(p);
  }

  return keep.length >= 3 ? keep : points;
}

function planarityRatio(points: TinVertex[]): number {
  if (points.length < 3) return 0;
  let meanE = 0;
  let meanN = 0;
  for (const p of points) {
    meanE += p.easting;
    meanN += p.northing;
  }
  meanE /= points.length;
  meanN /= points.length;

  let varE = 0;
  let varN = 0;
  let cov = 0;
  for (const p of points) {
    const dE = p.easting - meanE;
    const dN = p.northing - meanN;
    varE += dE * dE;
    varN += dN * dN;
    cov += dE * dN;
  }
  varE /= points.length;
  varN /= points.length;
  cov /= points.length;

  const trace = varE + varN;
  if (trace <= 0) return 0;
  const det = varE * varN - cov * cov;
  const disc = Math.max(0, trace * trace - 4 * det);
  const lambdaMin = (trace - Math.sqrt(disc)) / 2;
  const lambdaMax = (trace + Math.sqrt(disc)) / 2;
  if (lambdaMax <= 0) return 0;
  return lambdaMin / lambdaMax;
}

function extractCandidates(view: DataView, start: number, stride: number, littleEndian: boolean): TinVertex[] {
  const candidates: TinVertex[] = [];
  const dedupe = new Set<string>();

  for (let off = start; off + 24 <= view.byteLength; off += stride) {
    const a = view.getFloat64(off, littleEndian);
    const b = view.getFloat64(off + 8, littleEndian);
    const c = view.getFloat64(off + 16, littleEndian);

    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) continue;
    if (a < 100 || a > 2e7 || b < 100 || b > 2e7) continue;
    if (c < -2000 || c > 50000) continue;

    const key = `${a.toFixed(3)}|${b.toFixed(3)}|${c.toFixed(3)}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);

    candidates.push({ easting: a, northing: b, elevation: c });
  }

  return candidates;
}

function tryExtractCarlsonPoints(bytes: Uint8Array): TinVertex[] {
  const header = decodeTinBytesAsText(bytes.slice(0, Math.min(bytes.length, 512))).toLowerCase();
  if (!header.includes('carlson dtm')) return [];

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let best: TinVertex[] = [];
  let bestScore = -Infinity;

  const strides = [24, 32, 40, 48, 56, 64];
  const endianness = [true, false];
  for (const littleEndian of endianness) {
    for (const stride of strides) {
      for (let start = 0; start < stride; start += 8) {
        let candidates = extractCandidates(view, start, stride, littleEndian);
        if (candidates.length < 20) continue;

        candidates = filterByIqr(candidates, 3);
        candidates = filterByLocalDensity(candidates);
        if (candidates.length < 20) continue;

        const ratio = planarityRatio(candidates);
        if (ratio < 1e-5) continue;

        let minE = Infinity;
        let maxE = -Infinity;
        let minN = Infinity;
        let maxN = -Infinity;
        for (const p of candidates) {
          if (p.easting < minE) minE = p.easting;
          if (p.easting > maxE) maxE = p.easting;
          if (p.northing < minN) minN = p.northing;
          if (p.northing > maxN) maxN = p.northing;
        }
        const rangeE = Math.max(maxE - minE, 1);
        const rangeN = Math.max(maxN - minN, 1);
        const aspectPenalty = Math.max(rangeE, rangeN) / Math.min(rangeE, rangeN);
        const score = candidates.length * Math.min(Math.max(ratio * 2000, 0.25), 4) / Math.max(Math.sqrt(aspectPenalty), 1);

        if (score > bestScore) {
          bestScore = score;
          best = candidates;
        }
      }
    }
  }

  return best.length >= 3 ? best : [];
}

/* ===========================================================================
 * REAL Carlson DTM binary .tin parser.
 *
 * A Carlson binary .tin stores the FULL triangulation: an ordered array of
 * vertex records (x,y,z as IEEE-754 float64) followed by a triangle table of
 * integer indices into that vertex array. Reading the real triangle table is
 * the only way to reproduce the surface exactly — re-triangulating extracted
 * points with a convex hull invents "bridge" triangles across concave edges.
 *
 * The byte layout (header size, record stride, index width, endianness, index
 * base) is proprietary and varies by version, so rather than hard-coding
 * offsets we DISCOVER the layout and VALIDATE it:
 *   1. Find the longest contiguous run of plausible (x,y,z) float64 records —
 *      that block, in file order, is the native-indexed vertex array.
 *   2. After it, find a contiguous run of integer triples whose values are all
 *      valid vertex indices and form non-degenerate triangles — that is the
 *      real triangle table.
 *   3. Accept only if the triangle count and vertex-reference coverage look
 *      like a genuine triangulation (~2 triangles per vertex, Euler), else
 *      return null and let the caller fall back to the point rebuild.
 *
 * Because every candidate is validated against the vertex array, a wrong guess
 * is rejected rather than silently producing garbage.
 * ========================================================================= */
interface ParsedCarlsonTin {
  vertices: TinVertex[];
  triangles: [number, number, number][];
}

function isPlausibleTinCoord(x: number, y: number, z: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false;
  // Eastings/northings: positive plan coordinates (local, state-plane, UTM).
  if (x < 1 || x > 2e7) return false;
  if (y < 1 || y > 2e7) return false;
  if (z < -5000 || z > 60000) return false;
  return true;
}

/** Read a maximal run of float64 (x,y,z) vertex records starting at `start`. */
function readVertexRun(view: DataView, start: number, stride: number, le: boolean): TinVertex[] {
  const verts: TinVertex[] = [];
  for (let off = start; off + 24 <= view.byteLength; off += stride) {
    const x = view.getFloat64(off, le);
    const y = view.getFloat64(off + 8, le);
    const z = view.getFloat64(off + 16, le);
    if (!isPlausibleTinCoord(x, y, z)) break;
    verts.push({ easting: x, northing: y, elevation: z });
  }
  return verts;
}

/**
 * Read the triangle index table.
 *
 * Carlson stores each triangle as a fixed-`stride` record consisting of a small
 * tag, three node indices (each int32, the first at `fieldOffset` within the
 * record), and trailing flag/neighbour bytes. Indices are `base`-relative
 * (1-based in the files observed). A handful of records may reference a phantom
 * index (count+1) or be otherwise corrupt, so we SKIP isolated invalid records
 * rather than terminating — but stop once we hit a sustained run of invalid
 * records, which marks the end of the table.
 */
function readTriangleRun(
  view: DataView,
  start: number,
  stride: number,
  le: boolean,
  vertexCount: number,
  base: number,
  fieldOffset: number,
): [number, number, number][] {
  const tris: [number, number, number][] = [];
  const maxConsecutiveMiss = 4;
  let miss = 0;
  for (let off = start; off + fieldOffset + 12 <= view.byteLength; off += stride) {
    const a = view.getInt32(off + fieldOffset, le) - base;
    const b = view.getInt32(off + fieldOffset + 4, le) - base;
    const c = view.getInt32(off + fieldOffset + 8, le) - base;
    const valid =
      a >= 0 && b >= 0 && c >= 0 &&
      a < vertexCount && b < vertexCount && c < vertexCount &&
      a !== b && b !== c && a !== c;
    if (valid) {
      tris.push([a, b, c]);
      miss = 0;
    } else {
      miss += 1;
      if (miss > maxConsecutiveMiss) break;
    }
  }
  return tris;
}

function parseCarlsonTinBinary(bytes: Uint8Array): ParsedCarlsonTin | null {
  try {
    const header = decodeTinBytesAsText(bytes.slice(0, Math.min(bytes.length, 512))).toLowerCase();
    if (!header.includes('carlson dtm')) return null;
    if (bytes.byteLength < 64) return null;

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // Carlson DTM node records are 30 bytes (x,y,z float64 + 6 bytes id/flags).
    // The other strides are fall-backs for format variants. Carlson is little-endian.
    const vertexStrides = [30, 24, 28, 32, 36, 40, 48, 60];
    // Triangle records are 15 bytes (2-byte tag + 3*int32 index + 1 byte).
    const triStrides = [15, 12, 16, 20, 24, 28, 32];
    // First index sits at +2 (after the 2-byte tag); 0 covers tag-less variants.
    const triFieldOffsets = [2, 0];
    const headerScanLimit = Math.min(bytes.byteLength - 24, 8192);

    let bestVerts: TinVertex[] = [];
    let bestVertexStride = 30;
    let bestVertexStart = 0;
    let bestLe = true;

    // --- 1. Locate the native-ordered vertex block (longest valid coord run).
    // A genuine node table has thousands of records; once we find a long run we
    // stop scanning further strides/endianness so the main thread isn't blocked.
    outerVerts:
    for (const le of [true, false]) {
      for (const stride of vertexStrides) {
        for (let start = 0; start <= headerScanLimit; start += 2) {
          // Cheap precheck: the first record must be a plausible coordinate.
          const x0 = view.getFloat64(start, le);
          const y0 = view.getFloat64(start + 8, le);
          const z0 = view.getFloat64(start + 16, le);
          if (!isPlausibleTinCoord(x0, y0, z0)) continue;

          const verts = readVertexRun(view, start, stride, le);
          if (verts.length > bestVerts.length) {
            bestVerts = verts;
            bestVertexStride = stride;
            bestVertexStart = start;
            bestLe = le;
          }
          // Skip past this run to avoid rescanning every offset within it.
          start += Math.max(0, (verts.length - 1)) * stride;
        }
        // A run of 64+ records is unambiguously the real node table — the
        // first matching stride/endianness wins, no need to try the rest.
        if (bestVerts.length >= 64) break outerVerts;
      }
    }

    if (bestVerts.length < 3) return null;
    const vertexCount = bestVerts.length;
    const vertexEnd = bestVertexStart + vertexCount * bestVertexStride;

    // --- 2. Locate the triangle index table after the vertex block. The table
    // can sit far past the node block (an intermediate edge/winged-edge section
    // may separate them), so we scan the remainder of the file and keep the
    // longest valid run. Indices are validated against the node count.
    //
    // CRITICAL for responsiveness: the correct (stride 15 / field +2 / 1-based)
    // layout is tried first, so as soon as a clearly-real table is found we
    // accept it and stop. Without this the loop would re-scan the entire file
    // for every remaining stride/offset/base combination (~25M iterations),
    // blocking the main thread long enough to trigger the browser's
    // "page unresponsive" dialog.
    let bestTris: [number, number, number][] = [];

    const triScanStart = Math.max(0, vertexEnd - 8);
    const minRun = Math.max(8, Math.floor(vertexCount * 0.5));
    // A real triangulation has ~2 triangles per node (Euler); anything close to
    // the node count is unmistakably the table and ends the search.
    const acceptThreshold = vertexCount;
    outerTris:
    for (const stride of triStrides) {
      for (const fieldOffset of triFieldOffsets) {
        for (const base of [1, 0]) {
          for (let start = triScanStart; start + fieldOffset + 12 <= bytes.byteLength; start += 1) {
            // Cheap precheck: the first record must be a valid triple.
            const a0 = view.getInt32(start + fieldOffset, bestLe) - base;
            const b0 = view.getInt32(start + fieldOffset + 4, bestLe) - base;
            const c0 = view.getInt32(start + fieldOffset + 8, bestLe) - base;
            if (
              a0 < 0 || b0 < 0 || c0 < 0 ||
              a0 >= vertexCount || b0 >= vertexCount || c0 >= vertexCount ||
              a0 === b0 || b0 === c0 || a0 === c0
            ) {
              continue;
            }

            const tris = readTriangleRun(view, start, stride, bestLe, vertexCount, base, fieldOffset);
            if (tris.length > bestTris.length) {
              bestTris = tris;
            }
            // Skip past this run to avoid rescanning every offset within it.
            if (tris.length > minRun) start += (tris.length - 1) * stride;
          }
          // Found the genuine table — stop before scanning the whole file again.
          if (bestTris.length >= acceptThreshold) break outerTris;
        }
      }
    }

    // --- 3. Accept only a genuine-looking triangulation.
    if (bestTris.length < Math.max(8, Math.floor(vertexCount * 0.8))) return null;
    const used = new Uint8Array(vertexCount);
    for (const t of bestTris) { used[t[0]] = 1; used[t[1]] = 1; used[t[2]] = 1; }
    let refCount = 0;
    for (let i = 0; i < vertexCount; i++) if (used[i]) refCount++;
    if (refCount / vertexCount < 0.6) return null;

    return { vertices: bestVerts, triangles: bestTris };
  } catch {
    return null;
  }
}

/**
 * Alpha-shape style pruning. `buildTinFromPoints` produces a Delaunay
 * triangulation that fills the entire CONVEX HULL of the point set, so any
 * concave boundary (notches, re-entrant corners) gets spanned by long, skinny
 * "bridge" triangles. These show up as the fan/streak lines reaching across
 * empty space.
 *
 * Real TIN triangles between neighboring shots are all roughly the same small
 * size (governed by the survey point spacing). Bridge triangles are several
 * times longer. We therefore compute the median longest-edge across all
 * triangles and drop any triangle whose longest edge exceeds a multiple of
 * that median. This is uniform (not boundary-restricted), so it removes
 * bridges everywhere without carving holes in the genuine interior mesh —
 * interior triangles sit near the median and always survive.
 */
function filterTriangleOutliers(surface: TinSurface): TinSurface {
  if (!surface.triangles || surface.triangles.length < 24) return surface;

  const maxEdges = surface.triangles.map((tri) => {
    const [ia, ib, ic] = tri;
    const a = surface.vertices[ia];
    const b = surface.vertices[ib];
    const c = surface.vertices[ic];
    if (!a || !b || !c) return Infinity;
    const ab = Math.hypot(a.easting - b.easting, a.northing - b.northing);
    const bc = Math.hypot(b.easting - c.easting, b.northing - c.northing);
    const ca = Math.hypot(c.easting - a.easting, c.northing - a.northing);
    return Math.max(ab, bc, ca);
  });

  const finiteSorted = maxEdges.filter(Number.isFinite).sort((x, y) => x - y);
  if (finiteSorted.length < 8) return surface;

  const median = quantile(finiteSorted, 0.5);
  if (!(median > 0)) return surface;

  // Alpha factor: triangles whose longest edge is more than ~4× the typical
  // spacing are bridges. 4× keeps legitimate larger interior triangles (sparse
  // shot areas) while still removing hull-spanning streaks.
  const alphaFactor = 4;
  const cutoff = median * alphaFactor;

  const filteredTriangles = surface.triangles.filter((_, i) =>
    Number.isFinite(maxEdges[i]) && maxEdges[i] <= cutoff
  );

  // Safety: if statistics over-prune (unusual point distribution), keep original.
  if (filteredTriangles.length < Math.max(3, Math.floor(surface.triangles.length * 0.4))) {
    return surface;
  }

  return { ...surface, triangles: filteredTriangles };
}

/**
 * Exterior "trim" — remove the empty corridor between the convex hull and the
 * true terrain footprint that a convex-hull Delaunay rebuild invents at concave
 * notches/re-entrants ("bridge" triangles), WITHOUT tearing interior holes.
 *
 * Discriminator (two conditions, both required for a triangle to be removed):
 *   1. ELIGIBLE: the triangle has ≥2 edges longer than `cutoff` (= edgeFactor ×
 *      median edge length). A thin/wide sliver spanning empty space has two long
 *      edges; a REAL terrain triangle — even a big one in a sparse area, or a
 *      perimeter triangle — has at most ONE long edge. So only genuine gap
 *      slivers are ever eligible → interior mesh and perimeter are never eaten.
 *   2. EXTERIOR-CONNECTED: starting from eligible triangles that sit on the
 *      convex hull, flood through LONG shared edges into eligible neighbors. The
 *      flood is the empty corridor reaching inward from the hull and halts at the
 *      real terrain perimeter (short edges). Enclosed interior voids (a pond, a
 *      building pad) are not reachable from the hull, so they stay FILLED.
 *
 * NOTE: This runs on the heuristic Carlson-binary REBUILD path (convex-hull
 * Delaunay over points scanned from the binary). With reconstructed points the
 * boundary is inferred, not authoritative — for exact topology, export the
 * surface from Carlson/C3D as LandXML with faces.
 */
function trimExteriorBridges(surface: TinSurface, edgeFactor = 2.4): TinSurface {
  if (!surface.triangles || surface.triangles.length < 24) return surface;

  const tris = surface.triangles;
  const edgeLen = (i: number, j: number): number => {
    const a = surface.vertices[i];
    const b = surface.vertices[j];
    if (!a || !b) return Infinity;
    return Math.hypot(a.easting - b.easting, a.northing - b.northing);
  };
  const edgeId = (i: number, j: number) => (i < j ? `${i}|${j}` : `${j}|${i}`);

  // cutoff = edgeFactor × median edge length (typical point spacing).
  const allEdges: number[] = [];
  for (const t of tris) {
    allEdges.push(edgeLen(t[0], t[1]), edgeLen(t[1], t[2]), edgeLen(t[2], t[0]));
  }
  const sortedEdges = allEdges.filter(Number.isFinite).sort((x, y) => x - y);
  if (sortedEdges.length < 12) return surface;
  const median = quantile(sortedEdges, 0.5);
  if (!(median > 0)) return surface;
  const cutoff = median * edgeFactor;

  // Map each undirected edge -> the triangle(s) that use it (≤2 in a manifold).
  const edgeToTris = new Map<string, number[]>();
  for (let t = 0; t < tris.length; t++) {
    const tri = tris[t];
    const keys = [edgeId(tri[0], tri[1]), edgeId(tri[1], tri[2]), edgeId(tri[2], tri[0])];
    for (const k of keys) {
      const arr = edgeToTris.get(k);
      if (arr) arr.push(t);
      else edgeToTris.set(k, [t]);
    }
  }

  // Per-triangle edge classification.
  const longEdges = new Int8Array(tris.length); // count of edges longer than cutoff
  const hasHullEdge = new Uint8Array(tris.length);
  for (let t = 0; t < tris.length; t++) {
    const tri = tris[t];
    const e: [number, number][] = [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]];
    let n = 0;
    for (const [i, j] of e) {
      if (edgeLen(i, j) > cutoff) n++;
      if (edgeToTris.get(edgeId(i, j))!.length === 1) hasHullEdge[t] = 1;
    }
    longEdges[t] = n;
  }

  // ---------------------------------------------------------------------------
  // EXTERIOR = the empty region between the convex hull and the true terrain.
  //
  // A triangle is EXTERIOR-ELIGIBLE only if it has ≥2 long edges — i.e. it is a
  // thin/wide sliver genuinely spanning a gap. Real terrain triangles (even big
  // ones in sparse areas, and perimeter triangles) have AT MOST ONE long edge,
  // so they are never eligible → no holes, no nibbled edges.
  //
  // We then FLOOD the exterior region starting from eligible triangles that sit
  // on the convex hull, crossing into a neighbor ONLY through a LONG shared edge
  // and ONLY if that neighbor is itself eligible. The flood is therefore the
  // connected empty corridor reaching in from the hull; it halts at the real
  // terrain perimeter (short edges). Enclosed interior voids are not reachable
  // from the hull, so they stay filled.
  // ---------------------------------------------------------------------------
  const eligible = (t: number) => longEdges[t] >= 2;

  const exterior = new Uint8Array(tris.length);
  const stack: number[] = [];
  for (let t = 0; t < tris.length; t++) {
    if (hasHullEdge[t] && eligible(t)) { exterior[t] = 1; stack.push(t); }
  }

  while (stack.length > 0) {
    const t = stack.pop()!;
    const tri = tris[t];
    const e: [number, number][] = [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]];
    for (const [i, j] of e) {
      if (edgeLen(i, j) <= cutoff) continue;            // only travel through gaps
      const users = edgeToTris.get(edgeId(i, j))!;
      for (const n of users) {
        if (n !== t && !exterior[n] && eligible(n)) {
          exterior[n] = 1;
          stack.push(n);
        }
      }
    }
  }

  const kept = tris.filter((_, t) => !exterior[t]);
  const floor = Math.max(3, Math.floor(tris.length * 0.35));
  const removedCount = tris.length - kept.length;
  // eslint-disable-next-line no-console
  console.log(
    `[TIN trim] in=${tris.length} tris, median=${median.toFixed(2)}, cutoff=${cutoff.toFixed(2)}, ` +
    `removed(exterior)=${removedCount}, out=${kept.length}`,
  );
  if (kept.length === tris.length) return surface;
  if (kept.length < floor) return surface; // safety: never gut the surface
  return { ...surface, triangles: kept };
}

interface LandXmlFace {
  a: string;
  b: string;
  c: string;
}

function createTinId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseLandXml(content: string, name: string): TinSurface {
  const pointRegex = /<P\b[^>]*id="([^"]+)"[^>]*>([^<]+)<\/P>/gi;
  const faceRegex = /<F\b[^>]*>([^<]+)<\/F>/gi;

  const vertices: TinVertex[] = [];
  const idToIndex = new Map<string, number>();

  let pointMatch: RegExpExecArray | null;
  while ((pointMatch = pointRegex.exec(content)) !== null) {
    const pointId = pointMatch[1].trim();
    const coords = pointMatch[2].trim().split(/\s+/).map(Number);
    if (coords.length < 3 || coords.some(v => Number.isNaN(v))) continue;

    const [northing, easting, elevation] = coords;
    const index = vertices.length;
    vertices.push({ easting, northing, elevation });
    idToIndex.set(pointId, index);
  }

  if (vertices.length < 3) {
    throw new Error(`LandXML parser found fewer than 3 points in ${name}.`);
  }

  const triangles: [number, number, number][] = [];
  let faceMatch: RegExpExecArray | null;
  while ((faceMatch = faceRegex.exec(content)) !== null) {
    const ids = faceMatch[1].trim().split(/\s+/);
    if (ids.length < 3) continue;

    const ia = idToIndex.get(ids[0]);
    const ib = idToIndex.get(ids[1]);
    const ic = idToIndex.get(ids[2]);
    if (ia === undefined || ib === undefined || ic === undefined) continue;

    triangles.push([ia, ib, ic]);
  }

  if (triangles.length === 0) {
    throw new Error(`LandXML parser found no triangle faces in ${name}.`);
  }

  return {
    id: createTinId('tin-import-xml'),
    name,
    createdAt: new Date().toISOString(),
    vertices,
    triangles,
    color: '#06b6d4',
  };
}

function parseNativeTin(content: string, name: string): TinSurface {
  const lines = content
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#') && !l.startsWith('//'));

  const vertices: TinVertex[] = [];
  const triangles: [number, number, number][] = [];

  let section: 'vertices' | 'triangles' | null = null;
  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper === 'VERTICES' || upper === '[VERTICES]') {
      section = 'vertices';
      continue;
    }
    if (upper === 'TRIANGLES' || upper === '[TRIANGLES]' || upper === 'FACES' || upper === '[FACES]') {
      section = 'triangles';
      continue;
    }

    const parts = line.split(/[\s,;]+/).filter(Boolean);
    if (parts.length < 3) continue;

    if (section === 'vertices') {
      const nums = parts.slice(0, 3).map(Number);
      if (nums.some(v => Number.isNaN(v))) continue;
      const [easting, northing, elevation] = nums;
      vertices.push({ easting, northing, elevation });
      continue;
    }

    if (section === 'triangles') {
      const nums = parts.slice(0, 3).map(v => Number(v));
      if (nums.some(v => Number.isNaN(v))) continue;
      const [aRaw, bRaw, cRaw] = nums;
      const zeroBased = [aRaw - 1, bRaw - 1, cRaw - 1];
      if (zeroBased.some(v => v < 0)) continue;
      triangles.push(zeroBased as [number, number, number]);
      continue;
    }
  }

  if (vertices.length < 3 || triangles.length === 0) {
    throw new Error(
      `Native .tin parser requires explicit VERTICES/TRIANGLES sections and could not parse ${name}.`,
    );
  }

  return {
    id: createTinId('tin-import-native'),
    name,
    createdAt: new Date().toISOString(),
    vertices,
    triangles,
    color: '#06b6d4',
  };
}

export function importTinSurfaceFromSessionFile(file: SessionFile): TinSurface {
  const name = file.name || 'Imported TIN';
  const ext = name.toLowerCase();
  const content = file.content || '';
  const bytes = file.fileData ? decodeBase64ToBytes(file.fileData) : null;

  if (ext.endsWith('.xml') || ext.endsWith('.landxml') || content.includes('<LandXML')) {
    // eslint-disable-next-line no-console
    console.log('[TIN import] branch=LandXML (explicit topology)');
    return trimExteriorBridges(parseLandXml(content, name));
  }

  if (ext.endsWith('.tin')) {
    try {
      const native = parseNativeTin(content, name);
      // eslint-disable-next-line no-console
      console.log(`[TIN import] branch=native .tin (explicit topology), ${native.triangles.length} source triangles`);
      return trimExteriorBridges(native);
    } catch (nativeErr) {
      const rawBytes = bytes ?? (content ? new Uint8Array(content.split('').map(ch => ch.charCodeAt(0) & 0xff)) : null);
      if (rawBytes) {
        // FIRST: try to read the REAL triangulation (vertices + triangle table)
        // straight out of the Carlson binary. When this succeeds the topology is
        // authoritative — no convex-hull rebuild, no bridges, so NO trim needed.
        const parsed = parseCarlsonTinBinary(rawBytes);
        if (parsed && parsed.triangles.length > 0) {
          // eslint-disable-next-line no-console
          console.log(`[TIN import] branch=Carlson binary REAL topology, ${parsed.vertices.length} vertices, ${parsed.triangles.length} triangles`);
          return {
            id: createTinId('tin-import-carlson'),
            name,
            createdAt: new Date().toISOString(),
            vertices: parsed.vertices,
            triangles: parsed.triangles,
            color: '#06b6d4',
          };
        }

        // FALLBACK: structure not recognised — recover points heuristically and
        // re-triangulate (convex-hull Delaunay), then trim exterior bridges.
        const extracted = tryExtractCarlsonPoints(rawBytes);
        if (extracted.length >= 3) {
          const surveyPoints = extracted.map((v, i) => ({
            pointNumber: `TIN-${i + 1}`,
            easting: v.easting,
            northing: v.northing,
            elevation: v.elevation,
            description: `TIN:${name}`,
          }));
          const rebuilt = buildTinFromPoints(surveyPoints, { name, color: '#06b6d4' });
          if (rebuilt && rebuilt.triangles.length > 0) {
            // eslint-disable-next-line no-console
            console.log(`[TIN import] branch=Carlson binary REBUILD (convex-hull Delaunay), ${extracted.length} extracted points → ${rebuilt.triangles.length} triangles`);
            // Erode only outward-reaching boundary bridges so no edge crosses
            // the concave footprint, without punching interior holes.
            return trimExteriorBridges(rebuilt);
          }
        }
      }

      const maybeCarlson = rawBytes
        ? decodeTinBytesAsText(rawBytes.slice(0, Math.min(rawBytes.length, 512))).toLowerCase().includes('carlson dtm')
        : false;
      if (maybeCarlson) {
        throw new Error(
          `Detected Carlson DTM binary .tin (${name}), but fallback extraction failed. One-to-one fidelity requires explicit triangle topology; export this surface as LandXML (with faces) from Carlson/C3D and re-import.`
        );
      }

      throw nativeErr;
    }
  }

  throw new Error(`Unsupported TIN format for ${name}. Expected .tin, .xml, or .landxml.`);
}
