// cornerAlign.ts
// Rigid-body (2D similarity WITHOUT scale) fit used by the "align deed silhouette
// to found points" canvas tool. The user pairs deed corners with found monuments;
// this solves the translation + rotation that best seats the deed on those points.
//
// The solve is expressed in the exact frame the BoundaryFile overlay renderer uses:
//
//     world = R(θ) · (u − POB) + POB + T
//
// so the returned values drop straight into translationE / translationN /
// rotationDeg on the BoundaryFile. Deed shape is never distorted — no scale term
// is solved for, so every bearing and distance in the traverse is preserved.

export interface CornerAlignPair {
  /** Un-baked (COGO-local) deed vertex easting. */
  srcE: number;
  /** Un-baked (COGO-local) deed vertex northing. */
  srcN: number;
  /** Found survey point easting the corner is pinned to. */
  targetE: number;
  /** Found survey point northing the corner is pinned to. */
  targetN: number;
}

export interface CornerAlignFit {
  translationE: number;
  translationN: number;
  rotationDeg: number;
  /** RMS of the pair residuals, in project units. */
  rmse: number;
  /** Largest single pair residual, in project units. */
  maxResidual: number;
  /** Per-pair residual magnitudes, in the order the pairs were supplied. */
  residuals: number[];
}

/**
 * Solve the rigid transform that seats the paired deed corners on their found points.
 *
 * @param pob            Rotation anchor (the boundary's point of beginning, world coords).
 * @param pairs          Corner ↔ found-point pairs. At least one is required.
 * @param fallbackRotDeg Rotation to keep when it cannot be estimated (a single pair, or
 *                       degenerate/coincident corners). A single pair yields a pure
 *                       translation at this rotation.
 */
export function solveRigidCornerAlign(
  pob: { easting: number; northing: number },
  pairs: CornerAlignPair[],
  fallbackRotDeg: number = 0,
): CornerAlignFit | null {
  const n = pairs.length;
  if (n === 0) return null;

  // Work relative to the rotation anchor so the solved translation is the
  // renderer's post-rotation offset rather than an absolute coordinate.
  const a = pairs.map(p => ({ x: p.srcE - pob.easting, y: p.srcN - pob.northing }));
  const b = pairs.map(p => ({ x: p.targetE - pob.easting, y: p.targetN - pob.northing }));

  const aBar = { x: a.reduce((s, v) => s + v.x, 0) / n, y: a.reduce((s, v) => s + v.y, 0) / n };
  const bBar = { x: b.reduce((s, v) => s + v.x, 0) / n, y: b.reduce((s, v) => s + v.y, 0) / n };

  let thetaRad: number;
  if (n === 1) {
    thetaRad = (fallbackRotDeg * Math.PI) / 180;
  } else {
    // Least-squares rotation: θ = atan2(Σ a×b, Σ a·b) on centred vectors.
    let sCross = 0;
    let sDot = 0;
    for (let i = 0; i < n; i++) {
      const ax = a[i].x - aBar.x;
      const ay = a[i].y - aBar.y;
      const bx = b[i].x - bBar.x;
      const by = b[i].y - bBar.y;
      sCross += ax * by - ay * bx;
      sDot += ax * bx + ay * by;
    }
    // All corners coincident (or all found points coincident) → rotation is
    // indeterminate; keep what the boundary already had.
    thetaRad = (Math.abs(sCross) < 1e-12 && Math.abs(sDot) < 1e-12)
      ? (fallbackRotDeg * Math.PI) / 180
      : Math.atan2(sCross, sDot);
  }

  const cosT = Math.cos(thetaRad);
  const sinT = Math.sin(thetaRad);
  const translationE = bBar.x - (aBar.x * cosT - aBar.y * sinT);
  const translationN = bBar.y - (aBar.x * sinT + aBar.y * cosT);

  const residuals: number[] = [];
  let ss = 0;
  let maxResidual = 0;
  for (let i = 0; i < n; i++) {
    const fx = a[i].x * cosT - a[i].y * sinT + translationE;
    const fy = a[i].x * sinT + a[i].y * cosT + translationN;
    const mag = Math.hypot(fx - b[i].x, fy - b[i].y);
    residuals.push(mag);
    ss += mag * mag;
    if (mag > maxResidual) maxResidual = mag;
  }

  return {
    translationE,
    translationN,
    rotationDeg: (thetaRad * 180) / Math.PI,
    rmse: Math.sqrt(ss / n),
    maxResidual,
    residuals,
  };
}

/** Apply a solved fit to an un-baked deed vertex, matching the overlay renderer. */
export function applyRigidCornerAlign(
  pob: { easting: number; northing: number },
  fit: Pick<CornerAlignFit, 'translationE' | 'translationN' | 'rotationDeg'>,
  vertex: { easting: number; northing: number },
): { easting: number; northing: number } {
  const rad = (fit.rotationDeg * Math.PI) / 180;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);
  const dx = vertex.easting - pob.easting;
  const dy = vertex.northing - pob.northing;
  return {
    easting: dx * cosR - dy * sinR + pob.easting + fit.translationE,
    northing: dx * sinR + dy * cosR + pob.northing + fit.translationN,
  };
}
