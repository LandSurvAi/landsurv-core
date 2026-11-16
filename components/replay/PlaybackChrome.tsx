import { useState } from 'react';
import { useReplaySession } from '../../contexts/ReplaySessionContext.tsx';
import { formatReplayTime } from '../../utils/recording/time';

/** Floating transport. Deliberately does not take over the app shell. */
export const PlaybackChrome: React.FC = () => {
  const {
    mode,
    phase,
    ready,
    timeMs,
    durationMs,
    speed,
    bundle,
    play,
    pause,
    seek,
    setSpeed,
    exit,
    takeover,
    takeoverAvailable,
    drift,
    exploring,
    setExploring,
  } = useReplaySession();
  const [chaptersOpen, setChaptersOpen] = useState(false);

  if (mode !== 'playback' || !ready) return null;

  const playing = phase === 'playing';
  const chapters = bundle?.annotations.chapters ?? [];

  return (
    <>
      {drift && (
        <div className="fixed left-1/2 top-16 z-[95] max-w-lg -translate-x-1/2 rounded-md border border-amber-400/40 bg-slate-900/95 px-3 py-2 text-[11px] text-amber-200 shadow-xl">
          {drift.recordedAppVersion
            ? `Recorded on ${drift.recordedAppVersion}${drift.currentAppVersion ? ` and playing on ${drift.currentAppVersion}` : ''}. `
            : 'Recorded on a different build. '}
          {drift.missingChannels.length > 0
            ? `${drift.missingChannels.length} surfaces are unavailable in this build.`
            : 'Some controls may differ.'}
        </div>
      )}

      {exploring && (
        <div className="fixed left-1/2 top-16 z-[95] max-w-lg -translate-x-1/2 rounded-md border border-cyan-500/40 bg-slate-950/95 px-3 py-2 text-center text-[11px] text-cyan-100 shadow-xl">
          Exploring a live copy. Play, seek or choose Return to restore the recording.
        </div>
      )}

      {chaptersOpen && (
        <div className="fixed bottom-24 left-1/2 z-[96] max-h-72 w-80 -translate-x-1/2 overflow-auto rounded-lg border border-slate-700 bg-slate-900/98 p-2 shadow-2xl">
          <div className="mb-1 flex items-center justify-between px-2 py-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Chapters</span>
            <button type="button" onClick={() => setChaptersOpen(false)} className="text-slate-500 hover:text-white">×</button>
          </div>
          {chapters.length === 0 && <p className="px-2 py-3 text-xs text-slate-500">No chapters recorded.</p>}
          {chapters.map(chapter => (
            <button
              key={chapter.id}
              type="button"
              onClick={() => { seek(chapter.atMs); setChaptersOpen(false); }}
              className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs text-slate-300 hover:bg-slate-800"
            >
              <span className="truncate">{chapter.title}</span>
              <span className="ml-3 font-mono text-[10px] text-slate-500">{formatReplayTime(chapter.atMs)}</span>
            </button>
          ))}
        </div>
      )}

      <div
        role="toolbar"
        aria-label="Recording playback controls"
        className="fixed bottom-5 left-1/2 z-[97] flex w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-950/95 px-3 py-2 text-slate-100 shadow-2xl backdrop-blur"
      >
        <button
          type="button"
          onClick={playing ? pause : play}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-cyan-500 text-xs font-black text-slate-950 hover:bg-cyan-400"
          aria-label={playing ? 'Pause playback' : 'Play playback'}
        >
          {playing ? 'II' : '▶'}
        </button>

        <button
          type="button"
          onClick={() => seek(timeMs - 10_000)}
          className="hidden h-7 w-8 shrink-0 rounded text-[10px] font-bold text-slate-400 hover:bg-slate-800 hover:text-white sm:block"
          aria-label="Back 10 seconds"
        >
          −10
        </button>
        <button
          type="button"
          onClick={() => seek(timeMs + 10_000)}
          className="hidden h-7 w-8 shrink-0 rounded text-[10px] font-bold text-slate-400 hover:bg-slate-800 hover:text-white sm:block"
          aria-label="Forward 10 seconds"
        >
          +10
        </button>

        <span className="w-10 shrink-0 text-right font-mono text-[11px] text-slate-400">{formatReplayTime(timeMs)}</span>
        <input
          type="range"
          min={0}
          max={Math.max(1, durationMs)}
          step={50}
          value={Math.min(timeMs, durationMs)}
          onChange={event => seek(Number(event.target.value))}
          className="min-w-[80px] flex-1 accent-cyan-400"
          aria-label="Playback position"
        />
        <span className="w-10 shrink-0 font-mono text-[11px] text-slate-500">{formatReplayTime(durationMs)}</span>

        <select
          value={speed}
          onChange={event => setSpeed(Number(event.target.value))}
          className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[11px] text-slate-200"
          aria-label="Playback speed"
        >
          {[0.25, 0.5, 1, 1.5, 2, 4].map(rate => (
            <option key={rate} value={rate}>{rate}×</option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setChaptersOpen(open => !open)}
          className="hidden rounded border border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:border-cyan-500/50 hover:text-cyan-200 md:block"
        >
          Chapters
        </button>

        <button
          type="button"
          onClick={() => setExploring(!exploring)}
          className={`hidden rounded border px-2 py-1 text-[11px] font-semibold sm:block ${
            exploring
              ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-100'
              : 'border-slate-700 text-slate-300 hover:border-cyan-500/50 hover:text-cyan-200'
          }`}
        >
          {exploring ? 'Return' : 'Explore'}
        </button>

        <button
          type="button"
          onClick={takeover}
          disabled={!takeoverAvailable}
          title={takeoverAvailable
            ? exploring
              ? 'Open an editable copy with these changes in a new tab'
              : 'Open an editable copy in a new tab'
            : 'Preparing editable copy…'}
          className={`hidden rounded border px-2 py-1 text-[11px] font-semibold md:block ${
            takeoverAvailable
              ? 'border-cyan-500/50 text-cyan-200 hover:bg-cyan-500/10'
              : 'cursor-not-allowed border-slate-700 text-slate-500'
          }`}
        >
          Take over
        </button>

        <button
          type="button"
          onClick={exit}
          className="rounded border border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-400 hover:border-slate-500 hover:text-white"
        >
          Exit
        </button>
      </div>
    </>
  );
};
