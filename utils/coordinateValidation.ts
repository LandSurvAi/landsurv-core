/**
 * Client-side validation functions for work point coordinates extracted by Civil Plan Expert
 * These functions perform sanity checks to catch coordinate extraction errors early
 */

import { SurveyPoint } from '../types.ts';

export interface CoordinateValidationResult {
  isValid: boolean;
  warnings: string[];
  issues: string[];
  statistics: {
    pointCount: number;
    northingRange: { min: number; max: number };
    eastingRange: { min: number; max: number };
    averageSpacing: number;
    area?: number;
  };
}

/**
 * Validates extracted work point coordinates for basic sanity
 * @param points Array of survey points to validate
 * @param expectedGeometryType 'parcel' | 'building' | 'workpoints' (affects expected convexity)
 * @returns Validation result with warnings and issues
 */
export function validateCoordinates(
  points: SurveyPoint[],
  expectedGeometryType: 'parcel' | 'building' | 'workpoints' = 'workpoints'
): CoordinateValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  if (points.length === 0) {
    return {
      isValid: false,
      warnings: [],
      issues: ['No points to validate'],
      statistics: {
        pointCount: 0,
        northingRange: { min: 0, max: 0 },
        eastingRange: { min: 0, max: 0 },
        averageSpacing: 0,
      },
    };
  }

  // Check for duplicate/near-duplicate points
  const tolerance = 0.01; // feet
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dist = Math.hypot(
        points[i].easting - points[j].easting,
        points[i].northing - points[j].northing
      );
      if (dist < tolerance) {
        issues.push(
          `Points ${points[i].pointNumber} and ${points[j].pointNumber} are too close (${dist.toFixed(3)}' apart)`
        );
      }
    }
  }

  // Calculate bounds
  const northings = points.map(p => p.northing);
  const eastings = points.map(p => p.easting);
  const minNorthing = Math.min(...northings);
  const maxNorthing = Math.max(...northings);
  const minEasting = Math.min(...eastings);
  const maxEasting = Math.max(...eastings);

  const northingRange = maxNorthing - minNorthing;
  const eastingRange = maxEasting - minEasting;

  // Check for suspicious ranges (too small or too large)
  if (northingRange < 1) {
    warnings.push(
      `Northing range is very small (${northingRange.toFixed(2)}'). Are these points collinear?`
    );
  }
  if (eastingRange < 1) {
    warnings.push(
      `Easting range is very small (${eastingRange.toFixed(2)}'). Are these points collinear?`
    );
  }

  // Check for unrealistic coordinate values (typically state plane coordinates are 5-7 digit numbers)
  const unrealisticPoints = points.filter(
    p =>
      Math.abs(p.northing) > 9999999 ||
      Math.abs(p.easting) > 9999999 ||
      Math.abs(p.northing) < 100 ||
      Math.abs(p.easting) < 100
  );
  if (unrealisticPoints.length > 0) {
    warnings.push(
      `${unrealisticPoints.length} point(s) have unusually large or small coordinate values. May be local vs. state plane confusion.`
    );
  }

  // Calculate average spacing between consecutive points (for perimeter)
  let totalDistance = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const dist = Math.hypot(
      current.easting - next.easting,
      current.northing - next.northing
    );
    totalDistance += dist;
  }
  const averageSpacing = points.length > 0 ? totalDistance / points.length : 0;

  // Calculate area using shoelace formula (for closed polygon)
  let area: number | undefined;
  if (points.length >= 3) {
    area = Math.abs(calculatePolygonArea(points)) / 2;

    // Check for unrealistic area (1 sq ft or less = too small; 1M+ sq ft = verify)
    if (area < 1) {
      issues.push(`Calculated area is ${area.toFixed(2)} sq ft - suspiciously small`);
    }
    if (area > 1000000) {
      warnings.push(
        `Calculated area is ${(area / 43560).toFixed(2)} acres - verify this is intentional`
      );
    }

    // Check convexity (most parcels/buildings should be convex, but workpoints may not be)
    if (expectedGeometryType === 'parcel' || expectedGeometryType === 'building') {
      const convexity = analyzeConvexity(points);
      if (convexity.isConvex === false && convexity.concavityRatio < 0.05) {
        warnings.push(
          `Boundary appears highly concave (${(convexity.concavityRatio * 100).toFixed(1)}% concave). Verify boundary order is correct.`
        );
      }
    }
  }

  return {
    isValid: issues.length === 0,
    warnings,
    issues,
    statistics: {
      pointCount: points.length,
      northingRange: { min: minNorthing, max: maxNorthing },
      eastingRange: { min: minEasting, max: maxEasting },
      averageSpacing,
      area,
    },
  };
}

/**
 * Calculate polygon area using shoelace formula
 * Positive = counterclockwise, Negative = clockwise
 */
function calculatePolygonArea(points: SurveyPoint[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    sum += current.easting * next.northing - next.easting * current.northing;
  }
  return sum;
}

export function computePolygonArea(points: SurveyPoint[]): number {
  return Math.abs(calculatePolygonArea(points));
}

/**
 * Analyze convexity of a polygon
 * Returns whether it's convex and what ratio is concave
 */
function analyzeConvexity(points: SurveyPoint[]): { isConvex: boolean; concavityRatio: number } {
  if (points.length < 3) return { isConvex: true, concavityRatio: 0 };

  let concaveCount = 0;
  const crossProducts: number[] = [];

  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const p3 = points[(i + 2) % points.length];

    // Vector from p1 to p2
    const v1 = { x: p2.easting - p1.easting, y: p2.northing - p1.northing };
    // Vector from p2 to p3
    const v2 = { x: p3.easting - p2.easting, y: p3.northing - p2.northing };

    // Cross product (positive = left turn, negative = right turn)
    const cross = v1.x * v2.y - v1.y * v2.x;
    crossProducts.push(cross);

    if (cross < 0) {
      concaveCount++;
    }
  }

  // Check if all cross products have same sign (convex) or mixed (concave)
  const hasPositive = crossProducts.some(cp => cp > 0);
  const hasNegative = crossProducts.some(cp => cp < 0);
  const isConvex = !(hasPositive && hasNegative);

  const concavityRatio = concaveCount / points.length;

  return { isConvex, concavityRatio };
}

/**
 * Verifies that extracted coordinates make geometric sense
 * Used by Civil Plan Expert to catch errors in coordinate extraction
 */
export function generateCoordinateValidationReport(
  points: SurveyPoint[],
  expectedGeometryType: 'parcel' | 'building' | 'workpoints' = 'workpoints'
): string {
  const result = validateCoordinates(points, expectedGeometryType);

  let report = `\n**COORDINATE VALIDATION REPORT:**\n`;
  report += `✓ Points: ${result.statistics.pointCount}\n`;
  report += `✓ Northing range: ${result.statistics.northingRange.min.toFixed(2)}'–${result.statistics.northingRange.max.toFixed(2)}' (span: ${(result.statistics.northingRange.max - result.statistics.northingRange.min).toFixed(2)}')\n`;
  report += `✓ Easting range: ${result.statistics.eastingRange.min.toFixed(2)}'–${result.statistics.eastingRange.max.toFixed(2)}' (span: ${(result.statistics.eastingRange.max - result.statistics.eastingRange.min).toFixed(2)}')\n`;
  report += `✓ Average spacing: ${result.statistics.averageSpacing.toFixed(2)}'\n`;

  if (result.statistics.area !== undefined) {
    const acres = result.statistics.area / 43560;
    report += `✓ Enclosed area: ${result.statistics.area.toFixed(0)} sq ft (${acres.toFixed(3)} acres)\n`;
  }

  if (result.issues.length > 0) {
    report += `\n❌ **ISSUES FOUND:**\n`;
    result.issues.forEach(issue => {
      report += `  • ${issue}\n`;
    });
    report += `\nThese issues should be investigated before proceeding.\n`;
  }

  if (result.warnings.length > 0) {
    report += `\n⚠️ **WARNINGS:**\n`;
    result.warnings.forEach(warning => {
      report += `  • ${warning}\n`;
    });
  }

  if (result.isValid && result.warnings.length === 0) {
    report += `\n✅ All validations passed. Coordinates look reasonable.\n`;
  }

  return report;
}

/**
 * Attempt to auto-fix swapped northing/easting columns for SurveyPoint array
 */
export function attemptAutoFixPoints(points: SurveyPoint[]): { fixedPoints: SurveyPoint[]; fixed: boolean; reason: string } {
  if (!points || points.length === 0) return { fixedPoints: points, fixed: false, reason: 'No points' };

  const northings = points.map(p => p.northing).filter(n => typeof n === 'number');
  const eastings = points.map(p => p.easting).filter(e => typeof e === 'number');
  if (northings.length === 0 || eastings.length === 0) return { fixedPoints: points, fixed: false, reason: 'No numeric values' };

  const northingMax = Math.max(...northings);
  const eastingMin = Math.min(...eastings);

  const likelySwap = (northingMax < 10000 && eastingMin > 10000) || (northingMax < eastingMin / 10);
  if (!likelySwap) return { fixedPoints: points, fixed: false, reason: 'No swap detected' };

  const swapped = points.map(p => ({ ...p, northing: p.easting, easting: p.northing }));
  return { fixedPoints: swapped, fixed: true, reason: 'Detected likely swap and swapped northing/easting.' };
}
