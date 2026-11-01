/**
 * Offline catalogue of the most common international surveying CRSs.
 *
 * This is deliberately NOT the full EPSG dataset — it is the hot cache used to
 * register, search and suggest CRSs instantly (and offline). Any other EPSG
 * code is resolved on demand from the backend registry (`epsg-index`, ≈8,100
 * entries) and injected into proj4 by `utils/crs/registry.ts`.
 *
 * UTM/MGA/ETRS89 UTM families are generated, never hand-copied.
 * Projection parameters are from the EPSG registry. EPSG data:
 * EPSG Geodetic Parameter Dataset, https://epsg.org/ (IOGP).
 */
import type { CrsDefinition, CrsKind } from './types.ts';

type CatalogEntry = {
  code: number;
  name: string;
  kind: CrsKind;
  proj4: string;
  bbox?: [number, number, number, number] | null;
  unit?: string | null;
  area?: string | null;
  country?: string | null;
  accuracy?: number | null;
  epoch?: number | null;
  dynamic?: boolean;
  gridShift?: string | null;
};

const entry = (e: CatalogEntry): CrsDefinition => ({
  bbox: null,
  unit: 'metre',
  area: null,
  country: null,
  accuracy: null,
  epoch: null,
  dynamic: false,
  gridShift: null,
  source: 'bundled',
  ...e,
});

const BASE_CRS: CrsDefinition[] = [
  entry({
    code: 4326, name: 'WGS 84', kind: 'geographic',
    proj4: '+proj=longlat +datum=WGS84 +no_defs',
    bbox: [-180, -90, 180, 90], unit: 'degree', area: 'World.', country: 'Global',
  }),
  entry({
    code: 3857, name: 'WGS 84 / Pseudo-Mercator (Web Mercator)', kind: 'projected',
    proj4: '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs',
    bbox: [-180, -85.06, 180, 85.06], area: 'World between 85.06°S and 85.06°N.', country: 'Global',
  }),
  entry({
    code: 3395, name: 'WGS 84 / World Mercator', kind: 'projected',
    proj4: '+proj=merc +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs',
    bbox: [-180, -80, 180, 84], area: 'World between 80°S and 84°N.', country: 'Global',
  }),
  entry({
    code: 4258, name: 'ETRS89', kind: 'geographic',
    proj4: '+proj=longlat +ellps=GRS80 +no_defs',
    bbox: [-16.1, 32.88, 40.18, 84.73], unit: 'degree', area: 'Europe - onshore and offshore.', country: 'Europe',
  }),
  entry({
    code: 3035, name: 'ETRS89-extended / LAEA Europe', kind: 'projected',
    proj4: '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    bbox: [-35.58, 24.6, 44.83, 84.73], area: 'Europe - EU countries and candidates, onshore and offshore.', country: 'Europe',
  }),
  entry({
    code: 3034, name: 'ETRS89-extended / LCC Europe', kind: 'projected',
    proj4: '+proj=lcc +lat_0=52 +lon_0=10 +lat_1=35 +lat_2=65 +x_0=4000000 +y_0=2800000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    bbox: [-35.58, 24.6, 44.83, 84.73], area: 'Europe - EU countries and candidates, onshore and offshore.', country: 'Europe',
  }),
  entry({
    code: 27700, name: 'OSGB36 / British National Grid', kind: 'projected',
    // Helmert approximation (≈2 m). OSTN15 NTv2 can be loaded in the picker
    // for cm-level results; the grid name is advertised in metadata.
    proj4: '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs',
    bbox: [-9, 49.75, 2.01, 61.01], area: 'United Kingdom (UK) - Great Britain onshore and offshore.', country: 'United Kingdom',
    gridShift: 'OSTN15_NTv2_OSGBtoETRS.gsb', accuracy: 2,
  }),
  entry({
    code: 29903, name: 'TM75 / Irish Grid', kind: 'projected',
    proj4: '+proj=tmerc +lat_0=53.5 +lon_0=-8 +k=1.000035 +x_0=200000 +y_0=250000 +a=6377340.189 +rf=299.3249646 +towgs84=482.5,-130.6,564.6,-1.042,-0.214,-0.631,8.15 +units=m +no_defs',
    bbox: [-10.56, 51.39, -5.34, 55.43], area: 'Ireland - onshore; Northern Ireland - onshore.', country: 'Ireland',
  }),
  entry({
    code: 2154, name: 'RGF93 v1 / Lambert-93', kind: 'projected',
    proj4: '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    bbox: [-9.86, 41.15, 10.38, 51.56], area: 'France - mainland and Corsica, onshore and offshore.', country: 'France',
  }),
  entry({
    code: 28992, name: 'Amersfoort / RD New', kind: 'projected',
    proj4: '+proj=sterea +lat_0=52.1561605555556 +lon_0=5.38763888888889 +k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +towgs84=565.4171,50.3319,465.5524,1.9342,-1.6677,9.1019,4.0725 +units=m +no_defs',
    bbox: [3.2, 50.75, 7.22, 53.7], area: 'Netherlands - onshore and offshore.', country: 'Netherlands',
  }),
  entry({
    code: 2056, name: 'CH1903+ / LV95', kind: 'projected',
    proj4: '+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs',
    bbox: [5.96, 45.82, 10.49, 47.81], area: 'Liechtenstein; Switzerland.', country: 'Switzerland',
  }),
  entry({
    code: 21781, name: 'CH1903 / LV03', kind: 'projected',
    proj4: '+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 +x_0=600000 +y_0=200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs',
    bbox: [5.96, 45.82, 10.49, 47.81], area: 'Liechtenstein; Switzerland.', country: 'Switzerland',
  }),
  entry({
    code: 3006, name: 'SWEREF99 TM', kind: 'projected',
    proj4: '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    bbox: [10.03, 54.96, 24.17, 69.07], area: 'Sweden - onshore and offshore.', country: 'Sweden',
  }),
  entry({
    code: 5514, name: 'S-JTSK / Krovak East North', kind: 'projected',
    proj4: '+proj=krovak +lat_0=49.5 +lon_0=24.8333333333333 +alpha=30.2881397527778 +k=0.9999 +x_0=0 +y_0=0 +ellps=bessel +towgs84=589,76,480,0,0,0,0 +units=m +no_defs',
    bbox: [12.09, 47.73, 22.56, 51.06], area: 'Czechia; Slovakia.', country: 'Czechia',
  }),
  entry({
    code: 2180, name: 'ETRF2000-PL / CS92', kind: 'projected',
    proj4: '+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    bbox: [14.14, 49, 24.15, 55.93], area: 'Poland - onshore and offshore.', country: 'Poland',
  }),
  entry({
    code: 23700, name: 'HD72 / EOV', kind: 'projected',
    proj4: '+proj=somerc +lat_0=47.1443937222222 +lon_0=19.0485717777778 +k_0=0.99993 +x_0=650000 +y_0=200000 +ellps=GRS67 +towgs84=52.17,-71.82,-14.9,0,0,0,0 +units=m +no_defs',
    bbox: [16.11, 45.74, 22.9, 48.58], area: 'Hungary.', country: 'Hungary',
  }),
  entry({
    code: 3763, name: 'ETRS89 / Portugal TM06', kind: 'projected',
    proj4: '+proj=tmerc +lat_0=39.6682583333333 +lon_0=-8.13310833333333 +k=1 +x_0=0 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    bbox: [-9.56, 36.95, -6.19, 42.16], area: 'Portugal - mainland - onshore.', country: 'Portugal',
  }),
  entry({
    code: 2193, name: 'NZGD2000 / New Zealand Transverse Mercator 2000', kind: 'projected',
    proj4: '+proj=tmerc +lat_0=0 +lon_0=173 +k=0.9996 +x_0=1600000 +y_0=10000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    bbox: [166.37, -47.33, 178.63, -34.1], area: 'New Zealand - North Island, South Island, Stewart Island.', country: 'New Zealand',
    epoch: 2000, dynamic: true,
  }),
  entry({
    code: 4167, name: 'NZGD2000', kind: 'geographic',
    proj4: '+proj=longlat +ellps=GRS80 +no_defs',
    bbox: [160.6, -55.95, 180, -25.88], unit: 'degree', area: 'New Zealand - onshore and offshore.', country: 'New Zealand',
    epoch: 2000, dynamic: true,
  }),
  entry({
    code: 7844, name: 'GDA2020', kind: 'geographic',
    proj4: '+proj=longlat +ellps=GRS80 +no_defs',
    bbox: [93.41, -60.55, 173.34, -8.47], unit: 'degree', area: 'Australia - onshore and offshore.', country: 'Australia',
    epoch: 2020,
  }),
  entry({
    code: 6668, name: 'JGD2011', kind: 'geographic',
    proj4: '+proj=longlat +ellps=GRS80 +no_defs',
    bbox: [122.38, 17.09, 157.65, 46.05], unit: 'degree', area: 'Japan - onshore and offshore.', country: 'Japan',
  }),
  entry({
    code: 31983, name: 'SIRGAS 2000 / UTM zone 23S', kind: 'projected',
    proj4: '+proj=utm +zone=23 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    bbox: [-48, -33.5, -42, 5.13], area: 'Brazil - between 48°W and 42°W.', country: 'Brazil',
  }),
  entry({
    code: 5070, name: 'NAD83 / Conus Albers', kind: 'projected',
    proj4: '+proj=aea +lat_0=23 +lon_0=-96 +lat_1=29.5 +lat_2=45.5 +x_0=0 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    bbox: [-124.79, 24.41, -66.91, 49.38], area: 'United States (USA) - CONUS onshore.', country: 'United States',
  }),
  entry({
    code: 32661, name: 'WGS 84 / UPS North (N,E)', kind: 'projected',
    proj4: '+proj=stere +lat_0=90 +lon_0=0 +k=0.994 +x_0=2000000 +y_0=2000000 +datum=WGS84 +units=m +no_defs',
    bbox: [-180, 60, 180, 90], area: 'Northern hemisphere - north of 60°N.', country: 'Arctic',
  }),
  entry({
    code: 32761, name: 'WGS 84 / UPS South (N,E)', kind: 'projected',
    proj4: '+proj=stere +lat_0=-90 +lon_0=0 +k=0.994 +x_0=2000000 +y_0=2000000 +datum=WGS84 +units=m +no_defs',
    bbox: [-180, -90, 180, -60], area: 'Southern hemisphere - south of 60°S.', country: 'Antarctica',
  }),
  entry({
    code: 3031, name: 'WGS 84 / Antarctic Polar Stereographic', kind: 'projected',
    proj4: '+proj=stere +lat_0=-90 +lat_ts=-71 +lon_0=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs',
    bbox: [-180, -90, 180, -60], area: 'Antarctica.', country: 'Antarctica',
  }),
  entry({
    code: 3413, name: 'WGS 84 / NSIDC Sea Ice Polar Stereographic North', kind: 'projected',
    proj4: '+proj=stere +lat_0=90 +lat_ts=70 +lon_0=-45 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs',
    bbox: [-180, 60, 180, 90], area: 'Northern hemisphere - north of 60°N.', country: 'Arctic',
  }),
];

/** EPSG:32601–32660 (UTM 1N–60N) and EPSG:32701–32760 (UTM 1S–60S). */
const UTM_ZONES: CrsDefinition[] = [];
for (let zone = 1; zone <= 60; zone++) {
  const west = zone * 6 - 186;
  const east = west + 6;
  const band = `${Math.abs(west)}°${west < 0 ? 'W' : 'E'} and ${Math.abs(east)}°${east < 0 ? 'W' : 'E'}`;
  UTM_ZONES.push(
    entry({
      code: 32600 + zone,
      name: `WGS 84 / UTM zone ${zone}N`,
      kind: 'projected',
      proj4: `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs`,
      bbox: [west, 0, east, 84],
      area: `Between ${band}, northern hemisphere between equator and 84°N.`,
      country: 'Global',
    }),
    entry({
      code: 32700 + zone,
      name: `WGS 84 / UTM zone ${zone}S`,
      kind: 'projected',
      proj4: `+proj=utm +zone=${zone} +south +datum=WGS84 +units=m +no_defs`,
      bbox: [west, -80, east, 0],
      area: `Between ${band}, southern hemisphere between equator and 80°S.`,
      country: 'Global',
    }),
  );
}

/** ETRS89 / UTM 28N–38N (EPSG:25828–25838). */
const ETRS89_UTM: CrsDefinition[] = [];
for (let zone = 28; zone <= 38; zone++) {
  const west = zone * 6 - 186;
  const east = west + 6;
  ETRS89_UTM.push(entry({
    code: 25800 + zone,
    name: `ETRS89 / UTM zone ${zone}N`,
    kind: 'projected',
    proj4: `+proj=utm +zone=${zone} +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`,
    bbox: [west, 24.6, east, 84.73],
    area: `Europe - between ${Math.abs(west)}°${west < 0 ? 'W' : 'E'} and ${Math.abs(east)}°${east < 0 ? 'W' : 'E'}, onshore and offshore.`,
    country: 'Europe',
  }));
}

/** GDA2020 / MGA zone 46–59 (EPSG:7846–7859) and GDA94 / MGA 48–58 (EPSG:28348–28358). */
const GDA_MGA: CrsDefinition[] = [];
for (let zone = 46; zone <= 59; zone++) {
  const west = zone * 6 - 186;
  const east = west + 6;
  GDA_MGA.push(entry({
    code: 7800 + zone,
    name: `GDA2020 / MGA zone ${zone}`,
    kind: 'projected',
    proj4: `+proj=utm +zone=${zone} +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`,
    bbox: [west, -45, east, -9],
    area: `Australia - onshore and offshore between ${west}°E and ${east}°E.`,
    country: 'Australia',
    epoch: 2020,
  }));
}
for (let zone = 48; zone <= 58; zone++) {
  const west = zone * 6 - 186;
  const east = west + 6;
  GDA_MGA.push(entry({
    code: 28300 + zone,
    name: `GDA94 / MGA zone ${zone}`,
    kind: 'projected',
    proj4: `+proj=utm +zone=${zone} +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`,
    bbox: [west, -45, east, -9],
    area: `Australia - onshore and offshore between ${west}°E and ${east}°E.`,
    country: 'Australia',
    epoch: 1994,
  }));
}

export const GLOBAL_CRS: CrsDefinition[] = [
  ...BASE_CRS,
  ...GDA_MGA,
  ...ETRS89_UTM,
  ...UTM_ZONES,
];

const BY_CODE = new Map<number, CrsDefinition>(GLOBAL_CRS.map(def => [def.code, def]));

export function getBundledCrs(code: number): CrsDefinition | null {
  return BY_CODE.get(code) || null;
}

export function bundledCrsCount(): number {
  return GLOBAL_CRS.length;
}
