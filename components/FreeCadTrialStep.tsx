import React, { useState } from 'react';
import { getDeviceFingerprint } from '../services/deviceFingerprint.ts';
import type { TrialAcceptanceRecord } from '../services/freeCadTrial.ts';
import {
  TRIAL_TERMS_EFFECTIVE_DATE,
  TRIAL_TERMS_VERSION,
} from '../data/trialTermsContent.ts';

interface FreeCadTrialStepProps {
  onBack: () => void;
  onStart: (record: TrialAcceptanceRecord) => void;
  submitting?: boolean;
}

/**
 * Compact trial-terms step. The checkbox is the assent act; the full agreement
 * stays one link away so the gate remains lightweight.
 */
const FreeCadTrialStep: React.FC<FreeCadTrialStepProps> = ({ onBack, onStart, submitting = false }) => {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled = !checked || busy || submitting;

  const handleStart = async () => {
    if (disabled) return;
    setBusy(true);
    setError(null);
    try {
      const fingerprint = await getDeviceFingerprint();
      const record: TrialAcceptanceRecord = {
        termsVersion: TRIAL_TERMS_VERSION,
        acceptedAt: new Date().toISOString(),
        fingerprintId: fingerprint.id,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        surface: 'welcome-free-cad',
        fingerprintSignals: fingerprint.signals,
      };
      onStart(record);
    } catch {
      setError('Could not prepare the trial on this device. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-3">
      <div>
        <h3 className="text-lg font-bold tracking-tight text-white light-theme:text-gray-900">
          Free CAD — Trial Terms
        </h3>
        <p className="mt-0.5 text-[11px] text-slate-400 light-theme:text-gray-600">
          Trial use only · v{TRIAL_TERMS_VERSION} · Effective {TRIAL_TERMS_EFFECTIVE_DATE}
        </p>
      </div>

      <div className="rounded-md border border-slate-800 bg-slate-900/40 px-3.5 py-3 text-xs leading-relaxed text-slate-300 light-theme:border-gray-200 light-theme:bg-gray-50 light-theme:text-gray-700">
        <p className="font-semibold text-slate-200 light-theme:text-gray-900">
          Not for business, client, or production work.
        </p>
        <ul className="mt-2 space-y-1.5">
          <li>20 assistant prompts per device, with up to 5 for deeds.</li>
          <li>Drawing, editing, saving, and exports remain free after the prompts are used.</li>
          <li>Assistant output is probabilistic and must be verified by a qualified professional.</li>
        </ul>
        <p className="mt-2 text-[11px] text-slate-500 light-theme:text-gray-500">
          Full agreement:{' '}
          <a
            href="https://tos.landsurv.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:underline"
          >
            Terms of Service
          </a>
          .
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-slate-800 bg-slate-900/40 px-3.5 py-2.5 text-xs leading-relaxed text-slate-300 light-theme:border-gray-200 light-theme:bg-gray-50 light-theme:text-gray-700">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-400"
        />
        <span>I have read and agree to the Free CAD Trial Terms and the Terms of Service.</span>
      </label>

      {error && <p className="text-xs font-medium text-rose-300">{error}</p>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-10 items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold text-slate-400 transition-colors hover:bg-slate-900 hover:text-white light-theme:text-gray-600 light-theme:hover:bg-gray-100 light-theme:hover:text-gray-900"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleStart}
          disabled={disabled}
          aria-disabled={disabled}
          className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-all ${
            disabled
              ? 'cursor-not-allowed border-slate-800 bg-slate-900/50 text-slate-500'
              : 'border-cyan-400/60 bg-slate-950 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_6px_22px_-4px_rgba(6,182,212,0.3)] hover:border-cyan-300 hover:bg-slate-900'
          }`}
        >
          <span>{busy || submitting ? 'Starting…' : 'Start Free CAD'}</span>
          <span aria-hidden="true">&rarr;</span>
        </button>
      </div>
    </div>
  );
};

export default FreeCadTrialStep;
