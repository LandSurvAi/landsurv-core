/**
 * Canvas path coordinates are stored as float32 by the browser, so survey
 * coordinates in the millions quantize to ~0.1 units. At high zoom that shows
 * up as stair-stepped lines and garbage arc/fill geometry. This wrapper
 * subtracts a floating origin from world-space coordinates before they reach
 * the canvas; the caller bakes the origin into the base transform.
 *
 * Shifting is active only while the current transform is still the plain
 * world frame. translate/rotate/scale/transform clear it, since later
 * coordinates are then local to that frame.
 */
export interface FloatingOriginContext {
  ctx: CanvasRenderingContext2D;
  enable: (originX: number, originY: number) => void;
  setShift: (on: boolean) => void;
}

export function createFloatingOriginContext(raw: CanvasRenderingContext2D): FloatingOriginContext {
  let ox = 0;
  let oy = 0;
  let shift = false;
  const stack: boolean[] = [];

  const fns: Record<string, (...a: any[]) => any> = {
    save: () => { stack.push(shift); raw.save(); },
    restore: () => { raw.restore(); shift = stack.length ? stack.pop()! : false; },
    moveTo: (x: number, y: number) => raw.moveTo(shift ? x - ox : x, shift ? y - oy : y),
    lineTo: (x: number, y: number) => raw.lineTo(shift ? x - ox : x, shift ? y - oy : y),
    arc: (x: number, y: number, r: number, s: number, e: number, ccw?: boolean) =>
      raw.arc(shift ? x - ox : x, shift ? y - oy : y, r, s, e, ccw),
    arcTo: (x1: number, y1: number, x2: number, y2: number, r: number) =>
      shift ? raw.arcTo(x1 - ox, y1 - oy, x2 - ox, y2 - oy, r) : raw.arcTo(x1, y1, x2, y2, r),
    ellipse: (x: number, y: number, rx: number, ry: number, rot: number, s: number, e: number, ccw?: boolean) =>
      raw.ellipse(shift ? x - ox : x, shift ? y - oy : y, rx, ry, rot, s, e, ccw),
    rect: (x: number, y: number, w: number, h: number) => raw.rect(shift ? x - ox : x, shift ? y - oy : y, w, h),
    fillRect: (x: number, y: number, w: number, h: number) => raw.fillRect(shift ? x - ox : x, shift ? y - oy : y, w, h),
    strokeRect: (x: number, y: number, w: number, h: number) => raw.strokeRect(shift ? x - ox : x, shift ? y - oy : y, w, h),
    quadraticCurveTo: (cx: number, cy: number, x: number, y: number) =>
      shift ? raw.quadraticCurveTo(cx - ox, cy - oy, x - ox, y - oy) : raw.quadraticCurveTo(cx, cy, x, y),
    bezierCurveTo: (a: number, b: number, c: number, d: number, x: number, y: number) =>
      shift ? raw.bezierCurveTo(a - ox, b - oy, c - ox, d - oy, x - ox, y - oy) : raw.bezierCurveTo(a, b, c, d, x, y),
    fillText: (t: string, x: number, y: number, m?: number) =>
      raw.fillText(t, shift ? x - ox : x, shift ? y - oy : y, m as number),
    strokeText: (t: string, x: number, y: number, m?: number) =>
      raw.strokeText(t, shift ? x - ox : x, shift ? y - oy : y, m as number),
    translate: (x: number, y: number) => {
      if (shift) { raw.translate(x - ox, y - oy); shift = false; } else raw.translate(x, y);
    },
    rotate: (a: number) => { shift = false; raw.rotate(a); },
    scale: (x: number, y: number) => { shift = false; raw.scale(x, y); },
    transform: (a: number, b: number, c: number, d: number, e: number, f: number) => { shift = false; raw.transform(a, b, c, d, e, f); },
    setTransform: (...a: any[]) => { shift = false; (raw.setTransform as any)(...a); },
    resetTransform: () => { shift = false; raw.resetTransform(); },
  };

  const ctx = new Proxy(raw, {
    get(target, prop) {
      if (typeof prop === 'string' && Object.prototype.hasOwnProperty.call(fns, prop)) return fns[prop];
      const v = (target as any)[prop];
      return typeof v === 'function' ? v.bind(target) : v;
    },
    set(target, prop, value) {
      (target as any)[prop] = value;
      return true;
    },
  });

  return {
    ctx,
    enable: (x, y) => { ox = x; oy = y; shift = true; },
    setShift: (on) => { shift = on; },
  };
}
