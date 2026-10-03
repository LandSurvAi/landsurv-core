import { useState, useCallback, useEffect, useRef, RefObject, MouseEvent as ReactMouseEvent } from 'react';

/**
 * Custom hook for managing resizable panel dimensions with mouse drag functionality.
 * 
 * @param initialSize - The initial size of the panel in pixels
 * @param minSize - Minimum allowed size (default: 100px)
 * @param maxSize - Maximum allowed size (default: 600px)
 * @param containerRef - Optional ref to the container element for bounds checking
 * @returns Object containing panel size, resizing state, and event handlers
 */
export function usePanelResize(
  initialSize: number,
  minSize: number = 100,
  maxSize: number = 600,
  containerRef?: RefObject<HTMLElement>
) {
  const [size, setSize] = useState<number>(initialSize);
  const [isResizing, setIsResizing] = useState<boolean>(false);

  const handleResizeMouseDown = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleResizeMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  const handleResizeMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;

    const container = containerRef?.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const mouseY = e.clientY;
    const relativeY = mouseY - containerRect.top;
    const newHeight = containerRect.height - relativeY;

    const constrainedHeight = Math.max(minSize, Math.min(maxSize, newHeight));
    setSize(constrainedHeight);
  }, [isResizing, containerRef, minSize, maxSize]);

  // Attach/detach global mouse event listeners
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMouseMove);
      document.addEventListener('mouseup', handleResizeMouseUp);
    } else {
      document.removeEventListener('mousemove', handleResizeMouseMove);
      document.removeEventListener('mouseup', handleResizeMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleResizeMouseMove);
      document.removeEventListener('mouseup', handleResizeMouseUp);
    };
  }, [isResizing, handleResizeMouseMove, handleResizeMouseUp]);

  return {
    size,
    setSize,
    isResizing,
    handleResizeMouseDown,
    handleResizeMouseUp,
    handleResizeMouseMove,
  };
}

/**
 * Custom hook for managing horizontal resizable panels (e.g., chat panel).
 * 
 * @param initialWidth - The initial width of the panel in pixels
 * @param minWidth - Minimum allowed width (default: 300px)
 * @param maxWidth - Maximum allowed width (default: 800px)
 * @returns Object containing panel width, resizing state, and event handlers
 */
export function useHorizontalPanelResize(
  initialWidth: number,
  minWidth: number = 300,
  maxWidth: number = 800
) {
  const [width, setWidth] = useState<number>(initialWidth);
  const [isResizing, setIsResizing] = useState<boolean>(false);

  const handleResizeMouseDown = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleResizeMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  const handleResizeMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;

    const newWidth = window.innerWidth - e.clientX;
    const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
    setWidth(constrainedWidth);
  }, [isResizing, minWidth, maxWidth]);

  // Attach/detach global mouse event listeners
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMouseMove);
      document.addEventListener('mouseup', handleResizeMouseUp);
    } else {
      document.removeEventListener('mousemove', handleResizeMouseMove);
      document.removeEventListener('mouseup', handleResizeMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleResizeMouseMove);
      document.removeEventListener('mouseup', handleResizeMouseUp);
    };
  }, [isResizing, handleResizeMouseMove, handleResizeMouseUp]);

  return {
    width,
    setWidth,
    isResizing,
    handleResizeMouseDown,
    handleResizeMouseUp,
    handleResizeMouseMove,
  };
}
