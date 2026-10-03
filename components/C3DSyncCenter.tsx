/**
 * C3D Sync Center — the webapp half of the LandSurv.ai ⇄ Civil 3D sync engine.
 *
 * Lifecycle (webapp-initiated):
 *   1. Open → sendToC3D('get_sync_snapshot') pulls the CAD side (real CogoPoints
 *      when the DLL runs inside Civil 3D, DBPoint+XData otherwise).
 *   2. Diff per category against live React state via c3dSyncProtocol.
 *   3. Direction questions per category: "Use from CAD / LandSurv.ai / merge".
 *   4. Review diff grid with per-row overrides (deletes only ever explicit).
 *   5. Confirm summary (typed DELETE when deletions exist) → sendToC3D
 *      ('sync_apply', { plan, lsaiSnapshot }, longTimeout) — the relay mutex
 *      prevents concurrent applies from either side.
 *   6. Live progress via sync_* relay events; on completion the returned
 *      cadSnapshot becomes the new baseline (persisted to localStorage).
 *
 * It also answers the OTHER direction: when the DLL sync wizard sends
 * sync_lsai_apply, the center applies the LSAI-side actions into React state
 * (inside one canvas-history transaction so it's a single undo) and replies
 * with sync_lsai_result.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppState } from '../contexts/AppStateContext.tsx';
import type { PointList, SurveyLine, CustomSymbol, StreetLabel, ParcelLabel } from '../types.ts';
import {
  C3DSyncCategory,
  C3DSyncDirection,
  C3DSyncAction,
  C3DSyncItemState,
  C3DSyncSnapshot,
  CategoryDiff,
  SyncApplyPlan,
  SyncBaseline,
  diffPoints,
  diffLayers,
  diffLinework,
  diffAnnotations,
  diffSymbols,
  buildCategoryPlan,
  summarizePlan,
  BULK_DELETE_THRESHOLD,
  C3DPointRecord,
  C3DLayerRecord,
  C3DLineRecord,
  C3DAnnotationRecord,
  C3DBlockRecord,
} from '../services/c3dSyncProtocol.ts';
import { C3DSyncDiffGrid, resolveOverrideAction, type OverrideIntent } from './C3DSyncDiffGrid.tsx';
import type { C3DSyncEvent } from '../hooks/useC3DStateSync.ts';

// ── Types ────────────────────────────────────────────────────────────────────

type WizardStep = 'loading' | 'directions' | 'review' | 'confirm' | 'applying' | 'done';

export interface C3DSyncCenterProps {
  isOpen: boolean;
  onClose: () => void;
  isC3DConnected: boolean;
  sendToC3D: <T = any>(tool: string, args: Record<string, any>, timeoutMs?: number) => Promise<T>;
  /** Live React state slices (same ones useC3DStateSync serializes). */
  pointLists: PointList[];
  lines: SurveyLine[];
  centerlines: SurveyLine[];
  customSymbols: CustomSymbol[];
  streetLabels: StreetLabel[];
  parcelLabels: ParcelLabel[];
  cadLayers: Array<{ name: string; color?: string; lineType?: string; lineWeight?: number }>;
  /**
   * Applies the LSAI-side actions (create-lsai/update-lsai/delete-lsai) into React
   * state. App.tsx wraps the whole batch in canvasHistory.withLabel(...) so the
   * sync is one undo entry. Returns a short human-readable summary.
   */
  applyLsaiActions: (
    plan: SyncApplyPlan,
    cadSnapshot: C3DSyncSnapshot,
  ) => { summary: string; applied: number; failed: number };
  /** Baseline persistence (keyed by drawing name when known). */
  loadBaseline: () => SyncBaseline | null;
  saveBaseline: (baseline: SyncBaseline) => void;
}

const CATEGORIES: Array<{ id: C3DSyncCategory; title: string; question: string }> = [
  { id: 'points', title: 'Points', question: 'Which points should be used?' },
  { id: 'layers', title: 'Layers', question: 'Which layers should be used?' },
  { id: 'linework', title: 'Linework (incl. curves)', question: 'Which linework should be used?' },
  { id: 'annotation', title: 'Annotation', question: 'Which annotations should be used?' },
  { id: 'symbols', title: 'Symbols / Blocks', question: 'Which symbol definitions should be used?' },
];

const SYNC_APPLY_TIMEOUT_MS = 10 * 60 * 1000; // big applies can run minutes in CAD

// ── Component ────────────────────────────────────────────────────────────────

export const C3DSyncCenter: React.FC<C3DSyncCenterProps> = ({
  isOpen,
  onClose,
  isC3DConnected,
  sendToC3D,
  pointLists,
  lines,
  centerlines,
  customSymbols,
  streetLabels,
  parcelLabels,
  cadLayers,
  applyLsaiActions,
  loadBaseline,
  saveBaseline,
}) => {
  const { addNotification } = useAppState();
  const notify = useCallback((title: string, message: string, severity: 'info' | 'error' | 'warning' = 'info') => {
    addNotification({ kind: 'c3d-sync', severity, title, message });
  }, [addNotification]);

  const [step, setStep] = useState<WizardStep>('loading');
  const [error, setError] = useState<string | null>(null);
  const [cadSnapshot, setCadSnapshot] = useState<C3DSyncSnapshot | null>(null);
  const [isCivil3D, setIsCivil3D] = useState(false);
  const [drawingName, setDrawingName] = useState('');
  const [directions, setDirections] = useState<Record<C3DSyncCategory, C3DSyncDirection>>({
    points: 'merge', layers: 'merge', linework: 'merge', annotation: 'merge', symbols: 'merge',
  });
  const [overrides, setOverrides] = useState<Record<string, Map<string, C3DSyncAction>>>({});
  const [activeCategory, setActiveCategory] = useState<C3DSyncCategory>('points');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [progress, setProgress] = useState<{ current: number; total: number; phase: string; message: string } | null>(null);
  const [applyResult, setApplyResult] = useState<{ applied: number; failed: number; skipped: number; backup?: string } | null>(null);

  // ── LSAI side snapshot from live React state ──────────────────────────────
  const lsaiSnapshot = useMemo<C3DSyncSnapshot>(() => ({
    points: pointLists.flatMap(list => list.points.map(p => ({
      pointNumber: p.pointNumber,
      easting: p.easting,
      northing: p.northing,
      elevation: p.elevation,
      description: p.description || '',
    })) satisfies C3DPointRecord[]),
    layers: cadLayers.map(l => ({
      name: l.name,
      color: l.color ?? null,
      lineType: l.lineType ?? null,
      lineWeight: l.lineWeight ?? null,
    })) satisfies C3DLayerRecord[],
    linework: buildLsaiLinework(lines, centerlines),
    annotations: buildLsaiAnnotations(streetLabels, parcelLabels),
    symbols: customSymbols.filter(s => !s.hidden).map(s => ({
      name: s.name,
      svgPath: s.svgPath,
      viewBox: s.viewBox,
      scale: s.scale,
    })) satisfies C3DBlockRecord[],
  }), [pointLists, cadLayers, lines, centerlines, streetLabels, parcelLabels, customSymbols]);

  // ── Load CAD snapshot when opened ─────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setStep('loading');
    setError(null);
    setApplyResult(null);
    setProgress(null);

    if (!isC3DConnected) {
      setError('Civil 3D is not connected. Connect the connector DLL first.');
      setStep('loading');
      return;
    }

    sendToC3D<{ success: boolean; error?: string; civil3d?: boolean; drawing?: string; snapshot?: C3DSyncSnapshot }>(
      'get_sync_snapshot', {}, 60000,
    ).then(res => {
      if (cancelled) return;
      if (!res?.success || !res.snapshot) {
        setError(res?.error || 'Failed to read the CAD drawing.');
        return;
      }
      setCadSnapshot(res.snapshot);
      setIsCivil3D(res.civil3d === true);
      setDrawingName(res.drawing ?? '');
      setStep('directions');
    }).catch(err => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : String(err));
    });

    return () => { cancelled = true; };
  }, [isOpen, isC3DConnected, sendToC3D]);

  // ── Diff (memoized; baseline-aware) ───────────────────────────────────────
  const diffs = useMemo(() => {
    if (!cadSnapshot) return null;
    const baseline = loadBaseline();
    return {
      points: diffPoints(cadSnapshot.points, lsaiSnapshot.points, baseline?.points),
      layers: diffLayers(cadSnapshot.layers, lsaiSnapshot.layers, baseline?.layers),
      linework: diffLinework(cadSnapshot.linework, lsaiSnapshot.linework, baseline?.linework),
      annotation: diffAnnotations(cadSnapshot.annotations, lsaiSnapshot.annotations, baseline?.annotations),
      symbols: diffSymbols(cadSnapshot.symbols, lsaiSnapshot.symbols, baseline?.symbols),
    } as Record<C3DSyncCategory, CategoryDiff<any>>;
  }, [cadSnapshot, lsaiSnapshot, loadBaseline]);

  // ── Planned actions per category (direction + overrides) ──────────────────
  const plannedActions = useMemo(() => {
    const map = new Map<C3DSyncCategory, Map<string, C3DSyncAction>>();
    if (!diffs) return map;
    for (const cat of CATEGORIES) {
      const plan = buildCategoryPlan(diffs[cat.id], directions[cat.id], overrides[cat.id]);
      map.set(cat.id, new Map(plan.entries.map(e => [e.key, e.action])));
    }
    return map;
  }, [diffs, directions, overrides]);

  const totalPending = useMemo(() => {
    if (!diffs) return 0;
    return CATEGORIES.reduce((sum, c) => {
      const d = diffs[c.id];
      return sum + d.entries.filter(e => e.state !== 'equal').length;
    }, 0);
  }, [diffs]);

  // ── Build the apply plan ──────────────────────────────────────────────────
  const buildPlan = useCallback((): SyncApplyPlan => {
    const plan: SyncApplyPlan = {
      planId: `plan-${Date.now()}`,
      categories: [],
    };
    if (!diffs) return plan;
    for (const cat of CATEGORIES) {
      const categoryPlan = buildCategoryPlan(diffs[cat.id], directions[cat.id], overrides[cat.id]);
      if (categoryPlan.entries.length > 0) plan.categories.push(categoryPlan);
    }
    return plan;
  }, [diffs, directions, overrides]);

  const planSummary = useMemo(() => summarizePlan(buildPlan()), [buildPlan]);

  // ── Overrides ─────────────────────────────────────────────────────────────
  const handleOverride = useCallback((category: C3DSyncCategory, key: string | null, intent: OverrideIntent) => {
    setOverrides(prev => {
      const next = { ...prev };
      const catMap = new Map(next[category] ?? new Map<string, C3DSyncAction>());
      const diff = diffs?.[category];
      if (!diff) return prev;

      const applyTo = (entryKey: string, state: C3DSyncItemState) => {
        const action = resolveOverrideAction(state, intent);
        if (action) catMap.set(entryKey, action);
      };

      if (key != null) {
        const entry = diff.entries.find(e => e.key === key);
        if (entry) applyTo(entry.key, entry.state);
      } else {
        for (const e of diff.entries) if (e.state !== 'equal') applyTo(e.key, e.state);
      }
      next[category] = catMap;
      return next;
    });
  }, [diffs]);

  // ── Apply ─────────────────────────────────────────────────────────────────
  const runApply = useCallback(async () => {
    const plan = buildPlan();
    setStep('applying');
    setProgress({ current: 0, total: planSummary.creates + planSummary.updates + planSummary.deletes, phase: 'starting', message: 'Contacting Civil 3D…' });

    try {
      const res = await sendToC3D<{
        success: boolean; applied: number; failed: number; skipped: number; backup?: string;
        cadSnapshot?: C3DSyncSnapshot;
      }>('sync_apply', { plan, lsaiSnapshot }, SYNC_APPLY_TIMEOUT_MS);

      // CAD side done → apply the LSAI-side actions into React state.
      let lsaiNote = '';
      try {
        const lsaiResult = applyLsaiActions(plan, (res.cadSnapshot as C3DSyncSnapshot) ?? cadSnapshot!);
        lsaiNote = lsaiResult.summary;
      } catch (lsaiErr) {
        lsaiNote = `LandSurv.ai side error: ${lsaiErr instanceof Error ? lsaiErr.message : String(lsaiErr)}`;
      }

      // Persist baseline for next sync's conflict detection.
      saveBaseline((res.cadSnapshot as C3DSyncSnapshot) ?? cadSnapshot!);

      setApplyResult({ applied: res.applied, failed: res.failed, skipped: res.skipped, backup: res.backup });
      setStep('done');
      notify('C3D Sync Complete',
        `CAD: ${res.applied} applied, ${res.failed} failed. ${lsaiNote}`.trim(),
        res.failed === 0 ? 'info' : 'error');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setStep('directions');
      notify('C3D Sync Failed', msg, 'error');
    }
  }, [buildPlan, planSummary, sendToC3D, lsaiSnapshot, cadSnapshot, applyLsaiActions, saveBaseline, notify]);

  const handleConfirm = useCallback(() => {
    if (planSummary.deletes > 0 && deleteConfirmText.trim() !== 'DELETE') return;
    void runApply();
  }, [planSummary.deletes, deleteConfirmText, runApply]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (!isOpen) return null;

  const needsDeleteConfirm = planSummary.deletes > 0;
  const maxDeletesInCategory = Math.max(
    0,
    ...Object.values(planSummary.deletesByCategory),
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl max-h-[88vh] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800/70 border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-2.5">
            <SyncGlyph />
            <div>
              <div className="text-sm font-bold text-gray-100">Civil 3D Sync</div>
              <div className="text-[10px] text-gray-500">
                {drawingName ? `${drawingName} · ` : ''}{isCivil3D ? 'Civil 3D (CogoPoints)' : 'AutoCAD (points)'}
              </div>
            </div>
          </div>
          <button onClick={onClose} disabled={step === 'applying'}
            className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-100 disabled:opacity-30">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-grow min-h-0 overflow-y-auto">
          {step === 'loading' && (
            <div className="px-6 py-10 text-center">
              {error ? (
                <>
                  <div className="text-red-400 text-sm font-semibold mb-1">Cannot sync</div>
                  <div className="text-gray-400 text-[12px]">{error}</div>
                </>
              ) : (
                <>
                  <div className="text-cyan-300 text-sm font-semibold mb-1 animate-pulse">Reading the CAD drawing…</div>
                  <div className="text-gray-500 text-[12px]">Comparing points, layers, linework, annotations, and symbols.</div>
                </>
              )}
            </div>
          )}

          {step === 'directions' && diffs && (
            <div className="px-4 py-3">
              <p className="text-[11px] text-gray-400 mb-3">
                Choose what to sync and which side wins for each category.
                Nothing is deleted or overwritten without your explicit choice.
              </p>
              {CATEGORIES.map(cat => {
                const d = diffs[cat.id];
                const pending = d.entries.filter(e => e.state !== 'equal').length;
                return (
                  <div key={cat.id}
                    className={`mb-2.5 rounded-lg border px-3 py-2.5 ${
                      pending === 0 ? 'border-gray-800 bg-gray-800/30' : 'border-gray-700 bg-gray-800/60'
                    }`}>
                    <div className="flex items-baseline justify-between">
                      <div className={`text-[12px] font-semibold ${pending === 0 ? 'text-gray-500' : 'text-gray-100'}`}>
                        {cat.title}
                      </div>
                      <div className="text-[10px] text-gray-500">
                        {pending === 0 ? 'in sync' : `${pending} difference${pending === 1 ? '' : 's'}`}
                      </div>
                    </div>
                    {pending > 0 && (
                      <div className="mt-1.5 space-y-1">
                        <div className="text-[10px] text-gray-500 mb-0.5">{cat.question}</div>
                        <DirectionRadio cat={cat.id} value="merge" label="Merge them together (safest — creates missing on both sides)"
                          directions={directions} setDirections={setDirections} />
                        <DirectionRadio cat={cat.id} value="cad-wins" label={`Use from CAD (updates LandSurv.ai)`}
                          directions={directions} setDirections={setDirections} />
                        <DirectionRadio cat={cat.id} value="lsai-wins" label={`Use from LandSurv.ai (updates CAD)`}
                          directions={directions} setDirections={setDirections} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {step === 'review' && diffs && (
            <div className="flex flex-col h-full min-h-0">
              {/* Category tabs */}
              <div className="flex gap-1 px-3 pt-2.5 pb-0 shrink-0 flex-wrap">
                {CATEGORIES.map(cat => {
                  const d = diffs[cat.id];
                  const pending = d.entries.filter(e => e.state !== 'equal').length;
                  const active = activeCategory === cat.id;
                  return (
                    <button key={cat.id}
                      onClick={() => setActiveCategory(cat.id)}
                      disabled={pending === 0}
                      className={`px-2.5 py-1 rounded-t text-[10.5px] font-medium border-b-2 transition-colors ${
                        active
                          ? 'border-cyan-400 text-cyan-300 bg-gray-800/70'
                          : pending === 0
                            ? 'border-transparent text-gray-600 cursor-default'
                            : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-800/40'
                      }`}>
                      {cat.title}{pending > 0 ? ` (${pending})` : ''}
                    </button>
                  );
                })}
              </div>
              <div className="flex-grow min-h-0 border-t border-gray-700/50">
                <C3DSyncDiffGrid
                  diff={diffs[activeCategory]}
                  plannedActions={plannedActions.get(activeCategory) ?? new Map()}
                  onOverride={(key, intent) => handleOverride(activeCategory, key, intent)}
                />
              </div>
            </div>
          )}

          {step === 'confirm' && (
            <div className="px-4 py-4">
              <div className="rounded-lg bg-gray-800/60 border border-gray-700 p-3 font-mono text-[12px] text-gray-200 whitespace-pre-wrap">
{`  SYNC PLAN SUMMARY
  ────────────────────────────────────────
  Create:  ${String(planSummary.creates).padStart(4)}   (new items)
  Update:  ${String(planSummary.updates).padStart(4)}   (existing items overwritten on one side)
  Delete:  ${String(planSummary.deletes).padStart(4)}   (explicitly chosen by you)
  Skip:    ${String(planSummary.skips).padStart(4)}   (untouched)

  Per-category direction:
${CATEGORIES.filter(c => diffs && diffs[c.id].entries.some(e => e.state !== 'equal'))
  .map(c => `    ${c.title.padEnd(26)} ${directions[c.id]}`).join('\n')}

  A backup of the current CAD state is written before anything
  changes, and the LandSurv.ai side is one undo away.`}
              </div>

              {needsDeleteConfirm && (
                <div className="mt-3 rounded-lg border border-red-700/60 bg-red-950/40 p-3">
                  <div className="text-[12px] font-bold text-red-300 mb-1">
                    ⚠ This plan includes {planSummary.deletes} deletion{planSummary.deletes === 1 ? '' : 's'}.
                  </div>
                  <div className="text-[11px] text-red-200/80 mb-2">
                    Deletions permanently remove items. Type <span className="font-mono font-bold">DELETE</span> to confirm.
                    {maxDeletesInCategory > BULK_DELETE_THRESHOLD &&
                      ` (Bulk delete: ${maxDeletesInCategory} in one category.)`}
                  </div>
                  <input
                    value={deleteConfirmText}
                    onChange={e => setDeleteConfirmText(e.target.value)}
                    placeholder="Type DELETE"
                    className="w-full px-2.5 py-1.5 rounded bg-gray-900 border border-red-700/60 text-red-100 text-[12px] font-mono focus:outline-none focus:border-red-500"
                  />
                </div>
              )}
            </div>
          )}

          {step === 'applying' && (
            <div className="px-6 py-10 text-center">
              <div className="text-cyan-300 text-sm font-semibold mb-2">Applying sync…</div>
              {progress && progress.total > 0 && (
                <>
                  <div className="w-full h-2 rounded bg-gray-800 overflow-hidden mb-2">
                    <div className="h-full bg-cyan-500 transition-all"
                      style={{ width: `${Math.min(100, (progress.current / progress.total) * 100)}%` }} />
                  </div>
                  <div className="text-[11px] text-gray-400">
                    {progress.phase}: {progress.current}/{progress.total} — {progress.message}
                  </div>
                </>
              )}
              {!progress && <div className="text-gray-500 text-[12px] animate-pulse">Contacting Civil 3D…</div>}
            </div>
          )}

          {step === 'done' && applyResult && (
            <div className="px-6 py-8 text-center">
              <div className={`text-sm font-bold mb-1 ${applyResult.failed === 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                {applyResult.failed === 0 ? '✓ Sync complete' : `Sync finished with ${applyResult.failed} failure(s)`}
              </div>
              <div className="text-[12px] text-gray-400">
                {applyResult.applied} applied · {applyResult.skipped} skipped
              </div>
              {applyResult.backup && (
                <div className="mt-3 text-[10px] text-gray-600 break-all font-mono">
                  CAD backup: {applyResult.backup}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800/70 border-t border-gray-700 shrink-0">
          <div className="text-[10px] text-gray-500">
            {step !== 'loading' && totalPending === 0 ? 'Everything is in sync.' : `${totalPending} difference${totalPending === 1 ? '' : 's'} pending`}
          </div>
          <div className="flex items-center gap-2">
            {step === 'directions' && (
              <button onClick={() => setStep('review')} disabled={totalPending === 0}
                className="px-3.5 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-[12px] font-semibold disabled:opacity-30">
                Review Differences →
              </button>
            )}
            {step === 'review' && (
              <>
                <button onClick={() => setStep('directions')}
                  className="px-3 py-1.5 rounded border border-gray-600 text-gray-300 text-[12px] hover:bg-gray-700">
                  ← Back
                </button>
                <button onClick={() => { setDeleteConfirmText(''); setStep('confirm'); }}
                  className="px-3.5 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-[12px] font-semibold">
                  Review Plan →
                </button>
              </>
            )}
            {step === 'confirm' && (
              <>
                <button onClick={() => setStep('review')}
                  className="px-3 py-1.5 rounded border border-gray-600 text-gray-300 text-[12px] hover:bg-gray-700">
                  ← Back
                </button>
                <button onClick={handleConfirm} disabled={needsDeleteConfirm && deleteConfirmText.trim() !== 'DELETE'}
                  className="px-3.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[12px] font-bold disabled:opacity-30">
                  Apply Sync
                </button>
              </>
            )}
            {step === 'done' && (
              <button onClick={onClose}
                className="px-3.5 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-100 text-[12px] font-semibold">
                Close
              </button>
            )}
            {(step === 'loading' || step === 'directions' || step === 'review' || step === 'confirm') && (
              <button onClick={onClose}
                className="px-3 py-1.5 rounded border border-gray-600 text-gray-400 text-[12px] hover:bg-gray-700">
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Direction radio ──────────────────────────────────────────────────────────

function DirectionRadio({ cat, value, label, directions, setDirections }: {
  cat: C3DSyncCategory;
  value: C3DSyncDirection;
  label: string;
  directions: Record<C3DSyncCategory, C3DSyncDirection>;
  setDirections: React.Dispatch<React.SetStateAction<Record<C3DSyncCategory, C3DSyncDirection>>>;
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer text-[11px] text-gray-300 hover:text-gray-100">
      <input
        type="radio"
        name={`dir-${cat}`}
        checked={directions[cat] === value}
        onChange={() => setDirections(prev => ({ ...prev, [cat]: value }))}
        className="mt-0.5 accent-cyan-500"
      />
      <span>{label}</span>
    </label>
  );
}

function SyncGlyph() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  );
}

// ── LSAI-side snapshot builders (mirrors WebappStateMapper on the DLL) ──────

function buildLsaiLinework(lines: SurveyLine[], centerlines: SurveyLine[]): C3DLineRecord[] {
  const all = [...(lines ?? []), ...(centerlines ?? [])].filter(l => !l.hidden);
  const groups = new Map<string, SurveyLine[]>();
  let standalone = 0;
  for (const line of all) {
    if (isExcludedLineworkLayer(line.layer)) continue;
    if (!line.fromPt || !line.toPt) continue;
    let key = line.polylineId;
    if (!key) key = `seg:${line.id ?? `lsai-line-${standalone++}`}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(line);
  }

  const records: C3DLineRecord[] = [];
  for (const [id, segments] of groups) {
    const rec = buildLineRecord(id, segments);
    if (rec && rec.vertices.length >= 2) records.push(rec);
  }
  return records;
}

function isExcludedLineworkLayer(layer?: string): boolean {
  if (!layer) return false;
  const n = layer.toUpperCase();
  return n.includes('LEGEND') || n.includes('ANNO') || n.includes('LABEL') || n.includes('SYMBOL');
}

/** Chain segments sharing a polylineId into an ordered vertex list, bulge from curve params.
 *  Mirrors WebappStateMapper.BuildLineRecord on the DLL. */
function buildLineRecord(id: string, segments: SurveyLine[]): C3DLineRecord | null {
  if (segments.length === 1) {
    const seg = segments[0];
    return {
      id,
      layer: seg.layer ?? null,
      closed: false,
      vertices: [
        { x: seg.fromPt!.x, y: seg.fromPt!.y, bulge: computeBulge(seg) },
        { x: seg.toPt!.x, y: seg.toPt!.y },
      ],
    };
  }

  const byFrom = new Map<string, SurveyLine>();
  for (const s of segments) if (s.from && !byFrom.has(s.from)) byFrom.set(s.from, s);

  const tos = new Set(segments.map(s => s.to).filter(Boolean) as string[]);
  const head = segments.find(s => !s.from || !tos.has(s.from)) ?? segments[0];

  const ordered: SurveyLine[] = [];
  const visited = new Set<SurveyLine>();
  let current: SurveyLine | undefined = head;
  while (current && !visited.has(current)) {
    visited.add(current);
    ordered.push(current);
    current = current.to ? byFrom.get(current.to) : undefined;
  }
  for (const s of segments) if (!visited.has(s)) ordered.push(s);

  const vertices: Array<{ x: number; y: number; bulge?: number }> = ordered.map(seg => ({ x: seg.fromPt!.x, y: seg.fromPt!.y, bulge: computeBulge(seg) }));
  const lastTo = ordered[ordered.length - 1]?.toPt;
  if (lastTo) vertices.push({ x: lastTo.x, y: lastTo.y });

  let closed = false;
  if (vertices.length >= 3) {
    const first = vertices[0];
    const last = vertices[vertices.length - 1];
    if (Math.abs(first.x - last.x) <= 1e-4 && Math.abs(first.y - last.y) <= 1e-4) {
      closed = true;
      vertices.pop();
    }
  }

  return { id, layer: head.layer ?? null, closed, vertices };
}

/** Bulge from LSAI curve params. Positive = CCW (left), negative = CW (right). */
function computeBulge(seg: SurveyLine): number | undefined {
  if (!seg.isCurve || !seg.curveRadius || seg.curveRadius <= 0) return undefined;

  let theta: number;
  if (seg.arcLength && seg.arcLength > 0) {
    theta = seg.arcLength / seg.curveRadius;
  } else if (seg.chordDistance) {
    const chord = typeof seg.chordDistance === 'number' ? seg.chordDistance : parseFloat(seg.chordDistance);
    if (!(chord > 0) || chord > 2 * seg.curveRadius) return undefined;
    theta = 2 * Math.asin(chord / (2 * seg.curveRadius));
  } else {
    return undefined;
  }

  let bulge = Math.tan(theta / 4);
  if (seg.curveDirection === 'right') bulge = -bulge;
  return bulge;
}

function buildLsaiAnnotations(streetLabels: StreetLabel[], parcelLabels: ParcelLabel[]): C3DAnnotationRecord[] {
  const records: C3DAnnotationRecord[] = [];
  for (const s of streetLabels ?? []) {
    records.push({
      id: `street:${s.text.trim().toUpperCase()}@${Math.round(s.x * 10) / 10},${Math.round(s.y * 10) / 10}`,
      kind: 'street-label',
      x: s.x, y: s.y, angle: s.angle, text: s.text, layer: 'V-ANNO-STREET',
    });
  }
  for (const p of parcelLabels ?? []) {
    let text = `N/F ${p.owner ?? 'UNKNOWN'}`;
    if (p.parcelId) text += `\nParcel ${p.parcelId}`;
    if (p.deedRef) text += `\n${p.deedRef}`;
    records.push({
      id: `parcel:${p.id ?? `${Math.round(p.x * 10) / 10},${Math.round(p.y * 10) / 10}`}`,
      kind: 'parcel-label',
      x: p.x, y: p.y, angle: p.angle, text, layer: 'V-ANNO-PARCEL',
    });
  }
  return records;
}

export default C3DSyncCenter;
