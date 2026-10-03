/**
 * fileProcessingService.ts
 * Extracted business logic for file parsing and processing
 * Phase 8: Business Logic Extraction
 * 
 * Handles:
 * - RAW file parsing
 * - DXF file parsing
 * - GeoJSON parsing
 * - GIS file processing
 * - File validation
 */

import { SessionFile, SurveyPoint, GisFeature } from '../types';

/**
 * Validate if content is valid RAW format
 */
export const isValidRawFormat = (content: string): boolean => {
  if (!content || typeof content !== 'string') {
    return false;
  }

  // RAW files should have point entries
  const lines = content.split('\n');
  const hasPointEntries = lines.some(
    (line) => line.includes('N=') && line.includes('E=')
  );

  return hasPointEntries;
};

/**
 * Validate if content is valid DXF format
 */
export const isValidDxfFormat = (content: string): boolean => {
  if (!content || typeof content !== 'string') {
    return false;
  }

  // DXF files start with certain headers
  return content.includes('SECTION') && content.includes('ENDSEC');
};

/**
 * Validate if content is valid GeoJSON format
 */
export const isValidGeoJsonFormat = (content: string): boolean => {
  if (!content || typeof content !== 'string') {
    return false;
  }

  try {
    const obj = JSON.parse(content);
    return (
      obj.type === 'FeatureCollection' || 
      obj.type === 'Feature' ||
      (obj.type === 'GeometryCollection' && obj.geometries)
    );
  } catch {
    return false;
  }
};

/**
 * Parse GeoJSON content and extract features
 */
export const parseGeoJsonFile = (content: string): GisFeature[] => {
  try {
    const geojson = JSON.parse(content);
    const features: GisFeature[] = [];

    if (geojson.type === 'FeatureCollection' && geojson.features) {
      return geojson.features.map((feature: any, index: number): GisFeature => ({
        id: feature.properties?.id || `feature_${index}`,
        name: feature.properties?.name || feature.id || `Feature ${index}`,
        type: feature.geometry?.type || 'Unknown',
        properties: feature.properties || {},
        geometry: feature.geometry,
      }));
    } else if (geojson.type === 'Feature') {
      return [
        {
          id: geojson.properties?.id || 'feature_0',
          name: geojson.properties?.name || geojson.id || 'Feature 0',
          type: geojson.geometry?.type || 'Unknown',
          properties: geojson.properties || {},
          geometry: geojson.geometry,
        },
      ];
    }

    return features;
  } catch (err) {
    console.error('Failed to parse GeoJSON:', err);
    return [];
  }
};

/**
 * Extract points from GeoJSON features
 */
export const extractPointsFromGeoJson = (features: GisFeature[]): SurveyPoint[] => {
  const points: SurveyPoint[] = [];

  features.forEach((feature, index) => {
    if (feature.geometry?.type === 'Point') {
      const [lon, lat] = feature.geometry.coordinates;
      points.push({
        pointNumber: feature.properties?.pointNumber || `GIS_${index}`,
        description: feature.name || '',
        northing: lat,
        easting: lon,
        elevation: feature.properties?.elevation,
      });
    }
  });

  return points;
};

/**
 * Detect file type based on content analysis
 */
export const detectFileType = (
  content: string,
  fileName: string
): 'raw' | 'dxf' | 'geojson' | 'unknown' => {
  const lowerName = fileName.toLowerCase();

  // Check file extension first
  if (lowerName.endsWith('.dxf')) return 'dxf';
  if (lowerName.endsWith('.geojson') || lowerName.endsWith('.json'))
    return 'geojson';
  if (lowerName.endsWith('.raw') || lowerName.endsWith('.txt')) return 'raw';

  // Analyze content if extension unclear
  if (isValidDxfFormat(content)) return 'dxf';
  if (isValidGeoJsonFormat(content)) return 'geojson';
  if (isValidRawFormat(content)) return 'raw';

  return 'unknown';
};

/**
 * Sanitize file name for safe usage
 */
export const sanitizeFileName = (fileName: string): string => {
  return fileName
    .replace(/[^a-z0-9._-]/gi, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase();
};

/**
 * Get file size in human-readable format
 */
export const getFileSizeDisplay = (content: string): string => {
  const bytes = new Blob([content]).size;

  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Validate file size against limits
 */
export const isFileSizeValid = (content: string, maxSizeMb: number = 100): boolean => {
  const bytes = new Blob([content]).size;
  return bytes <= maxSizeMb * 1024 * 1024;
};

/**
 * Extract metadata from file content
 */
export const extractFileMetadata = (
  content: string,
  fileName: string
): { type: string; size: string; lines: number; encoding: string } => {
  return {
    type: detectFileType(content, fileName),
    size: getFileSizeDisplay(content),
    lines: content.split('\n').length,
    encoding: 'UTF-8', // Could be enhanced to detect actual encoding
  };
};

/**
 * Normalize line endings to \n
 */
export const normalizeLineEndings = (content: string): string => {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
};

/**
 * Trim and clean file content (remove BOM, extra whitespace)
 */
export const cleanFileContent = (content: string): string => {
  // Remove BOM if present
  let cleaned = content.replace(/^\uFEFF/, '');

  // Trim whitespace
  cleaned = cleaned.trim();

  // Normalize line endings
  cleaned = normalizeLineEndings(cleaned);

  return cleaned;
};

/**
 * Parse a file and create SessionFile object
 */
export const createSessionFileFromContent = (
  content: string,
  fileName: string
): SessionFile => {
  return {
    name: sanitizeFileName(fileName),
    content: cleanFileContent(content),
  };
};

/**
 * Validate and parse a RAW file
 * Returns list of points extracted from RAW format
 */
export const parseRawPoints = (content: string): SurveyPoint[] => {
  const points: SurveyPoint[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) continue;

    try {
      // Parse RAW format: "P#: N=value, E=value, [El=value], [Desc=value]"
      const match = line.match(/P(\d+):\s+N=([\d.]+),\s+E=([\d.]+)/);
      if (match) {
        const pointNumber = `P${match[1]}`;
        const northing = parseFloat(match[2]);
        const easting = parseFloat(match[3]);

        // Try to extract elevation if present
        const elMatch = line.match(/El=([\d.]+)/);
        const elevation = elMatch ? parseFloat(elMatch[1]) : undefined;

        // Try to extract description if present
        const descMatch = line.match(/Desc=([^,\n]+)/);
        const description = descMatch ? descMatch[1].trim() : '';

        points.push({
          pointNumber,
          description,
          northing,
          easting,
          elevation,
        });
      }
    } catch (err) {
      console.error(`Error parsing RAW line: ${line}`, err);
      continue;
    }
  }

  return points;
};

/**
 * Validate imported points have required fields
 */
export const arePointsValid = (points: SurveyPoint[]): boolean => {
  return (
    Array.isArray(points) &&
    points.length > 0 &&
    points.every(
      (p) =>
        p.pointNumber &&
        typeof p.northing === 'number' &&
        typeof p.easting === 'number'
    )
  );
};

/**
 * Check if file content appears to be binary
 */
export const isBinaryContent = (content: string): boolean => {
  // Check for common binary indicators
  const nullByteIndex = content.indexOf('\0');
  return nullByteIndex !== -1;
};

/**
 * Get MIME type for file extension
 */
export const getMimeType = (fileName: string): string => {
  const ext = fileName.toLowerCase().split('.').pop();

  const mimeTypes: { [key: string]: string } = {
    'txt': 'text/plain',
    'raw': 'text/plain',
    'dxf': 'application/dxf',
    'json': 'application/json',
    'geojson': 'application/geo+json',
    'pdf': 'application/pdf',
    'csv': 'text/csv',
    'shp': 'application/x-shapefile',
  };

  return mimeTypes[ext || ''] || 'application/octet-stream';
};
