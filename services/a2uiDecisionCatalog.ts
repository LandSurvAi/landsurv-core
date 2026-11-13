/**
 * A2UI Decision Pilot Catalog
 *
 * A deliberately small catalog for the two-week shadow pilot. It covers the
 * surfaces where regex misses and false opens are most likely, not every
 * surface in the product. The full registry described in
 * A2UI-DECISION-1-spec.md can replace this after the pilot.
 *
 * This file is the canonical client/test copy. The backend reads an identical
 * JSON copy at backend/src/data/a2uiDecisionCatalog.json; a test asserts they
 * stay in sync.
 */

export type A2UIDecisionFamily =
  | 'settings'
  | 'workspace'
  | 'data'
  | 'contour'
  | 'navigation'
  | 'protocol';

export type A2UIDecisionRiskTier = 'safe' | 'caution' | 'restricted';

export interface A2UIDecisionCatalogEntry {
  id: string;
  label: string;
  family: A2UIDecisionFamily;
  riskTier: A2UIDecisionRiskTier;
  /** One sentence, kept short because it is sent on every request. */
  description: string;
  /** Two to five short paraphrases. */
  examples: string[];
  /** Specific words that should strongly bias the free fuzzy baseline. */
  keywords: string[];
  /** Stable key for the existing regex intent. */
  regexSurface: string;
}

export interface A2UIDecisionStateInput {
  activeAgent: string | null;
  pointCount: number;
  hasBoundary: boolean;
  centerlineCount: number;
  cadStandardsLoaded: boolean;
}

export interface A2UIDecisionState {
  activeAgent: string | null;
  hasPoints: boolean;
  pointCountBucket: '0' | '1-9' | '10-100' | '101-1000' | '1000+';
  hasBoundary: boolean;
  hasCenterlines: boolean;
  centerlineCountBucket: '0' | '1' | '2-5' | '6+';
  cadStandardsLoaded: boolean;
}

export const A2UI_DECISION_NONE_ID = 'NONE';
export const A2UI_DECISION_CATALOG_VERSION = 'a2ui-pilot-2026-11-12';

export const A2UI_DECISION_CATALOG: readonly A2UIDecisionCatalogEntry[] = [
  {
    id: 'surface:settings:crs',
    label: 'Coordinate System & Projection',
    family: 'settings',
    riskTier: 'safe',
    description: 'Change the State Plane zone, datum, EPSG code, or projection settings.',
    examples: [
      'change state plane',
      'set the EPSG code',
      'switch projection zone',
      'where do I change the coordinate system',
    ],
    keywords: ['state plane', 'epsg', 'projection', 'datum', 'coordinate system', 'crs', 'zone'],
    regexSurface: 'settings:crs',
  },
  {
    id: 'surface:settings:display',
    label: 'Canvas & Display',
    family: 'settings',
    riskTier: 'safe',
    description: 'Adjust units, precision, north arrow, point symbols, or theme.',
    examples: [
      'change linear units',
      'set decimal places',
      'switch to dark mode',
      'turn on point symbols',
    ],
    keywords: ['units', 'precision', 'decimal places', 'north arrow', 'theme', 'dark mode', 'point symbols'],
    regexSurface: 'settings:display',
  },
  {
    id: 'surface:settings:graphics',
    label: 'Graphics & WebGPU',
    family: 'settings',
    riskTier: 'safe',
    description: 'Toggle WebGPU hardware acceleration or change the GPU power preference.',
    examples: [
      'turn on webgpu',
      'disable hardware acceleration',
      'change graphics settings',
      'use the discrete gpu',
    ],
    keywords: ['webgpu', 'graphics', 'gpu', 'hardware acceleration', 'rendering'],
    regexSurface: 'settings:graphics',
  },
  {
    id: 'surface:settings:ai-model',
    label: 'AI Behavior & Model',
    family: 'settings',
    riskTier: 'safe',
    description: 'Switch the active AI model, high-thinking route, or uncertainty sensitivity.',
    examples: [
      'change the ai model',
      'open model settings',
      'set the high thinking model',
      'configure api keys',
    ],
    keywords: ['ai model', 'model settings', 'high thinking', 'uncertainty', 'api key'],
    regexSurface: 'settings:ai-model',
  },
  {
    id: 'surface:workspace:centerline-list',
    label: 'Centerlines & Baselines',
    family: 'workspace',
    riskTier: 'safe',
    description: 'List, select, or manage the project centerlines and baselines.',
    examples: [
      'show all centerlines',
      'open the baseline list',
      'manage alignments',
      'list baselines',
    ],
    keywords: ['centerline', 'baseline', 'alignment', 'stationing'],
    regexSurface: 'workspace:centerline-list',
  },
  {
    id: 'surface:workspace:symbol-manager',
    label: 'Symbol Manager',
    family: 'workspace',
    riskTier: 'safe',
    description: 'Browse, create, or export survey point symbols.',
    examples: [
      'open symbol manager',
      'create a custom symbol',
      'export all symbols',
      'manage survey symbols',
    ],
    keywords: ['symbol', 'symbols', 'point symbol', 'custom symbol'],
    regexSurface: 'workspace:symbol-manager',
  },
  {
    id: 'surface:workspace:layer-manager',
    label: 'Data Visibility & Layer Manager',
    family: 'workspace',
    riskTier: 'safe',
    description: 'Toggle point, CAD layer, WMS, and boundary visibility.',
    examples: [
      'open layer manager',
      'hide a layer',
      'toggle layer visibility',
      'change data visibility',
    ],
    keywords: ['layer', 'layers', 'visibility', 'hide', 'show layer'],
    regexSurface: 'workspace:layer-manager',
  },
  {
    id: 'surface:workspace:compliance-summary',
    label: 'Standards Compliance Audit',
    family: 'workspace',
    riskTier: 'safe',
    description: 'Review standards compliance findings and run a fresh audit.',
    examples: [
      'open compliance summary',
      'run compliance now',
      'show compliance findings',
      'standards audit',
    ],
    keywords: ['compliance', 'audit', 'standards', 'findings'],
    regexSurface: 'workspace:compliance-summary',
  },
  {
    id: 'surface:workspace:fieldbook-panel',
    label: 'Survey Field Book',
    family: 'workspace',
    riskTier: 'safe',
    description: 'Review field notes, logged actions, and export to Notion.',
    examples: [
      'open field book',
      'show field notes',
      'log a note',
      'export to notion',
    ],
    keywords: ['field book', 'fieldbook', 'notes', 'log', 'notion'],
    regexSurface: 'workspace:fieldbook-panel',
  },
  {
    id: 'surface:workspace:legend',
    label: 'Drawing Legend',
    family: 'workspace',
    riskTier: 'safe',
    description: 'Open the drawing legend and edit labels, colors, hatches, and columns.',
    examples: [
      'open the legend',
      'edit the legend',
      'show the symbol key',
      'change legend labels',
    ],
    keywords: ['legend', 'symbol key', 'key map'],
    regexSurface: 'workspace:legend',
  },
  {
    id: 'surface:workspace:sheet-view',
    label: 'Sheet View',
    family: 'workspace',
    riskTier: 'safe',
    description: 'Preview the 24x36 paperspace sheet and titleblock metadata.',
    examples: [
      'open sheet view',
      'show the plot layout',
      'preview the sheet',
      'open paperspace',
    ],
    keywords: ['sheet', 'paperspace', 'plot', 'titleblock', 'layout'],
    regexSurface: 'workspace:sheet-view',
  },
  {
    id: 'surface:data:point-list',
    label: 'Point List',
    family: 'data',
    riskTier: 'safe',
    description: 'Show the project points as a text list or spreadsheet.',
    examples: [
      'show the point list',
      'open all points',
      'list the points',
      'view points as a spreadsheet',
    ],
    keywords: ['point list', 'points', 'survey points', 'point table'],
    regexSurface: 'data:point-list',
  },
  {
    id: 'surface:data:point-editor',
    label: 'Point Editor',
    family: 'data',
    riskTier: 'safe',
    description: 'Add, edit, sort, and save points in the point editor.',
    examples: [
      'open the point editor',
      'edit a point',
      'change point coordinates',
      'sort the points',
    ],
    keywords: ['point editor', 'edit point', 'point coordinates'],
    regexSurface: 'data:point-editor',
  },
  {
    id: 'surface:data:text-editor',
    label: 'Text Editor',
    family: 'data',
    riskTier: 'safe',
    description: 'Open or create a text or Markdown document.',
    examples: [
      'open the text editor',
      'show the deed text',
      'create a markdown note',
      'edit the document',
    ],
    keywords: ['text editor', 'deed text', 'markdown', 'document', 'note'],
    regexSurface: 'data:text-editor',
  },
  {
    id: 'surface:data:spreadsheet',
    label: 'Spreadsheet',
    family: 'data',
    riskTier: 'safe',
    description: 'Open a scratch spreadsheet for tables and quick calculations.',
    examples: [
      'open a spreadsheet',
      'create a new spreadsheet',
      'show a table',
      'blank spreadsheet',
    ],
    keywords: ['spreadsheet', 'table', 'grid', 'scratch'],
    regexSurface: 'data:spreadsheet',
  },
  {
    id: 'surface:contour:contour-cleanup',
    label: 'Contour Cleanup',
    family: 'contour',
    riskTier: 'safe',
    description: 'Filter non-ground shots, structure shots, and contour elevation outliers.',
    examples: [
      'open contour cleanup',
      'filter non-ground points',
      'remove structure shots',
      'clean up contours',
    ],
    keywords: ['contour cleanup', 'non-ground', 'structure shot', 'invert', 'elevation filter'],
    regexSurface: 'contour:contour-cleanup',
  },
  {
    id: 'surface:navigation:key-entry',
    label: 'Credential Key Entry',
    family: 'navigation',
    riskTier: 'restricted',
    description: 'Enter or update a provider API key or the LandSurv enabling key.',
    examples: [
      'add my openai key',
      'enter my gemini api key',
      'where do I put my key',
      'update my api key',
    ],
    keywords: ['api key', 'key entry', 'openai key', 'gemini key', 'credential'],
    regexSurface: 'navigation:key-entry',
  },
  {
    id: 'surface:navigation:hatch-studio',
    label: 'Hatch Studio',
    family: 'navigation',
    riskTier: 'safe',
    description: 'Choose a hatch pattern, scale, angle, and place it on the canvas.',
    examples: [
      'hatch the building',
      'add a hatch pattern',
      'fill the area with a hatch',
      'change the hatch scale',
    ],
    keywords: ['hatch', 'bhatch', 'fill', 'pattern', 'shade'],
    regexSurface: 'navigation:hatch-studio',
  },
  {
    id: 'surface:protocol:cacp-manifests',
    label: 'CACP Manifest Explorer',
    family: 'protocol',
    riskTier: 'safe',
    description: 'Browse the skill and capability manifests for CACP-enabled agents.',
    examples: [
      'show cacp manifests',
      'list agent skills',
      'inspect the cad manager manifest',
      'what skills does the agent have',
    ],
    keywords: ['cacp', 'manifest', 'skill', 'capability', 'schema'],
    regexSurface: 'protocol:cacp-manifests',
  },
  {
    id: 'surface:protocol:cacp-review',
    label: 'CACP Traffic Review',
    family: 'protocol',
    riskTier: 'safe',
    description: 'Review blocked or warned CACP traffic and policy events.',
    examples: [
      'review blocked traffic',
      'show cacp warnings',
      'why was the send blocked',
      'open cacp review',
    ],
    keywords: ['cacp', 'blocked', 'policy', 'warning', 'traffic'],
    regexSurface: 'protocol:cacp-review',
  },
] as const;

export function bucketPointCount(count: number): A2UIDecisionState['pointCountBucket'] {
  if (count <= 0) return '0';
  if (count < 10) return '1-9';
  if (count <= 100) return '10-100';
  if (count <= 1000) return '101-1000';
  return '1000+';
}

export function bucketCenterlineCount(count: number): A2UIDecisionState['centerlineCountBucket'] {
  if (count <= 0) return '0';
  if (count === 1) return '1';
  if (count <= 5) return '2-5';
  return '6+';
}

export function buildA2UIDecisionState(input: A2UIDecisionStateInput): A2UIDecisionState {
  return {
    activeAgent: input.activeAgent,
    hasPoints: input.pointCount > 0,
    pointCountBucket: bucketPointCount(input.pointCount),
    hasBoundary: input.hasBoundary,
    hasCenterlines: input.centerlineCount > 0,
    centerlineCountBucket: bucketCenterlineCount(input.centerlineCount),
    cadStandardsLoaded: input.cadStandardsLoaded,
  };
}

export function getCatalogEntry(id: string): A2UIDecisionCatalogEntry | undefined {
  return A2UI_DECISION_CATALOG.find(entry => entry.id === id);
}

/**
 * Maps the existing typed surface intent to this catalog's stable id. Used by
 * the benchmark to compare regex and Decision 1 on the same labels.
 */
export function regexIntentToCatalogId(
  intent: { surface: string; section?: string; tool?: string; chip?: string } | null,
): string | null {
  if (!intent) return null;
  switch (intent.surface) {
    case 'settings':
      return intent.section ? `settings:${intent.section}` : null;
    case 'workspace-tool':
      return intent.tool ? `workspace:${intent.tool}` : null;
    case 'contour-chip':
      return intent.chip ? `contour:${intent.chip}` : null;
    case 'point-list':
      return 'data:point-list';
    case 'point-editor':
      return 'data:point-editor';
    case 'text-editor':
      return 'data:text-editor';
    case 'spreadsheet':
      return 'data:spreadsheet';
    case 'key-entry':
      return 'navigation:key-entry';
    case 'hatch-studio':
      return 'navigation:hatch-studio';
    case 'cacp-manifests':
      return 'protocol:cacp-manifests';
    case 'cacp-review':
      return 'protocol:cacp-review';
    default:
      return intent.surface;
  }
}
