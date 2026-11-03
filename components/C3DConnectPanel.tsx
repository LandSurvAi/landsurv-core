/**
 * Civil 3D Connect Panel
 * 
 * Simple UI for connecting Civil 3D plugin to the web app session.
 * Shows session token that user copies to Civil 3D plugin.
 * Includes QR code for potential mobile scanning workflow.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAppState } from '../contexts/AppStateContext.tsx';
import { DownloadIcon, ExclamationTriangleIcon, PlugIcon } from './icons.tsx';

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

  // Escape dismisses the dialog like every other menu surface.
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#02060c]/80 p-4 backdrop-blur-md animate-fade-in"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="c3d-connect-title"
        className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-[20px] border border-white/[0.10] bg-[#0a0f16] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.95)] animate-fade-in-up"
        style={{ backgroundImage: 'radial-gradient(70% 55% at 0% 0%, rgba(34, 211, 238, 0.055), transparent 65%), radial-gradient(65% 55% at 100% 100%, rgba(139, 92, 246, 0.07), transparent 65%), radial-gradient(45% 35% at 100% 0%, rgba(52, 211, 153, 0.035), transparent 65%)' }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="h-px w-full flex-shrink-0" style={{ backgroundImage: 'linear-gradient(90deg, transparent, rgba(34, 211, 238, 0.65), rgba(139, 92, 246, 0.55), rgba(52, 211, 153, 0.4), transparent)' }} />

        {/* Header */}
        <header className="relative flex-shrink-0 overflow-hidden border-b border-white/[0.07] px-5 pb-4 pt-5">
          <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'radial-gradient(120% 170% at 16% -30%, rgba(34, 211, 238, 0.16), transparent 58%), radial-gradient(75% 100% at 100% 0%, rgba(139, 92, 246, 0.13), transparent 65%)' }} />
          <div className="relative flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-dashed border-cyan-300/30 bg-gradient-to-br from-cyan-400/20 via-sky-400/10 to-violet-400/20 text-cyan-200 shadow-[0_0_24px_-10px_rgba(34,211,238,0.6)]">
              <PlugIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-cyan-300/80">Integration</span>
                <span className="h-1 w-1 rounded-full bg-violet-400/80" />
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-violet-300/60">Plugin Bridge</span>
              </div>
              <h2 id="c3d-connect-title" className="mt-1 text-[19px] font-semibold tracking-tight text-slate-100">
                Connect {getConnectorLabel(connectorType)}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Link your {getConnectorLabel(connectorType)} plugin to this session
              </p>
            </div>
            <button
              onClick={onClose}
              className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent text-slate-500 transition-colors hover:border-white/10 hover:bg-white/[0.05] hover:text-slate-200"
              aria-label="Close"
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5 scrollbar-hide">
        {/* Loading State */}          {loading && (
            <div className="flex items-center justify-center gap-3 py-10">
              <div className="h-8 w-8 animate-spin rounded-full border border-cyan-400/20 border-t-cyan-300" />
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Generating session</span>
            </div>
          )}

          {/* Session Token Display */}
          {sessionData && !loading && (
            <>
              {/* Token Box */}
              <div className="relative overflow-hidden rounded-xl border border-dashed border-cyan-300/25 bg-[#0e1620] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_50px_-30px_rgba(139,92,246,0.5)]">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ backgroundImage: 'linear-gradient(90deg, transparent, rgba(34, 211, 238, 0.55), rgba(139, 92, 246, 0.45), transparent)' }} />
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="c3d-session-token" className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-cyan-300/70">
                    Session token
                  </label>
                  <span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-emerald-400/80">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.65)]" />
                    Ready
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <code id="c3d-session-token" className="min-w-0 flex-1 truncate select-all font-mono text-[21px] font-semibold tracking-[0.08em] text-cyan-200">
                    {sessionData.sessionToken}
                  </code>
                  <button
                    onClick={copyToken}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors ${
                      copied
                        ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                        : 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-cyan-400/30 hover:bg-cyan-400/[0.06] hover:text-cyan-300'
                    }`}
                    title={copied ? 'Copied!' : 'Copy to clipboard'}
                    aria-label={copied ? 'Token copied' : 'Copy session token'}
                  >
                    {copied ? <CheckIcon /> : <CopyIcon />}
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-2.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
                    Valid for {formatCountdown(countdown)}
                  </span>
                  <button
                    onClick={createSession}
                    className="inline-flex items-center gap-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500 transition-colors hover:text-violet-300"
                    title="Generate new token"
                  >
                    <RefreshIcon />
                    Refresh
                  </button>
                </div>
              </div>

              {/* Instructions */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[11px] font-semibold tracking-wide text-slate-300">
                    How to connect
                  </h3>
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-violet-300/60">05 steps</span>
                </div>
                <ol className="space-y-1.5 text-[12px] leading-relaxed text-slate-400">
                  {[
                    <>Open {getConnectorLabel(connectorType)}</>,
                    <>Type <span className="rounded border border-sky-400/25 bg-sky-400/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-sky-300">LANDSURVAI</span> command</>,
                    <>Click &ldquo;Configure&rdquo; or &ldquo;Settings&rdquo;</>,
                    <>Paste the session token above</>,
                    <>Click &ldquo;Connect&rdquo;</>,
                  ].map((step, index) => (
                    <li key={index} className="flex items-start gap-2.5">
                      <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-cyan-400/20 bg-gradient-to-br from-cyan-400/[0.09] to-violet-400/[0.09] font-mono text-[8px] font-semibold text-cyan-200/80">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Status Badges */}
              <div className="flex flex-wrap gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] ${
                  isTrialActive || hasApiKey
                    ? 'border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300'
                    : 'border-rose-400/25 bg-rose-400/[0.06] text-rose-300'
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${isTrialActive || hasApiKey ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                  {hasApiKey ? 'API Key Active' : 'No API Key'}
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] ${hasApiKey ? 'border-sky-400/25 bg-sky-400/[0.06] text-sky-300' : 'border-violet-400/25 bg-violet-400/[0.06] text-violet-300'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${hasApiKey ? 'bg-sky-400' : 'bg-violet-400'}`} />
                  {hasApiKey ? 'Pro Tier' : 'Free Tier'}
                </span>
              </div>

              {/* Notice */}
              {!hasApiKey && (
                <div className="flex items-start gap-2.5 rounded-lg border border-violet-400/20 border-l-2 border-l-violet-400/70 bg-violet-400/[0.045] p-3 text-[11px] leading-relaxed text-violet-200/85">
                  <ExclamationTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-300" />
                  <p>
                    <strong className="font-semibold text-violet-200">Note:</strong> When your trial pauses, the Civil 3D connection will also pause. Enter your own API key to maintain continuous access.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <footer className="flex flex-shrink-0 flex-col gap-2 border-t border-white/[0.07] bg-black/25 px-3.5 py-3 sm:flex-row sm:items-center">
          <a
            href="https://connector-download.landsurv.ai/"
            className="group relative flex w-full flex-1 items-center justify-center gap-2 overflow-hidden rounded-lg border border-dashed border-cyan-100/50 bg-gradient-to-r from-cyan-400 via-sky-400 to-violet-400 px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#021019] shadow-[0_0_28px_-12px_rgba(34,211,238,0.8)] transition-all duration-300 hover:-translate-y-px hover:from-cyan-300 hover:via-sky-300 hover:to-violet-300 hover:shadow-[0_0_38px_-10px_rgba(34,211,238,0.9)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Download the ${getConnectorLabel(connectorType)} plugin`}
          >
            <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/60" />
            <DownloadIcon className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5" />
            <span>Download {getConnectorLabel(connectorType)} Plugin</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </a>
          <button
            onClick={onClose}
            className="h-9 w-full shrink-0 rounded-lg border border-white/10 bg-white/[0.03] px-4 text-[11px] font-semibold text-slate-400 transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white sm:w-auto"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
};

export default C3DConnectPanel;
