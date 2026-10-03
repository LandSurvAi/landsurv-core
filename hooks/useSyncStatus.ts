import { useEffect, useState } from 'react';
import { getSyncStatus, onSyncStatusChange, type SyncStatus } from '../services/OfflineQueue';

export interface SyncState {
  status: SyncStatus;
  queueDepth: number;
  isOnline: boolean;
}

export const useSyncStatus = (): SyncState => {
  const [syncState, setSyncState] = useState<SyncState>(() => {
    const current = getSyncStatus();
    return {
      status: current.status,
      queueDepth: current.queueDepth,
      isOnline: current.isOnline,
    };
  });

  useEffect(() => {
    const unsubscribe = onSyncStatusChange((status, queueDepth) => {
      setSyncState((prev) => ({
        ...prev,
        status,
        queueDepth,
      }));
    });

    const handleOnline = () => {
      setSyncState((prev) => ({ ...prev, isOnline: true }));
    };

    const handleOffline = () => {
      setSyncState((prev) => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return syncState;
};
