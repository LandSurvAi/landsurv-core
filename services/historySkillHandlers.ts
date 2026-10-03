// Edit-history CACP skill handlers.
//
// Wires the `history_query` and `history_undo_to` commands declared in
// services/historySkillSchemas.ts, letting the assistant service natural-language
// undo requests ("undo the last boundary edit") against the canvas history
// engine.
//
// Usage in App.tsx:
//   useHistorySkills({ logActionToFieldbook });

import { useEffect, useRef } from 'react';
import { interAgentComm, type AgentMessage, type AgentResponse } from './InterAgentCommunication';
import { AgentType } from '../types';
import { useCanvasHistory, type CanvasHistoryEntry } from '../contexts/CanvasHistoryContext';

export interface UseHistorySkillsOpts {
  logActionToFieldbook?: (msg: string) => void;
}

function respond(
  msg: AgentMessage,
  success: boolean,
  data?: Record<string, unknown>,
  error?: string,
): AgentResponse {
  return {
    requestId: msg.id,
    from: AgentType.POINT_EDITOR,
    success,
    data,
    error,
    timestamp: Date.now(),
  };
}

/** Entries newest-first, annotated with how many undo steps back each one is. */
function orderedEntries(entries: CanvasHistoryEntry[]) {
  const currentIndex = entries.findIndex(e => e.isCurrent);
  return entries
    .map((e, i) => ({
      id: e.id,
      label: e.label,
      timestamp: e.timestamp,
      tags: e.tags,
      isCurrent: e.isCurrent,
      stepsBack: currentIndex - i,
    }))
    .reverse();
}

/**
 * Registers the history CACP skill handlers.
 *
 * Must be called from inside a CanvasHistoryProvider. A ref keeps the handlers
 * reading the latest history state, so a long-lived interAgentComm subscription
 * never operates on a stale snapshot.
 */
export function useHistorySkills({ logActionToFieldbook }: UseHistorySkillsOpts = {}): void {
  const history = useCanvasHistory();
  const historyRef = useRef(history);
  historyRef.current = history;

  useEffect(() => {
    const unsubQuery = interAgentComm.onCommand(
      'history_query',
      async (message): Promise<AgentResponse> => {
        const d = (message.data ?? {}) as Record<string, unknown>;
        const limit = typeof d.limit === 'number' && d.limit > 0 ? Math.floor(d.limit) : 25;
        const tag = typeof d.tag === 'string' ? d.tag.toLowerCase().trim() : null;

        const h = historyRef.current;
        let entries = orderedEntries(h.entries);
        if (tag) entries = entries.filter(e => e.tags.includes(tag));

        const current = h.entries.find(e => e.isCurrent);

        return respond(message, true, {
          entries: entries.slice(0, limit),
          currentEntryId: current?.id ?? null,
          canUndo: h.canUndo,
          canRedo: h.canRedo,
        });
      },
    );

    const unsubUndoTo = interAgentComm.onCommand(
      'history_undo_to',
      async (message): Promise<AgentResponse> => {
        const d = (message.data ?? {}) as Record<string, unknown>;
        const entryId = typeof d.entryId === 'string' ? d.entryId : null;
        const confirm = d.confirm === true;

        if (!entryId) {
          return respond(message, false, undefined, 'entryId is required. Call history_query first to obtain one.');
        }

        const h = historyRef.current;
        const targetIndex = h.entries.findIndex(e => e.id === entryId);
        if (targetIndex < 0) {
          return respond(
            message,
            false,
            undefined,
            `No history entry with id "${entryId}". Call history_query for current ids.`,
          );
        }

        const currentIndex = h.entries.findIndex(e => e.isCurrent);
        if (targetIndex === currentIndex) {
          return respond(message, true, {
            applied: false,
            discarded: [],
            restoredLabel: h.entries[targetIndex].label,
          }, undefined);
        }

        // Operations between the target and the current state are what a revert
        // would discard, newest first.
        const discarded = targetIndex < currentIndex
          ? h.entries.slice(targetIndex + 1, currentIndex + 1).map(e => e.label).reverse()
          : [];

        // Guard multi-step reverts behind explicit confirmation so the assistant
        // has to tell the user what it is about to throw away.
        if (discarded.length > 1 && !confirm) {
          return respond(message, true, {
            applied: false,
            needsConfirmation: true,
            discarded,
            restoredLabel: h.entries[targetIndex].label,
          });
        }

        const applied = h.jumpTo(entryId);
        if (!applied) {
          return respond(message, false, undefined, 'Could not restore that history entry.');
        }

        const restoredLabel = h.entries[targetIndex].label;
        if (logActionToFieldbook) {
          logActionToFieldbook(
            discarded.length > 0
              ? `Undid ${discarded.length} operation${discarded.length === 1 ? '' : 's'} (${discarded.join(', ')}).`
              : `Restored drawing to "${restoredLabel}".`,
          );
        }

        return respond(message, true, {
          applied: true,
          discarded,
          restoredLabel,
        });
      },
    );

    return () => {
      unsubQuery();
      unsubUndoTo();
    };
  }, [logActionToFieldbook]);
}
