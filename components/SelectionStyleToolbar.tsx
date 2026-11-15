import React, { useMemo } from 'react';
import type { CanvasHatch, SurveyLine } from '../types.ts';
import { createLayerValueLookup, getLayerValue } from '../utils/cadEntityStyle.ts';

const MIXED = '__mixed__';
const FALLBACK_LINETYPES = ['CONTINUOUS', 'DASHED', 'HIDDEN', 'CENTER', 'PHANTOM', 'DOT', 'FENCELINE1'];

const COLOR_OPTIONS = [
  { label: 'White', value: '#FFFFFF' },
  { label: 'Red', value: '#FF4D4D' },
  { label: 'Orange', value: '#F97316' },
  { label: 'Yellow', value: '#FACC15' },
  { label: 'Green', value: '#22C55E' },
  { label: 'Cyan', value: '#06B6D4' },
  { label: 'Blue', value: '#3B82F6' },
  { label: 'Magenta', value: '#D946EF' },
  { label: 'Gray', value: '#9CA3AF' },
];

const lineId = (line: SurveyLine): string => line.id || `${line.from}-${line.to}`;

const normalizeColor = (value?: string): string => {
  const trimmed = value?.trim() ?? '';
  return trimmed.toUpperCase() === 'BYLAYER' ? '' : trimmed.toUpperCase();
};

const normalizeLinetype = (value?: string): string => {
  const trimmed = value?.trim() ?? '';
  return trimmed.toUpperCase() === 'BYLAYER' ? '' : trimmed.toUpperCase();
};

const commonValue = <T,>(values: T[]): { value: T | undefined; mixed: boolean } => {
  if (values.length === 0) return { value: undefined, mixed: false };
  const first = values[0];
  return {
    value: values.every(value => value === first) ? first : undefined,
    mixed: values.some(value => value !== first),
  };
};

export interface SelectionStyleToolbarProps {
  selectedLines: SurveyLine[];
  selectedHatches?: CanvasHatch[];
  /** Total selected objects, including points/text/dimensions. Defaults to linework + hatches. */
  selectionCount?: number;
  availableLayers?: string[];
  availableLinetypes?: string[];
  layerColors?: Record<string, string>;
  layerLinetypes?: Record<string, string>;
  onUpdateLines: (ids: string[], changes: Partial<SurveyLine>) => void;
  onUpdateHatches?: (ids: string[], changes: Partial<CanvasHatch>) => void;
}

/**
 * Compact object-property strip shown while SELECT mode is active. It edits
 * the common properties of the current linework/hatch selection in place,
 * keeping the full Properties dialog available for less common controls.
 */
export const SelectionStyleToolbar: React.FC<SelectionStyleToolbarProps> = ({
  selectedLines,
  selectedHatches = [],
  selectionCount,
  availableLayers = [],
  availableLinetypes = [],
  layerColors = {},
  layerLinetypes = {},
  onUpdateLines,
  onUpdateHatches,
}) => {
  const objectCount = selectedLines.length + selectedHatches.length;
  const totalCount = selectionCount ?? objectCount;
  const lineIds = selectedLines.map(lineId);
  const hatchIds = selectedHatches.map(hatch => hatch.id);

  const layerCommon = commonValue([
    ...selectedLines.map(line => line.layer ?? ''),
    ...selectedHatches.map(hatch => hatch.layer ?? ''),
  ]);
  const colorCommon = commonValue([
    ...selectedLines.map(line => normalizeColor(line.color)),
    ...selectedHatches.map(hatch => normalizeColor(hatch.color)),
  ]);
  const linetypeCommon = commonValue(selectedLines.map(line => normalizeLinetype(line.lineType)));

  const layerValue = layerCommon.mixed ? MIXED : layerCommon.value ?? '';
  const colorValue = colorCommon.mixed ? MIXED : colorCommon.value ?? '';
  const linetypeValue = linetypeCommon.mixed ? MIXED : linetypeCommon.value ?? '';

  const layerColorLookup = useMemo(() => createLayerValueLookup(layerColors), [layerColors]);
  const layerLinetypeLookup = useMemo(() => createLayerValueLookup(layerLinetypes), [layerLinetypes]);
  const layerDefaultColor = layerValue === MIXED ? undefined : getLayerValue(layerColorLookup, layerValue);
  const layerDefaultLinetype = layerValue === MIXED ? undefined : getLayerValue(layerLinetypeLookup, layerValue);

  const layerOptions = useMemo(() => {
    const names = new Set(availableLayers.filter(Boolean));
    if (layerValue && layerValue !== MIXED) names.add(layerValue);
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [availableLayers, layerValue]);

  const colorOptions = useMemo(() => {
    const options = [...COLOR_OPTIONS];
    if (colorValue && colorValue !== MIXED && !options.some(option => option.value === colorValue)) {
      options.push({ label: colorValue, value: colorValue });
    }
    return options;
  }, [colorValue]);

  const linetypeOptions = useMemo(() => {
    const names = new Set(FALLBACK_LINETYPES);
    for (const name of availableLinetypes) {
      if (name?.trim()) names.add(name.trim().toUpperCase());
    }
    for (const name of Object.values(layerLinetypes)) {
      if (name?.trim()) names.add(name.trim().toUpperCase());
    }
    if (linetypeValue && linetypeValue !== MIXED) names.add(linetypeValue.toUpperCase());
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [availableLinetypes, layerLinetypes, linetypeValue]);

  const controlsDisabled = objectCount === 0;
  const linetypeDisabled = controlsDisabled || selectedLines.length === 0;
  const activeColor = colorCommon.mixed ? undefined : colorValue || layerDefaultColor || '#22d3ee';

  const stopCanvasEvent = (event: React.SyntheticEvent) => event.stopPropagation();

  const updateLayer = (nextLayer: string) => {
    if (nextLayer === MIXED) return;
    if (lineIds.length > 0) {
      onUpdateLines(lineIds, { layer: nextLayer || undefined });
    }
    if (hatchIds.length > 0) {
      onUpdateHatches?.(hatchIds, { layer: nextLayer });
    }
  };

  const updateColor = (nextColor: string) => {
    if (nextColor === MIXED) return;
    const value = nextColor || undefined;
    if (lineIds.length > 0) {
      onUpdateLines(lineIds, { color: value });
    }
    if (hatchIds.length > 0) {
      onUpdateHatches?.(hatchIds, { color: value });
    }
  };

  const updateLinetype = (nextLinetype: string) => {
    if (nextLinetype === MIXED || lineIds.length === 0) return;
    onUpdateLines(lineIds, { lineType: nextLinetype || undefined });
  };

  return (
    <div
      role="toolbar"
      aria-label="Selection style controls"
      data-testid="selection-style-toolbar"
      title="Layer, color, and linetype for the current selection"
      onMouseDown={stopCanvasEvent}
      onPointerDown={stopCanvasEvent}
      onDoubleClick={stopCanvasEvent}
      onWheel={stopCanvasEvent}
      className="absolute left-1/2 top-3 z-40 flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-cyan-500/35 bg-[#08101c]/95 px-2 py-1.5 text-[10px] text-slate-200 shadow-xl backdrop-blur-md"
    >
      <span className="shrink-0 font-semibold uppercase tracking-[0.16em] text-cyan-300/90">
        Selection
      </span>
      <span className="shrink-0 font-mono text-slate-400">
        {totalCount === 0 ? 'none' : `${totalCount} selected`}
      </span>

      <label className="flex min-w-0 items-center gap-1" title="Selected object layer">
        <span className="hidden text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:inline">
          Layer
        </span>
        <select
          aria-label="Selection layer"
          value={layerValue}
          disabled={controlsDisabled}
          onChange={event => updateLayer(event.target.value)}
          className="h-6 max-w-[9rem] rounded border border-white/15 bg-white/[0.05] px-1 font-mono text-[10px] text-cyan-100 outline-none focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {layerCommon.mixed && <option value={MIXED} disabled>(mixed)</option>}
          <option value="">(no layer)</option>
          {layerOptions.map(layer => (
            <option key={layer} value={layer}>{layer}</option>
          ))}
        </select>
      </label>

      <label className="flex min-w-0 items-center gap-1" title="Selected object color">
        <span className="hidden text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:inline">
          Color
        </span>
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/30"
          style={{
            background: colorCommon.mixed
              ? 'conic-gradient(#f87171, #fbbf24, #34d399, #22d3ee, #818cf8, #f87171)'
              : activeColor,
          }}
        />
        <select
          aria-label="Selection color"
          value={colorValue}
          disabled={controlsDisabled}
          onChange={event => updateColor(event.target.value)}
          className="h-6 max-w-[8rem] rounded border border-white/15 bg-white/[0.05] px-1 font-mono text-[10px] text-cyan-100 outline-none focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {colorCommon.mixed && <option value={MIXED} disabled>(mixed)</option>}
          <option value="">ByLayer{layerDefaultColor ? ` · ${layerDefaultColor}` : ''}</option>
          {colorOptions.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>

      <label className="flex min-w-0 items-center gap-1" title="Selected linework linetype. Hatch appearance follows its layer.">
        <span className="hidden text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:inline">
          Linetype
        </span>
        <select
          aria-label="Selection linetype"
          value={linetypeValue}
          disabled={linetypeDisabled}
          onChange={event => updateLinetype(event.target.value)}
          className="h-6 max-w-[8rem] rounded border border-white/15 bg-white/[0.05] px-1 font-mono text-[10px] text-cyan-100 outline-none focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {linetypeCommon.mixed && <option value={MIXED} disabled>(mixed)</option>}
          <option value="">{linetypeDisabled ? '—' : `ByLayer${layerDefaultLinetype ? ` · ${layerDefaultLinetype}` : ''}`}</option>
          {linetypeOptions.map(linetype => (
            <option key={linetype} value={linetype}>{linetype}</option>
          ))}
        </select>
      </label>
    </div>
  );
};

export default SelectionStyleToolbar;
