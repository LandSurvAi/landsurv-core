/**
 * Hatch Pattern Library — v26.05.19.9
 *
 * Provides DWG/DXF-compatible hatch pattern definitions for the CAD Manager
 * Hatch View. Patterns match AutoCAD's ACAD.PAT / ISO.PAT convention so DXF
 * exports are directly importable into Civil 3D.
 *
 * DXF PAT line format:
 *   angle, x-origin, y-origin, delta-x, delta-y[, dash1, dash2, ...]
 *   positive dash = drawn segment; negative = gap; 0 = dot
 *
 * Agents (FEMA, Civil Drafter, Boundary) can call:
 *   getHatchForFemaZone(zone)   → HatchDefinition
 *   getHatchByName(name)        → HatchDefinition | undefined
 *   getHatchContextString()     → markdown table for AI system prompt injection
 */

// ─── Core types ───────────────────────────────────────────────────────────────

/** A single line family in a DXF/PAT hatch definition. */
export interface HatchPatternLine {
  /** Angle in degrees (0 = horizontal, 45 = diagonal). */
  angle: number;
  /** X origin of the pattern base-line. */
  originX: number;
  /** Y origin of the pattern base-line. */
  originY: number;
  /** Offset per line family repetition (dx). */
  deltaX: number;
  /** Offset per line family repetition (dy). */
  deltaY: number;
  /** Dash-gap pattern (positive = dash, negative = gap, 0 = dot). Empty = solid. */
  dashes?: number[];
}

/** Complete hatch definition — DXF compatible. */
export interface HatchDefinition {
  /** Unique ASCII identifier matching ACAD.PAT convention (e.g. ANSI31). */
  name: string;
  /** Human-readable description matching .PAT file header comment. */
  description: string;
  /** One or more line families that compose the pattern. */
  lines: HatchPatternLine[];
  /** CACP/agent category: standard | environmental | fema | custom */
  category: 'standard' | 'environmental' | 'fema' | 'custom';
  /** Optional FEMA zone string (e.g. 'AE', 'A', 'V', 'X', 'FLOODWAY'). */
  femaZone?: string;
  /** Preview hint: recommended scale (pattern unit = 1 drawing unit). */
  defaultScale?: number;
  /** Short agent-readable use case. */
  usage?: string;
  /** True = part of AutoCAD standard ACAD.PAT; false = LandSurv custom. */
  isAcadStandard?: boolean;
  /** ISO 128 / NCS designation if applicable. */
  isoCode?: string;
  /** Optional canvas color for preview (CSS color string). */
  previewColor?: string;
}

// ─── Standard ACAD.PAT patterns ──────────────────────────────────────────────

export const STANDARD_HATCHES: HatchDefinition[] = [
  {
    name: 'SOLID',
    description: 'Solid fill — uniform color region fill',
    isAcadStandard: true,
    category: 'standard',
    usage: 'Solid shaded areas, building footprints, water bodies, thick walls',
    defaultScale: 1,
    previewColor: '#38bdf8',
    lines: [],
  },
  {
    name: 'ANSI31',
    description: 'ANSI Iron, Brick & Stone masonry — 45° diagonal lines',
    isAcadStandard: true,
    category: 'standard',
    usage: 'Steel sections, buildings, general material indication',
    defaultScale: 1,
    previewColor: '#94a3b8',
    lines: [
      { angle: 45, originX: 0, originY: 0, deltaX: 0, deltaY: 0.125 },
    ],
  },
  {
    name: 'ANSI32',
    description: 'ANSI Steel — widely spaced diagonal lines',
    isAcadStandard: true,
    category: 'standard',
    usage: 'Steel material in cross-sections',
    defaultScale: 1,
    previewColor: '#94a3b8',
    lines: [
      { angle: 45, originX: 0, originY: 0, deltaX: 0, deltaY: 0.375 },
      { angle: 45, originX: 0.25, originY: 0, deltaX: 0, deltaY: 0.375 },
    ],
  },
  {
    name: 'ANSI33',
    description: 'ANSI Brass, Bronze, Copper',
    isAcadStandard: true,
    category: 'standard',
    usage: 'Brass / bronze sections',
    defaultScale: 1,
    previewColor: '#d4a85a',
    lines: [
      { angle: 45, originX: 0, originY: 0, deltaX: 0, deltaY: 0.125 },
      { angle: -45, originX: 0, originY: 0, deltaX: 0, deltaY: 0.375 },
    ],
  },
  {
    name: 'ANSI34',
    description: 'ANSI Rubber / plastic',
    isAcadStandard: true,
    category: 'standard',
    usage: 'Rubber / plastic cross-sections',
    defaultScale: 1,
    previewColor: '#475569',
    lines: [
      { angle: 45, originX: 0, originY: 0, deltaX: 0, deltaY: 0.0625 },
      { angle: 45, originX: 0.03125, originY: 0, deltaX: 0, deltaY: 0.0625 },
      { angle: 45, originX: 0.0625, originY: 0, deltaX: 0, deltaY: 0.0625 },
    ],
  },
  {
    name: 'ANSI35',
    description: 'ANSI Zinc, Lead, Alloys',
    isAcadStandard: true,
    category: 'standard',
    usage: 'Zinc / lead alloys',
    defaultScale: 1,
    previewColor: '#78716c',
    lines: [
      { angle: 45, originX: 0, originY: 0, deltaX: 0, deltaY: 0.125 },
      { angle: 45, originX: 0.0625, originY: 0, deltaX: 0, deltaY: 0.125, dashes: [0.125, -0.0625] },
    ],
  },
  {
    name: 'ANSI36',
    description: 'ANSI Magnesium, Aluminum',
    isAcadStandard: true,
    category: 'standard',
    usage: 'Aluminum / magnesium cross-sections',
    defaultScale: 1,
    previewColor: '#a8a29e',
    lines: [
      { angle: 45, originX: 0, originY: 0, deltaX: 0, deltaY: 0.125 },
      { angle: -45, originX: 0, originY: 0, deltaX: 0, deltaY: 0.125 },
    ],
  },
  {
    name: 'ANSI37',
    description: 'ANSI Concrete',
    isAcadStandard: true,
    category: 'standard',
    usage: 'Concrete in structural drawings',
    defaultScale: 1,
    previewColor: '#9ca3af',
    lines: [
      { angle: 0, originX: 0, originY: 0, deltaX: 0, deltaY: 0.25 },
      { angle: 90, originX: 0, originY: 0, deltaX: 0, deltaY: 0.25 },
    ],
  },
  {
    name: 'ANSI38',
    description: 'ANSI Marble, Slate, Glass',
    isAcadStandard: true,
    category: 'standard',
    usage: 'Marble / glass elevation indication',
    defaultScale: 1,
    previewColor: '#e2e8f0',
    lines: [
      { angle: 45, originX: 0, originY: 0, deltaX: 0, deltaY: 0.125, dashes: [0.0625, -0.0625] },
    ],
  },
  {
    name: 'CROSS',
    description: 'Diagonal cross-hatch (+45° and −45°)',
    isAcadStandard: true,
    category: 'standard',
    usage: 'General cross-hatch fill',
    defaultScale: 1,
    previewColor: '#64748b',
    lines: [
      { angle: 45, originX: 0, originY: 0, deltaX: 0, deltaY: 0.25 },
      { angle: -45, originX: 0, originY: 0, deltaX: 0, deltaY: 0.25 },
    ],
  },
  {
    name: 'DOTS',
    description: 'Regular dot array',
    isAcadStandard: false,
    category: 'standard',
    usage: 'General stipple / dot fill',
    defaultScale: 1,
    previewColor: '#64748b',
    lines: [
      { angle: 0, originX: 0, originY: 0, deltaX: 0.125, deltaY: 0, dashes: [0, -0.125] },
      { angle: 90, originX: 0, originY: 0, deltaX: 0.125, deltaY: 0, dashes: [0, -0.125] },
    ],
  },
  {
    name: 'HONEY',
    description: 'Honeycomb hexagonal pattern',
    isAcadStandard: true,
    category: 'standard',
    usage: 'Decorative / masonry alternatives',
    defaultScale: 1,
    previewColor: '#fbbf24',
    lines: [
      { angle: 90, originX: 0, originY: 0, deltaX: 0.1875, deltaY: 0.3248, dashes: [0.3248, -0.3248] },
      { angle: 30, originX: 0, originY: 0, deltaX: 0.1875, deltaY: 0.3248, dashes: [0.375, -0.375] },
      { angle: 150, originX: 0, originY: 0.3248, deltaX: 0.1875, deltaY: 0.3248, dashes: [0.375, -0.375] },
    ],
  },
  {
    name: 'SAND',
    description: 'Sand / granular soil stipple',
    isAcadStandard: true,
    category: 'standard',
    usage: 'Sandy soils in borings / sections',
    defaultScale: 1,
    previewColor: '#d4a85a',
    lines: [
      { angle: 45,  originX: 0,     originY: 0, deltaX: 0, deltaY: 0.0833, dashes: [0, -0.0833] },
      { angle: 135, originX: 0,     originY: 0, deltaX: 0, deltaY: 0.0833, dashes: [0, -0.0833] },
      { angle: 0,   originX: 0.042, originY: 0.042, deltaX: 0.0833, deltaY: 0.0833, dashes: [0, -0.0833] },
    ],
  },
  {
    name: 'GRAVEL',
    description: 'Gravel / crushed stone',
    isAcadStandard: true,
    category: 'standard',
    usage: 'Gravel fill in soil borings',
    defaultScale: 1,
    previewColor: '#a8a29e',
    lines: [
      { angle: 45, originX: 0, originY: 0, deltaX: 0, deltaY: 0.0625 },
      { angle: 135, originX: 0, originY: 0, deltaX: 0, deltaY: 0.0625, dashes: [0.0625, -0.1875] },
    ],
  },
  {
    name: 'EARTH',
    description: 'Earth / natural ground (NCS G-ground)',
    isAcadStandard: true,
    category: 'environmental',
    isoCode: 'NCS G-ground',
    usage: 'Natural earth / earthwork sections',
    defaultScale: 1,
    previewColor: '#78716c',
    lines: [
      { angle: 45, originX: 0, originY: 0, deltaX: 0, deltaY: 0.125 },
      { angle: 135, originX: 0, originY: 0, deltaX: 0, deltaY: 0.25 },
    ],
  },
  {
    name: 'GRASS',
    description: 'Turf / grass surface',
    isAcadStandard: true,
    category: 'environmental',
    usage: 'Lawn area indication on site plans',
    defaultScale: 1,
    previewColor: '#4ade80',
    lines: [
      { angle: 90,  originX: 0,    originY: 0,    deltaX: 0.125, deltaY: 0.0625, dashes: [0.0625, -0.0625] },
      { angle: 75,  originX: 0.03, originY: 0.03, deltaX: 0.125, deltaY: 0.0625, dashes: [0.03, -0.09] },
    ],
  },
  {
    name: 'SWAMP',
    description: 'Wetland / marsh vegetation',
    isAcadStandard: true,
    category: 'environmental',
    usage: 'Wetland delineations on site plans',
    defaultScale: 1,
    previewColor: '#34d399',
    lines: [
      { angle: 90,  originX: 0, originY: 0,    deltaX: 0.25, deltaY: 0.25, dashes: [0.125, -0.125] },
      { angle: 0,   originX: 0, originY: 0.125, deltaX: 0.25, deltaY: 0.25, dashes: [0.0625, -0.4375] },
    ],
  },
  {
    name: 'MUDST',
    description: 'Mud / soft sediment',
    isAcadStandard: true,
    category: 'environmental',
    usage: 'Lacustrine or marsh sediment',
    defaultScale: 1,
    previewColor: '#92400e',
    lines: [
      { angle: 0,  originX: 0,    originY: 0,    deltaX: 0.25, deltaY: 0.0556 },
      { angle: 0,  originX: 0.04, originY: 0.028, deltaX: 0.25, deltaY: 0.0556, dashes: [0, -0.25] },
    ],
  },
  {
    name: 'AR-BRIK',
    description: 'Brick / masonry coursing (AR)',
    isAcadStandard: true,
    category: 'standard',
    usage: 'Brick walls, masonry elevation / section',
    defaultScale: 1,
    previewColor: '#b45309',
    lines: [
      { angle: 0,   originX: 0, originY: 0,     deltaX: 0.375, deltaY: 0.25 },
      { angle: 0,   originX: 0, originY: 0.25,  deltaX: 0,     deltaY: 0.25 },
      { angle: 90,  originX: 0, originY: 0,     deltaX: 0.375, deltaY: 0.375, dashes: [0.25, -0.125] },
      { angle: 90,  originX: 0.1875, originY: 0.125, deltaX: 0.375, deltaY: 0.375, dashes: [0.25, -0.125] },
    ],
  },
  {
    name: 'AR-CONC',
    description: 'Concrete (AR) — poured / pre-cast',
    isAcadStandard: true,
    category: 'standard',
    usage: 'Poured concrete sections, footings, slabs',
    defaultScale: 1,
    previewColor: '#9ca3af',
    lines: [
      { angle: 0,  originX: 0, originY: 0, deltaX: 0,  deltaY: 0.0625 },
      { angle: 60, originX: 0, originY: 0, deltaX: 0.25, deltaY: 0.0625, dashes: [0, -0.125] },
    ],
  },
  {
    name: 'AR-RSHKE',
    description: 'Cedar shake / wood shingles',
    isAcadStandard: true,
    category: 'standard',
    usage: 'Roof shingles elevation',
    defaultScale: 1,
    previewColor: '#78350f',
    lines: [
      { angle: 0, originX: 0, originY: 0, deltaX: 0, deltaY: 0.25, dashes: [0.25, -0.25] },
      { angle: 0, originX: 0.0625, originY: 0.125, deltaX: 0, deltaY: 0.25, dashes: [0.125, -0.375] },
    ],
  },
  {
    name: 'ASPHALT',
    description: 'Bituminous asphalt / AC pavement stipple & dash',
    isAcadStandard: false,
    category: 'standard',
    usage: 'Asphalt roadways, parking lots, bituminous driveways',
    defaultScale: 1,
    previewColor: '#64748b',
    lines: [
      { angle: 30, originX: 0, originY: 0, deltaX: 0.125, deltaY: 0.125, dashes: [0.0625, -0.1875] },
      { angle: 120, originX: 0.06, originY: 0.04, deltaX: 0.125, deltaY: 0.125, dashes: [0, -0.125] },
    ],
  },
  {
    name: 'RIPRAP',
    description: 'Rip-rap / angular stone slope protection',
    isAcadStandard: false,
    category: 'environmental',
    usage: 'Outfall aprons, channel banks, erosion control stone',
    defaultScale: 1,
    previewColor: '#94a3b8',
    lines: [
      { angle: 35, originX: 0, originY: 0, deltaX: 0.15, deltaY: 0.15, dashes: [0.15, -0.15] },
      { angle: 125, originX: 0.05, originY: 0.05, deltaX: 0.15, deltaY: 0.15, dashes: [0.12, -0.18] },
      { angle: -25, originX: 0.1, originY: 0, deltaX: 0.15, deltaY: 0.15, dashes: [0.1, -0.2] },
    ],
  },
  {
    name: 'WATER',
    description: 'Water surface — horizontal dashed ripples',
    isAcadStandard: false,
    category: 'environmental',
    usage: 'Ponds, streams, lakes, detention basins',
    defaultScale: 1,
    previewColor: '#38bdf8',
    lines: [
      { angle: 0, originX: 0, originY: 0, deltaX: 0.25, deltaY: 0.125, dashes: [0.25, -0.125] },
      { angle: 0, originX: 0.125, originY: 0.0625, deltaX: 0.25, deltaY: 0.125, dashes: [0.15, -0.225] },
    ],
  },
  {
    name: 'WOOD',
    description: 'Wood deck / timber planking',
    isAcadStandard: false,
    category: 'standard',
    usage: 'Decks, boardwalks, timber structures',
    defaultScale: 1,
    previewColor: '#d97706',
    lines: [
      { angle: 0, originX: 0, originY: 0, deltaX: 0, deltaY: 0.125 },
      { angle: 90, originX: 0, originY: 0, deltaX: 0.5, deltaY: 0.5, dashes: [0.125, -0.375] },
    ],
  },
  {
    name: 'PAVERS',
    description: 'Interlocking concrete / brick pavers (herringbone)',
    isAcadStandard: false,
    category: 'standard',
    usage: 'Patios, plaza walkways, decorative paver driveways',
    defaultScale: 1,
    previewColor: '#f59e0b',
    lines: [
      { angle: 45, originX: 0, originY: 0, deltaX: 0.125, deltaY: 0.125, dashes: [0.25, -0.125] },
      { angle: 135, originX: 0, originY: 0, deltaX: 0.125, deltaY: 0.125, dashes: [0.25, -0.125] },
    ],
  },
  {
    name: 'BUILDING',
    description: 'Building footprint hatch — tight 45° diagonal shading',
    isAcadStandard: false,
    category: 'standard',
    usage: 'Building footprints and roof plans on boundary / site surveys',
    defaultScale: 1,
    previewColor: '#cbd5e1',
    lines: [
      { angle: 45, originX: 0, originY: 0, deltaX: 0, deltaY: 0.08 },
    ],
  },
];

// ─── FEMA-specific hatch patterns ─────────────────────────────────────────────

export const FEMA_HATCHES: HatchDefinition[] = [
  {
    name: 'FEMA-AE',
    description: 'FEMA Zone AE — 1% annual chance flood (100-yr), BFE known',
    category: 'fema',
    femaZone: 'AE',
    usage: 'FIRM maps: high-risk areas with established Base Flood Elevation',
    defaultScale: 1,
    isAcadStandard: false,
    previewColor: '#22d3ee',
    lines: [
      { angle: 45, originX: 0, originY: 0, deltaX: 0, deltaY: 0.1 },
    ],
  },
  {
    name: 'FEMA-A',
    description: 'FEMA Zone A — 1% annual chance flood (100-yr), no BFE',
    category: 'fema',
    femaZone: 'A',
    usage: 'FIRM maps: high-risk areas where BFE has not been determined',
    defaultScale: 1,
    isAcadStandard: false,
    previewColor: '#06b6d4',
    lines: [
      { angle: 45, originX: 0, originY: 0, deltaX: 0, deltaY: 0.1 },
      { angle: 45, originX: 0.05, originY: 0, deltaX: 0, deltaY: 0.1, dashes: [0, -0.1] },
    ],
  },
  {
    name: 'FEMA-AO',
    description: 'FEMA Zone AO — Alluvial fan or river flooding, shallow sheet flow',
    category: 'fema',
    femaZone: 'AO',
    usage: 'FIRM maps: shallow inland flooding, alluvial fans',
    defaultScale: 1,
    isAcadStandard: false,
    previewColor: '#0891b2',
    lines: [
      { angle: 30, originX: 0, originY: 0, deltaX: 0, deltaY: 0.125 },
      { angle: 90, originX: 0, originY: 0, deltaX: 0, deltaY: 0.25, dashes: [0.0625, -0.1875] },
    ],
  },
  {
    name: 'FEMA-AH',
    description: 'FEMA Zone AH — Ponding areas, 1-3 ft shallow flooding with BFE',
    category: 'fema',
    femaZone: 'AH',
    usage: 'FIRM maps: shallow flooding ponding areas',
    defaultScale: 1,
    isAcadStandard: false,
    previewColor: '#0e7490',
    lines: [
      { angle: 45, originX: 0, originY: 0, deltaX: 0, deltaY: 0.15 },
      { angle: 135, originX: 0, originY: 0, deltaX: 0, deltaY: 0.3, dashes: [0.075, -0.225] },
    ],
  },
  {
    name: 'FEMA-V',
    description: 'FEMA Zone V / VE — High-velocity wave action, coastal flooding',
    category: 'fema',
    femaZone: 'V',
    usage: 'FIRM maps: coastal areas with wave action hazard',
    defaultScale: 1,
    isAcadStandard: false,
    previewColor: '#1d4ed8',
    lines: [
      { angle: 45, originX: 0,     originY: 0, deltaX: 0, deltaY: 0.1 },
      { angle: -45, originX: 0,    originY: 0, deltaX: 0, deltaY: 0.1 },
    ],
  },
  {
    name: 'FEMA-X-SHADED',
    description: 'FEMA Zone X Shaded — 0.2% annual chance (500-yr) flood',
    category: 'fema',
    femaZone: 'X_SHADED',
    usage: 'FIRM maps: moderate-risk 500-year flood zone',
    defaultScale: 1,
    isAcadStandard: false,
    previewColor: '#93c5fd',
    lines: [
      { angle: 45, originX: 0, originY: 0, deltaX: 0, deltaY: 0.25 },
    ],
  },
  {
    name: 'FEMA-X-UNSHADED',
    description: 'FEMA Zone X Unshaded — Minimal risk, outside 500-yr floodplain',
    category: 'fema',
    femaZone: 'X_UNSHADED',
    usage: 'FIRM maps: minimal flood hazard — typically no fill',
    defaultScale: 1,
    isAcadStandard: false,
    previewColor: '#e2e8f0',
    lines: [],
  },
  {
    name: 'FEMA-FLOODWAY',
    description: 'FEMA Regulatory Floodway — Active floodway, fill prohibited',
    category: 'fema',
    femaZone: 'FLOODWAY',
    usage: 'FIRM maps: floodway channel — regulatory fill/construction restrictions',
    defaultScale: 1,
    isAcadStandard: false,
    previewColor: '#155e75',
    lines: [
      { angle: 90, originX: 0, originY: 0, deltaX: 0, deltaY: 0.08 },
      { angle: 0,  originX: 0, originY: 0, deltaX: 0, deltaY: 0.24, dashes: [0.04, -0.20] },
    ],
  },
  {
    name: 'FEMA-D',
    description: 'FEMA Zone D — Undetermined flood risk',
    category: 'fema',
    femaZone: 'D',
    usage: 'FIRM maps: areas not studied — risk undetermined',
    defaultScale: 1,
    isAcadStandard: false,
    previewColor: '#78716c',
    lines: [
      { angle: 45, originX: 0, originY: 0, deltaX: 0.1, deltaY: 0.1, dashes: [0, -0.1] },
    ],
  },
];

// ─── Master export ─────────────────────────────────────────────────────────────

/** All built-in patterns (standard + environmental + FEMA). */
export const ALL_BUILT_IN_HATCHES: HatchDefinition[] = [
  ...STANDARD_HATCHES,
  ...FEMA_HATCHES,
];

// ─── Lookup helpers ───────────────────────────────────────────────────────────

/**
 * Look up a hatch by exact name (case-insensitive). Returns undefined if not found.
 * Searches built-in library first, then any provided custom list.
 */
export function getHatchByName(
  name: string,
  customHatches: HatchDefinition[] = []
): HatchDefinition | undefined {
  const upper = name.toUpperCase();
  return (
    ALL_BUILT_IN_HATCHES.find(h => h.name.toUpperCase() === upper) ??
    customHatches.find(h => h.name.toUpperCase() === upper)
  );
}

/**
 * Return the best-match hatch for a FEMA flood zone designation.
 * Agents (FEMA, Drafting) call this to get a pattern for a specific zone.
 *
 * @param zone  e.g. 'AE', 'A', 'V', 'X Shaded', 'FLOODWAY', '0.2% Annual Chance'
 */
export function getHatchForFemaZone(zone: string): HatchDefinition {
  const z = zone.toUpperCase().trim();

  const ZONE_MAP: Record<string, string> = {
    'AE': 'FEMA-AE',
    'A ': 'FEMA-A',
    'A': 'FEMA-A',
    'AO': 'FEMA-AO',
    'AH': 'FEMA-AH',
    'V': 'FEMA-V',
    'VE': 'FEMA-V',
    'X SHADED': 'FEMA-X-SHADED',
    '0.2% ANNUAL CHANCE': 'FEMA-X-SHADED',
    '500-YEAR': 'FEMA-X-SHADED',
    'X': 'FEMA-X-UNSHADED',
    'X UNSHADED': 'FEMA-X-UNSHADED',
    'FLOODWAY': 'FEMA-FLOODWAY',
    'REGULATORY FLOODWAY': 'FEMA-FLOODWAY',
    'D': 'FEMA-D',
    'B': 'FEMA-X-SHADED',   // old FIRM designation, now Zone X Shaded
    'C': 'FEMA-X-UNSHADED', // old FIRM designation, now Zone X
  };

  const patternName = ZONE_MAP[z] ?? 'FEMA-AE';
  return FEMA_HATCHES.find(h => h.name === patternName) ?? FEMA_HATCHES[0];
}

// ─── Agent / CACP context string ──────────────────────────────────────────────

/**
 * Returns a markdown table of all hatch patterns for injection into AI system
 * prompts. Agents can reference pattern names when specifying fills.
 *
 * @param includeCustom  Additional custom patterns the user has defined.
 */
export function getHatchContextString(includeCustom: HatchDefinition[] = []): string {
  const all = [...ALL_BUILT_IN_HATCHES, ...includeCustom];

  const rows = all.map(h =>
    `| ${h.name} | ${h.category} | ${h.femaZone ?? '—'} | ${h.description} |`
  );

  return [
    '## Available Hatch Patterns (CAD Standards)',
    '',
    '| Name | Category | FEMA Zone | Description |',
    '|------|----------|-----------|-------------|',
    ...rows,
    '',
    'When specifying a hatch fill for a polygon or flood zone, use the **Name** column value.',
    'For FEMA flood zones, prefer the FEMA-* prefix patterns over generic ANSI hatches.',
  ].join('\n');
}

// ─── PAT export ───────────────────────────────────────────────────────────────

/**
 * Serialize a list of HatchDefinitions to AutoCAD .PAT format string.
 * The output can be saved as a .pat file and loaded directly into Civil 3D /
 * AutoCAD via the "Load or Reload Linetypes" → Hatch dialog.
 */
export function exportToPat(hatches: HatchDefinition[]): string {
  const lines: string[] = [
    ';; LandSurv.ai Hatch Pattern Export',
    `;; Generated: ${new Date().toISOString()}`,
    ';; Compatible with AutoCAD / Civil 3D ACAD.PAT format',
    '',
  ];

  for (const h of hatches) {
    lines.push(`*${h.name},${h.description}`);
    for (const l of h.lines) {
      const parts: (number | string)[] = [
        l.angle, l.originX, l.originY, l.deltaX, l.deltaY,
      ];
      if (l.dashes && l.dashes.length > 0) {
        parts.push(...l.dashes);
      }
      lines.push(parts.join(', '));
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── PAT import ───────────────────────────────────────────────────────────────

/**
 * Parse an AutoCAD .pat file string into HatchDefinition objects.
 * Lines starting with ';' are comments. Pattern headers start with '*'.
 */
export function importFromPat(patContent: string): HatchDefinition[] {
  const result: HatchDefinition[] = [];
  let current: HatchDefinition | null = null;

  for (const raw of patContent.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith(';')) continue;

    if (line.startsWith('*')) {
      // Header: *NAME,description
      if (current && current.lines.length > 0) result.push(current);
      const headerContent = line.slice(1);
      const commaIdx = headerContent.indexOf(',');
      const name = commaIdx >= 0 ? headerContent.slice(0, commaIdx).trim() : headerContent.trim();
      const desc = commaIdx >= 0 ? headerContent.slice(commaIdx + 1).trim() : '';
      current = {
        name: name.toUpperCase(),
        description: desc || name,
        category: 'custom',
        lines: [],
        isAcadStandard: false,
      };
    } else if (current) {
      // Pattern line: angle, ox, oy, dx, dy[, dash...]
      const nums = line.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
      if (nums.length >= 5) {
        const [angle, ox, oy, dx, dy, ...dashes] = nums;
        current.lines.push({ angle, originX: ox, originY: oy, deltaX: dx, deltaY: dy, dashes: dashes.length > 0 ? dashes : undefined });
      }
    }
  }

  if (current && current.lines.length > 0) result.push(current);
  return result;
}

// ─── Canvas preview renderer ─────────────────────────────────────────────────

/**
 * Render a hatch pattern preview into a 2D canvas context.
 * Draws the PAT pattern at an appropriate scale to fill a small preview box.
 *
 * @param ctx     Canvas 2D context (already sized to desired dimensions)
 * @param hatch   Pattern to render
 * @param color   CSS color for lines (default '#22d3ee')
 * @param bgColor Canvas background color (default 'transparent' — call clearRect first)
 */
export function renderHatchPreview(
  ctx: CanvasRenderingContext2D,
  hatch: HatchDefinition,
  color = '#22d3ee',
  bgColor?: string
): void {
  const { width, height } = ctx.canvas;

  if (bgColor) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.clearRect(0, 0, width, height);
  }

  if (hatch.lines.length === 0) {
    if (hatch.name.toUpperCase() === 'SOLID') {
      ctx.save();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(3, 3, width - 6, height - 6);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(2.5, 2.5, width - 5, height - 5);
      ctx.restore();
      return;
    }
    // Zone X unshaded — blank square, just show a border
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(2, 2, width - 4, height - 4);
    return;
  }

  // Scale factor: treat 1 PAT unit as ~(width/8) screen pixels
  const scale = Math.min(width, height) / 6;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;

  for (const l of hatch.lines) {
    const angleRad = (l.angle * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    const spacing = l.deltaY !== 0 ? Math.abs(l.deltaY) * scale : (l.deltaX !== 0 ? Math.abs(l.deltaX) * scale : 16);

    // Number of parallel lines needed to cover the preview
    const diagonal = Math.sqrt(width * width + height * height);
    const lineCount = Math.ceil(diagonal / spacing) + 2;

    for (let i = -lineCount; i <= lineCount; i++) {
      // Perpendicular offset
      const perpX = -sin * i * spacing + l.originX * scale;
      const perpY =  cos * i * spacing + l.originY * scale;

      // Clip to canvas bounds roughly
      const ext = diagonal;
      const x1 = width / 2 + perpX + cos * -ext;
      const y1 = height / 2 - perpY + sin * -ext;
      const x2 = width / 2 + perpX + cos *  ext;
      const y2 = height / 2 - perpY + sin *  ext;

      if (l.dashes && l.dashes.length > 0) {
        // Apply canvas dash pattern
        const canvasDash = l.dashes.map(d => Math.abs(d) * scale).filter(d => d > 0);
        // Handle dot (0 in PAT → tiny 1px stroke)
        const resolvedDash: number[] = [];
        for (const d of l.dashes) {
          if (d === 0) { resolvedDash.push(1, (l.dashes[1] ?? 0.1) * scale || 4); break; }
          resolvedDash.push(Math.abs(d) * scale);
        }
        ctx.setLineDash(canvasDash.length > 0 ? canvasDash : resolvedDash);
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }

  ctx.setLineDash([]);
  ctx.restore();
}

// ─── Semantic / Code Hatch Resolution ────────────────────────────────────────

export interface ResolvedHatchRecommendation {
  hatch: HatchDefinition;
  recommendedLayer: string;
  recommendedScale: number;
  recommendedAngle: number;
  source: 'standard-code' | 'exact-name' | 'fema-zone' | 'semantic-keyword' | 'default';
  confidence: number;
}

/**
 * Resolve the best HatchDefinition and recommended CAD layer/scale for a code,
 * feature keyword, material name, or FEMA flood zone string.
 */
export function resolveHatchForFeatureOrCode(
  queryOrCode: string,
  options?: {
    customHatches?: HatchDefinition[];
    codes?: Array<{
      code: string;
      description?: string;
      lineLayer?: string;
      pointLayer?: string;
      hatchPattern?: string;
      hatchScale?: number;
      hatchAngle?: number;
      hatchLayer?: string;
    }>;
  }
): ResolvedHatchRecommendation {
  const raw = (queryOrCode || '').trim();
  const upper = raw.toUpperCase();
  const lower = raw.toLowerCase();
  const custom = options?.customHatches ?? [];
  const codes = options?.codes ?? [];

  // 1. Check loaded standard codes for an explicit hatchPattern or matching code
  if (codes.length > 0 && raw) {
    const matchedCode =
      codes.find(c => c.code.toUpperCase() === upper) ??
      codes.find(c => c.description && c.description.toLowerCase() === lower) ??
      codes.find(c => c.description && lower.includes(c.description.toLowerCase()) && c.description.length >= 4);
    if (matchedCode?.hatchPattern) {
      const byCode = getHatchByName(matchedCode.hatchPattern, custom);
      if (byCode) {
        return {
          hatch: byCode,
          recommendedLayer: matchedCode.hatchLayer || matchedCode.lineLayer || matchedCode.pointLayer || 'V-HATCH',
          recommendedScale: matchedCode.hatchScale ?? byCode.defaultScale ?? 1,
          recommendedAngle: matchedCode.hatchAngle ?? 0,
          source: 'standard-code',
          confidence: 0.98,
        };
      }
    }
  }

  // 2. Exact pattern name match
  const exact = getHatchByName(raw, custom);
  if (exact) {
    return {
      hatch: exact,
      recommendedLayer: exact.category === 'fema' ? 'V-FEMA-HTCH' : exact.category === 'environmental' ? 'V-ENVR-HTCH' : 'V-ANNO-PATT',
      recommendedScale: exact.defaultScale ?? 1,
      recommendedAngle: 0,
      source: 'exact-name',
      confidence: 1.0,
    };
  }

  // 3. FEMA zone match if query mentions FEMA / flood / zone
  if (/\b(?:fema|flood(?:way|plain)?|zone\s*(?:ae|a|ao|ah|v|ve|x|d))\b/i.test(raw)) {
    const zoneToken =
      raw.match(/\b(?:floodway|zone\s*(ae|ao|ah|ve|v|a|x\s*shaded|x|d))\b/i)?.[1] ??
      (/floodway/i.test(raw) ? 'FLOODWAY' : 'AE');
    const femaHatch = getHatchForFemaZone(zoneToken);
    return {
      hatch: femaHatch,
      recommendedLayer: 'V-FEMA-HTCH',
      recommendedScale: femaHatch.defaultScale ?? 1,
      recommendedAngle: 0,
      source: 'fema-zone',
      confidence: 0.92,
    };
  }

  // 4. Semantic keyword rules for common survey / civil features
  const SEMANTIC_MAP: Array<{ pattern: RegExp; hatchName: string; layer: string; scale?: number }> = [
    { pattern: /\b(?:solid|filled|opaque|shade)\b/i, hatchName: 'SOLID', layer: 'V-ANNO-PATT', scale: 1 },
    { pattern: /\b(?:bldg|building|house|garage|shed|structure|roof|footprint)\b/i, hatchName: 'ANSI31', layer: 'V-BLDG-PATT', scale: 1 },
    { pattern: /\b(?:conc|concrete|sidewalk|walkway|curb|pad|slab|apron|footing)\b/i, hatchName: 'AR-CONC', layer: 'V-SITE-PAVE', scale: 1 },
    { pattern: /\b(?:asphalt|ac\b|bituminous|pavement|parking|road(?:way)?|street|lane)\b/i, hatchName: 'ASPHALT', layer: 'V-ROAD-PATT', scale: 1 },
    { pattern: /\b(?:gravel|crushed\s*stone|aggregate|stone\s*drive|driveway|dw\b|shoulder)\b/i, hatchName: 'GRAVEL', layer: 'V-SITE-DRIV', scale: 1 },
    { pattern: /\b(?:brick|masonry|paver|patio|courtyard)\b/i, hatchName: 'AR-BRIK', layer: 'V-SITE-PAVE', scale: 1 },
    { pattern: /\b(?:wood|deck|timber|boardwalk|shingle)\b/i, hatchName: 'WOOD', layer: 'V-BLDG-DECK', scale: 1 },
    { pattern: /\b(?:wetland|swamp|marsh|bog|riparian)\b/i, hatchName: 'SWAMP', layer: 'V-WETL-PATT', scale: 1 },
    { pattern: /\b(?:water|pond|lake|stream|creek|river|basin|detention|retention)\b/i, hatchName: 'WATER', layer: 'V-HYDR-PATT', scale: 1 },
    { pattern: /\b(?:riprap|rip-rap|erosion|outfall|gabion)\b/i, hatchName: 'RIPRAP', layer: 'C-STRM-RPRP', scale: 1 },
    { pattern: /\b(?:grass|lawn|turf|sod|landscape|planting|meadow)\b/i, hatchName: 'GRASS', layer: 'V-VEGE-PATT', scale: 1 },
    { pattern: /\b(?:sand|beach|dune|sandy|granular)\b/i, hatchName: 'SAND', layer: 'V-TOPO-SAND', scale: 1 },
    { pattern: /\b(?:earth|soil|ground|loam|fill|embankment|cut|slope)\b/i, hatchName: 'EARTH', layer: 'C-TOPO-PATT', scale: 1 },
    { pattern: /\b(?:mud|sediment|silt|clay)\b/i, hatchName: 'MUDST', layer: 'V-HYDR-PATT', scale: 1 },
    { pattern: /\b(?:cross|grid|mesh|hatch|checkered)\b/i, hatchName: 'CROSS', layer: 'V-ANNO-PATT', scale: 1 },
    { pattern: /\b(?:dot|dots|stipple)\b/i, hatchName: 'DOTS', layer: 'V-ANNO-PATT', scale: 1 },
    { pattern: /\b(?:steel|iron|metal)\b/i, hatchName: 'ANSI32', layer: 'V-STRC-PATT', scale: 1 },
  ];

  for (const rule of SEMANTIC_MAP) {
    if (rule.pattern.test(raw)) {
      const found = getHatchByName(rule.hatchName, custom) ?? STANDARD_HATCHES[1];
      return {
        hatch: found,
        recommendedLayer: rule.layer,
        recommendedScale: rule.scale ?? found.defaultScale ?? 1,
        recommendedAngle: 0,
        source: 'semantic-keyword',
        confidence: 0.86,
      };
    }
  }

  // 5. Default fallback -> ANSI31
  const fallback = getHatchByName('ANSI31', custom) ?? STANDARD_HATCHES[0];
  return {
    hatch: fallback,
    recommendedLayer: 'V-ANNO-PATT',
    recommendedScale: fallback.defaultScale ?? 1,
    recommendedAngle: 0,
    source: 'default',
    confidence: 0.5,
  };
}

// ─── Cached Canvas Tile Renderer for 2D Drawing Canvas ──────────────────────

const tileCache = new Map<string, HTMLCanvasElement>();

/**
 * A hatch tile always represents this many drawing units at scale 1. The
 * canvas renderer maps the bitmap to that footprint, so the pattern spacing is
 * fixed in world coordinates and cannot breathe while zooming.
 */
export const CANVAS_HATCH_WORLD_TILE_UNITS = 64;

export interface CanvasHatchPatternMetrics {
  userScale: number;
  zoomBucket: number;
  pixelSize: number;
  worldTileSize: number;
  /** World units represented by one PAT pattern unit. */
  patternUnitWorld: number;
  /** Pattern-bitmap pixels → world units. */
  scaleToWorld: number;
  /** Source line weight that keeps hatch strokes legible on screen. */
  lineWidthPx: number;
}

/**
 * Resolution/metrics for a world-locked hatch pattern. Only the bitmap
 * resolution follows zoom; the tile's world footprint and pattern spacing do
 * not. This is the distinction that prevents hatches from scaling as the user
 * zooms.
 */
export function getCanvasHatchPatternMetrics(
  options: { scale?: number; zoomScale?: number } = {},
): CanvasHatchPatternMetrics {
  const userScale = Math.max(0.05, options.scale ?? 1);
  const zoom = Math.max(0.02, options.zoomScale ?? 1);
  const zoomBucket = Math.max(0.25, Math.min(8, Math.round(zoom * 4) / 4));
  const pixelSize = Math.max(
    64,
    Math.min(512, Math.round(CANVAS_HATCH_WORLD_TILE_UNITS * zoomBucket)),
  );
  const worldTileSize = CANVAS_HATCH_WORLD_TILE_UNITS * userScale;
  const lineWidthPx = Math.max(
    0.85,
    Math.min(4, (1.15 * pixelSize) / (CANVAS_HATCH_WORLD_TILE_UNITS * zoom)),
  );

  return {
    userScale,
    zoomBucket,
    pixelSize,
    worldTileSize,
    patternUnitWorld: (CANVAS_HATCH_WORLD_TILE_UNITS / 4) * userScale,
    scaleToWorld: worldTileSize / pixelSize,
    lineWidthPx,
  };
}

/**
 * Creates or retrieves a cached repeating offscreen tile canvas for rendering
 * a `CanvasHatch` on `DrawingCanvas` at 60fps.
 */
export function createCanvasHatchTile(
  hatch: HatchDefinition,
  options: {
    scale?: number;
    angleDeg?: number;
    color?: string;
    backgroundColor?: string;
    opacity?: number;
    zoomScale?: number;
    /** Explicit bitmap resolution. Used by the world-locked canvas pattern. */
    pixelSize?: number;
    /** Explicit source line weight for the requested zoom bucket. */
    lineWidthPx?: number;
  } = {}
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;

  const userScale = Math.max(0.05, options.scale ?? hatch.defaultScale ?? 1);
  const extraAngle = options.angleDeg ?? 0;
  const color = options.color || hatch.previewColor || '#22d3ee';
  const bgColor = options.backgroundColor || '';
  const opacity = Math.max(0.02, Math.min(1, options.opacity ?? 0.45));
  // Quantize zoomScale bucket slightly so smooth wheel zoom doesn't thrash cache
  const zoomBucket = Math.max(0.25, Math.min(8, Math.round((options.zoomScale ?? 1) * 4) / 4));

  const cacheKey = [
    hatch.name,
    hatch.lines.length,
    userScale.toFixed(2),
    extraAngle.toFixed(1),
    color,
    bgColor,
    opacity.toFixed(2),
    zoomBucket.toFixed(2),
    options.pixelSize ?? 'auto',
    (options.lineWidthPx ?? 1.15).toFixed(2),
  ].join('|');

  const cached = tileCache.get(cacheKey);
  if (cached) return cached;

  // Legacy preview path: tile pixels double as pattern units. Canvas hatches
  // use pixelSize + createCanvasHatchPattern so their world footprint stays
  // fixed while only the bitmap resolution changes with zoom.
  const rawTilePx = Math.round(64 * userScale * zoomBucket);
  const tileSize = options.pixelSize
    ? Math.max(16, Math.min(1024, Math.round(options.pixelSize)))
    : Math.max(24, Math.min(512, rawTilePx));

  const tile = document.createElement('canvas');
  tile.width = tileSize;
  tile.height = tileSize;
  const tctx = tile.getContext('2d');
  if (!tctx) return null;

  tctx.clearRect(0, 0, tileSize, tileSize);

  if (bgColor) {
    tctx.save();
    tctx.globalAlpha = opacity * 0.5;
    tctx.fillStyle = bgColor;
    tctx.fillRect(0, 0, tileSize, tileSize);
    tctx.restore();
  }

  if (hatch.name.toUpperCase() === 'SOLID') {
    tctx.save();
    tctx.globalAlpha = opacity;
    tctx.fillStyle = color;
    tctx.fillRect(0, 0, tileSize, tileSize);
    tctx.restore();
  } else if (hatch.lines.length > 0) {
    tctx.save();
    tctx.globalAlpha = opacity;
    tctx.strokeStyle = color;
    tctx.fillStyle = color;
    tctx.lineWidth = options.lineWidthPx ?? 1.15;

    // Render pattern lines rotated by extraAngle
    const patUnitPx = tileSize / 4;
    const diag = Math.hypot(tileSize, tileSize) * 1.5;

    for (const l of hatch.lines) {
      const totalAngleRad = ((l.angle + extraAngle) * Math.PI) / 180;
      const cos = Math.cos(totalAngleRad);
      const sin = Math.sin(totalAngleRad);

      const rawDelta = l.deltaY !== 0 ? Math.abs(l.deltaY) : l.deltaX !== 0 ? Math.abs(l.deltaX) : 0.125;
      const spacingPx = Math.max(4, rawDelta * patUnitPx);
      const lineCount = Math.ceil(diag / spacingPx) + 2;

      if (l.dashes && l.dashes.length > 0) {
        const dashArr: number[] = [];
        for (const d of l.dashes) {
          if (d === 0) {
            dashArr.push(1.5, Math.max(3, Math.abs(l.dashes[1] ?? 0.125) * patUnitPx));
            break;
          }
          dashArr.push(Math.max(1.5, Math.abs(d) * patUnitPx));
        }
        tctx.setLineDash(dashArr);
      } else {
        tctx.setLineDash([]);
      }

      for (let i = -lineCount; i <= lineCount; i++) {
        const perpX = -sin * i * spacingPx + l.originX * patUnitPx;
        const perpY = cos * i * spacingPx + l.originY * patUnitPx;
        const cx = tileSize / 2 + perpX;
        const cy = tileSize / 2 - perpY;

        tctx.beginPath();
        tctx.moveTo(cx - cos * diag, cy - sin * diag);
        tctx.lineTo(cx + cos * diag, cy + sin * diag);
        tctx.stroke();
      }
    }

    tctx.setLineDash([]);
    tctx.restore();
  }

  if (tileCache.size > 150) {
    const firstKey = tileCache.keys().next().value;
    if (firstKey) tileCache.delete(firstKey);
  }
  tileCache.set(cacheKey, tile);
  return tile;
}

/**
 * Builds a canvas pattern whose repeat is locked to drawing units. The tile is
 * rendered at a zoom-appropriate resolution, then transformed to its fixed
 * world footprint before the canvas applies the viewport zoom.
 */
export function createCanvasHatchPattern(
  ctx: CanvasRenderingContext2D,
  hatch: HatchDefinition,
  options: {
    scale?: number;
    angleDeg?: number;
    color?: string;
    backgroundColor?: string;
    opacity?: number;
    zoomScale?: number;
  } = {},
): CanvasPattern | null {
  const metrics = getCanvasHatchPatternMetrics({
    scale: options.scale ?? hatch.defaultScale,
    zoomScale: options.zoomScale,
  });
  const tile = createCanvasHatchTile(hatch, {
    scale: 1,
    angleDeg: options.angleDeg,
    color: options.color,
    backgroundColor: options.backgroundColor,
    opacity: options.opacity,
    pixelSize: metrics.pixelSize,
    lineWidthPx: metrics.lineWidthPx,
  });
  if (!tile) return null;

  const pattern = ctx.createPattern(tile, 'repeat');
  if (!pattern) return null;

  if (typeof DOMMatrix !== 'undefined') {
    pattern.setTransform(new DOMMatrix([
      metrics.scaleToWorld,
      0,
      0,
      metrics.scaleToWorld,
      0,
      0,
    ]));
  }

  return pattern;
}

