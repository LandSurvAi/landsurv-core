import {
  Color3,
  Color4,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Quaternion,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexData,
} from '@babylonjs/core';
import proj4 from 'proj4';
import {
  createCornerCubeFacetMaterial,
  createGraduatedPoleMaterial,
  createPrismTargetPlateMaterial,
  createTotalStationDisplayMaterial,
  createUhfRadioScreenMaterial,
  getSurveyMaterialKit,
} from './equipmentMaterials';
import {
  TRIPOD_DESIGN_APEX_M,
  buildHeavyDutySurveyTripod,
  buildModernGnssSmartAntenna,
  buildPrecisionTribrach,
  buildWindowsSurveyTabletRig,
  createAlignedStrut,
  makeGlowMaterial,
} from './equipmentSubAssemblies';
import type {
  BoundaryFile,
  Centerline,
  ContourGeneration,
  RasterUnderlay,
  Settings,
  SurveyLine,
  SurveyPoint,
  TinSurface,
} from '../../types';
import type { GnssQuality } from '../../services/rawReplay/types';
import { getStaticMap, type StaticMapRequest } from '../../services/staticMapsService';
import { decodeImageCached, mapWithConcurrency, planMapTiles } from '../../utils/mapTileCache';
import { underlayCorners } from '../../utils/rasterUnderlay';
import type { Basemap3DType } from './useRawReplayController';

export interface WorldMapping3D {
  originE: number;
  originN: number;
  originZ: number;
  minE: number;
  maxE: number;
  minN: number;
  maxN: number;
  minZ: number;
  maxZ: number;
  span: number;
  relief: number;
  verticalExaggeration: number;
  toWorld: (easting: number, northing: number, elevation?: number) => Vector3;
  toSurvey: (world: Vector3) => { easting: number; northing: number; elevation: number };
}

export interface FastTinSampler {
  hasTin: boolean;
  sample: (easting: number, northing: number) => number | null;
  resolveElevation: (rawElevation: number | undefined, easting: number, northing: number, offsetZ?: number) => number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** Material helper shared by the articulated field-equipment rigs. */
const makeMat = (
  scene: Scene,
  name: string,
  hex: string,
  alpha = 1,
  roughness = 0.5,
  emissiveStrength = 0.16,
): StandardMaterial => {
  const mat = new StandardMaterial(name, scene);
  const color = Color3.FromHexString(hex);
  mat.diffuseColor = color;
  mat.emissiveColor = color.scale(emissiveStrength);
  mat.specularColor = Color3.White().scale(clamp(1 - roughness, 0, 1) * 0.3);
  mat.alpha = alpha;
  return mat;
};

/** Barycentric interpolation inside a 2D triangle (E, N). */
function interpolateTriangleZ(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  px: number, py: number,
): number | null {
  const denom = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(denom) < 1e-12) return null;
  const wA = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / denom;
  const wB = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / denom;
  const wC = 1 - wA - wB;
  const eps = -1e-7;
  if (wA < eps || wB < eps || wC < eps) return null;
  return wA * az + wB * bz + wC * cz;
}

/**
 * Spatial grid accelerator over active TIN surfaces so thousands of 2D lines,
 * boundaries, and points can drape onto the TIN in milliseconds.
 */
export function createFastTinSampler(
  tinSurfaces: TinSurface[],
  originZ: number,
  minValidZ: number,
): FastTinSampler {
  const visibleTins = tinSurfaces.filter(t => !t.hidden && t.vertices.length >= 3 && t.triangles.length > 0);
  if (visibleTins.length === 0) {
    return {
      hasTin: false,
      sample: () => null,
      resolveElevation: (rawElevation, _e, _n, offsetZ = 0) => {
        if (rawElevation == null || !Number.isFinite(rawElevation) || rawElevation <= -9000) {
          return originZ + offsetZ;
        }
        if (Math.abs(rawElevation) < 1e-4 && Math.abs(minValidZ) > 25) {
          return originZ + offsetZ;
        }
        return rawElevation + offsetZ;
      },
    };
  }

  let minE = Number.POSITIVE_INFINITY;
  let maxE = Number.NEGATIVE_INFINITY;
  let minN = Number.POSITIVE_INFINITY;
  let maxN = Number.NEGATIVE_INFINITY;

  interface IndexedTri {
    ax: number; ay: number; az: number;
    bx: number; by: number; bz: number;
    cx: number; cy: number; cz: number;
  }

  const tris: IndexedTri[] = [];
  for (const tin of visibleTins) {
    const verts = tin.vertices;
    for (const [ia, ib, ic] of tin.triangles) {
      const a = verts[ia];
      const b = verts[ib];
      const c = verts[ic];
      if (!a || !b || !c) continue;
      minE = Math.min(minE, a.easting, b.easting, c.easting);
      maxE = Math.max(maxE, a.easting, b.easting, c.easting);
      minN = Math.min(minN, a.northing, b.northing, c.northing);
      maxN = Math.max(maxN, a.northing, b.northing, c.northing);
      tris.push({
        ax: a.easting, ay: a.northing, az: a.elevation,
        bx: b.easting, by: b.northing, bz: b.elevation,
        cx: c.easting, cy: c.northing, cz: c.elevation,
      });
    }
  }

  if (tris.length === 0 || !Number.isFinite(minE)) {
    return {
      hasTin: false,
      sample: () => null,
      resolveElevation: (rawElevation, _e, _n, offsetZ = 0) => (
        rawElevation != null && Number.isFinite(rawElevation) && rawElevation > -9000
          ? rawElevation + offsetZ
          : originZ + offsetZ
      ),
    };
  }

  const gridRes = 40;
  const spanE = Math.max(1, maxE - minE);
  const spanN = Math.max(1, maxN - minN);
  const buckets: number[][] = Array.from({ length: gridRes * gridRes }, () => []);

  tris.forEach((tri, idx) => {
    const tMinE = Math.min(tri.ax, tri.bx, tri.cx);
    const tMaxE = Math.max(tri.ax, tri.bx, tri.cx);
    const tMinN = Math.min(tri.ay, tri.by, tri.cy);
    const tMaxN = Math.max(tri.ay, tri.by, tri.cy);
    const x0 = clamp(Math.floor(((tMinE - minE) / spanE) * gridRes), 0, gridRes - 1);
    const x1 = clamp(Math.floor(((tMaxE - minE) / spanE) * gridRes), 0, gridRes - 1);
    const y0 = clamp(Math.floor(((tMinN - minN) / spanN) * gridRes), 0, gridRes - 1);
    const y1 = clamp(Math.floor(((tMaxN - minN) / spanN) * gridRes), 0, gridRes - 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        buckets[y * gridRes + x].push(idx);
      }
    }
  });

  const sample = (easting: number, northing: number): number | null => {
    if (easting < minE || easting > maxE || northing < minN || northing > maxN) return null;
    const gx = clamp(Math.floor(((easting - minE) / spanE) * gridRes), 0, gridRes - 1);
    const gy = clamp(Math.floor(((northing - minN) / spanN) * gridRes), 0, gridRes - 1);
    const candidates = buckets[gy * gridRes + gx];
    for (let i = 0; i < candidates.length; i++) {
      const t = tris[candidates[i]];
      const z = interpolateTriangleZ(t.ax, t.ay, t.az, t.bx, t.by, t.bz, t.cx, t.cy, t.cz, easting, northing);
      if (z !== null) return z;
    }
    return null;
  };

  return {
    hasTin: true,
    sample,
    resolveElevation: (rawElevation, easting, northing, offsetZ = 0) => {
      const isMissingOrZero2D =
        rawElevation == null
        || !Number.isFinite(rawElevation)
        || rawElevation <= -9000
        || (Math.abs(rawElevation) < 1e-4 && Math.abs(minValidZ) > 25);
      if (!isMissingOrZero2D) {
        return rawElevation + offsetZ;
      }
      const sampled = sample(easting, northing);
      return (sampled ?? originZ) + offsetZ;
    },
  };
}

/**
 * Hypsometric terrain color ramp (cool deep teal -> cyan -> emerald -> warm gold).
 */
export function elevationToHypsometricColor(t: number): { r: number; g: number; b: number } {
  const u = clamp(t, 0, 1);
  if (u < 0.35) {
    const k = u / 0.35;
    return {
      r: 0.06 + k * 0.06,
      g: 0.28 + k * 0.28,
      b: 0.38 + k * 0.22,
    };
  }
  if (u < 0.7) {
    const k = (u - 0.35) / 0.35;
    return {
      r: 0.12 + k * 0.28,
      g: 0.56 + k * 0.16,
      b: 0.60 - k * 0.26,
    };
  }
  const k = (u - 0.7) / 0.3;
  return {
    r: 0.40 + k * 0.48,
    g: 0.72 - k * 0.04,
    b: 0.34 - k * 0.14,
  };
}

/**
 * Tessellate a SurveyLine (straight segment, circular arc, or full circle) into 3D world points.
 */
export function tessellateSurveyLine3D(
  line: SurveyLine,
  pointMap: Map<string, SurveyPoint>,
  sampler: FastTinSampler,
  mapping: WorldMapping3D,
): Vector3[] | null {
  if (line.hidden || line.blendHidden || line.labelOnly) return null;

  if (line.isCircle && line.circleCenter && line.curveRadius && line.curveRadius > 0) {
    const cx = line.circleCenter.x;
    const cy = line.circleCenter.y;
    const cz = line.circleCenter.z;
    const r = line.curveRadius;
    const steps = 40;
    const pts: Vector3[] = [];
    for (let i = 0; i <= steps; i++) {
      const ang = (i / steps) * Math.PI * 2;
      const e = cx + Math.cos(ang) * r;
      const n = cy + Math.sin(ang) * r;
      const z = sampler.resolveElevation(cz, e, n, 0.12);
      pts.push(mapping.toWorld(e, n, z));
    }
    return pts;
  }

  let e1: number | undefined;
  let n1: number | undefined;
  let z1: number | undefined;
  let e2: number | undefined;
  let n2: number | undefined;
  let z2: number | undefined;

  if (line.fromPt) {
    e1 = line.fromPt.x;
    n1 = line.fromPt.y;
    z1 = line.fromPt.z;
  } else {
    const p1 = pointMap.get(line.from);
    if (p1) {
      e1 = p1.easting;
      n1 = p1.northing;
      z1 = p1.elevation;
    }
  }

  if (line.toPt) {
    e2 = line.toPt.x;
    n2 = line.toPt.y;
    z2 = line.toPt.z;
  } else {
    const p2 = pointMap.get(line.to);
    if (p2) {
      e2 = p2.easting;
      n2 = p2.northing;
      z2 = p2.elevation;
    }
  }

  if (e1 == null || n1 == null || e2 == null || n2 == null) return null;
  const chord = Math.hypot(e2 - e1, n2 - n1);
  if (chord < 1e-5) return null;

  const elev1 = sampler.resolveElevation(z1, e1, n1, 0.12);
  const elev2 = sampler.resolveElevation(z2, e2, n2, 0.12);

  if (line.isCurve && line.curveRadius && line.curveRadius > 0 && chord <= line.curveRadius * 2 + 1e-3) {
    const r = Math.max(line.curveRadius, chord / 2);
    const midE = (e1 + e2) / 2;
    const midN = (n1 + n2) / 2;
    const dE = e2 - e1;
    const dN = n2 - n1;
    // Right-hand normal to chord (from -> to)
    const nx = dN / chord;
    const ny = -dE / chord;
    const h = Math.sqrt(Math.max(0, r * r - (chord * chord) / 4));
    const sign = line.curveDirection === 'left' ? -1 : 1;
    const centerE = midE + nx * h * sign;
    const centerN = midN + ny * h * sign;

    const startAng = Math.atan2(n1 - centerN, e1 - centerE);
    const endAng = Math.atan2(n2 - centerN, e2 - centerE);
    let sweep = endAng - startAng;
    if (line.curveDirection === 'left') {
      if (sweep <= 0) sweep += Math.PI * 2;
    } else {
      if (sweep >= 0) sweep -= Math.PI * 2;
    }

    const steps = clamp(Math.ceil(Math.abs(sweep) * 18), 8, 36);
    const pts: Vector3[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const ang = startAng + sweep * t;
      const e = centerE + Math.cos(ang) * r;
      const n = centerN + Math.sin(ang) * r;
      const rawInterpZ = z1 != null && z2 != null && (Math.abs(z1) > 1e-4 || Math.abs(z2) > 1e-4)
        ? elev1 + (elev2 - elev1) * t
        : sampler.resolveElevation(undefined, e, n, 0.12);
      pts.push(mapping.toWorld(e, n, rawInterpZ));
    }
    return pts;
  }

  // If draping 2D line over a TIN, subdivide long segments so they hug the terrain
  const both2D = (z1 == null || Math.abs(z1) < 1e-4) && (z2 == null || Math.abs(z2) < 1e-4);
  if (sampler.hasTin && both2D && chord > mapping.span * 0.04) {
    const steps = clamp(Math.ceil(chord / (mapping.span * 0.03)), 2, 16);
    const pts: Vector3[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const e = e1 + (e2 - e1) * t;
      const n = n1 + (n2 - n1) * t;
      const z = sampler.resolveElevation(undefined, e, n, 0.14);
      pts.push(mapping.toWorld(e, n, z));
    }
    return pts;
  }

  return [
    mapping.toWorld(e1, n1, elev1),
    mapping.toWorld(e2, n2, elev2),
  ];
}

/**
 * Tessellate a Centerline alignment (including horizontal PI curves) into 3D points.
 */
export function tessellateCenterline3D(
  centerline: Centerline,
  sampler: FastTinSampler,
  mapping: WorldMapping3D,
): Vector3[] {
  const pis = centerline.pis;
  if (!pis || pis.length < 2) return [];
  const rawPts: Array<{ e: number; n: number }> = [];

  rawPts.push({ e: pis[0].easting, n: pis[0].northing });
  for (let i = 1; i < pis.length - 1; i++) {
    const prev = pis[i - 1];
    const curr = pis[i];
    const next = pis[i + 1];
    const r = curr.curveRadius;
    if (r && r > 0) {
      const v1x = curr.easting - prev.easting;
      const v1y = curr.northing - prev.northing;
      const v2x = next.easting - curr.easting;
      const v2y = next.northing - curr.northing;
      const len1 = Math.hypot(v1x, v1y);
      const len2 = Math.hypot(v2x, v2y);
      if (len1 > 1e-3 && len2 > 1e-3) {
        const u1x = v1x / len1;
        const u1y = v1y / len1;
        const u2x = v2x / len2;
        const u2y = v2y / len2;
        const dot = clamp(u1x * u2x + u1y * u2y, -0.9999, 0.9999);
        const delta = Math.acos(dot);
        const tangentDist = Math.min(len1 * 0.48, len2 * 0.48, r * Math.tan(delta / 2));
        if (tangentDist > 1e-2) {
          const pcE = curr.easting - u1x * tangentDist;
          const pcN = curr.northing - u1y * tangentDist;
          const ptE = curr.easting + u2x * tangentDist;
          const ptN = curr.northing + u2y * tangentDist;
          const steps = 14;
          for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const omt = 1 - t;
            const e = omt * omt * pcE + 2 * omt * t * curr.easting + t * t * ptE;
            const n = omt * omt * pcN + 2 * omt * t * curr.northing + t * t * ptN;
            rawPts.push({ e, n });
          }
          continue;
        }
      }
    }
    rawPts.push({ e: curr.easting, n: curr.northing });
  }
  const last = pis[pis.length - 1];
  rawPts.push({ e: last.easting, n: last.northing });

  return rawPts.map(pt => {
    const z = sampler.resolveElevation(undefined, pt.e, pt.n, 0.22);
    return mapping.toWorld(pt.e, pt.n, z);
  });
}

/**
 * Tessellate a BoundaryFile's calls into 3D world line segments.
 */
export function tessellateBoundaryFile3D(
  boundary: BoundaryFile,
  pointMap: Map<string, SurveyPoint>,
  sampler: FastTinSampler,
  mapping: WorldMapping3D,
): Vector3[][] {
  if (boundary.hidden || !boundary.calls || boundary.calls.length === 0) return [];
  const dE = (boundary.translationE ?? 0) - (boundary.bakedTransform?.translationE ?? 0);
  const dN = (boundary.translationN ?? 0) - (boundary.bakedTransform?.translationN ?? 0);
  const segments: Vector3[][] = [];

  for (const call of boundary.calls) {
    const p1 = pointMap.get(call.from);
    const p2 = pointMap.get(call.to);
    if (!p1 || !p2) continue;
    const e1 = p1.easting + dE;
    const n1 = p1.northing + dN;
    const e2 = p2.easting + dE;
    const n2 = p2.northing + dN;
    const z1 = sampler.resolveElevation(p1.elevation, e1, n1, 0.2);
    const z2 = sampler.resolveElevation(p2.elevation, e2, n2, 0.2);
    segments.push([mapping.toWorld(e1, n1, z1), mapping.toWorld(e2, n2, z2)]);
  }
  return segments;
}

/**
 * Build contour polylines from ContourGenerations in 3D world coordinates.
 */
export function buildContourGenerationLines3D(
  generations: ContourGeneration[],
  mapping: WorldMapping3D,
): { majorLines: Vector3[][]; minorLines: Vector3[][] } {
  const majorLines: Vector3[][] = [];
  const minorLines: Vector3[][] = [];

  for (const gen of generations) {
    if (!gen.visible || !gen.isoPaths) continue;
    for (const path of gen.isoPaths) {
      if (!path.vertices || path.vertices.length < 2) continue;
      const pts = path.vertices.map(v => mapping.toWorld(v.x, v.y, path.elevation + 0.06));
      if (path.isMajor) {
        majorLines.push(pts);
      } else {
        minorLines.push(pts);
      }
    }
  }
  return { majorLines, minorLines };
}

// ── 3D Basemap Composite Texture Loader ──────────────────────────────────────

function latToWorldY(latDeg: number): number {
  const lat = Math.max(-85.05112878, Math.min(85.05112878, latDeg));
  const sinLat = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI);
}

function worldYToLat(worldY: number): number {
  const rad = Math.atan(Math.sinh(Math.PI * (1 - 2 * worldY)));
  return (rad * 180) / Math.PI;
}

function bboxFromCenterZoom(lat: number, lng: number, zoom: number, width: number, height: number) {
  const scale = 256 * Math.pow(2, zoom);
  const cx = ((lng + 180) / 360) * scale;
  const cy = latToWorldY(lat) * scale;
  const leftX = cx - width / 2;
  const rightX = cx + width / 2;
  const topY = cy - height / 2;
  const bottomY = cy + height / 2;
  return {
    west: (leftX / scale) * 360 - 180,
    east: (rightX / scale) * 360 - 180,
    north: worldYToLat(topY / scale),
    south: worldYToLat(bottomY / scale),
  };
}

function zoomForBboxWgs84(bboxWgs84: [number, number, number, number]): number {
  const widthDeg = Math.max(1e-6, bboxWgs84[2] - bboxWgs84[0]);
  const heightDeg = Math.max(1e-6, bboxWgs84[3] - bboxWgs84[1]);
  const span = Math.max(widthDeg, heightDeg) * 1.15;
  const zoom = Math.floor(Math.log2((360 * 640) / (span * 256)));
  return Math.max(12, Math.min(20, zoom));
}

export interface BasemapCompositeResult {
  canvas: HTMLCanvasElement;
  minE: number;
  maxE: number;
  minN: number;
  maxN: number;
  tileCount: number;
  sourceLabel: string;
}

/** Shared padding factor for the composite basemap and the TIN drape UVs. */
export const RAW_REPLAY_BASEMAP_PAD_FACTOR = 1.15;

/** Exact survey-coordinate extent covered by the composite basemap texture. */
export const rawReplayBasemapExtent = (
  mapping: Pick<WorldMapping3D, 'minE' | 'maxE' | 'minN' | 'maxN' | 'span'>,
): { minE: number; maxE: number; minN: number; maxN: number } => {
  const pad = mapping.span * RAW_REPLAY_BASEMAP_PAD_FACTOR;
  return {
    minE: mapping.minE - pad,
    maxE: mapping.maxE + pad,
    minN: mapping.minN - pad,
    maxN: mapping.maxN + pad,
  };
};

/**
 * Fetches georeferenced map tiles (NAIP / Satellite / Hybrid / Roadmap / Terrain)
 * and raster underlays into a single composite canvas covering the 3D scene bounds.
 * This canvas can be applied both to the 3D ground plane and draped directly onto
 * 3D TIN terrain meshes via UV coordinates.
 */
export async function loadBasemapCompositeCanvas(opts: {
  mapping: WorldMapping3D;
  mapType: Basemap3DType;
  settings?: Settings;
  rasterUnderlays?: RasterUnderlay[];
  isCancelled: () => boolean;
}): Promise<BasemapCompositeResult | null> {
  const { mapping, mapType, settings, rasterUnderlays = [], isCancelled } = opts;
  // The CAD grid extends 1.6x the survey span from its centre, so the imagery
  // needs at least half the span plus 1.1x to reach past the grid edge.
  // The TIN drape consumes this exact extent for its UVs; using a different
  // pad magnifies and offsets the imagery on the mesh.
  const { minE, maxE, minN, maxN } = rawReplayBasemapExtent(mapping);
  const widthE = Math.max(1, maxE - minE);
  const heightN = Math.max(1, maxN - minN);

  const texSize = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = texSize;
  canvas.height = texSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const worldToCanvas = (e: number, n: number) => ({
    x: ((e - minE) / widthE) * texSize,
    y: ((maxN - n) / heightN) * texSize,
  });

  let drawnCount = 0;
  let sourceLabel = mapType.toUpperCase();
  const epsg = settings?.projection?.epsg;

  if (epsg) {
    const projectCrs = `EPSG:${epsg}`;
    try {
      if (mapType === 'naip') {
        const tiles = planMapTiles([minE, minN, maxE, maxN], 1600, { tilePx: 1024, maxTiles: 9 });
        await mapWithConcurrency(tiles, 4, async tile => {
          if (isCancelled()) return;
          try {
            const [x0, y0, x1, y1] = tile.bbox;
            const c = [
              proj4(projectCrs, 'EPSG:3857', [x0, y0]) as [number, number],
              proj4(projectCrs, 'EPSG:3857', [x1, y0]) as [number, number],
              proj4(projectCrs, 'EPSG:3857', [x1, y1]) as [number, number],
              proj4(projectCrs, 'EPSG:3857', [x0, y1]) as [number, number],
            ];
            if (c.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) return;
            const xs = c.map(p => p[0]);
            const ys = c.map(p => p[1]);
            const reqBbox: [number, number, number, number] = [
              Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys),
            ];
            const centerWgs = proj4(projectCrs, 'EPSG:4326', [(x0 + x1) / 2, (y0 + y1) / 2]) as [number, number];
            const res = await getStaticMap({
              lat: centerWgs[1],
              lng: centerWgs[0],
              width: 1024,
              height: 1024,
              maptype: 'naip',
              projectedBbox: reqBbox,
              sr: 3857,
            });
            if (isCancelled()) return;
            const img = await decodeImageCached(res.dataUrl);
            const [exMinX, exMinY, exMaxX, exMaxY] = res.extent ?? reqBbox;
            const sw = proj4('EPSG:3857', projectCrs, [exMinX, exMinY]) as [number, number];
            const ne = proj4('EPSG:3857', projectCrs, [exMaxX, exMaxY]) as [number, number];
            const tl = worldToCanvas(sw[0], ne[1]);
            const br = worldToCanvas(ne[0], sw[1]);
            ctx.drawImage(img, tl.x, tl.y, br.x - tl.x, br.y - tl.y);
            drawnCount += 1;
            sourceLabel = 'USGS NAIP';
          } catch {
            // Individual tile failed; continue with remaining tiles
          }
        });
      }

      if (drawnCount === 0 && !isCancelled()) {
        const cornersWgs84 = [
          proj4(projectCrs, 'EPSG:4326', [minE, minN]) as [number, number],
          proj4(projectCrs, 'EPSG:4326', [maxE, minN]) as [number, number],
          proj4(projectCrs, 'EPSG:4326', [maxE, maxN]) as [number, number],
          proj4(projectCrs, 'EPSG:4326', [minE, maxN]) as [number, number],
        ];
        if (cornersWgs84.every(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat))) {
          const lons = cornersWgs84.map(c => c[0]);
          const lats = cornersWgs84.map(c => c[1]);
          const wgsBbox: [number, number, number, number] = [
            Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats),
          ];
          const lat = (wgsBbox[1] + wgsBbox[3]) / 2;
          const lng = (wgsBbox[0] + wgsBbox[2]) / 2;
          const zoom = zoomForBboxWgs84(wgsBbox);
          const resolvedType: NonNullable<StaticMapRequest['maptype']> =
            mapType === 'naip' ? 'satellite' : mapType;
          const res = await getStaticMap(
            {
              lat,
              lng,
              zoom,
              width: 640,
              height: 640,
              maptype: resolvedType,
            },
            {
              mapsKey: settings?.googleMaps?.apiKey || undefined,
              geminiKey: settings?.userApiKey || undefined,
            },
          );
          if (!isCancelled()) {
            const img = await decodeImageCached(res.dataUrl);
            const imageWgs = bboxFromCenterZoom(lat, lng, zoom, 640, 640);
            const sw = proj4('EPSG:4326', projectCrs, [imageWgs.west, imageWgs.south]) as [number, number];
            const ne = proj4('EPSG:4326', projectCrs, [imageWgs.east, imageWgs.north]) as [number, number];
            const tl = worldToCanvas(sw[0], ne[1]);
            const br = worldToCanvas(ne[0], sw[1]);
            ctx.drawImage(img, tl.x, tl.y, br.x - tl.x, br.y - tl.y);
            drawnCount += 1;
            sourceLabel = resolvedType.toUpperCase();
          }
        }
      }
    } catch {
      // Projection or network error; fall through to underlays
    }
  }

  // Draw any visible RasterUnderlays onto the composite texture
  const visibleUnderlays = rasterUnderlays.filter(u => u.visible && u.opacity > 0);
  for (const underlay of visibleUnderlays) {
    if (isCancelled()) break;
    try {
      const img = await decodeImageCached(underlay.dataUrl);
      const corners = underlayCorners(underlay);
      if (corners.length === 4) {
        const tl = worldToCanvas(corners[0].easting, corners[0].northing);
        const tr = worldToCanvas(corners[1].easting, corners[1].northing);
        const bl = worldToCanvas(corners[3].easting, corners[3].northing);
        ctx.save();
        ctx.globalAlpha = clamp(underlay.opacity, 0, 1);
        const dxX = (tr.x - tl.x) / Math.max(1, underlay.imageWidth);
        const dxY = (tr.y - tl.y) / Math.max(1, underlay.imageWidth);
        const dyX = (bl.x - tl.x) / Math.max(1, underlay.imageHeight);
        const dyY = (bl.y - tl.y) / Math.max(1, underlay.imageHeight);
        ctx.transform(dxX, dxY, dyX, dyY, tl.x, tl.y);
        ctx.drawImage(img, 0, 0, underlay.imageWidth, underlay.imageHeight);
        ctx.restore();
        drawnCount += 1;
        if (!epsg) sourceLabel = underlay.name;
      }
    } catch {
      // Ignore invalid underlay image
    }
  }

  if (drawnCount === 0) return null;
  return {
    canvas,
    minE,
    maxE,
    minN,
    maxN,
    tileCount: drawnCount,
    sourceLabel,
  };
}

// ── Articulated 3D Survey Equipment Rigs ─────────────────────────────────────

export interface ArticulatedTotalStationRig {
  root: TransformNode;
  alidade: TransformNode;
  telescope: TransformNode;
  laserAperture: Mesh;
  updatePose: (
    setupPos: Vector3,
    instrumentHeight: number,
    scaleMultiplier: number,
    targetWorldPos: Vector3 | null,
    hideInstrument?: boolean,
    projectUnitsPerMeter?: number,
  ) => {
    opticalCenter: Vector3;
    forwardDir: Vector3;
    yawRad: number;
    pitchRad: number;
  };
}

/**
 * Builds a precision-proportioned Robotic Total Station (modelled after Leica TS16 /
 * Trimble S7) mounted on a heavy-duty 2-poles-per-leg survey tripod with quick-release
 * cam clamps and pointed hardened-steel feet. Everything is authored in metres so a
 * recorded HI places the trunnion optical centre at exact true elevation.
 */
export function createTotalStationRig(scene: Scene, parent: TransformNode): ArticulatedTotalStationRig {
  const root = new TransformNode('rig-total-station-root', scene);
  root.parent = parent;

  const kit = getSurveyMaterialKit(scene);
  const tsScreenMat = createTotalStationDisplayMaterial(scene);
  const statusLedMat = makeGlowMaterial(scene, 'ts-status-led', '#22c55e');
  const trackLightAmberMat = makeGlowMaterial(scene, 'ts-egl-amber', '#f59e0b');
  const trackLightRedMat = makeGlowMaterial(scene, 'ts-egl-red', '#f43f5e');
  const edmGlowMat = makeGlowMaterial(scene, 'ts-edm-window', '#22d3ee');
  const sightWhiteMat = makeGlowMaterial(scene, 'ts-collimator-dot', '#f8fafc');

  // ── 1. Heavy-Duty Dual-Strut Survey Tripod (2 poles/leg, QR clamps, pointy spikes)
  const legsGroup = buildHeavyDutySurveyTripod(scene, root, 'ts', true);

  // ── 2. Instrument Head (Tribrach + Motorized Alidade + Coaxial Telescope) ─────
  const headRoot = new TransformNode('ts-head-root', scene);
  headRoot.parent = root;

  // Precision 3-jaw tribrach (0.000 .. 0.090 m)
  buildPrecisionTribrach(scene, headRoot, 'ts');

  // ── Rotating Robotic Alidade (base at y = 0.090 m) ───────────────────────────
  const alidade = new TransformNode('ts-alidade', scene);
  alidade.parent = headRoot;
  alidade.position.y = 0.09;

  // MagDrive servo rotation collar & azimuth seal ring
  const servoCollar = MeshBuilder.CreateCylinder('ts-servo-collar', {
    height: 0.018,
    diameterTop: 0.156,
    diameterBottom: 0.144,
    tessellation: 32,
  }, scene);
  servoCollar.parent = alidade;
  servoCollar.position.y = 0.009;
  servoCollar.material = kit.machinedAluminum;
  servoCollar.isPickable = false;

  const baseDrum = MeshBuilder.CreateCylinder('ts-alidade-base', {
    height: 0.058,
    diameterTop: 0.172,
    diameterBottom: 0.166,
    tessellation: 36,
  }, scene);
  baseDrum.parent = alidade;
  baseDrum.position.y = 0.046;
  baseDrum.material = kit.castMagnesiumDark;
  baseDrum.isPickable = false;

  const brandBand = MeshBuilder.CreateCylinder('ts-brand-band', {
    height: 0.008,
    diameter: 0.174,
    tessellation: 36,
  }, scene);
  brandBand.parent = alidade;
  brandBand.position.y = 0.062;
  brandBand.material = kit.safetyYellowCoat;
  brandBand.isPickable = false;

  // Center recessed saddle between the two robotic standards
  const centerSaddle = MeshBuilder.CreateBox('ts-alidade-saddle', {
    width: 0.118,
    height: 0.022,
    depth: 0.112,
  }, scene);
  centerSaddle.parent = alidade;
  centerSaddle.position.set(0, 0.074, 0);
  centerSaddle.material = kit.castAnthracite;
  centerSaddle.isPickable = false;

  // Left & Right Sculpted Robotic Standards (uprights carrying trunnion axis at y = 0.15 m)
  for (const side of [-1, 1] as const) {
    // Lower sculpted shoulder block
    const stdLower = MeshBuilder.CreateBox(`ts-standard-lower-${side}`, {
      width: 0.044,
      height: 0.066,
      depth: 0.106,
    }, scene);
    stdLower.parent = alidade;
    stdLower.position.set(side * 0.072, 0.098, 0);
    stdLower.material = kit.leicaTealSlate;
    stdLower.isPickable = false;

    // Upper tapered trunnion tower
    const stdUpper = MeshBuilder.CreateBox(`ts-standard-upper-${side}`, {
      width: 0.040,
      height: 0.064,
      depth: 0.086,
    }, scene);
    stdUpper.parent = alidade;
    stdUpper.position.set(side * 0.073, 0.154, 0);
    stdUpper.material = kit.castMagnesiumDark;
    stdUpper.isPickable = false;

    // Rounded top shoulder cap on each standard
    const stdCrown = MeshBuilder.CreateCylinder(`ts-standard-crown-${side}`, {
      height: 0.040,
      diameter: 0.086,
      tessellation: 24,
    }, scene);
    stdCrown.parent = alidade;
    stdCrown.rotation.z = Math.PI / 2;
    stdCrown.position.set(side * 0.073, 0.184, 0);
    stdCrown.scaling.x = 0.36;
    stdCrown.material = kit.castMagnesiumDark;
    stdCrown.isPickable = false;

    // Outer two-tone sculpted cheek cover plate
    const cheekPlate = MeshBuilder.CreateBox(`ts-standard-cheek-${side}`, {
      width: 0.006,
      height: 0.096,
      depth: 0.076,
    }, scene);
    cheekPlate.parent = alidade;
    cheekPlate.position.set(side * 0.095, 0.128, 0);
    cheekPlate.material = kit.radomeMatteWhite;
    cheekPlate.isPickable = false;

    // Machined aluminum trunnion bearing cap & accent ring at y = 0.15 m
    const trunnionCap = MeshBuilder.CreateCylinder(`ts-trunnion-cap-${side}`, {
      height: 0.010,
      diameter: 0.046,
      tessellation: 24,
    }, scene);
    trunnionCap.parent = alidade;
    trunnionCap.rotation.z = Math.PI / 2;
    trunnionCap.position.set(side * 0.100, 0.150, 0);
    trunnionCap.material = kit.machinedAluminum;
    trunnionCap.isPickable = false;

    const trunnionRing = MeshBuilder.CreateTorus(`ts-trunnion-ring-${side}`, {
      diameter: 0.048,
      thickness: 0.0035,
      tessellation: 24,
    }, scene);
    trunnionRing.parent = alidade;
    trunnionRing.rotation.z = Math.PI / 2;
    trunnionRing.position.set(side * 0.104, 0.150, 0);
    trunnionRing.material = kit.safetyOrangeCoat;
    trunnionRing.isPickable = false;
  }

  // Right Standard (+X): Coaxial Endless Horizontal & Vertical Fine-Motion Drives + Quick-Trigger Key
  const hzDriveOuter = MeshBuilder.CreateCylinder('ts-hz-servo-knob', {
    height: 0.020,
    diameter: 0.036,
    tessellation: 22,
  }, scene);
  hzDriveOuter.parent = alidade;
  hzDriveOuter.rotation.z = Math.PI / 2;
  hzDriveOuter.position.set(0.106, 0.088, -0.024);
  hzDriveOuter.material = kit.knurledBlackAnodized;
  hzDriveOuter.isPickable = false;

  const vtDriveInner = MeshBuilder.CreateCylinder('ts-vt-servo-knob', {
    height: 0.012,
    diameter: 0.024,
    tessellation: 20,
  }, scene);
  vtDriveInner.parent = alidade;
  vtDriveInner.rotation.z = Math.PI / 2;
  vtDriveInner.position.set(0.119, 0.088, -0.024);
  vtDriveInner.material = kit.knurledSteel;
  vtDriveInner.isPickable = false;

  // Quick-Measure Side Trigger Key on +X standard
  const triggerBtn = MeshBuilder.CreateCylinder('ts-measure-trigger-key', {
    height: 0.006,
    diameter: 0.014,
    tessellation: 16,
  }, scene);
  triggerBtn.parent = alidade;
  triggerBtn.rotation.z = Math.PI / 2;
  triggerBtn.position.set(0.100, 0.122, -0.028);
  triggerBtn.material = kit.safetyOrangeCoat;
  triggerBtn.isPickable = false;

  // Left Standard (-X): Hot-Swappable Li-Ion Battery Cassette & Release Latch
  const batteryCassette = MeshBuilder.CreateBox('ts-side-battery', {
    width: 0.014,
    height: 0.078,
    depth: 0.056,
  }, scene);
  batteryCassette.parent = alidade;
  batteryCassette.position.set(-0.102, 0.118, 0.004);
  batteryCassette.material = kit.matteGraphite;
  batteryCassette.isPickable = false;

  const batteryLatch = MeshBuilder.CreateBox('ts-side-battery-latch', {
    width: 0.006,
    height: 0.016,
    depth: 0.024,
  }, scene);
  batteryLatch.parent = alidade;
  batteryLatch.position.set(-0.110, 0.150, 0.004);
  batteryLatch.material = kit.safetyYellowCoat;
  batteryLatch.isPickable = false;

  // ── Face I Angled Onboard Touchscreen & Alphanumeric Panel (-Z eyepiece side)
  const panelNode = new TransformNode('ts-control-panel-node', scene);
  panelNode.parent = alidade;
  panelNode.position.set(0, 0.048, -0.090);
  panelNode.rotation.x = 0.28; // tilted upward toward operator's eyes

  const panelHousing = MeshBuilder.CreateBox('ts-display-housing', {
    width: 0.146,
    height: 0.086,
    depth: 0.024,
  }, scene);
  panelHousing.parent = panelNode;
  panelHousing.material = kit.castAnthracite;
  panelHousing.isPickable = false;

  const lcdBezel = MeshBuilder.CreateBox('ts-display-bezel', {
    width: 0.098,
    height: 0.062,
    depth: 0.004,
  }, scene);
  lcdBezel.parent = panelNode;
  lcdBezel.position.set(-0.018, 0.006, -0.013);
  lcdBezel.material = kit.matteGraphite;
  lcdBezel.isPickable = false;

  const lcdPlane = MeshBuilder.CreatePlane('ts-display-screen', {
    width: 0.090,
    height: 0.054,
  }, scene);
  lcdPlane.parent = panelNode;
  lcdPlane.position.set(-0.018, 0.006, -0.0155);
  lcdPlane.material = tsScreenMat;
  lcdPlane.isPickable = false;

  // Softkey row below LCD + right-side tactile keypad & nav ring
  for (let sk = 0; sk < 4; sk++) {
    const fKey = MeshBuilder.CreateBox(`ts-softkey-${sk}`, {
      width: 0.018,
      height: 0.007,
      depth: 0.004,
    }, scene);
    fKey.parent = panelNode;
    fKey.position.set(-0.051 + sk * 0.022, -0.030, -0.014);
    fKey.material = kit.knurledBlackAnodized;
    fKey.isPickable = false;
  }

  // Right-side 4-way nav ring + Enter button on Face I panel
  const navRing = MeshBuilder.CreateTorus('ts-nav-ring', {
    diameter: 0.026,
    thickness: 0.0045,
    tessellation: 20,
  }, scene);
  navRing.parent = panelNode;
  navRing.rotation.x = Math.PI / 2;
  navRing.position.set(0.048, 0.014, -0.0135);
  navRing.material = kit.machinedAluminum;
  navRing.isPickable = false;

  const enterKey = MeshBuilder.CreateCylinder('ts-enter-key', {
    height: 0.005,
    diameter: 0.011,
    tessellation: 14,
  }, scene);
  enterKey.parent = panelNode;
  enterKey.rotation.x = Math.PI / 2;
  enterKey.position.set(0.048, 0.014, -0.0145);
  enterKey.material = kit.safetyOrangeCoat;
  enterKey.isPickable = false;

  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      const fnKey = MeshBuilder.CreateBox(`ts-fn-key-${r}-${c}`, {
        width: 0.012,
        height: 0.008,
        depth: 0.004,
      }, scene);
      fnKey.parent = panelNode;
      fnKey.position.set(0.040 + c * 0.016, -0.012 - r * 0.013, -0.014);
      fnKey.material = kit.knurledBlackAnodized;
      fnKey.isPickable = false;
    }
  }

  const statusLight = MeshBuilder.CreateSphere('ts-status-led', { diameter: 0.006, segments: 8 }, scene);
  statusLight.parent = panelNode;
  statusLight.position.set(0.062, 0.034, -0.014);
  statusLight.material = statusLedMat;
  statusLight.isPickable = false;

  // Face II (+Z objective side) Comms / Lemo / USB Dust Cover Port Block
  const commsBlock = MeshBuilder.CreateBox('ts-comms-port-block', {
    width: 0.094,
    height: 0.036,
    depth: 0.016,
  }, scene);
  commsBlock.parent = alidade;
  commsBlock.position.set(0, 0.038, 0.086);
  commsBlock.material = kit.rubberGrip;
  commsBlock.isPickable = false;

  // ── Detachable Top Carry Handle + Integrated 2.4 GHz Robotic Radio Pod ──────
  for (const side of [-1, 1] as const) {
    const hPost = MeshBuilder.CreateBox(`ts-handle-post-${side}`, {
      width: 0.022,
      height: 0.048,
      depth: 0.034,
    }, scene);
    hPost.parent = alidade;
    hPost.position.set(side * 0.073, 0.218, 0);
    hPost.material = kit.castAnthracite;
    hPost.isPickable = false;

    // Knurled handle retention thumbscrew
    const hScrew = MeshBuilder.CreateCylinder(`ts-handle-screw-${side}`, {
      height: 0.010,
      diameter: 0.018,
      tessellation: 16,
    }, scene);
    hScrew.parent = alidade;
    hScrew.rotation.z = Math.PI / 2;
    hScrew.position.set(side * 0.088, 0.206, 0);
    hScrew.material = kit.knurledSteel;
    hScrew.isPickable = false;
  }

  const handleBar = MeshBuilder.CreateBox('ts-handle-bar', {
    width: 0.168,
    height: 0.022,
    depth: 0.038,
  }, scene);
  handleBar.parent = alidade;
  handleBar.position.set(0, 0.244, 0);
  handleBar.material = kit.castMagnesiumDark;
  handleBar.isPickable = false;

  // Ribbed TPU overmolded ergonomic carry grip
  const handleGrip = MeshBuilder.CreateCylinder('ts-handle-grip', {
    height: 0.112,
    diameter: 0.028,
    tessellation: 20,
  }, scene);
  handleGrip.parent = alidade;
  handleGrip.rotation.z = Math.PI / 2;
  handleGrip.position.set(0, 0.246, 0);
  handleGrip.material = kit.rubberGrip;
  handleGrip.isPickable = false;

  // Integrated RadioHandle modem pod + articulated 2.4 GHz SMA whip antenna
  const radioPod = MeshBuilder.CreateBox('ts-radio-handle-pod', {
    width: 0.052,
    height: 0.026,
    depth: 0.048,
  }, scene);
  radioPod.parent = alidade;
  radioPod.position.set(-0.056, 0.248, 0.010);
  radioPod.material = kit.castAnthracite;
  radioPod.isPickable = false;

  const smaNut = MeshBuilder.CreateCylinder('ts-radio-sma-nut', {
    height: 0.012,
    diameter: 0.011,
    tessellation: 12,
  }, scene);
  smaNut.parent = alidade;
  smaNut.position.set(-0.066, 0.266, 0.014);
  smaNut.material = kit.brassHardware;
  smaNut.isPickable = false;

  const antennaWhip = MeshBuilder.CreateCylinder('ts-radio-antenna', {
    height: 0.098,
    diameterTop: 0.005,
    diameterBottom: 0.009,
    tessellation: 12,
  }, scene);
  antennaWhip.parent = alidade;
  antennaWhip.position.set(-0.072, 0.318, 0.014);
  antennaWhip.rotation.z = 0.08;
  antennaWhip.material = kit.rubberGrip;
  antennaWhip.isPickable = false;

  // ── 3. Tilting Coaxial EDM / ATRplus Telescope (trunnion at y = 0.15 m) ──────
  const telescope = new TransformNode('ts-telescope', scene);
  telescope.parent = alidade;
  telescope.position.set(0, 0.15, 0);

  const trunnionAxle = MeshBuilder.CreateCylinder('ts-trunnion-axle', {
    height: 0.192,
    diameter: 0.022,
    tessellation: 20,
  }, scene);
  trunnionAxle.parent = telescope;
  trunnionAxle.rotation.z = Math.PI / 2;
  trunnionAxle.material = kit.hardenedSteel;
  trunnionAxle.isPickable = false;

  // Central sculpted EDM / ATR prism block housing
  const centerPrismBox = MeshBuilder.CreateBox('ts-scope-center-block', {
    width: 0.082,
    height: 0.088,
    depth: 0.092,
  }, scene);
  centerPrismBox.parent = telescope;
  centerPrismBox.position.z = 0.004;
  centerPrismBox.material = kit.castMagnesiumDark;
  centerPrismBox.isPickable = false;

  // Tapered front objective barrel (+Z)
  const frontBarrel = MeshBuilder.CreateCylinder('ts-scope-front-barrel', {
    height: 0.082,
    diameterTop: 0.076,
    diameterBottom: 0.070,
    tessellation: 32,
  }, scene);
  frontBarrel.parent = telescope;
  frontBarrel.rotation.x = Math.PI / 2;
  frontBarrel.position.z = 0.082;
  frontBarrel.material = kit.leicaTealSlate;
  frontBarrel.isPickable = false;

  // Flared matte-graphite open anti-glare objective sunshade hood
  const sunHood = MeshBuilder.CreateCylinder('ts-objective-hood', {
    height: 0.030,
    diameterTop: 0.084,
    diameterBottom: 0.076,
    tessellation: 32,
    cap: Mesh.NO_CAP,
    sideOrientation: Mesh.DOUBLESIDE,
  }, scene);
  sunHood.parent = telescope;
  sunHood.rotation.x = Math.PI / 2;
  sunHood.position.z = 0.136;
  sunHood.material = kit.matteGraphite;
  sunHood.isPickable = false;

  const hoodTrimRing = MeshBuilder.CreateTorus('ts-objective-trim-ring', {
    diameter: 0.083,
    thickness: 0.0035,
    tessellation: 32,
  }, scene);
  hoodTrimRing.parent = telescope;
  hoodTrimRing.rotation.x = Math.PI / 2;
  hoodTrimRing.position.z = 0.150;
  hoodTrimRing.material = kit.safetyYellowCoat;
  hoodTrimRing.isPickable = false;

  // Multi-coated curved meniscus objective glass lens recessed inside open sunHood
  const objectiveLens = MeshBuilder.CreateSphere('ts-objective-lens', {
    diameter: 0.070,
    segments: 24,
  }, scene);
  objectiveLens.parent = telescope;
  objectiveLens.position.z = 0.126;
  objectiveLens.scaling.z = 0.16;
  objectiveLens.material = kit.objectiveLensGlass;
  objectiveLens.isPickable = false;

  // Coaxial EDM / ATR laser emitter aperture inside objective
  const laserAperture = MeshBuilder.CreateCylinder('ts-laser-aperture', {
    height: 0.004,
    diameter: 0.013,
    tessellation: 16,
  }, scene);
  laserAperture.parent = telescope;
  laserAperture.rotation.x = Math.PI / 2;
  laserAperture.position.z = 0.133;
  laserAperture.material = edmGlowMat;
  laserAperture.isPickable = false;

  // Dual-color Electronic Guide Lights (EGL / TrackLight) above objective for rodman alignment
  const guidePod = MeshBuilder.CreateBox('ts-egl-pod', {
    width: 0.052,
    height: 0.018,
    depth: 0.044,
  }, scene);
  guidePod.parent = telescope;
  guidePod.position.set(0, 0.046, 0.098);
  guidePod.material = kit.castAnthracite;
  guidePod.isPickable = false;

  for (const [side, mat] of [[-1, trackLightAmberMat], [1, trackLightRedMat]] as const) {
    const egl = MeshBuilder.CreateCylinder(`ts-guide-light-${side}`, {
      height: 0.004,
      diameter: 0.009,
      tessellation: 14,
    }, scene);
    egl.parent = telescope;
    egl.rotation.x = Math.PI / 2;
    egl.position.set(side * 0.014, 0.046, 0.121);
    egl.material = mat;
    egl.isPickable = false;
  }

  // Top & bottom optical peep-sight collimators (usable in both Face I & Face II)
  for (const vSign of [-1, 1] as const) {
    const sightHousing = MeshBuilder.CreateBox(`ts-peep-sight-${vSign}`, {
      width: 0.016,
      height: 0.014,
      depth: 0.048,
    }, scene);
    sightHousing.parent = telescope;
    sightHousing.position.set(0, vSign * 0.050, 0.004);
    sightHousing.material = kit.matteGraphite;
    sightHousing.isPickable = false;

    const sightTri = MeshBuilder.CreateCylinder(`ts-peep-mark-${vSign}`, {
      height: 0.003,
      diameter: 0.007,
      tessellation: 3,
    }, scene);
    sightTri.parent = telescope;
    sightTri.rotation.x = Math.PI / 2;
    sightTri.position.set(0, vSign * 0.050, -0.021);
    sightTri.material = sightWhiteMat;
    sightTri.isPickable = false;
  }

  // Rear ocular tube, wide diamond-knurled coaxial focusing ring & ribbed rubber eyecup (-Z)
  const focusRing = MeshBuilder.CreateCylinder('ts-coaxial-focus-ring', {
    height: 0.028,
    diameter: 0.066,
    tessellation: 28,
  }, scene);
  focusRing.parent = telescope;
  focusRing.rotation.x = Math.PI / 2;
  focusRing.position.z = -0.058;
  focusRing.material = kit.knurledBlackAnodized;
  focusRing.isPickable = false;

  const ocularTube = MeshBuilder.CreateCylinder('ts-eyepiece-tube', {
    height: 0.046,
    diameterTop: 0.046,
    diameterBottom: 0.038,
    tessellation: 24,
  }, scene);
  ocularTube.parent = telescope;
  ocularTube.rotation.x = Math.PI / 2;
  ocularTube.position.z = -0.094;
  ocularTube.material = kit.castAnthracite;
  ocularTube.isPickable = false;

  const diopterRing = MeshBuilder.CreateCylinder('ts-diopter-ring', {
    height: 0.012,
    diameter: 0.042,
    tessellation: 22,
  }, scene);
  diopterRing.parent = telescope;
  diopterRing.rotation.x = Math.PI / 2;
  diopterRing.position.z = -0.118;
  diopterRing.material = kit.knurledSteel;
  diopterRing.isPickable = false;

  const eyecup = MeshBuilder.CreateCylinder('ts-rubber-eyecup', {
    height: 0.018,
    diameterTop: 0.040,
    diameterBottom: 0.046,
    tessellation: 24,
    cap: Mesh.NO_CAP,
    sideOrientation: Mesh.DOUBLESIDE,
  }, scene);
  eyecup.parent = telescope;
  eyecup.rotation.x = Math.PI / 2;
  eyecup.position.z = -0.132;
  eyecup.material = kit.rubberGrip;
  eyecup.isPickable = false;

  const ocularGlass = MeshBuilder.CreateCylinder('ts-ocular-lens', {
    height: 0.004,
    diameter: 0.028,
    tessellation: 18,
  }, scene);
  ocularGlass.parent = telescope;
  ocularGlass.rotation.x = Math.PI / 2;
  ocularGlass.position.z = -0.125;
  ocularGlass.material = kit.objectiveLensGlass;
  ocularGlass.isPickable = false;

  return {
    root,
    alidade,
    telescope,
    laserAperture,
    updatePose: (
      setupPos,
      instrumentHeight,
      scaleMultiplier,
      targetWorldPos,
      hideInstrument = false,
      projectUnitsPerMeter = 1,
    ) => {
      const equipmentScale = Math.max(0.15, scaleMultiplier);
      const unitScale = Math.max(0.1, projectUnitsPerMeter);
      const headScale = equipmentScale * unitScale;
      const effH = Math.max(0.5, instrumentHeight) * equipmentScale;
      // Tripod deck sits 0.24 m below the trunnion so the optical centre lands
      // at the exact recorded instrument height (HI).
      const legApex = Math.max(0.15 * headScale, effH - 0.24 * headScale);

      root.position.copyFrom(setupPos);
      // Keep tripod head & tube diameters at true physical scale (`headScale`)
      // while extending vertical height cleanly to `legApex`.
      legsGroup.scaling.set(headScale, legApex / TRIPOD_DESIGN_APEX_M, headScale);
      headRoot.position.y = legApex;
      headRoot.scaling.setAll(headScale);
      // Follow-pole framing and the eyepiece both look past the station: hide
      // its tripod and head, leaving the pole, prism, and collector in frame.
      legsGroup.setEnabled(!hideInstrument);
      headRoot.setEnabled(!hideInstrument);

      const opticalCenter = setupPos.add(new Vector3(0, effH, 0));
      let yawRad = alidade.rotation.y;
      let pitchRad = -telescope.rotation.x;
      let forwardDir = new Vector3(0, 0, 1);

      if (targetWorldPos) {
        const delta = targetWorldPos.subtract(opticalCenter);
        const len = delta.length();
        if (len > 1e-4) {
          forwardDir = delta.scale(1 / len);
          const horizDist = Math.hypot(delta.x, delta.z);
          yawRad = Math.atan2(delta.x, delta.z);
          pitchRad = Math.atan2(delta.y, Math.max(1e-4, horizDist));
          alidade.rotation.y = yawRad;
          telescope.rotation.x = -pitchRad;
        }
      }

      return { opticalCenter, forwardDir, yawRad, pitchRad };
    },
  };
}

export interface ArticulatedPrismPoleRig {
  root: TransformNode;
  prismHead: TransformNode;
  pulseRing: Mesh;
  updatePose: (
    shotPos: Vector3,
    rodHeight: number,
    scaleMultiplier: number,
    instrumentWorldPos: Vector3 | null,
    pulsePhase: number,
    projectUnitsPerMeter?: number,
  ) => Vector3;
}

/**
 * Builds a true-scale graduated red/white survey range pole (NO bipods) with a
 * pointed hardened-steel spike, side bullseye level, properly scaled 10.1" landscape
 * Windows 11 Survey Tablet displaying the "LandSurv.ai" name wordmark, and a
 * SINGLE-SIDED directional 62 mm corner-cube retroreflector prism assembly (+Z front
 * optical aperture ONLY, solid enclosed weatherproof cast-metal rear canister on -Z).
 */
export function createSurveyPoleRig(scene: Scene, parent: TransformNode): ArticulatedPrismPoleRig {
  const root = new TransformNode('rig-prism-pole-root', scene);
  root.parent = parent;

  const kit = getSurveyMaterialKit(scene);
  const graduatedPoleMat = createGraduatedPoleMaterial(scene);
  const targetFrontMat = createPrismTargetPlateMaterial(scene);
  const cornerCubeMat = createCornerCubeFacetMaterial(scene);

  // ── 1. Pointed Hardened-Steel Topo Shoe (uniformly scaled, never stretched) ──
  const shoeGroup = new TransformNode('pole-shoe-group', scene);
  shoeGroup.parent = root;

  const steelSpike = MeshBuilder.CreateCylinder('pole-steel-tip', {
    height: 0.076,
    diameterTop: 0.028,
    diameterBottom: 0.002,
    tessellation: 18,
  }, scene);
  steelSpike.parent = shoeGroup;
  steelSpike.position.y = 0.038;
  steelSpike.material = kit.hardenedSteel;
  steelSpike.isPickable = false;

  const shoeCollar = MeshBuilder.CreateCylinder('pole-shoe-collar', {
    height: 0.018,
    diameterTop: 0.033,
    diameterBottom: 0.029,
    tessellation: 20,
  }, scene);
  shoeCollar.parent = shoeGroup;
  shoeCollar.position.y = 0.085;
  shoeCollar.material = kit.knurledSteel;
  shoeCollar.isPickable = false;

  // ── 2. Graduated 32 mm Survey Range Pole Shaft (NO bipods) ───────────────────
  const shaftGroup = new TransformNode('pole-shaft-group', scene);
  shaftGroup.parent = root;

  const poleCylinder = MeshBuilder.CreateCylinder('pole-graduated-shaft', {
    height: 1.0,
    diameter: 0.032,
    tessellation: 22,
  }, scene);
  poleCylinder.parent = shaftGroup;
  poleCylinder.position.y = 0.5;
  poleCylinder.material = graduatedPoleMat;
  poleCylinder.isPickable = false;

  // Compression lock collar + side circular bullseye spirit level (uniformly scaled)
  const collarGroup = new TransformNode('pole-lock-collar-group', scene);
  collarGroup.parent = root;

  const lockSleeve = MeshBuilder.CreateCylinder('pole-compression-collar', {
    height: 0.048,
    diameterTop: 0.039,
    diameterBottom: 0.042,
    tessellation: 20,
  }, scene);
  lockSleeve.parent = collarGroup;
  lockSleeve.material = kit.knurledBlackAnodized;
  lockSleeve.isPickable = false;

  const lockRing = MeshBuilder.CreateCylinder('pole-collar-accent', {
    height: 0.006,
    diameter: 0.043,
    tessellation: 20,
  }, scene);
  lockRing.parent = collarGroup;
  lockRing.position.y = 0.016;
  lockRing.material = kit.safetyOrangeCoat;
  lockRing.isPickable = false;

  // Side-mounted circular bullseye rod level
  const levelBracket = MeshBuilder.CreateBox('pole-level-bracket', {
    width: 0.036,
    height: 0.014,
    depth: 0.028,
  }, scene);
  levelBracket.parent = collarGroup;
  levelBracket.position.set(-0.026, -0.055, -0.010);
  levelBracket.material = kit.castAnthracite;
  levelBracket.isPickable = false;

  const rodBubble = MeshBuilder.CreateCylinder('pole-bullseye-vial', {
    height: 0.008,
    diameter: 0.020,
    tessellation: 16,
  }, scene);
  rodBubble.parent = collarGroup;
  rodBubble.position.set(-0.034, -0.046, -0.010);
  rodBubble.material = kit.spiritBubbleVial;
  rodBubble.isPickable = false;

  // ── 3. Clamped Landscape Windows 11 Survey Tablet ("LandSurv.ai" Screen) ────
  const collectorGroup = new TransformNode('pole-collector-group', scene);
  collectorGroup.parent = root;
  buildWindowsSurveyTabletRig(scene, collectorGroup, 'robotic', 'prism');

  // ── 4. Single-Sided Directional Nodal/Traverse Prism Head (at y = effRod) ───
  const prismHead = new TransformNode('pole-prism-head', scene);
  prismHead.parent = root;

  // 5/8"-11 stainless swivel adapter base under prism yoke
  const swivelAdapter = MeshBuilder.CreateCylinder('prism-swivel-adapter', {
    height: 0.034,
    diameterTop: 0.038,
    diameterBottom: 0.032,
    tessellation: 20,
  }, scene);
  swivelAdapter.parent = prismHead;
  swivelAdapter.position.y = -0.094;
  swivelAdapter.material = kit.machinedAluminum;
  swivelAdapter.isPickable = false;

  // U-shaped tilting yoke fork straddling the canister
  const yokeBaseBar = MeshBuilder.CreateBox('prism-yoke-base-bar', {
    width: 0.166,
    height: 0.018,
    depth: 0.028,
  }, scene);
  yokeBaseBar.parent = prismHead;
  yokeBaseBar.position.y = -0.072;
  yokeBaseBar.material = kit.castAnthracite;
  yokeBaseBar.isPickable = false;

  for (const side of [-1, 1] as const) {
    const yokeArm = MeshBuilder.CreateBox(`prism-yoke-arm-${side}`, {
      width: 0.016,
      height: 0.094,
      depth: 0.028,
    }, scene);
    yokeArm.parent = prismHead;
    yokeArm.position.set(side * 0.075, -0.030, 0);
    yokeArm.material = kit.castAnthracite;
    yokeArm.isPickable = false;

    // Knurled tilt-locking knob on horizontal trunnion axis
    const tiltKnob = MeshBuilder.CreateCylinder(`prism-tilt-knob-${side}`, {
      height: 0.016,
      diameter: 0.030,
      tessellation: 20,
    }, scene);
    tiltKnob.parent = prismHead;
    tiltKnob.rotation.z = Math.PI / 2;
    tiltKnob.position.set(side * 0.092, 0, 0);
    tiltKnob.material = kit.safetyOrangeCoat;
    tiltKnob.isPickable = false;

    const trunnionPin = MeshBuilder.CreateCylinder(`prism-trunnion-pin-${side}`, {
      height: 0.022,
      diameter: 0.012,
      tessellation: 14,
    }, scene);
    trunnionPin.parent = prismHead;
    trunnionPin.rotation.z = Math.PI / 2;
    trunnionPin.position.set(side * 0.064, 0, 0);
    trunnionPin.material = kit.brassHardware;
    trunnionPin.isPickable = false;
  }

  // Detachable High-Visibility Sighting Target Plate
  const targetPlateBody = MeshBuilder.CreateBox('prism-target-backing', {
    width: 0.142,
    height: 0.136,
    depth: 0.006,
  }, scene);
  targetPlateBody.parent = prismHead;
  targetPlateBody.position.z = 0.002;
  targetPlateBody.material = kit.matteGraphite;
  targetPlateBody.isPickable = false;

  // Textured high-contrast yellow/orange geometric sighting chevron face (+Z front ONLY)
  const targetFrontFace = MeshBuilder.CreatePlane('prism-target-front-decal', {
    width: 0.140,
    height: 0.134,
  }, scene);
  targetFrontFace.parent = prismHead;
  targetFrontFace.rotation.y = Math.PI; // faces +Z toward Total Station
  targetFrontFace.position.z = 0.0056;
  targetFrontFace.material = targetFrontMat;
  targetFrontFace.isPickable = false;

  // Enclosed Cast-Metal Canister Housing (SOLID weatherproof rear on -Z, open optical hood on +Z)
  const frontOpticalBase = MeshBuilder.CreateCylinder('prism-front-base', {
    height: 0.028,
    diameter: 0.088,
    tessellation: 32,
  }, scene);
  frontOpticalBase.parent = prismHead;
  frontOpticalBase.rotation.x = Math.PI / 2;
  frontOpticalBase.position.z = 0.016;
  frontOpticalBase.material = kit.castAnthracite;
  frontOpticalBase.isPickable = false;

  // Open tubular front sunshade bezel around the single-sided prism lens (+Z ONLY)
  const frontOpticalBezel = MeshBuilder.CreateCylinder('prism-front-bezel', {
    height: 0.020,
    diameterTop: 0.090,
    diameterBottom: 0.088,
    tessellation: 32,
    cap: Mesh.NO_CAP,
    sideOrientation: Mesh.DOUBLESIDE,
  }, scene);
  frontOpticalBezel.parent = prismHead;
  frontOpticalBezel.rotation.x = Math.PI / 2;
  frontOpticalBezel.position.z = 0.039;
  frontOpticalBezel.material = kit.castAnthracite;
  frontOpticalBezel.isPickable = false;

  // Weatherproof anodized orange/ruby seal ring around front aperture (+Z ONLY)
  const frontSealRing = MeshBuilder.CreateTorus('prism-front-seal-ring', {
    diameter: 0.082,
    thickness: 0.006,
    tessellation: 32,
  }, scene);
  frontSealRing.parent = prismHead;
  frontSealRing.rotation.x = Math.PI / 2;
  frontSealRing.position.z = 0.047;
  frontSealRing.material = kit.safetyOrangeCoat;
  frontSealRing.isPickable = false;

  // SINGLE-SIDED 62 mm Corner-Cube Retroreflector Optical Disc (+Z front side ONLY!)
  const frontPrismDisc = MeshBuilder.CreateCylinder('prism-front-glass', {
    height: 0.004,
    diameter: 0.070,
    tessellation: 32,
  }, scene);
  frontPrismDisc.parent = prismHead;
  frontPrismDisc.rotation.x = Math.PI / 2;
  frontPrismDisc.position.z = 0.034;
  frontPrismDisc.material = cornerCubeMat;
  frontPrismDisc.isPickable = false;

  // 3 physical 3D copper-backed corner-cube dihedral mirror ridges inside front cavity
  for (let f = 0; f < 3; f++) {
    const finAngle = (f * 2 * Math.PI) / 3 + Math.PI / 6;
    const fin = MeshBuilder.CreateBox(`prism-dihedral-fin-${f}`, {
      width: 0.002,
      height: 0.032,
      depth: 0.005,
    }, scene);
    fin.parent = prismHead;
    fin.rotation.z = finAngle;
    fin.position.set(
      -Math.sin(finAngle) * 0.015,
      Math.cos(finAngle) * 0.015,
      0.037,
    );
    fin.material = kit.prismCopperCoat;
    fin.isPickable = false;
  }

  // Transparent clear-coated anti-reflective front optical cover window (+Z ONLY)
  const frontCoverWindow = MeshBuilder.CreateSphere('prism-front-cover-window', {
    diameter: 0.074,
    segments: 24,
  }, scene);
  frontCoverWindow.parent = prismHead;
  frontCoverWindow.position.z = 0.040;
  frontCoverWindow.scaling.z = 0.12;
  frontCoverWindow.material = kit.prismCornerCubeGlass;
  frontCoverWindow.isPickable = false;

  // SOLID ENCLOSED REAR CANISTER SHELL (-Z back side — NO rear prism glass!)
  const rearCanisterBody = MeshBuilder.CreateCylinder('prism-rear-enclosed-housing', {
    height: 0.044,
    diameterTop: 0.090,
    diameterBottom: 0.068,
    tessellation: 28,
  }, scene);
  rearCanisterBody.parent = prismHead;
  rearCanisterBody.rotation.x = Math.PI / 2;
  rearCanisterBody.position.z = -0.022;
  rearCanisterBody.material = kit.castMagnesiumDark;
  rearCanisterBody.isPickable = false;

  const rearEndCap = MeshBuilder.CreateCylinder('prism-rear-solid-cap', {
    height: 0.012,
    diameterTop: 0.066,
    diameterBottom: 0.048,
    tessellation: 24,
  }, scene);
  rearEndCap.parent = prismHead;
  rearEndCap.rotation.x = Math.PI / 2;
  rearEndCap.position.z = -0.048;
  rearEndCap.material = kit.safetyOrangeCoat;
  rearEndCap.isPickable = false;

  const rearOffsetBoss = MeshBuilder.CreateCylinder('prism-rear-offset-boss', {
    height: 0.008,
    diameter: 0.022,
    tessellation: 16,
  }, scene);
  rearOffsetBoss.parent = prismHead;
  rearOffsetBoss.rotation.x = Math.PI / 2;
  rearOffsetBoss.position.z = -0.056;
  rearOffsetBoss.material = kit.castAnthracite;
  rearOffsetBoss.isPickable = false;

  // Top optical pointing sight cone above target plate
  const topSightCone = MeshBuilder.CreateCylinder('prism-top-sight', {
    height: 0.034,
    diameterTop: 0.003,
    diameterBottom: 0.018,
    tessellation: 16,
  }, scene);
  topSightCone.parent = prismHead;
  topSightCone.position.y = 0.085;
  topSightCone.material = kit.radomeMatteWhite;
  topSightCone.isPickable = false;

  // Expanding shot lock pulse ring on the ground
  const pulseRing = MeshBuilder.CreateTorus('prism-shot-pulse', {
    diameter: 0.42,
    thickness: 0.018,
    tessellation: 36,
  }, scene);
  pulseRing.parent = root;
  pulseRing.position.y = 0.015;
  const pulseMat = makeGlowMaterial(scene, 'prism-pulse-mat', '#22d3ee', 0.88);
  pulseRing.material = pulseMat;
  pulseRing.isPickable = false;

  return {
    root,
    prismHead,
    pulseRing,
    updatePose: (
      shotPos,
      rodHeight,
      scaleMultiplier,
      instrumentWorldPos,
      pulsePhase,
      projectUnitsPerMeter = 1,
    ) => {
      const unitScale = Math.max(0.1, projectUnitsPerMeter);
      const equipScale = Math.max(0.15, scaleMultiplier) * unitScale;
      const effRod = Math.max(0.5 * unitScale, rodHeight * scaleMultiplier);

      root.position.copyFrom(shotPos);

      // Keep pointed steel spike at true undistorted aspect ratio
      const shoeHeight = 0.090 * equipScale;
      shoeGroup.scaling.setAll(equipScale);

      // Span graduated shaft cleanly from top of steel shoe to bottom of prism swivel base
      const topClearance = 0.105 * equipScale;
      const shaftSpan = Math.max(0.08 * equipScale, effRod - shoeHeight - topClearance);
      shaftGroup.position.y = shoeHeight;
      shaftGroup.scaling.set(equipScale, shaftSpan, equipScale);

      collarGroup.position.y = clamp(
        effRod * 0.68,
        shoeHeight + 0.12 * equipScale,
        Math.max(shoeHeight + 0.12 * equipScale, effRod - 0.18 * equipScale),
      );
      collarGroup.scaling.setAll(equipScale);

      // Ergonomic chest/waist height for the 10.1" Windows Survey Tablet
      collectorGroup.position.y = clamp(
        1.16 * equipScale,
        effRod * 0.42,
        Math.max(effRod * 0.42, effRod - 0.30 * equipScale),
      );
      collectorGroup.scaling.setAll(equipScale);

      prismHead.position.y = effRod;
      prismHead.scaling.setAll(equipScale);

      const prismWorldPos = shotPos.add(new Vector3(0, effRod, 0));
      if (instrumentWorldPos) {
        const d = instrumentWorldPos.subtract(prismWorldPos);
        if (Math.hypot(d.x, d.z) > 1e-3) {
          const yaw = Math.atan2(d.x, d.z);
          prismHead.rotation.y = yaw;
          collarGroup.rotation.y = yaw;
        }
      }

      const p = clamp(pulsePhase, 0, 1);
      const ringScale = equipScale * (0.7 + p * 1.8);
      pulseRing.scaling.set(ringScale, equipScale, ringScale);
      if (pulseRing.material) {
        pulseRing.material.alpha = (1 - p * 0.72) * 0.88;
      }

      return prismWorldPos;
    },
  };
}

export interface ArticulatedGnssBaseRig {
  root: TransformNode;
  topPosition: Vector3;
  updatePose: (position: Vector3, scaleMultiplier: number, projectUnitsPerMeter?: number) => Vector3;
}

/**
 * Local GNSS RTK Base Station: heavy-duty 2-poles-per-leg quick-release survey tripod
 * with pointed steel feet, precision 3-jaw tribrach + carrier extension mast, modern
 * GNSS smart antenna, and external 35W finned UHF base radio transceiver + battery kit.
 */
export function createGnssBaseRig(scene: Scene, parent: TransformNode): ArticulatedGnssBaseRig {
  const root = new TransformNode('rig-gnss-base-root', scene);
  root.parent = parent;

  const kit = getSurveyMaterialKit(scene);
  const radioOledMat = createUhfRadioScreenMaterial(scene);

  // 1. Heavy-Duty Dual-Strut Survey Tripod (apex at y = TRIPOD_DESIGN_APEX_M = 1.28 m)
  buildHeavyDutySurveyTripod(scene, root, 'gnss-base', false);

  // 2. Tribrach + Carrier Adapter + 15 cm Extension Mast + Modern GNSS Base Receiver
  const headGroup = new TransformNode('gnss-base-head-group', scene);
  headGroup.parent = root;
  headGroup.position.y = TRIPOD_DESIGN_APEX_M;

  buildPrecisionTribrach(scene, headGroup, 'gnss-base');

  const carrierBody = MeshBuilder.CreateCylinder('gnss-base-carrier', {
    height: 0.056,
    diameterTop: 0.058,
    diameterBottom: 0.128,
    tessellation: 28,
  }, scene);
  carrierBody.parent = headGroup;
  carrierBody.position.y = 0.118;
  carrierBody.material = kit.safetyYellowCoat;
  carrierBody.isPickable = false;

  const mast = MeshBuilder.CreateCylinder('gnss-base-mast', {
    height: 0.15,
    diameter: 0.032,
    tessellation: 20,
  }, scene);
  mast.parent = headGroup;
  mast.position.y = 0.220;
  mast.material = kit.carbonFiberWeave;
  mast.isPickable = false;

  const antennaMount = new TransformNode('gnss-base-antenna-mount', scene);
  antennaMount.parent = headGroup;
  antennaMount.position.y = 0.295;
  const baseAntenna = buildModernGnssSmartAntenna(scene, antennaMount, 'gnss-base');

  // High-gain collinear UHF base broadcast whip clamped alongside the base mast
  const uhfBracket = MeshBuilder.CreateBox('gnss-base-uhf-bracket', {
    width: 0.155,
    height: 0.014,
    depth: 0.026,
  }, scene);
  uhfBracket.parent = headGroup;
  uhfBracket.position.set(0.072, 0.195, 0);
  uhfBracket.material = kit.castAnthracite;
  uhfBracket.isPickable = false;

  const baseUhfWhip = MeshBuilder.CreateCylinder('gnss-base-uhf-mast-whip', {
    height: 0.56,
    diameterTop: 0.006,
    diameterBottom: 0.016,
    tessellation: 14,
  }, scene);
  baseUhfWhip.parent = headGroup;
  baseUhfWhip.position.set(0.138, 0.48, 0);
  baseUhfWhip.material = kit.radomeMatteWhite;
  baseUhfWhip.isPickable = false;

  const whipSpring = MeshBuilder.CreateCylinder('gnss-base-uhf-spring', {
    height: 0.036,
    diameter: 0.022,
    tessellation: 16,
  }, scene);
  whipSpring.parent = headGroup;
  whipSpring.position.set(0.138, 0.215, 0);
  whipSpring.material = kit.knurledSteel;
  whipSpring.isPickable = false;

  // 3. External 35W Finned IP67 UHF Base Radio Transceiver + Field Battery Case
  const radioChassis = MeshBuilder.CreateBox('gnss-base-radio', {
    width: 0.215,
    height: 0.088,
    depth: 0.165,
  }, scene);
  radioChassis.parent = root;
  radioChassis.position.set(0.32, 0.048, -0.18);
  radioChassis.rotation.y = -0.45;
  radioChassis.material = kit.safetyYellowCoat;
  radioChassis.isPickable = false;

  // Top cooling heatsink fins on 35W radio
  for (let finIdx = 0; finIdx < 7; finIdx++) {
    const fin = MeshBuilder.CreateBox(`gnss-base-radio-fin-${finIdx}`, {
      width: 0.185,
      height: 0.008,
      depth: 0.008,
    }, scene);
    fin.parent = radioChassis;
    fin.position.set(0, 0.047, -0.054 + finIdx * 0.018);
    fin.material = kit.castAnthracite;
    fin.isPickable = false;
  }

  const radioScreen = MeshBuilder.CreatePlane('gnss-base-radio-screen', {
    width: 0.108,
    height: 0.048,
  }, scene);
  radioScreen.parent = radioChassis;
  radioScreen.position.set(-0.028, 0.004, -0.0835);
  radioScreen.material = radioOledMat;
  radioScreen.isPickable = false;

  const batteryCase = MeshBuilder.CreateBox('gnss-base-battery-box', {
    width: 0.24,
    height: 0.15,
    depth: 0.17,
  }, scene);
  batteryCase.parent = root;
  batteryCase.position.set(-0.28, 0.075, 0.16);
  batteryCase.rotation.y = 0.35;
  batteryCase.material = kit.matteGraphite;
  batteryCase.isPickable = false;

  const topPosition = new Vector3(0, 0, 0);
  const totalLocalHeightM = TRIPOD_DESIGN_APEX_M + 0.295 + baseAntenna.totalHeightM;

  return {
    root,
    topPosition,
    updatePose: (position, scaleMultiplier, projectUnitsPerMeter = 1) => {
      const unitScale = Math.max(0.1, projectUnitsPerMeter);
      const rigScale = Math.max(0.2, scaleMultiplier) * unitScale;
      root.position.copyFrom(position);
      root.scaling.setAll(rigScale);
      topPosition.copyFrom(position.add(new Vector3(0, totalLocalHeightM * rigScale, 0)));
      return topPosition;
    },
  };
}

export interface ArticulatedGnssRoverRig {
  root: TransformNode;
  antennaHead: TransformNode;
  statusRingMat: StandardMaterial;
  pulseRing: Mesh;
  updatePose: (
    shotPos: Vector3,
    rodHeight: number,
    scaleMultiplier: number,
    quality: GnssQuality | undefined,
    pulsePhase: number,
    projectUnitsPerMeter?: number,
  ) => Vector3;
}

/**
 * Builds a true-scale 3K woven carbon-fiber GNSS RTK Rover pole (NO bipods) with
 * pointed hardened-steel spike, ergonomic yellow/TPU grip, side bullseye level,
 * properly scaled 10.1" landscape Windows 11 Survey Tablet ("LandSurv.ai" screen),
 * and a sleek modern compact IMU GNSS Smart Antenna (Trimble R12i / Leica GS18 profile).
 */
export function createGnssRoverRig(scene: Scene, parent: TransformNode): ArticulatedGnssRoverRig {
  const root = new TransformNode('rig-gnss-rover-root', scene);
  root.parent = parent;

  const kit = getSurveyMaterialKit(scene);

  // ── 1. Pointed Hardened-Steel Topo Spike (uniformly scaled) ──────────────────
  const shoeGroup = new TransformNode('gnss-shoe-group', scene);
  shoeGroup.parent = root;

  const tip = MeshBuilder.CreateCylinder('gnss-steel-tip', {
    height: 0.076,
    diameterTop: 0.028,
    diameterBottom: 0.002,
    tessellation: 18,
  }, scene);
  tip.parent = shoeGroup;
  tip.position.y = 0.038;
  tip.material = kit.hardenedSteel;
  tip.isPickable = false;

  const tipCollar = MeshBuilder.CreateCylinder('gnss-shoe-collar', {
    height: 0.018,
    diameterTop: 0.033,
    diameterBottom: 0.029,
    tessellation: 20,
  }, scene);
  tipCollar.parent = shoeGroup;
  tipCollar.position.y = 0.085;
  tipCollar.material = kit.machinedAluminum;
  tipCollar.isPickable = false;

  // ── 2. Two-Stage 3K Twill Woven Carbon-Fiber Rover Pole (NO bipods) ─────────
  // Modelled after Leica GLS30 / Trimble 2.0m Carbon-Fiber Snap-Lock GNSS Pole:
  // 34mm woven carbon outer lower tube + 28mm woven carbon inner upper tube with
  // laser-etched graduation rings, knurled compression lock & brass snap-lock pin.
  const shaftGroup = new TransformNode('gnss-shaft-group', scene);
  shaftGroup.parent = root;

  const lowerCarbonTube = MeshBuilder.CreateCylinder('gnss-carbon-rod', {
    height: 0.56,
    diameter: 0.034,
    tessellation: 28,
  }, scene);
  lowerCarbonTube.parent = shaftGroup;
  lowerCarbonTube.position.y = 0.28;
  lowerCarbonTube.material = kit.carbonFiberWeave;
  lowerCarbonTube.isPickable = false;

  const upperCarbonTube = MeshBuilder.CreateCylinder('gnss-carbon-rod-upper', {
    height: 0.44,
    diameter: 0.028,
    tessellation: 28,
  }, scene);
  upperCarbonTube.parent = shaftGroup;
  upperCarbonTube.position.y = 0.78;
  upperCarbonTube.material = kit.carbonFiberWeave;
  upperCarbonTube.isPickable = false;

  // Precision laser-etched stainless graduation rings on upper carbon section
  for (const yFrac of [0.66, 0.78, 0.90]) {
    const gradRing = MeshBuilder.CreateCylinder(`gnss-carbon-grad-ring-${yFrac}`, {
      height: 0.0025,
      diameter: 0.029,
      tessellation: 24,
    }, scene);
    gradRing.parent = shaftGroup;
    gradRing.position.y = yFrac;
    gradRing.material = kit.machinedAluminum;
    gradRing.isPickable = false;
  }

  // Anodized twist-lock collar + spring-loaded brass 2.00m snap-pin + bullseye level
  const gripGroup = new TransformNode('gnss-grip-collar-group', scene);
  gripGroup.parent = root;

  const lockCollar = MeshBuilder.CreateCylinder('gnss-pole-lock-collar', {
    height: 0.056,
    diameterTop: 0.039,
    diameterBottom: 0.043,
    tessellation: 24,
  }, scene);
  lockCollar.parent = gripGroup;
  lockCollar.position.y = 0;
  lockCollar.material = kit.knurledBlackAnodized;
  lockCollar.isPickable = false;

  const collarTrimRing = MeshBuilder.CreateCylinder('gnss-collar-trim-ring', {
    height: 0.005,
    diameter: 0.0435,
    tessellation: 24,
  }, scene);
  collarTrimRing.parent = gripGroup;
  collarTrimRing.position.y = -0.026;
  collarTrimRing.material = kit.machinedAluminum;
  collarTrimRing.isPickable = false;

  // Signature spring-loaded brass 2.00m height detent snap-pin
  const brassSnapPin = MeshBuilder.CreateCylinder('gnss-brass-snap-pin', {
    height: 0.012,
    diameter: 0.008,
    tessellation: 14,
  }, scene);
  brassSnapPin.parent = gripGroup;
  brassSnapPin.rotation.z = Math.PI / 2;
  brassSnapPin.position.set(0.020, 0.012, 0);
  brassSnapPin.material = kit.brassHardware;
  brassSnapPin.isPickable = false;

  // Side bullseye level vial on carbon bracket
  const vialMount = MeshBuilder.CreateBox('gnss-vial-mount', {
    width: 0.036,
    height: 0.012,
    depth: 0.026,
  }, scene);
  vialMount.parent = gripGroup;
  vialMount.position.set(-0.026, 0.044, -0.008);
  vialMount.material = kit.castAnthracite;
  vialMount.isPickable = false;

  const vialBubble = MeshBuilder.CreateCylinder('gnss-vial-bubble', {
    height: 0.008,
    diameter: 0.020,
    tessellation: 16,
  }, scene);
  vialBubble.parent = gripGroup;
  vialBubble.position.set(-0.034, 0.052, -0.008);
  vialBubble.material = kit.spiritBubbleVial;
  vialBubble.isPickable = false;

  // ── 3. Clamped Landscape Windows 11 Survey Tablet ("LandSurv.ai" Screen) ────
  const collectorGroup = new TransformNode('gnss-collector-group', scene);
  collectorGroup.parent = root;
  buildWindowsSurveyTabletRig(scene, collectorGroup, 'gnss', 'gnss');

  // ── 4. Modern Compact IMU GNSS Smart Antenna Head (at y = effRod) ────────────
  const antennaHead = new TransformNode('gnss-antenna-head', scene);
  antennaHead.parent = root;
  const modernHead = buildModernGnssSmartAntenna(scene, antennaHead, 'gnss-rover');
  const statusRingMat = modernHead.statusRingMat;

  // Ground epoch pulse ring
  const pulseRing = MeshBuilder.CreateTorus('gnss-epoch-pulse', {
    diameter: 0.44,
    thickness: 0.018,
    tessellation: 36,
  }, scene);
  pulseRing.parent = root;
  pulseRing.position.y = 0.015;
  pulseRing.material = statusRingMat;
  pulseRing.isPickable = false;

  return {
    root,
    antennaHead,
    statusRingMat,
    pulseRing,
    updatePose: (
      shotPos,
      rodHeight,
      scaleMultiplier,
      quality,
      pulsePhase,
      projectUnitsPerMeter = 1,
    ) => {
      const unitScale = Math.max(0.1, projectUnitsPerMeter);
      const equipScale = Math.max(0.15, scaleMultiplier) * unitScale;
      const effRod = Math.max(0.5 * unitScale, rodHeight * scaleMultiplier);

      root.position.copyFrom(shotPos);

      const shoeHeight = 0.090 * equipScale;
      shoeGroup.scaling.setAll(equipScale);

      const topClearance = 0.024 * equipScale;
      const shaftSpan = Math.max(0.08 * equipScale, effRod - shoeHeight - topClearance);
      shaftGroup.position.y = shoeHeight;
      shaftGroup.scaling.set(equipScale, shaftSpan, equipScale);

      // Place knurled twist-lock & brass snap-pin collar right at the 34mm -> 28mm carbon tube joint
      gripGroup.position.y = shoeHeight + 0.56 * shaftSpan;
      gripGroup.scaling.setAll(equipScale);

      collectorGroup.position.y = clamp(
        1.02 * equipScale,
        effRod * 0.38,
        Math.max(effRod * 0.38, shoeHeight + 0.48 * shaftSpan),
      );
      collectorGroup.scaling.setAll(equipScale);

      antennaHead.position.y = effRod;
      antennaHead.scaling.setAll(equipScale);

      const ledColor =
        quality === 'float'
          ? Color3.FromHexString('#f59e0b')
          : quality === 'dgps'
            ? Color3.FromHexString('#38bdf8')
            : quality === 'autonomous'
              ? Color3.FromHexString('#ef4444')
              : Color3.FromHexString('#a3e635');
      statusRingMat.emissiveColor = ledColor;
      statusRingMat.diffuseColor = ledColor;

      const p = clamp(pulsePhase, 0, 1);
      const ringScale = equipScale * (0.7 + p * 1.85);
      pulseRing.scaling.set(ringScale, equipScale, ringScale);

      return shotPos.add(new Vector3(0, effRod + modernHead.totalHeightM * equipScale, 0));
    },
  };
}

/**
 * High-performance batched 3D thick-ribbon/prism mesh builder for polylines.
 * Unlike 1px GL_LINES, this generates true 3D triangular prism/ribbon geometry
 * with per-vertex colors in a single draw call so survey traces, boundaries,
 * centerlines, and contours look crisp and substantial at every zoom level.
 */
export function createThickPolylineMesh3D(
  scene: Scene,
  name: string,
  polylines: Vector3[][],
  colors: Color4[],
  radius: number,
  parent?: TransformNode | null,
): Mesh | null {
  if (polylines.length === 0 || radius <= 0) return null;

  const positions: number[] = [];
  const meshColors: number[] = [];
  const indices: number[] = [];
  const r = radius;
  const h = radius * 0.85;

  for (let pIdx = 0; pIdx < polylines.length; pIdx++) {
    const pts = polylines[pIdx];
    if (!pts || pts.length < 2) continue;
    const col = colors[pIdx] ?? new Color4(0.22, 0.84, 0.96, 1);

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const lenSq = dx * dx + dy * dy + dz * dz;
      if (lenSq < 1e-8) continue;

      const horizLen = Math.hypot(dx, dz);
      const nx = horizLen > 1e-5 ? (-dz / horizLen) * r : r;
      const nz = horizLen > 1e-5 ? (dx / horizLen) * r : 0;

      const baseVertex = positions.length / 3;
      // 3-sided prism cross-section along segment (left, right, top-ridge) -> 6 vertices per segment
      positions.push(
        a.x - nx, a.y, a.z - nz,
        a.x + nx, a.y, a.z + nz,
        a.x, a.y + h, a.z,
        b.x - nx, b.y, b.z - nz,
        b.x + nx, b.y, b.z + nz,
        b.x, b.y + h, b.z,
      );

      for (let v = 0; v < 6; v++) {
        const boost = v === 2 || v === 5 ? 1.15 : 0.92;
        meshColors.push(
          Math.min(1, col.r * boost),
          Math.min(1, col.g * boost),
          Math.min(1, col.b * boost),
          col.a,
        );
      }

      // 3 quad faces (6 triangles) connecting cross-section A to cross-section B
      indices.push(
        baseVertex + 0, baseVertex + 1, baseVertex + 4,
        baseVertex + 0, baseVertex + 4, baseVertex + 3,
        baseVertex + 1, baseVertex + 2, baseVertex + 5,
        baseVertex + 1, baseVertex + 5, baseVertex + 4,
        baseVertex + 2, baseVertex + 0, baseVertex + 3,
        baseVertex + 2, baseVertex + 3, baseVertex + 5,
      );
    }
  }

  if (indices.length === 0) return null;

  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.colors = meshColors;
  data.applyToMesh(mesh, false);

  if (parent) mesh.parent = parent;
  mesh.isPickable = false;
  mesh.hasVertexAlpha = true;
  mesh.useVertexColors = true;

  const mat = new StandardMaterial(`${name}-mat`, scene);
  mat.diffuseColor = Color3.White();
  mat.emissiveColor = Color3.White();
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  mesh.material = mat;
  mesh.renderingGroupId = 1;
  return mesh;
}

/**
 * Helper to create a Babylon DynamicTexture from a composite HTMLCanvasElement.
 */
export function createTextureFromCanvas(
  scene: Scene,
  name: string,
  sourceCanvas: HTMLCanvasElement,
): DynamicTexture {
  const tex = new DynamicTexture(
    name,
    { width: sourceCanvas.width, height: sourceCanvas.height },
    scene,
    true,
  );
  const ctx = tex.getContext();
  if (ctx) {
    ctx.drawImage(sourceCanvas, 0, 0);
  }
  tex.update(false);
  return tex;
}
