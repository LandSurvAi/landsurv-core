// Horizontal circular curve solver — given any 2 of {R, Δ, L, C, T, E, M, Da, Dc}
// derive the rest. Standard surveyor formulas (Wolf & Ghilani §24).

import { CurveParams, RAD_PER_DEG } from './types';

const EPS = 1e-9;

export interface CurveSolution extends Required<Omit<CurveParams, 'direction' | 'degreeArc' | 'degreeChord'>> {
  degreeArc: number;
  degreeChord: number;
  direction?: 'left' | 'right';
}

/** Solve a curve from any 2 of: radius, delta, arcLength, chord, tangent, external, middleOrdinate, degreeArc, degreeChord. */
export function solveCurve(input: CurveParams): CurveSolution {
  const known = { ...input };

  // Phase 1: derive R from any single-driving param if delta unknown / vice versa.
  // Phase 2: iterate until stable.

  const haveR = () => known.radius !== undefined && known.radius > 0;
  const haveD = () => known.delta !== undefined && known.delta > 0;

  // From degreeArc (Da): R = 100 / (Da_rad)  → Da is the central angle subtending 100 ft of arc.
  if (!haveR() && known.degreeArc !== undefined) {
    known.radius = 100 / (known.degreeArc * RAD_PER_DEG);
  }
  // From degreeChord (Dc): R = 50 / sin(Dc/2)
  if (!haveR() && known.degreeChord !== undefined) {
    known.radius = 50 / Math.sin((known.degreeChord * RAD_PER_DEG) / 2);
  }

  // Iterate up to 20 times to derive both R and Δ.
  for (let i = 0; i < 20; i++) {
    if (haveR() && haveD()) break;
    if (haveR() && !haveD()) {
      const R = known.radius!;
      if (known.arcLength !== undefined) known.delta = known.arcLength / R;
      else if (known.chord !== undefined) known.delta = 2 * Math.asin(Math.min(1, known.chord / (2 * R)));
      else if (known.tangent !== undefined) known.delta = 2 * Math.atan(known.tangent / R);
      else if (known.external !== undefined) known.delta = 2 * Math.acos(R / (R + known.external));
      else if (known.middleOrdinate !== undefined) known.delta = 2 * Math.acos((R - known.middleOrdinate) / R);
      else break;
    } else if (!haveR() && haveD()) {
      const D = known.delta!;
      if (known.arcLength !== undefined) known.radius = known.arcLength / D;
      else if (known.chord !== undefined) known.radius = known.chord / (2 * Math.sin(D / 2));
      else if (known.tangent !== undefined) known.radius = known.tangent / Math.tan(D / 2);
      else if (known.external !== undefined) known.radius = known.external / (1 / Math.cos(D / 2) - 1);
      else if (known.middleOrdinate !== undefined) known.radius = known.middleOrdinate / (1 - Math.cos(D / 2));
      else break;
    } else {
      // Neither known. Try pairwise: chord+arcLength, chord+tangent, etc.
      // chord + arcLength: solve numerically.
      if (known.chord !== undefined && known.arcLength !== undefined) {
        // L = R*Δ, C = 2R sin(Δ/2). Eliminate R: C/L = sin(Δ/2)/(Δ/2).
        const ratio = known.chord / known.arcLength;
        if (ratio >= 1) { known.delta = 0; break; }
        // Solve sinc(Δ/2) = ratio for Δ in (0, 2π). Newton from 1 rad.
        let d = 1;
        for (let k = 0; k < 50; k++) {
          const x = d / 2;
          const f = Math.sin(x) / x - ratio;
          const fp = (Math.cos(x) * x - Math.sin(x)) / (2 * x * x);
          const step = f / fp;
          d -= step;
          if (Math.abs(step) < 1e-12) break;
        }
        known.delta = d;
        known.radius = known.arcLength / d;
      } else {
        break; // insufficient data
      }
    }
  }

  if (!haveR() || !haveD()) {
    throw new Error('solveCurve: insufficient parameters; provide any 2 of R, Δ, L, C, T, E, M, Da, Dc.');
  }

  const R = known.radius!;
  const D = known.delta!;
  const L = R * D;
  const C = 2 * R * Math.sin(D / 2);
  const T = R * Math.tan(D / 2);
  const E = R * (1 / Math.cos(D / 2) - 1);
  const M = R * (1 - Math.cos(D / 2));
  const Da = (100 / R) / RAD_PER_DEG;
  const Dc = (2 * Math.asin(50 / R)) / RAD_PER_DEG;

  return {
    radius: R,
    delta: D,
    arcLength: L,
    chord: C,
    tangent: T,
    external: E,
    middleOrdinate: M,
    degreeArc: Da,
    degreeChord: Dc,
    direction: known.direction,
  };
}

/** PI/PC/PT relationships: given PI station and curve, return PC and PT stations. */
export function curveStations(piStation: number, curve: { tangent: number; arcLength: number }): { pcStation: number; ptStation: number } {
  return {
    pcStation: piStation - curve.tangent,
    ptStation: piStation - curve.tangent + curve.arcLength,
  };
}

/** Clothoid (highway spiral) — Taylor-series approximation of x(L), y(L) with α=L²/(2RL_total).
 *  Inputs: L = length along spiral, R = radius at end, Ls = total spiral length.
 *  Outputs: tangent-offset coordinates from the TS, with x along entry tangent.
 *  Series accurate to ~µm-level for typical highway A values. */
export function spiralXY(L: number, R: number, Ls: number): { x: number; y: number; theta: number } {
  // θ(L) = L² / (2*R*Ls). Using A² = R*Ls.
  const theta = (L * L) / (2 * R * Ls);
  // Series:
  //   x = L * [1 - θ²/10 + θ⁴/216 - θ⁶/9360 + …]
  //   y = L * [θ/3 - θ³/42 + θ⁵/1320 - θ⁷/75600 + …]
  const t2 = theta * theta;
  const t4 = t2 * t2;
  const t6 = t4 * t2;
  const x = L * (1 - t2 / 10 + t4 / 216 - t6 / 9360);
  const y = L * (theta / 3 - (theta * t2) / 42 + (theta * t4) / 1320 - (theta * t6) / 75600);
  return { x, y, theta };
}

/** Vertical curve — equal-tangent parabola. */
export function vcurveElevAt(input: { pviStation: number; pviElev: number; length: number; gradeIn: number; gradeOut: number }, station: number): number {
  const { pviStation, pviElev, length, gradeIn, gradeOut } = input;
  const bvc = pviStation - length / 2;
  const evc = pviStation + length / 2;
  if (station <= bvc) return pviElev - gradeIn * (pviStation - station);
  if (station >= evc) return pviElev + gradeOut * (station - pviStation);
  const x = station - bvc;
  const a = (gradeOut - gradeIn) / (2 * length);
  const elevBvc = pviElev - gradeIn * (length / 2);
  return elevBvc + gradeIn * x + a * x * x;
}

/** Vertical curve high/low point station (relative to BVC). Returns null if grades are same sign. */
export function vcurveTurningPoint(input: { pviStation: number; length: number; gradeIn: number; gradeOut: number }): number | null {
  const { gradeIn, gradeOut, length, pviStation } = input;
  if (Math.sign(gradeIn) === Math.sign(gradeOut) || gradeIn === gradeOut) return null;
  const bvc = pviStation - length / 2;
  // dElev/dx = gradeIn + 2ax = 0  → x = -gradeIn / (2a) where a = (gradeOut - gradeIn) / (2*length).
  const a = (gradeOut - gradeIn) / (2 * length);
  const x = -gradeIn / (2 * a);
  if (x < 0 || x > length) return null;
  return bvc + x;
}

/** K-value for a vertical curve: K = L / |A| where A = grade change in percent. */
export function vcurveK(length: number, gradeIn: number, gradeOut: number): number {
  const A = Math.abs(gradeOut - gradeIn) * 100;
  if (A < EPS) return Infinity;
  return length / A;
}
