/**
 * Maps AgentType values that require the proprietary backend to the reason
 * they're hidden in the OSS/local-mode build. Single source of truth consumed
 * by `utils/retiredAgents.ts` (sidebar/home-screen filtering) so this list
 * stays in sync with `data/openSourceBoundary.ts` (EXCLUDED_BY_POLICY +
 * BOUNDARY_MANIFEST closed/excluded entries) instead of duplicating it.
 */
import { AgentType } from '../types';

/**
 * Agents that call the private Cloud Run backend (GIS/BigQuery lookups,
 * RTKLIB wrapper, NodeODM, browser automation) and have no local/BYOK path.
 * Kept out of the OSS build per data/openSourceBoundary.ts policy.
 */
export const OSS_EXCLUDED_AGENTS: AgentType[] = [
  AgentType.GNSS_AGENT,       // RTKLIB wrapper — EXCLUDED_BY_POLICY['gnss-rinex']
  AgentType.DRONE_AGENT,      // NodeODM/AGPL — EXCLUDED_BY_POLICY['drone-agent']
  AgentType.ZONING_AGENT,     // Needs backend Claw browser automation + Serper/CSE keys
  AgentType.FLOOD_AGENT,      // Needs backend FEMA NFHL proxy
  AgentType.STRUCTURES_AGENT, // Needs backend NSI/ArcGIS proxy
  AgentType.SOILS_AGENT,      // Needs backend SSURGO proxy
];

export function isAgentOssExcluded(agent: AgentType): boolean {
  return OSS_EXCLUDED_AGENTS.includes(agent);
}
