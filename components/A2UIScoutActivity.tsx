import React, { useContext, useEffect, useRef, useSyncExternalStore } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Maximize2,
  Radar,
  Square,
  X,
} from 'lucide-react';
import { A2UIHostContext } from './A2UISurface.tsx';
import { ScoutHiker } from './ScoutHiker.tsx';
import { closeA2UISurface, openA2UISurface } from '../services/a2uiSurfaces.ts';
import { scoutActivityStore } from '../services/scoutActivityStore.ts';
import type { A2UIScoutActivityEvent, A2UIScoutActivitySnapshot } from '../types.ts';

const STATUS_COPY: Record<A2UIScoutActivitySnapshot['status'], string> = {
  running: 'Live',
  success: 'Complete',
  error: 'Needs attention',
  cancelled: 'Stopped',
};

const STATUS_TONE: Record<A2UIScoutActivitySnapshot['status'], string> = {
  running: 'border-cyan-400/35 bg-cyan-400/10 text-cyan-200',
  success: 'border-emerald-400/35 bg-emerald-400/10 text-emerald-200',
  error: 'border-amber-400/35 bg-amber-400/10 text-amber-200',
  cancelled: 'border-slate-400/25 bg-slate-400/10 text-slate-300',
};

const LEVEL_TONE: Record<NonNullable<A2UIScoutActivityEvent['level']>, string> = {
  info: 'bg-slate-500',
  success: 'bg-emerald-400',
  warn: 'bg-amber-400',
  error: 'bg-rose-400',
};

function formatEventTime(at: number): string {
  try {
    return new Date(at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '';
  }
}

interface A2UIScoutActivityProps {
  /** Unique bus key for this run, so a new run cannot reopen minimized. */
  surfaceKey?: string;
  /** Inline lives inside the Quick Thought card; surface is the pop-out host. */
  variant?: 'surface' | 'inline';
}

/**
 * Live Scout activity. It reads the module-level activity store so events keep
 * streaming into the already-mounted card without replacing the chat message
 * that started the run.
 */
export const A2UIScoutActivity: React.FC<A2UIScoutActivityProps> = ({
  surfaceKey = 'scout-activity',
  variant = 'surface',
}) => {
  const host = useContext(A2UIHostContext);
  const inline = variant === 'inline';
  const snapshot = useSyncExternalStore(
    scoutActivityStore.subscribe,
    scoutActivityStore.getSnapshot,
    scoutActivityStore.getSnapshot,
  );
  const logRef = useRef<HTMLDivElement>(null);
  const eventCount = snapshot?.events.length ?? 0;

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [eventCount]);

  if (!snapshot) {
    if (inline) return null;
    return (
      <div
        data-testid="a2ui-scout-activity"
        className="p-4 text-xs text-slate-400"
      >
        No Scout run yet. The live browser activity appears here when a public
        GIS layer is being resolved.
      </div>
    );
  }

  const running = snapshot.status === 'running';
  const statusIcon =
    snapshot.status === 'success' ? (
      <CheckCircle2 className="h-3 w-3" />
    ) : snapshot.status === 'error' ? (
      <AlertTriangle className="h-3 w-3" />
    ) : running ? (
      <Loader2 className="h-3 w-3 animate-spin" />
    ) : (
      <Square className="h-2.5 w-2.5" />
    );

  const popOut = () => {
    const key = `scout-activity-${snapshot.id}`;
    openA2UISurface({
      key,
      definitionId: 'scout-activity',
      title: 'Scout live',
      subtitle: snapshot.title,
      category: 'workspace',
      accent: 'cyan',
      size: 'standard',
      source: 'resolver:scout',
      content: <A2UIScoutActivity surfaceKey={key} variant="surface" />,
    });
  };

  return (
    <div
      data-testid={inline ? 'a2ui-scout-inline' : 'a2ui-scout-activity'}
      className={
        inline
          ? 'mt-2.5 flex flex-col overflow-hidden rounded-lg border border-cyan-400/20 bg-[#07111c]/85 text-xs text-slate-200'
          : 'flex flex-col bg-[#070e18]/70 text-xs text-slate-200'
      }
    >
      <ScoutHiker running={running} compact={inline} className="border-b border-white/[0.08]" />
      <div className={inline ? 'border-b border-white/[0.08] px-2.5 py-2' : 'border-b border-white/[0.08] px-3.5 py-3'}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className={`flex items-center gap-1.5 font-bold uppercase tracking-[0.14em] text-cyan-300 ${inline ? 'text-[9px]' : 'text-[10px]'}`}>
              <Radar className={inline ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
              Scout {inline ? 'live' : 'live activity'}
            </div>
            <div className={`mt-1 truncate font-semibold text-white ${inline ? 'text-[11px]' : ''}`}>
              {snapshot.title}
            </div>
            {snapshot.subtitle && (
              <div className={`mt-0.5 truncate text-slate-400 ${inline ? 'text-[9px]' : 'text-[10px]'}`}>
                {snapshot.subtitle}
              </div>
            )}
          </div>
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${STATUS_TONE[snapshot.status]}`}
          >
            {statusIcon}
            {STATUS_COPY[snapshot.status]}
          </span>
        </div>
        {running && (
          <div className="mt-2.5 h-0.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-cyan-400" />
          </div>
        )}
      </div>

      <div
        ref={logRef}
        aria-live="polite"
        className={
          inline
            ? 'max-h-[168px] min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2 py-2'
            : 'max-h-[46vh] min-h-0 flex-1 space-y-2 overflow-y-auto px-3.5 py-3'
        }
      >
        {snapshot.events.map((event, index) => (
          <div
            key={`${event.at}-${index}`}
            className={`flex items-start gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] ${inline ? 'px-2 py-1.5' : 'px-2.5 py-2'}`}
          >
            <span
              className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                LEVEL_TONE[event.level ?? 'info']
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className={`flex items-center gap-2 uppercase tracking-[0.12em] text-slate-500 ${inline ? 'text-[8px]' : 'text-[9px]'}`}>
                <span>{formatEventTime(event.at)}</span>
                <span className="truncate">{event.phase}</span>
              </div>
              <div className={`mt-1 break-words leading-relaxed text-slate-200 ${inline ? 'text-[10px]' : 'text-[11px]'}`}>
                {event.message}
              </div>
              {event.url && (
                <a
                  href={event.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-cyan-300 hover:text-cyan-100"
                >
                  Open source
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className={`flex items-center justify-between gap-2 border-t border-white/[0.08] ${inline ? 'px-2.5 py-1.5' : 'px-3.5 py-2.5'}`}>
        <span className="truncate text-[10px] text-slate-500">
          {snapshot.summary ?? `${snapshot.events.length} live event${snapshot.events.length === 1 ? '' : 's'}`}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {running && host.onScoutStop && (
            <button
              type="button"
              onClick={() => host.onScoutStop?.()}
              className="inline-flex items-center gap-1 rounded border border-rose-400/30 bg-rose-400/10 px-2 py-1 text-[10px] font-semibold text-rose-200 transition-colors hover:border-rose-300/50 hover:bg-rose-400/20"
            >
              <Square className="h-2.5 w-2.5" />
              Stop
            </button>
          )}
          {inline ? (
            <>
              <button
                type="button"
                onClick={popOut}
                className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-[10px] font-semibold text-cyan-200 transition-colors hover:border-cyan-300/40 hover:text-cyan-100"
              >
                <Maximize2 className="h-2.5 w-2.5" />
                Pop out
              </button>
              <button
                type="button"
                onClick={() => scoutActivityStore.reset()}
                className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-[10px] font-semibold text-slate-400 transition-colors hover:border-white/20 hover:text-slate-200"
              >
                <X className="h-2.5 w-2.5" />
                Dismiss
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => closeA2UISurface(surfaceKey)}
              className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-[10px] font-semibold text-slate-400 transition-colors hover:border-white/20 hover:text-slate-200"
            >
              <X className="h-2.5 w-2.5" />
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default A2UIScoutActivity;
