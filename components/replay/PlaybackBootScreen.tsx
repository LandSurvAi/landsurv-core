import { useReplaySession } from '../../contexts/ReplaySessionContext.tsx';

/** Covers default provider state until the first recorded frame or handoff lands. */
export const PlaybackBootScreen: React.FC = () => {
  const { mode, ready, phase, error, exit } = useReplaySession();
  if (mode === 'live') return null;
  if (ready && phase !== 'error') return null;

  const takeover = mode === 'takeover';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950 p-6 text-slate-100">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900/90 p-6 text-center shadow-2xl">
        {phase === 'error' ? (
          <>
            <h1 className="text-lg font-bold text-rose-300">
              {takeover ? 'Editable copy unavailable' : 'Playback unavailable'}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">{error ?? 'This recording could not be played.'}</p>
            <div className="mt-5 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-400"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={exit}
                className="rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:border-slate-500"
              >
                Exit
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-cyan-400 border-t-transparent" />
            <h1 className="mt-4 text-sm font-bold">
              {takeover ? 'Preparing editable copy…' : 'Preparing app playback…'}
            </h1>
            <p className="mt-2 text-xs text-slate-500">
              {takeover
                ? 'Applying the recorded state to a new unsaved project.'
                : 'Loading the recorded keyframes and applying the first frame.'}
            </p>
          </>
        )}
      </div>
    </div>
  );
};
