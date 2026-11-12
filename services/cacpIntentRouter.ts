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
import { isExperimentalAgentEnabled } from '../utils/experimentalAgents.ts';

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
  [AgentType.COGO_AGENT]: [
    'divide line', 'divide a line', 'divide lines', 'divide arc', 'divide an arc',
    'divide selected line', 'divide selected arc', 'divide into points',
    'divide into segments', 'subdivide line', 'segment a line', 'points along a line',
  ],
  [AgentType.ROADING_AGENT]: [
    'road', 'roads', 'roadway', 'roading', 'street', 'alignment', 'centerline profile',
    'curb', 'gutter', 'sidewalk', 'pavement', 'draw a road', 'draw the road', 'draw road',
    'design a road', 'design road', 'road design', 'road corridor', 'corridor',
    'typical section', 'cul-de-sac', 'cul de sac', 'crown slope', 'lane width',
    'edge of pavement', 'right of way', 'right-of-way', 'driveway apron',
    'synthesize road', 'existing road', 'proposed road', 'highway',
  ],
  [AgentType.REDLINE_AGENT]: [
    'redline', 'redlines', 'marked-up plan', 'marked up plan', 'markup', 'markups',
    'reviewer comments', 'reviewer markup', 'review comments', 'address the markups',
    'process the redline', 'redline package', 'reviewer cloud', 'revision cloud',
    'annotated plan', 'annotated pdf', 'drafting comments', 'backcheck comments',
  ],
  [AgentType.CIVIL_DRAFTER]: [
    'pipe', 'sewer', 'storm', 'drain', 'culvert', 'utility trench',
    'grading', 'subdivision', 'plan and profile', 'plan set', 'cross section',
    'easement plat', 'civil plan', 'construction plan',
    'linework', 'polyline', 'new linework', 'stream', 'streams', 'stream bed', 'stream beds',
    'stream-bed', 'stream-beds', 'creek', 'creeks', 'watercourse', 'watercourses', 'drainageway',
    'breakline', 'breaklines', 'top of bank', 'toe of slope',
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
    'gps rover', 'rover', 'collect a point', 'collect point', 'rover fix',
  ],
  [AgentType.LSVZ_AGENT]: [
    'project location', 'project footprint', 'project extent', 'where is the project',
    'where does the project', 'where is my project', 'where are my points', 'point cluster',
    'point clusters', 'multiple sites', 'what county', 'what state', 'what municipality',
    'what township', 'which county', 'which state', 'what jurisdiction', 'jurisdiction of',
    'drawing extent', 'point extent', 'linework extent', 'county gis tax lines', 'tax lines',
    'parcel lines', 'flood lines', 'flood zones', 'soils',
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
  [AgentType.DIRT_VOLUME_AGENT]: [
    'dirt volume', 'earthwork', 'cut and fill', 'cut/fill', 'cut fill', 'volume calculation',
    'cubic yards', 'excavation', 'grading quantities', 'stockpile', 'mass haul', 'haul balance',
    'borrow', 'site balance', 'end area', 'section area', 'tin comparison', 'volume report',
  ],
  [AgentType.STORMWATER_AGENT]: [
    'stormwater', 'storm water', 'runoff', 'peak runoff', 'peak flow', 'rational method',
    'time of concentration', 'drainage area', 'design storm', 'cfs', 'detention', 'conveyance',
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
  // Dividing a line/arc is a COGO operation, not a point-management task. The
  // generic "point" keywords would otherwise outscore COGO in the normal table.
  if (/\bdivide\b[\s\S]*\b(?:line|lines|arc|arcs|polyline|polylines)\b/i.test(request)) {
    return {
      primary: {
        agent: AgentType.COGO_AGENT,
        displayName: 'COGO',
        score: 99,
        matchedOn: ['divide line/arc'],
      },
      alternates: [],
      isMismatched: currentAgent !== undefined && currentAgent !== AgentType.COGO_AGENT,
      explanation: 'Divide line/arc request routed to COGO.',
    };
  }

  // Linework authoring belongs to the Civil Drafter. Check this before generic
  // scoring so a Point Editor request that also mentions "points" cannot tie
  // or outrank the drafter on its own point-management vocabulary.
  const authorsLinework =
    /\b(?:draw|draft|trace|create|add|connect|plot|generate|author)\w*\b/i.test(request) &&
    /\b(?:new\s+linework|linework|polyline|stream[\s-]?beds?|creeks?|watercourses?|breaklines?|top\s+of\s+bank|toe\s+of\s+slope|ditch(?:es)?|swales?|tree\s+line|fence\s+line)\b/i.test(request);
  if (authorsLinework) {
    return {
      primary: {
        agent: AgentType.CIVIL_DRAFTER,
        displayName: 'Civil Drafter',
        score: 99,
        matchedOn: ['new linework'],
      },
      alternates: [],
      isMismatched: currentAgent !== undefined && currentAgent !== AgentType.CIVIL_DRAFTER,
      explanation: 'New linework request routed to Civil Drafter.',
    };
  }

  // Roading owns existing-road drawing again. When the experimental gate is
  // enabled, send road requests to the Roading Agent; when disabled, keep the
  // Civil Drafter's direct-from-points path.
  const isRoadDrawingRequest =
    /\b(?:draw|draft|trace|design|model|synthesi[sz]e|extract|create|build|plot|generate)\w*\b/i.test(request) &&
    /\b(?:road|roads|roadway|street|corridor|pavement|curb|gutter|sidewalk|right[\s-]?of[\s-]?way|centerline|cul[\s-]?de[\s-]?sac)\b/i.test(request);
  if (isRoadDrawingRequest) {
    const roadingEnabled = isExperimentalAgentEnabled(AgentType.ROADING_AGENT);
    const targetAgent = roadingEnabled ? AgentType.ROADING_AGENT : AgentType.CIVIL_DRAFTER;
    const isMismatched = currentAgent !== undefined && currentAgent !== targetAgent;
    return {
      primary: {
        agent: targetAgent,
        displayName: roadingEnabled ? 'Roading Agent' : 'Civil Drafter',
        score: 95,
        matchedOn: [roadingEnabled ? 'road drawing/synthesis' : 'road drawing (Roading disabled)'],
      },
      alternates: [],
      isMismatched,
      explanation: roadingEnabled
        ? 'Road request routed to Roading Agent (existing-road synthesis or parametric model)' +
          (isMismatched ? `, but current agent is ${currentAgent}.` : '.')
        : 'Road request routed to Civil Drafter because the Roading Agent is disabled.',
    };
  }

  const manifests = agentRegistry.listCacpEnabled()
    .filter(m => isExperimentalAgentEnabled(m.agent));
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

/**
 * Action verbs that mean the user is asking for work to be performed, not merely
 * asking a question. Only work requests are auto-handed-off: a Point Editor user
 * who asks "how many points are along the road?" must keep their Point Editor.
 */
const HANDOFF_ACTION_VERB_RE = /\b(draw(?:ing)?|draft(?:ing)?|design(?:ing)?|creat(?:e|ing)|mak(?:e|ing)|build(?:ing)?|synthesi[sz](?:e|ing)|extract(?:ing)?|trac(?:e|ing)|plot(?:ting)?|plac(?:e|ing)|generat(?:e|ing)|model(?:ing|ling)?|add(?:ing)?|lay(?:ing)?\s*out)\b/i;

/**
 * Enforced dispatch decision: the agent that should take this request before the
 * current agent acts, or null when the current agent should keep it.
 *
 * Unlike {@link shouldDefer} (advisory), this is meant to be consulted by the
 * chat dispatcher so a mismatched agent never gets to run the request itself.
 * Questions without an action verb are never hijacked.
 */
export function resolveIntentHandoff(request: string, currentAgent: AgentType): IntentMatch | null {
  if (!HANDOFF_ACTION_VERB_RE.test(request)) return null;
  const route = routeIntent(request, currentAgent);
  return route.isMismatched && route.primary ? route.primary : null;
}

