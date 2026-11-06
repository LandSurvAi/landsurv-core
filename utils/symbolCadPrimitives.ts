import type { SymbolTextElement } from '../contexts/types/CadManager.types';

export interface CadCirclePrimitive {
  type: 'circle';
  cx: number;
  cy: number;
  r: number;
  filled?: boolean;
}

export interface CadArcPrimitive {
  type: 'arc';
  cx: number;
  cy: number;
  r: number;
  /** Counter-clockwise start angle in degrees (0..360), AutoCAD convention */
  startAngleDeg: number;
  /** Counter-clockwise end angle in degrees (0..360), AutoCAD convention */
  endAngleDeg: number;
}

export interface CadPolylinePrimitive {
  type: 'polyline';
  vertices: Array<[number, number]>;
  closed: boolean;
  filled?: boolean;
}

export interface CadTextPrimitive {
  type: 'text';
  x: number;
  y: number;
  height: number;
  text: string;
  rotation: number;
  anchor: 'start' | 'middle' | 'end';
}

export type CadSymbolPrimitive =
  | CadCirclePrimitive
  | CadArcPrimitive
  | CadPolylinePrimitive
  | CadTextPrimitive;

export interface ExtractCadPrimitivesOptions {
  /** Center X in target CAD coordinate space (default 0) */
  originX?: number;
  /** Center Y in target CAD coordinate space (default 0) */
  originY?: number;
  /**
   * Multiplier per SVG viewBox unit (default 1).
   * If `worldSize` is provided instead, scale is computed as `worldSize / max(viewBoxW, viewBoxH)`.
   */
  scale?: number;
  /** Total target extent of the symbol in CAD world units */
  worldSize?: number;
}

interface SvgArcEndpoint {
  x1: number;
  y1: number;
  rx: number;
  ry: number;
  phiDeg: number;
  largeArc: boolean;
  sweep: boolean;
  x2: number;
  y2: number;
}

interface CenterArc {
  cx: number;
  cy: number;
  r: number;
  theta1Rad: number;
  deltaThetaRad: number;
}

/**
 * W3C SVG 1.1 Appendix F.6.5: Endpoint to center parameterization for circular/elliptical arcs.
 * Assumes coordinates are already transformed into CAD space (Y-up).
 */
function svgArcToCenterParam(arc: SvgArcEndpoint): CenterArc | null {
  const { x1, y1, x2, y2, largeArc, sweep } = arc;
  let rx = Math.abs(arc.rx);
  let ry = Math.abs(arc.ry);
  if (rx < 1e-7 || ry < 1e-7) return null;

  const dx2 = (x1 - x2) / 2;
  const dy2 = (y1 - y2) / 2;
  const distSq = dx2 * dx2 + dy2 * dy2;
  if (distSq < 1e-10) return null;

  const phi = (arc.phiDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const sqrtLambda = Math.sqrt(lambda);
    rx *= sqrtLambda;
    ry *= sqrtLambda;
  }

  const rxSq = rx * rx;
  const rySq = ry * ry;
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;

  const num = Math.max(0, rxSq * rySq - rxSq * y1pSq - rySq * x1pSq);
  const den = rxSq * y1pSq + rySq * x1pSq;
  if (den < 1e-12) return null;

  const sign = largeArc === sweep ? -1 : 1;
  const coef = sign * Math.sqrt(num / den);

  const cxp = coef * ((rx * y1p) / ry);
  const cyp = coef * (-(ry * x1p) / rx);

  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const vectorAngle = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
    const clamped = Math.max(-1, Math.min(1, len > 0 ? dot / len : 1));
    const ang = Math.acos(clamped);
    return ux * vy - uy * vx < 0 ? -ang : ang;
  };

  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;

  const theta1Rad = vectorAngle(1, 0, ux, uy);
  let deltaThetaRad = vectorAngle(ux, uy, vx, vy);

  if (!sweep && deltaThetaRad > 0) {
    deltaThetaRad -= 2 * Math.PI;
  } else if (sweep && deltaThetaRad < 0) {
    deltaThetaRad += 2 * Math.PI;
  }

  return {
    cx,
    cy,
    r: (rx + ry) / 2,
    theta1Rad,
    deltaThetaRad,
  };
}

function normalizeDeg(deg: number): number {
  const m = deg % 360;
  return m < 0 ? m + 360 : m;
}

/**
 * Parse a single SVG path string (supporting M, L, H, V, A, Z in absolute & relative forms)
 * into CAD primitives (native CIRCLE, ARC, and LWPOLYLINE).
 */
function parsePathToCadPrimitives(
  pathData: string,
  toCadPt: (sx: number, sy: number) => [number, number],
  scaleFactor: number,
  isFill: boolean
): CadSymbolPrimitive[] {
  if (!pathData || !pathData.trim()) return [];
  const primitives: CadSymbolPrimitive[] = [];

  const tokens = pathData.match(/[a-zA-Z][^a-zA-Z]*/g) || [];
  let curX = 0;
  let curY = 0;
  let startX = 0;
  let startY = 0;
  let currentPoly: Array<[number, number]> = [];

  // Track whether the current subpath is a 2-arc full circle:
  // M x0 y0 A r r 0 1 0 x1 y1 A r r 0 1 0 x0 y0 [Z]
  let subpathCmdCount = 0;
  let pendingFirstHalfCircle: {
    startX: number;
    startY: number;
    midX: number;
    midY: number;
    r: number;
  } | null = null;
  let completedFullCircleInSubpath = false;

  const flushPoly = (closed: boolean) => {
    if (currentPoly.length >= 2) {
      // Deduplicate consecutive identical points
      const cleaned: Array<[number, number]> = [currentPoly[0]];
      for (let i = 1; i < currentPoly.length; i++) {
        const prev = cleaned[cleaned.length - 1];
        const pt = currentPoly[i];
        if (Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) > 1e-6) {
          cleaned.push(pt);
        }
      }
      // If closed and last point equals first point, pop the duplicate closing vertex
      if (closed && cleaned.length > 2) {
        const first = cleaned[0];
        const last = cleaned[cleaned.length - 1];
        if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-5) {
          cleaned.pop();
        }
      }
      if (cleaned.length >= 2) {
        primitives.push({
          type: 'polyline',
          vertices: cleaned,
          closed: closed || isFill,
          filled: isFill,
        });
      }
    }
    currentPoly = [];
  };

  for (const rawCmd of tokens) {
    const cmdChar = rawCmd[0];
    const isRel = cmdChar === cmdChar.toLowerCase();
    const type = cmdChar.toUpperCase();
    const nums = (
      rawCmd
        .slice(1)
        .trim()
        .match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || []
    ).map(Number);

    switch (type) {
      case 'M': {
        flushPoly(false);
        pendingFirstHalfCircle = null;
        completedFullCircleInSubpath = false;
        subpathCmdCount = 0;

        for (let i = 0; i + 1 < nums.length; i += 2) {
          const nx = isRel ? curX + nums[i] : nums[i];
          const ny = isRel ? curY + nums[i + 1] : nums[i + 1];
          curX = nx;
          curY = ny;
          if (i === 0) {
            startX = curX;
            startY = curY;
          }
          currentPoly.push(toCadPt(curX, curY));
          subpathCmdCount++;
        }
        break;
      }

      case 'L': {
        pendingFirstHalfCircle = null;
        completedFullCircleInSubpath = false;
        for (let i = 0; i + 1 < nums.length; i += 2) {
          curX = isRel ? curX + nums[i] : nums[i];
          curY = isRel ? curY + nums[i + 1] : nums[i + 1];
          currentPoly.push(toCadPt(curX, curY));
          subpathCmdCount++;
        }
        break;
      }

      case 'H': {
        pendingFirstHalfCircle = null;
        completedFullCircleInSubpath = false;
        for (const xVal of nums) {
          curX = isRel ? curX + xVal : xVal;
          currentPoly.push(toCadPt(curX, curY));
          subpathCmdCount++;
        }
        break;
      }

      case 'V': {
        pendingFirstHalfCircle = null;
        completedFullCircleInSubpath = false;
        for (const yVal of nums) {
          curY = isRel ? curY + yVal : yVal;
          currentPoly.push(toCadPt(curX, curY));
          subpathCmdCount++;
        }
        break;
      }

      case 'A': {
        for (let i = 0; i + 6 < nums.length; i += 7) {
          const rx = Math.abs(nums[i]);
          const ry = Math.abs(nums[i + 1]);
          const phiDeg = nums[i + 2];
          const largeArc = nums[i + 3] !== 0;
          const sweep = nums[i + 4] !== 0;
          const endX = isRel ? curX + nums[i + 5] : nums[i + 5];
          const endY = isRel ? curY + nums[i + 6] : nums[i + 6];

          const isCircular = Math.abs(rx - ry) < 1e-3;
          const chordDist = Math.hypot(endX - curX, endY - curY);

          // Check for 2-arc full circle pattern:
          // Arc 1: right after M, circular, chord ≈ 2*r
          if (
            isCircular &&
            subpathCmdCount === 1 &&
            currentPoly.length === 1 &&
            Math.abs(chordDist - 2 * rx) < 0.05
          ) {
            pendingFirstHalfCircle = {
              startX: curX,
              startY: curY,
              midX: endX,
              midY: endY,
              r: rx,
            };
            curX = endX;
            curY = endY;
            subpathCmdCount++;
            continue;
          }

          // Arc 2 completing the full circle back to startX, startY
          if (
            pendingFirstHalfCircle &&
            isCircular &&
            Math.abs(rx - pendingFirstHalfCircle.r) < 0.05 &&
            Math.hypot(endX - pendingFirstHalfCircle.startX, endY - pendingFirstHalfCircle.startY) < 0.05
          ) {
            const svgCx = (pendingFirstHalfCircle.startX + pendingFirstHalfCircle.midX) / 2;
            const svgCy = (pendingFirstHalfCircle.startY + pendingFirstHalfCircle.midY) / 2;
            const [cadCx, cadCy] = toCadPt(svgCx, svgCy);
            const cadR = pendingFirstHalfCircle.r * scaleFactor;
            if (cadR > 1e-6) {
              primitives.push({
                type: 'circle',
                cx: cadCx,
                cy: cadCy,
                r: cadR,
                filled: isFill,
              });
            }
            pendingFirstHalfCircle = null;
            completedFullCircleInSubpath = true;
            currentPoly = []; // Discard the initial M point so Z doesn't create a stray line
            curX = endX;
            curY = endY;
            subpathCmdCount++;
            continue;
          }

          // If pendingFirstHalfCircle was not followed by a second half-circle, materialize it first
          if (pendingFirstHalfCircle) {
            const [p1x, p1y] = toCadPt(pendingFirstHalfCircle.startX, pendingFirstHalfCircle.startY);
            const [p2x, p2y] = toCadPt(pendingFirstHalfCircle.midX, pendingFirstHalfCircle.midY);
            const prevArc = svgArcToCenterParam({
              x1: p1x,
              y1: p1y,
              rx: pendingFirstHalfCircle.r * scaleFactor,
              ry: pendingFirstHalfCircle.r * scaleFactor,
              phiDeg: 0,
              largeArc: true,
              sweep: false,
              x2: p2x,
              y2: p2y,
            });
            if (prevArc) {
              for (let s = 1; s <= 12; s++) {
                const ang = prevArc.theta1Rad + (prevArc.deltaThetaRad * s) / 12;
                currentPoly.push([
                  prevArc.cx + prevArc.r * Math.cos(ang),
                  prevArc.cy + prevArc.r * Math.sin(ang),
                ]);
              }
            } else {
              currentPoly.push([p2x, p2y]);
            }
            pendingFirstHalfCircle = null;
          }

          // General arc segment
          const [cadX1, cadY1] = toCadPt(curX, curY);
          const [cadX2, cadY2] = toCadPt(endX, endY);
          // Flipping Y inverts the sweep direction and rotation angle
          const centerArc = svgArcToCenterParam({
            x1: cadX1,
            y1: cadY1,
            rx: rx * scaleFactor,
            ry: ry * scaleFactor,
            phiDeg: -phiDeg,
            largeArc,
            sweep: !sweep,
            x2: cadX2,
            y2: cadY2,
          });

          if (centerArc) {
            // If this is a standalone stroke arc (subpath started at M and has no prior line segments),
            // and isn't part of a multi-lobe chain, we can emit a native ARC if it's the only segment,
            // OR sample high-resolution points along the true circular arc for seamless closed polylines (e.g. trees, pie wedges).
            const isStandaloneArc =
              !isFill &&
              isCircular &&
              nums.length === 7 &&
              subpathCmdCount === 1 &&
              currentPoly.length === 1;

            if (isStandaloneArc) {
              currentPoly = [];
              const theta1Deg = normalizeDeg((centerArc.theta1Rad * 180) / Math.PI);
              const theta2Deg = normalizeDeg(
                ((centerArc.theta1Rad + centerArc.deltaThetaRad) * 180) / Math.PI
              );
              const startAngleDeg = centerArc.deltaThetaRad >= 0 ? theta1Deg : theta2Deg;
              const endAngleDeg = centerArc.deltaThetaRad >= 0 ? theta2Deg : theta1Deg;
              primitives.push({
                type: 'arc',
                cx: centerArc.cx,
                cy: centerArc.cy,
                r: centerArc.r,
                startAngleDeg,
                endAngleDeg,
              });
            } else {
              const steps = Math.max(8, Math.ceil((Math.abs(centerArc.deltaThetaRad) / (Math.PI / 2)) * 8));
              for (let s = 1; s <= steps; s++) {
                const ang = centerArc.theta1Rad + (centerArc.deltaThetaRad * s) / steps;
                currentPoly.push([
                  centerArc.cx + centerArc.r * Math.cos(ang),
                  centerArc.cy + centerArc.r * Math.sin(ang),
                ]);
              }
            }
          } else {
            currentPoly.push([cadX2, cadY2]);
          }

          curX = endX;
          curY = endY;
          subpathCmdCount++;
        }
        break;
      }

      case 'Z': {
        if (completedFullCircleInSubpath) {
          completedFullCircleInSubpath = false;
          currentPoly = [];
        } else {
          if (pendingFirstHalfCircle) {
            const [p2x, p2y] = toCadPt(pendingFirstHalfCircle.midX, pendingFirstHalfCircle.midY);
            currentPoly.push([p2x, p2y]);
            pendingFirstHalfCircle = null;
          }
          flushPoly(true);
        }
        curX = startX;
        curY = startY;
        break;
      }
    }
  }

  if (pendingFirstHalfCircle) {
    const [p1x, p1y] = toCadPt(pendingFirstHalfCircle.startX, pendingFirstHalfCircle.startY);
    const [p2x, p2y] = toCadPt(pendingFirstHalfCircle.midX, pendingFirstHalfCircle.midY);
    const centerArc = svgArcToCenterParam({
      x1: p1x,
      y1: p1y,
      rx: pendingFirstHalfCircle.r * scaleFactor,
      ry: pendingFirstHalfCircle.r * scaleFactor,
      phiDeg: 0,
      largeArc: true,
      sweep: false,
      x2: p2x,
      y2: p2y,
    });
    if (centerArc) {
      currentPoly = [];
      const theta1Deg = normalizeDeg((centerArc.theta1Rad * 180) / Math.PI);
      const theta2Deg = normalizeDeg(((centerArc.theta1Rad + centerArc.deltaThetaRad) * 180) / Math.PI);
      primitives.push({
        type: 'arc',
        cx: centerArc.cx,
        cy: centerArc.cy,
        r: centerArc.r,
        startAngleDeg: centerArc.deltaThetaRad >= 0 ? theta1Deg : theta2Deg,
        endAngleDeg: centerArc.deltaThetaRad >= 0 ? theta2Deg : theta1Deg,
      });
    }
    pendingFirstHalfCircle = null;
  }

  flushPoly(false);
  return primitives;
}

/**
 * Extract native CAD primitives (CIRCLE, ARC, LWPOLYLINE, TEXT) from a symbol definition.
 */
export function extractSymbolCadPrimitives(
  symbol: {
    svgPath?: string;
    fillPath?: string;
    texts?: SymbolTextElement[];
    viewBox?: string;
  },
  options: ExtractCadPrimitivesOptions = {}
): CadSymbolPrimitive[] {
  const vbParts = (symbol.viewBox || '0 0 24 24').trim().split(/\s+/).map(Number);
  const [vbX, vbY, vbW, vbH] = vbParts.length === 4 && vbParts.every(n => !isNaN(n))
    ? vbParts
    : [0, 0, 24, 24];

  const centerX = vbX + vbW / 2;
  const centerY = vbY + vbH / 2;
  const viewExtent = Math.max(vbW, vbH) || 24;

  const originX = options.originX ?? 0;
  const originY = options.originY ?? 0;
  const scaleFactor =
    options.worldSize !== undefined
      ? options.worldSize / viewExtent
      : (options.scale ?? 1);

  const toCadPt = (sx: number, sy: number): [number, number] => [
    originX + (sx - centerX) * scaleFactor,
    originY - (sy - centerY) * scaleFactor,
  ];

  const primitives: CadSymbolPrimitive[] = [];

  if (symbol.svgPath) {
    primitives.push(...parsePathToCadPrimitives(symbol.svgPath, toCadPt, scaleFactor, false));
  }

  if (symbol.fillPath) {
    primitives.push(...parsePathToCadPrimitives(symbol.fillPath, toCadPt, scaleFactor, true));
  }

  if (symbol.texts && symbol.texts.length > 0) {
    for (const t of symbol.texts) {
      if (!t.text || !t.text.trim()) continue;
      const [tx, ty] = toCadPt(t.x, t.y);
      // Cap-height in CAD TEXT is ~0.72 of CSS/SVG em-box fontSize
      const textHeight = Math.max(0.01, (t.fontSize || 7) * scaleFactor * 0.72);
      primitives.push({
        type: 'text',
        x: tx,
        y: ty,
        height: textHeight,
        text: t.text,
        rotation: -(t.rotation || 0),
        anchor: t.anchor || 'middle',
      });
    }
  }

  return primitives;
}

/**
 * Serialize extracted CAD primitives directly to raw DXF entity records (for BLOCKS or ENTITIES sections).
 */
export function primitivesToDxfEntities(
  primitives: CadSymbolPrimitive[],
  layer: string = '0'
): string {
  const lines: string[] = [];

  for (const prim of primitives) {
    switch (prim.type) {
      case 'circle': {
        lines.push(
          '0', 'CIRCLE',
          '8', layer,
          '10', prim.cx.toFixed(4),
          '20', prim.cy.toFixed(4),
          '30', '0.0',
          '40', prim.r.toFixed(4)
        );
        break;
      }
      case 'arc': {
        lines.push(
          '0', 'ARC',
          '8', layer,
          '10', prim.cx.toFixed(4),
          '20', prim.cy.toFixed(4),
          '30', '0.0',
          '40', prim.r.toFixed(4),
          '50', prim.startAngleDeg.toFixed(4),
          '51', prim.endAngleDeg.toFixed(4)
        );
        break;
      }
      case 'polyline': {
        if (prim.vertices.length < 2) break;
        lines.push(
          '0', 'LWPOLYLINE',
          '8', layer,
          '90', String(prim.vertices.length),
          '70', prim.closed ? '1' : '0'
        );
        for (const [vx, vy] of prim.vertices) {
          lines.push('10', vx.toFixed(4), '20', vy.toFixed(4));
        }
        break;
      }
      case 'text': {
        const hAlign = prim.anchor === 'start' ? '0' : prim.anchor === 'end' ? '2' : '1';
        lines.push(
          '0', 'TEXT',
          '8', layer,
          '10', prim.x.toFixed(4),
          '20', prim.y.toFixed(4),
          '30', '0.0',
          '40', prim.height.toFixed(4),
          '1', prim.text,
          '50', prim.rotation.toFixed(4),
          '72', hAlign,
          '11', prim.x.toFixed(4),
          '21', prim.y.toFixed(4),
          '31', '0.0',
          '73', '2' // Vertical middle alignment
        );
        break;
      }
    }
  }

  return lines.join('\n');
}

/**
 * Draw extracted CAD primitives onto a `dxf-writer` Drawing or Block instance.
 */
export function drawPrimitivesToDxfWriter(
  target: {
    drawCircle?: (x: number, y: number, r: number) => void;
    drawArc?: (x: number, y: number, r: number, startAngle: number, endAngle: number) => void;
    drawPolyline?: (vertices: Array<[number, number]>, closed?: boolean) => void;
    drawLine?: (x1: number, y1: number, x2: number, y2: number) => void;
    drawText?: (x: number, y: number, height: number, rotation: number, text: string) => void;
  },
  primitives: CadSymbolPrimitive[]
): void {
  for (const prim of primitives) {
    switch (prim.type) {
      case 'circle': {
        if (typeof target.drawCircle === 'function') {
          target.drawCircle(prim.cx, prim.cy, prim.r);
        }
        break;
      }
      case 'arc': {
        if (typeof target.drawArc === 'function') {
          target.drawArc(prim.cx, prim.cy, prim.r, prim.startAngleDeg, prim.endAngleDeg);
        }
        break;
      }
      case 'polyline': {
        if (prim.vertices.length === 2 && !prim.closed && typeof target.drawLine === 'function') {
          target.drawLine(
            prim.vertices[0][0],
            prim.vertices[0][1],
            prim.vertices[1][0],
            prim.vertices[1][1]
          );
        } else if (typeof target.drawPolyline === 'function') {
          target.drawPolyline(prim.vertices, prim.closed);
        }
        break;
      }
      case 'text': {
        if (typeof target.drawText === 'function') {
          // Offset slightly when dxf-writer uses bottom-left baseline if not converted to MTEXT
          target.drawText(prim.x, prim.y, prim.height, prim.rotation, prim.text);
        }
        break;
      }
    }
  }
}
