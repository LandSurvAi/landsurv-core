import React, { useState } from 'react';
import { getDeviceFingerprint } from '../services/deviceFingerprint.ts';
import { clearLocalTrialState } from '../services/freeCadTrial.ts';
import { clearDeedCreditState } from '../services/deedCredits.ts';
import { writeCadEntryMode } from '../services/freeCadPolicy.ts';
import { LEGAL_AGREEMENT_STORAGE_KEY } from './SignatureForm.tsx';

function apiBase(): string {
  const env = (import.meta as any)?.env;
  const configured = env?.VITE_API_URL as string | undefined;
  if (!configured) return '';
  return configured.replace(/\/api\/?$/, '');
}

/**
 * Temporary dev-only control. It clears the device's Free CAD ledger, the
 * separate free-deed ledger, and the local signature so the welcome/free-trial
 * flow can be run again from the beginning. Remove this component when the
 * trial flow no longer needs a reset button.
 */
const DevTrialResetButton: React.FC = () => {
  const [busy, setBusy] = useState(false);

  const reset = async () => {
    if (busy) return;
    if (!window.confirm('Reset this device’s Free CAD trial, free deeds, and legal signature?')) return;

    setBusy(true);
    try {
      const fingerprint = await getDeviceFingerprint();
      const response = await fetch(`${apiBase()}/api/trial/dev-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprintId: fingerprint.id }),
        cache: 'no-store',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || `HTTP ${response.status}`);
      }

      clearLocalTrialState();
      clearDeedCreditState();
      try {
        localStorage.removeItem(LEGAL_AGREEMENT_STORAGE_KEY);
      } catch {
        /* non-fatal */
      }
      writeCadEntryMode('unset');
      window.location.reload();
    } catch (error) {
      setBusy(false);
      const message = error instanceof Error ? error.message : 'Unknown error';
      window.alert(`Dev reset failed: ${message}\n\nThe backend must be running in development mode.`);
    }
  };

  return (
    <button
      type="button"
      onClick={reset}
      disabled={busy}
      title="DEV ONLY — reset this device's Free CAD trial, free deeds, and legal signature."
      className="rounded border border-dashed border-amber-400/70 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-300 transition-colors hover:bg-amber-400/10 disabled:cursor-wait disabled:opacity-50"
    >
      {busy ? 'Resetting…' : 'Dev reset'}
    </button>
  );
};

export default DevTrialResetButton;
