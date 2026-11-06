// Roading Agent CACP skill schemas.
// Imported by AgentRegistry.ts and registered on AgentType.ROADING_AGENT.
// Handlers live in services/roadingSkillHandlers.ts and services/domainSkillHandlers.ts.

import type { SkillSchema } from './AgentRegistry';

export const ROADING_SKILLS: SkillSchema[] = [
  {
    id: 'roading_synthesize_existing',
    name: 'Synthesize Existing Roads (Points + Imagery + OSM)',
    type: 'action',
    description:
      'THIS IS THE CANONICAL HANDLER for drawing, tracing, or synthesizing existing roads and streets. ' +
      'Combines field survey shots (EP, EOP, CL, CURB, TBC, ROW, ROAD, PAVEMENT), background aerial imagery ' +
      'pavement-width calibration (God\'s Eye View optical cross-section raycasting), and OpenStreetMap road ways ' +
      'into survey-grade CAD polylines (centerline on C-ROAD-CNTR, pavement edges on L-ROAD, optional ROW on V-ROAD-ROW). ' +
      'When opposing pavement shots exist, both edges are reconstructed independently from the surveyed cross sections and the centerline is fitted midway between them with curvature-preserving geometry; the duplicate OSM way is retired for that frontage. ' +
      'Also creates or updates a horizontal Centerline object in Stationing & CL and places oriented StreetLabel annotations.',
    inputs: {
      defaultRoadWidthFt: {
        type: 'number',
        default: 24,
        description: 'Fallback pavement width in feet when survey shots or aerial imagery do not constrain both edges.',
      },
      rowWidthFt: {
        type: 'number',
        description:
          'Optional right-of-way total width in feet. Omit it (or pass 0) to draw the surveyed pavement and centerline immediately without ROW lines; ' +
          'supply the deeded/platted width to add V-ROAD-ROW offsets. This input never blocks drawing.',
      },
      useSurveyPoints: {
        type: 'boolean',
        default: true,
        description: 'Anchor road edges and centerline to field survey road/curb points (EP, CL, CURB, TBC, etc.).',
      },
      useBackgroundImagery: {
        type: 'boolean',
        default: true,
        description: 'Calibrate pavement width and normal side from visible aerial/satellite background imagery.',
      },
      useOsmWays: {
        type: 'boolean',
        default: true,
        description: 'Pull OpenStreetMap road network ways when within a valid geographic projection.',
      },
      syncCenterline: {
        type: 'boolean',
        default: true,
        description: 'Create/update a Centerline alignment in the Stationing & CL agent from the synthesized road.',
      },
      clLayer: {
        type: 'string',
        default: 'C-ROAD-CNTR',
        description: 'CAD layer for road centerlines.',
      },
      edgeLayer: {
        type: 'string',
        default: 'L-ROAD',
        description: 'CAD layer for edge-of-pavement polylines.',
      },
      rowLayer: {
        type: 'string',
        default: 'V-ROAD-ROW',
        description: 'CAD layer for right-of-way offset polylines.',
      },
    },
    outputs: {
      corridorId: { type: 'string', required: true, description: 'ID of the saved RoadCorridorRun.' },
      addedPoints: { type: 'integer', required: true, description: 'Number of survey points generated.' },
      addedLines: { type: 'integer', required: true, description: 'Number of CAD line segments generated.' },
      centerlineId: { type: 'string', description: 'ID of the Centerline synced with Stationing & CL.' },
      roadNames: { type: 'array', items: { type: 'string' }, description: 'Detected street names.' },
      effectiveWidthFt: { type: 'number', description: 'Calibrated or applied pavement width in feet.' },
      geometrySource: {
        type: 'string',
        description:
          "'survey-shots' when both pavement edges were rebuilt from field shots, 'osm' when drawn from map ways, or 'project-fallback'.",
      },
    },
    examples: [
      'User: "Draw the existing road from my EP points and aerial imagery" -> roading_synthesize_existing({useSurveyPoints:true, useBackgroundImagery:true})',
      'User: "Synthesize the street in front of the lot with a 50ft ROW" -> roading_synthesize_existing({rowWidthFt:50})',
    ],
  },
  {
    id: 'roading_design_corridor',
    name: 'Design Proposed Road Corridor & Typical Section',
    type: 'action',
    description:
      'Designs a proposed horizontal road corridor along a Stationing & CL alignment (or creates one from point numbers / bearing-distance legs) ' +
      'using a full civil engineering Typical Section: travel lanes, crown/cross-slope %, curb & gutter offsets, sidewalk offsets, and right-of-way (ROW) lines. ' +
      'Coordinates with CENTERLINE_STATIONING for alignment & stationing, POINT_EDITOR for sequential point numbers, and CAD_MANAGER for standard layers.',
    inputs: {
      name: {
        type: 'string',
        default: 'Proposed Road A',
        description: 'Name of the proposed road alignment and corridor.',
      },
      centerlineId: {
        type: 'string',
        description: 'Existing Centerline ID or name from Stationing & CL. If omitted, uses the active centerline or builds one from pointNumbers / legs.',
      },
      pointNumbers: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional ordered list of point numbers to chain into a new centerline alignment before generating the corridor.',
      },
      laneCount: {
        type: 'integer',
        default: 2,
        description: 'Number of travel lanes (e.g. 2).',
      },
      laneWidthFt: {
        type: 'number',
        default: 12,
        description: 'Width of each travel lane in feet (e.g. 12 ft -> 24 ft total travelway).',
      },
      crownSlopePct: {
        type: 'number',
        default: 2.0,
        description: 'Normal pavement cross-slope / crown percentage (e.g. 2.0%).',
      },
      includeCurbAndGutter: {
        type: 'boolean',
        default: true,
        description: 'Include curb & gutter offset lines along both edges of pavement.',
      },
      curbWidthFt: {
        type: 'number',
        default: 0.5,
        description: 'Back-of-curb width in feet beyond the gutter pan.',
      },
      gutterWidthFt: {
        type: 'number',
        default: 1.5,
        description: 'Gutter pan width in feet.',
      },
      includeSidewalk: {
        type: 'boolean',
        default: false,
        description: 'Include parallel sidewalk polylines on both sides of the corridor.',
      },
      sidewalkWidthFt: {
        type: 'number',
        default: 5.0,
        description: 'Sidewalk width in feet.',
      },
      sidewalkOffsetFt: {
        type: 'number',
        default: 4.0,
        description: 'Grass strip / buffer offset from back-of-curb (or edge of pavement) to inside edge of sidewalk in feet.',
      },
      rowWidthFt: {
        type: 'number',
        description:
          'Optional Total Right-of-Way (ROW) width in feet (e.g. 50 ft = 25 ft left/right of CL). Omit it (or pass 0) to draw the corridor immediately without V-ROAD-ROW lines; ' +
          'ROW is a legal limit, so it is never invented, but it never blocks drawing either.',
      },
      stationIntervalFt: {
        type: 'number',
        default: 50,
        description: 'Station interval in feet for stationed corridor template points and ticks.',
      },
      designGradePct: {
        type: 'number',
        description: 'Optional longitudinal design grade percentage (e.g. -1.5 for -1.5% slope from start to end).',
      },
      autoGenerateProfile: {
        type: 'boolean',
        default: true,
        description: 'Automatically trigger an elevation profile along the road centerline via the Profile Agent.',
      },
    },
    outputs: {
      corridorId: { type: 'string', required: true },
      centerlineId: { type: 'string', required: true },
      totalWidthFt: { type: 'number', required: true, description: 'Total travelway pavement width in feet.' },
      rowWidthFt: {
        type: 'number',
        required: true,
        description: 'ROW width actually applied; 0 when the user explicitly chose no ROW lines.',
      },
      addedPoints: { type: 'integer', required: true },
      addedLines: { type: 'integer', required: true },
      layersCreated: { type: 'array', items: { type: 'string' } },
      profileGenerated: { type: 'boolean' },
    },
    examples: [
      'User: "Design a 24ft wide road with curb, 5ft sidewalks, and a 50ft ROW along the centerline" -> roading_design_corridor({laneCount:2, laneWidthFt:12, includeCurbAndGutter:true, includeSidewalk:true, sidewalkWidthFt:5, rowWidthFt:50})',
      'User: "Create a road corridor connecting points 10, 11, 12 with 11ft lanes" -> roading_design_corridor({pointNumbers:["10","11","12"], laneCount:2, laneWidthFt:11})',
    ],
  },
  {
    id: 'roading_generate_profile_and_sections',
    name: 'Generate Road Centerline Profile & Cross Sections',
    type: 'action',
    description:
      'Coordinates with the Profile & Cross Section Agent (PROFILE_AGENT) to compute an existing-ground elevation profile ' +
      'and stationed cross sections along the active road centerline, applying crown/cross-slope and optional longitudinal design grade.',
    inputs: {
      centerlineId: {
        type: 'string',
        description: 'Centerline ID or name. Defaults to the active road centerline.',
      },
      sampleIntervalFt: {
        type: 'number',
        default: 25,
        description: 'Station sampling interval in feet.',
      },
      halfWidthFt: {
        type: 'number',
        default: 30,
        description: 'Left/right cross-section half-width in feet.',
      },
      designGradePct: {
        type: 'number',
        description: 'Optional longitudinal design grade (%) to compute proposed profile elevations.',
      },
    },
    outputs: {
      sampleCount: { type: 'integer', required: true },
      lengthFt: { type: 'number', required: true },
      minElevation: { type: 'number' },
      maxElevation: { type: 'number' },
      crossSectionCount: { type: 'integer' },
    },
    examples: [
      'User: "Generate a road profile and cross sections every 25 feet" -> roading_generate_profile_and_sections({sampleIntervalFt:25})',
    ],
  },
  {
    id: 'roading_add_culdesac_or_fillet',
    name: 'Add Cul-de-Sac Bulb, Curb Fillet, or Driveway Apron',
    type: 'action',
    description:
      'Adds a tangent cul-de-sac turnaround bulb (trimmed at the road mouth) at the end (or start) of a road centerline, draws real concentric curb-return fillets at an interior PI, or synthesizes a flared driveway apron tied to the nearest pavement edge.',
    inputs: {
      featureKind: {
        type: 'string',
        enum: ['cul-de-sac', 'driveway-apron', 'intersection-fillet'],
        default: 'cul-de-sac',
        description: 'Type of road terminus or tie-in geometry to generate.',
      },
      centerlineId: {
        type: 'string',
        description: 'Target centerline ID or name (defaults to active centerline).',
      },
      atEnd: {
        type: 'boolean',
        default: true,
        description: 'When true, places cul-de-sac at the end station; when false, at the beginning station.',
      },
      bulbRadiusFt: {
        type: 'number',
        default: 45,
        description: 'Cul-de-sac pavement radius in feet.',
      },
      rowBulbRadiusFt: {
        type: 'number',
        default: 55,
        description: 'Cul-de-sac right-of-way (ROW) radius in feet.',
      },
      pavementHalfWidthFt: {
        type: 'number',
        description:
          'Half the pavement width where it meets the bulb; defaults to the matching corridor typical section, otherwise 12 ft.',
      },
      rowHalfWidthFt: {
        type: 'number',
        description:
          'Half the ROW width where it meets the bulb; defaults to the matching corridor ROW, otherwise pavement half-width + 10 ft.',
      },
      filletRadiusFt: {
        type: 'number',
        default: 25,
        description: 'Curb-return radius in feet when featureKind="intersection-fillet".',
      },
      piIndex: {
        type: 'integer',
        description:
          '1-based interior PI index for an intersection fillet. Defaults to the interior PI nearest the selected end of the alignment.',
      },
      drivewayWidthFt: {
        type: 'number',
        default: 14,
        description: 'Driveway apron width in feet when featureKind="driveway-apron".',
      },
    },
    outputs: {
      featureKind: { type: 'string', required: true },
      addedLines: { type: 'integer', required: true },
      addedPoints: { type: 'integer' },
      layer: { type: 'string', required: true },
    },
    examples: [
      'User: "Add a 45ft radius cul-de-sac at the end of the road" -> roading_add_culdesac_or_fillet({featureKind:"cul-de-sac", bulbRadiusFt:45})',
      'User: "Connect a 14ft driveway apron from the road to the house" -> roading_add_culdesac_or_fillet({featureKind:"driveway-apron", drivewayWidthFt:14})',
      'User: "Add a 25ft curb return at PI 2" -> roading_add_culdesac_or_fillet({featureKind:"intersection-fillet", filletRadiusFt:25, piIndex:2})',
    ],
  },
  {
    id: 'roading_clear',
    name: 'Clear Road Corridor Linework',
    type: 'action',
    description:
      'Removes generated road centerlines, edges, curbs, sidewalks, and ROW linework created by the Roading Agent.',
    inputs: {
      corridorId: {
        type: 'string',
        description: 'Optional specific RoadCorridorRun id to remove. Omit to clear all Roading Agent layers.',
      },
    },
    outputs: {
      removedLines: { type: 'integer', required: true },
      removedCorridors: { type: 'integer', required: true },
    },
    examples: [
      'User: "Clear the road corridor" -> roading_clear({})',
    ],
  },
];
