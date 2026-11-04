// Global Ctrl/Cmd+Z / Ctrl+Shift+Z / Ctrl+Y shortcuts for canvas undo/redo,
// plus the CAD-style bare `u` shortcut (no command bar focus required).
//
// Scoped deliberately: the CAD Manager's StandardsEditor owns its own undo stack
// and handles these keys itself, and DrawingCanvas has its own key handling for
// in-progress drawing operations. This hook therefore bails out whenever focus
// is inside an editable element, and can be disabled by the caller.

import { useEffect, useRef } from 'react';

export interface UndoShortcutOptions {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Set false to suspend the shortcuts (e.g. while a modal owns the keyboard). */
  enabled?: boolean;
  /**
   * Opens the selectable undo history. Triggered by pressing `u` twice inside
   * the double-tap window, instead of undoing twice.
   */
  onShowHistory?: () => void;
  /** Max gap between the two `u` presses before they count as separate undos. */
  doubleTapWindowMs?: number;
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
  onShowHistory,
  doubleTapWindowMs = 240,
}: UndoShortcutOptions): void {
  const pendingUndoRef = useRef<number | null>(null);
  // Latest values live in a ref so a parent re-render (which recreates inline
  // callbacks) cannot tear down the listener and cancel a pending `u`.
  const latestRef = useRef({
    undo,
    redo,
    canUndo,
    canRedo,
    onShowHistory,
    doubleTapWindowMs,
  });
  latestRef.current = { undo, redo, canUndo, canRedo, onShowHistory, doubleTapWindowMs };

  useEffect(() => {
    if (!enabled) return;

    const cancelPendingUndo = () => {
      if (pendingUndoRef.current !== null) {
        window.clearTimeout(pendingUndoRef.current);
        pendingUndoRef.current = null;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey) return;
      if (isEditableTarget(e.target)) return;

      const key = e.key.toLowerCase();
      const latest = latestRef.current;

      if (e.ctrlKey || e.metaKey) {
        // Ctrl+Shift+Z and Ctrl+Y both redo.
        if ((key === 'z' && e.shiftKey) || key === 'y') {
          if (!latest.canRedo) return;
          cancelPendingUndo();
          e.preventDefault();
          latest.redo();
          return;
        }

        if (key === 'z') {
          if (!latest.canUndo) return;
          cancelPendingUndo();
          e.preventDefault();
          latest.undo();
        }
        return;
      }

      // Bare `u`: undo after a short delay so a fast second `u` can open the
      // history picker instead. Held keys and Shift+U are ignored.
      if (key !== 'u' || e.shiftKey || e.repeat) return;

      if (pendingUndoRef.current !== null) {
        cancelPendingUndo();
        e.preventDefault();
        latest.onShowHistory?.();
        return;
      }

      if (!latest.canUndo) return;
      e.preventDefault();
      pendingUndoRef.current = window.setTimeout(() => {
        pendingUndoRef.current = null;
        latestRef.current.undo();
      }, latest.doubleTapWindowMs);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      cancelPendingUndo();
    };
  }, [enabled]);
}
