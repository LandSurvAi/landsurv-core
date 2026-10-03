/**
 * Client-side OCR Integration
 * Handles calling the backend OCR service and processing results
 */

import planTableParser from './planTableParser';
import { extractCoordinateTable as extractCoordTableFromOCR } from '../services/ocrService';
import { processAndCorrectCoordinates } from '../services/geminiService';

export interface OCRProcessingResult {
  success: boolean;
  tableText: string;
  tableRows: Array<{
    pointNumber: string;
    northingRaw: string;
    eastingRaw: string;
    description: string;
    rawText: string;
  }>;
  confidence: number;
  method: 'google-document-ai' | 'tesseract' | 'error';
  error?: string;
}

/**
 * Process an image file using the backend OCR service
 * First tries Google Document AI, falls back to Tesseract.js
 * 
 * @param imageFile - Image file (Blob or File)
 * @param userId - User ID for authentication
 * @returns OCR processing result with extracted tables
 */
export async function processImageWithOCR(
  imageFile: Blob | File,
  userId: string
): Promise<OCRProcessingResult> {
  console.log('[OCRClient] Starting image processing for user', userId);

  try {
    // Convert image to base64
    const base64 = await fileToBase64(imageFile);

    // Try backend OCR service first
    try {
      console.log('[OCRClient] Attempting Google Document AI via backend...');
      const result = await callBackendOCR(base64, userId);
      if (result.success) {
        console.log('[OCRClient] Google Document AI succeeded');
        return result;
      }
      console.log('[OCRClient] Google Document AI unavailable, will fall back to Tesseract');
    } catch (error) {
      console.warn('[OCRClient] Backend OCR call failed:', error);
    }

    // Fallback to client-side Tesseract.js
    console.log('[OCRClient] Falling back to Tesseract.js');
    return await processImageWithTesseract(base64);
  } catch (error) {
    console.error('[OCRClient] Image processing failed:', error);
    return {
      success: false,
      tableText: '',
      tableRows: [],
      confidence: 0,
      method: 'error',
      error: `OCR processing failed: ${(error as Error).message}`,
    };
  }
}

/**
 * Call backend OCR service
 * Requires x-user-id header for authentication
 */
async function callBackendOCR(imageBase64: string, userId: string): Promise<OCRProcessingResult> {
  const response = await fetch('/api/ocr/document-ai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId,
    },
    body: JSON.stringify({
      imageBase64,
    }),
  });

  if (!response.ok) {
    if (response.status === 503) {
      // Service unavailable - Document AI not configured, but fallback available
      console.log('[OCRClient] Document AI service unavailable (expected in dev)', response.statusText);
      throw new Error('Document AI not configured');
    }
    throw new Error(`Backend OCR failed: ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Backend OCR failed');
  }

  // Extract coordinate tables from OCR results
  const tableText = data.fullText || '';
  const tables = data.tables || [];

  // Parse tables into coordinate rows
  const tableRows = extractCoordinateRowsFromTables(tables, tableText);

  return {
    success: true,
    tableText,
    tableRows,
    confidence: data.confidence || 0.8,
    method: 'google-document-ai',
  };
}

/**
 * Process using client-side Tesseract.js
 */
async function processImageWithTesseract(imageBase64: string): Promise<OCRProcessingResult> {
  try {
    // Import Tesseract dynamically to avoid issues if not available
    const Tesseract = (await import('tesseract.js')).default;

    // Convert base64 to blob
    const byteCharacters = atob(imageBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/png' });
    const imageUrl = URL.createObjectURL(blob);

    console.log('[OCRClient] Starting Tesseract recognition...');

    const result = await Tesseract.recognize(imageUrl, 'eng', {
      logger: (m: any) => {
        if (m.status === 'recognizing') {
          console.log(`[OCRClient] Tesseract progress: ${Math.round(m.progress * 100)}%`);
        }
      },
    });

    const tableText = result.data.text || '';
    const tables = planTableParser.parseTableStructureFromText(tableText);

    URL.revokeObjectURL(imageUrl);

    return {
      success: true,
      tableText,
      tableRows: extractCoordinateRowsFromTables(tables, tableText),
      confidence: (result.data.confidence || 0) / 100, // Convert to 0-1 scale
      method: 'tesseract',
    };
  } catch (error) {
    console.error('[OCRClient] Tesseract processing failed:', error);
    throw error;
  }
}

/**
 * Extract coordinate table rows from parsed tables
 */
function extractCoordinateRowsFromTables(
  tables: any[],
  fullText: string
): Array<{
  pointNumber: string;
  northingRaw: string;
  eastingRaw: string;
  description: string;
  rawText: string;
}> {
  const rows: Array<{
    pointNumber: string;
    northingRaw: string;
    eastingRaw: string;
    description: string;
    rawText: string;
  }> = [];

  for (const table of tables) {
    // Check if this looks like a coordinate table
    const headerRow = table.headerRow || [];
    const hasCoordHeaders =
      headerRow.some((h: string) => /NORTH/i.test(h)) ||
      headerRow.some((h: string) => /EAST/i.test(h)) ||
      table.rawText.toUpperCase().includes('NORTHING') ||
      table.rawText.toUpperCase().includes('EASTING');

    if (!hasCoordHeaders) {
      continue;
    }

    // Find column indices
    const northIdx = headerRow.findIndex((h: string) => /NORTH/i.test(h));
    const eastIdx = headerRow.findIndex((h: string) => /EAST/i.test(h));
    const pointIdx = headerRow.findIndex((h: string) => /POINT|NUMBER/i.test(h));

    // Process rows
    for (const row of table.rows) {
      if (!row || row.length < 2) {
        continue;
      }

      const pointNumber = pointIdx >= 0 ? row[pointIdx] : row[0];
      const northingRaw = northIdx >= 0 ? row[northIdx] : row[1];
      const eastingRaw = eastIdx >= 0 ? row[eastIdx] : row[2];
      const description = row[row.length - 1] || '';

      // Only add if we have numeric coordinates
      if (northingRaw && eastingRaw && northingRaw.match(/\d/) && eastingRaw.match(/\d/)) {
        rows.push({
          pointNumber: String(pointNumber).replace(/[^\w.-]/g, ''),
          northingRaw: String(northingRaw),
          eastingRaw: String(eastingRaw),
          description: String(description),
          rawText: row.join('\t'),
        });
      }
    }
  }

  return rows;
}

/**
 * Convert blob to base64
 */
function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Parse table structure from OCR text (fallback)
 * Exported here for compatibility with existing code
 */
export function parseTableStructureFromText(text: string): Array<{
  headerRow?: string[];
  rows: string[][];
  rawText: string;
}> {
  return planTableParser.parseTableStructureFromText(text);
}

/**
 * Extract and correct coordinates from OCR results
 * Applies advanced validation and auto-correction for common OCR errors
 * 
 * @param ocrResult - Raw OCR processing result
 * @returns Corrected coordinates with metadata
 */
export function extractAndCorrectCoordinates(ocrResult: OCRProcessingResult) {
  if (!ocrResult.success || !ocrResult.tableRows) {
    console.warn('[OCRClient] Cannot correct coordinates - OCR failed');
    return [];
  }

  try {
    // Convert raw OCR rows to coordinate objects
    const extracted = ocrResult.tableRows.map(row => ({
      pointName: row.pointNumber,
      northing: parseFloat(row.northingRaw),
      easting: parseFloat(row.eastingRaw),
    }));

    // Apply advanced correction algorithm
    console.log('[OCRClient] Applying coordinate corrections...');
    const corrected = processAndCorrectCoordinates(extracted);

    // Log any corrections made
    corrected.forEach(coord => {
      if (coord.corrections && coord.corrections.length > 0) {
        console.log(`[OCRClient] Corrections for ${coord.pointName}:`, coord.corrections);
      }
    });

    return corrected;
  } catch (error) {
    console.error('[OCRClient] Coordinate correction failed:', error);
    // Return original coordinates if correction fails
    return ocrResult.tableRows.map(row => ({
      pointName: row.pointNumber,
      northing: parseFloat(row.northingRaw),
      easting: parseFloat(row.eastingRaw),
      corrections: ['Could not apply automatic correction'],
      confidence: 0,
    }));
  }
}
