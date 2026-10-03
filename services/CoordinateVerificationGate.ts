/**
 * Coordinate Verification Gate
 * 
 * Local gating logic that validates CACP feature coordinates before
 * CAD execution. Checks:
 * 1. Local PDF document restrictions (easements, zoning buffers)
 * 2. GIS layer conflicts (utility ROW, conservation areas, etc.)
 * 3. Project-specific constraints
 * 
 * If high-risk coordinates are detected, raises an alert to the smart glasses
 * and requires user confirmation before proceeding with drawing.
 * 
 * Reference: landsurv-xr-system-spec.md §4 (RAG-grounded verification)
 */

import { localDocumentRAG, RestrictionResult } from './LocalDocumentRAG';

export interface CoordinateCheckRequest {
  /** Feature coordinates [X, Y] or [X, Y, Z] in survey projection. */
  coordinates: [number, number] | [number, number, number];
  /** Feature type: tree, monument, boundary, utility, structure. */
  featureType: string;
  /** Optional: feature description/attributes. */
  attributes?: Record<string, unknown>;
}

export interface CoordinateCheckResponse {
  /** Approval status: 'approved' | 'requires_confirmation' | 'blocked'. */
  approved: boolean;
  requiresConfirmation?: boolean;
  /** Human-readable message for user (shown on Glass). */
  message?: string;
  /** Restriction details (if any). */
  restrictions?: RestrictionResult;
}

class CoordinateVerificationGateService {
  /**
   * Validate a CACP feature coordinate for CAD drawing.
   * 
   * @param request Coordinate + feature type to verify
   * @returns Approval status and optional warning message
   * 
   * Currently returns auto-approved for all coordinates.
   * TODO: Integrate with LocalDocumentRAG + GIS layer checks
   */
  async validate(request: CoordinateCheckRequest): Promise<CoordinateCheckResponse> {
    // STUB: Currently auto-approves all coordinates.
    // In production, this would:
    //   1. Call localDocumentRAG.queryRestrictions(coordinates, featureType)
    //   2. Check against active project GIS layers (parcel bounds, ROW, utilities, etc.)
    //   3. Return 'requires_confirmation' if warnings found
    //   4. Return 'blocked' if coordinate violates critical constraint
    //   5. Generate voice alert for Glass: "Warning: coordinate intersects 25-ft utility easement"

    return {
      approved: true,
      requiresConfirmation: false,
      message: undefined,
    };
  }

  /**
   * Perform a batch validation on multiple coordinates.
   * Used when drawing complex polylines or boundaries.
   * 
   * @param requests Array of coordinates to validate
   * @returns Array of approval responses (one per coordinate)
   */
  async validateBatch(requests: CoordinateCheckRequest[]): Promise<CoordinateCheckResponse[]> {
    // STUB: Currently approves all
    return requests.map(() => ({
      approved: true,
      requiresConfirmation: false,
    }));
  }

  /**
   * Set project-level constraint configuration (e.g., minimum setback distance).
   * Loaded from .lsvz jobInfo or user settings.
   * 
   * TODO: Store and apply custom constraints
   */
  setProjectConstraints(constraints: Record<string, unknown>): void {
    // STUB: Not yet implemented
  }

  /**
   * Return the current set of active constraints for this project.
   * Used in CAD UI for displaying verification rules.
   */
  getActiveConstraints(): Record<string, unknown> {
    // STUB: Not yet implemented
    return {};
  }

  /**
   * Override verification for a single coordinate (user confirms risk).
   * Records the override in audit trail for compliance.
   * 
   * @param coordinates Feature to override
   * @param reason Surveyor-supplied reason for override
   */
  recordOverride(coordinates: [number, number] | [number, number, number], reason: string): void {
    // STUB: Not yet implemented
    console.log(`[Verification Override] Coordinates: [${coordinates.join(', ')}], Reason: ${reason}`);
  }
}

export const coordinateVerificationGate = new CoordinateVerificationGateService();
