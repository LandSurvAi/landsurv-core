/**
 * Auto Draft Orchestrator — utils/autoDraftOrchestrator.ts
 *
 * Phase-by-phase pipeline that assembles ALL available context, then walks the
 * Civil Drafter through FIVE SEQUENTIAL DRAFTING STAGES (roads → buildings →
 * hardscape → landscape → callout labels), narrating each stage live, then
 * finishes with two DETERMINISTIC phases that reuse existing app features:
 *
 *   job_info → points → aoi → zoning ─┬─ parcels     (county GIS tax parcels)
 *                                     ├─ fema        (NFHL flood hazard zones)
 *                                     ├─ soils       (USDA SSURGO map units)
 *                                     └─ structures  (FEMA NSI + OSM footprints)
 *                          → static_map → assemble
 *                          → draft_roads → draft_buildings → draft_hardscape
 *                          → draft_landscape → draft_labels
 *                          → street_labels  (OSM street names + building labels — NO model)
 *                          → symbols        (description-driven symbol coverage — NO model)
 *
 * Symbols are NOT drafted by the model: the canvas resolves them automatically
 * from point descriptions (custom symbols → CAD-standard code symbols → team-code
 * aliases). Unknown field codes are handled in the panel's pre-flight step, where
 * the user quickly maps them to library symbols before the run starts.
 *
 * The four data connectors run in PARALLEL once the AOI resolves. Every phase
 * degrades gracefully — a failed connector logs its error and the pipeline
 * continues with whatever context it has. Draft stages run sequentially and
 * each awaits the model response before starting the next.
 */

import type { SurveyPoint, SurveyLine, JobInfo, StreetLabel } from '../types.ts';
import { interAgentComm } from '../services/InterAgentCommunication.ts';
import { AgentType } from '../types.ts';
import { resolveAoi, type AoiResult } from './aoiResolver.ts';
import { fetchFemaFloodHazards, type FloodFetchResult } from '../services/floodService.ts';
import {
  PARCEL_GIS_SERVICES,
  fetchParcelsForBbox,
  type ParcelFetchResult,
  type ParcelGisServiceDef,
} from '../services/parcelGisService.ts';
import { fetchSsurgoSoils, getSoilsContextString, type SoilsFetchResult } from '../services/soilsService.ts';
import { fetchNsiStructures, type StructuresFetchResult, type NsiStructureProps } from '../services/structuresService.ts';
import { fetchOsmBuildings, type BuildingFootprint } from '../services/osmBuildingsService.ts';
import { getStaticMap, type StaticMapKeys } from '../services/staticMapsService.ts';
import { rectifyBuildings } from '../services/buildingRectifier.ts';

// ─── Public types ─────────────────────────────────────────────────────────────

export type PhaseId =
  | 'job_info'
  | 'points'
  | 'aoi'
  | 'zoning'
  | 'parcels'
  | 'fema'
  | 'soils'
  | 'structures'
  | 'static_map'
  | 'assemble'
  | 'draft_roads'
  | 'draft_buildings'
  | 'draft_hardscape'
  | 'draft_landscape'
  | 'draft_labels'
  | 'street_labels'
  | 'symbols'
  | 'contours'
  | 'slopes';

export type PhaseStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error';

export interface OrchestratorPhase {
  id: PhaseId;
  label: string;
  icon: string;
  status: PhaseStatus;
  summary: string;
  log: string[];
  startedAt?: number;
  completedAt?: number;
}

export interface ZoningContext {
  state?: string;
  county?: string;
  place?: string;
  district?: string;
}

/** Pre-flight answers — every field has a sane default so the pipeline can
 *  run with zero questions answered. */
export interface AutoDraftConfig {
  /** Data-source toggles. All default ON. */
  sources?: {
    parcels?: boolean;
    flood?: boolean;
    soils?: boolean;
    structures?: boolean;
    staticMap?: boolean;
  };
  /** Draw fetched parcel linework onto the canvas (default true). */
  drawParcels?: boolean;
  /** Draw fetched flood-zone linework onto the canvas (default true). */
  drawFlood?: boolean;
  /** Draw fetched SSURGO soil-boundary linework onto the canvas (default true). */
  drawSoils?: boolean;
  /** Contour source — 'points' regenerates from survey points via the app's
   *  contour pipeline, 'gis' pulls the state's published contour service,
   *  'none' skips (default). */
  contours?: 'gis' | 'points' | 'none';
  /** Run the steep-slope analysis (TIN → banded slope shading). Default false. */
  steepSlopes?: boolean;
  /** Request per-building confidence tagging + low-confidence review checklist.
   *  Enabled by default to support human QA after auto drafting. */
  buildingReviewChecklist?: boolean;
  /** Pre-resolved AOI (pre-flight resolves it so the user can confirm). */
  aoiOverride?: AoiResult;
  /** Keys for the static-map cascade (user Gemini key / explicit Maps key). */
  mapKeys?: StaticMapKeys;
  /** Fetch OSM street names + label buildings on the canvas (default true). */
  labelRoadsAndBuildings?: boolean;
  /** Symbol coverage computed by the pre-flight code check (after any user
   *  code→symbol mappings were applied). Drives the final symbols phase. */
  symbolCoverage?: SymbolCoverage;
}

/** How many points currently resolve to a map symbol (via custom symbols,
 *  CAD-standard code symbols, or team-code aliases). */
export interface SymbolCoverage {
  matched: number;
  total: number;
  /** Field codes with no symbol match, most frequent first. */
  unmatched: Array<{ code: string; count: number }>;
}

/** Map image attached to the draft message as a Gemini Vision part. */
export interface AutoDraftImage {
  mimeType: string;
  /** base64 payload (no data: prefix). */
  data: string;
  label: string;
}

export interface AutoDraftOptions {
  points: SurveyPoint[];
  lines: SurveyLine[];
  jobInfo: JobInfo;
  zoningContext: ZoningContext;
  /** Project coordinate system EPSG (settings.projection.epsg). */
  projectEpsg?: number | null;
  /** Pre-flight answers. Omit for all-defaults. */
  config?: AutoDraftConfig;
  /** Called on every phase status change so the UI can re-render. */
  onPhaseUpdate: (phases: OrchestratorPhase[]) => void;
  /** Called once per draft stage with the stage prompt (+ optional map imagery).
   *  MUST return a promise that resolves after the model response has been
   *  processed — the orchestrator awaits it before starting the next stage. */
  onDraft: (prompt: string, images?: AutoDraftImage[]) => void | Promise<void>;
  /** Current canvas line count — lets stages narrate how many lines they added. */
  getCanvasLineCount?: () => number;
  /** Merge fetched GIS linework (parcels / flood) into the canvas. */
  onCanvasLines?: (lines: SurveyLine[], sourceTag: string) => void;
  /** Full parcel fetch result — wire to the existing parcel pipeline (labels, lastFetchedParcels). */
  onParcelResult?: (result: ParcelFetchResult) => void;
  /** Street-name + building labels — wire to the app's streetLabels state so they
   *  render through the existing canvas street-label pipeline. */
  onStreetLabels?: (labels: StreetLabel[]) => void;
  /** Regenerate contours from survey points (wire to the app's contour generator). */
  onGenerateContours?: () => void | Promise<void>;
  /** Fetch the state's published GIS contours clipped to the site (wire to the
   *  ESRI contour pipeline). Should THROW with a human-readable message when no
   *  service is registered for the state. */
  onFetchGisContours?: (ctx: ZoningContext) => Promise<void>;
  /** Build a TIN from the survey points, classify steep-slope bands and draw
   *  them (wire to TinService + SteepSlopeService). Returns triangle counts. */
  onSteepSlopes?: () => Promise<{ kept: number; analyzed: number } | void>;
}

// ─── Phase seed ───────────────────────────────────────────────────────────────

function makePhases(): OrchestratorPhase[] {
  return [
    { id: 'job_info',   label: 'Job Information',   icon: '📋', status: 'pending', summary: '', log: [] },
    { id: 'points',     label: 'Survey Points',     icon: '📍', status: 'pending', summary: '', log: [] },
    { id: 'aoi',        label: 'Area of Interest',  icon: '🎯', status: 'pending', summary: '', log: [] },
    { id: 'zoning',     label: 'Zoning Data',       icon: '🏛', status: 'pending', summary: '', log: [] },
    { id: 'parcels',    label: 'GIS Tax Parcels',   icon: '🗺', status: 'pending', summary: '', log: [] },
    { id: 'fema',       label: 'FEMA Flood Zone',   icon: '🌊', status: 'pending', summary: '', log: [] },
    { id: 'soils',      label: 'USDA Soils',        icon: '🌱', status: 'pending', summary: '', log: [] },
    { id: 'structures', label: 'Structures',        icon: '🏠', status: 'pending', summary: '', log: [] },
    { id: 'static_map', label: 'Aerial Imagery',    icon: '🛰', status: 'pending', summary: '', log: [] },
    { id: 'assemble',   label: 'Assemble Context',  icon: '⚙', status: 'pending', summary: '', log: [] },
    { id: 'draft_roads',     label: 'Draft: Roads',           icon: '🛣', status: 'pending', summary: '', log: [] },
    { id: 'draft_buildings', label: 'Draft: Buildings',       icon: '🏠', status: 'pending', summary: '', log: [] },
    { id: 'draft_hardscape', label: 'Draft: Drives & Walks',  icon: '🚧', status: 'pending', summary: '', log: [] },
    { id: 'draft_landscape', label: 'Draft: Landscape',       icon: '🌳', status: 'pending', summary: '', log: [] },
    { id: 'draft_labels',    label: 'Draft: Callout Labels',  icon: '🏷', status: 'pending', summary: '', log: [] },
    { id: 'street_labels',   label: 'Road & Building Labels', icon: '🛑', status: 'pending', summary: '', log: [] },
    { id: 'symbols',         label: 'Symbols',                icon: '⚡', status: 'pending', summary: '', log: [] },
    { id: 'contours',        label: 'Contours',               icon: '⛰', status: 'pending', summary: '', log: [] },
    { id: 'slopes',          label: 'Steep Slopes',           icon: '📐', status: 'pending', summary: '', log: [] },
  ];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function centroid(points: SurveyPoint[]): { easting: number; northing: number } | null {
  if (points.length === 0) return null;
  const e = points.reduce((sum, p) => sum + p.easting,  0) / points.length;
  const n = points.reduce((sum, p) => sum + p.northing, 0) / points.length;
  return { easting: e, northing: n };
}

function descriptionGroups(points: SurveyPoint[]): Record<string, number> {
  const groups: Record<string, number> = {};
  for (const p of points) {
    const key = (p.description || 'NO_DESC').trim().toUpperCase().split(/\s+/)[0];
    groups[key] = (groups[key] || 0) + 1;
  }
  return groups;
}

/** Find the county-parcel service matching the zoning context, e.g.
 *  county="Chester", state="PA" → the "Chester County, PA" registry entry. */
export function findParcelService(county?: string, state?: string): ParcelGisServiceDef | null {
  if (!county) return null;
  const c = county.trim().toLowerCase().replace(/\s+county$/, '');
  if (!c) return null;
  const stateNorm = (state ?? '').trim().toLowerCase();
  const matches = PARCEL_GIS_SERVICES.filter(s => s.label.toLowerCase().startsWith(c));
  if (matches.length === 0) return null;
  if (matches.length === 1 || !stateNorm) return matches[0];
  // Disambiguate by state when several counties share a name.
  const byState = matches.find(s => {
    const label = s.label.toLowerCase();
    const region = s.region.toLowerCase();
    return label.endsWith(`, ${stateNorm}`) || region === stateNorm ||
      (stateNorm === 'pa' && region === 'pennsylvania') ||
      (stateNorm === 'pennsylvania' && label.endsWith(', pa'));
  });
  return byState ?? matches[0];
}

/** Static-map zoom that frames the AOI bbox inside a 640px tile. */
export function zoomForBbox(bboxWgs84: [number, number, number, number]): number {
  const widthDeg = Math.max(1e-6, bboxWgs84[2] - bboxWgs84[0]);
  const heightDeg = Math.max(1e-6, bboxWgs84[3] - bboxWgs84[1]);
  const span = Math.max(widthDeg, heightDeg) * 1.15; // 15 % breathing room
  // World is 360° across 256px at zoom 0; tile is 640px.
  const zoom = Math.floor(Math.log2((360 * 640) / (span * 256)));
  return Math.max(12, Math.min(20, zoom));
}

export interface RoadContextParcelExtent {
  parcelId: string | null;
  extent: [number, number, number, number];
}

export function buildRoadContextBlock(args: {
  roadLabels?: StreetLabel[];
  parcelExtents?: RoadContextParcelExtent[];
}): string {
  const roads = (args.roadLabels ?? []).slice(0, 12);
  const parcels = (args.parcelExtents ?? []).slice(0, 12);
  const roadLines = roads.length > 0
    ? [
        'Named roads observed in the AOI:',
        ...roads.map(r => `  - ${r.text} (x=${r.x.toFixed(1)}, y=${r.y.toFixed(1)}, angle=${r.angle.toFixed(1)}°)`),
      ]
    : ['Named roads observed in the AOI: none'];
  const parcelLines = parcels.length > 0
    ? [
        'Parcel extents near the road corridor:',
        ...parcels.map(p => `  - ${p.parcelId ?? '(no id)'} → [${p.extent.map(v => v.toFixed(1)).join(', ')}]`),
      ]
    : ['Parcel extents near the road corridor: none'];

  return [
    'Road corridor context',
    ...roadLines,
    ...parcelLines,
    'Treat each road as a linear corridor captured in cross sections and most reliably defined by its centerline. Estimate corridor width from opposing edge-point spans, offset the centerline by half that width to predict edge locations, and connect points that share the same side of the corridor.',
    'Use this context to place road centerlines and edge-of-pavement lines in a way that follows the road corridor and avoids criss-crossing the road bed.',
  ].join('\n');
}

function formatZoningData(
  data: Record<string, unknown>,
  ctx: { state?: string; county?: string; place?: string; district?: string }
): string {
  try {
    const d = ctx.district ? ` District ${ctx.district}` : '';
    const lines: string[] = [
      `Zoning: ${ctx.place || '(unknown)'}${ctx.county ? ', ' + ctx.county + ' County' : ''}, ${ctx.state || ''}${d}`,
    ];
    if (data.district)     lines.push(`District code: ${data.district}`);
    if (data.setbacks) {
      const s = data.setbacks as Record<string, unknown>;
      lines.push(`Setbacks — Front: ${s.front ?? '—'}, Side: ${s.side ?? '—'}, Rear: ${s.rear ?? '—'}`);
    }
    if (data.maxHeight)    lines.push(`Max building height: ${data.maxHeight}`);
    if (data.minLotArea)   lines.push(`Min lot area: ${data.minLotArea}`);
    if (data.lotCoverage)  lines.push(`Max lot coverage: ${data.lotCoverage}`);
    if (Array.isArray(data.permittedUses) && data.permittedUses.length > 0) {
      lines.push(`Permitted uses: ${(data.permittedUses as string[]).slice(0, 5).join(', ')}`);
    }
    if (data.disclaimer)   lines.push(`Disclaimer: ${data.disclaimer}`);
    return lines.join('\n');
  } catch {
    return JSON.stringify(data, null, 2).slice(0, 600);
  }
}

/** Output contract shared by every draft stage. LINES-ONLY by default: the
 *  existing survey points are already on the canvas, so re-emitting hundreds of
 *  points blows the model's output-token budget and truncates the JSON. */
const STAGE_OUTPUT_RULES = [
  '══════════════════════════════════════════════════',
  'MANDATORY OUTPUT FORMAT — READ THIS CAREFULLY',
  '══════════════════════════════════════════════════',
  'Your RESULT section MUST be a single ```json``` fenced block. NO prose after it.',
  '',
  '```json',
  '{',
  '  "points": [],',
  '  "lines": [ { "from": "101", "to": "102", "layer": "EP" } ]',
  '}',
  '```',
  '',
  '• "lines" MUST reference EXISTING canvas points by their point number in "from"/"to".',
  '• Do NOT re-emit the existing survey points — they are ALREADY on the canvas.',
  '  Re-emitting them truncates your output and the stage fails with zero lines.',
  '• "points" is ONLY for NEW points you create this stage (annotations, AI-added',
  '  corners). New points need pointNumber, northing, easting, elevation, description.',
  '• Layer names ALL_CAPS. 0.01 ft precision on any new coordinates.',
  '• Only draft the features requested for THIS stage — later stages handle the rest.',
].join('\n');

function buildContextPrompt(args: {
  jobBlock:        string;
  pointBlock:      string;
  aoiBlock:        string;
  zoningBlock:     string;
  parcelBlock:     string;
  femaBlock:       string;
  soilsBlock:      string;
  structuresBlock: string;
  mapBlock:        string;
}): string {
  const { jobBlock, pointBlock, aoiBlock, zoningBlock, parcelBlock, femaBlock,
          soilsBlock, structuresBlock, mapBlock } = args;
  const sep = '\n\n' + '─'.repeat(60) + '\n\n';
  return [
    '**AUTO DRAFT — EXISTING FEATURES PLAN (STAGED DRAFTING SESSION)**',
    '',
    'You will draft this plan in FIVE sequential stages across the next five messages:',
    '1. Roads → 2. Buildings → 3. Drives & walks → 4. Landscape → 5. Callout labels.',
    '(Street-name labels, building labels and point symbols are applied automatically',
    'by the app afterwards — do NOT draft those.)',
    'The full site context below applies to EVERY stage — remember it.',
    sep, '📋 JOB INFORMATION\n' + jobBlock,
    sep, '📍 SURVEY POINTS\n' + pointBlock,
    sep, '🎯 AREA OF INTEREST\n' + aoiBlock,
    sep, '🏛 ZONING DATA\n' + zoningBlock,
    sep, '🗺 GIS TAX PARCELS\n' + parcelBlock,
    sep, '🌊 FEMA FLOOD ZONE\n' + femaBlock,
    sep, '🌱 USDA SOILS\n' + soilsBlock,
    sep, '🏠 STRUCTURES\n' + structuresBlock,
    sep, '🛰 AERIAL IMAGERY\n' + mapBlock,
    sep,
  ].join('');
}

interface DraftStage {
  id: PhaseId;
  /** Narration line shown while the stage runs. */
  narration: string;
  /** Stage-specific drafting instructions (context/output rules appended by caller). */
  task: string;
  /** Attach aerial/roadmap imagery to this stage's message. */
  attachImages: boolean;
}

function buildDraftStages(args: {
  hasImagery: boolean;
  footprints: BuildingFootprint[];
  femaBlock: string;
  buildingReviewChecklist: boolean;
}): DraftStage[] {
  const { hasImagery, footprints, femaBlock, buildingReviewChecklist } = args;
  const imageryNote = hasImagery
    ? 'Aerial imagery (including NAIP when available) + roadmap context is attached — treat it as the primary visual reference. Verify the alignment, orientation and shape of EVERY feature you draw against the imagery before output, and adjust point chaining when the imagery disagrees.'
    : '';

  const footprintRef = footprints.length > 0
    ? [
        '',
        `GIS BUILDING FOOTPRINT REFERENCE (${Math.min(footprints.length, 12)} of ${footprints.length}, project coords, open rings):`,
        ...footprints.slice(0, 12).map((b, i) =>
          `  ${i + 1}. ${b.tags['building'] || 'building'}: ` +
          b.ring.slice(0, 8).map(v => `(${v.x.toFixed(1)}, ${v.y.toFixed(1)})`).join(' ') +
          (b.ring.length > 8 ? ` …+${b.ring.length - 8} more vertices` : '')),
      ].join('\n')
    : '';

  const hasFloodZone = !femaBlock.startsWith('(') && !/no mapped hazard|No flood/i.test(femaBlock);

  return [
    {
      id: 'draft_roads',
      narration: 'Drawing roads: edges of pavement, centerlines, curbs…',
      attachImages: true,
      task: [
        '**STAGE 1 OF 5 — DRAW ROADS NOW**',
        '',
        'Treat the attached imagery and the road-corridor context as the primary guide for road geometry.',
        'MENTAL MODEL — A road is a linear CORRIDOR, not a loose cloud of points. Surveyors capture it as CROSS SECTIONS: at each station they shoot a set of points across the road (e.g. left EP, CL, right EP), then move down the road and shoot the next section. The corridor is most reliably defined by its CENTERLINE running down its length.',
        'Draft ALL road linework first, connecting existing points by description:',
        '  EP / EOP / EDGE  → edge-of-pavement polylines (layer "EP")',
        '  CL               → road centerlines (layer "CL")',
        '  CURB / TC / BC   → curb lines (layer "CURB")',
        '  SHLD / SH        → shoulder lines (layer "SHOULDER")',
        'PREFER THE CENTERLINE: when CL shots exist, chain them first to establish the corridor spine and its direction of travel. Every other corridor line (EP, CURB, SHOULDER) runs roughly PARALLEL to that centerline on one side or the other.',
        'DEDUCE THE CORRIDOR WIDTH: measure the perpendicular distance between opposing edge points (left EP to right EP across the centerline) at the sections where both exist. Average those spans to estimate a typical road width, then offset the centerline by width ÷ 2 to predict where each edge should fall. Use that predicted edge band to decide which points belong to the same side and in what order to connect them.',
        'Use the survey points to trace each road corridor in travel/station order, not as a freeform sketch. Connect points that lie on the SAME side of the corridor and at similar offset from the centerline; do not connect a point on the left edge to the next point on the right edge.',
        'Follow the road centerline / pavement edges in a single corridor; do not let lines cross the road bed or criss-cross through the middle of the roadway.',
        'NEVER connect opposite edges of a road to each other or jump across the traveled way. A line that crosses the centerline from one edge to the other is almost always wrong.',
        'When there are named roads in context, use them to infer road alignment and label placement; if the road is clearly named, draft the corridor with that orientation in mind.',
        'Road labels are handled automatically later, so this stage should only emit geometry.',
        imageryNote,
        'Output ONLY road linework this stage.',
      ].filter(Boolean).join('\n'),
    },
    {
      id: 'draft_buildings',
      narration: 'Drawing buildings from survey shots + structures data…',
      attachImages: true,
      task: [
        '**STAGE 2 OF 5 — DRAW BUILDINGS NOW**',
        '',
        'PRIMARY PATH: delegate building drawing to the Structures Agent via CACP.',
        'Emit exactly:',
        '{ "askPeer": { "skillId": "structures_rectify_footprints", "payload": {}, "reason": "Auto Draft building pass" } }',
        'Use "structures_draw_footprints" only as back-compat alias if needed.',
        'Do NOT draft building linework yourself unless delegation fails.',
        imageryNote,
        footprintRef,
        'Output only the askPeer JSON call for this stage.',
      ].filter(Boolean).join('\n'),
    },
    {
      id: 'draft_hardscape',
      narration: 'Drawing internal hard surfaces: driveways, sidewalks, parking…',
      attachImages: true,
      task: [
        '**STAGE 3 OF 5 — DRAW INTERNAL HARD SURFACES NOW**',
        '',
        'Draft driveways, sidewalks and other paved areas inside the site:',
        '  DW / DRIVE / DWY   → driveway edges (layer "DRIVE")',
        '  SW / WALK / CONC   → sidewalks and concrete pads (layer "WALK")',
        '  PK / PAVE / LOT    → parking areas (layer "PARKING")',
        '  STEP / STOOP       → steps and stoops (layer "WALK")',
        'WIDTH-CODED CENTERLINES: A numeric value followed by optional whitespace and W in a point description (for example, "10W" or "12 W") is a total feature width in feet. When a CL/centerline description carries this suffix, treat its shots as the feature centerline, compute perpendicular offsets by width ÷ 2, and draft TWO edge chains on layer "DRIVE", "WALK", or the best matching hardscape layer.',
        'Do not draw the construction centerline for a width-coded driveway, sidewalk, path, lane, or paved feature unless the user explicitly asks to show the centerline. The W value is a width annotation, not a literal point code; recognize it across different surveyor naming conventions.',
        imageryNote,
        'Output ONLY hardscape linework this stage.',
      ].filter(Boolean).join('\n'),
    },
    {
      id: 'draft_landscape',
      narration: 'Drawing landscape features: fences, tree lines, drainage…',
      attachImages: true,
      task: [
        '**STAGE 4 OF 5 — DRAW LANDSCAPE FEATURES NOW**',
        '',
        'Draft the remaining natural / landscape linework:',
        '  FENCE / FNC          → fence lines (layer "FENCE")',
        '  TREELINE / WOODS / HEDGE → tree lines (layer "TREELINE")',
        '  WATER / DITCH / SWALE / CRK / SW → drainage (layer "DRAINAGE")',
        '  WALL / RW            → walls (layer "WALL")',
        '  UTIL / OH            → overhead utility runs (layer "UTIL")',
        '  WL / GAS             → underground mains (layer "UTIL-UNDERGROUND")',
        '  BND / MON / IRON     → boundary + monument ties (layer "BOUNDARY")',
        'TREE / VEG / TOPO / GR points get NO linework.',
        'Verify fence lines, tree lines, walls and drainage paths against the',
        'attached aerial imagery — vegetation edges and fence shadows are usually',
        'visible and settle ambiguous chaining.',
        imageryNote,
        'Output ONLY these feature lines this stage.',
      ].filter(Boolean).join('\n'),
    },
    {
      id: 'draft_labels',
      narration: 'Labeling trees, storm structure inverts and key features…',
      attachImages: true,
      task: [
        '**STAGE 5 OF 5 — DRAW CALLOUT LABELS NOW (FINAL STAGE)**',
        '',
        'Create NEW annotation points (layer stays default; description = label text)',
        'for every feature that needs a callout:',
        '• Trees: size + species from the point description (e.g. "24IN OAK").',
        '• Storm structures: rim + invert data parsed from descriptions',
        '  (e.g. "INLET RIM=529.31 INV=525.10").',
        '• Wells, utility poles with pole numbers, monuments found/set.',
        hasFloodZone ? '• Flood zone: one annotation noting the FEMA zone from the context.' : '',
        'Do NOT label roads or buildings — the app places street-name and building',
        'labels automatically after this stage. Do NOT assign symbols — the app',
        'resolves symbols from point descriptions automatically.',
        buildingReviewChecklist
          ? 'If any buildings were tagged with CONF=LOW, add one short review note per building (e.g. "REVIEW BLDG: verify west wall alignment") as annotation points near those footprints.'
          : '',
        'Use the attached aerial imagery to confirm feature identity and to place',
        'labels in clear (non-overlapping) spots.',
        imageryNote,
        'Place each label point offset ~10 ft from its feature so text does not',
        'overlap the symbol. Empty "lines" array this stage.',
      ].filter(Boolean).join('\n'),
    },
  ];
}

// ─── Main pipeline ─────────────────────────────────────────────────────────────
/** Conventional plan text for an OSM `building=` tag value. */
const BUILDING_TAG_LABEL: Record<string, string> = {
  house: 'DWELLING', residential: 'DWELLING', detached: 'DWELLING',
  semidetached_house: 'DWELLING', bungalow: 'DWELLING', cabin: 'CABIN',
  apartments: 'APARTMENT BLDG', garage: 'GARAGE', garages: 'GARAGE',
  carport: 'CARPORT', shed: 'SHED', barn: 'BARN', greenhouse: 'GREENHOUSE',
  commercial: 'COMMERCIAL BLDG', retail: 'COMMERCIAL BLDG', office: 'OFFICE BLDG',
  industrial: 'INDUSTRIAL BLDG', warehouse: 'WAREHOUSE', church: 'CHURCH',
  school: 'SCHOOL', hospital: 'HOSPITAL', hotel: 'HOTEL',
};

function buildingLabelText(tags: Record<string, string>): string {
  const t = (tags['building'] || '').toLowerCase();
  return BUILDING_TAG_LABEL[t] ?? 'BUILDING';
}

function ringCentroid(ring: { x: number; y: number }[]): { x: number; y: number } | null {
  if (ring.length === 0) return null;
  const x = ring.reduce((s, v) => s + v.x, 0) / ring.length;
  const y = ring.reduce((s, v) => s + v.y, 0) / ring.length;
  return { x, y };
}
export async function runAutoDraft(opts: AutoDraftOptions): Promise<void> {
  const { points, lines, jobInfo, zoningContext, projectEpsg, onPhaseUpdate, onDraft, onCanvasLines, onParcelResult, onStreetLabels, getCanvasLineCount } = opts;
  const config = opts.config ?? {};
  const src = config.sources ?? {};
  const wants = {
    parcels:    src.parcels    !== false,
    flood:      src.flood      !== false,
    soils:      src.soils      !== false,
    structures: src.structures !== false,
    staticMap:  src.staticMap  !== false,
  };
  const drawParcels = config.drawParcels !== false;
  const drawFlood   = config.drawFlood   !== false;
  const drawSoils   = config.drawSoils   !== false;

  const phases = makePhases();
  let jobBlock        = '';
  let pointBlock      = '';
  let aoiBlock        = '';
  let zoningBlock     = '';
  let parcelBlock     = '';
  let femaBlock       = '';
  let soilsBlock      = '';
  let structuresBlock = '';
  let mapBlock        = '';
  let roadContextBlock = '';
  const images: AutoDraftImage[] = [];
  let osmFootprints: BuildingFootprint[] = [];
  let nsiCentroids: SurveyPoint[] = [];
  let nsiAttrsByPointNumber: Record<string, NsiStructureProps> = {};

  const emit = () => onPhaseUpdate([...phases]);

  const update = (id: PhaseId, patch: Partial<OrchestratorPhase>) => {
    const i = phases.findIndex(p => p.id === id);
    if (i !== -1) phases[i] = { ...phases[i], ...patch };
    emit();
  };

  const start = (id: PhaseId, logLine?: string) =>
    update(id, { status: 'running', startedAt: Date.now(), log: logLine ? [logLine] : [] });

  const done = (id: PhaseId, summary: string, logLine?: string) => {
    const i = phases.findIndex(p => p.id === id);
    const prev = phases[i];
    update(id, { status: 'done', completedAt: Date.now(), summary, log: logLine ? [...prev.log, logLine] : prev.log });
  };

  const skip = (id: PhaseId, reason: string) =>
    update(id, { status: 'skipped', completedAt: Date.now(), summary: reason });

  const fail = (id: PhaseId, err: string) =>
    update(id, { status: 'error', completedAt: Date.now(), summary: err });

  const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

  // ── Phase 1: Job Information ──────────────────────────────────────────────────
  start('job_info', 'Reading session job info…');
  const { state, county, place, district } = zoningContext;
  if (jobInfo.jobName || jobInfo.jobNo) {
    jobBlock = [
      `Job Name:   ${jobInfo.jobName || '(not set)'}`,
      `Job Number: ${jobInfo.jobNo   || '(not set)'}`,
      state    ? `State: ${state}`                 : null,
      county   ? `County: ${county}`               : null,
      place    ? `Municipality: ${place}`           : null,
      district ? `Zoning District: ${district}`    : null,
    ].filter(Boolean).join('\n');
    done('job_info', jobInfo.jobName || jobInfo.jobNo, 'Loaded from session header.');
  } else {
    jobBlock = '(No job information set — fill in Job Info in the session header)';
    skip('job_info', 'No job info configured');
  }

  // ── Phase 2: Survey Points ──────────────────────────────────────────────────
  start('points', `Analyzing ${points.length} loaded point(s)…`);
  if (points.length > 0) {
    const groups = descriptionGroups(points);
    const topGroups = Object.entries(groups)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([k, v]) => `${k}×${v}`)
      .join(', ');
    const elevs = points.map(p => p.elevation ?? 0);
    const minElev = Math.min(...elevs).toFixed(2);
    const maxElev = Math.max(...elevs).toFixed(2);
    const ctr = centroid(points);

    // Full point table — the model needs coordinates + descriptions to decide
    // which existing points to chain into linework (stages reference them by number).
    const MAX_INLINE = 600; // cap for very large jobs; model context window limit
    const inlinePoints = points.slice(0, MAX_INLINE);
    const truncationNote = points.length > MAX_INLINE
      ? `\n(Showing first ${MAX_INLINE} of ${points.length} points — remaining points omitted from context)`
      : '';
    const pointTable = inlinePoints
      .map(p => `  PT ${p.pointNumber}: N=${p.northing.toFixed(3)} E=${p.easting.toFixed(3)} Z=${(p.elevation ?? 0).toFixed(3)} DESC="${p.description}"`)
      .join('\n');

    pointBlock = [
      `Total points:     ${points.length}`,
      `Total lines:      ${lines.length}`,
      `Elevation range:  ${minElev} ft – ${maxElev} ft`,
      `Description groups (top 12): ${topGroups}`,
      ctr ? `Survey centroid (State Plane): E=${ctr.easting.toFixed(2)}, N=${ctr.northing.toFixed(2)}` : null,
      '',
      'FULL POINT LISTING:',
      pointTable,
      truncationNote,
    ].filter(l => l !== null).join('\n');
    done('points', `${points.length} pts / ${lines.length} lines`, 'Point statistics + full table assembled.');
  } else {
    pointBlock = '(No survey points loaded — load a RAW file or enter points manually before running Auto Draft)';
    skip('points', 'No points loaded');
  }

  // ── Phase 3: Area of Interest ──────────────────────────────────────────────
  start('aoi', 'Resolving AOI (inclusion → shrinkwrap → extent → geocode)…');
  let aoi: AoiResult | null = null;
  if (config.aoiOverride) {
    aoi = config.aoiOverride;
    aoiBlock = aoi.summary;
    done('aoi', `${aoi.source} (pre-flight confirmed)`, aoi.summary);
  } else {
    try {
      const locationText = [place, county ? `${county} County` : null, state].filter(Boolean).join(', ');
      aoi = await resolveAoi({ points, lines, projectEpsg, locationText: locationText || undefined });
      aoiBlock = aoi.summary;
      done('aoi', `${aoi.source} · ${aoi.confidence} confidence`, aoi.summary);
    } catch (e) {
      aoiBlock = `(AOI could not be resolved: ${errMsg(e)} — GIS data connectors skipped)`;
      fail('aoi', errMsg(e));
    }
  }

  // ── Phase 4: Zoning Data (via CACP) ──────────────────────────────────────────
  start('zoning', 'Checking CACP cache, then querying Zoning Agent…');
  if (state && place) {
    const cacheKey = { state, county: county || '', municipality: place, district: district || '' };
    const cached = interAgentComm.getCachedResult('get_zoning_requirements', cacheKey);
    if (cached) {
      zoningBlock = formatZoningData(cached.data as Record<string, unknown>, zoningContext);
      done('zoning', `${district || 'default'} district (cached)`, 'Retrieved from CACP result cache.');
    } else {
      try {
        const resp = await interAgentComm.request(
          AgentType.CIVIL_DRAFTER,
          AgentType.ZONING_AGENT,
          'get_zoning_requirements',
          cacheKey,
          30_000
        );
        if (resp.success && resp.data) {
          zoningBlock = formatZoningData(resp.data as Record<string, unknown>, zoningContext);
          done('zoning', `${district || 'default'} district`, 'Fetched live via CACP.');
        } else {
          zoningBlock = `(Zoning query returned an error: ${resp.error ?? 'unknown'})`;
          fail('zoning', resp.error as string ?? 'Query error');
        }
      } catch (e) {
        const msg = errMsg(e);
        if (msg.includes('timeout') || msg.includes('No handler')) {
          zoningBlock = '(Zoning Agent unavailable — open the Zoning Agent tab and configure a location first, then re-run Auto Draft)';
          skip('zoning', 'Zoning Agent not active');
        } else {
          zoningBlock = `(Zoning lookup error: ${msg})`;
          fail('zoning', msg);
        }
      }
    }
  } else {
    zoningBlock = '(State and municipality not set — configure location in the Zoning Agent tab first)';
    skip('zoning', 'No location context configured');
  }

  // ── Phases 5–8: Parallel GIS data connectors ───────────────────────────────
  const epsg = projectEpsg ?? undefined;
  const bbox = aoi?.bboxWgs84 ?? null;

  const parcelsTask = async (): Promise<void> => {
    if (!wants.parcels) { parcelBlock = '(Parcels disabled in pre-flight)'; skip('parcels', 'Disabled'); return; }
    if (!bbox) { parcelBlock = '(No AOI — parcel query skipped)'; skip('parcels', 'No AOI'); return; }
    const service = findParcelService(county, state);
    if (!service) {
      parcelBlock = county
        ? `(No parcel GIS service registered for ${county} County${state ? ', ' + state : ''} — supported: ${PARCEL_GIS_SERVICES.map(s => s.label).join('; ')})`
        : '(County not set — configure location in the Zoning Agent tab to enable parcel fetch)';
      skip('parcels', county ? `${county} County not in registry` : 'No county set');
      return;
    }
    start('parcels', `Querying ${service.label} parcel fabric…`);
    try {
      const result: ParcelFetchResult = await fetchParcelsForBbox(
        service,
        { xmin: bbox[0], ymin: bbox[1], xmax: bbox[2], ymax: bbox[3] },
        epsg,
      );
      const sample = result.parcels.slice(0, 12)
        .map(p => `  • ${p.parcelId ?? '(no id)'}${p.owner ? ' — ' + p.owner : ''}${p.deedRef ? ' (' + p.deedRef + ')' : ''}`)
        .join('\n');
      parcelBlock = [
        `Source: ${service.label}`,
        `Parcels intersecting AOI: ${result.featureCount}${result.exceededTransferLimit ? ' (server truncated!)' : ''}`,
        result.parcels.length > 0 ? 'Parcel IDs / owners:' : null,
        sample || null,
        result.parcels.length > 12 ? `  …and ${result.parcels.length - 12} more` : null,
        drawParcels && onCanvasLines ? 'Parcel linework has been drawn to the canvas (layer COUNTY-PARCEL).' : null,
      ].filter(Boolean).join('\n');
      if (drawParcels && onCanvasLines && result.lines.length > 0) {
        onCanvasLines(result.lines, 'COUNTY-PARCEL');
      }
      if (drawParcels && onParcelResult && result.featureCount > 0) {
        // Hand the full result to the app so parcel ID / owner / deed-ref
        // labels render via the existing parcelLabels pipeline.
        onParcelResult(result);
      }
      done('parcels', `${result.featureCount} parcels`, `${result.lines.length} line segments${drawParcels && onCanvasLines ? ' drawn to canvas' : ''}.`);
    } catch (e) {
      parcelBlock = `(Parcel fetch failed: ${errMsg(e)})`;
      fail('parcels', errMsg(e));
    }
  };

  const femaTask = async (): Promise<void> => {
    if (!wants.flood) { femaBlock = '(Flood data disabled in pre-flight)'; skip('fema', 'Disabled'); return; }
    if (!bbox) { femaBlock = '(No AOI — flood query skipped)'; skip('fema', 'No AOI'); return; }
    start('fema', 'Querying FEMA NFHL flood hazard layer…');
    try {
      const result: FloodFetchResult = await fetchFemaFloodHazards(bbox, epsg);
      const zones = Object.entries(result.zoneCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([z, n]) => `${z}×${n}`)
        .join(', ');
      const sfha = Object.keys(result.zoneCounts).some(z => /^(A|AE|AH|AO|AR|A99|V|VE)$/i.test(z));
      femaBlock = result.featureCount > 0
        ? [
            `Flood zones intersecting AOI: ${zones}`,
            sfha ? '⚠ SPECIAL FLOOD HAZARD AREA (SFHA) present — annotate flood zone boundary on plan.'
                 : 'No SFHA zones — site appears to be Zone X (minimal flood hazard).',
            drawFlood && onCanvasLines ? 'Flood-zone linework has been drawn to the canvas (layers FEMA-FLOOD-*).' : null,
          ].filter(Boolean).join('\n')
        : 'No FEMA flood hazard polygons intersect the AOI (unmapped or minimal-hazard area).';
      if (drawFlood && onCanvasLines && result.lines.length > 0) {
        onCanvasLines(result.lines, 'FEMA-FLOOD');
      }
      done('fema', result.featureCount > 0 ? zones : 'No mapped hazard', `${result.featureCount} polygons.`);
    } catch (e) {
      femaBlock = `(FEMA flood fetch failed: ${errMsg(e)} — verify manually at msc.fema.gov)`;
      fail('fema', errMsg(e));
    }
  };

  const soilsTask = async (): Promise<void> => {
    if (!wants.soils) { soilsBlock = '(Soils disabled in pre-flight)'; skip('soils', 'Disabled'); return; }
    if (!bbox) { soilsBlock = '(No AOI — soils query skipped)'; skip('soils', 'No AOI'); return; }
    start('soils', 'Querying USDA SSURGO Soil Data Access…');
    try {
      const result: SoilsFetchResult = await fetchSsurgoSoils(bbox, epsg);
      const drewSoils = drawSoils && !!onCanvasLines && result.lines.length > 0;
      soilsBlock = result.mapUnits.length > 0
        ? [
            getSoilsContextString(result.mapUnits),
            drewSoils ? 'Soil boundary linework has been drawn to the canvas (layers SOILS-*).' : null,
          ].filter(Boolean).join('\n')
        : 'No SSURGO soil map units intersect the AOI.';
      if (drewSoils) {
        onCanvasLines!(result.lines, 'SOILS');
      }
      done('soils', `${result.mapUnits.length} map units`, `${result.featureCount} polygons${drewSoils ? ` · ${result.lines.length} segments drawn to canvas` : ''}.`);
    } catch (e) {
      soilsBlock = `(Soils fetch failed: ${errMsg(e)})`;
      fail('soils', errMsg(e));
    }
  };

  const structuresTask = async (): Promise<void> => {
    if (!wants.structures) { structuresBlock = '(Structures disabled in pre-flight)'; skip('structures', 'Disabled'); return; }
    if (!bbox) { structuresBlock = '(No AOI — structures query skipped)'; skip('structures', 'No AOI'); return; }
    start('structures', 'Querying FEMA NSI structure inventory…');
    try {
      const nsi: StructuresFetchResult = await fetchNsiStructures(bbox, epsg);
      nsiCentroids = nsi.points;
      nsiAttrsByPointNumber = nsi.attrsByPointNumber;
      if (nsi.featureCount > 0) {
        const cats = Object.entries(nsi.categoryCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([c, n]) => `${c}×${n}`)
          .join(', ');
        structuresBlock = [
          `FEMA NSI structures in AOI: ${nsi.featureCount}`,
          `Categories: ${cats}`,
          'Use these to sanity-check BLDG point groupings — every NSI structure should correspond to a building footprint if survey shots exist.',
        ].join('\n');
        // Best-effort OSM footprint geometry for the buildings draft stage (NSI is points-only).
        try {
          const osm = await fetchOsmBuildings(bbox, epsg);
          osmFootprints = osm.buildings;
        } catch { /* footprint reference is optional */ }
        done('structures', `${nsi.featureCount} structures (NSI)`, cats);
      } else {
        // OSM fallback — NSI coverage is spotty in rural areas.
        const cur = phases.find(p => p.id === 'structures');
        update('structures', { log: [...(cur?.log ?? []), 'NSI empty — falling back to OpenStreetMap…'] });
        const osm = await fetchOsmBuildings(bbox, epsg);
        osmFootprints = osm.buildings;
        structuresBlock = osm.buildings.length > 0
          ? `OpenStreetMap building footprints in AOI: ${osm.buildings.length} (FEMA NSI had no coverage here).`
          : 'No structures found in FEMA NSI or OpenStreetMap for this AOI.';
        done('structures', `${osm.buildings.length} buildings (OSM fallback)`, 'NSI returned 0; used Overpass.');
      }
    } catch (e) {
      structuresBlock = `(Structures fetch failed: ${errMsg(e)})`;
      fail('structures', errMsg(e));
    }
  };

  await Promise.allSettled([parcelsTask(), femaTask(), soilsTask(), structuresTask()]);

  // ── Phase 9: Static map imagery ────────────────────────────────────────────
  if (!wants.staticMap) {
    mapBlock = '(Aerial imagery disabled in pre-flight)';
    skip('static_map', 'Disabled');
  } else if (!bbox) {
    mapBlock = '(No AOI — aerial imagery skipped)';
    skip('static_map', 'No AOI');
  } else {
    start('static_map', 'Fetching NAIP + satellite + roadmap tiles…');
    try {
      const lat = (bbox[1] + bbox[3]) / 2;
      const lng = (bbox[0] + bbox[2]) / 2;
      const zoom = zoomForBbox(bbox);
      const keys = config.mapKeys ?? {};
      const [naip, sat, road] = await Promise.allSettled([
        getStaticMap({ lat, lng, zoom, maptype: 'naip' }, keys),
        getStaticMap({ lat, lng, zoom, maptype: 'satellite' }, keys),
        getStaticMap({ lat, lng, zoom: Math.max(12, zoom - 1), maptype: 'roadmap' }, keys),
      ]);
      const sources = new Set<string>();
      if (naip.status === 'fulfilled') {
        images.push({ mimeType: naip.value.mimeType, data: naip.value.base64, label: `NAIP aerial imagery @ zoom ${zoom}` });
        sources.add(naip.value.source);
      }
      if (sat.status === 'fulfilled') {
        images.push({ mimeType: sat.value.mimeType, data: sat.value.base64, label: `Satellite imagery @ zoom ${zoom}` });
        sources.add(sat.value.source);
      }
      if (road.status === 'fulfilled') {
        images.push({ mimeType: road.value.mimeType, data: road.value.base64, label: `Road map @ zoom ${Math.max(12, zoom - 1)}` });
        sources.add(road.value.source);
      }
      if (images.length > 0) {
        mapBlock = [
          `Attached: ${images.map(i => i.label).join(' + ')} centered on ${lat.toFixed(6)}, ${lng.toFixed(6)}.`,
          'Cross-reference aerial imagery against BLDG/EP point groups for spatial validation.',
        ].join('\n');
        done('static_map', `${images.length} image(s) via ${[...sources].join(', ')}`, images.map(i => i.label).join('; '));
      } else {
        const why = naip.status === 'rejected' ? errMsg(naip.reason)
          : sat.status === 'rejected' ? errMsg(sat.reason)
          : road.status === 'rejected' ? errMsg(road.reason)
          : 'unknown';
        mapBlock = `(Map imagery unavailable: ${why})`;
        skip('static_map', `No map source available — ${why}`);
      }
    } catch (e) {
      mapBlock = `(Map imagery failed: ${errMsg(e)})`;
      fail('static_map', errMsg(e));
    }
  }

  // ── Phase 10: Assemble Context ─────────────────────────────────────────────
  start('assemble', 'Building assembled context prompt…');
  roadContextBlock = buildRoadContextBlock({
    roadLabels: (opts as { roadLabels?: StreetLabel[] }).roadLabels,
    parcelExtents: (opts as { parcelExtents?: RoadContextParcelExtent[] }).parcelExtents,
  });
  const contextPrompt = buildContextPrompt({
    jobBlock, pointBlock, aoiBlock, zoningBlock, parcelBlock,
    femaBlock, soilsBlock, structuresBlock, mapBlock,
  });
  const stages = buildDraftStages({
    hasImagery: images.length > 0,
    footprints: osmFootprints,
    femaBlock,
    buildingReviewChecklist: config.buildingReviewChecklist !== false,
  });
  done('assemble', `~${Math.round(contextPrompt.length / 100) * 100} chars · ${stages.length} draft stages`, 'Context ready — starting staged drafting.');

  // ── Phases 11–15: Staged drafting — sequential, each awaits the model ──────
  if (points.length === 0) {
    for (const s of stages) skip(s.id, 'No survey points loaded');
  } else {
    let contextSent = false;
    for (const stage of stages) {
      start(stage.id, stage.narration);
      if (stage.id === 'draft_buildings') {
        const bldgPoints = points.filter((p: SurveyPoint) =>
          (p.description?.toUpperCase().includes('BLDG') || (p.layer ?? '').toUpperCase().includes('BLDG'))
        );
        const hasStructuresInputs = bldgPoints.length > 0 || nsiCentroids.length > 0 || osmFootprints.length > 0;
        if (hasStructuresInputs && onCanvasLines) {
          try {
            const epsgNum = Number(projectEpsg ?? 0);
            // Conservative heuristic: common meter-based CRSs (Web Mercator + UTM + NAD83 UTM)
            // need feet->units conversion at 0.3048. Unknown CRSs default to feet.
            const unitsPerFoot = (
              epsgNum === 3857 ||
              (epsgNum >= 32601 && epsgNum <= 32760) ||
              (epsgNum >= 26901 && epsgNum <= 26960)
            ) ? 0.3048 : 1;

            const rectified = rectifyBuildings({
              bldgPoints,
              osmFootprints,
              nsiCentroids,
              nsiAttrs: nsiAttrsByPointNumber,
              options: { unitsPerFoot, layer: 'STRUCTURES' },
            });

            onCanvasLines(rectified.lines, 'STRUCTURES');
            contextSent = true;
            const stats = rectified.stats;
            const chunks: string[] = [];
            if (stats.osmSnapped) chunks.push(`${stats.osmSnapped} snapped`);
            if (stats.osmAsIs) chunks.push(`${stats.osmAsIs} OSM as-is`);
            if (stats.cogoMer) chunks.push(`${stats.cogoMer} MER`);
            if (stats.cogo3) chunks.push(`${stats.cogo3} COGO-3pt`);
            if (stats.cogo2) chunks.push(`${stats.cogo2} COGO-2pt`);
            if (stats.cogo1) chunks.push(`${stats.cogo1} COGO-1pt`);
            if (stats.nsiOnly) chunks.push(`${stats.nsiOnly} NSI-only`);
            done(
              stage.id,
              rectified.lines.length > 0
                ? `+${rectified.lines.length} line(s) via Structures rectifier ✓`
                : 'Structures pass complete ✓',
              chunks.length > 0 ? `Deterministic Structures pass: ${chunks.join(', ')}.` : 'Deterministic Structures pass executed.'
            );
            continue;
          } catch (e) {
            const cur = phases.find(p => p.id === stage.id);
            update(stage.id, {
              log: [...(cur?.log ?? []), `Deterministic Structures pass failed — falling back to model stage: ${errMsg(e)}`],
            });
          }
        }
      }
      const prompt = [
        contextSent ? '' : contextPrompt,   // full context rides with the first stage only
        stage.id === 'draft_roads' ? roadContextBlock : '',
        stage.task,
        '',
        STAGE_OUTPUT_RULES,
      ].filter(Boolean).join('\n\n');
      const stageImages = stage.attachImages && images.length > 0 ? images : undefined;
      const before = getCanvasLineCount?.() ?? null;
      try {
        await onDraft(prompt, stageImages);
        contextSent = true;
        // Let React flush state → linesRef before measuring the delta.
        await new Promise(r => setTimeout(r, 80));
        const after = getCanvasLineCount?.() ?? null;
        const added = before !== null && after !== null ? after - before : null;
        done(
          stage.id,
          added !== null && added > 0 ? `+${added} line(s) ✓` : 'Stage complete ✓',
          added !== null && added > 0 ? `${added} segment(s) added to canvas.` : 'Model response processed.'
        );
      } catch (e) {
        fail(stage.id, errMsg(e));
        contextSent = true; // context reached the chat even if processing failed
      }
    }
  }

  // ── Phase 16: Road + building labels — DETERMINISTIC (reuses street-label pipeline) ──
  if (config.labelRoadsAndBuildings === false) {
    skip('street_labels', 'Disabled in pre-flight');
  } else if (!onStreetLabels) {
    skip('street_labels', 'No label sink wired');
  } else if (!bbox) {
    skip('street_labels', 'No AOI — street-name lookup skipped');
  } else {
    start('street_labels', 'Fetching OSM street names + labeling building footprints…');
    const labels: StreetLabel[] = [];
    let roadCount = 0;
    try {
      const { fetchStreetLabels } = await import('../services/streetNameService.ts');
      const roads = await fetchStreetLabels(bbox, epsg);
      roadCount = roads.length;
      labels.push(...roads);
    } catch (e) {
      const cur = phases.find(p => p.id === 'street_labels');
      update('street_labels', { log: [...(cur?.log ?? []), `Street names unavailable: ${errMsg(e)}`] });
    }
    let bldgCount = 0;
    for (const fp of osmFootprints) {
      const c = ringCentroid(fp.ring);
      if (!c) continue;
      labels.push({ x: c.x, y: c.y, text: buildingLabelText(fp.tags), angle: 0 });
      bldgCount++;
    }
    if (labels.length > 0) {
      onStreetLabels(labels);
      done(
        'street_labels',
        `${roadCount} road + ${bldgCount} building label(s) ✓`,
        'Labels placed via the existing street-label canvas pipeline.'
      );
    } else {
      skip('street_labels', 'No named roads or building footprints found');
    }
  }

  // ── Phase 17: Symbols — DETERMINISTIC (descriptions resolve symbols automatically) ──
  const cov = config.symbolCoverage;
  if (!cov || cov.total === 0) {
    skip('symbols', 'Symbols render automatically from point descriptions');
  } else {
    start('symbols', 'Checking description → symbol coverage…');
    if (cov.unmatched.length === 0) {
      done('symbols', `${cov.matched}/${cov.total} points have symbols ✓`, 'All field codes resolve to a symbol (custom symbols / CAD standard / team codes).');
    } else {
      const worst = cov.unmatched.slice(0, 8).map(u => `${u.code}×${u.count}`).join(', ');
      done(
        'symbols',
        `${cov.matched}/${cov.total} matched · ${cov.unmatched.length} code(s) unmapped`,
        `No symbol for: ${worst}${cov.unmatched.length > 8 ? ', …' : ''} — map them in CAD Standards → Team Codes or the Symbol Manager.`
      );
    }
  }

  // ── Phase 18: Contours — DETERMINISTIC (reuses the app's contour pipelines) ──
  const contourChoice = config.contours ?? 'none';
  const measureDelta = async (run: () => void | Promise<void>): Promise<number | null> => {
    const before = getCanvasLineCount?.() ?? null;
    await run();
    // Let React flush setLines → linesRef before measuring.
    await new Promise(r => setTimeout(r, 120));
    const after = getCanvasLineCount?.() ?? null;
    return before !== null && after !== null ? after - before : null;
  };
  if (contourChoice === 'none') {
    skip('contours', 'Not requested in pre-flight');
  } else if (contourChoice === 'points') {
    if (!opts.onGenerateContours) {
      skip('contours', 'No contour generator wired');
    } else if (points.length < 3) {
      skip('contours', 'Fewer than 3 survey points — cannot triangulate');
    } else {
      start('contours', 'Generating contours from survey points…');
      try {
        const added = await measureDelta(() => opts.onGenerateContours!());
        if (added !== null && added > 0) {
          done('contours', `+${added} contour segment(s) ✓`, 'Generated from survey points via the existing contour pipeline.');
        } else {
          done('contours', 'Contour generation ran', 'No new segments detected — check point elevations / contour settings.');
        }
      } catch (e) { fail('contours', errMsg(e)); }
    }
  } else { // 'gis'
    if (!opts.onFetchGisContours) {
      skip('contours', 'No GIS contour source wired');
    } else {
      start('contours', 'Fetching published GIS contours clipped to the site…');
      try {
        const added = await measureDelta(() => opts.onFetchGisContours!(zoningContext));
        if (added !== null && added > 0) {
          done('contours', `+${added} GIS contour segment(s) ✓`, 'Fetched via the ESRI contour pipeline, clipped to the survey extent.');
        } else {
          done('contours', 'GIS contour fetch complete', 'No new segments detected — the service may have no coverage here.');
        }
      } catch (e) { fail('contours', errMsg(e)); }
    }
  }

  // ── Phase 19: Steep slopes — DETERMINISTIC (TIN → slope bands) ─────────────
  if (!config.steepSlopes) {
    skip('slopes', 'Not requested in pre-flight');
  } else if (!opts.onSteepSlopes) {
    skip('slopes', 'No steep-slope pipeline wired');
  } else {
    start('slopes', 'Building TIN + classifying slope bands (0–15 / 15–30 / 30+ %)…');
    try {
      const res = await opts.onSteepSlopes();
      if (res && typeof res === 'object') {
        done('slopes', `${res.kept}/${res.analyzed} triangle(s) in kept bands ✓`, 'Slope bands drawn on layers SS_0_15 / SS_15_30 / SS_30_PLUS.');
      } else {
        done('slopes', 'Steep-slope bands drawn ✓', 'Slope bands drawn via the steep-slope pipeline.');
      }
    } catch (e) { fail('slopes', errMsg(e)); }
  }
}
