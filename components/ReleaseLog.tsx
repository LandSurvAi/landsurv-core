import React, { useState } from 'react';
import { XMarkIcon, ClipboardDocumentListIcon } from './icons';
import { AgentType } from '../types';
import { ReleaseLogContent } from './ReleaseLogContent.tsx';

interface ReleaseLogProps {
  onClose: () => void;
  activeAgent: AgentType;
}

const ReleaseLog: React.FC<ReleaseLogProps> = ({ onClose, activeAgent }) => {
  const [showScrollIndicator, setShowScrollIndicator] = useState(true);
  const isRawAgent = activeAgent === AgentType.RAW_CRAWLER;
  const themeColor = 'text-blue-400';
  const themeShadow = 'shadow-blue-500/20';

  return (
    <div 
      className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div 
        className={`bg-gray-800 border border-gray-700 rounded-lg shadow-2xl ${themeShadow} max-w-3xl w-full max-h-[90vh] flex flex-col animate-modal-panel-fade-in-down`}
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
          <h2 className={`text-2xl font-bold ${themeColor} flex items-center gap-3`}><ClipboardDocumentListIcon className="w-7 h-7"/> Release Log</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700 transition-colors" aria-label="Close">
            <XMarkIcon className="w-6 h-6 text-gray-400" />
          </button>
        </header>

        <main className="flex-grow p-6 overflow-y-auto scrollbar-hide text-gray-300 relative" onScroll={() => setShowScrollIndicator(false)}>
          {/* FIX: Removed unused activeAgent prop to resolve prop type error. */}
          <ReleaseLogContent />
          
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

export default ReleaseLog;