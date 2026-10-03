// Undo/redo history panel. Lists the labeled entries recorded by the history
// engine and lets the user jump directly to any point in the session.

import React, { useMemo } from 'react';
import { useCanvasHistory, type CanvasHistoryEntry } from '../contexts/CanvasHistoryContext.tsx';

const TAG_STYLES: Record<string, string> = {
  points: 'bg-yellow-900/50 text-yellow-300',
  lines: 'bg-purple-900/50 text-purple-300',
  centerlines: 'bg-blue-900/50 text-blue-300',
  contours: 'bg-emerald-900/50 text-emerald-300',
  boundary: 'bg-orange-900/50 text-orange-300',
};

function relativeTime(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

export interface HistoryPanelProps {
  onClose?: () => void;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({ onClose }) => {
  const { entries, jumpTo, canUndo, canRedo, undo, redo, undoLabel, redoLabel } =
    useCanvasHistory();

  const now = Date.now();

  // Newest first: the most recent operation is the one users reach for.
  const ordered = useMemo(() => [...entries].reverse(), [entries]);

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-200" data-testid="history-panel">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <h3 className="text-sm font-semibold">History</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={undo}
            disabled={!canUndo}
            title={canUndo && undoLabel ? `Undo: ${undoLabel} (Ctrl+Z)` : 'Nothing to undo'}
            className={`px-2 py-1 text-xs rounded ${canUndo ? 'hover:bg-gray-700' : 'opacity-30 cursor-not-allowed'}`}
          >
            Undo
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            title={canRedo && redoLabel ? `Redo: ${redoLabel} (Ctrl+Y)` : 'Nothing to redo'}
            className={`px-2 py-1 text-xs rounded ${canRedo ? 'hover:bg-gray-700' : 'opacity-30 cursor-not-allowed'}`}
          >
            Redo
          </button>
          {onClose && (
            <button onClick={onClose} className="px-2 py-1 text-xs rounded hover:bg-gray-700" title="Close">
              ✕
            </button>
          )}
        </div>
      </div>

      <ul className="flex-1 overflow-y-auto divide-y divide-gray-800">
        {ordered.map((entry: CanvasHistoryEntry) => (
          <li key={entry.id}>
            <button
              onClick={() => jumpTo(entry.id)}
              disabled={entry.isCurrent}
              className={`w-full text-left px-3 py-2 transition-colors ${
                entry.isCurrent
                  ? 'bg-blue-900/40 cursor-default'
                  : 'hover:bg-gray-800'
              }`}
              title={entry.isCurrent ? 'Current state' : `Restore: ${entry.label}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`text-sm truncate ${entry.isCurrent ? 'font-semibold text-blue-200' : ''}`}>
                  {entry.label}
                </span>
                <span className="text-[10px] text-gray-500 shrink-0">
                  {relativeTime(entry.timestamp, now)}
                </span>
              </div>
              {entry.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {entry.tags.map(tag => (
                    <span
                      key={tag}
                      className={`text-[10px] px-1.5 py-0.5 rounded ${TAG_STYLES[tag] ?? 'bg-gray-800 text-gray-400'}`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </button>
          </li>
        ))}
      </ul>

      <div className="px-3 py-2 border-t border-gray-700 text-[10px] text-gray-500">
        Ctrl+Z to undo · Ctrl+Y to redo · click any entry to jump
      </div>
    </div>
  );
};

export default HistoryPanel;
