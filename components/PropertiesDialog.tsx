import React, { useMemo, useRef, useState } from 'react';
import type { SurveyLine } from '../types';

export interface PropertiesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Currently selected entity ids (SurveyLine.id or `from-to`). */
  selectedIds: string[];
  lines: SurveyLine[];
  availableLayers?: string[];
  /** Apply a property patch to every selected entity. */
  onUpdateLines: (ids: string[], changes: Partial<SurveyLine>) => void;
  onDeleteLines: (ids: string[]) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onConvertToBoundary?: (lines: SurveyLine[]) => void;
}

const LINETYPES = ['CONTINUOUS', 'DASHED', 'HIDDEN', 'CENTER', 'PHANTOM', 'DOT', 'FENCELINE1'];

const lineId = (line: SurveyLine) => line.id || `${line.from}-${line.to}`;

const commonValue = <T,>(values: T[]): T | undefined => {
  if (values.length === 0) return undefined;
  return values.every(value => value === values[0]) ? values[0] : undefined;
};

const entityKind = (line: SurveyLine): 'Circle' | 'Arc' | 'Polyline' | 'Line' => {
  if (line.isCircle) return 'Circle';
  if (line.isCurve) return 'Arc';
  if (line.polylineId) return 'Polyline';
  return 'Line';
};

const segmentLength = (line: SurveyLine): number => {
  if (line.fromPt && line.toPt) {
    return Math.hypot(line.toPt.x - line.fromPt.x, line.toPt.y - line.fromPt.y);
  }
  const parsed = Number(line.distance);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * CAD properties panel for the current selection. Deliberately a floating
 * (non-modal) dialog inside the canvas so the drawing stays visible while
 * values change. Drag the header to move it; it is clamped to the canvas.
 * Every edit applies to the whole selection at once.
 */
export const PropertiesDialog: React.FC<PropertiesDialogProps> = ({
  isOpen,
  onClose,
  selectedIds,
  lines,
  availableLayers,
  onUpdateLines,
  onDeleteLines,
  onSelectAll,
  onClearSelection,
  onConvertToBoundary,
}) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  const selected = useMemo(() => {
    const ids = new Set(selectedIds);
    return lines.filter(line => ids.has(lineId(line)));
  }, [lines, selectedIds]);

  const counts = useMemo(() => {
    const result = { Line: 0, Arc: 0, Circle: 0, Polyline: 0 };
    selected.forEach(line => { result[entityKind(line)] += 1; });
    return result;
  }, [selected]);

  const totalLength = useMemo(
    () => selected.reduce((sum, line) => sum + (line.isCircle ? 0 : segmentLength(line)), 0),
    [selected],
  );

  const layerCommon = commonValue(selected.map(line => line.layer ?? ''));
  const colorCommon = commonValue(selected.map(line => line.color ?? ''));
  const linetypeCommon = commonValue(selected.map(line => line.lineType ?? 'CONTINUOUS'));
  const scaleCommon = commonValue(selected.map(line => line.lineTypeScale ?? 1));
  const hiddenCommon = commonValue(selected.map(line => !!line.hidden));

  const handleDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    // Let the close button (and other header controls) behave normally.
    if ((event.target as HTMLElement | null)?.closest('button')) return;
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const parentRect = (panel.offsetParent as HTMLElement | null)?.getBoundingClientRect();
    dragRef.current = { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    setPosition({ left: rect.left - (parentRect?.left ?? 0), top: rect.top - (parentRect?.top ?? 0) });
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDragMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const panel = panelRef.current;
    if (!drag || !panel) return;
    const parentRect = (panel.offsetParent as HTMLElement | null)?.getBoundingClientRect();
    const boundsLeft = parentRect?.left ?? 0;
    const boundsTop = parentRect?.top ?? 0;
    const maxLeft = Math.max(8, (parentRect?.width ?? window.innerWidth) - panel.offsetWidth - 8);
    const maxTop = Math.max(8, (parentRect?.height ?? window.innerHeight) - panel.offsetHeight - 8);
    setPosition({
      left: Math.min(maxLeft, Math.max(8, event.clientX - boundsLeft - drag.offsetX)),
      top: Math.min(maxTop, Math.max(8, event.clientY - boundsTop - drag.offsetY)),
    });
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDragEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch { /* ignore */ }
  };

  if (!isOpen) return null;

  const ids = selected.map(lineId);
  const count = selected.length;
  const single = count === 1 ? selected[0] : null;
  const mixed = <span className="text-amber-300/90">(mixed)</span>;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Properties"
      data-canvas-ui="properties"
      onMouseMove={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
      onWheel={event => event.stopPropagation()}
      className="absolute z-[80] w-[340px] max-w-[calc(100%-1.5rem)] max-h-[72vh] overflow-y-auto rounded-xl border border-cyan-500/40 bg-gray-950/95 text-xs text-gray-200 shadow-2xl backdrop-blur-md cursor-default"
      style={position ? { left: position.left, top: position.top } : { right: 12, top: 64 }}
    >
      <div
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
        className="flex touch-none select-none items-center justify-between border-b border-cyan-500/20 px-3 py-2 cursor-grab active:cursor-grabbing"
        title="Drag to move"
      >
        <div>
          <div className="text-[10px] uppercase tracking-wider text-cyan-400">Properties</div>
          <div className="font-semibold text-gray-100">
            {count === 0 ? 'No selection' : count === 1 ? '1 entity selected' : `${count} entities selected`}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
          title="Close properties"
          aria-label="Close properties"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="space-y-3 p-3">
        {count === 0 ? (
          <div className="rounded-lg border border-gray-700/60 bg-gray-900/60 p-3 text-gray-400">
            Select entities on the canvas to inspect and edit their properties.
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={onSelectAll}
                className="rounded-md bg-cyan-700 px-2 py-1 text-[11px] font-medium text-white hover:bg-cyan-600"
              >
                Select all
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg border border-gray-700/60 bg-gray-900/60 p-2 font-mono text-[11px]">
              <span className="text-gray-400">Lines</span><span>{counts.Line}</span>
              <span className="text-gray-400">Arcs</span><span>{counts.Arc}</span>
              <span className="text-gray-400">Circles</span><span>{counts.Circle}</span>
              <span className="text-gray-400">Polyline segs</span><span>{counts.Polyline}</span>
              <span className="text-gray-400">Segment length</span>
              <span>{totalLength > 0 ? `${totalLength.toFixed(2)} ft` : '—'}</span>
              {single && (
                <>
                  <span className="text-gray-400">From → To</span>
                  <span className="truncate" title={`${single.from} → ${single.to}`}>
                    {single.from} → {single.to}
                  </span>
                  {single.bearing && (<><span className="text-gray-400">Bearing</span><span>{single.bearing}</span></>)}
                  {single.distance && (<><span className="text-gray-400">Distance</span><span>{single.distance}</span></>)}
                  {single.curveRadius ? (<><span className="text-gray-400">Radius</span><span>{single.curveRadius.toFixed(2)}</span></>) : null}
                </>
              )}
            </div>

            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-gray-400">Layer</span>
              <select
                value={layerCommon === undefined ? '__mixed__' : layerCommon}
                onChange={event => onUpdateLines(ids, { layer: event.target.value || undefined })}
                className="w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5 font-mono text-cyan-200 outline-none focus:border-cyan-500"
              >
                {layerCommon === undefined && <option value="__mixed__" disabled>(mixed)</option>}
                <option value="">(no layer)</option>
                {(availableLayers ?? []).map(layer => <option key={layer} value={layer}>{layer}</option>)}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wider text-gray-400">Color</span>
                <div className="flex items-center gap-1">
                  <input
                    type="color"
                    value={colorCommon || '#22d3ee'}
                    onChange={event => onUpdateLines(ids, { color: event.target.value })}
                    className="h-8 w-10 cursor-pointer rounded border border-gray-600 bg-gray-800 p-0.5"
                    title="Entity color"
                  />
                  <button
                    type="button"
                    onClick={() => onUpdateLines(ids, { color: undefined })}
                    className="rounded border border-gray-600 px-1.5 py-1 text-[10px] text-gray-300 hover:bg-gray-800"
                    title="Clear explicit color (use layer color)"
                  >
                    ByLayer
                  </button>
                </div>
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wider text-gray-400">Linetype</span>
                <select
                  value={linetypeCommon ?? '__mixed__'}
                  onChange={event => onUpdateLines(ids, { lineType: event.target.value })}
                  className="w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5 font-mono text-cyan-200 outline-none focus:border-cyan-500"
                >
                  {linetypeCommon === undefined && <option value="__mixed__" disabled>(mixed)</option>}
                  {LINETYPES.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-gray-400">Linetype scale</span>
              <input
                type="number"
                min={0.01}
                step={0.1}
                value={scaleCommon ?? ''}
                placeholder={scaleCommon === undefined ? 'mixed' : '1.0'}
                onChange={event => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value) && value > 0) onUpdateLines(ids, { lineTypeScale: value });
                }}
                className="w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5 font-mono text-cyan-200 outline-none focus:border-cyan-500"
              />
            </label>

            <div className="flex flex-wrap items-center gap-2 border-t border-gray-700/60 pt-2">
              <button
                type="button"
                onClick={() => onUpdateLines(ids, { hidden: true })}
                className="rounded-md border border-gray-600 px-2 py-1 text-[11px] text-gray-200 hover:bg-gray-800"
              >
                Hide
              </button>
              <button
                type="button"
                onClick={() => onUpdateLines(ids, { hidden: false })}
                className="rounded-md border border-gray-600 px-2 py-1 text-[11px] text-gray-200 hover:bg-gray-800"
              >
                Show
              </button>
              {hiddenCommon !== undefined && (
                <span className="text-[10px] text-gray-500">{hiddenCommon ? 'Currently hidden' : 'Currently visible'}</span>
              )}
            </div>

            {onConvertToBoundary && (
              <button
                type="button"
                onClick={() => onConvertToBoundary(selected)}
                className="w-full rounded-md bg-amber-700 px-2 py-1.5 text-[11px] font-medium text-white hover:bg-amber-600"
              >
                Convert to Boundary ({count})
              </button>
            )}

            <div className="flex items-center justify-between gap-2 border-t border-gray-700/60 pt-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onSelectAll}
                  className="rounded-md border border-cyan-600/60 px-2 py-1 text-[11px] text-cyan-300 hover:bg-cyan-950/60"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={onClearSelection}
                  className="rounded-md border border-gray-600 px-2 py-1 text-[11px] text-gray-300 hover:bg-gray-800"
                >
                  Clear
                </button>
              </div>
              <button
                type="button"
                onClick={() => onDeleteLines(ids)}
                className="rounded-md border border-red-700/70 bg-red-950/60 px-2 py-1 text-[11px] font-medium text-red-300 hover:bg-red-900/60"
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PropertiesDialog;
