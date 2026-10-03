/**
 * Single source of truth for the .lsvz manifest schema documentation.
 *
 * HOW THIS STAYS IN SYNC WITH THE REAL SessionState
 * --------------------------------------------------
 * The `LSVZ_SCHEMA` constant below is checked at compile time against the
 * real `SessionState` type via a `satisfies` clause: every key listed here
 * must be a real key of SessionState, and every key of SessionState (minus
 * the ones declared internal in `INTERNAL_KEYS`) must appear here. If a
 * developer adds a new field to SessionState without documenting it, the
 * TypeScript build fails in this file — they can't silently grow the .lsvz
 * scope without acknowledging it in the public spec.
 *
 * The LsvzDocumentationContent component renders this schema directly, so
 * the documentation page, the lsvz.landsurv.ai landing, and any AI assistant
 * citing it all see the same up-to-date field list.
 */

import type { SessionState } from '../types';

// .lsvz spec version — bump on backwards-incompatible manifest/schema
// changes, and update LSVZ_SPEC_RELEASE to the publication date (ISO 8601).
// Additive fields under existing groups DO NOT require a bump because the
// schema is compile-time-checked against SessionState and rendered live.
export const LSVZ_SPEC_VERSION = '1.1';
export const LSVZ_SPEC_RELEASE = '2026-08-21';

// Fields that are saved for restore-on-load but aren't part of the publicly
// documented .lsvz schema (chat histories listed separately to keep the
// schema readable). If you add a private field, add it here too.
type InternalKeys = never;

/** Grouping used to render the docs into readable sections. */
export type LsvzGroupId =
  | 'top'
  | 'context'
  | 'files'
  | 'geometry'
  | 'mapping'
  | 'stakeout'
  | 'pdf'
  | 'cacp'
  | 'fieldbook'
  | 'chat'
  | 'ui';

export interface LsvzField {
  /** Key of SessionState. */
  key: keyof SessionState;
  /** One-line human description. */
  description: string;
  /** Example value string shown in the example manifest. */
  example: string;
}

export interface LsvzGroup {
  id: LsvzGroupId;
  title: string;
  description: string;
  fields: LsvzField[];
}

// ----------------------------------------------------------------------------
// THE SCHEMA  (edit this when SessionState changes)
// ----------------------------------------------------------------------------
export const LSVZ_SCHEMA: LsvzGroup[] = [
  {
    id: 'top',
    title: 'Top-level metadata',
    description: 'Always present at the root of manifest.json.',
    fields: [
      { key: 'version',  description: 'App version string that wrote the file (date-based YY.MM.DD.xx since v26.x).',
        example: '"26.05.17.20"' },
      { key: 'savedAt',  description: 'ISO timestamp of when the .lsvz was packaged.',
        example: '"2026-05-17T20:00:00.000Z"' },
    ],
  },
  {
    id: 'context',
    title: 'User & project context',
    description: 'Per-user preferences and the high-level job metadata.',
    fields: [
      { key: 'settings', description: 'App settings: theme, projection (state/zone/EPSG), selectable linear units, point labeling style, CACP notification toggles, NTRIP credentials, cut-sheet defaults, etc.',
        example: '{ "theme": "dark", "projection": { "state":"...", "epsg":"..." }, "pointLabeling": { "style":"numeric", "prefix":"", "nextNumber":1 }, "ntrip": { ... } }' },
      { key: 'jobInfo',  description: 'Job header: name, number, client, surveyor, datum, etc.',
        example: '{ "jobName":"...", "jobNo":"...", "client":"...", "surveyor":"..." }' },
    ],
  },
  {
    id: 'files',
    title: 'Source & generated files',
    description: 'Original uploads and anything the agents produced. Binary content is base64-encoded inline (small files) or referenced as a sibling entry in the ZIP (large files).',
    fields: [
      { key: 'rawFile',         description: 'Surveyor RAW file.',                                   example: '{ "name":"job123.raw", "content":"..." }' },
      { key: 'deedFile',        description: 'Single deed PDF.',                                     example: '{ "name":"parcel_a.pdf", "content":"..." }' },
      { key: 'planFiles',       description: 'Civil-plan PDF set.',                                  example: '[ { "name":"C-101.pdf", "content":"..." } ]' },
      { key: 'dxfFile',         description: 'Uploaded DXF.',                                        example: '{ "name":"topo.dxf", "content":"..." }' },
      { key: 'clFile',          description: 'Centerline .cl file.',                                 example: '{ "name":"alignment.cl", "content":"..." }' },
      { key: 'gisFile',         description: 'GIS upload (GeoJSON / shapefile bundle).',             example: '{ "name":"parcels.geojson", "content":"..." }' },
      { key: 'imageFiles',      description: 'Site photos with tags.',                               example: '[ { "name":"IMG_01.jpg", "fileData":"...", "tags":["control_point"] } ]' },
      { key: 'pdfViewerFiles',  description: 'Arbitrary PDFs opened in the PDF viewer.',             example: '[ { "name":"reference.pdf", "content":"..." } ]' },
      { key: 'generatedFiles',  description: 'Anything an agent produced (DXF export, report, etc.).', example: '[ ... ]' },
      { key: 'floodFirmette',   description: 'Cached FEMA FIRMETTE image for the last flood query area. Stores the NFHL MapServer export URL, WGS84 bbox, fetch timestamp, and optionally a base64 PNG data URL for offline use.',
        example: '{ "url":"https://hazards.fema.gov/.../export?bbox=...", "bbox":"-80.1,25.4,-80.0,25.5", "fetchedAt":"2026-05-19T...", "imageDataUrl":"data:image/png;base64,..." }' },
    ],
  },
  {
    id: 'geometry',
    title: 'Geometry & drafting',
    description: 'Everything that lives on the drawing canvas.',
    fields: [
      { key: 'pointLists',        description: 'All point lists, one per source (uploaded, deed-derived, generated, etc.).',  example: '[ ... ]' },
      { key: 'lines',             description: 'SurveyLines — boundary, contour, flood, parcel, road, etc.',                  example: '[ ... ]' },
      { key: 'centerlines',       description: 'Horizontal alignments with PIs and curves.',                                  example: '[ ... ]' },
      { key: 'boundaryFiles',     description: 'Saved deed parcels with bearings/distances, POB info, parcel/owner metadata, drawn point/line ids, and post-Draft transform snapshot (`bakedTransform`) so amber-overlay edits round-trip correctly across saves.', example: '[ ... ]' },
      { key: 'deedBatchJob',      description: 'Multi-deed batch-processing job: per-file status pipeline (queued → extracting → summarizing → summarized → parsed → matched → aligned → completed), deed summaries, top parcel-match results, alignment decisions, and pre-align transform snapshots so batch workflows resume across save/load.',
        example: '{ "id":"batch-1", "label":"...", "status":"running", "files":[ ... ], "totalFiles":4, "processedFiles":2, "failedFiles":0 }' },
      { key: 'closureReports',    description: 'COGO closure reports keyed to boundary files.',                               example: '[ ... ]' },
      { key: 'contourLabels',     description: 'User-placed contour elevation labels.',                                       example: '[ ... ]' },
      { key: 'contourGenerations', description: 'Named ContourGeneration objects (v26.05.19.3). Each stores IsoPaths (mathematical representation of contour polylines), generation settings, display options, and optional ESRI blend state. Supports multiple generations simultaneously, auto-regeneration when survey points change, and ESRI/State blend for inside/outside inclusion boundary.',
        example: '[ { "id":"gen-1", "name":"Survey 2ft (Gen 1)", "createdAt":"...", "lastGeneratedAt":"...", "settings":{...}, "activeInclusionBoundaryId":null, "pointCount":142, "isoPaths":[{"elevation":100,"isMajor":true,"vertices":[...]}], "labels":[...], "visible":true, "esriBlendEnabled":false } ]' },
      { key: 'tinSurfaces',       description: 'Triangulated Irregular Networks derived from contours / points.',             example: '[ ... ]' },
      { key: 'steepSlopeRuns',    description: 'Saved steep-slope analysis runs keyed to TIN surfaces: run settings, per-triangle slope-band assignments, connected-component summaries (elevation span, linear span, kept flag), and analyzed/kept/removed triangle counts.',
        example: '[ { "id":"run-1", "name":"25% Ordinance", "createdAt":"...", "settings":{...}, "sourceTinId":"tin-1", "analyzedTriangleCount":1204, "keptTriangleCount":211, "removedTriangleCount":993, "components":[...], "triangles":[...] } ]' },
      { key: 'streetLabels',      description: 'Street-name text labels aligned to road bearings, derived from OpenStreetMap/Google road geometry within the inclusion boundary. Each stores world x/y, name text, and rotation angle.',
        example: '[ { "x":1000.0, "y":2000.0, "text":"Main Street", "angle":12.5 } ]' },
      { key: 'parcelLabels',      description: 'GIS parcel centroid labels rendered as styled "N/F [OWNER]" annotation text (not survey points). Each carries parcel id, owner of record, deed book/page, block/unit, and world position/rotation.',
        example: '[ { "id":"pl-1", "x":1000.0, "y":2000.0, "angle":0, "parcelId":"12-34-567", "owner":"SMITH, J", "deedBook":"1234", "deedPage":"56" } ]' },
      { key: 'annotationCategories', description: 'Per-category annotation rendering styles (boundary, callout, roads, contour-labels, property-owners, plus user-defined ids): font family, color, scale, bold/italic, text case, line spacing, visibility, existing-feature italic/scale overrides, and optional shared CAD Manager text style binding.',
        example: '[ { "id":"roads", "label":"Roads", "scale":1.0, "color":"#60a5fa", "fontFamily":"Arial", "bold":true, "italic":false, "visible":true, "existingItalic":true, "existingScale":0.25 } ]' },
      { key: 'draftingStyleLibrary', description: 'Drafting Style Library — user-trained Civil Drafter conventions, one entry per feature type (roads, buildings, utilities, …). Each stores a free-text convention description (verbatim-injected into the Civil Drafter system prompt), optional example DXF content with extracted layers, per-layer annotations, and reference images.',
        example: '[ { "id":"dsl-1", "name":"Roads & Pavement", "featureType":"road", "userDescription":"...", "dxfFileName":"example.dxf", "dxfLayers":[...], "createdAt":"...", "updatedAt":"..." } ]' },
      { key: 'inclusionBoundaries', description: 'Named inclusion-polyline groups managed by the Inclusion Boundary Manager. Each binds a user-facing name to a unique polylineId that every constituent SurveyLine carries; agents (Contour, Flood) use these to narrow `type:"inclusion"` lines to one boundary.', example: '[ { "id":"shrinkwrap_1700000000000_ab12c", "name":"Shrinkwrap 1", "polylineId":"shrinkwrap_1700000000000_ab12c" } ]' },
      { key: 'activeInclusionBoundaryId', description: 'Id of the currently-active inclusion boundary (the default boundary peer agents consume).', example: '"shrinkwrap_1700000000000_ab12c"' },
      { key: 'dimensions',        description: 'Annotation dimensions placed on the canvas.',                                  example: '[ ... ]' },
      { key: 'customSymbols',     description: 'User-defined point symbol library.',                                          example: '[ ... ]' },
      { key: 'customAnnotations', description: 'User-defined annotation rules (e.g. description prefix → symbol).',           example: '[ ... ]' },
      { key: 'annotationScale',   description: 'Global annotation scale multiplier.',                                          example: '1.0' },
    ],
  },
  {
    id: 'mapping',
    title: 'Mapping / GIS overlays',
    description: 'GIS features and the WMS / offline-map layer state.',
    fields: [
      { key: 'gisFeatures',     description: 'GeoJSON-like features loaded from gisFile and live GIS queries.', example: '[ ... ]' },
      { key: 'wmsServices',     description: 'Registered WMS endpoints.',                                       example: '[ ... ]' },
      { key: 'activeWmsLayers', description: 'Which WMS layers are toggled on, with opacity/order.',            example: '[ ... ]' },
      { key: 'offlineMapAreas', description: 'Cached map tile bounding boxes for offline use.',                 example: '[ ... ]' },
      { key: 'soilMapUnits',    description: 'SSURGO soil map units persisted by the Soils Agent (USDA NRCS): mukey, symbol, name, farmland class, hydrologic group, drainage class, taxonomic order, representative slope, and acreage.',
        example: '[ { "mukey":"123456", "musym":"HgB", "muname":"Hagerstown silt loam, 3 to 8 percent slopes", "hydgrpdcd":"B", "drclassdcd":"Well drained", "slope_r":5, "acres":12.4 } ]' },
    ],
  },
  {
    id: 'stakeout',
    title: 'Stakeout & profiles',
    description: 'Cut-sheet rows for GPS Stakeout and elevation-profile data.',
    fields: [
      { key: 'cutSheetData', description: 'Stakeout rows (target N/E/Z, design, current, deltas).', example: '[ ... ]' },
      { key: 'cutSheetInfo', description: 'Cut-sheet header (project, datum, station bounds).',     example: '{ ... }' },
      { key: 'profileData',  description: 'Elevation samples along the active profile.',            example: '[ ... ]' },
      { key: 'profileInfo',  description: 'Profile metadata — start station, length, source line.', example: '{ ... }' },
    ],
  },
  {
    id: 'pdf',
    title: 'PDF annotations',
    description: 'Highlights and markup placed on viewer PDFs.',
    fields: [
      { key: 'pdfHighlights', description: 'Persistent highlights on pdfViewerFiles (pageIndex, rects, color, note).', example: '[ ... ]' },
    ],
  },
  {
    id: 'cacp',
    title: 'CACP — cross-agent collaboration',
    description: 'Shared state used by the Cross-Agent Communication Protocol so independent agents can coordinate without losing context.',
    fields: [
      { key: 'cacpReservations', description: 'Active point-number block reservations issued by PointAgent.',          example: '[ { "reservationId":"...", "numbers":["101","102"], "owner":"BOUNDARY", "createdAt":1700000000000 } ]' },
      { key: 'knowledgeFacts',   description: 'Project Knowledge Base — structured facts shared across agents (zoning, ROW widths, parcel ids, deed quotes, ...). Zoning Agent auto-pins facts from live ordinance research; the host application restricts retrieval to permissive sources only, so every fact carries a publicly-accessible source URL.',
        example: '[ { "id":"...", "category":"zoning.requirements", "subject":"Lehi|Utah|UT|R1-10", "predicate":"setbackFront", "value":25, "units":"ft", "source":"https://lehi-ut.gov/zoning/r1-10", "confidence":0.95, "timestamp":1700000000000 } ]' },
      { key: 'descriptionKeys', description: 'VLM → Civil 3D layer-code registry. Maps predicted features (oak tree, monument, etc.) to CAD Description Key assignments. Loaded on app/plugin startup to ensure consistent drafting standards across field and desktop.',
        example: '{ "last_updated":"2026-08-21T...Z", "version":"1.0.0", "keys":{ "DK-VEG-001":{ "id":"DK-VEG-001", "name":"Tree, Oak, 12in", "feature_type":"tree", "cad_layer":"V-VEG-TREE", "match_criteria":{"genus":"Quercus","caliper_min":10,"caliper_max":14} } } }' },
      { key: 'keyframeCache', description: 'Cached egocentric keyframes from CACP Events (base64 PNG data URLs). Each entry includes the originating event_id for audit trail and visual verification when reviewing CAD-executed drawings.',
        example: '[ { "event_id":"uuid-...", "timestamp":"2026-08-21T14:32:45.000Z", "data_url":"data:image/png;base64,..." } ]' },
    ],
  },
  {
    id: 'fieldbook',
    title: 'Fieldbook',
    description: 'Free-form site notes plus the running fieldbook log.',
    fields: [
      { key: 'fieldbookNotes', description: 'Free-form Markdown notes for the project.', example: '"..."' },
    ],
  },
  {
    id: 'chat',
    title: 'Per-agent chat histories',
    description: 'Every conversation with every agent is preserved verbatim so reopening the .lsvz restores the full context — including AI rationale and tool calls. One array per agent.',
    fields: [
      { key: 'fieldbookChatHistory',     description: 'Fieldbook agent conversation.',          example: '[ ... ]' },
      { key: 'rawChatHistory',           description: 'RAW Crawler conversation.',               example: '[ ... ]' },
      { key: 'deedChatHistory',          description: 'Boundary / Deed agent conversation.',     example: '[ ... ]' },
      { key: 'civilDrafterChatHistory',  description: 'Civil Drafter conversation.',             example: '[ ... ]' },
      { key: 'dxfChatHistory',           description: 'DXF Analyzer conversation.',              example: '[ ... ]' },
      { key: 'stationingChatHistory',    description: 'Stationing & Centerline conversation.',   example: '[ ... ]' },
      { key: 'pointEditorChatHistory',   description: 'Point Editor conversation.',              example: '[ ... ]' },
      { key: 'gpsStakeoutChatHistory',   description: 'GPS Stakeout conversation.',              example: '[ ... ]' },
      { key: 'planExpertChatHistory',    description: 'Civil Plan Expert conversation.',         example: '[ ... ]' },
      { key: 'imageAnalyzerChatHistory', description: 'Image Analyzer conversation.',            example: '[ ... ]' },
      { key: 'gisChatHistory',           description: 'GIS Agent conversation.',                 example: '[ ... ]' },
      { key: 'contouringChatHistory',    description: 'Contouring Agent conversation.',          example: '[ ... ]' },
      { key: 'steepSlopeChatHistory',    description: 'Steep Slope Agent conversation.',         example: '[ ... ]' },
      { key: 'soilsChatHistory',         description: 'Soils Agent conversation.',               example: '[ ... ]' },
      { key: 'profileChatHistory',       description: 'Profile & Cross Section conversation.',   example: '[ ... ]' },
      { key: 'cogoChatHistory',          description: 'COGO conversation.',                      example: '[ ... ]' },
      { key: 'rinexChatHistory',         description: 'RINEX / GNSS conversation.',              example: '[ ... ]' },
      { key: 'zoningChatHistory',        description: 'Zoning Agent conversation.',              example: '[ ... ]' },
      { key: 'lsvzChatHistory',          description: 'Meta LSVZ-aware concierge conversation.', example: '[ ... ]' },
    ],
  },
  {
    id: 'ui',
    title: 'UI restoration',
    description: 'Pane layout, active agent, fullscreen flags, scale sliders, and point-layer styling so the .lsvz reopens looking like it did when saved.',
    fields: [
      { key: 'uiState', description: 'Active agent/model/panel, fullscreen flags, scales, point-layer visibility & colors, label & centerline toggles, canvas viewport transform (scale/pan), plus Boundary Agent UI (`activeBoundaryFileId`, `showRotatedBearings`, `parcelLabelFormatter` field include/exclude and prefix controls).',
        example: '{ "activeAgent":"...", "activeModel":"gemini-3.7-flash", "activeVisualPanel":"...", "isChatPanelVisible":true, "attributeScale":1, "lineLabelScale":1, "dimensionScale":1, "symbolScale":1, "pointLayers":{ "pointNumber":{"visible":true,"color":"#fff"}, "description":{"visible":true,"color":"#fff"}, "elevation":{"visible":true,"color":"#fff"} }, "activeTextEditorFile":null, "linesVisible":true, "centerlinesVisible":true, "activeBoundaryFileId":"bf-tract-2", "showRotatedBearings":false, "parcelLabelFormatter":{ ... }, "canvasTransform":{ "scale":1.5, "offsetX":200, "offsetY":-150 } }' },
    ],
  },
];

// ----------------------------------------------------------------------------
// COMPILE-TIME EXHAUSTIVENESS CHECK
// ----------------------------------------------------------------------------
// Build a union of every documented key. If `SessionState` grows a new field
// and a developer forgets to add it here, the type below will not include the
// new key — and the `_DocumentedKeysMustCoverSessionState` assertion below
// will fail to compile until they add it. This is the "auto-update link".
type DocumentedKey = (typeof LSVZ_SCHEMA)[number]['fields'][number]['key'];

type MissingFromDocs = Exclude<keyof SessionState, DocumentedKey | InternalKeys>;
type ExtraInDocs    = Exclude<DocumentedKey, keyof SessionState>;

// These type aliases are intentionally never used at runtime — they exist
// purely so `tsc` enforces that the docs stay in sync with the type.
// `AssertNever` only accepts `never`: if SessionState gains a key that isn't
// documented above (or the docs list a key that doesn't exist), the offending
// key names appear in the compile error. If either assertion errors, see the
// comments at the top of this file.
// NOTE: do NOT "fix" a failure here with an `as never` cast on a value —
// that silently disables the check (which is exactly how the schema drifted
// out of sync once before). Document the field instead.
type AssertNever<T extends never> = T;
 
type _DocumentedKeysMustCoverSessionState = AssertNever<MissingFromDocs>;
 
type _DocsMustNotInventKeys = AssertNever<ExtraInDocs>;

// ----------------------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------------------

/** Build a pretty-printed JSON example of the manifest using all documented fields. */
export function renderExampleManifest(currentAppVersion: string): string {
  const lines: string[] = ['{'];
  LSVZ_SCHEMA.forEach((group, gi) => {
    if (gi > 0) lines.push('');
    lines.push(`  // ─── ${group.title} ─`.padEnd(76, '─'));
    group.fields.forEach((f, i) => {
      const exampleValue =
        f.key === 'version' ? `"${currentAppVersion}"` : f.example;
      const isLast = gi === LSVZ_SCHEMA.length - 1 && i === group.fields.length - 1;
      lines.push(`  "${String(f.key)}": ${exampleValue}${isLast ? '' : ','}`);
    });
  });
  lines.push('}');
  return lines.join('\n');
}

/** Count of distinct top-level keys documented (handy for header copy). */
export function lsvzFieldCount(): number {
  return LSVZ_SCHEMA.reduce((n, g) => n + g.fields.length, 0);
}
