import { AgentType } from '../types';

/**
 * Experimental agent opt-ins.
 *
 * Roading can take road drawing away from Civil Drafter, and Stormwater is a
 * preliminary H&H tool that still needs jurisdiction review. Both are off until
 * the user explicitly enables them on this browser. Redline is experimental but
 * ships available so its homepage/sidebar entry opens the agent instead of
 * bouncing to Settings; it can be turned off in Settings. The flags are local:
 * one user opting in must not turn an agent on for everyone.
 */
export const EXPERIMENTAL_ROADING_STORAGE_KEY = 'landsurv.experimental.roading.enabled';
export const EXPERIMENTAL_STORMWATER_STORAGE_KEY = 'landsurv.experimental.stormwater.enabled';
export const EXPERIMENTAL_REDLINE_STORAGE_KEY = 'landsurv.experimental.redline.enabled';

export const EXPERIMENTAL_ROADING_WARNING =
  'Roading Agent is experimental and disabled by default. When enabled it can take road drawing over from Civil Drafter and may produce inferior linework. Enable it only for evaluation.';

export const EXPERIMENTAL_STORMWATER_WARNING =
  'Stormwater Agent is experimental and disabled by default. It uses NOAA Atlas 14 rainfall, simplified Rational Method hydrology, and preliminary level-pool routing. Results are screening-level and must be verified by a licensed engineer against the local stormwater manual.';

export const EXPERIMENTAL_REDLINE_WARNING =
  'Redline Agent is experimental. It reads marked-up plan PDFs and can modify drawing text and linework. Markup interpretation and entity matching can be wrong; review every applied correction before issuing a drawing. It is available by default and can be turned off here.';

const EXPERIMENTAL_AGENTS_CHANGED_EVENT = 'experimental-agents-changed';

const STORAGE_KEY_BY_AGENT: Partial<Record<AgentType, string>> = {
  [AgentType.ROADING_AGENT]: EXPERIMENTAL_ROADING_STORAGE_KEY,
  [AgentType.STORMWATER_AGENT]: EXPERIMENTAL_STORMWATER_STORAGE_KEY,
  [AgentType.REDLINE_AGENT]: EXPERIMENTAL_REDLINE_STORAGE_KEY,
};

export interface ExperimentalAgentDetails {
  label: string;
  summary: string;
  warning: string;
  capabilities: string[];
}

/**
 * Copy shared by the A2UI opt-in dialog, the Quick Thought chip, and Settings.
 * Keeping it here means every entry point explains the same risks.
 */
export const EXPERIMENTAL_AGENT_DETAILS: Partial<Record<AgentType, ExperimentalAgentDetails>> = {
  [AgentType.ROADING_AGENT]: {
    label: 'Roading Agent',
    summary: 'Designs and draws roads from survey shots, background imagery, and OpenStreetMap ways.',
    warning: EXPERIMENTAL_ROADING_WARNING,
    capabilities: [
      'Synthesizes an existing road from EP / EOP / CL / CURB / TBC / ROW shots.',
      'Builds parametric corridors, typical sections, profiles, and cross sections.',
      'While enabled it can take road drawing over from Civil Drafter.',
    ],
  },
  [AgentType.STORMWATER_AGENT]: {
    label: 'Stormwater Agent',
    summary: 'Runs preliminary runoff, detention, and channel-capacity checks with NOAA Atlas 14 rainfall.',
    warning: EXPERIMENTAL_STORMWATER_WARNING,
    capabilities: [
      'Rational Method runoff with area-weighted composite coefficients.',
      'Modified Rational hydrographs and level-pool detention routing.',
      'Manning channel and pipe capacity screening.',
    ],
  },
  [AgentType.REDLINE_AGENT]: {
    label: 'Redline Agent',
    summary: 'Turns reviewer markup on annotated plan PDFs into a numbered correction worklist.',
    warning: EXPERIMENTAL_REDLINE_WARNING,
    capabilities: [
      'Reads revision clouds, callouts, notes, arrows, highlights, and dimensions.',
      'Calibrates each sheet and matches every mark to drawing entities with explicit confidence.',
      'Applies only approved corrections through the Civil Drafter, with per-item undo.',
    ],
  },
};

export function isExperimentalAgent(agent: AgentType): boolean {
  return Boolean(STORAGE_KEY_BY_AGENT[agent]);
}

export function getExperimentalAgentDetails(agent: AgentType): ExperimentalAgentDetails | null {
  return EXPERIMENTAL_AGENT_DETAILS[agent] ?? null;
}

/**
 * Experimental agents that are available until the user opts out. Redline is
 * useful on first contact (its card should open the agent), so an absent flag
 * means enabled; Settings can still store an explicit `0` to turn it off.
 */
const DEFAULT_ENABLED_AGENTS: ReadonlySet<AgentType> = new Set([AgentType.REDLINE_AGENT]);

const cachedEnabled = new Map<AgentType, boolean>();

function readFlag(agent: AgentType): boolean {
  const key = STORAGE_KEY_BY_AGENT[agent];
  if (!key) return false;
  const fallback = DEFAULT_ENABLED_AGENTS.has(agent);
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return fallback;
    return stored === '1';
  } catch {
    return fallback;
  }
}

/** True when the agent is available. Every non-experimental agent is available. */
export function isExperimentalAgentEnabled(agent: AgentType): boolean {
  if (!STORAGE_KEY_BY_AGENT[agent]) return true;
  if (!cachedEnabled.has(agent)) cachedEnabled.set(agent, readFlag(agent));
  return cachedEnabled.get(agent) === true;
}

/** Persist the opt-in and notify mounted UI so it appears/disappears immediately. */
export function setExperimentalAgentEnabled(agent: AgentType, enabled: boolean): void {
  const key = STORAGE_KEY_BY_AGENT[agent];
  if (!key) return;
  cachedEnabled.set(agent, enabled);
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, enabled ? '1' : '0');
  } catch {
    /* storage disabled — the in-memory flag still applies this session */
  }
  window.dispatchEvent(
    new CustomEvent(EXPERIMENTAL_AGENTS_CHANGED_EVENT, { detail: { agent, enabled } }),
  );
}

/** Subscribe to opt-in changes in this tab or another tab. */
export function subscribeExperimentalAgents(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => callback();
  const onStorage = (event: StorageEvent) => {
    if (
      event.key !== null &&
      event.key !== EXPERIMENTAL_ROADING_STORAGE_KEY &&
      event.key !== EXPERIMENTAL_STORMWATER_STORAGE_KEY &&
      event.key !== EXPERIMENTAL_REDLINE_STORAGE_KEY
    ) {
      return;
    }
    cachedEnabled.clear();
    callback();
  };
  window.addEventListener(EXPERIMENTAL_AGENTS_CHANGED_EVENT, handler);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EXPERIMENTAL_AGENTS_CHANGED_EVENT, handler);
    window.removeEventListener('storage', onStorage);
  };
}
