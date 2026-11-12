/**
 * Redline Agent CACP handlers and the Civil Drafter patch skill.
 *
 * `civil_drafter_apply_redline_patch` is the only path that mutates canvas
 * entities for the Redline Agent. It validates every op, supports dry-run,
 * applies atomically, and verifies the resulting arrays before writing state.
 */

import { interAgentComm, type AgentMessage, type AgentResponse } from './InterAgentCommunication';
import {
  AgentType,
  type CanvasTextAnnotation,
  type RedlinePatchOp,
  type RedlineRun,
  type PointList,
  type SurveyLine,
} from '../types';
import { isExperimentalAgentEnabled } from '../utils/experimentalAgents';
import { assignRedlineRevision, computeRunMetrics, summarizeRedlineRun } from './redline/worklist';
import { buildRedlineResponseManifest, buildRedlineResponsePackage } from './redline/responseRegistry';
import { getRedlineRuntime, resolveRedlineRun } from './redline/redlineRuntime';

function respond(
  message: AgentMessage,
  from: AgentType,
  success: boolean,
  data?: Record<string, unknown>,
  error?: string,
): AgentResponse {
  return {
    requestId: message.id,
    from,
    success,
    data,
    error,
    timestamp: Date.now(),
  };
}

const REDLINE_DISABLED_MESSAGE =
  'Redline Agent is experimental and disabled. Enable it in Settings > Experimental Agents to use its redline tools.';

export function registerRedlineSkillHandlers(): () => void {
  const unsubs: Array<() => void> = [];

  const gated = (command: string, handler: (message: AgentMessage) => Promise<AgentResponse>) =>
    interAgentComm.onCommand(command, async (message) => {
      if (!isExperimentalAgentEnabled(AgentType.REDLINE_AGENT)) {
        return respond(message, AgentType.REDLINE_AGENT, false, undefined, REDLINE_DISABLED_MESSAGE);
      }
      return handler(message);
    });

  unsubs.push(
    gated('redline_ingest_package', async (message) => {
      const data = (message.data ?? {}) as Record<string, unknown>;
      const fileNames = Array.isArray(data.fileNames) ? data.fileNames.map(String) : [];
      if (fileNames.length === 0) {
        return respond(message, AgentType.REDLINE_AGENT, false, undefined, 'At least one PDF file name is required.');
      }
      return respond(message, AgentType.REDLINE_AGENT, true, {
        accepted: true,
        message: 'Open the Redline workspace to add the package, calibrate sheets, and build the worklist.',
      });
    }),
  );

  unsubs.push(
    gated('redline_get_status', async (message) => {
      const run = resolveRedlineRun((message.data as any)?.runId);
      if (!run) {
        return respond(message, AgentType.REDLINE_AGENT, false, undefined, 'No Redline run is loaded.');
      }
      return respond(message, AgentType.REDLINE_AGENT, true, {
        run,
        summary: summarizeRedlineRun(run),
      });
    }),
  );

  unsubs.push(
    gated('redline_list_items', async (message) => {
      const data = (message.data ?? {}) as Record<string, unknown>;
      const run = resolveRedlineRun(typeof data.runId === 'string' ? data.runId : undefined);
      if (!run) {
        return respond(message, AgentType.REDLINE_AGENT, false, undefined, 'No Redline run is loaded.');
      }
      const items = run.items.filter((item) => {
        if (data.sheetId && item.sheetId !== data.sheetId) return false;
        if (data.status && item.status !== data.status) return false;
        return true;
      });
      return respond(message, AgentType.REDLINE_AGENT, true, { items, count: items.length });
    }),
  );

  unsubs.push(
    gated('redline_explain_item', async (message) => {
      const data = (message.data ?? {}) as Record<string, unknown>;
      const run = resolveRedlineRun(typeof data.runId === 'string' ? data.runId : undefined);
      const item = run?.items.find((candidate) => candidate.id === data.itemId);
      if (!run || !item) {
        return respond(message, AgentType.REDLINE_AGENT, false, undefined, 'Redline item not found.');
      }
      const confidence = item.target
        ? `${Math.round(item.target.matchConfidence * 100)}% match`
        : 'no target';
      return respond(message, AgentType.REDLINE_AGENT, true, {
        item,
        explanation: `${item.number}: ${item.reviewerText.join(' | ')}. Interpreted as ${item.interpretedIntent}. Target: ${item.target?.label ?? 'none'} (${confidence}). Status: ${item.status}.`,
      });
    }),
  );

  unsubs.push(
    gated('redline_propose_change', async (message) => {
      const data = (message.data ?? {}) as Record<string, unknown>;
      const run = resolveRedlineRun(typeof data.runId === 'string' ? data.runId : undefined);
      const item = run?.items.find((candidate) => candidate.id === data.itemId);
      if (!item) {
        return respond(message, AgentType.REDLINE_AGENT, false, undefined, 'Redline item not found.');
      }
      return respond(message, AgentType.REDLINE_AGENT, true, { proposal: item.proposal ?? [] });
    }),
  );

  unsubs.push(
    gated('redline_apply_items', async (message) => {
      const data = (message.data ?? {}) as Record<string, unknown>;
      const itemIds = Array.isArray(data.itemIds) ? data.itemIds.map(String) : [];
      if (itemIds.length === 0) {
        return respond(message, AgentType.REDLINE_AGENT, false, undefined, 'itemIds is required.');
      }
      const run = resolveRedlineRun(typeof data.runId === 'string' ? data.runId : undefined);
      if (!run) {
        return respond(message, AgentType.REDLINE_AGENT, false, undefined, 'No Redline run is loaded.');
      }
      const hooks = getRedlineRuntime();
      if (!hooks.applyItems) {
        return respond(message, AgentType.REDLINE_AGENT, false, undefined, 'Open the Redline workspace before applying items.');
      }
      const result = await hooks.applyItems(run.id, itemIds);
      return respond(message, AgentType.REDLINE_AGENT, result.failed.length === 0, result as unknown as Record<string, unknown>);
    }),
  );

  unsubs.push(
    gated('redline_revert_item', async (message) => {
      const data = (message.data ?? {}) as Record<string, unknown>;
      const run = resolveRedlineRun(typeof data.runId === 'string' ? data.runId : undefined);
      if (!run) {
        return respond(message, AgentType.REDLINE_AGENT, false, undefined, 'No Redline run is loaded.');
      }
      const hooks = getRedlineRuntime();
      if (!hooks.revertItem) {
        return respond(message, AgentType.REDLINE_AGENT, false, undefined, 'Open the Redline workspace before reverting items.');
      }
      const result = await hooks.revertItem(run.id, String(data.itemId ?? ''));
      return respond(message, AgentType.REDLINE_AGENT, result.success, { reverted: result.success, error: result.error });
    }),
  );

  unsubs.push(
    gated('redline_set_revision', async (message) => {
      const data = (message.data ?? {}) as Record<string, unknown>;
      const run = resolveRedlineRun(typeof data.runId === 'string' ? data.runId : undefined);
      if (!run) {
        return respond(message, AgentType.REDLINE_AGENT, false, undefined, 'No Redline run is loaded.');
      }
      const baseRevision = Number(data.baseRevision);
      if (!Number.isInteger(baseRevision) || baseRevision < 0) {
        return respond(message, AgentType.REDLINE_AGENT, false, undefined, 'baseRevision must be a non-negative integer.');
      }
      const next = assignRedlineRevision(run, baseRevision, {
        description: typeof data.description === 'string' ? data.description : undefined,
        by: typeof data.by === 'string' ? data.by : undefined,
        checkedBy: typeof data.checkedBy === 'string' ? data.checkedBy : undefined,
        date: typeof data.date === 'string' ? data.date : undefined,
      });
      getRedlineRuntime().updateRun(run.id, () => next);
      return respond(message, AgentType.REDLINE_AGENT, true, { revision: next.revision });
    }),
  );

  unsubs.push(
    gated('redline_build_response', async (message) => {
      const data = (message.data ?? {}) as Record<string, unknown>;
      const run = resolveRedlineRun(typeof data.runId === 'string' ? data.runId : undefined);
      if (!run) {
        return respond(message, AgentType.REDLINE_AGENT, false, undefined, 'No Redline run is loaded.');
      }
      const hooks = getRedlineRuntime();
      if (hooks.buildResponse) {
        const result = await hooks.buildResponse(run.id);
        return respond(message, AgentType.REDLINE_AGENT, result.ok, {
          available: result.ok,
          fileName: result.fileName,
          message: result.message,
          manifest: buildRedlineResponseManifest(run),
        });
      }
      const fallback = await buildRedlineResponsePackage(run, []);
      return respond(message, AgentType.REDLINE_AGENT, Boolean(fallback.package), {
        available: Boolean(fallback.package),
        fileName: fallback.package?.fileName,
        message: fallback.package
          ? `Built ${fallback.package.fileName}.`
          : fallback.unavailableReason,
        manifest: buildRedlineResponseManifest(run),
      }, fallback.package ? undefined : fallback.unavailableReason);
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}

// ---------------------------------------------------------------------------
// Civil Drafter — typed redline patch
// ---------------------------------------------------------------------------

export interface CivilDrafterRedlinePatchDeps {
  textAnnotations: CanvasTextAnnotation[];
  setTextAnnotations: React.Dispatch<React.SetStateAction<CanvasTextAnnotation[]>>;
  lines: SurveyLine[];
  setLines: React.Dispatch<React.SetStateAction<SurveyLine[]>>;
  pointLists: PointList[];
  setPointLists: React.Dispatch<React.SetStateAction<PointList[]>>;
  /** Optional canvas history transaction labeler from CanvasHistoryContext. */
  withCanvasHistoryLabel?: <T>(label: string, fn: () => T) => T;
  logActionToFieldbook?: (message: string) => void;
}

interface PatchVerification {
  checked: number;
  passed: number;
  failures: string[];
}

function parseOps(raw: unknown): RedlinePatchOp[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is RedlinePatchOp => {
    if (!entry || typeof entry !== 'object') return false;
    const value = entry as Record<string, unknown>;
    return typeof value.op === 'string'
      && typeof value.entityType === 'string'
      && typeof value.entityId === 'string';
  });
}

function applyPatchLocally(
  deps: CivilDrafterRedlinePatchDeps,
  ops: RedlinePatchOp[],
): {
  nextText: CanvasTextAnnotation[];
  nextLines: SurveyLine[];
  nextPointLists: PointList[];
  appliedEntityIds: string[];
  errors: string[];
  verification: PatchVerification;
} {
  let nextText = [...deps.textAnnotations];
  let nextLines = [...deps.lines];
  let nextPointLists = deps.pointLists.map((list) => ({ ...list, points: [...list.points] }));
  const appliedEntityIds: string[] = [];
  const errors: string[] = [];
  const verification: PatchVerification = { checked: ops.length, passed: 0, failures: [] };

  for (const op of ops) {
    if (op.entityType === 'text') {
      const index = nextText.findIndex((annotation) => annotation.id === op.entityId);
      if (op.op === 'add_entity') {
        const payload = (op.after ?? {}) as Record<string, unknown>;
        if (index >= 0) {
          errors.push(`Text entity "${op.entityId}" already exists.`);
          continue;
        }
        if (typeof payload.text !== 'string' || typeof payload.x !== 'number' || typeof payload.y !== 'number') {
          errors.push(`add_entity for "${op.entityId}" needs text, x, and y.`);
          continue;
        }
        nextText = [...nextText, {
          id: op.entityId,
          text: payload.text,
          x: payload.x,
          y: payload.y,
          angle: typeof payload.angle === 'number' ? payload.angle : 0,
          layer: typeof payload.layer === 'string' ? payload.layer : undefined,
          styleName: typeof payload.styleName === 'string' ? payload.styleName : undefined,
          categoryId: typeof payload.categoryId === 'string' ? payload.categoryId : undefined,
        }];
        appliedEntityIds.push(op.entityId);
        verification.passed += 1;
        continue;
      }
      if (index < 0) {
        errors.push(`Text entity "${op.entityId}" no longer exists.`);
        verification.failures.push(`Missing text entity ${op.entityId}`);
        continue;
      }
      if (op.op === 'update_text') {
        const text = typeof op.after?.text === 'string' ? op.after.text : '';
        if (!text.trim()) {
          errors.push(`update_text for "${op.entityId}" has no replacement text.`);
          continue;
        }
        nextText = nextText.map((annotation, annotationIndex) =>
          annotationIndex === index ? { ...annotation, text } : annotation,
        );
        appliedEntityIds.push(op.entityId);
        verification.passed += 1;
        continue;
      }
      if (op.op === 'delete_entity') {
        nextText = nextText.filter((_, annotationIndex) => annotationIndex !== index);
        appliedEntityIds.push(op.entityId);
        verification.passed += 1;
        continue;
      }
      errors.push(`Unsupported text op "${op.op}".`);
      continue;
    }

    if (op.entityType === 'line') {
      const index = nextLines.findIndex(
        (line, lineIndex) => (line.id || `line-${lineIndex}`) === op.entityId,
      );
      if (op.op === 'add_entity') {
        const payload = (op.after ?? {}) as Record<string, unknown>;
        if (index >= 0) {
          errors.push(`Line entity "${op.entityId}" already exists.`);
          continue;
        }
        if (typeof payload.from !== 'string' || typeof payload.to !== 'string') {
          errors.push(`add_entity for "${op.entityId}" needs from and to.`);
          continue;
        }
        nextLines = [...nextLines, { ...(payload as unknown as SurveyLine), id: op.entityId }];
        appliedEntityIds.push(op.entityId);
        verification.passed += 1;
        continue;
      }
      if (index < 0) {
        errors.push(`Line entity "${op.entityId}" no longer exists.`);
        verification.failures.push(`Missing line entity ${op.entityId}`);
        continue;
      }
      if (op.op === 'delete_entity') {
        nextLines = nextLines.filter((_, lineIndex) => lineIndex !== index);
        appliedEntityIds.push(op.entityId);
        verification.passed += 1;
        continue;
      }
      if (op.op === 'update_layer' || op.op === 'update_linetype') {
        const field = op.op === 'update_layer' ? 'layer' : 'lineType';
        const value = op.after?.[field];
        if (typeof value !== 'string' || !value.trim()) {
          errors.push(`${op.op} for "${op.entityId}" needs a non-empty value.`);
          continue;
        }
        nextLines = nextLines.map((line, lineIndex) =>
          lineIndex === index ? { ...line, [field]: value } : line,
        );
        appliedEntityIds.push(op.entityId);
        verification.passed += 1;
        continue;
      }
      errors.push(`Unsupported line op "${op.op}".`);
      continue;
    }

    if (op.entityType === 'point') {
      if (op.op === 'add_entity') {
        const payload = (op.after ?? {}) as Record<string, unknown>;
        if (typeof payload.pointNumber !== 'string' || typeof payload.northing !== 'number' || typeof payload.easting !== 'number') {
          errors.push(`add_entity for point "${op.entityId}" needs pointNumber, northing, and easting.`);
          continue;
        }
        if (nextPointLists.length === 0) {
          nextPointLists = [{ id: 'working', name: 'Redline restored points', points: [], isVisible: true }];
        }
        nextPointLists = nextPointLists.map((list, listIndex) =>
          listIndex === 0
            ? { ...list, points: [...list.points, payload as unknown as PointList['points'][number]] }
            : list,
        );
        appliedEntityIds.push(op.entityId);
        verification.passed += 1;
        continue;
      }
      let found = false;
      nextPointLists = nextPointLists.map((list) => {
        const nextPoints = list.points.filter((point) => point.pointNumber !== op.entityId);
        if (nextPoints.length !== list.points.length) found = true;
        return { ...list, points: nextPoints };
      });
      if (!found) {
        errors.push(`Point entity "${op.entityId}" no longer exists.`);
        verification.failures.push(`Missing point entity ${op.entityId}`);
        continue;
      }
      if (op.op !== 'delete_entity') {
        errors.push(`Unsupported point op "${op.op}".`);
        continue;
      }
      appliedEntityIds.push(op.entityId);
      verification.passed += 1;
      continue;
    }

    errors.push(`Entity type "${op.entityType}" is not supported by the redline patch skill.`);
  }

  return { nextText, nextLines, nextPointLists, appliedEntityIds, errors, verification };
}

export function registerCivilDrafterRedlinePatchHandlers(
  getDeps: () => CivilDrafterRedlinePatchDeps,
): () => void {
  return interAgentComm.onCommand('civil_drafter_apply_redline_patch', async (message) => {
    const data = (message.data ?? {}) as Record<string, unknown>;
    if (Number(data.patchVersion ?? 1) !== 1) {
      return respond(message, AgentType.CIVIL_DRAFTER, false, undefined, 'Unsupported patchVersion; expected 1.');
    }
    const ops = parseOps(data.ops);
    if (ops.length === 0) {
      return respond(message, AgentType.CIVIL_DRAFTER, false, undefined, 'ops must contain at least one valid patch operation.');
    }
    const dryRun = data.dryRun === true;
    const deps = getDeps();
    const result = applyPatchLocally(deps, ops);

    if (!dryRun && result.errors.length === 0) {
      const undoLabel = typeof data.undoLabel === 'string' && data.undoLabel.trim()
        ? data.undoLabel.trim()
        : `Redline ${String(data.itemId ?? 'item')}`;
      const apply = () => {
        deps.setTextAnnotations(result.nextText);
        deps.setLines(result.nextLines);
        deps.setPointLists(result.nextPointLists);
      };
      if (deps.withCanvasHistoryLabel) deps.withCanvasHistoryLabel(undoLabel, apply);
      else apply();
      deps.logActionToFieldbook?.(`${undoLabel} — ${result.appliedEntityIds.length} entity change(s).`);
    }

    const applied = !dryRun && result.errors.length === 0;
    return respond(
      message,
      AgentType.CIVIL_DRAFTER,
      result.errors.length === 0,
      {
        applied,
        appliedEntityIds: result.appliedEntityIds,
        historyEntryIds: applied ? [`redline-${String(data.itemId ?? 'item')}`] : [],
        verification: result.verification,
        errors: result.errors,
        dryRun,
      },
      result.errors.length > 0 ? result.errors.join(' ') : undefined,
    );
  });
}

/** Update a run's metrics after external state changes. */
export function refreshRedlineRunMetrics(run: RedlineRun): RedlineRun {
  return { ...run, metrics: computeRunMetrics(run.items) };
}
