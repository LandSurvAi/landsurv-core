
import React, { useState, useCallback } from 'react';
import { CourthouseIcon } from './icons';
import { UploadShell, UploadPanel, UploadDropzone, UploadPrimaryButton, UploadGhostButton, UploadActionBar, UploadModeSwitch, UploadFileList } from './UploadShell.tsx';
import { processPdfForMultimodal, processRasterImageForMultimodal, isRasterImageFile, type OcrProgress } from '../utils/pdfUtils';
import { combineDeedFiles } from '../utils/deedSessionFiles.ts';
import PdfPageSelector from './PdfPageSelector';
import { exampleDeedContent } from '../assets/example.deed';
import { SessionFile } from '../types';
import * as pdfjsLib from 'pdfjs-dist';
import { useAppState } from '../contexts/AppStateContext.tsx';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@5.4.394/build/pdf.worker.mjs`;

interface DeedInputProps {
  onDeedSubmitted: (file: SessionFile) => void;
  onDeedBatchSubmitted?: (files: SessionFile[]) => void;
  onGoBack: () => void;
  backButtonTitle?: string;
  /** Optional: skip the upload screen and open the canvas with an empty boundary editor. */
  onStartFromScratch?: () => void;
  /** Free deeds left on this device (fingerprint ledger); null while unknown. */
  freeDeedsRemaining?: number | null;
  /** Total free deeds granted per device. */
  freeDeedsLimit?: number;
  /** True when the user holds a key, so deeds are not metered. */
  freeDeedsUnlimited?: boolean;
  /** True when the last count came from the offline fallback. */
  freeDeedsUnverified?: boolean;
  /** Opens the upgrade dialog (used by the "out of free deeds" call to action). */
  onShowUpgrade?: () => void;
  /** Opens the Boundary Agent GIS panel (county parcel lookup) on the canvas. */
  onOpenGis?: () => void;
}

interface FileWithPages {
  file: File;
  pages?: number[];
}

type InputMode = 'text' | 'files';

const DeedInput: React.FC<DeedInputProps> = ({ onDeedSubmitted, onDeedBatchSubmitted, onGoBack, backButtonTitle = 'Go to Home Screen', onStartFromScratch, freeDeedsRemaining = null, freeDeedsLimit = 5, freeDeedsUnlimited = false, freeDeedsUnverified = false, onShowUpgrade, onOpenGis }) => {
  const [deedText, setDeedText] = useState('');
  const [mode, setMode] = useState<InputMode>('files');
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<string | null>(null);
  const [showPageSelector, setShowPageSelector] = useState(false);
  const [selectorIndex, setSelectorIndex] = useState<number | null>(null);
  const [files, setFiles] = useState<FileWithPages[]>([]);
  const { addNotification } = useAppState();

  const notifyError = useCallback((message: string) => {
    addNotification({ kind: 'deed-input', severity: 'error', title: 'Deed Input', message });
  }, [addNotification]);

  const handleSubmit = useCallback(() => {
    if (deedText.trim()) {
      onDeedSubmitted({
          name: 'Pasted Deed',
          content: deedText,
      });
    }
  }, [deedText, onDeedSubmitted]);

  const handleLoadExample = useCallback(() => {
    onDeedSubmitted({ name: 'example.deed', content: exampleDeedContent });
  }, [onDeedSubmitted]);

  const handleFiles = async (selectedFiles: FileList | null) => {
    if (selectedFiles) {
      const validFiles: FileWithPages[] = [];
      
      for (const file of Array.from(selectedFiles)) {
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        const isImage = isRasterImageFile(file);
        
        if (isPdf) {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument(arrayBuffer);
            const pdf = await loadingTask.promise;
            
            console.log('DeedInput.handleFiles - PDF:', file.name, 'Pages:', pdf.numPages);
            
            // If single page, automatically select it; if multi-page, will need manual selection
            if (pdf.numPages === 1) {
              validFiles.push({ file, pages: [1] });
            } else {
              validFiles.push({ file });
            }
          } catch (err) {
            console.error('Error reading PDF:', file.name, err);
            notifyError(`Failed to read PDF: ${file.name}`);
            continue;
          }
        } else if (isImage) {
          // Raster images are treated as single-page documents (no page selection needed)
          console.log('DeedInput.handleFiles - Image:', file.name);
          validFiles.push({ file, pages: [1] });
        } else {
          console.warn('Unsupported file type:', file.name, file.type);
        }
      }
      
      if (validFiles.length === 0) {
        notifyError('Please upload a PDF or raster image file (PNG, JPG, GIF, TIFF, BMP, WebP).');
        return;
      }
      
      setFiles(prev => {
        const updated = [...prev, ...validFiles];
        // If we added any multi-page PDFs, show selector for the first one that needs selection
        setTimeout(() => {
          const firstMultiPageIndex = updated.findIndex(f => !f.pages || f.pages.length === 0);
          if (firstMultiPageIndex !== -1) {
            setSelectorIndex(firstMultiPageIndex);
            setShowPageSelector(true);
          }
        }, 0);
        return updated;
      });
    }
  };

  const showPageSelectorForFile = (index: number) => {
    setSelectorIndex(index);
    setShowPageSelector(true);
  };

  const handlePagesSelected = (pages: number[]) => {
    if (selectorIndex === null) return;
    
    console.log('DeedInput.handlePagesSelected - pages:', pages, 'for index:', selectorIndex);
    
    // Update the file with the selected pages
    const updatedFiles = [...files];
    updatedFiles[selectorIndex] = { ...updatedFiles[selectorIndex], pages };
    setFiles(updatedFiles);
    
    // After selecting pages, check if there are other multi-page PDFs that need selection
    const nextMultiPageIndex = updatedFiles.findIndex((f, i) => i > selectorIndex && (!f.pages || f.pages.length === 0));
    if (nextMultiPageIndex !== -1) {
      setTimeout(() => {
        setSelectorIndex(nextMultiPageIndex);
        setShowPageSelector(true);
      }, 100);
    } else {
      setShowPageSelector(false);
      setSelectorIndex(null);
    }
  };

  const processFiles = async () => {
    if (files.length === 0) return;

    console.log('DeedInput.processFiles STARTING - files:', files.map(f => ({ name: f.file.name, pages: f.pages })));
    setIsParsing(true);
    setOcrProgress('Initializing...');

    try {
      const processedFiles: SessionFile[] = [];
      const failedFiles: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const { file, pages } = files[i];
        if (!pages || pages.length === 0) {
          throw new Error(`File "${file.name}" has no pages selected. Please select pages before processing.`);
        }

        console.log('DeedInput.processFiles - Processing file:', file.name, 'with pages:', pages);
        setOcrProgress(`Processing file ${i + 1}/${files.length}: ${file.name}`);

        try {
          const reader = new FileReader();
          const fileDataPromise = new Promise<string>((resolve, reject) => {
            reader.onload = (event) => resolve(event.target?.result as string);
            reader.onerror = (error) => reject(error);
            reader.readAsDataURL(file);
          });
          const fileData = await fileDataPromise;

          const progressCallback = (progress: OcrProgress) => {
            if (progress.status === 'extracting_text') {
              setOcrProgress(`Processing file ${i + 1}/${files.length}: extracting text from ${file.name}...`);
            } else if (progress.status === 'ocr_progress' && progress.page && progress.totalPages && progress.progress !== undefined) {
              const percent = Math.round(progress.progress * 100);
              setOcrProgress(`Processing file ${i + 1}/${files.length}: OCR ${file.name} page ${progress.page}/${progress.totalPages} (${percent}%)`);
            }
          };

          // Detect if this is a PDF or raster image and route to appropriate processor
          const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
          const isImage = isRasterImageFile(file);
          
          let text: string;
          let rasterImageData: string[];
          
          if (isPdf) {
            const result = await processPdfForMultimodal(file, progressCallback, pages);
            text = result.text;
            rasterImageData = result.rasterImageData;
          } else if (isImage) {
            const result = await processRasterImageForMultimodal(file, progressCallback);
            text = result.text;
            rasterImageData = result.rasterImageData;
          } else {
            throw new Error(`Unsupported file type: ${file.type}`);
          }

          if (!text || text.trim().length === 0) {
            throw new Error(`No text could be extracted from ${file.name}. The file might be corrupted, empty, or too low quality.`);
          }

          processedFiles.push({
            name: file.name,
            content: text,
            fileData,
            rasterImageData,
            selectedPages: pages,
          });
        } catch (err) {
          console.error('DeedInput.processFiles - Failed file:', file.name, err);
          failedFiles.push(file.name);
        }
      }

      if (processedFiles.length === 0) {
        throw new Error('None of the selected files could be processed.');
      }

      if (processedFiles.length > 1 && onDeedBatchSubmitted) {
        onDeedBatchSubmitted(processedFiles);
      } else if (processedFiles.length > 1) {
        onDeedSubmitted(combineDeedFiles(processedFiles));
      } else {
        onDeedSubmitted(processedFiles[0]);
      }

      if (failedFiles.length > 0) {
        notifyError(`Processed ${processedFiles.length} file(s). Failed: ${failedFiles.join(', ')}`);
      }

      setFiles([]);
      
    } catch (err) {
      console.error("File Processing Error:", err);
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred during processing.';
      notifyError(`Failed to process file. ${errorMessage}`);
    } finally {
      setIsParsing(false);
      setOcrProgress(null);
    }
  };

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
      handleFiles(e.dataTransfer.files);
      e.dataTransfer.clearData();
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  const handleClick = () => {
    document.getElementById('deed-file-input')?.click();
  };

  // null = count still loading; treat it as a full allowance for the offer copy.
  const freeDeedsLeft = freeDeedsRemaining === null ? freeDeedsLimit : Math.max(0, freeDeedsRemaining);
  const isOutOfFreeDeeds = !freeDeedsUnlimited && freeDeedsLeft <= 0;

  const handleFolderClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.png,.jpg,.jpeg,.gif,.bmp,.webp,.tif,.tiff,application/pdf,image/png,image/jpeg,image/gif,image/bmp,image/webp,image/tiff';
    input.multiple = true;
    (input as any).webkitdirectory = true;
    (input as any).directory = true;
    input.onchange = () => {
      handleFiles(input.files);
    };
    input.click();
  };

  return (
    <UploadShell
      icon={CourthouseIcon}
      accent="#34d399"
      title="Boundary Agent"
      description="Paste a legal description or drop a PDF / scanned image — the agent drafts the parcel boundary straight onto your canvas."
      onGoBack={onGoBack}
      backTitle={backButtonTitle}
    >
      {/* Page Selector Modal - only show if file index is valid and file needs page selection */}
      {showPageSelector && selectorIndex !== null && files[selectorIndex] && (!files[selectorIndex].pages || files[selectorIndex].pages!.length === 0) && (
        <PdfPageSelector
          file={files[selectorIndex].file}
          onSelect={handlePagesSelected}
          onCancel={() => {
            setShowPageSelector(false);
            setSelectorIndex(null);
          }}
        />
      )}

      {/* Free-deed offer: 5 per device, metered by the fingerprint ledger.
          Key holders already have unlimited deeds, so show them nothing. */}
      {!freeDeedsUnlimited && (
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
            isOutOfFreeDeeds
              ? 'border-amber-400/25 bg-amber-400/[0.06]'
              : 'border-emerald-400/25 bg-emerald-400/[0.05]'
          }`}
          title={
            freeDeedsUnverified
              ? 'Offline count — will sync with the server when available'
              : `This device gets ${freeDeedsLimit} free deeds`
          }
        >
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-[12.5px] font-semibold text-slate-100">
              {isOutOfFreeDeeds
                ? `All ${freeDeedsLimit} free deeds used`
                : `${freeDeedsLimit} free deeds included`}
              {!isOutOfFreeDeeds && (
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-300">
                  No card needed
                </span>
              )}
              {freeDeedsUnverified && (
                <span className="text-[10px] font-normal text-slate-500">offline count</span>
              )}
            </p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-slate-400">
              {isOutOfFreeDeeds
                ? 'Unlock unlimited AI deed drafting with an Enabling Key or compute credits — drafted boundaries stay on the canvas.'
                : `${freeDeedsLeft} of ${freeDeedsLimit} left — upload a deed and the agent drafts the parcel for you.`}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-3">
            <div
              className="flex items-center gap-1"
              aria-label={`${freeDeedsLeft} of ${freeDeedsLimit} free deeds left`}
            >
              {Array.from({ length: freeDeedsLimit }).map((_, index) => (
                <span
                  key={index}
                  className={`h-1.5 w-1.5 rounded-full ${index < freeDeedsLeft ? 'bg-emerald-400' : 'bg-white/15'}`}
                />
              ))}
            </div>
            {isOutOfFreeDeeds && onShowUpgrade && (
              <UploadPrimaryButton onClick={onShowUpgrade}>Unlock unlimited</UploadPrimaryButton>
            )}
          </div>
        </div>
      )}

      <UploadPanel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <UploadModeSwitch
            value={mode}
            options={[{ value: 'text' as InputMode, label: 'Paste text' }, { value: 'files' as InputMode, label: 'Upload files' }]}
            onChange={(next) => {
              setMode(next);
              if (next === 'text') setFiles([]);
            }}
          />
          <span className="text-[11px] text-slate-500">
            {mode === 'text' ? 'Metes & bounds, lot or block description' : 'PDF · PNG · JPG · TIFF · BMP · WebP — multiple files'}
          </span>
        </div>

        {mode === 'text' ? (
          <div className="mt-3.5 flex flex-col gap-3">
            <textarea
              value={deedText}
              onChange={(e) => setDeedText(e.target.value)}
              placeholder="e.g., COMMENCING AT A 5/8 INCH IRON ROD FOUND AT THE NORTHEAST CORNER OF SECTION 1..."
              className="h-52 w-full resize-y rounded-lg border border-white/[0.08] bg-black/30 p-3.5 font-mono text-[12px] leading-relaxed text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-[color:var(--up-accent)]"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleLoadExample}
                className="text-[11.5px] text-slate-400 underline-offset-4 transition-colors hover:text-slate-100 hover:underline"
              >
                Load an example deed
              </button>
              <UploadPrimaryButton onClick={handleSubmit} disabled={!deedText.trim() || isParsing}>
                {isParsing ? 'Processing…' : 'Process deed'}
              </UploadPrimaryButton>
            </div>
          </div>
        ) : (
          <div className="mt-3.5 flex flex-col gap-3">
            <UploadDropzone
              id="deed-file-input"
              accept=".pdf,.png,.jpg,.jpeg,.gif,.bmp,.webp,.tif,.tiff,application/pdf,image/png,image/jpeg,image/gif,image/bmp,image/webp,image/tiff"
              onFiles={(selected) => handleFiles(selected)}
              onDrop={handleDrop}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              isDragging={isDragging}
              title="Drop your PDF or image here"
              hint="or click to browse · multiple files supported"
            >
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleFolderClick(); }}
                className="mt-3 inline-flex h-7 items-center rounded-md border border-white/[0.10] px-2.5 text-[11px] font-medium text-slate-400 transition-colors hover:border-[color:var(--up-accent)] hover:text-slate-100"
              >
                Select folder (batch)
              </button>
            </UploadDropzone>

            <UploadFileList
              files={files.map((fw, i) => ({
                key: i,
                name: fw.file.name,
                meta: fw.pages && fw.pages.length > 0 ? `${fw.pages.length} page${fw.pages.length !== 1 ? 's' : ''}` : undefined,
                action: (
                  <button
                    type="button"
                    onClick={() => showPageSelectorForFile(i)}
                    className="rounded-md border border-white/[0.10] px-2 py-1 text-[10.5px] font-medium text-slate-300 transition-colors hover:border-[color:var(--up-accent)] hover:text-slate-100"
                  >
                    {fw.pages && fw.pages.length > 0 ? 'Edit pages' : 'Select pages'}
                  </button>
                ),
              }))}
            />

            {isParsing ? (
              <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2.5">
                <span className="h-3.5 w-3.5 flex-shrink-0 animate-spin rounded-full border-2 border-emerald-300 border-t-transparent" />
                <span className="min-w-0 truncate font-mono text-[11px] text-slate-400">{ocrProgress || 'Processing…'}</span>
              </div>
            ) : (
              <UploadActionBar
                note={files.length === 0 ? 'No files selected yet' : `${files.length} file${files.length === 1 ? '' : 's'} ready`}
              >
                <UploadPrimaryButton onClick={processFiles} disabled={files.length === 0}>
                  Process {files.length} file{files.length !== 1 && 's'}
                </UploadPrimaryButton>
              </UploadActionBar>
            )}
          </div>
        )}
      </UploadPanel>

      {/* Secondary ways in: no upload required. */}
      {(onStartFromScratch || onOpenGis) && (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          {onStartFromScratch && (
            <UploadGhostButton
              onClick={onStartFromScratch}
              title="Skip upload and enter bearings/distances by hand in the Boundary Editor"
            >
              Start a blank boundary instead
            </UploadGhostButton>
          )}
          {onOpenGis && (
            <UploadGhostButton
              onClick={onOpenGis}
              title="Pull the county's tax-parcel boundaries (parcel ID, owner, deed book/page) onto the canvas"
            >
              <CourthouseIcon className="h-3.5 w-3.5" />
              Look up parcel in GIS
            </UploadGhostButton>
          )}
        </div>
      )}
    </UploadShell>
  );
};

export default DeedInput;