// Global Ctrl/Cmd+Z / Ctrl+Shift+Z / Ctrl+Y shortcuts for canvas undo/redo.
//
// Scoped deliberately: the CAD Manager's StandardsEditor owns its own undo stack
// and handles these keys itself, and DrawingCanvas has its own key handling for
// in-progress drawing operations. This hook therefore bails out whenever focus
// is inside an editable element, and can be disabled by the caller.

import { useEffect } from 'react';

export interface UndoShortcutOptions {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Set false to suspend the shortcuts (e.g. while a modal owns the keyboard). */
  enabled?: boolean;
}

/** True when the event originated from a field where the browser owns undo. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  // Respect any subtree that manages its own undo stack.
  return target.closest('[data-owns-undo="true"]') !== null;
}

export function useUndoShortcuts({
  undo,
  redo,
  canUndo,
  canRedo,
  enabled = true,
}: UndoShortcutOptions): void {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.altKey) return;
      if (isEditableTarget(e.target)) return;

      const key = e.key.toLowerCase();

      // Ctrl+Shift+Z and Ctrl+Y both redo.
      if ((key === 'z' && e.shiftKey) || key === 'y') {
        if (!canRedo) return;
        e.preventDefault();
        redo();
        return;
      }

      if (key === 'z') {
        if (!canUndo) return;
        e.preventDefault();
        undo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, canUndo, canRedo, enabled]);
}
