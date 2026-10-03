import { useEffect } from 'react';
import { isWindows, isMacOS, isLinux, getPlatformInfo } from '../utils/platformDetection';
import { trackPwaEvent } from '../utils/pwaTelemetry';

/**
 * Desktop Launcher Component
 * 
 * Provides desktop-specific features:
 * - Taskbar pinning guidance
 * - Keyboard shortcuts
 * - File associations (for future CSV/DXF drag-and-drop)
 */

export const DesktopLauncher: React.FC = () => {
  useEffect(() => {
    const isDesktop = isWindows() || isMacOS() || isLinux();
    if (!isDesktop) return;

    const platformInfo = getPlatformInfo();

    // Desktop users likely want keyboard shortcuts
    const handleKeyboardShortcuts = (e: KeyboardEvent) => {
      // Ctrl/Cmd+1: Open Raw Crawler
      if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault();
        window.location.href = '/?agent=raw';
        trackPwaEvent('pwa_desktop_shortcut_used', { shortcut: 'raw' });
      }

      // Ctrl/Cmd+2: Open Boundary Agent
      if ((e.ctrlKey || e.metaKey) && e.key === '2') {
        e.preventDefault();
        window.location.href = '/?agent=deed';
        trackPwaEvent('pwa_desktop_shortcut_used', { shortcut: 'deed' });
      }

      // Ctrl/Cmd+3: Open Civil Plans
      if ((e.ctrlKey || e.metaKey) && e.key === '3') {
        e.preventDefault();
        window.location.href = '/?agent=plans';
        trackPwaEvent('pwa_desktop_shortcut_used', { shortcut: 'plans' });
      }

      // Ctrl/Cmd+Shift+K: Toggle offline mode (future feature)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'K') {
        e.preventDefault();
        const event = new CustomEvent('landsurv:toggle-offline-mode');
        window.dispatchEvent(event);
        trackPwaEvent('pwa_desktop_shortcut_used', { shortcut: 'toggle_offline' });
      }
    };

    window.addEventListener('keydown', handleKeyboardShortcuts);

    // Log desktop platform info for analytics
    trackPwaEvent('pwa_desktop_launch', {
      platform: platformInfo.platform,
      is_installed: platformInfo.isInstalled,
    });

    return () => {
      window.removeEventListener('keydown', handleKeyboardShortcuts);
    };
  }, []);

  return null;
};

/**
 * Show desktop keyboard shortcuts help.
 */
export const showDesktopShortcutsHelp = (): void => {
  const isDesktop = isWindows() || isMacOS() || isLinux();
  if (!isDesktop) return;

  const shortcutKey = navigator.platform.toUpperCase().includes('MAC') ? '⌘' : 'Ctrl';

  const helpText = `
Keyboard Shortcuts:
${shortcutKey}+1  — Open Raw Crawler
${shortcutKey}+2  — Open Boundary Agent
${shortcutKey}+3  — Open Civil Plans
${shortcutKey}+Shift+K  — Toggle Offline Mode

For best experience, pin LandSurv.ai to your taskbar!
  `;

  console.log(helpText);
};
