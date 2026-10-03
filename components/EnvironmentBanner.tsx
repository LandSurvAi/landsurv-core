import React, { useState, useEffect } from 'react';
import { getAppEnvironment, type AppEnvironment } from '../utils/environment.ts';
import { AlertTriangle, ExternalLink, Info, X, ShieldAlert } from 'lucide-react';

interface EnvironmentBannerProps {
  /** Optional override for testing / stories */
  environmentOverride?: AppEnvironment;
}

/**
 * Visual banner displayed when LandSurv.ai is served from Staging or Local Development.
 *
 * Staging: Amber/Orange theme highlighting `staging.landsurv.ai` (branch: staging).
 * Local Dev: Emerald/Teal theme highlighting local development mode (`localhost`).
 * Production: Renders `null` (zero visual footprint).
 */
export const EnvironmentBanner: React.FC<EnvironmentBannerProps> = ({ environmentOverride }) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const environment = environmentOverride || getAppEnvironment();

  // Close dialog on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDialogOpen) {
        setIsDialogOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDialogOpen]);

  if (environment === 'production') {
    return null;
  }

  const isStaging = environment === 'staging';

  return (
    <>
      {isMinimized ? (
        <div className="fixed top-1 right-3 z-[9999] pointer-events-auto">
          <button
            type="button"
            onClick={() => setIsMinimized(false)}
            title={`Click to expand ${isStaging ? 'Staging' : 'Local Dev'} indicator`}
            className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold shadow-lg backdrop-blur border transition-all ${
              isStaging
                ? 'bg-amber-950/90 text-amber-300 border-amber-500/50 hover:bg-amber-900/90'
                : 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50 hover:bg-emerald-900/90'
            }`}
          >
            <span className={`inline-block w-2 h-2 rounded-full animate-pulse ${isStaging ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            <span>{isStaging ? 'STAGING' : 'DEV'}</span>
          </button>
        </div>
      ) : (
        <aside
          aria-label="Environment indicator"
          onClick={() => setIsDialogOpen(true)}
          className={`w-full shrink-0 flex items-center justify-between px-3 py-1 text-xs font-mono border-b shadow-sm z-[9999] cursor-pointer transition-colors select-none ${
            isStaging
              ? 'bg-amber-950/95 text-amber-200 border-amber-500/40 hover:bg-amber-900/90'
              : 'bg-emerald-950/95 text-emerald-200 border-emerald-500/40 hover:bg-emerald-900/90'
          }`}
          title="Click for environment details and production link"
        >
          <div className="flex items-center gap-2 min-w-0 overflow-hidden">
            <span className="flex items-center gap-1.5 font-bold uppercase tracking-wide shrink-0">
              <span className={`inline-block w-2 h-2 rounded-full animate-pulse ${isStaging ? 'bg-amber-400' : 'bg-emerald-400'}`} />
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                  isStaging ? 'bg-amber-500/30 text-amber-100 border border-amber-400/40' : 'bg-emerald-500/30 text-emerald-100 border border-emerald-400/40'
                }`}
              >
                {isStaging ? 'Staging Environment' : 'Local Dev'}
              </span>
            </span>

            <span className="hidden sm:inline text-gray-400">·</span>
            <span className="truncate text-[11px] opacity-90">
              {isStaging ? (
                <>
                  <span className="text-amber-100 font-semibold">staging.landsurv.ai</span>
                  <span className="hidden md:inline text-amber-300/70 ml-2">(branch: staging)</span>
                </>
              ) : (
                <>
                  <span className="text-emerald-100 font-semibold">localhost dev server</span>
                  <span className="hidden md:inline text-emerald-300/70 ml-2">(live reload active)</span>
                </>
              )}
            </span>
            <span className="hidden sm:inline text-[11px] opacity-80 underline underline-offset-2 decoration-dotted">
              (Click for more info)
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setIsDialogOpen(true)}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors flex items-center gap-1 font-semibold ${
                isStaging
                  ? 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 border border-amber-400/30'
                  : 'bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 border border-emerald-400/30'
              }`}
              title="Click for more info"
            >
              <Info className="w-3 h-3" />
              <span>Click for more info</span>
            </button>
            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                isStaging
                  ? 'text-amber-300/80 hover:text-amber-100 hover:bg-amber-800/40'
                  : 'text-emerald-300/80 hover:text-emerald-100 hover:bg-emerald-800/40'
              }`}
              title="Minimize banner to compact pill"
            >
              Minimize
            </button>
          </div>
        </aside>
      )}

      {/* Environment Information Dialog */}
      {isDialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="env-dialog-title"
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
          onClick={() => setIsDialogOpen(false)}
        >
          <div
            className={`relative w-full max-w-lg rounded-xl shadow-2xl border bg-slate-900 text-slate-100 p-6 overflow-hidden ${
              isStaging ? 'border-amber-500/50 shadow-amber-950/50' : 'border-emerald-500/50 shadow-emerald-950/50'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-700/80">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-lg ${
                    isStaging ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
                  }`}
                >
                  {isStaging ? <AlertTriangle className="w-6 h-6" /> : <Info className="w-6 h-6" />}
                </div>
                <div>
                  <h3 id="env-dialog-title" className="text-lg font-bold text-white font-sans">
                    {isStaging ? 'Staging & Preview Environment' : 'Local Development Environment'}
                  </h3>
                  <p className="text-xs font-mono text-slate-400 mt-0.5">
                    {isStaging ? 'staging.landsurv.ai' : 'localhost'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsDialogOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Close dialog"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="py-4 space-y-3.5 text-sm leading-relaxed text-slate-300 font-sans">
              {isStaging ? (
                <>
                  <p>
                    You are currently accessing the <strong className="text-amber-300 font-semibold">staging and pre-release testing environment</strong> of LandSurv.ai.
                  </p>
                  <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-500/30 text-xs text-amber-200/90 space-y-1.5">
                    <div className="flex items-center gap-2 font-semibold text-amber-200">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span>Pre-Release Notice</span>
                    </div>
                    <p>
                      This instance is used for quality assurance, automated integration testing, and previewing upcoming features. Data and session states may be reset or modified without notice.
                    </p>
                  </div>
                  <p>
                    For all production survey workflows, deed analyses, and official project deliverables, please use the live production platform.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    You are running LandSurv.ai in a <strong className="text-emerald-300 font-semibold">local development environment</strong> with live reloading enabled.
                  </p>
                  <p className="text-xs text-slate-400">
                    To visit the live production instance, click the link below.
                  </p>
                </>
              )}
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-slate-700/80 flex flex-col sm:flex-row items-center justify-end gap-2.5 font-sans">
              <button
                type="button"
                onClick={() => setIsDialogOpen(false)}
                className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                {isStaging ? 'Stay on Staging' : 'Close'}
              </button>
              <a
                href="https://landsurv.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg shadow-md hover:shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 text-center"
              >
                <span>Go to landsurv.ai (Production)</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default EnvironmentBanner;
