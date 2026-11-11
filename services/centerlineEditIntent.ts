/**
 * Deterministic centerline edit intents.
 *
 * Start-station edits should change the Centerline itself. The model used to
 * acknowledge these requests without touching geometry, leaving every station
 * label at the old value. Keep the recognition here so App can apply the edit
 * before a model turn.
 */

import { parseStation } from '../utils/stationing.ts';

export interface StartStationEditIntent {
  station: number;
  /** Present when the request names a known alignment. */
  alignmentName?: string;
}

const START_STATION_PATTERN =
  /\b(?:start(?:ing)?|begin(?:ning)?|initial)\s+station\b|\bbop\s+station\b|\brestation(?:ed)?\b/i;

// Quick Thought input forms submit labeled values rather than imperative
// sentences, for example "Beginning station: 5+00".
const STATION_FIELD_VALUE_PATTERN =
  /\b(?:start(?:ing)?|begin(?:ning)?|initial|bop)\s+station(?:\s*\([^)]*\))?\s*[:=]\s*(?:sta(?:tion)?\s*)?(-?\d[\d,]*(?:\.\d+)?(?:\s*\+\s*\d+(?:\.\d+)?)?)/i;

const EDIT_VERB_PATTERN =
  /\b(?:adjust|change|set|update|move|renumber|restation|shift|make)\b/i;

const ALIGNMENT_WORD_PATTERN = /\b(?:centerlines?|baselines?|alignments?|cl)\b/i;

/**
 * Recognize only imperative edits with an explicit value. Questions such as
 * "What is the start station?" and profile start-station edits are left alone.
 */
export const parseStartStationEdit = (
  query: string,
  options: {
    centerlineNames?: string[];
    allowImplicitAlignment?: boolean;
  } = {},
): StartStationEditIntent | null => {
  const trimmed = query.trim();
  if (!trimmed) return null;
  if (/^(?:what|where|which|how|who|when|is|are|should|can|could|would|do|does|did)\b/i.test(trimmed)) {
    return null;
  }
  const isFormValue = STATION_FIELD_VALUE_PATTERN.test(trimmed);
  if (!EDIT_VERB_PATTERN.test(trimmed) && !isFormValue) return null;
  if (!START_STATION_PATTERN.test(trimmed)) return null;

  // "start station of the profile" is a different object.
  if (/\bprofile\b/i.test(trimmed) && !ALIGNMENT_WORD_PATTERN.test(trimmed)) return null;

  const valueMatch =
    trimmed.match(
      /\b(?:to|at|as|=|:)\s*(?:sta(?:tion)?\s*)?(-?\d[\d,]*(?:\.\d+)?(?:\s*\+\s*\d+(?:\.\d+)?)?)/i,
    ) ?? trimmed.match(STATION_FIELD_VALUE_PATTERN);
  if (!valueMatch) return null;

  const station = parseStation(valueMatch[1].replace(/,/g, ''));
  if (station === null || !Number.isFinite(station)) return null;

  const lower = trimmed.toLowerCase();
  const alignmentName = [...(options.centerlineNames ?? [])]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .find(name => lower.includes(name.toLowerCase()));

  if (!alignmentName && !ALIGNMENT_WORD_PATTERN.test(trimmed) && !options.allowImplicitAlignment) {
    return null;
  }

  return {
    station,
    ...(alignmentName ? { alignmentName } : {}),
  };
};
