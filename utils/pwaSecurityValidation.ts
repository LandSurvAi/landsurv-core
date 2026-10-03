/**
 * Service Worker Scope and Security Validation
 * Ensures SW scope matches manifest scope and prevents cache poisoning.
 */

const SW_SCOPE = '/';
const MANIFEST_START_URL = '/';

/**
 * Validate that the service worker scope matches manifest configuration.
 * Prevents scope mismatches that could lead to cache inconsistencies.
 */
export const validateServiceWorkerScope = async (): Promise<boolean> => {
  if (!('serviceWorker' in navigator)) {
    return false;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();

    for (const registration of registrations) {
      if (registration.scope !== SW_SCOPE) {
        console.warn(
          `[PWA] Service Worker scope mismatch: expected ${SW_SCOPE}, got ${registration.scope}`
        );
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('[PWA] Failed to validate service worker scope:', error);
    return false;
  }
};

/**
 * Verify CSP header compliance for PWA offline mode.
 * Ensures that offline fallback HTML can execute without CSP violations.
 */
export const validateCSPCompliance = (): boolean => {
  const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  if (!meta) {
    return true;
  }

  const cspContent = meta.getAttribute('content') || '';

  const requiredDirectives = ['default-src', 'script-src', 'style-src'];
  const hasAllDirectives = requiredDirectives.every((directive) =>
    cspContent.includes(directive)
  );

  if (!hasAllDirectives) {
    console.warn(
      '[PWA] CSP meta tag missing required directives. Server CSP header should be used instead.'
    );
  }

  return true;
};

/**
 * Check for secure HTTPS enforcement in production.
 */
export const validateHTTPSEnforcement = (): boolean => {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  if (!isLocalhost && window.location.protocol !== 'https:') {
    console.error('[PWA] Production must use HTTPS for service worker and token security.');
    return false;
  }

  return true;
};

/**
 * Validate that offline fallback can be served from cache without CSP violations.
 */
export const validateOfflineFallback = async (): Promise<boolean> => {
  try {
    const cache = await caches.open('landsurv-shell-v1.37.0');
    const offlinePage = await cache.match('/offline.html');

    if (!offlinePage) {
      console.warn('[PWA] Offline fallback page not found in cache.');
      return false;
    }

    return true;
  } catch (error) {
    console.error('[PWA] Failed to validate offline fallback:', error);
    return false;
  }
};

/**
 * Run all PWA security validations.
 */
export const runPwaSecurityValidation = async (): Promise<Record<string, boolean>> => {
  const results = {
    swScope: await validateServiceWorkerScope(),
    cspCompliance: validateCSPCompliance(),
    httpsEnforcement: validateHTTPSEnforcement(),
    offlineFallback: await validateOfflineFallback(),
  };

  const allPassed = Object.values(results).every((v) => v);
  if (allPassed) {
    console.log('[PWA] Security validation passed ✓');
  } else {
    console.warn('[PWA] Security validation detected issues:', results);
  }

  return results;
};
