import React from 'react';
import { createPortal } from 'react-dom';
import FreeCadTrialStep from './FreeCadTrialStep.tsx';
import type { TrialAcceptanceRecord } from '../services/freeCadTrial.ts';

interface FreeCadNoSignatureGateProps {
  isOpen: boolean;
  onClose: () => void;
  onAccepted: (record: TrialAcceptanceRecord) => void;
}

/**
 * Lightweight no-signature gate for unsigned users entering through the Home
 * agent directory or the welcome screen's Draft Deed card. Accepting this gate
 * records the trial acceptance against the device fingerprint; the full legal
 * signature is reserved for Business CAD.
 */
const FreeCadNoSignatureGate: React.FC<FreeCadNoSignatureGateProps> = ({
  isOpen,
  onClose,
  onAccepted,
}) => {
  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[21000] flex items-center justify-center overflow-y-auto bg-gray-950/88 p-3 backdrop-blur-md animate-fade-in sm:p-5"
      onClick={event => {
        event.stopPropagation();
        onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Free CAD trial terms"
        onClick={event => event.stopPropagation()}
        className="relative flex max-h-[94vh] w-full max-w-lg flex-col overflow-y-auto rounded-xl border border-slate-700/80 bg-slate-950 text-gray-200 shadow-[0_24px_70px_rgba(0,0,0,0.85)]"
      >
        <div className="h-[2px] w-full shrink-0 bg-cyan-500/70" />
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-950 px-4 py-2.5">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">
            Free CAD · no signature required
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Free CAD trial gate"
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="p-4 sm:p-5">
          <FreeCadTrialStep
            onBack={onClose}
            onStart={onAccepted}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default FreeCadNoSignatureGate;
