import type {
  AnnotationCategoryStyle,
  AnnotationTextStyle,
  CanvasTextAnnotation,
  ContourLabel,
  MapAreaLabel,
  ParcelCadTextStyle,
  ParcelLabel,
  ParcelLabelFormatter,
  SurveyLine,
  SurveyPoint,
  StreetLabel,
} from '../types.ts';
import {
  applyAnnotationTextCase,
  resolveAnnotationCategoryTextStyle,
  resolveCanvasTextStyle,
} from './annotationTextStyle.ts';
import { resolveAnnotationMask } from './annotationSizing.ts';
import { buildParcelLabelLines, resolveParcelTextStyle } from './parcelLabelFormatter.ts';

export interface SheetPointLayerStyle {
  visible: boolean;
  color: string;
}

export interface SheetPointLayers {
  pointNumber: SheetPointLayerStyle;
  description: SheetPointLayerStyle;
  elevation: SheetPointLayerStyle;
}

/** One text block ready to place at a world coordinate on paper. */
export interface SheetTextAnnotation {
  id: string;
  x: number;
  y: number;
  angleDeg: number;
  lines: string[];
  fontPt: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  color: string;
  /** Horizontal text anchor in SVG terms. */
  anchor: 'start' | 'middle';
  /** Baseline used for multi-line blocks. */
  baseline: 'middle' | 'hanging';
  lineSpacing: number;
  /** Paper-space offset from the world anchor, in points. */
  offsetXPt: number;
  offsetYPt: number;
  mask?: {
    paddingPt: number;
    color: string;
    opacity: number;
  };
}

export interface SheetAnnotationSource {
  points: SurveyPoint[];
  contourLabels: ContourLabel[];
  lines: SurveyLine[];
  streetLabels?: StreetLabel[];
  parcelLabels?: ParcelLabel[];
  mapAreaLabels?: MapAreaLabel[];
  textAnnotations?: CanvasTextAnnotation[];
  pointLayers?: SheetPointLayers;
  coordinatePrecision?: number;
  /** Viewport annotation height in paper points. */
  textSizePt?: number;
  annotationScale?: number;
  annotationCategories?: AnnotationCategoryStyle[];
  annotationTextStyles?: AnnotationTextStyle[];
  activeTextStyleName?: string;
  parcelLabelFormatter?: ParcelLabelFormatter;
  parcelCadTextStyles?: ParcelCadTextStyle[];
}

const DEFAULT_CATEGORY_HEIGHT_PX = 9.6;
const DEFAULT_TEXT_SIZE_PT = 6;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function categoryFontPt(
  category: AnnotationCategoryStyle | null | undefined,
  textSizePt: number,
): number {
  const base = Number.isFinite(textSizePt) && textSizePt > 0 ? textSizePt : DEFAULT_TEXT_SIZE_PT;
  const height = Number.isFinite(category?.heightPx) && (category?.heightPx ?? 0) > 0
    ? category!.heightPx!
    : DEFAULT_CATEGORY_HEIGHT_PX;
  const scale = Number.isFinite(category?.scale) && (category?.scale ?? 0) > 0
    ? category!.scale
    : 1;
  return clamp(base * (height / DEFAULT_CATEGORY_HEIGHT_PX) * scale, 2.5, 72);
}

function parseColor(color: string): { r: number; g: number; b: number } | null {
  const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const raw = hex[1];
    const expanded = raw.length === 3
      ? raw.split('').map(char => char + char).join('')
      : raw;
    return {
      r: parseInt(expanded.slice(0, 2), 16),
      g: parseInt(expanded.slice(2, 4), 16),
      b: parseInt(expanded.slice(4, 6), 16),
    };
  }
  const rgb = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!rgb) return null;
  return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
}

/**
 * Screen annotation colors are chosen for a dark canvas. On white paper a cyan
 * or lime label can disappear, so light colors are darkened while preserving
 * their hue.
 */
export function ensurePaperContrast(color: string | undefined): string {
  const fallback = '#1f2937';
  if (!color) return fallback;
  const rgb = parseColor(color);
  if (!rgb) return color;

  let { r, g, b } = rgb;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (luminance <= 0.52) return color;

  for (let i = 0; i < 18 && (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.34; i++) {
    r = Math.round(r * 0.86);
    g = Math.round(g * 0.86);
    b = Math.round(b * 0.86);
  }
  return `#${[r, g, b].map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
}

function annotationLines(lines: string[], textCase?: 'original' | 'uppercase' | 'lowercase'): string[] {
  return lines
    .map(line => applyAnnotationTextCase(line, textCase))
    .filter(line => line.length > 0);
}

function maskForText(
  annotation: Pick<CanvasTextAnnotation, 'maskEnabled' | 'maskPadding' | 'maskColor' | 'maskOpacity'>,
  category?: AnnotationCategoryStyle | null,
): SheetTextAnnotation['mask'] | undefined {
  const mask = resolveAnnotationMask(annotation, category);
  if (!mask.enabled) return undefined;
  return {
    paddingPt: mask.padding,
    color: mask.color ?? '#ffffff',
    opacity: mask.opacity,
  };
}

/**
 * Convert every annotation family drawn on the model-space canvas into
 * paper-space text. Geometry itself is plotted by SheetView; this module is
 * deliberately limited to labels so preview and PDF cannot drift apart.
 */
export function buildSheetAnnotations(source: SheetAnnotationSource): SheetTextAnnotation[] {
  const {
    points,
    contourLabels,
    lines,
    streetLabels = [],
    parcelLabels = [],
    mapAreaLabels = [],
    textAnnotations = [],
    pointLayers,
    coordinatePrecision = 2,
    textSizePt = DEFAULT_TEXT_SIZE_PT,
    annotationScale = 1,
    annotationCategories = [],
    annotationTextStyles = [],
    activeTextStyleName,
    parcelLabelFormatter,
    parcelCadTextStyles = [],
  } = source;

  const category = (id: string) => annotationCategories.find(item => item.id === id) ?? null;
  const categoryStyle = (id: string) => resolveAnnotationCategoryTextStyle(category(id), parcelCadTextStyles);
  const result: SheetTextAnnotation[] = [];
  const precision = clamp(Math.round(coordinatePrecision), 0, 8);

  const contourCategory = category('contour-labels');
  const contourStyle = categoryStyle('contour-labels');
  if (contourStyle.visible && contourLabels.length > 0) {
    const fontPt = categoryFontPt(contourCategory, textSizePt);
    const color = ensurePaperContrast(contourStyle.color);
    contourLabels.forEach((label, index) => {
      const text = applyAnnotationTextCase(label.text, contourStyle.textCase);
      if (!text.trim()) return;
      result.push({
        id: `contour-${index}`,
        x: label.x,
        y: label.y,
        angleDeg: label.angle,
        lines: [text],
        fontPt,
        fontFamily: contourStyle.fontFamily,
        bold: contourStyle.fontBold,
        italic: contourStyle.fontItalic,
        color,
        anchor: 'middle',
        baseline: 'middle',
        lineSpacing: 1,
        offsetXPt: 0,
        offsetYPt: 0,
      });
    });
  }

  const roadCategory = category('roads');
  const roadStyle = categoryStyle('roads');
  if (roadStyle.visible && streetLabels.length > 0) {
    const fontPt = categoryFontPt(roadCategory, textSizePt);
    streetLabels.forEach((label, index) => {
      const lines = annotationLines([label.text], roadStyle.textCase);
      if (lines.length === 0) return;
      result.push({
        id: `street-${index}`,
        x: label.x,
        y: label.y,
        angleDeg: label.angle,
        lines,
        fontPt,
        fontFamily: roadStyle.fontFamily,
        bold: roadStyle.fontBold,
        italic: roadStyle.fontItalic,
        color: ensurePaperContrast(roadStyle.color),
        anchor: 'middle',
        baseline: 'middle',
        lineSpacing: roadStyle.lineSpacing,
        offsetXPt: 0,
        offsetYPt: 0,
      });
    });
  }

  const ownerCategory = category('property-owners');
  const ownerStyle = categoryStyle('property-owners');
  if (ownerStyle.visible && parcelLabels.length > 0) {
    const parcelStyle = resolveParcelTextStyle(parcelLabelFormatter, parcelCadTextStyles);
    const usesCadCategory = ownerCategory?.styleSource === 'cad-manager' && ownerCategory.cadTextStyleName;
    const textCase = usesCadCategory ? ownerStyle.textCase : parcelStyle.textCase;
    const fontPt = categoryFontPt(ownerCategory, textSizePt);
    for (const label of parcelLabels) {
      const lines = annotationLines(buildParcelLabelLines(label, parcelLabelFormatter), textCase);
      if (lines.length === 0) continue;
      result.push({
        id: `parcel-${label.id}`,
        x: label.x,
        y: label.y,
        angleDeg: label.angle,
        lines,
        fontPt,
        fontFamily: usesCadCategory ? ownerStyle.fontFamily : parcelStyle.fontFamily,
        bold: usesCadCategory ? ownerStyle.fontBold : parcelStyle.fontBold,
        italic: usesCadCategory ? ownerStyle.fontItalic : parcelStyle.fontItalic,
        color: ensurePaperContrast(ownerStyle.color),
        anchor: 'middle',
        baseline: 'middle',
        lineSpacing: usesCadCategory ? ownerStyle.lineSpacing : parcelStyle.lineSpacing,
        offsetXPt: 0,
        offsetYPt: 0,
      });
    }
  }

  for (const label of mapAreaLabels) {
    if (label.visible === false) continue;
    const cat = category(label.category);
    const style = categoryStyle(label.category);
    if (!style.visible) continue;
    const lines = annotationLines(label.lines, style.textCase);
    if (lines.length === 0) continue;
    result.push({
      id: `area-${label.id}`,
      x: label.x,
      y: label.y,
      angleDeg: label.angle,
      lines,
      fontPt: categoryFontPt(cat, textSizePt),
      fontFamily: style.fontFamily,
      bold: style.fontBold,
      italic: style.fontItalic,
      color: ensurePaperContrast(cat?.color ?? (label.source === 'fema-flood' ? '#22d3ee' : '#e7c99a')),
      anchor: 'middle',
      baseline: 'middle',
      lineSpacing: style.lineSpacing,
      offsetXPt: 0,
      offsetYPt: 0,
    });
  }

  if (textAnnotations.length > 0) {
    const styles = annotationTextStyles;
    for (const annotation of textAnnotations) {
      if (annotation.hidden) continue;
      const cat = category(annotation.categoryId ?? 'manual-text');
      const style = resolveCanvasTextStyle({
        annotation,
        category: cat,
        styles,
        fallbackStyleName: activeTextStyleName,
      });
      if (!style.visible) continue;
      const lines = annotationLines(annotation.text.split('\n'), style.textCase);
      if (lines.length === 0) continue;
      const fontPt = clamp(
        textSizePt * (style.height / DEFAULT_CATEGORY_HEIGHT_PX) * style.scale * annotationScale,
        2.5,
        96,
      );
      result.push({
        id: `text-${annotation.id}`,
        x: annotation.x,
        y: annotation.y,
        angleDeg: annotation.angle,
        lines,
        fontPt,
        fontFamily: style.fontFamily,
        bold: style.bold,
        italic: style.italic,
        color: ensurePaperContrast(style.color ?? cat?.color ?? '#e2e8f0'),
        anchor: 'start',
        baseline: 'hanging',
        lineSpacing: style.lineSpacing,
        offsetXPt: 0,
        offsetYPt: 0,
        mask: maskForText(annotation, cat),
      });
    }
  }

  if (pointLayers) {
    const fontPt = clamp(textSizePt, 3, 24);
    const lineHeightPt = fontPt * 1.15;
    for (const point of points) {
      if (point.hidden) continue;
      const worldX = point.easting + (point.labelOffset?.x ?? 0);
      const worldY = point.northing + (point.labelOffset?.y ?? 0);
      const addPointLabel = (
        suffix: string,
        text: string,
        style: SheetPointLayerStyle,
        offsetY: number,
      ) => {
        if (!style.visible || !text.trim()) return;
        result.push({
          id: `point-${point.pointNumber}-${suffix}`,
          x: worldX,
          y: worldY,
          angleDeg: 0,
          lines: [text],
          fontPt,
          fontFamily: 'Arial, sans-serif',
          bold: false,
          italic: false,
          color: ensurePaperContrast(style.color),
          anchor: 'start',
          baseline: 'middle',
          lineSpacing: 1,
          offsetXPt: 2,
          offsetYPt: offsetY,
        });
      };

      addPointLabel('number', point.pointNumber, pointLayers.pointNumber, -lineHeightPt);
      addPointLabel(
        'elevation',
        typeof point.elevation === 'number' && Number.isFinite(point.elevation)
          ? point.elevation.toFixed(precision)
          : '',
        pointLayers.elevation,
        0,
      );
      addPointLabel('description', point.description ?? '', pointLayers.description, lineHeightPt);
    }
  }

  // FEMA BFE callouts are line annotations rather than category labels.
  const bfeFontPt = clamp(textSizePt * 0.9, 3, 18);
  for (const line of lines) {
    if (line.hidden || line.type !== 'bfe' || !line.labelText) continue;
    const a = line.fromPt;
    const b = line.toPt;
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.hypot(dx, dy) < 1e-9) continue;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    result.push({
      id: `bfe-${line.id ?? `${line.from}-${line.to}`}`,
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      angleDeg: angle > 90 || angle < -90 ? angle + 180 : angle,
      lines: [line.labelText],
      fontPt: bfeFontPt,
      fontFamily: 'Arial, sans-serif',
      bold: true,
      italic: false,
      color: '#1d4ed8',
      anchor: 'middle',
      baseline: 'middle',
      lineSpacing: 1,
      offsetXPt: 0,
      offsetYPt: 0,
    });
  }

  return result;
}
