import { SessionFile, TinSurface } from '../types.ts';
import { importTinSurfaceFromSessionFile } from './TinImportService.ts';

/**
 * Client-side wrapper that runs TIN import inside a Web Worker so the heavy
 * binary parse / triangulation never blocks the UI thread.
 *
 * Falls back to a synchronous in-thread parse when Workers are unavailable
 * (e.g. the unit-test environment or an unusual browser), so callers can rely
 * on a single async entry point regardless of platform.
 */

interface TinWorkerResponse {
  id: number;
  ok: boolean;
  surface?: TinSurface;
  error?: string;
}

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, { resolve: (s: TinSurface) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./tinImport.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<TinWorkerResponse>) => {
      const { id, ok, surface, error } = event.data ?? ({} as TinWorkerResponse);
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      if (ok && surface) entry.resolve(surface);
      else entry.reject(new Error(error || 'TIN import failed in worker.'));
    };
    worker.onerror = (event) => {
      // Reject everything in flight, then drop the worker so the next call
      // falls back to synchronous parsing.
      const err = new Error(event.message || 'TIN import worker crashed.');
      for (const [, entry] of pending) entry.reject(err);
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

/**
 * Parse a TIN session file off the main thread. Resolves with the imported
 * `TinSurface`, or rejects with the parse error.
 */
export function importTinSurfaceFromSessionFileAsync(file: SessionFile): Promise<TinSurface> {
  const w = getWorker();
  if (!w) {
    // No worker support — run synchronously but still present an async API.
    return new Promise((resolve, reject) => {
      try {
        resolve(importTinSurfaceFromSessionFile(file));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  const id = nextRequestId++;
  return new Promise<TinSurface>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, file });
  });
}
