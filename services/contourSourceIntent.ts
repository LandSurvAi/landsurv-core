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
 *
 * A generic GIS request does NOT carry a source. The host asks the user which
 * provider/layer to use instead of quietly choosing USGS, PASDA, or a resolver
 * result. Inclusion requests also carry an explicit inside/outside scope.
 */

import {
  USGS_NATIONAL_CONTOUR_SOURCES,
  type ContourInclusionScope,
  type NationalContourSource,
} from '../utils/usgsNationalContours.ts';

export type ContourSourceKind = 'gis' | 'points' | 'ambiguous';
export type GisContourSourceId = 'state' | 'custom';

export interface ContourSourceIntent {
  kind: ContourSourceKind;
  /** Built-in USGS layer to query, only when the user named one. */
  usgsSource?: NationalContourSource;
  /** Non-USGS GIS source selected by the request. */
  gisSourceId?: GisContourSourceId;
  /** Full custom service URL when the user supplied one. */
  serviceUrl?: string;
  /** True when the user asked for GIS but did not choose a provider/layer. */
  needsSource: boolean;
  /** Which source choices to offer when needsSource is true. */
  sourceHint?: 'usgs' | 'gis';
  /** Whether inclusion-mode GIS contours should be kept inside or outside. */
  inclusionScope?: ContourInclusionScope;
  matchedOn: string[];
}

/** Quick Thought choices when the user has not named a contour source. */
export const CONTOUR_SOURCE_OPTIONS = [
  'Contour from survey points',
  'Fetch USGS 3DEP intermediate contours',
  'Fetch state GIS contours (PASDA)',
  'Use a custom ESRI contour service',
] as const;

/** Source choices after the user has already said they want GIS contours. */
export const GIS_CONTOUR_SOURCE_OPTIONS = [
  'Fetch USGS 3DEP intermediate contours',
  'Fetch state GIS contours (PASDA)',
  'Use a custom ESRI contour service',
] as const;

/** USGS layer choices when the user named USGS but not a specific layer. */
export const USGS_CONTOUR_LAYER_OPTIONS = [
  'Fetch USGS 3DEP index contours',
  'Fetch USGS 3DEP intermediate contours',
  'Fetch USGS 3DEP supplemental contours',
] as const;

/** Opening choices shown beside the Contouring Agent greeting. */
export const CONTOUR_AGENT_QUICK_THOUGHTS = [
  'Review contour settings',
  'Contour from survey points',
  '1 ft contours',
  '0.5 ft contours',
  'Fetch USGS 3DEP intermediate contours',
  'Fetch state GIS contours (PASDA)',
] as const;

const CONTOUR_RE = /\bcontours?\b/i;
const GIS_RE =
  /\b(?:gis|esri|arcgis|usgs|3dep|3d\s+elevation|national\s+map|pasda|pamap|rest\s+(?:service|endpoint)|map\s*server|feature\s*server|public\s+contours?|download(?:ed)?\s+contours?)\b/i;
const USGS_PROVIDER_RE = /\b(?:usgs|3dep|3d\s+elevation|national\s+map)\b/i;
const POINT_RE =
  /\b(?:survey\s+points?|topo\s+(?:points?|shots?)|ground\s+(?:points?|shots?)|field\s+shots?|shots?|my\s+points?|tin|triangulat\w*|point\s+cloud|(?:from|using)\s+(?:all\s+|only\s+|the\s+|my\s+|these\s+)?points?)\b/i;
const INCLUSION_WORD_RE = /\b(?:inclusion|boundary)\b/i;
const OUTSIDE_SCOPE_RE = /\b(?:outside|exterior|external)\b/i;
const INSIDE_SCOPE_RE = /\b(?:inside|within|interior)\b/i;

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

function inclusionScopeFor(query: string): ContourInclusionScope | undefined {
  if (!INCLUSION_WORD_RE.test(query)) return undefined;
  if (OUTSIDE_SCOPE_RE.test(query)) return 'outside';
  if (INSIDE_SCOPE_RE.test(query)) return 'inside';
  return undefined;
}

function customServiceUrlFor(query: string): string | undefined {
  const match = query.match(/https?:\/\/[^\s<>"']+/i);
  return match?.[0]?.replace(/[.,;:!?\)\]]+$/, '');
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
    return { kind: 'ambiguous', needsSource: true, matchedOn: ['GIS/ESRI', 'survey points/TIN'] };
  }

  if (gis) {
    const namedUsgs = usgsSourceFor(query);
    const state = /\b(?:pasda|pamap|state\s+gis|statewide)\b/i.test(query);
    const serviceUrl = customServiceUrlFor(query);
    const custom = !!serviceUrl || /\b(?:custom|service\s+url|my\s+service)\b/i.test(query);
    const inclusionScope = inclusionScopeFor(query);
    const hasExplicitSource = !!namedUsgs || state || custom;

    const matchedOn = ['GIS/ESRI/USGS'];
    if (inclusionScope) matchedOn.push(`inclusion:${inclusionScope}`);

    return {
      kind: 'gis',
      usgsSource: namedUsgs,
      gisSourceId: state ? 'state' : custom ? 'custom' : undefined,
      serviceUrl,
      needsSource: !hasExplicitSource,
      sourceHint: USGS_PROVIDER_RE.test(query) ? 'usgs' : 'gis',
      inclusionScope,
      matchedOn,
    };
  }

  if (points) {
    return { kind: 'points', needsSource: false, matchedOn: ['survey points/TIN'] };
  }

  // Bare "contours", "contour the site", "generate 1-foot contours" — ask the
  // user which source they mean instead of assuming triangulation.
  return { kind: 'ambiguous', needsSource: true, matchedOn: ['contours'] };
}
