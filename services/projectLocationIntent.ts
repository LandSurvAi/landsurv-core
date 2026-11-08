/**
 * projectLocationIntent — deterministic chat routing for the LSAI location
 * toolset.
 *
 * Users should not have to open a panel or name a CACP skill. "Where is my
 * project?", "show county GIS tax lines", "flood lines", "soils" are answered
 * from the uploaded point clusters. This module classifies those requests
 * without a model call so the answer is fast and identical every time.
 */

export type ProjectLocationIntentKind = 'locate' | 'parcels' | 'flood' | 'soils';

export interface ProjectLocationIntent {
  kind: ProjectLocationIntentKind;
  /** 1-based cluster named in the request ("cluster 2", "site #2"). */
  clusterIndex?: number;
  /** Query the drawn inclusion boundary instead of a cluster footprint. */
  aoi?: 'cluster' | 'inclusion';
}

const CLUSTER_INDEX_RE = /\b(?:cluster|site|location|area)\s*#?\s*(\d{1,2})\b/i;

const INCLUSION_RE = /\binclusion\b/i;

const SOILS_RE = /\b(?:soils?|ssurgo|hydrologic\s+soil\s+groups?|soil\s+(?:map|survey|types?))\b/i;

const FLOOD_RE = /\b(?:flood\s*(?:lines?|zones?|plains?|hazard|maps?|insurance)|fema|nfhl|base\s+flood|floodway)\b/i;

const PARCELS_RE = /\b(?:(?:county|tax)\s+(?:gis\s+)?(?:tax\s+)?(?:parcels?|parcel\s+lines?|lines?|boundar(?:y|ies)|lots?)|county\s+gis|tax\s+lines?|parcel\s+lines?|tax\s+(?:parcels?|lots?))\b/i;

const LOCATE_RE = new RegExp(
  [
    "\\bwhere(?:\\s+is|\\s+are|\\u2019s|'s)?\\s+(?:the|this|my|our)?\\s*(?:project|site|job|points?)\\b",
    '\\bproject\\s+(?:location|footprint|extent|bounds|area)\\b',
    '\\b(?:what|which)\\s+(?:state|county|municipality|township|town|city|jurisdiction)\\b',
    '\\b(?:state|county|municipality|jurisdiction)\\s+(?:is|of|for)\\s+(?:the|this|my)?\\s*(?:project|site|points?)\\b',
    '\\bwhere\\s+(?:are|is)\\s+(?:my|the)\\s+points\\b',
  ].join('|'),
  'i',
);

/**
 * Classify a chat message. Data requests win over a bare location question so
 * "what county does my project sit in — pull the tax lines" fetches the lines.
 */
export function detectProjectLocationIntent(text: string): ProjectLocationIntent | null {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return null;

  // Panel/window commands and parcel lookups belong to the existing surface
  // routing, not to a project-wide GIS fetch.
  if (/\b(?:open|close|show)\b.*\b(?:panel|manager|workspace|dialog|tool(?:shelf|s)?)\b/i.test(trimmed)) {
    return null;
  }
  if (/\b(?:look\s*up|search|find)\b.*\bparcels?\b/i.test(trimmed)) {
    return null;
  }
  if (/\bcounty\s+parcels?\s+gis\b/i.test(trimmed)) {
    return null;
  }
  // Limitations reports are compiled inline by the Soils Agent; "show soil
  // limitations" must not fetch SSURGO polygons through the location panel.
  if (/\bsoils?\s+limitations?\b/i.test(trimmed)) {
    return null;
  }

  const clusterMatch = trimmed.match(CLUSTER_INDEX_RE);
  const clusterIndex = clusterMatch ? Number(clusterMatch[1]) : undefined;
  const usesInclusion = INCLUSION_RE.test(trimmed);
  const withIndex = (kind: ProjectLocationIntentKind): ProjectLocationIntent => {
    if (usesInclusion) return { kind, aoi: 'inclusion' };
    return clusterIndex && clusterIndex > 0 ? { kind, clusterIndex } : { kind };
  };

  if (SOILS_RE.test(trimmed)) return withIndex('soils');
  if (FLOOD_RE.test(trimmed)) return withIndex('flood');
  if (PARCELS_RE.test(trimmed)) return withIndex('parcels');
  if (LOCATE_RE.test(trimmed)) return withIndex('locate');
  return null;
}

/** Human label used in replies and Quick Thought options. */
export function projectLocationIntentLabel(kind: ProjectLocationIntentKind): string {
  switch (kind) {
    case 'parcels': return 'county tax lines';
    case 'flood': return 'flood lines';
    case 'soils': return 'soils';
    default: return 'project location';
  }
}
