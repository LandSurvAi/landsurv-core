// ApiKeyOrPayModal.tsx
// Modal allowing users to enter either a LandSurv Enabling Key or their own AI provider API key.
// Payments and plan upgrades are cleanly separated into UpgradeModal.

import React, { useState } from 'react';
import { getShortRefreshInstruction } from '../utils/browserDetection';
import { useAppState } from '../contexts/AppStateContext.tsx';
import { detectKeyProvider, PROVIDER_LABELS, PROVIDER_KEY_URLS } from '../services/providerKeys.ts';

export interface CurrentKeyDetails {
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

export interface CheckoutSelection {
  creditPackage?: '1K' | '5K' | '10K';
  servicePlan?: '1M' | '3M' | '6M' | '1Y';
  customerEmail?: string;
}

interface ApiKeyOrPayModalProps {
  isOpen: boolean;
  onSubmitApiKey: (apiKey: string) => boolean | Promise<boolean>;
  onSubmitServiceKey?: (serviceKey: string) => boolean | Promise<boolean>;
  onProceedWithPayment?: (creditPackage: '1K' | '5K' | '10K') => void;
  onProceedWithServicePayment?: (servicePlan: '1M' | '3M' | '6M' | '1Y') => void;
  onProceedWithCheckout?: (selection: CheckoutSelection) => void | Promise<void>;
  onOpenUpgrade?: () => void;
  onClose?: () => void;
  onGoHome?: () => void;
  onDismiss?: () => void;
  computeCredits?: number;
  hasGoogleApiKey?: boolean;
  hasLandSurvKey?: boolean;
  hasServiceAccess?: boolean;
  serviceAccessExpiresAt?: string | null;
  isPremium?: boolean; // Show premium feature message
  trigger?: 'apikey' | 'rinex' | 'lsvz'; // Which feature triggered the modal
  isFreeTierLocked?: boolean;
  remainingTime?: number;
  timeUntilAvailable?: number;
  currentKeyDetails?: CurrentKeyDetails | null;
  customerEmail?: string | null;
  initialTab?: 'apikey' | 'service' | 'payment';
}

const ApiKeyOrPayModal: React.FC<ApiKeyOrPayModalProps> = ({ 
  isOpen, 
  onSubmitApiKey, 
  onSubmitServiceKey,
  onOpenUpgrade,
  onClose,
  onGoHome,
  onDismiss,
  computeCredits = 0,
  hasGoogleApiKey = false,
  hasLandSurvKey = false,
  hasServiceAccess = false,
  serviceAccessExpiresAt = null,
  isPremium = false,
  trigger = 'apikey',
  isFreeTierLocked = false,
  timeUntilAvailable = 0,
  currentKeyDetails = null,
}) => {
  const [serviceKey, setServiceKey] = useState('');
  const [inferenceKey, setInferenceKey] = useState('');
  const [showServiceKey, setShowServiceKey] = useState(false);
  const [showInferenceKey, setShowInferenceKey] = useState(false);
  const [validatingKeyType, setValidatingKeyType] = useState<'service' | 'inference' | null>(null);
  const { addNotification } = useAppState();

  if (!isOpen) return null;

  const handleServiceKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!serviceKey.trim()) {
      addNotification({ kind: 'api-key', severity: 'error', title: 'Service key', message: 'Enter the LandSurv Enabling Key from your purchase email.' });
      return;
    }

    setValidatingKeyType('service');
    const success = await Promise.resolve((onSubmitServiceKey || onSubmitApiKey)(serviceKey));
    setValidatingKeyType(null);
    
    if (!success) {
      addNotification({ kind: 'api-key', severity: 'error', title: 'Service key', message: 'That Enabling Key could not be verified. Check the key and try again.' });
    } else {
      setServiceKey('');
    }
  };

  const detectedInferenceProvider = inferenceKey.trim() ? detectKeyProvider(inferenceKey) : null;

  const handleInferenceKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inferenceKey.trim()) {
      addNotification({ kind: 'api-key', severity: 'error', title: 'AI provider key', message: 'Enter your AI provider API key (Google, OpenAI, xAI, or Anthropic).' });
      return;
    }

    setValidatingKeyType('inference');
    const success = await Promise.resolve(onSubmitApiKey(inferenceKey));
    setValidatingKeyType(null);

    if (!success) {
      addNotification({ kind: 'api-key', severity: 'error', title: 'AI provider key', message: 'That API key is not valid. Check the key and try again.' });
    } else {
      setInferenceKey('');
    }
  };

  const handleClose = () => {
    if (onClose) onClose();
  };

  const getAgentName = (): string => {
    switch (trigger) {
      case 'rinex':
        return 'RINEX Post-Processor';
      case 'lsvz':
        return 'LSVZ Premium';
      default:
        return 'Premium Feature';
    }
  };

  const refreshInstruction = getShortRefreshInstruction();

  const formatCountdown = (seconds: number): string => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const secs = safeSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
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

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4 py-4 bg-gray-950/[0.97] overflow-hidden">
      <div className="bg-gray-800 rounded-lg shadow-2xl max-w-xl w-full mx-4 border border-gray-700 max-h-[92vh] overflow-y-auto overscroll-contain scrollbar-hide">
        
        {/* Brand */}
        <div data-testid="key-dialog-brand" className="relative flex items-center justify-between bg-gray-800 px-4 py-1.5 rounded-t-lg border-b border-gray-700">
          <div className="flex items-center gap-2.5" aria-label="LandSurv.ai">
            <img src="/favicon-192.png" alt="LandSurv.ai logo" className="h-7 w-7 rounded-md shadow-md" />
            <div>
              <div className="text-lg font-extrabold leading-none tracking-tight text-white">
                Land<span className="text-cyan-400">Surv</span><span className="text-emerald-400">.ai</span><sup className="ml-0.5 text-[9px] text-gray-400">™</sup>
              </div>
              <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-gray-400">
                The AI-native toolkit for Land Surveyors and Civil Engineers
              </p>
            </div>
          </div>
          {onClose && (
            <button
              aria-label="Close"
              onClick={handleClose}
              className="text-gray-400 hover:text-white p-1 rounded-md transition-colors text-base font-semibold"
            >
              ✕
            </button>
          )}
        </div>

        {/* Status Header */}
        <div className="bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-2">
          {isFreeTierLocked ? (
            <>
              <h2 className="text-base font-bold text-white">Free Access Paused</h2>
              <p className="mt-0.5 text-sm font-semibold text-white">
                Continuous Service Access disables the 4h on / 4h off schedule.
              </p>
              <p className="text-blue-100 text-xs mt-0.5">
                Available again in <span className="font-mono font-bold text-cyan-200">{formatCountdown(timeUntilAvailable)}</span>
              </p>
            </>
          ) : isPremium ? (
            <>
              <h2 className="text-base font-bold text-white">
                Premium Feature Access Required
              </h2>
              <p className="text-blue-100 text-xs mt-0.5">
                {getAgentName()} needs an inference source. Enter your LandSurv Enabling Key or bring your own AI key.
              </p>
            </>
          ) : computeCredits > 0 ? (
            <>
              <h2 className="text-base font-bold text-white">
                API & Enabling Keys
              </h2>
              <p className="text-blue-100 text-xs mt-0.5">
                Credits remaining: <span className="font-mono font-bold text-green-300">{computeCredits.toLocaleString()}</span>
              </p>
            </>
          ) : (
            <>
              <h2 className="text-base font-bold text-white">
                API & Enabling Keys
              </h2>
              <p className="text-blue-100 text-xs mt-0.5">
                Connect your LandSurv Enabling Key or AI provider key to run features.
              </p>
            </>
          )}
        </div>

        {/* Upgrade Banner Link */}
        {onOpenUpgrade && (
          <div className="bg-emerald-950/40 border-b border-emerald-500/30 px-4 py-2 flex items-center justify-between">
            <span className="text-xs text-emerald-200 font-medium">
              Need continuous 24/7 service or hosted compute credits?
            </span>
            <button
              type="button"
              onClick={onOpenUpgrade}
              className="text-xs font-bold text-emerald-300 hover:text-emerald-200 underline ml-2 whitespace-nowrap"
            >
              Upgrade Plans →
            </button>
          </div>
        )}

        {/* Content */}
        <div className="px-4 py-3">
          <div className="space-y-3">
            {currentKeyDetails && (
              <details className="group rounded-lg border border-violet-500/50 bg-violet-950/20">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-2.5 py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-200/80">Current key</span>
                    <span className="truncate text-xs font-bold text-violet-100">{currentKeyDetails.keyType}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${currentKeyDetails.status === 'active' ? 'bg-emerald-300 text-emerald-950' : 'bg-gray-700 text-gray-200'}`}>
                      {currentKeyDetails.status === 'active' ? 'Active' : currentKeyDetails.status === 'expired' ? 'Expired' : 'Unknown'}
                    </span>
                    <span className="rounded border border-violet-400/50 px-1.5 py-0.5 text-[10px] font-bold text-violet-200 group-open:hidden">Show details ▾</span>
                    <span className="hidden rounded border border-violet-400/50 px-1.5 py-0.5 text-[10px] font-bold text-violet-200 group-open:inline">Hide details ▴</span>
                  </span>
                </summary>

                <div className="grid gap-1.5 px-2.5 pb-2.5 text-[11px] text-gray-200 sm:grid-cols-2">
                  {currentKeyDetails.keyName && (
                    <div className="rounded border border-violet-500/30 bg-gray-900/40 p-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-200/80">Key name</div>
                      <div className="mt-1 break-all font-medium text-white">{currentKeyDetails.keyName}</div>
                    </div>
                  )}
                  {currentKeyDetails.keyId && (
                    <div className="rounded border border-violet-500/30 bg-gray-900/40 p-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-200/80">Key ID</div>
                      <div className="mt-1 break-all font-mono text-cyan-200">{currentKeyDetails.keyId}</div>
                    </div>
                  )}
                  {currentKeyDetails.ownerUserId && (
                    <div className="rounded border border-violet-500/30 bg-gray-900/40 p-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-200/80">User ID</div>
                      <div className="mt-1 break-all font-mono text-cyan-200">{currentKeyDetails.ownerUserId}</div>
                    </div>
                  )}
                  {currentKeyDetails.ownerEmail && (
                    <div className="rounded border border-violet-500/30 bg-gray-900/40 p-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-200/80">Owner email</div>
                      <div className="mt-1 break-all text-white">{currentKeyDetails.ownerEmail}</div>
                    </div>
                  )}
                  {currentKeyDetails.tier && (
                    <div className="rounded border border-violet-500/30 bg-gray-900/40 p-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-200/80">Tier</div>
                      <div className="mt-1 text-white">{currentKeyDetails.tier}</div>
                    </div>
                  )}
                  <div className="rounded border border-violet-500/30 bg-gray-900/40 p-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-200/80">Status</div>
                    <div className="mt-1 text-white">{currentKeyDetails.status === 'active' ? 'Active' : currentKeyDetails.status === 'expired' ? 'Expired' : 'Unknown'}</div>
                  </div>
                  {currentKeyDetails.accessProfile && (
                    <div className="rounded border border-violet-500/30 bg-gray-900/40 p-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-200/80">Access profile</div>
                      <div className="mt-1 text-white">{currentKeyDetails.accessProfile}</div>
                    </div>
                  )}
                  {currentKeyDetails.createdAt && (
                    <div className="rounded border border-violet-500/30 bg-gray-900/40 p-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-200/80">Created</div>
                      <div className="mt-1 text-white">{formatDisplayDate(currentKeyDetails.createdAt)}</div>
                    </div>
                  )}
                  {currentKeyDetails.expiresAt && (
                    <div className="rounded border border-violet-500/30 bg-gray-900/40 p-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-200/80">Expires</div>
                      <div className="mt-1 text-white">{formatDisplayDate(currentKeyDetails.expiresAt)}</div>
                    </div>
                  )}
                  {currentKeyDetails.activatedAt && (
                    <div className="rounded border border-violet-500/30 bg-gray-900/40 p-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-200/80">Activated</div>
                      <div className="mt-1 text-white">{formatDisplayDate(currentKeyDetails.activatedAt)}</div>
                    </div>
                  )}
                  {currentKeyDetails.permissions && currentKeyDetails.permissions.length > 0 && (
                    <div className="rounded border border-violet-500/30 bg-gray-900/40 p-2 sm:col-span-2">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-200/80">Permissions</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {currentKeyDetails.permissions.map((permission) => (
                          <span key={permission} className="rounded bg-violet-800/50 px-1.5 py-0.5 text-[10px] font-medium text-violet-100">{permission}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {currentKeyDetails.source === 'google' && (
                  <p className="px-2.5 pb-2.5 text-[11px] leading-relaxed text-gray-300">
                    This key is stored only in your browser and is associated with your signed account or current session.
                  </p>
                )}
              </details>
            )}

            {hasLandSurvKey && (
              <div role="status" className="rounded-lg border border-emerald-400/60 bg-emerald-950/40 px-2.5 py-2">
                <p className="text-sm font-bold text-emerald-200">Your LandSurv key is connected.</p>
                <p className="mt-0.5 text-[11px] leading-snug text-emerald-100/80">
                  Service access and LandSurv-hosted AI inference are enabled.
                </p>
              </div>
            )}

            {/* LandSurv Enabling Key Entry */}
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/20 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-emerald-200">LandSurv Enabling Key</h3>
                  <p className="mt-0.5 text-xs text-gray-300">
                    The key sent to your email after any subscription or credit purchase.
                  </p>
                </div>
                <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold uppercase ${hasLandSurvKey ? 'bg-emerald-300 text-emerald-950' : 'bg-gray-700 text-gray-300'}`}>
                  {hasLandSurvKey ? 'Connected' : 'Not connected'}
                </span>
              </div>
              <form onSubmit={handleServiceKeySubmit} className="mt-2.5 flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <label htmlFor="serviceKey" className="sr-only">LandSurv Enabling Key</label>
                  <input
                    type={showServiceKey ? 'text' : 'password'}
                    id="serviceKey"
                    value={serviceKey}
                    onChange={(e) => setServiceKey(e.target.value)}
                    placeholder="lsa_..."
                    className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 pr-14 font-mono text-sm text-gray-200 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    autoComplete="off"
                    autoFocus
                  />
                  <button type="button" onClick={() => setShowServiceKey(!showServiceKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-200">
                    {showServiceKey ? 'Hide' : 'Show'}
                  </button>
                </div>
                <button type="submit" disabled={validatingKeyType !== null} className="rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60 whitespace-nowrap">
                  {validatingKeyType === 'service' ? 'Checking...' : 'Save LandSurv Key'}
                </button>
              </form>
            </div>

            <div className="flex items-center gap-3 px-1" aria-hidden="true">
              <span className="h-px flex-1 bg-gray-700" />
              <span className="text-[10px] font-bold uppercase text-gray-400">OR BRING YOUR OWN AI KEY</span>
              <span className="h-px flex-1 bg-gray-700" />
            </div>

            {/* AI Provider Key Entry */}
            <div className="rounded-lg border border-cyan-500/40 bg-cyan-950/20 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-cyan-200">AI Provider Key</h3>
                  <p className="mt-0.5 text-xs text-gray-300">
                    Use your own Google Gemini, OpenAI, xAI, or Anthropic key.
                  </p>
                </div>
                <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold uppercase ${hasGoogleApiKey ? 'bg-cyan-300 text-cyan-950' : 'bg-gray-700 text-gray-300'}`}>
                  {hasGoogleApiKey ? 'Connected' : 'Optional'}
                </span>
              </div>
              <form onSubmit={handleInferenceKeySubmit} className="mt-2.5 flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <label htmlFor="inferenceKey" className="sr-only">AI Provider API Key</label>
                  <input
                    type={showInferenceKey ? 'text' : 'password'}
                    id="inferenceKey"
                    value={inferenceKey}
                    onChange={(e) => setInferenceKey(e.target.value)}
                    placeholder="AIza… · sk-… · xai-… · sk-ant-…"
                    className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 pr-14 font-mono text-sm text-gray-200 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    autoComplete="off"
                  />
                  <button type="button" onClick={() => setShowInferenceKey(!showInferenceKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-200">
                    {showInferenceKey ? 'Hide' : 'Show'}
                  </button>
                </div>
                <button type="submit" disabled={validatingKeyType !== null} className="shrink-0 rounded-md bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-60 whitespace-nowrap">
                  {validatingKeyType === 'inference' ? 'Saving...' : 'Save AI Key'}
                </button>
              </form>
              {inferenceKey.trim() && (
                <p className="mt-1.5 text-[11px] text-gray-300" data-testid="inference-key-provider">
                  {detectedInferenceProvider && detectedInferenceProvider !== 'landsurv'
                    ? <>Detected: <span className="font-semibold text-cyan-300">{PROVIDER_LABELS[detectedInferenceProvider]}</span></>
                    : detectedInferenceProvider === 'landsurv'
                      ? <>Detected: <span className="font-semibold text-emerald-300">{PROVIDER_LABELS.landsurv}</span> — paste in the Enabling Key field above.</>
                      : <>Format will be tried as a Google AI Studio key.</>}
                </p>
              )}
              <p className="mt-1.5 text-[11px] text-gray-400">
                Get free key:
                {' '}<a href={PROVIDER_KEY_URLS.google} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline hover:text-cyan-200">Google AI Studio</a> ·
                {' '}<a href={PROVIDER_KEY_URLS.openai} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline hover:text-cyan-200">OpenAI</a> ·
                {' '}<a href={PROVIDER_KEY_URLS.xai} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline hover:text-cyan-200">xAI</a> ·
                {' '}<a href={PROVIDER_KEY_URLS.anthropic} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline hover:text-cyan-200">Anthropic</a>
              </p>
            </div>

            <div className="pt-2 border-t border-gray-700 space-y-1">
              <p className="text-[11px] text-center text-gray-400 leading-snug">
                Keys are stored locally in this browser. Tip: {refreshInstruction} if you experience any connection issues.
              </p>
              
              {isPremium && onGoHome && (
                <button
                  onClick={onGoHome}
                  className="w-full mt-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-semibold py-2 px-4 rounded-md transition-colors border border-gray-600"
                >
                  ← Return to Agent Selection
                </button>
              )}
            </div>
          </div>
        </div>

        {onDismiss && (
          <div className="border-t border-gray-700 px-4 py-2.5">
            <button
              onClick={onDismiss}
              className="w-full bg-gray-700 hover:bg-gray-600 border border-gray-600 text-pink-300 hover:text-pink-200 text-xs font-medium py-1.5 px-3 rounded-md transition-all"
            >
              {isFreeTierLocked ? 'Browse Workspace and Open Files' : 'Browse Interface Without a Key'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ApiKeyOrPayModal;
