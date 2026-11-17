import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

export const PDFJS_WORKER_SRC: string = pdfWorkerUrl;

export function ensurePdfWorkerConfigured(
  pdfjsLib: { GlobalWorkerOptions?: { workerSrc?: string } } | null | undefined,
): void {
  if (pdfjsLib?.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  }
}
