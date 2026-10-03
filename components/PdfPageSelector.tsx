import React, { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { useAppState } from '../contexts/AppStateContext.tsx';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@5.4.394/build/pdf.worker.mjs`;

interface PdfPageSelectorProps {
  file: File;
  onSelect: (pages: number[]) => void;
  onCancel: () => void;
}

interface PagePreview {
  pageNum: number;
  dataUrl: string;
}

const PdfPageSelector: React.FC<PdfPageSelectorProps> = ({ file, onSelect, onCancel }) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set([1]));
  const [isLoading, setIsLoading] = useState(true);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [expandedPreview, setExpandedPreview] = useState<PagePreview | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { addNotification } = useAppState();

  useEffect(() => {
    const loadPdf = async () => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument(arrayBuffer);
        const pdf = await loadingTask.promise;
        
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
        
        // Generate thumbnails
        const thumbs: string[] = [];
        for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 0.25 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          
          if (context) {
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            await page.render({
              canvasContext: context,
              viewport: viewport,
              canvas: canvas,
            }).promise;
            
            thumbs.push(canvas.toDataURL('image/jpeg', 0.7));
          }
          page.cleanup();
        }
        
        setThumbnails(thumbs);
        setIsLoading(false);
      } catch (err) {
        console.error('Error loading PDF:', err);
        addNotification({ kind: 'pdf-selector', severity: 'error', title: 'PDF Selector', message: 'Failed to load PDF file' });
        setIsLoading(false);
      }
    };

    loadPdf();
  }, [file]);

  const handleSelectPage = (page: number) => {
    const newSelected = new Set(selectedPages);
    if (newSelected.has(page)) {
      newSelected.delete(page);
      if (newSelected.size === 0) {
        newSelected.add(page); // Keep at least one selected
      }
    } else {
      newSelected.add(page);
    }
    setSelectedPages(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedPages.size === numPages) {
      setSelectedPages(new Set([1])); // Reset to just first page
    } else {
      const all = new Set<number>();
      for (let i = 1; i <= numPages; i++) {
        all.add(i);
      }
      setSelectedPages(all);
    }
  };

  const handleExpandPreview = async (pageNum: number) => {
    if (!pdfDoc) return;
    
    try {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.0 }); // Higher quality for expanded view
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      if (context) {
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        await page.render({
          canvasContext: context,
          viewport: viewport,
          canvas: canvas,
        }).promise;
        
        setExpandedPreview({
          pageNum,
          dataUrl: canvas.toDataURL('image/jpeg', 0.9)
        });
      }
      page.cleanup();
    } catch (err) {
      console.error('Error generating expanded preview:', err);
    }
  };

  const handleSubmit = () => {
    const sortedPages = Array.from(selectedPages).sort((a, b) => a - b);
    console.log('PdfPageSelector.handleSubmit - selected pages for this file:', sortedPages);
    // Just notify parent of selection - parent handles the rest
    onSelect(sortedPages);
  };

  if (numPages === 1) {
    // Auto-select single page without showing modal
    if (!expandedPreview) {
      useEffect(() => {
        onSelect([1]);
      }, [onSelect]);
    }
    return null;
  }

  // Expanded preview modal
  if (expandedPreview) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
        <div className="bg-gray-800 border border-cyan-500/30 rounded-lg max-w-3xl w-full max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-gray-700 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">
              Preview - Page {expandedPreview.pageNum}
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => setExpandedPreview(null)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors font-semibold"
              >
                Close Preview
              </button>
            </div>
          </div>

          {/* Image */}
          <div className="flex-1 overflow-auto p-6 flex items-center justify-center">
            <img
              src={expandedPreview.dataUrl}
              alt={`Preview of page ${expandedPreview.pageNum}`}
              className="max-w-full max-h-full object-contain rounded-lg"
            />
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-700 flex items-center justify-center gap-4">
            {expandedPreview.pageNum > 1 && (
              <button
                onClick={() => {
                  handleExpandPreview(expandedPreview.pageNum - 1);
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors"
              >
                ← Previous Page
              </button>
            )}
            {expandedPreview.pageNum < numPages && (
              <button
                onClick={() => {
                  handleExpandPreview(expandedPreview.pageNum + 1);
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors"
              >
                Next Page →
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 border border-cyan-500/30 rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-700">
          <h2 className="text-2xl font-bold text-white mb-2">
            Select Pages from PDF
          </h2>
          <p className="text-gray-400">
            This PDF has {numPages} pages. Choose which page(s) to process:
          </p>
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center">
              <div className="w-8 h-8 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-300">Loading PDF pages...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Page Selection */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Select All Button */}
              <div className="mb-4">
                <button
                  onClick={handleSelectAll}
                  className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors border border-gray-600"
                >
                  {selectedPages.size === numPages ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              {/* Thumbnails Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {Array.from({ length: numPages }).map((_, idx) => {
                  const pageNum = idx + 1;
                  const isSelected = selectedPages.has(pageNum);
                  const hasThumb = idx < thumbnails.length;

                  return (
                    <div
                      key={pageNum}
                      className={`relative group rounded-lg overflow-hidden border-2 transition-all ${
                        isSelected
                          ? 'border-cyan-400 shadow-lg shadow-cyan-400/50'
                          : 'border-gray-600 hover:border-cyan-500'
                      }`}
                    >
                      {/* Thumbnail Button */}
                      <button
                        onClick={() => handleSelectPage(pageNum)}
                        className="w-full h-full absolute inset-0 z-10"
                        title={`Page ${pageNum}`}
                      />

                      {/* Thumbnail Image */}
                      {hasThumb ? (
                        <img
                          src={thumbnails[idx]}
                          alt={`Page ${pageNum}`}
                          className="w-full aspect-square object-cover pointer-events-none"
                        />
                      ) : (
                        <div className="w-full aspect-square bg-gray-700 flex items-center justify-center pointer-events-none">
                          <span className="text-gray-400">Page {pageNum}</span>
                        </div>
                      )}

                      {/* Page Number Badge */}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 pointer-events-none">
                        <p className="text-white text-xs font-semibold">Page {pageNum}</p>
                      </div>

                      {/* Selection Indicator */}
                      {isSelected && (
                        <div className="absolute inset-0 flex items-center justify-center bg-cyan-400/10 border-2 border-cyan-400 pointer-events-none">
                          <div className="w-6 h-6 rounded-full bg-cyan-400 flex items-center justify-center">
                            <svg
                              className="w-4 h-4 text-gray-900"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </div>
                        </div>
                      )}

                      {/* Expand Preview Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExpandPreview(pageNum);
                        }}
                        className="absolute top-2 right-2 p-1 bg-cyan-500 hover:bg-cyan-600 text-white rounded transition-colors opacity-0 group-hover:opacity-100 z-20"
                        title="Expand preview"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6v10h10v-4m11-5v10h-10V5z" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-6 border-t border-gray-700 flex justify-between gap-4">
              <button
                onClick={onCancel}
                className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors font-semibold"
              >
                Cancel
              </button>
              <div className="text-gray-400 flex items-center">
                <span className="text-sm">
                  {selectedPages.size} page{selectedPages.size !== 1 ? 's' : ''} selected
                </span>
              </div>
              <button
                onClick={handleSubmit}
                className="px-6 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors font-semibold"
              >
                Confirm Selection
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PdfPageSelector;
