import React, { useState, useMemo } from 'react';
import {
    type PointList,
    type WmsService,
    type ActiveWmsLayer,
    type OfflineMapArea,
    type TinSurface,
} from '../types.ts';
import { LayersIcon, ChevronDownIcon, ChevronUpIcon, EyeIcon, EyeSlashIcon } from './icons.tsx';

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
    onToggleCadLayer?: (layerName: string) => void;
    onCadLayerColorChange?: (layerName: string, color: string) => void;
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

const CollapsibleSection: React.FC<{ title: string; badge?: number; children: React.ReactNode }> = ({ title, badge, children }) => {
    const [isOpen, setIsOpen] = useState(true);
    return (
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 light-theme:bg-gray-100/50 light-theme:border-gray-300">
            <button
                className="w-full flex justify-between items-center p-3 text-left"
                onClick={() => setIsOpen(!isOpen)}
            >
                <h4 className="font-semibold text-gray-200 light-theme:text-gray-800 flex items-center gap-2">
                    {title}
                    {badge !== undefined && (
                        <span className="text-xs font-normal bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded-full">{badge}</span>
                    )}
                </h4>
                {isOpen ? <ChevronUpIcon className="w-5 h-5 text-gray-400" /> : <ChevronDownIcon className="w-5 h-5 text-gray-400" />}
            </button>
            {isOpen && (
                <div className="p-3 border-t border-gray-700/50 space-y-2 light-theme:border-gray-300/50">
                    {children}
                </div>
            )}
        </div>
    );
};

const LayerToggle: React.FC<{ label: string; sublabel?: string; isVisible: boolean; onToggle: () => void; children?: React.ReactNode }> = ({ label, sublabel, isVisible, onToggle, children }) => (
    <div className="flex items-center justify-between p-2 bg-gray-700/40 rounded-md hover:bg-gray-700/60 light-theme:bg-gray-200/40 light-theme:hover:bg-gray-200/60">
        <div className="flex flex-col min-w-0 mr-2">
            <span className="text-sm truncate font-mono" title={label}>{label}</span>
            {sublabel && <span className="text-xs text-gray-500 truncate">{sublabel}</span>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
            {children}
            <button onClick={onToggle} className="p-1.5 rounded-full" title={isVisible ? 'Hide Layer' : 'Show Layer'}>
                {isVisible ? <EyeIcon className="w-5 h-5 text-yellow-400" /> : <EyeSlashIcon className="w-5 h-5 text-gray-500" />}
            </button>
        </div>
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
        onToggleCadLayer,
        onCadLayerColorChange,
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

    return (
        <div className="w-full h-full bg-gray-900 flex flex-col rounded-md overflow-hidden light-theme:bg-white">
            {!hideHeader && (
                <header className="flex-shrink-0 p-4 bg-gray-800/40 backdrop-blur border-b border-gray-700/30 light-theme:bg-gray-50/40 light-theme:border-gray-300/30">
                    <h3 className="text-xl font-semibold text-gray-300 flex items-center gap-2 light-theme:text-gray-700">
                        <LayersIcon className="w-6 h-6 text-cyan-400" />
                        Data Visibility
                    </h3>
                    <p className="text-sm text-gray-400 mt-1">Control visibility of canvas layers, data, and overlays.</p>
                </header>
            )}

            <div className="flex-grow overflow-auto p-4 space-y-4">

                {/* ── CAD Layers (SSOT from CAD Manager) ── */}
                <CollapsibleSection title="CAD Layers" badge={cadLayerCount}>
                    {cadLayerCount === 0 ? (
                        <p className="text-xs text-gray-500 italic px-1">
                            No CAD standard loaded. Upload a standard in CAD Manager to see layer controls here.
                            Default layers appear automatically as agents generate geometry.
                        </p>
                    ) : null}
                    {effectiveCadLayers.map(layer => {
                        const isVisible = cadLayerVisibility[layer.name] !== false;
                        const colorOverride = cadLayerColors[layer.name] || BUILTIN_LAYER_COLORS[layer.name];
                        const badges: string[] = [];
                        if (layer.isPointLayer) badges.push('PT');
                        if (layer.isLineLayer) badges.push('LN');
                        return (
                            <div key={layer.name}
                                className="flex items-center justify-between p-2 bg-gray-700/40 rounded-md hover:bg-gray-700/60 light-theme:bg-gray-200/40"
                            >
                                <div className="flex flex-col min-w-0 mr-2 flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <span className={`text-sm font-mono truncate ${isVisible ? 'text-gray-200' : 'text-gray-500 line-through'}`} title={layer.name}>
                                            {layer.name}
                                        </span>
                                        {badges.map(b => (
                                            <span key={b} className="text-xs bg-gray-600 text-gray-300 px-1 rounded shrink-0">{b}</span>
                                        ))}
                                    </div>
                                    {layer.description && (
                                        <span className="text-xs text-gray-500 truncate">{layer.description}</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    {onCadLayerColorChange && (
                                        <input
                                            type="color"
                                            value={colorOverride || '#ffffff'}
                                            onChange={e => onCadLayerColorChange(layer.name, e.target.value)}
                                            className="w-6 h-6 bg-transparent border-none cursor-pointer rounded"
                                            title={`Color for ${layer.name}`}
                                        />
                                    )}
                                    <button
                                        onClick={() => onToggleCadLayer?.(layer.name)}
                                        className="p-1.5 rounded-full"
                                        title={isVisible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                                    >
                                        {isVisible
                                            ? <EyeIcon className="w-5 h-5 text-yellow-400" />
                                            : <EyeSlashIcon className="w-5 h-5 text-gray-500" />}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </CollapsibleSection>

                {/* ── Inclusion Boundaries (named closed inclusion polylines) ── */}
                <CollapsibleSection title="Inclusion Boundaries" badge={inclusionBoundaries.length}>
                    {inclusionBoundaries.length === 0 && (
                        <p className="text-xs text-gray-500 italic px-1">
                            No inclusion boundaries yet. Run a shrinkwrap, draw an inclusion polyline,
                            or generate one in the Boundary Editor.
                        </p>
                    )}
                    {inclusionBoundaries.map(b => {
                        const isVisible = inclusionBoundaryVisibility[b.polylineId] !== false;
                        const segs = inclusionBoundarySegmentCounts[b.polylineId];
                        return (
                            <LayerToggle
                                key={b.id}
                                label={b.name}
                                sublabel={segs !== undefined ? `${segs} segment${segs !== 1 ? 's' : ''}` : undefined}
                                isVisible={isVisible}
                                onToggle={() => onToggleInclusionBoundary?.(b.id)}
                            />
                        );
                    })}
                </CollapsibleSection>

                {/* ── Point Data (point lists) ── */}
                <CollapsibleSection title="Point Data" badge={pointLists.length}>
                    {pointLists.length === 0 && (
                        <p className="text-xs text-gray-500 italic px-1">No point lists loaded.</p>
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
                <CollapsibleSection title="Point Attributes">
                    <div className="flex items-center justify-between p-2 bg-gray-700/40 rounded-md hover:bg-gray-700/60 light-theme:bg-gray-200/40 light-theme:hover:bg-gray-200/60">
                        <span className="text-sm">Point Number</span>
                        <div className="flex items-center gap-2">
                            <input type="color" value={pointLayers.pointNumber.color} onChange={(e) => onLayerColorChange('pointNumber', e.target.value)} className="w-6 h-6 bg-transparent border-none cursor-pointer" />
                            <button onClick={() => onLayerToggle('pointNumber')} className="p-1.5 rounded-full" title={pointLayers.pointNumber.visible ? 'Hide' : 'Show'}>
                                {pointLayers.pointNumber.visible ? <EyeIcon className="w-5 h-5 text-yellow-400" /> : <EyeSlashIcon className="w-5 h-5 text-gray-500" />}
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-gray-700/40 rounded-md hover:bg-gray-700/60 light-theme:bg-gray-200/40 light-theme:hover:bg-gray-200/60">
                        <span className="text-sm">Elevation</span>
                        <div className="flex items-center gap-2">
                            <input type="color" value={pointLayers.elevation.color} onChange={(e) => onLayerColorChange('elevation', e.target.value)} className="w-6 h-6 bg-transparent border-none cursor-pointer" />
                            <button onClick={() => onLayerToggle('elevation')} className="p-1.5 rounded-full" title={pointLayers.elevation.visible ? 'Hide' : 'Show'}>
                                {pointLayers.elevation.visible ? <EyeIcon className="w-5 h-5 text-yellow-400" /> : <EyeSlashIcon className="w-5 h-5 text-gray-500" />}
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-gray-700/40 rounded-md hover:bg-gray-700/60 light-theme:bg-gray-200/40 light-theme:hover:bg-gray-200/60">
                        <span className="text-sm">Description</span>
                        <div className="flex items-center gap-2">
                            <input type="color" value={pointLayers.description.color} onChange={(e) => onLayerColorChange('description', e.target.value)} className="w-6 h-6 bg-transparent border-none cursor-pointer" />
                            <button onClick={() => onLayerToggle('description')} className="p-1.5 rounded-full" title={pointLayers.description.visible ? 'Hide' : 'Show'}>
                                {pointLayers.description.visible ? <EyeIcon className="w-5 h-5 text-yellow-400" /> : <EyeSlashIcon className="w-5 h-5 text-gray-500" />}
                            </button>
                        </div>
                    </div>
                </CollapsibleSection>

                {/* ── Line Work (global toggles) ── */}
                <CollapsibleSection title="Line Work">
                    <LayerToggle label="Lines" isVisible={linesVisible} onToggle={() => onSetLinesVisible(!linesVisible)} />
                    <LayerToggle label="Centerlines" isVisible={centerlinesVisible} onToggle={() => onSetCenterlinesVisible(!centerlinesVisible)} />
                </CollapsibleSection>

                {/* ── TIN Surfaces ── */}
                <CollapsibleSection title="TIN Surfaces" badge={tinSurfaces.length}>
                    {tinSurfaces.length === 0 && (
                        <p className="text-xs text-gray-500 italic px-1">No imported TIN surfaces yet.</p>
                    )}
                    {tinSurfaces.map(surface => (
                        <LayerToggle
                            key={surface.id}
                            label={surface.name}
                            sublabel={`${surface.vertices.length} vertices · ${surface.triangles.length} triangles`}
                            isVisible={!surface.hidden}
                            onToggle={() => onToggleTinSurfaceVisibility?.(surface.id)}
                        />
                    ))}
                </CollapsibleSection>

                {/* ── Map Overlays ── */}
                <CollapsibleSection title="Map Overlays">
                    {offlineMapAreas.map(area => (
                        <LayerToggle
                            key={area.id}
                            label={`${area.name} (Offline)`}
                            isVisible={area.isVisible}
                            onToggle={() => onToggleOfflineMapAreaVisibility(area.id)}
                        />
                    ))}
                    {activeWmsLayers.map(layer => {
                        const service = wmsServices.find(s => s.url === layer.serviceUrl);
                        const layerInfo = service?.layers.find(l => l.name === layer.layerName);
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
