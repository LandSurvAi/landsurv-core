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
  Matrix,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexBuffer,
  VertexData,
} from '@babylonjs/core';
import {
  BRIGHT_STARS,
  PLANET_META,
  equatorialToHorizontal,
  localSiderealTimeDeg,
  moonPosition,
  planetEquatorial,
  sunEquatorial,
} from '../../services/rawReplay/astronomy';

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
  ) => SkyState;
  /** Keeps the gradient dome outside the camera at every zoom level. */
  syncCamera: (cameraRadius: number) => void;
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

/** Vertical dome gradient: zenith over the horizon, dark ground below it. */
const domeColorForDirection = (direction: Vector3, palette: SkyPalette): Color3 => (
  direction.y >= 0
    ? Color3.Lerp(palette.horizon, palette.zenith, Math.pow(direction.y, 0.55))
    : Color3.Lerp(palette.horizon, palette.ground, Math.pow(-direction.y, 0.4))
);

export const createCelestialSky = (
  scene: Scene,
  radius: number,
  seedText: string,
  /** World Y for the opaque horizon disc. Defaults to the old near-zero height. */
  horizonFloorY?: number,
): CelestialSkyRig => {
  const root = new TransformNode('raw-replay-celestial-root', scene);
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
  starMesh.parent = root;
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

  // Day/night gradient dome. A flat clear colour cannot show a horizon;
  // this sphere renders the zenith-to-horizon gradient for whatever sun
  // altitude the raw file's timestamp produces. Depth writes are off so it
  // never occludes the stars, sun, moon or terrain drawn in front of it.
  const skyDome = MeshBuilder.CreateSphere('raw-replay-sky-dome', {
    diameter: radius * 2,
    segments: 32,
    sideOrientation: Mesh.BACKSIDE,
  }, scene);
  skyDome.parent = root;
  skyDome.isPickable = false;
  skyDome.renderingGroupId = 0;
  skyDome.alwaysSelectAsActiveMesh = true;
  const skyDomeMaterial = new StandardMaterial('raw-replay-sky-dome-mat', scene);
  skyDomeMaterial.diffuseColor = Color3.White();
  skyDomeMaterial.emissiveColor = Color3.Black();
  skyDomeMaterial.specularColor = Color3.Black();
  skyDomeMaterial.disableLighting = true;
  skyDomeMaterial.disableDepthWrite = true;
  skyDomeMaterial.backFaceCulling = true;
  skyDome.material = skyDomeMaterial;

  const domePositions = skyDome.getVerticesData(VertexBuffer.PositionKind) ?? [];
  const domeDirections: Vector3[] = [];
  for (let index = 0; index < domePositions.length; index += 3) {
    domeDirections.push(new Vector3(
      domePositions[index],
      domePositions[index + 1],
      domePositions[index + 2],
    ).normalize());
  }
  const domeColors = new Float32Array(domeDirections.length * 4);
  for (let index = 0; index < domeDirections.length; index += 1) {
    domeColors[index * 4 + 3] = 1;
  }
  skyDome.setVerticesData(VertexBuffer.ColorKind, domeColors, true, 4);
  skyDome.useVertexColors = true;
  skyDome.hasVertexAlpha = false;

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
    body.parent = root;
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

    // Paint the dome from the same sun altitude that drives the lights.
    const palette = skyPaletteForSunAltitude(sunHorizontal.altitudeDeg);
    const sunDirection = directionFromHorizontal(sunHorizontal.altitudeDeg, sunHorizontal.azimuthDeg);
    for (let index = 0; index < domeDirections.length; index += 1) {
      const direction = domeDirections[index];
      const base = domeColorForDirection(direction, palette);
      const sunDot = Math.max(0,
        direction.x * sunDirection.x + direction.y * sunDirection.y + direction.z * sunDirection.z,
      );
      const glow = palette.glowStrength * (Math.pow(sunDot, 24) * 0.9 + Math.pow(sunDot, 5) * 0.18);
      domeColors[index * 4] = clamp(base.r + palette.glow.r * glow, 0, 1);
      domeColors[index * 4 + 1] = clamp(base.g + palette.glow.g * glow, 0, 1);
      domeColors[index * 4 + 2] = clamp(base.b + palette.glow.b * glow, 0, 1);
    }
    skyDome.updateVerticesData(VertexBuffer.ColorKind, domeColors, false, false);
    horizonMaterial.diffuseColor.copyFrom(palette.ground);
    horizonMaterial.emissiveColor.copyFrom(palette.ground.scale(0.85));

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
      // Planets are naked-eye objects only against a dark sky; daylight hides them.
      const visible = horizontal.altitudeDeg > 0.5 && sunHorizontal.altitudeDeg < -2;
      planet.mesh.setEnabled(visible);
      if (visible) visiblePlanets.push(planet.label);
    });

    // Stars fade through twilight and disappear once the sun is up.
    const starVisibility = clamp((1.5 - sunHorizontal.altitudeDeg) / 13.5, 0, 1);
    starMaterial.alpha = starVisibility * 0.94;
    starMesh.setEnabled(starVisibility > 0.02);

    const skyPhase: SkyState['skyPhase'] = sunHorizontal.altitudeDeg >= 0
      ? 'day'
      : sunHorizontal.altitudeDeg >= -6
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
    // A camera parked outside a fixed-radius dome would see it in front of
    // the terrain. Scale the dome just beyond the orbit distance instead.
    syncCamera: cameraRadius => {
      const targetScale = Math.max(1.001, (cameraRadius * 1.08) / radius);
      if (Math.abs(skyDome.scaling.x - targetScale) > 0.005) {
        skyDome.scaling.setAll(targetScale);
      }
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
