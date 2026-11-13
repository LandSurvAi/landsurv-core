import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { A2UIHostContextValue } from './A2UISurface.tsx';
import {
  type A2UIWidgetType,
  type SessionFile,
  type SurveyPoint,
} from '../types.ts';

/**
 * Upload widgets that can share the generic card-level drop target. Deed and
 * Standards Compliance own their drops because they need page selection and
 * local check/source state.
 */
const A2UI_FILE_DROP_WIDGETS: ReadonlySet<A2UIWidgetType> = new Set([
  'cad-manager-intake',
  'point-upload',
  'raw-upload',
  'civil-drafter-upload',
  'dxf-upload',
  'centerline-upload',
  'plan-upload',
  'image-upload',
  'gis-upload',
  'title-search-upload',
]);

export const isA2UIFileDropWidget = (widgetType?: A2UIWidgetType): boolean =>
  Boolean(widgetType && A2UI_FILE_DROP_WIDGETS.has(widgetType));

const isPdfFile = (file: File) =>
  file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

const isImageFile = (file: File) =>
  file.type.startsWith('image/') || /\.(?:png|jpe?g|gif|bmp|webp|tiff?)$/i.test(file.name);

const isTextFile = (file: File) =>
  file.type === 'text/plain' ||
  file.type === 'text/markdown' ||
  /\.(?:txt|md|markdown)$/i.test(file.name);

const isPointFile = (file: File) =>
  /\.(?:csv|txt)$/i.test(file.name) || file.type === 'text/plain' || file.type === 'text/csv';

const CAD_STANDARDS_FILE_RE =
  /\.(?:lay|dsc|lin|json|md|markdown|csv|txt|xml|fxl|fcl)$/i;

export function parsePointFileContent(content: string): SurveyPoint[] {
  const points: SurveyPoint[] = [];
  const lines = content.trim().split(/\r?\n/);

  for (const line of lines) {
    const cleanedLine = line.trim();
    if (!cleanedLine || /^[a-zA-Z#]/.test(cleanedLine)) continue;

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
        description: d,
      });
    }
  }
  return points;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => resolve((event.target?.result as string) ?? '');
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => resolve((event.target?.result as string) ?? '');
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/** Recursively walk a dropped folder tree (webkitGetAsEntry) and collect files. */
async function readEntryFiles(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise(resolve => {
      (entry as FileSystemFileEntry).file(
        file => resolve([file]),
        () => resolve([]),
      );
    });
  }

  if (!entry.isDirectory) return [];
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const files: File[] = [];

  while (true) {
    const batch = await new Promise<FileSystemEntry[]>(resolve => {
      reader.readEntries(entries => resolve(entries), () => resolve([]));
    });
    if (batch.length === 0) break;
    for (const child of batch) {
      files.push(...(await readEntryFiles(child)));
    }
  }

  return files;
}

async function filesFromDataTransfer(
  dataTransfer: DataTransfer,
  allowDirectories: boolean,
): Promise<File[]> {
  if (allowDirectories) {
    const items = dataTransfer.items;
    const canReadEntries =
      items &&
      items.length > 0 &&
      typeof (items[0] as DataTransferItem & {
        webkitGetAsEntry?: () => FileSystemEntry | null;
      }).webkitGetAsEntry === 'function';

    if (canReadEntries) {
      const entries = Array.from(items)
        .map(item =>
          (item as DataTransferItem & {
            webkitGetAsEntry?: () => FileSystemEntry | null;
          }).webkitGetAsEntry?.(),
        )
        .filter((entry): entry is FileSystemEntry => Boolean(entry));

      if (entries.length > 0) {
        const groups = await Promise.all(entries.map(readEntryFiles));
        const files = groups.flat();
        if (files.length > 0) return files;
      }
    }
  }

  return Array.from(dataTransfer.files ?? []);
}

async function titleSearchSessionFile(file: File): Promise<SessionFile | null> {
  if (isTextFile(file)) {
    return { name: file.name, content: await readFileAsText(file) };
  }

  if (isPdfFile(file)) {
    const fileData = await readFileAsDataUrl(file);
    const { processPdfForMultimodal } = await import('../utils/pdfUtils.ts');
    const result = await processPdfForMultimodal(file, () => {});
    if (!result.text.trim()) return null;
    return {
      name: file.name,
      content: result.text,
      fileData,
      rasterImageData: result.rasterImageData,
    };
  }

  if (isImageFile(file)) {
    const fileData = await readFileAsDataUrl(file);
    const { processRasterImageForMultimodal } = await import('../utils/pdfUtils.ts');
    const result = await processRasterImageForMultimodal(file, () => {});
    if (!result.text.trim()) return null;
    return {
      name: file.name,
      content: result.text,
      fileData,
      rasterImageData: result.rasterImageData,
    };
  }

  return null;
}

export async function routeA2UIFileDrop(
  files: File[],
  widgetType: A2UIWidgetType,
  host: A2UIHostContextValue,
): Promise<void> {
  if (files.length === 0) return;
  const file = files[0];

  switch (widgetType) {
    case 'cad-manager-intake': {
      if (!CAD_STANDARDS_FILE_RE.test(file.name)) return;
      if (host.onCadManagerFileUploaded) {
        host.onCadManagerFileUploaded(await readFileAsText(file), file.name);
      } else {
        host.onCadManagerSessionStart?.();
      }
      return;
    }
    case 'point-upload': {
      if (!host.onPointsUploaded) return;
      const allPoints: SurveyPoint[] = [];
      const names: string[] = [];
      for (const candidate of files) {
        if (!isPointFile(candidate)) continue;
        try {
          const points = parsePointFileContent(await readFileAsText(candidate));
          if (points.length > 0) {
            allPoints.push(...points);
            names.push(candidate.name);
          }
        } catch {
          /* skip unreadable file */
        }
      }
      if (allPoints.length > 0) {
        host.onPointsUploaded(
          allPoints,
          names.length === 1 ? names[0] : `${names.length} files`,
        );
      }
      return;
    }
    case 'raw-upload': {
      if (!/\.raw$/i.test(file.name) && file.type !== 'text/plain') return;
      host.onRawFileUploaded?.(await readFileAsText(file), file.name);
      return;
    }
    case 'civil-drafter-upload': {
      const isCivilText =
        /\.(?:raw|txt|csv|pts|pnezd)$/i.test(file.name) || file.type.startsWith('text/');
      if (isPdfFile(file)) {
        const fileData = await readFileAsDataUrl(file);
        host.onCivilDrafterPdfUploaded?.([
          {
            name: file.name,
            content: `PDF Plan: ${file.name}`,
            fileData,
            selectedPages: [1],
          },
        ]);
      } else if (isCivilText) {
        host.onCivilDrafterFileUploaded?.(await readFileAsText(file), file.name);
      }
      return;
    }
    case 'dxf-upload': {
      if (!/\.dxf$/i.test(file.name)) return;
      host.onDxfUploaded?.(await readFileAsText(file), file.name, {
        smoothSplines: false,
        quantizationBits: 16,
      });
      return;
    }
    case 'centerline-upload': {
      if (!/\.cl$/i.test(file.name) && file.type !== 'text/plain') return;
      host.onClFileUploaded?.(await readFileAsText(file), file.name);
      return;
    }
    case 'plan-upload': {
      if (!host.onPlansSubmitted) return;
      const processed: SessionFile[] = [];
      for (const candidate of files.filter(isPdfFile)) {
        const fileData = await readFileAsDataUrl(candidate);
        processed.push({
          name: candidate.name,
          content: `PDF Plan: ${candidate.name}`,
          fileData,
          selectedPages: [1],
        });
      }
      if (processed.length > 0) host.onPlansSubmitted(processed);
      return;
    }
    case 'image-upload': {
      if (!host.onImagesSubmitted) return;
      const processed: SessionFile[] = [];
      for (const candidate of files.filter(isImageFile)) {
        const fileData = await readFileAsDataUrl(candidate);
        processed.push({
          name: candidate.name,
          content: `Image file: ${candidate.name}`,
          fileData,
        });
      }
      if (processed.length > 0) host.onImagesSubmitted(processed);
      return;
    }
    case 'gis-upload': {
      if (!/\.(?:geojson|json)$/i.test(file.name)) return;
      host.onGisUploaded?.(await readFileAsText(file), file.name, 'file');
      return;
    }
    case 'title-search-upload': {
      const sessionFile = await titleSearchSessionFile(file);
      if (sessionFile) host.onTitleSearchDeedSubmitted?.(sessionFile);
      return;
    }
    default:
      return;
  }
}

function dragContainsFiles(event: React.DragEvent): boolean {
  const types = event.dataTransfer?.types;
  return Boolean(types && Array.from(types).includes('Files'));
}

export interface A2UIFileDropOptions {
  host: A2UIHostContextValue;
  widgetType?: A2UIWidgetType;
  enabled?: boolean;
}

/**
 * Makes an upload card a file drop target. Routing goes through the same host
 * callbacks as the card's file picker, and point uploads also walk dropped
 * folders recursively.
 */
export function useA2UIFileDrop({ host, widgetType, enabled }: A2UIFileDropOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);
  const canDrop = Boolean(
    widgetType && A2UI_FILE_DROP_WIDGETS.has(widgetType) && (enabled ?? true),
  );

  const resetDrag = useCallback(() => {
    dragDepthRef.current = 0;
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (!canDrop) return;
    const reset = () => {
      dragDepthRef.current = 0;
      setIsDragging(false);
    };
    window.addEventListener('drop', reset);
    window.addEventListener('dragend', reset);
    return () => {
      window.removeEventListener('drop', reset);
      window.removeEventListener('dragend', reset);
    };
  }, [canDrop]);

  const handlers = useMemo<React.DOMAttributes<HTMLDivElement>>(() => {
    if (!canDrop || !widgetType) return {};
    return {
      onDragEnter: event => {
        if (!dragContainsFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
        dragDepthRef.current += 1;
        setIsDragging(true);
      },
      onDragOver: event => {
        if (!dragContainsFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
        setIsDragging(true);
      },
      onDragLeave: event => {
        if (dragDepthRef.current === 0) return;
        event.preventDefault();
        event.stopPropagation();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setIsDragging(false);
      },
      onDrop: event => {
        if (event.defaultPrevented) return;
        event.preventDefault();
        event.stopPropagation();
        resetDrag();
        const dataTransfer = event.dataTransfer;
        if (!dataTransfer) return;
        void filesFromDataTransfer(dataTransfer, widgetType === 'point-upload').then(files => {
          if (files.length > 0) void routeA2UIFileDrop(files, widgetType, host);
        });
      },
    };
  }, [canDrop, host, resetDrag, widgetType]);

  const overlay = canDrop && isDragging ? (
    <div
      data-testid="a2ui-file-drop-overlay"
      className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-cyan-300/80 bg-[#0a1018]/95 px-4 text-center backdrop-blur-sm"
    >
      <span className="flex flex-col items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100">
          Drop to upload
        </span>
        <span className="text-[10px] text-cyan-100/65">
          The file will go to this upload.
        </span>
      </span>
    </div>
  ) : null;

  return { enabled: canDrop, isDragging, handlers, overlay, resetDrag };
}
