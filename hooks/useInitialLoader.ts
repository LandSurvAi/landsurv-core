import { useEffect } from 'react';

/**
 * Custom hook for smoothly removing the initial page loader.
 * Crucial UX feature that fades out and removes the loading screen.
 * 
 * @param transitionDuration - Duration in ms for fade out animation (default: 500ms)
 * @param skipRemoval - If true, the loader will be immediately hidden (useful for XML sitemaps and crawlers)
 */
export function useInitialLoader(transitionDuration: number = 500, skipRemoval: boolean = false) {
  useEffect(() => {
    const loader = document.getElementById('initial-loader');
    if (loader) {
      if (skipRemoval) {
        // For XML sitemaps and crawlers: immediately hide and remove to avoid blocking
        loader.style.display = 'none';
        loader.parentElement?.removeChild(loader);
      } else {
        // Normal case: wait a moment for React to fully render, then fade out
        setTimeout(() => {
          loader.classList.add('hidden');
          // Remove from DOM after transition
          setTimeout(() => {
            if (loader.parentElement) {
              loader.parentElement.removeChild(loader);
            }
          }, transitionDuration); // Matches CSS transition duration
        }, 100); // Small delay to ensure React has rendered
      }
    }
  }, [transitionDuration, skipRemoval]);
}
