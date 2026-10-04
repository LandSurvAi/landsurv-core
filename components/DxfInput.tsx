
import React, { useState, useCallback } from 'react';
import { DxfIcon, UploadIcon, HomeIcon } from './icons';
import { useErrorReporter } from '../contexts/AppStateContext';

interface DxfUploadOptions {
  smoothSplines?: boolean;
  quantizationBits?: 16 | 32;
}

interface DxfInputProps {
  onDxfUploaded: (content: string, fileName: string, options?: DxfUploadOptions) => void;
  onGoBack: () => void;
  backButtonTitle?: string;
}

const DxfInput: React.FC<DxfInputProps> = ({ onDxfUploaded, onGoBack, backButtonTitle = 'Go to Home Screen' }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [smoothSplines, setSmoothSplines] = useState(false);
  const [quantizationBits, setQuantizationBits] = useState<16 | 32>(16);
  const { reportError } = useErrorReporter();

  const handleFile = useCallback((file: File) => {
    if (file && (file.name.toLowerCase().endsWith('.dxf') || file.type === 'application/dxf' || file.type === 'image/vnd.dxf' || file.type === 'text/plain')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        onDxfUploaded(content, file.name, { smoothSplines, quantizationBits });
      };
      reader.readAsText(file);
    } else {
      reportError({ title: 'Invalid file', message: 'Please upload a valid .dxf file.' });
    }
  }, [onDxfUploaded, reportError, smoothSplines, quantizationBits]);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  }, [handleFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  const handleClick = () => {
    document.getElementById('dxf-file-input')?.click();
  };

  return (
    <div className="relative flex flex-col items-center justify-center h-full p-8 text-center">
       <button onClick={onGoBack} className="absolute top-4 left-4 p-2 text-gray-300 hover:text-white transition-colors" title={backButtonTitle}>
        <HomeIcon className="w-6 h-6"/>
      </button>
      <h1 className="text-5xl sm:text-6xl font-extrabold leading-none tracking-tight text-center mb-4">
          <span className="text-white">Dxf</span><span className="text-indigo-400">Agent</span><span className="text-[0.5em]"><span className="text-gray-500">.</span><span className="text-white">Land</span><span className="text-cyan-400">Surv</span><span className="text-green-400">.ai</span></span><sup className="text-xl text-gray-500">™</sup>
      </h1>
      <p className="text-gray-300 mb-6 max-w-lg">
        Upload a .dxf file to draw it immediately on the canvas and analyze layers, entities, and CAD geometry with the AI agent.
      </p>
      <div
        className={`w-full max-w-lg cursor-pointer flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-lg transition-colors duration-300 ${isDragging ? 'border-indigo-400 bg-gray-700/50' : 'border-gray-600 hover:border-indigo-500'}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-label="Upload a file by dragging or clicking"
      >
        <input
          id="dxf-file-input"
          type="file"
          className="hidden"
          accept=".dxf,application/dxf,image/vnd.dxf,text/plain"
          onChange={handleFileChange}
        />
        <DxfIcon className="w-16 h-16 mb-4 text-gray-500" />
        <h2 className="text-xl font-semibold text-white">Drop your .dxf file here</h2>
        <p className="text-gray-400 mt-2">or click to browse local files</p>
      </div>

      <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
        <label className="flex items-center gap-2.5 text-xs sm:text-sm text-gray-300 bg-gray-900/60 border border-gray-700 hover:border-indigo-400/60 rounded-lg px-3.5 py-2 cursor-pointer transition-colors select-none">
          <input
            type="checkbox"
            checked={smoothSplines}
            onChange={(e) => setSmoothSplines(e.target.checked)}
            className="w-4 h-4 rounded border-gray-600 text-indigo-500 focus:ring-indigo-400 focus:ring-offset-gray-900 bg-gray-800"
          />
          <span className="font-medium text-gray-200">Convert long segment strings to weighted T-splines</span>
          <span className="text-[11px] text-indigo-300 bg-indigo-950/60 border border-indigo-500/40 rounded px-1.5 py-0.5">Smooth</span>
        </label>

        {smoothSplines && (
          <div className="flex items-center gap-1.5 text-xs bg-gray-900/80 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-300">
            <span className="text-gray-400 font-medium">Quantization:</span>
            <button
              type="button"
              onClick={() => setQuantizationBits(16)}
              className={`px-2 py-0.5 rounded font-mono font-semibold transition-colors ${
                quantizationBits === 16 ? 'bg-indigo-600 text-white shadow-sm' : 'hover:bg-gray-700 text-gray-400'
              }`}
              title="16-bit fixed point bounding-box grid (65,535 steps) with smart curvature decimation"
            >
              16-bit
            </button>
            <button
              type="button"
              onClick={() => setQuantizationBits(32)}
              className={`px-2 py-0.5 rounded font-mono font-semibold transition-colors ${
                quantizationBits === 32 ? 'bg-indigo-600 text-white shadow-sm' : 'hover:bg-gray-700 text-gray-400'
              }`}
              title="32-bit high-precision grid (4.29B steps) with smart curvature decimation"
            >
              32-bit
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DxfInput;