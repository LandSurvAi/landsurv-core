import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ContourIcon, ProfileIcon, DownloadIcon, SlopeIcon } from './icons.tsx';
import { type ContourSettings, type ProfilePoint, type ProfileInfo, type EsriServiceInfo } from '../types.ts';
import { ESRI_STATE_SERVICES } from '../utils/esriStateServices.ts';
import { useDocumentScrollLock } from '../hooks/useDocumentScrollLock.ts';

interface ContourPanelProps {
  settings: ContourSettings;
  onSettingsChange: (settings: ContourSettings) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  /** Called when user clicks "Discover Public Services" with their search term */
  onDiscoverPublicServices?: (searchTerm: string) => void;
  isDiscovering?: boolean;
  discoveredServices?: EsriServiceInfo[];
  /** Whether at least one inclusion boundary line exists on the canvas */
  hasInclusionBoundary?: boolean;
  /** Number of inclusion line segments drawn */
  inclusionSegmentCount?: number;
  /** Number of breakline segments drawn */
  breaklineCount?: number;
  /** Number of exclusion zone segments drawn */
  exclusionSegmentCount?: number;
  /** Whether an ESRI fetch is currently in progress */
  isFetchingEsri?: boolean;
  /** Fetch contours from a pinned ESRI service for a given area */
  onFetchEsriContours?: (serviceUrl: string, mode: 'inclusion' | 'description', descriptionText?: string) => void;
  /** When true, scroll the ESRI / GIS contour-source section into view on mount. */
  autoOpenGisSelector?: boolean;
  /** Called after the GIS selector has been scrolled into view so the parent can reset its flag. */
  onGisSelectorOpened?: () => void;
}

export const ContourPanel: React.FC<ContourPanelProps> = ({ settings, onSettingsChange, onGenerate, isGenerating, onDiscoverPublicServices, isDiscovering = false, discoveredServices = [], hasInclusionBoundary = false, inclusionSegmentCount = 0, breaklineCount = 0, exclusionSegmentCount = 0, isFetchingEsri = false, onFetchEsriContours, autoOpenGisSelector = false, onGisSelectorOpened }) => {
  useDocumentScrollLock(true);

  const esriSectionRef = useRef<HTMLDivElement>(null);

  // Scroll to the ESRI / GIS section when the parent requests it ("From GIS" CTA).
  useEffect(() => {
    if (!autoOpenGisSelector) return;
    const t = setTimeout(() => {
      esriSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      onGisSelectorOpened?.();
    }, 100);
    return () => clearTimeout(t);
  }, [autoOpenGisSelector, onGisSelectorOpened]);
  const [esriUrlInput, setEsriUrlInput] = useState('');
  const [discoverSearchTerm, setDiscoverSearchTerm] = useState('');
  const [selectedStateAbbr, setSelectedStateAbbr] = useState('');
  const selectedStateEntry = ESRI_STATE_SERVICES.find(s => s.abbr === selectedStateAbbr) ?? null;
  // Per-URL download panel state
  const [fetchOpenUrl, setFetchOpenUrl] = useState<string | null>(null);
  const [fetchMode, setFetchMode] = useState<'inclusion' | 'description'>('inclusion');
  const [fetchDescription, setFetchDescription] = useState('');
  // Inline layer browser for the URL input field
  const [browseStatus, setBrowseStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [browsedLayers, setBrowsedLayers] = useState<Array<{ id: number; name: string; type: string }>>([]);
  const [browseError, setBrowseError] = useState('');

  /** Strip a trailing layer index (e.g. /MapServer/0 → /MapServer) */
  const stripLayerIndex = (url: string) => url.replace(/\/\d+\s*$/, '');

  const handleBrowseLayers = async () => {
    const base = stripLayerIndex(esriUrlInput.trim());
    setBrowseStatus('loading');
    setBrowsedLayers([]);
    setBrowseError('');
    try {
      const resp = await fetch(`${base}?f=json`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const layers: Array<{ id: number; name: string; type: string }> = (data.layers ?? []).map(
        (l: { id: number; name: string; type?: string }) => ({ id: l.id, name: l.name, type: l.type ?? 'Feature Layer' })
      );
      if (layers.length === 0) throw new Error('No sub-layers found. You can add this URL directly via the Add button.');
      setBrowsedLayers(layers);
      setBrowseStatus('done');
    } catch (err) {
      setBrowseError(err instanceof Error ? err.message : String(err));
      setBrowseStatus('error');
    }
  };

  const handlePinLayerFromBrowse = (layerId: number) => {
    const base = stripLayerIndex(esriUrlInput.trim());
    const layerUrl = `${base}/${layerId}`;
    const existing = settings.esriServiceUrls ?? [];
    if (!existing.includes(layerUrl)) {
      onSettingsChange({ ...settings, esriServiceUrls: [...existing, layerUrl] });
    }
  };

  const handleAddEsriUrl = () => {
    const url = esriUrlInput.trim();
    if (!url) return;
    const existing = settings.esriServiceUrls ?? [];
    if (existing.includes(url)) return;
    onSettingsChange({ ...settings, esriServiceUrls: [...existing, url] });
    setEsriUrlInput('');
  };

  const handleRemoveEsriUrl = (url: string) => {
    onSettingsChange({ ...settings, esriServiceUrls: (settings.esriServiceUrls ?? []).filter(u => u !== url) });
  };

  const handleAddDiscoveredService = (svc: EsriServiceInfo) => {
    const existing = settings.esriServiceUrls ?? [];
    if (existing.includes(svc.url)) return;
    onSettingsChange({ ...settings, esriServiceUrls: [...existing, svc.url] });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    onSettingsChange({
      ...settings,
      [name]: type === 'checkbox' ? checked : (type === 'number' || type === 'range' ? parseFloat(value) : value),
    });
  };

  return (
    <div className="w-full h-full bg-gray-800 text-sm text-gray-300 flex flex-col p-4 light-theme:bg-gray-50 light-theme:text-gray-600">
      <h3 className="text-lg font-semibold text-amber-400 mb-4 flex-shrink-0">Contour Generation</h3>
      <div className="flex-grow overflow-y-auto space-y-4 pr-2">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="contourInterval" className="block text-xs font-medium text-gray-400 mb-1">Contour Interval (ft)</label>
            <input
              type="number"
              id="contourInterval"
              name="contourInterval"
              value={settings.contourInterval}
              onChange={handleInputChange}
              min="0.1"
              step="0.1"
              className="w-full p-2 text-sm bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 light-theme:bg-white light-theme:border-gray-300"
            />
          </div>
          <div>
            <label htmlFor="majorInterval" className="block text-xs font-medium text-gray-400 mb-1">Major Interval (ft)</label>
            <input
              type="number"
              id="majorInterval"
              name="majorInterval"
              value={settings.majorInterval}
              onChange={handleInputChange}
              min="1"
              step="1"
              className="w-full p-2 text-sm bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 light-theme:bg-white light-theme:border-gray-300"
            />
          </div>
        </div>
        <div>
          <label htmlFor="pointFilterDescription" className="block text-xs font-medium text-gray-400 mb-1">Point Description Filter (Optional)</label>
          <input
            type="text"
            id="pointFilterDescription"
            name="pointFilterDescription"
            value={settings.pointFilterDescription}
            onChange={handleInputChange}
            placeholder="e.g., GROUND, TOPO"
            className="w-full p-2 text-sm bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 light-theme:bg-white light-theme:border-gray-300"
          />
        </div>
        <div>
          <label htmlFor="smoothing" className="block text-xs font-medium text-gray-400 mb-1">Curve Subdivision Level: {settings.smoothing}</label>
          <input
            type="range"
            id="smoothing"
            name="smoothing"
            min="0"
            max="4"
            step="1"
            value={settings.smoothing}
            onChange={handleInputChange}
            className="w-full accent-amber-500"
            title={`Smoothing Level: ${settings.smoothing}`}
          />
          <div className="flex justify-between text-xs text-gray-500 px-1">
            <span>Sharp</span>
            <span>Smooth</span>
          </div>
        </div>
        <div>
            <label className="flex items-center gap-2 cursor-pointer">
                <input
                    type="checkbox"
                    name="showLabels"
                    checked={settings.showLabels}
                    onChange={handleInputChange}
                    className="w-4 h-4 rounded accent-amber-500"
                />
                <span className="text-xs font-medium text-gray-400">Show Contour Labels</span>
            </label>
        </div>
        <div>
            <label htmlFor="labelDensity" className="block text-xs font-medium text-gray-400 mb-1">Label Density: {settings.labelDensity?.toFixed(2) || '0.50'}</label>
            <input
                type="range"
                id="labelDensity"
                name="labelDensity"
                min="0.1"
                max="2"
                step="0.1"
                value={settings.labelDensity || 0.5}
                onChange={handleInputChange}
                className="w-full accent-amber-500"
                title={`Label Density: ${settings.labelDensity?.toFixed(2) || '0.50'}`}
                disabled={!settings.showLabels}
            />
        </div>
        <div>
            <label htmlFor="labelScale" className="block text-xs font-medium text-gray-400 mb-1">Label Scale: {settings.labelScale?.toFixed(1) || '1.0'}x</label>
            <input
                type="range"
                id="labelScale"
                name="labelScale"
                min="0.5"
                max="3"
                step="0.1"
                value={settings.labelScale || 1}
                onChange={handleInputChange}
                className="w-full accent-amber-500"
                title={`Label Scale: ${settings.labelScale?.toFixed(1) || '1.0'}x`}
                disabled={!settings.showLabels}
            />
            <div className="flex justify-between text-xs text-gray-500 px-1">
                <span>Small</span>
                <span>Large</span>
            </div>
        </div>
      </div>

      {/* ── Contour Constraints Status ────────────────────────────────── */}
      <div className="flex-shrink-0 mt-4 rounded border border-gray-700/60 bg-gray-700/20 p-2.5 space-y-1.5">
        <div className="text-[10px] uppercase font-semibold tracking-wide text-gray-400 mb-1">Active Constraints</div>
        {/* Breaklines */}
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${breaklineCount > 0 ? 'bg-yellow-400' : 'bg-gray-600'}`} />
          <span className={`text-xs flex-1 ${breaklineCount > 0 ? 'text-yellow-300' : 'text-gray-500'}`}>
            Breaklines
          </span>
          {breaklineCount > 0
            ? <span className="text-[10px] font-mono text-yellow-400/80 bg-yellow-900/30 px-1.5 py-0.5 rounded">{breaklineCount} seg{breaklineCount !== 1 ? 's' : ''}</span>
            : <span className="text-[10px] text-gray-600">none — draw with Breakline tool</span>
          }
        </div>
        {/* Inclusion zone */}
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${inclusionSegmentCount > 0 ? 'bg-green-400' : 'bg-gray-600'}`} />
          <span className={`text-xs flex-1 ${inclusionSegmentCount > 0 ? 'text-green-300' : 'text-gray-500'}`}>
            Inclusion Zone
          </span>
          {inclusionSegmentCount > 0
            ? <span className="text-[10px] font-mono text-green-400/80 bg-green-900/30 px-1.5 py-0.5 rounded">{inclusionSegmentCount} seg{inclusionSegmentCount !== 1 ? 's' : ''}</span>
            : <span className="text-[10px] text-gray-600">none — draw with Inclusion tool</span>
          }
        </div>
        {/* Exclusion zone */}
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${exclusionSegmentCount > 0 ? 'bg-rose-400' : 'bg-gray-600'}`} />
          <span className={`text-xs flex-1 ${exclusionSegmentCount > 0 ? 'text-rose-300' : 'text-gray-500'}`}>
            Exclusion Zone
          </span>
          {exclusionSegmentCount > 0
            ? <span className="text-[10px] font-mono text-rose-400/80 bg-rose-900/30 px-1.5 py-0.5 rounded">{exclusionSegmentCount} seg{exclusionSegmentCount !== 1 ? 's' : ''}</span>
            : <span className="text-[10px] text-gray-600">none — draw with Exclusion tool</span>
          }
        </div>
        {inclusionSegmentCount > 0 && (
          <p className="text-[9px] text-green-500/70 pt-0.5 border-t border-gray-700/40">
            Only points inside the inclusion zone will be triangulated.
          </p>
        )}
        {exclusionSegmentCount > 0 && (
          <p className="text-[9px] text-rose-500/70 pt-0.5 border-t border-gray-700/40">
            Points inside exclusion zones are removed from the TIN.
          </p>
        )}
      </div>

      <div className="flex-shrink-0 mt-3">
        <button
          onClick={onGenerate}
          disabled={isGenerating}
          className="w-full py-2 bg-amber-600 text-white font-semibold rounded-md hover:bg-amber-700 transition-colors text-sm disabled:bg-gray-600 flex items-center justify-center gap-2"
        >
          <ContourIcon className="w-5 h-5"/>
          {isGenerating ? 'Generating...' : 'Generate Contours'}
        </button>
      </div>

      {/* ── ESRI REST Contour Services ─────────────────────────────── */}
      <div ref={esriSectionRef} className="flex-shrink-0 mt-5 border-t border-amber-700/30 pt-4 space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-400/80">
          ESRI REST Contour Services
        </h4>

        {/* ── State Services picker ─────────────────────────────────── */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-gray-400">
            Select State
          </label>
          <select
            value={selectedStateAbbr}
            onChange={e => setSelectedStateAbbr(e.target.value)}
            className="w-full p-2 text-xs bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-200"
          >
            <option value="">— Choose a state —</option>
            {ESRI_STATE_SERVICES.map(s => (
              <option key={s.abbr} value={s.abbr}>
                {s.abbr} — {s.state}{s.layers.length > 0 ? ' ✓' : ''}
              </option>
            ))}
          </select>

          {/* State has live layers */}
          {selectedStateEntry && selectedStateEntry.layers.length > 0 && (
            <div className="space-y-1.5">
              {selectedStateEntry.layers.map(layer => {
                const alreadyPinned = (settings.esriServiceUrls ?? []).includes(layer.url);
                return (
                  <div key={layer.url} className="rounded border border-amber-700/40 bg-gray-700/40 px-2.5 py-2">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-amber-200">{layer.name}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          {layer.intervalFt != null && <span className="mr-2">{layer.intervalFt}ft interval</span>}
                          <span>{layer.attribution}</span>
                        </div>
                        {layer.notes && (
                          <div className="text-[10px] text-gray-500 mt-0.5 italic">{layer.notes}</div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!alreadyPinned) {
                            onSettingsChange({ ...settings, esriServiceUrls: [...(settings.esriServiceUrls ?? []), layer.url] });
                          }
                        }}
                        disabled={alreadyPinned}
                        className={`flex-shrink-0 text-[10px] px-2.5 py-1 rounded border transition-colors ${
                          alreadyPinned
                            ? 'bg-green-900/20 border-green-700/30 text-green-400 cursor-default'
                            : 'bg-amber-700/50 hover:bg-amber-600/60 border-amber-600/50 text-amber-200'
                        }`}
                      >
                        {alreadyPinned ? '✓ Pinned' : 'Pin'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* State selected but no layers yet */}
          {selectedStateEntry && selectedStateEntry.layers.length === 0 && (
            <div className="rounded border border-gray-600/50 bg-gray-800/50 px-2.5 py-2 space-y-1">
              <div className="text-[10px] text-gray-400">
                <span className="text-amber-400/80 font-medium">{selectedStateEntry.state}</span> — live service not yet configured.
              </div>
              {selectedStateEntry.portalUrl ? (
                <div className="text-[10px] text-gray-500">
                  Browse their GIS portal to find a contour MapServer URL, then paste it in the custom URL field below.
                  {' '}
                  <a
                    href={selectedStateEntry.portalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-400/80 hover:text-amber-300 underline"
                  >
                    Open {selectedStateEntry.abbr} GIS Portal →
                  </a>
                </div>
              ) : (
                <div className="text-[10px] text-gray-500">Use the custom URL field below to add a service manually.</div>
              )}
            </div>
          )}
        </div>

        {/* ── Custom URL input ──────────────────────────────────────── */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Custom Service URL
          </label>
          <div className="flex gap-2">
            <input
              type="url"
              value={esriUrlInput}
              onChange={e => { setEsriUrlInput(e.target.value); setBrowseStatus('idle'); setBrowsedLayers([]); setBrowseError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleAddEsriUrl()}
              placeholder="https://…/arcgis/rest/services/…/MapServer"
              className="flex-1 p-2 text-xs bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-200 placeholder-gray-500"
            />
            <button
              type="button"
              onClick={handleBrowseLayers}
              disabled={!esriUrlInput.trim() || browseStatus === 'loading'}
              className="px-3 py-1 text-xs bg-amber-800/60 hover:bg-amber-700/70 text-amber-200 rounded-md border border-amber-600/50 disabled:opacity-40 transition-colors flex items-center gap-1.5"
              title="Probe the service to list available sub-layers"
            >
              {browseStatus === 'loading'
                ? <><span className="w-3 h-3 border border-amber-300 border-t-transparent rounded-full animate-spin" />Browsing…</>
                : 'Browse Layers'}
            </button>
            <button
              type="button"
              onClick={handleAddEsriUrl}
              disabled={!esriUrlInput.trim()}
              className="px-3 py-1 text-xs bg-amber-700/60 hover:bg-amber-600/70 text-amber-200 rounded-md border border-amber-600/50 disabled:opacity-40 transition-colors"
            >
              Add
            </button>
          </div>
          <p className="text-[10px] text-gray-500 mt-1">
            Paste any ArcGIS REST MapServer URL and click <span className="text-amber-400/80">Browse Layers</span> to pick a sub-layer, or paste a full layer URL (/MapServer/0) and click <span className="text-amber-400/80">Add</span>.
          </p>

          {/* Layer browser result panel */}
          {browseStatus === 'error' && (
            <div className="mt-2 rounded border border-rose-700/40 bg-rose-950/30 px-2 py-1.5 text-[10px] text-rose-300">
              ⚠ {browseError}
            </div>
          )}
          {browseStatus === 'done' && browsedLayers.length > 0 && (
            <div className="mt-2 rounded border border-amber-700/30 bg-gray-800/60 overflow-hidden">
              <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-amber-400/70 font-semibold border-b border-amber-700/20 flex items-center justify-between">
                <span>{browsedLayers.length} layer{browsedLayers.length !== 1 ? 's' : ''} found</span>
                <button
                  type="button"
                  onClick={() => { setBrowseStatus('idle'); setBrowsedLayers([]); }}
                  className="text-gray-500 hover:text-gray-300 text-xs"
                  title="Close"
                >✕</button>
              </div>
              <div className="max-h-52 overflow-y-auto divide-y divide-gray-700/40">
                {browsedLayers.map(layer => {
                  const layerUrl = `${stripLayerIndex(esriUrlInput.trim())}/${layer.id}`;
                  const alreadyPinned = (settings.esriServiceUrls ?? []).includes(layerUrl);
                  return (
                    <div key={layer.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-700/30 transition-colors">
                      <div className="w-6 text-right text-[10px] text-gray-500 font-mono flex-shrink-0">{layer.id}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-amber-200/90 truncate" title={layer.name}>{layer.name}</div>
                        <div className="text-[9px] text-gray-500">{layer.type}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handlePinLayerFromBrowse(layer.id)}
                        disabled={alreadyPinned}
                        className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded border transition-colors ${
                          alreadyPinned
                            ? 'bg-green-900/20 border-green-700/30 text-green-500 cursor-default'
                            : 'bg-amber-700/40 hover:bg-amber-600/50 border-amber-600/40 text-amber-200'
                        }`}
                      >
                        {alreadyPinned ? '✓ Pinned' : 'Pin'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Pinned service list with per-URL download panel */}
        {(settings.esriServiceUrls ?? []).length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Pinned Services</div>
            {(settings.esriServiceUrls ?? []).map(url => {
              const isOpen = fetchOpenUrl === url;
              return (
                <div key={url} className="rounded border border-gray-700/60 bg-gray-700/30">
                  {/* URL row */}
                  <div className="flex items-center gap-1 px-2 py-1.5">
                    <span className="flex-1 text-[10px] font-mono text-amber-300/80 truncate" title={url}>{url}</span>
                    {onFetchEsriContours && (
                      <button
                        type="button"
                        onClick={() => setFetchOpenUrl(isOpen ? null : url)}
                        className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded border transition-colors ${
                          isOpen
                            ? 'bg-teal-700/50 border-teal-500/50 text-teal-200'
                            : 'bg-gray-600/50 border-gray-500/40 text-gray-300 hover:border-teal-500/50 hover:text-teal-300'
                        }`}
                        title="Download contours from this service"
                      >
                        {isOpen ? 'Cancel' : '↓ Download'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { handleRemoveEsriUrl(url); if (fetchOpenUrl === url) setFetchOpenUrl(null); }}
                      className="text-gray-500 hover:text-rose-400 text-xs flex-shrink-0 transition-colors ml-0.5"
                      title="Remove"
                    >✕</button>
                  </div>

                  {/* Expanded download panel */}
                  {isOpen && onFetchEsriContours && (
                    <div className="border-t border-gray-600/50 px-3 py-2.5 space-y-2.5 bg-gray-800/50">
                      {/* Mode selector */}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setFetchMode('inclusion')}
                          className={`flex-1 text-[10px] py-1 rounded border transition-colors ${
                            fetchMode === 'inclusion'
                              ? 'bg-green-700/40 border-green-500/50 text-green-200'
                              : 'bg-gray-700/40 border-gray-600/40 text-gray-400 hover:text-gray-200'
                          }`}
                        >
                          Inclusion Boundary
                        </button>
                        <button
                          type="button"
                          onClick={() => setFetchMode('description')}
                          className={`flex-1 text-[10px] py-1 rounded border transition-colors ${
                            fetchMode === 'description'
                              ? 'bg-blue-700/40 border-blue-500/50 text-blue-200'
                              : 'bg-gray-700/40 border-gray-600/40 text-gray-400 hover:text-gray-200'
                          }`}
                        >
                          Describe Area
                        </button>
                      </div>

                      {/* Inclusion mode info */}
                      {fetchMode === 'inclusion' && (
                        <div className={`text-[10px] rounded px-2 py-1.5 border ${
                          hasInclusionBoundary
                            ? 'bg-green-900/20 border-green-700/40 text-green-300'
                            : 'bg-yellow-900/20 border-yellow-700/40 text-yellow-400'
                        }`}>
                          {hasInclusionBoundary
                            ? `✓ Inclusion boundary detected (${inclusionSegmentCount} segment${inclusionSegmentCount !== 1 ? 's' : ''})`
                            : '⚠ No inclusion line drawn — use the canvas toolbar to draw an inclusion boundary first'}
                        </div>
                      )}

                      {/* Description mode input */}
                      {fetchMode === 'description' && (
                        <div className="space-y-1">
                          <input
                            type="text"
                            value={fetchDescription}
                            onChange={e => setFetchDescription(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && fetchDescription.trim()) {
                                onFetchEsriContours(url, 'description', fetchDescription.trim());
                              }
                            }}
                            placeholder="e.g. Lancaster County PA, downtown Philadelphia…"
                            className="w-full p-2 text-xs bg-gray-700 border border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-200 placeholder-gray-500"
                          />
                          <p className="text-[10px] text-gray-500">
                            Area will be geocoded via OpenStreetMap to build the bounding box.
                          </p>
                        </div>
                      )}

                      {/* Download button */}
                      <button
                        type="button"
                        onClick={() => {
                          if (fetchMode === 'inclusion') {
                            onFetchEsriContours(url, 'inclusion');
                          } else {
                            onFetchEsriContours(url, 'description', fetchDescription.trim());
                          }
                        }}
                        disabled={
                          isFetchingEsri ||
                          (fetchMode === 'inclusion' && !hasInclusionBoundary) ||
                          (fetchMode === 'description' && !fetchDescription.trim())
                        }
                        className="w-full py-1.5 text-xs font-semibold rounded border bg-teal-700/50 hover:bg-teal-600/60 text-teal-100 border-teal-600/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                      >
                        {isFetchingEsri ? (
                          <><span className="w-3 h-3 border border-teal-300 border-t-transparent rounded-full animate-spin" />Fetching…</>
                        ) : (
                          '↓ Download Contours'
                        )}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Discover public services */}
        {onDiscoverPublicServices && (
          <div className="border border-amber-700/20 rounded-md p-3 bg-amber-950/10 space-y-2">
            <div className="text-[10px] uppercase tracking-wide text-amber-400/70 font-semibold">
              Discover Public Services
            </div>
            <p className="text-[10px] text-gray-500 leading-snug">
              Search for publicly available ESRI REST contour &amp; elevation services by state, county, or country.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={discoverSearchTerm}
                onChange={e => setDiscoverSearchTerm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && discoverSearchTerm.trim() && onDiscoverPublicServices(discoverSearchTerm.trim())}
                placeholder="e.g. Pennsylvania, Lancaster County PA…"
                className="flex-1 p-2 text-xs bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-200 placeholder-gray-500"
              />
              <button
                type="button"
                onClick={() => discoverSearchTerm.trim() && onDiscoverPublicServices(discoverSearchTerm.trim())}
                disabled={!discoverSearchTerm.trim() || isDiscovering}
                className="px-3 py-1 text-xs bg-teal-700/50 hover:bg-teal-600/60 text-teal-200 rounded-md border border-teal-600/40 disabled:opacity-40 transition-colors flex items-center gap-1.5"
              >
                {isDiscovering ? (
                  <>
                    <span className="w-3 h-3 border border-teal-300 border-t-transparent rounded-full animate-spin" />
                    Searching…
                  </>
                ) : (
                  'Discover'
                )}
              </button>
            </div>

            {discoveredServices.length > 0 && (
              <div className="space-y-1 mt-1 max-h-40 overflow-y-auto pr-1">
                <div className="text-[10px] text-gray-500 mb-1">{discoveredServices.length} service{discoveredServices.length !== 1 ? 's' : ''} found</div>
                {discoveredServices.map((svc, i) => (
                  <div key={i} className="flex items-start gap-2 bg-gray-700/30 rounded px-2 py-1.5 border border-gray-700/50">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-amber-200/90 font-medium truncate">{svc.name}</div>
                      <div className="text-[10px] text-gray-500 truncate">{svc.region}{svc.dataType ? ` · ${svc.dataType}` : ''}{svc.resolution ? ` · ${svc.resolution}` : ''}</div>
                      <div className="text-[10px] font-mono text-gray-600 truncate">{svc.url}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddDiscoveredService(svc)}
                      disabled={(settings.esriServiceUrls ?? []).includes(svc.url)}
                      className="flex-shrink-0 text-[10px] px-1.5 py-0.5 bg-amber-700/50 hover:bg-amber-600/60 text-amber-200 rounded border border-amber-600/40 disabled:opacity-40 transition-colors"
                    >
                      {(settings.esriServiceUrls ?? []).includes(svc.url) ? 'Added' : '+ Add'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

interface ProfilePanelProps {
  profileData: ProfilePoint[];
  profileInfo: ProfileInfo | null;
  onSaveProfile: () => void;
}

export const ProfilePanel: React.FC<ProfilePanelProps> = ({ profileData, profileInfo, onSaveProfile }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const lastPanPos = useRef({ x: 0, y: 0 });
  const [showSlopes, setShowSlopes] = useState(true);
  const [verticalExaggeration, setVerticalExaggeration] = useState(1); // 1 = normal, 5 = 5x flatter, 10 = 10x flatter

  const dataBounds = useMemo(() => {
    if (!profileData || profileData.length === 0) {
      return null;
    }
    let minStation = Infinity, maxStation = -Infinity, minElev = Infinity, maxElev = -Infinity;
    profileData.forEach(p => {
      minStation = Math.min(minStation, p.station);
      maxStation = Math.max(maxStation, p.station);
      minElev = Math.min(minElev, p.elevation);
      maxElev = Math.max(maxElev, p.elevation);
    });
    
    let stationRange = maxStation - minStation;
    let elevRange = maxElev - minElev;

    if (stationRange < 1) stationRange = 10;
    if (elevRange < 1) elevRange = 10;
    
    return { minStation, maxStation, minElev, maxElev, stationRange, elevRange };
  }, [profileData]);

  const zoomExtents = useCallback(() => {
    const container = containerRef.current;
    if (!container || !dataBounds) return;

    const axisPadding = { top: 20, right: 20, bottom: 50, left: 70 };
    const canvasWidth = container.clientWidth;
    const canvasHeight = container.clientHeight;
    
    if (dataBounds.stationRange <= 0 || dataBounds.elevRange <= 0) return;

    const availableWidth = canvasWidth - axisPadding.left - axisPadding.right;
    const availableHeight = canvasHeight - axisPadding.bottom - axisPadding.top;

    const scaleX = availableWidth / dataBounds.stationRange;
    const scaleY = (availableHeight / dataBounds.elevRange) / verticalExaggeration;
    
    const offsetX = axisPadding.left - dataBounds.minStation * scaleX;
    const offsetY = canvasHeight - axisPadding.bottom + dataBounds.minElev * scaleY;

    setTransform({ scaleX, scaleY, offsetX, offsetY });
  }, [dataBounds, verticalExaggeration]);


  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !profileData || profileData.length === 0 || !dataBounds) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isLightTheme = document.body.classList.contains('light-theme');
    const axisPadding = { top: 20, right: 20, bottom: 50, left: 70 };

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = isLightTheme ? '#f9fafb' : '#111827';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Define the view bounds based on the visible canvas area inside the axes
    const view = {
        minX: (axisPadding.left - transform.offsetX) / transform.scaleX,
        maxX: (canvas.width - axisPadding.right - transform.offsetX) / transform.scaleX,
        minY: (transform.offsetY - (canvas.height - axisPadding.bottom)) / transform.scaleY,
        maxY: (transform.offsetY - axisPadding.top) / transform.scaleY,
    };
    
    // --- Pass 1: Draw Grid (clipped) ---
    ctx.save();
    ctx.beginPath();
    ctx.rect(axisPadding.left, axisPadding.top, canvas.width - axisPadding.left - axisPadding.right, canvas.height - axisPadding.top - axisPadding.bottom);
    ctx.clip();
    
    ctx.translate(transform.offsetX, transform.offsetY);
    ctx.scale(transform.scaleX, -transform.scaleY);

    const getGridStep = (range: number, scale: number, minPixels: number): number => {
        if (range <= 0 || scale <= 0) return 100;
        const targetSteps = (range * scale) / minPixels;
        if (targetSteps <= 0) return 100;
        const pow10 = Math.pow(10, Math.floor(Math.log10(range / targetSteps)));
        const multiples = [1, 2, 5, 10, 25, 50, 100];
        for (const m of multiples) {
            if (pow10 * m * scale > minPixels) return pow10 * m;
        }
        return pow10 * 100;
    };

    const stationStep = getGridStep(view.maxX - view.minX, transform.scaleX, 100);
    const elevStep = getGridStep(view.maxY - view.minY, transform.scaleY, 50);

    ctx.strokeStyle = isLightTheme ? 'rgba(209, 213, 219, 0.7)' : 'rgba(55, 65, 81, 0.7)';
    ctx.lineWidth = 1 / Math.max(transform.scaleX, transform.scaleY);

    const startStation = Math.floor(view.minX / stationStep) * stationStep;
    for (let s = startStation; s < view.maxX; s += stationStep) {
        ctx.beginPath(); ctx.moveTo(s, view.minY); ctx.lineTo(s, view.maxY); ctx.stroke();
    }

    const startElev = Math.floor(view.minY / elevStep) * elevStep;
    for (let e = startElev; e < view.maxY; e += elevStep) {
        ctx.beginPath(); ctx.moveTo(view.minX, e); ctx.lineTo(view.maxX, e); ctx.stroke();
    }
    ctx.restore(); // End grid pass

    // --- Pass 2: Draw Axis Lines ---
    ctx.strokeStyle = isLightTheme ? '#4b5563' : '#9ca3af';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(axisPadding.left, axisPadding.top); ctx.lineTo(axisPadding.left, canvas.height - axisPadding.bottom); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(axisPadding.left, canvas.height - axisPadding.bottom); ctx.lineTo(canvas.width - axisPadding.right, canvas.height - axisPadding.bottom); ctx.stroke();

    // --- Pass 3: Draw Profile Line & Slopes (on top of axes) ---
    ctx.save();
    ctx.beginPath();
    ctx.rect(axisPadding.left, axisPadding.top, canvas.width - axisPadding.left - axisPadding.right, canvas.height - axisPadding.top - axisPadding.bottom);
    ctx.clip();
    
    if(profileData.length > 0) {
        const p1 = profileData[0];
        ctx.beginPath();
        ctx.moveTo(p1.station * transform.scaleX + transform.offsetX, -p1.elevation * transform.scaleY + transform.offsetY);
        for (let i = 1; i < profileData.length; i++) {
            const p = profileData[i];
            ctx.lineTo(p.station * transform.scaleX + transform.offsetX, -p.elevation * transform.scaleY + transform.offsetY);
        }
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    if (showSlopes && profileData.length > 1) {
        ctx.font = '10px sans-serif';
        ctx.fillStyle = isLightTheme ? '#6b7280' : '#9ca3af';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        for (let i = 0; i < profileData.length - 1; i++) {
            const p1 = profileData[i]; const p2 = profileData[i+1];
            const deltaStation = p2.station - p1.station; if (deltaStation < 1e-6) continue;
            const slopePercent = ((p2.elevation - p1.elevation) / deltaStation) * 100;
            const x1 = p1.station * transform.scaleX + transform.offsetX; const y1 = -p1.elevation * transform.scaleY + transform.offsetY;
            const x2 = p2.station * transform.scaleX + transform.offsetX; const y2 = -p2.elevation * transform.scaleY + transform.offsetY;
            const screenLength = Math.hypot(x2 - x1, y2 - y1); const text = `${slopePercent.toFixed(1)}%`; const textWidth = ctx.measureText(text).width;
            if (screenLength > textWidth + 10) {
                const midX = (x1 + x2) / 2; const midY = (y1 + y2) / 2; const angle = Math.atan2(y2 - y1, x2 - x1);
                ctx.save(); ctx.translate(midX, midY); ctx.rotate(angle);
                if (angle < -Math.PI / 2 || angle > Math.PI / 2) { ctx.rotate(Math.PI); ctx.fillText(text, 0, 8); } else { ctx.fillText(text, 0, -5); }
                ctx.restore();
            }
        }
    }
    ctx.restore(); 

    // --- Pass 4: Draw Axes Labels ---
    ctx.fillStyle = isLightTheme ? '#4b5563' : '#9ca3af';
    ctx.font = '12px sans-serif';
    
    const axisStartStation = Math.floor(view.minX / stationStep) * stationStep;
    for (let s = axisStartStation; s < view.maxX; s += stationStep) {
        const x = s * transform.scaleX + transform.offsetX; if (x > axisPadding.left - 5 && x < canvas.width - axisPadding.right) { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(s.toFixed(0), x, canvas.height - axisPadding.bottom + 5); }
    }
    const axisStartElev = Math.floor(view.minY / elevStep) * elevStep;
    for (let e = axisStartElev; e < view.maxY; e += elevStep) {
        const y = -e * transform.scaleY + transform.offsetY; if (y < canvas.height - axisPadding.bottom + 5 && y > axisPadding.top) { ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(e.toFixed(2), axisPadding.left - 8, y); }
    }
    
    ctx.save(); ctx.fillStyle = isLightTheme ? '#374151' : '#d1d5db'; ctx.textAlign = 'center';
    ctx.fillText('Station', canvas.width / 2 + axisPadding.left / 2, canvas.height - 15);
    ctx.translate(25, canvas.height / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('Elevation (ft)', 0, 0);
    ctx.restore();
  }, [profileData, transform, dataBounds, showSlopes, verticalExaggeration]);
  
  useEffect(() => { if (profileData && profileData.length > 0) { zoomExtents(); } }, [profileData, zoomExtents]);
  useEffect(() => { draw(); }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current; const container = containerRef.current; if (!canvas || !container) return;
    const resizeObserver = new ResizeObserver(() => { const { width, height } = container.getBoundingClientRect(); canvas.width = width; canvas.height = height; zoomExtents(); draw(); });
    resizeObserver.observe(container); return () => resizeObserver.disconnect();
  }, [draw, zoomExtents]);
  
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault(); const container = containerRef.current; if (!container) return;
    const rect = container.getBoundingClientRect(); const mouseX = e.clientX - rect.left; const mouseY = e.clientY - rect.top;
    const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setTransform(prev => {
        const newScaleX = Math.max(0.01, prev.scaleX * zoomFactor); const newScaleY = Math.max(0.01, prev.scaleY * zoomFactor);
        const newOffsetX = mouseX - (mouseX - prev.offsetX) * (newScaleX / prev.scaleX); const newOffsetY = mouseY - (mouseY - prev.offsetY) * (newScaleY / prev.scaleY);
        return { scaleX: newScaleX, scaleY: newScaleY, offsetX: newOffsetX, offsetY: newOffsetY };
    });
  }, []);
  const handleMouseDown = useCallback((e: React.MouseEvent) => { if (e.button !== 0) return; setIsPanning(true); lastPanPos.current = { x: e.clientX, y: e.clientY }; }, []);
  const handleMouseMove = useCallback((e: React.MouseEvent) => { if (isPanning) { const dx = e.clientX - lastPanPos.current.x; const dy = e.clientY - lastPanPos.current.y; setTransform(prev => ({ ...prev, offsetX: prev.offsetX + dx, offsetY: prev.offsetY + dy })); lastPanPos.current = { x: e.clientX, y: e.clientY }; } }, [isPanning]);
  const handleMouseUp = useCallback(() => { setIsPanning(false); }, []);

  return (
    <div className="w-full h-full bg-gray-900 flex flex-col rounded-md overflow-hidden light-theme:bg-white">
      <header className="flex-shrink-0 p-4 bg-gray-800/40 backdrop-blur border-b border-gray-700/30 flex items-center justify-between light-theme:bg-gray-50/40 light-theme:border-gray-300/30">
        <h3 className="text-xl font-semibold text-sky-400 flex items-center gap-2"> <ProfileIcon className="w-6 h-6"/> Profile View </h3>
        <div className="flex items-center gap-4">
            <div className="flex items-center text-xs font-semibold text-gray-400">
                Vert. Scale
                <div className="ml-2 flex items-center p-0.5 bg-gray-700 rounded-md">
                    {[1, 5, 10].map(factor => (
                    <button
                        key={factor}
                        onClick={() => setVerticalExaggeration(factor)}
                        className={`px-2 py-0.5 rounded text-xs transition-colors ${verticalExaggeration === factor ? 'bg-sky-600 text-white' : 'text-gray-300 hover:bg-gray-600'}`}
                    >
                        {factor === 1 ? '1x' : `1/${factor}x`}
                    </button>
                    ))}
                </div>
            </div>
            <button onClick={() => setShowSlopes(p => !p)} className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-2 transition-colors ${showSlopes ? 'bg-sky-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'}`} title={showSlopes ? 'Hide Slopes' : 'Show Slopes'}> <SlopeIcon className="w-4 h-4"/> Slopes </button>
            {profileData && profileData.length > 0 && ( <button onClick={onSaveProfile} className="px-3 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2"> <DownloadIcon className="w-4 h-4"/> Save as CSV </button> )}
        </div>
      </header>
      <div ref={containerRef} className="gesture-capture flex-grow min-h-0 relative" onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} style={{ cursor: isPanning ? 'grabbing' : 'grab' }}>
        {profileData && profileData.length > 0 ? ( <canvas ref={canvasRef} className="absolute top-0 left-0" /> ) : ( <div className="w-full h-full flex items-center justify-center text-gray-500"> <p>Generate a profile using the AI agent to see it visualized here.</p> </div> )}
      </div>
       {profileInfo && ( <footer className="flex-shrink-0 p-2 bg-gray-800/60 border-t border-gray-700 text-center text-sm text-gray-400 light-theme:bg-gray-50/60 light-theme:border-gray-300"> Displaying profile for: <span className="font-semibold text-gray-200 light-theme:text-gray-800">{profileInfo.name}</span> ({profileInfo.type}) </footer> )}
    </div>
  );
};