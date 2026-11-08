import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { Check, ChevronDown, ChevronRight, Eye, EyeOff, List, ListX, Search } from 'lucide-react';
import {
  legendStore,
  legendEntryResolvedStyle,
  legendGroupForLayer,
  type LegendDrawingLayer,
  type LegendEntry,
} from '../services/legendStudio.ts';
import { TOOLBAR_DROPDOWN_PANEL_CLASS, useToolbarDropdown } from './toolbarDropdown.ts';
import { LegendQuickActions } from './LegendQuickActions.tsx';

export interface LegendPickerProps {
  /** Layers currently on the drawing; also backs the Add all drawn action. */
  availableLayers?: LegendDrawingLayer[];
  onOpenEditor: () => void;
  onOpenSheetView?: () => void;
  /** Master view toggle for an entry or group: hiding also removes it from the legend. */
  onSetLayersViewVisible?: (layerNames: string[], visible: boolean) => void;
}

/** Canvas-toolbar legend strip: the quick list behind the paperspace legend. */
export const LegendPicker: React.FC<LegendPickerProps> = ({
  availableLayers = [],
  onOpenEditor,
  onOpenSheetView,
  onSetLayersViewVisible,
}) => {
  const settings = useSyncExternalStore(
    legendStore.subscribe,
    legendStore.getSnapshot,
    legendStore.getSnapshot,
  );
  const [search, setSearch] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const { isOpen, open, close, containerRef, triggerRef } = useToolbarDropdown(() => setSearch(''));

  const filteredEntries = useMemo(() => {
    const needle = search.trim().toUpperCase();
    if (!needle) return settings.entries;
    return settings.entries.filter(entry => {
      const label = legendEntryResolvedStyle(entry).label;
      return (
        label.toUpperCase().includes(needle) || entry.layer.toUpperCase().includes(needle)
      );
    });
  }, [settings.entries, search]);

  const entryGroups = useMemo(() => {
    const loose: LegendEntry[] = [];
    const groups: Array<{ key: string; label: string; entries: LegendEntry[] }> = [];
    const byKey = new Map<string, (typeof groups)[number]>();
    for (const entry of filteredEntries) {
      const group = legendGroupForLayer(entry.layer);
      if (!group) {
        loose.push(entry);
        continue;
      }
      let bucket = byKey.get(group.key);
      if (!bucket) {
        bucket = { key: group.key, label: group.label, entries: [] };
        byKey.set(group.key, bucket);
        groups.push(bucket);
      }
      bucket.entries.push(entry);
    }
    return { loose, groups };
  }, [filteredEntries]);

  const searching = search.trim().length > 0;

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderEntry = (entry: LegendEntry, inGroup = false) => {
    const resolved = legendEntryResolvedStyle(entry);
    const selected = settings.selectedEntryId === entry.id;
    const legendVisible = entry.visible !== false;
    const viewVisible = entry.viewVisible !== false;
    const labelTone = !viewVisible
      ? 'text-gray-600 line-through'
      : !legendVisible
        ? 'text-gray-500'
        : selected
          ? 'text-teal-200'
          : 'text-gray-200';
    return (
      <div
        key={entry.id}
        className={`flex items-center ${selected ? 'bg-teal-500/10' : ''}`}
      >
        <button
          type="button"
          onClick={() => legendStore.select(entry.id)}
          onDoubleClick={onOpenEditor}
          className={`flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-1 text-left hover:bg-white/[0.04] ${inGroup ? 'pl-6' : 'pl-3'}`}
          title={`${resolved.label} — ${entry.layer} (double-click to edit)`}
        >
          <span className="flex h-3 w-3 shrink-0 items-center justify-center">
            {selected ? <Check className="h-3 w-3 text-teal-300" /> : null}
          </span>
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full border border-white/25 ${legendVisible && viewVisible ? '' : 'opacity-30'}`}
            style={{ backgroundColor: resolved.color }}
          />
          <span className={`min-w-0 flex-1 truncate text-[11px] ${labelTone}`}>
            {resolved.label}
          </span>
          <span
            className="w-14 shrink-0 truncate text-right font-mono text-[9px] text-gray-500"
            title={resolved.patternName || resolved.linetype || 'Line sample'}
          >
            {resolved.patternName || (resolved.linetype ? resolved.linetype.toUpperCase() : 'LINE')}
          </span>
        </button>
        {onSetLayersViewVisible && (
          <button
            type="button"
            onClick={() => onSetLayersViewVisible([entry.layer], !viewVisible)}
            className="shrink-0 rounded p-1.5 text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-gray-200"
            title={viewVisible ? `Hide ${resolved.label} from view (also hides it in the legend)` : `Show ${resolved.label} in view (also restores it in the legend)`}
            aria-label={`${viewVisible ? 'Hide' : 'Show'} ${resolved.label} ${viewVisible ? 'from' : 'in'} view`}
            aria-pressed={viewVisible}
          >
            {viewVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
        )}
        <button
          type="button"
          onClick={() => legendStore.updateEntry(entry.id, { visible: !legendVisible })}
          className="mr-1.5 shrink-0 rounded p-1.5 text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-gray-200"
          title={legendVisible ? `Hide ${resolved.label} from the legend (view stays on)` : `Show ${resolved.label} in the legend`}
          aria-label={`${legendVisible ? 'Hide' : 'Show'} ${resolved.label} in legend`}
          aria-pressed={legendVisible}
        >
          {legendVisible ? <List className="h-3.5 w-3.5" /> : <ListX className="h-3.5 w-3.5" />}
        </button>
      </div>
    );
  };

  return (
    <div ref={containerRef} className="relative flex self-stretch items-center">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (isOpen ? close() : open())}
        className={`relative p-2 rounded-full transition-colors text-xs font-medium ${
          isOpen
            ? 'bg-teal-600 hover:bg-teal-700 text-white'
            : 'hover:bg-gray-700 text-gray-300'
        }`}
        title="Legend — quick list of the linked paperspace legend"
        aria-label="Legend"
        aria-haspopup="true"
        aria-expanded={isOpen}
        data-testid="legend-picker-trigger"
      >
        Legend
        {settings.showOnSheet && settings.entries.length > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-teal-400"
          />
        )}
      </button>

      {isOpen && (
        <div
          className={TOOLBAR_DROPDOWN_PANEL_CLASS}
          data-testid="legend-picker-panel"
          aria-label="Legend"
        >
          <div className="flex items-center gap-2 border-b border-white/[0.05] px-2.5 py-2 light-theme:border-gray-200">
            <span aria-hidden="true" className="text-teal-300">
              ▤
            </span>
            <span className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase tracking-[0.14em] text-gray-300">
              {settings.title || 'Legend'}
            </span>
            <span className="shrink-0 rounded-full border border-white/10 px-1.5 text-[9px] font-semibold text-gray-400">
              {settings.entries.length}
            </span>
            <span className="shrink-0 font-mono text-[9px] uppercase tracking-wide text-teal-300/80">
              {settings.showOnSheet ? 'On sheet' : 'Off sheet'}
            </span>
          </div>

          <div className="border-b border-white/[0.05] px-2.5 py-1.5 light-theme:border-gray-200">
            <LegendQuickActions
              availableLayers={availableLayers}
              onOpenSheetView={onOpenSheetView}
            />
          </div>

          <div className="flex items-center gap-1.5 border-b border-white/[0.05] px-2.5 py-1.5 light-theme:border-gray-200">
            <Search className="h-3.5 w-3.5 shrink-0 text-gray-500" />
            <input
              autoFocus
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Find a legend entry…"
              className="min-w-0 flex-1 bg-transparent text-[11px] text-gray-200 placeholder:text-gray-600 focus:outline-none"
              aria-label="Search legend entries"
            />
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {entryGroups.loose.map(entry => renderEntry(entry))}
            {entryGroups.groups.map(group => {
              const collapsed = collapsedGroups.has(group.key);
              const allViewVisible = group.entries.every(entry => entry.viewVisible !== false);
              const allLegendVisible = group.entries.every(entry => entry.visible !== false);
              return (
                <div key={group.key} className="border-t border-white/[0.04] first:border-t-0">
                  <div className="flex items-center bg-white/[0.02]">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.key)}
                      className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pl-2 pr-1 text-left hover:bg-white/[0.04]"
                      aria-expanded={!collapsed}
                      aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${group.label} legend group`}
                      title={collapsed ? `Expand ${group.label}` : `Collapse ${group.label}`}
                    >
                      {collapsed ? (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase tracking-[0.1em] text-gray-300">
                        {group.label}
                      </span>
                      <span className="shrink-0 rounded-full border border-white/10 px-1 text-[9px] font-semibold text-gray-500">
                        {group.entries.length}
                      </span>
                    </button>
                    {onSetLayersViewVisible && (
                      <button
                        type="button"
                        onClick={() => onSetLayersViewVisible(
                          group.entries.map(entry => entry.layer),
                          !allViewVisible,
                        )}
                        className="shrink-0 rounded p-1.5 text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-gray-200"
                        title={allViewVisible ? `Hide ${group.label} from view` : `Show ${group.label} in view`}
                        aria-label={`${allViewVisible ? 'Hide' : 'Show'} ${group.label} ${allViewVisible ? 'from' : 'in'} view`}
                        aria-pressed={allViewVisible}
                      >
                        {allViewVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => legendStore.setEntriesVisible(
                        group.entries.map(entry => entry.id),
                        !allLegendVisible,
                      )}
                      className="mr-1.5 shrink-0 rounded p-1.5 text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-gray-200"
                      title={allLegendVisible ? `Hide ${group.label} from the legend (view stays on)` : `Show ${group.label} in the legend`}
                      aria-label={`${allLegendVisible ? 'Hide' : 'Show'} ${group.label} from legend`}
                      aria-pressed={allLegendVisible}
                    >
                      {allLegendVisible ? <List className="h-3.5 w-3.5" /> : <ListX className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  {(!collapsed || searching) && group.entries.map(entry => renderEntry(entry, true))}
                </div>
              );
            })}
            {filteredEntries.length === 0 && (
              <p className="px-3 py-2 text-[11px] italic text-gray-500">
                {settings.entries.length === 0
                  ? 'No legend entries yet. Draw on the canvas or use Add all drawn.'
                  : `No entries match “${search}”.`}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenEditor}
            className="flex w-full items-center justify-between gap-2 border-t border-white/[0.07] px-3 py-2 text-left text-[11px] font-semibold text-teal-200 transition-colors hover:bg-white/[0.04] hover:text-teal-100 light-theme:border-gray-200 light-theme:text-teal-700 light-theme:hover:bg-gray-50"
          >
            <span>Open Legend editor</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default LegendPicker;
