

import React, { useState, useCallback } from 'react';
import { UploadIcon, HomeIcon } from './icons.tsx';
import { exampleFileContent, exampleFileName } from '../assets/example.raw.ts';
import { useErrorReporter } from '../contexts/AppStateContext';

interface FileUploadProps {
  onFileUploaded: (content: string, fileName:string) => void;
  onGoBack: () => void;
  backButtonTitle?: string;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileUploaded, onGoBack, backButtonTitle = 'Go to Home Screen' }) => {
  const [isDragging, setIsDragging] = useState(false);
  const { reportError } = useErrorReporter();

  const handleFile = useCallback((file: File) => {
    if (file && (file.name.toLowerCase().endsWith('.raw') || file.type === 'text/plain')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        onFileUploaded(content, file.name);
      };
      reader.readAsText(file);
    } else {
      reportError({ title: 'Invalid file', message: 'Please upload a valid .RAW or text file.' });
    }
  }, [onFileUploaded, reportError]);

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
    document.getElementById('file-input')?.click();
  };

  const handleLoadExample = useCallback(() => {
    onFileUploaded(exampleFileContent, exampleFileName);
  }, [onFileUploaded]);

  return (
    <div className="relative flex flex-col items-center justify-center h-full p-8 text-center">
      <button onClick={onGoBack} className="absolute top-4 left-4 p-2 text-gray-300 hover:text-white transition-colors" title={backButtonTitle}>
        <HomeIcon className="w-6 h-6"/>
      </button>
      <h1 className="text-5xl sm:text-6xl font-extrabold leading-none tracking-tight text-center mb-4">
          <span className="text-white">Raw</span><span className="text-cyan-400">Crawler</span><span className="text-[0.5em]"><span className="text-gray-500">.</span><span className="text-white">Land</span><span className="text-cyan-400">Surv</span><span className="text-green-400">.ai</span></span><sup className="text-xl text-gray-500">™</sup>
      </h1>
      <p className="text-gray-300 mb-6 max-w-lg">
        Upload a land surveyor's .RAW file and use natural language to analyze and visualize its contents.
      </p>
      <div
        className={`w-full max-w-lg cursor-pointer flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-lg transition-colors duration-300 ${isDragging ? 'border-cyan-400 bg-gray-700/50' : 'border-gray-600 hover:border-cyan-500'}`}
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
          id="file-input"
          type="file"
          className="hidden"
          accept=".raw,text/plain"
          onChange={handleFileChange}
        />
        <UploadIcon className="w-16 h-16 mb-4 text-gray-500" />
        <h2 className="text-xl font-semibold text-white">Drop your .RAW file here</h2>
        <p className="text-gray-400 mt-2">or click to browse local files</p>
      </div>
      <div className="mt-6 text-center text-gray-400">
        <p>
          Not sure where to start?{' '}
          <button
            onClick={handleLoadExample}
            className="text-cyan-400 hover:text-cyan-300 font-semibold underline focus:outline-none focus:ring-2 focus:ring-cyan-500 rounded"
          >
            Try our example file.
          </button>
        </p>
      </div>
    </div>
  );
};

export default FileUpload;