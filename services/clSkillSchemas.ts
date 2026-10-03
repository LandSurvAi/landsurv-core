// Centerline / Baseline CACP skill schemas.
// Imported by AgentRegistry.ts and registered on AgentType.CENTERLINE_STATIONING.
// Handlers live in services/clSkillHandlers.ts and are wired into App.tsx
// via the useClSkills() hook.

import type { SkillSchema } from './AgentRegistry';

export const CL_SKILLS: SkillSchema[] = [
  {
    id: 'cl_create_from_description',
    name: 'Create Centerline / Baseline from Description',
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
          'delta is the total deflection angle in decimal degrees (e.g. 20 for a 20° curve). ' +
          'Supported units: "ft" (default), "m", "mi", "ch" (chains), "lk" (links).',
        items: {
          type: 'object',
          description:
            'Tangent leg: { type:"tangent", bearing?:string, distance:number, unit?:string } ' +
            '| Curve leg: { type:"curve", direction:"left"|"right", radius:number, delta:number, unit?:string }',
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
        description: 'Starting station value in feet (default: 0, meaning 0+00.00).',
      },
      points: {
        type: 'array',
        required: true,
        description:
          'Ordered array of point objects that define the chain. Each item must include ' +
          '{ pointNumber: string, northing: number, easting: number }. ' +
          'The points are connected in the order supplied — first point is the POB, ' +
          'last point is the END. Elevation is optional and ignored for horizontal geometry.',
        items: {
          type: 'object',
          description: '{ pointNumber: string, northing: number, easting: number, elevation?: number }',
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
        '{pointNumber:"1",northing:5000,easting:5000},' +
        '{pointNumber:"2",northing:5200,easting:5150},' +
        '{pointNumber:"3",northing:5400,easting:5100}]})',
    ],
  },
];
