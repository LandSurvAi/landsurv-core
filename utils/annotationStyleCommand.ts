/**
 * Natural-language annotation styling.
 *
 * These commands are deterministic so property changes do not depend on a
 * model call. Examples:
 *   "Adjust all FEMA text size to L80"
 *   "Make sanitary notes a little bigger"
 *   "Set boundary labels font to Romans"
 *   "Turn on wipeout for all text at 3 px"
 */

import type {
  AnnotationCategoryStyle,
  AnnotationTextStyle,
  CanvasTextAnnotation,
} from '../types.ts';
import {
  categoryBaseHeightPx,
  formatLeroySize,
  leroyToScreenPx,
  nearestLeroySize,
  stepLeroySize,
  textEffectiveHeightPx,
} from './annotationSizing.ts';
import { normalizeAnnotationFont } from './annotationFonts.ts';

export type AnnotationStyleCommand =
  | {
      kind: 'size';
      target: string;
      /** Absolute Leroy reference, when the request named one. */
      leroySize?: number;
      /** Absolute pixel height, when explicitly requested. */
      heightPx?: number;
      /** One or two Leroy ladder steps for “a little bigger”, etc. */
      relativeSteps?: number;
      raw: string;
    }
  | {
      kind: 'font';
      target: string;
      fontFamily: string;
      raw: string;
    }
  | {
      kind: 'wipeout';
      target: string;
      enabled?: boolean;
      padding?: number;
      color?: string;
      opacity?: number;
      raw: string;
    };

export interface AnnotationStyleState {
  categories: AnnotationCategoryStyle[];
  styles: AnnotationTextStyle[];
  annotations: CanvasTextAnnotation[];
}

export interface AnnotationStyleApplyResult {
  categories: AnnotationCategoryStyle[];
  styles: AnnotationTextStyle[];
  annotations: CanvasTextAnnotation[];
  categoryIds: string[];
  textCount: number;
  summary: string;
}

const SIZE_VERBS =
  '(?:adjust|change|set|resize|make|bump|increase|decrease|scale|enlarge|reduce)';

const TARGET_CLEAN_RE =
  /^(?:please\s+)?(?:adjust|change|set|resize|make|bump|increase|decrease|scale|enlarge|reduce)\s+/i;

const ALL_TEXT_RE = /\b(?:all|every|each)\s+(?:text|texts|notes?|annotations?)\b/i;

const cleanTarget = (value: string): string => {
  if (ALL_TEXT_RE.test(value)) return 'all text';
  return value
    .replace(TARGET_CLEAN_RE, '')
    .replace(/\b(?:turn|switch|set|put)\s+(?:on|off)\b/gi, ' ')
    .replace(/\b(?:the|all|every|each|of)\b/gi, ' ')
    .replace(/\b(?:text|label|labels|annotation|annotations|note|notes)\s*(?:size|height|font|wipeout|mask)?\s*$/i, '')
    .replace(/\b(?:size|height)\s*$/i, '')
    .replace(/\b(?:for|on|at|with)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const SIZE_PHRASE_RE =
  /(?:\s+(?:to|at|of))?\s+(?:(?:leroy\s+)?l\s*(\d{2,3})|(\d+(?:\.\d+)?)\s*(?:px|pixels?)|((?:a\s+little|a\s+bit|slightly|much|way|one\s+step)\s+)?(bigger|larger|smaller|tinier|up|down|increase|decrease))\s*$/i;

const parseRelativeSteps = (modifier: string, direction: string): number => {
  const strong = /\b(?:much|way|two\s+steps)\b/i.test(modifier);
  const sign = /smaller|tinier|down|decrease/i.test(direction) ? -1 : 1;
  return sign * (strong ? 2 : 1);
};

export function parseAnnotationStyleCommand(raw: string): AnnotationStyleCommand | null {
  if (!raw || !raw.trim()) return null;
  const text = raw.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
  const lower = text.toLowerCase();

  // Font request: "set boundary labels font to Romans".
  const fontMatch = text.match(
    new RegExp(`^${SIZE_VERBS}\\s+(.+?)\\s+(?:font|typeface)\\s*(?:to|as)?\\s+(.+)$`, 'i'),
  ) ?? text.match(new RegExp(`^set\\s+(?:the\\s+)?font\\s+(?:for|on)\\s+(.+?)\\s+to\\s+(.+)$`, 'i'))
    ?? text.match(/^(?:please\s+)?(?:set\s+)?(?:the\s+)?font(?:\s+to)?\s+(.+)$/i);
  if (fontMatch) {
    const fontFamily = normalizeAnnotationFont(fontMatch[fontMatch.length - 1]);
    const target = fontMatch.length === 2 && /^(?:the\s+)?font/i.test(text)
      ? 'all text'
      : cleanTarget(fontMatch[1]);
    if (fontFamily && target) {
      return { kind: 'font', target, fontFamily, raw: text };
    }
  }

  // Wipeout request. Keep color parsing conservative: named basic colors,
  // #rrggbb, and rgb(...) only.
  if (/\b(?:wipeout|background\s+mask|mask|background)\b/i.test(lower)) {
    const enabled = /\b(?:on|enable|enabled|show|add)\b/i.test(lower)
      ? true
      : /\b(?:off|disable|disabled|hide|remove|no)\b/i.test(lower)
        ? false
        : undefined;
    const [beforeWipeout = '', afterWipeout = ''] = text.split(/\b(?:background\s+wipeout|wipeout|background\s+mask|mask|background)\b/i);
    const beforeTarget = cleanTarget(beforeWipeout);
    const afterTargetRaw = afterWipeout
      .replace(/^\s*(?:for|on|to|with)\s+/i, '')
      .replace(/\b(?:at|with|using)\s+.*$/i, '')
      .replace(/(\d+(?:\.\d+)?)\s*(?:px|pixels?|%)/gi, ' ')
      .trim();
    const target = beforeTarget && !/^(?:turn|switch|set|put|enable|disable|on|off)$/i.test(beforeTarget)
      ? beforeTarget
      : cleanTarget(afterTargetRaw);
    const paddingMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:px|pixels?)/);
    const opacityMatch = lower.match(/(\d+(?:\.\d+)?)\s*%/);
    const colorMatch = text.match(/#[0-9a-f]{6}\b|\brgb\([^)]+\)|\b(?:black|white|navy|blue|cyan|green|red|gray|grey|yellow)\b/i);
    if (target) {
      return {
        kind: 'wipeout',
        target,
        enabled,
        padding: paddingMatch ? Number(paddingMatch[1]) : undefined,
        opacity: opacityMatch ? Math.max(0.05, Math.min(1, Number(opacityMatch[1]) / 100)) : undefined,
        color: colorMatch?.[0],
        raw: text,
      };
    }
  }

  const sizeMatch = text.match(SIZE_PHRASE_RE);
  if (!sizeMatch) return null;
  const target = cleanTarget(text.slice(0, sizeMatch.index).replace(/\s+(?:size|height)$/i, ''));
  if (!target) return null;

  if (sizeMatch[1]) {
    const leroySize = Number(sizeMatch[1]);
    if (!Number.isFinite(leroySize) || leroySize < 20 || leroySize > 500) return null;
    return { kind: 'size', target, leroySize, raw: text };
  }
  if (sizeMatch[2]) {
    const heightPx = Number(sizeMatch[2]);
    if (!Number.isFinite(heightPx) || heightPx <= 0) return null;
    return { kind: 'size', target, heightPx, raw: text };
  }
  if (sizeMatch[4]) {
    return {
      kind: 'size',
      target,
      relativeSteps: parseRelativeSteps(sizeMatch[3] ?? '', sizeMatch[4]),
      raw: text,
    };
  }
  return null;
}

interface CategoryAlias {
  id: string;
  words: RegExp;
  label: string;
}

const CATEGORY_ALIASES: CategoryAlias[] = [
  { id: 'boundary', words: /\b(?:boundary|bearing|distance|b&d|deed|call|calls|parcel boundary)\b/i, label: 'boundary' },
  { id: 'flood-zones', words: /\b(?:fema|flood|firm|firmette|zone|zones|ae|a-zone)\b/i, label: 'FEMA/flood' },
  { id: 'soil-map-units', words: /\b(?:soil|soils|ssurgo|map unit|map units|hydric)\b/i, label: 'soil' },
  { id: 'roads', words: /\b(?:road|roads|street|streets|centerline|centerlines|cl)\b/i, label: 'road/street' },
  { id: 'contour-labels', words: /\b(?:contour|contours|elevation|elevations)\b/i, label: 'contour' },
  { id: 'property-owners', words: /\b(?:owner|owners|property owner|parcel owner|property)\b/i, label: 'property owner' },
  { id: 'callout', words: /\b(?:callout|callouts|point label|point labels|point note|point notes)\b/i, label: 'callout' },
  { id: 'manual-text', words: /\b(?:manual|general note|general notes|free text|note text)\b/i, label: 'manual text' },
];

const STOP_WORDS = new Set([
  'all', 'the', 'every', 'each', 'text', 'texts', 'label', 'labels',
  'annotation', 'annotations', 'note', 'notes', 'size', 'height', 'font',
  'to', 'for', 'on', 'at', 'a', 'an', 'of', 'my', 'this', 'that', 'please',
]);

const significantWords = (target: string): string[] =>
  target
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(word => word.length > 1 && !STOP_WORDS.has(word));

const annotationMatchesCategory = (
  annotation: CanvasTextAnnotation,
  categoryId: string,
): boolean => (annotation.categoryId ?? 'manual-text') === categoryId;

const resolveTargets = (
  target: string,
  state: AnnotationStyleState,
): { categoryIds: string[]; textIds: Set<string>; words: string[] } => {
  const words = significantWords(target);
  const categoryIds = CATEGORY_ALIASES
    .filter(alias => alias.words.test(target))
    .map(alias => alias.id)
    .filter(id => state.categories.some(category => category.id === id));
  const textIds = new Set<string>();

  for (const annotation of state.annotations) {
    const categoryMatch = categoryIds.some(id => annotationMatchesCategory(annotation, id));
    const textMatch = words.length > 0 && words.some(word => (
      annotation.text.toLowerCase().includes(word)
    ));
    if (categoryMatch || textMatch) textIds.add(annotation.id);
  }

  // A bare “all text/notes” request targets every standalone text entity.
  if (categoryIds.length === 0 && words.length === 0 && /\b(?:text|note|annotation)s?\b/i.test(target)) {
    for (const annotation of state.annotations) textIds.add(annotation.id);
  }

  return { categoryIds, textIds, words };
};

const targetSummary = (
  target: string,
  categoryIds: string[],
  textCount: number,
): string => {
  const parts: string[] = [];
  if (categoryIds.length > 0) {
    const labels = CATEGORY_ALIASES
      .filter(alias => categoryIds.includes(alias.id))
      .map(alias => alias.label);
    parts.push(labels.join(' + '));
  }
  if (textCount > 0) parts.push(`${textCount} text object${textCount === 1 ? '' : 's'}`);
  if (parts.length === 0) return `**${target}** (no matching annotations)`;
  return parts.join(' + ');
};

export function applyAnnotationStyleCommand(
  command: AnnotationStyleCommand,
  state: AnnotationStyleState,
): AnnotationStyleApplyResult {
  const { categoryIds, textIds } = resolveTargets(command.target, state);
  const categories = state.categories.map(category => {
    if (!categoryIds.includes(category.id)) return category;
    if (command.kind === 'size') {
      const currentHeight = categoryBaseHeightPx(category);
      const nextHeight = command.leroySize !== undefined
        ? leroyToScreenPx(command.leroySize)
        : command.heightPx !== undefined
          ? command.heightPx
          : leroyToScreenPx(stepLeroySize(currentHeight, command.relativeSteps ?? 1));
      return {
        ...category,
        heightPx: nextHeight,
        leroySize: command.leroySize ?? nearestLeroySize(nextHeight),
      };
    }
    if (command.kind === 'font') {
      return { ...category, fontFamily: command.fontFamily, styleSource: 'local' as const, cadTextStyleName: undefined };
    }
    return {
      ...category,
      maskEnabled: command.enabled ?? true,
      maskPadding: command.padding ?? category.maskPadding ?? 2,
      maskColor: command.color ?? category.maskColor,
      maskOpacity: command.opacity ?? category.maskOpacity ?? 0.88,
    };
  });

  const styles = state.styles.map(style => {
    if (command.kind !== 'font') return style;
    const referenced = state.annotations.some(annotation => (
      textIds.has(annotation.id) && (annotation.styleName ?? '') === style.name
    ));
    return referenced ? { ...style, fontFamily: command.fontFamily } : style;
  });
  const annotations = state.annotations.map(annotation => {
    if (!textIds.has(annotation.id)) return annotation;
    if (command.kind === 'size') {
      const style = styles.find(item => item.name === annotation.styleName) ?? styles[0];
      const category = state.categories.find(item => item.id === (annotation.categoryId ?? 'manual-text'));
      const currentHeight = textEffectiveHeightPx(annotation, style, category);
      const nextHeight = command.leroySize !== undefined
        ? leroyToScreenPx(command.leroySize)
        : command.heightPx !== undefined
          ? command.heightPx
          : leroyToScreenPx(stepLeroySize(currentHeight, command.relativeSteps ?? 1));
      return {
        ...annotation,
        height: nextHeight,
        leroySize: command.leroySize ?? nearestLeroySize(nextHeight),
      };
    }
    if (command.kind === 'font') {
      return { ...annotation, fontFamily: command.fontFamily };
    }
    return {
      ...annotation,
      maskEnabled: command.enabled ?? true,
      maskPadding: command.padding ?? annotation.maskPadding ?? 2,
      maskColor: command.color ?? annotation.maskColor,
      maskOpacity: command.opacity ?? annotation.maskOpacity ?? 0.88,
    };
  });

  const ref = command.kind === 'size'
    ? command.leroySize !== undefined
      ? ` to ${formatLeroySize(command.leroySize)}`
      : command.heightPx !== undefined
        ? ` to ${Math.round(command.heightPx * 10) / 10} px`
        : command.relativeSteps && command.relativeSteps < 0 ? ' one Leroy step smaller' : ' one Leroy step larger'
    : command.kind === 'font'
      ? ` font ${command.fontFamily}`
      : ` wipeout ${command.enabled === false ? 'off' : 'on'}`;

  return {
    categories,
    styles,
    annotations,
    categoryIds,
    textCount: textIds.size,
    summary: `${targetSummary(command.target, categoryIds, textIds.size)}${ref}.`,
  };
}
