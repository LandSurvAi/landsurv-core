/**
 * CPU-side batch and WGSL for GPU-drawn CAD linework. Segments are drawn as
 * instanced quads with analytic anti-aliasing, so edges stay sharp at any
 * zoom. Dashes are evaluated in the fragment shader from a pattern table.
 */

export const FLOATS_PER_INSTANCE = 12;
export const MAX_INSTANCES = 600_000;
export const MAX_PATTERNS = 64;
const MAX_DASH_ENTRIES = 8;

export const LINE_SHADER = /* wgsl */ `
struct Globals {
  screen: vec4<f32>,
};
@group(0) @binding(0) var<uniform> g: Globals;
@group(0) @binding(1) var<storage, read> pats: array<vec4<f32>>;

struct VIn {
  @builtin(vertex_index) vi: u32,
  @location(0) seg: vec4<f32>,
  @location(1) color: vec4<f32>,
  @location(2) misc: vec4<f32>,
};

struct VOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) local: vec2<f32>,
  @location(1) @interpolate(flat) len: f32,
  @location(2) @interpolate(flat) color: vec4<f32>,
  @location(3) @interpolate(flat) misc: vec4<f32>,
};

@vertex
fn vs(in: VIn) -> VOut {
  let p0 = in.seg.xy;
  let p1 = in.seg.zw;
  let d = p1 - p0;
  let len = length(d);
  var dir = vec2<f32>(1.0, 0.0);
  if (len > 0.000001) {
    dir = d / len;
  }
  let n = vec2<f32>(-dir.y, dir.x);
  let hw = in.misc.x * 0.5;
  var ext = 1.0;
  if (in.misc.w > 0.5) {
    ext = hw + 1.0;
  }
  var cs = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 0.0), vec2<f32>(1.0, 1.0),
    vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 1.0)
  );
  let c = cs[in.vi];
  let u = mix(-ext, len + ext, c.x);
  let v = mix(-(hw + 1.0), hw + 1.0, c.y);
  let pos = p0 + dir * u + n * v;
  var out: VOut;
  out.pos = vec4<f32>(pos.x / g.screen.x * 2.0 - 1.0, 1.0 - pos.y / g.screen.y * 2.0, 0.0, 1.0);
  out.local = vec2<f32>(u, v);
  out.len = len;
  out.color = in.color;
  out.misc = in.misc;
  return out;
}

@fragment
fn fs(in: VOut) -> @location(0) vec4<f32> {
  let hw = in.misc.x * 0.5;
  let u = in.local.x;
  let v = in.local.y;
  var dist = 0.0;
  if (in.misc.w > 0.5) {
    dist = length(vec2<f32>(u - clamp(u, 0.0, in.len), v));
  } else {
    dist = max(abs(v), max(-u, u - in.len) - 0.5);
  }
  var cov = clamp(hw - dist + 0.5, 0.0, 1.0);

  let pid = u32(in.misc.z);
  if (pid > 0u) {
    let base = pid * 3u;
    let count = u32(pats[base].x);
    let total = pats[base].y;
    let t = u + in.misc.y;
    let m = t - floor(t / total) * total;
    var acc = 0.0;
    var on = 0.0;
    for (var i = 0u; i < count; i = i + 1u) {
      var dl = 0.0;
      if (i < 4u) {
        dl = pats[base + 1u][i];
      } else {
        dl = pats[base + 2u][i - 4u];
      }
      if (i % 2u == 0u) {
        on = max(on, clamp(min(m - acc, acc + dl - m) + 0.5, 0.0, 1.0));
      }
      acc = acc + dl;
    }
    cov = cov * on;
  }

  let a = in.color.a * cov;
  return vec4<f32>(in.color.rgb * a, a);
}
`;

export class GpuLineBatch {
  data = new Float32Array(FLOATS_PER_INSTANCE * 8192);
  count = 0;
  private patterns: number[][] = [[]];
  private patternKeys = new Map<string, number>([['', 0]]);

  reset(): void {
    this.count = 0;
    this.patterns = [[]];
    this.patternKeys = new Map([['', 0]]);
  }

  /** Register a dash pattern (device px); returns -1 if it cannot be drawn on the GPU. */
  patternId(dash: number[]): number {
    if (dash.length === 0) return 0;
    let entries = dash.map(v => Math.max(v, 0.01));
    if (entries.length % 2 === 1) entries = entries.concat(entries);
    if (entries.length > MAX_DASH_ENTRIES) return -1;
    const key = entries.map(v => v.toFixed(3)).join(',');
    const existing = this.patternKeys.get(key);
    if (existing !== undefined) return existing;
    if (this.patterns.length >= MAX_PATTERNS) return -1;
    this.patterns.push(entries);
    const id = this.patterns.length - 1;
    this.patternKeys.set(key, id);
    return id;
  }

  /** Pattern table laid out as three vec4 per pattern: [count,total], [d0..d3], [d4..d7]. */
  writePatternTable(out: Float32Array): void {
    out.fill(0);
    for (let i = 1; i < this.patterns.length; i++) {
      const p = this.patterns[i];
      const o = i * 12;
      out[o] = p.length;
      out[o + 1] = p.reduce((a, b) => a + b, 0);
      for (let j = 0; j < p.length; j++) out[o + 4 + j] = p[j];
    }
  }

  /** Append one segment (device px). Returns false when the batch is full. */
  push(
    x0: number, y0: number, x1: number, y1: number,
    rgba: [number, number, number, number],
    widthPx: number, phasePx: number, pattern: number, round: boolean,
  ): boolean {
    if (this.count >= MAX_INSTANCES) return false;
    if ((this.count + 1) * FLOATS_PER_INSTANCE > this.data.length) {
      const grown = new Float32Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    const o = this.count * FLOATS_PER_INSTANCE;
    const d = this.data;
    d[o] = x0; d[o + 1] = y0; d[o + 2] = x1; d[o + 3] = y1;
    d[o + 4] = rgba[0]; d[o + 5] = rgba[1]; d[o + 6] = rgba[2]; d[o + 7] = rgba[3];
    d[o + 8] = widthPx; d[o + 9] = phasePx; d[o + 10] = pattern; d[o + 11] = round ? 1 : 0;
    this.count++;
    return true;
  }
}

let colorCtx: CanvasRenderingContext2D | null = null;
const colorCache = new Map<string, [number, number, number, number]>();

/** Parse any CSS color to sRGB floats (0..1) via a scratch canvas. */
export function parseCssColor(css: string): [number, number, number, number] {
  const hit = colorCache.get(css);
  if (hit) return hit;
  if (!colorCtx) colorCtx = document.createElement('canvas').getContext('2d');
  let rgba: [number, number, number, number] = [1, 1, 1, 1];
  if (colorCtx) {
    colorCtx.fillStyle = '#000000';
    colorCtx.fillStyle = css;
    const norm = String(colorCtx.fillStyle);
    if (norm.startsWith('#') && norm.length === 7) {
      rgba = [
        parseInt(norm.slice(1, 3), 16) / 255,
        parseInt(norm.slice(3, 5), 16) / 255,
        parseInt(norm.slice(5, 7), 16) / 255,
        1,
      ];
    } else {
      const m = norm.match(/rgba?\(([^)]+)\)/);
      if (m) {
        const p = m[1].split(',').map(s => parseFloat(s));
        rgba = [p[0] / 255, p[1] / 255, p[2] / 255, p.length > 3 ? p[3] : 1];
      }
    }
  }
  if (colorCache.size > 512) colorCache.clear();
  colorCache.set(css, rgba);
  return rgba;
}
