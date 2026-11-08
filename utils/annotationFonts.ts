/**
 * Font choices offered consistently by the annotation manager, properties
 * panel, and natural-language commands. Arbitrary font families are still
 * accepted; this catalog is only the quick-pick list.
 */
export const ANNOTATION_FONT_OPTIONS = [
  'Arial',
  'Arial Narrow',
  'Calibri',
  'Cambria',
  'Cascadia Mono',
  'Consolas',
  'Courier New',
  'Georgia',
  'Segoe UI',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
  // Common CAD/SHX-style names. Browsers fall back when a face is not
  // installed, while DXF/C3D consumers can still use the intended name.
  'Romans',
  'Simplex',
  'Complex',
  'Italic',
  'Monotxt',
  'Iso',
] as const;

export const isKnownAnnotationFont = (font: string): boolean =>
  ANNOTATION_FONT_OPTIONS.some(option => option.toLowerCase() === font.trim().toLowerCase());

export const normalizeAnnotationFont = (font: string | null | undefined): string | undefined => {
  const trimmed = font?.trim();
  if (!trimmed) return undefined;
  const match = ANNOTATION_FONT_OPTIONS.find(
    option => option.toLowerCase() === trimmed.toLowerCase(),
  );
  return match ?? trimmed;
};
