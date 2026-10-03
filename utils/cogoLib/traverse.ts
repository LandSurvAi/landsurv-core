// Traverse adjustment routines. Inputs are sequences of {bearing rad, distance}.
// Compass / Bowditch and Transit rules (Wolf & Ghilani §10).

import { Pt } from './types';

export interface TraverseLeg {
  azimuth: number;       // radians from north
  distance: number;      // project units
  fromPn?: string;
  toPn?: string;
}

export interface AdjustedLeg extends TraverseLeg {
  rawDeltaN: number;
  rawDeltaE: number;
  adjDeltaN: number;
  adjDeltaE: number;
  adjAzimuth: number;
  adjDistance: number;
}

export interface TraverseResult {
  legs: AdjustedLeg[];
  totalDistance: number;
  misclosureN: number;
  misclosureE: number;
  misclosureLinear: number;
  precision: string;
  startPoint: Pt;
  closingPoint: Pt;            // raw computed end point
  adjustedClosingPoint: Pt;    // after adjustment, equals startPoint for closed traverses
  adjustedPoints: Pt[];        // includes start
  method: 'compass' | 'transit' | 'crandall' | 'none';
}

function rawLatDep(legs: TraverseLeg[]): { lat: number; dep: number; total: number; perAxis: { lat: number[]; dep: number[] } } {
  let lat = 0, dep = 0, total = 0;
  const lats: number[] = [], deps: number[] = [];
  for (const l of legs) {
    const dN = l.distance * Math.cos(l.azimuth);
    const dE = l.distance * Math.sin(l.azimuth);
    lats.push(dN); deps.push(dE);
    lat += dN; dep += dE; total += l.distance;
  }
  return { lat, dep, total, perAxis: { lat: lats, dep: deps } };
}

/** Compute closure & adjust by selected method. closeBack: target end point (defaults to start). */
export function adjustTraverse(
  legs: TraverseLeg[],
  start: Pt,
  method: 'compass' | 'transit' | 'crandall' | 'none' = 'compass',
  closeBack?: Pt,
): TraverseResult {
  if (legs.length === 0) throw new Error('adjustTraverse: empty legs.');
  const target = closeBack ?? start;
  const { lat, dep, total, perAxis } = rawLatDep(legs);
  const errN = (target.northing - start.northing) - lat;
  const errE = (target.easting - start.easting) - dep;

  // Per-leg corrections (added to raw deltas).
  const corrN: number[] = new Array(legs.length).fill(0);
  const corrE: number[] = new Array(legs.length).fill(0);

  if (method === 'compass') {
    // Bowditch: distribute proportionally to leg distance.
    if (total > 0) {
      for (let i = 0; i < legs.length; i++) {
        corrN[i] = errN * (legs[i].distance / total);
        corrE[i] = errE * (legs[i].distance / total);
      }
    }
  } else if (method === 'transit') {
    // Transit: distribute proportionally to absolute lat (for N error) and abs dep (for E error).
    let sumAbsLat = 0, sumAbsDep = 0;
    for (let i = 0; i < legs.length; i++) { sumAbsLat += Math.abs(perAxis.lat[i]); sumAbsDep += Math.abs(perAxis.dep[i]); }
    if (sumAbsLat > 0) for (let i = 0; i < legs.length; i++) corrN[i] = errN * (Math.abs(perAxis.lat[i]) / sumAbsLat);
    if (sumAbsDep > 0) for (let i = 0; i < legs.length; i++) corrE[i] = errE * (Math.abs(perAxis.dep[i]) / sumAbsDep);
  } else if (method === 'crandall') {
    // Crandall: angles held; distances least-squares-adjusted along each leg's bearing.
    // For each leg, the correction along bearing = a·cos(az)+b·sin(az), where
    // [Σcos²  Σsin·cos][a] = [errN]
    // [Σsin·cos  Σsin²][b] = [errE]
    let sCC = 0, sSS = 0, sSC = 0;
    for (const l of legs) {
      const c = Math.cos(l.azimuth), s = Math.sin(l.azimuth);
      sCC += c * c; sSS += s * s; sSC += s * c;
    }
    const det = sCC * sSS - sSC * sSC;
    if (Math.abs(det) > 1e-12) {
      const a = (sSS * errN - sSC * errE) / det;
      const b = (sCC * errE - sSC * errN) / det;
      for (let i = 0; i < legs.length; i++) {
        const dist = legs[i].distance;
        const c = Math.cos(legs[i].azimuth), s = Math.sin(legs[i].azimuth);
        const k = a * c + b * s; // distance-adjustment per leg (proportional via direction-cosine LSQ)
        corrN[i] = k * c * dist / dist; // simplifies to k*c — but distance scaling already implicit
        corrE[i] = k * s * dist / dist;
      }
    }
  }

  const adjLegs: AdjustedLeg[] = [];
  let cursor: Pt = { northing: start.northing, easting: start.easting };
  const adjustedPoints: Pt[] = [{ ...cursor }];
  for (let i = 0; i < legs.length; i++) {
    const dN = perAxis.lat[i] + corrN[i];
    const dE = perAxis.dep[i] + corrE[i];
    const adjAz = Math.atan2(dE, dN);
    const adjDist = Math.hypot(dN, dE);
    adjLegs.push({
      ...legs[i],
      rawDeltaN: perAxis.lat[i],
      rawDeltaE: perAxis.dep[i],
      adjDeltaN: dN,
      adjDeltaE: dE,
      adjAzimuth: adjAz < 0 ? adjAz + 2 * Math.PI : adjAz,
      adjDistance: adjDist,
    });
    cursor = { northing: cursor.northing + dN, easting: cursor.easting + dE };
    adjustedPoints.push({ ...cursor });
  }

  const misclosureLinear = Math.hypot(errE, errN);
  const precision = (total > 0 && misclosureLinear > 1e-9) ? `1:${Math.round(total / misclosureLinear).toLocaleString()}` : 'exact';

  return {
    legs: adjLegs,
    totalDistance: total,
    misclosureN: errN,
    misclosureE: errE,
    misclosureLinear,
    precision,
    startPoint: { ...start },
    closingPoint: { northing: start.northing + lat, easting: start.easting + dep },
    adjustedClosingPoint: cursor,
    adjustedPoints,
    method,
  };
}
