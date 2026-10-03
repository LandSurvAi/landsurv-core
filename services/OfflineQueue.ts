/**
 * Offline request queue and replay orchestrator.
 * Intercepts API calls, queues them when offline, and replays on reconnect.
 */

import {
  enqueueRequest,
  getQueuedRequests,
  removeQueuedRequest,
  updateQueuedRequestError,
  updateSyncMetadata,
  type QueuedRequest,
} from './OfflineStore';

const generateUuid = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export enum SyncStatus {
  IDLE = 'idle',
  SYNCING = 'syncing',
  FAILED = 'failed',
  SUCCESS = 'success',
}

type SyncStatusListener = (status: SyncStatus, queueDepth: number) => void;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const QUEUE_CHECK_INTERVAL_MS = 5000;

let syncStatus = SyncStatus.IDLE;
let queueDepth = 0;
let isOnline = navigator.onLine;
const statusListeners = new Set<SyncStatusListener>();

let syncIntervalId: ReturnType<typeof setInterval> | null = null;

const notifyStatusChange = () => {
  statusListeners.forEach((listener) => {
    listener(syncStatus, queueDepth);
  });
};

const setSyncStatus = (status: SyncStatus) => {
  if (syncStatus !== status) {
    syncStatus = status;
    notifyStatusChange();
  }
};

const setQueueDepth = (depth: number) => {
  if (queueDepth !== depth) {
    queueDepth = depth;
    notifyStatusChange();
  }
};

/**
 * Subscribe to sync status changes.
 */
export const onSyncStatusChange = (listener: SyncStatusListener): (() => void) => {
  statusListeners.add(listener);
  listener(syncStatus, queueDepth);

  return () => {
    statusListeners.delete(listener);
  };
};

/**
 * Get current sync status and queue depth.
 */
export const getSyncStatus = () => ({
  status: syncStatus,
  queueDepth,
  isOnline,
});

/**
 * Manually queue a request for offline replay.
 */
export const queueApiRequest = async (
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  headers: Record<string, string> = {},
  body?: unknown
): Promise<string> => {
  const requestId = generateUuid();

  const queuedRequest: QueuedRequest = {
    id: requestId,
    url,
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    timestamp: Date.now(),
    retryCount: 0,
    maxRetries: MAX_RETRIES,
  };

  await enqueueRequest(queuedRequest);
  await updateSyncMetadata({ queuedRequestCount: queueDepth + 1 });
  setQueueDepth(queueDepth + 1);

  return requestId;
};

/**
 * Replay a single queued request.
 */
const replayRequest = async (queuedRequest: QueuedRequest): Promise<boolean> => {
  try {
    const init: RequestInit = {
      method: queuedRequest.method,
      headers: {
        'Content-Type': 'application/json',
        ...queuedRequest.headers,
      },
    };

    if (queuedRequest.body) {
      init.body = queuedRequest.body;
    }

    const response = await fetch(queuedRequest.url, init);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    await removeQueuedRequest(queuedRequest.id);
    setQueueDepth(Math.max(0, queueDepth - 1));

    return true;
  } catch (error) {
    const nextRetryCount = queuedRequest.retryCount + 1;
    const errorMsg = error instanceof Error ? error.message : String(error);

    await updateQueuedRequestError(queuedRequest.id, errorMsg, nextRetryCount);

    if (nextRetryCount >= queuedRequest.maxRetries) {
      await removeQueuedRequest(queuedRequest.id);
      setQueueDepth(Math.max(0, queueDepth - 1));
    }

    return false;
  }
};

/**
 * Replay all queued requests.
 */
export const replayQueuedRequests = async (): Promise<void> => {
  if (syncStatus === SyncStatus.SYNCING || !isOnline) {
    return;
  }

  setSyncStatus(SyncStatus.SYNCING);

  try {
    const requests = await getQueuedRequests();

    if (requests.length === 0) {
      setSyncStatus(SyncStatus.SUCCESS);
      await updateSyncMetadata({ lastSyncAt: Date.now() });

      setTimeout(() => {
        setSyncStatus(SyncStatus.IDLE);
      }, 2000);

      return;
    }

    let successCount = 0;
    let failureCount = 0;

    for (const request of requests) {
      if (request.retryCount >= request.maxRetries) {
        failureCount++;
        continue;
      }

      const success = await replayRequest(request);
      if (success) {
        successCount++;
      } else {
        failureCount++;
      }

      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }

    if (failureCount > 0) {
      setSyncStatus(SyncStatus.FAILED);
    } else {
      setSyncStatus(SyncStatus.SUCCESS);
      await updateSyncMetadata({ lastSyncAt: Date.now() });

      setTimeout(() => {
        setSyncStatus(SyncStatus.IDLE);
      }, 2000);
    }
  } catch (error) {
    setSyncStatus(SyncStatus.FAILED);
  }
};

/**
 * Initialize offline queue listeners and periodic checks.
 */
export const initializeOfflineQueue = (): void => {
  const onOnline = () => {
    isOnline = true;
    updateSyncMetadata({ isOnline: true });
    replayQueuedRequests();
  };

  const onOffline = () => {
    isOnline = false;
    updateSyncMetadata({ isOnline: false });
    setSyncStatus(SyncStatus.IDLE);
  };

  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);

  if (syncIntervalId) {
    clearInterval(syncIntervalId);
  }

  syncIntervalId = setInterval(() => {
    if (isOnline && queueDepth > 0) {
      replayQueuedRequests();
    }
  }, QUEUE_CHECK_INTERVAL_MS);
};

/**
 * Clean up offline queue listeners and timers.
 */
export const cleanupOfflineQueue = (): void => {
  window.removeEventListener('online', () => {});
  window.removeEventListener('offline', () => {});

  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
};
