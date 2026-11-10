import React, { useMemo } from 'react';
import type { SurveyPoint } from '../types.ts';

interface ShrinkwrapPanelProps {
  /** Total points in the source set (before exclusions). */
  sourceCount: number;
  /** Vertices on the current (committed) hull. */
  hullCount: number;
  /** CAD layer the hull is drawn on. */
  layer: string;
  /** Point numbers currently left out of the hull. */
  excludedPns: string[];
  /** KNN tightness for the concave-hull walker. Lower = tighter (more concave). */
  concavityK: number;
  /** Live-updates the hull tightness. */
  onConcavityChange: (k: number) => void;
  /** Construction-line "cuts" — each is a chord (a → b) that auto-excludes
   *  every point on its smaller-area side, redefining that boundary segment. */
  cuts: Array<{ a: string; b: string; flipped: boolean }>;
  /** When true, canvas clicks build cut chords instead of toggling points. */
  cutMode: boolean;
  /** First endpoint of an in-progress cut. */
  cutStartPn: string | null;
  /** Toggle cut mode on/off. */
  onToggleCutMode: () => void;
  /** Toggle which side of a cut is amputated. */
  onFlipCut: (idx: number) => void;
  /** Remove a cut. */
  onRemoveCut: (idx: number) => void;
  /** The single point currently selected on canvas, if any. */
  selectedPoint: SurveyPoint | null;
  /** Remove a point from the hull immediately. */
  onExcludePoint: (pn: string) => void;
  /** Put an excluded point back into the candidate pool immediately. */
  onRestorePoint: (pn: string) => void;
  /** Put every excluded point back into the candidate pool. */
  onRestoreAll: () => void;
  /** Convert the reviewed preview into an inclusion boundary. */
  onDrawInclusion: () => void;
  /** Convert the reviewed preview into a Boundary object in the Boundary Editor. */
  onDrawBoundary: () => void;
  /** Whether the current hull has been committed as an inclusion boundary. */
  isCommitted: boolean;
  /** Remove the shrinkwrap polyline and end the session. */
  onClearShrinkwrap: () => void;
  /** True while the user is drawing an ephemeral lasso. */
  freehandActive: boolean;
  /** Enter/leave the freehand lasso tool. */
  onToggleFreehand: () => void;
}

/**
 * Floating control panel for an active shrinkwrap session.
 *
 * Point edits apply immediately:
 *   - click a hull point (red X on hover) to remove it
 *   - hover a point outside the hull (green +) and click to pin it to the hull
 *   - excluded points stay visible with a red X so they can be restored
 *
 * Freehand mode is an ephemeral grease-pencil lasso: draw a rough loop around
 * the points to keep, and every point outside the loop is excluded at once.
 * The guide disappears on release and is never persisted.
 */
const ShrinkwrapPanel: React.FC<ShrinkwrapPanelProps> = ({
  sourceCount,
  hullCount,
  layer,
  excludedPns,
  concavityK,
  onConcavityChange,
  cuts,
  cutMode,
  cutStartPn,
  onToggleCutMode,
  onFlipCut,
  onRemoveCut,
  selectedPoint,
  onExcludePoint,
  onRestorePoint,
  onRestoreAll,
  onDrawInclusion,
  onDrawBoundary,
  isCommitted,
  onClearShrinkwrap,
  freehandActive,
  onToggleFreehand,
}) => {
  const excludedSet = useMemo(() => new Set(excludedPns), [excludedPns]);
  const selectedIsExcluded = !!selectedPoint && excludedSet.has(selectedPoint.pointNumber);

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
          <div className="font-mono text-base">{excludedPns.length}</div>
        </div>
      </div>

      <div className="text-[11px] text-gray-400 light-theme:text-gray-600 leading-snug">
        Layer: <span className="font-mono text-gray-200 light-theme:text-gray-800">{layer}</span> ·
        {isCommitted ? 'drawn as an inclusion boundary' : 'preview only until drawn as an inclusion or boundary'}.
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

      {/* Point editing — every action is immediate; there is no Update step. */}
      <div className={`rounded border p-2 space-y-2 ${
        cutMode
          ? 'border-red-500/60 bg-red-900/20'
          : freehandActive
            ? 'border-cyan-500/60 bg-cyan-900/20'
            : 'border-violet-700/40 bg-violet-900/10'
      }`}>
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] uppercase tracking-wide">
            <span className={cutMode ? 'text-red-300' : freehandActive ? 'text-cyan-300' : 'text-violet-300'}>
              {cutMode ? 'Mode: Construction Cut' : freehandActive ? 'Mode: Freehand Lasso' : 'Point editing'}
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
            title={cutMode ? 'Exit cut mode and go back to editing points' : 'Strike chord cuts between two points'}
          >
            {cutMode ? 'Exit Cut Mode' : 'Enter Cut Mode'}
          </button>
        </div>

        {cutMode ? (
          <div className="text-[11px] text-red-200 leading-snug">
            {cutStartPn
              ? <>Cut start: <span className="font-mono">{cutStartPn}</span>. Click the second point on the canvas to complete the chord, or tap <span className="font-mono">{cutStartPn}</span> again to cancel.</>
              : <>Click any two points on the canvas to strike a construction cut. The smaller side of the chord is auto-excluded.</>}
          </div>
        ) : (
          <>
            <div className="text-[11px] text-gray-400 light-theme:text-gray-600 leading-snug">
              Click a hull point (red X) to remove it instantly. Hover a point outside the hull for a green + and click to add it.
            </div>

            <button
              type="button"
              onClick={onToggleFreehand}
              className={`w-full px-2 py-1.5 rounded text-[11px] font-semibold border transition-colors ${
                freehandActive
                  ? 'bg-cyan-500 text-gray-950 border-cyan-300 hover:bg-cyan-400'
                  : 'bg-cyan-500/10 text-cyan-200 border-cyan-500/50 hover:bg-cyan-500/20'
              }`}
              title={freehandActive
                ? 'Leave the freehand lasso and return to point editing'
                : 'Draw a rough loop around the points to keep'}
            >
              {freehandActive ? 'Exit Freehand' : 'Freehand'}
            </button>

            {freehandActive ? (
              <div className="text-[11px] text-cyan-200 leading-snug">
                Drag a rough loop around the points you want. Everything outside is excluded when you release; the grease-pencil guide disappears.
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="font-mono text-sm flex-1 truncate">
                  {selectedPoint
                    ? `${selectedPoint.pointNumber}${selectedPoint.description ? ` — ${selectedPoint.description}` : ''}`
                    : <span className="text-gray-500 italic">(click a point on the canvas)</span>}
                </div>
                <button
                  type="button"
                  disabled={!selectedPoint}
                  onClick={() => {
                    if (!selectedPoint) return;
                    if (selectedIsExcluded) onRestorePoint(selectedPoint.pointNumber);
                    else onExcludePoint(selectedPoint.pointNumber);
                  }}
                  className={`px-2 py-1 rounded text-[11px] font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed ${
                    selectedIsExcluded
                      ? 'bg-emerald-600 hover:bg-emerald-500'
                      : 'bg-violet-600 hover:bg-violet-500'
                  }`}
                >
                  {selectedIsExcluded ? 'Restore' : 'Remove'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Excluded points — restore immediately, no staging. */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 light-theme:text-gray-600">
            Excluded points
          </div>
          {excludedPns.length > 0 && (
            <button
              type="button"
              onClick={onRestoreAll}
              className="text-[11px] text-violet-300 hover:text-violet-200 underline"
            >
              Restore all
            </button>
          )}
        </div>
        {excludedPns.length === 0 ? (
          <div className="text-[11px] text-gray-500 italic">None — the hull uses every candidate point.</div>
        ) : (
          <ul className="max-h-40 overflow-auto divide-y divide-gray-700/60 rounded border border-gray-700/60 light-theme:divide-gray-300 light-theme:border-gray-300">
            {excludedPns.map(pn => (
              <li key={pn} className="flex items-center justify-between px-2 py-1 text-xs">
                <span className="font-mono">{pn}</span>
                <button
                  type="button"
                  onClick={() => onRestorePoint(pn)}
                  className="text-[11px] text-emerald-300 hover:text-emerald-200"
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Active construction cuts — list only; builder lives on the canvas. */}
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

      <div className="grid grid-cols-2 gap-2">
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
        <button
          type="button"
          disabled={hullCount < 3}
          onClick={onDrawBoundary}
          className={[
            'w-full px-2 py-2 rounded text-xs font-semibold transition-colors',
            hullCount >= 3
              ? 'border border-amber-500/50 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed',
          ].join(' ')}
          title={hullCount >= 3
            ? 'Convert this shrinkwrap into a Boundary object in the Boundary Editor'
            : 'A shrinkwrap needs at least three vertices'}
        >
          Draw Boundary
        </button>
      </div>

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
