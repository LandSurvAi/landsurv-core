/**
 * In-app recorder chrome: the Record pill, live HUD, private library, and the
 * post-recording studio. Everything here is local-first; the only share path is
 * an exported .lsvz.
 */

import { useEffect, useRef, useState } from 'react';
import { useRecording } from '../../contexts/RecordingContext.tsx';
import { deleteRecording, listRecordingSummaries } from '../../services/recording/recordingStore';
import { attachRecordingToProject } from '../../services/recording/attachedTraining';
import {
  getRecorderSession,
  isRecorderArmed,
  registerRecorderSession,
  unlockWithLaunchToken,
  unlockWithRecorderKey,
  type RecorderSessionInfo,
} from '../../services/recording/recorderAccess';
import {
  downloadBlob,
  exportTrainingLsvz,
  safeTrainingFilename,
} from '../../services/recording/bundle';
import { formatReplayTime } from '../../utils/recording/time';
import type {
  AnnotationChapter,
  RecordingBundle,
  RecordingSummary,
} from '../../utils/recording/types';

type Panel = 'none' | 'library' | 'start' | 'studio' | 'access';
type AccessState = 'checking' | 'locked' | 'unlocked' | 'unavailable';

const replayUrlFor = (id: string): string => {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('replay', id);
  return url.toString();
};

const formatDuration = (ms: number): string => formatReplayTime(ms);

export const RecorderHud: React.FC = () => {
  const {
    phase,
    elapsedMs,
    seedReady,
    completed,
    storageError,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    clearCompleted,
    updateBundle,
    getBundle,
  } = useRecording();

  const [panel, setPanel] = useState<Panel>('none');
  const [library, setLibrary] = useState<RecordingSummary[]>([]);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [aiReveal, setAiReveal] = useState<'instant' | 'simulated'>('simulated');
  const [chapters, setChapters] = useState<AnnotationChapter[]>([]);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [studioId, setStudioId] = useState<string | null>(null);
  const [access, setAccess] = useState<AccessState>('checking');
  const [recorderSession, setRecorderSession] = useState<RecorderSessionInfo | null>(null);
  const [accessKey, setAccessKey] = useState('');
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessBusy, setAccessBusy] = useState(false);
  const accessInitRef = useRef(false);

  const refreshLibrary = async () => {
    setLoadingLibrary(true);
    setLibraryError(null);
    try {
      setLibrary(await listRecordingSummaries());
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : 'Could not read the training library.');
    } finally {
      setLoadingLibrary(false);
    }
  };

  useEffect(() => {
    if (panel === 'library') void refreshLibrary();
  }, [panel]);

  // One-time access boot: exchange a DevOps launch token when present, then
  // fall back to the existing recorder session/cookie. A local development
  // unlock is available only when explicitly enabled at build time.
  useEffect(() => {
    if (accessInitRef.current) return;
    accessInitRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const launchToken = params.get('recorderLaunch');
    const privateEntry = params.get('recorder') === '1';
    if (launchToken || privateEntry) {
      params.delete('recorderLaunch');
      params.delete('recorder');
      const query = params.toString();
      window.history.replaceState(
        {},
        document.title,
        `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
      );
    }
    if (launchToken) {
      unlockWithLaunchToken(launchToken)
        .then(session => {
          setRecorderSession(session);
          setAccess('unlocked');
        })
        .catch(error => {
          setAccess('locked');
          setAccessError(error instanceof Error ? error.message : 'This launch link is invalid or expired.');
          setPanel('access');
        });
      return;
    }

    const devUnlocked = Boolean((import.meta as any).env?.DEV)
      && String((import.meta as any).env?.VITE_RECORDER_DEV_UNLOCK || '') === 'true';
    if (devUnlocked) {
      setAccess('unlocked');
      if (privateEntry) setPanel('library');
      return;
    }

    // Silent by default. Only an explicitly armed device or the private owner
    // entry may even ask the backend whether a recorder session exists.
    if (!privateEntry && !isRecorderArmed()) {
      setAccess('locked');
      return;
    }

    getRecorderSession()
      .then(result => {
        if (result.status === 'ok') {
          setRecorderSession(result.session);
          setAccess('unlocked');
          if (privateEntry) setPanel('library');
        } else if (result.status === 'locked') {
          setAccess('locked');
          if (privateEntry) setPanel('access');
        } else {
          setAccess('unavailable');
          setAccessError(result.message);
          if (privateEntry) setPanel('access');
        }
      })
      .catch(() => {
        setAccess('unavailable');
        if (privateEntry) setPanel('access');
      });
  }, []);

  useEffect(() => {
    if (phase === 'stopped' && completed && studioId !== completed.manifest.id) {
      setStudioId(completed.manifest.id);
      setTitle(completed.manifest.title);
      setDescription(completed.manifest.description ?? '');
      setAiReveal(completed.manifest.aiReveal);
      setChapters(completed.annotations.chapters);
      setPanel('studio');
    }
    if (phase === 'idle') {
      setStudioId(null);
    }
  }, [phase, completed, studioId]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 4000);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const saveStudio = async (): Promise<RecordingBundle | null> => {
    if (!completed) return getBundle();
    await updateBundle(bundle => {
      bundle.manifest.title = title.trim() || 'Untitled training';
      bundle.manifest.description = description.trim() || undefined;
      bundle.manifest.aiReveal = aiReveal;
      bundle.manifest.status = 'edited';
      bundle.annotations.chapters = chapters;
    });
    return getBundle();
  };

  const handleStart = () => {
    if (access !== 'unlocked') {
      setPanel('access');
      return;
    }
    if (!seedReady) {
      setFlash('The project is still loading. Try again in a moment.');
      return;
    }
    startRecording(title.trim() || undefined, aiReveal);
    setPanel('none');
  };

  const handleUnlock = async () => {
    if (!accessKey.trim()) return;
    setAccessBusy(true);
    setAccessError(null);
    try {
      const session = await unlockWithRecorderKey(accessKey);
      setRecorderSession(session);
      setAccess('unlocked');
      setAccessKey('');
      setPanel('library');
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : 'Recorder unlock failed.');
    } finally {
      setAccessBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      await stopRecording();
      const latest = getBundle();
      if (latest) {
        void registerRecorderSession({
          title: latest.manifest.title,
          durationMs: latest.manifest.durationMs,
          eventCount: latest.events.length,
          appVersion: latest.manifest.appVersion,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleOpenReplay = async (id: string) => {
    const tab = window.open(replayUrlFor(id), '_blank');
    if (!tab) setFlash('The browser blocked the replay tab. Allow pop-ups for this site.');
  };

  const handleOpenStudioReplay = async () => {
    const tab = window.open('about:blank', '_blank');
    if (!tab) {
      setFlash('The browser blocked the replay tab. Allow pop-ups for this site.');
      return;
    }
    try {
      if (tab.opener) tab.opener = null;
      const latest = await saveStudio();
      if (!latest) {
        tab.close();
        return;
      }
      tab.location.href = replayUrlFor(latest.manifest.id);
    } catch (error) {
      tab.close();
      setFlash(error instanceof Error ? error.message : 'Could not open the replay.');
    }
  };

  const handleAttach = async () => {
    const latest = await saveStudio();
    if (!latest) return;
    attachRecordingToProject(latest);
    setFlash('Recording attached. Save the project to embed it in the .lsvz.');
  };

  const handleDownload = async () => {
    setBusy(true);
    try {
      const latest = await saveStudio();
      if (!latest) return;
      const blob = await exportTrainingLsvz(latest);
      downloadBlob(blob, safeTrainingFilename(latest.manifest.title));
      setFlash('Training .lsvz downloaded with the recording embedded.');
    } catch (error) {
      setFlash(error instanceof Error ? error.message : 'Could not export the training.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this recording from this device? This cannot be undone.')) return;
    await deleteRecording(id);
    if (completed?.manifest.id === id) clearCompleted();
    setStudioId(null);
    setPanel('none');
    await refreshLibrary();
  };

  const handleFinishStudio = () => {
    setPanel('none');
    clearCompleted();
  };

  const recording = phase === 'recording' || phase === 'paused';
  const reveal = getBundle()?.manifest.aiReveal ?? aiReveal;

  return (
    <>
      {phase === 'idle' && panel === 'none' && access === 'unlocked' && (
        <button
          type="button"
          onClick={() => setPanel('library')}
          className="fixed bottom-6 right-6 z-[70] flex items-center gap-2 rounded-full border border-rose-500/40 bg-slate-900/95 px-4 py-2 text-xs font-bold text-slate-100 shadow-xl transition hover:border-rose-400 hover:bg-slate-800"
          title="Open the training library or start recording"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
          Record
        </button>
      )}

      {panel === 'access' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-800 px-5 py-3">
              <div>
                <h2 className="text-sm font-bold">Recorder access</h2>
                <p className="text-[11px] text-slate-500">DevOps-issued · private to this operator</p>
              </div>
              <button type="button" onClick={() => setPanel('none')} className="text-slate-500 hover:text-white">×</button>
            </div>
            <div className="space-y-3 p-5">
              {access === 'unavailable' && (
                <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">
                  {accessError || 'Recorder service is unreachable. Recording stays locked until the backend is available.'}
                </p>
              )}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-400" htmlFor="recorder-key">Portable recorder key</label>
                <input
                  id="recorder-key"
                  value={accessKey}
                  onChange={event => setAccessKey(event.target.value.toUpperCase())}
                  onKeyDown={event => { if (event.key === 'Enter') void handleUnlock(); }}
                  placeholder="LSR-XXXX-XXXX-XXXX-XXXX"
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-amber-400"
                  autoFocus
                />
              </div>
              {accessError && access !== 'unavailable' && (
                <p className="text-[11px] text-rose-300">{accessError}</p>
              )}
              <button
                type="button"
                onClick={() => void handleUnlock()}
                disabled={accessBusy || !accessKey.trim()}
                className="w-full rounded-md bg-amber-400 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-50"
              >
                {accessBusy ? 'Unlocking…' : 'Unlock recorder mode'}
              </button>
              <p className="text-[10px] leading-relaxed text-slate-500">
                Issue or revoke keys in DevOps → Recordings. A launch link from that panel unlocks this device automatically. Playback never requires this key.
              </p>
            </div>
          </div>
        </div>
      )}

      {recording && (
        <div className="fixed left-1/2 top-20 z-[80] flex -translate-x-1/2 items-center gap-3 rounded-full border border-rose-500/50 bg-slate-950/95 px-4 py-2 text-xs text-slate-100 shadow-2xl">
          <span className="flex items-center gap-1.5 font-bold text-rose-300">
            <span className={`h-2.5 w-2.5 rounded-full bg-rose-500 ${phase === 'recording' ? 'animate-pulse' : ''}`} />
            {phase === 'paused' ? 'PAUSED' : 'REC'}
          </span>
          <span className="font-mono tabular-nums">{formatDuration(elapsedMs)}</span>
          <span className="hidden text-[10px] text-slate-500 sm:inline">
            AI {reveal === 'instant' ? 'instant' : 'simulated'} reveal
          </span>
          <button
            type="button"
            onClick={phase === 'paused' ? resumeRecording : pauseRecording}
            className="rounded-full border border-slate-700 px-3 py-1 font-semibold text-slate-200 hover:border-slate-500"
          >
            {phase === 'paused' ? 'Resume' : 'Pause'}
          </button>
          <button
            type="button"
            onClick={() => void handleStop()}
            disabled={busy}
            className="rounded-full bg-rose-600 px-3 py-1 font-bold text-white hover:bg-rose-500 disabled:opacity-50"
          >
            {busy ? 'Stopping…' : 'Stop'}
          </button>
        </div>
      )}

      {(panel === 'library' || panel === 'start') && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
              <div>
                <h2 className="text-sm font-bold">Training library</h2>
                <p className="text-[11px] text-slate-500">This device only · export a .lsvz to share</p>
              </div>
              <button type="button" onClick={() => setPanel('none')} className="text-slate-500 hover:text-white">×</button>
            </div>

            {panel === 'start' ? (
              <div className="space-y-4 p-5">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-400" htmlFor="recording-title">Title</label>
                  <input
                    id="recording-title"
                    value={title}
                    onChange={event => setTitle(event.target.value)}
                    placeholder="Boundary workflow"
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
                    autoFocus
                  />
                </div>
                <fieldset>
                  <legend className="mb-1 text-xs font-semibold text-slate-400">Recorded AI results appear</legend>
                  <label className="flex items-start gap-2 rounded-md border border-slate-800 p-2 text-xs">
                    <input type="radio" checked={aiReveal === 'simulated'} onChange={() => setAiReveal('simulated')} className="mt-0.5 accent-cyan-500" />
                    <span><strong className="text-slate-200">With a simulated pause</strong><br /><span className="text-slate-500">Replays a short working delay, then slides in the recorded result.</span></span>
                  </label>
                  <label className="mt-2 flex items-start gap-2 rounded-md border border-slate-800 p-2 text-xs">
                    <input type="radio" checked={aiReveal === 'instant'} onChange={() => setAiReveal('instant')} className="mt-0.5 accent-cyan-500" />
                    <span><strong className="text-slate-200">Instantly</strong><br /><span className="text-slate-500">Shows the recorded result as soon as its moment arrives.</span></span>
                  </label>
                </fieldset>
                <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">
                  Recording captures project geometry, chat text, and cursor/UI state on this device. Nothing uploads automatically. API keys, passwords, and tokens are never captured.
                </p>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setPanel('library')} className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300">Back</button>
                  <button type="button" onClick={handleStart} className="rounded-md bg-rose-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-rose-500">Start recording</button>
                </div>
              </div>
            ) : (
              <>
                <div className="max-h-80 overflow-auto p-3">
                  {loadingLibrary && <p className="p-3 text-xs text-slate-500">Loading recordings…</p>}
                  {libraryError && <p className="p-3 text-xs text-rose-300">{libraryError}</p>}
                  {!loadingLibrary && !libraryError && library.length === 0 && (
                    <div className="p-6 text-center">
                      <p className="text-sm font-semibold text-slate-300">No recordings on this device yet.</p>
                      <p className="mt-1 text-xs text-slate-500">Record a session, annotate it, then embed it in a .lsvz.</p>
                    </div>
                  )}
                  <div className="space-y-2">
                    {library.map(item => (
                      <div key={item.id} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold text-slate-200">{item.title}</div>
                          <div className="text-[10px] text-slate-500">
                            {new Date(item.createdAt).toLocaleString()} · {formatDuration(item.durationMs)} · {item.eventCount} events · {item.status}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleOpenReplay(item.id)}
                          className="rounded border border-cyan-500/40 px-2.5 py-1 text-[11px] font-bold text-cyan-300 hover:bg-cyan-500/10"
                        >
                          Play
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(item.id)}
                          className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-400 hover:border-rose-500/50 hover:text-rose-300"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-slate-800 px-4 py-3">
                  <span className="text-[10px] text-slate-500">
                    {recorderSession ? `Unlocked · ${recorderSession.label}` : 'Recorder access is issued through DevOps.'}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setTitle(''); setPanel('start'); }}
                    className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-500"
                  >
                    New recording
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {panel === 'studio' && completed && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
              <div>
                <h2 className="text-sm font-bold">Recording studio</h2>
                <p className="text-[11px] text-slate-500">
                  {formatDuration(completed.manifest.durationMs)} · {completed.manifest.counts.events} events · AI reveal {completed.manifest.aiReveal}
                </p>
              </div>
              <button type="button" onClick={handleFinishStudio} className="text-slate-500 hover:text-white">×</button>
            </div>

            <div className="max-h-[65vh] space-y-4 overflow-auto p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-400" htmlFor="studio-title">Title</label>
                  <input
                    id="studio-title"
                    value={title}
                    onChange={event => setTitle(event.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-400" htmlFor="studio-reveal">AI result reveal</label>
                  <select
                    id="studio-reveal"
                    value={aiReveal}
                    onChange={event => setAiReveal(event.target.value as 'instant' | 'simulated')}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500"
                  >
                    <option value="simulated">Simulated pause</option>
                    <option value="instant">Instant</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-400" htmlFor="studio-description">Description</label>
                <textarea
                  id="studio-description"
                  value={description}
                  onChange={event => setDescription(event.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500"
                  placeholder="What should the viewer learn?"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Chapters</h3>
                  <button
                    type="button"
                    onClick={() => setChapters(prev => [...prev, {
                      id: `chapter-${Date.now().toString(36)}`,
                      title: 'New step',
                      atMs: 0,
                    }])}
                    className="text-[11px] font-semibold text-cyan-300 hover:text-cyan-200"
                  >
                    + Add
                  </button>
                </div>
                {chapters.length === 0 && <p className="text-xs text-slate-500">No chapters. Annotate in the replay to add steps at the exact moment.</p>}
                <div className="space-y-1">
                  {chapters.map((chapter, index) => (
                    <div key={chapter.id} className="flex items-center gap-2 rounded border border-slate-800 bg-slate-950/40 px-2 py-1.5">
                      <span className="w-12 font-mono text-[10px] text-slate-500">{formatDuration(chapter.atMs)}</span>
                      <input
                        value={chapter.title}
                        onChange={event => setChapters(prev => prev.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, title: event.target.value, suggested: false } : row))}
                        className="min-w-0 flex-1 bg-transparent text-xs text-slate-200 outline-none"
                      />
                      {chapter.suggested && <span className="text-[9px] uppercase text-amber-400">draft</span>}
                      <button
                        type="button"
                        onClick={() => setChapters(prev => prev.filter(row => row.id !== chapter.id))}
                        className="text-slate-500 hover:text-rose-400"
                        aria-label={`Remove chapter ${chapter.title}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">
                This recording contains real coordinates, names, and chat text. No sanitization is applied. Share the exported .lsvz only with trusted recipients.
              </p>
              {storageError && <p className="text-xs text-rose-300">{storageError}</p>}
              {flash && <p className="text-xs text-cyan-300">{flash}</p>}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-4 py-3">
              <button
                type="button"
                onClick={() => void handleDelete(completed.manifest.id)}
                className="text-[11px] font-semibold text-rose-400 hover:text-rose-300"
              >
                Delete recording
              </button>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={handleFinishStudio} className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300">Done</button>
                <button type="button" onClick={() => void saveStudio().then(() => setFlash('Changes saved.'))} className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200">Save changes</button>
                <button type="button" onClick={() => void handleAttach()} disabled={busy} className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 disabled:opacity-50">Attach to project</button>
                <button type="button" onClick={() => void handleDownload()} disabled={busy} className="rounded-md border border-cyan-500/40 px-3 py-1.5 text-xs font-bold text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-50">Download .lsvz</button>
                <button type="button" onClick={() => void handleOpenStudioReplay()} className="rounded-md bg-amber-400 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-300">Annotate in replay</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {storageError && panel !== 'studio' && access === 'unlocked' && (
        <div className="fixed bottom-20 right-6 z-[90] max-w-xs rounded-md border border-rose-500/40 bg-slate-900 px-3 py-2 text-[11px] text-rose-200 shadow-xl">
          {storageError}
        </div>
      )}
    </>
  );
};
