// React binding for the feature timeline.
//
// The provider observes the four canvas slices the undo engine already tracks
// and records them as entity deltas when a sketch or explicit feature closes.
// It never records individual direct edits outside those transactions: that is
// the deliberate "direct drawing is unmanaged" contract.

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useCanvasState } from './CanvasStateContext.tsx';
import { useCanvasHistory } from './CanvasHistoryContext.tsx';
import {
  appendEventFeature,
  appendFeature,
  appendImportFeature,
  createTimeline,
  decorateTimelineFeatures,
  deserializeTimelineDocument,
  getCursorIndex,
  getFeature,
  hasFutureFeatures,
  inferGoalParentFeatureId,
  moveTimelineCursor,
  removeTimelineFeature,
  renameTimelineFeature,
  serializeTimelineDocument,
  toggleFeatureSuppression,
  updateFeatureAndReplay,
  type TimelineMutationResult,
} from '../utils/timeline/engine.ts';
import {
  emptyTimelineSnapshot,
  type ActiveSketchInfo,
  type SerializedTimelineDocument,
  type TimelineContextValue,
  type TimelineDocument,
  type TimelineEventInput,
  type TimelineFeatureError,
  type TimelineFeatureMeta,
  type TimelineSnapshot,
  type TimelinePendingEvent,
  type TimelineTransaction,
} from '../utils/timeline/types.ts';

/** Attach events raised during a transaction to the feature it produced. */
function flushPendingTimelineEvents(
  document: TimelineDocument,
  snapshot: TimelineSnapshot,
  events: readonly TimelinePendingEvent[] | undefined,
  parentFeatureId: string | undefined,
): { document: TimelineDocument; snapshot: TimelineSnapshot } {
  if (!events || events.length === 0) return { document, snapshot };
  let nextDocument = document;
  let nextSnapshot = snapshot;
  for (const event of events) {
    const mutation = appendEventFeature(
      nextDocument,
      nextSnapshot,
      event.kind,
      event.label,
      { type: 'human' },
      {
        parentFeatureId,
        ...(event.icon ? { icon: event.icon } : {}),
        ...(event.detail ? { detail: event.detail } : {}),
      },
    );
    if (!mutation.committed) continue;
    nextDocument = mutation.document;
    nextSnapshot = mutation.snapshot;
  }
  return { document: nextDocument, snapshot: nextSnapshot };
}

const TimelineContext = createContext<TimelineContextValue | undefined>(undefined);

export interface TimelineProviderProps {
  children: ReactNode;
}

export function TimelineProvider({ children }: TimelineProviderProps) {
  const {
    pointLists,
    lines,
    centerlines,
    contourLabels,
    boundaryFiles,
  } = useCanvasState();
  const canvasHistory = useCanvasHistory();

  const currentSnapshot = useMemo<TimelineSnapshot>(() => ({
    pointLists,
    lines,
    centerlines,
    contourLabels,
    boundaryFiles,
  }), [pointLists, lines, centerlines, contourLabels, boundaryFiles]);

  const snapshotRef = useRef(currentSnapshot);
  snapshotRef.current = currentSnapshot;

  const [document, setDocument] = useState<TimelineDocument>(() => createTimeline(currentSnapshot));
  const documentRef = useRef(document);
  documentRef.current = document;

  const [activeTransaction, setActiveTransaction] = useState<TimelineTransaction | null>(null);
  const activeTransactionRef = useRef<TimelineTransaction | null>(null);
  activeTransactionRef.current = activeTransaction;

  const [activeSketch, setActiveSketch] = useState<ActiveSketchInfo | null>(null);
  const [lastReplayError, setLastReplayError] = useState<TimelineFeatureError | null>(null);

  const applySnapshot = useCallback((snapshot: TimelineSnapshot, label: string) => {
    // The timeline cursor is the navigation source of truth. Apply without an
    // undo entry and re-seed history at the target so Ctrl+Z cannot walk behind
    // the cursor and leave the two out of sync.
    canvasHistory.applyExternalSnapshot(snapshot, label);
  }, [canvasHistory]);

  const clearActive = useCallback(() => {
    activeTransactionRef.current = null;
    setActiveTransaction(null);
    setActiveSketch(null);
  }, []);

  const startTransaction = useCallback((
    kind: TimelineTransaction['kind'],
    label: string,
    editingFeatureId?: string,
    startSnapshot?: TimelineSnapshot,
    sketchGroup?: boolean,
    meta?: TimelineFeatureMeta,
  ): boolean => {
    if (activeTransactionRef.current) return false;
    const transaction: TimelineTransaction = {
      kind,
      label,
      startedAt: Date.now(),
      startSnapshot: startSnapshot ?? snapshotRef.current,
      editingFeatureId,
      sketchGroup,
      pendingEvents: [],
      ...(meta?.icon ? { icon: meta.icon } : {}),
      ...(meta?.detail ? { detail: meta.detail } : {}),
    };
    activeTransactionRef.current = transaction;
    setActiveTransaction(transaction);
    setLastReplayError(null);
    return true;
  }, []);

  const beginSketch = useCallback(() => {
    if (activeTransactionRef.current) return;
    const name = `Sketch ${documentRef.current.sketchCounter + 1}`;
    if (!startTransaction('sketch', name)) return;
    setActiveSketch({ id: `sketch-draft-${Date.now().toString(36)}`, name });
  }, [startTransaction]);

  const finishSketch = useCallback(() => {
    const transaction = activeTransactionRef.current;
    if (!transaction || transaction.kind !== 'sketch') return;

    const end = snapshotRef.current;
    const pendingEvents = transaction.pendingEvents ?? [];
    const mutation: TimelineMutationResult = transaction.editingFeatureId
      ? updateFeatureAndReplay(documentRef.current, transaction.editingFeatureId, end)
      : appendFeature(
        documentRef.current,
        transaction.startSnapshot,
        end,
        'sketch',
        transaction.label,
        { type: 'human' },
        { allowEmpty: pendingEvents.length > 0, icon: 'sketch' },
      );

    if (mutation.committed) {
      const committedSketchId = transaction.editingFeatureId
        ?? mutation.document.features[mutation.document.features.length - 1]?.id
        ?? documentRef.current.currentSketchFeatureId;
      const nextDocument: TimelineDocument = {
        ...mutation.document,
        sketchCounter: transaction.editingFeatureId
          ? documentRef.current.sketchCounter
          : documentRef.current.sketchCounter + 1,
        currentSketchFeatureId: committedSketchId,
      };
      const flushed = flushPendingTimelineEvents(
        nextDocument,
        mutation.snapshot,
        pendingEvents,
        committedSketchId,
      );
      documentRef.current = flushed.document;
      setDocument(flushed.document);

      // Committing a feature makes the timeline its history owner. Resetting
      // here also prevents Ctrl+Z from reverting internal sketch edits while
      // the committed feature remains on the timeline.
      applySnapshot(
        flushed.snapshot,
        `Timeline: ${transaction.label}`,
      );
      setLastReplayError(mutation.error ?? null);
    } else if (pendingEvents.length > 0) {
      // A sketch with questions but no geometry still owns those utterances.
      const parentFeatureId = transaction.editingFeatureId;
      const flushed = flushPendingTimelineEvents(
        documentRef.current,
        transaction.startSnapshot,
        pendingEvents,
        parentFeatureId,
      );
      documentRef.current = flushed.document;
      setDocument(flushed.document);
      applySnapshot(flushed.snapshot, `Timeline: ${transaction.label}`);
      setLastReplayError(null);
    }

    clearActive();
  }, [applySnapshot, clearActive]);

  const cancelSketch = useCallback(() => {
    const transaction = activeTransactionRef.current;
    if (!transaction || transaction.kind !== 'sketch') return;
    const flushed = flushPendingTimelineEvents(
      documentRef.current,
      transaction.startSnapshot,
      transaction.pendingEvents,
      undefined,
    );
    documentRef.current = flushed.document;
    setDocument(flushed.document);
    applySnapshot(flushed.snapshot, `Timeline: cancel ${transaction.label}`);
    clearActive();
  }, [applySnapshot, clearActive]);

  const reopenSketch = useCallback((featureId: string): boolean => {
    if (activeTransactionRef.current) return false;
    const feature = getFeature(documentRef.current, featureId);
    if (!feature || feature.kind !== 'sketch') return false;

    applySnapshot(feature.snapshot, `Timeline: open ${feature.label}`);
    const nextDocument: TimelineDocument = {
      ...documentRef.current,
      cursorFeatureId: feature.id,
      currentSketchFeatureId: feature.id,
      updatedAt: Date.now(),
    };
    documentRef.current = nextDocument;
    setDocument(nextDocument);
    startTransaction('sketch', feature.label, feature.id, feature.snapshot);
    setActiveSketch({ id: feature.id, name: feature.label });
    return true;
  }, [applySnapshot, startTransaction]);

  const beginFeature = useCallback((label?: string, meta?: TimelineFeatureMeta) => {
    if (activeTransactionRef.current) return;
    const manualCount = documentRef.current.features.filter(feature => feature.kind === 'manual-feature').length;
    startTransaction(
      'manual-feature',
      label?.trim() || `Feature ${manualCount + 1}`,
      undefined,
      undefined,
      undefined,
      meta,
    );
  }, [startTransaction]);

  const beginImport = useCallback((
    label: string,
    options?: TimelineFeatureMeta & { sketchGroup?: boolean },
  ) => {
    if (activeTransactionRef.current) return false;
    return startTransaction(
      'import',
      label.trim() || 'Point import',
      undefined,
      undefined,
      options?.sketchGroup === true,
      { icon: options?.icon, detail: options?.detail },
    );
  }, [startTransaction]);

  const finishFeature = useCallback((label?: string) => {
    const transaction = activeTransactionRef.current;
    if (!transaction || (transaction.kind !== 'manual-feature' && transaction.kind !== 'import')) return;

    const end = snapshotRef.current;
    const pendingEvents = transaction.pendingEvents ?? [];
    const mutation = transaction.editingFeatureId
      ? updateFeatureAndReplay(documentRef.current, transaction.editingFeatureId, end)
      : transaction.kind === 'import' && transaction.sketchGroup
        ? appendImportFeature(
          documentRef.current,
          transaction.startSnapshot,
          end,
          label?.trim() || transaction.label,
          { type: 'human' },
          {
            parentFeatureId: documentRef.current.currentSketchFeatureId,
            createSketchParent: true,
            icon: transaction.icon,
            detail: transaction.detail,
          },
        )
        : appendFeature(
          documentRef.current,
          transaction.startSnapshot,
          end,
          transaction.kind,
          label?.trim() || transaction.label,
          { type: 'human' },
          { icon: transaction.icon, detail: transaction.detail },
        );

    if (mutation.committed) {
      const committedFeature = transaction.editingFeatureId
        ? getFeature(mutation.document, transaction.editingFeatureId)
        : mutation.document.features[mutation.document.features.length - 1];
      const committedId = committedFeature?.id ?? documentRef.current.cursorFeatureId;
      const parentFeatureId = transaction.kind === 'import'
        ? committedFeature?.parentFeatureId ?? (transaction.sketchGroup
          ? mutation.document.currentSketchFeatureId
          : committedId)
        : committedId;
      const flushed = flushPendingTimelineEvents(
        mutation.document,
        mutation.snapshot,
        pendingEvents,
        parentFeatureId,
      );
      documentRef.current = flushed.document;
      setDocument(flushed.document);
      // Committing a feature makes the timeline its history owner. Resetting
      // here also prevents Ctrl+Z from reverting internal sketch edits while
      // the committed feature remains on the timeline.
      applySnapshot(
        flushed.snapshot,
        `Timeline: ${transaction.label}`,
      );
      setLastReplayError(mutation.error ?? null);
    } else if (pendingEvents.length > 0) {
      const flushed = flushPendingTimelineEvents(
        documentRef.current,
        transaction.startSnapshot,
        pendingEvents,
        transaction.editingFeatureId,
      );
      documentRef.current = flushed.document;
      setDocument(flushed.document);
      applySnapshot(flushed.snapshot, `Timeline: ${transaction.label}`);
      setLastReplayError(null);
    }

    clearActive();
  }, [applySnapshot, clearActive]);

  const cancelFeature = useCallback(() => {
    const transaction = activeTransactionRef.current;
    if (!transaction) return;
    const flushed = flushPendingTimelineEvents(
      documentRef.current,
      transaction.startSnapshot,
      transaction.pendingEvents,
      undefined,
    );
    documentRef.current = flushed.document;
    setDocument(flushed.document);
    applySnapshot(flushed.snapshot, `Timeline: cancel ${transaction.label}`);
    clearActive();
  }, [applySnapshot, clearActive]);

  const recordEvent = useCallback((event: TimelineEventInput): boolean => {
    const label = event.label.trim();
    if (!label) return false;
    const kind = event.kind ?? 'event';
    const pending: TimelinePendingEvent = {
      label,
      kind,
      ...(event.icon ? { icon: event.icon } : {}),
      ...(event.detail ? { detail: event.detail } : {}),
    };

    // Questions and actions raised inside a sketch are held with the sketch so
    // they can be nested under it when the sketch commits instead of creating
    // a long row of top-level entries.
    const active = activeTransactionRef.current;
    if (active) {
      const nextTransaction: TimelineTransaction = {
        ...active,
        pendingEvents: [...(active.pendingEvents ?? []), pending],
      };
      activeTransactionRef.current = nextTransaction;
      setActiveTransaction(nextTransaction);
      return true;
    }

    const requestedParentFeatureId = event.parentFeatureId
      ?? (event.groupWithCurrentSketch ? documentRef.current.currentSketchFeatureId : undefined);
    const inferredParentFeatureId = event.parentFeatureId === undefined
      && !event.groupWithCurrentSketch
      && kind === 'event'
      ? inferGoalParentFeatureId(documentRef.current, event.icon)
      : undefined;
    const parentFeatureId = requestedParentFeatureId ?? inferredParentFeatureId;
    const mutation = appendEventFeature(
      documentRef.current,
      snapshotRef.current,
      kind,
      label,
      { type: 'human' },
      {
        parentFeatureId,
        ...(event.icon ? { icon: event.icon } : {}),
        ...(event.detail ? { detail: event.detail } : {}),
      },
    );
    if (!mutation.committed) return false;
    documentRef.current = mutation.document;
    setDocument(mutation.document);
    setLastReplayError(null);
    return true;
  }, []);

  const moveCursor = useCallback((featureId: string) => {
    if (activeTransactionRef.current) return;
    const mutation = moveTimelineCursor(documentRef.current, featureId);
    if (!mutation.committed) return;
    documentRef.current = mutation.document;
    setDocument(mutation.document);
    applySnapshot(mutation.snapshot, `Timeline: ${getFeature(mutation.document, featureId)?.label ?? 'move cursor'}`);
    setLastReplayError(mutation.error ?? null);
  }, [applySnapshot]);

  const renameFeature = useCallback((featureId: string, label: string) => {
    const next = renameTimelineFeature(documentRef.current, featureId, label);
    if (next === documentRef.current) return;
    documentRef.current = next;
    setDocument(next);
  }, []);

  const toggleSuppress = useCallback((featureId: string) => {
    if (activeTransactionRef.current) return;
    const mutation = toggleFeatureSuppression(documentRef.current, featureId);
    if (!mutation.committed) return;
    documentRef.current = mutation.document;
    setDocument(mutation.document);
    applySnapshot(mutation.snapshot, 'Timeline: suppress change');
    setLastReplayError(mutation.error ?? null);
  }, [applySnapshot]);

  const deleteFeature = useCallback((featureId: string) => {
    if (activeTransactionRef.current) return;
    const mutation = removeTimelineFeature(documentRef.current, featureId);
    if (!mutation.committed) return;
    documentRef.current = mutation.document;
    setDocument(mutation.document);
    applySnapshot(mutation.snapshot, 'Timeline: delete feature');
    setLastReplayError(mutation.error ?? null);
  }, [applySnapshot]);

  const resetTimeline = useCallback((snapshot?: TimelineSnapshot) => {
    const next = createTimeline(snapshot ?? snapshotRef.current);
    documentRef.current = next;
    setDocument(next);
    clearActive();
    setLastReplayError(null);
  }, [clearActive]);

  const loadTimeline = useCallback((
    serialized?: SerializedTimelineDocument,
    snapshot?: TimelineSnapshot,
  ) => {
    clearActive();
    const restored = deserializeTimelineDocument(serialized);
    if (restored) {
      documentRef.current = restored.document;
      setDocument(restored.document);
      setLastReplayError(restored.error ?? null);
      return;
    }
    const next = createTimeline(snapshot ?? snapshotRef.current);
    documentRef.current = next;
    setDocument(next);
    setLastReplayError(null);
  }, [clearActive]);

  const getSerializableDocument = useCallback(() => {
    const active = activeTransactionRef.current;
    let document = documentRef.current;
    let committedId: string | undefined;

    // Saving mid-sketch should not lose the work just drawn. Serialize a copy
    // with the open transaction appended; the live document is left untouched.
    if (active && !active.editingFeatureId) {
      const mutation = active.kind === 'import' && active.sketchGroup
        ? appendImportFeature(
          document,
          active.startSnapshot,
          snapshotRef.current,
          active.label,
          { type: 'human' },
          {
            parentFeatureId: document.currentSketchFeatureId,
            createSketchParent: true,
            icon: active.icon,
            detail: active.detail,
          },
        )
        : appendFeature(
          document,
          active.startSnapshot,
          snapshotRef.current,
          active.kind,
          active.label,
          { type: 'human' },
          {
            allowEmpty: (active.pendingEvents?.length ?? 0) > 0,
            icon: active.icon,
            detail: active.detail,
          },
        );
      if (mutation.committed) {
        committedId = active.editingFeatureId
          ?? mutation.document.features[mutation.document.features.length - 1]?.id;
        document = {
          ...mutation.document,
          sketchCounter: active.kind === 'sketch'
            ? documentRef.current.sketchCounter + 1
            : mutation.document.sketchCounter,
          currentSketchFeatureId: active.kind === 'sketch'
            ? committedId
            : mutation.document.currentSketchFeatureId,
        };
      }
    }

    if (active?.pendingEvents?.length) {
      const committedFeature = committedId ? getFeature(document, committedId) : undefined;
      const parentFeatureId = active.kind === 'sketch'
        ? active.editingFeatureId ?? committedId
        : active.editingFeatureId
          ?? committedFeature?.parentFeatureId
          ?? (active.sketchGroup ? document.currentSketchFeatureId : committedId);
      const snapshot = document.features[document.features.length - 1]?.snapshot ?? snapshotRef.current;
      document = flushPendingTimelineEvents(
        document,
        snapshot,
        active.pendingEvents,
        parentFeatureId,
      ).document;
    }

    return serializeTimelineDocument(document);
  }, []);

  const features = useMemo(() => decorateTimelineFeatures(document), [document]);
  const isSketchMode = activeSketch !== null;
  const hasFuture = hasFutureFeatures(document);

  const value = useMemo<TimelineContextValue>(() => ({
    document,
    features,
    activeSketch,
    activeTransaction,
    isSketchMode,
    hasFuture,
    lastReplayError,
    beginSketch,
    finishSketch,
    cancelSketch,
    reopenSketch,
    beginFeature,
    beginImport,
    commitFeature: finishFeature,
    cancelFeature,
    recordEvent,
    moveCursor,
    renameFeature,
    toggleSuppress,
    deleteFeature,
    resetTimeline,
    loadTimeline,
    getSerializableDocument,
  }), [
    document,
    features,
    activeSketch,
    activeTransaction,
    isSketchMode,
    hasFuture,
    lastReplayError,
    beginSketch,
    finishSketch,
    cancelSketch,
    reopenSketch,
    beginFeature,
    beginImport,
    finishFeature,
    cancelFeature,
    recordEvent,
    moveCursor,
    renameFeature,
    toggleSuppress,
    deleteFeature,
    resetTimeline,
    loadTimeline,
    getSerializableDocument,
  ]);

  return <TimelineContext.Provider value={value}>{children}</TimelineContext.Provider>;
}

export function useTimeline(): TimelineContextValue {
  const context = useContext(TimelineContext);
  if (!context) {
    throw new Error('useTimeline must be used within a TimelineProvider');
  }
  return context;
}

/** Optional variant for standalone canvas tests and embeds. */
export function useOptionalTimeline(): TimelineContextValue | null {
  return useContext(TimelineContext) ?? null;
}

/** Read-only cursor index helper for UI/debug surfaces. */
export function useTimelineCursorIndex(): number {
  const context = useContext(TimelineContext);
  return context ? getCursorIndex(context.document) : 0;
}

// Keep the empty-snapshot export available to callers that mount a timeline
// outside a loaded session without importing the types module separately.
export { emptyTimelineSnapshot };
