import { useEffect } from 'react';

/**
 * Custom hook to handle desktop mode transitions
 * 
 * Sets the active visual panel to 'canvas' when entering desktop mode.
 * This ensures a consistent view when switching from mobile to desktop layout.
 * 
 * @param isDesktop - Whether the app is in desktop mode
 * @param setActiveVisualPanel - Function to set the active visual panel
 */
export function useDesktopEffect(
  isDesktop: boolean,
  setActiveVisualPanel: (panel: string) => void
) {
  useEffect(() => {
    setActiveVisualPanel('canvas');
  }, [isDesktop, setActiveVisualPanel]);
}
