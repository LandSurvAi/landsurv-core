/**
 * Service Worker for LandSurv.ai
 * Provides app-shell caching plus safe offline fallbacks.
 */

const CACHE_VERSION = 'v1.39.0';
const APP_SHELL_CACHE = `landsurv-shell-${CACHE_VERSION}`;
const STATIC_ASSET_CACHE = `landsurv-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `landsurv-runtime-${CACHE_VERSION}`;
const OFFLINE_FALLBACK_URL = '/offline.html';

const APP_SHELL_URLS = ['/', '/index.html', OFFLINE_FALLBACK_URL, '/manifest.webmanifest', '/favicon-32.png', '/favicon-192.png', '/favicon-512.png'];

const isSameOrigin = (url) => url.origin === self.location.origin;
const isApiRequest = (url) => url.pathname.startsWith('/api/');
const isNavigationRequest = (request) => request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html');
const isStaticAssetRequest = (request) => {
  return request.destination === 'font' ||
    request.destination === 'image' ||
    request.destination === 'manifest';
};

const cachePutSafe = async (cacheName, request, response) => {
  if (!response || !response.ok) {
    return;
  }

  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shellCache = await caches.open(APP_SHELL_CACHE);
      try {
        await shellCache.addAll(APP_SHELL_URLS);
      } catch (error) {
        console.log('[SW] Shell precache failed; continuing with runtime caching:', error);
      }
    })()
  );

  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const validCaches = new Set([APP_SHELL_CACHE, STATIC_ASSET_CACHE, RUNTIME_CACHE]);
      const cacheNames = await caches.keys();

      await Promise.all(
        cacheNames.map((cacheName) => {
          if (!validCaches.has(cacheName)) {
            return caches.delete(cacheName);
          }
          return Promise.resolve();
        })
      );

      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (!isSameOrigin(url) || isApiRequest(url)) {
    return;
  }

  if (isNavigationRequest(request)) {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          await cachePutSafe(APP_SHELL_CACHE, request, networkResponse);
          return networkResponse;
        } catch (error) {
          const cachedPage = await caches.match(request);
          if (cachedPage) {
            return cachedPage;
          }

          const cachedIndex = await caches.match('/index.html');
          if (cachedIndex) {
            return cachedIndex;
          }

          const offlineFallback = await caches.match(OFFLINE_FALLBACK_URL);
          if (offlineFallback) {
            return offlineFallback;
          }

          return new Response('Offline', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
      })()
    );
    return;
  }

  // Allow browser to load scripts and styles natively from network
  // without SW proxy wrapping to prevent module loading errors.
  if (request.destination === 'script' || request.destination === 'style') {
    return;
  }

  if (isStaticAssetRequest(request)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) {
          event.waitUntil(
            fetch(request)
              .then((response) => cachePutSafe(STATIC_ASSET_CACHE, request, response))
              .catch(() => undefined)
          );
          return cached;
        }

        try {
          const networkResponse = await fetch(request);
          await cachePutSafe(STATIC_ASSET_CACHE, request, networkResponse);
          return networkResponse;
        } catch (error) {
          if (request.destination === 'image') {
            const fallbackIcon = await caches.match('/favicon-192.png');
            if (fallbackIcon) {
              return fallbackIcon;
            }
          }

          throw error;
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const networkResponse = await fetch(request);
        await cachePutSafe(RUNTIME_CACHE, request, networkResponse);
        return networkResponse;
      } catch (error) {
        const cached = await caches.match(request);
        if (cached) {
          return cached;
        }
        throw error;
      }
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
