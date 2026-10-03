/**
 * Civil 3D Connect Panel
 * 
 * Simple UI for connecting Civil 3D plugin to the web app session.
 * Shows session token that user copies to Civil 3D plugin.
 * Includes QR code for potential mobile scanning workflow.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAppState } from '../contexts/AppStateContext.tsx';

// Icons inline to avoid dependencies
const CopyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
  </svg>
);

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const RefreshIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
    <path d="M3 3v5h5"/>
    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
    <path d="M16 16h5v5"/>
  </svg>
);

const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" x2="6" y1="6" y2="18"/>
    <line x1="6" x2="18" y1="6" y2="18"/>
  </svg>
);

type CadConnectorType = 'c3d';

const getConnectorLabel = (_type?: CadConnectorType) => 'Civil 3D';

interface C3DConnectPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isTrialActive: boolean;
  hasApiKey: boolean;
  selectedConnector?: CadConnectorType;
  onConnectorChange?: (connector: CadConnectorType) => void;
  onSessionCreated?: (token: string, connectorType: CadConnectorType) => void;
  existingToken?: string | null;
  existingConnectorType?: CadConnectorType;
}

interface SessionData {
  sessionToken: string;
  connectorType: CadConnectorType;
  expiresIn: number;
  instructions: string[];
}

// Backend URL - always use production Cloud Run URL for C3D session API
// Local frontend dev server can use production backend
const API_BASE = (import.meta as any)?.env?.VITE_API_URL || 
  'https://beta-landsurv-ai-y55gmt77ga-uw.a.run.app';

// Debug logging helper - outputs to console in format easy to copy
const debugLog = (category: string, message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  const prefix = `[C3D-Debug ${timestamp}] [${category}]`;
  
  if (data !== undefined) {
    console.log(`${prefix} ${message}`, data);
    // Also log as string for easy copy
    console.log(`${prefix} ${message} => ${JSON.stringify(data, null, 2)}`);
  } else {
    console.log(`${prefix} ${message}`);
  }
};

export const C3DConnectPanel: React.FC<C3DConnectPanelProps> = ({
  isOpen,
  onClose,
  isTrialActive,
  hasApiKey,
  selectedConnector,
  onSessionCreated,
  existingToken,
  existingConnectorType,
}) => {
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const connectorType = selectedConnector ?? 'c3d';
  const { addNotification } = useAppState();

  // Generate browser session ID (persisted in localStorage)
  const getBrowserSessionId = useCallback(() => {
    let sessionId = localStorage.getItem('landsurv_browser_session_id');
    if (!sessionId) {
      sessionId = `browser-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('landsurv_browser_session_id', sessionId);
    }
    return sessionId;
  }, []);

  // Create session token
  const createSession = useCallback(async () => {
    setLoading(true);
    
    debugLog('SESSION', '========== CREATE SESSION START ==========');
    debugLog('CONFIG', 'API_BASE', API_BASE);
    debugLog('CONFIG', 'window.location.hostname', window.location.hostname);
    debugLog('CONFIG', 'window.location.origin', window.location.origin);
    debugLog('CONFIG', 'VITE_API_URL env', (import.meta as any)?.env?.VITE_API_URL);
    
    const browserSessionId = getBrowserSessionId();
    debugLog('SESSION', 'Browser Session ID', browserSessionId);
    debugLog('SESSION', 'isTrialActive', isTrialActive);
    debugLog('SESSION', 'hasApiKey', hasApiKey);
    
    const requestBody = {
      browserSessionId,
      isTrialActive,
      hasUserApiKey: hasApiKey,
      tier: hasApiKey ? 'pro' : 'trial',
      connectorType,
      cadType: connectorType,
    };
    debugLog('REQUEST', 'Request Body', requestBody);
    
    const endpoint = `${API_BASE}/api/c3d/session/create`;
    debugLog('REQUEST', 'Full Endpoint URL', endpoint);
    
    try {
      debugLog('FETCH', 'Starting fetch...');
      const startTime = Date.now();
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      
      const elapsed = Date.now() - startTime;
      debugLog('FETCH', `Response received in ${elapsed}ms`);
      debugLog('RESPONSE', 'Status', response.status);
      debugLog('RESPONSE', 'StatusText', response.statusText);
      debugLog('RESPONSE', 'OK', response.ok);
      debugLog('RESPONSE', 'Headers', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        let errorBody = '';
        try {
          errorBody = await response.text();
          debugLog('ERROR', 'Response Body', errorBody);
        } catch (e) {
          debugLog('ERROR', 'Could not read error body', e);
        }
        throw new Error(`Failed to create session: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      const data = await response.json();
      debugLog('SUCCESS', 'Response Data', data);
      
      const normalizedConnector = (data.connectorType || connectorType) as CadConnectorType;
      setSessionData({
        sessionToken: data.sessionToken,
        connectorType: normalizedConnector,
        expiresIn: data.expiresIn,
        instructions: data.instructions || sessionData?.instructions || [],
      });
      setCountdown(data.expiresIn);
      
      // Store token locally for status updates
      localStorage.setItem('landsurv_c3d_session_token', data.sessionToken);
      localStorage.setItem('landsurv_selected_cad_connector', normalizedConnector);
      debugLog('STORAGE', 'Token saved to localStorage', data.sessionToken);
      
      // Notify parent component
      if (onSessionCreated) {
        onSessionCreated(data.sessionToken, normalizedConnector);
        debugLog('CALLBACK', 'onSessionCreated called');
      }
      
      debugLog('SESSION', '========== CREATE SESSION SUCCESS ==========');
      
    } catch (err: any) {
      debugLog('ERROR', '========== CREATE SESSION FAILED ==========');
      debugLog('ERROR', 'Error Type', err.name);
      debugLog('ERROR', 'Error Message', err.message);
      debugLog('ERROR', 'Error Stack', err.stack);
      
      // Check for specific error types
      if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
        debugLog('ERROR', 'DIAGNOSIS: Network error - possible causes:');
        debugLog('ERROR', '  1. CORS blocking the request');
        debugLog('ERROR', '  2. Server not responding');
        debugLog('ERROR', '  3. Network connectivity issue');
        debugLog('ERROR', '  4. SSL/TLS certificate issue');
        debugLog('ERROR', `  Attempted URL: ${endpoint}`);
      }
      
      console.error('[C3D-Connect] Error:', err);
      addNotification({ kind: 'c3d-connect', severity: 'error', title: 'Civil 3D Connect', message: err.message || 'Failed to fetch' });
    } finally {
      setLoading(false);
    }
  }, [addNotification, getBrowserSessionId, isTrialActive, hasApiKey]);

  // Auto-create session when panel opens (only if no existing token)
  useEffect(() => {
    if (isOpen) {
      const activeConnector = existingConnectorType ?? connectorType;
      if (existingToken) {
        // Use existing token - no need to create new one
        setSessionData({
          sessionToken: existingToken,
          connectorType: activeConnector,
          expiresIn: 86400,
          instructions: [
            '1. Open Civil 3D',
            '2. Type LANDSURVCONFIG command',
            '3. Paste this session token',
            '4. Click "Save"'
          ]
        });
        setCountdown(0);
        debugLog('SESSION', 'Using existing token', existingToken);
      } else {
        createSession();
      }
    }
  }, [isOpen, existingToken, existingConnectorType, connectorType, createSession]);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    
    const timer = setTimeout(() => {
      setCountdown(prev => prev - 1);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [countdown]);

  // Update session status when trial state changes
  useEffect(() => {
    const browserSessionId = localStorage.getItem('landsurv_browser_session_id');
    if (!browserSessionId) return;

    // Notify backend of trial status change
    fetch(`${API_BASE}/api/c3d/session/update-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        browserSessionId,
        isTrialActive,
        hasUserApiKey: hasApiKey,
      }),
    }).catch(err => {
      console.warn('[C3D-Connect] Failed to update session status:', err);
    });
  }, [isTrialActive, hasApiKey]);

  // Copy token to clipboard
  const copyToken = useCallback(() => {
    if (!sessionData?.sessionToken) return;
    
    navigator.clipboard.writeText(sessionData.sessionToken).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [sessionData]);

  // Format countdown
  const formatCountdown = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gray-900 rounded-xl shadow-2xl max-w-md w-full border border-gray-700 overflow-hidden">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-600 to-blue-600 p-5 relative">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="text-2xl">🔗</span>
            Connect {getConnectorLabel(connectorType)}
          </h2>
          <p className="text-cyan-100 text-sm mt-1">
            Link your {getConnectorLabel(connectorType)} plugin to this session
          </p>
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-white/80 hover:text-white transition"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
        {/* Loading State */}
        {loading && (

            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-cyan-500 border-t-transparent"></div>
              <span className="ml-3 text-gray-300">Generating session...</span>
            </div>
          )}

          {/* Session Token Display */}
          {sessionData && !loading && (
            <>
              {/* Token Box */}
              <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
                <label className="text-xs text-gray-400 uppercase tracking-wide mb-2 block">
                  Your Session Token
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-2xl font-mono font-bold text-cyan-400 tracking-wider select-all">
                    {sessionData.sessionToken}
                  </code>
                  <button
                    onClick={copyToken}
                    className={`p-2 rounded-lg transition ${
                      copied 
                        ? 'bg-green-600 text-white' 
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                    title={copied ? 'Copied!' : 'Copy to clipboard'}
                  >
                    {copied ? <CheckIcon /> : <CopyIcon />}
                  </button>
                </div>
                
                {/* Expiry */}
                <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                  <span>Valid for: {formatCountdown(countdown)}</span>
                  <button
                    onClick={createSession}
                    className="flex items-center gap-1 text-gray-400 hover:text-gray-300"
                    title="Generate new token"
                  >
                    <RefreshIcon />
                    Refresh
                  </button>
                </div>
              </div>

              {/* Instructions */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-300">
                  How to connect:
                </h3>
                <ol className="text-sm text-gray-400 space-y-1 list-decimal list-inside">
                  <li>Open {getConnectorLabel(connectorType)}</li>
                  <li>Type <span className="bg-gray-800 px-1.5 py-0.5 rounded text-cyan-400">LANDSURVAI</span> command</li>
                  <li>Click "Configure" or "Settings"</li>
                  <li>Paste the session token above</li>
                  <li>Click "Connect"</li>
                </ol>
              </div>

              {/* Status Badges */}
              <div className="flex flex-wrap gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  isTrialActive || hasApiKey
                    ? 'bg-green-900/50 text-green-400 border border-green-500/30'
                    : 'bg-yellow-900/50 text-yellow-400 border border-yellow-500/30'
                }`}>
                  {hasApiKey ? '🔑 API Key Active' : '⚠️ No API Key'}
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-900/50 text-blue-400 border border-blue-500/30">
                  {hasApiKey ? 'Pro Tier' : 'Free Tier'}
                </span>
              </div>

              {/* Notice */}
              {!hasApiKey && (
                <div className="p-3 bg-yellow-900/20 border border-yellow-500/30 rounded-lg text-xs text-yellow-300">
                  <strong>Note:</strong> When your trial pauses, the Civil 3D connection will also pause.
                  Enter your own API key to maintain continuous access.
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-800/50 border-t border-gray-700 px-5 py-3 flex justify-between items-center">
          <a 
            href="https://connector-download.landsurv.ai/"
            className="text-sm text-cyan-400 hover:text-cyan-300 underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Download {getConnectorLabel(connectorType)} Plugin
          </a>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default C3DConnectPanel;
