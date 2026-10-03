import { useEffect, useCallback, useRef } from 'react';
import type React from 'react';

/**
 * Custom hook to manage Floating Action Button (FAB) drag and position logic
 * 
 * Handles:
 * - Initial FAB positioning in the container
 * - Drag functionality with mouse and touch events
 * - Constraining FAB position within container bounds
 * - Window resize handling to maintain valid position
 * 
 * @param fabPosition - Current FAB position state
 * @param setFabPosition - Function to update FAB position
 * @param mainContentRef - Ref to the main content container
 * @param fabRef - Ref to the FAB element
 * @param isDesktop - Whether the app is in desktop mode
 * @param isInitialScreen - Whether initial screen is shown
 * @param showUploadScreen - Whether upload screen is shown
 * @param isChatPanelVisible - Whether chat panel is visible
 * @returns handleFabPointerDown - Handler for initiating drag
 */
export function useFabDrag(
  fabPosition: { x: number; y: number; initialized: boolean },
  setFabPosition: (updater: (prev: { x: number; y: number; initialized: boolean }) => { x: number; y: number; initialized: boolean }) => void,
  mainContentRef: React.RefObject<HTMLDivElement>,
  fabRef: React.RefObject<HTMLButtonElement>,
  isDesktop: boolean,
  isInitialScreen: boolean,
  showUploadScreen: boolean,
  isChatPanelVisible: boolean
) {
  const fabDragState = useRef({
    isDragging: false,
    hasMoved: false,
    startPos: { x: 0, y: 0 },
    offset: { x: 0, y: 0 },
  });

  // Handle FAB pointer down (initiate drag)
  const handleFabPointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const state = fabDragState.current;
    state.isDragging = true;
    state.hasMoved = false;
    const pos = 'touches' in e ? e.touches[0] : e;
    state.startPos = { x: pos.clientX, y: pos.clientY };
    const fabRect = fabRef.current!.getBoundingClientRect();
    state.offset = {
      x: pos.clientX - fabRect.left,
      y: pos.clientY - fabRect.top,
    };
  }, [fabRef]);

  // Position FAB initially and on resize
  useEffect(() => {
    const positionFab = () => {
      if (mainContentRef.current && fabRef.current) {
        const containerRect = mainContentRef.current.getBoundingClientRect();
        const fabRect = fabRef.current.getBoundingClientRect();
        
        if (containerRect.width === 0 || fabRect.width === 0) {
          return;
        }

        setFabPosition(prev => {
          if (!prev.initialized) {
            const rightOffset = 24;
            const bottomOffset = 24;
            return {
              x: containerRect.left + containerRect.width - fabRect.width - rightOffset,
              y: containerRect.top + containerRect.height - fabRect.height - bottomOffset,
              initialized: true,
            };
          }
          // When resizing, constrain the existing position that might have been changed by dragging
          return {
            ...prev,
            x: Math.max(containerRect.left, Math.min(prev.x, containerRect.right - fabRect.width)),
            y: Math.max(containerRect.top, Math.min(prev.y, containerRect.bottom - fabRect.height)),
          };
        });
      }
    };
    
    positionFab();
    
    window.addEventListener('resize', positionFab);
    return () => {
      window.removeEventListener('resize', positionFab);
    };
  }, [isDesktop, isInitialScreen, showUploadScreen, isChatPanelVisible, mainContentRef, fabRef, setFabPosition]);

  // Handle FAB dragging
  useEffect(() => {
    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      const state = fabDragState.current;
      if (!state.isDragging) return;

      const pos = 'touches' in e ? e.touches[0] : e;
      const distMoved = Math.hypot(pos.clientX - state.startPos.x, pos.clientY - state.startPos.y);

      if (distMoved > 5 && !state.hasMoved) {
        state.hasMoved = true;
        if (fabRef.current) fabRef.current.style.transition = 'none';
      }
      if (!state.hasMoved) return;
      
      if (e.cancelable) e.preventDefault();

      if (mainContentRef.current && fabRef.current) {
        const containerRect = mainContentRef.current.getBoundingClientRect();
        const fabRect = fabRef.current.getBoundingClientRect();
        let newX = pos.clientX - state.offset.x;
        let newY = pos.clientY - state.offset.y;
        newX = Math.max(containerRect.left, Math.min(newX, containerRect.right - fabRect.width));
        newY = Math.max(containerRect.top, Math.min(newY, containerRect.bottom - fabRect.height));
        setFabPosition(prev => ({ ...prev, x: newX, y: newY }));
      }
    };

    const handlePointerUp = () => {
      const state = fabDragState.current;
      if (!state.isDragging) return;
      state.isDragging = false;
      if (fabRef.current && state.hasMoved) {
        fabRef.current.style.transition = '';
      }
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchend', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [isDesktop, mainContentRef, fabRef, setFabPosition]);

  return { handleFabPointerDown, fabDragState };
}
