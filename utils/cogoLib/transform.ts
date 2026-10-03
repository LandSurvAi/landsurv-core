// 2D transformations: Helmert (4-param similarity), affine (6-param), and
// grid↔ground scale. Clean-room implementations following standard
// least-squares formulations (Wolf & Ghilani §11, §17).

import { Pt } from './types';

export interface PointPair { source: Pt; target: Pt }

export interface Helmert2D {
  /** Source-frame translation applied AFTER rotation+scale. */
  tE: number;
  tN: number;
  /** Uniform scale. */
  scale: number;
  /** Rotation in radians, positive = CCW in (E,N). */
  rotation: number;
  /** Apply transform to a source point. */
  apply: (p: Pt) => Pt;
  /** Per-pair residuals after fit. */
  residuals: { dE: number; dN: number; mag: number }[];
  rmse: number;
}

/** 2D Helmert (similarity) least-squares fit from ≥2 point pairs. */
export function helmert2D(pairs: PointPair[]): Helmert2D {
  if (pairs.length < 2) throw new Error('helmert2D: need ≥2 point pairs.');
  // Standard closed-form: parameters a, b, tE, tN such that
  //   E' = a*Es - b*Ns + tE
  //   N' = b*Es + a*Ns + tN
  // Centroid-shift approach for stability.
  const n = pairs.length;
  let sEs = 0, sNs = 0, sEt = 0, sNt = 0;
  for (const p of pairs) { sEs += p.source.easting; sNs += p.source.northing; sEt += p.target.easting; sNt += p.target.northing; }
  const cEs = sEs / n, cNs = sNs / n, cEt = sEt / n, cNt = sNt / n;

  let sxx = 0, syy = 0, sxX = 0, sxY = 0, syX = 0, syY = 0;
  for (const p of pairs) {
    const x = p.source.easting - cEs;
    const y = p.source.northing - cNs;
    const X = p.target.easting - cEt;
    const Y = p.target.northing - cNt;
    sxx += x * x; syy += y * y;
    sxX += x * X; sxY += x * Y;
    syX += y * X; syY += y * Y;
  }
  const denom = sxx + syy;
  if (denom < 1e-12) throw new Error('helmert2D: degenerate source points.');
  const a = (sxX + syY) / denom;
  const b = (sxY - syX) / denom;
  const scale = Math.hypot(a, b);
  const rotation = Math.atan2(b, a);
  const tE = cEt - (a * cEs - b * cNs);
  const tN = cNt - (b * cEs + a * cNs);

  const apply = (p: Pt): Pt => ({
    easting:  a * p.easting - b * p.northing + tE,
    northing: b * p.easting + a * p.northing + tN,
  });

  const residuals = pairs.map(pp => {
    const out = apply(pp.source);
    const dE = out.easting - pp.target.easting;
    const dN = out.northing - pp.target.northing;
    return { dE, dN, mag: Math.hypot(dE, dN) };
  });
  const rmse = Math.sqrt(residuals.reduce((s, r) => s + r.mag * r.mag, 0) / residuals.length);

  return { tE, tN, scale, rotation, apply, residuals, rmse };
}

export interface Affine2D {
  /** 2x3 matrix [[a, b, tE], [c, d, tN]]. */
  matrix: [[number, number, number], [number, number, number]];
  apply: (p: Pt) => Pt;
  residuals: { dE: number; dN: number; mag: number }[];
  rmse: number;
}

/** 6-parameter affine least-squares fit from ≥3 point pairs. */
export function affine2D(pairs: PointPair[]): Affine2D {
  if (pairs.length < 3) throw new Error('affine2D: need ≥3 point pairs.');
  // Solve E' = a*Es + b*Ns + tE  and  N' = c*Es + d*Ns + tN  independently
  // via normal equations (3 unknowns each).
  const solve3 = (rows: { x: number; y: number; rhs: number }[]) => {
    let s_xx = 0, s_xy = 0, s_x = 0, s_yy = 0, s_y = 0, s_1 = 0;
    let s_xR = 0, s_yR = 0, s_R = 0;
    for (const r of rows) {
      s_xx += r.x * r.x; s_xy += r.x * r.y; s_x += r.x;
      s_yy += r.y * r.y; s_y += r.y; s_1 += 1;
      s_xR += r.x * r.rhs; s_yR += r.y * r.rhs; s_R += r.rhs;
    }
    // 3x3 normal matrix:
    // [sxx  sxy  sx][a]   [sxR]
    // [sxy  syy  sy][b] = [syR]
    // [sx   sy   s1][t]   [sR ]
    const M = [
      [s_xx, s_xy, s_x],
      [s_xy, s_yy, s_y],
      [s_x,  s_y,  s_1],
    ];
    const rhs = [s_xR, s_yR, s_R];
    return solve3x3(M, rhs);
  };
  const eRows = pairs.map(p => ({ x: p.source.easting, y: p.source.northing, rhs: p.target.easting }));
  const nRows = pairs.map(p => ({ x: p.source.easting, y: p.source.northing, rhs: p.target.northing }));
  const [a, b, tE] = solve3(eRows);
  const [c, d, tN] = solve3(nRows);
  const matrix: [[number, number, number], [number, number, number]] = [[a, b, tE], [c, d, tN]];
  const apply = (p: Pt): Pt => ({
    easting:  a * p.easting + b * p.northing + tE,
    northing: c * p.easting + d * p.northing + tN,
  });
  const residuals = pairs.map(pp => {
    const out = apply(pp.source);
    const dE = out.easting - pp.target.easting;
    const dN = out.northing - pp.target.northing;
    return { dE, dN, mag: Math.hypot(dE, dN) };
  });
  const rmse = Math.sqrt(residuals.reduce((s, r) => s + r.mag * r.mag, 0) / residuals.length);
  return { matrix, apply, residuals, rmse };
}

/** Solve 3x3 Ax=b via Gaussian elimination. */
function solve3x3(A: number[][], b: number[]): [number, number, number] {
  const M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < 3; i++) {
    let piv = i;
    for (let k = i + 1; k < 3; k++) if (Math.abs(M[k][i]) > Math.abs(M[piv][i])) piv = k;
    if (piv !== i) [M[i], M[piv]] = [M[piv], M[i]];
    const div = M[i][i];
    if (Math.abs(div) < 1e-15) throw new Error('solve3x3: singular matrix.');
    for (let j = i; j < 4; j++) M[i][j] /= div;
    for (let k = 0; k < 3; k++) {
      if (k === i) continue;
      const f = M[k][i];
      for (let j = i; j < 4; j++) M[k][j] -= f * M[i][j];
    }
  }
  return [M[0][3], M[1][3], M[2][3]];
}

/** Best-fit line through points (total least squares). Returns azimuth (rad) and a point on the line. */
export function bestFitLine(points: Pt[]): { azimuth: number; through: Pt; rmse: number } {
  if (points.length < 2) throw new Error('bestFitLine: need ≥2 points.');
  let sE = 0, sN = 0;
  for (const p of points) { sE += p.easting; sN += p.northing; }
  const cE = sE / points.length, cN = sN / points.length;
  let sEE = 0, sNN = 0, sEN = 0;
  for (const p of points) {
    const dE = p.easting - cE, dN = p.northing - cN;
    sEE += dE * dE; sNN += dN * dN; sEN += dE * dN;
  }
  // 2x2 covariance eigenvector for the dominant direction.
  const trace = sEE + sNN;
  const det = sEE * sNN - sEN * sEN;
  const half = trace / 2;
  const lambda = half + Math.sqrt(Math.max(0, half * half - det));
  // Principal direction (dE, dN):
  let vE: number, vN: number;
  if (Math.abs(sEN) > 1e-12) {
    vE = lambda - sNN; vN = sEN;
  } else {
    if (sEE >= sNN) { vE = 1; vN = 0; }
    else { vE = 0; vN = 1; }
  }
  const len = Math.hypot(vE, vN) || 1;
  vE /= len; vN /= len;
  const azimuth = Math.atan2(vE, vN);
  // RMSE perpendicular distance:
  let ss = 0;
  for (const p of points) {
    const dE = p.easting - cE, dN = p.northing - cN;
    const perp = -vN * dE + vE * dN; // perp magnitude
    ss += perp * perp;
  }
  const rmse = Math.sqrt(ss / points.length);
  return { azimuth: azimuth < 0 ? azimuth + 2 * Math.PI : azimuth, through: { easting: cE, northing: cN }, rmse };
}

/** Best-fit circle (Kasa method — algebraic LSQ). Robust for well-distributed points. */
export function bestFitCircle(points: Pt[]): { center: Pt; radius: number; rmse: number } {
  if (points.length < 3) throw new Error('bestFitCircle: need ≥3 points.');
  // Solve for D, E, F in: x² + y² + D·x + E·y + F = 0.
  // Then center = (-D/2, -E/2), radius = sqrt(D²/4 + E²/4 - F).
  // Linear system from points.
  const rows = points.map(p => ({ x: p.easting, y: p.northing, rhs: -(p.easting * p.easting + p.northing * p.northing) }));
  let sxx = 0, sxy = 0, sx = 0, syy = 0, sy = 0, s1 = 0, sxR = 0, syR = 0, sR = 0;
  for (const r of rows) {
    sxx += r.x * r.x; sxy += r.x * r.y; sx += r.x;
    syy += r.y * r.y; sy += r.y; s1 += 1;
    sxR += r.x * r.rhs; syR += r.y * r.rhs; sR += r.rhs;
  }
  const M = [
    [sxx, sxy, sx],
    [sxy, syy, sy],
    [sx,  sy,  s1],
  ];
  const [D, E, F] = solve3x3(M, [sxR, syR, sR]);
  const cE = -D / 2, cN = -E / 2;
  const radius = Math.sqrt(Math.max(0, cE * cE + cN * cN - F));
  let ss = 0;
  for (const p of points) {
    const r = Math.hypot(p.easting - cE, p.northing - cN);
    ss += (r - radius) * (r - radius);
  }
  const rmse = Math.sqrt(ss / points.length);
  return { center: { easting: cE, northing: cN }, radius, rmse };
}

/** Surface scale factor between grid and ground at a given elevation. */
export function gridGroundScale(opts: { combinedScaleFactor: number }): { groundFromGrid: number; gridFromGround: number } {
  return {
    groundFromGrid: 1 / opts.combinedScaleFactor,
    gridFromGround: opts.combinedScaleFactor,
  };
}
