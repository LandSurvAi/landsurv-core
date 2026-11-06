/**
 * CAD Standards → A2UI query resolver.
 *
 * Turns natural questions about a loaded standard ("show the pavement layer",
 * "what linetypes are available?", "open the standards spreadsheet") into a
 * compact A2UI sheet with a pre-applied facet and search query. This keeps the
 * answer focused instead of dropping the entire standards spreadsheet into chat.
 *
 * Matching is intentionally smarter than a raw substring check. A query is
 * searched literally first, then by token / abbreviation / close spelling, then
 * by related discipline (for example "utilities" also finds water, sewer,
 * storm, gas, electric, and communications entries).
 */

import type { StandardDefinition } from '../contexts/types/CadManager.types.ts';
import type { A2UIStandardsFacet, A2UIStandardsFilter } from '../types.ts';
import { ALL_BUILT_IN_HATCHES } from './hatchLibrary.ts';

export interface StandardsA2UIResolution {
  filter: A2UIStandardsFilter;
  replyText: string;
}

interface StandardsSearchConcept {
  label: string;
  summary: string;
  terms: readonly string[];
}

const FACET_WORD_RE =
  /\b(layers?|linetypes?|line\s*types?|hatches?|hatch\s*patterns?|description\s*keys?|codes?|symbols?|standards?|spreadsheet|sheet)\b/i;

const INTENT_RE =
  /\b(show|list|display|view|open|what|which|where|find|lookup|look up|explain|tell\s+me|search|filter|sheet|spreadsheet)\b|\?/i;

const EDIT_COMMAND_RE = /^\s*(add|create|delete|remove|edit|rename|change|update|set)\b/i;

const STOP_WORDS =
  /\b(show|list|display|view|open|what|which|where|find|lookup|look\s+up|explain|tell|me|the|a|an|is|are|for|about|in|of|from|please|my|our|their|his|her|its|these|those|cad|standard|standards|spreadsheet|sheet|all|any|do|we|have|has|available|exist|exists|defined|entries|rows)\b/gi;

/** Generic words that add no signal once a query is broken into tokens. */
const SEARCH_STOP_WORDS = new Set([
  'a', 'an', 'the', 'my', 'our', 'their', 'his', 'her', 'its', 'this', 'that',
  'these', 'those', 'show', 'list', 'display', 'view', 'open', 'what', 'which',
  'where', 'find', 'lookup', 'search', 'filter', 'explain', 'tell', 'me', 'is',
  'are', 'for', 'about', 'in', 'of', 'on', 'from', 'to', 'with', 'please', 'cad',
  'standard', 'standards', 'spreadsheet', 'sheet', 'all', 'any', 'do', 'we',
  'have', 'has', 'available', 'exist', 'exists', 'defined', 'entries', 'rows',
  'layer', 'layers', 'linetype', 'linetypes', 'line', 'types', 'type', 'code',
  'codes', 'symbol', 'symbols', 'hatch', 'hatches', 'pattern', 'patterns', 'description', 'key', 'keys',
]);

/**
 * Discipline bridges used when the user asks for a category rather than an
 * exact name. Keep these survey/CAD-specific; broad English synonyms produce
 * noisy matches in a standards table.
 */
const SEARCH_CONCEPTS: readonly StandardsSearchConcept[] = [
  {
    label: 'utility',
    summary: 'utility work such as water, sewer, storm, gas, electric, and communications',
    terms: [
      'utility', 'utilities', 'util', 'utl', 'water', 'sewer', 'sanitary', 'storm',
      'stormwater', 'drain', 'drainage', 'gas', 'electric', 'electrical', 'power',
      'telecom', 'telecommunications', 'communication', 'communications', 'fiber',
      'conduit', 'duct', 'hydrant', 'valve', 'manhole', 'inlet', 'culvert',
      'streetlight', 'streetlights', 'pole', 'poles', 'cable',
    ],
  },
  {
    label: 'pavement/roadway',
    summary: 'pavement and roadway features such as asphalt, curb, gutter, sidewalk, and pavement edge',
    terms: [
      'pavement', 'asphalt', 'concrete', 'road', 'roads', 'roadway', 'street',
      'streets', 'curb', 'gutter', 'sidewalk', 'driveway', 'shoulder', 'edge',
    ],
  },
  {
    label: 'sanitary sewer',
    summary: 'sanitary sewer and wastewater infrastructure',
    terms: ['sewer', 'sanitary', 'wastewater', 'sewage', 'wwtp', 'lift'],
  },
  {
    label: 'storm drainage',
    summary: 'storm drainage and flood-control infrastructure',
    terms: ['storm', 'stormwater', 'drainage', 'drain', 'inlet', 'culvert', 'detention', 'retention', 'flood'],
  },
  {
    label: 'water/environmental',
    summary: 'water and environmental features such as streams, wetlands, and floodplains',
    terms: ['water', 'hydro', 'stream', 'creek', 'river', 'pond', 'lake', 'wetland', 'wetlands', 'floodplain', 'environmental', 'env'],
  },
  {
    label: 'property boundary',
    summary: 'property boundary and ownership features such as parcels, lots, deeds, easements, and rights-of-way',
    terms: ['boundary', 'property', 'parcel', 'lot', 'deed', 'easement', 'right', 'way', 'row', 'setback', 'ownership', 'monument'],
  },
  {
    label: 'survey control',
    summary: 'survey control and point features such as monuments, benchmarks, and coordinates',
    terms: ['survey', 'control', 'monument', 'benchmark', 'point', 'points', 'coordinate', 'coordinates', 'cogo', 'traverse'],
  },
  {
    label: 'vegetation',
    summary: 'vegetation and landscaping features such as trees, shrubs, and planting',
    terms: ['vegetation', 'tree', 'trees', 'shrub', 'shrubs', 'landscape', 'landscaping', 'planting', 'grass'],
  },
  {
    label: 'grading/terrain',
    summary: 'grading and terrain features such as contours, elevations, slopes, and surfaces',
    terms: ['grading', 'grade', 'contour', 'contours', 'elevation', 'elevations', 'spot', 'slope', 'terrain', 'surface', 'tin'],
  },
  {
    label: 'building/structure',
    summary: 'buildings and structures such as footprints, walls, and columns',
    terms: ['building', 'buildings', 'structure', 'structures', 'footprint', 'wall', 'walls', 'column', 'columns', 'roof'],
  },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokenizeSearchText(value: string): string[] {
  const normalized = normalizeSearchText(value);
  return normalized ? normalized.split(' ') : [];
}

function significantSearchTokens(query: string): string[] {
  return tokenizeSearchText(query).filter(token => token.length >= 2 && !SEARCH_STOP_WORDS.has(token));
}

function boundedLevenshtein(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return -1;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      current[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return -1;
    previous = current;
  }
  return previous[b.length] <= max ? previous[b.length] : -1;
}

function tokenMatchScore(fieldToken: string, queryToken: string): number {
  if (!fieldToken || !queryToken) return 0;
  if (fieldToken === queryToken) return 16;

  // Prefix/abbreviation matches ("util" ↔ "utilities", "storm" ↔ "stormwater").
  if (queryToken.length >= 3 && fieldToken.startsWith(queryToken)) return 10;
  if (queryToken.length >= 4 && fieldToken.length >= 3 && queryToken.startsWith(fieldToken)) return 8;

  // Embedded matches ("water" in "wastewater").
  if (queryToken.length >= 3 && fieldToken.includes(queryToken)) return 7;
  if (queryToken.length >= 4 && fieldToken.length >= 3 && queryToken.includes(fieldToken)) return 5;

  // Close spellings. Only for longer words so two-letter codes stay exact.
  if (queryToken.length >= 4) {
    const maxDistance = queryToken.length >= 7 ? 2 : 1;
    const distance = boundedLevenshtein(fieldToken, queryToken, maxDistance);
    if (distance >= 0) return 6 - distance;
  }
  return 0;
}

function matchedConcepts(tokens: string[]): StandardsSearchConcept[] {
  const matched = new Map<string, StandardsSearchConcept>();
  for (const token of tokens) {
    for (const concept of SEARCH_CONCEPTS) {
      const hit = concept.terms.some(term => {
        if (term === token) return true;
        if (token.length < 4 || term.length < 4) return false;
        return boundedLevenshtein(term, token, 1) >= 0;
      });
      if (hit) matched.set(concept.label, concept);
    }
  }
  return [...matched.values()];
}

/**
 * Score one standards row against a query. Exported so the A2UI table and the
 * chat answer use exactly the same search semantics.
 */
export function scoreStandardsMatch(
  values: Array<string | number | undefined | null>,
  query: string
): number {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 1;

  const searchableValues = values
    .map(value => String(value ?? '').trim())
    .filter(Boolean);
  if (searchableValues.length === 0) return 0;

  const normalizedValues = searchableValues.map(normalizeSearchText);
  const valueTokens = searchableValues.flatMap(tokenizeSearchText);
  const queryTokens = significantSearchTokens(normalizedQuery);
  const effectiveTokens = queryTokens.length > 0 ? queryTokens : [normalizedQuery];

  let score = normalizedValues.some(value => value.includes(normalizedQuery)) ? 40 : 0;

  for (const token of effectiveTokens) {
    let best = 0;
    for (const fieldToken of valueTokens) {
      best = Math.max(best, tokenMatchScore(fieldToken, token));
    }
    score += best;
  }

  // Related-discipline expansion. This is what turns "utilities" into water,
  // sewer, storm, gas, electric, and communications matches.
  const concepts = matchedConcepts(effectiveTokens);
  if (concepts.length > 0) {
    for (const token of effectiveTokens) {
      let best = 0;
      for (const concept of concepts) {
        for (const term of concept.terms) {
          if (term === token) continue;
          for (const fieldToken of valueTokens) {
            best = Math.max(best, tokenMatchScore(fieldToken, term));
          }
        }
      }
      score += best;
    }
  }

  // Last-resort fuzzy pass against whole values, for names that do not split
  // into useful tokens (codes, compact layer names, etc.).
  if (score === 0 && normalizedQuery.length >= 2) {
    for (const value of normalizedValues) {
      if (value.includes(normalizedQuery) || normalizedQuery.includes(value)) {
        score = Math.max(score, 5);
      }
      const maxDistance = normalizedQuery.length >= 7 ? 2 : 1;
      const distance = boundedLevenshtein(value, normalizedQuery, maxDistance);
      if (distance >= 0) score = Math.max(score, 4 - distance);
    }
  }

  return score;
}

function includesQuery(values: Array<string | undefined>, query: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return values.some(value => (value ?? '').toLowerCase().includes(needle));
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

function layerValues(name: string, standard: StandardDefinition): Array<string | undefined> {
  const layer = (standard.layers ?? []).find(
    candidate => normalizeSearchText(candidate.name) === normalizeSearchText(name)
  );
  return [name, layer?.description, layer?.lineType];
}

function codeValues(code: NonNullable<StandardDefinition['codes']>[number]): Array<string | undefined> {
  return [
    code.code,
    code.description,
    code.pointLayer,
    code.lineLayer,
    code.lineType,
    code.category,
    symbolName(code.symbol),
  ];
}

function extractFocus(
  query: string,
  standard: StandardDefinition,
  facet: A2UIStandardsFacet
): string {
  const quoted = query.match(/[\"“'‘]([^\"”'’]{2,60})[\"”'’]/);
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
    .replace(/\b(?:layer|layers|linetype|linetypes|line\s*type|hatches?|hatch\s*patterns?|patterns?|codes?|symbols?|description\s*keys?)\b/gi, ' ')
    .replace(STOP_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned.split(' ').slice(0, 4).join(' ');
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
  const facet: A2UIStandardsFacet = /\b(hatches?|hatch\s*patterns?)\b/.test(lower)
    ? 'hatches'
    : /\blayers?\b/.test(lower)
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
  const symbolCodes = codes.filter(code => symbolName(code.symbol));
  const hatches = [...ALL_BUILT_IN_HATCHES, ...(standard.hatches ?? [])];

  let matched = 0;
  let literalMatched = 0;

  if (facet === 'hatches') {
    matched = hatches.filter(h => scoreStandardsMatch([h.name, h.description, h.category, h.femaZone, h.usage], focus) > 0).length;
    literalMatched = hatches.filter(h => includesQuery([h.name, h.description, h.category, h.femaZone, h.usage], focus)).length;
  } else if (facet === 'layers') {
    matched = layers.filter(name => scoreStandardsMatch(layerValues(name, standard), focus) > 0).length;
    literalMatched = layers.filter(name => includesQuery(layerValues(name, standard), focus)).length;
  } else if (facet === 'linetypes') {
    matched = linetypes.filter(lt => scoreStandardsMatch([lt.name, lt.description], focus) > 0).length;
    literalMatched = linetypes.filter(lt => includesQuery([lt.name, lt.description], focus)).length;
  } else if (facet === 'symbols') {
    matched = symbolCodes.filter(code => scoreStandardsMatch(codeValues(code), focus) > 0).length;
    literalMatched = symbolCodes.filter(lt => includesQuery(codeValues(lt), focus)).length;
  } else if (facet === 'codes' || facet === 'all') {
    matched = codes.filter(code => scoreStandardsMatch(codeValues(code), focus) > 0).length;
    literalMatched = codes.filter(code => includesQuery(codeValues(code), focus)).length;
  }

  const noun =
    facet === 'hatches'
      ? 'hatch pattern'
      : facet === 'layers'
        ? 'layer'
        : facet === 'linetypes'
          ? 'linetype'
          : facet === 'symbols'
            ? 'symbol-mapped code'
            : 'description key';
  const total =
    facet === 'hatches'
      ? hatches.length
      : facet === 'layers'
        ? layers.length
        : facet === 'linetypes'
          ? linetypes.length
          : facet === 'symbols'
            ? symbolCodes.length
            : codes.length;
  const focusLabel = focus ? ` matching “${focus}”` : '';
  const concepts = matchedConcepts(significantSearchTokens(focus));
  const relatedSummary = [...new Set(concepts.map(concept => concept.summary))].slice(0, 2).join(' and ');
  const fuzzyLead =
    focus && matched > 0 && literalMatched === 0 && relatedSummary
      ? `I read “${focus}” as ${relatedSummary}, so I searched related entries too. `
      : '';

  let replyText: string;
  if (matched > 0) {
    replyText =
      `${fuzzyLead}Found **${matched}** ${noun}${matched === 1 ? '' : 's'}${focusLabel} in **${standard.name}**. ` +
      'Here is the filtered standards sheet — open the full editor below if you want to change it.';
  } else {
    const examples =
      facet === 'layers'
        ? layers.slice(0, 4)
        : facet === 'linetypes'
          ? linetypes.map(lt => lt.name).filter(Boolean).slice(0, 4)
          : facet === 'symbols'
            ? symbolCodes.map(code => code.code).filter(Boolean).slice(0, 4)
            : codes.map(code => code.code).filter(Boolean).slice(0, 4);
    const exampleHint = examples.length > 0
      ? ` Available ${noun} examples: ${examples.map(example => `“${example}”`).join(', ')}.`
      : '';
    replyText =
      `I searched **${standard.name}** for ${focus ? `“${focus}”` : 'that request'} across names, descriptions, and categories, ` +
      `including close spellings and related terms, but found no ${noun}s. ` +
      `Try a broader term, or open the full editor to scan all ${total} ${noun}s.${exampleHint}`;
  }

  return { filter, replyText };
}
