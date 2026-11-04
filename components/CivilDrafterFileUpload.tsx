import React, { useState, useCallback } from 'react';
import { CivilDrafterIcon } from './icons.tsx';
import { UploadShell, UploadPanel, UploadDropzone, UploadPrimaryButton } from './UploadShell.tsx';
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


  return (
    <UploadShell
      icon={CivilDrafterIcon}
      accent="#e879f9"
      title="Civil Drafter"
      description="Upload a point file or a PDF plan — the agent generates intelligent linework from it."
      onGoBack={onGoBack}
      backTitle={backButtonTitle}
    >
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
        <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2.5">
          <span className="h-3.5 w-3.5 flex-shrink-0 animate-spin rounded-full border-2 border-fuchsia-300 border-t-transparent" />
          <span className="min-w-0 truncate font-mono text-[11px] text-slate-400">{progress ?? 'Processing…'}</span>
        </div>
      )}

      {existingPointCount > 0 && onUseExistingPoints && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-400/25 bg-cyan-400/[0.05] px-4 py-3">
          <p className="text-[12px] text-slate-300">
            You already have <span className="font-semibold text-slate-100">{existingPointCount.toLocaleString()}</span> point{existingPointCount === 1 ? '' : 's'} loaded.
          </p>
          <UploadPrimaryButton onClick={onUseExistingPoints}>Continue with loaded points</UploadPrimaryButton>
        </div>
      )}

      <UploadPanel>
        <UploadDropzone
          id="civil-drafter-file-input"
          accept=".raw,.txt,.csv,.pts,.pnezd,.pdf,text/plain,application/pdf"
          onFiles={(selected) => {
            const file = selected?.[0];
            if (file) handleFile(file);
          }}
          onDrop={handleDrop}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          isDragging={isDragging}
          title="Drop your point file or PDF here"
          hint=".raw · .txt · .csv · .pts · .pnezd · .pdf"
        />
      </UploadPanel>

      <p className="text-center text-[11px] text-slate-500">
        Tip: a legacy .raw file carries the most context — codes, descriptions, and elevations all get read.
      </p>
    </UploadShell>
  );
};

export default CivilDrafterFileUpload;
