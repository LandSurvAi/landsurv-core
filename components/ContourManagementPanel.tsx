/**
 * ContourManagementPanel (v26.05.19.3)
 *
 * Floating panel that manages all ContourGeneration objects for the current
 * session.  Allows:
 *   • Show / hide individual generations
 *   • Rename generations
 *   • Colour-code outputs
 *   • Enable ESRI/State blend mode per generation
 *   • Delete generations
 *   • Trigger a new generation (opens ContourGenerationPanel)
 *
 * ESRI Blend mode:
 *   When enabled for a generation, ESRI contour lines whose midpoint falls
 *   inside the selected inclusion boundary are suppressed — leaving survey
 *   contours as the sole source inside that boundary and ESRI as the sole
 *   source outside it.  The user then manually draws blend curves at the
 *   boundary to achieve a smooth hand-off.
 */

import React, { useCallback, useRef, useState } from 'react';
import { type ContourGeneration, type InclusionBoundary } from '../types.ts';

interface ContourManagementPanelProps {
  generations: ContourGeneration[];
  inclusionBoundaries: InclusionBoundary[];
  onToggleVisible: (id: string, visible: boolean) => void;
  onRename: (id: string, name: string) => void;
  onSetColor: (id: string, color: string | undefined) => void;
  onSetOpacity: (id: string, opacity: number) => void;
  onToggleEsriBlend: (id: string, enabled: boolean) => void;
  onSetEsriBlendPolylineId: (id: string, polylineId: string | null) => void;
  onCreateTinFromGeneration?: (id: string) => void;
  creatingTinGenerationId?: string | null;
  recentlyCreatedTinGenerationId?: string | null;
  onDelete: (id: string) => void;
  onNewGeneration: () => void;
  onClose?: () => void;
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

export const ContourManagementPanel: React.FC<ContourManagementPanelProps> = ({
  generations,
  inclusionBoundaries,
  onToggleVisible,
  onRename,
  onSetColor,
  onSetOpacity,
  onToggleEsriBlend,
  onSetEsriBlendPolylineId,
  onCreateTinFromGeneration,
  creatingTinGenerationId,
  recentlyCreatedTinGenerationId,
  onDelete,
  onNewGeneration,
  onClose,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

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
      className="fixed z-40 bg-gray-900/95 border border-amber-500/40 rounded-lg shadow-2xl text-sm text-gray-200 backdrop-blur-sm w-[360px]"
      style={{ left: resolvedPos.x, top: resolvedPos.y }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-amber-500/30 cursor-move select-none"
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2">
          <span className="text-amber-400">📐</span>
          <span className="font-semibold text-amber-200">Contour Generations</span>
          <span className="text-[10px] bg-amber-700/50 text-amber-100 px-1.5 py-0.5 rounded font-mono">
            {generations.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onNewGeneration}
            className="text-[11px] px-2 py-0.5 rounded bg-amber-600/80 hover:bg-amber-500 text-white font-medium"
            title="Generate new contours"
          >+ New</button>
          <button onClick={() => setCollapsed(c => !c)} className="text-xs text-gray-400 hover:text-white" title={collapsed ? 'Expand' : 'Collapse'}>
            {collapsed ? '▾' : '▴'}
          </button>
          {onClose && (
            <button onClick={onClose} className="text-xs text-gray-400 hover:text-white" title="Close">✕</button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="p-2 space-y-1.5 max-h-[70vh] overflow-y-auto">
          {generations.length === 0 && (
            <div className="py-6 text-center text-xs text-gray-500">
              No contour generations yet.<br />
              Click <span className="text-amber-400">+ New</span> to generate contours.
            </div>
          )}

          {generations.map((gen, idx) => {
            const isExpanded = expandedId === gen.id;
            const accentColor = gen.color ?? GENERATION_COLORS[idx % GENERATION_COLORS.length];
            const createdDate = new Date(gen.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            const lastRegen = new Date(gen.lastGeneratedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

            return (
              <div
                key={gen.id}
                className="rounded border bg-gray-800/60"
                style={{ borderColor: `${accentColor}40` }}
              >
                {/* Row header */}
                <div className="flex items-center gap-2 px-2 py-1.5">
                  {/* Visibility toggle */}
                  <button
                    onClick={() => onToggleVisible(gen.id, !gen.visible)}
                    className="flex-shrink-0 w-4 h-4 rounded text-[11px] leading-4 text-center border transition-colors"
                    style={gen.visible
                      ? { background: accentColor, borderColor: accentColor, color: '#111' }
                      : { background: 'transparent', borderColor: '#4b5563', color: '#6b7280' }
                    }
                    title={gen.visible ? 'Hide' : 'Show'}
                  >
                    {gen.visible ? '●' : '○'}
                  </button>

                  {/* Color swatch */}
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0 cursor-pointer"
                    style={{ background: accentColor }}
                    title="Change color"
                    onClick={() => {
                      const idx = GENERATION_COLORS.indexOf(accentColor);
                      const next = GENERATION_COLORS[(idx + 1) % GENERATION_COLORS.length];
                      onSetColor(gen.id, next);
                    }}
                  />

                  {/* Name */}
                  {editingId === gen.id ? (
                    <input
                      autoFocus
                      className="flex-1 text-xs bg-gray-700 border border-amber-500/50 rounded px-1.5 py-0.5 text-gray-100 focus:outline-none"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onBlur={() => commitEdit(gen.id)}
                      onKeyDown={e => { if (e.key === 'Enter') commitEdit(gen.id); if (e.key === 'Escape') setEditingId(null); }}
                    />
                  ) : (
                    <span
                      className="flex-1 text-xs text-gray-200 truncate cursor-pointer hover:text-white"
                      title="Double-click to rename"
                      onDoubleClick={() => startEdit(gen)}
                    >
                      {gen.name}
                    </span>
                  )}

                  {/* Stats */}
                  <span className="text-[10px] text-gray-500 flex-shrink-0">
                    {gen.settings.contourInterval}ft · {gen.pointCount}pts
                  </span>

                  {(gen.excludedPointCount ?? 0) > 0 && (
                    <span
                      className="text-[10px] text-amber-400/90 flex-shrink-0"
                      title={`${gen.excludedPointCount} point(s) excluded: missing elevations or elevations detached from the surveyed surface.`}
                    >
                      −{gen.excludedPointCount} excl
                    </span>
                  )}

                  {gen.elevationFilterSuppressed && (
                    <span
                      className="text-[10px] text-rose-400/90 flex-shrink-0"
                      title="Some elevations look detached from the surface but were kept because excluding them would drop too many points. Review the survey for elevation blunders."
                    >
                      ⚠ z?
                    </span>
                  )}

                  {/* Expand toggle */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : gen.id)}
                    className="text-xs text-gray-500 hover:text-gray-300 flex-shrink-0"
                  >
                    {isExpanded ? '▴' : '▾'}
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete "${gen.name}"?`)) onDelete(gen.id);
                    }}
                    className="text-xs text-gray-600 hover:text-rose-400 flex-shrink-0"
                    title="Delete generation"
                  >✕</button>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-gray-700/40 space-y-3">
                    {/* Meta */}
                    <div className="flex gap-4 text-[10px] text-gray-500">
                      <span>Created {createdDate}</span>
                      <span>Updated {lastRegen}</span>
                      <span>{gen.isoPaths.length} polylines</span>
                    </div>

                    {gen.elevationRange && (
                      <div className="text-[10px] text-gray-500">
                        Contoured elevations {gen.elevationRange.min.toFixed(2)}' – {gen.elevationRange.max.toFixed(2)}'
                        {(gen.excludedPointCount ?? 0) > 0 && (
                          <span className="text-amber-400/90"> · {gen.excludedPointCount} point(s) excluded</span>
                        )}
                      </div>
                    )}

                    {/* Settings summary */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                      <div><span className="text-gray-500">Interval:</span> <span className="text-gray-200">{gen.settings.contourInterval} ft</span></div>
                      <div><span className="text-gray-500">Major:</span> <span className="text-gray-200">{gen.settings.majorInterval} ft</span></div>
                      <div><span className="text-gray-500">Smoothing:</span> <span className="text-gray-200">{gen.settings.smoothing}</span></div>
                      <div><span className="text-gray-500">Filter:</span> <span className="text-gray-200 truncate">{gen.settings.pointFilterDescription || 'All'}</span></div>
                    </div>

                    {onCreateTinFromGeneration && (
                      <button
                        type="button"
                        onClick={() => onCreateTinFromGeneration(gen.id)}
                        disabled={!!creatingTinGenerationId}
                        className="w-full py-1.5 text-[11px] font-semibold rounded border border-indigo-500/40 bg-indigo-700/30 hover:bg-indigo-600/40 text-indigo-100 transition-colors"
                        title="Create a TIN from this contour generation and save it to File Manager"
                      >
                        {creatingTinGenerationId === gen.id
                          ? 'Creating TIN...'
                          : recentlyCreatedTinGenerationId === gen.id
                            ? 'TIN Created'
                            : 'Create TIN for This Generation'}
                      </button>
                    )}

                    {/* Opacity */}
                    <div>
                      <label className="text-[11px] text-gray-400">Opacity: {Math.round((gen.opacity ?? 1) * 100)}%</label>
                      <input
                        type="range" min={0.1} max={1} step={0.05}
                        value={gen.opacity ?? 1}
                        onChange={e => onSetOpacity(gen.id, parseFloat(e.target.value))}
                        className="w-full accent-amber-500"
                      />
                    </div>

                    {/* ESRI Blend */}
                    <div className="rounded border border-indigo-700/30 bg-indigo-900/20 p-2.5 space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={gen.esriBlendEnabled ?? false}
                          onChange={e => onToggleEsriBlend(gen.id, e.target.checked)}
                          className="accent-indigo-500"
                        />
                        <span className="text-[11px] font-medium text-indigo-200">Blend with ESRI/State Contours</span>
                      </label>
                      {gen.esriBlendEnabled && (
                        <>
                          <p className="text-[10px] text-indigo-300/70 leading-snug">
                            ESRI contours inside the selected inclusion boundary are suppressed.
                            Survey contours are 100% inside; ESRI is 100% outside.
                            Draw blend curves at the boundary edge to transition smoothly.
                          </p>
                          <div>
                            <label className="text-[10px] text-gray-400 block mb-1">Blend Inclusion Boundary</label>
                            <select
                              value={gen.esriBlendInclusionPolylineId ?? ''}
                              onChange={e => onSetEsriBlendPolylineId(gen.id, e.target.value || null)}
                              className="w-full text-xs bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-200"
                            >
                              <option value="">— select boundary —</option>
                              {inclusionBoundaries.map(b => (
                                <option key={b.id} value={b.polylineId}>{b.name}</option>
                              ))}
                            </select>
                          </div>
                          {!gen.esriBlendInclusionPolylineId && (
                            <p className="text-[10px] text-amber-400/80">Select an inclusion boundary to activate blend.</p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {generations.length > 0 && (
            <p className="text-[10px] text-gray-600 text-center pt-1">
              Auto-updates when survey points change · Double-click name to rename
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default ContourManagementPanel;
