import {
  Color3,
  Constants,
  CubeTexture,
  DynamicTexture,
  PBRMaterial,
  RawCubeTexture,
  RawTexture,
  Scene,
  StandardMaterial,
  Texture,
} from '@babylonjs/core';

/**
 * Resolves the highest supported hardware anisotropic filtering level (up to 16x),
 * falling back to 16 when running under NullEngine or headless test contexts.
 */
export function getMaxAnisotropy(scene: Scene): number {
  const capsMax = scene.getEngine()?.getCaps?.()?.maxAnisotropy ?? 16;
  return Math.max(8, Math.min(16, capsMax || 16));
}

function configureAnisotropicTexture(tex: Texture, scene: Scene, uScale = 1, vScale = 1, clampEdge = false): void {
  tex.updateSamplingMode(Texture.TRILINEAR_SAMPLINGMODE);
  tex.anisotropicFilteringLevel = getMaxAnisotropy(scene);
  tex.uScale = uScale;
  tex.vScale = vScale;
  tex.wrapU = clampEdge ? Texture.CLAMP_ADDRESSMODE : Texture.WRAP_ADDRESSMODE;
  tex.wrapV = clampEdge ? Texture.CLAMP_ADDRESSMODE : Texture.WRAP_ADDRESSMODE;
}

function createCanvasTextureSafe(
  scene: Scene,
  name: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): Texture {
  if (scene.getEngine()?.getClassName?.() === 'NullEngine') {
    const fallback = RawTexture.CreateRGBATexture(
      new Uint8Array([14, 32, 51, 255]),
      1,
      1,
      scene,
      true,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    fallback.name = name;
    configureAnisotropicTexture(fallback, scene, 1, 1, true);
    return fallback;
  }

  const tex = new DynamicTexture(name, { width, height }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D | null;
  if (ctx) {
    draw(ctx);
  }
  tex.update(true);
  configureAnisotropicTexture(tex, scene, 1, 1, true);
  return tex;
}

/**
 * Deterministic hash for procedural micro-surface grain (casting sand, powder coat, polymer).
 */
function hash2D(x: number, y: number, seed = 1337): number {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function smoothNoise2D(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y0 = ((yi % period) + period) % period;
  const y1 = (y0 + 1) % period;

  const n00 = hash2D(x0, y0, seed);
  const n10 = hash2D(x1, y0, seed);
  const n01 = hash2D(x0, y1, seed);
  const n11 = hash2D(x1, y1, seed);

  const nx0 = n00 + (n10 - n00) * u;
  const nx1 = n01 + (n11 - n01) * u;
  return nx0 + (nx1 - nx0) * v;
}

/**
 * Converts a tileable scalar heightfield [0..1] into a tangent-space RGBA normal map
 * with full trilinear mipmaps and hardware anisotropic filtering.
 */
function buildNormalMapFromHeight(
  scene: Scene,
  name: string,
  size: number,
  strength: number,
  heightFn: (u: number, v: number, px: number, py: number) => number,
  uScale = 1,
  vScale = 1,
): RawTexture {
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      heights[y * size + x] = heightFn(u, v, x, y);
    }
  }

  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;

      const dX = (heights[y * size + xp] - heights[y * size + xm]) * strength;
      const dY = (heights[yp * size + x] - heights[ym * size + x]) * strength;

      let nx = -dX;
      let ny = -dY;
      let nz = 1.0;
      const invLen = 1 / Math.hypot(nx, ny, nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;

      const idx = (y * size + x) * 4;
      data[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }

  const tex = RawTexture.CreateRGBATexture(
    data,
    size,
    size,
    scene,
    true,
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  tex.name = name;
  configureAnisotropicTexture(tex, scene, uScale, vScale, false);
  return tex;
}

/**
 * Creates a lightweight procedural outdoor sky + horizon + ground-bounce cubemap
 * so PBR metallic, anodized aluminum, magnesium, and multi-coated glass lenses
 * exhibit crisp specular reflections at all grazing angles without external HDR assets.
 */
export function createSurveyEnvironmentCubeTexture(scene: Scene): CubeTexture | null {
  try {
    const size = 64;
    const faces: Uint8Array[] = [];
    const sunDir = { x: 0.46, y: 0.78, z: -0.42 };
    const sunLen = Math.hypot(sunDir.x, sunDir.y, sunDir.z);
    sunDir.x /= sunLen;
    sunDir.y /= sunLen;
    sunDir.z /= sunLen;

    // Babylon cube face order: +X, -X, +Y, -Y, +Z, -Z
    const faceDir = (face: number, s: number, t: number): [number, number, number] => {
      switch (face) {
        case 0: return [1, -t, -s];
        case 1: return [-1, -t, s];
        case 2: return [s, 1, t];
        case 3: return [s, -1, -t];
        case 4: return [s, -t, 1];
        default: return [-s, -t, -1];
      }
    };

    for (let f = 0; f < 6; f++) {
      const buf = new Uint8Array(size * size * 4);
      for (let y = 0; y < size; y++) {
        const t = (y / (size - 1)) * 2 - 1;
        for (let x = 0; x < size; x++) {
          const s = (x / (size - 1)) * 2 - 1;
          const [dx, dy, dz] = faceDir(f, s, t);
          const len = Math.hypot(dx, dy, dz);
          const nx = dx / len;
          const ny = dy / len;
          const nz = dz / len;

          let r: number;
          let g: number;
          let b: number;

          if (ny >= 0) {
            // Sky hemisphere: deep survey-blue zenith to crisp bright horizon band
            const h = Math.pow(1 - ny, 2.4);
            r = 0.16 + h * 0.56;
            g = 0.30 + h * 0.52;
            b = 0.48 + h * 0.44;

            const sunDot = Math.max(0, nx * sunDir.x + ny * sunDir.y + nz * sunDir.z);
            const sunGlow = Math.pow(sunDot, 28) * 0.75 + Math.pow(sunDot, 6) * 0.18;
            r = Math.min(1, r + sunGlow * 1.0);
            g = Math.min(1, g + sunGlow * 0.96);
            b = Math.min(1, b + sunGlow * 0.86);
          } else {
            // Ground bounce: subtle warm earth/slate bounce with horizon rim
            const gnd = Math.min(1, -ny);
            const horizonMix = Math.pow(1 - gnd, 3.0);
            r = 0.14 + horizonMix * 0.36;
            g = 0.17 + horizonMix * 0.38;
            b = 0.21 + horizonMix * 0.40;
          }

          const idx = (y * size + x) * 4;
          buf[idx] = Math.round(Math.min(1, Math.max(0, r)) * 255);
          buf[idx + 1] = Math.round(Math.min(1, Math.max(0, g)) * 255);
          buf[idx + 2] = Math.round(Math.min(1, Math.max(0, b)) * 255);
          buf[idx + 3] = 255;
        }
      }
      faces.push(buf);
    }

    const cube = new RawCubeTexture(
      scene,
      faces,
      size,
      Constants.TEXTUREFORMAT_RGBA,
      Constants.TEXTURETYPE_UNSIGNED_BYTE,
      true,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    cube.name = 'survey-studio-env-cube';
    return cube;
  } catch {
    return null;
  }
}

export interface SurveyMaterialKit {
  // Bump / Normal & Albedo textures
  castGrainNormal: RawTexture;
  knurlNormal: RawTexture;
  brushedMetalNormal: RawTexture;
  rubberRibNormal: RawTexture;
  carbonWeaveAlbedo: RawTexture;
  carbonWeaveNormal: RawTexture;
  fiberglassGrainNormal: RawTexture;

  // Shared high-grade PBR materials
  castMagnesiumDark: PBRMaterial;
  castAnthracite: PBRMaterial;
  matteGraphite: PBRMaterial;
  machinedAluminum: PBRMaterial;
  hardenedSteel: PBRMaterial;
  brassHardware: PBRMaterial;
  knurledSteel: PBRMaterial;
  knurledBlackAnodized: PBRMaterial;
  safetyYellowCoat: PBRMaterial;
  safetyOrangeCoat: PBRMaterial;
  leicaTealSlate: PBRMaterial;
  rubberGrip: PBRMaterial;
  carbonFiberWeave: PBRMaterial;
  radomeMatteWhite: PBRMaterial;
  objectiveLensGlass: PBRMaterial;
  prismCornerCubeGlass: PBRMaterial;
  prismCopperCoat: PBRMaterial;
  spiritBubbleVial: PBRMaterial;
  screenCoverGlass: PBRMaterial;
}

const sceneKitCache = new WeakMap<Scene, SurveyMaterialKit>();

/**
 * Builds (and caches per Scene) a complete physically-based material & bump-map
 * library for all Raw Replay 3D survey instruments.
 */
export function getSurveyMaterialKit(scene: Scene): SurveyMaterialKit {
  const cached = sceneKitCache.get(scene);
  if (cached) return cached;

  // 1. Cast magnesium / powder-coat micro-pebble normal map
  const castGrainNormal = buildNormalMapFromHeight(
    scene,
    'tex-normal-cast-magnesium',
    128,
    1.65,
    (_u, _v, x, y) => {
      const fine = hash2D(x, y, 101) * 0.55;
      const med = smoothNoise2D(x * 0.5, y * 0.5, 64, 202) * 0.45;
      return fine + med;
    },
    6,
    6,
  );

  // 2. Precision diamond-knurled thumbscrew / focus-ring normal map
  const knurlNormal = buildNormalMapFromHeight(
    scene,
    'tex-normal-diamond-knurl',
    128,
    3.2,
    (u, v) => {
      const freqU = 32;
      const freqV = 10;
      const d1 = Math.abs(Math.sin((u * freqU + v * freqV) * Math.PI));
      const d2 = Math.abs(Math.sin((u * freqU - v * freqV) * Math.PI));
      return Math.pow(d1 * d2, 0.65);
    },
    2,
    1,
  );

  // 3. Brushed anodized aluminum / stainless lathe-turned grain normal map
  const brushedMetalNormal = buildNormalMapFromHeight(
    scene,
    'tex-normal-brushed-metal',
    128,
    1.35,
    (u, _v, x, y) => {
      const streak = smoothNoise2D(x * 0.12, y * 1.8, 16, 303) * 0.7;
      const micro = Math.sin(u * Math.PI * 64) * 0.15 + hash2D(x, y, 404) * 0.15;
      return streak + micro;
    },
    3,
    3,
  );

  // 4. Molded TPU elastomer ribbed bumper / handle grip normal map
  const rubberRibNormal = buildNormalMapFromHeight(
    scene,
    'tex-normal-tpu-ribs',
    128,
    2.6,
    (u, v, x, y) => {
      const rib = 0.5 + 0.5 * Math.cos(v * Math.PI * 28);
      const stipple = hash2D(x, y, 505) * 0.22;
      const groove = Math.pow(rib, 0.6) * 0.78 + Math.sin(u * Math.PI * 8) * 0.04;
      return groove + stipple;
    },
    2,
    2,
  );

  // 5. 3K 2x2 Twill Carbon-Fiber Weave Albedo + Tangent-Space Normal Map
  // High-contrast diagonal twill staircase weave + glossy epoxy clear-coat so
  // cylindrical GNSS poles read unmistakably as woven carbon fiber at all zoom levels.
  const cfSize = 256;
  const cfAlbedoBytes = new Uint8Array(cfSize * cfSize * 4);
  const carbonWeaveNormal = buildNormalMapFromHeight(
    scene,
    'tex-normal-carbon-3k',
    cfSize,
    3.8,
    (_u, _v, x, y) => {
      const cell = 16; // 16px per tow -> bold, readable 2x2 diagonal twill weave
      const tx = Math.floor(x / cell);
      const ty = Math.floor(y / cell);
      const lx = (x % cell) / cell;
      const ly = (y % cell) / cell;
      const phase = ((tx + ty) % 4 + 4) % 4;
      const isWarpOver = phase === 0 || phase === 1;

      // Edge gap between adjacent carbon tows
      const edgeMask = Math.min(
        Math.sin(lx * Math.PI),
        Math.sin(ly * Math.PI),
      );
      const towEdge = Math.pow(Math.max(0, edgeMask), 0.22);

      // Crowned profile of each 3K carbon fiber bundle + micro-filament strands
      const crown = isWarpOver
        ? Math.sin(lx * Math.PI) * (0.82 + 0.18 * Math.sin(ly * Math.PI))
        : Math.sin(ly * Math.PI) * (0.82 + 0.18 * Math.sin(lx * Math.PI));
      const microStrand = isWarpOver
        ? 0.5 + 0.5 * Math.sin(lx * Math.PI * 10)
        : 0.5 + 0.5 * Math.sin(ly * Math.PI * 10);

      // Strong directional reflectance contrast between orthogonal warp & weft carbon tows
      const baseShade = isWarpOver
        ? (0.20 + Math.pow(crown, 0.85) * 0.34 + microStrand * 0.05) * towEdge
        : (0.05 + Math.pow(crown, 1.15) * 0.13 + microStrand * 0.02) * towEdge;

      const idx = (y * cfSize + x) * 4;
      cfAlbedoBytes[idx] = Math.round(Math.min(1, baseShade * 0.94) * 255);
      cfAlbedoBytes[idx + 1] = Math.round(Math.min(1, baseShade * 0.99) * 255);
      cfAlbedoBytes[idx + 2] = Math.round(Math.min(1, baseShade * 1.08) * 255);
      cfAlbedoBytes[idx + 3] = 255;

      return (crown * 0.92 + microStrand * 0.08) * towEdge;
    },
    2,
    9,
  );
  const carbonWeaveAlbedo = RawTexture.CreateRGBATexture(
    cfAlbedoBytes,
    cfSize,
    cfSize,
    scene,
    true,
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  carbonWeaveAlbedo.name = 'tex-albedo-carbon-3k';
  configureAnisotropicTexture(carbonWeaveAlbedo, scene, 2, 9, false);

  // 6. Fiberglass / Painted Hardwood Tripod Strut longitudinal grain normal map
  const fiberglassGrainNormal = buildNormalMapFromHeight(
    scene,
    'tex-normal-fiberglass-strut',
    128,
    1.15,
    (u, _v, x, y) => {
      const grain = smoothNoise2D(x * 1.6, y * 0.15, 32, 707) * 0.72;
      const flute = Math.sin(u * Math.PI * 24) * 0.18 + hash2D(x, y, 808) * 0.1;
      return grain + flute;
    },
    2,
    6,
  );

  // Helper for crisp PBR material construction
  const makePbr = (
    name: string,
    hex: string,
    metallic: number,
    roughness: number,
    opts?: {
      bump?: RawTexture;
      bumpLevel?: number;
      albedoTex?: Texture;
      emissiveScale?: number;
      clearCoat?: number;
      clearCoatRoughness?: number;
      alpha?: number;
      anisotropy?: number;
    },
  ): PBRMaterial => {
    const mat = new PBRMaterial(name, scene);
    const base = Color3.FromHexString(hex);
    mat.albedoColor = base;
    mat.metallic = metallic;
    mat.roughness = roughness;
    mat.environmentIntensity = 0.85;
    mat.directIntensity = 1.25;
    if (opts?.emissiveScale) {
      mat.emissiveColor = base.scale(opts.emissiveScale);
    }
    if (opts?.albedoTex) {
      mat.albedoTexture = opts.albedoTex;
    }
    if (opts?.bump) {
      mat.bumpTexture = opts.bump;
      mat.bumpTexture.level = opts.bumpLevel ?? 0.55;
    }
    if (opts?.clearCoat) {
      mat.clearCoat.isEnabled = true;
      mat.clearCoat.intensity = opts.clearCoat;
      mat.clearCoat.roughness = opts.clearCoatRoughness ?? 0.08;
    }
    if (opts?.anisotropy) {
      mat.anisotropy.isEnabled = true;
      mat.anisotropy.intensity = opts.anisotropy;
    }
    if (opts?.alpha != null && opts.alpha < 1) {
      mat.alpha = opts.alpha;
      mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    }
    return mat;
  };

  const castMagnesiumDark = makePbr('pbr-cast-magnesium-dark', '#252e38', 0.48, 0.46, {
    bump: castGrainNormal,
    bumpLevel: 0.42,
    emissiveScale: 0.05,
  });

  const castAnthracite = makePbr('pbr-cast-anthracite', '#182028', 0.35, 0.52, {
    bump: castGrainNormal,
    bumpLevel: 0.38,
    emissiveScale: 0.04,
  });

  const matteGraphite = makePbr('pbr-matte-graphite', '#10151b', 0.18, 0.68, {
    bump: castGrainNormal,
    bumpLevel: 0.28,
    emissiveScale: 0.03,
  });

  const machinedAluminum = makePbr('pbr-machined-aluminum', '#cfd8e0', 0.88, 0.24, {
    bump: brushedMetalNormal,
    bumpLevel: 0.32,
    anisotropy: 0.55,
    emissiveScale: 0.04,
  });

  const hardenedSteel = makePbr('pbr-hardened-steel', '#9aa6b2', 0.92, 0.20, {
    bump: brushedMetalNormal,
    bumpLevel: 0.28,
    anisotropy: 0.45,
    emissiveScale: 0.04,
  });

  const brassHardware = makePbr('pbr-brass-hardware', '#d4a238', 0.86, 0.26, {
    bump: brushedMetalNormal,
    bumpLevel: 0.25,
    emissiveScale: 0.06,
  });

  const knurledSteel = makePbr('pbr-knurled-steel', '#8e9ba8', 0.88, 0.30, {
    bump: knurlNormal,
    bumpLevel: 0.78,
    emissiveScale: 0.04,
  });

  const knurledBlackAnodized = makePbr('pbr-knurled-black', '#1b222a', 0.62, 0.38, {
    bump: knurlNormal,
    bumpLevel: 0.82,
    emissiveScale: 0.03,
  });

  const safetyYellowCoat = makePbr('pbr-safety-yellow-coat', '#f5b301', 0.14, 0.32, {
    bump: fiberglassGrainNormal,
    bumpLevel: 0.30,
    clearCoat: 0.55,
    clearCoatRoughness: 0.16,
    emissiveScale: 0.12,
  });

  const safetyOrangeCoat = makePbr('pbr-safety-orange-coat', '#f96302', 0.16, 0.34, {
    bump: castGrainNormal,
    bumpLevel: 0.26,
    clearCoat: 0.5,
    clearCoatRoughness: 0.18,
    emissiveScale: 0.14,
  });

  const leicaTealSlate = makePbr('pbr-survey-teal-slate', '#1f3a44', 0.38, 0.42, {
    bump: castGrainNormal,
    bumpLevel: 0.35,
    clearCoat: 0.25,
    clearCoatRoughness: 0.25,
    emissiveScale: 0.08,
  });

  const rubberGrip = makePbr('pbr-tpu-rubber-grip', '#0d1116', 0.04, 0.84, {
    bump: rubberRibNormal,
    bumpLevel: 0.72,
    emissiveScale: 0.02,
  });

  const carbonFiberWeave = makePbr('pbr-carbon-fiber-3k', '#ffffff', 0.48, 0.22, {
    albedoTex: carbonWeaveAlbedo,
    bump: carbonWeaveNormal,
    bumpLevel: 0.95,
    clearCoat: 1.0,
    clearCoatRoughness: 0.06,
    anisotropy: 0.78,
  });
  carbonFiberWeave.emissiveColor = new Color3(0.03, 0.04, 0.05);

  const radomeMatteWhite = makePbr('pbr-radome-white', '#f3f6f9', 0.05, 0.34, {
    bump: castGrainNormal,
    bumpLevel: 0.16,
    clearCoat: 0.38,
    clearCoatRoughness: 0.20,
    emissiveScale: 0.14,
  });

  const objectiveLensGlass = makePbr('pbr-objective-lens', '#07263d', 0.15, 0.05, {
    clearCoat: 1.0,
    clearCoatRoughness: 0.02,
    emissiveScale: 0.38,
  });
  objectiveLensGlass.clearCoat.isTintEnabled = true;
  objectiveLensGlass.clearCoat.tintColor = Color3.FromHexString('#38bdf8');

  const prismCornerCubeGlass = makePbr('pbr-prism-retro-glass', '#159ab8', 0.20, 0.04, {
    clearCoat: 1.0,
    clearCoatRoughness: 0.02,
    alpha: 0.28,
    emissiveScale: 0.45,
  });

  const prismCopperCoat = makePbr('pbr-prism-copper-back', '#c85a32', 0.92, 0.18, {
    emissiveScale: 0.28,
  });

  const spiritBubbleVial = makePbr('pbr-spirit-vial', '#4ade80', 0.08, 0.08, {
    clearCoat: 0.9,
    clearCoatRoughness: 0.04,
    alpha: 0.84,
    emissiveScale: 0.32,
  });

  const screenCoverGlass = makePbr('pbr-tablet-cover-glass', '#09131d', 0.10, 0.06, {
    clearCoat: 0.95,
    clearCoatRoughness: 0.04,
    alpha: 0.22,
  });
  // The cover glass must not write depth over the LCD texture beneath it.
  screenCoverGlass.disableDepthWrite = true;

  const kit: SurveyMaterialKit = {
    castGrainNormal,
    knurlNormal,
    brushedMetalNormal,
    rubberRibNormal,
    carbonWeaveAlbedo,
    carbonWeaveNormal,
    fiberglassGrainNormal,
    castMagnesiumDark,
    castAnthracite,
    matteGraphite,
    machinedAluminum,
    hardenedSteel,
    brassHardware,
    knurledSteel,
    knurledBlackAnodized,
    safetyYellowCoat,
    safetyOrangeCoat,
    leicaTealSlate,
    rubberGrip,
    carbonFiberWeave,
    radomeMatteWhite,
    objectiveLensGlass,
    prismCornerCubeGlass,
    prismCopperCoat,
    spiritBubbleVial,
    screenCoverGlass,
  };

  sceneKitCache.set(scene, kit);
  return kit;
}

/**
 * Generates a high-DPI widescreen Windows 11 Field Survey Tablet display material
 * featuring the prominent "LandSurv.ai" brand name wordmark, live topo/traverse
 * map canvas, RTK/Robotic status bar, and tactile field measurement telemetry.
 */
export function createLandSurvTabletScreenMaterial(
  scene: Scene,
  mode: 'robotic' | 'gnss',
): StandardMaterial {
  const matName = `mat-landsurv-tablet-screen-${mode}`;
  const existing = scene.getMaterialByName(matName);
  if (existing && existing instanceof StandardMaterial) return existing;

  const width = 1024;
  const height = 680;
  const tex = createCanvasTextureSafe(scene, `tex-landsurv-tablet-${mode}`, width, height, ctx => {
    // Deep outdoor-readable dark slate CAD background
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#07111c');
    bgGrad.addColorStop(0.55, '#0b1928');
    bgGrad.addColorStop(1, '#06101a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Top Windows Survey Header Bar
    ctx.fillStyle = '#0f2236';
    ctx.fillRect(0, 0, width, 96);
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(0, 93, width, 3);

    // Prominent "LandSurv.ai" Brand Name Wordmark (text wordmark, no icon logo)
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = '800 50px "Inter", "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#f8fafc';
    const mainWord = 'LandSurv';
    ctx.fillText(mainWord, 30, 50);
    const mainW = ctx.measureText(mainWord).width;
    ctx.fillStyle = '#22d3ee';
    ctx.fillText('.ai', 30 + mainW + 1, 50);

    // Mode pill badge in header
    const pillText = mode === 'gnss' ? 'RTK FIXED · 18 SAT' : 'ATR LOCK · 1" ROBOTIC';
    ctx.font = '700 22px "Segoe UI", system-ui, sans-serif';
    const pillW = ctx.measureText(pillText).width + 36;
    const pillX = width - pillW - 140;
    ctx.fillStyle = mode === 'gnss' ? 'rgba(163, 230, 53, 0.18)' : 'rgba(34, 211, 238, 0.18)';
    ctx.strokeStyle = mode === 'gnss' ? '#a3e635' : '#22d3ee';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(pillX, 24, pillW, 46, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = mode === 'gnss' ? '#bef264' : '#67e8f9';
    ctx.fillText(pillText, pillX + 18, 48);

    // Battery & 5G indicator on top right
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(width - 106, 33, 62, 28);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(width - 110, 29, 70, 36);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(width - 38, 39, 6, 16);

    // Left CAD Map Viewport (680 x 518)
    const mapX = 22;
    const mapY = 116;
    const mapW = 656;
    const mapH = 496;
    ctx.fillStyle = '#050d16';
    ctx.fillRect(mapX, mapY, mapW, mapH);
    ctx.strokeStyle = '#1e3a52';
    ctx.lineWidth = 2;
    ctx.strokeRect(mapX, mapY, mapW, mapH);

    // Subtle CAD coordinate grid inside map
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.13)';
    ctx.lineWidth = 1;
    for (let gx = mapX + 64; gx < mapX + mapW; gx += 64) {
      ctx.beginPath();
      ctx.moveTo(gx, mapY);
      ctx.lineTo(gx, mapY + mapH);
      ctx.stroke();
    }
    for (let gy = mapY + 64; gy < mapY + mapH; gy += 64) {
      ctx.beginPath();
      ctx.moveTo(mapX, gy);
      ctx.lineTo(mapX + mapW, gy);
      ctx.stroke();
    }

    // Simulated Topo Contours
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.34)';
    ctx.lineWidth = 2;
    for (let c = 0; c < 4; c++) {
      ctx.beginPath();
      ctx.moveTo(mapX + 20, mapY + 110 + c * 92);
      ctx.bezierCurveTo(
        mapX + 210, mapY + 55 + c * 88,
        mapX + 430, mapY + 185 + c * 76,
        mapX + mapW - 18, mapY + 95 + c * 90,
      );
      ctx.stroke();
    }

    // Survey boundary / traverse polyline + measured points
    const pts: Array<[number, number]> = [
      [mapX + 110, mapY + 390],
      [mapX + 215, mapY + 185],
      [mapX + 465, mapY + 155],
      [mapX + 555, mapY + 335],
      [mapX + 355, mapY + 425],
    ];
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 4;
    ctx.beginPath();
    pts.forEach(([px, py], i) => {
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.stroke();

    pts.forEach(([px, py], i) => {
      ctx.fillStyle = i === 2 ? '#a3e635' : '#38bdf8';
      ctx.beginPath();
      ctx.arc(px, py, i === 2 ? 10 : 6.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Active stakeout / shot target bullseye
    const [tx, ty] = pts[2];
    ctx.strokeStyle = '#a3e635';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(tx, ty, 24, 0, Math.PI * 2);
    ctx.stroke();

    // Large glowing LandSurv.ai watermark/overlay badge in lower-left of CAD canvas
    ctx.fillStyle = 'rgba(8, 22, 36, 0.86)';
    ctx.fillRect(mapX + 14, mapY + mapH - 64, 286, 50);
    ctx.font = '700 26px "Inter", "Segoe UI", sans-serif';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('LandSurv', mapX + 28, mapY + mapH - 38);
    const subW = ctx.measureText('LandSurv').width;
    ctx.fillStyle = '#22d3ee';
    ctx.fillText('.ai Field', mapX + 28 + subW, mapY + mapH - 38);

    // Right Telemetry & Measure Sidebar (698..1002)
    const sideX = 698;
    const sideW = 304;
    const cards = [
      { label: 'NORTHING', val: '5,142.834' },
      { label: 'EASTING', val: '4,218.509' },
      { label: 'ELEV / HR', val: mode === 'gnss' ? '312.46 · 2.00m' : '312.46 · 5.15ft' },
      { label: 'PRECISION', val: mode === 'gnss' ? 'H 0.008 · V 0.014' : 'SD 148.62 · ±1"' },
    ];
    cards.forEach((card, idx) => {
      const cy = 116 + idx * 92;
      ctx.fillStyle = '#0e2033';
      ctx.strokeStyle = '#1e3a52';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(sideX, cy, sideW, 78, 10);
      ctx.fill();
      ctx.stroke();

      ctx.font = '600 17px "Segoe UI", sans-serif';
      ctx.fillStyle = '#7dd3fc';
      ctx.fillText(card.label, sideX + 16, cy + 24);

      ctx.font = '700 26px "Consolas", "Segoe UI", monospace';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(card.val, sideX + 16, cy + 56);
    });

    // Prominent Cyan MEASURE Action Button
    ctx.fillStyle = '#0891b2';
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(sideX, 492, sideW, 120, 14);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.font = '800 32px "Inter", "Segoe UI", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(mode === 'gnss' ? 'MEASURE EPOCH' : 'MEASURE SHOT', sideX + sideW / 2, 552);

    // Bottom Windows 11 Taskbar strip
    ctx.fillStyle = '#091522';
    ctx.fillRect(0, height - 48, width, 48);
    ctx.textAlign = 'left';
    ctx.font = '600 20px "Segoe UI", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('WIN 11 PRO  ·  LandSurv.ai Field Collector v26.11', 26, height - 23);
  });

  const mat = new StandardMaterial(matName, scene);
  mat.diffuseTexture = tex;
  mat.emissiveTexture = tex;
  mat.emissiveColor = new Color3(0.95, 0.98, 1.0);
  mat.specularColor = new Color3(0.28, 0.34, 0.38);
  mat.specularPower = 96;
  return mat;
}

/**
 * Generates an onboard color LCD display material for the Robotic Total Station
 * alidade face (angles, slope distance, electronic level, and ATR lock).
 */
export function createTotalStationDisplayMaterial(scene: Scene): StandardMaterial {
  const matName = 'mat-ts-onboard-lcd';
  const existing = scene.getMaterialByName(matName);
  if (existing && existing instanceof StandardMaterial) return existing;

  const width = 512;
  const height = 320;
  const tex = createCanvasTextureSafe(scene, 'tex-ts-onboard-lcd', width, height, ctx => {
    ctx.fillStyle = '#0a1826';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#122b42';
    ctx.fillRect(0, 0, width, 54);
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(0, 52, width, 2);

    ctx.textBaseline = 'middle';
    ctx.font = '700 24px "Segoe UI", sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText('LandSurv', 18, 27);
    const lw = ctx.measureText('LandSurv').width;
    ctx.fillStyle = '#22d3ee';
    ctx.fillText('.ai TS', 18 + lw, 27);

    ctx.fillStyle = '#a3e635';
    ctx.font = '700 20px "Segoe UI", sans-serif';
    ctx.fillText('ATR LOCK', 376, 27);

    const rows = [
      ['HA', '124° 18\' 42"'],
      ['ZA', ' 89° 54\' 11"'],
      ['SD', ' 142.835 ft'],
      ['HR', '   5.150 ft'],
    ];
    rows.forEach(([k, v], i) => {
      const y = 92 + i * 52;
      ctx.font = '700 24px "Segoe UI", sans-serif';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(k, 22, y);
      ctx.font = '700 30px "Consolas", monospace';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(v, 86, y);
    });

    // Electronic bullseye level widget on right
    const cx = 420;
    const cy = 178;
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 52, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.arc(cx + 2, cy - 1, 10, 0, Math.PI * 2);
    ctx.fill();
  });

  const mat = new StandardMaterial(matName, scene);
  mat.diffuseTexture = tex;
  mat.emissiveTexture = tex;
  mat.emissiveColor = new Color3(0.9, 0.95, 1.0);
  mat.specularColor = new Color3(0.25, 0.28, 0.32);
  return mat;
}

/**
 * Generates the high-contrast geometric sighting target plate texture for the
 * single-sided directional traverse prism (black background + fluorescent yellow/orange
 * sighting triangles converging on the center nodal optical axis).
 */
export function createPrismTargetPlateMaterial(scene: Scene): PBRMaterial {
  const matName = 'pbr-prism-target-plate-front';
  const existing = scene.getMaterialByName(matName);
  if (existing && existing instanceof PBRMaterial) return existing;

  const size = 512;
  const tex = createCanvasTextureSafe(scene, 'tex-prism-target-plate', size, size, ctx => {
    ctx.fillStyle = '#141920';
    ctx.fillRect(0, 0, size, size);

    // High-visibility outer border
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 22;
    ctx.strokeRect(11, 11, size - 22, size - 22);

    // 4 sighting triangles (top/bottom fluorescent yellow, left/right safety orange)
    const half = size / 2;
    const tri = (pts: Array<[number, number]>, color: string) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      pts.forEach(([x, y], idx) => (idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
      ctx.fill();
    };
    tri([[half - 92, 24], [half + 92, 24], [half, half - 70]], '#facc15');
    tri([[half - 92, size - 24], [half + 92, size - 24], [half, half + 70]], '#facc15');
    tri([[24, half - 76], [24, half + 76], [half - 78, half]], '#f97316');
    tri([[size - 24, half - 76], [size - 24, half + 76], [half + 78, half]], '#f97316');

    // Crosshair alignment ticks
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(half, 24);
    ctx.lineTo(half, size - 24);
    ctx.moveTo(24, half);
    ctx.lineTo(size - 24, half);
    ctx.stroke();
  });

  const kit = getSurveyMaterialKit(scene);
  const mat = new PBRMaterial(matName, scene);
  mat.albedoTexture = tex;
  mat.emissiveTexture = tex;
  mat.emissiveColor = new Color3(0.28, 0.28, 0.28);
  mat.metallic = 0.12;
  mat.roughness = 0.42;
  mat.bumpTexture = kit.castGrainNormal;
  mat.bumpTexture.level = 0.28;
  return mat;
}

/**
 * Generates the internal 6-sector corner-cube retroreflector optical facet texture
 * (copper-coated mirror seams + cyan/ruby retroreflected EDM return).
 */
export function createCornerCubeFacetMaterial(scene: Scene): PBRMaterial {
  const matName = 'pbr-corner-cube-facets';
  const existing = scene.getMaterialByName(matName);
  if (existing && existing instanceof PBRMaterial) return existing;

  const size = 512;
  const tex = createCanvasTextureSafe(scene, 'tex-corner-cube-facets', size, size, ctx => {
    const cx = size / 2;
    const cy = size / 2;
    const r = size * 0.49;

    const sectorPalette = [
      ['#083344', '#22d3ee'],
      ['#3b1812', '#e07a5f'],
      ['#0c4a6e', '#38bdf8'],
      ['#291518', '#fb7185'],
      ['#062c3d', '#67e8f9'],
      ['#3f1d14', '#f59e0b'],
    ];

    for (let i = 0; i < 6; i++) {
      const a0 = (i * Math.PI) / 3 - Math.PI / 2;
      const a1 = ((i + 1) * Math.PI) / 3 - Math.PI / 2;
      const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
      grad.addColorStop(0, '#ecfeff');
      grad.addColorStop(0.24, sectorPalette[i][1]);
      grad.addColorStop(0.82, sectorPalette[i][0]);
      grad.addColorStop(1, '#090d12');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a0, a1);
      ctx.closePath();
      ctx.fill();
    }

    // 3 primary corner-cube dihedral mirror edges + 3 secondary reflected edges
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 - Math.PI / 2;
      ctx.strokeStyle = i % 2 === 0 ? '#f8fafc' : 'rgba(251, 146, 60, 0.75)';
      ctx.lineWidth = i % 2 === 0 ? 4.5 : 2.2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.stroke();
    }

    // Outer precision ground optical bevel ring
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 6, 0, Math.PI * 2);
    ctx.stroke();
  });

  const mat = new PBRMaterial(matName, scene);
  mat.albedoTexture = tex;
  mat.emissiveTexture = tex;
  mat.emissiveColor = new Color3(0.72, 0.78, 0.82);
  mat.metallic = 0.55;
  mat.roughness = 0.05;
  mat.clearCoat.isEnabled = true;
  mat.clearCoat.intensity = 1.0;
  mat.clearCoat.roughness = 0.02;
  return mat;
}

/**
 * Generates a crisp graduated red/white survey range pole texture with fine
 * tenth/centimetre graduation ticks.
 *
 * Deliberately a StandardMaterial: the shaft is a long, thin cylinder and its
 * previous PBR shader could stay unready on some GPUs, leaving the prism and
 * collector floating with no visible pole. The simple material always renders.
 */
export function createGraduatedPoleMaterial(scene: Scene): StandardMaterial {
  const matName = 'mat-graduated-range-pole';
  const existing = scene.getMaterialByName(matName);
  if (existing && existing instanceof StandardMaterial) return existing;

  const width = 256;
  const height = 1024;
  const tex = createCanvasTextureSafe(scene, 'tex-graduated-range-pole', width, height, ctx => {
    const bands = 8;
    const bandH = height / bands;
    for (let b = 0; b < bands; b++) {
      const isRed = b % 2 === 0;
      ctx.fillStyle = isRed ? '#dc2626' : '#f8fafc';
      ctx.fillRect(0, b * bandH, width, bandH);

      // Anodized collar seam line
      ctx.fillStyle = 'rgba(15, 23, 42, 0.38)';
      ctx.fillRect(0, b * bandH, width, 3);

      // Fine surveyor graduation tick marks along front strip
      ctx.fillStyle = isRed ? '#ffffff' : '#0f172a';
      for (let t = 1; t < 10; t++) {
        const ty = b * bandH + (t / 10) * bandH;
        const tickW = t === 5 ? 36 : 20;
        ctx.fillRect(18, ty - 1.2, tickW, 2.4);
        ctx.fillRect(width - 18 - tickW, ty - 1.2, tickW, 2.4);
      }
    }
  });

  const mat = new StandardMaterial(matName, scene);
  mat.diffuseTexture = tex;
  mat.emissiveTexture = tex;
  mat.emissiveColor = new Color3(0.34, 0.34, 0.34);
  mat.specularColor = new Color3(0.18, 0.18, 0.18);
  mat.specularPower = 28;
  return mat;
}

/**
 * Generates an illuminated OLED telemetry screen for the High-Power UHF Base Radio.
 */
export function createUhfRadioScreenMaterial(scene: Scene): StandardMaterial {
  const matName = 'mat-uhf-radio-oled';
  const existing = scene.getMaterialByName(matName);
  if (existing && existing instanceof StandardMaterial) return existing;

  const width = 256;
  const height = 128;
  const tex = createCanvasTextureSafe(scene, 'tex-uhf-radio-oled', width, height, ctx => {
    ctx.fillStyle = '#061318';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#1e3a44';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, width - 4, height - 4);

    ctx.textBaseline = 'middle';
    ctx.font = '700 20px "Consolas", monospace';
    ctx.fillStyle = '#a3e635';
    ctx.fillText('TX 461.125 MHz', 16, 30);
    ctx.fillStyle = '#38bdf8';
    ctx.font = '700 18px "Segoe UI", sans-serif';
    ctx.fillText('35W · CMRx · 1Hz', 16, 66);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 15px "Segoe UI", sans-serif';
    ctx.fillText('LandSurv.ai Base Link', 16, 100);
  });

  const mat = new StandardMaterial(matName, scene);
  mat.diffuseTexture = tex;
  mat.emissiveTexture = tex;
  mat.emissiveColor = new Color3(0.9, 0.95, 0.95);
  return mat;
}
