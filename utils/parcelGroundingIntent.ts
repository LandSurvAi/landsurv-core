import { AgentType } from '../types.ts';

/**
 * Parcel lines are legal evidence, not drafting geometry for every request.
 * They are allowed as alignment hints in exactly two cases:
 *   1. Building / tracing roads, where parcel frontage locates the corridor.
 *   2. Boundary and property-corner work, where parcel lines are a check.
 *
 * Everything else — breaklines, streams, ditches, tree lines, fences, generic
 * linework, surfaces — must never trigger a county parcel fetch.
 */
const ROAD_HINT_RE =
  /\b(?:roads?|roadway|street|pavement|corridor|right[-\s]?of[-\s]?way|curb|gutter|sidewalk|driveway|intersection|cul[-\s]?de[-\s]?sac)\b/i;

const BOUNDARY_HINT_RE =
  /\b(?:boundar(?:y|ies)|property\s+(?:line|lines|corner|corners)|parcel\s+(?:line|lines|corner|corners|boundar(?:y|ies))|lot\s+(?:line|lines|corner|corners)|frontage|easement|right[-\s]?of[-\s]?way)\b/i;

export function isRoadGroundingQuery(query: string): boolean {
  return ROAD_HINT_RE.test(query);
}

export function shouldFetchParcelLineGrounding(
  agent: AgentType,
  query: string,
): boolean {
  if (agent !== AgentType.CIVIL_DRAFTER && agent !== AgentType.ROADING_AGENT) return false;
  if (ROAD_HINT_RE.test(query)) return true;
  return agent === AgentType.CIVIL_DRAFTER && BOUNDARY_HINT_RE.test(query);
}
