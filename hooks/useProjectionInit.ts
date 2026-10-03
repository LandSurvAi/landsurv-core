import { useEffect } from 'react';
import { initProjections } from '../utils/projections.ts';

/**
 * Custom hook that initializes projection systems on component mount.
 * This sets up the coordinate projection library (proj4) with all necessary projection definitions.
 * 
 * @example
 * ```tsx
 * useProjectionInit(); // Call once in your root component
 * ```
 */
export function useProjectionInit(): void {
  useEffect(() => {
    initProjections();
  }, []);
}
