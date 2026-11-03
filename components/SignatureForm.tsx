import React, { useRef, useState, useEffect, useCallback } from 'react';

/**
 * SignatureForm — reusable name/email/agree/signature capture widget.
 *
 * Used by both the in-app first-time agreement gate (LegalAgreementGate) and the
 * standalone legal.landsurv.ai page (LegalSubdomainPage). On submit, persists a
 * structured signature record to localStorage and fires onSigned() so the host
 * can release the app.
 *
 * STORAGE: localStorage key 'landsurv-legal-agreement-v1' holds JSON:
 *   { name, email, signedAt (ISO), signatureDataUrl, version, userAgent }
 *
 * NOTE FOR FUTURE: Persist to backend (POST /api/legal/sign) for an auditable
 * trail across devices. The current MVP is browser-local only.
 */

export const LEGAL_AGREEMENT_STORAGE_KEY = 'landsurv-legal-agreement-v1';
export const LEGAL_AGREEMENT_VERSION = '2026-07-01';

export interface SignatureRecord {
  name: string;
  email: string;
  signedAt: string;
  signatureDataUrl: string;
  version: string;
  userAgent: string;
  advancedAiSafetyAcknowledged: boolean;
  newsletterOptIn: boolean;
}

export function hasSignedLegalAgreement(): boolean {
  try {
    const raw = localStorage.getItem(LEGAL_AGREEMENT_STORAGE_KEY);
    if (!raw) return false;
    const rec = JSON.parse(raw) as SignatureRecord;
    return Boolean(rec.name && rec.email && rec.signatureDataUrl && rec.version === LEGAL_AGREEMENT_VERSION);
  } catch {
    return false;
  }
}

export function getSignatureRecord(): SignatureRecord | null {
  try {
    const raw = localStorage.getItem(LEGAL_AGREEMENT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SignatureRecord) : null;
  } catch {
    return null;
  }
}

interface SignatureFormProps {
  onSigned: (record: SignatureRecord) => void;
  onBack?: () => void;
  compact?: boolean;
}

// Rendered only after the user has acknowledged all listed conditions (see LegalAgreementGate).
export const SignatureForm: React.FC<SignatureFormProps> = ({ onSigned, onBack, compact = false }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [hasDrawn, setHasDrawn] = useState(false);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);

  const getCtx = () => canvasRef.current?.getContext('2d') || null;

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    // Fixed backing-store size — keeps strokes crisp regardless of CSS layout size.
    c.width = 600;
    c.height = compact ? 150 : 200;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  }, [compact]);

  const pointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * c.width,
      y: ((e.clientY - rect.top) / rect.height) * c.height,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = true;
    lastRef.current = pointerPos(e);
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = getCtx();
    const p = pointerPos(e);
    if (ctx && lastRef.current) {
      ctx.beginPath();
      ctx.moveTo(lastRef.current.x, lastRef.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    lastRef.current = p;
    setHasDrawn(true);
  };
  const handlePointerUp = () => {
    drawingRef.current = false;
    lastRef.current = null;
  };

  const clearSignature = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (c && ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
    }
    setHasDrawn(false);
  }, []);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit = name.trim().length >= 2 && emailValid && hasDrawn;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !canvasRef.current) return;
    const record: SignatureRecord = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      signedAt: new Date().toISOString(),
      signatureDataUrl: canvasRef.current.toDataURL('image/png'),
      version: LEGAL_AGREEMENT_VERSION,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      advancedAiSafetyAcknowledged: true,
      newsletterOptIn: true,
    };
    try {
      localStorage.setItem(LEGAL_AGREEMENT_STORAGE_KEY, JSON.stringify(record));
    } catch (err) {
      console.error('[Legal] Failed to persist agreement to localStorage', err);
    }
    // Best-effort backend audit log so DevOps console can list signatures.
    // Silent failure — the localStorage record is the source of truth for gate dismissal.
    try {
      fetch('/api/legal/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: record.name,
          email: record.email,
          signatureDataUrl: record.signatureDataUrl,
          agreed: true,
          signedAt: record.signedAt,
          agreementVersion: record.version,
          userAgent: record.userAgent,
          newsletterOptIn: record.newsletterOptIn,
        }),
      }).catch(() => {});
    } catch { /* no-op */ }
    onSigned(record);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
      <div className="px-6 py-5 sm:px-8 overflow-y-auto flex-1 min-h-0 space-y-5">
        {/* Clean Architectural Confirmation Line (No Pill) */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3 text-xs">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold">
            <span>✓</span>
            <span>Terms of Service Reviewed &amp; Acknowledged</span>
          </div>
          <span className="font-mono text-[11px] text-slate-400">
            Agreement ID: <span className="text-slate-200">{LEGAL_AGREEMENT_VERSION}</span>
          </span>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              Full Legal Name <span className="text-cyan-400">*</span>
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              className="w-full px-3.5 py-2.5 bg-slate-900/90 border border-slate-700 rounded-lg text-gray-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-colors text-sm"
              placeholder="Jane M. Smith, PLS"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              Email Address <span className="text-cyan-400">*</span>
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-3.5 py-2.5 bg-slate-900/90 border border-slate-700 rounded-lg text-gray-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-colors text-sm"
              placeholder="jane@smithsurvey.com"
            />
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="block text-xs font-bold uppercase tracking-wider text-slate-300">
              Electronic Signature <span className="text-cyan-400">*</span>
            </span>
            <div className="flex items-center gap-3">
              <span className={`text-[11px] font-mono ${hasDrawn ? 'text-emerald-400' : 'text-slate-500'}`}>
                {hasDrawn ? '✓ Signature captured' : 'Awaiting signature stroke...'}
              </span>
              <span className="text-slate-700" aria-hidden="true">|</span>
              <button
                type="button"
                onClick={clearSignature}
                className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 underline underline-offset-4"
              >
                Clear Pad
              </button>
            </div>
          </div>
          <div className="relative rounded-lg border border-slate-700 hover:border-cyan-500/40 bg-white overflow-hidden touch-none shadow-inner transition-colors">
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className="block w-full h-[150px] sm:h-[180px] cursor-crosshair"
              style={{ touchAction: 'none' }}
              aria-label="Draw your signature"
            />
            {/* Signature baseline guide */}
            <div className="pointer-events-none absolute inset-x-6 bottom-6 border-b border-dashed border-slate-300 flex items-end justify-between pb-1">
              <span className="text-xs font-serif italic text-slate-400 select-none">Sign here &times;</span>
              <span className="text-[10px] font-mono text-slate-400 select-none">ESIGN / UETA Verified</span>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            Draw your signature above using your mouse, trackpad, stylus, or touchscreen.
          </p>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed border-t border-slate-800/80 pt-3">
          By executing your electronic signature below, you accept the LandSurv.ai Terms of Service and Professional Practice Disclosures, and agree to receive occasional LandSurv.ai product update emails (unsubscribe anytime with one click).
        </p>
      </div>

      {/* Fixed footer — Next-Level Precision Architectural Submit Button */}
      <div className="px-6 py-4 sm:px-8 border-t border-slate-800/90 bg-slate-950 flex-shrink-0 flex items-center gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-3.5 text-xs sm:text-sm font-semibold text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-lg transition-colors"
          >
            &larr; Back
          </button>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          className={`group relative flex-1 overflow-hidden rounded-lg transition-all duration-200 focus:outline-none ${
            canSubmit
              ? 'bg-slate-900 hover:bg-slate-800/95 text-white border border-cyan-400/50 hover:border-cyan-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_8px_28px_-6px_rgba(6,182,212,0.3)] cursor-pointer'
              : 'bg-slate-900/50 text-slate-500 border border-slate-800 cursor-not-allowed'
          }`}
        >
          <span
            className={`absolute inset-y-0 left-0 w-1 transition-colors ${
              canSubmit ? 'bg-cyan-400 group-hover:bg-emerald-400' : 'bg-slate-700'
            }`}
            aria-hidden="true"
          />
          <div className="flex items-center justify-between px-5 py-3.5">
            <span className="font-semibold text-sm sm:text-[15px] tracking-tight">
              {canSubmit ? 'Sign & Continue to App' : 'Enter name, email, and signature to continue'}
            </span>
            <div className="flex items-center gap-2">
              <span
                className={`font-mono text-xs uppercase tracking-wider ${
                  canSubmit ? 'text-cyan-300 group-hover:text-white font-semibold' : 'text-slate-600'
                }`}
              >
                {canSubmit ? 'Execute & Launch' : 'Incomplete'}
              </span>
              {canSubmit && (
                <span className="text-cyan-400 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true">
                  &rarr;
                </span>
              )}
            </div>
          </div>
        </button>
      </div>
    </form>
  );
};

export default SignatureForm;
