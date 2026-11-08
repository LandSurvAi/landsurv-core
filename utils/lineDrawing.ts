import { formatBearing, inverse } from './cogo.ts';
import type { SurveyLine } from '../types.ts';

/** Every canvas line tool that shares the chained line/arc engine. */
export type ChainLineMode =
  | 'polylines'
  | 'baseline'
  | 'breaklines'
  | 'inclusion'
  | 'exclusion'
  | 'boundary-line';

const CHAIN_LINE_MODES: readonly string[] = [
  'polylines',
  'baseline',
  'breaklines',
  'inclusion',
  'exclusion',
  'boundary-line',
];

export function isChainLineMode(mode: string): mode is ChainLineMode {
  return CHAIN_LINE_MODES.includes(mode);
}

/** SurveyLine type committed by a chain mode. Normal and boundary stay untyped. */
export function chainLineSurveyType(mode: ChainLineMode): SurveyLine['type'] {
  switch (mode) {
    case 'breaklines':
      return 'breakline';
    case 'inclusion':
      return 'inclusion';
    case 'exclusion':
      return 'exclusion';
    default:
      return undefined;
  }
}

export interface ChainLineArc {
  radius: number;
  arcLength: number;
  direction: 'left' | 'right';
  tangentBearing: string;
  chordBearing: string;
}

export interface ChainLinePoint {
  easting: number;
  northing: number;
}

/**
 * Build the SurveyLine for every non-baseline chain mode. Keeping this in one
 * place means features added to the regular L line (bearing/distance labels,
 * arcs, layers, offsets) also apply to inclusion, exclusion, breakline, and
 * boundary linework.
 */
export function buildChainLine(args: {
  mode: ChainLineMode;
  from: string;
  to: string;
  fromPoint: ChainLinePoint;
  toPoint: ChainLinePoint;
  layer?: string;
  arc?: ChainLineArc | null;
}): SurveyLine {
  const { mode, from, to, fromPoint, toPoint, layer, arc } = args;
  const inv = inverse(
    { easting: fromPoint.easting, northing: fromPoint.northing },
    { easting: toPoint.easting, northing: toPoint.northing },
  );
  const bearing = formatBearing(inv.bearing);
  const distance = inv.distance.toFixed(2);
  const fromPt = { x: fromPoint.easting, y: fromPoint.northing, z: 0 };
  const toPt = { x: toPoint.easting, y: toPoint.northing, z: 0 };

  const base: SurveyLine = {
    from,
    to,
    type: chainLineSurveyType(mode),
    layer,
    fromPt,
    toPt,
    // Straight labels and curve callouts read these two fields. For arcs this
    // is the chord bearing/distance, matching the boundary-call convention.
    bearing,
    distance,
    chordDistance: distance,
  };

  if (!arc) return base;

  return {
    ...base,
    isCurve: true,
    curveRadius: arc.radius,
    arcLength: arc.arcLength,
    curveDirection: arc.direction,
    tangentBearing: arc.tangentBearing,
    chordBearing: arc.chordBearing,
  };
}
