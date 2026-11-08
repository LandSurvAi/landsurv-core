/**
 * contourSourceIntent — decide where a contour request should come from.
 *
 * Contours come from two fundamentally different sources:
 *   • the project's own survey points / TIN (triangulation), and
 *   • a public GIS service (USGS 3DEP, PASDA/PAMAP, custom ESRI REST).
 *
 * The Contouring Agent used to treat every "contour" request as a point
 * triangulation request. This detector makes the source explicit before the
 * model runs, so "GIS / ESRI / USGS contours" never silently becomes a TIN.
 */

import {
  USGS_NATIONAL_CONTOUR_SOURCES,
  type NationalContourSource,
} from '../utils/usgsNationalContours.ts';

export type ContourSourceKind = 'gis' | 'points' | 'ambiguous';
export type GisContourSourceId = 'state' | 'custom';

export interface ContourSourceIntent {
  kind: ContourSourceKind;
  /** Built-in USGS layer to query, when one can be chosen. */
  usgsSource?: NationalContourSource;
  /** Non-USGS GIS source selected by the request. */
  gisSourceId?: GisContourSourceId;
  matchedOn: string[];
}

/** Quick Thought choices when the user has not named a contour source. */
export const CONTOUR_SOURCE_OPTIONS = [
  'Contour from survey points',
  'Fetch USGS 3DEP contours',
  'Fetch state GIS contours (PASDA)',
] as const;

/** Opening choices shown beside the Contouring Agent greeting. */
export const CONTOUR_AGENT_QUICK_THOUGHTS = [
  'Fetch USGS 3DEP contours',
  'Contour from survey points',
  'Open ESRI REST sources',
] as const;

const CONTOUR_RE = /\bcontours?\b/i;
const GIS_RE =
  /\b(?:gis|esri|arcgis|usgs|3dep|3d\s+elevation|national\s+map|pasda|pamap|rest\s+(?:service|endpoint)|map\s*server|feature\s*server|public\s+contours?|download(?:ed)?\s+contours?)\b/i;
const POINT_RE =
  /\b(?:survey\s+points?|topo\s+(?:points?|shots?)|ground\s+(?:points?|shots?)|field\s+shots?|shots?|my\s+points?|tin|triangulat\w*|point\s+cloud|(?:from|using)\s+(?:all\s+|only\s+|the\s+|my\s+|these\s+)?points?)\b/i;

// Explanatory questions and layer-management commands belong to the model,
// not to an automatic download.
const QUESTION_RE = /^\s*(?:what|why|how|explain|tell\s+me|describe|which|where|when|who)\b/i;
const MANAGEMENT_RE =
  /^\s*(?:show|hide|toggle|turn\s+(?:on|off)|delete|remove|clear|list|count|manage|change|set)\b/i;
const STYLE_EDIT_RE =
  /^\s*(?:make|adjust|increase|decrease|smooth|style|label)\b.*\b(?:label|labels|smooth|smoothing|density|scale|size|color|colour|opacity|interval|spacing|thickness|lineweight)\b/i;

function usgsSourceFor(query: string): NationalContourSource | undefined {
  if (/\bindex\b/i.test(query)) {
    return USGS_NATIONAL_CONTOUR_SOURCES.find(source => source.id === 'index');
  }
  if (/\bsupplemental\b/i.test(query)) {
    return USGS_NATIONAL_CONTOUR_SOURCES.find(source => source.id === 'supplemental');
  }
  if (/\bintermediate\b/i.test(query)) {
    return USGS_NATIONAL_CONTOUR_SOURCES.find(source => source.id === 'intermediate');
  }
  return undefined;
}

/**
 * Classify a free-text message. Returns null when it is not a contour-source
 * request at all (questions, visibility switches, unrelated work).
 */
export function detectContourSourceIntent(rawQuery: string): ContourSourceIntent | null {
  const query = (rawQuery ?? '').trim();
  if (!query || !CONTOUR_RE.test(query)) return null;
  if (QUESTION_RE.test(query) || MANAGEMENT_RE.test(query) || STYLE_EDIT_RE.test(query)) return null;

  const gis = GIS_RE.test(query);
  const points = POINT_RE.test(query);

  if (gis && points) {
    return { kind: 'ambiguous', matchedOn: ['GIS/ESRI', 'survey points/TIN'] };
  }

  if (gis) {
    const namedUsgs = usgsSourceFor(query);
    const state = /\b(?:pasda|pamap|state\s+gis|statewide)\b/i.test(query);
    const custom = /\b(?:custom|service\s+url|my\s+service)\b/i.test(query);
    // "GIS contours" / "ESRI contours" with no named source defaults to the
    // nationwide USGS intermediate set — it always has coverage.
    const usgsSource = namedUsgs
      ?? (state || custom
        ? undefined
        : USGS_NATIONAL_CONTOUR_SOURCES.find(source => source.id === 'intermediate'));

    return {
      kind: 'gis',
      usgsSource,
      gisSourceId: state ? 'state' : custom ? 'custom' : undefined,
      matchedOn: ['GIS/ESRI/USGS'],
    };
  }

  if (points) {
    return { kind: 'points', matchedOn: ['survey points/TIN'] };
  }

  // Bare "contours", "contour the site", "generate 1-foot contours" — ask the
  // user which source they mean instead of assuming triangulation.
  return { kind: 'ambiguous', matchedOn: ['contours'] };
}
