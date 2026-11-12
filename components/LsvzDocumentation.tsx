import React, { useEffect } from 'react';
import { XMarkIcon } from './icons';
import { AgentType } from '../types';
import { LsvzDocumentationContent } from './LsvzDocumentationContent.tsx';
import { LSVZ_SPEC_RELEASE, LSVZ_SPEC_VERSION } from '../utils/lsvzSchema';

interface LsvzDocumentationProps {
  onClose: () => void;
  activeAgent: AgentType;
}

const LsvzDocumentation: React.FC<LsvzDocumentationProps> = ({ onClose }) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center bg-gray-950/80 p-3 backdrop-blur-sm animate-fade-in sm:p-5"
      onClick={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lsvz-doc-title"
        className="flex h-[92vh] w-[min(96vw,1180px)] flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-950 shadow-2xl shadow-black/50 animate-modal-panel-fade-in-down"
      >
        <header className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-white/[0.08] bg-slate-950/95 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-400/25 bg-cyan-500/10 font-mono text-[11px] font-black tracking-tight text-cyan-300">
              .Z
            </div>
            <div className="min-w-0">
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-cyan-500">Open specification</p>
              <h2 id="lsvz-doc-title" className="truncate text-sm font-semibold text-white sm:text-base">
                .lsvz File Format Specification
              </h2>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 font-mono text-[10px] text-gray-400 md:inline-flex">
              v{LSVZ_SPEC_VERSION} · {LSVZ_SPEC_RELEASE}
            </span>
            <a
              href="https://lsvz.landsurv.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden rounded-md border border-cyan-400/20 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/20 sm:inline-flex"
            >
              Public page ↗
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-2 text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-white"
              aria-label="Close .lsvz specification"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <LsvzDocumentationContent />
        </div>
      </div>
    </div>
  );
};

export default LsvzDocumentation;
