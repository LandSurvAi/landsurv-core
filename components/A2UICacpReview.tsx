import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  RotateCcw,
  ShieldAlert,
  Network,
} from 'lucide-react';
import { AgentType, type A2UICacpReviewContext, type A2UICacpReviewItem } from '../types.ts';

interface A2UICacpReviewProps {
  context: A2UICacpReviewContext;
  /** Re-dispatch the original CACP message through the bus. */
  onRetry?: (item: A2UICacpReviewItem) => Promise<unknown> | void;
  /** Open the owning agent's manifest. */
  onInspect?: (agent: AgentType) => void;
  onClose?: () => void;
}

type Severity = 'info' | 'warn' | 'blocked';

const SEVERITY_STYLES: Record<Severity, { chip: string; icon: React.ReactNode; label: string }> = {
  info: {
    chip: 'border-cyan-400/25 bg-cyan-400/10 text-cyan-200',
    icon: <Network className="h-3 w-3" />,
    label: 'Info',
  },
  warn: {
    chip: 'border-amber-400/25 bg-amber-400/10 text-amber-200',
    icon: <AlertTriangle className="h-3 w-3" />,
    label: 'Review',
  },
  blocked: {
    chip: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
    icon: <Ban className="h-3 w-3" />,
    label: 'Blocked',
  },
};

function severityOf(item: A2UICacpReviewItem): Severity {
  if (item.policyStatus === 'blocked' || item.phase === 'error') return 'blocked';
  if (item.policyStatus === 'warn' || item.phase === 'no-handler') return 'warn';
  return 'info';
}

function formatTime(timestamp: number): string {
  try {
    return new Date(timestamp).toISOString().slice(11, 19);
  } catch {
    return '—';
  }
}

function summaryFor(item: A2UICacpReviewItem): string {
  if (item.summary) return item.summary;
  switch (item.phase) {
    case 'send':
      return `Sent ${item.command}`;
    case 'handler':
      return `Handler invoked for ${item.command}`;
    case 'response':
      return item.success === false ? `Failed ${item.command}` : `Completed ${item.command}`;
    case 'error':
      return item.summary || `Error in ${item.command}`;
    case 'no-handler':
      return `No handler registered for ${item.command}`;
    default:
      return item.command;
  }
}

/**
 * Review surface for notable CACP traffic.
 *
 * This is the UI half of the A2UI ↔ CACP bridge: the bridge watches the CACP
 * log, opens this surface for offers / policy warnings / blocked sends, and the
 * user can inspect the owning manifest or re-dispatch the original message.
 */
export const A2UICacpReview: React.FC<A2UICacpReviewProps> = ({
  context,
  onRetry,
  onInspect,
  onClose,
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [dispositions, setDispositions] = useState<Record<string, 'accepted' | 'copied'>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const counts = useMemo(() => {
    return context.items.reduce(
      (acc, item) => {
        acc[severityOf(item)] += 1;
        return acc;
      },
      { info: 0, warn: 0, blocked: 0 } as Record<Severity, number>,
    );
  }, [context.items]);

  const toggle = (id: string) => {
    setExpanded(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copy = async (item: A2UICacpReviewItem) => {
    try {
      await navigator.clipboard?.writeText(JSON.stringify(item, null, 2));
      setDispositions(previous => ({ ...previous, [item.id]: 'copied' }));
    } catch {
      /* clipboard unavailable */
    }
  };

  const retry = async (item: A2UICacpReviewItem) => {
    if (!onRetry) return;
    setBusyId(item.id);
    try {
      await onRetry(item);
      setDispositions(previous => ({ ...previous, [item.id]: 'accepted' }));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div data-testid="a2ui-cacp-review" className="flex min-h-0 flex-col">
      <div className="border-b border-white/[0.08] px-3.5 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">
              <ShieldAlert className="h-3 w-3" />
              CACP traffic review
            </p>
            <p className="mt-1 max-w-lg text-[11px] leading-snug text-slate-400">
              {context.title
                ? context.title
                : 'Notable inter-agent traffic. Nothing is re-dispatched until you approve it.'}
            </p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-white/[0.08] px-2 py-1 text-[10px] font-semibold text-slate-400 transition-colors hover:border-white/[0.18] hover:text-slate-200"
            >
              Close
            </button>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-rose-400/25 bg-rose-400/10 px-2 py-0.5 text-[9px] font-semibold text-rose-200">
            {counts.blocked} blocked
          </span>
          <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[9px] font-semibold text-amber-200">
            {counts.warn} need review
          </span>
          <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-0.5 text-[9px] font-semibold text-cyan-200">
            {counts.info} informational
          </span>
          {context.focusTraceId && (
            <span className="ml-auto truncate font-mono text-[9px] text-slate-500">
              trace {context.focusTraceId}
            </span>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
        {context.items.length === 0 && (
          <p className="px-2 py-8 text-center text-[11px] text-slate-500">
            No notable CACP traffic in this window.
          </p>
        )}

        {context.items.map(item => {
          const severity = severityOf(item);
          const style = SEVERITY_STYLES[severity];
          const isExpanded = expanded.has(item.id);
          const disposition = dispositions[item.id];
          const owner = item.to !== 'broadcast' ? (item.to as AgentType) : null;

          return (
            <article
              key={item.id}
              className="overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.02]"
            >
              <div className="flex items-start gap-2 px-2.5 py-2">
                <span className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide ${style.chip}`}>
                  {style.icon}
                  {style.label}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className="truncate font-mono text-[11px] font-semibold text-slate-100">
                      {item.command}
                    </span>
                    <span className="text-[9px] text-slate-500">
                      {item.from} → {item.to}
                    </span>
                    <span className="ml-auto font-mono text-[9px] text-slate-600">{formatTime(item.timestamp)}</span>
                  </div>
                  <p className="mt-0.5 text-[10.5px] leading-snug text-slate-400">{summaryFor(item)}</p>

                  {item.policyWarnings && item.policyWarnings.length > 0 && (
                    <p className="mt-1 rounded border border-amber-400/20 bg-amber-400/[0.06] px-1.5 py-1 text-[9.5px] leading-snug text-amber-200/90">
                      {item.policyWarnings.join(' · ')}
                    </p>
                  )}

                  {isExpanded && (
                    <pre className="mt-1.5 max-h-40 overflow-auto rounded border border-white/[0.07] bg-black/30 p-2 font-mono text-[9px] leading-relaxed text-slate-300">
                      {item.preview || JSON.stringify(item.data ?? {}, null, 2)}
                    </pre>
                  )}

                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => toggle(item.id)}
                      className="inline-flex items-center gap-1 rounded border border-white/[0.08] px-1.5 py-0.5 text-[9px] font-semibold text-slate-400 transition-colors hover:border-white/[0.16] hover:text-slate-200"
                    >
                      {isExpanded ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
                      {isExpanded ? 'Hide payload' : 'Inspect payload'}
                    </button>
                    <button
                      type="button"
                      onClick={() => copy(item)}
                      className="inline-flex items-center gap-1 rounded border border-white/[0.08] px-1.5 py-0.5 text-[9px] font-semibold text-slate-400 transition-colors hover:border-white/[0.16] hover:text-slate-200"
                    >
                      <Copy className="h-2.5 w-2.5" />
                      {disposition === 'copied' ? 'Copied' : 'Copy JSON'}
                    </button>
                    {onInspect && owner && (
                      <button
                        type="button"
                        onClick={() => onInspect(owner)}
                        className="inline-flex items-center gap-1 rounded border border-emerald-400/25 bg-emerald-400/[0.06] px-1.5 py-0.5 text-[9px] font-semibold text-emerald-200 transition-colors hover:border-emerald-400/45 hover:bg-emerald-400/10"
                      >
                        <Network className="h-2.5 w-2.5" />
                        Inspect manifest
                      </button>
                    )}
                    {onRetry && (
                      <button
                        type="button"
                        onClick={() => retry(item)}
                        disabled={busyId === item.id || disposition === 'accepted'}
                        className="ml-auto inline-flex items-center gap-1 rounded border border-cyan-400/30 bg-cyan-400/10 px-1.5 py-0.5 text-[9px] font-semibold text-cyan-200 transition-colors hover:border-cyan-300/55 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {disposition === 'accepted' ? (
                          <CheckCircle2 className="h-2.5 w-2.5" />
                        ) : (
                          <RotateCcw className={`h-2.5 w-2.5 ${busyId === item.id ? 'animate-spin' : ''}`} />
                        )}
                        {disposition === 'accepted' ? 'Re-dispatched' : 'Re-dispatch'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <p className="border-t border-white/[0.07] px-3 py-2 text-[9px] text-slate-500">
        Policy is evaluated again on every re-dispatch. This surface never bypasses the CACP gate.
      </p>
    </div>
  );
};

export default A2UICacpReview;
