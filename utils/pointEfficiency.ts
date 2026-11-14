/**
 * Point rendering efficiency mode.
 *
 * Above this zoom (screen pixels per drawing unit), point glyphs and labels are
 * legible enough to render individually. 1.5 keeps site-scale views in full
 * detail instead of hiding annotations until roughly 3 px/unit; below it, large
 * point files are cheaper to draw as screen-space primitives.
 */
export const POINT_EFFICIENCY_DETAIL_SCALE = 1.5;

/**
 * Maximum number of on-screen points before labels stop being useful. This is
 * deliberately density-based rather than zoom-based: a 1,000-point site can be
 * crowded at a zoom that is technically past the detail threshold.
 */
export const POINT_EFFICIENCY_SCREEN_BUDGET = 240;

/** Screen-space cell used to collapse overlapping points into one dot. */
export const POINT_PRIMITIVE_CELL_SIZE = 4;

/**
 * Parameterized view of the current efficiency constants. Point Studio styles
 * provide these values; the legacy constants remain the default profile.
 */
export interface PointEfficiencyConfig {
  enabled?: boolean;
  detailScaleCutoff?: number;
  screenPointBudget?: number;
  cellSizePx?: number;
  minDotSizePx?: number;
  maxDotSizePx?: number;
  densityGrowth?: number;
}

/** True when a Point Studio efficiency profile should compress the cloud. */
export function shouldCompressPointCloud(
  profile: PointEfficiencyConfig | undefined,
  zoomScale: number,
  visiblePointCount = 0,
): boolean {
  if (profile?.enabled !== true) return false;
  const detailScaleCutoff = Number.isFinite(profile.detailScaleCutoff)
    ? profile.detailScaleCutoff!
    : POINT_EFFICIENCY_DETAIL_SCALE;
  const screenPointBudget = Number.isFinite(profile.screenPointBudget)
    ? profile.screenPointBudget!
    : POINT_EFFICIENCY_SCREEN_BUDGET;

  if (Number.isFinite(zoomScale) && zoomScale < detailScaleCutoff) return true;
  return Number.isFinite(visiblePointCount) && visiblePointCount > screenPointBudget;
}

/** Dot size for one compressed cell, given the profile and cell count. */
export function getPointDotSize(
  profile: PointEfficiencyConfig | undefined,
  cellCount: number,
): number {
  const minDotSize = Number.isFinite(profile?.minDotSizePx) ? profile!.minDotSizePx! : 2;
  const maxDotSize = Number.isFinite(profile?.maxDotSizePx) ? profile!.maxDotSizePx! : 4;
  const densityGrowth = Number.isFinite(profile?.densityGrowth) ? profile!.densityGrowth! : 1;
  const safeCount = Number.isFinite(cellCount) && cellCount > 0 ? cellCount : 1;
  const rawSize = minDotSize + densityGrowth * Math.floor(Math.log2(safeCount));
  return Math.min(maxDotSize, Math.max(minDotSize, rawSize));
}

const INTERMEDIATE_DASH_RE = /int-/i;
const INTERMEDIATE_UNDERSCORE_RE = /^int_/i;

/**
 * Synthetic curve-approximation points ("INT-12", "int_4") are never drawn.
 * Using regexes avoids allocating a lowercase copy of every point number on
 * every animation frame.
 */
export function isIntermediateCurvePoint(pointNumber: string | undefined | null): boolean {
  if (!pointNumber) return false;
  return INTERMEDIATE_DASH_RE.test(pointNumber) || INTERMEDIATE_UNDERSCORE_RE.test(pointNumber);
}

export interface PointPrimitiveCell {
  /** Left edge of the cell, in CSS pixels. */
  x: number;
  /** Top edge of the cell, in CSS pixels. */
  y: number;
  /** Number of points collapsed into this cell. */
  count: number;
}

/** True when points should render as lightweight primitives at this view. */
export function shouldDrawPointPrimitives(
  enabled: boolean | undefined,
  zoomScale: number,
  visiblePointCount = 0,
): boolean {
  if (enabled !== true) return false;

  // Zoomed far out: symbols and labels are illegible regardless of count.
  if (Number.isFinite(zoomScale) && zoomScale < POINT_EFFICIENCY_DETAIL_SCALE) {
    return true;
  }

  // Zoomed in, but the screen is still too crowded for labels to be read.
  return Number.isFinite(visiblePointCount) && visiblePointCount > POINT_EFFICIENCY_SCREEN_BUDGET;
}

/**
 * Collapse projected points into screen-space cells. Dense clusters become a
 * single dot with a higher count, and the caller can paint every cell in one
 * canvas fill instead of issuing one draw call per point.
 */
export function collectPointPrimitiveCells(
  projectedPoints: ReadonlyArray<{ x: number; y: number }>,
  cellSize = POINT_PRIMITIVE_CELL_SIZE,
): Map<string, PointPrimitiveCell> {
  const safeCellSize = Number.isFinite(cellSize) && cellSize > 0
    ? cellSize
    : POINT_PRIMITIVE_CELL_SIZE;
  const cells = new Map<string, PointPrimitiveCell>();

  for (const point of projectedPoints) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;

    const cellX = Math.floor(point.x / safeCellSize);
    const cellY = Math.floor(point.y / safeCellSize);
    const key = `${cellX}:${cellY}`;
    const existing = cells.get(key);

    if (existing) {
      existing.count += 1;
    } else {
      cells.set(key, {
        x: cellX * safeCellSize,
        y: cellY * safeCellSize,
        count: 1,
      });
    }
  }

  return cells;
}

/**
 * Reusable buffers for the allocation-free primitive bucketing path. The draw
 * loop keeps one of these alive for the lifetime of the canvas, so a 10k-point
 * pan does not create 10k objects plus 10k string keys every frame.
 */
export interface PointPrimitiveBucketBuffer {
  cellsX: Float32Array;
  cellsY: Float32Array;
  counts: Int32Array;
  capacity: number;
  length: number;
  cellSize: number;
  grid: Int32Array;
  gridWidth: number;
  gridHeight: number;
}

export function createPointPrimitiveBucketBuffer(): PointPrimitiveBucketBuffer {
  return {
    cellsX: new Float32Array(0),
    cellsY: new Float32Array(0),
    counts: new Int32Array(0),
    capacity: 0,
    length: 0,
    cellSize: POINT_PRIMITIVE_CELL_SIZE,
    grid: new Int32Array(0),
    gridWidth: 0,
    gridHeight: 0,
  };
}

function ensureBucketCapacity(buffer: PointPrimitiveBucketBuffer, capacity: number): void {
  if (buffer.capacity >= capacity) return;
  let next = Math.max(64, buffer.capacity);
  while (next < capacity) next *= 2;
  buffer.cellsX = new Float32Array(next);
  buffer.cellsY = new Float32Array(next);
  buffer.counts = new Int32Array(next);
  buffer.capacity = next;
}

/**
 * Bucket projected screen coordinates into `cellSize` cells using a numeric
 * grid instead of a Map with string keys. `projectedXY` is interleaved
 * `[x0, y0, x1, y1, ...]` so the projection pass needs no per-point objects.
 */
export function bucketProjectedPoints(
  projectedXY: Float32Array,
  pointCount: number,
  screenWidth: number,
  screenHeight: number,
  buffer: PointPrimitiveBucketBuffer,
  cellSize = POINT_PRIMITIVE_CELL_SIZE,
): PointPrimitiveBucketBuffer {
  const safeCellSize = Number.isFinite(cellSize) && cellSize > 0
    ? cellSize
    : POINT_PRIMITIVE_CELL_SIZE;
  const gridWidth = Math.max(1, Math.ceil(Math.max(0, screenWidth) / safeCellSize) + 3);
  const gridHeight = Math.max(1, Math.ceil(Math.max(0, screenHeight) / safeCellSize) + 3);
  const gridLength = gridWidth * gridHeight;

  if (buffer.grid.length < gridLength) {
    buffer.grid = new Int32Array(gridLength);
  }
  const grid = buffer.grid;
  grid.fill(-1, 0, gridLength);

  const safePointCount = Math.max(0, Math.min(pointCount, projectedXY.length >>> 1));
  ensureBucketCapacity(buffer, Math.max(1, safePointCount));

  buffer.length = 0;
  buffer.cellSize = safeCellSize;
  buffer.gridWidth = gridWidth;
  buffer.gridHeight = gridHeight;

  for (let i = 0; i < safePointCount; i++) {
    const x = projectedXY[i * 2];
    const y = projectedXY[i * 2 + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    let gridX = Math.floor(x / safeCellSize) + 1;
    let gridY = Math.floor(y / safeCellSize) + 1;
    if (gridX < 0) gridX = 0;
    else if (gridX >= gridWidth) gridX = gridWidth - 1;
    if (gridY < 0) gridY = 0;
    else if (gridY >= gridHeight) gridY = gridHeight - 1;

    const gridIndex = gridY * gridWidth + gridX;
    const bucket = grid[gridIndex];
    if (bucket < 0) {
      const next = buffer.length++;
      grid[gridIndex] = next;
      buffer.cellsX[next] = gridX - 1;
      buffer.cellsY[next] = gridY - 1;
      buffer.counts[next] = 1;
    } else {
      buffer.counts[bucket] += 1;
    }
  }

  return buffer;
}
