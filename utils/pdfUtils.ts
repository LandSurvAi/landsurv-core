import * as pdfjsLib from 'pdfjs-dist';
import Tesseract from 'tesseract.js';
import type { PageViewport } from 'pdfjs-dist';
import type { RenderParameters } from 'pdfjs-dist/types/src/display/api.js';


pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@5.4.394/build/pdf.worker.mjs`;

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

const performOcrOnPdfPages = async (
  pdf: pdfjsLib.PDFDocumentProxy,
  onProgress: ProgressCallback,
  pageNumbers?: number[]
): Promise<string> => {
  let allText = '';
  const pagesToProcess = pageNumbers || Array.from({ length: pdf.numPages }, (_, i) => i + 1);
  let currentPageForLogger = 0;
  
  const worker = await Tesseract.createWorker('eng', 1, {
    logger: m => {
        if (m.status === 'recognizing text' && m.progress !== undefined) {
            onProgress({
                status: 'ocr_progress',
                page: currentPageForLogger,
                totalPages: pagesToProcess.length,
                progress: m.progress,
            });
        }
    },
  });

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
    
    const { data: { text } } = await worker.recognize(canvas);
    allText += text + '\n\n';
    page.cleanup();
  }
  
  await worker.terminate();
  return allText;
};

const _loadPdfAndExtractText = async (
  pdf: pdfjsLib.PDFDocumentProxy,
  onProgress: ProgressCallback,
  pageNumbers?: number[]
): Promise<string> => {
    onProgress({ status: 'extracting_text' });
    let allText = '';
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
        allText = await performOcrOnPdfPages(pdf, onProgress, pageNumbers);
    }
    return allText;
};

export const extractTextFromPdf = async (
  file: File,
  onProgress: ProgressCallback,
  pageNumbers?: number[]
): Promise<string> => {
  onProgress({ status: 'initializing' });
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument(arrayBuffer);
  const pdf = await loadingTask.promise;
  const allText = await _loadPdfAndExtractText(pdf, onProgress, pageNumbers);
  onProgress({ status: 'done' });
  return allText;
};

export const processPdfForMultimodal = async (
  file: File,
  onProgress: ProgressCallback,
  pageNumbers?: number[]
): Promise<{ text: string, rasterImageData: string[], layerNames: string[], dashPatterns: DashPattern[] }> => {
    console.log('=== processPdfForMultimodal CALLED ===');
    console.log('File:', file.name);
    console.log('PageNumbers parameter:', pageNumbers);
    console.log('PageNumbers is array?', Array.isArray(pageNumbers));
    console.log('PageNumbers length:', pageNumbers?.length);
    
    onProgress({ status: 'initializing' });
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument(arrayBuffer);
    const pdf = await loadingTask.promise;

    const text = await _loadPdfAndExtractText(pdf, onProgress, pageNumbers);

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
    return { text, rasterImageData: rasterImages, layerNames, dashPatterns };
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
): Promise<{ text: string; rasterImageData: string[] }> => {
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
    
    const worker = await Tesseract.createWorker('eng', 1, {
      logger: m => {
        if (m.status === 'recognizing text' && m.progress !== undefined) {
          onProgress({
            status: 'ocr_progress',
            page: 1,
            totalPages: 1,
            progress: m.progress,
          });
        }
      },
    });
    
    const { data: { text } } = await worker.recognize(canvas);
    await worker.terminate();
    
    onProgress({ status: 'done' });
    
    return {
      text: text || `[Scanned image: ${file.name}]`,
      rasterImageData: [rasterImageData],
    };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
};
