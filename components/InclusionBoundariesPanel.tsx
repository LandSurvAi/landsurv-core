import React, { useState } from 'react';
import type { InclusionBoundary } from '../types.ts';

interface InclusionBoundariesPanelProps {
  boundaries: InclusionBoundary[];
  activeBoundaryId: string | null;
  /** Counts of segments per polylineId — derived in parent so we can show "(0)" sets too. */
  segmentCounts: Record<string, number>;
  /** Visibility per polylineId — derived from whether any line in the group is currently hidden. */
  visibility: Record<string, boolean>;
  onSetActive: (id: string | null) => void;
  onRename: (id: string, newName: string) => void;
  onToggleVisible: (id: string) => void;
  onDelete: (id: string) => void;
  /** Optional — open the named boundary in the Boundary Editor for adjustment. */
  onAdjust?: (id: string) => void;
}

/**
 * Inclusion Boundaries manager — lists every named inclusion boundary in the
 * project, lets the user rename / show-hide / set-active / delete each one,
 * and (when wired) jump into the Boundary Editor to adjust geometry.
 */
const InclusionBoundariesPanel: React.FC<InclusionBoundariesPanelProps> = ({
  boundaries,
  activeBoundaryId,
  segmentCounts,
  visibility,
  onSetActive,
  onRename,
  onToggleVisible,
  onDelete,
  onAdjust,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState<string>('');

  const startRename = (b: InclusionBoundary) => {
    setEditingId(b.id);
    setDraftName(b.name);
  };
  const commitRename = () => {
    if (editingId && draftName.trim()) onRename(editingId, draftName.trim());
    setEditingId(null);
    setDraftName('');
  };

  return (
    <div className="text-sm text-gray-200 space-y-3 light-theme:text-gray-800">
      <p className="text-[11px] text-gray-400 light-theme:text-gray-600 leading-snug">
        Each boundary is a closed inclusion polyline (a group of <span className="font-mono">type:&nbsp;inclusion</span> lines).
        Generate new ones via shrinkwrap, the Boundary Editor, or by drawing inclusion lines on the canvas — they auto-register here.
        The <span className="text-violet-300">active</span> boundary is the default consumed by Contour, Flood, and other agents.
      </p>

      {boundaries.length === 0 ? (
        <div className="rounded border border-dashed border-gray-600 px-3 py-4 text-center text-xs text-gray-400 light-theme:border-gray-300 light-theme:text-gray-600">
          No inclusion boundaries yet. Ask the COGO Agent to "shrinkwrap the site" or draw inclusion lines.
        </div>
      ) : (
        <ul className="divide-y divide-gray-700/60 rounded border border-gray-700/60 light-theme:divide-gray-300 light-theme:border-gray-300">
          {boundaries.map(b => {
            const isActive = b.id === activeBoundaryId;
            const isVisible = visibility[b.polylineId] !== false;
            const count = segmentCounts[b.polylineId] ?? 0;
            return (
              <li key={b.id} className={`px-2 py-2 flex flex-col gap-1.5 ${isActive ? 'bg-violet-900/20 light-theme:bg-violet-100/60' : ''}`}>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="active-inclusion-boundary"
                    checked={isActive}
                    onChange={() => onSetActive(isActive ? null : b.id)}
                    title="Set as active inclusion boundary for agents"
                    className="accent-violet-500"
                  />
                  {editingId === b.id ? (
                    <input
                      autoFocus
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename();
                        else if (e.key === 'Escape') { setEditingId(null); setDraftName(''); }
                      }}
                      className="flex-1 px-1.5 py-0.5 text-xs bg-gray-700 border border-gray-600 rounded text-white light-theme:bg-white light-theme:text-gray-900 light-theme:border-gray-400"
                    />
                  ) : (
                    <button
                      type="button"
                      onDoubleClick={() => startRename(b)}
                      title="Double-click to rename"
                      className="flex-1 text-left truncate font-semibold"
                    >
                      {b.name}
                    </button>
                  )}
                  <span className="text-[10px] text-gray-400 font-mono">{count} seg</span>
                </div>
                <div className="flex items-center gap-1 pl-6">
                  <button
                    type="button"
                    onClick={() => onToggleVisible(b.id)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${isVisible ? 'bg-emerald-600/80 text-white hover:bg-emerald-500' : 'bg-gray-600 text-gray-200 hover:bg-gray-500'}`}
                  >
                    {isVisible ? 'Visible' : 'Hidden'}
                  </button>
                  <button
                    type="button"
                    onClick={() => startRename(b)}
                    className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-700 text-gray-200 hover:bg-gray-600"
                  >
                    Rename
                  </button>
                  {onAdjust && b.polylineId.startsWith('shrinkwrap_') && (
                    <button
                      type="button"
                      onClick={() => onAdjust(b.id)}
                      className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-700/80 text-white hover:bg-blue-600"
                      title="Reopen this shrinkwrap in the live editor to exclude/restore points"
                    >
                      Adjust
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Delete inclusion boundary "${b.name}"? This removes ${count} segment${count === 1 ? '' : 's'}.`)) {
                        onDelete(b.id);
                      }
                    }}
                    className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-700/70 text-white hover:bg-red-600"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {boundaries.length > 0 && (
        <div className="flex items-center justify-between text-[11px] text-gray-400 light-theme:text-gray-600">
          <span>{boundaries.length} boundar{boundaries.length === 1 ? 'y' : 'ies'}</span>
          {activeBoundaryId && (
            <button
              type="button"
              onClick={() => onSetActive(null)}
              className="underline hover:text-gray-200"
            >
              Clear active selection
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default InclusionBoundariesPanel;
