// Pure timeline engine.
//
// No React, no canvas setters. The provider owns the React state and calls these
// functions with snapshots. This keeps replay and failure behavior testable.

import type {
  SerializedTimelineDocument,
  SerializedTimelineFeature,
  TimelineAuthor,
  TimelineDocument,
  TimelineFeature,
  TimelineFeatureError,
  TimelineFeatureKind,
  TimelineFeatureMeta,
  TimelineFeatureStatus,
  TimelineFeatureView,
  TimelineIcon,
  TimelineSnapshot,
} from './types';
import { applyDeltas, diffSnapshots } from './diff';

let featureCounter = 0;

function nextFeatureId(): string {
  featureCounter += 1;
  return `tl-${Date.now().toString(36)}-${featureCounter.toString(36)}`;
}

function nextDocumentId(): string {
  return `timeline-${Date.now().toString(36)}`;
}

function baselineFeature(snapshot: TimelineSnapshot, label?: string): TimelineFeature {
  return {
    id: 'tl-baseline',
    kind: 'baseline',
    label: label ?? (snapshot.pointLists.some(list => list.points.length > 0)
      || snapshot.lines.length > 0
      || snapshot.centerlines.length > 0
      || snapshot.contourLabels.length > 0
      || snapshot.boundaryFiles.length > 0
      ? 'Imported project'
      : 'Empty project'),
    createdAt: Date.now(),
    author: { type: 'human' },
    deltas: [],
    snapshot,
    suppressed: false,
  };
}

export interface TimelineMutationResult {
  document: TimelineDocument;
  snapshot: TimelineSnapshot;
  committed: boolean;
  error?: TimelineFeatureError;
}

/** Create a fresh timeline with a baseline feature. */
export function createTimeline(initial: TimelineSnapshot, label?: string): TimelineDocument {
  const baseline = baselineFeature(initial, label);
  return {
    schemaVersion: 1,
    id: nextDocumentId(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    baselineFeatureId: baseline.id,
    features: [baseline],
    cursorFeatureId: baseline.id,
    sketchCounter: 0,
  };
}

export function getCursorIndex(document: TimelineDocument): number {
  const index = document.features.findIndex(feature => feature.id === document.cursorFeatureId);
  return index >= 0 ? index : 0;
}

export function getFeature(document: TimelineDocument, featureId: string): TimelineFeature | null {
  return document.features.find(feature => feature.id === featureId) ?? null;
}

/**
 * Append a feature after the cursor. Work that was ahead of the cursor is
 * discarded, matching the "no branching in v1" contract.
 */
export function appendFeature(
  document: TimelineDocument,
  start: TimelineSnapshot,
  end: TimelineSnapshot,
  kind: TimelineFeatureKind,
  label: string,
  author: TimelineAuthor,
  options: TimelineFeatureMeta & { allowEmpty?: boolean } = {},
): TimelineMutationResult {
  const deltas = diffSnapshots(start, end);
  if (deltas.length === 0 && !options.allowEmpty) {
    return { document, snapshot: end, committed: false };
  }

  const cursorIndex = getCursorIndex(document);
  const features = document.features.slice(0, cursorIndex + 1);
  const feature: TimelineFeature = {
    id: nextFeatureId(),
    kind,
    label,
    createdAt: Date.now(),
    author,
    deltas,
    snapshot: end,
    suppressed: false,
    ...(options.icon ? { icon: options.icon } : {}),
    ...(options.detail ? { detail: options.detail } : {}),
  };
  features.push(feature);

  return {
    document: {
      ...document,
      features,
      cursorFeatureId: feature.id,
      updatedAt: Date.now(),
    },
    snapshot: end,
    committed: true,
  };
}

export interface AppendImportFeatureOptions extends TimelineFeatureMeta {
  /** Existing sketch container to place the import under. */
  parentFeatureId?: string;
  /** Create an empty sketch container when the project does not have one. */
  createSketchParent?: boolean;
  /** Optional name for the auto-created sketch container. */
  parentLabel?: string;
}

/**
 * Append a point import as a child entry. If no sketch exists yet, create the
 * empty sketch container first so points always live inside a sketch. The
 * parent stays an empty replay step; the child carries the point deltas.
 */
export function appendImportFeature(
  document: TimelineDocument,
  start: TimelineSnapshot,
  end: TimelineSnapshot,
  label: string,
  author: TimelineAuthor,
  options: AppendImportFeatureOptions = {},
): TimelineMutationResult {
  const deltas = diffSnapshots(start, end);
  if (deltas.length === 0) {
    return { document, snapshot: end, committed: false };
  }

  const cursorIndex = getCursorIndex(document);
  const features = document.features.slice(0, cursorIndex + 1);
  let parentFeatureId = options.parentFeatureId;

  if (parentFeatureId) {
    const parent = features.find(feature => feature.id === parentFeatureId);
    if (!parent || parent.kind !== 'sketch' || parent.suppressed) {
      parentFeatureId = undefined;
    }
  }

  let sketchCounter = document.sketchCounter;
  let currentSketchFeatureId = document.currentSketchFeatureId;

  if (!parentFeatureId && options.createSketchParent) {
    sketchCounter += 1;
    const parent: TimelineFeature = {
      id: nextFeatureId(),
      kind: 'sketch',
      label: options.parentLabel?.trim() || `Sketch ${sketchCounter}`,
      createdAt: Date.now(),
      author,
      deltas: [],
      snapshot: start,
      suppressed: false,
      isGroup: true,
    };
    features.push(parent);
    parentFeatureId = parent.id;
    currentSketchFeatureId = parent.id;
  }

  if (parentFeatureId) currentSketchFeatureId = parentFeatureId;

  const feature: TimelineFeature = {
    id: nextFeatureId(),
    kind: 'import',
    label,
    createdAt: Date.now(),
    author,
    deltas,
    snapshot: end,
    suppressed: false,
    parentFeatureId,
    ...(options.icon ? { icon: options.icon } : {}),
    ...(options.detail ? { detail: options.detail } : {}),
  };
  features.push(feature);

  return {
    document: {
      ...document,
      features,
      cursorFeatureId: feature.id,
      currentSketchFeatureId,
      sketchCounter,
      updatedAt: Date.now(),
    },
    snapshot: end,
    committed: true,
  };
}

export interface AppendEventFeatureOptions extends TimelineFeatureMeta {
  parentFeatureId?: string;
}

/**
 * Insert a zero-delta event at the cursor. Events are observations, not canvas
 * edits: they preserve redoable future features instead of discarding them.
 * A parent is only honoured when it is already at or before the cursor, which
 * keeps a child from being inserted ahead of its sketch container.
 */
export function appendEventFeature(
  document: TimelineDocument,
  snapshot: TimelineSnapshot,
  kind: 'event' | 'utterance',
  label: string,
  author: TimelineAuthor,
  options: AppendEventFeatureOptions = {},
): TimelineMutationResult {
  const cursorIndex = getCursorIndex(document);
  let parentFeatureId = options.parentFeatureId;
  if (parentFeatureId) {
    const parentIndex = document.features.findIndex(feature => feature.id === parentFeatureId);
    const parent = document.features[parentIndex];
    if (!parent || parent.suppressed || parentIndex > cursorIndex) parentFeatureId = undefined;
  }

  const feature: TimelineFeature = {
    id: nextFeatureId(),
    kind,
    label,
    createdAt: Date.now(),
    author,
    deltas: [],
    snapshot,
    suppressed: false,
    ...(parentFeatureId ? { parentFeatureId } : {}),
    ...(options.icon ? { icon: options.icon } : {}),
    ...(options.detail ? { detail: options.detail } : {}),
  };

  const features = document.features.slice();
  features.splice(cursorIndex + 1, 0, feature);

  return {
    document: {
      ...document,
      features,
      cursorFeatureId: feature.id,
      updatedAt: Date.now(),
    },
    snapshot,
    committed: true,
  };
}

const AUTO_GROUP_MAX_GAP_MS = 30 * 60 * 1000;

/**
 * Consecutive action events in the same domain are usually steps toward one
 * goal (shrinkwrap preview → lasso → commit, AOI arm → hold → release, etc.).
 * Return the existing goal root so the next event can be nested under it.
 * Questions, imports, and edits made inside a sketch are deliberately excluded.
 */
export function inferGoalParentFeatureId(
  document: TimelineDocument,
  icon: TimelineIcon | undefined,
  at: number = Date.now(),
): string | undefined {
  if (!icon) return undefined;
  const previous = document.features[getCursorIndex(document)];
  if (!previous || previous.suppressed || previous.kind !== 'event' || previous.icon !== icon) {
    return undefined;
  }
  if (at - previous.createdAt > AUTO_GROUP_MAX_GAP_MS) return undefined;
  if (!previous.parentFeatureId) return previous.id;
  const parent = getFeature(document, previous.parentFeatureId);
  return parent && parent.kind === 'event' && !parent.suppressed ? parent.id : undefined;
}

/**
 * Update an existing feature (the re-entered sketch path) and replay every
 * later feature in order. A failure stops the replay: prior features stay
 * applied, the failing feature is flagged, and later features are not applied.
 */
export function updateFeatureAndReplay(
  document: TimelineDocument,
  featureId: string,
  end: TimelineSnapshot,
): TimelineMutationResult {
  const featureIndex = document.features.findIndex(feature => feature.id === featureId);
  if (featureIndex < 0) {
    return {
      document,
      snapshot: document.features[getCursorIndex(document)]?.snapshot ?? end,
      committed: false,
      error: { code: 'REPLAY_MISSING_FEATURE', message: `Feature "${featureId}" does not exist.` },
    };
  }

  const original = document.features[featureIndex];
  if (original.kind === 'baseline') {
    return {
      document,
      snapshot: original.snapshot,
      committed: false,
      error: {
        code: 'REPLAY_INVALID_DELTA',
        message: 'The baseline cannot be edited directly.',
      },
    };
  }
  const deltas = diffSnapshots(original.snapshot, end);
  if (deltas.length === 0) {
    return { document, snapshot: end, committed: false };
  }

  const features = document.features.slice();
  features[featureIndex] = {
    ...original,
    deltas,
    snapshot: end,
    error: undefined,
    stale: false,
  };

  let working = end;
  let cursorFeatureId = featureId;
  let firstError: TimelineFeatureError | undefined;

  for (let index = featureIndex + 1; index < features.length; index += 1) {
    const feature = features[index];
    if (!feature) continue;

    if (feature.suppressed) {
      features[index] = { ...feature, snapshot: working, error: undefined };
      continue;
    }

    const applied = applyDeltas(working, feature.deltas);
    if (applied.error) {
      features[index] = {
        ...feature,
        snapshot: working,
        error: applied.error,
        stale: false,
      };
      firstError = applied.error;
      break;
    }

    working = applied.snapshot;
    cursorFeatureId = feature.id;
    features[index] = {
      ...feature,
      snapshot: working,
      error: undefined,
      stale: applied.diverged,
    };
  }

  return {
    document: {
      ...document,
      features,
      cursorFeatureId,
      updatedAt: Date.now(),
    },
    snapshot: working,
    committed: true,
    error: firstError,
  };
}

/**
 * Rebuild the managed canvas from the baseline, skipping suppressed features.
 * Used by delete/suppress. Stops at the first replay failure.
 */
export function rebuildTimeline(document: TimelineDocument): TimelineMutationResult {
  const baseline = document.features[0];
  if (!baseline) {
    return { document, snapshot: { pointLists: [], lines: [], centerlines: [], contourLabels: [], boundaryFiles: [] }, committed: false };
  }

  let working = baseline.snapshot;
  let cursorFeatureId = baseline.id;
  let firstError: TimelineFeatureError | undefined;
  const features: TimelineFeature[] = [{ ...baseline, snapshot: working, error: undefined }];

  for (let index = 1; index < document.features.length; index += 1) {
    const feature = document.features[index];
    if (!feature) continue;

    if (feature.suppressed) {
      features.push({ ...feature, snapshot: working, error: undefined, stale: false });
      continue;
    }

    const applied = applyDeltas(working, feature.deltas);
    if (applied.error) {
      features.push({ ...feature, snapshot: working, error: applied.error, stale: false });
      firstError = applied.error;
      // Preserve the remaining features so the user can fix or delete them,
      // but do not apply them.
      for (let rest = index + 1; rest < document.features.length; rest += 1) {
        features.push({ ...document.features[rest], snapshot: working, error: undefined });
      }
      break;
    }

    working = applied.snapshot;
    cursorFeatureId = feature.id;
    features.push({
      ...feature,
      snapshot: working,
      error: undefined,
      stale: applied.diverged,
    });
  }

  return {
    document: {
      ...document,
      features,
      cursorFeatureId,
      updatedAt: Date.now(),
    },
    snapshot: working,
    committed: true,
    error: firstError,
  };
}

function descendantFeatureIds(features: readonly TimelineFeature[], featureId: string): Set<string> {
  const ids = new Set<string>([featureId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const feature of features) {
      if (feature.parentFeatureId && ids.has(feature.parentFeatureId) && !ids.has(feature.id)) {
        ids.add(feature.id);
        changed = true;
      }
    }
  }
  return ids;
}

function latestSketchFeatureId(features: readonly TimelineFeature[]): string | undefined {
  for (let index = features.length - 1; index >= 0; index -= 1) {
    const feature = features[index];
    if (feature?.kind === 'sketch' && !feature.suppressed) return feature.id;
  }
  return undefined;
}

export function toggleFeatureSuppression(document: TimelineDocument, featureId: string): TimelineMutationResult {
  const feature = getFeature(document, featureId);
  if (!feature || feature.kind === 'baseline') {
    return { document, snapshot: document.features[getCursorIndex(document)]?.snapshot ?? baselineFeatureSnapshot(document), committed: false };
  }

  const affected = descendantFeatureIds(document.features, featureId);
  const nextSuppressed = !feature.suppressed;
  const features = document.features.map(candidate =>
    affected.has(candidate.id) ? { ...candidate, suppressed: nextSuppressed } : candidate,
  );
  return rebuildTimeline({ ...document, features });
}

export function removeTimelineFeature(document: TimelineDocument, featureId: string): TimelineMutationResult {
  const feature = getFeature(document, featureId);
  if (!feature || feature.kind === 'baseline') {
    return { document, snapshot: document.features[getCursorIndex(document)]?.snapshot ?? baselineFeatureSnapshot(document), committed: false };
  }

  const removed = descendantFeatureIds(document.features, featureId);
  const features = document.features.filter(candidate => !removed.has(candidate.id));
  const cursorStillExists = features.some(candidate => candidate.id === document.cursorFeatureId);
  const cursorFeatureId = cursorStillExists ? document.cursorFeatureId : features[features.length - 1]?.id ?? document.baselineFeatureId;
  const currentSketchFeatureId = document.currentSketchFeatureId && removed.has(document.currentSketchFeatureId)
    ? latestSketchFeatureId(features)
    : document.currentSketchFeatureId;
  return rebuildTimeline({ ...document, features, cursorFeatureId, currentSketchFeatureId });
}

export function moveTimelineCursor(
  document: TimelineDocument,
  featureId: string,
): TimelineMutationResult {
  const feature = getFeature(document, featureId);
  if (!feature) {
    return { document, snapshot: baselineFeatureSnapshot(document), committed: false, error: { code: 'REPLAY_MISSING_FEATURE', message: `Feature "${featureId}" does not exist.` } };
  }
  return {
    document: { ...document, cursorFeatureId: feature.id, updatedAt: Date.now() },
    snapshot: feature.snapshot,
    committed: true,
  };
}

export function renameTimelineFeature(
  document: TimelineDocument,
  featureId: string,
  label: string,
): TimelineDocument {
  const trimmed = label.trim();
  if (!trimmed) return document;
  return {
    ...document,
    features: document.features.map(feature =>
      feature.id === featureId ? { ...feature, label: trimmed } : feature,
    ),
    updatedAt: Date.now(),
  };
}

function baselineFeatureSnapshot(document: TimelineDocument): TimelineSnapshot {
  return document.features[0]?.snapshot ?? { pointLists: [], lines: [], centerlines: [], contourLabels: [], boundaryFiles: [] };
}

/** Compute display statuses without mutating the stored features. */
export function decorateTimelineFeatures(document: TimelineDocument): TimelineFeatureView[] {
  const cursorIndex = getCursorIndex(document);
  const errorIndex = document.features.findIndex(feature => Boolean(feature.error));

  return document.features.map((feature, index) => {
    let status: TimelineFeatureStatus;
    if (feature.suppressed) status = 'suppressed';
    else if (feature.error) status = 'error';
    else if (errorIndex >= 0 && index > errorIndex) status = 'pending';
    else if (index === cursorIndex) status = 'current';
    else if (feature.stale) status = 'stale';
    else if (index < cursorIndex) status = 'applied';
    else status = 'future';
    return { ...feature, status };
  });
}

export function hasFutureFeatures(document: TimelineDocument): boolean {
  return getCursorIndex(document) < document.features.length - 1;
}

/** Strip per-feature snapshots so .lsvz stores deltas, not N copies of the drawing. */
export function serializeTimelineDocument(
  document: TimelineDocument,
): SerializedTimelineDocument {
  const baseline = document.features[0] ?? baselineFeature(baselineFeatureSnapshot(document));
  const features: SerializedTimelineFeature[] = document.features
    .filter(feature => feature.kind !== 'baseline')
    .map(feature => ({
      id: feature.id,
      kind: feature.kind,
      label: feature.label,
      createdAt: feature.createdAt,
      author: feature.author,
      deltas: feature.deltas,
      suppressed: feature.suppressed,
      parentFeatureId: feature.parentFeatureId,
      isGroup: feature.isGroup,
      ...(feature.icon ? { icon: feature.icon } : {}),
      ...(feature.detail ? { detail: feature.detail } : {}),
      stale: feature.stale,
      error: feature.error,
    }));

  return {
    schemaVersion: 1,
    id: document.id,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    baselineFeatureId: baseline.id,
    baselineSnapshot: baseline.snapshot,
    features,
    cursorFeatureId: document.cursorFeatureId,
    currentSketchFeatureId: document.currentSketchFeatureId,
    sketchCounter: document.sketchCounter,
  };
}

export function deserializeTimelineDocument(
  serialized: SerializedTimelineDocument | undefined | null,
): { document: TimelineDocument; snapshot: TimelineSnapshot; error?: TimelineFeatureError } | null {
  if (!serialized || serialized.schemaVersion !== 1) return null;
  if (!serialized.baselineSnapshot || !Array.isArray(serialized.features)) return null;

  const baselineSnapshot: TimelineSnapshot = {
    ...serialized.baselineSnapshot,
    boundaryFiles: serialized.baselineSnapshot.boundaryFiles ?? [],
  };
  const baseline = baselineFeature(baselineSnapshot);
  baseline.id = serialized.baselineFeatureId || baseline.id;
  baseline.createdAt = serialized.createdAt || baseline.createdAt;

  let working = baselineSnapshot;
  let cursorFeatureId = baseline.id;
  let firstError: TimelineFeatureError | undefined;
  const features: TimelineFeature[] = [{ ...baseline, snapshot: working }];

  for (const serializedFeature of serialized.features) {
    if (!serializedFeature || typeof serializedFeature.id !== 'string') continue;
    const feature: TimelineFeature = {
      ...serializedFeature,
      deltas: Array.isArray(serializedFeature.deltas) ? serializedFeature.deltas : [],
      snapshot: working,
    };

    if (feature.suppressed) {
      features.push({ ...feature, snapshot: working, error: undefined });
      continue;
    }

    const applied = applyDeltas(working, feature.deltas);
    if (applied.error) {
      features.push({ ...feature, snapshot: working, error: applied.error });
      firstError = applied.error;
      break;
    }

    working = applied.snapshot;
    cursorFeatureId = feature.id;
    features.push({
      ...feature,
      snapshot: working,
      error: undefined,
      stale: applied.diverged,
    });
  }

  const requestedCursor = serialized.cursorFeatureId;
  const cursorExists = features.some(feature => feature.id === requestedCursor);
  const effectiveCursor = cursorExists ? requestedCursor : cursorFeatureId;
  const cursorFeature = features.find(feature => feature.id === effectiveCursor) ?? features[0];
  const requestedSketch = serialized.currentSketchFeatureId;
  const currentSketchFeatureId = requestedSketch
    && features.some(feature => feature.id === requestedSketch && feature.kind === 'sketch')
    ? requestedSketch
    : latestSketchFeatureId(features);
  const sketchCount = features.filter(feature => feature.kind === 'sketch').length;

  return {
    document: {
      schemaVersion: 1,
      id: serialized.id || nextDocumentId(),
      createdAt: serialized.createdAt || Date.now(),
      updatedAt: serialized.updatedAt || Date.now(),
      baselineFeatureId: baseline.id,
      features,
      cursorFeatureId: effectiveCursor,
      currentSketchFeatureId,
      sketchCounter: Number.isFinite(serialized.sketchCounter)
        ? Math.max(serialized.sketchCounter, sketchCount)
        : sketchCount,
    },
    snapshot: cursorFeature.snapshot,
    error: firstError,
  };
}
