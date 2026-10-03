/**
 * Overlay linework packaging for the Civil 3D connector.
 *
 * Agent-generated overlays — GIS parcel lines (Boundary Agent), contours, SSURGO
 * soils, FEMA flood zones, steep-slope bands and TIN edges — are all stored in
 * SessionState.lines as individual two-point SurveyLine segments carrying a
 * `type` but no `id` and no `polylineId`.
 *
 * Sending them to the connector raw causes two problems:
 *   1. No stable key. The DLL falls back to a positional id, so every poll looks
 *      like a brand-new set of lines and live sync churns forever.
 *   2. Thousands of stubby two-vertex polylines land in the drawing instead of
 *      the continuous linework a surveyor expects to edit.
 *
 * This module chains those segments into runs per (type, layer) and stamps each
 * run with a deterministic polylineId derived from its own geometry, so the same
 * overlay always yields the same key. The connector then treats them as ordinary
 * linework — selectable, editable and exportable like any other line or curve.
 */
import { SurveyLine } from '../types';

/** Core survey linework already delivered in its own wire bucket. */
const CORE_LINE_TYPES = new Set<string>(['breakline', 'inclusion', 'exclusion']);

/** Transient editing aids that must never reach the drawing. */
const TRANSIENT_LINE_TYPES = new Set<string>(['shrinkwrap-preview']);

const COORD_DECIMALS = 4;
const SCALE = 10 ** COORD_DECIMALS;

const quantize = (n: number): number => Math.round(n * SCALE) / SCALE;

const nodeKey = (p: { x: number; y: number }): string => `${quantize(p.x)},${quantize(p.y)}`;

/**
 * True for agent-generated overlay geometry that should sync as normal linework.
 * Anything new the agents introduce flows automatically — only core buckets and
 * transient previews are held back.
 */
export function isOverlayLine(line: SurveyLine): boolean {
  const type = line.type as string | undefined;
  if (!type) return false;
  if (CORE_LINE_TYPES.has(type)) return false;
  if (TRANSIENT_LINE_TYPES.has(type)) return false;
  return !line.hidden && !!line.fromPt && !!line.toPt;
}

function reverseSegment(segment: SurveyLine): SurveyLine {
  return {
    ...segment,
    from: segment.to,
    to: segment.from,
    fromPt: segment.toPt,
    toPt: segment.fromPt,
    curveDirection:
      segment.curveDirection === 'left' ? 'right'
        : segment.curveDirection === 'right' ? 'left'
          : segment.curveDirection,
  };
}

/** FNV-1a, so an unchanged overlay always hashes to the same key. */
function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function slug(value: string | undefined | null): string {
  return (value || 'none').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'none';
}

/**
 * Walk a bag of segments into continuous runs by matching endpoints. Segments
 * are re-oriented as needed so each run reads head → tail.
 */
function buildRuns(segments: SurveyLine[]): SurveyLine[][] {
  const adjacency = new Map<string, number[]>();
  segments.forEach((segment, index) => {
    for (const key of [nodeKey(segment.fromPt!), nodeKey(segment.toPt!)]) {
      const bucket = adjacency.get(key);
      if (bucket) bucket.push(index);
      else adjacency.set(key, [index]);
    }
  });

  const used = new Array<boolean>(segments.length).fill(false);
  const runs: SurveyLine[][] = [];

  const takeAdjacent = (node: string): number => {
    const candidates = adjacency.get(node);
    if (!candidates) return -1;
    for (const index of candidates) {
      if (!used[index]) return index;
    }
    return -1;
  };

  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const run: SurveyLine[] = [segments[i]];

    // Extend forward from the tail.
    let tail = nodeKey(segments[i].toPt!);
    const startNode = nodeKey(segments[i].fromPt!);
    while (tail !== startNode) {
      const next = takeAdjacent(tail);
      if (next < 0) break;
      used[next] = true;
      const candidate = segments[next];
      const oriented = nodeKey(candidate.fromPt!) === tail ? candidate : reverseSegment(candidate);
      run.push(oriented);
      tail = nodeKey(oriented.toPt!);
    }

    // Extend backward from the head (skipped once the run already closed).
    let head = nodeKey(run[0].fromPt!);
    while (tail !== head) {
      const previous = takeAdjacent(head);
      if (previous < 0) break;
      used[previous] = true;
      const candidate = segments[previous];
      const oriented = nodeKey(candidate.toPt!) === head ? candidate : reverseSegment(candidate);
      run.unshift(oriented);
      head = nodeKey(oriented.fromPt!);
    }

    runs.push(run);
  }

  return runs;
}

/**
 * Geometry-derived id that is independent of traversal direction, so a run and
 * its reverse resolve to the same key.
 */
function runId(type: string, layer: string | undefined, run: SurveyLine[]): string {
  const nodes = [nodeKey(run[0].fromPt!), ...run.map(s => nodeKey(s.toPt!))];
  const forward = nodes.join(';');
  const backward = [...nodes].reverse().join(';');
  const canonical = forward <= backward ? forward : backward;
  return `ov-${slug(type)}-${slug(layer)}-${nodes.length}v-${hashString(canonical)}`;
}

/**
 * Point-number → coordinate index built from the session's point lists.
 */
export function buildPointIndex(
  pointLists: Array<{ points: Array<{ pointNumber: string; easting: number; northing: number; elevation?: number }> }> | undefined | null,
): Map<string, { x: number; y: number; z: number }> {
  const index = new Map<string, { x: number; y: number; z: number }>();
  for (const list of pointLists || []) {
    for (const p of list?.points || []) {
      const key = (p.pointNumber ?? '').toString().trim();
      if (!key) continue;
      index.set(key.toUpperCase(), { x: p.easting, y: p.northing, z: p.elevation ?? 0 });
    }
  }
  return index;
}

/**
 * Give every segment concrete endpoints before it goes over the wire.
 *
 * Most LandSurv.ai linework stores only the point numbers it connects and
 * resolves coordinates at render time (the DXF exporter does the same lookup).
 * The connector cannot draw a line without coordinates, so any such segment was
 * silently dropped and never reached Civil 3D. Resolving here means the payload
 * is self-contained for every connector build.
 *
 * Point numbers win over cached coordinates so a moved point drags its lines.
 */
export function resolveLineEndpoints(
  lines: SurveyLine[] | undefined | null,
  pointIndex: Map<string, { x: number; y: number; z: number }>,
): SurveyLine[] {
  const resolved: SurveyLine[] = [];

  for (const line of lines || []) {
    if (!line) continue;
    const fromPt = pointIndex.get((line.from ?? '').toString().trim().toUpperCase()) ?? line.fromPt;
    const toPt = pointIndex.get((line.to ?? '').toString().trim().toUpperCase()) ?? line.toPt;
    if (!fromPt || !toPt) continue;

    resolved.push(line.fromPt === fromPt && line.toPt === toPt ? line : { ...line, fromPt, toPt });
  }

  return resolved;
}

/**
 * Centerlines are stored as a chain of PIs (northing/easting), not as segments,
 * so they never matched the connector's line shape and never reached the
 * drawing. Emit the PI chain as ordinary linework with a stable id.
 *
 * Note: PI curve radii are not expanded here — the chain is emitted as straight
 * runs between PIs, which is the alignment's PI framework.
 */
export function centerlinesToLinework(
  centerlines: Array<{ id: string; name?: string; pis?: Array<{ pointNumber?: string; northing: number; easting: number }> }> | undefined | null,
): SurveyLine[] {
  const segments: SurveyLine[] = [];

  for (const centerline of centerlines || []) {
    const pis = centerline?.pis || [];
    if (pis.length < 2) continue;

    const polylineId = `cl-${centerline.id}`;
    for (let i = 0; i < pis.length - 1; i++) {
      const a = pis[i];
      const b = pis[i + 1];
      if (!a || !b) continue;
      segments.push({
        // Endpoints are carried explicitly so the connector never has to guess.
        from: '',
        to: '',
        fromPt: { x: a.easting, y: a.northing, z: 0 },
        toPt: { x: b.easting, y: b.northing, z: 0 },
        layer: 'CENTERLINE',
        polylineId,
      });
    }
  }

  return segments;
}

/**
 * Package overlay segments for the connector: chained into runs and stamped with
 * a stable polylineId. Returns flat segments (the existing wire shape) so the
 * connector's polylineId grouping assembles them into polylines.
 */
export function buildOverlayLinework(lines: SurveyLine[] | undefined | null): SurveyLine[] {
  const overlays = (lines || []).filter(isOverlayLine);
  if (overlays.length === 0) return [];

  const groups = new Map<string, SurveyLine[]>();
  for (const line of overlays) {
    const key = `${line.type}\u0000${line.layer || ''}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(line);
    else groups.set(key, [line]);
  }

  const packaged: SurveyLine[] = [];
  for (const [key, segments] of groups) {
    const [type, layer] = key.split('\u0000');
    for (const run of buildRuns(segments)) {
      // Respect an explicit polylineId when an agent already provided one.
      const id = run[0].polylineId || runId(type, layer, run);
      for (const segment of run) {
        packaged.push({ ...segment, polylineId: id });
      }
    }
  }

  return packaged;
}
