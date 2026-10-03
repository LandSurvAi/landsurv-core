import { useEffect } from 'react';
import {
  detectPlatform,
  detectBrowser,
  Platform,
  onDisplayModeChange,
  getPlatformInfo,
  isAndroid,
  isIOS,
} from '../utils/platformDetection';
import { parseDeepLink, handleDeepLinkNavigation } from '../services/deepLinking';
import { trackPwaEvent } from '../utils/pwaTelemetry';

/**
 * usePwaIntegration Hook
 *
 * Unified integration point for all Phase 5 platform-specific features:
 * - Platform detection and logging
 * - Deep link parsing and handling
 * - Display mode monitoring (installation detection)
 * - Platform-specific UI initialization
 *
 * Should be called once in App.tsx useEffect
 */

interface UsePwaIntegrationOptions {
  onNavigate?: (path: string) => void;
  onPlatformDetected?: (platformInfo: any) => void;
  onInstallationDetected?: (isInstalled: boolean) => void;
}

export const usePwaIntegration = (options: UsePwaIntegrationOptions = {}): void => {
  useEffect(() => {
    // 1. Detect platform and log for analytics
    const platformInfo = getPlatformInfo();
    console.log('[PWA] Platform detected:', platformInfo);

    trackPwaEvent('pwa_platform_detected', {
      platform: platformInfo.platform,
      browser: platformInfo.browser,
      is_mobile: platformInfo.isMobile,
      is_tablet: platformInfo.isTablet,
      supports_install: platformInfo.supportsWebInstallPrompt,
    });

    options.onPlatformDetected?.(platformInfo);

    // 2. Handle deep links (shortcuts, queries)
    const deepLinkParams = parseDeepLink();
    if (deepLinkParams.agent || deepLinkParams.session) {
      const navigate = options.onNavigate || ((path: string) => {
        window.location.pathname = path;
      });
      handleDeepLinkNavigation(deepLinkParams, navigate);
    }

    // 3. Monitor installation status changes
    const unsubscribeDisplayMode = onDisplayModeChange((mode) => {
      const isInstalled = mode === 'standalone' || mode === 'fullscreen';
      console.log('[PWA] Installation status changed:', { mode, isInstalled });

      if (isInstalled) {
        trackPwaEvent('pwa_app_installed_detected');
        localStorage.setItem('landsurv_is_pwa_installed', 'true');
      } else {
        localStorage.removeItem('landsurv_is_pwa_installed');
      }

      options.onInstallationDetected?.(isInstalled);
    });

    // 4. Log initial installation status
    if (platformInfo.isInstalled) {
      trackPwaEvent('pwa_session_from_installed_app');
      localStorage.setItem('landsurv_is_pwa_installed', 'true');
    }

    return () => {
      unsubscribeDisplayMode();
    };
  }, []);
};

/**
 * Track when app switches between installed and browser modes.
 * Useful for analytics on user engagement.
 */
export const usePwaInstallationTracking = (): void => {
  useEffect(() => {
    const wasInstalledBefore = localStorage.getItem('landsurv_was_pwa_installed') === 'true';
    const isInstalledNow = localStorage.getItem('landsurv_is_pwa_installed') === 'true';

    if (isInstalledNow && !wasInstalledBefore) {
      // Just installed
      trackPwaEvent('pwa_install_completed_tracking', {
        platform: detectPlatform(),
        browser: detectBrowser(),
      });
      localStorage.setItem('landsurv_was_pwa_installed', 'true');
    } else if (!isInstalledNow && wasInstalledBefore) {
      // Uninstalled (running in browser now)
      trackPwaEvent('pwa_uninstall_detected');
      localStorage.removeItem('landsurv_was_pwa_installed');
    }
  }, []);
};

/**
 * Log session start with platform context.
 * Call once per session in App initialization.
 */
export const logPwaSessionStart = (): void => {
  const platformInfo = getPlatformInfo();
  const referrer = document.referrer || 'direct';
  const source = referrer.includes('landsurv.ai') ? 'installed_app' : 'external';

  trackPwaEvent('pwa_session_started', {
    platform: platformInfo.platform,
    browser: platformInfo.browser,
    is_installed: platformInfo.isInstalled,
    source: source,
    user_agent: navigator.userAgent,
  });

  console.log('[PWA] Session started:', {
    platform: platformInfo.platform,
    isInstalled: platformInfo.isInstalled,
  });
};
