/**
 * providerKeys — detection, storage, and lookup for user-supplied
 * ("bring your own key") AI provider credentials.
 *
 * Supported providers:
 *  - LandSurv native keys (`lsa_…`) — verified against the LandSurv backend
 *  - Google AI Studio (`AIza…`)     — Gemini, browser-direct (legacy behavior)
 *  - OpenAI (`sk-…`)                — GPT models, browser-direct
 *  - xAI (`xai-…`)                  — Grok models, browser-direct
 *  - Anthropic (`sk-ant-…`)         — Claude first-party API, browser-direct
 *
 * Keys are stored in per-provider localStorage slots and NEVER sent to the
 * LandSurv backend. Only the Google/LandSurv slot (`landsurv_user_api_key`)
 * may be attached to LandSurv API requests (see services/apiAuth.ts).
 */

export type ByokProvider = 'google' | 'openai' | 'xai' | 'anthropic';
export type KnownKeyProvider = ByokProvider | 'landsurv';

/** localStorage slot for each BYOK provider. The Google slot is the legacy
 *  `landsurv_user_api_key`, which also holds `lsa_…` LandSurv keys. */
export const PROVIDER_KEY_STORAGE: Record<ByokProvider, string> = {
  google: 'landsurv_user_api_key',
  openai: 'landsurv_openai_api_key',
  xai: 'landsurv_xai_api_key',
  anthropic: 'landsurv_anthropic_api_key',
};

export const PROVIDER_LABELS: Record<KnownKeyProvider, string> = {
  landsurv: 'LandSurv Enabling Key',
  google: 'Google AI Studio (Gemini)',
  openai: 'OpenAI',
  xai: 'xAI (Grok)',
  anthropic: 'Anthropic (Claude)',
};

/** Where users can create/manage keys for each BYOK provider. */
export const PROVIDER_KEY_URLS: Record<ByokProvider, string> = {
  google: 'https://aistudio.google.com/apikey',
  openai: 'https://platform.openai.com/api-keys',
  xai: 'https://console.x.ai/',
  anthropic: 'https://console.anthropic.com/settings/keys',
};

/**
 * Strict provider detection from the key's well-known prefix.
 * Returns null when the format is not recognized.
 */
export function detectKeyProvider(apiKey: string): KnownKeyProvider | null {
  const key = apiKey.trim();
  if (!key) return null;
  if (key.startsWith('lsa_')) return 'landsurv';
  if (key.startsWith('AIza')) return 'google';
  // Anthropic before generic sk-: Anthropic keys are sk-ant-…
  if (key.startsWith('sk-ant-')) return 'anthropic';
  if (key.startsWith('xai-')) return 'xai';
  if (key.startsWith('sk-')) return 'openai';
  return null;
}

/**
 * Detection with the historical fallback: unrecognized formats were
 * previously treated as Google AI Studio keys, so keep that behavior
 * rather than breaking existing users.
 */
export function resolveKeyProvider(apiKey: string): KnownKeyProvider {
  return detectKeyProvider(apiKey) ?? 'google';
}

function storageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

/** Read the stored key for a BYOK provider (null when absent). */
export function getProviderApiKey(provider: ByokProvider): string | null {
  if (!storageAvailable()) return null;
  return localStorage.getItem(PROVIDER_KEY_STORAGE[provider]);
}

/** Persist a BYOK key into its provider slot. */
export function setProviderApiKey(provider: ByokProvider, apiKey: string): void {
  if (!storageAvailable()) return;
  localStorage.setItem(PROVIDER_KEY_STORAGE[provider], apiKey.trim());
}

/** Remove a BYOK key from its provider slot. */
export function clearProviderApiKey(provider: ByokProvider): void {
  if (!storageAvailable()) return;
  localStorage.removeItem(PROVIDER_KEY_STORAGE[provider]);
}

/** True when any BYOK provider key (including the Google/LandSurv slot) is stored. */
export function hasAnyProviderKey(): boolean {
  return (Object.keys(PROVIDER_KEY_STORAGE) as ByokProvider[])
    .some(provider => Boolean(getProviderApiKey(provider)?.trim()));
}
