// ApiKeyOrPayModal.tsx
// Modal allowing users to enter either a LandSurv Enabling Key or their own AI provider API key.
// Payments and plan upgrades are cleanly separated into UpgradeModal.

import React from 'react';
import KeyManagementPanel from './KeyManagementPanel.tsx';
import type { KeyDetailSnapshot } from '../services/keySources.ts';

export type CurrentKeyDetails = KeyDetailSnapshot;

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
  if (!isOpen) return null;

  const handleClose = () => {
    if (onClose) onClose();
  };
  const hasActiveKey = Boolean(
    hasGoogleApiKey ||
    hasLandSurvKey ||
    hasServiceAccess ||
    (currentKeyDetails && currentKeyDetails.status === 'active'),
  );
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

  const formatCountdown = (seconds: number): string => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const secs = safeSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4 overflow-hidden bg-gray-950/[0.97] py-4">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto overscroll-contain rounded-lg border border-gray-700 bg-gray-800 shadow-2xl scrollbar-hide mx-4">
        {/* Brand */}
        <div
          data-testid="key-dialog-brand"
          className="relative flex items-center justify-between rounded-t-lg border-b border-gray-700 bg-gray-800 px-4 py-1.5"
        >
          <div className="flex items-center gap-2.5" aria-label="LandSurv.ai">
            <img src="/favicon-192.png" alt="LandSurv.ai logo" className="h-7 w-7 rounded-md shadow-md" />
            <div>
              <div className="text-lg font-extrabold leading-none tracking-tight text-white">
                Land<span className="text-cyan-400">Surv</span>
                <span className="text-emerald-400">.ai</span>
                <sup className="ml-0.5 text-[9px] text-gray-400">™</sup>
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
              className="rounded-md p-1 text-base font-semibold text-gray-400 transition-colors hover:text-white"
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
              <p className="mt-0.5 text-xs text-blue-100">
                Available again in{' '}
                <span className="font-mono font-bold text-cyan-200">
                  {formatCountdown(timeUntilAvailable)}
                </span>
              </p>
            </>
          ) : hasActiveKey ? (
            <>
              <h2 className="text-base font-bold text-white">Active Key Connected</h2>
              <p className="mt-0.5 text-xs text-blue-100">
                Inference is active and running with your connected key.
              </p>
            </>
          ) : isPremium ? (
            <>
              <h2 className="text-base font-bold text-white">Premium Feature Access Required</h2>
              <p className="mt-0.5 text-xs text-blue-100">
                {getAgentName()} needs an inference source. Enter your LandSurv Enabling Key or bring
                your own AI key.
              </p>
            </>
          ) : computeCredits > 0 ? (
            <>
              <h2 className="text-base font-bold text-white">API &amp; Enabling Keys</h2>
              <p className="mt-0.5 text-xs text-blue-100">
                Credits remaining:{' '}
                <span className="font-mono font-bold text-green-300">
                  {computeCredits.toLocaleString()}
                </span>
              </p>
            </>
          ) : (
            <>
              <h2 className="text-base font-bold text-white">API &amp; Enabling Keys</h2>
              <p className="mt-0.5 text-xs text-blue-100">
                Connect your LandSurv Enabling Key or AI provider key to run features.
              </p>
            </>
          )}
        </div>

        {/* Upgrade Banner Link */}
        {onOpenUpgrade && (
          <div className="flex items-center justify-between border-b border-emerald-500/30 bg-emerald-950/40 px-4 py-2">
            <span className="text-xs font-medium text-emerald-200">
              Need continuous 24/7 service or hosted compute credits?
            </span>
            <button
              type="button"
              onClick={onOpenUpgrade}
              className="ml-2 whitespace-nowrap text-xs font-bold text-emerald-300 underline hover:text-emerald-200"
            >
              Upgrade Plans →
            </button>
          </div>
        )}

        {/* Content */}
        <div className="px-3 py-3">
          <KeyManagementPanel
            currentKeyDetails={currentKeyDetails}
            hasLandSurvKey={hasLandSurvKey}
            hasGoogleApiKey={hasGoogleApiKey}
            hasServiceAccess={hasServiceAccess}
            serviceAccessExpiresAt={serviceAccessExpiresAt}
            computeCredits={computeCredits}
            onSubmitApiKey={onSubmitApiKey}
            onSubmitServiceKey={onSubmitServiceKey}
          />

          {isPremium && onGoHome && (
            <button
              onClick={onGoHome}
              className="mt-3 w-full rounded-md border border-gray-600 bg-gray-700 px-4 py-2 text-xs font-semibold text-gray-200 transition-colors hover:bg-gray-600"
            >
              ← Return to Agent Selection
            </button>
          )}
        </div>

        {onDismiss && (
          <div className="border-t border-gray-700 px-4 py-2.5">
            <button
              onClick={onDismiss}
              className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-1.5 text-xs font-medium text-pink-300 transition-all hover:bg-gray-600 hover:text-pink-200"
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
