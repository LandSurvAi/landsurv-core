// FUTURE GEMINI: This is the most critical file for defining the application's data structures.
// All major data types used throughout the app are defined here.
// Do not change existing type definitions without a very good reason, as it can break the entire application.

import React, { createContext, useContext } from 'react';
import type { Chat as GeminiChat, Part as GeminiPart } from '@google/genai';
import type { LinearUnit } from './utils/linearUnits';

// Re-exporting Gemini types locally to avoid direct dependencies in other components.
export type Chat = GeminiChat;
export type Part = GeminiPart;

export enum Modality {
  MODALITY_UNSPECIFIED = 'MODALITY_UNSPECIFIED',
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  AUDIO = 'AUDIO'
}


export enum MessageRole {
  USER = 'user',
  MODEL = 'model',
}

// FUTURE GEMINI: This enum is the canonical list of all available AI agents.
// When adding a new agent, you MUST add it here.
export enum AgentType {
  RAW_CRAWLER = 'RAW_CRAWLER',
  VOICE_AGENT = 'VOICE_AGENT',
  CIVIL_DRAFTER = 'CIVIL_DRAFTER',
  DEED_READER = 'DEED_READER',
  CENTERLINE_STATIONING = 'CENTERLINE_STATIONING',
  POINT_EDITOR = 'POINT_EDITOR',
  GPS_STAKEOUT = 'GPS_STAKEOUT',
  FIELD_BOOK = 'FIELD_BOOK',
  LSVZ_AGENT = 'LSVZ_AGENT',
  CIVIL_PLAN_EXPERT = 'CIVIL_PLAN_EXPERT',
  DXF_ANALYZER = 'DXF_ANALYZER',
  FILE_MANAGER = 'FILE_MANAGER',
  TEXT_EDITOR = 'TEXT_EDITOR',
  IMAGE_ANALYZER = 'IMAGE_ANALYZER',
  GIS_AGENT = 'GIS_AGENT',
  CONTOURING_AGENT = 'CONTOURING_AGENT',
  STEEP_SLOPE_AGENT = 'STEEP_SLOPE_AGENT',
  PROFILE_AGENT = 'PROFILE_AGENT',
  COGO_AGENT = 'COGO_AGENT',
  GNSS_AGENT = 'GNSS_AGENT',
  DRONE_AGENT = 'DRONE_AGENT',
  AR_AGENT = 'AR_AGENT',
  ZONING_AGENT = 'ZONING_AGENT',
  TITLE_SEARCH = 'TITLE_SEARCH',
  CAD_MANAGER = 'CAD_MANAGER',
  STANDARDS_COMPLIANCE = 'STANDARDS_COMPLIANCE',
  FLOOD_AGENT = 'FLOOD_AGENT',
  STRUCTURES_AGENT = 'STRUCTURES_AGENT',
  SOILS_AGENT = 'SOILS_AGENT',
}

// FUTURE GEMINI: This type defines the available panels in the main view area.
// NOTE: 'cadmanager' is retained for backward compatibility (LSVZ session files,
// agent activation side-effects) but the user-facing View menu now uses
// 'cadstandards' — both render the same CadManagerPage component, which is now
// framed as the CAD Standards view of the CAD Manager agent.
// 'styleguide' — Drafting Style Library: CAD Manager sub-tool for training the Civil Drafter.
export type VisualPanel = 'canvas' | 'cutsheet' | 'fieldbook' | 'pdfviewer' | 'texteditor' | 'gpsstakeout' | 'filemanager' | 'imageanalyzer' | 'wms' | 'symbolmanager' | 'annotatemanager' | 'profile' | 'closurereport' | 'steepslopereport' | 'layermanager' | 'gnssprocessor' | 'ar' | 'zoning' | 'titlesearch' | 'cadmanager' | 'cadstandards' | 'linetypemanager' | 'legalwriter' | 'sheetview' | 'styleguide' | 'compliance';

// =============================================================================
// Generic Ambiguity / Uncertainty model — usable across PDF parsing, deed
// reading, closure investigations, etc. Replaces the older PDF-only
// "uncertainty" pattern. Each ambiguity describes ONE missing/ambiguous piece
// of data, optionally with a proposed automatic fix the user can accept.
// Surfaced through CACP so any agent can observe (e.g. the activity indicator)
// or contribute resolutions.
// =============================================================================
export type AmbiguitySeverity = 'info' | 'warning' | 'error';
export type AmbiguitySource = 'pdf-parse' | 'deed-parse' | 'closure' | 'cogo' | 'other';

export interface Ambiguity {
    /** Stable unique id. */
    id: string;
    /** Where the ambiguity came from. */
    source: AmbiguitySource;
    /** Short human-readable category, e.g. "missing bearing", "POB not closed". */
    kind: string;
    /** Detailed sentence explaining what's ambiguous and why. */
    reason: string;
    severity: AmbiguitySeverity;
    /** Optional location info — PDF page+box, or boundary row index, etc. */
    location?: {
        fileId?: string;
        fileName?: string;
        pageIndex?: number;
        rowIndex?: number;
        callId?: string;
        boundingBox?: { x1: number; y1: number; x2: number; y2: number };
    };
    /**
     * Optional auto-fix the system computed. If present, the UI may offer an
     * "Apply" button. Shape is up to the consumer (e.g. a patched call array).
     */
    proposedFix?: {
        summary: string;
        payload: unknown;
    };
}

// =============================================================================
// Drafting Style Library — CAD Manager sub-tool for training the Civil Drafter.
// Stores user-uploaded DXF examples with annotations so the Civil Drafter knows
// how to draft each feature type in the user's preferred conventions.
// =============================================================================

/** A single layer extracted from a DXF file for display in the Style Library. */
export interface DraftingStyleLayer {
    name: string;
    entityCount: number;
    entityTypes: string[];      // 'LINE', 'LWPOLYLINE', 'ARC', 'INSERT', 'TEXT', etc.
    lineType?: string;           // First linetype encountered on this layer
    colorIndex?: number;         // ACI color index
}

/** A user annotation pinned to a specific layer or free-floating on the entry. */
export interface DraftingStyleAnnotation {
    id: string;
    text: string;
    layerName?: string;          // Which layer this annotation refers to
    entityType?: string;         // Which entity type ('LINE', 'ARC', etc.)
}

/**
 * One entry in the Drafting Style Library.
 * Each entry represents ONE feature type (e.g. "Roads", "Buildings", "Utilities")
 * with an optional example DXF and user-written description of conventions.
 */
export interface DraftingStyleEntry {
    id: string;
    /** User-assigned name, e.g. "Roads & Pavement", "Building Footprints" */
    name: string;
    /** Broad feature category for the icon / filter chips */
    featureType: 'road' | 'building' | 'utility' | 'boundary' | 'vegetation' | 'water' | 'topo' | 'annotation' | 'misc';
    /**
     * Free-text that the user writes to explain their drafting conventions for
     * this feature type.  This is verbatim-injected into the Civil Drafter's
     * system instructions when a session starts.
     * e.g. "Roads are always drawn with two parallel LWPOLYLINE on layer V-ROAD-EDGE
     * and a centerline on V-ROAD-CL with DASHDOT linetype."
     */
    userDescription: string;
    /** Raw DXF text content of the example file (optional – user may add description only) */
    dxfContent?: string;
    dxfFileName?: string;
    /** Layers extracted from the DXF on upload */
    dxfLayers?: DraftingStyleLayer[];
    /** Specific layer/entity annotations the user has added */
    annotations?: DraftingStyleAnnotation[];
    /** base64 data-URL snapshots uploaded by the user as visual reference */
    referenceImages?: string[];
    createdAt: string;
    updatedAt: string;
}

export interface LegalWriterStylePrefs {
    /** Include the "LEGAL DESCRIPTION — NAME" heading block. */
    includeHeading?: boolean;
    /** Append "SAID TRACT CONTAINING X.XXX acres, more or less." */
    includeAcreage?: boolean;
    /** Include POB northing/easting in the BEGINNING sentence. */
    includePobCoords?: boolean;
    /** Free-text style notes (future: fed to AI rewriter). */
    notes?: string;
    /** User-uploaded example legal descriptions (future: fed to AI rewriter). */
    examples?: string[];
    /** Pre-built preset name shown in the dropdown. */
    preset?: 'default' | 'pa-conventional' | 'tx-conventional' | 'concise';
}

export interface ChatMessageAction {
  type: 'VIEW_UNCERTAINTIES';
  payload: { 
    highlightIds: string[];
  };
}

export interface ChatMessage {
  role: MessageRole;
  text: string;
  thinking?: string;
  result?: string;
  isExpanded?: boolean;
  action?: ChatMessageAction;
  /** Model id that produced this message (e.g. 'claude-fable-5'). Set on model responses. */
  model?: string;
}

export type PointSymbol = 'circle' | 'square' | 'triangle' | 'cross' | 'x';

export interface SurveyPoint {
  pointNumber: string;
  northing: number;
  easting: number;
  elevation?: number;
  description?: string;
  labelOffset?: { x: number, y: number };
  // Per-point override for annotation leader offset (world units). When set, takes
  // precedence over the matched AnnotationRule.leaderOffset. dx < 0 mirrors the
  // note to the left side of the point. Ctrl+drag updates; Shift+click mirrors.
  annotationOffset?: { dx: number, dy: number };
  symbol?: PointSymbol;
  photos?: string[]; // base64 data URLs
  designPointNumber?: string;
  latitude?: number; // Optional geographic coordinates
  longitude?: number; // Optional geographic coordinates
  layer?: string; // CAD layer this point belongs to (from CAD Manager standard)
  hidden?: boolean; // When true, hidden from canvas/exports — toggled by Boundary visibility (drawn + associated points).
}

export interface SurveyLine {
  id?: string;
  from: string;
  to: string;
  color?: string;
  /** Optional polygon fill path (used by steep-slope filled triangles). */
  fillPath?: Array<{ x: number, y: number, z: number }>;
  bearing?: string;
  distance?: string;
  type?: 'breakline' | 'inclusion' | 'exclusion' | 'shrinkwrap-preview' | 'contour-major' | 'contour-minor' | 'parcel' | 'flood' | 'steep-slope' | 'tin-edge';
  fromPt?: { x: number, y: number, z: number };
  toPt?: { x: number, y: number, z: number };
  // Curve parameters (for closure calculations and plotting)
  curveRadius?: number;
  arcLength?: number;
  chordBearing?: string;
  chordDistance?: string | number;
  tangentBearing?: string;
  isCurve?: boolean;
  isCircle?: boolean;
  circleCenter?: { x: number; y: number; z?: number };
  curveDirection?: 'left' | 'right';
  labelOffset?: { x: number; y: number }; // Offset for B&D label in world coordinates
  labelRotation?: number; // Rotation angle for B&D label (0 or 180 degrees)
  layer?: string; // CAD layer name for export
  lineType?: string; // CAD linetype for export (e.g., "CONTINUOUS", "DASHED", "FENCELINE")
  /** Per-entity linetype scale multiplier (AutoCAD CELTSCALE equivalent). 1.0 = no change. */
  lineTypeScale?: number;
  polylineId?: string; // Groups connected line segments into a single polyline for C3D export
  hidden?: boolean; // When true, hidden from canvas/exports
  /** ID of the ContourGeneration that produced this line (survey-generated contours). */
  contourGenId?: string;
  /** Line source — 'esri' for ESRI/State fetched contours, 'survey' for generated contours. */
  source?: 'esri' | 'survey';
}

/**
 * A single iso-contour polyline at a given elevation.
 * Stored as part of a ContourGeneration to preserve the mathematical
 * representation (pre-segment-split) for show/hide and auto-regeneration.
 */
export interface IsoPath {
  elevation: number;
  isMajor: boolean;
  /** Ordered vertices of the polyline (already smoothed). */
  vertices: Array<{ x: number; y: number }>;
}

/**
 * A named, saveable contour generation — the mathematical form of a set of
 * contours derived from a TIN surface.  Unlike raw SurveyLine segments, a
 * ContourGeneration stores the original isoPaths and the settings used so it
 * can be toggled, blended with ESRI/State data, and auto-regenerated whenever
 * source points change.
 */
export interface ContourGeneration {
  id: string;
  name: string;
  createdAt: string;
  lastGeneratedAt: string;
  // Parameters for auto-regeneration
  settings: ContourSettings;
  activeInclusionBoundaryId: string | null;
  pointCount: number;
  /** Points dropped before triangulation because their elevation was missing or
   *  detached from the surveyed surface. */
  excludedPointCount?: number;
  /** Elevation range actually contoured, after exclusions. */
  elevationRange?: { min: number; max: number } | null;
  /** True when blunder-looking elevations were detected but left in place
   *  because dropping them would have discarded too much of the survey. */
  elevationFilterSuppressed?: boolean;
  // Mathematical representation
  isoPaths: IsoPath[];
  labels: ContourLabel[];
  // Display state
  visible: boolean;
  color?: string;
  opacity?: number;
  // Source type (survey generated vs ESRI imported)
  source?: 'survey' | 'esri';
  serviceUrl?: string;
  // ESRI/State blend
  /** When true, ESRI contour lines whose midpoint falls inside the blend inclusion
   *  polygon are suppressed so survey contours are the sole source inside it. */
  esriBlendEnabled?: boolean;
  /** polylineId of the inclusion boundary used as the blend zone. */
  esriBlendInclusionPolylineId?: string | null;
}

/**
 * A named inclusion boundary — a group of `SurveyLine` segments with the same
 * `polylineId` and `type === 'inclusion'`. Managed by the Inclusion Boundaries
 * panel: rename, show/hide (via `SurveyLine.hidden`), set active, delete.
 * Agents that consume inclusion boundaries (Contour, Flood, etc.) read the
 * `activeInclusionBoundaryId` to know which one to use.
 */
export interface InclusionBoundary {
  id: string;
  name: string;
  /** Identifies all SurveyLines belonging to this boundary. */
  polylineId: string;
}

export interface ContourLabel {
  x: number;
  y: number;
  text: string;
  angle: number;
}

/**
 * A street-name text label placed on the plan canvas, aligned to the road bearing.
 * Populated by the Google/OSM street-name lookup feature.
 */
export interface StreetLabel {
  /** World easting (project coordinate system). */
  x: number;
  /** World northing (project coordinate system). */
  y: number;
  /** Full street name, e.g. "Main Street". */
  text: string;
  /** Counter-clockwise rotation in degrees to align label with road bearing. */
  angle: number;
}

/**
 * Identifies one of the built-in annotation category buckets.
 * Extendable: users may add arbitrary string IDs.
 */
export type AnnotationCategoryId =
    | 'boundary'
    | 'callout'
    | 'roads'
    | 'contour-labels'
    | 'property-owners';

/** Per-category rendering style for the canvas annotation system. */
export interface AnnotationCategoryStyle {
    id: AnnotationCategoryId | string;
    /** Display name shown in the Annotation Category panel. */
    label: string;
    /** Font-size multiplier relative to the global annotationScale. */
    scale: number;
    /** CSS color string (hex or named). */
    color: string;
    /** Font family name, e.g. "Arial". */
    fontFamily: string;
    italic: boolean;
    bold: boolean;
    /** Whether this annotation type uses local typography or a shared CAD Manager style. */
    styleSource?: 'local' | 'cad-manager';
    /** Shared CAD Manager style name when styleSource='cad-manager'. */
    cadTextStyleName?: string;
    /** Optional text transform for annotations using this category. */
    textCase?: 'original' | 'uppercase';
    /** Optional line spacing multiplier for multi-line annotations. */
    lineSpacing?: number;
    visible: boolean;
    /** Whether items tagged as 'existing' should automatically render italic. */
    existingItalic: boolean;
    /** Scale multiplier applied to 'existing' items (default 0.25). */
    existingScale: number;
}

export const DEFAULT_ANNOTATION_CATEGORIES: AnnotationCategoryStyle[] = [
    { id: 'boundary',        label: 'Boundary',        scale: 1.0, color: '#22d3ee', fontFamily: 'Arial', italic: false, bold: false,  styleSource: 'local', textCase: 'original', lineSpacing: 1.2, visible: true, existingItalic: true,  existingScale: 0.25 },
    { id: 'callout',         label: 'Callout Labels',  scale: 1.0, color: '#f59e0b', fontFamily: 'Arial', italic: false, bold: false,  styleSource: 'local', textCase: 'original', lineSpacing: 1.2, visible: true, existingItalic: true,  existingScale: 0.25 },
    { id: 'roads',           label: 'Roads',           scale: 1.0, color: '#60a5fa', fontFamily: 'Arial', italic: false, bold: true,   styleSource: 'local', textCase: 'original', lineSpacing: 1.2, visible: true, existingItalic: true,  existingScale: 0.25 },
    { id: 'contour-labels',  label: 'Contour Labels',  scale: 1.0, color: '#a78bfa', fontFamily: 'Arial', italic: false, bold: false,  styleSource: 'local', textCase: 'original', lineSpacing: 1.2, visible: true, existingItalic: false, existingScale: 1.0  },
    { id: 'property-owners', label: 'Property Owners', scale: 0.8, color: '#86efac', fontFamily: 'Arial', italic: true,  bold: false,  styleSource: 'local', textCase: 'uppercase', lineSpacing: 1.2, visible: true, existingItalic: true,  existingScale: 0.25 },
];

export interface ParcelLabelFormatter {
  includeParcelId: boolean;
  includeOwner: boolean;
  prependOwnerPrefix: boolean;
  ownerPrefix: string;
  includeDeedBookPage: boolean;
  includeBlockUnit: boolean;
  /** Whether typography is driven locally or inherited from CAD Manager styles. */
  styleSource?: 'local' | 'cad-manager';
  /** Named style preset for quick professional text setup. */
  stylePreset?: 'narrow-cad' | 'classic-cad' | 'plan-readable' | 'field-compact';
  /** CAD Manager style name when styleSource='cad-manager'. */
  cadTextStyleName?: string;
  /** Preferred font for lot-owner parcel labels (canvas + DXF MTEXT). */
  fontFamily?: string;
  /** Explicit bold override for lot-owner labels. */
  fontBold?: boolean;
  /** Explicit italic override for lot-owner labels. */
  fontItalic?: boolean;
  /** Text transform for parcel label lines. */
  textCase?: 'original' | 'uppercase';
  /** Line spacing multiplier used by canvas and DXF MTEXT. */
  lineSpacing?: number;
}

export const DEFAULT_PARCEL_LABEL_FORMATTER: ParcelLabelFormatter = {
  includeParcelId: true,
  includeOwner: true,
  prependOwnerPrefix: true,
  ownerPrefix: 'N/F',
  includeDeedBookPage: true,
  includeBlockUnit: true,
  styleSource: 'local',
  stylePreset: 'narrow-cad',
  cadTextStyleName: 'Parcel Owner - Narrow CAD',
  fontFamily: 'Arial Narrow',
  fontBold: false,
  fontItalic: true,
  textCase: 'uppercase',
  lineSpacing: 1.2,
};

export interface ParcelCadTextStyle {
  name: string;
  fontFamily: string;
  fontBold?: boolean;
  fontItalic?: boolean;
  textCase?: 'original' | 'uppercase';
  lineSpacing?: number;
}

export interface ParcelLabelTextData {
  /** Assessor parcel ID / PIN. */
  parcelId: string | null;
  /** Owner of record as returned by the county GIS service. */
  owner: string | null;
  /** Deed book number, if available. */
  deedBook?: string | null;
  /** Deed page number, if available. */
  deedPage?: string | null;
  /** Block number, if available. */
  block?: string | null;
  /** Unit number, if available. */
  unit?: string | null;
  /** Deed reference (book/page and/or block/unit) from county GIS attributes. */
  deedRef?: string | null;
}

/**
 * A county/GIS parcel centroid label placed on the canvas.
 * Rendered as styled annotation text rather than a survey point.
 */
export interface ParcelLabel extends ParcelLabelTextData {
    id: string;
    /** World easting (project coordinate system). */
    x: number;
    /** World northing (project coordinate system). */
    y: number;
    /** Counter-clockwise rotation in degrees (usually 0). */
    angle: number;
}

export interface CutSheetRow {
    pointNumber: string;
    description: string;
    designElevation: number;
    fieldElevation: number;
    cutFill: number;
}

export interface CutSheetInfo {
    projectName: string;
    projectNumber: string;
    date: string;
    companyName: string;
    crewChief: string;
}

export interface DeedMetadata {
    owners?: string[];       // Owner names (Grantor to Grantee)
    deedBook?: string;        // Deed book number
    deedPage?: string;        // Deed page number
    parcelId?: string;        // Parcel ID / Tax ID
}

/**
 * Lightweight per-tract summary produced by the cheap "summarize-only" deed
 * pass. Does NOT contain bearings, distances, points, or lines — only enough
 * metadata for the user to recognize the tract and decide whether to spend
 * a full parse on it.
 */
export interface DeedTractSummary {
    tractId: string;            // e.g. "Tract 1", "FIRST PARCEL", "Parcel A"
    tractName?: string;         // optional descriptive name
    sourcePage?: number;        // page in the source PDF where this tract begins
    snippet?: string;           // first ~200 chars of the description (for UI preview)
    grantor?: string;
    grantee?: string;
    parcelId?: string;
    acreage?: string;           // as written in the deed (e.g. "1.234 acres")
}

/**
 * Document-level summary produced by `summarizeDeed()` immediately after a
 * deed PDF is uploaded. Lets the UI list the detected tracts before any
 * heavy geometry parse runs. Per-tract parsing is then triggered on demand.
 */
export interface DeedSummary {
    fileName: string;
    owner?: string;             // grantee (current owner) — document-level
    grantor?: string;           // document-level grantor
    parcelId?: string;
    book?: string;
    page?: string;
    tracts: DeedTractSummary[];
}

export type DeedBatchJobStatus = 'created' | 'running' | 'completed' | 'failed' | 'cancelled';

export type DeedBatchFileStatus =
    | 'queued'
    | 'extracting'
    | 'summarizing'
    | 'summarized'
    | 'parsed'
    | 'matched'
    | 'aligned'
    | 'review-required'
    | 'completed'
    | 'failed';

export interface DeedBatchFileRecord {
    id: string;
    sourceIndex: number;
    fileName: string;
    selectedPages?: number[];
    status: DeedBatchFileStatus;
    updatedAt: string;
    error?: string;
    summary?: DeedSummary;
    topMatch?: ParcelMatchResult;
    alignmentDecision?: AlignmentDecision;
    /** Snapshot of the boundary transform BEFORE coarse alignment was applied.
     *  Populated by handleBatchCoarseAlign so the operator can roll back. */
    preAlignSnapshot?: { translationE?: number; translationN?: number; rotationDeg?: number };
}

export interface DeedBatchJob {
    id: string;
    label: string;
    createdAt: string;
    updatedAt: string;
    status: DeedBatchJobStatus;
    files: DeedBatchFileRecord[];
    totalFiles: number;
    processedFiles: number;
    failedFiles: number;
}

export interface ParcelMatchCandidate {
    parcelId?: string | null;
    ownerName?: string | null;
    deedBook?: string | null;
    deedPage?: string | null;
    block?: string | null;
    unit?: string | null;
}

export interface ParcelMatchInput {
    parcelId?: string | null;
    ownerName?: string | null;
    deedBook?: string | null;
    deedPage?: string | null;
    block?: string | null;
    unit?: string | null;
}

export interface ParcelMatchScoreBreakdown {
    parcelId: number;
    ownerName: number;
    deedRef: number;
    blockUnit: number;
    penalties: number;
    total: number;
}

export interface ParcelMatchResult {
    candidate: ParcelMatchCandidate;
    score: number;
    confidence: 'high' | 'medium' | 'low';
    breakdown: ParcelMatchScoreBreakdown;
    explanation: string[];
}

export interface AlignmentDecision {
    action: 'auto-align' | 'prompt' | 'manual-review';
    confidence: 'high' | 'medium' | 'low';
    reason: string;
}

// Title Search Types
export interface TitleDeed {
    id: string;
    grantor: string;          // Seller/previous owner
    grantee: string;          // Buyer/new owner
    recordingDate: string;    // Date deed was recorded
    deedBook?: string;
    deedPage?: string;
    considerationAmount?: string; // Sale price if available
    legalDescription?: string;
    parcelId?: string;
    fileData?: string;        // base64 of deed document
    rasterImageData?: string[]; // base64 for PDF pages
}

export interface TitleLien {
    id: string;
    type: 'mortgage' | 'tax-lien' | 'judgment' | 'mechanic-lien' | 'easement' | 'other';
    holder: string;           // Who holds the lien
    amount?: string;
    recordingDate: string;
    releaseDate?: string;     // If lien has been released
    description: string;
    status: 'active' | 'released' | 'satisfied';
}

export interface ChainOfTitleEntry {
    deedId: string;
    order: number;            // Position in chain (1 = earliest, higher = more recent)
    isCurrentOwner: boolean;
}

export interface TitleSearchData {
    propertyAddress?: string;
    parcelId?: string;
    deeds: TitleDeed[];
    liens: TitleLien[];
    chainOfTitle: ChainOfTitleEntry[];
    titleStatus: 'clear' | 'issues' | 'pending-review';
    issues?: string[];        // List of identified issues
}

  export type ComplianceSourceMode = 'ask-each-run' | 'cad-manager' | 'control-pdf' | 'combined';

  export type StandardsComplianceCheckId =
    | 'title_block'
    | 'north_arrow'
    | 'annotation_completeness'
    | 'required_layers'
    | 'linetype_compliance'
    | 'scale_and_sheet_metadata'
    | 'legend_symbol_consistency'
    | 'revision_block'
    | 'zoning_table_and_dimensional_compliance'
    | 'site_location_map'
    | 'impervious_coverage_chart';

  export type StandardsComplianceCheckSelection = Record<StandardsComplianceCheckId, boolean>;

  export interface StandardsComplianceEvidence {
    fileName: string;
    /** 1-based PDF page number. */
    pageNumber: number;
    textSnippet?: string;
    contextBefore?: string;
    contextAfter?: string;
    /** Gemini/PDF image coordinates: [ymin, xmin, ymax, xmax], 0-1000. */
    box2dNorm?: [number, number, number, number];
    description?: string;
  }

  export type StandardsComplianceCheckStatus = 'passed' | 'issue' | 'not-assessable';

  export interface StandardsComplianceCheckResult {
    checkId: StandardsComplianceCheckId;
    status: StandardsComplianceCheckStatus;
    conclusion: string;
    evidence?: StandardsComplianceEvidence[];
    source?: 'control-pdf' | 'cad-manager' | 'combined' | 'subject-pdf' | 'visual-review';
  }

  export interface StandardsComplianceIssue {
    checkId: StandardsComplianceCheckId;
    severity: 'info' | 'warning' | 'error';
    title: string;
    detail: string;
    evidence?: string;
    recommendation?: string;
    spatialEvidence?: StandardsComplianceEvidence[];
  }

  export interface StandardsComplianceReport {
    reportId: string;
    createdAt: string;
    sourceMode: ComplianceSourceMode;
    checksRequested: StandardsComplianceCheckSelection;
    /** @deprecated use controlFileNames — kept for backward compatibility with older saved reports. */
    controlFileName?: string;
    /** Names of all reference/control PDFs used as the standard for this run. */
    controlFileNames?: string[];
    subjectFileName: string;
    passed: boolean;
    summary: string;
    issues: StandardsComplianceIssue[];
    /** Optional for backward compatibility with reports created before per-check results existed. */
    checkResults?: StandardsComplianceCheckResult[];
    metadata: {
      standardsSource: 'cad-manager' | 'control-pdf' | 'combined' | 'none';
      cadCodeCount?: number;
      cadLayerCount?: number;
      /** Whether the report was produced by an actual multimodal image review of the PDF pages, or by text-pattern heuristics (fallback when no page images / API key are available). */
      analysisMethod?: 'visual-ai' | 'text-heuristic';
      selectedPages?: number[];
      /** @deprecated use controlPageInfo — kept for backward compatibility with older saved reports. */
      controlSelectedPages?: number[];
      /** Per-reference-document selected pages, for reports built from multiple control PDFs. */
      controlPageInfo?: Array<{ fileName: string; selectedPages?: number[] }>;
      /** Real PDF Optional Content Group (layer) names detected on the subject PDF, if any. */
      subjectPdfLayerCount?: number;
      /** Distinct stroke dash patterns detected on the subject PDF pages, if any. */
      subjectPdfDashPatterns?: string[];
    };
  }

export interface SessionFile {
    name: string;
    content: string;
    fileData?: string; // base64
    rasterImageData?: string[]; // base64 for PDF pages
    selectedPages?: number[]; // which pages were selected for processing
    tags?: string[];
    forTraining?: boolean; // Mark DXF files as training templates for Civil Drafter agent
    deedMetadata?: DeedMetadata; // Extracted deed information (for DEED_READER agent)
    deedMetadataOffset?: { x: number; y: number }; // Offset for deed metadata box in world coordinates
    ownerNameOffset?: { x: number; y: number }; // Offset for owner name label in world coordinates
    /** Real PDF Optional Content Group (layer) names, when present — from utils/pdfUtils.extractPdfStructuralInfo. */
    pdfLayerNames?: string[];
    /** Distinct stroke dash patterns actually drawn on the selected pages — the closest browser-readable proxy for CAD linetypes. */
    pdfDashPatterns?: ('solid' | 'dashed' | 'dotted' | 'dash-dot')[];
}

export interface CenterlinePI {
    id: string;
    pointNumber: string;
    northing: number;
    easting: number;
    curveRadius?: number;
}

export interface Centerline {
    id: string;
    name: string;
    beginStation: number;
    pis: CenterlinePI[];
}

export interface JobInfo {
    jobName: string;
    jobNo: string;
    /** Optional project metadata — populated via the Job Info dialog on the home screen.
     *  All fields are optional for backward compatibility with older `.lsvz` files.
     *  Available to any agent that needs project context. */
    clientName?: string;
    clientAddress?: string;
    clientEmail?: string;
    clientPhone?: string;
    siteAddress?: string;
    siteMunicipality?: string;
    jobScope?: string;
    zoningDistrict?: string;
    desiredUse?: string;
    topo?: boolean;
    stakeout?: boolean;
}

/** SSURGO soil map unit — returned by the Soils Agent (USDA NRCS SSURGO). */
export interface SoilMapUnit {
    mukey: string;
    musym: string;
    muname: string;
    farmlndcl?: string;
    hydgrpdcd?: string;
    drclassdcd?: string;
    taxorder?: string;
    slope_r?: number;
    acres?: number;
}

export interface PointLabelingSettings {
    style: 'numeric' | 'alphabetic';
    prefix: string;
    nextNumber: number;
}

export interface ProjectionSetting {
    state: string | null;
    zoneName: string | null;
    epsg: number | null;
}

export interface NtripSettings {
    enabled: boolean;
    host: string;
    port: number;
    mountpoint: string;
    username: string;
    password?: string;
}

export interface NotionIntegration {
    enabled: boolean;
    accessToken?: string;
    workspaceId?: string;
    workspaceName?: string;
    databaseId?: string; // Optional: specific database to sync with
    lastSync?: string; // ISO date string
}

export interface Settings {
    theme: 'dark' | 'light';
    coordinatePrecision: number;
  linearUnits: LinearUnit;
    zoomToPointLevel: number;
    projection: ProjectionSetting;
    defaultCutSheetInfo: {
        companyName: string;
        crewChief: string;
    };
    ntrip: NtripSettings;
    donationRequestTimer: number;
    northArrowStyle: 'classic' | 'modern' | 'elegant';
    northArrowPosition: 'left' | 'right';
    pointLabelingSettings: PointLabelingSettings;
    uncertaintySensitivity: 'low' | 'medium' | 'high' | 'strict';
  userApiKey?: string;
    /** BYOK: OpenAI API key (sk-…). Stored in localStorage only; used browser-direct. */
    openaiApiKey?: string;
    /** BYOK: xAI API key (xai-…). Stored in localStorage only; used browser-direct. */
    xaiApiKey?: string;
    /** BYOK: Anthropic API key (sk-ant-…). Stored in localStorage only; used browser-direct. */
    anthropicApiKey?: string;
    pointAttributeScaling: 'screen' | 'world'; // Controls if point labels scale with zoom or stay fixed size
    /** When true, point descriptions may render matching custom/CAD/built-in symbols. Default: false. */
    showPointSymbols?: boolean;
    /** When true, show ephemeral pill notifications for CACP inter-agent traffic. Default: false. */
    showCacpNotifications?: boolean;
    /** When true, include internal CACP handler dispatch phases in activity notifications. */
    showCacpHandlerNotifications?: boolean;
    notion?: NotionIntegration;
    floodHatch?: {
        /** Hatch pattern drawn inside FEMA flood-zone polygons. */
        style: 'lines' | 'cross' | 'dots' | 'chevron' | 'none';
        /** Spacing between hatch lines in survey feet (world units). 20 = tight, 100 = loose. */
        scale: number;
        /** Fill opacity 0–1. */
        opacity: number;
    };
      /**
       * When enabled, show a debug preflight message before each model run with
       * estimated input token count and estimated input-side cost.
       */
      debugPreflightEstimate?: boolean;
      /**
       * When enabled, show the Civil Drafter Gimbal Vision HUD during scans.
       * Debug only — the vision pass still runs either way; this only controls
       * whether the HUD overlay is visible.
       */
      debugGimbalHud?: boolean;
}

export interface SessionSaveOptions {
    fileName?: string;
    author?: string;
    note?: string;
    includeTimestampInName?: boolean;
    includeJobNumberInName?: boolean;
    includeActiveAgentInName?: boolean;
    includeAuthorInName?: boolean;
    jobNumber?: string;
    activeAgent?: AgentType;
    savedAt?: string;
}

export interface SessionMetadata {
    author?: string;
    note?: string;
    exportFileName?: string;
    exportedByAgent?: AgentType;
    includeTimestampInName?: boolean;
    includeJobNumberInName?: boolean;
    includeActiveAgentInName?: boolean;
    includeAuthorInName?: boolean;
    /** Map imagery overlay settings (NAIP + Google Static Maps). API key is optional — AutoDraft falls back to the AI key or the backend proxy. */
    googleMaps?: {
        enabled?: boolean;
        apiKey?: string;
      mapType?: 'roadmap' | 'satellite' | 'hybrid' | 'terrain' | 'naip';
        opacity?: number;
        scale?: 1 | 2;
        showLabels?: boolean;
        language?: string;
        region?: string;
        styleJson?: string;
    };
}

export interface PdfHighlight {
    id: string;
    fileIndex: number;
    pageIndex: number;
    reason: string;
    /**
     * Preferred anchor: verbatim text excerpt from the page. The renderer locates
     * this snippet in the PDF text layer and builds glyph-accurate highlight rects.
     * Optional context strings disambiguate when the snippet appears multiple times.
     */
    textSnippet?: string;
    contextBefore?: string;
    contextAfter?: string;
    /**
     * Fallback anchor: Gemini-native normalized 2D bounding box in 0–1000 image
     * space (origin top-left), order [ymin, xmin, ymax, xmax]. Used only when
     * textSnippet cannot be located (e.g. raster-only scans, smudged regions).
     */
    box2dNorm?: [number, number, number, number];
    /** Legacy free-form PDF-space bbox; kept for back-compat but no longer trusted. */
    boundingBox?: { x1: number, y1: number, x2: number, y2: number };
    pageWidth: number;
    pageHeight: number;
    color: string;
    borderColor: string;
}

export interface PointList {
    id: string;
    name: string;
    points: SurveyPoint[];
    isVisible: boolean;
    /** When false, this list is excluded from the agent context injected on every message. Default: true. */
    includeInContext?: boolean;
}

export interface WmsLayerInfo {
    name: string;
    title: string;
    abstract: string;
    supportedCrs: string[];
    bbox: [number, number, number, number];
}

export interface WmsService {
    url: string;
    title: string;
    version: string;
    layers: WmsLayerInfo[];
}

export interface ActiveWmsLayer {
    serviceUrl: string;
    layerName: string;
    isVisible: boolean;
    opacity: number;
}

export interface OfflineMapArea {
    id: string;
    name: string;
    bbox: [number, number, number, number];
    width: number;
    height: number;
    layers: {
        serviceUrl: string;
        layerName: string;
        opacity: number;
        imageData: string;
    }[];
    isVisible: boolean;
}

export interface DxfExportOptions {
    fileName: string;
    includePoints: boolean;
    includeLines: boolean;
    includeCenterlines: boolean;
    pointScale: number;
  steepSlopeFillStyle?: 'solid' | 'hatch' | 'native-hatch';
}

export interface CustomSymbol {
    id: string;
    name: string;
    description: string;
    associatedTerms: string[];
    svgPath: string;
    fillPath?: string;
    viewBox: string;
    scale: number;
    isDefault?: boolean;
    /** When true, this symbol is suppressed on the canvas (points still render with default plotting). */
    hidden?: boolean;
}

/**
 * AnnotationRule — applies a leader line + note to points whose description matches.
 * Works like CustomSymbol: matching via associatedTerms (wildcards supported),
 * per-rule scale override, global multiplier via annotationScale.
 *
 * `template` may contain placeholders that are substituted from the matched point:
 *   {pointNumber} {description} {elevation} {northing} {easting} {layer}
 * Use \n (literal) in the template to split lines in the note.
 */
export interface AnnotationRule {
    id: string;
    name: string;
    /** Optional human description shown in the manager UI. */
    description?: string;
    /** Match terms (wildcards: * matches any non-whitespace run). Same engine as CustomSymbol. */
    associatedTerms: string[];
    /** Note text with {placeholder} tokens. */
    template: string;
    /** 'existing' (E-) or 'proposed' (P-) standard. */
    category: 'existing' | 'proposed';
    /** Per-rule scale multiplier (combined with global annotationScale). */
    scale: number;
    /** Leader bend offset from point in world units (positive dx = right, dy = up). */
    leaderOffset: { dx: number; dy: number };
    /** Optional color override (defaults to magenta/existing or cyan/proposed). */
    color?: string;
    /** If true, this rule applies when no other rule matches. */
    isDefault?: boolean;
}

export interface EsriServiceInfo {
    name: string;
    url: string;
    region: string;
    description?: string;
    dataType?: string;
    resolution?: string;
}
export interface ContourSettings {
    contourInterval: number;
    majorInterval: number;
    smoothing: number;
    pointFilterDescription: string;
    showLabels: boolean;
    labelDensity: number;
    labelScale: number;
  /** Contour source mode. Defaults to survey points when omitted. */
  sourceType?: 'points' | 'tin';
  /** Optional TIN surface id when contours should be extracted from a loaded TIN. */
  sourceTinId?: string | null;
    /** User-pinned ESRI REST service URLs for contour/elevation data. */
    esriServiceUrls?: string[];
    /** Point numbers explicitly excluded from triangulation (e.g. invert shots, control points). */
    ignoredPointNumbers?: string[];
    /** How unusable elevations are handled before triangulation. Defaults to 'auto',
     *  which drops missing/NaN elevations plus blunders detached from the surface. */
    elevationFilterMode?: 'auto' | 'off';
    /** Hard elevation bounds applied before triangulation. Null/undefined means unbounded. */
    minElevation?: number | null;
    maxElevation?: number | null;
}

export interface ProfilePoint {
    station: number;
    elevation: number;
}

export interface ProfileInfo {
    name: string;
    type: 'line' | 'centerline';
}

export interface BoundaryFileCall {
  id: string;
  from: string;        // CACP point number
  to: string;          // CACP point number
  bearing: string;
  distance: string;
  isCurve?: boolean;
  curveRadius?: number;
  arcLength?: number;
  chordBearing?: string;
  chordDistance?: number;
  tangentBearing?: string;
  curveDirection?: 'left' | 'right';
  labelRotation?: number;  // 0 or 180 – flipped by Alt+click
  /** Description of the corner monument at the `to` vertex of this call
   *  (e.g. "iron rod found", "stone at fence corner"). Captured from the
   *  DEED_READER `points[]` response so Draft can stamp meaningful
   *  descriptions onto generated SurveyPoints instead of regurgitating
   *  bearing/distance strings. */
  toDescription?: string;
}

export interface BoundaryFile {
  id: string;
  name: string;
  createdAt: string;
  calls: BoundaryFileCall[];
  hidden?: boolean;
  /** IDs of survey points generated by "Draw to linework" so a re-draw can clean them up. */
  drawnPointIds?: string[];
  /** IDs of survey lines generated by "Draw to linework" so a re-draw can clean them up. */
  drawnLineIds?: string[];
  /** User-associated point numbers that should follow this boundary's visibility (hide when boundary is hidden). Bundled into the .lsvz BoundaryFile so the association round-trips. */
  associatedPointIds?: string[];
  /** Optional explicit point-of-beginning override (E, N) when no point-with-coordinates anchors the chain. */
  pobOverride?: { easting: number; northing: number };
  /** Easting translation (delta-X) applied to the entire boundary preview and any drawn linework. */
  translationE?: number;
  /** Northing translation (delta-Y) applied to the entire boundary preview and any drawn linework. */
  translationN?: number;
  /** Rotation in degrees (positive = counter-clockwise) applied around the rotation anchor (POB by default). */
  rotationDeg?: number;
  /** Snapshot of translationE/N/rotationDeg captured at the moment Draft last
   *  committed geometry into pointMap. Lets the amber overlay apply only the
   *  DELTA between current and baked values, so editing the transform after a
   *  draft moves amber by exactly that delta instead of doubling it. */
  bakedTransform?: { translationE: number; translationN: number; rotationDeg: number };
  /** County / assessor parcel ID (PIN) associated with this boundary, if sourced from GIS. */
  parcelId?: string;
  /** Owner of record as returned by the county GIS service. */
  ownerName?: string;
  /** Free-form lot or parcel description (e.g. "Lot 12, Block A"). */
  lotDescription?: string;
  /** When this BoundaryFile was produced by a per-tract DEED_READER parse, the
   * tractId from the matching DeedSummary.tracts[] entry. Used by the
   * DeedSummaryPanel to mark pending summary rows as computed. */
  sourceTractId?: string;
  /** When this BoundaryFile was produced during a batch deed job, the
   * DeedBatchFileRecord.id it belongs to. Enables the review panel to find
   * boundary files for a given batch file and drive coarse alignment. */
  batchFileId?: string;
  /** AI self-rated confidence in the parsed deed (legibility, ambiguity, math).
   *  Drives the green/yellow/red pill in the BoundaryEditor header during the
   *  amber pre-commit state. `source` records whether the level came directly
   *  from the model or was derived client-side from the uncertainty count. */
  deedConfidence?: DeedConfidence;
}

export interface DeedConfidence {
    level: 'high' | 'medium' | 'low';
    reasons: string[];
    source: 'ai' | 'derived';
}

/**
 * TinSurface (v26.05.17.15) — Triangulated Irregular Network derived from contour
 * source points. Acts like BoundaryFile: a first-class graphical + mathematical
 * object that is persisted with the session and toggleable in the Data
 * Visibility panel. Stored as a flat vertex array + triangle index triples for
 * compact serialization.
 */
export interface TinVertex {
  easting: number;
  northing: number;
  elevation: number;
}

export interface TinSurface {
  id: string;
  name: string;
  createdAt: string;
  vertices: TinVertex[];
  /** Each triangle is a triple of vertex indices into `vertices`. */
  triangles: [number, number, number][];
  hidden?: boolean;
  /** Source point IDs used to build the TIN, for traceability. */
  sourcePointIds?: string[];
  /** RGB hex color for wireframe rendering (e.g. "#06b6d4"). */
  color?: string;
}

export interface SteepSlopeBand {
  id: string;
  minPercent: number;
  maxPercent: number;
  color: string;
  layerName: string;
}

export interface SteepSlopeRunSettings {
  sourceTinId?: string;
  /** Minimum continuous plan-length (linear feet) required to keep a slope component. */
  minComponentLinearSpan?: number;
  /** Legacy alias retained for backward compatibility with older sessions. */
  minComponentVerticalSpan: number;
  bands: SteepSlopeBand[];
  includeBoundaryId?: string | null;
}

export interface SteepSlopeTriangleSummary {
  triangleIndex: number;
  slopePercent: number;
  componentId: string;
  bandId: string;
}

export interface SteepSlopeComponentSummary {
  id: string;
  triangleCount: number;
  minElevation: number;
  maxElevation: number;
  /** Elevation span retained for informational reporting. */
  verticalSpan: number;
  /** Continuous plan-length span used by municipal filtering logic. */
  linearSpan?: number;
  kept: boolean;
}

export interface SteepSlopeRunResult {
  id: string;
  name: string;
  createdAt: string;
  settings: SteepSlopeRunSettings;
  sourceTinId?: string;
  analyzedTriangleCount: number;
  keptTriangleCount: number;
  removedTriangleCount: number;
  components: SteepSlopeComponentSummary[];
  triangles: SteepSlopeTriangleSummary[];
}

export type AnnotationDimensionType =
    | 'aligned'
    | 'horizontal'
    | 'vertical'
    | 'radius'
    | 'diameter'
    | 'arc-length'
    | 'curve-data'
    | 'angular'
    | 'ordinate';

export interface BaseAnnotationDimension {
    id: string;
    textOverride?: string;
    color?: string;
    arrowStyle?: 'closed' | 'open' | 'tick' | 'dot';
    textPlacement?: 'above' | 'centered';
    precision?: number;
    scale?: number;
    textHeight?: number;
    arrowSize?: number;
    scalingMode?: 'world' | 'screen';
}

export type DimensionGripType = 'p1' | 'p2' | 'offset' | 'text' | 'center' | 'vertex';

export interface DimensionGrip {
    id: string;
    dimId: string;
    type: DimensionGripType;
    x: number;
    y: number;
    dim: AnnotationDimension;
}

export interface AlignedAnnotationDimension extends BaseAnnotationDimension {
    type: 'aligned';
    /** First pick point, in world (easting/northing) coordinates */
    p1: { easting: number; northing: number };
    /** Second pick point, in world (easting/northing) coordinates */
    p2: { easting: number; northing: number };
    /** Perpendicular offset from the P1-P2 line (positive = left of P1→P2 direction) in world units */
    offsetDist: number;
}

export interface HorizontalAnnotationDimension extends BaseAnnotationDimension {
    type: 'horizontal';
    p1: { easting: number; northing: number };
    p2: { easting: number; northing: number };
    /** Y (northing) offset from p1 in world units */
    offsetDist: number;
}

export interface VerticalAnnotationDimension extends BaseAnnotationDimension {
    type: 'vertical';
    p1: { easting: number; northing: number };
    p2: { easting: number; northing: number };
    /** X (easting) offset from p1 in world units */
    offsetDist: number;
}

export interface RadiusAnnotationDimension extends BaseAnnotationDimension {
    type: 'radius';
    center: { easting: number; northing: number };
    radius: number;
    pickPoint?: { easting: number; northing: number };
    textPosition: { easting: number; northing: number };
}

export interface DiameterAnnotationDimension extends BaseAnnotationDimension {
    type: 'diameter';
    center: { easting: number; northing: number };
    radius: number;
    pickPoint?: { easting: number; northing: number };
    textPosition: { easting: number; northing: number };
}

export interface ArcLengthAnnotationDimension extends BaseAnnotationDimension {
    type: 'arc-length';
    center: { easting: number; northing: number };
    radius: number;
    p1: { easting: number; northing: number };
    p2: { easting: number; northing: number };
    arcLength: number;
    offsetDist: number;
    isLeftCurve?: boolean;
}

export interface CurveDataAnnotationDimension extends BaseAnnotationDimension {
    type: 'curve-data';
    center: { easting: number; northing: number };
    radius: number;
    arcLength: number;
    deltaRad?: number;
    chordBearing?: string;
    chordLength?: number;
    tangentBearing?: string;
    curveDirection?: 'left' | 'right';
    p1: { easting: number; northing: number };
    p2: { easting: number; northing: number };
    textPosition: { easting: number; northing: number };
}

export interface AngularAnnotationDimension extends BaseAnnotationDimension {
    type: 'angular';
    vertex: { easting: number; northing: number };
    p1: { easting: number; northing: number };
    p2: { easting: number; northing: number };
    arcRadius: number;
}

export interface OrdinateAnnotationDimension extends BaseAnnotationDimension {
    type: 'ordinate';
    point: { easting: number; northing: number };
    leaderEnd: { easting: number; northing: number };
}

export type AnnotationDimension =
    | AlignedAnnotationDimension
    | HorizontalAnnotationDimension
    | VerticalAnnotationDimension
    | RadiusAnnotationDimension
    | DiameterAnnotationDimension
    | ArcLengthAnnotationDimension
    | CurveDataAnnotationDimension
    | AngularAnnotationDimension
    | OrdinateAnnotationDimension;

export interface ClosureReport {
  id: string;
  name: string;
  createdAt: string;
  points: {
    pointNumber: string;
    northing: number;
    easting: number;
  }[];
  lines: {
    from: string;
    to: string;
    bearing: string;
    distance: string;
    isCurve?: boolean;
    curveRadius?: number;
    arcLength?: number;
    deltaAngle?: number;
    tangentRadIn?: string;
    tangentRadOut?: string;
  }[];
  totalDistance: number;
  misclosureNorthing: number;
  misclosureEasting: number;
  misclosureDistance: number;
  misclosureBearing: string;
  precision: string;
  area: number;
}

export interface GisFeature {
    id: string;
    type: 'Point' | 'LineString' | 'Polygon' | 'MultiPoint' | 'MultiLineString' | 'MultiPolygon' | 'GeometryCollection';
    geometry: any;
    properties: Record<string, any>;
    displayPointIds?: string[]; // IDs of generated survey points
    displayLineIds?: string[]; // IDs of generated survey lines
}

export interface SessionState {
    version: string;
    savedAt: string;
    sessionMetadata?: SessionMetadata;
    settings: Settings;
    rawFile: SessionFile | null;
    deedFile: SessionFile | null;
    planFiles: SessionFile[] | null;
    dxfFile: SessionFile | null;
    clFile: SessionFile | null;
    imageFiles: SessionFile[] | null;
    gisFile: SessionFile | null;
    generatedFiles: SessionFile[];
    pdfViewerFiles: SessionFile[] | null;
    pdfHighlights: PdfHighlight[];
    customSymbols: CustomSymbol[];
    customAnnotations?: AnnotationRule[];
    annotationScale?: number;
    closureReports?: ClosureReport[];
    boundaryFiles?: BoundaryFile[];
    deedBatchJob?: DeedBatchJob | null;
    dimensions?: AnnotationDimension[];
    tinSurfaces?: TinSurface[];
    /** Saved contour generation objects (v26.05.19.3). Each ContourGeneration
     *  stores its own IsoPaths (mathematical representation), display settings,
     *  and ESRI-blend state. Multiple generations can coexist on the canvas. */
    contourGenerations?: ContourGeneration[];
    /** Saved steep-slope analysis runs keyed to TIN surfaces. */
    steepSlopeRuns?: SteepSlopeRunResult[];
    /** Street-name labels placed on the plan (v26.05.19.4). Each label is a
     *  rotated text annotation aligned to the nearest road bearing, derived
     *  from OpenStreetMap road geometry within the inclusion boundary. */
    streetLabels?: StreetLabel[];
    /** GIS parcel centroid labels (v26.05.19.15). Rendered as styled annotation
     *  text with "N/F [OWNER]" surveying notation rather than survey points. */
    parcelLabels?: ParcelLabel[];
    /** Per-category annotation rendering styles (v26.05.19.15). */
    annotationCategories?: AnnotationCategoryStyle[];
    /** Named inclusion-polyline groups (v26.05.17.39). Each entry binds a
     *  user-facing name to a unique `polylineId` carried by every SurveyLine
     *  in that boundary, so the manager can rename / show-hide / re-activate
     *  it across save/load. */
    inclusionBoundaries?: InclusionBoundary[];
    /** Id of the currently-active inclusion boundary (the one Contour, Flood
     *  and other agents default to when narrowing inclusion lines). */
    activeInclusionBoundaryId?: string | null;

    /** FEMA FIRMETTE image cached for the current flood query area (v26.05.19.1). */
    floodFirmette?: {
        /** FEMA NFHL MapServer export URL used to fetch the image. */
        url: string;
        /** WGS84 bbox string "minX,minY,maxX,maxY" that was queried. */
        bbox: string;
        /** ISO 8601 timestamp when the firmette was fetched. */
        fetchedAt: string;
        /** Base64-encoded PNG data URL for offline use (may be large). */
        imageDataUrl?: string;
    } | null;

    jobInfo: JobInfo;
    
    rawChatHistory: ChatMessage[];
    deedChatHistory: ChatMessage[];
    civilDrafterChatHistory: ChatMessage[];
    dxfChatHistory: ChatMessage[];
    stationingChatHistory: ChatMessage[];
    pointEditorChatHistory: ChatMessage[];
    fieldbookChatHistory: ChatMessage[];
    gpsStakeoutChatHistory: ChatMessage[];
    lsvzChatHistory: ChatMessage[];
    planExpertChatHistory: ChatMessage[];
    imageAnalyzerChatHistory: ChatMessage[];
    gisChatHistory: ChatMessage[];
    contouringChatHistory: ChatMessage[];
    steepSlopeChatHistory?: ChatMessage[];
    profileChatHistory: ChatMessage[];
    cogoChatHistory: ChatMessage[];
    rinexChatHistory: ChatMessage[];
    zoningChatHistory: ChatMessage[];
    soilsChatHistory?: ChatMessage[];
    standardsComplianceChatHistory?: ChatMessage[];
    /** @deprecated use standardsComplianceControlFiles — kept for loading older saved sessions. */
    standardsComplianceControlFile?: SessionFile | null;
    standardsComplianceControlFiles?: SessionFile[];
    standardsComplianceSubjectFile?: SessionFile | null;
    standardsComplianceSourceMode?: ComplianceSourceMode;
    standardsComplianceChecks?: StandardsComplianceCheckSelection;
    standardsComplianceLastReport?: StandardsComplianceReport | null;
    profileData?: ProfilePoint[];
    profileInfo?: ProfileInfo | null;
    
    fieldbookNotes: string;
    
    pointLists: PointList[];
    lines: SurveyLine[];
    contourLabels: ContourLabel[];
    centerlines: Centerline[];
    
    // FIX: Added gisFeatures to SessionState
    gisFeatures?: GisFeature[];

    wmsServices: WmsService[];
    activeWmsLayers: ActiveWmsLayer[];
    offlineMapAreas: OfflineMapArea[];

    cutSheetData: CutSheetRow[];
    cutSheetInfo: CutSheetInfo;

    /** CACP: PointAgent point-number reservations to persist across sessions. */
    cacpReservations?: Array<{ reservationId: string; numbers: string[]; owner?: string; createdAt: number }>;

    /** CACP: Project Knowledge Base facts (deed ROW widths, zoning, parcel ids, etc.). Shared by all agents. */
    knowledgeFacts?: Array<{
        id: string; category: string; subject: string; predicate: string;
        value: unknown; units?: string; source: string; context?: string;
        confidence?: number; timestamp: number;
    }>;

    /**
     * Drafting Style Library — user-trained Civil Drafter context.
     * Each entry describes how a feature type should be drafted.
     * Persisted in the .lsvz bundle so styles travel with the project.
     */
    draftingStyleLibrary?: DraftingStyleEntry[];

    /** Soils Agent — persisted SSURGO map units. */
    soilMapUnits?: SoilMapUnit[];

    /** XR/CAD Coordination: Description Key registry mapping VLM predictions to Civil 3D layers.
     *  Used by AR Agent (field-side) and CAD System (desktop-side) to ensure consistent layer assignment.
     *  Loaded on app startup and CAD plugin init. */
    descriptionKeys?: import('./services/CacpSchema').DescriptionKeysRegistry;

    /** XR/CAD Coordination: Cached egocentric keyframes from CACP Events.
     *  Persisted for audit trail and visual verification in CAD. Stored as base64 PNG data URLs. */
    keyframeCache?: Array<{
        event_id: string;
        timestamp: string;
        data_url: string; // data:image/png;base64,...
    }>;
    
    uiState: {
        activeAgent: AgentType;
        activeModel: string;
        activeVisualPanel: VisualPanel;
        isPdfViewerFullscreen: boolean;
        isVisualPanelFullscreen: boolean;
        isPointEditorFullscreen: boolean;
        isChatPanelVisible: boolean;
        attributeScale: number;
        // FIX: Added 'lineLabelScale' to the uiState type definition.
        lineLabelScale: number;
        dimensionScale: number;
        symbolScale?: number;
        pointLayers: {
            pointNumber: { visible: boolean; color: string };
            description: { visible: boolean; color: string };
            elevation: { visible: boolean; color: string };
        };
        activeTextEditorFile: string | null;
        linesVisible: boolean;
        centerlinesVisible: boolean;
        /** Boundary Agent: id of the tract whose overlay renders blue (active).
         *  Persisted so reloads restore the same active tract. */
        activeBoundaryFileId?: string;
        /** Boundary Agent: when true, B&D canvas labels show rotated (as-drawn)
         *  bearings instead of deed bearings on the active tract. */
        showRotatedBearings?: boolean;
        /** Boundary Agent: parcel label field include/exclude and prefix controls. */
        parcelLabelFormatter?: ParcelLabelFormatter;
        /** 2D Canvas Viewport: scale and pan offset persisted so reloads remain exactly at the saved zoom/pan. */
        canvasTransform?: { scale: number; offsetX: number; offsetY: number };
    }
}

// --- CONTEXT & HOOKS ---
// These contexts provide global state to the application components.
// The custom hooks (useSettings, useAgent, etc.) are the standard way to access this state.

interface SettingsContextType {
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
}
export const SettingsContext = createContext<SettingsContextType | undefined>(undefined);
export const useSettings = (): SettingsContextType => {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within a SettingsProvider');
  return context;
};

interface AgentContextType {
  activeAgent: AgentType;
  onAgentChange: (agent: AgentType) => void;
}
export const AgentContext = createContext<AgentContextType | undefined>(undefined);
export const useAgent = (): AgentContextType => {
  const context = useContext(AgentContext);
  if (!context) throw new Error('useAgent must be used within an AgentProvider');
  return context;
};

interface UIContextType {
  isChatPanelVisible: boolean;
  toggleChatPanel: () => void;
  activeVisualPanel: VisualPanel;
  showView: (view: VisualPanel) => void;
  showDoc: () => void;
  showTech: () => void;
  showInvestorForm: () => void;
  showReleaseLog: () => void;
  showSettings: () => void;
  showAbout: () => void;
  showDisclaimer: () => void;
  showLegal: () => void;
}
export const UIContext = createContext<UIContextType | undefined>(undefined);
export const useUI = (): UIContextType => {
  const context = useContext(UIContext);
  if (!context) throw new Error('useUI must be used within a UIProvider');
  return context;
};

interface HighlightContextType {
  highlights: PdfHighlight[];
  addHighlights: (newHighlights: PdfHighlight[]) => void;
  clearHighlights: () => void;
  goToHighlight: (highlightId: string | null) => void;
  zoomTargetHighlightId: string | null;
}
export const HighlightContext = createContext<HighlightContextType | undefined>(undefined);
export const useHighlights = (): HighlightContextType => {
    const context = useContext(HighlightContext);
    if (!context) {
        throw new Error('useHighlights must be used within a HighlightProvider');
    }
    return context;
};

// ----------------------------------------------------------------------------
// App-wide notification model. Surfaced through the NotificationCenter button
// in the canvas-view header. Currently consumed by:
//   - PDF uncertainties (kind: 'pdf-uncertainties')
// New notification sources should add a new `kind` literal and append to the
// derived list in App.tsx without touching the NotificationCenter component.
// ----------------------------------------------------------------------------
export type NotificationKind = 'pdf-uncertainties' | (string & {});
export type NotificationSeverity = 'info' | 'warning' | 'error' | 'success';

export interface AppNotification {
    id: string;
    kind: NotificationKind;
    severity: NotificationSeverity;
    title: string;
    message?: string;
    /** Badge count contribution. Omit for "single-event" notifications. */
    count?: number;
    /** Invoked when the user clicks the notification row. */
    onActivate?: () => void;
    /** Optional ISO timestamp; defaults to now when rendered. */
    createdAt?: string;
    /**
     * Stable key used to dedupe repeated notifications. When present, a repeat
     * with the same key updates the existing entry (and bumps `count`) instead
     * of appending a new row.
     */
    dedupeKey?: string;
    /** When set, the notification auto-dismisses after this many milliseconds. */
    autoDismissMs?: number;
}

// ============================================================================
// GNSS Post-Processing Types
// ============================================================================

export type GNSSProcessingMode = 'spp' | 'rtk' | 'ppp';
export type GNSSConstellation = 'gps' | 'glonass' | 'galileo' | 'beidou' | 'qzss' | 'sbas';
export type GNSSOutputFormat = 'llh' | 'xyz' | 'enu';
export type SolutionStatus = 'fixed' | 'float' | 'single' | 'invalid';

export interface GNSSProcessingConfig {
  mode: GNSSProcessingMode;
  constellations: GNSSConstellation[];
  referenceStation?: {
    latitude: number;
    longitude: number;
    altitude: number;
  };
  outputInterval: number;
  outputFormat: GNSSOutputFormat;
  antennaHeight?: number;
  ionosphereModel: 'broadcast' | 'klobuchar' | 'iono-free' | 'sbas';
  troposphereModel: 'none' | 'saastammoinen' | 'sbas';
  ambiguityResolution: 'off' | 'float' | 'fixed';
}

export interface GNSSPosition {
  time?: string;
  timestamp?: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  elevation?: number;
  latitude_std?: number;
  longitude_std?: number;
  altitude_std?: number;
  solution_status?: SolutionStatus;
  satellites_used?: number;
  numSatellites?: number;
  hdop?: number;
  pdop?: number;
  vdop?: number;
}

export interface GNSSProcessingStatistics {
  totalEpochs?: number;
  fixedEpochs?: number;
  floatEpochs?: number;
  singleEpochs?: number;
  fixedPercentage?: number;
  // Backend statistics
  pointsProcessed?: number;
  pdop?: number;
  horizontalRMS?: number;
  verticalRMS?: number;
  convergenceTime?: number;
}

export interface GNSSProcessingError {
  time?: string;
  message: string;
  severity: 'warning' | 'error';
}

export interface GNSSProcessingResult {
  jobId: string;
  completedAt: string;
  metadata?: {
    processingMode: string;
    startTime: string;
    endTime: string;
    duration: number;
    constellations: string[];
    status: 'completed' | 'failed' | 'partial';
  };
  statistics: GNSSProcessingStatistics;
  positions?: GNSSPosition[];
  results?: any[]; // GeoJSON features or raw results
  errors?: GNSSProcessingError[];
}

export interface GNSSJobStatus {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'pending';
  progress: number;
  startTime: string;
  completedTime?: string;
  currentStep?: string;
  result?: GNSSProcessingResult;
  error?: string;
}
