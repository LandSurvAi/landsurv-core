import React, { useState } from 'react';
import { GisAgentIcon } from './icons.tsx';

/**
 * StreamsPanel — Streams & Watersheds tool for the GIS Agent.
 *
 * The presets are suggestions, not the supported list: every button just sends
 * a topic through the same free-form live-layer pipeline the GIS Agent uses
 * (`gis_show_live_layer`), so any public hydrography layer resolves. Layers
 * drawn from this panel replace each other so the canvas does not collect
 * overlapping stream layers.
 */

export interface StreamsPanelResult {
  label: string;
  layerName: string;
  featureCount: number;
  segmentCount: number;
  provider?: string;
  message: string;
  names?: string[];
}

export interface StreamPreset {
  id: string;
  label: string;
  topic: string;
  hint: string;
}

export const STREAM_PRESETS: StreamPreset[] = [
  { id: 'all-streams', label: 'All streams', topic: 'streams', hint: 'Every mapped stream and river in the AOI.' },
  { id: 'wild-trout', label: 'Wild trout streams', topic: 'wild trout streams', hint: 'Wild trout reproduction waters.' },
  { id: 'class-a', label: 'Class A wild trout', topic: 'Class A wild trout streams', hint: 'Biologist-rated Class A wild trout waters.' },
  { id: 'stocked', label: 'Stocked trout waters', topic: 'stocked trout streams', hint: 'Commission-stocked trout streams.' },
  { id: 'impaired', label: 'Impaired / designated use', topic: 'impaired streams', hint: 'DEP 303(d) / Chapter 93 listings.' },
  { id: 'watersheds', label: 'Watersheds (HUC10)', topic: 'watersheds HUC10', hint: 'WBD sub-watershed polygons.' },
];

interface StreamsPanelProps {
  /** Draw a live layer for the topic, replacing the panel's previous layer. */
  onDrawLayer: (topic: string) => void | Promise<void>;
  isFetching: boolean;
  lastResult?: StreamsPanelResult | null;
  error?: string | null;
  /** Remove the hydrography layers this panel drew. */
  onClearLayers?: () => void;
}

export const StreamsPanel: React.FC<StreamsPanelProps> = ({
  onDrawLayer,
  isFetching,
  lastResult,
  error,
  onClearLayers,
}) => {
  const [customQuery, setCustomQuery] = useState('');
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  const drawPreset = (preset: StreamPreset) => {
    if (isFetching) return;
    setActivePresetId(preset.id);
    void onDrawLayer(preset.topic);
  };

  const drawCustom = () => {
    const topic = customQuery.trim();
    if (isFetching || topic.length < 3) return;
    setActivePresetId(null);
    void onDrawLayer(topic);
  };

  return (
    <div className="space-y-4 text-sm">
      {/* Source badge */}
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <GisAgentIcon className="w-4 h-4 text-teal-400" />
        <span>Live public hydrography · queried for the current project AOI</span>
      </div>

      {/* Presets */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-teal-300 uppercase tracking-wide">Stream presets</div>
        <div className="grid grid-cols-2 gap-2">
          {STREAM_PRESETS.map(preset => {
            const active = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                aria-label={preset.label}
                title={preset.hint}
                onClick={() => drawPreset(preset)}
                disabled={isFetching}
                className={`px-2.5 py-2 rounded-md text-left border transition disabled:opacity-50 disabled:cursor-not-allowed ${
                  active
                    ? 'bg-teal-500/20 border-teal-400 text-teal-100'
                    : 'bg-gray-900 border-gray-700 text-gray-300 hover:border-teal-600 hover:text-teal-200'
                }`}
              >
                <span className="block text-xs font-semibold leading-tight">{preset.label}</span>
                <span className="block text-[10px] text-gray-500 leading-tight mt-0.5">{preset.hint}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-gray-500">
          Presets are suggestions — type any other topic below to search the live public layers.
        </p>
      </div>

      {/* Custom topic */}
      <div className="space-y-2">
        <label htmlFor="streams-custom-topic" className="block text-xs font-semibold text-gray-400">
          Custom layer topic
        </label>
        <div className="flex gap-2">
          <input
            id="streams-custom-topic"
            type="text"
            value={customQuery}
            onChange={e => setCustomQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') drawCustom();
            }}
            placeholder='e.g. "exceptional value streams", "NHD flowlines"'
            className="flex-1 min-w-0 px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-100 text-xs focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400"
          />
          <button
            type="button"
            onClick={drawCustom}
            disabled={isFetching || customQuery.trim().length < 3}
            className="px-3 py-2 rounded-md text-xs font-semibold text-white bg-teal-600 hover:bg-teal-500 transition-colors disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed whitespace-nowrap"
          >
            Draw custom layer
          </button>
        </div>
      </div>

      {/* Status */}
      {isFetching && (
        <div className="flex items-center gap-2 bg-gray-900/60 border border-teal-500/20 rounded-md p-3 text-xs text-teal-200">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-teal-400 border-t-transparent animate-spin" />
          <span>Resolving the layer and querying this AOI…</span>
        </div>
      )}

      {!isFetching && error && (
        <div className="bg-red-950/40 border border-red-500/40 rounded-md p-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {!isFetching && !error && lastResult && (
        <div className="bg-gray-900/60 border border-teal-500/20 rounded-md p-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-teal-200 truncate" title={lastResult.label}>
              {lastResult.label}
            </span>
            {onClearLayers && (
              <button
                type="button"
                onClick={onClearLayers}
                className="text-xs text-gray-400 hover:text-red-400 underline whitespace-nowrap"
              >
                Clear layer
              </button>
            )}
          </div>
          <div className="text-xs text-gray-300">
            {lastResult.featureCount.toLocaleString()} feature{lastResult.featureCount === 1 ? '' : 's'} ·{' '}
            {lastResult.segmentCount.toLocaleString()} segment{lastResult.segmentCount === 1 ? '' : 's'}
          </div>
          <div className="text-[10px] text-gray-500 font-mono break-all">
            {lastResult.layerName}
            {lastResult.provider ? ` · ${lastResult.provider}` : ''}
          </div>
          {lastResult.names && lastResult.names.length > 0 && (
            <ul className="text-[11px] text-gray-400 space-y-0.5 max-h-24 overflow-y-auto">
              {lastResult.names.slice(0, 8).map((name, index) => (
                <li key={`${name}-${index}`} className="truncate" title={name}>{name}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Footer */}
      <p className="text-xs text-gray-500 leading-relaxed border-t border-gray-700 pt-2">
        Each draw lands on its own CAD layer so it can be styled or hidden from Data Visibility.
        Drawing again from this panel replaces the previous stream layer.
      </p>
    </div>
  );
};

export default StreamsPanel;
