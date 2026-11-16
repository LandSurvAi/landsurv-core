/**
 * IndexedDB store for recording bundles.
 *
 * Local-first: the browser copy is authoritative for the library on this
 * device. V1 is retained for the recorder/library; v2 is written alongside it
 * for real-app playback.
 */

import type { RecordingBundle, RecordingSummary } from '../../utils/recording/types';
import type { RecordingBundleV2, TakeoverDocument } from '../../utils/recording/v2';
import type { AnnotationDocument } from '../../utils/recording/types';
import { toDisplaySettings } from '../../utils/recording/settings';

const DB_NAME = 'landsurv-recordings';
const DB_VERSION = 2;
const STORE = 'recordings';
const V2_STORE = 'recordingsV2';
const ASSETS_STORE = 'assets';
const HANDOFFS_STORE = 'handoffs';

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
      if (!db.objectStoreNames.contains(V2_STORE)) {
        const store = db.createObjectStore(V2_STORE, { keyPath: 'manifest.id' });
        store.createIndex('createdAt', 'manifest.createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(ASSETS_STORE)) {
        db.createObjectStore(ASSETS_STORE);
      }
      if (!db.objectStoreNames.contains(HANDOFFS_STORE)) {
        db.createObjectStore(HANDOFFS_STORE, { keyPath: 'id' });
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

const sanitizeV1Bundle = (bundle: RecordingBundle): { bundle: RecordingBundle; changed: boolean } => {
  const settings = bundle.startState?.project?.settings;
  if (!settings) return { bundle, changed: false };
  const sanitized = toDisplaySettings(settings as Record<string, unknown>);
  if (JSON.stringify(settings) === JSON.stringify(sanitized)) {
    return { bundle, changed: false };
  }
  return {
    bundle: {
      ...bundle,
      startState: {
        ...bundle.startState,
        project: { ...bundle.startState.project, settings: sanitized },
      },
    },
    changed: true,
  };
};

export const saveRecordingBundle = async (bundle: RecordingBundle): Promise<void> => {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  await new Promise<void>((resolve, reject) => {
    tx.objectStore(STORE).put(sanitizeV1Bundle(bundle).bundle);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not save the recording.'));
    tx.onabort = () => reject(tx.error ?? new Error('Recording save was aborted.'));
  });
};

export const getRecordingBundle = async (id: string): Promise<RecordingBundle | null> => {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const result = await requestToPromise(tx.objectStore(STORE).get(id));
  const bundle = (result as RecordingBundle | undefined) ?? null;
  return bundle ? sanitizeV1Bundle(bundle).bundle : null;
};

let scrubPromise: Promise<void> | null = null;

/** One-time migration for v1 bundles saved before settings were allowlisted. */
export const scrubLegacyRecordingCredentials = (): Promise<void> => {
  if (scrubPromise) return scrubPromise;
  scrubPromise = (async () => {
    const db = await openDb();
    const readTx = db.transaction(STORE, 'readonly');
    const rows = (await requestToPromise(readTx.objectStore(STORE).getAll())) as RecordingBundle[];
    const changed = rows
      .map(row => sanitizeV1Bundle(row))
      .filter(entry => entry.changed);
    if (changed.length === 0) return;

    const writeTx = db.transaction(STORE, 'readwrite');
    await new Promise<void>((resolve, reject) => {
      for (const entry of changed) writeTx.objectStore(STORE).put(entry.bundle);
      writeTx.oncomplete = () => resolve();
      writeTx.onerror = () => reject(writeTx.error ?? new Error('Could not scrub old recording credentials.'));
    });
  })().catch(error => {
    scrubPromise = null;
    throw error;
  });
  return scrubPromise;
};

export const saveRecordingBundleV2 = async (bundle: RecordingBundleV2): Promise<void> => {
  const db = await openDb();
  const tx = db.transaction(V2_STORE, 'readwrite');
  await new Promise<void>((resolve, reject) => {
    tx.objectStore(V2_STORE).put(bundle);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not save the app-playback recording.'));
    tx.onabort = () => reject(tx.error ?? new Error('App-playback recording save was aborted.'));
  });
};

export const getRecordingBundleV2 = async (id: string): Promise<RecordingBundleV2 | null> => {
  const db = await openDb();
  const tx = db.transaction(V2_STORE, 'readonly');
  const result = await requestToPromise(tx.objectStore(V2_STORE).get(id));
  return (result as RecordingBundleV2 | undefined) ?? null;
};

export const saveRecordingAsset = async (id: string, data: string): Promise<void> => {
  const db = await openDb();
  const tx = db.transaction(ASSETS_STORE, 'readwrite');
  await new Promise<void>((resolve, reject) => {
    tx.objectStore(ASSETS_STORE).put(data, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not save recording asset.'));
  });
};

export const getRecordingAsset = async (id: string): Promise<string | null> => {
  const db = await openDb();
  const tx = db.transaction(ASSETS_STORE, 'readonly');
  const result = await requestToPromise(tx.objectStore(ASSETS_STORE).get(id));
  return typeof result === 'string' ? result : null;
};

export const saveRecordingAnnotationsV2 = async (
  id: string,
  annotations: AnnotationDocument,
): Promise<void> => {
  const bundle = await getRecordingBundleV2(id);
  if (!bundle) throw new Error('This recording is no longer available.');
  bundle.annotations = annotations;
  bundle.manifest.status = 'edited';
  bundle.manifest.updatedAt = new Date().toISOString();
  bundle.manifest.counts.chapters = annotations.chapters.length;
  bundle.manifest.counts.callouts = annotations.callouts.length;
  bundle.manifest.counts.strokes = annotations.strokes.length;
  bundle.manifest.counts.masks = annotations.masks.length;
  await saveRecordingBundleV2(bundle);
};

export const saveTakeoverHandoff = async (document: TakeoverDocument): Promise<void> => {
  const db = await openDb();
  const tx = db.transaction(HANDOFFS_STORE, 'readwrite');
  await new Promise<void>((resolve, reject) => {
    tx.objectStore(HANDOFFS_STORE).put(document);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not save the takeover handoff.'));
    tx.onabort = () => reject(tx.error ?? new Error('Takeover handoff save was aborted.'));
  });
};

export const getTakeoverHandoff = async (id: string): Promise<TakeoverDocument | null> => {
  const db = await openDb();
  const tx = db.transaction(HANDOFFS_STORE, 'readonly');
  const result = await requestToPromise(tx.objectStore(HANDOFFS_STORE).get(id));
  return (result as TakeoverDocument | undefined) ?? null;
};

export const deleteTakeoverHandoff = async (id: string): Promise<void> => {
  const db = await openDb();
  const tx = db.transaction(HANDOFFS_STORE, 'readwrite');
  await new Promise<void>((resolve, reject) => {
    tx.objectStore(HANDOFFS_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not clear the takeover handoff.'));
  });
};

export const deleteRecording = async (id: string): Promise<void> => {
  const db = await openDb();
  const tx = db.transaction([STORE, V2_STORE], 'readwrite');
  await new Promise<void>((resolve, reject) => {
    tx.objectStore(STORE).delete(id);
    tx.objectStore(V2_STORE).delete(id);
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
