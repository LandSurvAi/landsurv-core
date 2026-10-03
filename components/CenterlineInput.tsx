
import React, { useState, useCallback } from 'react';
import { RoadIcon, UploadIcon, HomeIcon } from './icons';
import { exampleHighwayCl } from '../assets/example.highway.cl';
import { useErrorReporter } from '../contexts/AppStateContext';


interface CenterlineInputProps {
  onSessionStart: () => void;
  onClFileUploaded: (content: string, fileName: string) => void;
  onGoBack: () => void;
  backButtonTitle?: string;
}

const CenterlineInput: React.FC<CenterlineInputProps> = ({ onSessionStart, onClFileUploaded, onGoBack, backButtonTitle = 'Go to Home Screen' }) => {
  const [isDragging, setIsDragging] = useState(false);
  const { reportError } = useErrorReporter();
  
  const handleFile = useCallback((file: File) => {
    if (file && (file.name.toLowerCase().endsWith('.cl') || file.type === 'text/plain')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        onClFileUploaded(content, file.name);
      };
      reader.readAsText(file);
    } else {
      reportError({ title: 'Invalid file', message: 'Please upload a valid .cl or text file.' });
    }
  }, [onClFileUploaded, reportError]);

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
    document.getElementById('cl-file-input')?.click();
  };


  return (
    <div className="relative flex flex-col items-center justify-center h-full p-8 text-center">
       <button onClick={onGoBack} className="absolute top-4 left-4 p-2 text-gray-300 hover:text-white transition-colors" title={backButtonTitle}>
        <HomeIcon className="w-6 h-6"/>
      </button>
        <h1 className="text-5xl sm:text-6xl font-extrabold leading-none tracking-tight text-center mb-4">
          <span className="text-white">Stationing</span><span className="text-purple-400">&CL</span><span className="text-[0.5em]"><span className="text-gray-500">.</span><span className="text-white">Land</span><span className="text-cyan-400">Surv</span><span className="text-green-400">.ai</span></span><sup className="text-xl text-gray-500">™</sup>
      </h1>
      <p className="text-gray-300 mb-6 max-w-lg">
        Create horizontal alignments by defining PIs, or upload a .cl file. Then, use the AI assistant to perform calculations.
      </p>
      
      <div
        className={`w-full max-w-lg cursor-pointer flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-lg transition-colors duration-300 ${isDragging ? 'border-purple-400 bg-gray-700/50' : 'border-gray-600 hover:border-purple-500'}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-label="Upload a .cl file by dragging or clicking"
      >
        <input
          id="cl-file-input"
          type="file"
          className="hidden"
          accept=".cl,text/plain"
          onChange={handleFileChange}
        />
        <UploadIcon className="w-16 h-16 mb-4 text-gray-500" />
        <h2 className="text-xl font-semibold text-white">Drop your .cl file here</h2>
        <p className="text-gray-400 mt-2">or click to browse local files</p>
      </div>

       <div className="mt-6 text-center text-gray-400">
          <p>
            Or,{' '}
            <button
              onClick={onSessionStart}
              className="text-purple-400 hover:text-purple-300 font-semibold underline focus:outline-none focus:ring-2 focus:ring-purple-500 rounded"
            >
              Start a new blank centerline session.
            </button>
          </p>
        </div>

        <div className="mt-4 text-center text-gray-400">
            <p>Or try a curvy highway example:</p>
            <div className="flex justify-center gap-2 sm:gap-4 mt-2">
                <button
                    onClick={() => onClFileUploaded(exampleHighwayCl, 'example.highway.cl')}
                    className="text-purple-400 hover:text-purple-300 font-semibold underline focus:outline-none focus:ring-2 focus:ring-purple-500 rounded"
                >
                    Load 1.5 Mile Highway Example
                </button>
            </div>
        </div>
    </div>
  );
};

export default CenterlineInput;