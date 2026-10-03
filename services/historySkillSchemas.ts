// Edit-history CACP skill schemas.
//
// These let any agent answer natural-language undo requests such as
// "undo the last boundary edit" or "go back to before I moved those points".
// The engine stores full snapshots, so reverting several steps at once is exact
// rather than a replay of inverse operations.
//
// Handlers live in services/historySkillHandlers.ts and are wired into App.tsx
// via the useHistorySkills() hook.

import type { SkillSchema } from './AgentRegistry';

export const HISTORY_SKILLS: SkillSchema[] = [
  {
    id: 'history_query',
    name: 'Query Edit History',
    type: 'query' as const,
    description:
      'Lists the recorded edit history for the current drawing session, newest first. Each entry ' +
      'has a stable id, a human-readable label ("Deleted 3 points", "Drew boundary", "Moved point 104"), ' +
      'a timestamp, and tags identifying which areas it touched (points, lines, centerlines, contours, ' +
      'boundary). Exactly one entry is marked isCurrent — that is the state the session is sitting on. ' +
      'Call this FIRST whenever the user asks to undo something described in words rather than simply ' +
      'pressing undo, so you can identify which entry they mean before reverting anything.',
    inputs: {
      limit: {
        type: 'integer',
        description: 'Maximum number of entries to return, newest first. Default 25.',
        default: 25,
      },
      tag: {
        type: 'string',
        description:
          'Optional filter restricting results to entries that touched one area. ' +
          'One of: points, lines, centerlines, contours, boundary.',
        enum: ['points', 'lines', 'centerlines', 'contours', 'boundary'],
      },
    },
    outputs: {
      entries: {
        type: 'array',
        items: { type: 'object' },
        required: true,
        description:
          'History entries, newest first. Each: { id, label, timestamp, tags[], isCurrent, stepsBack }. ' +
          '`stepsBack` is how many undo presses that entry is from the current state.',
      },
      currentEntryId: {
        type: 'string',
        required: true,
        description: 'Id of the entry representing the current state.',
      },
      canUndo: { type: 'boolean', required: true },
      canRedo: { type: 'boolean', required: true },
    },
    examples: [
      'User: "undo the last boundary edit" -> history_query {tag:"boundary"} then history_undo_to with the newest boundary entry.',
      'User: "what have I changed?" -> history_query {limit:10}.',
    ],
  },
  {
    id: 'history_undo_to',
    name: 'Undo To History Entry',
    type: 'action' as const,
    description:
      'Reverts the drawing to the state captured at a specific history entry, undoing every ' +
      'operation performed after it. Obtain the entry id from history_query first — never guess one. ' +
      'To undo a single operation X, pass the id of the entry immediately BEFORE X (history_query ' +
      'returns entries newest-first, so that is the next one in the list). This is itself recorded, ' +
      'so the user can undo the revert. Reverting more than one step requires confirm:true, which you ' +
      'should only set after telling the user exactly what will be discarded and getting their agreement.',
    inputs: {
      entryId: {
        type: 'string',
        required: true,
        description: 'Id of the history entry to restore, from history_query.',
      },
      confirm: {
        type: 'boolean',
        description:
          'Required (true) when the jump discards more than one operation. If omitted on a ' +
          'multi-step revert the skill returns needsConfirmation with a description of what would be lost.',
        default: false,
      },
    },
    outputs: {
      applied: { type: 'boolean', required: true, description: 'True if the revert was performed.' },
      needsConfirmation: {
        type: 'boolean',
        description: 'True when the revert was withheld pending user confirmation.',
      },
      discarded: {
        type: 'array',
        items: { type: 'string' },
        description: 'Labels of the operations that were (or would be) undone, newest first.',
      },
      restoredLabel: {
        type: 'string',
        description: 'Label of the entry the drawing was restored to.',
      },
    },
    examples: [
      'history_undo_to {entryId:"h4k2", confirm:true} -> applied:true, discarded:["Drew boundary","Moved point 104"]',
    ],
  },
];
