/**
 * Civil 3D State Sync Hook
 *
 * Maintains WebSocket connection to backend for on-demand state requests.
 * When Civil 3D requests data (e.g., "Import points"), backend sends request
 * to webapp via WebSocket, webapp responds with current React state.
 *
 * Sync-engine additions (connector overhaul Phase 2):
 * - sendToC3D accepts an optional timeoutMs (sync_apply can run for minutes)
 * - subscribeSyncEvents(): the relay now pushes sync_started / sync_progress /
 *   sync_completed / sync_canceled so the Sync Center can show live progress
 *   for syncs initiated from EITHER side.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { SessionState } from '../types';
import { buildOverlayLinework, buildPointIndex, resolveLineEndpoints, centerlinesToLinework } from '../services/c3dOverlayLinework';
import { CadManagerState } from '../contexts/types/CadManager.types';

/** Live lifecycle event for a sync running on either side of the link. */
export interface C3DSyncEvent {
  type: 'sync_started' | 'sync_progress' | 'sync_completed' | 'sync_canceled' | 'sync_lsai_apply' | 'drawings_update' | 'sync_mode' | 'c3d_agent_request';
  syncId?: string;
  source?: 'civil3d' | 'webapp';
  phase?: string;
  current?: number;
  total?: number;
  message?: string;
  summary?: string;
  reason?: string;
  timestamp?: string;
  /** sync_lsai_apply only: the LSAI-side plan the webapp must apply. */
  plan?: { planId: string; categories: Array<{ category: string; direction: string; entries: Array<{ key: string; action: string; explicit?: boolean }> }> };
  /** sync_lsai_apply only: the post-apply CAD snapshot for result echo. */
  cadSnapshot?: unknown;
  /** drawings_update only: live drawing list mirrored from the DLL. */
  drawings?: Array<{ name: string; fullPath: string; isActive: boolean; layerCount: number }>;
  /** sync_mode only: live reconciliation was enabled/disabled by the DLL. */
  enabled?: boolean;
  /** c3d_agent_request only: which LandSurv.ai agent should answer, and what was asked. */
  agent?: string;
  prompt?: string;
}

export type C3DSyncEventHandler = (event: C3DSyncEvent) => void;

// Extended state type to include CAD Manager
interface SyncState extends Partial<SessionState> {
  cadManagerState?: CadManagerState;
}

// Generate WebSocket URL based on environment
function getWebSocketUrl(path: string): string {
  // If VITE_API_URL is set (e.g., for pointing to external backend), use it
  const apiBase = (import.meta as any)?.env?.VITE_API_URL;
  if (apiBase) {
    return apiBase.replace(/^http/, 'ws') + path;
  }
  
  // For localhost development
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return `ws://localhost:3001${path}`;
  }
  
  // For production - derive from current page URL
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}${path}`;
  }
  
  // Fallback (shouldn't reach here)
  return path;
}

export function useC3DStateSync(sessionToken: string | null, sessionState: SyncState) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sessionStateRef = useRef<SyncState>(sessionState);
  const [isConnected, setIsConnected] = useState(false);
  const [isC3DClientConnected, setIsC3DClientConnected] = useState(false);
  const [c3dClientVersion, setC3DClientVersion] = useState<string | null>(null);

  // Keep session state ref updated
  useEffect(() => {
    sessionStateRef.current = sessionState;
  }, [sessionState]);

  // Pending request callbacks
  const pendingRequests = useRef<Map<string, { resolve: (result: any) => void; reject: (error: Error) => void; timeout: ReturnType<typeof setTimeout> }>>(new Map());

  // Sync lifecycle event subscribers (Sync Center, header badge, etc.)
  const syncEventHandlers = useRef<Set<C3DSyncEventHandler>>(new Set());

  const emitSyncEvent = useCallback((event: C3DSyncEvent) => {
    for (const handler of syncEventHandlers.current) {
      try {
        handler(event);
      } catch (err) {
        console.error('[C3D Sync] Sync event handler threw:', err);
      }
    }
  }, []);

  const subscribeSyncEvents = useCallback((handler: C3DSyncEventHandler): (() => void) => {
    syncEventHandlers.current.add(handler);
    return () => {
      syncEventHandlers.current.delete(handler);
    };
  }, []);

  // Send state when requested
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data);
      
      console.log('[C3D Sync] Received message type:', message.type);
      
      // Handle tool result responses from C3D
      if (message.type === 'tool_result') {
        const { requestId, result, success } = message;
        console.log(`[C3D Sync] Tool result received: ${requestId}, success=${success}`);
        
        const pending = pendingRequests.current.get(requestId);
        if (pending) {
          pendingRequests.current.delete(requestId);
          clearTimeout(pending.timeout);
          if (success) {
            // Parse the result if it's a string
            let parsedResult = result;
            if (typeof result === 'string') {
              try {
                parsedResult = JSON.parse(result);
              } catch {
                // Keep as string if not valid JSON
              }
            }
            pending.resolve(parsedResult);
          } else {
            pending.reject(new Error(result || 'Command failed'));
          }
        }
        return;
      }

      // Handle fast-fail command errors (e.g., C3D disconnected, sync mutex held).
      // Previously these were ignored and the caller hung until timeout.
      if (message.type === 'command_error') {
        const { requestId, error } = message;
        console.warn(`[C3D Sync] Command error for ${requestId}: ${error}`);
        const pending = pendingRequests.current.get(requestId);
        if (pending) {
          pendingRequests.current.delete(requestId);
          clearTimeout(pending.timeout);
          pending.reject(new Error(error || 'Command rejected by relay'));
        }
        return;
      }

      // Sync lifecycle events from the relay (DLL wizard progress, mutex events)
      if (message.type === 'sync_started' || message.type === 'sync_progress'
        || message.type === 'sync_completed' || message.type === 'sync_canceled') {
        emitSyncEvent(message as C3DSyncEvent);
        return;
      }

      // DLL sync wizard is asking the webapp to apply the LSAI-side actions of
      // its plan. State application is owned by App.tsx (React state setters live
      // there), so we emit an event carrying the parsed payload.
      if (message.type === 'sync_lsai_apply' && message.requestId) {
        console.log(`[C3D Sync] sync_lsai_apply received (${message.requestId})`);
        emitSyncEvent({
          type: 'sync_lsai_apply',
          syncId: message.requestId,
          plan: message.plan,
          cadSnapshot: message.cadSnapshot,
        } as C3DSyncEvent);
        return;
      }

      // DLL pushed its live drawing list (connect / drawing switch / refresh) —
      // mirror it in the webapp header.
      if (message.type === 'drawings_update') {
        console.log(`[C3D Sync] drawings_update: ${(message.drawings ?? []).length} drawing(s)`);
        emitSyncEvent({
          type: 'drawings_update',
          drawings: message.drawings,
        } as C3DSyncEvent);
        return;
      }

      if (message.type === 'sync_mode') {
        emitSyncEvent({
          type: 'sync_mode',
          enabled: message.enabled === true,
          timestamp: message.timestamp,
        });
        return;
      }

      // Relay handed a connector chat request to a LandSurv.ai agent (CACP).
      // App.tsx owns the agent chats, so it answers and replies via sendRaw.
      if (message.type === 'c3d_agent_request' && message.requestId) {
        console.log(`[C3D Sync] c3d_agent_request for ${message.agent} (${message.requestId})`);
        emitSyncEvent({
          type: 'c3d_agent_request',
          syncId: message.requestId,
          agent: message.agent,
          prompt: message.prompt,
        });
        return;
      }
      
      // Handle C3D client connection status notifications
      if (message.type === 'c3d_client_connected') {
        console.log('[C3D Sync] ✓ C3D client connected:', message.clientId);
        setIsC3DClientConnected(true);
        return;
      }
      
      if (message.type === 'c3d_client_disconnected') {
        console.log('[C3D Sync] ⚠ C3D client disconnected:', message.clientId);
        setIsC3DClientConnected(false);
        setC3DClientVersion(null); // Clear version on disconnect
        emitSyncEvent({ type: 'sync_mode', enabled: false });
        return;
      }
      
      // Handle C3D client version info
      if (message.type === 'c3d_client_info') {
        console.log('[C3D Sync] ✓ C3D client version:', message.version, 'Civil 3D:', message.civil3dVersion);
        setC3DClientVersion(message.version);
        return;
      }
      
      if (message.type === 'fetch_state') {
        console.log('[C3D Sync] Backend requesting current state');
        
        const state = sessionStateRef.current;
        const pointIndex = buildPointIndex(state.pointLists as any);
        const browserSessionId = typeof window !== 'undefined'
          ? (localStorage.getItem('landsurv_browser_session_id') || 'unknown-browser-session')
          : 'unknown-browser-session';
        const sessionIdentity = {
          browserSessionId,
          sessionId: browserSessionId,
          projectName: state.jobInfo?.jobName || '',
          parcelNumber: state.jobInfo?.jobNo || '',
          projectKey: `${state.jobInfo?.jobName || 'unknown'}::${state.jobInfo?.jobNo || 'unknown'}`,
        };
        
        // Build response payload
        const response = {
          type: 'state_response',
          requestId: message.requestId,
          data: {
            sessionIdentity,
            points: {
              lists: state.pointLists?.map(list => ({
                name: list.name,
                points: list.points.map(p => ({
                  number: p.pointNumber,
                  easting: p.easting,
                  northing: p.northing,
                  elevation: p.elevation,
                  rawDescription: p.description || '',
                })),
              })) || [],
            },
            
            lines: {
              boundary: resolveLineEndpoints(state.lines?.filter(l => !l.type), pointIndex),
              breaklines: resolveLineEndpoints(state.lines?.filter(l => l.type === 'breakline'), pointIndex),
              inclusions: resolveLineEndpoints(state.lines?.filter(l => l.type === 'inclusion'), pointIndex),
              exclusions: resolveLineEndpoints(state.lines?.filter(l => l.type === 'exclusion'), pointIndex),
              // Agent-generated overlays (GIS parcel lines, contours, soils, FEMA
              // flood, steep slope, TIN edges). Chained into runs with stable ids
              // so the connector treats them as ordinary linework.
              overlays: buildOverlayLinework(state.lines),
            },
            
            deed: state.deedFile ? {
              lines: state.lines?.filter(l => !l.type) || [],
              metadata: {
                source: state.deedFile.name,
                parcelId: state.jobInfo?.jobNo,
              },
            } : null,
            
            centerlines: centerlinesToLinework(state.centerlines),
            
            jobInfo: {
              projectName: state.jobInfo?.jobName,
              parcelNumber: state.jobInfo?.jobNo,
            },
            
            projection: state.settings?.projection,

            // Annotation slice (street names, parcel owner labels, category styles)
            annotations: {
              streetLabels: state.streetLabels || [],
              parcelLabels: (state.parcelLabels || []).map(p => ({
                id: p.id,
                x: p.x,
                y: p.y,
                angle: p.angle,
                parcelId: p.parcelId,
                owner: p.owner,
                deedRef: p.deedRef ?? null,
              })),
              categories: state.annotationCategories || [],
              annotationScale: state.annotationScale ?? 1,
              rules: state.customAnnotations || [],
            },

            // Symbol library slice (custom symbols the CAD side can materialize
            // as block definitions via the SVG→entity pipeline)
            symbols: (state.customSymbols || []).map(s => ({
              id: s.id,
              name: s.name,
              description: s.description,
              associatedTerms: s.associatedTerms || [],
              svgPath: s.svgPath,
              fillPath: s.fillPath || null,
              viewBox: s.viewBox,
              scale: s.scale,
              isDefault: s.isDefault ?? false,
              hidden: s.hidden ?? false,
            })),
            
            // CAD Manager / Field-to-Finish standards
            cadManager: state.cadManagerState?.standard ? {
              standardName: state.cadManagerState.standard.name,
              standardVersion: state.cadManagerState.standard.version,
              codes: state.cadManagerState.standard.codes.map(c => ({
                code: c.code,
                description: c.description,
                pointLayer: c.pointLayer,
                lineLayer: c.lineLayer || null,
                symbol: c.symbol || null,
                category: c.category || null,
              })),
              layers: state.cadManagerState.standard.layers?.map(l => ({
                name: l.name,
                // Prefer the resolved RGB captured when layers were pulled from
                // a drawing; the connector normalizes CAD colours to #RRGGBB, so
                // sending a bare ACI index would never compare equal.
                color: l.colorRgb ?? l.color,
                lineType: l.lineType,
                lineWeight: l.lineWeight,
              })) || [],
              aliases: state.cadManagerState.aliases || {},
            } : null,
          },
        };
        
        wsRef.current?.send(JSON.stringify(response));
        console.log('[C3D Sync] Sent state to backend');
      }
    } catch (err) {
      console.error('[C3D Sync] Error handling message:', err);
    }
  }, []);

  // Connect WebSocket
  const connect = useCallback(() => {
    if (!sessionToken) {
      console.log('[C3D Sync] No session token, skipping WebSocket connection');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[C3D Sync] WebSocket already connected');
      return;
    }

    try {
      const url = getWebSocketUrl(`/c3d/webapp-sync?token=${sessionToken}`);
      console.log('[C3D Sync] Connecting to:', url);
      console.log('[C3D Sync] Token:', sessionToken.substring(0, 8) + '...');
      
      const ws = new WebSocket(url);
      
      ws.onopen = () => {
        console.log('[C3D Sync] ✓ WebSocket connected to /c3d/webapp-sync');
        setIsConnected(true);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
        
        // Ask backend if C3D is already connected (in case we're reconnecting)
        ws.send(JSON.stringify({ type: 'check_c3d_status' }));
      };
      
      ws.onmessage = handleMessage;
      
      ws.onerror = (err) => {
        console.error('[C3D Sync] WebSocket error:', err);
        // Only update state if this is still the current WebSocket
        if (wsRef.current === ws) {
          setIsConnected(false);
        }
      };
      
      ws.onclose = () => {
        console.log('[C3D Sync] WebSocket closed, will reconnect in 5s');
        // Only update state if this is still the current WebSocket
        // This prevents race conditions when a new WebSocket is created before the old one fully closes
        if (wsRef.current === ws) {
          wsRef.current = null;
          setIsConnected(false);
          // When our WebSocket closes, we lose ability to communicate with C3D
          // Reset this - it will be restored on reconnect if C3D is still connected
          setIsC3DClientConnected(false);
          setC3DClientVersion(null);
          
          // Auto-reconnect after 5 seconds
          if (sessionToken) {
            reconnectTimeoutRef.current = setTimeout(() => {
              console.log('[C3D Sync] Attempting reconnect...');
              connect();
            }, 5000);
          }
        } else {
          console.log('[C3D Sync] Old WebSocket closed (new one already active)');
        }
      };
      
      wsRef.current = ws;
    } catch (err) {
      console.error('[C3D Sync] Failed to create WebSocket:', err);
    }
  }, [sessionToken, handleMessage]);

  // Connect on mount or when token changes
  useEffect(() => {
    connect();
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Reset connection state when token is cleared
  useEffect(() => {
    if (!sessionToken) {
      setIsConnected(false);
      setIsC3DClientConnected(false);
    }
  }, [sessionToken]);

  /**
   * Send a command to Civil 3D via WebSocket and wait for result
   * This bypasses HTTP and ensures the command goes through the same Cloud Run instance
   * that has the WebSocket connection.
   * @param timeoutMs override the 30s default — sync_apply can legitimately run for minutes
   */
  const sendToC3D = useCallback(<T = any>(tool: string, args: Record<string, any>, timeoutMs: number = 30000): Promise<T> => {
    return new Promise((resolve, reject) => {
      console.log(`[C3D Sync] sendToC3D called: tool=${tool}, wsRef=${!!wsRef.current}, readyState=${wsRef.current?.readyState}, isC3DClientConnected=${isC3DClientConnected}`);
      
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        console.error(`[C3D Sync] WebSocket not open: wsRef=${!!wsRef.current}, readyState=${wsRef.current?.readyState}`);
        reject(new Error('WebSocket not connected'));
        return;
      }

      if (!isC3DClientConnected) {
        console.error('[C3D Sync] C3D client not connected');
        reject(new Error('Civil 3D not connected'));
        return;
      }

      const requestId = `ws-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      
      // Set a timeout to reject if no response
      const timeout = setTimeout(() => {
        if (pendingRequests.current.has(requestId)) {
          pendingRequests.current.delete(requestId);
          reject(new Error(`Timeout waiting for ${tool} response`));
        }
      }, timeoutMs);

      // Store the promise callbacks for when the result comes back
      pendingRequests.current.set(requestId, { resolve, reject, timeout });
      
      const message = {
        type: 'send_to_c3d',
        requestId,
        tool,
        args,
      };

      try {
        wsRef.current.send(JSON.stringify(message));
        console.log(`[C3D Sync] Sent command to C3D: ${tool} (${requestId})`);
        // Don't resolve here - wait for tool_result message
      } catch (err) {
        console.error('[C3D Sync] Failed to send command:', err);
        pendingRequests.current.delete(requestId);
        reject(err);
      }
    });
  }, [isC3DClientConnected]);

  /**
   * Fire-and-forget message on the webapp-sync socket (no response awaited).
   * Used for sync_lsai_result replies to the DLL sync wizard.
   */
  const sendRaw = useCallback((message: Record<string, unknown>): boolean => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('[C3D Sync] sendRaw: WebSocket not open');
      return false;
    }
    try {
      wsRef.current.send(JSON.stringify(message));
      return true;
    } catch (err) {
      console.error('[C3D Sync] sendRaw failed:', err);
      return false;
    }
  }, []);

  // Expose reconnect function for manual reconnection
  const reconnect = useCallback(() => {
    console.log('[C3D Sync] Manual reconnect triggered');
    if (wsRef.current) {
      wsRef.current.close();
    }
    connect();
  }, [connect]);

  return {
    isConnected,
    isC3DClientConnected,
    c3dClientVersion,
    sendToC3D,
    sendRaw,
    reconnect,
    subscribeSyncEvents,
  };
}
