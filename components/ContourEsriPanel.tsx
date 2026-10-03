import React, { useState } from 'react';
import { type ContourSettings, type EsriServiceInfo } from '../types.ts';
import { ESRI_STATE_SERVICES } from '../utils/esriStateServices.ts';

interface ContourEsriPanelProps {
  settings: ContourSettings;
  onSettingsChange: (settings: ContourSettings) => void;
  onDiscoverPublicServices?: (searchTerm: string) => void;
  isDiscovering?: boolean;
  discoveredServices?: EsriServiceInfo[];
  hasInclusionBoundary?: boolean;
  inclusionSegmentCount?: number;
  hasProjectProjection?: boolean;
  isFetchingEsri?: boolean;
  onFetchEsriContours?: (serviceUrl: string, mode: 'inclusion' | 'description', descriptionText?: string) => void;
}

/**
 * Floating-dialog version of the ESRI REST contour-source tooling (v26.05.17.33).
 * Extracted out of ContourPanel so the contour-generation panel and the GIS
 * source picker can be opened independently.
 */
export const ContourEsriPanel: React.FC<ContourEsriPanelProps> = ({
  settings, onSettingsChange,
  onDiscoverPublicServices, isDiscovering = false, discoveredServices = [],
  hasInclusionBoundary = false, inclusionSegmentCount = 0,
  hasProjectProjection = false,
  isFetchingEsri = false, onFetchEsriContours,
}) => {
  const [esriUrlInput, setEsriUrlInput] = useState('');
  const [discoverSearchTerm, setDiscoverSearchTerm] = useState('');
  const [selectedStateAbbr, setSelectedStateAbbr] = useState('');
  const selectedStateEntry = ESRI_STATE_SERVICES.find(s => s.abbr === selectedStateAbbr) ?? null;
  const [fetchOpenUrl, setFetchOpenUrl] = useState<string | null>(null);
  const [fetchMode, setFetchMode] = useState<'inclusion' | 'description'>('inclusion');
  const [fetchDescription, setFetchDescription] = useState('');
  const [browseStatus, setBrowseStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [browsedLayers, setBrowsedLayers] = useState<Array<{ id: number; name: string; type: string }>>([]);
  const [browseError, setBrowseError] = useState('');

  const stripLayerIndex = (url: string) => url.replace(/\/\d+\s*$/, '');

  const handleBrowseLayers = async () => {
    const base = stripLayerIndex(esriUrlInput.trim());
    setBrowseStatus('loading'); setBrowsedLayers([]); setBrowseError('');
    try {
      const resp = await fetch(`${base}?f=json`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const layers: Array<{ id: number; name: string; type: string }> = (data.layers ?? []).map(
        (l: { id: number; name: string; type?: string }) => ({ id: l.id, name: l.name, type: l.type ?? 'Feature Layer' })
      );
      if (layers.length === 0) throw new Error('No sub-layers found. You can add this URL directly via the Add button.');
      setBrowsedLayers(layers); setBrowseStatus('done');
    } catch (err) {
      setBrowseError(err instanceof Error ? err.message : String(err)); setBrowseStatus('error');
    }
  };
  const handlePinLayerFromBrowse = (layerId: number) => {
    const base = stripLayerIndex(esriUrlInput.trim());
    const layerUrl = `${base}/${layerId}`;
    const existing = settings.esriServiceUrls ?? [];
    if (!existing.includes(layerUrl)) onSettingsChange({ ...settings, esriServiceUrls: [...existing, layerUrl] });
  };
  const handleAddEsriUrl = () => {
    const url = esriUrlInput.trim(); if (!url) return;
    const existing = settings.esriServiceUrls ?? []; if (existing.includes(url)) return;
    onSettingsChange({ ...settings, esriServiceUrls: [...existing, url] });
    setEsriUrlInput('');
  };
  const handleRemoveEsriUrl = (url: string) => {
    onSettingsChange({ ...settings, esriServiceUrls: (settings.esriServiceUrls ?? []).filter(u => u !== url) });
  };
  const handleAddDiscoveredService = (svc: EsriServiceInfo) => {
    const existing = settings.esriServiceUrls ?? []; if (existing.includes(svc.url)) return;
    onSettingsChange({ ...settings, esriServiceUrls: [...existing, svc.url] });
  };

  return (
    <div className="space-y-4 text-sm text-gray-300">
      {/* State picker */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-gray-400">Select State</label>
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
                      {layer.notes && <div className="text-[10px] text-gray-500 mt-0.5 italic">{layer.notes}</div>}
                    </div>
                    <button
                      type="button"
                      onClick={() => { if (!alreadyPinned) onSettingsChange({ ...settings, esriServiceUrls: [...(settings.esriServiceUrls ?? []), layer.url] }); }}
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

        {selectedStateEntry && selectedStateEntry.layers.length === 0 && (
          <div className="rounded border border-gray-600/50 bg-gray-800/50 px-2.5 py-2 space-y-1">
            <div className="text-[10px] text-gray-400">
              <span className="text-amber-400/80 font-medium">{selectedStateEntry.state}</span> — live service not yet configured.
            </div>
            {selectedStateEntry.portalUrl ? (
              <div className="text-[10px] text-gray-500">
                Browse their GIS portal then paste a MapServer URL in the custom URL field below.{' '}
                <a href={selectedStateEntry.portalUrl} target="_blank" rel="noopener noreferrer"
                  className="text-amber-400/80 hover:text-amber-300 underline">Open {selectedStateEntry.abbr} GIS Portal →</a>
              </div>
            ) : (
              <div className="text-[10px] text-gray-500">Use the custom URL field below to add a service manually.</div>
            )}
          </div>
        )}
      </div>

      {/* Custom URL */}
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">Custom Service URL</label>
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
          >Add</button>
        </div>
        <p className="text-[10px] text-gray-500 mt-1">
          Paste any ArcGIS REST MapServer URL and click <span className="text-amber-400/80">Browse Layers</span> to pick a sub-layer, or paste a full layer URL (/MapServer/0) and click <span className="text-amber-400/80">Add</span>.
        </p>

        {browseStatus === 'error' && (
          <div className="mt-2 rounded border border-rose-700/40 bg-rose-950/30 px-2 py-1.5 text-[10px] text-rose-300">⚠ {browseError}</div>
        )}
        {browseStatus === 'done' && browsedLayers.length > 0 && (
          <div className="mt-2 rounded border border-amber-700/30 bg-gray-800/60 overflow-hidden">
            <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-amber-400/70 font-semibold border-b border-amber-700/20 flex items-center justify-between">
              <span>{browsedLayers.length} layer{browsedLayers.length !== 1 ? 's' : ''} found</span>
              <button type="button" onClick={() => { setBrowseStatus('idle'); setBrowsedLayers([]); }}
                className="text-gray-500 hover:text-gray-300 text-xs">✕</button>
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

      {/* Pinned services + download */}
      {(settings.esriServiceUrls ?? []).length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Pinned Services</div>
          {(settings.esriServiceUrls ?? []).map(url => {
            const isOpen = fetchOpenUrl === url;
            return (
              <div key={url} className="rounded border border-gray-700/60 bg-gray-700/30">
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
                    >{isOpen ? 'Cancel' : '↓ Download'}</button>
                  )}
                  <button type="button"
                    onClick={() => { handleRemoveEsriUrl(url); if (fetchOpenUrl === url) setFetchOpenUrl(null); }}
                    className="text-gray-500 hover:text-rose-400 text-xs flex-shrink-0 transition-colors ml-0.5"
                    title="Remove">✕</button>
                </div>

                {isOpen && onFetchEsriContours && (
                  <div className="border-t border-gray-600/50 px-3 py-2.5 space-y-2.5 bg-gray-800/50">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setFetchMode('inclusion')}
                        className={`flex-1 text-[10px] py-1 rounded border transition-colors ${fetchMode === 'inclusion' ? 'bg-green-700/40 border-green-500/50 text-green-200' : 'bg-gray-700/40 border-gray-600/40 text-gray-400 hover:text-gray-200'}`}>
                        Inclusion Boundary
                      </button>
                      <button type="button" onClick={() => setFetchMode('description')}
                        className={`flex-1 text-[10px] py-1 rounded border transition-colors ${fetchMode === 'description' ? 'bg-blue-700/40 border-blue-500/50 text-blue-200' : 'bg-gray-700/40 border-gray-600/40 text-gray-400 hover:text-gray-200'}`}>
                        Describe Area
                      </button>
                    </div>

                    {fetchMode === 'inclusion' && (
                      <div className={`text-[10px] rounded px-2 py-1.5 border ${
                        hasInclusionBoundary && hasProjectProjection
                          ? 'bg-green-900/20 border-green-700/40 text-green-300'
                          : 'bg-yellow-900/20 border-yellow-700/40 text-yellow-400'
                      }`}>
                        {!hasInclusionBoundary
                          ? '⚠ No inclusion line drawn — use the canvas toolbar to draw an inclusion boundary first'
                          : !hasProjectProjection
                            ? '⚠ Inclusion mode also needs a project projection/EPSG. Without it, local drafting coordinates are not georeferenced for ESRI queries.'
                            : `✓ Inclusion boundary detected (${inclusionSegmentCount} segment${inclusionSegmentCount !== 1 ? 's' : ''})`}
                      </div>
                    )}
                    {fetchMode === 'description' && (
                      <div className="space-y-1">
                        <input
                          type="text" value={fetchDescription}
                          onChange={e => setFetchDescription(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && fetchDescription.trim()) onFetchEsriContours(url, 'description', fetchDescription.trim()); }}
                          placeholder="e.g. Lancaster County PA, downtown Philadelphia…"
                          className="w-full p-2 text-xs bg-gray-700 border border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-200 placeholder-gray-500"
                        />
                        <p className="text-[10px] text-gray-500">Area will be geocoded via OpenStreetMap to build the bounding box.</p>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        if (fetchMode === 'inclusion') onFetchEsriContours(url, 'inclusion');
                        else onFetchEsriContours(url, 'description', fetchDescription.trim());
                      }}
                      disabled={isFetchingEsri || (fetchMode === 'inclusion' && (!hasInclusionBoundary || !hasProjectProjection)) || (fetchMode === 'description' && !fetchDescription.trim())}
                      className="w-full py-1.5 text-xs font-semibold rounded border bg-teal-700/50 hover:bg-teal-600/60 text-teal-100 border-teal-600/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                    >
                      {isFetchingEsri
                        ? <><span className="w-3 h-3 border border-teal-300 border-t-transparent rounded-full animate-spin" />Fetching…</>
                        : '↓ Download Contours'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Discover */}
      {onDiscoverPublicServices && (
        <div className="border border-amber-700/20 rounded-md p-3 bg-amber-950/10 space-y-2">
          <div className="text-[10px] uppercase tracking-wide text-amber-400/70 font-semibold">Discover Public Services</div>
          <p className="text-[10px] text-gray-500 leading-snug">Search for publicly available ESRI REST contour &amp; elevation services by state, county, or country.</p>
          <div className="flex gap-2">
            <input
              type="text" value={discoverSearchTerm}
              onChange={e => setDiscoverSearchTerm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && discoverSearchTerm.trim() && onDiscoverPublicServices(discoverSearchTerm.trim())}
              placeholder="e.g. Pennsylvania, Lancaster County PA…"
              className="flex-1 p-2 text-xs bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-200 placeholder-gray-500"
            />
            <button type="button"
              onClick={() => discoverSearchTerm.trim() && onDiscoverPublicServices(discoverSearchTerm.trim())}
              disabled={!discoverSearchTerm.trim() || isDiscovering}
              className="px-3 py-1 text-xs bg-teal-700/50 hover:bg-teal-600/60 text-teal-200 rounded-md border border-teal-600/40 disabled:opacity-40 transition-colors flex items-center gap-1.5">
              {isDiscovering
                ? <><span className="w-3 h-3 border border-teal-300 border-t-transparent rounded-full animate-spin" />Searching…</>
                : 'Discover'}
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
                  <button type="button"
                    onClick={() => handleAddDiscoveredService(svc)}
                    disabled={(settings.esriServiceUrls ?? []).includes(svc.url)}
                    className="flex-shrink-0 text-[10px] px-1.5 py-0.5 bg-amber-700/50 hover:bg-amber-600/60 text-amber-200 rounded border border-amber-600/40 disabled:opacity-40 transition-colors">
                    {(settings.esriServiceUrls ?? []).includes(svc.url) ? 'Added' : '+ Add'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ContourEsriPanel;
