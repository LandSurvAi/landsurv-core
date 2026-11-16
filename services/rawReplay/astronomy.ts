/**
 * Raw Replay — low-precision positional astronomy.
 *
 * The 3D sky uses these routines to put the sun, moon, planets and stars in
 * their real positions for the job date/time and the GNSS latitude/longitude
 * recorded in the raw file. Accuracy is a few arcminutes for the sun, well
 * under a degree for the moon and planets — far more than a survey review
 * needs, and it avoids shipping a multi-megabyte ephemeris.
 *
 * Everything here is pure and browser-independent so it can be unit tested.
 */
import type { RawSurvey } from './types';

export interface EquatorialCoord {
  raDeg: number;
  decDeg: number;
}

export interface HorizontalCoord {
  altitudeDeg: number;
  azimuthDeg: number;
}

export interface MoonPosition extends EquatorialCoord {
  eclipticLonDeg: number;
  eclipticLatDeg: number;
  /** 0 = new, 0.5 = first/last quarter, 1 = full. */
  illumination: number;
  waxing: boolean;
}

export type PlanetId = 'mercury' | 'venus' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune';

export interface PlanetPosition extends EquatorialCoord {
  id: PlanetId;
}

export interface SkyContext {
  dateMs: number;
  latitudeDeg: number;
  longitudeDeg: number;
  /** No GNSS/base latitude/longitude in the file; a central-US fallback was used. */
  approximateLocation: boolean;
  /** No recorded field date/time; the current clock was used. */
  approximateTime: boolean;
}

export interface BrightStar {
  name: string;
  raHours: number;
  decDeg: number;
  magnitude: number;
}

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export const normalizeDegrees = (value: number): number => ((value % 360) + 360) % 360;

const sinDeg = (value: number) => Math.sin(value * DEG);
const cosDeg = (value: number) => Math.cos(value * DEG);
const asinDeg = (value: number) => Math.asin(Math.min(1, Math.max(-1, value))) * RAD;
const atan2Deg = (y: number, x: number) => Math.atan2(y, x) * RAD;

export const julianDate = (dateMs: number): number => dateMs / 86400000 + 2440587.5;

export const centuriesSinceJ2000 = (dateMs: number): number => (julianDate(dateMs) - 2451545.0) / 36525;

/** Mean obliquity of the ecliptic (degrees). */
export const obliquityDeg = (T: number): number => 23.439291 - 0.0130042 * T - 1.64e-7 * T * T + 5.04e-7 * T * T * T;

/** Greenwich mean sidereal time, in degrees. */
export const greenwichSiderealTimeDeg = (dateMs: number): number => {
  const d = julianDate(dateMs) - 2451545.0;
  const T = d / 36525;
  return normalizeDegrees(
    280.46061837
    + 360.98564736629 * d
    + 0.000387933 * T * T
    - (T * T * T) / 38710000,
  );
};

/** Local sidereal time, in degrees, for an east-positive longitude. */
export const localSiderealTimeDeg = (dateMs: number, longitudeDeg: number): number =>
  normalizeDegrees(greenwichSiderealTimeDeg(dateMs) + longitudeDeg);

/** Ecliptic longitude/latitude to equatorial right ascension/declination. */
export const eclipticToEquatorial = (
  lonDeg: number,
  latDeg: number,
  T: number,
): EquatorialCoord => {
  const eps = obliquityDeg(T) * DEG;
  const lambda = lonDeg * DEG;
  const beta = latDeg * DEG;
  const ra = atan2Deg(
    Math.sin(lambda) * Math.cos(eps) - Math.tan(beta) * Math.sin(eps),
    Math.cos(lambda),
  );
  const dec = asinDeg(
    Math.sin(beta) * Math.cos(eps)
    + Math.cos(beta) * Math.sin(eps) * Math.sin(lambda),
  );
  return { raDeg: normalizeDegrees(ra), decDeg: dec };
};

/** Right ascension/declination to altitude/azimuth (azimuth from north, clockwise). */
export const equatorialToHorizontal = (
  raDeg: number,
  decDeg: number,
  latitudeDeg: number,
  lstDeg: number,
): HorizontalCoord => {
  const hourAngle = (lstDeg - raDeg) * DEG;
  const dec = decDeg * DEG;
  const lat = latitudeDeg * DEG;
  const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle);
  const altitude = asinDeg(sinAlt);
  const east = -Math.cos(dec) * Math.sin(hourAngle);
  const north = Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.sin(lat) * Math.cos(hourAngle);
  const azimuth = normalizeDegrees(atan2Deg(east, north));
  return { altitudeDeg: altitude, azimuthDeg: azimuth };
};

export const sunEquatorial = (dateMs: number): EquatorialCoord & { eclipticLonDeg: number } => {
  const T = centuriesSinceJ2000(dateMs);
  const L0 = normalizeDegrees(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
  const meanAnomaly = normalizeDegrees(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
  const equationOfCenter =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * sinDeg(meanAnomaly)
    + (0.019993 - 0.000101 * T) * sinDeg(2 * meanAnomaly)
    + 0.000289 * sinDeg(3 * meanAnomaly);
  const omega = 125.04 - 1934.136 * T;
  const lambda = normalizeDegrees(
    L0 + equationOfCenter - 0.00569 - 0.00478 * sinDeg(omega),
  );
  const coord = eclipticToEquatorial(lambda, 0, T);
  return { ...coord, eclipticLonDeg: lambda };
};

const MOON_LONGITUDE_TERMS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [6288774, 0, 0, 1, 0],
  [1274027, 2, 0, -1, 0],
  [658314, 2, 0, 0, 0],
  [213618, 0, 0, 2, 0],
  [-185116, 0, 1, 0, 0],
  [-114332, 0, 0, 0, 2],
  [58793, 2, 0, -2, 0],
  [57066, 2, -1, -1, 0],
  [53322, 2, 0, 1, 0],
  [45758, 2, -1, 0, 0],
  [-40923, 0, 1, -1, 0],
  [-34720, 1, 0, 0, 0],
  [-30383, 0, 1, 1, 0],
  [15327, 2, 0, 0, -2],
  [-12528, 0, 0, 1, 2],
  [10980, 0, 0, 1, -2],
  [10675, 4, 0, -1, 0],
  [10034, 0, 0, 3, 0],
  [8548, 4, 0, -2, 0],
  [-7888, 2, 1, -1, 0],
  [-6766, 2, 1, 0, 0],
  [-5163, 1, 0, -1, 0],
  [4987, 1, 1, 0, 0],
  [4036, 2, -1, 1, 0],
  [3994, 2, 0, 2, 0],
  [3861, 4, 0, 0, 0],
  [3665, 2, 0, -3, 0],
  [-2689, 0, 1, -2, 0],
  [-2602, 2, 0, -1, 2],
  [2390, 2, -1, -2, 0],
  [-2348, 1, 0, 1, 0],
  [2236, 2, -2, 0, 0],
  [-2120, 0, 1, 2, 0],
  [-2069, 0, 2, 0, 0],
  [2048, 2, -2, -1, 0],
  [-1773, 2, 0, 1, -2],
  [-1595, 2, 0, 0, 2],
  [1215, 4, -1, -1, 0],
  [-1110, 0, 0, 2, 2],
];

const MOON_LATITUDE_TERMS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [5128122, 0, 0, 0, 1],
  [280602, 0, 0, 1, 1],
  [277693, 0, 0, 1, -1],
  [173237, 2, 0, 0, -1],
  [55413, 2, 0, -1, 1],
  [46271, 2, 0, -1, -1],
  [32573, 2, 0, 0, 1],
  [17198, 0, 0, 2, 1],
  [9266, 2, 0, 1, -1],
  [8822, 0, 0, 2, -1],
  [8216, 2, -1, 0, -1],
  [4324, 2, 0, -2, -1],
  [4200, 2, 0, 1, 1],
];

export const moonPosition = (dateMs: number): MoonPosition => {
  const T = centuriesSinceJ2000(dateMs);
  const Lp = normalizeDegrees(
    218.3164477 + 481267.88123421 * T - 0.0015786 * T * T + (T ** 3) / 538841 - (T ** 4) / 65194000,
  );
  const D = normalizeDegrees(
    297.8501921 + 445267.1114034 * T - 0.0018819 * T * T + (T ** 3) / 545868 - (T ** 4) / 113065000,
  );
  const M = normalizeDegrees(
    357.5291092 + 35999.0502909 * T - 0.0001536 * T * T + (T ** 3) / 24490000,
  );
  const Mp = normalizeDegrees(
    134.9633964 + 477198.8675055 * T + 0.0087414 * T * T + (T ** 3) / 69699 - (T ** 4) / 14712000,
  );
  const F = normalizeDegrees(
    93.272095 + 483202.0175233 * T - 0.0036539 * T * T - (T ** 3) / 3526000 + (T ** 4) / 863310000,
  );

  let sumL = 0;
  for (const [coefficient, d, m, mp, f] of MOON_LONGITUDE_TERMS) {
    sumL += coefficient * sinDeg(D * d + M * m + Mp * mp + F * f);
  }
  let sumB = 0;
  for (const [coefficient, d, m, mp, f] of MOON_LATITUDE_TERMS) {
    sumB += coefficient * sinDeg(D * d + M * m + Mp * mp + F * f);
  }

  const lambda = normalizeDegrees(Lp + sumL / 1e6);
  const beta = sumB / 1e6;
  const coord = eclipticToEquatorial(lambda, beta, T);

  const sunLambda = sunEquatorial(dateMs).eclipticLonDeg;
  const separation = Math.acos(
    Math.min(1, Math.max(-1, cosDeg(beta) * cosDeg(lambda - sunLambda))),
  ) * RAD;
  const phaseAngle = normalizeDegrees(lambda - sunLambda);

  return {
    ...coord,
    eclipticLonDeg: lambda,
    eclipticLatDeg: beta,
    illumination: (1 - Math.cos(separation * DEG)) / 2,
    waxing: phaseAngle > 0 && phaseAngle < 180,
  };
};

interface PlanetElements {
  id: PlanetId;
  label: string;
  color: string;
  /** Relative display size; not the true angular diameter. */
  displaySize: number;
  a: number; e: number; i: number; L: number; peri: number; node: number;
  da: number; de: number; di: number; dL: number; dperi: number; dnode: number;
}

/** JPL approximate orbital elements (J2000) and per-century rates. */
const PLANETS: ReadonlyArray<PlanetElements> = [
  {
    id: 'mercury', label: 'Mercury', color: '#d9cbb4', displaySize: 0.36,
    a: 0.38709927, e: 0.20563593, i: 7.00497902, L: 252.2503235, peri: 77.45779628, node: 48.33076593,
    da: 0.00000037, de: 0.00001906, di: -0.00594749, dL: 149472.67411175, dperi: 0.16047689, dnode: -0.12534081,
  },
  {
    id: 'venus', label: 'Venus', color: '#fff3c4', displaySize: 0.48,
    a: 0.72333566, e: 0.00677672, i: 3.39467605, L: 181.9790995, peri: 131.60246718, node: 76.67984255,
    da: 0.0000039, de: -0.00004107, di: -0.0007889, dL: 58517.81538729, dperi: 0.00268329, dnode: -0.27769418,
  },
  {
    id: 'mars', label: 'Mars', color: '#ff7a59', displaySize: 0.42,
    a: 1.52371034, e: 0.0933941, i: 1.84969142, L: -4.55343205, peri: -23.94362959, node: 49.55953891,
    da: 0.00001847, de: 0.00007882, di: -0.00813131, dL: 19140.30268499, dperi: 0.44441088, dnode: -0.29257343,
  },
  {
    id: 'jupiter', label: 'Jupiter', color: '#f0c48a', displaySize: 0.72,
    a: 5.202887, e: 0.04838624, i: 1.30439695, L: 34.39644051, peri: 14.72847983, node: 100.47390909,
    da: -0.00011607, de: -0.00013253, di: -0.00183714, dL: 3034.74612775, dperi: 0.21252668, dnode: 0.20469106,
  },
  {
    id: 'saturn', label: 'Saturn', color: '#f5d98b', displaySize: 0.64,
    a: 9.53667594, e: 0.05386179, i: 2.48599187, L: 49.95424423, peri: 92.59887831, node: 113.66242448,
    da: -0.0012506, de: -0.00050991, di: 0.00193609, dL: 1222.49362201, dperi: -0.41897216, dnode: -0.28867794,
  },
  {
    id: 'uranus', label: 'Uranus', color: '#9be7ff', displaySize: 0.4,
    a: 19.18916464, e: 0.04725744, i: 0.77263783, L: 313.23810451, peri: 170.9542763, node: 74.01692503,
    da: -0.00196176, de: -0.00004397, di: -0.00242939, dL: 428.48202785, dperi: 0.40805281, dnode: 0.04240589,
  },
  {
    id: 'neptune', label: 'Neptune', color: '#6f9bff', displaySize: 0.38,
    a: 30.06992276, e: 0.00859048, i: 1.77004347, L: -55.12002969, peri: 44.96476227, node: 131.78422574,
    da: 0.00026291, de: 0.00005105, di: 0.00035372, dL: 218.45945325, dperi: -0.32241464, dnode: -0.00508664,
  },
];

const EARTH_ELEMENTS: PlanetElements = {
  id: 'jupiter', label: 'Earth', color: '#ffffff', displaySize: 0,
  a: 1.00000261, e: 0.01671123, i: -0.00001531, L: 100.46457166, peri: 102.93768193, node: 0,
  da: 0.00000562, de: -0.00004392, di: -0.01294668, dL: 35999.37244981, dperi: 0.32327364, dnode: 0,
};

const solveEccentricAnomaly = (meanAnomalyRad: number, eccentricity: number): number => {
  let E = meanAnomalyRad + eccentricity * Math.sin(meanAnomalyRad);
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const delta = (E - eccentricity * Math.sin(E) - meanAnomalyRad) / (1 - eccentricity * Math.cos(E));
    E -= delta;
    if (Math.abs(delta) < 1e-8) break;
  }
  return E;
};

const heliocentricEcliptic = (planet: PlanetElements, T: number): [number, number, number] => {
  const a = planet.a + planet.da * T;
  const e = planet.e + planet.de * T;
  const inclination = (planet.i + planet.di * T) * DEG;
  const meanLongitude = normalizeDegrees(planet.L + planet.dL * T);
  const perihelion = normalizeDegrees(planet.peri + planet.dperi * T);
  const node = normalizeDegrees(planet.node + planet.dnode * T);
  const argumentOfPerihelion = (perihelion - node) * DEG;
  const meanAnomaly = normalizeDegrees(meanLongitude - perihelion);
  const E = solveEccentricAnomaly(meanAnomaly * DEG, e);
  const xOrbital = a * (Math.cos(E) - e);
  const yOrbital = a * Math.sqrt(1 - e * e) * Math.sin(E);

  const cosW = Math.cos(argumentOfPerihelion);
  const sinW = Math.sin(argumentOfPerihelion);
  const cosNode = Math.cos(node * DEG);
  const sinNode = Math.sin(node * DEG);
  const cosInc = Math.cos(inclination);
  const sinInc = Math.sin(inclination);

  const xPlane = xOrbital * cosW - yOrbital * sinW;
  const yPlane = xOrbital * sinW + yOrbital * cosW;

  return [
    xPlane * cosNode - yPlane * cosInc * sinNode,
    xPlane * sinNode + yPlane * cosInc * cosNode,
    yPlane * sinInc,
  ];
};

export const planetEquatorial = (dateMs: number, id: PlanetId): EquatorialCoord => {
  const T = centuriesSinceJ2000(dateMs);
  const planet = PLANETS.find(item => item.id === id) ?? PLANETS[0];
  const [px, py, pz] = heliocentricEcliptic(planet, T);
  const [ex, ey, ez] = heliocentricEcliptic(EARTH_ELEMENTS, T);
  const gx = px - ex;
  const gy = py - ey;
  const gz = pz - ez;
  const lon = normalizeDegrees(atan2Deg(gy, gx));
  const lat = atan2Deg(gz, Math.hypot(gx, gy));
  return eclipticToEquatorial(lon, lat, T);
};

export const PLANET_META: ReadonlyArray<{ id: PlanetId; label: string; color: string; displaySize: number }> =
  PLANETS.map(planet => ({
    id: planet.id,
    label: planet.label,
    color: planet.color,
    displaySize: planet.displaySize,
  }));

/** Bright stars named in the scene, positions at J2000. */
export const BRIGHT_STARS: ReadonlyArray<BrightStar> = [
  { name: 'Sirius', raHours: 6.7525, decDeg: -16.716, magnitude: -1.46 },
  { name: 'Canopus', raHours: 6.3992, decDeg: -52.696, magnitude: -0.74 },
  { name: 'Arcturus', raHours: 14.261, decDeg: 19.182, magnitude: -0.05 },
  { name: 'Vega', raHours: 18.6156, decDeg: 38.784, magnitude: 0.03 },
  { name: 'Capella', raHours: 5.2782, decDeg: 45.998, magnitude: 0.08 },
  { name: 'Rigel', raHours: 5.2423, decDeg: -8.202, magnitude: 0.13 },
  { name: 'Procyon', raHours: 7.655, decDeg: 5.225, magnitude: 0.34 },
  { name: 'Betelgeuse', raHours: 5.9195, decDeg: 7.407, magnitude: 0.5 },
  { name: 'Achernar', raHours: 1.6286, decDeg: -57.237, magnitude: 0.46 },
  { name: 'Altair', raHours: 19.8464, decDeg: 8.868, magnitude: 0.77 },
  { name: 'Aldebaran', raHours: 4.5987, decDeg: 16.509, magnitude: 0.85 },
  { name: 'Antares', raHours: 16.4901, decDeg: -26.432, magnitude: 1.06 },
  { name: 'Spica', raHours: 13.4199, decDeg: -11.161, magnitude: 1.04 },
  { name: 'Pollux', raHours: 7.7553, decDeg: 28.026, magnitude: 1.14 },
  { name: 'Fomalhaut', raHours: 22.9608, decDeg: -29.622, magnitude: 1.16 },
  { name: 'Deneb', raHours: 20.6905, decDeg: 45.28, magnitude: 1.25 },
  { name: 'Regulus', raHours: 10.1395, decDeg: 11.967, magnitude: 1.35 },
  { name: 'Castor', raHours: 7.5766, decDeg: 31.888, magnitude: 1.58 },
  { name: 'Polaris', raHours: 2.5303, decDeg: 89.264, magnitude: 1.98 },
  { name: 'Alioth', raHours: 12.9004, decDeg: 55.96, magnitude: 1.76 },
  { name: 'Dubhe', raHours: 11.0621, decDeg: 61.751, magnitude: 1.79 },
  { name: 'Alkaid', raHours: 13.7923, decDeg: 49.313, magnitude: 1.85 },
  { name: 'Mizar', raHours: 13.3988, decDeg: 54.925, magnitude: 2.23 },
  { name: 'Sadr', raHours: 20.3705, decDeg: 40.257, magnitude: 2.23 },
  { name: 'Bellatrix', raHours: 5.4189, decDeg: 6.35, magnitude: 1.64 },
  { name: 'Elnath', raHours: 5.4382, decDeg: 28.608, magnitude: 1.65 },
  { name: 'Alnilam', raHours: 5.6036, decDeg: -1.202, magnitude: 1.69 },
  { name: 'Alnitak', raHours: 5.6793, decDeg: -1.943, magnitude: 1.77 },
  { name: 'Mintaka', raHours: 5.5334, decDeg: -0.299, magnitude: 2.25 },
  { name: 'Saiph', raHours: 5.7959, decDeg: -9.67, magnitude: 2.06 },
  { name: 'Wezen', raHours: 7.1399, decDeg: -26.393, magnitude: 1.83 },
  { name: 'Adhara', raHours: 6.977, decDeg: -28.972, magnitude: 1.5 },
  { name: 'Alphecca', raHours: 15.5781, decDeg: 26.715, magnitude: 2.23 },
  { name: 'Mirfak', raHours: 3.4054, decDeg: 49.861, magnitude: 1.79 },
  { name: 'Scheat', raHours: 23.0629, decDeg: 28.083, magnitude: 2.42 },
  { name: 'Markab', raHours: 23.0794, decDeg: 15.205, magnitude: 2.49 },
  { name: 'Enif', raHours: 21.7364, decDeg: 9.875, magnitude: 2.38 },
  { name: 'Nunki', raHours: 18.9211, decDeg: -26.297, magnitude: 2.05 },
  { name: 'Kaus Australis', raHours: 18.4029, decDeg: -34.385, magnitude: 1.85 },
  { name: 'Rasalhague', raHours: 17.5822, decDeg: 12.56, magnitude: 2.08 },
  { name: 'Shaula', raHours: 17.5601, decDeg: -37.104, magnitude: 1.62 },
  { name: 'Menkent', raHours: 14.1114, decDeg: -36.37, magnitude: 2.06 },
  { name: 'Algieba', raHours: 10.3328, decDeg: 19.841, magnitude: 2.08 },
  { name: 'Denebola', raHours: 11.8177, decDeg: 14.572, magnitude: 2.14 },
  { name: 'Zubenelgenubi', raHours: 14.8479, decDeg: -16.042, magnitude: 2.75 },
  { name: 'Unukalhai', raHours: 15.7379, decDeg: 6.426, magnitude: 2.63 },
  { name: 'Rasalgethi', raHours: 17.2441, decDeg: 14.39, magnitude: 3.08 },
  { name: 'Kochab', raHours: 14.8451, decDeg: 74.156, magnitude: 2.08 },
  { name: 'Alpheratz', raHours: 0.1398, decDeg: 29.09, magnitude: 2.06 },
  { name: 'Mirach', raHours: 1.1622, decDeg: 35.621, magnitude: 2.06 },
  { name: 'Almach', raHours: 2.065, decDeg: 42.33, magnitude: 2.1 },
  { name: 'Hamal', raHours: 2.1195, decDeg: 23.463, magnitude: 2.0 },
  { name: 'Diphda', raHours: 0.7264, decDeg: -17.987, magnitude: 2.02 },
  { name: 'Acrux', raHours: 12.4433, decDeg: -63.099, magnitude: 0.77 },
  { name: 'Hadar', raHours: 14.0637, decDeg: -60.373, magnitude: 0.61 },
  { name: 'Rigil Kentaurus', raHours: 14.6601, decDeg: -60.835, magnitude: -0.27 },
  { name: 'Gacrux', raHours: 12.5194, decDeg: -57.113, magnitude: 1.59 },
];

/**
 * Resolve the observer time/place used by the sky. GNSS latitude/longitude in
 * the file wins; the base record is the fallback. Without either, a central-US
 * reference is used and the sky is tagged approximate in the HUD.
 */
export const resolveSkyContext = (survey: RawSurvey): SkyContext => {
  const gnss = survey.observations.find(
    observation => observation.gnss?.latitude != null && observation.gnss?.longitude != null,
  )?.gnss;
  const latitude = gnss?.latitude ?? survey.base?.latitude;
  const longitude = gnss?.longitude ?? survey.base?.longitude;
  const fieldTime = survey.stats.fieldStartMs ?? survey.job.dateMs;
  return {
    dateMs: fieldTime ?? Date.now(),
    latitudeDeg: latitude ?? 39.8283,
    longitudeDeg: longitude ?? -98.5795,
    approximateLocation: latitude == null || longitude == null,
    approximateTime: fieldTime == null,
  };
};
