import React, { useEffect, useState } from 'react';
import { ShieldAlert, X, ExternalLink, Info } from 'lucide-react';
import { subscribeBlockedAttempts, type BlockedAttempt } from '../utils/clawCompliance';
import { openSourcePolicyExplainer } from './PermissiveSourcesExplainer';

const AUTO_DISMISS_MS = 12000; // toasts auto-fade after 12s
const MAX_VISIBLE = 3;         // never stack more than 3 at once

interface VisibleToast extends BlockedAttempt {
  /** Set when the user manually dismisses or the auto-timer fires. */
  dismissed?: boolean;
}

/**
 * Passive, non-blocking notice that appears when an agent attempted to fetch
 * a TOS-restricted host. The notice is informational only — the user can:
 *   - read the host that was blocked
 *   - click "Open in your browser" to visit it themselves (a manual request
 *     from their own session, not via the app's automation)
 *   - click "Why?" to open the full PermissiveSourcesExplainer modal
 *   - dismiss it
 *
 * This component replaces the older consent-gateway modal. The app no longer
 * routes restricted hosts through a consent flow; they are hard-blocked at
 * the clawClient layer. See utils/clawCompliance.ts.
 */
const SourceBlockedNotice: React.FC = () => {
  const [toasts, setToasts] = useState<VisibleToast[]>([]);

  useEffect(() => {
    const unsub = subscribeBlockedAttempts((evt) => {
      setToasts((prev) => {
        // De-dupe rapid identical attempts (same URL within a 4s window).
        const recent = prev.find(
          (t) => !t.dismissed && t.url === evt.url && (Date.now() - t.timestamp) < 4000,
        );
        if (recent) return prev;
        const next = [...prev, evt as VisibleToast];
        // Cap the visible stack — drop the oldest non-dismissed if exceeded.
        const live = next.filter((t) => !t.dismissed);
        if (live.length > MAX_VISIBLE) {
          const oldest = live[0];
          return next.map((t) => (t.id === oldest.id ? { ...t, dismissed: true } : t));
        }
        return next;
      });

      // Auto-dismiss timer.
      window.setTimeout(() => {
        setToasts((prev) => prev.map((t) => (t.id === evt.id ? { ...t, dismissed: true } : t)));
        // Garbage-collect after the fade-out finishes.
        window.setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== evt.id));
        }, 400);
      }, AUTO_DISMISS_MS);
    });
    return () => { unsub(); };
  }, []);

  const visible = toasts.filter((t) => !t.dismissed);
  if (visible.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[90] flex flex-col gap-2 max-w-md pointer-events-none">
      {visible.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto bg-slate-900/95 border border-amber-700/50 rounded-xl shadow-2xl backdrop-blur-sm overflow-hidden animate-in slide-in-from-bottom-2 fade-in duration-200"
        >
          {/* Header */}
          <div className="flex items-start gap-3 px-4 pt-3 pb-2">
            <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-amber-300">
                Source blocked by TOS policy
              </div>
              <div className="text-sm text-white font-mono truncate" title={t.host}>
                {t.host}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.map((x) => (x.id === t.id ? { ...x, dismissed: true } : x)))}
              className="flex-shrink-0 p-1 rounded text-slate-500 hover:text-white hover:bg-slate-800 transition"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-4 pb-2 text-xs text-slate-400 leading-relaxed">
            The research agent tried to fetch this host. Its terms-of-service prohibit automated retrieval, so the LandSurv Claw blocked
            the request. The agent has been told to pivot to a permissive source.
          </div>

          {/* Actions */}
          <div className="px-4 pb-3 flex items-center gap-2">
            <a
              href={t.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-700/40 hover:bg-cyan-700/60 border border-cyan-600/40 text-cyan-200 text-xs font-medium transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open in your browser
            </a>
            <button
              type="button"
              onClick={openSourcePolicyExplainer}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition"
            >
              <Info className="w-3.5 h-3.5" />
              Why?
            </button>
            <div className="ml-auto text-[10px] text-slate-500 font-mono">{t.tool}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SourceBlockedNotice;
