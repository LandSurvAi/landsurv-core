import { AgentType } from '../types';

/**
 * Experimental agent opt-ins.
 *
 * Roading can take road drawing away from Civil Drafter, and Stormwater is a
 * preliminary H&H tool that still needs jurisdiction review. Both are off until
 * the user explicitly enables them on this browser. The flags are local: one
 * user opting in must not turn an agent on for everyone.
 */
export const EXPERIMENTAL_ROADING_STORAGE_KEY = 'landsurv.experimental.roading.enabled';
export const EXPERIMENTAL_STORMWATER_STORAGE_KEY = 'landsurv.experimental.stormwater.enabled';

export const EXPERIMENTAL_ROADING_WARNING =
  'Roading Agent is experimental and disabled by default. When enabled it can take road drawing over from Civil Drafter and may produce inferior linework. Enable it only for evaluation.';

export const EXPERIMENTAL_STORMWATER_WARNING =
  'Stormwater Agent is experimental and disabled by default. It uses NOAA Atlas 14 rainfall, simplified Rational Method hydrology, and preliminary level-pool routing. Results are screening-level and must be verified by a licensed engineer against the local stormwater manual.';

const EXPERIMENTAL_AGENTS_CHANGED_EVENT = 'experimental-agents-changed';

const STORAGE_KEY_BY_AGENT: Partial<Record<AgentType, string>> = {
  [AgentType.ROADING_AGENT]: EXPERIMENTAL_ROADING_STORAGE_KEY,
  [AgentType.STORMWATER_AGENT]: EXPERIMENTAL_STORMWATER_STORAGE_KEY,
};

const cachedEnabled = new Map<AgentType, boolean>();

function readFlag(agent: AgentType): boolean {
  const key = STORAGE_KEY_BY_AGENT[agent];
  if (!key || typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
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
      event.key !== EXPERIMENTAL_STORMWATER_STORAGE_KEY
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
