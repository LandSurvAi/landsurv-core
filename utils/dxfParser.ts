import type { SymbolTextElement } from '../contexts/types/CadManager.types';

interface Point {
  x: number;
  y: number;
}

interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function updateBoundingBox(bbox: BoundingBox, p: Point) {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
  bbox.minX = Math.min(bbox.minX, p.x);
  bbox.minY = Math.min(bbox.minY, p.y);
  bbox.maxX = Math.max(bbox.maxX, p.x);
  bbox.maxY = Math.max(bbox.maxY, p.y);
}

const fmt = (n: number): number => Number(n.toFixed(4));

/**
 * Strip AutoCAD MTEXT formatting codes (e.g. `{\fArial|b1;CO}` -> `CO`).
 */
function stripMtextFormatting(raw: string): string {
  return raw
    .replace(/\\P/gi, ' ')
    .replace(/\\[A-Za-z][^;]*;/g, '')
    .replace(/[{}]/g, '')
    .trim();
}

export const parseDxfForSymbol = (dxfContent: string): {
  svgPath: string;
  fillPath?: string;
  texts?: SymbolTextElement[];
  viewBox: string;
} => {
  const lines = dxfContent.split(/\r?\n/);
  let svgPath = '';
  let fillPath = '';
  const texts: SymbolTextElement[] = [];
  const bbox: BoundingBox = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  let inGeometrySection = false;
  let currentSectionName = '';
  let insideIgnoredBlock = false;
  let currentEntity: string | null = null;
  let entityData: { [key: number]: string[] } = {};

  // Support legacy POLYLINE + VERTEX + SEQEND sequences
  let inLegacyPolyline = false;
  let legacyPolyClosed = false;
  let legacyPolyVertices: Array<{ x: number; y: number; bulge: number }> = [];

  const appendLwPolylineVertices = (
    verts: Array<{ x: number; y: number; bulge: number }>,
    isClosed: boolean
  ) => {
    if (verts.length === 0) return;
    let path = '';
    for (let i = 0; i < verts.length; i++) {
      const curr = verts[i];
      const sx = fmt(curr.x);
      const sy = fmt(-curr.y);
      updateBoundingBox(bbox, { x: sx, y: sy });

      if (i === 0) {
        path += `M ${sx} ${sy} `;
      } else {
        const prev = verts[i - 1];
        if (Math.abs(prev.bulge) > 1e-5) {
          const chord = Math.hypot(curr.x - prev.x, curr.y - prev.y);
          const theta = 4 * Math.atan(Math.abs(prev.bulge));
          const r = chord > 1e-6 ? fmt(chord / (2 * Math.sin(theta / 2))) : 0;
          const largeArc = Math.abs(prev.bulge) > 1 ? 1 : 0;
          // In DXF (Y-up), bulge > 0 is CCW; in SVG (Y-down), CCW is sweep=0
          const sweep = prev.bulge > 0 ? 0 : 1;
          if (r > 0) {
            path += `A ${r} ${r} 0 ${largeArc} ${sweep} ${sx} ${sy} `;
          } else {
            path += `L ${sx} ${sy} `;
          }
        } else {
          path += `L ${sx} ${sy} `;
        }
      }
    }
    if (isClosed && verts.length > 1) {
      const last = verts[verts.length - 1];
      const first = verts[0];
      if (Math.abs(last.bulge) > 1e-5) {
        const chord = Math.hypot(first.x - last.x, first.y - last.y);
        const theta = 4 * Math.atan(Math.abs(last.bulge));
        const r = chord > 1e-6 ? fmt(chord / (2 * Math.sin(theta / 2))) : 0;
        const largeArc = Math.abs(last.bulge) > 1 ? 1 : 0;
        const sweep = last.bulge > 0 ? 0 : 1;
        if (r > 0) {
          path += `A ${r} ${r} 0 ${largeArc} ${sweep} ${fmt(first.x)} ${fmt(-first.y)} `;
        }
      }
      path += 'Z';
    }
    svgPath += ` ${path.trim()}`;
  };

  const processEntity = () => {
    if (!currentEntity || insideIgnoredBlock) return;

    try {
      switch (currentEntity) {
        case 'BLOCK': {
          const blkName = (entityData[2]?.[0] ?? '').trim();
          // Ignore layout spaces (*Model_Space, *Paper_Space) inside BLOCKS section
          if (currentSectionName === 'BLOCKS' && blkName.startsWith('*')) {
            insideIgnoredBlock = true;
          }
          break;
        }
        case 'ENDBLK': {
          insideIgnoredBlock = false;
          break;
        }
        case 'LINE': {
          const x1 = parseFloat(entityData[10]?.[0] ?? '');
          const y1 = parseFloat(entityData[20]?.[0] ?? '');
          const x2 = parseFloat(entityData[11]?.[0] ?? '');
          const y2 = parseFloat(entityData[21]?.[0] ?? '');
          if (![x1, y1, x2, y2].some(isNaN)) {
            svgPath += ` M ${fmt(x1)} ${fmt(-y1)} L ${fmt(x2)} ${fmt(-y2)}`;
            updateBoundingBox(bbox, { x: x1, y: -y1 });
            updateBoundingBox(bbox, { x: x2, y: -y2 });
          }
          break;
        }
        case 'CIRCLE': {
          const cx = parseFloat(entityData[10]?.[0] ?? '');
          const cy = parseFloat(entityData[20]?.[0] ?? '');
          const r = parseFloat(entityData[40]?.[0] ?? '');
          if (![cx, cy, r].some(isNaN) && r > 0) {
            const scx = fmt(cx);
            const scy = fmt(-cy);
            const sr = fmt(r);
            const xRight = fmt(scx + sr);
            const xLeft = fmt(scx - sr);
            svgPath += ` M ${xRight} ${scy} A ${sr} ${sr} 0 1 0 ${xLeft} ${scy} A ${sr} ${sr} 0 1 0 ${xRight} ${scy} Z`;
            updateBoundingBox(bbox, { x: scx - sr, y: scy - sr });
            updateBoundingBox(bbox, { x: scx + sr, y: scy + sr });
          }
          break;
        }
        case 'ARC': {
          const cx = parseFloat(entityData[10]?.[0] ?? '');
          const cy = parseFloat(entityData[20]?.[0] ?? '');
          const r = parseFloat(entityData[40]?.[0] ?? '');
          const startDeg = parseFloat(entityData[50]?.[0] ?? '');
          const endDeg = parseFloat(entityData[51]?.[0] ?? '');
          if (![cx, cy, r, startDeg, endDeg].some(isNaN) && r > 0) {
            const startRad = (startDeg * Math.PI) / 180;
            const endRad = (endDeg * Math.PI) / 180;
            // DXF arcs run counter-clockwise from startDeg to endDeg in Y-up space
            const x1 = cx + r * Math.cos(startRad);
            const y1 = cy + r * Math.sin(startRad);
            const x2 = cx + r * Math.cos(endRad);
            const y2 = cy + r * Math.sin(endRad);
            let sweepDeg = (endDeg - startDeg) % 360;
            if (sweepDeg <= 0) sweepDeg += 360;
            const largeArc = sweepDeg > 180 ? 1 : 0;
            const sr = fmt(r);
            // In SVG Y-down space, DXF CCW becomes sweep-flag = 0
            svgPath += ` M ${fmt(x1)} ${fmt(-y1)} A ${sr} ${sr} 0 ${largeArc} 0 ${fmt(x2)} ${fmt(-y2)}`;
            updateBoundingBox(bbox, { x: x1, y: -y1 });
            updateBoundingBox(bbox, { x: x2, y: -y2 });
            // Include cardinal extrema hit by the arc
            for (const cardDeg of [0, 90, 180, 270]) {
              let rel = (cardDeg - startDeg) % 360;
              if (rel < 0) rel += 360;
              if (rel <= sweepDeg) {
                const rad = (cardDeg * Math.PI) / 180;
                updateBoundingBox(bbox, { x: cx + r * Math.cos(rad), y: -(cy + r * Math.sin(rad)) });
              }
            }
          }
          break;
        }
        case 'LWPOLYLINE': {
          const flags = parseInt(entityData[70]?.[0] ?? '0', 10);
          const isClosed = (flags & 1) === 1;
          const xCoords = entityData[10] || [];
          const yCoords = entityData[20] || [];
          const count = Math.min(xCoords.length, yCoords.length);
          if (count > 0) {
            const verts: Array<{ x: number; y: number; bulge: number }> = [];
            for (let i = 0; i < count; i++) {
              const x = parseFloat(xCoords[i]);
              const y = parseFloat(yCoords[i]);
              const b = parseFloat(entityData[42]?.[i] ?? '0') || 0;
              if (!isNaN(x) && !isNaN(y)) {
                verts.push({ x, y, bulge: b });
              }
            }
            appendLwPolylineVertices(verts, isClosed);
          }
          break;
        }
        case 'POLYLINE': {
          inLegacyPolyline = true;
          const flags = parseInt(entityData[70]?.[0] ?? '0', 10);
          legacyPolyClosed = (flags & 1) === 1;
          legacyPolyVertices = [];
          break;
        }
        case 'VERTEX': {
          if (inLegacyPolyline) {
            const x = parseFloat(entityData[10]?.[0] ?? '');
            const y = parseFloat(entityData[20]?.[0] ?? '');
            const bulge = parseFloat(entityData[42]?.[0] ?? '0') || 0;
            if (!isNaN(x) && !isNaN(y)) {
              legacyPolyVertices.push({ x, y, bulge });
            }
          }
          break;
        }
        case 'SEQEND': {
          if (inLegacyPolyline) {
            appendLwPolylineVertices(legacyPolyVertices, legacyPolyClosed);
            inLegacyPolyline = false;
            legacyPolyVertices = [];
          }
          break;
        }
        case 'SOLID':
        case 'TRACE': {
          const x0 = parseFloat(entityData[10]?.[0] ?? '');
          const y0 = parseFloat(entityData[20]?.[0] ?? '');
          const x1 = parseFloat(entityData[11]?.[0] ?? '');
          const y1 = parseFloat(entityData[21]?.[0] ?? '');
          const x2 = parseFloat(entityData[12]?.[0] ?? '');
          const y2 = parseFloat(entityData[22]?.[0] ?? '');
          const x3 = parseFloat(entityData[13]?.[0] ?? String(x2));
          const y3 = parseFloat(entityData[23]?.[0] ?? String(y2));
          if (![x0, y0, x1, y1, x2, y2].some(isNaN)) {
            // DXF SOLID vertex order is bow-tie (10, 11, 13, 12)
            const pts = [
              { x: fmt(x0), y: fmt(-y0) },
              { x: fmt(x1), y: fmt(-y1) },
              { x: fmt(x3), y: fmt(-y3) },
              { x: fmt(x2), y: fmt(-y2) },
            ];
            pts.forEach(p => updateBoundingBox(bbox, p));
            fillPath += ` M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y} L ${pts[2].x} ${pts[2].y} L ${pts[3].x} ${pts[3].y} Z`;
          }
          break;
        }
        case 'TEXT':
        case 'MTEXT': {
          const rawStr = (entityData[1] || []).join('');
          const cleanText = stripMtextFormatting(rawStr);
          // Prefer alignment point (11, 21) for centered/aligned TEXT if present and non-zero
          const hAlign = parseInt(entityData[72]?.[0] ?? '0', 10);
          const vAlign = parseInt(entityData[73]?.[0] ?? '0', 10);
          const hasAlignPt = (hAlign !== 0 || vAlign !== 0) && entityData[11]?.[0] !== undefined && entityData[21]?.[0] !== undefined;
          const tx = parseFloat((hasAlignPt ? entityData[11]?.[0] : entityData[10]?.[0]) ?? '');
          const ty = parseFloat((hasAlignPt ? entityData[21]?.[0] : entityData[20]?.[0]) ?? '');
          const capHeight = parseFloat(entityData[40]?.[0] ?? '2.5');
          const rot = parseFloat(entityData[50]?.[0] ?? '0') || 0;
          if (cleanText && !isNaN(tx) && !isNaN(ty)) {
            const sx = fmt(tx);
            const sy = fmt(-ty);
            const fontSize = fmt((isNaN(capHeight) || capHeight <= 0 ? 2.5 : capHeight) / 0.72);
            texts.push({
              text: cleanText,
              x: sx,
              y: sy,
              fontSize,
              fontWeight: 'bold',
              anchor: hAlign === 2 ? 'end' : hAlign === 0 && currentEntity === 'TEXT' && !hasAlignPt ? 'start' : 'middle',
              ...(rot ? { rotation: -rot } : {}),
            });
            const halfW = (cleanText.length * fontSize * 0.35);
            const halfH = fontSize * 0.5;
            updateBoundingBox(bbox, { x: sx - halfW, y: sy - halfH });
            updateBoundingBox(bbox, { x: sx + halfW, y: sy + halfH });
          }
          break;
        }
      }
    } catch (e) {
      console.error("Error processing DXF entity:", currentEntity, entityData, e);
    }
  };

  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    const value = lines[i + 1].trim();

    if (isNaN(code)) continue;

    if (code === 0 && value === 'SECTION') {
      const sectionNameIndex = i + 2;
      if (sectionNameIndex < lines.length - 1 && parseInt(lines[sectionNameIndex].trim(), 10) === 2) {
        currentSectionName = lines[sectionNameIndex + 1].trim().toUpperCase();
        inGeometrySection = currentSectionName === 'ENTITIES' || currentSectionName === 'BLOCKS';
        insideIgnoredBlock = false;
      }
    } else if (code === 0 && value === 'ENDSEC') {
      processEntity();
      currentEntity = null;
      inGeometrySection = false;
      currentSectionName = '';
      insideIgnoredBlock = false;
    } else if (inGeometrySection && code === 0) {
      processEntity();
      currentEntity = value;
      entityData = {};
    } else if (currentEntity && inGeometrySection) {
      if (!entityData[code]) {
        entityData[code] = [];
      }
      entityData[code].push(value);
    }
  }
  processEntity();

  if (bbox.minX === Infinity) {
    return { svgPath: '', viewBox: '0 0 24 24' };
  }

  const width = bbox.maxX - bbox.minX;
  const height = bbox.maxY - bbox.minY;
  const maxDim = Math.max(width, height, 1e-3);
  const padding = maxDim * 0.12;
  const centerX = (bbox.minX + bbox.maxX) / 2;
  const centerY = (bbox.minY + bbox.maxY) / 2;
  const boxSize = fmt(maxDim + padding * 2);
  const viewBoxX = fmt(centerX - boxSize / 2);
  const viewBoxY = fmt(centerY - boxSize / 2);

  return {
    svgPath: svgPath.trim(),
    ...(fillPath.trim() ? { fillPath: fillPath.trim() } : {}),
    ...(texts.length > 0 ? { texts } : {}),
    viewBox: `${viewBoxX} ${viewBoxY} ${boxSize} ${boxSize}`,
  };
};
