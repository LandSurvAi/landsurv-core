/**
 * CPU-side batch and WGSL for GPU-drawn survey points. Compressed point cells
 * are expanded into instanced screen-space quads, so a dense cloud is one draw
 * call instead of thousands of Canvas2D operations.
 */

export const FLOATS_PER_POINT = 8;
export const MAX_POINTS = 600_000;

export const POINT_SHADER = /* wgsl */ `
struct Globals {
  screen: vec4<f32>,
};
@group(0) @binding(0) var<uniform> g: Globals;

struct VIn {
  @builtin(vertex_index) vi: u32,
  @location(0) rect: vec4<f32>,
  @location(1) color: vec4<f32>,
};

struct VOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) @interpolate(flat) color: vec4<f32>,
  @location(1) local: vec2<f32>,
};

@vertex
fn vs(in: VIn) -> VOut {
  var cs = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0),
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, 1.0), vec2<f32>(-1.0, 1.0)
  );
  let c = cs[in.vi];
  let half = in.rect.z * 0.5;
  let p = in.rect.xy + c * half;
  var out: VOut;
  out.pos = vec4<f32>(p.x / g.screen.x * 2.0 - 1.0, 1.0 - p.y / g.screen.y * 2.0, 0.0, 1.0);
  out.color = in.color;
  out.local = c;
  return out;
}

@fragment
fn fs(in: VOut) -> @location(0) vec4<f32> {
  let r = length(in.local);
  let cov = 1.0 - smoothstep(0.82, 1.0, r);
  let a = in.color.a * cov;
  return vec4<f32>(in.color.rgb * a, a);
}
`;

export class GpuPointBatch {
  data = new Float32Array(FLOATS_PER_POINT * 8192);
  count = 0;

  reset(): void {
    this.count = 0;
  }

  /** Append one screen-space dot (CSS px). Returns false when the batch is full. */
  push(
    x: number,
    y: number,
    size: number,
    rgba: [number, number, number, number],
  ): boolean {
    if (this.count >= MAX_POINTS) return false;
    if ((this.count + 1) * FLOATS_PER_POINT > this.data.length) {
      const grown = new Float32Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    const o = this.count * FLOATS_PER_POINT;
    const d = this.data;
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = Math.max(1, size);
    d[o + 3] = 0;
    d[o + 4] = rgba[0];
    d[o + 5] = rgba[1];
    d[o + 6] = rgba[2];
    d[o + 7] = rgba[3];
    this.count++;
    return true;
  }
}
