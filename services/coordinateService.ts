/**
 * coordinateService.ts
 * Extracted business logic for coordinate transformations and projections
 * Phase 8: Business Logic Extraction
 * 
 * Handles:
 * - Coordinate system transformations
 * - Projection settings validation
 * - Point transformations between coordinate systems
 */

import proj4 from 'proj4';
import { SurveyPoint, ProjectionSetting, Settings } from '../types';

/**
 * Initialize projection with a new setting
 */
export const initializeProjection = (newProjection: ProjectionSetting): void => {
  try {
    if (newProjection.epsg && newProjection.state) {
      const fromProj = `EPSG:4326`; // WGS84
      const toProj = `EPSG:${newProjection.epsg}`;
      proj4.defs([fromProj, toProj]);
    }
  } catch (err) {
    console.error('Failed to initialize projection:', err);
  }
};

/**
 * Transform a point from one coordinate system to another
 */
export const transformPoint = (
  point: SurveyPoint,
  fromEpsg: number,
  toEpsg: number
): SurveyPoint => {
  try {
    const fromProj = `EPSG:${fromEpsg}`;
    const toProj = `EPSG:${toEpsg}`;

    const transformed = proj4(fromProj, toProj, [point.easting, point.northing]);

    return {
      ...point,
      easting: transformed[0],
      northing: transformed[1],
    };
  } catch (err) {
    console.error('Failed to transform point:', err);
    return point; // Return original if transformation fails
  }
};

/**
 * Transform multiple points between coordinate systems
 */
export const transformPoints = (
  points: SurveyPoint[],
  fromEpsg: number,
  toEpsg: number
): SurveyPoint[] => {
  return points.map((point) => transformPoint(point, fromEpsg, toEpsg));
};

/**
 * Validate projection setting has required fields
 */
export const isValidProjection = (projection: ProjectionSetting): boolean => {
  return !!(projection.epsg && projection.state && projection.zoneName);
};

/**
 * Get projection description string
 */
export const getProjectionDescription = (projection: ProjectionSetting): string => {
  if (!projection.state || !projection.zoneName) {
    return 'No projection set';
  }

  return `${projection.state} - ${projection.zoneName} (EPSG:${projection.epsg || 'Unknown'})`;
};

/**
 * Convert latitude/longitude to projected coordinates
 */
export const convertFromWGS84 = (
  lat: number,
  lon: number,
  toEpsg: number
): [number, number] => {
  try {
    const fromProj = 'EPSG:4326'; // WGS84
    const toProj = `EPSG:${toEpsg}`;
    const result = proj4(fromProj, toProj, [lon, lat]);
    return [result[0], result[1]];
  } catch (err) {
    console.error('Failed to convert from WGS84:', err);
    return [lon, lat];
  }
};

/**
 * Convert projected coordinates to latitude/longitude
 */
export const convertToWGS84 = (
  easting: number,
  northing: number,
  fromEpsg: number
): [number, number] => {
  try {
    const fromProj = `EPSG:${fromEpsg}`;
    const toProj = 'EPSG:4326'; // WGS84
    const result = proj4(fromProj, toProj, [easting, northing]);
    return [result[1], result[0]]; // Return as [lat, lon]
  } catch (err) {
    console.error('Failed to convert to WGS84:', err);
    return [northing, easting];
  }
};

/**
 * Get UTM zone from latitude/longitude
 */
export const getUtmZone = (lat: number, lon: number): number => {
  return Math.floor((lon + 180) / 6) + 1;
};

/**
 * Check if projection is UTM
 */
export const isUtmProjection = (projection: ProjectionSetting): boolean => {
  return projection.zoneName?.toUpperCase().includes('UTM') || false;
};

/**
 * Check if projection is State Plane
 */
export const isStatePlaneProjection = (projection: ProjectionSetting): boolean => {
  return projection.state ? true : false;
};

/**
 * Create NAD83 projection string for a given state
 */
export const createNad83Projection = (state: string): ProjectionSetting => {
  // This would typically lookup the proper NAD83 EPSG code for the state
  // For now, returning a template
  return {
    state,
    zoneName: `NAD83 (${state})`,
    epsg: 2231, // Example: California Zone 1
  };
};

/**
 * Create WGS84 projection string
 */
export const createWgs84Projection = (): ProjectionSetting => {
  return {
    state: null,
    zoneName: 'WGS84 (Geographic)',
    epsg: 4326,
  };
};

/**
 * Format coordinate value for display with specified precision
 */
export const formatCoordinate = (value: number, precision: number = 2): string => {
  return value.toFixed(precision);
};

/**
 * Parse coordinate string (e.g., "382500.12") to number
 */
export const parseCoordinate = (value: string): number | null => {
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
};

/**
 * Calculate distance between two points using projected coordinates
 */
export const calculateDistance = (
  point1: SurveyPoint,
  point2: SurveyPoint
): number => {
  const de = point2.easting - point1.easting;
  const dn = point2.northing - point1.northing;
  return Math.sqrt(de * de + dn * dn);
};

/**
 * Calculate bearing between two points (in degrees)
 */
export const calculateBearing = (
  point1: SurveyPoint,
  point2: SurveyPoint
): number => {
  const de = point2.easting - point1.easting;
  const dn = point2.northing - point1.northing;
  let bearing = Math.atan2(de, dn) * (180 / Math.PI);

  // Normalize to 0-360 range
  bearing = (bearing + 360) % 360;
  return bearing;
};

/**
 * Apply projection setting change to all points
 * Returns points transformed to new projection
 */
export const applyProjectionChange = (
  points: SurveyPoint[],
  fromProjection: ProjectionSetting | null,
  toProjection: ProjectionSetting
): SurveyPoint[] => {
  if (!fromProjection || !fromProjection.epsg || !toProjection.epsg) {
    return points;
  }

  if (fromProjection.epsg === toProjection.epsg) {
    return points; // No transformation needed
  }

  return transformPoints(points, fromProjection.epsg, toProjection.epsg);
};
