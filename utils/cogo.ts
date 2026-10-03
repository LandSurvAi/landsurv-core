// COGO utility functions for high-precision client-side calculations.

export interface Point {
    northing: number;
    easting: number;
}

/**
 * Parses a DMS bearing string (e.g., "N 88°15'02\" E") into radians.
 * @param bearingStr The bearing string.
 * @returns The bearing in radians from North, or null if parsing fails.
 */
export function parseBearingToRadians(bearingStr: string): number | null {
    if (!bearingStr) return null;
    const cleanedStr = bearingStr.replace(/["'“”‘’°]/g, ' ').replace(/\s+/g, ' ');
    const parts = cleanedStr.trim().toUpperCase().split(' ');

    if (parts.length < 4) return null;

    const quad1 = parts[0];
    const degrees = parseFloat(parts[1]);
    const minutes = parseFloat(parts[2]);
    const seconds = parseFloat(parts[3]);
    const quad2 = parts[4];

    if (isNaN(degrees) || isNaN(minutes) || isNaN(seconds)) return null;

    // Convert DMS to decimal degrees
    const decimalDegrees = degrees + minutes / 60 + seconds / 3600;
    if (decimalDegrees > 90) return null;

    // Convert to radians from North (Azimuth)
    const angleRad = decimalDegrees * (Math.PI / 180);

    if (quad1 === 'S' && quad2 === 'E') {
        return Math.PI - angleRad;
    } else if (quad1 === 'S' && quad2 === 'W') {
        return Math.PI + angleRad;
    } else if (quad1 === 'N' && quad2 === 'W') {
        return 2 * Math.PI - angleRad;
    } else if (quad1 === 'N' && quad2 === 'E') {
        return angleRad;
    }

    return null; // Invalid quadrant
}

/**
 * Parses a distance string (e.g., "312.50'") into a number.
 * @param distanceStr The distance string.
 * @returns The distance as a number, or null if parsing fails.
 */
export function parseDistance(distanceStr: string): number | null {
    if (!distanceStr) return null;
    // Remove common non-numeric characters like feet marks, commas (thousands separator), and spaces
    const cleanedStr = distanceStr.replace(/['']/g, '').replace(/,/g, '').trim();
    const distance = parseFloat(cleanedStr);
    return isNaN(distance) ? null : distance;
}

/**
 * Performs an inverse calculation between two points.
 * @param p1 Start point.
 * @param p2 End point.
 * @returns An object with distance and bearing in radians.
 */
export function inverse(p1: Point, p2: Point): { distance: number; bearing: number } {
    const deltaEasting = p2.easting - p1.easting;
    const deltaNorthing = p2.northing - p1.northing;

    const distance = Math.hypot(deltaEasting, deltaNorthing);
    
    let bearing = Math.atan2(deltaEasting, deltaNorthing);
    if (bearing < 0) {
        bearing += 2 * Math.PI; // Normalize to 0-2PI
    }

    return { distance, bearing };
}

/**
 * Performs a direct (forward) calculation from a point.
 * @param startPoint The starting point.
 * @param bearing The bearing in radians from North.
 * @param distance The distance to travel.
 * @returns The new point's coordinates.
 */
export function direct(startPoint: Point, bearing: number, distance: number): Point {
    const deltaNorthing = distance * Math.cos(bearing);
    const deltaEasting = distance * Math.sin(bearing);

    return {
        northing: startPoint.northing + deltaNorthing,
        easting: startPoint.easting + deltaEasting,
    };
}

// FIX: Added 'calculateClosure' function and its dependencies to resolve import error in App.tsx.
/**
 * Calculates arc length from radius and delta angle.
 * @param radius The curve radius.
 * @param deltaAngle The change in bearing (central angle) in radians.
 * @returns The arc length.
 */
export function calculateArcLength(radius: number, deltaAngle: number): number {
    return Math.abs(radius * deltaAngle);
}

/**
 * Calculates the chord distance from radius and delta angle.
 * @param radius The curve radius.
 * @param deltaAngle The change in bearing (central angle) in radians.
 * @returns The chord distance.
 */
export function calculateChordDistance(radius: number, deltaAngle: number): number {
    return 2 * Math.abs(radius) * Math.sin(Math.abs(deltaAngle) / 2);
}

/**
 * Calculates radial fill area for a curve.
 * Radial fill is the difference between arc and chord areas.
 * For a circular arc: RadialFill = (R²/2) * (θ - sin(θ))
 * Where R = radius, θ = deflection angle in radians
 * @param radius The curve radius.
 * @param deltaAngle The deflection angle in radians.
 * @returns The radial fill area (always positive).
 */
export function calculateRadialFill(radius: number, deltaAngle: number): number {
    // Formula: Area = (R² / 2) * (θ - sin(θ))
    const absAngle = Math.abs(deltaAngle);
    const absRadius = Math.abs(radius);
    const radialFill = (absRadius * absRadius / 2) * (absAngle - Math.sin(absAngle));
    return Math.abs(radialFill);
}

/**
 * Calculates the end point of a curve given start point, radius, and deflection.
 * @param startPoint The starting point of the curve.
 * @param tangentBearing The bearing of the tangent at the start (radians).
 * @param radius The radius of the curve (positive for right curves, negative for left curves).
 * @param deltaAngle The deflection angle of the curve in radians (signed: positive = right turn, negative = left turn).
 * @returns The end point of the curve.
 */
export function directCurve(startPoint: Point, tangentBearing: number, radius: number, deltaAngle: number): Point {
    // The chord bearing is perpendicular to the line connecting the center to the midpoint of the chord
    // For a curve with deflection angle δ, the chord bearing is the tangent bearing + δ/2
    // The sign of deltaAngle determines the direction
    const chordBearing = tangentBearing + (deltaAngle / 2);
    
    // Calculate chord distance
    const chordDistance = calculateChordDistance(radius, deltaAngle);
    
    // Use direct calculation with chord
    return direct(startPoint, chordBearing, chordDistance);
}

/**
 * Converts radians from North to a DMS bearing string.
 * Uses proper rounding with carry-over to prevent invalid values like 60 seconds or 60 minutes.
 * @param radians The bearing in radians.
 * @returns The formatted DMS string.
 */
export function formatBearing(radians: number): string {
    if (isNaN(radians)) return "Invalid Bearing";

    const rad = (radians + 2 * Math.PI) % (2 * Math.PI);

    const degrees = rad * (180 / Math.PI);
    
    let quad1, quad2, angle;

    if (degrees >= 0 && degrees < 90) {
        quad1 = 'N'; quad2 = 'E'; angle = degrees;
    } else if (degrees >= 90 && degrees < 180) {
        quad1 = 'S'; quad2 = 'E'; angle = 180 - degrees;
    } else if (degrees >= 180 && degrees < 270) {
        quad1 = 'S'; quad2 = 'W'; angle = degrees - 180;
    } else { // 270 to 360
        quad1 = 'N'; quad2 = 'W'; angle = 360 - degrees;
    }

    // Calculate DMS with proper carry-over handling
    let deg = Math.floor(angle);
    const minutesFull = (angle - deg) * 60;
    let min = Math.floor(minutesFull);
    let sec = Math.round((minutesFull - min) * 60);

    // Handle carry-over: if seconds rounds to 60, increment minutes
    if (sec >= 60) {
        sec = 0;
        min += 1;
    }
    
    // Handle carry-over: if minutes becomes 60, increment degrees
    if (min >= 60) {
        min = 0;
        deg += 1;
    }

    return `${quad1} ${deg}°${String(min).padStart(2, '0')}'${String(sec).padStart(2, '0')}" ${quad2}`;
}

/**
 * Swaps the direction of a bearing string
 * For example: "S 40°30'00\" W" becomes "N 40°30'00\" E"
 * This is useful for reversing a line direction
 * @param bearingStr The bearing string (e.g., "N 88°15'02\" E")
 * @returns The bearing with swapped quadrants (e.g., "S 88°15'02\" W")
 */
export function swapBearingDirection(bearingStr: string): string {
    if (!bearingStr) return bearingStr;
    
    // Parse the bearing string to get parts
    const cleanedStr = bearingStr.replace(/["'""''°]/g, ' ').replace(/\s+/g, ' ').trim();
    const parts = cleanedStr.split(' ');
    
    if (parts.length < 5) return bearingStr; // Invalid format, return as-is
    
    const quad1 = parts[0].toUpperCase();
    const degStr = parts[1];
    const minStr = parts[2];
    const secStr = parts[3];
    const quad2 = parts[4].toUpperCase();
    
    // Swap quadrants: N↔S, E↔W
    const newQuad1 = quad1 === 'N' ? 'S' : quad1 === 'S' ? 'N' : quad1;
    const newQuad2 = quad2 === 'E' ? 'W' : quad2 === 'W' ? 'E' : quad2;
    
    // Parse and round the values with proper carry-over handling
    let deg = Math.floor(parseFloat(degStr));
    let min = Math.floor(parseFloat(minStr));
    let sec = Math.round(parseFloat(secStr));
    
    // Handle carry-over: if seconds rounds to 60, increment minutes
    if (sec >= 60) {
        sec = 0;
        min += 1;
    }
    
    // Handle carry-over: if minutes becomes 60, increment degrees
    if (min >= 60) {
        min = 0;
        deg += 1;
    }
    
    return `${newQuad1} ${deg}°${String(min).padStart(2, '0')}'${String(sec).padStart(2, '0')}" ${newQuad2}`;
}


interface ClosureLine {
    from: string;
    to: string;
    bearing?: string;
    distance?: string;
    // Curve parameters
    isCurve?: boolean;
    curveRadius?: number;
    arcLength?: number;
    chordBearing?: string;
    chordDistance?: string | number;
    tangentBearing?: string;
    curveDirection?: 'left' | 'right';
}

interface ClosurePoint {
    pointNumber: string;
    northing: number;
    easting: number;
}

/**
 * Calculates the closure of a traverse, including curves with radial fill.
 * This function performs proper COGO traverse computation - it calculates each successive
 * point from the bearing and distance, rather than using AI-provided coordinates.
 * This ensures consistent, repeatable results that match professional survey software.
 * 
 * @param lines An array of traverse lines with bearings and distances (or curve data).
 * @param points A map of point data, keyed by point number. Only the starting point coordinates are used.
 * @returns A detailed closure report object.
 */
export function calculateClosure(lines: ClosureLine[], points: Map<string, ClosurePoint>) {
    if (lines.length === 0) {
        throw new Error("No lines provided for closure calculation.");
    }

    const startPointId = lines[0].from;
    const startPoint = points.get(startPointId);

    if (!startPoint) {
        throw new Error(`Starting point "${startPointId}" not found in points map.`);
    }

    // Start at the POB with its known coordinates
    let currentPoint: Point = { northing: startPoint.northing, easting: startPoint.easting };
    let currentBearing = 0;
    let totalDistance = 0;
    let area = 0;
    let totalRadialFillArea = 0;
    
    // Track calculated points for the report (recalculated from bearings/distances)
    const calculatedPoints: ClosurePoint[] = [{ 
        pointNumber: startPointId, 
        northing: startPoint.northing, 
        easting: startPoint.easting 
    }];
    
    // Track curve details for reporting
    const lineDetails: any[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.isCurve) {
            // Handle curve segment
            if (line.curveRadius === undefined || !line.arcLength) {
                throw new Error(`Curve from ${line.from} to ${line.to} is missing required curve parameters (curveRadius, arcLength).`);
            }

            const radius = line.curveRadius;
            const arcLength = parseDistance(line.arcLength.toString());
            
            if (arcLength === null || radius <= 0) {
                throw new Error(`Invalid curve parameters for curve from ${line.from} to ${line.to}.`);
            }
            
            // Calculate deflection angle magnitude
            const deltaAngleMagnitude = arcLength / radius;

            const normalizeAngle = (angle: number) => {
                let norm = angle % (2 * Math.PI);
                if (norm < 0) norm += 2 * Math.PI;
                return norm;
            };

            // Step 1: Determine curve direction (sign of deltaAngle).
            // Use curveDirection if provided; for the fallback, use a TEMPORARY tangent bearing
            // (AI-provided or previous-segment exit bearing) only to discriminate left vs right.
            let deltaAngle = deltaAngleMagnitude; // default: right

            if (line.curveDirection === 'left') {
                deltaAngle = -deltaAngleMagnitude;
            } else if (line.curveDirection === 'right') {
                deltaAngle = deltaAngleMagnitude;
            } else {
                const tempTangentStr = line.tangentBearing ?? formatBearing(currentBearing);
                const tempTangentRad = parseBearingToRadians(tempTangentStr) ?? currentBearing;
                const fallbackChordStr = line.chordBearing || line.bearing;
                if (fallbackChordStr) {
                    const fallbackChordRad = parseBearingToRadians(fallbackChordStr);
                    if (fallbackChordRad !== null) {
                        const expRight = tempTangentRad + deltaAngleMagnitude / 2;
                        const expLeft  = tempTangentRad - deltaAngleMagnitude / 2;
                        const cNorm = normalizeAngle(fallbackChordRad);
                        const rNorm = normalizeAngle(expRight);
                        const lNorm = normalizeAngle(expLeft);
                        const dR = Math.min(Math.abs(cNorm - rNorm), 2 * Math.PI - Math.abs(cNorm - rNorm));
                        const dL = Math.min(Math.abs(cNorm - lNorm), 2 * Math.PI - Math.abs(cNorm - lNorm));
                        if (dL < dR) deltaAngle = -deltaAngleMagnitude;
                    }
                }
            }

            // Step 2: Resolve tangent bearing geometrically from chord bearing.
            // tangentBearing = chordBearing - Δ/2 (since chordBearing = tangentBearing + Δ/2)
            // This is more reliable than the AI-provided tangentBearing, which is sometimes wrong.
            const resolvedChordStr = line.chordBearing || line.bearing;
            const resolvedChordRad = resolvedChordStr ? parseBearingToRadians(resolvedChordStr) : null;
            let tangentBearingRad: number;
            if (resolvedChordRad !== null) {
                tangentBearingRad = resolvedChordRad - deltaAngle / 2;
            } else {
                const tempStr = line.tangentBearing ?? formatBearing(currentBearing);
                const parsed = parseBearingToRadians(tempStr);
                if (parsed === null) {
                    throw new Error(`Could not parse tangent bearing for curve from ${line.from} to ${line.to}.`);
                }
                tangentBearingRad = parsed;
            }
            const resolvedTangentBearing = formatBearing(tangentBearingRad);

            // Calculate next point via chord geometry
            const chordBearing = tangentBearingRad + (deltaAngle / 2);
            const chordDistance = calculateChordDistance(radius, deltaAngle);
            const nextPoint = direct(currentPoint, chordBearing, chordDistance);
            
            // Distance reporting uses arc length (actual traverse distance)
            totalDistance += arcLength;
            
            // For area calculation: The Shoelace formula with calculated point coordinates
            const shoelaceContrib = (currentPoint.easting * nextPoint.northing) - (nextPoint.easting * currentPoint.northing);
            area += shoelaceContrib;
            
            // Calculate radial fill area (area between chord and arc)
            const radialFill = calculateRadialFill(radius, Math.abs(deltaAngle));
            
            // Determine if we should add or subtract the radial fill based on curve direction
            const chordDx = nextPoint.easting - currentPoint.easting;
            const chordDy = nextPoint.northing - currentPoint.northing;
            const tangentDx = Math.sin(tangentBearingRad);
            const tangentDy = Math.cos(tangentBearingRad);
            const crossProduct = chordDx * tangentDy - chordDy * tangentDx;
            
            if (crossProduct < 0) {
                totalRadialFillArea += radialFill;
            } else {
                totalRadialFillArea -= radialFill;
            }
            
            // Calculate tangent bearings for reporting
            const tangentRadOut = tangentBearingRad + deltaAngle;
            const tangentRadInStr = formatBearing(tangentBearingRad);
            const tangentRadOutStr = formatBearing(tangentRadOut);
            
            lineDetails.push({
                from: line.from,
                to: line.to,
                bearing: resolvedTangentBearing || '',
                distance: line.arcLength || '',
                isCurve: true,
                curveRadius: radius,
                arcLength: arcLength,
                deltaAngle: deltaAngle * (180 / Math.PI),
                tangentRadIn: tangentRadInStr,
                tangentRadOut: tangentRadOutStr
            });
            
            // Store the calculated point
            calculatedPoints.push({
                pointNumber: line.to,
                northing: nextPoint.northing,
                easting: nextPoint.easting
            });
            
            // Update bearing for next segment
            currentBearing = tangentBearingRad + deltaAngle;
            currentPoint = nextPoint;
            
        } else {
            // Handle straight line segment
            if (!line.bearing || !line.distance) {
                throw new Error(`Line from ${line.from} to ${line.to} is missing bearing or distance.`);
            }
            
            const bearingRad = parseBearingToRadians(line.bearing);
            const distNum = parseDistance(line.distance);

            if (bearingRad === null || distNum === null) {
                throw new Error(`Could not parse bearing or distance for line from ${line.from} to ${line.to}.`);
            }
            
            // CRITICAL FIX: Calculate the next point using COGO direct calculation
            // This ensures consistent results regardless of AI-provided coordinates
            const nextPoint = direct(currentPoint, bearingRad, distNum);
            
            totalDistance += distNum;
            area += (currentPoint.easting * nextPoint.northing) - (nextPoint.easting * currentPoint.northing);
            
            lineDetails.push({
                from: line.from,
                to: line.to,
                bearing: line.bearing || '',
                distance: line.distance || '',
                isCurve: false
            });
            
            // Store the calculated point
            calculatedPoints.push({
                pointNumber: line.to,
                northing: nextPoint.northing,
                easting: nextPoint.easting
            });
            
            currentBearing = bearingRad;
            currentPoint = nextPoint;
        }
    }
    
    // Close the area calculation (back to starting point)
    area += (currentPoint.easting * startPoint.northing) - (startPoint.easting * currentPoint.northing);
    area = Math.abs(area / 2);
    
    // Add the radial fill corrections for all curves
    const totalArea = area + totalRadialFillArea;

    // Calculate misclosure: difference between final calculated point and starting point
    const misclosureNorthing = startPoint.northing - currentPoint.northing;
    const misclosureEasting = startPoint.easting - currentPoint.easting;

    const misclosureInverse = inverse({ northing: currentPoint.northing, easting: currentPoint.easting }, startPoint);
    const misclosureDistance = misclosureInverse.distance;
    const misclosureBearing = formatBearing(misclosureInverse.bearing);
    
    const precision = (totalDistance > 0 && misclosureDistance > 1e-9) ? `1 in ${Math.round(totalDistance / misclosureDistance).toLocaleString()}` : 'N/A';
    
    return {
        // Return the CALCULATED points, not the AI-provided ones
        points: calculatedPoints,
        lines: lineDetails,
        totalDistance,
        misclosureNorthing,
        misclosureEasting,
        misclosureDistance,
        misclosureBearing,
        precision,
        area: totalArea
    };
}
// NOTE: Do not re-export `./cogoLib` from this module.
// `utils/cogoLib/index.ts` re-exports primitives from this file, and
// re-exporting cogoLib here creates a circular export path that can recurse.
