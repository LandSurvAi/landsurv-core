// HostCostReminderModal.tsx
// Friendly periodic reminder (every 15 minutes) that hosting and maintaining LandSurv.ai costs money.
// Provides direct links to Upgrade/Payments and the Open Source (Zelle contribution) screen.

import React from 'react';

export interface HostCostReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenUpgrade: () => void;
  onOpenOpenSource: () => void;
}

export const HostCostReminderModal: React.FC<HostCostReminderModalProps> = ({
  isOpen,
  onClose,
  onOpenUpgrade,
  onOpenOpenSource,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center p-4 bg-gray-950/[0.97] animate-fade-in">
      <div className="bg-gray-900 rounded-xl shadow-2xl max-w-md w-full border border-cyan-500/40 overflow-hidden flex flex-col my-auto animate-modal-panel-fade-in-down">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-gray-900 border-b border-gray-800">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">💡</span>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">LandSurv.ai Hosting Reminder</h2>
              <p className="text-xs text-cyan-400 font-medium">Keeping the servers and AI running</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-white p-1 rounded-md transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 text-sm text-gray-300 leading-relaxed">
          <p>
            LandSurv.ai is built independently for land surveyors and civil engineers. Cloud servers, GPU compute, database storage, and map tiles cost money to keep alive every month.
          </p>
          <p className="text-xs text-gray-400">
            If LandSurv.ai is saving you time in the field or in the office, please consider supporting the project:
          </p>

          <div className="grid grid-cols-1 gap-2.5 pt-1">
            {/* Action 1: Upgrade / Payments */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenUpgrade();
              }}
              className="group relative overflow-hidden rounded-lg border border-l-0 border-dashed border-emerald-500/70 hover:border-emerald-400 bg-gray-800/60 hover:bg-gray-800/90 p-3.5 text-left transition-all cursor-pointer"
            >
              <span className="absolute inset-y-0 left-0 w-1 bg-emerald-500" aria-hidden="true" />
              <div className="pl-2">
                <div className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors flex items-center justify-between">
                  <span>⚡ Upgrade Service or Buy Credits</span>
                  <span className="text-xs text-emerald-400 font-medium">View Plans →</span>
                </div>
                <p className="mt-1 text-xs text-gray-400 leading-normal">
                  Unlock 24/7 continuous access and hosted AI compute credits directly via Stripe.
                </p>
              </div>
            </button>

            {/* Action 2: Open Source & Zelle */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenOpenSource();
              }}
              className="group relative overflow-hidden rounded-lg border border-l-0 border-dashed border-purple-500/70 hover:border-purple-400 bg-gray-800/60 hover:bg-gray-800/90 p-3.5 text-left transition-all cursor-pointer"
            >
              <span className="absolute inset-y-0 left-0 w-1 bg-purple-500" aria-hidden="true" />
              <div className="pl-2">
                <div className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors flex items-center justify-between">
                  <span>💜 Open Source &amp; Zelle QR</span>
                  <span className="text-xs text-purple-400 font-medium">See Zelle Link →</span>
                </div>
                <p className="mt-1 text-xs text-gray-400 leading-normal">
                  Support independent open source software directly with a one-time Zelle contribution.
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-800 bg-gray-900/90 px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-gray-500">Thank you for using LandSurv.ai</span>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-pink-300 hover:text-pink-200 px-3 py-1.5 rounded border border-gray-700 bg-gray-800 hover:bg-gray-700 transition-colors font-medium"
          >
            Continue Working
          </button>
        </div>
      </div>
    </div>
  );
};

export default HostCostReminderModal;
