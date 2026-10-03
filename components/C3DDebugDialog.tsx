/**
 * C3D Debug Dialog
 * 
 * Shows connection status, session info, and debug details for Civil 3D integration
 */

import React, { useEffect, useState } from 'react';
import { XMarkIcon } from './icons';
import { InferenceService } from '../services/InferenceService';
import { useAppState } from '../contexts/AppStateContext.tsx';

interface C3DDebugDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sessionToken: string | null;
  isConnected: boolean;
}

interface ConnectionInfo {
  sessionId: string;
  clientId: string;
  connectedAt: string;
}

export const C3DDebugDialog: React.FC<C3DDebugDialogProps> = ({
  isOpen,
  onClose,
  sessionToken,
  isConnected,
}) => {
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const { addNotification } = useAppState();

  const fetchConnections = async () => {
    setLoading(true);
    try {
      const result = await InferenceService.getC3DConnections();
      setConnections(result.connections);
      setLastRefresh(new Date());
    } catch (err) {
      addNotification({ kind: 'c3d-debug', severity: 'error', title: 'Civil 3D Debug', message: err instanceof Error ? err.message : 'Failed to fetch connections' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchConnections();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const tokenDisplay = sessionToken 
    ? `${sessionToken.substring(0, 15)}...${sessionToken.substring(sessionToken.length - 5)}`
    : 'None';

  const currentConnection = connections.find(c => c.sessionId === sessionToken);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg shadow-2xl max-w-lg w-full mx-4 border border-gray-700" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
            Civil 3D Connection
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Connection Status */}
          <div className={`p-4 rounded-lg ${isConnected ? 'bg-green-900/30 border border-green-500/30' : 'bg-red-900/30 border border-red-500/30'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
              <div>
                <p className={`font-semibold ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
                  {isConnected ? '✓ Connected' : '✗ Disconnected'}
                </p>
                <p className="text-sm text-gray-400">
                  {isConnected 
                    ? 'Civil 3D plugin is actively connected'
                    : sessionToken 
                      ? 'Token generated - waiting for C3D plugin'
                      : 'No session token - click "Connect C3D" to start'}
                </p>
              </div>
            </div>
          </div>

          {/* Session Info */}
          <div className="bg-gray-900 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Session Details</h3>
            
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-500">Session Token</p>
                <p className="font-mono text-cyan-400">{tokenDisplay}</p>
              </div>
              <div>
                <p className="text-gray-500">Status</p>
                <p className={isConnected ? 'text-green-400' : 'text-yellow-400'}>
                  {isConnected ? 'Active' : (sessionToken ? 'Pending' : 'No Token')}
                </p>
              </div>
            </div>

            {currentConnection && (
              <>
                <hr className="border-gray-700" />
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-gray-500">Client ID</p>
                    <p className="font-mono text-blue-400">{currentConnection.clientId.substring(0, 8)}...</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Connected At</p>
                    <p className="text-gray-300">
                      {new Date(currentConnection.connectedAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Debug Info */}
          <div className="bg-gray-900 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Debug Info</h3>
              <button 
                onClick={fetchConnections}
                disabled={loading}
                className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
            
            <div className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Active Connections:</span>
                <span className="text-white font-semibold">{connections.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">WebSocket URL:</span>
                <span className="text-gray-400 font-mono text-xs truncate max-w-48">
                  {window.location.protocol === 'https:' ? 'wss://' : 'ws://'}
                  {window.location.host}/c3d
                </span>
              </div>
              {lastRefresh && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Last Refresh:</span>
                  <span className="text-gray-400">{lastRefresh.toLocaleTimeString()}</span>
                </div>
              )}
            </div>
          </div>

          {/* All Connections */}
          {connections.length > 0 && (
            <div className="bg-gray-900 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">
                All Active C3D Connections ({connections.length})
              </h3>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {connections.map((conn, idx) => (
                  <div 
                    key={conn.sessionId}
                    className={`p-2 rounded text-sm ${conn.sessionId === sessionToken ? 'bg-green-900/30 border border-green-500/30' : 'bg-gray-800'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-cyan-400">
                        {conn.sessionId.substring(0, 15)}...
                      </span>
                      {conn.sessionId === sessionToken && (
                        <span className="text-xs bg-green-600 px-2 py-0.5 rounded text-white">This Session</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Client: {conn.clientId.substring(0, 8)}... | {new Date(conn.connectedAt).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Help Text */}
          <div className="text-xs text-gray-500 text-center">
            {!sessionToken && (
              <p>Click "Connect C3D" in sidebar to generate a session token</p>
            )}
            {sessionToken && !isConnected && (
              <p>Enter the session token in Civil 3D plugin and run LANDSURVAI command</p>
            )}
            {isConnected && (
              <p>Connection is live! You can now push layers and codes to Civil 3D.</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default C3DDebugDialog;
