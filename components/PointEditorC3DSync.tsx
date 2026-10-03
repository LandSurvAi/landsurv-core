/**
 * Point Editor Civil 3D Sync Component
 * 
 * Enables bi-directional point synchronization between the webapp and Civil 3D.
 * Features:
 * - Export selected points or all points to C3D as COGO points
 * - Import COGO points from C3D into webapp
 * - Real-time sync status
 */

import React, { useState, useCallback, useEffect } from 'react';
import { PointList, SurveyPoint } from '../types.ts';
import { useAppState } from '../contexts/AppStateContext.tsx';

// Icons
const SyncIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
    <path d="M3 3v5h5"/>
    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
    <path d="M16 16h5v5"/>
  </svg>
);

const UploadCloudIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/>
    <path d="M12 12v9"/>
    <path d="m16 16-4-4-4 4"/>
  </svg>
);

const DownloadCloudIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/>
    <path d="M12 13v9"/>
    <path d="m8 17 4 4 4-4"/>
  </svg>
);

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const AlertIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
    <line x1="12" x2="12" y1="9" y2="13"/>
    <line x1="12" x2="12.01" y1="17" y2="17"/>
  </svg>
);

const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" x2="6" y1="6" y2="18"/>
    <line x1="6" x2="18" y1="6" y2="18"/>
  </svg>
);

interface PointEditorC3DSyncProps {
  isOpen: boolean;
  onClose: () => void;
  pointLists: PointList[];
  selectedPointNumbers: Set<string>;
  sessionToken: string | null;
  onImportPoints: (points: SurveyPoint[]) => void;
  onSyncComplete?: (result: { exported: number; imported: number }) => void;
}

// Backend URL
const API_BASE = (import.meta as any)?.env?.VITE_API_URL || 
  (window.location.hostname === 'localhost' ? 'http://localhost:3001' : '');

type SyncMode = 'export' | 'import' | 'sync';
type PointSelection = 'all' | 'selected' | 'list';

export const PointEditorC3DSync: React.FC<PointEditorC3DSyncProps> = ({
  isOpen,
  onClose,
  pointLists,
  selectedPointNumbers,
  sessionToken,
  onImportPoints,
  onSyncComplete,
}) => {
  const [syncMode, setSyncMode] = useState<SyncMode>('export');
  const [pointSelection, setPointSelection] = useState<PointSelection>('all');
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'disconnected' | null>(null);
  const [c3dPointCount, setC3dPointCount] = useState<number | null>(null);
  const [pointGroupFilter, setPointGroupFilter] = useState<string>('');
  const { addNotification } = useAppState();

  const notifyError = (message: string) => {
    addNotification({ kind: 'c3d-sync', severity: 'error', title: 'C3D Sync', message });
  };

  // Calculate point counts
  const allPoints = pointLists.flatMap(l => l.points);
  const selectedCount = selectedPointNumbers.size;
  const selectedListPoints = selectedListId 
    ? pointLists.find(l => l.id === selectedListId)?.points.length || 0 
    : 0;

  const getPointsToExport = useCallback(() => {
    switch (pointSelection) {
      case 'all':
        return allPoints;
      case 'selected':
        return allPoints.filter(p => selectedPointNumbers.has(p.pointNumber));
      case 'list':
        return pointLists.find(l => l.id === selectedListId)?.points || [];
      default:
        return [];
    }
  }, [pointSelection, allPoints, selectedPointNumbers, selectedListId, pointLists]);

  // Check C3D connection status
  const checkConnectionStatus = useCallback(async () => {
    if (!sessionToken) {
      setConnectionStatus('disconnected');
      return;
    }

    setConnectionStatus('checking');
    try {
      const response = await fetch(`${API_BASE}/api/c3d/session/status/${sessionToken}`);
      if (response.ok) {
        const data = await response.json();
        setConnectionStatus(data.connected ? 'connected' : 'disconnected');
        if (data.connected && data.cogoPointCount !== undefined) {
          setC3dPointCount(data.cogoPointCount);
        }
      } else {
        setConnectionStatus('disconnected');
      }
    } catch (err) {
      console.warn('Failed to check connection status:', err);
      setConnectionStatus('disconnected');
    }
  }, [sessionToken]);

  // Check connection when panel opens
  useEffect(() => {
    if (isOpen) {
      checkConnectionStatus();
      const interval = setInterval(checkConnectionStatus, 10000);
      return () => clearInterval(interval);
    }
  }, [isOpen, checkConnectionStatus]);

  // Export points to Civil 3D
  const handleExportPoints = useCallback(async () => {
    if (!sessionToken) {
      notifyError('No Civil 3D session token. Please connect Civil 3D first.');
      return;
    }

    const pointsToExport = getPointsToExport();
    if (pointsToExport.length === 0) {
      notifyError('No points selected for export.');
      return;
    }

    setLoading(true);
    setSuccess(null);

    try {
      const payload = {
        points: pointsToExport.map(p => ({
          number: p.pointNumber,
          northing: p.northing,
          easting: p.easting,
          elevation: p.elevation || 0,
          rawDescription: p.description || '',
        })),
        options: {
          createPointGroup: true,
          pointGroupName: `Webapp Import ${new Date().toLocaleDateString()}`,
        },
      };

      const response = await fetch(`${API_BASE}/api/c3d/points/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionToken,
          data: payload,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        notifyError(errorData.error || `Export failed: ${response.statusText}`);
        setLoading(false);
        return;
      }

      const result = await response.json();
      setSuccess(`Successfully exported ${pointsToExport.length} points to Civil 3D!`);
      onSyncComplete?.({ exported: pointsToExport.length, imported: 0 });
      
      // Refresh connection status to get updated point count
      setTimeout(checkConnectionStatus, 1000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to export points';
      notifyError(errorMessage);
      setLoading(false);
    }
  }, [sessionToken, getPointsToExport, onSyncComplete, checkConnectionStatus]);

  // Import points from Civil 3D
  const handleImportPoints = useCallback(async () => {
    if (!sessionToken) {
      notifyError('No Civil 3D session token. Please connect Civil 3D first.');
      return;
    }

    setLoading(true);
    setSuccess(null);

    try {
      const response = await fetch(`${API_BASE}/api/c3d/points/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionToken,
          options: {
            pointGroupFilter: pointGroupFilter || undefined,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        notifyError(errorData.error || `Import failed: ${response.statusText}`);
        setLoading(false);
        return;
      }

      const result = await response.json();
      
      if (result.points && result.points.length > 0) {
        const importedPoints: SurveyPoint[] = result.points.map((p: any) => ({
          pointNumber: String(p.number || p.pointNumber),
          northing: p.northing,
          easting: p.easting,
          elevation: p.elevation,
          description: p.rawDescription || p.description || '',
        }));

        onImportPoints(importedPoints);
        setSuccess(`Successfully imported ${importedPoints.length} points from Civil 3D!`);
        onSyncComplete?.({ exported: 0, imported: importedPoints.length });
      } else {
        setSuccess('No points found in Civil 3D matching the criteria.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to import points';
      notifyError(errorMessage);
      setLoading(false);
    }
  }, [sessionToken, pointGroupFilter, onImportPoints, onSyncComplete]);

  // Full sync (export then import)
  const handleFullSync = useCallback(async () => {
    setLoading(true);
    setSuccess(null);

    try {
      // First export
      const pointsToExport = getPointsToExport();
      let exported = 0;
      let imported = 0;

      if (pointsToExport.length > 0) {
        const exportPayload = {
          points: pointsToExport.map(p => ({
            number: p.pointNumber,
            northing: p.northing,
            easting: p.easting,
            elevation: p.elevation || 0,
            rawDescription: p.description || '',
          })),
          options: {
            createPointGroup: true,
            pointGroupName: `Webapp Sync ${new Date().toLocaleDateString()}`,
          },
        };

        const exportResponse = await fetch(`${API_BASE}/api/c3d/points/export`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionToken, data: exportPayload }),
        });

        if (exportResponse.ok) {
          exported = pointsToExport.length;
        }
      }

      // Then import
      const importResponse = await fetch(`${API_BASE}/api/c3d/points/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionToken,
          options: { excludePointNumbers: allPoints.map(p => p.pointNumber) },
        }),
      });

      if (importResponse.ok) {
        const result = await importResponse.json();
        if (result.points && result.points.length > 0) {
          const importedPoints: SurveyPoint[] = result.points.map((p: any) => ({
            pointNumber: String(p.number || p.pointNumber),
            northing: p.northing,
            easting: p.easting,
            elevation: p.elevation,
            description: p.rawDescription || p.description || '',
          }));
          onImportPoints(importedPoints);
          imported = importedPoints.length;
        }
      }

      setSuccess(`Sync complete! Exported: ${exported}, Imported: ${imported}`);
      onSyncComplete?.({ exported, imported });
      setTimeout(checkConnectionStatus, 1000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sync failed';
      notifyError(errorMessage);
      setLoading(false);
    }
  }, [sessionToken, getPointsToExport, allPoints, onImportPoints, onSyncComplete, checkConnectionStatus]);

  const handleAction = useCallback(() => {
    switch (syncMode) {
      case 'export':
        handleExportPoints();
        break;
      case 'import':
        handleImportPoints();
        break;
      case 'sync':
        handleFullSync();
        break;
    }
  }, [syncMode, handleExportPoints, handleImportPoints, handleFullSync]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-500/20 rounded-lg">
              <SyncIcon />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Civil 3D Point Sync</h2>
              <p className="text-xs text-slate-400">Sync COGO points with Civil 3D</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-white"
            disabled={loading}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Connection Status */}
          <div className={`p-3 rounded-lg flex items-center gap-2 text-sm ${
            connectionStatus === 'connected' ? 'bg-green-500/10 border border-green-500/30 text-green-200' :
            connectionStatus === 'disconnected' ? 'bg-red-500/10 border border-red-500/30 text-red-200' :
            'bg-slate-700/50 border border-slate-600 text-slate-300'
          }`}>
            {connectionStatus === 'checking' && (
              <>
                <div className="w-4 h-4 border-2 border-slate-400 border-t-slate-200 rounded-full animate-spin" />
                <span>Checking Civil 3D connection...</span>
              </>
            )}
            {connectionStatus === 'connected' && (
              <>
                <CheckIcon />
                <span className="font-medium">Civil 3D Connected</span>
                {c3dPointCount !== null && (
                  <span className="ml-auto text-xs text-green-300/70">
                    {c3dPointCount} COGO points in drawing
                  </span>
                )}
              </>
            )}
            {connectionStatus === 'disconnected' && (
              <>
                <AlertIcon />
                <div className="flex-1">
                  <p className="font-medium">Civil 3D Not Connected</p>
                  <p className="text-xs text-red-300/80 mt-1">
                    Run LANDSURVAI command in Civil 3D
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Success/Error Messages */}
          {success && (
            <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-2">
              <CheckIcon />
              <p className="text-sm text-green-200">{success}</p>
            </div>
          )}

          {/* Sync Mode Selection */}
          <div>
            <p className="text-sm font-medium text-slate-300 mb-2">Sync Mode:</p>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setSyncMode('export')}
                className={`p-3 rounded-lg border text-center transition-colors ${
                  syncMode === 'export'
                    ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-200'
                    : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <UploadCloudIcon />
                <p className="text-xs mt-1">Export to C3D</p>
              </button>
              <button
                onClick={() => setSyncMode('import')}
                className={`p-3 rounded-lg border text-center transition-colors ${
                  syncMode === 'import'
                    ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-200'
                    : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <DownloadCloudIcon />
                <p className="text-xs mt-1">Import from C3D</p>
              </button>
              <button
                onClick={() => setSyncMode('sync')}
                className={`p-3 rounded-lg border text-center transition-colors ${
                  syncMode === 'sync'
                    ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-200'
                    : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <SyncIcon />
                <p className="text-xs mt-1">Full Sync</p>
              </button>
            </div>
          </div>

          {/* Export Options */}
          {(syncMode === 'export' || syncMode === 'sync') && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-300">Points to Export:</p>
              
              <label className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors">
                <input
                  type="radio"
                  name="pointSelection"
                  checked={pointSelection === 'all'}
                  onChange={() => setPointSelection('all')}
                  className="accent-yellow-500"
                />
                <div className="flex-1">
                  <p className="text-sm text-slate-200">All Points</p>
                  <p className="text-xs text-slate-400">{allPoints.length} points total</p>
                </div>
              </label>

              <label className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                selectedCount > 0 
                  ? 'bg-slate-700/50 cursor-pointer hover:bg-slate-700' 
                  : 'bg-slate-800/50 opacity-50 cursor-not-allowed'
              }`}>
                <input
                  type="radio"
                  name="pointSelection"
                  checked={pointSelection === 'selected'}
                  onChange={() => setPointSelection('selected')}
                  disabled={selectedCount === 0}
                  className="accent-yellow-500"
                />
                <div className="flex-1">
                  <p className="text-sm text-slate-200">Selected Points</p>
                  <p className="text-xs text-slate-400">
                    {selectedCount > 0 ? `${selectedCount} points selected` : 'No points selected in Point Editor'}
                  </p>
                </div>
              </label>

              <label className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                pointLists.length > 0 
                  ? 'bg-slate-700/50 cursor-pointer hover:bg-slate-700' 
                  : 'bg-slate-800/50 opacity-50 cursor-not-allowed'
              }`}>
                <input
                  type="radio"
                  name="pointSelection"
                  checked={pointSelection === 'list'}
                  onChange={() => setPointSelection('list')}
                  disabled={pointLists.length === 0}
                  className="accent-yellow-500"
                />
                <div className="flex-1">
                  <p className="text-sm text-slate-200">From Point List</p>
                  {pointSelection === 'list' && (
                    <select
                      value={selectedListId}
                      onChange={(e) => setSelectedListId(e.target.value)}
                      className="mt-2 w-full p-2 bg-slate-600 border border-slate-500 rounded text-sm text-white"
                    >
                      <option value="">Select a list...</option>
                      {pointLists.map(list => (
                        <option key={list.id} value={list.id}>
                          {list.name} ({list.points.length} points)
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </label>
            </div>
          )}

          {/* Import Options */}
          {(syncMode === 'import' || syncMode === 'sync') && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-300">Import Options:</p>
              
              <div className="p-3 bg-slate-700/50 rounded-lg">
                <label className="block text-sm text-slate-200 mb-2">
                  Point Group Filter (optional)
                </label>
                <input
                  type="text"
                  value={pointGroupFilter}
                  onChange={(e) => setPointGroupFilter(e.target.value)}
                  placeholder="e.g., Control Points, Survey Points"
                  className="w-full p-2 bg-slate-600 border border-slate-500 rounded text-sm text-white placeholder-slate-400"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Leave blank to import all COGO points
                </p>
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700">
            <p className="text-xs font-medium text-slate-400 uppercase mb-2">Summary</p>
            <div className="space-y-1 text-sm">
              {syncMode === 'export' && (
                <p className="text-slate-300">
                  Will export <span className="text-yellow-400 font-medium">{getPointsToExport().length}</span> points to Civil 3D
                </p>
              )}
              {syncMode === 'import' && (
                <p className="text-slate-300">
                  Will import COGO points from Civil 3D
                  {c3dPointCount !== null && (
                    <span className="text-yellow-400"> ({c3dPointCount} available)</span>
                  )}
                </p>
              )}
              {syncMode === 'sync' && (
                <>
                  <p className="text-slate-300">
                    Export: <span className="text-yellow-400 font-medium">{getPointsToExport().length}</span> points
                  </p>
                  <p className="text-slate-300">
                    Import: New points from Civil 3D
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 transition-colors"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleAction}
            disabled={loading || connectionStatus !== 'connected'}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
              loading || connectionStatus !== 'connected'
                ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                : 'bg-yellow-600 text-white hover:bg-yellow-500'
            }`}
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>
                  {syncMode === 'export' ? 'Exporting...' : 
                   syncMode === 'import' ? 'Importing...' : 
                   'Syncing...'}
                </span>
              </>
            ) : (
              <>
                {syncMode === 'export' && <UploadCloudIcon />}
                {syncMode === 'import' && <DownloadCloudIcon />}
                {syncMode === 'sync' && <SyncIcon />}
                <span>
                  {syncMode === 'export' ? 'Export to Civil 3D' : 
                   syncMode === 'import' ? 'Import from Civil 3D' : 
                   'Sync Points'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PointEditorC3DSync;
