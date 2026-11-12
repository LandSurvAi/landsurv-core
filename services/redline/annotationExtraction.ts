/**
 * Redline Agent — Fast-mode annotation inventory.
 *
 * Reads the PDF annotation layer (Bluebeam / Acrobat markup objects) and the
 * text layer. Nothing here mutates the drawing; the result is a pure inventory
 * that the interpretation step turns into worklist items.
 */

import * as pdfjsLib from 'pdfjs-dist';
import type { RedlineMarkup, RedlineMarkupKind, RedlineSheet } from '../../types';
import { extractRedlineVisualMarkups } from '../geminiService';
import { buildDeepVisionMarkup, isDeepVisionDuplicate } from './deepVisionMarkup';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://esm.sh/pdfjs-dist@5.4.394/build/pdf.worker.mjs';

export interface RedlineSourceFile {
  name: string;
  /** `data:application/pdf;base64,...` */
  dataUrl: string;
}

export interface RedlineTextItem {
  sheetId: string;
  text: string;
  /** Top-left page-space insertion point. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RedlinePackageInventory {
  sheets: RedlineSheet[];
  markups: RedlineMarkup[];
  textItems: RedlineTextItem[];
  warnings: string[];
}

export interface RedlineExtractionOptions {
  /** Run a rendered-page vision pass after embedded annotations. */
  deep?: boolean;
  /** Configured model; the vision helper falls back for non-Gemini models. */
  model?: string;
  userApiKey?: string;
}

export interface RedlineExtractionProgress {
  fileIndex: number;
  fileCount: number;
  fileName: string;
  pageIndex: number;
  pageCount: number;
  markupsFound: number;
}

const PAGE_LIMIT = 20;
const BYTE_LIMIT = 50 * 1024 * 1024;

function decodePdfDataUrl(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('PDF file data is not a data URL.');
  const base64 = dataUrl.slice(comma + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function colorToHex(color: unknown): string | undefined {
  if (!color) return undefined;
  if (typeof color === 'string' && color.startsWith('#')) return color;
  if (Array.isArray(color) && color.length >= 3) {
    const [r, g, b] = color.slice(0, 3).map((value) => Math.max(0, Math.min(255, Number(value) || 0)));
    return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  }
  if (color instanceof Uint8Array && color.length >= 3) {
    return `#${Array.from(color.slice(0, 3)).map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  }
  return undefined;
}

function normalizeRect(rect: number[]): [number, number, number, number] {
  const x1 = Math.min(rect[0], rect[2]);
  const y1 = Math.min(rect[1], rect[3]);
  const x2 = Math.max(rect[0], rect[2]);
  const y2 = Math.max(rect[1], rect[3]);
  return [x1, y1, x2, y2];
}

/** Map a PDF annotation subtype to the Redline taxonomy. */
export function mapAnnotationSubtype(subtype: string, rect: [number, number, number, number]): RedlineMarkupKind {
  const normalized = (subtype || '').toLowerCase();
  const width = Math.abs(rect[2] - rect[0]);
  const height = Math.abs(rect[3] - rect[1]);

  switch (normalized) {
    case 'freetext':
      return 'callout';
    case 'text':
    case 'stamp':
    case 'caret':
      return 'note';
    case 'strikeout':
      return 'deletion';
    case 'highlight':
    case 'underline':
    case 'squiggly':
      return 'highlight';
    case 'square':
    case 'circle':
      return width > 24 && height > 24 ? 'cloud' : 'other';
    case 'polygon':
    case 'polyline':
      return 'cloud';
    case 'ink':
      return 'pointer';
    case 'line':
    case 'arrow':
      return 'pointer';
    default:
      return 'other';
  }
}

function annotationText(annotation: any): string {
  const direct = typeof annotation?.contents === 'string' ? annotation.contents : '';
  const rich = typeof annotation?.contentsObj?.str === 'string' ? annotation.contentsObj.str : '';
  const alt = typeof annotation?.richText?.str === 'string' ? annotation.richText.str : '';
  return (direct || rich || alt || '').replace(/\r\n/g, '\n').trim();
}

/**
 * Extract every visible annotation and every text-layer item from a package.
 * A malformed annotation or page is reported and skipped; it never aborts the
 * rest of the package.
 */
/** Render one PDF page for the Deep-mode vision pass. */
async function renderPageForVision(page: any): Promise<string> {
  if (typeof document === 'undefined') {
    throw new Error('Deep mode requires a browser canvas.');
  }
  const base = page.getViewport({ scale: 1 });
  const fitScale = Math.min(2, 1600 / Math.max(1, base.width));
  const viewport = page.getViewport({ scale: fitScale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable.');
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return canvas.toDataURL('image/jpeg', 0.82);
}

export async function extractRedlinePackage(
  files: RedlineSourceFile[],
  onProgress?: (progress: RedlineExtractionProgress) => void,
  options?: RedlineExtractionOptions,
): Promise<RedlinePackageInventory> {
  const sheets: RedlineSheet[] = [];
  const markups: RedlineMarkup[] = [];
  const textItems: RedlineTextItem[] = [];
  const warnings: string[] = [];
  let totalBytes = 0;

  for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
    const file = files[fileIndex];
    let bytes: Uint8Array;
    try {
      bytes = decodePdfDataUrl(file.dataUrl);
    } catch (error) {
      warnings.push(`${file.name}: ${error instanceof Error ? error.message : 'unreadable PDF data'}`);
      continue;
    }

    totalBytes += bytes.byteLength;
    if (totalBytes > BYTE_LIMIT) {
      warnings.push('The package exceeds the experimental 50 MB limit. Split it into smaller packages.');
      break;
    }
    if (sheets.length >= PAGE_LIMIT) {
      warnings.push(`The package exceeds the experimental ${PAGE_LIMIT}-sheet limit. Split it into smaller packages.`);
      break;
    }

    let pdf: pdfjsLib.PDFDocumentProxy | null = null;
    try {
      pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'could not open the PDF';
      warnings.push(
        /password/i.test(message)
          ? `${file.name}: encrypted PDFs are not supported. Remove the password and upload again.`
          : `${file.name}: ${message}`,
      );
      continue;
    }

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      if (sheets.length >= PAGE_LIMIT) {
        warnings.push(`Stopped at the experimental ${PAGE_LIMIT}-sheet limit. Split the package to continue.`);
        break;
      }

      const sheetId = `sheet-${String(sheets.length + 1).padStart(2, '0')}`;
      try {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1 });
        const sheet: RedlineSheet = {
          id: sheetId,
          fileId: file.name,
          fileName: file.name,
          pageIndex: pageNumber - 1,
          pageWidth: viewport.width,
          pageHeight: viewport.height,
          registration: null,
          markupCount: 0,
          itemCount: 0,
        };

        const annotations = await page.getAnnotations({ intent: 'display' });
        annotations.forEach((annotation: any, annotationIndex: number) => {
          try {
            if (!Array.isArray(annotation?.rect) || annotation.rect.length < 4) return;
            const viewportRect = viewport.convertToViewportRectangle(annotation.rect);
            const rect = normalizeRect(viewportRect);
            const subtype = String(annotation.subtype || 'Unknown');
            const kind = mapAnnotationSubtype(subtype, rect);
            const rawText = annotationText(annotation);
            const markup: RedlineMarkup = {
              id: `${sheetId}-ann-${annotationIndex}`,
              sheetId,
              subtype,
              rawText,
              author: typeof annotation.title === 'string' && annotation.title.trim()
                ? annotation.title.trim()
                : undefined,
              color: colorToHex(annotation.color),
              rect,
              kind,
              sourceRef: `${file.name}#${sheetId}#${annotation.id ?? annotationIndex}`,
            };
            sheet.markupCount += 1;
            markups.push(markup);
          } catch (annotationError) {
            warnings.push(
              `${file.name} page ${pageNumber}: one annotation could not be read (${annotationError instanceof Error ? annotationError.message : 'unknown error'}).`,
            );
          }
        });

        try {
          const textContent = await page.getTextContent();
          for (const item of textContent.items as any[]) {
            if (!item?.str) continue;
            const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
            textItems.push({
              sheetId,
              text: String(item.str),
              x,
              y,
              width: Number(item.width) || 0,
              height: Number(item.height) || 0,
            });
          }
        } catch {
          warnings.push(`${file.name} page ${pageNumber}: no readable text layer.`);
        }

        if (options?.deep) {
          try {
            const imageDataUrl = await renderPageForVision(page);
            const detections = await extractRedlineVisualMarkups({
              imageDataUrl,
              model: options.model ?? 'auto',
              userApiKey: options.userApiKey,
              fileName: file.name,
              pageNumber,
            });
            detections.forEach((detection, detectionIndex) => {
              const markup = buildDeepVisionMarkup({
                sheetId,
                fileName: file.name,
                pageIndex: pageNumber - 1,
                detection,
                index: detectionIndex,
                pageWidth: viewport.width,
                pageHeight: viewport.height,
              });
              if (!markup) return;
              const duplicate = markups.some(
                (existing) => existing.sheetId === sheetId && isDeepVisionDuplicate(markup.rect, existing.rect),
              );
              if (duplicate) return;
              sheet.markupCount += 1;
              markups.push(markup);
            });
          } catch (visionError) {
            warnings.push(
              `${file.name} page ${pageNumber}: Deep vision pass failed (${visionError instanceof Error ? visionError.message : 'unknown error'}). Embedded annotations were kept.`,
            );
          }
        }

        sheets.push(sheet);
        onProgress?.({
          fileIndex,
          fileCount: files.length,
          fileName: file.name,
          pageIndex: pageNumber - 1,
          pageCount: pdf.numPages,
          markupsFound: markups.length,
        });
        page.cleanup();
      } catch (pageError) {
        warnings.push(
          `${file.name} page ${pageNumber}: ${pageError instanceof Error ? pageError.message : 'could not be read'}.`,
        );
      }
    }

    await pdf.destroy();
  }

  return { sheets, markups, textItems, warnings };
}
