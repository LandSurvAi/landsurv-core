import { useEffect } from 'react';

/**
 * Custom hook that manages the CSS --app-height variable to handle mobile viewport height issues.
 * This ensures the app takes the correct height on mobile devices where the address bar can affect viewport height.
 * 
 * @example
 * ```tsx
 * useAppHeight(); // Call in your root component
 * ```
 * 
 * Then in CSS:
 * ```css
 * .app-container {
 *   height: var(--app-height);
 * }
 * ```
 */
export function useAppHeight(): void {
  useEffect(() => {
    const viewport = window.visualViewport;

    let frame = 0;
    const setAppHeight = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Prefer visualViewport.height: on mobile browsers it accurately tracks
        // the actual visible area as the dynamic address/tool bars show and hide,
        // whereas window.innerHeight can lag and leave a gap at the bottom.
        const height = viewport?.height ?? window.innerHeight;
        document.documentElement.style.setProperty('--app-height', `${Math.round(height)}px`);
      });
    };

    window.addEventListener('resize', setAppHeight);
    window.addEventListener('orientationchange', setAppHeight);
    viewport?.addEventListener('resize', setAppHeight);
    viewport?.addEventListener('scroll', setAppHeight);
    setAppHeight();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('resize', setAppHeight);
      window.removeEventListener('orientationchange', setAppHeight);
      viewport?.removeEventListener('resize', setAppHeight);
      viewport?.removeEventListener('scroll', setAppHeight);
    };
  }, []);
}
