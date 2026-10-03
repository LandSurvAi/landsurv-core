/**
 * Lightweight DXF Layer Parser
 *
 * Extracts layer definitions and entity statistics from raw DXF text content
 * without any heavy dependencies.  Used by the Drafting Style Library to give
 * the user a quick summary of what's in their uploaded example file.
 *
 * Parses only the data we care about for the Style Library:
 *   - Layer table entries  → name, linetype, color
 *   - Entity sections      → which layer each entity lives on + entity type
 */

import type { DraftingStyleLayer } from '../types.ts';

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Splits DXF text into (groupCode, value) pairs. */
function* tokenize(dxf: string): Generator<[number, string]> {
  const lines = dxf.split(/\r?\n/);
  let i = 0;
  while (i < lines.length - 1) {
    const code = parseInt(lines[i].trim(), 10);
    const val  = lines[i + 1].trim();
    if (!isNaN(code)) {
      yield [code, val];
    }
    i += 2;
  }
}

// ─── main export ──────────────────────────────────────────────────────────────

export interface DxfParseResult {
  layers: DraftingStyleLayer[];
  /** Top-level stats for display */
  totalEntityCount: number;
  uniqueEntityTypes: string[];
  /** Detected drawing units description, e.g. "INCHES", "FEET" (may be null) */
  units?: string;
}

const UNITS_MAP: Record<number, string> = {
  0: 'Unitless', 1: 'Inches', 2: 'Feet', 3: 'Miles',
  4: 'Millimeters', 5: 'Centimeters', 6: 'Meters', 7: 'Kilometers',
  8: 'Microinches', 9: 'Mils', 10: 'Yards',
  13: 'Decimal Feet', 14: 'Decimal Inches',
};

/**
 * Parse raw DXF text and return layer summaries + overall stats.
 * Gracefully returns an empty result on any error.
 */
export function parseDxfLayers(dxfContent: string): DxfParseResult {
  try {
    return _parse(dxfContent);
  } catch {
    return { layers: [], totalEntityCount: 0, uniqueEntityTypes: [] };
  }
}

function _parse(dxf: string): DxfParseResult {
  // ── Pass 1: LAYER table  ─────────────────────────────────────────────────
  // Defined layer info (name, linetype, color) lives in the TABLES section.
  const layerMap = new Map<string, { lineType?: string; colorIndex?: number }>();

  // Quick regex scan for layer table entries – faster than full tokenize for large files
  const layerTableBlock = dxf.match(/\bLAYER\b[\s\S]*?(?=\bENDTAB\b)/i);
  if (layerTableBlock) {
    // Each layer entry starts with group code 0 = LAYER
    const entries = layerTableBlock[0].split(/(?=^ {2}0\r?\n.*LAYER)/m);
    for (const entry of entries) {
      const nameMatch  = entry.match(/^ {2}2\r?\n(.+)$/m);
      const ltMatch    = entry.match(/^ {2}6\r?\n(.+)$/m);
      const colorMatch = entry.match(/^ 62\r?\n(.+)$/m);
      if (!nameMatch) continue;
      const name = nameMatch[1].trim();
      if (name === 'LAYER') continue; // skip the table header itself
      layerMap.set(name.toUpperCase(), {
        lineType:   ltMatch?.[1]?.trim(),
        colorIndex: colorMatch ? Math.abs(parseInt(colorMatch[1].trim(), 10)) : undefined,
      });
    }
  }

  // ── Pass 2: ENTITIES section ─────────────────────────────────────────────
  // We count entity types per layer using a simple state-machine tokenizer.

  const entityStats = new Map<string, { count: number; types: Set<string> }>();

  // Extract the ENTITIES section text only — avoid re-scanning defs/blocks
  const entitiesStart = dxf.search(/^ {2}0\r?\nSECTION\b[\s\S]*?^ {2}2\r?\nENTITIES\b/m);
  const entitiesText  = entitiesStart >= 0 ? dxf.slice(entitiesStart) : dxf;

  const ENTITY_TYPES = new Set([
    'LINE', 'LWPOLYLINE', 'POLYLINE', 'ARC', 'CIRCLE', 'ELLIPSE',
    'SPLINE', 'INSERT', 'TEXT', 'MTEXT', 'POINT', 'SOLID', 'HATCH',
    'DIMENSION', 'LEADER', 'REGION', 'BODY', 'FACE3D',
  ]);

  let currentEntityType: string | null = null;
  let currentLayer = '0';

  for (const [code, value] of tokenize(entitiesText)) {
    if (code === 0) {
      // Flush previous entity
      if (currentEntityType) {
        const key = currentLayer.toUpperCase();
        if (!entityStats.has(key)) entityStats.set(key, { count: 0, types: new Set() });
        const st = entityStats.get(key)!;
        st.count += 1;
        st.types.add(currentEntityType);
      }
      currentEntityType = ENTITY_TYPES.has(value) ? value : null;
      currentLayer = '0'; // reset for new entity
    } else if (code === 8 && currentEntityType) {
      // Group code 8 = layer name
      currentLayer = value;
    }
  }

  // ── Pass 3: INSUNITS header variable  ────────────────────────────────────
  let units: string | undefined;
  const insuMatch = dxf.match(/\$INSUNITS[\s\S]{0,60}?\n\s*70\s*\n\s*(\d+)/);
  if (insuMatch) {
    const idx = parseInt(insuMatch[1], 10);
    units = UNITS_MAP[idx];
  }

  // ── Merge into DraftingStyleLayer array  ─────────────────────────────────
  const allLayerNames = new Set([
    ...Array.from(layerMap.keys()),
    ...Array.from(entityStats.keys()),
  ]);

  const layers: DraftingStyleLayer[] = [];
  let totalEntityCount = 0;
  const uniqueEntityTypes = new Set<string>();

  for (const name of allLayerNames) {
    if (!name || name === '') continue;
    const def  = layerMap.get(name) ?? {};
    const stat = entityStats.get(name);
    const types = stat ? Array.from(stat.types) : [];
    types.forEach(t => uniqueEntityTypes.add(t));
    const count = stat?.count ?? 0;
    totalEntityCount += count;
    layers.push({
      name,
      entityCount: count,
      entityTypes: types,
      lineType:    def.lineType,
      colorIndex:  def.colorIndex,
    });
  }

  // Sort by entity count descending, then alphabetically
  layers.sort((a, b) => b.entityCount - a.entityCount || a.name.localeCompare(b.name));

  return {
    layers,
    totalEntityCount,
    uniqueEntityTypes: Array.from(uniqueEntityTypes),
    units,
  };
}

/**
 * Build a compact text summary of the DXF parse result for injection
 * into AI system instructions.
 */
export function dxfLayersToContextString(
  fileName: string,
  layers: DraftingStyleLayer[],
  totalEntities: number,
  units?: string,
): string {
  const rows = layers
    .filter(l => l.entityCount > 0)
    .slice(0, 30) // cap — no need to overwhelm the AI
    .map(l => `  ${l.name.padEnd(30)} | ${String(l.entityCount).padStart(5)} | ${l.entityTypes.join(', ')} | ${l.lineType ?? ''}`)
    .join('\n');

  return [
    `File: ${fileName}${units ? ` (units: ${units})` : ''}   Total entities: ${totalEntities}`,
    '  Layer                          | Count | Types             | Linetype',
    '  ' + '-'.repeat(70),
    rows,
  ].join('\n');
}
