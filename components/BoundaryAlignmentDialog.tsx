import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { BoundaryFile } from '../types.ts';
import {
  AdjustmentsHorizontalIcon,
  ArrowDownOnSquareIcon,
  ArrowTopRightOnSquareIcon,
  MapPinIcon,
  XMarkIcon,
} from './icons.tsx';

export interface BoundaryAlignmentDialogProps {
  file: BoundaryFile;
  boundaryFileCount: number;
  selectedPointNumber?: string;
  showRotatedBearings: boolean;
  isDocked: boolean;
  onDockChange: (docked: boolean) => void;
  onClose: () => void;
  onTransformChange?: (fileId: string, patch: { translationE?: number | null; translationN?: number | null; rotationDeg?: number | null }) => void;
  onPobChange?: (fileId: string, patch: { pointNumber?: string; pobOverride?: { easting: number; northing: number } | null }) => void;
  onAssociatePoints?: (fileId: string, pointIds: string[]) => void;
  onDisassociatePoint?: (fileId: string, pointId: string) => void;
  onBestFitToPoints?: (fileId: string) => void;
  onAlignToOtherBoundary?: (fileId: string) => void;
  onAlignCornersToPoints?: (fileId: string) => void;
  onAlignToGIS?: (fileId: string) => void;
  onShowRotatedBearingsChange?: (next: boolean) => void;
}

const fieldClass =
  'w-full h-7 rounded-md border border-white/15 bg-[#060d17] px-2 font-mono text-[11px] font-bold text-white shadow-inner outline-none transition-colors focus:border-cyan-400/70';

const actionClass =
  'inline-flex items-center justify-center gap-1 rounded-md border px-2 py-1 text-[10px] font-bold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40';

const chipTone = {
  emerald: 'border-emerald-400/35 bg-emerald-400/10 text-emerald-200',
  sky: 'border-sky-400/35 bg-sky-400/10 text-sky-200',
  cyan: 'border-cyan-400/35 bg-cyan-400/10 text-cyan-200',
  amber: 'border-amber-400/35 bg-amber-400/10 text-amber-200',
  neutral: 'border-white/10 bg-white/[0.03] text-white/50',
  muted: 'border-white/10 bg-white/[0.02] text-white/35',
} as const;

const STEP_TONES = [
  { active: 'border-emerald-400/45 bg-emerald-400/10 text-emerald-200', dot: 'bg-emerald-300' },
  { active: 'border-sky-400/45 bg-sky-400/10 text-sky-200', dot: 'bg-sky-300' },
  { active: 'border-amber-400/45 bg-amber-400/10 text-amber-200', dot: 'bg-amber-300' },
] as const;

/**
 * Boundary alignment/POB tools live outside the traverse panel so the panel can
 * stay narrow and focused on bearings & distances. This dialog defaults to
 * floating over the canvas and can be pinned into the tool shelf.
 */
export const BoundaryAlignmentDialog: React.FC<BoundaryAlignmentDialogProps> = ({
  file,
  boundaryFileCount,
  selectedPointNumber,
  showRotatedBearings,
  isDocked,
  onDockChange,
  onClose,
  onTransformChange,
  onPobChange,
  onAssociatePoints,
  onDisassociatePoint,
  onBestFitToPoints,
  onAlignToOtherBoundary,
  onAlignCornersToPoints,
  onAlignToGIS,
  onShowRotatedBearingsChange,
}) => {
  const [associateInput, setAssociateInput] = useState('');
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const associated = file.associatedPointIds ?? [];
  const pobPointNumber = file.calls[0]?.from?.trim() ?? '';
  const hasTransform = Boolean(file.translationE || file.translationN || file.rotationDeg);
  const hasCalls = file.calls.some(call => Boolean(call.bearing && call.distance));

  const suggestedStep = useMemo(() => {
    if (!hasCalls) return 0;
    if (!hasTransform) return 1;
    return 2;
  }, [hasCalls, hasTransform]);

  const defaultPos = useCallback(() => ({
    x: Math.max(12, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 386),
    y: 96,
  }), []);
  const current = pos ?? defaultPos();

  const handleDragStart = useCallback((event: React.MouseEvent) => {
    if (isDocked) return;
    if ((event.target as HTMLElement).closest('button, input, select')) return;
    event.preventDefault();
    dragState.current = {
      startX: event.clientX,
      startY: event.clientY,
      origX: current.x,
      origY: current.y,
    };
    const onMove = (moveEvent: MouseEvent) => {
      if (!dragState.current) return;
      setPos({
        x: Math.max(8, Math.min(window.innerWidth - 120, dragState.current.origX + moveEvent.clientX - dragState.current.startX)),
        y: Math.max(8, Math.min(window.innerHeight - 80, dragState.current.origY + moveEvent.clientY - dragState.current.startY)),
      });
    };
    const onUp = () => {
      dragState.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [current.x, current.y, isDocked]);

  const addPoints = () => {
    if (!onAssociatePoints) return;
    const pointIds = associateInput.split(/[,\s]+/).map(value => value.trim()).filter(Boolean);
    if (pointIds.length === 0) return;
    onAssociatePoints(file.id, pointIds);
    setAssociateInput('');
  };

  const stepChip = (step: number, label: string) => {
    const active = suggestedStep === step;
    const tone = STEP_TONES[step] ?? STEP_TONES[0];
    return (
      <span
        key={label}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[8.5px] font-bold uppercase tracking-wide ${
          active ? tone.active : chipTone.muted
        }`}
      >
        {active && <span className={`h-1 w-1 animate-pulse rounded-full ${tone.dot}`} />}
        {step + 1} {label}
      </span>
    );
  };

  return (
    <div
      data-testid="boundary-alignment-dialog"
      style={isDocked ? undefined : { left: current.x, top: current.y }}
      className={
        isDocked
          ? 'flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#0a0f16] text-xs text-slate-200'
          : 'fixed z-[9600] flex max-h-[calc(100vh-2rem)] w-[372px] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-xl border border-white/[0.12] bg-[#0a0f16]/97 text-xs text-slate-200 shadow-2xl shadow-black/60 backdrop-blur-md'
      }
    >
      <div
        onMouseDown={handleDragStart}
        className={`flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.08] bg-[#070e18] px-2.5 py-2 ${
          isDocked ? '' : 'cursor-grab active:cursor-grabbing'
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-sky-400/25 bg-sky-400/10">
            <AdjustmentsHorizontalIcon className="h-3.5 w-3.5 text-sky-300" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[11px] font-bold text-white">Alignment tools</h3>
            <p className="truncate text-[8.5px] font-medium uppercase tracking-[0.12em] text-slate-500">
              {file.name}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1" data-no-drag>
          <div className="inline-flex items-center rounded border border-white/15 bg-black/30 p-0.5">
            <button
              type="button"
              onClick={() => onDockChange(false)}
              className={`rounded px-1.5 py-0.5 text-[9px] font-semibold transition-colors ${
                !isDocked ? 'bg-cyan-500/20 text-cyan-200' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Float this dialog over the canvas"
            >
              Float
            </button>
            <button
              type="button"
              onClick={() => onDockChange(true)}
              className={`rounded px-1.5 py-0.5 text-[9px] font-semibold transition-colors ${
                isDocked ? 'bg-cyan-500/20 text-cyan-200' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Dock this dialog in the tool shelf"
            >
              Dock
            </button>
          </div>
          <button
            type="button"
            onClick={() => onDockChange(!isDocked)}
            className="rounded border border-white/[0.07] p-1 text-slate-400 transition-colors hover:border-white/[0.16] hover:text-cyan-300"
            title={isDocked ? 'Pop out to a floating dialog' : 'Dock into the tool shelf'}
            aria-label={isDocked ? 'Pop out alignment tools' : 'Dock alignment tools'}
          >
            {isDocked
              ? <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
              : <ArrowDownOnSquareIcon className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-white/[0.07] p-1 text-slate-400 transition-colors hover:border-rose-400/30 hover:bg-rose-500/10 hover:text-rose-300"
            title="Close alignment tools"
            aria-label="Close alignment tools"
          >
            <XMarkIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 border-b border-white/[0.06] px-2.5 py-1">
        {stepChip(0, 'POB')}
        <span className={`text-[9px] ${suggestedStep === 1 ? 'text-sky-300 animate-pulse' : 'text-white/20'}`}>→</span>
        {stepChip(1, 'Shift')}
        <span className={`text-[9px] ${suggestedStep === 2 ? 'text-amber-300 animate-pulse' : 'text-white/20'}`}>→</span>
        {stepChip(2, 'Align')}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-white/[0.06] px-2.5 py-1">
        <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide ${pobPointNumber ? chipTone.emerald : chipTone.muted}`}>
          <MapPinIcon className="h-2.5 w-2.5" />
          {pobPointNumber ? `POB #${pobPointNumber}` : 'POB unset'}
        </span>
        <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide ${associated.length > 0 ? chipTone.sky : chipTone.muted}`}>
          {associated.length} pt{associated.length === 1 ? '' : 's'}
        </span>
        <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide ${chipTone.neutral}`}>
          {file.calls.length} call{file.calls.length === 1 ? '' : 's'}
        </span>
        <span className={`ml-auto inline-flex items-center rounded-full border px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide ${isDocked ? chipTone.emerald : chipTone.cyan}`}>
          {isDocked ? 'Docked' : 'Floating'}
        </span>
      </div>

      <div className={`min-h-0 flex-1 space-y-2.5 overflow-y-auto px-2.5 py-2 ${isDocked ? '' : 'max-h-[calc(100vh-10rem)]'}`}>
        {onPobChange && (
          <section className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <MapPinIcon className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-white/75">
                Point of beginning
              </span>
              {suggestedStep === 0 && <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-300" />}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <label className="space-y-0.5">
                <span className="block text-[8px] font-bold uppercase tracking-wide text-white/35">Point #</span>
                <input
                  key={`pob-pn-${file.id}-${file.calls[0]?.from ?? ''}`}
                  type="text"
                  defaultValue={file.calls[0]?.from ?? ''}
                  onBlur={event => {
                    const value = event.currentTarget.value.trim();
                    const currentValue = file.calls[0]?.from ?? '';
                    if (value !== currentValue) onPobChange(file.id, { pointNumber: value });
                  }}
                  onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                  className={fieldClass}
                  placeholder="1"
                />
              </label>
              <label className="space-y-0.5">
                <span className="block text-[8px] font-bold uppercase tracking-wide text-white/35">Northing</span>
                <input
                  key={`pob-n-${file.id}-${file.pobOverride?.northing ?? 'none'}`}
                  type="number"
                  step="0.01"
                  defaultValue={file.pobOverride?.northing ?? ''}
                  onBlur={event => {
                    const value = event.currentTarget.value.trim();
                    const easting = file.pobOverride?.easting;
                    if (value === '') {
                      if (file.pobOverride) onPobChange(file.id, { pobOverride: null });
                      return;
                    }
                    const northing = parseFloat(value);
                    if (!Number.isFinite(northing)) return;
                    onPobChange(file.id, {
                      pobOverride: {
                        northing,
                        easting: typeof easting === 'number' && Number.isFinite(easting) ? easting : 0,
                      },
                    });
                  }}
                  onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                  className={`${fieldClass} text-emerald-300`}
                  placeholder="0.00"
                />
              </label>
              <label className="space-y-0.5">
                <span className="block text-[8px] font-bold uppercase tracking-wide text-white/35">Easting</span>
                <input
                  key={`pob-e-${file.id}-${file.pobOverride?.easting ?? 'none'}`}
                  type="number"
                  step="0.01"
                  defaultValue={file.pobOverride?.easting ?? ''}
                  onBlur={event => {
                    const value = event.currentTarget.value.trim();
                    const northing = file.pobOverride?.northing;
                    if (value === '') {
                      if (file.pobOverride) onPobChange(file.id, { pobOverride: null });
                      return;
                    }
                    const easting = parseFloat(value);
                    if (!Number.isFinite(easting)) return;
                    onPobChange(file.id, {
                      pobOverride: {
                        easting,
                        northing: typeof northing === 'number' && Number.isFinite(northing) ? northing : 0,
                      },
                    });
                  }}
                  onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                  className={`${fieldClass} text-emerald-300`}
                  placeholder="0.00"
                />
              </label>
            </div>
          </section>
        )}

        {onTransformChange && (
          <section className="space-y-1.5 border-t border-white/[0.07] pt-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <AdjustmentsHorizontalIcon className="h-3.5 w-3.5 text-sky-400" />
                <span className="text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-white/75">
                  Shift &amp; rotation
                </span>
                {suggestedStep === 1 && <span className="h-1 w-1 animate-pulse rounded-full bg-sky-300" />}
              </div>
              {hasTransform && (
                <button
                  type="button"
                  onClick={() => onTransformChange(file.id, { translationE: null, translationN: null, rotationDeg: null })}
                  className="text-[9px] font-bold text-sky-300 underline-offset-2 hover:text-sky-200 hover:underline"
                >
                  Reset
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <label className="space-y-0.5">
                <span className="block text-[8px] font-bold uppercase tracking-wide text-white/35">ΔE</span>
                <input
                  type="number"
                  step="0.01"
                  value={file.translationE ?? ''}
                  onChange={event => {
                    const value = event.target.value.trim();
                    onTransformChange(file.id, { translationE: value === '' ? null : parseFloat(value) });
                  }}
                  className={`${fieldClass} text-sky-300`}
                  placeholder="0.00"
                />
              </label>
              <label className="space-y-0.5">
                <span className="block text-[8px] font-bold uppercase tracking-wide text-white/35">ΔN</span>
                <input
                  type="number"
                  step="0.01"
                  value={file.translationN ?? ''}
                  onChange={event => {
                    const value = event.target.value.trim();
                    onTransformChange(file.id, { translationN: value === '' ? null : parseFloat(value) });
                  }}
                  className={`${fieldClass} text-sky-300`}
                  placeholder="0.00"
                />
              </label>
              <label className="space-y-0.5">
                <span className="block text-[8px] font-bold uppercase tracking-wide text-white/35">Rotation°</span>
                <input
                  type="number"
                  step="0.001"
                  value={file.rotationDeg ?? ''}
                  onChange={event => {
                    const value = event.target.value.trim();
                    onTransformChange(file.id, { rotationDeg: value === '' ? null : parseFloat(value) });
                  }}
                  className={`${fieldClass} text-sky-300`}
                  placeholder="0.00"
                />
              </label>
            </div>
            {Boolean(file.rotationDeg) && onShowRotatedBearingsChange && (
              <button
                type="button"
                onClick={() => onShowRotatedBearingsChange(!showRotatedBearings)}
                className={`w-full rounded-md border px-2 py-1 text-[9.5px] font-bold transition-colors ${
                  showRotatedBearings
                    ? 'border-sky-400/60 bg-sky-600/30 text-sky-100'
                    : 'border-white/15 bg-white/[0.03] text-white/55 hover:border-white/25 hover:text-white/80'
                }`}
              >
                {showRotatedBearings ? 'Canvas labels: rotated bearings' : 'Canvas labels: original deed bearings'}
              </button>
            )}
          </section>
        )}

        <section className="space-y-1.5 border-t border-white/[0.07] pt-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-white/75">
              Field points &amp; alignment
            </span>
            {suggestedStep === 2 && <span className="h-1 w-1 animate-pulse rounded-full bg-amber-300" />}
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {onAlignCornersToPoints && (
              <button
                type="button"
                onClick={() => onAlignCornersToPoints(file.id)}
                className={`${actionClass} border-amber-400/50 bg-amber-600/20 text-amber-100 hover:bg-amber-600/35 ${
                  suggestedStep === 2 ? 'ring-1 ring-amber-400/30' : ''
                }`}
                title="Pick a deed corner on canvas, then the found point it belongs on"
              >
                ⌖ Align corners
              </button>
            )}
            {onAlignToOtherBoundary && boundaryFileCount >= 2 && (
              <button
                type="button"
                onClick={() => onAlignToOtherBoundary(file.id)}
                className={`${actionClass} border-blue-400/40 bg-blue-600/20 text-blue-100 hover:bg-blue-600/35`}
                title="Align this deed to another boundary on the canvas"
              >
                ↔ Align to deed
              </button>
            )}
            {onAlignToGIS && hasCalls && (
              <button
                type="button"
                onClick={() => onAlignToGIS(file.id)}
                className={`${actionClass} border-cyan-400/40 bg-cyan-600/20 text-cyan-100 hover:bg-cyan-600/35`}
                title="Match the deed to a county GIS parcel"
              >
                Align to GIS
              </button>
            )}
          </div>

          {onAssociatePoints && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <input
                  value={associateInput}
                  onChange={event => setAssociateInput(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter') addPoints(); }}
                  placeholder="Point #s (101, 102)"
                  className={`${fieldClass} flex-1 font-sans font-medium`}
                />
                {selectedPointNumber && (
                  <button
                    type="button"
                    onClick={() => onAssociatePoints(file.id, [selectedPointNumber])}
                    className={`${actionClass} border-sky-400/50 bg-sky-500/20 text-sky-100 hover:bg-sky-500/30`}
                    title={`Associate selected canvas point #${selectedPointNumber}`}
                  >
                    + #{selectedPointNumber}
                  </button>
                )}
                <button
                  type="button"
                  onClick={addPoints}
                  disabled={!associateInput.trim()}
                  className={`${actionClass} border-blue-400/50 bg-blue-600/25 text-blue-100 hover:bg-blue-600/40`}
                >
                  Add
                </button>
              </div>

              {associated.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  {associated.map(pointNumber => (
                    <span
                      key={pointNumber}
                      className="inline-flex items-center gap-1 rounded-full border border-blue-400/40 bg-blue-900/40 px-1.5 py-0.5 font-mono text-[9px] font-bold text-blue-100"
                    >
                      #{pointNumber}
                      {onDisassociatePoint && (
                        <button
                          type="button"
                          onClick={() => onDisassociatePoint(file.id, pointNumber)}
                          className="text-blue-300 transition-colors hover:text-rose-300"
                          title={`Disassociate point #${pointNumber}`}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}

              {onBestFitToPoints && associated.length >= 1 && (
                <button
                  type="button"
                  onClick={() => onBestFitToPoints(file.id)}
                  className={`${actionClass} w-full border-sky-400/50 bg-sky-600/25 text-sky-100 hover:bg-sky-600/40 ${
                    associated.length >= 2 ? 'animate-pulse' : ''
                  }`}
                  title="Run a Helmert best-fit from deed vertices to associated field points"
                >
                  Best fit using {associated.length} point{associated.length === 1 ? '' : 's'}
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-white/[0.07] bg-[#070e18]/80 px-2.5 py-1.5">
        <span className="text-[8.5px] leading-tight text-white/35">
          {hasCalls
            ? 'POB anchors the deed. Shift/rotate or best-fit to found evidence.'
            : 'Add bearing & distance calls in the panel to enable alignment.'}
        </span>
      </div>
    </div>
  );
};

export default BoundaryAlignmentDialog;
