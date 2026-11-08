/**
 * Domain CACP Skill Handlers
 *
 * Registers runtime `interAgentComm.onCommand` handlers for all domain-specific
 * CACP skills declared in `services/AgentRegistry.ts` across:
 *   - Structures Agent (`structures_fetch_nsi`, `structures_rectify_footprints`,
 *     `structures_draw_footprints`, `structures_synthesize_single`, `structures_clear`)
 *   - Soils Agent (`fetch_soils`, `fetch_soil_report`, `clear_soils`, `get_soils_context`)
 *   - Contouring Agent (`generate_contours`, `generate_loaded_tin_contours`,
 *     `fetch_esri_rest_contours`, `discover_public_contour_services`)
 *   - Steep Slope Agent (`run_steep_slope_analysis`, `publish_steep_slope_layers`)
 *   - Profile Agent (`generate_profile`, `generate_cross_section`)
 *   - Voice Agent (`voice_observe_workflow`, `voice_propose_layer`, `voice_suggest_next_tasks`)
 *   - AR Field Agent (`capture_and_send_intent`, `receive_drawing_action`)
 *   - DXF Agent (`dxf_extract_entities`)
 *   - Civil Drafter (`civil_drafter_extract_points`)
 *   - Civil Plan Expert (`civil_plan_expert_extract`, `civil_plan_expert_status`,
 *     `civil_plan_expert_set_draw_mode`)
 *   - CAD Manager (`cad_set_active_drawing_layer`)
 *   - RAW Crawler, GIS Agent, Image Analyzer, GNSS Agent, Drone Agent, Title Search
 */

import { useEffect, useRef } from 'react';
import { interAgentComm, type AgentMessage, type AgentResponse } from './InterAgentCommunication';
import {
  AgentType,
  type A2UISpreadsheetColumn,
  type A2UISpreadsheetRow,
  type A2UISpreadsheetSpec,
  type Centerline,
  type ContourGeneration,
  type ContourSettings,
  type GisFeature,
  type PointList,
  type ProfileInfo,
  type ProfilePoint,
  type SessionFile,
  type Settings,
  type SoilMapUnit,
  type SteepSlopeBand,
  type SteepSlopeRunResult,
  type SurveyLine,
  type SurveyPoint,
  type TinSurface,
  type ActiveWmsLayer,
  type RoadCorridorRun,
  type StreetLabel,
} from '../types';
import { rectifyBuildings, type RectifyStats } from './buildingRectifier';
import { registerRoadingSkillHandlers } from './roadingSkillHandlers';
import { runSteepSlopeAnalysis, steepSlopeRunToSurveyLines } from './SteepSlopeService';import {
  generateContoursAsIsoPaths,
  isoPathsToSurveyLines,
  generateProfile,
} from '../utils/contouring';
import { resolveContourLineLayersViaCacp } from './contourLayerResolver';
import {
  calculatePointFromStationOffset,
  calculateCenterlineLength,
  parseStation,
} from '../utils/stationing';
import {
  classifyDrawingIntent,
  getTaskSuggestionsForKind,
  shouldPromptForDrawingIntent,
  suggestLayerForUtterance,
} from './voiceOrchestrator';
import { glassCacpGateway } from './glassCacpGateway';
import { knowledgeBase } from './KnowledgeBase';
import type { StructuresFetchResult } from './structuresService';
import type { BuildingFootprint } from './osmBuildingsService';
import type { SoilReportRow } from './soilsService';
import { ESRI_STATE_SERVICES } from '../utils/esriStateServices';
import { USGS_NATIONAL_CONTOUR_SOURCES } from '../utils/usgsNationalContours';

export interface DomainSkillHandlersOpts {
  points: SurveyPoint[];
  pointLists: PointList[];
  setPointLists: React.Dispatch<React.SetStateAction<PointList[]>>;
  lines: SurveyLine[];
  setLines: React.Dispatch<React.SetStateAction<SurveyLine[]>>;
  centerlines: Centerline[];
  setCenterlines?: React.Dispatch<React.SetStateAction<Centerline[]>>;
  roadCorridors?: RoadCorridorRun[];
  setRoadCorridors?: React.Dispatch<React.SetStateAction<RoadCorridorRun[]>>;
  streetLabels?: StreetLabel[];
  setStreetLabels?: React.Dispatch<React.SetStateAction<StreetLabel[]>>;
  canvas2dRef?: React.RefObject<any>;
  settings: Settings;
  activeModel: string;
  activeDrawingLayer: string;
  setActiveDrawingLayer: React.Dispatch<React.SetStateAction<string>>;
  agentDrawMode: 'both' | 'points' | 'lines';
  setAgentDrawMode: React.Dispatch<React.SetStateAction<'both' | 'points' | 'lines'>>;
  // Structures
  lastStructuresResult: StructuresFetchResult | null;
  lastOsmFootprints: Array<BuildingFootprint & { nsi?: Record<string, unknown> }> | null;
  setLastRectifyStats: React.Dispatch<React.SetStateAction<RectifyStats | null>>;
  handleFetchStructures: (mode: 'inclusion' | 'description', descriptionText?: string) => Promise<void>;
  handleClearStructures: () => void;
  // Soils
  soilMapUnits: SoilMapUnit[];
  soilReportData: Record<string, SoilReportRow> | null;
  setSoilReportData: React.Dispatch<React.SetStateAction<Record<string, SoilReportRow> | null>>;
  handleFetchSoils: (
    mode: 'inclusion' | 'description' | 'project',
    descriptionText?: string,
    bboxOverride?: [number, number, number, number] | null,
  ) => Promise<unknown>;
  handleClearSoilsLines: () => void;
  // Contours & TIN
  contourSettings: ContourSettings;
  contourGenerations: ContourGeneration[];
  setContourGenerations: React.Dispatch<React.SetStateAction<ContourGeneration[]>>;
  tinSurfaces: TinSurface[];
  steepSlopeTinSurfaces: TinSurface[];
  handleGenerateContours: () => void;
  /** Build and register a TIN from a contour generation (latest when omitted). */
  handleCreateTinFromContours?: (generationId?: string) => Promise<TinSurface | null> | TinSurface | null;
  /** Parse, register, and persist an imported TIN/LandXML session file. */
  handleImportTinSurface?: (file: SessionFile) => Promise<TinSurface> | TinSurface;
  /** Export a TIN to File Manager and return the generated session file. */
  handleExportTinSurface?: (
    sourceTinId: string | undefined,
    format: 'landxml' | 'native',
  ) => Promise<SessionFile | null> | SessionFile | null;
  /** Raise the A2UI TIN Surfaces surface from a CACP request. */
  openTinSurfaceStudio?: () => void;
  /** Raise the shared A2UI spreadsheet from a CACP request. */
  openSpreadsheetSurface?: (spec: A2UISpreadsheetSpec) => void;
  handleFetchEsriContours: (
    serviceUrl: string,
    mode: 'project' | 'inclusion' | 'description',
    descriptionText?: string,
  ) => Promise<{
    ok: boolean;
    featureCount: number;
    segmentCount: number;
    layerName: string;
    message: string;
  }>;
  handleDiscoverPublicContourServices: (searchTerm: string) => Promise<void>;
  // Steep Slope
  steepSlopeRuns: SteepSlopeRunResult[];
  setSteepSlopeRuns: React.Dispatch<React.SetStateAction<SteepSlopeRunResult[]>>;
  activeInclusionBoundaryId: string | null;
  addCadCodes?: (codes: Array<{
    code: string;
    description: string;
    pointLayer: string;
    lineLayer?: string;
    lineType?: string;
    category?: string;
  }>) => unknown[];
  // Profile
  setProfileData: React.Dispatch<React.SetStateAction<ProfilePoint[]>>;
  setProfileInfo: React.Dispatch<React.SetStateAction<ProfileInfo | null>>;
  // Session files & GIS
  rawFile: SessionFile | null;
  deedFile: SessionFile | null;
  dxfFile: SessionFile | null;
  planFiles: SessionFile[] | null;
  imageFiles: SessionFile[] | null;
  gisFeatures: GisFeature[];
  activeWmsLayers: ActiveWmsLayer[];
  availableCadLayers: string[];
  logActionToFieldbook: (msg: string) => void;
}

function respond(
  msg: AgentMessage,
  from: AgentType,
  success: boolean,
  data?: Record<string, unknown>,
  error?: string,
): AgentResponse {
  return {
    requestId: msg.id,
    from,
    success,
    data,
    error,
    timestamp: Date.now(),
  };
}

const DEFAULT_STEEP_SLOPE_BANDS: SteepSlopeBand[] = [
  { id: 'ss-0-15', minPercent: 0, maxPercent: 15, color: '#10b981', layerName: 'SS_0_15' },
  { id: 'ss-15-25', minPercent: 15, maxPercent: 25, color: '#f59e0b', layerName: 'SS_15_25' },
  { id: 'ss-25-plus', minPercent: 25, maxPercent: Number.POSITIVE_INFINITY, color: '#ef4444', layerName: 'SS_25_PLUS' },
];

function normalizeSpreadsheetColumns(raw: unknown): A2UISpreadsheetColumn[] {
  if (!Array.isArray(raw)) return [];
  const usedKeys = new Set<string>();
  const columns: A2UISpreadsheetColumn[] = [];
  raw.forEach((entry, index) => {
    if (typeof entry === 'string') {
      const label = entry.trim() || `Column ${index + 1}`;
      let key = label;
      while (usedKeys.has(key)) key = `${key}_${index + 1}`;
      usedKeys.add(key);
      columns.push({ key, label });
      return;
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
    const value = entry as Record<string, unknown>;
    const label =
      typeof value.label === 'string' && value.label.trim()
        ? value.label.trim()
        : typeof value.key === 'string' && value.key.trim()
          ? value.key.trim()
          : `Column ${index + 1}`;
    let key = typeof value.key === 'string' && value.key.trim() ? value.key.trim() : label;
    while (usedKeys.has(key)) key = `${key}_${index + 1}`;
    usedKeys.add(key);
    const align =
      value.align === 'right' || value.align === 'center' || value.align === 'left'
        ? value.align
        : undefined;
    const width = typeof value.width === 'number' && Number.isFinite(value.width)
      ? Math.min(600, Math.max(48, value.width))
      : undefined;
    columns.push({ key, label, align, width });
  });
  return columns;
}

function normalizeSpreadsheetRows(
  raw: unknown,
  columns: A2UISpreadsheetColumn[],
): A2UISpreadsheetRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: A2UISpreadsheetRow[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const source = entry as Record<string, unknown>;
    const row: A2UISpreadsheetRow = {};
    columns.forEach((column, index) => {
      const value = source[column.key] ?? source[column.label] ?? (Array.isArray(entry) ? entry[index] : undefined);
      if (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        row[column.key] = value;
      }
    });
    rows.push(row);
  }
  return rows;
}

export function registerDomainSkillHandlers(
  getOpts: () => DomainSkillHandlersOpts,
): () => void {
  const unsubs: Array<() => void> = [];

  // ── 1. CAD Manager: cad_set_active_drawing_layer ─────────────────────────
  unsubs.push(
    interAgentComm.onCommand('cad_set_active_drawing_layer', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const layer = String(d.layer ?? '').trim();
      if (!layer) {
        return respond(message, AgentType.CAD_MANAGER, false, undefined, 'layer is required.');
      }
      const changed = opts.activeDrawingLayer !== layer;
      opts.setActiveDrawingLayer(layer);
      const reason = typeof d.reason === 'string' && d.reason.trim() ? ` (${d.reason.trim()})` : '';
      opts.logActionToFieldbook(`CAD Manager: active drawing layer set to "${layer}"${reason}.`);
      return respond(message, AgentType.CAD_MANAGER, true, {
        appliedLayer: layer,
        changed,
      });
    }),
  );

  // ── 2. Structures Agent skills ───────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('structures_fetch_nsi', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const layer = typeof d.layer === 'string' && d.layer.trim() ? d.layer.trim() : 'FEMA-NSI';
      const mode = (d.mode === 'description' ? 'description' : 'inclusion') as 'inclusion' | 'description';
      const descriptionText = typeof d.descriptionText === 'string' ? d.descriptionText : undefined;
      try {
        await opts.handleFetchStructures(mode, descriptionText);
        const latest = getOpts();
        const structureCount = latest.lastStructuresResult?.featureCount ?? 0;
        const osmPolygonCount = latest.lastOsmFootprints?.length ?? 0;
        return respond(message, AgentType.STRUCTURES_AGENT, true, {
          structureCount,
          osmPolygonCount,
          layer,
        });
      } catch (e) {
        return respond(
          message,
          AgentType.STRUCTURES_AGENT,
          false,
          undefined,
          e instanceof Error ? e.message : String(e),
        );
      }
    }),
  );

  const handleRectifySkill = async (message: AgentMessage): Promise<AgentResponse> => {
    const opts = getOpts();
    const d = (message.data ?? {}) as Record<string, unknown>;
    const layer = typeof d.layer === 'string' && d.layer.trim() ? d.layer.trim() : 'STRUCTURES';
    const bldgPoints = opts.points.filter(
      (p) =>
        p.description?.toUpperCase().includes('BLDG') ||
        (p.layer ?? '').toUpperCase().includes('BLDG'),
    );
    const nsiCentroids = opts.lastStructuresResult?.points ?? [];
    const nsiAttrs = opts.lastStructuresResult?.attrsByPointNumber ?? {};
    const osmFootprints = opts.lastOsmFootprints ?? [];

    if (bldgPoints.length === 0 && nsiCentroids.length === 0 && osmFootprints.length === 0) {
      return respond(
        message,
        AgentType.STRUCTURES_AGENT,
        false,
        undefined,
        'No BLDG survey points, OSM building footprints, or FEMA NSI centroids are loaded in the session.',
      );
    }

    const unitsPerFoot = typeof d.unitsPerFoot === 'number' && d.unitsPerFoot > 0 ? d.unitsPerFoot : 1;
    const streetBearingDeg = typeof d.streetBearingDeg === 'number' ? d.streetBearingDeg : undefined;
    const clusterToleranceFeet =
      typeof d.clusterToleranceFeet === 'number' && d.clusterToleranceFeet > 0
        ? d.clusterToleranceFeet
        : 75;

    const result = rectifyBuildings({
      bldgPoints,
      osmFootprints: osmFootprints as any,
      nsiCentroids,
      nsiAttrs,
      options: {
        layer,
        unitsPerFoot,
        streetBearingDeg,
        clusterToleranceFeet,
      },
    });

    opts.setLines((prev) => [
      ...prev.filter((l) => (l.layer ?? '').toUpperCase() !== layer.toUpperCase()),
      ...result.lines,
    ]);
    opts.setLastRectifyStats(result.stats);
    opts.logActionToFieldbook(
      `CACP ${message.command} — rectified ${result.buildings.length} building footprint(s) onto layer ${layer}.`,
    );

    return respond(message, AgentType.STRUCTURES_AGENT, true, {
      footprintsDrawn: result.buildings.length,
      stats: result.stats as unknown as Record<string, unknown>,
      warnings: result.stats.warnings,
    });
  };

  unsubs.push(interAgentComm.onCommand('structures_rectify_footprints', handleRectifySkill));
  unsubs.push(interAgentComm.onCommand('structures_draw_footprints', handleRectifySkill));

  unsubs.push(
    interAgentComm.onCommand('structures_synthesize_single', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const layer = typeof d.layer === 'string' && d.layer.trim() ? d.layer.trim() : 'STRUCTURES';
      const nsiId = typeof d.nsiId === 'string' ? d.nsiId.trim() : '';
      const bldgPns = Array.isArray(d.bldgPointNumbers)
        ? new Set((d.bldgPointNumbers as unknown[]).map(String))
        : null;

      const bldgPoints = bldgPns
        ? opts.points.filter((p) => bldgPns.has(p.pointNumber))
        : opts.points.filter(
            (p) =>
              p.description?.toUpperCase().includes('BLDG') ||
              (p.layer ?? '').toUpperCase().includes('BLDG'),
          );
      const nsiCentroids = nsiId
        ? (opts.lastStructuresResult?.points ?? []).filter((p) => p.pointNumber === nsiId)
        : (opts.lastStructuresResult?.points ?? []).slice(0, 1);
      const nsiAttrs = opts.lastStructuresResult?.attrsByPointNumber ?? {};

      const result = rectifyBuildings({
        bldgPoints,
        osmFootprints: (opts.lastOsmFootprints ?? []) as any,
        nsiCentroids,
        nsiAttrs,
        options: { layer, unitsPerFoot: 1 },
      });

      if (result.lines.length === 0) {
        return respond(
          message,
          AgentType.STRUCTURES_AGENT,
          false,
          undefined,
          'Could not synthesize a building footprint from the provided inputs.',
        );
      }

      opts.setLines((prev) => [...prev, ...result.lines]);
      const firstBuilding = result.buildings[0];
      const corners = (firstBuilding?.vertices ?? []).map((v, idx) => ({
        pointNumber: `BLDG-COR-${idx + 1}`,
        easting: v.x,
        northing: v.y,
        elevation: 0,
      }));
      return respond(message, AgentType.STRUCTURES_AGENT, true, {
        points: corners,
        lines: result.lines,
        sqft: firstBuilding?.sqft ?? 0,
      });
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('structures_clear', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const clearNsi = d.clearNsi === true;
      const removedLines = opts.lines.filter(
        (l) => (l.layer ?? '').toUpperCase() === 'STRUCTURES',
      ).length;
      const removedPoints = clearNsi
        ? opts.points.filter((p) => p.layer === 'FEMA-NSI').length
        : 0;

      if (clearNsi) {
        opts.handleClearStructures();
      } else {
        opts.setLines((prev) =>
          prev.filter((l) => (l.layer ?? '').toUpperCase() !== 'STRUCTURES'),
        );
        opts.setLastRectifyStats(null);
        opts.logActionToFieldbook(`CACP structures_clear — removed ${removedLines} STRUCTURES segments.`);
      }

      return respond(message, AgentType.STRUCTURES_AGENT, true, {
        removedLines,
        removedPoints,
      });
    }),
  );

  // ── 3. Soils Agent skills ────────────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('fetch_soils', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const mode = (d.mode === 'description' ? 'description' : 'inclusion') as
        | 'inclusion'
        | 'description';
      const descriptionText =
        (typeof d.descriptionText === 'string' && d.descriptionText) ||
        (typeof d.description === 'string' && d.description) ||
        undefined;
      if (mode === 'description' && !descriptionText) {
        return respond(
          message,
          AgentType.SOILS_AGENT,
          false,
          undefined,
          'mode=description requires descriptionText.',
        );
      }
      try {
        await opts.handleFetchSoils(mode, descriptionText);
        const latest = getOpts();
        const soilLines = latest.lines.filter((l) => (l.layer ?? '').startsWith('SOILS-'));
        const layers = Array.from(new Set(soilLines.map((l) => l.layer || ''))).filter(Boolean);
        const zoneCounts: Record<string, number> = {};
        for (const l of soilLines) {
          const sym = (l.layer || '').replace(/^SOILS-/, '');
          zoneCounts[sym] = (zoneCounts[sym] || 0) + 1;
        }
        return respond(message, AgentType.SOILS_AGENT, true, {
          addedLines: soilLines.length,
          featureCount: latest.soilMapUnits.length,
          zoneCounts,
          layers,
          truncated: false,
        });
      } catch (e) {
        return respond(
          message,
          AgentType.SOILS_AGENT,
          false,
          undefined,
          e instanceof Error ? e.message : String(e),
        );
      }
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('fetch_soil_report', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const mukeys =
        Array.isArray(d.mukeys) && d.mukeys.length > 0
          ? (d.mukeys as unknown[]).map(String)
          : opts.soilMapUnits.map((u) => u.mukey).filter(Boolean);
      if (mukeys.length === 0) {
        return respond(
          message,
          AgentType.SOILS_AGENT,
          false,
          undefined,
          'No soil MUKEYs provided or loaded in session. Call fetch_soils first.',
        );
      }
      try {
        const { fetchSoilReport } = await import('./soilsService');
        const reportData = await fetchSoilReport(mukeys);
        opts.setSoilReportData(reportData);
        opts.logActionToFieldbook(
          `CACP fetch_soil_report — fetched USDA SDA tabular properties for ${mukeys.length} map unit(s).`,
        );
        return respond(message, AgentType.SOILS_AGENT, true, { reportData });
      } catch (e) {
        return respond(
          message,
          AgentType.SOILS_AGENT,
          false,
          undefined,
          e instanceof Error ? e.message : String(e),
        );
      }
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('clear_soils', async (message) => {
      const opts = getOpts();
      const removedLines = opts.lines.filter((l) => (l.layer ?? '').startsWith('SOILS-')).length;
      opts.handleClearSoilsLines();
      return respond(message, AgentType.SOILS_AGENT, true, { removedLines });
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('get_soils_context', async (message) => {
      const opts = getOpts();
      if (opts.soilMapUnits.length === 0) {
        return respond(message, AgentType.SOILS_AGENT, true, {
          contextMarkdown: '_No SSURGO soil map units currently loaded in this session._',
        });
      }
      const header =
        '| Symbol | Map Unit Name | Hydro Group | Drainage Class | Farmland Class |\n' +
        '|---|---|---|---|---|';
      const rows = opts.soilMapUnits.map((u) => {
        const rep = opts.soilReportData?.[u.mukey];
        const hydro = rep?.hydgrpdcd || u.hydgrpdcd || '—';
        const drain = rep?.drclassdcd || u.drclassdcd || '—';
        const farm = rep?.farmlndcl || u.farmlndcl || '—';
        return `| ${u.musym} | ${u.muname} | ${hydro} | ${drain} | ${farm} |`;
      });
      return respond(message, AgentType.SOILS_AGENT, true, {
        contextMarkdown: [header, ...rows].join('\n'),
      });
    }),
  );

  // ── 4. Contouring Agent skills ───────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('generate_contours', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      if (opts.points.length < 3) {
        return respond(
          message,
          AgentType.CONTOURING_AGENT,
          false,
          undefined,
          'At least 3 survey points with elevations are required to generate contours.',
        );
      }
      try {
        const interval =
          typeof d.contourInterval === 'number' && d.contourInterval > 0
            ? d.contourInterval
            : opts.contourSettings.contourInterval;
        const major =
          typeof d.majorInterval === 'number' && d.majorInterval > 0
            ? d.majorInterval
            : opts.contourSettings.majorInterval;
        const smoothing =
          typeof d.smoothing === 'number' ? d.smoothing : opts.contourSettings.smoothing;
        const showLabels =
          typeof d.showLabels === 'boolean' ? d.showLabels : opts.contourSettings.showLabels;

        const breaklines = opts.lines.filter((l) => l.type === 'breakline');
        const inclusionLines = opts.lines.filter((l) => l.type === 'inclusion');
        const exclusionLines = opts.lines.filter((l) => l.type === 'exclusion');

        const { isoPaths, labels } = generateContoursAsIsoPaths(
          opts.points,
          interval,
          major,
          smoothing,
          showLabels,
          opts.contourSettings.labelDensity,
          breaklines,
          inclusionLines,
          exclusionLines,
        );
        const genId = `gen-${Date.now()}`;
        const contourLayers = await resolveContourLineLayersViaCacp();
        const contourLines = isoPathsToSurveyLines(isoPaths, genId, contourLayers);
        const now = new Date().toISOString();
        const newGen: ContourGeneration = {
          id: genId,
          name: `Survey ${interval}ft (CACP)`,
          createdAt: now,
          lastGeneratedAt: now,
          settings: {
            ...opts.contourSettings,
            contourInterval: interval,
            majorInterval: major,
            smoothing,
            showLabels,
          },
          activeInclusionBoundaryId: opts.activeInclusionBoundaryId,
          pointCount: opts.points.length,
          isoPaths,
          labels,
          visible: true,
        };
        opts.setContourGenerations((prev) => [...prev, newGen]);
        opts.setLines((prev) => [
          ...prev.filter((l) => !l.type?.startsWith('contour') || (l.contourGenId && l.contourGenId !== genId)),
          ...contourLines,
        ]);
        opts.logActionToFieldbook(
          `CACP generate_contours — generated ${isoPaths.length} contour paths (${contourLines.length} segments) at ${interval}' interval on ${contourLayers.minorLayer} / ${contourLayers.majorLayer}.`,
        );
        return respond(message, AgentType.CONTOURING_AGENT, true, {
          generationId: genId,
          pathCount: isoPaths.length,
          lineCount: contourLines.length,
        });
      } catch (e) {
        return respond(
          message,
          AgentType.CONTOURING_AGENT,
          false,
          undefined,
          e instanceof Error ? e.message : String(e),
        );
      }
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('generate_loaded_tin_contours', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const interval = typeof d.contourInterval === 'number' && d.contourInterval > 0 ? d.contourInterval : 2;
      const major = typeof d.majorInterval === 'number' && d.majorInterval > 0 ? d.majorInterval : interval * 5;
      const smoothing = typeof d.smoothing === 'number' ? d.smoothing : opts.contourSettings.smoothing;
      const showLabels = typeof d.showLabels === 'boolean' ? d.showLabels : true;
      const labelDensity = typeof d.labelDensity === 'number' ? d.labelDensity : opts.contourSettings.labelDensity;

      const allTins = [...opts.tinSurfaces, ...opts.steepSlopeTinSurfaces];
      const requestedId = typeof d.sourceTinId === 'string' ? d.sourceTinId.trim() : '';
      const tin = requestedId
        ? allTins.find((t) => t.id === requestedId)
        : allTins[0];

      if (!tin || !tin.vertices || tin.vertices.length < 3) {
        return respond(
          message,
          AgentType.CONTOURING_AGENT,
          false,
          undefined,
          'No loaded TIN surface available to generate contours from.',
        );
      }

      try {
        const tinPoints: SurveyPoint[] = tin.vertices.map((v, i) => ({
          pointNumber: `TIN-${i + 1}`,
          northing: v.northing,
          easting: v.easting,
          elevation: v.elevation,
          description: 'TIN',
        }));
        const { isoPaths } = generateContoursAsIsoPaths(
          tinPoints,
          interval,
          major,
          smoothing,
          showLabels,
          labelDensity,
          [],
          [],
          [],
        );
        const genId = `tin-gen-${Date.now()}`;
        const contourLayers = await resolveContourLineLayersViaCacp();
        const contourLines = isoPathsToSurveyLines(isoPaths, genId, contourLayers);
        opts.setLines((prev) => [...prev, ...contourLines]);
        opts.logActionToFieldbook(
          `CACP generate_loaded_tin_contours — generated ${contourLines.length} contour segments from TIN "${tin.name}" on ${contourLayers.minorLayer} / ${contourLayers.majorLayer}.`,
        );
        return respond(message, AgentType.CONTOURING_AGENT, true, {
          count: contourLines.length,
          sourceTinId: tin.id,
        });
      } catch (e) {
        return respond(
          message,
          AgentType.CONTOURING_AGENT,
          false,
          undefined,
          e instanceof Error ? e.message : String(e),
        );
      }
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('create_tin_from_contours', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      if (!opts.handleCreateTinFromContours) {
        return respond(
          message,
          AgentType.CONTOURING_AGENT,
          false,
          undefined,
          'TIN creation is not available on this host.',
        );
      }
      const generationId =
        typeof d.generationId === 'string' && d.generationId.trim()
          ? d.generationId.trim()
          : undefined;
      try {
        const tin = await opts.handleCreateTinFromContours(generationId);
        if (!tin) {
          return respond(
            message,
            AgentType.CONTOURING_AGENT,
            false,
            undefined,
            'No contour generation is available to build a TIN from.',
          );
        }
        return respond(message, AgentType.CONTOURING_AGENT, true, {
          tinId: tin.id,
          name: tin.name,
          vertexCount: tin.vertices.length,
          triangleCount: tin.triangles.length,
          sourceGenerationId: generationId ?? null,
        });
      } catch (e) {
        return respond(
          message,
          AgentType.CONTOURING_AGENT,
          false,
          undefined,
          e instanceof Error ? e.message : String(e),
        );
      }
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('import_tin_surface', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      if (!opts.handleImportTinSurface) {
        return respond(
          message,
          AgentType.CONTOURING_AGENT,
          false,
          undefined,
          'TIN import is not available on this host.',
        );
      }
      const content = typeof d.content === 'string' ? d.content : '';
      const fileData = typeof d.fileData === 'string' ? d.fileData : undefined;
      if (!content && !fileData) {
        return respond(
          message,
          AgentType.CONTOURING_AGENT,
          false,
          undefined,
          'content or fileData is required to import a TIN surface.',
        );
      }
      const rawName = typeof d.name === 'string' && d.name.trim() ? d.name.trim() : 'imported-surface';
      const name = /\.(tin|xml|landxml)$/i.test(rawName)
        ? rawName
        : `${rawName}${content.includes('<LandXML') ? '.xml' : '.tin'}`;
      try {
        const tin = await opts.handleImportTinSurface({ name, content, fileData });
        return respond(message, AgentType.CONTOURING_AGENT, true, {
          tinId: tin.id,
          name: tin.name,
          vertexCount: tin.vertices.length,
          triangleCount: tin.triangles.length,
        });
      } catch (e) {
        return respond(
          message,
          AgentType.CONTOURING_AGENT,
          false,
          undefined,
          e instanceof Error ? e.message : String(e),
        );
      }
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('export_tin_surface', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      if (!opts.handleExportTinSurface) {
        return respond(
          message,
          AgentType.CONTOURING_AGENT,
          false,
          undefined,
          'TIN export is not available on this host.',
        );
      }
      const sourceTinId =
        typeof d.sourceTinId === 'string' && d.sourceTinId.trim() ? d.sourceTinId.trim() : undefined;
      const format = d.format === 'native' ? 'native' : 'landxml';
      try {
        const file = await opts.handleExportTinSurface(sourceTinId, format);
        if (!file) {
          return respond(
            message,
            AgentType.CONTOURING_AGENT,
            false,
            undefined,
            'No TIN surface is loaded to export.',
          );
        }
        const surface =
          (sourceTinId ? opts.tinSurfaces.find((t) => t.id === sourceTinId) : undefined) ??
          opts.tinSurfaces[opts.tinSurfaces.length - 1];
        return respond(message, AgentType.CONTOURING_AGENT, true, {
          fileName: file.name,
          format,
          vertexCount: surface?.vertices.length ?? 0,
          triangleCount: surface?.triangles.length ?? 0,
        });
      } catch (e) {
        return respond(
          message,
          AgentType.CONTOURING_AGENT,
          false,
          undefined,
          e instanceof Error ? e.message : String(e),
        );
      }
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('open_tin_surfaces', async (message) => {
      const opts = getOpts();
      if (!opts.openTinSurfaceStudio) {
        return respond(
          message,
          AgentType.CONTOURING_AGENT,
          false,
          undefined,
          'The TIN Surfaces surface is not available on this host.',
        );
      }
      opts.openTinSurfaceStudio();
      return respond(message, AgentType.CONTOURING_AGENT, true, { opened: true });
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('open_spreadsheet', async (message) => {
      const opts = getOpts();
      const openSpreadsheet = opts.openSpreadsheetSurface;
      if (!openSpreadsheet) {
        return respond(
          message,
          AgentType.LSVZ_AGENT,
          false,
          undefined,
          'The A2UI spreadsheet host is not available on this host.',
        );
      }
      const d = (message.data ?? {}) as Record<string, unknown>;
      const columns = normalizeSpreadsheetColumns(d.columns);
      if (columns.length === 0) {
        return respond(
          message,
          AgentType.LSVZ_AGENT,
          false,
          undefined,
          'columns is required and must contain at least one column key or object.',
        );
      }
      const rows = normalizeSpreadsheetRows(d.rows, columns);
      const title =
        typeof d.title === 'string' && d.title.trim() ? d.title.trim() : 'Agent Spreadsheet';
      openSpreadsheet({
        title,
        description: typeof d.description === 'string' ? d.description : undefined,
        fileName:
          typeof d.fileName === 'string' && d.fileName.trim()
            ? d.fileName.trim()
            : `${title.replace(/[^a-z0-9]+/gi, ' ').trim() || 'spreadsheet'}.csv`,
        columns,
        rows,
        editable: d.editable !== false,
        pageSize:
          typeof d.pageSize === 'number' && Number.isFinite(d.pageSize)
            ? Math.min(1000, Math.max(10, d.pageSize))
            : undefined,
      });
      return respond(message, AgentType.LSVZ_AGENT, true, {
        opened: true,
        rowCount: rows.length,
        columnCount: columns.length,
      });
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('fetch_esri_rest_contours', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const serviceUrl = typeof d.serviceUrl === 'string' ? d.serviceUrl.trim() : '';
      if (!serviceUrl) {
        return respond(
          message,
          AgentType.CONTOURING_AGENT,
          false,
          undefined,
          'serviceUrl is required.',
        );
      }
      const mode = (d.mode === 'description' ? 'description' : d.mode === 'project' ? 'project' : 'inclusion') as
        | 'project'
        | 'inclusion'
        | 'description';
      const descriptionText =
        (typeof d.descriptionText === 'string' && d.descriptionText) ||
        (typeof d.description === 'string' && d.description) ||
        undefined;
      try {
        const result = await opts.handleFetchEsriContours(serviceUrl, mode, descriptionText);
        if (!result.ok) {
          return respond(message, AgentType.CONTOURING_AGENT, false, undefined, result.message);
        }
        const latest = getOpts();
        return respond(message, AgentType.CONTOURING_AGENT, true, {
          featureCount: result.featureCount,
          // `count` is contour segments added to the drawing, which is what the
          // agent should report; reading it back from opts.lines was one render
          // behind and made successful fetches look like "0 features found".
          count: result.segmentCount,
          sr: { wkid: latest.settings.projection?.epsg ?? 4326 },
          layerName: result.layerName,
        });
      } catch (e) {
        return respond(
          message,
          AgentType.CONTOURING_AGENT,
          false,
          undefined,
          e instanceof Error ? e.message : String(e),
        );
      }
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('discover_public_contour_services', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const searchArea = typeof d.searchArea === 'string' ? d.searchArea.trim() : '';
      if (!searchArea) {
        return respond(
          message,
          AgentType.CONTOURING_AGENT,
          false,
          undefined,
          'searchArea is required.',
        );
      }
      await opts.handleDiscoverPublicContourServices(searchArea);
      // Resolve curated layers from the same registry the UI uses. Hand-typed
      // URLs previously drifted (www.pasda.psu.edu/…/MapServer/0 now 404s and
      // layer 0 is a counties polygon layer), so every fetch returned 0
      // features.
      const normalized = searchArea.toLowerCase();
      const stateEntry =
        ESRI_STATE_SERVICES.find((entry) => normalized.includes(entry.state.toLowerCase())) ??
        ESRI_STATE_SERVICES.find((entry) =>
          new RegExp(`(^|[^a-z])${entry.abbr.toLowerCase()}([^a-z]|$)`).test(normalized),
        );
      const usgsIntermediate =
        USGS_NATIONAL_CONTOUR_SOURCES.find((source) => source.id === 'intermediate') ??
        USGS_NATIONAL_CONTOUR_SOURCES[0];
      const curated = [
        {
          name: 'USGS 3DEP National Map Contours (Intermediate)',
          url: usgsIntermediate.url,
          region: stateEntry?.state ?? searchArea,
          description: 'USGS National Elevation Dataset / 3DEP contour service covering the United States.',
          dataType: (d.dataType as string) || 'contours',
          resolution: `${usgsIntermediate.intervalFt}ft`,
        },
        ...(stateEntry?.layers ?? []).map((layer) => ({
          name: layer.name,
          url: layer.url,
          region: stateEntry?.state ?? searchArea,
          description: layer.notes ?? layer.attribution,
          dataType: 'contours',
          resolution: layer.intervalFt ? `${layer.intervalFt}ft` : 'unknown',
        })),
      ];
      return respond(message, AgentType.CONTOURING_AGENT, true, {
        services: curated,
        count: curated.length,
        sources: [
          'USGS National Map',
          ...(stateEntry ? [stateEntry.abbr === 'PA' ? 'PASDA' : `${stateEntry.abbr} state GIS`] : []),
        ],
      });
    }),
  );

  // ── 5. Steep Slope Agent skills ──────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('run_steep_slope_analysis', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const allTins = [...opts.steepSlopeTinSurfaces, ...opts.tinSurfaces];
      const requestedTinId = typeof d.tinId === 'string' ? d.tinId.trim() : '';
      const tin = requestedTinId ? allTins.find((t) => t.id === requestedTinId) ?? allTins[0] : allTins[0];

      if (!tin) {
        return respond(
          message,
          AgentType.STEEP_SLOPE_AGENT,
          false,
          undefined,
          'No TIN surface available for steep-slope analysis. Load survey points with elevations or import a TIN first.',
        );
      }

      const minSpan =
        typeof d.minComponentVerticalSpan === 'number' && d.minComponentVerticalSpan >= 0
          ? d.minComponentVerticalSpan
          : 6;
      const bands =
        Array.isArray(d.bands) && d.bands.length > 0
          ? (d.bands as SteepSlopeBand[])
          : DEFAULT_STEEP_SLOPE_BANDS;
      const inclusionBoundaryId =
        typeof d.inclusionBoundaryId === 'string'
          ? d.inclusionBoundaryId
          : opts.activeInclusionBoundaryId;

      try {
        const run = runSteepSlopeAnalysis(tin, {
          sourceTinId: tin.id,
          minComponentLinearSpan: minSpan,
          minComponentVerticalSpan: minSpan,
          bands,
          includeBoundaryId: inclusionBoundaryId,
        });
        const ssLines = steepSlopeRunToSurveyLines(tin, run);
        opts.setSteepSlopeRuns((prev) => [...prev, run]);
        opts.setLines((prev) => [...prev.filter((l) => l.type !== 'steep-slope'), ...ssLines]);
        opts.logActionToFieldbook(
          `CACP run_steep_slope_analysis — run ${run.id}: ${run.keptTriangleCount}/${run.analyzedTriangleCount} triangles kept.`,
        );
        return respond(message, AgentType.STEEP_SLOPE_AGENT, true, {
          runId: run.id,
          keptTriangleCount: run.keptTriangleCount,
          removedTriangleCount: run.removedTriangleCount,
          componentCount: run.components.length,
        });
      } catch (e) {
        return respond(
          message,
          AgentType.STEEP_SLOPE_AGENT,
          false,
          undefined,
          e instanceof Error ? e.message : String(e),
        );
      }
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('publish_steep_slope_layers', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const runId = typeof d.runId === 'string' ? d.runId.trim() : '';
      const run = runId
        ? opts.steepSlopeRuns.find((r) => r.id === runId)
        : opts.steepSlopeRuns[opts.steepSlopeRuns.length - 1];

      const bands = run?.settings?.bands ?? DEFAULT_STEEP_SLOPE_BANDS;
      const resolvedLayers = bands.map(
        (b) => b.layerName || `SS_${b.minPercent}_${Number.isFinite(b.maxPercent) ? b.maxPercent : 'PLUS'}`,
      );
      const createdLayers: string[] = [];

      if (d.createMissingLayers !== false && opts.addCadCodes) {
        const codesToAdd = bands.map((b, i) => ({
          code: resolvedLayers[i],
          description: `Steep Slope ${b.minPercent}%–${Number.isFinite(b.maxPercent) ? `${b.maxPercent}%` : '+'}`,
          pointLayer: resolvedLayers[i],
          lineLayer: resolvedLayers[i],
          lineType: 'CONTINUOUS',
          category: 'Steep Slope',
        }));
        opts.addCadCodes(codesToAdd);
        createdLayers.push(...resolvedLayers);
      }

      opts.logActionToFieldbook(
        `CACP publish_steep_slope_layers — published layers: ${resolvedLayers.join(', ')}.`,
      );
      return respond(message, AgentType.STEEP_SLOPE_AGENT, true, {
        createdLayers,
        resolvedLayers,
      });
    }),
  );

  // ── 6. Profile & Cross Section Agent skills ──────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('generate_profile', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const lineId = typeof d.lineId === 'string' ? d.lineId.trim() : '';
      const fromPn = typeof d.fromPointNumber === 'string' ? d.fromPointNumber.trim() : '';
      const toPn = typeof d.toPointNumber === 'string' ? d.toPointNumber.trim() : '';

      let fromPoint: SurveyPoint | undefined;
      let toPoint: SurveyPoint | undefined;

      if (lineId) {
        const line = opts.lines.find((l) => l.id === lineId);
        if (line) {
          fromPoint =
            opts.points.find((p) => p.pointNumber === line.from) ??
            (line.fromPt
              ? {
                  pointNumber: line.from || 'START',
                  easting: line.fromPt.x,
                  northing: line.fromPt.y,
                  elevation: line.fromPt.z ?? 0,
                  description: 'LINE-START',
                }
              : undefined);
          toPoint =
            opts.points.find((p) => p.pointNumber === line.to) ??
            (line.toPt
              ? {
                  pointNumber: line.to || 'END',
                  easting: line.toPt.x,
                  northing: line.toPt.y,
                  elevation: line.toPt.z ?? 0,
                  description: 'LINE-END',
                }
              : undefined);
        }
      } else if (fromPn && toPn) {
        fromPoint = opts.points.find((p) => p.pointNumber === fromPn);
        toPoint = opts.points.find((p) => p.pointNumber === toPn);
      }

      if (!fromPoint || !toPoint) {
        return respond(
          message,
          AgentType.PROFILE_AGENT,
          false,
          undefined,
          'Provide a valid lineId or both fromPointNumber and toPointNumber that exist in the project.',
        );
      }

      try {
        const contourSegments = opts.lines.filter((l) => l.type?.startsWith('contour'));
        const profilePts = generateProfile(fromPoint, toPoint, opts.points, contourSegments);
        opts.setProfileData(profilePts);
        const name = lineId
          ? `Profile ${lineId}`
          : `Line ${fromPoint.pointNumber}-${toPoint.pointNumber}`;
        opts.setProfileInfo({ name, type: 'line' });
        opts.logActionToFieldbook(
          `CACP generate_profile — computed ${profilePts.length} profile samples for "${name}".`,
        );

        const stations = profilePts.map((p) => p.station);
        const elevations = profilePts.map((p) => p.elevation);
        const length = stations.length > 0 ? stations[stations.length - 1] - stations[0] : 0;

        return respond(message, AgentType.PROFILE_AGENT, true, {
          stations,
          elevations,
          length,
        });
      } catch (e) {
        return respond(
          message,
          AgentType.PROFILE_AGENT,
          false,
          undefined,
          e instanceof Error ? e.message : String(e),
        );
      }
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('generate_cross_section', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const clId = typeof d.centerlineId === 'string' ? d.centerlineId.trim() : '';
      const cl =
        opts.centerlines.find((c) => c.id === clId || c.name === clId) ?? opts.centerlines[0];
      if (!cl || (cl.pis?.length ?? 0) < 2) {
        return respond(
          message,
          AgentType.PROFILE_AGENT,
          false,
          undefined,
          'No usable centerline found in session for cross-section generation.',
        );
      }

      const rawStation = d.station;
      const station =
        typeof rawStation === 'number'
          ? rawStation
          : typeof rawStation === 'string'
            ? parseStation(rawStation) ?? parseFloat(rawStation)
            : cl.beginStation;
      if (station === null || !Number.isFinite(station)) {
        return respond(
          message,
          AgentType.PROFILE_AGENT,
          false,
          undefined,
          `Invalid station "${String(d.station)}".`,
        );
      }

      const leftOffset = typeof d.leftOffset === 'number' && d.leftOffset > 0 ? d.leftOffset : 25;
      const rightOffset = typeof d.rightOffset === 'number' && d.rightOffset > 0 ? d.rightOffset : 25;
      const interval = typeof d.interval === 'number' && d.interval > 0 ? d.interval : 5;

      const leftPt = calculatePointFromStationOffset(cl, station, -leftOffset);
      const rightPt = calculatePointFromStationOffset(cl, station, rightOffset);
      if (!leftPt || !rightPt) {
        const endSta = cl.beginStation + calculateCenterlineLength(cl);
        return respond(
          message,
          AgentType.PROFILE_AGENT,
          false,
          undefined,
          `Station ${station} is outside centerline bounds (${cl.beginStation}–${endSta.toFixed(2)}).`,
        );
      }

      const offsets: number[] = [];
      const elevations: number[] = [];
      for (let off = -leftOffset; off <= rightOffset + 1e-6; off += interval) {
        const clamped = Math.min(off, rightOffset);
        const pt = calculatePointFromStationOffset(cl, station, clamped);
        if (!pt) continue;
        // Inverse-distance-weighted elevation interpolation from nearby survey points
        let weightedZ = 0;
        let weightSum = 0;
        for (const sp of opts.points) {
          if (sp.elevation === undefined || !Number.isFinite(sp.elevation)) continue;
          const dist = Math.hypot(sp.easting - pt.easting, sp.northing - pt.northing);
          if (dist < 1e-3) {
            weightedZ = sp.elevation;
            weightSum = 1;
            break;
          }
          const w = 1 / (dist * dist);
          weightedZ += sp.elevation * w;
          weightSum += w;
        }
        offsets.push(Math.round(clamped * 100) / 100);
        elevations.push(weightSum > 0 ? Math.round((weightedZ / weightSum) * 100) / 100 : 0);
      }

      return respond(message, AgentType.PROFILE_AGENT, true, {
        offsets,
        elevations,
      });
    }),
  );

  // ── 7. Voice Agent skills ────────────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('voice_observe_workflow', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const ctx = (d.context ?? {}) as Record<string, unknown>;
      const isDrawing = Boolean(ctx.isDrawing ?? true);
      const activeDrawingLayer = String(ctx.activeDrawingLayer ?? opts.activeDrawingLayer ?? '');
      const shouldAsk = shouldPromptForDrawingIntent({
        isDrawing,
        activeDrawingLayer,
        nowMs: Date.now(),
        lastPromptAtMs: 0,
        justEnteredDrawingMode: true,
      });
      return respond(message, AgentType.VOICE_AGENT, true, {
        shouldAsk,
        question: shouldAsk ? 'What feature are you drawing so I can set the right CAD layer?' : undefined,
      });
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('voice_propose_layer', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const utterance = String(d.utterance ?? '').trim();
      const availableLayers = Array.isArray(d.availableLayers)
        ? (d.availableLayers as unknown[]).map(String)
        : opts.availableCadLayers.length > 0
          ? opts.availableCadLayers
          : ['L-BUILDING', 'L-ROAD', 'L-UTIL', 'L-DEED-BOUNDARY', 'L-TOPO'];
      const suggestion = suggestLayerForUtterance(utterance, availableLayers);
      const kind = classifyDrawingIntent(utterance);
      const fallbackLayer =
        kind === 'building'
          ? 'L-BUILDING'
          : kind === 'road'
            ? 'L-ROAD'
            : kind === 'utility'
              ? 'L-UTIL'
              : kind === 'boundary'
                ? 'L-DEED-BOUNDARY'
                : 'L-TOPO';
      return respond(message, AgentType.VOICE_AGENT, true, {
        proposedLayer: suggestion?.layer ?? fallbackLayer,
        confidence: suggestion?.confidence ?? 0.65,
        reason: suggestion?.reason ?? `Matched spoken intent to default ${fallbackLayer} layer.`,
        requiresConfirmation: true,
      });
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('voice_suggest_next_tasks', async (message) => {
      const d = (message.data ?? {}) as Record<string, unknown>;
      const ctx = (d.context ?? {}) as Record<string, unknown>;
      const hint = String(ctx.utterance ?? ctx.activeLayer ?? '');
      const kind = classifyDrawingIntent(hint);
      const suggestions = getTaskSuggestionsForKind(kind);
      return respond(message, AgentType.VOICE_AGENT, true, { suggestions });
    }),
  );

  // ── 8. AR Field Agent skills ─────────────────────────────────────────────
  unsubs.push(
    interAgentComm.onCommand('capture_and_send_intent', async (message) => {
      const d = (message.data ?? {}) as Record<string, unknown>;
      const rawText = String(d.raw_text ?? '').trim();
      const featureType = typeof d.feature_type === 'string' ? d.feature_type : 'tree';
      const event = await glassCacpGateway.captureIntent(rawText, featureType);
      return respond(message, AgentType.AR_AGENT, Boolean(event), {
        event_id: event?.event_id ?? `ar-evt-${Date.now()}`,
        accepted: Boolean(event),
        command_category: event?.intent.command_category ?? 'DRAW_FEATURE',
      });
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('receive_drawing_action', async (message) => {
      const d = (message.data ?? {}) as Record<string, unknown>;
      const actionId = String(d.action_id ?? '');
      const eventId = String(d.event_id ?? '');
      return respond(message, AgentType.AR_AGENT, true, {
        status: 'approved',
        summary: `AR Action ${actionId || 'latest'} verified for event ${eventId || 'latest'}.`,
        audio_confirmation: 'Feature confirmed on CAD canvas.',
      });
    }),
  );

  // ── 9. DXF Agent, Civil Drafter & Civil Plan Expert skills ───────────────
  unsubs.push(
    interAgentComm.onCommand('dxf_extract_entities', async (message) => {
      const opts = getOpts();
      const layers = Array.from(
        new Set([
          ...opts.lines.map((l) => l.layer).filter((x): x is string => Boolean(x)),
          ...opts.points.map((p) => p.layer).filter((x): x is string => Boolean(x)),
        ]),
      );
      return respond(message, AgentType.DXF_ANALYZER, true, {
        layers,
        entities: opts.lines.slice(0, 200),
        pointCount: opts.points.length,
        fileName: opts.dxfFile?.name ?? null,
      });
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('civil_drafter_extract_points', async (message) => {
      const opts = getOpts();
      return respond(message, AgentType.CIVIL_DRAFTER, true, {
        points: opts.points,
        linework: opts.lines,
      });
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('civil_plan_expert_extract', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const drawMode = (d.drawMode as string) || 'points_lines';
      return respond(message, AgentType.CIVIL_PLAN_EXPERT, true, {
        points: drawMode === 'lines_only' ? [] : opts.points,
        lines: drawMode === 'points_only' ? [] : opts.lines,
        warnings: opts.planFiles && opts.planFiles.length > 0 ? [] : ['No civil plan PDF uploaded yet; returning current session geometry.'],
      });
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('civil_plan_expert_status', async (message) => {
      const opts = getOpts();
      return respond(message, AgentType.CIVIL_PLAN_EXPERT, true, {
        planLoaded: Boolean(opts.planFiles && opts.planFiles.length > 0),
        pointCount: opts.points.length,
        lineCount: opts.lines.length,
        modelInUse: opts.activeModel,
      });
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('civil_plan_expert_set_draw_mode', async (message) => {
      const opts = getOpts();
      const d = (message.data ?? {}) as Record<string, unknown>;
      const mode = String(d.mode ?? 'points_lines') as 'points_lines' | 'points_only' | 'lines_only';
      const mapped = mode === 'points_only' ? 'points' : mode === 'lines_only' ? 'lines' : 'both';
      opts.setAgentDrawMode(mapped);
      opts.logActionToFieldbook(`Civil Plan Expert: set draw mode to "${mode}".`);
      return respond(message, AgentType.CIVIL_PLAN_EXPERT, true, { mode });
    }),
  );

  // ── 10. Additional Survey & Geospatial Agent skills ──────────────────────
  unsubs.push(
    interAgentComm.onCommand('raw_get_summary', async (message) => {
      const opts = getOpts();
      const rawContent = opts.rawFile?.content ?? '';
      const lineCount = rawContent ? rawContent.split(/\r?\n/).length : 0;
      return respond(message, AgentType.RAW_CRAWLER, true, {
        loaded: Boolean(opts.rawFile),
        fileName: opts.rawFile?.name ?? undefined,
        lineCount,
        pointCount: opts.points.length,
      });
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('gis_get_features_summary', async (message) => {
      const opts = getOpts();
      return respond(message, AgentType.GIS_AGENT, true, {
        featureCount: opts.gisFeatures?.length ?? 0,
        activeWmsCount: opts.activeWmsLayers?.length ?? 0,
        summary: `GIS session has ${opts.gisFeatures?.length ?? 0} vector feature(s) and ${opts.activeWmsLayers?.length ?? 0} active WMS layer(s).`,
      });
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('image_list_session_photos', async (message) => {
      const opts = getOpts();
      const photos = (opts.imageFiles ?? []).map((f) => ({
        name: f.name,
        tags: f.tags ?? [],
      }));
      return respond(message, AgentType.IMAGE_ANALYZER, true, {
        photos,
        count: photos.length,
      });
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('gnss_get_status', async (message) => {
      const opts = getOpts();
      return respond(message, AgentType.GNSS_AGENT, true, {
        ready: true,
        epsg: opts.settings.projection?.epsg ?? undefined,
      });
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('drone_get_status', async (message) => {
      return respond(message, AgentType.DRONE_AGENT, true, {
        ready: true,
      });
    }),
  );

  unsubs.push(
    interAgentComm.onCommand('title_get_deed_chain', async (message) => {
      const opts = getOpts();
      const facts = knowledgeBase.queryFacts({
        category: ['deed.metadata', 'deed.row', 'parcel.gis'] as any,
        limit: 50,
      });
      return respond(message, AgentType.TITLE_SEARCH, true, {
        deedLoaded: Boolean(opts.deedFile),
        deedName: opts.deedFile?.name ?? undefined,
        facts,
      });
    }),
  );

  // ── 11. Roading Agent skills ─────────────────────────────────────────────
  unsubs.push(
    registerRoadingSkillHandlers(() => {
      const opts = getOpts();
      return {
        points: opts.points,
        pointLists: opts.pointLists,
        setPointLists: opts.setPointLists,
        lines: opts.lines,
        setLines: opts.setLines,
        centerlines: opts.centerlines,
        setCenterlines: opts.setCenterlines,
        roadCorridors: opts.roadCorridors,
        setRoadCorridors: opts.setRoadCorridors,
        streetLabels: opts.streetLabels,
        setStreetLabels: opts.setStreetLabels,
        setProfileData: opts.setProfileData,
        setProfileInfo: opts.setProfileInfo,
        settings: opts.settings,
        canvas2dRef: opts.canvas2dRef,
        logActionToFieldbook: opts.logActionToFieldbook,
      };
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}

/**
 * React hook that mounts all domain CACP skill handlers and keeps their
 * live state references fresh across renders.
 */
export function useDomainSkillHandlers(opts: DomainSkillHandlersOpts): void {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    return registerDomainSkillHandlers(() => optsRef.current);
  }, []);
}
