import type { BoundaryFile } from '../types.ts';

/**
 * Base world-space height for every bearing & distance annotation.
 *
 * Deed silhouettes, drafted deed linework, and hand-drawn boundary lines all
 * render at this one height, so a call reads identically no matter which path
 * put it on the canvas. The Bearing & Distance slider multiplies this base.
 */
export const BEARING_DISTANCE_ANNOTATION_BASE_HEIGHT = 10;

export function bearingDistanceAnnotationHeight(scale: number): number {
  const factor = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return BEARING_DISTANCE_ANNOTATION_BASE_HEIGHT * factor;
}

/**
 * Only boundary linework carries bearing & distance annotations. Inclusion and
 * exclusion polygons are area/query aids, GIS parcel overlays are reference
 * linework, and regular drawn lines keep their geometry without B&D labels.
 *
 * Boundary Agent / deed drafting stamps its calls with a `bf-draw-` polylineId,
 * so that is the single annotation contract for canvas, sheet, and DXF output.
 */
export function isBoundaryAnnotationLine(line: { type?: string; polylineId?: string } | null | undefined): boolean {
  return line?.polylineId?.startsWith('bf-draw-') === true;
}

/**
 * Reading direction for a boundary call, resolved from inside the parcel.
 *
 * The label's up vector is its edge angle + 90°. When that points toward the
 * parcel's centroid (inward), the baseline is flipped so the text reads
 * left-to-right for someone standing inside the shape and looking out.
 */
export function boundaryReadingAngle(
  edgeAngle: number,
  midpoint: { x: number; y: number },
  interiorCentroid: { x: number; y: number },
): number {
  const upX = Math.cos(edgeAngle + Math.PI / 2);
  const upY = Math.sin(edgeAngle + Math.PI / 2);
  const outwardX = midpoint.x - interiorCentroid.x;
  const outwardY = midpoint.y - interiorCentroid.y;
  if (outwardX === 0 && outwardY === 0) return edgeAngle;
  return upX * outwardX + upY * outwardY >= 0 ? edgeAngle : edgeAngle + Math.PI;
}

/**
 * Text lines for a boundary's own centroid annotation.
 *
 * Deed metadata used to be drawn as one block at the average of every point on
 * the canvas. With two drafted tracts that average falls between the boundaries
 * and the block describes only the most recently parsed deed. Boundary files
 * carry their own metadata, so render one block per boundary instead.
 */
export function perBoundaryAnnotationLines(
  file: BoundaryFile,
  options: { fallbackToName?: boolean } = {},
): string[] {
  const lines: string[] = [];
  const parcelId = file.parcelId?.trim();
  const ownerName = file.ownerName?.trim();
  const lotDescription = file.lotDescription?.trim();

  if (parcelId) lines.push(`Parcel: ${parcelId}`);
  if (ownerName) lines.push(`N/F ${ownerName}`);
  if (lotDescription) lines.push(lotDescription);

  // Keep a label on every tract when more than one boundary is on the canvas,
  // even when the deed summary had no owner / parcel metadata.
  if (lines.length === 0 && options.fallbackToName) {
    const name = file.name?.trim();
    if (name) lines.push(name);
  }

  return lines;
}

/**
 * Whether the legacy deed-level annotation block may be rendered.
 *
 * It is only safe when the project has at most one boundary with calls and that
 * boundary has no metadata of its own. Two or more boundaries must never share
 * one averaged annotation.
 */
export function shouldRenderGlobalDeedAnnotation(files?: BoundaryFile[]): boolean {
  const withCalls = (files ?? []).filter(file => file.calls.length > 0);
  if (withCalls.length > 1) return false;
  return !withCalls.some(file => perBoundaryAnnotationLines(file).length > 0);
}
