/**
 * CAD style resolution shared by the canvas and property editors.
 *
 * Entity color/linetype are optional overrides. When either is absent (or
 * explicitly BYLAYER), the owning layer supplies the value.
 */

export interface CadStyledEntity {
  layer?: string;
  color?: string;
  lineType?: string;
}

export type LayerValueLookup = ReadonlyMap<string, string>;

export function normalizeCadLayerKey(layer?: string | null): string {
  return (layer ?? '').trim().toUpperCase();
}

/** Build a case-insensitive layer-name lookup. */
export function createLayerValueLookup(values?: Record<string, string>): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const [name, value] of Object.entries(values ?? {})) {
    const key = normalizeCadLayerKey(name);
    const resolved = String(value ?? '').trim();
    if (key && resolved && resolved.toUpperCase() !== 'BYLAYER') {
      lookup.set(key, resolved);
    }
  }
  return lookup;
}

export function getLayerValue(lookup: LayerValueLookup, layer?: string | null): string | undefined {
  const key = normalizeCadLayerKey(layer);
  return key ? lookup.get(key) : undefined;
}

/** Object color wins; otherwise fall back to the layer's color. */
export function resolveCadEntityColor(
  entity: CadStyledEntity,
  layerColors: LayerValueLookup,
): string | undefined {
  const own = entity.color?.trim();
  if (own && own.toUpperCase() !== 'BYLAYER') return own;
  return getLayerValue(layerColors, entity.layer);
}

/** Object linetype wins; otherwise fall back to the layer's linetype. */
export function resolveCadEntityLinetype(
  entity: CadStyledEntity,
  layerLinetypes: LayerValueLookup,
): string | undefined {
  const own = entity.lineType?.trim();
  if (own && own.toUpperCase() !== 'BYLAYER') return own;
  return getLayerValue(layerLinetypes, entity.layer);
}
