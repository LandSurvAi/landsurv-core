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
      <div className="px-6 py-5 overflow-y-auto flex-1 min-h-0 space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="block text-sm font-semibold text-gray-300 mb-1">Full Name *</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-100 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
            placeholder="Jane Smith"
          />
        </label>
        <label className="block">
          <span className="block text-sm font-semibold text-gray-300 mb-1">Email *</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-100 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
            placeholder="jane@example.com"
          />
        </label>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="block text-sm font-semibold text-gray-300">Signature *</span>
          <button
            type="button"
            onClick={clearSignature}
            className="text-xs text-cyan-400 hover:text-cyan-300 underline"
          >
            Clear
          </button>
        </div>
        <div className="rounded-md border border-gray-700 bg-white overflow-hidden touch-none">
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className="block w-full h-[150px] sm:h-[200px] cursor-crosshair"
            style={{ touchAction: 'none' }}
            aria-label="Draw your signature"
          />
        </div>
        <p className="text-xs text-gray-500 mt-1">Draw your signature above using mouse, trackpad, or touch.</p>
      </div>

      <p className="text-xs text-gray-400">
        By signing, you also agree to receive occasional LandSurv.ai product update emails. You can unsubscribe at any time using the link in any email.
      </p>
      </div>

      {/* Fixed footer — confirm button is always visible */}
      <div className="px-6 py-4 border-t border-gray-700 bg-gray-800 flex-shrink-0 flex items-center gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-3 text-sm font-semibold text-gray-300 hover:text-white bg-gray-700/60 hover:bg-gray-700 rounded-lg transition-colors"
          >
            Back
          </button>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex-1 py-3 px-6 font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors shadow-lg disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
        >
          {canSubmit ? 'Sign & Continue to App' : 'Enter name, email, and signature to continue'}
        </button>
      </div>
    </form>
  );
};

export default SignatureForm;
