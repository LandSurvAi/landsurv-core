/**
 * A2UI Surface Platform
 *
 * A single, typed way for any part of the product — the agent chat, dialogs,
 * settings, the CACP layer, and the public subdomain pages — to publish an
 * interactive surface.
 *
 * There are two halves:
 *   1. A declarative CATALOG of surfaces (what exists, who owns it, whether it
 *      is safe on public pages). Menus and the surface console read this.
 *   2. A module-level BUS of open surface instances. Non-React callers (CACP
 *      bridges, dialogs, settings) can open a surface without threading props
 *      through App, and the globally-mounted A2UISurfaceHost renders them.
 *
 * The bus deliberately stores ReactNode content. Surfaces are composed by the
 * caller (so they keep whatever contexts the caller has) and the host only
 * owns window chrome, stacking, keyboard handling, and sizing.
 */

import type { ReactNode } from 'react';
import {
  AgentType,
  type A2UISurfaceSize,
  type A2UIWidgetType,
} from '../types.ts';
import { CONTOUR_CHIP_IDS, CONTOUR_CHIP_META } from './contourChips.ts';

export type A2UISurfaceAudience = 'workspace' | 'public';

export type A2UISurfaceCategory =
  | 'capture'
  | 'explore'
  | 'workspace'
  | 'protocol'
  | 'dialog'
  | 'system';

export type A2UISurfaceAccent = 'cyan' | 'emerald' | 'amber' | 'fuchsia' | 'sky' | 'rose';

export interface A2UISurfaceDefinition {
  /** Stable id used by the catalog, console, bridge, and telemetry. */
  id: string;
  title: string;
  description: string;
  category: A2UISurfaceCategory;
  /** Tiny text glyph so the catalog does not depend on an icon set. */
  glyph: string;
  accent: A2UISurfaceAccent;
  /** Where this surface is safe to launch. */
  audiences: A2UISurfaceAudience[];
  /** Agent that owns the underlying interaction, when applicable. */
  agent?: AgentType;
  /** Existing in-chat A2UI widget this catalog entry launches. */
  widgetType?: A2UIWidgetType;
  keywords?: string[];
}

export const A2UI_SURFACE_CATALOG: readonly A2UISurfaceDefinition[] = [
  // ── Data capture ──────────────────────────────────────────────────────────
  {
    id: 'capture-points',
    title: 'Point capture',
    description: 'Import CSV/TXT point files, folders, or start an empty point session.',
    category: 'capture',
    glyph: 'P',
    accent: 'cyan',
    audiences: ['workspace'],
    agent: AgentType.POINT_EDITOR,
    widgetType: 'point-upload',
    keywords: ['points', 'csv', 'txt', 'upload', 'survey'],
  },
  {
    id: 'capture-boundary',
    title: 'Boundary capture',
    description: 'Upload or paste a deed, start a manual boundary, or open County GIS.',
    category: 'capture',
    glyph: 'B',
    accent: 'emerald',
    audiences: ['workspace'],
    agent: AgentType.DEED_READER,
    widgetType: 'deed-upload',
    keywords: ['deed', 'parcel', 'legal description', 'boundary'],
  },
  {
    id: 'capture-raw',
    title: 'RAW survey capture',
    description: 'Parse a field .RAW file and plot the observations on the canvas.',
    category: 'capture',
    glyph: 'R',
    accent: 'amber',
    audiences: ['workspace'],
    agent: AgentType.RAW_CRAWLER,
    widgetType: 'raw-upload',
    keywords: ['raw', 'field book', 'observations'],
  },
  {
    id: 'capture-civil-drafter',
    title: 'Civil Drafter intake',
    description: 'Load survey points or plan sheets for automated linework drafting.',
    category: 'capture',
    glyph: 'D',
    accent: 'fuchsia',
    audiences: ['workspace'],
    agent: AgentType.CIVIL_DRAFTER,
    widgetType: 'civil-drafter-upload',
    keywords: ['drafting', 'linework', 'plan sheet'],
  },
  {
    id: 'capture-plans',
    title: 'Plan sheet capture',
    description: 'Upload one or more PDF plan sheets for the Civil Plan Expert.',
    category: 'capture',
    glyph: 'S',
    accent: 'sky',
    audiences: ['workspace'],
    agent: AgentType.CIVIL_PLAN_EXPERT,
    widgetType: 'plan-upload',
    keywords: ['plan', 'pdf', 'sheets'],
  },
  {
    id: 'capture-dxf',
    title: 'DXF capture',
    description: 'Render a DXF drawing and inspect its layers, entities, and geometry.',
    category: 'capture',
    glyph: 'X',
    accent: 'amber',
    audiences: ['workspace'],
    agent: AgentType.DXF_ANALYZER,
    widgetType: 'dxf-upload',
    keywords: ['dxf', 'cad', 'drawing'],
  },
  {
    id: 'capture-gis',
    title: 'GIS capture',
    description: 'Upload GeoJSON, browse ArcGIS services, or fetch public parcels.',
    category: 'capture',
    glyph: 'G',
    accent: 'emerald',
    audiences: ['workspace'],
    agent: AgentType.GIS_AGENT,
    widgetType: 'gis-upload',
    keywords: ['gis', 'geojson', 'arcgis', 'parcel'],
  },
  {
    id: 'capture-zoning',
    title: 'Zoning intake',
    description: 'Bind a jurisdiction and research the official zoning map and districts.',
    category: 'capture',
    glyph: 'Z',
    accent: 'emerald',
    audiences: ['workspace'],
    agent: AgentType.ZONING_AGENT,
    widgetType: 'zoning-intake',
    keywords: ['zoning', 'setback', 'district', 'jurisdiction'],
  },
  {
    id: 'capture-title',
    title: 'Title search capture',
    description: 'Upload a deed or paste a description to build the chain of title.',
    category: 'capture',
    glyph: 'T',
    accent: 'sky',
    audiences: ['workspace'],
    agent: AgentType.TITLE_SEARCH,
    widgetType: 'title-search-upload',
    keywords: ['title', 'deed', 'lien', 'chain of title'],
  },
  {
    id: 'capture-compliance',
    title: 'Compliance intake',
    description: 'Configure a subject PDF, reference files, source mode, and checks.',
    category: 'capture',
    glyph: 'C',
    accent: 'rose',
    audiences: ['workspace'],
    agent: AgentType.STANDARDS_COMPLIANCE,
    widgetType: 'standards-compliance-intake',
    keywords: ['compliance', 'audit', 'standards', 'pdf'],
  },
  {
    id: 'capture-images',
    title: 'Site imagery capture',
    description: 'Tag and analyze site photos, then link them to project points.',
    category: 'capture',
    glyph: 'I',
    accent: 'fuchsia',
    audiences: ['workspace'],
    agent: AgentType.IMAGE_ANALYZER,
    widgetType: 'image-upload',
    keywords: ['image', 'photo', 'exhibit'],
  },
  {
    id: 'capture-centerline',
    title: 'Centerline capture',
    description: 'Load a .cl alignment, the highway example, or start a blank centerline.',
    category: 'capture',
    glyph: 'L',
    accent: 'amber',
    audiences: ['workspace'],
    agent: AgentType.CENTERLINE_STATIONING,
    widgetType: 'centerline-upload',
    keywords: ['centerline', 'alignment', 'stationing'],
  },
  {
    id: 'capture-roading',
    title: 'Roading intake',
    description: 'Synthesize existing roads from points & imagery or configure a proposed road corridor.',
    category: 'capture',
    glyph: 'R',
    accent: 'amber',
    audiences: ['workspace'],
    agent: AgentType.ROADING_AGENT,
    widgetType: 'roading-intake',
    keywords: ['road', 'roading', 'corridor', 'typical section', 'street'],
  },
  {
    id: 'capture-cad-standards',
    title: 'CAD standards capture',
    description: 'Import .lay, .dsc, .lin, .json, or start a new standards session.',
    category: 'capture',
    glyph: 'A',
    accent: 'cyan',
    audiences: ['workspace'],
    agent: AgentType.CAD_MANAGER,
    widgetType: 'cad-manager-intake',
    keywords: ['cad', 'standards', 'layers', 'linetypes'],
  },

  // ── Exploration ───────────────────────────────────────────────────────────
  {
    id: 'explore-cad-standards',
    title: 'CAD standards explorer',
    description: 'Search the live standard by layer, code, linetype, or symbol.',
    category: 'explore',
    glyph: '≡',
    accent: 'cyan',
    audiences: ['workspace'],
    agent: AgentType.CAD_MANAGER,
    widgetType: 'cad-standards-table',
    keywords: ['layer', 'code', 'linetype', 'symbol', 'standard'],
  },
  {
    id: 'explore-zoning',
    title: 'Zoning research',
    description: 'Review districts, setbacks, permitted uses, and map sources in chat.',
    category: 'explore',
    glyph: 'Z',
    accent: 'emerald',
    audiences: ['workspace'],
    agent: AgentType.ZONING_AGENT,
    widgetType: 'zoning-research',
    keywords: ['zoning', 'district', 'setback', 'uses'],
  },

  // ── Workspace ─────────────────────────────────────────────────────────────
  {
    id: 'workspace-cad-manager',
    title: 'CAD Manager workspace',
    description: 'Full standards workspace with sessions, editing, aliases, and exports.',
    category: 'workspace',
    glyph: '⚙',
    accent: 'cyan',
    audiences: ['workspace'],
    agent: AgentType.CAD_MANAGER,
    widgetType: 'cad-manager-workspace',
    keywords: ['cad manager', 'standards', 'workspace', 'session', 'spreadsheet'],
  },
  {
    id: 'workspace-symbol-manager',
    title: 'Symbol Manager',
    description: 'Create AI/DXF custom symbols, toggle built-in survey symbols, and export DXF.',
    category: 'workspace',
    glyph: '◈',
    accent: 'amber',
    audiences: ['workspace'],
    agent: AgentType.CAD_MANAGER,
    widgetType: 'symbol-manager',
    keywords: ['symbols', 'symbol manager', 'library', 'icons', 'dxf'],
  },
  {
    id: 'workspace-linetype-manager',
    title: 'Linetype Manager',
    description: 'Import .lin files, generate custom survey linetypes with AI, and push to Civil 3D.',
    category: 'workspace',
    glyph: '⎯',
    accent: 'cyan',
    audiences: ['workspace'],
    agent: AgentType.CAD_MANAGER,
    widgetType: 'linetype-manager',
    keywords: ['linetypes', 'linetype manager', 'lin', 'dashes'],
  },
  {
    id: 'workspace-hatch-manager',
    title: 'Hatch Manager',
    description: 'Configure and preview CAD hatch patterns for standards and polygons.',
    category: 'workspace',
    glyph: '▤',
    accent: 'cyan',
    audiences: ['workspace'],
    agent: AgentType.CAD_MANAGER,
    widgetType: 'hatch-manager',
    keywords: ['hatch', 'hatches', 'patterns', 'fill'],
  },
  {
    id: 'workspace-raster-underlay',
    title: 'Image & PDF Underlays',
    description: 'Import a plan PDF or raster scan, place two anchor pairs, and align the image to project points.',
    category: 'workspace',
    glyph: '🖼',
    accent: 'amber',
    audiences: ['workspace'],
    agent: AgentType.CAD_MANAGER,
    widgetType: 'raster-underlay',
    keywords: ['underlay', 'image underlay', 'pdf underlay', 'raster', 'scan', 'georeference', 'align image', 'anchor points', 'plan sheet'],
  },
  {
    id: 'workspace-annotate-manager',
    title: 'Annotate Manager',
    description: 'Manage custom point annotation rules, street labels, and annotation categories.',
    category: 'workspace',
    glyph: 'A',
    accent: 'fuchsia',
    audiences: ['workspace'],
    agent: AgentType.CIVIL_DRAFTER,
    widgetType: 'annotate-manager',
    keywords: ['annotate', 'annotations', 'labels', 'text styles', 'categories'],
  },
  {
    id: 'workspace-stationing-controls',
    title: 'Stationing Controls',
    description: 'Control P/L auto station points, the station interval, and centerline annotations.',
    category: 'workspace',
    glyph: 'S',
    accent: 'cyan',
    audiences: ['workspace'],
    agent: AgentType.CENTERLINE_STATIONING,
    widgetType: 'stationing-controls',
    keywords: ['stationing', 'baseline', 'centerline', 'stations', 'annotations', 'P/L'],
  },
  {
    id: 'workspace-drafting-style-library',
    title: 'Drafting Style Library',
    description: 'Author and manage drafting style examples for the Civil Drafter agent.',
    category: 'workspace',
    glyph: '✦',
    accent: 'fuchsia',
    audiences: ['workspace'],
    agent: AgentType.CAD_MANAGER,
    widgetType: 'drafting-style-library',
    keywords: ['drafting style', 'style library', 'training', 'civil drafter'],
  },
  {
    id: 'workspace-civil-drafter-context',
    title: 'Civil Drafter Context',
    description:
      'Control retained conversation, point payloads, and vision imagery between drafting turns.',
    category: 'workspace',
    glyph: 'C',
    accent: 'fuchsia',
    audiences: ['workspace'],
    agent: AgentType.CIVIL_DRAFTER,
    keywords: ['context', 'tokens', 'history', 'vision', 'civil drafter'],
  },
  {
    id: 'workspace-layer-manager',
    title: 'Data Visibility & Layers',
    description: 'Toggle point lists, CAD layers, WMS overlays, offline maps, and inclusion boundaries.',
    category: 'workspace',
    glyph: '☰',
    accent: 'cyan',
    audiences: ['workspace'],
    agent: AgentType.CAD_MANAGER,
    widgetType: 'layer-manager',
    keywords: ['layer manager', 'data visibility', 'layers', 'visibility'],
  },
  {
    id: 'workspace-compliance-summary',
    title: 'Standards Compliance Audit',
    description: 'Review compliance findings, configure audit checks, and re-run visual or CAD audits.',
    category: 'workspace',
    glyph: '✓',
    accent: 'rose',
    audiences: ['workspace'],
    agent: AgentType.STANDARDS_COMPLIANCE,
    widgetType: 'compliance-summary',
    keywords: ['compliance', 'audit', 'standards report', 'findings'],
  },
  {
    id: 'workspace-title-search',
    title: 'Title Search Workspace',
    description: 'Inspect the chain of title, deeds, and recorded liens.',
    category: 'workspace',
    glyph: '§',
    accent: 'amber',
    audiences: ['workspace'],
    agent: AgentType.TITLE_SEARCH,
    widgetType: 'title-search-panel',
    keywords: ['title search', 'chain of title', 'deeds', 'liens'],
  },
  {
    id: 'workspace-roading',
    title: 'Roading Studio',
    description: 'Synthesize existing roads, design typical sections, and generate road profiles and cross sections.',
    category: 'workspace',
    glyph: '╦',
    accent: 'amber',
    audiences: ['workspace'],
    agent: AgentType.ROADING_AGENT,
    widgetType: 'roading-panel',
    keywords: ['roading', 'road studio', 'typical section', 'corridor', 'cul-de-sac'],
  },
  {
    id: 'workspace-road-paint',
    title: 'Road Paint Studio',
    description:
      'Station a centerline and paint 4-inch WL/SWL white lines or DYL double-yellow markings 8 inches off the CL, with CAD layers, linetypes, and station callouts.',
    category: 'workspace',
    glyph: '🛣',
    accent: 'amber',
    audiences: ['workspace'],
    agent: AgentType.CIVIL_DRAFTER,
    widgetType: 'road-paint-studio',
    keywords: ['road paint', 'pavement marking', 'dyl', 'double yellow', 'swl', 'single white line', 'centerline offset'],
  },
  {
    id: 'workspace-wms-manager',
    title: 'WMS & Offline Maps',
    description: 'Connect WMS map servers, toggle imagery layers, and manage offline map areas.',
    category: 'workspace',
    glyph: '🌐',
    accent: 'emerald',
    audiences: ['workspace'],
    agent: AgentType.GIS_AGENT,
    widgetType: 'wms-manager',
    keywords: ['wms', 'web map service', 'offline maps', 'imagery'],
  },
  {
    id: 'workspace-text-editor',
    title: 'Text Editor',
    description: 'Open project text, deed transcripts, and .md notes in the A2UI text surface.',
    category: 'workspace',
    glyph: 'T',
    accent: 'cyan',
    audiences: ['workspace'],
    agent: AgentType.TEXT_EDITOR,
    widgetType: 'text-editor',
    keywords: ['text', 'editor', 'markdown', 'md', 'txt', 'deed text', 'notes', 'transcript'],
  },
  {
    id: 'workspace-spreadsheet',
    title: 'Spreadsheet',
    description: 'Open a lightweight searchable grid for points, tables, and agent data.',
    category: 'workspace',
    glyph: '▦',
    accent: 'emerald',
    audiences: ['workspace'],
    agent: AgentType.LSVZ_AGENT,
    widgetType: 'spreadsheet',
    keywords: ['spreadsheet', 'sheet', 'grid', 'table', 'csv', 'tsv', 'points', 'data'],
  },
  {
    id: 'workspace-file-manager',
    title: 'File Manager',
    description: 'Browse uploaded and generated project files, open in Text Editor, or mark DXF templates.',
    category: 'workspace',
    glyph: '📁',
    accent: 'sky',
    audiences: ['workspace'],
    agent: AgentType.LSVZ_AGENT,
    widgetType: 'file-manager',
    keywords: ['files', 'file manager', 'project files', 'downloads'],
  },
  {
    id: 'workspace-fieldbook',
    title: 'Field Book',
    description: 'View and edit survey field notes, audit log entries, and export to Notion.',
    category: 'workspace',
    glyph: '📓',
    accent: 'amber',
    audiences: ['workspace'],
    agent: AgentType.FIELD_BOOK,
    widgetType: 'fieldbook-panel',
    keywords: ['fieldbook', 'field book', 'notes', 'log'],
  },
  {
    id: 'workspace-cutsheet',
    title: 'Stakeout Cut Sheet',
    description: 'Review and export stakeout cut/fill sheets with company and crew headers.',
    category: 'workspace',
    glyph: '📋',
    accent: 'sky',
    audiences: ['workspace'],
    agent: AgentType.GPS_STAKEOUT,
    widgetType: 'cutsheet-panel',
    keywords: ['cutsheet', 'cut sheet', 'stakeout', 'grade'],
  },
  {
    id: 'workspace-gps-rover',
    title: 'GPS Rover',
    description:
      'Live rover fix, stakeout navigation, point collection, and benchmark checks. Project location lives in the LSAI Agent toolset.',
    category: 'workspace',
    glyph: '⌖',
    accent: 'sky',
    audiences: ['workspace'],
    agent: AgentType.GPS_STAKEOUT,
    widgetType: 'gps-rover',
    keywords: ['gps', 'rover', 'rtk', 'stakeout', 'collect', 'benchmark', 'calibration'],
  },
  {
    id: 'workspace-closure-report',
    title: 'Closure Reports',
    description: 'Inspect boundary and traverse closure precision, misclosure, and area calculations.',
    category: 'workspace',
    glyph: '⬡',
    accent: 'emerald',
    audiences: ['workspace'],
    agent: AgentType.DEED_READER,
    widgetType: 'closure-report',
    keywords: ['closure', 'closure report', 'precision', 'traverse'],
  },
  {
    id: 'workspace-closure-investigation',
    title: 'Closure investigation',
    description:
      'Compare parsed boundary calls with the source deed, inspect deterministic geometry findings, and review evidence-based closure hypotheses.',
    category: 'workspace',
    glyph: '⌕',
    accent: 'cyan',
    audiences: ['workspace'],
    agent: AgentType.DEED_READER,
    widgetType: 'closure-investigation',
    keywords: ['closure', 'investigate', 'investigation', 'misclosure', 'deed evidence', 'hypothesis'],
  },
  {
    id: 'workspace-tin-surfaces',
    title: 'TIN Surfaces',
    description:
      'Draw a loaded .tin or LandXML surface on the canvas as a wireframe or shaded elevation model, build a surface from contours, and export LandXML or native .tin.',
    category: 'workspace',
    glyph: '△',
    accent: 'cyan',
    audiences: ['workspace'],
    agent: AgentType.CONTOURING_AGENT,
    widgetType: 'tin-surfaces',
    keywords: [
      'tin',
      'surface',
      'mesh',
      'wireframe',
      'shaded',
      'draw surface',
      'draw mesh',
      'surface display',
      'landxml',
      'import tin',
      'export tin',
      'contour surface',
    ],
  },
  // Every contour tool is its own A2UI chip. Chips deliberately have no dock
  // controls: the catalog/chat layer raises them on demand, and each is
  // independently addressable by id and widgetType.
  ...CONTOUR_CHIP_IDS.map((chip): A2UISurfaceDefinition => {
    const meta = CONTOUR_CHIP_META[chip];
    return {
      id: `workspace-${chip}`,
      title: meta.label,
      description: meta.description,
      category: 'workspace',
      glyph: meta.glyph,
      accent: meta.accent,
      audiences: ['workspace'],
      agent: AgentType.CONTOURING_AGENT,
      widgetType: chip,
      keywords: meta.keywords,
    };
  }),
  {
    id: 'workspace-steep-slope-report',
    title: 'Steep Slope Report',
    description: 'Inspect TIN slope-band analysis runs and area breakdowns.',
    category: 'workspace',
    glyph: '⛰',
    accent: 'rose',
    audiences: ['workspace'],
    agent: AgentType.STEEP_SLOPE_AGENT,
    widgetType: 'steep-slope-report',
    keywords: ['steep slope', 'slope report', 'tin', 'grading'],
  },
  {
    id: 'workspace-legal-writer',
    title: 'Legal Description Writer',
    description: 'Author and regenerate metes-and-bounds legal descriptions with custom formatting.',
    category: 'workspace',
    glyph: '¶',
    accent: 'emerald',
    audiences: ['workspace'],
    agent: AgentType.DEED_READER,
    widgetType: 'legal-writer',
    keywords: ['legal writer', 'legal description', 'metes and bounds'],
  },
  {
    id: 'workspace-legend',
    title: 'Legend',
    description:
      'Edit the paperspace legend — labels, colors, hatch patterns, columns, and placement — and write the styles back to the drawing.',
    category: 'workspace',
    glyph: '▤',
    accent: 'cyan',
    audiences: ['workspace'],
    agent: AgentType.CAD_MANAGER,
    keywords: ['legend', 'symbol key', 'key map', 'hatch legend', 'paperspace legend'],
  },
  {
    id: 'workspace-sheet-view',
    title: 'Sheet View (24×36 Plot Layout)',
    description: 'Preview and configure the 24×36 paperspace plot sheet and titleblock.',
    category: 'workspace',
    glyph: '▭',
    accent: 'amber',
    audiences: ['workspace'],
    agent: AgentType.CAD_MANAGER,
    widgetType: 'sheet-view',
    keywords: ['sheet view', 'paperspace', 'plot', 'layout', 'titleblock'],
  },

  // ── Protocol ──────────────────────────────────────────────────────────────
  {
    id: 'cacp-manifests',
    title: 'CACP manifest explorer',
    description: 'Browse every registered agent, skill, input, and output schema.',
    category: 'protocol',
    glyph: '⇄',
    accent: 'emerald',
    audiences: ['workspace', 'public'],
    keywords: ['cacp', 'manifest', 'skills', 'agents', 'protocol'],
  },
  {
    id: 'cacp-review',
    title: 'CACP traffic review',
    description: 'Inspect notable inter-agent traffic, policy warnings, and blocked sends.',
    category: 'protocol',
    glyph: '!',
    accent: 'amber',
    audiences: ['workspace'],
    keywords: ['cacp', 'review', 'policy', 'blocked', 'traffic'],
  },
  {
    id: 'cacp-inspector',
    title: 'CACP protocol inspector',
    description: 'Live spec version, registered agents, skills, and protocol activity.',
    category: 'protocol',
    glyph: '◎',
    accent: 'emerald',
    audiences: ['public'],
    keywords: ['cacp', 'protocol', 'spec', 'inspector'],
  },

  // ── Dialogs and system ────────────────────────────────────────────────────
  {
    id: 'point-tools',
    title: 'Point Tools',
    description: 'Capture, add, review, label, and manage survey points from one workspace.',
    category: 'workspace',
    glyph: 'P',
    accent: 'cyan',
    audiences: ['workspace'],
    agent: AgentType.POINT_EDITOR,
    widgetType: 'point-tools',
    keywords: ['point tools', 'point workspace', 'add point', 'point list', 'point labeling', 'import points'],
  },
  {
    id: 'point-entry',
    title: 'Add Point',
    description: 'Enter a survey point by number, coordinates, elevation, and description, or pick it on the canvas through PointAgent CACP.',
    category: 'dialog',
    glyph: 'P',
    accent: 'emerald',
    audiences: ['workspace'],
    agent: AgentType.POINT_EDITOR,
    widgetType: 'point-entry',
    keywords: ['point', 'add point', 'point entry', 'point dialog', 'survey point', 'coordinates', 'cacp'],
  },
  {
    id: 'settings',
    title: 'Settings',
    description: 'Open the full settings dialog from any surface.',
    category: 'dialog',
    glyph: '⚙',
    accent: 'sky',
    audiences: ['workspace'],
    keywords: ['settings', 'preferences', 'units', 'model'],
  },
  {
    id: 'help',
    title: 'Command reference',
    description: 'Open the canvas command and workflow reference.',
    category: 'dialog',
    glyph: '?',
    accent: 'cyan',
    audiences: ['workspace'],
    keywords: ['help', 'commands', 'reference'],
  },
  {
    id: 'page-guide',
    title: 'Page guide',
    description: 'Context-aware guide for the current public page.',
    category: 'system',
    glyph: 'i',
    accent: 'sky',
    audiences: ['public'],
    keywords: ['guide', 'page', 'help'],
  },
  {
    id: 'surface-console',
    title: 'Surface console',
    description: 'Search and launch every surface available in this context.',
    category: 'system',
    glyph: '⌘',
    accent: 'cyan',
    audiences: ['workspace', 'public'],
    keywords: ['surface', 'console', 'launcher', 'a2ui'],
  },
] as const;

export function listA2UISurfaces(audience?: A2UISurfaceAudience): A2UISurfaceDefinition[] {
  if (!audience) return [...A2UI_SURFACE_CATALOG];
  return A2UI_SURFACE_CATALOG.filter(definition => definition.audiences.includes(audience));
}

export function getA2UISurfaceDefinition(id: string): A2UISurfaceDefinition | undefined {
  return A2UI_SURFACE_CATALOG.find(definition => definition.id === id);
}

export function searchA2UISurfaces(
  query: string,
  audience?: A2UISurfaceAudience,
): A2UISurfaceDefinition[] {
  const definitions = listA2UISurfaces(audience);
  const needle = query.trim().toLowerCase();
  if (!needle) return definitions;
  return definitions.filter(definition => {
    const haystack = [
      definition.title,
      definition.description,
      definition.category,
      definition.agent ?? '',
      definition.widgetType ?? '',
      ...(definition.keywords ?? []),
    ]
      .join(' ')
      .toLowerCase();
    return needle
      .split(/\s+/)
      .filter(Boolean)
      .every(token => haystack.includes(token));
  });
}

// ---------------------------------------------------------------------------
// Open-surface bus
// ---------------------------------------------------------------------------

export interface A2UISurfaceInstance {
  key: string;
  definitionId?: string;
  title: string;
  subtitle?: string;
  category: A2UISurfaceCategory;
  accent: A2UISurfaceAccent;
  size: A2UISurfaceSize;
  dismissible: boolean;
  /** Who opened it — used for diagnostics and tests. */
  source?: string;
  openedAt: number;
  content: ReactNode;
}

export interface A2UISurfaceOpenOptions {
  /** Stable identity. Opening the same key replaces the existing surface. */
  key?: string;
  definitionId?: string;
  title: string;
  subtitle?: string;
  category?: A2UISurfaceCategory;
  accent?: A2UISurfaceAccent;
  size?: A2UISurfaceSize;
  dismissible?: boolean;
  source?: string;
  content: ReactNode;
}

class A2UISurfaceBus {
  private surfaces: A2UISurfaceInstance[] = [];
  private listeners = new Set<() => void>();
  private sequence = 0;

  open(options: A2UISurfaceOpenOptions): string {
    const key = options.key || options.definitionId || `a2ui-surface-${++this.sequence}`;
    const instance: A2UISurfaceInstance = {
      key,
      definitionId: options.definitionId,
      title: options.title,
      subtitle: options.subtitle,
      category: options.category ?? 'system',
      accent: options.accent ?? 'cyan',
      size: options.size ?? 'standard',
      dismissible: options.dismissible !== false,
      source: options.source,
      openedAt: Date.now(),
      content: options.content,
    };
    this.surfaces = [...this.surfaces.filter(surface => surface.key !== key), instance];
    this.emit();
    return key;
  }

  close(key: string): void {
    const next = this.surfaces.filter(surface => surface.key !== key);
    if (next.length === this.surfaces.length) return;
    this.surfaces = next;
    this.emit();
  }

  closeAll(): void {
    if (this.surfaces.length === 0) return;
    this.surfaces = [];
    this.emit();
  }

  setSize(key: string, size: A2UISurfaceSize): void {
    let changed = false;
    this.surfaces = this.surfaces.map(surface => {
      if (surface.key !== key || surface.size === size) return surface;
      changed = true;
      return { ...surface, size };
    });
    if (changed) this.emit();
  }

  get(key: string): A2UISurfaceInstance | undefined {
    return this.surfaces.find(surface => surface.key === key);
  }

  isOpen(key: string): boolean {
    return this.surfaces.some(surface => surface.key === key);
  }

  /** Stable snapshot for useSyncExternalStore. */
  getSnapshot = (): A2UISurfaceInstance[] => this.surfaces;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch {
        /* a broken surface must never take the app down */
      }
    }
  }
}

export const a2uiSurfaceBus = new A2UISurfaceBus();

export function openA2UISurface(options: A2UISurfaceOpenOptions): string {
  return a2uiSurfaceBus.open(options);
}

export function closeA2UISurface(key: string): void {
  a2uiSurfaceBus.close(key);
}

// ---------------------------------------------------------------------------
// Public subdomain page guides
// ---------------------------------------------------------------------------

export interface A2UIPageGuide {
  title: string;
  eyebrow: string;
  summary: string;
  highlights: Array<{ label: string; detail: string }>;
  links: Array<{ label: string; href: string }>;
}

/**
 * Page-aware content for the public surface layer. Keys are subdomain prefixes
 * (docs/documentation share an entry; staging-* falls back to the base key).
 */
export const PUBLIC_PAGE_GUIDES: Record<string, A2UIPageGuide> = {
  cacp: {
    title: 'CACP protocol inspector',
    eyebrow: 'Cross-Agent Communications',
    summary:
      'CACP is the cross-agent protocol that lets specialised survey agents discover each other, delegate skills, and return validated results without hard-wired hand-offs.',
    highlights: [
      { label: 'Envelope', detail: 'Versioned event and action notifications with intent, payload, and trace ids.' },
      { label: 'Skills', detail: 'Manifests declare deterministic inputs, outputs, and action/query semantics.' },
      { label: 'Policy', detail: 'Ownership, schema, and rate checks run before any peer dispatch.' },
    ],
    links: [
      { label: 'Read the protocol', href: '/#protocol' },
      { label: 'Agent manifest index', href: '/#agents' },
      { label: 'Launch the app', href: 'https://landsurv.ai' },
    ],
  },
  documentation: {
    title: 'Documentation guide',
    eyebrow: 'Docs surface',
    summary:
      'Find platform guides, agent references, API notes, and workflow walkthroughs. Open a surface from any docs page without leaving the article.',
    highlights: [
      { label: 'Getting started', detail: 'Projects, sessions, units, and the drawing canvas.' },
      { label: 'Agent reference', detail: 'Inputs, outputs, and hand-offs for every specialist.' },
      { label: 'Integrations', detail: 'CACP, Civil 3D, GNSS, and the AI gateway.' },
    ],
    links: [
      { label: 'Browse docs', href: '/#pillars' },
      { label: 'Launch the app', href: 'https://landsurv.ai' },
    ],
  },
  standards: {
    title: 'Standards quick reference',
    eyebrow: 'Reference library',
    summary:
      'Surveying, GIS, civil, and CAD standards used across LandSurv.ai. Use the surface console to jump between reference categories.',
    highlights: [
      { label: 'Data formats', detail: 'RAW, CSV, DXF/DWG, GeoJSON, LandXML, and RINEX.' },
      { label: 'Drafting', detail: 'Layer, linetype, symbol, and description-key conventions.' },
      { label: 'Compliance', detail: 'AEC, USACE, and local agency submission checks.' },
    ],
    links: [
      { label: 'Browse standards', href: '/#standards' },
      { label: 'Run a compliance audit', href: 'https://landsurv.ai' },
    ],
  },
  compliance: {
    title: 'Trust center guide',
    eyebrow: 'Security & compliance',
    summary:
      'Review the controls, certifications, and data-handling commitments behind the platform. Surface pages keep the detail one click away.',
    highlights: [
      { label: 'Data handling', detail: 'Encryption in transit and at rest, retention, and export controls.' },
      { label: 'Access', detail: 'SSO, scoped API keys, and role-based project access.' },
      { label: 'Assurance', detail: 'Audit logging, incident response, and subprocessor review.' },
    ],
    links: [
      { label: 'Trust center', href: '/#controls' },
      { label: 'Contact security', href: 'mailto:security@landsurv.ai' },
    ],
  },
  gateway: {
    title: 'AI Gateway guide',
    eyebrow: 'Gateway',
    summary:
      'The gateway routes model traffic, enforces quotas, and keeps provider keys out of the browser. Inspect capabilities before wiring a client.',
    highlights: [
      { label: 'Routing', detail: 'Task-aware model selection with deterministic fallbacks.' },
      { label: 'Keys', detail: 'Server-side provider keys and scoped project tokens.' },
      { label: 'Limits', detail: 'Per-project quotas, retries, and structured error codes.' },
    ],
    links: [
      { label: 'Gateway overview', href: '/#capabilities' },
      { label: 'Open the app', href: 'https://landsurv.ai' },
    ],
  },
  legal: {
    title: 'Legal & compliance guide',
    eyebrow: 'Policies',
    summary:
      'Terms, privacy, DPA, and subprocessors in one place. Every policy page can raise a surface without losing your reading position.',
    highlights: [
      { label: 'Terms', detail: 'Commercial terms, acceptable use, and service levels.' },
      { label: 'Privacy', detail: 'What is collected, why, and how long it is retained.' },
      { label: 'Subprocessors', detail: 'The current vendor list and processing scope.' },
    ],
    links: [
      { label: 'Terms of Service', href: 'https://tos.landsurv.ai' },
      { label: 'Privacy Policy', href: 'https://privacy.landsurv.ai' },
      { label: 'DPA', href: 'https://dpa.landsurv.ai' },
    ],
  },
  default: {
    title: 'Page guide',
    eyebrow: 'LandSurv.ai',
    summary:
      'Open live surfaces for protocol inspection, manifests, and page-specific guidance — without leaving this page or starting a project.',
    highlights: [
      { label: 'Surface console', detail: 'Search every surface available in this context.' },
      { label: 'CACP manifests', detail: 'Inspect registered agents and their skill schemas.' },
      { label: 'Launch', detail: 'Open the full workspace when you are ready to draw.' },
    ],
    links: [{ label: 'Launch the app', href: 'https://landsurv.ai' }],
  },
};

export function resolvePublicPageKey(subdomain: string | null | undefined): string {
  const raw = (subdomain ?? '').trim().toLowerCase();
  if (!raw) return 'default';
  const normalized = raw.replace(/^staging[-_]/, '');
  if (normalized === 'docs' || normalized === 'staging-docs') return 'documentation';
  return PUBLIC_PAGE_GUIDES[normalized] ? normalized : 'default';
}

export function getPublicPageGuide(subdomain: string | null | undefined): A2UIPageGuide {
  return PUBLIC_PAGE_GUIDES[resolvePublicPageKey(subdomain)] ?? PUBLIC_PAGE_GUIDES.default;
}
