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
  bbox.minX = Math.min(bbox.minX, p.x);
  bbox.minY = Math.min(bbox.minY, p.y);
  bbox.maxX = Math.max(bbox.maxX, p.x);
  bbox.maxY = Math.max(bbox.maxY, p.y);
}

export const parseDxfForSymbol = (dxfContent: string): { svgPath: string; viewBox: string } => {
  const lines = dxfContent.split(/\r?\n/);
  let svgPath = '';
  const bbox: BoundingBox = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  let inEntitiesSection = false;
  let currentEntity: string | null = null;
  let entityData: { [key: number]: (string | number)[] } = {};

  const processEntity = () => {
    if (!currentEntity) return;

    try {
      switch (currentEntity) {
        case 'LINE': {
          const x1 = parseFloat(entityData[10]?.[0] as string);
          const y1 = parseFloat(entityData[20]?.[0] as string);
          const x2 = parseFloat(entityData[11]?.[0] as string);
          const y2 = parseFloat(entityData[21]?.[0] as string);
          if (![x1, y1, x2, y2].some(isNaN)) {
            svgPath += ` M ${x1} ${-y1} L ${x2} ${-y2}`;
            updateBoundingBox(bbox, { x: x1, y: -y1 });
            updateBoundingBox(bbox, { x: x2, y: -y2 });
          }
          break;
        }
        case 'LWPOLYLINE': {
          const numVertices = parseInt(entityData[90]?.[0] as string, 10);
          const flags = parseInt(entityData[70]?.[0] as string, 10);
          const isClosed = (flags & 1) === 1;
          const xCoords = entityData[10] as string[];
          const yCoords = entityData[20] as string[];

          if (numVertices > 0 && xCoords?.length === numVertices && yCoords?.length === numVertices) {
            let path = '';
            for (let i = 0; i < numVertices; i++) {
              const x = parseFloat(xCoords[i]);
              const y = parseFloat(yCoords[i]);
              if (!isNaN(x) && !isNaN(y)) {
                path += `${i === 0 ? 'M' : 'L'} ${x} ${-y} `;
                updateBoundingBox(bbox, { x, y: -y });
              }
            }
            if (isClosed) {
              path += 'Z';
            }
            svgPath += ` ${path}`;
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
      if (sectionNameIndex < lines.length -1 && parseInt(lines[sectionNameIndex].trim(), 10) === 2) {
          const sectionName = lines[sectionNameIndex + 1].trim();
          inEntitiesSection = sectionName === 'ENTITIES';
      }
    } else if (code === 0 && value === 'ENDSEC') {
      processEntity(); // Process the last entity before the section ends
      currentEntity = null;
      inEntitiesSection = false;
    } else if (inEntitiesSection && code === 0) {
      processEntity(); // Process the previous entity
      currentEntity = value;
      entityData = {};
    } else if (currentEntity && inEntitiesSection) {
      if (!entityData[code]) {
        entityData[code] = [];
      }
      entityData[code].push(value);
    }
  }
  processEntity(); // Process the very last entity after the loop

  if (bbox.minX === Infinity) {
    return { svgPath: '', viewBox: '0 0 24 24' };
  }

  const width = bbox.maxX - bbox.minX;
  const height = bbox.maxY - bbox.minY;
  
  if (width < 1e-6 || height < 1e-6) {
      // For single points or zero-dimension entities, provide a default small viewBox
       return { svgPath: svgPath.trim(), viewBox: `${bbox.minX - 1} ${bbox.minY - 1} 2 2` };
  }

  const padding = Math.max(width, height) * 0.1; // 10% padding
  const viewBoxX = bbox.minX - padding;
  const viewBoxY = bbox.minY - padding;
  const viewBoxWidth = width + padding * 2;
  const viewBoxHeight = height + padding * 2;
  
  const viewBox = `${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`;
  
  return { svgPath: svgPath.trim(), viewBox };
};
