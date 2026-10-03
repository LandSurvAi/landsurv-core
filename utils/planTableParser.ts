import { SurveyPoint } from '../types.ts';
import { computePolygonArea, validateCoordinates } from './coordinateValidation.ts';

/**
 * Parse a coordinate value attempting to normalize commas and stray chars
 */
function parseCoordinateValue(val: string): number | null {
  if (!val) return null;
  
  // Clean up: remove spaces and commas, keep digits and decimal point
  const cleaned = val
    .replace(/[,\s]+/g, '')      // Remove commas and spaces
    .replace(/[^\d.\-]/g, '')    // Keep only digits, decimal, minus
    .trim();
  
  if (cleaned.length === 0) return null;
  
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Best effort parse of a table-like block of text to extract rows like: "W.P. 1  380351.8276  237971.3794"
 * Supports variable separators and column ordering; returns list of objects with originalRow and fields guessed
 */
export function parseCoordinateTableFromText(block: string): { pointNumber: string; northingRaw: string; eastingRaw: string; northing?: number; easting?: number; originalRow: string }[] {
  console.log('parseCoordinateTableFromText called with block:', block);
  const rows: { pointNumber: string; northingRaw: string; eastingRaw: string; northing?: number; easting?: number; originalRow: string }[] = [];
  const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  console.log('lines:', lines);

  // Find the actual header row with column names (WORK POINT, NORTHING, EASTING)
  let headerRowIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const low = lines[i].toLowerCase();
    // Look for row with WORK POINT/NORTHING/EASTING together
    if ((low.includes('work point') || low.includes('workpoint') || low.includes('wp')) &&
        (low.includes('northing') || low.includes('n.')) &&
        (low.includes('easting') || low.includes('e.'))) {
      headerRowIndex = i;
      break;
    }
  }

  // If not found, look for just "WORK POINT COORDINATES" and use next line as header
  if (headerRowIndex === -1) {
    for (let i = 0; i < lines.length; i++) {
      if (/^work point coordinates/i.test(lines[i])) {
        const nextLine = lines[i + 1];
        if (nextLine && /\d/.test(nextLine)) {
          // Next line has numbers, treat as data, no header
          headerRowIndex = i; // Start data from next line
        } else {
          headerRowIndex = i + 1; // Next line should be column header
        }
        break;
      }
    }
  }

  // If still not found, start from beginning
  if (headerRowIndex === -1) headerRowIndex = 0;

  // Parse the header row to identify column positions
  let pointColIndex = 0;
  let northingColIndex = 1;
  let eastingColIndex = 2;
  
  let useDefaultColumns = false;
  const headerLine = lines[headerRowIndex];
  if (headerLine && /^work point coordinates/i.test(headerLine)) {
    // Title line, not header, use default columns
    useDefaultColumns = true;
  } else {
    const headerParts = headerLine.split(/[\t,]|\s{2,}/).map(p => p.trim()).filter(Boolean);
    
    // Auto-detect column order from header
    for (let i = 0; i < headerParts.length; i++) {
      const part = headerParts[i].toLowerCase();
      if (part.includes('point') || part.includes('wp') || part === 'wp.') {
        pointColIndex = i;
      } else if (part.includes('north') || part === 'n.' || part === 'n') {
        northingColIndex = i;
      } else if (part.includes('east') || part === 'e.' || part === 'e') {
        eastingColIndex = i;
      }
    }
  }

  console.log('headerRowIndex:', headerRowIndex);

  // Parse data rows (start after header row)
  for (let i = headerRowIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip separator lines (dashes, equals, pipes)
    if (/^[-=|]+$/.test(line.trim())) continue;
    
    // Skip if line looks like another header
    const lineLower = line.toLowerCase();
    if (/^(northing|easting|work point|site point|wp\.|wp\s+no|point no)/i.test(lineLower)) continue;
    
    // Skip very short lines (likely garbage)
    if (line.trim().length < 5) continue;

    // Split by tabs, commas, or multiple spaces
    const parts = line.split(/[\t,]|\s{2,}/).map(p => p.trim()).filter(Boolean);

    console.log('Processing line:', line, 'parts:', parts);

    if (parts.length >= 3) {
      // Use detected column indices
      const pn = parts[pointColIndex] || parts[0];
      const nRaw = parts[northingColIndex] || parts[1];
      const eRaw = parts[eastingColIndex] || parts[2];

      // Only add if we have at least a point number and two numeric values
      if (pn && nRaw && eRaw && /\d/.test(nRaw) && /\d/.test(eRaw)) {
        console.log(`[TableParser] Row ${rows.length + 1}: PN="${pn}", N="${nRaw}", E="${eRaw}" | Parts: ${parts.join(' | ')}`);
        rows.push({ pointNumber: pn, northingRaw: nRaw, eastingRaw: eRaw, originalRow: line });
      }
    }
  }

  // Try parsing numeric values
  rows.forEach(r => {
    r.northing = parseCoordinateValue(r.northingRaw as string) ?? undefined;
    r.easting = parseCoordinateValue(r.eastingRaw as string) ?? undefined;
  });

  return rows;
}

/**
 * Heuristic to try and guess column swap between northing and easting based on ranges
 */
export function attemptAutoFixRows(rows: { pointNumber: string; northingRaw: string; eastingRaw: string; northing?: number; easting?: number; originalRow: string }[]) {
  const pts = rows.map(r => ({ ...r }));

  const northings = pts.map(p => p.northing).filter((n): n is number => n !== undefined);
  const eastings = pts.map(p => p.easting).filter((e): e is number => e !== undefined);

  if (northings.length === 0 || eastings.length === 0) return { rows: pts, fixed: false, reason: 'No parseable numbers found' };

  const northingMin = Math.min(...northings);
  const northingMax = Math.max(...northings);
  const eastingMin = Math.min(...eastings);
  const eastingMax = Math.max(...eastings);

  // Heuristic 1: obvious swapped magnitudes
  const likelySwap = (northingMax < 10000 && eastingMin > 10000) || (northingMax < eastingMin / 10);

  if (likelySwap) {
    pts.forEach(p => {
      const tmp = p.northing;
      p.northing = p.easting;
      p.easting = tmp;
      // swap raw as well
      const tmpRaw = p.northingRaw;
      p.northingRaw = p.eastingRaw;
      p.eastingRaw = tmpRaw;
    });

    return { rows: pts, fixed: true, reason: 'Detected likely column swap, swapped northing/easting' };
  }

  // Heuristic 2: Compare polygon area before and after swap - pick the more reasonable polygon
  try {
    const originalPoints = convertRowsToPoints(pts);
    const areaOriginal = computePolygonArea(originalPoints);
    // swapped
    const swappedRows = pts.map(r => ({ ...r, northing: r.easting, easting: r.northing, northingRaw: r.eastingRaw, eastingRaw: r.northingRaw }));
    const swappedPoints = convertRowsToPoints(swappedRows);
    const areaSwapped = computePolygonArea(swappedPoints);
    const valOrig = validateCoordinates(originalPoints, 'workpoints');
    const valSwapped = validateCoordinates(swappedPoints, 'workpoints');
    // DEBUG: log areas & validation
    try { console.log('DEBUG areaOriginal:', areaOriginal, 'areaSwapped:', areaSwapped, 'valOrig:', valOrig, 'valSwapped:', valSwapped); } catch (e) {}

    // Use area logic to decide
    // Prefer swapped if swapped validation is valid and original is not
      if ((valSwapped.isValid && !valOrig.isValid) || (areaSwapped > areaOriginal && areaSwapped < 1e12)) {
      return { rows: swappedRows, fixed: true, reason: 'Swapped columns based on polygon area heuristic' };
    }
  } catch (e) {
    // Ignored - if compute not available or fails
  }

  // If not swapped, check for thousands separators or mixed formats - already removed
  return { rows: pts, fixed: false, reason: 'No swap detected' };
}

/**
 * Convert parsed rows into SurveyPoint objects (best effort)
 */
export function convertRowsToPoints(rows: { pointNumber: string; northingRaw: string; eastingRaw: string; northing?: number; easting?: number; originalRow: string }[]): SurveyPoint[] {
  const points: SurveyPoint[] = [];
  for (const r of rows) {
    if (r.pointNumber && r.northing !== undefined && r.easting !== undefined) {
      points.push({
        pointNumber: r.pointNumber.toString(),
        northing: r.northing,
        easting: r.easting,
        elevation: 0,
        description: r.originalRow,
      });
    }
  }
  return points;
}

/**
 * Parse table structure from OCR text
 * Returns structured tables for later processing
 */
export function parseTableStructureFromText(text: string): Array<{
  headerRow?: string[];
  rows: string[][];
  rawText: string;
}> {
  const tables: Array<{
    headerRow?: string[];
    rows: string[][];
    rawText: string;
  }> = [];

  const tableMarkers = [
    'WORK POINT COORDINATES',
    'WORK POINTS',
    'COORDINATES',
    'SURVEY POINTS',
    'SURVEY CORNERS',
  ];

  const lines = text.split('\n').map((line) => line.trim());

  let inTable = false;
  let tableLines: string[] = [];

  for (const line of lines) {
    // Check for table markers
    const isMarker = tableMarkers.some((marker) => line.toUpperCase().includes(marker));
    
    if (isMarker && !inTable) {
      inTable = true;
      tableLines = [line];
    } else if (inTable) {
      // End of table (empty line or new section)
      if (line === '' || (line.match(/^[A-Z]{2,}/) && !line.match(/^\d/))) {
        if (tableLines.length > 0) {
          const structured = structureTableDataFromLines(tableLines);
          if (structured.rows.length > 0) {
            tables.push(structured);
          }
        }
        inTable = false;
        tableLines = [];
      } else {
        tableLines.push(line);
      }
    }
  }

  // Process remaining table
  if (inTable && tableLines.length > 0) {
    const structured = structureTableDataFromLines(tableLines);
    if (structured.rows.length > 0) {
      tables.push(structured);
    }
  }

  return tables;
}

/**
 * Structure table data from raw lines
 */
function structureTableDataFromLines(lines: string[]): {
  headerRow?: string[];
  rows: string[][];
  rawText: string;
} {
  const rows: string[][] = [];
  let headerRow: string[] | undefined;
  const rawText = lines.join('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip title lines
    if (i === 0 && line.toUpperCase().match(/WORK POINT|COORDINATES|SURVEY/)) {
      continue;
    }

    // Detect header (contains Northing, Easting, Point, etc.)
    if (!headerRow && line.toUpperCase().match(/NORTH|EAST|POINT|NUMBER|DESCRIPTION/)) {
      headerRow = parseRowLine(line);
      continue;
    }

    // Parse data rows
    if (line && !line.match(/^-+$/) && !line.match(/^=+$/)) {
      const row = parseRowLine(line);
      if (row.length > 0 && row.some((cell) => cell.match(/^\d/))) {
        rows.push(row);
      }
    }
  }

  return { headerRow, rows, rawText };
}

/**
 * Parse a single row line from table text
 */
function parseRowLine(line: string): string[] {
  const delimiters = ['\t', '|', '  ', ' '];
  for (const delimiter of delimiters) {
    if (line.includes(delimiter)) {
      return line
        .split(delimiter)
        .map((cell) => cell.trim())
        .filter((cell) => cell);
    }
  }
  return [line];
}

export default {
  parseCoordinateTableFromText,
  attemptAutoFixRows,
  convertRowsToPoints,
  parseTableStructureFromText,
};
