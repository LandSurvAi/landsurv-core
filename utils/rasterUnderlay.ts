import type { RasterAsset, RasterUnderlay, RasterUnderlayAnchor, RasterUnderlayTransform } from '../types.ts';

// Same worker CDN used by utils/pdfUtils.ts. Kept local so underlay import
// does not pull in the OCR pipeline.
const PDFJS_WORKER_SRC = `https://esm.sh/pdfjs-dist@5.4.394/build/pdf.worker.mjs`;

/** Longest raster edge produced when a PDF page is imported as an underlay. */
const MAX_PDF_RASTER_EDGE = 2600;

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });

const imageSize = (dataUrl: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Could not decode the selected image.'));
    img.src = dataUrl;
  });

const makeUnderlayId = (): string =>
  `underlay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const isPdfFile = (file: File): boolean =>
  file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

/** Read a raster image into an embedding-ready data URL plus its pixel size. */
export const readRasterImageAsset = async (file: File): Promise<RasterAsset> => {
  const dataUrl = await readFileAsDataUrl(file);
  const { width, height } = await imageSize(dataUrl);
  return {
    name: file.name,
    kind: 'image',
    dataUrl,
    imageWidth: width,
    imageHeight: height,
  };
};

/** Rasterize one PDF page onto a white background so it can be placed as an underlay. */
export const readPdfPageAsset = async (file: File, pageNumber = 1): Promise<RasterAsset> => {
  // Load the PDF engine only when a PDF is actually imported. A top-level
  // import pulls browser-only globals (DOMMatrix) into canvas-only tests and
  // screens that never touch PDFs.
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  try {
    const pageIndex = Math.max(1, Math.min(pdf.numPages, Math.round(pageNumber) || 1));
    const page = await pdf.getPage(pageIndex);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.max(1, Math.min(3, MAX_PDF_RASTER_EDGE / Math.max(baseViewport.width, baseViewport.height)));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get a canvas context for PDF rasterization.');
    // PDFs rasterize with transparency; a site-plan scan wants a solid paper base.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport } as unknown as Parameters<typeof page.render>[0]).promise;
    return {
      name: file.name,
      kind: 'pdf',
      dataUrl: canvas.toDataURL('image/png'),
      imageWidth: canvas.width,
      imageHeight: canvas.height,
      pageNumber: pageIndex,
      pageCount: pdf.numPages,
    };
  } finally {
    await pdf.destroy();
  }
};

/**
 * Build a north-up underlay centered on `center`, sized so `worldWidth`
 * drawing units span the image's full width.
 */
export const createRasterUnderlay = (
  asset: RasterAsset,
  center: { easting: number; northing: number },
  worldWidth: number,
): RasterUnderlay => {
  const imageWidth = Math.max(1, asset.imageWidth);
  const imageHeight = Math.max(1, asset.imageHeight);
  const scale = Number.isFinite(worldWidth) && worldWidth > 0 ? worldWidth / imageWidth : 1;
  return {
    id: makeUnderlayId(),
    name: asset.name,
    kind: asset.kind,
    dataUrl: asset.dataUrl,
    imageWidth,
    imageHeight,
    pageNumber: asset.pageNumber,
    pageCount: asset.pageCount,
    opacity: asset.kind === 'pdf' ? 0.85 : 1,
    visible: true,
    locked: false,
    transform: {
      originEasting: center.easting - (imageWidth * scale) / 2,
      originNorthing: center.northing + (imageHeight * scale) / 2,
      scale,
      rotationDeg: 0,
    },
    anchors: [],
  };
};

/** World position of a source-image pixel under the underlay transform. */
export const underlayImageToWorld = (
  transform: RasterUnderlayTransform,
  pixelX: number,
  pixelY: number,
  scaleMultiplier = 1,
): { easting: number; northing: number } => {
  const scale = transform.scale * scaleMultiplier;
  const theta = (transform.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return {
    easting: transform.originEasting + scale * (pixelX * cos + pixelY * sin),
    northing: transform.originNorthing + scale * (pixelX * sin - pixelY * cos),
  };
};

/** Inverse mapping: project coordinates back to source-image pixels. */
export const underlayWorldToImage = (
  transform: RasterUnderlayTransform,
  easting: number,
  northing: number,
): { x: number; y: number } => {
  const theta = (transform.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const dx = (easting - transform.originEasting) / (transform.scale || 1);
  const dy = (northing - transform.originNorthing) / (transform.scale || 1);
  return {
    x: dx * cos + dy * sin,
    y: dx * sin - dy * cos,
  };
};

/** The four image corners in project coordinates, clockwise from top-left. */
export const underlayCorners = (underlay: RasterUnderlay): Array<{ easting: number; northing: number }> => [
  underlayImageToWorld(underlay.transform, 0, 0),
  underlayImageToWorld(underlay.transform, underlay.imageWidth, 0),
  underlayImageToWorld(underlay.transform, underlay.imageWidth, underlay.imageHeight),
  underlayImageToWorld(underlay.transform, 0, underlay.imageHeight),
];

/** True when a project-coordinate point falls inside the underlay raster. */
export const underlayContainsWorldPoint = (underlay: RasterUnderlay, easting: number, northing: number): boolean => {
  if (underlay.locked) return false;
  const pixel = underlayWorldToImage(underlay.transform, easting, northing);
  return pixel.x >= 0 && pixel.x <= underlay.imageWidth && pixel.y >= 0 && pixel.y <= underlay.imageHeight;
};

/**
 * Similarity fit from two anchor pairs. Image pixel y grows downward while
 * project northing grows upward, so the fit is scale + rotation + translation
 * (no shear, no independent X/Y scale).
 */
export const fitUnderlayTransform = (
  anchors: RasterUnderlayAnchor[],
): RasterUnderlayTransform | null => {
  if (anchors.length < 2) return null;
  const [a, b] = anchors;
  if (a.imagePointSet === false || b.imagePointSet === false) return null;
  const dpx = b.imageX - a.imageX;
  const dpy = b.imageY - a.imageY;
  const dE = b.easting - a.easting;
  const dN = b.northing - a.northing;
  const imageDistance = Math.hypot(dpx, dpy);
  const worldDistance = Math.hypot(dE, dN);
  if (imageDistance < 1e-9 || worldDistance < 1e-9) return null;

  const scale = worldDistance / imageDistance;
  const theta = Math.atan2(dN, dE) - Math.atan2(-dpy, dpx);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  let rotationDeg = (theta * 180) / Math.PI;
  rotationDeg = ((rotationDeg + 180) % 360 + 360) % 360 - 180;

  return {
    originEasting: a.easting - scale * (a.imageX * cos + a.imageY * sin),
    originNorthing: a.northing - scale * (a.imageX * sin - a.imageY * cos),
    scale,
    rotationDeg,
  };
};

/** Copy anchor point coordinates from the live point list into the anchor records. */
export const refreshAnchorCoordinates = (
  anchors: RasterUnderlayAnchor[],
  points: Array<{ pointNumber: string; easting: number; northing: number }>,
): RasterUnderlayAnchor[] => anchors.map(anchor => {
  if (!anchor.pointNumber) return anchor;
  const point = points.find(p => p.pointNumber === anchor.pointNumber);
  return point ? { ...anchor, easting: point.easting, northing: point.northing } : anchor;
});
