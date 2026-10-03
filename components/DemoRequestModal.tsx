import React, { useState } from 'react';

/**
 * DemoRequestModal — self-serve $24 / 24-hour demo API key purchase flow.
 *
 * Replaces the legacy "📧 Contact Us for a Demo Key" mailto path. Posts to
 * /api/demo/request, then redirects to the PayPal approve URL. After payment
 * is captured, the backend's PayPal webhook mints the key and emails it.
 */

interface DemoRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Stage = 'form' | 'submitting' | 'redirecting' | 'error';

const DemoRequestModal: React.FC<DemoRequestModalProps> = ({ isOpen, onClose }) => {
  const [email, setEmail] = useState('');
  const [emailConfirm, setEmailConfirm] = useState('');
  const [emailLocked, setEmailLocked] = useState(false);
  const [name, setName] = useState('');
  const [stage, setStage] = useState<Stage>('form');
  const [errorMsg, setErrorMsg] = useState('');
  const [showDetails, setShowDetails] = useState(false);

  if (!isOpen) return null;

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const emailsMatch = email.trim().toLowerCase() === emailConfirm.trim().toLowerCase();
  const canSubmit = validEmail && emailsMatch;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || stage === 'submitting') return;
    setStage('submitting');
    setErrorMsg('');
    try {
      const resp = await fetch('/api/demo/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || undefined,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.approveUrl) {
        throw new Error(data.error || `Request failed (${resp.status})`);
      }
      setStage('redirecting');
      // Hand off to PayPal. New tab so we don't lose the SPA state.
      window.open(data.approveUrl, '_blank', 'noopener');
    } catch (err: any) {
      console.error('[DemoRequest] submit failed', err);
      setErrorMsg(err?.message || 'Something went wrong. Please try again.');
      setStage('error');
    }
  };

  const reset = () => {
    setStage('form');
    setErrorMsg('');
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative max-w-md w-full rounded-2xl shadow-[0_25px_80px_-15px_rgba(16,185,129,0.45)] overflow-hidden text-gray-100 my-auto bg-gray-950"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Bold dashed frame — matches homepage agent-card idiom */}
        <div className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-dashed border-emerald-400/30" />

        <div className="relative p-6">
        <div className="flex items-start justify-between mb-5">
          <div className="flex-1">
            <h2 className="text-3xl font-extrabold tracking-tighter leading-none text-white mb-2">
              24hr Demo{' '}
              <span className="whitespace-nowrap">
                Land<span className="text-cyan-400">Surv</span><span className="text-emerald-400">.ai</span><sup className="text-xs text-gray-400">™</sup>
              </span>
            </h2>
            <p className="text-sm text-gray-300">
              <span className="text-2xl font-black bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text text-transparent align-middle">$24</span>{' '}
              <span className="align-middle">— receive software enabling key by email in minutes.</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none -mt-1 ml-2 transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {stage === 'redirecting' ? (
          <div className="text-center py-6">
            <div className="text-5xl mb-3">🚀</div>
            <p className="font-extrabold text-xl text-white">Opening secure checkout…</p>
            <p className="text-sm text-gray-300 mt-3">
              Finish payment in the new tab. Your key will arrive at{' '}
              <span className="font-mono text-emerald-300 font-bold">{email}</span> seconds after it's confirmed.
            </p>
            <button
              onClick={onClose}
              className="mt-6 px-6 py-2.5 bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 rounded-lg text-gray-900 font-black uppercase tracking-wider text-sm shadow-lg shadow-emerald-500/30"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              {!emailLocked ? (
                <>
                  <label className="block text-xs font-black uppercase tracking-widest text-emerald-300 mb-1.5">📧 Email *</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => { if (validEmail) setEmailLocked(true); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'Tab') {
                        if (validEmail) setEmailLocked(true);
                      }
                    }}
                    required
                    autoComplete="email"
                    disabled={stage === 'submitting'}
                    className="w-full px-3 py-2.5 bg-gray-950/60 border-2 border-dashed border-emerald-500/50 rounded-lg text-emerald-50 font-medium focus:outline-none focus:border-emerald-400 focus:border-solid focus:bg-emerald-500/[0.08] focus:ring-2 focus:ring-emerald-400/40 transition-all placeholder-emerald-200/30"
                    placeholder="you@example.com"
                  />
                  <p className="text-xs text-gray-400 mt-1.5">
                    Your demo key will be sent here. We'll ask you to retype it for safety.
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[11px] uppercase tracking-widest text-cyan-300 font-black">📨 Sending key to</span>
                    <button
                      type="button"
                      onClick={() => { setEmailLocked(false); setEmailConfirm(''); }}
                      className="text-[11px] font-black uppercase tracking-widest text-amber-300 hover:text-amber-200 underline underline-offset-2"
                    >
                      ✎ edit
                    </button>
                  </div>
                  <div
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-mono tracking-tight mb-3 transition-all border-2 border-dashed ${
                      emailConfirm.length === 0
                        ? 'border-cyan-400/60 bg-gradient-to-br from-cyan-500/[0.10] to-sky-500/[0.05]'
                        : emailsMatch
                          ? 'border-emerald-400 border-solid bg-gradient-to-br from-emerald-500/20 to-teal-500/10 shadow-[0_0_22px_-4px_rgba(52,211,153,0.65)]'
                          : 'border-rose-400/70 bg-gradient-to-br from-rose-500/12 to-pink-500/[0.06]'
                    }`}
                    aria-label="Your email — characters light up as you retype below"
                  >
                    <span aria-hidden className="text-cyan-300">📧</span>
                    <span className="truncate text-sm">
                      {email.split('').map((ch, i) => {
                        const typed = emailConfirm[i];
                        let cls = 'text-gray-200';
                        if (typed !== undefined) {
                          cls = typed.toLowerCase() === ch.toLowerCase()
                            ? 'text-emerald-300 font-bold'
                            : 'text-rose-400 font-bold underline decoration-wavy decoration-rose-400/80';
                        }
                        return <span key={i} className={`${cls} transition-colors`}>{ch}</span>;
                      })}
                      {emailConfirm.length > email.length && (
                        <span className="text-rose-400 line-through opacity-70">
                          {emailConfirm.slice(email.length)}
                        </span>
                      )}
                    </span>
                    {emailsMatch && emailConfirm.length > 0 && (
                      <span className="ml-auto text-emerald-300 text-xs font-black uppercase tracking-widest">✓ Match</span>
                    )}
                  </div>
                  <label className="block text-xs font-black uppercase tracking-widest text-fuchsia-300 mb-1.5">🔁 Retype to Confirm *</label>
                  <input
                    type="email"
                    value={emailConfirm}
                    onChange={(e) => setEmailConfirm(e.target.value)}
                    required
                    autoComplete="off"
                    autoFocus
                    onPaste={(e) => e.preventDefault()}
                    onDrop={(e) => e.preventDefault()}
                    disabled={stage === 'submitting'}
                    className={`w-full px-3 py-2.5 bg-gray-950/60 rounded-lg font-medium focus:outline-none focus:border-solid transition-all placeholder-fuchsia-200/30 border-2 border-dashed ${
                      emailConfirm.length === 0
                        ? 'border-fuchsia-400/60 text-fuchsia-50 focus:border-fuchsia-400 focus:bg-fuchsia-500/[0.08] focus:ring-2 focus:ring-fuchsia-400/40'
                        : emailsMatch
                          ? 'border-emerald-400 border-solid text-emerald-50 bg-emerald-500/[0.08] focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/40'
                          : 'border-rose-400/70 text-rose-50 bg-rose-500/[0.06] focus:border-rose-400 focus:ring-2 focus:ring-rose-400/40'
                    }`}
                    placeholder="type your email again"
                  />
                  <p className={`text-xs mt-1.5 font-semibold ${
                    emailConfirm.length === 0
                      ? 'text-gray-400'
                      : emailsMatch
                        ? 'text-emerald-300'
                        : 'text-rose-300'
                  }`}>
                    {emailConfirm.length === 0
                      ? '🚫 Paste is disabled — please type it out so we know it\u2019s right.'
                      : emailsMatch
                        ? '✅ Looks good. Your key will be sent to this address.'
                        : '⚠️ Characters above turn green when they match, red when they don\u2019t.'}
                  </p>
                </>
              )}
            </div>

            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-sky-300 mb-1.5">👤 Name <span className="text-gray-500 font-medium normal-case tracking-normal">(optional)</span></label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={stage === 'submitting'}
                className="w-full px-3 py-2.5 bg-gray-950/60 border-2 border-dashed border-sky-500/40 rounded-lg text-sky-50 font-medium focus:outline-none focus:border-sky-400 focus:border-solid focus:bg-sky-500/[0.08] focus:ring-2 focus:ring-sky-400/40 transition-all"
                placeholder="Gunter Chainman"
              />
            </div>

            <div className="rounded-xl p-3.5 bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-yellow-500/15 border-2 border-dashed border-amber-400/60 text-xs text-amber-100 leading-snug shadow-[inset_0_0_30px_-10px_rgba(251,191,36,0.25)]">
              <span className="font-black uppercase tracking-wider text-amber-300">⚠️ Heads up:</span> LandSurv.ai is <span className="font-bold text-amber-200">experimental software</span>. This Day Pass is a <span className="font-bold text-amber-200">demo</span> for evaluation. Always verify results against your trusted tools.
            </div>

            <div className="rounded-xl bg-gray-950/40 border-2 border-dashed border-emerald-400/40 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowDetails((s) => !s)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-emerald-500/[0.06] transition-colors"
                aria-expanded={showDetails}
              >
                <span className="font-black uppercase tracking-widest text-emerald-300 flex items-center gap-2 text-xs">
                  <span className="text-base">✨</span> What's included
                </span>
                <span className={`text-emerald-300 transition-transform text-lg ${showDetails ? 'rotate-180' : ''}`}>▾</span>
              </button>
              {showDetails && (
                <div className="px-4 pb-4 space-y-4 border-t-2 border-dashed border-emerald-400/30 pt-4">
                  <div className="rounded-lg p-3 bg-gradient-to-br from-emerald-500/15 via-cyan-500/10 to-sky-500/15 border-2 border-dashed border-cyan-400/40">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm text-gray-100">
                      <div className="flex items-start gap-2"><span className="text-base leading-tight">🤖</span><span>AI agent stack</span></div>
                      <div className="flex items-start gap-2"><span className="text-base leading-tight">📐</span><span>COGO &amp; boundary</span></div>
                      <div className="flex items-start gap-2"><span className="text-base leading-tight">📄</span><span>Deed parsing</span></div>
                      <div className="flex items-start gap-2"><span className="text-base leading-tight">🗺️</span><span>Civil plan reader</span></div>
                      <div className="flex items-start gap-2"><span className="text-base leading-tight">📍</span><span>Stationing &amp; CL</span></div>
                      <div className="flex items-start gap-2"><span className="text-base leading-tight">🌐</span><span>GIS lookups</span></div>
                      <div className="flex items-start gap-2"><span className="text-base leading-tight">⛰️</span><span>Contours &amp; profile</span></div>
                      <div className="flex items-start gap-2"><span className="text-base leading-tight">⚙️</span><span>CAD Manager</span></div>
                    </div>
                    <div className="mt-3 pt-3 border-t-2 border-dashed border-cyan-400/30 text-xs text-gray-300 space-y-1.5">
                      <p className="flex items-start gap-2"><span className="text-emerald-300 font-black">✓</span><span>Full 24-hour access — clock starts on your first AI call</span></p>
                      <p className="flex items-start gap-2"><span className="text-emerald-300 font-black">✓</span><span>500 requests/hour rate limit</span></p>
                      <p className="flex items-start gap-2"><span className="text-gray-500 font-black">·</span><span className="text-gray-400">Heavy GNSS/RINEX, file uploads and admin endpoints excluded</span></p>
                    </div>
                  </div>

                  <div className="rounded-lg p-3 bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-yellow-500/15 border-2 border-dashed border-amber-400/50 flex items-start gap-3">
                    <div className="text-3xl leading-none mt-0.5">🔌</div>
                    <div className="flex-1">
                      <p className="font-black uppercase tracking-wider text-amber-300 text-xs">
                        Pair it with the Civil 3D Connector
                      </p>
                      <p className="text-xs text-gray-200 mt-1 leading-snug">
                        Your Day Pass key plugs into the <span className="font-bold text-amber-200">LandSurv.ai → Civil 3D</span> plugin — round-trip points, alignments, and parcels between Civil 3D and every agent above without leaving AutoCAD.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {stage === 'error' && (
              <div className="bg-rose-500/15 border-2 border-dashed border-rose-400/70 text-rose-100 rounded-lg p-3 text-sm">
                <span className="font-black uppercase tracking-wider text-rose-300">⚠️ Error:</span> {errorMsg}
                <button
                  type="button"
                  onClick={reset}
                  className="ml-2 font-bold text-rose-200 underline hover:no-underline"
                >
                  Try again
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit || stage === 'submitting'}
              className="w-full px-4 py-3.5 bg-gradient-to-r from-emerald-400 via-cyan-400 to-sky-400 hover:from-emerald-300 hover:via-cyan-300 hover:to-sky-300 disabled:from-gray-700 disabled:via-gray-700 disabled:to-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed rounded-xl text-gray-900 font-black uppercase tracking-wider text-base shadow-[0_10px_30px_-10px_rgba(52,211,153,0.7)] transition-all"
            >
              {stage === 'submitting' ? 'Creating payment…' : 'Pay $24 — Get My Day Pass 🚀'}
            </button>

            <p className="text-xs text-center text-gray-400">
              Pay with PayPal or any major credit/debit card. No account required.
            </p>

            <p className="text-xs text-center text-gray-500">
              Need enterprise terms or a longer trial?{' '}
              <a
                href="mailto:support@landsurv.ai?subject=Enterprise%20LandSurv.ai%20Demo"
                className="text-cyan-300 font-semibold hover:underline"
              >
                Email us
              </a>
              .
            </p>
          </form>
        )}
        </div>
      </div>
    </div>
  );
};

export default DemoRequestModal;
