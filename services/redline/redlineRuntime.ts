/**
 * Redline Agent runtime seam.
 *
 * The worklist lives in React state in the Redline workspace. CACP handlers
 * need to read and update the same runs, so the workspace registers a small
 * runtime here. No run data is duplicated: the hooks close over the state
 * setters.
 */

import type { RedlineRun } from '../../types';

export interface RedlineApplyResult {
  applied: string[];
  failed: Array<{ itemId: string; error: string }>;
}

export interface RedlineRevertResult {
  success: boolean;
  error?: string;
}

export interface RedlineResponseResult {
  ok: boolean;
  message: string;
  fileName?: string;
}

export interface RedlineRuntimeHooks {
  getRuns: () => RedlineRun[];
  updateRun: (runId: string, updater: (run: RedlineRun) => RedlineRun) => void;
  applyItems?: (runId: string, itemIds: string[]) => Promise<RedlineApplyResult>;
  revertItem?: (runId: string, itemId: string) => Promise<RedlineRevertResult>;
  buildResponse?: (runId: string) => Promise<RedlineResponseResult>;
}

let runtime: RedlineRuntimeHooks = {
  getRuns: () => [],
  updateRun: () => {},
};

export function registerRedlineRuntime(hooks: Partial<RedlineRuntimeHooks>): () => void {
  runtime = { ...runtime, ...hooks };
  return () => {
    runtime = { getRuns: () => [], updateRun: () => {} };
  };
}

export function getRedlineRuntime(): RedlineRuntimeHooks {
  return runtime;
}

export function resolveRedlineRun(runId?: string): RedlineRun | null {
  const runs = runtime.getRuns();
  if (runs.length === 0) return null;
  if (!runId) return runs[runs.length - 1];
  return runs.find((run) => run.id === runId) ?? null;
}
