/**
 * Training badge shown after opening a .lsvz that carries embedded recordings.
 *
 * The project opens normally; nothing autoplays. Playback needs no DevOps
 * session, studio access, or recorder key, and opens in the read-only replay
 * tab so the working project is never swapped.
 */

import { useState } from 'react';
import type { EmbeddedTrainingIndex } from '../../types';
import { importEmbeddedTraining } from '../../services/recording/embeddedTraining';
import { formatReplayTime } from '../../utils/recording/time';

interface TrainingBadgeProps {
  index: EmbeddedTrainingIndex | null;
  source: ArrayBuffer | null;
  projectKey: string;
}

const replayUrlFor = (id: string): string => {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('replay', id);
  return url.toString();
};

export const TrainingBadge: React.FC<TrainingBadgeProps> = ({ index, source, projectKey }) => {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!index || index.recordings.length === 0) return null;

  const play = async (recordingId: string) => {
    if (!source) {
      setError('The training payload is not available. Reopen the .lsvz to restore it.');
      return;
    }
    setBusyId(recordingId);
    setError(null);
    const tab = window.open('about:blank', '_blank');
    if (!tab) {
      setError('The browser blocked the replay tab. Allow pop-ups for this site.');
      setBusyId(null);
      return;
    }
    try {
      if (tab.opener) tab.opener = null;
      const localId = await importEmbeddedTraining(source, recordingId, projectKey);
      tab.location.href = replayUrlFor(localId);
      setOpen(false);
    } catch (playError) {
      tab.close();
      setError(playError instanceof Error ? playError.message : 'This training could not be loaded.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-28 z-[70] flex items-center gap-2 rounded-full border border-amber-400/50 bg-slate-900/95 px-3.5 py-2 text-xs font-bold text-amber-200 shadow-xl hover:border-amber-300 hover:bg-slate-800"
        title="Embedded training recordings"
      >
        <span className="text-sm">▶</span>
        Training
        <span className="rounded-full bg-amber-400/20 px-1.5 text-[10px] text-amber-100">{index.recordings.length}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-800 px-5 py-3">
              <div>
                <h2 className="text-sm font-bold">Training in this project</h2>
                <p className="text-[11px] text-slate-500">Watch any recording. No key or DevOps access needed.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-500 hover:text-white">×</button>
            </div>
            <div className="max-h-80 space-y-2 overflow-auto p-4">
              {index.recordings.map(recording => (
                <div key={recording.id} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-slate-200">{recording.title}</div>
                    <div className="text-[10px] text-slate-500">
                      {formatReplayTime(recording.editedDurationMs || recording.durationMs)} · {recording.status}
                      {recording.sourceProjectLabel ? ` · ${recording.sourceProjectLabel}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void play(recording.id)}
                    disabled={busyId !== null}
                    className="rounded-md bg-cyan-500 px-3 py-1.5 text-[11px] font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
                  >
                    {busyId === recording.id ? 'Opening…' : 'Play'}
                  </button>
                </div>
              ))}
            </div>
            {error && <p className="border-t border-rose-500/20 bg-rose-500/10 px-4 py-2 text-[11px] text-rose-200">{error}</p>}
            <p className="border-t border-slate-800 px-4 py-2 text-[10px] text-slate-500">
              The project stays open in this tab. Playback runs in a separate read-only tab.
            </p>
          </div>
        </div>
      )}
    </>
  );
};
