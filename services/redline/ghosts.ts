/**
 * Redline Agent — read-only canvas ghost projection.
 *
 * Ghosts are derived from worklist items and never enter drawing state. They
 * point at the current entity location so the canvas can draw a dashed preview
 * without duplicating geometry.
 */

import type {
  CanvasTextAnnotation,
  Centerline,
  RedlineGhost,
  RedlineItem,
  RedlineRun,
  SurveyLine,
  SurveyPoint,
} from '../../types';

export interface RedlineGhostEntities {
  points: SurveyPoint[];
  lines: SurveyLine[];
  textAnnotations: CanvasTextAnnotation[];
  centerlines?: Centerline[];
}

const VISIBLE_STATUSES = new Set(['proposed', 'approved', 'needs_clarification', 'blocked']);

function pointAnchor(
  target: RedlineItem['target'],
  entities: RedlineGhostEntities,
): { easting: number; northing: number } | null {
  if (!target) return null;

  if (target.entityType === 'text') {
    const annotation = entities.textAnnotations.find((candidate) => candidate.id === target.entityId);
    return annotation ? { easting: annotation.x, northing: annotation.y } : null;
  }

  if (target.entityType === 'point') {
    const point = entities.points.find((candidate) => candidate.pointNumber === target.entityId);
    return point ? { easting: point.easting, northing: point.northing } : null;
  }

  if (target.entityType === 'line') {
    const pointMap = new Map(entities.points.map((point) => [point.pointNumber, point]));
    const line = entities.lines.find(
      (candidate, index) => (candidate.id || `line-${index}`) === target.entityId,
    );
    if (!line) return null;
    const from = line.fromPt ?? pointMap.get(line.from);
    const to = line.toPt ?? pointMap.get(line.to);
    if (!from || !to) return null;
    const fromPoint = from as unknown as { x?: number; y?: number; easting?: number; northing?: number };
    const toPoint = to as unknown as { x?: number; y?: number; easting?: number; northing?: number };
    const fromE = fromPoint.easting ?? fromPoint.x;
    const fromN = fromPoint.northing ?? fromPoint.y;
    const toE = toPoint.easting ?? toPoint.x;
    const toN = toPoint.northing ?? toPoint.y;
    if (![fromE, fromN, toE, toN].every((value) => typeof value === 'number' && Number.isFinite(value))) {
      return null;
    }
    return { easting: (fromE! + toE!) / 2, northing: (fromN! + toN!) / 2 };
  }

  if (target.entityType === 'centerline') {
    const centerline = (entities.centerlines ?? []).find((candidate) => candidate.id === target.entityId);
    const pi = centerline?.pis?.[0];
    if (!pi) return null;
    return { easting: pi.easting, northing: pi.northing };
  }

  return null;
}

function proposalText(item: RedlineItem): { before?: string; after?: string } {
  const op = item.proposal?.find((candidate) => candidate.op === 'update_text');
  return {
    before: typeof op?.before?.text === 'string' ? op.before.text : undefined,
    after: typeof op?.after?.text === 'string' ? op.after.text : undefined,
  };
}

/** Project the unapplied, placeable items of a run onto the canvas. */
export function buildRedlineGhosts(
  run: RedlineRun | null,
  entities: RedlineGhostEntities,
): RedlineGhost[] {
  if (!run) return [];

  const ghosts: RedlineGhost[] = [];
  for (const item of run.items) {
    if (!VISIBLE_STATUSES.has(item.status)) continue;
    if (!item.target) continue;
    const anchor = pointAnchor(item.target, entities);
    if (!anchor) continue;

    const text = proposalText(item);
    const isDelete = item.changeKind === 'entity_delete';
    const action = text.after
      ? `Set text to “${text.after}”`
      : isDelete
        ? `Delete ${item.target.entityType}`
        : item.question ?? item.interpretedIntent;

    ghosts.push({
      id: item.id,
      number: item.number,
      sheetId: item.sheetId,
      anchor,
      reviewerText: item.reviewerText.join(' | '),
      targetLabel: item.target.label,
      action,
      kind: text.after ? 'text' : isDelete ? 'delete' : 'review',
      beforeText: text.before,
      afterText: text.after,
      status: item.status,
      confidence: item.confidence,
    });
  }
  return ghosts;
}
