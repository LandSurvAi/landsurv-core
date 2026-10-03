// FUTURE GEMINI: This is the main entry point for the React application.
// Do not modify this file unless you are changing the root component or adding a top-level provider.
import React from 'react';
import ReactDOM from 'react-dom/client';
// FIX: Changed default import to a named import to match the updated export style of App.tsx.
import { App } from './App.tsx';
// Initialize error logging system
import { errorLogger } from './utils/errorLogger';
// World-wide settings (announcement banner, maintenance mode, retired agents).
// Starts a background poll so every browser stays in sync with the DevOps console.
import { startGlobalSettingsPolling } from './utils/globalSettings';
import { GlobalSettingsOverlay } from './components/GlobalSettingsOverlay';
import { PwaLifecycleOverlay } from './components/PwaLifecycleOverlay';
import { initializeOfflineQueue } from './services/OfflineQueue';
// Import Tailwind CSS
import './index.css';

const clearInitialLoader = () => {
  const loader = document.getElementById('initial-loader');
  if (!loader) {
    return;
  }

  loader.classList.add('hidden');
  setTimeout(() => {
    if (loader.parentElement) {
      loader.parentElement.removeChild(loader);
    }
  }, 500);
};

const isLocalhost =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname === '::1';

const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

type LaunchQueueLike = {
  setConsumer: (consumer: (params: { files?: Array<{ getFile: () => Promise<File> }> }) => void | Promise<void>) => void;
};

const dispatchPwaLaunchFiles = (files: File[]) => {
  window.dispatchEvent(
    new CustomEvent('landsurv:pwa-launch-files', {
      detail: { files },
    })
  );
};

const registerPwaLaunchQueue = () => {
  if (isLocalhost) {
    return;
  }

  const launchQueue = (window as Window & { launchQueue?: LaunchQueueLike }).launchQueue;
  if (!launchQueue?.setConsumer) {
    return;
  }

  launchQueue.setConsumer(async (launchParams) => {
    const handles = launchParams?.files ?? [];
    if (handles.length === 0) {
      return;
    }

    const launchedFiles: File[] = [];
    for (const handle of handles) {
      try {
        const file = await handle.getFile();
        if (file) {
          launchedFiles.push(file);
        }
      } catch (error) {
        console.warn('[PWA] Failed to resolve launched file handle:', error);
      }
    }

    if (launchedFiles.length > 0) {
      console.log(`[PWA] Received ${launchedFiles.length} launched file(s)`);
      dispatchPwaLaunchFiles(launchedFiles);
    }
  });
};

const notifyPwaUpdateAvailable = (registration: ServiceWorkerRegistration) => {
  window.dispatchEvent(
    new CustomEvent('landsurv:pwa-update-available', {
      detail: { registration },
    })
  );
};

const attachInstallingWorkerListener = (registration: ServiceWorkerRegistration) => {
  const installingWorker = registration.installing;
  if (!installingWorker) {
    return;
  }

  installingWorker.addEventListener('statechange', () => {
    if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
      notifyPwaUpdateAvailable(registration);
    }
  });
};

const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator) || isLocalhost) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        console.log('[PWA] Service Worker registered:', registration);

        if (registration.waiting) {
          notifyPwaUpdateAvailable(registration);
        }

        registration.addEventListener('updatefound', () => {
          attachInstallingWorkerListener(registration);
        });

        setInterval(() => {
          registration.update().catch((error) => {
            console.warn('[PWA] Service Worker update check failed:', error);
          });
        }, UPDATE_CHECK_INTERVAL_MS);
      })
      .catch((error) => {
        console.log('[PWA] Service Worker registration failed:', error);
      });
  });
};

registerServiceWorker();
registerPwaLaunchQueue();

// Initialize offline queue for request replay on reconnect
initializeOfflineQueue();

// APP_VERSION is injected at build time by Vite (see vite.config.ts)
const APP_VERSION = (import.meta as any).env.VITE_APP_VERSION || 'dev';
const STORED_VERSION = localStorage.getItem('app_version');

// Force cache clear if version changed
if (STORED_VERSION !== APP_VERSION) {
  console.log(`Version changed from ${STORED_VERSION} to ${APP_VERSION}. Clearing caches...`);
  
  // Clear all caches
  if ('caches' in window) {
    caches.keys().then(names => {
      names.forEach(name => caches.delete(name));
    });
  }
  
  // Store new version
  localStorage.setItem('app_version', APP_VERSION);
  
  // Force reload from server (bypass cache)
  if (STORED_VERSION) {
    window.location.reload();
  }
}

// Standard React app initialization for all routes.
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
// Kick off the world-wide settings poll before first render so banners /
// maintenance mode / retired-agents updates land as soon as possible.
startGlobalSettingsPolling();
root.render(
  <React.StrictMode>
    <PwaLifecycleOverlay />
    <GlobalSettingsOverlay />
    <App />
  </React.StrictMode>
);

// Startup fail-safe: never let the static splash block the UI forever.
requestAnimationFrame(() => {
  setTimeout(clearInitialLoader, 150);
});
setTimeout(clearInitialLoader, 4000);