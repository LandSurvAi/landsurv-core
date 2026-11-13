import type {
  A2UIPointStudioFocus,
  A2UIPointStudioSpec,
  A2UIPointStudioTab,
  PointEfficiencyStyle,
  PointLabelStyle,
  PointMarkerShape,
  PointMarkerStyle,
} from '../types.ts';

export interface PointStyleIntentResult {
  spec: A2UIPointStudioSpec;
  replyText: string;
  suggestedQuestions: string[];
}

const NAMED_COLORS: Record<string, string> = {
  'light blue': '#7DD3FC',
  'sky blue': '#38BDF8',
  'dark blue': '#1D4ED8',
  'light green': '#86EFAC',
  'dark green': '#166534',
  white: '#FFFFFF',
  black: '#000000',
  red: '#EF4444',
  green: '#22C55E',
  blue: '#3B82F6',
  cyan: '#22D3EE',
  aqua: '#22D3EE',
  magenta: '#E879F9',
  fuchsia: '#E879F9',
  yellow: '#FACC15',
  orange: '#F97316',
  purple: '#A855F7',
  violet: '#8B5CF6',
  pink: '#F472B6',
  lime: '#A3E635',
  teal: '#14B8A6',
  navy: '#1E3A8A',
  maroon: '#7F1D1D',
  olive: '#657A35',
  gray: '#94A3B8',
  grey: '#94A3B8',
  brown: '#A16207',
  gold: '#EAB308',
  silver: '#CBD5E1',
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const COLOR_RE = new RegExp(
  `\\b(${Object.keys(NAMED_COLORS).sort((a, b) => b.length - a.length).map(escapeRegex).join('|')})\\b`,
  'i',
);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function extractColor(text: string): { value: string; label: string } | null {
  const hex = text.match(/#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/i);
  if (hex) return { value: hex[0], label: hex[0] };
  const rgb = text.match(/\brgba?\([^)]+\)/i);
  if (rgb) return { value: rgb[0], label: rgb[0] };
  const named = text.match(COLOR_RE);
  if (!named) return null;
  const key = named[1].toLowerCase();
  return { value: NAMED_COLORS[key], label: key };
}

function extractShape(text: string): PointMarkerShape | null {
  if (/\bx\b/i.test(text) && /\b(?:shape|marker|symbol|point)\b/i.test(text)) return 'x';
  const explicit = text.match(/\b(?:shape|glyph|marker|symbol|use|as|to|into)\b[^.]{0,24}\b(dot|circle|square|triangle|cross|diamond|ring)\b/i)
    ?? text.match(/\b(dot|circle|square|triangle|cross|diamond|ring)\b[^.]{0,16}\b(?:shape|glyph|marker|symbol)\b/i);
  return explicit ? explicit[1].toLowerCase() as PointMarkerShape : null;
}

function absoluteSize(text: string): number | null {
  const match = text.match(/\b(?:size|radius|diameter)\s*(?:of|to|=|:)?\s*(\d+(?:\.\d+)?)\s*(?:px|pixels?)?/i)
    ?? text.match(/\b(\d+(?:\.\d+)?)\s*(?:px|pixels?)\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? clamp(value, 1, 32) : null;
}

function relativeSize(text: string): number | null {
  if (/\b(?:much\s+)?(?:smaller|tiny|reduce|shrink)\b/i.test(text)) return 0.75;
  if (/\b(?:much\s+)?(?:bigger|larger|enlarge|increase)\b/i.test(text)) return 1.3;
  return null;
}

function opacityValue(text: string): number | null {
  const match = text.match(/\b(?:opacity|transparent|transparency)\D{0,14}(\d{1,3})\s*%?/i)
    ?? text.match(/\b(\d{1,3})\s*%\s*(?:opacity|transparent)/i);
  if (match) {
    const pct = Number(match[1]);
    return Number.isFinite(pct) ? clamp(pct / 100, 0, 1) : null;
  }
  return /\btransparent\b/i.test(text) ? 0.4 : null;
}

function strokeWidth(text: string): number | null {
  const match = text.match(/\b(?:stroke|outline)\s*(?:width)?\s*(?:of|to|=|:)?\s*(\d+(?:\.\d+)?)\s*(?:px|pixels?)?/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? clamp(value, 0, 4) : null;
}

/**
 * Resolve a natural-language point-appearance request into the exact Point
 * Studio tab, control binding, and optional style patch. This intentionally
 * ignores point-entry/list/workflow language so ordinary point commands keep
 * their existing routing.
 */
export function resolvePointStyleIntent(query: string): PointStyleIntentResult | null {
  const text = query.trim();
  if (text.length < 6) return null;

  const subject = /\b(?:points?|dots?|markers?|symbols?|labels?|point\s+(?:labels?|numbers?|elevations?|descriptions?))\b/i.test(text);
  if (!subject) return null;

  const color = extractColor(text);
  const appearance = Boolean(color)
    || /(?:\b(?:appearance|look|style|color|colour|recolor|recolour|size|shape|glyph|opacity|transparent|stroke|outline|fill|font|smaller|bigger|larger|tiny|thicker|thinner|pixels?)\b|\b\d+(?:\.\d+)?\s*(?:px|pixels?)\b)/i.test(text);
  const action = /\b(?:make|change|set|adjust|update|tune|turn|switch|use|color|colour|recolor|recolour|smaller|bigger|larger|tiny|thicker|thinner|increase|decrease|reduce|enlarge|open|show|edit|configure)\b/i.test(text);
  if (!appearance || !action) return null;

  if (/\b(?:point\s+(?:list|editor|tools?|entry)|add\s+(?:a\s+)?point|delete\s+(?:a\s+)?point|remove\s+(?:a\s+)?point|move\s+(?:a\s+)?point|import\s+points?|export\s+points?)\b/i.test(text)) {
    return null;
  }

  const labelTarget = /\b(?:label|labels|labeling|point\s+numbers?|point\s+labels?|elevations?|point\s+elevations?|descriptions?|point\s+descriptions?)\b/i.test(text);
  const descriptionTarget = /\bdescription\b/i.test(text);
  const efficiencyTarget = /\b(?:efficiency|compressed|dense|density|screen\s+point\s+budget)\b/i.test(text);
  const strokeTarget = /\b(?:stroke|outline)\b/i.test(text);
  const lightTheme = /\blight(?:\s+|-)theme\b|\blight\s+mode\b/i.test(text);
  const fontTarget = /\bfont(?:\s+size)?\b|\btext\s+size\b/i.test(text);

  const marker: Partial<PointMarkerStyle> = {};
  const labels: Partial<PointLabelStyle> = {};
  const efficiency: Partial<PointEfficiencyStyle> = {};
  const summary: string[] = [];
  let focus: A2UIPointStudioFocus = 'marker-size';
  let tab: A2UIPointStudioTab = 'marker';
  let sizeScale: number | undefined;
  let labelSizeScale: number | undefined;

  if (color) {
    if (labelTarget) {
      tab = 'labels';
      if (descriptionTarget) {
        labels.descriptionColor = color.value;
        focus = 'label-description-color';
      } else if (/\belevation/i.test(text)) {
        labels.elevationColor = color.value;
        focus = 'label-elevation-color';
      } else {
        labels.pointNumberColor = color.value;
        focus = 'label-number-color';
      }
      summary.push(`labels ${color.label}`);
    } else if (efficiencyTarget) {
      tab = 'efficiency';
      efficiency.color = color.value;
      efficiency.lightThemeColor = color.value;
      focus = lightTheme ? 'efficiency-light-color' : 'efficiency-color';
      summary.push(`efficiency dots ${color.label}`);
    } else if (strokeTarget) {
      marker.strokeColor = color.value;
      focus = 'marker-stroke';
      summary.push(`outline ${color.label}`);
    } else if (lightTheme) {
      marker.lightThemeColor = color.value;
      focus = 'marker-light-fill';
      summary.push(`light-theme fill ${color.label}`);
    } else {
      marker.color = color.value;
      marker.lightThemeColor = color.value;
      efficiency.color = color.value;
      efficiency.lightThemeColor = color.value;
      focus = 'marker-fill';
      summary.push(`fill ${color.label}`);
    }
  }

  const shape = extractShape(text);
  if (shape) {
    if (labelTarget) {
      tab = 'labels';
    } else if (efficiencyTarget) {
      tab = 'efficiency';
      if (shape === 'circle' || shape === 'square' || shape === 'dot') {
        efficiency.dotShape = shape === 'circle' ? 'circle' : 'square';
      }
      focus = 'efficiency-shape';
      summary.push(`efficiency shape ${shape}`);
    } else {
      marker.shape = shape;
      if (!color) {
        focus = 'marker-shape';
        tab = 'marker';
      }
      summary.push(`shape ${shape}`);
    }
  }

  const stroke = strokeWidth(text);
  const numericSize = stroke !== null ? null : absoluteSize(text);
  const relative = relativeSize(text);
  if (numericSize !== null) {
    if (labelTarget || fontTarget) {
      tab = 'labels';
      labels.fontSizePx = clamp(numericSize, 6, 48);
      focus = 'label-font-size';
      summary.push(`label size ${labels.fontSizePx}px`);
    } else if (efficiencyTarget) {
      tab = 'efficiency';
      efficiency.minDotSizePx = Math.max(1, Number((numericSize * 0.75).toFixed(2)));
      efficiency.maxDotSizePx = numericSize;
      focus = 'efficiency-size';
      summary.push(`efficiency dot size ${numericSize}px`);
    } else {
      marker.sizePx = numericSize;
      if (!color && !shape) focus = 'marker-size';
      summary.push(`size ${numericSize}px`);
    }
  } else if (relative !== null && labelTarget) {
    labelSizeScale = relative;
    focus = 'label-font-size';
    summary.push(relative < 1 ? 'labels smaller' : 'labels larger');
  } else if (relative !== null) {
    sizeScale = relative;
    if (efficiencyTarget) {
      tab = 'efficiency';
      focus = 'efficiency-size';
    } else {
      focus = 'marker-size';
    }
    summary.push(relative < 1 ? 'smaller' : 'larger');
  }

  const opacity = opacityValue(text);
  if (opacity !== null && !labelTarget) {
    marker.opacity = opacity;
    efficiency.opacity = opacity;
    focus = 'marker-opacity';
    summary.push(`opacity ${Math.round(opacity * 100)}%`);
  }

  if (stroke !== null && !labelTarget) {
    marker.strokeWidthPx = stroke;
    focus = 'marker-stroke-width';
    summary.push(`stroke ${stroke}px`);
  }

  const hasPatch = Object.keys(marker).length > 0
    || Object.keys(labels).length > 0
    || Object.keys(efficiency).length > 0
    || sizeScale !== undefined
    || labelSizeScale !== undefined;

  if (labelTarget) {
    tab = 'labels';
    if (!hasPatch && /\b(?:color|colour)\b/i.test(text)) focus = 'label-number-color';
    else if (focus === 'marker-size' && !fontTarget && !hasPatch) focus = 'label-number-color';
  } else if (efficiencyTarget) {
    tab = 'efficiency';
    if (!hasPatch && /\b(?:color|colour)\b/i.test(text)) focus = 'efficiency-color';
    else if (focus === 'marker-size') focus = 'efficiency-size';
  } else if (!hasPatch && /\b(?:color|colour|fill|paint|recolor|recolour)\b/i.test(text)) {
    focus = 'marker-fill';
  } else if (!hasPatch && lightTheme) {
    focus = 'marker-light-fill';
  }

  const targetLabel = labelTarget ? 'point labels' : efficiencyTarget ? 'compressed point dots' : 'point markers';
  const summaryText = summary.length > 0 ? summary.join(' · ') : `${targetLabel} appearance`;
  const spec: A2UIPointStudioSpec = {
    tab,
    focus,
    summary: summaryText,
    ...(Object.keys(marker).length > 0 ? { marker } : {}),
    ...(Object.keys(labels).length > 0 ? { labels } : {}),
    ...(Object.keys(efficiency).length > 0 ? { efficiency } : {}),
    ...(sizeScale !== undefined ? { sizeScale } : {}),
    ...(labelSizeScale !== undefined ? { labelSizeScale } : {}),
  };

  return {
    spec,
    replyText: hasPatch
      ? `Applied the requested <strong>${targetLabel}</strong> change in Point Studio. The matching controls are open below so you can fine-tune it.`
      : `Here are the live <strong>${targetLabel}</strong> controls in Point Studio. The requested setting is focused below.`,
    suggestedQuestions: [
      'Make points cyan and smaller',
      'Give point numbers a darker color',
      'Tune the compressed dot color',
    ],
  };
}
