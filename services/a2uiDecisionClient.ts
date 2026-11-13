/**
 * Browser-side A2UI Decision 1 shadow client.
 *
 * Invariants:
 * - Never changes the UI. The result is telemetry only.
 * - Never holds or sends a Gemini key.
 * - Never blocks the chat turn. Failures are silent.
 * - Disabled in OSS builds and unless the DevOps feature flag is on.
 *
 * Sampling happens on the backend. This client sends every eligible turn so
 * the backend can measure the full volume and decide the 10% sample centrally.
 */

import {
  A2UI_DECISION_CATALOG_VERSION,
  buildA2UIDecisionState,
  type A2UIDecisionState,
  type A2UIDecisionStateInput,
} from './a2uiDecisionCatalog.ts';
import { getGlobalSettings } from '../utils/globalSettings.ts';
import { isOssBuild } from '../utils/ossMode.ts';

export interface A2UIDecisionShadowInput {
  utterance: string;
  state: A2UIDecisionStateInput;
  regexSurface: string | null;
  /** Developer inspector only; the backend honors this only when its debug gate is on. */
  debug?: boolean;
}

export interface A2UIDecisionShadowEventInput {
  utterance: string;
  regexSurface: string | null;
  state: A2UIDecisionState;
  debug: boolean;
}

export interface A2UIDecisionShadowEvent {
  input: A2UIDecisionShadowEventInput;
  httpStatus: number | null;
  response: unknown;
  error: string | null;
  receivedAt: number;
  roundTripMs: number;
}

type A2UIDecisionShadowListener = (event: A2UIDecisionShadowEvent) => void;
const inspectorListeners = new Set<A2UIDecisionShadowListener>();

/**
 * Subscribe to shadow results for the developer inspector. Listeners receive
 * every response the client sees, including sampled-out and error outcomes.
 */
export function subscribeA2UIDecisionInspector(
  listener: A2UIDecisionShadowListener,
): () => void {
  inspectorListeners.add(listener);
  return () => {
    inspectorListeners.delete(listener);
  };
}

/** Exported for the inspector and focused tests; production code should not publish directly. */
export function publishA2UIDecisionShadowEvent(event: A2UIDecisionShadowEvent): void {
  for (const listener of inspectorListeners) {
    try {
      listener(event);
    } catch {
      // A broken debug listener must never affect the chat turn.
    }
  }
}

const SESSION_STORAGE_KEY = 'landsurv-a2ui-decision-session';
const DEFAULT_BACKEND = 'https://landsurv-backend-y55gmt77ga-uw.a.run.app';

function resolveApiBase(): string {
  if (typeof window === 'undefined') return DEFAULT_BACKEND;
  const host = window.location.hostname.toLowerCase();
  const isLocal =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.localhost');
  const isFirstParty = host === 'landsurv.ai' || host.endsWith('.landsurv.ai');
  if (isLocal || isFirstParty) {
    return window.location.origin.replace(/\/$/, '');
  }
  const envBase = String((import.meta as any)?.env?.VITE_API_URL || '').trim();
  if (envBase) return envBase.replace(/\/$/, '');
  return DEFAULT_BACKEND;
}

export function getA2UIDecisionSessionHash(): string {
  if (typeof window === 'undefined') return 'server';
  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, generated);
    return generated;
  } catch {
    return 'anonymous';
  }
}

export function isA2UIDecisionShadowEnabled(): boolean {
  if (isOssBuild()) return false;
  return getGlobalSettings().featureFlags['a2ui.decision.shadow'] === true;
}

export function buildShadowState(input: A2UIDecisionStateInput): A2UIDecisionState {
  return buildA2UIDecisionState(input);
}

/**
 * Fire-and-forget. The returned promise is intentionally not exposed to the
 * caller; the UI must never await a shadow decision.
 */
export function evaluateA2UIDecisionShadow(input: A2UIDecisionShadowInput): void {
  if (typeof window === 'undefined') return;
  if (isOssBuild()) return;
  if (!isA2UIDecisionShadowEnabled()) return;

  const utterance = input.utterance.trim();
  if (utterance.length < 6 || utterance.length > 2000) return;

  const state = buildShadowState(input.state);
  const debug = input.debug === true;
  const body = {
    mode: 'shadow',
    catalogVersion: A2UI_DECISION_CATALOG_VERSION,
    sessionHash: getA2UIDecisionSessionHash(),
    utterance,
    state,
    regexSurface: input.regexSurface,
    debug,
    appVersion: String((import.meta as any)?.env?.VITE_APP_VERSION || ''),
  };
  const startedAt = Date.now();
  const eventInput: A2UIDecisionShadowEventInput = {
    utterance,
    regexSurface: input.regexSurface,
    state,
    debug,
  };

  void fetch(`${resolveApiBase()}/api/decisions/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  })
    .then(async response => {
      const responseBody = await response.json().catch(() => null);
      publishA2UIDecisionShadowEvent({
        input: eventInput,
        httpStatus: response.status,
        response: responseBody,
        error: null,
        receivedAt: Date.now(),
        roundTripMs: Date.now() - startedAt,
      });
    })
    .catch((error: unknown) => {
      // Shadow failures are deliberately silent for the UI. The inspector still
      // sees them so a developer can diagnose the pilot without reading the network tab.
      publishA2UIDecisionShadowEvent({
        input: eventInput,
        httpStatus: null,
        response: null,
        error: error instanceof Error ? error.message : 'network error',
        receivedAt: Date.now(),
        roundTripMs: Date.now() - startedAt,
      });
    });
}
