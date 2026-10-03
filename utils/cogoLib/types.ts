// Shared types for the cogoLib surveyor toolkit.
// All angles are in radians from north (azimuth) unless explicitly stated.
// Coordinates are project units (typically US survey feet) unless wrapped in a Geo type.

export interface Pt {
  northing: number;
  easting: number;
  elevation?: number;
}

export interface Geo {
  lat: number;   // decimal degrees
  lon: number;   // decimal degrees
  height?: number;
}

export interface Line2 {
  a: Pt;
  b: Pt;
}

export interface Ray2 {
  origin: Pt;
  azimuth: number; // radians from north
}

export interface Circle2 {
  center: Pt;
  radius: number;
}

export type CurveDirection = 'left' | 'right';

/**
 * Horizontal circular curve parameters.
 * Sign convention: radius is positive; curveDirection captures handedness.
 */
export interface CurveParams {
  radius?: number;       // R
  delta?: number;        // Δ central angle, radians
  arcLength?: number;    // L (arc def)
  chord?: number;        // C
  tangent?: number;      // T = R * tan(Δ/2)
  external?: number;     // E = R * (sec(Δ/2) - 1)
  middleOrdinate?: number; // M = R * (1 - cos(Δ/2))
  degreeArc?: number;    // Da: Δ when L = 100 (arc def)
  degreeChord?: number;  // Dc: 2*asin(50/R) (chord def)
  direction?: CurveDirection;
}

export interface VerticalCurveParams {
  pviStation: number;
  pviElev: number;
  length: number;       // total VC length
  gradeIn: number;      // decimal slope (e.g., 0.025 = +2.5%)
  gradeOut: number;     // decimal slope
}

export type IntersectSolution<T> = {
  count: 0 | 1 | 2;
  solutions: T[];
};

export const TWO_PI = Math.PI * 2;
export const HALF_PI = Math.PI / 2;
export const DEG_PER_RAD = 180 / Math.PI;
export const RAD_PER_DEG = Math.PI / 180;

export function normalizeAzimuth(rad: number): number {
  let a = rad % TWO_PI;
  if (a < 0) a += TWO_PI;
  return a;
}

export function approxEqual(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) <= eps;
}
