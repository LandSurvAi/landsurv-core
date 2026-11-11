// Dirt Volume Agent CACP skill schemas.
// Imported by AgentRegistry.ts and registered on AgentType.DIRT_VOLUME_AGENT.
// Handlers live in services/dirtVolumeSkillHandlers.ts.

import type { SkillSchema } from './AgentRegistry';

export const DIRT_VOLUME_SKILLS: SkillSchema[] = [
  {
    id: 'dirt_volume_end_area',
    name: 'Compute End-Area Volumes',
    type: 'query',
    description:
      'THE CANONICAL HANDLER for earthwork quantities from cross sections. Pass two or more sections ' +
      '(station in feet plus cut and fill area in square feet) and it computes cut and fill volumes by ' +
      'average end area, with optional Simpson\'s rule for uniformly spaced sections. Returns cubic feet, ' +
      'cubic yards, loose cut, bank-required fill, adjusted balance, and cut-to-fill ratio. ' +
      'Areas are section areas, NOT plan areas. Do not invent section areas: ask for them or use a TIN comparison.',
    inputs: {
      sections: {
        type: 'array',
        required: true,
        description:
          'Array of { station, cutAreaSf, fillAreaSf, description? }. Stations must be strictly increasing.',
        items: {
          type: 'object',
          properties: {
            station: { type: 'number', required: true, description: 'Station in feet.' },
            cutAreaSf: { type: 'number', required: true, description: 'Cut area at the section, square feet.' },
            fillAreaSf: { type: 'number', required: true, description: 'Fill area at the section, square feet.' },
            description: { type: 'string' },
          },
        },
      },
      useSimpsonRule: {
        type: 'boolean',
        description: 'Use Simpson\'s rule when the stations are uniformly spaced and there is an even number of intervals.',
      },
      cutSwellPercent: { type: 'number', description: 'Percent swell applied to bank cut for the haul balance. Default 0.' },
      fillShrinkPercent: { type: 'number', description: 'Percent shrink applied to compacted fill. Must be under 100. Default 0.' },
      saveAs: { type: 'string', description: 'Optional scenario name. When supplied the result is saved for comparison.' },
      notes: { type: 'string', description: 'Optional notes stored with the saved scenario.' },
    },
    outputs: {
      cutCy: { type: 'number', required: true },
      fillCy: { type: 'number', required: true },
      netCy: { type: 'number', required: true },
      cutLooseCy: { type: 'number', required: true },
      fillBankRequiredCy: { type: 'number', required: true },
      adjustedNetCy: { type: 'number', required: true },
      cutToFillRatio: { type: 'number', description: 'Null when there is no fill.' },
      calculationMethod: { type: 'string', required: true },
      methods: { type: 'string', required: true },
      warnings: { type: 'array', items: { type: 'string' }, required: true },
      scenarioId: { type: 'string' },
      report: { type: 'string', description: 'Copy-ready report for this result.' },
    },
    examples: [
      'User: "Cut and fill from my sections at 0+00, 1+00 and 2+00" -> dirt_volume_end_area({sections:[{station:0,cutAreaSf:120,fillAreaSf:0},{station:100,cutAreaSf:340,fillAreaSf:20},{station:200,cutAreaSf:90,fillAreaSf:180}]})',
      'Roading Agent needs a quick earthwork balance for a corridor -> dirt_volume_end_area with the section areas.',
    ],
  },
  {
    id: 'dirt_volume_grid',
    name: 'Compute Grid Cut/Fill Volumes',
    type: 'query',
    description:
      'Computes cut and fill between two elevation grids using the four-corner average over each cell. ' +
      'Use for site grading, parking lots, pads, and any rectangular area where existing and proposed ' +
      'elevations are known on a regular grid. Grids must be rectangular, match in size, and be indexed ' +
      '[row][column] with row 0 at the south edge. Returns cut/fill CY, plan area, maximum depths, and warnings.',
    inputs: {
      spacingX: { type: 'number', required: true, description: 'Node spacing east, feet.' },
      spacingY: { type: 'number', required: true, description: 'Node spacing north, feet.' },
      existing: {
        type: 'array',
        required: true,
        items: { type: 'array', items: { type: 'number' } },
        description: 'Existing-ground elevation rows [row][column].',
      },
      proposed: {
        type: 'array',
        required: true,
        items: { type: 'array', items: { type: 'number' } },
        description: 'Proposed-surface elevation rows, same dimensions as existing.',
      },
      toleranceFt: { type: 'number', description: 'Ignore differences below this depth. Default 0.001.' },
      cutSwellPercent: { type: 'number' },
      fillShrinkPercent: { type: 'number' },
      saveAs: { type: 'string', description: 'Optional scenario name to save the result for comparison.' },
      notes: { type: 'string' },
    },
    outputs: {
      cutCy: { type: 'number', required: true },
      fillCy: { type: 'number', required: true },
      adjustedNetCy: { type: 'number', required: true },
      planAreaSf: { type: 'number', required: true },
      planAreaAcres: { type: 'number', required: true },
      cellsComputed: { type: 'integer', required: true },
      cellsSkipped: { type: 'integer', required: true },
      maxCutFt: { type: 'number', required: true },
      maxFillFt: { type: 'number', required: true },
      warnings: { type: 'array', items: { type: 'string' }, required: true },
      scenarioId: { type: 'string' },
      report: { type: 'string' },
    },
    examples: [
      'User: "Grade this 100 x 100 pad from 101.2 to 100.0" -> build the existing/proposed corner grids and call dirt_volume_grid.',
    ],
  },
  {
    id: 'dirt_volume_tin_compare',
    name: 'Compare Two TIN Surfaces',
    type: 'query',
    description:
      'Obtains cut and fill between two TIN surfaces already in the project. Pass surface ids or names; ' +
      'it resolves them against the current project surfaces, samples the overlap on a regular grid, and ' +
      'returns cut/fill volumes plus plan area and maximum depths. This is the preferred "get the volume ' +
      'from my surfaces" tool. Results are sampling-based, so disclose the sampling spacing.',
    inputs: {
      existingSurface: { type: 'string', description: 'Existing-ground TIN id or name.' },
      proposedSurface: { type: 'string', description: 'Proposed-surface TIN id or name.' },
      spacingFt: { type: 'number', description: 'Sampling grid spacing in feet. Omit for about 120 nodes across the overlap.' },
      toleranceFt: { type: 'number', description: 'Ignore differences below this depth. Default 0.01.' },
      cutSwellPercent: { type: 'number' },
      fillShrinkPercent: { type: 'number' },
      saveAs: { type: 'string', description: 'Optional scenario name to save the result for comparison.' },
      notes: { type: 'string' },
    },
    outputs: {
      existingSurface: { type: 'string', required: true },
      proposedSurface: { type: 'string', required: true },
      cutCy: { type: 'number', required: true },
      fillCy: { type: 'number', required: true },
      adjustedNetCy: { type: 'number', required: true },
      planAreaSf: { type: 'number', required: true },
      planAreaAcres: { type: 'number', required: true },
      cellsComputed: { type: 'integer', required: true },
      cellsSkipped: { type: 'integer', required: true },
      maxCutFt: { type: 'number' },
      maxFillFt: { type: 'number' },
      warnings: { type: 'array', items: { type: 'string' }, required: true },
      scenarioId: { type: 'string' },
      report: { type: 'string' },
      availableSurfaces: {
        type: 'array',
        items: { type: 'string' },
        description: 'Present when surface resolution fails, so the caller can ask the user which surfaces to use.',
      },
    },
    examples: [
      'User: "How much cut and fill between EXISTING TIN and PROPOSED TIN?" -> dirt_volume_tin_compare({existingSurface:"EXISTING TIN", proposedSurface:"PROPOSED TIN"})',
      'Civil Drafter asks for a grading balance -> dirt_volume_tin_compare with the two project surfaces.',
    ],
  },
  {
    id: 'dirt_volume_stockpile',
    name: 'Compute Stockpile Volume',
    type: 'query',
    description:
      'Computes the volume of a stockpile above a flat base elevation from top-surface shots ' +
      '(easting, northing, elevation). At least three points are required. The top is triangulated and ' +
      'sampled on a regular grid. Use for aggregate piles, topsoil stockpiles, and borrow piles. ' +
      'For a non-flat base, use dirt_volume_tin_compare with a base TIN instead.',
    inputs: {
      baseElevation: { type: 'number', required: true, description: 'Flat base elevation, feet.' },
      points: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          properties: {
            easting: { type: 'number', required: true },
            northing: { type: 'number', required: true },
            elevation: { type: 'number', required: true },
          },
        },
        description: 'Top-surface shots. At least three non-collinear points.',
      },
      spacingFt: { type: 'number', description: 'Sampling grid spacing. Omit for about 120 nodes across the pile.' },
      cutSwellPercent: { type: 'number' },
      fillShrinkPercent: { type: 'number' },
      saveAs: { type: 'string', description: 'Optional scenario name to save the result for comparison.' },
      notes: { type: 'string' },
    },
    outputs: {
      cutCy: { type: 'number', required: true, description: 'Material above the base.' },
      fillCy: { type: 'number', required: true, description: 'Material below the base inside the footprint.' },
      planAreaSf: { type: 'number', required: true },
      maxCutFt: { type: 'number', required: true },
      warnings: { type: 'array', items: { type: 'string' }, required: true },
      scenarioId: { type: 'string' },
      report: { type: 'string' },
    },
    examples: [
      'User: "How many yards are in this topsoil pile on a 100.0 base?" -> dirt_volume_stockpile({baseElevation:100, points:[...]})',
    ],
  },
  {
    id: 'dirt_volume_list_scenarios',
    name: 'List Volume Scenarios',
    description:
      'Lists every saved volume scenario in this session with method, cut/fill/adjusted balance, plan area, and notes. ' +
      'Use before comparing or reporting so the user can choose the baseline.',
    inputs: {},
    outputs: {
      scenarios: { type: 'array', items: { type: 'object' }, required: true },
      count: { type: 'integer', required: true },
    },
  },
  {
    id: 'dirt_volume_compare',
    name: 'Compare Volume Scenarios',
    description:
      'Compares two or more saved volume scenarios. Optional ids selects a subset; baselineId chooses the ' +
      'reference scenario (defaults to the first selected). Returns per-scenario deltas and percent changes, ' +
      'the net spread, and the best-balanced scenario. Use this for design-option comparisons and haul decisions.',
    inputs: {
      ids: { type: 'array', items: { type: 'string' }, description: 'Scenario ids to compare. Omit to compare all saved.' },
      baselineId: { type: 'string', description: 'Scenario id used as the baseline.' },
    },
    outputs: {
      baselineId: { type: 'string', required: true },
      rows: { type: 'array', items: { type: 'object' }, required: true },
      spreadNetCy: { type: 'number', required: true },
      bestBalancedId: { type: 'string', required: true },
      report: { type: 'string', description: 'Copy-ready comparison report.' },
    },
    examples: [
      'User: "Compare the two grading options" -> dirt_volume_compare({ids:["dv-1","dv-2"]})',
    ],
  },
  {
    id: 'dirt_volume_format_report',
    name: 'Format Dirt Volume Report',
    description:
      'Returns a copy-ready earthwork quantity report for one saved scenario (or the latest result) and ' +
      'optionally the scenario comparison. Use when the user asks to "write it up", "create the report", ' +
      'or add the takeoff to the project record.',
    inputs: {
      scenarioId: { type: 'string', description: 'Saved scenario id. Omit to use the most recent saved scenario.' },
      includeComparison: { type: 'boolean', description: 'Include the comparison table when at least two scenarios are saved.' },
      projectName: { type: 'string' },
      location: { type: 'string' },
      preparedBy: { type: 'string' },
      notes: { type: 'string' },
    },
    outputs: {
      report: { type: 'string', required: true },
      scenarioId: { type: 'string' },
      cutCy: { type: 'number' },
      fillCy: { type: 'number' },
      adjustedNetCy: { type: 'number' },
    },
    examples: [
      'User: "Write up the earthwork quantities for the report" -> dirt_volume_format_report({})',
    ],
  },
  {
    id: 'dirt_volume_export_pdf',
    name: 'Export Dirt Volume Report (PDF)',
    type: 'action',
    description:
      'Builds and downloads a PDF earthwork quantity report for a saved scenario, with the comparison table ' +
      'when two or more scenarios exist. Use when the user asks for a PDF or a deliverable.',
    inputs: {
      scenarioId: { type: 'string', description: 'Saved scenario id. Omit for the most recent saved scenario.' },
      projectName: { type: 'string' },
      location: { type: 'string' },
      preparedBy: { type: 'string' },
      notes: { type: 'string' },
      includeComparison: { type: 'boolean' },
    },
    outputs: {
      exported: { type: 'boolean', required: true },
      fileName: { type: 'string', required: true },
      scenarioId: { type: 'string' },
    },
  },
  {
    id: 'dirt_volume_open_panel',
    name: 'Open Dirt Volume Workspace',
    type: 'action',
    description:
      'Opens the Dirt Volume workspace in the agent chat so the user can enter sections or pick project TINs, ' +
      'compute quantities, save scenarios, compare them, and export the report.',
    inputs: {},
    outputs: {
      opened: { type: 'boolean', required: true },
      mounted: { type: 'string', required: true },
    },
  },
  {
    id: 'dirt_volume_delete_scenario',
    name: 'Delete Volume Scenario',
    type: 'action',
    description: 'Deletes one saved volume scenario by id. Use when the user asks to remove a design option from the comparison.',
    inputs: {
      scenarioId: { type: 'string', required: true },
    },
    outputs: {
      deleted: { type: 'boolean', required: true },
      scenarioId: { type: 'string', required: true },
    },
  },
  {
    id: 'dirt_volume_clear',
    name: 'Clear Volume Scenarios',
    type: 'action',
    description: 'Clears every saved volume scenario and comparison for this session. The scenario store cannot be undone.',
    inputs: {},
    outputs: {
      cleared: { type: 'boolean', required: true },
    },
  },
];
