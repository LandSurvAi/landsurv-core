import React, { useMemo } from 'react';
import type { AreaHatchSettings } from '../types.ts';
import {
  ALL_BUILT_IN_HATCHES,
  getHatchByName,
  getHatchForFemaZone,
  type HatchDefinition,
} from '../services/hatchLibrary.ts';
import { DEFAULT_FLOOD_HATCH, DEFAULT_SOIL_HATCH } from '../services/areaHatchService.ts';
import { HatchPreviewCanvas } from './CadManager/HatchManagerPanel.tsx';

export interface AreaHatchControlsProps {
  kind: 'flood' | 'soils';
  value?: Partial<AreaHatchSettings>;
  areaCount?: number;
  onChange?: (patch: Partial<AreaHatchSettings>) => void;
}

const FLOOD_PATTERN_NAMES = [
  'AUTO',
  'none',
  ...Array.from(new Set([
    ...ALL_BUILT_IN_HATCHES.filter(p => p.category === 'fema').map(p => p.name),
    'CROSS',
    'DOTS',
    'ANSI31',
    'SOLID',
  ])),
];

const SOIL_PATTERN_NAMES = [
  'AUTO',
  'none',
  ...Array.from(new Set([
    'EARTH',
    'SAND',
    'GRAVEL',
    'MUDST',
    'SWAMP',
    'GRASS',
    'CROSS',
    'DOTS',
    'ANSI31',
    'SOLID',
  ])),
];

const PATTERN_LABELS: Record<string, string> = {
  AUTO: 'Auto — by FEMA zone / soil texture',
  none: 'No hatch',
};

/**
 * Shared live controls for FEMA and soils area hatching. Changing a control
 * rebuilds the existing area hatches and labels immediately.
 */
export const AreaHatchControls: React.FC<AreaHatchControlsProps> = ({
  kind,
  value,
  areaCount = 0,
  onChange,
}) => {
  const defaults = kind === 'flood' ? DEFAULT_FLOOD_HATCH : DEFAULT_SOIL_HATCH;
  const settings = { ...defaults, ...(value ?? {}) };
  const patternNames = kind === 'flood' ? FLOOD_PATTERN_NAMES : SOIL_PATTERN_NAMES;
  const selectedName = settings.patternName === 'none'
    ? 'none'
    : settings.patternName && settings.patternName !== 'AUTO'
      ? settings.patternName
      : 'AUTO';

  const previewPattern = useMemo<HatchDefinition>(() => {
    if (selectedName === 'none') return getHatchByName('SOLID') ?? ALL_BUILT_IN_HATCHES[0];
    if (selectedName !== 'AUTO') return getHatchByName(selectedName) ?? ALL_BUILT_IN_HATCHES[0];
    if (kind === 'flood') return getHatchForFemaZone('AE');
    return getHatchByName('SOLID') ?? ALL_BUILT_IN_HATCHES[0];
  }, [kind, selectedName]);

  const hatchingEnabled = selectedName !== 'none';
  const solidSoilFill = kind === 'soils' && (selectedName === 'SOLID' || selectedName === 'AUTO');
  const patternLabel = (name: string) => {
    if (kind === 'soils' && name === 'AUTO') return 'Auto — solid colors by map unit';
    if (kind === 'soils' && name === 'SOLID') return 'Solid — auto color palette';
    return PATTERN_LABELS[name] ?? name;
  };

  const setHatchEnabled = (enabled: boolean) => {
    onChange?.({
      patternName: enabled ? 'AUTO' : 'none',
      style: enabled ? 'lines' : 'none',
    });
  };

  return (
    <div className={`space-y-3 rounded-md border p-3 ${
      kind === 'flood'
        ? 'border-cyan-700/30 bg-cyan-950/20'
        : 'border-stone-600/30 bg-stone-900/30'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className={`text-xs font-bold uppercase tracking-wide ${
            kind === 'flood' ? 'text-cyan-300' : 'text-stone-300'
          }`}>
            Area Hatching &amp; Labels
          </div>
          <div className="text-[10px] text-gray-500">
            {areaCount > 0
              ? `Applies live to ${areaCount} fetched area${areaCount === 1 ? '' : 's'}`
              : 'Fetch areas to apply hatching and labels'}
          </div>
        </div>
        <label className="flex items-center gap-1.5 text-[10px] text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={hatchingEnabled}
            onChange={event => setHatchEnabled(event.target.checked)}
            className={`h-3.5 w-3.5 ${kind === 'flood' ? 'accent-cyan-400' : 'accent-stone-400'}`}
          />
          Hatch
        </label>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded border border-gray-700/60 bg-gray-950/50">
          {hatchingEnabled ? (
            <HatchPreviewCanvas
              hatch={previewPattern}
              size={42}
              scale={Math.max(1, settings.scale / 50)}
              angleDeg={settings.angleDeg ?? 0}
              color={settings.color || previewPattern.previewColor || '#22d3ee'}
              opacity={Math.max(0.25, settings.opacity)}
            />
          ) : (
            <span className="text-[10px] text-gray-600">OFF</span>
          )}
        </div>

        <label className="min-w-0 flex-1">
          <span className="mb-0.5 block text-[9px] uppercase tracking-wider text-gray-500">Pattern</span>
          <select
            value={selectedName}
            disabled={!hatchingEnabled}
            onChange={event => {
              const patternName = event.target.value;
              onChange?.({
                patternName,
                style: patternName === 'none' ? 'none' : 'lines',
              });
            }}
            className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 font-mono text-[11px] text-gray-200 disabled:opacity-50"
          >
            {patternNames.map(name => (
              <option key={name} value={name}>
                {patternLabel(name)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {solidSoilFill && (
        <p className="text-[9px] leading-snug text-stone-500">
          One solid fill per soil map unit, spaced around the hue wheel by the golden angle.
        </p>
      )}

      <div className={solidSoilFill ? 'opacity-40' : ''}>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-[10px] uppercase tracking-wide text-gray-400">Spacing</label>
          <span className={`font-mono text-[10px] ${
            kind === 'flood' ? 'text-cyan-300' : 'text-stone-300'
          }`}>
            {Math.round(settings.scale)} ft
          </span>
        </div>
        <input
          type="range"
          min={kind === 'flood' ? 10 : 5}
          max={kind === 'flood' ? 200 : 400}
          step={5}
          value={settings.scale}
          disabled={!hatchingEnabled || solidSoilFill}
          onChange={event => onChange?.({ scale: Number(event.target.value) })}
          className={`w-full disabled:opacity-40 ${
            kind === 'flood' ? 'accent-cyan-400' : 'accent-stone-400'
          }`}
        />
      </div>

      <div className={`grid grid-cols-2 gap-2 ${solidSoilFill ? 'opacity-40' : ''}`}>
        <label>
          <span className="mb-0.5 block text-[9px] uppercase tracking-wider text-gray-500">Angle</span>
          <input
            type="number"
            min={-90}
            max={90}
            step={15}
            value={settings.angleDeg ?? 0}
            disabled={!hatchingEnabled || solidSoilFill}
            onChange={event => onChange?.({ angleDeg: Number(event.target.value) || 0 })}
            className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 font-mono text-[11px] text-gray-200 disabled:opacity-50"
          />
        </label>
        <label>
          <span className="mb-0.5 block text-[9px] uppercase tracking-wider text-gray-500">
            {solidSoilFill ? 'Palette base' : 'Color'}
          </span>
          <input
            type="color"
            value={settings.color || defaults.color}
            disabled={!hatchingEnabled}
            onChange={event => onChange?.({ color: event.target.value })}
            className="h-[28px] w-full cursor-pointer rounded border border-gray-700 bg-gray-900 p-0.5 disabled:opacity-50"
          />
        </label>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-[10px] uppercase tracking-wide text-gray-400">Opacity</label>
          <span className={`font-mono text-[10px] ${
            kind === 'flood' ? 'text-cyan-300' : 'text-stone-300'
          }`}>
            {Math.round(settings.opacity * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={3}
          max={80}
          step={1}
          value={Math.round(settings.opacity * 100)}
          disabled={!hatchingEnabled}
          onChange={event => onChange?.({ opacity: Number(event.target.value) / 100 })}
          className={`w-full disabled:opacity-40 ${
            kind === 'flood' ? 'accent-cyan-400' : 'accent-stone-400'
          }`}
        />
      </div>

      <label className="flex items-center gap-2 text-[11px] text-gray-300 cursor-pointer">
        <input
          type="checkbox"
          checked={settings.showLabels !== false}
          onChange={event => onChange?.({ showLabels: event.target.checked })}
          className={`h-3.5 w-3.5 ${
            kind === 'flood' ? 'accent-cyan-400' : 'accent-stone-400'
          }`}
        />
        {kind === 'flood' ? 'Show zone callouts' : 'Show area annotations'}
      </label>
    </div>
  );
};

export default AreaHatchControls;
