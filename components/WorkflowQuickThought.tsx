import React from 'react';
import type { AgentType } from '../types.ts';

export type WorkflowQuickThoughtAttention = 'active' | 'away' | 'complete';

export interface WorkflowQuickThoughtStep {
  id: string;
  label: string;
  status: 'complete' | 'current' | 'pending';
}

export interface WorkflowQuickThoughtNotice {
  key: string;
  title: string;
  /** Agent whose workflow this proposition belongs to. */
  ownerAgent?: AgentType;
  /** A2UI surface this generation proposition represents, when applicable. */
  surface?: 'surveyors-eye';
  attention: WorkflowQuickThoughtAttention;
  progressLabel: string;
  summary: string;
  steps: WorkflowQuickThoughtStep[];
  actionLabel: string;
  onAction: () => void;
  onDismiss?: () => void;
}

const SurveyorsEyeGlyph: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    {...props}
    data-testid="surveyors-eye-glyph"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M2.8 12c1.5-3.4 4.9-5.8 9.2-5.8s7.7 2.4 9.2 5.8c-1.5 3.4-4.9 5.8-9.2 5.8S4.3 15.4 2.8 12Z" />
    <circle cx="12" cy="12" r="2.7" />
    <path d="M12 2.7v2.4M12 18.9v2.4M2.7 12h2.4M18.9 12h2.4" />
  </svg>
);

const ATTENTION_STYLES: Record<
  WorkflowQuickThoughtAttention,
  { box: string; badge: string; action: string }
> = {
  active: {
    box: 'border-cyan-400/25 bg-cyan-400/[0.05]',
    badge: 'text-cyan-300',
    action: 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/20',
  },
  away: {
    box: 'border-amber-400/30 bg-amber-400/[0.06]',
    badge: 'text-amber-300',
    action: 'border-amber-400/45 bg-amber-400/15 text-amber-50 hover:bg-amber-400/25',
  },
  complete: {
    box: 'border-emerald-400/30 bg-emerald-400/[0.06]',
    badge: 'text-emerald-300',
    action: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/20',
  },
};

/**
 * Compact workflow status shown in the Quick Thought bubble. The same card is
 * used for the next-step nudge, the "you stepped away" reminder, and the
 * completed state so the flow is never silently forgotten.
 */
export const WorkflowQuickThought: React.FC<{ notice: WorkflowQuickThoughtNotice }> = ({
  notice,
}) => {
  const styles = ATTENTION_STYLES[notice.attention];
  const isSurveyorsEye = notice.surface === 'surveyors-eye';

  return (
    <div
      data-testid="workflow-quick-thought"
      data-attention={notice.attention}
      className={`mt-1 rounded-lg border px-2.5 py-2 ${styles.box}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`flex min-w-0 items-center gap-1.5 ${styles.badge}`}>
          {isSurveyorsEye && <SurveyorsEyeGlyph className="h-3.5 w-3.5 shrink-0" />}
          <span className="truncate text-[9px] font-bold uppercase tracking-[0.14em]">{notice.title}</span>
        </span>
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-white/45">
          {notice.progressLabel}
        </span>
      </div>

      <div className="mt-1.5 space-y-1">
        {notice.steps.map((step, index) => {
          const isComplete = step.status === 'complete';
          const isCurrent = step.status === 'current';
          return (
            <div key={step.id} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border font-mono text-[8px] font-bold ${
                  isComplete
                    ? 'border-emerald-400/50 bg-emerald-400/20 text-emerald-200'
                    : isCurrent
                      ? 'border-white/45 bg-white/[0.10] text-white'
                      : 'border-white/15 bg-transparent text-white/35'
                }`}
              >
                {isComplete ? '✓' : index + 1}
              </span>
              <span
                className={`text-[10.5px] leading-tight ${
                  isCurrent ? 'font-semibold text-white' : isComplete ? 'text-white/75' : 'text-white/40'
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-[10.5px] leading-snug text-white/65">{notice.summary}</p>

      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          data-no-drag
          onClick={notice.onAction}
          className={`inline-flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors ${styles.action}`}
        >
          <span className="truncate">{notice.actionLabel}</span>
          <span aria-hidden="true">→</span>
        </button>
        {notice.onDismiss && (
          <button
            type="button"
            data-no-drag
            onClick={notice.onDismiss}
            className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-[10px] font-semibold text-white/45 transition-colors hover:border-white/25 hover:text-white/80"
          >
            Not now
          </button>
        )}
      </div>
    </div>
  );
};

export default WorkflowQuickThought;
