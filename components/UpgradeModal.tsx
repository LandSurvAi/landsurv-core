// UpgradeModal.tsx
// Dedicated modal for upgrading Service Access and purchasing Hosted Compute Credits.
// Simplified, concise layout with direct checkout options and link back to Keys dialog.

import React, { useEffect, useState } from 'react';
import { useAppState } from '../contexts/AppStateContext.tsx';
import { getCreditRunwayUnitsPerDay, useGlobalSettings } from '../utils/globalSettings';
import {
  detectKeyProvider,
  resolveKeyProvider,
  setProviderApiKey,
  PROVIDER_LABELS,
  PROVIDER_KEY_STORAGE,
  type ByokProvider,
} from '../services/providerKeys.ts';

export interface CheckoutSelection {
  creditPackage?: '1K' | '5K' | '10K';
  servicePlan?: '1M' | '3M' | '6M' | '1Y';
  customerEmail?: string;
}

interface ServiceStatusLookup {
  status: 'active' | 'expired' | 'none';
  expiresAt: string | null;
}

interface BillingCatalogItem {
  sku: string;
  category: 'compute' | 'service';
  selection: '1K' | '5K' | '10K' | '1M' | '3M' | '6M' | '1Y';
  label: string;
  unitAmount: number;
  currency: 'usd';
  grant: number;
}

interface BillingConfig {
  stripeMode: 'test' | 'live';
  checkoutMode: 'disabled' | 'canary' | 'live';
  checkoutEnabled: boolean;
  catalogReady: boolean;
  catalog: BillingCatalogItem[];
}

export interface UpgradeModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onProceedWithCheckout?: (selection: CheckoutSelection) => void | Promise<void>;
  onProceedWithPayment?: (creditPackage: '1K' | '5K' | '10K') => void | Promise<void>;
  onProceedWithServicePayment?: (servicePlan: '1M' | '3M' | '6M' | '1Y') => void | Promise<void>;
  onOpenKeyModal?: () => void;
  onSubmitApiKey?: (apiKey: string) => boolean | Promise<boolean>;
  customerEmail?: string | null;
  hasServiceAccess?: boolean;
  serviceAccessExpiresAt?: string | null;
  computeCredits?: number;
  initialPlan?: 'service' | 'compute';
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const COMPUTE_BUY_INS = [
  { id: '1K', label: 'Starter Buy-In', units: 2250, defaultPrice: 75, desc: 'Occasional AI drafting & calcs' },
  { id: '5K', label: 'Growth Buy-In', units: 4500, defaultPrice: 135, desc: 'Frequent daily survey work' },
  { id: '10K', label: 'Pro Buy-In', units: 6750, defaultPrice: 190, desc: 'High-volume production teams' },
] as const;

const SERVICE_PLANS = [
  { id: '1M', label: '1 Month', defaultPrice: 5, duration: '30 days continuous access' },
  { id: '3M', label: '3 Months', defaultPrice: 12, duration: '90 days continuous access' },
  { id: '6M', label: '6 Months', defaultPrice: 20, duration: '180 days continuous access' },
  { id: '1Y', label: '1 Year', defaultPrice: 35, duration: '365 days continuous access' },
] as const;

export const UpgradeModal: React.FC<UpgradeModalProps> = ({
  isOpen,
  onClose,
  onProceedWithCheckout,
  onProceedWithPayment,
  onProceedWithServicePayment,
  onOpenKeyModal,
  onSubmitApiKey,
  customerEmail = null,
  hasServiceAccess = false,
  serviceAccessExpiresAt = null,
  computeCredits = 0,
}) => {
  const [selectedServicePlan, setSelectedServicePlan] = useState<'1M' | '3M' | '6M' | '1Y' | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<'1K' | '5K' | '10K' | null>(null);
  const [statusEmail, setStatusEmail] = useState(customerEmail || '');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [emailStep, setEmailStep] = useState<'entry' | 'confirm'>(() => (customerEmail ? 'confirm' : 'entry'));
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [billingConfig, setBillingConfig] = useState<BillingConfig | null>(null);
  const [statusLookup, setStatusLookup] = useState<ServiceStatusLookup | null>(null);
  const [statusLookupState, setStatusLookupState] = useState<'idle' | 'checking' | 'done' | 'error'>('idle');

  // Custom AI Key Input state
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKeyText, setShowApiKeyText] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keySuccessMessage, setKeySuccessMessage] = useState<string | null>(null);

  const { addNotification } = useAppState();
  const globalSettings = useGlobalSettings();
  const normalUseUnitsPerDay = getCreditRunwayUnitsPerDay(globalSettings);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const serviceKey = typeof localStorage === 'undefined' ? null : localStorage.getItem('landsurv_service_key');
    fetch('/api/billing/config', serviceKey ? { headers: { Authorization: `Bearer ${serviceKey}` } } : undefined)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((config: BillingConfig) => {
        if (!cancelled) setBillingConfig(config);
      })
      .catch(() => {
        if (!cancelled) {
          setBillingConfig({
            stripeMode: 'test',
            checkoutMode: 'disabled',
            checkoutEnabled: false,
            catalogReady: false,
            catalog: [],
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const trimmedStatusEmail = statusEmail.trim();
  const statusEmailIsValid = EMAIL_PATTERN.test(trimmedStatusEmail);
  const trimmedConfirmEmail = confirmEmail.trim();
  const emailsMatch = Boolean(
    trimmedStatusEmail &&
    trimmedConfirmEmail &&
    trimmedStatusEmail.toLowerCase() === trimmedConfirmEmail.toLowerCase()
  );
  const emailFullyVerified = statusEmailIsValid && emailsMatch;

  useEffect(() => {
    if (!isOpen || !statusEmailIsValid) {
      setStatusLookup(null);
      setStatusLookupState('idle');
      return;
    }

    const controller = new AbortController();
    setStatusLookupState('checking');
    const timer = window.setTimeout(() => {
      fetch('/api/billing/service-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedStatusEmail }),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json() as Promise<ServiceStatusLookup>;
        })
        .then((result) => {
          setStatusLookup(result);
          setStatusLookupState('done');
        })
        .catch((error) => {
          if ((error as Error)?.name === 'AbortError') return;
          setStatusLookup(null);
          setStatusLookupState('error');
        });
    }, 600);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [isOpen, statusEmailIsValid, trimmedStatusEmail]);

  if (!isOpen) return null;

  const catalogPriceBySelection = new Map(
    (billingConfig?.catalog || []).map((item) => [item.selection, item.unitAmount / 100])
  );

  const computeBuyIns = COMPUTE_BUY_INS.map((buyIn) => ({
    ...buyIn,
    price: catalogPriceBySelection.get(buyIn.id) ?? buyIn.defaultPrice,
  }));

  const servicePlans = SERVICE_PLANS.map((plan) => ({
    ...plan,
    price: catalogPriceBySelection.get(plan.id) ?? plan.defaultPrice,
  }));

  const selectedComputeBuyIn = computeBuyIns.find((buyIn) => buyIn.id === selectedPackage);
  const selectedService = servicePlans.find((plan) => plan.id === selectedServicePlan);
  const selectedPricesReady = (!selectedPackage || selectedComputeBuyIn?.price !== null)
    && (!selectedServicePlan || selectedService?.price !== null);
  const checkoutTotal = (selectedComputeBuyIn?.price || 0) + (selectedService?.price || 0);

  const detectedApiKeyProvider = apiKeyInput.trim() ? detectKeyProvider(apiKeyInput) : null;

  const handleCustomKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      addNotification({
        kind: 'api-key',
        severity: 'error',
        title: 'API Key Required',
        message: 'Please enter a valid API key (Google Gemini, OpenAI, Anthropic Claude, xAI Grok, or LandSurv).',
      });
      return;
    }

    if (trimmed.length < 20) {
      addNotification({
        kind: 'api-key',
        severity: 'error',
        title: 'Invalid Key',
        message: 'API key is too short. Please verify and enter a complete API key.',
      });
      return;
    }

    setIsSavingKey(true);
    try {
      if (onSubmitApiKey) {
        const success = await Promise.resolve(onSubmitApiKey(trimmed));
        if (!success) {
          addNotification({
            kind: 'api-key',
            severity: 'error',
            title: 'Key Validation Failed',
            message: 'That API key could not be verified. Please check the key and try again.',
          });
          return;
        }
      } else {
        // Fallback if onSubmitApiKey prop not passed directly:
        // Save to provider localStorage slot
        const provider = resolveKeyProvider(trimmed);
        if (provider === 'landsurv') {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('landsurv_user_api_key', trimmed);
          }
        } else {
          setProviderApiKey(provider, trimmed);
        }
      }

      const providerName = detectedApiKeyProvider ? PROVIDER_LABELS[detectedApiKeyProvider] : 'Custom AI';
      setKeySuccessMessage(`Successfully connected ${providerName} key!`);
      setApiKeyInput('');
      addNotification({
        kind: 'api-key',
        severity: 'info',
        title: 'Key Saved',
        message: `${providerName} key saved. You can now use AI features without purchasing hosted credits.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save API key';
      addNotification({
        kind: 'api-key',
        severity: 'error',
        title: 'Key Error',
        message,
      });
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleCheckout = async () => {
    if (!selectedPackage && !selectedServicePlan) return;
    if (billingConfig && !billingConfig.checkoutEnabled) {
      setCheckoutError('Checkout is temporarily unavailable');
      return;
    }
    if (selectedServicePlan) {
      if (!statusEmailIsValid) {
        setCheckoutError('Please enter a valid email address to receive your service Enabling Key');
        setEmailStep('entry');
        return;
      }
      if (!emailsMatch) {
        setCheckoutError('Please confirm your email address so both entries match');
        setEmailStep('confirm');
        return;
      }
    }

    try {
      setCheckoutError(null);
      setIsCheckingOut(true);
      if (onProceedWithCheckout) {
        await Promise.resolve(onProceedWithCheckout({
          creditPackage: selectedPackage || undefined,
          servicePlan: selectedServicePlan || undefined,
          customerEmail: selectedServicePlan ? trimmedStatusEmail.toLowerCase() : undefined,
        }));
      } else if (selectedPackage && selectedServicePlan) {
        throw new Error('Combined checkout is unavailable');
      } else if (selectedPackage && onProceedWithPayment) {
        await Promise.resolve(onProceedWithPayment(selectedPackage));
      } else if (selectedServicePlan && onProceedWithServicePayment) {
        await Promise.resolve(onProceedWithServicePayment(selectedServicePlan));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to start checkout';
      setCheckoutError(message);
      addNotification({ kind: 'usage-dashboard', severity: 'error', title: 'Checkout', message });
    } finally {
      setIsCheckingOut(false);
    }
  };

  const statusNote = ((): string | null => {
    if (!trimmedStatusEmail || !statusEmailIsValid) return null;
    if (statusLookupState === 'checking') return 'Checking existing key...';
    if (statusLookup?.status === 'active') {
      const through = statusLookup.expiresAt ? ` through ${new Date(statusLookup.expiresAt).toLocaleDateString()}` : '';
      return `Existing active key found${through}. Purchase extends your current key.`;
    }
    if (statusLookup?.status === 'expired') {
      return 'Expired key found. Purchase reactivates your existing key.';
    }
    if (statusLookup?.status === 'none') {
      return 'New key will be generated and emailed to this address.';
    }
    return null;
  })();

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-2 sm:p-4 bg-gray-950/[0.97]">
      <div className="bg-gray-900 rounded-xl shadow-2xl max-w-xl w-full border border-gray-700/80 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header (fixed at top) */}
        <div className="shrink-0 flex items-center justify-between px-5 py-3 bg-gray-900 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚡</span>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">Upgrade Service &amp; Inference</h2>
              <p className="text-[11px] text-gray-400">Continuous 24/7 service access, compute credits, or bring your own API keys</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-gray-400 hover:text-white p-1 rounded-md transition-colors"
            >
              ✕
            </button>
          )}
        </div>

        {/* Scrollable Content (scrolls inside modal, footer stays pinned at bottom) */}
        <div className="flex-1 min-h-0 px-5 py-3.5 overflow-y-auto space-y-4">
          {/* Section 1: Service Access */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-400">1.</span>
                <span className="text-xs font-bold text-white">Service Access</span>
              </div>
              {hasServiceAccess && (
                <span className="rounded bg-emerald-950/80 border border-emerald-500/60 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                  Active {serviceAccessExpiresAt ? `thru ${new Date(serviceAccessExpiresAt).toLocaleDateString()}` : ''}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {servicePlans.map((plan) => {
                const isSelected = selectedServicePlan === plan.id;
                const isDimmed = Boolean(selectedServicePlan && !isSelected);

                return (
                  <div key={plan.id} className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => setSelectedServicePlan(isSelected ? null : plan.id)}
                      disabled={isCheckingOut}
                      aria-pressed={isSelected}
                      className={`group relative overflow-hidden p-2.5 text-left transition-all duration-150 cursor-pointer border-l-0 w-full ${
                        isSelected
                          ? 'rounded-lg border-2 border-dashed border-emerald-400 bg-gray-800/90 pl-3 shadow-md shadow-emerald-950/30'
                          : isDimmed
                            ? 'rounded-lg border border-solid border-gray-700/60 hover:border-gray-600 bg-gray-800/30 hover:bg-gray-800/50 pl-3 opacity-40 hover:opacity-75'
                            : 'rounded-lg border border-solid border-emerald-500/50 hover:border-emerald-400 bg-gray-800/50 hover:bg-gray-800/80 pl-3'
                      }`}
                    >
                      <span
                        className={`absolute inset-y-0 left-0 w-1 transition-opacity ${
                          isSelected
                            ? 'bg-emerald-500 opacity-100'
                            : isDimmed
                              ? 'bg-gray-600 opacity-40 group-hover:opacity-70'
                              : 'bg-emerald-500 opacity-70 group-hover:opacity-100'
                        }`}
                        aria-hidden="true"
                      />
                      <div className={`text-xs font-semibold transition-colors ${
                        isSelected
                          ? 'text-emerald-200'
                          : isDimmed
                            ? 'text-gray-400 group-hover:text-gray-200'
                            : 'text-gray-200 group-hover:text-emerald-300'
                      }`}>
                        {plan.label}
                      </div>
                      <div className={`mt-0.5 text-sm font-bold ${
                        isSelected
                          ? 'text-emerald-300'
                          : isDimmed
                            ? 'text-gray-400 group-hover:text-gray-300'
                            : 'text-emerald-300'
                      }`}>
                        {plan.price !== null ? `$${plan.price.toFixed(2)}` : '—'}
                      </div>
                      <div className={`mt-0.5 text-[10px] ${
                        isSelected
                          ? 'font-bold text-emerald-300'
                          : isDimmed
                            ? 'text-gray-500 group-hover:text-gray-400'
                            : 'text-gray-400'
                      }`}>
                        {isSelected ? '✓ Selected' : hasServiceAccess ? 'Extend' : 'Continuous'}
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Service Plan Notice & Info Dialog: Styled with matching theme and dashed border */}
            {selectedServicePlan && (
              <div
                role="region"
                aria-label="Service Plan Notice"
                className="mt-2.5 relative overflow-hidden rounded-lg border-2 border-l-0 border-dashed border-emerald-400 bg-gray-800/90 pl-3 p-2.5 shadow-md shadow-emerald-950/30 animate-in fade-in duration-200"
              >
                <span
                  className="absolute inset-y-0 left-0 w-1 bg-emerald-500 opacity-100"
                  aria-hidden="true"
                />
                <div className="font-extrabold text-emerald-300 tracking-wide uppercase text-[11px]">
                  ONLY REMOVES THE 4H PAUSE TIMER
                </div>
                <div className="text-emerald-100 text-[11px] mt-0.5">
                  24/7 continuous access only (does not include compute credits or api keys).
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Compute Credits */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-pink-400">2.</span>
                <span className="text-xs font-bold text-white">Hosted Compute Credits</span>
                <span className="text-[11px] text-gray-400 font-normal">(Powers LandSurv AI models)</span>
              </div>
              {computeCredits > 0 && (
                <span className="rounded bg-pink-950/80 border border-pink-500/60 px-2 py-0.5 text-[10px] font-bold text-pink-300">
                  {computeCredits.toLocaleString()} credits remaining
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {computeBuyIns.map((buyIn) => {
                const isSelected = selectedPackage === buyIn.id;
                return (
                  <button
                    key={buyIn.id}
                    type="button"
                    onClick={() => setSelectedPackage(isSelected ? null : buyIn.id)}
                    disabled={isCheckingOut}
                    aria-pressed={isSelected}
                    className={`group relative overflow-hidden rounded-lg p-2.5 text-left transition-all duration-150 cursor-pointer border-l-0 ${
                      isSelected
                        ? 'border-2 border-dashed border-pink-400 bg-gray-800/90 pl-3 shadow-md shadow-pink-950/30'
                        : 'border border-solid border-pink-500/50 hover:border-pink-400 bg-gray-800/50 hover:bg-gray-800/80 pl-3'
                    }`}
                  >
                    <span
                      className={`absolute inset-y-0 left-0 w-1 bg-pink-500 transition-opacity ${
                        isSelected ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'
                      }`}
                      aria-hidden="true"
                    />
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-semibold transition-colors ${isSelected ? 'text-pink-200' : 'text-gray-200 group-hover:text-pink-300'}`}>{buyIn.label}</span>
                      <span className="text-xs font-bold text-pink-300">
                        {buyIn.price !== null ? `$${buyIn.price.toFixed(2)}` : '—'}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs font-bold text-cyan-200">{buyIn.units.toLocaleString()} units</div>
                    <div className="mt-0.5 text-[10px] text-gray-400 leading-tight">{buyIn.desc}</div>
                    {isSelected && <div className="mt-0.5 text-[10px] font-bold text-pink-300">✓ Selected</div>}
                  </button>
                );
              })}

              {/* 4th Option: Prefer to avoid buying compute credits? Bring your own API key */}
              <button
                type="button"
                onClick={() => setShowKeyInput((prev) => !prev)}
                aria-expanded={showKeyInput}
                aria-label="Prefer to avoid buying compute credits? Bring your own API key"
                className={`group relative overflow-hidden rounded-lg p-2.5 text-left transition-all duration-150 cursor-pointer border-l-0 ${
                  showKeyInput
                    ? 'border-2 border-dashed border-cyan-400 bg-gray-800/90 pl-3 shadow-md shadow-cyan-950/30'
                    : 'border border-solid border-cyan-500/50 hover:border-cyan-400 bg-gradient-to-br from-cyan-950/40 via-gray-800/60 to-blue-950/40 hover:bg-gray-800/80 pl-3'
                }`}
              >
                <span
                  className={`absolute inset-y-0 left-0 w-1 bg-cyan-400 transition-opacity ${
                    showKeyInput ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'
                  }`}
                  aria-hidden="true"
                />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs">🔑</span>
                    <span className="text-xs font-semibold text-cyan-200 group-hover:text-cyan-100 truncate">
                      BYO API Key
                    </span>
                  </div>
                  <span className="text-xs font-bold text-emerald-300">Free</span>
                </div>
                <div className="mt-0.5 text-xs font-bold text-cyan-300">
                  {showKeyInput ? 'Hide Key Input ▲' : 'Prefer to avoid buying compute credits?'}
                </div>
                <div className="mt-0.5 text-[10px] text-gray-300 leading-tight">
                  Gemini, OpenAI, Claude, Grok
                </div>
              </button>
            </div>

            {/* Expandable Key Input Panel */}
            {showKeyInput && (
              <div className="mt-2.5 rounded-lg border border-cyan-500/40 bg-gradient-to-r from-cyan-950/60 via-slate-900/80 to-blue-950/60 p-2.5 shadow-md shadow-cyan-950/30 animate-in fade-in duration-200">
                <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-cyan-500/20">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">🔑</span>
                    <span className="text-xs font-bold text-cyan-200">
                      Bring Your Own AI API Key
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowKeyInput(false)}
                    className="text-[10px] text-gray-400 hover:text-gray-200 px-1.5 py-0.5 rounded hover:bg-gray-800"
                  >
                    Close ✕
                  </button>
                </div>

                <div className="space-y-2">
                  <form onSubmit={handleCustomKeySubmit} className="space-y-1.5">
                    <label htmlFor="modalApiKeyInput" className="block text-[11px] font-medium text-cyan-200">
                      Enter Your AI API Key
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showApiKeyText ? 'text' : 'password'}
                          id="modalApiKeyInput"
                          value={apiKeyInput}
                          onChange={(e) => {
                            setApiKeyInput(e.target.value);
                            setKeySuccessMessage(null);
                          }}
                          placeholder="AIza… · sk-… · xai-… · sk-ant-… · lsa_…"
                          className="w-full rounded-md border border-cyan-500/40 bg-gray-800 px-3 py-1.5 pr-14 text-xs font-mono text-gray-100 placeholder-gray-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKeyText(!showApiKeyText)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 hover:text-gray-200 px-1"
                        >
                          {showApiKeyText ? 'Hide' : 'Show'}
                        </button>
                      </div>
                      <button
                        type="submit"
                        disabled={isSavingKey || !apiKeyInput.trim()}
                        className="rounded-md bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 text-xs font-bold text-white transition-all shadow-sm shadow-cyan-950/40 whitespace-nowrap cursor-pointer"
                      >
                        {isSavingKey ? 'Saving...' : 'Save API Key'}
                      </button>
                    </div>
                  </form>

                  {apiKeyInput.trim() && (
                    <p className="text-[10px] text-gray-300">
                      {detectedApiKeyProvider ? (
                        <>Detected provider: <span className="font-semibold text-cyan-300">{PROVIDER_LABELS[detectedApiKeyProvider]}</span></>
                      ) : (
                        <>Provider: <span className="text-gray-400">Accepted: Google AI Studio, OpenAI, Claude, Grok, or LandSurv</span></>
                      )}
                    </p>
                  )}

                  {keySuccessMessage && (
                    <p className="text-[11px] text-emerald-300 font-semibold bg-emerald-950/60 border border-emerald-500/40 rounded p-1.5">
                      ✓ {keySuccessMessage}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-gray-400 pt-0.5">
                    <span>Keys are saved in browser local storage.</span>
                    {onOpenKeyModal && (
                      <button
                        type="button"
                        onClick={onOpenKeyModal}
                        className="text-cyan-300 hover:text-cyan-200 underline font-medium ml-2"
                      >
                        Key Manager →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Locally Hosted, Free & Open Source Option */}
          <div className="rounded-lg border border-emerald-500/30 bg-gradient-to-r from-emerald-950/30 via-slate-900/60 to-cyan-950/30 p-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="relative flex items-center justify-center w-9 h-9 shrink-0" title="Free / No Cost">
                  <span className="select-none text-2xl font-black text-emerald-400 font-mono leading-none tracking-tight">
                    $
                  </span>
                  <svg
                    className="absolute inset-0 w-full h-full pointer-events-none text-rose-500"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.25"
                    strokeLinecap="round"
                  >
                    <circle cx="12" cy="12" r="9.5" />
                    <line x1="5.3" y1="5.3" x2="18.7" y2="18.7" />
                  </svg>
                </span>
                <div>
                  <span className="text-xs font-bold text-emerald-300">
                    Locally Hosted, Free and Open Source Option
                  </span>
                  <p className="text-[10px] text-gray-300">
                    Run the engine locally at zero cost under the permissive Apache-2.0 license.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <a
                  href="https://github.com/LandSurvAi/landsurv-core"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2 py-1 rounded text-[10px] font-semibold text-white bg-emerald-700 hover:bg-emerald-600 transition-colors shadow-sm inline-flex items-center gap-1"
                >
                  GitHub →
                </a>
                <a
                  href="https://opensource.landsurv.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-semibold text-cyan-300 hover:text-cyan-200 underline whitespace-nowrap"
                >
                  Open Source Info
                </a>
              </div>
            </div>
          </div>

          {/* Email input for Key Delivery (Single rolling slot: enter then confirm) */}
          <div className="rounded-lg border border-gray-700/80 bg-gray-800/40 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="checkoutEmail" className="block text-xs font-semibold text-gray-200">
                {emailStep === 'entry' ? (
                  <>
                    Your Email <span className="text-gray-400 font-normal text-[11px]">(enabling key and invoice delivery)</span>
                  </>
                ) : (
                  <>
                    Confirm Email <span className="text-emerald-300 font-normal text-[11px]">(re-enter to ensure delivery)</span>
                  </>
                )}
              </label>

              {emailStep === 'confirm' && (
                <button
                  type="button"
                  onClick={() => setEmailStep('entry')}
                  className="text-[10px] text-cyan-300 hover:text-cyan-200 underline font-medium cursor-pointer"
                >
                  Edit address
                </button>
              )}
            </div>

            {/* Rolling input: One single input box that rolls between Step 1 (enter email) and Step 2 (confirm email) */}
            <div>
              {emailStep === 'entry' ? (
                <div className="flex gap-2">
                  <input
                    type="email"
                    id="checkoutEmail"
                    value={statusEmail}
                    onChange={(e) => {
                      setStatusEmail(e.target.value);
                      if (confirmEmail) setConfirmEmail('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (statusEmailIsValid) setEmailStep('confirm');
                      }
                    }}
                    placeholder="surveyor@company.com"
                    className="flex-1 rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400"
                  />
                  <button
                    type="button"
                    onClick={() => setEmailStep('confirm')}
                    disabled={!statusEmailIsValid}
                    className="shrink-0 rounded-md bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 text-xs font-semibold text-white transition-colors cursor-pointer"
                  >
                    Next →
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="email"
                    id="checkoutEmail"
                    aria-label="Confirm Email"
                    value={confirmEmail}
                    onChange={(e) => setConfirmEmail(e.target.value)}
                    placeholder="Re-type your email to confirm"
                    className={`flex-1 rounded-md border bg-gray-800 px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 ${
                      trimmedConfirmEmail && !emailsMatch
                        ? 'border-rose-500/80 focus:ring-rose-400 focus:border-rose-400'
                        : emailFullyVerified
                          ? 'border-emerald-500/80 focus:ring-emerald-400 focus:border-emerald-400'
                          : 'border-gray-700 focus:ring-emerald-400 focus:border-emerald-400'
                    }`}
                    autoFocus
                  />
                  {emailFullyVerified && (
                    <span className="shrink-0 inline-flex items-center px-2 py-0.5 text-xs font-bold text-emerald-300 bg-emerald-950/70 border border-emerald-500/50 rounded-md">
                      ✓ Match
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Validation / Helper note */}
            {emailStep === 'confirm' && trimmedConfirmEmail && !emailsMatch && (
              <p className="text-[10px] text-rose-300 font-medium">Emails do not match. Please re-enter carefully.</p>
            )}
            {emailFullyVerified && (
              <p className="text-[10px] text-emerald-300 font-medium">✓ Email confirmed ({trimmedStatusEmail})</p>
            )}
            {statusNote && emailStep === 'entry' && (
              <p className="text-[10px] text-emerald-300 font-medium">{statusNote}</p>
            )}
          </div>
        </div>

        {/* Footer / Checkout (pinned fixed to bottom, never scrolls out of view) */}
        <div className="shrink-0 border-t border-gray-800 bg-gray-900 px-5 py-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="text-gray-300 font-medium">
              {selectedServicePlan || selectedPackage ? (
                <span>
                  {selectedServicePlan && `Service (${selectedServicePlan})`}
                  {selectedServicePlan && selectedPackage && ' + '}
                  {selectedPackage && `Compute (${selectedPackage})`}
                </span>
              ) : (
                <span className="text-gray-400">No plan selected</span>
              )}
            </div>
            <div className="text-sm sm:text-base font-extrabold text-white">
              Total: ${checkoutTotal.toFixed(2)}
            </div>
          </div>

          {checkoutError && (
            <p role="alert" className="text-xs text-rose-300 bg-rose-950/60 border border-rose-500/50 p-2 rounded">
              {checkoutError}
            </p>
          )}

          <button
            type="button"
            onClick={handleCheckout}
            disabled={isCheckingOut || !selectedPricesReady || (!selectedPackage && !selectedServicePlan)}
            className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed px-4 py-2 text-xs sm:text-sm font-bold text-white transition-colors shadow-md shadow-emerald-950/40 cursor-pointer"
          >
            {isCheckingOut ? 'Opening Secure Checkout...' : `Proceed to Checkout · $${checkoutTotal.toFixed(2)}`}
          </button>

          <div className="flex items-center justify-between text-[11px] text-gray-400">
            <span>Secure 256-bit Stripe checkout</span>
            {onOpenKeyModal && (
              <button
                type="button"
                onClick={onOpenKeyModal}
                className="text-cyan-300 hover:text-cyan-200 underline font-medium"
              >
                Already have a key? Enter Key →
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default UpgradeModal;

