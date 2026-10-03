import React, { useState, useCallback } from 'react';
import { UploadIcon, HomeIcon } from './icons.tsx';
import { exampleFileContent, exampleFileName } from '../assets/example.raw.ts';
import PdfPageSelector from './PdfPageSelector';
import { processPdfForMultimodal } from '../utils/pdfUtils';
import { type SessionFile } from '../types';
import * as pdfjsLib from 'pdfjs-dist';
import { useErrorReporter } from '../contexts/AppStateContext';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@5.4.394/build/pdf.worker.mjs`;

interface CivilDrafterFileUploadProps {
  onFileUploaded: (content: string, fileName: string) => void;
  onPdfUploaded?: (files: SessionFile[]) => void;
  onGoBack: () => void;
  backButtonTitle?: string;
  existingPointCount?: number;
  onUseExistingPoints?: () => void;
}

const CivilDrafterFileUpload: React.FC<CivilDrafterFileUploadProps> = ({ 
  onFileUploaded, 
  onPdfUploaded,
  onGoBack, 
  backButtonTitle = 'Go to Home Screen',
  existingPointCount = 0,
  onUseExistingPoints,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [showPageSelector, setShowPageSelector] = useState(false);
  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null);
  const { reportError } = useErrorReporter();

  const processPdf = useCallback(async (file: File, pages: number[]) => {
    if (!onPdfUploaded) return;
    setIsParsing(true);
    setProgress('Processing PDF...');
    try {
      const reader = new FileReader();
      const fileData = await new Promise<string>((resolve, reject) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { text, rasterImageData } = await processPdfForMultimodal(file, (p) => {
        if (p.status === 'ocr_progress' && p.page && p.totalPages && p.progress) {
          setProgress(`OCR – Page ${p.page}/${p.totalPages} (${Math.round(p.progress * 100)}%)`);
        }
      }, pages);

      onPdfUploaded([{ name: file.name, content: text, fileData, rasterImageData, selectedPages: pages }]);
    } catch (err) {
      reportError({ title: 'PDF processing failed', message: err instanceof Error ? err.message : 'Unknown error', error: err });
    } finally {
      setIsParsing(false);
      setProgress(null);
      setPendingPdfFile(null);
    }
  }, [onPdfUploaded, reportError]);

  const handleFile = useCallback(async (file: File) => {
    const fileName = file.name.toLowerCase();
    
    // Handle PDF files
    if (fileName.endsWith('.pdf') || file.type === 'application/pdf') {
      if (onPdfUploaded) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
          if (pdf.numPages === 1) {
            await processPdf(file, [1]);
          } else {
            setPendingPdfFile(file);
            setShowPageSelector(true);
          }
        } catch (err) {
          reportError({ title: 'PDF read failed', message: err instanceof Error ? err.message : 'Unknown error', error: err });
        }
      } else {
        reportError({ title: 'PDF upload unavailable', message: 'PDF upload is not currently configured for this agent.' });
      }
      return;
    }
    
    // Handle point files (.raw, .txt, .csv, .pts, .pnezd)
    if (fileName.endsWith('.raw') || 
        fileName.endsWith('.txt') || 
        fileName.endsWith('.csv') ||
        fileName.endsWith('.pts') ||
        fileName.endsWith('.pnezd') ||
        file.type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        onFileUploaded(content, file.name);
      };
      reader.readAsText(file);
      return;
    }
    
    reportError({ title: 'Invalid file', message: 'Please upload a point file (.raw, .txt, .csv) or a PDF plan file.' });
  }, [onFileUploaded, onPdfUploaded, processPdf, reportError]);

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
    document.getElementById('civil-drafter-file-input')?.click();
  };

  const handleLoadExample = useCallback(() => {
    onFileUploaded(exampleFileContent, exampleFileName);
  }, [onFileUploaded]);

  return (
    <div className="relative flex flex-col items-center justify-center h-full p-8 text-center">
      {showPageSelector && pendingPdfFile && (
        <PdfPageSelector
          file={pendingPdfFile}
          onSelect={(pages) => {
            setShowPageSelector(false);
            processPdf(pendingPdfFile, pages);
          }}
          onCancel={() => {
            setShowPageSelector(false);
            setPendingPdfFile(null);
          }}
        />
      )}
      {isParsing && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-900/80 rounded-lg">
          <div className="w-10 h-10 border-4 border-fuchsia-400 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-fuchsia-300 font-semibold">{progress ?? 'Processing...'}</p>
        </div>
      )}
      <button onClick={onGoBack} className="absolute top-4 left-4 p-2 text-gray-300 hover:text-white transition-colors" title={backButtonTitle}>
        <HomeIcon className="w-6 h-6"/>
      </button>
      <h1 className="text-5xl sm:text-6xl font-extrabold leading-none tracking-tight text-center mb-4">
          <span className="text-white">Civil</span><span className="text-fuchsia-400">Drafter</span><span className="text-[0.5em]"><span className="text-gray-500">.</span><span className="text-white">Land</span><span className="text-cyan-400">Surv</span><span className="text-green-400">.ai</span></span><sup className="text-xl text-gray-500">™</sup>
      </h1>
      <p className="text-gray-300 mb-6 max-w-lg">
        Upload a <strong>point file</strong> (.raw, .txt, .csv) or a <strong>PDF plan</strong> for the AI to generate intelligent linework from.
      </p>
      {existingPointCount > 0 && onUseExistingPoints && (
        <div className="w-full max-w-lg mb-6 p-4 rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-center">
          <p className="text-cyan-200 mb-3">
            You already have <strong>{existingPointCount.toLocaleString()}</strong> point{existingPointCount === 1 ? '' : 's'} loaded.
          </p>
          <button
            onClick={onUseExistingPoints}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-300"
          >
            Continue to drawing with loaded points
          </button>
          <p className="text-gray-400 text-sm mt-3">or upload a new file below.</p>
        </div>
      )}
      <div
        className={`w-full max-w-lg cursor-pointer flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-lg transition-colors duration-300 ${isDragging ? 'border-fuchsia-400 bg-gray-700/50' : 'border-gray-600 hover:border-fuchsia-500'}`}
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
          id="civil-drafter-file-input"
          type="file"
          className="hidden"
          accept=".raw,.txt,.csv,.pts,.pnezd,.pdf,text/plain,application/pdf"
          onChange={handleFileChange}
        />
        <UploadIcon className="w-16 h-16 mb-4 text-gray-500" />
        <h2 className="text-xl font-semibold text-white">Drop your Point File or PDF here</h2>
        <p className="text-gray-400 mt-2">Accepts: .raw, .txt, .csv, .pts, .pnezd, .pdf</p>
      </div>
      <div className="mt-6 text-center text-gray-400">
        <p>
          Not sure where to start?{' '}
          <button
            onClick={handleLoadExample}
            className="text-fuchsia-400 hover:text-fuchsia-300 font-semibold underline focus:outline-none focus:ring-2 focus:ring-fuchsia-500 rounded"
          >
            Try our example point file.
          </button>
        </p>
      </div>
    </div>
  );
};

export default CivilDrafterFileUpload;
