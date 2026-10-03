// Stationing Agent CACP skill handlers.
// Wires `place_station_offset_point` and `generate_stationed_points` into
// interAgentComm so any peer agent (Point Editor, COGO, etc.) can invoke them.
//
// Both skills were declared in AgentRegistry.ts (CENTERLINE_STATIONING) but
// previously had no handler, causing "No handler responded" errors when Point
// Editor delegated road-offset calculations.
//
// Usage in App.tsx:
//   useStationingSkills({ centerlinesRef, pointListsRef, setPointLists, logActionToFieldbook });

import { useEffect } from 'react';
import { interAgentComm, type AgentMessage, type AgentResponse } from './InterAgentCommunication';
import { AgentType } from '../types';
import type { Centerline, PointList, SurveyPoint } from '../types';
import {
  calculatePointFromStationOffset,
  calculateCenterlineLength,
  formatStation,
  parseStation,
} from '../utils/stationing';

export interface UseStationingSkillsOpts {
  centerlinesRef: React.MutableRefObject<Centerline[]>;
  pointListsRef: React.MutableRefObject<PointList[]>;
  setPointLists: React.Dispatch<React.SetStateAction<PointList[]>>;
  logActionToFieldbook: (msg: string) => void;
}

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

/** Resolve a station value that may be a formatted string ("10+50"), a number,
 *  or the magic string "end" (returns the alignment end station). */
function resolveStation(
  value: unknown,
  alignmentEnd: number,
): number | null {
  if (value === 'end' || value === null || value === undefined) return alignmentEnd;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseStation(value);
    if (parsed !== null) return parsed;
    // Try bare number string
    const n = parseFloat(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Request N consecutive point numbers from the Point Editor agent. */
async function requestPointNumbers(count: number): Promise<string[] | null> {
  try {
    const peer = await interAgentComm.askPeer(
      AgentType.POINT_EDITOR,
      'request_next_point_number',
      { count },
      { timeoutMs: 5000 },
    );
    if (
      peer?.success &&
      peer.data &&
      Array.isArray((peer.data as { numbers?: unknown[] }).numbers)
    ) {
      return (peer.data as { numbers: string[] }).numbers;
    }
  } catch {
    // fall through to null — caller will handle error
  }
  return null;
}

/** Pick the centerline a peer agent wants to work on.
 *  - If `name` matches (case-insensitive), use that.
 *  - Otherwise pick the first centerline with at least 2 PIs *and* non-zero
 *    geometric length. This avoids grabbing an empty/placeholder entry that
 *    may sit at index 0 (the previous behaviour returned alignmentEnd=0 and
 *    silently produced no points). */
function pickCenterline(
  cls: Centerline[],
  name?: unknown,
): Centerline | null {
  if (cls.length === 0) return null;

  if (typeof name === 'string' && name.trim()) {
    const target = name.trim().toLowerCase();
    const byName = cls.find(c => c.name?.toLowerCase() === target);
    if (byName) return byName;
  }

  // Prefer the first centerline that actually has usable geometry.
  const usable = cls.find(c => (c.pis?.length ?? 0) >= 2 && calculateCenterlineLength(c) > 0);
  if (usable) return usable;

  return cls[0] ?? null;
}

/** Add points to the "working" list (or create it if absent). */
function addToWorkingList(
  newPoints: SurveyPoint[],
  setPointLists: React.Dispatch<React.SetStateAction<PointList[]>>,
): void {
  setPointLists(prev => {
    const idx = prev.findIndex(l => l.id === 'working');
    const base: PointList =
      idx !== -1
        ? prev[idx]
        : { id: 'working', name: 'Unsaved Points', points: [], isVisible: true };
    const updated = { ...base, points: [...base.points, ...newPoints] };
    if (idx !== -1) {
      const next = [...prev];
      next[idx] = updated;
      return next;
    }
    return [...prev, updated];
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Registers CACP handlers for the two CENTERLINE_STATIONING application skills:
 *   - `place_station_offset_point`  — single point at a station/offset
 *   - `generate_stationed_points`   — batch of points at regular intervals
 *
 * Both handlers use the *first* centerline in the session as the active
 * alignment (matching the existing stationingParameters UI behaviour).
 */
export function useStationingSkills({
  centerlinesRef,
  pointListsRef,
  setPointLists,
  logActionToFieldbook,
}: UseStationingSkillsOpts): void {
  useEffect(() => {
    // -----------------------------------------------------------------------
    // place_station_offset_point
    // -----------------------------------------------------------------------
    const unsubPlace = interAgentComm.onCommand(
      'place_station_offset_point',
      async (message): Promise<AgentResponse> => {
        const d = (message.data ?? {}) as Record<string, unknown>;

        const cls = centerlinesRef.current;
        if (!cls.length) {
          return respond(message, false, undefined, 'No centerline is loaded in the current session.');
        }
        const cl = pickCenterline(cls, d.centerlineName);
        if (!cl || (cl.pis?.length ?? 0) < 2) {
          console.warn('[Stationing] place_station_offset_point: no usable centerline. Available:',
            cls.map(c => ({ name: c.name, pis: c.pis?.length ?? 0 })));
          return respond(message, false, undefined,
            `No usable centerline found. Available: ${cls.map(c => `"${c.name}" (${c.pis?.length ?? 0} PIs)`).join(', ') || 'none'}.`);
        }

        const totalLength = calculateCenterlineLength(cl);
        const alignmentEnd = cl.beginStation + totalLength;

        const station = resolveStation(d.station, alignmentEnd);
        if (station === null) {
          return respond(message, false, undefined, `Cannot parse station value: "${d.station}". Use "10+50" or a number.`);
        }

        const offset = typeof d.offset === 'number' ? d.offset : 0;
        const coords = calculatePointFromStationOffset(cl, station, offset);
        if (!coords) {
          return respond(
            message,
            false,
            undefined,
            `Station ${formatStation(station)} is outside the alignment limits (${formatStation(cl.beginStation)} – ${formatStation(alignmentEnd)}).`,
          );
        }

        const pns = await requestPointNumbers(1);
        if (!pns) {
          return respond(message, false, undefined, 'Could not obtain a point number from the Point Editor agent.');
        }
        const pn = pns[0];

        const desc =
          typeof d.description === 'string' && d.description.trim()
            ? d.description.trim()
            : `STA ${formatStation(station)} OFF ${Math.abs(offset)}' ${offset >= 0 ? 'RT' : 'LT'}`;

        const newPoint: SurveyPoint = {
          pointNumber: pn,
          northing: coords.northing,
          easting: coords.easting,
          elevation: 0,
          description: desc,
        };

        addToWorkingList([newPoint], setPointLists);
        logActionToFieldbook(`Stationing placed point ${pn} at STA ${formatStation(station)} OFF ${offset}' on "${cl.name}".`);

        return respond(message, true, {
          pointNumber: pn,
          northing: coords.northing,
          easting: coords.easting,
        });
      },
    );

    // -----------------------------------------------------------------------
    // generate_stationed_points
    // -----------------------------------------------------------------------
    const unsubGenerate = interAgentComm.onCommand(
      'generate_stationed_points',
      async (message): Promise<AgentResponse> => {
        const d = (message.data ?? {}) as Record<string, unknown>;

        const cls = centerlinesRef.current;
        if (!cls.length) {
          return respond(message, false, undefined, 'No centerline is loaded in the current session.');
        }
        const cl = pickCenterline(cls, d.centerlineName);
        if (!cl || (cl.pis?.length ?? 0) < 2) {
          console.warn('[Stationing] generate_stationed_points: no usable centerline. Available:',
            cls.map(c => ({ name: c.name, pis: c.pis?.length ?? 0 })));
          return respond(message, false, undefined,
            `No usable centerline found. Available: ${cls.map(c => `"${c.name}" (${c.pis?.length ?? 0} PIs)`).join(', ') || 'none'}.`);
        }

        const totalLength = calculateCenterlineLength(cl);
        const alignmentEnd = cl.beginStation + totalLength;
        if (totalLength <= 0) {
          console.warn('[Stationing] generate_stationed_points: centerline length is 0.', { name: cl.name, pis: cl.pis });
          return respond(message, false, undefined, `Centerline "${cl.name}" has zero length — cannot generate stations.`);
        }

        const startStation = resolveStation(d.startStation, cl.beginStation);
        if (startStation === null) {
          return respond(message, false, undefined, `Cannot parse startStation: "${d.startStation}".`);
        }

        const endStation = resolveStation(d.endStation, alignmentEnd);
        if (endStation === null) {
          return respond(message, false, undefined, `Cannot parse endStation: "${d.endStation}".`);
        }

        const interval = typeof d.interval === 'number' && d.interval > 0 ? d.interval : null;
        if (interval === null) {
          return respond(message, false, undefined, 'interval must be a positive number (feet between points).');
        }

        // Normalize offset: accept a single number or an array
        const rawOffset = d.offset;
        const offsetList: number[] = Array.isArray(rawOffset)
          ? (rawOffset as unknown[]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
          : typeof rawOffset === 'number' && Number.isFinite(rawOffset)
            ? [rawOffset]
            : [0];

        const desc =
          typeof d.description === 'string' && d.description.trim()
            ? d.description.trim()
            : '';
        const prefix =
          typeof d.pointNumberPrefix === 'string' && d.pointNumberPrefix.trim()
            ? d.pointNumberPrefix.trim()
            : '';

        // Build station list
        const stationList: number[] = [];
        for (let s = startStation; s <= endStation + 0.001; s += interval) {
          stationList.push(Math.min(s, endStation));
          if (s >= endStation) break;
        }
        // Always include exact end station if not already there
        if (stationList.length === 0 || Math.abs(stationList[stationList.length - 1] - endStation) > 0.01) {
          stationList.push(endStation);
        }

        // Compute coordinates for every station × offset combination
        const entries: Array<{ station: number; offset: number; coords: { northing: number; easting: number } }> = [];
        for (const s of stationList) {
          for (const off of offsetList) {
            const coords = calculatePointFromStationOffset(cl, s, off);
            if (coords) entries.push({ station: s, offset: off, coords });
          }
        }

        if (entries.length === 0) {
          console.warn('[Stationing] generate_stationed_points: 0 entries computed.', {
            clName: cl.name, alignmentEnd, startStation, endStation, interval, offsetList,
            stationListSample: stationList.slice(0, 5), stationListLen: stationList.length,
          });
          return respond(message, false, undefined,
            `No points could be computed between STA ${formatStation(startStation)} and ${formatStation(endStation)} on "${cl.name}" (length ${totalLength.toFixed(2)}'). Check alignment limits.`);
        }

        // Request point numbers in one batch
        const pns = await requestPointNumbers(entries.length);
        if (!pns || pns.length < entries.length) {
          return respond(message, false, undefined, 'Could not obtain enough point numbers from the Point Editor agent.');
        }

        const newPoints: SurveyPoint[] = entries.map((e, i) => {
          const stationLabel = formatStation(e.station);
          const sideTag = `${Math.abs(e.offset)}' ${e.offset >= 0 ? 'RT' : 'LT'}`;
          const pointDesc = desc || `${prefix ? prefix + ' ' : ''}STA ${stationLabel} OFF ${sideTag}`;
          return {
            pointNumber: pns[i],
            northing: e.coords.northing,
            easting: e.coords.easting,
            elevation: 0,
            description: pointDesc,
          };
        });

        addToWorkingList(newPoints, setPointLists);
        logActionToFieldbook(
          `Stationing generated ${newPoints.length} point(s) on "${cl.name}" ` +
          `STA ${formatStation(startStation)}→${formatStation(endStation)} ` +
          `@${interval}' interval, offset(s): ${offsetList.join(', ')}'.`,
        );

        return respond(message, true, {
          points: newPoints as unknown as Record<string, unknown>[],
          count: newPoints.length,
        });
      },
    );

    return () => {
      unsubPlace();
      unsubGenerate();
    };
  }, [centerlinesRef, pointListsRef, setPointLists, logActionToFieldbook]);
}
