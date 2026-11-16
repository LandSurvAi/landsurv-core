/**
 * Replay-mode network guard.
 *
 * The replay tab is a self-contained artifact. It must never depend on live
 * inference, polling, telemetry, or a project backend. The guard is installed
 * after the replay module has loaded, so Vite's own module fetches have already
 * finished, and then blocks every outbound transport. Blob/data reads stay
 * available because they are local.
 */

type Restore = () => void;

let blockedCount = 0;
let installed = false;

export const getBlockedReplayRequestCount = (): number => blockedCount;
export const isReplayNetworkGuardInstalled = (): boolean => installed;

const isLocalUrl = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  return value.startsWith('blob:') || value.startsWith('data:');
};

export const installReplayNetworkGuard = (): Restore => {
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
    console.warn(`[Replay] Blocked live network access (${what}).`);
  };

  w.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (isLocalUrl(url)) return originalFetch(input, init);
    blocked(`fetch ${url.slice(0, 120)}`);
    return Promise.reject(new Error('Replay mode is offline: live network requests are blocked.'));
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
      throw new Error('Replay mode is offline: WebSocket connections are blocked.');
    }
  } as unknown as typeof WebSocket;

  w.EventSource = class ReplayBlockedEventSource {
    constructor() {
      blocked('eventsource');
      throw new Error('Replay mode is offline: EventSource connections are blocked.');
    }
  } as unknown as typeof EventSource;

  if (originalBeacon) {
    navigator.sendBeacon = ((url: string) => {
      if (isLocalUrl(url)) return originalBeacon(url);
      blocked(`beacon ${url.slice(0, 120)}`);
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
