
import React, { useState, useCallback } from 'react';
import { UploadIcon, HomeIcon, LayersIcon } from './icons';
import { useErrorReporter } from '../contexts/AppStateContext';

interface CadManagerInputProps {
  onSessionStart: () => void;
  onGoBack: () => void;
  onFileUploaded?: (content: string, fileName: string) => void;
}

const CadManagerInput: React.FC<CadManagerInputProps> = ({ onSessionStart, onGoBack, onFileUploaded }) => {
  const [isDragging, setIsDragging] = useState(false);
  const { reportError } = useErrorReporter();

  const handleFile = useCallback((file: File) => {
    if (!onFileUploaded) {
      // If no upload handler, just start a new session
      onSessionStart();
      return;
    }
    
    const fileName = file.name.toLowerCase();
    // Accept layer files (.lay), description key files (.dsc), linetype files (.lin), or JSON config files
    if (fileName.endsWith('.lay') || fileName.endsWith('.dsc') || fileName.endsWith('.lin') || fileName.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        onFileUploaded(content, file.name);
      };
      reader.readAsText(file);
    } else {
      reportError({ title: 'Invalid file', message: 'Please upload a CAD standards file (.lay, .dsc, .lin, or .json)' });
    }
  }, [onFileUploaded, onSessionStart, reportError]);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }, []);
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); }, []);
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  }, [handleFile]);
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files && e.target.files.length > 0) { handleFile(e.target.files[0]); } };
  const handleClick = () => { document.getElementById('cad-manager-file-input')?.click(); };

  return (
    <div className="relative flex flex-col items-center justify-center h-full p-8 text-center">
       <button onClick={onGoBack} className="absolute top-4 left-4 p-2 text-gray-300 hover:text-white transition-colors" title="Go to Home Screen">
        <HomeIcon className="w-6 h-6"/>
      </button>
        <h1 className="text-5xl sm:text-6xl font-extrabold leading-none tracking-tight text-center mb-4">
          <span className="text-white">Cad</span><span className="text-indigo-400">Manager</span><span className="text-[0.5em]"><span className="text-gray-500">.</span><span className="text-white">Land</span><span className="text-cyan-400">Surv</span><span className="text-green-400">.ai</span></span><sup className="text-xl text-gray-500">™</sup>
      </h1>
      <div className="w-full max-w-2xl flex flex-col items-center">
        <p className="text-gray-400 mt-2 mb-6 max-w-lg">
          Upload a CAD standards file (.lay, .dsc, .lin) or start a new session to create layers, description keys, and linetypes.
        </p>

        {/* Upload Drop Zone */}
        <div
          className={`w-full max-w-lg cursor-pointer flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg transition-colors duration-300 mb-6 ${isDragging ? 'border-indigo-400 bg-gray-700/50' : 'border-gray-600 hover:border-indigo-500'}`}
          onDragEnter={handleDragEnter} 
          onDragLeave={handleDragLeave} 
          onDragOver={handleDragOver} 
          onDrop={handleDrop} 
          onClick={handleClick}
          role="button" 
          tabIndex={0} 
          aria-label="Upload a CAD standards file"
        >
          <input id="cad-manager-file-input" type="file" className="hidden" accept=".lay,.dsc,.lin,.json" onChange={handleFileChange} />
          <UploadIcon className="w-12 h-12 mb-3 text-gray-500" />
          <h2 className="text-lg font-semibold text-white">Drop standards file here</h2>
          <p className="text-gray-400 mt-1 text-sm">.lay, .dsc, .lin, or .json config</p>
        </div>

        <div className="flex items-center gap-4 w-full max-w-lg mb-6">
          <div className="flex-1 h-px bg-gray-700"></div>
          <span className="text-gray-500 text-sm">or</span>
          <div className="flex-1 h-px bg-gray-700"></div>
        </div>

        <button
          onClick={onSessionStart}
          className="px-8 py-3 text-lg font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:bg-gray-600 transition-colors duration-200 flex items-center gap-2"
        >
          <LayersIcon className="w-5 h-5" />
          Start New Standards Session
        </button>
      </div>
    </div>
  );
};

export default CadManagerInput;
