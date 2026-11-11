// utils/geometryOperations.ts
// Pure utility functions for point and line geometry operations - NO STATE, NO HOOKS

import { SurveyPoint, SurveyLine, PointList } from '../types';
import { swapBearingDirection } from './cogo';

/**
 * Add a new point to the working point list
 */
export const addPointToList = (
  newPoint: SurveyPoint,
  pointLists: PointList[]
): PointList[] => {
  // Check if point already exists
  if (pointLists.flatMap(l => l.points).some(p => p.pointNumber === newPoint.pointNumber)) {
    throw new Error(`Point number "${newPoint.pointNumber}" already exists.`);
  }

  const workingListIndex = pointLists.findIndex(l => l.id === 'working');
  if (workingListIndex === -1) {
    return [...pointLists, {
      id: 'working',
      name: 'Unsaved Points',
      points: [newPoint],
      isVisible: true
    }];
  }

  const newLists = [...pointLists];
  newLists[workingListIndex] = {
    ...newLists[workingListIndex],
    points: [...newLists[workingListIndex].points, newPoint]
  };
  return newLists;
};

/**
 * Update a single point in the point lists
 */
export const updatePointInLists = (
  updatedPoint: SurveyPoint,
  pointLists: PointList[]
): PointList[] => {
  return pointLists.map(list => ({
    ...list,
    points: list.points.map(p =>
      p.pointNumber === updatedPoint.pointNumber ? updatedPoint : p
    )
  }));
};

/**
 * Delete a point from the point lists by point number
 */
export const deletePointFromLists = (
  pointNumber: string,
  pointLists: PointList[]
): PointList[] => {
  return pointLists.map(list => ({
    ...list,
    points: list.points.filter(p => p.pointNumber !== pointNumber)
  }));
};

/**
 * Update label offset for a specific point
 */
export const updatePointLabelOffset = (
  pointNumber: string,
  offset: { x: number; y: number },
  pointLists: PointList[]
): PointList[] => {
  return pointLists.map(list => ({
    ...list,
    points: list.points.map(p =>
      p.pointNumber === pointNumber ? { ...p, labelOffset: offset } : p
    )
  }));
};

/**
 * Update per-point annotation leader offset (world units, dx/dy).
 * dx < 0 mirrors the annotation note to the left of the point.
 */
export const updatePointAnnotationOffset = (
  pointNumber: string,
  offset: { dx: number; dy: number },
  pointLists: PointList[]
): PointList[] => {
  return pointLists.map(list => ({
    ...list,
    points: list.points.map(p =>
      p.pointNumber === pointNumber ? { ...p, annotationOffset: offset } : p
    )
  }));
};

/**
 * Add a new line to the lines list
 */
export const addLineToList = (newLine: SurveyLine): SurveyLine => {
  // Generate a unique ID if not provided
  return {
    ...newLine,
    id: newLine.id || `line-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  };
};

/**
 * CAD-style layer inheritance for newly drawn segments.
 *
 * When a segment is drawn between two points and either endpoint already
 * terminates an existing line, the new segment continues that line's layer
 * instead of the ambient drawing layer. The start (`from`) connection wins when
 * the two ends land on lines with different layers, and full circles (which
 * encode from === to) are never treated as a connecting entity.
 */
export const inheritConnectedLayer = (newLine: SurveyLine, lines: SurveyLine[]): SurveyLine => {
  if (newLine.from === newLine.to) return newLine; // circle — no free endpoint

  const layerOf = (line: SurveyLine | undefined): string | null =>
    line && typeof line.layer === 'string' && line.layer.length > 0 ? line.layer : null;

  const candidates = lines.filter(line => line.from !== line.to && layerOf(line) !== null);
  const touches = (line: SurveyLine, pointNumber: string): boolean =>
    line.from === pointNumber || line.to === pointNumber;

  const startLayer = layerOf(candidates.find(line => touches(line, newLine.from)));
  if (startLayer) return { ...newLine, layer: startLayer };

  const endLayer = layerOf(candidates.find(line => touches(line, newLine.to)));
  if (endLayer) return { ...newLine, layer: endLayer };

  return newLine;
};

/** Minimal point shape needed to infer a connecting line's layer. */
export interface ConnectedPointLayerHint {
  layer?: string | null;
  description?: string | null;
}

/**
 * Guess a line layer from the points a segment connects.
 *
 * Field-to-finish description keys are the strongest signal: a point's
 * description resolves to its code's line layer. When the description is
 * unknown, the point's own CAD layer is mapped to a line layer through the
 * standard, falling back to the point layer itself. The start endpoint wins
 * when the two ends disagree, mirroring {@link inheritConnectedLayer}.
 * Circles (from === to) have no second point and never guess.
 */
export const guessLineLayerFromPoints = (
  newLine: Pick<SurveyLine, 'from' | 'to'>,
  getPoint: (pointNumber: string) => ConnectedPointLayerHint | undefined,
  resolveDescriptionLineLayer?: (description: string) => string | null | undefined,
  resolvePointLayerLineLayer?: (pointLayer: string) => string | null | undefined,
): string | null => {
  if (newLine.from === newLine.to) return null;

  const layerFor = (pointNumber: string): string | null => {
    const point = getPoint(pointNumber);
    if (!point) return null;

    const description = point.description?.trim();
    if (description && resolveDescriptionLineLayer) {
      const resolved = resolveDescriptionLineLayer(description);
      if (resolved) return resolved;
    }

    const pointLayer = point.layer?.trim();
    if (!pointLayer) return null;
    const mapped = resolvePointLayerLineLayer?.(pointLayer);
    return mapped || pointLayer;
  };

  return layerFor(newLine.from) ?? layerFor(newLine.to);
};

/** Minimal code definition needed to resolve a layer from a field description. */
export interface LineLayerCodeHint {
  code: string;
  lineLayer?: string | null;
  pointLayer?: string | null;
}

/**
 * Conservative code-prefix fallback for field descriptions the CAD Manager
 * cannot resolve. Handles common survey shorthand such as "BLD" for "BLDG"
 * or "BLD1" for a numbered building shot. Two-letter tokens are ignored so
 * short prefixes cannot collide with unrelated codes. When several codes share
 * the prefix, the shortest one wins ("BLDG" over "BLDGS").
 */
export const resolveLineLayerByCodePrefix = (
  description: string,
  codes: ReadonlyArray<LineLayerCodeHint>,
): string | null => {
  const tokens = description.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  for (const rawToken of tokens) {
    const token = rawToken.replace(/\d+$/, '');
    if (token.length < 3) continue;

    let bestCodeLength = Infinity;
    let bestLayer: string | null = null;
    for (const code of codes) {
      const key = code.code.trim().toUpperCase();
      if (!key || !key.startsWith(token) || !code.lineLayer) continue;
      if (key.length < bestCodeLength) {
        bestCodeLength = key.length;
        bestLayer = code.lineLayer;
      }
    }
    if (bestLayer) return bestLayer;
  }
  return null;
};

/**
 * Delete a line from the lines list by ID. Matches either the explicit
 * `line.id` or the composite `from-to` key used by selection tooling.
 */
export const deleteLineFromList = (
  lineId: string,
  lines: SurveyLine[]
): SurveyLine[] => {
  return lines.filter(line => {
    if (line.id === lineId) return false;
    if (`${line.from}-${line.to}` === lineId) return false;
    if (`${line.to}-${line.from}` === lineId) return false;
    return true;
  });
};

/**
 * Update label offset for a specific line
 */
export const updateLineLabelOffset = (
  lineId: string,
  offset: { x: number; y: number },
  lines: SurveyLine[]
): SurveyLine[] => {
  return lines.map(line => {
    const currentLineId = line.id || `${line.from}-${line.to}`;
    return currentLineId === lineId ? { ...line, labelOffset: offset } : line;
  });
};

/**
 * Toggle line label rotation
 */
export const toggleLineLabelRotation = (
  lineId: string,
  lines: SurveyLine[]
): SurveyLine[] => {
  return lines.map(line => {
    const currentLineId = line.id || `${line.from}-${line.to}`;
    if (currentLineId === lineId) {
      // Toggle between 0 and 180 degrees
      const currentRotation = line.labelRotation || 0;
      return { ...line, labelRotation: currentRotation === 0 ? 180 : 0 };
    }
    return line;
  });
};

/**
 * Swap the bearing direction of a line
 * For example: "S 40°30'00\" W" becomes "N 40°30'00\" E"
 * This reverses the bearing and swaps the from/to points
 */
export const swapLineBearingDirection = (
  lineId: string,
  lines: SurveyLine[]
): SurveyLine[] => {
  return lines.map(line => {
    const currentLineId = line.id || `${line.from}-${line.to}`;
    if (currentLineId === lineId && line.bearing) {
      // Swap bearing direction and swap from/to points
      const newBearing = swapBearingDirection(line.bearing);
      return {
        ...line,
        bearing: newBearing,
        from: line.to,
        to: line.from
      };
    }
    return line;
  });
};
