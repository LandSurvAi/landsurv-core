/**
 * Civil 3D Export Panel
 * 
 * Phase 4: Webapp UI for exporting session data to Civil 3D
 * Allows users to select what data to export and sends it to backend for C3D import
 */

import React, { useState, useCallback, useEffect } from 'react';
import { SessionState, SurveyLine } from '../types.ts';
import { useAppState } from '../contexts/AppStateContext.tsx';

// Icons
const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const UploadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" x2="12" y1="3" y2="15"/>
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
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" x2="6" y1="6" y2="18"/>
    <line x1="6" x2="18" y1="6" y2="18"/>
  </svg>
);

interface C3DExportPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sessionState: SessionState;
  sessionToken: string | null;
}

// Backend URL
const API_BASE = (import.meta as any)?.env?.VITE_API_URL || 
  (window.location.hostname === 'localhost' ? 'http://localhost:3001' : '');

export const C3DExportPanel: React.FC<C3DExportPanelProps> = ({
  isOpen,
  onClose,
  sessionState,
  sessionToken,
}) => {
  const [exportPoints, setExportPoints] = useState(true);
  const [exportLines, setExportLines] = useState(true);
  const [exportDeed, setExportDeed] = useState(true);
  const [exportCenterlines, setExportCenterlines] = useState(true);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'disconnected' | null>(null);
  const { addNotification } = useAppState();

  // Count available data
  const pointCount = sessionState.pointLists.reduce((sum, list) => sum + list.points.length, 0);
  const lineCount = sessionState.lines.length;
  const hasDeed = sessionState.deedFile !== null;
  const centerlineCount = sessionState.centerlines.length;

  // Separate lines by type - note: SurveyLine doesn't have 'boundary' type, treat lines without type as boundary
  const boundaryLines = sessionState.lines.filter(l => !l.type);
  const breaklines = sessionState.lines.filter(l => l.type === 'breakline');
  const inclusionLines = sessionState.lines.filter(l => l.type === 'inclusion');
  const exclusionLines = sessionState.lines.filter(l => l.type === 'exclusion');

  // Extract deed metadata from deedChatHistory or jobInfo
  const getDeedMetadata = useCallback(() => {
    if (!sessionState.deedFile) return null;

    return {
      source: sessionState.deedFile.name,
      parcelId: sessionState.jobInfo.jobNo || undefined,
      county: undefined, // Not in JobInfo
      state: undefined, // Not in JobInfo
      owner: undefined,
      legalDescription: undefined,
      recordingInfo: undefined,
    };
  }, [sessionState]);

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
      } else {
        setConnectionStatus('disconnected');
      }
    } catch (err) {
      console.warn('Failed to check connection status:', err);
      setConnectionStatus('disconnected');
    }
  }, [sessionToken]);

  // Check connection status when panel opens or token changes
  useEffect(() => {
    if (isOpen) {
      checkConnectionStatus();
      // Poll every 5 seconds while panel is open
      const interval = setInterval(checkConnectionStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [isOpen, checkConnectionStatus]);

  const handleExport = useCallback(async () => {
    if (!sessionToken) {
      notifyError('No Civil 3D session token found. Please click "Connect Civil 3D" first to establish a connection.');
      return;
    }

    if (connectionStatus === 'disconnected') {
      notifyError('Civil 3D is not connected. Please run the LANDSURVAI command in Civil 3D and paste your session token.');
      return;
    }

    // Check if any data is selected
    const hasDataToExport = 
      (exportPoints && pointCount > 0) ||
      (exportLines && lineCount > 0) ||
      (exportDeed && hasDeed) ||
      (exportCenterlines && centerlineCount > 0);

    if (!hasDataToExport) {
      notifyError('No data selected for export. Please check at least one option with available data.');
      return;
    }

    // Validate there's actual data to send
    const totalItems = 
      (exportPoints ? pointCount : 0) +
      (exportLines ? lineCount : 0) +
      (exportDeed ? 1 : 0) +
      (exportCenterlines ? centerlineCount : 0);

    if (totalItems === 0) {
      notifyError('No data available to export. Please add survey data in the webapp first.');
      return;
    }

    setLoading(true);
    setSuccess(false);

    try {
      // Build export payload
      const payload: any = {
        points: exportPoints ? {
          lists: sessionState.pointLists.map(list => ({
            name: list.name,
            points: list.points.map(p => ({
              number: p.pointNumber,
              easting: p.easting,
              northing: p.northing,
              elevation: p.elevation,
              rawDescription: p.description || '',
            })),
          })),
        } : { lists: [] },
        
        lines: exportLines ? {
          boundary: boundaryLines,
          breaklines: breaklines,
          inclusions: inclusionLines,
          exclusions: exclusionLines,
        } : {
          boundary: [],
          breaklines: [],
          inclusions: [],
          exclusions: [],
        },
        
        deed: exportDeed && hasDeed ? {
          lines: boundaryLines.length > 0 ? boundaryLines : sessionState.lines.filter(l => !l.type),
          metadata: getDeedMetadata(),
        } : null,
        
        centerlines: exportCenterlines ? sessionState.centerlines : [],
        
        jobInfo: {
          projectName: sessionState.jobInfo.jobName,
          parcelNumber: sessionState.jobInfo.jobNo,
          county: undefined,
          state: undefined,
          surveyDate: undefined,
        },
        
        projection: sessionState.settings.projection,
      };

      const response = await fetch(`${API_BASE}/api/c3d/session/export`, {
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
        throw new Error(errorData.error || `Export failed: ${response.statusText}`);
      }

      const result = await response.json();
      setSuccess(true);
      
      // Show helpful next steps
      console.log('[C3D Export] Success:', result);
      
      // Auto-close after showing success message
      setTimeout(() => {
        onClose();
      }, 3000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to export data';
      notifyError(`${errorMessage}. Make sure Civil 3D is running and the LANDSURVAI command is active.`);
    } finally {
      setLoading(false);
    }
  }, [sessionToken, sessionState, exportPoints, exportLines, exportDeed, exportCenterlines, 
      pointCount, lineCount, hasDeed, centerlineCount, getDeedMetadata, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <UploadIcon />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Export to Civil 3D</h2>
              <p className="text-xs text-slate-400">Select data to sync with Civil 3D</p>
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
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Connection Status */}
          {connectionStatus && (
            <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 text-sm ${
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
                </>
              )}
              {connectionStatus === 'disconnected' && (
                <>
                  <AlertIcon />
                  <div className="flex-1">
                    <p className="font-medium">Civil 3D Not Connected</p>
                    <p className="text-xs text-red-300/80 mt-1">
                      Run LANDSURVAI command in Civil 3D with your session token
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Session Token Warning */}
          {!sessionToken && (
            <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-start gap-2">
              <AlertIcon />
              <div className="flex-1 text-sm text-yellow-200">
                <p className="font-medium mb-1">No Civil 3D Connection</p>
                <p className="text-xs text-yellow-300/80">
                  Please connect Civil 3D first using the "Connect Civil 3D" button.
                </p>
              </div>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="mb-4 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckIcon />
                <p className="text-sm text-green-200 font-medium">
                  Data exported successfully!
                </p>
              </div>
              <p className="text-xs text-green-300/80 ml-6">
                In Civil 3D chat, say: "Import the survey data from the webapp"
              </p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-200">{error}</p>
            </div>
          )}

          {/* Data Selection */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-300 mb-2">Select data to export:</p>

            {/* Points */}
            <label className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors">
              <input
                type="checkbox"
                checked={exportPoints}
                onChange={(e) => setExportPoints(e.target.checked)}
                disabled={pointCount === 0 || loading}
                className="w-4 h-4 rounded border-slate-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-800"
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-white">Survey Points</div>
                <div className="text-xs text-slate-400">
                  {pointCount > 0 ? `${pointCount} points across ${sessionState.pointLists.length} list(s)` : 'No points available'}
                </div>
              </div>
            </label>

            {/* Lines */}
            <label className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors">
              <input
                type="checkbox"
                checked={exportLines}
                onChange={(e) => setExportLines(e.target.checked)}
                disabled={lineCount === 0 || loading}
                className="w-4 h-4 rounded border-slate-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-800"
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-white">Survey Lines</div>
                <div className="text-xs text-slate-400">
                  {lineCount > 0 ? (
                    <>
                      {boundaryLines.length} boundary, {breaklines.length} breaklines
                      {inclusionLines.length > 0 && `, ${inclusionLines.length} inclusions`}
                      {exclusionLines.length > 0 && `, ${exclusionLines.length} exclusions`}
                    </>
                  ) : 'No lines available'}
                </div>
              </div>
            </label>

            {/* Deed */}
            <label className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors">
              <input
                type="checkbox"
                checked={exportDeed}
                onChange={(e) => setExportDeed(e.target.checked)}
                disabled={!hasDeed || loading}
                className="w-4 h-4 rounded border-slate-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-800"
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-white">Deed Boundary</div>
                <div className="text-xs text-slate-400">
                  {hasDeed ? 'Boundary with metadata' : 'No deed available'}
                </div>
              </div>
            </label>

            {/* Centerlines */}
            <label className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors">
              <input
                type="checkbox"
                checked={exportCenterlines}
                onChange={(e) => setExportCenterlines(e.target.checked)}
                disabled={centerlineCount === 0 || loading}
                className="w-4 h-4 rounded border-slate-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-800"
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-white">Centerlines</div>
                <div className="text-xs text-slate-400">
                  {centerlineCount > 0 ? `${centerlineCount} centerline(s)` : 'No centerlines available'}
                </div>
              </div>
            </label>
          </div>

          {/* Info Box */}
          <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-xs text-blue-200 mb-2">
              <span className="font-medium">Next Steps:</span>
            </p>
            <ol className="text-xs text-blue-200/90 space-y-1 ml-4 list-decimal">
              <li>Click "Export Data" below</li>
              <li>Open Civil 3D chat (if not already open)</li>
              <li>Ask: "Import points from webapp" or "Import the deed boundary"</li>
              <li>AI will fetch and import your data automatically</li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700 bg-slate-800/50">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={loading || !sessionToken || success || connectionStatus === 'disconnected' || connectionStatus === 'checking'}
            className="px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            title={connectionStatus === 'disconnected' ? 'Civil 3D must be connected to export data' : ''}
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Exporting...
              </>
            ) : success ? (
              <>
                <CheckIcon />
                Exported
              </>
            ) : (
              <>
                <UploadIcon />
                Export Data
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
