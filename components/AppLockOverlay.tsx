// AppLockOverlay.tsx
// Overlay shown when the user has not yet provided an accepted unlock key.
// AI features require either a LandSurv Enabling Key or a user-supplied Gemini key.

import React, { useState } from 'react';
import PublicConciergeChat from './PublicConciergeChat.tsx';
import DemoRequestModal from './DemoRequestModal.tsx';

interface AppLockOverlayProps {
  isLocked: boolean;
  onShowApiKeyDialog?: () => void;
  onDismiss?: () => void;
}

const AppLockOverlay: React.FC<AppLockOverlayProps> = ({ isLocked, onShowApiKeyDialog, onDismiss }) => {
  const [showDemoModal, setShowDemoModal] = useState(false);
  if (!isLocked) return null;

  return (
    <div 
      className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-sm flex items-center justify-center cursor-not-allowed overflow-y-auto py-8"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-col items-center gap-4 w-full max-w-2xl px-4 cursor-default" onClick={(e) => e.stopPropagation()}>
      <div className="text-center space-y-4 max-w-md w-full px-6 py-8 bg-gray-900/80 border border-gray-700 rounded-xl shadow-2xl">
        <h1 className="text-3xl font-extrabold tracking-tighter leading-none text-gray-100 mb-1">
          Land<span className="text-cyan-400">Surv</span><span className="text-green-400">.ai</span><sup>™</sup>
        </h1>
        <p className="text-cyan-400 text-xs font-semibold uppercase tracking-widest">
          AI-Powered Land Surveying &amp; Civil Engineering
        </p>

        <div className="border-t border-gray-700 pt-4 text-left space-y-3">
          <p className="text-gray-200 text-sm leading-relaxed">
            To keep LandSurv.ai sustainable as AI costs continue to rise, access requires either your
            <span className="text-white font-semibold"> LandSurv Enabling Key</span> or your own Google Gemini API key.
            A free Google Gemini API key from{' '}
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 underline hover:text-cyan-300"
              onClick={(e) => e.stopPropagation()}
            >
              Google AI Studio
            </a>
            {' '}takes about 60 seconds to set up and connects directly to your account.
          </p>
          <p className="text-gray-400 text-sm leading-relaxed">
            If you're a surveyor, civil engineer, or developer seriously exploring AI workflows —
            reach out. We're happy to provide a temporary Enabling Key for evaluation, and we'd love to
            hear how you're thinking about using AI in your practice.
          </p>
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <button
            onClick={onShowApiKeyDialog}
            className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-semibold py-2.5 px-6 rounded-md transition-all duration-200 shadow-lg hover:shadow-xl"
          >
            Set Up Service Access and AI Inference
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setShowDemoModal(true); }}
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-2.5 px-6 rounded-md transition-all duration-200 shadow-lg hover:shadow-xl"
          >
            💳 Buy a 24-Hour Enabling Key — $24
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDismiss?.(); }}
            className="text-gray-500 hover:text-gray-300 text-sm underline transition-colors duration-150"
            title="AI features won't work without an Enabling Key or Gemini key, but you can still explore the interface"
          >
            Browse the interface without a key →
          </button>
        </div>
      </div>

      {/* Public LSVZ Lite concierge — also available on the lock screen so visitors can ask questions before signing up */}
      <PublicConciergeChat />
      </div>
      <DemoRequestModal isOpen={showDemoModal} onClose={() => setShowDemoModal(false)} />
    </div>
  );
};

export default AppLockOverlay;
