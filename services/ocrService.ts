/**
 * OCR Service - Handles table detection and text extraction from images/PDFs
 * Uses Google Document AI for production-grade OCR, with Tesseract.js as fallback
 * 
 * Features:
 * - Google Document AI for high-accuracy table extraction
 * - Tesseract.js fallback for offline/batch processing
 * - Automatic table detection and structure preservation
 * - Coordinate table focused extraction
 */

import Tesseract from 'tesseract.js';

export interface OCRResult {
  success: boolean;
  text: string;
  tables: TableData[];
  method: 'google-document-ai' | 'tesseract' | 'none';
  confidence?: number;
  error?: string;
}

export interface TableData {
  headerRow?: string[];
  rows: string[][];
  rawText: string;
  confidence?: number;
}

export interface GoogleDocAIConfig {
  projectId: string;
  processorId: string;
  location: string;
}

/**
 * Extract text and tables from an image or PDF using OCR
 * Automatically detects coordinate tables (WORK POINT COORDINATES, etc.)
 * 
 * @param imageData - Image data as Uint8Array, Blob, or File
 * @param config - Google Document AI configuration (optional)
 * @param useGoogleDocAI - Whether to attempt Google Document AI first (default: true if config provided)
 * @returns OCRResult with extracted text and structured table data
 */
export async function extractTableFromImage(
  imageData: Uint8Array | Blob | File,
  config?: GoogleDocAIConfig,
  useGoogleDocAI: boolean = !!config
): Promise<OCRResult> {
  try {
    // Attempt Google Document AI if configured and enabled
    if (useGoogleDocAI && config) {
      try {
        const result = await extractUsingGoogleDocAI(imageData, config);
        if (result.success) {
          console.log('[OCR] Google Document AI extraction successful');
          return result;
        }
      } catch (error) {
        console.warn('[OCR] Google Document AI failed, falling back to Tesseract:', error);
      }
    }

    // Fallback to Tesseract.js
    console.log('[OCR] Using Tesseract.js for OCR extraction');
    return await extractUsingTesseract(imageData);
  } catch (error) {
    console.error('[OCR] All extraction methods failed:', error);
    return {
      success: false,
      text: '',
      tables: [],
      method: 'none',
      error: `OCR extraction failed: ${(error as Error).message}`,
    };
  }
}

/**
 * Extract using Google Document AI (for table detection and high accuracy)
 * Requires valid Google Cloud credentials and a deployed Document AI processor
 * 
 * @param imageData - Image data as Uint8Array, Blob, or File
 * @param config - Google Document AI configuration
 * @returns OCRResult with Google Document AI results
 */
async function extractUsingGoogleDocAI(
  imageData: Uint8Array | Blob | File,
  config: GoogleDocAIConfig
): Promise<OCRResult> {
  // Convert Blob/File to base64 if needed
  let base64Data: string;
  if (imageData instanceof Uint8Array) {
    base64Data = btoa(String.fromCharCode.apply(null, Array.from(imageData)));
  } else if (imageData instanceof Blob) {
    const buffer = await imageData.arrayBuffer();
    base64Data = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(buffer))));
  } else {
    base64Data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(imageData);
    });
  }

  // Note: This endpoint should be called from a backend server with proper authentication
  // For now, we provide the structure. In production, implement a backend route that
  // calls Google Document AI with proper credentials.
  try {
    const response = await fetch('/api/ocr/document-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: config.projectId,
        processorId: config.processorId,
        location: config.location,
        imageBase64: base64Data,
      }),
    });

    if (!response.ok) {
      throw new Error(`Google Document AI API error: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      success: true,
      text: data.fullText || '',
      tables: data.tables || [],
      method: 'google-document-ai',
      confidence: data.confidence,
    };
  } catch (error) {
    throw new Error(`Failed to call Google Document AI backend: ${(error as Error).message}`);
  }
}

/**
 * Extract using Tesseract.js (client-side OCR, no API key required)
 * Good for offline use and general text extraction
 * 
 * @param imageData - Image data as Uint8Array, Blob, or File
 * @returns OCRResult with Tesseract results
 */
async function extractUsingTesseract(imageData: Uint8Array | Blob | File): Promise<OCRResult> {
  try {
    let imageUrl: string;
    if (imageData instanceof Blob || imageData instanceof File) {
      imageUrl = URL.createObjectURL(imageData);
    } else {
      // Convert Uint8Array to Blob safely
      const uint8Array = new Uint8Array(imageData);
      const blob = new Blob([uint8Array], { type: 'image/png' });
      imageUrl = URL.createObjectURL(blob);
    }

    const result = await Tesseract.recognize(imageUrl, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing') {
          console.log(`[OCR] Tesseract progress: ${Math.round(m.progress * 100)}%`);
        }
      },
    });

    const text = result.data.text || '';
    const tables = parseTablesFromText(text);
    const confidence = result.data.confidence || 0;

    URL.revokeObjectURL(imageUrl);

    return {
      success: true,
      text,
      tables,
      method: 'tesseract',
      confidence: confidence / 100, // Convert to 0-1 scale
    };
  } catch (error) {
    throw new Error(`Tesseract OCR failed: ${(error as Error).message}`);
  }
}

/**
 * Parse structured tables from extracted text
 * Detects common table formats and coordinate table markers
 * 
 * @param text - Raw OCR text
 * @returns Array of detected tables
 */
export function parseTablesFromText(text: string): TableData[] {
  const tables: TableData[] = [];

  // Common coordinate table markers
  const tableMarkers = [
    'WORK POINT COORDINATES',
    'WORK POINTS',
    'COORDINATES',
    'SURVEY POINTS',
    'SURVEY CORNERS',
    'BOUNDARY POINTS',
    'BEARINGS AND DISTANCES',
  ];

  // Split text into lines
  const lines = text.split('\n').map((line) => line.trim());

  let currentTableLines: string[] = [];
  let inTable = false;
  let currentMarker = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for table start markers
    const foundMarker = tableMarkers.find((marker) => line.toUpperCase().includes(marker));
    if (foundMarker && !inTable) {
      inTable = true;
      currentMarker = foundMarker;
      currentTableLines = [line];
      continue;
    }

    if (inTable) {
      // Detect end of table (empty line or new section)
      if (line === '' || (line.match(/^[A-Z]{2,}/) && !line.match(/^\d/))) {
        // Process accumulated table lines
        const tableData = structureTableData(currentTableLines);
        if (tableData.rows.length > 0) {
          tables.push(tableData);
        }
        inTable = false;
        currentTableLines = [];
      } else {
        currentTableLines.push(line);
      }
    }
  }

  // Process any remaining table
  if (inTable && currentTableLines.length > 0) {
    const tableData = structureTableData(currentTableLines);
    if (tableData.rows.length > 0) {
      tables.push(tableData);
    }
  }

  return tables;
}

/**
 * Convert raw table lines into structured TableData
 * Handles various delimiter formats (tabs, spaces, pipes)
 * 
 * @param lines - Raw lines from table section
 * @returns Structured table data with header and rows
 */
function structureTableData(lines: string[]): TableData {
  if (lines.length === 0) {
    return { rows: [], rawText: '' };
  }

  const rawText = lines.join('\n');
  const rows: string[][] = [];
  let headerRow: string[] | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip title/marker lines
    if (i === 0 && line.toUpperCase().match(/WORK POINT|COORDINATES|SURVEY/)) {
      continue;
    }

    // Detect header row (common patterns: "Northing", "Easting", "Point", "Number")
    if (!headerRow && line.toUpperCase().match(/NORTH|EAST|POINT|NUMBER|DESCRIPTION/)) {
      headerRow = parseRow(line);
      continue;
    }

    // Parse data rows
    if (line && !line.match(/^-+$/) && !line.match(/^=+$/)) {
      const row = parseRow(line);
      if (row.length > 0 && row[0]) {
        // Filter rows that look like data (have numeric values)
        if (row.some((cell) => cell.match(/^\d/))) {
          rows.push(row);
        }
      }
    }
  }

  return {
    headerRow,
    rows,
    rawText,
  };
}

/**
 * Parse a single row from table text
 * Handles tab-delimited, space-delimited, and pipe-delimited formats
 * 
 * @param line - Single table row as string
 * @returns Array of cell values
 */
function parseRow(line: string): string[] {
  // Try different delimiters in order of preference
  const delimiters = ['\t', '|', '  ', ' '];

  for (const delimiter of delimiters) {
    if (line.includes(delimiter)) {
      return line
        .split(delimiter)
        .map((cell) => cell.trim())
        .filter((cell) => cell);
    }
  }

  // If no delimiter found, return whole line as single cell
  return [line];
}

/**
 * Extract coordinate table specifically for Civil Plans
 * Focused extraction of Northing/Easting tables
 * 
 * @param ocrResult - Result from extractTableFromImage
 * @returns Extracted coordinate rows with standardized format
 */
export function extractCoordinateTable(ocrResult: OCRResult): {
  rows: { pointNumber: string; northing: string; easting: string; description: string }[];
  success: boolean;
} {
  const coordinateRows: { pointNumber: string; northing: string; easting: string; description: string }[] = [];

  for (const table of ocrResult.tables) {
    // Look for tables with North/East related headers
    const hasCoordinateHeaders = table.headerRow
      ? table.headerRow.some((h) => /NORTH|EAST|EASTING|NORTHING/i.test(h))
      : table.rows.some((row) => row.some((cell) => /NORTH|EAST|EASTING|NORTHING|POINT/i.test(cell)));

    if (hasCoordinateHeaders || table.rawText.includes('NORTH')) {
      // Determine column indices
      const headerRow = table.headerRow || [];
      const northIdx = headerRow.findIndex((h) => /NORTH/i.test(h));
      const eastIdx = headerRow.findIndex((h) => /EAST/i.test(h));
      const pointIdx = headerRow.findIndex((h) => /POINT|NUMBER/i.test(h));

      for (const row of table.rows) {
        // Best-effort extraction if headers not found
        const pointNumber = pointIdx >= 0 ? row[pointIdx] : row[0] || '';
        const northing = northIdx >= 0 ? row[northIdx] : row[northIdx >= 0 ? northIdx : 1] || '';
        const easting = eastIdx >= 0 ? row[eastIdx] : row[eastIdx >= 0 ? eastIdx : 2] || '';
        const description = row[row.length - 1] || '';

        // Only add if we have numeric coordinates
        if (northing.match(/\d/) && easting.match(/\d/)) {
          coordinateRows.push({
            pointNumber: pointNumber.replace(/[^\w.-]/g, ''),
            northing,
            easting,
            description,
          });
        }
      }
    }
  }

  return {
    rows: coordinateRows,
    success: coordinateRows.length > 0,
  };
}

/**
 * Cleanup and normalize OCR text
 * Removes artifacts, fixes common OCR errors
 * 
 * @param text - Raw OCR text
 * @returns Cleaned text
 */
export function cleanOCRText(text: string): string {
  return text
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/([0-9])\s*([A-Z])/g, '$1 $2') // Fix spacing between numbers and letters
    .replace(/([a-z])\s*([0-9])/g, '$1 $2') // Fix spacing between letters and numbers
    .replace(/o([0-9]{5,})/gi, '0$1') // Fix OCR 'o' to '0' for large numbers
    .trim();
}
