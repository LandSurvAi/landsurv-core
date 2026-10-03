/**
 * Deterministic symbol-visibility command parser.
 *
 * WHY THIS EXISTS (and why it is NOT an LLM prompt): earlier, symbol rendering
 * was made to depend on the Civil Drafter agent "signalling" intent. The agent
 * happily claimed in prose that it had drawn symbols without ever invoking any
 * skill, so nothing rendered. To avoid repeating that silent-failure mode, user
 * intent to show/hide a symbol group is detected here with a plain, testable
 * keyword matcher that runs on the raw chat text — no model in the loop.
 *
 * It recognises command-shaped phrases only (a verb + a noun), so incidental
 * mentions like "there is a tree near the corner" do NOT toggle anything.
 *
 * Examples:
 *   "draw tree symbols"            -> { action: 'enable',  ids: ['tree-deciduous','tree-conifer'] }
 *   "show all sanitary manholes"   -> { action: 'enable',  ids: ['manhole'] }
 *   "hide the fire hydrants"       -> { action: 'disable', ids: ['fire-hydrant'] }
 *   "turn off all symbols"         -> { action: 'disable', ids: 'all' }
 *   "show every symbol"            -> { action: 'enable',  ids: 'all' }
 */

import { findMatchingSymbols } from '../data/surveySymbolLibrary';

export interface SymbolVisibilityCommand {
  action: 'enable' | 'disable';
  /** Resolved library symbol ids, or 'all' for the global toggle. */
  ids: string[] | 'all';
  /** The noun phrase that was matched, for user-facing feedback. */
  phrase: string;
}

// Order matters: check "turn off" before "turn on" would misfire, so we anchor
// each verb precisely. Disable verbs are checked first because "turn off" and
// "turn on" share the "turn" stem.
const DISABLE_VERBS = [
  'hide', 'remove', 'turn off', 'turn\\s+off', 'disable', 'clear',
  'take off', 'take\\s+off', 'get rid of', 'stop showing', 'do not show',
  "don't show",
];
const ENABLE_VERBS = [
  'draw', 'show', 'display', 'plot', 'place', 'render', 'turn on',
  'turn\\s+on', 'enable', 'add', 'put', 'give me', 'i want', 'i need',
];

const GLOBAL_PHRASE = /\b(all|every|everything|all of the|every single)\b\s*(symbol|symbols|point symbol|point symbols|glyph|glyphs)?/i;

// Library ids whose keywords collide with common LINEWORK requests
// ("draw the road edges", "plot building footprints", "draw property lines",
// "draw the fence"). For these, we only treat the message as a symbol toggle
// when the user is explicit with a "symbol(s)/marker(s)/glyph(s)" keyword —
// otherwise the request is almost certainly about drawing geometry, not
// flipping a point marker. Inherently point-only features (tree, manhole,
// hydrant, valve, sign, …) are safe to toggle from a bare "draw X".
const LINEWORK_AMBIGUOUS_IDS = new Set([
  'edge-pavement', 'right-of-way', 'building-corner', 'fence-post',
  'property-corner', 'contour-point',
]);

const SYMBOL_KEYWORD_RE = /\b(symbol|symbols|marker|markers|glyph|glyphs)\b/i;

const buildVerbRegex = (verbs: string[]): RegExp =>
  new RegExp(`\\b(?:${verbs.join('|')})\\b`, 'i');

const DISABLE_RE = buildVerbRegex(DISABLE_VERBS);
const ENABLE_RE = buildVerbRegex(ENABLE_VERBS);

/** True when the phrase is a global "all symbols / everything" reference. */
const isGlobalReference = (phrase: string): boolean => {
  const p = phrase.toLowerCase().trim();
  if (/^(all|every|everything)\b/.test(p)) {
    // Only treat as global when there's no specific noun after it (e.g.
    // "all symbols", "everything", "all of them") — "all sanitary manholes"
    // is NOT global, it's a manhole request.
    const rest = p
      .replace(/^(all of the|all of them|all|every single|every|everything)\b/, '')
      .replace(/\b(symbol|symbols|point|points|glyph|glyphs|them|it|these|those)\b/g, '')
      .trim();
    return rest.length === 0;
  }
  return false;
};

/**
 * Parse a raw chat message into a symbol-visibility command, or null if the
 * message is not a symbol show/hide command.
 */
export const parseSymbolCommand = (raw: string): SymbolVisibilityCommand | null => {
  if (!raw || raw.trim().length === 0) return null;
  const text = raw.trim();

  // Determine action + where the verb ends (noun phrase is what follows).
  const disableMatch = DISABLE_RE.exec(text);
  const enableMatch = ENABLE_RE.exec(text);

  let action: 'enable' | 'disable';
  let verbEnd: number;

  if (disableMatch && (!enableMatch || disableMatch.index <= enableMatch.index)) {
    action = 'disable';
    verbEnd = disableMatch.index + disableMatch[0].length;
  } else if (enableMatch) {
    action = 'enable';
    verbEnd = enableMatch.index + enableMatch[0].length;
  } else {
    return null; // No command verb → not a symbol command.
  }

  const phrase = text.slice(verbEnd).trim();
  if (!phrase) return null;

  // Global toggle: "show all symbols", "hide everything".
  if (GLOBAL_PHRASE.test(phrase) && isGlobalReference(phrase)) {
    return { action, ids: 'all', phrase: 'all symbols' };
  }

  const matches = findMatchingSymbols(phrase);
  if (matches.length === 0) return null;

  // Guard against linework false positives: if every matched symbol is one
  // that collides with a geometry request, only proceed when the user was
  // explicit that they mean symbols/markers.
  if (!SYMBOL_KEYWORD_RE.test(text)) {
    const allAmbiguous = matches.every(m => LINEWORK_AMBIGUOUS_IDS.has(m.id));
    if (allAmbiguous) return null;
  }

  return {
    action,
    ids: matches.map(m => m.id),
    phrase: matches.map(m => m.name).join(', '),
  };
};
