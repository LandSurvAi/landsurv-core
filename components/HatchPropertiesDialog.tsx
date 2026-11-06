import React, { useMemo } from 'react';
import type { CanvasHatch } from '../types.ts';
import {
  ALL_BUILT_IN_HATCHES,
  getHatchByName,
  type HatchDefinition,
} from '../services/hatchLibrary.ts';
import { HatchPreviewCanvas } from './CadManager/HatchManagerPanel.tsx';

export interface HatchPropertiesDialogProps {
  isOpen: boolean;
  hatch: CanvasHatch | null;
  onClose: () => void;
  onUpdate?: (id: string, patch: Partial<CanvasHatch>) => void;
  onDelete?: (id: string) => void;
  onOpenHatchManager?: () => void;
  availableLayers?: string[];
  layerColors?: Record<string, string>;
  customHatches?: HatchDefinition[];
}

const fieldClass =
  'w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5 font-mono text-cyan-200 outline-none focus:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-60';

const labelClass = 'block text-[10px] uppercase tracking-wider text-gray-400';

/**
 * Focused properties editor for a single placed hatch. Double-clicking a hatch
 * on the canvas opens this panel; edits are applied live through App's hatch
 * history slice.
 */
export const HatchPropertiesDialog: React.FC<HatchPropertiesDialogProps> = ({
  isOpen,
  hatch,
  onClose,
  onUpdate,
  onDelete,
  onOpenHatchManager,
  availableLayers = [],
  layerColors = {},
  customHatches = [],
}) => {
  const patternNames = useMemo(() => {
    const names = new Set<string>();
    for (const pattern of ALL_BUILT_IN_HATCHES) names.add(pattern.name);
    for (const pattern of customHatches) names.add(pattern.name);
    if (hatch?.patternName) names.add(hatch.patternName);
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [customHatches, hatch?.patternName]);

  if (!isOpen || !hatch) return null;

  const pattern =
    getHatchByName(hatch.patternName, customHatches) ?? ALL_BUILT_IN_HATCHES[0];
  const layers = Array.from(
    new Set([...(availableLayers ?? []), hatch.layer].filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
  const layerColor = layerColors[hatch.layer] || '#22d3ee';
  const color = hatch.color || layerColor;
  const disabled = !onUpdate;

  const update = (patch: Partial<CanvasHatch>) => {
    if (!onUpdate) return;
    onUpdate(hatch.id, patch);
  };

  return (
    <div
      role="dialog"
      aria-label="Hatch properties"
      data-testid="hatch-properties"
      onMouseDown={event => event.stopPropagation()}
      onMouseMove={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
      onWheel={event => event.stopPropagation()}
      className="absolute right-3 top-16 z-[80] max-h-[72vh] w-[340px] max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-xl border border-cyan-500/40 bg-gray-950/95 text-xs text-gray-200 shadow-2xl backdrop-blur-md"
    >
      <div className="flex items-center justify-between border-b border-cyan-500/20 px-3 py-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-cyan-400">
            Properties
          </div>
          <div className="font-semibold text-gray-100">Hatch</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
          title="Close hatch properties"
          aria-label="Close hatch properties"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="space-y-3 p-3">
        <div className="flex items-center gap-3 rounded-lg border border-gray-700/60 bg-gray-900/60 p-2">
          <HatchPreviewCanvas
            hatch={pattern}
            size={64}
            scale={hatch.scale}
            angleDeg={hatch.angleDeg}
            color={color}
            opacity={hatch.opacity}
          />
          <div className="min-w-0">
            <div className="truncate font-mono text-sm font-bold text-cyan-200" title={hatch.patternName}>
              {hatch.patternName}
            </div>
            <div className="mt-0.5 truncate text-[10px] text-gray-400" title={hatch.layer}>
              Layer {hatch.layer || '(none)'}
            </div>
            {hatch.areaSqFt !== undefined && (
              <div className="mt-1 font-mono text-[10px] text-emerald-300">
                {hatch.areaSqFt.toFixed(1)} sq ft
                <span className="ml-1 text-gray-500">
                  ({(hatch.areaSqFt / 43560).toFixed(3)} ac)
                </span>
              </div>
            )}
          </div>
        </div>

        <label className="block">
          <span className={labelClass}>Pattern</span>
          <select
            data-testid="hatch-property-pattern"
            value={hatch.patternName}
            disabled={disabled}
            onChange={event => update({ patternName: event.target.value })}
            className={`mt-1 ${fieldClass}`}
          >
            {patternNames.map(name => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className={labelClass}>Scale</span>
            <input
              data-testid="hatch-property-scale"
              type="number"
              min={0.05}
              step={0.1}
              value={hatch.scale}
              disabled={disabled}
              onChange={event => {
                const value = Number(event.target.value);
                if (Number.isFinite(value) && value > 0) {
                  update({ scale: Math.max(0.05, value) });
                }
              }}
              className={`mt-1 ${fieldClass}`}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Angle</span>
            <input
              data-testid="hatch-property-angle"
              type="number"
              step={1}
              value={hatch.angleDeg}
              disabled={disabled}
              onChange={event => {
                const value = Number(event.target.value);
                if (Number.isFinite(value)) update({ angleDeg: value });
              }}
              className={`mt-1 ${fieldClass}`}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className={labelClass}>Layer</span>
            <select
              data-testid="hatch-property-layer"
              value={hatch.layer}
              disabled={disabled}
              onChange={event => update({ layer: event.target.value })}
              className={`mt-1 ${fieldClass}`}
            >
              {layers.map(layer => (
                <option key={layer} value={layer}>
                  {layer}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Color</span>
            <div className="mt-1 flex items-center gap-1">
              <input
                data-testid="hatch-property-color"
                type="color"
                aria-label="Hatch color"
                value={color}
                disabled={disabled}
                onChange={event => update({ color: event.target.value })}
                className="h-8 w-10 cursor-pointer rounded border border-gray-600 bg-gray-800 p-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <button
                type="button"
                disabled={disabled}
                onClick={() => update({ color: undefined })}
                className={`rounded border px-1.5 py-1 text-[10px] ${
                  hatch.color
                    ? 'border-gray-600 text-gray-300 hover:bg-gray-800'
                    : 'border-cyan-500/60 bg-cyan-950/50 text-cyan-200'
                } disabled:cursor-not-allowed disabled:opacity-60`}
                title="Use the layer color"
              >
                ByLayer
              </button>
            </div>
            <span className="mt-0.5 block truncate text-[9px] text-gray-500">
              {hatch.color ? hatch.color : `ByLayer · ${layerColor}`}
            </span>
          </label>
        </div>

        <label className="block">
          <span className={labelClass}>Opacity</span>
          <div className="mt-1 flex items-center gap-2">
            <input
              data-testid="hatch-property-opacity"
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={hatch.opacity}
              disabled={disabled}
              onChange={event => update({ opacity: Number(event.target.value) })}
              className="min-w-0 flex-1 accent-cyan-400"
            />
            <span className="w-10 text-right font-mono text-[10px] text-cyan-200">
              {Math.round(hatch.opacity * 100)}%
            </span>
          </div>
        </label>

        <div className="flex flex-wrap items-center gap-2 border-t border-gray-700/60 pt-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => update({ hidden: !hatch.hidden })}
            className="rounded-md border border-gray-600 px-2 py-1 text-[11px] text-gray-200 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {hatch.hidden ? 'Show' : 'Hide'}
          </button>
          {onOpenHatchManager && (
            <button
              type="button"
              onClick={onOpenHatchManager}
              className="rounded-md border border-cyan-600/60 px-2 py-1 text-[11px] text-cyan-300 hover:bg-cyan-950/60"
            >
              Hatch Manager
            </button>
          )}
          <button
            type="button"
            disabled={!onDelete}
            onClick={() => onDelete?.(hatch.id)}
            className="ml-auto rounded-md border border-red-700/70 bg-red-950/60 px-2 py-1 text-[11px] font-medium text-red-300 hover:bg-red-900/60 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Delete
          </button>
        </div>

        <div className="flex items-center justify-between border-t border-gray-700/60 pt-2 text-[10px] text-gray-500">
          <span>Source: {hatch.sourceMode ?? 'manual'}</span>
          <span className="font-mono">{hatch.id.slice(0, 18)}</span>
        </div>
      </div>
    </div>
  );
};

export default HatchPropertiesDialog;
