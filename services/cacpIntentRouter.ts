/**
 * CACP Intent Router
 *
 * Classifies a natural-language request against the AgentRegistry's manifests and
 * decides which agent should handle it — the core of "consider intent before
 * acting / ask around before doing the wrong thing."
 *
 * Design:
 *  - Deterministic, offline, fast: keyword + phrase scoring with weighted matches,
 *    no model call. (A model can refine later; the bus needs a fast local answer.)
 *  - Read-only over the registry: scores are computed from each CACP-enabled
 *    agent's skills + displayName + a curated capability-phrase table below.
 *  - Pure functions, unit-testable; consumed by the message-dispatch layer and by
 *    the chat agents (Point Agent, etc.) to detect "this isn't my job".
 *
 * This mirrors the same intent table used for the C3D connector's CACP routing so
 * both ends agree on who owns what.
 */

import { AgentType } from '../types.ts';
import { agentRegistry, type AgentManifest } from './AgentRegistry.ts';

export interface IntentMatch {
  agent: AgentType;
  displayName: string;
  /** Weighted score; higher = stronger match. 0 = no match. */
  score: number;
  /** The specific keywords/phrases that matched (for explainability/logging). */
  matchedOn: string[];
}

export interface IntentRoute {
  /** Best-matching agent, or null when nothing scores above the threshold. */
  primary: IntentMatch | null;
  /** Runner-up matches (score > 0, sorted desc) — candidates for "ask around". */
  alternates: IntentMatch[];
  /** True when the active agent is NOT the primary match (a handoff is suggested). */
  isMismatched: boolean;
  /** Human-readable routing explanation, e.g. for the fieldbook / CACP log. */
  explanation: string;
}

/**
 * Capability phrases per agent — the "what I'm good at" signal that pure skill-id
 * matching can't express. Weighted 2-3x over raw skill-id hits because they capture
 * domain intent (e.g. "road", "alignment", "pipe") rather than command names.
 *
 * Only CACP-enabled agents matter; the table is keyed by AgentType so it stays in
 * sync with the registry. Keep entries lowercase; matching is case-insensitive.
 */
const AGENT_CAPABILITY_PHRASES: Partial<Record<AgentType, string[]>> = {
  [AgentType.CIVIL_DRAFTER]: [
    'road', 'roadway', 'street', 'alignment', 'centerline profile', 'curb', 'gutter',
    'sidewalk', 'pipe', 'sewer', 'storm', 'drain', 'culvert', 'utility trench',
    'grading', 'subdivision', 'plan and profile', 'plan set', 'cross section',
    'pavement', 'easement plat', 'civil plan', 'construction plan', 'draw a road',
    'draw the road', 'draw road', 'linework', 'polyline', 'right of way', 'right-of-way',
    'breakline', 'breaklines', 'top of bank', 'toe of slope', 'edge of pavement',
    'ditch', 'swale', 'tree line', 'fence line', 'connect the shots', 'connect the points',
  ],
  [AgentType.CENTERLINE_STATIONING]: [
    'station', 'stationing', 'baseline', 'centerline', 'offset point', 'chainage',
    'stake out', 'stakeout', 'pc ', 'pt ', 'spiral', 'curve table', 'along the centerline',
  ],
  [AgentType.POINT_EDITOR]: [
    'point', 'points', 'cogo point', 'survey point', 'point number', 'renumber', 'delete point',
    'remove point', 'move point', 'edit point', 'elevation of point', 'list points',
    'count points', 'how many points', 'coordinate', 'northing', 'easting', 'topo shot',
    'control point', 'benchmark',
  ],
  [AgentType.DEED_READER]: [
    'deed', 'metes and bounds', 'boundary', 'parcel', 'legal description', 'closure',
    'bearing and distance', 'grantor', 'grantee', 'plot the deed', 'deed call',
    'tract', 'subdivide', 'lot split',
  ],
  [AgentType.CONTOURING_AGENT]: [
    'contour', 'contours', 'elevation surface', 'terrain', 'tin', 'topo surface',
    'grade the surface', 'existing ground',
  ],
  [AgentType.GIS_AGENT]: [
    'gis', 'parcel map', 'shapefile', 'geojson', 'arcgis', 'feature layer', 'county gis',
    'flood zone', 'nfhl', 'usgs', 'census', 'orthoimagery',
  ],
  [AgentType.GPS_STAKEOUT]: [
    'gps', 'gnss', 'stake', 'stake out', 'stakeout', 'rtk', 'receiver', 'navigate to point',
  ],
  [AgentType.ZONING_AGENT]: [
    'zoning', 'setback', 'zoning district', 'land use', 'permitted use', 'ordinance',
    'height limit', 'lot coverage',
  ],
  [AgentType.STEEP_SLOPE_AGENT]: [
    'steep slope', 'slope analysis', 'percent slope', 'slope map', '15%', '25%',
    'disturbance', 'slope area',
  ],
  [AgentType.CIVIL_PLAN_EXPERT]: [
    'plan review', 'read the plan', 'what does the plan say', 'plan sheet', 'detail sheet',
    'typical section', 'notes on the plan',
  ],
  [AgentType.STANDARDS_COMPLIANCE]: [
    'compliance', 'standards check', 'drafting standard', 'layer standard', 'linetype standard',
    'title block', 'audit the drawing', 'usace', 'aec standard',
  ],
  [AgentType.CAD_MANAGER]: [
    'cad standard', 'description key', 'field to finish', 'layer mapping', 'code set',
    'figure prefix',
  ],
  [AgentType.VOICE_AGENT]: [
    'voice', 'speak', 'microphone', 'hands free', 'talk to',
  ],
  [AgentType.AR_AGENT]: [
    'smart glass', 'augmented reality', 'heads up display', 'glasses', 'field view',
  ],
  [AgentType.DXF_ANALYZER]: [
    'dxf', 'import dxf', 'read dxf', 'analyze dxf',
  ],
  [AgentType.DRONE_AGENT]: [
    'drone', 'uas', 'photogrammetry', 'orthomosaic', 'point cloud', 'lidar',
  ],
  [AgentType.TITLE_SEARCH]: [
    'title', 'title search', 'chain of title', 'deed book', 'county records',
  ],
  [AgentType.FLOOD_AGENT]: [
    'flood', 'fema', 'floodplain', 'base flood elevation', 'flood insurance', 'flood zone',
  ],
  [AgentType.SOILS_AGENT]: [
    'soil', 'soils', 'soil survey', 'nrcs', 'hydrologic', 'permeability',
  ],
  [AgentType.GNSS_AGENT]: [
    'rinex', 'static observation', 'opus', 'post process', 'baseline processing', 'gnss',
  ],
  [AgentType.PROFILE_AGENT]: [
    'profile', 'vertical curve', 'profile view', 'elevation profile', 'cut sheet', 'cut/fill',
  ],
  [AgentType.STRUCTURES_AGENT]: [
    'structure', 'building footprint', 'building', 'foundation', 'roof',
  ],
};

/** Minimum score for a confident primary match. */
const PRIMARY_THRESHOLD = 3;
/** Multiplier applied to capability-phrase hits (domain intent) vs skill-id hits. */
const CAPABILITY_WEIGHT = 3;

/** Skill-id tokens that appear in almost every request and carry no domain signal. */
const SKILL_GENERIC_TOKENS = new Set([
  'create', 'creates', 'make', 'draw', 'draws', 'drawing', 'get', 'set', 'list',
  'add', 'adds', 'remove', 'apply', 'update', 'delete', 'find', 'query', 'import',
  'export', 'load', 'save', 'compute', 'generate', 'build', 'place', 'insert',
  'show', 'read', 'parse', 'convert', 'check', 'analyze', 'sync', 'label',
  'line', 'lines', 'layer', 'layers', 'block', 'text',
  'annotation', 'symbol', 'polyline', 'boundary', 'parcel',
  // NOTE: 'point'/'points' intentionally NOT here — point-management intent is the
  // Point Editor's core domain, and its capability phrases rely on those matches.
]);

/** Normalize text for matching: lowercase, collapse whitespace. */
function norm(text: string): string {
  return ` ${text.toLowerCase().replace(/\s+/g, ' ').trim()} `;
}

/** Count non-overlapping occurrences of `needle` (as a word-ish phrase) in `hay`. */
function countOccurrences(hay: string, needle: string): number {
  if (!needle) return 0;
  const n = ` ${needle.toLowerCase().trim()} `;
  let count = 0;
  let idx = hay.indexOf(n);
  while (idx !== -1) {
    count++;
    idx = hay.indexOf(n, idx + n.length);
  }
  return count;
}

/** Score one agent's manifest against the request text. */
function scoreAgent(request: string, manifest: AgentManifest): IntentMatch {
  const hay = norm(request);
  const matchedOn: string[] = [];
  let score = 0;

  // 1. Capability phrases (domain intent) — highest weight. Two matching passes:
  //    padded-whole-phrase (respects word boundaries) and plain substring (catches
  //    multi-word phrases embedded in longer queries).
  const phrases = AGENT_CAPABILITY_PHRASES[manifest.agent] ?? [];
  for (const phrase of phrases) {
    const p = phrase.toLowerCase().trim();
    const whole = countOccurrences(hay, p);
    const substr = hay.includes(p) ? 1 : 0;
    const hits = Math.max(whole, substr);
    if (hits > 0) {
      score += hits * CAPABILITY_WEIGHT;
      matchedOn.push(phrase);
    }
  }

  // 2. Skill ids + displayName tokens — direct command/identity matches.
  const displayTokens = norm(manifest.displayName).trim().split(' ').filter(t => t.length > 2);
  for (const token of displayTokens) {
    if (countOccurrences(hay, token) > 0) { score += 1; matchedOn.push(token); }
  }
  for (const skill of manifest.skills) {
    // skill id like "cl_create_from_points" → match on meaningful tokens.
    // Skip generic verbs (create/make/draw/get/set/list/add/remove/apply/etc.) —
    // they match every request and swamp the domain signal.
    for (const token of skill.id.split('_').filter(t => t.length > 3)) {
      if (SKILL_GENERIC_TOKENS.has(token)) continue;
      if (countOccurrences(hay, token) > 0) { score += 1; matchedOn.push(skill.id); break; }
    }
  }

  return { agent: manifest.agent, displayName: manifest.displayName, score, matchedOn };
}

/**
 * Route a natural-language request to the best agent. When `currentAgent` is
 * provided, the result reports whether that agent is actually the right one
 * (isMismatched) so the caller can hand off or ask around before acting.
 */
export function routeIntent(request: string, currentAgent?: AgentType): IntentRoute {
  const manifests = agentRegistry.listCacpEnabled();
  const matches = manifests
    .map(m => scoreAgent(request, m))
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score);

  const primary = matches.length > 0 && matches[0].score >= PRIMARY_THRESHOLD ? matches[0] : null;
  const alternates = matches.filter(m => m !== primary).slice(0, 4);

  let isMismatched = false;
  let explanation: string;
  if (primary) {
    isMismatched = currentAgent !== undefined && currentAgent !== primary.agent;
    explanation = isMismatched
      ? `Request matches ${primary.displayName} (score ${primary.score}) but current agent is ${currentAgent}. Suggest handoff.`
      : `Request routed to ${primary.displayName} (score ${primary.score}: ${primary.matchedOn.slice(0, 3).join(', ')}).`;
  } else {
    explanation = `No confident agent match${matches.length > 0 ? ` (best: ${matches[0].displayName}, score ${matches[0].score})` : ''}. Broadcasting for a volunteer.`;
    isMismatched = false;
  }

  return { primary, alternates, isMismatched, explanation };
}

/**
 * Decide whether `currentAgent` should handle this request itself or defer to a
 * better-suited peer. Returns null when the current agent is fine; otherwise a
 * suggestion the caller can surface ("Civil Drafter can take this — hand off?").
 */
export function shouldDefer(request: string, currentAgent: AgentType): IntentMatch | null {
  const route = routeIntent(request, currentAgent);
  return route.isMismatched && route.primary ? route.primary : null;
}

