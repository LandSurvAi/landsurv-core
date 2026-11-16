/**
 * Replay-mode network guard.
 *
 * Playback mounts the real app, so the guard has two phases:
 * - boot: same-origin app assets may load, but API, cross-origin, sockets and
 *   beacons are blocked while the app module graph evaluates.
 * - strict: after the first recorded frame, only blob/data URLs are allowed.
 */

type Restore = () => void;
export type ReplayNetworkPhase = 'boot' | 'strict';

export class ReplayOfflineError extends Error {
  readonly code = 'REPLAY_OFFLINE';

  constructor(message = 'Playback is offline: live network requests are blocked.') {
    super(message);
    this.name = 'ReplayOfflineError';
  }
}

let blockedCount = 0;
let installed = false;
let currentPhase: ReplayNetworkPhase = 'strict';

export const getBlockedReplayRequestCount = (): number => blockedCount;
export const isReplayNetworkGuardInstalled = (): boolean => installed;
export const getReplayNetworkGuardPhase = (): ReplayNetworkPhase => currentPhase;

export const setReplayNetworkGuardPhase = (phase: ReplayNetworkPhase): void => {
  currentPhase = phase;
};

const isLocalUrl = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  return value.startsWith('blob:') || value.startsWith('data:');
};

const isBootAssetUrl = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value, window.location.href);
    if (url.origin !== window.location.origin) return false;
    return !url.pathname.startsWith('/api/');
  } catch {
    return false;
  }
};

const mayRequest = (url: unknown): boolean => {
  if (isLocalUrl(url)) return true;
  return currentPhase === 'boot' && isBootAssetUrl(url);
};

export const installReplayNetworkGuard = (
  options?: { phase?: ReplayNetworkPhase },
): Restore => {
  currentPhase = options?.phase ?? 'strict';
  if (typeof window === 'undefined' || installed) return () => {};
  installed = true;

  const w = window as Window & typeof globalThis & {
    fetch: typeof fetch;
    XMLHttpRequest: typeof XMLHttpRequest;
    WebSocket: typeof WebSocket;
    EventSource: typeof EventSource;
  };
  const originalFetch = w.fetch;
  const OriginalXhr = w.XMLHttpRequest;
  const OriginalWebSocket = w.WebSocket;
  const OriginalEventSource = w.EventSource;
  const originalBeacon = navigator.sendBeacon?.bind(navigator);

  const blocked = (what: string): void => {
    blockedCount += 1;
    console.warn(`[Playback] Blocked live network access (${what}).`);
  };

  w.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (mayRequest(url)) return originalFetch(input, init);
    blocked(`fetch ${url.slice(0, 120)}`);
    return Promise.reject(new ReplayOfflineError());
  }) as typeof fetch;

  w.XMLHttpRequest = class ReplayBlockedXhr extends OriginalXhr {
    open(method: string, url: string | URL, ...rest: unknown[]): void {
      blocked(`xhr ${String(url).slice(0, 120)}`);
      // Keep the object valid but never reach the network.
      super.open(method, 'about:blank', ...(rest as []));
    }
    send(): void {
      blocked('xhr send');
      this.abort();
    }
  } as typeof XMLHttpRequest;

  w.WebSocket = class ReplayBlockedWebSocket {
    constructor() {
      blocked('websocket');
      throw new ReplayOfflineError('Playback is offline: WebSocket connections are blocked.');
    }
  } as unknown as typeof WebSocket;

  w.EventSource = class ReplayBlockedEventSource {
    constructor() {
      blocked('eventsource');
      throw new ReplayOfflineError('Playback is offline: EventSource connections are blocked.');
    }
  } as unknown as typeof EventSource;

  if (originalBeacon) {
    navigator.sendBeacon = ((url: string) => {
      if (mayRequest(url)) return originalBeacon(url);
      blocked(`beacon ${String(url).slice(0, 120)}`);
      return false;
    }) as typeof navigator.sendBeacon;
  }

  return () => {
    w.fetch = originalFetch;
    w.XMLHttpRequest = OriginalXhr;
    w.WebSocket = OriginalWebSocket;
    w.EventSource = OriginalEventSource;
    if (originalBeacon) navigator.sendBeacon = originalBeacon;
    installed = false;
  };
};
