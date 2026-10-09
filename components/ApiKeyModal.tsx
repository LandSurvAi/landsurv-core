// ApiKeyModal.tsx
// Modal component that prompts users to enter their Enabling Key or Gemini key after trial

import React, { useState, useEffect } from 'react';
import { XMarkIcon } from './icons';
import { getShortRefreshInstruction } from '../utils/browserDetection';
import { useAppState } from '../contexts/AppStateContext.tsx';

interface ApiKeyModalProps {
  isOpen: boolean;
  onSubmit: (apiKey: string) => boolean | Promise<boolean>;
  onClose?: () => void;
  remainingTime?: number;
  timeUntilAvailable?: number; // Time until app is available again during locked period (in seconds)
  countdownLabel?: string; // e.g., "until your trial reactivates"
  isLocked?: boolean; // Whether app is currently locked (paused)
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onSubmit, onClose, remainingTime, timeUntilAvailable = 0, countdownLabel = 'until your trial reactivates', isLocked = false }) => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const { addNotification } = useAppState();

  // Determine which countdown to display based on whether app is locked or not
  // If locked: show time until reactivation (timeUntilAvailable)
  // If not locked: show time until pause (remainingTime)
  const countdownSeconds = isLocked ? timeUntilAvailable : remainingTime || 0;

  // Calculate display time from the current countdown seconds (reactive, no interval needed)
  const displayTime = {
    hours: Math.floor(countdownSeconds / 3600),
    minutes: Math.floor((countdownSeconds % 3600) / 60),
    seconds: countdownSeconds % 60
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!apiKey.trim()) {
      addNotification({ kind: 'api-key', severity: 'error', title: 'Key', message: 'Please enter your Enabling Key or Google Gemini API key.' });
      return;
    }

    const success = await onSubmit(apiKey);
    
    if (!success) {
      addNotification({ kind: 'api-key', severity: 'error', title: 'Key', message: 'Invalid key. Check your Enabling Key or Google Gemini API key and try again.' });
    } else {
      setApiKey('');
    }
  };

  const handleClose = () => {
    if (onClose) onClose();
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  const refreshInstruction = getShortRefreshInstruction();

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-800 rounded-lg shadow-2xl max-w-md w-full mx-4 border border-gray-700">
        {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-cyan-600 p-6 rounded-t-lg relative">
          <h2 className={`text-2xl font-bold ${isLocked ? 'pulse-green' : 'pulse-red'}`}>
            {isLocked ? '⏸️ Trial Period Paused' : '⏱️ Trial Period Ending Soon'}
          </h2>
          {countdownSeconds > 0 ? (
            <>
              <p className={`mt-2 ${isLocked ? 'pulse-green' : 'pulse-red'}`}>
                {isLocked ? 'Counting down until your trial reactivates:' : 'Counting down until your trial pauses:'}
              </p>
              <div className={`text-3xl font-bold font-mono mt-2 ${isLocked ? 'pulse-green' : 'pulse-red'}`}>
                {String(displayTime.hours).padStart(2, '0')}:{String(displayTime.minutes).padStart(2, '0')}:{String(displayTime.seconds).padStart(2, '0')}
                {!isLocked && <span className="text-sm text-gray-300 ml-4 align-super">Click × to return to app</span>}
              </div>
            </>
          ) : (
            <p className="text-blue-100 mt-2">
              {isLocked ? 'Your trial is paused' : 'Your trial session has ended'}
            </p>
          )}
        </div>

        {/* Close X button */}
        <button
          aria-label="Close"
          onClick={handleClose}
          className="absolute right-4 top-4 text-white/90 hover:text-white"
        >
          ✕
        </button>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-4">
            <p className="text-gray-200 text-sm leading-relaxed">
              LandSurv.ai offers <strong>4-hour free trial sessions</strong> to explore the platform. Your current session has ended.
              To continue using all features immediately, please enter your <strong>LandSurv Enabling Key</strong> or your <strong>Google Gemini API key</strong>, or wait for your next session to become available.
            </p>
          </div>

          <div className="bg-gray-700/50 rounded-lg p-4 space-y-2">
            <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
              🔑 Accepted Keys:
            </h3>
            <div className="text-xs text-gray-400 space-y-2">
              <p>Option 1: Enter your LandSurv Enabling Key if one was issued to you.</p>
              <div>
                <p>Option 2: Use your own Google Gemini API key:</p>
                <ol className="space-y-1 ml-4 list-decimal mt-1">
                  <li>Visit <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">Google AI Studio</a></li>
                  <li>Sign in with your Google account</li>
                  <li>Click "Get API Key" or "Create API Key"</li>
                  <li>Copy your Google key and paste it below</li>
                </ol>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="apiKey" className="block text-sm font-medium text-gray-300 mb-2">
                Enter Your Enabling Key or Gemini API Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  id="apiKey"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="lsa_... or AIza..."
                  className="w-full bg-gray-700 border border-gray-600 rounded-md p-3 pr-20 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                >
                  {showKey ? '🙈 Hide' : '👁️ Show'}
                </button>
              </div>
              <p className="text-xs text-gray-400">Tip: LandSurv Enabling Keys usually start with <span className="font-mono">lsa_</span>. Google Gemini API keys usually start with <span className="font-mono">AIza</span>.</p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleClose}
                className={`flex-1 bg-gray-700 border border-gray-600 text-white font-semibold py-3 px-4 rounded-md transition-colors ${
                  remainingTime !== undefined && remainingTime <= 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-600'
                }`}
                disabled={remainingTime !== undefined && remainingTime <= 0}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-semibold py-3 px-4 rounded-md transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                Unlock Full Access
              </button>
            </div>
          </form>

          <div className="pt-4 border-t border-gray-700">
            <p className="text-xs text-red-300 text-center animate-pulse font-semibold">
              ⚠️ WARNING — Keys are stored locally in your browser. If you use your own Google Gemini API key, you will be billed by Google for usage on that key.
            </p>
            <p className="mt-2 text-center text-xs text-gray-300">
              Tip: {refreshInstruction} if you are having problems. Open Help → Error Console for technical details.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiKeyModal;
