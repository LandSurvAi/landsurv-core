import { useEffect } from 'react';
import { initProjections } from '../utils/projections.ts';
import { ensureCrsRegistered } from '../utils/crs/registry.ts';

const PROJECTION_STORAGE_KEY = 'landsurv_projection';

/**
 * Custom hook that initializes projection systems on component mount.
 * This sets up the coordinate projection library (proj4) with all necessary projection definitions.
 *
 * It also re-registers a globally selected projection persisted from a prior
 * session (the header only supports US State Plane, so a saved worldwide CRS
 * must be re-injected asynchronously).
 *
 * @example
 * ```tsx
 * useProjectionInit(); // Call once in your root component
 * ```
 */
export function useProjectionInit(): void {
  useEffect(() => {
    initProjections();

    try {
      const raw = typeof localStorage !== 'undefined'
        ? localStorage.getItem(PROJECTION_STORAGE_KEY)
        : null;
      const epsg = raw ? Number(JSON.parse(raw)?.epsg) : NaN;
      if (Number.isFinite(epsg) && epsg > 0) {
        void ensureCrsRegistered(epsg).catch(() => {
          // Backend/registry unavailable — the canvas will use WGS84 fallback.
        });
      }
    } catch {
      // No persisted projection, or malformed storage.
    }
  }, []);
}
