import React from 'react';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { SyncStatus } from '../services/OfflineQueue';

const statusConfig = {
  [SyncStatus.IDLE]: {
    icon: '✓',
    label: 'Synced',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/40',
    textColor: 'text-emerald-300',
    badge: 'text-emerald-400 bg-emerald-500/20',
  },
  [SyncStatus.SYNCING]: {
    icon: '⟳',
    label: 'Syncing',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500/40',
    textColor: 'text-cyan-300',
    badge: 'text-cyan-400 bg-cyan-500/20',
  },
  [SyncStatus.FAILED]: {
    icon: '!',
    label: 'Sync failed',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/40',
    textColor: 'text-orange-300',
    badge: 'text-orange-400 bg-orange-500/20',
  },
  [SyncStatus.SUCCESS]: {
    icon: '✓',
    label: 'Update applied',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/40',
    textColor: 'text-emerald-300',
    badge: 'text-emerald-400 bg-emerald-500/20',
  },
};

export const SyncStatusIndicator: React.FC = () => {
  const { status, queueDepth, isOnline } = useSyncStatus();

  const config = statusConfig[status];

  if (!isOnline && queueDepth === 0) {
    return null;
  }

  return (
    <div
      className={`fixed bottom-4 left-4 rounded-lg border backdrop-blur px-3 py-2 text-xs font-medium ${config.bgColor} ${config.borderColor} ${config.textColor}`}
    >
      <div className="flex items-center gap-2">
        <span className={`${status === SyncStatus.SYNCING ? 'animate-spin' : ''}`}>
          {config.icon}
        </span>
        <span>{config.label}</span>
        {queueDepth > 0 && (
          <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold ${config.badge}`}>
            {queueDepth} {queueDepth === 1 ? 'item' : 'items'}
          </span>
        )}
      </div>
    </div>
  );
};
