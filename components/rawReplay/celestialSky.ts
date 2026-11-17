/**
 * Raw Replay — celestial sky and GNSS satellite sky.
 *
 * Stars, sun, moon and planets are placed on a far sphere from real
 * positional astronomy (see services/rawReplay/astronomy.ts). When the raw
 * file has no GNSS latitude/longitude the HUD marks the sky approximate.
 *
 * GNSS satellites: raw files usually store only a satellite count, not per-SV
 * azimuth/elevation. The sky therefore draws that many representative lines
 * from the antenna, clearly labelled as representative in the HUD.
 */
import {
  Color3,
  Color4,
  Constants,
  DynamicTexture,
  Matrix,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  Scene,
  ShaderMaterial,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexBuffer,
  VertexData,
} from '@babylonjs/core';
import { SkyMaterial } from '@babylonjs/materials/sky';
import {
  BRIGHT_STARS,
  PLANET_META,
  equatorialToHorizontal,
  localSiderealTimeDeg,
  moonPosition,
  planetEquatorial,
  sunEquatorial,
} from '../../services/rawReplay/astronomy';
import type { HistoricalWeather } from '../../services/rawReplay/historicalWeather';

export interface SkyState {
  timeLabel: string;
  /** Day/night classification for the recorded field clock. */
  skyPhase: 'day' | 'twilight' | 'night';
  /** Horizon colour the 2D background should match when the dome is hidden. */
  horizonColor: Color3;
  sunAltitudeDeg: number;
  /** Sun azimuth from north, clockwise, for the current file time and place. */
  sunAzimuthDeg: number;
  moonAltitudeDeg: number;
  moonIllumination: number;
  visiblePlanets: string[];
  approximateLocation: boolean;
  approximateTime: boolean;
  starCount: number;
  sunVisible: boolean;
  moonVisible: boolean;
}

export interface CelestialSkyRig {
  root: TransformNode;
  radius: number;
  update: (
    dateMs: number,
    latitudeDeg: number,
    longitudeDeg: number,
    /** Recorded local clock time, formatted as-is instead of in the viewer zone. */
    recordedClockMs?: number,
    /** Historical conditions for the recorded hour, when available. */
    weather?: HistoricalWeather | null,
  ) => SkyState;
  /** Centers the infinite-distance sky on the camera at every zoom level. */
  syncCamera: (cameraPosition: Vector3) => void;
  setEnabled: (enabled: boolean) => void;
}

const DEG = Math.PI / 180;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const directionFromHorizontal = (altitudeDeg: number, azimuthDeg: number): Vector3 => {
  const alt = altitudeDeg * DEG;
  const az = azimuthDeg * DEG;
  return new Vector3(
    Math.sin(az) * Math.cos(alt),
    Math.sin(alt),
    Math.cos(az) * Math.cos(alt),
  );
};

const seededRandom = (seedText: string): (() => number) => {
  let hash = 2166136261;
  for (let index = 0; index < seedText.length; index += 1) {
    hash ^= seedText.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const STAR_TINTS: ReadonlyArray<[number, number, number]> = [
  [0.72, 0.82, 1],
  [0.86, 0.9, 1],
  [1, 0.98, 0.94],
  [1, 0.92, 0.78],
  [1, 0.84, 0.66],
];

const starTint = (random: number): [number, number, number] =>
  STAR_TINTS[Math.min(STAR_TINTS.length - 1, Math.floor(random * STAR_TINTS.length))];

export interface SkyPalette {
  zenith: Color3;
  horizon: Color3;
  ground: Color3;
  glow: Color3;
  glowStrength: number;
}

/** Sky colours keyed by the sun's altitude above the horizon, in degrees. */
const SKY_PALETTE_KEYFRAMES: ReadonlyArray<{
  altitudeDeg: number;
  zenith: string;
  horizon: string;
  ground: string;
  glow: string;
  glowStrength: number;
}> = [
  { altitudeDeg: -18, zenith: '#05080f', horizon: '#0a1320', ground: '#04070b', glow: '#16283f', glowStrength: 0.04 },
  { altitudeDeg: -6, zenith: '#0d1830', horizon: '#2c2b3f', ground: '#05080d', glow: '#6b3f4a', glowStrength: 0.12 },
  { altitudeDeg: 0, zenith: '#27436f', horizon: '#c56b45', ground: '#0d0c0c', glow: '#ff9a54', glowStrength: 0.55 },
  { altitudeDeg: 8, zenith: '#3e6da8', horizon: '#f2b982', ground: '#1a1812', glow: '#ffd6a0', glowStrength: 0.42 },
  { altitudeDeg: 25, zenith: '#3c79c2', horizon: '#d7ebf7', ground: '#232a2a', glow: '#fff4d6', glowStrength: 0.18 },
  { altitudeDeg: 65, zenith: '#2b66b6', horizon: '#bfdcf2', ground: '#2a3234', glow: '#fff8e6', glowStrength: 0.12 },
];

export const skyPaletteForSunAltitude = (altitudeDeg: number): SkyPalette => {
  const first = SKY_PALETTE_KEYFRAMES[0];
  const last = SKY_PALETTE_KEYFRAMES[SKY_PALETTE_KEYFRAMES.length - 1];
  const altitude = clamp(altitudeDeg, first.altitudeDeg, last.altitudeDeg);
  let upperIndex = 1;
  while (upperIndex < SKY_PALETTE_KEYFRAMES.length - 1 && altitude > SKY_PALETTE_KEYFRAMES[upperIndex].altitudeDeg) {
    upperIndex += 1;
  }
  const lower = SKY_PALETTE_KEYFRAMES[upperIndex - 1];
  const upper = SKY_PALETTE_KEYFRAMES[upperIndex];
  const span = Math.max(0.0001, upper.altitudeDeg - lower.altitudeDeg);
  const t = clamp((altitude - lower.altitudeDeg) / span, 0, 1);
  const blend = t * t * (3 - 2 * t);
  const mix = (a: string, b: string) => Color3.Lerp(Color3.FromHexString(a), Color3.FromHexString(b), blend);
  return {
    zenith: mix(lower.zenith, upper.zenith),
    horizon: mix(lower.horizon, upper.horizon),
    ground: mix(lower.ground, upper.ground),
    glow: mix(lower.glow, upper.glow),
    glowStrength: lower.glowStrength + (upper.glowStrength - lower.glowStrength) * blend,
  };
};

const CLOUD_VERTEX_SHADER = `precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 viewProjection;
varying vec3 vPositionW;
void main() {
  vec4 worldPos = world * vec4(position, 1.0);
  vPositionW = worldPos.xyz;
  gl_Position = viewProjection * worldPos;
}`;

const CLOUD_FRAGMENT_SHADER = `precision highp float;
varying vec3 vPositionW;
uniform vec3 cameraPosition;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 skyTint;
uniform float time;
uniform float coverage;
uniform float opacity;
uniform float daylight;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.55;
  for (int i = 0; i < 4; i++) {
    value += amplitude * valueNoise(p);
    p = p * 2.03 + vec2(31.7, 17.1);
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec3 dir = normalize(vPositionW - cameraPosition);
  float above = dir.y;
  if (above <= 0.012) discard;

  vec3 sun = normalize(sunDirection);
  float sunAmount = max(dot(dir, sun), 0.0);
  float horizonFade = smoothstep(0.012, 0.17, above);

  float totalAlpha = 0.0;
  vec3 totalColor = vec3(0.0);

  // Two projected decks: low cumulus and a thinner high layer. Intersecting
  // the view ray with each deck gives natural perspective at the horizon.
  for (int i = 0; i < 2; i++) {
    float deckHeight = i == 0 ? 900.0 : 1900.0;
    vec2 plane = dir.xz * (deckHeight / max(above, 0.02));
    vec2 uv = plane * 0.00042 + vec2(time * 0.0022, time * 0.0011) * (i == 0 ? 1.0 : 0.62);
    float n = fbm(uv + float(i) * 37.0);
    float mask = smoothstep(coverage, coverage + 0.18, n);
    float alpha = mask * horizonFade * (i == 0 ? 0.72 : 0.4);

    float sunWarmth = pow(sunAmount, 3.0);
    vec3 cloud = mix(vec3(0.56, 0.62, 0.73), sunColor, 0.18 + sunWarmth * 0.48);
    cloud *= (0.7 + sunWarmth * 0.38) * (0.88 + (1.0 - mask) * 0.12);
    cloud = mix(cloud, skyTint * 0.84, 0.14);
    totalColor += cloud * alpha;
    totalAlpha += alpha;
  }

  float alpha = min(0.94, totalAlpha * opacity * (0.26 + daylight * 0.9));
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(totalColor / max(totalAlpha, 0.0001), alpha);
}`;

// Preetham scattering goes black as soon as the sun drops below the horizon.
// This additive veil keeps the warm civil-twilight glow that a real sunset has,
// fading out by nautical twilight so the star field still reads as night.
const TWILIGHT_FRAGMENT_SHADER = `precision highp float;
varying vec3 vPositionW;
uniform vec3 cameraPosition;
uniform vec3 sunDirection;
uniform vec3 glowColor;
uniform float intensity;

void main() {
  vec3 dir = normalize(vPositionW - cameraPosition);
  if (dir.y <= 0.0) discard;
  vec2 sunXZ = normalize(sunDirection.xz + vec2(0.0001));
  vec2 viewXZ = normalize(dir.xz + vec2(0.0001));
  float azimuth = max(dot(viewXZ, sunXZ), 0.0);
  float horizon = pow(1.0 - clamp(dir.y, 0.0, 1.0), 3.2);
  float alpha = intensity * horizon * (0.28 + 0.72 * azimuth);
  if (alpha < 0.002) discard;
  gl_FragColor = vec4(glowColor, alpha);
}`;

const createParticleTexture = (
  scene: Scene,
  name: string,
  width: number,
  height: number,
  paint: (context: CanvasRenderingContext2D) => void,
): DynamicTexture => {
  const texture = new DynamicTexture(name, { width, height }, scene, false);
  try {
    const context = texture.getContext() as unknown as CanvasRenderingContext2D | null;
    if (context && typeof context.createRadialGradient === 'function') {
      paint(context);
      texture.update();
    }
  } catch {
    // Headless test engines have no 2D canvas; the particle texture stays empty.
  }
  texture.hasAlpha = true;
  return texture;
};

export const createCelestialSky = (
  scene: Scene,
  radius: number,
  seedText: string,
  /** World Y for the opaque horizon disc. Defaults to the old near-zero height. */
  horizonFloorY?: number,
): CelestialSkyRig => {
  const root = new TransformNode('raw-replay-celestial-root', scene);
  // Stars, sun, moon and the gradient dome sit at infinity: their frame follows
  // the camera so the sky is present whether the view is framed on the whole
  // site or tracking the pole from a few metres away.
  const skyRoot = new TransformNode('raw-replay-celestial-sky-root', scene);
  skyRoot.parent = root;
  const random = seededRandom(`${seedText}|stars`);

  const randomStarCount = 1100;
  const stars: Array<{ raDeg: number; decDeg: number; color: [number, number, number]; brightness: number }> = [];
  for (const star of BRIGHT_STARS) {
    stars.push({
      raDeg: star.raHours * 15,
      decDeg: star.decDeg,
      color: [1, 0.97, 0.9],
      brightness: clamp(1.05 - star.magnitude * 0.1, 0.55, 1),
    });
  }
  for (let index = 0; index < randomStarCount; index += 1) {
    stars.push({
      raDeg: random() * 360,
      decDeg: Math.asin(random() * 2 - 1) / DEG,
      color: starTint(random()),
      brightness: 0.18 + Math.pow(random(), 2.4) * 0.82,
    });
  }

  const positions = new Float32Array(stars.length * 3);
  const colors = new Float32Array(stars.length * 4);
  stars.forEach((star, index) => {
    const tint = star.color;
    colors[index * 4] = tint[0];
    colors[index * 4 + 1] = tint[1];
    colors[index * 4 + 2] = tint[2];
    colors[index * 4 + 3] = star.brightness;
  });
  const indices = new Uint32Array(stars.length);
  for (let index = 0; index < stars.length; index += 1) indices[index] = index;

  const starMesh = new Mesh('raw-replay-celestial-stars', scene);
  const starData = new VertexData();
  starData.positions = positions;
  starData.colors = colors;
  starData.indices = indices as unknown as number[];
  starData.applyToMesh(starMesh, true);
  starMesh.parent = skyRoot;
  starMesh.isPickable = false;
  starMesh.renderingGroupId = 0;
  starMesh.alwaysSelectAsActiveMesh = true;

  const starMaterial = new StandardMaterial('raw-replay-celestial-star-mat', scene);
  starMaterial.diffuseColor = new Color3(0.2, 0.2, 0.2);
  starMaterial.emissiveColor = new Color3(1, 1, 1);
  starMaterial.specularColor = Color3.Black();
  starMaterial.disableLighting = true;
  starMaterial.pointsCloud = true;
  starMaterial.pointSize = 2.4;
  starMaterial.alphaMode = Constants.ALPHA_ADD;
  starMaterial.backFaceCulling = false;
  starMesh.material = starMaterial;

  // A dark horizon disc hides stars and bodies below the observer's horizon.
  // It is an enormous depth-writing plane, so the scene supplies a Y below
  // the ground backdrop and basemap. At the old fraction-of-radius height it
  // sat between those layers and z-fought the map at grazing angles.
  const horizon = MeshBuilder.CreateDisc('raw-replay-celestial-horizon', {
    radius: radius * 3.4,
    tessellation: 96,
  }, scene);
  horizon.parent = root;
  horizon.rotation.x = Math.PI / 2;
  horizon.position.y = horizonFloorY ?? -Math.max(0.3, radius * 0.0002);
  horizon.isPickable = false;
  horizon.renderingGroupId = 0;
  const horizonMaterial = new StandardMaterial('raw-replay-celestial-horizon-mat', scene);
  horizonMaterial.diffuseColor = Color3.Black();
  horizonMaterial.emissiveColor = new Color3(0.008, 0.02, 0.035);
  horizonMaterial.specularColor = Color3.Black();
  horizonMaterial.disableLighting = true;
  horizonMaterial.backFaceCulling = false;
  horizon.material = horizonMaterial;

  // Preetham scattering sky. The dome is centered on the eye by syncCamera, so
  // the horizon stays level in every follow mode and at every zoom level.
  const skyDome = MeshBuilder.CreateSphere('raw-replay-sky-dome', {
    diameter: radius * 2,
    segments: 32,
    sideOrientation: Mesh.BACKSIDE,
  }, scene);
  skyDome.parent = skyRoot;
  skyDome.isPickable = false;
  skyDome.renderingGroupId = 0;
  skyDome.alwaysSelectAsActiveMesh = true;
  const skyMaterial = new SkyMaterial('raw-replay-sky-material', scene);
  skyMaterial.backFaceCulling = false;
  skyMaterial.disableDepthWrite = true;
  skyMaterial.fogEnabled = false;
  skyMaterial.dithering = true;
  skyMaterial.useSunPosition = true;
  skyMaterial.distance = radius;
  skyMaterial.turbidity = 4;
  skyMaterial.rayleigh = 2.2;
  skyMaterial.mieCoefficient = 0.004;
  skyMaterial.mieDirectionalG = 0.8;
  skyMaterial.luminance = 1;
  skyDome.material = skyMaterial;

  // Additive twilight veil just inside the cloud decks. It carries the warm
  // horizon after the scattering dome has gone dark, without brightening
  // astronomical night.
  const twilightDome = MeshBuilder.CreateSphere('raw-replay-twilight-dome', {
    diameter: radius * 1.99,
    segments: 32,
    sideOrientation: Mesh.BACKSIDE,
  }, scene);
  twilightDome.parent = skyRoot;
  twilightDome.isPickable = false;
  twilightDome.renderingGroupId = 0;
  twilightDome.alwaysSelectAsActiveMesh = true;
  const twilightMaterial = new ShaderMaterial('raw-replay-twilight-material', scene, {
    vertexSource: CLOUD_VERTEX_SHADER,
    fragmentSource: TWILIGHT_FRAGMENT_SHADER,
  }, {
    attributes: ['position'],
    uniforms: ['world', 'viewProjection', 'cameraPosition', 'sunDirection', 'glowColor', 'intensity'],
  });
  twilightMaterial.backFaceCulling = false;
  twilightMaterial.disableDepthWrite = true;
  twilightMaterial.fogEnabled = false;
  twilightMaterial.alpha = 0.999;
  twilightMaterial.alphaMode = Constants.ALPHA_ADD;
  twilightDome.material = twilightMaterial;

  // Two procedural cloud decks projected onto atmospheric planes. Unlike a
  // flat texture sheet, the projection converges at the horizon and keeps the
  // deck in perspective as the camera tilts and zooms.
  const cloudDome = MeshBuilder.CreateSphere('raw-replay-cloud-dome', {
    diameter: radius * 1.995,
    segments: 32,
    sideOrientation: Mesh.BACKSIDE,
  }, scene);
  cloudDome.parent = skyRoot;
  cloudDome.isPickable = false;
  cloudDome.renderingGroupId = 0;
  cloudDome.alwaysSelectAsActiveMesh = true;
  const cloudMaterial = new ShaderMaterial('raw-replay-cloud-material', scene, {
    vertexSource: CLOUD_VERTEX_SHADER,
    fragmentSource: CLOUD_FRAGMENT_SHADER,
  }, {
    attributes: ['position'],
    uniforms: [
      'world',
      'viewProjection',
      'cameraPosition',
      'sunDirection',
      'sunColor',
      'skyTint',
      'time',
      'coverage',
      'opacity',
      'daylight',
    ],
  });
  cloudMaterial.backFaceCulling = false;
  // A sub-1 alpha forces the transparent pass while the shader owns the final
  // alpha; without it the dome is opaque and sorts behind other transparents.
  cloudMaterial.alpha = 0.999;
  cloudMaterial.disableDepthWrite = true;
  cloudMaterial.fogEnabled = false;
  cloudDome.material = cloudMaterial;

  const weatherEmitter = MeshBuilder.CreateSphere('raw-replay-weather-emitter', {
    diameter: 0.02,
    segments: 3,
  }, scene);
  weatherEmitter.parent = skyRoot;
  weatherEmitter.isVisible = false;
  weatherEmitter.isPickable = false;

  const dustTexture = createParticleTexture(scene, 'raw-replay-dust-texture', 32, 32, context => {
    const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 32, 32);
  });
  const dust = new ParticleSystem('raw-replay-air-motes', 240, scene);
  dust.particleTexture = dustTexture;
  dust.emitter = weatherEmitter;
  dust.minEmitBox = new Vector3(-14, -2, -14);
  dust.maxEmitBox = new Vector3(14, 7, 14);
  dust.minSize = 0.02;
  dust.maxSize = 0.075;
  dust.minLifeTime = 7;
  dust.maxLifeTime = 15;
  dust.emitRate = 24;
  dust.blendMode = ParticleSystem.BLENDMODE_ADD;
  dust.minEmitPower = 0.02;
  dust.maxEmitPower = 0.07;
  dust.direction1 = new Vector3(-0.18, 0.02, -0.18);
  dust.direction2 = new Vector3(0.18, 0.1, 0.18);
  dust.gravity = new Vector3(0, -0.004, 0);
  dust.color1 = new Color4(1, 0.93, 0.8, 0.18);
  dust.color2 = new Color4(0.9, 0.95, 1, 0.1);
  dust.colorDead = new Color4(1, 1, 1, 0);
  dust.updateSpeed = 0.012;
  dust.start();

  const rainTexture = createParticleTexture(scene, 'raw-replay-rain-texture', 16, 64, context => {
    const gradient = context.createLinearGradient(0, 0, 0, 64);
    gradient.addColorStop(0, 'rgba(210,228,255,0)');
    gradient.addColorStop(0.25, 'rgba(210,228,255,0.55)');
    gradient.addColorStop(0.75, 'rgba(210,228,255,0.55)');
    gradient.addColorStop(1, 'rgba(210,228,255,0)');
    context.fillStyle = gradient;
    context.fillRect(5, 0, 6, 64);
  });
  const rain = new ParticleSystem('raw-replay-rain', 900, scene);
  rain.particleTexture = rainTexture;
  rain.emitter = weatherEmitter;
  rain.minEmitBox = new Vector3(-22, 4, -22);
  rain.maxEmitBox = new Vector3(22, 18, 22);
  rain.minSize = 1;
  rain.maxSize = 1;
  rain.minScaleX = 0.05;
  rain.maxScaleX = 0.09;
  rain.minScaleY = 0.45;
  rain.maxScaleY = 0.8;
  rain.minLifeTime = 0.5;
  rain.maxLifeTime = 0.9;
  rain.emitRate = 0;
  rain.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  rain.color1 = new Color4(0.7, 0.8, 0.95, 0.5);
  rain.color2 = new Color4(0.6, 0.72, 0.9, 0.35);
  rain.colorDead = new Color4(0.7, 0.8, 0.95, 0);
  rain.direction1 = new Vector3(-2, -26, -2);
  rain.direction2 = new Vector3(2, -34, 2);
  rain.minEmitPower = 0.9;
  rain.maxEmitPower = 1.1;
  rain.gravity = new Vector3(0, -5, 0);
  rain.updateSpeed = 0.016;
  rain.start();

  const snowTexture = createParticleTexture(scene, 'raw-replay-snow-texture', 32, 32, context => {
    const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 15);
    gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.7)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 32, 32);
  });
  const snow = new ParticleSystem('raw-replay-snow', 420, scene);
  snow.particleTexture = snowTexture;
  snow.emitter = weatherEmitter;
  snow.minEmitBox = new Vector3(-18, 2, -18);
  snow.maxEmitBox = new Vector3(18, 16, 18);
  snow.minSize = 0.06;
  snow.maxSize = 0.16;
  snow.minLifeTime = 8;
  snow.maxLifeTime = 15;
  snow.emitRate = 0;
  snow.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  snow.color1 = new Color4(1, 1, 1, 0.75);
  snow.color2 = new Color4(0.9, 0.95, 1, 0.5);
  snow.colorDead = new Color4(1, 1, 1, 0);
  snow.direction1 = new Vector3(-0.45, -1.8, -0.45);
  snow.direction2 = new Vector3(0.45, -3, 0.45);
  snow.gravity = new Vector3(0, -0.2, 0);
  snow.minAngularSpeed = -0.5;
  snow.maxAngularSpeed = 0.5;
  snow.updateSpeed = 0.016;
  snow.start();

  const makeBody = (
    id: string,
    color: string,
    diameter: number,
    emissive: number,
  ): Mesh => {
    const body = MeshBuilder.CreateSphere(`raw-replay-celestial-${id}`, {
      diameter,
      segments: 16,
    }, scene);
    body.parent = skyRoot;
    body.isPickable = false;
    body.renderingGroupId = 0;
    const material = new StandardMaterial(`raw-replay-celestial-${id}-mat`, scene);
    material.diffuseColor = Color3.FromHexString(color);
    material.emissiveColor = Color3.FromHexString(color).scale(emissive);
    material.specularColor = Color3.Black();
    material.disableLighting = true;
    body.material = material;
    return body;
  };

  const sunMesh = makeBody('sun', '#fff3cf', radius * 0.015, 1.4);
  const moonMesh = makeBody('moon', '#e8edf4', radius * 0.0135, 0.9);
  const planetMeshes = PLANET_META.map(planet => ({
    ...planet,
    mesh: makeBody(planet.id, planet.color, radius * 0.008 * planet.displaySize * 2.2, 1.1),
  }));

  const update = (
    dateMs: number,
    latitudeDeg: number,
    longitudeDeg: number,
    recordedClockMs?: number,
    weather?: HistoricalWeather | null,
  ): SkyState => {
    const lst = localSiderealTimeDeg(dateMs, longitudeDeg);

    // Positions of the fixed stars.
    for (let index = 0; index < stars.length; index += 1) {
      const star = stars[index];
      const horizontal = equatorialToHorizontal(star.raDeg, star.decDeg, latitudeDeg, lst);
      const direction = directionFromHorizontal(horizontal.altitudeDeg, horizontal.azimuthDeg);
      positions[index * 3] = direction.x * radius;
      positions[index * 3 + 1] = direction.y * radius;
      positions[index * 3 + 2] = direction.z * radius;
    }
    starMesh.updateVerticesData(VertexBuffer.PositionKind, positions, false, false);

    const sun = sunEquatorial(dateMs);
    const sunHorizontal = equatorialToHorizontal(sun.raDeg, sun.decDeg, latitudeDeg, lst);
    sunMesh.position.copyFrom(
      directionFromHorizontal(sunHorizontal.altitudeDeg, sunHorizontal.azimuthDeg).scale(radius * 0.985),
    );
    sunMesh.setEnabled(sunHorizontal.altitudeDeg > -1.2);

    const palette = skyPaletteForSunAltitude(sunHorizontal.altitudeDeg);
    const sunDirection = directionFromHorizontal(sunHorizontal.altitudeDeg, sunHorizontal.azimuthDeg);
    const daylight = clamp((sunHorizontal.altitudeDeg + 5) / 15, 0, 1);
    const overcast = clamp(weather?.overcast ?? 0, 0, 1);
    const cloudCover = clamp(weather ? weather.cloudCover : 0.18, 0, 1);
    const precipitationIntensity = clamp(weather?.precipitationIntensity ?? 0, 0, 1);
    const haze = clamp(weather?.haze ?? 0, 0, 1);

    // Preetham scattering follows the real sun; historical weather then adds
    // haze and softens the sun without changing its astronomical direction.
    skyMaterial.sunPosition.copyFrom(sunDirection.scale(radius));
    skyMaterial.turbidity = 3 + haze * 12 + overcast * 5;
    skyMaterial.rayleigh = clamp(2.2 - overcast * 0.85, 0.7, 3);
    skyMaterial.mieCoefficient = 0.003 + haze * 0.011 + overcast * 0.004;
    skyMaterial.mieDirectionalG = 0.78 + overcast * 0.08;
    // SkyMaterial's tone mapper expects luminance in ]0, 1[; values above ~1.19
    // drive log2(2 / luminance^4) negative and the sky renders black.
    skyMaterial.luminance = clamp(0.92 - daylight * 0.16 + overcast * 0.02, 0.72, 0.98);

    // Real cloud cover drives both procedural decks. A small default keeps the
    // sky from looking synthetic when historical weather is unavailable.
    cloudMaterial.setVector3('sunDirection', sunDirection);
    cloudMaterial.setColor3('sunColor', palette.glow);
    cloudMaterial.setColor3('skyTint', palette.horizon);
    cloudMaterial.setFloat('coverage', 0.8 - cloudCover * 0.55);
    cloudMaterial.setFloat('opacity', clamp(0.2 + cloudCover * 0.62 + precipitationIntensity * 0.16, 0, 0.96));
    cloudMaterial.setFloat('daylight', daylight);
    cloudMaterial.setFloat('time', (performance.now() / 1000) % 3600);

    const twilightStrength = clamp(1 - Math.abs(sunHorizontal.altitudeDeg + 2) / 12, 0, 1);
    twilightMaterial.setVector3('sunDirection', sunDirection);
    twilightMaterial.setColor3(
      'glowColor',
      Color3.Lerp(
        new Color3(0.95, 0.28, 0.1),
        new Color3(1, 0.72, 0.42),
        clamp((sunHorizontal.altitudeDeg + 8) / 10, 0, 1),
      ),
    );
    twilightMaterial.setFloat('intensity', twilightStrength * 0.5);

    // Dim the sun disc under an overcast deck.
    const sunMaterial = sunMesh.material as StandardMaterial;
    sunMaterial.emissiveColor = Color3.FromHexString('#fff3cf').scale(1.4 * (1 - overcast * 0.7));

    horizonMaterial.diffuseColor.copyFrom(palette.ground);
    horizonMaterial.emissiveColor.copyFrom(palette.ground.scale(0.85));

    // Airborne dust and reported precipitation share the camera-following emitter.
    const isRain = (weather?.precipitation === 'rain' || weather?.precipitation === 'mixed')
      && precipitationIntensity > 0.02;
    const isSnow = (weather?.precipitation === 'snow' || weather?.precipitation === 'mixed')
      && precipitationIntensity > 0.02;
    rain.emitRate = isRain ? 90 + precipitationIntensity * 720 : 0;
    snow.emitRate = isSnow ? 55 + precipitationIntensity * 320 : 0;
    dust.emitRate = weather?.precipitation === 'none' ? 8 + daylight * 26 : 4;
    dust.color1.a = 0.03 + daylight * 0.17;
    dust.color2.a = 0.02 + daylight * 0.1;

    const moon = moonPosition(dateMs);
    const moonHorizontal = equatorialToHorizontal(moon.raDeg, moon.decDeg, latitudeDeg, lst);
    moonMesh.position.copyFrom(
      directionFromHorizontal(moonHorizontal.altitudeDeg, moonHorizontal.azimuthDeg).scale(radius * 0.98),
    );
    moonMesh.setEnabled(moonHorizontal.altitudeDeg > -1.2);

    const visiblePlanets: string[] = [];
    planetMeshes.forEach(planet => {
      const coord = planetEquatorial(dateMs, planet.id);
      const horizontal = equatorialToHorizontal(coord.raDeg, coord.decDeg, latitudeDeg, lst);
      planet.mesh.position.copyFrom(
        directionFromHorizontal(horizontal.altitudeDeg, horizontal.azimuthDeg).scale(radius * 0.97),
      );
      // Planets are naked-eye objects only against a dark, clear sky.
      const visible = horizontal.altitudeDeg > 0.5
        && sunHorizontal.altitudeDeg < -2
        && overcast < 0.6;
      planet.mesh.setEnabled(visible);
      if (visible) visiblePlanets.push(planet.label);
    });

    // Stars fade through twilight and disappear once the sun is up; a thick
    // overcast deck hides them even at night.
    const starVisibility = clamp((-2 - sunHorizontal.altitudeDeg) / 12, 0, 1)
      * (1 - overcast * 0.85);
    starMaterial.alpha = starVisibility * 0.94;
    starMesh.setEnabled(starVisibility > 0.02);

    const skyPhase: SkyState['skyPhase'] = sunHorizontal.altitudeDeg >= 0
      ? 'day'
      : sunHorizontal.altitudeDeg >= -9
        ? 'twilight'
        : 'night';
    const clockMs = recordedClockMs ?? dateMs;
    const timeLabel = new Date(clockMs).toLocaleString(undefined, {
      ...(recordedClockMs != null ? { timeZone: 'UTC' } : {}),
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    return {
      timeLabel,
      skyPhase,
      horizonColor: palette.horizon,
      sunAltitudeDeg: sunHorizontal.altitudeDeg,
      sunAzimuthDeg: sunHorizontal.azimuthDeg,
      moonAltitudeDeg: moonHorizontal.altitudeDeg,
      moonIllumination: moon.illumination,
      visiblePlanets,
      approximateLocation: false,
      approximateTime: false,
      starCount: stars.length,
      sunVisible: sunHorizontal.altitudeDeg > -1.2,
      moonVisible: moonHorizontal.altitudeDeg > -1.2,
    };
  };

  return {
    root,
    radius,
    update,
    // Keep the sky sphere centered on the eye. Scaling it to the orbit radius
    // left the camera outside it in Follow mode and put it inside the terrain.
    syncCamera: cameraPosition => {
      skyRoot.position.copyFrom(cameraPosition);
      cloudMaterial.setVector3('cameraPosition', cameraPosition);
      twilightMaterial.setVector3('cameraPosition', cameraPosition);
    },
    setEnabled: enabled => root.setEnabled(enabled),
  };
};

export interface SatelliteSkyRig {
  root: TransformNode;
  update: (origin: Vector3, count: number, span: number, seed: string) => number;
  setEnabled: (enabled: boolean) => void;
}

const MAX_SATELLITES = 36;

/**
 * Representative GNSS sky: the file supplies only a satellite count, so the
 * geometry distributes that many satellites across the visible dome. Lines
 * run from the rover antenna to each satellite.
 */
export const createSatelliteSkyRig = (scene: Scene, seedText: string): SatelliteSkyRig => {
  const root = new TransformNode('raw-replay-gnss-sky-root', scene);

  const initialPositions = new Float32Array(MAX_SATELLITES * 2 * 3);
  const lineColors: Color4[][] = Array.from({ length: MAX_SATELLITES }, () => [
    new Color4(0.45, 0.93, 1, 0.16),
    new Color4(0.45, 0.93, 1, 0.55),
  ]);
  const lines = MeshBuilder.CreateLineSystem('raw-replay-gnss-sat-lines', {
    lines: Array.from({ length: MAX_SATELLITES }, (_, index) => {
      const offset = index * 6;
      return [
        new Vector3(initialPositions[offset], initialPositions[offset + 1], initialPositions[offset + 2]),
        new Vector3(initialPositions[offset + 3], initialPositions[offset + 4], initialPositions[offset + 5]),
      ];
    }),
    colors: lineColors,
    updatable: true,
    useVertexAlpha: true,
  }, scene);
  lines.parent = root;
  lines.isPickable = false;
  lines.renderingGroupId = 2;

  const dot = MeshBuilder.CreateSphere('raw-replay-gnss-sat-dot', { diameter: 1, segments: 8 }, scene);
  dot.parent = root;
  dot.isPickable = false;
  dot.renderingGroupId = 2;
  dot.alwaysSelectAsActiveMesh = true;
  const dotMaterial = new StandardMaterial('raw-replay-gnss-sat-dot-mat', scene);
  dotMaterial.diffuseColor = Color3.FromHexString('#bff7ff');
  dotMaterial.emissiveColor = Color3.FromHexString('#bff7ff');
  dotMaterial.specularColor = Color3.Black();
  dotMaterial.disableLighting = true;
  dotMaterial.alpha = 0.95;
  dot.material = dotMaterial;

  const matrices = new Float32Array(MAX_SATELLITES * 16);
  dot.thinInstanceSetBuffer('matrix', matrices, 16, false);

  const positionSeed = seededRandom(`${seedText}|satellites`)() * 360;

  const update = (origin: Vector3, count: number, span: number, seed: string): number => {
    const safeCount = clamp(Math.round(count), 0, MAX_SATELLITES);
    if (safeCount === 0) {
      lines.setEnabled(false);
      dot.setEnabled(false);
      return 0;
    }
    lines.setEnabled(true);
    dot.setEnabled(true);

    const phase = (positionSeed + (seededRandom(seed)() * 360)) % 360;
    const distance = Math.max(span * 1.15, 780);
    const satelliteScale = Math.max(1.4, span * 0.0035);
    const nextPositions = new Float32Array(MAX_SATELLITES * 2 * 3);

    for (let index = 0; index < MAX_SATELLITES; index += 1) {
      const offset = index * 6;
      if (index >= safeCount) {
        nextPositions[offset] = origin.x;
        nextPositions[offset + 1] = origin.y;
        nextPositions[offset + 2] = origin.z;
        nextPositions[offset + 3] = origin.x;
        nextPositions[offset + 4] = origin.y;
        nextPositions[offset + 5] = origin.z;
        Matrix.Scaling(0, 0, 0).copyToArray(matrices, index * 16);
        continue;
      }
      const azimuth = (phase + index * 137.508) * DEG;
      const elevation = (18 + ((phase * 0.7 + index * 53.7) % 66)) * DEG;
      const horizontal = Math.cos(elevation);
      const satellite = new Vector3(
        origin.x + Math.sin(azimuth) * horizontal * distance,
        origin.y + Math.sin(elevation) * distance,
        origin.z + Math.cos(azimuth) * horizontal * distance,
      );
      nextPositions[offset] = origin.x;
      nextPositions[offset + 1] = origin.y;
      nextPositions[offset + 2] = origin.z;
      nextPositions[offset + 3] = satellite.x;
      nextPositions[offset + 4] = satellite.y;
      nextPositions[offset + 5] = satellite.z;

      const matrix = Matrix.Scaling(satelliteScale, satelliteScale, satelliteScale);
      matrix.setTranslationFromFloats(satellite.x, satellite.y, satellite.z);
      for (let element = 0; element < 16; element += 1) {
        matrices[index * 16 + element] = matrix.m[element];
      }
    }

    lines.updateVerticesData(VertexBuffer.PositionKind, nextPositions, false, false);
    dot.thinInstanceSetBuffer('matrix', matrices, 16, false);
    dot.thinInstanceCount = safeCount;
    return safeCount;
  };

  return {
    root,
    update,
    setEnabled: enabled => root.setEnabled(enabled),
  };
};
