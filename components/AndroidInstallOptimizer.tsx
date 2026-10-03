import { useEffect, useState } from 'react';
import { isAndroid, getPlatformInfo } from '../utils/platformDetection';
import { trackPwaEvent } from '../utils/pwaTelemetry';

/**
 * Android Install Optimizer
 * 
 * Improves Android install experience by:
 * - Timing install prompts for optimal engagement
 * - Providing gesture guidance for Chrome's install banner
 * - Enabling deep linking to workflows post-install
 */

interface AndroidInstallState {
  showBanner: boolean;
  showGestureHint: boolean;
  installTiming: 'immediate' | 'deferred' | 'hidden';
}

export const AndroidInstallOptimizer: React.FC = () => {
  const [state, setState] = useState<AndroidInstallState>({
    showBanner: false,
    showGestureHint: false,
    installTiming: 'hidden',
  });

  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);

  useEffect(() => {
    if (!isAndroid()) {
      return;
    }

    const platformInfo = getPlatformInfo();

    // Android Chrome shows automatic install banner after engagement
    // We track when it's likely to appear and prepare UI
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);

      // Determine install timing strategy
      const isFirstVisit = !localStorage.getItem('landsurv_install_dismissed');
      const engagement = sessionStorage.getItem('landsurv_engagement_time');
      const engagementMs = engagement ? parseInt(engagement, 10) : 0;

      let timing: 'immediate' | 'deferred' | 'hidden' = 'hidden';

      if (isFirstVisit && engagementMs > 15000) {
        // First visit + 15s engagement: show immediately
        timing = 'immediate';
        setState((prev) => ({
          ...prev,
          showBanner: true,
          installTiming: timing,
        }));
        trackPwaEvent('pwa_android_install_immediate');
      } else if (engagementMs > 60000) {
        // 1+ minute: show deferred (less intrusive)
        timing = 'deferred';
        trackPwaEvent('pwa_android_install_deferred');
      } else {
        // Hide until user engages more
        timing = 'hidden';
      }

      // Show gesture hint for manual install (3-dot menu)
      if (!platformInfo.isInstalled) {
        setState((prev) => ({
          ...prev,
          showGestureHint: timing === 'hidden',
        }));
      }
    };

    const handleAppInstalled = () => {
      setState((prev) => ({
        ...prev,
        showBanner: false,
        showGestureHint: false,
      }));
      localStorage.setItem('landsurv_install_completed', 'true');
      trackPwaEvent('pwa_android_install_completed');
    };

    // Track user engagement time for install timing
    let engagementTimer: NodeJS.Timeout;
    const startEngagementTimer = () => {
      const startTime = Date.now();
      engagementTimer = setTimeout(() => {
        sessionStorage.setItem('landsurv_engagement_time', String(Date.now() - startTime));
      }, 15000);
    };

    const handleUserInteraction = () => {
      if (!sessionStorage.getItem('landsurv_engagement_time')) {
        startEngagementTimer();
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    document.addEventListener('click', handleUserInteraction);
    document.addEventListener('input', handleUserInteraction);

    startEngagementTimer();

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('input', handleUserInteraction);
      clearTimeout(engagementTimer);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    (deferredPrompt as any).prompt();
    const { outcome } = await (deferredPrompt as any).userChoice;

    if (outcome === 'accepted') {
      trackPwaEvent('pwa_android_install_accepted_optimized');
    } else {
      trackPwaEvent('pwa_android_install_dismissed_optimized');
      localStorage.setItem('landsurv_install_dismissed', 'true');
    }

    setState((prev) => ({
      ...prev,
      showBanner: false,
      showGestureHint: true,
    }));
  };

  const handleDismiss = () => {
    setState((prev) => ({
      ...prev,
      showBanner: false,
    }));
    localStorage.setItem('landsurv_install_dismissed', 'true');
    trackPwaEvent('pwa_android_install_dismissed_optimized');
  };

  // Render install banner only on immediate timing
  if (state.showBanner && state.installTiming === 'immediate') {
    return (
      <div className="fixed bottom-4 left-4 right-4 max-w-sm bg-gradient-to-r from-emerald-600 to-emerald-500 rounded-lg shadow-lg p-4 z-50 animate-fade-in">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <h3 className="font-semibold text-white mb-1">Add LandSurv to Home Screen</h3>
            <p className="text-sm text-emerald-50">Quick access to surveying workflows</p>
          </div>
          <button
            onClick={handleDismiss}
            className="text-white hover:text-emerald-100 transition-colors"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleInstallClick}
            className="flex-1 bg-white text-emerald-600 font-semibold py-2 px-3 rounded transition-all hover:shadow-md"
          >
            Install
          </button>
          <button
            onClick={handleDismiss}
            className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2 px-3 rounded transition-colors"
          >
            Not Now
          </button>
        </div>
      </div>
    );
  }

  // Render gesture hint for manual install via menu
  if (state.showGestureHint) {
    return (
      <div className="fixed top-4 right-4 max-w-xs bg-slate-800 border border-slate-700 rounded-lg shadow-lg p-3 z-50 animate-fade-in">
        <div className="flex items-start gap-2">
          <div className="text-sky-400 text-xl leading-none">ℹ️</div>
          <div className="flex-1">
            <h4 className="font-semibold text-white text-sm mb-1">Install App</h4>
            <p className="text-xs text-slate-300 mb-2">
              Tap the menu (⋮) → "Install app" for offline access
            </p>
            <button
              onClick={() =>
                setState((prev) => ({
                  ...prev,
                  showGestureHint: false,
                }))
              }
              className="text-xs text-sky-400 hover:text-sky-300 font-semibold"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
