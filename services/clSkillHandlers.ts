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
import type { Centerline, CenterlinePI } from '../types';
import { parseAzimuthFlexible, RAD_PER_DEG } from '../utils/cogoLib';

export interface UseClSkillsOpts {
  setCenterlines: React.Dispatch<React.SetStateAction<Centerline[]>>;
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
  delta: number;
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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Registers the `cl_create_from_description` CACP skill handler.
 * Computes PI coordinates from a legs description (tangents + circular curves)
 * and upserts the resulting Centerline into the session.
 */
export function useClSkills({ setCenterlines, logActionToFieldbook }: UseClSkillsOpts): void {
  useEffect(() => {
    const unsubCreate = interAgentComm.onCommand(
      'cl_create_from_description',
      async (message): Promise<AgentResponse> => {
        const d = (message.data ?? {}) as Record<string, unknown>;

        // --- Required inputs ---
        const startN = typeof d.startNorthing === 'number' ? d.startNorthing : null;
        const startE = typeof d.startEasting === 'number' ? d.startEasting : null;
        if (startN === null || startE === null) {
          return respond(message, false, undefined, 'startNorthing and startEasting are required.');
        }

        const legsRaw = d.legs;
        if (!Array.isArray(legsRaw) || legsRaw.length === 0) {
          return respond(message, false, undefined, 'legs array is required and must not be empty.');
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
                  undefined,
                  `${legLabel}: could not parse bearing "${leg.bearing}". Use quadrant form (e.g. "N 45°00'00" E") or decimal degrees.`,
                );
              }
              curAzRad = az;
            }
            if (curAzRad === null) {
              return respond(
                message,
                false,
                undefined,
                `${legLabel}: no bearing established. The first tangent leg must include a bearing.`,
              );
            }

            const dist = toFeet(leg.distance, leg.unit);
            if (!Number.isFinite(dist) || dist <= 0) {
              return respond(
                message,
                false,
                undefined,
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
                undefined,
                `${legLabel}: cannot place a curve without a prior tangent bearing.`,
              );
            }

            const R = toFeet(leg.radius, leg.unit);
            if (!Number.isFinite(R) || R <= 0) {
              return respond(
                message,
                false,
                undefined,
                `${legLabel}: radius must be a positive number (got ${leg.radius} ${leg.unit ?? 'ft'}).`,
              );
            }

            const deltaRad = leg.delta * RAD_PER_DEG;
            if (!Number.isFinite(deltaRad) || deltaRad <= 0 || deltaRad >= Math.PI) {
              return respond(
                message,
                false,
                undefined,
                `${legLabel}: delta must be between 0 and 180 degrees exclusive (got ${leg.delta}°).`,
              );
            }

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
              undefined,
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
        const beginStation = typeof d.beginStation === 'number' ? d.beginStation : 0;

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
          `POB (${pts[0].northing.toFixed(2)}, ${pts[0].easting.toFixed(2)}), ≈${totalChordLength.toFixed(0)} ft chord length.`,
        );

        return respond(message, true, {
          centerline: cl as unknown as Record<string, unknown>,
          piCount: pis.length,
          totalChordLength,
        });
      },
    );

    return () => { unsubCreate(); unsubFromPoints(); };
  }, [setCenterlines, logActionToFieldbook]);
}
