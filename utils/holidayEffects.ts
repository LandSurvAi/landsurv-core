/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Seasonal homepage effects rendered into one full-screen canvas.
 *
 * Christmas: a modern starfield, soft bokeh snowfall and a bright north star.
 * NYE: the same starfield plus smooth additive firework bursts.
 *
 * WebGPU is used when the browser exposes it and Settings → Graphics leaves
 * acceleration on; otherwise the identical particle simulation is drawn with
 * Canvas2D. One canvas replaces the old per-particle DOM layers, so the
 * compositor no longer manages thousands of animated nodes.
 */
import { getGpuPowerPreference, isWebGpuEnabled } from './webgpuBasemap.ts';

export type HolidayEffectsTheme = 'christmas' | 'nye';

export interface HolidayEffectsHandle {
  destroy(): void;
}

type Rgb = readonly [number, number, number];

const FLOATS = 10;
const MAX_INSTANCES = 800;
const MAX_SPARKS = 420;
const FIREWORK_GRAVITY = 64;
const FIREWORK_DRAG = 1.7;

const CHRISTMAS_STAR_COLORS: Rgb[] = [
  [1, 0.97, 0.9],
  [1, 0.93, 0.76],
  [1, 0.85, 0.55],
  [0.8, 0.92, 1],
];

const NYE_STAR_COLORS: Rgb[] = [
  [1, 1, 1],
  [1, 0.95, 0.82],
  [0.58, 0.86, 1],
  [1, 0.6, 0.8],
  [0.78, 0.66, 1],
  [0.6, 1, 0.82],
];

const NYE_BURST_COLORS: Rgb[] = [
  [0.42, 0.85, 1],
  [1, 0.46, 0.72],
  [1, 0.84, 0.4],
  [0.74, 0.58, 1],
  [0.45, 1, 0.76],
  [1, 0.64, 0.36],
];

const GOLD: Rgb = [1, 0.88, 0.58];
const SNOW: Rgb = [0.92, 0.97, 1];

const EFFECT_SHADER = /* wgsl */ `
struct Globals {
  resolution: vec2<f32>,
  _pad: vec2<f32>,
};
@group(0) @binding(0) var<uniform> g: Globals;

struct VIn {
  @builtin(vertex_index) vi: u32,
  @location(0) center: vec2<f32>,
  @location(1) size: f32,
  @location(2) angle: f32,
  @location(3) stretch: f32,
  @location(4) color: vec4<f32>,
  @location(5) shape: f32,
};

struct VOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) local: vec2<f32>,
  @location(1) color: vec4<f32>,
  @location(2) @interpolate(flat) shape: f32,
  @location(3) @interpolate(flat) size: f32,
};

@vertex
fn vs(in: VIn) -> VOut {
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-0.5, -0.5), vec2<f32>(0.5, -0.5), vec2<f32>(0.5, 0.5),
    vec2<f32>(-0.5, -0.5), vec2<f32>(0.5, 0.5), vec2<f32>(-0.5, 0.5)
  );
  let c = corners[in.vi];
  let local = vec2<f32>(c.x * in.stretch, c.y);
  let ca = cos(in.angle);
  let sa = sin(in.angle);
  let rotated = vec2<f32>(local.x * ca - local.y * sa, local.x * sa + local.y * ca);
  let px = in.center + rotated * in.size;
  var out: VOut;
  out.pos = vec4<f32>(px.x / g.resolution.x * 2.0 - 1.0, 1.0 - px.y / g.resolution.y * 2.0, 0.0, 1.0);
  out.local = c * 2.0;
  out.color = in.color;
  out.shape = in.shape;
  out.size = in.size;
  return out;
}

@fragment
fn fs(in: VOut) -> @location(0) vec4<f32> {
  var intensity = 0.0;

  if (in.shape < 0.5) {
    // Snow and fireworks: a soft round bokeh dot.
    let d = length(in.local);
    let falloff = clamp(1.0 - d, 0.0, 1.0);
    intensity = falloff * falloff;
  } else {
    // Stars: a tight core with diffraction spikes, so they never read as snow.
    let d = length(in.local);
    let core = pow(clamp(1.0 - d, 0.0, 1.0), 2.4);
    let width = clamp(2.0 / max(in.size, 1.0), 0.02, 0.09);
    let ax = abs(in.local.x);
    let ay = abs(in.local.y);
    let beamH = (1.0 - smoothstep(0.0, width, ay)) * clamp(1.0 - ax, 0.0, 1.0);
    let beamV = (1.0 - smoothstep(0.0, width, ax)) * clamp(1.0 - ay, 0.0, 1.0);

    let diagonal = 0.70710678;
    let q = vec2<f32>(diagonal * (in.local.x + in.local.y), diagonal * (in.local.y - in.local.x));
    let diagH = (1.0 - smoothstep(0.0, width * 0.85, abs(q.y))) * clamp(1.0 - abs(q.x), 0.0, 1.0);
    let diagV = (1.0 - smoothstep(0.0, width * 0.85, abs(q.x))) * clamp(1.0 - abs(q.y), 0.0, 1.0);

    let crossGain = select(0.8, 1.35, in.shape > 2.5);
    let diagGain = select(0.0, 0.3, in.shape > 1.5);
    intensity = clamp(core + (beamH + beamV) * crossGain + (diagH + diagV) * diagGain, 0.0, 1.0);
  }

  let a = intensity * in.color.a;
  return vec4<f32>(in.color.rgb * a, a);
}
`;

interface Star {
  nx: number;
  ny: number;
  size: number;
  phase: number;
  speed: number;
  color: Rgb;
  baseAlpha: number;
  kind: 'point' | 'bright' | 'north';
  angle: number;
}

interface Snowflake {
  x: number;
  y: number;
  size: number;
  speed: number;
  drift: number;
  phase: number;
  alpha: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  color: Rgb;
}

class HolidaySimulation {
  private readonly theme: HolidayEffectsTheme;
  private stars: Star[] = [];
  private snow: Snowflake[] = [];
  private sparks: Spark[] = [];
  private width = 0;
  private height = 0;
  private elapsed = 0;
  private nextBurst = 0.35;
  private readonly data = new Float32Array(MAX_INSTANCES * FLOATS);

  constructor(theme: HolidayEffectsTheme) {
    this.theme = theme;
    this.seedStars();
  }

  private seedStars(): void {
    const palette = this.theme === 'nye' ? NYE_STAR_COLORS : CHRISTMAS_STAR_COLORS;
    const count = this.theme === 'nye' ? 150 : 140;
    this.stars = Array.from({ length: count }, (_, index) => {
      if (index === 0) {
        return {
          nx: 0.86,
          ny: 0.08,
          size: 60,
          phase: 0,
          speed: 0.9,
          color: GOLD,
          baseAlpha: 1,
          kind: 'north' as const,
          angle: 0,
        };
      }
      const bright = Math.random() < 0.18;
      return {
        nx: Math.random(),
        ny: Math.random(),
        size: bright ? 8 + Math.random() * 8 : 4 + Math.random() * 7,
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 0.9,
        color: palette[Math.floor(Math.random() * palette.length)],
        baseAlpha: bright ? 0.65 + Math.random() * 0.3 : 0.3 + Math.random() * 0.35,
        kind: bright ? 'bright' as const : 'point' as const,
        angle: Math.random() * Math.PI * 2,
      };
    });
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (this.theme !== 'christmas' || width <= 0 || height <= 0 || this.snow.length > 0) return;
    const count = Math.max(42, Math.min(90, Math.round(width / 15)));
    this.snow = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: 3.6 + Math.random() * 10.2,
      speed: 18 + Math.random() * 46,
      drift: 6 + Math.random() * 18,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.18 + Math.random() * 0.32,
    }));
  }

  update(dt: number): void {
    this.elapsed += dt;

    if (this.theme === 'christmas') {
      for (const flake of this.snow) {
        flake.y += flake.speed * dt;
        flake.x += Math.sin(this.elapsed * 0.55 + flake.phase) * flake.drift * dt;
        if (flake.y > this.height + 24) {
          flake.y = -24;
          flake.x = Math.random() * this.width;
        }
        if (flake.x < -24) flake.x = this.width + 24;
        else if (flake.x > this.width + 24) flake.x = -24;
      }
    } else {
      this.nextBurst -= dt;
      if (this.nextBurst <= 0 && this.width > 0 && this.height > 0) {
        this.spawnBurst();
        this.nextBurst = 1.35 + Math.random() * 1.25;
      }
    }

    if (this.sparks.length === 0) return;
    const drag = Math.exp(-FIREWORK_DRAG * dt);
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const spark = this.sparks[i];
      spark.age += dt;
      if (spark.age >= spark.life) {
        this.sparks[i] = this.sparks[this.sparks.length - 1];
        this.sparks.pop();
        continue;
      }
      spark.vx *= drag;
      spark.vy = spark.vy * drag + FIREWORK_GRAVITY * dt;
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
    }
  }

  private spawnBurst(): void {
    const centerX = (0.16 + Math.random() * 0.68) * this.width;
    const centerY = (0.1 + Math.random() * 0.42) * this.height;
    const color = NYE_BURST_COLORS[Math.floor(Math.random() * NYE_BURST_COLORS.length)];
    const available = Math.max(0, MAX_SPARKS - this.sparks.length);
    const count = Math.min(52 + Math.floor(Math.random() * 32), available);

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 55 + Math.pow(Math.random(), 0.65) * 235;
      const white = Math.random() < 0.16;
      this.sparks.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        age: 0,
        life: 1 + Math.random() * 0.9,
        size: 1.5 + Math.random() * 1.8,
        color: white ? [1, 1, 1] : color,
      });
    }

    // Soft core flash at the burst point.
    this.sparks.push({
      x: centerX,
      y: centerY,
      vx: 0,
      vy: 0,
      age: 0,
      life: 0.28,
      size: 46,
      color,
    });
  }

  collect(scale = 1): { data: Float32Array; count: number } {
    const data = this.data;
    let offset = 0;

    const write = (
      x: number,
      y: number,
      size: number,
      angle: number,
      stretch: number,
      color: Rgb,
      alpha: number,
      shape: number,
    ) => {
      if (offset + FLOATS > data.length) return;
      data[offset] = x * scale;
      data[offset + 1] = y * scale;
      data[offset + 2] = size * scale;
      data[offset + 3] = angle;
      data[offset + 4] = stretch;
      data[offset + 5] = color[0];
      data[offset + 6] = color[1];
      data[offset + 7] = color[2];
      data[offset + 8] = alpha;
      data[offset + 9] = shape;
      offset += FLOATS;
    };

    for (const star of this.stars) {
      const x = star.nx * this.width;
      const y = star.ny * this.height;

      if (star.kind === 'north') {
        const pulse = 0.82 + 0.18 * Math.sin(this.elapsed * 0.9);
        const rotation = this.elapsed * 0.08;
        write(x, y, 118, 0, 1, GOLD, 0.1 * pulse, 0);
        write(x, y, 46, 0, 1, GOLD, 0.22 * pulse, 0);
        write(x, y, 62 + Math.sin(this.elapsed * 0.9) * 3, rotation, 1, GOLD, pulse, 3);
        write(x, y, 24, -rotation * 0.6, 1, [1, 1, 1], 0.9, 1);
        continue;
      }

      const wave = 0.5 + 0.5 * Math.sin(this.elapsed * star.speed + star.phase);
      if (star.kind === 'bright') {
        const twinkle = 0.65 + 0.35 * Math.pow(wave, 1.5);
        write(x, y, star.size * 2.5, 0, 1, star.color, 0.12 * twinkle, 0);
        write(x, y, star.size, star.angle, 1, star.color, star.baseAlpha * twinkle, 2);
      } else {
        const twinkle = 0.35 + 0.65 * Math.pow(wave, 3);
        write(x, y, star.size, star.angle, 1, star.color, star.baseAlpha * twinkle, 1);
      }
    }

    for (const flake of this.snow) {
      write(flake.x, flake.y, flake.size, 0, 1, SNOW, flake.alpha, 0);
    }

    for (const spark of this.sparks) {
      const progress = spark.age / spark.life;
      const alpha = Math.pow(Math.max(0, 1 - progress), 1.5) * 0.95;
      const speed = Math.hypot(spark.vx, spark.vy);
      const angle = speed > 1 ? Math.atan2(spark.vy, spark.vx) : 0;
      const stretch = 1 + Math.min(2.8, speed * 0.012);
      write(spark.x, spark.y, spark.size, angle, stretch, spark.color, alpha, 0);
    }

    return { data, count: offset / FLOATS };
  }
}

function setupCanvas(host: HTMLElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:absolute;inset:0;display:block;width:100%;height:100%;pointer-events:none;';
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);
  return canvas;
}

function syncCanvasSize(canvas: HTMLCanvasElement, simulation: HolidaySimulation): number {
  const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
  const width = canvas.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 0);
  const height = canvas.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 0);
  const pixelWidth = Math.max(1, Math.round(width * dpr));
  const pixelHeight = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  simulation.resize(width, height);
  return dpr;
}

function runLoop(
  canvas: HTMLCanvasElement,
  simulation: HolidaySimulation,
  draw: (dpr: number) => void,
): () => void {
  let frameHandle = 0;
  let stopped = false;
  let last = performance.now();

  const frame = (now: number) => {
    if (stopped) return;
    const dt = Math.min(Math.max((now - last) / 1000, 0), 0.05);
    last = now;
    const dpr = syncCanvasSize(canvas, simulation);
    simulation.update(dt);
    draw(dpr);
    frameHandle = requestAnimationFrame(frame);
  };

  frameHandle = requestAnimationFrame(frame);
  return () => {
    stopped = true;
    cancelAnimationFrame(frameHandle);
  };
}

async function createGpuPainter(
  host: HTMLElement,
  theme: HolidayEffectsTheme,
): Promise<HolidayEffectsHandle | null> {
  if (!isWebGpuEnabled() || typeof navigator === 'undefined') return null;
  const gpu = (navigator as any).gpu;
  if (!gpu) return null;

  let canvas: HTMLCanvasElement | null = null;
  let device: any = null;

  try {
    const adapter = await gpu.requestAdapter({ powerPreference: getGpuPowerPreference() });
    if (!adapter) return null;
    device = await adapter.requestDevice();

    const module = device.createShaderModule({ code: EFFECT_SHADER });
    if (typeof module.getCompilationInfo === 'function') {
      const info = await module.getCompilationInfo();
      const errors = (info.messages || []).filter((message: any) => message.type === 'error');
      if (errors.length > 0) {
        throw new Error(
          errors.map((error: any) => `${error.lineNum}:${error.linePos} ${error.message}`).join('; '),
        );
      }
    }

    const format = gpu.getPreferredCanvasFormat();
    const pipeline = await device.createRenderPipelineAsync({
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: FLOATS * 4,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' },
              { shaderLocation: 1, offset: 8, format: 'float32' },
              { shaderLocation: 2, offset: 12, format: 'float32' },
              { shaderLocation: 3, offset: 16, format: 'float32' },
              { shaderLocation: 4, offset: 20, format: 'float32x4' },
              { shaderLocation: 5, offset: 36, format: 'float32' },
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [
          {
            format,
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    });

    const uniformBuffer = device.createBuffer({ size: 16, usage: 0x40 | 0x08 });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });
    const instanceBuffer = device.createBuffer({
      size: MAX_INSTANCES * FLOATS * 4,
      usage: 0x20 | 0x08,
    });

    canvas = setupCanvas(host);
    const context = canvas.getContext('webgpu') as any;
    if (!context) {
      canvas.remove();
      device.destroy();
      return null;
    }
    context.configure({ device, format, alphaMode: 'premultiplied' });

    const simulation = new HolidaySimulation(theme);
    const uniformData = new Float32Array(4);
    let disposed = false;

    device.addEventListener?.('uncapturederror', (event: any) => {
      console.warn('[HolidayEffects] WebGPU validation error:', event.error?.message ?? event.error);
    });
    device.lost?.then(() => {
      if (!disposed) console.warn('[HolidayEffects] WebGPU device lost; effects stopped.');
    });

    const stop = runLoop(canvas, simulation, (dpr) => {
      if (!canvas || disposed) return;
      const width = canvas.width;
      const height = canvas.height;
      if (!width || !height) return;

      uniformData[0] = width;
      uniformData[1] = height;
      device.queue.writeBuffer(uniformBuffer, 0, uniformData);

      const { data, count } = simulation.collect(dpr);
      const instances = Math.min(count, MAX_INSTANCES);
      device.queue.writeBuffer(instanceBuffer, 0, data.subarray(0, instances * FLOATS));

      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.setVertexBuffer(0, instanceBuffer);
      pass.draw(6, instances);
      pass.end();
      device.queue.submit([encoder.finish()]);
    });

    console.info('[HolidayEffects] WebGPU particle renderer active.');
    return {
      destroy() {
        disposed = true;
        stop();
        canvas?.remove();
        try {
          device.destroy();
        } catch {
          /* already lost */
        }
      },
    };
  } catch (error) {
    canvas?.remove();
    try {
      device?.destroy();
    } catch {
      /* already lost */
    }
    console.warn('[HolidayEffects] WebGPU unavailable, using Canvas2D:', error);
    return null;
  }
}

function createCanvas2DPainter(host: HTMLElement, theme: HolidayEffectsTheme): HolidayEffectsHandle {
  const canvas = setupCanvas(host);
  const context = canvas.getContext('2d');
  const simulation = new HolidaySimulation(theme);
  if (!context) {
    canvas.remove();
    return { destroy() {} };
  }

  const sprites = new Map<string, HTMLCanvasElement>();
  const spriteFor = (red: number, green: number, blue: number): HTMLCanvasElement => {
    const r = Math.round(Math.max(0, Math.min(1, red)) * 255);
    const g = Math.round(Math.max(0, Math.min(1, green)) * 255);
    const b = Math.round(Math.max(0, Math.min(1, blue)) * 255);
    const key = `${r},${g},${b}`;
    const cached = sprites.get(key);
    if (cached) return cached;

    const sprite = document.createElement('canvas');
    sprite.width = 64;
    sprite.height = 64;
    const spriteContext = sprite.getContext('2d');
    if (spriteContext) {
      const gradient = spriteContext.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, `rgba(${r},${g},${b},1)`);
      gradient.addColorStop(0.35, `rgba(${r},${g},${b},0.55)`);
      gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
      spriteContext.fillStyle = gradient;
      spriteContext.fillRect(0, 0, 64, 64);
    }
    sprites.set(key, sprite);
    return sprite;
  };

  const stop = runLoop(canvas, simulation, (dpr) => {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.globalCompositeOperation = 'lighter';

    const { data, count } = simulation.collect(1);
    for (let i = 0; i < count; i++) {
      const offset = i * FLOATS;
      const alpha = data[offset + 8];
      const size = data[offset + 2];
      if (alpha <= 0 || size <= 0) continue;

      const red = data[offset + 5];
      const green = data[offset + 6];
      const blue = data[offset + 7];
      const shape = data[offset + 9];

      context.save();
      context.translate(data[offset], data[offset + 1]);
      context.rotate(data[offset + 3]);

      if (shape < 0.5) {
        context.scale((size * data[offset + 4]) / 64, size / 64);
        context.globalAlpha = Math.min(1, alpha);
        context.drawImage(spriteFor(red, green, blue), -32, -32, 64, 64);
      } else {
        const r = Math.round(red * 255);
        const g = Math.round(green * 255);
        const b = Math.round(blue * 255);
        const half = (size * data[offset + 4]) / 2;
        context.globalAlpha = Math.min(1, alpha * 0.9);
        context.strokeStyle = `rgba(${r},${g},${b},1)`;
        context.lineWidth = shape >= 2.5 ? 1.4 : 0.8;
        context.beginPath();
        context.moveTo(-half, 0);
        context.lineTo(half, 0);
        context.moveTo(0, -size / 2);
        context.lineTo(0, size / 2);
        if (shape >= 1.5) {
          const diagonal = half * 0.62;
          context.moveTo(-diagonal, -diagonal);
          context.lineTo(diagonal, diagonal);
          context.moveTo(-diagonal, diagonal);
          context.lineTo(diagonal, -diagonal);
        }
        context.stroke();

        const glowSize = size * 0.55;
        context.scale((glowSize * data[offset + 4]) / 64, glowSize / 64);
        context.globalAlpha = Math.min(1, alpha);
        context.drawImage(spriteFor(red, green, blue), -32, -32, 64, 64);
      }

      context.restore();
    }

    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
  });

  console.info('[HolidayEffects] Canvas2D fallback active.');
  return {
    destroy() {
      stop();
      canvas.remove();
      sprites.clear();
    },
  };
}

/** Mounts the seasonal effects and resolves once a renderer is running. */
export async function mountHolidayEffects(
  host: HTMLElement,
  theme: HolidayEffectsTheme,
): Promise<HolidayEffectsHandle> {
  const gpu = await createGpuPainter(host, theme);
  if (gpu) return gpu;
  return createCanvas2DPainter(host, theme);
}
