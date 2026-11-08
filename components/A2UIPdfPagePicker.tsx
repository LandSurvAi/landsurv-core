import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@5.4.394/build/pdf.worker.mjs`;

/** Keep the inline picker cheap — deed page sets are usually small, but a
 *  300-page scanned bundle should not rasterize every page in chat. */
const MAX_THUMBNAILS = 32;

export interface A2UIPdfPagePickerProps {
  file: File;
  /** Pages to preselect (1-based). Defaults to page 1. */
  initialSelected?: number[];
  /** Continue with the chosen pages. Single-page PDFs auto-confirm. */
  onConfirm: (pages: number[]) => void;
  onCancel: () => void;
  busy?: boolean;
}

/**
 * Inline, chat-sized PDF page selector used by the Boundary Agent intake.
 * Unlike the legacy full-screen modal this renders as a normal A2UI card:
 * compact header, tappable thumbnails, and a single pulsing continue action.
 */
export const A2UIPdfPagePicker: React.FC<A2UIPdfPagePickerProps> = ({
  file,
  initialSelected,
  onConfirm,
  onCancel,
  busy = false,
}) => {
  const [numPages, setNumPages] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(initialSelected && initialSelected.length > 0 ? initialSelected : [1])
  );
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const autoConfirmedRef = useRef(false);
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  useEffect(() => {
    let cancelled = false;
    let pdf: pdfjsLib.PDFDocumentProxy | null = null;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const arrayBuffer = await file.arrayBuffer();
        pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        if (cancelled) return;
        setNumPages(pdf.numPages);

        if (pdf.numPages === 1) {
          if (!autoConfirmedRef.current) {
            autoConfirmedRef.current = true;
            onConfirmRef.current([1]);
          }
          return;
        }

        // Keep the initial selection inside the real page range.
        setSelected(prev => {
          const next = new Set(Array.from(prev).filter(p => p >= 1 && p <= pdf!.numPages));
          return next.size > 0 ? next : new Set([1]);
        });

        const thumbs: string[] = [];
        const count = Math.min(pdf.numPages, MAX_THUMBNAILS);
        for (let pageNumber = 1; pageNumber <= count; pageNumber++) {
          if (cancelled) return;
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 0.3 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (context) {
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: context, viewport, canvas }).promise;
            thumbs.push(canvas.toDataURL('image/jpeg', 0.72));
          }
          page.cleanup();
          if (pageNumber % 4 === 0) {
            setThumbnails([...thumbs]);
            // Let the browser paint between page renders.
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }
        if (!cancelled) {
          setThumbnails(thumbs);
          setIsLoading(false);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('[A2UIPdfPagePicker] Failed to load PDF', err);
        setError('Could not read this PDF. Try another copy or process it from the full viewer.');
        setIsLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
      void pdf?.destroy();
    };
  }, [file]);

  const togglePage = (page: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(page)) {
        if (next.size === 1) return prev; // keep at least one page selected
        next.delete(page);
      } else {
        next.add(page);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelected(prev => (prev.size === numPages ? new Set([1]) : new Set(Array.from({ length: numPages }, (_, i) => i + 1))));
  };

  const orderedPages = Array.from(selected).sort((a, b) => a - b);

  return (
    <div data-testid="a2ui-pdf-page-picker" className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400 animate-pulse" />
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-cyan-400/90">
              Select deed pages
            </span>
          </div>
          <p className="mt-0.5 truncate text-[10px] font-semibold text-white/80" title={file.name}>
            {file.name}
          </p>
          <p className="text-[9px] text-white/40">
            {isLoading ? 'Reading page thumbnails…' : `${numPages} pages · choose only the description pages`}
          </p>
        </div>
        <button
          type="button"
          data-no-drag
          onClick={onCancel}
          className="shrink-0 text-[9px] font-medium text-white/45 transition-colors hover:text-white"
        >
          Cancel
        </button>
      </div>

      {error ? (
        <p className="mt-2 rounded border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-200">
          {error}
        </p>
      ) : isLoading && numPages > 1 ? (
        <div className="mt-2 grid grid-cols-4 gap-1.5" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="aspect-[3/4] animate-pulse rounded border border-white/10 bg-white/[0.04]" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[9px] text-white/45">
              <span className="font-bold text-cyan-200">{selected.size}</span> of {numPages} selected
            </span>
            <button
              type="button"
              data-no-drag
              onClick={selectAll}
              className="rounded border border-white/15 px-1.5 py-0.5 text-[9px] font-semibold text-white/60 transition-colors hover:border-white/30 hover:text-white"
            >
              {selected.size === numPages ? 'Clear to page 1' : 'Select all'}
            </button>
          </div>

          <div className="mt-1.5 grid max-h-[260px] grid-cols-4 gap-1.5 overflow-y-auto pr-0.5">
            {Array.from({ length: numPages }).map((_, index) => {
              const pageNumber = index + 1;
              const isSelected = selected.has(pageNumber);
              const thumb = thumbnails[index];
              return (
                <button
                  key={pageNumber}
                  type="button"
                  data-no-drag
                  onClick={() => togglePage(pageNumber)}
                  aria-pressed={isSelected}
                  title={isSelected ? `Remove page ${pageNumber}` : `Add page ${pageNumber}`}
                  className={`group relative overflow-hidden rounded border transition-all ${
                    isSelected
                      ? 'border-cyan-400/80 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(34,211,238,0.22)]'
                      : 'border-white/10 bg-black/20 hover:border-white/30'
                  }`}
                >
                  {thumb ? (
                    <img src={thumb} alt={`Page ${pageNumber}`} className="aspect-[3/4] w-full object-cover" />
                  ) : (
                    <div className="flex aspect-[3/4] items-center justify-center bg-white/[0.03] text-[9px] text-white/35">
                      Page {pageNumber}
                    </div>
                  )}
                  <span className="absolute inset-x-0 bottom-0 bg-black/65 px-1 py-0.5 text-left text-[8.5px] font-semibold text-white/80">
                    p.{pageNumber}
                  </span>
                  {isSelected && (
                    <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-cyan-400 text-[8px] font-black text-gray-950">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            data-no-drag
            disabled={busy || selected.size === 0}
            onClick={() => onConfirm(orderedPages)}
            className="group relative mt-2 flex h-8 w-full items-center justify-center gap-1.5 overflow-hidden rounded-lg border border-cyan-400/60 bg-slate-950 px-2.5 text-[10.5px] font-semibold text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_6px_22px_-4px_rgba(6,182,212,0.3)] transition-all hover:border-cyan-300 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy ? (
              <>
                <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
                Reading selected pages…
              </>
            ) : (
              <>
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
                Continue with {selected.size} page{selected.size === 1 ? '' : 's'}
                <span aria-hidden="true" className="text-cyan-400 transition-transform duration-200 group-hover:translate-x-1">→</span>
              </>
            )}
          </button>
        </>
      )}
    </div>
  );
};

export default A2UIPdfPagePicker;
