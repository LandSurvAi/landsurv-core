import React, { useEffect, useState } from 'react';

interface FreeCadTrialUseNoticeProps {
  /** Inference prompts still available after the run that triggered this notice. */
  remaining: number;
}

/**
 * Strong, non-blocking notice shown for each metered Free CAD inference run.
 * It deliberately stays out of the way (no buttons, no modal) and clears itself
 * after the run has been announced.
 */
const FreeCadTrialUseNotice: React.FC<FreeCadTrialUseNoticeProps> = ({ remaining }) => {
  const [visible, setVisible] = useState(true);
  const questionsLeft = Math.max(0, Math.floor(remaining));

  useEffect(() => {
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 12000);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <aside
      role="alert"
      aria-live="assertive"
      className="pointer-events-none fixed left-1/2 top-[4.5rem] z-[9600] w-[min(620px,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border-2 border-amber-400/75 bg-slate-950/97 px-4 py-3 text-left shadow-[0_18px_50px_rgba(0,0,0,0.6)] backdrop-blur"
    >
      <p className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-amber-300">
        Free CAD — trial use only
      </p>
      <p className="mt-1 text-sm font-bold text-white">
        Not for business, client, or production use.
      </p>
      <p className="mt-1 text-xs leading-relaxed text-slate-300">
        The assistant is for evaluation only. Do not use its output for billable work, permitting,
        or final deliverables. {questionsLeft > 0
          ? `${questionsLeft} trial question${questionsLeft === 1 ? '' : 's'} left on this device.`
          : 'That was the last of your trial questions.'}{' '}
        CAD drawing, editing, and saving remain free.
      </p>
    </aside>
  );
};

export default FreeCadTrialUseNotice;
