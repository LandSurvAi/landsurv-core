import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

export const PDFJS_WORKER_SRC: string = pdfWorkerUrl;

/**
 * Same-origin PDF.js data assets. The Vite config copies these directories
 * from pdfjs-dist into public/pdfjs so production does not fall back to a
 * missing /wasm/ path (which the SPA rewrite answers with index.html).
 */
export const PDFJS_ASSET_BASE = '/pdfjs/';
export const PDFJS_DOCUMENT_OPTIONS = {
  wasmUrl: `${PDFJS_ASSET_BASE}wasm/`,
  cMapUrl: `${PDFJS_ASSET_BASE}cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${PDFJS_ASSET_BASE}standard_fonts/`,
  iccUrl: `${PDFJS_ASSET_BASE}iccs/`,
};

export function ensurePdfWorkerConfigured(
  pdfjsLib: { GlobalWorkerOptions?: { workerSrc?: string } } | null | undefined,
): void {
  if (pdfjsLib?.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  }
}
