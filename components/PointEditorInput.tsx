
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { PlumbBobIcon } from './icons';
import { UploadShell, UploadPanel, UploadDropzone, UploadPrimaryButton, UploadGhostButton } from './UploadShell.tsx';
import { type SurveyPoint } from '../types.ts';
import { useErrorReporter } from '../contexts/AppStateContext';

interface PointEditorInputProps {
  onSessionStart: () => void;
  onGoBack: () => void;
  onPointsUploaded?: (points: SurveyPoint[], fileName: string) => void;
  /** When true, the upload file picker is opened automatically once on mount (driven by the "Load Points" CTA on the home screen). */
  autoOpenUpload?: boolean;
  /** Called after the auto-open has been honored so the parent can reset its flag. */
  onAutoOpenHandled?: () => void;
}

const isSupportedPointFile = (file: File): boolean =>
  file.name.toLowerCase().endsWith('.csv') ||
  file.name.toLowerCase().endsWith('.txt') ||
  file.type === 'text/plain' ||
  file.type === 'text/csv';

const parsePointFile = (content: string): SurveyPoint[] => {
    const points: SurveyPoint[] = [];
    const lines = content.trim().split('\n');
    
    for (const line of lines) {
        const cleanedLine = line.trim();
        if (!cleanedLine || /^[a-zA-Z#]/.test(cleanedLine)) continue; // skip empty lines and headers

        const parts = cleanedLine.split(/[,\s]+/).filter(Boolean);
        if (parts.length < 3) continue;

        const pn = parts[0];
        const n = parseFloat(parts[1]);
        const e = parseFloat(parts[2]);
        const z = parts.length > 3 ? parseFloat(parts[3]) : 0;
        const d = parts.length > 4 ? parts.slice(4).join(' ') : '';

        if (pn && !isNaN(n) && !isNaN(e)) {
            points.push({
                pointNumber: pn,
                northing: n,
                easting: e,
                elevation: isNaN(z) ? 0 : z,
                description: d
            });
        }
    }
    return points;
};

const readFileAsText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string) ?? '');
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });

/**
 * Recursively walk a dropped folder tree (webkitGetAsEntry) and collect every File.
 * Falls back gracefully when the browser does not expose the entries API.
 */
const readEntryFiles = (entry: any): Promise<File[]> => {
  if (!entry) return Promise.resolve([]);

  if (entry.isFile) {
    return new Promise((resolve) => {
      entry.file(
        (file: File) => resolve([file]),
        () => resolve([]),
      );
    });
  }

  if (entry.isDirectory) {
    const reader = entry.createReader();
    return new Promise((resolve) => {
      const allFiles: File[] = [];
      const readBatch = () => {
        reader.readEntries(async (entries: any[]) => {
          if (!entries.length) {
            resolve(allFiles);
            return;
          }
          const nested = await Promise.all(entries.map((child) => readEntryFiles(child)));
          nested.forEach((files) => allFiles.push(...files));
          readBatch(); // readEntries only returns a partial batch; keep reading until empty.
        }, () => resolve(allFiles));
      };
      readBatch();
    });
  }

  return Promise.resolve([]);
};

const PointEditorInput: React.FC<PointEditorInputProps> = ({ onSessionStart, onGoBack, onPointsUploaded, autoOpenUpload, onAutoOpenHandled }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const { reportError } = useErrorReporter();

  // Parse and aggregate every supported point file, then hand the combined set to the parent once.
  const handleFiles = useCallback(async (files: File[]) => {
    if (!onPointsUploaded) {
      // If no upload handler, just start a new session
      onSessionStart();
      return;
    }

    const supportedFiles = files.filter(isSupportedPointFile);
    if (supportedFiles.length === 0) {
      reportError({ title: 'Invalid file', message: 'No valid .csv or .txt point files were found in the selection.' });
      return;
    }

    setIsProcessing(true);
    try {
      const allPoints: SurveyPoint[] = [];
      const parsedFileNames: string[] = [];
      const failedFiles: string[] = [];

      for (const file of supportedFiles) {
        try {
          const content = await readFileAsText(file);
          const parsed = parsePointFile(content);
          if (parsed.length > 0) {
            allPoints.push(...parsed);
            parsedFileNames.push(file.name);
          }
        } catch {
          failedFiles.push(file.name);
        }
      }

      if (allPoints.length === 0) {
        reportError({ title: 'Import failed', message: 'Could not parse any points from the selected file(s). Please check the format (P,N,E,Z,D).' });
        return;
      }

      const summaryName =
        parsedFileNames.length === 1
          ? parsedFileNames[0]
          : `${parsedFileNames.length} files`;
      onPointsUploaded(allPoints, summaryName);

      if (failedFiles.length > 0) {
        reportError({ title: 'Some files skipped', message: `Some files could not be read and were skipped:\n${failedFiles.join('\n')}`, severity: 'warning' });
      }
    } finally {
      setIsProcessing(false);
    }
  }, [onPointsUploaded, onSessionStart, reportError]);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }, []);
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); }, []);
  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const items = e.dataTransfer.items;
    // Prefer the entries API so dropped folders (and their subfolders) are traversed recursively.
    if (items && items.length > 0 && typeof (items[0] as any).webkitGetAsEntry === 'function') {
      const entries = Array.from(items)
        .map((item) => (item as any).webkitGetAsEntry())
        .filter(Boolean);
      const fileGroups = await Promise.all(entries.map((entry) => readEntryFiles(entry)));
      const files = fileGroups.flat();
      if (files.length > 0) {
        await handleFiles(files);
        return;
      }
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFiles(Array.from(e.dataTransfer.files));
    }
  }, [handleFiles]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
    }
    e.target.value = ''; // allow re-selecting the same file/folder
  };
  const handleClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    } else {
      document.getElementById('point-editor-file-input')?.click();
    }
  };
  const handleFolderClick = (e: React.MouseEvent) => { e.stopPropagation(); folderInputRef.current?.click(); };

  // webkitdirectory / directory aren't in React's input typings and are unreliable via spread props,
  // so set them directly on the DOM node the moment it mounts. This is what puts the native picker
  // into folder-selection mode ("Select Folder") instead of a plain file dialog.
  const setFolderInput = useCallback((el: HTMLInputElement | null) => {
    folderInputRef.current = el;
    if (el) {
      el.setAttribute('webkitdirectory', '');
      el.setAttribute('directory', '');
      el.setAttribute('mozdirectory', '');
    }
  }, []);

  // The home-screen "Load Points" CTA sets autoOpenUpload; we intentionally do NOT auto-open a file
  // dialog here — just clear the parent's flag so the user can choose how to upload themselves.
  useEffect(() => {
    if (autoOpenUpload) onAutoOpenHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenUpload]);

  return (
    <UploadShell
      icon={PlumbBobIcon}
      accent="#facc15"
      title="Point Editor"
      description="Upload point files (.csv, .txt) or drop a whole folder — subfolders included. Or start empty and enter points by hand."
      onGoBack={onGoBack}
      backTitle="Go to Home Screen"
    >
      {/* Hidden inputs live OUTSIDE the drop zone: a programmatic .click() dispatches a click event
          that bubbles to ancestors, so keeping them inside the zone would re-trigger the zone's
          onClick (file picker) and override the folder picker. */}
      <input ref={fileInputRef} id="point-editor-file-input" type="file" multiple className="hidden" accept=".csv,.txt,text/plain,text/csv" onChange={handleFileChange} />
      <input ref={setFolderInput} type="file" className="hidden" onChange={handleFileChange} />

      <UploadPanel>
        <UploadDropzone
          onClick={handleClick}
          onFiles={(selected) => handleFiles(Array.from(selected ?? []))}
          onDrop={handleDrop}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          isDragging={isDragging}
          title={isProcessing ? 'Processing files…' : 'Drop point files or a folder here'}
          hint="P,N,E,Z,D format (.csv or .txt) — subfolders included"
        >
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <UploadGhostButton onClick={(e) => { e.stopPropagation(); handleClick(); }}>
              Choose files
            </UploadGhostButton>
            <UploadGhostButton onClick={handleFolderClick}>
              Choose folder
            </UploadGhostButton>
          </div>
        </UploadDropzone>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-3">
          <p className="text-[11.5px] text-slate-400">No file handy? Key the points in by hand instead.</p>
          <UploadPrimaryButton onClick={onSessionStart}>Start empty session</UploadPrimaryButton>
        </div>
      </UploadPanel>
    </UploadShell>
  );
};

export default PointEditorInput;
