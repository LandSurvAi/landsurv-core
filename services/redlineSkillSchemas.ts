/**
 * Redline Agent CACP skill schemas.
 *
 * The Redline Agent is an interpreter/coordinator. It owns the run and the
 * worklist; the Civil Drafter owns every canvas mutation.
 */

import type { SkillSchema } from './AgentRegistry';

export const CIVIL_DRAFTER_REDLINE_PATCH_SKILL: SkillSchema = {
  id: 'civil_drafter_apply_redline_patch',
  name: 'Apply Redline Patch',
  type: 'action',
  description:
    'Validates and applies a typed Redline patch to canvas entities. Supports dry-run preflight, ' +
    'per-item labeled history, and a post-apply verification read. Unknown entity ids are rejected ' +
    'rather than replaced.',
  inputs: {
    patchVersion: { type: 'integer', required: true, default: 1, description: 'Payload contract version. Currently 1.' },
    runId: { type: 'string', required: true },
    itemId: { type: 'string', required: true },
    ops: { type: 'array', required: true, items: { type: 'object' }, description: 'RedlinePatchOp[] serialized as objects.' },
    dryRun: { type: 'boolean', default: false },
    undoLabel: { type: 'string', description: 'History label for this item, e.g. "Redline R-03-014 — label text".' },
  },
  outputs: {
    applied: { type: 'boolean', required: true },
    appliedEntityIds: { type: 'array', items: { type: 'string' } },
    historyEntryIds: { type: 'array', items: { type: 'string' } },
    verification: { type: 'object' },
    errors: { type: 'array', items: { type: 'string' } },
  },
  examples: [
    'Redline Agent asks Civil Drafter to update a text annotation after the user accepts R-03-014.',
  ],
};

export const REDLINE_SKILLS: SkillSchema[] = [
  {
    id: 'redline_ingest_package',
    name: 'Ingest Marked-Up Package',
    type: 'action',
    description:
      'Validates and registers an annotated PDF package and starts a run. Opening the Redline workspace is a UI action; this skill reports the intake contract.',
    inputs: {
      fileNames: { type: 'array', items: { type: 'string' }, required: true },
      mode: { type: 'string', enum: ['fast', 'deep'], default: 'fast' },
    },
    outputs: {
      accepted: { type: 'boolean', required: true },
      message: { type: 'string', required: true },
    },
  },
  {
    id: 'redline_get_status',
    name: 'Get Redline Run Status',
    type: 'query',
    description: 'Returns run status, sheets, warnings, and review counts.',
    inputs: {
      runId: { type: 'string', description: 'Omit for the latest run.' },
    },
    outputs: {
      run: { type: 'object' },
      summary: { type: 'string' },
    },
  },
  {
    id: 'redline_list_items',
    name: 'List Redline Worklist',
    type: 'query',
    description: 'Returns a filterable worklist for chat or another agent.',
    inputs: {
      runId: { type: 'string' },
      sheetId: { type: 'string' },
      status: { type: 'string' },
    },
    outputs: {
      items: { type: 'array', items: { type: 'object' } },
      count: { type: 'integer' },
    },
  },
  {
    id: 'redline_explain_item',
    name: 'Explain Redline Item',
    type: 'query',
    description: 'Returns reviewer wording, interpreted intent, target alternatives, and confidence rationale for one item.',
    inputs: {
      runId: { type: 'string' },
      itemId: { type: 'string', required: true },
    },
    outputs: {
      item: { type: 'object' },
      explanation: { type: 'string' },
    },
  },
  {
    id: 'redline_propose_change',
    name: 'Propose Redline Change',
    type: 'query',
    description: 'Returns the typed patch for an item without applying it.',
    inputs: {
      runId: { type: 'string' },
      itemId: { type: 'string', required: true },
    },
    outputs: {
      proposal: { type: 'array', items: { type: 'object' } },
    },
  },
  {
    id: 'redline_apply_items',
    name: 'Apply Redline Items',
    type: 'action',
    description:
      'Applies approved items through the Civil Drafter. Only text/label content items may be applied without explicit approval.',
    inputs: {
      runId: { type: 'string' },
      itemIds: { type: 'array', items: { type: 'string' }, required: true },
    },
    outputs: {
      applied: { type: 'array', items: { type: 'string' } },
      failed: { type: 'array', items: { type: 'object' } },
    },
  },
  {
    id: 'redline_revert_item',
    name: 'Revert Redline Item',
    type: 'action',
    description: 'Applies the inverse patch for one applied item as a new labeled history entry.',
    inputs: {
      runId: { type: 'string' },
      itemId: { type: 'string', required: true },
    },
    outputs: {
      reverted: { type: 'boolean', required: true },
      error: { type: 'string' },
    },
  },
  {
    id: 'redline_set_revision',
    name: 'Assign Redline Revision',
    type: 'action',
    description: 'Assigns the revision block and delta numbering for the run.',
    inputs: {
      runId: { type: 'string' },
      baseRevision: { type: 'integer', required: true },
      description: { type: 'string' },
      by: { type: 'string' },
      checkedBy: { type: 'string' },
      date: { type: 'string' },
    },
    outputs: {
      revision: { type: 'object' },
    },
  },
  {
    id: 'redline_build_response',
    name: 'Build Redline Response Package',
    type: 'action',
    description:
      'Builds the reviewer response ZIP: response letter, JSON manifest, and original marked-up PDFs. A custom adapter can replace the built-in package.',
    inputs: {
      runId: { type: 'string' },
    },
    outputs: {
      available: { type: 'boolean', required: true },
      fileName: { type: 'string' },
      message: { type: 'string' },
    },
  },
];
