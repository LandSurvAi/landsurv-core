/**
 * Civil Drafter context-management configuration.
 *
 * The Civil Drafter chat re-sends its entire prior conversation on every turn
 * (the underlying SDK Chat objects retain history internally). With a large
 * point database and vision imagery attached to each draw request, that
 * history grows until a request exceeds the model's maximum *input* token
 * window and the API returns a 400. Back-to-back one-off requests
 * ("draw roads", then "draw treelines", then "draw driveway") should each be
 * able to run with a clean context instead of accumulating.
 *
 * This module holds the user-facing knobs (rendered by
 * components/CivilDrafterContextPanel.tsx) that let the host decide how much
 * context to carry between Civil Drafter turns. The active config is published
 * to `window.__civilDrafterContextConfig` and mirrored to localStorage so it
 * survives reloads. When `enabled` is false, `getCivilDrafterContextConfig()`
 * returns null and the host falls back to the legacy full-buildup behavior.
 */

export interface CivilDrafterContextConfig {
  /** Master switch. When off, the host uses legacy behavior (full buildup). */
  enabled: boolean;
  /**
   * Rebuild the Civil Drafter chat (clearing conversation memory) before each
   * draw-intent message so every "draw X" request starts from a clean context:
   * system prompt + point database + imagery + this one instruction.
   */
  freshContextPerDraw: boolean;
  /**
   * Automatically clear conversation memory once this many Civil Drafter turns
   * have accumulated since the last reset. 0 disables the auto-reset.
   */
  autoResetTurns: number;
  /**
   * Embed the full point database block on every Civil Drafter turn. The loaded
   * file content is already baked into the system prompt, so turning this off
   * greatly reduces per-turn input size when the database is large.
   */
  includePointDatabase: boolean;
  /**
   * Attach the multi-zoom gimbal vision frames and NAIP aerial to draw-intent
   * messages. Images are token-expensive; turn off to keep requests small.
   */
  attachVisionImagery: boolean;
}

export interface CivilDrafterContextVolume {
  /** Fixed loaded-file text that remains in the system prompt after resets. */
  fixedTextChars: number;
  /** User/model text retained by the underlying chat object. */
  retainedTextChars: number;
  /** Base64-decoded bytes of images retained in chat history. */
  retainedImageBytes: number;
  retainedImageCount: number;
  retainedTurns: number;
  lastRequestTextChars: number;
  lastRequestImageBytes: number;
  lastRequestImageCount: number;
  resetCount: number;
}

export const EMPTY_CIVIL_DRAFTER_CONTEXT_VOLUME: CivilDrafterContextVolume = {
  fixedTextChars: 0,
  retainedTextChars: 0,
  retainedImageBytes: 0,
  retainedImageCount: 0,
  retainedTurns: 0,
  lastRequestTextChars: 0,
  lastRequestImageBytes: 0,
  lastRequestImageCount: 0,
  resetCount: 0,
};

export const DEFAULT_CIVIL_DRAFTER_CONTEXT_CONFIG: CivilDrafterContextConfig = {
  enabled: true,
  freshContextPerDraw: true,
  autoResetTurns: 0,
  includePointDatabase: true,
  attachVisionImagery: true,
};

const STORAGE_KEY = 'landsurv_civil_drafter_context_config';

type StoredConfig = Partial<CivilDrafterContextConfig>;

declare global {
   
  var __civilDrafterContextConfig: CivilDrafterContextConfig | undefined;
}

const clampTurns = (n: unknown): number => {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.min(v, 50);
};

/** Returns the active config, or null when context management is disabled. */
export function getCivilDrafterContextConfig(): CivilDrafterContextConfig | null {
  if (typeof window === 'undefined') return null;
  const cfg = (window as unknown as { __civilDrafterContextConfig?: CivilDrafterContextConfig }).__civilDrafterContextConfig;
  return cfg && cfg.enabled ? cfg : null;
}

/** Persist + publish a new config. */
export function setCivilDrafterContextConfig(cfg: CivilDrafterContextConfig): void {
  if (typeof window === 'undefined') return;
  const normalized: CivilDrafterContextConfig = { ...cfg, autoResetTurns: clampTurns(cfg.autoResetTurns) };
  (window as unknown as { __civilDrafterContextConfig?: CivilDrafterContextConfig }).__civilDrafterContextConfig = normalized;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch { /* ignore quota errors */ }
}

/** Hydrate from localStorage on app start. */
export function loadCivilDrafterContextConfig(): CivilDrafterContextConfig {
  if (typeof window === 'undefined') return DEFAULT_CIVIL_DRAFTER_CONTEXT_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredConfig;
      const merged: CivilDrafterContextConfig = {
        ...DEFAULT_CIVIL_DRAFTER_CONTEXT_CONFIG,
        ...parsed,
        autoResetTurns: clampTurns(parsed.autoResetTurns ?? DEFAULT_CIVIL_DRAFTER_CONTEXT_CONFIG.autoResetTurns),
      };
      (window as unknown as { __civilDrafterContextConfig?: CivilDrafterContextConfig }).__civilDrafterContextConfig = merged;
      return merged;
    }
  } catch { /* fall through */ }
  (window as unknown as { __civilDrafterContextConfig?: CivilDrafterContextConfig }).__civilDrafterContextConfig = DEFAULT_CIVIL_DRAFTER_CONTEXT_CONFIG;
  return DEFAULT_CIVIL_DRAFTER_CONTEXT_CONFIG;
}
