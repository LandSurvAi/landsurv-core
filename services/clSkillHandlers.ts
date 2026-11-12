// Centerline / Baseline CACP skill handler.
// Wires the `cl_create_from_description` interAgentComm command declared in
// services/clSkillSchemas.ts. Pure-geometry: computes PI coordinates from a
// legs description and upserts a Centerline into session state.
//
// Usage in App.tsx:
//   useClSkills({ setCenterlines, logActionToFieldbook });

import { useEffect } from 'react';
import { interAgentComm, type AgentMessage, type AgentResponse } from './InterAgentCommunication';
import { AgentType } from '../types';
import type { Centerline, CenterlinePI, PointList, SurveyLine } from '../types';
import { parseAzimuthFlexible, RAD_PER_DEG } from '../utils/cogoLib';
import { formatStation, resolveBeginStation } from '../utils/stationing';
import { generateParallelOffsetLinesForCenterline } from './roadingSkillHandlers';
import {
  createCenterlineOffsetAssociation,
  tagCenterlineOffsetLines,
} from './parametricAssociations';

export interface UseClSkillsOpts {
  setCenterlines: React.Dispatch<React.SetStateAction<Centerline[]>>;
  /** Canvas linework — receives the offset polylines drawn by `cl_draw_offsets`. */
  setLines: React.Dispatch<React.SetStateAction<SurveyLine[]>>;
  /** Live alignments — resolves the baseline named by `cl_draw_offsets`. */
  centerlinesRef?: React.RefObject<Centerline[]>;
  /** Live point database — resolves the first point's description when the caller omits it. */
  pointListsRef?: React.RefObject<PointList[]>;
  logActionToFieldbook: (msg: string) => void;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface TangentLeg {
  type: 'tangent';
  bearing?: string;
  distance: number;
  unit?: string;
}

interface CurveLeg {
  type: 'curve';
  direction: 'left' | 'right';
  radius: number;
  /** Decimal degrees or a DMS string copied from the user's description. */
  delta: number | string;
  unit?: string;
}

type CLLeg = TangentLeg | CurveLeg;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function respond(
  msg: AgentMessage,
  success: boolean,
  data?: Record<string, unknown>,
  error?: string,
): AgentResponse {
  return {
    requestId: msg.id,
    from: AgentType.CENTERLINE_STATIONING,
    success,
    data,
    error,
    timestamp: Date.now(),
  };
}

/** Convert a distance value to US survey feet. */
function toFeet(value: number, unit?: string): number {
  const u = (unit ?? 'ft').toLowerCase().trim();
  const factors: Record<string, number> = {
    ft: 1,
    feet: 1,
    foot: 1,
    m: 3.28083333333,       // US survey metre → feet
    meter: 3.28083333333,
    meters: 3.28083333333,
    mi: 5280,
    mile: 5280,
    miles: 5280,
    ch: 66,                  // Gunter's chain
    chain: 66,
    chains: 66,
    lk: 0.66,                // link
    link: 0.66,
    links: 0.66,
  };
  return value * (factors[u] ?? 1);
}

/** Normalise an azimuth in radians to [0, 2π). */
function normAz(az: number): number {
  const TWO_PI = 2 * Math.PI;
  return ((az % TWO_PI) + TWO_PI) % TWO_PI;
}

/**
 * Parse a curve deflection angle from a decimal number or a DMS / decimal
 * string. Models sometimes copy the surveyor's "45°00'00\"" straight into
 * the payload even though the schema asks for decimal degrees.
 */
function parseDeltaDegrees(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  // Parse decimal degrees or DMS without normalising: a 450° input is still
  // invalid, not the equivalent 90° curve.
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/(\d)\s*[DMS]/g, '$1 ')
    .replace(/[°"″′'“”‘’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = normalized.split(' ').filter(Boolean).map(parseFloat);
  if (parts.length === 0 || parts.length > 3 || parts.some(part => !Number.isFinite(part))) {
    return null;
  }
  const degrees = parts[0] + (parts[1] ?? 0) / 60 + (parts[2] ?? 0) / 3600;
  return Number.isFinite(degrees) ? degrees : null;
}

function formatAngleInput(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}°`;
  return '(missing or non-numeric)';
}

/**
 * A failed CACP action should ask for the one value it needs instead of
 * dead-ending the conversation. The host turns this payload into a normal
 * chat question so the agent can collect the answer and retry.
 */
function askForInput(
  field: string,
  question: string,
  hint: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { needsInput: { field, question, hint, ...extra } };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Registers the `cl_create_from_description` CACP skill handler.
 * Computes PI coordinates from a legs description (tangents + circular curves)
 * and upserts the resulting Centerline into the session.
 */
export function useClSkills({ setCenterlines, setLines, centerlinesRef, pointListsRef, logActionToFieldbook }: UseClSkillsOpts): void {
  useEffect(() => {
    const unsubCreate = interAgentComm.onCommand(
      'cl_create_from_description',
      async (message): Promise<AgentResponse> => {
        const d = (message.data ?? {}) as Record<string, unknown>;

        // --- Required inputs ---
        const startN = typeof d.startNorthing === 'number' ? d.startNorthing : null;
        const startE = typeof d.startEasting === 'number' ? d.startEasting : null;
        if (startN === null || startE === null) {
          return respond(
            message,
            false,
            askForInput(
              'start',
              'Where should this alignment begin?',
              'Give me the point of beginning as a northing and easting (or the point number I should use).',
            ),
            'startNorthing and startEasting are required.',
          );
        }

        const legsRaw = d.legs;
        if (!Array.isArray(legsRaw) || legsRaw.length === 0) {
          return respond(
            message,
            false,
            askForInput(
              'legs',
              'What tangents and curves define this alignment?',
              'Describe each straight run with a bearing and distance, and each curve with a direction, radius, and delta angle.',
            ),
            'legs array is required and must not be empty.',
          );
        }
        const legs = legsRaw as CLLeg[];

        const name =
          typeof d.name === 'string' && d.name.trim() ? d.name.trim() : 'Baseline-1';
        const beginStation = typeof d.beginStation === 'number' ? d.beginStation : 0;

        // --- Walk legs and build PI list ---
        let curN = startN;
        let curE = startE;
        let curAzRad: number | null = null;

        const pis: CenterlinePI[] = [];
        pis.push({
          id: 'pi-0',
          pointNumber: 'POB',
          northing: curN,
          easting: curE,
        });

        for (let legIdx = 0; legIdx < legs.length; legIdx++) {
          const leg = legs[legIdx];
          const legLabel = `Leg ${legIdx + 1}`;

          if (leg.type === 'tangent') {
            // Resolve bearing — required on first tangent, optional thereafter
            if (leg.bearing) {
              const az = parseAzimuthFlexible(leg.bearing);
              if (az === null) {
                return respond(
                  message,
                  false,
                  askForInput(
                    'bearing',
                    `What bearing should ${legLabel} use?`,
                    `Use quadrant form such as N 45°00'00" E, a decimal azimuth, or a compass direction.`,
                    { legIndex: legIdx + 1, legLabel },
                  ),
                  `${legLabel}: could not parse bearing "${leg.bearing}". Use quadrant form (e.g. N 45°00'00" E) or decimal degrees.`,
                );
              }
              curAzRad = az;
            }
            if (curAzRad === null) {
              return respond(
                message,
                false,
                askForInput(
                  'bearing',
                  `What bearing starts ${legLabel}?`,
                  'The first straight run needs a bearing; later runs can inherit it.',
                  { legIndex: legIdx + 1, legLabel },
                ),
                `${legLabel}: no bearing established. The first tangent leg must include a bearing.`,
              );
            }

            const dist = toFeet(leg.distance, leg.unit);
            if (!Number.isFinite(dist) || dist <= 0) {
              return respond(
                message,
                false,
                askForInput(
                  'distance',
                  `How long is ${legLabel}?`,
                  'Enter a positive distance with a unit such as ft, m, mi, ch, or lk.',
                  { legIndex: legIdx + 1, legLabel },
                ),
                `${legLabel}: distance must be a positive number (got ${leg.distance} ${leg.unit ?? 'ft'}).`,
              );
            }

            // Advance current position along the current azimuth
            curN += dist * Math.cos(curAzRad);
            curE += dist * Math.sin(curAzRad);

          } else if (leg.type === 'curve') {
            if (curAzRad === null) {
              return respond(
                message,
                false,
                askForInput(
                  'bearing',
                  `What bearing leads into ${legLabel}?`,
                  'A curve needs the bearing of the straight run before it.',
                  { legIndex: legIdx + 1, legLabel },
                ),
                `${legLabel}: cannot place a curve without a prior tangent bearing.`,
              );
            }

            const R = toFeet(leg.radius, leg.unit);
            if (!Number.isFinite(R) || R <= 0) {
              return respond(
                message,
                false,
                askForInput(
                  'radius',
                  `What radius should ${legLabel} use?`,
                  'Enter a positive radius with a unit such as ft or m.',
                  { legIndex: legIdx + 1, legLabel },
                ),
                `${legLabel}: radius must be a positive number (got ${leg.radius} ${leg.unit ?? 'ft'}).`,
              );
            }

            const deltaDegrees = parseDeltaDegrees(leg.delta);
            if (deltaDegrees === null || deltaDegrees <= 0 || deltaDegrees >= 180) {
              return respond(
                message,
                false,
                askForInput(
                  'delta',
                  `What deflection angle should ${legLabel} use?`,
                  'Enter an angle between 0° and 180° (exclusive). Decimal degrees and DMS are both accepted.',
                  { legIndex: legIdx + 1, legLabel, received: leg.delta },
                ),
                `${legLabel}: delta must be between 0 and 180 degrees exclusive (got ${formatAngleInput(leg.delta)}).`,
              );
            }
            const deltaRad = deltaDegrees * RAD_PER_DEG;

            // T = tangent length from PC to PI (and from PI to PT)
            const T = R * Math.tan(deltaRad / 2);

            // Direction: right = clockwise deflection (+), left = counter-clockwise (-)
            const sign = leg.direction === 'right' ? 1 : -1;
            const newAzRad = normAz(curAzRad + sign * deltaRad);

            // Current position (curN, curE) is the PC.
            // PI is T beyond the PC along the incoming bearing.
            const piN = curN + T * Math.cos(curAzRad);
            const piE = curE + T * Math.sin(curAzRad);

            pis.push({
              id: `pi-${pis.length}`,
              pointNumber: `PI-${pis.length}`,
              northing: piN,
              easting: piE,
              curveRadius: R,
            });

            // PT is T beyond the PI along the outgoing bearing.
            curN = piN + T * Math.cos(newAzRad);
            curE = piE + T * Math.sin(newAzRad);
            curAzRad = newAzRad;

          } else {
            return respond(
              message,
              false,
              askForInput(
                'type',
                `Is ${legLabel} a tangent or a curve?`,
                'Choose the leg type so I can recompute the alignment.',
                { legIndex: legIdx + 1, legLabel, options: ['Tangent', 'Curve'] },
              ),
              `${legLabel}: unknown type "${(leg as { type?: unknown }).type ?? '?'}". Must be "tangent" or "curve".`,
            );
          }
        }

        // Final endpoint (end of last tangent or PT of last curve)
        pis.push({
          id: `pi-${pis.length}`,
          pointNumber: 'END',
          northing: curN,
          easting: curE,
        });

        // --- Assemble Centerline ---
        const cl: Centerline = {
          id: `cl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name,
          beginStation,
          pis,
        };

        // Upsert: replace same-name CL if present, otherwise drop any empty
        // placeholder centerlines (e.g. the blank "CL-1" inserted by
        // handleCenterlineSessionStart) and append. This keeps `centerlines`
        // collapsed to a single usable alignment so peer skills that grab
        // `centerlines[0]` never see a stale empty placeholder.
        setCenterlines(prev => {
          const existingIdx = prev.findIndex(c => c.name === name);
          if (existingIdx >= 0) {
            const next = [...prev];
            next[existingIdx] = cl;
            return next.filter(c => c.id === cl.id || (c.pis?.length ?? 0) >= 2);
          }
          const cleaned = prev.filter(c => (c.pis?.length ?? 0) >= 2);
          return [...cleaned, cl];
        });

        // Approximate total chord length for the response summary
        let totalChordLength = 0;
        for (let i = 0; i < pis.length - 1; i++) {
          const a = pis[i];
          const b = pis[i + 1];
          totalChordLength += Math.hypot(b.northing - a.northing, b.easting - a.easting);
        }
        totalChordLength = Math.round(totalChordLength * 100) / 100;

        const curveCount = pis.filter(p => p.curveRadius !== undefined).length;
        logActionToFieldbook(
          `CL/Baseline created: "${name}" — ${pis.length} PIs (${curveCount} curve${curveCount === 1 ? '' : 's'}), ` +
          `POB (${startN.toFixed(2)}, ${startE.toFixed(2)}), ≈${totalChordLength.toFixed(0)} ft chord length.`,
        );

        return respond(message, true, {
          centerline: cl as unknown as Record<string, unknown>,
          piCount: pis.length,
          totalChordLength,
        });
      },
    );

    // -----------------------------------------------------------------------
    // cl_create_from_points — build a straight-tangent chain from project points
    // -----------------------------------------------------------------------
    const unsubFromPoints = interAgentComm.onCommand(
      'cl_create_from_points',
      async (message): Promise<AgentResponse> => {
        const d = (message.data ?? {}) as Record<string, unknown>;

        const pointsRaw = d.points;
        if (!Array.isArray(pointsRaw) || pointsRaw.length < 2) {
          return respond(message, false, undefined, 'points array is required and must contain at least 2 points.');
        }

        interface PointEntry {
          pointNumber: string | number;
          northing: number;
          easting: number;
          elevation?: number;
          description?: string;
        }

        const pts = pointsRaw as PointEntry[];

        // Validate entries
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          if (typeof p.northing !== 'number' || !Number.isFinite(p.northing) ||
              typeof p.easting  !== 'number' || !Number.isFinite(p.easting)) {
            return respond(
              message,
              false,
              undefined,
              `points[${i}]: northing and easting must be finite numbers (got northing=${p.northing}, easting=${p.easting}).`,
            );
          }
        }

        const name =
          typeof d.name === 'string' && d.name.trim() ? d.name.trim() : 'Baseline-1';

        // The first chain point is the POB. Prefer its explicit description, then
        // look the point up in the live database so a model that only sent
        // coordinates still picks up a station written on the point itself.
        const firstPointNumber = String(pts[0].pointNumber);
        const projectFirstPoint = pointListsRef?.current
          ?.flatMap((list) => list.points)
          .find((point) => String(point.pointNumber) === firstPointNumber);
        const firstPointDescription = pts[0].description?.trim() || projectFirstPoint?.description;
        const beginStation = resolveBeginStation(d.beginStation, firstPointDescription);

        // Build PIs — first point is POB, last is END, intermediate are PI-n
        const pis: CenterlinePI[] = pts.map((p, i) => {
          let pointNumber: string;
          if (i === 0) pointNumber = 'POB';
          else if (i === pts.length - 1) pointNumber = 'END';
          else pointNumber = `PI-${i}`;

          return {
            id: `pi-${i}`,
            pointNumber,
            northing: p.northing,
            easting: p.easting,
          };
        });

        const cl: Centerline = {
          id: `cl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name,
          beginStation,
          pis,
        };

        // Upsert: same-name CL replaces existing; otherwise drop empty placeholders
        setCenterlines(prev => {
          const existingIdx = prev.findIndex(c => c.name === name);
          if (existingIdx >= 0) {
            const next = [...prev];
            next[existingIdx] = cl;
            return next.filter(c => c.id === cl.id || (c.pis?.length ?? 0) >= 2);
          }
          const cleaned = prev.filter(c => (c.pis?.length ?? 0) >= 2);
          return [...cleaned, cl];
        });

        let totalChordLength = 0;
        for (let i = 0; i < pis.length - 1; i++) {
          const a = pis[i];
          const b = pis[i + 1];
          totalChordLength += Math.hypot(b.northing - a.northing, b.easting - a.easting);
        }
        totalChordLength = Math.round(totalChordLength * 100) / 100;

        logActionToFieldbook(
          `CL/Baseline created from points: "${name}" — ${pis.length} PIs, ` +
          `POB (${pts[0].northing.toFixed(2)}, ${pts[0].easting.toFixed(2)}) at STA ${formatStation(beginStation)}, ` +
          `≈${totalChordLength.toFixed(0)} ft chord length.`,
        );

        return respond(message, true, {
          centerline: cl as unknown as Record<string, unknown>,
          piCount: pis.length,
          totalChordLength,
        });
      },
    );

    // -----------------------------------------------------------------------
    // cl_draw_offsets — draw parallel linework along the loaded alignment.
    // This is the host action behind "draw a road along the baseline": the
    // model names the offsets, the host builds continuous polylines. Stationing
    // parameters are intentionally NOT used here — they only stake points.
    // -----------------------------------------------------------------------
    const unsubDrawOffsets = interAgentComm.onCommand(
      'cl_draw_offsets',
      async (message): Promise<AgentResponse> => {
        const d = (message.data ?? {}) as Record<string, unknown>;
        const centerlines = centerlinesRef?.current ?? [];
        const requested =
          typeof d.centerlineId === 'string' && d.centerlineId.trim()
            ? d.centerlineId.trim()
            : typeof d.centerlineName === 'string' && d.centerlineName.trim()
              ? d.centerlineName.trim()
              : '';
        let cl = requested
          ? centerlines.find(
              c => c.id === requested || c.name.trim().toLowerCase() === requested.toLowerCase(),
            )
          : undefined;
        if (!cl) {
          cl = centerlines.find(c => (c.pis?.length ?? 0) >= 2);
        }
        if (!cl || (cl.pis?.length ?? 0) < 2) {
          return respond(
            message,
            false,
            undefined,
            'No usable baseline/centerline is loaded. Load or create an alignment first, then ask me to draw along it.',
          );
        }

        const rawOffsets = Array.isArray(d.offsets)
          ? (d.offsets as unknown[])
          : Array.isArray(d.offset)
            ? (d.offset as unknown[])
            : typeof d.offset === 'number'
              ? [d.offset]
              : [];
        let offsets = rawOffsets
          .map(value => (typeof value === 'string' ? Number(value) : value))
          .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
          .map(value => Math.round(value * 1000) / 1000)
          .filter(value => Math.abs(value) > 1e-6 && Math.abs(value) <= 5000);
        offsets = Array.from(new Set(offsets)).slice(0, 24);

        if (offsets.length === 0) {
          const widthFt =
            typeof d.widthFt === 'number' && Number.isFinite(d.widthFt) && d.widthFt > 0
              ? d.widthFt
              : 24;
          const half = Math.round((widthFt / 2) * 1000) / 1000;
          offsets = [-half, half];
        }

        const layer =
          typeof d.layer === 'string' && d.layer.trim() ? d.layer.trim() : 'L-ROAD';
        const lineType =
          typeof d.lineType === 'string' && d.lineType.trim() ? d.lineType.trim() : 'CONTINUOUS';
        const prefix =
          typeof d.polylinePrefix === 'string' && d.polylinePrefix.trim()
            ? d.polylinePrefix.trim()
            : 'cl-offset';

        const parametric = d.parametric !== false;
        const associationIds: string[] = [];
        const newLines = offsets.flatMap(offset => {
          const polylinePrefix = `${prefix}-${offset >= 0 ? 'rt' : 'lt'}`;
          const generated = generateParallelOffsetLinesForCenterline(
            cl!,
            offset,
            layer,
            lineType,
            polylinePrefix,
          );
          if (!parametric) return generated;
          const association = createCenterlineOffsetAssociation(
            cl!,
            offset,
            layer,
            lineType,
            polylinePrefix,
            {
              ownerKind: 'manual',
              label: `${Math.abs(offset)}' ${offset >= 0 ? 'RT' : 'LT'} of ${cl!.name}`,
            },
          );
          associationIds.push(association.id);
          return tagCenterlineOffsetLines(generated, association);
        });

        if (newLines.length === 0) {
          return respond(
            message,
            false,
            undefined,
            `Could not draw offsets along "${cl.name}" — the alignment has no usable length.`,
          );
        }

        setLines(prev => [...prev, ...newLines]);
        logActionToFieldbook(
          `Drew ${newLines.length} offset segment(s) along baseline "${cl.name}" at ${offsets
            .map(offset => `${Math.abs(offset)}' ${offset >= 0 ? 'RT' : 'LT'}`)
            .join(', ')} on layer ${layer}.`,
        );

        return respond(message, true, {
          centerlineId: cl.id,
          centerlineName: cl.name,
          offsets,
          addedLines: newLines.length,
          layer,
          parametric,
          associationIds,
        });
      },
    );

    return () => { unsubCreate(); unsubFromPoints(); unsubDrawOffsets(); };
  }, [setCenterlines, setLines, centerlinesRef, pointListsRef, logActionToFieldbook]);
}
