/**
 * CAD Manager - TypeScript Interfaces & Types
 * 
 * Core data structures for the CAD Manager system:
 * - Standards: User-defined code standards from markdown tables
 * - Layers: Point and line layer assignments for Field-to-Finish
 * - Aliases: Learned mappings from raw codes to master codes
 * - Inference: AI suggestions for code matching
 * 
 * MARKDOWN FILE FORMAT:
 * ====================
 * The standards file must be a markdown table with these columns:
 * 
 * | Code | Description | Point Layer | Line Layer | Linetype | Symbol | Category |
 * |------|-------------|-------------|------------|----------|--------|----------|
 * | EP   | Edge of Pavement | V-TOPO-STRM | V-TOPO-STRM | CONTINUOUS | POINT | Infrastructure |
 * | LP   | Light Pole | V-LITE | - | - | POLE | Utilities |
 * | TREE | Tree | V-VEGE | - | - | TREE | Vegetation |
 * | FNC  | Fence | V-PROP-FNCE | V-PROP-FNCE | FENCELINE | X | Boundary |
 * | RW   | Regulated Waters | V-WETL | V-WETL | REGULATED_WATERS | - | Environmental |
 * 
 * Column definitions:
 * - Code: The master description key code (required)
 * - Description: Human-readable name (required)
 * - Point Layer: CAD layer for point insertion (required, use "-" for none)
 * - Line Layer: CAD layer for F2F linework (use "-" for non-linework codes)
 * - Linetype: CAD linetype for the layer (e.g., "CONTINUOUS", "DASHED", "FENCELINE")
 * - Symbol: Block name or symbol style (optional)
 * - Category: Grouping category (optional)
 */

/**
 * Represents a single code definition from standards
 */
export interface CodeDefinition {
  code: string;           // Master code (e.g., "LP", "EP", "RW")
  description: string;    // Human-readable description
  pointLayer: string;     // CAD layer for point insertion (required)
  lineLayer?: string;     // CAD layer for F2F linework (optional, null = no linework)
  lineType?: string;      // CAD linetype for F2F linework (e.g., "CONTINUOUS", "DASHED", "FENCELINE")
  symbol?: string | SymbolDefinition;  // Block name (string) or full symbol definition
  category?: string;      // Optional category (e.g., "Infrastructure", "Boundary")
  aliases?: string[];     // Optional existing aliases (legacy)
  // Per-surveyor field-code overrides. Each surveyor may map one or more
  // field codes (with `*` wildcards) to this master code. Older sessions may
  // have stored a single string; readers should normalize via
  // `normalizeSurveyorAliases` in CadManager.types.
  surveyorAliases?: { [surveyorId: string]: string | string[] };
  surveyorId?: string;    // ID of surveyor who added/owns this code
  /** Tracks which fields were manually edited by the user (these take priority over AI suggestions) */
  userEdits?: {
    [field: string]: {
      editedAt: string;   // ISO timestamp of when user edited
      originalValue?: string; // Original value before user edit
    };
  };
}

/**
 * Represents a CAD layer definition
 */
export interface LayerDefinition {
  name: string;           // Layer name (e.g., "V-TOPO-STRM")
  color?: number;         // AutoCAD color index (1-255)
  /** Resolved RGB as "#RRGGBB". Set when layers are pulled from a drawing so
   *  colours compare against the connector's normalized form instead of an ACI
   *  index (which would never match and would re-diff on every sync). */
  colorRgb?: string;
  lineType?: string;      // Line type name (e.g., "CONTINUOUS", "DASHED")
  lineWeight?: number;    // Line weight in mm
  description?: string;   // Human-readable purpose
  isPointLayer?: boolean; // True if used for points
  isLineLayer?: boolean;  // True if used for linework
}

/**
 * Represents a linetype definition (from .lin file format)
 * 
 * AutoCAD .lin file format example:
 * *DASHED,Dashed __ __ __ __ __ __
 * A,.5,-.25
 * 
 * *FENCE_LINE,Fence line ----X----X----X----
 * A,.5,-.2,[X,ltypeshp.shx,x=-.1,s=.1],-.2
 * 
 * Complex linetype with embedded TEXT:
 * *REGULATED_WATERS,Regulated Waters ----RW----RW----
 * A,.5,-.2,["RW",STANDARD,S=.1,U=0.0,X=-0.1,Y=-.05],-.2
 */
export interface LinetypeDefinition {
  name: string;           // Linetype name (e.g., "DASHED", "FENCE_LINE")
  description: string;    // Human-readable description (after the comma in header)
  pattern: number[];      // Dash-gap pattern: positive=dash, negative=gap, 0=dot
  patternLength?: number; // Total pattern length (sum of absolute values)
  /** Per-linetype scale multiplier applied to the pattern (AutoCAD CELTSCALE-equivalent default). 1.0 = no change. */
  scale?: number;
  shapeData?: {           // Optional shape/text in linetype
    name: string;         // Shape name OR text string (in quotes for text)
    file?: string;        // Shape file (e.g., "ltypeshp.shx") - not used for text
    style?: string;       // Text style (e.g., "STANDARD") - only for text
    scale?: number;       // Shape/text scale (S=)
    rotation?: number;    // Shape rotation (R=)
    xOffset?: number;     // X offset (X=)
    yOffset?: number;     // Y offset (Y=)
    upright?: number;     // Upright flag for text (U=0.0 means not upright)
    isText?: boolean;     // True if this is embedded text, false for shape
    /** Draws a semicircle bump (revision-cloud style). `scale` = chord length in .lin units. */
    arc?: boolean;
    /** +1 = bump left of line direction, -1 = right. Defaults to +1. */
    arcSide?: 1 | -1;
  }[];
  isComplex?: boolean;    // True if linetype contains shapes/text
  source?: string;        // Source file name
}

/**
 * CAD text style definition persisted with a standard.
 * Used by Boundary Agent parcel labels when styleSource='cad-manager'.
 */
export interface TextStyleDefinition {
  name: string;
  fontFamily: string;
  fontBold?: boolean;
  fontItalic?: boolean;
  textCase?: 'original' | 'uppercase';
  lineSpacing?: number;
}

/**
 * Symbol definition for CAD blocks/point symbols
 * Used in CodeDefinition to store AI-generated or uploaded symbols
 */
export interface SymbolDefinition {
  name: string;            // Symbol/block name (e.g., "LP", "TREE")
  svgPath: string;         // Main SVG path for outline (stroke, no fill)
  fillPath?: string;       // Optional SVG path for filled areas (fill, no stroke)
  viewBox: string;         // SVG viewBox (typically "0 0 24 24")
  source: 'ai' | 'upload' | 'library';  // How the symbol was created
  dxfContent?: string;     // Raw DXF entities for the symbol (if uploaded)
  previewDataUrl?: string; // Base64 data URL for quick preview
  createdAt: string;       // ISO timestamp
  description?: string;    // What was asked for when generating
}

// Re-export HatchDefinition so the rest of the codebase can import it from
// CadManager types (single source of truth).
export type { HatchDefinition } from '../../services/hatchLibrary';

/**
 * Collection of linetypes
 */
export interface LinetypeFile {
  name: string;           // File name or collection name
  description?: string;   // Description of this linetype file
  linetypes: LinetypeDefinition[];
  lastUpdated: string;    // ISO timestamp
  source?: string;        // Where it came from (filename, etc)
}

/**
 * Text style definition for CAD annotations/labels.
 * Used as a shared style catalog that specific tools (e.g., parcel labels)
 * can inherit from.
 */
export interface CadTextStyleDefinition {
  name: string;
  fontFamily: string;
  fontBold?: boolean;
  fontItalic?: boolean;
  textCase?: 'original' | 'uppercase';
  lineSpacing?: number;
}

/**
 * Complete standard definition parsed from markdown
 */
export interface StandardDefinition {
  name: string;                          // Standard name (e.g., "Survey Standards")
  version: string;                       // Version (e.g., "1.0")
  description?: string;                  // Optional description
  /** Global linetype scale (AutoCAD LTSCALE equivalent). Multiplies every linetype pattern. 1.0 = no change. */
  globalLinetypeScale?: number;
  /** Custom/project-specific hatch patterns stored with this standard. */
  hatches?: import('../../services/hatchLibrary').HatchDefinition[];
  codes: CodeDefinition[];               // All defined codes
  layers?: LayerDefinition[];            // Optional layer definitions
  textStyles?: TextStyleDefinition[];    // Optional text style catalog
  linetypes?: LinetypeDefinition[];      // Optional linetype definitions
  textStyles?: CadTextStyleDefinition[]; // Optional shared text style catalog
  lastUpdated: string;                   // ISO timestamp
  source?: string;                       // Where it came from (filename, etc)
  // Persisted team-code state: surveyor roster, their uploaded code files,
  // and the accepted matches. Stored on the standard so adding a surveyor
  // (or accepting matches) survives editor close / app reload.
  surveyorCodeSession?: SurveyorCodeSession;
  // Persisted Field-to-Finish settings (line drafting rules, wildcards,
  // label formatting, surface lines). Also lived only in editor state
  // before — now travels with the standard.
  f2fSettings?: FieldToFinishSettings;
}

/**
 * Result from AI inference - one suggestion
 */
export interface InferenceResult {
  raw: string;                           // Unknown code from user data
  match: string;                         // Suggested master code
  confidence: number;                    // 0-1 confidence score
  reasoning: string;                     // Why this match was suggested
  matchDescription?: string;             // Description of matched code
  alternatives?: Array<{                 // Alternative suggestions
    code: string;
    confidence: number;
    reasoning: string;
  }>;
}

/**
 * Request to inference API
 */
export interface InferenceRequest {
  unknownCodes: string[];                // Codes to be matched
  masterCodes: CodeDefinition[];         // Context of known codes
  previousAliases?: Record<string, string>; // History for learning
}

/**
 * Response from inference API
 */
export interface InferenceResponse {
  results: InferenceResult[];
  processingTime: number;                // ms taken to process
  modelUsed?: string;                    // Which model was used
}

/**
 * Learned alias mapping
 */
export interface AliasMapping {
  raw: string;                           // Raw code
  master: string;                        // Master code
  masterDescription: string;             // Description of master
  confidence: number;                    // User's confidence
  learnedAt: string;                     // ISO timestamp
  source?: string;                       // Where alias came from
}

/**
 * Alias for AliasMapping (for backward compatibility)
 */
export type CodeAlias = AliasMapping;

/**
 * Complete CAD Manager state
 */
export interface CadManagerState {
  // Parsed standards
  standard: StandardDefinition | null;
  
  // Learned mappings: raw code -> master code
  aliases: Record<string, string>;
  
  // Fully detailed alias history
  aliasHistory: AliasMapping[];
  
  // Results waiting for user review
  pendingReview: InferenceResult[];
  
  // UI state
  isLoadingStandard: boolean;
  isLoadingInference: boolean;
  lastError: string | null;
  
  // Timestamps
  lastStandardUpload?: string;
  lastAliasUpdate?: string;
}

/**
 * Normalize a surveyorAliases entry to a clean `string[]`. Accepts the legacy
 * single-string shape, an array, or undefined. Empty/whitespace entries are
 * dropped and order is preserved.
 */
export function normalizeSurveyorAliases(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of arr) {
    const trimmed = (item ?? '').trim();
    if (!trimmed) continue;
    const key = trimmed.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * Build a case-insensitive RegExp for an alias term. `*` is a wildcard that
 * matches any run of non-whitespace characters; all other regex metacharacters
 * are escaped. Word-boundary anchored so `PP` only matches the token `pp`,
 * not `appliance`.
 */
export function aliasToRegExp(term: string): RegExp {
  const escaped = term
    .toLowerCase()
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '\\S*');
  return new RegExp(`\\b${escaped}\\b`, 'i');
}

/**
 * Initial state for CadManagerContext
 */
export const INITIAL_CAD_MANAGER_STATE: CadManagerState = {
  standard: null,
  aliases: {},
  aliasHistory: [],
  pendingReview: [],
  isLoadingStandard: false,
  isLoadingInference: false,
  lastError: null,
};

/**
 * Action types for reducer (if using useReducer)
 */
export type CadManagerAction =
  | { type: 'SET_STANDARD'; payload: StandardDefinition }
  | { type: 'SET_ALIASES'; payload: Record<string, string> }
  | { type: 'ADD_ALIAS'; payload: AliasMapping }
  | { type: 'SET_PENDING_REVIEW'; payload: InferenceResult[] }
  | { type: 'CONFIRM_MATCH'; payload: { raw: string; match: string } }
  | { type: 'REJECT_MATCH'; payload: string }
  | { type: 'SET_LOADING_STANDARD'; payload: boolean }
  | { type: 'SET_LOADING_INFERENCE'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'RESET' };

/**
 * Parsed CSV survey data
 */
export interface SurveyData {
  rawCodes: string[];       // Unique codes found in survey
  totalPoints: number;      // Total points/features
  fileName?: string;
}

/**
 * Code resolution result
 */
export interface CodeResolution {
  raw: string;
  master: string;
  description: string;
  layer?: string;       // Point layer
  lineLayer?: string;   // Line layer for linework
  lineType?: string;    // Linetype for linework (e.g., "CONTINUOUS", "DASHED", "FENCELINE")
  source: 'alias' | 'standard' | 'unknown';
  confidence: number;
}

/**
 * Line drafting controls - defines how linework is started/ended
 */
export interface LineDraftingControls {
  /** Character/code to begin a new line segment (e.g., "B", ".B", "BEGIN") */
  beginLine: string;
  /** Character/code to end current line segment (e.g., "E", ".E", "END") */
  endLine: string;
  /** Character/code to close a polygon (e.g., "C", ".C", "CLOSE") */
  closeLine?: string;
  /** Character/code to start a curve (e.g., "PC", ".PC") */
  startCurve?: string;
  /** Character/code to end a curve (e.g., "PT", ".PT") */
  endCurve?: string;
  /** Whether controls are case-sensitive */
  caseSensitive: boolean;
}

/**
 * Wildcard pattern for code matching
 */
export interface WildcardPattern {
  /** Pattern ID for reference */
  id: string;
  /** Position: before or after the code */
  position: 'prefix' | 'suffix';
  /** The wildcard pattern (e.g., "*", "?", "[0-9]") */
  pattern: string;
  /** Description of what this pattern matches */
  description: string;
  /** Example codes that would match */
  examples?: string[];
  /** Whether this pattern is enabled */
  enabled: boolean;
}

/**
 * Point label formatting options
 */
export interface PointLabelFormatting {
  /** Delimiter between point number and description (e.g., " ", "_", "-") */
  delimiter: string;
  /** Characters to strip from labels */
  stripCharacters: string[];
  /** Character replacements (e.g., replace "/" with "-") */
  replacements: Array<{ from: string; to: string }>;
  /** Whether to uppercase all labels */
  uppercase: boolean;
  /** Whether to lowercase all labels */
  lowercase: boolean;
  /** Maximum label length (0 = unlimited) */
  maxLength: number;
  /** Prefix to add to all labels */
  labelPrefix?: string;
  /** Suffix to add to all labels */
  labelSuffix?: string;
  /** Special character handling mode */
  specialCharMode: 'keep' | 'remove' | 'replace';
}

/**
 * Surface/TIN line type settings
 */
export interface SurfaceLineSettings {
  /** Breakline codes - these create hard edges in TIN */
  breaklineCodes: string[];
  /** Breakline layer override (if different from code's lineLayer) */
  breaklineLayer?: string;
  /** Inclusion boundary codes - define TIN outer boundary */
  inclusionCodes: string[];
  /** Inclusion boundary layer override */
  inclusionLayer?: string;
  /** Exclusion boundary codes - create holes in TIN */
  exclusionCodes: string[];
  /** Exclusion boundary layer override */
  exclusionLayer?: string;
  /** Whether to auto-detect breaklines from elevation changes */
  autoDetectBreaklines: boolean;
  /** Minimum elevation change to trigger auto-breakline (in survey units) */
  breaklineElevationThreshold?: number;
}

/**
 * Single color entry in the print/plot style table
 * Maps AutoCAD color index to print properties
 */
export interface ColorPrintEntry {
  /** AutoCAD color index (1-255, or 0 for ByBlock, 256 for ByLayer) */
  colorIndex: number;
  /** Color name/description (e.g., "Red", "Yellow", "Cyan") */
  colorName: string;
  /** What color to plot as: 'same' (use object color), 'black', or custom RGB */
  plotColor: 'same' | 'black' | string;
  /** Line weight in mm for plotting (0.00 = Use Default, -1 = Use Object) */
  lineWeight: number;
  /** Screening percentage (0-100, 100 = full intensity) */
  screening: number;
  /** Line style: 'solid', 'dashed', 'dotted', etc. */
  lineStyle: 'solid' | 'dashed' | 'dotted' | 'dashdot' | 'object';
  /** Whether to enable this color mapping */
  enabled: boolean;
  /** Optional: associated layers that use this color */
  associatedLayers?: string[];
  /** Optional: associated categories */
  associatedCategories?: string[];
}

/**
 * Color print table / plot style configuration
 */
export interface ColorPrintTable {
  /** Table name (e.g., "Survey Plot Style", "Construction Docs") */
  name: string;
  /** Table description */
  description?: string;
  /** Color entries */
  entries: ColorPrintEntry[];
  /** Default line weight for unmapped colors */
  defaultLineWeight: number;
  /** Whether to plot all colors as black/white */
  monochrome: boolean;
  /** Whether to use object line weights */
  useObjectLineWeights: boolean;
}

/**
 * Standard AutoCAD color names by index
 */
export const AUTOCAD_COLORS: { index: number; name: string; hex: string }[] = [
  { index: 1, name: 'Red', hex: '#FF0000' },
  { index: 2, name: 'Yellow', hex: '#FFFF00' },
  { index: 3, name: 'Green', hex: '#00FF00' },
  { index: 4, name: 'Cyan', hex: '#00FFFF' },
  { index: 5, name: 'Blue', hex: '#0000FF' },
  { index: 6, name: 'Magenta', hex: '#FF00FF' },
  { index: 7, name: 'White', hex: '#FFFFFF' },
  { index: 8, name: 'Dark Gray', hex: '#808080' },
  { index: 9, name: 'Light Gray', hex: '#C0C0C0' },
  { index: 10, name: 'Red', hex: '#FF0000' },
  { index: 11, name: 'Red-Yellow', hex: '#FF7F00' },
  { index: 12, name: 'Dark Red', hex: '#CC0000' },
  { index: 13, name: 'Dark Red-Yellow', hex: '#CC6600' },
  { index: 14, name: 'Brown', hex: '#996600' },
  { index: 30, name: 'Orange', hex: '#FF7F00' },
  { index: 40, name: 'Gold', hex: '#FFBF00' },
  { index: 50, name: 'Yellow-Green', hex: '#BFFF00' },
  { index: 60, name: 'Lime', hex: '#7FFF00' },
  { index: 70, name: 'Spring Green', hex: '#00FF7F' },
  { index: 80, name: 'Aqua', hex: '#00FFBF' },
  { index: 90, name: 'Light Blue', hex: '#00BFFF' },
  { index: 100, name: 'Sky Blue', hex: '#007FFF' },
  { index: 110, name: 'Blue-Violet', hex: '#3F00FF' },
  { index: 120, name: 'Violet', hex: '#7F00FF' },
  { index: 130, name: 'Purple', hex: '#BF00FF' },
  { index: 140, name: 'Magenta-Red', hex: '#FF00BF' },
  { index: 150, name: 'Rose', hex: '#FF007F' },
  { index: 250, name: 'Black (250)', hex: '#333333' },
  { index: 251, name: 'Very Dark Gray', hex: '#505050' },
  { index: 252, name: 'Dark Gray (252)', hex: '#696969' },
  { index: 253, name: 'Medium Gray', hex: '#808080' },
  { index: 254, name: 'Light Gray (254)', hex: '#C0C0C0' },
  { index: 255, name: 'White (255)', hex: '#FFFFFF' },
];

/**
 * Default color print table with common survey settings
 */
export const DEFAULT_COLOR_PRINT_TABLE: ColorPrintTable = {
  name: 'Survey Standard',
  description: 'Standard survey plotting - key colors plot black, others as shown',
  entries: [
    // Survey-specific colors - plot as black
    { colorIndex: 1, colorName: 'Red', plotColor: 'black', lineWeight: 0.25, screening: 100, lineStyle: 'solid', enabled: true, associatedCategories: ['Monuments', 'Control'] },
    { colorIndex: 2, colorName: 'Yellow', plotColor: 'black', lineWeight: 0.18, screening: 100, lineStyle: 'solid', enabled: true, associatedCategories: ['Topo'] },
    { colorIndex: 3, colorName: 'Green', plotColor: 'black', lineWeight: 0.25, screening: 100, lineStyle: 'solid', enabled: true, associatedCategories: ['Vegetation'] },
    { colorIndex: 4, colorName: 'Cyan', plotColor: 'black', lineWeight: 0.18, screening: 100, lineStyle: 'solid', enabled: true, associatedCategories: ['Water', 'Storm'] },
    { colorIndex: 5, colorName: 'Blue', plotColor: 'black', lineWeight: 0.25, screening: 100, lineStyle: 'solid', enabled: true, associatedCategories: ['Water'] },
    { colorIndex: 6, colorName: 'Magenta', plotColor: 'black', lineWeight: 0.25, screening: 100, lineStyle: 'solid', enabled: true, associatedCategories: ['Sanitary'] },
    { colorIndex: 7, colorName: 'White/Black', plotColor: 'black', lineWeight: 0.18, screening: 100, lineStyle: 'solid', enabled: true },
    { colorIndex: 8, colorName: 'Dark Gray', plotColor: 'black', lineWeight: 0.13, screening: 50, lineStyle: 'solid', enabled: true, associatedCategories: ['Background'] },
    { colorIndex: 9, colorName: 'Light Gray', plotColor: 'black', lineWeight: 0.09, screening: 30, lineStyle: 'solid', enabled: true, associatedCategories: ['Background'] },
    // Utility colors
    { colorIndex: 30, colorName: 'Orange', plotColor: 'black', lineWeight: 0.25, screening: 100, lineStyle: 'solid', enabled: true, associatedCategories: ['Telecom'] },
    { colorIndex: 40, colorName: 'Gold', plotColor: 'black', lineWeight: 0.25, screening: 100, lineStyle: 'solid', enabled: true, associatedCategories: ['Gas'] },
    { colorIndex: 10, colorName: 'Red (10)', plotColor: 'black', lineWeight: 0.35, screening: 100, lineStyle: 'solid', enabled: true, associatedCategories: ['Electric'] },
  ],
  defaultLineWeight: 0.18,
  monochrome: false,
  useObjectLineWeights: false,
};

/**
 * Symbol layer settings for Field-to-Finish
 */
export interface SymbolLayerSettings {
  /** Prefix for symbol layer names (e.g., "V-SYM-" → "V-SYM-TREE") */
  layerPrefix: string;
  /** Suffix for symbol layer names (e.g., "-SYM" → "TREE-SYM") */
  layerSuffix: string;
  /** Whether to auto-generate symbol layers from symbol names */
  autoGenerateLayers: boolean;
  /** Default color index for symbol layers (AutoCAD 1-255) */
  defaultColor: number;
  /** Default symbol scale factor */
  defaultScale: number;
  /** Whether symbol rotation follows point direction/bearing */
  rotateWithBearing: boolean;
}

/**
 * Field-to-Finish configuration settings
 */
export interface FieldToFinishSettings {
  /** Line drafting controls (begin/end/close) */
  lineDrafting: LineDraftingControls;
  /** Wildcard patterns for code matching */
  wildcardPatterns: WildcardPattern[];
  /** Point label formatting rules */
  labelFormatting: PointLabelFormatting;
  /** Surface line settings (breaklines, boundaries) */
  surfaceLines: SurfaceLineSettings;
  /** Color print/plot style table */
  colorPrintTable: ColorPrintTable;
  /** Symbol layer settings */
  symbolLayers: SymbolLayerSettings;
}

/**
 * Default Field-to-Finish settings
 */
export const DEFAULT_F2F_SETTINGS: FieldToFinishSettings = {
  lineDrafting: {
    beginLine: 'B',
    endLine: 'E',
    closeLine: 'C',
    startCurve: 'PC',
    endCurve: 'PT',
    caseSensitive: false,
  },
  wildcardPatterns: [
    { id: 'numeric-suffix', position: 'suffix', pattern: '[0-9]+', description: 'Numeric suffix (e.g., EP1, EP2)', examples: ['EP1', 'TC2', 'FL99'], enabled: true },
    { id: 'alpha-suffix', position: 'suffix', pattern: '[A-Z]', description: 'Single letter suffix (e.g., EPA, EPB)', examples: ['EPA', 'TCB'], enabled: true },
    { id: 'underscore-prefix', position: 'prefix', pattern: '_', description: 'Underscore prefix', examples: ['_EP', '_TC'], enabled: false },
    { id: 'dot-prefix', position: 'prefix', pattern: '\\.', description: 'Dot prefix for control codes', examples: ['.B', '.E', '.C'], enabled: true },
  ],
  labelFormatting: {
    delimiter: ' ',
    stripCharacters: [],
    replacements: [],
    uppercase: false,
    lowercase: false,
    maxLength: 0,
    specialCharMode: 'keep',
  },
  surfaceLines: {
    breaklineCodes: ['GB', 'TC', 'FL', 'BC', 'TS', 'BS', 'TOE', 'CREST', 'RIDGE', 'SWALE', 'DITCH'],
    inclusionCodes: ['BNDRY', 'INCL', 'TINBND'],
    exclusionCodes: ['EXCL', 'HOLE', 'VOID', 'BLDG'],
    autoDetectBreaklines: false,
    breaklineElevationThreshold: 0.5,
  },
  colorPrintTable: DEFAULT_COLOR_PRINT_TABLE,
  symbolLayers: {
    layerPrefix: 'V-SYM-',
    layerSuffix: '',
    autoGenerateLayers: true,
    defaultColor: 7,  // White
    defaultScale: 1.0,
    rotateWithBearing: false,
  },
};

/**
 * Surveyor/Team Member for collaborative code matching
 */
export interface Surveyor {
  id: string;              // Unique identifier
  name: string;            // Full name
  initials: string;        // 2-3 letter initials for display
  color: string;           // Hex color for text/highlighting (e.g., "#FF6B6B")
  createdAt: string;       // ISO timestamp
}

/**
 * An uploaded code from a surveyor's personal code list
 */
export interface UploadedSurveyorCode {
  code: string;            // The field code (e.g., "IPF", "LP", "MH")
  description?: string;    // Optional description (used as context, not displayed)
  surveyorId: string;      // Which surveyor uploaded this
  originalLine?: string;   // Original line from file for debugging
}

/**
 * A match between an uploaded code and a master standard code
 */
export interface SurveyorCodeMatch {
  id: string;              // Unique match ID
  uploadedCode: string;    // The surveyor's uploaded code
  surveyorId: string;      // Which surveyor this belongs to
  matchedMasterCode?: string; // The master code it's matched to (null if unmatched)
  confidence: number;      // AI confidence 0-100
  status: 'pending' | 'accepted' | 'rejected' | 'manual';
  acceptedAt?: string;     // ISO timestamp when accepted
  acceptedBy?: string;     // Surveyor ID who accepted
}

/**
 * Collection of surveyor code uploads and matches for a session
 */
export interface SurveyorCodeSession {
  surveyors: Surveyor[];
  uploads: UploadedSurveyorCode[];
  matches: SurveyorCodeMatch[];
  lastUpdated: string;
}

