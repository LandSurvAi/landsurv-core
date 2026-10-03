/**
 * Default USACE A/E/C CADD Standard (Tri-Service Plotting Guide)
 *
 * Baseline layer/code set loaded automatically on first CAD Manager init
 * when no user-uploaded standard is present. Layer names follow the
 * Tri-Service A/E/C CADD Standard convention:
 *
 *     [D]-[Major]-[Minor]-[Description]
 *
 * Discipline codes used here:
 *   V — surVey / mapping
 *   C — Civil
 *
 * Users can override / extend this by uploading their own standards markdown.
 */

import type { StandardDefinition } from '../contexts/types/CadManager.types';

const NOW = '2026-01-01T00:00:00.000Z'; // static so re-init is idempotent

export const USACE_AEC_STANDARD: StandardDefinition = {
  name: 'USACE A/E/C CADD Standard (baseline)',
  version: '1.0',
  description:
    'Baseline Tri-Service A/E/C CADD Standard layer assignments for common ' +
    'survey and civil-site codes. Override by uploading a custom standards file.',
  source: 'built-in:usace-aec',
  lastUpdated: NOW,
  codes: [
    // ── Survey control & points ─────────────────────────────────────────────
    { code: 'CP',    description: 'Control Point',              pointLayer: 'V-NODE-MJR',  lineLayer: '-',            lineType: '-',           category: 'Survey Control' },
    { code: 'BM',    description: 'Benchmark',                  pointLayer: 'V-NODE-MJR',  lineLayer: '-',            lineType: '-',           category: 'Survey Control' },
    { code: 'TBM',   description: 'Temporary Benchmark',        pointLayer: 'V-NODE',      lineLayer: '-',            lineType: '-',           category: 'Survey Control' },
    { code: 'IP',    description: 'Iron Pin Found',             pointLayer: 'V-NODE',      lineLayer: '-',            lineType: '-',           category: 'Survey Control' },
    { code: 'MON',   description: 'Monument Found',             pointLayer: 'V-NODE-MJR',  lineLayer: '-',            lineType: '-',           category: 'Survey Control' },
    { code: 'PT',    description: 'Topo Shot',                  pointLayer: 'V-NODE',      lineLayer: '-',            lineType: '-',           category: 'Survey Control' },

    // ── Boundary / Property ─────────────────────────────────────────────────
    { code: 'PL',    description: 'Property Line',              pointLayer: 'V-PROP-CORN', lineLayer: 'V-PROP-LINE',  lineType: 'PROPERTY',    category: 'Boundary' },
    { code: 'BL',    description: 'Boundary Line',              pointLayer: 'V-PROP-CORN', lineLayer: 'V-PROP-LINE',  lineType: 'PROPERTY',    category: 'Boundary' },
    { code: 'ROW',   description: 'Right of Way',               pointLayer: 'V-PROP-CORN', lineLayer: 'V-PROP-RTWY',  lineType: 'ROW',         category: 'Boundary' },
    { code: 'ESMT',  description: 'Easement',                   pointLayer: 'V-PROP-CORN', lineLayer: 'V-PROP-ESMT',  lineType: 'DASHED',      category: 'Boundary' },
    { code: 'FNC',   description: 'Fence',                      pointLayer: '-',           lineLayer: 'V-SITE-FNCE',  lineType: 'FENCELINE',   category: 'Boundary' },

    // ── Topography / Contours ───────────────────────────────────────────────
    { code: 'CONTM', description: 'Major Contour',              pointLayer: '-',           lineLayer: 'C-TOPO-MAJR',  lineType: 'CONTINUOUS',  category: 'Topography' },
    { code: 'CONTN', description: 'Minor Contour',              pointLayer: '-',           lineLayer: 'C-TOPO-MINR',  lineType: 'CONTINUOUS',  category: 'Topography' },
    { code: 'BRK',   description: 'Breakline',                  pointLayer: 'V-NODE',      lineLayer: 'C-TOPO-BRKL',  lineType: 'CONTINUOUS',  category: 'Topography' },
    { code: 'TOE',   description: 'Toe of Slope',               pointLayer: 'V-NODE',      lineLayer: 'C-TOPO-BRKL',  lineType: 'CONTINUOUS',  category: 'Topography' },
    { code: 'TOP',   description: 'Top of Slope',               pointLayer: 'V-NODE',      lineLayer: 'C-TOPO-BRKL',  lineType: 'CONTINUOUS',  category: 'Topography' },
    { code: 'SPOT',  description: 'Spot Elevation',             pointLayer: 'C-TOPO-SPOT', lineLayer: '-',            lineType: '-',           category: 'Topography' },

    // ── Roads / Paving ──────────────────────────────────────────────────────
    { code: 'CL',    description: 'Centerline of Road',         pointLayer: 'V-NODE',      lineLayer: 'V-ROAD-CNTR',  lineType: 'CENTER',      category: 'Roads' },
    { code: 'EP',    description: 'Edge of Pavement',           pointLayer: 'V-NODE',      lineLayer: 'V-ROAD-EDGE',  lineType: 'CONTINUOUS',  category: 'Roads' },
    { code: 'CURB',  description: 'Curb',                       pointLayer: 'V-NODE',      lineLayer: 'V-ROAD-CURB',  lineType: 'CONTINUOUS',  category: 'Roads' },
    { code: 'GUT',   description: 'Gutter',                     pointLayer: 'V-NODE',      lineLayer: 'V-ROAD-CURB',  lineType: 'CONTINUOUS',  category: 'Roads' },
    { code: 'SW',    description: 'Sidewalk',                   pointLayer: 'V-NODE',      lineLayer: 'V-SITE-WALK',  lineType: 'CONTINUOUS',  category: 'Roads' },
    { code: 'DW',    description: 'Driveway',                   pointLayer: 'V-NODE',      lineLayer: 'V-SITE-DRIV',  lineType: 'CONTINUOUS',  category: 'Roads' },
    { code: 'AC',    description: 'Asphalt',                    pointLayer: '-',           lineLayer: 'V-SITE-PAVE',  lineType: 'CONTINUOUS',  category: 'Roads' },
    { code: 'CONC',  description: 'Concrete',                   pointLayer: '-',           lineLayer: 'V-SITE-PAVE',  lineType: 'CONTINUOUS',  category: 'Roads' },

    // ── Buildings / Structures ──────────────────────────────────────────────
    { code: 'BLDG',  description: 'Building Outline',           pointLayer: 'V-NODE',      lineLayer: 'V-BLDG',       lineType: 'CONTINUOUS',  category: 'Structures' },
    { code: 'WALL',  description: 'Wall',                       pointLayer: 'V-NODE',      lineLayer: 'V-SITE-WALL',  lineType: 'CONTINUOUS',  category: 'Structures' },
    { code: 'STR',   description: 'Structure (generic)',        pointLayer: 'V-NODE',      lineLayer: 'V-SITE-STRC',  lineType: 'CONTINUOUS',  category: 'Structures' },

    // ── Sanitary Sewer ──────────────────────────────────────────────────────
    { code: 'SMH',   description: 'Sanitary Manhole',           pointLayer: 'V-SSWR-STRC', lineLayer: '-',            lineType: '-',           category: 'Sanitary Sewer' },
    { code: 'SCO',   description: 'Sanitary Cleanout',          pointLayer: 'V-SSWR-STRC', lineLayer: '-',            lineType: '-',           category: 'Sanitary Sewer' },
    { code: 'SS',    description: 'Sanitary Sewer Line',        pointLayer: '-',           lineLayer: 'V-SSWR',       lineType: 'SANITARY',    category: 'Sanitary Sewer' },

    // ── Storm Sewer ─────────────────────────────────────────────────────────
    { code: 'STMH',  description: 'Storm Manhole',              pointLayer: 'V-STRM-STRC', lineLayer: '-',            lineType: '-',           category: 'Storm Sewer' },
    { code: 'CB',    description: 'Catch Basin',                pointLayer: 'V-STRM-STRC', lineLayer: '-',            lineType: '-',           category: 'Storm Sewer' },
    { code: 'INL',   description: 'Storm Inlet',                pointLayer: 'V-STRM-STRC', lineLayer: '-',            lineType: '-',           category: 'Storm Sewer' },
    { code: 'HW',    description: 'Headwall',                   pointLayer: 'V-STRM-STRC', lineLayer: '-',            lineType: '-',           category: 'Storm Sewer' },
    { code: 'FES',   description: 'Flared End Section',         pointLayer: 'V-STRM-STRC', lineLayer: '-',            lineType: '-',           category: 'Storm Sewer' },
    { code: 'SD',    description: 'Storm Drain Line',           pointLayer: '-',           lineLayer: 'V-STRM',       lineType: 'STORM',       category: 'Storm Sewer' },

    // ── Water ───────────────────────────────────────────────────────────────
    { code: 'WV',    description: 'Water Valve',                pointLayer: 'V-WATR-STRC', lineLayer: '-',            lineType: '-',           category: 'Water' },
    { code: 'WM',    description: 'Water Meter',                pointLayer: 'V-WATR-STRC', lineLayer: '-',            lineType: '-',           category: 'Water' },
    { code: 'FH',    description: 'Fire Hydrant',               pointLayer: 'V-WATR-STRC', lineLayer: '-',            lineType: '-',           category: 'Water' },
    { code: 'WL',    description: 'Water Line',                 pointLayer: '-',           lineLayer: 'V-WATR',       lineType: 'WATER',       category: 'Water' },

    // ── Gas ─────────────────────────────────────────────────────────────────
    { code: 'GV',    description: 'Gas Valve',                  pointLayer: 'V-NGAS-STRC', lineLayer: '-',            lineType: '-',           category: 'Gas' },
    { code: 'GM',    description: 'Gas Meter',                  pointLayer: 'V-NGAS-STRC', lineLayer: '-',            lineType: '-',           category: 'Gas' },
    { code: 'GAS',   description: 'Gas Line',                   pointLayer: '-',           lineLayer: 'V-NGAS',       lineType: 'GAS',         category: 'Gas' },

    // ── Electric ────────────────────────────────────────────────────────────
    { code: 'UP',    description: 'Utility Pole',               pointLayer: 'V-ELEC-STRC', lineLayer: '-',            lineType: '-',           category: 'Electric' },
    { code: 'LP',    description: 'Light Pole',                 pointLayer: 'V-ELEC-LITE', lineLayer: '-',            lineType: '-',           category: 'Electric' },
    { code: 'TR',    description: 'Transformer',                pointLayer: 'V-ELEC-STRC', lineLayer: '-',            lineType: '-',           category: 'Electric' },
    { code: 'EMH',   description: 'Electric Manhole',           pointLayer: 'V-ELEC-STRC', lineLayer: '-',            lineType: '-',           category: 'Electric' },
    { code: 'OHE',   description: 'Overhead Electric',          pointLayer: '-',           lineLayer: 'V-ELEC-OVHD',  lineType: 'OVHD_ELEC',   category: 'Electric' },
    { code: 'UGE',   description: 'Underground Electric',       pointLayer: '-',           lineLayer: 'V-ELEC',       lineType: 'ELECTRIC',    category: 'Electric' },

    // ── Communications ──────────────────────────────────────────────────────
    { code: 'TMH',   description: 'Telephone Manhole',          pointLayer: 'V-COMM-STRC', lineLayer: '-',            lineType: '-',           category: 'Communications' },
    { code: 'TEL',   description: 'Telephone Line',             pointLayer: '-',           lineLayer: 'V-COMM',       lineType: 'TELEPHONE',   category: 'Communications' },
    { code: 'CATV',  description: 'Cable TV',                   pointLayer: '-',           lineLayer: 'V-COMM-CATV',  lineType: 'CATV',        category: 'Communications' },
    { code: 'FO',    description: 'Fiber Optic',                pointLayer: '-',           lineLayer: 'V-COMM-FOPT',  lineType: 'FIBER',       category: 'Communications' },

    // ── Vegetation ──────────────────────────────────────────────────────────
    { code: 'TREE',  description: 'Tree',                       pointLayer: 'V-VEGE-TREE', lineLayer: '-',            lineType: '-',           category: 'Vegetation' },
    { code: 'BUSH',  description: 'Bush / Shrub',               pointLayer: 'V-VEGE',      lineLayer: '-',            lineType: '-',           category: 'Vegetation' },
    { code: 'TL',    description: 'Tree Line',                  pointLayer: '-',           lineLayer: 'V-VEGE-LINE',  lineType: 'TREELINE',    category: 'Vegetation' },

    // ── Environmental ───────────────────────────────────────────────────────
    { code: 'WET',   description: 'Wetland Boundary',           pointLayer: 'V-NODE',      lineLayer: 'V-WETL',       lineType: 'WETLAND',     category: 'Environmental' },
    { code: 'RW',    description: 'Regulated Waters',           pointLayer: 'V-NODE',      lineLayer: 'V-WETL-RGWT',  lineType: 'REGULATED_WATERS', category: 'Environmental' },
    { code: 'EC',    description: 'Edge of Water',              pointLayer: 'V-NODE',      lineLayer: 'V-HYDR-EDGE',  lineType: 'CONTINUOUS',  category: 'Environmental' },
    { code: 'STRM',  description: 'Stream Centerline',          pointLayer: 'V-NODE',      lineLayer: 'V-HYDR-CNTR',  lineType: 'STREAM',      category: 'Environmental' },
  ],

  // Project-wide LTSCALE (AutoCAD LTSCALE equivalent). Multiplied with each
  // linetype's per-entry `scale` and per-entity CELTSCALE at render time.
  globalLinetypeScale: 1,

  // Baseline linetype library matching the names referenced by `codes` above.
  // Patterns use AutoCAD .lin semantics (drawing units):
  //   positive = dash, negative = gap, 0 = shape/text slot
  // Complex linetypes (FENCELINE, SEWER, WATER, etc.) carry shapeData so
  // the canvas can stamp the character along the line — e.g.
  //   FENCELINE  →  ─────X─────X─────X─────
  //   SEWER      →  ─────S─────S─────S─────
  linetypes: [
    { name: 'CONTINUOUS',  description: 'Solid line',                 pattern: [] },
    { name: 'DASHED',      description: 'Dashed __ __ __',            pattern: [0.5, -0.25] },
    { name: 'HIDDEN',      description: 'Short dashes _ _ _',         pattern: [0.25, -0.125] },
    { name: 'CENTER',      description: 'Centerline ____ . ____',     pattern: [1.25, -0.25, 0.25, -0.25] },
    { name: 'PHANTOM',     description: 'Phantom _____ __ __',        pattern: [1.25, -0.25, 0.25, -0.25, 0.25, -0.25] },
    { name: 'DASHDOT',     description: 'Dash-dot _ . _ . _',         pattern: [1.0, -0.25, 0.0, -0.25], shapeData: [{ name: '.', isText: true, scale: 0.1 }], isComplex: true },
    { name: 'BORDER',      description: 'Border __ __ . __ __ .',     pattern: [0.5, -0.25, 0.5, -0.25, 0.0, -0.25], shapeData: [{ name: '.', isText: true, scale: 0.1 }], isComplex: true },
    { name: 'DIVIDE',      description: 'Divide __ . . __ . .',       pattern: [0.5, -0.25, 0.0, -0.25, 0.0, -0.25], shapeData: [{ name: '.', isText: true, scale: 0.1 }, { name: '.', isText: true, scale: 0.1 }], isComplex: true },

    // Complex / shape-bearing linetypes ────────────────────────────────────
    {
      name: 'FENCELINE',
      description: 'Fence line with embedded X marks',
      pattern: [0.5, -0.2, 0.0, -0.2],
      shapeData: [{ name: 'X', isText: true, style: 'STANDARD', scale: 0.15 }],
      isComplex: true,
    },
    {
      name: 'FENCE',
      description: 'Fence line (alias of FENCELINE)',
      pattern: [0.5, -0.2, 0.0, -0.2],
      shapeData: [{ name: 'X', isText: true, style: 'STANDARD', scale: 0.15 }],
      isComplex: true,
    },
    {
      name: 'PROPERTY',
      description: 'Property line — long dash, dot, long dash',
      pattern: [1.0, -0.125, 0.125, -0.125],
    },
    {
      name: 'ROW',
      description: 'Right-of-way — dash with embedded R',
      pattern: [0.75, -0.25, 0.0, -0.25],
      shapeData: [{ name: 'R', isText: true, style: 'STANDARD', scale: 0.15 }],
      isComplex: true,
    },
    {
      name: 'REGULATED_WATERS',
      description: 'Regulated waters — dash with embedded RW',
      pattern: [0.75, -0.3, 0.0, -0.3],
      shapeData: [{ name: 'RW', isText: true, style: 'STANDARD', scale: 0.12 }],
      isComplex: true,
    },
    {
      name: 'SEWER',
      description: 'Sanitary sewer — dash with embedded S',
      pattern: [0.75, -0.25, 0.0, -0.25],
      shapeData: [{ name: 'S', isText: true, style: 'STANDARD', scale: 0.15 }],
      isComplex: true,
    },
    {
      name: 'WATER',
      description: 'Water line — dash with embedded W',
      pattern: [0.75, -0.25, 0.0, -0.25],
      shapeData: [{ name: 'W', isText: true, style: 'STANDARD', scale: 0.15 }],
      isComplex: true,
    },
    {
      name: 'GAS',
      description: 'Gas line — dash with embedded G',
      pattern: [0.75, -0.25, 0.0, -0.25],
      shapeData: [{ name: 'G', isText: true, style: 'STANDARD', scale: 0.15 }],
      isComplex: true,
    },
    {
      name: 'ELECTRIC',
      description: 'Electric line — dash with embedded E',
      pattern: [0.75, -0.25, 0.0, -0.25],
      shapeData: [{ name: 'E', isText: true, style: 'STANDARD', scale: 0.15 }],
      isComplex: true,
    },
    {
      name: 'STORM',
      description: 'Storm drain — dash with embedded D',
      pattern: [0.75, -0.25, 0.0, -0.25],
      shapeData: [{ name: 'D', isText: true, style: 'STANDARD', scale: 0.15 }],
      isComplex: true,
    },
    {
      name: 'TREELINE',
      description: 'Tree line — consecutive tight arcs (foliage / revcloud)',
      // Pattern is a single glyph slot; the arc itself consumes its chord
      // length along the line, so arcs render end-to-end with no gaps.
      pattern: [0],
      shapeData: [{ name: 'ARC', arc: true, arcSide: 1, scale: 0.4 }],
      isComplex: true,
    },
    {
      name: 'WETLAND',
      description: 'Wetland boundary — dash with embedded WL',
      pattern: [0.75, -0.3, 0.0, -0.3],
      shapeData: [{ name: 'WL', isText: true, style: 'STANDARD', scale: 0.12 }],
      isComplex: true,
    },
    {
      name: 'STREAM',
      description: 'Stream centerline — dash-dot with embedded ~',
      pattern: [0.75, -0.25, 0.0, -0.25],
      shapeData: [{ name: '~', isText: true, style: 'STANDARD', scale: 0.18 }],
      isComplex: true,
    },
  ],
};
