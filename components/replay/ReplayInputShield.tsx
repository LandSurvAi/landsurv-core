import { useState } from 'react';
import { useReplaySession } from '../../contexts/ReplaySessionContext.tsx';

/**
 * Playback is not a video: the real app is mounted. Until the view-only
 * allowlist lands, a transparent shield prevents project mutations. The
 * transport is rendered above it.
 */
export const ReplayInputShield: React.FC = () => {
  const { mode, ready, pause, exploring } = useReplaySession();
  const [hint, setHint] = useState(false);

  if (mode !== 'playback' || !ready || exploring) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Playback is read-only. Use the transport to pause or seek."
        onClick={() => {
          pause();
          setHint(true);
          window.setTimeout(() => setHint(false), 2200);
        }}
        className="fixed inset-0 z-[60] cursor-default bg-transparent"
      />
      {hint && (
        <div className="pointer-events-none fixed left-1/2 top-20 z-[98] -translate-x-1/2 rounded-md border border-slate-700 bg-slate-950/95 px-3 py-2 text-[11px] text-slate-300 shadow-xl">
          Playback is read-only. Use the transport to pause, seek or exit.
        </div>
      )}
    </>
  );
};
