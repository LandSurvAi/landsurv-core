// ApiKeyOrPayModal.tsx
// Modal allowing users to enter either a LandSurv Enabling Key or their own Google Gemini API key.
// AI features can be unlocked by either key type depending on account setup.

import React, { useEffect, useState } from 'react';
import { getShortRefreshInstruction } from '../utils/browserDetection';
import { useAppState } from '../contexts/AppStateContext.tsx';
import { getCreditRunwayUnitsPerDay, useGlobalSettings } from '../utils/globalSettings';
import { detectKeyProvider, PROVIDER_LABELS, PROVIDER_KEY_URLS } from '../services/providerKeys.ts';
import { isOssBuild } from '../utils/ossMode';

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

interface ApiKeyOrPayModalProps {
  isOpen: boolean;
  onSubmitApiKey: (apiKey: string) => boolean | Promise<boolean>;
  onSubmitServiceKey?: (serviceKey: string) => boolean | Promise<boolean>;
  onProceedWithPayment: (creditPackage: '1K' | '5K' | '10K') => void;
  onProceedWithServicePayment?: (servicePlan: '1M' | '3M' | '6M' | '1Y') => void;
  onProceedWithCheckout?: (selection: CheckoutSelection) => void | Promise<void>;
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
}

export interface CheckoutSelection {
  creditPackage?: '1K' | '5K' | '10K';
  servicePlan?: '1M' | '3M' | '6M' | '1Y';
  customerEmail?: string;
}

interface ServiceStatusLookup {
  status: 'active' | 'expired' | 'none';
  expiresAt: string | null;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface BillingConfig {
  stripeMode: 'test' | 'live';
  checkoutMode: 'disabled' | 'canary' | 'live';
  checkoutEnabled: boolean;
  catalogReady: boolean;
  catalog: BillingCatalogItem[];
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

const COMPUTE_BUY_INS = [
  { id: '1K', label: 'Starter Buy-In', units: 2250, multiplier: 1 },
  { id: '5K', label: 'Growth Buy-In', units: 4500, multiplier: 2 },
  { id: '10K', label: 'Pro Buy-In', units: 6750, multiplier: 3 },
] as const;

const SERVICE_PLANS = [
  { id: '1M', label: '1 month' },
  { id: '3M', label: '3 months' },
  { id: '6M', label: '6 months' },
  { id: '1Y', label: '1 year' },
] as const;

const ApiKeyOrPayModal: React.FC<ApiKeyOrPayModalProps> = ({ 
  isOpen, 
  onSubmitApiKey, 
  onSubmitServiceKey,
  onProceedWithPayment,
  onProceedWithServicePayment,
  onProceedWithCheckout,
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
  remainingTime = 0,
  timeUntilAvailable = 0,
  currentKeyDetails = null,
  customerEmail = null,
}) => {
  const [serviceKey, setServiceKey] = useState('');
  const [inferenceKey, setInferenceKey] = useState('');
  const [showServiceKey, setShowServiceKey] = useState(false);
  const [showInferenceKey, setShowInferenceKey] = useState(false);
  const [activeTab, setActiveTab] = useState<'apikey' | 'service' | 'payment'>('apikey');
  const [selectedPackage, setSelectedPackage] = useState<'1K' | '5K' | '10K' | null>(null);
  const [selectedServicePlan, setSelectedServicePlan] = useState<'1M' | '3M' | '6M' | '1Y' | null>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [validatingKeyType, setValidatingKeyType] = useState<'service' | 'inference' | null>(null);
  const [billingConfig, setBillingConfig] = useState<BillingConfig | null>(null);
  const [statusEmail, setStatusEmail] = useState(customerEmail || '');
  const [statusLookup, setStatusLookup] = useState<ServiceStatusLookup | null>(null);
  const [statusLookupState, setStatusLookupState] = useState<'idle' | 'checking' | 'done' | 'error'>('idle');
  const { addNotification } = useAppState();

  // OSS/local-mode build: no Stripe/PayPal backend exists, so this modal only
  // ever shows the BYOK key tab (no Service Access / Compute Credits tabs).
  const ossMode = isOssBuild();

  const globalSettings = useGlobalSettings();
  const normalUseUnitsPerDay = getCreditRunwayUnitsPerDay(globalSettings);

  useEffect(() => {
    if (!isOpen || ossMode) return;
    let cancelled = false;

    const serviceKey = typeof localStorage === 'undefined' ? null : localStorage.getItem('landsurv_service_key');
    fetch('/api/billing/config', serviceKey ? { headers: { Authorization: `Bearer ${serviceKey}` } } : undefined)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((config: BillingConfig) => {
        if (!cancelled) setBillingConfig(config);
      })
      .catch(() => {
        if (!cancelled) setBillingConfig({ stripeMode: 'test', checkoutMode: 'disabled', checkoutEnabled: false, catalogReady: false, catalog: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const trimmedStatusEmail = statusEmail.trim();
  const statusEmailIsValid = EMAIL_PATTERN.test(trimmedStatusEmail);

  useEffect(() => {
    if (!isOpen || ossMode || !statusEmailIsValid) {
      setStatusLookup(null);
      setStatusLookupState('idle');
      return;
    }

    const controller = new AbortController();
    setStatusLookupState('checking');
    // Debounced so we don't burn the deliberately tight server-side rate limit while typing.
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

  const formatPackageDuration = (units: number): string => {
    const days = units / normalUseUnitsPerDay;
    if (days < 14) {
      return `~${Math.max(1, Math.round(days))} day${Math.round(days) === 1 ? '' : 's'}`;
    }

    const weeks = days / 7;
    if (weeks < 8) {
      return `~${Math.round(weeks)} week${Math.round(weeks) === 1 ? '' : 's'}`;
    }

    const months = days / 30;
    return `~${months.toFixed(months >= 10 ? 0 : 1)} month${months >= 2 ? 's' : ''}`;
  };

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
    if (isFreeTierLocked) return;
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

  const handleCheckout = async () => {
    if (!selectedPackage && !selectedServicePlan) return;
    if (!billingConfig?.checkoutEnabled) {
      setCheckoutError('Checkout is temporarily unavailable');
      return;
    }
    if (selectedServicePlan && !statusEmailIsValid) {
      setCheckoutError('Enter a valid email address for service access');
      return;
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
      } else if (selectedPackage) {
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

  const catalogPriceBySelection = new Map(
    (billingConfig?.catalog || []).map((item) => [item.selection, item.unitAmount / 100])
  );
  const computeBuyIns = COMPUTE_BUY_INS.map((buyIn) => ({
    ...buyIn,
    price: catalogPriceBySelection.get(buyIn.id) ?? null,
  }));
  const servicePlans = SERVICE_PLANS.map((plan) => ({
    ...plan,
    price: catalogPriceBySelection.get(plan.id) ?? null,
  }));
  const starterPrice = computeBuyIns[0].price;
  const starterUnitsPerDollar = starterPrice ? computeBuyIns[0].units / starterPrice : null;
  const selectedComputeBuyIn = computeBuyIns.find((buyIn) => buyIn.id === selectedPackage);
  const selectedService = servicePlans.find((plan) => plan.id === selectedServicePlan);
  const selectedPricesReady = (!selectedPackage || selectedComputeBuyIn?.price !== null)
    && (!selectedServicePlan || selectedService?.price !== null);
  const checkoutTotal = (selectedComputeBuyIn?.price || 0) + (selectedService?.price || 0);

  // The two things a user must have before any AI will run.
  const hasCompute = hasGoogleApiKey || hasLandSurvKey || computeCredits > 0;
  const computeSourceLabel = hasGoogleApiKey
    ? 'Your own Google key'
    : hasLandSurvKey
      ? 'LandSurv hosted compute'
      : computeCredits > 0
        ? `${computeCredits.toLocaleString()} credits`
        : null;

  // Continuous Service is the tier a paid duration buys, so picking either one lights up both.
  const continuousServiceSelected = hasServiceAccess || selectedServicePlan !== null;
  const showUpgradeBadge = !hasServiceAccess && selectedServicePlan !== null;
  const toggleContinuousService = () => setSelectedServicePlan((prev) => (prev ? null : '1M'));

  const statusMessage = ((): { text: string; tone: string } => {
    if (!trimmedStatusEmail) {
      return { text: 'Enter the email you purchased with to see your current service status.', tone: 'text-gray-400' };
    }
    if (!statusEmailIsValid) {
      return { text: 'Enter a valid email address.', tone: 'text-amber-300' };
    }
    if (statusLookupState === 'checking') {
      return { text: 'Checking service status…', tone: 'text-gray-400' };
    }
    if (statusLookupState === 'error') {
      return { text: 'Could not check status right now. You can still complete checkout.', tone: 'text-amber-300' };
    }
    if (statusLookup?.status === 'active') {
      const through = statusLookup.expiresAt
        ? ` through ${new Date(statusLookup.expiresAt).toLocaleDateString()}`
        : '';
      return { text: `Active service found${through}. Buying now extends the same Enabling Key.`, tone: 'text-emerald-300' };
    }
    if (statusLookup?.status === 'expired') {
      return { text: 'Service found, but it has expired. Buying now reactivates your existing Enabling Key.', tone: 'text-amber-300' };
    }
    if (statusLookup?.status === 'none') {
      return { text: 'No service found for this address. A new Enabling Key will be emailed here.', tone: 'text-cyan-300' };
    }
    return { text: '', tone: 'text-gray-400' };
  })();

  return (
    // No backdrop-blur here: the overlay is already 97% opaque, and a blurred ancestor forces
    // Chromium to re-rasterize the whole backdrop on every wheel tick inside the panel (flicker).
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
          {!isFreeTierLocked && onClose && (
            <button
              aria-label="Close"
              onClick={handleClose}
              className="text-gray-400 hover:text-white"
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
                Purchase Service Access to disable the 4h on / 4h off schedule.
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
                {getAgentName()} needs an inference source. Choose hosted compute on your LandSurv key or connect your own Google key.
              </p>
            </>
          ) : computeCredits > 0 ? (
            <>
              <h2 className="text-base font-bold text-white">
                💳 Compute Credits Available
              </h2>
              <p className="text-blue-100 text-xs mt-0.5">
                Credits remaining: <span className="font-mono font-bold text-green-300">{computeCredits.toLocaleString()}</span>
              </p>
            </>
          ) : (
            <>
              <h2 className="text-base font-bold text-white">
                Connect Access and Inference
              </h2>
            </>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActiveTab('apikey')}
            aria-label="Keys"
            className={`flex-1 py-2 px-3 text-sm font-semibold transition-colors ${
              activeTab === 'apikey'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <span aria-hidden="true" className="flex items-center justify-center gap-1.5">
              <span>🔑</span>
              <span>Keys</span>
            </span>
          </button>
          {!ossMode && (
          <button
            onClick={() => setActiveTab('service')}
            aria-label="Service Access"
            className={`flex-1 py-2 px-2 text-sm font-semibold transition-colors ${
              activeTab === 'service'
                ? 'text-emerald-300 border-b-2 border-emerald-300'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <span aria-hidden="true" className="flex items-center justify-center gap-1.5">
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${activeTab === 'service' ? 'bg-emerald-300 text-emerald-950' : 'border border-emerald-400/60 text-emerald-300'}`}>1</span>
              <span>Service Access</span>
            </span>
          </button>
          )}
          {!ossMode && (
          <button
            onClick={() => setActiveTab('payment')}
            aria-label="Compute Credits"
            className={`flex-1 py-2 px-3 text-sm font-semibold transition-colors ${
              activeTab === 'payment'
                ? 'text-pink-300 border-b-2 border-pink-300'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <span aria-hidden="true" className="flex items-center justify-center gap-1.5">
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${activeTab === 'payment' ? 'bg-pink-300 text-pink-950' : 'border border-pink-400/60 text-pink-300'}`}>2</span>
              <span>💳</span>
              <span>Compute Credits</span>
            </span>
          </button>
          )}
        </div>

        {/* Content */}
        <div className="px-3 py-2.5">
          {activeTab !== 'apikey' && (
            <div role="alert" className="mb-4 rounded border border-[#f4a39a]/60 bg-[#251f29]/90 px-3 py-2.5 shadow-[inset_3px_0_0_0_rgba(125,226,209,0.75)]">
              {!billingConfig ? (
                <p className="text-sm font-bold text-slate-200">Checking secure checkout availability...</p>
              ) : billingConfig.checkoutMode === 'disabled' ? (
                <>
                  <p className="text-sm font-bold text-[#ffd0ca]">Payments are temporarily unavailable.</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-300">Your selections will remain here while checkout is unavailable.</p>
                </>
              ) : billingConfig.stripeMode === 'test' ? (
                <>
                  <p className="text-sm font-bold text-[#ffd0ca]">Payments are not enabled yet.</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-300">
                    We are working through live checkout testing using <span className="font-semibold text-[#7de2d1]">Stripe Sandbox</span>. Transactions are for testing only; no real charges will be processed.
                  </p>
                </>
              ) : billingConfig.checkoutMode === 'canary' ? (
                <>
                  <p className="text-sm font-bold text-emerald-200">Secure live checkout is in limited release.</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-300">Approved canary customers will be charged by Stripe when checkout is completed.</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-bold text-emerald-200">Secure live checkout is enabled.</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-300">Stripe will charge your selected payment method when checkout is completed.</p>
                </>
              )}
            </div>
          )}
          {activeTab === 'apikey' || ossMode ? (
            <div className="space-y-2">
              {/* Plain-language explainer: two SEPARATE purchases. Badge 1 = emerald (matches the
                  "Service Access" tab), badge 2 = pink (matches the "Compute Credits" tab), so
                  the color carries through to the tabs and the key input boxes below. */}
              <div className="rounded-lg border border-gray-600/50 bg-gray-900/30 p-2.5">
                <p className="text-[11px] font-bold text-white">2 separate things turn the AI on — you need both:</p>

                {/* Branch 1: Service Access (single path) */}
                <div className="mt-2 flex items-start gap-2 rounded border border-emerald-500/40 bg-emerald-950/20 p-1.5">
                  <span className={`mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${hasServiceAccess ? 'bg-emerald-300 text-emerald-950' : 'border border-emerald-400/60 text-emerald-300'}`}>1</span>
                  <p className="text-[11px] leading-snug text-gray-200">
                    <span className="font-bold text-emerald-200">Service Access</span> — keeps the app switched on. Without it: 4 hours on, 4 hours off.
                    <span className={`ml-1 font-semibold ${hasServiceAccess ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {hasServiceAccess ? 'Active.' : 'Not purchased.'}
                    </span>
                  </p>
                </div>

                {/* Branch 2: Compute, which itself forks into credits OR BYOK */}
                <div className="mt-1.5 rounded border border-pink-500/40 bg-pink-950/20 p-1.5">
                  <div className="flex items-start gap-2">
                    <span className={`mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${hasCompute ? 'bg-pink-300 text-pink-950' : 'border border-pink-400/60 text-pink-300'}`}>2</span>
                    <p className="text-[11px] leading-snug text-gray-200">
                      <span className="font-bold text-pink-200">Compute</span> — pays for the AI's thinking.
                      <span className={`ml-1 font-semibold ${hasCompute ? 'text-pink-300' : 'text-rose-300'}`}>
                        {hasCompute ? `Active: ${computeSourceLabel}.` : 'Not connected.'}
                      </span>
                    </p>
                  </div>
                  {/* Visual fork: Compute splits into exactly one of two choices */}
                  <div className="ml-6 mt-1 border-l-2 border-pink-400/40 pl-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-pink-300/80">Then pick ONE:</p>
                    <div className="mt-1 flex items-stretch gap-1.5">
                      <div className={`flex-1 rounded border p-1.5 text-[10px] leading-snug ${!hasGoogleApiKey && (hasLandSurvKey || computeCredits > 0) ? 'border-pink-400/60 bg-pink-950/40 text-pink-100' : 'border-gray-600/50 text-gray-300'}`}>
                        Buy LandSurv Compute Credits
                      </div>
                      <div className="flex shrink-0 items-center text-[9px] font-black text-gray-500">OR</div>
                      <div className={`flex-1 rounded border p-1.5 text-[10px] leading-snug ${hasGoogleApiKey ? 'border-pink-400/60 bg-pink-950/40 text-pink-100' : 'border-gray-600/50 text-gray-300'}`}>
                        Use your own free Google key
                      </div>
                    </div>
                  </div>
                </div>

                {!hasCompute && (
                  <details className="group mt-2 rounded border border-pink-400/50 bg-pink-950/30">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2 py-1 text-[10px] font-bold text-pink-200">
                      <span aria-hidden="true" className="text-yellow-300">💡</span>
                      <span>Why do I need both?</span>
                      <span className="ml-auto text-pink-300/70 group-open:hidden">Show ▾</span>
                      <span className="ml-auto hidden text-pink-300/70 group-open:inline">Hide ▴</span>
                    </summary>
                    <p className="px-2 pb-1.5 text-[11px] font-semibold leading-snug text-pink-100">
                      Buying Service Access on its own will not run the AI. You still need compute — either credits or your own Google key.
                    </p>
                  </details>
                )}
              </div>

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
                      This key is stored only in your browser and is associated with your signed account or current session. There is no external key record ID for user-supplied Google keys.
                    </p>
                  )}
                </details>
              )}
              {hasLandSurvKey && (
                <div role="status" className="rounded-lg border border-emerald-400/60 bg-emerald-950/40 px-2.5 py-2">
                  <p className="text-sm font-bold text-emerald-200">Your LandSurv key covers both.</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-emerald-100/80">
                    Service access and LandSurv-hosted AI inference are connected. You do not need a separate Google key.
                  </p>
                </div>
              )}
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/20 p-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-bold text-emerald-200">LandSurv Enabling Key</h3>
                      {/* Ties this key to the numbered explainer/tabs above: covers both 1 and 2. */}
                      <span className="flex items-center gap-1">
                        <span title="Covers Service Access" className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-black ${hasServiceAccess ? 'bg-emerald-300 text-emerald-950' : 'border border-emerald-400/60 text-emerald-300'}`}>1</span>
                        <span title="Covers Compute" className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-black ${!hasGoogleApiKey && (hasLandSurvKey || computeCredits > 0) ? 'bg-pink-300 text-pink-950' : 'border border-pink-400/60 text-pink-300'}`}>2</span>
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-snug text-gray-300">
                      The single key emailed after any purchase. Switches on whatever you bought — service, credits, or both.
                    </p>
                  </div>
                  <span className={`shrink-0 rounded px-2 py-1 text-[10px] font-bold uppercase ${hasServiceAccess ? 'bg-emerald-300 text-emerald-950' : 'bg-gray-700 text-gray-300'}`}>
                    {hasLandSurvKey ? 'Connected · Both covered' : hasServiceAccess ? 'Connected' : 'Not connected'}
                  </span>
                </div>
                <form onSubmit={handleServiceKeySubmit} className="mt-2 flex flex-col gap-2 sm:flex-row">
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
                  <button type="submit" disabled={validatingKeyType !== null} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60">
                    {validatingKeyType === 'service' ? 'Checking...' : 'Connect LandSurv Key'}
                  </button>
                </form>
              </div>

              <div className="flex items-center gap-3 px-1" aria-hidden="true">
                <span className={`h-px flex-1 ${hasLandSurvKey ? 'bg-gray-700' : 'bg-pink-500/50'}`} />
                <span className={`text-[10px] font-bold uppercase ${hasLandSurvKey ? 'text-gray-500' : 'text-pink-400'}`}>{hasLandSurvKey ? 'Inference covered' : 'Or bring your own compute'}</span>
                <span className={`h-px flex-1 ${hasLandSurvKey ? 'bg-gray-700' : 'bg-pink-500/50'}`} />
              </div>

              <div className="rounded-lg border border-cyan-500/40 bg-cyan-950/20 p-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-bold text-cyan-200">Your AI Provider API Key</h3>
                      {/* Ties this key to the numbered explainer/tabs above: this is the Compute (2) option. */}
                      <span title="Covers Compute" className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-black ${hasGoogleApiKey ? 'bg-pink-300 text-pink-950' : 'border border-pink-400/60 text-pink-300'}`}>2</span>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-snug text-gray-300">
                      {hasLandSurvKey
                        ? 'Optional. Runs the AI on your own provider account (Google, OpenAI, xAI, or Anthropic) so the provider bills you instead of spending your credits.'
                        : 'Free alternative to buying credits: the provider bills you directly. Does not remove the 4h on / 4h off schedule.'}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded px-2 py-1 text-[10px] font-bold uppercase ${hasGoogleApiKey ? 'bg-cyan-300 text-cyan-950' : hasLandSurvKey ? 'bg-emerald-300 text-emerald-950' : 'bg-gray-700 text-gray-300'}`}>
                    {hasGoogleApiKey ? 'Key connected' : hasLandSurvKey ? 'Covered by LandSurv' : 'Optional'}
                  </span>
                </div>
                <form onSubmit={handleInferenceKeySubmit} className="mt-2 flex flex-col gap-2 sm:flex-row">
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
                  <button type="submit" disabled={validatingKeyType !== null} className="shrink-0 rounded-md bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-60">
                    {validatingKeyType === 'inference' ? 'Saving...' : 'Use My Key Instead of Compute Credits'}
                  </button>
                </form>
                {inferenceKey.trim() && (
                  <p className="mt-1.5 text-[11px] text-gray-300" data-testid="inference-key-provider">
                    {detectedInferenceProvider && detectedInferenceProvider !== 'landsurv'
                      ? <>Detected: <span className="font-semibold text-cyan-300">{PROVIDER_LABELS[detectedInferenceProvider]}</span> — AI chat for that provider's models will run on your account.</>
                      : detectedInferenceProvider === 'landsurv'
                        ? <>Detected: <span className="font-semibold text-emerald-300">{PROVIDER_LABELS.landsurv}</span> — paste it in the Enabling Key field above instead.</>
                        : <>Unrecognized format — will be tried as a Google AI Studio key.</>}
                  </p>
                )}
                <p className="mt-1.5 text-[11px] text-gray-400">
                  No key? Create one:
                  {' '}<a href={PROVIDER_KEY_URLS.google} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline hover:text-cyan-200">Google AI Studio</a> ·
                  {' '}<a href={PROVIDER_KEY_URLS.openai} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline hover:text-cyan-200">OpenAI</a> ·
                  {' '}<a href={PROVIDER_KEY_URLS.xai} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline hover:text-cyan-200">xAI</a> ·
                  {' '}<a href={PROVIDER_KEY_URLS.anthropic} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline hover:text-cyan-200">Anthropic</a>
                </p>
              </div>

              <div className="pt-2 border-t border-gray-700 space-y-0.5">
                <p className="text-[11px] text-center text-gray-400 leading-snug">
                  Keys are stored locally in this browser. Tip: {refreshInstruction} if you are having problems.
                </p>
                
                {/* Go Home Button for Premium Features */}
                {isPremium && onGoHome && (
                  <button
                    onClick={onGoHome}
                    className="w-full mt-3 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-semibold py-2 px-4 rounded-md transition-colors border border-gray-600"
                  >
                    ← Return to Agent Selection
                  </button>
                )}
              </div>
            </div>
          ) : activeTab === 'service' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <article
                  aria-current={!hasServiceAccess ? 'true' : undefined}
                  aria-label={`Free Service${!hasServiceAccess ? ', current tier' : ''}`}
                  className={`rounded-lg border p-3 ${!hasServiceAccess
                    ? 'border-cyan-300/70 bg-cyan-950/40 ring-2 ring-cyan-300/25'
                    : 'border-gray-600 bg-gray-800/70'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-cyan-100">Free Service</h3>
                    {!hasServiceAccess && <span className="rounded bg-cyan-300 px-2 py-0.5 text-[10px] font-black uppercase text-cyan-950">Current tier</span>}
                  </div>
                  <p className="mt-2 text-xs font-bold text-white">4 hours on / 4 hours off</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-gray-300">
                    Your own API key enables AI inference, but it does not bypass this service schedule.
                  </p>
                </article>

                <article
                  aria-current={hasServiceAccess ? 'true' : undefined}
                  aria-label={`Continuous Service${hasServiceAccess ? ', current tier' : ''}`}
                  className={`relative rounded-lg border p-3 transition-colors ${continuousServiceSelected
                    ? 'border-emerald-300/70 bg-emerald-950/40 ring-2 ring-emerald-300/25'
                    : 'border-gray-600 bg-gray-800/70 hover:border-emerald-400/50'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-emerald-200">Continuous Service</h3>
                    {hasServiceAccess ? (
                      <span className="rounded bg-emerald-300 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-950">Current tier</span>
                    ) : showUpgradeBadge ? (
                      <span className="rounded bg-emerald-300 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-950">Upgrade</span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs font-bold text-white">No 4-hour pause</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-gray-300">
                    AI inference remains separate and requires your own API key or hosted compute credits.
                  </p>
                  {hasServiceAccess && serviceAccessExpiresAt && (
                    <p className="mt-2 text-[11px] font-semibold text-emerald-300">
                      Active through {new Date(serviceAccessExpiresAt).toLocaleDateString()}
                    </p>
                  )}
                  {/* Overlay button keeps the card keyboard-operable without changing its article role. */}
                  <button
                    type="button"
                    onClick={toggleContinuousService}
                    aria-pressed={selectedServicePlan !== null}
                    className="absolute inset-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  >
                    <span className="sr-only">
                      {hasServiceAccess ? 'Extend Continuous Service' : 'Upgrade to Continuous Service'}
                    </span>
                  </button>
                </article>
              </div>

              <div className="rounded-lg border border-gray-600 bg-gray-900/60 p-2.5">
                <label htmlFor="statusEmail" className="block text-[10px] font-bold uppercase tracking-wide text-gray-300">
                  Your email
                </label>
                <input
                  type="email"
                  id="statusEmail"
                  value={statusEmail}
                  onChange={(e) => setStatusEmail(e.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                  className="mt-1 w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-1.5 text-sm text-gray-200 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p role="status" aria-live="polite" className={`mt-1 text-[11px] leading-snug ${statusMessage.tone}`}>
                  {statusMessage.text}
                </p>
              </div>

              <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Choose an access duration</p>
              <div className="grid grid-cols-2 gap-2">
                {servicePlans.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedServicePlan(selectedServicePlan === plan.id ? null : plan.id)}
                    disabled={isCheckingOut || (!onProceedWithCheckout && !onProceedWithServicePayment)}
                    aria-pressed={selectedServicePlan === plan.id}
                    className={`disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold py-3 px-3 rounded-md border transition-colors ${selectedServicePlan === plan.id
                      ? 'border-emerald-300 bg-emerald-900/50 ring-2 ring-emerald-300/30'
                      : 'border-gray-600 bg-gray-700 hover:bg-gray-600'}`}
                  >
                    <div>{plan.label}</div>
                    <div className="text-emerald-300 text-sm mt-1">{plan.price === null ? 'Price unavailable' : `$${plan.price.toFixed(2)}`}</div>
                    {hasServiceAccess && <div className="mt-1 text-[10px] font-medium text-gray-300">Extend current access</div>}
                    {selectedServicePlan === plan.id && (
                      <div className="mt-1 text-[11px] font-bold text-emerald-200">
                        {hasServiceAccess ? 'Selected' : 'Upgrade selected'}
                      </div>
                    )}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Your first purchase emails one durable Enabling Key. Renewals and compute credits remain attached to that same key.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-yellow-900/20 border border-yellow-500/40 rounded-lg p-4">
                <h3 className="text-base font-bold text-yellow-200 mb-1">Buy hosted compute credits</h3>
                <p className="text-gray-200 text-xs leading-relaxed">
                  Pick the buy-in level that matches your expected usage. These are one-time hosted compute packs, not recurring subscriptions.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {computeBuyIns.map((buyIn) => {
                  const unitsPerDollar = buyIn.price ? buyIn.units / buyIn.price : null;
                  const valueGain = unitsPerDollar && starterUnitsPerDollar
                    ? Math.round((unitsPerDollar / starterUnitsPerDollar - 1) * 100)
                    : null;

                  return (
                    <button
                      key={buyIn.id}
                      type="button"
                      onClick={() => setSelectedPackage(selectedPackage === buyIn.id ? null : buyIn.id)}
                      disabled={isCheckingOut}
                      aria-pressed={selectedPackage === buyIn.id}
                      className={`disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold py-3 px-3 rounded-md border transition-colors ${selectedPackage === buyIn.id
                        ? 'border-yellow-300 bg-yellow-900/40 ring-2 ring-yellow-300/30'
                        : 'border-gray-600 bg-gray-700 hover:bg-gray-600'}`}
                    >
                      <div>{buyIn.label}</div>
                      <div className="mt-1 text-base font-bold text-cyan-200">{buyIn.units.toLocaleString()} units</div>
                      <div className="text-[11px] text-gray-300">{buyIn.multiplier}x Starter units</div>
                      <div className="mt-1 text-xs text-yellow-300">{buyIn.price === null ? 'Price unavailable' : `$${buyIn.price.toFixed(2)}`}</div>
                      {unitsPerDollar !== null && valueGain !== null && (
                        <div className="mt-1 text-[11px] font-semibold text-emerald-300">
                          {valueGain === 0 ? 'Base value' : `${valueGain}% more value`} · {unitsPerDollar.toFixed(valueGain === 0 ? 0 : 1)} units/$1
                        </div>
                      )}
                      <div className="mt-1 text-[11px] text-gray-300">{formatPackageDuration(buyIn.units)} of normal use</div>
                      {selectedPackage === buyIn.id && <div className="text-[11px] mt-1">Selected</div>}
                    </button>
                  );
                })}
              </div>

              <p className="text-[11px] text-gray-400 leading-relaxed">
                Buy-ins are sized from a normal-use baseline of {normalUseUnitsPerDay.toLocaleString()} compute units/day. Heavy AI work can consume credits faster.
              </p>

              <button
                type="button"
                onClick={() => setActiveTab('apikey')}
                className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white text-sm font-semibold py-2 px-4 rounded-md transition-all duration-200 shadow-lg"
              >
                Manage Access and Inference Keys
              </button>

              {/* Go Home Button for Premium Features */}
              {isPremium && onGoHome && (
                <button
                  onClick={onGoHome}
                  className="w-full mt-3 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-semibold py-2 px-4 rounded-md transition-colors border border-gray-600"
                >
                  ← Return to Agent Selection
                </button>
              )}
            </div>
          )}
        </div>

        {activeTab !== 'apikey' && !ossMode && (
          <div className="border-t border-gray-700 bg-gray-900/70 px-4 py-3">
            <div className={`mb-3 rounded-md border px-3 py-2 ${selectedPackage && selectedServicePlan
              ? 'border-emerald-400/50 bg-emerald-950/40'
              : 'border-cyan-400/40 bg-cyan-950/30'}`}
            >
              <p className="text-xs font-bold text-cyan-100">
                {selectedPackage && selectedServicePlan ? 'Recommended bundle ready' : 'Recommended: bundle service + compute'}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-gray-300">
                Continuous service removes the 4-hour pause; compute credits power hosted AI. Add both now and complete one checkout.
              </p>
              {selectedServicePlan && !selectedPackage && (
                <button type="button" onClick={() => setActiveTab('payment')} className="mt-2 text-xs font-bold text-yellow-300 hover:text-yellow-200 underline">
                  Add compute credits
                </button>
              )}
              {selectedPackage && !selectedServicePlan && (
                <button type="button" onClick={() => setActiveTab('service')} className="mt-2 text-xs font-bold text-emerald-300 hover:text-emerald-200 underline">
                  Add service access
                </button>
              )}
            </div>

            <div className="mb-2 flex items-start justify-between gap-3 text-xs">
              <div className="text-gray-300">
                <p>{selectedService ? `Service: ${selectedService.label}` : 'Service: not selected'}</p>
                <p>{selectedComputeBuyIn ? `Compute: ${selectedComputeBuyIn.units.toLocaleString()} units` : 'Compute: not selected'}</p>
              </div>
              <p className="text-base font-black text-white">${checkoutTotal.toFixed(2)}</p>
            </div>
            <button
              type="button"
              onClick={handleCheckout}
              disabled={isCheckingOut || !billingConfig?.checkoutEnabled || !selectedPricesReady || (!selectedPackage && !selectedServicePlan)}
              className="w-full rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-gray-600 disabled:text-gray-300"
            >
              {isCheckingOut
                ? 'Preparing secure checkout...'
                : !selectedPricesReady
                  ? 'Checkout unavailable'
                  : selectedPackage && selectedServicePlan
                    ? `Checkout bundle · $${checkoutTotal.toFixed(2)}`
                    : `Checkout · $${checkoutTotal.toFixed(2)}`}
            </button>
            {checkoutError && (
              <p role="alert" className="mt-2 rounded border border-red-400/50 bg-red-950/60 px-3 py-2 text-xs font-semibold text-red-200">
                {checkoutError}
              </p>
            )}
          </div>
        )}

        {onDismiss && (
          <div className="border-t border-gray-700 px-4 py-3 flex flex-col gap-2">
            <button
              onClick={onDismiss}
              className="w-full bg-gray-600 hover:bg-gray-500 border border-gray-400 text-gray-100 text-sm font-semibold py-2 px-4 rounded-md transition-all duration-200 shadow-md"
            >
              {isFreeTierLocked ? 'Browse Workspace and Open Files' : 'Browse the Interface Without a Key'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ApiKeyOrPayModal;
