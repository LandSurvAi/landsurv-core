import { useEffect, useState } from 'react';
import { useReplaySession } from '../../contexts/ReplaySessionContext.tsx';
import { saveRecordingAnnotationsV2 } from '../../services/recording/recordingStore';
import type { AnnotationDocument } from '../../utils/recording/types';
import { AnnotationLayer, type AnnotationTool } from './AnnotationLayer';

const TOOLS: Array<{ id: AnnotationTool; label: string; title: string }> = [
  { id: 'select', label: 'Select', title: 'Interact with the app without drawing' },
  { id: 'note', label: 'Note', title: 'Place a text callout' },
  { id: 'pen', label: 'Pen', title: 'Draw freehand' },
  { id: 'line', label: 'Line', title: 'Draw a line' },
  { id: 'arrow', label: 'Arrow', title: 'Draw an arrow' },
  { id: 'rect', label: 'Box', title: 'Draw a rectangle' },
  { id: 'mask', label: 'Mask', title: 'Hide part of the recording' },
];

/** Authoring toolbar + recorded annotation overlay. */
export const PlaybackAnnotations: React.FC = () => {
  const { mode, bundle, timeMs, timeMap } = useReplaySession();
  const [annotations, setAnnotations] = useState<AnnotationDocument | null>(null);
  const [tool, setTool] = useState<AnnotationTool>('select');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [history, setHistory] = useState<AnnotationDocument[]>([]);
  const bundleId = bundle?.manifest.id ?? null;

  useEffect(() => {
    if (!bundle) {
      setAnnotations(null);
      return;
    }
    setAnnotations(bundle.annotations);
    setHistory([]);
    setTool('select');
    setDirty(false);
    setFlash(null);
  }, [bundleId]);

  useEffect(() => {
    if (!flash) return undefined;
    const timer = window.setTimeout(() => setFlash(null), 2400);
    return () => window.clearTimeout(timer);
  }, [flash]);

  if (mode !== 'playback' || !bundle || !annotations) return null;

  const addAnnotations = (patch: Partial<AnnotationDocument>) => {
    setHistory(previous => [...previous.slice(-19), annotations]);
    setAnnotations(previous => (previous ? { ...previous, ...patch } : previous));
    setDirty(true);
  };

  const undo = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory(items => items.slice(0, -1));
    setAnnotations(previous);
    setDirty(true);
  };

  const save = async () => {
    if (!bundle || !annotations || saving) return;
    setSaving(true);
    try {
      await saveRecordingAnnotationsV2(bundle.manifest.id, annotations);
      setDirty(false);
      setFlash('Annotations saved.');
    } catch (error) {
      setFlash(error instanceof Error ? error.message : 'Could not save annotations.');
    } finally {
      setSaving(false);
    }
  };

  const clearAll = () => {
    if (!annotations) return;
    if (!window.confirm('Clear all callouts, drawings and masks from this recording?')) return;
    setHistory(previous => [...previous.slice(-19), annotations]);
    setAnnotations({ ...annotations, callouts: [], strokes: [], masks: [] });
    setDirty(true);
  };

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-[72]">
        <AnnotationLayer
          annotations={annotations}
          timeMs={timeMs}
          sourceTimeMs={timeMap.effectiveToSource(timeMs)}
          timeMap={timeMap}
          editable
          tool={tool}
          onAdd={addAnnotations}
        />
      </div>

      <div className="fixed right-4 top-4 z-[98] flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-1 rounded-lg border border-slate-700/80 bg-slate-950/95 p-1.5 text-slate-200 shadow-xl">
        {TOOLS.map(option => (
          <button
            key={option.id}
            type="button"
            title={option.title}
            onClick={() => setTool(option.id)}
            className={`rounded px-2 py-1 text-[10px] font-semibold transition-colors ${
              tool === option.id
                ? 'bg-cyan-500 text-slate-950'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            {option.label}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-700" />
        <button
          type="button"
          onClick={undo}
          disabled={history.length === 0}
          className="rounded px-2 py-1 text-[10px] font-semibold text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:text-slate-600"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="rounded px-2 py-1 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/10"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || saving}
          className="rounded bg-cyan-500 px-2 py-1 text-[10px] font-bold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </button>
        {flash && (
          <span className="max-w-44 truncate px-1 text-[10px] text-cyan-200" title={flash}>
            {flash}
          </span>
        )}
      </div>
    </>
  );
};
