/**
 * LinetypeManagerPanel
 *
 * Dedicated full-page editor for the CAD Manager's linetype library.
 * Sits in the View menu under the CAD Manager agent surface as a sub-tool.
 *
 * Responsibilities:
 *  - Browse every linetype in the loaded standard (with the COMMON_SURVEY_LINETYPES
 *    library available as a one-click seed when the standard has none).
 *  - Live SVG preview of each linetype at multiple scales, honouring the
 *    project-wide LTSCALE and the per-linetype scale factor.
 *  - Inline edit: name, description, dash/gap pattern, per-linetype scale.
 *  - Add new / duplicate / delete linetypes.
 *  - Import (.lin upload) and export (.lin download) the full library.
 *  - Adjust the global LTSCALE (drawing-wide), the same value used by
 *    DrawingCanvas to scale every dashed line on the canvas.
 *  - Optional push to Civil 3D when a C3D session token is connected
 *    (matches the existing LinetypeUpload contract).
 *
 * State of truth: linetypes & globalLinetypeScale live on the loaded
 * StandardDefinition (cadManagerContext.state.standard). All edits dispatch
 * SET_STANDARD with a cloned, patched standard so existing persistence
 * (LSVZ + C3D sync) picks them up automatically.
 */

import React, { useMemo, useState, useCallback, useRef } from 'react';
import { useCadManager } from '../../contexts/CadManagerContext';
import {
  LinetypeDefinition,
  StandardDefinition,
} from '../../contexts/types/CadManager.types';
import {
  parseLinFile,
  generateLinFileContent,
  formatPatternDisplay,
  validateLinetypeName,
  COMMON_SURVEY_LINETYPES,
} from '../../utils/linetypeParser';

interface LinetypeManagerPanelProps {
  /** True when a Civil 3D bridge session is live — enables the "Push to C3D" button. */
  isC3DConnected?: boolean;
  /** Push the current (selected) linetypes to Civil 3D. */
  onPushToC3D?: (linetypes: LinetypeDefinition[]) => Promise<void>;
  /** Close button handler — typically navigates back to the Canvas view. */
  onClose?: () => void;
}

/** Min/max bounds for any scale input (per-linetype and global). */
const SCALE_MIN = 0.01;
const SCALE_MAX = 100;

/** Three preview zoom levels rendered next to each linetype in the list. */
const PREVIEW_SCALES: { label: string; mul: number }[] = [
  { label: '0.5×', mul: 0.5 },
  { label: '1×', mul: 1 },
  { label: '2×', mul: 2 },
];

/**
 * Render a single linetype pattern as an inline SVG strip so users can see
 * exactly what the dash/gap cadence looks like. Matches the canvas renderer's
 * unit-to-pixel conversion (LIN_UNIT_TO_PX = 24).
 */
const LinetypePreview: React.FC<{
  pattern: number[];
  perLtScale: number;
  globalScale: number;
  shapeData?: LinetypeDefinition['shapeData'];
  width?: number;
  height?: number;
}> = ({ pattern, perLtScale, globalScale, shapeData, width = 220, height = 22 }) => {
  const LIN_UNIT_TO_PX = 24;
  const effectiveScale = (perLtScale || 1) * (globalScale || 1);
  // Continuous line (no pattern) → just a solid stroke.
  if (!pattern || pattern.length === 0) {
    return (
      <svg width={width} height={height} className="bg-gray-950/40 rounded">
        <line x1={4} y1={height / 2} x2={width - 4} y2={height / 2}
              stroke="currentColor" strokeWidth={1.5} />
      </svg>
    );
  }
  // Build the cycle once (dash/gap/glyph/arc), then repeat it across the
  // preview width as an SVG path with interleaved text glyphs.
  type Step =
    | { kind: 'dash'; size: number }
    | { kind: 'gap'; size: number }
    | { kind: 'glyph'; label: string; size: number }
    | { kind: 'arc'; size: number; side: 1 | -1 };
  const cycle: Step[] = [];
  let cycleLenRaw = 0;
  let shapeIdx = 0;
  for (const v of pattern) {
    if (v === 0) {
      const sd = shapeData?.[shapeIdx++];
      if (sd && (sd as any).arc) {
        const chord = ((sd.scale && sd.scale > 0 ? sd.scale : 0.5)) * LIN_UNIT_TO_PX * effectiveScale;
        const side: 1 | -1 = (sd as any).arcSide === -1 ? -1 : 1;
        cycle.push({ kind: 'arc', size: chord, side });
        cycleLenRaw += chord;
      } else {
        const label = (sd?.name ?? '').trim();
        const textScale = sd?.scale && sd.scale > 0 ? sd.scale : 0.1;
        cycle.push({ kind: 'glyph', label, size: textScale * LIN_UNIT_TO_PX * effectiveScale * 2.0 });
      }
    } else if (v > 0) {
      const px = v * LIN_UNIT_TO_PX * effectiveScale;
      cycle.push({ kind: 'dash', size: px });
      cycleLenRaw += px;
    } else {
      const px = -v * LIN_UNIT_TO_PX * effectiveScale;
      cycle.push({ kind: 'gap', size: px });
      cycleLenRaw += px;
    }
  }
  const cycleLen = Math.max(1, cycleLenRaw);

  const startX = 4;
  const endX = width - 4;
  const midY = height / 2;
  let cursor = startX;
  let path = `M ${startX} ${midY}`;
  const stampedGlyphs: Array<{ x: number; label: string; size: number }> = [];
  let safety = 0;
  while (cursor < endX && safety++ < 500) {
    for (const step of cycle) {
      if (cursor >= endX) break;
      if (step.kind === 'dash') {
        const end = Math.min(cursor + step.size, endX);
        path += ` L ${end} ${midY}`;
        cursor = end;
      } else if (step.kind === 'gap') {
        cursor = Math.min(cursor + step.size, endX);
        path += ` M ${cursor} ${midY}`;
      } else if (step.kind === 'arc') {
        const end = Math.min(cursor + step.size, endX);
        const r = (end - cursor) / 2;
        // SVG y grows downward; sweep-flag 0 bumps upward (side=+1).
        const sweep = step.side === 1 ? 0 : 1;
        path += ` A ${r} ${r} 0 0 ${sweep} ${end} ${midY}`;
        cursor = end;
      } else if (step.kind === 'glyph' && step.label) {
        stampedGlyphs.push({ x: cursor, label: step.label, size: step.size });
      }
    }
  }

  return (
    <svg width={width} height={height} className="bg-gray-950/40 rounded">
      <path d={path} stroke="currentColor" strokeWidth={1.5} fill="none" />
      {stampedGlyphs.map((g, i) => (
        <text
          key={i}
          x={g.x}
          y={midY}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={Math.max(8, Math.min(height - 2, g.size))}
          fontWeight="bold"
          fill="currentColor"
        >
          {g.label}
        </text>
      ))}
    </svg>
  );
};

/** Convert a comma/space delimited pattern string into the numeric array used by the spec. */
function parsePatternInput(input: string): { pattern: number[]; error?: string } {
  const tokens = input
    .split(/[\s,]+/)
    .map(t => t.trim())
    .filter(t => t.length > 0);
  if (tokens.length === 0) return { pattern: [] };
  const out: number[] = [];
  for (const t of tokens) {
    const n = Number(t);
    if (!Number.isFinite(n)) {
      return { pattern: [], error: `"${t}" is not a number` };
    }
    out.push(n);
  }
  return { pattern: out };
}

export const LinetypeManagerPanel: React.FC<LinetypeManagerPanelProps> = ({
  isC3DConnected = false,
  onPushToC3D,
  onClose,
}) => {
  const { state, dispatch } = useCadManager();
  const standard = state.standard;
  const linetypes = useMemo<LinetypeDefinition[]>(
    () => standard?.linetypes ?? [],
    [standard],
  );
  const globalScale = standard?.globalLinetypeScale ?? 1;

  const [selectedName, setSelectedName] = useState<string | null>(
    linetypes[0]?.name ?? null,
  );
  const [filter, setFilter] = useState('');
  const [feedback, setFeedback] = useState<
    { kind: 'info' | 'error' | 'success'; text: string } | null
  >(null);
  const [isPushing, setIsPushing] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const f = filter.trim().toUpperCase();
    if (!f) return linetypes;
    return linetypes.filter(
      lt =>
        lt.name.toUpperCase().includes(f) ||
        (lt.description ?? '').toUpperCase().includes(f),
    );
  }, [linetypes, filter]);

  const selected =
    linetypes.find(lt => lt.name === selectedName) ?? filtered[0] ?? null;

  /**
   * Patch the standard with a new list of linetypes (and optional new
   * globalLinetypeScale) via SET_STANDARD. Bails with a friendly error when
   * no standard is loaded — the user must seed one first via CAD Standards.
   */
  const patchStandard = useCallback(
    (patch: Partial<StandardDefinition>) => {
      if (!standard) {
        setFeedback({
          kind: 'error',
          text:
            'No CAD standard is loaded yet. Open CAD Standards (View ▸ CAD Standards) to create or load one before editing linetypes.',
        });
        return;
      }
      const next: StandardDefinition = {
        ...standard,
        ...patch,
        lastUpdated: new Date().toISOString(),
      };
      dispatch({ type: 'SET_STANDARD', payload: next });
    },
    [standard, dispatch],
  );

  const updateLinetypes = useCallback(
    (next: LinetypeDefinition[]) => patchStandard({ linetypes: next }),
    [patchStandard],
  );

  const setGlobalScale = useCallback(
    (n: number) => {
      const clamped = Math.min(SCALE_MAX, Math.max(SCALE_MIN, n));
      patchStandard({ globalLinetypeScale: clamped });
    },
    [patchStandard],
  );

  /** Update the currently selected linetype with a partial patch. */
  const updateSelected = useCallback(
    (patch: Partial<LinetypeDefinition>) => {
      if (!selected) return;
      const next = linetypes.map(lt =>
        lt.name === selected.name ? { ...lt, ...patch } : lt,
      );
      updateLinetypes(next);
    },
    [selected, linetypes, updateLinetypes],
  );

  /** Rename the currently selected linetype; validates and keeps name unique. */
  const renameSelected = useCallback(
    (newName: string) => {
      if (!selected) return;
      const trimmed = newName.trim().toUpperCase();
      if (trimmed === selected.name) return;
      const validation = validateLinetypeName(trimmed);
      if (!validation.valid) {
        setFeedback({ kind: 'error', text: validation.error ?? 'Invalid name' });
        return;
      }
      if (linetypes.some(lt => lt.name === trimmed)) {
        setFeedback({
          kind: 'error',
          text: `A linetype named "${trimmed}" already exists.`,
        });
        return;
      }
      const next = linetypes.map(lt =>
        lt.name === selected.name ? { ...lt, name: trimmed } : lt,
      );
      updateLinetypes(next);
      setSelectedName(trimmed);
      setFeedback({ kind: 'success', text: `Renamed to ${trimmed}` });
    },
    [selected, linetypes, updateLinetypes],
  );

  const addNew = useCallback(() => {
    const base = 'CUSTOM';
    let i = 1;
    while (linetypes.some(lt => lt.name === `${base}_${i}`)) i++;
    const name = `${base}_${i}`;
    const lt: LinetypeDefinition = {
      name,
      description: 'New custom linetype',
      pattern: [0.5, -0.25],
      patternLength: 0.75,
      scale: 1,
      isComplex: false,
    };
    updateLinetypes([...linetypes, lt]);
    setSelectedName(name);
    setFeedback({ kind: 'success', text: `Added "${name}"` });
  }, [linetypes, updateLinetypes]);

  const duplicateSelected = useCallback(() => {
    if (!selected) return;
    let i = 1;
    while (linetypes.some(lt => lt.name === `${selected.name}_COPY${i}`)) i++;
    const copy: LinetypeDefinition = {
      ...selected,
      name: `${selected.name}_COPY${i}`,
    };
    updateLinetypes([...linetypes, copy]);
    setSelectedName(copy.name);
  }, [selected, linetypes, updateLinetypes]);

  const deleteSelected = useCallback(() => {
    if (!selected) return;
    const ok = window.confirm(
      `Delete linetype "${selected.name}"? This cannot be undone (you'll need to re-import it).`,
    );
    if (!ok) return;
    const next = linetypes.filter(lt => lt.name !== selected.name);
    updateLinetypes(next);
    setSelectedName(next[0]?.name ?? null);
    setFeedback({ kind: 'success', text: `Deleted "${selected.name}"` });
  }, [selected, linetypes, updateLinetypes]);

  /** Seed the library with COMMON_SURVEY_LINETYPES, skipping anything already present. */
  const seedCommon = useCallback(() => {
    const existing = new Set(linetypes.map(lt => lt.name.toUpperCase()));
    const additions = COMMON_SURVEY_LINETYPES.filter(
      lt => !existing.has(lt.name.toUpperCase()),
    );
    if (additions.length === 0) {
      setFeedback({
        kind: 'info',
        text: 'All common survey linetypes are already in your library.',
      });
      return;
    }
    updateLinetypes([...linetypes, ...additions]);
    setFeedback({
      kind: 'success',
      text: `Added ${additions.length} common survey linetypes.`,
    });
  }, [linetypes, updateLinetypes]);

  const handleImportClick = () => importInputRef.current?.click();

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseLinFile(text, file.name);
      // Merge by name (uploaded wins).
      const incoming = new Map<string, LinetypeDefinition>();
      for (const lt of linetypes) incoming.set(lt.name.toUpperCase(), lt);
      for (const lt of parsed.linetypes) incoming.set(lt.name.toUpperCase(), lt);
      updateLinetypes(Array.from(incoming.values()));
      setFeedback({
        kind: 'success',
        text: `Imported ${parsed.linetypes.length} linetype(s) from ${file.name}.`,
      });
    } catch (err) {
      setFeedback({
        kind: 'error',
        text:
          'Failed to parse .lin file: ' +
          (err instanceof Error ? err.message : 'unknown error'),
      });
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const handleExport = () => {
    if (linetypes.length === 0) {
      setFeedback({ kind: 'error', text: 'No linetypes to export.' });
      return;
    }
    const content = generateLinFileContent(
      linetypes,
      `${standard?.name ?? 'Landsurv'} linetypes — exported ${new Date().toISOString()}`,
    );
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(standard?.name ?? 'landsurv').replace(/\s+/g, '_').toLowerCase()}_linetypes.lin`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setFeedback({
      kind: 'success',
      text: `Exported ${linetypes.length} linetype(s) as ${a.download}.`,
    });
  };

  const handlePushAllToC3D = async () => {
    if (!onPushToC3D || linetypes.length === 0) return;
    setIsPushing(true);
    setFeedback(null);
    try {
      await onPushToC3D(linetypes);
      setFeedback({
        kind: 'success',
        text: `Pushed ${linetypes.length} linetype(s) to Civil 3D.`,
      });
    } catch (err) {
      setFeedback({
        kind: 'error',
        text:
          'Failed to push to Civil 3D: ' +
          (err instanceof Error ? err.message : 'unknown error'),
      });
    } finally {
      setIsPushing(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-full flex flex-col bg-gray-950 text-gray-200">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-gray-800 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-indigo-300 truncate">
            📏 Linetype Manager
          </h1>
          <p className="text-xs text-gray-500 truncate">
            CAD Manager sub-tool · {linetypes.length} linetype
            {linetypes.length === 1 ? '' : 's'} ·{' '}
            {standard?.name ?? 'No standard loaded'}
          </p>
        </div>

        {/* Global LTSCALE control */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 border border-gray-800 rounded-md">
          <label className="text-xs text-gray-400 font-medium">
            Global LTSCALE
          </label>
          <input
            type="number"
            value={globalScale}
            min={SCALE_MIN}
            max={SCALE_MAX}
            step={0.1}
            onChange={e => setGlobalScale(Number(e.target.value))}
            className="w-20 px-2 py-1 bg-gray-950 border border-gray-700 rounded text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            title="Project-wide multiplier applied to every dashed linetype on the canvas (AutoCAD LTSCALE)"
          />
          <button
            onClick={() => setGlobalScale(1)}
            className="text-xs text-gray-500 hover:text-gray-300"
            title="Reset to 1.0"
          >
            ↺
          </button>
        </div>

        <button
          onClick={handleImportClick}
          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-sm rounded-md border border-gray-700"
          title="Import an AutoCAD .lin file"
        >
          📁 Import .lin
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept=".lin"
          className="hidden"
          onChange={handleImport}
        />
        <button
          onClick={handleExport}
          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-sm rounded-md border border-gray-700"
          title="Download all linetypes as an AutoCAD .lin file"
        >
          💾 Export .lin
        </button>
        {onPushToC3D && (
          <button
            onClick={handlePushAllToC3D}
            disabled={!isC3DConnected || isPushing || linetypes.length === 0}
            className="px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:bg-gray-800 disabled:text-gray-600 text-sm rounded-md"
            title={
              !isC3DConnected
                ? 'Civil 3D not connected'
                : 'Push every linetype to the connected Civil 3D drawing'
            }
          >
            {isPushing ? '⏳ Pushing…' : '📤 Push all to C3D'}
          </button>
        )}
        {onClose && (
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-sm rounded-md border border-gray-700"
            title="Close Linetype Manager"
          >
            ✕
          </button>
        )}
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`flex-shrink-0 px-4 py-2 text-sm border-b ${
            feedback.kind === 'error'
              ? 'bg-red-950/40 border-red-900 text-red-200'
              : feedback.kind === 'success'
                ? 'bg-green-950/40 border-green-900 text-green-200'
                : 'bg-blue-950/40 border-blue-900 text-blue-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span>{feedback.text}</span>
            <button
              onClick={() => setFeedback(null)}
              className="text-xs opacity-60 hover:opacity-100 ml-3"
            >
              dismiss
            </button>
          </div>
        </div>
      )}

      {/* Body: list + editor */}
      <div className="flex-1 min-h-0 flex">
        {/* Left: list */}
        <aside className="w-[420px] flex-shrink-0 border-r border-gray-800 flex flex-col">
          <div className="flex-shrink-0 p-3 border-b border-gray-800 space-y-2">
            <input
              type="text"
              placeholder="Filter by name or description…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-gray-900 border border-gray-700 rounded text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <div className="flex gap-2">
              <button
                onClick={addNew}
                className="flex-1 px-2 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-sm rounded"
              >
                ＋ Add
              </button>
              <button
                onClick={duplicateSelected}
                disabled={!selected}
                className="flex-1 px-2 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900 disabled:text-gray-600 text-sm rounded"
              >
                ⧉ Duplicate
              </button>
              <button
                onClick={deleteSelected}
                disabled={!selected}
                className="flex-1 px-2 py-1.5 bg-red-900/60 hover:bg-red-800 disabled:bg-gray-900 disabled:text-gray-600 text-sm rounded"
              >
                🗑 Delete
              </button>
            </div>
            {linetypes.length === 0 && (
              <button
                onClick={seedCommon}
                className="w-full px-2 py-1.5 bg-purple-800 hover:bg-purple-700 text-sm rounded"
              >
                ✨ Seed common survey linetypes
              </button>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="p-6 text-center text-sm text-gray-500">
                {linetypes.length === 0 ? (
                  <>
                    No linetypes yet. Add one, import a <code>.lin</code> file,
                    or seed the common survey library.
                  </>
                ) : (
                  <>No linetypes match "{filter}".</>
                )}
              </div>
            )}
            {filtered.map(lt => {
              const isActive = selected?.name === lt.name;
              return (
                <button
                  key={lt.name}
                  onClick={() => setSelectedName(lt.name)}
                  className={`w-full text-left px-3 py-2 border-b border-gray-900 transition-colors ${
                    isActive
                      ? 'bg-indigo-900/30 border-l-2 border-l-indigo-400'
                      : 'hover:bg-gray-900/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm text-gray-100 truncate">
                      {lt.name}
                    </span>
                    {lt.isComplex && (
                      <span className="text-[10px] uppercase bg-purple-900/50 text-purple-300 px-1.5 py-0.5 rounded">
                        complex
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 truncate mt-0.5">
                    {lt.description || '—'}
                  </div>
                  <div className="mt-1.5 text-gray-300">
                    <LinetypePreview
                      pattern={lt.pattern}
                      perLtScale={lt.scale ?? 1}
                      globalScale={globalScale}
                      shapeData={lt.shapeData}
                      width={380}
                      height={18}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Right: editor */}
        <section className="flex-1 min-w-0 overflow-y-auto p-6">
          {!selected ? (
            <div className="text-gray-500 text-sm">
              Select a linetype from the list to edit, or add a new one.
            </div>
          ) : (
            <LinetypeEditor
              key={selected.name /* force fresh form state on selection change */}
              linetype={selected}
              globalScale={globalScale}
              onPatch={updateSelected}
              onRename={renameSelected}
            />
          )}
        </section>
      </div>
    </div>
  );
};

// ── Editor sub-component ────────────────────────────────────────────────────

interface LinetypeEditorProps {
  linetype: LinetypeDefinition;
  globalScale: number;
  onPatch: (patch: Partial<LinetypeDefinition>) => void;
  onRename: (newName: string) => void;
}

const LinetypeEditor: React.FC<LinetypeEditorProps> = ({
  linetype,
  globalScale,
  onPatch,
  onRename,
}) => {
  const [nameDraft, setNameDraft] = useState(linetype.name);
  const [descDraft, setDescDraft] = useState(linetype.description);
  const [patternDraft, setPatternDraft] = useState(
    linetype.pattern.join(', '),
  );
  const [patternError, setPatternError] = useState<string | null>(null);

  // Keep draft in sync when a different linetype is selected (key forces remount,
  // so we can rely on the props passed at mount time).

  const commitPattern = useCallback(() => {
    const parsed = parsePatternInput(patternDraft);
    if (parsed.error) {
      setPatternError(parsed.error);
      return;
    }
    setPatternError(null);
    const patternLength = parsed.pattern.reduce(
      (sum, n) => sum + Math.abs(n),
      0,
    );
    onPatch({ pattern: parsed.pattern, patternLength });
  }, [patternDraft, onPatch]);

  const scale = linetype.scale ?? 1;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-100">
          Edit Linetype
        </h2>
        <p className="text-sm text-gray-500">
          Changes save to the loaded standard immediately and apply across the
          canvas, exports, and Civil 3D sync.
        </p>
      </div>

      {/* Name + description */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Name
          </label>
          <input
            type="text"
            value={nameDraft}
            onChange={e => setNameDraft(e.target.value)}
            onBlur={() => onRename(nameDraft)}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded font-mono text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <p className="text-[11px] text-gray-600 mt-1">
            AutoCAD-style upper-case identifier. No commas, slashes, or
            reserved names (BYLAYER, BYBLOCK, CONTINUOUS).
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Per-linetype scale
          </label>
          <input
            type="number"
            value={scale}
            min={SCALE_MIN}
            max={SCALE_MAX}
            step={0.1}
            onChange={e =>
              onPatch({
                scale: Math.min(
                  SCALE_MAX,
                  Math.max(SCALE_MIN, Number(e.target.value) || 1),
                ),
              })
            }
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <p className="text-[11px] text-gray-600 mt-1">
            Multiplied by the Global LTSCALE ({globalScale}×) when rendering.
            Effective scale: <span className="text-gray-400">{(scale * globalScale).toFixed(3)}×</span>
          </p>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">
          Description
        </label>
        <input
          type="text"
          value={descDraft}
          onChange={e => setDescDraft(e.target.value)}
          onBlur={() => onPatch({ description: descDraft })}
          placeholder="e.g. Dashed __ __ __ — used for hidden lines"
          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {/* Pattern */}
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">
          Pattern (drawing units)
        </label>
        <input
          type="text"
          value={patternDraft}
          onChange={e => setPatternDraft(e.target.value)}
          onBlur={commitPattern}
          placeholder="0.5, -0.25"
          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded font-mono text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <p className="text-[11px] text-gray-600 mt-1">
          Comma- or space-separated numbers. Positive = dash length,
          negative = gap, <code>0</code> = dot. Matches the AutoCAD <code>.lin</code>{' '}
          pattern format. Leave empty for CONTINUOUS.
        </p>
        {patternError && (
          <p className="text-xs text-red-400 mt-1">{patternError}</p>
        )}
        <p className="text-[11px] text-gray-500 mt-1 font-mono">
          {formatPatternDisplay(linetype.pattern)}
        </p>
      </div>

      {/* Live multi-scale preview */}
      <div className="bg-gray-900 border border-gray-800 rounded-md p-4">
        <h3 className="text-xs uppercase tracking-wide text-gray-400 mb-3">
          Preview · Global LTSCALE {globalScale}× · Per-linetype {scale}×
        </h3>
        <div className="space-y-3 text-gray-100">
          {PREVIEW_SCALES.map(p => (
            <div key={p.label} className="flex items-center gap-3">
              <span className="w-10 text-xs text-gray-500">{p.label}</span>
              <LinetypePreview
                pattern={linetype.pattern}
                perLtScale={scale * p.mul}
                globalScale={globalScale}
                shapeData={linetype.shapeData}
                width={560}
                height={24}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Complex linetype info */}
      {linetype.isComplex && linetype.shapeData && linetype.shapeData.length > 0 && (
        <div className="bg-purple-950/30 border border-purple-900/50 rounded-md p-4">
          <h3 className="text-xs uppercase tracking-wide text-purple-300 mb-2">
            Complex elements ({linetype.shapeData.length})
          </h3>
          <p className="text-xs text-gray-400 mb-3">
            This linetype embeds shape or text elements. They round-trip
            through <code>.lin</code> import/export and Civil 3D sync, but the
            canvas preview shows only the dash/gap skeleton.
          </p>
          <ul className="space-y-1 text-xs font-mono text-purple-200">
            {linetype.shapeData.map((sd, i) => (
              <li key={i}>
                {sd.isText ? '“' : '['}
                {sd.name}
                {sd.isText ? '”' : ''}
                {sd.style ? `, style=${sd.style}` : ''}
                {sd.file ? `, file=${sd.file}` : ''}
                {sd.scale != null ? `, S=${sd.scale}` : ''}
                {sd.xOffset != null ? `, X=${sd.xOffset}` : ''}
                {sd.yOffset != null ? `, Y=${sd.yOffset}` : ''}
                {!sd.isText ? ']' : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default LinetypeManagerPanel;
