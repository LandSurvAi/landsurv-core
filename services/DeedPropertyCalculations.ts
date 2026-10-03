/**
 * Deed Property Calculations Service
 *
 * Thin re-export of the shared, dependency-free deed-math implementation in
 * backend/src/shared/deedMath.ts (the canonical source, required to live
 * under backend/src because of backend/tsconfig.json's `rootDir: "./src"`).
 * Keeping one implementation avoids frontend/backend math drift between the
 * web app and the AI gateway tool-calling layer.
 *
 * Used by LSVZ Meta-Agent (and the AI gateway's deed tools) to answer
 * questions about deed properties: acreage (Shoelace formula), perimeter,
 * bounding box, and coordinate summaries.
 */

export type {
  DeedVertex,
  DeedTract,
  DeedProperties,
} from '../backend/src/shared/deedMath';

export {
  calculatePolygonAreaShoelace,
  squareFeetToAcres,
  calculateDistance,
  calculatePerimeter,
  getBoundingBox,
  calculateDeedProperties,
  formatAcreage,
  formatDistance,
  formatCoordinates,
  createDeedPropertySummary,
  default,
} from '../backend/src/shared/deedMath';
