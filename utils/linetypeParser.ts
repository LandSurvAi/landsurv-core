/**
 * Linetype Parser Utility
 * 
 * Parses AutoCAD .lin files into LinetypeDefinition objects.
 * Also provides utilities for generating .lin file content.
 * 
 * AutoCAD .lin file format:
 * - Comments start with ;;
 * - Linetype definition starts with *NAME,Description
 * - Pattern line starts with A, (alignment type)
 * - Pattern elements: positive=dash, negative=gap, 0=dot
 * - Complex linetypes include shapes: [SHAPENAME,shxfile,options]
 * - Complex linetypes with TEXT: ["TEXT",STYLE,options]
 * 
 * Example simple linetype:
 * *DASHED,Dashed __ __ __ __ __ __
 * A,.5,-.25
 * 
 * Example complex linetype with shape:
 * *FENCE_LINE,Fence ----X----X----
 * A,.5,-.2,[X,ltypeshp.shx,x=-.1,s=.1],-.2
 * 
 * Example complex linetype with TEXT:
 * *REGULATED_WATERS,Regulated Waters ----RW----RW----
 * A,.5,-.2,["RW",STANDARD,S=.1,U=0.0,X=-0.1,Y=-.05],-.2
 */

import { LinetypeDefinition, LinetypeFile } from '../contexts/types/CadManager.types';

/**
 * Parse a .lin file content into LinetypeDefinition array
 */
export function parseLinFile(content: string, fileName?: string): LinetypeFile {
  const lines = content.split(/\r?\n/);
  const linetypes: LinetypeDefinition[] = [];
  
  let currentLinetype: Partial<LinetypeDefinition> | null = null;
  let description = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines and comments
    if (!line || line.startsWith(';;')) {
      // Check for file description in comments
      if (line.startsWith(';;') && !description) {
        description = line.substring(2).trim();
      }
      continue;
    }
    
    // Linetype header line: *NAME,Description
    if (line.startsWith('*')) {
      // Save previous linetype if exists
      if (currentLinetype && currentLinetype.name) {
        linetypes.push(currentLinetype as LinetypeDefinition);
      }
      
      const [namePart, ...descParts] = line.substring(1).split(',');
      const name = namePart.trim().toUpperCase();
      const desc = descParts.join(',').trim();
      
      currentLinetype = {
        name,
        description: desc,
        pattern: [],
        shapeData: [],
        isComplex: false,
        source: fileName,
      };
    }
    // Pattern line: A,element1,element2,...
    else if (line.toUpperCase().startsWith('A,') && currentLinetype) {
      const patternStr = line.substring(2); // Remove "A,"
      const elements = parsePatternElements(patternStr);
      
      currentLinetype.pattern = elements.pattern;
      currentLinetype.patternLength = elements.pattern.reduce((sum, n) => sum + Math.abs(n), 0);
      
      if (elements.shapes.length > 0) {
        currentLinetype.shapeData = elements.shapes;
        currentLinetype.isComplex = true;
      }
    }
  }
  
  // Don't forget the last linetype
  if (currentLinetype && currentLinetype.name) {
    linetypes.push(currentLinetype as LinetypeDefinition);
  }
  
  return {
    name: fileName || 'Custom Linetypes',
    description: description || `${linetypes.length} linetype definitions`,
    linetypes,
    lastUpdated: new Date().toISOString(),
    source: fileName,
  };
}

/**
 * Parse pattern elements including shapes
 */
function parsePatternElements(patternStr: string): { 
  pattern: number[]; 
  shapes: LinetypeDefinition['shapeData'];
} {
  const pattern: number[] = [];
  const shapes: NonNullable<LinetypeDefinition['shapeData']> = [];
  
  let i = 0;
  let current = '';
  let inBracket = false;
  
  while (i < patternStr.length) {
    const char = patternStr[i];
    
    if (char === '[') {
      inBracket = true;
      current = '';
    } else if (char === ']') {
      inBracket = false;
      // Parse shape definition
      const shape = parseShapeElement(current);
      if (shape) {
        shapes.push(shape);
        pattern.push(0); // Shapes are treated as zero-length in pattern
      }
      current = '';
    } else if (char === ',' && !inBracket) {
      if (current.trim()) {
        const num = parseFloat(current.trim());
        if (!isNaN(num)) {
          pattern.push(num);
        }
      }
      current = '';
    } else {
      current += char;
    }
    i++;
  }
  
  // Handle last element
  if (current.trim() && !inBracket) {
    const num = parseFloat(current.trim());
    if (!isNaN(num)) {
      pattern.push(num);
    }
  }
  
  return { pattern, shapes };
}

/**
 * Parse a shape or text element
 * Shape format: SHAPENAME,shxfile,x=value,s=value
 * Text format: "TEXT",STYLE,S=value,U=value,X=value,Y=value
 */
function parseShapeElement(shapeStr: string): LinetypeDefinition['shapeData'][0] | null {
  const parts = shapeStr.split(',').map(p => p.trim());
  if (parts.length < 1) return null;
  
  const firstPart = parts[0];
  
  // Check if this is a text element (starts and ends with quotes)
  const isText = firstPart.startsWith('"') && firstPart.endsWith('"');
  
  const shape: LinetypeDefinition['shapeData'][0] = {
    name: isText ? firstPart.slice(1, -1) : firstPart, // Remove quotes for text
    isText: isText,
  };
  
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const upperPart = part.toUpperCase();
    
    if (part.endsWith('.shx') || part.endsWith('.SHX')) {
      shape.file = part;
    } else if (upperPart.startsWith('X=')) {
      shape.xOffset = parseFloat(part.substring(2));
    } else if (upperPart.startsWith('Y=')) {
      shape.yOffset = parseFloat(part.substring(2));
    } else if (upperPart.startsWith('S=')) {
      shape.scale = parseFloat(part.substring(2));
    } else if (upperPart.startsWith('R=')) {
      shape.rotation = parseFloat(part.substring(2));
    } else if (upperPart.startsWith('U=')) {
      shape.upright = parseFloat(part.substring(2));
    } else if (!part.includes('=') && !part.endsWith('.shx') && isText) {
      // For text elements, the second part is the text style
      shape.style = part;
    }
  }
  
  return shape;
}

/**
 * Generate .lin file content from LinetypeDefinition array
 */
export function generateLinFileContent(linetypes: LinetypeDefinition[], description?: string): string {
  const lines: string[] = [];
  
  // Header comments
  lines.push(';;');
  lines.push(`;; ${description || 'Custom Linetypes'}`);
  lines.push(`;; Generated by Landsurv AI CAD Manager`);
  lines.push(`;;`);
  lines.push('');
  
  for (const lt of linetypes) {
    // Linetype header
    lines.push(`*${lt.name},${lt.description}`);
    
    // Pattern line
    const patternParts: string[] = [];
    
    if (lt.isComplex && lt.shapeData && lt.shapeData.length > 0) {
      // Complex linetype with shapes or text
      let shapeIndex = 0;
      for (const element of lt.pattern) {
        if (element === 0 && shapeIndex < lt.shapeData.length) {
          // This is a shape/text placeholder
          const shape = lt.shapeData[shapeIndex];
          let shapeStr: string;
          
          if (shape.isText) {
            // Text element: ["TEXT",STYLE,S=value,U=value,X=value,Y=value]
            shapeStr = `["${shape.name}"`;
            if (shape.style) shapeStr += `,${shape.style}`;
            else shapeStr += `,STANDARD`; // Default text style
            if (shape.scale !== undefined) shapeStr += `,S=${shape.scale}`;
            if (shape.upright !== undefined) shapeStr += `,U=${shape.upright}`;
            else shapeStr += `,U=0.0`; // Default to not upright
            if (shape.xOffset !== undefined) shapeStr += `,X=${shape.xOffset}`;
            if (shape.yOffset !== undefined) shapeStr += `,Y=${shape.yOffset}`;
            shapeStr += ']';
          } else {
            // Shape element: [SHAPENAME,shxfile,x=value,s=value]
            shapeStr = `[${shape.name}`;
            if (shape.file) shapeStr += `,${shape.file}`;
            if (shape.xOffset !== undefined) shapeStr += `,x=${shape.xOffset}`;
            if (shape.yOffset !== undefined) shapeStr += `,y=${shape.yOffset}`;
            if (shape.scale !== undefined) shapeStr += `,s=${shape.scale}`;
            if (shape.rotation !== undefined) shapeStr += `,r=${shape.rotation}`;
            shapeStr += ']';
          }
          patternParts.push(shapeStr);
          shapeIndex++;
        } else {
          patternParts.push(element.toString());
        }
      }
    } else {
      // Simple linetype
      for (const element of lt.pattern) {
        patternParts.push(element.toString());
      }
    }
    
    lines.push(`A,${patternParts.join(',')}`);
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Validate linetype name
 */
export function validateLinetypeName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Name is required' };
  }
  
  const cleaned = name.trim().toUpperCase();
  
  if (cleaned.length > 255) {
    return { valid: false, error: 'Name must be 255 characters or less' };
  }
  
  // Check for invalid characters (AutoCAD restrictions)
  const invalidChars = /[<>\/\\\":;?*|,=`]/;
  if (invalidChars.test(cleaned)) {
    return { valid: false, error: 'Name contains invalid characters' };
  }
  
  // Reserved names
  const reserved = ['BYLAYER', 'BYBLOCK', 'CONTINUOUS'];
  if (reserved.includes(cleaned)) {
    return { valid: false, error: `"${cleaned}" is a reserved linetype name` };
  }
  
  return { valid: true };
}

/**
 * Common survey/civil linetypes for quick generation
 */
export const COMMON_SURVEY_LINETYPES: LinetypeDefinition[] = [
  {
    name: 'FENCE',
    description: 'Fence line ----X----X----X----',
    pattern: [0.5, -0.2, 0, -0.2],
    patternLength: 0.9,
    shapeData: [{ name: 'X', file: 'ltypeshp.shx', scale: 0.1, xOffset: -0.1 }],
    isComplex: true,
  },
  {
    name: 'PROPERTY',
    description: 'Property line --.--.--.--',
    pattern: [0.5, -0.125, 0, -0.125],
    patternLength: 0.75,
    isComplex: false,
  },
  {
    name: 'EASEMENT',
    description: 'Easement line ----E----E----E----',
    pattern: [0.5, -0.2, 0, -0.2],
    patternLength: 0.9,
    shapeData: [{ name: 'E', scale: 0.1, isText: true, style: 'STANDARD', upright: 0 }],
    isComplex: true,
  },
  {
    name: 'ROW',
    description: 'Right of Way line',
    pattern: [0.75, -0.25, 0.25, -0.25],
    patternLength: 1.5,
    isComplex: false,
  },
  {
    name: 'CENTERLINE',
    description: 'Center line ____ _ ____ _',
    pattern: [1.0, -0.25, 0.25, -0.25],
    patternLength: 1.75,
    isComplex: false,
  },
  {
    name: 'UTILITY_UG',
    description: 'Underground utility ----UG----UG----',
    pattern: [0.5, -0.25, 0, -0.25],
    patternLength: 1.0,
    shapeData: [{ name: 'UG', scale: 0.1, isText: true, style: 'STANDARD', upright: 0 }],
    isComplex: true,
  },
  {
    name: 'UTILITY_OH',
    description: 'Overhead utility ----OH----OH----',
    pattern: [0.5, -0.25, 0, -0.25],
    patternLength: 1.0,
    shapeData: [{ name: 'OH', scale: 0.1, isText: true, style: 'STANDARD', upright: 0 }],
    isComplex: true,
  },
  {
    name: 'WATER',
    description: 'Water line ----W----W----',
    pattern: [0.5, -0.2, 0, -0.2],
    patternLength: 0.9,
    shapeData: [{ name: 'W', scale: 0.1, isText: true, style: 'STANDARD', upright: 0 }],
    isComplex: true,
  },
  {
    name: 'SEWER',
    description: 'Sewer line ----S----S----',
    pattern: [0.5, -0.2, 0, -0.2],
    patternLength: 0.9,
    shapeData: [{ name: 'S', scale: 0.1, isText: true, style: 'STANDARD', upright: 0 }],
    isComplex: true,
  },
  {
    name: 'GAS',
    description: 'Gas line ----G----G----',
    pattern: [0.5, -0.2, 0, -0.2],
    patternLength: 0.9,
    shapeData: [{ name: 'G', scale: 0.1, isText: true, style: 'STANDARD', upright: 0 }],
    isComplex: true,
  },
  {
    name: 'ELECTRIC',
    description: 'Electric line ----E----E----',
    pattern: [0.5, -0.2, 0, -0.2],
    patternLength: 0.9,
    shapeData: [{ name: 'E', scale: 0.1, isText: true, style: 'STANDARD', upright: 0 }],
    isComplex: true,
  },
  {
    name: 'CONTOUR',
    description: 'Contour line (continuous)',
    pattern: [],
    patternLength: 0,
    isComplex: false,
  },
  {
    name: 'CONTOUR_INDEX',
    description: 'Index contour (thick continuous)',
    pattern: [],
    patternLength: 0,
    isComplex: false,
  },
  {
    name: 'BREAKLINE',
    description: 'Breakline dashed',
    pattern: [0.5, -0.25],
    patternLength: 0.75,
    isComplex: false,
  },
  {
    name: 'SETBACK',
    description: 'Setback line _ _ _ _',
    pattern: [0.25, -0.125],
    patternLength: 0.375,
    isComplex: false,
  },
  // Text-based utility linetypes
  {
    name: 'REGULATED_WATERS',
    description: 'Regulated waters ----RW----RW----',
    pattern: [0.5, -0.25, 0, -0.25],
    patternLength: 1.0,
    shapeData: [{ name: 'RW', scale: 0.1, isText: true, style: 'STANDARD', upright: 0 }],
    isComplex: true,
  },
  {
    name: 'WETLAND',
    description: 'Wetland boundary ----WL----WL----',
    pattern: [0.5, -0.25, 0, -0.25],
    patternLength: 1.0,
    shapeData: [{ name: 'WL', scale: 0.1, isText: true, style: 'STANDARD', upright: 0 }],
    isComplex: true,
  },
  {
    name: 'FLOOD_ZONE',
    description: 'Flood zone boundary ----FZ----FZ----',
    pattern: [0.5, -0.25, 0, -0.25],
    patternLength: 1.0,
    shapeData: [{ name: 'FZ', scale: 0.1, isText: true, style: 'STANDARD', upright: 0 }],
    isComplex: true,
  },
  {
    name: 'STORM_DRAIN',
    description: 'Storm drain ----SD----SD----',
    pattern: [0.5, -0.25, 0, -0.25],
    patternLength: 1.0,
    shapeData: [{ name: 'SD', scale: 0.1, isText: true, style: 'STANDARD', upright: 0 }],
    isComplex: true,
  },
  {
    name: 'FIBER_OPTIC',
    description: 'Fiber optic ----FO----FO----',
    pattern: [0.5, -0.25, 0, -0.25],
    patternLength: 1.0,
    shapeData: [{ name: 'FO', scale: 0.1, isText: true, style: 'STANDARD', upright: 0 }],
    isComplex: true,
  },
  {
    name: 'TELEPHONE',
    description: 'Telephone line ----T----T----',
    pattern: [0.5, -0.2, 0, -0.2],
    patternLength: 0.9,
    shapeData: [{ name: 'T', scale: 0.1, isText: true, style: 'STANDARD', upright: 0 }],
    isComplex: true,
  },
  {
    name: 'CABLE_TV',
    description: 'Cable TV line ----CATV----CATV----',
    pattern: [0.5, -0.35, 0, -0.35],
    patternLength: 1.2,
    shapeData: [{ name: 'CATV', scale: 0.1, isText: true, style: 'STANDARD', upright: 0 }],
    isComplex: true,
  },
  {
    name: 'FORCE_MAIN',
    description: 'Force main ----FM----FM----',
    pattern: [0.5, -0.25, 0, -0.25],
    patternLength: 1.0,
    shapeData: [{ name: 'FM', scale: 0.1, isText: true, style: 'STANDARD', upright: 0 }],
    isComplex: true,
  },
  {
    name: 'RECLAIMED_WATER',
    description: 'Reclaimed water ----RCW----RCW----',
    pattern: [0.5, -0.3, 0, -0.3],
    patternLength: 1.1,
    shapeData: [{ name: 'RCW', scale: 0.1, isText: true, style: 'STANDARD', upright: 0 }],
    isComplex: true,
  },
];

/**
 * Format pattern for display
 */
export function formatPatternDisplay(pattern: number[]): string {
  if (!pattern || pattern.length === 0) {
    return '__________ (continuous)';
  }
  
  let display = '';
  for (const element of pattern) {
    if (element > 0) {
      // Dash
      const dashLen = Math.max(1, Math.round(element * 10));
      display += '_'.repeat(dashLen);
    } else if (element < 0) {
      // Gap
      const gapLen = Math.max(1, Math.round(Math.abs(element) * 10));
      display += ' '.repeat(gapLen);
    } else {
      // Dot
      display += '.';
    }
  }
  
  // Repeat pattern a few times for visual
  return (display + display + display).substring(0, 40);
}
