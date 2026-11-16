import React, { useMemo, useState } from 'react';
import {
    type PointList,
    type WmsService,
    type ActiveWmsLayer,
    type OfflineMapArea,
    type TinSurface,
} from '../types.ts';
import { LayersIcon, ChevronDownIcon } from './icons.tsx';

/** Layer entry shown in the dynamic "CAD Layers" section */
export interface CadLayerEntry {
  name: string;
  isPointLayer: boolean;
  isLineLayer: boolean;
  /** Description from CAD Manager standard, if available. */
  description?: string;
}

interface LayerManagerPanelProps {
    pointLists: PointList[];
    onTogglePointListVisibility: (listId: string) => void;
    linesVisible: boolean;
    onSetLinesVisible: (visible: boolean) => void;
    centerlinesVisible: boolean;
    onSetCenterlinesVisible: (visible: boolean) => void;
    pointLayers: { pointNumber: { visible: boolean; color: string; }; description: { visible: boolean; color: string; }; elevation: { visible: boolean; color: string; }; };
    onLayerToggle: (layerName: "pointNumber" | "description" | "elevation") => void;
    onLayerColorChange: (layer: 'pointNumber' | 'description' | 'elevation', color: string) => void;
    wmsServices: WmsService[];
    activeWmsLayers: ActiveWmsLayer[];
    onToggleWmsLayer: (serviceUrl: string, layerName: string, isVisible: boolean) => void;
    offlineMapAreas: OfflineMapArea[];
    onToggleOfflineMapAreaVisibility: (id: string) => void;
    tinSurfaces?: TinSurface[];
    onToggleTinSurfaceVisibility?: (id: string) => void;
    /** All CAD layers available (from standard + currently active in points/lines). */
    cadLayers?: CadLayerEntry[];
    /** Layer visibility state. Missing = visible. */
    cadLayerVisibility?: Record<string, boolean>;
    /** Per-layer canvas color overrides. */
    cadLayerColors?: Record<string, string>;
    /** Layer name → default linetype from the CAD standard. */
    cadLayerLinetypes?: Record<string, string>;
    /** Linetypes available for layer defaults. */
    cadLinetypeOptions?: string[];
    onToggleCadLayer?: (layerName: string) => void;
    onCadLayerColorChange?: (layerName: string, color: string) => void;
    onCadLayerLinetypeChange?: (layerName: string, lineType: string) => void;
    /** Named inclusion-boundary groups (one entry per polylineId). Each is a
     *  closed inclusion polyline produced by shrinkwrap, the Boundary Editor,
     *  or manual drawing. Visibility toggles flip `hidden` on every SurveyLine
     *  that shares the boundary's polylineId. */
    inclusionBoundaries?: Array<{ id: string; name: string; polylineId: string }>;
    /** Map polylineId → visible boolean (missing = visible). */
    inclusionBoundaryVisibility?: Record<string, boolean>;
    /** Map polylineId → segment count (optional, shown as sublabel). */
    inclusionBoundarySegmentCounts?: Record<string, number>;
    onToggleInclusionBoundary?: (id: string) => void;
    /** When true, suppress the built-in header (used when embedded in a floating dialog) */
    hideHeader?: boolean;
}

const panelRowClass =
    'group flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-2 transition-colors hover:border-white/[0.12] hover:bg-white/[0.045] light-theme:border-gray-200 light-theme:bg-gray-50 light-theme:hover:border-gray-300 light-theme:hover:bg-gray-100';

const VisibilitySwitch: React.FC<{
    label: string;
    isVisible: boolean;
    onToggle: () => void;
}> = ({ label, isVisible, onToggle }) => (
    <button
        type="button"
        role="switch"
        aria-checked={isVisible}
        aria-label={`${label} visibility`}
        title={isVisible ? `Hide ${label}` : `Show ${label}`}
        onClick={event => {
            event.stopPropagation();
            onToggle();
        }}
        className={`relative inline-flex h-[18px] w-[32px] shrink-0 items-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50 ${
            isVisible
                ? 'border-cyan-300/40 bg-cyan-400/25'
                : 'border-white/[0.10] bg-white/[0.05] light-theme:border-gray-300 light-theme:bg-gray-200'
        }`}
    >
        <span
            aria-hidden="true"
            className={`pointer-events-none block h-3 w-3 rounded-full transition-transform duration-200 ${
                isVisible
                    ? 'translate-x-[15px] bg-cyan-200 shadow-[0_0_8px_rgba(34,211,238,0.65)]'
                    : 'translate-x-[3px] bg-slate-500 light-theme:bg-gray-500'
            }`}
        />
    </button>
);

const ColorControl: React.FC<{
    label: string;
    value: string;
    onChange: (value: string) => void;
}> = ({ label, value, onChange }) => (
    <label
        className="relative h-5 w-5 shrink-0 cursor-pointer overflow-hidden rounded-md border border-white/[0.18] shadow-inner light-theme:border-gray-300"
        title={label}
    >
        <span aria-hidden="true" className="absolute inset-0" style={{ backgroundColor: value }} />
        <input
            type="color"
            value={value}
            onChange={event => onChange(event.target.value)}
            aria-label={label}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
    </label>
);

const CollapsibleSection: React.FC<{
    title: string;
    badge?: number;
    hint?: string;
    children: React.ReactNode;
}> = ({ title, badge, hint, children }) => {
    const [isOpen, setIsOpen] = useState(true);
    return (
        <section className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.018] light-theme:border-gray-200 light-theme:bg-white">
            <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setIsOpen(open => !open)}
                className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left transition-colors hover:bg-white/[0.025] light-theme:hover:bg-gray-50"
            >
                <span className="flex min-w-0 items-center gap-2">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400/80 shadow-[0_0_8px_rgba(34,211,238,0.45)]" />
                    <span className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-slate-300 light-theme:text-gray-700">
                        {title}
                    </span>
                    {badge !== undefined && (
                        <span className="rounded-full border border-white/[0.08] bg-black/20 px-1.5 py-0.5 font-mono text-[8.5px] font-semibold text-slate-500 light-theme:border-gray-200 light-theme:bg-gray-100 light-theme:text-gray-500">
                            {badge}
                        </span>
                    )}
                </span>
                <ChevronDownIcon
                    className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`}
                />
            </button>
            {isOpen && (
                <div className="space-y-1.5 border-t border-white/[0.06] p-2 light-theme:border-gray-200">
                    {hint && (
                        <p className="px-0.5 pb-0.5 text-[9px] leading-snug text-slate-500 light-theme:text-gray-500">
                            {hint}
                        </p>
                    )}
                    {children}
                </div>
            )}
        </section>
    );
};

const LayerToggle: React.FC<{
    label: string;
    sublabel?: string;
    isVisible: boolean;
    onToggle: () => void;
    children?: React.ReactNode;
}> = ({ label, sublabel, isVisible, onToggle, children }) => (
    <div className={`${panelRowClass} ${isVisible ? '' : 'opacity-60'}`}>
        <div className="min-w-0 flex-1">
            <div
                className={`truncate text-[11px] font-medium ${
                    isVisible
                        ? 'text-slate-200 light-theme:text-gray-700'
                        : 'text-slate-500 line-through light-theme:text-gray-400'
                }`}
                title={label}
            >
                {label}
            </div>
            {sublabel && (
                <div className="mt-0.5 truncate text-[9px] text-slate-500 light-theme:text-gray-500">
                    {sublabel}
                </div>
            )}
        </div>
        {children}
        <VisibilitySwitch label={label} isVisible={isVisible} onToggle={onToggle} />
    </div>
);

const PointAttributeRow: React.FC<{
    label: string;
    hint: string;
    color: string;
    isVisible: boolean;
    onToggle: () => void;
    onColorChange: (color: string) => void;
}> = ({ label, hint, color, isVisible, onToggle, onColorChange }) => (
    <div className={`${panelRowClass} ${isVisible ? '' : 'opacity-60'}`}>
        <ColorControl label={`Color for ${label}`} value={color} onChange={onColorChange} />
        <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-medium text-slate-200 light-theme:text-gray-700">
                {label}
            </div>
            <div className="mt-0.5 truncate text-[9px] text-slate-500 light-theme:text-gray-500">
                {isVisible ? hint : 'Hidden on canvas'}
            </div>
        </div>
        <VisibilitySwitch label={label} isVisible={isVisible} onToggle={onToggle} />
    </div>
);

/** Default colors for built-in survey layers when no override is set */
const BUILTIN_LAYER_COLORS: Record<string, string> = {
    'L-DEED-BOUNDARY': '#00FF7F',
    'L-CENTERLINE': '#FF6B6B',
    'L-EDGE-PAVEMENT': '#87CEEB',
    'L-CURB': '#FFA0A0',
    'L-SIDEWALK': '#C0C0C0',
    'L-BUILDING': '#FF8C00',
    'L-FENCE': '#DEB887',
    'L-DRIVEWAY': '#B0C4DE',
    'L-LINEWORK': '#AAAAAA',
    'L-SURV-MONUMENT': '#FFD700',
    'L-DEED-POINT': '#00FF7F',
};

const LayerManagerPanel: React.FC<LayerManagerPanelProps> = (props) => {
    const {
        pointLists, onTogglePointListVisibility,
        linesVisible, onSetLinesVisible,
        centerlinesVisible, onSetCenterlinesVisible,
        pointLayers, onLayerToggle, onLayerColorChange,
        wmsServices, activeWmsLayers, onToggleWmsLayer,
        offlineMapAreas, onToggleOfflineMapAreaVisibility,
        tinSurfaces = [],
        onToggleTinSurfaceVisibility,
        cadLayers = [],
        cadLayerVisibility = {},
        cadLayerColors = {},
        cadLayerLinetypes = {},
        cadLinetypeOptions = [],
        onToggleCadLayer,
        onCadLayerColorChange,
        onCadLayerLinetypeChange,
        inclusionBoundaries = [],
        inclusionBoundaryVisibility = {},
        inclusionBoundarySegmentCounts = {},
        onToggleInclusionBoundary,
        hideHeader = false,
    } = props;

    /** All CAD layer entries: standard-defined + built-ins used by active data but not in standard */
    const effectiveCadLayers = useMemo(() => {
        const result = [...cadLayers];
        // Add well-known built-in layers that aren't already in the standard list
        const inStandard = new Set(cadLayers.map(l => l.name));
        const builtins = Object.keys(BUILTIN_LAYER_COLORS);
        for (const name of builtins) {
            if (!inStandard.has(name)) {
                result.push({ name, isPointLayer: name.includes('POINT') || name.includes('MONUMENT'), isLineLayer: true });
            }
        }
        return result.sort((a, b) => a.name.localeCompare(b.name));
    }, [cadLayers]);

    const cadLayerCount = effectiveCadLayers.length;
    const cadLinetypeNames = useMemo(() => {
        const names = new Set<string>(['CONTINUOUS']);
        for (const name of cadLinetypeOptions) {
            if (name?.trim()) names.add(name.trim().toUpperCase());
        }
        for (const name of Object.values(cadLayerLinetypes)) {
            if (name?.trim()) names.add(name.trim().toUpperCase());
        }
        return Array.from(names).sort();
    }, [cadLinetypeOptions, cadLayerLinetypes]);

    const hasMapOverlays = offlineMapAreas.length > 0 || activeWmsLayers.length > 0;

    return (
        <div className="flex h-full w-full flex-col overflow-hidden bg-[#0a0f16] text-slate-200 light-theme:bg-white light-theme:text-gray-700">
            {!hideHeader && (
                <header className="flex shrink-0 items-start gap-2.5 border-b border-white/[0.07] bg-gradient-to-br from-cyan-400/[0.08] via-transparent to-transparent px-3 py-3 light-theme:border-gray-200">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-cyan-300/25 bg-cyan-400/10 text-cyan-200">
                        <LayersIcon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                            <h3 className="truncate text-sm font-semibold text-slate-100 light-theme:text-gray-800">
                                Data Visibility
                            </h3>
                            <span className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-cyan-200">
                                A2UI
                            </span>
                        </div>
                        <p className="mt-0.5 text-[9.5px] text-slate-500 light-theme:text-gray-500">
                            Canvas layers, point labels &amp; overlays in one live surface.
                        </p>
                    </div>
                </header>
            )}

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-2.5 [scrollbar-color:rgba(34,211,238,0.28)_transparent] [scrollbar-width:thin]">

                {/* ── CAD Layers (SSOT from CAD Manager) ── */}
                <CollapsibleSection title="CAD Layers" badge={cadLayerCount}>
                    {cadLayerCount === 0 ? (
                        <p className="rounded-lg border border-dashed border-white/[0.08] bg-black/10 px-2.5 py-3 text-[9.5px] leading-snug text-slate-500 light-theme:border-gray-300 light-theme:bg-gray-50">
                            No CAD standard loaded. Upload a standard in CAD Manager to see layer controls here.
                            Default layers appear automatically as agents generate geometry.
                        </p>
                    ) : null}
                    {effectiveCadLayers.map(layer => {
                        const isVisible = cadLayerVisibility[layer.name] !== false;
                        const colorOverride = cadLayerColors[layer.name] || BUILTIN_LAYER_COLORS[layer.name] || '#94a3b8';
                        const lineType = (cadLayerLinetypes[layer.name] || 'CONTINUOUS').toUpperCase();
                        const badges: string[] = [];
                        if (layer.isPointLayer) badges.push('PT');
                        if (layer.isLineLayer) badges.push('LN');
                        return (
                            <div
                                key={layer.name}
                                className={`rounded-lg border border-white/[0.06] bg-white/[0.025] px-2 py-1.5 transition-colors hover:border-white/[0.12] hover:bg-white/[0.045] light-theme:border-gray-200 light-theme:bg-gray-50 light-theme:hover:bg-gray-100 ${isVisible ? '' : 'opacity-60'}`}
                            >
                                <div className="flex items-center gap-2">
                                    <span
                                        aria-hidden="true"
                                        className="h-2 w-2 shrink-0 rounded-full ring-1 ring-white/20"
                                        style={{ backgroundColor: colorOverride }}
                                    />
                                    <span
                                        className={`min-w-0 flex-1 truncate font-mono text-[10.5px] ${
                                            isVisible
                                                ? 'text-slate-200 light-theme:text-gray-700'
                                                : 'text-slate-500 line-through light-theme:text-gray-400'
                                        }`}
                                        title={layer.name}
                                    >
                                        {layer.name}
                                    </span>
                                    {badges.map(badge => (
                                        <span
                                            key={badge}
                                            className="shrink-0 rounded border border-white/[0.08] bg-black/20 px-1 py-0.5 font-mono text-[7.5px] font-bold text-slate-400 light-theme:border-gray-200 light-theme:bg-gray-100 light-theme:text-gray-500"
                                        >
                                            {badge}
                                        </span>
                                    ))}
                                    <VisibilitySwitch
                                        label={layer.name}
                                        isVisible={isVisible}
                                        onToggle={() => onToggleCadLayer?.(layer.name)}
                                    />
                                </div>
                                <div className="mt-1.5 flex items-center gap-1.5 pl-4">
                                    {layer.description ? (
                                        <span className="min-w-0 flex-1 truncate text-[8.5px] text-slate-500 light-theme:text-gray-500" title={layer.description}>
                                            {layer.description}
                                        </span>
                                    ) : (
                                        <span className="min-w-0 flex-1" />
                                    )}
                                    {onCadLayerColorChange && (
                                        <ColorControl
                                            label={`Color for ${layer.name}`}
                                            value={colorOverride}
                                            onChange={color => onCadLayerColorChange(layer.name, color)}
                                        />
                                    )}
                                    {onCadLayerLinetypeChange ? (
                                        <select
                                            value={lineType}
                                            onChange={event => onCadLayerLinetypeChange(layer.name, event.target.value)}
                                            className="h-5 max-w-[96px] shrink-0 rounded-md border border-white/[0.09] bg-black/25 px-1 font-mono text-[8.5px] text-cyan-200 outline-none transition-colors focus:border-cyan-300/50 light-theme:border-gray-300 light-theme:bg-white light-theme:text-cyan-700"
                                            aria-label={`Linetype for ${layer.name}`}
                                            title={`Layer linetype for ${layer.name}`}
                                        >
                                            {cadLinetypeNames.map(name => (
                                                <option key={name} value={name} className="bg-[#0a0f16]">{name}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <span className="max-w-[96px] shrink-0 truncate rounded-md border border-white/[0.06] bg-black/15 px-1.5 py-0.5 font-mono text-[8.5px] text-slate-500 light-theme:border-gray-200 light-theme:bg-gray-100 light-theme:text-gray-500" title={lineType}>
                                            {lineType}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </CollapsibleSection>

                {/* ── Inclusion Boundaries (named closed inclusion polylines) ── */}
                <CollapsibleSection title="Inclusion Boundaries" badge={inclusionBoundaries.length}>
                    {inclusionBoundaries.length === 0 && (
                        <p className="px-0.5 py-1 text-[9.5px] italic leading-snug text-slate-500 light-theme:text-gray-500">
                            No inclusion boundaries yet. Run a shrinkwrap, draw an inclusion polyline,
                            or generate one in the Boundary Editor.
                        </p>
                    )}
                    {inclusionBoundaries.map(boundary => {
                        const isVisible = inclusionBoundaryVisibility[boundary.polylineId] !== false;
                        const segments = inclusionBoundarySegmentCounts[boundary.polylineId];
                        return (
                            <LayerToggle
                                key={boundary.id}
                                label={boundary.name}
                                sublabel={segments !== undefined ? `${segments} segment${segments !== 1 ? 's' : ''}` : undefined}
                                isVisible={isVisible}
                                onToggle={() => onToggleInclusionBoundary?.(boundary.id)}
                            />
                        );
                    })}
                </CollapsibleSection>

                {/* ── Point Data (point lists) ── */}
                <CollapsibleSection title="Point Data" badge={pointLists.length}>
                    {pointLists.length === 0 && (
                        <p className="px-0.5 py-1 text-[9.5px] italic leading-snug text-slate-500 light-theme:text-gray-500">
                            No point lists loaded.
                        </p>
                    )}
                    {pointLists.map(list => (
                        <LayerToggle
                            key={list.id}
                            label={list.name}
                            sublabel={`${list.points.length} point${list.points.length !== 1 ? 's' : ''}`}
                            isVisible={list.isVisible}
                            onToggle={() => onTogglePointListVisibility(list.id)}
                        />
                    ))}
                </CollapsibleSection>

                {/* ── Point Attributes ── */}
                <CollapsibleSection
                    title="Point Attributes"
                    hint="Global gate for every point style. A style can hide more labels, but it cannot force one back on here."
                >
                    <PointAttributeRow
                        label="Point number"
                        hint="PNEZD point ID"
                        color={pointLayers.pointNumber.color}
                        isVisible={pointLayers.pointNumber.visible}
                        onToggle={() => onLayerToggle('pointNumber')}
                        onColorChange={color => onLayerColorChange('pointNumber', color)}
                    />
                    <PointAttributeRow
                        label="Elevation"
                        hint="Z value"
                        color={pointLayers.elevation.color}
                        isVisible={pointLayers.elevation.visible}
                        onToggle={() => onLayerToggle('elevation')}
                        onColorChange={color => onLayerColorChange('elevation', color)}
                    />
                    <PointAttributeRow
                        label="Description"
                        hint="Field code"
                        color={pointLayers.description.color}
                        isVisible={pointLayers.description.visible}
                        onToggle={() => onLayerToggle('description')}
                        onColorChange={color => onLayerColorChange('description', color)}
                    />
                </CollapsibleSection>

                {/* ── Line Work (global toggles) ── */}
                <CollapsibleSection title="Line Work">
                    <LayerToggle label="Lines" isVisible={linesVisible} onToggle={() => onSetLinesVisible(!linesVisible)} />
                    <LayerToggle label="Centerlines" isVisible={centerlinesVisible} onToggle={() => onSetCenterlinesVisible(!centerlinesVisible)} />
                </CollapsibleSection>

                {/* ── TIN Surfaces ── */}
                <CollapsibleSection title="TIN Surfaces" badge={tinSurfaces.length}>
                    {tinSurfaces.length === 0 && (
                        <p className="px-0.5 py-1 text-[9.5px] italic leading-snug text-slate-500 light-theme:text-gray-500">
                            No imported TIN surfaces yet.
                        </p>
                    )}
                    {tinSurfaces.map(surface => (
                        <LayerToggle
                            key={surface.id}
                            label={surface.name}
                            sublabel={`${surface.vertices.length} vertices / ${surface.triangles.length} triangles`}
                            isVisible={!surface.hidden}
                            onToggle={() => onToggleTinSurfaceVisibility?.(surface.id)}
                        />
                    ))}
                </CollapsibleSection>

                {/* ── Map Overlays ── */}
                <CollapsibleSection title="Map Overlays">
                    {!hasMapOverlays && (
                        <p className="px-0.5 py-1 text-[9.5px] italic leading-snug text-slate-500 light-theme:text-gray-500">
                            No WMS or offline map overlays active.
                        </p>
                    )}
                    {offlineMapAreas.map(area => (
                        <LayerToggle
                            key={area.id}
                            label={`${area.name} (Offline)`}
                            isVisible={area.isVisible}
                            onToggle={() => onToggleOfflineMapAreaVisibility(area.id)}
                        />
                    ))}
                    {activeWmsLayers.map(layer => {
                        const service = wmsServices.find(candidate => candidate.url === layer.serviceUrl);
                        const layerInfo = service?.layers.find(candidate => candidate.name === layer.layerName);
                        return (
                            <LayerToggle
                                key={`${layer.serviceUrl}-${layer.layerName}`}
                                label={layerInfo?.title || layer.layerName}
                                isVisible={layer.isVisible}
                                onToggle={() => onToggleWmsLayer(layer.serviceUrl, layer.layerName, !layer.isVisible)}
                            />
                        );
                    })}
                </CollapsibleSection>
            </div>
        </div>
    );
};

export default LayerManagerPanel;
