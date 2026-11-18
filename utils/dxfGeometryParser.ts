/**
 * DXF Geometry Parser
 *
 * Extracts renderable geometry from raw DXF text content and maps entities into
 * LandSurv.ai `SurveyLine` and `SurveyPoint` models so drawings can be rendered
 * immediately on the 2D canvas upon upload.
 *
 * Supported DXF entities:
 *   - LWPOLYLINE (lightweight 2D polyline with bulge/arc support and closed loops)
 *   - POLYLINE / VERTEX / SEQEND (classic 2D/3D polyline)
 *   - LINE (chains contiguous connected line segments into named polylines)
 *   - CIRCLE
 *   - ARC
 *   - ELLIPSE (tessellated, including partial ellipses)
 *   - SPLINE (rational/non-rational NURBS via de Boor, fit points via Catmull-Rom)
 *   - POINT
 *   - TEXT / MTEXT (imported as label-only annotation anchors)
 *   - INSERT (block references expanded recursively, including arrays)
 *   - HATCH (solid fills and pattern boundaries, including polyline/arc/ellipse edges)
 *   - ATTRIB / ATTDEF (block attribute values, with INSERT overrides)
 *   - SOLID / TRACE / 3DFACE
 *
 * Paper-space entities (group 67 = 1) are skipped when the drawing also has
 * model-space content, and OCS/extrusion vectors (210/220/230) are applied.
 */

import type { SurveyLine, SurveyPoint } from '../types.ts';
import { convertSegmentsToWeightedTSpline, type SplineFitOptions } from './splineFitting.ts';

// ─── ACI Color Map ────────────────────────────────────────────────────────────

export const ACI_COLORS: Record<number, string> = {
  1: '#FF0000', // Red
  2: '#FFFF00', // Yellow
  3: '#00FF00', // Green
  4: '#00FFFF', // Cyan
  5: '#0000FF', // Blue
  6: '#FF00FF', // Magenta
  7: '#FFFFFF', // White / Black (canvas handles contrast)
  8: '#808080', // Dark Gray
  9: '#C0C0C0', // Light Gray
  10: '#FF0000',
  11: '#FFAAAA',
  20: '#A55200',
  30: '#FF7B00', // Orange
  40: '#BDB76B',
  50: '#FFFF7B',
  60: '#7BFF00',
  70: '#00FF7B',
  80: '#00FFFF',
  90: '#007BFF',
  130: '#0055FF',
  140: '#5500FF',
  150: '#AA00FF',
  160: '#FF00AA',
  250: '#505050',
  251: '#707070',
  252: '#909090',
  253: '#B0B0B0',
  254: '#D0D0D0',
  255: '#FFFFFF',
};

export function aciToHex(colorIndex?: number, fallback: string = '#818cf8'): string {
  if (colorIndex === undefined || colorIndex === null) return fallback;
  const absIndex = Math.abs(colorIndex);
  if (absIndex === 0 || absIndex === 256) return fallback; // BYBLOCK or BYLAYER
  if (absIndex === 7) return '#E2E8F0'; // Return clean visible slate/white for CAD index 7
  return ACI_COLORS[absIndex] || fallback;
}

// ─── Tokenizer ────────────────────────────────────────────────────────────────

interface DxfToken {
  code: number;
  value: string;
}

/** A raw LINE/SOLID edge collected before it is chained into a polyline. */
interface RawLineSegment {
  x1: number;
  y1: number;
  z1: number;
  x2: number;
  y2: number;
  z2: number;
  layer: string;
  color: string;
  lineType: string;
}

interface DxfEntityRecord {
  type: string;
  codes: Record<number, string[]>;
  tokens: DxfToken[];
  /** Classic POLYLINE vertices, pulled from the following VERTEX entities. */
  vertices?: Array<{ x: number; y: number; z: number; bulge: number }>;
  /** ATTRIB entities attached to an INSERT in attribute-follows mode. */
  attributes?: DxfEntityRecord[];
}

interface DxfBlockDefinition {
  name: string;
  baseX: number;
  baseY: number;
  baseZ: number;
  records: DxfEntityRecord[];
}

/** 2D affine transform: x' = a*x + b*y + e, y' = c*x + d*y + f. */
interface Matrix2D {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

const IDENTITY_MATRIX: Matrix2D = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function* tokenize(dxf: string): Generator<DxfToken> {
  const lines = dxf.split(/\r?\n/);
  let i = 0;
  while (i < lines.length - 1) {
    const code = parseInt(lines[i].trim(), 10);
    const value = lines[i + 1].trim();
    if (!isNaN(code)) {
      yield { code, value };
    }
    i += 2;
  }
}

function splitSections(tokens: DxfToken[]): Map<string, DxfToken[]> {
  const sections = new Map<string, DxfToken[]>();
  let current: string | null = null;
  let buffer: DxfToken[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const marker = token.code === 0 ? token.value.trim().toUpperCase() : null;

    if (marker === 'SECTION') {
      const nameToken = tokens[i + 1];
      current = nameToken && nameToken.code === 2 ? nameToken.value.trim().toUpperCase() : 'UNKNOWN';
      buffer = [];
      continue;
    }

    if (marker === 'ENDSEC') {
      if (current && !sections.has(current)) sections.set(current, buffer);
      current = null;
      buffer = [];
      continue;
    }

    if (current) buffer.push(token);
  }

  return sections;
}

const STRUCTURAL_TYPES = new Set([
  'SECTION',
  'ENDSEC',
  'EOF',
  'TABLE',
  'ENDTAB',
  'BLOCK',
  'ENDBLK',
  'SEQEND',
  'VERTEX',
]);

/**
 * Groups raw tokens into entity records. Classic POLYLINE/VERTEX/SEQEND runs are
 * flattened into a single POLYLINE record with an ordered vertex list.
 */
function collectEntityRecords(tokens: DxfToken[]): DxfEntityRecord[] {
  const records: DxfEntityRecord[] = [];
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];
    if (token.code !== 0) {
      i++;
      continue;
    }

    const type = token.value.trim().toUpperCase();
    i++;
    if (!type || STRUCTURAL_TYPES.has(type)) continue;

    const record: DxfEntityRecord = { type, codes: {}, tokens: [] };
    while (i < tokens.length && tokens[i].code !== 0) {
      const t = tokens[i];
      if (!record.codes[t.code]) record.codes[t.code] = [];
      record.codes[t.code].push(t.value);
      record.tokens.push(t);
      i++;
    }

    if (type === 'POLYLINE') {
      const vertices: Array<{ x: number; y: number; z: number; bulge: number }> = [];

      while (i < tokens.length && tokens[i].code === 0) {
        const nextType = tokens[i].value.trim().toUpperCase();
        if (nextType === 'VERTEX') {
          i++;
          const v: { x?: number; y?: number; z?: number; bulge?: number } = {};
          while (i < tokens.length && tokens[i].code !== 0) {
            const t = tokens[i];
            if (t.code === 10) v.x = parseFloat(t.value);
            else if (t.code === 20) v.y = parseFloat(t.value);
            else if (t.code === 30) v.z = parseFloat(t.value);
            else if (t.code === 42) v.bulge = parseFloat(t.value);
            i++;
          }
          if (Number.isFinite(v.x) && Number.isFinite(v.y)) {
            vertices.push({
              x: v.x as number,
              y: v.y as number,
              z: Number.isFinite(v.z) ? (v.z as number) : 0,
              bulge: Number.isFinite(v.bulge) ? (v.bulge as number) : 0,
            });
          }
        } else if (nextType === 'SEQEND') {
          i++;
          while (i < tokens.length && tokens[i].code !== 0) i++;
          break;
        } else {
          break;
        }
      }

      record.vertices = vertices;
    }

    if (type === 'INSERT') {
      const attributes: DxfEntityRecord[] = [];
      while (i < tokens.length && tokens[i].code === 0) {
        const nextType = tokens[i].value.trim().toUpperCase();
        if (nextType === 'ATTRIB') {
          i++;
          const attrib: DxfEntityRecord = { type: 'ATTRIB', codes: {}, tokens: [] };
          while (i < tokens.length && tokens[i].code !== 0) {
            const t = tokens[i];
            if (!attrib.codes[t.code]) attrib.codes[t.code] = [];
            attrib.codes[t.code].push(t.value);
            attrib.tokens.push(t);
            i++;
          }
          attributes.push(attrib);
        } else if (nextType === 'SEQEND') {
          i++;
          while (i < tokens.length && tokens[i].code !== 0) i++;
          break;
        } else {
          break;
        }
      }
      if (attributes.length > 0) record.attributes = attributes;
    }

    records.push(record);
  }

  return records;
}

function parseBlocks(tokens: DxfToken[] | undefined): Map<string, DxfBlockDefinition> {
  const blocks = new Map<string, DxfBlockDefinition>();
  if (!tokens || tokens.length === 0) return blocks;

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!(token.code === 0 && token.value.trim().toUpperCase() === 'BLOCK')) {
      i++;
      continue;
    }
    i++;

    const headerCodes: Record<number, string[]> = {};
    while (i < tokens.length && tokens[i].code !== 0) {
      const t = tokens[i];
      if (!headerCodes[t.code]) headerCodes[t.code] = [];
      headerCodes[t.code].push(t.value);
      i++;
    }

    const name = (headerCodes[2]?.[0] || '').trim();
    const baseX = parseFloat(headerCodes[10]?.[0] || '0') || 0;
    const baseY = parseFloat(headerCodes[20]?.[0] || '0') || 0;
    const baseZ = parseFloat(headerCodes[30]?.[0] || '0') || 0;

    let end = i;
    while (
      end < tokens.length &&
      !(tokens[end].code === 0 && tokens[end].value.trim().toUpperCase() === 'ENDBLK')
    ) {
      end++;
    }

    if (name) {
      blocks.set(name.toUpperCase(), {
        name,
        baseX,
        baseY,
        baseZ,
        records: collectEntityRecords(tokens.slice(i, end)),
      });
    }

    i = end + 1;
    while (i < tokens.length && tokens[i].code !== 0) i++;
  }

  return blocks;
}

export interface DxfParsedGeometry {
  points: SurveyPoint[];
  lines: SurveyLine[];
  layers: string[];
  layerColors: Record<string, string>;
  totalEntities: number;
  stats: {
    lines: number;
    polylines: number;
    circles: number;
    arcs: number;
    points: number;
    ellipses: number;
    splines: number;
    texts: number;
    inserts: number;
    hatches: number;
  };
}

export interface DxfParseOptions {
  startingPointNumber?: number;
  /**
   * If true, converts long strings of linear segments and polylines into smooth weighted T-splines.
   */
  smoothSplines?: boolean;
  /** Restrict smoothing/quantization to these layers (case-insensitive). Empty or omitted = all layers. */
  splineLayers?: string[];
  /**
   * Spline tension/tightness options.
   */
  splineOptions?: SplineFitOptions;
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function num(codes: Record<number, string[]>, code: number, fallback = NaN): number {
  const raw = codes[code]?.[0];
  if (raw === undefined) return fallback;
  const value = parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

function applyMatrix(m: Matrix2D, x: number, y: number): { x: number; y: number } {
  return { x: m.a * x + m.b * y + m.e, y: m.c * x + m.d * y + m.f };
}

function multiplyMatrix(m1: Matrix2D, m2: Matrix2D): Matrix2D {
  return {
    a: m1.a * m2.a + m1.b * m2.c,
    b: m1.a * m2.b + m1.b * m2.d,
    c: m1.c * m2.a + m1.d * m2.c,
    d: m1.c * m2.b + m1.d * m2.d,
    e: m1.a * m2.e + m1.b * m2.f + m1.e,
    f: m1.c * m2.e + m1.d * m2.f + m1.f,
  };
}

function matrixDeterminant(m: Matrix2D): number {
  return m.a * m.d - m.b * m.c;
}

function matrixScale(m: Matrix2D): number {
  return Math.sqrt(Math.abs(matrixDeterminant(m))) || 1;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function crossVec3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalizeVec3(v: Vec3): Vec3 | null {
  const length = Math.hypot(v.x, v.y, v.z);
  if (!(length > 1e-12)) return null;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

/**
 * Maps an entity's object coordinate system (OCS) to world coordinates using
 * the DXF arbitrary axis algorithm. Returns null for the default extrusion.
 */
function extrusionMatrix(codes: Record<number, string[]>): Matrix2D | null {
  const n = normalizeVec3({
    x: num(codes, 210, 0),
    y: num(codes, 220, 0),
    z: num(codes, 230, 1),
  });
  if (!n) return null;
  if (Math.abs(n.x) < 1e-9 && Math.abs(n.y) < 1e-9 && n.z > 0) return null;

  const reference =
    Math.abs(n.x) < 1 / 64 && Math.abs(n.y) < 1 / 64
      ? { x: 0, y: 1, z: 0 }
      : { x: 0, y: 0, z: 1 };
  const ax = normalizeVec3(crossVec3(reference, n));
  const ay = ax ? normalizeVec3(crossVec3(n, ax)) : null;
  if (!ax || !ay) return null;

  return { a: ax.x, b: ay.x, c: ax.y, d: ay.y, e: 0, f: 0 };
}

/** True for rotation + uniform scale (optionally mirrored), with no shear or stretch. */
function isSimilarityMatrix(m: Matrix2D): boolean {
  const det = matrixDeterminant(m);
  if (Math.abs(det) < 1e-12) return false;
  const sx = Math.hypot(m.a, m.c);
  const sy = Math.hypot(m.b, m.d);
  const dot = m.a * m.b + m.c * m.d;
  const tolerance = 1e-9 * Math.max(1, sx * sy);
  return Math.abs(sx - sy) <= tolerance && Math.abs(dot) <= tolerance;
}

function normalizeSweep(angle: number): number {
  const twoPi = Math.PI * 2;
  let sweep = angle % twoPi;
  if (sweep <= 1e-9) sweep += twoPi;
  return sweep;
}

/** Samples a bulge segment in world coordinates, ending exactly on (x2, y2). */
function sampleBulgePoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bulge: number
): Array<{ x: number; y: number }> {
  const chord = Math.hypot(x2 - x1, y2 - y1);
  if (!bulge || Math.abs(bulge) < 1e-9 || chord < 1e-9) {
    return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
  }

  const theta = 4 * Math.atan(bulge);
  const radius = Math.abs(chord / (2 * Math.sin(theta / 2)));
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const normX = -(y2 - y1) / chord;
  const normY = (x2 - x1) / chord;
  const distToCenter = radius * Math.cos(theta / 2);
  const sign = bulge > 0 ? 1 : -1;
  const cx = midX + normX * distToCenter * sign;
  const cy = midY + normY * distToCenter * sign;
  const startAngle = Math.atan2(y1 - cy, x1 - cx);
  const steps = Math.max(2, Math.ceil(Math.abs(theta) / (Math.PI / 24)));

  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + theta * (i / steps);
    points.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
  }
  points[points.length - 1] = { x: x2, y: y2 };
  return points;
}

function sampleCatmullRom(
  points: Array<{ x: number; y: number; z: number }>,
  closed: boolean,
  samplesPerSpan = 12
): Array<{ x: number; y: number; z: number }> {
  const n = points.length;
  if (n < 2) return points.slice();

  const at = (index: number) => {
    if (closed) return points[((index % n) + n) % n];
    return points[Math.max(0, Math.min(n - 1, index))];
  };

  const spans = closed ? n : n - 1;
  const out: Array<{ x: number; y: number; z: number }> = [];

  for (let i = 0; i < spans; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);

    for (let s = 0; s < samplesPerSpan; s++) {
      const t = s / samplesPerSpan;
      const t2 = t * t;
      const t3 = t2 * t;
      const basis = (v0: number, v1: number, v2: number, v3: number) =>
        0.5 *
        (2 * v1 +
          (-v0 + v2) * t +
          (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 +
          (-v0 + 3 * v1 - 3 * v2 + v3) * t3);
      out.push({
        x: basis(p0.x, p1.x, p2.x, p3.x),
        y: basis(p0.y, p1.y, p2.y, p3.y),
        z: basis(p0.z, p1.z, p2.z, p3.z),
      });
    }
  }

  if (closed) {
    out.push({ ...out[0] });
  } else {
    out.push({ ...points[n - 1] });
  }

  return out;
}

function sampleBspline(
  controlPoints: Array<{ x: number; y: number; z: number }>,
  weights: number[],
  knots: number[],
  degree: number
): Array<{ x: number; y: number; z: number }> {
  const n = controlPoints.length;
  const p = Math.max(1, Math.min(degree, n - 1));

  if (n < 2) return controlPoints.slice();
  if (knots.length !== n + p + 1) return sampleCatmullRom(controlPoints, false);

  const weightAt = (index: number) => {
    const w = weights[index];
    return Number.isFinite(w) && w > 0 ? w : 1;
  };

  const evaluate = (t: number): { x: number; y: number; z: number } => {
    let k = p;
    while (k < n - 1 && t >= knots[k + 1]) k++;

    const d: Array<[number, number, number, number]> = [];
    for (let j = 0; j <= p; j++) {
      const index = k - p + j;
      const w = weightAt(index);
      d.push([
        controlPoints[index].x * w,
        controlPoints[index].y * w,
        controlPoints[index].z * w,
        w,
      ]);
    }

    for (let r = 1; r <= p; r++) {
      for (let j = p; j >= r; j--) {
        const index = k - p + j;
        const denominator = knots[index + p - r + 1] - knots[index];
        const alpha = Math.abs(denominator) < 1e-12 ? 0 : (t - knots[index]) / denominator;
        const prev = d[j - 1];
        const cur = d[j];
        d[j] = [
          prev[0] * (1 - alpha) + cur[0] * alpha,
          prev[1] * (1 - alpha) + cur[1] * alpha,
          prev[2] * (1 - alpha) + cur[2] * alpha,
          prev[3] * (1 - alpha) + cur[3] * alpha,
        ];
      }
    }

    const [x, y, z, w] = d[p];
    const divisor = Math.abs(w) < 1e-12 ? 1 : w;
    return { x: x / divisor, y: y / divisor, z: z / divisor };
  };

  const t0 = knots[p];
  const t1 = knots[n];
  if (!(t1 > t0)) return sampleCatmullRom(controlPoints, false);

  const steps = Math.min(400, Math.max(24, (n - p) * 16));
  const out: Array<{ x: number; y: number; z: number }> = [];
  for (let i = 0; i <= steps; i++) {
    out.push(evaluate(t0 + (t1 - t0) * (i / steps)));
  }
  return out;
}

/** Strips AutoCAD text formatting codes, leaving readable label text. */
function cleanDxfText(raw: string): string {
  if (!raw) return '';
  let text = raw;

  text = text.replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16))
  );
  text = text.replace(/\\P/gi, ' ');
  text = text.replace(/\\~/gi, ' ');
  // Font, height, color, width and stacking codes all terminate with ';'.
  text = text.replace(/\\[A-Za-z][^;\\{}]*;/g, '');
  // Remaining one-letter toggles (\L underline, \O overline, \K strike-through).
  text = text.replace(/\\[A-Za-z]/g, '');
  text = text.replace(/[{}]/g, '');
  text = text
    .replace(/%%d/gi, '°')
    .replace(/%%p/gi, '±')
    .replace(/%%c/gi, '⌀');

  return text.replace(/\s+/g, ' ').trim();
}

interface HatchLoop {
  points: Array<{ x: number; y: number }>;
}

/** Appends one HATCH boundary edge (line, arc, ellipse, or spline fit points). */
function appendHatchEdge(
  points: Array<{ x: number; y: number }>,
  edgeType: number,
  edgeCodes: Record<number, string[]>
) {
  const addPoint = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const last = points[points.length - 1];
    if (last && Math.hypot(last.x - x, last.y - y) < 1e-9) return;
    points.push({ x, y });
  };

  if (edgeType === 1) {
    const x1 = num(edgeCodes, 10);
    const y1 = num(edgeCodes, 20);
    const x2 = num(edgeCodes, 11);
    const y2 = num(edgeCodes, 21);
    if (![x1, y1, x2, y2].every(Number.isFinite)) return;
    if (points.length === 0) addPoint(x1, y1);
    addPoint(x2, y2);
    return;
  }

  const ccw = (parseInt(edgeCodes[73]?.[0] || '1', 10) || 0) !== 0;

  if (edgeType === 2) {
    const cx = num(edgeCodes, 10);
    const cy = num(edgeCodes, 20);
    const radius = num(edgeCodes, 40);
    const startDeg = num(edgeCodes, 50);
    const endDeg = num(edgeCodes, 51);
    if (![cx, cy, radius, startDeg, endDeg].every(Number.isFinite) || radius <= 0) return;

    const startRad = (startDeg * Math.PI) / 180;
    let sweep = ((endDeg - startDeg) * Math.PI) / 180;
    if (ccw) {
      while (sweep <= 1e-9) sweep += Math.PI * 2;
    } else {
      while (sweep >= -1e-9) sweep -= Math.PI * 2;
    }
    const steps = Math.max(8, Math.ceil(Math.abs(sweep) / (Math.PI / 24)));
    if (points.length === 0) {
      addPoint(cx + radius * Math.cos(startRad), cy + radius * Math.sin(startRad));
    }
    for (let i = 1; i <= steps; i++) {
      const angle = startRad + sweep * (i / steps);
      addPoint(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
    }
    return;
  }

  if (edgeType === 3) {
    const cx = num(edgeCodes, 10);
    const cy = num(edgeCodes, 20);
    const majorX = num(edgeCodes, 11, cx) - cx;
    const majorY = num(edgeCodes, 21, cy) - cy;
    const ratio = num(edgeCodes, 40, 1);
    const startParam = num(edgeCodes, 50, 0);
    const endParam = num(edgeCodes, 51, Math.PI * 2);
    if (![cx, cy, majorX, majorY, ratio, startParam, endParam].every(Number.isFinite)) return;
    if (Math.hypot(majorX, majorY) < 1e-9) return;

    const minorX = -majorY * ratio;
    const minorY = majorX * ratio;
    let sweep = endParam - startParam;
    if (ccw) {
      while (sweep <= 1e-9) sweep += Math.PI * 2;
    } else {
      while (sweep >= -1e-9) sweep -= Math.PI * 2;
    }
    const steps = Math.max(8, Math.ceil(Math.abs(sweep) / (Math.PI / 24)));
    const at = (t: number) => ({
      x: cx + majorX * Math.cos(t) + minorX * Math.sin(t),
      y: cy + majorY * Math.cos(t) + minorY * Math.sin(t),
    });
    if (points.length === 0) {
      const first = at(startParam);
      addPoint(first.x, first.y);
    }
    for (let i = 1; i <= steps; i++) {
      const point = at(startParam + sweep * (i / steps));
      addPoint(point.x, point.y);
    }
    return;
  }

  if (edgeType === 4) {
    // Spline boundary: fit points lie on the curve, so connect them directly.
    // Control points are only a fallback for exports that omit fit data.
    const useFit = (edgeCodes[11]?.length ?? 0) >= 2;
    const xs = useFit ? edgeCodes[11] ?? [] : edgeCodes[10] ?? [];
    const ys = useFit ? edgeCodes[21] ?? [] : edgeCodes[20] ?? [];
    for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
      addPoint(parseFloat(xs[i]), parseFloat(ys[i]));
    }
  }
}

/** Reads every boundary loop of a HATCH record from its ordered tokens. */
function readHatchLoops(record: DxfEntityRecord): HatchLoop[] {
  const tokens = record.tokens;
  const loops: HatchLoop[] = [];
  let i = tokens.findIndex(token => token.code === 92);
  if (i < 0) return loops;

  while (i < tokens.length && tokens[i].code === 92) {
    const pathFlag = parseInt(tokens[i].value, 10) || 0;
    i++;
    const points: Array<{ x: number; y: number }> = [];

    if ((pathFlag & 2) !== 0) {
      // Polyline boundary path: 72 has-bulge, 73 closed, 93 vertex count.
      let closed = true;
      while (i < tokens.length && tokens[i].code !== 93 && tokens[i].code !== 92) {
        if (tokens[i].code === 73) closed = (parseInt(tokens[i].value, 10) || 0) !== 0;
        i++;
      }

      let vertexCount = 0;
      if (i < tokens.length && tokens[i].code === 93) {
        vertexCount = parseInt(tokens[i].value, 10) || 0;
        i++;
      }

      let vertexIndex = 0;
      let pending: { x?: number; y?: number; bulge?: number } | null = null;
      const flushVertex = () => {
        if (!pending) return;
        const { x, y, bulge } = pending;
        pending = null;
        if (!Number.isFinite(x) || !Number.isFinite(y) || vertexIndex >= vertexCount) return;
        vertexIndex++;
        if (bulge && points.length > 0) {
          const previous = points[points.length - 1];
          const samples = sampleBulgePoints(previous.x, previous.y, x as number, y as number, bulge);
          for (let s = 1; s < samples.length; s++) points.push(samples[s]);
        } else {
          points.push({ x: x as number, y: y as number });
        }
      };

      while (i < tokens.length && tokens[i].code !== 92) {
        const token = tokens[i];
        if (token.code === 10) {
          flushVertex();
          if (vertexIndex >= vertexCount) break;
          pending = { x: parseFloat(token.value) };
        } else if (token.code === 20 && pending) {
          pending.y = parseFloat(token.value);
        } else if (token.code === 42 && pending) {
          pending.bulge = parseFloat(token.value);
        }
        i++;
      }
      flushVertex();

      if (closed && points.length >= 2) {
        const first = points[0];
        const last = points[points.length - 1];
        if (Math.hypot(first.x - last.x, first.y - last.y) > 1e-9) points.push({ ...first });
      }
    } else {
      // Edge boundary path: 93 edge count, each edge beginning with 72.
      while (i < tokens.length && tokens[i].code !== 93 && tokens[i].code !== 92) i++;
      let edgeCount = 0;
      if (i < tokens.length && tokens[i].code === 93) {
        edgeCount = parseInt(tokens[i].value, 10) || 0;
        i++;
      }

      for (let edge = 0; edge < edgeCount && i < tokens.length; edge++) {
        if (tokens[i].code !== 72) break;
        const edgeType = parseInt(tokens[i].value, 10) || 0;
        i++;
        const edgeCodes: Record<number, string[]> = {};
        while (
          i < tokens.length &&
          tokens[i].code !== 72 &&
          tokens[i].code !== 92 &&
          tokens[i].code !== 98
        ) {
          const token = tokens[i];
          if (!edgeCodes[token.code]) edgeCodes[token.code] = [];
          edgeCodes[token.code].push(token.value);
          i++;
        }
        appendHatchEdge(points, edgeType, edgeCodes);
      }

      if (points.length >= 2) {
        const first = points[0];
        const last = points[points.length - 1];
        if (Math.hypot(first.x - last.x, first.y - last.y) > 1e-9) points.push({ ...first });
      }
    }

    while (i < tokens.length && tokens[i].code !== 92) i++;
    if (points.length >= 3) loops.push({ points });
  }

  return loops;
}

export function parseDxfGeometry(
  dxfContent: string,
  startingPointNumberOrOptions: number | DxfParseOptions = 1
): DxfParsedGeometry {
  const options: DxfParseOptions =
    typeof startingPointNumberOrOptions === 'number'
      ? { startingPointNumber: startingPointNumberOrOptions }
      : startingPointNumberOrOptions;

  const startingPointNumber = options.startingPointNumber ?? 1;
  const smoothSplines = Boolean(options.smoothSplines);
  const splineLayerSet = new Set(
    (options.splineLayers ?? []).map(l => l.trim().toUpperCase()).filter(Boolean)
  );
  const splineOptions = options.splineOptions ?? { tension: 0.5 };

  const layerDefs = new Map<string, { colorIndex?: number; lineType?: string }>();
  let nextPtNum = startingPointNumber;

  // ── Step 1: Scan Tables for Layer Definitions & Colors ──────────────────────
  const layerTableMatch = dxfContent.match(/\bLAYER\b[\s\S]*?(?=\bENDTAB\b)/i);
  if (layerTableMatch) {
    const layerEntries = layerTableMatch[0].split(/(?=(?:^|\r?\n)\s*0\r?\n\s*LAYER)/m);
    for (const entry of layerEntries) {
      const nameMatch = entry.match(/(?:^|\r?\n)\s*2\r?\n\s*(.+)$/m);
      const colorMatch = entry.match(/(?:^|\r?\n)\s*62\r?\n\s*(.+)$/m);
      const ltMatch = entry.match(/(?:^|\r?\n)\s*6\r?\n\s*(.+)$/m);
      if (!nameMatch) continue;
      const name = nameMatch[1].trim();
      if (name === 'LAYER') continue;
      layerDefs.set(name.toUpperCase(), {
        colorIndex: colorMatch ? Math.abs(parseInt(colorMatch[1].trim(), 10)) : undefined,
        lineType: ltMatch ? ltMatch[1].trim() : undefined,
      });
    }
  }

  // ── Step 2: Split sections, collect blocks and entity records ───────────────
  const allTokens = Array.from(tokenize(dxfContent));
  const sections = splitSections(allTokens);
  const blocks = parseBlocks(sections.get('BLOCKS'));
  const entityTokens = sections.get('ENTITIES') ?? allTokens;
  const entityRecords = collectEntityRecords(entityTokens);

  const points: SurveyPoint[] = [];
  const lines: SurveyLine[] = [];
  const rawLineSegments: RawLineSegment[] = [];
  const layerColors: Record<string, string> = {};
  const layersSet = new Set<string>();

  const stats = {
    lines: 0,
    polylines: 0,
    circles: 0,
    arcs: 0,
    points: 0,
    ellipses: 0,
    splines: 0,
    texts: 0,
    inserts: 0,
    hatches: 0,
  };

  let polylineCounter = 0;
  let curveCounter = 0;
  let textCounter = 0;
  let hatchCounter = 0;

  const resolveEntityColor = (layerName: string, entityColorIdx?: number): string => {
    if (entityColorIdx !== undefined && entityColorIdx > 0 && entityColorIdx < 256) {
      return aciToHex(entityColorIdx);
    }
    const def = layerDefs.get(layerName.toUpperCase());
    return aciToHex(def?.colorIndex);
  };

  const emitStraightSegment = (
    polyId: string,
    index: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    layer: string,
    color: string,
    lineType: string,
    z = 0
  ) => {
    const segId = `${polyId}-seg-${index}`;
    lines.push({
      id: segId,
      polylineId: polyId,
      from: `${segId}-A`,
      to: `${segId}-B`,
      fromPt: { x: x1, y: y1, z },
      toPt: { x: x2, y: y2, z },
      layer,
      color,
      lineType,
    });
  };

  const emitPolyline = (
    vertices: Array<{ x: number; y: number; bulge: number }>,
    isClosed: boolean,
    polyId: string,
    layer: string,
    color: string,
    lineType: string,
    transform: Matrix2D
  ) => {
    const count = vertices.length;
    if (count < 2) return;

    const pairs: Array<{ x1: number; y1: number; x2: number; y2: number; bulge: number; index: number }> = [];
    for (let i = 0; i < count - 1; i++) {
      pairs.push({
        x1: vertices[i].x,
        y1: vertices[i].y,
        x2: vertices[i + 1].x,
        y2: vertices[i + 1].y,
        bulge: vertices[i].bulge,
        index: i,
      });
    }
    if (isClosed) {
      const last = vertices[count - 1];
      const first = vertices[0];
      pairs.push({
        x1: last.x,
        y1: last.y,
        x2: first.x,
        y2: first.y,
        bulge: last.bulge,
        index: count - 1,
      });
    }

    if (isSimilarityMatrix(transform)) {
      // Rotation + uniform scale preserves circular arcs, so keep native curves.
      const mirrored = matrixDeterminant(transform) < 0;
      for (const pair of pairs) {
        const start = applyMatrix(transform, pair.x1, pair.y1);
        const end = applyMatrix(transform, pair.x2, pair.y2);
        lines.push(
          buildPolylineSegment(
            polyId,
            pair.index,
            start.x,
            start.y,
            end.x,
            end.y,
            mirrored ? -pair.bulge : pair.bulge,
            layer,
            color,
            lineType
          )
        );
      }
      return;
    }

    // Non-uniform scaling turns arcs into ellipses; tessellate instead of lying about the radius.
    let segmentIndex = 0;
    for (const pair of pairs) {
      const samples = sampleBulgePoints(pair.x1, pair.y1, pair.x2, pair.y2, pair.bulge);
      for (let i = 0; i < samples.length - 1; i++) {
        const start = applyMatrix(transform, samples[i].x, samples[i].y);
        const end = applyMatrix(transform, samples[i + 1].x, samples[i + 1].y);
        emitStraightSegment(
          polyId,
          segmentIndex++,
          start.x,
          start.y,
          end.x,
          end.y,
          layer,
          color,
          lineType
        );
      }
    }
  };

  const emitArc = (
    cx: number,
    cy: number,
    cz: number,
    radius: number,
    startDeg: number,
    endDeg: number,
    layer: string,
    color: string,
    lineType: string,
    transform: Matrix2D
  ) => {
    const startRad = (startDeg * Math.PI) / 180;
    const endRad = (endDeg * Math.PI) / 180;
    let sweep = endRad - startRad;
    if (sweep <= 0) sweep += Math.PI * 2;

    const id = `dxf-arc-${++curveCounter}`;

    if (isSimilarityMatrix(transform)) {
      const center = applyMatrix(transform, cx, cy);
      const start = applyMatrix(transform, cx + radius * Math.cos(startRad), cy + radius * Math.sin(startRad));
      const end = applyMatrix(transform, cx + radius * Math.cos(endRad), cy + radius * Math.sin(endRad));
      const newRadius = Math.hypot(start.x - center.x, start.y - center.y);
      const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
      const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
      const mirrored = matrixDeterminant(transform) < 0;
      const newSweep = normalizeSweep(mirrored ? startAngle - endAngle : endAngle - startAngle);

      lines.push({
        id,
        polylineId: id,
        from: `${id}-A`,
        to: `${id}-B`,
        fromPt: { x: start.x, y: start.y, z: cz },
        toPt: { x: end.x, y: end.y, z: cz },
        isCurve: true,
        circleCenter: { x: center.x, y: center.y, z: cz },
        curveRadius: newRadius,
        arcLength: newRadius * newSweep,
        curveDirection: mirrored ? 'right' : 'left',
        layer,
        color,
        lineType,
      });
      stats.arcs++;
      return;
    }

    const steps = Math.max(8, Math.ceil(sweep / (Math.PI / 32)));
    let segmentIndex = 0;
    let previous = applyMatrix(
      transform,
      cx + radius * Math.cos(startRad),
      cy + radius * Math.sin(startRad)
    );
    for (let i = 1; i <= steps; i++) {
      const angle = startRad + sweep * (i / steps);
      const current = applyMatrix(
        transform,
        cx + radius * Math.cos(angle),
        cy + radius * Math.sin(angle)
      );
      emitStraightSegment(
        id,
        segmentIndex++,
        previous.x,
        previous.y,
        current.x,
        current.y,
        layer,
        color,
        lineType,
        cz
      );
      previous = current;
    }
    stats.arcs++;
  };

  const emitCircle = (
    cx: number,
    cy: number,
    cz: number,
    radius: number,
    layer: string,
    color: string,
    lineType: string,
    transform: Matrix2D
  ) => {
    const id = `dxf-circle-${++curveCounter}`;

    if (isSimilarityMatrix(transform)) {
      const center = applyMatrix(transform, cx, cy);
      lines.push({
        id,
        polylineId: id,
        from: `${id}-C`,
        to: `${id}-C`,
        fromPt: { x: center.x, y: center.y, z: cz },
        toPt: { x: center.x, y: center.y, z: cz },
        isCircle: true,
        circleCenter: { x: center.x, y: center.y, z: cz },
        curveRadius: radius * matrixScale(transform),
        layer,
        color,
        lineType,
      });
      stats.circles++;
      return;
    }

    const steps = 180;
    let segmentIndex = 0;
    let previous = applyMatrix(transform, cx + radius, cy);
    for (let i = 1; i <= steps; i++) {
      const angle = (Math.PI * 2 * i) / steps;
      const current = applyMatrix(transform, cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
      emitStraightSegment(
        id,
        segmentIndex++,
        previous.x,
        previous.y,
        current.x,
        current.y,
        layer,
        color,
        lineType,
        cz
      );
      previous = current;
    }
    stats.circles++;
  };

  const emitEllipse = (
    codes: Record<number, string[]>,
    layer: string,
    color: string,
    lineType: string,
    transform: Matrix2D
  ) => {
    const cx = num(codes, 10);
    const cy = num(codes, 20);
    const cz = num(codes, 30, 0);
    const majorX = num(codes, 11, cx) - cx;
    const majorY = num(codes, 21, cy) - cy;
    const ratio = num(codes, 40, 1);
    const startParam = num(codes, 41, 0);
    const endParam = num(codes, 42, Math.PI * 2);

    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
    if (!Number.isFinite(majorX) || !Number.isFinite(majorY)) return;
    if (Math.hypot(majorX, majorY) < 1e-9 || !Number.isFinite(ratio)) return;

    let sweep = endParam - startParam;
    if (sweep <= 1e-9) sweep += Math.PI * 2;

    const minorX = -majorY * ratio;
    const minorY = majorX * ratio;
    const isFullCircle =
      Math.abs(ratio - 1) < 1e-9 && Math.abs(sweep - Math.PI * 2) < 1e-6;

    if (isFullCircle && isSimilarityMatrix(transform)) {
      emitCircle(cx, cy, cz, Math.hypot(majorX, majorY), layer, color, lineType, transform);
      stats.ellipses++;
      return;
    }

    const id = `dxf-ellipse-${++curveCounter}`;
    const steps = Math.min(720, Math.max(24, Math.ceil((Math.abs(sweep) / (Math.PI * 2)) * 180)));
    let segmentIndex = 0;
    let previous: { x: number; y: number } | null = null;

    for (let i = 0; i <= steps; i++) {
      const t = startParam + sweep * (i / steps);
      const localX = cx + majorX * Math.cos(t) + minorX * Math.sin(t);
      const localY = cy + majorY * Math.cos(t) + minorY * Math.sin(t);
      const point = applyMatrix(transform, localX, localY);
      if (previous) {
        emitStraightSegment(
          id,
          segmentIndex++,
          previous.x,
          previous.y,
          point.x,
          point.y,
          layer,
          color,
          lineType,
          cz
        );
      }
      previous = point;
    }
    stats.ellipses++;
  };

  const emitSpline = (
    codes: Record<number, string[]>,
    layer: string,
    color: string,
    lineType: string,
    transform: Matrix2D
  ) => {
    const degree = parseInt(codes[71]?.[0] || '3', 10);
    const flags = parseInt(codes[70]?.[0] || '0', 10);
    const isClosed = (flags & 1) === 1;
    const declaredControlCount = parseInt(codes[73]?.[0] || '0', 10);

    const xs = codes[10] ?? [];
    const ys = codes[20] ?? [];
    const zs = codes[30] ?? [];
    let controlPoints: Array<{ x: number; y: number; z: number }> = [];
    for (let i = 0; i < xs.length; i++) {
      const x = parseFloat(xs[i]);
      const y = parseFloat(ys[i]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const z = parseFloat(zs[i] || '0');
      controlPoints.push({ x, y, z: Number.isFinite(z) ? z : 0 });
    }
    if (declaredControlCount > 0) controlPoints = controlPoints.slice(0, declaredControlCount);

    const fitXs = codes[11] ?? [];
    const fitYs = codes[21] ?? [];
    const fitZs = codes[31] ?? [];
    const fitPoints: Array<{ x: number; y: number; z: number }> = [];
    for (let i = 0; i < fitXs.length; i++) {
      const x = parseFloat(fitXs[i]);
      const y = parseFloat(fitYs[i]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const z = parseFloat(fitZs[i] || '0');
      fitPoints.push({ x, y, z: Number.isFinite(z) ? z : 0 });
    }

    const knots = (codes[40] ?? [])
      .map(value => parseFloat(value))
      .filter(value => Number.isFinite(value));
    const weights = (codes[41] ?? []).map(value => parseFloat(value));

    let sampled: Array<{ x: number; y: number; z: number }> = [];
    if (controlPoints.length >= 2) {
      sampled = sampleBspline(controlPoints, weights, knots, Number.isFinite(degree) ? degree : 3);
    } else if (fitPoints.length >= 2) {
      sampled = sampleCatmullRom(fitPoints, isClosed);
    }

    if (sampled.length < 2) return;

    if (isClosed) {
      const first = sampled[0];
      const last = sampled[sampled.length - 1];
      if (Math.hypot(first.x - last.x, first.y - last.y) > 1e-6) sampled.push({ ...first });
    }

    const id = `dxf-spline-${++curveCounter}`;
    let segmentIndex = 0;
    for (let i = 0; i < sampled.length - 1; i++) {
      const start = applyMatrix(transform, sampled[i].x, sampled[i].y);
      const end = applyMatrix(transform, sampled[i + 1].x, sampled[i + 1].y);
      emitStraightSegment(
        id,
        segmentIndex++,
        start.x,
        start.y,
        end.x,
        end.y,
        layer,
        color,
        lineType,
        sampled[i].z
      );
    }
    stats.splines++;
  };

  const emitText = (
    codes: Record<number, string[]>,
    entityType: string,
    layer: string,
    color: string,
    lineType: string,
    transform: Matrix2D
  ) => {
    const rawText =
      entityType === 'MTEXT'
        ? [...(codes[3] ?? []), ...(codes[1] ?? [])].join('')
        : (codes[1]?.[0] ?? '');
    const text = cleanDxfText(rawText);
    if (!text) return;

    const useAlignmentPoint =
      entityType === 'TEXT' &&
      (num(codes, 72, 0) !== 0 || num(codes, 73, 0) !== 0) &&
      codes[11] !== undefined &&
      codes[21] !== undefined;
    const insertX = useAlignmentPoint ? num(codes, 11) : num(codes, 10);
    const insertY = useAlignmentPoint ? num(codes, 21) : num(codes, 20);
    if (!Number.isFinite(insertX) || !Number.isFinite(insertY)) return;

    const anchor = applyMatrix(transform, insertX, insertY);
    const height = Math.max(0.01, num(codes, 40, 2.5));
    const rotationDeg = num(codes, 50, 0);
    const transformRotation = (Math.atan2(transform.c, transform.a) * 180) / Math.PI;

    const id = `dxf-text-${++textCounter}`;
    lines.push({
      id,
      polylineId: id,
      from: `${id}-P`,
      to: `${id}-P`,
      fromPt: { x: anchor.x, y: anchor.y, z: num(codes, 30, 0) },
      toPt: { x: anchor.x, y: anchor.y, z: num(codes, 30, 0) },
      labelText: text,
      labelOnly: true,
      labelRotation: rotationDeg + transformRotation,
      labelHeight: height * matrixScale(transform),
      type: 'dxf-text',
      layer,
      color,
      lineType,
    });
    stats.texts++;
  };

  const emitLine = (
    record: DxfEntityRecord,
    layer: string,
    color: string,
    lineType: string,
    transform: Matrix2D
  ) => {
    const codes = record.codes;
    const x1 = num(codes, 10);
    const y1 = num(codes, 20);
    const z1 = num(codes, 30, 0);
    const x2 = num(codes, 11);
    const y2 = num(codes, 21);
    const z2 = num(codes, 31, 0);
    if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) {
      return;
    }

    const start = applyMatrix(transform, x1, y1);
    const end = applyMatrix(transform, x2, y2);
    rawLineSegments.push({
      x1: start.x,
      y1: start.y,
      z1,
      x2: end.x,
      y2: end.y,
      z2,
      layer,
      color,
      lineType,
    });
    stats.lines++;
  };

  const emitSolid = (
    record: DxfEntityRecord,
    layer: string,
    color: string,
    lineType: string,
    transform: Matrix2D
  ) => {
    const codes = record.codes;
    const corners: Array<{ x: number; y: number; z: number }> = [];
    const cornerCodes = [
      [10, 20, 30],
      [11, 21, 31],
      [12, 22, 32],
      [13, 23, 33],
    ];

    for (const [xc, yc, zc] of cornerCodes) {
      const x = num(codes, xc);
      const y = num(codes, yc);
      if (!Number.isFinite(x) || !Number.isFinite(y)) break;
      const z = num(codes, zc, 0);
      const point = applyMatrix(transform, x, y);
      corners.push({ x: point.x, y: point.y, z: Number.isFinite(z) ? z : 0 });
    }

    if (corners.length < 3) return;
    if (corners.length === 3) {
      corners.push({ ...corners[2] });
    }

    // SOLID/TRACE order vertices 1, 2, 4, 3 (bowtie order); emit the perimeter.
    const perimeter: Array<[number, number]> = [
      [0, 1],
      [1, 3],
      [3, 2],
      [2, 0],
    ];
    for (const [a, b] of perimeter) {
      const start = corners[a];
      const end = corners[b];
      if (Math.hypot(start.x - end.x, start.y - end.y) < 1e-9) continue;
      rawLineSegments.push({
        x1: start.x,
        y1: start.y,
        z1: start.z,
        x2: end.x,
        y2: end.y,
        z2: end.z,
        layer,
        color,
        lineType,
      });
      stats.lines++;
    }
  };

  const emitHatch = (
    record: DxfEntityRecord,
    layer: string,
    color: string,
    transform: Matrix2D
  ) => {
    const loops = readHatchLoops(record);
    if (loops.length === 0) return;

    const fillPaths: Array<Array<{ x: number; y: number; z: number }>> = [];
    for (const loop of loops) {
      const transformed = loop.points.map(point => {
        const mapped = applyMatrix(transform, point.x, point.y);
        return { x: mapped.x, y: mapped.y, z: 0 };
      });
      if (transformed.length >= 3) fillPaths.push(transformed);
    }
    if (fillPaths.length === 0) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const path of fillPaths) {
      for (const point of path) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
    }

    const id = `dxf-hatch-${++hatchCounter}`;
    lines.push({
      id,
      polylineId: id,
      from: `${id}-MIN`,
      to: `${id}-MAX`,
      fromPt: { x: minX, y: minY, z: 0 },
      toPt: { x: maxX, y: maxY, z: 0 },
      labelOnly: true,
      type: 'dxf-hatch',
      fillPaths,
      hatchSolid: (parseInt(record.codes[70]?.[0] || '1', 10) & 1) === 1,
      layer,
      color,
    });
    stats.hatches++;
  };

  const emitInsertAttributes = (
    block: DxfBlockDefinition,
    attributes: DxfEntityRecord[] | undefined,
    attributeTransform: Matrix2D,
    defaultTransform: Matrix2D,
    inherited: { layer?: string; color?: string },
    depth: number
  ) => {
    const pending = new Map<string, DxfEntityRecord>();
    for (const attrib of attributes ?? []) {
      const tag = (attrib.codes[2]?.[0] || '').trim().toUpperCase();
      if (tag) pending.set(tag, attrib);
    }

    for (const child of block.records) {
      if (child.type !== 'ATTDEF') continue;
      const tag = (child.codes[2]?.[0] || '').trim().toUpperCase();
      const override = tag ? pending.get(tag) : undefined;
      if (override) {
        pending.delete(tag);
        emitEntity(override, attributeTransform, inherited, depth + 1);
      } else {
        emitEntity(child, defaultTransform, inherited, depth + 1);
      }
    }

    // ATTRIB values whose ATTDEF was purged from the block are still annotations.
    for (const override of pending.values()) {
      emitEntity(override, attributeTransform, inherited, depth + 1);
    }
  };

  const emitInsert = (
    record: DxfEntityRecord,
    layer: string,
    color: string,
    transform: Matrix2D,
    depth: number
  ) => {
    const codes = record.codes;
    const blockName = (codes[2]?.[0] || '').trim().toUpperCase();
    const block = blocks.get(blockName);
    if (!block || depth > 8) return;

    const insertionX = num(codes, 10, 0);
    const insertionY = num(codes, 20, 0);
    const scaleX = num(codes, 41, 1);
    const scaleY = num(codes, 42, 1);
    const rotation = (num(codes, 50, 0) * Math.PI) / 180;
    const columns = Math.max(1, Math.min(1000, Math.floor(num(codes, 70, 1))));
    const rows = Math.max(1, Math.min(1000, Math.floor(num(codes, 71, 1))));
    const columnSpacing = num(codes, 44, 0);
    const rowSpacing = num(codes, 45, 0);

    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const offsetX = column * columnSpacing;
        const offsetY = row * rowSpacing;

        // translate(insert) * rotate * scale * translate(-blockBase)
        const instance: Matrix2D = multiplyMatrix(
          {
            a: cos,
            b: -sin,
            c: sin,
            d: cos,
            e: insertionX + cos * offsetX - sin * offsetY,
            f: insertionY + sin * offsetX + cos * offsetY,
          },
          multiplyMatrix(
            { a: scaleX, b: 0, c: 0, d: scaleY, e: 0, f: 0 },
            { a: 1, b: 0, c: 0, d: 1, e: -block.baseX, f: -block.baseY }
          )
        );

        const combined = multiplyMatrix(transform, instance);
        for (const child of block.records) {
          if (child.type === 'ATTDEF') continue;
          emitEntity(child, combined, { layer, color }, depth + 1);
        }
        emitInsertAttributes(block, record.attributes, transform, combined, { layer, color }, depth);
      }
    }

    stats.inserts++;
  };

  const emitEntity = (
    record: DxfEntityRecord,
    transform: Matrix2D = IDENTITY_MATRIX,
    inherited?: { layer?: string; color?: string },
    depth = 0
  ) => {
    try {
      const codes = record.codes;
      const rawLayer = (codes[8]?.[0] || '0').trim();
      const inheritsLayer = rawLayer === '0' && inherited?.layer;
      const layer = inheritsLayer ? (inherited?.layer as string) : rawLayer;
      layersSet.add(layer);

      const colorCode = codes[62]?.[0];
      const colorIdx = colorCode !== undefined ? parseInt(colorCode, 10) : undefined;
      const resolvesByBlockOrLayerZero =
        colorIdx === 0 || (colorIdx === undefined && rawLayer === '0');
      const entityColor =
        inherited?.color && resolvesByBlockOrLayerZero
          ? inherited.color
          : resolveEntityColor(layer, colorIdx);
      if (!layerColors[layer]) {
        layerColors[layer] = entityColor;
      }

      const lineType =
        codes[6]?.[0]?.trim() || layerDefs.get(layer.toUpperCase())?.lineType || 'CONTINUOUS';

      // Entities are authored in their own OCS; compose it before the block/view
      // transform so extrusion vectors (210/220/230) are honoured.
      const ocs = extrusionMatrix(codes);
      const entityTransform = ocs ? multiplyMatrix(transform, ocs) : transform;

      switch (record.type) {
        case 'LINE':
          emitLine(record, layer, entityColor, lineType, entityTransform);
          break;

        case 'POINT': {
          const x = num(codes, 10);
          const y = num(codes, 20);
          const z = num(codes, 30, 0);
          if (!Number.isFinite(x) || !Number.isFinite(y)) break;
          const point = applyMatrix(entityTransform, x, y);
          points.push({
            pointNumber: `${nextPtNum++}`,
            northing: point.y,
            easting: point.x,
            elevation: Number.isFinite(z) ? z : 0,
            description: `DXF_${layer}`,
            layer,
          });
          stats.points++;
          break;
        }

        case 'CIRCLE': {
          const cx = num(codes, 10);
          const cy = num(codes, 20);
          const cz = num(codes, 30, 0);
          const radius = num(codes, 40);
          if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(radius) || radius <= 0) {
            break;
          }
          emitCircle(cx, cy, cz, radius, layer, entityColor, lineType, entityTransform);
          break;
        }

        case 'ARC': {
          const cx = num(codes, 10);
          const cy = num(codes, 20);
          const cz = num(codes, 30, 0);
          const radius = num(codes, 40);
          const startDeg = num(codes, 50);
          const endDeg = num(codes, 51);
          if (
            !Number.isFinite(cx) ||
            !Number.isFinite(cy) ||
            !Number.isFinite(radius) ||
            !Number.isFinite(startDeg) ||
            !Number.isFinite(endDeg) ||
            radius <= 0
          ) {
            break;
          }
          emitArc(cx, cy, cz, radius, startDeg, endDeg, layer, entityColor, lineType, entityTransform);
          break;
        }

        case 'ELLIPSE':
          emitEllipse(codes, layer, entityColor, lineType, entityTransform);
          break;

        case 'SPLINE':
          emitSpline(codes, layer, entityColor, lineType, entityTransform);
          break;

        case 'TEXT':
        case 'MTEXT':
          emitText(codes, record.type, layer, entityColor, lineType, entityTransform);
          break;

        case 'ATTRIB':
        case 'ATTDEF':
          // ATTRIB carries the value in group 1; ATTDEF carries its default.
          emitText(codes, 'TEXT', layer, entityColor, lineType, entityTransform);
          break;

        case 'HATCH':
          emitHatch(record, layer, entityColor, entityTransform);
          break;

        case 'INSERT':
          emitInsert(record, layer, entityColor, entityTransform, depth);
          break;

        case 'LWPOLYLINE': {
          const numVertices = parseInt(codes[90]?.[0] || '0', 10);
          const flags = parseInt(codes[70]?.[0] || '0', 10);
          const isClosed = (flags & 1) === 1;

          // Group 42 (bulge) is optional per vertex: AutoCAD and IntelliCAD only
          // write it for vertices that actually start an arc. Walk the ordered
          // tokens so each bulge stays with its own vertex.
          const vertices: Array<{ x: number; y: number; bulge: number }> = [];
          let pendingVertex: { x?: number; y?: number; bulge?: number } | null = null;
          const pushPendingVertex = () => {
            if (!pendingVertex) return;
            if (Number.isFinite(pendingVertex.x) && Number.isFinite(pendingVertex.y)) {
              vertices.push({
                x: pendingVertex.x as number,
                y: pendingVertex.y as number,
                bulge: pendingVertex.bulge ?? 0,
              });
            }
          };
          for (const token of record.tokens) {
            if (token.code === 10) {
              pushPendingVertex();
              pendingVertex = { x: parseFloat(token.value) };
            } else if (token.code === 20 && pendingVertex) {
              pendingVertex.y = parseFloat(token.value);
            } else if (token.code === 42 && pendingVertex) {
              pendingVertex.bulge = parseFloat(token.value);
            }
          }
          pushPendingVertex();

          const count =
            numVertices > 0 ? Math.min(vertices.length, numVertices) : vertices.length;
          if (count < 2) break;

          emitPolyline(
            vertices.slice(0, count),
            isClosed,
            `dxf-poly-${++polylineCounter}`,
            layer,
            entityColor,
            lineType,
            entityTransform
          );
          stats.polylines++;
          break;
        }

        case 'POLYLINE': {
          const flags = parseInt(codes[70]?.[0] || '0', 10);
          const isClosed = (flags & 1) === 1;
          const vertices = (record.vertices ?? []).map(v => ({
            x: v.x,
            y: v.y,
            bulge: v.bulge,
          }));
          if (vertices.length < 2) break;

          emitPolyline(
            vertices,
            isClosed,
            `dxf-poly-${++polylineCounter}`,
            layer,
            entityColor,
            lineType,
            entityTransform
          );
          stats.polylines++;
          break;
        }

        case 'SOLID':
        case 'TRACE':
        case '3DFACE':
          emitSolid(record, layer, entityColor, lineType, entityTransform);
          break;

        default:
          break;
      }
    } catch (err) {
      console.warn('Error processing DXF entity:', record.type, err);
    }
  };

  // ── Step 3: Emit top-level entities (expanding block references as needed) ──
  // Paper-space entities are drawing-sheet content, not model geometry. Keep them
  // only when the file has no model-space entities at all (title-block-only exports).
  const isPaperSpace = (record: DxfEntityRecord) =>
    (parseInt(record.codes[67]?.[0] || '0', 10) & 1) === 1;
  const modelSpaceRecords = entityRecords.filter(record => !isPaperSpace(record));
  const topLevelRecords = modelSpaceRecords.length > 0 ? modelSpaceRecords : entityRecords;
  for (const record of topLevelRecords) {
    emitEntity(record, IDENTITY_MATRIX, undefined, 0);
  }

  // ── Step 4: Chain contiguous raw LINE segments into coherent polylines ───
  // When a DXF export explodes or saves linear features as series of LINE entities,
  // chain connected lines sharing the same layer, color, and linetype into a unified
  // polyline with a single polylineId so they can be selected and manipulated together.
  if (rawLineSegments.length > 0) {
    const chainedLines = chainLineSegmentsIntoPolylines(rawLineSegments, () => {
      polylineCounter++;
      return `dxf-poly-${polylineCounter}`;
    });
    lines.push(...chainedLines);
  }

  // ── Step 5: Convert long strings of segments into weighted T-splines if requested ─
  let finalLines = lines;
  if (smoothSplines && lines.length > 0) {
    const polyGroups = new Map<string, SurveyLine[]>();
    const unbundled: SurveyLine[] = [];

    for (const l of lines) {
      if (l.polylineId) {
        if (!polyGroups.has(l.polylineId)) polyGroups.set(l.polylineId, []);
        polyGroups.get(l.polylineId)!.push(l);
      } else {
        unbundled.push(l);
      }
    }

    const smoothedLines: SurveyLine[] = [...unbundled];
    for (const segs of polyGroups.values()) {
      const layerSelected =
        splineLayerSet.size === 0 || splineLayerSet.has((segs[0].layer ?? '').toUpperCase());
      if (layerSelected && segs.length >= 2 && !segs.some(s => s.isCircle || s.labelOnly)) {
        smoothedLines.push(...convertSegmentsToWeightedTSpline(segs, splineOptions));
      } else {
        smoothedLines.push(...segs);
      }
    }
    finalLines = smoothedLines;
  }

  return {
    points,
    lines: finalLines,
    layers: Array.from(layersSet),
    layerColors,
    totalEntities:
      stats.lines +
      stats.polylines +
      stats.circles +
      stats.arcs +
      stats.points +
      stats.ellipses +
      stats.splines +
      stats.texts +
      stats.inserts +
      stats.hatches,
    stats,
  };
}

/**
 * Chains raw LINE segments sharing (layer, color, linetype) that connect end-to-end
 * into continuous polyline groups tagged with `polylineId`.
 */
export function chainLineSegmentsIntoPolylines(
  rawSegments: RawLineSegment[],
  getNextPolylineId: () => string
): SurveyLine[] {
  if (rawSegments.length === 0) return [];

  // Group segments by matching style (layer + color + lineType)
  const styleGroups = new Map<string, RawLineSegment[]>();
  for (const seg of rawSegments) {
    const key = `${seg.layer}::${seg.color}::${seg.lineType}`;
    if (!styleGroups.has(key)) styleGroups.set(key, []);
    styleGroups.get(key)!.push(seg);
  }

  const result: SurveyLine[] = [];
  const PREC = 4;
  const ptKey = (x: number, y: number) => `${x.toFixed(PREC)},${y.toFixed(PREC)}`;

  for (const group of styleGroups.values()) {
    // Build spatial endpoint index for chaining
    const endMap = new Map<string, Array<{ idx: number; end: 'start' | 'end' }>>();
    for (let i = 0; i < group.length; i++) {
      const seg = group[i];
      const k1 = ptKey(seg.x1, seg.y1);
      const k2 = ptKey(seg.x2, seg.y2);
      if (!endMap.has(k1)) endMap.set(k1, []);
      endMap.get(k1)!.push({ idx: i, end: 'start' });
      if (!endMap.has(k2)) endMap.set(k2, []);
      endMap.get(k2)!.push({ idx: i, end: 'end' });
    }

    const visited = new Set<number>();

    for (let i = 0; i < group.length; i++) {
      if (visited.has(i)) continue;

      const polyId = getNextPolylineId();
      const run: Array<{ x1: number; y1: number; z1: number; x2: number; y2: number; z2: number }> = [];

      visited.add(i);
      run.push({
        x1: group[i].x1,
        y1: group[i].y1,
        z1: group[i].z1,
        x2: group[i].x2,
        y2: group[i].y2,
        z2: group[i].z2,
      });

      // Extend forward from tail
      let forward = true;
      while (forward) {
        forward = false;
        const last = run[run.length - 1];
        const tailKey = ptKey(last.x2, last.y2);
        for (const candidate of endMap.get(tailKey) ?? []) {
          if (visited.has(candidate.idx)) continue;
          visited.add(candidate.idx);
          const candSeg = group[candidate.idx];
          if (candidate.end === 'start') {
            run.push({
              x1: candSeg.x1, y1: candSeg.y1, z1: candSeg.z1,
              x2: candSeg.x2, y2: candSeg.y2, z2: candSeg.z2,
            });
          } else {
            run.push({
              x1: candSeg.x2, y1: candSeg.y2, z1: candSeg.z2,
              x2: candSeg.x1, y2: candSeg.y1, z2: candSeg.z1,
            });
          }
          forward = true;
          break;
        }
      }

      // Extend backward from head
      let backward = true;
      while (backward) {
        backward = false;
        const first = run[0];
        const headKey = ptKey(first.x1, first.y1);
        for (const candidate of endMap.get(headKey) ?? []) {
          if (visited.has(candidate.idx)) continue;
          visited.add(candidate.idx);
          const candSeg = group[candidate.idx];
          if (candidate.end === 'end') {
            run.unshift({
              x1: candSeg.x1, y1: candSeg.y1, z1: candSeg.z1,
              x2: candSeg.x2, y2: candSeg.y2, z2: candSeg.z2,
            });
          } else {
            run.unshift({
              x1: candSeg.x2, y1: candSeg.y2, z1: candSeg.z2,
              x2: candSeg.x1, y2: candSeg.y1, z2: candSeg.z1,
            });
          }
          backward = true;
          break;
        }
      }

      // Emit SurveyLine segments with matching polylineId
      const sample = group[i];
      for (let sIdx = 0; sIdx < run.length; sIdx++) {
        const seg = run[sIdx];
        const segId = `${polyId}-seg-${sIdx}`;
        result.push({
          id: segId,
          polylineId: polyId,
          from: `${segId}-A`,
          to: `${segId}-B`,
          fromPt: { x: seg.x1, y: seg.y1, z: seg.z1 },
          toPt: { x: seg.x2, y: seg.y2, z: seg.z2 },
          layer: sample.layer,
          color: sample.color,
          lineType: sample.lineType,
        });
      }
    }
  }

  return result;
}

function buildPolylineSegment(
  polyId: string,
  index: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bulge: number,
  layer: string,
  color: string,
  lineType: string
): SurveyLine {
  const segId = `${polyId}-seg-${index}`;

  if (!bulge || Math.abs(bulge) < 1e-6) {
    return {
      id: segId,
      polylineId: polyId,
      from: `${segId}-A`,
      to: `${segId}-B`,
      fromPt: { x: x1, y: y1, z: 0 },
      toPt: { x: x2, y: y2, z: 0 },
      layer,
      color,
      lineType,
    };
  }

  // Bulge = tan(included_angle / 4)
  const dx = x2 - x1;
  const dy = y2 - y1;
  const chordDist = Math.hypot(dx, dy);

  if (chordDist < 1e-6) {
    return {
      id: segId,
      polylineId: polyId,
      from: `${segId}-A`,
      to: `${segId}-B`,
      fromPt: { x: x1, y: y1, z: 0 },
      toPt: { x: x2, y: y2, z: 0 },
      layer,
      color,
      lineType,
    };
  }

  const theta = 4 * Math.atan(bulge);
  const radius = Math.abs(chordDist / (2 * Math.sin(theta / 2)));
  const sagitta = (bulge * chordDist) / 2;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const normX = -dy / chordDist;
  const normY = dx / chordDist;

  // Arc center
  const distToCenter = radius * Math.cos(theta / 2);
  const sign = bulge > 0 ? 1 : -1;
  const cx = midX + normX * (distToCenter * sign);
  const cy = midY + normY * (distToCenter * sign);
  const arcLength = Math.abs(radius * theta);

  return {
    id: segId,
    polylineId: polyId,
    from: `${segId}-A`,
    to: `${segId}-B`,
    fromPt: { x: x1, y: y1, z: 0 },
    toPt: { x: x2, y: y2, z: 0 },
    isCurve: true,
    circleCenter: { x: cx, y: cy, z: 0 },
    curveRadius: radius,
    arcLength,
    curveDirection: bulge > 0 ? 'left' : 'right',
    layer,
    color,
    lineType,
  };
}
