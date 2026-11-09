// Civil Drafter road paint CACP skill schemas.
// Imported by AgentRegistry.ts and registered on AgentType.CIVIL_DRAFTER.
// Handlers live in services/roadPaintSkillHandlers.ts.

import type { SkillSchema } from './AgentRegistry';

export const ROAD_PAINT_SKILLS: SkillSchema[] = [
  {
    id: 'road_paint_catalog',
    name: 'Road Paint Marking Catalog',
    description:
      'Returns the pavement-marking presets the paint tools understand (EP edge of pavement, WL white line, ' +
      'SWL single white line, DYL double yellow), the 4-inch paint width and 8-inch centerline offsets, the CAD ' +
      'layer/linetype each marking uses, and the available Stationing & CL alignments. Query this before ' +
      'road_paint_apply when the marking or alignment is not explicit.',
    type: 'query',
    inputs: {},
    outputs: {
      markings: {
        type: 'array',
        required: true,
        items: { type: 'object' },
        description: 'Preset objects: id, label, paint (false for EP), color, layer, lineType, offsetsIn, widthIn, description.',
      },
      centerlines: {
        type: 'array',
        items: { type: 'object' },
        description: 'Available alignments: id, name, beginStation, endStation, lengthFt.',
      },
      paintRules: {
        type: 'array',
        items: { type: 'string' },
        description: 'How paint works on this project (EP is reference, 4-inch bands, 8-inch offsets, stationing).',
      },
    },
    examples: [
      'road_paint_catalog()',
      '// "what paint markings can you draw?" -> road_paint_catalog',
    ],
  },
  {
    id: 'road_paint_apply',
    name: 'Apply Road Paint Marking (WL / SWL / DYL)',
    description:
      'THIS IS THE CANONICAL HANDLER for painting road markings. Stations an existing Centerline, then draws true ' +
      '4-inch-wide paint bands: SWL/WL is one white stripe 8 inches off the centerline; DYL is two yellow stripes 8 ' +
      'inches each side. Sets L-ROAD-PAINT-W or L-ROAD-PAINT-Y with a CONTINUOUS linetype and adds rotated station ' +
      'callouts. EP is a surveyed edge-of-pavement reference and is rejected — fit the centerline between the EP ' +
      'shots, then paint WL/SWL/DYL. When no centerline exists, pass the ordered alignment pointNumbers and the ' +
      'handler creates the alignment through the CL & Stationing agent (cl_create_from_points) so stations and ' +
      'annotation come from the alignment. Set openStudio:true to raise the Road Paint Studio A2UI.',
    type: 'action',
    inputs: {
      marking: {
        type: 'string',
        required: true,
        description: 'WL, SWL (single white line) or DYL (double yellow). EP is reference only and is rejected.',
      },
      centerlineId: { type: 'string', description: 'Existing Centerline id from Stationing & CL.' },
      centerlineName: { type: 'string', description: 'Alignment name when the id is unknown.' },
      pointNumbers: {
        type: 'array',
        items: { type: 'string' },
        description: 'Ordered existing project points used to create the alignment when no centerline exists.',
      },
      offsetIn: {
        type: 'number',
        description: 'Stripe center distance from the centerline in inches. Default 8 (DYL: each side).',
      },
      side: {
        type: 'string',
        description: "'left', 'right' (default), or 'both' for a single white line.",
      },
      widthIn: { type: 'number', description: 'Paint band width in inches. Default 4.' },
      separationIn: {
        type: 'number',
        description: 'Center-to-center spacing of the two DYL stripes in inches. Default 8.',
      },
      startStation: {
        type: 'string',
        description: 'First painted station, hundreds notation (e.g. "1+25") or decimal feet. Defaults to the alignment start.',
      },
      endStation: {
        type: 'string',
        description: 'Last painted station. Defaults to the alignment end.',
      },
      stationStepFt: { type: 'number', description: 'Paint band sampling interval in feet. Default 10.' },
      labelIntervalFt: { type: 'number', description: 'Station callout spacing in feet. Default 100.' },
      annotate: { type: 'boolean', description: 'Place rotated station callouts along the paint. Default true.' },
      layer: { type: 'string', description: 'Override the marking CAD layer.' },
      lineType: { type: 'string', description: 'Override the CAD linetype (default CONTINUOUS).' },
      color: { type: 'string', description: 'Override the paint color (white for WL/SWL, yellow for DYL).' },
      replaceExisting: {
        type: 'boolean',
        description: 'Replace earlier paint for the same marking/alignment instead of stacking duplicates. Default true.',
      },
      openStudio: {
        type: 'boolean',
        description: 'Open the Road Paint Studio A2UI instead of applying immediately.',
      },
    },
    outputs: {
      applied: { type: 'boolean', required: true },
      marking: { type: 'string' },
      centerlineId: { type: 'string' },
      centerlineName: { type: 'string' },
      stripeCount: { type: 'integer', description: '1 for WL/SWL, 2 for DYL.' },
      segmentCount: { type: 'integer', description: 'Number of band quads written.' },
      lengthFt: { type: 'number' },
      startStation: { type: 'number' },
      endStation: { type: 'number' },
      layer: { type: 'string' },
      lineType: { type: 'string' },
      color: { type: 'string' },
      annotationCount: { type: 'integer' },
      paintedAreaSqFt: { type: 'number' },
      centerlineSource: { type: 'string', description: "'existing' or 'cl_create_from_points'." },
      message: { type: 'string', required: true },
    },
    examples: [
      'road_paint_apply({marking:"DYL", centerlineId:"cl-main"})',
      'road_paint_apply({marking:"SWL", pointNumbers:["1109","1110"], side:"right", widthIn:4})',
      'road_paint_apply({marking:"DYL", openStudio:true})',
    ],
  },
  {
    id: 'road_paint_clear',
    name: 'Clear Road Paint Markings',
    description:
      'Removes generated road paint bands and their station callouts, optionally scoped to one marking and/or ' +
      'alignment. Survey linework, centerlines, and non-paint labels are never touched.',
    type: 'action',
    inputs: {
      marking: { type: 'string', description: 'Optional marking to clear (WL, SWL, DYL). Omit to clear all paint.' },
      centerlineId: { type: 'string', description: 'Optional alignment scope. Omit to clear paint on every alignment.' },
    },
    outputs: {
      removedLines: { type: 'integer', required: true },
      removedLabels: { type: 'integer', required: true },
      message: { type: 'string', required: true },
    },
    examples: ['road_paint_clear({marking:"DYL"})', 'road_paint_clear()'],
  },
];
