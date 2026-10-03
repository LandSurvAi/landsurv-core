/**
 * Point File Utilities
 * 
 * Extracted from App.tsx as part of the Strangler Pattern refactoring.
 * Handles parsing and formatting of point data files.
 * 
 * Migration Status: ✅ EXTRACTED
 */

import { SurveyPoint, PointList, Settings } from '../types.ts';

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Parse a point file content string into an array of SurveyPoints.
 * Supports CSV and space-delimited formats with optional header line.
 * 
 * Expected format: PointNumber, Northing, Easting, Elevation, Description
 * 
 * @param content - The raw file content as a string
 * @returns Array of parsed SurveyPoint objects
 */
export const parsePointFile = (content: string): SurveyPoint[] => {
  const points: SurveyPoint[] = [];
  const lines = content.trim().split('\n');
  
  // Skip header line if it exists (starts with letter or #)
  const startLine = /^[a-zA-Z#]/.test(lines[0]) ? 1 : 0;
  
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    const cleanedLine = line.trim();
    if (!cleanedLine) continue;

    // Split by comma or whitespace
    const parts = cleanedLine.split(/[,\s]+/).filter(Boolean);
    if (parts.length < 3) continue; // Need at least PN, N, E

    const pn = parts[0];
    const n = parseFloat(parts[1]);
    const e = parseFloat(parts[2]);
    const z = parts.length > 3 ? parseFloat(parts[3]) : 0;
    const d = parts.length > 4 ? parts.slice(4).join(' ') : '';

    if (pn && !isNaN(n) && !isNaN(e)) {
      points.push({
        pointNumber: pn,
        northing: n,
        easting: e,
        elevation: isNaN(z) ? 0 : z,
        description: d
      });
    }
  }
  
  return points;
};

// ============================================================================
// Formatting Functions
// ============================================================================

/**
 * Convert a PointList to a CSV string with proper precision.
 * 
 * @param pointList - The point list to convert
 * @param settings - App settings (for coordinate precision)
 * @returns CSV-formatted string with header
 */
export const pointListToString = (pointList: PointList, settings: Settings): string => {
  const header = 'Point,Northing,Easting,Elevation,Description';
  const rows = pointList.points.map(p => 
    [
      p.pointNumber,
      p.northing.toFixed(settings.coordinatePrecision),
      p.easting.toFixed(settings.coordinatePrecision),
      (p.elevation ?? 0).toFixed(settings.coordinatePrecision),
      p.description || ''
    ].join(',')
  ).join('\n');
  return `${header}\n${rows}`;
};

/**
 * Format a single survey point as a CSV row
 * 
 * @param point - The survey point to format
 * @param precision - Decimal precision for coordinates
 * @returns CSV row string (no newline)
 */
export const formatPointAsCsvRow = (point: SurveyPoint, precision: number = 3): string => {
  return [
    point.pointNumber,
    point.northing.toFixed(precision),
    point.easting.toFixed(precision),
    (point.elevation ?? 0).toFixed(precision),
    point.description || ''
  ].join(',');
};

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Check if a point number already exists in a list of points
 * 
 * @param pointNumber - The point number to check
 * @param existingPoints - Array of existing points
 * @returns true if the point number exists
 */
export const pointNumberExists = (pointNumber: string, existingPoints: SurveyPoint[]): boolean => {
  return existingPoints.some(p => p.pointNumber === pointNumber);
};

/**
 * Find duplicate point numbers in an array of points
 * 
 * @param points - Array of points to check
 * @returns Array of duplicate point numbers
 */
export const findDuplicatePointNumbers = (points: SurveyPoint[]): string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  
  for (const point of points) {
    if (seen.has(point.pointNumber)) {
      duplicates.add(point.pointNumber);
    }
    seen.add(point.pointNumber);
  }
  
  return Array.from(duplicates);
};

/**
 * Validate that a point has valid coordinates
 * 
 * @param point - Point to validate
 * @returns true if coordinates are valid numbers
 */
export const isValidPoint = (point: Partial<SurveyPoint>): point is SurveyPoint => {
  return !!(
    point.pointNumber &&
    typeof point.northing === 'number' &&
    typeof point.easting === 'number' &&
    !isNaN(point.northing) &&
    !isNaN(point.easting)
  );
};

// ============================================================================
// Point Numbering Utilities
// ============================================================================

/**
 * Convert a number to alphabetic format (1 -> A, 26 -> Z, 27 -> AA, etc.)
 * 
 * @param num - Number to convert (1-based)
 * @returns Alphabetic string
 */
export const numberToAlpha = (num: number): string => {
  let alpha = '';
  for (; num > 0; num = Math.floor((num - 1) / 26)) {
    alpha = String.fromCharCode(((num - 1) % 26) + 65) + alpha;
  }
  return alpha;
};

/**
 * Generate the next available point number based on labeling settings
 * 
 * @param existingPointNumbers - Set of existing point numbers
 * @param style - 'numeric' or 'alphabetic'
 * @param prefix - Optional prefix for point numbers
 * @param startNumber - Starting number to check from
 * @returns Next available point number
 */
export const getNextPointNumber = (
  existingPointNumbers: Set<string>,
  style: 'numeric' | 'alphabetic',
  prefix: string = '',
  startNumber: number = 1
): string => {
  let currentNum = startNumber;
  let nextPn = '';

  while (true) {
    const numPart = style === 'alphabetic' ? numberToAlpha(currentNum) : String(currentNum);
    nextPn = `${prefix}${numPart}`;
    if (!existingPointNumbers.has(nextPn)) {
      break;
    }
    currentNum++;
  }
  
  return nextPn;
};

// ============================================================================
// Point List Utilities
// ============================================================================

/**
 * Merge multiple point lists into one, handling duplicates
 * 
 * @param pointLists - Array of point lists to merge
 * @param strategy - How to handle duplicates ('keep-first', 'keep-last', 'skip')
 * @returns Merged array of points
 */
export const mergePointLists = (
  pointLists: PointList[],
  strategy: 'keep-first' | 'keep-last' | 'skip' = 'keep-first'
): SurveyPoint[] => {
  const pointMap = new Map<string, SurveyPoint>();
  
  for (const list of pointLists) {
    for (const point of list.points) {
      const exists = pointMap.has(point.pointNumber);
      
      if (!exists || strategy === 'keep-last') {
        pointMap.set(point.pointNumber, point);
      }
      // 'keep-first' and 'skip' both ignore duplicates
    }
  }
  
  return Array.from(pointMap.values());
};

/**
 * Filter points by description pattern
 * 
 * @param points - Array of points to filter
 * @param pattern - String to search for (case-insensitive)
 * @returns Filtered array of points
 */
export const filterPointsByDescription = (
  points: SurveyPoint[],
  pattern: string
): SurveyPoint[] => {
  if (!pattern) return points;
  const searchPattern = pattern.toUpperCase();
  return points.filter(p => 
    p.description?.toUpperCase().includes(searchPattern)
  );
};
