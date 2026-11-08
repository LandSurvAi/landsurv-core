import React, { useState, useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { type SurveyPoint, type PointList, AgentType } from '../types.ts';
import { DownloadIcon, ArrowUpTrayIcon, XMarkIcon, EraserIcon, ChevronDownIcon, ChevronUpIcon, CameraIcon, CrosshairsIcon, MapPinIcon, EyeIcon, ChevronLeftIcon, ChevronRightIcon, CpuChipIcon } from './icons.tsx';
import { PointEditorC3DSync } from './PointEditorC3DSync.tsx';
import { expandGoogleMapsShortLink, isGoogleMapsShortLink, parseGoogleMapsLatLon } from '../utils/googleMaps.ts';
import { decodePlusCode } from '../utils/plusCode.ts';
import { useErrorReporter } from '../contexts/AppStateContext';

// C3D Sync Icon
const SyncIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
    <path d="M3 3v5h5"/>
    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
    <path d="M16 16h5v5"/>
  </svg>
);

const SearchGlyph = () => (
  <svg
    aria-hidden="true"
    className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <circle cx="11" cy="11" r="7" />
    <path strokeLinecap="round" strokeLinejoin="round" d="m20 20-3.5-3.5" />
  </svg>
);

type PointSortKey = 'pn' | 'northing' | 'easting' | 'elevation' | 'description';

interface PointEditorChatProps {
  pointLists: PointList[];
  onAddPoint: (point: SurveyPoint) => void;
  onUpdatePoint: (point: SurveyPoint) => void;
  onDeletePoint: (pointNumber: string) => void;
  activeAgent: AgentType;
  onSaveUnsavedPoints: (name: string) => void;
  onMergeUnsavedPoints: (listId: string) => void;
  onRenameList: (listId: string, newName: string) => void;
  onDeleteList: (listId: string) => void;
  onToggleVisibility: (listId: string) => void;
  onToggleContext?: (listId: string) => void;
  onImportPointList: (content: string, fileName: string) => void;
  onAddPhotoToPoint: (pointNumber: string, photoData: string) => void;
  onDeletePhotoFromPoint: (pointNumber: string, photoIndex: number) => void;
  onStakeoutPoint: (pointNumber: string) => void;
  onZoomToPoint: (point: SurveyPoint) => void;
  nextAvailablePointNumber: string;
  settings: {
    coordinatePrecision: number;
  };
  // C3D Sync Props
  c3dSessionToken?: string | null;
  onImportPointsFromC3D?: (points: SurveyPoint[], sourceListName?: string) => void;
  convertLatLon?: (lat: number, lon: number) => { northing: number; easting: number } | null;
}

export interface PointEditorChatHandles {
  handleCanvasPointSelect: (point: SurveyPoint) => void;
}

export const PointEditorChat = forwardRef<PointEditorChatHandles, PointEditorChatProps>(({
  pointLists, onAddPoint, onUpdatePoint, onDeletePoint,
  activeAgent, onSaveUnsavedPoints, onMergeUnsavedPoints, onRenameList, onDeleteList, onToggleVisibility,
  onToggleContext,
  onImportPointList, onAddPhotoToPoint, onDeletePhotoFromPoint, onStakeoutPoint, onZoomToPoint,
  nextAvailablePointNumber, settings,
  c3dSessionToken, onImportPointsFromC3D, convertLatLon
}, ref) => {
  const [newPoint, setNewPoint] = useState({ pn: '', n: '', e: '', z: '', d: '' });
  const [addMode, setAddMode] = useState<'ne' | 'latlon' | 'plus'>('ne');
  const [latLonInput, setLatLonInput] = useState({ lat: '', lon: '', z: '', d: '' });
  const [plusCodeInput, setPlusCodeInput] = useState({ code: '', z: '', d: '' });
  const { reportError } = useErrorReporter();
    const [mapsLinkInput, setMapsLinkInput] = useState('');
  const [newListName, setNewListName] = useState('');
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingListName, setEditingListName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const unsavedPointsList = pointLists.find(l => l.id === 'working');
  const savedLists = pointLists.filter(l => l.id !== 'working');
  const [mergeTargetListId, setMergeTargetListId] = useState<string>('');

  const [photoTarget, setPhotoTarget] = useState<SurveyPoint | null>(null);
  const [isTakingPhoto, setIsTakingPhoto] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const photoUploadRef = useRef<HTMLInputElement>(null);

  const [expandedListIds, setExpandedListIds] = useState<Set<string>>(new Set(['working']));
  const [confirmingDelete, setConfirmingDelete] = useState<{ type: 'point' | 'list', id: string } | null>(null);
  
  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(['pn', 'northing', 'easting', 'elev', 'desc']));
  const [showColumnMenu, setShowColumnMenu] = useState<string | null>(null);

  // C3D Sync state
  const [isC3DSyncOpen, setIsC3DSyncOpen] = useState(false);
  const [selectedPointNumbers, setSelectedPointNumbers] = useState<Set<string>>(new Set());

  // Workspace filter, sorting, and quick stats.
  const [searchQuery, setSearchQuery] = useState('');
  const [listFilter, setListFilter] = useState<string>('all');
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [sortKey, setSortKey] = useState<PointSortKey>('pn');
  const [sortAscending, setSortAscending] = useState(true);
  const allPoints = useMemo(() => pointLists.flatMap(list => list.points), [pointLists]);
  const visiblePointCount = useMemo(
    () => pointLists.filter(list => list.isVisible).reduce((total, list) => total + list.points.length, 0),
    [pointLists]
  );
  const duplicatePointNumbers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const point of allPoints) {
      const key = point.pointNumber.trim().toUpperCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return new Set(
      [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key)
    );
  }, [allPoints]);
  const duplicatePointCount = duplicatePointNumbers.size;
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const matchesSearch = (point: SurveyPoint) => {
    if (!normalizedSearch) return true;
    return `${point.pointNumber} ${point.description ?? ''} ${point.northing} ${point.easting} ${point.elevation ?? ''}`
      .toLowerCase()
      .includes(normalizedSearch);
  };
  const matchesFilters = (point: SurveyPoint) => {
    if (duplicatesOnly && !duplicatePointNumbers.has(point.pointNumber.trim().toUpperCase())) {
      return false;
    }
    return matchesSearch(point);
  };
  const sortPoints = (points: SurveyPoint[]) => {
    const direction = sortAscending ? 1 : -1;
    return [...points].sort((a, b) => {
      if (sortKey === 'pn') {
        return a.pointNumber.localeCompare(b.pointNumber, undefined, { numeric: true }) * direction;
      }
      if (sortKey === 'description') {
        return (a.description ?? '').localeCompare(b.description ?? '') * direction;
      }
      return ((a[sortKey] ?? 0) - (b[sortKey] ?? 0)) * direction;
    });
  };
  const handleSort = (key: PointSortKey) => {
    if (sortKey === key) {
      setSortAscending(value => !value);
    } else {
      setSortKey(key);
      setSortAscending(true);
    }
  };
  const sortIndicator = (key: PointSortKey) =>
    sortKey === key ? (sortAscending ? ' ▲' : ' ▼') : '';
  const filteredLists = pointLists.filter(
    list => listFilter === 'all' || list.id === listFilter
  );
  const showAllLists = () =>
    pointLists.forEach(list => {
      if (!list.isVisible) onToggleVisibility(list.id);
    });
  const hideAllLists = () =>
    pointLists.forEach(list => {
      if (list.isVisible) onToggleVisibility(list.id);
    });

  // Expose handleCanvasPointSelect method via ref
  useImperativeHandle(ref, () => ({
    handleCanvasPointSelect: () => {},
  }));

  useEffect(() => {
    setNewPoint(p => ({ ...p, pn: nextAvailablePointNumber }));
  }, [nextAvailablePointNumber]);

  useEffect(() => {
    const currentSavedLists = pointLists.filter(l => l.id !== 'working');
    if (currentSavedLists.length > 0 && !currentSavedLists.some(l => l.id === mergeTargetListId)) {
        setMergeTargetListId(currentSavedLists[0].id);
    } else if (currentSavedLists.length === 0 && mergeTargetListId !== '') {
        setMergeTargetListId('');
    }
  }, [pointLists, mergeTargetListId]);

  useEffect(() => {
    if (confirmingDelete) {
        const timer = setTimeout(() => {
            setConfirmingDelete(null);
        }, 3000);
        return () => clearTimeout(timer);
    }
  }, [confirmingDelete]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    const startStream = async () => {
      if (isTakingPhoto && videoRef.current) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
          videoRef.current.srcObject = stream;
        } catch (err) {
          console.error("Camera error:", err);
          reportError({ title: 'Camera error', message: 'Could not access camera. Please check permissions.', error: err });
          setIsTakingPhoto(false);
        }
      }
    };
    startStream();
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [isTakingPhoto, reportError]);

  const handleSavePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas && photoTarget) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      context?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      onAddPhotoToPoint(photoTarget.pointNumber, dataUrl);
      setIsTakingPhoto(false);
    }
  };

  const handleUploadPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && photoTarget) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        onAddPhotoToPoint(photoTarget.pointNumber, dataUrl);
      };
      reader.readAsDataURL(file);
    }
    if (e.target) e.target.value = '';
  };
  
  const handleClosePhotoModal = () => {
    setIsTakingPhoto(false);
    setPhotoTarget(null);
  };

  const handleAddPointSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (addMode === 'plus') {
          const decoded = decodePlusCode(plusCodeInput.code);
          if (!decoded) {
              reportError({ title: 'Invalid Plus Code', message: 'Enter a full Google Plus Code such as 87G8Q2PQ+5X. Shortened codes need a reference location.' });
              return;
          }
          if (!convertLatLon) {
              reportError({ title: 'Projection required', message: 'Set a project projection before adding a point from a Plus Code.' });
              return;
          }
          const converted = convertLatLon(decoded.latitude, decoded.longitude);
          if (!converted) {
              reportError({ title: 'Conversion failed', message: 'Could not convert the Plus Code to project coordinates. Check projection settings.' });
              return;
          }
          onAddPoint({
              pointNumber: newPoint.pn,
              northing: converted.northing,
              easting: converted.easting,
              elevation: parseFloat(plusCodeInput.z) || 0,
              description: plusCodeInput.d,
              latitude: decoded.latitude,
              longitude: decoded.longitude,
          });
          setPlusCodeInput({ code: '', z: '', d: '' });
          return;
      }
      if (addMode === 'latlon' && convertLatLon) {
          const lat = parseFloat(latLonInput.lat);
          const lon = parseFloat(latLonInput.lon);
          if (isNaN(lat) || isNaN(lon)) return;
          const converted = convertLatLon(lat, lon);
          if (!converted) { reportError({ title: 'Conversion failed', message: 'Coordinate conversion failed. Check projection settings.' }); return; }
          onAddPoint({
              pointNumber: newPoint.pn,
              northing: converted.northing,
              easting: converted.easting,
              elevation: parseFloat(latLonInput.z) || 0,
              description: latLonInput.d,
              latitude: lat,
              longitude: lon,
          });
          setLatLonInput({ lat: '', lon: '', z: '', d: '' });
      } else {
          onAddPoint({
              pointNumber: newPoint.pn,
              northing: parseFloat(newPoint.n),
              easting: parseFloat(newPoint.e),
              elevation: parseFloat(newPoint.z) || 0,
              description: newPoint.d,
          });
          setNewPoint({ pn: nextAvailablePointNumber, n: '', e: '', z: '', d: '' });
      }
  };

    const handleParseMapsLink = async () => {
        let candidate = mapsLinkInput;
        let parsed = parseGoogleMapsLatLon(candidate);

        if (!parsed && isGoogleMapsShortLink(candidate)) {
            const expanded = await expandGoogleMapsShortLink(candidate);
            if (expanded) {
                candidate = expanded;
                parsed = parseGoogleMapsLatLon(candidate);
            }
        }

        if (parsed) {
            setLatLonInput(prev => ({
                ...prev,
                lat: parsed.lat.toString(),
                lon: parsed.lon.toString(),
            }));
            setMapsLinkInput(candidate);
            return;
        }

        if (isGoogleMapsShortLink(mapsLinkInput)) {
            reportError({ title: 'Link expansion failed', message: 'Could not expand that short Google Maps link automatically. Open it once in your browser, then paste the expanded URL (or lat,lon).' });
            return;
        }

        reportError({ title: 'Location not found', message: 'Could not find latitude/longitude in that link. Paste a full Google Maps URL or a "lat,lon" pair.' });
    };
  
  const handleExportPoints = () => {
    if (allPoints.length === 0) return;
    const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['List', 'Point Number', 'Northing', 'Easting', 'Elevation', 'Description', 'Photos']
        .map(csvCell)
        .join(','),
    ];
    for (const list of pointLists) {
      for (const point of list.points) {
        rows.push([
          list.name,
          point.pointNumber,
          point.northing,
          point.easting,
          point.elevation ?? 0,
          point.description ?? '',
          (point.photos ?? []).length,
        ].map(csvCell).join(','));
      }
    }
    const blob = new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `landsurv-points-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const handleImportPointsFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = loadEvent => {
      const content = typeof loadEvent.target?.result === 'string' ? loadEvent.target.result : '';
      if (content.trim()) onImportPointList(content, file.name);
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleToggleExpand = (listId: string) => {
    setExpandedListIds(prev => {
        const next = new Set(prev);
        if (next.has(listId)) {
            next.delete(listId);
        } else {
            next.add(listId);
        }
        return next;
    });
  };

  const handleDeleteClick = (type: 'point' | 'list', id: string) => {
      if (confirmingDelete?.id === id) {
          if (type === 'point') onDeletePoint(id);
          if (type === 'list') onDeleteList(id);
          setConfirmingDelete(null);
      } else {
          setConfirmingDelete({ type, id });
      }
  };

  const PointListSection: React.FC<{ list: PointList }> = ({ list }) => {
    const isExpanded = expandedListIds.has(list.id);
    const isUnsaved = list.id === 'working';
    const matchingPoints = sortPoints(list.points.filter(matchesFilters));
    
    return (
        <div className="bg-white/[0.025] rounded-xl border border-white/[0.07] light-theme:bg-gray-100/50 light-theme:border-gray-300 mb-3">
            <header 
                className="p-3 flex justify-between items-center cursor-pointer hover:bg-gray-700/30 light-theme:hover:bg-gray-200/30"
                onClick={() => handleToggleExpand(list.id)}
            >
                <div className="flex items-center gap-2 flex-grow">
                    {editingListId === list.id ? (
                        <input
                            type="text"
                            value={editingListName}
                            onChange={(e) => setEditingListName(e.target.value)}
                            onBlur={() => { onRenameList(list.id, editingListName); setEditingListId(null); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { onRenameList(list.id, editingListName); setEditingListId(null); }}}
                            autoFocus
                            className="bg-gray-600 p-1 rounded-md text-sm light-theme:bg-gray-300"
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <h4 
                            className="font-semibold text-gray-200 light-theme:text-gray-800 text-sm"
                            onDoubleClick={() => { if (!isUnsaved) { setEditingListId(list.id); setEditingListName(list.name); }}}
                        >
                            {list.name}
                        </h4>
                    )}
                    <span className="text-xs text-gray-400 light-theme:text-gray-600">
                        ({normalizedSearch ? `${matchingPoints.length}/${list.points.length}` : list.points.length})
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={(e) => { e.stopPropagation(); onToggleVisibility(list.id); }} className={`p-1.5 rounded-full text-xs ${list.isVisible ? 'text-yellow-400' : 'text-gray-500'} hover:bg-yellow-800/50`} title="Toggle Visibility"><EyeIcon className="w-3 h-3"/></button>
                    {onToggleContext && (
                        <button onClick={(e) => { e.stopPropagation(); onToggleContext(list.id); }} className={`p-1.5 rounded-full text-xs ${list.includeInContext !== false ? 'text-cyan-400' : 'text-gray-600'} hover:bg-cyan-900/40`} title={list.includeInContext !== false ? 'In agent context (click to exclude)' : 'Excluded from agent context (click to include)'}><CpuChipIcon className="w-3 h-3"/></button>
                    )}
                    {!isUnsaved && (
                        <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteClick('list', list.id); }}
                            onMouseLeave={() => confirmingDelete?.id === list.id && setConfirmingDelete(null)}
                            className={`p-1.5 rounded-full transition-all duration-200 flex items-center justify-center text-xs ${confirmingDelete?.id === list.id ? 'bg-red-500 text-white w-16' : 'text-red-400 hover:bg-red-800/50'}`}
                        >
                            {confirmingDelete?.id === list.id ? <span className="text-xs">OK?</span> : <EraserIcon className="w-3 h-3" />}
                        </button>
                    )}
                    {isExpanded ? <ChevronUpIcon className="w-4 h-4"/> : <ChevronDownIcon className="w-4 h-4"/>}
                </div>
            </header>
            {isExpanded && (
                <div className="border-t border-gray-600 light-theme:border-gray-300">
                    {matchingPoints.length > 0 ? (
                        <div className="overflow-x-auto overflow-y-hidden">
                            <div className="flex justify-end gap-1 px-2 py-1 border-b border-gray-600/50 light-theme:border-gray-300/50 bg-gray-700/20 light-theme:bg-gray-100/20">
                                <button
                                    onClick={() => setShowColumnMenu(showColumnMenu === list.id ? null : list.id)}
                                    className="text-xs px-2 py-0.5 bg-gray-600 hover:bg-gray-500 rounded text-gray-200 light-theme:bg-gray-300 light-theme:hover:bg-gray-400"
                                    title="Toggle columns"
                                >
                                    Columns
                                </button>
                                {showColumnMenu === list.id && (
                                    <div className="absolute right-2 mt-6 bg-gray-700 light-theme:bg-gray-200 border border-gray-600 light-theme:border-gray-400 rounded shadow-lg z-10 text-xs p-2">
                                        {[
                                            { id: 'pn', label: 'Point #' },
                                            { id: 'northing', label: 'Northing' },
                                            { id: 'easting', label: 'Easting' },
                                            { id: 'elev', label: 'Elevation' },
                                            { id: 'desc', label: 'Description' }
                                        ].map(col => (
                                            <label key={col.id} className="flex items-center gap-2 cursor-pointer p-1 hover:bg-gray-600 light-theme:hover:bg-gray-300 rounded">
                                                <input
                                                    type="checkbox"
                                                    checked={visibleColumns.has(col.id)}
                                                    onChange={(e) => {
                                                        const newCols = new Set(visibleColumns);
                                                        if (e.target.checked) {
                                                            newCols.add(col.id);
                                                        } else {
                                                            newCols.delete(col.id);
                                                        }
                                                        setVisibleColumns(newCols);
                                                    }}
                                                    className="accent-cyan-500"
                                                />
                                                <span className="text-gray-200 light-theme:text-gray-700">{col.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <table className="w-full text-xs border-collapse">
                                <thead className="text-gray-400 uppercase bg-gray-600/30 light-theme:bg-gray-200/50 sticky top-0">
                                    <tr>
                                        {visibleColumns.has('pn') && (
                                            <th className="px-3 py-1.5 text-left">
                                                <div className="flex items-center justify-between group hover:bg-gray-600/50 light-theme:hover:bg-gray-300/50 -mx-1 px-1 rounded whitespace-nowrap">
                                                    <button type="button" onClick={() => handleSort('pn')} className="text-left hover:text-cyan-300" title="Sort by point number">PN{sortIndicator('pn')}</button>
                                                    <button onClick={() => { const newCols = new Set(visibleColumns); newCols.delete('pn'); setVisibleColumns(newCols); }} className="ml-1 p-0.5 opacity-0 group-hover:opacity-100 rounded hover:bg-gray-500 light-theme:hover:bg-gray-400 flex-shrink-0" title="Hide PN column"><ChevronLeftIcon className="w-3 h-3"/></button>
                                                </div>
                                            </th>
                                        )}
                                        {visibleColumns.has('northing') && (
                                            <th className="px-3 py-1.5 text-left">
                                                <div className="flex items-center justify-between group hover:bg-gray-600/50 light-theme:hover:bg-gray-300/50 -mx-1 px-1 rounded whitespace-nowrap">
                                                    <button type="button" onClick={() => handleSort('northing')} className="text-left hover:text-cyan-300" title="Sort by northing">Northing{sortIndicator('northing')}</button>
                                                    <button onClick={() => { const newCols = new Set(visibleColumns); newCols.delete('northing'); setVisibleColumns(newCols); }} className="ml-1 p-0.5 opacity-0 group-hover:opacity-100 rounded hover:bg-gray-500 light-theme:hover:bg-gray-400 flex-shrink-0" title="Hide Northing column"><ChevronLeftIcon className="w-3 h-3"/></button>
                                                </div>
                                            </th>
                                        )}
                                        {visibleColumns.has('easting') && (
                                            <th className="px-3 py-1.5 text-left">
                                                <div className="flex items-center justify-between group hover:bg-gray-600/50 light-theme:hover:bg-gray-300/50 -mx-1 px-1 rounded whitespace-nowrap">
                                                    <button type="button" onClick={() => handleSort('easting')} className="text-left hover:text-cyan-300" title="Sort by easting">Easting{sortIndicator('easting')}</button>
                                                    <button onClick={() => { const newCols = new Set(visibleColumns); newCols.delete('easting'); setVisibleColumns(newCols); }} className="ml-1 p-0.5 opacity-0 group-hover:opacity-100 rounded hover:bg-gray-500 light-theme:hover:bg-gray-400 flex-shrink-0" title="Hide Easting column"><ChevronLeftIcon className="w-3 h-3"/></button>
                                                </div>
                                            </th>
                                        )}
                                        {visibleColumns.has('elev') && (
                                            <th className="px-3 py-1.5 text-left">
                                                <div className="flex items-center justify-between group hover:bg-gray-600/50 light-theme:hover:bg-gray-300/50 -mx-1 px-1 rounded whitespace-nowrap">
                                                    <button type="button" onClick={() => handleSort('elevation')} className="text-left hover:text-cyan-300" title="Sort by elevation">Elev{sortIndicator('elevation')}</button>
                                                    <button onClick={() => { const newCols = new Set(visibleColumns); newCols.delete('elev'); setVisibleColumns(newCols); }} className="ml-1 p-0.5 opacity-0 group-hover:opacity-100 rounded hover:bg-gray-500 light-theme:hover:bg-gray-400 flex-shrink-0" title="Hide Elevation column"><ChevronLeftIcon className="w-3 h-3"/></button>
                                                </div>
                                            </th>
                                        )}
                                        {visibleColumns.has('desc') && (
                                            <th className="px-3 py-1.5 text-left">
                                                <div className="flex items-center justify-between group hover:bg-gray-600/50 light-theme:hover:bg-gray-300/50 -mx-1 px-1 rounded whitespace-nowrap">
                                                    <button type="button" onClick={() => handleSort('description')} className="text-left hover:text-cyan-300" title="Sort by description">Desc{sortIndicator('description')}</button>
                                                    <button onClick={() => { const newCols = new Set(visibleColumns); newCols.delete('desc'); setVisibleColumns(newCols); }} className="ml-1 p-0.5 opacity-0 group-hover:opacity-100 rounded hover:bg-gray-500 light-theme:hover:bg-gray-400 flex-shrink-0" title="Hide Description column"><ChevronLeftIcon className="w-3 h-3"/></button>
                                                </div>
                                            </th>
                                        )}
                                        <th className="px-3 py-1.5 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {matchingPoints.map(p => (
                                        <tr key={p.pointNumber} className="border-b border-gray-600/50 hover:bg-gray-600/50 light-theme:border-gray-300/50 light-theme:hover:bg-gray-200/50 text-gray-300 light-theme:text-gray-700">
                                            {visibleColumns.has('pn') && <td className="px-3 py-1 font-mono font-bold">{p.pointNumber}</td>}
                                            {visibleColumns.has('northing') && <td className="px-3 py-1 font-mono text-xs">{p.northing.toFixed(2)}</td>}
                                            {visibleColumns.has('easting') && <td className="px-3 py-1 font-mono text-xs">{p.easting.toFixed(2)}</td>}
                                            {visibleColumns.has('elev') && <td className="px-3 py-1 font-mono text-xs">{(p.elevation ?? 0).toFixed(2)}</td>}
                                            {visibleColumns.has('desc') && <td className="px-3 py-1 font-mono text-xs truncate max-w-xs">{p.description}</td>}
                                            <td className="px-3 py-1 text-right">
                                                <div className="flex items-center justify-end gap-0.5">
                                                    <button onClick={(e) => { e.stopPropagation(); setPhotoTarget(p); }} className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-500 text-xs" title="Photo"><CameraIcon className="w-3 h-3"/></button>
                                                    <button onClick={(e) => { e.stopPropagation(); onStakeoutPoint(p.pointNumber); }} className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-500 text-xs" title="Stakeout"><CrosshairsIcon className="w-3 h-3"/></button>
                                                    <button onClick={(e) => { e.stopPropagation(); onZoomToPoint(p); }} className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-500 text-xs" title="Zoom"><MapPinIcon className="w-3 h-3"/></button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteClick('point', p.pointNumber); }} onMouseLeave={() => confirmingDelete?.id === p.pointNumber && setConfirmingDelete(null)} className={`p-1 rounded transition-all text-xs ${confirmingDelete?.id === p.pointNumber ? 'bg-red-500 text-white' : 'text-red-400 hover:bg-red-800'}`} title="Delete">
                                                        {confirmingDelete?.id === p.pointNumber ? <span className="text-xs">OK</span> : <EraserIcon className="w-3 h-3" />}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="p-3 text-xs text-gray-500 light-theme:text-gray-600">
                            {list.points.length === 0
                              ? 'Empty'
                              : `No points match${searchQuery.trim() ? ` “${searchQuery.trim()}”` : ''}${duplicatesOnly ? ' with duplicate point numbers' : ''}.`}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
  };

  return (
    <div className="w-full h-full bg-[#0b111a] text-sm text-slate-200 flex flex-col light-theme:bg-gray-50 light-theme:text-gray-600 overflow-hidden">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt,.pnl,.pnezd"
          className="hidden"
          onChange={handleImportPointsFile}
        />
        <div className="flex-shrink-0 border-b border-white/[0.07] bg-[#0b111a]/90 px-3.5 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-100">Point Workspace</h2>
                <span className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-yellow-300">
                  Live
                </span>
              </div>
              <p className="mt-0.5 text-[10.5px] text-slate-400">
                {allPoints.length.toLocaleString()} points · {savedLists.length + (unsavedPointsList ? 1 : 0)} lists
                {visiblePointCount !== allPoints.length ? ` · ${visiblePointCount.toLocaleString()} visible` : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-1.5 py-1 text-[10px] font-semibold text-slate-300 transition-colors hover:border-white/[0.15] hover:bg-white/[0.07] hover:text-white"
                title="Import a point file"
              >
                <ArrowUpTrayIcon className="h-3 w-3" />
                Import
              </button>
              <button
                type="button"
                onClick={handleExportPoints}
                disabled={allPoints.length === 0}
                className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-1.5 py-1 text-[10px] font-semibold text-slate-300 transition-colors hover:border-white/[0.15] hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                title="Export all points as CSV"
              >
                <DownloadIcon className="h-3 w-3" />
                Export
              </button>
            </div>
          </div>
          <div className="relative mt-2.5">
            <SearchGlyph />
            <input
              type="search"
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="Search point #, description, or coordinates..."
              aria-label="Search points"
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] py-1.5 pl-8 pr-8 text-[11px] text-slate-200 placeholder:text-slate-500 focus:border-yellow-500/40 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
                aria-label="Clear point search"
              >
                <XMarkIcon className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded border border-white/[0.07] bg-white/[0.025] px-1.5 py-0.5 text-[9.5px] font-medium text-slate-400">
              {allPoints.length} total
            </span>
            <span className="rounded border border-yellow-500/20 bg-yellow-500/[0.06] px-1.5 py-0.5 text-[9.5px] font-medium text-yellow-300/90">
              {unsavedPointsList?.points.length ?? 0} unsaved
            </span>
            {duplicatePointCount > 0 && (
              <span
                className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9.5px] font-medium text-amber-300"
                title="The same point number appears in more than one list."
              >
                {duplicatePointCount} duplicate PN{duplicatePointCount === 1 ? '' : 's'}
              </span>
            )}
            <span className="rounded border border-white/[0.07] bg-white/[0.025] px-1.5 py-0.5 text-[9.5px] font-medium text-slate-400">
              {visiblePointCount} visible
            </span>
            <select
              value={listFilter}
              onChange={event => setListFilter(event.target.value)}
              aria-label="Filter by point list"
              className="rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[9.5px] text-slate-300 focus:border-yellow-500/40 focus:outline-none"
            >
              <option value="all">All lists</option>
              <option value="working">Unsaved only</option>
              {savedLists.map(list => (
                <option key={list.id} value={list.id}>{list.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setDuplicatesOnly(value => !value)}
              aria-pressed={duplicatesOnly}
              className={`rounded border px-1.5 py-0.5 text-[9.5px] font-semibold transition-colors ${
                duplicatesOnly
                  ? 'border-amber-500/50 bg-amber-500/15 text-amber-200'
                  : 'border-white/[0.07] bg-white/[0.025] text-slate-400 hover:border-white/[0.16] hover:text-slate-200'
              }`}
              title="Show only duplicate point numbers"
            >
              Duplicates only
            </button>
            <button
              type="button"
              onClick={showAllLists}
              className="rounded border border-white/[0.07] bg-white/[0.025] px-1.5 py-0.5 text-[9.5px] font-semibold text-slate-400 transition-colors hover:border-white/[0.16] hover:text-slate-200"
              title="Show every point list on the canvas"
            >
              Show all
            </button>
            <button
              type="button"
              onClick={hideAllLists}
              className="rounded border border-white/[0.07] bg-white/[0.025] px-1.5 py-0.5 text-[9.5px] font-semibold text-slate-400 transition-colors hover:border-white/[0.16] hover:text-slate-200"
              title="Hide every point list on the canvas"
            >
              Hide all
            </button>
          </div>
        </div>
        {photoTarget && (
            <div className="fixed inset-0 bg-gray-900/80 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={handleClosePhotoModal}>
                <div className="bg-gray-800 p-4 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                    <h3 className="text-lg font-bold text-yellow-400 mb-2">Point {photoTarget.pointNumber}</h3>
                    {isTakingPhoto && (
                        <div className="mb-4">
                            <video ref={videoRef} autoPlay playsInline className="w-full rounded-md bg-black"></video>
                            <canvas ref={canvasRef} className="hidden"></canvas>
                        </div>
                    )}
                    <div className="flex justify-end gap-2">
                        <input type="file" accept="image/*" ref={photoUploadRef} onChange={handleUploadPhoto} className="hidden" />
                        <button onClick={() => photoUploadRef.current?.click()} className="px-3 py-1.5 text-xs font-semibold bg-gray-600 hover:bg-gray-500 rounded-md">Upload</button>
                        <button onClick={() => setIsTakingPhoto(p => !p)} className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 rounded-md">{isTakingPhoto ? 'Close' : 'Camera'}</button>
                        {isTakingPhoto && <button onClick={handleSavePhoto} className="px-3 py-1.5 text-xs font-semibold bg-green-600 hover:bg-green-700 rounded-md">Capture</button>}
                    </div>
                </div>
            </div>
        )}
        
        <div className="flex-grow p-3.5 space-y-3 flex flex-col overflow-y-auto scrollbar-hide">
            {/* Add Point Form */}
            <div className="bg-white/[0.025] rounded-xl p-3 border border-white/[0.08] light-theme:bg-gray-100/50 light-theme:border-gray-300 flex-shrink-0">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-300 light-theme:text-cyan-600">New point</h3>
                    {/* C3D Sync Button */}
                    {c3dSessionToken && (
                        <button
                            onClick={() => setIsC3DSyncOpen(true)}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-semibold bg-yellow-600/80 hover:bg-yellow-600 text-white rounded-md transition-colors"
                            title="Sync points with Civil 3D"
                        >
                            <SyncIcon />
                            <span>C3D Sync</span>
                        </button>
                    )}
                </div>
                <form onSubmit={handleAddPointSubmit} className="space-y-2">
                    {convertLatLon && (
                        <div className="flex rounded overflow-hidden border border-gray-500 text-[10px] font-semibold w-fit">
                            <button type="button" onClick={() => setAddMode('ne')} className={`px-2 py-0.5 transition-colors ${addMode === 'ne' ? 'bg-cyan-700 text-white' : 'text-gray-400 hover:bg-gray-600'}`}>N/E</button>
                            <button type="button" onClick={() => setAddMode('latlon')} className={`px-2 py-0.5 transition-colors ${addMode === 'latlon' ? 'bg-cyan-700 text-white' : 'text-gray-400 hover:bg-gray-600'}`}>Lat/Lon</button>
                            <button type="button" onClick={() => setAddMode('plus')} className={`px-2 py-0.5 transition-colors ${addMode === 'plus' ? 'bg-cyan-700 text-white' : 'text-gray-400 hover:bg-gray-600'}`}>Plus Code</button>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                        <input type="text" placeholder="PN" required value={newPoint.pn} onChange={e => setNewPoint(p => ({...p, pn: e.target.value}))} className="p-1.5 text-xs bg-gray-600 border border-gray-500 rounded-md light-theme:bg-gray-200 light-theme:border-gray-400" />
                        {addMode === 'plus' ? (<>
                            <input type="text" placeholder="Google Plus Code (full, e.g. 87G8Q2PQ+5X)" required value={plusCodeInput.code} onChange={e => setPlusCodeInput(p => ({...p, code: e.target.value}))} className="col-span-2 p-1.5 text-xs bg-gray-600 border border-cyan-700/60 rounded-md font-mono uppercase" />
                            <input type="number" step="any" placeholder="Elevation" value={plusCodeInput.z} onChange={e => setPlusCodeInput(p => ({...p, z: e.target.value}))} className="p-1.5 text-xs bg-gray-600 border border-gray-500 rounded-md light-theme:bg-gray-200 light-theme:border-gray-400" />
                        </>) : addMode === 'ne' ? (<>
                            <input type="number" step="any" placeholder="Northing" required value={newPoint.n} onChange={e => setNewPoint(p => ({...p, n: e.target.value}))} className="p-1.5 text-xs bg-gray-600 border border-gray-500 rounded-md light-theme:bg-gray-200 light-theme:border-gray-400" />
                            <input type="number" step="any" placeholder="Easting" required value={newPoint.e} onChange={e => setNewPoint(p => ({...p, e: e.target.value}))} className="p-1.5 text-xs bg-gray-600 border border-gray-500 rounded-md light-theme:bg-gray-200 light-theme:border-gray-400" />
                            <input type="number" step="any" placeholder="Elevation" value={newPoint.z} onChange={e => setNewPoint(p => ({...p, z: e.target.value}))} className="p-1.5 text-xs bg-gray-600 border border-gray-500 rounded-md light-theme:bg-gray-200 light-theme:border-gray-400" />
                        </>) : (<>
                            <input type="text" placeholder="Google Maps link or lat,lon" value={mapsLinkInput} onChange={e => setMapsLinkInput(e.target.value)} className="col-span-2 p-1.5 text-xs bg-gray-600 border border-cyan-700/60 rounded-md" />
                            <button type="button" onClick={handleParseMapsLink} className="col-span-2 p-1.5 text-xs bg-cyan-700 text-white font-semibold rounded-md hover:bg-cyan-800 transition-colors">Parse Link</button>
                            <input type="number" step="any" placeholder="Latitude (decimal)" required value={latLonInput.lat} onChange={e => setLatLonInput(p => ({...p, lat: e.target.value}))} className="p-1.5 text-xs bg-gray-600 border border-cyan-700/60 rounded-md" />
                            <input type="number" step="any" placeholder="Longitude (decimal)" required value={latLonInput.lon} onChange={e => setLatLonInput(p => ({...p, lon: e.target.value}))} className="p-1.5 text-xs bg-gray-600 border border-cyan-700/60 rounded-md" />
                            <input type="number" step="any" placeholder="Elevation" value={latLonInput.z} onChange={e => setLatLonInput(p => ({...p, z: e.target.value}))} className="p-1.5 text-xs bg-gray-600 border border-gray-500 rounded-md" />
                        </>)}
                    </div>
                    <input type="text" placeholder="Description" value={addMode === 'ne' ? newPoint.d : addMode === 'plus' ? plusCodeInput.d : latLonInput.d} onChange={e => addMode === 'ne' ? setNewPoint(p => ({...p, d: e.target.value})) : addMode === 'plus' ? setPlusCodeInput(p => ({...p, d: e.target.value})) : setLatLonInput(p => ({...p, d: e.target.value}))} className="w-full p-1.5 text-xs bg-gray-600 border border-gray-500 rounded-md light-theme:bg-gray-200 light-theme:border-gray-400" />
                    <button type="submit" className="w-full py-1.5 bg-cyan-600 text-white font-semibold rounded-md hover:bg-cyan-700 transition-colors text-xs">
                        {addMode === 'latlon' ? 'Convert & Add Point' : addMode === 'plus' ? 'Add Point from Plus Code' : 'Add Point'}
                    </button>
                </form>
            </div>

            {/* Unsaved Points Alert */}
            {unsavedPointsList && unsavedPointsList.points.length > 0 && (
                 <div className="p-3 bg-amber-500/[0.06] border border-amber-500/25 rounded-xl space-y-2 flex-shrink-0">
                    <p className="text-xs text-yellow-300">({unsavedPointsList.points.length} unsaved)</p>
                    <div className="grid grid-cols-1 gap-2">
                        <form onSubmit={(e) => { e.preventDefault(); onSaveUnsavedPoints(newListName); setNewListName(''); }} className="flex gap-1.5">
                            <input type="text" value={newListName} onChange={e => setNewListName(e.target.value)} placeholder="Name..." required className="flex-grow p-1.5 text-xs bg-gray-700 border border-gray-600 rounded-md light-theme:bg-gray-200 light-theme:border-gray-400"/>
                            <button type="submit" className="px-2.5 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-md hover:bg-green-700">Save</button>
                        </form>
                        <div className="flex gap-1.5">
                             <select value={mergeTargetListId} onChange={e => setMergeTargetListId(e.target.value)} disabled={savedLists.length === 0} className="flex-grow p-1.5 text-xs bg-gray-700 border border-gray-600 rounded-md disabled:opacity-50 light-theme:bg-gray-200 light-theme:border-gray-400">
                                {savedLists.length > 0 ? (
                                    savedLists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)
                                ) : (
                                    <option>No lists</option>
                                )}
                             </select>
                             <button onClick={() => onMergeUnsavedPoints(mergeTargetListId)} disabled={savedLists.length === 0} className="px-2.5 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">Merge</button>
                        </div>
                    </div>
                 </div>
            )}
            
            {/* Point Lists - No scroll */}
            <div className="flex-grow min-h-0">
                <div className="space-y-3 pr-2">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-yellow-300 light-theme:text-yellow-700">Points</h3>
                      <span className="text-[9.5px] text-slate-500">
                        {filteredLists.length} of {pointLists.length} list{pointLists.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    {filteredLists.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-white/[0.08] p-3 text-center text-[10.5px] text-slate-500">
                        No point lists match this filter.
                      </p>
                    ) : (
                      filteredLists.map(list => <PointListSection key={list.id} list={list} />)
                    )}
                </div>
            </div>
        </div>
        
        {/* C3D Sync Modal */}
        <PointEditorC3DSync
            isOpen={isC3DSyncOpen}
            onClose={() => setIsC3DSyncOpen(false)}
            pointLists={pointLists}
            selectedPointNumbers={selectedPointNumbers}
            sessionToken={c3dSessionToken || null}
            onImportPoints={(points) => {
                if (onImportPointsFromC3D) {
                    onImportPointsFromC3D(points);
                }
            }}
            onSyncComplete={(result) => {
                console.log('[PointEditor] C3D Sync complete:', result);
            }}
        />
    </div>
);
});

PointEditorChat.displayName = 'PointEditorChat';
