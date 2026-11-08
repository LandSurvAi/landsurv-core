/**
 * Annotation sizing shared by the canvas, properties panel, chat commands,
 * and A2UI surfaces.
 *
 * Leroy sizes are a drafting reference: L80 means a plotted cap height of
 * 0.080 inch. Canvas labels are screen-fixed, so the reference is converted at
 * a nominal 120 CSS px per inch. That keeps L80 at 9.6 px and L100 at 12 px —
 * useful reference values without forcing a plot scale on the drawing.
 */

import type {
  AnnotationCategoryStyle,
  AnnotationTextStyle,
  CanvasTextAnnotation,
} from '../types.ts';

export const LEROY_STANDARD_SIZES = [
  40, 50, 60, 80, 100, 120, 140, 175, 200, 240, 290, 350, 425, 500,
] as const;

export const LEROY_SCREEN_PX_PER_INCH = 120;

export const leroyToScreenPx = (leroySize: number): number => {
  const value = Number(leroySize);
  if (!Number.isFinite(value) || value <= 0) return 9.6;
  return Math.round((value / 1000) * LEROY_SCREEN_PX_PER_INCH * 10) / 10;
};

export const screenPxToLeroy = (heightPx: number): number => {
  const value = Number(heightPx);
  if (!Number.isFinite(value) || value <= 0) return 80;
  return Math.round((value / LEROY_SCREEN_PX_PER_INCH) * 1000);
};

export const nearestLeroySize = (heightPx: number): number => {
  const nominal = screenPxToLeroy(heightPx);
  let best: number = LEROY_STANDARD_SIZES[0];
  let bestDistance = Math.abs(best - nominal);
  for (const size of LEROY_STANDARD_SIZES) {
    const distance = Math.abs(size - nominal);
    if (distance < bestDistance) {
      best = size;
      bestDistance = distance;
    }
  }
  return best;
};

export const formatLeroySize = (leroySize: number | undefined): string => {
  if (!Number.isFinite(leroySize) || (leroySize ?? 0) <= 0) return '';
  return `L${Math.round(leroySize as number)}`;
};

export const parseLeroySize = (token: string | undefined | null): number | null => {
  if (!token) return null;
  const match = token.trim().match(/^l\s*(\d{2,3})$/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value >= 20 && value <= 500 ? value : null;
};

/**
 * One Leroy step up or down. The ladder is not evenly spaced, which matches
 * how drafting text sizes are actually chosen (L80 → L100, L60 → L80, …).
 */
export const stepLeroySize = (heightPx: number, steps: number): number => {
  const current = nearestLeroySize(heightPx);
  const index = LEROY_STANDARD_SIZES.indexOf(current as typeof LEROY_STANDARD_SIZES[number]);
  const start = index >= 0 ? index : LEROY_STANDARD_SIZES.indexOf(80);
  const next = Math.min(
    LEROY_STANDARD_SIZES.length - 1,
    Math.max(0, start + steps),
  );
  return LEROY_STANDARD_SIZES[next];
};

/** Rational, screen-fixed defaults for each annotation family. */
export const DEFAULT_ANNOTATION_HEIGHT_PX: Record<string, number> = {
  boundary: leroyToScreenPx(80),
  callout: leroyToScreenPx(80),
  roads: leroyToScreenPx(100),
  'contour-labels': leroyToScreenPx(60),
  'property-owners': leroyToScreenPx(60),
  'flood-zones': leroyToScreenPx(80),
  'soil-map-units': leroyToScreenPx(60),
  'manual-text': leroyToScreenPx(80),
};

export const DEFAULT_ANNOTATION_LEROY: Record<string, number> = {
  boundary: 80,
  callout: 80,
  roads: 100,
  'contour-labels': 60,
  'property-owners': 60,
  'flood-zones': 80,
  'soil-map-units': 60,
  'manual-text': 80,
};

export const defaultHeightForCategory = (categoryId: string | undefined): number =>
  DEFAULT_ANNOTATION_HEIGHT_PX[categoryId ?? 'manual-text'] ?? leroyToScreenPx(80);

export const defaultLeroyForCategory = (categoryId: string | undefined): number =>
  DEFAULT_ANNOTATION_LEROY[categoryId ?? 'manual-text'] ?? 80;

/** Base pixel height for a category, before its user scale multiplier. */
export const categoryBaseHeightPx = (
  category: Pick<AnnotationCategoryStyle, 'id' | 'heightPx'> | null | undefined,
): number => {
  const explicit = Number(category?.heightPx);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return defaultHeightForCategory(category?.id);
};

export const categoryEffectiveHeightPx = (
  category: Pick<AnnotationCategoryStyle, 'id' | 'heightPx' | 'scale'> | null | undefined,
): number => {
  const scale = Number(category?.scale);
  return categoryBaseHeightPx(category) * (Number.isFinite(scale) && scale > 0 ? scale : 1);
};

export const textBaseHeightPx = (
  annotation: CanvasTextAnnotation,
  style: AnnotationTextStyle | undefined,
  category?: AnnotationCategoryStyle | null,
): number => {
  const explicit = Number(annotation.height);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const styleHeight = Number(style?.height);
  if (Number.isFinite(styleHeight) && styleHeight > 0) return styleHeight;
  return categoryBaseHeightPx(category);
};

export const textEffectiveHeightPx = (
  annotation: CanvasTextAnnotation,
  style: AnnotationTextStyle | undefined,
  category: AnnotationCategoryStyle | null | undefined,
  globalScale = 1,
): number => {
  const base = textBaseHeightPx(annotation, style, category);
  const textScale = Number(annotation.scale);
  const categoryScale = Number(category?.scale);
  const global = Number(globalScale);
  return base
    * (Number.isFinite(textScale) && textScale > 0 ? textScale : 1)
    * (Number.isFinite(categoryScale) && categoryScale > 0 ? categoryScale : 1)
    * (Number.isFinite(global) && global > 0 ? global : 1);
};

export interface AnnotationMaskSettings {
  enabled: boolean;
  padding: number;
  color?: string;
  opacity: number;
}

export const resolveAnnotationMask = (
  annotation: Pick<
    CanvasTextAnnotation,
    'maskEnabled' | 'maskPadding' | 'maskColor' | 'maskOpacity'
  >,
  category?: Pick<
    AnnotationCategoryStyle,
    'maskEnabled' | 'maskPadding' | 'maskColor' | 'maskOpacity'
  > | null,
): AnnotationMaskSettings => {
  const enabled = annotation.maskEnabled ?? category?.maskEnabled ?? false;
  const rawPadding = annotation.maskPadding ?? category?.maskPadding ?? 2;
  const rawOpacity = annotation.maskOpacity ?? category?.maskOpacity ?? 0.88;
  return {
    enabled,
    padding: Math.min(24, Math.max(0, Number.isFinite(rawPadding) ? rawPadding : 2)),
    color: annotation.maskColor ?? category?.maskColor,
    opacity: Math.min(1, Math.max(0.05, Number.isFinite(rawOpacity) ? rawOpacity : 0.88)),
  };
};

export const leroySizeForHeight = (
  heightPx: number | undefined,
  explicitLeroy?: number,
): number | undefined => {
  if (Number.isFinite(explicitLeroy) && (explicitLeroy ?? 0) > 0) return explicitLeroy;
  if (Number.isFinite(heightPx) && (heightPx ?? 0) > 0) return nearestLeroySize(heightPx as number);
  return undefined;
};
