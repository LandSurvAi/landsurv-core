/**
 * IndexedDB store for recording bundles.
 *
 * Local-first: the browser copy is authoritative for the library on this
 * device. A .lsvz remains the portable copy. Nothing here uploads bytes.
 */

import type { RecordingBundle, RecordingSummary } from '../../utils/recording/types';

const DB_NAME = 'landsurv-recordings';
const DB_VERSION = 1;
const STORE = 'recordings';

let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = (): Promise<IDBDatabase> => {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Recording storage is unavailable in this environment.'));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('Could not open recording storage.'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'manifest.id' });
        store.createIndex('createdAt', 'manifest.createdAt', { unique: false });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
  return dbPromise;
};

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Recording storage request failed.'));
  });

export const saveRecordingBundle = async (bundle: RecordingBundle): Promise<void> => {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  await new Promise<void>((resolve, reject) => {
    tx.objectStore(STORE).put(bundle);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not save the recording.'));
    tx.onabort = () => reject(tx.error ?? new Error('Recording save was aborted.'));
  });
};

export const getRecordingBundle = async (id: string): Promise<RecordingBundle | null> => {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const result = await requestToPromise(tx.objectStore(STORE).get(id));
  return (result as RecordingBundle | undefined) ?? null;
};

export const deleteRecording = async (id: string): Promise<void> => {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  await new Promise<void>((resolve, reject) => {
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not delete the recording.'));
  });
};

export const listRecordingSummaries = async (): Promise<RecordingSummary[]> => {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const rows = (await requestToPromise(tx.objectStore(STORE).getAll())) as RecordingBundle[];
  return rows
    .filter(row => row && row.manifest && typeof row.manifest.id === 'string')
    .sort((a, b) => b.manifest.createdAt.localeCompare(a.manifest.createdAt))
    .map(row => ({
      id: row.manifest.id,
      title: row.manifest.title,
      createdAt: row.manifest.createdAt,
      durationMs: row.manifest.durationMs,
      editedDurationMs: row.manifest.editedDurationMs ?? row.manifest.durationMs,
      eventCount: row.manifest.counts?.events ?? row.events?.length ?? 0,
      status: row.manifest.status,
      aiReveal: row.manifest.aiReveal,
    }));
};

/** Test-only reset so suites do not leak a cached connection. */
export const __resetRecordingStoreForTests = (): void => {
  dbPromise = null;
};
