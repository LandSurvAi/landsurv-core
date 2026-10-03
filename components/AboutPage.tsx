import React, { useState } from 'react';
import { XMarkIcon } from './icons';
import { AboutPageContent } from './AboutPageContent.tsx';

interface AboutPageProps {
  onClose: () => void;
  onShowTech?: () => void;
  onShowDoc?: () => void;
  onShowReleaseLog?: () => void;
}

const AboutPage: React.FC<AboutPageProps> = ({ onClose, onShowTech, onShowDoc, onShowReleaseLog }) => {
  const [showScrollIndicator, setShowScrollIndicator] = useState(true);
  return (
    <div 
      className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-gray-800 border border-cyan-500/20 rounded-2xl shadow-2xl shadow-cyan-950/30 max-w-3xl w-full max-h-[90vh] flex flex-col animate-modal-panel-fade-in-down light-theme:bg-white light-theme:border-gray-300"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-gray-700 flex-shrink-0 bg-gray-900/40 light-theme:border-gray-300 light-theme:bg-gray-50">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-400">LandSurv.ai</p>
            <h2 className="mt-0.5 text-xl font-bold text-gray-100 light-theme:text-gray-900">About the platform</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700 transition-colors light-theme:hover:bg-gray-200" aria-label="Close">
            <XMarkIcon className="w-6 h-6 text-gray-400" />
          </button>
        </header>

        <main className="flex-grow p-5 md:p-6 overflow-y-auto scrollbar-hide text-gray-300 light-theme:text-gray-700 relative" onScroll={() => setShowScrollIndicator(false)}>
            <AboutPageContent 
              onClose={onClose}
              onShowTech={onShowTech}
              onShowDoc={onShowDoc}
              onShowReleaseLog={onShowReleaseLog}
            />
            
            {/* Scroll Indicator */}
            {showScrollIndicator && (
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20 animate-bounce opacity-60 pointer-events-none">
                <svg className="w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            )}
        </main>
      </div>
    </div>
  );
};

export default AboutPage;
