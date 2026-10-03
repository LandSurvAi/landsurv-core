/**
 * Retired Agents Utility
 *
 * The list of agents that are hidden from public UI (homepage, sidebar) is
 * now a *world-wide* setting controlled from the DevOps Console and stored
 * in the backend `global_settings` table. See utils/globalSettings.ts.
 *
 * This module is the read-side facade everywhere in the app:
 *   - `getRetiredAgents()` returns the current effective list (server cache,
 *     then localStorage cache, then defaults).
 *   - `isAgentRetired(agent)` is a convenience wrapper.
 *   - The `retired-agents-changed` window event still fires when the server
 *     push lands, so existing Sidebar / InitialAgentSelection subscribers
 *     work without modification.
 *
 * Local overrides via the legacy `setRetiredAgents()` are still supported
 * but discouraged — they only affect the current browser. Admin changes
 * should go through the DevOps Console which calls
 * `utils/globalSettings.saveGlobalSettings()` to update the world.
 */

import { AgentType } from '../types';
import { getGlobalSettings } from './globalSettings';
import { agentConfig } from '../constants/agents';
import { isOssBuild } from './ossMode';
import { OSS_EXCLUDED_AGENTS } from '../data/ossFeatureGates';

const LOCAL_OVERRIDE_KEY = 'landsurv-retired-agents';

// Same defaults as the backend seed in backend/src/utils/database.ts so the
// very first boot (before the public-settings fetch returns) still hides
// the same agents the world would have hidden anyway.
const DEFAULT_RETIRED_AGENTS: AgentType[] = [
  AgentType.RAW_CRAWLER,
  AgentType.IMAGE_ANALYZER,
];

/**
 * Get the effective list of retired agents.
 *
 * Resolution order:
 *   1. Server-pushed global settings (utils/globalSettings cache)
 *   2. Legacy localStorage override (if a user set one before we migrated)
 *   3. Built-in defaults
 */
export function getRetiredAgents(): AgentType[] {
  // OSS/local-mode build: always hide backend-only agents, regardless of
  // server-pushed settings (there is no server to push settings from).
  const ossExtra = isOssBuild() ? OSS_EXCLUDED_AGENTS : [];
  const merge = (base: AgentType[]) => Array.from(new Set([...base, ...ossExtra]));

  // 1) Server-pushed world state. The cache always has *something* loaded
  //    (defaults at minimum), so this is the primary source on every request
  //    after app boot completes.
  const global = getGlobalSettings();
  if (Array.isArray(global.retiredAgents) && global.retiredAgents.length > 0) {
    return merge(global.retiredAgents as AgentType[]);
  }

  // 2) Legacy per-browser override (kept for backwards compatibility with
  //    anything that may have called setRetiredAgents() before the migration).
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(LOCAL_OVERRIDE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return merge(parsed);
      }
    } catch {
      /* fall through */
    }
  }

  return merge(DEFAULT_RETIRED_AGENTS);
}

/**
 * Local-only override. Kept as an escape hatch for development; the DevOps
 * Console uses utils/globalSettings.saveGlobalSettings() instead so the
 * change is visible to every user.
 */
export function setRetiredAgents(agents: AgentType[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LOCAL_OVERRIDE_KEY, JSON.stringify(agents));
  window.dispatchEvent(new CustomEvent('retired-agents-changed', { detail: agents }));
}

/**
 * Check if a specific agent is retired.
 */
export function isAgentRetired(agent: AgentType): boolean {
  return getRetiredAgents().includes(agent);
}

/**
 * The complete set of real agent cards on the homepage. Functional homepage
 * controls are intentionally excluded because they are not agents.
 */
export const HOMEPAGE_AGENT_TYPES = [
  AgentType.DEED_READER,
  AgentType.POINT_EDITOR,
  AgentType.CAD_MANAGER,
  AgentType.STANDARDS_COMPLIANCE,
  AgentType.RAW_CRAWLER,
  AgentType.CIVIL_DRAFTER,
  AgentType.CENTERLINE_STATIONING,
  AgentType.PROFILE_AGENT,
  AgentType.CIVIL_PLAN_EXPERT,
  AgentType.DXF_ANALYZER,
  AgentType.GIS_AGENT,
  AgentType.GPS_STAKEOUT,
  AgentType.CONTOURING_AGENT,
  AgentType.STEEP_SLOPE_AGENT,
  AgentType.GNSS_AGENT,
  AgentType.DRONE_AGENT,
  AgentType.COGO_AGENT,
  AgentType.IMAGE_ANALYZER,
  AgentType.AR_AGENT,
  AgentType.ZONING_AGENT,
  AgentType.TITLE_SEARCH,
  AgentType.FLOOD_AGENT,
  AgentType.STRUCTURES_AGENT,
  AgentType.SOILS_AGENT,
] as const;

export type HomepageAgentType = (typeof HOMEPAGE_AGENT_TYPES)[number];

/**
 * The DevOps retirement controls are derived from the homepage catalog so
 * every public agent, including compute-backed agents, can be retired.
 */
export const retirableAgents: { type: HomepageAgentType; label: string; color: string }[] =
  HOMEPAGE_AGENT_TYPES.map((type) => {
    const config = agentConfig[type];
    if (!config) {
      throw new Error(`Missing agent UI configuration for retireable agent: ${type}`);
    }
    return { type, label: config.label, color: config.color };
  });
