
import React, { useState } from 'react';
import { XMarkIcon } from './icons';
import { useAgent } from '../types';
import { ForwardThinkingPageContent } from './ForwardThinkingPageContent.tsx';

interface AboutPageProps {
  onClose: () => void;
}

const AboutPage: React.FC<AboutPageProps> = ({ onClose }) => {
  const [showScrollIndicator, setShowScrollIndicator] = useState(true);
  const { activeAgent } = useAgent();
  const isRawAgent = activeAgent === 'RAW_CRAWLER';
  const themeColor = isRawAgent ? 'text-cyan-400' : 'text-green-400';
  const themeShadow = isRawAgent ? 'shadow-cyan-500/20' : 'shadow-green-500/20';

  return (
    <div 
      className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div 
        className={`bg-gray-800 border border-gray-700 rounded-lg shadow-2xl ${themeShadow} max-w-3xl w-full max-h-[90vh] flex flex-col animate-modal-panel-fade-in-down light-theme:bg-white light-theme:border-gray-300`}
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0 light-theme:border-gray-300">
          <h2 className={`text-2xl font-bold ${themeColor}`}>Forward Thinking</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700 transition-colors" aria-label="Close">
            <XMarkIcon className="w-6 h-6 text-gray-400" />
          </button>
        </header>

        <main className="flex-grow p-6 overflow-y-auto scrollbar-hide text-gray-300 space-y-4 light-theme:text-gray-700 relative" onScroll={() => setShowScrollIndicator(false)}>
            <ForwardThinkingPageContent />
            
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