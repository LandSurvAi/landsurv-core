import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { BoundaryFile, DeedSummary, DeedTractSummary } from '../types.ts';
import { SectionChip } from './common/SectionChip.tsx';
import { findBoundaryFileForTract } from '../utils/boundaryTractFiles.ts';

export interface A2UIBoundarySummaryProps {
  summary: DeedSummary;
  files: BoundaryFile[];
  computingTractIds?: Set<string>;
  activeFileId?: string;
  onProcessSelected: (tractIds: string[]) => void;
  /** Fallback when the light summary pass detected no separate descriptions. */
  onParseFullDeed?: () => void;
  onOpenEditor: (fileId?: string) => void;
  onOpenDescription?: (tractId: string, snippet?: string) => void;
  /** A2UI surface controls (chat/toolshelf/floating/fullscreen/minimize). */
  actions?: React.ReactNode;
}

type TractState = 'pending' | 'computing' | 'ready' | 'drafted';

function stateForTract(
  tract: DeedTractSummary,
  file: BoundaryFile | undefined,
  computing: Set<string>
): TractState {
  if (computing.has(tract.tractId)) return 'computing';
  if (!file) return 'pending';
  if ((file.drawnPointIds?.length ?? 0) > 0 || (file.drawnLineIds?.length ?? 0) > 0) return 'drafted';
  return 'ready';
}

const stateStyle: Record<TractState, { dot: string; label: string; pill: string }> = {
  pending: {
    dot: 'bg-sky-400',
    label: 'Ready to process',
    pill: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
  },
  computing: {
    dot: 'bg-sky-400 animate-pulse',
    label: 'Extracting calls',
    pill: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
  },
  ready: {
    dot: 'bg-cyan-400',
    label: 'Calls ready',
    pill: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200',
  },
  drafted: {
    dot: 'bg-emerald-400',
    label: 'Drafted to CAD',
    pill: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  },
};

/**
 * Chat-first Boundary Agent summary. One card per deed, always rendered inline
 * as an A2UI surface. It stays linked to BoundaryEditor state: tract rows flip
 * from pending -> extracting -> calls ready -> drafted without a second panel.
 */
export const A2UIBoundarySummary: React.FC<A2UIBoundarySummaryProps> = ({
  summary,
  files,
  computingTractIds,
  activeFileId,
  onProcessSelected,
  onParseFullDeed,
  onOpenEditor,
  onOpenDescription,
  actions,
}) => {
  const computing = computingTractIds ?? new Set<string>();
  const summaryKey = useMemo(
    () => `${summary.fileName}::${summary.tracts.map(tract => tract.tractId).join('|')}`,
    [summary.fileName, summary.tracts]
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastKeyRef = useRef<string>('');

  useEffect(() => {
    if (lastKeyRef.current === summaryKey) return;
    lastKeyRef.current = summaryKey;
    // Preselect descriptions that still need a heavy parse. Computed rows stay
    // unchecked so "Process selected" never re-runs work by accident.
    const pending = summary.tracts
      .filter(tract => !findBoundaryFileForTract(files, tract, summary.fileName))
      .map(tract => tract.tractId);
    setSelected(new Set(pending));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryKey]);

  const rows = summary.tracts.map(tract => {
    const file = findBoundaryFileForTract(files, tract, summary.fileName);
    const state = stateForTract(tract, file, computing);
    return { tract, file, state };
  });

  const pendingRows = rows.filter(row => row.state === 'pending');
  const readyRows = rows.filter(row => row.state === 'ready' || row.state === 'drafted');
  const selectedPending = rows.filter(row => row.state === 'pending' && selected.has(row.tract.tractId));
  const activeReady = readyRows.find(row => row.file?.id === activeFileId) ?? readyRows[0];

  const toggle = (tractId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(tractId)) next.delete(tractId);
      else next.add(tractId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedPending.length === pendingRows.length && pendingRows.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pendingRows.map(row => row.tract.tractId)));
    }
  };

  const meta = [
    summary.grantor ? { label: 'Grantor', value: summary.grantor } : null,
    summary.owner ? { label: 'Grantee', value: summary.owner } : null,
    summary.parcelId ? { label: 'Parcel', value: summary.parcelId } : null,
    summary.book ? { label: 'Book / Pg', value: `${summary.book}${summary.page ? ` / ${summary.page}` : ''}` } : null,
  ].filter((entry): entry is { label: string; value: string } => Boolean(entry));

  return (
    <div
      data-testid="a2ui-boundary-summary"
      className="panel-surface relative overflow-hidden rounded-xl border border-cyan-400/20 bg-[#070e18]/90 p-3 shadow-lg shadow-cyan-950/20"
    >
      <SectionChip color="summary" />

      <div className="flex flex-wrap items-start justify-between gap-2 pl-1.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-[0.16em] text-cyan-300">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
              Deed summary
            </span>
            <span className="rounded border border-cyan-400/25 bg-cyan-400/10 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-cyan-200">
              {summary.tracts.length === 1 ? '1 description' : `${summary.tracts.length} descriptions`}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[12px] font-bold text-white" title={summary.fileName}>
            {summary.fileName}
          </p>
        </div>
        <div className="flex max-w-full shrink-0 items-start gap-1.5">
          {actions}
          {readyRows.length > 0 && (
            <button
              type="button"
              data-no-drag
              onClick={() => onOpenEditor(activeReady?.file?.id)}
              className="black-hole-btn black-hole-btn--emerald inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[10px] font-bold text-white transition-colors"
              title="Open the bearing & distance interface"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Open bearing &amp; distance
              <span aria-hidden="true">→</span>
            </button>
          )}
        </div>
      </div>

      {meta.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 pl-1.5">
          {meta.map(entry => (
            <span
              key={entry.label}
              className="inline-flex max-w-full items-center gap-1 rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[9px]"
            >
              <span className="font-bold uppercase tracking-wide text-white/35">{entry.label}</span>
              <span className="truncate font-semibold text-white/80">{entry.value}</span>
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 pl-1.5">
        <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/40">
          Descriptions
        </span>
        <button
          type="button"
          data-no-drag
          onClick={toggleAll}
          disabled={pendingRows.length === 0}
          className="text-[9px] font-semibold text-cyan-300/80 transition-colors hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pendingRows.length > 0 && selectedPending.length === pendingRows.length ? 'Clear selection' : 'Select pending'}
        </button>
      </div>

      <div className="mt-1 max-h-[340px] space-y-1 overflow-y-auto pl-1.5 pr-0.5">
        {rows.length === 0 && (
          <div className="rounded-lg border border-sky-400/25 bg-sky-400/[0.06] p-2">
            <p className="text-[10px] leading-snug text-sky-100/80">
              No separate descriptions were detected. Parse the full deed to draft the boundary calls.
            </p>
            {onParseFullDeed && (
              <button
                type="button"
                data-no-drag
                onClick={onParseFullDeed}
                className="mt-1.5 inline-flex h-7 items-center gap-1.5 rounded-md border border-sky-400/50 bg-sky-500/20 px-2.5 text-[10px] font-bold text-sky-100 transition-colors hover:bg-sky-500/30 hover:text-white"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-300" />
                Parse full deed <span aria-hidden="true">▶</span>
              </button>
            )}
          </div>
        )}
        {rows.map(({ tract, file, state }) => {
          const style = stateStyle[state];
          const isSelected = selected.has(tract.tractId);
          const isPending = state === 'pending';
          const isActive = Boolean(file && file.id === activeFileId);
          const stateLabel = state === 'pending' && tract.reason ? 'Needs source' : style.label;
          const textToOpen = tract.snippet?.trim() || tract.reason?.trim() || tract.tractName?.trim() || tract.tractId;
          return (
            <div
              key={tract.tractId}
              className={`rounded-lg border transition-colors ${
                isActive
                  ? 'border-cyan-400/45 bg-cyan-400/[0.07]'
                  : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.16]'
              }`}
            >
              <div className="flex items-start gap-2 p-1.5">
                {isPending ? (
                  <button
                    type="button"
                    data-no-drag
                    onClick={() => toggle(tract.tractId)}
                    aria-pressed={isSelected}
                    aria-label={`Select ${tract.tractId}`}
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[9px] font-black transition-colors ${
                      isSelected
                        ? 'border-sky-400 bg-sky-400 text-gray-950'
                        : 'border-white/25 bg-black/20 text-transparent hover:border-sky-300/70'
                    }`}
                  >
                    ✓
                  </button>
                ) : (
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.dot}`} title={stateLabel} />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-[11px] font-bold text-white">{tract.tractId}</span>
                    {tract.tractName && tract.tractName !== tract.tractId && (
                      <span className="truncate text-[10px] text-white/55">{tract.tractName}</span>
                    )}
                    {tract.acreage && (
                      <span className="rounded border border-emerald-400/25 bg-emerald-400/10 px-1 py-0.5 font-mono text-[8.5px] font-bold text-emerald-200">
                        {tract.acreage}
                      </span>
                    )}
                    {tract.sourcePage != null && (
                      <span className="font-mono text-[8.5px] text-white/40">p.{tract.sourcePage}</span>
                    )}
                    {file && file.calls.length > 0 && (
                      <span className="font-mono text-[8.5px] text-cyan-300/70">
                        {file.calls.length} call{file.calls.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>

                  {tract.snippet && (
                    <button
                      type="button"
                      data-no-drag
                      onClick={() => onOpenDescription?.(tract.tractId, tract.snippet)}
                      disabled={!onOpenDescription}
                      aria-label={onOpenDescription ? `Open ${tract.tractId} description in the Text Editor` : undefined}
                      className={`mt-0.5 block max-w-full truncate text-left font-mono text-[9px] italic leading-relaxed text-white/40 transition-colors ${
                        onOpenDescription ? 'hover:text-white/75' : 'cursor-default'
                      }`}
                      title={onOpenDescription ? 'Open this description in the text editor' : tract.snippet}
                    >
                      “{tract.snippet}”
                    </button>
                  )}

                  {tract.reason && (
                    <p className="mt-0.5 flex items-start gap-1 text-[9px] leading-snug text-sky-200/70">
                      <span className="mt-[3px] h-1 w-1 shrink-0 rounded-full bg-sky-300/70" aria-hidden="true" />
                      <span className="min-w-0 break-words">{tract.reason}</span>
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  {onOpenDescription && (
                    <button
                      type="button"
                      data-no-drag
                      onClick={() => onOpenDescription(tract.tractId, textToOpen)}
                      aria-label={`Open ${tract.tractId} text in the Text Editor`}
                      title="Open this description in the text editor"
                      className="rounded border border-cyan-400/25 bg-cyan-400/[0.05] px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-cyan-200/75 transition-colors hover:border-cyan-400/50 hover:text-cyan-100"
                    >
                      TXT
                    </button>
                  )}
                  <span className={`rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${style.pill}`}>
                    {state === 'computing' ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1.5 w-1.5 animate-spin rounded-full border border-sky-300 border-t-transparent" />
                        {stateLabel}
                      </span>
                    ) : (
                      stateLabel
                    )}
                  </span>
                  {file && (state === 'ready' || state === 'drafted') && (
                    <button
                      type="button"
                      data-no-drag
                      onClick={() => onOpenEditor(file.id)}
                      className="rounded border border-white/10 px-1.5 py-0.5 text-[8.5px] font-semibold text-white/55 transition-colors hover:border-cyan-400/40 hover:text-cyan-200"
                    >
                      {state === 'drafted' ? 'Edit' : 'Open'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] pt-2 pl-1.5">
        <span className="text-[9px] text-white/40">
          {selectedPending.length > 0
            ? `${selectedPending.length} selected for full parse`
            : readyRows.length > 0
              ? 'Calls are ready in the panel'
              : 'Select descriptions to extract bearings & distances'}
        </span>
        <div className="flex items-center gap-1.5">
          {pendingRows.length > 0 && (
            <button
              type="button"
              data-no-drag
              disabled={selectedPending.length === 0}
              onClick={() => onProcessSelected(selectedPending.map(row => row.tract.tractId))}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-sky-400/50 bg-sky-500/20 px-2.5 text-[10px] font-bold text-sky-100 transition-all hover:border-sky-300/70 hover:bg-sky-500/30 hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {selectedPending.length > 0 && (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-300" />
              )}
              Process selected{selectedPending.length > 0 ? ` (${selectedPending.length})` : ''}
              <span aria-hidden="true">▶</span>
            </button>
          )}
          {pendingRows.length === 0 && readyRows.length > 0 && (
            <button
              type="button"
              data-no-drag
              onClick={() => onOpenEditor(activeReady?.file?.id)}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-emerald-400/50 bg-emerald-500/20 px-2.5 text-[10px] font-bold text-emerald-100 transition-colors hover:border-emerald-300/70 hover:bg-emerald-500/30 hover:text-white"
            >
              Open bearing &amp; distance <span aria-hidden="true">→</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default A2UIBoundarySummary;
