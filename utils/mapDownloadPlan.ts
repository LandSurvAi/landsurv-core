/**
 * Offline map download planning.
 *
 * Offline areas are anchored to the survey: every point in the file (plus a
 * padding range) defines the download extent, so imagery follows the job
 * instead of an arbitrary circle. The extent is then split into a bounded
 * power-of-two grid so tiles can be fetched concurrently and cached.
 */

export type MapBbox = [number, number, number, number];

export interface MapPointLike {
  easting: number;
  northing: number;
}

export interface DownloadTile {
  bbox: MapBbox;
  /** Column within the download grid (0 = west edge). */
  col: number;
  /** Row within the download grid (0 = south edge). */
  row: number;
}

export interface DownloadGrid {
  tiles: DownloadTile[];
  /** Extent actually covered by the grid (snapped out to whole cells). */
  gridBbox: MapBbox;
  cols: number;
  rows: number;
  cell: number;
  tilePx: number;
  widthPx: number;
  heightPx: number;
  widthWorld: number;
  heightWorld: number;
}

export interface DownloadPlanOptions {
  tilePx?: number;
  maxTiles?: number;
  /** Target output resolution; higher means smaller cells and more detail. */
  pxPerUnit?: number;
  /** Hard cap on the stitched image dimensions. */
  maxPixelsPerSide?: number;
}

function isValidBbox(bbox: MapBbox): boolean {
  return bbox.length === 4 && bbox.every(Number.isFinite);
}

/**
 * Bounding box of every finite point in the file, expanded by `padding`.
 * Returns null when there are no usable points, so callers can fall back to
 * the selected point or the current map view.
 */
export function pointRangeBbox(points: readonly MapPointLike[], padding = 0): MapBbox | null {
  let minE = Infinity;
  let minN = Infinity;
  let maxE = -Infinity;
  let maxN = -Infinity;
  let count = 0;

  for (const point of points) {
    if (!Number.isFinite(point.easting) || !Number.isFinite(point.northing)) continue;
    count++;
    if (point.easting < minE) minE = point.easting;
    if (point.easting > maxE) maxE = point.easting;
    if (point.northing < minN) minN = point.northing;
    if (point.northing > maxN) maxN = point.northing;
  }

  if (count === 0) return null;

  const pad = Number.isFinite(padding) && padding > 0 ? padding : 0;
  let bbox: MapBbox = [minE - pad, minN - pad, maxE + pad, maxN + pad];

  // A single point (or padding-free coincident points) still needs a
  // non-degenerate extent for WMS and tile planning.
  if (!(bbox[2] - bbox[0] > 0)) bbox = [bbox[0] - 1, bbox[1], bbox[2] + 1, bbox[3]];
  if (!(bbox[3] - bbox[1] > 0)) bbox = [bbox[0], bbox[1] - 1, bbox[2], bbox[3] + 1];
  return bbox;
}

/** Square extent around a center point, preserving the legacy download flow. */
export function centerRadiusBbox(center: MapPointLike, radius: number): MapBbox {
  const r = Number.isFinite(radius) && radius > 0 ? radius : 1;
  return [center.easting - r, center.northing - r, center.easting + r, center.northing + r];
}

/**
 * Cover `bbox` with grid-aligned power-of-two cells. The cell size starts at
 * the requested resolution and grows until both the tile-count cap and the
 * stitched-image dimension cap are satisfied, so a huge tract cannot trigger
 * hundreds of requests or an unbounded canvas.
 */
export function planDownloadTiles(bbox: MapBbox, opts: DownloadPlanOptions = {}): DownloadGrid | null {
  if (!isValidBbox(bbox)) return null;
  const [minX, minY, maxX, maxY] = bbox;
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  if (!(spanX > 0) || !(spanY > 0)) return null;

  const tilePx = Math.max(64, Math.round(opts.tilePx ?? 1024));
  const maxTiles = Math.max(1, Math.floor(opts.maxTiles ?? 16));
  const pxPerUnit = opts.pxPerUnit && Number.isFinite(opts.pxPerUnit) && opts.pxPerUnit > 0 ? opts.pxPerUnit : 2;
  const maxPixelsPerSide = Math.max(tilePx, Math.floor(opts.maxPixelsPerSide ?? 4096));

  let exp = Math.floor(Math.log2(tilePx / pxPerUnit));
  if (!Number.isFinite(exp)) return null;

  const cover = (e: number) => {
    const cell = Math.pow(2, e);
    const x0 = Math.floor(minX / cell);
    const x1 = Math.floor(maxX / cell);
    const y0 = Math.floor(minY / cell);
    const y1 = Math.floor(maxY / cell);
    const cols = x1 - x0 + 1;
    const rows = y1 - y0 + 1;
    return { cell, x0, x1, y0, y1, cols, rows, count: cols * rows };
  };

  let grid = cover(exp);
  while (
    (grid.count > maxTiles || grid.cols * tilePx > maxPixelsPerSide || grid.rows * tilePx > maxPixelsPerSide)
    && exp < 60
  ) {
    exp++;
    grid = cover(exp);
  }

  const tiles: DownloadTile[] = [];
  for (let iy = grid.y0; iy <= grid.y1; iy++) {
    for (let ix = grid.x0; ix <= grid.x1; ix++) {
      tiles.push({
        bbox: [ix * grid.cell, iy * grid.cell, (ix + 1) * grid.cell, (iy + 1) * grid.cell],
        col: ix - grid.x0,
        row: iy - grid.y0,
      });
    }
  }

  return {
    tiles,
    gridBbox: [grid.x0 * grid.cell, grid.y0 * grid.cell, (grid.x1 + 1) * grid.cell, (grid.y1 + 1) * grid.cell],
    cols: grid.cols,
    rows: grid.rows,
    cell: grid.cell,
    tilePx,
    widthPx: grid.cols * tilePx,
    heightPx: grid.rows * tilePx,
    widthWorld: grid.cols * grid.cell,
    heightWorld: grid.rows * grid.cell,
  };
}
