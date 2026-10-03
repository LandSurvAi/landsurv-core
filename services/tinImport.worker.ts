/// <reference lib="webworker" />
/**
 * Web Worker that runs TIN parsing off the main thread.
 *
 * Carlson DTM binary parsing (and the convex-hull rebuild fallback) is CPU
 * heavy and fully synchronous. Running it on the main thread freezes the UI
 * long enough to trigger the browser's "page unresponsive" dialog. This worker
 * performs the identical work in the background and posts the finished
 * `TinSurface` back, keeping the UI responsive.
 *
 * The message contract is intentionally tiny:
 *   in : { id: number, file: SessionFile }
 *   out: { id, ok: true, surface } | { id, ok: false, error }
 */
import { importTinSurfaceFromSessionFile } from './TinImportService.ts';
import type { SessionFile } from '../types.ts';

interface TinWorkerRequest {
  id: number;
  file: SessionFile;
}

self.onmessage = (event: MessageEvent<TinWorkerRequest>) => {
  const { id, file } = event.data ?? ({} as TinWorkerRequest);
  try {
    const surface = importTinSurfaceFromSessionFile(file);
    (self as unknown as Worker).postMessage({ id, ok: true, surface });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    (self as unknown as Worker).postMessage({ id, ok: false, error });
  }
};
