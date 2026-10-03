import React, { useState } from 'react';
import { type WmsService, type ActiveWmsLayer, type OfflineMapArea, type SurveyPoint } from '../types.ts';
import { ChevronDownIcon, ChevronUpIcon, GlobeAltIcon, TrashIcon } from './icons.tsx';

interface WmsPanelProps {
  services: WmsService[];
  activeLayers: ActiveWmsLayer[];
  onConnect: (url: string) => Promise<void>;
  onToggleLayer: (serviceUrl: string, layerName: string, isVisible: boolean) => void;
  onUpdateLayer: (serviceUrl: string, layerName: string, updates: Partial<ActiveWmsLayer>) => void;
  onRemoveService: (serviceUrl: string) => void;
  onDownloadMapArea: (name: string, centerPointNumber: string, radius: number) => Promise<void>;
  onDeleteOfflineMapArea: (id: string) => void;
  offlineMapAreas: OfflineMapArea[];
  points: SurveyPoint[];
}

const wmsPresets = [
    { name: 'USGS Topo', url: 'https://basemap.nationalmap.gov/arcgis/services/USGSTopo/MapServer/WMSServer' },
    { name: 'USGS Imagery', url: 'https://basemap.nationalmap.gov/arcgis/services/USGSImageryTopo/MapServer/WMSServer' },
    { name: 'USGS Imagery Only', url: 'https://basemap.nationalmap.gov/arcgis/services/USGSImageryOnly/MapServer/WMSServer' },
    { name: 'ArcGIS Online - USA', url: 'https://sampleserver6.arcgisonline.com/arcgis/services/USA/MapServer/WMSServer' },
    { name: 'ArcGIS Online - World Time Zones', url: 'https://sampleserver6.arcgisonline.com/arcgis/services/WorldTimeZones/MapServer/WMSServer' },
    { name: 'ArcGIS Online - US Census', url: 'https://sampleserver6.arcgisonline.com/arcgis/services/Census/MapServer/WMSServer' },
];

const WmsPanel: React.FC<WmsPanelProps> = ({
  services,
  activeLayers,
  onConnect,
  onToggleLayer,
  onUpdateLayer,
  onRemoveService,
  onDownloadMapArea,
  onDeleteOfflineMapArea,
  offlineMapAreas,
  points
}) => {
  const [newServiceUrl, setNewServiceUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expandedServices, setExpandedServices] = useState<Set<string>>(new Set());
  const [downloadName, setDownloadName] = useState('Offline-Area-1');
  const [downloadCenter, setDownloadCenter] = useState('');
  const [downloadRadius, setDownloadRadius] = useState(500);

  const handleConnect = async (url: string) => {
    if (!url) return;
    setIsLoading(true);
    try {
      await onConnect(url);
      setExpandedServices(prev => new Set(prev).add(url));
      if (url === newServiceUrl) {
          setNewServiceUrl('');
      }
    } catch (err) {
      // Error is handled in App.tsx
    } finally {
      setIsLoading(false);
    }
  };
  
  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const url = e.target.value;
    if (url) {
        setNewServiceUrl(url); // Set it in the input for visibility
        handleConnect(url);
    }
    e.target.value = ''; // Reset dropdown
  };

  const toggleService = (url: string) => {
    setExpandedServices(prev => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else {
        next.add(url);
      }
      return next;
    });
  };

  return (
    <div className="w-full h-full bg-gray-900 flex flex-col rounded-md overflow-hidden light-theme:bg-white">
      <header className="flex-shrink-0 p-4 bg-gray-800/40 backdrop-blur border-b border-gray-700/30 light-theme:bg-gray-50/40 light-theme:border-gray-300/30">
        <h3 className="text-xl font-semibold text-gray-300 flex items-center gap-2 light-theme:text-gray-700">
            <GlobeAltIcon className="w-6 h-6 text-blue-400"/>
            WMS Layers
        </h3>
        <p className="text-sm text-gray-400 mt-1">Connect to a Web Map Service to overlay map imagery.</p>
      </header>
      
      <div className="p-4 border-b border-gray-700 space-y-4 light-theme:border-gray-300">
          <div>
            <h4 className="font-semibold text-gray-200 mb-2 light-theme:text-gray-800">Connect via Preset</h4>
            <select onChange={handlePresetChange} defaultValue="" className="w-full p-2 text-sm bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 light-theme:bg-white light-theme:border-gray-300">
                <option value="" disabled>Select a preset service...</option>
                {wmsPresets.map(preset => (
                    <option key={preset.name} value={preset.url}>{preset.name}</option>
                ))}
            </select>
          </div>
          <div>
            <h4 className="font-semibold text-gray-200 mb-2 light-theme:text-gray-800">Connect by URL</h4>
            <form onSubmit={(e) => { e.preventDefault(); handleConnect(newServiceUrl);}} className="flex gap-2">
              <input type="url" value={newServiceUrl} onChange={(e) => setNewServiceUrl(e.target.value)} placeholder="Enter WMS Service URL" className="flex-grow p-2 text-sm bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 light-theme:bg-white light-theme:border-gray-300"/>
              <button type="submit" disabled={isLoading} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-600">
                {isLoading ? '...' : 'Connect'}
              </button>
            </form>
          </div>
          <div>
            <h4 className="font-semibold text-gray-200 mb-2 light-theme:text-gray-800">Download Offline Map Area</h4>
             <form onSubmit={(e) => { e.preventDefault(); onDownloadMapArea(downloadName, downloadCenter, downloadRadius); }} className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input type="text" value={downloadName} onChange={e => setDownloadName(e.target.value)} placeholder="Area Name" required className="p-2 text-sm bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 light-theme:bg-white light-theme:border-gray-300"/>
                    <select value={downloadCenter} onChange={e => setDownloadCenter(e.target.value)} required className="p-2 text-sm bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 light-theme:bg-white light-theme:border-gray-300">
                        <option value="">Select Center Point</option>
                        {points.map(p => <option key={p.pointNumber} value={p.pointNumber}>{p.pointNumber} - {p.description}</option>)}
                    </select>
                    <input type="number" value={downloadRadius} onChange={e => setDownloadRadius(parseInt(e.target.value, 10))} placeholder="Radius (ft)" required className="p-2 text-sm bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 light-theme:bg-white light-theme:border-gray-300"/>
                </div>
                <button type="submit" disabled={isLoading || points.length === 0} className="w-full px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-600">
                    {isLoading ? 'Processing...' : 'Download Visible Layers'}
                </button>
             </form>
          </div>
      </div>

      <div className="flex-grow overflow-auto p-4 space-y-3">
        <h4 className="text-sm font-semibold text-gray-400">Connected Services ({services.length}) & Offline Areas ({offlineMapAreas.length})</h4>
        {services.length === 0 && offlineMapAreas.length === 0 ? (
            <p className="text-center text-gray-500 pt-4">No services connected or offline areas downloaded.</p>
        ) : (
            <>
            {offlineMapAreas.map(area => (
                 <div key={area.id} className="bg-gray-800/50 rounded-lg border border-gray-700 light-theme:bg-gray-100/50 light-theme:border-gray-300">
                     <header className="p-3 flex justify-between items-center">
                         <div className="min-w-0">
                             <h4 className="font-semibold text-gray-200 truncate light-theme:text-gray-800" title={area.name}>{area.name}</h4>
                             <p className="text-xs text-gray-400">Offline Area ({area.layers.length} layers)</p>
                         </div>
                         <div className="flex items-center gap-2">
                              <button onClick={() => onDeleteOfflineMapArea(area.id)} className="p-1.5 text-red-400 hover:bg-red-800/50 rounded-full"><TrashIcon className="w-4 h-4"/></button>
                         </div>
                     </header>
                 </div>
            ))}
            {services.map(service => (
                <div key={service.url} className="bg-gray-800/50 rounded-lg border border-gray-700 light-theme:bg-gray-100/50 light-theme:border-gray-300">
                    <header className="p-3 flex justify-between items-center cursor-pointer" onClick={() => toggleService(service.url)}>
                        <div className="min-w-0">
                            <h4 className="font-semibold text-gray-200 truncate light-theme:text-gray-800" title={service.title}>{service.title}</h4>
                            <p className="text-xs text-gray-400 truncate" title={service.url}>{service.url}</p>
                        </div>
                        <div className="flex items-center gap-2">
                             <button onClick={(e) => { e.stopPropagation(); onRemoveService(service.url); }} className="p-1.5 text-red-400 hover:bg-red-800/50 rounded-full"><TrashIcon className="w-4 h-4"/></button>
                            {expandedServices.has(service.url) ? <ChevronUpIcon className="w-5 h-5"/> : <ChevronDownIcon className="w-5 h-5"/>}
                        </div>
                    </header>
                    {expandedServices.has(service.url) && (
                        <div className="p-3 border-t border-gray-700/50 max-h-64 overflow-y-auto space-y-2 light-theme:border-gray-300/50">
                            {service.layers.map(layer => {
                                const activeLayer = activeLayers.find(al => al.serviceUrl === service.url && al.layerName === layer.name);
                                const isVisible = activeLayer?.isVisible || false;
                                return (
                                    <div key={layer.name} className="p-2 bg-gray-700/40 rounded-md light-theme:bg-gray-200/40">
                                        <div className="flex items-center justify-between">
                                            <label className="flex items-center gap-2 cursor-pointer min-w-0">
                                                <input
                                                    type="checkbox"
                                                    checked={isVisible}
                                                    onChange={(e) => onToggleLayer(service.url, layer.name, e.target.checked)}
                                                    className="accent-blue-500"
                                                />
                                                <span className="text-sm truncate" title={layer.title}>{layer.title}</span>
                                            </label>
                                            {isVisible && (
                                                <input 
                                                    type="range"
                                                    min="0"
                                                    max="1"
                                                    step="0.05"
                                                    value={activeLayer?.opacity || 0.7}
                                                    onChange={(e) => onUpdateLayer(service.url, layer.name, { opacity: parseFloat(e.target.value) })}
                                                    className="w-20 accent-blue-500"
                                                    title={`Opacity: ${Math.round((activeLayer?.opacity || 0.7) * 100)}%`}
                                                />
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            {service.layers.length === 0 && <p className="text-xs text-gray-500 text-center">No queryable layers found in this service.</p>}
                        </div>
                    )}
                </div>
            ))}
            </>
        )}
      </div>
    </div>
  );
};

export default WmsPanel;