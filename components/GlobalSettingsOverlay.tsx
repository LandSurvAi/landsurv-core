/**
 * GlobalSettingsOverlay
 *
 * Renders two world-wide UI affordances driven by the server-side
 * `global_settings` table (see utils/globalSettings.ts):
 *
 *   1. An announcement banner pinned to the very top of the viewport.
 *   2. A full-screen maintenance overlay that blocks the app when the
 *      admin flips the kill switch.
 *
 * Mount this once at the React root (index.tsx) so it's outside any
 * page-specific layout and visible on every route, including landing pages
 * and the DevOps console itself (so the admin can see the live state).
 */

import React, { useEffect, useState } from 'react';
import {
  getGlobalSettings,
  subscribeGlobalSettings,
  type GlobalSettings,
} from '../utils/globalSettings';

export const GlobalSettingsOverlay: React.FC = () => {
  const [settings, setSettings] = useState<GlobalSettings>(() => getGlobalSettings());
  const [bannerDismissed, setBannerDismissed] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem('landsurv-banner-dismissed') || null;
  });

  useEffect(() => {
    return subscribeGlobalSettings((env) => setSettings(env.settings));
  }, []);

  const banner = settings.announcementBanner;
  const showBanner =
    typeof banner === 'string' && banner.trim().length > 0 && banner !== bannerDismissed;

  return (
    <>
      {showBanner && (
        <div
          role="status"
          className="fixed top-0 inset-x-0 z-[9999] bg-amber-600/95 text-white px-4 py-2 shadow-lg flex items-center justify-center gap-3 text-sm"
          style={{ backdropFilter: 'blur(4px)' }}
        >
          <span className="text-base">📣</span>
          <span className="flex-1 text-center font-medium">{banner}</span>
          <button
            onClick={() => {
              if (banner) {
                sessionStorage.setItem('landsurv-banner-dismissed', banner);
                setBannerDismissed(banner);
              }
            }}
            className="ml-2 px-2 py-0.5 rounded hover:bg-amber-700 text-xs"
            aria-label="Dismiss announcement"
          >
            ✕
          </button>
        </div>
      )}

      {settings.maintenanceMode && (
        <div
          role="alertdialog"
          className="fixed inset-0 z-[10000] bg-slate-950/95 flex items-center justify-center p-6"
          style={{ backdropFilter: 'blur(8px)' }}
        >
          <div className="max-w-lg w-full bg-slate-900 border border-amber-700 rounded-2xl p-8 text-center shadow-2xl">
            <div className="text-5xl mb-4">🔧</div>
            <h2 className="text-2xl font-bold text-white mb-2">LandSurv.ai is under maintenance</h2>
            <p className="text-slate-300 mb-4">
              We&apos;re briefly offline while the team ships an update. Hang tight — this page
              will reconnect automatically.
            </p>
            {banner && (
              <p className="text-amber-300 text-sm mt-4 border-t border-slate-800 pt-4">{banner}</p>
            )}
            <p className="text-xs text-slate-500 mt-6">
              If you need access immediately, contact{' '}
              <a href="mailto:msersen@gmail.com" className="text-amber-400 underline">
                support
              </a>
              .
            </p>
          </div>
        </div>
      )}
    </>
  );
};
