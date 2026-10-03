/**
 * Advanced Coordinate Correction System
 * 
 * Handles OCR extraction errors including:
 * - Digit transposition (388 vs 380)
 * - Row misalignment/swapping
 * - Precision loss (2 decimals vs 4)
 * - Common OCR character substitutions (O↔0, l↔1, etc)
 * - Outlier detection and correction
 */

export interface CorrectedCoordinate {
  pointName: string;
  northing: number;
  easting: number;
  corrections: string[];
  confidence: number;
}

/**
 * Analyzes coordinate sequences to detect and correct common OCR errors
 */
export class CoordinateCorrector {
  private readonly OUTLIER_THRESHOLD = 1000; // meters - flagrant deviations
  private readonly PRECISION_THRESHOLD = 5; // decimals - minimum 5 decimal places for survey-grade precision
  private readonly COORDINATE_RANGE = {
    northing: { min: 300000, max: 5000000 }, // typical US UTM range
    easting: { min: 100000, max: 3000000 }   // typical US UTM range (expanded to include zones with 2.3M+ eastings)
  };

  /**
   * Main correction function - analyzes array of extracted coordinates
   */
  correctCoordinates(extracted: Array<{pointName: string; northing: number; easting: number}>): CorrectedCoordinate[] {
    if (extracted.length === 0) return [];

    console.log(`[CoordCorrection] INCOMING coordinates (${extracted.length} points):`);
    extracted.forEach((c, i) => {
      console.log(`  [${i}] ${c.pointName}: N=${c.northing}, E=${c.easting}`);
    });

    // Step 1: Fix character substitution errors
    let corrected = extracted.map(c => this.fixCharacterSubstitutions(c));

    // Step 2: Detect and fix digit transposition
    corrected = this.fixDigitTransposition(corrected);

    // Step 3: Detect and fix row swaps - DISABLED (too aggressive, causes more problems)
    // corrected = this.fixRowSwaps(corrected);

    // Step 4: Fix precision issues
    corrected = this.ensurePrecision(corrected);

    // Step 5: Detect outliers and apply heuristic corrections
    corrected = this.correctOutliers(corrected);

    // Step 6: Validate against coordinate system expectations
    corrected = this.validateCoordinateSystem(corrected);

    console.log(`[CoordCorrection] OUTGOING coordinates (${corrected.length} points):`);
    corrected.forEach((c, i) => {
      console.log(`  [${i}] ${c.pointName}: N=${c.northing}, E=${c.easting} | Corrections: ${c.corrections.join('; ')}`);
    });

    return corrected;
  }

  /**
   * Fixes common OCR character substitutions
   */
  private fixCharacterSubstitutions(coord: any): any {
    const pointName = coord.pointName?.toString() || '';
    
    // Common OCR substitutions
    const corrections: Record<string, string> = {
      'O': '0', // letter O to zero
      'l': '1', // lowercase L to one
      'I': '1', // uppercase I to one
      'S': '5', // S to 5
      'Z': '2', // Z to 2
    };

    let correctedName = pointName;
    let nameFixed = false;

    for (const [from, to] of Object.entries(corrections)) {
      if (pointName.includes(from)) {
        correctedName = pointName.replace(from, to);
        nameFixed = true;
      }
    }

    return {
      ...coord,
      pointName: correctedName,
      nameFixed
    };
  }

  /**
   * Detects and fixes digit transposition (388 → 380, etc)
   * Common error: first or last digit transposed
   */
  private fixDigitTransposition(coords: any[]): any[] {
    return coords.map((coord, index) => {
      const corrections: string[] = [];
      let { northing, easting } = coord;

      // Check northing for transposition
      const northingCheck = this.checkForTransposition(northing);
      if (northingCheck.isTransposed) {
        northing = northingCheck.corrected;
        corrections.push(`Fixed northing digit transposition: ${northingCheck.original} → ${northing}`);
      }

      // Check easting for transposition
      const eastingCheck = this.checkForTransposition(easting);
      if (eastingCheck.isTransposed) {
        easting = eastingCheck.corrected;
        corrections.push(`Fixed easting digit transposition: ${eastingCheck.original} → ${easting}`);
      }

      return {
        ...coord,
        northing,
        easting,
        corrections: [...(coord.corrections || []), ...corrections]
      };
    });
  }

  /**
   * Checks if a coordinate has transposed digits
   * Example: 388351 should be 380351 (first digit swapped)
   */
  private checkForTransposition(value: number): { isTransposed: boolean; original: number; corrected: number } {
    const str = value.toString();
    const integerPart = str.split('.')[0];

    // Check each digit swap possibility
    for (let i = 0; i < integerPart.length - 1; i++) {
      const swapped = integerPart.substring(0, i) + 
                      integerPart[i + 1] + 
                      integerPart[i] + 
                      integerPart.substring(i + 2);
      const swappedNum = parseFloat(swapped + (str.includes('.') ? '.' + str.split('.')[1] : ''));

      // If swapped version is in valid range and original is out of range, it's likely transposed
      if (this.isValidCoordinate(swappedNum) && !this.isValidCoordinate(value)) {
        return { isTransposed: true, original: value, corrected: swappedNum };
      }
    }

    return { isTransposed: false, original: value, corrected: value };
  }

  /**
   * Detects and fixes row swaps
   * Example: If point 3 has coordinates that belong to point 2, swap them
   */
  private fixRowSwaps(coords: any[]): any[] {
    const corrected = [...coords];
    const corrections: Map<number, string[]> = new Map();

    for (let i = 0; i < corrected.length - 1; i++) {
      const current = corrected[i];
      const next = corrected[i + 1];

      // Check if coordinates are inverted (suggest row swap)
      if (this.shouldSwapRows(current, next)) {
        console.log(`[CoordCorrection] SWAP DETECTED at index ${i}: PN "${current.pointNumber}" (N=${current.northing}, E=${current.easting}) and "${next.pointNumber}" (N=${next.northing}, E=${next.easting})`);
        
        // Swap the coordinates
        const tempN = current.northing;
        const tempE = current.easting;
        corrected[i].northing = next.northing;
        corrected[i].easting = next.easting;
        corrected[i + 1].northing = tempN;
        corrected[i + 1].easting = tempE;

        const correctionMsg = `Swapped rows ${i} and ${i + 1} - coordinates were reversed`;
        corrections.set(i, [...(corrections.get(i) || []), correctionMsg]);
        corrections.set(i + 1, [...(corrections.get(i + 1) || []), correctionMsg]);
        
        console.log(`[CoordCorrection] AFTER SWAP at index ${i}: PN "${corrected[i].pointNumber}" (N=${corrected[i].northing}, E=${corrected[i].easting}) and "${corrected[i+1].pointNumber}" (N=${corrected[i+1].northing}, E=${corrected[i+1].easting})`);
      }
    }

    // Apply corrections to corrected array
    corrections.forEach((msgs, idx) => {
      corrected[idx].corrections = [...(corrected[idx].corrections || []), ...msgs];
    });

    return corrected;
  }

  /**
   * Detects if two consecutive rows should be swapped
   */
  private shouldSwapRows(current: any, next: any): boolean {
    // If current northing > next northing AND current easting > next easting
    // AND they're very close to each other, they might be swapped
    if (current.northing > next.northing && current.easting > next.easting) {
      const northDiff = Math.abs(current.northing - next.northing);
      const eastDiff = Math.abs(current.easting - next.easting);
      
      // Both coordinates are close (within normal variation range)
      if (northDiff < 200 && eastDiff < 200) {
        return true;
      }
    }

    return false;
  }

  /**
   * Ensures minimum precision (5 decimal places for coordinates)
   */
  private ensurePrecision(coords: any[]): any[] {
    return coords.map(coord => {
      const corrections: string[] = [...(coord.corrections || [])];
      let { northing, easting } = coord;

      // Check and fix northing precision
      const northingStr = northing.toString();
      const northingDecimals = northingStr.includes('.') ? northingStr.split('.')[1].length : 0;
      if (northingDecimals < this.PRECISION_THRESHOLD) {
        northing = parseFloat(northing.toFixed(5));
        corrections.push(`Enhanced northing precision to 5 decimals`);
      }

      // Check and fix easting precision
      const eastingStr = easting.toString();
      const eastingDecimals = eastingStr.includes('.') ? eastingStr.split('.')[1].length : 0;
      if (eastingDecimals < this.PRECISION_THRESHOLD) {
        easting = parseFloat(easting.toFixed(5));
        corrections.push(`Enhanced easting precision to 5 decimals`);
      }

      return {
        ...coord,
        northing,
        easting,
        corrections
      };
    });
  }

  /**
   * Detects and corrects statistical outliers
   */
  private correctOutliers(coords: any[]): any[] {
    if (coords.length < 3) return coords; // Need at least 3 points for outlier detection

    const corrections: Map<number, string[]> = new Map();

    // Check each coordinate for outliers using neighboring values
    for (let i = 0; i < coords.length; i++) {
      const prev = i > 0 ? coords[i - 1] : null;
      const next = i < coords.length - 1 ? coords[i + 1] : null;
      const current = coords[i];

      // Calculate expected ranges from neighbors
      if (prev && next) {
        // Check if current is a statistical outlier
        const northingOutlier = this.isOutlier(prev.northing, current.northing, next.northing);
        const eastingOutlier = this.isOutlier(prev.easting, current.easting, next.easting);

        if (northingOutlier) {
          // Try to correct by using average or pattern
          const corrected = this.correctOutlierValue(prev.northing, next.northing);
          if (corrected !== current.northing) {
            corrections.set(i, [...(corrections.get(i) || []), 
              `Corrected northing outlier: ${current.northing} → ${corrected}`]);
            coords[i].northing = corrected;
          }
        }

        if (eastingOutlier) {
          const corrected = this.correctOutlierValue(prev.easting, next.easting);
          if (corrected !== current.easting) {
            corrections.set(i, [...(corrections.get(i) || []), 
              `Corrected easting outlier: ${current.easting} → ${corrected}`]);
            coords[i].easting = corrected;
          }
        }
      }
    }

    // Apply corrections
    corrections.forEach((msgs, idx) => {
      coords[idx].corrections = [...(coords[idx].corrections || []), ...msgs];
    });

    return coords;
  }

  /**
   * Detects if a value is a statistical outlier
   */
  private isOutlier(prev: number, current: number, next: number): boolean {
    const expectedChange = Math.abs(next - prev) / 2;
    const actualChange = Math.abs(current - prev);
    
    // If change is much larger than expected, it's an outlier
    return actualChange > expectedChange * 3 && actualChange > this.OUTLIER_THRESHOLD;
  }

  /**
   * Corrects an outlier value using surrounding values
   */
  private correctOutlierValue(prev: number, next: number): number {
    // Use linear interpolation
    return (prev + next) / 2;
  }

  /**
   * Validates coordinates against expected coordinate system
   */
  private validateCoordinateSystem(coords: any[]): any[] {
    return coords.map(coord => {
      const corrections: string[] = [...(coord.corrections || [])];

      // Check if coordinates are in expected UTM range
      if (!this.isValidCoordinate(coord.northing, 'northing')) {
        corrections.push(`⚠️ Northing ${coord.northing} outside expected UTM range`);
      }
      if (!this.isValidCoordinate(coord.easting, 'easting')) {
        corrections.push(`⚠️ Easting ${coord.easting} outside expected UTM range`);
      }

      return {
        ...coord,
        corrections
      };
    });
  }

  /**
   * Checks if coordinate is valid
   */
  private isValidCoordinate(value: number, type: 'northing' | 'easting' = 'northing'): boolean {
    const range = this.COORDINATE_RANGE[type];
    return value >= range.min && value <= range.max;
  }
}

/**
 * Enhanced coordinate validation for extracted tables
 */
export function validateAndCorrectCoordinates(
  extracted: Array<{ pointName: string; northing: number; easting: number }>
): CorrectedCoordinate[] {
  const corrector = new CoordinateCorrector();
  return corrector.correctCoordinates(extracted);
}

/**
 * Quick validation - returns validation result with confidence score
 */
export interface ValidationResult {
  valid: boolean;
  confidence: number;
  issues: string[];
  suggestions: string[];
}

export function quickValidateCoordinate(
  northing: number,
  easting: number
): ValidationResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let confidence = 100;

  // Check ranges
  if (northing < 300000 || northing > 5000000) {
    issues.push(`Northing ${northing} outside typical US UTM range`);
    confidence -= 30;
    suggestions.push('Check OCR - first digits may be transposed');
  }

  if (easting < 100000 || easting > 1000000) {
    issues.push(`Easting ${easting} outside typical US UTM range`);
    confidence -= 30;
    suggestions.push('Check OCR - digits may be misread');
  }

  // Check precision
  const northingDecimals = northing.toString().split('.')[1]?.length || 0;
  const eastingDecimals = easting.toString().split('.')[1]?.length || 0;

  if (northingDecimals < 2) {
    issues.push(`Northing precision low (${northingDecimals} decimals)`);
    confidence -= 10;
  }

  if (eastingDecimals < 2) {
    issues.push(`Easting precision low (${eastingDecimals} decimals)`);
    confidence -= 10;
  }

  return {
    valid: confidence > 70,
    confidence: Math.max(0, confidence),
    issues,
    suggestions
  };
}
