// Geospatial AI (SamGeo & SAM-Road) CACP skill schemas.
// Imported by AgentRegistry.ts and registered on AgentType.CIVIL_DRAFTER (and accessible to all agents).
// Handlers live in services/geoSkillHandlers.ts and are wired into App.tsx.

import type { SkillSchema } from './AgentRegistry';

export const GEO_AI_SKILLS: SkillSchema[] = [
  {
    id: 'geo_extract_features',
    name: 'Extract Geospatial Features (SamGeo)',
    type: 'action',
    description:
      'Extracts and vectorizes site features (such as driveways, building footprints, parking aprons, sidewalks, ' +
      'or water boundaries) from aerial orthophotos or project raster imagery using Segment-Geospatial (SamGeo). ' +
      'The generated vectors are converted to project coordinates and added to the CAD canvas as closed polylines ' +
      'on the requested layer (e.g. "L-DRIVEWAY"). Use this when the user asks to "draw the driveways", "trace parking", ' +
      'or "extract building boundaries from the aerial".',
    inputs: {
      featureType: {
        type: 'string',
        description: 'Class of feature to extract (e.g. "driveway", "building", "parking", "pavement", "water"). Default: "driveway".',
        default: 'driveway',
      },
      prompt: {
        type: 'string',
        description: 'Natural-language prompt or keywords for SAM/LangSAM prompt guidance (e.g. "paved driveway, asphalt, entrance apron").',
      },
      targetLayer: {
        type: 'string',
        description: 'CAD layer for the extracted linework (default: "L-DRIVEWAY" for driveways, "L-BLD-AI" for buildings).',
        default: 'L-DRIVEWAY',
      },
      bbox: {
        type: 'object',
        description: 'Optional spatial bounding box filter in project coordinates {minX, minY, maxX, maxY}. If omitted, uses active project extent.',
        properties: {
          minX: { type: 'number' },
          minY: { type: 'number' },
          maxX: { type: 'number' },
          maxY: { type: 'number' },
        },
      },
      confidenceThreshold: {
        type: 'number',
        description: 'Minimum prediction confidence score (0.0 to 1.0). Default: 0.35.',
        default: 0.35,
      },
    },
    outputs: {
      success: { type: 'boolean', required: true },
      featureCount: { type: 'integer', required: true, description: 'Number of vectorized features drawn.' },
      targetLayer: { type: 'string', required: true, description: 'The layer the features were placed onto.' },
      polylines: { type: 'array', items: { type: 'object' }, description: 'Vector polylines added to canvas.' },
      engine: { type: 'string', description: 'Execution engine used ("local" or "cloud").' },
    },
    examples: [
      'askPeer geo_extract_features { featureType: "driveway", prompt: "paved driveway", targetLayer: "L-DRIVEWAY" }',
      'askPeer geo_extract_features { featureType: "parking", targetLayer: "C-PAVE-PRKG" }',
    ],
  },
  {
    id: 'geo_extract_roads',
    name: 'Extract Road Network & Centerlines (SAM-Road)',
    type: 'action',
    description:
      'Extracts topological road network graphs and centerlines from aerial imagery using SAM-Road (CVPRW 2024). ' +
      'Converts road corridors and intersections into vectorized CAD alignment polylines on layer "C-ROAD-CNTR". ' +
      'Use this when the user asks to "extract road centerlines", "trace the roads", or "find road network" for a site.',
    inputs: {
      targetLayer: {
        type: 'string',
        description: 'CAD layer for the generated centerlines (default: "C-ROAD-CNTR").',
        default: 'C-ROAD-CNTR',
      },
      bbox: {
        type: 'object',
        description: 'Optional spatial bounding box filter in project coordinates {minX, minY, maxX, maxY}.',
        properties: {
          minX: { type: 'number' },
          minY: { type: 'number' },
          maxX: { type: 'number' },
          maxY: { type: 'number' },
        },
      },
      simplifyTolerance: {
        type: 'number',
        description: 'Polyline vertex reduction tolerance in project survey units (default: 1.0 ft).',
        default: 1.0,
      },
    },
    outputs: {
      success: { type: 'boolean', required: true },
      roadSegmentCount: { type: 'integer', required: true, description: 'Number of road centerlines extracted.' },
      intersectionCount: { type: 'integer', description: 'Number of topological intersection nodes detected.' },
      targetLayer: { type: 'string', required: true },
      engine: { type: 'string', description: 'Execution engine used ("local" or "cloud").' },
    },
    examples: [
      'askPeer geo_extract_roads { targetLayer: "C-ROAD-CNTR" }',
    ],
  },
];
