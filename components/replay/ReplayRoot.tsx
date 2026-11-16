/**
 * Standalone replay tab.
 *
 * Booted from `?replay=<recordingId>`. It reads the bundle from IndexedDB,
 * installs the zero-network guard, and never mounts the live app, its
 * providers, pollers, AI facades, or service worker.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { installReplayNetworkGuard } from '../../services/recording/networkGuard';
import { getRecordingBundle, saveRecordingBundle } from '../../services/recording/recordingStore';
import {
  downloadBlob,
  exportTrainingLsvz,
  projectLabelFor,
  recountBundle,
  safeTrainingFilename,
} from '../../services/recording/bundle';
import { buildReplayRuntime } from '../../utils/recording/replay';
import { buildTimeMap, effectiveChapterTime, formatReplayTime } from '../../utils/recording/time';
import type {
  AnnotationChapter,
  AnnotationDocument,
  RecordingBundle,
} from '../../utils/recording/types';
import { ReplayCanvas } from './ReplayCanvas';
import { AnnotationLayer, type AnnotationTool } from './AnnotationLayer';

interface ReplayRootProps {
  recordingId: string;
}

const TOOLS: Array<{ id: AnnotationTool; label: string }> = [
  { id: 'select', label: 'Cursor' },
  { id: 'note', label: 'Note' },
  { id: 'pen', label: 'Draw' },
  { id: 'line', label: 'Line' },
  { id: 'arrow', label: 'Arrow' },
  { id: 'rect', label: 'Box' },
  { id: 'mask', label: 'Mask' },
];

const replayUrlFor = (id: string): string => {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('replay', id);
  return url.toString();
};

export const ReplayRoot: React.FC<ReplayRootProps> = ({ recordingId }) => {
  const [bundle, setBundle] = useState<RecordingBundle | null>(null);
  const [annotations, setAnnotations] = useState<AnnotationDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [timeMs, setTimeMs] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [annotate, setAnnotate] = useState(false);
  const [tool, setTool] = useState<AnnotationTool>('select');
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const timeRef = useRef(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const restore = installReplayNetworkGuard();
    let cancelled = false;
    setLoading(true);
    getRecordingBundle(recordingId)
      .then(loaded => {
        if (cancelled) return;
        if (!loaded) {
          setError('This training could not be loaded. Open the .lsvz that contains it and launch the recording from the Training badge.');
          return;
        }
        setBundle(loaded);
        setAnnotations(loaded.annotations);
        setTimeMs(0);
        timeRef.current = 0;
        document.title = `${loaded.manifest.title} · Training replay`;
      })
      .catch(loadError => {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : 'This training could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      restore();
    };
  }, [recordingId]);

  const timeMap = useMemo(
    () => buildTimeMap(bundle?.edits, bundle?.manifest.durationMs ?? 0),
    [bundle],
  );
  const durationMs = timeMap.editedDurationMs;
  const sourceTimeMs = timeMap.effectiveToSource(timeMs);
  const runtime = useMemo(
    () => (bundle ? buildReplayRuntime(bundle, sourceTimeMs) : null),
    [bundle, sourceTimeMs],
  );

  const seek = useCallback((nextMs: number) => {
    const clamped = Math.max(0, Math.min(durationMs, nextMs));
    timeRef.current = clamped;
    setTimeMs(clamped);
  }, [durationMs]);

  useEffect(() => {
    if (!playing || !bundle) return;
    let raf = 0;
    let last = performance.now();
    let lastPaint = 0;
    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      const next = Math.min(durationMs, timeRef.current + delta * speed);
      timeRef.current = next;
      if (now - lastPaint > 32 || next >= durationMs) {
        lastPaint = now;
        setTimeMs(next);
      }
      if (next >= durationMs) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, durationMs, bundle]);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ block: 'end' });
  }, [runtime?.chat]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.code === 'Space') {
        event.preventDefault();
        setPlaying(prev => !prev);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        seek(timeMs - 5000);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        seek(timeMs + 5000);
      } else if (event.key === 'Escape') {
        setAnnotate(false);
        setTool('select');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [seek, timeMs]);

  const addAnnotations = (patch: Partial<AnnotationDocument>) => {
    setAnnotations(prev => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
  };

  const persistAnnotations = async (): Promise<RecordingBundle | null> => {
    if (!bundle || !annotations) return bundle;
    const next: RecordingBundle = {
      ...bundle,
      annotations,
      manifest: { ...bundle.manifest, updatedAt: new Date().toISOString(), status: 'edited' },
    };
    recountBundle(next);
    await saveRecordingBundle(next);
    setBundle(next);
    setDirty(false);
    return next;
  };

  const saveAnnotations = async () => {
    setSaving(true);
    try {
      await persistAnnotations();
      setFlash('Annotations saved.');
      window.setTimeout(() => setFlash(null), 2500);
    } catch (saveError) {
      setFlash(saveError instanceof Error ? saveError.message : 'Could not save annotations.');
    } finally {
      setSaving(false);
    }
  };

  const addChapter = () => {
    const title = window.prompt('Chapter title');
    if (!title?.trim()) return;
    const chapter: AnnotationChapter = {
      id: `chapter-${Date.now().toString(36)}`,
      title: title.trim(),
      atMs: sourceTimeMs,
    };
    addAnnotations({ chapters: [...(annotations?.chapters ?? []), chapter] });
  };

  const removeChapter = (id: string) => {
    addAnnotations({ chapters: (annotations?.chapters ?? []).filter(chapter => chapter.id !== id) });
  };

  const downloadCopy = async () => {
    if (!bundle) return;
    try {
      const latest = await persistAnnotations();
      if (!latest) return;
      const blob = await exportTrainingLsvz(latest);
      downloadBlob(blob, `copy_${safeTrainingFilename(latest.manifest.title)}`);
    } catch (copyError) {
      setFlash(copyError instanceof Error ? copyError.message : 'Could not save the copy.');
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-200">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-400 border-t-transparent" />
          <p className="text-sm font-semibold">Loading recorded training…</p>
        </div>
      </div>
    );
  }

  if (error || !bundle || !runtime || !annotations) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 p-6 text-slate-200">
        <div className="max-w-md rounded-xl border border-rose-500/40 bg-slate-900 p-6 text-center shadow-2xl">
          <h1 className="text-lg font-bold text-rose-300">Training unavailable</h1>
          <p className="mt-3 text-sm text-slate-400">{error ?? 'This recording could not be read.'}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const activeThread = runtime.chat.find(thread => thread.agent === runtime.ui.activeAgent)
    ?? runtime.chat.find(thread => thread.messages.length > 0)
    ?? null;
  const chapters = [...annotations.chapters].sort((a, b) =>
    effectiveChapterTime(bundle.edits, timeMap, a) - effectiveChapterTime(bundle.edits, timeMap, b));
  const currentChapterId = [...chapters].reverse().find(chapter =>
    effectiveChapterTime(bundle.edits, timeMap, chapter) <= timeMs + 1)?.id;

  // Simulated reveal: the chat may already contain the recorded model message
  // (runtime is deterministic), but while playing we hold it back briefly and
  // show a "replaying recorded AI result" pause instead of pretending to infer.
  const revealDelayMs = playing && bundle.manifest.aiReveal === 'simulated' ? 900 : 0;
  const aiRevealAt = new Map<string, number>();
  for (const record of runtime.ai) {
    aiRevealAt.set(record.responseText, timeMap.sourceToEffective(record.t));
  }
  const threadMessages = activeThread?.messages ?? [];
  const visibleMessages = revealDelayMs === 0
    ? threadMessages
    : threadMessages.filter(message => {
      if (message.role !== 'model') return true;
      const at = aiRevealAt.get(message.text);
      return at === undefined || timeMs >= at + revealDelayMs;
    });
  const waitingForAi = revealDelayMs > 0 && threadMessages.some(message => {
    if (message.role !== 'model') return false;
    const at = aiRevealAt.get(message.text);
    return at !== undefined && timeMs >= at && timeMs < at + revealDelayMs;
  });

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-950 text-slate-100">
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-900/95 px-4 py-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-cyan-500/15 text-xs font-black text-cyan-300">
          LSV
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-sm font-semibold">{bundle.manifest.title}</h1>
            <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
              Training
            </span>
          </div>
          <p className="truncate text-[11px] text-slate-500">
            {projectLabelFor(bundle)} · recorded {new Date(bundle.manifest.createdAt).toLocaleDateString()} · read-only replay
          </p>
        </div>
        <div className="hidden items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300 sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Offline · no inference
        </div>
        <button
          type="button"
          onClick={() => {
            window.close();
            // Script-opened replay tabs close; a manually opened tab falls back.
            window.setTimeout(() => { window.location.href = '/'; }, 250);
          }}
          className="rounded-md border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-400 hover:border-slate-500 hover:text-white"
        >
          Exit
        </button>
      </header>

      <main className="flex min-h-0 flex-1">
        <section className="relative min-w-0 flex-1">
          <ReplayCanvas
            geometry={runtime.geometry}
            camera={runtime.camera}
            cursor={runtime.cursor}
            className="absolute inset-0"
          />
          <AnnotationLayer
            annotations={annotations}
            timeMs={timeMs}
            sourceTimeMs={sourceTimeMs}
            timeMap={timeMap}
            editable={annotate}
            tool={tool}
            onAdd={addAnnotations}
          />

          <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-md border border-slate-700/80 bg-slate-900/85 px-2 py-1 text-slate-300">
              Agent: <span className="font-semibold text-cyan-300">{runtime.ui.activeAgent ?? '—'}</span>
            </span>
            <span className="rounded-md border border-slate-700/80 bg-slate-900/85 px-2 py-1 text-slate-300">
              Panel: <span className="font-semibold text-cyan-300">{runtime.ui.activeVisualPanel ?? 'canvas'}</span>
            </span>
            {runtime.ui.tool && (
              <span className="rounded-md border border-slate-700/80 bg-slate-900/85 px-2 py-1 text-slate-300">
                Tool: <span className="font-semibold text-cyan-300">{runtime.ui.tool}</span>
              </span>
            )}
            {annotate && (
              <span className="rounded-md border border-amber-400/50 bg-amber-400/15 px-2 py-1 font-semibold text-amber-200">
                Annotating
              </span>
            )}
          </div>

          {annotate && (
            <div className="absolute right-3 top-3 z-30 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1 rounded-lg border border-slate-700 bg-slate-900/95 p-1.5 shadow-xl">
              {TOOLS.map(option => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setTool(option.id)}
                  className={`rounded px-2 py-1 text-[11px] font-semibold ${
                    tool === option.id
                      ? 'bg-amber-400 text-slate-950'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {option.label}
                </button>
              ))}
              <span className="mx-1 h-4 w-px bg-slate-700" />
              <button
                type="button"
                onClick={addChapter}
                className="rounded px-2 py-1 text-[11px] font-semibold text-cyan-300 hover:bg-slate-800"
              >
                + Chapter
              </button>
              <button
                type="button"
                onClick={() => void saveAnnotations()}
                disabled={saving || !dirty}
                className="rounded bg-amber-400 px-2 py-1 text-[11px] font-bold text-slate-950 disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Save notes'}
              </button>
            </div>
          )}

          {chaptersOpen && (
            <div className="absolute bottom-3 right-3 z-30 max-h-[55%] w-72 overflow-auto rounded-lg border border-slate-700 bg-slate-900/98 p-3 shadow-2xl">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">Chapters</h2>
                <button type="button" onClick={() => setChaptersOpen(false)} className="text-slate-500 hover:text-white">×</button>
              </div>
              {chapters.length === 0 && <p className="text-xs text-slate-500">No chapters yet.</p>}
              <div className="space-y-1">
                {chapters.map(chapter => {
                  const at = effectiveChapterTime(bundle.edits, timeMap, chapter);
                  return (
                    <div key={chapter.id} className={`group flex items-center gap-2 rounded px-2 py-1.5 ${chapter.id === currentChapterId ? 'bg-cyan-500/15' : 'hover:bg-slate-800'}`}>
                      <button
                        type="button"
                        onClick={() => seek(at)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="truncate text-xs font-medium text-slate-200">{chapter.title}</div>
                        <div className="text-[10px] text-slate-500">{formatReplayTime(at)}</div>
                      </button>
                      {annotate && (
                        <button
                          type="button"
                          onClick={() => removeChapter(chapter.id)}
                          className="text-xs text-slate-600 opacity-0 hover:text-rose-400 group-hover:opacity-100"
                          aria-label={`Delete chapter ${chapter.title}`}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <aside className="hidden w-80 shrink-0 flex-col border-l border-slate-800 bg-slate-900/60 md:flex">
          <div className="border-b border-slate-800 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Recorded conversation
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
            {visibleMessages.length === 0 && !waitingForAi ? (
              <p className="text-xs text-slate-500">No chat captured for this part of the session.</p>
            ) : (
              visibleMessages.map((message, index) => {
                const isUser = message.role === 'user';
                return (
                  <div
                    key={`${index}-${message.role}`}
                    className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
                      isUser
                        ? 'ml-6 border border-cyan-500/20 bg-cyan-500/10 text-cyan-50'
                        : 'mr-2 border border-slate-700/70 bg-slate-800/70 text-slate-200'
                    }`}
                  >
                    {!isUser && (
                      <div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-amber-400/90">
                        Recorded result · no inference
                      </div>
                    )}
                    <div className="whitespace-pre-wrap">{message.text}</div>
                  </div>
                );
              })
            )}
            {waitingForAi && (
              <div className="mr-6 flex items-center gap-2 rounded-lg border border-slate-700/70 bg-slate-800/70 px-3 py-2 text-xs text-slate-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                Replaying recorded AI result…
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </aside>
      </main>

      <footer className="shrink-0 border-t border-slate-800 bg-slate-900 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPlaying(prev => !prev)}
            className="flex h-8 w-8 items-center justify-center rounded-md bg-cyan-500 text-sm font-bold text-slate-950 hover:bg-cyan-400"
            aria-label={playing ? 'Pause replay' : 'Play replay'}
          >
            {playing ? 'II' : '▶'}
          </button>
          <span className="w-12 text-right font-mono text-xs text-slate-400">{formatReplayTime(timeMs)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(1, durationMs)}
            step={50}
            value={Math.min(timeMs, durationMs)}
            onChange={event => { setPlaying(false); seek(Number(event.target.value)); }}
            className="min-w-[140px] flex-1 accent-cyan-400"
            aria-label="Replay position"
          />
          <span className="w-12 font-mono text-xs text-slate-500">{formatReplayTime(durationMs)}</span>
          <select
            value={speed}
            onChange={event => setSpeed(Number(event.target.value))}
            className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200"
            aria-label="Playback speed"
          >
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={1.5}>1.5×</option>
            <option value={2}>2×</option>
          </select>
          <button
            type="button"
            onClick={() => setChaptersOpen(prev => !prev)}
            className="rounded border border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-300 hover:border-cyan-500/50 hover:text-cyan-200"
          >
            Chapters
          </button>
          <button
            type="button"
            onClick={() => {
              if (!annotate) setPlaying(false);
              setAnnotate(prev => !prev);
              setTool('select');
            }}
            className={`rounded border px-2.5 py-1 text-xs font-semibold ${
              annotate
                ? 'border-amber-400 bg-amber-400 text-slate-950'
                : 'border-slate-700 text-slate-300 hover:border-amber-400/50 hover:text-amber-200'
            }`}
          >
            {annotate ? 'Done annotating' : 'Annotate'}
          </button>
          <button
            type="button"
            onClick={() => void downloadCopy()}
            className="rounded border border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-300 hover:border-cyan-500/50 hover:text-cyan-200"
          >
            Save as copy
          </button>
        </div>
        {dirty && <p className="mt-1 text-[10px] text-amber-400">Unsaved annotation changes.</p>}
        {flash && <p className="mt-1 text-[10px] text-cyan-300">{flash}</p>}
      </footer>
    </div>
  );
};
