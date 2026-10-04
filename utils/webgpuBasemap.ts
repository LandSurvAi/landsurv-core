/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WebGPU renderer for the 2D CAD canvas: basemap imagery (NAIP/Google/WMS/offline)
 * as textured quads, plus instanced anti-aliased linework. Geometry is projected
 * on the CPU in double precision, so large survey coordinates never reach the GPU.
 */

import { FLOATS_PER_INSTANCE, LINE_SHADER, MAX_INSTANCES, MAX_PATTERNS, GpuLineBatch } from './webgpuLines.ts';

export { GpuLineBatch, parseCssColor } from './webgpuLines.ts';

export type BasemapSource = HTMLImageElement | ImageBitmap;

/** Corners in world coordinates: top-left, top-right, bottom-right, bottom-left. */
export type WorldQuad = [[number, number], [number, number], [number, number], [number, number]];

export interface BasemapLayer {
  source: BasemapSource;
  bbox: [number, number, number, number];
  /** When set, the image is warped onto this quad instead of the axis-aligned bbox. */
  quad?: WorldQuad;
  opacity: number;
}

export interface BasemapView {
  width: number;
  height: number;
  /** World (easting, northing) to CSS-pixel screen position. */
  project: (e: number, n: number) => { x: number; y: number };
}

const SHADER = /* wgsl */ `
struct Params {
  c01: vec4<f32>,
  c23: vec4<f32>,
  screen: vec4<f32>,
  opacity: vec4<f32>,
};
@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  var uvs = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 0.0), vec2<f32>(1.0, 1.0),
    vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 1.0)
  );
  let uv = uvs[i];
  let top = mix(p.c01.xy, p.c01.zw, uv.x);
  let bottom = mix(p.c23.zw, p.c23.xy, uv.x);
  let px = mix(top, bottom, uv.y);
  var out: VSOut;
  out.pos = vec4<f32>(px.x / p.screen.x * 2.0 - 1.0, 1.0 - px.y / p.screen.y * 2.0, 0.0, 1.0);
  out.uv = uv;
  return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  return textureSample(tex, samp, in.uv) * p.opacity.x;
}
`;

const MAX_TEXTURES = 64;

interface TexEntry {
  texture: any;
  width: number;
  height: number;
  lastFrame: number;
}

interface Slot {
  buffer: any;
  bindGroup: any;
  texture: any;
}

export class WebGpuBasemap {
  private device: any;
  private context: any;
  private pipeline: any;
  private sampler: any;
  private linePipeline: any;
  private lineGlobals: any;
  private linePatterns: any;
  private lineBindGroup: any;
  private lineBuffer: any = null;
  private lineBufferCapacity = 0;
  private patternScratch = new Float32Array(MAX_PATTERNS * 12);
  readonly lineBatch = new GpuLineBatch();
  private textures = new Map<BasemapSource, TexEntry>();
  private slots: Slot[] = [];
  private frame = 0;
  private _ready = true;

  private constructor(device: any, context: any, pipeline: any, sampler: any, linePipeline: any) {
    this.device = device;
    this.context = context;
    this.pipeline = pipeline;
    this.sampler = sampler;
    this.linePipeline = linePipeline;
    this.lineGlobals = device.createBuffer({ size: 16, usage: 0x40 | 0x08 });
    this.linePatterns = device.createBuffer({ size: MAX_PATTERNS * 12 * 4, usage: 0x80 | 0x08 });
    this.lineBindGroup = device.createBindGroup({
      layout: linePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.lineGlobals } },
        { binding: 1, resource: { buffer: this.linePatterns } },
      ],
    });
  }

  get ready(): boolean {
    return this._ready;
  }

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!(navigator as any).gpu;
  }

  /** Resolves to null when WebGPU is unavailable or setup fails. */
  static async create(canvas: HTMLCanvasElement, onLost: () => void): Promise<WebGpuBasemap | null> {
    if (!WebGpuBasemap.isSupported()) return null;
    try {
      const gpu = (navigator as any).gpu;
      const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) return null;
      const device = await adapter.requestDevice();
      const context = canvas.getContext('webgpu') as any;
      if (!context) return null;
      const format = gpu.getPreferredCanvasFormat();
      context.configure({ device, format, alphaMode: 'premultiplied' });

      const module = device.createShaderModule({ code: SHADER });
      const lineModule = device.createShaderModule({ code: LINE_SHADER });
      for (const [name, m] of [['basemap', module], ['lines', lineModule]] as const) {
        const info = await m.getCompilationInfo();
        const errors = info.messages.filter((msg: any) => msg.type === 'error');
        if (errors.length) {
          throw new Error(`${name} shader: ${errors.map((e: any) => `${e.lineNum}:${e.linePos} ${e.message}`).join('; ')}`);
        }
      }
      const pipeline = await device.createRenderPipelineAsync({
        layout: 'auto',
        vertex: { module, entryPoint: 'vs' },
        fragment: {
          module,
          entryPoint: 'fs',
          targets: [{
            format,
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          }],
        },
        primitive: { topology: 'triangle-list' },
      });
      const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

      const linePipeline = await device.createRenderPipelineAsync({
        layout: 'auto',
        vertex: {
          module: lineModule,
          entryPoint: 'vs',
          buffers: [{
            arrayStride: FLOATS_PER_INSTANCE * 4,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x4' },
              { shaderLocation: 1, offset: 16, format: 'float32x4' },
              { shaderLocation: 2, offset: 32, format: 'float32x4' },
            ],
          }],
        },
        fragment: {
          module: lineModule,
          entryPoint: 'fs',
          targets: [{
            format,
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          }],
        },
        primitive: { topology: 'triangle-list' },
      });

      const renderer = new WebGpuBasemap(device, context, pipeline, sampler, linePipeline);
      device.addEventListener('uncapturederror', (ev: any) => {
        console.error('[WebGPU] Validation error, falling back to Canvas2D:', ev.error?.message ?? ev.error);
        renderer._ready = false;
        onLost();
      });
      device.lost.then(() => {
        renderer._ready = false;
        onLost();
      });
      console.info('[WebGPU] Basemap + linework renderer active');
      return renderer;
    } catch (err) {
      console.warn('[WebGPU] Basemap renderer unavailable, using Canvas2D:', err);
      return null;
    }
  }

  private sourceSize(source: BasemapSource): { w: number; h: number } {
    if (typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement) {
      return { w: source.naturalWidth, h: source.naturalHeight };
    }
    return { w: (source as ImageBitmap).width, h: (source as ImageBitmap).height };
  }

  private textureFor(source: BasemapSource): TexEntry | null {
    const existing = this.textures.get(source);
    if (existing) {
      existing.lastFrame = this.frame;
      return existing;
    }
    const { w, h } = this.sourceSize(source);
    const max = this.device.limits?.maxTextureDimension2D ?? 8192;
    if (w < 1 || h < 1 || w > max || h > max) return null;

    if (this.textures.size >= MAX_TEXTURES) {
      for (const [key, entry] of this.textures) {
        if (entry.lastFrame !== this.frame) {
          entry.texture.destroy();
          this.textures.delete(key);
          if (this.textures.size < MAX_TEXTURES) break;
        }
      }
      if (this.textures.size >= MAX_TEXTURES) return null;
    }

    const texture = this.device.createTexture({
      size: [w, h],
      format: 'rgba8unorm',
      usage: 0x04 /* TEXTURE_BINDING */ | 0x02 /* COPY_DST */ | 0x10 /* RENDER_ATTACHMENT */,
    });
    this.device.queue.copyExternalImageToTexture(
      { source },
      { texture, premultipliedAlpha: true },
      [w, h],
    );
    const entry: TexEntry = { texture, width: w, height: h, lastFrame: this.frame };
    this.textures.set(source, entry);
    return entry;
  }

  private slot(index: number, texture: any): Slot {
    let slot = this.slots[index];
    if (!slot) {
      const buffer = this.device.createBuffer({ size: 64, usage: 0x40 /* UNIFORM */ | 0x08 /* COPY_DST */ });
      slot = { buffer, bindGroup: null, texture: null };
      this.slots[index] = slot;
    }
    if (slot.texture !== texture) {
      slot.bindGroup = this.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: slot.buffer } },
          { binding: 1, resource: this.sampler },
          { binding: 2, resource: texture.createView() },
        ],
      });
      slot.texture = texture;
    }
    return slot;
  }

  render(layers: BasemapLayer[], view: BasemapView, lines?: GpuLineBatch | null): void {
    if (!this._ready) return;
    this.frame++;
    try {
      const encoder = this.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        }],
      });
      pass.setPipeline(this.pipeline);

      let used = 0;
      for (const layer of layers) {
        if (!(layer.opacity > 0)) continue;
        const tex = this.textureFor(layer.source);
        if (!tex) continue;
        const [minE, minN, maxE, maxN] = layer.bbox;
        const q = layer.quad;
        const tl = q ? view.project(q[0][0], q[0][1]) : view.project(minE, maxN);
        const tr = q ? view.project(q[1][0], q[1][1]) : view.project(maxE, maxN);
        const br = q ? view.project(q[2][0], q[2][1]) : view.project(maxE, minN);
        const bl = q ? view.project(q[3][0], q[3][1]) : view.project(minE, minN);
        const slot = this.slot(used++, tex.texture);
        this.device.queue.writeBuffer(slot.buffer, 0, new Float32Array([
          tl.x, tl.y, tr.x, tr.y,
          br.x, br.y, bl.x, bl.y,
          view.width, view.height, 0, 0,
          layer.opacity, 0, 0, 0,
        ]));
        pass.setBindGroup(0, slot.bindGroup);
        pass.draw(6);
      }

      if (lines && lines.count > 0) {
        const needed = lines.count * FLOATS_PER_INSTANCE * 4;
        if (!this.lineBuffer || this.lineBufferCapacity < needed) {
          this.lineBuffer?.destroy();
          this.lineBufferCapacity = Math.min(
            Math.max(needed, 1 << 20) * 2,
            MAX_INSTANCES * FLOATS_PER_INSTANCE * 4,
          );
          this.lineBuffer = this.device.createBuffer({ size: this.lineBufferCapacity, usage: 0x20 | 0x08 });
        }
        this.device.queue.writeBuffer(this.lineBuffer, 0, lines.data.buffer, 0, needed);
        lines.writePatternTable(this.patternScratch);
        this.device.queue.writeBuffer(this.linePatterns, 0, this.patternScratch);
        const canvas = this.context.canvas as HTMLCanvasElement;
        this.device.queue.writeBuffer(this.lineGlobals, 0, new Float32Array([canvas.width, canvas.height, 0, 0]));
        pass.setPipeline(this.linePipeline);
        pass.setBindGroup(0, this.lineBindGroup);
        pass.setVertexBuffer(0, this.lineBuffer);
        pass.draw(6, lines.count);
      }
      pass.end();
      this.device.queue.submit([encoder.finish()]);
    } catch (err) {
      console.warn('[WebGPU] Basemap render failed, falling back to Canvas2D:', err);
      this._ready = false;
    }
  }

  dispose(): void {
    this._ready = false;
    for (const entry of this.textures.values()) entry.texture.destroy();
    this.textures.clear();
    for (const slot of this.slots) slot?.buffer?.destroy();
    this.slots = [];
    this.lineBuffer?.destroy();
    this.lineGlobals?.destroy();
    this.linePatterns?.destroy();
    try {
      this.context.unconfigure();
    } catch {
      /* already torn down */
    }
    try {
      this.device.destroy();
    } catch {
      /* already lost */
    }
  }
}
