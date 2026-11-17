import * as pdfjsLib from 'pdfjs-dist';
import Tesseract from 'tesseract.js';
import type { PageViewport } from 'pdfjs-dist';
import type { RenderParameters } from 'pdfjs-dist/types/src/display/api.js';
import { getOcrLanguages } from './ocrLanguages.ts';
import { ensurePdfWorkerConfigured, PDFJS_DOCUMENT_OPTIONS } from './pdfWorker.ts';

ensurePdfWorkerConfigured(pdfjsLib);

export interface OcrProgress {
  status: 'initializing' | 'extracting_text' | 'ocr_progress' | 'done';
  page?: number;
  totalPages?: number;
  progress?: number; // 0 to 1
}

export type ProgressCallback = (progress: OcrProgress) => void;

export type DashPattern = 'solid' | 'dashed' | 'dotted' | 'dash-dot';

export interface PdfStructuralInfo {
  /** Real PDF "layers" — Optional Content Group names, when the PDF was plotted with layer info retained (e.g. AutoCAD/Civil3D "include layer information"). Empty if the PDF carries no OCGs. */
  layerNames: string[];
  /** Distinct stroke dash patterns actually drawn on the requested pages, classified from vector path `setDash` operators — the closest browser-readable proxy for CAD "linetypes". */
  dashPatterns: DashPattern[];
}

const classifyDashArray = (arr: number[] | null | undefined): DashPattern => {
  if (!arr || arr.length === 0) return 'solid';
  if (arr.length >= 4) return 'dash-dot';
  const onLength = arr[0] ?? 0;
  if (onLength > 0 && onLength <= 1.5) return 'dotted';
  return 'dashed';
};

/**
 * Reads real PDF structure — Optional Content Group (layer) names and the
 * distinct line-dash patterns actually drawn — instead of pattern-matching
 * extracted text. This is what lets a "layer/linetype presence" check reason
 * about the PDF's actual internals rather than guessing from visible text.
 */
export const extractPdfStructuralInfo = async (
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNumbers?: number[]
): Promise<PdfStructuralInfo> => {
  const layerNames: string[] = [];
  try {
    const ocConfig = await pdf.getOptionalContentConfig();
    // pdf.js exposes OCGs as ordered ids plus getGroup(id); it does not
    // expose a getGroups() method in the browser build used here.
    const order = (ocConfig as any)?.getOrder?.();
    if (Array.isArray(order)) {
      const ids = new Set<string>();
      const collectIds = (items: unknown[]) => {
        for (const item of items) {
          if (typeof item === 'string') {
            ids.add(item);
          } else if (Array.isArray(item)) {
            collectIds(item);
          }
        }
      };
      collectIds(order);
      for (const id of ids) {
        const group = (ocConfig as any).getGroup?.(id);
        if (group?.name) layerNames.push(String(group.name));
      }
    }
  } catch (err) {
    console.warn('[pdfUtils] Optional content (layer) extraction failed:', err);
  }

  const dashPatterns = new Set<DashPattern>();
  const pagesToProcess = pageNumbers || Array.from({ length: pdf.numPages }, (_, i) => i + 1);
  for (const i of pagesToProcess) {
    try {
      const page = await pdf.getPage(i);
      const opList = await page.getOperatorList();
      const setDashOp = (pdfjsLib as any).OPS?.setDash;
      if (typeof setDashOp === 'number') {
        for (let idx = 0; idx < opList.fnArray.length; idx++) {
          if (opList.fnArray[idx] === setDashOp) {
            const args = opList.argsArray[idx];
            dashPatterns.add(classifyDashArray(args?.[0]));
          }
        }
      }
      page.cleanup();
    } catch (err) {
      console.warn(`[pdfUtils] Dash-pattern scan failed on page ${i}:`, err);
    }
  }

  return { layerNames: Array.from(new Set(layerNames)), dashPatterns: Array.from(dashPatterns) };
};

const OCR_WORKER_READY_TIMEOUT_MS = 20_000;

/**
 * Tesseract downloads language traineddata before it accepts work and has no
 * timeout of its own. Without a bound, a slow or unavailable language pack
 * (e.g. Arabic on a Gulf document) leaves the upload spinner waiting forever.
 * Try the requested languages, then fall back to English.
 */
const createOcrWorker = async (
  languages: string,
  onProgress: ProgressCallback,
  currentPage: () => number,
  totalPages: number,
): Promise<Awaited<ReturnType<typeof Tesseract.createWorker>>> => {
  const primary = languages.trim() || 'eng';
  const candidates = primary === 'eng' ? ['eng'] : [primary, 'eng'];
  let lastError: unknown = null;

  for (const candidate of candidates) {
    const pending = Tesseract.createWorker(candidate, 1, {
      logger: m => {
        if (m.status === 'recognizing text' && m.progress !== undefined) {
          onProgress({
            status: 'ocr_progress',
            page: currentPage(),
            totalPages,
            progress: m.progress,
          });
        }
      },
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        pending,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`OCR language data (${candidate}) did not load within ${OCR_WORKER_READY_TIMEOUT_MS / 1000}s.`));
          }, OCR_WORKER_READY_TIMEOUT_MS);
        }),
      ]);
    } catch (err) {
      lastError = err;
      // A worker that finishes loading after the timeout must not leak.
      void pending.then(worker => worker.terminate().catch(() => {})).catch(() => {});
      console.warn(`[pdfUtils] OCR language "${candidate}" unavailable; trying the next option.`, err);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('The OCR engine could not start.');
};

const performOcrOnPdfPages = async (
  pdf: pdfjsLib.PDFDocumentProxy,
  onProgress: ProgressCallback,
  pageNumbers?: number[],
  languages: string = getOcrLanguages()
): Promise<{ text: string; confidence: number | null }> => {
  let allText = '';
  let confidenceSum = 0;
  let confidenceCount = 0;
  const pagesToProcess = pageNumbers || Array.from({ length: pdf.numPages }, (_, i) => i + 1);
  let currentPageForLogger = 0;
  
  const worker = await createOcrWorker(
    languages,
    onProgress,
    () => currentPageForLogger,
    pagesToProcess.length,
  );

  for (const i of pagesToProcess) {
    currentPageForLogger = i;
    const page = await pdf.getPage(i);
    const viewport: PageViewport = page.getViewport({ scale: 2.0 });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not get canvas context for OCR.');
    }
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderParameters: any = {
        canvasContext: context,
        viewport: viewport,
    };
    await page.render(renderParameters).promise;
    
    const { data: { text, confidence } } = await worker.recognize(canvas);
    allText += text + '\n\n';
    if (typeof confidence === 'number' && Number.isFinite(confidence)) {
      confidenceSum += confidence;
      confidenceCount += 1;
    }
    page.cleanup();
  }
  
  await worker.terminate();
  return {
    text: allText,
    confidence: confidenceCount > 0 ? confidenceSum / confidenceCount / 100 : null,
  };
};

const _loadPdfAndExtractText = async (
  pdf: pdfjsLib.PDFDocumentProxy,
  onProgress: ProgressCallback,
  pageNumbers?: number[],
  languages: string = getOcrLanguages()
): Promise<{ text: string; usedOcr: boolean; ocrConfidence: number | null }> => {
    onProgress({ status: 'extracting_text' });
    let allText = '';
    let usedOcr = false;
    let ocrConfidence: number | null = null;
    const pagesToProcess = pageNumbers || Array.from({ length: pdf.numPages }, (_, i) => i + 1);

    for (const i of pagesToProcess) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        if (textContent.items.length > 0) {
        const pageText = textContent.items.map(item => ('str' in item ? item.str : '')).join(' ');
        allText += pageText + '\n\n';
        }
    }
    if (allText.trim().length < 100) { 
        usedOcr = true;
        const ocr = await performOcrOnPdfPages(pdf, onProgress, pageNumbers, languages);
        allText = ocr.text;
        ocrConfidence = ocr.confidence;
    }
    return { text: allText, usedOcr, ocrConfidence };
};

export const extractTextFromPdf = async (
  file: File,
  onProgress: ProgressCallback,
  pageNumbers?: number[],
  languages: string = getOcrLanguages()
): Promise<string> => {
  onProgress({ status: 'initializing' });
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer, ...PDFJS_DOCUMENT_OPTIONS });
  const pdf = await loadingTask.promise;
  const { text } = await _loadPdfAndExtractText(pdf, onProgress, pageNumbers, languages);
  onProgress({ status: 'done' });
  return text;
};

export const processPdfForMultimodal = async (
  file: File,
  onProgress: ProgressCallback,
  pageNumbers?: number[],
  languages: string = getOcrLanguages()
): Promise<{ text: string, rasterImageData: string[], layerNames: string[], dashPatterns: DashPattern[], ocrUsed: boolean, ocrConfidence: number | null }> => {
    console.log('=== processPdfForMultimodal CALLED ===');
    console.log('File:', file.name);
    console.log('PageNumbers parameter:', pageNumbers);
    console.log('PageNumbers is array?', Array.isArray(pageNumbers));
    console.log('PageNumbers length:', pageNumbers?.length);
    
    onProgress({ status: 'initializing' });
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer, ...PDFJS_DOCUMENT_OPTIONS });
    const pdf = await loadingTask.promise;

    const { text, usedOcr, ocrConfidence } = await _loadPdfAndExtractText(pdf, onProgress, pageNumbers, languages);

    const pagesToProcess = pageNumbers || Array.from({ length: pdf.numPages }, (_, i) => i + 1);
    console.log('=== PAGE PROCESSING DECISION ===');
    console.log('pageNumbers provided?', !!pageNumbers);
    console.log('pagesToProcess:', pagesToProcess);
    console.log('pdf.numPages:', pdf.numPages);
    console.log('Processing', pagesToProcess.length, 'pages out of', pdf.numPages, 'total');
    
    const rasterImages: string[] = [];
    for (const i of pagesToProcess) {
        const page = await pdf.getPage(i);
        // Using a consistent, high-quality scale for rasterization
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('Could not get canvas context for rasterization.');
        }
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        const renderParameters: any = {
            canvasContext: context,
            viewport: viewport,
        };
        await page.render(renderParameters).promise;
        // Use JPEG for a good balance of quality and size
        const rasterImageData = canvas.toDataURL('image/jpeg', 0.85); 
        rasterImages.push(rasterImageData);
        page.cleanup();
    }

    const { layerNames, dashPatterns } = await extractPdfStructuralInfo(pdf, pagesToProcess);

    onProgress({ status: 'done' });
    return { text, rasterImageData: rasterImages, layerNames, dashPatterns, ocrUsed: usedOcr, ocrConfidence };
};

/**
 * Detect if a file is a raster image based on its MIME type or extension.
 * Supported formats: PNG, JPEG, GIF, BMP, WebP, TIFF
 */
export const isRasterImageFile = (file: File): boolean => {
  const supportedImageTypes = [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/bmp',
    'image/webp',
    'image/tiff',
  ];
  
  const supportedExtensions = [
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.tif', '.tiff'
  ];
  
  const isMimeType = supportedImageTypes.includes(file.type);
  const isExtension = supportedExtensions.some(ext => 
    file.name.toLowerCase().endsWith(ext)
  );
  
  return isMimeType || isExtension;
};

/**
 * Process a raster image file for multimodal analysis.
 * Performs OCR on the image to extract text and returns both text + image data.
 * 
 * @param file - The image file to process
 * @param onProgress - Callback to report progress updates
 * @returns Object with extracted text and base64 encoded image data
 */
export const processRasterImageForMultimodal = async (
  file: File,
  onProgress: ProgressCallback
): Promise<{ text: string; rasterImageData: string[]; confidence?: number }> => {
  console.log('=== processRasterImageForMultimodal CALLED ===');
  console.log('File:', file.name, 'Type:', file.type);
  
  onProgress({ status: 'initializing' });
  
  // Read the image file and convert to base64
  const fileBuffer = await file.arrayBuffer();
  const blob = new Blob([fileBuffer], { type: file.type });
  
  // Create a temporary image element to load the image
  const imageUrl = URL.createObjectURL(blob);
  const img = new Image();
  
  const imageLoadPromise = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageUrl;
  });
  
  try {
    await imageLoadPromise;
    
    // Convert image to canvas and then to data URL (JPEG)
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not get canvas context for image processing.');
    }
    
    context.drawImage(img, 0, 0);
    const rasterImageData = canvas.toDataURL('image/jpeg', 0.85);
    
    // Perform OCR on the image
    onProgress({ status: 'ocr_progress', page: 1, totalPages: 1, progress: 0 });
    
    const worker = await createOcrWorker(getOcrLanguages(), onProgress, () => 1, 1);
    
    const { data: { text, confidence } } = await worker.recognize(canvas);
    await worker.terminate();
    
    onProgress({ status: 'done' });
    
    return {
      text: text || `[Scanned image: ${file.name}]`,
      rasterImageData: [rasterImageData],
      confidence: typeof confidence === 'number' && Number.isFinite(confidence)
        ? confidence / 100
        : undefined,
    };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
};
