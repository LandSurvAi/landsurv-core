import React, { useState, useRef, useEffect } from 'react';
import { type SurveyPoint, type PointList, AgentType } from '../types.ts';
import { DownloadIcon, EraserIcon, FullscreenIcon, ExitFullscreenIcon, ChevronDownIcon, ChevronUpIcon, ArrowUpTrayIcon, CameraIcon, XMarkIcon, CrosshairsIcon, MapPinIcon, EyeIcon } from './icons.tsx';
import { expandGoogleMapsShortLink, isGoogleMapsShortLink, parseGoogleMapsLatLon } from '../utils/googleMaps.ts';
import { useErrorReporter } from '../contexts/AppStateContext';

interface PointEditorPanelProps {
  pointLists: PointList[];
  onAddPoint: (point: SurveyPoint) => void;
  onUpdatePoint: (point: SurveyPoint) => void;
  onDeletePoint: (pointNumber: string) => void;
  // FIX: Added missing 'activeAgent' prop to satisfy type requirements.
  activeAgent: AgentType;
  onSaveUnsavedPoints: (name: string) => void;
  onMergeUnsavedPoints: (listId: string) => void;
  onRenameList: (listId: string, newName: string) => void;
  onDeleteList: (listId: string) => void;
  onToggleVisibility: (listId: string) => void;
  onImportPointList: (content: string, fileName: string) => void;
  onAddPhotoToPoint: (pointNumber: string, photoData: string) => void;
  onDeletePhotoFromPoint: (pointNumber: string, photoIndex: number) => void;
  onStakeoutPoint: (pointNumber: string) => void;
  onZoomToPoint: (point: SurveyPoint) => void;
  nextAvailablePointNumber: string;
  convertLatLon?: (lat: number, lon: number) => { northing: number; easting: number } | null;
}

export const PointEditorPanel: React.FC<PointEditorPanelProps> = ({
  pointLists, onAddPoint, onUpdatePoint, onDeletePoint, 
  onSaveUnsavedPoints, onMergeUnsavedPoints, onRenameList, onDeleteList, onToggleVisibility,
  onImportPointList, onAddPhotoToPoint, onDeletePhotoFromPoint, onStakeoutPoint, onZoomToPoint,
  nextAvailablePointNumber, convertLatLon
}) => {
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
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 light-theme:bg-gray-100/50 light-theme:border-gray-300">
            <header 
                className="p-3 flex justify-between items-center cursor-pointer"
                onClick={() => handleToggleExpand(list.id)}
            >
                <div className="flex items-center gap-2">
                    {editingListId === list.id ? (
                        <input
                            type="text"
                            value={editingListName}
                            onChange={(e) => setEditingListName(e.target.value)}
                            onBlur={() => { onRenameList(list.id, editingListName); setEditingListId(null); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { onRenameList(list.id, editingListName); setEditingListId(null); }}}
                            autoFocus
                            className="bg-gray-700 p-1 rounded-md text-sm"
                        />
                    ) : (
                        <h4 
                            className="font-semibold text-gray-200 light-theme:text-gray-800"
                            onDoubleClick={() => { if (!isUnsaved) { setEditingListId(list.id); setEditingListName(list.name); }}}
                        >
                            {list.name}
                        </h4>
                    )}
                    <span className="text-xs text-gray-400">({list.points.length} points)</span>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); onToggleVisibility(list.id); }} className={`p-1.5 rounded-full ${list.isVisible ? 'text-yellow-400' : 'text-gray-500'} hover:bg-yellow-800/50`} title="Toggle Visibility"><EyeIcon className="w-4 h-4"/></button>
                    {!isUnsaved && (
                        <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteClick('list', list.id); }}
                            onMouseLeave={() => confirmingDelete?.id === list.id && setConfirmingDelete(null)}
                            className={`p-1.5 rounded-full transition-all duration-200 flex items-center justify-center ${confirmingDelete?.id === list.id ? 'bg-red-500 text-white w-20' : 'text-red-400 hover:bg-red-800/50'}`}
                        >
                            {confirmingDelete?.id === list.id ? <span className="text-xs px-1">Confirm?</span> : <EraserIcon className="w-4 h-4" />}
                        </button>
                    )}
                    {isExpanded ? <ChevronUpIcon className="w-5 h-5"/> : <ChevronDownIcon className="w-5 h-5"/>}
                </div>
            </header>
            {isExpanded && (
                <div className="border-t border-gray-700 light-theme:border-gray-300">
                    {list.points.length > 0 ? (
                        <div className="overflow-x-auto overflow-y-hidden">
                            <table className="w-full text-xs text-left">
                                <thead className="text-gray-400 uppercase bg-gray-700/30 light-theme:bg-gray-200/50">
                                    <tr>
                                        <th className="px-4 py-2">PN</th>
                                        <th className="px-4 py-2">Northing</th>
                                        <th className="px-4 py-2">Easting</th>
                                        <th className="px-4 py-2">Elev</th>
                                        <th className="px-4 py-2">Desc</th>
                                        <th className="px-4 py-2 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {list.points.map(p => (
                                        <tr key={p.pointNumber} className="border-b border-gray-700/50 hover:bg-gray-700/50 light-theme:border-gray-300/50 light-theme:hover:bg-gray-200/50">
                                            <td className="px-4 py-1.5 font-mono font-bold">{p.pointNumber}</td>
                                            <td className="px-4 py-1.5 font-mono">{p.northing.toFixed(2)}</td>
                                            <td className="px-4 py-1.5 font-mono">{p.easting.toFixed(2)}</td>
                                            <td className="px-4 py-1.5 font-mono">{(p.elevation ?? 0).toFixed(2)}</td>
                                            <td className="px-4 py-1.5 font-mono truncate max-w-xs">{p.description}</td>
                                            <td className="px-4 py-1.5 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button onClick={() => { setPhotoTarget(p); }} className="p-1 text-gray-400 hover:text-white rounded-full hover:bg-gray-600" title="Add Photo"><CameraIcon className="w-4 h-4"/></button>
                                                    <button onClick={() => onStakeoutPoint(p.pointNumber)} className="p-1 text-gray-400 hover:text-white rounded-full hover:bg-gray-600" title="Stakeout Point"><CrosshairsIcon className="w-4 h-4"/></button>
                                                    <button onClick={() => onZoomToPoint(p)} className="p-1 text-gray-400 hover:text-white rounded-full hover:bg-gray-600" title="Zoom to Point"><MapPinIcon className="w-4 h-4"/></button>
                                                    <button onClick={() => handleDeleteClick('point', p.pointNumber)} onMouseLeave={() => confirmingDelete?.id === p.pointNumber && setConfirmingDelete(null)} className={`p-1 rounded-full transition-all ${confirmingDelete?.id === p.pointNumber ? 'bg-red-500 text-white' : 'text-red-400 hover:bg-red-800'}`} title="Delete Point">
                                                        {confirmingDelete?.id === p.pointNumber ? <span className="text-xs px-1">Sure?</span> : <EraserIcon className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="p-4 text-sm text-gray-500">This list is empty.</p>
                    )}
                </div>
            )}
        </div>
    );
  };

  return (
    <div className="w-full h-full bg-gray-800 text-sm text-gray-300 flex flex-col light-theme:bg-gray-50 light-theme:text-gray-600">
        {photoTarget && (
            <div className="fixed inset-0 bg-gray-900/80 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={handleClosePhotoModal}>
                <div className="bg-gray-800 p-4 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                    <h3 className="text-lg font-bold text-yellow-400 mb-2">Add Photo to Point {photoTarget.pointNumber}</h3>
                    {isTakingPhoto && (
                        <div className="mb-4">
                            <video ref={videoRef} autoPlay playsInline className="w-full rounded-md bg-black"></video>
                            <canvas ref={canvasRef} className="hidden"></canvas>
                        </div>
                    )}
                    <div className="flex justify-end gap-4">
                        <input type="file" accept="image/*" ref={photoUploadRef} onChange={handleUploadPhoto} className="hidden" />
                        <button onClick={() => photoUploadRef.current?.click()} className="px-4 py-2 text-sm font-semibold bg-gray-600 hover:bg-gray-500 rounded-md">Upload Photo</button>
                        <button onClick={() => setIsTakingPhoto(p => !p)} className="px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 rounded-md">{isTakingPhoto ? 'Close Camera' : 'Open Camera'}</button>
                        {isTakingPhoto && <button onClick={handleSavePhoto} className="px-4 py-2 text-sm font-semibold bg-green-600 hover:bg-green-700 rounded-md">Take Photo</button>}
                    </div>
                </div>
            </div>
        )}
        
        <div className="flex-grow p-3 space-y-4 overflow-y-auto">
            {unsavedPointsList && unsavedPointsList.points.length > 0 && (
                 <div className="p-3 bg-yellow-900/20 border border-yellow-500/30 rounded-lg space-y-3">
                    <p className="text-xs text-yellow-300">You have {unsavedPointsList.points.length} unsaved point(s).</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <form onSubmit={(e) => { e.preventDefault(); onSaveUnsavedPoints(newListName); setNewListName(''); }} className="flex gap-2">
                            <input type="text" value={newListName} onChange={e => setNewListName(e.target.value)} placeholder="New list name..." required className="flex-grow p-1.5 text-xs bg-gray-700 border border-gray-600 rounded-md"/>
                            <button type="submit" className="px-3 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-md hover:bg-green-700">Save as New List</button>
                        </form>
                        <div className="flex gap-2">
                             <select value={mergeTargetListId} onChange={e => setMergeTargetListId(e.target.value)} disabled={savedLists.length === 0} className="flex-grow p-1.5 text-xs bg-gray-700 border border-gray-600 rounded-md disabled:opacity-50">
                                {savedLists.length > 0 ? (
                                    savedLists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)
                                ) : (
                                    <option>No saved lists available</option>
                                )}
                             </select>
                             <button onClick={() => onMergeUnsavedPoints(mergeTargetListId)} disabled={savedLists.length === 0} className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">Merge Into</button>
                        </div>
                    </div>
                 </div>
            )}
            
             <PointListSection list={unsavedPointsList || { id: 'working', name: 'Unsaved Points', points: [], isVisible: true }} />
             {savedLists.map(list => <PointListSection key={list.id} list={list} />)}
        </div>
        
        <div className="flex-shrink-0 p-3 border-t border-gray-700 bg-gray-900/50 light-theme:border-gray-300 light-theme:bg-white/50">
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-400">Add Point</span>
                {convertLatLon && (
                    <div className="flex rounded overflow-hidden border border-gray-600 text-[10px] font-semibold">
                        <button onClick={() => setAddMode('ne')} className={`px-2 py-0.5 transition-colors ${addMode === 'ne' ? 'bg-cyan-700 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>N/E</button>
                        <button onClick={() => setAddMode('latlon')} className={`px-2 py-0.5 transition-colors ${addMode === 'latlon' ? 'bg-cyan-700 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>Lat/Lon</button>
                    </div>
                )}
            </div>
            <form onSubmit={handleAddPointSubmit} className="grid grid-cols-12 gap-2 items-center">
                <input type="text" placeholder="PN" required value={newPoint.pn} onChange={e => setNewPoint(p => ({...p, pn: e.target.value}))} className="col-span-2 p-1.5 text-xs bg-gray-700 border border-gray-600 rounded-md" />
                {addMode === 'ne' ? (<>
                    <input type="number" step="any" placeholder="Northing" required value={newPoint.n} onChange={e => setNewPoint(p => ({...p, n: e.target.value}))} className="col-span-3 p-1.5 text-xs bg-gray-700 border border-gray-600 rounded-md" />
                    <input type="number" step="any" placeholder="Easting"  required value={newPoint.e} onChange={e => setNewPoint(p => ({...p, e: e.target.value}))} className="col-span-3 p-1.5 text-xs bg-gray-700 border border-gray-600 rounded-md" />
                    <input type="number" step="any" placeholder="Elev" value={newPoint.z} onChange={e => setNewPoint(p => ({...p, z: e.target.value}))} className="col-span-2 p-1.5 text-xs bg-gray-700 border border-gray-600 rounded-md" />
                    <input type="text" placeholder="Desc" value={newPoint.d} onChange={e => setNewPoint(p => ({...p, d: e.target.value}))} className="col-span-2 p-1.5 text-xs bg-gray-700 border border-gray-600 rounded-md" />
                </>) : (<>
                    <input type="text" placeholder="Paste Google Maps link or lat,lon" value={mapsLinkInput} onChange={e => setMapsLinkInput(e.target.value)} className="col-span-8 p-1.5 text-xs bg-gray-700 border border-cyan-700/60 rounded-md" />
                    <button type="button" onClick={handleParseMapsLink} className="col-span-4 p-1.5 text-xs bg-cyan-700 text-white font-semibold rounded-md hover:bg-cyan-800 transition-colors">Parse Link</button>
                    <input type="number" step="any" placeholder="Latitude (decimal)" required value={latLonInput.lat} onChange={e => setLatLonInput(p => ({...p, lat: e.target.value}))} className="col-span-3 p-1.5 text-xs bg-gray-700 border border-cyan-700/60 rounded-md" />
                    <input type="number" step="any" placeholder="Longitude (decimal)" required value={latLonInput.lon} onChange={e => setLatLonInput(p => ({...p, lon: e.target.value}))} className="col-span-3 p-1.5 text-xs bg-gray-700 border border-cyan-700/60 rounded-md" />
                    <input type="number" step="any" placeholder="Elev" value={latLonInput.z} onChange={e => setLatLonInput(p => ({...p, z: e.target.value}))} className="col-span-2 p-1.5 text-xs bg-gray-700 border border-gray-600 rounded-md" />
                    <input type="text" placeholder="Desc" value={latLonInput.d} onChange={e => setLatLonInput(p => ({...p, d: e.target.value}))} className="col-span-2 p-1.5 text-xs bg-gray-700 border border-gray-600 rounded-md" />
                </>)}
                <button type="submit" className="col-span-12 w-full mt-2 py-1.5 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 transition-colors text-xs">
                    {addMode === 'latlon' ? 'Convert & Add Point' : 'Add Point'}
                </button>
            </form>
        </div>
    </div>
);
};