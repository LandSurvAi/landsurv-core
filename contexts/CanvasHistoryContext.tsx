// React binding for the canvas undo/redo engine.
//
// Capture is *automatic*: the controller observes the tracked canvas slices and
// records an entry whenever one of them changes by reference. This replaces the
// old model where undo only worked if a developer remembered to call
// pushHistory() at the mutation site — there were 6 such calls against 118
// mutation sites, so most edits were silently not undoable.
//
// External slices (boundaryFiles lives in App state, not CanvasStateContext) can
// opt in via useHistorySlice().

import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useEffect,
  useMemo,
  useCallback,
  ReactNode,
} from 'react';
import { HistoryEngine, type HistoryEntry } from '../utils/historyEngine.ts';
import {
  describeCanvasChange,
  categorizeCanvasChange,
  type TrackedCanvasState,
} from '../utils/historyLabels.ts';

/** An entry as surfaced to the UI and to the AI undo skill. */
export interface CanvasHistoryEntry {
  id: string;
  label: string;
  timestamp: number;
  /** Broad areas touched: points, lines, centerlines, contours, boundary. */
  tags: string[];
  /** True for the entry the session is currently sitting on. */
  isCurrent: boolean;
}

export interface CanvasHistoryApi {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  /** Label of the operation undo() would revert, for tooltips. */
  undoLabel: string | null;
  redoLabel: string | null;
  entries: CanvasHistoryEntry[];
  /** Restore the state captured at a specific entry. */
  jumpTo: (entryId: string) => boolean;
  /**
   * Groups every canvas mutation performed by `fn` into one labeled undo entry.
   * Safe to nest.
   */
  withLabel: <T>(label: string, fn: () => T) => T;
  beginTransaction: (label?: string) => void;
  commitTransaction: () => void;
  /**
   * Hints the label for the next automatically-captured change. Kept so the
   * pre-existing pushHistory() call sites keep working; capture itself no longer
   * depends on being called.
   */
  hintNextLabel: (label?: string) => void;
  /** Marks a burst of changes as one operation (e.g. a label drag). */
  setCoalesceKey: (key: string | null) => void;
  /** Discards all history and re-seeds from current state (project load). */
  resetHistory: () => void;
  /** Internal: lets external state register itself as a tracked slice. */
  __registerSlice: (
    key: string,
    value: unknown,
    setter: (v: never) => void,
  ) => void;
}

const CanvasHistoryContext = createContext<CanvasHistoryApi | undefined>(undefined);

type Slices = Record<string, unknown>;

export interface CanvasHistoryProviderProps {
  children: ReactNode;
  /** The canvas slices owned by CanvasStateContext. */
  tracked: Slices;
  /** Setters used to apply an undone/redone snapshot back into React state. */
  setters: Record<string, (value: never) => void>;
  /** Entry cap. Structural sharing makes a deep stack cheap. */
  maxEntries?: number;
}

export function CanvasHistoryProvider({
  children,
  tracked,
  setters,
  maxEntries = 200,
}: CanvasHistoryProviderProps) {
  // Slices contributed by components outside CanvasStateContext.
  const externalRef = useRef<Record<string, { value: unknown; setter: (v: never) => void }>>({});
  // Bumped whenever an external slice's value changes, so `composed` recomputes
  // even though the external values live in a ref.
  const [externalVersion, setExternalVersion] = useState(0);

  const composed = useMemo(() => {
    const out: Slices = { ...tracked };
    Object.entries(externalRef.current).forEach(([k, v]) => { out[k] = v.value; });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracked, externalVersion]);

  const engineRef = useRef<HistoryEngine<Slices> | null>(null);
  if (engineRef.current === null) {
    engineRef.current = new HistoryEngine<Slices>(composed, {
      maxEntries,
      describe: (prev, next, changedKeys) =>
        describeCanvasChange(
          prev as unknown as TrackedCanvasState,
          next as unknown as TrackedCanvasState,
          changedKeys as readonly (keyof TrackedCanvasState)[],
        ),
    });
  }
  const engine = engineRef.current;

  // Holds the snapshot currently being applied by undo/redo. Comparing against
  // the observed state (rather than using a bare boolean) means the suppression
  // can never get stuck: if a restore happens to produce no re-render, or an
  // unrelated edit lands first, the guard resolves correctly instead of
  // swallowing the next real edit. Without suppression the observer would see
  // its own restoration as a fresh user edit and re-record it.
  const applyingRef = useRef<Slices | null>(null);
  const pendingLabelRef = useRef<string | undefined>(undefined);
  const coalesceKeyRef = useRef<string | null>(null);
  // Commits requested while a transaction's changes were still pending render.
  const pendingCommitRef = useRef(0);

  const [version, setVersion] = useState(0);
  useEffect(() => engine.subscribe(() => setVersion(v => v + 1)), [engine]);

  const setterFor = useCallback((key: string): ((v: never) => void) | undefined => {
    return setters[key] ?? externalRef.current[key]?.setter;
  }, [setters]);

  /** Pushes a restored snapshot back into React state. */
  const applySnapshot = useCallback((snapshot: Slices) => {
    applyingRef.current = snapshot;
    Object.entries(snapshot).forEach(([key, value]) => {
      const setter = setterFor(key);
      if (setter) setter(value as never);
    });
  }, [setterFor]);

  /** True when `state` already matches every slice of the pending restore. */
  const matchesPendingApply = useCallback((state: Slices): boolean => {
    const pending = applyingRef.current;
    if (!pending) return false;
    return Object.keys(pending).every(k => Object.is(pending[k], state[k]));
  }, []);

  // --- The observer -------------------------------------------------------
  useEffect(() => {
    if (applyingRef.current) {
      if (matchesPendingApply(composed)) {
        // This render is the settled result of an undo/redo. Resync the
        // observer baseline without recording.
        applyingRef.current = null;
        return;
      }
      // The restore has not fully landed yet (a setter may be deferred). Wait
      // for the render that matches, rather than recording an intermediate.
      return;
    }
    const label = pendingLabelRef.current;
    pendingLabelRef.current = undefined;
    engine.record(composed, {
      label,
      coalesceKey: coalesceKeyRef.current,
    });
    // Now that this operation's changes have been observed, honour any commit
    // that was requested synchronously during the handler.
    while (pendingCommitRef.current > 0) {
      pendingCommitRef.current--;
      engine.commit();
    }
  }, [composed, engine, matchesPendingApply]);

  // --- Public API ---------------------------------------------------------

  const undo = useCallback(() => {
    const snapshot = engine.undo();
    if (snapshot) applySnapshot(snapshot as Slices);
  }, [engine, applySnapshot]);

  const redo = useCallback(() => {
    const snapshot = engine.redo();
    if (snapshot) applySnapshot(snapshot as Slices);
  }, [engine, applySnapshot]);

  const jumpTo = useCallback((entryId: string) => {
    const snapshot = engine.jumpTo(entryId);
    if (!snapshot) return false;
    applySnapshot(snapshot as Slices);
    return true;
  }, [engine, applySnapshot]);

  const beginTransaction = useCallback((label?: string) => {
    engine.begin(label);
  }, [engine]);

  /**
   * Closes the transaction *after* the resulting React render has been observed.
   *
   * begin/commit are called synchronously inside an event handler, but the
   * setState calls between them do not reach the observer until the next commit
   * phase. Closing immediately would therefore end the transaction before any of
   * its changes were seen, splitting the operation into separate undo entries.
   */
  const commitTransaction = useCallback(() => {
    if (!engine.inTransaction) return;
    pendingCommitRef.current++;
    // Fallback: if the operation ended up mutating nothing, no observation will
    // arrive, so close on the next macrotask to avoid leaving it open.
    setTimeout(() => {
      if (pendingCommitRef.current > 0) {
        pendingCommitRef.current--;
        engine.commit();
      }
    }, 0);
  }, [engine]);

  const withLabel = useCallback(<T,>(label: string, fn: () => T): T => {
    beginTransaction(label);
    try {
      return fn();
    } finally {
      commitTransaction();
    }
  }, [beginTransaction, commitTransaction]);

  const hintNextLabel = useCallback((label?: string) => {
    if (label) pendingLabelRef.current = label;
  }, []);

  const setCoalesceKey = useCallback((key: string | null) => {
    coalesceKeyRef.current = key;
  }, []);

  const resetHistory = useCallback(() => {
    engine.reset(composed);
  }, [engine, composed]);

  const __registerSlice = useCallback((
    key: string,
    value: unknown,
    setter: (v: never) => void,
  ) => {
    const existing = externalRef.current[key];
    externalRef.current[key] = { value, setter };
    // First registration extends the baseline rather than counting as an edit,
    // so a late-registering slice cannot manufacture a spurious undo step.
    engine.adoptSlice(key, value as never);
    if (existing && !Object.is(existing.value, value)) {
      setExternalVersion(v => v + 1);
    } else if (!existing) {
      setExternalVersion(v => v + 1);
    }
  }, [engine]);

  const status = useMemo(() => engine.getStatus(), [engine, version]);

  const entries = useMemo<CanvasHistoryEntry[]>(() => {
    return status.entries.map((e: HistoryEntry<Slices>, i: number) => ({
      id: e.id,
      label: e.label,
      timestamp: e.timestamp,
      tags: categorizeCanvasChange(
        e.changedKeys as readonly (keyof TrackedCanvasState)[],
      ),
      isCurrent: i === status.index,
    }));
  }, [status]);

  const value = useMemo<CanvasHistoryApi>(() => ({
    canUndo: status.canUndo,
    canRedo: status.canRedo,
    undo,
    redo,
    undoLabel: status.undoLabel,
    redoLabel: status.redoLabel,
    entries,
    jumpTo,
    withLabel,
    beginTransaction,
    commitTransaction,
    hintNextLabel,
    setCoalesceKey,
    resetHistory,
    __registerSlice,
  }), [
    status, undo, redo, entries, jumpTo, withLabel,
    beginTransaction, commitTransaction, hintNextLabel,
    setCoalesceKey, resetHistory, __registerSlice,
  ]);

  return (
    <CanvasHistoryContext.Provider value={value}>
      {children}
    </CanvasHistoryContext.Provider>
  );
}

export function useCanvasHistory(): CanvasHistoryApi {
  const ctx = useContext(CanvasHistoryContext);
  if (!ctx) {
    throw new Error('useCanvasHistory must be used within a CanvasHistoryProvider');
  }
  return ctx;
}

/**
 * Optional variant for call sites that may render outside the provider (the
 * history provider lives inside CanvasStateProvider, so most of the tree has it,
 * but standalone component tests may not).
 */
export function useOptionalCanvasHistory(): CanvasHistoryApi | null {
  return useContext(CanvasHistoryContext) ?? null;
}

/**
 * Registers a slice of state that lives outside CanvasStateContext (such as
 * boundaryFiles in App) so it participates in undo/redo.
 */
export function useHistorySlice<T>(
  key: string,
  value: T,
  setter: React.Dispatch<React.SetStateAction<T>>,
): void {
  const history = useOptionalCanvasHistory();
  const register = history?.__registerSlice;
  useEffect(() => {
    if (!register) return;
    register(key, value, setter as unknown as (v: never) => void);
  }, [register, key, value, setter]);
}
