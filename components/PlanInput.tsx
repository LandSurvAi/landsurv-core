
import React, { useState, useCallback } from 'react';
import { DocumentDuplicateIcon, UploadIcon, HomeIcon } from './icons';
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
    <div className="relative flex flex-col items-center justify-center h-full p-8 text-center">
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

      <button onClick={onGoBack} className="absolute top-4 left-4 p-2 text-gray-300 hover:text-white transition-colors" title={backButtonTitle}>
        <HomeIcon className="w-6 h-6"/>
      </button>
      <h1 className="text-5xl sm:text-6xl font-extrabold leading-none tracking-tight text-center mb-4">
          <span className="text-white">Plan</span><span className="text-orange-400">Expert</span><span className="text-[0.5em]"><span className="text-gray-500">.</span><span className="text-white">Land</span><span className="text-cyan-400">Surv</span><span className="text-green-400">.ai</span></span><sup className="text-xl text-gray-500">™</sup>
      </h1>
      <p className="text-gray-300 mb-6 max-w-lg">Upload one or more PDF plan sheets. The AI will read them and help you extract and calculate data.</p>
      
      <div className="w-full max-w-2xl flex flex-col items-center gap-4">
        <div
          className={`w-full cursor-pointer flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-lg transition-colors duration-300 ${isDragging ? 'border-orange-400 bg-gray-700/50' : 'border-gray-600 hover:border-orange-500'}`}
          onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop} onClick={handleClick}
        >
          <input id="plan-file-input" type="file" className="hidden" accept=".pdf,application/pdf" multiple onChange={handleFileChange} />
          <UploadIcon className="w-16 h-16 mb-4 text-gray-500" />
          <h2 className="text-xl font-semibold text-white">Drop PDF Plan Sheets Here</h2>
          <p className="text-gray-400 mt-2">or click to browse local files</p>
        </div>

        {files.length > 0 && (
          <div className="w-full text-left bg-gray-900/50 p-3 rounded-lg border border-gray-700">
            <h4 className="font-semibold mb-2">Selected Files:</h4>
            <ul className="text-sm space-y-2">
              {files.map((fw, i) => (
                <li key={i} className="flex items-center justify-between p-2 bg-gray-800 rounded border border-gray-700">
                  <span className="truncate text-gray-300">{fw.file.name}</span>
                  {fw.pages && fw.pages.length > 0 ? (
                    <button
                      onClick={() => showPageSelectorForFile(i)}
                      className="text-xs px-2 py-1 bg-orange-600 hover:bg-orange-700 text-white rounded transition-colors"
                    >
                      {fw.pages.length} page{fw.pages.length !== 1 ? 's' : ''}
                    </button>
                  ) : (
                    <button
                      onClick={() => showPageSelectorForFile(i)}
                      className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                    >
                      Select pages
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {isParsing ? (
             <div className="mt-4 text-center">
                <div className="w-8 h-8 mx-auto border-4 border-orange-400 border-t-transparent rounded-full animate-spin mb-4"></div>
                <h2 className="text-xl font-semibold text-white">Processing...</h2>
                <p className="text-orange-300 mt-2 font-mono text-sm">{progress}</p>
              </div>
        ) : (
             <button
                onClick={processFiles}
                disabled={files.length === 0}
                className="mt-4 px-8 py-3 text-lg font-semibold text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors duration-200"
            >
                Process {files.length} Plan{files.length !== 1 && 's'}
            </button>
        )}      </div>
    </div>
  );
};

export default PlanInput;
