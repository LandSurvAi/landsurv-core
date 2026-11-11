import React, { useState } from 'react';
import {
  Check,
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  detectKeyProvider,
  PROVIDER_LABELS,
  type ByokProvider,
} from '../services/providerKeys.ts';
import {
  BYOK_KEY_SOURCES,
  getByokKeySource,
  getKeySource,
  KEY_SOURCE_DEFINITIONS,
  type KeyDetailSnapshot,
  type KeySourceId,
} from '../services/keySources.ts';

export interface KeyManagementPanelProps {
  /** Modal content or the inline A2UI surface presentation. */
  variant?: 'modal' | 'surface';
  currentKeyDetails?: KeyDetailSnapshot | null;
  hasLandSurvKey?: boolean;
  hasGoogleApiKey?: boolean;
  hasServiceAccess?: boolean;
  serviceAccessExpiresAt?: string | null;
  computeCredits?: number;
  /** Pre-select a provider when the user named one in chat. */
  initialSource?: KeySourceId;
  /** Which BYOK providers currently have a stored key. */
  connectedProviders?: Partial<Record<ByokProvider, boolean>>;
  onSubmitApiKey: (apiKey: string) => boolean | Promise<boolean>;
  onSubmitServiceKey?: (serviceKey: string) => boolean | Promise<boolean>;
  /** Preferred for BYOK saves so keys land in the right provider slot. */
  onSubmitProviderKey?: (provider: ByokProvider, apiKey: string) => boolean | Promise<boolean>;
  onClearProviderKey?: (provider: ByokProvider) => void;
  onOpenUpgrade?: () => void;
  className?: string;
}

const ACCENT = {
  emerald: {
    border: 'border-emerald-500/35',
    bg: 'bg-emerald-950/25',
    text: 'text-emerald-200',
    soft: 'text-emerald-100/75',
    button: 'bg-emerald-600 hover:bg-emerald-500',
    ring: 'focus:ring-emerald-500',
    dot: 'bg-emerald-400',
  },
  cyan: {
    border: 'border-cyan-500/35',
    bg: 'bg-cyan-950/20',
    text: 'text-cyan-200',
    soft: 'text-cyan-100/75',
    button: 'bg-cyan-600 hover:bg-cyan-500',
    ring: 'focus:ring-cyan-500',
    dot: 'bg-cyan-400',
  },
  sky: {
    border: 'border-sky-500/35',
    bg: 'bg-sky-950/20',
    text: 'text-sky-200',
    soft: 'text-sky-100/75',
    button: 'bg-sky-600 hover:bg-sky-500',
    ring: 'focus:ring-sky-500',
    dot: 'bg-sky-400',
  },
  violet: {
    border: 'border-violet-500/35',
    bg: 'bg-violet-950/20',
    text: 'text-violet-200',
    soft: 'text-violet-100/75',
    button: 'bg-violet-600 hover:bg-violet-500',
    ring: 'focus:ring-violet-500',
    dot: 'bg-violet-400',
  },
  amber: {
    border: 'border-amber-500/35',
    bg: 'bg-amber-950/20',
    text: 'text-amber-200',
    soft: 'text-amber-100/75',
    button: 'bg-amber-600 hover:bg-amber-500',
    ring: 'focus:ring-amber-500',
    dot: 'bg-amber-400',
  },
} as const;

const KeyChip: React.FC<{
  children: React.ReactNode;
  tone?: 'emerald' | 'cyan' | 'sky' | 'violet' | 'amber' | 'slate';
  dot?: boolean;
  icon?: React.ReactNode;
  className?: string;
}> = ({ children, tone = 'slate', dot = false, icon, className = '' }) => {
  const tones = {
    emerald: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
    cyan: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200',
    sky: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
    violet: 'border-violet-400/30 bg-violet-400/10 text-violet-200',
    amber: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
    slate: 'border-white/10 bg-white/[0.04] text-slate-300',
  } as const;
  const dots = {
    emerald: 'bg-emerald-400',
    cyan: 'bg-cyan-400',
    sky: 'bg-sky-400',
    violet: 'bg-violet-400',
    amber: 'bg-amber-400',
    slate: 'bg-slate-500',
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] ${tones[tone]} ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dots[tone]}`} />}
      {icon}
      {children}
    </span>
  );
};

const formatDisplayDate = (value?: string | null): string => {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const KeyFact: React.FC<{ label: string; value: string; mono?: boolean }> = ({
  label,
  value,
  mono = false,
}) => (
  <div className="rounded-md border border-violet-400/15 bg-slate-950/40 px-2.5 py-1.5">
    <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-violet-200/65">{label}</div>
    <div className={`mt-0.5 break-all text-[11.5px] font-medium text-slate-100 ${mono ? 'font-mono text-cyan-200' : ''}`}>
      {value}
    </div>
  </div>
);

const CurrentKeyCard: React.FC<{ details: KeyDetailSnapshot }> = ({ details }) => {
  const statusLabel =
    details.status === 'active' ? 'Active' : details.status === 'expired' ? 'Expired' : 'Unknown';
  const statusTone = details.status === 'active' ? 'emerald' : details.status === 'expired' ? 'amber' : 'slate';

  return (
    <details open className="group overflow-hidden rounded-xl border border-violet-500/35 bg-violet-950/15">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 border-b border-violet-400/15 bg-violet-500/[0.06] px-3 py-2.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-violet-400/25 bg-violet-400/10">
            <ShieldCheck className="h-3.5 w-3.5 text-violet-200" />
          </span>
          <span className="min-w-0">
            <span className="block text-[9px] font-bold uppercase tracking-[0.18em] text-violet-200/70">
              Current key
            </span>
            <span className="block truncate text-xs font-bold text-violet-50">{details.keyType}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <KeyChip tone={statusTone} dot>
            {statusLabel}
          </KeyChip>
          <span className="hidden items-center gap-0.5 rounded border border-violet-400/25 px-1.5 py-0.5 text-[9px] font-semibold text-violet-200 group-open:inline-flex">
            Hide details <ChevronDown className="h-2.5 w-2.5 -rotate-180" />
          </span>
          <span className="inline-flex items-center gap-0.5 rounded border border-violet-400/25 px-1.5 py-0.5 text-[9px] font-semibold text-violet-200 group-open:hidden">
            Show details <ChevronDown className="h-2.5 w-2.5" />
          </span>
        </span>
      </summary>

      <div className="space-y-2 p-2.5">
        <div className="flex flex-wrap gap-1.5">
          <KeyChip tone="violet">{details.source === 'service' ? 'LandSurv' : details.source}</KeyChip>
          {details.tier && <KeyChip tone="cyan">Tier · {details.tier}</KeyChip>}
          {details.accessProfile && <KeyChip>Access · {details.accessProfile}</KeyChip>}
        </div>

        <div className="grid gap-1.5 sm:grid-cols-2">
          {details.keyName && <KeyFact label="Key name" value={details.keyName} />}
          {details.keyId && <KeyFact label="Key ID" value={details.keyId} mono />}
          {details.ownerUserId && <KeyFact label="User ID" value={details.ownerUserId} mono />}
          {details.ownerEmail && <KeyFact label="Owner email" value={details.ownerEmail} />}
          {details.tier && <KeyFact label="Tier" value={details.tier} />}
          <KeyFact label="Status" value={statusLabel} />
          {details.accessProfile && <KeyFact label="Access profile" value={details.accessProfile} />}
          {details.createdAt && <KeyFact label="Created" value={formatDisplayDate(details.createdAt)} />}
          {details.expiresAt && <KeyFact label="Expires" value={formatDisplayDate(details.expiresAt)} />}
          {details.activatedAt && <KeyFact label="Activated" value={formatDisplayDate(details.activatedAt)} />}
        </div>

        {details.permissions && details.permissions.length > 0 && (
          <div className="rounded-md border border-violet-400/15 bg-slate-950/40 px-2.5 py-2">
            <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-violet-200/65">
              Permissions
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {details.permissions.map(permission => (
                <KeyChip key={permission} tone="violet">
                  {permission}
                </KeyChip>
              ))}
            </div>
          </div>
        )}

        {details.source === 'google' && (
          <p className="text-[10.5px] leading-relaxed text-slate-400">
            This key is stored only in your browser and is associated with your signed account or current session.
          </p>
        )}
      </div>
    </details>
  );
};

const KeyStatusStrip: React.FC<{
  hasLandSurvKey: boolean;
  hasServiceAccess: boolean;
  serviceAccessExpiresAt?: string | null;
  computeCredits: number;
  connectedCount: number;
}> = ({ hasLandSurvKey, hasServiceAccess, serviceAccessExpiresAt, computeCredits, connectedCount }) => (
  <div className="flex flex-wrap items-center gap-1.5">
    <KeyChip tone={hasServiceAccess || hasLandSurvKey ? 'emerald' : 'slate'} dot>
      Service {hasServiceAccess || hasLandSurvKey ? 'active' : 'inactive'}
    </KeyChip>
    {hasLandSurvKey && <KeyChip tone="cyan">Hosted inference</KeyChip>}
    {serviceAccessExpiresAt && (
      <KeyChip tone="violet">Expires {formatDisplayDate(serviceAccessExpiresAt)}</KeyChip>
    )}
    {computeCredits > 0 && <KeyChip tone="amber">{computeCredits.toLocaleString()} credits</KeyChip>}
    <KeyChip tone={connectedCount > 0 ? 'cyan' : 'slate'}>
      {connectedCount > 0 ? `${connectedCount} BYOK linked` : 'BYOK optional'}
    </KeyChip>
    <KeyChip icon={<LockKeyhole className="h-2.5 w-2.5" />}>Local only</KeyChip>
  </div>
);

const KeyEntryCard: React.FC<{
  source: ReturnType<typeof getKeySource>;
  children: React.ReactNode;
}> = ({ source, children }) => {
  const accent = ACCENT[source.accent];
  return (
    <div className={`rounded-xl border ${accent.border} ${accent.bg} p-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={`text-sm font-bold ${accent.text}`}>{source.heading}</h3>
          <p className={`mt-0.5 text-[11px] leading-snug ${accent.soft}`}>{source.description}</p>
        </div>
        <KeyChip tone={source.accent}>{source.kind === 'service' ? 'Service' : 'BYOK'}</KeyChip>
      </div>
      {children}
    </div>
  );
};

export const KeyManagementPanel: React.FC<KeyManagementPanelProps> = ({
  variant = 'modal',
  currentKeyDetails = null,
  hasLandSurvKey = false,
  hasGoogleApiKey = false,
  hasServiceAccess = false,
  serviceAccessExpiresAt = null,
  computeCredits = 0,
  initialSource,
  connectedProviders,
  onSubmitApiKey,
  onSubmitServiceKey,
  onSubmitProviderKey,
  onClearProviderKey,
  onOpenUpgrade,
  className = '',
}) => {
  const initialByok =
    initialSource && initialSource !== 'landsurv' ? initialSource : ('google' as ByokProvider);
  const [activeProvider, setActiveProvider] = useState<ByokProvider>(initialByok);
  const [serviceKey, setServiceKey] = useState('');
  const [inferenceKey, setInferenceKey] = useState('');
  const [showServiceKey, setShowServiceKey] = useState(false);
  const [showInferenceKey, setShowInferenceKey] = useState(false);
  const [validating, setValidating] = useState<'service' | 'inference' | null>(null);
  const [serviceMessage, setServiceMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [inferenceMessage, setInferenceMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const providerConnected: Record<ByokProvider, boolean> = {
    google: Boolean(connectedProviders?.google ?? hasGoogleApiKey),
    openai: Boolean(connectedProviders?.openai),
    xai: Boolean(connectedProviders?.xai),
    anthropic: Boolean(connectedProviders?.anthropic),
  };
  const connectedCount = BYOK_KEY_SOURCES.filter(source => providerConnected[source.id as ByokProvider]).length;
  const activeSource = getByokKeySource(activeProvider);
  const accent = ACCENT[activeSource.accent];
  const detectedProvider = inferenceKey.trim() ? detectKeyProvider(inferenceKey) : null;
  const detectedByok =
    detectedProvider && detectedProvider !== 'landsurv' ? (detectedProvider as ByokProvider) : null;
  const saveProvider = detectedByok ?? activeProvider;

  const handleServiceSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setServiceMessage(null);
    if (!serviceKey.trim()) {
      setServiceMessage({ tone: 'error', text: 'Enter the LandSurv Enabling Key from your purchase email.' });
      return;
    }
    setValidating('service');
    try {
      const success = await Promise.resolve(
        (onSubmitServiceKey ?? onSubmitApiKey)(serviceKey.trim()),
      );
      if (success) {
        setServiceKey('');
        setServiceMessage({ tone: 'success', text: 'LandSurv key verified and connected.' });
      } else {
        setServiceMessage({
          tone: 'error',
          text: 'That Enabling Key could not be verified. Check the key and try again.',
        });
      }
    } catch {
      setServiceMessage({ tone: 'error', text: 'The key could not be verified right now. Try again.' });
    } finally {
      setValidating(null);
    }
  };

  const handleInferenceSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setInferenceMessage(null);
    if (!inferenceKey.trim()) {
      setInferenceMessage({
        tone: 'error',
        text: 'Enter your AI provider API key (Google, OpenAI, xAI, or Anthropic).',
      });
      return;
    }
    if (detectedProvider === 'landsurv') {
      setInferenceMessage({
        tone: 'error',
        text: 'That is a LandSurv key. Paste it in the Enabling Key field above instead.',
      });
      return;
    }

    setValidating('inference');
    try {
      const success = await Promise.resolve(
        onSubmitProviderKey
          ? onSubmitProviderKey(saveProvider, inferenceKey.trim())
          : onSubmitApiKey(inferenceKey.trim()),
      );
      if (success) {
        setInferenceKey('');
        setInferenceMessage({
          tone: 'success',
          text: `${PROVIDER_LABELS[saveProvider]} key saved for this browser.`,
        });
      } else {
        setInferenceMessage({
          tone: 'error',
          text: 'That API key is not valid. Check the format and try again.',
        });
      }
    } catch {
      setInferenceMessage({ tone: 'error', text: 'The key could not be saved right now. Try again.' });
    } finally {
      setValidating(null);
    }
  };

  return (
    <section
      data-testid="key-management-panel"
      className={`rounded-xl border border-white/10 bg-[#08111b]/80 ${className}`}
    >
      {variant === 'surface' && (
        <div className="border-b border-white/[0.07] px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-400/25 bg-emerald-400/10">
                <KeyRound className="h-4 w-4 text-emerald-300" />
              </span>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">
                  API Keys &amp; Access
                </div>
                <div className="text-[10.5px] text-slate-400">
                  Enter a key here — no need to paste it into chat.
                </div>
              </div>
            </div>
            {onOpenUpgrade && (
              <button
                type="button"
                onClick={onOpenUpgrade}
                className="text-[10.5px] font-semibold text-emerald-300 underline decoration-emerald-500/40 underline-offset-2 hover:text-emerald-200"
              >
                Upgrade Plans →
              </button>
            )}
          </div>
        </div>
      )}

      <div className="space-y-3 p-3">
        <KeyStatusStrip
          hasLandSurvKey={hasLandSurvKey}
          hasServiceAccess={hasServiceAccess}
          serviceAccessExpiresAt={serviceAccessExpiresAt}
          computeCredits={computeCredits}
          connectedCount={connectedCount}
        />

        {currentKeyDetails && <CurrentKeyCard details={currentKeyDetails} />}

        {hasLandSurvKey && (
          <div role="status" className="rounded-lg border border-emerald-400/40 bg-emerald-950/35 px-3 py-2">
            <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-200">
              <Check className="h-3.5 w-3.5" />
              Your LandSurv key is connected.
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-emerald-100/75">
              Service access and LandSurv-hosted AI inference are enabled.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {KEY_SOURCE_DEFINITIONS.map(source => {
            const isActive = source.id === activeProvider;
            const isConnected = source.kind === 'byok' ? providerConnected[source.id as ByokProvider] : hasLandSurvKey;
            return (
              <button
                key={source.id}
                type="button"
                onClick={() => {
                  if (source.kind === 'byok') setActiveProvider(source.id as ByokProvider);
                  const targetId = source.kind === 'service' ? 'serviceKey' : 'inferenceKey';
                  window.setTimeout(() => document.getElementById(targetId)?.focus(), 0);
                }}
                aria-pressed={isActive}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] transition-colors ${
                  isActive
                    ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-200'
                    : 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-slate-200'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isConnected ? 'bg-emerald-400' : 'bg-slate-600'
                  }`}
                />
                {source.shortLabel}
              </button>
            );
          })}
        </div>

        <KeyEntryCard source={getKeySource('landsurv')}>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="flex flex-wrap gap-1">
              <KeyChip tone="emerald">Service access</KeyChip>
              <KeyChip tone="cyan">Hosted inference</KeyChip>
            </span>
            <KeyChip tone={hasLandSurvKey ? 'emerald' : 'slate'} dot>
              {hasLandSurvKey ? 'Connected' : 'Not connected'}
            </KeyChip>
          </div>

          <form onSubmit={handleServiceSubmit} className="mt-2.5 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <label htmlFor="serviceKey" className="sr-only">
                LandSurv Enabling Key
              </label>
              <input
                type={showServiceKey ? 'text' : 'password'}
                id="serviceKey"
                value={serviceKey}
                onChange={event => setServiceKey(event.target.value)}
                placeholder={getKeySource('landsurv').placeholder}
                className="w-full rounded-md border border-white/15 bg-slate-950/60 px-3 py-2 pr-14 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setShowServiceKey(value => !value)}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-slate-200"
                aria-label={showServiceKey ? 'Hide LandSurv key' : 'Show LandSurv key'}
              >
                {showServiceKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {showServiceKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <button
              type="submit"
              disabled={validating !== null}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-60"
            >
              {validating === 'service' && <Loader2 className="h-3 w-3 animate-spin" />}
              {validating === 'service' ? 'Checking...' : 'Save LandSurv Key'}
            </button>
          </form>

          {serviceMessage && (
            <p
              role={serviceMessage.tone === 'error' ? 'alert' : 'status'}
              className={`mt-1.5 text-[10.5px] ${
                serviceMessage.tone === 'error' ? 'text-rose-300' : 'text-emerald-300'
              }`}
            >
              {serviceMessage.text}
            </p>
          )}
        </KeyEntryCard>

        <div className="flex items-center gap-3 px-1" aria-hidden="true">
          <span className="h-px flex-1 bg-white/10" />
          <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
            OR BRING YOUR OWN AI KEY
          </span>
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <KeyEntryCard source={getKeySource(activeProvider)}>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <KeyChip tone={activeSource.accent}>{activeSource.shortLabel}</KeyChip>
              {detectedByok && (
                <KeyChip tone="cyan" dot>
                  Detected {PROVIDER_LABELS[detectedByok]}
                </KeyChip>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {onClearProviderKey && providerConnected[activeProvider] && (
                <button
                  type="button"
                  onClick={() => onClearProviderKey(activeProvider)}
                  className="inline-flex items-center gap-1 rounded-full border border-rose-400/25 bg-rose-400/[0.07] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-rose-300 hover:border-rose-400/50 hover:text-rose-200"
                >
                  <Trash2 className="h-2.5 w-2.5" />
                  Remove
                </button>
              )}
              <KeyChip tone={providerConnected[activeProvider] ? 'emerald' : 'slate'} dot>
                {providerConnected[activeProvider] ? 'Connected' : 'Optional'}
              </KeyChip>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5" role="tablist" aria-label="AI provider">
            {BYOK_KEY_SOURCES.map(source => {
              const provider = source.id as ByokProvider;
              const isActive = provider === activeProvider;
              return (
                <button
                  key={provider}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveProvider(provider)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors ${
                    isActive
                      ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-100'
                      : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-slate-200'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      providerConnected[provider] ? 'bg-emerald-400' : 'bg-slate-600'
                    }`}
                  />
                  {source.shortLabel}
                </button>
              );
            })}
          </div>

          <form onSubmit={handleInferenceSubmit} className="mt-2 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <label htmlFor="inferenceKey" className="sr-only">
                AI Provider API Key
              </label>
              <input
                type={showInferenceKey ? 'text' : 'password'}
                id="inferenceKey"
                value={inferenceKey}
                onChange={event => setInferenceKey(event.target.value)}
                placeholder={activeSource.placeholder}
                className="w-full rounded-md border border-white/15 bg-slate-950/60 px-3 py-2 pr-14 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-cyan-500"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setShowInferenceKey(value => !value)}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-slate-200"
                aria-label={showInferenceKey ? 'Hide AI provider key' : 'Show AI provider key'}
              >
                {showInferenceKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {showInferenceKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <button
              type="submit"
              disabled={validating !== null}
              className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-60 ${accent.button}`}
            >
              {validating === 'inference' && <Loader2 className="h-3 w-3 animate-spin" />}
              {validating === 'inference' ? 'Saving...' : 'Save AI Key'}
            </button>
          </form>

          {inferenceMessage && (
            <p
              role={inferenceMessage.tone === 'error' ? 'alert' : 'status'}
              className={`mt-1.5 text-[10.5px] ${
                inferenceMessage.tone === 'error' ? 'text-rose-300' : 'text-emerald-300'
              }`}
            >
              {inferenceMessage.text}
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10.5px] text-slate-400">
              {detectedByok
                ? `This key will be saved to ${PROVIDER_LABELS[detectedByok]}.`
                : `Get a ${activeSource.shortLabel} key:`}
              {!detectedByok && activeSource.docsUrl && (
                <a
                  href={activeSource.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 inline-flex items-center gap-0.5 font-semibold text-cyan-300 underline hover:text-cyan-200"
                >
                  Open console <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
            </p>
            <span className="inline-flex items-center gap-1 text-[9.5px] text-slate-500">
              <LockKeyhole className="h-2.5 w-2.5" />
              Stored in this browser
            </span>
          </div>
        </KeyEntryCard>

        <div className="flex items-start gap-1.5 border-t border-white/[0.07] pt-2">
          <LockKeyhole className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" />
          <p className="text-[10px] leading-snug text-slate-500">
            Keys entered here are saved directly to your browser storage. They are never added to the
            conversation or sent as chat text.
          </p>
        </div>
      </div>
    </section>
  );
};

export default KeyManagementPanel;
