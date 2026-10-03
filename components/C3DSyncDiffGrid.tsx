/**
 * Shared diff-grid UI for the C3D Sync Center.
 * Renders one category's diff entries with row selection and action overrides.
 */

import React, { useState } from 'react';
import {
  CategoryDiff,
  SyncDiffEntry,
  C3DSyncItemState,
  C3DSyncAction,
} from '../services/c3dSyncProtocol.ts';

export type OverrideIntent = 'cad' | 'lsai' | 'skip' | 'delete-cad' | 'delete-lsai';

/** Translate a friendly override intent into a concrete action for the item's state.
 *  Mirrors SyncWizardForm.ResolveOverrideAction on the DLL side. */
export function resolveOverrideAction(
  state: C3DSyncItemState,
  kind: OverrideIntent,
): C3DSyncAction | null {
  switch (kind) {
    case 'skip': return 'skip';
    case 'cad': // push CAD truth to LSAI
      return state === 'lsai-only' ? 'skip'
        : state === 'cad-only' ? 'create-lsai'
        : 'update-lsai';
    case 'lsai': // push LSAI truth to CAD
      return state === 'cad-only' ? 'skip'
        : state === 'lsai-only' ? 'create-cad'
        : 'update-cad';
    case 'delete-cad':
      return state === 'lsai-only' ? null : 'delete-cad';
    case 'delete-lsai':
      return state === 'cad-only' ? null : 'delete-lsai';
    default:
      return null;
  }
}

const STATE_BADGE: Record<C3DSyncItemState, { label: string; className: string }> = {
  'equal': { label: 'equal', className: 'bg-gray-700/60 text-gray-300' },
  'cad-only': { label: 'CAD only', className: 'bg-cyan-900/60 text-cyan-300' },
  'lsai-only': { label: 'LSAI only', className: 'bg-emerald-900/60 text-emerald-300' },
  'changed': { label: 'changed', className: 'bg-amber-900/60 text-amber-300' },
  'conflict': { label: 'CONFLICT', className: 'bg-red-900/70 text-red-300 font-bold' },
};

const ACTION_STYLE: Record<string, string> = {
  'create-cad': 'text-emerald-300',
  'update-cad': 'text-emerald-300',
  'create-lsai': 'text-cyan-300',
  'update-lsai': 'text-cyan-300',
  'delete-cad': 'text-red-400 font-semibold',
  'delete-lsai': 'text-red-400 font-semibold',
  'skip': 'text-gray-500',
};

function describeSides(entry: SyncDiffEntry<unknown>): string {
  if (entry.fieldDiffs && entry.fieldDiffs.length > 0) return entry.fieldDiffs.slice(0, 3).join('; ');
  switch (entry.state) {
    case 'cad-only': return 'Exists only in CAD';
    case 'lsai-only': return 'Exists only in LandSurv.ai';
    case 'conflict': return 'Changed on BOTH sides since last sync';
    default: return 'Differs between CAD and LandSurv.ai';
  }
}

interface DiffGridProps<T> {
  diff: CategoryDiff<T>;
  /** key → current planned action (already resolved through direction + overrides). */
  plannedActions: Map<string, C3DSyncAction>;
  /** Apply an override to one key (or all pending rows when key is null). */
  onOverride: (key: string | null, intent: OverrideIntent) => void;
}

export function C3DSyncDiffGrid<T>({ diff, plannedActions, onOverride }: DiffGridProps<T>) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const pending = diff.entries.filter(e => e.state !== 'equal');
  const selectedEntry = pending.find(e => e.key === selectedKey) ?? null;

  if (pending.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-[12px] text-gray-500">
        ✓ Both sides agree — nothing to sync in this category.
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* Bulk actions */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-gray-700/50 flex-wrap shrink-0">
        <span className="text-[10px] text-gray-500 mr-1">All rows:</span>
        <GridButton label="Use CAD" onClick={() => onOverride(null, 'cad')} />
        <GridButton label="Use LandSurv.ai" onClick={() => onOverride(null, 'lsai')} />
        <GridButton label="Skip all" onClick={() => onOverride(null, 'skip')} />
      </div>

      <div className="overflow-auto flex-grow min-h-0">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-gray-800/95 backdrop-blur-sm z-10">
            <tr className="text-left text-gray-400">
              <th className="px-2 py-1.5 font-semibold w-[22%]">Item</th>
              <th className="px-2 py-1.5 font-semibold w-[13%]">State</th>
              <th className="px-2 py-1.5 font-semibold w-[16%]">Action</th>
              <th className="px-2 py-1.5 font-semibold">Details</th>
            </tr>
          </thead>
          <tbody>
            {pending.map(entry => {
              const action = plannedActions.get(entry.key) ?? 'skip';
              const badge = STATE_BADGE[entry.state];
              const isSelected = entry.key === selectedKey;
              return (
                <tr
                  key={entry.key}
                  onClick={() => setSelectedKey(isSelected ? null : entry.key)}
                  className={`border-t border-gray-800/60 cursor-pointer transition-colors ${
                    isSelected ? 'bg-cyan-950/50 outline outline-1 outline-cyan-600/60' : 'hover:bg-gray-800/40'
                  }`}
                >
                  <td className="px-2 py-1.5 font-mono text-gray-200 truncate max-w-0">{entry.key}</td>
                  <td className="px-2 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap ${badge.className}`}>{badge.label}</span>
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={`font-mono text-[10px] whitespace-nowrap ${ACTION_STYLE[action] ?? 'text-gray-400'}`}>{action}</span>
                  </td>
                  <td className="px-2 py-1.5 text-gray-400 max-w-0" title={describeSides(entry)}>
                    <span className="truncate block">{describeSides(entry)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Selected-row overrides */}
      <div className="px-2 py-1.5 border-t border-gray-700/50 shrink-0 flex items-center gap-1.5 flex-wrap">
        {selectedEntry ? (
          <>
            <span className="text-[10px] text-gray-400 font-mono truncate max-w-[180px]">{selectedEntry.key}:</span>
            <GridButton label="Use CAD version" onClick={() => onOverride(selectedEntry.key, 'cad')} />
            <GridButton label="Use LandSurv.ai version" onClick={() => onOverride(selectedEntry.key, 'lsai')} />
            <GridButton label="Skip" onClick={() => onOverride(selectedEntry.key, 'skip')} />
            <GridButton label="Delete from CAD…" danger onClick={() => onOverride(selectedEntry.key, 'delete-cad')} />
            <GridButton label="Delete from LandSurv.ai…" danger onClick={() => onOverride(selectedEntry.key, 'delete-lsai')} />
          </>
        ) : (
          <span className="text-[10px] text-gray-600">Click a row to override its action individually.</span>
        )}
      </div>
    </div>
  );
}

function GridButton({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`px-2 py-0.5 rounded border text-[10px] transition-colors ${
        danger
          ? 'border-red-700/70 text-red-400 hover:bg-red-900/40'
          : 'border-gray-600 text-gray-300 hover:bg-gray-700 hover:border-cyan-500/60'
      }`}
    >
      {label}
    </button>
  );
}
