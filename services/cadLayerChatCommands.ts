/**
 * Deterministic CAD layer commands for chat.
 *
 * These are intentionally model-free: "set layer L-ROAD-CNTR to red dashed"
 * must change the loaded standard and the canvas even when no inference key is
 * configured, and it must not be answered with a description of where the
 * layer picker lives.
 */

export interface CadLayerChatCommand {
  /** Layer name exactly as typed (trimmed). */
  layer: string;
  /** True when the command should also make this the manual drawing layer. */
  makeActive: boolean;
  /** Resolved "#RRGGBB" color, when the command changes one. */
  color?: string;
  /** Resolved linetype name, when the command changes one. */
  lineType?: string;
}

const COLOR_HEX: Record<string, string> = {
  red: '#FF0000',
  yellow: '#FFFF00',
  green: '#00FF00',
  cyan: '#00FFFF',
  blue: '#0000FF',
  magenta: '#FF00FF',
  white: '#FFFFFF',
  black: '#000000',
  gray: '#808080',
  grey: '#808080',
  orange: '#FF7F00',
  purple: '#800080',
  brown: '#A52A2A',
  pink: '#FFC0CB',
  lime: '#00FF00',
  gold: '#FFD700',
  aqua: '#00FFFF',
  violet: '#EE82EE',
  teal: '#008080',
  navy: '#000080',
  silver: '#C0C0C0',
  maroon: '#800000',
  olive: '#808000',
  tan: '#D2B48C',
};

const LINETYPE_ALIASES: Record<string, string> = {
  CONTINUOUS: 'CONTINUOUS',
  SOLID: 'CONTINUOUS',
  DASH: 'DASHED',
  DASHED: 'DASHED',
  DASHED2: 'DASHED2',
  DASHEDX2: 'DASHEDX2',
  HIDDEN: 'HIDDEN',
  HIDDEN2: 'HIDDEN2',
  CENTER: 'CENTER',
  CENTER2: 'CENTER2',
  PHANTOM: 'PHANTOM',
  PHANTOM2: 'PHANTOM2',
  DOT: 'DOT',
  DOT2: 'DOT2',
  DASHDOT: 'DASHDOT',
  DASHDOT2: 'DASHDOT2',
  DIVIDE: 'DIVIDE',
  BORDER: 'BORDER',
  BORDER2: 'BORDER2',
  FENCELINE: 'FENCELINE',
  FENCELINE2: 'FENCELINE2',
  REGULATED_WATERS: 'REGULATED_WATERS',
  GAS_LINE: 'GAS_LINE',
  WATER_LINE: 'WATER_LINE',
  SEWER_LINE: 'SEWER_LINE',
  ELECTRIC_LINE: 'ELECTRIC_LINE',
  TRACKS: 'TRACKS',
  BATTERY: 'BATTERY',
  ZIGZAG: 'ZIGZAG',
};

const LAYER_TOKEN = /^[A-Za-z0-9_$.-]+$/;

const cleanValue = (value: string): string =>
  value.trim().replace(/^[`"'“”]+/, '').replace(/[`"'“”.,;:]+$/, '');

/** Resolve a color name or hex string to "#RRGGBB"; undefined when unrecognized. */
export function normalizeCadLayerColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const token = cleanValue(value).toLowerCase();
  if (!token) return undefined;

  const shortHex = token.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (shortHex) {
    return `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`.toUpperCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(token)) return token.toUpperCase();
  return COLOR_HEX[token];
}

/** Resolve a linetype alias (dashed, hidden, center…) to an AutoCAD name. */
export function normalizeCadLayerLinetype(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const token = cleanValue(value);
  if (!token || !/^[A-Za-z0-9_$.\- ]+$/.test(token)) return undefined;
  const upper = token.replace(/\s+/g, '_').toUpperCase();
  return LINETYPE_ALIASES[upper] ?? upper;
}

function isKnownLinetype(value: string): boolean {
  return Boolean(LINETYPE_ALIASES[value.replace(/\s+/g, '_').toUpperCase()]);
}

/**
 * Parse one chat message into a layer command, or return null when the message
 * is a question / unrelated instruction.
 */
export function parseCadLayerChatCommand(input: string): CadLayerChatCommand | null {
  const text = (input ?? '').trim().replace(/\s+/g, ' ');
  if (!text || text.length > 240) return null;

  const lower = text.toLowerCase();
  const hasActionVerb = /\b(?:set|switch|change|update|make|use)\b/.test(lower);
  const hasLayerWord = /\blayers?\b/.test(lower);
  const hasLayerPropertyPhrase =
    /\b(?:color|colour|linetype|line\s*type)\s+(?:of|for)\s+[A-Za-z0-9_$.-]+/i.test(text);
  if (!hasActionVerb || (!hasLayerWord && !hasLayerPropertyPhrase)) return null;

  // Layer name patterns, most specific first.
  const layerPatterns: RegExp[] = [
    /\b(?:set|switch|change|update|make)\s+(?:the\s+)?(?:active\s+)?(?:drawing\s+)?layer\s+(?:to\s+)?[`"']?([A-Za-z0-9_$.-]+)/i,
    /\b(?:set|change|update)\s+(?:the\s+)?(?:color|colour|linetype|line\s*type)\s+(?:of|for)\s+(?:the\s+)?(?:layer\s+)?[`"']?([A-Za-z0-9_$.-]+)/i,
    /\b(?:make|set)\s+[`"']?([A-Za-z0-9_$.-]+)[`"']?\s+(?:the\s+)?active\s+(?:drawing\s+)?layer/i,
    /\buse\s+(?:the\s+)?(?:drawing\s+)?layer\s+[`"']?([A-Za-z0-9_$.-]+)/i,
    /\bswitch\s+to\s+(?:the\s+)?(?:drawing\s+)?layer\s+[`"']?([A-Za-z0-9_$.-]+)/i,
  ];

  let layer: string | undefined;
  for (const pattern of layerPatterns) {
    const match = text.match(pattern);
    const candidate = match?.[1]?.trim();
    if (!candidate || !LAYER_TOKEN.test(candidate)) continue;
    if (/^(?:color|colour|linetype|line|type|active|drawing|to|the)$/i.test(candidate)) continue;
    layer = candidate;
    break;
  }
  if (!layer) return null;

  // "color of L-X to red" / "color to red" / "change L-X color red".
  let color: string | undefined;
  const colorOf = text.match(
    /\b(?:color|colour)\s+(?:of|for)\s+(?:the\s+)?(?:layer\s+)?[A-Za-z0-9_$.-]+\s+(?:to\s+|=\s*|:\s*)?(#[0-9a-fA-F]{3,6}|[A-Za-z]+)/i,
  );
  if (colorOf) color = normalizeCadLayerColor(colorOf[1]);
  if (!color) {
    const colorDirect = text.match(
      /\b(?:color|colour)\s*(?:to\s+|=\s*|:\s*)?(#[0-9a-fA-F]{3,6}|[A-Za-z]+)/i,
    );
    if (colorDirect) color = normalizeCadLayerColor(colorDirect[1]);
  }

  // "linetype of L-X to hidden" / "linetype hidden" / "change L-X linetype dashed".
  let lineType: string | undefined;
  const linetypeOf = text.match(
    /\b(?:linetype|line\s*type)\s+(?:of|for)\s+(?:the\s+)?(?:layer\s+)?[A-Za-z0-9_$.-]+\s+(?:to\s+|=\s*|:\s*)?([A-Za-z0-9_$.-]+)/i,
  );
  if (linetypeOf) lineType = normalizeCadLayerLinetype(linetypeOf[1]);
  if (!lineType) {
    const linetypeDirect = text.match(
      /\b(?:linetype|line\s*type)\s*(?:to\s+|=\s*|:\s*)?([A-Za-z0-9_$.-]+)/i,
    );
    if (linetypeDirect) lineType = normalizeCadLayerLinetype(linetypeDirect[1]);
  }

  // "set layer L-X to red dashed" — properties without the color/linetype words.
  if (!color && !lineType) {
    const toTail = text.match(/\bto\s+(.+)$/i);
    if (toTail) {
      for (const rawToken of toTail[1].split(/[\s,]+/)) {
        const token = cleanValue(rawToken);
        if (!token || /^(?:and|the|a|an|layer)$/i.test(token)) continue;
        const resolvedColor = normalizeCadLayerColor(token);
        if (resolvedColor && !color) {
          color = resolvedColor;
          continue;
        }
        const normalizedLineType = normalizeCadLayerLinetype(token);
        if (
          normalizedLineType &&
          !lineType &&
          (isKnownLinetype(token) || normalizeCadLayerLinetype(token) !== undefined)
        ) {
          const upperOriginal = token.replace(/\s+/g, '_').toUpperCase();
          if (isKnownLinetype(token) || /^(?:continuous|solid)$/i.test(token)) {
            lineType = normalizedLineType;
          } else if (upperOriginal.startsWith('LT')) {
            lineType = normalizedLineType;
          }
        }
      }
    }
  }

  // "set layer L-X red dashed" — properties after the layer name without "to".
  if (!color && !lineType) {
    const withoutLayer = text.replace(layer, ' ');
    for (const rawToken of withoutLayer.split(/[\s,]+/)) {
      const token = cleanValue(rawToken);
      if (!token) continue;
      if (
        /^(?:set|switch|change|update|make|use|the|a|an|to|and|layer|layers|active|drawing|color|colour|linetype|line|type)$/i.test(token)
      ) {
        continue;
      }
      if (!color) {
        const resolvedColor = normalizeCadLayerColor(token);
        if (resolvedColor) {
          color = resolvedColor;
          continue;
        }
      }
      if (!lineType && isKnownLinetype(token)) {
        lineType = normalizeCadLayerLinetype(token);
      }
    }
  }

  const makeActive =
    /\bactive\b/.test(lower) ||
    /\b(?:switch|use)\b/.test(lower) ||
    (!color && !lineType);

  return {
    layer,
    makeActive,
    ...(color ? { color } : {}),
    ...(lineType ? { lineType } : {}),
  };
}
