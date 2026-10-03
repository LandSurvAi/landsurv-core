import { useEffect, useState } from 'react';
import { isIOS } from '../utils/platformDetection';
import { trackPwaEvent } from '../utils/pwaTelemetry';

/**
 * iOS Gesture Guide
 * 
 * Provides native iOS gesture guidance for add-to-home-screen installation:
 * - Detects first visit on iOS
 * - Shows share button location hint
 * - Provides step-by-step instructions with visual cues
 */

interface iOSGestureState {
  showGuide: boolean;
  step: 'share' | 'scroll' | 'add';
  hasScrolled: boolean;
  dismissCount: number;
}

export const iOSGestureGuide: React.FC = () => {
  const [state, setState] = useState<iOSGestureState>({
    showGuide: false,
    step: 'share',
    hasScrolled: false,
    dismissCount: 0,
  });

  useEffect(() => {
    if (!isIOS()) {
      return;
    }

    // Check if user already installed via home screen
    const isStandalone = window.navigator.standalone === true;
    if (isStandalone) {
      return;
    }

    // Show guide only on first/second visit
    const visitCount = parseInt(localStorage.getItem('landsurv_ios_visits') || '0', 10);
    const shouldShowGuide = visitCount < 2;

    if (shouldShowGuide) {
      // Delay guide to avoid appearing immediately on page load
      const showTimer = setTimeout(() => {
        setState((prev) => ({
          ...prev,
          showGuide: true,
        }));
        trackPwaEvent('pwa_ios_gesture_guide_shown', {
          visit_count: visitCount + 1,
        });
      }, 2000);

      return () => clearTimeout(showTimer);
    }
  }, []);

  const handleScroll = () => {
    if (!state.hasScrolled && state.showGuide) {
      setState((prev) => ({
        ...prev,
        hasScrolled: true,
        step: 'add',
      }));
      trackPwaEvent('pwa_ios_gesture_scroll_detected');
    }
  };

  const handleDismiss = () => {
    const newDismissCount = state.dismissCount + 1;

    if (newDismissCount >= 2) {
      // Don't show again if dismissed twice
      const visitCount = parseInt(localStorage.getItem('landsurv_ios_visits') || '0', 10);
      localStorage.setItem('landsurv_ios_visits', String(visitCount + 1));
      trackPwaEvent('pwa_ios_gesture_dismissed_final');
    }

    setState((prev) => ({
      ...prev,
      showGuide: false,
      dismissCount: newDismissCount,
    }));
  };

  const handleGotIt = () => {
    const visitCount = parseInt(localStorage.getItem('landsurv_ios_visits') || '0', 10);
    localStorage.setItem('landsurv_ios_visits', String(visitCount + 1));
    trackPwaEvent('pwa_ios_gesture_understood');
    setState((prev) => ({
      ...prev,
      showGuide: false,
    }));
  };

  useEffect(() => {
    if (state.showGuide) {
      window.addEventListener('scroll', handleScroll);
      return () => window.removeEventListener('scroll', handleScroll);
    }
  }, [state.showGuide, state.hasScrolled]);

  if (!state.showGuide) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Semi-transparent overlay */}
      <div
        className="absolute inset-0 bg-black bg-opacity-30 pointer-events-auto"
        onClick={handleDismiss}
      />

      {/* Guide card positioned at bottom */}
      <div className="absolute bottom-0 left-0 right-0 pointer-events-auto">
        <div className="mx-4 mb-4 bg-slate-900 rounded-lg shadow-2xl border border-slate-700 overflow-hidden">
          {/* Step 1: Share Button */}
          {state.step === 'share' && (
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-sky-500 text-white text-sm font-bold">
                  1
                </span>
                <h3 className="font-semibold text-white">Tap the Share button</h3>
              </div>

              <div className="bg-slate-800 rounded p-3 text-center">
                <div className="text-3xl mb-2">⬆️</div>
                <p className="text-xs text-slate-300">Look for the Share icon in Safari toolbar</p>
              </div>

              <p className="text-sm text-slate-400">
                The share button is usually in the bottom toolbar (on newer iOS) or top-right.
              </p>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleDismiss}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 py-2 px-3 rounded text-sm transition-colors"
                >
                  Maybe Later
                </button>
                <button
                  onClick={() =>
                    setState((prev) => ({
                      ...prev,
                      step: 'scroll',
                    }))
                  }
                  className="flex-1 bg-sky-600 hover:bg-sky-500 text-white py-2 px-3 rounded text-sm font-semibold transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Scroll & Add */}
          {state.step === 'scroll' && (
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-sky-500 text-white text-sm font-bold">
                  2
                </span>
                <h3 className="font-semibold text-white">Find "Add to Home Screen"</h3>
              </div>

              <div className="bg-slate-800 rounded p-3 text-center">
                <div className="text-3xl mb-2">👇</div>
                <p className="text-xs text-slate-300">Scroll down in the share menu</p>
              </div>

              <p className="text-sm text-slate-400">
                Look for "Add to Home Screen" in the list. Tap it to install.
              </p>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleDismiss}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 py-2 px-3 rounded text-sm transition-colors"
                >
                  Dismiss
                </button>
                <button
                  onClick={handleGotIt}
                  className="flex-1 bg-sky-600 hover:bg-sky-500 text-white py-2 px-3 rounded text-sm font-semibold transition-colors"
                >
                  Got It!
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Add confirmation */}
          {state.step === 'add' && (
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500 text-white text-sm font-bold">
                  ✓
                </span>
                <h3 className="font-semibold text-white">Ready to install!</h3>
              </div>

              <div className="bg-slate-800 rounded p-3 text-center">
                <div className="text-3xl mb-2">📱</div>
                <p className="text-xs text-slate-300">App will appear on your home screen</p>
              </div>

              <p className="text-sm text-slate-400">
                After adding, LandSurv.ai will work offline and load faster from your home screen.
              </p>

              <button
                onClick={handleGotIt}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2 px-3 rounded text-sm font-semibold transition-colors"
              >
                Got It!
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
