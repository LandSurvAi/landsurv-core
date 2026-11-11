// Centerline / Baseline CACP skill schemas.
// Imported by AgentRegistry.ts and registered on AgentType.CENTERLINE_STATIONING.
// Handlers live in services/clSkillHandlers.ts and are wired into App.tsx
// via the useClSkills() hook.

import type { SkillSchema } from './AgentRegistry';

export const CL_SKILLS: SkillSchema[] = [
  {
    id: 'cl_create_from_description',
    name: 'Create Centerline / Baseline from Description',
    type: 'action',
    description:
      'Builds a horizontal alignment (centerline or baseline) from an ordered sequence of ' +
      'tangent and curve legs. Each tangent leg specifies a bearing and distance; each curve ' +
      'leg specifies direction (left/right), radius, and delta angle. The skill computes PI ' +
      'coordinates, assembles a Centerline object, and immediately adds it to the session. ' +
      'Use this whenever the user asks to "draw", "create", or "define" a centerline or ' +
      'baseline from a verbal or written description. The tangent distance before a curve ' +
      'is the distance from the previous PI (or start) to the PC of the curve — the skill ' +
      'internally computes the PI location from PC + tangent length T = R·tan(Δ/2).',
    inputs: {
      name: {
        type: 'string',
        description: 'Label for the alignment (default: "Baseline-1").',
      },
      beginStation: {
        type: 'number',
        description: 'Starting station value in feet (default: 0, meaning 0+00.00).',
      },
      startNorthing: {
        type: 'number',
        required: true,
        description: 'Northing of the Point of Beginning (project units).',
      },
      startEasting: {
        type: 'number',
        required: true,
        description: 'Easting of the Point of Beginning (project units).',
      },
      legs: {
        type: 'array',
        required: true,
        description:
          'Ordered array of tangent and/or curve leg objects that define the alignment. ' +
          'A tangent leg: { type:"tangent", bearing:"N 45°00\'00\\" E", distance:2640, unit:"ft" }. ' +
          'bearing is required on the first tangent; subsequent tangents inherit the current ' +
          'bearing unless bearing is explicitly supplied. ' +
          'A curve leg: { type:"curve", direction:"right", radius:1000, delta:20, unit:"ft" }. ' +
          'delta is the total deflection angle; prefer decimal degrees (e.g. 20 for a 20° curve), ' +
          'but a DMS string (degrees, minutes, seconds) is also accepted. ' +
          'Supported units: "ft" (default), "m", "mi", "ch" (chains), "lk" (links).',
        items: {
          type: 'object',
          description:
            'Tangent leg: { type:"tangent", bearing?:string, distance:number, unit?:string } ' +
            '| Curve leg: { type:"curve", direction:"left"|"right", radius:number, delta:number|string, unit?:string }',
        },
      },
    },
    outputs: {
      centerline: {
        type: 'object',
        required: true,
        description: 'Computed Centerline object (id, name, beginStation, pis[]).',
      },
      piCount: {
        type: 'integer',
        required: true,
        description: 'Total number of PI points including the start (POB) and end.',
      },
      totalChordLength: {
        type: 'number',
        description: 'Sum of straight-line chord distances between consecutive PIs (project units).',
      },
    },
    examples: [
      // user: "Draw a centerline starting at 0,0 N45E for .5 mile, curve right R=1000 delta=20°, then .25 miles"
      'cl_create_from_description({startNorthing:0, startEasting:0, legs:[' +
        '{type:"tangent",bearing:"N 45 0 0 E",distance:0.5,unit:"mi"},' +
        '{type:"curve",direction:"right",radius:1000,delta:20,unit:"ft"},' +
        '{type:"tangent",distance:0.25,unit:"mi"}]})',
      // user: "Create a baseline named Main St CL starting at N5000 E5000, go due north 500', curve left R=500 for 45 degrees, straight 300'"
      'cl_create_from_description({name:"Main St CL", startNorthing:5000, startEasting:5000, beginStation:0, legs:[' +
        '{type:"tangent",bearing:"N 0 E",distance:500,unit:"ft"},' +
        '{type:"curve",direction:"left",radius:500,delta:45,unit:"ft"},' +
        '{type:"tangent",distance:300,unit:"ft"}]})',
      // user: "Baseline from 1000,1000 heading S 30 W for 300m then tangent left R=200m for 60° then 150m"
      'cl_create_from_description({name:"Baseline", startNorthing:1000, startEasting:1000, legs:[' +
        '{type:"tangent",bearing:"S 30 0 0 W",distance:300,unit:"m"},' +
        '{type:"curve",direction:"left",radius:200,delta:60,unit:"m"},' +
        '{type:"tangent",distance:150,unit:"m"}]})',
    ],
  },
  {
    id: 'cl_create_from_points',
    name: 'Create Centerline / Baseline from Point Chain',
    description:
      'Builds a horizontal alignment by connecting an ordered list of existing project points ' +
      'as a chain of PI nodes (straight tangent segments, no curves). Each point becomes a PI ' +
      'in the resulting centerline. Use this whenever the user asks to "connect", "chain", or ' +
      '"create a centerline using" a set of points identified by point number, description, or ' +
      'selection. The caller must supply the ordered coordinates extracted from the project ' +
      'context — the skill does not query the point database itself.',
    type: 'action',
    inputs: {
      name: {
        type: 'string',
        description: 'Label for the alignment (default: "Baseline-1").',
      },
      beginStation: {
        type: 'number',
        description:
          'Starting station value in feet. A non-zero value overrides the point chain; when omitted or 0, ' +
          'the station written on the first point (e.g. "138+37.12 PC") becomes the beginning station.',
      },
      points: {
        type: 'array',
        required: true,
        description:
          'Ordered array of point objects that define the chain. Each item must include ' +
          '{ pointNumber: string, northing: number, easting: number, description?: string }. ' +
          'The points are connected in the order supplied — first point is the POB, ' +
          'last point is the END. Include the point descriptions; the first point\'s station label ' +
          'sets beginStation when no non-zero beginStation is supplied. Elevation is optional and ignored for horizontal geometry.',
        items: {
          type: 'object',
          description: '{ pointNumber: string, northing: number, easting: number, description?: string, elevation?: number }',
        },
      },
    },
    outputs: {
      centerline: {
        type: 'object',
        required: true,
        description: 'Computed Centerline object (id, name, beginStation, pis[]).',
      },
      piCount: {
        type: 'integer',
        required: true,
        description: 'Total number of PI points in the resulting alignment.',
      },
      totalChordLength: {
        type: 'number',
        description: 'Sum of straight-line distances between consecutive PIs (project units).',
      },
    },
    examples: [
      // user: "Create a centerline using the DYL points connect them in a chain"
      // (agent extracts DYL points from context and orders them by point number)
      'cl_create_from_points({name:"DYL CL", points:[' +
        '{pointNumber:"1",northing:5000,easting:5000,description:"STA 138+37.12 PC"},' +
        '{pointNumber:"2",northing:5200,easting:5150,description:"139+06.45 PI"},' +
        '{pointNumber:"3",northing:5400,easting:5100,description:"139+75.12 PT"}]})',
    ],
  },
  {
    id: 'stationing_update_annotation_settings',
    name: 'Change Station / Baseline Annotation Settings',
    type: 'action',
    description:
      'Changes how station labels and baseline annotations are drawn on the canvas. Use this whenever ' +
      'the user asks to change the station prefix or suffix, decimal vs 1+00 format, precision, label ' +
      'or point interval, text scale, screen offset, 180° rotation, label background, geometry/PI/' +
      'PC-PT/BOP-EOP tags, or to show/hide station labels. Global fields apply to every existing and ' +
      'future baseline; supply targetBaselineName to scope an offset or rotation override to one ' +
      'named baseline. The host applies the change immediately and renders the updated labels.',
    inputs: {
      showStationLabels: {
        type: 'boolean',
        description: 'Show or hide station labels on the canvas.',
      },
      showStationPrefix: {
        type: 'boolean',
        description: 'Show or hide the station prefix (for example STA).',
      },
      stationPrefix: {
        type: 'string',
        description: 'Prefix text placed before each station value; "none" removes it.',
      },
      stationSuffix: {
        type: 'string',
        description: 'Suffix text placed after each station value; "none" removes it.',
      },
      stationLabelFormat: {
        type: 'string',
        description: '"hundreds" for survey notation (1+00.00) or "decimal" for plain feet.',
      },
      stationPrecision: {
        type: 'number',
        description: 'Decimal places in the station value (0, 1, or 2).',
      },
      labelInterval: {
        type: 'number',
        description: 'Feet between station labels along each baseline.',
      },
      pointInterval: {
        type: 'number',
        description: 'Feet between automatically plotted station points.',
      },
      labelScale: {
        type: 'number',
        description: 'Annotation text scale multiplier (0.25–4).',
      },
      labelOffsetPx: {
        type: 'number',
        description: 'Screen-pixel offset from the baseline; negative places labels on the other side.',
      },
      labelRotationDeg: {
        type: 'number',
        description: '0 for normal label rotation, 180 to flip labels upside down.',
      },
      showLabelBackground: {
        type: 'boolean',
        description: 'Draw a contrasting plate behind each station label.',
      },
      showGeometryLabels: {
        type: 'boolean',
        description: 'Master switch for PI/PC/PT/BOP/EOP geometry tags.',
      },
      showPiLabels: {
        type: 'boolean',
        description: 'Show PI tags when geometry tags are enabled.',
      },
      showPcPtLabels: {
        type: 'boolean',
        description: 'Show PC/PT tags when geometry tags are enabled.',
      },
      showEndpointLabels: {
        type: 'boolean',
        description: 'Show BOP/EOP tags when geometry tags are enabled.',
      },
      showStationPointLabels: {
        type: 'boolean',
        description: 'Show the automatically generated CL STA point descriptions.',
      },
      targetBaselineName: {
        type: 'string',
        description:
          'Name of one baseline to scope offset/rotation to; omit to affect every baseline.',
      },
      resetBaselineOverrides: {
        type: 'boolean',
        description: 'Clear saved per-baseline offset and rotation overrides.',
      },
    },
    outputs: {
      applied: {
        type: 'object',
        description: 'The normalized settings patch that was applied.',
      },
      summary: {
        type: 'array',
        required: true,
        description: 'Human-readable list of the changes that were made.',
      },
      targetBaseline: {
        type: 'string',
        description: 'Baseline the offset/rotation was scoped to, or null when global.',
      },
    },
    examples: [
      // user: "Remove the STA prefix and show station labels every 50 feet"
      'stationing_update_annotation_settings({showStationPrefix:false, stationPrefix:"", labelInterval:50})',
      // user: "Flip the station labels 180 degrees on Baseline B"
      'stationing_update_annotation_settings({targetBaselineName:"Baseline B", labelRotationDeg:180})',
    ],
  },
];
