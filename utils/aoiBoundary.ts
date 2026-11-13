import type { AoiBoundary, SurveyLine } from '../types.ts';

/** AOI linework deliberately uses `type: 'inclusion'` so every existing
 *  inclusion clipper (parcels, soils, flood, contours, TIN, Gimbal) works
 *  unchanged. The prefix is the only thing that separates an AOI from an
 *  ordinary inclusion boundary. */
export const AOI_POLYLINE_PREFIX = 'aoi_';

export function createAoiPolylineId(): string {
  return `${AOI_POLYLINE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isAoiPolylineId(polylineId: string | null | undefined): boolean {
  return Boolean(polylineId?.startsWith(AOI_POLYLINE_PREFIX));
}

export interface AoiBuildResult {
  boundary: AoiBoundary;
  lines: SurveyLine[];
}

export interface AoiBuildMetadata {
  source: AoiBoundary['source'];
  address?: string;
  bboxWgs84?: [number, number, number, number];
}

const AOI_LAYER = 'L-AOI';

function boundaryFor(
  polylineId: string,
  name: string,
  metadata: AoiBuildMetadata,
): AoiBoundary {
  return {
    id: polylineId,
    polylineId,
    name,
    source: metadata.source,
    address: metadata.address,
    bboxWgs84: metadata.bboxWgs84,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Build a closed AOI from ordered world vertices. The resulting segments are
 * inclusion-typed and carry one shared `aoi_` polyline id.
 */
export function buildAoiFromVertices(
  vertices: Array<{ easting: number; northing: number }>,
  name: string,
  metadata: AoiBuildMetadata = { source: 'drawn' },
): AoiBuildResult {
  const clean = vertices.filter(v =>
    Number.isFinite(v.easting) && Number.isFinite(v.northing),
  );
  const polylineId = createAoiPolylineId();
  const boundary = boundaryFor(polylineId, name.trim() || 'AOI', metadata);
  if (clean.length < 3) return { boundary, lines: [] };

  const lines: SurveyLine[] = [];
  for (let i = 0; i < clean.length; i++) {
    const from = clean[i];
    const to = clean[(i + 1) % clean.length];
    if (Math.hypot(to.easting - from.easting, to.northing - from.northing) < 1e-6) continue;
    lines.push({
      id: `${polylineId}_${lines.length}`,
      from: `AOI-${i + 1}`,
      to: `AOI-${(i + 1) % clean.length + 1}`,
      fromPt: { x: from.easting, y: from.northing, z: 0 },
      toPt: { x: to.easting, y: to.northing, z: 0 },
      type: 'inclusion',
      layer: AOI_LAYER,
      lineType: 'CONTINUOUS',
      polylineId,
    });
  }
  return { boundary, lines };
}

/**
 * Copy one existing inclusion boundary into a separate AOI. This is the
 * "inclusion copied and renamed" path: geometry and point refs are preserved,
 * but the AOI gets its own polyline id and lifecycle.
 */
export function buildAoiFromInclusionLines(
  sourceLines: SurveyLine[],
  name: string,
  metadata: Omit<AoiBuildMetadata, 'source'> = {},
): AoiBuildResult {
  const usable = sourceLines.filter(line => line.type === 'inclusion');
  const polylineId = createAoiPolylineId();
  const boundary = boundaryFor(polylineId, name.trim() || 'AOI', {
    ...metadata,
    source: 'inclusion',
  });
  const lines = usable.map((line, index) => ({
    ...line,
    id: `${polylineId}_${index}`,
    polylineId,
    type: 'inclusion' as const,
    layer: AOI_LAYER,
    hidden: undefined,
  }));
  return { boundary, lines };
}
