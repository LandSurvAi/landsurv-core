/**
 * paperObjects — geometry for movable / scalable paper-space blocks.
 *
 * Positions and sizes are stored in sheet inches, the same units the PDF
 * exporter uses, so a block dragged on screen plots in the same place.
 */

export interface PaperRect {
  xIn: number;
  yIn: number;
  widthIn: number;
  heightIn: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Keep a paper object's top-left corner on the sheet. */
export function clampPaperPosition(
  rect: PaperRect,
  sheetWidthIn: number,
  sheetHeightIn: number,
): { xIn: number; yIn: number } {
  const maxX = Math.max(0, sheetWidthIn - Math.max(0, rect.widthIn));
  const maxY = Math.max(0, sheetHeightIn - Math.max(0, rect.heightIn));
  return {
    xIn: clamp(rect.xIn, 0, maxX),
    yIn: clamp(rect.yIn, 0, maxY),
  };
}

/**
 * Proportional scale for a bottom-right resize handle. Dragging the handle
 * `deltaXIn` inches changes the object from its original width; fonts and
 * heights are scaled by the returned factor so the block keeps its proportions.
 */
export function paperScaleFromDrag(
  originalWidthIn: number,
  deltaXIn: number,
  options: { min?: number; max?: number } = {},
): number {
  if (!Number.isFinite(originalWidthIn) || originalWidthIn <= 0) return 1;
  const min = options.min ?? 0.5;
  const max = options.max ?? 3;
  return clamp((originalWidthIn + deltaXIn) / originalWidthIn, min, max);
}
