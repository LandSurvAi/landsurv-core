import {
    AnnotationDimension,
    AlignedAnnotationDimension,
    HorizontalAnnotationDimension,
    VerticalAnnotationDimension,
    RadiusAnnotationDimension,
    DiameterAnnotationDimension,
    ArcLengthAnnotationDimension,
    CurveDataAnnotationDimension,
    AngularAnnotationDimension,
    OrdinateAnnotationDimension,
} from '../types.ts';

export interface WorldPoint {
    easting: number;
    northing: number;
}

/**
 * Format radians as Degrees Minutes Seconds (e.g., 45°12'34").
 */
export function formatDMS(radians: number): string {
    let degreesTotal = (Math.abs(radians) * 180) / Math.PI;
    const deg = Math.floor(degreesTotal);
    const minTotal = (degreesTotal - deg) * 60;
    const min = Math.floor(minTotal);
    const sec = Math.round((minTotal - min) * 60);
    // Handle carry over
    if (sec >= 60) {
        return `${deg}°${min + 1}'00"`;
    }
    const secPad = sec < 10 ? `0${sec}` : `${sec}`;
    const minPad = min < 10 ? `0${min}` : `${min}`;
    return `${deg}°${minPad}'${secPad}"`;
}

/**
 * Format bearing from p1 to p2 in surveyor quadrant format (e.g., N 45°12'34" E).
 */
export function formatBearingFromPoints(p1: WorldPoint, p2: WorldPoint): string {
    const dE = p2.easting - p1.easting;
    const dN = p2.northing - p1.northing;
    if (Math.hypot(dE, dN) < 1e-9) return 'N 00°00\'00" E';

    // Azimuth clockwise from North (N=0, E=π/2, S=π, W=3π/2)
    let az = Math.atan2(dE, dN);
    if (az < 0) az += 2 * Math.PI;

    let quadrant = '';
    let angle = 0;
    if (az >= 0 && az < Math.PI / 2) {
        quadrant = 'N_E';
        angle = az;
    } else if (az >= Math.PI / 2 && az < Math.PI) {
        quadrant = 'S_E';
        angle = Math.PI - az;
    } else if (az >= Math.PI && az < (3 * Math.PI) / 2) {
        quadrant = 'S_W';
        angle = az - Math.PI;
    } else {
        quadrant = 'N_W';
        angle = 2 * Math.PI - az;
    }

    const dms = formatDMS(angle);
    const [ns, ew] = quadrant.split('_');
    return `${ns} ${dms} ${ew}`;
}

/**
 * Calculate geometric parameters for surveyor curve data.
 */
export function calculateCurveData(params: {
    radius: number;
    arcLength: number;
    deltaRad?: number;
    p1: WorldPoint;
    p2: WorldPoint;
    chordBearing?: string;
    chordLength?: number;
    tangentBearing?: string;
    curveDirection?: 'left' | 'right';
}): {
    radius: number;
    arcLength: number;
    deltaRad: number;
    deltaDms: string;
    chordLength: number;
    chordBearing: string;
    tangentLength: number;
    calloutLines: string[];
} {
    const { radius, arcLength, p1, p2 } = params;
    const deltaRad = params.deltaRad ?? (radius > 1e-6 ? arcLength / radius : 0);
    const deltaDms = formatDMS(deltaRad);

    const calculatedChord = Math.hypot(p2.easting - p1.easting, p2.northing - p1.northing);
    const chordLength = params.chordLength ?? (calculatedChord > 1e-6 ? calculatedChord : 2 * radius * Math.sin(deltaRad / 2));
    const chordBearing = params.chordBearing ?? formatBearingFromPoints(p1, p2);
    const tangentLength = radius * Math.tan(deltaRad / 2);

    const calloutLines = [
        `R = ${radius.toFixed(2)}'`,
        `L = ${arcLength.toFixed(2)}'`,
        `Δ = ${deltaDms}`,
        `CH = ${chordLength.toFixed(2)}'`,
        `CB = ${chordBearing}`,
    ];

    if (isFinite(tangentLength) && tangentLength > 0) {
        calloutLines.push(`T = ${tangentLength.toFixed(2)}'`);
    }

    return {
        radius,
        arcLength,
        deltaRad,
        deltaDms,
        chordLength,
        chordBearing,
        tangentLength,
        calloutLines,
    };
}

/**
 * Geometry endpoints and witness lines for linear dimensions (aligned, horizontal, vertical).
 */
export function calculateLinearDimensionGeometry(dim: AlignedAnnotationDimension | HorizontalAnnotationDimension | VerticalAnnotationDimension): {
    p1: WorldPoint;
    p2: WorldPoint;
    d1: WorldPoint;
    d2: WorldPoint;
    dimensionText: string;
    length: number;
    angle: number;
    midpoint: WorldPoint;
} {
    if (dim.type === 'aligned') {
        const dx = dim.p2.easting - dim.p1.easting;
        const dy = dim.p2.northing - dim.p1.northing;
        const len = Math.hypot(dx, dy);
        const px = len > 1e-9 ? -dy / len : 0;
        const py = len > 1e-9 ? dx / len : 0;

        const d1 = { easting: dim.p1.easting + dim.offsetDist * px, northing: dim.p1.northing + dim.offsetDist * py };
        const d2 = { easting: dim.p2.easting + dim.offsetDist * px, northing: dim.p2.northing + dim.offsetDist * py };
        const mid = { easting: (d1.easting + d2.easting) / 2, northing: (d1.northing + d2.northing) / 2 };

        return {
            p1: dim.p1,
            p2: dim.p2,
            d1,
            d2,
            dimensionText: dim.textOverride ?? len.toFixed(2),
            length: len,
            angle: Math.atan2(dy, dx),
            midpoint: mid,
        };
    } else if (dim.type === 'horizontal') {
        const dx = Math.abs(dim.p2.easting - dim.p1.easting);
        const dimNorthing = dim.p1.northing + dim.offsetDist;
        const d1 = { easting: dim.p1.easting, northing: dimNorthing };
        const d2 = { easting: dim.p2.easting, northing: dimNorthing };
        const mid = { easting: (d1.easting + d2.easting) / 2, northing: dimNorthing };

        return {
            p1: dim.p1,
            p2: dim.p2,
            d1,
            d2,
            dimensionText: dim.textOverride ?? dx.toFixed(2),
            length: dx,
            angle: 0,
            midpoint: mid,
        };
    } else {
        // 'vertical'
        const dy = Math.abs(dim.p2.northing - dim.p1.northing);
        const dimEasting = dim.p1.easting + dim.offsetDist;
        const d1 = { easting: dimEasting, northing: dim.p1.northing };
        const d2 = { easting: dimEasting, northing: dim.p2.northing };
        const mid = { easting: dimEasting, northing: (d1.northing + d2.northing) / 2 };

        return {
            p1: dim.p1,
            p2: dim.p2,
            d1,
            d2,
            dimensionText: dim.textOverride ?? dy.toFixed(2),
            length: dy,
            angle: Math.PI / 2,
            midpoint: mid,
        };
    }
}

/**
 * Radial dimension calculation: returns touch point on circumference, leader line endpoints, and label.
 */
export function calculateRadialDimensionGeometry(dim: RadiusAnnotationDimension): {
    center: WorldPoint;
    touchPoint: WorldPoint;
    textPosition: WorldPoint;
    radius: number;
    dimensionText: string;
    isInside: boolean;
    angle: number;
} {
    const dx = dim.textPosition.easting - dim.center.easting;
    const dy = dim.textPosition.northing - dim.center.northing;
    const distToText = Math.hypot(dx, dy);
    const angle = distToText > 1e-9 ? Math.atan2(dy, dx) : 0;

    const touchPoint: WorldPoint = {
        easting: dim.center.easting + dim.radius * Math.cos(angle),
        northing: dim.center.northing + dim.radius * Math.sin(angle),
    };

    return {
        center: dim.center,
        touchPoint,
        textPosition: dim.textPosition,
        radius: dim.radius,
        dimensionText: dim.textOverride ?? `R = ${dim.radius.toFixed(2)}'`,
        isInside: distToText < dim.radius,
        angle,
    };
}

/**
 * Diameter dimension calculation: returns chord across circle through center and leader/arrow positions.
 */
export function calculateDiameterDimensionGeometry(dim: DiameterAnnotationDimension): {
    center: WorldPoint;
    touch1: WorldPoint;
    touch2: WorldPoint;
    textPosition: WorldPoint;
    diameter: number;
    dimensionText: string;
    angle: number;
} {
    const dx = dim.textPosition.easting - dim.center.easting;
    const dy = dim.textPosition.northing - dim.center.northing;
    const distToText = Math.hypot(dx, dy);
    const angle = distToText > 1e-9 ? Math.atan2(dy, dx) : 0;

    const touch1: WorldPoint = {
        easting: dim.center.easting - dim.radius * Math.cos(angle),
        northing: dim.center.northing - dim.radius * Math.sin(angle),
    };
    const touch2: WorldPoint = {
        easting: dim.center.easting + dim.radius * Math.cos(angle),
        northing: dim.center.northing + dim.radius * Math.sin(angle),
    };

    return {
        center: dim.center,
        touch1,
        touch2,
        textPosition: dim.textPosition,
        diameter: dim.radius * 2,
        dimensionText: dim.textOverride ?? `Ø = ${(dim.radius * 2).toFixed(2)}'`,
        angle,
    };
}

/**
 * Arc length dimension calculation: concentric arc at offset distance with radial witness lines.
 */
export function calculateArcLengthDimensionGeometry(dim: ArcLengthAnnotationDimension): {
    center: WorldPoint;
    dimRadius: number;
    startAngle: number;
    endAngle: number;
    centralAngle: number;
    arcLength: number;
    dimensionText: string;
    midAngle: number;
    midpoint: WorldPoint;
    w1Start: WorldPoint;
    w1End: WorldPoint;
    w2Start: WorldPoint;
    w2End: WorldPoint;
} {
    const startAngle = Math.atan2(dim.p1.northing - dim.center.northing, dim.p1.easting - dim.center.easting);
    const centralAngle = dim.radius > 1e-6 ? dim.arcLength / dim.radius : 0;
    const endAngle = dim.isLeftCurve ? startAngle + centralAngle : startAngle - centralAngle;

    const dimRadius = Math.max(0.1, dim.radius + dim.offsetDist);

    const midAngle = dim.isLeftCurve ? startAngle + centralAngle / 2 : startAngle - centralAngle / 2;
    const midpoint: WorldPoint = {
        easting: dim.center.easting + dimRadius * Math.cos(midAngle),
        northing: dim.center.northing + dimRadius * Math.sin(midAngle),
    };

    // Witness lines from P1 and P2 extending radially to dimRadius
    const w1End: WorldPoint = {
        easting: dim.center.easting + dimRadius * Math.cos(startAngle),
        northing: dim.center.northing + dimRadius * Math.sin(startAngle),
    };
    const w2End: WorldPoint = {
        easting: dim.center.easting + dimRadius * Math.cos(endAngle),
        northing: dim.center.northing + dimRadius * Math.sin(endAngle),
    };

    return {
        center: dim.center,
        dimRadius,
        startAngle,
        endAngle,
        centralAngle,
        arcLength: dim.arcLength,
        dimensionText: dim.textOverride ?? `⌒ L = ${dim.arcLength.toFixed(2)}'`,
        midAngle,
        midpoint,
        w1Start: dim.p1,
        w1End,
        w2Start: dim.p2,
        w2End,
    };
}

/**
 * Angular dimension calculation: vertex and two ray points.
 */
export function calculateAngularDimensionGeometry(dim: AngularAnnotationDimension): {
    vertex: WorldPoint;
    arcRadius: number;
    startAngle: number;
    endAngle: number;
    sweepAngle: number;
    dimensionText: string;
    midAngle: number;
    midpoint: WorldPoint;
} {
    const a1 = Math.atan2(dim.p1.northing - dim.vertex.northing, dim.p1.easting - dim.vertex.easting);
    const a2 = Math.atan2(dim.p2.northing - dim.vertex.northing, dim.p2.easting - dim.vertex.easting);

    let sweep = a2 - a1;
    while (sweep < 0) sweep += 2 * Math.PI;
    if (sweep > Math.PI) {
        // Use interior angle
        sweep = 2 * Math.PI - sweep;
    }

    const midAngle = a1 + sweep / 2;
    const midpoint: WorldPoint = {
        easting: dim.vertex.easting + dim.arcRadius * Math.cos(midAngle),
        northing: dim.vertex.northing + dim.arcRadius * Math.sin(midAngle),
    };

    return {
        vertex: dim.vertex,
        arcRadius: dim.arcRadius,
        startAngle: a1,
        endAngle: a1 + sweep,
        sweepAngle: sweep,
        dimensionText: dim.textOverride ?? formatDMS(sweep),
        midAngle,
        midpoint,
    };
}

/**
 * Distance from a point to a line segment in world coordinates.
 */
function distToSegment(pt: WorldPoint, a: WorldPoint, b: WorldPoint): number {
    const dx = b.easting - a.easting;
    const dy = b.northing - a.northing;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-12) return Math.hypot(pt.easting - a.easting, pt.northing - a.northing);

    const t = Math.max(0, Math.min(1, ((pt.easting - a.easting) * dx + (pt.northing - a.northing) * dy) / lenSq));
    const projX = a.easting + t * dx;
    const projY = a.northing + t * dy;
    return Math.hypot(pt.easting - projX, pt.northing - projY);
}

/**
 * Hit test a dimension entity against a world point within a given tolerance.
 */
export function hitTestDimension(dim: AnnotationDimension, worldPt: WorldPoint, threshold: number): boolean {
    switch (dim.type) {
        case 'aligned':
        case 'horizontal':
        case 'vertical': {
            const geom = calculateLinearDimensionGeometry(dim);
            return (
                distToSegment(worldPt, geom.d1, geom.d2) <= threshold ||
                distToSegment(worldPt, geom.p1, geom.d1) <= threshold ||
                distToSegment(worldPt, geom.p2, geom.d2) <= threshold ||
                Math.hypot(worldPt.easting - geom.midpoint.easting, worldPt.northing - geom.midpoint.northing) <= threshold * 1.5
            );
        }
        case 'radius': {
            const geom = calculateRadialDimensionGeometry(dim);
            return (
                distToSegment(worldPt, geom.center, geom.touchPoint) <= threshold ||
                distToSegment(worldPt, geom.touchPoint, geom.textPosition) <= threshold ||
                Math.hypot(worldPt.easting - geom.textPosition.easting, worldPt.northing - geom.textPosition.northing) <= threshold * 1.5
            );
        }
        case 'diameter': {
            const geom = calculateDiameterDimensionGeometry(dim);
            return (
                distToSegment(worldPt, geom.touch1, geom.touch2) <= threshold ||
                distToSegment(worldPt, geom.touch2, geom.textPosition) <= threshold ||
                Math.hypot(worldPt.easting - geom.textPosition.easting, worldPt.northing - geom.textPosition.northing) <= threshold * 1.5
            );
        }
        case 'arc-length': {
            const geom = calculateArcLengthDimensionGeometry(dim);
            const distFromCenter = Math.hypot(worldPt.easting - geom.center.easting, worldPt.northing - geom.center.northing);
            const nearArcRadius = Math.abs(distFromCenter - geom.dimRadius) <= threshold;
            return (
                nearArcRadius ||
                distToSegment(worldPt, geom.w1Start, geom.w1End) <= threshold ||
                distToSegment(worldPt, geom.w2Start, geom.w2End) <= threshold ||
                Math.hypot(worldPt.easting - geom.midpoint.easting, worldPt.northing - geom.midpoint.northing) <= threshold * 1.5
            );
        }
        case 'curve-data': {
            const distToBox = Math.hypot(worldPt.easting - dim.textPosition.easting, worldPt.northing - dim.textPosition.northing);
            const distToCenter = Math.hypot(worldPt.easting - dim.center.easting, worldPt.northing - dim.center.northing);
            const chordMid = { easting: (dim.p1.easting + dim.p2.easting) / 2, northing: (dim.p1.northing + dim.p2.northing) / 2 };
            return (
                distToBox <= threshold * 4 ||
                distToSegment(worldPt, chordMid, dim.textPosition) <= threshold ||
                Math.abs(distToCenter - dim.radius) <= threshold
            );
        }
        case 'angular': {
            const geom = calculateAngularDimensionGeometry(dim);
            const dist = Math.hypot(worldPt.easting - geom.vertex.easting, worldPt.northing - geom.vertex.northing);
            return (
                Math.abs(dist - geom.arcRadius) <= threshold ||
                Math.hypot(worldPt.easting - geom.midpoint.easting, worldPt.northing - geom.midpoint.northing) <= threshold * 1.5
            );
        }
        case 'ordinate': {
            return (
                distToSegment(worldPt, dim.point, dim.leaderEnd) <= threshold ||
                Math.hypot(worldPt.easting - dim.leaderEnd.easting, worldPt.northing - dim.leaderEnd.northing) <= threshold * 1.5
            );
        }
        default:
            return false;
    }
}
