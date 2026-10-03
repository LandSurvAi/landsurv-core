/**
 * Contour Service
 * 
 * Handles contour generation logic, filtering, and settings management.
 * Wraps the core generateContours utility and provides business logic for:
 * - Point filtering based on description
 * - Contour generation with parameters
 * - Settings updates from AI chat responses
 * 
 * @module services/contourService
 */

import { SurveyPoint, SurveyLine, ContourLabel, ContourSettings } from '../types';
import { generateContours, type ElevationFilterReport } from '../utils/contouring';

/**
 * Filter survey points by description pattern
 * 
 * @param points - All survey points
 * @param filterDescription - Text to search for in point descriptions (case-insensitive)
 * @returns Filtered array of points matching the description
 */
export function filterPointsByDescription(
  points: SurveyPoint[],
  filterDescription: string
): SurveyPoint[] {
  const filter = filterDescription.trim().toUpperCase();
  if (!filter) {
    return points;
  }
  return points.filter(p => p.description?.toUpperCase().includes(filter));
}

/**
 * Generate contours from survey points with current settings
 * 
 * @param points - All survey points
 * @param lines - All survey lines (used to find breaklines)
 * @param contourSettings - Current contour configuration
 * @returns Object with generated contour lines, labels, and an elevation-exclusion report
 * @throws Error if there are fewer than 3 points to contour
 */
export function generateContoursWithSettings(
  points: SurveyPoint[],
  lines: SurveyLine[],
  contourSettings: ContourSettings
): { lines: SurveyLine[]; labels: ContourLabel[]; elevationReport: ElevationFilterReport } {
  // Filter points if description filter is specified
  const pointsToContour = filterPointsByDescription(
    points,
    contourSettings.pointFilterDescription
  );

  if (pointsToContour.length < 3) {
    throw new Error("Not enough points to generate contours. At least 3 points are required.");
  }

  // Extract breaklines from all lines
  const breaklines = lines.filter(l => l.type === 'breakline');

  // Call the core contour generation utility
  return generateContours(
    pointsToContour,
    contourSettings.contourInterval,
    contourSettings.majorInterval,
    contourSettings.smoothing,
    contourSettings.showLabels,
    contourSettings.labelDensity,
    breaklines,
    undefined,
    undefined,
    {
      mode: contourSettings.elevationFilterMode ?? 'auto',
      minElevation: contourSettings.minElevation ?? null,
      maxElevation: contourSettings.maxElevation ?? null,
    }
  );
}

/**
 * Update contour settings from AI-generated parameters
 * Parses interval values which might be in the format "1'", "1 ft", etc.
 * 
 * @param currentSettings - Current contour settings
 * @param updates - Partial updates to apply
 * @returns Updated contour settings object
 */
export function updateContourSettings(
  currentSettings: ContourSettings,
  updates: Partial<ContourSettings>
): ContourSettings {
  const newSettings: ContourSettings = {
    ...currentSettings,
    ...updates,
  };

  // Validate contour interval
  if (newSettings.contourInterval <= 0) {
    throw new Error("Contour interval must be greater than 0");
  }

  // Ensure major interval is at least as large as contour interval
  if (newSettings.majorInterval < newSettings.contourInterval) {
    newSettings.majorInterval = newSettings.contourInterval;
  }

  // Validate smoothing is within reasonable range
  if (newSettings.smoothing < 0) newSettings.smoothing = 0;
  if (newSettings.smoothing > 5) newSettings.smoothing = 5;

  return newSettings;
}

/**
 * Parse interval value from AI response text
 * Handles formats like "1'", "1 ft", "1 foot", "1.5 feet", etc.
 * 
 * @param text - Text potentially containing an interval value
 * @returns Parsed numeric interval or null if not found
 */
export function parseIntervalFromText(text: string): number | null {
  // Look for patterns like: 1', 1 ft, 1 foot, 1.5 feet, etc.
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:foot|feet|ft|')?/i);
  if (match && match[1]) {
    const value = parseFloat(match[1]);
    return isNaN(value) ? null : value;
  }
  return null;
}

/**
 * Parse contour settings from AI chat response
 * Attempts to extract interval, major interval, smoothing, and filter from text
 * 
 * @param responseText - AI-generated text response
 * @param currentSettings - Current settings to use as defaults
 * @returns Partial settings object with parsed values, or empty object if nothing found
 */
export function parseContourSettingsFromAI(
  responseText: string,
  currentSettings: ContourSettings
): Partial<ContourSettings> {
  const updates: Partial<ContourSettings> = {};

  // Look for interval mentions (e.g., "1-foot", "2 foot contours")
  const intervalMatch = responseText.match(/(\d+(?:\.\d+)?)\s*(?:foot|feet|ft|')\s*(?:contours?|intervals?)?/i);
  if (intervalMatch && intervalMatch[1]) {
    const interval = parseFloat(intervalMatch[1]);
    if (!isNaN(interval) && interval > 0) {
      updates.contourInterval = interval;
    }
  }

  // Look for major interval mentions (e.g., "every 5 feet", "10-foot index")
  const majorMatch = responseText.match(/(?:every|at|index|major)\s+(\d+(?:\.\d+)?)\s*(?:foot|feet|ft|')/i);
  if (majorMatch && majorMatch[1]) {
    const major = parseFloat(majorMatch[1]);
    if (!isNaN(major) && major > 0) {
      updates.majorInterval = major;
    }
  }

  // Look for smoothing mentions (e.g., "smoothing level 2", "smooth the contours")
  const smoothingMatch = responseText.match(/smooth(?:ing)?(?:\s+level)?\s*(\d+)/i);
  if (smoothingMatch && smoothingMatch[1]) {
    const smoothing = parseInt(smoothingMatch[1], 10);
    if (!isNaN(smoothing) && smoothing >= 0 && smoothing <= 5) {
      updates.smoothing = smoothing;
    }
  }

  // Look for point filter descriptions (e.g., "using points marked GROUND", "only bench marks")
  // This is more heuristic - look for "using" or "only" followed by description
  const filterMatch = responseText.match(/(?:using|only|with)\s+(?:points\s+)?(?:marked\s+)?([A-Z_]+)/i);
  if (filterMatch && filterMatch[1]) {
    updates.pointFilterDescription = filterMatch[1];
  }

  return updates;
}

/**
 * Get a summary of contour settings for logging
 * 
 * @param settings - Contour settings to summarize
 * @param pointCount - Number of points being contoured
 * @returns Human-readable summary string
 */
export function getContourSettingsSummary(
  settings: ContourSettings,
  pointCount: number
): string {
  const parts: string[] = [];

  parts.push(`${settings.contourInterval}' contours`);
  
  if (settings.majorInterval && settings.majorInterval !== settings.contourInterval) {
    parts.push(`${settings.majorInterval}' major`);
  }

  if (settings.smoothing > 0) {
    parts.push(`smoothing level ${settings.smoothing}`);
  }

  parts.push(`using ${pointCount} points`);

  if (settings.pointFilterDescription.trim()) {
    parts.push(`matching "${settings.pointFilterDescription}"`);
  }

  return parts.join(', ');
}
