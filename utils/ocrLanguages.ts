/**
 * OCR language selection for Gulf documents.
 *
 * Tesseract wants traineddata names (`ara+eng`); Document AI wants BCP-47
 * hints (`ar`, `en`). Gulf regions get both languages so English labels and
 * Arabic notes in the same scanned plan are read together. Digits are never
 * normalized: a plan showing ٠١٢٣ stays ٠١٢٣ in the extracted text.
 */
import { detectBrowserRegion, type RegionCode } from './regions.ts';

export const ARABIC_OCR_LANGUAGES = 'ara+eng';
export const ARABIC_OCR_HINTS = ['ar', 'en'] as const;

function resolveRegion(region?: RegionCode): RegionCode {
  return region ?? detectBrowserRegion().region;
}

export function isGulfRegion(region?: RegionCode): boolean {
  const resolved = resolveRegion(region);
  return resolved === 'AE' || resolved === 'SA';
}

/** Tesseract traineddata selector. */
export function getOcrLanguages(region?: RegionCode): string {
  return isGulfRegion(region) ? ARABIC_OCR_LANGUAGES : 'eng';
}

/** Document AI / provider language hints. */
export function getOcrLanguageHints(region?: RegionCode): string[] {
  return isGulfRegion(region) ? [...ARABIC_OCR_HINTS] : ['en'];
}
