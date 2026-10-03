/**
 * C3D Sync Protocol — shared contract between the webapp Sync Center and the
 * Civil 3D connector DLL sync engine.
 *
 * This module is the TypeScript source of truth for:
 *   - sync record shapes (points, layers, linework, annotations, symbols)
 *   - diff semantics (cad-only / lsai-only / equal / changed / conflict)
 *   - apply-plan resolution with safety defaults (deletes are NEVER default)
 *
 * The DLL mirrors these semantics in civil3d-client/Sync/SyncEngine.cs. Keep the
 * two implementations aligned — they exchange these records verbatim over the
 * /c3d WebSocket relay (get_sync_snapshot, sync_apply, sync_lsai_apply).
 *
 * Conflict detection is baseline-aware: when a baseline snapshot from the last
 * completed sync exists, "changed on both sides" becomes a true conflict.
 * Without a baseline, differing values are 'changed' and the chosen direction
 * decides.
 */

// ── Categories & directions ─────────────────────────────────────────────────

export type C3DSyncCategory = 'points' | 'layers' | 'linework' | 'annotation' | 'symbols';

/** Who provides the truth for differing items. */
export type C3DSyncDirection = 'cad-wins' | 'lsai-wins' | 'merge';

export type C3DSyncItemState = 'cad-only' | 'lsai-only' | 'equal' | 'changed' | 'conflict';

/** Resolved per-item action. delete-* exists but is never a default. */
export type C3DSyncAction =
  | 'create-cad' | 'create-lsai'
  | 'update-cad' | 'update-lsai'
  | 'delete-cad' | 'delete-lsai'
  | 'skip';

// ── Wire records (must stay JSON-serializable; mirrored in SyncModels.cs) ────

export interface C3DPointRecord {
  pointNumber: string;
  easting: number;
  northing: number;
  elevation: number;
  description: string;
  layer?: string | null;
}

export interface C3DLayerRecord {
  name: string;
  color?: string | null;      // normalized "#RRGGBB" or ACI number as string
  lineType?: string | null;
  lineWeight?: number | null; // 1/100 mm, AutoCAD convention
}

export interface C3DLineVertex {
  x: number;
  y: number;
  z?: number;
  /** Arc bulge at this vertex (tan(included/4)); CCW positive. 0/undefined = straight. */
  bulge?: number;
}

export interface C3DLineRecord {
  /** Stable id. LSAI: SurveyLine.polylineId/id. CAD: LANDSURV_LINE_ID XData, else handle. */
  id: string;
  layer?: string | null;
  closed: boolean;
  vertices: C3DLineVertex[];
}

export interface C3DAnnotationRecord {
  id: string;
  kind: 'street-label' | 'parcel-label' | 'point-label' | 'note';
  x: number;
  y: number;
  /** CCW rotation, degrees. */
  angle: number;
  text: string;
  layer?: string | null;
  /** Text height in drawing units. */
  height?: number;
}

export interface C3DBlockRecord {
  /** Block/symbol name, compared case-insensitively. */
  name: string;
  /** LSAI side: SVG path used to (re)create the block definition. */
  svgPath?: string;
  viewBox?: string;
  scale?: number;
  /** CAD side: how many inserts reference this block. */
  referenceCount?: number;
}

// ── Diff model ───────────────────────────────────────────────────────────────

export interface SyncDiffEntry<T> {
  key: string;
  state: C3DSyncItemState;
  cad?: T;
  lsai?: T;
  baseline?: T;
  /** Human-readable field differences, e.g. "elevation: 100.00 → 101.25". */
  fieldDiffs?: string[];
}

export interface CategoryDiff<T> {
  category: C3DSyncCategory;
  entries: SyncDiffEntry<T>[];
  counts: Record<C3DSyncItemState, number>;
}

export interface C3DSyncSnapshot {
  points: C3DPointRecord[];
  layers: C3DLayerRecord[];
  linework: C3DLineRecord[];
  annotations: C3DAnnotationRecord[];
  symbols: C3DBlockRecord[];
}

export type SyncBaseline = Partial<C3DSyncSnapshot>;

export interface SyncPlanEntry {
  key: string;
  action: C3DSyncAction;
  /** True when the action was explicitly chosen by the user, not derived. */
  explicit?: boolean;
}

export interface CategoryPlan {
  category: C3DSyncCategory;
  direction: C3DSyncDirection;
  entries: SyncPlanEntry[];
}

export interface SyncApplyPlan {
  planId: string;
  categories: CategoryPlan[];
}

// ── Comparison helpers ───────────────────────────────────────────────────────

const COORD_TOLERANCE = 1e-4;

function near(a: number | undefined | null, b: number | undefined | null, tol = COORD_TOLERANCE): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= tol;
}

function strEq(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').trim() === (b ?? '').trim();
}

function normKey(s: string): string {
  return s.trim().toUpperCase();
}

function emptyCounts(): Record<C3DSyncItemState, number> {
  return { 'cad-only': 0, 'lsai-only': 0, equal: 0, changed: 0, conflict: 0 };
}

function finalize<T>(category: C3DSyncCategory, entries: SyncDiffEntry<T>[]): CategoryDiff<T> {
  const counts = emptyCounts();
  for (const e of entries) counts[e.state]++;
  entries.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
  return { category, entries, counts };
}

function classify<T>(
  cad: T | undefined,
  lsai: T | undefined,
  baseline: T | undefined,
  isEqual: (a: T, b: T) => { equal: boolean; fieldDiffs?: string[] },
): { state: C3DSyncItemState; fieldDiffs?: string[] } {
  if (cad && !lsai) return { state: 'cad-only' };
  if (lsai && !cad) return { state: 'lsai-only' };
  if (!cad || !lsai) return { state: 'equal' }; // unreachable, defensive

  const cmp = isEqual(cad, lsai);
  if (cmp.equal) return { state: 'equal', fieldDiffs: cmp.fieldDiffs };

  // Baseline-aware conflict detection: both sides differ from the baseline.
  if (baseline !== undefined) {
    const cadVsBase = isEqual(cad, baseline);
    const lsaiVsBase = isEqual(lsai, baseline);
    if (!cadVsBase.equal && !lsaiVsBase.equal) {
      return { state: 'conflict', fieldDiffs: cmp.fieldDiffs };
    }
  }
  return { state: 'changed', fieldDiffs: cmp.fieldDiffs };
}

// ── Category diff functions ──────────────────────────────────────────────────

export function diffPoints(
  cad: C3DPointRecord[],
  lsai: C3DPointRecord[],
  baseline?: C3DPointRecord[],
): CategoryDiff<C3DPointRecord> {
  const cadMap = new Map(cad.map(p => [normKey(p.pointNumber), p]));
  const lsaiMap = new Map(lsai.map(p => [normKey(p.pointNumber), p]));
  const baseMap = new Map((baseline ?? []).map(p => [normKey(p.pointNumber), p]));
  const keys = new Set([...cadMap.keys(), ...lsaiMap.keys()]);

  const isEqual = (a: C3DPointRecord, b: C3DPointRecord) => {
    const diffs: string[] = [];
    if (!near(a.easting, b.easting)) diffs.push(`easting ${a.easting} ↔ ${b.easting}`);
    if (!near(a.northing, b.northing)) diffs.push(`northing ${a.northing} ↔ ${b.northing}`);
    if (!near(a.elevation, b.elevation)) diffs.push(`elevation ${a.elevation} ↔ ${b.elevation}`);
    if (!strEq(a.description, b.description)) diffs.push(`description "${a.description}" ↔ "${b.description}"`);
    return { equal: diffs.length === 0, fieldDiffs: diffs.length ? diffs : undefined };
  };

  const entries: SyncDiffEntry<C3DPointRecord>[] = [];
  for (const key of keys) {
    const c = cadMap.get(key); const l = lsaiMap.get(key); const base = baseMap.get(key);
    const { state, fieldDiffs } = classify(c, l, base, isEqual);
    entries.push({ key, state, cad: c, lsai: l, baseline: base, fieldDiffs });
  }
  return finalize('points', entries);
}

export function diffLayers(
  cad: C3DLayerRecord[],
  lsai: C3DLayerRecord[],
  baseline?: C3DLayerRecord[],
): CategoryDiff<C3DLayerRecord> {
  const cadMap = new Map(cad.map(l => [normKey(l.name), l]));
  const lsaiMap = new Map(lsai.map(l => [normKey(l.name), l]));
  const baseMap = new Map((baseline ?? []).map(l => [normKey(l.name), l]));
  const keys = new Set([...cadMap.keys(), ...lsaiMap.keys()]);

  const isEqual = (a: C3DLayerRecord, b: C3DLayerRecord) => {
    const diffs: string[] = [];
    if (!strEq(a.color ?? '', b.color ?? '')) diffs.push(`color ${a.color ?? '—'} ↔ ${b.color ?? '—'}`);
    if (!strEq(a.lineType ?? '', b.lineType ?? '')) diffs.push(`linetype ${a.lineType ?? '—'} ↔ ${b.lineType ?? '—'}`);
    if (!near(a.lineWeight ?? null, b.lineWeight ?? null, 0.01)) diffs.push(`lineweight ${a.lineWeight ?? '—'} ↔ ${b.lineWeight ?? '—'}`);
    return { equal: diffs.length === 0, fieldDiffs: diffs.length ? diffs : undefined };
  };

  const entries: SyncDiffEntry<C3DLayerRecord>[] = [];
  for (const key of keys) {
    const c = cadMap.get(key); const l = lsaiMap.get(key); const base = baseMap.get(key);
    const { state, fieldDiffs } = classify(c, l, base, isEqual);
    entries.push({ key, state, cad: c, lsai: l, baseline: base, fieldDiffs });
  }
  return finalize('layers', entries);
}

function lineGeometryEqual(a: C3DLineRecord, b: C3DLineRecord): { equal: boolean; fieldDiffs?: string[] } {
  const diffs: string[] = [];
  if (a.closed !== b.closed) diffs.push(`closed ${a.closed} ↔ ${b.closed}`);
  if (!strEq(a.layer ?? '', b.layer ?? '')) diffs.push(`layer ${a.layer ?? '—'} ↔ ${b.layer ?? '—'}`);
  if (a.vertices.length !== b.vertices.length) {
    diffs.push(`vertex count ${a.vertices.length} ↔ ${b.vertices.length}`);
  } else {
    for (let i = 0; i < a.vertices.length; i++) {
      const va = a.vertices[i]; const vb = b.vertices[i];
      if (!near(va.x, vb.x) || !near(va.y, vb.y)) {
        diffs.push(`vertex ${i + 1} moved (${va.x},${va.y}) ↔ (${vb.x},${vb.y})`);
        break;
      }
      if (!near(va.bulge ?? 0, vb.bulge ?? 0, 1e-6)) {
        diffs.push(`vertex ${i + 1} bulge ${va.bulge ?? 0} ↔ ${vb.bulge ?? 0}`);
        break;
      }
    }
  }
  return { equal: diffs.length === 0, fieldDiffs: diffs.length ? diffs : undefined };
}

export function diffLinework(
  cad: C3DLineRecord[],
  lsai: C3DLineRecord[],
  baseline?: C3DLineRecord[],
): CategoryDiff<C3DLineRecord> {
  const cadMap = new Map(cad.map(l => [l.id, l]));
  const lsaiMap = new Map(lsai.map(l => [l.id, l]));
  const baseMap = new Map((baseline ?? []).map(l => [l.id, l]));
  const keys = new Set([...cadMap.keys(), ...lsaiMap.keys()]);

  const entries: SyncDiffEntry<C3DLineRecord>[] = [];
  for (const key of keys) {
    const c = cadMap.get(key); const l = lsaiMap.get(key); const base = baseMap.get(key);
    const { state, fieldDiffs } = classify(c, l, base, lineGeometryEqual);
    entries.push({ key, state, cad: c, lsai: l, baseline: base, fieldDiffs });
  }
  return finalize('linework', entries);
}

export function diffAnnotations(
  cad: C3DAnnotationRecord[],
  lsai: C3DAnnotationRecord[],
  baseline?: C3DAnnotationRecord[],
): CategoryDiff<C3DAnnotationRecord> {
  const cadMap = new Map(cad.map(a => [a.id, a]));
  const lsaiMap = new Map(lsai.map(a => [a.id, a]));
  const baseMap = new Map((baseline ?? []).map(a => [a.id, a]));
  const keys = new Set([...cadMap.keys(), ...lsaiMap.keys()]);

  const isEqual = (a: C3DAnnotationRecord, b: C3DAnnotationRecord) => {
    const diffs: string[] = [];
    if (!strEq(a.text, b.text)) diffs.push(`text "${a.text}" ↔ "${b.text}"`);
    if (!near(a.x, b.x) || !near(a.y, b.y)) diffs.push('position changed');
    if (!near(a.angle, b.angle, 0.01)) diffs.push(`rotation ${a.angle}° ↔ ${b.angle}°`);
    if (!strEq(a.layer ?? '', b.layer ?? '')) diffs.push(`layer ${a.layer ?? '—'} ↔ ${b.layer ?? '—'}`);
    return { equal: diffs.length === 0, fieldDiffs: diffs.length ? diffs : undefined };
  };

  const entries: SyncDiffEntry<C3DAnnotationRecord>[] = [];
  for (const key of keys) {
    const c = cadMap.get(key); const l = lsaiMap.get(key); const base = baseMap.get(key);
    const { state, fieldDiffs } = classify(c, l, base, isEqual);
    entries.push({ key, state, cad: c, lsai: l, baseline: base, fieldDiffs });
  }
  return finalize('annotation', entries);
}

export function diffSymbols(
  cad: C3DBlockRecord[],
  lsai: C3DBlockRecord[],
  baseline?: C3DBlockRecord[],
): CategoryDiff<C3DBlockRecord> {
  const cadMap = new Map(cad.map(b => [normKey(b.name), b]));
  const lsaiMap = new Map(lsai.map(b => [normKey(b.name), b]));
  const baseMap = new Map((baseline ?? []).map(b => [normKey(b.name), b]));
  const keys = new Set([...cadMap.keys(), ...lsaiMap.keys()]);

  const isEqual = (_a: C3DBlockRecord, _b: C3DBlockRecord) => ({ equal: true, fieldDiffs: undefined });
  // Geometry equality for symbols is impractical over the wire; same-name blocks
  // count as equal unless the user explicitly re-pushes a symbol (update-cad override).

  const entries: SyncDiffEntry<C3DBlockRecord>[] = [];
  for (const key of keys) {
    const c = cadMap.get(key); const l = lsaiMap.get(key); const base = baseMap.get(key);
    const { state } = classify(c, l, base, isEqual);
    entries.push({ key, state, cad: c, lsai: l, baseline: base });
  }
  return finalize('symbols', entries);
}

// ── Apply-plan resolution (safety defaults live HERE) ────────────────────────

/**
 * Resolve a per-category diff into concrete actions for the chosen direction.
 *
 * Safety invariants (both sides rely on these):
 *  - 'equal' items are always skipped.
 *  - Deletes are NEVER produced by default resolution, regardless of direction.
 *    A delete only appears when the caller passes an explicit per-key override.
 *  - 'conflict' items default to skip — the user must resolve each one.
 *  - 'changed' items under 'merge' default to skip (ambiguous origin without
 *    baseline agreement); cad-wins/lsai-wins resolve them to the loser side.
 */
export function buildCategoryPlan<T>(
  diff: CategoryDiff<T>,
  direction: C3DSyncDirection,
  overrides?: Map<string, C3DSyncAction>,
): CategoryPlan {
  const entries: SyncPlanEntry[] = diff.entries.map(entry => {
    const explicit = overrides?.get(entry.key);
    if (explicit) return { key: entry.key, action: explicit, explicit: true };

    let action: C3DSyncAction = 'skip';
    switch (entry.state) {
      case 'equal':
        action = 'skip';
        break;
      case 'cad-only':
        // Exists only in CAD. merge → bring into LSAI. lsai-wins → keep (never delete by default).
        action = direction === 'merge' ? 'create-lsai' : 'skip';
        break;
      case 'lsai-only':
        action = direction === 'merge' || direction === 'lsai-wins' ? 'create-cad' : 'skip';
        break;
      case 'changed':
        if (direction === 'cad-wins') action = 'update-lsai';
        else if (direction === 'lsai-wins') action = 'update-cad';
        else action = 'skip';
        break;
      case 'conflict':
        action = 'skip'; // requires explicit user resolution
        break;
    }
    return { key: entry.key, action };
  });

  return { category: diff.category, direction, entries };
}

/** Counts of destructive/overriding actions — used by confirmation dialogs. */
export function summarizePlan(plan: SyncApplyPlan): {
  creates: number; updates: number; deletes: number; skips: number;
  deletesByCategory: Partial<Record<C3DSyncCategory, number>>;
} {
  let creates = 0, updates = 0, deletes = 0, skips = 0;
  const deletesByCategory: Partial<Record<C3DSyncCategory, number>> = {};
  for (const cat of plan.categories) {
    for (const e of cat.entries) {
      if (e.action === 'skip') skips++;
      else if (e.action.startsWith('create-')) creates++;
      else if (e.action.startsWith('update-')) updates++;
      else if (e.action.startsWith('delete-')) {
        deletes++;
        deletesByCategory[cat.category] = (deletesByCategory[cat.category] ?? 0) + 1;
      }
    }
  }
  return { creates, updates, deletes, skips, deletesByCategory };
}

/** Bulk-delete guard: more than this many deletes in one category requires typed confirmation. */
export const BULK_DELETE_THRESHOLD = 10;
