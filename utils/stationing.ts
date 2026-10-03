
import { type Centerline, type CenterlinePI } from '../types.ts';

export const formatStation = (station: number): string => {
  const hundreds = Math.floor(station / 100);
  const remainder = station % 100;
  return `${hundreds}+${remainder.toFixed(2)}`;
};

export const parseStation = (stationString: string): number | null => {
  const cleaned = stationString.replace(/\s/g, '');
  if (!cleaned) return null;
  
  if (cleaned.includes('+')) {
    const parts = cleaned.split('+');
    if (parts.length === 2) {
      const hundreds = parseFloat(parts[0]);
      const remainder = parseFloat(parts[1]);
      if (!isNaN(hundreds) && !isNaN(remainder)) {
        return hundreds * 100 + remainder;
      }
    }
  } else {
    const station = parseFloat(cleaned);
    if (!isNaN(station)) {
      return station;
    }
  }
  return null;
};

const parsePiBasedClFile = (content: string): Centerline | null => {
  const lines = content.trim().split('\n');
  let clData: { name: string; beginStation: number } | null = null;
  const pis: CenterlinePI[] = [];
  const spaceDelimiterRegex = /[\s\t]+/;

  for (const line of lines) {
    const cleanedLine = line.trim();
    if (!cleanedLine || cleanedLine.startsWith('#') || cleanedLine.startsWith('//') || cleanedLine.startsWith('--')) continue;

    let parts: string[];
    // Prioritize comma as a delimiter to handle empty optional fields correctly
    if (cleanedLine.includes(',')) {
        parts = cleanedLine.split(',').map(p => p.trim());
    } else {
        parts = cleanedLine.split(spaceDelimiterRegex).filter(Boolean);
    }
    
    if (parts.length === 0) continue;
    const prefix = parts[0].toUpperCase();

    if (prefix === 'CL' && !clData) {
        if (parts.length >= 2) {
            const stationStr = parts[parts.length - 1];
            const station = parseStation(stationStr);

            if (station !== null) {
                const name = parts.length > 2 ? parts.slice(1, parts.length - 1).join(' ') : 'Unnamed-CL';
                clData = {
                    name: name.replace(/["']/g, ''),
                    beginStation: station
                };
            }
        }
    } else if (prefix === 'PI') {
      if (parts.length >= 3) {
        const northing = parseFloat(parts[1]);
        const easting = parseFloat(parts[2]);

        if (!isNaN(northing) && !isNaN(easting)) {
          // Format is: PI, Northing, Easting, [Point Number], [Curve Radius]
          let pointNumber = (parts[3] || '').trim();
          let curveRadius: number | undefined = undefined;

          if (!pointNumber) {
            pointNumber = `PI-${pis.length + 1}`;
          }

          if (parts.length >= 5 && parts[4]) {
            const r = parseFloat(parts[4]);
            if (!isNaN(r)) curveRadius = r;
          }
          
          pis.push({ id: `${Date.now()}-${pis.length}`, pointNumber, northing, easting, curveRadius });
        }
      }
    }
  }

  if (!clData && pis.length > 0) {
    clData = { name: 'Unnamed-CL', beginStation: 0 };
  }
  
  if (!clData) return null;
  
  return { id: Date.now().toString(), name: clData.name, beginStation: clData.beginStation, pis };
};

const lineIntersection = (
  p1: { x: number; y: number }, p2: { x: number; y: number },
  p3: { x: number; y: number }, p4: { x: number; y: number }
): { x: number; y: number } | null => {
  const den = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
  if (Math.abs(den) < 1e-9) return null; // Parallel lines

  const t_num = (p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x);
  const t = t_num / den;

  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
};

const parseGeometryBasedClFile = (content: string): Centerline | null => {
  const lines = content.trim().split('\n');
  const geomPoints = lines.map(line => {
    const parts = line.split(',');
    if (parts.length < 5) return null;
    return {
      station: parseFloat(parts[1]),
      type: parts[2].trim().toUpperCase(),
      easting: parseFloat(parts[3]),
      northing: parseFloat(parts[4]),
    };
  }).filter((p): p is { station: number; type: string; easting: number; northing: number } => 
    p !== null && !isNaN(p.easting) && !isNaN(p.northing) && (p.easting !== 0 || p.northing !== 0)
  );

  if (geomPoints.length < 2) return null;

  const pis: CenterlinePI[] = [];
  
  if (geomPoints[0]) {
    pis.push({
      id: `pi-0`, pointNumber: `START`,
      northing: geomPoints[0].northing, easting: geomPoints[0].easting
    });
  }

  for (let i = 0; i < geomPoints.length; i++) {
    const point = geomPoints[i];
    if (point.type !== 'PC') continue;

    const pcPoint = point;
    const ptIndex = geomPoints.findIndex((p, idx) => idx > i && p.type === 'PT');
    const rIndex = geomPoints.findIndex((p, idx) => idx > i && p.type === 'R');
    
    if (ptIndex === -1 || rIndex === -1) continue;
    
    const ptPoint = geomPoints[ptIndex];
    const rPoint = geomPoints[rIndex];
    
    const tangentInP1 = geomPoints[i - 1] || geomPoints[0];
    const tangentInP2 = pcPoint;

    const tangentOutP1 = ptPoint;
    const tangentOutP2 = geomPoints.find((p, idx) => idx > ptIndex && (p.type === 'L' || p.type === 'PC')) || geomPoints[ptIndex + 1];

    if (tangentInP1 && tangentOutP2) {
      const intersection = lineIntersection(
        { x: tangentInP1.easting, y: tangentInP1.northing },
        { x: tangentInP2.easting, y: tangentInP2.northing },
        { x: tangentOutP1.easting, y: tangentOutP1.northing },
        { x: tangentOutP2.easting, y: tangentOutP2.northing }
      );
      
      if (intersection) {
        const radius = Math.hypot(rPoint.easting - pcPoint.easting, rPoint.northing - pcPoint.northing);
        pis.push({
          id: `pi-${pis.length}`, pointNumber: `PI-${pis.length}`,
          northing: intersection.y, easting: intersection.x,
          curveRadius: radius
        });
      }
    }
    i = ptIndex; // Skip to the end of the curve
  }

  const lastGeomPoint = geomPoints[geomPoints.length - 1];
  if (lastGeomPoint) {
      pis.push({
          id: `pi-${pis.length}`, pointNumber: `END`,
          northing: lastGeomPoint.northing, easting: lastGeomPoint.easting
      });
  }

  if (pis.length < 2) return null;

  return {
    id: Date.now().toString(),
    name: 'Imported Alignment',
    beginStation: geomPoints[0]?.station || 0,
    pis,
  };
};

export const parseClFile = (content: string): Centerline | null => {
  const lines = content.trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  
  const firstLineUpper = lines[0].toUpperCase();
  const firstLineParts = lines[0].split(/[,\s\t]+/);

  if (firstLineUpper.startsWith('CL') || firstLineUpper.startsWith('PI')) {
      return parsePiBasedClFile(content);
  } else if (firstLineParts.length >= 5 && !isNaN(parseFloat(firstLineParts[1])) && !isNaN(parseFloat(firstLineParts[3]))) {
      return parseGeometryBasedClFile(content);
  }
  
  // Fallback to old parser as a last resort
  return parsePiBasedClFile(content);
};

export const calculateCurveGeometry = (p_prev: CenterlinePI, p_curr: CenterlinePI, p_next: CenterlinePI, radius: number) => {
    if (!radius || radius <= 0) return null;

    // Calculate bearings (azimuths from North) of incoming and outgoing tangents
    const bearingIn = Math.atan2(p_curr.easting - p_prev.easting, p_curr.northing - p_prev.northing);
    const bearingOut = Math.atan2(p_next.easting - p_curr.easting, p_next.northing - p_curr.northing);

    let delta = bearingOut - bearingIn;
    // Normalize delta to be between -PI and PI
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    
    // If there's no deflection, there's no curve
    if (Math.abs(delta) < 1e-9) return null;

    const turnRight = delta > 0;
    
    const T = Math.abs(radius) * Math.tan(Math.abs(delta) / 2); // Tangent length
    const L = Math.abs(radius * delta); // Arc length

    if (!isFinite(T)) return null; // Avoid errors with 180-degree turns
    
    // PC is T distance back from PI along incoming tangent
    const pcNorthing = p_curr.northing - T * Math.cos(bearingIn);
    const pcEasting = p_curr.easting - T * Math.sin(bearingIn);

    // PT is T distance forward from PI along outgoing tangent
    const ptNorthing = p_curr.northing + T * Math.cos(bearingOut);
    const ptEasting = p_curr.easting + T * Math.sin(bearingOut);
    
    // Center point is R distance perpendicular to incoming tangent from PC
    const centerAngle = bearingIn + (turnRight ? Math.PI / 2 : -Math.PI / 2);
    const centerNorthing = pcNorthing + Math.abs(radius) * Math.cos(centerAngle);
    const centerEasting = pcEasting + Math.abs(radius) * Math.sin(centerAngle);

    // Mathematical angles for canvas arc drawing (0 is East, CCW)
    const startAngle = Math.atan2(pcNorthing - centerNorthing, pcEasting - centerEasting);
    const endAngle = Math.atan2(ptNorthing - centerNorthing, ptEasting - centerEasting);

    return { T, L, delta, radius: Math.abs(radius), pcNorthing, pcEasting, ptNorthing, ptEasting, centerNorthing, centerEasting, turnRight, startAngle, endAngle };
}

/**
 * Returns the geometric key stations along the alignment: the BOP (begin of
 * project), every PC and PT for each circular curve, and the EOP (end of
 * project). Useful for "stake out every PC and PT" workflows.
 *
 * Curve labels are 1-based in the order the curves appear along the alignment
 * (e.g. PC-1, PT-1, PC-2, PT-2 …). Output is sorted ascending by station.
 */
export const getCenterlineKeyStations = (
  centerline: Centerline
): Array<{ label: string; station: number }> => {
  const out: Array<{ label: string; station: number }> = [];
  if (centerline.pis.length < 2) return out;

  let station = centerline.beginStation;
  let lastPt = { northing: centerline.pis[0].northing, easting: centerline.pis[0].easting };
  let curveIdx = 0;

  out.push({ label: 'BOP', station });

  for (let i = 1; i < centerline.pis.length; i++) {
    const p_prev = centerline.pis[i - 1];
    const p_curr = centerline.pis[i];

    if (i < centerline.pis.length - 1 && p_curr.curveRadius) {
      const p_next = centerline.pis[i + 1];
      const curve = calculateCurveGeometry(p_prev, p_curr, p_next, p_curr.curveRadius);
      if (curve) {
        const tangentLength = Math.hypot(curve.pcEasting - lastPt.easting, curve.pcNorthing - lastPt.northing);
        station += tangentLength;
        curveIdx += 1;
        out.push({ label: `PC-${curveIdx}`, station });
        station += curve.L;
        out.push({ label: `PT-${curveIdx}`, station });
        lastPt = { northing: curve.ptNorthing, easting: curve.ptEasting };
        continue;
      }
    }

    const segLength = Math.hypot(p_curr.easting - lastPt.easting, p_curr.northing - lastPt.northing);
    station += segLength;
    lastPt = { northing: p_curr.northing, easting: p_curr.easting };
  }

  out.push({ label: 'EOP', station });
  return out;
};

export const calculateCenterlineLength = (centerline: Centerline): number => {
  if (centerline.pis.length < 2) return 0;

  let length = 0;
  let lastPt = { northing: centerline.pis[0].northing, easting: centerline.pis[0].easting };

  for (let i = 1; i < centerline.pis.length; i++) {
      const p_prev = centerline.pis[i - 1];
      const p_curr = centerline.pis[i];
      
      if (i < centerline.pis.length - 1 && p_curr.curveRadius) {
          const p_next = centerline.pis[i + 1];
          const curve = calculateCurveGeometry(p_prev, p_curr, p_next, p_curr.curveRadius);
          if (curve) {
              length += Math.hypot(curve.pcEasting - lastPt.easting, curve.pcNorthing - lastPt.northing);
              length += curve.L;
              lastPt = { northing: curve.ptNorthing, easting: curve.ptEasting };
          } else {
              length += Math.hypot(p_curr.easting - lastPt.easting, p_curr.northing - lastPt.northing);
              lastPt = p_curr;
          }
      } else {
          length += Math.hypot(p_curr.easting - lastPt.easting, p_curr.northing - lastPt.northing);
          lastPt = p_curr;
      }
  }
  return length;
};

export const calculatePointFromStationOffset = (
  centerline: Centerline,
  targetStation: number,
  offset: number
): { northing: number; easting: number } | null => {
  if (centerline.pis.length < 2) return null;

  let station = centerline.beginStation;
  let lastPt = { northing: centerline.pis[0].northing, easting: centerline.pis[0].easting };

  for (let i = 1; i < centerline.pis.length; i++) {
    const p_prev = centerline.pis[i - 1];
    const p_curr = centerline.pis[i];

    if (i < centerline.pis.length - 1 && p_curr.curveRadius) {
      const p_next = centerline.pis[i + 1];
      const curve = calculateCurveGeometry(p_prev, p_curr, p_next, p_curr.curveRadius);
      if (curve) {
        // --- TANGENT BEFORE CURVE ---
        const tangentLength = Math.hypot(curve.pcEasting - lastPt.easting, curve.pcNorthing - lastPt.northing);
        if (targetStation >= station && targetStation <= station + tangentLength + 1e-6) {
          const distIntoTangent = targetStation - station;
          const bearing = Math.atan2(curve.pcEasting - lastPt.easting, curve.pcNorthing - lastPt.northing);
          
          const clNorthing = lastPt.northing + distIntoTangent * Math.cos(bearing);
          const clEasting = lastPt.easting + distIntoTangent * Math.sin(bearing);
          
          const offsetBearing = bearing + Math.PI / 2;
          const offsetNorthing = clNorthing + offset * Math.cos(offsetBearing);
          const offsetEasting = clEasting + offset * Math.sin(offsetBearing);

          return { northing: offsetNorthing, easting: offsetEasting };
        }
        station += tangentLength;
        
        // --- CURVE ---
        if (targetStation >= station && targetStation <= station + curve.L + 1e-6) {
          const distIntoCurve = targetStation - station;
          const angleIntoCurve = distIntoCurve / curve.radius;

          const bearingToPC = Math.atan2(curve.pcEasting - curve.centerEasting, curve.pcNorthing - curve.centerNorthing);
          const totalAngle = bearingToPC + angleIntoCurve * (curve.turnRight ? 1 : -1);

          const offsetRadius = curve.radius - (offset * (curve.turnRight ? 1 : -1));
          const offsetNorthing = curve.centerNorthing + offsetRadius * Math.cos(totalAngle);
          const offsetEasting = curve.centerEasting + offsetRadius * Math.sin(totalAngle);
          
          return { northing: offsetNorthing, easting: offsetEasting };
        }
        station += curve.L;
        lastPt = { northing: curve.ptNorthing, easting: curve.ptEasting };

      } else { // Curve calculation failed, treat as tangent
        const segmentLength = Math.hypot(p_curr.easting - lastPt.easting, p_curr.northing - lastPt.northing);
        if (targetStation >= station && targetStation <= station + segmentLength + 1e-6) {
             // ... tangent calculation
            const distIntoTangent = targetStation - station;
            const bearing = Math.atan2(p_curr.easting - lastPt.easting, p_curr.northing - lastPt.northing);
            const clNorthing = lastPt.northing + distIntoTangent * Math.cos(bearing);
            const clEasting = lastPt.easting + distIntoTangent * Math.sin(bearing);
            const offsetBearing = bearing + Math.PI / 2;
            const offsetNorthing = clNorthing + offset * Math.cos(offsetBearing);
            const offsetEasting = clEasting + offset * Math.sin(offsetBearing);
            return { northing: offsetNorthing, easting: offsetEasting };
        }
        station += segmentLength;
        lastPt = p_curr;
      }
    } else { // --- FINAL TANGENT ---
      const segmentLength = Math.hypot(p_curr.easting - lastPt.easting, p_curr.northing - lastPt.northing);
      if (targetStation >= station && targetStation <= station + segmentLength + 1e-6) {
            const distIntoTangent = targetStation - station;
            const bearing = Math.atan2(p_curr.easting - lastPt.easting, p_curr.northing - lastPt.northing);
            const clNorthing = lastPt.northing + distIntoTangent * Math.cos(bearing);
            const clEasting = lastPt.easting + distIntoTangent * Math.sin(bearing);
            const offsetBearing = bearing + Math.PI / 2;
            const offsetNorthing = clNorthing + offset * Math.cos(offsetBearing);
            const offsetEasting = clEasting + offset * Math.sin(offsetBearing);
            return { northing: offsetNorthing, easting: offsetEasting };
      }
      station += segmentLength;
      lastPt = p_curr;
    }
  }

  return null;
};
