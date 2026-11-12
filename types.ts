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
  ROADING_AGENT = 'ROADING_AGENT',
  STORMWATER_AGENT = 'STORMWATER_AGENT',
  DIRT_VOLUME_AGENT = 'DIRT_VOLUME_AGENT',
  REDLINE_AGENT = 'REDLINE_AGENT',
}

// FUTURE GEMINI: This type defines the available panels in the main view area.
// NOTE: 'cadmanager' is retained for backward compatibility (LSVZ session files,
// agent activation side-effects) but the user-facing View menu now uses
// 'cadstandards' — both render the same CadManagerPage component, which is now
// framed as the CAD Standards view of the CAD Manager agent.
// 'styleguide' — Drafting Style Library: CAD Manager sub-tool for training the Civil Drafter.
export type VisualPanel = 'canvas' | 'cutsheet' | 'fieldbook' | 'pdfviewer' | 'texteditor' | 'gpsstakeout' | 'filemanager' | 'imageanalyzer' | 'wms' | 'symbolmanager' | 'annotatemanager' | 'profile' | 'closurereport' | 'steepslopereport' | 'layermanager' | 'gnssprocessor' | 'ar' | 'zoning' | 'titlesearch' | 'cadmanager' | 'cadstandards' | 'linetypemanager' | 'hatchmanager' | 'legalwriter' | 'sheetview' | 'styleguide' | 'draftstylelib' | 'compliance';

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

export type A2UIStandardsFacet = 'all' | 'layers' | 'codes' | 'linetypes' | 'symbols' | 'hatches';

/** Pre-applied filter for the compact A2UI CAD-standards sheet. */
export interface A2UIStandardsFilter {
  /** Search text extracted from the user's question (layer/code/linetype name). */
  query?: string;
  /** Which section of the standard to show first. */
  facet?: A2UIStandardsFacet;
}

export type A2UIInputFieldType = 'text' | 'number' | 'textarea' | 'select' | 'checkbox';

/** Presentation size for a globally-hosted A2UI surface window. */
export type A2UISurfaceSize = 'compact' | 'standard' | 'wide' | 'fullscreen';

export interface A2UISettingsSummary {
  model?: string;
  units?: string;
  precision?: number;
  theme?: string;
}

export type A2UISettingsSection =
  | 'all'
  | 'graphics'
  | 'display'
  | 'crs'
  | 'imagery'
  | 'command-bar'
  | 'point-labeling'
  | 'ai-model'
  | 'geo-ai'
  | 'ntrip'
  | 'cutsheet'
  | 'notion'
  | 'a2ui';

export type A2UIWorkspaceToolId =
  | 'stationing-controls'
  | 'centerline-list'
  | 'symbol-manager'
  | 'linetype-manager'
  | 'hatch-manager'
  | 'raster-underlay'
  | 'annotate-manager'
  | 'drafting-style-library'
  | 'layer-manager'
  | 'compliance-summary'
  | 'title-search-panel'
  | 'wms-manager'
  | 'file-manager'
  | 'fieldbook-panel'
  | 'cutsheet-panel'
  | 'closure-report'
  | 'steep-slope-report'
  | 'legal-writer'
  | 'sheet-view'
  | 'roading-panel'
  | 'stormwater-quick-check'
  | 'dirt-volume-panel'
  | 'redline-workspace'
  | 'road-paint-studio'
  | 'tin-surfaces'
  | 'point-tools'
  | 'legend';

export interface A2UIInputField {
  id: string;
  label: string;
  type?: A2UIInputFieldType;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  options?: string[];
  /** Default checked state when `type === 'checkbox'`. */
  defaultChecked?: boolean;
  /** Optional visual grouping heading inside the form. */
  group?: string;
  /** Unit suffix shown inside the input. */
  unit?: string;
  /** Use 2 for a full-width field in the two-column form grid. */
  span?: 1 | 2;
}

export interface A2UIInputFormSpec {
  title?: string;
  description?: string;
  fields: A2UIInputField[];
  submitLabel?: string;
  /** At least one of these field-id groups must be complete. */
  requireOneOf?: string[][];
}

export type A2UIContourChipId =
  | 'contour-source'
  | 'contour-intervals'
  | 'contour-cleanup'
  | 'contour-scope'
  | 'contour-labels'
  | 'contour-ignore-points'
  | 'contour-actions'
  | 'contour-generations'
  | 'contour-generation'
  | 'contour-blend'
  | 'contour-esri';

export interface A2UIContourChipSpec {
  chip: A2UIContourChipId;
  /** Bind one born generation when the chip is a single-generation chip. */
  generationId?: string;
}

export type A2UIKeySourceId = 'landsurv' | 'google' | 'openai' | 'xai' | 'anthropic';

export interface A2UIKeyEntrySpec {
  /** Credential row to emphasise when the request named a provider. */
  focus?: A2UIKeySourceId;
}

export type A2UIWidgetType =
  | 'input-form'
  | 'deed-summary'
  | 'selection-prompt'
  | 'point-entry'
  | 'point-upload'
  | 'deed-upload'
  | 'raw-upload'
  | 'civil-drafter-upload'
  | 'plan-upload'
  | 'dxf-upload'
  | 'gis-upload'
  | 'zoning-intake'
  | 'title-search-upload'
  | 'standards-compliance-intake'
  | 'image-upload'
  | 'centerline-upload'
  | 'roading-intake'
  | 'redline-upload'
  | 'roading-designer'
  | 'cad-manager-intake'
  | 'cad-manager-workspace'
  | 'cad-standards-table'
  | 'hatch-studio'
  | 'gps-rover'
  | 'project-location'
  | 'soil-limitations'
  | 'zoning-research'
  | 'zoning-sources'
  | 'surface-console'
  | 'text-editor'
  | 'spreadsheet'
  | 'cacp-review'
  | 'closure-investigation'
  | 'cacp-manifests'
  | 'cacp-inspector'
  | 'settings'
  | 'experimental-agent'
  | 'key-entry'
  | 'properties'
  | 'help'
  | 'page-guide'
  | A2UIContourChipId
  | A2UIWorkspaceToolId;

export interface A2UIZoningContext {
  place: string;
  county?: string;
  state?: string;
  district?: string;
  /** Timestamp used to distinguish a fresh research run from older chat cards. */
  startedAt?: number;
}

export interface A2UIZoningCitation {
  /** Section, article, chapter, or table citation as it appears in the answer. */
  citation: string;
  /** Direct page URL supplied with this specific citation. */
  url?: string;
  title?: string;
  /** Short verbatim phrase from the linked page, when the agent supplied one. */
  quote?: string;
  /** Linked means a URL was supplied; it is not a claim that the page was crawled. */
  status: 'linked' | 'unverified';
  note?: string;
}

export interface A2UIZoningSourceLink {
  url: string;
  title?: string;
}

export interface A2UIZoningSourceLedger {
  citations: A2UIZoningCitation[];
  sources?: A2UIZoningSourceLink[];
  jurisdiction?: string;
  note?: string;
}

export interface A2UICacpReviewItem {
  id: string;
  command: string;
  from: string;
  to: string;
  phase: 'send' | 'handler' | 'response' | 'error' | 'no-handler';
  summary: string;
  preview: string;
  timestamp: number;
  policyStatus?: 'pass' | 'warn' | 'blocked';
  policyWarnings?: string[];
  traceId?: string;
  success?: boolean;
  latencyMs?: number;
  data?: unknown;
}

export interface A2UICacpReviewContext {
  items: A2UICacpReviewItem[];
  title?: string;
  focusTraceId?: string;
}

export interface A2UISelectionPromptSpec {
  title?: string;
  description?: string;
  target?: 'lines-and-arcs';
  actionLabel?: string;
  /** Number of equally spaced points to place on each selected line/arc. */
  pointCount?: number;
}

/**
 * Estimated project footprint derived from drawing geometry (points and/or
 * linework). Produced by utils/projectLocation.estimateProjectLocation and
 * shared by the GPS Rover panel, the A2UI GPS Rover surface, and CACP.
 */
export interface ProjectLocationEstimate {
  hasGeometry: boolean;
  source: 'points-and-linework' | 'points' | 'linework' | 'gps-fix' | 'none';
  confidence: 'high' | 'medium' | 'low' | 'none';
  epsg: number | null;
  marginProjected: number;
  pointCount: number;
  lineCount: number;
  centerlineCount: number;
  vertexCount: number;
  bounds: {
    minEasting: number;
    minNorthing: number;
    maxEasting: number;
    maxNorthing: number;
  } | null;
  center: { northing: number; easting: number } | null;
  width: number;
  height: number;
  areaAcres: number;
  diagonal: number;
  bboxWgs84: [number, number, number, number] | null;
  centerWgs84: { latitude: number; longitude: number } | null;
  summary: string;
  warnings: string[];
}

/**
 * Resolved jurisdiction for one project point cluster. `source: 'projection'`
 * means only the state was known (from the project CRS); county and
 * municipality still need a geocode.
 */
export interface ProjectLocationJurisdiction {
  state?: string;
  county?: string;
  place?: string;
  placeType?: 'incorporated' | 'subdivision';
  /** Human-readable line, e.g. "Norristown, Montgomery County, Pennsylvania". */
  label: string;
  source: 'census-geocoder' | 'nominatim' | 'projection' | 'unavailable';
  status: 'resolved' | 'unavailable';
  error?: string;
}

/**
 * One spatially distinct group of project points. Each cluster owns its own
 * footprint estimate and jurisdiction so multi-site projects are answered
 * separately instead of being averaged into the empty space between sites.
 */
export interface ProjectLocationCluster {
  id: string;
  /** 1-based display index. */
  index: number;
  label: string;
  pointCount: number;
  pointNumbers: string[];
  estimate: ProjectLocationEstimate;
  jurisdiction: ProjectLocationJurisdiction | null;
}

/** Every distinct project location derived from the current drawing. */
export type CountyParcelIssue =
  | 'no-projection'
  | 'no-service'
  | 'timeout'
  | 'network'
  | 'server'
  | 'empty'
  | 'unknown';

export interface CountyParcelAttempt {
  label: string;
  match: 'county' | 'statewide' | 'custom';
  ok: boolean;
  message: string;
  featureCount: number;
  issue?: CountyParcelIssue;
}

/** Live status of the County (parcel GIS) action, shared with the A2UI surface. */
export interface CountyGisStatus {
  state: 'loading' | 'success' | 'warning' | 'error';
  message: string;
  guidance?: string;
  jurisdictionLabel?: string;
  serviceLabel?: string;
  attempts: CountyParcelAttempt[];
  featureCount?: number;
  usedStatewide?: boolean;
  clusterIndex?: number;
  /** Which drawn area the fetch used. */
  aoi?: 'cluster' | 'inclusion';
  updatedAt: number;
}

export interface ProjectLocationClusterSet {
  clusters: ProjectLocationCluster[];
  epsg: number | null;
  totalPoints: number;
  /** Distance in project units used to decide two points belong together. */
  linkageDistance: number;
  createdAt: number;
  warnings: string[];
}

export type A2UIGpsRoverMode = 'overview' | 'stakeout' | 'collect' | 'benchmark';

export interface A2UIGpsRoverSpec {
  mode?: A2UIGpsRoverMode;
  initialPointNumber?: string;
}

/** Live snapshot rendered by the A2UI GPS Rover surface. */
export interface A2UIGpsRoverSnapshot {
  hasFix: boolean;
  latitude?: number | null;
  longitude?: number | null;
  accuracyFt?: number | null;
  altitudeFt?: number | null;
  northing?: number | null;
  easting?: number | null;
  epsg?: number | null;
  projectionLabel?: string;
  targetPointNumber: string;
  targetPoint: {
    pointNumber: string;
    description?: string;
    northing: number;
    easting: number;
    elevation?: number;
  } | null;
  guidance: {
    bearingDeg: number;
    distanceFt: number;
    deltaNorthFt: number;
    deltaEastFt: number;
    cutFillFt: number | null;
  } | null;
  nextPointNumber?: string;
  stakeoutPoints?: Array<{
    pointNumber: string;
    description: string;
    northing?: number;
    easting?: number;
    elevation?: number;
  }>;
}

export interface A2UIHatchStudioSpec {
  title?: string;
  description?: string;
  patternName?: string;
  scale?: number;
  angleDeg?: number;
  opacity?: number;
  color?: string;
  backgroundColor?: string;
  layer?: string;
  mode?: 'pick-area' | 'select-object';
  /** What the request named, when the surface came from conversational intent. */
  target?: 'area' | 'objects' | 'circles';
  targetFeature?: string;
  code?: string;
}

export interface A2UIPointEntrySpec {
  pointNumber?: string;
  northing?: string;
  easting?: string;
  elevation?: string;
  description?: string;
}

/** File to open and optional inline content for the in-chat A2UI text editor. */
export interface A2UITextEditorSpec {
  fileName?: string;
  /** Content to open when the file is not yet in the host's file list. */
  content?: string;
  /** Start on the New text form instead of an existing file. */
  mode?: 'edit' | 'new';
}

export type A2UISpreadsheetValue = string | number | boolean | null;

export interface A2UISpreadsheetColumn {
  /** Row object key for this column. */
  key: string;
  label: string;
  /** Relative width hint in pixels. */
  width?: number;
  align?: 'left' | 'center' | 'right';
}

export interface A2UISpreadsheetRow {
  [key: string]: A2UISpreadsheetValue | undefined;
}

/** Lightweight tabular data rendered by the shared A2UI spreadsheet surface. */
export interface A2UISpreadsheetSpec {
  title?: string;
  description?: string;
  fileName?: string;
  columns: A2UISpreadsheetColumn[];
  rows: A2UISpreadsheetRow[];
  /** Allow local cell edits and row add/delete. Defaults to true. */
  editable?: boolean;
  pageSize?: number;
}

export type A2UIPropertyFieldType = 'text' | 'number' | 'select' | 'color' | 'boolean';

/** One machine-readable property row shared by the panel and A2UI surfaces. */
export interface A2UIPropertyField {
  key: string;
  label: string;
  value: string | number | boolean | null;
  /** Display type used by the property inspector. */
  type?: A2UIPropertyFieldType;
  /** Options for select fields. */
  options?: string[];
  /** Unit suffix, e.g. px, ft, or L80. */
  unit?: string;
  /** True when the current multi-object selection has different values. */
  mixed?: boolean;
  /** False for computed/read-only values. Defaults to true. */
  editable?: boolean;
  /** Optional grouping heading in the panel. */
  group?: string;
}

/** A2UI-compliant live property snapshot for the current object selection. */
export interface A2UIPropertiesSpec {
  title?: string;
  description?: string;
  objectCount: number;
  objectTypes: string[];
  fields: A2UIPropertyField[];
}

/** One live event from a Scout browser/discovery run. */
export interface A2UIScoutActivityEvent {
  id?: number | string;
  at: number;
  phase: string;
  message: string;
  url?: string;
  level?: 'info' | 'success' | 'warn' | 'error';
}

/** Live state rendered by the A2UI Scout surface. */
export interface A2UIScoutActivitySnapshot {
  id: string;
  title: string;
  subtitle?: string;
  status: 'running' | 'success' | 'error' | 'cancelled';
  startedAt: number;
  finishedAt?: number;
  events: A2UIScoutActivityEvent[];
  summary?: string;
}

/** One Table E.1 limitation shown in the chat-hosted soil limitations surface. */
export interface A2UISoilLimitationFinding {
  label: string;
  value: string;
  valueLabel: string;
}

/** Display-ready soil map unit for the soil limitations A2UI surface. */
export interface A2UISoilLimitationsUnit {
  mukey: string;
  musym: string;
  muname: string;
  seriesName: string;
  acres: number;
  percent: number;
  hydrologicGroup?: string;
  drainageClass?: string;
  hydric?: string;
  depthToWaterTableIn?: number | null;
  depthToBedrockIn?: number | null;
  limitations: A2UISoilLimitationFinding[];
  resolutions: string[];
}

/**
 * Snapshot of a compiled PA E&S Table E.1 report. The chat message owns this
 * snapshot so the inline surface and Quick Thought stay stable while the user
 * scrolls or switches presentations.
 */
export interface A2UISoilLimitationsSpec {
  generatedAt: string;
  projectName?: string;
  areaLabel: string;
  boundaryPresent: boolean;
  boundaryKind: 'inclusion' | 'boundary' | null;
  boundaryAcres: number;
  soilAcres: number;
  units: A2UISoilLimitationsUnit[];
  unmatched: string[];
  chartSource: string;
  chartCached: boolean;
  boundaryAdvisory?: string;
}

/** Copy and capability list for the A2UI experimental-agent opt-in dialog. */
export interface A2UIExperimentalAgentSpec {
  label: string;
  summary: string;
  warning: string;
  capabilities: string[];
}

export interface A2UIPayload {
  /** Surface kind: inquisitive prompt, upload/intake widget, data explorer, or bridge surface. */
  kind:
    | 'intake-prompt'
    | 'upload-widget'
    | 'selection-prompt'
    | 'standards-explorer'
    | 'point-entry'
    | 'text-editor'
    | 'spreadsheet'
    | 'hatch-studio'
    | 'gps-rover'
    | 'project-location'
    | 'soil-limitations'
    | 'zoning-research'
    | 'zoning-sources'
    | 'cad-manager'
    | 'input-form'
    | 'deed-summary'
    | 'surface-console'
    | 'cacp-review'
    | 'cacp-manifests'
    | 'cacp-inspector'
    | 'settings'
    | 'experimental-agent'
    | 'key-entry'
    | 'properties'
    | 'workspace-tool'
    | 'contour-chip'
    | 'help'
    | 'page-guide';
  /** The agent that owns this A2UI surface */
  agent: AgentType;
  /** Which interactive upload/intake widget to render */
  widgetType: A2UIWidgetType;
  /** Current lifecycle state of the A2UI surface */
  status?: 'prompting' | 'expanded' | 'completed' | 'dismissed';
  /** Keep this prompt in Quick Thought; the chat feed shows the message without the surface. */
  quickThoughtOnly?: boolean;
  /** Optional summary displayed once completed */
  completedSummary?: string;
  /** Deed summary bound to a chat-hosted boundary summary surface. */
  deedSummary?: DeedSummary;
  /** Pre-set query/facet for the compact CAD-standards explorer. */
  standardsFilter?: A2UIStandardsFilter;
  /** Optional defaults for the A2UI point-entry surface. */
  pointEntry?: A2UIPointEntrySpec;
  /** File/content binding for the A2UI text editor surface. */
  textEditor?: A2UITextEditorSpec;
  /** Tabular data for the shared A2UI spreadsheet surface, or a sheet view of a text payload. */
  spreadsheet?: A2UISpreadsheetSpec;
  /** Interactive A2UI Hatch Studio parameters for fluid conversational hatching. */
  hatchStudio?: A2UIHatchStudioSpec;
  /** Focus mode for the live GPS Rover surface. */
  gpsRover?: A2UIGpsRoverSpec;
  /** Optional cluster to emphasise in the LSAI project-location surface. */
  projectLocation?: { initialClusterIndex?: number };
  /** Compiled PA E&S limitations report bound to the inline report surface. */
  soilLimitations?: A2UISoilLimitationsSpec;
  /** Jurisdiction bound to a chat-hosted zoning research surface. */
  zoningContext?: A2UIZoningContext;
  /** Citation-to-source ledger for a specific zoning answer. */
  zoningSources?: A2UIZoningSourceLedger;
  /** Typed fields for collecting values an agent explicitly asked for. */
  inputForm?: A2UIInputFormSpec;
  /** Canvas entity-selection prompt (used by COGO for divide operations). */
  selectionPrompt?: A2UISelectionPromptSpec;
  /** Notable CACP traffic surfaced for review. */
  cacpReview?: A2UICacpReviewContext;
  /** Public page or subdomain bound to a page-guide surface. */
  pageGuide?: { subdomain: string; title?: string };
  /** Lightweight settings snapshot for an in-chat settings surface. */
  settingsSummary?: A2UISettingsSummary;
  /** Specific settings section focused inside the interactive settings surface. */
  settingsSection?: A2UISettingsSection;
  /** Copy for the experimental-agent opt-in dialog and Quick Thought chip. */
  experimentalAgent?: A2UIExperimentalAgentSpec;
  /** Credential source to emphasise in the inline key-entry surface. */
  keyEntry?: A2UIKeyEntrySpec;
  /** Live property snapshot for the current selection. */
  properties?: A2UIPropertiesSpec;
  /** Specific workspace manager/tool mounted inside the surface. */
  workspaceTool?: A2UIWorkspaceToolId;
  /** One independently addressable contour chip bound to live settings/actions. */
  contourChip?: A2UIContourChipSpec;
  /** Initial manifest selection for an in-chat CACP explorer. */
  cacpManifests?: { initialAgent?: AgentType };
  /** Roading Agent intake/design parameters bound to the A2UI surface. */
  roadingDesign?: Partial<RoadTypicalSection & { mode?: 'existing-synthesis' | 'corridor-design' | 'road-model'; centerlineId?: string }>;
}

/** Live state for the LSAI-owned project-location A2UI surface. */
export interface A2UIProjectLocationSnapshot {
  clusterSet: ProjectLocationClusterSet;
  isResolving: boolean;
  error?: string | null;
  busy?: { clusterId: string; action: 'parcels' | 'flood' | 'soils' } | null;
  countyStatus?: CountyGisStatus | null;
  /** Active drawn inclusion boundary, offered as an alternate query area. */
  inclusionArea?: {
    id: string;
    name: string;
    segmentCount: number;
    bboxWgs84: [number, number, number, number];
  } | null;
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
  /** Interactive clarifying question options or quick reply choices presented by the model */
  questionOptions?: string[];
  /** A failed tool action is waiting for one missing value before it can retry. */
  needsInput?: boolean;
  /** Short-lived note shown in Quick Thought, such as a handoff status or concise answer. */
  quickThoughtText?: string;
  /** Optional badge for `quickThoughtText`; defaults to the handoff label. */
  quickThoughtLabel?: string;
  /** A2UI (Agent-to-UI) interactive surface embedded directly in the chat message */
  a2ui?: A2UIPayload;
  sources?: any[];
  /** Agent whose domain behavior produced this message (LSAI for plain turns). */
  behaviorAgent?: AgentType;
  /** LSAI-voiced call-in or release marker in the single visible thread. */
  callInEvent?: {
    kind: 'called-in' | 'released';
    agent: AgentType;
  };
  /** Set when a specialist composed the body and LSAI relayed it. */
  relay?: {
    /** The specialist LSAI addressed. */
    agent: AgentType;
    /** Final composer when a CACP hand-off happened inside the relay. */
    composedBy?: AgentType;
    model?: string;
    status: 'streaming' | 'complete' | 'failed' | 'stopped';
    label?: string;
  };
}

export type PointSymbol = 'circle' | 'square' | 'triangle' | 'cross' | 'x';

/**
 * A live link between generated linework and the geometry that defines it.
 *
 * Centerline offsets and station/offset points are the first two kinds: when
 * the baseline is edited, the associated polyline or point is regenerated from
 * the stored parameters rather than being treated as dumb CAD geometry. Future
 * kinds can add station ranges, widening transitions, or attachments to other
 * source objects without changing the entity storage model.
 */
export type ParametricAssociationKind = 'centerline-offset' | 'centerline-station-point';

interface ParametricAssociationBase {
  /** Stable id shared by every segment of this generated geometry. */
  id: string;
  kind: ParametricAssociationKind;
  sourceType: 'centerline';
  sourceId: string;
  sourceName?: string;
  /** Road model or manual drawing session that owns this association. */
  ownerKind?: 'road-model' | 'manual';
  ownerId?: string;
  label?: string;
  /** Geometry signature of the baseline this geometry was last built from. */
  sourceSignature?: string;
}

/** Parallel linework generated at a fixed perpendicular offset from a baseline. */
export interface CenterlineOffsetAssociation extends ParametricAssociationBase {
  kind: 'centerline-offset';
  /** Positive offsets are right of the baseline direction of travel. */
  offsetFt: number;
  layer: string;
  lineType: string;
  /** Prefix used to name the generated polyline segments. */
  polylinePrefix: string;
}

/** A point placed at a fixed station/offset on a baseline. */
export interface CenterlineStationPointAssociation extends ParametricAssociationBase {
  kind: 'centerline-station-point';
  station: number;
  /** Positive offsets are right of the baseline direction of travel. */
  offsetFt: number;
}

export type ParametricAssociation =
  | CenterlineOffsetAssociation
  | CenterlineStationPointAssociation;

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
  /** Live parametric link; this point is rebuilt when its source changes. */
  parametricAssociation?: ParametricAssociation;
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
  type?: 'baseline' | 'breakline' | 'inclusion' | 'exclusion' | 'shrinkwrap-preview' | 'contour-major' | 'contour-minor' | 'parcel' | 'flood' | 'bfe' | 'fema-cross-section' | 'fema-firm-panel' | 'fema-political' | 'fema-lomr' | 'fema-loma' | 'fema-water' | 'fema-limwa' | 'fema-levee' | 'fema-structure' | 'fema-dune' | 'fema-hydrology' | 'fema-boundary' | 'fema-other' | 'fema-point' | 'soils' | 'steep-slope' | 'tin-edge' | 'road-paint';
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
  /** Parcel key for linework fetched from a county parcel layer. */
  parcelId?: string;
  lineType?: string; // CAD linetype for export (e.g., "CONTINUOUS", "DASHED", "FENCELINE")
  /** Per-entity linetype scale multiplier (AutoCAD CELTSCALE equivalent). 1.0 = no change. */
  lineTypeScale?: number;
  polylineId?: string; // Groups connected line segments into a single polyline for C3D export
  /** Live parametric link; associated linework is rebuilt when its source changes. */
  parametricAssociation?: ParametricAssociation;
  hidden?: boolean; // When true, hidden from canvas/exports
  /** ID of the ContourGeneration that produced this line (survey-generated contours). */
  contourGenId?: string;
  /** ID of the FEMA/soils generation block that produced this line. */
  generationId?: string;
  /** Line source — 'esri' for ESRI/State fetched contours, 'survey' for generated contours. */
  source?: 'esri' | 'survey';
  /** True for a trimmed ESRI line or connector curve synthesized by blend mode. */
  blendDerived?: boolean;
  /** Survey generation whose ESRI blend produced this derived line. */
  blendOwnerId?: string;
  /** True while blend mode is hiding this source ESRI line. */
  blendHidden?: boolean;
  /** Hidden state before blend mode hid this source line, used to restore it. */
  blendOriginalHidden?: boolean;
  /** Elevation callout drawn along the line (used by FEMA BFE linework). */
  labelText?: string;
  /** Anchor-only line: its label renders, but the zero-length geometry does not. */
  labelOnly?: boolean;
  /** Base Flood Elevation in feet, when this line came from the NFHL BFE layer. */
  bfeElevation?: number;
  /** Vertical datum reported by FEMA for the BFE (e.g. NAVD88). */
  bfeDatum?: string;
  /** Pavement-marking metadata when this line is a road paint band. */
  roadPaint?: RoadPaintStripeMeta;
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

/** Result of fitting visible ESRI/State contours to a survey contour generation. */
export interface ContourBlendStats {
  status: 'blended' | 'no-esri' | 'no-boundary';
  /** Number of smooth transition curves added at the boundary. */
  connectorCount: number;
  /** ESRI contour ends that found a same-elevation survey end. */
  matchedEndpoints: number;
  /** ESRI contour ends left open because no survey end matched them. */
  unmatchedGisEndpoints: number;
  /** Candidate joins rejected by the geometric rationality gate. */
  rejectedConnectorCount?: number;
  /** Why rejected joins were not drawn (crossing, looping, excessive bulge). */
  rationalityIssues?: string[];
  /** ESRI generations included in this blend. */
  targetGenerationIds: string[];
  /** Maximum endpoint gap this blend was allowed to bridge, in project units. */
  maxJoinDistance: number;
}

export type GenerationKind = 'contour' | 'flood' | 'soils';

export interface GenerationParameter {
  label: string;
  value: string;
}

/** Structured inputs retained so a generation can be reopened and rerun. */
export interface GenerationQuery {
  mode?: 'inclusion' | 'description' | 'project';
  description?: string;
  bbox?: [number, number, number, number];
  includeBfe?: boolean;
  includeAllLayers?: boolean;
  clippedToBoundary?: boolean;
  inclusionBoundaryName?: string;
}

/**
 * A non-destructive generated block. The generated lines/hatches/areas carry
 * this id, so double-clicking any member can reopen the tool and its inputs.
 */
export interface GenerationBlock {
  id: string;
  kind: GenerationKind;
  name: string;
  createdAt: string;
  parameters: GenerationParameter[];
  query?: GenerationQuery;
  lineIds?: string[];
  hatchIds?: string[];
  areaIds?: string[];
  labelIds?: string[];
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
  /** Generation that produced this label. Labels placed manually omit it. */
  contourGenId?: string;
  /**
   * Index of the source IsoPath this label was generated on. Used to slide the
   * label along the correct contour without hopping to a same-elevation line.
   * Manually placed labels omit it and resolve by nearest matching contour.
   */
  pathIndex?: number;
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
  /** Set when this label is a road paint station callout (so paint clears stay scoped). */
  roadPaint?: { marking: RoadPaintMarkingId; centerlineId: string };
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
    | 'property-owners'
    | 'flood-zones'
    | 'soil-map-units'
    | 'manual-text';

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
    /** Named annotation text style used by manual/in-canvas text in this category. */
    textStyleName?: string;
    /** Optional text transform for annotations using this category. */
    textCase?: 'original' | 'uppercase';
    /** Optional line spacing multiplier for multi-line annotations. */
    lineSpacing?: number;
    visible: boolean;
    /** Whether items tagged as 'existing' should automatically render italic. */
    existingItalic: boolean;
    /** Scale multiplier applied to 'existing' items (default 0.25). */
    existingScale: number;
    /** Fixed base height in CSS px at 1× annotation scale. */
    heightPx?: number;
    /** Leroy reference size (e.g. 80 for L80); optional, never forced. */
    leroySize?: number;
    /** Background wipeout behind this annotation family. */
    maskEnabled?: boolean;
    /** Wipeout padding in CSS px. */
    maskPadding?: number;
    /** Wipeout fill; defaults to the canvas background. */
    maskColor?: string;
    /** Wipeout fill opacity, 0.05–1. */
    maskOpacity?: number;
}

export const DEFAULT_ANNOTATION_CATEGORIES: AnnotationCategoryStyle[] = [
    { id: 'boundary',        label: 'Boundary',        scale: 1.0, heightPx: 9.6,  leroySize: 80,  color: '#22d3ee', fontFamily: 'Arial', italic: false, bold: false,  styleSource: 'local', textCase: 'original', lineSpacing: 1.2, visible: true, existingItalic: true,  existingScale: 0.25, maskEnabled: false, maskPadding: 2, maskOpacity: 0.88 },
    { id: 'callout',         label: 'Callout Labels',  scale: 1.0, heightPx: 9.6,  leroySize: 80,  color: '#f59e0b', fontFamily: 'Arial', italic: false, bold: false,  styleSource: 'local', textCase: 'original', lineSpacing: 1.2, visible: true, existingItalic: true,  existingScale: 0.25, maskEnabled: false, maskPadding: 2, maskOpacity: 0.88 },
    { id: 'roads',           label: 'Roads',           scale: 1.0, heightPx: 12,   leroySize: 100, color: '#60a5fa', fontFamily: 'Arial', italic: false, bold: true,   styleSource: 'local', textCase: 'original', lineSpacing: 1.2, visible: true, existingItalic: true,  existingScale: 0.25, maskEnabled: false, maskPadding: 2, maskOpacity: 0.88 },
    { id: 'contour-labels',  label: 'Contour Labels',  scale: 1.0, heightPx: 7.2,  leroySize: 60,  color: '#a78bfa', fontFamily: 'Arial', italic: false, bold: false,  styleSource: 'local', textCase: 'original', lineSpacing: 1.2, visible: true, existingItalic: false, existingScale: 1.0,  maskEnabled: false, maskPadding: 2, maskOpacity: 0.88 },
    { id: 'property-owners', label: 'Property Owners', scale: 1.0, heightPx: 7.2,  leroySize: 60,  color: '#86efac', fontFamily: 'Arial', italic: true,  bold: false,  styleSource: 'local', textCase: 'uppercase', lineSpacing: 1.2, visible: true, existingItalic: true,  existingScale: 0.25, maskEnabled: false, maskPadding: 2, maskOpacity: 0.88 },
    { id: 'flood-zones',     label: 'Flood Zones',     scale: 1.0, heightPx: 9.6,  leroySize: 80,  color: '#22d3ee', fontFamily: 'Arial', italic: false, bold: true,   styleSource: 'local', textCase: 'uppercase', lineSpacing: 1.2, visible: true, existingItalic: false, existingScale: 1.0,  maskEnabled: false, maskPadding: 2, maskOpacity: 0.88 },
    { id: 'soil-map-units',  label: 'Soil Map Units',  scale: 1.0, heightPx: 7.2,  leroySize: 60,  color: '#e7c99a', fontFamily: 'Arial', italic: false, bold: false,  styleSource: 'local', textCase: 'uppercase', lineSpacing: 1.2, visible: true, existingItalic: false, existingScale: 1.0,  maskEnabled: false, maskPadding: 2, maskOpacity: 0.88 },
    { id: 'manual-text',    label: 'Manual Text',    scale: 1.0, heightPx: 9.6,  leroySize: 80,  color: '#e2e8f0', fontFamily: 'Arial', italic: false, bold: false,  styleSource: 'local', textStyleName: 'Annotative Standard', textCase: 'original', lineSpacing: 1.2, visible: true, existingItalic: false, existingScale: 1.0,  maskEnabled: false, maskPadding: 2, maskOpacity: 0.88 },
];

/**
 * Named text style for canvas text and annotation labels. Mirrors the parts of an
 * AutoCAD text style that change how text looks, so a single style can drive
 * manual text, point labels, and generated labels from the Annotation Manager.
 */
export interface AnnotationTextStyle {
    id: string;
    name: string;
    fontFamily: string;
    bold: boolean;
    italic: boolean;
    /** Base text height in screen pixels at 1× annotation scale. */
    height: number;
    /** Horizontal width factor (AutoCAD WIDTH factor). 0.5–2. */
    widthFactor: number;
    /** Oblique angle in degrees (AutoCAD OBLIQUE). -45–45. */
    oblique: number;
    textCase: 'original' | 'uppercase' | 'lowercase';
    /** Line spacing multiplier for multi-line text. */
    lineSpacing: number;
    /** Optional default color for text using this style. */
    color?: string;
    /** Leroy reference size (e.g. 80 for L80); optional, never forced. */
    leroySize?: number;
}

export const DEFAULT_ANNOTATION_TEXT_STYLES: [AnnotationTextStyle, ...AnnotationTextStyle[]] = [
    { id: 'annot-standard', name: 'Annotative Standard', fontFamily: 'Arial',        bold: false, italic: false, height: 9.6, widthFactor: 1,    oblique: 0,  textCase: 'original',  lineSpacing: 1.2, leroySize: 80 },
    { id: 'annot-label',    name: 'Survey Label',        fontFamily: 'Arial Narrow', bold: false, italic: true,  height: 9.6, widthFactor: 0.9,  oblique: 0,  textCase: 'uppercase', lineSpacing: 1.15, leroySize: 80 },
    { id: 'annot-note',     name: 'General Note',        fontFamily: 'Calibri',      bold: false, italic: false, height: 9.6, widthFactor: 1,    oblique: 0,  textCase: 'original',  lineSpacing: 1.3, leroySize: 80 },
    { id: 'annot-title',    name: 'Title Block',         fontFamily: 'Arial',        bold: true,  italic: false, height: 24,  widthFactor: 1.05, oblique: 0,  textCase: 'uppercase', lineSpacing: 1.15, leroySize: 200 },
];

/**
 * A first-class standalone text entity on the drawing canvas (AutoCAD TEXT /
 * MTEXT equivalent). Persisted in `.lsvz` and editable in place on the canvas.
 */
export interface CanvasTextAnnotation {
    id: string;
    /** Text content. Newlines separate lines. */
    text: string;
    /** World easting of the insertion point (left baseline of the first line). */
    x: number;
    /** World northing of the insertion point (left baseline of the first line). */
    y: number;
    /** Rotation in degrees, counter-clockwise from the east axis. */
    angle: number;
    /** Named style from the annotation text-style library. */
    styleName?: string;
    /** Annotation category used for color, visibility, and existing overrides. */
    categoryId?: string;
    /** Optional per-text base height override (screen px at 1×). */
    height?: number;
    /** Leroy reference size (e.g. 80 for L80); optional, never forced. */
    leroySize?: number;
    /** Per-text font override; otherwise the named style supplies the font. */
    fontFamily?: string;
    /** Per-text scale layered on the style, category, and global annotation scale. */
    scale?: number;
    /** Optional color override. */
    color?: string;
    /** Optional CAD layer. */
    layer?: string;
    /** Optional leader target in world coordinates (annotates a point/feature). */
    leaderTo?: { easting: number; northing: number } | null;
    /** Survey point that produced this label, when generated automatically. */
    sourcePointNumber?: string;
    /** Existing / proposed drafting convention. */
    convention?: 'existing' | 'proposed';
    hidden?: boolean;
    /** Adjustable background wipeout for this text entity. */
    maskEnabled?: boolean;
    /** Wipeout padding in CSS px. */
    maskPadding?: number;
    /** Wipeout fill; defaults to the canvas background. */
    maskColor?: string;
    /** Wipeout fill opacity, 0.05–1. */
    maskOpacity?: number;
    createdAt?: string;
}

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
    reason?: string;            // parser note when a description could not be extracted
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

/** Pavement marking presets understood by the road paint tools. */
export type RoadPaintMarkingId = 'EP' | 'WL' | 'SWL' | 'DYL';

/** Which side of the centerline receives a single stripe. */
export type RoadPaintSide = 'left' | 'right' | 'both';

/**
 * Input for the Civil Drafter road paint skills. Paint is drawn as a real
 * 4-inch-wide band following the centerline, not as a CAD lineweight: double
 * yellow is two yellow bands 8 in each side of the CL, and a single white line
 * is one white band 8 in to the selected side.
 */
export interface RoadPaintSpec {
  marking: RoadPaintMarkingId;
  /** Existing Stationing & CL alignment to follow. */
  centerlineId?: string;
  /** Alignment name when the caller knows it instead of the id. */
  centerlineName?: string;
  /** Ordered points used to create the alignment when no centerline exists. */
  pointNumbers?: string[];
  /** Stripe center distance from the centerline, in inches. */
  offsetIn?: number;
  /** Side for a single stripe. Defaults to 'right'. */
  side?: RoadPaintSide;
  /** Painted band width in inches. Defaults to 4. */
  widthIn?: number;
  /** Center-to-center spacing of the two DYL stripes, in inches. Defaults to 8. */
  separationIn?: number;
  startStation?: number | string;
  endStation?: number | string;
  /** Maximum spacing between paint band samples along the alignment, in feet. */
  stationStepFt?: number;
  /** Station callout spacing, in feet. */
  labelIntervalFt?: number;
  lineType?: string;
  color?: string;
  layer?: string;
  annotate?: boolean;
  /** Replace earlier paint for the same marking/alignment instead of stacking. */
  replaceExisting?: boolean;
}

/** Per-band metadata stored on each generated SurveyLine. */
export interface RoadPaintStripeMeta {
  marking: RoadPaintMarkingId;
  centerlineId: string;
  centerlineName?: string;
  /** Stripe center offset from the centerline, in inches (+ right, − left). */
  offsetIn: number;
  widthIn: number;
  stripeIndex: number;
  stripeCount: number;
  startStation: number;
  endStation: number;
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
    /** Decimal survey epoch for epoch-aware / dynamic datums (e.g. 2026.5). */
    epoch?: number | null;
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

export type StationLabelFormat = 'hundreds' | 'decimal';
export type StationPrecision = 0 | 1 | 2;

export interface StationOffsetLabel {
    id: string;
    /** Alignment the station/offset is measured from. */
    centerlineId: string;
    /** Station along that alignment, in feet. */
    station: number;
    /** Signed offset in feet; positive is right of the alignment. */
    offset: number;
}

export interface StationingSettings {
    /** Feet between automatically plotted station points on a baseline. */
    pointInterval: number;
    /** Draw station labels along centerlines on the canvas. */
    showStationLabels: boolean;
    /** Feet between centerline station labels. */
    labelInterval: number;
    /** Draw PI / BOP / PC / PT tags on the canvas. */
    showGeometryLabels: boolean;
    /** Screen-fixed multiplier for centerline annotation text height. */
    labelScale: number;
    /** Text placed before a station value, e.g. STA. */
    stationPrefix: string;
    /** Show or suppress the station prefix without changing its saved value. */
    showStationPrefix: boolean;
    /** Optional text placed after a station value, e.g. FT or '. */
    stationSuffix: string;
    /** Survey station notation or plain decimal feet. */
    stationLabelFormat: StationLabelFormat;
    /** Decimal places used by the station value. */
    stationPrecision: StationPrecision;
    /** Offset from the baseline in CSS pixels; negative places labels on the other side. */
    labelOffsetPx: number;
    /** Global 180° flip preference used by baselines without a per-baseline override. */
    labelRotationDeg?: number;
    /** Per-baseline Ctrl+drag offsets, keyed by centerline id. */
    labelOffsetPxByBaseline?: Record<string, number>;
    /** Per-baseline 180° flips, keyed by centerline id. */
    labelRotationByBaseline?: Record<string, number>;
    /** Ctrl+drag slide along the baseline in CSS pixels, shared by every station label. */
    labelAlongOffsetPx: number;
    /** Saved station/offset annotations placed relative to any alignment. */
    stationOffsetLabels: StationOffsetLabel[];
    /** Draw a contrasting background behind station labels. */
    showLabelBackground: boolean;
    /** Show PI labels when geometry tags are enabled. */
    showPiLabels: boolean;
    /** Show PC/PT labels when geometry tags are enabled. */
    showPcPtLabels: boolean;
    /** Show BOP/EOP labels when geometry tags are enabled. */
    showEndpointLabels: boolean;
    /** Show the automatically generated CL STA point descriptions. */
    showStationPointLabels: boolean;
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
    /** Baseline / Stationing & CL auto-point and annotation preferences. */
    stationing?: StationingSettings;
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
    /** When true, points compress into screen-space primitives while zoomed out or crowded. Default: true. */
    pointEfficiencyMode?: boolean;
    /** When true, show ephemeral pill notifications for CACP inter-agent traffic. Default: false. */
    showCacpNotifications?: boolean;
    /** When true, include internal CACP handler dispatch phases in activity notifications. */
    showCacpHandlerNotifications?: boolean;
    notion?: NotionIntegration;
    /** Background map imagery overlay (Google Static Maps by default; NAIP optional). */
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
    /** FEMA flood-zone hatching. */
    floodHatch?: AreaHatchSettings;
    /** SSURGO soil map-unit hatching. */
    soilHatch?: AreaHatchSettings;
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
      /**
       * Developer / Experimental setting: enable background aerial imagery extraction
       * and multi-source methodology prompting in Civil Drafter.
       * Default: false (Civil Drafter drafts directly from survey points as usual).
       */
      enableGeoAiDrafting?: boolean;
      /**
       * Developer / Testing: pin interactive chat requests to this agent.
       * While set, the CACP intent handoff and this agent's peer-delegation
       * catalog are disabled so the selected agent handles the request itself.
       * Explicit CACP/internal agent targets are unaffected.
       */
      forceAgent?: AgentType;
      /**
       * Geospatial AI execution mode for SamGeo & SAM-Road:
       * 'local' (desktop daemon on localhost, $0 cloud cost) or
       * 'cloud' (Google Cloud Run on-demand scale-to-zero).
       * Default: 'local' when available, otherwise 'cloud'.
       */
      geoAiMode?: 'local' | 'cloud';    /**
     * Local desktop Geospatial AI daemon endpoint.
     * Default: 'http://127.0.0.1:8765'.
     */
      localGeoAiEndpoint?: string;
      /**
       * A2UI surface platform preferences. The global surface bus is always
       * available to code; these switches control the visible affordances.
       */
      a2ui?: {
        /** Auto-open the CACP review surface for blocked or notable traffic. */
        autoOpenCacpReview?: boolean;
        /** Default size for newly-opened global surfaces. */
        defaultSize?: A2UISurfaceSize;
      };
      /**
       * Docked command bar preferences. Optional so saved sessions that
       * predate these controls fall back to the defaults.
       */
      commandBar?: {
        /** Text size multiplier for the docked command bar. Default: 1.15. */
        textScale?: number;
        /** Show the Space / Shift+Space prompts on the resting command rows. */
        showShortcutHints?: boolean;
        /** Show SNAP / ORTHO status badges in the history row. */
        showStatusBadges?: boolean;
      };
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

export interface SymbolTextElement {
    text: string;
    x: number;
    y: number;
    fontSize: number;
    fontWeight?: 'normal' | 'bold';
    fontFamily?: string;
    anchor?: 'start' | 'middle' | 'end';
    rotation?: number;
}

export interface CustomSymbol {
    id: string;
    name: string;
    description: string;
    associatedTerms: string[];
    svgPath: string;
    fillPath?: string;
    texts?: SymbolTextElement[];
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
    /** Named text style applied to generated labels from this rule. */
    textStyleName?: string;
}

export interface EsriServiceInfo {
    name: string;
    url: string;
    region: string;
    description?: string;
    dataType?: string;
    resolution?: string;
}
export type ContourInclusionMode = 'inside' | 'outside';

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
    /** Drop invert shots (INV/SAN.INV/storm or sewer invert descriptions). Defaults to true. */
    excludeInvertPoints?: boolean;
    /** Drop finished-floor shots (FFE/FIRST FLOOR/FINISHED FLOOR). Defaults to true. */
    excludeFfePoints?: boolean;
    /** Drop structure/top-of shots that are not bare-earth surface (RIM, MH, CB, top of wall, etc.). Defaults to true. */
    excludeStructureShots?: boolean;
    /** Which side of the active inclusion boundary to contour. Defaults to 'inside'.
     *  'outside' keeps points and contour paths outside the boundary, which is the
     *  survey half of an inside-survey / outside-GIS blend. */
    inclusionMode?: ContourInclusionMode;
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
  /** Deed/document that produced this boundary. Tract ids repeat between
   * uploads, so summary rows must match on the source deed as well. */
  sourceDeedName?: string;
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
  /** Canvas draw style. Undefined follows the workspace TIN shading toggle. */
  displayMode?: 'wireframe' | 'shaded';
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

/**
 * A single closed boundary loop for a `CanvasHatch` entity.
 * Vertices are ordered in world coordinates (easting = x, northing = y).
 */
export interface HatchBoundaryLoop {
    vertices: Array<{ x: number; y: number }>;
    /** True when this loop is an interior island hole subtracted from the outer loop. */
    isHole?: boolean;
    /** Optional source entity IDs that formed this loop. */
    sourceLineIds?: string[];
}

/**
 * First-class CAD Hatch entity placed on the 2D drawing canvas.
 * Persisted in `.lsvz` (`SessionState.hatches`), controllable via CACP skills,
 * and exported as a native `AcDbHatch` entity in DXF exports.
 */
/** A rasterized PDF page or image imported for placement on the drawing canvas. */
export interface RasterAsset {
    name: string;
    kind: 'image' | 'pdf';
    /** PNG/JPEG data URL holding the rasterized pixels. */
    dataUrl: string;
    imageWidth: number;
    imageHeight: number;
    /** 1-based source PDF page, when kind === 'pdf'. */
    pageNumber?: number;
    pageCount?: number;
}

/** One correspondence between a source-image pixel and a project point. */
export interface RasterUnderlayAnchor {
    /** Pixel coordinate in the underlay raster (origin top-left, y down). */
    imageX: number;
    imageY: number;
    /** False until the user actually clicks the image; guards the (0,0) default. */
    imagePointSet?: boolean;
    /** Associated project point number, when the anchor was tied to a point. */
    pointNumber?: string;
    easting: number;
    northing: number;
}

/**
 * Similarity transform from source-image pixels to project coordinates:
 * E = originE + scale * (px cosθ + py sinθ)
 * N = originN + scale * (px sinθ - py cosθ)
 * (image y grows downward, project northing grows upward).
 */
export interface RasterUnderlayTransform {
    /** Project coordinate of the image's top-left pixel. */
    originEasting: number;
    originNorthing: number;
    /** Project units per source pixel. */
    scale: number;
    /** Counter-clockwise rotation of the image in project space, degrees. */
    rotationDeg: number;
}

/** Image/PDF underlay rendered beneath survey linework. */
export interface RasterUnderlay extends RasterAsset {
    id: string;
    opacity: number;
    visible: boolean;
    /** Locked underlays cannot be grabbed/moved on the canvas. */
    locked: boolean;
    transform: RasterUnderlayTransform;
    /** Up to two image↔point pairs used to fit scale and rotation. */
    anchors: RasterUnderlayAnchor[];
}

export interface CanvasHatch {
    id: string;
    name?: string;
    /** Pattern identifier matching a built-in or custom `HatchDefinition.name` (e.g., 'ANSI31', 'AR-CONC', 'SOLID'). */
    patternName: string;
    /** Boundary loops: first non-hole loop is outer boundary; loops with `isHole: true` are subtracted islands. */
    loops: HatchBoundaryLoop[];
    /** Pattern scale multiplier (default 1). */
    scale: number;
    /** Pattern rotation in degrees (counter-clockwise, default 0). */
    angleDeg: number;
    /** Optional foreground stroke/fill color override (CSS hex or rgb). */
    color?: string;
    /** Optional background fill color behind pattern lines. */
    backgroundColor?: string;
    /** Opacity 0..1 (default 0.45). */
    opacity: number;
    /** CAD layer name for visibility toggling and DXF export. */
    layer: string;
    /** Optional associative SurveyLine IDs used to derive the boundary. */
    associativeLineIds?: string[];
    /** Optional BoundaryFile ID when hatched from a deed parcel. */
    boundaryFileId?: string;
    /** ID of the FEMA/soils generation block that produced this hatch. */
    generationId?: string;
    /** How this hatch was created. */
    sourceMode?: 'select-object' | 'pick-area' | 'cacp' | 'agent';
    /** Computed area in square feet (outer area minus island holes). */
    areaSqFt?: number;
    /** When true, suppressed on canvas and DXF export. */
    hidden?: boolean;
    createdAt: string;
}

export type MapAreaSource = 'fema-flood' | 'ssurgo-soils';
export type MapAreaLabelCategory = 'flood-zones' | 'soil-map-units';

/** Closed GIS polygon plus the metadata needed for a hatch and annotation. */
export interface MapAreaFeature {
    id: string;
    /** ID of the fetch generation that produced this feature. */
    generationId?: string;
    source: MapAreaSource;
    /** CAD layer shared by the boundary lines, hatch, and label. */
    layer: string;
    loops: HatchBoundaryLoop[];
    /** Interior anchor for the centroid annotation, in project coordinates. */
    centroid: { x: number; y: number };
    /** Approximate net area in project units² (square feet for US projects). */
    areaSqFt?: number;
    /** Ready-to-render primary annotation lines. */
    labelLines: string[];
    attributes?: Record<string, string | number | boolean | null | undefined>;
}

/** Centroid annotation for a FEMA flood zone or SSURGO soil map unit. */
export interface MapAreaLabel {
    id: string;
    /** ID of the fetch generation that produced this annotation. */
    generationId?: string;
    x: number;
    y: number;
    angle: number;
    lines: string[];
    category: MapAreaLabelCategory | string;
    source: MapAreaSource | string;
    visible?: boolean;
}

/** User-controlled hatching for FEMA / soils area overlays. */
export interface AreaHatchSettings {
    /** Legacy style fallback for sessions saved before patternName existed. */
    style: 'lines' | 'cross' | 'dots' | 'chevron' | 'none';
    /** Explicit hatch pattern, 'AUTO' by source/attribute, or 'none'. */
    patternName?: string;
    /** Desired hatch spacing in project feet. */
    scale: number;
    /** Pattern rotation in degrees. */
    angleDeg?: number;
    /** Fill opacity 0–1. */
    opacity: number;
    /** Optional hatch color override. */
    color?: string;
    /** Show centroid annotations for the fetched areas. */
    showLabels?: boolean;
}

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

export interface RoadTypicalSection {
    laneCount: number;
    laneWidthFt: number;
    crownSlopePct: number;
    includeCurbAndGutter: boolean;
    curbWidthFt: number;
    gutterWidthFt: number;
    includeSidewalk: boolean;
    sidewalkWidthFt: number;
    sidewalkOffsetFt: number;
    rowWidthFt: number;
    stationIntervalFt: number;
    designGradePct?: number;
}

export interface RoadCorridorRun {
    id: string;
    name: string;
    /** Old sessions may still contain the legacy 'existing-synthesis' mode. */
    mode: 'existing-synthesis' | 'corridor-design' | 'road-model';
    /** Baseline this road model is built on. Required for parametric models; point-driven existing-road runs may omit it. */
    centerlineId?: string;
    typicalSection: RoadTypicalSection;
    culDeSacRadiusFt?: number;
    filletRadiusFt?: number;
    drawnPointIds: string[];
    drawnLineIds: string[];
    /** Parametric associations owned by this model. */
    associationIds?: string[];
    roadNames?: string[];
    profileGenerated?: boolean;
    createdAt: string;
    updatedAt?: string;
}

export type ToolWorkflowId = 'points' | 'underlays';

/** Resumable progress for a multi-step tool workflow saved in the .lsvz UI state. */
export interface ToolWorkflowProgress {
    started: boolean;
    panelSeen: boolean;
    dismissedKey: string | null;
}

// =============================================================================
// Redline Agent — marked-up plan intake, worklist, review, and revision record.
// =============================================================================

export type RedlineRunStatus =
  | 'draft' | 'interpreting' | 'ready' | 'applying' | 'complete' | 'cancelled';

export type RedlineReadingMode = 'fast' | 'deep';

export type RedlineItemStatus =
  | 'proposed'
  | 'needs_clarification'
  | 'approved'
  | 'rejected'
  | 'deferred'
  | 'human_action'
  | 'blocked'
  | 'applied'
  | 'verified'
  | 'superseded';

export type RedlineRisk = 'low' | 'standard';
export type RedlineConfidence = 'high' | 'medium' | 'low';

export type RedlineMarkupKind =
  | 'callout' | 'abbreviation' | 'deletion' | 'pointer' | 'cloud'
  | 'dimension' | 'highlight' | 'note' | 'non_drafting' | 'other';

export type RedlineChangeKind =
  | 'text_content'
  | 'dimension_text'
  | 'text_style'
  | 'annotation_position'
  | 'layer'
  | 'linetype'
  | 'geometry_move'
  | 'geometry_trim'
  | 'entity_delete'
  | 'entity_add'
  | 'revision_stamp'
  | 'none';

export interface RedlineSheetRegistration {
  /** PDF user-space points after /Rotate, with the y-axis flipped to bottom-left. */
  pdfA: { x: number; y: number };
  pdfB: { x: number; y: number };
  worldA: { easting: number; northing: number };
  worldB: { easting: number; northing: number };
  /** Project units per PDF point. */
  scale: number;
  /** Radians, counter-clockwise. */
  rotation: number;
  translation: { easting: number; northing: number };
  /** True when scale/rotation/shape sanity checks pass. */
  valid: boolean;
  warnings: string[];
  calibratedAt: string;
}

export interface RedlineSheet {
  id: string;
  /** Session file name of the source PDF. */
  fileId: string;
  fileName: string;
  pageIndex: number;
  /** PDF page size in points, after rotation. */
  pageWidth: number;
  pageHeight: number;
  registration: RedlineSheetRegistration | null;
  markupCount: number;
  itemCount: number;
}

export interface RedlineMarkup {
  id: string;
  sheetId: string;
  /** Annotation object subtype or 'visual' for Deep-mode detections. */
  subtype: string;
  /** Verbatim reviewer text; never paraphrased. */
  rawText: string;
  author?: string;
  color?: string;
  /** PDF-space rect [x1, y1, x2, y2] in top-left page space. */
  rect: [number, number, number, number];
  /** Normalized 0–1000 box for visual marks. */
  box2dNorm?: [number, number, number, number];
  kind: RedlineMarkupKind;
  /** Stable source reference: annotation id, or visual-<hash>. */
  sourceRef: string;
}

export interface RedlineTarget {
  entityType: 'point' | 'line' | 'text' | 'hatch' | 'centerline' | 'contour';
  entityId: string;
  /** Human-readable label used in the worklist. */
  label: string;
  /** 0–1 combined geometric, label, layer, and direction score. */
  matchConfidence: number;
  alternatives?: Array<{ entityType: string; entityId: string; label: string; score: number }>;
  /** True when the user corrected the target during review. */
  correctedByUser?: boolean;
}

/** Read-only canvas projection of an unapplied worklist item. */
export interface RedlineGhost {
  id: string;
  number: string;
  sheetId: string;
  anchor: { easting: number; northing: number };
  reviewerText: string;
  targetLabel: string;
  action: string;
  kind: 'text' | 'delete' | 'review';
  beforeText?: string;
  afterText?: string;
  status: RedlineItemStatus;
  confidence: RedlineConfidence;
}

export interface RedlinePatchOp {
  op: 'update_text' | 'update_style' | 'update_layer' | 'update_linetype'
    | 'move_entity' | 'trim_entity' | 'delete_entity' | 'add_entity';
  entityType: RedlineTarget['entityType'];
  entityId: string;
  /** Full values before the change, for inverse apply. */
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface RedlineItem {
  id: string;
  number: string;
  sheetId: string;
  markupIds: string[];
  reviewerText: string[];
  interpretedIntent: string;
  markupKind: RedlineMarkupKind;
  changeKind: RedlineChangeKind;
  risk: RedlineRisk;
  target: RedlineTarget | null;
  proposal: RedlinePatchOp[] | null;
  status: RedlineItemStatus;
  confidence: RedlineConfidence;
  question?: string;
  conflictWith?: string[];
  humanActionNote?: string;
  revision?: { number: number; delta: number; label: string };
  notes: string;
  manual?: boolean;
  createdAt: string;
  decidedAt?: string;
  appliedAt?: string;
  proposedAt: string;
}

export interface RedlineRunMetrics {
  itemsProposed: number;
  itemsAccepted: number;
  itemsRejected: number;
  itemsEdited: number;
  itemsDeferred: number;
  itemsHumanAction: number;
  autoApplied: number;
  autoAppliedReverted: number;
  targetCorrected: number;
  meanMatchConfidence: number;
  timeToFirstDecisionMs?: number;
  totalReviewMs?: number;
}

export interface RedlineRun {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: RedlineRunStatus;
  mode: RedlineReadingMode;
  sheets: RedlineSheet[];
  markups: RedlineMarkup[];
  items: RedlineItem[];
  revision: {
    baseRevision: number;
    assignedRevision: number;
    description: string;
    by?: string;
    checkedBy?: string;
    date: string;
  };
  metrics: RedlineRunMetrics;
  /** Session file names of the uploaded package, for the response adapter. */
  sourceFileIds: string[];
  warnings: string[];
  /** Review preferences captured at run creation. */
  options?: {
    autoApplyLowRisk?: boolean;
    precedence?: 'reviewer' | 'standard' | 'ask';
  };
}

export interface RedlineResponseManifest {
  runId: string;
  items: Array<{
    number: string;
    reviewerText: string;
    disposition: 'done' | 'not_done' | 'see_note' | 'deferred' | 'human_action';
    responseText: string;
    revision?: { number: number; delta: number };
    sheet: { fileId: string; pageIndex: number };
  }>;
  revision: RedlineRun['revision'];
}

export interface RedlineResponsePackage {
  blob: Blob;
  fileName: string;
  mimeType: string;
  manifest: RedlineResponseManifest;
}

export interface RedlineResponseAdapter {
  id: string;
  label: string;
  isAvailable(run: RedlineRun): boolean;
  build(run: RedlineRun, sourceFiles: SessionFile[]): Promise<RedlineResponsePackage>;
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
    /** First-class CAD hatch entities placed on the drawing canvas. */
    hatches?: CanvasHatch[];
    /** Imported image / PDF plan underlays (scale + rotation via anchor pairs). */
    rasterUnderlays?: RasterUnderlay[];
    tinSurfaces?: TinSurface[];
    /** Saved contour generation objects (v26.05.19.3). Each ContourGeneration
     *  stores its own IsoPaths (mathematical representation), display settings,
     *  and ESRI-blend state. Multiple generations can coexist on the canvas. */
    contourGenerations?: ContourGeneration[];
    /** Non-destructive FEMA/soils generation blocks (parameters + member ids). */
    generationBlocks?: GenerationBlock[];
    /** Saved steep-slope analysis runs keyed to TIN surfaces. */
    steepSlopeRuns?: SteepSlopeRunResult[];
    /** Saved Roading Agent synthesis & corridor design runs. */
    roadCorridors?: RoadCorridorRun[];
    /** Redline Agent runs (marked-up plan packages, worklists, decisions). */
    redlineRuns?: RedlineRun[];
    /** Street-name labels placed on the plan (v26.05.19.4). Each label is a
     *  rotated text annotation aligned to the nearest road bearing, derived
     *  from OpenStreetMap road geometry within the inclusion boundary. */
    streetLabels?: StreetLabel[];
    /** GIS parcel centroid labels (v26.05.19.15). Rendered as styled annotation
     *  text with "N/F [OWNER]" surveying notation rather than survey points. */
    parcelLabels?: ParcelLabel[];
    /** FEMA flood-zone / SSURGO soil-map-unit centroid annotations. */
    areaLabels?: MapAreaLabel[];
    /** Source GIS polygons, kept so hatch controls stay live after reload. */
    floodAreas?: MapAreaFeature[];
    soilAreas?: MapAreaFeature[];
    /** Per-category annotation rendering styles (v26.05.19.15). */
    annotationCategories?: AnnotationCategoryStyle[];
    /** Named annotation text styles shared by manual text and generated labels. */
    annotationTextStyles?: AnnotationTextStyle[];
    /** Style applied to newly placed canvas text. */
    activeAnnotationTextStyle?: string;
    /** First-class text entities placed on the drawing canvas. */
    textAnnotations?: CanvasTextAnnotation[];
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
        /** Base64-encoded PDF artifact downloaded to the File Manager. */
        pdfDataUrl?: string;
        /** File Manager name for the downloaded FIRMETTE PDF. */
        pdfFileName?: string;
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
    structuresChatHistory?: ChatMessage[];
    roadingChatHistory?: ChatMessage[];
    redlineChatHistory?: ChatMessage[];
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

    /**
     * CAD Manager state — loaded CAD standard definition + user-confirmed field-to-finish
     * code aliases, persisted inside manifest.json so project standards travel in the .lsvz.
     */
    cadManagerState?: {
        standard: import('./contexts/types/CadManager.types').StandardDefinition | null;
        confirmedAliases: import('./contexts/types/CadManager.types').CodeAlias[];
    };

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
        /** In-progress Point Editor and Image & PDF Underlay workflows, so a saved project resumes the same nudges. */
        workflows?: {
            active: ToolWorkflowId | null;
            points: ToolWorkflowProgress;
            underlays: ToolWorkflowProgress;
        };
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
