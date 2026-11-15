import React from 'react';
import type { FreeCadTrialSnapshot } from '../services/freeCadTrial.ts';

interface FreeCadTrialBadgeProps {
  snapshot: FreeCadTrialSnapshot;
  onUpgrade: () => void;
}

/**
 * Small persistent trial status near the workspace. It shows how much of the
 * lifetime allowance has been spent, including the deed sub-allowance, and
 * makes clear that drawing and local saves continue after inference pauses.
 */
const FreeCadTrialBadge: React.FC<FreeCadTrialBadgeProps> = ({ snapshot, onUpgrade }) => {
  const used = Math.max(0, Math.min(snapshot.limit, Math.floor(snapshot.used)));
  const deedUsed = Math.max(0, Math.min(snapshot.deedLimit, Math.floor(snapshot.deedUsed)));
  const remaining = Math.max(0, snapshot.limit - used);
  const exhausted = remaining <= 0;
  const low = remaining <= 5;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Free CAD trial: ${used} of ${snapshot.limit} inference prompts used, ${deedUsed} of ${snapshot.deedLimit} deed prompts used${exhausted ? ', CAD remains free, inference paused; drawing and saving still work' : ', trial use only, not for business use'}`}
      className={`fixed bottom-24 right-4 z-[9000] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-lg border px-3 py-2 text-xs shadow-[0_12px_36px_rgba(0,0,0,0.45)] backdrop-blur ${
        exhausted
          ? 'border-amber-400/50 bg-slate-950/95 text-amber-200'
          : low
            ? 'border-amber-400/35 bg-slate-950/95 text-amber-100'
            : 'border-cyan-400/30 bg-slate-950/95 text-slate-200'
      }`}
    >
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-cyan-300">
          {exhausted ? 'Free CAD' : 'Free CAD trial'}
        </span>
        {!exhausted && (
          <span className="font-mono text-[9px] font-black uppercase tracking-[0.12em] text-amber-300">
            Trial only — not for business
          </span>
        )}
        <span className="font-medium">
          {used} of {snapshot.limit} inference prompts used
        </span>
        <span className="text-[10px] text-slate-400">
          {deedUsed} of {snapshot.deedLimit} deed prompts used · {remaining} inference left
        </span>
        {exhausted && (
          <>
            <span className="text-[10px] font-semibold text-emerald-300">
              CAD remains free.
            </span>
            <span className="text-[10px] text-amber-200">
              Inference paused — drawing and saving still work
            </span>
          </>
        )}
      </span>
      {!exhausted && (
        <button
          type="button"
          onClick={onUpgrade}
          className="shrink-0 rounded-md border border-cyan-400/50 bg-cyan-400/10 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-200 transition-colors hover:border-cyan-300 hover:bg-cyan-400/20 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300"
        >
          Upgrade
        </button>
      )}
    </div>
  );
};

export default FreeCadTrialBadge;
