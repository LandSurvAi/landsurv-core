/** Shared CRS types for the global EPSG registry + proj4 injection pipeline. */

export type CrsKind = 'projected' | 'geographic' | 'other';

export interface CrsDefinition {
  code: number;
  name: string;
  kind: CrsKind;
  proj4: string | null;
  wkt?: string | null;
  /** [west, south, east, north]. west > east means the area crosses the antimeridian. */
  bbox?: [number, number, number, number] | null;
  unit?: string | null;
  area?: string | null;
  country?: string | null;
  accuracy?: number | null;
  /** Reference epoch for time-dependent / epoch-aware datums. */
  epoch?: number | null;
  /** True for plate-motion datums (ITRF, NZGD2000, NAD83(CSRS), …). */
  dynamic?: boolean;
  /** NTv2 grid required for cm-level datum realisation. */
  gridShift?: string | null;
  source?: 'bundled' | 'registry' | 'epsg.io';
}

export interface CrsSuggestion extends CrsDefinition {
  score: number;
  reason: string;
}
