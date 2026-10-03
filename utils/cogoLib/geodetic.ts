// Geodetic conversions on the WGS-84 ellipsoid.
// Vincenty inverse/direct (clean-room from T. Vincenty, 1975) — accurate to ~mm
// for distances up to ~20,000 km. No external dependency.

import { Geo, normalizeAzimuth, RAD_PER_DEG, DEG_PER_RAD } from './types';

const WGS84 = { a: 6378137.0, f: 1 / 298.257223563 };
const FOOT_PER_METER = 3.28083333333; // US survey foot (1200/3937).

export interface VincentyResult {
  distanceMeters: number;
  initialAzimuth: number; // radians from north
  finalAzimuth: number;
  iterations: number;
}

/** Vincenty inverse: distance + initial/final azimuth between two geodetic points. */
export function vincentyInverse(p1: Geo, p2: Geo): VincentyResult {
  const { a, f } = WGS84;
  const b = a * (1 - f);
  const phi1 = p1.lat * RAD_PER_DEG;
  const phi2 = p2.lat * RAD_PER_DEG;
  const L = (p2.lon - p1.lon) * RAD_PER_DEG;
  const U1 = Math.atan((1 - f) * Math.tan(phi1));
  const U2 = Math.atan((1 - f) * Math.tan(phi2));
  const sinU1 = Math.sin(U1), cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);
  let lambda = L, lambdaP, iter = 0;
  let cosSqAlpha = 0, sinSigma = 0, cos2SigmaM = 0, cosSigma = 0, sigma = 0, sinAlpha = 0, sinLambda = 0, cosLambda = 0;
  do {
    sinLambda = Math.sin(lambda);
    cosLambda = Math.cos(lambda);
    sinSigma = Math.sqrt((cosU2 * sinLambda) ** 2 + (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) ** 2);
    if (sinSigma === 0) {
      return { distanceMeters: 0, initialAzimuth: 0, finalAzimuth: 0, iterations: iter };
    }
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cosSqAlpha === 0 ? 0 : cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha;
    const C = (f / 16) * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
    lambdaP = lambda;
    lambda = L + (1 - C) * f * sinAlpha *
      (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
    iter++;
  } while (Math.abs(lambda - lambdaP) > 1e-12 && iter < 100);

  const uSq = cosSqAlpha * (a * a - b * b) / (b * b);
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma = B * sinSigma * (cos2SigmaM + (B / 4) *
    (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
     (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
  const distance = b * A * (sigma - deltaSigma);
  const az1 = Math.atan2(cosU2 * sinLambda, cosU1 * sinU2 - sinU1 * cosU2 * cosLambda);
  const az2 = Math.atan2(cosU1 * sinLambda, -sinU1 * cosU2 + cosU1 * sinU2 * cosLambda);

  return {
    distanceMeters: distance,
    initialAzimuth: normalizeAzimuth(az1),
    finalAzimuth: normalizeAzimuth(az2),
    iterations: iter,
  };
}

/** Vincenty direct: destination point + final azimuth given start, azimuth, distance. */
export function vincentyDirect(start: Geo, azimuth: number, distanceMeters: number): { destination: Geo; finalAzimuth: number } {
  const { a, f } = WGS84;
  const b = a * (1 - f);
  const phi1 = start.lat * RAD_PER_DEG;
  const lon1 = start.lon * RAD_PER_DEG;
  const alpha1 = azimuth;

  const sinAlpha1 = Math.sin(alpha1), cosAlpha1 = Math.cos(alpha1);
  const tanU1 = (1 - f) * Math.tan(phi1);
  const cosU1 = 1 / Math.sqrt(1 + tanU1 * tanU1);
  const sinU1 = tanU1 * cosU1;
  const sigma1 = Math.atan2(tanU1, cosAlpha1);
  const sinAlpha = cosU1 * sinAlpha1;
  const cosSqAlpha = 1 - sinAlpha * sinAlpha;
  const uSq = cosSqAlpha * (a * a - b * b) / (b * b);
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));

  let sigma = distanceMeters / (b * A);
  let sigmaP, sin2SigmaM, cos2SigmaM, sinSigma, cosSigma;
  let iter = 0;
  do {
    cos2SigmaM = Math.cos(2 * sigma1 + sigma);
    sinSigma = Math.sin(sigma);
    cosSigma = Math.cos(sigma);
    sin2SigmaM = Math.sin(2 * sigma1 + sigma);
    const deltaSigma = B * sinSigma * (cos2SigmaM + (B / 4) *
      (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
       (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
    sigmaP = sigma;
    sigma = distanceMeters / (b * A) + deltaSigma;
    iter++;
  } while (Math.abs(sigma - sigmaP) > 1e-12 && iter < 100);

  const tmp = sinU1 * sinSigma! - cosU1 * cosSigma! * cosAlpha1;
  const phi2 = Math.atan2(
    sinU1 * cosSigma! + cosU1 * sinSigma! * cosAlpha1,
    (1 - f) * Math.sqrt(sinAlpha * sinAlpha + tmp * tmp),
  );
  const lambda = Math.atan2(sinSigma! * sinAlpha1, cosU1 * cosSigma! - sinU1 * sinSigma! * cosAlpha1);
  const C = (f / 16) * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
  const L = lambda - (1 - C) * f * sinAlpha *
    (sigma + C * sinSigma! * (cos2SigmaM! + C * cosSigma! * (-1 + 2 * cos2SigmaM! * cos2SigmaM!)));
  const lon2 = lon1 + L;
  const alpha2 = Math.atan2(sinAlpha, -tmp);
  return {
    destination: { lat: phi2 * DEG_PER_RAD, lon: lon2 * DEG_PER_RAD },
    finalAzimuth: normalizeAzimuth(alpha2),
  };
}

/** Convert WGS-84 distance (meters) to project units. Default project unit is US survey feet. */
export function metersToFeet(m: number): number { return m * FOOT_PER_METER; }
export function feetToMeters(ft: number): number { return ft / FOOT_PER_METER; }
