// legalWriter.ts
// Builds a metes-and-bounds description from a BoundaryFile.
// Output mimics conventional deed phrasing surveyors expect.

import type { BoundaryFile, BoundaryFileCall, SurveyPoint, LegalWriterStylePrefs } from '../types.ts';
import { parseBearingToRadians, parseDistance, calculateChordDistance, formatBearing } from './cogo.ts';

interface WriteOpts {
    /** Project / parcel name shown in the heading. */
    name?: string;
    /** Acres for the closing sentence. Pass null/undefined to omit. */
    areaAcres?: number | null;
    /** Display label for the POB (e.g. "an iron pin set"). */
    pobDescription?: string;
    /** User-controlled formatting preferences. */
    stylePrefs?: LegalWriterStylePrefs;
}

function bearingProse(b: string): string {
    // Normalize "N 37 46 00 E" or "N37°46'00\"E" to "N 37°46'00" E" presentation.
    const cleaned = b
        .replace(/["'°]/g, ' ')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, ' ');
    const parts = cleaned.split(' ');
    if (parts.length >= 5) {
        const [ns, d, m, s, ew] = parts;
        return `${ns} ${parseFloat(d).toFixed(0)}°${parseFloat(m).toFixed(0).padStart(2, '0')}'${parseFloat(s).toFixed(0).padStart(2, '0')}" ${ew}`;
    }
    return b;
}

function legForLine(call: BoundaryFileCall, pointMap: Map<string, SurveyPoint>): string {
    const toPt = pointMap.get(call.to);
    const toDesc = toPt?.description?.trim() || 'a point';
    if (call.isCurve) {
        const radius = call.curveRadius;
        const arc = call.arcLength;
        const dir: 'left' | 'right' = call.curveDirection ?? 'right';
        const chordBrg = call.chordBearing || call.bearing;
        let chordDist = call.chordDistance;
        if ((!chordDist || chordDist <= 0) && radius && arc) {
            const delta = (arc / radius) * (dir === 'left' ? -1 : 1);
            chordDist = calculateChordDistance(radius, delta);
        }
        const dirWord = dir === 'left' ? 'to the LEFT (counterclockwise)' : 'to the RIGHT (clockwise)';
        const parts = [
            `THENCE along a curve ${dirWord}`,
            radius ? `having a radius of ${radius.toFixed(2)} feet` : null,
            arc ? `an arc length of ${arc.toFixed(2)} feet` : null,
            chordBrg && chordDist ? `and a chord bearing and distance of ${bearingProse(chordBrg)}, ${chordDist.toFixed(2)} feet` : null,
        ].filter(Boolean).join(', ');
        return `${parts} to ${toDesc} (point #${call.to});`;
    }
    const brRad = parseBearingToRadians(call.bearing);
    const dist = parseDistance(call.distance);
    if (brRad === null || dist === null) {
        return `THENCE [INCOMPLETE: ${call.bearing} ${call.distance}] to point #${call.to};`;
    }
    return `THENCE ${bearingProse(formatBearing(brRad))} a distance of ${dist.toFixed(2)} feet to ${toDesc} (point #${call.to});`;
}

export function writeLegalDescription(
    file: BoundaryFile,
    pointMap: Map<string, SurveyPoint>,
    opts: WriteOpts = {},
): string {
    if (file.calls.length === 0) return '';
    const name = opts.name || file.name || 'Subject Tract';
    const prefs: LegalWriterStylePrefs = {
        includeHeading: true,
        includeAcreage: true,
        includePobCoords: true,
        preset: 'default',
        ...(opts.stylePrefs || {}),
    };
    const pobNum = file.calls[0].from;
    const pobPt = pointMap.get(pobNum);
    const pobDesc = opts.pobDescription || pobPt?.description?.trim() || 'an iron pin';

    const heading = prefs.includeHeading
        ? [
            `LEGAL DESCRIPTION — ${name.toUpperCase()}`,
            `Generated ${new Date().toLocaleString()}`,
            ''.padEnd(60, '-'),
            '',
        ].join('\n')
        : '';

    const showCoords = prefs.includePobCoords !== false;
    const pobSentence = showCoords && pobPt && Number.isFinite(pobPt.northing) && Number.isFinite(pobPt.easting)
        ? `BEGINNING at ${pobDesc} (point #${pobNum}) having coordinates N ${pobPt.northing.toFixed(2)}, E ${pobPt.easting.toFixed(2)};`
        : `BEGINNING at ${pobDesc} (point #${pobNum});`;

    const legs = file.calls.map(c => legForLine(c, pointMap));

    // Final sentence: detect closed loop (last call returns to POB)
    const closed = file.calls[file.calls.length - 1]?.to === pobNum;
    const closing = closed
        ? `the said point being the POINT OF BEGINNING.`
        : `the terminus of this description.`;

    const acreLine = (prefs.includeAcreage !== false) && opts.areaAcres != null && isFinite(opts.areaAcres)
        ? `\nSAID TRACT CONTAINING ${opts.areaAcres.toFixed(3)} acres, more or less.`
        : '';

    // Optional preset / notes prelude — surveyors can use the "notes" to add an
    // intro paragraph (e.g. tax parcel reference, deed book volume).
    const presetIntro: string = (() => {
        switch (prefs.preset) {
            case 'pa-conventional':
                return 'ALL THAT CERTAIN tract or parcel of land situate in the Commonwealth of Pennsylvania, bounded and described as follows:\n\n';
            case 'tx-conventional':
                return 'BEING a tract of land in the State of Texas, more particularly described by metes and bounds as follows:\n\n';
            case 'concise':
                return '';
            case 'default':
            default:
                return 'ALL THAT CERTAIN tract or parcel of land bounded and described as follows:\n\n';
        }
    })();

    const notesBlock = prefs.notes && prefs.notes.trim()
        ? `\n\n--- Surveyor's notes ---\n${prefs.notes.trim()}\n`
        : '';

    // Join: legs as paragraphs; replace last "; " with " " + closing.
    const body = legs.join('\n');
    const withClosing = closed
        ? body.replace(/;\s*$/, `, ${closing}`)
        : `${body}\n${closing}`;

    return [heading, presetIntro + pobSentence, '', withClosing, acreLine, notesBlock]
        .filter(s => s !== '')
        .join('\n');
}
