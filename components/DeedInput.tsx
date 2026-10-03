
import React, { useState, useCallback } from 'react';
import { CourthouseIcon, UploadIcon, HomeIcon } from './icons';
import { processPdfForMultimodal, processRasterImageForMultimodal, isRasterImageFile, type OcrProgress } from '../utils/pdfUtils';
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
}

interface FileWithPages {
  file: File;
  pages?: number[];
}

type InputMode = 'text' | 'files';

const DeedInput: React.FC<DeedInputProps> = ({ onDeedSubmitted, onDeedBatchSubmitted, onGoBack, backButtonTitle = 'Go to Home Screen', onStartFromScratch }) => {
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
          <span className="text-white">Deed</span><span className="text-green-400">Reader</span><span className="text-[0.5em]"><span className="text-gray-500">.</span><span className="text-white">Land</span><span className="text-cyan-400">Surv</span><span className="text-green-400">.ai</span></span><sup className="text-xl text-gray-500">™</sup>
      </h1>
      
      <div className="w-full max-w-2xl flex flex-col items-center gap-4">
        <p className="text-gray-400 mb-2">
          Paste the legal description or upload a PDF/image (including scans) for the AI to analyze and plot.
        </p>

        {/* Mode Switcher */}
        <div className="p-1 bg-gray-700 rounded-lg flex">
          <button 
            onClick={() => { setMode('text'); setFiles([]); }} 
            className={`px-4 py-1 rounded-md text-sm font-semibold transition-colors ${mode === 'text' ? 'bg-green-500 text-white' : 'text-gray-300 hover:bg-gray-600'}`}
          >
            Paste Text
          </button>
          <button 
            onClick={() => setMode('files')} 
            className={`px-4 py-1 rounded-md text-sm font-semibold transition-colors ${mode === 'files' ? 'bg-green-500 text-white' : 'text-gray-300 hover:bg-gray-600'}`}
          >
            Upload Files
          </button>
        </div>

        {mode === 'text' ? (
          <>
            <textarea
              value={deedText}
              onChange={(e) => setDeedText(e.target.value)}
              placeholder="e.g., COMMENCING AT A 5/8 INCH IRON ROD FOUND AT THE NORTHEAST CORNER OF SECTION 1..."
              className="w-full max-w-lg h-48 p-4 text-sm font-mono text-gray-200 bg-gray-900 border-2 border-gray-600 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
            />
            {deedText.trim() && (
                <button
                    onClick={handleSubmit}
                    disabled={isParsing}
                    className="px-8 py-3 text-lg font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors duration-200"
                >
                    {isParsing ? 'Processing...' : 'Process Deed'}
                </button>
            )}
          </>
        ) : (
          <>
            <div
              className={`w-full cursor-pointer flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-lg transition-colors duration-300 ${isDragging ? 'border-green-400 bg-gray-700/50' : 'border-gray-600 hover:border-green-500'}`}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={handleClick}
            >
              <input
                id="deed-file-input"
                type="file"
                className="hidden"
                accept=".pdf,.png,.jpg,.jpeg,.gif,.bmp,.webp,.tif,.tiff,application/pdf,image/png,image/jpeg,image/gif,image/bmp,image/webp,image/tiff"
                onChange={handleFileChange}
              />
              <UploadIcon className="w-16 h-16 mb-4 text-gray-500" />
              <h2 className="text-xl font-semibold text-white">Drop your PDF or image here</h2>
              <p className="text-gray-400 mt-2">Supported: PDF, PNG, JPG, GIF, TIFF, BMP, WebP (multiple files supported)</p>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleFolderClick(); }}
                className="mt-3 text-xs px-3 py-1.5 border border-gray-600 text-gray-300 rounded hover:border-cyan-500 hover:text-cyan-300 transition-colors"
              >
                Select Folder (batch)
              </button>
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
                          className="text-xs px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
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
                <div className="w-8 h-8 mx-auto border-4 border-green-400 border-t-transparent rounded-full animate-spin mb-4"></div>
                <h2 className="text-xl font-semibold text-white">Processing...</h2>
                <p className="text-green-300 mt-2 font-mono text-sm">{ocrProgress}</p>
              </div>
            ) : (
              <button
                onClick={processFiles}
                disabled={files.length === 0}
                className="px-8 py-3 text-lg font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors duration-200"
              >
                Process {files.length} File{files.length !== 1 && 's'}
              </button>
            )}
          </>
        )}

        {mode === 'text' && (
          <div className="mt-6 text-center text-gray-400">
            <p>
              Or,{' '}
              <button
                onClick={handleLoadExample}
                className="text-green-400 hover:text-green-300 font-semibold underline focus:outline-none focus:ring-2 focus:ring-green-500 rounded"
              >
                try our example deed.
              </button>
            </p>
          </div>
        )}

        {onStartFromScratch && (
          <div className="mt-4 text-center">
            <button
              onClick={onStartFromScratch}
              className="text-sm px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:border-green-500 hover:text-green-300 hover:bg-gray-800/60 transition-colors"
              title="Skip upload and enter bearings/distances by hand in the Boundary Editor"
            >
              Skip — start a blank boundary from scratch →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeedInput;