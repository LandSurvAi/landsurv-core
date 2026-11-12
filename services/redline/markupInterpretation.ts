/**
 * Redline Agent — reviewer shorthand and intent classification.
 *
 * Reviewers write terse markup. This module expands known survey/CAD
 * abbreviations, decides what kind of change the mark is asking for, and
 * separates drafting instructions from comments that belong to a person.
 * It is deterministic and pure so the worklist is reproducible.
 */

import type {
  RedlineChangeKind,
  RedlineMarkupKind,
  RedlineRisk,
} from '../../types';

export interface ShorthandExpansion {
  expanded: string;
  replacements: Array<{ from: string; to: string }>;
}

/**
 * Surveying / civil shorthand seen on marked-up plans. Longer keys are
 * replaced first so "MATCH EXISTING" wins over "EXISTING".
 */
export const REDLINE_ABBREVIATIONS: Record<string, string> = {
  'MATCH EXISTING': 'match the adjacent existing condition',
  'N/F': 'now or formerly',
  'N.I.C.': 'not in contract',
  'NIC': 'not in contract',
  'TYP': 'typical',
  'SIM': 'similar',
  'TBC': 'top of bank',
  'BOC': 'bottom of curb',
  'TC': 'top of curb',
  'CL': 'centerline',
  'R/W': 'right of way',
  'ROW': 'right of way',
  'EOP': 'edge of pavement',
  'EP': 'edge of pavement',
  'DEL': 'delete',
  'RM': 'remove',
  'REM': 'remove',
  'ADD': 'add',
  'SHOW': 'show',
  'VERIFY': 'verify',
  'CONFIRM': 'confirm',
  'TBD': 'to be determined',
  '±': 'approximately',
  'Δ': 'delta',
};

const ABBREVIATION_KEYS = Object.keys(REDLINE_ABBREVIATIONS).sort((a, b) => b.length - a.length);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function abbreviationPattern(key: string): RegExp {
  const escaped = escapeRegExp(key);
  // Symbols such as ± and Δ have no word boundary; match them literally.
  if (/^[^A-Za-z0-9]+$/.test(key)) return new RegExp(escaped, 'gi');
  return new RegExp(`\\b${escaped}\\b`, 'gi');
}

export function expandRedlineShorthand(input: string): ShorthandExpansion {
  let expanded = input;
  const replacements: Array<{ from: string; to: string }> = [];
  for (const key of ABBREVIATION_KEYS) {
    const pattern = abbreviationPattern(key);
    if (!pattern.test(expanded)) continue;
    pattern.lastIndex = 0;
    expanded = expanded.replace(pattern, REDLINE_ABBREVIATIONS[key]);
    replacements.push({ from: key, to: REDLINE_ABBREVIATIONS[key] });
  }
  return { expanded, replacements };
}

const NON_DRAFTING_PATTERNS = [
  /\bverify with\b/i,
  /\bcoordinate with\b/i,
  /\bcheck (?:the )?(?:setback|zoning|structural|hydraul|survey|with)\b/i,
  /\bsetback\b/i,
  /\bzoning\b/i,
  /\bstructural\b/i,
  /\bengineer(?:ing)?\b/i,
  /\bcontractor\b/i,
  /\bpermit\b/i,
  /\bowner\b/i,
  /\bnot in contract\b/i,
  /\bto be determined\b/i,
  /\bprovide (?:a )?(?:detail|report|certification)\b/i,
  /\bby others\b/i,
];

const DELETION_PATTERN = /\b(delete|del|remove|rm|rem|strike|strikeout|cross out|demo|demolish)\b/i;
const ADD_PATTERN = /\b(add|show|insert|place|label|call ?out|annotate)\b/i;
const DIMENSION_PATTERN = /(?:\bEL\.?\s*[-+]?\d)|(?:\bSTA\.?\s*\d)|(?:\b\d+(?:\.\d+)?\s*(?:'|"|ft|feet|m)\b)|(?:\b\d{2,4}\.\d{1,3}\b)/i;
const MOVE_PATTERN = /\b(move|shift|adjust|relocate|align|extend|trim|shorten|lengthen)\b/i;

export function isNonDraftingComment(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  return NON_DRAFTING_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isDeletionIntent(text: string): boolean {
  return DELETION_PATTERN.test(text);
}

export function isAddIntent(text: string): boolean {
  return ADD_PATTERN.test(text);
}

export function isDimensionLike(text: string): boolean {
  return DIMENSION_PATTERN.test(text);
}

export function looksLikeStandaloneLabel(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  if (normalized.length > 120) return false;
  return !DELETION_PATTERN.test(normalized)
    && !ADD_PATTERN.test(normalized)
    && !MOVE_PATTERN.test(normalized)
    && !/\b(change|replace|revise|update)\b/i.test(normalized);
}

export interface RedlineIntentClassification {
  changeKind: RedlineChangeKind;
  risk: RedlineRisk;
  /** Short, human-readable intent shown in the worklist. */
  intent: string;
  /** True when the reviewer text is a comment, not a drafting instruction. */
  humanAction: boolean;
}

export function classifyRedlineIntent(
  reviewerText: string,
  markupKind: RedlineMarkupKind,
): RedlineIntentClassification {
  const text = reviewerText.trim();

  if (isNonDraftingComment(text)) {
    return {
      changeKind: 'none',
      risk: 'standard',
      intent: `Reviewer comment for a person: ${text}`,
      humanAction: true,
    };
  }

  if (isDeletionIntent(text)) {
    return {
      changeKind: 'entity_delete',
      risk: 'standard',
      intent: `Delete or remove the target: ${text}`,
      humanAction: false,
    };
  }

  if (isDimensionLike(text)) {
    return {
      changeKind: 'dimension_text',
      risk: 'standard',
      intent: `Correct a dimension, elevation, or numeric label: ${text}`,
      humanAction: false,
    };
  }

  if (MOVE_PATTERN.test(text)) {
    return {
      changeKind: 'geometry_move',
      risk: 'standard',
      intent: `Adjust the target's geometry: ${text}`,
      humanAction: false,
    };
  }

  if (isAddIntent(text)) {
    return {
      changeKind: 'entity_add',
      risk: 'standard',
      intent: `Add or show a new label/feature: ${text}`,
      humanAction: false,
    };
  }

  if (markupKind === 'highlight' && !text) {
    return {
      changeKind: 'none',
      risk: 'standard',
      intent: 'Highlighted area needs review',
      humanAction: false,
    };
  }

  if (markupKind === 'cloud' && !text) {
    return {
      changeKind: 'none',
      risk: 'standard',
      intent: 'Revision cloud marks an area that needs a change',
      humanAction: false,
    };
  }

  if (markupKind === 'note' && !text) {
    return {
      changeKind: 'none',
      risk: 'standard',
      intent: 'Reviewer note with no text',
      humanAction: false,
    };
  }

  if (markupKind === 'pointer') {
    return {
      changeKind: 'geometry_move',
      risk: 'standard',
      intent: text ? `Pointer mark: ${text}` : 'Pointer mark identifies a feature',
      humanAction: false,
    };
  }

  if (looksLikeStandaloneLabel(text)) {
    return {
      changeKind: 'text_content',
      risk: 'low',
      intent: `Set the label/text to "${text}"`,
      humanAction: false,
    };
  }

  return {
    changeKind: 'none',
    risk: 'standard',
    intent: text || 'Reviewer markup needs clarification',
    humanAction: false,
  };
}

/**
 * Derive the replacement string for a text correction. Returns null when the
 * mark is not asking for a replacement. Never invents a value: if the reviewer
 * did not write the replacement, the item must ask.
 */
export function deriveRedlineProposedText(reviewerText: string): string | null {
  const text = reviewerText.trim();
  if (!text) return null;

  const changeTo = text.match(/\b(?:change|replace|revise|update|correct)\b[\s\S]*?\bto\b\s+(.+)$/i)
    ?? text.match(/\b(?:should\s+(?:read|say)|label\s+as|text\s*[:=])\s*(.+)$/i);
  if (changeTo?.[1]?.trim()) return changeTo[1].trim().replace(/^["']|["']$/g, '');

  const add = text.match(/\b(?:add|show|insert|place|label|call ?out|annotate)\b\s+(.+)$/i);
  if (add?.[1]?.trim() && !/\b(?:detail|sheet|pipe|network|surface)\b/i.test(add[1])) {
    return add[1].trim().replace(/^["']|["']$/g, '');
  }

  if (looksLikeStandaloneLabel(text)) {
    const { expanded } = expandRedlineShorthand(text);
    return expanded;
  }

  return null;
}

/** Strip a leading reviewer command so candidate text is easier to compare. */
export function normalizeRedlineTextForMatching(text: string): string {
  return expandRedlineShorthand(text)
    .expanded
    .replace(/^(?:please\s+)?(?:change|replace|revise|update|delete|remove|del|rm|add|show|insert|label|fix|correct)\b/i, '')
    .replace(/\b(?:to|with|as|from)\b/gi, ' ')
    .replace(/[^A-Za-z0-9./+#&'-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
