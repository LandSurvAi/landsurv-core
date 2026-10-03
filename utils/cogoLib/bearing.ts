// Bearing / azimuth / DMS helpers — clean-room implementation.
// Conventions: azimuth is in radians, measured clockwise from north (matches
// the rest of the codebase). DMS strings use the surveyor quadrant form
// "N 12°34'56\" E".

import { DEG_PER_RAD, RAD_PER_DEG, TWO_PI, normalizeAzimuth } from './types';

/** Convert decimal degrees to {deg, min, sec} with carry-safe rounding. */
export function ddToDms(dd: number, secondsPrecision = 0): { deg: number; min: number; sec: number; sign: 1 | -1 } {
  const sign: 1 | -1 = dd < 0 ? -1 : 1;
  const abs = Math.abs(dd);
  let deg = Math.floor(abs);
  const minFull = (abs - deg) * 60;
  let min = Math.floor(minFull);
  const secScale = Math.pow(10, secondsPrecision);
  let sec = Math.round((minFull - min) * 60 * secScale) / secScale;
  if (sec >= 60) { sec = 0; min += 1; }
  if (min >= 60) { min = 0; deg += 1; }
  return { deg, min, sec, sign };
}

/** Convert {deg, min, sec} (signed via separate flag or negative deg) to decimal degrees. */
export function dmsToDd(deg: number, min: number, sec: number): number {
  const sign = deg < 0 || Object.is(deg, -0) ? -1 : 1;
  return sign * (Math.abs(deg) + Math.abs(min) / 60 + Math.abs(sec) / 3600);
}

/** Format an azimuth (radians) as a quadrant DMS string with N/E/S/W. */
export function azimuthToQuadrant(rad: number, secondsPrecision = 0): string {
  const az = normalizeAzimuth(rad);
  const deg = az * DEG_PER_RAD;
  let q1: 'N' | 'S';
  let q2: 'E' | 'W';
  let angle: number;
  if (deg < 90)        { q1 = 'N'; q2 = 'E'; angle = deg; }
  else if (deg < 180)  { q1 = 'S'; q2 = 'E'; angle = 180 - deg; }
  else if (deg < 270)  { q1 = 'S'; q2 = 'W'; angle = deg - 180; }
  else                 { q1 = 'N'; q2 = 'W'; angle = 360 - deg; }
  const { deg: d, min: m, sec: s } = ddToDms(angle, secondsPrecision);
  const secStr = secondsPrecision > 0
    ? s.toFixed(secondsPrecision).padStart(3 + secondsPrecision, '0')
    : String(Math.round(s)).padStart(2, '0');
  return `${q1} ${d}°${String(m).padStart(2, '0')}'${secStr}" ${q2}`;
}

/** Format an azimuth (radians) as a 0–360 azimuth DMS string. */
export function azimuthToDms(rad: number, secondsPrecision = 0): string {
  const az = normalizeAzimuth(rad);
  const { deg, min, sec } = ddToDms(az * DEG_PER_RAD, secondsPrecision);
  const secStr = secondsPrecision > 0
    ? sec.toFixed(secondsPrecision).padStart(3 + secondsPrecision, '0')
    : String(Math.round(sec)).padStart(2, '0');
  return `${deg}°${String(min).padStart(2, '0')}'${secStr}"`;
}

/** Reverse an azimuth (forward ↔ back). */
export function backAzimuth(rad: number): number {
  return normalizeAzimuth(rad + Math.PI);
}

/** Smallest signed delta from a to b, in (-π, π]. Positive = clockwise. */
export function deltaAzimuth(a: number, b: number): number {
  let d = (b - a) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d <= -Math.PI) d += TWO_PI;
  return d;
}

/** Parse generic azimuth string: accepts "N12°34'56\"E", "12°34'56\"", "123.456", "12d34m56s". */
export function parseAzimuthFlexible(input: string): number | null {
  if (!input) return null;
  // Strip DMS unit letters only when they immediately follow a digit (e.g. "30D15M00S" → "30 15 00 ").
  // Stripping them as a character class would also eat the cardinal "S" indicator on south bearings.
  const dmsStripped = input.toUpperCase().replace(/(\d)\s*[DMS]/g, '$1 ');
  const s = dmsStripped.replace(/[°"'″′“”‘’]/g, ' ').replace(/\s+/g, ' ').trim();
  const tokens = s.split(' ').filter(Boolean);
  if (tokens.length === 0) return null;

  // Detect quadrant form: starts with N/S and ends with E/W.
  const isQuad = (tokens[0] === 'N' || tokens[0] === 'S') && (tokens[tokens.length - 1] === 'E' || tokens[tokens.length - 1] === 'W');
  if (isQuad) {
    const q1 = tokens[0];
    const q2 = tokens[tokens.length - 1];
    const nums = tokens.slice(1, -1).map(parseFloat).filter(n => !isNaN(n));
    if (nums.length === 0) return null;
    const dd = (nums[0] || 0) + (nums[1] || 0) / 60 + (nums[2] || 0) / 3600;
    const rad = dd * RAD_PER_DEG;
    if (q1 === 'N' && q2 === 'E') return rad;
    if (q1 === 'S' && q2 === 'E') return Math.PI - rad;
    if (q1 === 'S' && q2 === 'W') return Math.PI + rad;
    if (q1 === 'N' && q2 === 'W') return TWO_PI - rad;
    return null;
  }

  // Numeric DMS or decimal-degree azimuth.
  const nums = tokens.map(parseFloat).filter(n => !isNaN(n));
  if (nums.length === 0) return null;
  const dd = (nums[0] || 0) + (nums[1] || 0) / 60 + (nums[2] || 0) / 3600;
  return normalizeAzimuth(dd * RAD_PER_DEG);
}
