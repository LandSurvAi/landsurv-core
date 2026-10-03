/**
 * Offline persistence layer using IndexedDB.
 * Stores cached sessions, request queue, and sync metadata.
 */

export interface QueuedRequest {
  id: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers: Record<string, string>;
  body?: string;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
  lastError?: string;
}

export interface SyncMetadata {
  id: 'sync';
  lastSyncAt: number;
  queuedRequestCount: number;
  isOnline: boolean;
}

export interface OfflineSession {
  id: string;
  name: string;
  sessionData: string;
  savedAt: number;
  size: number;
}

const DB_NAME = 'landsurv-ai-offline';
const DB_VERSION = 1;
const QUEUE_STORE = 'request_queue';
const SESSION_STORE = 'offline_sessions';
const METADATA_STORE = 'sync_metadata';

let dbInstance: IDBDatabase | null = null;

const getDb = (): Promise<IDBDatabase> => {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const queueStore = db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
        queueStore.createIndex('timestamp', 'timestamp', { unique: false });
        queueStore.createIndex('retryCount', 'retryCount', { unique: false });
      }

      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        const sessionStore = db.createObjectStore(SESSION_STORE, { keyPath: 'id' });
        sessionStore.createIndex('savedAt', 'savedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(METADATA_STORE)) {
        db.createObjectStore(METADATA_STORE, { keyPath: 'id' });
      }
    };
  });
};

/**
 * Add a request to the offline queue for later replay.
 */
export const enqueueRequest = async (request: QueuedRequest): Promise<void> => {
  const db = await getDb();
  const tx = db.transaction([QUEUE_STORE, METADATA_STORE], 'readwrite');

  return new Promise((resolve, reject) => {
    const queueStore = tx.objectStore(QUEUE_STORE);
    const queueReq = queueStore.add(request);

    queueReq.onerror = () => reject(queueReq.error);

    const metaStore = tx.objectStore(METADATA_STORE);
    const getMeta = metaStore.get('sync');

    getMeta.onsuccess = () => {
      const meta = (getMeta.result as SyncMetadata) || {
        id: 'sync',
        lastSyncAt: 0,
        queuedRequestCount: 0,
        isOnline: navigator.onLine,
      };

      meta.queuedRequestCount += 1;
      metaStore.put(meta);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
  });
};

/**
 * Fetch all queued requests sorted by timestamp and retry count.
 */
export const getQueuedRequests = async (): Promise<QueuedRequest[]> => {
  const db = await getDb();
  const store = db.transaction(QUEUE_STORE, 'readonly').objectStore(QUEUE_STORE);

  return new Promise((resolve, reject) => {
    const index = store.index('timestamp');
    const range = IDBKeyRange.bound(0, Infinity);
    const request = index.getAll(range);

    request.onsuccess = () => {
      resolve((request.result as QueuedRequest[]) || []);
    };
    request.onerror = () => reject(request.error);
  });
};

/**
 * Remove a request from the queue after successful replay.
 */
export const removeQueuedRequest = async (requestId: string): Promise<void> => {
  const db = await getDb();
  const tx = db.transaction([QUEUE_STORE, METADATA_STORE], 'readwrite');

  return new Promise((resolve, reject) => {
    const queueStore = tx.objectStore(QUEUE_STORE);
    const deleteReq = queueStore.delete(requestId);

    deleteReq.onerror = () => reject(deleteReq.error);

    const metaStore = tx.objectStore(METADATA_STORE);
    const getMeta = metaStore.get('sync');

    getMeta.onsuccess = () => {
      const meta = (getMeta.result as SyncMetadata) || {
        id: 'sync',
        lastSyncAt: 0,
        queuedRequestCount: 0,
        isOnline: navigator.onLine,
      };

      meta.queuedRequestCount = Math.max(0, meta.queuedRequestCount - 1);
      metaStore.put(meta);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
  });
};

/**
 * Update retry count and error for a failed queued request.
 */
export const updateQueuedRequestError = async (
  requestId: string,
  error: string,
  retryCount: number
): Promise<void> => {
  const db = await getDb();
  const store = db.transaction(QUEUE_STORE, 'readwrite').objectStore(QUEUE_STORE);

  return new Promise((resolve, reject) => {
    const getReq = store.get(requestId);

    getReq.onsuccess = () => {
      const qRequest = getReq.result as QueuedRequest | undefined;
      if (!qRequest) {
        resolve();
        return;
      }

      qRequest.lastError = error;
      qRequest.retryCount = retryCount;

      const updateReq = store.put(qRequest);
      updateReq.onsuccess = () => resolve();
      updateReq.onerror = () => reject(updateReq.error);
    };

    getReq.onerror = () => reject(getReq.error);
  });
};

/**
 * Save a session snapshot for offline access.
 */
export const saveOfflineSession = async (
  sessionId: string,
  sessionName: string,
  sessionData: unknown
): Promise<void> => {
  const db = await getDb();
  const serialized = JSON.stringify(sessionData);
  const session: OfflineSession = {
    id: sessionId,
    name: sessionName,
    sessionData: serialized,
    savedAt: Date.now(),
    size: new Blob([serialized]).size,
  };

  const store = db.transaction(SESSION_STORE, 'readwrite').objectStore(SESSION_STORE);

  return new Promise((resolve, reject) => {
    const request = store.put(session);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * Fetch a saved offline session.
 */
export const getOfflineSession = async (sessionId: string): Promise<unknown | null> => {
  const db = await getDb();
  const store = db.transaction(SESSION_STORE, 'readonly').objectStore(SESSION_STORE);

  return new Promise((resolve, reject) => {
    const request = store.get(sessionId);

    request.onsuccess = () => {
      const session = request.result as OfflineSession | undefined;
      if (session) {
        resolve(JSON.parse(session.sessionData));
      } else {
        resolve(null);
      }
    };

    request.onerror = () => reject(request.error);
  });
};

/**
 * List all saved offline sessions.
 */
export const listOfflineSessions = async (): Promise<OfflineSession[]> => {
  const db = await getDb();
  const store = db.transaction(SESSION_STORE, 'readonly').objectStore(SESSION_STORE);

  return new Promise((resolve, reject) => {
    const request = store.getAll();

    request.onsuccess = () => {
      resolve((request.result as OfflineSession[]) || []);
    };

    request.onerror = () => reject(request.error);
  });
};

/**
 * Delete a saved offline session.
 */
export const deleteOfflineSession = async (sessionId: string): Promise<void> => {
  const db = await getDb();
  const store = db.transaction(SESSION_STORE, 'readwrite').objectStore(SESSION_STORE);

  return new Promise((resolve, reject) => {
    const request = store.delete(sessionId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * Get sync metadata (online status, last sync time, queue depth).
 */
export const getSyncMetadata = async (): Promise<SyncMetadata> => {
  const db = await getDb();
  const store = db.transaction(METADATA_STORE, 'readonly').objectStore(METADATA_STORE);

  return new Promise((resolve, reject) => {
    const request = store.get('sync');

    request.onsuccess = () => {
      const meta = (request.result as SyncMetadata) || {
        id: 'sync',
        lastSyncAt: 0,
        queuedRequestCount: 0,
        isOnline: navigator.onLine,
      };

      resolve(meta);
    };

    request.onerror = () => reject(request.error);
  });
};

/**
 * Update sync metadata (e.g., mark sync complete, update online status).
 */
export const updateSyncMetadata = async (
  updates: Partial<Omit<SyncMetadata, 'id'>>
): Promise<void> => {
  const db = await getDb();
  const store = db.transaction(METADATA_STORE, 'readwrite').objectStore(METADATA_STORE);

  return new Promise((resolve, reject) => {
    const getMeta = store.get('sync');

    getMeta.onsuccess = () => {
      const meta = (getMeta.result as SyncMetadata) || {
        id: 'sync',
        lastSyncAt: 0,
        queuedRequestCount: 0,
        isOnline: navigator.onLine,
      };

      Object.assign(meta, updates);

      const putReq = store.put(meta);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };

    getMeta.onerror = () => reject(getMeta.error);
  });
};

/**
 * Clear all offline data (queue, sessions, metadata).
 */
export const clearAllOfflineData = async (): Promise<void> => {
  const db = await getDb();
  const tx = db.transaction([QUEUE_STORE, SESSION_STORE, METADATA_STORE], 'readwrite');

  return new Promise((resolve, reject) => {
    [QUEUE_STORE, SESSION_STORE, METADATA_STORE].forEach((storeName) => {
      const store = tx.objectStore(storeName);
      store.clear();
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};
