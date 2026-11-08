import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Eye, EyeOff, Search } from 'lucide-react';
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
  /** Layer visibility state. Missing = visible. */
  layerVisibility?: Record<string, boolean>;
  onSelectLayer: (layerName: string) => void;
  onToggleLayerVisibility?: (layerName: string) => void;
  onLayerColorChange: (layerName: string, color: string) => void;
  onLayerLinetypeChange: (layerName: string, lineType: string) => void;
}

/** Header-toolbar layer strip: choose the active layer, show/hide layers, edit color / linetype. */
export const CadLayerPicker: React.FC<CadLayerPickerProps> = ({
  layers,
  activeLayer,
  layerColors,
  layerLinetypes,
  linetypeOptions,
  layerVisibility = {},
  onSelectLayer,
  onToggleLayerVisibility,
  onLayerColorChange,
  onLayerLinetypeChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const closePicker = useCallback(() => {
    setIsOpen(false);
    setSearch('');
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) closePicker();
    };
    // Capture phase so Escape dismisses the strip without also cancelling a
    // canvas tool that listens for Escape.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closePicker();
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, closePicker]);

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
    <div ref={containerRef} className="relative flex self-stretch items-center">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (isOpen ? closePicker() : setIsOpen(true))}
        className={`p-2 rounded-full transition-colors text-xs font-medium ${isOpen ? 'bg-cyan-600 hover:bg-cyan-700 text-white' : 'hover:bg-gray-700 text-gray-300'}`}
        title="Layers — active drawing layer, show/hide, color and linetype"
        aria-label="Layers"
        aria-haspopup="true"
        aria-expanded={isOpen}
        data-testid="cad-layer-picker-trigger"
      >
        Layers
      </button>

      {isOpen && (
        <div
          className="layer-picker-unroll absolute left-0 top-full z-50 w-[320px] overflow-hidden rounded-b-md border-x border-b border-white/[0.07] bg-[#0a0f16] text-gray-200 shadow-[0_20px_38px_-18px_rgba(0,0,0,0.9)] light-theme:border-gray-300/60 light-theme:bg-white"
          data-testid="cad-layer-picker-panel"
          aria-label="Layers"
        >
          {activeEntry || activeLayer ? (
            <div className="flex items-center gap-2 border-b border-white/[0.05] px-2.5 py-2 light-theme:border-gray-200">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/30"
                style={{ backgroundColor: activeColor }}
              />
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-amber-200" title={activeEntry?.name ?? activeLayer}>
                {activeEntry?.name ?? activeLayer}
              </span>
              <label className="sr-only" htmlFor="cad-layer-picker-color">Active layer color</label>
              <input
                id="cad-layer-picker-color"
                type="color"
                value={activeColor}
                onChange={event => onLayerColorChange(activeLayer, event.target.value)}
                className="h-5 w-5 shrink-0 cursor-pointer rounded-sm border border-white/15 bg-transparent p-0"
                title="Active layer color (applies to every entity on this layer)"
              />
              <label className="sr-only" htmlFor="cad-layer-picker-linetype">Active layer linetype</label>
              <select
                id="cad-layer-picker-linetype"
                value={activeLinetype}
                onChange={event => onLayerLinetypeChange(activeLayer, event.target.value)}
                className="w-[86px] shrink-0 rounded-sm border border-white/10 bg-white/[0.04] px-1 py-0.5 font-mono text-[10px] text-cyan-200 focus:border-cyan-500/60 focus:outline-none"
                title="Active layer linetype (applies to every entity on this layer)"
              >
                {linetypes.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          ) : (
            <p className="border-b border-white/[0.05] px-2.5 py-2 text-[11px] text-gray-500 light-theme:border-gray-200">
              No active layer — new linework uses <span className="text-cyan-300">AI-selected</span> layers.
            </p>
          )}

          <div className="flex items-center gap-1.5 border-b border-white/[0.05] px-2.5 py-1.5 light-theme:border-gray-200">
            <Search className="h-3.5 w-3.5 shrink-0 text-gray-500" />
            <input
              autoFocus
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Find a layer…"
              className="min-w-0 flex-1 bg-transparent text-[11px] text-gray-200 placeholder:text-gray-600 focus:outline-none"
              aria-label="Search layers"
            />
          </div>

          <div className="max-h-60 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => onSelectLayer('')}
              className={`flex w-full items-center gap-2 py-1.5 pl-3 pr-2 text-left text-[11px] hover:bg-white/[0.04] ${activeLayer === '' ? 'bg-cyan-500/10 text-cyan-200' : 'text-gray-400'}`}
            >
              <span className="flex h-3 w-3 shrink-0 items-center justify-center">
                {activeLayer === '' && <Check className="h-3 w-3" />}
              </span>
              <span className="italic">(AI selects layer)</span>
            </button>

            {filteredLayers.map(layer => {
              const isActive = layer.name === activeLayer;
              const isVisible = layerVisibility[layer.name] !== false;
              const color = layerColors[layer.name] || '#E5E7EB';
              const lineType = (layerLinetypes[layer.name] || 'CONTINUOUS').toUpperCase();
              return (
                <div key={layer.name} className={`flex items-center ${isActive ? 'bg-cyan-500/10' : ''}`}>
                  <button
                    type="button"
                    onClick={() => onSelectLayer(layer.name)}
                    className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-3 pr-1 text-left hover:bg-white/[0.04]"
                    title={`${layer.name} — ${lineType}`}
                  >
                    <span className="flex h-3 w-3 shrink-0 items-center justify-center">
                      {isActive ? <Check className="h-3 w-3 text-cyan-300" /> : null}
                    </span>
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full border border-white/25 ${isVisible ? '' : 'opacity-30'}`}
                      style={{ backgroundColor: color }}
                    />
                    <span className={`min-w-0 flex-1 truncate font-mono text-[11px] ${isVisible ? (isActive ? 'text-cyan-200' : 'text-gray-200') : 'text-gray-500 line-through'}`}>
                      {layer.name}
                    </span>
                    {(layer.isPointLayer || layer.isLineLayer) && (
                      <span className="shrink-0 rounded bg-white/[0.06] px-1 text-[8px] font-semibold text-gray-400">
                        {layer.isPointLayer ? 'PT' : ''}{layer.isPointLayer && layer.isLineLayer ? ' ' : ''}{layer.isLineLayer ? 'LN' : ''}
                      </span>
                    )}
                    <span className="w-16 shrink-0 truncate text-right font-mono text-[9px] text-gray-500" title={lineType}>
                      {lineType}
                    </span>
                  </button>
                  {onToggleLayerVisibility && (
                    <button
                      type="button"
                      onClick={() => onToggleLayerVisibility(layer.name)}
                      className="mr-1.5 shrink-0 rounded p-1.5 text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-gray-200"
                      title={isVisible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                      aria-label={isVisible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                      aria-pressed={isVisible}
                      data-testid={`cad-layer-visibility-${layer.name}`}
                    >
                      {isVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              );
            })}
            {filteredLayers.length === 0 && (
              <p className="px-3 py-2 text-[11px] italic text-gray-500">No layers match “{search}”.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CadLayerPicker;
