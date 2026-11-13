/**
 * legendStudio — the shared legend model for paperspace and the Legend A2UI.
 *
 * There is exactly one legend in a session. The paperspace legend block and the
 * A2UI Legend surface both read this store, so an edit in either place is the
 * same edit. Entries are bound to CAD layers:
 *
 *   legend edit  → `onApply` patch → App restyles that layer's hatches/lines
 *   drawing edit → `syncFromDrawing` → entry baseline refreshes
 *
 * A user edit is kept in `overrides`, so a later drawing sync cannot clobber a
 * deliberate change (and an explicit "reset" can drop the override).
 */

import type { CanvasHatch } from '../types.ts';

export type LegendEntryKind = 'layer' | 'hatch';

export type LegendPosition = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

export type LegendColumnCount = 1 | 2 | 3;

export interface LegendEntryStyle {
  label: string;
  description?: string;
  /** Swatch / layer color (CSS hex). */
  color: string;
  /** Optional CAD linetype for the sample line. */
  linetype?: string;
  /** Hatch pattern name for a filled swatch; empty/undefined means line only. */
  patternName?: string;
}

export interface LegendEntry extends LegendEntryStyle {
  id: string;
  /** CAD layer this entry describes and styles. */
  layer: string;
  kind: LegendEntryKind;
  /** Legend membership. Independent of the drawing view. */
  visible: boolean;
  /** Master drawing visibility. False hides the layer on the canvas and in the legend. */
  viewVisible?: boolean;
  /** Deliberate user edits. These win over `syncFromDrawing` baselines. */
  overrides: Partial<LegendEntryStyle>;
  /** Manually added entries survive when their layer is not on the drawing. */
  manual?: boolean;
}

export interface LegendSettings {
  title: string;
  position: LegendPosition;
  columns: LegendColumnCount;
  /** Sheet-space width in inches. */
  widthIn: number;
  fontScale: number;
  showBorder: boolean;
  showOnSheet: boolean;
  /** Explicit paper-space position in inches. Falls back to `position` when omitted. */
  xIn?: number;
  yIn?: number;
  /** Locked paper objects ignore move and scale gestures. */
  locked?: boolean;
  entries: LegendEntry[];
  selectedEntryId?: string | null;
}

/** One drawing layer as the canvas knows it, used to seed / refresh entries. */
export interface LegendDrawingLayer {
  name: string;
  color?: string;
  linetype?: string;
  patternName?: string;
  lineCount?: number;
  hatchCount?: number;
}

/** A style change that must be written back to the drawing. */
export interface LegendApplyPatch {
  layer: string;
  color?: string;
  patternName?: string;
  linetype?: string;
}

export const LEGEND_STORAGE_KEY = 'landsurv.legend.v1';

export const DEFAULT_LEGEND_SETTINGS: LegendSettings = {
  title: 'LEGEND',
  position: 'bottom-left',
  columns: 2,
  widthIn: 2.6,
  fontScale: 1,
  showBorder: true,
  showOnSheet: true,
  entries: [],
  selectedEntryId: null,
};

const MAX_ENTRIES = 40;

export interface LegendLayerGroup {
  key: string;
  label: string;
}

const LEGEND_GROUP_RULES: Array<{ pattern: RegExp; key: string; label: string }> = [
  { pattern: /^SOILS[-_\s]/i, key: 'soils', label: 'Soils' },
  { pattern: /^FEMA-(?:FLOOD|BFE)/i, key: 'flood', label: 'Flood Zones' },
  { pattern: /^GIS-STREAMS/i, key: 'streams', label: 'Streams Watercourses' },
  { pattern: /^GIS-COUNTY/i, key: 'county', label: 'County Boundaries' },
  { pattern: /^GIS-(?:PARCEL|CADASTRE)/i, key: 'parcels', label: 'Parcels' },
  { pattern: /^CONTOUR/i, key: 'contours', label: 'Contours' },
];

/** Category group for a drawing layer, or null for a standalone entry. */
export function legendGroupForLayer(layer: string): LegendLayerGroup | null {
  const name = String(layer ?? '');
  for (const rule of LEGEND_GROUP_RULES) {
    if (rule.pattern.test(name)) return { key: rule.key, label: rule.label };
  }
  return null;
}

export function humanizeLayerName(name: string): string {
  const cleaned = String(name ?? '')
    .replace(/^L[-_]/i, '')
    .replace(/^(?:GIS|SOILS|FLOOD|HATCH|STREET)[-_]/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  if (!cleaned) return String(name ?? 'Layer');
  return cleaned
    .toLowerCase()
    .replace(/\b[a-z]/g, char => char.toUpperCase());
}

/**
 * Apply a legend style patch to every placed hatch on its layer. This is the
 * drawing side of the link: the A2UI emits the patch, App applies it here, and
 * the canvas + paperspace hatch renderers pick up the new pattern/color.
 */
export function applyLegendPatchToHatches(
  hatches: CanvasHatch[],
  patch: LegendApplyPatch,
): CanvasHatch[] {
  let changed = false;
  const next = hatches.map(hatch => {
    if (hatch.layer !== patch.layer) return hatch;
    const update: Partial<CanvasHatch> = {};
    if (patch.color) update.color = patch.color;
    if (patch.patternName) update.patternName = patch.patternName;
    if (Object.keys(update).length === 0) return hatch;
    changed = true;
    return { ...hatch, ...update };
  });
  return changed ? next : hatches;
}

export function legendEntryResolvedStyle(entry: LegendEntry): LegendEntryStyle {
  const overrides = entry.overrides ?? {};
  return {
    label: overrides.label ?? entry.label,
    description: overrides.description ?? entry.description,
    color: overrides.color ?? entry.color,
    linetype: overrides.linetype ?? entry.linetype,
    patternName: overrides.patternName ?? entry.patternName,
  };
}

function slugLayer(name: string): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'layer';
}

function normalizeEntry(raw: unknown): LegendEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<LegendEntry>;
  if (!value.id || !value.layer) return null;
  const patternName = typeof value.patternName === 'string' ? value.patternName : undefined;
  return {
    id: String(value.id),
    layer: String(value.layer),
    label: String(value.label ?? humanizeLayerName(String(value.layer))),
    description: typeof value.description === 'string' ? value.description : undefined,
    color: String(value.color ?? '#9ca3af'),
    linetype: typeof value.linetype === 'string' ? value.linetype : undefined,
    patternName,
    kind: value.kind === 'hatch' || patternName ? 'hatch' : 'layer',
    visible: value.visible !== false,
    viewVisible: value.viewVisible !== false,
    overrides: value.overrides && typeof value.overrides === 'object' ? { ...value.overrides } : {},
    manual: value.manual === true,
  };
}

function normalizeSettings(raw: unknown): LegendSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_LEGEND_SETTINGS };
  const value = raw as Partial<LegendSettings>;
  const entries = Array.isArray(value.entries)
    ? value.entries.map(normalizeEntry).filter((entry): entry is LegendEntry => !!entry).slice(0, MAX_ENTRIES)
    : [];
  const columns = value.columns === 1 || value.columns === 3 ? value.columns : 2;
  const position: LegendPosition =
    value.position === 'bottom-right' || value.position === 'top-left' || value.position === 'top-right'
      ? value.position
      : 'bottom-left';
  return {
    title: typeof value.title === 'string' && value.title.trim() ? value.title : DEFAULT_LEGEND_SETTINGS.title,
    position,
    columns,
    widthIn: Number.isFinite(value.widthIn)
      ? Math.max(1.4, Math.min(6, Number(value.widthIn)))
      : DEFAULT_LEGEND_SETTINGS.widthIn,
    fontScale: Number.isFinite(value.fontScale)
      ? Math.max(0.7, Math.min(1.8, Number(value.fontScale)))
      : DEFAULT_LEGEND_SETTINGS.fontScale,
    showBorder: value.showBorder !== false,
    showOnSheet: value.showOnSheet !== false,
    xIn: Number.isFinite(value.xIn) ? Math.max(0, Number(value.xIn)) : undefined,
    yIn: Number.isFinite(value.yIn) ? Math.max(0, Number(value.yIn)) : undefined,
    locked: value.locked === true,
    entries,
    selectedEntryId: typeof value.selectedEntryId === 'string' ? value.selectedEntryId : null,
  };
}

function readSettings(): LegendSettings {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_LEGEND_SETTINGS };
    const raw = localStorage.getItem(LEGEND_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LEGEND_SETTINGS };
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_LEGEND_SETTINGS };
  }
}

class LegendStore {
  private settings: LegendSettings = readSettings();
  private listeners = new Set<() => void>();
  private applyListeners = new Set<(patch: LegendApplyPatch) => void>();

  /** Stable snapshot for useSyncExternalStore. */
  getSnapshot = (): LegendSettings => this.settings;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Listen for style changes that must be written back to the drawing. */
  onApply = (listener: (patch: LegendApplyPatch) => void): (() => void) => {
    this.applyListeners.add(listener);
    return () => {
      this.applyListeners.delete(listener);
    };
  };

  getEntry(id: string | null | undefined): LegendEntry | undefined {
    if (!id) return undefined;
    return this.settings.entries.find(entry => entry.id === id);
  }

  update(patch: Partial<Omit<LegendSettings, 'entries'>>): void {
    const next = normalizeSettings({ ...this.settings, ...patch, entries: this.settings.entries });
    if (JSON.stringify(next) === JSON.stringify(this.settings)) return;
    this.settings = next;
    this.commit();
  }

  select(id: string | null): void {
    if (this.settings.selectedEntryId === id) return;
    this.settings = { ...this.settings, selectedEntryId: id };
    this.emit();
  }

  updateEntry(
    id: string,
    patch: Partial<LegendEntryStyle> & { visible?: boolean },
  ): void {
    const applied: LegendApplyPatch[] = [];
    let changed = false;
    const entries = this.settings.entries.map(entry => {
      if (entry.id !== id) return entry;
      const stylePatch: Partial<LegendEntryStyle> = {};
      for (const key of ['label', 'description', 'color', 'linetype', 'patternName'] as const) {
        if (patch[key] !== undefined) stylePatch[key] = patch[key];
      }
      const overrides = { ...(entry.overrides ?? {}), ...stylePatch };
      const visible = patch.visible === undefined ? entry.visible : patch.visible;
      if (Object.keys(stylePatch).length === 0 && visible === entry.visible) return entry;
      changed = true;
      const next: LegendEntry = {
        ...entry,
        overrides,
        visible,    kind: (overrides.patternName ?? entry.patternName) ? 'hatch' : entry.kind,
  };
      const resolved = legendEntryResolvedStyle(next);
      if (stylePatch.color || stylePatch.patternName || stylePatch.linetype) {
        applied.push({
          layer: entry.layer,
          color: resolved.color,
          patternName: resolved.patternName ?? '',
          linetype: resolved.linetype,
        });
      }
      return next;
    });
    if (!changed) return;
    this.settings = { ...this.settings, entries };
    this.commit();
    for (const patch of applied) this.emitApply(patch);
  }

  /**
   * Master view visibility. Hiding a layer removes it from the drawing and the
   * legend; showing it restores both. Called by the layer and legend controls.
   */
  setLayersViewVisibility(layers: string[], visible: boolean): void {
    const layerSet = new Set(layers.filter(Boolean));
    if (layerSet.size === 0) return;
    let changed = false;
    const entries = this.settings.entries.map(entry => {
      if (!layerSet.has(entry.layer)) return entry;
      const viewVisible = entry.viewVisible !== false;
      if (viewVisible === visible && (entry.visible !== false) === visible) return entry;
      changed = true;
      return { ...entry, viewVisible: visible, visible };
    });
    if (!changed) return;
    this.settings = { ...this.settings, entries };
    this.commit();
  }

  /** Legend-only visibility. The drawing's view state is untouched. */
  setEntriesVisible(ids: string[], visible: boolean): void {
    const idSet = new Set(ids.filter(Boolean));
    if (idSet.size === 0) return;
    let changed = false;
    const entries = this.settings.entries.map(entry => {
      if (!idSet.has(entry.id) || (entry.visible !== false) === visible) return entry;
      changed = true;
      return { ...entry, visible };
    });
    if (!changed) return;
    this.settings = { ...this.settings, entries };
    this.commit();
  }

  addEntry(layer: string, defaults?: Partial<LegendEntryStyle>): string | null {
    const name = String(layer ?? '').trim();
    if (!name || this.settings.entries.length >= MAX_ENTRIES) return null;
    const existing = this.settings.entries.find(entry => entry.layer === name);
    if (existing) {
      this.select(existing.id);
      return existing.id;
    }
    const base = slugLayer(name);
    let id = `legend-${base}`;
    let suffix = 2;
    while (this.settings.entries.some(entry => entry.id === id)) {
      id = `legend-${base}-${suffix++}`;
    }
    const entry: LegendEntry = {
      id,
      layer: name,
      label: defaults?.label ?? humanizeLayerName(name),
      description: defaults?.description,
      color: defaults?.color ?? '#9ca3af',
      linetype: defaults?.linetype,
      patternName: defaults?.patternName,
      kind: defaults?.patternName ? 'hatch' : 'layer',
      visible: true,
      viewVisible: true,
      overrides: {},
      manual: true,
    };
    this.settings = {
      ...this.settings,
      entries: [...this.settings.entries, entry],
      selectedEntryId: id,
    };
    this.commit();
    return id;
  }

  removeEntry(id: string): void {
    const entries = this.settings.entries.filter(entry => entry.id !== id);
    if (entries.length === this.settings.entries.length) return;
    this.settings = {
      ...this.settings,
      entries,
      selectedEntryId: this.settings.selectedEntryId === id ? null : this.settings.selectedEntryId,
    };
    this.commit();
  }

  /** Bulk visibility for the toolbar quick list. */
  setAllVisible(visible: boolean): void {
    let changed = false;
    const entries = this.settings.entries.map(entry => {
      if ((entry.visible !== false) === visible) return entry;
      changed = true;
      return { ...entry, visible };
    });
    if (!changed) return;
    this.settings = { ...this.settings, entries };
    this.commit();
  }

  moveEntry(id: string, direction: -1 | 1): void {
    const entries = [...this.settings.entries];
    const index = entries.findIndex(entry => entry.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= entries.length) return;
    [entries[index], entries[target]] = [entries[target], entries[index]];
    this.settings = { ...this.settings, entries };
    this.commit();
  }

  /**
   * Refresh entry baselines from the drawing. Overrides are never touched, so a
   * legend edit and a later canvas edit cannot silently overwrite each other.
   * Auto entries for layers that left the drawing are dropped; manual/overridden
   * entries stay so a deliberate legend is not destroyed by a session switch.
   */
  syncFromDrawing(layers: LegendDrawingLayer[]): void {
    const incoming = layers.filter(layer => layer?.name);
    const liveLayers = new Set(incoming.map(layer => layer.name));
    const entries = this.settings.entries
      .filter(entry => liveLayers.has(entry.layer) || entry.manual || Object.keys(entry.overrides ?? {}).length > 0)
      .map(entry => ({ ...entry }));
    let changed = entries.length !== this.settings.entries.length;

    for (const layer of incoming) {
      const patternName = layer.patternName;
      const existing = entries.find(entry => entry.layer === layer.name);
      if (!existing) {
        if (entries.length >= MAX_ENTRIES) continue;
        const base = slugLayer(layer.name);
        let id = `legend-${base}`;
        let suffix = 2;
        while (entries.some(entry => entry.id === id)) id = `legend-${base}-${suffix++}`;
        entries.push({
          id,
          layer: layer.name,
          label: humanizeLayerName(layer.name),
          color: layer.color ?? '#9ca3af',
          linetype: layer.linetype,
          patternName,
          kind: patternName ? 'hatch' : 'layer',
          visible: true,
          viewVisible: true,
          overrides: {},
        });
        changed = true;
        continue;
      }

      const nextColor = layer.color && layer.color !== existing.color ? layer.color : existing.color;
      const nextLinetype = layer.linetype ?? existing.linetype;
      const nextPattern = layer.patternName ?? existing.patternName;
      const nextKind = nextPattern ? 'hatch' : 'layer';
      if (
        nextColor !== existing.color ||
        nextLinetype !== existing.linetype ||
        nextPattern !== existing.patternName ||
        nextKind !== existing.kind
      ) {
        existing.color = nextColor;
        existing.linetype = nextLinetype;
        existing.patternName = nextPattern;
        existing.kind = nextKind;
        changed = true;
      }
    }

    if (!changed) return;
    const selectedEntryId = entries.some(entry => entry.id === this.settings.selectedEntryId)
      ? this.settings.selectedEntryId
      : null;
    this.settings = { ...this.settings, entries, selectedEntryId };
    this.commit();
  }

  reset(): void {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(LEGEND_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    this.settings = { ...DEFAULT_LEGEND_SETTINGS, entries: [] };
    this.emit();
  }

  private commit(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LEGEND_STORAGE_KEY, JSON.stringify(this.settings));
      }
    } catch {
      /* quota / private mode — the session legend still works */
    }
    this.emit();
  }

  private emit(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch {
        /* a broken surface must never take the app down */
      }
    }
  }

  private emitApply(patch: LegendApplyPatch): void {
    for (const listener of [...this.applyListeners]) {
      try {
        listener(patch);
      } catch {
        /* ignore */
      }
    }
  }
}

export const legendStore = new LegendStore();
