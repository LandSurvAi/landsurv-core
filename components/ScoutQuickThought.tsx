import React, { useEffect, useState } from 'react';
import { Square, ExternalLink } from 'lucide-react';
import { ScoutWordmark } from './ScoutWordmark.tsx';
import { A2UIScoutActivity } from './A2UIScoutActivity.tsx';
import { openA2UISurface } from '../services/a2uiSurfaces.ts';
import { scoutActivityStore, SCOUT_NARRATION_TTL_MS } from '../services/scoutActivityStore.ts';

const TONE: Record<string, string> = {
  info: 'text-slate-200',
  success: 'text-emerald-200',
  warn: 'text-amber-200',
  error: 'text-rose-200',
};

/**
 * Scout's only voice: one short line with a 9-second life. Nothing here is
 * written to chat history. The panel is the durable record.
 */
export const ScoutQuickThought: React.FC = () => {
  const narration = React.useSyncExternalStore(
    scoutActivityStore.subscribe,
    scoutActivityStore.getNarration,
    scoutActivityStore.getNarration,
  );
  const primary = React.useSyncExternalStore(
    scoutActivityStore.subscribe,
    scoutActivityStore.getSnapshot,
    scoutActivityStore.getSnapshot,
  );
  const activeCount = React.useSyncExternalStore(
    scoutActivityStore.subscribe,
    scoutActivityStore.getActiveRunCount,
    scoutActivityStore.getActiveRunCount,
  );
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!narration) return;
    const remaining = Math.max(0, narration.expiresAt - Date.now());
    const timer = window.setTimeout(() => {
      scoutActivityStore.clearNarration();
    }, remaining);
    const ticker = window.setInterval(() => forceTick(value => value + 1), 250);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(ticker);
    };
  }, [narration]);

  if (!narration && activeCount === 0) return null;

  const runId = narration?.runId ?? primary?.id;
  const run = runId ? scoutActivityStore.getRun(runId) : null;
  const text = narration?.text
    ?? (run?.status === 'running' ? 'Scout is grounded and checking public sources.' : run?.summary)
    ?? 'Scout is checking public sources.';
  const tone = narration?.tone ?? 'info';
  const remaining = narration
    ? Math.max(0, narration.expiresAt - Date.now())
    : 0;
  const ttlPercent = narration ? Math.max(0, Math.min(100, (remaining / SCOUT_NARRATION_TTL_MS) * 100)) : 0;

  const openPanel = () => {
    if (!runId) return;
    const key = `scout-activity-${runId}`;
    openA2UISurface({
      key,
      definitionId: 'scout-activity',
      title: 'Scout run audit',
      subtitle: run?.title ?? 'Live crawl',
      category: 'workspace',
      accent: 'cyan',
      size: 'standard',
      source: 'resolver:scout',
      content: <A2UIScoutActivity surfaceKey={key} variant="surface" runId={runId} />,
    });
  };

  return (
    <div
      data-testid="scout-quick-thought"
      data-tone={tone}
      className="mb-2 overflow-hidden rounded-lg border border-cyan-400/25 bg-[#06101b]/90"
    >
      <div className="flex items-center justify-between gap-2 px-2.5 pt-2">
        <div className="flex min-w-0 items-center gap-2">
          <ScoutWordmark size="xs" />
          <span className={`h-1 w-1 shrink-0 rounded-full ${activeCount > 0 ? 'animate-pulse bg-cyan-300' : 'bg-slate-500'}`} />
          <span className="truncate font-mono text-[8.5px] uppercase tracking-[0.16em] text-slate-500">
            {activeCount > 0 ? `${activeCount} active` : 'finished'}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => scoutActivityStore.requestStop()}
              className="inline-flex items-center gap-1 rounded border border-rose-400/30 bg-rose-400/10 px-1.5 py-0.5 text-[9px] font-semibold text-rose-200 transition-colors hover:bg-rose-400/20"
            >
              <Square className="h-2 w-2" />
              Stop
            </button>
          )}
          <button
            type="button"
            onClick={openPanel}
            disabled={!runId}
            className="inline-flex items-center gap-1 rounded border border-cyan-300/25 px-1.5 py-0.5 text-[9px] font-semibold text-cyan-200 transition-colors hover:border-cyan-200/50 hover:text-cyan-100 disabled:opacity-40"
          >
            <ExternalLink className="h-2 w-2" />
            View data
          </button>
        </div>
      </div>
      <div className={`px-2.5 pb-1.5 pt-1 text-[11.5px] leading-snug ${TONE[tone] ?? TONE.info}`}>
        {text}
      </div>
      <div className="h-0.5 w-full bg-white/5">
        <div
          className="h-full bg-cyan-400/70 transition-[width] duration-200 ease-linear"
          style={{ width: `${ttlPercent}%` }}
        />
      </div>
    </div>
  );
};

export default ScoutQuickThought;
