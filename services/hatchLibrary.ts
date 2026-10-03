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
    name: 'ANSI31',
    description: 'ANSI Iron, Brick & Stone masonry — 45° diagonal lines',
    isAcadStandard: true,
    category: 'standard',
    usage: 'Steel sections, general material indication',
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
