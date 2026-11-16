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
  update: (dateMs: number, latitudeDeg: number, longitudeDeg: number) => SkyState;
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

  const update = (dateMs: number, latitudeDeg: number, longitudeDeg: number): SkyState => {
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
      const visible = horizontal.altitudeDeg > 0.5;
      planet.mesh.setEnabled(visible);
      if (visible) visiblePlanets.push(planet.label);
    });

    // Stars fade out as the sun climbs; the scene stays a night-sky review view.
    const daylight = clamp((sunHorizontal.altitudeDeg + 6) / 12, 0, 1);
    starMaterial.alpha = 0.1 + (1 - daylight) * 0.84;

    return {
      timeLabel: new Date(dateMs).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
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
