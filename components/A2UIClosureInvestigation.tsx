import React from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  Info,
  Loader2,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import type { Ambiguity } from '../types.ts';
import type { DeedClosureHypothesis, DeedClosureReview } from '../services/geminiService.ts';

interface A2UIClosureInvestigationProps {
  fileName: string;
  ambiguities: Ambiguity[];
  reviewStatus: 'loading' | 'complete' | 'unavailable';
  humanReview?: DeedClosureReview;
  reviewError?: string;
  /** Review-only: the host confirms before writing any proposed patch. */
  onApplyHypothesis?: (hypothesis: DeedClosureHypothesis) => void;
  onClose?: () => void;
}

const SEVERITY_STYLES: Record<string, { chip: string; icon: React.ReactNode; label: string }> = {
  error: {
    chip: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
    icon: <AlertOctagon className="h-3 w-3" />,
    label: 'Error',
  },
  warning: {
    chip: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
    icon: <AlertTriangle className="h-3 w-3" />,
    label: 'Warning',
  },
  info: {
    chip: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200',
    icon: <Info className="h-3 w-3" />,
    label: 'Info',
  },
};

const CONFIDENCE_CHIPS: Record<string, string> = {
  high: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  medium: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
  low: 'border-white/10 bg-white/[0.04] text-slate-300',
};

const statusChip = (ambiguities: Ambiguity[]): { label: string; className: string } => {
  if (ambiguities.some(item => item.severity === 'error')) {
    return { label: 'Action needed', className: 'border-rose-400/30 bg-rose-400/10 text-rose-200' };
  }
  if (ambiguities.length > 0) {
    return { label: 'Review suggested', className: 'border-sky-400/30 bg-sky-400/10 text-sky-200' };
  }
  return { label: 'Geometry closes clean', className: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' };
};

/**
 * A2UI surface for the Boundary Editor's Investigate action.
 *
 * Deterministic geometry findings are shown first; the source-aware deed review
 * is advisory and every proposed patch still requires explicit confirmation.
 */
export const A2UIClosureInvestigation: React.FC<A2UIClosureInvestigationProps> = ({
  fileName,
  ambiguities,
  reviewStatus,
  humanReview,
  reviewError,
  onApplyHypothesis,
  onClose,
}) => {
  const status = statusChip(ambiguities);

  return (
    <div data-testid="a2ui-closure-investigation" className="flex min-h-0 flex-col">
      <div className="border-b border-white/[0.08] px-3.5 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300">
              <FileSearch className="h-3 w-3" />
              Closure investigation
            </p>
            <p className="mt-1 truncate text-[12px] font-semibold text-slate-100">{fileName}</p>
            <p className="mt-0.5 text-[10.5px] leading-snug text-slate-400">
              Compare the parsed traverse with the source deed. Geometry findings are deterministic; hypotheses are
              review-only until you confirm them.
            </p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded border border-white/[0.08] px-2 py-1 text-[10px] font-semibold text-slate-400 transition-colors hover:border-white/[0.18] hover:text-slate-200"
            >
              Close
            </button>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${status.className}`}>
            {status.label}
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-semibold text-slate-300">
            {ambiguities.length} geometry item{ambiguities.length === 1 ? '' : 's'}
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-semibold text-slate-300">
            {reviewStatus === 'loading'
              ? 'Reading deed…'
              : reviewStatus === 'complete'
                ? `${humanReview?.hypotheses.length ?? 0} hypothesis${(humanReview?.hypotheses.length ?? 0) === 1 ? '' : 'es'}`
                : 'Source review unavailable'}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <section className="rounded-lg border border-white/[0.08] bg-white/[0.02]">
          <header className="flex items-center justify-between gap-2 border-b border-white/[0.07] px-3 py-2">
            <h4 className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-200">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
              Deterministic geometry
            </h4>
            <span className="font-mono text-[9px] text-slate-500">no geometry is changed</span>
          </header>

          {ambiguities.length === 0 ? (
            <p className="px-3 py-4 text-[11px] text-emerald-200/90">
              No deterministic geometry issues detected. Bearing, distance, curve, and closure checks all passed.
            </p>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {ambiguities.map(ambiguity => {
                const style = SEVERITY_STYLES[ambiguity.severity] ?? SEVERITY_STYLES.info;
                return (
                  <li key={ambiguity.id} className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide ${style.chip}`}>
                        {style.icon}
                        {style.label}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-100">{ambiguity.kind}</span>
                    </div>
                    <p className="mt-1 text-[10.5px] leading-snug text-slate-400">{ambiguity.reason}</p>
                    {ambiguity.proposedFix && (
                      <p className="mt-1 text-[10px] italic leading-snug text-slate-500">
                        Computed possibility: {ambiguity.proposedFix.summary}. Not applied automatically.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-white/[0.08] bg-white/[0.02]">
          <header className="flex items-center justify-between gap-2 border-b border-white/[0.07] px-3 py-2">
            <h4 className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-200">
              <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
              Deed evidence review
            </h4>
            <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-wide text-cyan-200">
              advisory
            </span>
          </header>

          {reviewStatus === 'loading' && (
            <div className="flex items-center gap-2 px-3 py-4 text-[11px] text-slate-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" />
              Comparing the traverse with the source deed and testing likely transcription errors…
            </div>
          )}

          {reviewStatus === 'unavailable' && (
            <div className="px-3 py-3">
              <p className="inline-flex items-start gap-1.5 text-[11px] leading-snug text-rose-200">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>Source review unavailable: {reviewError}</span>
              </p>
              <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
                The deterministic geometry findings above are still valid. Add an AI key in Settings to run the
                source-aware comparison.
              </p>
            </div>
          )}

          {humanReview && (
            <div className="space-y-3 px-3 py-3">
              <p className="text-[11px] leading-snug text-slate-200">{humanReview.summary}</p>

              {humanReview.hypotheses.length === 0 ? (
                <p className="text-[10.5px] leading-snug text-slate-400">
                  No evidence-based cause could be isolated. Verify the deed image, adjoining descriptions, and survey
                  records manually.
                </p>
              ) : (
                <div className="space-y-2">
                  {humanReview.hypotheses.map(hypothesis => {
                    const canApply = hypothesis.rowIndex !== undefined && !!hypothesis.proposedPatch;
                    return (
                      <article
                        key={hypothesis.id}
                        className="rounded-lg border border-white/[0.08] bg-black/20 px-2.5 py-2"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded border px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide ${CONFIDENCE_CHIPS[hypothesis.confidence] ?? CONFIDENCE_CHIPS.low}`}>
                            {hypothesis.confidence}
                          </span>
                          <span className="text-[11px] font-semibold text-slate-100">{hypothesis.title}</span>
                          {hypothesis.rowIndex !== undefined && (
                            <span className="ml-auto font-mono text-[9px] text-slate-500">
                              row {hypothesis.rowIndex + 1}
                            </span>
                          )}
                        </div>

                        <p className="mt-1.5 text-[10.5px] leading-snug text-slate-300">{hypothesis.reason}</p>

                        {hypothesis.sourceQuote && (
                          <blockquote className="mt-2 border-l-2 border-cyan-500/60 pl-2 text-[10px] italic leading-snug text-cyan-100/90">
                            “{hypothesis.sourceQuote}”
                            {hypothesis.sourcePage ? ` — page ${hypothesis.sourcePage}` : ''}
                          </blockquote>
                        )}

                        <p className="mt-2 text-[10px] leading-snug text-slate-400">
                          <span className="font-semibold text-slate-300">Geometry:</span>{' '}
                          {hypothesis.geometricEvidence}
                        </p>

                        {canApply && (
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded border border-white/[0.07] bg-white/[0.02] px-2 py-1.5">
                            <span className="font-mono text-[9.5px] text-emerald-300">
                              Proposed:{' '}
                              {Object.entries(hypothesis.proposedPatch ?? {})
                                .map(([field, value]) => `${field}=${String(value)}`)
                                .join(', ')}
                            </span>
                            {onApplyHypothesis && (
                              <button
                                type="button"
                                onClick={() => onApplyHypothesis(hypothesis)}
                                className="inline-flex items-center gap-1 rounded border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[9px] font-semibold text-cyan-200 transition-colors hover:border-cyan-300/55 hover:bg-cyan-400/20"
                              >
                                Review and apply →
                              </button>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}

              {humanReview.cautions.length > 0 && (
                <div className="rounded-lg border border-sky-400/20 bg-sky-400/[0.06] px-2.5 py-2 text-[10px] leading-snug text-sky-100/90">
                  <p className="font-semibold text-sky-200">Verify before changing the deed calls</p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5">
                    {humanReview.cautions.map((caution, index) => (
                      <li key={index}>{caution}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <p className="border-t border-white/[0.07] px-3 py-2 text-[9px] leading-snug text-slate-500">
        Geometry findings are computed locally. Source hypotheses are advisory, and no call changes until you confirm a
        proposal.
      </p>
    </div>
  );
};

export default A2UIClosureInvestigation;
