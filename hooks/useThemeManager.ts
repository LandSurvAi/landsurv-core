import { useEffect } from 'react';

/**
 * Custom hook that manages the theme by adding/removing CSS classes on the body element.
 * 
 * @param theme - The current theme ('light' or 'dark')
 * 
 * @example
 * ```tsx
 * const { theme } = useAppState();
 * useThemeManager(theme);
 * ```
 * 
 * CSS Usage:
 * ```css
 * body.light-theme {
 *   background: white;
 *   color: black;
 * }
 * ```
 */
export function useThemeManager(theme: 'light' | 'dark'): void {
  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
  }, [theme]);
}
