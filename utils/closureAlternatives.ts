import type { BoundaryFileCall } from '../types.ts';
import { parseBearingToRadians, parseDistance } from './cogo.ts';

export interface ClosureBearingAlternative {
    rowIndex: number;
    originalBearing: string;
    proposedBearing: string;
    rationale: string;
    baselineMisclosureDistance: number;
    misclosureDistance: number;
    misclosureImprovementPct: number;
    precisionDenominator: number;
    meanRightAngleDeviationDeg: number;
    maxRightAngleDeviationDeg: number;
    oppositeSideParallelDeviationDeg?: number;
}

interface QuadrantBearingParts {
    northSouth: 'N' | 'S';
    degrees: number;
    minutes: number;
    seconds: number;
    eastWest: 'E' | 'W';
}

function parseQuadrantBearing(value: string): QuadrantBearingParts | null {
    const normalized = value.toUpperCase().replace(/[°'"“”‘’]/g, ' ').replace(/\s+/g, ' ').trim();
    const match = /^([NS])\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+([EW])$/.exec(normalized);
    if (!match) return null;
    const degrees = Number(match[2]);
    const minutes = Number(match[3]);
    const seconds = Number(match[4]);
    if (degrees > 90 || minutes >= 60 || seconds >= 60) return null;
    return {
        northSouth: match[1] as 'N' | 'S',
        degrees,
        minutes,
        seconds,
        eastWest: match[5] as 'E' | 'W',
    };
}

function formatQuadrantBearing(parts: QuadrantBearingParts): string {
    const seconds = Number.isInteger(parts.seconds)
        ? String(parts.seconds).padStart(2, '0')
        : parts.seconds.toFixed(2).padStart(5, '0');
    return `${parts.northSouth} ${parts.degrees}°${String(parts.minutes).padStart(2, '0')}'${seconds}" ${parts.eastWest}`;
}

function angularDifferenceDeg(first: number, second: number): number {
    let difference = Math.abs(first - second) * 180 / Math.PI % 360;
    if (difference > 180) difference = 360 - difference;
    return difference;
}

function lineOrientationDifferenceDeg(first: number, second: number): number {
    const directionDifference = angularDifferenceDeg(first, second);
    return Math.min(directionDifference, 180 - directionDifference);
}

function evaluateStraightTraverse(calls: BoundaryFileCall[]): Omit<ClosureBearingAlternative,
    'rowIndex' | 'originalBearing' | 'proposedBearing' | 'rationale'> | null {
    const azimuths: number[] = [];
    const distances: number[] = [];
    let deltaNorthing = 0;
    let deltaEasting = 0;
    let totalDistance = 0;
    for (const call of calls) {
        if (call.isCurve) return null;
        const azimuth = parseBearingToRadians(call.bearing);
        const distance = parseDistance(call.distance);
        if (azimuth === null || distance === null || distance <= 0) return null;
        azimuths.push(azimuth);
        distances.push(distance);
        deltaNorthing += distance * Math.cos(azimuth);
        deltaEasting += distance * Math.sin(azimuth);
        totalDistance += distance;
    }

    const rightAngleDeviations = azimuths.map((azimuth, index) => {
        const next = azimuths[(index + 1) % azimuths.length];
        return Math.abs(90 - lineOrientationDifferenceDeg(azimuth, next));
    });
    const misclosureDistance = Math.hypot(deltaNorthing, deltaEasting);
    let oppositeSideParallelDeviationDeg: number | undefined;
    if (azimuths.length === 4) {
        oppositeSideParallelDeviationDeg = (
            lineOrientationDifferenceDeg(azimuths[0], azimuths[2])
            + lineOrientationDifferenceDeg(azimuths[1], azimuths[3])
        ) / 2;
    }
    return {
        baselineMisclosureDistance: misclosureDistance,
        misclosureDistance,
        misclosureImprovementPct: 0,
        precisionDenominator: misclosureDistance > 0 ? totalDistance / misclosureDistance : Number.POSITIVE_INFINITY,
        meanRightAngleDeviationDeg: rightAngleDeviations.reduce((sum, value) => sum + value, 0) / rightAngleDeviations.length,
        maxRightAngleDeviationDeg: Math.max(...rightAngleDeviations),
        oppositeSideParallelDeviationDeg,
    };
}

/**
 * Detect the common deed typo where two calls retain identical minutes and
 * seconds but one degree value was copied to the wrong course. Both directions
 * are tested so closure alone cannot arbitrarily decide which call is wrong.
 */
export function findCompetingBearingAlternatives(calls: BoundaryFileCall[]): ClosureBearingAlternative[] {
    if (calls.length < 3 || calls.some(call => call.isCurve)) return [];
    const baseline = evaluateStraightTraverse(calls);
    if (!baseline || baseline.misclosureDistance < 0.01) return [];
    const parsed = calls.map(call => parseQuadrantBearing(call.bearing));
    const alternatives: ClosureBearingAlternative[] = [];
    const seen = new Set<string>();

    for (let firstIndex = 0; firstIndex < parsed.length; firstIndex++) {
        const first = parsed[firstIndex];
        if (!first) continue;
        for (let secondIndex = firstIndex + 1; secondIndex < parsed.length; secondIndex++) {
            const second = parsed[secondIndex];
            if (!second || first.degrees === second.degrees) continue;
            if (first.minutes !== second.minutes || first.seconds !== second.seconds) continue;

            for (const [rowIndex, replacementDegrees, matchedRowIndex] of [
                [firstIndex, second.degrees, secondIndex],
                [secondIndex, first.degrees, firstIndex],
            ] as const) {
                const original = parsed[rowIndex]!;
                const proposedBearing = formatQuadrantBearing({ ...original, degrees: replacementDegrees });
                const key = `${rowIndex}:${proposedBearing}`;
                if (seen.has(key)) continue;
                const patchedCalls = calls.map((call, index) => index === rowIndex
                    ? { ...call, bearing: proposedBearing }
                    : call);
                const metrics = evaluateStraightTraverse(patchedCalls);
                if (!metrics || metrics.misclosureDistance >= baseline.misclosureDistance * 0.95) continue;
                seen.add(key);
                alternatives.push({
                    rowIndex,
                    originalBearing: calls[rowIndex].bearing,
                    proposedBearing,
                    rationale: `Rows ${rowIndex + 1} and ${matchedRowIndex + 1} share ${String(original.minutes).padStart(2, '0')}'${String(original.seconds).padStart(2, '0')}"; test whether the ${original.degrees}° degree value on row ${rowIndex + 1} should be ${replacementDegrees}° instead.`,
                    baselineMisclosureDistance: baseline.misclosureDistance,
                    misclosureImprovementPct: (1 - metrics.misclosureDistance / baseline.misclosureDistance) * 100,
                    ...metrics,
                });
            }
        }
    }

    return alternatives.sort((first, second) => {
        const closureDifference = first.misclosureDistance - second.misclosureDistance;
        if (Math.abs(closureDifference) >= 0.01) return closureDifference;
        return first.meanRightAngleDeviationDeg - second.meanRightAngleDeviationDeg;
    });
}