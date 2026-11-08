export interface BaselinePoint {
  easting: number;
  northing: number;
}

export interface BaselineTangentArc {
  centerEasting: number;
  centerNorthing: number;
  radius: number;
  sweep: number;
  direction: 'left' | 'right';
}

export interface BaselineCurveNode extends BaselinePoint {
  /** Present on a tangent-intersection PI; absent on a tangent point. */
  curveRadius?: number;
}

const rotate = (vector: { x: number; y: number }, angle: number) => ({
  x: vector.x * Math.cos(angle) - vector.y * Math.sin(angle),
  y: vector.x * Math.sin(angle) + vector.y * Math.cos(angle),
});

/**
 * Convert one tangent arc into the PI/tangent nodes consumed by a Centerline.
 * Arcs up to 180° produce one radius PI followed by the arc end. Larger arcs
 * are split into equal sub-arcs so the PI-based centerline model can represent
 * them without flattening the curve.
 */
export function buildTangentArcNodes(
  start: BaselinePoint,
  incomingTangent: { x: number; y: number },
  end: BaselinePoint,
  arc: BaselineTangentArc,
): BaselineCurveNode[] {
  const nodes: BaselineCurveNode[] = [];
  const signedSweep = arc.direction === 'left' ? arc.sweep : -arc.sweep;
  let remaining = Math.abs(arc.sweep);
  let cursor = start;
  let tangent = incomingTangent;
  let angle = Math.atan2(
    start.northing - arc.centerNorthing,
    start.easting - arc.centerEasting,
  );

  while (remaining > 1e-9) {
    const step = remaining > Math.PI - 1e-6 ? remaining / 2 : remaining;
    const signedStep = Math.sign(signedSweep) * step;
    const tangentLength = arc.radius * Math.tan(step / 2);

    if (Number.isFinite(tangentLength) && tangentLength > 1e-9) {
      nodes.push({
        easting: cursor.easting + tangent.x * tangentLength,
        northing: cursor.northing + tangent.y * tangentLength,
        curveRadius: arc.radius,
      });
    }

    if (step >= remaining - 1e-9) {
      const last = nodes[nodes.length - 1];
      if (!last || Math.hypot(last.easting - end.easting, last.northing - end.northing) > 1e-7) {
        nodes.push({ easting: end.easting, northing: end.northing });
      }
      break;
    }

    const nextAngle = angle + signedStep;
    const nextPoint = {
      easting: arc.centerEasting + arc.radius * Math.cos(nextAngle),
      northing: arc.centerNorthing + arc.radius * Math.sin(nextAngle),
    };
    nodes.push(nextPoint);
    cursor = nextPoint;
    tangent = rotate(tangent, signedStep);
    angle = nextAngle;
    remaining -= step;
  }

  if (nodes.length === 0) {
    nodes.push({ easting: end.easting, northing: end.northing });
  }

  return nodes;
}
