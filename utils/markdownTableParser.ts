/**
 * Markdown Table Parser for CAD Standards
 * 
 * Client-side utility to parse markdown tables into StandardDefinition objects.
 * This eliminates the need for a backend API call.
 * 
 * Expected table format:
 * | Code | Description | Point Layer | Line Layer | Linetype | Symbol | Category |
 * |------|-------------|-------------|------------|----------|--------|----------|
 * | CP   | Control Point| V-SURV-CTRL| -          | CONTINUOUS | CTRL_PT| Control  |
 * | FNC  | Fence       | V-PROP-FNCE| V-PROP-FNCE| FENCELINE | X      | Boundary |
 */

import { StandardDefinition, CodeDefinition, LinetypeDefinition } from '../contexts/types/CadManager.types';
import { COMMON_SURVEY_LINETYPES } from './linetypeParser';

/**
 * Parse a markdown table into an array of CodeDefinition objects
 */
export function parseMarkdownTable(markdown: string): CodeDefinition[] {
  const codes: CodeDefinition[] = [];
  
  // Split into lines and find table rows
  const lines = markdown.split('\n');
  
  let inTable = false;
  let headerRow: string[] = [];
  let columnIndexMap: Record<string, number> = {};
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Skip empty lines
    if (!trimmedLine) {
      inTable = false;
      continue;
    }
    
    // Check if this is a table row (starts and ends with |)
    if (trimmedLine.startsWith('|') && trimmedLine.endsWith('|')) {
      const cells = trimmedLine
        .slice(1, -1) // Remove leading and trailing |
        .split('|')
        .map(cell => cell.trim());
      
      // Skip separator row (contains dashes)
      if (cells.every(cell => /^[-:]+$/.test(cell) || cell === '')) {
        continue;
      }
      
      // First table row is the header
      if (!inTable) {
        inTable = true;
        headerRow = cells.map(h => h.toLowerCase());
        
        // Build column index map
        columnIndexMap = {};
        headerRow.forEach((header, index) => {
          if (header.includes('code')) columnIndexMap['code'] = index;
          else if (header.includes('description') || header.includes('desc')) columnIndexMap['description'] = index;
          else if (header.includes('point') && header.includes('layer')) columnIndexMap['pointLayer'] = index;
          else if (header.includes('line') && header.includes('layer')) columnIndexMap['lineLayer'] = index;
          else if (header.includes('linetype') || header.includes('line type')) columnIndexMap['lineType'] = index;
          else if (header.includes('symbol')) columnIndexMap['symbol'] = index;
          else if (header.includes('category') || header.includes('cat')) columnIndexMap['category'] = index;
        });
        
        console.log('[markdownTableParser] Header row:', headerRow);
        console.log('[markdownTableParser] Column index map:', columnIndexMap);
        
        // Warn if no linetype column found
        if (!('lineType' in columnIndexMap)) {
          console.warn('[markdownTableParser] WARNING: No Linetype column detected in header!');
          console.warn('[markdownTableParser] Headers found:', headerRow.join(', '));
        }
        
        continue;
      }
      
      // Data row
      const code = cells[columnIndexMap['code']] || '';
      const description = cells[columnIndexMap['description']] || '';
      const pointLayer = cells[columnIndexMap['pointLayer']] || '';
      const lineLayer = cells[columnIndexMap['lineLayer']] || '';
      const lineType = cells[columnIndexMap['lineType']] || '';
      const symbol = cells[columnIndexMap['symbol']] || '';
      const category = cells[columnIndexMap['category']] || '';
      
      // Debug log first few rows
      if (codes.length < 3) {
        console.log(`[markdownTableParser] Row ${codes.length}: code="${code}", lineType="${lineType}", cells=`, cells);
      }
      
      // Skip if no code
      if (!code || code === '-' || code === 'Code') continue;
      
      codes.push({
        code: code.toUpperCase(),
        description: description,
        pointLayer: pointLayer !== '-' ? pointLayer : undefined,
        lineLayer: lineLayer !== '-' && lineLayer !== '' ? lineLayer : undefined,
        lineType: lineType !== '-' && lineType !== '' ? lineType : undefined,
        symbol: symbol !== '-' && symbol !== '' ? symbol : undefined,
        category: category !== '-' ? category : 'Misc',
      });
    } else {
      // Not a table row, reset
      inTable = false;
    }
  }
  
  return codes;
}

/**
 * Extract markdown table from AI response that may contain other text
 */
export function extractMarkdownTable(response: string): string | null {
  // First, normalize the response - sometimes AI outputs \n as literal text instead of newlines
  const normalizedResponse = response
    .replace(/\\n/g, '\n')  // Replace literal \n with actual newlines
    .replace(/\r\n/g, '\n') // Normalize Windows line endings
    .replace(/\r/g, '\n');  // Normalize Mac line endings
  
  // Look for markdown table pattern
  const tableRegex = /\|[^\n]+\|\n\|[-:\s|]+\|\n(\|[^\n]+\|\n?)+/g;
  const matches = normalizedResponse.match(tableRegex);
  
  if (matches && matches.length > 0) {
    // Return the largest table found (most complete)
    return matches.reduce((a, b) => a.length > b.length ? a : b);
  }
  
  // Fallback: Try to find pipe-delimited data without proper header separator
  // This handles cases where AI outputs | Code | Desc | ... format without --- separator
  const pipeLineRegex = /(\|[^|\n]+)+\|/g;
  const pipeMatches = normalizedResponse.match(pipeLineRegex);
  
  if (pipeMatches && pipeMatches.length >= 3) {
    console.log('[extractMarkdownTable] Found pipe-delimited content without proper header separator');
    
    // Try to construct a valid markdown table
    // First line should be header, we'll add separator, then data rows
    const lines = pipeMatches.filter(line => line.includes('|') && line.trim().length > 5);
    
    if (lines.length >= 2) {
      // Check if first line looks like a header (has Code, Description, Layer, etc.)
      const firstLine = lines[0].toLowerCase();
      const looksLikeHeader = firstLine.includes('code') || firstLine.includes('description') || firstLine.includes('layer');
      
      if (looksLikeHeader) {
        // Count columns from header
        const headerCells = lines[0].split('|').filter(c => c.trim());
        const separator = '|' + headerCells.map(() => '---').join('|') + '|';
        
        // Build proper markdown table
        const table = [lines[0], separator, ...lines.slice(1)].join('\n');
        console.log('[extractMarkdownTable] Reconstructed table from pipe-delimited data');
        return table;
      }
    }
  }
  
  return null;
}

/**
 * Generate LinetypeDefinition objects from unique lineType values in codes.
 * Uses COMMON_SURVEY_LINETYPES as a lookup table, generating simple dashed
 * patterns for unknown linetypes.
 */
export function generateLinetypesFromCodes(codes: CodeDefinition[]): LinetypeDefinition[] {
  // Collect unique non-empty lineType values (normalized to uppercase)
  const uniqueLinetypes = new Set<string>();
  
  for (const code of codes) {
    if (code.lineType && code.lineType !== '-' && code.lineType !== '') {
      const normalized = code.lineType.toUpperCase().trim();
      // Skip CONTINUOUS as it's a built-in AutoCAD linetype
      if (normalized !== 'CONTINUOUS' && normalized !== 'BYLAYER' && normalized !== 'BYBLOCK') {
        uniqueLinetypes.add(normalized);
      }
    }
  }
  
  if (uniqueLinetypes.size === 0) {
    return [];
  }
  
  // Build lookup map from COMMON_SURVEY_LINETYPES
  const knownLinetypes = new Map<string, LinetypeDefinition>();
  for (const lt of COMMON_SURVEY_LINETYPES) {
    knownLinetypes.set(lt.name.toUpperCase(), lt);
  }
  
  // Also add some common aliases
  const aliasMap: Record<string, string> = {
    'FENCELINE': 'FENCE',
    'FENCE_LINE': 'FENCE',
    'FENCE LINE': 'FENCE',
    'PROPERTY_LINE': 'PROPERTY',
    'PROPERTYLINE': 'PROPERTY',
    'PROPERTY LINE': 'PROPERTY',
    'EASEMENTLINE': 'EASEMENT',
    'EASEMENT_LINE': 'EASEMENT',
    'CENTER': 'CENTERLINE',
    'CENTER_LINE': 'CENTERLINE',
    'CL': 'CENTERLINE',
    'WATERLINE': 'WATER',
    'WATER_LINE': 'WATER',
    'SEWERLINE': 'SEWER',
    'SEWER_LINE': 'SEWER',
    'GASLINE': 'GAS',
    'GAS_LINE': 'GAS',
    'ELECTRICLINE': 'ELECTRIC',
    'ELECTRIC_LINE': 'ELECTRIC',
    'ELEC': 'ELECTRIC',
    'UNDERGROUND': 'UTILITY_UG',
    'UG': 'UTILITY_UG',
    'OVERHEAD': 'UTILITY_OH',
    'OH': 'UTILITY_OH',
    'STORMLINE': 'STORM_DRAIN',
    'STORM': 'STORM_DRAIN',
    'SD': 'STORM_DRAIN',
    'FIBER': 'FIBER_OPTIC',
    'FO': 'FIBER_OPTIC',
    'TEL': 'TELEPHONE',
    'PHONE': 'TELEPHONE',
    'CATV': 'CABLE_TV',
    'CABLE': 'CABLE_TV',
    'FM': 'FORCE_MAIN',
    'FORCEMAIN': 'FORCE_MAIN',
    'RECLAIMED': 'RECLAIMED_WATER',
    'RCW': 'RECLAIMED_WATER',
    'WETLANDS': 'WETLAND',
    'WL': 'WETLAND',
    'FLOOD': 'FLOOD_ZONE',
    'FZ': 'FLOOD_ZONE',
    'RW': 'REGULATED_WATERS',
  };
  
  const generatedLinetypes: LinetypeDefinition[] = [];
  
  for (const linetypeName of uniqueLinetypes) {
    // Check if it's a known linetype directly
    if (knownLinetypes.has(linetypeName)) {
      generatedLinetypes.push({
        ...knownLinetypes.get(linetypeName)!,
        source: 'auto-generated',
      });
      continue;
    }
    
    // Check aliases
    const aliasedName = aliasMap[linetypeName];
    if (aliasedName && knownLinetypes.has(aliasedName)) {
      // Use the aliased linetype but with original name
      const baseLt = knownLinetypes.get(aliasedName)!;
      generatedLinetypes.push({
        ...baseLt,
        name: linetypeName, // Keep user's name
        source: 'auto-generated',
      });
      continue;
    }
    
    // Unknown linetype - generate a simple text-based linetype
    // Use first 4 chars as the embedded text symbol
    const textSymbol = linetypeName.substring(0, 4);
    generatedLinetypes.push({
      name: linetypeName,
      description: `${linetypeName} line ----${textSymbol}----${textSymbol}----`,
      pattern: [0.5, -0.25, 0, -0.25],
      patternLength: 1.0,
      shapeData: [{ 
        name: textSymbol, 
        scale: 0.1, 
        isText: true, 
        style: 'STANDARD', 
        upright: 0 
      }],
      isComplex: true,
      source: 'auto-generated',
    });
  }
  
  return generatedLinetypes;
}

/**
 * Parse markdown content into a StandardDefinition
 */
export function parseMarkdownToStandard(
  markdownContent: string,
  fileName?: string
): StandardDefinition {
  // Try to extract table if there's surrounding text
  const tableContent = extractMarkdownTable(markdownContent) || markdownContent;
  
  const codes = parseMarkdownTable(tableContent);
  
  // Debug: Check linetype values in codes
  const codesWithLinetype = codes.filter(c => c.lineType && c.lineType !== '-');
  console.log(`[markdownTableParser] Parsed ${codes.length} codes, ${codesWithLinetype.length} have lineType values`);
  if (codesWithLinetype.length > 0) {
    console.log('[markdownTableParser] Sample codes with linetypes:', codesWithLinetype.slice(0, 5).map(c => ({ code: c.code, lineType: c.lineType })));
  }
  
  // Auto-generate linetypes from lineType values in codes
  const linetypes = generateLinetypesFromCodes(codes);
  console.log(`[markdownTableParser] Generated ${linetypes.length} linetype definitions`);
  
  // Extract name from filename or generate default
  let name = 'Custom Standards';
  if (fileName) {
    name = fileName.replace(/\.(md|markdown)$/i, '').replace(/[-_]/g, ' ');
  }
  
  // Try to extract name from markdown header if present
  const headerMatch = markdownContent.match(/^#\s+(.+)$/m);
  if (headerMatch) {
    name = headerMatch[1].trim();
  }
  
  // Determine unique categories for description
  const categories = [...new Set(codes.map(c => c.category).filter(Boolean))];
  
  return {
    name,
    version: '1.0',
    description: categories.length > 0 
      ? `Includes: ${categories.join(', ')}` 
      : 'Custom CAD standards',
    lastUpdated: new Date().toISOString(),
    source: fileName || 'AI-Generated',
    codes,
    linetypes: linetypes.length > 0 ? linetypes : undefined,
  };
}

/**
 * Validate parsed codes and report issues
 */
export function validateCodes(codes: CodeDefinition[]): {
  valid: boolean;
  issues: string[];
  warnings: string[];
} {
  const issues: string[] = [];
  const warnings: string[] = [];
  
  if (codes.length === 0) {
    issues.push('No codes were parsed from the markdown');
    return { valid: false, issues, warnings };
  }
  
  // Check for duplicate codes
  const codeSet = new Set<string>();
  for (const code of codes) {
    if (codeSet.has(code.code)) {
      warnings.push(`Duplicate code: ${code.code}`);
    }
    codeSet.add(code.code);
  }
  
  // Check for missing required fields
  for (const code of codes) {
    if (!code.code) {
      issues.push('Found code entry without a code value');
    }
    if (!code.description) {
      warnings.push(`Code ${code.code} is missing a description`);
    }
    if (!code.pointLayer && !code.lineLayer) {
      warnings.push(`Code ${code.code} has no layer assignment`);
    }
  }
  
  return {
    valid: issues.length === 0,
    issues,
    warnings,
  };
}
