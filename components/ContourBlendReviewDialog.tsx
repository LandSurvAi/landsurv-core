import React, { useEffect } from 'react';
import type { ContourBlendPreview, InclusionBoundary } from '../types.ts';

export interface ContourBlendReviewDialogProps {
  preview: ContourBlendPreview | null;
  /** Why the preview could not be built; null when preview is present. */
  previewError: string | null;
  generationId: string;
  generationName: string;
  boundaries: InclusionBoundary[];
  boundaryPolylineId: string | null;
  maxJoinDistance: number | null;
  onBoundaryChange: (polylineId: string | null) => void;
  onMaxJoinDistanceChange: (distance: number | null) => void;
  /** Called only when the user picks OK. Cancel/dismiss never commit. */
  onApply: () => void;
  onCancel: () => void;
}

function parseDistance(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const StatTile: React.FC<{
  label: string;
  value: number;
  tone?: 'cyan' | 'emerald' | 'amber' | 'rose' | 'slate';
}> = ({ label, value, tone = 'slate' }) => {
  const toneClass = {
    cyan: 'text-cyan-200 border-cyan-400/30 bg-cyan-400/[0.06]',
    emerald: 'text-emerald-200 border-emerald-400/30 bg-emerald-400/[0.06]',
    amber: 'text-amber-200 border-amber-400/30 bg-amber-400/[0.06]',
    rose: 'text-rose-200 border-rose-400/30 bg-rose-400/[0.06]',
    slate: 'text-slate-200 border-white/10 bg-white/[0.03]',
  }[tone];
  return (
    <div className={`rounded-lg border px-2.5 py-2 ${toneClass}`}>
      <div className="font-mono text-[17px] font-bold leading-none">{value.toLocaleString()}</div>
      <div className="mt-1 text-[9px] uppercase tracking-[0.12em] opacity-70">{label}</div>
    </div>
  );
};

/**
 * Mandatory review gate for contour blending.
 *
 * Every blend starts here as a staged proposal. The dialog shows exactly what
 * the canvas is highlighting, exposes boundary and join-distance controls, and
 * only commits when the user selects OK.
 */
export const ContourBlendReviewDialog: React.FC<ContourBlendReviewDialogProps> = ({
  preview,
  previewError,
  generationId,
  generationName,
  boundaries,
  boundaryPolylineId,
  maxJoinDistance,
  onBoundaryChange,
  onMaxJoinDistanceChange,
  onApply,
  onCancel,
}) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  const stats = preview?.stats ?? null;
  const connectorCount = stats?.connectorCount ?? 0;
  const matched = stats?.matchedEndpoints ?? 0;
  const unmatched = stats?.unmatchedGisEndpoints ?? 0;
  const rejected = stats?.rejectedConnectorCount ?? 0;
  const trimmed = preview?.gisTrimmedPaths.length ?? 0;
  const outside = preview?.gisOutsidePaths.length ?? 0;
  const targetCount = preview?.targetGenerationIds.length ?? 0;
  const autoDistance = preview?.autoMaxJoinDistance ?? 0;
  const canApply = Boolean(preview) && Boolean(boundaryPolylineId);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="contour-blend-review-title"
        data-testid={`contour-blend-review-${generationId}`}
        className="flex max-h-[92vh] w-full max-w-[760px] flex-col overflow-hidden rounded-2xl border border-indigo-400/25 bg-[#070e18] shadow-[0_25px_90px_rgba(0,0,0,0.65)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.08] px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-indigo-400/30 bg-indigo-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-indigo-200">
                Preview only
              </span>
              <h2 id="contour-blend-review-title" className="text-[14px] font-bold text-slate-100">
                Review Contour Blend
              </h2>
            </div>
            <p className="mt-1 truncate text-[10.5px] text-slate-400">
              {generationName} <span className="text-slate-600">↔</span> ESRI / State contours
            </p>
            <p className="mt-0.5 text-[9.5px] leading-snug text-amber-200/80">
              Nothing on the drawing changes until you select OK.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel contour blend review"
            className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-slate-400 transition-colors hover:border-white/25 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label htmlFor="contour-blend-boundary" className="mb-1 block text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
                Blend boundary
              </label>
              <select
                id="contour-blend-boundary"
                aria-label="Blend boundary"
                value={boundaryPolylineId ?? ''}
                onChange={event => onBoundaryChange(event.target.value || null)}
                className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] text-slate-100 outline-none focus:border-cyan-400/50"
              >
                <option value="">Select a boundary…</option>
                {boundaries.map(boundary => (
                  <option key={boundary.id} value={boundary.polylineId}>{boundary.name}</option>
                ))}
              </select>
              {preview?.boundaryName && (
                <p className="mt-1 text-[9px] text-slate-500">Highlighted boundary: {preview.boundaryName}</p>
              )}
            </div>

            <div>
              <label htmlFor="contour-blend-max-distance" className="mb-1 block text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
                Maximum join distance (ft)
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  id="contour-blend-max-distance"
                  aria-label="Maximum join distance"
                  type="number"
                  min={1}
                  step={5}
                  value={maxJoinDistance ?? ''}
                  placeholder={autoDistance > 0 ? `Auto (${autoDistance.toFixed(0)})` : 'Auto'}
                  onChange={event => onMaxJoinDistanceChange(parseDistance(event.target.value))}
                  className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-400/50"
                />
                <button
                  type="button"
                  onClick={() => onMaxJoinDistanceChange(null)}
                  aria-pressed={maxJoinDistance === null}
                  className={`rounded-md border px-2 py-1.5 text-[9.5px] font-semibold transition-colors ${
                    maxJoinDistance === null
                      ? 'border-cyan-400/45 bg-cyan-400/12 text-cyan-100'
                      : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-white'
                  }`}
                >
                  Auto
                </button>
              </div>
              <p className="mt-1 text-[9px] leading-snug text-slate-500">
                Caps how far a transition curve can reach for a same-elevation end.
              </p>
            </div>
          </div>

          {previewError ? (
            <div className="rounded-lg border border-rose-400/30 bg-rose-400/[0.08] px-3 py-2.5 text-[10.5px] leading-snug text-rose-100">
              <span className="font-semibold">Blend cannot be previewed.</span> {previewError}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <StatTile label="Transition curves" value={connectorCount} tone="cyan" />
                <StatTile label="Matched ends" value={matched} tone="emerald" />
                <StatTile label="Open ESRI ends" value={unmatched} tone={unmatched > 0 ? 'amber' : 'slate'} />
                <StatTile label="Rejected joins" value={rejected} tone={rejected > 0 ? 'rose' : 'slate'} />
                <StatTile label="ESRI sources" value={targetCount} tone="slate" />
              </div>

              <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
                <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  What OK will perform
                </div>
                <ul className="mt-1.5 space-y-1 text-[10.5px] leading-snug text-slate-300">
                  <li>
                    <span className="text-rose-300">Trim</span> {trimmed.toLocaleString()} ESRI polyline(s) inside{' '}
                    <span className="text-slate-100">{preview?.boundaryName ?? 'the boundary'}</span>.
                  </li>
                  <li>
                    <span className="text-sky-300">Keep</span> {outside.toLocaleString()} ESRI polyline(s) outside the boundary.
                  </li>
                  <li>
                    <span className="text-cyan-300">Draw</span> {connectorCount.toLocaleString()} highlighted transition curve(s)
                    {' '}joining ESRI ends to same-elevation survey contours.
                  </li>
                  <li>
                    <span className="text-amber-300">Leave open</span> {unmatched.toLocaleString()} ESRI end(s) without a rational match.
                  </li>
                  {rejected > 0 && (
                    <li>
                      <span className="text-rose-300">Refuse</span> {rejected.toLocaleString()} implausible join(s) rather than
                      drawing crossing or looping curves.
                    </li>
                  )}
                </ul>
              </div>

              {preview && preview.rejectedJoins.length > 0 && (
                <div className="rounded-lg border border-rose-400/20 bg-rose-400/[0.04] px-3 py-2.5">
                  <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-rose-200/80">
                    Why joins were refused
                  </div>
                  <ul className="mt-1.5 space-y-1 text-[9.5px] leading-snug text-rose-100/80">
                    {Array.from(new Set(preview.rejectedJoins.flatMap(join => join.issues ?? [])))
                      .slice(0, 6)
                      .map(issue => (
                        <li key={issue}>• {issue}</li>
                      ))}
                  </ul>
                  <p className="mt-1 text-[9px] text-slate-500">
                    Red X markers on the canvas show the refused ESRI ends.
                  </p>
                </div>
              )}

              {connectorCount === 0 && (
                <div className="rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2 text-[10px] leading-snug text-amber-100/90">
                  No same-elevation hand-off fits this distance. Widen the maximum join distance, or verify the survey
                  and ESRI contours are visible and at matching elevations. OK would only trim ESRI linework inside the boundary.
                </div>
              )}
            </>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-[9px] text-slate-400">
            <span className="font-bold uppercase tracking-[0.12em] text-slate-500">Canvas legend</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 bg-cyan-300" /> new transition</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rotate-45 border border-amber-600 bg-amber-400" /> open ESRI end</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 border-t border-dotted border-rose-400" /> ESRI trimmed</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 border-t border-dashed border-indigo-400" /> boundary</span>
            <span className="inline-flex items-center gap-1.5"><span className="text-rose-400">✕</span> rejected join</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.08] px-4 py-3">
          <p className="max-w-[360px] text-[9px] leading-snug text-slate-500">
            The blend is applied as a new derived overlay. Source survey and ESRI generations stay intact.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10.5px] font-semibold text-slate-300 transition-colors hover:border-white/25 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onApply}
              disabled={!canApply}
              className="rounded-md border border-cyan-300/50 bg-cyan-400 px-3 py-1.5 text-[10.5px] font-bold text-slate-950 transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {connectorCount === 0 ? 'OK, Apply Trim Only' : 'OK, Apply Blend'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContourBlendReviewDialog;
