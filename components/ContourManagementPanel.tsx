/**
 * ContourManagementPanel
 *
 * Floating/deed-docked panel that manages every ContourGeneration in the
 * session. Each born generation is rendered as its own deed-style chip card:
 * a colored left rail, black-hole button chrome, and an explicit A2UI hand-off
 * so an agent can pull that single generation into chat without the full
 * history. The panel itself keeps its dock/close controls; the chips do not.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { type ContourBlendStats, type ContourGeneration, type InclusionBoundary } from '../types.ts';
import { ArrowTopRightOnSquareIcon, ArrowDownOnSquareIcon } from './icons.tsx';
import { DockModeControl, type DockMode } from './DockModeControl.tsx';
import {
  ChipCard,
  SectionChip,
  CHIP_INPUT_CLASS,
  CHIP_FIELD_LABEL_CLASS,
  chipButtonClass,
} from './common/SectionChip.tsx';

interface ContourManagementPanelProps {
  generations: ContourGeneration[];
  inclusionBoundaries: InclusionBoundary[];
  onToggleVisible: (id: string, visible: boolean) => void;
  onRename: (id: string, name: string) => void;
  onSetColor: (id: string, color: string | undefined) => void;
  onSetOpacity: (id: string, opacity: number) => void;
  onToggleEsriBlend: (id: string, enabled: boolean) => void;
  /** Stage a blend proposal for review. Apply only happens from the dialog's OK. */
  onPreviewEsriBlend: (id: string, options?: { boundaryPolylineId?: string | null; maxJoinDistance?: number | null }) => void;
  /** Latest automatic stitch result for each survey generation. */
  blendStatsById?: Record<string, ContourBlendStats>;
  /** Generation currently staged in the review dialog, if any. */
  blendPreviewGenerationId?: string | null;
  onCreateTinFromGeneration?: (id: string) => void;
  creatingTinGenerationId?: string | null;
  recentlyCreatedTinGenerationId?: string | null;
  onDelete: (id: string) => void;
  onNewGeneration: () => void;
  /** Raise one born generation as an A2UI chip in chat. */
  onOpenGenerationChip?: (id: string) => void;
  /** Contour-label strike tools, shared with the generation panel. */
  labelCount?: number;
  labelTool?: 'place' | 'erase' | null;
  onSetLabelTool?: (tool: 'place' | 'erase' | null) => void;
  onClearContourLabels?: () => void;
  onAutoLabelContours?: () => void;
  /** Re-expand and reveal a generation selected on the canvas. */
  focusRequest?: { id: string; token: number } | null;
  onClose?: () => void;
  isDocked?: boolean;
  onToggleDock?: () => void;
  dockMode?: DockMode;
  onDockModeChange?: (mode: DockMode) => void;
}

const GENERATION_COLORS = [
  '#f59e0b', // amber (default survey)
  '#3b82f6', // blue
  '#10b981', // emerald
  '#ef4444', // red
  '#a855f7', // purple
  '#f97316', // orange
  '#06b6d4', // cyan
  '#ec4899', // pink
];

function blendStatusText(stats: ContourBlendStats | undefined): { text: string; className: string } {
  if (!stats) {
    return { text: 'Recalculating blend…', className: 'text-indigo-300/70' };
  }
  if (stats.status === 'no-boundary') {
    return {
      text: 'Boundary geometry is unavailable. Redraw or reselect the inclusion boundary.',
      className: 'text-amber-300/90',
    };
  }
  if (stats.status === 'no-esri') {
    return {
      text: 'No visible ESRI/State contour generation to blend.',
      className: 'text-amber-300/90',
    };
  }
  const rejected = stats.rejectedConnectorCount ?? 0;
  const rejectionNote = rejected > 0
    ? ` ${rejected} implausible join(s) rejected instead of drawing crossing or looping curves.`
    : '';
  if (stats.connectorCount === 0) {
    return {
      text: rejected > 0
        ? `Blend active.${rejectionNote}`
        : 'Blend active. No same-elevation ESRI ends are close enough to a survey contour yet.',
      className: 'text-amber-300/90',
    };
  }
  const openEnds = stats.unmatchedGisEndpoints > 0
    ? ` ${stats.unmatchedGisEndpoints} ESRI end(s) remain open.`
    : '';
  return {
    text: `Auto-joined ${stats.matchedEndpoints} ESRI end(s) with ${stats.connectorCount} transition curve(s).${openEnds}${rejectionNote}`,
    className: rejected > 0 ? 'text-amber-200/90' : 'text-emerald-300/90',
  };
}

export const ContourManagementPanel: React.FC<ContourManagementPanelProps> = ({
  generations,
  inclusionBoundaries,
  onToggleVisible,
  onRename,
  onSetColor,
  onSetOpacity,
  onToggleEsriBlend,
  onPreviewEsriBlend,
  blendStatsById = {},
  blendPreviewGenerationId = null,
  onCreateTinFromGeneration,
  creatingTinGenerationId,
  recentlyCreatedTinGenerationId,
  onDelete,
  onNewGeneration,
  onOpenGenerationChip,
  labelCount = 0,
  labelTool = null,
  onSetLabelTool,
  onClearContourLabels,
  onAutoLabelContours,
  focusRequest,
  onClose,
  isDocked: isDockedProp = false,
  onToggleDock,
  dockMode,
  onDockModeChange,
}) => {
  const mode: DockMode = dockMode ?? (isDockedProp ? 'toolshelf' : 'floating');
  const isDocked = mode !== 'floating';
  const [collapsed, setCollapsed] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  useEffect(() => {
    if (!focusRequest?.id) return;
    setCollapsed(false);
    setExpandedId(focusRequest.id);
  }, [focusRequest?.id, focusRequest?.token]);

  const getDefaultPos = useCallback(() => ({
    x: Math.max(0, window.innerWidth - 380),
    y: 170,
  }), []);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select, textarea')) return;
    e.preventDefault();
    const current = pos ?? getDefaultPos();
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: current.x, origY: current.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 80, dragState.current.origX + ev.clientX - dragState.current.startX)),
        y: Math.max(0, Math.min(window.innerHeight - 40, dragState.current.origY + ev.clientY - dragState.current.startY)),
      });
    };
    const onUp = () => {
      dragState.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pos, getDefaultPos]);

  const startEdit = (gen: ContourGeneration) => {
    setEditingId(gen.id);
    setEditName(gen.name);
  };
  const commitEdit = (id: string) => {
    if (editName.trim()) onRename(id, editName.trim());
    setEditingId(null);
  };

  const resolvedPos = pos ?? getDefaultPos();

  return (
    <div
      className={
        isDocked
          ? 'flex w-full flex-col border-b border-cyan-400/25 bg-[#070e18]/95 text-[12px] text-slate-300'
          : 'fixed z-40 w-[360px] rounded-xl border border-white/[0.12] bg-[#070e18]/95 text-[12px] text-slate-300 shadow-2xl backdrop-blur-sm'
      }
      style={isDocked ? undefined : { left: resolvedPos.x, top: resolvedPos.y }}
    >
      {/* Panel header — docking/closing lives on the panel, never on a chip. */}
      <div
        className={`flex select-none items-center justify-between border-b border-white/[0.08] px-3 py-2 ${
          isDocked ? 'cursor-default' : 'cursor-move'
        }`}
        onMouseDown={isDocked ? undefined : handleDragStart}
      >
        <div className="flex items-center gap-2">
          <span className="text-cyan-300">📐</span>
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-cyan-200">Contour Generations</span>
          <span className="rounded-full border border-white/10 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[9px] text-slate-300">
            {generations.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onNewGeneration}
            className={chipButtonClass('emerald')}
            title="Generate new contours"
          >
            + New
          </button>
          {(onDockModeChange || onToggleDock) && (
            onDockModeChange ? (
              <DockModeControl mode={mode} onChange={onDockModeChange} />
            ) : (
              <button
                type="button"
                onClick={onToggleDock}
                className="rounded p-1 text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-cyan-300"
                title={isDocked ? 'Pop out Contour Generations to canvas' : 'Dock Contour Generations into Tool Station'}
              >
                {isDocked ? <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" /> : <ArrowDownOnSquareIcon className="h-3.5 w-3.5" />}
              </button>
            )
          )}
          <button onClick={() => setCollapsed(c => !c)} className="text-xs text-slate-400 hover:text-white" title={collapsed ? 'Expand' : 'Collapse'}>
            {collapsed ? '▾' : '▴'}
          </button>
          {onClose && (
            <button onClick={onClose} className="text-xs text-slate-400 hover:text-white" title="Close">✕</button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="max-h-[70vh] space-y-2 overflow-y-auto p-2">
          {(onSetLabelTool || onAutoLabelContours || onClearContourLabels) && (
            <ChipCard
              color="labels"
              title="Contour Labels"
              aside={<span className="text-[9.5px] text-slate-500">{labelCount} on canvas</span>}
            >
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => onSetLabelTool?.(labelTool === 'place' ? null : 'place')}
                  aria-pressed={labelTool === 'place'}
                  className={chipButtonClass('emerald', labelTool === 'place')}
                >
                  {labelTool === 'place' ? 'Stop Placing' : 'Place by Strike'}
                </button>
                <button
                  type="button"
                  onClick={() => onSetLabelTool?.(labelTool === 'erase' ? null : 'erase')}
                  aria-pressed={labelTool === 'erase'}
                  className={chipButtonClass('rose', labelTool === 'erase')}
                >
                  {labelTool === 'erase' ? 'Stop Erasing' : 'Erase by Strike'}
                </button>
                <button
                  type="button"
                  onClick={onAutoLabelContours}
                  className={chipButtonClass('neutral')}
                >
                  Re-label
                </button>
                <button
                  type="button"
                  onClick={onClearContourLabels}
                  disabled={labelCount === 0}
                  className={chipButtonClass('neutral')}
                >
                  Clear Labels
                </button>
              </div>
              {labelTool && (
                <p className="text-[9.5px] leading-snug text-teal-300/80">
                  Strike mode active — drag on the canvas. Press Esc to finish.
                </p>
              )}
            </ChipCard>
          )}

          {generations.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-[10.5px] leading-relaxed text-slate-500">
              No contour generations yet.
              <br />
              Click <span className="font-semibold text-emerald-300">+ New</span> to generate contours.
            </div>
          )}

          {generations.map((gen, idx) => {
            const isExpanded = expandedId === gen.id;
            const accentColor = gen.color ?? GENERATION_COLORS[idx % GENERATION_COLORS.length];
            const createdDate = new Date(gen.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            const lastRegen = new Date(gen.lastGeneratedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
            const blendStatus = gen.esriBlendEnabled ? blendStatusText(blendStatsById[gen.id]) : null;

            return (
              <div
                key={gen.id}
                data-contour-generation-chip={gen.id}
                className="panel-surface relative overflow-hidden rounded-xl border border-white/[0.08] bg-[#070e18]/90 py-2 pl-4 pr-2 shadow-sm"
                style={{ borderColor: `${accentColor}40` }}
              >
                <SectionChip color={accentColor} />

                {/* Row header */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onToggleVisible(gen.id, !gen.visible)}
                    className="flex h-4 w-4 flex-none items-center justify-center rounded border text-[10px] leading-4 transition-colors"
                    style={gen.visible
                      ? { background: accentColor, borderColor: accentColor, color: '#111' }
                      : { background: 'transparent', borderColor: '#4b5563', color: '#6b7280' }
                    }
                    title={gen.visible ? 'Hide' : 'Show'}
                    aria-pressed={gen.visible}
                  >
                    {gen.visible ? '●' : '○'}
                  </button>

                  <button
                    className="h-2.5 w-2.5 flex-none cursor-pointer rounded-full border border-black/40"
                    style={{ background: accentColor }}
                    title="Change color"
                    aria-label={`Change color of ${gen.name}`}
                    onClick={() => {
                      const colorIdx = GENERATION_COLORS.indexOf(accentColor);
                      const next = GENERATION_COLORS[(colorIdx + 1) % GENERATION_COLORS.length];
                      onSetColor(gen.id, next);
                    }}
                  />

                  {editingId === gen.id ? (
                    <input
                      autoFocus
                      className={`${CHIP_INPUT_CLASS} h-6 flex-1 py-0.5`}
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onBlur={() => commitEdit(gen.id)}
                      onKeyDown={e => { if (e.key === 'Enter') commitEdit(gen.id); if (e.key === 'Escape') setEditingId(null); }}
                    />
                  ) : (
                    <span
                      className="flex-1 cursor-pointer truncate text-[11px] font-semibold text-slate-100 hover:text-white"
                      title="Double-click to rename"
                      onDoubleClick={() => startEdit(gen)}
                    >
                      {gen.name}
                    </span>
                  )}

                  <span className="flex-none font-mono text-[9px] text-slate-500">
                    {gen.settings.contourInterval}ft · {gen.pointCount}pts
                  </span>

                  {(gen.excludedPointCount ?? 0) > 0 && (
                    <span
                      className="flex-none text-[9px] text-amber-300/90"
                      title={`${gen.excludedPointCount} point(s) excluded: missing elevations or elevations detached from the surveyed surface.`}
                    >
                      −{gen.excludedPointCount}
                    </span>
                  )}

                  {gen.elevationFilterSuppressed && (
                    <span
                      className="flex-none text-[9px] text-rose-300/90"
                      title="Some elevations look detached from the surface but were kept because excluding them would drop too many points. Review the survey for elevation blunders."
                    >
                      ⚠ z?
                    </span>
                  )}

                  <button
                    onClick={() => setExpandedId(isExpanded ? null : gen.id)}
                    className="flex-none text-xs text-slate-500 hover:text-slate-300"
                    aria-label={isExpanded ? `Collapse ${gen.name}` : `Expand ${gen.name}`}
                  >
                    {isExpanded ? '▴' : '▾'}
                  </button>

                  <button
                    onClick={() => {
                      if (window.confirm(`Delete "${gen.name}"?`)) onDelete(gen.id);
                    }}
                    className="flex-none text-xs text-slate-600 transition-colors hover:text-rose-400"
                    title="Delete generation"
                    aria-label={`Delete ${gen.name}`}
                  >✕</button>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="mt-2 space-y-2.5 border-t border-white/[0.07] pt-2">
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-slate-500">
                      <span>Created {createdDate}</span>
                      <span>Updated {lastRegen}</span>
                      <span>{gen.isoPaths.length} polylines</span>
                    </div>

                    {gen.elevationRange && (
                      <div className="text-[9.5px] text-slate-500">
                        Contoured Z {gen.elevationRange.min.toFixed(2)}' – {gen.elevationRange.max.toFixed(2)}'
                        {(gen.excludedPointCount ?? 0) > 0 && (
                          <span className="text-amber-300/90"> · {gen.excludedPointCount} point(s) excluded</span>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                      <div><span className="text-slate-500">Interval:</span> <span className="text-slate-200">{gen.settings.contourInterval} ft</span></div>
                      <div><span className="text-slate-500">Major:</span> <span className="text-slate-200">{gen.settings.majorInterval} ft</span></div>
                      <div><span className="text-slate-500">Smoothing:</span> <span className="text-slate-200">{gen.settings.smoothing}</span></div>
                      <div><span className="text-slate-500">Filter:</span> <span className="truncate text-slate-200">{gen.settings.pointFilterDescription || 'All'}</span></div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="w-12 flex-none text-[9px] text-slate-500">Opacity</span>
                      <input
                        type="range" min={0.1} max={1} step={0.05}
                        value={gen.opacity ?? 1}
                        onChange={e => onSetOpacity(gen.id, parseFloat(e.target.value))}
                        className="min-w-0 flex-1 accent-cyan-400"
                        aria-label={`Opacity for ${gen.name}`}
                      />
                      <span className="w-8 flex-none text-right font-mono text-[9px] text-slate-400">
                        {Math.round((gen.opacity ?? 1) * 100)}%
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1">
                      {GENERATION_COLORS.map(swatch => (
                        <button
                          key={swatch}
                          type="button"
                          onClick={() => onSetColor(gen.id, swatch)}
                          aria-label={`Set ${gen.name} color ${swatch}`}
                          className={`h-3 w-3 rounded-full border ${accentColor === swatch ? 'border-white' : 'border-black/40'}`}
                          style={{ backgroundColor: swatch }}
                        />
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {onOpenGenerationChip && (
                        <button
                          type="button"
                          onClick={() => onOpenGenerationChip(gen.id)}
                          className={chipButtonClass('emerald')}
                          title="Open this generation on its own"
                          aria-label={`Open ${gen.name}`}
                        >
                          ❖ Open
                        </button>
                      )}
                      {onCreateTinFromGeneration && (
                        <button
                          type="button"
                          onClick={() => onCreateTinFromGeneration(gen.id)}
                          disabled={!!creatingTinGenerationId}
                          className={chipButtonClass('violet')}
                          title="Create a TIN from this contour generation and save it to File Manager"
                        >
                          {creatingTinGenerationId === gen.id
                            ? 'Creating TIN…'
                            : recentlyCreatedTinGenerationId === gen.id
                              ? 'TIN Created'
                              : 'Create TIN'}
                        </button>
                      )}
                    </div>

                    {/* ESRI Blend */}
                    <div className="rounded-lg border border-indigo-400/20 bg-indigo-400/[0.05] p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10.5px] font-semibold text-indigo-200">ESRI / State Blend</span>
                        <span className={`rounded-full border px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide ${
                          gen.esriBlendEnabled
                            ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                            : 'border-white/10 bg-white/[0.03] text-slate-400'
                        }`}>
                          {gen.esriBlendEnabled ? 'Active' : 'Review first'}
                        </span>
                      </div>
                      <p className="mt-1 text-[9px] leading-snug text-indigo-300/70">
                        Preview the ESRI trims, transition curves, open ends, and refused joins on the canvas.
                        Nothing is applied until the review dialog's OK.
                      </p>
                      {gen.esriBlendEnabled && blendStatus && (
                        <p className={`mt-1 text-[9px] leading-snug ${blendStatus.className}`}>
                          {blendStatus.text}
                        </p>
                      )}
                      {blendPreviewGenerationId === gen.id && (
                        <p className="mt-1 flex items-start gap-1 text-[9px] leading-snug text-cyan-200">
                          <span className="mt-0.5">◆</span> Preview open on canvas — awaiting OK.
                        </p>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onPreviewEsriBlend(gen.id)}
                          disabled={inclusionBoundaries.length === 0}
                          className={chipButtonClass('indigo')}
                        >
                          {gen.esriBlendEnabled ? 'Review / Adjust…' : 'Preview Blend…'}
                        </button>
                        {gen.esriBlendEnabled && (
                          <button
                            type="button"
                            onClick={() => onToggleEsriBlend(gen.id, false)}
                            className={chipButtonClass('rose')}
                          >
                            Turn Off
                          </button>
                        )}
                      </div>
                      {inclusionBoundaries.length === 0 && (
                        <p className="mt-1 text-[9px] text-amber-300/80">
                          Draw an inclusion boundary before blending.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {generations.length > 0 && (
            <p className="pt-1 text-center text-[9px] text-slate-600">
              Auto-updates when survey points change · Double-click name to rename
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default ContourManagementPanel;
