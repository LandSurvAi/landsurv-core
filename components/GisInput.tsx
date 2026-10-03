import React, { useState, useCallback } from 'react';
import {
  GisAgentIcon,
  UploadIcon,
  HomeIcon,
  FolderIcon,
  MapIcon,
  LayersIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  GlobeAltIcon,
} from './icons.tsx';
import { useAppState } from '../contexts/AppStateContext.tsx';
import {
  bboxAroundPoint,
  classifyArcGisUrl,
  fetchQueryUrlGeoJson,
  geocodePlace,
  getLayerFeatureCount,
  getLayerInfo,
  listDirectory,
  queryLayerGeoJson,
  serviceTypeLabel,
  type ArcGisDirectoryListing,
  type GeoJSONFeatureCollection,
} from '../utils/arcgisServerClient.ts';
import { ARCGIS_DATA_CATALOG, MAPPING_SUPPORT_LIST_URL } from '../constants/arcgisDataSources.ts';
import type { InclusionBoundary } from '../types.ts';

interface GisInputProps {
  onGisUploaded: (content: string, fileName: string, source?: 'file' | 'url') => void;
  onGoBack: () => void;
  backButtonTitle?: string;
  /** Named inclusion boundaries drawn on the canvas (project CRS). */
  inclusionBoundaries?: InclusionBoundary[];
  /** Currently active inclusion boundary, preselected in the AOI picker. */
  activeInclusionBoundaryId?: string | null;
  /** True when any inclusion lines exist (even unnamed ones). */
  hasInclusionLines?: boolean;
  /** Computes the WGS84 envelope of inclusion lines (null when unavailable). */
  getInclusionBboxWgs84?: (boundaryId: string | null) => [number, number, number, number] | null;
}

type View = 'upload' | 'browse' | 'owner-search' | 'aoi';

/** Layers this small load directly without asking for an area of interest. */
const SMALL_LAYER_THRESHOLD = 500;
/** Above this, whole-layer loading is disabled — it would never succeed. */
const HUGE_LAYER_THRESHOLD = 100_000;

const Spinner: React.FC = () => (
  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>
);

/** Derive a download-style file name from the URL the features came from. */
function suggestFileName(sourceUrl: string): string {
  const { kind, cleanUrl } = classifyArcGisUrl(sourceUrl);
  const parts = cleanUrl.split('?')[0].split('/').filter(Boolean);
  if (kind === 'layer') {
    const id = parts[parts.length - 1];
    const service = parts[parts.length - 3] ?? 'gis';
    return `${service}_${id}.geojson`;
  }
  const last = parts[parts.length - 1] ?? 'gis';
  return `${last.replace(/[^\w.-]+/g, '_')}_features.geojson`;
}

const GisInput: React.FC<GisInputProps> = ({
  onGisUploaded,
  onGoBack,
  backButtonTitle = 'Go to Home Screen',
  inclusionBoundaries = [],
  activeInclusionBoundaryId = null,
  hasInclusionLines = false,
  getInclusionBboxWgs84,
}) => {
  const [view, setView] = useState<View>('upload');
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [url, setUrl] = useState('');
  const [loadedGeoJson, setLoadedGeoJson] = useState<GeoJSONFeatureCollection | null>(null);
  const [selectedFeatureIndices, setSelectedFeatureIndices] = useState<Set<number>>(new Set());
  const [cameFromSearch, setCameFromSearch] = useState(false);

  // Server-browser state — a stack of visited directory listings (breadcrumbs).
  const [browseTrail, setBrowseTrail] = useState<ArcGisDirectoryListing[]>([]);
  const [isBrowsing, setIsBrowsing] = useState(false);

  // Owner-search state
  const [ownerSearchUrl, setOwnerSearchUrl] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Area-of-interest state (for large layers)
  const [pendingLayer, setPendingLayer] = useState<{ url: string; count: number | null } | null>(null);
  const [aoiPlace, setAoiPlace] = useState('');
  const [aoiRadiusMiles, setAoiRadiusMiles] = useState(5);
  const [aoiBoundaryId, setAoiBoundaryId] = useState<string>(activeInclusionBoundaryId ?? '');

  const { addNotification } = useAppState();

  const notifyError = useCallback((message: string) => {
    addNotification({ kind: 'gis-input', severity: 'error', title: 'GIS Agent', message });
  }, [addNotification]);

  // ── GeoJSON file upload ──────────────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    const validExtensions = ['.geojson', '.json'];
    const lowerCaseName = file.name.toLowerCase();

    if (file && (validExtensions.some(ext => lowerCaseName.endsWith(ext)) || file.type === 'application/json')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        onGisUploaded(content, file.name, 'file');
      };
      reader.readAsText(file);
    } else {
      notifyError('Please upload a valid .geojson or .json file.');
    }
  }, [notifyError, onGisUploaded]);

  // ── ArcGIS loading ───────────────────────────────────────────────────────

  const presentFeatures = useCallback((geoJson: GeoJSONFeatureCollection) => {
    setLoadedGeoJson(geoJson);
    setSelectedFeatureIndices(new Set(Array.from({ length: geoJson.features.length }, (_, i) => i)));
    if (geoJson.exceededTransferLimit) {
      addNotification({
        kind: 'gis-input',
        severity: 'warning',
        title: 'GIS Agent',
        message: `The server capped the result at ${geoJson.features.length.toLocaleString()} features for this area (transfer limit). Narrow the area or add a where-clause for full coverage.`,
      });
    }
  }, [addNotification]);

  /** Actually run the layer query and move to the feature-selection view. */
  const runLayerQuery = useCallback(async (layerUrl: string, bboxWgs84?: [number, number, number, number]) => {
    setIsLoadingUrl(true);
    try {
      // Generalize geometry server-side when a bbox is known: tolerance ≈ one
      // pixel of a ~1500 px-wide view of the area. Cuts payload 10-20×.
      const maxAllowableOffset = bboxWgs84 ? (bboxWgs84[2] - bboxWgs84[0]) / 1500 : undefined;
      const geoJson = await queryLayerGeoJson(layerUrl, { bboxWgs84, maxAllowableOffset });
      setUrl(layerUrl);
      setPendingLayer(null);
      presentFeatures(geoJson);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      notifyError(`Failed to load layer: ${errorMessage}`);
    } finally {
      setIsLoadingUrl(false);
    }
  }, [notifyError, presentFeatures]);

  /**
   * Entry point for "load this layer": probe the feature count first. Small
   * layers load immediately; large ones route to the area-of-interest step so
   * the user isn't stuck waiting on a multi-gigabyte national download.
   */
  const loadFeaturesFromLayer = useCallback(async (layerUrl: string) => {
    setIsLoadingUrl(true);
    try {
      const count = await getLayerFeatureCount(layerUrl);
      if (count !== null && count <= SMALL_LAYER_THRESHOLD) {
        await runLayerQuery(layerUrl);
        return;
      }
      setPendingLayer({ url: layerUrl, count });
      setView('aoi');
    } catch (err) {
      // Count probe failed — try the direct load anyway, the query may work.
      await runLayerQuery(layerUrl);
    } finally {
      setIsLoadingUrl(false);
    }
  }, [runLayerQuery]);

  /** Geocode the AOI place (or parse "lat, lon") and load the layer around it. */
  const handleLoadAoiArea = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!pendingLayer || !aoiPlace.trim()) return;

    setIsLoadingUrl(true);
    try {
      let center: { lon: number; lat: number; label: string } | null = null;
      const latLonMatch = aoiPlace.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
      if (latLonMatch) {
        // Users type "lat, lon" (Google Maps convention).
        const lat = parseFloat(latLonMatch[1]);
        const lon = parseFloat(latLonMatch[2]);
        if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
          center = { lon, lat, label: `${lat}, ${lon}` };
        }
      } else {
        center = await geocodePlace(aoiPlace.trim());
      }

      if (!center) {
        notifyError(`Could not find "${aoiPlace}". Try a city, full address, or lat, lon coordinates.`);
        return;
      }

      const bbox = bboxAroundPoint(center.lon, center.lat, aoiRadiusMiles);
      await runLayerQuery(pendingLayer.url, bbox);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      notifyError(`Area search failed: ${errorMessage}`);
    } finally {
      setIsLoadingUrl(false);
    }
  }, [pendingLayer, aoiPlace, aoiRadiusMiles, notifyError, runLayerQuery]);

  /** Load the pending layer clipped to the project's inclusion area. */
  const handleLoadInclusionArea = useCallback(async () => {
    if (!pendingLayer || !getInclusionBboxWgs84) return;
    const bbox = getInclusionBboxWgs84(aoiBoundaryId || null);
    if (!bbox) {
      notifyError(
        aoiBoundaryId
          ? 'The selected inclusion boundary has no lines, or no projection is set. Draw the boundary on the canvas first.'
          : 'No inclusion lines found. Draw an inclusion boundary on the canvas first (and set a project projection).',
      );
      return;
    }
    await runLayerQuery(pendingLayer.url, bbox);
  }, [pendingLayer, aoiBoundaryId, getInclusionBboxWgs84, notifyError, runLayerQuery]);

  /** Open a server/folder/service URL in the browser view. */
  const openBrowse = useCallback(async (dirUrl: string, push: boolean) => {
    setIsBrowsing(true);
    setView('browse');
    try {
      const listing = await listDirectory(dirUrl);
      if (listing.empty && listing.kind === 'directory') {
        notifyError('That ArcGIS endpoint has no folders or services to browse. Check the URL and try again.');
        return;
      }
      setBrowseTrail(prev => (push ? [...prev, listing] : [listing]));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      notifyError(`Could not browse the GIS server: ${errorMessage}`);
      if (browseTrail.length === 0) setView('upload');
    } finally {
      setIsBrowsing(false);
    }
  }, [browseTrail.length, notifyError]);

  /**
   * Single router for every URL the user supplies: query endpoints are fetched
   * as-is, layer endpoints are queried, and server/folder/service URLs open in
   * the interactive server browser.
   */
  const handleFetchFromUrl = useCallback(async (input: string) => {
    if (!input) return;
    const { kind, cleanUrl } = classifyArcGisUrl(input);

    if (kind === 'query') {
      setIsLoadingUrl(true);
      try {
        presentFeatures(await fetchQueryUrlGeoJson(cleanUrl));
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        notifyError(`Failed to load from URL: ${errorMessage}`);
      } finally {
        setIsLoadingUrl(false);
      }
      return;
    }
    if (kind === 'layer') {
      await loadFeaturesFromLayer(cleanUrl);
      return;
    }
    await openBrowse(cleanUrl, false);
  }, [loadFeaturesFromLayer, notifyError, openBrowse, presentFeatures]);

  const handleCatalogChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedUrl = e.target.value;
    if (selectedUrl) {
      setUrl(selectedUrl);
      handleFetchFromUrl(selectedUrl);
    }
    e.target.value = '';
  };

  const handleBrowseCrumb = (index: number) => {
    setBrowseTrail(prev => prev.slice(0, index + 1));
  };

  // ── Feature selection ────────────────────────────────────────────────────

  const toggleFeatureSelection = (index: number) => {
    const newSelection = new Set(selectedFeatureIndices);
    if (newSelection.has(index)) {
      newSelection.delete(index);
    } else {
      newSelection.add(index);
    }
    setSelectedFeatureIndices(newSelection);
  };

  const toggleAllFeatures = () => {
    if (!loadedGeoJson) return;
    if (selectedFeatureIndices.size === loadedGeoJson.features.length) {
      setSelectedFeatureIndices(new Set());
    } else {
      setSelectedFeatureIndices(new Set(Array.from({ length: loadedGeoJson.features.length }, (_, i) => i)));
    }
  };

  const resetToUpload = () => {
    setLoadedGeoJson(null);
    setSelectedFeatureIndices(new Set());
    setUrl('');
    setCameFromSearch(false);
    setBrowseTrail([]);
    setOwnerSearchUrl('');
    setOwnerName('');
    setPendingLayer(null);
    setAoiPlace('');
    setView('upload');
  };

  const handleUploadSelectedFeatures = () => {
    if (!loadedGeoJson || selectedFeatureIndices.size === 0) return;

    const selectedFeatures = loadedGeoJson.features.filter((_: unknown, i: number) => selectedFeatureIndices.has(i));
    const filteredGeoJson = {
      type: 'FeatureCollection',
      features: selectedFeatures
    };

    const content = JSON.stringify(filteredGeoJson, null, 2);
    const fileName = suggestFileName(url);

    onGisUploaded(content, fileName, 'url');
    setLoadedGeoJson(null);
    setSelectedFeatureIndices(new Set());
  };

  // ── Owner-name search ────────────────────────────────────────────────────

  const handleSearchByOwner = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!ownerSearchUrl || !ownerName) return;

    setIsSearching(true);

    try {
      const { kind, cleanUrl } = classifyArcGisUrl(ownerSearchUrl);

      let layerUrl = cleanUrl;
      if (kind === 'service') {
        // A whole service was supplied — search its first layer.
        const listing = await listDirectory(cleanUrl);
        if (listing.layers.length === 0) {
          throw new Error('No layers found in this service. Paste a specific layer URL (…/MapServer/0) instead.');
        }
        layerUrl = listing.layers[0].url;
      } else if (kind !== 'layer') {
        throw new Error('Owner search needs a layer URL (…/MapServer/0 or …/FeatureServer/0). Use the server browser to find one.');
      }

      // Detect the owner/name field from the layer metadata.
      let ownerField = 'Name'; // fallback
      try {
        const info = await getLayerInfo(layerUrl);
        const nameFields = info.fields.filter((f) => {
          const name = f.name.toLowerCase();
          return name.includes('owner') || name.includes('name') || name.includes('grantor');
        });
        if (nameFields.length > 0) ownerField = nameFields[0].name;
      } catch {
        // Metadata unavailable — proceed with the fallback field name.
      }

      // Case-insensitive pattern match; escape single quotes for SQL.
      const safeOwner = ownerName.replace(/'/g, "''");
      const whereClause = `UPPER(${ownerField}) LIKE UPPER('%${safeOwner}%')`;
      const geoJson = await queryLayerGeoJson(layerUrl, { where: whereClause }).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('no features')) {
          throw new Error(`No lots found matching owner name "${ownerName}". Try a different search term.`);
        }
        throw err instanceof Error ? err : new Error(msg);
      });

      setUrl(layerUrl);
      setCameFromSearch(true);
      presentFeatures(geoJson);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      notifyError(`Search failed: ${errorMessage}`);
    } finally {
      setIsSearching(false);
    }
  }, [notifyError, ownerName, ownerSearchUrl, presentFeatures]);

  // ── Drag & drop ──────────────────────────────────────────────────────────

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }, []);
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  }, [handleFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  const handleClick = () => {
    document.getElementById('gis-file-input')?.click();
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const currentListing = browseTrail[browseTrail.length - 1];

  const renderBrowseView = () => (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => (browseTrail.length > 1 ? setBrowseTrail(prev => prev.slice(0, -1)) : setView('upload'))}
          className="p-2 text-gray-300 hover:text-white transition-colors"
          title={browseTrail.length > 1 ? 'Back up one level' : 'Back to upload'}
        >
          <ChevronLeftIcon className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-xs text-gray-400 overflow-x-auto whitespace-nowrap">
            <GlobeAltIcon className="w-4 h-4 flex-shrink-0 text-teal-400" />
            {browseTrail.map((crumb, i) => (
              <React.Fragment key={crumb.url}>
                {i > 0 && <ChevronRightIcon className="w-3 h-3 flex-shrink-0 text-gray-600" />}
                <button
                  onClick={() => handleBrowseCrumb(i)}
                  className={`hover:text-teal-300 truncate max-w-[10rem] ${i === browseTrail.length - 1 ? 'text-teal-300 font-semibold' : ''}`}
                  title={crumb.url}
                >
                  {crumb.serviceName || crumb.url.split('/').filter(Boolean).pop()}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {isBrowsing ? (
        <div className="py-12"><Spinner /></div>
      ) : currentListing ? (
        <div className="bg-gray-800 rounded-lg border border-gray-600 text-left max-h-96 overflow-y-auto">
          {currentListing.kind === 'service' && (
            <div className="px-4 pt-4 pb-2 border-b border-gray-700">
              <h3 className="text-white font-semibold">{currentListing.serviceName}</h3>
              {currentListing.serviceDescription && (
                <p className="text-gray-400 text-xs mt-1 line-clamp-2">{currentListing.serviceDescription}</p>
              )}
            </div>
          )}

          {currentListing.folders.length > 0 && (
            <div className="p-2">
              <p className="px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-gray-500">Folders</p>
              {currentListing.folders.map(folder => (
                <button
                  key={folder.url}
                  onClick={() => openBrowse(folder.url, true)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700 text-sm text-gray-200"
                >
                  <FolderIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span className="truncate">{folder.name}</span>
                </button>
              ))}
            </div>
          )}

          {currentListing.services.length > 0 && (
            <div className="p-2">
              <p className="px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-gray-500">Services</p>
              {currentListing.services.map(service => (
                <button
                  key={service.url}
                  onClick={() => openBrowse(service.url, true)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700 text-sm text-gray-200"
                >
                  <MapIcon className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  <span className="truncate">{service.name}</span>
                  <span className="ml-auto flex-shrink-0 text-[0.65rem] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">
                    {serviceTypeLabel(service.type)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {currentListing.layers.length > 0 && (
            <div className="p-2">
              <p className="px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-gray-500">
                Layers — click to load features
              </p>
              {currentListing.layers.map(layer => (
                <button
                  key={layer.url}
                  onClick={() => loadFeaturesFromLayer(layer.url)}
                  disabled={isLoadingUrl}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700 text-sm text-gray-200 disabled:opacity-50"
                >
                  <LayersIcon className="w-4 h-4 text-teal-400 flex-shrink-0" />
                  <span className="truncate">{layer.name}</span>
                  <span className="ml-auto flex-shrink-0 text-[0.65rem] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">
                    #{layer.id}
                  </span>
                </button>
              ))}
            </div>
          )}

          {currentListing.empty && (
            <p className="p-4 text-sm text-gray-400">Nothing to browse here — no folders, services, or layers.</p>
          )}
        </div>
      ) : null}

      {isLoadingUrl && !isBrowsing && (
        <p className="mt-3 text-sm text-teal-300 flex items-center justify-center gap-2">
          <Spinner /> Loading layer features…
        </p>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); handleFetchFromUrl(url); }}
        className="mt-4 flex gap-2"
      >
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste another server, service, or layer URL…"
          className="flex-grow p-3 text-sm bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
        <button
          type="submit"
          disabled={isLoadingUrl || isBrowsing || !url}
          className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:bg-gray-600"
        >
          Go
        </button>
      </form>
    </div>
  );

  const renderOwnerSearchView = () => (
    <div className="w-full">
      <p className="text-gray-300 mb-6">
        Search for lots by owner name
      </p>
      <form onSubmit={handleSearchByOwner} className="space-y-4">
        <input
          type="url"
          value={ownerSearchUrl}
          onChange={(e) => setOwnerSearchUrl(e.target.value)}
          placeholder="Enter an ArcGIS layer URL (…/MapServer/0)"
          className="w-full p-3 text-sm bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
          required
        />
        <input
          type="text"
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
          placeholder="Enter lot owner name (or part of name)"
          className="w-full p-3 text-sm bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
          required
        />
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              setView('upload');
              setOwnerSearchUrl('');
              setOwnerName('');
            }}
            className="flex-1 px-4 py-2 text-sm font-semibold text-gray-200 bg-gray-700 rounded-md hover:bg-gray-600 transition-colors"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={isSearching || !ownerSearchUrl || !ownerName}
            className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:bg-gray-600 transition-colors"
          >
            {isSearching ? <Spinner /> : 'Search'}
          </button>
        </div>
      </form>
    </div>
  );

  const renderAoiView = () => {
    if (!pendingLayer) return null;
    const countKnown = pendingLayer.count !== null;
    const tooBigForWholeLayer = countKnown && pendingLayer.count! > HUGE_LAYER_THRESHOLD;
    const layerName = pendingLayer.url.split('/').filter(Boolean).slice(-3).join(' / ');

    return (
      <div className="w-full">
        <p className="text-gray-300 mb-2">
          <LayersIcon className="w-4 h-4 inline-block mr-1 text-teal-400" />
          <span className="font-mono text-sm text-teal-300">{layerName}</span>
        </p>
        <p className="text-gray-300 mb-6">
          {countKnown ? (
            <>This layer contains <span className="font-bold text-cyan-400">{pendingLayer.count!.toLocaleString()}</span> features — pick an area of interest to load just what you need.</>
          ) : (
            <>This layer may be large — pick an area of interest to load just what you need.</>
          )}
        </p>

        {(hasInclusionLines || inclusionBoundaries.length > 0) && (
          <div className="mb-6 p-4 bg-emerald-900/20 border border-emerald-700/50 rounded-lg text-left">
            <p className="text-sm font-semibold text-emerald-300 mb-3">
              Use your project inclusion area
            </p>
            {inclusionBoundaries.length > 0 && (
              <select
                value={aoiBoundaryId}
                onChange={(e) => setAoiBoundaryId(e.target.value)}
                className="w-full mb-3 p-2.5 text-sm bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">All inclusion lines</option>
                {inclusionBoundaries.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}
            <button
              onClick={handleLoadInclusionArea}
              disabled={isLoadingUrl}
              className="w-full py-2 text-sm font-semibold text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:bg-gray-600 transition-colors"
            >
              {isLoadingUrl ? <Spinner /> : 'Load Within Inclusion Area'}
            </button>
            <p className="mt-2 text-xs text-gray-400">Only features intersecting your drawn boundary will be requested.</p>
          </div>
        )}

        <form onSubmit={handleLoadAoiArea} className="space-y-4">
          <input
            type="text"
            value={aoiPlace}
            onChange={(e) => setAoiPlace(e.target.value)}
            placeholder="City, address, or lat, lon (e.g. Austin, TX)"
            className="w-full p-3 text-sm bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
            required
          />
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-400 whitespace-nowrap">Radius</label>
            <select
              value={aoiRadiusMiles}
              onChange={(e) => setAoiRadiusMiles(Number(e.target.value))}
              className="flex-grow p-3 text-sm bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {[0.25, 0.5, 1, 2, 5, 10, 25, 50].map(mi => (
                <option key={mi} value={mi}>{mi} mile{mi !== 1 ? 's' : ''} (~{(Math.PI * mi * mi).toFixed(mi < 1 ? 2 : 0)} sq mi)</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={isLoadingUrl || !aoiPlace.trim()}
            className="w-full py-2 text-sm font-semibold text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:bg-gray-600 transition-colors"
          >
            {isLoadingUrl ? <Spinner /> : 'Load Area'}
          </button>
        </form>

        <div className="mt-4 flex gap-3">
          <button
            onClick={() => { setPendingLayer(null); setView(browseTrail.length > 0 ? 'browse' : 'upload'); }}
            className="flex-1 px-4 py-2 text-sm font-semibold text-gray-200 bg-gray-700 rounded-md hover:bg-gray-600 transition-colors"
          >
            Back
          </button>
          <button
            onClick={() => runLayerQuery(pendingLayer.url)}
            disabled={isLoadingUrl || tooBigForWholeLayer}
            title={tooBigForWholeLayer ? 'Too many features to load at once' : undefined}
            className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-gray-600 rounded-md hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {tooBigForWholeLayer ? 'Whole layer too large' : 'Load Entire Layer'}
          </button>
        </div>
      </div>
    );
  };

  const renderFeatureSelection = () => (
    <div className="w-full">
      <p className="text-gray-300 mb-6">
        Found <span className="font-bold text-cyan-400">{loadedGeoJson!.features.length}</span> features. Select which ones you want to parse:
      </p>

      <div className="bg-gray-800 rounded-lg p-4 mb-6 max-h-96 overflow-y-auto border border-gray-600">
        <div className="mb-4 pb-4 border-b border-gray-600">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedFeatureIndices.size === loadedGeoJson!.features.length}
              onChange={toggleAllFeatures}
              className="w-4 h-4 rounded accent-cyan-400"
            />
            <span className="text-gray-200 font-semibold">
              {selectedFeatureIndices.size === loadedGeoJson!.features.length ? 'Deselect All' : 'Select All'}
            </span>
          </label>
        </div>

        <div className="space-y-2">
          {loadedGeoJson!.features.map((feature, index) => {
            const props = feature.properties || {};
            const propKeys = Object.keys(props).slice(0, 2);
            const propPreview = propKeys.map(k => `${k}: ${props[k]}`).join(' | ');
            const isSelected = selectedFeatureIndices.has(index);

            return (
              <label key={index} className="flex items-start gap-2 p-2 rounded hover:bg-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleFeatureSelection(index)}
                  className="w-4 h-4 rounded accent-cyan-400 mt-1 flex-shrink-0"
                />
                <div className="text-left">
                  <div className="text-gray-200 text-sm font-medium">Feature {index + 1}</div>
                  <div className="text-gray-400 text-xs truncate">{propPreview || 'No properties'}</div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={resetToUpload}
          className="flex-1 px-4 py-2 text-sm font-semibold text-gray-200 bg-gray-700 rounded-md hover:bg-gray-600 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleUploadSelectedFeatures}
          disabled={selectedFeatureIndices.size === 0}
          className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:bg-gray-600 transition-colors"
        >
          {cameFromSearch ? 'Plot' : 'Parse'} {selectedFeatureIndices.size} Feature{selectedFeatureIndices.size !== 1 ? 's' : ''}
        </button>
      </div>
    </div>
  );

  const renderUploadView = () => (
    <>
      <p className="text-gray-300 mb-6 max-w-lg">
        Upload a GeoJSON file, or connect to any public ArcGIS server — paste a server root to browse its folders and layers, or a layer URL to load it directly.
      </p>
      <div
        className={`w-full cursor-pointer flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg transition-colors duration-300 ${isDragging ? 'border-teal-400 bg-gray-700/50' : 'border-gray-600 hover:border-teal-500'}`}
        onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop} onClick={handleClick}
      >
        <input id="gis-file-input" type="file" className="hidden" accept=".geojson,.json,application/json" onChange={handleFileChange} />
        <UploadIcon className="w-12 h-12 mb-4 text-gray-500" />
        <h2 className="text-xl font-semibold text-white">Drop your GeoJSON file here</h2>
        <p className="text-gray-400 mt-2">or click to browse</p>
      </div>

      <div className="my-6 flex items-center w-full max-w-lg">
          <div className="flex-grow border-t border-gray-600"></div>
          <span className="flex-shrink mx-4 text-gray-500 font-semibold">OR</span>
          <div className="flex-grow border-t border-gray-600"></div>
      </div>

      <div className="w-full max-w-lg space-y-4">
          <div>
              <select onChange={handleCatalogChange} defaultValue="" className="w-full p-3 text-sm bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 light-theme:bg-white light-theme:border-gray-300">
                  <option value="" disabled>Pick from the public GIS data catalog…</option>
                  {ARCGIS_DATA_CATALOG.map(group => (
                    <optgroup key={group.category} label={group.category}>
                      {group.sources.map(source => (
                        <option key={source.url} value={source.url} title={source.description}>{source.name}</option>
                      ))}
                    </optgroup>
                  ))}
              </select>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); handleFetchFromUrl(url); }} className="flex gap-2">
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="…or paste any ArcGIS server, service, layer, or query URL" className="flex-grow p-3 text-sm bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 light-theme:bg-white light-theme:border-gray-300"/>
            <button type="submit" disabled={isLoadingUrl || !url} className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:bg-gray-600">
              {isLoadingUrl ? <Spinner /> : 'Load'}
            </button>
          </form>
          <div className="flex gap-2">
            <button
              onClick={() => handleFetchFromUrl(url || ARCGIS_DATA_CATALOG[2].sources[0].url)}
              className="flex-1 py-2 text-sm font-semibold text-white bg-teal-700/60 border border-teal-600 rounded-md hover:bg-teal-700 transition-colors"
            >
              Browse a GIS Server
            </button>
            <button
              onClick={() => setView('owner-search')}
              className="flex-1 py-2 text-sm font-semibold text-white bg-cyan-600 rounded-md hover:bg-cyan-700 transition-colors"
            >
              Search by Lot Owner Name
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Looking for your county or city server? The{' '}
            <a
              href={MAPPING_SUPPORT_LIST_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-teal-400 hover:text-teal-300 underline"
            >
              MappingSupport GIS server list
            </a>{' '}
            (© Joseph Elfelt) catalogs 7,500+ public ArcGIS servers — copy a <span className="font-mono">rest/services</span> URL from it and paste it above to browse that server here.
          </p>
      </div>
    </>
  );

  return (
    <div className="relative flex flex-col items-center justify-center h-full p-8 text-center">
       <button onClick={onGoBack} className="absolute top-4 left-4 p-2 text-gray-300 hover:text-white transition-colors" title={backButtonTitle}>
        <HomeIcon className="w-6 h-6"/>
      </button>
      <div className="w-full max-w-2xl flex flex-col items-center">
        <h1 className="text-5xl sm:text-6xl font-extrabold leading-none tracking-tight text-center mb-4">
          <span className="text-white">Gis</span><span className="text-teal-400">Agent</span><span className="text-[0.5em]"><span className="text-gray-500">.</span><span className="text-white">Land</span><span className="text-cyan-400">Surv</span><span className="text-green-400">.ai</span></span><sup className="text-xl text-gray-500">™</sup>
        </h1>

        {loadedGeoJson
          ? renderFeatureSelection()
          : view === 'browse'
            ? renderBrowseView()
            : view === 'aoi'
              ? renderAoiView()
              : view === 'owner-search'
                ? renderOwnerSearchView()
                : renderUploadView()}
      </div>
    </div>
  );
};

export default GisInput;
