/**
 * Central CORS-proxy helper with automatic failover.
 *
 * Multiple public CORS proxies have been unreliable across LandSurv.ai history:
 * - corsproxy.io: SSL/TLS outage in early 2026 (see release notes v26.x.x.x)
 * - api.allorigins.win: started timing out ~May 2026 (408 Request Timeout)
 *
 * Instead of pinning to a single proxy, this helper tries a prioritized list
 * and returns the first URL that responded with a 2xx. For `<img>` tags (where
 * we can't intercept the request before sending it), `firstProxiedImageUrl()`
 * just returns the highest-priority proxied URL string — the caller still has
 * to listen for img.onerror and retry with `nextProxiedImageUrl()`.
 *
 * Adding/reordering proxies: edit PROXIES below. Each entry is a function that
 * wraps the target URL in the proxy's expected query format.
 */

export interface ProxyDef {
  /** Stable id for logging. */
  id: string;
  /** Build the full proxied URL for an arbitrary target. */
  wrap: (targetUrl: string) => string;
}

/**
 * Ordered list of CORS proxies. Highest priority first. The first one that
 * responds with a 2xx wins. All entries must support both text (JSON / XML)
 * AND binary (PNG / JPEG) responses so they can serve the WMS image pipeline.
 *
 * Last verified 2026-05-17.
 */
export const PROXIES: ProxyDef[] = [
  {
    id: 'codetabs',
    wrap: (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
  },
  {
    id: 'allorigins',
    wrap: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  },
  {
    id: 'corsproxy.io',
    wrap: (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  },
];

/** Highest-priority proxied URL — for synchronous use in `<img src=...>`. */
export function firstProxiedUrl(targetUrl: string): string {
  return PROXIES[0].wrap(targetUrl);
}

/** Return every proxied URL in priority order (callers can iterate for retry). */
export function allProxiedUrls(targetUrl: string): { id: string; url: string }[] {
  return PROXIES.map((p) => ({ id: p.id, url: p.wrap(targetUrl) }));
}

/**
 * Fetch through the prioritized proxy list, returning the first 2xx response.
 * Throws if every proxy failed. Use this for JSON / XML / text payloads.
 */
export async function fetchViaProxy(
  targetUrl: string,
  init?: RequestInit & { perProxyTimeoutMs?: number }
): Promise<Response> {
  const errors: string[] = [];
  const timeoutMs = init?.perProxyTimeoutMs ?? 15000;
  for (const proxy of PROXIES) {
    const proxiedUrl = proxy.wrap(targetUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(proxiedUrl, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return res;
      errors.push(`${proxy.id}=${res.status}`);
    } catch (e: unknown) {
      clearTimeout(timer);
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${proxy.id}=${msg}`);
    }
  }
  throw new Error(`All CORS proxies failed for ${targetUrl}: ${errors.join('; ')}`);
}

async function looksLikeImage(blob: Blob): Promise<boolean> {
  if (blob.size < 8) return false;
  if (blob.type.startsWith('image/')) return true;
  const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  const png = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  const jpeg = head[0] === 0xff && head[1] === 0xd8;
  return png || jpeg;
}

/**
 * Fetch an image as a Blob through the proxy list. A proxy that answers 200
 * with an error page is skipped; as a last resort the image is loaded through
 * an <img> element and re-encoded.
 */
export async function fetchImageBlobViaProxy(targetUrl: string, perProxyTimeoutMs = 15000): Promise<Blob> {
  const errors: string[] = [];
  for (const proxy of PROXIES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), perProxyTimeoutMs);
    try {
      const res = await fetch(proxy.wrap(targetUrl), { signal: controller.signal });
      if (!res.ok) {
        errors.push(`${proxy.id}=${res.status}`);
        continue;
      }
      const blob = await res.blob();
      if (await looksLikeImage(blob)) return blob;
      errors.push(`${proxy.id}=not-image`);
    } catch (e: unknown) {
      errors.push(`${proxy.id}=${e instanceof Error ? e.message : String(e)}`);
    } finally {
      clearTimeout(timer);
    }
  }
  try {
    const img = await loadImageViaProxy(targetUrl);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d')!.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (blob) return blob;
  } catch (e: unknown) {
    errors.push(`img=${e instanceof Error ? e.message : String(e)}`);
  }
  throw new Error(`All CORS proxies failed for image ${targetUrl}: ${errors.join('; ')}`);
}

/**
 * Load a binary image (PNG/JPEG) through the proxy list, retrying with the
 * next proxy in priority order on each failure. Resolves to an HTMLImageElement
 * once one proxy succeeds, rejects if every proxy fails.
 */
export function loadImageViaProxy(targetUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    let index = 0;
    const errors: string[] = [];
    const tryNext = () => {
      if (index >= PROXIES.length) {
        reject(new Error(`All CORS proxies failed for image ${targetUrl}: ${errors.join('; ')}`));
        return;
      }
      const proxy = PROXIES[index++];
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => {
        errors.push(`${proxy.id}=onerror`);
        tryNext();
      };
      img.src = proxy.wrap(targetUrl);
    };
    tryNext();
  });
}
