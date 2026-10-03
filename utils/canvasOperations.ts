// utils/canvasOperations.ts
// Pure utility functions for canvas and view operations - NO STATE, NO HOOKS

import { PointList } from '../types';

/**
 * Hide all point lists on canvas
 */
export const hideAllPointLists = (pointLists: PointList[]): PointList[] => {
  return pointLists.map(list => ({ ...list, isVisible: false }));
};

/**
 * Show all point lists on canvas
 */
export const showAllPointLists = (pointLists: PointList[]): PointList[] => {
  return pointLists.map(list => ({ ...list, isVisible: true }));
};

/**
 * Clear all cut sheet data
 */
export const clearCutSheetData = (): any[] => {
  return [];
};

/**
 * Toggle fullscreen state
 */
export const toggleFullscreen = (currentState: boolean): boolean => {
  return !currentState;
};
