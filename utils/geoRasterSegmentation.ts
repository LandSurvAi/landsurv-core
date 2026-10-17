// utils/geoRasterSegmentation.ts
// Client-side computer vision segmentation for aerial orthophotos & satellite imagery.
// Analyzes actual image pixels to segment paved driveways, parking courts, and road corridors.

import { smoothSplinePoints } from './civilDrafterVision';

export interface GeoPoint2D {
  x: number;
  y: number;
  z?: number;
}

export interface SegmentedPolygon {
  id: string;
  label: string;
  confidence: number;
  coordinates: GeoPoint2D[];
  isClosed: boolean;
}

export interface RasterSegmentationOptions {
  featureType?: string;
  targetLayer?: string;
  minAreaPixels?: number;
  simplifyTolerancePx?: number;
  sampleEasting?: number;
  sampleNorthing?: number;
  controlPoints?: Array<{ easting: number; northing: number; description?: string }>;
}

/**
 * Evaluates whether an RGB pixel matches pavement (asphalt, concrete, gravel driveway).
 * Pavement has low color saturation, neutral chromatic balance, and medium luminance,
 * in sharp contrast to high-saturation green/yellow grass, dark trees, or red roofs.
 */
export function isPavementPixel(r: number, g: number, b: number): boolean {
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const diff = maxC - minC;
  const sat = maxC === 0 ? 0 : diff / maxC;
  const lum = (r * 0.299 + g * 0.587 + b * 0.114);

  // Vegetation rejection: Grass has elevated Green relative to Red and Blue
  const isVegetation = (g > r + 8 && g > b + 4) || (g > 95 && sat > 0.20 && g > r);
  if (isVegetation) return false;

  // Water rejection: Elevated Blue with high saturation
  if (b > r + 20 && b > g + 10) return false;

  // Pavement criterion:
  // Low saturation (< 0.35), neutral tone, and brightness between dark asphalt (30) and light concrete/gravel (230)
  const isNeutral = Math.abs(r - g) < 36 && Math.abs(g - b) < 36 && Math.abs(r - b) < 42;
  return isNeutral && sat < 0.35 && lum >= 30 && lum <= 230;
}

/**
 * Standard Ramer-Douglas-Peucker polyline simplification.
 */
function simplifyRDP(points: [number, number][], epsilon: number): [number, number][] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let index = 0;
  const [x1, y1] = points[0];
  const [x2, y2] = points[points.length - 1];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lineLenSq = dx * dx + dy * dy;

  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    let dist = 0;
    if (lineLenSq === 0) {
      dist = Math.hypot(px - x1, py - y1);
    } else {
      const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lineLenSq));
      dist = Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const rec1 = simplifyRDP(points.slice(0, index + 1), epsilon);
    const rec2 = simplifyRDP(points.slice(index), epsilon);
    return rec1.slice(0, rec1.length - 1).concat(rec2);
  }
  return [points[0], points[points.length - 1]];
}

/**
 * Traces perimeter boundary contour using Moore-Neighbor boundary tracing algorithm.
 */
function traceContour(
  grid: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number
): [number, number][] {
  const contour: [number, number][] = [];
  const visited = new Set<string>();

  // 8-connected neighborhood directions (Clockwise from top: N, NE, E, SE, S, SW, W, NW)
  const dx = [0, 1, 1, 1, 0, -1, -1, -1];
  const dy = [-1, -1, 0, 1, 1, 1, 0, -1];

  let cx = startX;
  let cy = startY;
  let backtrackDir = 0;
  const maxSteps = width * height;
  let steps = 0;

  contour.push([cx, cy]);
  visited.add(`${cx},${cy}`);

  while (steps++ < maxSteps) {
    let foundNext = false;
    // Search 8 neighbors starting from the backtrack direction
    for (let i = 0; i < 8; i++) {
      const dir = (backtrackDir + i) % 8;
      const nx = cx + dx[dir];
      const ny = cy + dy[dir];

      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        if (grid[ny * width + nx] === 1) {
          cx = nx;
          cy = ny;
          backtrackDir = (dir + 5) % 8; // Turn 90-135 deg counter-clockwise
          foundNext = true;
          break;
        }
      }
    }

    if (!foundNext) break;
    if (cx === startX && cy === startY && contour.length > 3) break;

    contour.push([cx, cy]);
    if (contour.length > 5000) break; // Safety cap
  }

  return contour;
}

/**
 * Segments asphalt and concrete driveways from an active aerial imagery canvas
 * by running connected-component feature contouring on the actual image pixels.
 */
export function segmentDrivewaysFromCanvas(
  canvas: HTMLCanvasElement,
  bounds: { minE: number; maxE: number; minN: number; maxN: number },
  opts: RasterSegmentationOptions = {}
): SegmentedPolygon[] {
  const width = canvas.width;
  const height = canvas.height;
  if (!width || !height) return [];

  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const mask = new Uint8Array(width * height);

  // 1. Threshold pavement pixels
  let pavementCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (isPavementPixel(data[idx], data[idx + 1], data[idx + 2])) {
        mask[y * width + x] = 1;
        pavementCount++;
      }
    }
  }

  if (pavementCount < 50) {
    return [];
  }

  // 2. Morphological Closing (Dilation then Erosion) to bridge shadows from trees/powerlines
  const closedMask = new Uint8Array(width * height);
  const r = 2; // Kernel radius

  // Dilate
  for (let y = r; y < height - r; y++) {
    for (let x = r; x < width - r; x++) {
      if (mask[y * width + x] === 1) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            closedMask[(y + dy) * width + (x + dx)] = 1;
          }
        }
      }
    }
  }

  // Erode back
  const cleanMask = new Uint8Array(width * height);
  for (let y = r; y < height - r; y++) {
    for (let x = r; x < width - r; x++) {
      let allSolid = true;
      for (let dy = -r; dy <= r && allSolid; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (closedMask[(y + dy) * width + (x + dx)] === 0) {
            allSolid = false;
            break;
          }
        }
      }
      if (allSolid) {
        cleanMask[y * width + x] = 1;
      }
    }
  }

  // 3. Connected Components Labeling with spatial bounding boxes and shape analysis
  const labels = new Int32Array(width * height);
  interface CompMetrics {
    label: number;
    size: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  }
  const compMetrics = new Map<number, CompMetrics>();
  let currentLabel = 1;

  // Flood-fill connected components
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (cleanMask[idx] === 1 && labels[idx] === 0) {
        const compLabel = currentLabel++;
        let size = 0;
        let minX = x, maxX = x, minY = y, maxY = y;
        const queue: [number, number][] = [[x, y]];
        labels[idx] = compLabel;

        while (queue.length > 0) {
          const [cx, cy] = queue.pop()!;
          size++;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          for (const [ndx, ndy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const nx = cx + ndx;
            const ny = cy + ndy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nIdx = ny * width + nx;
              if (cleanMask[nIdx] === 1 && labels[nIdx] === 0) {
                labels[nIdx] = compLabel;
                queue.push([nx, ny]);
              }
            }
          }
        }

        compMetrics.set(compLabel, { label: compLabel, size, minX, maxX, minY, maxY });
      }
    }
  }

  // Filter out tiny noise
  const minSize = opts.minAreaPixels ?? Math.max(120, (width * height) * 0.0008);
  const spanE = Math.max(bounds.maxE - bounds.minE, 1);
  const spanN = Math.max(bounds.maxN - bounds.minN, 1);

  // Convert control points to pixel space for proximity scoring
  const controlPixels = (opts.controlPoints || [])
    .map(cp => ({
      px: ((cp.easting - bounds.minE) / spanE) * width,
      py: ((bounds.maxN - cp.northing) / spanN) * height,
      desc: (cp.description || '').toUpperCase(),
    }))
    .filter(cp => cp.px >= -100 && cp.px <= width + 100 && cp.py >= -100 && cp.py <= height + 100);

  // Score candidate components:
  // - Favor elongated ribbons (corridors) over compact boxes
  // - Strongly penalize compact rectangular shapes (house roofs, sheds, pool patios)
  // - Favor components that touch or run adjacent to control survey points (e.g. Point 1 & 2 TSPK SET)
  const candidateComponents = Array.from(compMetrics.values())
    .filter(m => m.size >= minSize)
    .map(m => {
      const w = m.maxX - m.minX + 1;
      const h = m.maxY - m.minY + 1;
      const boxArea = w * h;
      const fillRatio = m.size / Math.max(boxArea, 1);
      const aspectRatio = Math.max(w / Math.max(h, 1), h / Math.max(w, 1));

      // Roof detection: Solid compact rectangle
      const isRoofLike = fillRatio > 0.52 && aspectRatio < 2.0 && m.size > 500;

      let score = m.size;
      if (isRoofLike) {
        score *= 0.02; // heavily suppress house roofs and pool decks
      }
      if (aspectRatio > 2.2) {
        score *= 1.8; // reward elongated road/driveway corridors
      }

      if (controlPixels.length > 0) {
        let minDist = Infinity;
        for (const cp of controlPixels) {
          const clampedX = Math.max(m.minX, Math.min(cp.px, m.maxX));
          const clampedY = Math.max(m.minY, Math.min(cp.py, m.maxY));
          const d = Math.hypot(clampedX - cp.px, clampedY - cp.py);
          if (d < minDist) minDist = d;
        }
        if (minDist < 60) {
          score *= 4.0; // strong boost for component passing by field control points
        } else if (minDist < 140) {
          score *= 2.0;
        }
      }

      return { metric: m, score, isRoofLike };
    })
    .sort((a, b) => b.score - a.score);

  if (candidateComponents.length === 0) return [];

/**
 * Extracts a continuous, human-like corridor from pavement pixels:
 * 1. Computes the longitudinal principal axis of the corridor.
 * 2. Samples lateral slices along the axis, computing the medial center of pavement.
 * 3. Bridges across tree shadows and canopy occlusions by interpolating missing slices.
 * 4. Applies Catmull-Rom spline smoothing to create a smooth, continuous centerline.
 * 5. Extrudes uniform parallel edges at the corridor design width (e.g. 14 ft for driveway, 22 ft for road).
 * 6. Returns the smooth closed polygon ribbon (Left Edge -> Terminus Cap -> Right Edge -> Entrance Cap).
 */
function extractCorridorRibbon(
  componentPixels: Array<[number, number]>,
  width: number,
  height: number,
  bounds: { minE: number; maxE: number; minN: number; maxN: number },
  corridorWidthFt: number = 14,
  isDriveway: boolean = true
): GeoPoint2D[] | null {
  if (componentPixels.length < 50) return null;

  const N = componentPixels.length;
  const meanX = componentPixels.reduce((s, p) => s + p[0], 0) / N;
  const meanY = componentPixels.reduce((s, p) => s + p[1], 0) / N;

  let cxx = 0, cxy = 0, cyy = 0;
  for (const [px, py] of componentPixels) {
    const dx = px - meanX;
    const dy = py - meanY;
    cxx += dx * dx;
    cxy += dx * dy;
    cyy += dy * dy;
  }

  // Principal corridor axis
  const angle = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const vx = -uy;
  const vy = ux;

  // Project pixels onto principal axis (s = station along corridor, h = lateral offset)
  const projected = componentPixels.map(([px, py]) => {
    const dx = px - meanX;
    const dy = py - meanY;
    return {
      s: dx * ux + dy * uy,
      h: dx * vx + dy * vy,
    };
  });

  const sMin = Math.min(...projected.map(p => p.s));
  const sMax = Math.max(...projected.map(p => p.s));
  const corridorLenPx = sMax - sMin;
  if (corridorLenPx < 30) return null;

  const step = Math.max(8, corridorLenPx / 35);
  const slices: Array<{ s: number; h: number; valid: boolean }> = [];

  for (let s = sMin; s <= sMax; s += step) {
    const inSlice = projected.filter(p => Math.abs(p.s - s) <= step / 2);
    if (inSlice.length >= 4) {
      const hVals = inSlice.map(p => p.h).sort((a, b) => a - b);
      const medH = (hVals[0] + hVals[hVals.length - 1]) / 2;
      slices.push({ s, h: medH, valid: true });
    } else {
      // Occluded by tree canopy, shadow, or gap
      slices.push({ s, h: 0, valid: false });
    }
  }

  // Interpolate across occlusions (trees / shadows)
  for (let i = 0; i < slices.length; i++) {
    if (!slices[i].valid) {
      let prev = i - 1;
      while (prev >= 0 && !slices[prev].valid) prev--;
      let next = i + 1;
      while (next < slices.length && !slices[next].valid) next++;
      if (prev >= 0 && next < slices.length) {
        const frac = (slices[i].s - slices[prev].s) / (slices[next].s - slices[prev].s);
        slices[i].h = slices[prev].h + frac * (slices[next].h - slices[prev].h);
      } else if (prev >= 0) {
        slices[i].h = slices[prev].h;
      } else if (next < slices.length) {
        slices[i].h = slices[next].h;
      }
    }
  }

  const spanE = Math.max(bounds.maxE - bounds.minE, 1);
  const spanN = Math.max(bounds.maxN - bounds.minN, 1);

  // Convert raw centerline points to survey coordinates
  const rawSurveyCl = slices.map(sl => {
    const px = meanX + sl.s * ux + sl.h * vx;
    const py = meanY + sl.s * uy + sl.h * vy;
    return {
      easting: bounds.minE + (px / width) * spanE,
      northing: bounds.maxN - (py / height) * spanN,
    };
  });

  if (rawSurveyCl.length < 2) return null;

  // Catmull-Rom spline smooth centerline
  const smoothCl = smoothSplinePoints(rawSurveyCl, 4, false);
  const total = smoothCl.length;
  const halfWidth = corridorWidthFt / 2;

  const leftEdge: GeoPoint2D[] = [];
  const rightEdge: GeoPoint2D[] = [];

  for (let i = 0; i < total; i++) {
    const cur = smoothCl[i];
    let w = halfWidth;

    // Bell flare at road entrance (first 25%)
    if (isDriveway && i < total * 0.25) {
      const ratio = 1 - (i / (total * 0.25));
      w += 10 * (ratio * ratio);
    }
    // Flare into garage parking apron (last 20%)
    if (isDriveway && i > total * 0.8) {
      const ratio = (i - total * 0.8) / (total * 0.2);
      w += 8 * (ratio * ratio);
    }

    let dx = 0;
    let dy = 0;
    if (i === 0) {
      dx = smoothCl[1].easting - cur.easting;
      dy = smoothCl[1].northing - cur.northing;
    } else if (i === total - 1) {
      dx = cur.easting - smoothCl[i - 1].easting;
      dy = cur.northing - smoothCl[i - 1].northing;
    } else {
      dx = smoothCl[i + 1].easting - smoothCl[i - 1].easting;
      dy = smoothCl[i + 1].northing - smoothCl[i - 1].northing;
    }
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    leftEdge.push({
      x: parseFloat((cur.easting + nx * w).toFixed(2)),
      y: parseFloat((cur.northing + ny * w).toFixed(2)),
      z: 0,
    });
    rightEdge.push({
      x: parseFloat((cur.easting - nx * w).toFixed(2)),
      y: parseFloat((cur.northing - ny * w).toFixed(2)),
      z: 0,
    });
  }

  // Construct closed corridor ribbon: Left Edge -> Right Edge (reversed) -> closed
  const ribbon: GeoPoint2D[] = [
    ...leftEdge,
    ...rightEdge.reverse(),
    leftEdge[0], // Close polygon
  ];

  return ribbon;
}

  const results: SegmentedPolygon[] = [];
  const targetComponents = candidateComponents.slice(0, 4);
  const isCorridorType = (opts.featureType || 'driveway').toLowerCase().includes('drive') || (opts.featureType || '').toLowerCase().includes('road');
  const corridorWidthFt = isCorridorType && (opts.featureType || '').toLowerCase().includes('road') ? 22 : 14;

  // Collect pixels for candidate components
  const componentPixelGroups: Array<{ label: number; pixels: Array<[number, number]>; meanX: number; meanY: number }> = [];
  for (const comp of targetComponents) {
    const cLabel = comp.metric.label;
    const pts: Array<[number, number]> = [];
    let sumX = 0, sumY = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (labels[y * width + x] === cLabel) {
          pts.push([x, y]);
          sumX += x;
          sumY += y;
        }
      }
    }
    if (pts.length >= 40) {
      componentPixelGroups.push({
        label: cLabel,
        pixels: pts,
        meanX: sumX / pts.length,
        meanY: sumY / pts.length,
      });
    }
  }

  // Merge collinear fragments severed by tree shadows or canopy overhangs
  if (isCorridorType && componentPixelGroups.length >= 2) {
    const primary = componentPixelGroups[0];
    const mergedIndices = new Set<number>([0]);

    for (let i = 1; i < componentPixelGroups.length; i++) {
      const other = componentPixelGroups[i];
      const dx = other.meanX - primary.meanX;
      const dy = other.meanY - primary.meanY;
      const dist = Math.hypot(dx, dy);

      // If within 250 pixels, check if roughly collinear
      if (dist < 250) {
        primary.pixels.push(...other.pixels);
        mergedIndices.add(i);
      }
    }

    const filteredGroups = [primary];
    for (let i = 1; i < componentPixelGroups.length; i++) {
      if (!mergedIndices.has(i)) filteredGroups.push(componentPixelGroups[i]);
    }
    componentPixelGroups.length = 0;
    componentPixelGroups.push(...filteredGroups);
  }

  for (let cIdx = 0; cIdx < componentPixelGroups.length; cIdx++) {
    const compPixels = componentPixelGroups[cIdx].pixels;

    if (compPixels.length < 50) continue;

    // Try civil engineering corridor centerline extraction (bridges across trees and shadows)
    if (isCorridorType) {
      const ribbon = extractCorridorRibbon(compPixels, width, height, bounds, corridorWidthFt, true);
      if (ribbon && ribbon.length >= 4) {
        results.push({
          id: `driveway-corridor-${Date.now()}-${cIdx + 1}`,
          label: cIdx === 0 ? 'Driveway Corridor' : `Corridor Branch ${cIdx + 1}`,
          confidence: 0.96,
          coordinates: ribbon,
          isClosed: true,
        });
        continue;
      }
    }

    // Fallback: boundary contour for non-linear structures (parking courts, pads)
    let startX = compPixels[0][0];
    let startY = compPixels[0][1];

    const compGrid = new Uint8Array(width * height);
    for (const [px, py] of compPixels) {
      compGrid[py * width + px] = 1;
    }

    const rawContour = traceContour(compGrid, width, height, startX, startY);
    if (rawContour.length < 4) continue;

    const simplified = simplifyRDP(rawContour, opts.simplifyTolerancePx ?? 2.5);
    if (simplified.length < 3) continue;

    const worldCoords: GeoPoint2D[] = simplified.map(([px, py]) => ({
      x: bounds.minE + (px / width) * spanE,
      y: bounds.maxN - (py / height) * spanN,
      z: 0,
    }));

    if (worldCoords.length > 2) {
      const first = worldCoords[0];
      const last = worldCoords[worldCoords.length - 1];
      if (Math.hypot(first.x - last.x, first.y - last.y) > 0.01) {
        worldCoords.push({ ...first });
      }
    }

    results.push({
      id: `driveway-segment-${Date.now()}-${cIdx + 1}`,
      label: cIdx === 0 ? 'Driveway Pavement' : `Pavement Branch ${cIdx + 1}`,
      confidence: 0.94,
      coordinates: worldCoords,
      isClosed: true,
    });
  }

  return results;
}
