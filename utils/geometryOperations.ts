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
