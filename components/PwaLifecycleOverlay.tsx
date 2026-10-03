import React, { useEffect, useMemo, useRef, useState } from 'react';
import { trackPwaEvent } from '../utils/pwaTelemetry';

type BeforeInstallPromptEvent = Event & {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt: () => Promise<void>;
};

type PwaUpdateEventDetail = {
  registration: ServiceWorkerRegistration;
};

const isStandalone = () => {
  const matchMediaStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const navigatorStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return matchMediaStandalone || navigatorStandalone;
};

const isSubdomainHost = () => {
  const host = window.location.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    return false;
  }

  // Example: "landsurv.ai" => apex (false), "privacy.landsurv.ai" => subdomain (true)
  return host.split('.').length > 2;
};

export const PwaLifecycleOverlay: React.FC = () => {
  const installPromptEventRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(() => isStandalone());
  const [updateRegistration, setUpdateRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [isApplyingUpdate, setIsApplyingUpdate] = useState(false);
  const suppressInstallPrompt = useMemo(() => isSubdomainHost(), []);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      // Always suppress browser-native install prompt on subdomains.
      event.preventDefault();

      installPromptEventRef.current = suppressInstallPrompt ? null : event as BeforeInstallPromptEvent;
    };

    const onAppInstalled = () => {
      installPromptEventRef.current = null;
      setIsInstalled(true);
      trackPwaEvent('pwa_install_completed');
    };

    const onPwaUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<PwaUpdateEventDetail>;
      if (customEvent.detail?.registration && isInstalled) {
        setUpdateRegistration(customEvent.detail.registration);
        trackPwaEvent('pwa_update_available');
      }
    };

    const onControllerChange = () => {
      if (isApplyingUpdate) {
        window.location.reload();
      }
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    window.addEventListener('landsurv:pwa-update-available', onPwaUpdate);
    navigator.serviceWorker?.addEventListener('controllerchange', onControllerChange);

        const onInstallRequest = async () => {
      const installPromptEvent = installPromptEventRef.current || (window as any).deferredInstallPrompt;
      if (!installPromptEvent) {
        // If app is already installed or standalone
        if (isStandalone()) {
          alert('LandSurv.ai is already installed and running as an application.');
          return;
        }

        // Check if iOS
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        if (isIOS) {
          alert('To install LandSurv.ai on iOS: tap the Share button in Safari, then select "Add to Home Screen".');
          return;
        }

        alert('Install is not currently available from the browser. You can install LandSurv.ai from your browser menu (e.g. Chrome/Edge: click the install icon in the address bar or select "Install LandSurv.ai" from the settings menu).');
        return;
      }

      trackPwaEvent('pwa_install_clicked');
      await installPromptEvent.prompt();
      const choice = await installPromptEvent.userChoice;
      trackPwaEvent(
        choice.outcome === 'accepted' ? 'pwa_install_accepted' : 'pwa_install_dismissed',
        { platform: choice.platform || 'unknown' },
      );
      installPromptEventRef.current = null;
      (window as any).deferredInstallPrompt = null;
    };

    window.addEventListener('landsurv:request-install', onInstallRequest);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
      window.removeEventListener('landsurv:pwa-update-available', onPwaUpdate);
      window.removeEventListener('landsurv:request-install', onInstallRequest);
      navigator.serviceWorker?.removeEventListener('controllerchange', onControllerChange);
    };
  }, [isApplyingUpdate, isInstalled, suppressInstallPrompt]);

  const shouldRender = useMemo(() => {
    return isInstalled && !!updateRegistration;
  }, [updateRegistration, isInstalled]);

  const handleApplyUpdate = () => {
    if (!updateRegistration?.waiting) {
      return;
    }

    trackPwaEvent('pwa_update_apply_clicked');
    setIsApplyingUpdate(true);
    updateRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
  };

  if (!shouldRender) {
    return null;
  }

  return (
    <div className="fixed z-[90] bottom-4 right-4 w-[min(28rem,calc(100vw-2rem))] space-y-3 pointer-events-none">
      {isInstalled && updateRegistration && (
        <section className="pointer-events-auto rounded-xl border border-cyan-500/40 bg-gray-900/95 shadow-xl backdrop-blur p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-cyan-300">Update ready</h2>
              <p className="mt-1 text-xs text-gray-300">
                A newer LandSurv.ai version is available. Apply it now to refresh tools and data handling.
              </p>
            </div>
            <button
              type="button"
              className="text-xs text-gray-400 hover:text-white"
              onClick={() => setUpdateRegistration(null)}
            >
              Later
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleApplyUpdate}
              disabled={isApplyingUpdate}
              className="rounded-md bg-cyan-500 hover:bg-cyan-400 disabled:opacity-60 disabled:cursor-not-allowed text-gray-900 text-xs font-semibold px-3 py-2"
            >
              {isApplyingUpdate ? 'Updating...' : 'Update now'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
};
