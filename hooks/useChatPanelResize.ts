import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';

/**
 * Custom hook for managing horizontal chat panel resizing.
 *
 * The drag writes the panel width straight to the DOM on an animation frame
 * and commits a single width to React state on release. Updating context state
 * on every mousemove re-rendered the whole app tree (App.tsx) at pointer rate,
 * which made the edge trail the cursor.
 *
 * @param isResizingChat - Whether the chat panel is currently being resized
 * @param setIsResizingChat - Function to update the resizing state
 * @param setChatPanelWidth - Function to commit the final chat panel width
 * @param minWidth - Minimum width for the chat panel (default: 320px)
 * @param maxWidthOffset - Space to keep for main panel (default: 400px)
 */
export function useChatPanelResize(
  isResizingChat: boolean,
  setIsResizingChat: (isResizing: boolean) => void,
  setChatPanelWidth: (width: number) => void,
  minWidth: number = 320,
  maxWidthOffset: number = 400
) {
  /** The `[data-chat-panel]` element being dragged. */
  const panelRef = useRef<HTMLElement | null>(null);
  /** Latest width computed on mousemove, applied in the next frame. */
  const pendingWidthRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  const flushPendingWidth = useCallback(() => {
    frameRef.current = null;
    const panel = panelRef.current;
    const width = pendingWidthRef.current;
    if (!panel || width === null) return;
    panel.style.width = `${width}px`;
  }, []);

  const handleChatResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const panel = (e.currentTarget as HTMLElement).closest('[data-chat-panel]') as HTMLElement | null;
    if (!panel) return;

    panelRef.current = panel;
    pendingWidthRef.current = panel.getBoundingClientRect().width;
    // Keep the compositor from guessing; no transition is active during drag.
    panel.style.willChange = 'width';
    setIsResizingChat(true);
  }, [setIsResizingChat]);

  const handleChatResizeMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizingChat) return;

    const maxWidth = Math.max(minWidth, window.innerWidth - maxWidthOffset);
    const nextWidth = Math.max(minWidth, Math.min(maxWidth, window.innerWidth - e.clientX));
    pendingWidthRef.current = nextWidth;

    // Coalesce multiple pointer events into one style write per frame.
    if (frameRef.current === null) {
      frameRef.current = requestAnimationFrame(flushPendingWidth);
    }
  }, [isResizingChat, minWidth, maxWidthOffset, flushPendingWidth]);

  const handleChatResizeMouseUp = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    const panel = panelRef.current;
    const width = pendingWidthRef.current;

    if (panel) {
      panel.style.willChange = '';
      if (width !== null) {
        // Leave the DOM at the final width and commit one state update so the
        // rest of the app (canvas panel, toolbar docking) catches up once.
        panel.style.width = `${width}px`;
        setChatPanelWidth(Math.round(width));
      }
    }

    panelRef.current = null;
    pendingWidthRef.current = null;
    setIsResizingChat(false);
  }, [setChatPanelWidth, setIsResizingChat]);

  // Add/remove event listeners when resizing starts/stops
  useEffect(() => {
    if (!isResizingChat) return;
    window.addEventListener('mousemove', handleChatResizeMouseMove);
    window.addEventListener('mouseup', handleChatResizeMouseUp);
    window.addEventListener('blur', handleChatResizeMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleChatResizeMouseMove);
      window.removeEventListener('mouseup', handleChatResizeMouseUp);
      window.removeEventListener('blur', handleChatResizeMouseUp);
    };
  }, [isResizingChat, handleChatResizeMouseMove, handleChatResizeMouseUp]);

  // Cancel any queued frame if the hook unmounts mid-drag.
  useEffect(() => () => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  // Add/remove body class for cursor styling during resize
  useEffect(() => {
    if (isResizingChat) {
      document.body.classList.add('resizing');
    } else {
      document.body.classList.remove('resizing');
    }
  }, [isResizingChat]);

  return {
    handleChatResizeMouseDown,
    handleChatResizeMouseUp,
    handleChatResizeMouseMove,
  };
}
