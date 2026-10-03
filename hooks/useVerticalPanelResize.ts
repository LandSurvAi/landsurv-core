import { useEffect, useCallback } from 'react';
import type React from 'react';

/**
 * Custom hook for vertical panel resizing
 * 
 * Manages the resizing of a vertical panel (bottom panel that can be dragged up/down)
 * with mouse event handling and body class management for cursor styling.
 * 
 * @param isResizing - Whether the panel is currently being resized
 * @param setIsResizing - Function to set the resizing state
 * @param containerRef - Ref to the container element
 * @param panelHeight - Current height of the panel
 * @param setPanelHeight - Function to set the panel height
 * @param minHeight - Minimum allowed height (default: 150)
 * @param maxHeightOffset - Offset from container height for max height (default: 200)
 * @returns Object with mouseDown, mouseUp, and mouseMove handlers
 */
export function useVerticalPanelResize(
  isResizing: boolean,
  setIsResizing: (resizing: boolean) => void,
  containerRef: React.RefObject<HTMLDivElement>,
  panelHeight: number,
  setPanelHeight: (height: number) => void,
  minHeight: number = 150,
  maxHeightOffset: number = 200
) {
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
  }, [setIsResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, [setIsResizing]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const newHeight = containerRect.bottom - e.clientY;
    
    const maxHeight = containerRect.height - maxHeightOffset;
    
    if (newHeight >= minHeight && newHeight <= maxHeight) {
      setPanelHeight(newHeight);
    }
  }, [isResizing, containerRef, minHeight, maxHeightOffset, setPanelHeight]);

  // Add/remove event listeners when resizing
  useEffect(() => {
    if (!isResizing) return;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  // Manage body class for cursor styling
  useEffect(() => {
    if (isResizing) {
      document.body.classList.add('resizing-vertical');
    } else {
      document.body.classList.remove('resizing-vertical');
    }
  }, [isResizing]);

  return {
    handleMouseDown,
    handleMouseUp,
    handleMouseMove
  };
}
