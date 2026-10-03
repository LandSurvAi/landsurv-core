import React from 'react';
import { XMarkIcon } from './icons.tsx';

interface ToolsDrawerProps {
  isOpen: boolean;
  onToggle: () => void;
  title: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

export const ToolsDrawer: React.FC<ToolsDrawerProps> = ({
  isOpen,
  onToggle,
  title,
  children,
  icon
}) => {
  return (
    <>
      {/* Overlay - Slides in from bottom/side */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 animate-fade-in" onClick={onToggle} />
      )}
      
      <div
        className={`fixed bottom-0 right-0 top-0 z-50 bg-gray-800 border-l border-gray-700 light-theme:bg-gray-100 light-theme:border-gray-300 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        } w-full sm:w-96 md:w-[28rem] flex flex-col overflow-hidden`}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-700 bg-gray-900/50 light-theme:border-gray-300 light-theme:bg-white/50">
          <div className="flex items-center gap-3">
            {icon && <div className="text-violet-400">{icon}</div>}
            <h2 className="text-lg font-bold text-white light-theme:text-gray-900">{title}</h2>
          </div>
          <button
            onClick={onToggle}
            className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-gray-200 light-theme:hover:bg-gray-200 light-theme:text-gray-600 light-theme:hover:text-gray-900 transition-colors"
            title="Close Tools"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div 
          className="flex-grow overflow-y-scroll p-4 scrollbar-hide pointer-events-auto" 
          style={{ touchAction: 'auto', overscrollBehavior: 'contain' }}
          onWheel={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </>
  );
};
