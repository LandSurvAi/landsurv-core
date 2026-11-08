import React, { useCallback, useRef, useState } from 'react';
import type { SessionFile } from '../types.ts';
import type { OcrProgress } from '../utils/pdfUtils.ts';
import { combineDeedFiles } from '../utils/deedSessionFiles.ts';
// Lazy so non-PDF intakes (and tests) never pull in the pdfjs DOM bundle.
const A2UIPdfPagePicker = React.lazy(() => import('./A2UIPdfPagePicker.tsx'));

export interface BoundaryDeedIntakeProps {
  variant?: 'quick' | 'inline';
  onDeedSubmitted?: (file: SessionFile) => void | Promise<void>;
  onDeedBatchSubmitted?: (files: SessionFile[]) => void | Promise<void>;
  onStartFromScratch?: () => void;
  onOpenGis?: () => void;
  /** Fallback when no deed host handler is present (quick thought test / legacy host). */
  onUploadFallback?: () => void;
  onPasteFallback?: (text: string) => void;
  onOpenConversation?: () => void;
  disabled?: boolean;
}

type IntakeStage = 'actions' | 'paste' | 'files' | 'pages';

const ACCEPT_FILES =
  '.pdf,.png,.jpg,.jpeg,.gif,.bmp,.webp,.tif,.tiff,.txt,.md,.markdown,application/pdf,image/png,image/jpeg,image/gif,image/bmp,image/webp,image/tiff,text/plain,text/markdown';

const actionClass =
  'group relative flex h-8 min-w-0 items-center justify-center gap-1.5 overflow-hidden rounded-lg border border-cyan-400/60 bg-slate-950 px-2.5 text-[10.5px] font-semibold text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_6px_22px_-4px_rgba(6,182,212,0.3)] transition-all hover:border-cyan-300 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-45';

const isPdfFile = (file: File) =>
  file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

const isImageFile = (file: File) =>
  /\.(?:png|jpe?g|gif|bmp|webp|tiff?)$/i.test(file.name) ||
  /^image\/(?:png|jpeg|gif|bmp|webp|tiff)$/i.test(file.type);

const isTextFile = (file: File) =>
  /\.(?:txt|md|markdown)$/i.test(file.name) ||
  file.type === 'text/plain' ||
  file.type === 'text/markdown';

const isSupportedFile = (file: File) =>
  isPdfFile(file) || isImageFile(file) || isTextFile(file);

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function progressLabel(progress: OcrProgress): string {
  if (progress.status === 'extracting_text') return 'extracting text';
  if (progress.status === 'ocr_progress') {
    const percent =
      typeof progress.progress === 'number'
        ? ` (${Math.round(progress.progress * 100)}%)`
        : '';
    return `OCR page ${progress.page ?? 1}/${progress.totalPages ?? 1}${percent}`;
  }
  if (progress.status === 'done') return 'finishing';
  return 'reading document';
}

async function processDeedFile(
  file: File,
  onProgress: (progress: OcrProgress) => void,
  selectedPages?: number[],
): Promise<SessionFile> {
  if (isPdfFile(file)) {
    const fileData = await readFileAsDataUrl(file);
    const { processPdfForMultimodal } = await import('../utils/pdfUtils.ts');
    const result = await processPdfForMultimodal(file, onProgress, selectedPages);
    if (!result.text.trim()) {
      throw new Error(`No text could be extracted from ${file.name}.`);
    }
    return {
      name: file.name,
      content: result.text,
      fileData,
      rasterImageData: result.rasterImageData,
      pdfLayerNames: result.layerNames,
      pdfDashPatterns: result.dashPatterns,
      selectedPages,
    };
  }

  if (isImageFile(file)) {
    const fileData = await readFileAsDataUrl(file);
    const { processRasterImageForMultimodal } = await import('../utils/pdfUtils.ts');
    const result = await processRasterImageForMultimodal(file, onProgress);
    if (!result.text.trim()) {
      throw new Error(`No text could be extracted from ${file.name}.`);
    }
    return {
      name: file.name,
      content: result.text,
      fileData,
      rasterImageData: result.rasterImageData,
    };
  }

  if (isTextFile(file)) {
    return { name: file.name, content: await readFileAsText(file) };
  }

  throw new Error(`Unsupported file type: ${file.name}. Use PDF, image, TXT, or MD.`);
}

/**
 * Compact Boundary Agent intake shared by the inline A2UI card and Quick Thought.
 * Actions stay on one row/panel; paste and file selection expand into a follow-up
 * processing step instead of porting the full-screen uploader into the chat.
 */
export const BoundaryDeedIntake: React.FC<BoundaryDeedIntakeProps> = ({
  variant = 'inline',
  onDeedSubmitted,
  onDeedBatchSubmitted,
  onStartFromScratch,
  onOpenGis,
  onUploadFallback,
  onPasteFallback,
  onOpenConversation,
  disabled = false,
}) => {
  const [stage, setStage] = useState<IntakeStage>('actions');
  const [pastedText, setPastedText] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pageSelections, setPageSelections] = useState<Record<number, number[]>>({});
  const [pageIndex, setPageIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const setFolderInput = useCallback((el: HTMLInputElement | null) => {
    folderInputRef.current = el;
    if (el) {
      el.setAttribute('webkitdirectory', '');
      el.setAttribute('directory', '');
    }
  }, []);

  const canUpload = Boolean(onDeedSubmitted || onDeedBatchSubmitted);
  const canPaste = Boolean(onDeedSubmitted || onPasteFallback);
  const canPickFiles = canUpload || Boolean(onUploadFallback);
  const isQuick = variant === 'quick';
  const stageCopy = isQuick
    ? {
        ready: 'Ready to process',
        busy: 'Processing…',
        pasteAction: 'Process description',
        fileAction: (count: number) => (count === 1 ? 'Process document' : `Process ${count} files`),
      }
    : {
        ready: 'Ready to draft',
        busy: 'Drafting…',
        pasteAction: 'Draft boundary',
        fileAction: (count: number) => `Draft ${count} file${count === 1 ? '' : 's'}`,
      };

  const handlePickedFiles = (list: FileList | File[] | null) => {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    if (!canUpload) {
      onUploadFallback?.();
      return;
    }
    const supported = files.filter(isSupportedFile);
    const skipped = files.length - supported.length;
    if (supported.length === 0) {
      setError('Unsupported file type. Use PDF, PNG, JPG, TIFF, BMP, WebP, TXT, or MD.');
      return;
    }
    setPendingFiles(supported);
    setPageSelections({});
    setPageIndex(null);
    setError(skipped > 0 ? `${skipped} unsupported file${skipped === 1 ? '' : 's'} skipped.` : null);
    setStage('files');
  };

  const handleUploadClick = () => {
    if (!canUpload) {
      onUploadFallback?.();
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFolderClick = () => {
    if (!canUpload) {
      onUploadFallback?.();
      return;
    }
    folderInputRef.current?.click();
  };

  const processFiles = async (selections: Record<number, number[]>) => {
    if (busy || pendingFiles.length === 0) return;
    setBusy(true);
    setError(null);
    setStage('files');
    try {
      const processed: SessionFile[] = [];
      for (let i = 0; i < pendingFiles.length; i++) {
        const file = pendingFiles[i];
        setProgress(`Reading ${i + 1}/${pendingFiles.length}: ${file.name}`);
        processed.push(
          await processDeedFile(
            file,
            update => {
              setProgress(`${file.name} · ${progressLabel(update)}`);
            },
            isPdfFile(file) ? selections[i] : undefined,
          ),
        );
      }
      setProgress('Sending to the Boundary Agent…');
      if (processed.length > 1 && onDeedBatchSubmitted) {
        await onDeedBatchSubmitted(processed);
      } else if (processed.length > 1) {
        await onDeedSubmitted?.(combineDeedFiles(processed));
      } else if (processed[0] && onDeedSubmitted) {
        await onDeedSubmitted(processed[0]);
      }
      setPendingFiles([]);
      setPageSelections({});
      setPageIndex(null);
      setStage('actions');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process those files.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const handleDraftFiles = () => {
    if (busy || pendingFiles.length === 0) return;
    const firstUnselectedPdf = pendingFiles.findIndex(
      (file, index) => isPdfFile(file) && !pageSelections[index]
    );
    if (firstUnselectedPdf >= 0) {
      setError(null);
      setPageIndex(firstUnselectedPdf);
      setStage('pages');
      return;
    }
    void processFiles(pageSelections);
  };

  const handlePagesConfirmed = (pages: number[]) => {
    if (pageIndex === null) return;
    const nextSelections = { ...pageSelections, [pageIndex]: pages };
    setPageSelections(nextSelections);
    const nextPdf = pendingFiles.findIndex(
      (file, index) => index > pageIndex && isPdfFile(file) && !nextSelections[index]
    );
    if (nextPdf >= 0) {
      setPageIndex(nextPdf);
      setStage('pages');
      return;
    }
    setPageIndex(null);
    setStage('files');
    void processFiles(nextSelections);
  };

  const handlePaste = async () => {
    const content = pastedText.trim();
    if (!content || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (onDeedSubmitted) {
        await onDeedSubmitted({ name: 'Pasted Deed', content });
      } else {
        onPasteFallback?.(content);
      }
      setPastedText('');
      setStage('actions');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit that legal description.');
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => {
    if (busy) return;
    setPageIndex(null);
    setStage('actions');
    setError(null);
  };

  return (
    <div
      data-testid="boundary-deed-intake"
      data-no-drag
      data-variant={variant}
      className={`rounded-lg border p-2 transition-colors ${
        isDragging
          ? 'border-emerald-400/60 bg-emerald-400/[0.07]'
          : 'border-white/10 bg-white/[0.02]'
      }`}
      onDragOver={event => {
        event.preventDefault();
        event.stopPropagation();
        if (!disabled && canUpload) setIsDragging(true);
      }}
      onDragLeave={event => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(false);
      }}
      onDrop={event => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(false);
        if (disabled) return;
        handlePickedFiles(event.dataTransfer.files);
      }}
    >
      <input
        ref={fileInputRef}
        data-testid="boundary-intake-file-input"
        type="file"
        multiple
        className="hidden"
        accept={ACCEPT_FILES}
        onChange={event => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          handlePickedFiles(files);
        }}
      />
      <input
        ref={setFolderInput}
        data-testid="boundary-intake-folder-input"
        type="file"
        multiple
        className="hidden"
        accept={ACCEPT_FILES}
        onChange={event => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          handlePickedFiles(files);
        }}
      />

      {stage === 'actions' && (
        <>
          <div data-testid="boundary-intake-actions" className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              data-no-drag
              data-testid="boundary-intake-upload"
              disabled={disabled || !canPickFiles}
              onClick={handleUploadClick}
              title="Upload a deed PDF, image, or text file"
              className={`${actionClass} col-span-2`}
            >
              <span>Upload deed files</span>
              <span aria-hidden="true" className="text-cyan-400 transition-transform duration-200 group-hover:translate-x-1">→</span>
            </button>
            <button
              type="button"
              data-no-drag
              data-testid="boundary-intake-paste"
              disabled={disabled || !canPaste}
              onClick={() => {
                setStage('paste');
                setError(null);
              }}
              className={actionClass}
            >
              Paste deed
            </button>
            <button
              type="button"
              data-no-drag
              data-testid="boundary-intake-folder"
              disabled={disabled || !canPickFiles}
              onClick={handleFolderClick}
              title="Choose a folder of deed files"
              className={actionClass}
            >
              Batch folder
            </button>
            <button
              type="button"
              data-no-drag
              data-testid="boundary-intake-blank"
              disabled={disabled || !onStartFromScratch}
              onClick={onStartFromScratch}
              title="Start a blank boundary in the Boundary Editor"
              className={actionClass}
            >
              Blank boundary
            </button>
            <button
              type="button"
              data-no-drag
              data-testid="boundary-intake-gis"
              disabled={disabled || !onOpenGis}
              onClick={onOpenGis}
              title="Look up a county tax parcel"
              className={actionClass}
            >
              GIS parcel
            </button>
          </div>
          <p className="mt-1.5 text-[9px] leading-snug text-white/40">
            PDF · image · TXT · MD — drop files here · multiple supported
          </p>
          {isQuick && onOpenConversation && (
            <button
              type="button"
              data-no-drag
              data-testid="boundary-intake-open-chat"
              onClick={onOpenConversation}
              className="mt-1 flex w-full items-center justify-end text-[9px] font-medium text-white/40 transition-colors hover:text-cyan-200"
            >
              Open conversation →
            </button>
          )}
        </>
      )}

      {stage === 'paste' && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-cyan-400/90">
              Paste legal description
            </span>
            <button
              type="button"
              data-no-drag
              disabled={busy}
              onClick={goBack}
              className="text-[9px] font-medium text-white/45 transition-colors hover:text-white disabled:opacity-45"
            >
              Back
            </button>
          </div>
          <textarea
            data-no-drag
            data-testid="boundary-intake-paste-textarea"
            rows={3}
            value={pastedText}
            onChange={event => setPastedText(event.target.value)}
            placeholder="BEGINNING AT A 5/8 INCH IRON ROD FOUND..."
            className="w-full resize-y rounded-md border border-white/15 bg-[#060d17] px-2 py-1.5 font-mono text-[10.5px] leading-relaxed text-white placeholder:text-white/30 outline-none transition-colors focus:border-cyan-400/50"
          />
          <button
            type="button"
            data-no-drag
            data-testid="boundary-intake-draft-paste"
            disabled={disabled || busy || !pastedText.trim() || !canPaste}
            onClick={() => void handlePaste()}
            className={`${actionClass} w-full`}
          >
            <span>{busy ? stageCopy.busy : stageCopy.pasteAction}</span>
            {!busy && (
              <span aria-hidden="true" className="text-cyan-400 transition-transform duration-200 group-hover:translate-x-1">→</span>
            )}
          </button>
        </div>
      )}

      {stage === 'pages' && pageIndex !== null && pendingFiles[pageIndex] && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-cyan-400/90">
              Document {pageIndex + 1} of {pendingFiles.length}
            </span>
            <span className="text-[9px] text-white/35">
              {Object.keys(pageSelections).length} page set{Object.keys(pageSelections).length === 1 ? '' : 's'} chosen
            </span>
          </div>
          <React.Suspense
            fallback={
              <div className="rounded-md border border-white/10 bg-white/[0.03] p-2 text-[10px] text-white/45">
                Loading page previews…
              </div>
            }
          >
            <A2UIPdfPagePicker
              key={pageIndex}
              file={pendingFiles[pageIndex]}
              initialSelected={pageSelections[pageIndex]}
              busy={busy}
              onConfirm={handlePagesConfirmed}
              onCancel={() => {
                if (busy) return;
                setPageIndex(null);
                setStage('files');
              }}
            />
          </React.Suspense>
        </div>
      )}

      {stage === 'files' && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-cyan-400/90">
              {stageCopy.ready}
            </span>
            <button
              type="button"
              data-no-drag
              disabled={busy}
              onClick={() => {
                setPendingFiles([]);
                setPageSelections({});
                setPageIndex(null);
                goBack();
              }}
              className="text-[9px] font-medium text-white/45 transition-colors hover:text-white disabled:opacity-45"
            >
              Cancel
            </button>
          </div>
          <div className="space-y-0.5 rounded-md border border-white/10 bg-black/20 px-2 py-1.5">
            {pendingFiles.slice(0, 3).map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex min-w-0 items-center justify-between gap-2 text-[9.5px] text-white/70"
              >
                <span className="truncate">{file.name}</span>
                {isPdfFile(file) ? (
                  <button
                    type="button"
                    data-no-drag
                    onClick={() => {
                      setError(null);
                      setPageIndex(index);
                      setStage('pages');
                    }}
                    className="shrink-0 rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-amber-200 transition-colors hover:border-amber-300/60 hover:text-amber-100"
                    title="Choose or edit the pages processed for this PDF"
                  >
                    {pageSelections[index]
                      ? `p.${pageSelections[index].join(',')} · edit`
                      : 'Choose pages'}
                  </button>
                ) : (
                  <span className="shrink-0 uppercase text-white/30">
                    {isImageFile(file) ? 'Image' : 'Text'}
                  </span>
                )}
              </div>
            ))}
            {pendingFiles.length > 3 && (
              <p className="text-[9px] text-white/40">+{pendingFiles.length - 3} more files</p>
            )}
          </div>
          {progress && (
            <p data-testid="boundary-intake-progress" className="truncate text-[9px] text-white/45">
              {progress}
            </p>
          )}
          <button
            type="button"
            data-no-drag
            data-testid="boundary-intake-draft-files"
            disabled={disabled || busy}
            onClick={() => void handleDraftFiles()}
            className={`${actionClass} w-full`}
          >
            <span>{busy ? stageCopy.busy : stageCopy.fileAction(pendingFiles.length)}</span>
            {!busy && (
              <span aria-hidden="true" className="text-cyan-400 transition-transform duration-200 group-hover:translate-x-1">→</span>
            )}
          </button>
          <p className="text-[9px] leading-snug text-white/40">
            PDFs prompt for pages next · multiple files are read together.
          </p>
        </div>
      )}

      {error && (
        <p data-testid="boundary-intake-error" className="mt-1 text-[9px] leading-snug text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
};

export default BoundaryDeedIntake;
