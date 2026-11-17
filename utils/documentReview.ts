import planTableParser from './planTableParser';

export type DocumentReviewMethod = 'pdf-text' | 'ocr';
export type ReviewField = 'pointNumber' | 'northing' | 'easting' | 'description';

export interface ExtractedCoordinateRow {
  pointNumber: string;
  northingRaw: string;
  eastingRaw: string;
  description?: string;
  rawText?: string;
  page?: number;
}

export interface DocumentReviewRow {
  id: string;
  pointNumber: string;
  northing: string;
  easting: string;
  description: string;
  rawText: string;
  page?: number;
  included: boolean;
  /** Confidence supplied by OCR, or a source-quality estimate for a text layer. */
  sourceConfidence: number;
  confidence: number;
  fieldConfidence: Record<ReviewField, number>;
  issues: string[];
}

export interface DocumentReviewSummary {
  rowCount: number;
  includedCount: number;
  invalidIncludedCount: number;
  lowConfidenceCount: number;
  duplicateCount: number;
  arabicDigitCount: number;
  averageConfidence: number;
}

export interface BuildReviewOptions {
  overallConfidence?: number;
}

const ARABIC_INDIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/;

export function hasArabicIndicDigits(value: string): boolean {
  return ARABIC_INDIC_DIGITS.test(value);
}

/** Convert Eastern Arabic / Persian digits for arithmetic without changing display text. */
export function normalizeReviewDigits(value: string): string {
  return value
    .replace(/[\u0660-\u0669]/g, (ch) => String(ch.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (ch) => String(ch.charCodeAt(0) - 0x06F0));
}

/** Parse a coordinate cell, accepting Arabic-Indic digits and separator variants. */
export function parseReviewNumber(value: string): number | null {
  if (!value) return null;
  const normalized = normalizeReviewDigits(value)
    .replace(/\u066C/g, '')
    .replace(/\u066B/g, '.')
    .replace(/[,\s]/g, '')
    .replace(/[^0-9.+-]/g, '');
  if (!normalized || normalized === '.' || normalized === '-' || normalized === '+') return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

interface FieldScore {
  confidence: number;
  issues: string[];
}

function scorePointNumber(value: string): FieldScore {
  const trimmed = value.trim();
  if (!trimmed) return { confidence: 0, issues: ['Point number is empty'] };
  if (trimmed.length > 32) {
    return { confidence: 0.55, issues: ['Point number is unusually long'] };
  }
  if (/\d/.test(trimmed)) return { confidence: 0.96, issues: [] };
  return { confidence: 0.74, issues: ['Point number has no numeric identifier'] };
}

function coordinateDigits(value: string): { integerDigits: number; hasDecimal: boolean } {
  const normalized = normalizeReviewDigits(value)
    .replace(/\u066C/g, '')
    .replace(/\u066B/g, '.')
    .replace(/[,\s]/g, '');
  const integerPart = normalized.split('.')[0].replace(/\D/g, '').replace(/^0+/, '');
  return {
    integerDigits: integerPart.length,
    hasDecimal: normalized.includes('.'),
  };
}

function scoreCoordinate(value: string, label: 'Northing' | 'Easting', overallConfidence: number): FieldScore {
  if (!value.trim()) return { confidence: 0, issues: [`${label} is empty`] };
  const parsed = parseReviewNumber(value);
  if (parsed === null) {
    return { confidence: 0.15, issues: [`${label} is not a valid number`] };
  }

  const { integerDigits, hasDecimal } = coordinateDigits(value);
  const issues: string[] = [];
  let score = 0.97;

  if (integerDigits < 4) {
    score = Math.min(score, 0.55);
    issues.push(`${label} has fewer than 4 integer digits — check for a missed digit`);
  }
  if (!hasDecimal) {
    score = Math.min(score, 0.84);
    issues.push(`${label} has no decimal places`);
  }
  if (integerDigits > 9 || Math.abs(parsed) > 1_000_000_000) {
    score = Math.min(score, 0.45);
    issues.push(`${label} is outside the expected coordinate range`);
  }

  return { confidence: clamp(Math.min(score, overallConfidence)), issues };
}

function recomputeRows(rows: DocumentReviewRow[]): DocumentReviewRow[] {
  const pointCounts = new Map<string, number>();
  const coordinateCounts = new Map<string, number>();

  for (const row of rows) {
    const pointKey = row.pointNumber.trim().toLowerCase();
    if (pointKey) pointCounts.set(pointKey, (pointCounts.get(pointKey) ?? 0) + 1);
    const n = parseReviewNumber(row.northing);
    const e = parseReviewNumber(row.easting);
    if (n !== null && e !== null) {
      const key = `${n.toFixed(4)}|${e.toFixed(4)}`;
      coordinateCounts.set(key, (coordinateCounts.get(key) ?? 0) + 1);
    }
  }

  return rows.map((row) => {
    const overall = clamp(row.sourceConfidence || 0.9);
    const pointScore = scorePointNumber(row.pointNumber);
    const northScore = scoreCoordinate(row.northing, 'Northing', overall);
    const eastScore = scoreCoordinate(row.easting, 'Easting', overall);
    const issues = [...pointScore.issues, ...northScore.issues, ...eastScore.issues];

    if (hasArabicIndicDigits(row.northing) || hasArabicIndicDigits(row.easting)) {
      issues.push('Arabic-Indic source digits are preserved in the table and normalized only for plotting');
    }

    let confidence = Math.min(pointScore.confidence, northScore.confidence, eastScore.confidence);

    const pointKey = row.pointNumber.trim().toLowerCase();
    if (pointKey && (pointCounts.get(pointKey) ?? 0) > 1) {
      confidence = Math.min(confidence, 0.7);
      issues.push('Duplicate point number');
    }

    const n = parseReviewNumber(row.northing);
    const e = parseReviewNumber(row.easting);
    if (n !== null && e !== null) {
      const key = `${n.toFixed(4)}|${e.toFixed(4)}`;
      if ((coordinateCounts.get(key) ?? 0) > 1) {
        confidence = Math.min(confidence, 0.65);
        issues.push('Duplicate coordinate pair');
      }
    }

    if (confidence < 0.65) {
      issues.push('Low confidence — verify against the source before plotting');
    }

    return {
      ...row,
      confidence: Math.round(confidence * 1000) / 1000,
      fieldConfidence: {
        pointNumber: pointScore.confidence,
        northing: northScore.confidence,
        easting: eastScore.confidence,
        description: row.description.trim() ? 0.92 : 0.8,
      },
      issues: Array.from(new Set(issues)),
    };
  });
}

export function buildDocumentReviewRows(
  rows: ExtractedCoordinateRow[],
  options: BuildReviewOptions = {},
): DocumentReviewRow[] {
  if (rows.length === 0) return [];
  const sourceConfidence = clamp(options.overallConfidence ?? 0.9);

  return recomputeRows(
    rows.map((row, index) => ({
      id: `review-row-${index + 1}`,
      pointNumber: row.pointNumber ?? '',
      northing: row.northingRaw ?? '',
      easting: row.eastingRaw ?? '',
      description: row.description ?? '',
      rawText: row.rawText ?? '',
      page: row.page,
      included: true,
      sourceConfidence,
      confidence: sourceConfidence,
      fieldConfidence: {
        pointNumber: sourceConfidence,
        northing: sourceConfidence,
        easting: sourceConfidence,
        description: sourceConfidence,
      },
      issues: [],
    })),
  );
}

export function updateReviewRow(
  rows: DocumentReviewRow[],
  id: string,
  patch: Partial<Pick<DocumentReviewRow, 'pointNumber' | 'northing' | 'easting' | 'description' | 'included'>>,
): DocumentReviewRow[] {
  return recomputeRows(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
}

export function summarizeReviewRows(rows: DocumentReviewRow[]): DocumentReviewSummary {
  const included = rows.filter((row) => row.included);
  const invalidIncluded = included.filter(
    (row) => !row.pointNumber.trim() || parseReviewNumber(row.northing) === null || parseReviewNumber(row.easting) === null,
  );
  const totalConfidence = rows.reduce((sum, row) => sum + row.confidence, 0);

  return {
    rowCount: rows.length,
    includedCount: included.length,
    invalidIncludedCount: invalidIncluded.length,
    lowConfidenceCount: rows.filter((row) => row.confidence < 0.65).length,
    duplicateCount: rows.filter((row) => row.issues.some((issue) => issue.startsWith('Duplicate'))).length,
    arabicDigitCount: rows.filter(
      (row) => hasArabicIndicDigits(row.northing) || hasArabicIndicDigits(row.easting),
    ).length,
    averageConfidence: rows.length === 0 ? 0 : Math.round((totalConfidence / rows.length) * 1000) / 1000,
  };
}

function csvSafe(value: string): string {
  return value.replace(/[,\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Produce a PNEZD CSV that the existing point-file importer can read.
 * Invalid or excluded rows are deliberately dropped; the UI blocks confirmation
 * while an included row is still invalid, so this is a final safety net.
 */
export function reviewRowsToPnezd(rows: DocumentReviewRow[], precision = 3): string {
  const decimals = Math.max(0, Math.min(8, Math.round(precision)));
  const lines: string[] = ['Point,Northing,Easting,Elevation,Description'];

  for (const row of rows) {
    if (!row.included) continue;
    const point = csvSafe(row.pointNumber);
    const northing = parseReviewNumber(row.northing);
    const easting = parseReviewNumber(row.easting);
    if (!point || northing === null || easting === null) continue;
    lines.push(
      [
        point,
        northing.toFixed(decimals),
        easting.toFixed(decimals),
        (0).toFixed(decimals),
        csvSafe(row.description),
      ].join(','),
    );
  }

  return lines.length > 1 ? lines.join('\n') : '';
}

export function reviewFileName(fileName: string): string {
  const base = fileName.replace(/\.[^/.]+$/, '') || 'document';
  return `${base}-reviewed.pnezd`;
}

interface NumericCandidate {
  raw: string;
  index: number;
  value: number;
  score: number;
  integerDigits: number;
}

function parseCoordinateLine(line: string): ExtractedCoordinateRow | null {
  const cleaned = line.replace(/\u00a0/g, ' ').trim();
  if (!cleaned || /^[-=_|.\s]+$/.test(cleaned)) return null;

  const tokenPattern = /[0-9\u0660-\u0669\u06F0-\u06F9][0-9\u0660-\u0669\u06F0-\u06F9.,\u066B\u066C]*/g;
  const candidates: NumericCandidate[] = [];

  for (const match of cleaned.matchAll(tokenPattern)) {
    const raw = match[0];
    const value = parseReviewNumber(raw);
    if (value === null) continue;
    const { integerDigits, hasDecimal } = coordinateDigits(raw);
    if (integerDigits < 4) continue;
    const score = (hasDecimal ? 3 : 0) + (integerDigits >= 6 ? 2 : integerDigits >= 5 ? 1 : 0);
    candidates.push({ raw, index: match.index ?? 0, value, score, integerDigits });
  }

  if (candidates.length < 2) return null;

  const chosen = [...candidates]
    .sort((a, b) => b.score - a.score || b.integerDigits - a.integerDigits || a.index - b.index)
    .slice(0, 2)
    .sort((a, b) => a.index - b.index);

  if (chosen.length < 2 || chosen[0].index === chosen[1].index) return null;

  const pointNumber = cleaned
    .slice(0, chosen[0].index)
    .replace(/[|,;:\t]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const description = cleaned
    .slice(chosen[1].index + chosen[1].raw.length)
    .replace(/^[|,;:\t]+/g, '')
    .trim();

  return {
    pointNumber,
    northingRaw: chosen[0].raw,
    eastingRaw: chosen[1].raw,
    description,
    rawText: cleaned,
  };
}

/**
 * Extract candidate coordinate rows from PDF text or OCR output.
 * Uses the existing table parser first, then a numeric-line fallback for
 * single-space PDF text and Arabic-labelled tables.
 */
export function extractReviewRowsFromText(text: string): ExtractedCoordinateRow[] {
  const rows: ExtractedCoordinateRow[] = [];
  const seen = new Set<string>();

  const push = (row: ExtractedCoordinateRow) => {
    const n = parseReviewNumber(row.northingRaw);
    const e = parseReviewNumber(row.eastingRaw);
    const key = `${row.pointNumber.trim().toLowerCase()}|${n ?? row.northingRaw}|${e ?? row.eastingRaw}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  };

  try {
    for (const row of planTableParser.parseCoordinateTableFromText(text)) {
      push({
        pointNumber: row.pointNumber,
        northingRaw: row.northingRaw,
        eastingRaw: row.eastingRaw,
        description: '',
        rawText: row.originalRow,
      });
    }
  } catch {
    // The fallback below handles text that the table parser cannot segment.
  }

  for (const line of text.split(/\r?\n/)) {
    const row = parseCoordinateLine(line);
    if (row) push(row);
  }

  return rows;
}
