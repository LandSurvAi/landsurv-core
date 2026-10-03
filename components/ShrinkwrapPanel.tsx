import React, { useMemo } from 'react';
import type { SurveyPoint } from '../types.ts';

interface ShrinkwrapPanelProps {
  /** Total points in the source set (before exclusions). */
  sourceCount: number;
  /** Vertices on the current (committed) hull. */
  hullCount: number;
  /** CAD layer the hull is drawn on. */
  layer: string;
  /** Currently-committed excluded point numbers (drives the rendered hull). */
  excludedPns: string[];
  /** User-editable draft set — what the hull WILL be excluding after Update. */
  pendingExcludedPns: string[];
  /** KNN tightness for the concave-hull walker. Lower = tighter (more concave). */
  concavityK: number;
  /** Live-updates the hull tightness (no Update press required). */
  onConcavityChange: (k: number) => void;
  /** Construction-line "cuts" — each is a chord (a → b) that auto-excludes
   *  every point on its smaller-area side, redefining that boundary segment. */
  cuts: Array<{ a: string; b: string; flipped: boolean }>;
  /** When true, every canvas click builds the next cut endpoint instead of
   *  staging an exclusion. Owned by the host so the canvas click handler can
   *  branch deterministically without competing with the exclude workflow. */
  cutMode: boolean;
  /** First endpoint of an in-progress cut (set by the host as the user
   *  clicks). When non-null, the next canvas click in cut mode completes
   *  the cut. */
  cutStartPn: string | null;
  /** Toggle cut mode on/off. Toggling always clears the in-progress endpoint. */
  onToggleCutMode: () => void;
  /** Toggle which side of a cut is amputated. Live-applies. */
  onFlipCut: (idx: number) => void;
  /** Remove a cut (and its exclusion effect). Live-applies. */
  onRemoveCut: (idx: number) => void;
  /** The single point currently selected on canvas, if any. */
  selectedPoint: SurveyPoint | null;
  /** Stage an exclusion in the draft (does not recompute). */
  onStageExclude: (pn: string) => void;
  /** Remove a still-staged exclusion from the draft (does not recompute). */
  onUnstageExclude: (pn: string) => void;
  /** Stage a restore for an already-committed exclusion (does not recompute). */
  onStageRestore: (pn: string) => void;
  /** Stage a restore for every excluded point (does not recompute). */
  onStageRestoreAll: () => void;
  /** Commit the draft: copy pendingExcludedPns → excludedPns and recompute. */
  onApplyUpdate: () => void;
  /** Convert the reviewed preview into an inclusion boundary. */
  onDrawInclusion: () => void;
  /** Whether the current hull has been committed as an inclusion boundary. */
  isCommitted: boolean;
  /** Remove the shrinkwrap polyline and end the session. */
  onClearShrinkwrap: () => void;
}

/**
 * Floating control panel for an active shrinkwrap session.
 *
 * Two explicit, mutually-exclusive interaction modes:
 *
 *   EXCLUDE MODE (default) — every canvas click on a hull point STAGES that
 *     point for removal. Batched until "Update" is pressed.
 *
 *   CUT MODE (toggle button) — every canvas click is a cut endpoint. First
 *     click sets the start; second click completes the chord and adds it
 *     to `cuts`. Cuts live-apply (no Update press required). Toggling the
 *     mode always clears the in-progress endpoint.
 *
 * The mode is owned by the host (App.tsx) so the canvas click handler can
 * route deterministically without the panel and canvas getting out of sync.
 */
const ShrinkwrapPanel: React.FC<ShrinkwrapPanelProps> = ({
  sourceCount,
  hullCount,
  layer,
  excludedPns,
  pendingExcludedPns,
  concavityK,
  onConcavityChange,
  cuts,
  cutMode,
  cutStartPn,
  onToggleCutMode,
  onFlipCut,
  onRemoveCut,
  selectedPoint,
  onStageExclude,
  onUnstageExclude,
  onStageRestore,
  onStageRestoreAll,
  onApplyUpdate,
  onDrawInclusion,
  isCommitted,
  onClearShrinkwrap,
}) => {
  const committedSet = useMemo(() => new Set(excludedPns), [excludedPns]);
  const pendingSet = useMemo(() => new Set(pendingExcludedPns), [pendingExcludedPns]);

  // Newly staged for exclusion (not yet committed).
  const newlyStaged = useMemo(
    () => pendingExcludedPns.filter(pn => !committedSet.has(pn)),
    [pendingExcludedPns, committedSet],
  );
  // Currently excluded but staged to be restored.
  const stagedRestores = useMemo(
    () => excludedPns.filter(pn => !pendingSet.has(pn)),
    [excludedPns, pendingSet],
  );
  // Excluded and staying excluded.
  const stillExcluded = useMemo(
    () => excludedPns.filter(pn => pendingSet.has(pn)),
    [excludedPns, pendingSet],
  );

  const hasChanges = newlyStaged.length > 0 || stagedRestores.length > 0;
  const canExclude = !!selectedPoint
    && !pendingSet.has(selectedPoint.pointNumber)
    && !committedSet.has(selectedPoint.pointNumber);

  return (
    <div className="text-sm text-gray-200 space-y-3 light-theme:text-gray-800">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded bg-gray-700/40 px-2 py-1 light-theme:bg-gray-100">
          <div className="text-[10px] uppercase tracking-wide text-gray-400 light-theme:text-gray-500">Source</div>
          <div className="font-mono text-base">{sourceCount}</div>
        </div>
        <div className="rounded bg-gray-700/40 px-2 py-1 light-theme:bg-gray-100">
          <div className="text-[10px] uppercase tracking-wide text-gray-400 light-theme:text-gray-500">Vertices</div>
          <div className="font-mono text-base">{hullCount}</div>
        </div>
        <div className="rounded bg-gray-700/40 px-2 py-1 light-theme:bg-gray-100">
          <div className="text-[10px] uppercase tracking-wide text-gray-400 light-theme:text-gray-500">Excluded</div>
          <div className="font-mono text-base">
            {excludedPns.length}
            {hasChanges && (
              <span className="text-amber-300 text-[11px] ml-1">→ {pendingExcludedPns.length}</span>
            )}
          </div>
        </div>
      </div>

      <div className="text-[11px] text-gray-400 light-theme:text-gray-600 leading-snug">
        Layer: <span className="font-mono text-gray-200 light-theme:text-gray-800">{layer}</span> ·
        {isCommitted ? 'drawn as an inclusion boundary' : 'preview only until drawn as an inclusion boundary'}.
      </div>

      {/* Tightness slider — controls concave-hull KNN. Live-recomputes. */}
      <div className="rounded border border-violet-700/40 bg-violet-900/10 p-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] uppercase tracking-wide text-violet-300">Tightness</span>
          <span className="font-mono text-xs text-violet-200">k = {concavityK}</span>
        </div>
        <input
          type="range"
          min={3}
          max={60}
          step={1}
          value={concavityK}
          onChange={(e) => onConcavityChange(Number(e.target.value))}
          className="w-full accent-violet-500"
        />
        <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
          <span>tight (crawls edges)</span>
          <span>loose (convex)</span>
        </div>
      </div>

      {/* Mode toggle — single source of truth for what canvas clicks do. */}
      <div className={`rounded border p-2 space-y-2 ${
        cutMode
          ? 'border-red-500/60 bg-red-900/20'
          : 'border-violet-700/40 bg-violet-900/10'
      }`}>
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] uppercase tracking-wide">
            <span className={cutMode ? 'text-red-300' : 'text-violet-300'}>
              Mode: {cutMode ? 'Construction Cut' : 'Exclude Points'}
            </span>
          </div>
          <button
            type="button"
            onClick={onToggleCutMode}
            className={`px-2 py-1 rounded text-[11px] font-semibold text-white ${
              cutMode
                ? 'bg-red-600 hover:bg-red-500'
                : 'bg-gray-700 hover:bg-gray-600 border border-red-500/40 text-red-300'
            }`}
            title={cutMode ? 'Exit cut mode and go back to excluding points' : 'Strike chord cuts between two points'}
          >
            {cutMode ? 'Exit Cut Mode' : 'Enter Cut Mode'}
          </button>
        </div>

        {cutMode ? (
          // CUT-MODE PANEL — every canvas click is a cut endpoint.
          <>
            <div className="text-[11px] text-red-200 leading-snug">
              {cutStartPn
                ? <>Cut start: <span className="font-mono">{cutStartPn}</span>. Click the second point on the canvas to complete the chord, or tap <span className="font-mono">{cutStartPn}</span> again to cancel.</>
                : <>Click any two points on the canvas to strike a construction cut. The smaller side of the chord is auto-excluded.</>
              }
            </div>
            <div className="text-[11px] text-gray-400">
              Selected: <span className="font-mono">{selectedPoint?.pointNumber ?? '—'}</span>
            </div>
          </>
        ) : (
          // EXCLUDE-MODE PANEL — canvas clicks stage exclusions (batched).
          <>
            <div className="text-[11px] text-gray-400 light-theme:text-gray-600">
              Click any hull point on the canvas to stage it for removal. The hull
              recomputes only when you press <span className="font-semibold text-amber-300">Update</span>.
            </div>
            <div className="flex items-center gap-2">
              <div className="font-mono text-sm flex-1 truncate">
                {selectedPoint
                  ? `${selectedPoint.pointNumber}${selectedPoint.description ? ` — ${selectedPoint.description}` : ''}`
                  : <span className="text-gray-500 italic">(click a point on the canvas)</span>}
              </div>
              <button
                type="button"
                disabled={!canExclude}
                onClick={() => selectedPoint && onStageExclude(selectedPoint.pointNumber)}
                className="px-2 py-1 rounded text-[11px] font-semibold bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Stage Exclude
              </button>
            </div>
          </>
        )}
      </div>

      {/* Newly staged exclusions (not yet committed). */}
      {newlyStaged.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-[11px] uppercase tracking-wide text-amber-300">
              Staged to exclude ({newlyStaged.length})
            </div>
          </div>
          <ul className="max-h-32 overflow-auto divide-y divide-amber-500/20 rounded border border-amber-500/40 bg-amber-900/10">
            {newlyStaged.map(pn => (
              <li key={pn} className="flex items-center justify-between px-2 py-1 text-xs">
                <span className="font-mono text-amber-200">{pn}</span>
                <button
                  type="button"
                  onClick={() => onUnstageExclude(pn)}
                  className="text-[11px] text-amber-300 hover:text-amber-200 underline"
                >
                  Unstage
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Already-committed exclusions (with stage-to-restore option). */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 light-theme:text-gray-600">
            Excluded points
          </div>
          {excludedPns.length > 0 && stagedRestores.length < excludedPns.length && (
            <button
              type="button"
              onClick={onStageRestoreAll}
              className="text-[11px] text-violet-300 hover:text-violet-200 underline"
            >
              Stage restore all
            </button>
          )}
        </div>
        {excludedPns.length === 0 ? (
          <div className="text-[11px] text-gray-500 italic">None — the hull uses every source point.</div>
        ) : (
          <ul className="max-h-40 overflow-auto divide-y divide-gray-700/60 rounded border border-gray-700/60 light-theme:divide-gray-300 light-theme:border-gray-300">
            {stillExcluded.map(pn => (
              <li key={pn} className="flex items-center justify-between px-2 py-1 text-xs">
                <span className="font-mono">{pn}</span>
                <button
                  type="button"
                  onClick={() => onStageRestore(pn)}
                  className="text-[11px] text-violet-300 hover:text-violet-200"
                >
                  Stage restore
                </button>
              </li>
            ))}
            {stagedRestores.map(pn => (
              <li key={pn} className="flex items-center justify-between px-2 py-1 text-xs bg-emerald-900/10">
                <span className="font-mono text-emerald-300 line-through">{pn}</span>
                <button
                  type="button"
                  onClick={() => onStageExclude(pn)}
                  className="text-[11px] text-emerald-300 hover:text-emerald-200 underline"
                >
                  Keep excluded
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Active construction cuts — list only; builder lives in the selected-point box above. */}
      {cuts.length > 0 && (
        <div className="rounded border border-red-700/40 bg-red-900/10 p-2 space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-red-300">
            Construction Cuts ({cuts.length})
          </div>
          <ul className="divide-y divide-red-500/20 rounded border border-red-500/40 bg-red-900/10 max-h-32 overflow-auto">
            {cuts.map((c, idx) => (
              <li key={`${c.a}-${c.b}-${idx}`} className="flex items-center justify-between px-2 py-1 text-xs">
                <span className="font-mono text-red-200">
                  {c.a} ─ {c.b}
                  {c.flipped && <span className="ml-1 text-amber-300">(flipped)</span>}
                </span>
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onFlipCut(idx)}
                    className="text-[11px] text-amber-300 hover:text-amber-200 underline"
                    title="Amputate the other side of this cut"
                  >
                    Flip
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveCut(idx)}
                    className="text-[11px] text-red-300 hover:text-red-200"
                    title="Remove this cut"
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Update button — commits pending changes and triggers recompute. */}
      <button
        type="button"
        disabled={!hasChanges}
        onClick={onApplyUpdate}
        className={[
          'w-full px-2 py-2 rounded text-xs font-semibold transition-colors',
          hasChanges
            ? 'bg-amber-500 text-gray-900 hover:bg-amber-400 animate-pulse'
            : 'bg-gray-700 text-gray-500 cursor-not-allowed',
        ].join(' ')}
        title={hasChanges
          ? 'Re-run the COGO convex hull with the new exclusion set'
          : 'No pending changes — stage exclusions or restores first'}
      >
        {hasChanges
          ? `Update Hull (${newlyStaged.length} exclude, ${stagedRestores.length} restore)`
          : 'Update Hull'}
      </button>

      <button
        type="button"
        disabled={isCommitted || hullCount < 3}
        onClick={onDrawInclusion}
        className={[
          'w-full px-2 py-2 rounded text-xs font-semibold transition-colors',
          isCommitted
            ? 'bg-emerald-700/70 text-emerald-100 cursor-default'
            : hullCount >= 3
              ? 'bg-emerald-600 text-white hover:bg-emerald-500'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed',
        ].join(' ')}
        title={isCommitted
          ? 'This shrinkwrap is already an inclusion boundary'
          : hullCount >= 3
            ? 'Commit the reviewed shrinkwrap as an inclusion boundary'
            : 'A shrinkwrap needs at least three vertices'}
      >
        {isCommitted ? 'Inclusion Drawn' : 'Draw Inclusion'}
      </button>

      <div className="pt-2 border-t border-gray-700/60 light-theme:border-gray-300">
        <button
          type="button"
          onClick={onClearShrinkwrap}
          className="w-full px-2 py-1.5 rounded text-xs font-semibold bg-red-600/80 text-white hover:bg-red-500"
        >
          Clear Shrinkwrap
        </button>
      </div>
    </div>
  );
};

export default ShrinkwrapPanel;
