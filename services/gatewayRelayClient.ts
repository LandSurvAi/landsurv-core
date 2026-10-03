/**
 * Gateway relay client (browser side)
 *
 * Connects the signed-in web app to the backend gateway relay
 * (routes/gatewayRelayWs.ts) so external AI platforms (Claude / ChatGPT / Grok)
 * can perform session-bound Point Editor actions in *this* open project.
 *
 * Incoming `gateway_relay_request` messages are dispatched through the genuine
 * client-side CACP bus (interAgentComm.request → PointAgent), so staging and
 * point-number reservation keep the same policy enforcement and activity-log
 * behaviour as any other in-app agent call. The result is returned to the
 * backend as a `gateway_relay_response`, tagged with the originating platform.
 *
 * Auth reuses the stored user API key (same credential the app uses for other
 * authenticated backend calls). If there is no key, the client stays idle.
 */

import { interAgentComm } from './InterAgentCommunication';
import { AgentType } from '../types';
import { getStoredUserApiKey } from './apiAuth';

type RelayMethod = 'stage_points' | 'reserve_point_numbers';

interface RelayRequest {
  type: 'gateway_relay_request';
  requestId: string;
  method: RelayMethod;
  params: Record<string, unknown>;
  platform: string;
}

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;

function relayWsUrl(token: string): string {
  // Same-origin: the frontend nginx proxies /api/ (incl. WebSocket upgrades) to
  // the in-container backend, so /api/gateway-relay works on any *.landsurv.ai
  // host without depending on the (ingress-restricted) backend .run.app URL.
  const q = `/api/gateway-relay?token=${encodeURIComponent(token)}`;
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return `ws://localhost:3001${q}`;
  }
  const proto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = typeof window !== 'undefined' ? window.location.host : '';
  return `${proto}//${host}${q}`;
}

async function handleRelayRequest(msg: RelayRequest): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  // Tag the CACP sender with the originating AI platform for log attribution.
  const from = `gateway-${msg.platform}` as unknown as AgentType;
  try {
    if (msg.method === 'reserve_point_numbers') {
      const count = Number((msg.params as any).count) || 1;
      const res = await interAgentComm.request(from, AgentType.POINT_EDITOR, 'reserve_point_numbers', { count });
      const numbers = (res?.data as any)?.numbers ?? (res?.data as any)?.issued ?? [];
      return { ok: true, data: { numbers } };
    }
    if (msg.method === 'stage_points') {
      const points = ((msg.params as any).points ?? []) as Array<Record<string, unknown>>;
      const res = await interAgentComm.request(from, AgentType.POINT_EDITOR, 'update_point_list', {
        listName: 'AI Staged Points',
        points,
      });
      const listId = (res?.data as any)?.listId;
      return { ok: Boolean(res?.success ?? true), data: { staged: points.length, listId } };
    }
    return { ok: false, error: `Unknown relay method: ${msg.method}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function scheduleReconnect() {
  if (stopped || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectGatewayRelay();
  }, 5000);
}

/**
 * Open (or re-open) the gateway relay connection. Safe to call repeatedly; a
 * no-op when already connected or when no API key is available.
 */
export function connectGatewayRelay(): void {
  if (typeof window === 'undefined') return;
  stopped = false;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  const token = getStoredUserApiKey();
  if (!token) return; // Not signed in — stay idle.

  try {
    socket = new WebSocket(relayWsUrl(token));
  } catch {
    scheduleReconnect();
    return;
  }

  socket.onmessage = async (event) => {
    let msg: any;
    try {
      msg = JSON.parse(typeof event.data === 'string' ? event.data : '');
    } catch {
      return;
    }
    if (msg?.type !== 'gateway_relay_request' || typeof msg.requestId !== 'string') return;

    const result = await handleRelayRequest(msg as RelayRequest);
    try {
      socket?.send(JSON.stringify({
        type: 'gateway_relay_response',
        requestId: msg.requestId,
        ok: result.ok,
        data: result.data,
        error: result.error,
      }));
    } catch {
      /* socket closed mid-flight; backend will time out */
    }
  };

  socket.onclose = () => {
    socket = null;
    scheduleReconnect();
  };

  socket.onerror = () => {
    try { socket?.close(); } catch { /* ignore */ }
  };
}

/** Close the relay connection and stop reconnecting (e.g. on sign-out). */
export function disconnectGatewayRelay(): void {
  stopped = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  try { socket?.close(); } catch { /* ignore */ }
  socket = null;
}
