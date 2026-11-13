import type { A2UIContourChipId } from '../types.ts';

export type ContourChipAccent = 'cyan' | 'emerald' | 'amber' | 'fuchsia' | 'sky' | 'rose';

export interface ContourChipMeta {
  id: A2UIContourChipId;
  label: string;
  shortLabel: string;
  /** Hex color for the left edge rail. */
  color: string;
  accent: ContourChipAccent;
  glyph: string;
  description: string;
  capability: string;
  keywords: string[];
  replyText: string;
  suggestedQuestions: string[];
}

export const CONTOUR_CHIP_IDS: readonly A2UIContourChipId[] = [
  'contour-source',
  'contour-intervals',
  'contour-cleanup',
  'contour-scope',
  'contour-labels',
  'contour-ignore-points',
  'contour-actions',
  'contour-generations',
  'contour-generation',
  'contour-blend',
  'contour-esri',
];

export const CONTOUR_CHIP_META: Record<A2UIContourChipId, ContourChipMeta> = {
  'contour-source': {
    id: 'contour-source',
    label: 'Contour Source',
    shortLabel: 'Source',
    color: '#22d3ee',
    accent: 'cyan',
    glyph: '◎',
    description: 'Choose survey points or a loaded TIN and filter which shots feed the surface.',
    capability: 'open_contour_source_chip',
    keywords: ['contour source', 'survey points', 'tin contours', 'surface source', 'point filter'],
    replyText:
      'Here are the live <strong>Contour Source</strong> controls. Switch between survey points and a loaded TIN, pick the surface, and filter the point descriptions before anything is triangulated.',
    suggestedQuestions: [
      'Open contour intervals',
      'Open contour cleanup',
      'Generate contours',
    ],
  },
  'contour-intervals': {
    id: 'contour-intervals',
    label: 'Contour Intervals',
    shortLabel: 'Intervals',
    color: '#60a5fa',
    accent: 'sky',
    glyph: '≡',
    description: 'Stage minor/major intervals, presets, and curve subdivision without generating.',
    capability: 'open_contour_intervals_chip',
    keywords: ['contour interval', 'major interval', 'minor interval', 'smoothing', 'contour preset'],
    replyText:
      'Here are the live <strong>Contour Intervals</strong> controls. Presets and interval controls only stage the setting — press Generate in the Contour Actions panel when you are ready.',
    suggestedQuestions: [
      'Open contour source',
      'Open contour actions',
      'Open contour labels',
    ],
  },
  'contour-cleanup': {
    id: 'contour-cleanup',
    label: 'Surface Cleanup',
    shortLabel: 'Cleanup',
    color: '#a3e635',
    accent: 'emerald',
    glyph: '⌫',
    description: 'Drop invert, finished-floor, and structure shots before triangulation.',
    capability: 'open_contour_cleanup_chip',
    keywords: ['contour cleanup', 'non-ground points', 'invert shots', 'ffe', 'structure shots', 'elevation filter'],
    replyText:
      'Here are the live <strong>Surface Cleanup</strong> controls. They flag invert, finished-floor, and structure shots before the TIN is built so they cannot spike the surface or create tight contour rings.',
    suggestedQuestions: [
      'Open ignore points for contours',
      'Open contour source',
      'Generate contours',
    ],
  },
  'contour-scope': {
    id: 'contour-scope',
    label: 'Contour Scope',
    shortLabel: 'Scope',
    color: '#f472b6',
    accent: 'rose',
    glyph: '⬚',
    description: 'Bind an inclusion boundary and contour inside or outside it.',
    capability: 'open_contour_scope_chip',
    keywords: ['contour scope', 'inclusion boundary', 'inside boundary', 'outside boundary', 'breaklines', 'exclusion'],
    replyText:
      'Here are the live <strong>Contour Scope</strong> controls. Pick the inclusion boundary and choose <strong>inside</strong> or <strong>outside</strong>; these controls also report breakline, inclusion, and exclusion segment counts.',
    suggestedQuestions: [
      'Use the outside boundary for contours',
      'Open contour cleanup',
      'Generate contours',
    ],
  },
  'contour-labels': {
    id: 'contour-labels',
    label: 'Contour Labels',
    shortLabel: 'Labels',
    color: '#2dd4bf',
    accent: 'amber',
    glyph: 'T',
    description: 'Control label visibility, density, scale, and strike placement/erase tools.',
    capability: 'open_contour_labels_chip',
    keywords: ['contour labels', 'label contours', 'label density', 'label scale', 'strike label', 'relabel contours'],
    replyText:
      'Here are the live <strong>Contour Labels</strong> controls. Toggle labels, tune density and scale, or arm the canvas strike tools to place and erase labels.',
    suggestedQuestions: [
      'Re-label the visible contours',
      'Clear contour labels',
      'Open contour intervals',
    ],
  },
  'contour-ignore-points': {
    id: 'contour-ignore-points',
    label: 'Ignore Points',
    shortLabel: 'Ignore',
    color: '#e879f9',
    accent: 'fuchsia',
    glyph: '⊘',
    description: 'Search the point database and exclude specific shots or similar descriptions.',
    capability: 'open_contour_ignore_points_chip',
    keywords: ['ignore points', 'exclude points', 'contour point filter', 'smart match', 'bad shots'],
    replyText:
      'Here are the live <strong>Ignore Points</strong> controls. Search by point number or description, toggle shots out of the TIN, or use Smart Match to ignore points with similar descriptions.',
    suggestedQuestions: [
      'Ignore the invert shots',
      'Open contour cleanup',
      'Generate contours',
    ],
  },
  'contour-actions': {
    id: 'contour-actions',
    label: 'Contour Actions',
    shortLabel: 'Actions',
    color: '#fb923c',
    accent: 'amber',
    glyph: '▶',
    description: 'Generate contours, import a TIN/LandXML, or create a TIN from the latest contours.',
    capability: 'open_contour_actions_chip',
    keywords: ['generate contours', 'contour actions', 'create tin from contours', 'import tin', 'build contours'],
    replyText:
      'Here are the live <strong>Contour Actions</strong> controls. Review the staged settings, then generate contours, import a <code>.tin</code>/LandXML surface, or create a TIN from the latest contours.',
    suggestedQuestions: [
      'Open contour intervals',
      'Open contour generations',
      'Create a TIN from the latest contours',
    ],
  },
  'contour-generations': {
    id: 'contour-generations',
    label: 'Contour Generations',
    shortLabel: 'Generations',
    color: '#34d399',
    accent: 'emerald',
    glyph: '▤',
    description: 'Show, rename, recolor, export, or delete every contour generation.',
    capability: 'open_contour_generations_chip',
    keywords: ['contour generations', 'contour history', 'manage contours', 'rename contours', 'delete contours'],
    replyText:
      'Here is the live <strong>Contour Generations</strong> manager. Every generation can be edited on its own: toggle visibility, rename it, recolor it, build a TIN from it, or delete it.',
    suggestedQuestions: [
      'Open contour blend',
      'Open contour actions',
      'Create a TIN from the latest contours',
    ],
  },
  'contour-generation': {
    id: 'contour-generation',
    label: 'Contour Generation',
    shortLabel: 'Generation',
    color: '#2dd4bf',
    accent: 'emerald',
    glyph: '▦',
    description: 'Inspect one contour generation: rename, recolor, blend, or build a TIN from it.',
    capability: 'open_contour_generation_chip',
    keywords: ['contour generation', 'single contour generation', 'latest contour generation', 'generation detail'],
    replyText:
      'Here are the live <strong>Contour Generation</strong> controls. This is one generation, not the full history: rename it, recolor it, auto-join ESRI ends, or build a TIN from it without leaving the conversation.',
    suggestedQuestions: [
      'Open contour generations',
      'Open contour blend',
      'Create a TIN from this contour generation',
    ],
  },
  'contour-blend': {
    id: 'contour-blend',
    label: 'Contour Blend',
    shortLabel: 'Blend',
    color: '#818cf8',
    accent: 'sky',
    glyph: '⇄',
    description: 'Review and blend outside ESRI contours into survey contours at the boundary.',
    capability: 'open_contour_blend_chip',
    keywords: ['contour blend', 'esri blend', 'blend contours', 'auto join contours', 'transition curves'],
    replyText:
      'Here is the live <strong>Contour Blend</strong> review. Pick a survey generation and boundary, inspect the highlighted trims, transition curves, open ends, and refused joins on the canvas, then select OK to apply.',
    suggestedQuestions: [
      'Enable ESRI contour blend',
      'Open contour generations',
      'Open ESRI contour services',
    ],
  },
  'contour-esri': {
    id: 'contour-esri',
    label: 'ESRI / Online Contours',
    shortLabel: 'ESRI',
    color: '#38bdf8',
    accent: 'cyan',
    glyph: '☁',
    description: 'Fetch USGS or pinned ArcGIS contour services for the project or boundary.',
    capability: 'open_contour_esri_chip',
    keywords: ['esri contours', 'arcgis contours', 'usgs contours', 'online contours', 'contour service', 'pasda contours'],
    replyText:
      'Here are the live <strong>ESRI / Online Contours</strong> controls. Fetch a USGS nationwide source or a pinned ArcGIS service for the boundary or project extent; fetched generations land in Contour Generations.',
    suggestedQuestions: [
      'Fetch USGS 3DEP contours',
      'Open contour blend',
      'Open contour generations',
    ],
  },
};

export const getContourChipMeta = (chip: A2UIContourChipId): ContourChipMeta =>
  CONTOUR_CHIP_META[chip];
