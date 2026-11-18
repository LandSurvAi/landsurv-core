import { getProviderApiKey, type ByokProvider } from './providerKeys.ts';
import { isDemoApiKey } from './proxyGenAI.ts';

/**
 * Free CAD trial metering decision.
 *
 * Kept apart from App.tsx so the entitlement rules that decide whether a turn
 * spends one of the 20 lifetime prompts are directly testable.
 *
 * A verified LandSurv enabling key, active service access, or superuser is a
 * paid entitlement and never spends the trial allowance (FREE-CAD-TRIAL spec
 * §13.4). A BYOK key saved while the device is still Free CAD does NOT exempt
 * the trial: inference stays on the trial allowance until the TOS gate moves
 * the device to Business CAD (§11.5). The saved key is still surfaced so the
 * cutoff UI can offer the signature instead of asking for a key again.
 */

export interface TrialEntitlementInput {
  isSuperUser?: boolean;
  hasLandSurvKey?: boolean;
  hasServiceAccess?: boolean;
}

export interface StoredKeyInput {
  userApiKey?: string | null;
  openaiApiKey?: string | null;
  xaiApiKey?: string | null;
  anthropicApiKey?: string | null;
}

export type ProviderKeyLookup = (provider: ByokProvider) => string | null;

export interface FreeCadTrialGateInput extends TrialEntitlementInput, StoredKeyInput {
  isFreeCadActive: boolean;
  /** Injected in tests; defaults to the provider localStorage slots. */
  lookupProviderKey?: ProviderKeyLookup;
}

export interface FreeCadTrialGate {
  /** True when this turn must spend one of the 20 lifetime trial prompts. */
  metered: boolean;
  /** True when a BYOK provider key is already saved on this device. */
  hasStoredByokKey: boolean;
}

function nonEmpty(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

/** Paid entitlements bypass the Free CAD prompt meter entirely. */
export function isTrialMeterExempt(input: TrialEntitlementInput): boolean {
  return Boolean(input.isSuperUser || input.hasLandSurvKey || input.hasServiceAccess);
}

/**
 * True when a BYOK provider key (Google/OpenAI/xAI/Anthropic) is stored.
 * A LandSurv `lsa_…` key is an entitlement, not a BYOK key, and is ignored
 * here; an empty or whitespace-only entry is not a saved key.
 */
export function hasStoredByokKey(
  input: StoredKeyInput,
  lookupProviderKey: ProviderKeyLookup = getProviderApiKey,
): boolean {
  if (isByokValue(input.userApiKey) || isByokValue(lookupProviderKey('google'))) return true;
  if (nonEmpty(input.openaiApiKey) || nonEmpty(input.xaiApiKey) || nonEmpty(input.anthropicApiKey)) {
    return true;
  }
  return nonEmpty(lookupProviderKey('openai'))
    || nonEmpty(lookupProviderKey('xai'))
    || nonEmpty(lookupProviderKey('anthropic'));
}

/** A real BYOK key: not empty, not a LandSurv `lsa_…` entitlement key. */
function isByokValue(value: string | null | undefined): boolean {
  const key = value?.trim() ?? '';
  return key.length > 0 && !isDemoApiKey(key) && !key.startsWith('lsa_');
}

/** Resolve the trial gate once per user prompt. */
export function resolveFreeCadTrialGate(input: FreeCadTrialGateInput): FreeCadTrialGate {
  const hasStoredKey = hasStoredByokKey(input, input.lookupProviderKey ?? getProviderApiKey);
  return {
    metered: Boolean(input.isFreeCadActive) && !isTrialMeterExempt(input),
    hasStoredByokKey: hasStoredKey,
  };
}
