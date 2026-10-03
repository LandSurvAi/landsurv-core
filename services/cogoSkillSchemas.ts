// Extended COGO Agent skill schemas for CACP. Imported by AgentRegistry.ts
// and registered alongside the existing cogo_inverse / cogo_shrinkwrap skills.
//
// Each schema describes inputs, outputs, and examples for one interAgentComm
// command. Handlers live in services/cogoSkillHandlers.ts and are wired into
// App.tsx via the useCogoSkills() hook.

import type { SkillSchema } from './AgentRegistry';

const Pt = {
  type: 'object' as const,
  description: 'Point with northing & easting (project units, e.g. US survey feet).',
  properties: {
    northing: { type: 'number' as const, required: true },
    easting:  { type: 'number' as const, required: true },
    elevation:{ type: 'number' as const },
  },
};
const PtArray = { type: 'array' as const, items: Pt };
const PnArray = { type: 'array' as const, items: { type: 'string' as const, description: 'Point number' } };

export const COGO_EXTENDED_SKILLS: SkillSchema[] = [
  // -------------------------------------------------------------------------
  // Forward / direct
  // -------------------------------------------------------------------------
  {
    id: 'cogo_direct',
    name: 'Direct (Forward) Calculation',
    description: 'Compute a destination point from a starting point, azimuth, and distance. Inputs may be either an existing project point number or explicit coordinates.',
    inputs: {
      fromPointNumber: { type: 'string', description: 'Starting point number. If provided, fromCoordinates is ignored.' },
      fromCoordinates: Pt,
      azimuth:         { type: 'string', required: true, description: 'Quadrant bearing ("N 12°34\'56\" E"), DMS, or decimal degrees.' },
      distance:        { type: 'number', required: true, description: 'Distance in project units.' },
      newPointNumber:  { type: 'string', description: 'Optional point number to assign to the result; when omitted, only coordinates are returned.' },
      description:     { type: 'string' },
    },
    outputs: {
      coordinates: { ...Pt, required: true },
      pointNumber: { type: 'string' },
    },
    examples: [
      'cogo_direct({fromPointNumber:"101", azimuth:"N 45°00\'00\" E", distance:100})',
    ],
  },

  // -------------------------------------------------------------------------
  // Intersections
  // -------------------------------------------------------------------------
  {
    id: 'cogo_intersect_bb',
    name: 'Bearing-Bearing Intersection',
    description: 'Find the unique point where two rays (each defined by a point + azimuth) cross. Returns null if parallel.',
    inputs: {
      p1: { ...Pt, required: true },
      az1: { type: 'string', required: true, description: 'Azimuth from p1.' },
      p2: { ...Pt, required: true },
      az2: { type: 'string', required: true, description: 'Azimuth from p2.' },
    },
    outputs: {
      point: Pt,
      parallel: { type: 'boolean', required: true },
    },
    examples: ['cogo_intersect_bb({p1:{...}, az1:"N 45 E", p2:{...}, az2:"S 30 E"})'],
  },
  {
    id: 'cogo_intersect_bd',
    name: 'Bearing-Distance Intersection',
    description: 'Find 0–2 points where a ray from p1 crosses a circle of radius d2 centered at p2.',
    inputs: {
      p1: { ...Pt, required: true },
      az1: { type: 'string', required: true },
      p2: { ...Pt, required: true },
      d2: { type: 'number', required: true, description: 'Radius from p2.' },
    },
    outputs: {
      count: { type: 'integer', required: true },
      solutions: PtArray,
    },
    examples: ['cogo_intersect_bd({p1, az1:"N 45 E", p2, d2:100})'],
  },
  {
    id: 'cogo_intersect_dd',
    name: 'Distance-Distance Intersection',
    description: 'Find 0–2 points equidistant d1 from p1 and d2 from p2 (circle-circle intersection).',
    inputs: {
      p1: { ...Pt, required: true },
      d1: { type: 'number', required: true },
      p2: { ...Pt, required: true },
      d2: { type: 'number', required: true },
    },
    outputs: {
      count: { type: 'integer', required: true },
      solutions: PtArray,
    },
  },
  {
    id: 'cogo_intersect_ll',
    name: 'Line-Line Intersection',
    description: 'Intersection of two infinite lines, each defined by two points.',
    inputs: { a1: { ...Pt, required: true }, a2: { ...Pt, required: true }, b1: { ...Pt, required: true }, b2: { ...Pt, required: true } },
    outputs: { point: Pt, parallel: { type: 'boolean', required: true } },
  },
  {
    id: 'cogo_circle_through_3',
    name: 'Circle Through Three Points',
    description: 'Compute the unique circle through three non-collinear points (circumscribed circle).',
    inputs: { p1: { ...Pt, required: true }, p2: { ...Pt, required: true }, p3: { ...Pt, required: true } },
    outputs: { center: Pt, radius: { type: 'number' }, collinear: { type: 'boolean', required: true } },
  },
  {
    id: 'cogo_perpendicular_foot',
    name: 'Perpendicular Foot',
    description: 'Drop a perpendicular from a point onto an infinite line a–b; returns the foot of the perpendicular and signed offset (positive = right of a→b).',
    inputs: { p: { ...Pt, required: true }, a: { ...Pt, required: true }, b: { ...Pt, required: true } },
    outputs: { foot: { ...Pt, required: true }, offset: { type: 'number', required: true } },
  },

  // -------------------------------------------------------------------------
  // Curves
  // -------------------------------------------------------------------------
  {
    id: 'cogo_curve_solve',
    name: 'Horizontal Curve Solver',
    description: 'Solve a circular curve given any two of: radius, delta (radians), arcLength, chord, tangent, external, middleOrdinate, degreeArc, degreeChord. Returns the full set of curve elements.',
    inputs: {
      radius: { type: 'number' }, delta: { type: 'number', description: 'Central angle in radians.' },
      arcLength: { type: 'number' }, chord: { type: 'number' }, tangent: { type: 'number' },
      external: { type: 'number' }, middleOrdinate: { type: 'number' },
      degreeArc: { type: 'number', description: 'Arc-definition degree of curve.' },
      degreeChord: { type: 'number', description: 'Chord-definition degree of curve.' },
    },
    outputs: {
      radius: { type: 'number', required: true }, delta: { type: 'number', required: true },
      arcLength: { type: 'number', required: true }, chord: { type: 'number', required: true },
      tangent: { type: 'number', required: true }, external: { type: 'number', required: true },
      middleOrdinate: { type: 'number', required: true },
      degreeArc: { type: 'number', required: true }, degreeChord: { type: 'number', required: true },
    },
    examples: ['cogo_curve_solve({radius:500, delta:0.5235}) // 30° curve'],
  },
  {
    id: 'cogo_curve_stations',
    name: 'Curve PC/PT Stations',
    description: 'Given the PI station and curve elements, return PC and PT stations (and tangent length used).',
    inputs: { piStation: { type: 'number', required: true }, tangent: { type: 'number', required: true }, arcLength: { type: 'number', required: true } },
    outputs: { pcStation: { type: 'number', required: true }, ptStation: { type: 'number', required: true } },
  },
  {
    id: 'cogo_spiral_xy',
    name: 'Clothoid Spiral Coordinates',
    description: 'Compute (x, y) tangent-offset coordinates and tangent rotation θ at length L along a clothoid spiral with end radius R and total length Ls.',
    inputs: { length: { type: 'number', required: true }, endRadius: { type: 'number', required: true }, totalLength: { type: 'number', required: true } },
    outputs: { x: { type: 'number', required: true }, y: { type: 'number', required: true }, theta: { type: 'number', required: true } },
  },
  {
    id: 'cogo_vcurve_elev_at',
    name: 'Vertical Curve Elevation',
    description: 'Compute the elevation at a station along an equal-tangent parabolic vertical curve.',
    inputs: {
      pviStation: { type: 'number', required: true }, pviElev: { type: 'number', required: true },
      length: { type: 'number', required: true }, gradeIn: { type: 'number', required: true, description: 'Decimal grade (e.g. 0.025 = +2.5%).' },
      gradeOut: { type: 'number', required: true }, station: { type: 'number', required: true },
    },
    outputs: { elevation: { type: 'number', required: true } },
  },
  {
    id: 'cogo_vcurve_summary',
    name: 'Vertical Curve Summary',
    description: 'Return BVC / EVC stations, K-value, and high/low turning point (if present) for an equal-tangent vertical curve.',
    inputs: {
      pviStation: { type: 'number', required: true }, pviElev: { type: 'number', required: true },
      length: { type: 'number', required: true }, gradeIn: { type: 'number', required: true }, gradeOut: { type: 'number', required: true },
    },
    outputs: {
      bvcStation: { type: 'number', required: true }, bvcElev: { type: 'number', required: true },
      evcStation: { type: 'number', required: true }, evcElev: { type: 'number', required: true },
      kValue: { type: 'number', required: true },
      turningPointStation: { type: 'number' }, turningPointElev: { type: 'number' },
    },
  },

  // -------------------------------------------------------------------------
  // Traverse
  // -------------------------------------------------------------------------
  {
    id: 'cogo_traverse_compute',
    name: 'Traverse Compute',
    description: 'Compute traverse closure from a starting point and an array of legs (azimuth string + distance). Returns misclosure, precision, total distance, and per-leg lat/dep.',
    inputs: {
      start: { ...Pt, required: true },
      legs: {
        type: 'array', required: true,
        items: { type: 'object', properties: { azimuth: { type: 'string', required: true }, distance: { type: 'number', required: true } } },
      },
      closeBack: Pt,
    },
    outputs: {
      misclosureN: { type: 'number', required: true }, misclosureE: { type: 'number', required: true },
      misclosureLinear: { type: 'number', required: true }, precision: { type: 'string', required: true },
      totalDistance: { type: 'number', required: true },
    },
  },
  {
    id: 'cogo_traverse_adjust',
    name: 'Traverse Adjust',
    description: 'Adjust a traverse using compass (Bowditch), transit, or Crandall rule and return adjusted point coordinates.',
    inputs: {
      start: { ...Pt, required: true },
      legs: { type: 'array', required: true, items: { type: 'object', properties: { azimuth: { type: 'string', required: true }, distance: { type: 'number', required: true } } } },
      method: { type: 'string', required: true, enum: ['compass', 'transit', 'crandall'] },
      closeBack: Pt,
    },
    outputs: {
      adjustedPoints: { ...PtArray, required: true },
      misclosureLinear: { type: 'number', required: true }, precision: { type: 'string', required: true },
      method: { type: 'string', required: true },
    },
  },

  // -------------------------------------------------------------------------
  // Area / parcel
  // -------------------------------------------------------------------------
  {
    id: 'cogo_area_polygon',
    name: 'Polygon Area',
    description: 'Shoelace area of a closed polygon. Returns sqft, acres, perimeter, centroid.',
    inputs: { vertices: { ...PtArray, required: true } },
    outputs: {
      sqft: { type: 'number', required: true }, acres: { type: 'number', required: true },
      perimeter: { type: 'number', required: true }, centroid: { ...Pt, required: true },
    },
  },
  {
    id: 'cogo_area_from_pns',
    name: 'Area From Point Numbers',
    description: 'Area of the polygon whose vertices are the supplied (closed) sequence of project point numbers. Useful when an agent already references PNs.',
    inputs: { pointNumbers: { ...PnArray, required: true } },
    outputs: {
      sqft: { type: 'number', required: true }, acres: { type: 'number', required: true },
      perimeter: { type: 'number', required: true }, centroid: { ...Pt, required: true },
      missing: { type: 'array', items: { type: 'string' } },
    },
  },
  {
    id: 'cogo_minimum_bounding_rect',
    name: 'Minimum Bounding Rectangle',
    description: 'Smallest-area oriented rectangle containing the supplied points (rotating-calipers).',
    inputs: { points: { ...PtArray, required: true } },
    outputs: {
      corners: { ...PtArray, required: true },
      width: { type: 'number', required: true }, height: { type: 'number', required: true },
      rotation: { type: 'number', required: true, description: 'Edge azimuth in radians.' },
      area: { type: 'number', required: true },
    },
  },

  // -------------------------------------------------------------------------
  // Subdivide
  // -------------------------------------------------------------------------
  {
    id: 'cogo_subdivide_swing',
    name: 'Swing-Line Equal-Area Cut',
    description: 'Find a swing line through pivotIndex of a polygon that splits the polygon so the LEFT side has the requested area.',
    inputs: {
      polygon: { ...PtArray, required: true },
      pivotIndex: { type: 'integer', required: true },
      targetArea: { type: 'number', required: true, description: 'Desired LEFT-side area in sqft.' },
      initialAzimuth: { type: 'number', required: true, description: 'Starting azimuth guess in radians.' },
    },
    outputs: {
      cutEnd: { ...Pt, required: true },
      azimuth: { type: 'number', required: true },
      left: { ...PtArray, required: true },
      right: { ...PtArray, required: true },
    },
  },
  {
    id: 'cogo_subdivide_parallel',
    name: 'Parallel Equal-Area Cut',
    description: 'Find a chord parallel to the supplied azimuth that splits the polygon so the LEFT side has the requested area.',
    inputs: {
      polygon: { ...PtArray, required: true },
      targetArea: { type: 'number', required: true },
      azimuth: { type: 'number', required: true, description: 'Cut direction in radians.' },
    },
    outputs: {
      a: { ...Pt, required: true }, b: { ...Pt, required: true },
      left: { ...PtArray, required: true }, right: { ...PtArray, required: true },
    },
  },

  // -------------------------------------------------------------------------
  // Offset
  // -------------------------------------------------------------------------
  {
    id: 'cogo_offset_polyline',
    name: 'Parallel Polyline Offset',
    description: 'Offset a polyline by ±distance with miter or bevel joins. Positive distance offsets to the right of forward direction.',
    inputs: {
      vertices: { ...PtArray, required: true },
      distance: { type: 'number', required: true },
      closed: { type: 'boolean', default: false },
      join: { type: 'string', enum: ['miter', 'bevel'], default: 'miter' },
      miterLimit: { type: 'number', default: 10 },
    },
    outputs: { vertices: { ...PtArray, required: true } },
  },

  // -------------------------------------------------------------------------
  // Best-fit & transform
  // -------------------------------------------------------------------------
  {
    id: 'cogo_bestfit_line',
    name: 'Best-Fit Line',
    description: 'Total-least-squares best-fit line through ≥2 points. Returns azimuth, a centroid point on the line, and perpendicular RMSE.',
    inputs: { points: { ...PtArray, required: true } },
    outputs: { azimuth: { type: 'number', required: true }, through: { ...Pt, required: true }, rmse: { type: 'number', required: true } },
  },
  {
    id: 'cogo_bestfit_circle',
    name: 'Best-Fit Circle',
    description: 'Algebraic (Kasa) best-fit circle through ≥3 points.',
    inputs: { points: { ...PtArray, required: true } },
    outputs: { center: { ...Pt, required: true }, radius: { type: 'number', required: true }, rmse: { type: 'number', required: true } },
  },
  {
    id: 'cogo_helmert2d',
    name: '2D Helmert (4-Param) Fit',
    description: 'Least-squares similarity transform (translation + rotation + uniform scale) from ≥2 source/target point pairs.',
    inputs: {
      pairs: {
        type: 'array', required: true,
        items: { type: 'object', properties: { source: Pt, target: Pt } },
      },
    },
    outputs: {
      tE: { type: 'number', required: true }, tN: { type: 'number', required: true },
      scale: { type: 'number', required: true }, rotation: { type: 'number', required: true },
      rmse: { type: 'number', required: true },
    },
  },
  {
    id: 'cogo_affine2d',
    name: '2D Affine (6-Param) Fit',
    description: 'Least-squares affine transform from ≥3 source/target point pairs.',
    inputs: { pairs: { type: 'array', required: true, items: { type: 'object', properties: { source: Pt, target: Pt } } } },
    outputs: {
      a: { type: 'number', required: true }, b: { type: 'number', required: true }, tE: { type: 'number', required: true },
      c: { type: 'number', required: true }, d: { type: 'number', required: true }, tN: { type: 'number', required: true },
      rmse: { type: 'number', required: true },
    },
  },

  // -------------------------------------------------------------------------
  // Geodetic
  // -------------------------------------------------------------------------
  {
    id: 'cogo_geodesic_inverse',
    name: 'Geodesic Inverse (WGS-84)',
    description: 'Vincenty inverse on WGS-84: distance (meters and US survey feet), initial and final azimuths between two lat/lon points.',
    inputs: {
      p1: { type: 'object', required: true, properties: { lat: { type: 'number', required: true }, lon: { type: 'number', required: true } } },
      p2: { type: 'object', required: true, properties: { lat: { type: 'number', required: true }, lon: { type: 'number', required: true } } },
    },
    outputs: {
      distanceMeters: { type: 'number', required: true }, distanceFeet: { type: 'number', required: true },
      initialAzimuth: { type: 'number', required: true }, finalAzimuth: { type: 'number', required: true },
    },
  },
  {
    id: 'cogo_geodesic_direct',
    name: 'Geodesic Direct (WGS-84)',
    description: 'Vincenty direct on WGS-84: destination lat/lon and final azimuth from a start point, azimuth, and distance (meters).',
    inputs: {
      start: { type: 'object', required: true, properties: { lat: { type: 'number', required: true }, lon: { type: 'number', required: true } } },
      azimuth: { type: 'number', required: true, description: 'Initial azimuth in radians.' },
      distanceMeters: { type: 'number', required: true },
    },
    outputs: {
      lat: { type: 'number', required: true }, lon: { type: 'number', required: true },
      finalAzimuth: { type: 'number', required: true },
    },
  },

  // -------------------------------------------------------------------------
  // Utility
  // -------------------------------------------------------------------------
  {
    id: 'cogo_format_bearing',
    name: 'Format Bearing (Quadrant DMS)',
    description: 'Format a numeric azimuth (radians or decimal degrees) as a quadrant DMS string ("N 12°34\'56\" E").',
    inputs: {
      value: { type: 'number', required: true },
      unit: { type: 'string', enum: ['radians', 'degrees'], default: 'radians' },
      secondsPrecision: { type: 'integer', default: 0 },
    },
    outputs: { bearing: { type: 'string', required: true } },
  },
  {
    id: 'cogo_parse_bearing',
    name: 'Parse Bearing String',
    description: 'Parse any bearing string ("N 12 34 56 E", "12°34\'56\"", "12.5", "12d34m56s") into radians.',
    inputs: { input: { type: 'string', required: true } },
    outputs: { radians: { type: 'number', required: true }, degrees: { type: 'number', required: true } },
  },
  {
    id: 'cogo_units_convert',
    name: 'Unit Conversion',
    description: 'Convert lengths or areas between common surveying units. Supported: ft (US survey foot), m, sqft, sqm, acre, hectare.',
    inputs: {
      value: { type: 'number', required: true },
      fromUnit: { type: 'string', required: true },
      toUnit: { type: 'string', required: true },
    },
    outputs: { value: { type: 'number', required: true }, fromUnit: { type: 'string', required: true }, toUnit: { type: 'string', required: true } },
  },
  {
    id: 'points_sanity_check',
    name: 'Points Sanity Check (PDF/Table Extraction QA)',
    description:
      'Multi-check geometric/statistical QA pass for a set of points extracted from a PDF or table (work-point coordinates, deeds, etc.). Runs 6 independent checks: (1) coordinate-magnitude clustering vs the median (catches column swaps or extra/missing digits), (2) inverse round-trip vs stated bearings & distances from a companion line/curve table, (3) polygon closure & precision if the points form a closed figure, (4) shoelace area vs stated area, (5) bearing-distance triangulation residuals for points referenced from multiple others, (6) duplicate / collinear / coincident point detection. Returns per-point severity and a global pass/fail score. Call this AFTER extracting points from a PDF/image table and BEFORE committing them, then re-examine the source if any check fails red.',
    inputs: {
      points: {
        type: 'array', required: true,
        items: { type: 'object', properties: {
          pointNumber: { type: 'string', required: true },
          northing: { type: 'number', required: true },
          easting: { type: 'number', required: true },
          elevation: { type: 'number' },
          description: { type: 'string' },
        } },
        description: 'Points as extracted from the source.',
      },
      expectedSegments: {
        type: 'array',
        items: { type: 'object', properties: {
          from: { type: 'string', required: true },
          to: { type: 'string', required: true },
          bearing: { type: 'string', description: 'Bearing string (quadrant, DMS, or decimal degrees).' },
          distance: { type: 'number' },
          radius: { type: 'number', description: 'Curve radius (if this segment is a curve); compares chord.' },
        } },
        description: 'OPTIONAL companion line/curve table. Each row references points by their pointNumber. The strongest single check — provide whenever the plan has an L1/C1 table.',
      },
      expectedClosed: { type: 'boolean', description: 'If true, points are treated as a closed polygon in supplied order and a closure/area check is run.' },
      expectedArea: { type: 'number', description: 'OPTIONAL stated parcel area. Pair with expectedAreaUnit.' },
      expectedAreaUnit: { type: 'string', enum: ['sqft', 'acres', 'sqm', 'hectares'], default: 'acres' },
      units: { type: 'string', enum: ['ft', 'm'], default: 'ft', description: 'Linear units of supplied northing/easting; controls default tolerances.' },
      tolerances: {
        type: 'object',
        properties: {
          linearAbs: { type: 'number', description: 'Absolute linear tolerance (project units). Default 0.10 ft / 0.03 m.' },
          bearingSeconds: { type: 'number', description: 'Bearing tolerance in arc-seconds. Default 30.' },
          areaPct: { type: 'number', description: 'Allowed area discrepancy as a fraction (e.g. 0.01 = 1%). Default 0.01.' },
          clusterIqrMultiple: { type: 'number', description: 'How many IQR widths from the median count as an outlier. Default 4.' },
          duplicateAbs: { type: 'number', description: 'Two points within this distance are flagged as coincident. Default 0.01 ft / 0.003 m.' },
        },
      },
    },
    outputs: {
      passed:  { type: 'boolean', required: true, description: 'True when no RED issues are present.' },
      score:   { type: 'number',  required: true, description: '0–1, fraction of run checks that passed.' },
      summary: { type: 'string',  required: true, description: 'One-line human-readable verdict.' },
      checksRun: { type: 'array', items: { type: 'string' }, required: true },
      checksSkipped: { type: 'array', items: { type: 'object', properties: { check: { type: 'string' }, reason: { type: 'string' } } } },
      issues: {
        type: 'array', required: true,
        items: { type: 'object', properties: {
          check:    { type: 'string',  required: true, description: 'cluster | inverse | closure | area | triangulate | duplicate' },
          severity: { type: 'string',  required: true, enum: ['yellow', 'red'] },
          pn:       { type: 'string' },
          relatedPns: { type: 'array', items: { type: 'string' } },
          message:  { type: 'string',  required: true },
          expected: { type: 'number' },
          actual:   { type: 'number' },
          residual: { type: 'number' },
        } },
      },
      closure: {
        type: 'object',
        properties: {
          perimeter: { type: 'number' }, misclosureLinear: { type: 'number' }, precision: { type: 'string' },
          areaSqft: { type: 'number' }, areaAcres: { type: 'number' },
        },
      },
    },
    examples: [
      'points_sanity_check({points:[{pointNumber:"WP1",northing:5847123.45,easting:1234567.89},...], expectedClosed:true, expectedArea:0.83, expectedAreaUnit:"acres"})',
      'points_sanity_check({points:[...], expectedSegments:[{from:"WP1",to:"WP2",bearing:"N 45°00\'00\" E",distance:100.00}]})',
    ],
  },
  {
    id: 'cogo_selftest',
    name: 'COGO Self-Test',
    description: 'Run a fixed suite of textbook COGO problems against the agent\'s implementations and return pass/fail per family. Useful for CI and DevOps.',
    inputs: {},
    outputs: {
      passed: { type: 'integer', required: true },
      failed: { type: 'integer', required: true },
      total: { type: 'integer', required: true },
      results: {
        type: 'array', required: true,
        items: { type: 'object', properties: {
          family: { type: 'string' }, name: { type: 'string' }, passed: { type: 'boolean' }, detail: { type: 'string' },
        } },
      },
    },
  },
];
