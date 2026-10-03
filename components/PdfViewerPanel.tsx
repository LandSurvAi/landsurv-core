
import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { type SessionFile, type PdfHighlight, useHighlights } from '../types.ts';
import { PlusIcon, MinusIcon, ChevronLeftIcon, ChevronRightIcon, ListBulletIcon, XMarkIcon, FullscreenIcon, ExitFullscreenIcon, RotateCcwIcon, RotateCwIcon } from './icons.tsx';
import { useDocumentScrollLock } from '../hooks/useDocumentScrollLock.ts';

interface PdfViewerPanelProps {
  files: SessionFile[];
  onClose: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  isDesktop: boolean;
}

// A helper function to draw a more organic, hand-drawn highlight shape that fits snugly around text.
const drawIrregularHighlight = (
    ctx: CanvasRenderingContext2D, 
    rect: { x: number; y: number; width: number; height: number; },
    color: string,
    borderColor: string
) => {
    const { x, y, width, height } = rect;

    // Use OUTSET instead of INSET. A real highlighter bleeds outside the text bounds.
    const outsetX = width * 0.05; 
    const outsetY = height * 0.15;
    
    const x0 = x - outsetX;
    const y0 = y - outsetY;
    const w = width + outsetX * 2;
    const h = height + outsetY * 2;

    if (w <= 4 || h <= 4) { // Fallback for very small highlights
        ctx.fillStyle = color;
        ctx.fillRect(x, y, width, height);
        return;
    };

    // Reduce perturbation for a more controlled, less "wonky" shape.
    const perturbationX = w * 0.08;
    const perturbationY = h * 0.15;
    const randomOffsetX = () => (Math.random() - 0.5) * perturbationX;
    const randomOffsetY = () => (Math.random() - 0.5) * perturbationY;

    // Still 8 points, but on the outset rectangle.
    const points = [
        { x: x0,           y: y0 },           // Top-left
        { x: x0 + w / 2,   y: y0 },           // Top-mid
        { x: x0 + w,       y: y0 },           // Top-right
        { x: x0 + w,       y: y0 + h / 2 },   // Right-mid
        { x: x0 + w,       y: y0 + h },       // Bottom-right
        { x: x0 + w / 2,   y: y0 + h },       // Bottom-mid
        { x: x0,           y: y0 + h },       // Bottom-left
        { x: x0,           y: y0 + h / 2 }    // Left-mid
    ].map(p => ({ x: p.x + randomOffsetX(), y: p.y + randomOffsetY() }));

    ctx.fillStyle = color;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    // Start at the midpoint of the last and first points to ensure a smooth, closed curve.
    ctx.moveTo((points[points.length - 1].x + points[0].x) / 2, (points[points.length - 1].y + points[0].y) / 2);

    // Draw quadratic curves between the midpoints of the segments, using the points as control points.
    // This creates a smooth, continuous "blob" shape that nicely wraps the corners.
    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        const midPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        ctx.quadraticCurveTo(p1.x, p1.y, midPoint.x, midPoint.y);
    }
    ctx.closePath();
    
    ctx.fill();
    ctx.stroke();
};

// ---------------------------------------------------------------------------
// Anchor resolution — turns a PdfHighlight into one or more rects in the
// CURRENT viewport's coordinate space. Strategy, in order of preference:
//   1. textSnippet → locate in PDF.js text layer (glyph-accurate)
//   2. box2dNorm   → Gemini-native [ymin, xmin, ymax, xmax] in 0–1000 from
//                    the top-left of the page image
//   3. boundingBox → legacy free-form PDF-space rect (kept for back-compat)
// ---------------------------------------------------------------------------
type ViewportRect = { x: number; y: number; width: number; height: number };

const normalizeForMatch = (s: string): string =>
    s.replace(/\s+/g, ' ').trim().toLowerCase();

const resolveSnippetItems = (
    items: any[],
    snippet: string,
    contextBefore?: string,
    contextAfter?: string,
): { startIdx: number; endIdx: number } | null => {
    if (!snippet) return null;

    // Build a flat string with a per-char → item-index map.
    const charToItem: number[] = [];
    let flat = '';
    items.forEach((it, idx) => {
        const raw = (it.str ?? '') as string;
        if (!raw) return;
        const text = raw + (it.hasEOL ? ' ' : ' ');
        for (let i = 0; i < text.length; i++) {
            flat += text[i];
            charToItem.push(idx);
        }
    });

    const haystack = normalizeForMatch(flat);
    // Maintain a parallel map from normalized index → original index.
    const normToOrig: number[] = [];
    {
        let prevSpace = true;
        for (let i = 0; i < flat.length; i++) {
            const c = flat[i];
            const isSpace = /\s/.test(c);
            if (isSpace) {
                if (prevSpace) continue;
                normToOrig.push(i);
                prevSpace = true;
            } else {
                normToOrig.push(i);
                prevSpace = false;
            }
        }
    }
    // Trim leading space(s) the same way normalizeForMatch does.
    while (normToOrig.length && /\s/.test(flat[normToOrig[0]])) normToOrig.shift();

    const needle = normalizeForMatch(snippet);
    if (!needle) return null;

    const matches: number[] = [];
    let from = 0;
    while (true) {
        const at = haystack.indexOf(needle, from);
        if (at < 0) break;
        matches.push(at);
        from = at + Math.max(1, needle.length);
    }
    if (matches.length === 0) return null;

    let chosen = matches[0];
    if (matches.length > 1 && (contextBefore || contextAfter)) {
        const before = contextBefore ? normalizeForMatch(contextBefore) : '';
        const after = contextAfter ? normalizeForMatch(contextAfter) : '';
        let bestScore = -1;
        for (const m of matches) {
            const pre = haystack.slice(Math.max(0, m - 80), m);
            const post = haystack.slice(m + needle.length, m + needle.length + 80);
            let score = 0;
            if (before && pre.endsWith(before)) score += 2;
            else if (before && pre.includes(before)) score += 1;
            if (after && post.startsWith(after)) score += 2;
            else if (after && post.includes(after)) score += 1;
            if (score > bestScore) {
                bestScore = score;
                chosen = m;
            }
        }
    }

    const origStart = normToOrig[chosen];
    const origEnd = normToOrig[Math.min(chosen + needle.length - 1, normToOrig.length - 1)];
    if (origStart == null || origEnd == null) return null;

    return { startIdx: charToItem[origStart], endIdx: charToItem[origEnd] };
};

const rectsFromTextItems = (
    items: any[],
    startIdx: number,
    endIdx: number,
    viewport: any,
): ViewportRect[] => {
    const rects: ViewportRect[] = [];
    for (let i = startIdx; i <= endIdx && i < items.length; i++) {
        const it = items[i];
        if (!it || !it.transform) continue;
        const [, , , , e, f] = it.transform as number[];
        const w = it.width ?? 0;
        const h = it.height ?? 0;
        if (w <= 0 || h <= 0) continue;
        // PDF text item origin is at the baseline-left in user space (origin bottom-left).
        const [x1v, y1v] = viewport.convertToViewportPoint(e, f + h);         // top-left in PDF
        const [x2v, y2v] = viewport.convertToViewportPoint(e + w, f);         // bottom-right in PDF
        const minX = Math.min(x1v, x2v);
        const minY = Math.min(y1v, y2v);
        const maxX = Math.max(x1v, x2v);
        const maxY = Math.max(y1v, y2v);
        rects.push({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
    }
    return rects;
};

const rectFromNormBox = (
    box: [number, number, number, number],
    page: any,
    viewport: any,
): ViewportRect | null => {
    const [ymin, xmin, ymax, xmax] = box;
    if ([ymin, xmin, ymax, xmax].some(n => !isFinite(n))) return null;
    // Use the page's natural (unrotated, unscaled) viewport so the normalized
    // coordinates always map to the page image Gemini was shown.
    const natural = page.getViewport({ scale: 1, rotation: 0 });
    const pageW = natural.width;
    const pageH = natural.height;
    const pdfX1 = (xmin / 1000) * pageW;
    const pdfX2 = (xmax / 1000) * pageW;
    // Normalized y is from top of image; PDF user space y is from bottom.
    const pdfY1 = pageH - (ymax / 1000) * pageH;
    const pdfY2 = pageH - (ymin / 1000) * pageH;

    const [aX, aY] = viewport.convertToViewportPoint(pdfX1, pdfY1);
    const [bX, bY] = viewport.convertToViewportPoint(pdfX2, pdfY2);
    const minX = Math.min(aX, bX);
    const minY = Math.min(aY, bY);
    const maxX = Math.max(aX, bX);
    const maxY = Math.max(aY, bY);
    const w = maxX - minX;
    const h = maxY - minY;
    if (w <= 0 || h <= 0) return null;
    return { x: minX, y: minY, width: w, height: h };
};

const rectFromLegacyBbox = (
    bbox: { x1: number; y1: number; x2: number; y2: number },
    viewport: any,
): ViewportRect | null => {
    const [tlX, tlY] = viewport.convertToViewportPoint(bbox.x1, bbox.y2);
    const [trX, trY] = viewport.convertToViewportPoint(bbox.x2, bbox.y2);
    const [blX, blY] = viewport.convertToViewportPoint(bbox.x1, bbox.y1);
    const [brX, brY] = viewport.convertToViewportPoint(bbox.x2, bbox.y1);
    const minX = Math.min(tlX, trX, blX, brX);
    const minY = Math.min(tlY, trY, blY, brY);
    const maxX = Math.max(tlX, trX, blX, brX);
    const maxY = Math.max(tlY, trY, blY, brY);
    const w = maxX - minX;
    const h = maxY - minY;
    if (w <= 0 || h <= 0) return null;
    return { x: minX, y: minY, width: w, height: h };
};


export const PdfViewerPanel: React.FC<PdfViewerPanelProps> = ({ files, onClose, isFullscreen, onToggleFullscreen, isDesktop }) => {
  useDocumentScrollLock(true);

  const { highlights, goToHighlight: setContextZoomTargetId, zoomTargetHighlightId } = useHighlights();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPos, setLastPanPos] = useState({ x: 0, y: 0 });
  const [isHighlightsPanelVisible, setIsHighlightsPanelVisible] = useState(true);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const [internalZoomTarget, setInternalZoomTarget] = useState<PdfHighlight | null>(null);
  // Cache of getTextContent() results keyed by `${fileIndex}:${pageIndex}` so
  // text-anchored highlights don't re-parse the page on every redraw.
  const textContentCacheRef = useRef<Map<string, any[]>>(new Map());

  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const currentFile = files[currentFileIndex];
  const pinchDistRef = useRef(0);
  const pinchMidpointRef = useRef({ x: 0, y: 0 });

  // Get the actual pages to display based on selectedPages
  const getVisiblePages = () => {
    if (currentFile?.selectedPages && currentFile.selectedPages.length > 0) {
      return currentFile.selectedPages.sort((a, b) => a - b);
    }
    return Array.from({ length: numPages }, (_, i) => i + 1);
  };

  const visiblePages = getVisiblePages();
  const isPageVisible = (pageNum: number) => visiblePages.includes(pageNum);
  const getDisplayPageNumber = (actualPageNum: number) => {
    return visiblePages.indexOf(actualPageNum) + 1;
  };
  const getActualPageNumber = (displayPageNum: number) => {
    return visiblePages[displayPageNum - 1] || 1;
  };

  useEffect(() => {
    if (!currentFile || !currentFile.fileData) return;
    // Reset cache when the file changes (page objects belong to a pdfDoc).
    textContentCacheRef.current.clear();
    const loadingTask = pdfjsLib.getDocument({ data: atob(currentFile.fileData.split(',')[1] || '') });
    loadingTask.promise.then(pdf => {
      setPdfDoc(pdf);
      setNumPages(pdf.numPages);
      setCurrentPage(1);
      setTransform({ scale: 1, x: 0, y: 0 });
      setRotation(0);
    }, (reason) => {
      console.error(reason);
    });
  }, [currentFile]);
  
  useEffect(() => {
    return () => {
        if (renderTaskRef.current) {
            renderTaskRef.current.cancel();
        }
    };
  }, []);

  const draw = useCallback(async () => {
    if (!pdfDoc) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
    }

    // Convert display page number to actual PDF page number
    const actualPageNum = getActualPageNumber(currentPage);
    const page = await pdfDoc.getPage(actualPageNum);
    const viewport = page.getViewport({ scale: transform.scale, rotation: rotation });

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const container = containerRef.current;
    if(container) {
      const offsetX = (container.clientWidth - canvas.width) / 2 + transform.x;
      const offsetY = (container.clientHeight > canvas.height ? (container.clientHeight - canvas.height) / 2 : 0) + transform.y;
      canvas.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    }

    const renderContext: any = {
      canvasContext: ctx,
      viewport: viewport,
    };
    
    const renderTask = page.render(renderContext);
    renderTaskRef.current = renderTask;
    
    try {
      await renderTask.promise;
      renderTaskRef.current = null;
    } catch(err) {
      if ((err as Error).name !== 'RenderingCancelledException') {
        console.error("PDF rendering error:", err);
      }
      return;
    }

    // Draw highlights — anchor-resolved (text snippet → normalized bbox → legacy)
    const pageHighlights = highlights.filter(h => h.fileIndex === currentFileIndex && h.pageIndex === actualPageNum - 1);
    if (pageHighlights.length > 0) {
        const cacheKey = `${currentFileIndex}:${actualPageNum - 1}`;
        let textItems = textContentCacheRef.current.get(cacheKey);
        if (!textItems) {
            try {
                const tc = await page.getTextContent();
                textItems = tc.items as any[];
                textContentCacheRef.current.set(cacheKey, textItems);
            } catch {
                textItems = [];
            }
        }

        for (const h of pageHighlights) {
            // Only draw the highlight rect when we can anchor it to actual
            // glyphs via the PDF text layer. The box_2d and legacy PDF-space
            // anchors are too unreliable on scanned/raster deeds (they're
            // visually misleading), so we keep them as navigation anchors
            // for click-to-zoom but suppress them from the canvas overlay.
            if (!h.textSnippet || !textItems || textItems.length === 0) {
                continue;
            }

            const match = resolveSnippetItems(textItems, h.textSnippet, h.contextBefore, h.contextAfter);
            if (!match) {
                console.debug('[PdfViewer] textSnippet did not resolve; highlight suppressed', {
                    id: h.id,
                    reason: h.reason,
                    snippet: h.textSnippet,
                });
                continue;
            }

            const rects = rectsFromTextItems(textItems, match.startIdx, match.endIdx, viewport);
            for (const r of rects) {
                drawIrregularHighlight(ctx, r, h.color, h.borderColor);
            }
        }
    }
  }, [pdfDoc, currentPage, transform, highlights, currentFileIndex, rotation, visiblePages]);
  
  const goToHighlight = (highlight: PdfHighlight) => {
    setContextZoomTargetId(highlight.id);
  };
  
  useEffect(() => {
    if (zoomTargetHighlightId) {
      const target = highlights.find(h => h.id === zoomTargetHighlightId);
      if (target) {
        if (target.fileIndex !== currentFileIndex) {
          setCurrentFileIndex(target.fileIndex);
        }
        // Convert actual page index to display page index
        const actualPage = target.pageIndex + 1;
        const displayPage = getDisplayPageNumber(actualPage);
        if (displayPage !== currentPage) {
          setCurrentPage(displayPage);
        }
        // Use an internal state to trigger the zoom effect in a separate useEffect
        // This ensures page/file changes are committed before zooming.
        setInternalZoomTarget(target); 
        setContextZoomTargetId(null); // Reset the context trigger immediately
      }
    }
  }, [zoomTargetHighlightId, highlights, setContextZoomTargetId, currentFileIndex, currentPage]);

  useEffect(() => {
    if (!internalZoomTarget || !pdfDoc || !containerRef.current) return;
    
    const actualPage = internalZoomTarget.pageIndex + 1;
    const displayPage = getDisplayPageNumber(actualPage);
    
    if (currentPage !== displayPage) return;

    const zoomToBbox = async () => {
      const page = await pdfDoc.getPage(actualPage);
      const container = containerRef.current!;
      const { clientWidth, clientHeight } = container;

      const pageIsSideways = rotation === 90 || rotation === 270;

      // Resolve the anchor to a PDF-user-space bbox {x1, y1, x2, y2}.
      let pdfBbox: { x1: number; y1: number; x2: number; y2: number } | null = null;

      if (internalZoomTarget.textSnippet) {
        const cacheKey = `${internalZoomTarget.fileIndex}:${internalZoomTarget.pageIndex}`;
        let textItems = textContentCacheRef.current.get(cacheKey);
        if (!textItems) {
            try {
                const tc = await page.getTextContent();
                textItems = tc.items as any[];
                textContentCacheRef.current.set(cacheKey, textItems);
            } catch {
                textItems = [];
            }
        }
        if (textItems && textItems.length > 0) {
            const match = resolveSnippetItems(
                textItems,
                internalZoomTarget.textSnippet,
                internalZoomTarget.contextBefore,
                internalZoomTarget.contextAfter,
            );
            if (match) {
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                for (let i = match.startIdx; i <= match.endIdx && i < textItems.length; i++) {
                    const it = textItems[i];
                    if (!it?.transform) continue;
                    const e = it.transform[4];
                    const f = it.transform[5];
                    const w = it.width ?? 0;
                    const h = it.height ?? 0;
                    if (w <= 0 || h <= 0) continue;
                    minX = Math.min(minX, e);
                    maxX = Math.max(maxX, e + w);
                    minY = Math.min(minY, f);
                    maxY = Math.max(maxY, f + h);
                }
                if (isFinite(minX) && isFinite(maxX) && isFinite(minY) && isFinite(maxY)) {
                    pdfBbox = { x1: minX, y1: minY, x2: maxX, y2: maxY };
                }
            }
        }
      }

      if (!pdfBbox && internalZoomTarget.box2dNorm) {
        const [ymin, xmin, ymax, xmax] = internalZoomTarget.box2dNorm;
        const natural = page.getViewport({ scale: 1, rotation: 0 });
        const pageW = natural.width;
        const pageH = natural.height;
        pdfBbox = {
            x1: (xmin / 1000) * pageW,
            x2: (xmax / 1000) * pageW,
            y1: pageH - (ymax / 1000) * pageH,
            y2: pageH - (ymin / 1000) * pageH,
        };
      }

      if (!pdfBbox && internalZoomTarget.boundingBox) {
        pdfBbox = internalZoomTarget.boundingBox;
      }

      if (!pdfBbox) {
        setInternalZoomTarget(null);
        return;
      }

      const bboxWidth = pdfBbox.x2 - pdfBbox.x1;
      const bboxHeight = pdfBbox.y2 - pdfBbox.y1;

      const contentWidth = pageIsSideways ? bboxHeight : bboxWidth;
      const contentHeight = pageIsSideways ? bboxWidth : bboxHeight;

      const padding = 100;
      const scaleX = (clientWidth - padding * 2) / contentWidth;
      const scaleY = (clientHeight - padding * 2) / contentHeight;
      const newScale = Math.min(scaleX, scaleY, 3);

      const finalViewport = page.getViewport({ scale: newScale, rotation: rotation });

      const centerX_pdf = (pdfBbox.x1 + pdfBbox.x2) / 2;
      const centerY_pdf = (pdfBbox.y1 + pdfBbox.y2) / 2;

      const [canvasCenterX, canvasCenterY] = finalViewport.convertToViewportPoint(centerX_pdf, centerY_pdf);

      const newOffsetX = clientWidth / 2 - canvasCenterX;
      const newOffsetY = clientHeight / 2 - canvasCenterY;

      setTransform({ scale: newScale, x: newOffsetX, y: newOffsetY });
      setInternalZoomTarget(null);
    };

    zoomToBbox();
  }, [internalZoomTarget, pdfDoc, currentPage, rotation]);


  useEffect(() => {
    draw();
  }, [draw]);

  const handleZoom = (factor: number) => {
    // Zoom toward the center of the visible area
    const container = containerRef.current;
    if (!container) {
      setTransform(prev => ({ ...prev, scale: Math.max(0.25, Math.min(4, prev.scale * factor)) }));
      return;
    }

    const rect = container.getBoundingClientRect();
    // Center of the visible viewport
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    setTransform(prev => {
      const newScale = Math.max(0.25, Math.min(4, prev.scale * factor));
      const actualZoomFactor = newScale / prev.scale;
      
      // Calculate canvas-relative position of center point
      const canvasRelativeCenterX = centerX - prev.x;
      const canvasRelativeCenterY = centerY - prev.y;
      
      // After zoom, center point should stay at same screen position
      const newX = centerX - canvasRelativeCenterX * actualZoomFactor;
      const newY = centerY - canvasRelativeCenterY * actualZoomFactor;
      
      return { scale: newScale, x: newX, y: newY };
    });
  };

  const setZoomLevel = (level: number) => {
    // Set to specific zoom level (1.0 = 100%)
    const container = containerRef.current;
    if (!container) {
      setTransform(prev => ({ ...prev, scale: level }));
      return;
    }

    const rect = container.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    setTransform(prev => {
      const actualZoomFactor = level / prev.scale;
      const newX = centerX - (centerX - prev.x) * actualZoomFactor;
      const newY = centerY - (centerY - prev.y) * actualZoomFactor;
      return { scale: level, x: newX, y: newY };
    });
  };

  const fitToPage = () => {
    if (!pdfDoc || !containerRef.current) return;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Calculate scale to fit entire page in view
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight - 100;
    const pageWidth = canvas.width;
    const pageHeight = canvas.height;

    const scaleX = containerWidth / pageWidth;
    const scaleY = containerHeight / pageHeight;
    const newScale = Math.min(scaleX, scaleY, 2);

    // Center the page
    const scaledPageWidth = pageWidth * newScale;
    const scaledPageHeight = pageHeight * newScale;
    const offsetX = (containerWidth - scaledPageWidth) / 2;
    const offsetY = (containerHeight - scaledPageHeight) / 2;

    setTransform({
      scale: newScale,
      x: offsetX,
      y: offsetY,
    });
  };

  const fitToWidth = () => {
    if (!containerRef.current || !canvasRef.current) return;
    const container = containerRef.current;
    const canvas = canvasRef.current;

    const containerWidth = container.clientWidth;
    const pageWidth = canvas.width;
    const newScale = Math.min(containerWidth / pageWidth, 4);

    // Center horizontally, top-align vertically
    const scaledPageWidth = pageWidth * newScale;
    const offsetX = (containerWidth - scaledPageWidth) / 2;

    setTransform({
      scale: newScale,
      x: offsetX,
      y: 10,
    });
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    // Cursor position relative to the container
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;

    setTransform(prev => {
        const newScale = Math.max(0.25, Math.min(4, prev.scale * zoomFactor));
        const actualZoomFactor = newScale / prev.scale;
        
        // Calculate the position on the canvas before zoom
        // Canvas position in container coords before zoom: (prev.x, prev.y)
        // Cursor position relative to canvas before zoom: (cursorX - prev.x, cursorY - prev.y)
        // This position should stay the same after zoom
        const canvasRelativeCursorX = cursorX - prev.x;
        const canvasRelativeCursorY = cursorY - prev.y;
        
        // After zoom, the same point on canvas should be at cursor position
        // canvasRelativeCursorX * newScale should position this at cursorX
        // So: newX + canvasRelativeCursorX * newScale = cursorX
        // Therefore: newX = cursorX - canvasRelativeCursorX * newScale
        const newX = cursorX - canvasRelativeCursorX * actualZoomFactor;
        const newY = cursorY - canvasRelativeCursorY * actualZoomFactor;
        
        return { scale: newScale, x: newX, y: newY };
    });
  }, []);

  const handlePanStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if ('touches' in e) {
      if (e.touches.length === 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const container = containerRef.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          pinchMidpointRef.current = {
            x: (t1.clientX + t2.clientX) / 2 - rect.left,
            y: (t1.clientY + t2.clientY) / 2 - rect.top,
          };
        }
        pinchDistRef.current = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      } else if (e.touches.length === 1) {
        setLastPanPos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      }
    } else {
      setIsPanning(true);
      setLastPanPos({ x: e.clientX, y: e.clientY });
    }
  };
  const handlePanMove = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    
    if ('touches' in e) {
        const container = containerRef.current;
        if (e.touches.length === 2 && container) { // Zooming
            if (pinchDistRef.current <= 0) return;
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
            const zoomFactor = currentDist / pinchDistRef.current;

            // Use the initial pinch midpoint for consistent zoom behavior
            const midPointX = pinchMidpointRef.current.x;
            const midPointY = pinchMidpointRef.current.y;

            setTransform(prev => {
                const newScale = Math.max(0.25, Math.min(4, prev.scale * zoomFactor));
                const actualZoomFactor = newScale / prev.scale;
                // Keep the pinch midpoint in the same visual position during zoom
                const newX = midPointX - (midPointX - prev.x) * actualZoomFactor;
                const newY = midPointY - (midPointY - prev.y) * actualZoomFactor;
                return { scale: newScale, x: newX, y: newY };
            });

            pinchDistRef.current = currentDist;
        } else if (e.touches.length === 1) { // Panning
            const pos = e.touches[0];
            const dx = pos.clientX - lastPanPos.x;
            const dy = pos.clientY - lastPanPos.y;
            setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
            setLastPanPos({ x: pos.clientX, y: pos.clientY });
        }
    } else if (isPanning) { // Mouse panning
         const pos = e as React.MouseEvent;
         const dx = pos.clientX - lastPanPos.x;
         const dy = pos.clientY - lastPanPos.y;
         setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
         setLastPanPos({ x: pos.clientX, y: pos.clientY });
    }
  };
  const handlePanEnd = (e: React.MouseEvent | React.TouchEvent) => {
    setIsPanning(false);
    if ('touches' in e) {
        if (e.touches.length < 2) {
            pinchDistRef.current = 0; // Stop zooming
        }
        if (e.touches.length === 1) {
            // Transitioning from zoom to pan
            setLastPanPos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
        }
    }
  };

  return (
    <div className={`flex flex-col text-gray-200 ${isFullscreen ? 'fixed inset-0 z-50 bg-gray-800' : 'w-full h-full relative bg-gray-800'}`}>
      <header className="flex-shrink-0 bg-gray-900/80 p-2 flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center gap-2">
            <h3 className="font-semibold text-orange-400">PDF Reviewer</h3>
            {files.length > 1 && (
                <select 
                    value={currentFileIndex}
                    onChange={(e) => setCurrentFileIndex(parseInt(e.target.value, 10))}
                    className="bg-gray-700 text-xs p-1.5 rounded-md border border-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-500 text-white"
                >
                    {files.map((file, index) => (
                        <option key={index} value={index}>{file.name}</option>
                    ))}
                </select>
            )}
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700">
            <XMarkIcon className="w-5 h-5"/>
        </button>
      </header>
      
      <div className={`flex-grow flex min-h-0 ${!isDesktop ? 'flex-col' : ''}`}>
        <div ref={containerRef} className="gesture-capture flex-grow bg-gray-700/50 overflow-hidden relative cursor-grab"
          onMouseDown={handlePanStart} onMouseMove={handlePanMove} onMouseUp={handlePanEnd} onMouseLeave={handlePanEnd}
          onTouchStart={handlePanStart} onTouchMove={handlePanMove} onTouchEnd={handlePanEnd}
          onWheel={handleWheel}
        >
          <canvas ref={canvasRef} className="absolute top-0 left-0 shadow-lg"/>
        </div>
        {isHighlightsPanelVisible && (
            <aside className={`flex-shrink-0 bg-gray-800 flex flex-col ${isDesktop ? 'w-64 border-l border-gray-700' : 'h-1/2 border-t border-gray-700'}`}>
                <div className="p-3 border-b border-gray-700">
                    <h4 className="font-semibold text-gray-300">AI Uncertainties ({highlights.length})</h4>
                </div>
                <div className="flex-grow overflow-y-auto">
                    {highlights.length > 0 ? (
                        <ul className="divide-y divide-gray-700">
                            {highlights.map((h) => (
                                <li
                                key={h.id}
                                onClick={() => goToHighlight(h)}
                                className="pl-2 pr-3 py-3 hover:bg-gray-700/50 cursor-pointer border-l-4 transition-colors"
                                style={{ borderColor: h.borderColor }}
                                >
                                <p className="text-sm text-gray-300">{h.reason}</p>
                                <p className="text-xs text-gray-500 mt-1">
                                    {files[h.fileIndex]?.name} - Page {h.pageIndex + 1}
                                </p>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="p-4 text-sm text-gray-500 text-center">No uncertainties flagged by the AI for this document.</p>
                    )}
                </div>
            </aside>
        )}
      </div>

       {/* Toolbar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 p-2 bg-gray-900/95 backdrop-blur-sm rounded-xl flex items-center gap-1 border border-gray-700/50 shadow-lg">
        <button onClick={() => setIsHighlightsPanelVisible(p => !p)} className={`p-2 rounded-md transition-colors ${isHighlightsPanelVisible ? 'bg-orange-600' : 'hover:bg-gray-700'}`} title="Toggle Highlights Panel"><ListBulletIcon className="w-5 h-5"/></button>
        <div className="h-6 w-px bg-gray-600 mx-1"></div>
        
        {/* Zoom Controls */}
        <button onClick={() => handleZoom(1 / 1.3)} className="p-2 rounded-md hover:bg-gray-700 text-xs" title="Zoom Out"><MinusIcon className="w-5 h-5"/></button>
        
        {/* Zoom Level Dropdown */}
        <select 
          value={Math.round(transform.scale * 100)} 
          onChange={(e) => setZoomLevel(parseInt(e.target.value) / 100)}
          className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded-md border border-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-500 text-white cursor-pointer"
          title="Zoom Level"
        >
          <option value="25">25%</option>
          <option value="50">50%</option>
          <option value="75">75%</option>
          <option value="100">100%</option>
          <option value="125">125%</option>
          <option value="150">150%</option>
          <option value="200">200%</option>
          <option value="300">300%</option>
        </select>
        
        <button onClick={() => handleZoom(1.3)} className="p-2 rounded-md hover:bg-gray-700 text-xs" title="Zoom In"><PlusIcon className="w-5 h-5"/></button>
        
        <div className="h-6 w-px bg-gray-600 mx-1"></div>
        
        {/* Fit Buttons */}
        <button onClick={() => fitToPage()} className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded-md border border-gray-600 transition-colors" title="Fit Page">Fit Page</button>
        <button onClick={() => fitToWidth()} className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded-md border border-gray-600 transition-colors" title="Fit Width">Fit Width</button>
        
        <div className="h-6 w-px bg-gray-600 mx-1"></div>
        
        {/* Rotation */}
        <button onClick={() => setRotation(prev => (prev - 90 + 360) % 360)} className="p-2 rounded-md hover:bg-gray-700" title="Rotate Counter-Clockwise"><RotateCcwIcon className="w-5 h-5"/></button>
        <button onClick={() => setRotation(prev => (prev + 90) % 360)} className="p-2 rounded-md hover:bg-gray-700" title="Rotate Clockwise"><RotateCwIcon className="w-5 h-5"/></button>
        
        <div className="h-6 w-px bg-gray-600 mx-1"></div>
        
        {/* Page Navigation */}
        <button onClick={() => setCurrentPage(p => Math.max(1, p-1))} disabled={currentPage <= 1} className="p-2 rounded-md hover:bg-gray-700 disabled:opacity-50"><ChevronLeftIcon className="w-5 h-5"/></button>
        <span className="font-mono text-xs w-20 text-center px-1">Page {currentPage} / {visiblePages.length}</span>
        <button onClick={() => setCurrentPage(p => Math.min(visiblePages.length, p+1))} disabled={currentPage >= visiblePages.length} className="p-2 rounded-md hover:bg-gray-700 disabled:opacity-50"><ChevronRightIcon className="w-5 h-5"/></button>
        
        <div className="h-6 w-px bg-gray-600 mx-1"></div>
        
        {/* Fullscreen */}
        <button onClick={onToggleFullscreen} className="p-2 rounded-md hover:bg-gray-700">
            {isFullscreen ? <ExitFullscreenIcon className="w-5 h-5"/> : <FullscreenIcon className="w-5 h-5"/>}
        </button>
      </div>
    </div>
  );
};
