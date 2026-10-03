/**
 * Experimental Gemini 3 configuration shared between the controls panel
 * (components/Gemini3ControlsPanel.tsx) and the chat factory
 * (services/geminiService.ts).
 *
 * The active config is exposed as `window.__gemini3Config` so the chat
 * factory can read it without threading state through every call site.
 * It is intentionally scoped to Vertex-only Gemini 3.x preview models;
 * everything is a no-op when the active model isn't a Gemini 3.x model.
 */

export type ThinkingLevel = 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH';
export type MediaResolution = 'UNSPECIFIED' | 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA_HIGH';

export interface Gemini3Config {
  enabled: boolean;
  thinkingLevel: ThinkingLevel;
  mediaResolution: MediaResolution;
  temperature: number;          // 0.0 - 2.0, default 1.0
  maxOutputTokens: number;      // Gemini 3 caps at 64000
  systemPromptAddendum: string; // appended to the agent's system instruction
}

export const DEFAULT_GEMINI3_CONFIG: Gemini3Config = {
  enabled: false,
  thinkingLevel: 'MEDIUM',
  mediaResolution: 'MEDIUM',
  temperature: 1.0,
  maxOutputTokens: 16384,
  systemPromptAddendum: '',
};

const STORAGE_KEY = 'landsurv_gemini3_config';
const DEFAULTS_VERSION = 2;

type StoredGemini3Config = Partial<Gemini3Config> & { defaultsVersion?: number };

declare global {
  // eslint-disable-next-line no-var
  var __gemini3Config: Gemini3Config | undefined;
}

/** Returns the active config or null if disabled / not set. */
export function getGemini3Config(): Gemini3Config | null {
  if (typeof window === 'undefined') return null;
  const cfg = (window as unknown as { __gemini3Config?: Gemini3Config }).__gemini3Config;
  return cfg && cfg.enabled ? cfg : null;
}

/** Persist + publish a new config. */
export function setGemini3Config(cfg: Gemini3Config): void {
  if (typeof window === 'undefined') return;
  (window as unknown as { __gemini3Config?: Gemini3Config }).__gemini3Config = cfg;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cfg, defaultsVersion: DEFAULTS_VERSION }));
  } catch { /* ignore quota errors */ }
}

/** Hydrate from localStorage on app start. */
export function loadGemini3Config(): Gemini3Config {
  if (typeof window === 'undefined') return DEFAULT_GEMINI3_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredGemini3Config;
      const { defaultsVersion, ...savedConfig } = parsed;
      const merged: Gemini3Config = { ...DEFAULT_GEMINI3_CONFIG, ...savedConfig };
      // Existing installs persisted the former HIGH/HIGH defaults simply by
      // opening the panel. Move them to balanced once; subsequent user choices
      // carry the current version and are preserved.
      const hasLegacyHighDefaults = defaultsVersion !== DEFAULTS_VERSION
        && parsed.thinkingLevel === 'HIGH'
        && parsed.mediaResolution === 'HIGH';
      if (hasLegacyHighDefaults) {
        merged.thinkingLevel = DEFAULT_GEMINI3_CONFIG.thinkingLevel;
        merged.mediaResolution = DEFAULT_GEMINI3_CONFIG.mediaResolution;
      }
      if (defaultsVersion !== DEFAULTS_VERSION) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...merged, defaultsVersion: DEFAULTS_VERSION }));
      }
      (window as unknown as { __gemini3Config?: Gemini3Config }).__gemini3Config = merged;
      return merged;
    }
  } catch { /* fall through */ }
  (window as unknown as { __gemini3Config?: Gemini3Config }).__gemini3Config = DEFAULT_GEMINI3_CONFIG;
  return DEFAULT_GEMINI3_CONFIG;
}

/**
 * Translates the user-facing config into the SDK's `generationConfig` shape
 * that the Vertex backend forwards to `ai.models.generateContentStream`.
 */
export function buildVertexGenerationConfig(cfg: Gemini3Config): Record<string, unknown> {
  const out: Record<string, unknown> = {
    temperature: cfg.temperature,
    maxOutputTokens: cfg.maxOutputTokens,
  };

  // Gemini 3 thinking_level supersedes the legacy thinkingBudget. Mixing them
  // returns a 400, so we only set thinking_level here.
  out.thinkingConfig = { thinkingLevel: cfg.thinkingLevel };

  if (cfg.mediaResolution !== 'UNSPECIFIED') {
    out.mediaResolution = `MEDIA_RESOLUTION_${cfg.mediaResolution}`;
  }

  return out;
}
