// Entity-level diff/apply for the timeline.
//
// The existing undo engine observes whole tracked slices. The timeline needs a
// finer unit so later features can be re-applied after an upstream edit. This
// module diffs the four tracked slices by stable entity id and applies those
// deltas back onto a snapshot.
//
// Replay is intentionally conservative: a delta whose recorded `beforeDigest`
// no longer matches still applies (the operation is absolute), but the caller
// is told the result diverged so the feature can be marked stale. That keeps
// replay moving while making the limitation visible instead of silently
// rewriting upstream work.

import type { PointList, SurveyLine, Centerline, ContourLabel, BoundaryFile } from '../../types';
import type {
  TimelineDelta,
  TimelineFeatureError,
  TimelineSnapshot,
} from './types';

export interface ApplyDeltasResult {
  snapshot: TimelineSnapshot;
  error?: TimelineFeatureError;
  diverged: boolean;
  failedDeltaIndex?: number;
}

export interface DiffSnapshotResult {
  deltas: TimelineDelta[];
}

/** Deterministic JSON for digests and entity equality. */
export function stableStringify(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'undefined') return 'undefined';
  if (typeof value !== 'object') return JSON.stringify(value) ?? String(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

export function entityDigest(value: unknown): string {
  return stableStringify(value);
}

export function cloneTimelineSnapshot(snapshot: TimelineSnapshot): TimelineSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as TimelineSnapshot;
}

export function snapshotFromCanvas(
  pointLists: PointList[],
  lines: SurveyLine[],
  centerlines: Centerline[],
  contourLabels: ContourLabel[],
  boundaryFiles: BoundaryFile[] = [],
): TimelineSnapshot {
  return { pointLists, lines, centerlines, contourLabels, boundaryFiles };
}

/** Stable key for a line, including anonymous lines without an id. */
export function lineKey(line: SurveyLine): string {
  if (line.id) return `id:${line.id}`;
  return `anon:${stableStringify({
    from: line.from,
    to: line.to,
    polylineId: line.polylineId,
    fromPt: line.fromPt,
    toPt: line.toPt,
    isCircle: line.isCircle,
    circleCenter: line.circleCenter,
    type: line.type,
  })}`;
}

/** Stable key for a contour label, which has no id in the canvas model. */
export function contourLabelKey(label: ContourLabel): string {
  return `contour:${stableStringify({
    x: label.x,
    y: label.y,
    text: label.text,
    angle: label.angle,
    contourGenId: label.contourGenId,
    pathIndex: label.pathIndex,
  })}`;
}

function pushListMetadataDeltas(
  deltas: TimelineDelta[],
  before: PointList,
  after: PointList,
  index: number,
): void {
  const beforeMeta = {
    name: before.name,
    isVisible: before.isVisible,
    includeInContext: before.includeInContext,
  };
  const afterMeta = {
    name: after.name,
    isVisible: after.isVisible,
    includeInContext: after.includeInContext,
  };
  if (stableStringify(beforeMeta) !== stableStringify(afterMeta)) {
    deltas.push({
      kind: 'point-list',
      action: 'update',
      id: after.id,
      index,
      value: afterMeta,
      beforeDigest: entityDigest(beforeMeta),
    });
  }
}

/** Diff two tracked canvases into ordered, entity-level deltas. */
export function diffSnapshots(before: TimelineSnapshot, after: TimelineSnapshot): TimelineDelta[] {
  const deltas: TimelineDelta[] = [];

  // --- point lists and points ------------------------------------------------
  const beforeLists = new Map(before.pointLists.map((list, index) => [list.id, { list, index }]));
  const afterListIds = new Set(after.pointLists.map(list => list.id));

  after.pointLists.forEach((list, listIndex) => {
    const previous = beforeLists.get(list.id);
    if (!previous) {
      deltas.push({
        kind: 'point-list',
        action: 'add',
        id: list.id,
        index: listIndex,
        value: list,
      });
      return;
    }

    pushListMetadataDeltas(deltas, previous.list, list, listIndex);

    const beforePoints = new Map(
      previous.list.points.map((point, pointIndex) => [point.pointNumber, { point, pointIndex }]),
    );
    const afterPointIds = new Set(list.points.map(point => point.pointNumber));

    list.points.forEach((point, pointIndex) => {
      const prior = beforePoints.get(point.pointNumber);
      if (!prior) {
        deltas.push({
          kind: 'point',
          action: 'add',
          id: point.pointNumber,
          listId: list.id,
          index: pointIndex,
          value: point,
        });
        return;
      }
      if (stableStringify(prior.point) !== stableStringify(point)) {
        deltas.push({
          kind: 'point',
          action: 'update',
          id: point.pointNumber,
          listId: list.id,
          index: pointIndex,
          value: point,
          beforeDigest: entityDigest(prior.point),
        });
      }
    });

    previous.list.points.forEach(prior => {
      if (!afterPointIds.has(prior.pointNumber)) {
        deltas.push({
          kind: 'point',
          action: 'remove',
          id: prior.pointNumber,
          listId: list.id,
          value: prior,
          beforeDigest: entityDigest(prior),
        });
      }
    });
  });

  before.pointLists.forEach(list => {
    if (!afterListIds.has(list.id)) {
      deltas.push({
        kind: 'point-list',
        action: 'remove',
        id: list.id,
        value: list,
        beforeDigest: entityDigest(list),
      });
    }
  });

  // --- lines -----------------------------------------------------------------
  const beforeLines = new Map(before.lines.map((line, index) => [lineKey(line), { line, index }]));
  const afterLineKeys = new Set(after.lines.map(lineKey));
  after.lines.forEach((line, index) => {
    const key = lineKey(line);
    const prior = beforeLines.get(key);
    if (!prior) {
      deltas.push({ kind: 'line', action: 'add', id: key, index, value: line });
      return;
    }
    if (stableStringify(prior.line) !== stableStringify(line)) {
      deltas.push({
        kind: 'line',
        action: 'update',
        id: key,
        index,
        value: line,
        beforeDigest: entityDigest(prior.line),
      });
    }
  });
  before.lines.forEach(line => {
    const key = lineKey(line);
    if (!afterLineKeys.has(key)) {
      deltas.push({
        kind: 'line',
        action: 'remove',
        id: key,
        value: line,
        beforeDigest: entityDigest(line),
      });
    }
  });

  // --- boundary files --------------------------------------------------------
  const beforeBoundaryFiles = new Map(
    before.boundaryFiles.map((file, index) => [file.id, { file, index }]),
  );
  const afterBoundaryFileIds = new Set(after.boundaryFiles.map(file => file.id));
  after.boundaryFiles.forEach((file, index) => {
    const prior = beforeBoundaryFiles.get(file.id);
    if (!prior) {
      deltas.push({ kind: 'boundary-file', action: 'add', id: file.id, index, value: file });
      return;
    }
    if (stableStringify(prior.file) !== stableStringify(file)) {
      deltas.push({
        kind: 'boundary-file',
        action: 'update',
        id: file.id,
        index,
        value: file,
        beforeDigest: entityDigest(prior.file),
      });
    }
  });
  before.boundaryFiles.forEach(file => {
    if (!afterBoundaryFileIds.has(file.id)) {
      deltas.push({
        kind: 'boundary-file',
        action: 'remove',
        id: file.id,
        value: file,
        beforeDigest: entityDigest(file),
      });
    }
  });

  // --- centerlines -----------------------------------------------------------
  const beforeCenterlines = new Map(
    before.centerlines.map((centerline, index) => [centerline.id, { centerline, index }]),
  );
  const afterCenterlineIds = new Set(after.centerlines.map(centerline => centerline.id));
  after.centerlines.forEach((centerline, index) => {
    const prior = beforeCenterlines.get(centerline.id);
    if (!prior) {
      deltas.push({ kind: 'centerline', action: 'add', id: centerline.id, index, value: centerline });
      return;
    }
    if (stableStringify(prior.centerline) !== stableStringify(centerline)) {
      deltas.push({
        kind: 'centerline',
        action: 'update',
        id: centerline.id,
        index,
        value: centerline,
        beforeDigest: entityDigest(prior.centerline),
      });
    }
  });
  before.centerlines.forEach(centerline => {
    if (!afterCenterlineIds.has(centerline.id)) {
      deltas.push({
        kind: 'centerline',
        action: 'remove',
        id: centerline.id,
        value: centerline,
        beforeDigest: entityDigest(centerline),
      });
    }
  });

  // --- contour labels --------------------------------------------------------
  const beforeLabels = new Map(
    before.contourLabels.map((label, index) => [contourLabelKey(label), { label, index }]),
  );
  const afterLabelKeys = new Set(after.contourLabels.map(contourLabelKey));
  after.contourLabels.forEach((label, index) => {
    const key = contourLabelKey(label);
    const prior = beforeLabels.get(key);
    if (!prior) {
      deltas.push({ kind: 'contour-label', action: 'add', id: key, index, value: label });
      return;
    }
    if (stableStringify(prior.label) !== stableStringify(label)) {
      deltas.push({
        kind: 'contour-label',
        action: 'update',
        id: key,
        index,
        value: label,
        beforeDigest: entityDigest(prior.label),
      });
    }
  });
  before.contourLabels.forEach(label => {
    const key = contourLabelKey(label);
    if (!afterLabelKeys.has(key)) {
      deltas.push({
        kind: 'contour-label',
        action: 'remove',
        id: key,
        value: label,
        beforeDigest: entityDigest(label),
      });
    }
  });

  return deltas;
}

function invalidDelta(message: string, index: number, snapshot: TimelineSnapshot): ApplyDeltasResult {
  return {
    snapshot,
    diverged: false,
    failedDeltaIndex: index,
    error: { code: 'REPLAY_INVALID_DELTA', message, failedDeltaIndex: index },
  };
}

function missingEntity(message: string, index: number, snapshot: TimelineSnapshot): ApplyDeltasResult {
  return {
    snapshot,
    diverged: false,
    failedDeltaIndex: index,
    error: { code: 'REPLAY_MISSING_ENTITY', message, failedDeltaIndex: index },
  };
}

function insertAt<T>(array: T[], index: number | undefined, value: T): void {
  if (typeof index === 'number' && index >= 0 && index <= array.length) {
    array.splice(index, 0, value);
  } else {
    array.push(value);
  }
}

/** Apply recorded entity deltas to a snapshot. */
export function applyDeltas(
  base: TimelineSnapshot,
  deltas: readonly TimelineDelta[],
): ApplyDeltasResult {
  const snapshot = cloneTimelineSnapshot(base);
  let diverged = false;

  for (let deltaIndex = 0; deltaIndex < deltas.length; deltaIndex += 1) {
    const delta = deltas[deltaIndex];

    if (!delta || typeof delta.id !== 'string' || !delta.kind) {
      return invalidDelta('Malformed timeline delta.', deltaIndex, snapshot);
    }

    if (delta.kind === 'point-list') {
      const listIndex = snapshot.pointLists.findIndex(list => list.id === delta.id);
      if (delta.action === 'add') {
        const value = delta.value as PointList | undefined;
        if (!value || typeof value !== 'object' || !Array.isArray(value.points)) {
          return invalidDelta(`Point-list add "${delta.id}" has no valid value.`, deltaIndex, snapshot);
        }
        if (listIndex >= 0) {
          snapshot.pointLists[listIndex] = value;
        } else {
          insertAt(snapshot.pointLists, delta.index, value);
        }
        continue;
      }

      if (listIndex < 0) {
        return missingEntity(`Point list "${delta.id}" does not exist.`, deltaIndex, snapshot);
      }

      if (delta.action === 'remove') {
        snapshot.pointLists.splice(listIndex, 1);
        continue;
      }

      const patch = delta.value as Partial<PointList> | undefined;
      if (!patch || typeof patch !== 'object') {
        return invalidDelta(`Point-list update "${delta.id}" has no valid patch.`, deltaIndex, snapshot);
      }
      const current = snapshot.pointLists[listIndex];
      if (delta.beforeDigest && entityDigest({
        name: current.name,
        isVisible: current.isVisible,
        includeInContext: current.includeInContext,
      }) !== delta.beforeDigest) {
        diverged = true;
      }
      snapshot.pointLists[listIndex] = { ...current, ...patch };
      continue;
    }

    if (delta.kind === 'point') {
      if (!delta.listId) {
        return invalidDelta(`Point delta "${delta.id}" has no listId.`, deltaIndex, snapshot);
      }
      const list = snapshot.pointLists.find(candidate => candidate.id === delta.listId);
      if (!list) {
        return missingEntity(`Point list "${delta.listId}" does not exist.`, deltaIndex, snapshot);
      }
      const pointIndex = list.points.findIndex(point => point.pointNumber === delta.id);

      if (delta.action === 'add') {
        const value = delta.value as PointList['points'][number] | undefined;
        if (!value || typeof value !== 'object') {
          return invalidDelta(`Point add "${delta.id}" has no valid value.`, deltaIndex, snapshot);
        }
        if (pointIndex >= 0) {
          list.points[pointIndex] = value;
        } else {
          insertAt(list.points, delta.index, value);
        }
        continue;
      }

      if (pointIndex < 0) {
        return missingEntity(`Point "${delta.id}" does not exist in list "${delta.listId}".`, deltaIndex, snapshot);
      }

      if (delta.action === 'remove') {
        list.points.splice(pointIndex, 1);
        continue;
      }

      const value = delta.value as PointList['points'][number] | undefined;
      if (!value || typeof value !== 'object') {
        return invalidDelta(`Point update "${delta.id}" has no valid value.`, deltaIndex, snapshot);
      }
      if (delta.beforeDigest && entityDigest(list.points[pointIndex]) !== delta.beforeDigest) {
        diverged = true;
      }
      list.points[pointIndex] = value;
      continue;
    }

    if (delta.kind === 'line') {
      const lineIndex = snapshot.lines.findIndex(line => lineKey(line) === delta.id);
      if (delta.action === 'add') {
        const value = delta.value as SurveyLine | undefined;
        if (!value || typeof value !== 'object') {
          return invalidDelta(`Line add "${delta.id}" has no valid value.`, deltaIndex, snapshot);
        }
        if (lineIndex >= 0) {
          snapshot.lines[lineIndex] = value;
        } else {
          insertAt(snapshot.lines, delta.index, value);
        }
        continue;
      }
      if (lineIndex < 0) {
        return missingEntity(`Line "${delta.id}" does not exist.`, deltaIndex, snapshot);
      }
      if (delta.action === 'remove') {
        snapshot.lines.splice(lineIndex, 1);
        continue;
      }
      const value = delta.value as SurveyLine | undefined;
      if (!value || typeof value !== 'object') {
        return invalidDelta(`Line update "${delta.id}" has no valid value.`, deltaIndex, snapshot);
      }
      if (delta.beforeDigest && entityDigest(snapshot.lines[lineIndex]) !== delta.beforeDigest) {
        diverged = true;
      }
      snapshot.lines[lineIndex] = value;
      continue;
    }

    if (delta.kind === 'boundary-file') {
      const fileIndex = snapshot.boundaryFiles.findIndex(file => file.id === delta.id);
      if (delta.action === 'add') {
        const value = delta.value as BoundaryFile | undefined;
        if (!value || typeof value !== 'object') {
          return invalidDelta(`Boundary-file add "${delta.id}" has no valid value.`, deltaIndex, snapshot);
        }
        if (fileIndex >= 0) {
          snapshot.boundaryFiles[fileIndex] = value;
        } else {
          insertAt(snapshot.boundaryFiles, delta.index, value);
        }
        continue;
      }
      if (fileIndex < 0) {
        return missingEntity(`Boundary file "${delta.id}" does not exist.`, deltaIndex, snapshot);
      }
      if (delta.action === 'remove') {
        snapshot.boundaryFiles.splice(fileIndex, 1);
        continue;
      }
      const value = delta.value as BoundaryFile | undefined;
      if (!value || typeof value !== 'object') {
        return invalidDelta(`Boundary-file update "${delta.id}" has no valid value.`, deltaIndex, snapshot);
      }
      if (delta.beforeDigest && entityDigest(snapshot.boundaryFiles[fileIndex]) !== delta.beforeDigest) {
        diverged = true;
      }
      snapshot.boundaryFiles[fileIndex] = value;
      continue;
    }

    if (delta.kind === 'centerline') {
      const centerlineIndex = snapshot.centerlines.findIndex(centerline => centerline.id === delta.id);
      if (delta.action === 'add') {
        const value = delta.value as Centerline | undefined;
        if (!value || typeof value !== 'object') {
          return invalidDelta(`Centerline add "${delta.id}" has no valid value.`, deltaIndex, snapshot);
        }
        if (centerlineIndex >= 0) {
          snapshot.centerlines[centerlineIndex] = value;
        } else {
          insertAt(snapshot.centerlines, delta.index, value);
        }
        continue;
      }
      if (centerlineIndex < 0) {
        return missingEntity(`Centerline "${delta.id}" does not exist.`, deltaIndex, snapshot);
      }
      if (delta.action === 'remove') {
        snapshot.centerlines.splice(centerlineIndex, 1);
        continue;
      }
      const value = delta.value as Centerline | undefined;
      if (!value || typeof value !== 'object') {
        return invalidDelta(`Centerline update "${delta.id}" has no valid value.`, deltaIndex, snapshot);
      }
      if (delta.beforeDigest && entityDigest(snapshot.centerlines[centerlineIndex]) !== delta.beforeDigest) {
        diverged = true;
      }
      snapshot.centerlines[centerlineIndex] = value;
      continue;
    }

    if (delta.kind === 'contour-label') {
      const labelIndex = snapshot.contourLabels.findIndex(label => contourLabelKey(label) === delta.id);
      if (delta.action === 'add') {
        const value = delta.value as ContourLabel | undefined;
        if (!value || typeof value !== 'object') {
          return invalidDelta(`Contour label add "${delta.id}" has no valid value.`, deltaIndex, snapshot);
        }
        if (labelIndex >= 0) {
          snapshot.contourLabels[labelIndex] = value;
        } else {
          insertAt(snapshot.contourLabels, delta.index, value);
        }
        continue;
      }
      if (labelIndex < 0) {
        return missingEntity(`Contour label "${delta.id}" does not exist.`, deltaIndex, snapshot);
      }
      if (delta.action === 'remove') {
        snapshot.contourLabels.splice(labelIndex, 1);
        continue;
      }
      const value = delta.value as ContourLabel | undefined;
      if (!value || typeof value !== 'object') {
        return invalidDelta(`Contour label update "${delta.id}" has no valid value.`, deltaIndex, snapshot);
      }
      if (delta.beforeDigest && entityDigest(snapshot.contourLabels[labelIndex]) !== delta.beforeDigest) {
        diverged = true;
      }
      snapshot.contourLabels[labelIndex] = value;
      continue;
    }

    return invalidDelta(`Unknown delta kind "${String((delta as TimelineDelta).kind)}".`, deltaIndex, snapshot);
  }

  return { snapshot, diverged };
}
