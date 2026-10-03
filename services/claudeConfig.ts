/**
 * Claude 4.7 Vertex AI configuration (v26.05.19.3)
 *
 * Manages Claude model settings for Vertex AI streaming.  Config is stored in
 * localStorage so it persists across sessions without polluting the .lsvz bundle.
 *
 * The active config is published to `window.__claudeConfig` for services that
 * need to read it at call time.
 */

export type ClaudeModel = 'claude-sonnet-5' | 'claude-opus-5' | 'claude-fable-5';

// Versioned marker for customer-side acceptance of Google Advanced AI Safety Addendum
// obligations when using Claude Fable 5 via Vertex AI.
export const FABLE5_ADDENDUM_VERSION = '2026-07-01';
export const ANTHROPIC_AUP_VERSION = '2025-09-15';

export interface ClaudeConfig {
  enabled: boolean;
  model: ClaudeModel;
  /** GCP region hosting the Vertex AI endpoint. */
  region: string;
  temperature: number;
  maxTokens: number;
  systemPromptAddendum: string;
  /** Optional GCP project override (defaults to backend env). */
  gcpProject: string;
  /** User/device acknowledgement required before using Claude Fable 5. */
  fable5AddendumAccepted: boolean;
  fable5AddendumAcceptedAt: string;
  fable5AddendumVersion: string;
  /** Anthropic AUP acknowledgement for all Claude model usage. */
  anthropicAupAccepted: boolean;
  anthropicAupAcceptedAt: string;
  anthropicAupVersion: string;
}

export const DEFAULT_CLAUDE_CONFIG: ClaudeConfig = {
  enabled: false,
  model: 'claude-sonnet-5',
  region: 'us-east5',
  temperature: 1.0,
  maxTokens: 8192,
  systemPromptAddendum: '',
  gcpProject: '',
  fable5AddendumAccepted: false,
  fable5AddendumAcceptedAt: '',
  fable5AddendumVersion: '',
  anthropicAupAccepted: false,
  anthropicAupAcceptedAt: '',
  anthropicAupVersion: '',
};

const LS_KEY = 'landsurv_claude_config';

export function loadClaudeConfig(): ClaudeConfig {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULT_CLAUDE_CONFIG };
    return { ...DEFAULT_CLAUDE_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CLAUDE_CONFIG };
  }
}

/** Event name broadcast whenever the Claude config is persisted. */
export const CLAUDE_CONFIG_CHANGED_EVENT = 'claude-config-changed';

export function setClaudeConfig(cfg: ClaudeConfig): void {
  localStorage.setItem(LS_KEY, JSON.stringify(cfg));
  (window as unknown as Record<string, unknown>)['__claudeConfig'] = cfg;
  // Notify listeners (e.g. App model routing) so the active model can follow
  // the enabled/selected Claude model without the settings panel being open.
  try {
    window.dispatchEvent(new CustomEvent(CLAUDE_CONFIG_CHANGED_EVENT, { detail: cfg }));
  } catch { /* CustomEvent unsupported: ignore */ }
}

export function getClaudeConfig(): ClaudeConfig {
  const stored = (window as unknown as Record<string, unknown>)['__claudeConfig'] as ClaudeConfig | undefined;
  return stored ?? loadClaudeConfig();
}
