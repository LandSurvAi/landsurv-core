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
 *   - LINE (chains contiguous collinear/connected line segments into named polylines)
 *   - CIRCLE
 *   - ARC
 *   - POINT
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
  const splineLayerSet = new Set((options.splineLayers ?? []).map(l => l.trim().toUpperCase()).filter(Boolean));
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

  // ── Step 2: Extract ENTITIES Section ───────────────────────────────────────
  const entitiesStart = dxfContent.search(/(?:^|\r?\n)\s*0\r?\n\s*SECTION\b[\s\S]*?(?:^|\r?\n)\s*2\r?\n\s*ENTITIES\b/m);
  const entitiesText = entitiesStart >= 0 ? dxfContent.slice(entitiesStart) : dxfContent;

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
  };

  let currentEntityType: string | null = null;
  let currentGroupCodes: Record<number, string[]> = {};

  // For classic POLYLINE / VERTEX / SEQEND structure
  let insidePolylineEntity = false;
  let activePolylineHeader: {
    layer: string;
    color: string;
    lineType: string;
    isClosed: boolean;
  } | null = null;
  let activePolylineVertices: Array<{ x: number; y: number; z: number; bulge: number }> = [];

  let polylineCounter = 0;

  const resolveEntityColor = (layerName: string, entityColorIdx?: number): string => {
    if (entityColorIdx !== undefined && entityColorIdx > 0 && entityColorIdx < 256) {
      return aciToHex(entityColorIdx);
    }
    const def = layerDefs.get(layerName.toUpperCase());
    return aciToHex(def?.colorIndex);
  };

  const flushEntity = () => {
    if (!currentEntityType) return;

    try {
      const layer = (currentGroupCodes[8]?.[0] || '0').trim();
      layersSet.add(layer);

      const colorCode = currentGroupCodes[62]?.[0];
      const colorIdx = colorCode !== undefined ? parseInt(colorCode, 10) : undefined;
      const entityColor = resolveEntityColor(layer, colorIdx);
      if (!layerColors[layer]) {
        layerColors[layer] = entityColor;
      }

      const lineType = currentGroupCodes[6]?.[0]?.trim() || layerDefs.get(layer.toUpperCase())?.lineType || 'CONTINUOUS';

      switch (currentEntityType) {
        case 'LINE': {
          const x1 = parseFloat(currentGroupCodes[10]?.[0] || 'NaN');
          const y1 = parseFloat(currentGroupCodes[20]?.[0] || 'NaN');
          const z1 = parseFloat(currentGroupCodes[30]?.[0] || '0');
          const x2 = parseFloat(currentGroupCodes[11]?.[0] || 'NaN');
          const y2 = parseFloat(currentGroupCodes[21]?.[0] || 'NaN');
          const z2 = parseFloat(currentGroupCodes[31]?.[0] || '0');

          if (!isNaN(x1) && !isNaN(y1) && !isNaN(x2) && !isNaN(y2)) {
            rawLineSegments.push({
              x1, y1, z1,
              x2, y2, z2,
              layer,
              color: entityColor,
              lineType,
            });
            stats.lines++;
          }
          break;
        }

        case 'POINT': {
          const x = parseFloat(currentGroupCodes[10]?.[0] || 'NaN');
          const y = parseFloat(currentGroupCodes[20]?.[0] || 'NaN');
          const z = parseFloat(currentGroupCodes[30]?.[0] || '0');

          if (!isNaN(x) && !isNaN(y)) {
            const ptNum = `${nextPtNum++}`;
            points.push({
              pointNumber: ptNum,
              northing: y,
              easting: x,
              elevation: isNaN(z) ? 0 : z,
              description: `DXF_${layer}`,
              layer,
            });
            stats.points++;
          }
          break;
        }

        case 'CIRCLE': {
          const cx = parseFloat(currentGroupCodes[10]?.[0] || 'NaN');
          const cy = parseFloat(currentGroupCodes[20]?.[0] || 'NaN');
          const cz = parseFloat(currentGroupCodes[30]?.[0] || '0');
          const radius = parseFloat(currentGroupCodes[40]?.[0] || 'NaN');

          if (!isNaN(cx) && !isNaN(cy) && !isNaN(radius) && radius > 0) {
            const circleId = `dxf-circle-${lines.length + 1}`;
            lines.push({
              id: circleId,
              polylineId: circleId,
              from: `${circleId}-C`,
              to: `${circleId}-C`,
              fromPt: { x: cx, y: cy, z: cz },
              toPt: { x: cx, y: cy, z: cz },
              isCircle: true,
              circleCenter: { x: cx, y: cy, z: cz },
              curveRadius: radius,
              layer,
              color: entityColor,
              lineType,
            });
            stats.circles++;
          }
          break;
        }

        case 'SOLID':
        case 'TRACE':
        case '3DFACE': {
          // Parse corner coordinates. SOLID/TRACE order vertices 1, 2, 4, 3 (bowtie order).
          // We output perimeter wireframe line segments to avoid rogue opaque triangular blotches.
          const x1 = parseFloat(currentGroupCodes[10]?.[0] || 'NaN');
          const y1 = parseFloat(currentGroupCodes[20]?.[0] || 'NaN');
          const z1 = parseFloat(currentGroupCodes[30]?.[0] || '0');
          const x2 = parseFloat(currentGroupCodes[11]?.[0] || 'NaN');
          const y2 = parseFloat(currentGroupCodes[21]?.[0] || 'NaN');
          const z2 = parseFloat(currentGroupCodes[31]?.[0] || '0');
          const x3 = parseFloat(currentGroupCodes[12]?.[0] || 'NaN');
          const y3 = parseFloat(currentGroupCodes[22]?.[0] || 'NaN');
          const z3 = parseFloat(currentGroupCodes[32]?.[0] || '0');
          const x4Raw = currentGroupCodes[13]?.[0];
          const y4Raw = currentGroupCodes[23]?.[0];
          const z4Raw = currentGroupCodes[33]?.[0] || '0';
          const x4 = x4Raw !== undefined ? parseFloat(x4Raw) : x3;
          const y4 = y4Raw !== undefined ? parseFloat(y4Raw) : y3;
          const z4 = z4Raw !== undefined ? parseFloat(z4Raw) : z3;

          if (!isNaN(x1) && !isNaN(y1) && !isNaN(x2) && !isNaN(y2) && !isNaN(x3) && !isNaN(y3)) {
            // For SOLID and TRACE, perimeter is 1->2->4->3->1 (when 4 vertices exist)
            const isFourPt = !isNaN(x4) && !isNaN(y4) && (x4 !== x3 || y4 !== y3);
            const perimeter = isFourPt
              ? [
                  [x1, y1, z1, x2, y2, z2],
                  [x2, y2, z2, x4, y4, z4],
                  [x4, y4, z4, x3, y3, z3],
                  [x3, y3, z3, x1, y1, z1],
                ]
              : [
                  [x1, y1, z1, x2, y2, z2],
                  [x2, y2, z2, x3, y3, z3],
                  [x3, y3, z3, x1, y1, z1],
                ];

            for (const [px1, py1, pz1, px2, py2, pz2] of perimeter) {
              rawLineSegments.push({
                x1: px1, y1: py1, z1: pz1,
                x2: px2, y2: py2, z2: pz2,
                layer,
                color: entityColor,
                lineType,
              });
              stats.lines++;
            }
          }
          break;
        }

        case 'ARC': {
          const cx = parseFloat(currentGroupCodes[10]?.[0] || 'NaN');
          const cy = parseFloat(currentGroupCodes[20]?.[0] || 'NaN');
          const cz = parseFloat(currentGroupCodes[30]?.[0] || '0');
          const radius = parseFloat(currentGroupCodes[40]?.[0] || 'NaN');
          const startAngleDeg = parseFloat(currentGroupCodes[50]?.[0] || 'NaN');
          const endAngleDeg = parseFloat(currentGroupCodes[51]?.[0] || 'NaN');

          if (
            !isNaN(cx) &&
            !isNaN(cy) &&
            !isNaN(radius) &&
            !isNaN(startAngleDeg) &&
            !isNaN(endAngleDeg) &&
            radius > 0
          ) {
            const startRad = (startAngleDeg * Math.PI) / 180;
            const endRad = (endAngleDeg * Math.PI) / 180;
            const x1 = cx + radius * Math.cos(startRad);
            const y1 = cy + radius * Math.sin(startRad);
            const x2 = cx + radius * Math.cos(endRad);
            const y2 = cy + radius * Math.sin(endRad);

            let sweepRad = endRad - startRad;
            if (sweepRad <= 0) sweepRad += 2 * Math.PI;
            const arcLength = radius * sweepRad;

            const arcId = `dxf-arc-${lines.length + 1}`;
            lines.push({
              id: arcId,
              polylineId: arcId,
              from: `${arcId}-A`,
              to: `${arcId}-B`,
              fromPt: { x: x1, y: y1, z: cz },
              toPt: { x: x2, y: y2, z: cz },
              isCurve: true,
              circleCenter: { x: cx, y: cy, z: cz },
              curveRadius: radius,
              arcLength,
              curveDirection: 'left', // Counterclockwise standard CAD arc
              layer,
              color: entityColor,
              lineType,
            });
            stats.arcs++;
          }
          break;
        }

        case 'LWPOLYLINE': {
          const numVertices = parseInt(currentGroupCodes[90]?.[0] || '0', 10);
          const flags = parseInt(currentGroupCodes[70]?.[0] || '0', 10);
          const isClosed = (flags & 1) === 1;

          const xs = currentGroupCodes[10] || [];
          const ys = currentGroupCodes[20] || [];
          const bulges = currentGroupCodes[42] || [];

          polylineCounter++;
          const polyId = `dxf-poly-${polylineCounter}`;
          const count = Math.min(xs.length, ys.length, numVertices > 0 ? numVertices : xs.length);

          if (count >= 2) {
            for (let i = 0; i < count - 1; i++) {
              const x1 = parseFloat(xs[i]);
              const y1 = parseFloat(ys[i]);
              const x2 = parseFloat(xs[i + 1]);
              const y2 = parseFloat(ys[i + 1]);
              const bulge = bulges[i] ? parseFloat(bulges[i]) : 0;

              if (!isNaN(x1) && !isNaN(y1) && !isNaN(x2) && !isNaN(y2)) {
                lines.push(
                  buildPolylineSegment(
                    polyId,
                    i,
                    x1,
                    y1,
                    x2,
                    y2,
                    bulge,
                    layer,
                    entityColor,
                    lineType
                  )
                );
              }
            }

            if (isClosed && count >= 2) {
              const xLast = parseFloat(xs[count - 1]);
              const yLast = parseFloat(ys[count - 1]);
              const xFirst = parseFloat(xs[0]);
              const yFirst = parseFloat(ys[0]);
              const bulgeLast = bulges[count - 1] ? parseFloat(bulges[count - 1]) : 0;

              if (!isNaN(xLast) && !isNaN(yLast) && !isNaN(xFirst) && !isNaN(yFirst)) {
                lines.push(
                  buildPolylineSegment(
                    polyId,
                    count - 1,
                    xLast,
                    yLast,
                    xFirst,
                    yFirst,
                    bulgeLast,
                    layer,
                    entityColor,
                    lineType
                  )
                );
              }
            }
            stats.polylines++;
          }
          break;
        }

        case 'POLYLINE': {
          const flags = parseInt(currentGroupCodes[70]?.[0] || '0', 10);
          const isClosed = (flags & 1) === 1;
          insidePolylineEntity = true;
          activePolylineHeader = {
            layer,
            color: entityColor,
            lineType,
            isClosed,
          };
          activePolylineVertices = [];
          break;
        }

        case 'VERTEX': {
          if (insidePolylineEntity) {
            const vx = parseFloat(currentGroupCodes[10]?.[0] || 'NaN');
            const vy = parseFloat(currentGroupCodes[20]?.[0] || 'NaN');
            const vz = parseFloat(currentGroupCodes[30]?.[0] || '0');
            const bulge = parseFloat(currentGroupCodes[42]?.[0] || '0');
            if (!isNaN(vx) && !isNaN(vy)) {
              activePolylineVertices.push({
                x: vx,
                y: vy,
                z: isNaN(vz) ? 0 : vz,
                bulge: isNaN(bulge) ? 0 : bulge,
              });
            }
          }
          break;
        }

        case 'SEQEND': {
          if (insidePolylineEntity && activePolylineHeader) {
            const verts = activePolylineVertices;
            if (verts.length >= 2) {
              polylineCounter++;
              const polyId = `dxf-poly-${polylineCounter}`;
              const { layer: plLayer, color: plColor, lineType: plLt, isClosed } = activePolylineHeader;

              for (let i = 0; i < verts.length - 1; i++) {
                lines.push(
                  buildPolylineSegment(
                    polyId,
                    i,
                    verts[i].x,
                    verts[i].y,
                    verts[i + 1].x,
                    verts[i + 1].y,
                    verts[i].bulge,
                    plLayer,
                    plColor,
                    plLt
                  )
                );
              }

              if (isClosed && verts.length >= 2) {
                const last = verts[verts.length - 1];
                const first = verts[0];
                lines.push(
                  buildPolylineSegment(
                    polyId,
                    verts.length - 1,
                    last.x,
                    last.y,
                    first.x,
                    first.y,
                    last.bulge,
                    plLayer,
                    plColor,
                    plLt
                  )
                );
              }
              stats.polylines++;
            }
            insidePolylineEntity = false;
            activePolylineHeader = null;
            activePolylineVertices = [];
          }
          break;
        }
      }
    } catch (err) {
      console.warn('Error processing DXF entity:', currentEntityType, err);
    }
  };

  // ── Step 3: Stream and parse entities ──────────────────────────────────────
  let insideEntities = false;
  let hasEntitiesSection = false;

  for (const token of tokenize(entitiesText)) {
    const { code, value } = token;

    if (code === 2 && value === 'ENTITIES') {
      insideEntities = true;
      hasEntitiesSection = true;
      continue;
    }

    if (code === 0 && value === 'ENDSEC') {
      flushEntity();
      currentEntityType = null;
      insideEntities = false;
      continue;
    }

    if (code === 0 && value === 'EOF') {
      flushEntity();
      currentEntityType = null;
      insideEntities = false;
      break;
    }

    if (insideEntities || !hasEntitiesSection) {
      if (code === 0) {
        flushEntity();
        currentEntityType = value;
        currentGroupCodes = {};
      } else if (currentEntityType) {
        if (!currentGroupCodes[code]) {
          currentGroupCodes[code] = [];
        }
        currentGroupCodes[code].push(value);
      }
    }
  }

  flushEntity();

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
      const layerSelected = splineLayerSet.size === 0 || splineLayerSet.has((segs[0].layer ?? '').toUpperCase());
      if (layerSelected && segs.length >= 2 && !segs.some(s => s.isCircle)) {
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
    totalEntities: stats.lines + stats.polylines + stats.circles + stats.arcs + stats.points,
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
