import type { SurveyLine } from '../types.ts';
import type { TimelineDocument, TimelineTransaction } from './timeline/types.ts';
import { lineKey, stableStringify } from './timeline/diff.ts';

/** Dispatched by the timeline Project button so the canvas can arm the picker. */
export const PROJECT_GEOMETRY_EVENT = 'landsurv:project-geometry';

/** Projected reference geometry is visible and snappable, never editable. */
export function isReferenceLine(line: Pick<SurveyLine, 'reference'> | null | undefined): boolean {
  return line?.reference === true;
}

/** True for a projected reference or geometry owned by an earlier sketch. */
export function isLineLocked(
  line: SurveyLine,
  lockedLineKeys?: ReadonlySet<string> | null,
): boolean {
  return isReferenceLine(line) || Boolean(lockedLineKeys?.has(lineKey(line)));
}

let projectedLineSequence = 0;

/**
 * Copy source geometry into the active sketch as an immutable projection.
 *
 * The copy owns a fresh id and drops polyline grouping, so erasing or trimming
 * the original can never cascade onto the reference (and vice versa). The
 * source line itself stays untouched and remains editable in its own sketch.
 */
export function projectLineAsReference(source: SurveyLine, sketchId?: string): SurveyLine {
  projectedLineSequence += 1;
  return {
    ...source,
    id: `projected-${Date.now().toString(36)}-${projectedLineSequence.toString(36)}`,
    polylineId: undefined,
    labelOffset: undefined,
    reference: true,
    projectedFrom: {
      lineId: source.id,
      ...(sketchId ? { sketchId } : {}),
    },
    layer: 'PROJECTED',
    color: '#38BDF8',
    lineType: 'DASHED',
    lineTypeScale: 1,
  };
}

/**
 * Re-assert every reference line that existed in `previous` on a new canvas
 * array. This is the App-level immutability backstop for AI and bulk edits;
 * undo/redo and timeline replay write through the history setters directly, so
 * they can still restore canvases where a projection did not exist yet.
 */
export function protectReferenceLines(
  previous: SurveyLine[],
  next: SurveyLine[],
  lockedLineKeys?: ReadonlySet<string> | null,
): SurveyLine[] {
  const protectedLines = previous.filter(line => isLineLocked(line, lockedLineKeys));
  if (protectedLines.length === 0) return next;

  const previousIndexByKey = new Map(previous.map((line, index) => [lineKey(line), index]));
  const nextIndexByKey = new Map(next.map((line, index) => [lineKey(line), index]));
  const merged = next.slice();
  const missing: Array<{ line: SurveyLine; index: number }> = [];

  protectedLines.forEach(protectedLine => {
    const key = lineKey(protectedLine);
    const nextIndex = nextIndexByKey.get(key);
    if (nextIndex === undefined) {
      missing.push({ line: protectedLine, index: previousIndexByKey.get(key) ?? merged.length });
      return;
    }
    if (stableStringify(merged[nextIndex]) !== stableStringify(protectedLine)) {
      merged[nextIndex] = protectedLine;
    }
  });

  for (const entry of missing.sort((a, b) => a.index - b.index)) {
    merged.splice(Math.min(entry.index, merged.length), 0, entry.line);
  }
  return merged;
}

/**
 * Lines that must stay immutable while the open sketch is being edited.
 *
 * A new sketch locks everything that existed when it opened. Reopening a
 * finished sketch unlocks only the lines that feature itself added or changed;
 * earlier sketch geometry and every projected reference stay locked.
 */
export function buildSketchLockedLineKeys(
  transaction: TimelineTransaction | null | undefined,
  document: TimelineDocument | null | undefined,
): Set<string> {
  if (!transaction || transaction.kind !== 'sketch') return new Set();
  if (!transaction.editingFeatureId) {
    return new Set(transaction.startSnapshot.lines.map(lineKey));
  }

  const feature = document?.features.find(item => item.id === transaction.editingFeatureId);
  if (!feature) return new Set(transaction.startSnapshot.lines.map(lineKey));

  const editable = new Set(
    feature.deltas
      .filter(delta => delta.kind === 'line' && (delta.action === 'add' || delta.action === 'update'))
      .map(delta => delta.id),
  );
  return new Set(
    feature.snapshot.lines
      .filter(line => isReferenceLine(line) || !editable.has(lineKey(line)))
      .map(lineKey),
  );
}

export interface CombinedLayer {
  id: 'combined';
  name: 'COMBINED';
  sketchId: null;
  label: string;
  lineCount: number;
  referenceLineCount: number;
  lineIds: string[];
  referenceLineIds: string[];
  sourceSketches: Array<{
    sketchId: string | null;
    label: string;
    lineIds: string[];
  }>;
  note: string;
}

/**
 * The synthetic "no sketch" layer exposed to the AI. It presents every visible
 * line as one editable layer while still reporting which sketch each line came
 * from. Projected references are listed but marked immutable.
 */
export function buildCombinedLayer(
  lines: SurveyLine[],
  document: TimelineDocument | null | undefined,
): CombinedLayer {
  const ownerByLineKey = new Map<string, string>();
  if (document) {
    const cursorIndex = document.features.findIndex(feature => feature.id === document.cursorFeatureId);
    const lastIndex = cursorIndex >= 0 ? cursorIndex : document.features.length - 1;
    for (let index = 0; index <= lastIndex; index++) {
      const feature = document.features[index];
      for (const delta of feature.deltas) {
        if (delta.kind !== 'line') continue;
        if (delta.action === 'remove') ownerByLineKey.delete(delta.id);
        else ownerByLineKey.set(delta.id, feature.id);
      }
    }
  }

  const lineIds: string[] = [];
  const referenceLineIds: string[] = [];
  const grouped = new Map<string | null, string[]>();

  for (const line of lines) {
    const key = lineKey(line);
    lineIds.push(key);
    if (isReferenceLine(line)) referenceLineIds.push(key);
    const owner = ownerByLineKey.get(key) ?? null;
    const group = grouped.get(owner) ?? [];
    group.push(key);
    grouped.set(owner, group);
  }

  const sourceSketches = [...grouped.entries()]
    .map(([sketchId, ids]) => {
      const feature = sketchId
        ? document?.features.find(item => item.id === sketchId)
        : undefined;
      return {
        sketchId,
        label: feature?.label ?? 'Combined (unsketched)',
        lineIds: ids,
      };
    })
    .sort((a, b) => b.lineIds.length - a.lineIds.length);

  return {
    id: 'combined',
    name: 'COMBINED',
    sketchId: null,
    label: 'Combined (no sketch)',
    lineCount: lines.length,
    referenceLineCount: referenceLineIds.length,
    lineIds,
    referenceLineIds,
    sourceSketches,
    note: 'Every visible line is exposed as one layer. Reference lines are immutable and cannot be trimmed, moved, or deleted.',
  };
}
