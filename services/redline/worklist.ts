/**
 * Redline Agent — worklist construction.
 *
 * Turns the annotation inventory into numbered review items. Every markup is
 * accounted for: a mark becomes a proposed correction, an explicit
 * clarification, or a human-action item. Nothing is silently dropped.
 */

import type {
  RedlineConfidence,
  RedlineItem,
  RedlineItemStatus,
  RedlineMarkup,
  RedlineMarkupKind,
  RedlinePatchOp,
  RedlineReadingMode,
  RedlineRun,
  RedlineRunMetrics,
  RedlineSheet,
  RedlineTarget,
  SurveyLine,
} from '../../types';
import { pdfPointToWorld, rectCenter, rectContains, toPdfUserSpace } from '../../utils/redlineCalibration';
import { matchRedlineTarget, type RedlineEntitySnapshot } from './entityMatching';
import {
  classifyRedlineIntent,
  deriveRedlineProposedText,
  expandRedlineShorthand,
  normalizeRedlineTextForMatching,
} from './markupInterpretation';

export interface BuildRedlineRunInput {
  runId: string;
  mode: RedlineReadingMode;
  sheets: RedlineSheet[];
  markups: RedlineMarkup[];
  entities: RedlineEntitySnapshot;
  warnings?: string[];
  options?: RedlineRun['options'];
}

export interface RedlineMarkupGroup {
  sheetId: string;
  markups: RedlineMarkup[];
  reviewerText: string[];
  anchorRect: [number, number, number, number];
  markupKind: RedlineMarkupKind;
}

const DUPLICATE_DISTANCE_PT = 250;

function normalizedText(markup: RedlineMarkup): string {
  return normalizeRedlineTextForMatching(markup.rawText).toUpperCase();
}

/** Merge a revision cloud with any text markups that sit inside it. */
export function groupRedlineMarkups(markups: RedlineMarkup[]): RedlineMarkupGroup[] {
  const consumed = new Set<string>();
  const groups: RedlineMarkupGroup[] = [];

  const bySheet = new Map<string, RedlineMarkup[]>();
  for (const markup of markups) {
    const list = bySheet.get(markup.sheetId) ?? [];
    list.push(markup);
    bySheet.set(markup.sheetId, list);
  }

  for (const [sheetId, sheetMarkups] of bySheet) {
    for (const markup of sheetMarkups) {
      if (consumed.has(markup.id)) continue;
      consumed.add(markup.id);
      const group = [markup];

      if (markup.kind === 'cloud') {
        const center = rectCenter(markup.rect);
        for (const candidate of sheetMarkups) {
          if (candidate.id === markup.id || consumed.has(candidate.id)) continue;
          if (!candidate.rawText.trim()) continue;
          if (!rectContains(markup.rect, rectCenter(candidate.rect), 8)) continue;
          consumed.add(candidate.id);
          group.push(candidate);
        }
      }

      const textMarkups = group.filter((item) => item.rawText.trim());
      const anchor = textMarkups[0] ?? markup;
      groups.push({
        sheetId,
        markups: group,
        reviewerText: [...new Set(group.map((item) => item.rawText.trim()).filter(Boolean))],
        anchorRect: anchor.rect,
        markupKind: markup.kind,
      });
    }
  }

  return groups;
}

function findTextEntity(entities: RedlineEntitySnapshot, target: RedlineTarget | null) {
  if (!target || target.entityType !== 'text') return null;
  return entities.textAnnotations.find((annotation) => annotation.id === target.entityId) ?? null;
}

function beforeSnapshot(
  target: RedlineTarget,
  entities: RedlineEntitySnapshot,
): Record<string, unknown> | undefined {
  if (target.entityType === 'text') {
    const annotation = findTextEntity(entities, target);
    if (!annotation) return undefined;
    return {
      text: annotation.text,
      x: annotation.x,
      y: annotation.y,
      angle: annotation.angle,
      layer: annotation.layer,
      styleName: annotation.styleName,
      categoryId: annotation.categoryId,
    };
  }
  if (target.entityType === 'line') {
    const line = entities.lines.find(
      (candidate, index) => (candidate.id || `line-${index}`) === target.entityId,
    );
    if (!line) return undefined;
    return {
      line: {
        ...line,
        // Persist enough geometry to allow a faithful inverse/delete.
        fromPt: line.fromPt,
        toPt: line.toPt,
      },
    };
  }
  if (target.entityType === 'point') {
    const point = entities.points.find((candidate) => candidate.pointNumber === target.entityId);
    if (!point) return undefined;
    return { point: { ...point } };
  }
  return undefined;
}

export function buildProposal(
  item: Pick<RedlineItem, 'changeKind' | 'target'>,
  proposedText: string | null,
  entities: RedlineEntitySnapshot,
): RedlinePatchOp[] | null {
  const target = item.target;
  if (!target) return null;

  if (item.changeKind === 'text_content' && target.entityType === 'text' && proposedText) {
    const before = beforeSnapshot(target, entities);
    if (!before) return null;
    return [{
      op: 'update_text',
      entityType: 'text',
      entityId: target.entityId,
      before,
      after: { text: proposedText },
    }];
  }

  if (item.changeKind === 'entity_delete' && target.entityType !== 'hatch') {
    const before = beforeSnapshot(target, entities);
    if (!before) return null;
    return [{
      op: 'delete_entity',
      entityType: target.entityType,
      entityId: target.entityId,
      before,
    }];
  }

  return null;
}

function confidenceRank(confidence: RedlineConfidence): number {
  return confidence === 'high' ? 3 : confidence === 'medium' ? 2 : 1;
}

function statusForItem(params: {
  changeKind: string;
  risk: string;
  confidence: RedlineConfidence;
  target: RedlineTarget | null;
  proposal: RedlinePatchOp[] | null;
  emptyCloud: boolean;
  humanAction: boolean;
  calibrated: boolean;
}): { status: RedlineItemStatus; question?: string; note?: string } {
  if (params.humanAction) return { status: 'human_action' };
  if (!params.calibrated) {
    return {
      status: 'human_action',
      note: 'Sheet is not calibrated, so this markup cannot be placed on the drawing. Calibrate the sheet or handle the item manually.',
    };
  }
  if (params.emptyCloud) {
    return {
      status: 'needs_clarification',
      question: 'The revision cloud has no note. What change is intended in this area?',
    };
  }
  if (params.changeKind === 'dimension_text') {
    return {
      status: 'needs_clarification',
      question: 'Changing this dimension also changes geometry. Should a drafter redraw the feature, or is the text the only correction?',
    };
  }
  if (!params.target) {
    return {
      status: 'needs_clarification',
      question: 'No drawing entity was found near this mark. Which entity should be changed?',
      note: 'Increase the search radius, pick the target manually, or handle the item as a human action.',
    };
  }
  if (confidenceRank(params.confidence) === 1) {
    return {
      status: 'needs_clarification',
      question: `The closest match is "${params.target.label}" (${Math.round(params.target.matchConfidence * 100)}%). Is that the intended entity?`,
    };
  }
  if (!params.proposal) {
    return {
      status: 'needs_clarification',
      question: 'The requested correction is not a text replacement this agent can apply. How should the drafter proceed?',
    };
  }
  return { status: 'proposed' };
}

function sheetNumber(sheets: RedlineSheet[], sheetId: string): number {
  const index = sheets.findIndex((sheet) => sheet.id === sheetId);
  return index >= 0 ? index + 1 : 1;
}

/**
 * Build a run in one deterministic pass. The run stays `ready`; application is
 * a separate, explicit review action.
 */
export function buildRedlineRun(input: BuildRedlineRunInput): RedlineRun {
  const now = new Date().toISOString();
  const sheets = input.sheets.map((sheet) => ({ ...sheet, itemCount: 0 }));
  const sheetById = new Map(sheets.map((sheet) => [sheet.id, sheet]));
  const groups = groupRedlineMarkups(input.markups);

  const pending = groups.map((group) => {
    const sheet = sheetById.get(group.sheetId);
    const reviewerText = group.reviewerText.join(' | ');
    const expansion = expandRedlineShorthand(reviewerText);
    const classification = classifyRedlineIntent(reviewerText, group.markupKind);
    const registration = sheet?.registration;
    const anchorPage = rectCenter(group.anchorRect);
    const anchorWorld = registration?.valid
      ? pdfPointToWorld(registration, toPdfUserSpace(anchorPage, sheet.pageHeight))
      : null;

    const allowedEntityTypes: Array<RedlineTarget['entityType']> =
      classification.changeKind === 'text_content' ? ['text'] : ['point', 'line', 'text'];
    const target = anchorWorld
      ? matchRedlineTarget({
          reviewerText,
          intentText: `${reviewerText} ${classification.intent}`,
          anchorWorld,
          entities: input.entities,
          allowedEntityTypes,
        })
      : null;

    const proposedText = classification.changeKind === 'text_content'
      ? deriveRedlineProposedText(reviewerText)
      : null;
    const confidence: RedlineConfidence = target
      ? target.matchConfidence >= 0.8
        ? 'high'
        : target.matchConfidence >= 0.5
          ? 'medium'
          : 'low'
      : 'low';
    const proposal = buildProposal(
      { changeKind: classification.changeKind, target },
      proposedText,
      input.entities,
    );
    const emptyCloud = group.markupKind === 'cloud' && reviewerText.trim().length === 0;
    const state = statusForItem({
      changeKind: classification.changeKind,
      risk: classification.risk,
      confidence,
      target,
      proposal,
      emptyCloud,
      humanAction: classification.humanAction,
      calibrated: Boolean(registration?.valid),
    });

    const notes: string[] = [];
    if (expansion.replacements.length > 0) {
      notes.push(`Expanded shorthand: ${expansion.replacements.map((item) => `${item.from} → ${item.to}`).join(', ')}.`);
    }
    if (state.note) notes.push(state.note);
    if (
      classification.changeKind === 'text_content'
      && target?.entityType === 'text'
      && proposal
      && (input.options?.autoApplyLowRisk ?? true)
    ) {
      notes.push('Low-risk text update: eligible for automatic application.');
    }

    return {
      sheetId: group.sheetId,
      markupIds: group.markups.map((markup) => markup.id),
      reviewerText: group.markups.map((markup) => markup.rawText).filter(Boolean),
      interpretedIntent: classification.intent,
      markupKind: group.markupKind,
      changeKind: classification.changeKind,
      risk: classification.risk,
      target,
      proposal,
      status: state.status,
      confidence,
      question: state.question,
      humanActionNote: classification.humanAction ? reviewerText : undefined,
      notes: notes.join(' '),
      anchorPage,
      sequence: sheetNumber(sheets, group.sheetId),
    };
  });

  pending.sort((a, b) => {
    if (a.sequence !== b.sequence) return a.sequence - b.sequence;
    if (a.anchorPage.y !== b.anchorPage.y) return a.anchorPage.y - b.anchorPage.y;
    return a.anchorPage.x - b.anchorPage.x;
  });

  const items: RedlineItem[] = pending.map((entry, index) => ({
    id: `rdl-${input.runId}-${String(index + 1).padStart(3, '0')}`,
    number: `R-${String(entry.sequence).padStart(2, '0')}-${String(index + 1).padStart(3, '0')}`,
    sheetId: entry.sheetId,
    markupIds: entry.markupIds,
    reviewerText: entry.reviewerText,
    interpretedIntent: entry.interpretedIntent,
    markupKind: entry.markupKind,
    changeKind: entry.changeKind,
    risk: entry.risk,
    target: entry.target,
    proposal: entry.proposal,
    status: entry.status,
    confidence: entry.confidence,
    question: entry.question,
    humanActionNote: entry.humanActionNote,
    notes: entry.notes,
    createdAt: now,
    proposedAt: now,
  }));

  // Link duplicate/contradictory markups instead of merging them silently.
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i];
      const b = items[j];
      if (a.sheetId !== b.sheetId) continue;
      const aText = a.reviewerText.map(normalizeRedlineTextForMatching).join(' ').toUpperCase();
      const bText = b.reviewerText.map(normalizeRedlineTextForMatching).join(' ').toUpperCase();
      const sameText = aText.length > 1 && aText === bText;
      const sameTarget = Boolean(a.target && b.target && a.target.entityId === b.target.entityId);
      const contradictoryTargets = sameTarget
        && (a.changeKind === 'entity_delete') !== (b.changeKind === 'entity_delete');
      if (!sameText && !contradictoryTargets) continue;

      // Only treat repeated wording as a duplicate when the marks are close on
      // the sheet; two identical notes on opposite sides are legitimate.
      if (sameText && !sameTarget) {
        const aMarkup = input.markups.find((markup) => markup.id === a.markupIds[0]);
        const bMarkup = input.markups.find((markup) => markup.id === b.markupIds[0]);
        if (!aMarkup || !bMarkup) continue;
        const distance = Math.hypot(
          rectCenter(aMarkup.rect).x - rectCenter(bMarkup.rect).x,
          rectCenter(aMarkup.rect).y - rectCenter(bMarkup.rect).y,
        );
        if (distance > DUPLICATE_DISTANCE_PT) continue;
      }

      a.conflictWith = [...(a.conflictWith ?? []), b.id];
      b.conflictWith = [...(b.conflictWith ?? []), a.id];
      a.notes = `${a.notes} Conflict with ${b.number}: resolve before applying.`.trim();
      b.notes = `${b.notes} Conflict with ${a.number}: resolve before applying.`.trim();
    }
  }

  for (const item of items) {
    const sheet = sheetById.get(item.sheetId);
    if (sheet) sheet.itemCount += 1;
  }

  const run: RedlineRun = {
    id: input.runId,
    createdAt: now,
    updatedAt: now,
    status: 'ready',
    mode: input.mode,
    sheets,
    markups: input.markups,
    items,
    revision: {
      baseRevision: 0,
      assignedRevision: 1,
      description: `Addressed ${items.length} redline comment${items.length === 1 ? '' : 's'} across ${sheets.length} sheet${sheets.length === 1 ? '' : 's'}`,
      date: now.slice(0, 10),
    },
    metrics: computeRunMetrics(items),
    sourceFileIds: [...new Set(sheets.map((sheet) => sheet.fileId))],
    warnings: input.warnings ?? [],
    options: input.options ?? { autoApplyLowRisk: true, precedence: 'reviewer' },
  };

  return run;
}

export function computeRunMetrics(items: RedlineItem[]): RedlineRunMetrics {
  const withTarget = items.filter((item) => item.target);
  const meanMatchConfidence = withTarget.length > 0
    ? withTarget.reduce((sum, item) => sum + (item.target?.matchConfidence ?? 0), 0) / withTarget.length
    : 0;

  return {
    itemsProposed: items.length,
    itemsAccepted: items.filter((item) => ['approved', 'applied', 'verified'].includes(item.status)).length,
    itemsRejected: items.filter((item) => item.status === 'rejected').length,
    itemsEdited: items.filter((item) => item.target?.correctedByUser).length,
    itemsDeferred: items.filter((item) => item.status === 'deferred').length,
    itemsHumanAction: items.filter((item) => item.status === 'human_action').length,
    autoApplied: items.filter((item) => item.status === 'applied' && item.risk === 'low').length,
    autoAppliedReverted: items.filter((item) => item.status === 'approved' && item.notes.includes('Reverted')).length,
    targetCorrected: items.filter((item) => item.target?.correctedByUser).length,
    meanMatchConfidence: Number(meanMatchConfidence.toFixed(3)),
  };
}

/** Return a new run with one item's review status changed. */
export function setRedlineItemStatus(
  run: RedlineRun,
  itemId: string,
  status: RedlineItemStatus,
  note?: string,
): RedlineRun {
  const now = new Date().toISOString();
  const items = run.items.map((item) => {
    if (item.id !== itemId) return item;
    const decided = ['approved', 'rejected', 'deferred', 'human_action', 'applied', 'verified'].includes(status);
    return {
      ...item,
      status,
      notes: note ? `${item.notes} ${note}`.trim() : item.notes,
      decidedAt: decided ? now : item.decidedAt,
      appliedAt: status === 'applied' || status === 'verified' ? now : item.appliedAt,
    };
  });
  return {
    ...run,
    items,
    metrics: computeRunMetrics(items),
    updatedAt: now,
  };
}

/**
 * Assign revision number and delta marks. Deltas are monotonic within the run
 * and only issued to applied/verified items.
 */
export function assignRedlineRevision(
  run: RedlineRun,
  baseRevision: number,
  fields: Partial<Pick<RedlineRun['revision'], 'description' | 'by' | 'checkedBy' | 'date'>> = {},
): RedlineRun {
  const assignedRevision = baseRevision + 1;
  let delta = 0;
  const items = run.items.map((item) => {
    if (item.status !== 'applied' && item.status !== 'verified') return item;
    delta += 1;
    return {
      ...item,
      revision: {
        number: assignedRevision,
        delta,
        label: `R${assignedRevision}.${delta}`,
      },
    };
  });
  return {
    ...run,
    items,
    revision: {
      ...run.revision,
      ...fields,
      baseRevision,
      assignedRevision,
      date: fields.date ?? run.revision.date,
      description: fields.description ?? run.revision.description,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function isLowRiskTextItem(item: RedlineItem): boolean {
  return item.risk === 'low'
    && item.changeKind === 'text_content'
    && item.target?.entityType === 'text'
    && Boolean(item.proposal?.length)
    && !item.conflictWith?.length
    && item.status === 'proposed';
}

export function summarizeRedlineRun(run: RedlineRun): string {
  const accepted = run.items.filter((item) => ['approved', 'applied', 'verified'].includes(item.status)).length;
  const auto = run.items.filter((item) => item.status === 'applied' && item.risk === 'low').length;
  const rejected = run.items.filter((item) => item.status === 'rejected').length;
  const open = run.items.filter((item) => ['proposed', 'needs_clarification', 'deferred', 'approved'].includes(item.status)).length;
  return `${run.items.length} items · ${accepted} accepted (${auto} auto text) · ${rejected} rejected · ${open} open · mean match ${run.metrics.meanMatchConfidence.toFixed(2)}`;
}

export function findLineByEntityId(lines: SurveyLine[], entityId: string): SurveyLine | undefined {
  return lines.find((line, index) => (line.id || `line-${index}`) === entityId);
}
