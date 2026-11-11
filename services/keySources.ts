/**
 * Credential source definitions and key-entry intent detection.
 *
 * The key panel renders from this data so adding a provider is one definition,
 * not another bespoke form. Intent detection is deterministic: a request to
 * enter a key opens the inline key surface without spending a model turn.
 */

import {
  PROVIDER_KEY_URLS,
  type ByokProvider,
} from './providerKeys.ts';

export type KeySourceId = 'landsurv' | ByokProvider;
export type KeySourceAccent = 'emerald' | 'cyan' | 'violet' | 'amber' | 'sky';

export interface KeyDetailSnapshot {
  source: 'service' | 'google' | 'browser' | 'unknown';
  keyType: string;
  keyId?: string | null;
  keyName?: string | null;
  ownerUserId?: string | null;
  ownerEmail?: string | null;
  tier?: string | null;
  keyPurpose?: string | null;
  createdAt?: string | null;
  expiresAt?: string | null;
  activatedAt?: string | null;
  status?: 'active' | 'expired' | 'unknown';
  accessProfile?: string | null;
  permissions?: string[];
  isStoredLocally?: boolean;
}

export interface KeySourceDefinition {
  id: KeySourceId;
  /** Full provider name used in headings and status copy. */
  label: string;
  /** Compact label for chips and provider selectors. */
  shortLabel: string;
  kind: 'service' | 'byok';
  heading: string;
  description: string;
  placeholder: string;
  inputLabel: string;
  saveLabel: string;
  accent: KeySourceAccent;
  docsUrl?: string;
  permissionHint?: string;
}

export const KEY_SOURCE_DEFINITIONS: readonly KeySourceDefinition[] = [
  {
    id: 'landsurv',
    label: 'LandSurv Enabling Key',
    shortLabel: 'LandSurv',
    kind: 'service',
    heading: 'LandSurv Enabling Key',
    description: 'The key sent to your email after any subscription or credit purchase.',
    placeholder: 'lsa_...',
    inputLabel: 'LandSurv Enabling Key',
    saveLabel: 'Save LandSurv Key',
    accent: 'emerald',
    permissionHint: 'Service access + hosted inference',
  },
  {
    id: 'google',
    label: 'Google AI Studio (Gemini)',
    shortLabel: 'Google',
    kind: 'byok',
    heading: 'AI Provider Key',
    description: 'Use your own Google Gemini, OpenAI, xAI, or Anthropic key.',
    placeholder: 'AIza… · sk-… · xai-… · sk-ant-…',
    inputLabel: 'AI Provider API Key',
    saveLabel: 'Save AI Key',
    accent: 'cyan',
    docsUrl: PROVIDER_KEY_URLS.google,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    shortLabel: 'OpenAI',
    kind: 'byok',
    heading: 'AI Provider Key',
    description: 'Use your own Google Gemini, OpenAI, xAI, or Anthropic key.',
    placeholder: 'sk-…',
    inputLabel: 'AI Provider API Key',
    saveLabel: 'Save AI Key',
    accent: 'sky',
    docsUrl: PROVIDER_KEY_URLS.openai,
  },
  {
    id: 'xai',
    label: 'xAI (Grok)',
    shortLabel: 'xAI',
    kind: 'byok',
    heading: 'AI Provider Key',
    description: 'Use your own Google Gemini, OpenAI, xAI, or Anthropic key.',
    placeholder: 'xai-…',
    inputLabel: 'AI Provider API Key',
    saveLabel: 'Save AI Key',
    accent: 'violet',
    docsUrl: PROVIDER_KEY_URLS.xai,
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    shortLabel: 'Anthropic',
    kind: 'byok',
    heading: 'AI Provider Key',
    description: 'Use your own Google Gemini, OpenAI, xAI, or Anthropic key.',
    placeholder: 'sk-ant-…',
    inputLabel: 'AI Provider API Key',
    saveLabel: 'Save AI Key',
    accent: 'amber',
    docsUrl: PROVIDER_KEY_URLS.anthropic,
  },
] as const;

export const BYOK_KEY_SOURCES = KEY_SOURCE_DEFINITIONS.filter(
  (source): source is KeySourceDefinition & { id: ByokProvider } => source.kind === 'byok',
);

export function getKeySource(id: KeySourceId): KeySourceDefinition {
  return KEY_SOURCE_DEFINITIONS.find(source => source.id === id) ?? KEY_SOURCE_DEFINITIONS[0];
}

export function getByokKeySource(id: ByokProvider): KeySourceDefinition {
  return getKeySource(id);
}

const KEYBOARD_OR_FIGURATIVE_KEY_RE =
  /\b(?:keyboard|keystroke|key\s+point|key\s+takeaway|key\s+metric|key\s+insight|key\s+map|legend|api\s+key\s+format|what\s+is\s+an?\s+api\s+key)\b/i;

const CREDENTIAL_SUBJECT_RE =
  /\b(?:api\s*keys?|a\.?i\.?\s+keys?|provider\s+keys?|enabling\s+keys?|service\s+keys?|landsurv\s+keys?|gemini\s+keys?|google\s+(?:ai|api)\s+keys?|openai\s+keys?|anthropic\s+keys?|claude\s+keys?|xai\s+keys?|grok\s+keys?|byok|bring\s+your\s+own\s+key)\b/i;

const POSSESSIVE_KEY_RE =
  /\b(?:my|your)\s+(?:api\s+|ai\s+|provider\s+|landsurv\s+|enabling\s+|service\s+|gemini\s+|google\s+|openai\s+|anthropic\s+|claude\s+|xai\s+|grok\s+)?keys?\b/i;

const KEY_ACTION_RE =
  /\b(?:enter|add|paste|input|insert|update|change|replace|save|set|configure|connect|link|activate|manage|open|show|where|how)\b/i;

/**
 * True when the message is asking to enter, connect, change, or manage a
 * credential. Deliberately ignores keyboard shortcuts, legends, and other
 * figurative uses of "key".
 */
export function isKeyEntryRequest(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;

  if (KEYBOARD_OR_FIGURATIVE_KEY_RE.test(trimmed)) return false;
  if (/\bbyok\b/i.test(trimmed)) return true;
  if (
    /\b(?:key\s+(?:panel|manager|vault|settings|entry|management)|api\s+keys?\s+(?:panel|manager|settings|page))\b/i.test(
      trimmed,
    ) &&
    KEY_ACTION_RE.test(trimmed)
  ) {
    return true;
  }
  if ((CREDENTIAL_SUBJECT_RE.test(trimmed) || POSSESSIVE_KEY_RE.test(trimmed)) && KEY_ACTION_RE.test(trimmed)) {
    return true;
  }

  // Short imperative phrasings such as "enter a key" or "I need to add my key".
  return /\b(?:enter|add|paste|input|insert|save|connect|link|update|change|replace)\b[^.\n]{0,28}\b(?:api\s+|a\.?i\.?\s+|provider\s+|landsurv\s+|enabling\s+|service\s+)?keys?\b/i.test(
    trimmed,
  );
}

/** Pick the credential route named by the request, if there is one. */
export function detectKeyEntrySource(query: string): KeySourceId | undefined {
  const lower = query.toLowerCase();
  if (/\b(?:landsurv|enabling|service\s+key|lsa_)\b/.test(lower)) return 'landsurv';
  if (/\b(?:anthropic|claude|sk-ant)\b/.test(lower)) return 'anthropic';
  if (/\b(?:xai|grok)\b/.test(lower)) return 'xai';
  if (/\b(?:openai|gpt)\b/.test(lower)) return 'openai';
  if (/\b(?:google|gemini|aiza|ai\s+studio)\b/.test(lower)) return 'google';
  return undefined;
}
