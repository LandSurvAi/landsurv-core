import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import type { CadLayerEntry } from './LayerManagerPanel.tsx';

interface CadLayerPickerProps {
  /** All layers from the CAD Manager standard plus any layers already used by geometry. */
  layers: CadLayerEntry[];
  /** Layer assigned to manually drawn lines. Empty string = AI selects the layer. */
  activeLayer: string;
  /** Canvas color overrides, merged with the standard's LayerDefinition colors. */
  layerColors: Record<string, string>;
  /** Layer name → default linetype (from the loaded standard). */
  layerLinetypes: Record<string, string>;
  /** Linetypes offered in the picker. */
  linetypeOptions: string[];
  onSelectLayer: (layerName: string) => void;
  onLayerColorChange: (layerName: string, color: string) => void;
  onLayerLinetypeChange: (layerName: string, lineType: string) => void;
}

/** Toolbar layer picker: choose the active drawing layer and edit its color / linetype. */
export const CadLayerPicker: React.FC<CadLayerPickerProps> = ({
  layers,
  activeLayer,
  layerColors,
  layerLinetypes,
  linetypeOptions,
  onSelectLayer,
  onLayerColorChange,
  onLayerLinetypeChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  const filteredLayers = useMemo(() => {
    const needle = search.trim().toUpperCase();
    if (!needle) return layers;
    return layers.filter(layer => layer.name.toUpperCase().includes(needle));
  }, [layers, search]);

  const activeEntry = layers.find(layer => layer.name === activeLayer) ?? null;
  const activeColor = layerColors[activeLayer] || '#E5E7EB';
  const activeLinetype = (layerLinetypes[activeLayer] || 'CONTINUOUS').toUpperCase();
  const linetypes = useMemo(() => {
    const names = new Set(linetypeOptions.map(name => name.toUpperCase()));
    names.add('CONTINUOUS');
    if (activeLinetype) names.add(activeLinetype.toUpperCase());
    return Array.from(names).sort();
  }, [linetypeOptions, activeLinetype]);

  return (
    <div ref={containerRef} className="relative flex items-center">
      <button
        type="button"
        onClick={() => setIsOpen(open => !open)}
        className={`p-2 rounded-full transition-colors text-xs font-medium ${isOpen ? 'bg-cyan-600 hover:bg-cyan-700 text-white' : 'hover:bg-gray-700 text-gray-300'}`}
        title="Layer picker — choose the active drawing layer and edit color / linetype"
        aria-label="Layer picker"
        aria-expanded={isOpen}
        data-testid="cad-layer-picker-trigger"
      >
        Layers
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[340px] overflow-hidden rounded-lg border border-gray-700 bg-[#0b121b] shadow-2xl">
          <div className="flex items-center justify-between border-b border-gray-700/70 px-3 py-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-300">Layer picker</p>
              <p className="text-[10px] text-gray-500">{layers.length} layer{layers.length === 1 ? '' : 's'} in the standard</p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white"
              title="Close layer picker"
              aria-label="Close layer picker"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="border-b border-gray-700/70 bg-gray-800/40 px-3 py-2.5">
            {activeEntry || activeLayer ? (
              <>
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full border border-white/30"
                    style={{ backgroundColor: activeColor }}
                  />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-amber-200" title={activeEntry?.name ?? activeLayer}>
                    {activeEntry?.name ?? activeLayer}
                  </span>
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-300">
                    Active
                  </span>
                </div>
                <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1.5">
                  <label className="text-[10px] uppercase tracking-wide text-gray-500" htmlFor="cad-layer-picker-color">Color</label>
                  <input
                    id="cad-layer-picker-color"
                    type="color"
                    value={activeColor}
                    onChange={event => onLayerColorChange(activeLayer, event.target.value)}
                    className="h-6 w-full cursor-pointer rounded border border-gray-600 bg-transparent"
                    title="Layer color (applies to every entity on this layer)"
                  />
                  <label className="text-[10px] uppercase tracking-wide text-gray-500" htmlFor="cad-layer-picker-linetype">Linetype</label>
                  <select
                    id="cad-layer-picker-linetype"
                    value={activeLinetype}
                    onChange={event => onLayerLinetypeChange(activeLayer, event.target.value)}
                    className="min-w-0 rounded border border-gray-600 bg-gray-700 px-1.5 py-1 text-[11px] font-mono text-cyan-200 focus:border-cyan-500 focus:outline-none"
                    title="Layer linetype (applies to every entity on this layer)"
                  >
                    {linetypes.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <p className="text-[11px] text-gray-400">
                No active layer. New manual linework uses <span className="text-cyan-300">AI-selected</span> layers.
              </p>
            )}
          </div>

          <div className="border-b border-gray-700/70 px-2 py-1.5">
            <div className="flex items-center gap-1.5 rounded border border-gray-700 bg-gray-800/70 px-2 py-1">
              <Search className="h-3 w-3 shrink-0 text-gray-500" />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Find a layer…"
                className="min-w-0 flex-1 bg-transparent text-[11px] text-gray-200 placeholder:text-gray-600 focus:outline-none"
                aria-label="Search layers"
              />
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => onSelectLayer('')}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] hover:bg-gray-800 ${activeLayer === '' ? 'bg-cyan-600/15 text-cyan-200' : 'text-gray-400'}`}
            >
              <span className="flex h-3 w-3 shrink-0 items-center justify-center">
                {activeLayer === '' && <Check className="h-3 w-3" />}
              </span>
              <span className="italic">(AI selects layer)</span>
            </button>
            {filteredLayers.map(layer => {
              const isActive = layer.name === activeLayer;
              const color = layerColors[layer.name] || '#E5E7EB';
              const lineType = (layerLinetypes[layer.name] || 'CONTINUOUS').toUpperCase();
              return (
                <button
                  key={layer.name}
                  type="button"
                  onClick={() => onSelectLayer(layer.name)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-800 ${isActive ? 'bg-cyan-600/15' : ''}`}
                  title={`${layer.name} — ${lineType}`}
                >
                  <span className="flex h-3 w-3 shrink-0 items-center justify-center">
                    {isActive ? <Check className="h-3 w-3 text-cyan-300" /> : null}
                  </span>
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/25"
                    style={{ backgroundColor: color }}
                  />
                  <span className={`min-w-0 flex-1 truncate font-mono text-[11px] ${isActive ? 'text-cyan-200' : 'text-gray-200'}`}>
                    {layer.name}
                  </span>
                  {(layer.isPointLayer || layer.isLineLayer) && (
                    <span className="shrink-0 rounded bg-gray-700 px-1 text-[8px] font-semibold text-gray-300">
                      {layer.isPointLayer ? 'PT' : ''}{layer.isPointLayer && layer.isLineLayer ? ' ' : ''}{layer.isLineLayer ? 'LN' : ''}
                    </span>
                  )}
                  <span className="w-16 shrink-0 truncate text-right font-mono text-[9px] text-gray-500" title={lineType}>
                    {lineType}
                  </span>
                </button>
              );
            })}
            {filteredLayers.length === 0 && (
              <p className="px-3 py-2 text-[11px] italic text-gray-500">No layers match “{search}”.</p>
            )}
          </div>

          <div className="border-t border-gray-700/70 bg-gray-900/60 px-3 py-2 text-[9.5px] text-gray-500">
            Chat: “set layer {activeLayer || 'L-ROAD-CNTR'} to red dashed”
          </div>
        </div>
      )}
    </div>
  );
};

export default CadLayerPicker;
