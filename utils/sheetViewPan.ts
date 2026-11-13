/**
 * screenDragToSheetPanDelta — convert a mouse drag in sheet pixels into the
 * world-coordinate center delta for a rotated paper-space viewport.
 *
 * The viewport content is drawn with its center fixed and rotated in screen
 * space. A positive center delta moves the content in the opposite screen
 * direction, so this helper solves for the center delta that makes the content
 * follow the cursor 1:1, including at 90/180/270-degree view rotations.
 */
export interface SheetPanInput {
  dxPx: number;
  dyPx: number;
  /** Viewport drawing scale, in world feet per paper inch. */
  scaleFt: number;
  /** Screen pixels per paper inch at the current sheet zoom. */
  pixelsPerInch: number;
  /** Rotation applied to the viewport content, in degrees. */
  rotationDeg?: number;
}

export interface SheetPanDelta {
  east: number;
  north: number;
}

export function screenDragToSheetPanDelta({
  dxPx,
  dyPx,
  scaleFt,
  pixelsPerInch,
  rotationDeg = 0,
}: SheetPanInput): SheetPanDelta {
  const safePpi = Number.isFinite(pixelsPerInch) && pixelsPerInch > 0 ? pixelsPerInch : 1;
  const safeScale = Number.isFinite(scaleFt) && scaleFt > 0 ? scaleFt : 1;
  const radians = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const worldFeetPerPixel = safeScale / safePpi;

  return {
    east: (-dxPx * cos - dyPx * sin) * worldFeetPerPixel,
    north: (-dxPx * sin + dyPx * cos) * worldFeetPerPixel,
  };
}
