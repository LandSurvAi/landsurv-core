// closureSolver.ts
// Attempts to auto-fix exactly ONE missing piece of data in a boundary traverse
// so a closure report can still be generated.
//
// Supported cases (in order of priority):
//   1. A single straight call missing bearing OR distance OR both.
//      → Inverse-solve from the call's `from` point to its `to` point, after
//        propagating all OTHER calls forward from the POB.
//   2. A single curve call missing chordBearing (but radius + arcLength present).
//      → Same inverse approach yields the chord bearing geometrically.
//
// For anything more ambiguous (≥2 missing legs, missing curve radius/arc, etc.)
// the solver returns `null` with a reason so the caller can show a friendly hint.

import type { BoundaryFileCall, SurveyPoint, Ambiguity } from '../types.ts';
import {
    parseBearingToRadians,
    parseDistance,
    direct,
    directCurve,
    inverse,
    formatBearing,
    calculateChordDistance,
    calculateClosure,
} from './cogo.ts';

export type SolveResult =
    | { ok: true; patchedCalls: BoundaryFileCall[]; fixedIndex: number; summary: string }
    | { ok: false; reason: string };

/** Returns true if a straight call is missing essential data. */
function straightIsIncomplete(c: BoundaryFileCall): boolean {
    return !c.isCurve && (parseBearingToRadians(c.bearing) === null || parseDistance(c.distance) === null);
}

/** Returns true if a curve is missing chord bearing but otherwise solvable. */
function curveMissingChordBearing(c: BoundaryFileCall): boolean {
    if (!c.isCurve) return false;
    const haveRadiusArc = !!(c.curveRadius && c.arcLength);
    const haveChordBrg = !!parseBearingToRadians(c.chordBearing ?? '');
    return haveRadiusArc && !haveChordBrg;
}

/** Propagate forward through one call, returning the next point or null if impossible. */
function stepCall(
    fromPt: SurveyPoint,
    call: BoundaryFileCall,
): { northing: number; easting: number } | null {
    if (call.isCurve) {
        if (!call.curveRadius || !call.arcLength) return null;
        const tanSrc = call.tangentBearing || call.bearing;
        const tanRad = parseBearingToRadians(tanSrc);
        if (tanRad === null) return null;
        const dir: 'left' | 'right' = call.curveDirection ?? 'right';
        const delta = (call.arcLength / call.curveRadius) * (dir === 'left' ? -1 : 1);
        return directCurve(fromPt, tanRad, call.curveRadius, delta);
    }
    const brRad = parseBearingToRadians(call.bearing);
    const dist = parseDistance(call.distance);
    if (brRad === null || dist === null) return null;
    return direct(fromPt, brRad, dist);
}

/** Closure vectors are translation-invariant, so an unlocated deed can use a local POB. */
function resolvePobPoint(
    pointNumber: string | undefined,
    pointMap: Map<string, SurveyPoint>,
): SurveyPoint | undefined {
    if (!pointNumber) return undefined;
    return pointMap.get(pointNumber) ?? {
        pointNumber,
        northing: 0,
        easting: 0,
        elevation: 0,
        description: 'Local POB',
    };
}

/**
 * Try to fill in the single missing piece of data in `calls`.
 * Returns the patched calls + a one-line summary on success, or a reason on failure.
 */
export function solveSingleMissing(
    calls: BoundaryFileCall[],
    pointMap: Map<string, SurveyPoint>,
): SolveResult {
    if (calls.length < 2) return { ok: false, reason: 'Need at least 2 calls to attempt a solve.' };

    // 1. Identify the unique missing call.
    const missingIdxs: number[] = [];
    for (let i = 0; i < calls.length; i++) {
        const c = calls[i];
        if (straightIsIncomplete(c) || curveMissingChordBearing(c)) missingIdxs.push(i);
    }
    if (missingIdxs.length === 0) return { ok: false, reason: 'No missing data detected.' };
    if (missingIdxs.length > 1) {
        return {
            ok: false,
            reason: `${missingIdxs.length} calls have missing data (rows ${missingIdxs.map(i => i + 1).join(', ')}). The auto-solver only handles a single unknown leg.`,
        };
    }

    const fixIdx = missingIdxs[0];
    const target = calls[fixIdx];

    // 2. The traverse must be a closed polygon for the inverse trick to work.
    //    (i.e. the last call's `to` must equal the first call's `from`.)
    const pob = calls[0].from;
    const closingTo = calls[calls.length - 1].to;
    if (pob !== closingTo) {
        return {
            ok: false,
            reason: `Traverse is not closed (call 1 starts at ${pob}, last call ends at ${closingTo}). Inverse solver needs a closed polygon.`,
        };
    }

    // 3. Walk forward from POB up to `target.from`, then BACKWARD from POB (going through
    //    the closing leg) until we reach `target.to`. Every OTHER call must be solvable.
    const startPt = resolvePobPoint(pob, pointMap)!;

    // Forward walk
    let cursor: { northing: number; easting: number } = { northing: startPt.northing, easting: startPt.easting };
    for (let i = 0; i < fixIdx; i++) {
        const next = stepCall(
            { ...cursor, pointNumber: calls[i].from, elevation: 0, description: '' } as SurveyPoint,
            calls[i],
        );
        if (!next) {
            return {
                ok: false,
                reason: `Cannot solve: row ${i + 1} (before the unknown) also has missing/invalid data.`,
            };
        }
        cursor = next;
    }
    const fromCoord = cursor;

    // Backward walk (reverse remaining calls)
    cursor = { northing: startPt.northing, easting: startPt.easting };
    const reversed: BoundaryFileCall[] = [];
    for (let i = calls.length - 1; i > fixIdx; i--) reversed.push(calls[i]);
    for (const c of reversed) {
        // Reverse a call by flipping bearing 180° (straights) or negating delta (curves)
        // and stepping from its `to` back to its `from`.
        if (c.isCurve) {
            if (!c.curveRadius || !c.arcLength) {
                return { ok: false, reason: `Cannot solve: curve ${c.from}→${c.to} (after the unknown) is also missing data.` };
            }
            const tanSrc = c.tangentBearing || c.bearing;
            const tanRad = parseBearingToRadians(tanSrc);
            if (tanRad === null) {
                return { ok: false, reason: `Cannot solve: curve ${c.from}→${c.to} (after the unknown) has unparseable tangent bearing.` };
            }
            const dir: 'left' | 'right' = c.curveDirection ?? 'right';
            const delta = (c.arcLength / c.curveRadius) * (dir === 'left' ? -1 : 1);
            // Forward step from c.from with original tangent gives c.to. To reverse:
            // the chord direction reversed = chordBearing + π, distance = chordDistance.
            const chordRad = tanRad + delta / 2;
            const chordDist = calculateChordDistance(c.curveRadius, delta);
            cursor = direct(cursor, chordRad + Math.PI, chordDist);
        } else {
            const brRad = parseBearingToRadians(c.bearing);
            const dist = parseDistance(c.distance);
            if (brRad === null || dist === null) {
                return { ok: false, reason: `Cannot solve: row after the unknown also has missing data.` };
            }
            cursor = direct(cursor, brRad + Math.PI, dist);
        }
    }
    const toCoord = cursor;

    // 4. Inverse from fromCoord → toCoord gives the required bearing & distance.
    const inv = inverse(
        { northing: fromCoord.northing, easting: fromCoord.easting },
        { northing: toCoord.northing, easting: toCoord.easting },
    );
    const bearingStr = formatBearing(inv.bearing);
    const distStr = inv.distance.toFixed(2);

    const patched = calls.slice();

    if (target.isCurve) {
        // Compute chord distance from radius + arc + assumed direction; set chordBearing.
        const dir: 'left' | 'right' = target.curveDirection ?? 'right';
        const delta = (target.arcLength! / target.curveRadius!) * (dir === 'left' ? -1 : 1);
        const expectedChordDist = calculateChordDistance(target.curveRadius!, delta);
        // Sanity check: inverse distance should ≈ expected chord distance
        const distErr = Math.abs(expectedChordDist - inv.distance);
        const tolerance = Math.max(0.5, expectedChordDist * 0.02);
        if (distErr > tolerance) {
            return {
                ok: false,
                reason: `Inverse chord distance ${inv.distance.toFixed(2)}' disagrees with arc/radius geometry ${expectedChordDist.toFixed(2)}' by ${distErr.toFixed(2)}'. Check radius, arc, or curve direction.`,
            };
        }
        patched[fixIdx] = {
            ...target,
            chordBearing: bearingStr,
            chordDistance: expectedChordDist,
            // Mirror to bearing/distance so downstream COGO is consistent.
            bearing: bearingStr,
            distance: expectedChordDist.toFixed(2),
            // Derive tangent bearing geometrically: tangent = chord - Δ/2.
            tangentBearing: target.tangentBearing || formatBearing(inv.bearing - delta / 2),
        };
        return {
            ok: true,
            patchedCalls: patched,
            fixedIndex: fixIdx,
            summary: `Solved chord bearing for curve ${target.from}→${target.to} = ${bearingStr} (Δ=${(Math.abs(delta) * 180 / Math.PI).toFixed(4)}°).`,
        };
    }

    // Straight leg: fill bearing and/or distance.
    patched[fixIdx] = {
        ...target,
        bearing: bearingStr,
        distance: distStr,
    };
    return {
        ok: true,
        patchedCalls: patched,
        fixedIndex: fixIdx,
        summary: `Solved missing leg ${target.from}→${target.to} = ${bearingStr}, ${distStr}'.`,
    };
}

// =============================================================================
// tryRotateCurveChordsIntoTolerance
//
// A curve's endpoint is fully determined by its start point, chord bearing,
// and chord length (2·R·sin(Δ/2)) — the arc's left/right handedness only
// changes which side the arc bulges. So when a closed traverse miscloses and
// a curve's chord direction was a guess, the correct direction is recoverable
// geometrically: walk forward from the POB to the curve's start, walk
// backward from the POB to the curve's end, and the inverse between them IS
// the required chord — i.e. rotate the curve until its endpoint touches.
//
// The classic case is a deed that STARTS with a curve: with no preceding leg
// the parsing agent has no tangent reference, so the leading chord bearing is
// arbitrary (sometimes 180° backwards). The same applies to a closing
// cul-de-sac curve whose chord bearing the deed never states.
//
// Safety gates: the inverse distance must match the radius/arc chord length
// (otherwise some other call is wrong), no-op rotations are skipped, and the
// patch is kept only when the full traverse then closes within tolerance.
// =============================================================================

export type RotateCurveChordResult =
    | { ok: true; patchedCalls: BoundaryFileCall[]; curveIndex: number; summary: string; baselineMisclosure: number; rotatedMisclosure: number }
    | { ok: false; reason: string };

/** Chord-exact forward step (mirrors calculateClosure's chord-first resolution). */
function stepForwardExact(
    fromPt: { northing: number; easting: number },
    call: BoundaryFileCall,
): { northing: number; easting: number } | null {
    if (call.isCurve) {
        if (!call.curveRadius || !call.arcLength) return null;
        const dir: 'left' | 'right' = call.curveDirection ?? 'right';
        const delta = (call.arcLength / call.curveRadius) * (dir === 'left' ? -1 : 1);
        let chordRad = parseBearingToRadians(call.chordBearing ?? '') ?? parseBearingToRadians(call.bearing ?? '');
        if (chordRad === null) {
            const tanRad = parseBearingToRadians(call.tangentBearing ?? '');
            if (tanRad === null) return null;
            chordRad = tanRad + delta / 2;
        }
        return direct(fromPt, chordRad, calculateChordDistance(call.curveRadius, delta));
    }
    const brRad = parseBearingToRadians(call.bearing);
    const dist = parseDistance(call.distance);
    if (brRad === null || dist === null) return null;
    return direct(fromPt, brRad, dist);
}

/** Exact reverse of stepForwardExact — step from a call's endpoint back to its start. */
function stepBackwardExact(
    endPt: { northing: number; easting: number },
    call: BoundaryFileCall,
): { northing: number; easting: number } | null {
    if (call.isCurve) {
        if (!call.curveRadius || !call.arcLength) return null;
        const dir: 'left' | 'right' = call.curveDirection ?? 'right';
        const delta = (call.arcLength / call.curveRadius) * (dir === 'left' ? -1 : 1);
        let chordRad = parseBearingToRadians(call.chordBearing ?? '') ?? parseBearingToRadians(call.bearing ?? '');
        if (chordRad === null) {
            const tanRad = parseBearingToRadians(call.tangentBearing ?? '');
            if (tanRad === null) return null;
            chordRad = tanRad + delta / 2;
        }
        return direct(endPt, chordRad + Math.PI, calculateChordDistance(call.curveRadius, delta));
    }
    const brRad = parseBearingToRadians(call.bearing);
    const dist = parseDistance(call.distance);
    if (brRad === null || dist === null) return null;
    return direct(endPt, brRad + Math.PI, dist);
}

export function tryRotateCurveChordsIntoTolerance(
    calls: BoundaryFileCall[],
    pointMap: Map<string, SurveyPoint>,
): RotateCurveChordResult {
    if (calls.length < 2) return { ok: false, reason: 'Need at least 2 calls to evaluate a curve rotation.' };

    // Scoring a rotation by endpoint only works when the traverse nominally
    // closes back onto its own point of beginning.
    const pob = calls[0].from;
    if (!pob || calls[calls.length - 1].to !== pob) {
        return { ok: false, reason: 'Traverse does not close on its POB — cannot score a rotation by endpoint.' };
    }

    const toClosureLines = (list: BoundaryFileCall[]) => list.map(c => ({
        from: c.from,
        to: c.to,
        bearing: c.bearing,
        distance: c.distance,
        isCurve: c.isCurve,
        curveRadius: c.curveRadius,
        arcLength: c.arcLength,
        chordBearing: c.chordBearing,
        chordDistance: c.chordDistance,
        tangentBearing: c.tangentBearing,
        curveDirection: c.curveDirection,
    }));
    const pobPt = resolvePobPoint(pob, pointMap)!;
    const closureMap = new Map([[pob, { pointNumber: pob, northing: pobPt.northing, easting: pobPt.easting }]]);

    // Tolerance: 0.5 ft floor, loosened to 1:5000 relative precision on large tracts.
    // Total distance is summed manually so an unparseable curve (e.g. chord not
    // yet supplied) doesn't prevent the tolerance from being defined.
    let totalDistance = 0;
    for (const c of calls) {
        totalDistance += c.isCurve ? (c.arcLength ?? 0) : (parseDistance(c.distance) ?? 0);
    }
    const tolerance = Math.max(0.5, totalDistance / 5000);

    let baselineMisclosure = Number.POSITIVE_INFINITY;
    try {
        baselineMisclosure = calculateClosure(toClosureLines(calls), closureMap).misclosureDistance;
        if (baselineMisclosure <= tolerance) {
            return { ok: false, reason: `Traverse already closes within tolerance (${baselineMisclosure.toFixed(4)}').` };
        }
    } catch {
        // Baseline not computable (e.g. a curve has no chord/tangent yet) —
        // the rotation may supply that missing geometry, so keep going.
    }

    const pobOrigin = { northing: pobPt.northing, easting: pobPt.easting };
    let best: { patchedCalls: BoundaryFileCall[]; curveIndex: number; misclosure: number; summary: string } | null = null;

    for (let i = 0; i < calls.length; i++) {
        const c = calls[i];
        if (!c.isCurve || !c.curveRadius || !c.arcLength) continue;

        // Where the curve starts: exact forward walk from the POB.
        let start: { northing: number; easting: number } | null = pobOrigin;
        for (let j = 0; j < i && start; j++) start = stepForwardExact(start, calls[j]);
        if (!start) continue;

        // Where the curve must end: exact backward walk from the POB.
        let target: { northing: number; easting: number } | null = pobOrigin;
        for (let j = calls.length - 1; j > i && target; j--) target = stepBackwardExact(target, calls[j]);
        if (!target) continue;

        const dir: 'left' | 'right' = c.curveDirection ?? 'right';
        const delta = (c.arcLength / c.curveRadius) * (dir === 'left' ? -1 : 1);
        const chordDist = calculateChordDistance(c.curveRadius, delta);
        const inv = inverse(start, target);

        // The inverse distance must equal the radius/arc chord length —
        // otherwise this curve alone cannot be the culprit.
        const chordTol = Math.max(0.5, chordDist * 0.02);
        if (Math.abs(inv.distance - chordDist) > chordTol) continue;

        // Skip no-op rotations — the chord already points the right way.
        const existingChordRad = parseBearingToRadians(c.chordBearing ?? '') ?? parseBearingToRadians(c.bearing ?? '');
        if (existingChordRad !== null) {
            let diff = Math.abs(inv.bearing - existingChordRad) % (2 * Math.PI);
            if (diff > Math.PI) diff = 2 * Math.PI - diff;
            if (diff * 180 / Math.PI < 0.5) continue;
        }

        const newChord = formatBearing(inv.bearing);
        const patched = calls.slice();
        patched[i] = {
            ...c,
            chordBearing: newChord,
            chordDistance: chordDist,
            // Mirror the chord into bearing/distance for closure and SurveyLine consumers.
            bearing: newChord,
            distance: chordDist.toFixed(2),
            // Derive tangent bearing geometrically: tangent = chord - Δ/2.
            tangentBearing: formatBearing(inv.bearing - delta / 2),
        };

        let misclosure: number;
        try {
            misclosure = calculateClosure(toClosureLines(patched), closureMap).misclosureDistance;
        } catch {
            continue;
        }
        if (misclosure > tolerance) continue;
        if (best && misclosure >= best.misclosure) continue;

        const deltaDeg = (Math.abs(delta) * 180 / Math.PI).toFixed(4);
        const misclosureNote = isFinite(baselineMisclosure)
            ? `misclosure ${baselineMisclosure.toFixed(4)}' → ${misclosure.toFixed(4)}'`
            : `patched misclosure ${misclosure.toFixed(4)}'`;
        const existingChordStr = (c.chordBearing && parseBearingToRadians(c.chordBearing) !== null) ? c.chordBearing : undefined;
        best = {
            patchedCalls: patched,
            curveIndex: i,
            misclosure,
            summary: existingChordStr
                ? `Rotated curve ${c.from}→${c.to}: chord ${existingChordStr} → ${newChord} (Δ=${deltaDeg}°); ${misclosureNote}.`
                : `Solved curve ${c.from}→${c.to} chord from endpoint geometry: ${newChord}, ${chordDist.toFixed(2)}' (Δ=${deltaDeg}°); ${misclosureNote}.`,
        };
    }

    if (!best) {
        const baseNote = isFinite(baselineMisclosure) ? ` (baseline misclosure ${baselineMisclosure.toFixed(4)}')` : '';
        return { ok: false, reason: `No single-curve chord rotation restores closure within ${tolerance.toFixed(2)}'${baseNote}.` };
    }
    if (best.misclosure > baselineMisclosure * 0.5) {
        return { ok: false, reason: 'Best curve rotation is not a convincing improvement over the baseline.' };
    }
    return {
        ok: true,
        patchedCalls: best.patchedCalls,
        curveIndex: best.curveIndex,
        summary: best.summary,
        baselineMisclosure,
        rotatedMisclosure: best.misclosure,
    };
}

// =============================================================================
// investigateClosure — high-level diagnostic that returns a list of generic
// Ambiguity records describing every issue it finds in the traverse, with a
// proposed automatic fix attached when one can be computed.
//
// This is the "Investigate Closure" entry point: it's broader than
// solveSingleMissing because it surfaces every issue (closure check, missing
// curve data, multiple unknowns, etc.) so the UI can present them to the user
// instead of failing silently.
// =============================================================================
export interface InvestigationReport {
    /** Generic ambiguity records, one per detected issue. */
    ambiguities: Ambiguity[];
    /** Convenience: if exactly one leg was auto-solvable, the patched calls. */
    autoPatchedCalls?: BoundaryFileCall[];
    /** Index of the auto-patched call (when present). */
    autoPatchedIndex?: number;
}

export function investigateClosure(
    calls: BoundaryFileCall[],
    pointMap: Map<string, SurveyPoint>,
    fileId?: string,
): InvestigationReport {
    const out: Ambiguity[] = [];
    const mkId = (suffix: string) => `closure-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${suffix}`;

    if (calls.length === 0) {
        out.push({
            id: mkId('empty'),
            source: 'closure',
            kind: 'empty traverse',
            reason: 'Boundary file has no calls. Add at least three rows to investigate closure.',
            severity: 'error',
            location: { fileId },
        });
        return { ambiguities: out };
    }
    if (calls.length < 3) {
        out.push({
            id: mkId('short'),
            source: 'closure',
            kind: 'too few calls',
            reason: `Need at least 3 calls to evaluate closure (currently ${calls.length}).`,
            severity: 'warning',
            location: { fileId },
        });
    }

    // Closure check
    const pob = calls[0]?.from;
    const lastTo = calls[calls.length - 1]?.to;
    if (pob && lastTo && pob !== lastTo) {
        out.push({
            id: mkId('open'),
            source: 'closure',
            kind: 'open polygon',
            reason: `Traverse starts at point ${pob} but ends at point ${lastTo} — not a closed loop. Add a closing leg from ${lastTo} back to ${pob}.`,
            severity: 'warning',
            location: { fileId },
        });
    }

    // Per-row data completeness
    const incompleteIdxs: number[] = [];
    for (let i = 0; i < calls.length; i++) {
        const c = calls[i];
        if (straightIsIncomplete(c)) {
            incompleteIdxs.push(i);
            const missing: string[] = [];
            if (parseBearingToRadians(c.bearing) === null) missing.push('bearing');
            if (parseDistance(c.distance) === null) missing.push('distance');
            out.push({
                id: mkId(`miss-${i}`),
                source: 'closure',
                kind: 'missing leg data',
                reason: `Row ${i + 1} (${c.from}→${c.to}) is missing ${missing.join(' and ')}.`,
                severity: 'warning',
                location: { fileId, rowIndex: i, callId: c.id },
            });
        } else if (c.isCurve) {
            const haveRadiusArc = !!(c.curveRadius && c.arcLength);
            if (!haveRadiusArc) {
                incompleteIdxs.push(i);
                out.push({
                    id: mkId(`curve-${i}`),
                    source: 'closure',
                    kind: 'incomplete curve',
                    reason: `Row ${i + 1} (curve ${c.from}→${c.to}) needs both radius AND arc length to be evaluated.`,
                    severity: 'warning',
                    location: { fileId, rowIndex: i, callId: c.id },
                });
            } else if (curveMissingChordBearing(c)) {
                incompleteIdxs.push(i);
                out.push({
                    id: mkId(`chord-${i}`),
                    source: 'closure',
                    kind: 'missing chord bearing',
                    reason: `Row ${i + 1} (curve ${c.from}→${c.to}) has radius & arc but no chord bearing — common in plans where the chord bearing isn't drawn.`,
                    severity: 'info',
                    location: { fileId, rowIndex: i, callId: c.id },
                });
            }
        }
    }

    // Matching point labels only describe the intended topology. Verify that
    // the deed calls actually return to the POB when marched by bearing and
    // distance; otherwise a final `to: POB` label can hide a large misclosure.
    if (incompleteIdxs.length === 0) {
        try {
            const closurePointMap = new Map(pointMap);
            const startPoint = resolvePobPoint(pob, pointMap);
            if (pob && startPoint) closurePointMap.set(pob, startPoint);
            const closure = calculateClosure(calls.map(c => ({
                from: c.from,
                to: c.to,
                bearing: c.bearing,
                distance: c.distance,
                isCurve: c.isCurve,
                curveRadius: c.curveRadius,
                arcLength: c.arcLength,
                chordBearing: c.chordBearing,
                tangentBearing: c.tangentBearing,
                curveDirection: c.curveDirection,
                deltaAngle: undefined,
            })), closurePointMap);
            if (closure.misclosureDistance >= 0.01) {
                out.push({
                    id: mkId('geometric-misclosure'),
                    source: 'closure',
                    kind: 'geometric misclosure',
                    reason: `The calls miss the point of beginning by ${closure.misclosureDistance.toFixed(4)} ft (${closure.precision}), bearing ${closure.misclosureBearing}. The point labels form a loop, but the bearing-distance geometry does not close.`,
                    severity: 'warning',
                    location: { fileId },
                });
            }
        } catch (error) {
            out.push({
                id: mkId('calculation-failed'),
                source: 'closure',
                kind: 'closure calculation failed',
                reason: error instanceof Error ? error.message : 'The traverse geometry could not be evaluated.',
                severity: 'warning',
                location: { fileId },
            });
        }
    }

    // Attempt single-unknown auto-solve and attach as proposedFix to the matching ambiguity.
    let autoPatchedCalls: BoundaryFileCall[] | undefined;
    let autoPatchedIndex: number | undefined;
    if (incompleteIdxs.length === 1) {
        const solve = solveSingleMissing(calls, pointMap);
        if (solve.ok) {
            autoPatchedCalls = solve.patchedCalls;
            autoPatchedIndex = solve.fixedIndex;
            const target = out.find(a => a.location?.rowIndex === solve.fixedIndex);
            if (target) {
                target.proposedFix = {
                    summary: solve.summary,
                    payload: { patchedCalls: solve.patchedCalls, fixedIndex: solve.fixedIndex },
                };
                target.severity = 'info';
            }
        } else {
            // At this point, solve.ok must be false
            const failSolve = solve as { ok: false; reason: string };
            out.push({
                id: mkId('solve-fail'),
                source: 'closure',
                kind: 'auto-solve failed',
                reason: failSolve.reason,
                severity: 'warning',
                location: { fileId },
            });
        }
    } else if (incompleteIdxs.length > 1) {
        out.push({
            id: mkId('multi-unknown'),
            source: 'closure',
            kind: 'multiple unknowns',
            reason: `${incompleteIdxs.length} legs have missing data (rows ${incompleteIdxs.map(i => i + 1).join(', ')}). The auto-solver only fixes a single unknown leg — please supply data for all but one and re-investigate.`,
            severity: 'warning',
            location: { fileId },
        });
    }

    return { ambiguities: out, autoPatchedCalls, autoPatchedIndex };
}

// =============================================================================
// solveAllFixable — best-effort batch fixer used by the Investigate Closure
// modal's "Fix Now" button. It tries every automatic remedy we know how to
// perform, applies the ones that succeed, and reports what it did so the
// caller can show the user a one-line summary per fix.
//
// Currently performs (in order, looping until no further progress):
//   0. Rotate a suspect curve's chord into tolerance when the traverse
//      miscloses and the chord direction was a guess (leading curve with no
//      preceding tangent, or a closing cul-de-sac curve).
//   1. Auto-close an open polygon by appending a closing leg whose bearing
//      and distance are computed via inverse from the forward-propagated
//      final point back to the POB.
//   2. Single-unknown solve (delegates to solveSingleMissing).
// =============================================================================

export interface FixAllResult {
    /** Final call list after all applied fixes (may equal input if nothing was fixable). */
    finalCalls: BoundaryFileCall[];
    /** Human-readable summaries of each applied fix, in order. */
    appliedFixes: string[];
    /** True if anything actually changed. */
    changed: boolean;
}

function tryCloseTraverse(
    calls: BoundaryFileCall[],
    pointMap: Map<string, SurveyPoint>,
): { calls: BoundaryFileCall[]; summary: string } | null {
    if (calls.length < 2) return null;
    const pob = calls[0].from;
    const lastTo = calls[calls.length - 1].to;
    if (!pob || !lastTo || pob === lastTo) return null; // already closed
    const startPt = resolvePobPoint(pob, pointMap)!;

    // Walk forward from POB through every existing call. If any call can't
    // be stepped (missing data we don't have a fallback for), bail — closing
    // requires every existing leg to be propagatable.
    let cursor: { northing: number; easting: number } = { northing: startPt.northing, easting: startPt.easting };
    for (const c of calls) {
        const next = stepCall(
            { ...cursor, pointNumber: c.from, elevation: 0, description: '' } as SurveyPoint,
            c,
        );
        if (!next) return null;
        cursor = next;
    }

    // Inverse back to POB gives the closing leg's bearing & distance.
    const inv = inverse(
        { northing: cursor.northing, easting: cursor.easting },
        { northing: startPt.northing, easting: startPt.easting },
    );
    if (inv.distance < 0.01) return null; // effectively already closed

    const closingCall: BoundaryFileCall = {
        id: `closing-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        from: lastTo,
        to: pob,
        bearing: formatBearing(inv.bearing),
        distance: inv.distance.toFixed(2),
    };
    return {
        calls: [...calls, closingCall],
        summary: `Added closing leg ${lastTo}→${pob} = ${formatBearing(inv.bearing)}, ${inv.distance.toFixed(2)}'.`,
    };
}

export function solveAllFixable(
    calls: BoundaryFileCall[],
    pointMap: Map<string, SurveyPoint>,
): FixAllResult {
    let working: BoundaryFileCall[] = calls.slice();
    const applied: string[] = [];

    // ── Curve-chord rotation ─────────────────────────────────────────────────
    // A deed whose curve chord direction was a guess — classically a LEADING
    // curve with no preceding tangent, or a closing cul-de-sac curve whose
    // chord was never stated — miscloses at the POB until the curve is rotated
    // so its endpoint touches. Run before the other passes so they operate on
    // correctly-located geometry.
    const chordRotation = tryRotateCurveChordsIntoTolerance(working, pointMap);
    if (chordRotation.ok) {
        working = chordRotation.patchedCalls;
        applied.push(chordRotation.summary);
    }

    // ── Pass 0: "curve-closes-the-polygon" solver ────────────────────────────
    // In typical deed practice, when the LAST call is a curve with R + Arc but
    // no chord bearing, that curve IS the closing element back to the POB
    // (i.e. curve.to should equal POB). Walk forward from POB to the curve's
    // start, inverse from there to POB, and use that as the chord bearing — but
    // ONLY if the inverse distance matches the geometric chord (2·R·sin(Δ/2))
    // within tolerance. This is the right answer for any curve that's really
    // meant to close the traverse and avoids spuriously assuming the curve is
    // tangent to the previous leg.
    const pob0 = working[0]?.from;
    const pobPt0 = resolvePobPoint(pob0, pointMap);
    if (pob0 && pobPt0) {
        for (let i = 0; i < working.length; i++) {
            const c = working[i];
            if (!c.isCurve) continue;
            if (!c.curveRadius || !c.arcLength) continue;
            if (parseBearingToRadians(c.chordBearing ?? '') !== null) continue;

            // Walk forward through all prior calls to get to the curve's start.
            let cur: { northing: number; easting: number } = { northing: pobPt0.northing, easting: pobPt0.easting };
            let blocked = false;
            for (let j = 0; j < i; j++) {
                const next = stepCall(
                    { ...cur, pointNumber: working[j].from, elevation: 0, description: '' } as SurveyPoint,
                    working[j],
                );
                if (!next) { blocked = true; break; }
                cur = next;
            }
            if (blocked) continue;

            // Treat this curve as the closing element: curve.to == POB.
            // Inverse from curve start to POB gives required chord direction.
            const inv = inverse(
                { northing: cur.northing, easting: cur.easting },
                { northing: pobPt0.northing, easting: pobPt0.easting },
            );
            const dir: 'left' | 'right' = c.curveDirection ?? 'right';
            const delta = (c.arcLength / c.curveRadius) * (dir === 'left' ? -1 : 1);
            const expectedChord = calculateChordDistance(c.curveRadius, delta);
            const tol = Math.max(0.5, expectedChord * 0.02);
            if (Math.abs(inv.distance - expectedChord) > tol) {
                // Curve doesn't actually close to POB within geometric tolerance.
                // Don't apply this fix — it would force a wrong chord bearing.
                continue;
            }

            const chordBrg = formatBearing(inv.bearing);
            const tangentBrg = formatBearing(inv.bearing - delta / 2);
            // Rewrite curve.to to be the POB so the polygon is closed downstream.
            const newTo = pob0;
            working[i] = {
                ...c,
                to: newTo,
                chordBearing: chordBrg,
                chordDistance: expectedChord,
                bearing: chordBrg,
                distance: expectedChord.toFixed(2),
                tangentBearing: tangentBrg,
            };
            applied.push(
                `Curve ${c.from}→${newTo}: solved as the closing element back to POB ${pob0}. ` +
                `Chord ${chordBrg}, ${expectedChord.toFixed(2)}' (matches arc/radius geometry within ${Math.abs(inv.distance - expectedChord).toFixed(3)}').`,
            );
        }
    }

    // ── Pass 1: surveyor-smart per-curve chord-bearing solver ───────────────
    // Try multiple tangent hypotheses (entry-from-prev-leg AND exit-into-next-
    // leg-or-POB) and pick the one whose chord endpoint lands closest to the
    // call's expected destination. This mimics how a surveyor reads a deed:
    // a closing curve at the end of the traverse is almost always tangent to
    // the FIRST call leaving POB (so the polygon flows continuously through
    // POB), not necessarily tangent to its immediately-preceding leg.
    const TANGENT_PLACEHOLDER_RAD = 0;          // due North → matches "N00°00'00\"E"
    const isDefaultTangent = (s?: string) => {
        if (!s) return true;
        const r = parseBearingToRadians(s);
        return r === null || Math.abs(r - TANGENT_PLACEHOLDER_RAD) < 1e-9;
    };

    // Walk forward through prior calls; returns the curve start point (or null).
    const computeCurveStart = (curveIdx: number): { northing: number; easting: number } | null => {
        const pob = working[0]?.from;
        const pobPt = resolvePobPoint(pob, pointMap);
        if (!pobPt) return null;
        let cur: { northing: number; easting: number } = { northing: pobPt.northing, easting: pobPt.easting };
        for (let j = 0; j < curveIdx; j++) {
            const next = stepCall(
                { ...cur, pointNumber: working[j].from, elevation: 0, description: '' } as SurveyPoint,
                working[j],
            );
            if (!next) return null;
            cur = next;
        }
        return cur;
    };

    for (let i = 0; i < working.length; i++) {
        const c = working[i];
        if (!c.isCurve) continue;
        if (!c.curveRadius || !c.arcLength) continue;
        if (parseBearingToRadians(c.chordBearing ?? '') !== null) continue;  // already solved (e.g. by Pass 0)

        const dir: 'left' | 'right' = c.curveDirection ?? 'right';
        const delta = (c.arcLength / c.curveRadius) * (dir === 'left' ? -1 : 1);
        const chordDist = calculateChordDistance(c.curveRadius, delta);

        // ── Collect tangent candidates ─────────────────────────────────────
        // candidate = { tanRad, label, scoringTarget }
        // tanRad     : inferred tangent-IN azimuth (radians from North)
        // scoringTarget: where the chord SHOULD end up if this tangent is right
        //                (used to pick between candidates)
        const candidates: { tanRad: number; chordRad: number; label: string }[] = [];

        // (a) User-supplied tangent (only if not the default placeholder).
        if (!isDefaultTangent(c.tangentBearing)) {
            const tan = parseBearingToRadians(c.tangentBearing!);
            if (tan !== null) candidates.push({ tanRad: tan, chordRad: tan + delta / 2, label: 'user-entered tangent' });
        }

        // (b) Entry tangent = previous leg's outbound bearing.
        if (i > 0) {
            const prev = working[i - 1];
            if (!prev.isCurve) {
                const prevBrg = parseBearingToRadians(prev.bearing);
                if (prevBrg !== null) candidates.push({ tanRad: prevBrg, chordRad: prevBrg + delta / 2, label: `entry tangent (tangent to leg ${i})` });
            } else if (prev.chordBearing && prev.curveRadius && prev.arcLength) {
                const prevChord = parseBearingToRadians(prev.chordBearing);
                if (prevChord !== null) {
                    const prevDelta = (prev.arcLength / prev.curveRadius) * (prev.curveDirection === 'left' ? -1 : 1);
                    const tan = prevChord + prevDelta / 2;
                    candidates.push({ tanRad: tan, chordRad: tan + delta / 2, label: `entry tangent (tangent to prior curve)` });
                }
            }
        }

        // (c) Exit tangent = NEXT leg's bearing.
        //     For the LAST call, "next leg" is the first call leaving POB
        //     (because the polygon continues from POB along that direction).
        //     tangent_out = chord + Δ/2  →  chord = tangent_out - Δ/2
        const nextIdx = (i + 1) % working.length;
        const nextCall = working[nextIdx];
        let exitTan: number | null = null;
        let exitLabel = '';
        if (nextCall && !nextCall.isCurve) {
            const nextBrg = parseBearingToRadians(nextCall.bearing);
            if (nextBrg !== null) {
                exitTan = nextBrg;
                exitLabel = i === working.length - 1
                    ? `exit tangent (tangent to first leg leaving POB)`
                    : `exit tangent (tangent to leg ${i + 2})`;
            }
        } else if (nextCall?.chordBearing && nextCall.curveRadius && nextCall.arcLength) {
            const nextChord = parseBearingToRadians(nextCall.chordBearing);
            if (nextChord !== null) {
                const nDelta = (nextCall.arcLength / nextCall.curveRadius) * (nextCall.curveDirection === 'left' ? -1 : 1);
                exitTan = nextChord - nDelta / 2;
                exitLabel = `exit tangent (tangent to next curve)`;
            }
        }
        if (exitTan !== null) {
            candidates.push({ tanRad: exitTan, chordRad: exitTan - delta / 2, label: exitLabel });
        }

        if (candidates.length === 0) continue;

        // ── Score each candidate by chord-endpoint distance to expected target ──
        // Expected target = curve.to's existing coordinate IF known, else POB.
        const curveStart = computeCurveStart(i);
        if (!curveStart) continue;
        const pobPt = resolvePobPoint(working[0]?.from, pointMap);
        const isLast = i === working.length - 1;
        // Prefer the explicit endpoint coordinate when we have it; otherwise
        // assume the curve is meant to close back to POB (the surveyor reading).
        const targetPt = pointMap.get(c.to) ?? (isLast ? pobPt : undefined);

        let best: { cand: typeof candidates[0]; endpoint: { northing: number; easting: number }; score: number } | null = null;
        for (const cand of candidates) {
            const endpoint = direct(
                { northing: curveStart.northing, easting: curveStart.easting, pointNumber: '', elevation: 0, description: '' } as SurveyPoint,
                cand.chordRad,
                chordDist,
            );
            const score = targetPt
                ? Math.hypot(endpoint.northing - targetPt.northing, endpoint.easting - targetPt.easting)
                : 0;  // no target → first candidate wins by default
            if (!best || score < best.score) best = { cand, endpoint, score };
            if (!targetPt) break;
        }
        if (!best) continue;

        const chordBrg = formatBearing(best.cand.chordRad);
        const tangentBrg = formatBearing(best.cand.tanRad);

        // If the chord endpoint lands within a tight tolerance of POB AND this
        // is the last call, rewrite curve.to to POB so the polygon is truly
        // closed downstream (same logic as Pass 0's curve-closes-polygon case).
        const closeToPob = isLast && pobPt && Math.hypot(best.endpoint.northing - pobPt.northing, best.endpoint.easting - pobPt.easting) < Math.max(0.5, chordDist * 0.02);
        const finalTo = closeToPob ? working[0].from : c.to;

        working[i] = {
            ...c,
            to: finalTo,
            tangentBearing: tangentBrg,
            chordBearing: chordBrg,
            chordDistance: chordDist,
            bearing: chordBrg,
            distance: chordDist.toFixed(2),
        };
        const closeNote = closeToPob ? ` Closes back to POB ${finalTo}.` : (targetPt ? ` Endpoint within ${best.score.toFixed(2)}' of target.` : '');
        applied.push(
            `Curve ${c.from}→${finalTo}: chord ${chordBrg}, ${chordDist.toFixed(2)}' (Δ=${(Math.abs(delta) * 180 / Math.PI).toFixed(4)}°) via ${best.cand.label}.${closeNote}`,
        );
    }

    // ── Pass 2+: iterative close + single-unknown solve ──────────────────────
    // Safety cap — each successful fix should make at least one ambiguity
    // disappear, so 5 iterations is far more than enough in practice.
    for (let iter = 0; iter < 5; iter++) {
        let progressed = false;

        const closing = tryCloseTraverse(working, pointMap);
        if (closing) {
            working = closing.calls;
            applied.push(closing.summary);
            progressed = true;
        }

        const solved = solveSingleMissing(working, pointMap);
        if (solved.ok) {
            working = solved.patchedCalls;
            applied.push(solved.summary);
            progressed = true;
        }

        if (!progressed) break;
    }

    return {
        finalCalls: working,
        appliedFixes: applied,
        changed: applied.length > 0,
    };
}
