// Extended COGO Agent CACP handlers. Wires interAgentComm command handlers
// for the skills declared in services/cogoSkillSchemas.ts. Pure-math skills
// only depend on a refs-based snapshot of the point database; nothing here
// mutates global app state.
//
// Usage in App.tsx:
//   useCogoExtendedSkills({ pointListsRef, logActionToFieldbook });

import { useEffect } from 'react';
import { interAgentComm, type AgentMessage, type AgentResponse } from './InterAgentCommunication';
import { AgentType } from '../types';
import type { PointList, SurveyPoint } from '../types';
import {
  // primitives
  inverse, direct, formatBearing,
  // bearing helpers
  parseAzimuthFlexible, azimuthToQuadrant, RAD_PER_DEG, DEG_PER_RAD,
  // intersect
  intersectBB, intersectBD, intersectDD, intersectLL, circleThrough3, perpendicularFoot, offsetFromLine,
  // curve
  solveCurve, curveStations, spiralXY, vcurveElevAt, vcurveTurningPoint, vcurveK,
  // area
  shoelaceArea, perimeter, centroid, sqftToAcres, minimumBoundingRect,
  // traverse
  adjustTraverse, type TraverseLeg,
  // transform
  helmert2D, affine2D, bestFitLine, bestFitCircle,
  // subdivide
  swingEqualArea, parallelEqualArea,
  // offset
  offsetPolyline,
  // geodetic
  vincentyInverse, vincentyDirect, metersToFeet,
  // types
  type Pt,
} from '../utils/cogoLib';

interface UseCogoExtendedSkillsOpts {
  pointListsRef: React.MutableRefObject<PointList[]>;
  logActionToFieldbook: (msg: string) => void;
}

const respond = (msg: AgentMessage, success: boolean, data?: Record<string, unknown>, error?: string): AgentResponse => ({
  requestId: msg.id,
  from: AgentType.COGO_AGENT,
  success,
  data,
  error,
  timestamp: Date.now(),
});

/** Resolve azimuth from a string (DMS / quadrant / decimal) — radians from north. */
function az(input: unknown): number | null {
  if (typeof input === 'number') return input;
  if (typeof input !== 'string') return null;
  return parseAzimuthFlexible(input);
}

/** Coerce {northing, easting[, elevation]} from a payload object. */
function pt(input: unknown): Pt | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as { northing?: number; easting?: number; elevation?: number };
  if (typeof o.northing !== 'number' || typeof o.easting !== 'number') return null;
  return { northing: o.northing, easting: o.easting, elevation: o.elevation };
}

function ptArray(input: unknown): Pt[] | null {
  if (!Array.isArray(input)) return null;
  const out: Pt[] = [];
  for (const v of input) {
    const p = pt(v);
    if (!p) return null;
    out.push(p);
  }
  return out;
}

/** Lookup a project point by its point-number string. */
function findPoint(lists: PointList[], pn: string): SurveyPoint | undefined {
  for (const l of lists) for (const p of l.points) if (p.pointNumber === pn) return p;
  return undefined;
}

// --- Unit conversion table (US survey foot vs international meter) ----------
const FT_PER_M = 3.28083333333; // US survey foot
const SQFT_PER_ACRE = 43560;
const SQM_PER_HECTARE = 10000;
const SQM_PER_SQFT = 1 / (FT_PER_M * FT_PER_M);

function convertUnits(value: number, fromUnit: string, toUnit: string): number | null {
  const f = fromUnit.toLowerCase();
  const t = toUnit.toLowerCase();
  if (f === t) return value;
  // Length
  const toMeters: Record<string, number> = { ft: 1 / FT_PER_M, m: 1, meter: 1, meters: 1, foot: 1 / FT_PER_M, feet: 1 / FT_PER_M };
  if (f in toMeters && t in toMeters) return value * toMeters[f] / toMeters[t];
  // Area
  const toSqM: Record<string, number> = {
    sqft: SQM_PER_SQFT, 'sq ft': SQM_PER_SQFT, sqm: 1, 'sq m': 1,
    acre: SQFT_PER_ACRE * SQM_PER_SQFT, acres: SQFT_PER_ACRE * SQM_PER_SQFT,
    hectare: SQM_PER_HECTARE, hectares: SQM_PER_HECTARE, ha: SQM_PER_HECTARE,
  };
  if (f in toSqM && t in toSqM) return value * toSqM[f] / toSqM[t];
  return null;
}

// --- Self-test fixtures (textbook problems) ---------------------------------
function runSelfTest(): { passed: number; failed: number; total: number; results: Array<{ family: string; name: string; passed: boolean; detail: string }> } {
  const results: Array<{ family: string; name: string; passed: boolean; detail: string }> = [];
  const within = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

  // Inverse / direct round-trip.
  try {
    const p1: Pt = { northing: 1000, easting: 1000 };
    const p2: Pt = { northing: 1100, easting: 1100 };
    const inv = inverse(p1, p2);
    const ok = within(inv.distance, Math.SQRT2 * 100, 1e-9) && within(inv.bearing * DEG_PER_RAD, 45, 1e-9);
    results.push({ family: 'inverse', name: 'NE 45° 100√2', passed: ok, detail: `dist=${inv.distance.toFixed(6)} az=${(inv.bearing * DEG_PER_RAD).toFixed(6)}°` });
  } catch (e) { results.push({ family: 'inverse', name: 'NE 45° 100√2', passed: false, detail: String(e) }); }

  try {
    const p1: Pt = { northing: 0, easting: 0 };
    const out = direct(p1, 90 * RAD_PER_DEG, 100);
    const ok = within(out.northing, 0, 1e-9) && within(out.easting, 100, 1e-9);
    results.push({ family: 'direct', name: 'East 100', passed: ok, detail: `N=${out.northing.toFixed(6)} E=${out.easting.toFixed(6)}` });
  } catch (e) { results.push({ family: 'direct', name: 'East 100', passed: false, detail: String(e) }); }

  // BB intersection.
  try {
    const x = intersectBB({ northing: 0, easting: 0 }, 45 * RAD_PER_DEG, { northing: 100, easting: 0 }, 135 * RAD_PER_DEG);
    const ok = !!x && within(x.northing, 50, 1e-9) && within(x.easting, 50, 1e-9);
    results.push({ family: 'intersect', name: 'BB 45/135 from (0,0)/(0,100)', passed: ok, detail: x ? `N=${x.northing.toFixed(6)} E=${x.easting.toFixed(6)}` : 'null' });
  } catch (e) { results.push({ family: 'intersect', name: 'BB', passed: false, detail: String(e) }); }

  // Curve solver — R=500, Δ=30°. L=261.7993878..., T=133.974596..., C=258.819045..., E=17.638390...
  try {
    const sol = solveCurve({ radius: 500, delta: 30 * RAD_PER_DEG });
    const ok = within(sol.arcLength, 500 * 30 * RAD_PER_DEG, 1e-6) && within(sol.tangent, 500 * Math.tan(15 * RAD_PER_DEG), 1e-6);
    results.push({ family: 'curve', name: 'R=500 Δ=30°', passed: ok, detail: `L=${sol.arcLength.toFixed(6)} T=${sol.tangent.toFixed(6)} C=${sol.chord.toFixed(6)}` });
  } catch (e) { results.push({ family: 'curve', name: 'curve_solve', passed: false, detail: String(e) }); }

  // Polygon area — unit square: 1 sq unit.
  try {
    const sq: Pt[] = [
      { northing: 0, easting: 0 }, { northing: 0, easting: 1 },
      { northing: 1, easting: 1 }, { northing: 1, easting: 0 },
    ];
    const a = shoelaceArea(sq);
    const ok = within(a, 1, 1e-12);
    results.push({ family: 'area', name: 'Unit square', passed: ok, detail: `area=${a.toFixed(12)}` });
  } catch (e) { results.push({ family: 'area', name: 'Unit square', passed: false, detail: String(e) }); }

  // Helmert 2D — pure rotation 90° + translation.
  try {
    const pairs = [
      { source: { northing: 0, easting: 0 } as Pt, target: { northing: 10, easting: 5 } as Pt },
      { source: { northing: 1, easting: 0 } as Pt, target: { northing: 10, easting: 6 } as Pt },
      { source: { northing: 0, easting: 1 } as Pt, target: { northing: 9, easting: 5 } as Pt },
    ];
    const fit = helmert2D(pairs);
    const ok = within(fit.rmse, 0, 1e-9) && within(fit.scale, 1, 1e-9);
    results.push({ family: 'helmert', name: '90° + translation', passed: ok, detail: `scale=${fit.scale.toFixed(9)} rot=${(fit.rotation * DEG_PER_RAD).toFixed(6)}° rmse=${fit.rmse.toExponential(2)}` });
  } catch (e) { results.push({ family: 'helmert', name: 'Helmert', passed: false, detail: String(e) }); }

  // Best-fit circle — known radius 5.
  try {
    const pts: Pt[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      pts.push({ northing: 100 + 5 * Math.cos(a), easting: 200 + 5 * Math.sin(a) });
    }
    const fit = bestFitCircle(pts);
    const ok = within(fit.radius, 5, 1e-9) && within(fit.center.northing, 100, 1e-9) && within(fit.center.easting, 200, 1e-9);
    results.push({ family: 'bestfit', name: 'circle r=5', passed: ok, detail: `r=${fit.radius.toFixed(9)} c=(${fit.center.northing.toFixed(6)},${fit.center.easting.toFixed(6)})` });
  } catch (e) { results.push({ family: 'bestfit', name: 'circle', passed: false, detail: String(e) }); }

  // Vincenty — JFK→LHR ≈ 5550 km (NGA reference 5,541.376 km on WGS84). Coarse tolerance 5 km.
  try {
    const v = vincentyInverse({ lat: 40.6413, lon: -73.7781 }, { lat: 51.4700, lon: -0.4543 });
    const ok = within(v.distanceMeters / 1000, 5550, 50);
    results.push({ family: 'geodetic', name: 'JFK→LHR', passed: ok, detail: `${(v.distanceMeters / 1000).toFixed(3)} km` });
  } catch (e) { results.push({ family: 'geodetic', name: 'Vincenty', passed: false, detail: String(e) }); }

  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  return { passed, failed, total: results.length, results };
}

// ---------------------------------------------------------------------------
// Points sanity check — multi-check QA for PDF/table-extracted points.
// ---------------------------------------------------------------------------
interface SanityIssue {
  check: 'cluster' | 'inverse' | 'closure' | 'area' | 'triangulate' | 'duplicate';
  severity: 'yellow' | 'red';
  pn?: string;
  relatedPns?: string[];
  message: string;
  expected?: number;
  actual?: number;
  residual?: number;
}
interface SanityPoint { pointNumber: string; northing: number; easting: number; elevation?: number; description?: string }
interface SanitySegment { from: string; to: string; bearing?: string; distance?: number; radius?: number }
interface SanityResult {
  passed: boolean;
  score: number;
  summary: string;
  checksRun: string[];
  checksSkipped: Array<{ check: string; reason: string }>;
  issues: SanityIssue[];
  closure?: { perimeter?: number; misclosureLinear?: number; precision?: string; areaSqft?: number; areaAcres?: number };
}

function coercePoints(raw: unknown): SanityPoint[] | null {
  if (!Array.isArray(raw)) return null;
  const out: SanityPoint[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') return null;
    const o = r as Record<string, unknown>;
    const pn = o.pointNumber ?? o.pn ?? o.id;
    if (typeof pn !== 'string' || typeof o.northing !== 'number' || typeof o.easting !== 'number') return null;
    out.push({
      pointNumber: pn,
      northing: o.northing,
      easting: o.easting,
      elevation: typeof o.elevation === 'number' ? o.elevation : undefined,
      description: typeof o.description === 'string' ? o.description : undefined,
    });
  }
  return out;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return 0;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

function runPointsSanityCheck(data: Record<string, unknown>): SanityResult {
  const issues: SanityIssue[] = [];
  const checksRun: string[] = [];
  const checksSkipped: Array<{ check: string; reason: string }> = [];

  const points = coercePoints((data as { points?: unknown }).points);
  if (!points || points.length === 0) {
    return { passed: false, score: 0, summary: 'No points supplied.', checksRun, checksSkipped, issues: [{ check: 'cluster', severity: 'red', message: 'points[] required.' }] };
  }

  const units = ((data.units as string) ?? 'ft').toLowerCase() === 'm' ? 'm' : 'ft';
  const tolIn = (data.tolerances ?? {}) as { linearAbs?: number; bearingSeconds?: number; areaPct?: number; clusterIqrMultiple?: number; duplicateAbs?: number };
  const tol = {
    linearAbs: typeof tolIn.linearAbs === 'number' ? tolIn.linearAbs : (units === 'ft' ? 0.10 : 0.03),
    bearingRad: ((typeof tolIn.bearingSeconds === 'number' ? tolIn.bearingSeconds : 30) / 3600) * RAD_PER_DEG,
    areaPct: typeof tolIn.areaPct === 'number' ? tolIn.areaPct : 0.01,
    clusterIqr: typeof tolIn.clusterIqrMultiple === 'number' ? tolIn.clusterIqrMultiple : 4,
    duplicateAbs: typeof tolIn.duplicateAbs === 'number' ? tolIn.duplicateAbs : (units === 'ft' ? 0.01 : 0.003),
  };

  const pnMap = new Map<string, SanityPoint>();
  for (const p of points) pnMap.set(p.pointNumber, p);

  // --- Check 1: coordinate-magnitude clustering --------------------------
  checksRun.push('cluster');
  if (points.length >= 4) {
    const ns = points.map(p => p.northing).sort((a, b) => a - b);
    const es = points.map(p => p.easting).sort((a, b) => a - b);
    const q = (s: number[], frac: number) => s[Math.min(s.length - 1, Math.max(0, Math.floor(frac * (s.length - 1))))];
    const medN = median(ns), medE = median(es);
    const iqrN = Math.max(1e-9, q(ns, 0.75) - q(ns, 0.25));
    const iqrE = Math.max(1e-9, q(es, 0.75) - q(es, 0.25));
    for (const p of points) {
      const dN = Math.abs(p.northing - medN) / iqrN;
      const dE = Math.abs(p.easting - medE) / iqrE;
      if (dN > tol.clusterIqr || dE > tol.clusterIqr) {
        // Heuristic: if N and E magnitudes look swapped vs the cluster, call that out specifically.
        const swappedDist = Math.hypot(p.northing - medE, p.easting - medN);
        const normalDist = Math.hypot(p.northing - medN, p.easting - medE);
        const swappedHint = swappedDist < normalDist * 0.2 ? ' — northing/easting may be swapped' : '';
        issues.push({
          check: 'cluster', severity: 'red', pn: p.pointNumber,
          message: `Coordinate is ${Math.max(dN, dE).toFixed(1)} IQR widths from cluster median (N med=${medN.toFixed(2)}, E med=${medE.toFixed(2)})${swappedHint}.`,
          residual: Math.max(dN, dE),
        });
      }
    }
  } else {
    checksSkipped.push({ check: 'cluster', reason: 'Need ≥4 points for IQR cluster check.' });
  }

  // --- Check 6: duplicate / coincident detection -------------------------
  checksRun.push('duplicate');
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i], b = points[j];
      const d = Math.hypot(a.northing - b.northing, a.easting - b.easting);
      if (d <= tol.duplicateAbs) {
        issues.push({
          check: 'duplicate', severity: a.pointNumber === b.pointNumber ? 'red' : 'yellow',
          pn: a.pointNumber, relatedPns: [b.pointNumber],
          message: `Point ${a.pointNumber} is coincident with ${b.pointNumber} (Δ=${d.toFixed(3)} ${units}).`,
          residual: d,
        });
      }
    }
  }

  // --- Check 2: inverse round-trip vs companion segment table -----------
  const segsRaw = data.expectedSegments;
  const segments: SanitySegment[] = Array.isArray(segsRaw)
    ? (segsRaw as unknown[]).reduce<SanitySegment[]>((acc, s) => {
        if (s && typeof s === 'object') {
          const o = s as Record<string, unknown>;
          if (typeof o.from === 'string' && typeof o.to === 'string') {
            acc.push({
              from: o.from, to: o.to,
              bearing: typeof o.bearing === 'string' ? o.bearing : undefined,
              distance: typeof o.distance === 'number' ? o.distance : undefined,
              radius: typeof o.radius === 'number' ? o.radius : undefined,
            });
          }
        }
        return acc;
      }, [])
    : [];

  if (segments.length > 0) {
    checksRun.push('inverse');
    // Per-point residual tally to triangulate the worst offender.
    const pnResiduals = new Map<string, { count: number; sumLinear: number; maxLinear: number }>();
    for (const seg of segments) {
      const a = pnMap.get(seg.from), b = pnMap.get(seg.to);
      if (!a || !b) {
        issues.push({ check: 'inverse', severity: 'yellow', message: `Segment ${seg.from}→${seg.to} references unknown point.`, relatedPns: [seg.from, seg.to] });
        continue;
      }
      const inv = inverse({ northing: a.northing, easting: a.easting }, { northing: b.northing, easting: b.easting });
      let linearResid = 0;
      let bearingResidRad = 0;
      const reasons: string[] = [];
      if (typeof seg.distance === 'number') {
        linearResid = Math.abs(inv.distance - seg.distance);
        if (linearResid > tol.linearAbs) reasons.push(`Δd=${linearResid.toFixed(3)} ${units} (table ${seg.distance.toFixed(3)}, inv ${inv.distance.toFixed(3)})`);
      }
      if (typeof seg.bearing === 'string') {
        const expectedRad = parseAzimuthFlexible(seg.bearing);
        if (expectedRad !== null) {
          // Smallest signed angular difference, wrapped to [-π, π].
          let diff = inv.bearing - expectedRad;
          while (diff > Math.PI) diff -= 2 * Math.PI;
          while (diff < -Math.PI) diff += 2 * Math.PI;
          bearingResidRad = Math.abs(diff);
          if (bearingResidRad > tol.bearingRad) {
            const arcsec = bearingResidRad * DEG_PER_RAD * 3600;
            reasons.push(`Δaz=${arcsec.toFixed(1)}" (table ${seg.bearing}, inv ${azimuthToQuadrant(inv.bearing, 0)})`);
          }
        }
      }
      if (reasons.length > 0) {
        // Combined residual in linear units: bearing arc residual at the segment length.
        const linearizedBearingResid = bearingResidRad * inv.distance;
        const totalLinear = Math.hypot(linearResid, linearizedBearingResid);
        issues.push({
          check: 'inverse', severity: 'red',
          relatedPns: [seg.from, seg.to],
          message: `${seg.from}→${seg.to}: ${reasons.join('; ')}.`,
          residual: totalLinear,
        });
        for (const pn of [seg.from, seg.to]) {
          const prev = pnResiduals.get(pn) ?? { count: 0, sumLinear: 0, maxLinear: 0 };
          prev.count += 1;
          prev.sumLinear += totalLinear;
          prev.maxLinear = Math.max(prev.maxLinear, totalLinear);
          pnResiduals.set(pn, prev);
        }
      }
    }
    // Triangulate: if a single point shows up in ≥2 failing segments with large mean residual, flag it explicitly.
    for (const [pn, r] of pnResiduals) {
      if (r.count >= 2 && r.sumLinear / r.count > tol.linearAbs * 2) {
        issues.push({
          check: 'triangulate', severity: 'red', pn,
          message: `Point ${pn} participates in ${r.count} failing segments (avg residual ${(r.sumLinear / r.count).toFixed(3)} ${units}). Likely the corrupted coordinate.`,
          residual: r.sumLinear / r.count,
        });
      }
    }
    if (pnResiduals.size > 0) checksRun.push('triangulate');
  } else {
    checksSkipped.push({ check: 'inverse', reason: 'No expectedSegments[] provided.' });
  }

  // --- Check 3: polygon closure -----------------------------------------
  let closure: SanityResult['closure'];
  if (data.expectedClosed === true) {
    checksRun.push('closure');
    if (points.length >= 3) {
      const verts: Pt[] = points.map(p => ({ northing: p.northing, easting: p.easting }));
      const peri = perimeter(verts, true);
      const sqft = Math.abs(shoelaceArea(verts));
      // Misclosure = distance from last vertex back to first (since perimeter is true-closed it's already included; we want raw gap on the open chain).
      const last = verts[verts.length - 1], first = verts[0];
      const gap = Math.hypot(last.northing - first.northing, last.easting - first.easting);
      const openPeri = peri - gap;
      const precision = gap > 0 ? `1:${Math.round(openPeri / gap).toLocaleString()}` : '1:∞';
      closure = { perimeter: peri, misclosureLinear: gap, precision, areaSqft: sqft, areaAcres: sqftToAcres(sqft) };
      if (gap > tol.linearAbs) {
        issues.push({
          check: 'closure', severity: gap > tol.linearAbs * 10 ? 'red' : 'yellow',
          message: `Polygon misclosure ${gap.toFixed(3)} ${units} over ${openPeri.toFixed(2)} ${units} perimeter (${precision}).`,
          residual: gap,
        });
      }
    } else {
      checksSkipped.push({ check: 'closure', reason: 'Need ≥3 points to test closure.' });
    }
  } else {
    checksSkipped.push({ check: 'closure', reason: 'expectedClosed not set.' });
  }

  // --- Check 4: stated area cross-check ---------------------------------
  if (typeof data.expectedArea === 'number' && points.length >= 3) {
    checksRun.push('area');
    const unit = ((data.expectedAreaUnit as string) ?? 'acres').toLowerCase();
    const verts: Pt[] = points.map(p => ({ northing: p.northing, easting: p.easting }));
    const sqft = Math.abs(shoelaceArea(verts));
    if (!closure) closure = { areaSqft: sqft, areaAcres: sqftToAcres(sqft) };
    let computed: number; let label: string;
    if (unit === 'sqft' || unit === 'sq ft') { computed = sqft; label = 'sqft'; }
    else if (unit === 'sqm' || unit === 'sq m') { computed = sqft * (1 / (FT_PER_M * FT_PER_M)); label = 'sqm'; }
    else if (unit === 'hectare' || unit === 'hectares' || unit === 'ha') { computed = sqft * (1 / (FT_PER_M * FT_PER_M)) / 10000; label = 'ha'; }
    else { computed = sqftToAcres(sqft); label = 'ac'; }
    const expected = data.expectedArea as number;
    const pct = expected !== 0 ? Math.abs(computed - expected) / Math.abs(expected) : Math.abs(computed - expected);
    if (pct > tol.areaPct) {
      issues.push({
        check: 'area', severity: pct > tol.areaPct * 5 ? 'red' : 'yellow',
        message: `Computed area ${computed.toFixed(4)} ${label} differs from stated ${expected.toFixed(4)} ${label} by ${(pct * 100).toFixed(2)}%.`,
        expected, actual: computed, residual: Math.abs(computed - expected),
      });
    }
  } else if (typeof data.expectedArea === 'number') {
    checksSkipped.push({ check: 'area', reason: 'Need ≥3 points to compute area.' });
  } else {
    checksSkipped.push({ check: 'area', reason: 'No expectedArea provided.' });
  }

  const redCount = issues.filter(i => i.severity === 'red').length;
  const yellowCount = issues.filter(i => i.severity === 'yellow').length;
  const passed = redCount === 0;
  const score = checksRun.length === 0 ? 1 : Math.max(0, 1 - (redCount + 0.25 * yellowCount) / checksRun.length);
  const summary = passed
    ? `${checksRun.length} check(s) ran, no red issues${yellowCount > 0 ? `; ${yellowCount} yellow` : ''}.`
    : `${redCount} red, ${yellowCount} yellow issue(s) across ${checksRun.length} check(s).`;
  return { passed, score, summary, checksRun, checksSkipped, issues, closure };
}

// ---------------------------------------------------------------------------
// Hook — registers all command handlers; cleans up on unmount.
// ---------------------------------------------------------------------------
export function useCogoExtendedSkills(opts: UseCogoExtendedSkillsOpts): void {
  const { pointListsRef, logActionToFieldbook } = opts;

  useEffect(() => {
    const unsubs: Array<() => void> = [];

    // ----- direct -----------------------------------------------------------
    unsubs.push(interAgentComm.onCommand('cogo_direct', async (m) => {
      const d = (m.data ?? {}) as { fromPointNumber?: string; fromCoordinates?: Pt; azimuth?: string | number; distance?: number; newPointNumber?: string };
      let from = pt(d.fromCoordinates);
      if (!from && typeof d.fromPointNumber === 'string') {
        const sp = findPoint(pointListsRef.current, d.fromPointNumber);
        if (sp) from = { northing: sp.northing, easting: sp.easting, elevation: sp.elevation };
      }
      if (!from) return respond(m, false, undefined, 'fromPointNumber or fromCoordinates required.');
      const a = az(d.azimuth);
      if (a === null) return respond(m, false, undefined, 'azimuth could not be parsed.');
      if (typeof d.distance !== 'number') return respond(m, false, undefined, 'distance is required.');
      const out = direct(from, a, d.distance);
      return respond(m, true, { coordinates: out, pointNumber: d.newPointNumber });
    }));

    // ----- intersections ----------------------------------------------------
    unsubs.push(interAgentComm.onCommand('cogo_intersect_bb', async (m) => {
      const d = (m.data ?? {}) as { p1?: Pt; az1?: string | number; p2?: Pt; az2?: string | number };
      const p1 = pt(d.p1), p2 = pt(d.p2);
      const a1 = az(d.az1), a2 = az(d.az2);
      if (!p1 || !p2 || a1 === null || a2 === null) return respond(m, false, undefined, 'p1, p2, az1, az2 required.');
      const x = intersectBB(p1, a1, p2, a2);
      return respond(m, true, x ? { point: x, parallel: false } : { parallel: true });
    }));

    unsubs.push(interAgentComm.onCommand('cogo_intersect_bd', async (m) => {
      const d = (m.data ?? {}) as { p1?: Pt; az1?: string | number; p2?: Pt; d2?: number };
      const p1 = pt(d.p1), p2 = pt(d.p2);
      const a1 = az(d.az1);
      if (!p1 || !p2 || a1 === null || typeof d.d2 !== 'number') return respond(m, false, undefined, 'p1, az1, p2, d2 required.');
      const r = intersectBD(p1, a1, p2, d.d2);
      return respond(m, true, { count: r.count, solutions: r.solutions });
    }));

    unsubs.push(interAgentComm.onCommand('cogo_intersect_dd', async (m) => {
      const d = (m.data ?? {}) as { p1?: Pt; d1?: number; p2?: Pt; d2?: number };
      const p1 = pt(d.p1), p2 = pt(d.p2);
      if (!p1 || !p2 || typeof d.d1 !== 'number' || typeof d.d2 !== 'number') return respond(m, false, undefined, 'p1, d1, p2, d2 required.');
      const r = intersectDD(p1, d.d1, p2, d.d2);
      return respond(m, true, { count: r.count, solutions: r.solutions });
    }));

    unsubs.push(interAgentComm.onCommand('cogo_intersect_ll', async (m) => {
      const d = (m.data ?? {}) as { a1?: Pt; a2?: Pt; b1?: Pt; b2?: Pt };
      const a1 = pt(d.a1), a2 = pt(d.a2), b1 = pt(d.b1), b2 = pt(d.b2);
      if (!a1 || !a2 || !b1 || !b2) return respond(m, false, undefined, 'a1,a2,b1,b2 required.');
      const x = intersectLL(a1, a2, b1, b2);
      return respond(m, true, x ? { point: x, parallel: false } : { parallel: true });
    }));

    unsubs.push(interAgentComm.onCommand('cogo_circle_through_3', async (m) => {
      const d = (m.data ?? {}) as { p1?: Pt; p2?: Pt; p3?: Pt };
      const p1 = pt(d.p1), p2 = pt(d.p2), p3 = pt(d.p3);
      if (!p1 || !p2 || !p3) return respond(m, false, undefined, 'p1,p2,p3 required.');
      const c = circleThrough3(p1, p2, p3);
      return respond(m, true, c ? { center: c.center, radius: c.radius, collinear: false } : { collinear: true });
    }));

    unsubs.push(interAgentComm.onCommand('cogo_perpendicular_foot', async (m) => {
      const d = (m.data ?? {}) as { p?: Pt; a?: Pt; b?: Pt };
      const p = pt(d.p), a = pt(d.a), b = pt(d.b);
      if (!p || !a || !b) return respond(m, false, undefined, 'p,a,b required.');
      const foot = perpendicularFoot(p, a, b);
      const offset = offsetFromLine(p, a, b);
      return respond(m, true, { foot, offset });
    }));

    // ----- curves -----------------------------------------------------------
    unsubs.push(interAgentComm.onCommand('cogo_curve_solve', async (m) => {
      const d = (m.data ?? {}) as Parameters<typeof solveCurve>[0];
      try {
        const out = solveCurve(d);
        return respond(m, true, { ...out });
      } catch (e) { return respond(m, false, undefined, (e as Error).message); }
    }));

    unsubs.push(interAgentComm.onCommand('cogo_curve_stations', async (m) => {
      const d = (m.data ?? {}) as { piStation?: number; tangent?: number; arcLength?: number };
      if (typeof d.piStation !== 'number' || typeof d.tangent !== 'number' || typeof d.arcLength !== 'number') return respond(m, false, undefined, 'piStation, tangent, arcLength required.');
      const out = curveStations(d.piStation, { tangent: d.tangent, arcLength: d.arcLength });
      return respond(m, true, out as unknown as Record<string, unknown>);
    }));

    unsubs.push(interAgentComm.onCommand('cogo_spiral_xy', async (m) => {
      const d = (m.data ?? {}) as { length?: number; endRadius?: number; totalLength?: number };
      if (typeof d.length !== 'number' || typeof d.endRadius !== 'number' || typeof d.totalLength !== 'number') return respond(m, false, undefined, 'length, endRadius, totalLength required.');
      const r = spiralXY(d.length, d.endRadius, d.totalLength);
      return respond(m, true, r as unknown as Record<string, unknown>);
    }));

    unsubs.push(interAgentComm.onCommand('cogo_vcurve_elev_at', async (m) => {
      const d = (m.data ?? {}) as { pviStation?: number; pviElev?: number; length?: number; gradeIn?: number; gradeOut?: number; station?: number };
      if (typeof d.pviStation !== 'number' || typeof d.pviElev !== 'number' || typeof d.length !== 'number' || typeof d.gradeIn !== 'number' || typeof d.gradeOut !== 'number' || typeof d.station !== 'number') return respond(m, false, undefined, 'pviStation, pviElev, length, gradeIn, gradeOut, station required.');
      const elev = vcurveElevAt(d as Required<typeof d>, d.station);
      return respond(m, true, { elevation: elev });
    }));

    unsubs.push(interAgentComm.onCommand('cogo_vcurve_summary', async (m) => {
      const d = (m.data ?? {}) as { pviStation?: number; pviElev?: number; length?: number; gradeIn?: number; gradeOut?: number };
      if (typeof d.pviStation !== 'number' || typeof d.pviElev !== 'number' || typeof d.length !== 'number' || typeof d.gradeIn !== 'number' || typeof d.gradeOut !== 'number') return respond(m, false, undefined, 'pviStation, pviElev, length, gradeIn, gradeOut required.');
      const params = d as Required<typeof d>;
      const bvcStation = params.pviStation - params.length / 2;
      const evcStation = params.pviStation + params.length / 2;
      const bvcElev = params.pviElev - params.gradeIn * (params.length / 2);
      const evcElev = params.pviElev + params.gradeOut * (params.length / 2);
      const k = vcurveK(params.length, params.gradeIn, params.gradeOut);
      const tpStation = vcurveTurningPoint(params);
      const out: Record<string, unknown> = { bvcStation, bvcElev, evcStation, evcElev, kValue: k };
      if (tpStation !== null) {
        out.turningPointStation = tpStation;
        out.turningPointElev = vcurveElevAt(params, tpStation);
      }
      return respond(m, true, out);
    }));

    // ----- traverse ---------------------------------------------------------
    const buildLegs = (raw: unknown): TraverseLeg[] | null => {
      if (!Array.isArray(raw)) return null;
      const out: TraverseLeg[] = [];
      for (const r of raw) {
        const rr = r as { azimuth?: string | number; distance?: number };
        const a = az(rr.azimuth);
        if (a === null || typeof rr.distance !== 'number') return null;
        out.push({ azimuth: a, distance: rr.distance });
      }
      return out;
    };

    unsubs.push(interAgentComm.onCommand('cogo_traverse_compute', async (m) => {
      const d = (m.data ?? {}) as { start?: Pt; legs?: unknown; closeBack?: Pt };
      const start = pt(d.start);
      const legs = buildLegs(d.legs);
      if (!start || !legs) return respond(m, false, undefined, 'start (Pt) and legs[] required.');
      const r = adjustTraverse(legs, start, 'none', pt(d.closeBack) ?? undefined);
      return respond(m, true, {
        misclosureN: r.misclosureN, misclosureE: r.misclosureE, misclosureLinear: r.misclosureLinear,
        precision: r.precision, totalDistance: r.totalDistance,
      });
    }));

    unsubs.push(interAgentComm.onCommand('cogo_traverse_adjust', async (m) => {
      const d = (m.data ?? {}) as { start?: Pt; legs?: unknown; method?: 'compass' | 'transit' | 'crandall'; closeBack?: Pt };
      const start = pt(d.start);
      const legs = buildLegs(d.legs);
      if (!start || !legs || !d.method) return respond(m, false, undefined, 'start, legs[], method required.');
      const r = adjustTraverse(legs, start, d.method, pt(d.closeBack) ?? undefined);
      return respond(m, true, {
        adjustedPoints: r.adjustedPoints, misclosureLinear: r.misclosureLinear,
        precision: r.precision, method: r.method,
      });
    }));

    // ----- area / parcel ----------------------------------------------------
    unsubs.push(interAgentComm.onCommand('cogo_area_polygon', async (m) => {
      const d = (m.data ?? {}) as { vertices?: unknown };
      const verts = ptArray(d.vertices);
      if (!verts || verts.length < 3) return respond(m, false, undefined, 'vertices[] (≥3) required.');
      const sqft = shoelaceArea(verts);
      return respond(m, true, { sqft, acres: sqftToAcres(sqft), perimeter: perimeter(verts, true), centroid: centroid(verts) });
    }));

    unsubs.push(interAgentComm.onCommand('cogo_area_from_pns', async (m) => {
      const d = (m.data ?? {}) as { pointNumbers?: string[] };
      if (!Array.isArray(d.pointNumbers) || d.pointNumbers.length < 3) return respond(m, false, undefined, 'pointNumbers[] (≥3) required.');
      const verts: Pt[] = [];
      const missing: string[] = [];
      for (const pn of d.pointNumbers) {
        const sp = findPoint(pointListsRef.current, pn);
        if (!sp) missing.push(pn);
        else verts.push({ northing: sp.northing, easting: sp.easting });
      }
      if (verts.length < 3) return respond(m, false, undefined, `Insufficient resolved points (missing: ${missing.join(',')}).`);
      const sqft = shoelaceArea(verts);
      return respond(m, true, { sqft, acres: sqftToAcres(sqft), perimeter: perimeter(verts, true), centroid: centroid(verts), missing });
    }));

    unsubs.push(interAgentComm.onCommand('cogo_minimum_bounding_rect', async (m) => {
      const d = (m.data ?? {}) as { points?: unknown };
      const pts = ptArray(d.points);
      if (!pts || pts.length < 3) return respond(m, false, undefined, 'points[] (≥3) required.');
      const r = minimumBoundingRect(pts);
      if (!r) return respond(m, false, undefined, 'Could not compute bounding rectangle (collinear points?).');
      return respond(m, true, { corners: r.corners, width: r.width, height: r.height, rotation: r.rotation, area: r.area });
    }));

    // ----- subdivide --------------------------------------------------------
    unsubs.push(interAgentComm.onCommand('cogo_subdivide_swing', async (m) => {
      const d = (m.data ?? {}) as { polygon?: unknown; pivotIndex?: number; targetArea?: number; initialAzimuth?: number };
      const poly = ptArray(d.polygon);
      if (!poly || poly.length < 3 || typeof d.pivotIndex !== 'number' || typeof d.targetArea !== 'number' || typeof d.initialAzimuth !== 'number') {
        return respond(m, false, undefined, 'polygon[], pivotIndex, targetArea, initialAzimuth required.');
      }
      const r = swingEqualArea(poly, d.pivotIndex, d.targetArea, d.initialAzimuth);
      if (!r) return respond(m, false, undefined, 'Swing-line search failed (no valid azimuth in bracket).');
      return respond(m, true, { cutEnd: r.cutEnd, azimuth: r.azimuth, left: r.left, right: r.right });
    }));

    unsubs.push(interAgentComm.onCommand('cogo_subdivide_parallel', async (m) => {
      const d = (m.data ?? {}) as { polygon?: unknown; targetArea?: number; azimuth?: number };
      const poly = ptArray(d.polygon);
      if (!poly || poly.length < 3 || typeof d.targetArea !== 'number' || typeof d.azimuth !== 'number') {
        return respond(m, false, undefined, 'polygon[], targetArea, azimuth required.');
      }
      const r = parallelEqualArea(poly, d.targetArea, d.azimuth);
      if (!r) return respond(m, false, undefined, 'Parallel-cut search failed.');
      return respond(m, true, { a: r.a, b: r.b, left: r.left, right: r.right });
    }));

    // ----- offset -----------------------------------------------------------
    unsubs.push(interAgentComm.onCommand('cogo_offset_polyline', async (m) => {
      const d = (m.data ?? {}) as { vertices?: unknown; distance?: number; closed?: boolean; join?: 'miter' | 'bevel'; miterLimit?: number };
      const verts = ptArray(d.vertices);
      if (!verts || verts.length < 2 || typeof d.distance !== 'number') return respond(m, false, undefined, 'vertices[] (≥2) and distance required.');
      const out = offsetPolyline(verts, d.distance, d.closed === true, d.join ?? 'miter', d.miterLimit ?? 10);
      return respond(m, true, { vertices: out });
    }));

    // ----- best-fit / transform --------------------------------------------
    unsubs.push(interAgentComm.onCommand('cogo_bestfit_line', async (m) => {
      const d = (m.data ?? {}) as { points?: unknown };
      const pts = ptArray(d.points);
      if (!pts || pts.length < 2) return respond(m, false, undefined, 'points[] (≥2) required.');
      const r = bestFitLine(pts);
      return respond(m, true, { azimuth: r.azimuth, through: r.through, rmse: r.rmse });
    }));

    unsubs.push(interAgentComm.onCommand('cogo_bestfit_circle', async (m) => {
      const d = (m.data ?? {}) as { points?: unknown };
      const pts = ptArray(d.points);
      if (!pts || pts.length < 3) return respond(m, false, undefined, 'points[] (≥3) required.');
      try {
        const r = bestFitCircle(pts);
        return respond(m, true, { center: r.center, radius: r.radius, rmse: r.rmse });
      } catch (e) { return respond(m, false, undefined, (e as Error).message); }
    }));

    const parsePairs = (raw: unknown): Array<{ source: Pt; target: Pt }> | null => {
      if (!Array.isArray(raw)) return null;
      const out: Array<{ source: Pt; target: Pt }> = [];
      for (const r of raw) {
        const rr = r as { source?: Pt; target?: Pt };
        const s = pt(rr.source), t = pt(rr.target);
        if (!s || !t) return null;
        out.push({ source: s, target: t });
      }
      return out;
    };

    unsubs.push(interAgentComm.onCommand('cogo_helmert2d', async (m) => {
      const pairs = parsePairs((m.data as { pairs?: unknown })?.pairs);
      if (!pairs || pairs.length < 2) return respond(m, false, undefined, 'pairs[] (≥2) required.');
      try {
        const f = helmert2D(pairs);
        return respond(m, true, { tE: f.tE, tN: f.tN, scale: f.scale, rotation: f.rotation, rmse: f.rmse });
      } catch (e) { return respond(m, false, undefined, (e as Error).message); }
    }));

    unsubs.push(interAgentComm.onCommand('cogo_affine2d', async (m) => {
      const pairs = parsePairs((m.data as { pairs?: unknown })?.pairs);
      if (!pairs || pairs.length < 3) return respond(m, false, undefined, 'pairs[] (≥3) required.');
      try {
        const f = affine2D(pairs);
        const [[a, b, tE], [c, dC, tN]] = f.matrix;
        return respond(m, true, { a, b, tE, c, d: dC, tN, rmse: f.rmse });
      } catch (e) { return respond(m, false, undefined, (e as Error).message); }
    }));

    // ----- geodetic ---------------------------------------------------------
    unsubs.push(interAgentComm.onCommand('cogo_geodesic_inverse', async (m) => {
      const d = (m.data ?? {}) as { p1?: { lat?: number; lon?: number }; p2?: { lat?: number; lon?: number } };
      if (!d.p1 || typeof d.p1.lat !== 'number' || typeof d.p1.lon !== 'number') return respond(m, false, undefined, 'p1.lat,lon required.');
      if (!d.p2 || typeof d.p2.lat !== 'number' || typeof d.p2.lon !== 'number') return respond(m, false, undefined, 'p2.lat,lon required.');
      const v = vincentyInverse({ lat: d.p1.lat, lon: d.p1.lon }, { lat: d.p2.lat, lon: d.p2.lon });
      return respond(m, true, {
        distanceMeters: v.distanceMeters, distanceFeet: metersToFeet(v.distanceMeters),
        initialAzimuth: v.initialAzimuth, finalAzimuth: v.finalAzimuth,
      });
    }));

    unsubs.push(interAgentComm.onCommand('cogo_geodesic_direct', async (m) => {
      const d = (m.data ?? {}) as { start?: { lat?: number; lon?: number }; azimuth?: number; distanceMeters?: number };
      if (!d.start || typeof d.start.lat !== 'number' || typeof d.start.lon !== 'number') return respond(m, false, undefined, 'start.lat,lon required.');
      if (typeof d.azimuth !== 'number' || typeof d.distanceMeters !== 'number') return respond(m, false, undefined, 'azimuth and distanceMeters required.');
      const r = vincentyDirect({ lat: d.start.lat, lon: d.start.lon }, d.azimuth, d.distanceMeters);
      return respond(m, true, { lat: r.destination.lat, lon: r.destination.lon, finalAzimuth: r.finalAzimuth });
    }));

    // ----- utility ----------------------------------------------------------
    unsubs.push(interAgentComm.onCommand('cogo_format_bearing', async (m) => {
      const d = (m.data ?? {}) as { value?: number; unit?: 'radians' | 'degrees'; secondsPrecision?: number };
      if (typeof d.value !== 'number') return respond(m, false, undefined, 'value (number) required.');
      const rad = d.unit === 'degrees' ? d.value * RAD_PER_DEG : d.value;
      return respond(m, true, { bearing: azimuthToQuadrant(rad, d.secondsPrecision ?? 0) });
    }));

    unsubs.push(interAgentComm.onCommand('cogo_parse_bearing', async (m) => {
      const d = (m.data ?? {}) as { input?: string };
      if (typeof d.input !== 'string') return respond(m, false, undefined, 'input (string) required.');
      const rad = parseAzimuthFlexible(d.input);
      if (rad === null) return respond(m, false, undefined, 'Could not parse bearing.');
      return respond(m, true, { radians: rad, degrees: rad * DEG_PER_RAD });
    }));

    unsubs.push(interAgentComm.onCommand('cogo_units_convert', async (m) => {
      const d = (m.data ?? {}) as { value?: number; fromUnit?: string; toUnit?: string };
      if (typeof d.value !== 'number' || typeof d.fromUnit !== 'string' || typeof d.toUnit !== 'string') return respond(m, false, undefined, 'value, fromUnit, toUnit required.');
      const v = convertUnits(d.value, d.fromUnit, d.toUnit);
      if (v === null) return respond(m, false, undefined, `Unknown unit conversion ${d.fromUnit} → ${d.toUnit}.`);
      return respond(m, true, { value: v, fromUnit: d.fromUnit, toUnit: d.toUnit });
    }));

    unsubs.push(interAgentComm.onCommand('cogo_selftest', async (m) => {
      const r = runSelfTest();
      logActionToFieldbook(`COGO selftest — ${r.passed}/${r.total} passed${r.failed > 0 ? ` (${r.failed} failed)` : ''}.`);
      return respond(m, true, { passed: r.passed, failed: r.failed, total: r.total, results: r.results });
    }));

    // ----- points sanity check (PDF/table extraction QA) -------------------
    unsubs.push(interAgentComm.onCommand('points_sanity_check', async (m) => {
      const r = runPointsSanityCheck(m.data ?? {});
      logActionToFieldbook(
        `Points sanity check — ${r.passed ? 'PASSED' : 'FAILED'} ` +
        `(${r.issues.filter(i => i.severity === 'red').length} red, ${r.issues.filter(i => i.severity === 'yellow').length} yellow, ` +
        `score ${(r.score * 100).toFixed(0)}%). ${r.summary}`
      );
      return respond(m, true, r as unknown as Record<string, unknown>);
    }));

    // suppress noise: silence fellow surveyor jokes.
    void inverse; void formatBearing;

    return () => { for (const u of unsubs) u(); };
  }, [pointListsRef, logActionToFieldbook]);
}
