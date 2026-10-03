/**
 * Civil 3D layer priming for the CAD Manager.
 *
 * Workflow this supports: the surveyor opens a blank drawing that already
 * carries their company layer table, connects the session and pulls the layers.
 * That primes LandSurv.ai with the real layer palette, so features drawn here
 * land on the company's layers and live-sync straight back into the drawing.
 *
 * Pulling is an adoption, not a merge: the drawing's table becomes a NEW
 * standard (its own CAD Manager session) with one code per layer, because every
 * agent-facing layer lookup is driven by codes rather than the layer list.
 *
 * Two details matter for the round trip:
 *   - Colour must be stored the way the connector reports it (#RRGGBB). The
 *     CAD side normalises every layer colour to RGB, so comparing an ACI index
 *     against it would mark every layer as different on every poll.
 *   - Lineweight must be the AutoCAD hundredths-of-a-millimetre integer that
 *     the connector emits (25, not 0.25), and unset for ByLayer/ByBlock/Default.
 */
import type { CodeDefinition, LayerDefinition, StandardDefinition } from '../contexts/types/CadManager.types';

/** Layer shape returned by the connector's `get_layers_from_drawing` tool. */
export interface PulledDrawingLayer {
  name: string;
  colorIndex?: number;
  /** ARGB hex, e.g. "FFFF0000", as produced by Color.ColorValue.ToArgb(). */
  colorRgb?: string;
  linetype?: string;
  /**
   * AutoCAD LineWeight enum name, e.g. "LineWeight025" or "ByLayer".
   * Sync snapshots report the same value as the hundredths-mm integer.
   */
  lineWeight?: string | number;
  isOff?: boolean;
  isFrozen?: boolean;
  isLocked?: boolean;
  isPlottable?: boolean;
  description?: string;
}

/** Layer record carried by a sync snapshot (`CadSnapshot.CaptureLayers`). */
export interface SnapshotLayerRecord {
  name: string;
  /** Already normalized to "#RRGGBB" by the connector. */
  color?: string | null;
  lineType?: string | null;
  lineWeight?: number | null;
}

/**
 * A sync snapshot carries the same layer table the pull tool returns, just
 * under different field names. Normalizing here lets the wizard's "Use layers
 * from CAD" answer adopt the drawing exactly like the pull button does.
 */
export function snapshotLayersToPulled(
  records: SnapshotLayerRecord[] | undefined | null,
): PulledDrawingLayer[] {
  if (!records || records.length === 0) return [];
  return records
    .filter(rec => rec && typeof rec.name === 'string' && rec.name.trim() !== '')
    .map(rec => ({
      name: rec.name,
      colorRgb: rec.color ?? undefined,
      linetype: rec.lineType ?? undefined,
      lineWeight: rec.lineWeight ?? undefined,
    }));
}

/** ARGB hex from the connector → "#RRGGBB" matching the CAD snapshot form. */
export function normalizeLayerColor(argbHex: string | undefined | null): string | undefined {
  if (!argbHex) return undefined;
  const hex = argbHex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6,8}$/.test(hex)) return undefined;
  const rgb = hex.length === 8 ? hex.slice(2) : hex;
  return `#${rgb.toUpperCase()}`;
}

/**
 * AutoCAD LineWeight enum name → the hundredths-mm integer used on the wire.
 * ByLayer/ByBlock/Default carry no concrete width.
 */
export function normalizeLineWeight(value: string | number | undefined | null): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : undefined;

  const text = value.trim();
  if (!text || /^by(layer|block)$/i.test(text) || /default/i.test(text)) return undefined;

  const match = /(-?\d+(?:\.\d+)?)/.exec(text);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
}

/**
 * Turn the pulled drawing layers into layer definitions for the standard.
 *
 * The drawing is authoritative for name, colour, linetype and lineweight. Any
 * description the AI produced for a layer is kept when the drawing itself has
 * none, and point/line roles are inferred from the standard's codes.
 */
export function buildLayerDefinitionsFromDrawing(
  pulled: PulledDrawingLayer[] | undefined | null,
  standard?: StandardDefinition | null,
): LayerDefinition[] {
  if (!pulled || pulled.length === 0) return [];

  const pointLayers = new Set<string>();
  const lineLayers = new Set<string>();
  for (const code of standard?.codes || []) {
    if (code.pointLayer) pointLayers.add(code.pointLayer.trim().toUpperCase());
    if (code.lineLayer) lineLayers.add(code.lineLayer.trim().toUpperCase());
  }

  const aiDescriptions = new Map<string, string>();
  for (const existing of standard?.layers || []) {
    if (existing.name && existing.description) {
      aiDescriptions.set(existing.name.trim().toUpperCase(), existing.description);
    }
  }

  const seen = new Set<string>();
  const definitions: LayerDefinition[] = [];

  for (const layer of pulled) {
    const name = (layer.name || '').trim();
    if (!name) continue;

    const key = name.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const definition: LayerDefinition = { name };

    if (typeof layer.colorIndex === 'number' && layer.colorIndex >= 0) {
      definition.color = layer.colorIndex;
    }
    const colorRgb = normalizeLayerColor(layer.colorRgb);
    if (colorRgb) definition.colorRgb = colorRgb;

    if (layer.linetype) definition.lineType = layer.linetype;

    const lineWeight = normalizeLineWeight(layer.lineWeight);
    if (lineWeight !== undefined) definition.lineWeight = lineWeight;

    const description = (layer.description || '').trim() || aiDescriptions.get(key);
    if (description) definition.description = description;

    if (pointLayers.has(key)) definition.isPointLayer = true;
    if (lineLayers.has(key)) definition.isLineLayer = true;

    definitions.push(definition);
  }

  return definitions;
}

/**
 * Attach the drawing's layer table to a standard, replacing any layer list the
 * AI inferred. Pulling layers is an authoritative import, not a merge.
 */
export function primeStandardWithDrawingLayers(
  standard: StandardDefinition,
  pulled: PulledDrawingLayer[] | undefined | null,
): StandardDefinition {
  const layers = buildLayerDefinitionsFromDrawing(pulled, standard);
  if (layers.length === 0) return standard;
  return { ...standard, layers };
}

// ── Standard generation ──────────────────────────────────────────────────────

/** What a drawing layer is for, decided from its name. */
export type DrawingLayerRole = 'point' | 'line' | 'annotation' | 'skip';

/** System/bookkeeping layers that must never become survey codes. */
const SKIP_LAYERS = new Set(['0', 'DEFPOINTS', 'ASHADE']);

const POINT_SEGMENTS =
  /^(NODE|NODES|PNT|PNTS|POINT|POINTS|PT|PTS|MON|MONU|MONUMENT|CTRL|CONTROL|BM|BENCH|BENCHMARK|SPOT|SYMB|SYMBOL|SYMBOLS)$/;

const ANNOTATION_SEGMENTS =
  /^(ANNO|TEXT|TXT|LABEL|LABELS|LBL|NOTE|NOTES|DIM|DIMS|TITLE|TTLB|IDEN|PATT|HATCH|LEGEND|TABLE|BORD|BORDER|VPORT|SHEET|KEYNOTE)$/;

/** Single-letter A/E/C discipline designators and the category they imply. */
const DISCIPLINES: Record<string, string> = {
  A: 'Architectural',
  C: 'Civil',
  E: 'Electrical',
  F: 'Fire Protection',
  G: 'General',
  H: 'Hazardous Materials',
  I: 'Interiors',
  L: 'Landscape',
  M: 'Mechanical',
  P: 'Plumbing',
  Q: 'Equipment',
  R: 'Resource',
  S: 'Structural',
  T: 'Telecommunications',
  V: 'Survey',
  X: 'Other',
  Z: 'Contractor',
};

function splitLayerName(name: string): string[] {
  return name
    .split(/[-_.\s]+/)
    .map(part => part.trim().toUpperCase())
    .filter(Boolean);
}

/**
 * Decide what a pulled layer is for. Name-based because that is all a layer
 * table carries — a blank company drawing has no geometry to learn from.
 */
export function classifyDrawingLayer(name: string | undefined | null): DrawingLayerRole {
  const raw = (name || '').trim();
  if (!raw) return 'skip';
  if (SKIP_LAYERS.has(raw.toUpperCase())) return 'skip';
  // Xref-dependent layers ("xref|layer") and AutoCAD internals aren't authorable.
  if (raw.includes('|') || raw.startsWith('_') || raw.startsWith('*')) return 'skip';

  const segments = splitLayerName(raw);
  if (segments.some(seg => ANNOTATION_SEGMENTS.test(seg))) return 'annotation';
  if (segments.some(seg => POINT_SEGMENTS.test(seg))) return 'point';
  return 'line';
}

/**
 * Field code for a layer: the layer name minus its discipline designator, so
 * "V-ROAD-CNTR" becomes "ROAD-CNTR". Falls back to the full name and then to a
 * numeric suffix so every layer keeps a unique, traceable code.
 */
function deriveCode(name: string, taken: Set<string>): string {
  const segments = splitLayerName(name);
  if (segments.length > 1 && segments[0].length === 1 && DISCIPLINES[segments[0]]) {
    segments.shift();
  }

  const preferred = segments.join('-') || name.trim().toUpperCase();
  if (!taken.has(preferred)) return preferred;

  const full = name.trim().toUpperCase();
  if (!taken.has(full)) return full;

  let suffix = 2;
  while (taken.has(`${preferred}-${suffix}`)) suffix++;
  return `${preferred}-${suffix}`;
}

function normalizeLinetypeName(linetype: string | undefined | null): string {
  const text = (linetype || '').trim();
  if (!text || /^by(layer|block)$/i.test(text)) return 'CONTINUOUS';
  return text.toUpperCase();
}

/**
 * Turn a drawing's layer table into a complete standard.
 *
 * This is the whole point of pulling layers: a layer list alone is inert,
 * because every agent-facing lookup (`getAllLayers`, the prompt layer table,
 * point/line layer resolution) is driven by CODES. Generating one code per
 * layer creates those associations, so anything LandSurv.ai draws afterwards
 * lands on the company's own layers and live-syncs straight back.
 */
export function buildStandardFromDrawingLayers(
  pulled: PulledDrawingLayer[] | undefined | null,
  drawingName: string,
  options?: { descriptions?: Map<string, string> },
): StandardDefinition {
  const label = (drawingName || 'Civil 3D').trim() || 'Civil 3D';
  const layers = (pulled || []).filter(l => l && (l.name || '').trim());

  // A line code still needs somewhere to put its points; prefer the drawing's
  // own point layer so nothing is invented outside the company table.
  const defaultPointLayer =
    layers.find(l => classifyDrawingLayer(l.name) === 'point')?.name?.trim();

  const taken = new Set<string>();
  const seenLayers = new Set<string>();
  const codes: CodeDefinition[] = [];

  for (const layer of layers) {
    const name = layer.name.trim();
    const key = name.toUpperCase();
    if (seenLayers.has(key)) continue;
    seenLayers.add(key);

    const role = classifyDrawingLayer(name);
    if (role === 'skip') continue;

    const code = deriveCode(name, taken);
    taken.add(code);

    const described = (layer.description || '').trim()
      || options?.descriptions?.get(key)
      || code.replace(/-/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());

    const discipline = splitLayerName(name)[0];
    const definition: CodeDefinition = {
      code,
      description: described,
      pointLayer: role === 'line' ? (defaultPointLayer || name) : name,
      lineType: normalizeLinetypeName(layer.linetype),
    };
    if (role === 'line') definition.lineLayer = name;
    if (role === 'annotation') definition.category = 'Annotation';
    else if (discipline && discipline.length === 1 && DISCIPLINES[discipline]) {
      definition.category = DISCIPLINES[discipline];
    }

    codes.push(definition);
  }

  const base: StandardDefinition = {
    name: `${label} Layers`,
    version: '1.0',
    description: `Layer standard pulled from ${label}`,
    codes,
    lastUpdated: new Date().toISOString(),
    source: label,
  };

  return { ...base, layers: buildLayerDefinitionsFromDrawing(layers, base) };
}
