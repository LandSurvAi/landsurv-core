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
 * context to carry between Civil Drafter turns, how large the Surveyor's Eye
 * captures are, and how much model self-review a drafting turn may spend.
 * The active config is published to `window.__civilDrafterContextConfig` and
 * mirrored to localStorage so it survives reloads.
 */

export type SurveyorsEyeResolution = 'compact' | 'standard' | 'high';

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

  // ── Drafting behaviour ────────────────────────────────────────────────────
  /** Query approved RAG lessons before a drafting turn. */
  useDraftingLessons: boolean;
  /** Pull county parcel frontage automatically when a draw turn has none. */
  autoParcelGrounding: boolean;
  /** Look up OSM road ways as grounding evidence for a draw turn. */
  autoOsmGrounding: boolean;
  /** Re-check the committed take against the background imagery raster. */
  runSynthesisQa: boolean;
  /**
   * Model redraw/confirmation budget for the road acceptance loop. The
   * deterministic review always runs; this only caps the expensive model turns.
   * 1 = draw once with no model redraws, 3 = first take + two checks.
   */
  maxRoadTurns: number;

  // ── Surveyor's Eye ────────────────────────────────────────────────────────
  /** Raster size of each vision frame. */
  surveyorsEyeResolution: SurveyorsEyeResolution;
  /** Maximum overlapping corridor sweep frames (2–6). */
  maxCorridorFrames: number;
  /** Maximum density-zone frames (0–6). 0 disables zone frames. */
  maxZoneFrames: number;
  /** Maximum tight detail frames (0–4). 0 disables detail frames. */
  maxDetailFrames: number;
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
  useDraftingLessons: true,
  autoParcelGrounding: true,
  autoOsmGrounding: true,
  runSynthesisQa: true,
  maxRoadTurns: 3,
  surveyorsEyeResolution: 'standard',
  maxCorridorFrames: 4,
  maxZoneFrames: 3,
  maxDetailFrames: 1,
};

export const SURVEYORS_EYE_RESOLUTION_LABELS: Record<SurveyorsEyeResolution, string> = {
  compact: 'Compact · 960 × 720 (fastest)',
  standard: 'Standard · 1280 × 960 (balanced)',
  high: 'High · 1600 × 1200 (detailed)',
};

const SURVEYORS_EYE_FRAME_SIZES: Record<SurveyorsEyeResolution, { width: number; height: number }> = {
  compact: { width: 960, height: 720 },
  standard: { width: 1280, height: 960 },
  high: { width: 1600, height: 1200 },
};

export function resolveSurveyorsEyeFrameSize(
  config: Pick<CivilDrafterContextConfig, 'surveyorsEyeResolution'> | null | undefined,
): { width: number; height: number } {
  const resolution = config?.surveyorsEyeResolution;
  const key: SurveyorsEyeResolution =
    resolution === 'compact' || resolution === 'standard' || resolution === 'high'
      ? resolution
      : 'standard';
  return SURVEYORS_EYE_FRAME_SIZES[key];
}

const STORAGE_KEY = 'landsurv_civil_drafter_context_config';

type StoredConfig = Partial<CivilDrafterContextConfig>;

declare global {
  // eslint-disable-next-line no-var
  var __civilDrafterContextConfig: CivilDrafterContextConfig | undefined;
}

const clampTurns = (n: unknown): number => {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.min(v, 50);
};

const clampInt = (value: unknown, min: number, max: number, fallback: number): number => {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const isResolution = (value: unknown): value is SurveyorsEyeResolution =>
  value === 'compact' || value === 'standard' || value === 'high';

/** Clamp persisted values so a stale or hand-edited config cannot break a draw. */
export function normalizeCivilDrafterContextConfig(
  partial: StoredConfig = {},
): CivilDrafterContextConfig {
  const merged = { ...DEFAULT_CIVIL_DRAFTER_CONTEXT_CONFIG, ...partial };
  return {
    ...merged,
    autoResetTurns: clampTurns(merged.autoResetTurns),
    maxRoadTurns: clampInt(merged.maxRoadTurns, 1, 8, DEFAULT_CIVIL_DRAFTER_CONTEXT_CONFIG.maxRoadTurns),
    maxCorridorFrames: clampInt(merged.maxCorridorFrames, 2, 6, DEFAULT_CIVIL_DRAFTER_CONTEXT_CONFIG.maxCorridorFrames),
    maxZoneFrames: clampInt(merged.maxZoneFrames, 0, 6, DEFAULT_CIVIL_DRAFTER_CONTEXT_CONFIG.maxZoneFrames),
    maxDetailFrames: clampInt(merged.maxDetailFrames, 0, 4, DEFAULT_CIVIL_DRAFTER_CONTEXT_CONFIG.maxDetailFrames),
    surveyorsEyeResolution: isResolution(merged.surveyorsEyeResolution)
      ? merged.surveyorsEyeResolution
      : DEFAULT_CIVIL_DRAFTER_CONTEXT_CONFIG.surveyorsEyeResolution,
  };
}

/** Returns the active config, or null when context management is disabled. */
export function getCivilDrafterContextConfig(): CivilDrafterContextConfig | null {
  if (typeof window === 'undefined') return null;
  const cfg = (window as unknown as { __civilDrafterContextConfig?: CivilDrafterContextConfig }).__civilDrafterContextConfig;
  return cfg && cfg.enabled ? cfg : null;
}

/** Persist + publish a new config. */
export function setCivilDrafterContextConfig(cfg: CivilDrafterContextConfig): void {
  if (typeof window === 'undefined') return;
  const normalized = normalizeCivilDrafterContextConfig(cfg);
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
      const merged = normalizeCivilDrafterContextConfig(parsed);
      (window as unknown as { __civilDrafterContextConfig?: CivilDrafterContextConfig }).__civilDrafterContextConfig = merged;
      return merged;
    }
  } catch { /* fall through */ }
  (window as unknown as { __civilDrafterContextConfig?: CivilDrafterContextConfig }).__civilDrafterContextConfig = DEFAULT_CIVIL_DRAFTER_CONTEXT_CONFIG;
  return DEFAULT_CIVIL_DRAFTER_CONTEXT_CONFIG;
}
