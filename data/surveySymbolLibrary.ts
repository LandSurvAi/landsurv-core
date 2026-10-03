/**
 * Survey Symbol Library
 * 
 * Pre-defined SVG symbols for common land surveying point types.
 * All symbols are centered on (12,12) in a 24x24 viewBox.
 * 
 * Categories:
 * - Control & Monuments: IPF, IRS, CM, CP, BM
 * - Property & Boundary: PC, PL, FP
 * - Utilities: MH, SMH, FH, WV, GV, CO, CI
 * - Infrastructure: LP, PP, UP, SGN
 * - Topographic: TREE, SPOT, EP, BC
 * - Structures: BLDG, BC, WL
 */

import { SymbolDefinition } from '../contexts/types/CadManager.types';

export interface LibrarySymbol {
  id: string;
  name: string;
  description: string;
  category: string;
  svgPath: string;
  fillPath?: string;
  viewBox: string;
  tags: string[];  // For search
}

/**
 * Standard Survey Symbol Library
 * Professional symbols following common surveying conventions
 */
export const SURVEY_SYMBOL_LIBRARY: LibrarySymbol[] = [
  // ============ CONTROL & MONUMENTS ============
  {
    id: 'ipf',
    name: 'Iron Pipe Found',
    description: 'Circle with center dot - found iron pipe monument',
    category: 'Control & Monuments',
    svgPath: 'M 21 12 A 9 9 0 1 0 3 12 A 9 9 0 1 0 21 12 Z',
    fillPath: 'M 14 12 A 2 2 0 1 0 10 12 A 2 2 0 1 0 14 12 Z',
    viewBox: '0 0 24 24',
    tags: ['iron', 'pipe', 'found', 'monument', 'boundary', 'ipf'],
  },
  {
    id: 'irs',
    name: 'Iron Rod Set',
    description: 'Circle with X - set iron rod monument',
    category: 'Control & Monuments',
    svgPath: 'M 21 12 A 9 9 0 1 0 3 12 A 9 9 0 1 0 21 12 Z M 6 6 L 18 18 M 18 6 L 6 18',
    viewBox: '0 0 24 24',
    tags: ['iron', 'rod', 'set', 'monument', 'boundary', 'irs'],
  },
  {
    id: 'rebar',
    name: 'Rebar',
    description: 'Filled circle - rebar monument',
    category: 'Control & Monuments',
    svgPath: 'M 20 12 A 8 8 0 1 0 4 12 A 8 8 0 1 0 20 12 Z',
    fillPath: 'M 20 12 A 8 8 0 1 0 4 12 A 8 8 0 1 0 20 12 Z',
    viewBox: '0 0 24 24',
    tags: ['rebar', 'found', 'monument', 'rbcf', 'rbc'],
  },
  {
    id: 'concrete',
    name: 'Concrete Monument',
    description: 'Square - concrete monument',
    category: 'Control & Monuments',
    svgPath: 'M 5 5 H 19 V 19 H 5 Z',
    viewBox: '0 0 24 24',
    tags: ['concrete', 'monument', 'cm', 'conc'],
  },
  {
    id: 'control',
    name: 'Control Point',
    description: 'Triangle with dot - survey control point',
    category: 'Control & Monuments',
    svgPath: 'M 12 3 L 21 20 L 3 20 Z',
    fillPath: 'M 13.5 14 A 1.5 1.5 0 1 0 10.5 14 A 1.5 1.5 0 1 0 13.5 14 Z',
    viewBox: '0 0 24 24',
    tags: ['control', 'point', 'cp', 'benchmark', 'bm', 'triangulation'],
  },
  {
    id: 'benchmark',
    name: 'Benchmark',
    description: 'Triangle pointing up - benchmark/control',
    category: 'Control & Monuments',
    svgPath: 'M 12 2 L 22 22 L 2 22 Z',
    viewBox: '0 0 24 24',
    tags: ['benchmark', 'bm', 'control', 'elevation'],
  },
  {
    id: 'mag-nail',
    name: 'Mag Nail',
    description: 'Diamond with dot - magnetic nail',
    category: 'Control & Monuments',
    svgPath: 'M 12 3 L 21 12 L 12 21 L 3 12 Z',
    fillPath: 'M 13.5 12 A 1.5 1.5 0 1 0 10.5 12 A 1.5 1.5 0 1 0 13.5 12 Z',
    viewBox: '0 0 24 24',
    tags: ['mag', 'nail', 'pk', 'nail', 'set'],
  },

  // ============ PROPERTY & BOUNDARY ============
  {
    id: 'property-corner',
    name: 'Property Corner',
    description: 'Square with diagonal X - property corner',
    category: 'Property & Boundary',
    svgPath: 'M 5 5 H 19 V 19 H 5 Z M 5 5 L 19 19 M 19 5 L 5 19',
    viewBox: '0 0 24 24',
    tags: ['property', 'corner', 'pc', 'pl', 'lot'],
  },
  {
    id: 'fence-post',
    name: 'Fence Post',
    description: 'Small square - fence post',
    category: 'Property & Boundary',
    svgPath: 'M 8 8 H 16 V 16 H 8 Z',
    viewBox: '0 0 24 24',
    tags: ['fence', 'post', 'fp', 'fnc'],
  },
  {
    id: 'right-of-way',
    name: 'Right of Way',
    description: 'Diamond - ROW marker',
    category: 'Property & Boundary',
    svgPath: 'M 12 4 L 20 12 L 12 20 L 4 12 Z',
    viewBox: '0 0 24 24',
    tags: ['row', 'right', 'way', 'easement'],
  },

  // ============ UTILITIES - STORM ============
  {
    id: 'manhole',
    name: 'Manhole',
    description: 'Circle with cross - manhole/catch basin',
    category: 'Utilities - Storm',
    svgPath: 'M 21 12 A 9 9 0 1 0 3 12 A 9 9 0 1 0 21 12 Z M 12 5 V 19 M 5 12 H 19',
    viewBox: '0 0 24 24',
    tags: ['manhole', 'mh', 'smh', 'storm', 'sewer', 'catch', 'basin', 'cb'],
  },
  {
    id: 'curb-inlet',
    name: 'Curb Inlet',
    description: 'Rectangle with opening - curb inlet',
    category: 'Utilities - Storm',
    svgPath: 'M 4 8 H 20 V 16 H 4 Z M 8 16 V 20 M 16 16 V 20',
    viewBox: '0 0 24 24',
    tags: ['curb', 'inlet', 'ci', 'drain', 'storm'],
  },
  {
    id: 'cleanout',
    name: 'Cleanout',
    description: 'Circle with CO - cleanout',
    category: 'Utilities - Storm',
    svgPath: 'M 20 12 A 8 8 0 1 0 4 12 A 8 8 0 1 0 20 12 Z',
    fillPath: 'M 8 9 Q 8 7 10 7 L 11 7 Q 12 7 12 8 V 10 Q 12 11 11 11 H 10 V 13 Q 10 15 8 15 Q 6 15 6 13 V 12 H 8 V 13 Q 8 14 9 14 Q 10 14 10 13 V 11 Q 10 10 9 10 H 8 V 9 Z M 14 7 Q 16 7 18 9 V 10 H 16 V 9 Q 15 8 14 8 Q 13 8 13 10 V 14 Q 13 16 14 16 Q 15 16 16 15 V 14 H 18 V 15 Q 16 17 14 17 Q 12 17 11 15 V 9 Q 12 7 14 7 Z',
    viewBox: '0 0 24 24',
    tags: ['cleanout', 'co', 'sewer', 'access'],
  },

  // ============ UTILITIES - WATER ============
  {
    id: 'fire-hydrant',
    name: 'Fire Hydrant',
    description: 'Pentagon shape - fire hydrant',
    category: 'Utilities - Water',
    svgPath: 'M 12 3 L 20 9 L 17 21 H 7 L 4 9 Z',
    viewBox: '0 0 24 24',
    tags: ['fire', 'hydrant', 'fh', 'water'],
  },
  {
    id: 'water-valve',
    name: 'Water Valve',
    description: 'Circle with W - water valve',
    category: 'Utilities - Water',
    svgPath: 'M 20 12 A 8 8 0 1 0 4 12 A 8 8 0 1 0 20 12 Z',
    fillPath: 'M 6 8 L 8 16 L 10 10 L 12 16 L 14 10 L 16 16 L 18 8',
    viewBox: '0 0 24 24',
    tags: ['water', 'valve', 'wv', 'shutoff'],
  },
  {
    id: 'water-meter',
    name: 'Water Meter',
    description: 'Circle with M - water meter',
    category: 'Utilities - Water',
    svgPath: 'M 20 12 A 8 8 0 1 0 4 12 A 8 8 0 1 0 20 12 Z',
    fillPath: 'M 6 16 V 8 L 10 14 L 14 8 L 18 14 V 16',
    viewBox: '0 0 24 24',
    tags: ['water', 'meter', 'wm'],
  },

  // ============ UTILITIES - GAS ============
  {
    id: 'gas-valve',
    name: 'Gas Valve',
    description: 'Circle with G - gas valve',
    category: 'Utilities - Gas',
    svgPath: 'M 20 12 A 8 8 0 1 0 4 12 A 8 8 0 1 0 20 12 Z',
    fillPath: 'M 15 9 Q 17 9 17 11 V 12 H 15 V 11 Q 15 10 14 10 H 12 V 14 H 14 Q 15 14 15 13 H 17 Q 17 16 14 16 H 10 Q 8 16 8 14 V 10 Q 8 8 10 8 H 14 Q 15 8 15 9 Z',
    viewBox: '0 0 24 24',
    tags: ['gas', 'valve', 'gv'],
  },
  {
    id: 'gas-meter',
    name: 'Gas Meter',
    description: 'Square with G - gas meter',
    category: 'Utilities - Gas',
    svgPath: 'M 5 5 H 19 V 19 H 5 Z',
    fillPath: 'M 14 9 Q 16 9 16 11 V 12 H 14 V 11 Q 14 10 13 10 H 11 V 14 H 13 Q 14 14 14 13 H 16 Q 16 16 13 16 H 10 Q 8 16 8 14 V 10 Q 8 8 10 8 H 13 Q 14 8 14 9 Z',
    viewBox: '0 0 24 24',
    tags: ['gas', 'meter', 'gm'],
  },

  // ============ UTILITIES - ELECTRIC ============
  {
    id: 'power-pole',
    name: 'Power Pole',
    description: 'Circle with crossbar - power/utility pole',
    category: 'Utilities - Electric',
    svgPath: 'M 18 12 A 6 6 0 1 0 6 12 A 6 6 0 1 0 18 12 Z M 3 12 H 21',
    viewBox: '0 0 24 24',
    tags: ['power', 'pole', 'pp', 'up', 'utility', 'electric'],
  },
  {
    id: 'light-pole',
    name: 'Light Pole',
    description: 'Circle with small dot - light pole',
    category: 'Utilities - Electric',
    svgPath: 'M 20 12 A 8 8 0 1 0 4 12 A 8 8 0 1 0 20 12 Z',
    fillPath: 'M 14 12 A 2 2 0 1 0 10 12 A 2 2 0 1 0 14 12 Z',
    viewBox: '0 0 24 24',
    tags: ['light', 'pole', 'lp', 'street', 'lamp'],
  },
  {
    id: 'electric-box',
    name: 'Electric Box/Transformer',
    description: 'Square with E - electric transformer/box',
    category: 'Utilities - Electric',
    svgPath: 'M 5 5 H 19 V 19 H 5 Z',
    fillPath: 'M 9 8 H 15 V 10 H 11 V 11 H 14 V 13 H 11 V 14 H 15 V 16 H 9 V 8 Z',
    viewBox: '0 0 24 24',
    tags: ['electric', 'transformer', 'box', 'elec', 'pad'],
  },

  // ============ UTILITIES - TELECOM ============
  {
    id: 'telecom-ped',
    name: 'Telecom Pedestal',
    description: 'Circle with T - telephone/communications pedestal',
    category: 'Utilities - Telecom',
    svgPath: 'M 20 12 A 8 8 0 1 0 4 12 A 8 8 0 1 0 20 12 Z',
    fillPath: 'M 8 8 H 16 V 10 H 13 V 16 H 11 V 10 H 8 V 8 Z',
    viewBox: '0 0 24 24',
    tags: ['telecom', 'telephone', 'tel', 'communications', 'ped', 'pedestal'],
  },

  // ============ TOPOGRAPHIC ============
  {
    id: 'tree-deciduous',
    name: 'Tree (Deciduous)',
    description: 'Circle with radiating lines - deciduous tree',
    category: 'Topographic',
    svgPath: 'M 19 12 A 7 7 0 1 0 5 12 A 7 7 0 1 0 19 12 Z M 12 5 V 2 M 12 19 V 22 M 5 12 H 2 M 19 12 H 22 M 7 7 L 5 5 M 17 7 L 19 5 M 7 17 L 5 19 M 17 17 L 19 19',
    viewBox: '0 0 24 24',
    tags: ['tree', 'deciduous', 'oak', 'maple', 'vegetation'],
  },
  {
    id: 'tree-conifer',
    name: 'Tree (Conifer)',
    description: 'Triangle - coniferous/evergreen tree',
    category: 'Topographic',
    svgPath: 'M 12 2 L 20 20 H 4 Z M 12 20 V 22',
    viewBox: '0 0 24 24',
    tags: ['tree', 'conifer', 'evergreen', 'pine', 'spruce'],
  },
  {
    id: 'spot-elevation',
    name: 'Spot Elevation',
    description: 'X mark - spot elevation',
    category: 'Topographic',
    svgPath: 'M 5 5 L 19 19 M 19 5 L 5 19',
    viewBox: '0 0 24 24',
    tags: ['spot', 'elevation', 'x', 'topo', 'grade'],
  },
  {
    id: 'edge-pavement',
    name: 'Edge of Pavement',
    description: 'Plus sign - edge of pavement marker',
    category: 'Topographic',
    svgPath: 'M 12 4 V 20 M 4 12 H 20',
    viewBox: '0 0 24 24',
    tags: ['edge', 'pavement', 'ep', 'road', 'asphalt'],
  },
  {
    id: 'contour-point',
    name: 'Contour/Topo Shot',
    description: 'Small dot - general topo shot',
    category: 'Topographic',
    svgPath: 'M 15 12 A 3 3 0 1 0 9 12 A 3 3 0 1 0 15 12 Z',
    fillPath: 'M 15 12 A 3 3 0 1 0 9 12 A 3 3 0 1 0 15 12 Z',
    viewBox: '0 0 24 24',
    tags: ['contour', 'topo', 'shot', 'point', 'ground'],
  },

  // ============ STRUCTURES ============
  {
    id: 'building-corner',
    name: 'Building Corner',
    description: 'L-shape - building corner',
    category: 'Structures',
    svgPath: 'M 4 4 H 12 V 12 H 20 V 20 H 4 V 4 Z',
    viewBox: '0 0 24 24',
    tags: ['building', 'corner', 'bldg', 'bc', 'structure'],
  },
  {
    id: 'well',
    name: 'Well',
    description: 'Concentric circles - well',
    category: 'Structures',
    svgPath: 'M 20 12 A 8 8 0 1 0 4 12 A 8 8 0 1 0 20 12 Z M 17 12 A 5 5 0 1 0 7 12 A 5 5 0 1 0 17 12 Z M 14 12 A 2 2 0 1 0 10 12 A 2 2 0 1 0 14 12 Z',
    viewBox: '0 0 24 24',
    tags: ['well', 'water', 'wl', 'irrigation'],
  },
  {
    id: 'sign',
    name: 'Sign',
    description: 'Rectangle on post - sign',
    category: 'Structures',
    svgPath: 'M 6 4 H 18 V 12 H 6 Z M 12 12 V 20',
    viewBox: '0 0 24 24',
    tags: ['sign', 'sgn', 'post', 'traffic'],
  },
  {
    id: 'bollard',
    name: 'Bollard',
    description: 'Small filled square - bollard/post',
    category: 'Structures',
    svgPath: 'M 8 8 H 16 V 16 H 8 Z',
    fillPath: 'M 8 8 H 16 V 16 H 8 Z',
    viewBox: '0 0 24 24',
    tags: ['bollard', 'post', 'barrier'],
  },
];

/**
 * Get all unique categories from the library
 */
export const getSymbolCategories = (): string[] => {
  const categories = new Set(SURVEY_SYMBOL_LIBRARY.map(s => s.category));
  return Array.from(categories).sort();
};

/**
 * Search symbols by query (searches name, description, and tags)
 */
export const searchSymbols = (query: string): LibrarySymbol[] => {
  const q = query.toLowerCase().trim();
  if (!q) return SURVEY_SYMBOL_LIBRARY;
  
  return SURVEY_SYMBOL_LIBRARY.filter(symbol => 
    symbol.name.toLowerCase().includes(q) ||
    symbol.description.toLowerCase().includes(q) ||
    symbol.tags.some(tag => tag.includes(q)) ||
    symbol.id.includes(q)
  );
};

/**
 * Get symbols by category
 */
export const getSymbolsByCategory = (category: string): LibrarySymbol[] => {
  if (category === 'all') return SURVEY_SYMBOL_LIBRARY;
  return SURVEY_SYMBOL_LIBRARY.filter(s => s.category === category);
};

/**
 * Convert LibrarySymbol to SymbolDefinition
 */
export const libraryToSymbolDefinition = (
  libSymbol: LibrarySymbol,
  codeName?: string
): SymbolDefinition => ({
  name: codeName || libSymbol.name,
  svgPath: libSymbol.svgPath,
  fillPath: libSymbol.fillPath,
  viewBox: libSymbol.viewBox,
  source: 'library',
  createdAt: new Date().toISOString(),
  description: libSymbol.description,
});

/**
 * Find best matching library symbol for a code
 */
export const findMatchingSymbol = (
  code: string,
  description?: string
): LibrarySymbol | null => {
  const searchTerms = [code, description].filter(Boolean).join(' ').toLowerCase();
  
  // Score each symbol
  let bestMatch: LibrarySymbol | null = null;
  let bestScore = 0;
  
  for (const symbol of SURVEY_SYMBOL_LIBRARY) {
    let score = 0;
    
    // Exact ID match
    if (symbol.id === code.toLowerCase()) score += 100;
    
    // Tag matches
    for (const tag of symbol.tags) {
      if (searchTerms.includes(tag)) score += 10;
      if (code.toLowerCase().includes(tag)) score += 20;
    }
    
    // Name/description match
    if (symbol.name.toLowerCase().includes(code.toLowerCase())) score += 15;
    if (description && symbol.description.toLowerCase().includes(description.toLowerCase())) score += 5;
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = symbol;
    }
  }
  
  return bestScore >= 10 ? bestMatch : null;
};

// Ultra-generic tags that must never, on their own, select a symbol group.
// Without this, "draw all points" or "show set monuments" would sweep in
// unrelated symbols. These only participate in matching when paired with a
// more specific word (via the intersection pass below).
const GENERIC_TAGS = new Set([
  'point', 'set', 'found', 'topo', 'grade', 'ground', 'access',
  'pad', 'box', 'shutoff', 'utility', 'traffic', 'monument',
]);

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'all', 'every', 'each', 'any', 'some', 'these', 'those',
  'my', 'our', 'please', 'symbol', 'symbols', 'point', 'points', 'marker',
  'markers', 'glyph', 'glyphs', 'on', 'off', 'and', 'or', 'of', 'for', 'to',
]);

/** Strip a trailing plural so "trees" → "tree", "manholes" → "manhole". */
const singularize = (w: string): string => {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s')) return w.slice(0, -1);
  return w;
};

/** Does a single (already-singularized) word match this library symbol? */
const wordMatchesSymbol = (word: string, symbol: LibrarySymbol): boolean => {
  if (symbol.id === word || symbol.id.includes(word)) return true;
  if (symbol.tags.some(t => t === word || singularize(t) === word)) return true;
  if (symbol.name.toLowerCase().includes(word)) return true;
  return false;
};

/**
 * Resolve a natural-language noun phrase (e.g. "trees", "sanitary manholes",
 * "water valves") to every library symbol the user plausibly meant.
 *
 * Unlike findMatchingSymbol (single best), this returns the whole group so
 * "trees" enables BOTH deciduous and conifer. Strategy: match each content
 * word to a set of symbols, then intersect the per-word sets (so "water
 * valve" → just the water valve, not every water/valve symbol). If the
 * intersection is empty (e.g. a qualifier like "sanitary" matched nothing),
 * fall back to the union of whatever words did match.
 */
export const findMatchingSymbols = (query: string): LibrarySymbol[] => {
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 1 && !STOP_WORDS.has(w))
    .map(singularize);

  if (words.length === 0) return [];

  const perWordMatches: LibrarySymbol[][] = [];
  const specificWordMatches: LibrarySymbol[][] = [];

  for (const word of words) {
    const matches = SURVEY_SYMBOL_LIBRARY.filter(s => wordMatchesSymbol(word, s));
    if (matches.length === 0) continue;
    perWordMatches.push(matches);
    // A word is "specific" if it isn't a purely generic tag word. Generic
    // words still help narrow an intersection but can't stand alone.
    if (!GENERIC_TAGS.has(word)) specificWordMatches.push(matches);
  }

  const effective = specificWordMatches.length > 0 ? specificWordMatches : perWordMatches;
  if (effective.length === 0) return [];

  // Intersection across all matched words.
  const idCounts = new Map<string, number>();
  for (const set of effective) {
    const seen = new Set<string>();
    for (const s of set) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      idCounts.set(s.id, (idCounts.get(s.id) ?? 0) + 1);
    }
  }
  const intersectionIds = new Set(
    [...idCounts.entries()].filter(([, c]) => c === effective.length).map(([id]) => id)
  );

  const chosenIds = intersectionIds.size > 0
    ? intersectionIds
    : new Set(idCounts.keys()); // union fallback

  return SURVEY_SYMBOL_LIBRARY.filter(s => chosenIds.has(s.id));
};
