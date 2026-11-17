import React, { useState, useCallback } from 'react';
import { CivilDrafterIcon } from './icons.tsx';
import { UploadShell, UploadPanel, UploadDropzone, UploadPrimaryButton } from './UploadShell.tsx';
import PdfPageSelector from './PdfPageSelector';
import { processPdfForMultimodal, processRasterImageForMultimodal, isRasterImageFile } from '../utils/pdfUtils';
import { getOcrLanguages } from '../utils/ocrLanguages.ts';
import { type SessionFile } from '../types';
import DocumentReviewTable from './DocumentReviewTable.tsx';
import {
  buildDocumentReviewRows,
  extractReviewRowsFromText,
  reviewFileName,
  reviewRowsToPnezd,
  type DocumentReviewMethod,
  type DocumentReviewRow,
} from '../utils/documentReview.ts';
import * as pdfjsLib from 'pdfjs-dist';
import { useAppState, useErrorReporter } from '../contexts/AppStateContext';
import { useGlobalSettings } from '../utils/globalSettings.ts';
import { ensurePdfWorkerConfigured } from '../utils/pdfWorker.ts';

ensurePdfWorkerConfigured(pdfjsLib);

interface CivilDrafterFileUploadProps {
  onFileUploaded: (content: string, fileName: string) => void;
  onPdfUploaded?: (files: SessionFile[]) => void;
  onGoBack: () => void;
  backButtonTitle?: string;
  existingPointCount?: number;
  onUseExistingPoints?: () => void;
}

interface PendingDocumentReview {
  fileName: string;
  method: DocumentReviewMethod;
  sourceConfidence: number;
  rows: DocumentReviewRow[];
  sessionFile?: SessionFile;
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
  const [review, setReview] = useState<PendingDocumentReview | null>(null);
  const { reportError } = useErrorReporter();
  const { settings } = useAppState();
  const globalSettings = useGlobalSettings();
  const documentReviewEnabled = globalSettings.featureFlags?.['document.review'] !== false;

  const enterReview = useCallback((
    fileName: string,
    method: DocumentReviewMethod,
    sourceConfidence: number,
    rows: ReturnType<typeof extractReviewRowsFromText>,
    sessionFile?: SessionFile,
  ) => {
    setReview({
      fileName,
      method,
      sourceConfidence,
      rows: buildDocumentReviewRows(rows, { overallConfidence: sourceConfidence }),
      sessionFile,
    });
  }, []);

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

      const result = await processPdfForMultimodal(file, (p) => {
        if (p.status === 'ocr_progress' && p.page && p.totalPages && p.progress) {
          setProgress(`OCR – Page ${p.page}/${p.totalPages} (${Math.round(p.progress * 100)}%)`);
        }
      }, pages);

      const extracted = extractReviewRowsFromText(result.text);
      if (documentReviewEnabled && extracted.length >= 2) {
        const method: DocumentReviewMethod = result.ocrUsed ? 'ocr' : 'pdf-text';
        const confidence = result.ocrUsed
          ? (result.ocrConfidence ?? 0.65)
          : 0.98;
        enterReview(
          file.name,
          method,
          confidence,
          extracted,
          {
            name: file.name,
            content: result.text,
            fileData,
            rasterImageData: result.rasterImageData,
            selectedPages: pages,
          },
        );
        return;
      }

      onPdfUploaded([{ name: file.name, content: result.text, fileData, rasterImageData: result.rasterImageData, selectedPages: pages }]);
    } catch (err) {
      reportError({ title: 'PDF processing failed', message: err instanceof Error ? err.message : 'Unknown error', error: err });
    } finally {
      setIsParsing(false);
      setProgress(null);
      setPendingPdfFile(null);
    }
  }, [onPdfUploaded, enterReview, reportError, documentReviewEnabled]);

  const processImage = useCallback(async (file: File) => {
    if (!documentReviewEnabled) {
      reportError({
        title: 'Document review is disabled',
        message: 'Arabic document review is currently switched off. Upload a point file or PDF instead.',
      });
      return;
    }
    setIsParsing(true);
    setProgress('Reading document image...');
    try {
      const result = await processRasterImageForMultimodal(file, (p) => {
        if (p.status === 'ocr_progress' && p.page && p.totalPages && p.progress) {
          setProgress(`OCR – Page ${p.page}/${p.totalPages} (${Math.round(p.progress * 100)}%)`);
        }
      });
      const extracted = extractReviewRowsFromText(result.text);
      if (extracted.length === 0) {
        reportError({
          title: 'No coordinate table found',
          message: 'This image did not contain a recognisable coordinate table. Try a clearer scan or select the page containing the point schedule.',
        });
        return;
      }
      enterReview(file.name, 'ocr', result.confidence ?? 0.65, extracted);
    } catch (err) {
      reportError({ title: 'Image OCR failed', message: err instanceof Error ? err.message : 'Unknown error', error: err });
    } finally {
      setIsParsing(false);
      setProgress(null);
    }
  }, [enterReview, reportError, documentReviewEnabled]);

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

    // Handle scanned plans / phone photos of coordinate tables
    if (isRasterImageFile(file)) {
      await processImage(file);
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

    reportError({
      title: 'Invalid file',
      message: 'Please upload a point file (.raw, .txt, .csv), a PDF plan, or a PNG/JPG scan of a coordinate table.',
    });
  }, [onFileUploaded, onPdfUploaded, processPdf, processImage, reportError]);

  const handleConfirmReview = useCallback(() => {
    if (!review) return;
    const content = reviewRowsToPnezd(review.rows);
    if (!content.trim()) {
      reportError({
        title: 'Nothing to plot',
        message: 'Add or include at least one row with a point number and valid northing/easting.',
      });
      return;
    }
    const name = reviewFileName(review.fileName);
    setReview(null);
    onFileUploaded(content, name);
  }, [review, onFileUploaded, reportError]);

  const handleSendOriginal = useCallback(() => {
    if (!review?.sessionFile || !onPdfUploaded) return;
    const file = review.sessionFile;
    setReview(null);
    onPdfUploaded([file]);
  }, [review, onPdfUploaded]);

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

  const summaryLanguage = settings?.aiOutputLanguage === 'ar'
    || (settings?.aiOutputLanguage === 'auto'
      && Boolean(review?.rows.some((row) => /[\u0600-\u06FF]/.test(`${row.pointNumber} ${row.description}`))))
    ? 'ar'
    : 'en';

  return (
    <UploadShell
      icon={CivilDrafterIcon}
      accent="#e879f9"
      title="Civil Drafter"
      description={review
        ? 'Review every extracted call before it reaches the canvas. Nothing is plotted until you confirm.'
        : 'Upload a point file, a PDF plan, or a scan of a coordinate table. Gulf regions use Arabic + English OCR.'}
      onGoBack={onGoBack}
      backTitle={backButtonTitle}
    >
      {review ? (
        <DocumentReviewTable
          fileName={review.fileName}
          method={review.method}
          sourceConfidence={review.sourceConfidence}
          rows={review.rows}
          summaryLanguage={summaryLanguage}
          onRowsChange={(rows) => setReview((current) => current ? { ...current, rows } : current)}
          onConfirm={handleConfirmReview}
          onCancel={() => setReview(null)}
          onSendOriginal={review.sessionFile && onPdfUploaded ? handleSendOriginal : undefined}
        />
      ) : (
        <>
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
              accept=".raw,.txt,.csv,.pts,.pnezd,.pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,text/plain,application/pdf,image/*"
              onFiles={(selected) => {
                const file = selected?.[0];
                if (file) handleFile(file);
              }}
              onDrop={handleDrop}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              isDragging={isDragging}
              title="Drop your point file, PDF plan, or coordinate-table scan"
              hint=".raw · .txt · .csv · .pts · .pnezd · .pdf · .png · .jpg"
            />
          </UploadPanel>

          <p className="text-center text-[11px] text-slate-500">
            Scanned plans use {getOcrLanguages() === 'ara+eng' ? 'Arabic + English' : 'English'} OCR. PDF text layers are read directly.
          </p>
          <p className="text-center text-[11px] text-slate-500">
            Extracted coordinate tables open in a review step before anything is plotted.
          </p>
        </>
      )}
    </UploadShell>
  );
};

export default CivilDrafterFileUpload;
