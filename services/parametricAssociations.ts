// Parametric associations link generated geometry back to the object that
// defines it. The first two kinds are perpendicular offsets from a Centerline
// (road models and `cl_draw_offsets`) and points placed at a station/offset on
// a Centerline (stationing skills).
//
// The metadata lives on the generated entity itself so it survives the normal
// session save/load path. Regeneration is pure: given the current centerlines
// and the current entities, rebuild every associated polyline or point.

import type {
  Centerline,
  CenterlineOffsetAssociation,
  CenterlineStationPointAssociation,
  SurveyLine,
  SurveyPoint,
} from '../types';
import { calculatePointFromStationOffset } from '../utils/stationing';

export type CenterlineOffsetGenerator = (
  cl: Centerline,
  offsetFt: number,
  layer: string,
  lineType: string,
  polyPrefix: string,
) => SurveyLine[];

export interface CenterlineAssociationOptions {
  id?: string;
  ownerKind?: 'road-model' | 'manual';
  ownerId?: string;
  label?: string;
}

let associationCounter = 0;

/** Geometry-only signature; display names and begin-station labels do not rebuild geometry. */
export const centerlineGeometrySignature = (cl: Centerline): string => {
  const pis = (cl.pis ?? [])
    .map(pi => `${pi.easting.toFixed(4)},${pi.northing.toFixed(4)},${pi.curveRadius ?? 0}`)
    .join(';');
  return `${cl.beginStation.toFixed(4)}|${pis}`;
};

export const createCenterlineOffsetAssociation = (
  cl: Centerline,
  offsetFt: number,
  layer: string,
  lineType: string,
  polylinePrefix: string,
  options: CenterlineAssociationOptions = {},
): CenterlineOffsetAssociation => ({
  id:
    options.id ??
    `assoc-cl-${cl.id}-${++associationCounter}-${Date.now().toString(36)}`,
  kind: 'centerline-offset',
  sourceType: 'centerline',
  sourceId: cl.id,
  sourceName: cl.name,
  offsetFt,
  layer,
  lineType,
  polylinePrefix,
  ownerKind: options.ownerKind,
  ownerId: options.ownerId,
  label: options.label,
  sourceSignature: centerlineGeometrySignature(cl),
});

export const tagCenterlineOffsetLines = (
  lines: SurveyLine[],
  association: CenterlineOffsetAssociation,
): SurveyLine[] =>
  lines.map(line => ({
    ...line,
    parametricAssociation: { ...association },
  }));

export const createCenterlineStationPointAssociation = (
  cl: Centerline,
  station: number,
  offsetFt: number,
  options: CenterlineAssociationOptions = {},
): CenterlineStationPointAssociation => ({
  id:
    options.id ??
    `assoc-cl-pt-${cl.id}-${++associationCounter}-${Date.now().toString(36)}`,
  kind: 'centerline-station-point',
  sourceType: 'centerline',
  sourceId: cl.id,
  sourceName: cl.name,
  station,
  offsetFt,
  ownerKind: options.ownerKind,
  ownerId: options.ownerId,
  label: options.label,
  sourceSignature: centerlineGeometrySignature(cl),
});

export const tagCenterlineStationOffsetPoint = (
  point: SurveyPoint,
  association: CenterlineStationPointAssociation,
): SurveyPoint => ({
  ...point,
  parametricAssociation: { ...association },
});

/**
 * Rebuild every centerline-offset polyline from its source baseline.
 *
 * Associations whose baseline no longer exists are removed, which is the
 * expected parametric behavior when the defining object is deleted. Non-
 * parametric linework passes through untouched. Unknown future association
 * kinds also pass through until a regenerator is registered for them.
 */
export const regenerateParametricAssociations = (
  centerlines: Centerline[],
  lines: SurveyLine[],
  generateOffsets: CenterlineOffsetGenerator,
): SurveyLine[] => {
  const groups = new Map<string, CenterlineOffsetAssociation>();
  for (const line of lines) {
    const association = line.parametricAssociation;
    if (association?.kind === 'centerline-offset' && !groups.has(association.id)) {
      groups.set(association.id, association);
    }
  }
  if (groups.size === 0) return lines;

  const centerlineById = new Map(centerlines.map(cl => [cl.id, cl]));
  const rebuilt = new Map<string, SurveyLine[]>();

  for (const [associationId, association] of groups) {
    const cl = centerlineById.get(association.sourceId);
    if (!cl || (cl.pis?.length ?? 0) < 2) {
      // Source deleted: drop the dependent geometry.
      continue;
    }
    const current: CenterlineOffsetAssociation = {
      ...association,
      sourceName: cl.name,
      sourceSignature: centerlineGeometrySignature(cl),
    };
    const fresh = generateOffsets(
      cl,
      association.offsetFt,
      association.layer,
      association.lineType,
      association.polylinePrefix,
    );
    rebuilt.set(associationId, tagCenterlineOffsetLines(fresh, current));
  }

  const passthrough = lines.filter(line => {
    const association = line.parametricAssociation;
    return !association || association.kind !== 'centerline-offset';
  });

  const next = [...passthrough, ...[...rebuilt.values()].flat()];
  return next.length === lines.length &&
    next.every((line, index) => line === lines[index])
    ? lines
    : next;
};

/**
 * Recompute every station/offset point from its baseline.
 *
 * Unlike linework, an associated point is kept at its last position when the
 * baseline is deleted: survey points are often used by other calculations, so
 * silently deleting them would be destructive. The dead association is dropped
 * so the point simply becomes ordinary geometry again.
 */
export const regenerateCenterlineStationPoints = (
  centerlines: Centerline[],
  points: SurveyPoint[],
): SurveyPoint[] => {
  const centerlineById = new Map(centerlines.map(cl => [cl.id, cl]));
  let changed = false;

  const next = points.map(point => {
    const association = point.parametricAssociation;
    if (!association || association.kind !== 'centerline-station-point') return point;

    const cl = centerlineById.get(association.sourceId);
    if (!cl || (cl.pis?.length ?? 0) < 2) {
      changed = true;
      return { ...point, parametricAssociation: undefined };
    }

    const coords = calculatePointFromStationOffset(
      cl,
      association.station,
      association.offsetFt,
    );
    if (!coords) return point;

    const sourceSignature = centerlineGeometrySignature(cl);
    const samePosition =
      point.northing === coords.northing && point.easting === coords.easting;
    const sameSource =
      association.sourceSignature === sourceSignature &&
      association.sourceName === cl.name;
    if (samePosition && sameSource) return point;

    changed = true;
    return {
      ...point,
      northing: coords.northing,
      easting: coords.easting,
      parametricAssociation: {
        ...association,
        sourceName: cl.name,
        sourceSignature,
      },
    };
  });

  return changed ? next : points;
};

/** Remove one association group by id (used when a road model is cleared). */
export const removeParametricAssociation = (
  lines: SurveyLine[],
  associationId: string,
): SurveyLine[] =>
  lines.filter(line => line.parametricAssociation?.id !== associationId);
