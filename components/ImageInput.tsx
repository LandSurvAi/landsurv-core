import React, { useState, useCallback } from 'react';
import { CameraIcon, UploadIcon, HomeIcon } from './icons';
import { type SessionFile } from '../types';
import { useAppState } from '../contexts/AppStateContext.tsx';

interface ImageInputProps {
  onImagesSubmitted: (files: SessionFile[]) => void;
  onGoBack: () => void;
  backButtonTitle?: string;
}

const ImageInput: React.FC<ImageInputProps> = ({ onImagesSubmitted, onGoBack, backButtonTitle = 'Go to Home Screen' }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const { addNotification } = useAppState();

  const notifyError = useCallback((message: string) => {
    addNotification({ kind: 'image-input', severity: 'error', title: 'Image Analyzer', message });
  }, [addNotification]);

  const handleFiles = useCallback((selectedFiles: FileList | null) => {
    if (selectedFiles) {
      const imageFiles = Array.from(selectedFiles).filter(file => file.type.startsWith('image/'));
      if (imageFiles.length > 0) {
        setFiles(prev => [...prev, ...imageFiles]);
      } else {
        notifyError('Only image files (jpg, png, webp, etc.) are accepted.');
      }
    }
  }, [notifyError]);

  const processFiles = useCallback(async () => {
    if (files.length === 0) return;

    setIsProcessing(true);
    setProgress('Initializing...');

    const processedFiles: SessionFile[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(`Processing ${file.name} (${i + 1}/${files.length})...`);
        
        const fileDataPromise = new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target?.result as string);
            reader.onerror = (error) => reject(error);
            reader.readAsDataURL(file);
        });
        const fileData = await fileDataPromise;
        
        // For images, content can be empty, as the fileData is the primary payload for the AI
        processedFiles.push({ name: file.name, content: `Image file: ${file.name}`, fileData: fileData });
      }
      onImagesSubmitted(processedFiles);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      notifyError(`Failed to process files: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  }, [files, notifyError, onImagesSubmitted]);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }, []);
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); }, []);
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); handleFiles(e.dataTransfer.files); }, []);
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { handleFiles(e.target.files); };
  const handleClick = () => { document.getElementById('image-file-input')?.click(); };

  return (
    <div className="relative flex flex-col items-center justify-center h-full p-8 text-center">
      <button onClick={onGoBack} className="absolute top-4 left-4 p-2 text-gray-300 hover:text-white transition-colors" title={backButtonTitle}>
        <HomeIcon className="w-6 h-6"/>
      </button>
      <h1 className="text-5xl sm:text-6xl font-extrabold leading-none tracking-tight text-center mb-4">
          <span className="text-white">Image</span><span className="text-red-400">Analyzer</span><span className="text-[0.5em]"><span className="text-gray-500">.</span><span className="text-white">Land</span><span className="text-cyan-400">Surv</span><span className="text-green-400">.ai</span></span><sup className="text-xl text-gray-500">™</sup>
      </h1>
      <p className="text-gray-300 mb-6 max-w-lg">Upload one or more site photos. The AI will help you analyze, tag, and associate them with project data.</p>
      
      <div className="w-full max-w-2xl flex flex-col items-center gap-4">
        <div
          className={`w-full cursor-pointer flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-lg transition-colors duration-300 ${isDragging ? 'border-red-400 bg-gray-700/50' : 'border-gray-600 hover:border-red-500'}`}
          onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop} onClick={handleClick}
        >
          <input id="image-file-input" type="file" className="hidden" accept="image/*" multiple onChange={handleFileChange} />
          <UploadIcon className="w-16 h-16 mb-4 text-gray-500" />
          <h2 className="text-xl font-semibold text-white">Drop Image Files Here</h2>
          <p className="text-gray-400 mt-2">or click to browse local files</p>
        </div>

        {files.length > 0 && (
          <div className="w-full text-left bg-gray-900/50 p-3 rounded-lg border border-gray-700">
            <h4 className="font-semibold mb-2">Selected Files:</h4>
            <ul className="text-sm list-disc list-inside text-gray-300">
              {files.map((f, i) => <li key={i} className="truncate">{f.name}</li>)}
            </ul>
          </div>
        )}

        {isProcessing ? (
             <div className="mt-4 text-center">
                <div className="w-8 h-8 mx-auto border-4 border-red-400 border-t-transparent rounded-full animate-spin mb-4"></div>
                <h2 className="text-xl font-semibold text-white">Processing...</h2>
                <p className="text-red-300 mt-2 font-mono text-sm">{progress}</p>
              </div>
        ) : (
             <button
                onClick={processFiles}
                disabled={files.length === 0}
                className="mt-4 px-8 py-3 text-lg font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors duration-200"
            >
                Process {files.length} Image{files.length !== 1 && 's'}
            </button>
        )}
      </div>
    </div>
  );
};

export default ImageInput;