// Pure, framework-agnostic undo/redo engine for the canvas session state.
//
// Replaces the previous ad-hoc stack that lived inside CanvasStateContext, which
// deep-cloned the entire point/line model via JSON.parse(JSON.stringify(...)) on
// every edit and desynced its cursor from the array once the 50-entry cap was
// reached.
//
// Design notes:
//  * Snapshots use structural sharing. The app already treats canvas state
//    immutably (every writer uses setX(prev => [...])), so an unchanged slice can
//    be shared by reference between adjacent entries instead of copied. An edit
//    that only touches `lines` therefore costs one array reference, not a full
//    clone of the survey.
//  * There is exactly one cursor (`index`) and it is always derived from the same
//    mutation that trims the buffer, so capping can never desync it.
//  * Adjacent entries produced by the same logical operation can coalesce, so a
//    label drag or a rapid multi-point edit collapses into a single undo step.

/** A snapshot of the tracked slices at one point in time. */
export type HistorySnapshot<S extends object> = Readonly<S>;

export interface HistoryEntry<S extends object> {
  /** Stable identifier, used by the history panel and the AI undo skill. */
  readonly id: string;
  /** Human-readable description of the operation that produced this state. */
  readonly label: string;
  /** Epoch milliseconds when the entry was recorded. */
  readonly timestamp: number;
  /** Which tracked slices changed relative to the previous entry. */
  readonly changedKeys: readonly (keyof S)[];
  /** The full tracked state after the operation (structurally shared). */
  readonly snapshot: HistorySnapshot<S>;
  /**
   * Coalescing tag. Two consecutive records sharing a non-null tag within the
   * coalesce window merge into one entry.
   */
  readonly coalesceKey: string | null;
}

export interface HistoryEngineOptions<S extends object> {
  /** Maximum number of retained entries, including the baseline. Default 200. */
  maxEntries?: number;
  /**
   * Milliseconds within which two records carrying the same coalesceKey merge.
   * Default 600.
   */
  coalesceWindowMs?: number;
  /** Derives a label from a state transition. Falls back to "Edit". */
  describe?: (
    prev: HistorySnapshot<S>,
    next: HistorySnapshot<S>,
    changedKeys: readonly (keyof S)[],
  ) => string;
  /** Injectable clock, for deterministic tests. */
  now?: () => number;
}

export interface RecordOptions {
  /** Explicit label; overrides the `describe` callback. */
  label?: string;
  /** Tag enabling coalescing with the immediately preceding entry. */
  coalesceKey?: string | null;
  /** Force a distinct entry even if coalescing would otherwise apply. */
  discrete?: boolean;
}

export interface HistoryStatus<S extends object> {
  canUndo: boolean;
  canRedo: boolean;
  index: number;
  entries: readonly HistoryEntry<S>[];
  /** Label of the operation that `undo()` would revert, if any. */
  undoLabel: string | null;
  /** Label of the operation that `redo()` would reapply, if any. */
  redoLabel: string | null;
}

let idCounter = 0;
const nextId = (): string => `h${(++idCounter).toString(36)}${Date.now().toString(36)}`;

/**
 * Reference-equality diff over the keys present in `next`.
 *
 * Only the slices actually being reported are compared. A key that exists in the
 * snapshot but is missing from `next` is not a change — it belongs to a slice
 * that registered separately and is simply not part of this report.
 */
function diffKeys<S extends object>(a: S, b: S): (keyof S)[] {
  const changed: (keyof S)[] = [];
  (Object.keys(b) as (keyof S)[]).forEach(k => {
    if (!Object.is(a[k], b[k])) changed.push(k);
  });
  return changed;
}

/**
 * Builds a snapshot that shares references with `previous` for every slice that
 * did not change. This is what keeps deep history cheap. Slices present in
 * `previous` but absent from `next` are carried forward untouched.
 */
function share<S extends object>(previous: S | null, next: S): S {
  if (!previous) return { ...next };
  const out = { ...previous } as S;
  (Object.keys(next) as (keyof S)[]).forEach(k => {
    out[k] = Object.is(previous[k], next[k]) ? previous[k] : next[k];
  });
  return out;
}

export class HistoryEngine<S extends object> {
  private entries: HistoryEntry<S>[] = [];
  private index = -1;
  private readonly maxEntries: number;
  private readonly coalesceWindowMs: number;
  private readonly describe: NonNullable<HistoryEngineOptions<S>['describe']>;
  private readonly now: () => number;
  private listeners = new Set<() => void>();

  // Open transaction bookkeeping.
  private txDepth = 0;
  private txLabel: string | null = null;
  private txBaseIndex = -1;
  private txDirty = false;

  constructor(initial: S, options: HistoryEngineOptions<S> = {}) {
    this.maxEntries = Math.max(2, options.maxEntries ?? 200);
    this.coalesceWindowMs = options.coalesceWindowMs ?? 600;
    this.now = options.now ?? (() => Date.now());
    this.describe = options.describe ?? (() => 'Edit');
    this.reset(initial);
  }

  // --- Subscription -------------------------------------------------------

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private emit(): void {
    this.listeners.forEach(l => l());
  }

  // --- Queries ------------------------------------------------------------

  get current(): HistorySnapshot<S> {
    return this.entries[this.index].snapshot;
  }

  getStatus(): HistoryStatus<S> {
    const canUndo = this.index > 0;
    const canRedo = this.index < this.entries.length - 1;
    return {
      canUndo,
      canRedo,
      index: this.index,
      entries: this.entries,
      undoLabel: canUndo ? this.entries[this.index].label : null,
      redoLabel: canRedo ? this.entries[this.index + 1].label : null,
    };
  }

  getEntries(): readonly HistoryEntry<S>[] {
    return this.entries;
  }

  // --- Recording ----------------------------------------------------------

  /**
   * Records a new state. Returns true if an entry was created or updated.
   * A state identical (by slice reference) to the current one is ignored, which
   * is what makes the automatic observer safe to call on every render.
   */
  record(next: S, options: RecordOptions = {}): boolean {
    const currentEntry = this.entries[this.index];
    const changedKeys = diffKeys(currentEntry.snapshot as S, next);
    if (changedKeys.length === 0) return false;

    const snapshot = share(currentEntry.snapshot as S, next);
    const timestamp = this.now();

    if (this.txDepth > 0) {
      // Inside a transaction every change folds into a single entry sitting
      // immediately after the transaction's base index.
      const label = this.txLabel
        ?? options.label
        ?? this.describe(this.entries[this.txBaseIndex].snapshot, snapshot, changedKeys);

      if (!this.txDirty) {
        this.truncateTo(this.txBaseIndex);
        this.push({
          id: nextId(),
          label,
          timestamp,
          changedKeys,
          snapshot,
          coalesceKey: null,
        });
        this.txDirty = true;
      } else {
        const base = this.entries[this.txBaseIndex].snapshot as S;
        const existing = this.entries[this.index];
        this.entries[this.index] = {
          ...existing,
          label,
          timestamp,
          changedKeys: diffKeys(base, snapshot),
          snapshot,
        };
      }
      this.emit();
      return true;
    }

    const label = options.label
      ?? this.describe(currentEntry.snapshot, snapshot, changedKeys);
    const coalesceKey = options.coalesceKey ?? null;

    const canCoalesce =
      !options.discrete &&
      coalesceKey !== null &&
      currentEntry.coalesceKey === coalesceKey &&
      this.index > 0 &&
      timestamp - currentEntry.timestamp <= this.coalesceWindowMs;

    if (canCoalesce) {
      // Merge into the current entry, re-diffing against the entry it replaced
      // so changedKeys stays accurate for the whole merged operation.
      const base = this.entries[this.index - 1].snapshot as S;
      this.entries[this.index] = {
        ...currentEntry,
        label,
        timestamp,
        changedKeys: diffKeys(base, snapshot),
        snapshot,
      };
      // A coalesced record still invalidates any redo branch.
      this.entries.length = this.index + 1;
      this.emit();
      return true;
    }

    this.truncateTo(this.index);
    this.push({
      id: nextId(),
      label,
      timestamp,
      changedKeys,
      snapshot,
      coalesceKey,
    });
    this.emit();
    return true;
  }

  /** Drops any redo branch above `index`. */
  private truncateTo(index: number): void {
    this.entries.length = index + 1;
    this.index = index;
  }

  /**
   * Appends an entry and enforces the cap. The cursor is recomputed from the
   * array in the same operation that trims it, so the two can never desync —
   * this is the bug that made undo jump to the wrong state past 50 edits.
   */
  private push(entry: HistoryEntry<S>): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      const overflow = this.entries.length - this.maxEntries;
      this.entries.splice(0, overflow);
      if (this.txBaseIndex >= 0) this.txBaseIndex = Math.max(0, this.txBaseIndex - overflow);
    }
    this.index = this.entries.length - 1;
  }

  // --- Transactions -------------------------------------------------------

  /**
   * Opens a transaction. Every `record` until the matching `commit` folds into a
   * single undo entry, so a multi-slice operation (boundary propagation touches
   * points *and* lines) reverts atomically. Nestable.
   */
  begin(label?: string): void {
    if (this.txDepth === 0) {
      this.txBaseIndex = this.index;
      this.txLabel = label ?? null;
      this.txDirty = false;
    } else if (label && !this.txLabel) {
      this.txLabel = label;
    }
    this.txDepth++;
  }

  /** Closes the innermost transaction. Returns true when the outermost closed. */
  commit(): boolean {
    if (this.txDepth === 0) return false;
    this.txDepth--;
    if (this.txDepth > 0) return false;
    this.txLabel = null;
    this.txBaseIndex = -1;
    const dirty = this.txDirty;
    this.txDirty = false;
    if (dirty) this.emit();
    return true;
  }

  /** Discards everything recorded since the outermost `begin`. */
  abort(): HistorySnapshot<S> | null {
    if (this.txDepth === 0) return null;
    const base = this.txBaseIndex;
    this.txDepth = 0;
    this.txLabel = null;
    this.txDirty = false;
    this.txBaseIndex = -1;
    if (base >= 0 && base < this.entries.length) {
      this.truncateTo(base);
      this.emit();
      return this.entries[this.index].snapshot;
    }
    return null;
  }

  get inTransaction(): boolean {
    return this.txDepth > 0;
  }

  // --- Navigation ---------------------------------------------------------

  /** Steps back one entry. Returns the state to apply, or null if unavailable. */
  undo(): HistorySnapshot<S> | null {
    if (this.index <= 0) return null;
    this.index--;
    this.emit();
    return this.entries[this.index].snapshot;
  }

  /** Steps forward one entry. Returns the state to apply, or null. */
  redo(): HistorySnapshot<S> | null {
    if (this.index >= this.entries.length - 1) return null;
    this.index++;
    this.emit();
    return this.entries[this.index].snapshot;
  }

  /**
   * Jumps directly to an entry by id. Used by the history panel and by the AI
   * undo skill, which resolves a natural-language request to a specific entry.
   */
  jumpTo(entryId: string): HistorySnapshot<S> | null {
    const target = this.entries.findIndex(e => e.id === entryId);
    if (target < 0 || target === this.index) return null;
    this.index = target;
    this.emit();
    return this.entries[this.index].snapshot;
  }

  /**
   * Adds a slice that was not present when the engine was seeded, without
   * recording an edit.
   *
   * External slices (boundaryFiles lives in App state) register themselves after
   * the first render. Their arrival is not a user edit, so the key is folded
   * into every retained snapshot instead of being diffed as a change.
   * Returns true if the key was newly adopted.
   */
  adoptSlice(key: keyof S, value: S[keyof S]): boolean {
    if (Object.prototype.hasOwnProperty.call(this.entries[0].snapshot, key)) {
      return false;
    }
    this.entries = this.entries.map(e => ({
      ...e,
      snapshot: { ...(e.snapshot as S), [key]: value } as HistorySnapshot<S>,
    }));
    return true;
  }

  /** Re-seeds the engine, discarding all history (e.g. on project load). */
  reset(initial: S, label = 'Initial state'): void {
    this.entries = [{
      id: nextId(),
      label,
      timestamp: this.now(),
      changedKeys: [],
      snapshot: share(null, initial),
      coalesceKey: null,
    }];
    this.index = 0;
    this.txDepth = 0;
    this.txLabel = null;
    this.txBaseIndex = -1;
    this.txDirty = false;
    this.emit();
  }
}
