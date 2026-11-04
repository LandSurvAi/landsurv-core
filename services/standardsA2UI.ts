/**
 * CAD Standards → A2UI query resolver.
 *
 * Turns natural questions about a loaded standard ("show the pavement layer",
 * "what linetypes are available?", "open the standards spreadsheet") into a
 * compact A2UI sheet with a pre-applied facet and search query. This keeps the
 * answer focused instead of dropping the entire standards spreadsheet into chat.
 */

import type { StandardDefinition } from '../contexts/types/CadManager.types.ts';
import type { A2UIStandardsFacet, A2UIStandardsFilter } from '../types.ts';

export interface StandardsA2UIResolution {
  filter: A2UIStandardsFilter;
  replyText: string;
}

const FACET_WORD_RE =
  /\b(layers?|linetypes?|line\s*types?|description\s*keys?|codes?|symbols?|standards?|spreadsheet|sheet)\b/i;

const INTENT_RE =
  /\b(show|list|display|view|open|what|which|where|find|lookup|look up|explain|tell\s+me|search|filter|sheet|spreadsheet)\b|\?/i;

const EDIT_COMMAND_RE = /^\s*(add|create|delete|remove|edit|rename|change|update|set)\b/i;

const STOP_WORDS =
  /\b(show|list|display|view|open|what|which|where|find|lookup|look\s+up|explain|tell|me|the|a|an|is|are|for|about|in|of|from|please|cad|standard|standards|spreadsheet|sheet|all|any|do|we|have|has|available|exist|exists|defined|entries|rows)\b/gi;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectLayerNames(standard: StandardDefinition): string[] {
  const names = new Set<string>();
  for (const layer of standard.layers ?? []) {
    const name = (layer?.name ?? '').trim();
    if (name && name !== '-') names.add(name);
  }
  for (const code of standard.codes ?? []) {
    if (code.pointLayer && code.pointLayer !== '-') names.add(code.pointLayer.trim());
    if (code.lineLayer && code.lineLayer !== '-') names.add(code.lineLayer.trim());
  }
  return [...names];
}

function symbolName(symbol: unknown): string {
  if (typeof symbol === 'string') return symbol;
  if (symbol && typeof symbol === 'object' && 'name' in symbol) {
    return String((symbol as { name?: unknown }).name ?? '');
  }
  return '';
}

function extractFocus(
  query: string,
  standard: StandardDefinition,
  facet: A2UIStandardsFacet
): string {
  const quoted = query.match(/["“'‘]([^"”'’]{2,60})["”'’]/);
  if (quoted?.[1]) return quoted[1].trim();

  const layerNames = collectLayerNames(standard);
  const codeNames = (standard.codes ?? []).map(c => c.code).filter(Boolean);
  const linetypeNames = (standard.linetypes ?? []).map(l => l.name).filter(Boolean);
  const symbolNames = (standard.codes ?? []).map(c => symbolName(c.symbol)).filter(Boolean);

  const ordered =
    facet === 'layers'
      ? [...layerNames, ...codeNames, ...linetypeNames]
      : facet === 'linetypes'
        ? [...linetypeNames, ...layerNames, ...codeNames]
        : facet === 'symbols'
          ? [...symbolNames, ...codeNames, ...layerNames]
          : [...codeNames, ...layerNames, ...linetypeNames, ...symbolNames];

  const candidates = [...new Set(ordered.map(value => value.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length
  );
  for (const candidate of candidates) {
    if (candidate.length < 2) continue;
    const pattern = new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(candidate)}([^A-Za-z0-9]|$)`, 'i');
    if (pattern.test(query)) return candidate;
  }

  const explicit = query.match(
    /\b(?:layer|code|linetype|line\s*type|symbol|description\s*key)\s+(?:named\s+|called\s+)?([A-Za-z0-9_*.$/-]{2,40})/i
  );
  if (explicit?.[1]) {
    const value = explicit[1].replace(/[.,;:!?]+$/, '');
    if (!/^(?:in|of|for|on|the|a|an|standard|standards|spreadsheet|sheet)$/i.test(value)) {
      return value;
    }
  }

  const cleaned = query
    .replace(/[?!.,;:]+/g, ' ')
    .replace(/\b(?:layer|layers|linetype|linetypes|line\s*type|codes?|symbols?|description\s*keys?)\b/gi, ' ')
    .replace(STOP_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned.split(' ').slice(0, 4).join(' ');
}

function includesQuery(values: Array<string | undefined>, query: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return values.some(value => (value ?? '').toLowerCase().includes(needle));
}

/**
 * Returns a resolution when the query is a read-only question about the loaded
 * CAD standard. Returns null for ordinary conversation or edit commands.
 */
export function resolveStandardsA2UIQuery(
  query: string,
  standard: StandardDefinition | null | undefined
): StandardsA2UIResolution | null {
  const trimmed = query.trim();
  if (!trimmed || !standard) return null;
  if (!FACET_WORD_RE.test(trimmed) || !INTENT_RE.test(trimmed)) return null;
  if (EDIT_COMMAND_RE.test(trimmed) && !/\b(show|list|display|view|what|which|find)\b/i.test(trimmed)) {
    return null;
  }

  const lower = trimmed.toLowerCase();
  const facet: A2UIStandardsFacet = /\blayers?\b/.test(lower)
    ? 'layers'
    : /\b(linetypes?|line\s*types?)\b/.test(lower)
      ? 'linetypes'
      : /\bsymbols?\b/.test(lower)
        ? 'symbols'
        : /\b(codes?|description\s*keys?)\b/.test(lower)
          ? 'codes'
          : 'all';

  const focus = extractFocus(trimmed, standard, facet);
  const filter: A2UIStandardsFilter = {
    ...(focus ? { query: focus } : {}),
    facet,
  };

  const codes = standard.codes ?? [];
  const layers = collectLayerNames(standard);
  const linetypes = standard.linetypes ?? [];
  let matched = 0;

  if (facet === 'layers') {
    matched = layers.filter(name =>
      includesQuery(
        [name, standard.layers?.find(l => l.name === name)?.description],
        focus
      )
    ).length;
  } else if (facet === 'linetypes') {
    matched = linetypes.filter(lt => includesQuery([lt.name, lt.description], focus)).length;
  } else if (facet === 'symbols') {
    matched = codes.filter(code =>
      includesQuery([code.code, code.description, symbolName(code.symbol)], focus)
    ).length;
  } else if (facet === 'codes' || facet === 'all') {
    matched = codes.filter(code =>
      includesQuery(
        [
          code.code,
          code.description,
          code.pointLayer,
          code.lineLayer,
          code.lineType,
          code.category,
          symbolName(code.symbol),
        ],
        focus
      )
    ).length;
  }

  const noun =
    facet === 'layers'
      ? 'layer'
      : facet === 'linetypes'
        ? 'linetype'
        : facet === 'symbols'
          ? 'symbol-mapped code'
          : 'description key';
  const focusLabel = focus ? ` matching “${focus}”` : '';

  const replyText =
    matched > 0
      ? `Found **${matched}** ${noun}${matched === 1 ? '' : 's'}${focusLabel} in **${standard.name}**. ` +
        'Here is the filtered standards sheet — open the full editor below if you want to change it.'
      : `No ${noun}s${focusLabel} in **${standard.name}**. ` +
        'Here is the compact sheet with the filter applied so you can adjust it, or open the full editor below.';

  return { filter, replyText };
}
