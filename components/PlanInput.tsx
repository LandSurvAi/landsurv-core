
import React, { useState, useCallback } from 'react';
import { DocumentDuplicateIcon } from './icons';
import { UploadShell, UploadPanel, UploadDropzone, UploadPrimaryButton, UploadActionBar, UploadFileList } from './UploadShell.tsx';
import { processPdfForMultimodal } from '../utils/pdfUtils';
import PdfPageSelector from './PdfPageSelector';
import { type SessionFile } from '../types';
import * as pdfjsLib from 'pdfjs-dist';
import { useAppState } from '../contexts/AppStateContext.tsx';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@5.4.394/build/pdf.worker.mjs`;

interface PlanInputProps {
  onPlansSubmitted: (files: SessionFile[]) => void;
  onGoBack: () => void;
  backButtonTitle?: string;
}

interface FileWithPages {
  file: File;
  pages?: number[];
}

const PlanInput: React.FC<PlanInputProps> = ({ onPlansSubmitted, onGoBack, backButtonTitle = 'Go to Home Screen' }) => {
  const [files, setFiles] = useState<FileWithPages[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [showPageSelector, setShowPageSelector] = useState(false);
  const [selectorIndex, setSelectorIndex] = useState<number | null>(null);
  const { addNotification } = useAppState();

  const notifyError = useCallback((message: string) => {
    addNotification({ kind: 'plan-input', severity: 'error', title: 'Plan Expert', message });
  }, [addNotification]);

  const handleFiles = useCallback(async (selectedFiles: FileList | null) => {
    if (selectedFiles) {
      console.log('=== handleFiles CALLED ===');
      const pdfFiles = Array.from(selectedFiles).filter(file => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
      if (pdfFiles.length > 0) {
        const newFiles: FileWithPages[] = [];
        let needsPageSelection = false;
        
        for (const file of pdfFiles) {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument(arrayBuffer);
            const pdf = await loadingTask.promise;
            
            console.log('PlanInput.handleFiles - Detected file:', file.name, 'with', pdf.numPages, 'pages');
            
            // If single page, automatically select it; if multi-page, will need manual selection
            if (pdf.numPages === 1) {
              console.log('  -> Single page detected, auto-selecting');
              newFiles.push({ file, pages: [1] });
            } else {
              console.log('  -> Multi-page detected, will require page selection');
              newFiles.push({ file });
              needsPageSelection = true;
            }
          } catch (err) {
            console.error('Error reading PDF:', file.name, err);
            notifyError(`Failed to read PDF: ${file.name}`);
            continue;
          }
        }
        
        console.log('Files to add:', newFiles.map(f => ({ name: f.file.name, pages: f.pages })));
        setFiles(prev => [...prev, ...newFiles]);
        
        // If any multi-page PDF was added, show selector for the first one
        if (needsPageSelection && newFiles.length > 0) {
          const firstMultiPageIndex = newFiles.findIndex(f => !f.pages || f.pages.length === 0);
          console.log('needsPageSelection:', needsPageSelection, 'firstMultiPageIndex:', firstMultiPageIndex);
          if (firstMultiPageIndex !== -1) {
            setTimeout(() => {
              setSelectorIndex(firstMultiPageIndex);
              setShowPageSelector(true);
              console.log('Opening page selector for index:', firstMultiPageIndex);
            }, 100);
          }
        }
        
      } else {
        notifyError('Only .PDF files are accepted for this agent.');
      }
    }
  }, [notifyError]);

  const showPageSelectorForFile = (index: number) => {
    setSelectorIndex(index);
    setShowPageSelector(true);
  };

  const handlePagesSelected = (pages: number[]) => {
    if (selectorIndex === null) return;
    
    console.log('=== handlePagesSelected CALLED ===');
    console.log('Selected pages:', pages);
    console.log('For file index:', selectorIndex);
    console.log('File name:', files[selectorIndex]?.file.name);
    
    // Update the file with the selected pages
    const updatedFiles = [...files];
    updatedFiles[selectorIndex] = { ...updatedFiles[selectorIndex], pages };
    console.log('Updated file object:', { name: updatedFiles[selectorIndex].file.name, pages: updatedFiles[selectorIndex].pages });
    setFiles(updatedFiles);
    
    // After selecting pages, check if there are other multi-page PDFs that need selection
    const nextMultiPageIndex = updatedFiles.findIndex((f, i) => i > selectorIndex && (!f.pages || f.pages.length === 0));
    console.log('Next multi-page index:', nextMultiPageIndex);
    if (nextMultiPageIndex !== -1) {
      setTimeout(() => {
        setSelectorIndex(nextMultiPageIndex);
        setShowPageSelector(true);
        console.log('Opening page selector for next file at index:', nextMultiPageIndex);
      }, 100);
    } else {
      console.log('No more files needing page selection, closing modal');
      setShowPageSelector(false);
      setSelectorIndex(null);
    }
  };

  const processFiles = useCallback(async () => {
    if (files.length === 0) return;

    console.log('=== processFiles CALLED ===');
    console.log('Total files to process:', files.length);
    console.log('File details:', files.map((f, i) => ({ index: i, name: f.file.name, pages: f.pages, pageCount: f.pages?.length ?? 0 })));
    
    setIsParsing(true);
    setProgress('Initializing...');

    const processedFiles: SessionFile[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const { file, pages } = files[i];
        console.log(`Processing file ${i + 1}/${files.length}: ${file.name}`);
        console.log('  Pages array:', pages);
        console.log('  Pages is defined?', pages !== undefined);
        console.log('  Pages is array?', Array.isArray(pages));
        console.log('  Pages length:', pages?.length);
        
        if (!pages || pages.length === 0) {
          throw new Error(`File "${file.name}" has no pages selected. Please select pages before processing.`);
        }
        setProgress(`Processing ${file.name} (${i + 1}/${files.length})...`);
        console.log('About to call processPdfForMultimodal with pages:', pages);
        
        const reader = new FileReader();
        const fileDataPromise = new Promise<string>((resolve, reject) => {
            reader.onload = (event) => resolve(event.target?.result as string);
            reader.onerror = (error) => reject(error);
            reader.readAsDataURL(file);
        });
        const fileData = await fileDataPromise;
        
        const { text, rasterImageData } = await processPdfForMultimodal(file, (p) => {
            if (p.status === 'ocr_progress' && p.page && p.totalPages && p.progress) {
                const percent = Math.round(p.progress * 100);
                setProgress(`OCR on ${file.name} - Page ${p.page}/${p.totalPages} (${percent}%)`);
            }
        }, pages);
        
        console.log('Processing complete for', file.name, '- got', rasterImageData.length, 'images');
        processedFiles.push({ name: file.name, content: text, fileData: fileData, rasterImageData: rasterImageData, selectedPages: pages });
      }
      console.log('All files processed, calling onPlansSubmitted');
      onPlansSubmitted(processedFiles);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      notifyError(`Failed to process files: ${errorMessage}`);
    } finally {
      setIsParsing(false);
      setProgress(null);
    }
  }, [files, notifyError, onPlansSubmitted]);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }, []);
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); }, []);
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); handleFiles(e.dataTransfer.files); }, []);
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { handleFiles(e.target.files); };
  const handleClick = () => { document.getElementById('plan-file-input')?.click(); };

  return (
    <UploadShell
      icon={DocumentDuplicateIcon}
      accent="#fb923c"
      title="Civil Plan Expert"
      description="Drop one or more PDF plan sheets. The agent reads them and helps you extract and calculate the data you need."
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

      <UploadPanel>
        <UploadDropzone
          id="plan-file-input"
          accept=".pdf,application/pdf"
          multiple
          onFiles={(selected) => handleFiles(selected)}
          onDrop={handleDrop}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          isDragging={isDragging}
          title="Drop PDF plan sheets here"
          hint="or click to browse · multi-page sheets are supported"
        />

        <div className="mt-3">
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
            title="Plan sheets"
          />
        </div>
      </UploadPanel>

      {isParsing ? (
        <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2.5">
          <span className="h-3.5 w-3.5 flex-shrink-0 animate-spin rounded-full border-2 border-orange-300 border-t-transparent" />
          <span className="min-w-0 truncate font-mono text-[11px] text-slate-400">{progress || 'Processing…'}</span>
        </div>
      ) : (
        <UploadActionBar note={files.length === 0 ? 'No plan sheets selected yet' : `${files.length} sheet${files.length === 1 ? '' : 's'} ready`}>
          <UploadPrimaryButton onClick={processFiles} disabled={files.length === 0}>
            Process {files.length} plan{files.length !== 1 && 's'}
          </UploadPrimaryButton>
        </UploadActionBar>
      )}
    </UploadShell>
  );
};

export default PlanInput;
