// Reusable double-tap keyboard shortcuts for the drawing canvas.
//
// A shortcut fires when its key is pressed twice inside the tap window. This is
// deliberately separate from browser key repeat: holding a key down only counts
// once. When a shortcut also has a single-tap action, that action waits for the
// window to expire so a fast `tt` never performs the single-tap action first.
//
// Example: `t` toggles TRIM on a single tap, while `tt` starts the TEXT tool.

import { useEffect, useRef } from 'react';

export interface DoubleTapShortcut {
  /** Single character key, matched case-insensitively. */
  key: string;
  /** Runs when the key is tapped twice within the tap window. */
  onDoubleTap: () => void;
  /** Optional action that runs after one tap once the window expires. */
  onSingleTap?: () => void;
}

export interface DoubleTapShortcutOptions {
  /** Suspends the shortcuts (e.g. a mode owns the key and handles it itself). */
  enabled?: boolean;
  /** Maximum gap between taps, in milliseconds. */
  windowMs?: number;
}

/** True when the event originated from a field where the user is typing. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

export function useDoubleTapShortcuts(
  shortcuts: DoubleTapShortcut[],
  { enabled = true, windowMs = 280 }: DoubleTapShortcutOptions = {},
): void {
  const latestRef = useRef({ shortcuts, windowMs });
  latestRef.current = { shortcuts, windowMs };

  const pendingRef = useRef(new Map<string, number>());
  const pendingKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const clearPending = () => {
      pendingRef.current.forEach(timer => window.clearTimeout(timer));
      pendingRef.current.clear();
      pendingKeyRef.current = null;
    };

    if (!enabled) {
      clearPending();
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      if (isEditableTarget(event.target)) return;

      const latest = latestRef.current;
      const key = event.key.toLowerCase();
      const shortcut = latest.shortcuts.find(item => item.key.toLowerCase() === key);

      if (!shortcut) {
        // Another key means the user has moved on; do not let a delayed
        // single-tap action (such as TRIM) fire behind the new command.
        if (pendingRef.current.size > 0) clearPending();
        return;
      }

      const normalizedKey = shortcut.key.toLowerCase();
      const pending = pendingRef.current.get(normalizedKey);
      if (pending !== undefined) {
        window.clearTimeout(pending);
        pendingRef.current.delete(normalizedKey);
        pendingKeyRef.current = null;
        event.preventDefault();
        shortcut.onDoubleTap();
        return;
      }

      // A different shortcut is already waiting; cancel it so only the most
      // recent tap sequence can resolve.
      if (pendingKeyRef.current !== null && pendingKeyRef.current !== normalizedKey) {
        clearPending();
      }

      const timer = window.setTimeout(() => {
        pendingRef.current.delete(normalizedKey);
        if (pendingKeyRef.current === normalizedKey) pendingKeyRef.current = null;
        const current = latestRef.current.shortcuts.find(
          item => item.key.toLowerCase() === normalizedKey,
        );
        current?.onSingleTap?.();
      }, latest.windowMs);
      pendingRef.current.set(normalizedKey, timer);
      pendingKeyRef.current = normalizedKey;
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      clearPending();
    };
  }, [enabled]);
}
