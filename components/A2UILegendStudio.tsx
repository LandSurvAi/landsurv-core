import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import {
  legendStore,
  legendEntryResolvedStyle,
  type LegendColumnCount,
  type LegendDrawingLayer,
  type LegendPosition,
} from '../services/legendStudio.ts';
import { ALL_BUILT_IN_HATCHES } from '../services/hatchLibrary.ts';
import { openA2UISurface } from '../services/a2uiSurfaces.ts';
import { LegendQuickActions } from './LegendQuickActions.tsx';

export interface A2UILegendStudioProps {
  /** Layers currently on the drawing; used to add entries and to re-sync. */
  availableLayers?: LegendDrawingLayer[];
  onOpenSheetView?: () => void;
  /** Master view toggle: hiding a layer also removes its legend entries. */
  onSetLayersViewVisible?: (layerNames: string[], visible: boolean) => void;
}

const POSITIONS: Array<{ id: LegendPosition; label: string }> = [
  { id: 'top-left', label: 'Top left' },
  { id: 'top-right', label: 'Top right' },
  { id: 'bottom-left', label: 'Bottom left' },
  { id: 'bottom-right', label: 'Bottom right' },
];

const COLUMNS: LegendColumnCount[] = [1, 2, 3];

function toColorInput(color: string | undefined): string {
  const value = String(color ?? '').trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  return '#9ca3af';
}

/**
 * Legend A2UI surface.
 *
 * This is one side of the linked legend: entries are bound to drawing layers,
 * so a label/color/hatch edit is emitted back to the drawing (hatches + layer
 * properties), while `syncFromDrawing` refreshes the baselines in the other
 * direction. Overrides keep deliberate edits from being overwritten.
 */
export const A2UILegendStudio: React.FC<A2UILegendStudioProps> = ({
  availableLayers = [],
  onOpenSheetView,
  onSetLayersViewVisible,
}) => {
  const settings = useSyncExternalStore(
    legendStore.subscribe,
    legendStore.getSnapshot,
    legendStore.getSnapshot,
  );
  const [newLayer, setNewLayer] = useState('');

  const patternNames = useMemo(() => {
    const names = new Set<string>();
    for (const hatch of ALL_BUILT_IN_HATCHES) {
      if (hatch?.name) names.add(hatch.name);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, []);

  const knownLayerNames = useMemo(
    () => availableLayers.map(layer => layer.name).filter(Boolean),
    [availableLayers],
  );

  const addLayer = () => {
    const name = newLayer.trim();
    if (!name) return;
    const defaults = availableLayers.find(layer => layer.name === name);
    const id = legendStore.addEntry(name, defaults
      ? {
        color: defaults.color,
        linetype: defaults.linetype,
        patternName: defaults.patternName,
      }
      : undefined);
    if (id) setNewLayer('');
  };

  return (
    <div className="space-y-4 p-3 text-sm text-slate-200" data-testid="legend-studio">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-base text-teal-300" aria-hidden="true">▤</span>
          <h2 className="text-sm font-bold text-white">Legend</h2>
          <span className="rounded-full border border-teal-400/30 bg-teal-400/10 px-1.5 text-[9px] font-bold uppercase tracking-wide text-teal-200">
            Linked
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-400">
          One legend drives the drawing and the paperspace sheet. Color, hatch, and linetype
          edits restyle that layer&apos;s entities; canvas edits flow back here unless you
          override them.
        </p>
      </header>

      <LegendQuickActions availableLayers={availableLayers} />

      <section className="grid grid-cols-1 gap-3 rounded-xl border border-white/10 bg-black/20 p-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Title</span>
          <input
            aria-label="Legend title"
            value={settings.title}
            onChange={event => legendStore.update({ title: event.target.value })}
            className="w-full rounded-md border border-white/10 bg-slate-950/70 px-2 py-1.5 text-xs text-white outline-none focus:border-teal-400"
          />
        </label>
        <label className="flex items-center gap-2 self-end pb-1 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={settings.showOnSheet}
            onChange={event => legendStore.update({ showOnSheet: event.target.checked })}
            className="h-3.5 w-3.5 accent-teal-500"
          />
          Show on the paperspace sheet
        </label>
      </section>

      <section className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="space-y-1.5">
          <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Placement</span>
          <div className="grid grid-cols-2 gap-1.5">
            {POSITIONS.map(position => (
              <button
                key={position.id}
                type="button"
                onClick={() => legendStore.update({ position: position.id })}
                className={`rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                  settings.position === position.id
                    ? 'border-teal-400 bg-teal-500/20 text-teal-100'
                    : 'border-white/10 bg-slate-950/50 text-slate-400 hover:border-teal-500/50 hover:text-teal-200'
                }`}
              >
                {position.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Columns</span>
            <div className="flex gap-1.5">
              {COLUMNS.map(columns => (
                <button
                  key={columns}
                  type="button"
                  aria-label={`${columns} column${columns === 1 ? '' : 's'}`}
                  onClick={() => legendStore.update({ columns })}
                  className={`flex-1 rounded-md border py-1 text-xs font-semibold ${
                    settings.columns === columns
                      ? 'border-teal-400 bg-teal-500/20 text-teal-100'
                      : 'border-white/10 bg-slate-950/50 text-slate-400 hover:text-teal-200'
                  }`}
                >
                  {columns}
                </button>
              ))}
            </div>
          </div>
          <label className="space-y-1">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Width (in)</span>
            <input
              aria-label="Legend width in inches"
              type="number"
              min={1.4}
              max={6}
              step={0.1}
              value={settings.widthIn}
              onChange={event => legendStore.update({ widthIn: parseFloat(event.target.value) || 2.6 })}
              className="w-full rounded-md border border-white/10 bg-slate-950/70 px-2 py-1.5 text-xs text-white outline-none focus:border-teal-400"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 items-end gap-3">
          <label className="space-y-1">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Text scale · {settings.fontScale.toFixed(2)}×
            </span>
            <input
              aria-label="Legend text scale"
              type="range"
              min={0.7}
              max={1.8}
              step={0.05}
              value={settings.fontScale}
              onChange={event => legendStore.update({ fontScale: parseFloat(event.target.value) || 1 })}
              className="w-full accent-teal-500"
            />
          </label>
          <label className="flex items-center gap-2 pb-1 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={settings.showBorder}
              onChange={event => legendStore.update({ showBorder: event.target.checked })}
              className="h-3.5 w-3.5 accent-teal-500"
            />
            Box border
          </label>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Entries ({settings.entries.length})
          </span>
          <button
            type="button"
            onClick={() => legendStore.syncFromDrawing(availableLayers)}
            className="rounded-md border border-teal-500/40 bg-teal-600/20 px-2 py-1 text-[10px] font-bold text-teal-200 hover:bg-teal-600/40"
          >
            Sync from drawing
          </button>
        </div>

        {settings.entries.length === 0 ? (
          <p className="rounded-md border border-dashed border-white/15 p-3 text-center text-[11px] text-slate-500">
            Draw linework or a hatch, or add a layer below. Entries appear here automatically.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {settings.entries.map((entry, index) => {
              const resolved = legendEntryResolvedStyle(entry);
              const selected = settings.selectedEntryId === entry.id;
              const viewVisible = entry.viewVisible !== false;
              return (
                <li
                  key={entry.id}
                  data-testid={`legend-entry-${entry.id}`}
                  onClick={() => legendStore.select(entry.id)}
                  className={`rounded-lg border p-2 ${
                    selected
                      ? 'border-teal-400/70 bg-teal-500/10'
                      : 'border-white/10 bg-slate-950/40 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {onSetLayersViewVisible && (
                      <button
                        type="button"
                        aria-label={`${viewVisible ? 'Hide' : 'Show'} ${resolved.label} ${viewVisible ? 'from' : 'in'} view`}
                        title={viewVisible ? 'Hide from view (also hides it in the legend)' : 'Show in view (also restores it in the legend)'}
                        onClick={event => {
                          event.stopPropagation();
                          onSetLayersViewVisible([entry.layer], !viewVisible);
                        }}
                        className={`mt-0.5 rounded border px-1 py-0.5 ${
                          viewVisible
                            ? 'border-white/10 text-slate-400 hover:text-teal-200'
                            : 'border-white/10 text-slate-600'
                        }`}
                      >
                        {viewVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`${entry.visible === false ? 'Show' : 'Hide'} ${resolved.label}`}
                      title={entry.visible === false ? 'Show in legend' : 'Hide from legend'}
                      onClick={event => {
                        event.stopPropagation();
                        legendStore.updateEntry(entry.id, { visible: entry.visible === false });
                      }}
                      className={`mt-0.5 rounded border px-1 py-0.5 text-[10px] ${
                        entry.visible === false
                          ? 'border-white/10 text-slate-500'
                          : 'border-teal-500/40 text-teal-200'
                      }`}
                    >
                      {entry.visible === false ? '○' : '●'}
                    </button>

                    <div className="min-w-0 flex-1 space-y-1">
                      <input
                        aria-label={`Label for ${entry.layer}`}
                        value={resolved.label}
                        onChange={event => legendStore.updateEntry(entry.id, { label: event.target.value })}
                        className="w-full rounded border border-white/10 bg-slate-950/70 px-2 py-1 text-xs text-white outline-none focus:border-teal-400"
                      />
                      <div className="flex items-center gap-2">
                        <span className="truncate font-mono text-[9.5px] text-slate-500" title={entry.layer}>
                          {entry.layer}
                        </span>
                        {resolved.patternName && (
                          <span className="rounded border border-white/10 px-1 font-mono text-[9px] text-slate-400">
                            {resolved.patternName}
                          </span>
                        )}
                      </div>
                    </div>

                    <input
                      aria-label={`Color for ${entry.layer}`}
                      type="color"
                      value={toColorInput(resolved.color)}
                      onChange={event => legendStore.updateEntry(entry.id, { color: event.target.value })}
                      className="mt-0.5 h-7 w-8 cursor-pointer rounded border border-white/15 bg-transparent p-0"
                    />
                  </div>

                  <div className="mt-1.5 flex items-center gap-1.5">
                    <select
                      aria-label={`Hatch pattern for ${entry.layer}`}
                      value={resolved.patternName ?? ''}
                      onChange={event => legendStore.updateEntry(entry.id, {
                        patternName: event.target.value,
                      })}
                      className="min-w-0 flex-1 rounded border border-white/10 bg-slate-950/70 px-1.5 py-1 text-[10px] text-slate-200 outline-none focus:border-teal-400"
                    >
                      <option value="">Line sample (no hatch)</option>
                      {patternNames.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      aria-label={`Move ${resolved.label} up`}
                      onClick={event => {
                        event.stopPropagation();
                        legendStore.moveEntry(entry.id, -1);
                      }}
                      disabled={index === 0}
                      className="rounded border border-white/10 px-1.5 py-1 text-[10px] text-slate-300 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${resolved.label} down`}
                      onClick={event => {
                        event.stopPropagation();
                        legendStore.moveEntry(entry.id, 1);
                      }}
                      disabled={index === settings.entries.length - 1}
                      className="rounded border border-white/10 px-1.5 py-1 text-[10px] text-slate-300 disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${resolved.label}`}
                      onClick={event => {
                        event.stopPropagation();
                        legendStore.removeEntry(entry.id);
                      }}
                      className="rounded border border-rose-500/30 px-1.5 py-1 text-[10px] text-rose-300 hover:bg-rose-500/20"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center gap-1.5">
          <input
            aria-label="Layer to add to the legend"
            list="legend-layer-options"
            value={newLayer}
            onChange={event => setNewLayer(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') addLayer();
            }}
            placeholder="Add a CAD layer…"
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-slate-950/70 px-2 py-1.5 text-xs text-white outline-none focus:border-teal-400"
          />
          <datalist id="legend-layer-options">
            {knownLayerNames.map(name => <option key={name} value={name} />)}
          </datalist>
          <button
            type="button"
            onClick={addLayer}
            disabled={!newLayer.trim()}
            className="rounded-md border border-teal-500/40 bg-teal-600/20 px-2.5 py-1.5 text-[11px] font-bold text-teal-200 hover:bg-teal-600/40 disabled:opacity-40"
          >
            Add layer
          </button>
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => legendStore.reset()}
            className="rounded-md border border-white/10 px-2 py-1 text-[10px] font-semibold text-slate-400 hover:text-rose-300"
          >
            Reset legend
          </button>
          {onOpenSheetView && (
            <button
              type="button"
              onClick={onOpenSheetView}
              className="rounded-md border border-amber-500/40 bg-amber-600/20 px-2 py-1 text-[10px] font-bold text-amber-200 hover:bg-amber-600/40"
            >
              Open Sheet View
            </button>
          )}
        </div>
        <span className="text-[9.5px] uppercase tracking-wide text-slate-500">
          Drafting · shared legend model
        </span>
      </footer>
    </div>
  );
};

/** Open (or focus) the Legend A2UI from any component. */
export function openLegendStudioSurface(
  availableLayers: LegendDrawingLayer[] = [],
  options?: { onSetLayersViewVisible?: (layerNames: string[], visible: boolean) => void },
): string {
  return openA2UISurface({
    key: 'legend-studio',
    definitionId: 'workspace-legend',
    title: 'Legend',
    subtitle: 'Edits write through to the drawing and the paperspace sheet',
    category: 'workspace',
    accent: 'cyan',
    size: 'wide',
    source: 'legend-studio',
    content: (
      <A2UILegendStudio
        availableLayers={availableLayers}
        onSetLayersViewVisible={options?.onSetLayersViewVisible}
      />
    ),
  });
}

export default A2UILegendStudio;
