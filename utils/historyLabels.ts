// Human-readable labels for undo/redo entries, derived by diffing the tracked
// canvas slices. Intentionally free of any model/LLM call: labels are computed
// synchronously so the toolbar tooltip and history panel are always instant.

import type { PointList, SurveyLine, ContourLabel, Centerline } from '../types.ts';

export interface TrackedCanvasState {
  pointLists: PointList[];
  lines: SurveyLine[];
  centerlines: Centerline[];
  contourLabels: ContourLabel[];
  boundaryFiles?: unknown[];
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

const allPoints = (lists: PointList[] | undefined) =>
  (lists ?? []).flatMap(l => l.points ?? []);

/**
 * Compares two point collections and classifies the change. Returns null when
 * the points are equivalent so the caller can fall through to another slice.
 */
function describePoints(prev: PointList[], next: PointList[]): string | null {
  const before = allPoints(prev);
  const after = allPoints(next);

  if (after.length > before.length) {
    return `Added ${plural(after.length - before.length, 'point')}`;
  }
  if (after.length < before.length) {
    return `Deleted ${plural(before.length - after.length, 'point')}`;
  }

  // Same count — look for moved or otherwise edited points.
  const beforeByNum = new Map(before.map(p => [p.pointNumber, p]));
  const moved: string[] = [];
  const edited: string[] = [];

  for (const p of after) {
    const b = beforeByNum.get(p.pointNumber);
    if (!b) {
      // Renumbered rather than added.
      edited.push(p.pointNumber);
      continue;
    }
    if (b === p) continue;
    if (b.northing !== p.northing || b.easting !== p.easting) {
      moved.push(p.pointNumber);
    } else {
      edited.push(p.pointNumber);
    }
  }

  if (moved.length === 1) return `Moved point ${moved[0]}`;
  if (moved.length > 1) return `Moved ${plural(moved.length, 'point')}`;
  if (edited.length === 1) return `Edited point ${edited[0]}`;
  if (edited.length > 1) return `Edited ${plural(edited.length, 'point')}`;

  // Point objects are equal; the list structure itself changed.
  if (next.length > prev.length) return 'Added point list';
  if (next.length < prev.length) return 'Deleted point list';
  return null;
}

function describeLines(prev: SurveyLine[], next: SurveyLine[]): string | null {
  if (next.length > prev.length) {
    const added = next.length - prev.length;
    if (added === 1) {
      const prevIds = new Set(prev.map(l => l.id));
      const line = next.find(l => !prevIds.has(l.id));
      if (line?.from && line?.to) return `Drew line ${line.from}–${line.to}`;
      return 'Drew line';
    }
    return `Drew ${plural(added, 'line')}`;
  }
  if (next.length < prev.length) {
    return `Deleted ${plural(prev.length - next.length, 'line')}`;
  }

  const prevById = new Map(prev.map(l => [l.id, l]));
  const changed = next.filter(l => prevById.get(l.id) !== l);
  if (changed.length === 1) return 'Edited line';
  if (changed.length > 1) return `Edited ${plural(changed.length, 'line')}`;
  return null;
}

function describeCenterlines(prev: Centerline[], next: Centerline[]): string | null {
  if (next.length > prev.length) return `Created ${plural(next.length - prev.length, 'centerline')}`;
  if (next.length < prev.length) return `Deleted ${plural(prev.length - next.length, 'centerline')}`;
  const prevById = new Map(prev.map(c => [c.id, c]));
  const changed = next.filter(c => prevById.get(c.id) !== c);
  if (changed.length > 0) return 'Edited centerline';
  return null;
}

function describeContours(prev: ContourLabel[], next: ContourLabel[]): string | null {
  if (prev.length === 0 && next.length > 0) return 'Generated contours';
  if (next.length === 0 && prev.length > 0) return 'Cleared contours';
  if (next.length !== prev.length) return 'Updated contours';
  return 'Edited contour labels';
}

function describeBoundary(prev: unknown[], next: unknown[]): string | null {
  if (next.length > prev.length) return 'Added boundary file';
  if (next.length < prev.length) return 'Removed boundary file';
  return 'Edited boundary';
}

/**
 * Produces a label for a transition. `changedKeys` comes from the engine's
 * reference-equality diff, so only slices that actually moved are inspected.
 */
export function describeCanvasChange(
  prev: TrackedCanvasState,
  next: TrackedCanvasState,
  changedKeys: readonly (keyof TrackedCanvasState)[],
): string {
  const parts: string[] = [];

  for (const key of changedKeys) {
    let part: string | null = null;
    switch (key) {
      case 'pointLists':
        part = describePoints(prev.pointLists ?? [], next.pointLists ?? []);
        break;
      case 'lines':
        part = describeLines(prev.lines ?? [], next.lines ?? []);
        break;
      case 'centerlines':
        part = describeCenterlines(prev.centerlines ?? [], next.centerlines ?? []);
        break;
      case 'contourLabels':
        part = describeContours(prev.contourLabels ?? [], next.contourLabels ?? []);
        break;
      case 'boundaryFiles':
        part = describeBoundary(prev.boundaryFiles ?? [], next.boundaryFiles ?? []);
        break;
      default:
        part = null;
    }
    if (part) parts.push(part);
  }

  if (parts.length === 0) return 'Edit';
  if (parts.length === 1) return parts[0];
  // Multi-slice operations (e.g. boundary propagation moves points and lines).
  return `${parts[0]} + ${parts.length - 1} more`;
}

/**
 * Tags an entry with the broad area it touched, so the AI undo skill can answer
 * requests like "undo the last boundary edit" without re-parsing the label.
 */
export function categorizeCanvasChange(
  changedKeys: readonly (keyof TrackedCanvasState)[],
): string[] {
  const tags = new Set<string>();
  for (const key of changedKeys) {
    switch (key) {
      case 'pointLists': tags.add('points'); break;
      case 'lines': tags.add('lines'); break;
      case 'centerlines': tags.add('centerlines'); break;
      case 'contourLabels': tags.add('contours'); break;
      case 'boundaryFiles': tags.add('boundary'); break;
      default: break;
    }
  }
  return [...tags];
}
