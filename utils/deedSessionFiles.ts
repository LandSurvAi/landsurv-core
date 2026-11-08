import type { SessionFile } from '../types.ts';

/**
 * Fold several processed deed documents into one intake submission.
 *
 * Quick Thought and the upload screen can both accept multiple documents. When
 * no batch review handler is installed, the Boundary Agent still expects a
 * single SessionFile, so keep every document's text and raster pages in the
 * combined record instead of silently dropping all but the first file.
 */
export function combineDeedFiles(files: SessionFile[]): SessionFile {
  return {
    name: `${files.length} deed files`,
    content: files
      .map((file, index) => `--- Deed ${index + 1}: ${file.name} ---\n${file.content}`)
      .join('\n\n'),
    rasterImageData: files.flatMap(file => file.rasterImageData ?? []),
    pdfLayerNames: Array.from(new Set(files.flatMap(file => file.pdfLayerNames ?? []))),
    pdfDashPatterns: Array.from(new Set(files.flatMap(file => file.pdfDashPatterns ?? []))),
  };
}
