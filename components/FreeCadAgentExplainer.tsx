import React from 'react';

interface FreeCadAgentExplainerProps {
  title: string;
  message: string;
  actionLabel?: string;
  onClose: () => void;
  onOpenIntake: () => void;
}

/**
 * Small, dismissible Free CAD explainer. It deliberately does not open the
 * welcome overlay; blocked agents get a quiet inline explanation plus a direct
 * route into the Business CAD intake.
 */
const FreeCadAgentExplainer: React.FC<FreeCadAgentExplainerProps> = ({
  title,
  message,
  actionLabel,
  onClose,
  onOpenIntake,
}) => (
  <aside
    role="status"
    aria-live="polite"
    className="fixed bottom-40 left-1/2 z-[9500] w-[min(430px,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-cyan-400/30 bg-slate-950/95 p-3 text-xs text-slate-200 shadow-[0_16px_46px_rgba(0,0,0,0.55)] backdrop-blur"
  >
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-cyan-200">{title}</p>
        <p className="mt-1 leading-relaxed text-slate-300">{message}</p>
        <button
          type="button"
          onClick={onOpenIntake}
          className="mt-2 font-semibold text-cyan-300 underline decoration-cyan-400/40 underline-offset-2 transition-colors hover:text-cyan-200"
        >
          {actionLabel ?? 'Open Business CAD intake →'}
        </button>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss Free CAD explainer"
        className="shrink-0 rounded p-1 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200"
      >
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  </aside>
);

export default FreeCadAgentExplainer;
