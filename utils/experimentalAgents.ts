import { AgentType } from '../types';

/**
 * Experimental Roading Agent opt-in.
 *
 * Roading can take road drawing away from Civil Drafter, so it is off until the
 * user explicitly enables it on this browser. The flag is intentionally local:
 * one user opting in must not turn the agent on for everyone.
 */
export const EXPERIMENTAL_ROADING_STORAGE_KEY = 'landsurv.experimental.roading.enabled';

export const EXPERIMENTAL_ROADING_WARNING =
  'Roading Agent is experimental and disabled by default. When enabled it can take road drawing over from Civil Drafter and may produce inferior linework. Enable it only for evaluation.';

const EXPERIMENTAL_AGENTS_CHANGED_EVENT = 'experimental-agents-changed';

let cachedRoadingEnabled: boolean | null = null;

function readRoaringFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(EXPERIMENTAL_ROADING_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** True when the agent is available. Every non-experimental agent is available. */
export function isExperimentalAgentEnabled(agent: AgentType): boolean {
  if (agent !== AgentType.ROADING_AGENT) return true;
  if (cachedRoadingEnabled === null) cachedRoadingEnabled = readRoaringFlag();
  return cachedRoadingEnabled;
}

/** Persist the opt-in and notify mounted UI so it appears/disappears immediately. */
export function setExperimentalAgentEnabled(agent: AgentType, enabled: boolean): void {
  if (agent !== AgentType.ROADING_AGENT) return;
  cachedRoadingEnabled = enabled;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(EXPERIMENTAL_ROADING_STORAGE_KEY, enabled ? '1' : '0');
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
    if (event.key !== null && event.key !== EXPERIMENTAL_ROADING_STORAGE_KEY) return;
    cachedRoadingEnabled = null;
    callback();
  };
  window.addEventListener(EXPERIMENTAL_AGENTS_CHANGED_EVENT, handler);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EXPERIMENTAL_AGENTS_CHANGED_EVENT, handler);
    window.removeEventListener('storage', onStorage);
  };
}
