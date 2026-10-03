/**
 * A/E/C CAD Standard Layer Validation
 * 
 * Validates layer names against USACE/DoD A/E/C CAD Standard Release 6.2
 * This standard is NCS-compliant and publicly available.
 * 
 * Layer Format: Discipline-Major[-Minor][-Status]
 * Example: C-TOPO-SPOT, V-SURV-CTRL-E, C-STRM-PIPE-N
 * 
 * Reference: CAD/BIM Technology Center (https://cadbimcenter.erdc.dren.mil/)
 */

// Valid discipline designators per A/E/C CAD Standard
export const VALID_DISCIPLINES: Record<string, string> = {
  'A': 'Architectural',
  'C': 'Civil',
  'E': 'Electrical',
  'F': 'Fire Protection',
  'G': 'General',
  'H': 'Hazardous Materials',
  'I': 'Interiors',
  'L': 'Landscape',
  'M': 'Mechanical',
  'P': 'Plumbing',
  'Q': 'Equipment',
  'S': 'Structural',
  'V': 'Survey/Mapping',
  'X': 'Other Disciplines',
  'Z': 'Contractor/Shop Drawings',
};

// Valid status field suffixes
export const VALID_STATUS_CODES: Record<string, string> = {
  'N': 'New',
  'E': 'Existing',
  'D': 'Demolition/Removal',
  'F': 'Future',
  'T': 'Temporary',
  'M': 'Move/Relocate',
  'X': 'Not in Contract (Reference)',
};

// Common major groups for Civil/Survey disciplines (most relevant to land surveying)
// This is not exhaustive but covers typical survey use cases
export const COMMON_MAJOR_GROUPS: Record<string, string[]> = {
  'V': ['SURV', 'TOPO', 'CTRL', 'BNDRY', 'ESMT', 'SETB', 'FLOD', 'WETL', 'CONTOUR', 'SPOT', 'GRID', 'PNTS', 'ANNO'],
  'C': ['TOPO', 'ROAD', 'PKNG', 'STRM', 'SSWR', 'WATR', 'FIRE', 'PVMT', 'CURB', 'WALK', 'WALL', 'GRAT', 'UTIL', 'PROP', 'ANNO'],
  'L': ['PLNT', 'TREE', 'SHRB', 'GRND', 'HARD', 'IRRI', 'FURN', 'ANNO'],
  'E': ['LITE', 'POWR', 'DIST', 'TELE', 'DATA', 'FIRE', 'SECY', 'ANNO'],
  'G': ['ANNO', 'TITL', 'NPLT', 'IDEN', 'GENL'],
};

export interface LayerValidationResult {
  layerName: string;
  isValid: boolean;
  discipline: string | null;
  disciplineDescription: string | null;
  majorGroup: string | null;
  minorGroup: string | null;
  status: string | null;
  statusDescription: string | null;
  warnings: string[];
  errors: string[];
  suggestions: string[];
}

export interface ValidationSummary {
  totalLayers: number;
  validLayers: number;
  invalidLayers: number;
  warningCount: number;
  errorCount: number;
  compliancePercentage: number;
  results: LayerValidationResult[];
  uniqueDisciplines: string[];
  commonIssues: string[];
}

/**
 * Parse a layer name into its A/E/C components
 */
function parseLayerName(layerName: string): {
  discipline: string | null;
  major: string | null;
  minor: string | null;
  status: string | null;
  parts: string[];
} {
  const parts = layerName.toUpperCase().split('-');
  
  return {
    discipline: parts[0] || null,
    major: parts[1] || null,
    minor: parts.length > 3 ? parts.slice(2, -1).join('-') : (parts[2] || null),
    status: parts.length > 2 ? parts[parts.length - 1] : null,
    parts,
  };
}

/**
 * Check if a string looks like a status code (single letter at end)
 */
function isStatusCode(str: string | null): boolean {
  if (!str || str.length !== 1) return false;
  return str in VALID_STATUS_CODES;
}

/**
 * Validate a single layer name against A/E/C CAD Standard
 */
export function validateAECLayer(layerName: string): LayerValidationResult {
  const result: LayerValidationResult = {
    layerName,
    isValid: true,
    discipline: null,
    disciplineDescription: null,
    majorGroup: null,
    minorGroup: null,
    status: null,
    statusDescription: null,
    warnings: [],
    errors: [],
    suggestions: [],
  };

  // Skip validation for empty, dash-only, or special layers
  if (!layerName || layerName === '-' || layerName === '0' || layerName.toLowerCase() === 'defpoints') {
    result.isValid = true; // These are acceptable
    result.warnings.push('Special/default layer - no validation applied');
    return result;
  }

  const parsed = parseLayerName(layerName);
  
  // Check discipline designator
  if (!parsed.discipline) {
    result.isValid = false;
    result.errors.push('Missing discipline designator');
    return result;
  }

  const disciplineUpper = parsed.discipline.toUpperCase();
  if (!(disciplineUpper in VALID_DISCIPLINES)) {
    result.isValid = false;
    result.errors.push(`Invalid discipline designator: "${parsed.discipline}". Valid: ${Object.keys(VALID_DISCIPLINES).join(', ')}`);
    
    // Suggest closest match
    if (disciplineUpper === 'W') {
      result.suggestions.push('Use "C" (Civil) for water-related layers, e.g., C-WATR');
    } else if (disciplineUpper === 'T') {
      result.suggestions.push('Use "V" (Survey/Mapping) for topographic layers, e.g., V-TOPO');
    } else if (disciplineUpper === 'U') {
      result.suggestions.push('Use discipline-specific designator for utilities: E (Electrical), M (Mechanical), P (Plumbing)');
    }
  } else {
    result.discipline = disciplineUpper;
    result.disciplineDescription = VALID_DISCIPLINES[disciplineUpper];
  }

  // Check major group
  if (!parsed.major) {
    result.isValid = false;
    result.errors.push('Missing major group. Format should be: Discipline-Major (e.g., C-TOPO)');
  } else {
    result.majorGroup = parsed.major.toUpperCase();
    
    // Check if major group is common for this discipline
    const commonMajors = COMMON_MAJOR_GROUPS[disciplineUpper];
    if (commonMajors && !commonMajors.includes(result.majorGroup)) {
      result.warnings.push(`"${result.majorGroup}" is not a common major group for ${result.disciplineDescription} discipline. Common: ${commonMajors.slice(0, 5).join(', ')}...`);
    }
  }

  // Check minor group (optional)
  if (parsed.parts.length > 2) {
    // Determine if last part is status or minor
    const lastPart = parsed.parts[parsed.parts.length - 1];
    
    if (isStatusCode(lastPart)) {
      result.status = lastPart;
      result.statusDescription = VALID_STATUS_CODES[lastPart];
      
      // Minor is everything between major and status
      if (parsed.parts.length > 3) {
        result.minorGroup = parsed.parts.slice(2, -1).join('-');
      }
    } else {
      // No status, everything after major is minor
      result.minorGroup = parsed.parts.slice(2).join('-');
      
      // Check if last part looks like it should be a status
      if (lastPart.length === 1 && /[A-Z]/.test(lastPart)) {
        result.warnings.push(`"${lastPart}" looks like a status code but is not valid. Valid status codes: ${Object.keys(VALID_STATUS_CODES).join(', ')}`);
      }
    }
  }

  // Check layer name length (CAD systems often have 31-char limit)
  if (layerName.length > 31) {
    result.warnings.push(`Layer name exceeds 31 characters (${layerName.length}). May be truncated in some CAD systems.`);
  }

  // Check for common issues
  if (layerName.includes('__')) {
    result.warnings.push('Contains double underscores - consider using single hyphen separator');
  }
  if (layerName.includes(' ')) {
    result.errors.push('Contains spaces - layer names should use hyphens as separators');
    result.isValid = false;
  }
  if (/[^A-Z0-9\-_]/.test(layerName.toUpperCase())) {
    result.warnings.push('Contains special characters - may cause issues in some CAD systems');
  }

  return result;
}

/**
 * Validate multiple layers and return a summary
 */
export function validateLayerSet(layerNames: string[]): ValidationSummary {
  // Deduplicate and filter
  const uniqueLayers = [...new Set(layerNames.filter(l => l && l !== '-'))];
  
  const results = uniqueLayers.map(validateAECLayer);
  
  const validResults = results.filter(r => r.isValid);
  const invalidResults = results.filter(r => !r.isValid);
  const warningCount = results.reduce((sum, r) => sum + r.warnings.length, 0);
  const errorCount = results.reduce((sum, r) => sum + r.errors.length, 0);
  
  // Get unique disciplines used
  const uniqueDisciplines = [...new Set(results.map(r => r.discipline).filter(Boolean))] as string[];
  
  // Find common issues
  const issueCount: Record<string, number> = {};
  results.forEach(r => {
    [...r.errors, ...r.warnings].forEach(issue => {
      // Normalize issue messages
      const normalized = issue.replace(/"[^"]+"/g, '"X"');
      issueCount[normalized] = (issueCount[normalized] || 0) + 1;
    });
  });
  
  const commonIssues = Object.entries(issueCount)
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([issue, count]) => `${issue} (${count} occurrences)`);

  return {
    totalLayers: uniqueLayers.length,
    validLayers: validResults.length,
    invalidLayers: invalidResults.length,
    warningCount,
    errorCount,
    compliancePercentage: uniqueLayers.length > 0 
      ? Math.round((validResults.length / uniqueLayers.length) * 100) 
      : 100,
    results,
    uniqueDisciplines,
    commonIssues,
  };
}

/**
 * Validate all layers from a CodeDefinition array
 */
export function validateStandardLayers(codes: Array<{ pointLayer: string; lineLayer?: string }>): ValidationSummary {
  const allLayers: string[] = [];
  
  codes.forEach(code => {
    if (code.pointLayer) allLayers.push(code.pointLayer);
    if (code.lineLayer) allLayers.push(code.lineLayer);
  });
  
  return validateLayerSet(allLayers);
}

/**
 * Suggest a compliant layer name for a given description/category
 */
export function suggestCompliantLayer(
  description: string,
  category?: string,
  isExisting?: boolean
): string {
  const desc = description.toLowerCase();
  const cat = (category || '').toLowerCase();
  
  let discipline = 'C'; // Default to Civil
  let major = 'MISC';
  let status = isExisting ? '-E' : '';
  
  // Determine discipline
  if (cat.includes('survey') || cat.includes('control') || cat.includes('monument') || cat.includes('boundary')) {
    discipline = 'V';
  } else if (cat.includes('landscape') || cat.includes('vegetation') || cat.includes('tree')) {
    discipline = 'L';
  } else if (cat.includes('electrical') || cat.includes('light') || cat.includes('power')) {
    discipline = 'E';
  } else if (cat.includes('plumbing') || desc.includes('sanitary') || desc.includes('sewer')) {
    discipline = 'P';
  }
  
  // Determine major group based on description
  if (desc.includes('topo') || desc.includes('contour') || desc.includes('spot')) {
    major = 'TOPO';
  } else if (desc.includes('storm') || desc.includes('drain')) {
    major = 'STRM';
  } else if (desc.includes('water') || desc.includes('hydrant')) {
    major = 'WATR';
  } else if (desc.includes('sanitary') || desc.includes('sewer')) {
    major = 'SSWR';
  } else if (desc.includes('control') || desc.includes('benchmark')) {
    major = 'CTRL';
  } else if (desc.includes('monument') || desc.includes('corner')) {
    major = 'BNDRY';
  } else if (desc.includes('easement')) {
    major = 'ESMT';
  } else if (desc.includes('road') || desc.includes('pavement') || desc.includes('curb')) {
    major = 'ROAD';
  } else if (desc.includes('fence')) {
    major = 'PROP';
  } else if (desc.includes('tree') || desc.includes('vegetation')) {
    major = 'PLNT';
  } else if (desc.includes('building') || desc.includes('structure')) {
    major = 'BLDG';
  } else if (desc.includes('utility') || desc.includes('electric') || desc.includes('power')) {
    major = 'POWR';
  } else if (desc.includes('gas')) {
    major = 'GAS';
  } else if (desc.includes('telecom') || desc.includes('communication')) {
    major = 'TELE';
  } else if (desc.includes('wetland') || desc.includes('water')) {
    major = 'WETL';
  }
  
  return `${discipline}-${major}${status}`;
}

/**
 * Get a human-readable compliance report
 */
export function getComplianceReport(summary: ValidationSummary): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════════════════',
    '  A/E/C CAD Standard Compliance Report (USACE/DoD 6.2)',
    '═══════════════════════════════════════════════════════════════',
    '',
    `Total Layers Analyzed: ${summary.totalLayers}`,
    `Valid Layers: ${summary.validLayers}`,
    `Invalid Layers: ${summary.invalidLayers}`,
    `Compliance: ${summary.compliancePercentage}%`,
    '',
    `Disciplines Used: ${summary.uniqueDisciplines.map(d => `${d} (${VALID_DISCIPLINES[d]})`).join(', ')}`,
    '',
  ];
  
  if (summary.commonIssues.length > 0) {
    lines.push('Common Issues:');
    summary.commonIssues.forEach(issue => lines.push(`  • ${issue}`));
    lines.push('');
  }
  
  if (summary.invalidLayers > 0) {
    lines.push('Invalid Layers:');
    summary.results
      .filter(r => !r.isValid)
      .slice(0, 10)
      .forEach(r => {
        lines.push(`  ✗ ${r.layerName}`);
        r.errors.forEach(err => lines.push(`      Error: ${err}`));
        r.suggestions.forEach(sug => lines.push(`      Suggestion: ${sug}`));
      });
    if (summary.invalidLayers > 10) {
      lines.push(`  ... and ${summary.invalidLayers - 10} more`);
    }
  }
  
  return lines.join('\n');
}
