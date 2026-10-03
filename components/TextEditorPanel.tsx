
import React from 'react';
import { type SessionFile, type PointList } from '../types';
import { DownloadIcon } from './icons';

interface TextEditorPanelProps {
  files: (SessionFile | null)[];
  generatedFiles: SessionFile[];
  pointLists: PointList[];
  activeFile: string | null;
  onFileSelect: (fileName: string) => void;
  content: string;
  onContentChange: (newContent: string) => void;
  onSaveChanges: () => void;
  hasUnsavedChanges: boolean;
}

const TextEditorPanel: React.FC<TextEditorPanelProps> = ({
  files,
  generatedFiles,
  pointLists,
  activeFile,
  onFileSelect,
  content,
  onContentChange,
  onSaveChanges,
  hasUnsavedChanges,
}) => {
  const fileOptions = [...files.filter((f): f is SessionFile => f !== null), ...generatedFiles];
  const pointListOptions = pointLists.map(list => ({ name: list.name, content: '' })); // dummy content

  // Create a combined list and then de-duplicate by name, giving precedence to actual files.
  const allOptions = [...fileOptions, ...pointListOptions];
  const uniqueOptions = Array.from(new Map(allOptions.map(item => [item.name, item])).values());

  return (
    <div className="w-full h-full bg-gray-900 flex flex-col rounded-md overflow-hidden light-theme:bg-white">
      <header className="flex-shrink-0 p-3 bg-gray-800/40 backdrop-blur border-b border-gray-700/30 flex items-center justify-between light-theme:bg-gray-50/40 light-theme:border-gray-300/30">
        <div className="flex items-center gap-3">
            <h3 className="text-xl font-semibold text-gray-300 light-theme:text-gray-700">Text Editor</h3>
            <select
                value={activeFile || ''}
                onChange={(e) => onFileSelect(e.target.value)}
                className="bg-gray-700 text-sm p-2 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 text-white light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900"
            >
                <option value="" disabled>Select a file or point list to edit...</option>
                {uniqueOptions.map(f => (
                    <option key={f.name} value={f.name}>{f.name}</option>
                ))}
            </select>
        </div>
        <button 
            onClick={onSaveChanges}
            disabled={!hasUnsavedChanges}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
        >
            <DownloadIcon className="w-4 h-4" />
            Save Changes
        </button>
      </header>
      <div className="flex-grow overflow-auto p-1">
        {activeFile ? (
            <textarea
                value={content}
                onChange={(e) => onContentChange(e.target.value)}
                className="w-full h-full bg-gray-900 text-gray-200 text-sm font-mono p-4 rounded-md resize-none focus:outline-none border-none light-theme:bg-gray-100 light-theme:text-gray-900"
                placeholder={`Content of ${activeFile}...`}
            />
        ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
                <p>Select a file from the dropdown above or from the File Manager to begin editing.</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default TextEditorPanel;
