import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { type SurveyPoint, type PointList, AgentType } from '../types.ts';
import { DownloadIcon, EraserIcon, ChevronDownIcon, ChevronUpIcon, CameraIcon, CrosshairsIcon, MapPinIcon, EyeIcon, ChevronLeftIcon, ChevronRightIcon, CpuChipIcon } from './icons.tsx';
import { PointEditorC3DSync } from './PointEditorC3DSync.tsx';
import { expandGoogleMapsShortLink, isGoogleMapsShortLink, parseGoogleMapsLatLon } from '../utils/googleMaps.ts';
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
  const [addMode, setAddMode] = useState<'ne' | 'latlon'>('ne');
  const [latLonInput, setLatLonInput] = useState({ lat: '', lon: '', z: '', d: '' });
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
    
    return (
        <div className="bg-gray-700/50 rounded-lg border border-gray-600 light-theme:bg-gray-100/50 light-theme:border-gray-300 mb-3">
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
                    <span className="text-xs text-gray-400 light-theme:text-gray-600">({list.points.length})</span>
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
                    {list.points.length > 0 ? (
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
                                                    <span>PN</span>
                                                    <button onClick={() => { const newCols = new Set(visibleColumns); newCols.delete('pn'); setVisibleColumns(newCols); }} className="ml-1 p-0.5 opacity-0 group-hover:opacity-100 rounded hover:bg-gray-500 light-theme:hover:bg-gray-400 flex-shrink-0" title="Hide PN column"><ChevronLeftIcon className="w-3 h-3"/></button>
                                                </div>
                                            </th>
                                        )}
                                        {visibleColumns.has('northing') && (
                                            <th className="px-3 py-1.5 text-left">
                                                <div className="flex items-center justify-between group hover:bg-gray-600/50 light-theme:hover:bg-gray-300/50 -mx-1 px-1 rounded whitespace-nowrap">
                                                    <span>Northing</span>
                                                    <button onClick={() => { const newCols = new Set(visibleColumns); newCols.delete('northing'); setVisibleColumns(newCols); }} className="ml-1 p-0.5 opacity-0 group-hover:opacity-100 rounded hover:bg-gray-500 light-theme:hover:bg-gray-400 flex-shrink-0" title="Hide Northing column"><ChevronLeftIcon className="w-3 h-3"/></button>
                                                </div>
                                            </th>
                                        )}
                                        {visibleColumns.has('easting') && (
                                            <th className="px-3 py-1.5 text-left">
                                                <div className="flex items-center justify-between group hover:bg-gray-600/50 light-theme:hover:bg-gray-300/50 -mx-1 px-1 rounded whitespace-nowrap">
                                                    <span>Easting</span>
                                                    <button onClick={() => { const newCols = new Set(visibleColumns); newCols.delete('easting'); setVisibleColumns(newCols); }} className="ml-1 p-0.5 opacity-0 group-hover:opacity-100 rounded hover:bg-gray-500 light-theme:hover:bg-gray-400 flex-shrink-0" title="Hide Easting column"><ChevronLeftIcon className="w-3 h-3"/></button>
                                                </div>
                                            </th>
                                        )}
                                        {visibleColumns.has('elev') && (
                                            <th className="px-3 py-1.5 text-left">
                                                <div className="flex items-center justify-between group hover:bg-gray-600/50 light-theme:hover:bg-gray-300/50 -mx-1 px-1 rounded whitespace-nowrap">
                                                    <span>Elev</span>
                                                    <button onClick={() => { const newCols = new Set(visibleColumns); newCols.delete('elev'); setVisibleColumns(newCols); }} className="ml-1 p-0.5 opacity-0 group-hover:opacity-100 rounded hover:bg-gray-500 light-theme:hover:bg-gray-400 flex-shrink-0" title="Hide Elevation column"><ChevronLeftIcon className="w-3 h-3"/></button>
                                                </div>
                                            </th>
                                        )}
                                        {visibleColumns.has('desc') && (
                                            <th className="px-3 py-1.5 text-left">
                                                <div className="flex items-center justify-between group hover:bg-gray-600/50 light-theme:hover:bg-gray-300/50 -mx-1 px-1 rounded whitespace-nowrap">
                                                    <span>Desc</span>
                                                    <button onClick={() => { const newCols = new Set(visibleColumns); newCols.delete('desc'); setVisibleColumns(newCols); }} className="ml-1 p-0.5 opacity-0 group-hover:opacity-100 rounded hover:bg-gray-500 light-theme:hover:bg-gray-400 flex-shrink-0" title="Hide Description column"><ChevronLeftIcon className="w-3 h-3"/></button>
                                                </div>
                                            </th>
                                        )}
                                        <th className="px-3 py-1.5 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {list.points.map(p => (
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
                        <p className="p-3 text-xs text-gray-500 light-theme:text-gray-600">Empty</p>
                    )}
                </div>
            )}
        </div>
    );
  };

  return (
    <div className="w-full h-full bg-gray-800 text-sm text-gray-300 flex flex-col light-theme:bg-gray-50 light-theme:text-gray-600 overflow-hidden">
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
        
        <div className="flex-grow p-4 space-y-3 flex flex-col overflow-y-auto scrollbar-hide">
            {/* Add Point Form */}
            <div className="bg-gray-700/50 rounded-lg p-3 border border-gray-600 light-theme:bg-gray-100/50 light-theme:border-gray-300 flex-shrink-0">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-cyan-400 light-theme:text-cyan-600">New Point</h3>
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
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                        <input type="text" placeholder="PN" required value={newPoint.pn} onChange={e => setNewPoint(p => ({...p, pn: e.target.value}))} className="p-1.5 text-xs bg-gray-600 border border-gray-500 rounded-md light-theme:bg-gray-200 light-theme:border-gray-400" />
                        {addMode === 'ne' ? (<>
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
                    <input type="text" placeholder="Description" value={addMode === 'ne' ? newPoint.d : latLonInput.d} onChange={e => addMode === 'ne' ? setNewPoint(p => ({...p, d: e.target.value})) : setLatLonInput(p => ({...p, d: e.target.value}))} className="w-full p-1.5 text-xs bg-gray-600 border border-gray-500 rounded-md light-theme:bg-gray-200 light-theme:border-gray-400" />
                    <button type="submit" className="w-full py-1.5 bg-cyan-600 text-white font-semibold rounded-md hover:bg-cyan-700 transition-colors text-xs">
                        {addMode === 'latlon' ? 'Convert & Add Point' : 'Add Point'}
                    </button>
                </form>
            </div>

            {/* Unsaved Points Alert */}
            {unsavedPointsList && unsavedPointsList.points.length > 0 && (
                 <div className="p-3 bg-yellow-900/20 border border-yellow-500/30 rounded-lg space-y-2 flex-shrink-0">
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
                    <h3 className="text-sm font-semibold text-purple-400 mb-2 light-theme:text-purple-600">Points</h3>
                    <PointListSection list={unsavedPointsList || { id: 'working', name: 'Unsaved', points: [], isVisible: true }} />
                    {savedLists.map(list => <PointListSection key={list.id} list={list} />)}
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
