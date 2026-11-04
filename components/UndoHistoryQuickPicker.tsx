// Compact undo-history picker surfaced by pressing `u` twice quickly.
// Newest entries first; arrow keys move, Enter restores, Esc closes.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CanvasHistoryEntry } from '../contexts/CanvasHistoryContext.tsx';

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

export interface UndoHistoryQuickPickerProps {
  entries: CanvasHistoryEntry[];
  onJump: (entryId: string) => void;
  onClose: () => void;
  /** Height of the command bar the popover should sit above. */
  bottomOffset?: number;
}

export const UndoHistoryQuickPicker: React.FC<UndoHistoryQuickPickerProps> = ({
  entries,
  onJump,
  onClose,
  bottomOffset = 0,
}) => {
  const ordered = useMemo(() => [...entries].reverse(), [entries]);
  const [activeIndex, setActiveIndex] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const now = Date.now();

  useEffect(() => {
    setActiveIndex(0);
  }, [ordered.length]);

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-history-index="${activeIndex}"]`
    );
    // Not implemented by every DOM shim (jsdom); scrolling is cosmetic here.
    node?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex(index => Math.min(ordered.length - 1, index + 1));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex(index => Math.max(0, index - 1));
        return;
      }
      if (event.key === 'Enter') {
        const entry = ordered[activeIndex];
        if (!entry) return;
        event.preventDefault();
        if (!entry.isCurrent) onJump(entry.id);
        else onClose();
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [activeIndex, onClose, onJump, ordered]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Undo history"
      data-testid="undo-history-quick-picker"
      style={{ bottom: `calc(${bottomOffset}px + 0.9rem)` }}
      className="fixed left-1/2 z-[60] w-[min(26rem,92vw)] -translate-x-1/2 overflow-hidden rounded-xl border border-white/[0.1] bg-[#0b1119]/95 shadow-[0_24px_70px_-16px_rgba(0,0,0,0.9)] backdrop-blur-xl"
    >
      <div className="flex items-center justify-between border-b border-white/[0.07] px-3 py-2">
        <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
          Undo history
          <span className="rounded border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[9px] tracking-normal text-violet-200">
            U U
          </span>
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-1.5 text-xs text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
          title="Close (Esc)"
        >
          ✕
        </button>
      </div>

      <ul ref={listRef} className="max-h-[min(52vh,22rem)] overflow-y-auto py-1">
        {ordered.length === 0 && (
          <li className="px-3 py-6 text-center text-[11px] text-slate-500">
            Nothing to undo yet.
          </li>
        )}
        {ordered.map((entry, index) => {
          const isActive = index === activeIndex;
          return (
            <li key={entry.id}>
              <button
                type="button"
                data-history-index={index}
                onClick={() => {
                  if (!entry.isCurrent) onJump(entry.id);
                  onClose();
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition-colors ${
                  isActive ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]'
                } ${entry.isCurrent ? 'opacity-70' : ''}`}
                title={entry.isCurrent ? 'Current state' : `Restore: ${entry.label}`}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`truncate text-[11.5px] ${
                        entry.isCurrent ? 'font-semibold text-blue-200' : 'text-slate-200'
                      }`}
                    >
                      {entry.label}
                    </span>
                    {entry.isCurrent && (
                      <span className="shrink-0 rounded bg-blue-500/15 px-1 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-blue-300">
                        current
                      </span>
                    )}
                  </span>
                  {entry.tags.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {entry.tags.map(tag => (
                        <span
                          key={tag}
                          className={`rounded px-1.5 py-0.5 text-[9px] ${TAG_STYLES[tag] ?? 'bg-gray-800 text-gray-400'}`}
                        >
                          {tag}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                <span className="shrink-0 pt-0.5 font-mono text-[9px] text-slate-500">
                  {relativeTime(entry.timestamp, now)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-white/[0.07] px-3 py-1.5 text-[9.5px] text-slate-500">
        ↑↓ choose · Enter restore · Esc close
      </div>
    </div>
  );
};

export default UndoHistoryQuickPicker;
