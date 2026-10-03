import { useCallback, useEffect } from 'react';
import type React from 'react';

/**
 * Custom hook for managing horizontal chat panel resizing.
 * Handles mouse events for dragging the resize handle between main content and chat panel.
 * 
 * @param isResizingChat - Whether the chat panel is currently being resized
 * @param setIsResizingChat - Function to update the resizing state
 * @param setChatPanelWidth - Function to update the chat panel width
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
  const handleChatResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingChat(true);
  }, [setIsResizingChat]);

  const handleChatResizeMouseUp = useCallback(() => {
    setIsResizingChat(false);
  }, [setIsResizingChat]);

  const handleChatResizeMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizingChat) return;
    const maxWidth = window.innerWidth - maxWidthOffset;
    const newWidth = window.innerWidth - e.clientX;
    if (newWidth >= minWidth && newWidth <= maxWidth) {
      setChatPanelWidth(newWidth);
    }
  }, [isResizingChat, setChatPanelWidth, minWidth, maxWidthOffset]);

  // Add/remove event listeners when resizing starts/stops
  useEffect(() => {
    if (!isResizingChat) return;
    window.addEventListener('mousemove', handleChatResizeMouseMove);
    window.addEventListener('mouseup', handleChatResizeMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleChatResizeMouseMove);
      window.removeEventListener('mouseup', handleChatResizeMouseUp);
    };
  }, [isResizingChat, handleChatResizeMouseMove, handleChatResizeMouseUp]);

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
