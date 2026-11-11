// Stormwater Agent CACP skill schemas.
// Imported by AgentRegistry.ts and registered on AgentType.STORMWATER_AGENT.
// Handlers live in services/stormwaterSkillHandlers.ts.

import type { SkillSchema } from './AgentRegistry';

export const STORMWATER_SKILLS: SkillSchema[] = [
  {
    id: 'stormwater_compute_runoff',
    name: 'Compute Peak Stormwater Runoff',
    type: 'query',
    description:
      'THE CANONICAL HANDLER for preliminary stormwater runoff. Runs the Rational Method (Q = C i A) with ' +
      'area-weighted runoff coefficients and NOAA Atlas 14 rainfall (or a user-supplied design intensity), and keeps the result in the ' +
      'session so later questions ("what was the 25-year flow?") reuse it. ' +
      'Supports composite sites: pass every contributing surface with its area. Optionally pass the longest ' +
      'flow path length and average slope to compute the FAA time of concentration and let the design storm ' +
      'duration follow Tc. Returns peak flow in cfs and gpm, the weighted C, the intensity used, and every ' +
      'applicability warning (area over 10 or 50 acres, high C, and whether the intensity was fetched ' +
      'from NOAA Atlas 14 or supplied manually). ' +
      'Preliminary conveyance sizing only — permit applications may require continuous simulation (EPA SWMM, HEC-HMS, or an approved local model).',
    inputs: {
      surfaces: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description:
                'Surface type key, e.g. "Pavement and Roofs", "Gravel Areas", "Bare Soil", "Lawns", ' +
                '"Landscaped Areas", "Pasture", "Light Forest", "Dense Forest", "Open Water".',
            },
            areaSqFt: {
              type: 'number',
              description: 'Contributing area for this surface in square feet.',
            },
            coefficient: {
              type: 'number',
              description: 'Optional C override when the local jurisdiction requires a different coefficient.',
            },
          },
        },
        description: 'One entry per contributing surface. Areas are summed; C is area-weighted.',
      },
      returnPeriod: {
        type: 'integer',
        required: true,
        enum: [2, 5, 10, 25, 50, 100],
        description: 'Design storm return period in years.',
      },
      durationMinutes: {
        type: 'integer',
        description:
          'Design storm duration in minutes (5, 10, 15, 30, 60, 120, or 180). Omit it to use the duration ' +
          'recommended from the computed time of concentration.',
      },
      flowLengthFt: {
        type: 'number',
        description: 'Longest flow path length in feet for the FAA Tc calculation.',
      },
      slopePercent: {
        type: 'number',
        description: 'Average slope along the flow path in percent for the FAA Tc calculation.',
      },
      location: {
        type: 'string',
        description: 'Optional site address or description recorded on the report.',
      },
      latitude: {
        type: 'number',
        description: 'Optional WGS84 latitude used to flag rainfall-data applicability.',
      },
      longitude: {
        type: 'number',
        description: 'Optional WGS84 longitude used for the NOAA Atlas 14 lookup.',
      },
      rainfallIntensity: {
        type: 'number',
        description:
          'Manual design intensity in in/hr for the selected duration. Use when the site is outside NOAA Atlas 14 coverage or the jurisdiction requires a local value.',
      },
    },
    outputs: {
      peakRunoffCfs: { type: 'number', required: true },
      peakRunoffGpm: { type: 'number', required: true },
      weightedC: { type: 'number', required: true },
      totalAreaSqFt: { type: 'number', required: true },
      totalAreaAcres: { type: 'number', required: true },
      rainfallIntensity: { type: 'number', required: true, description: 'Design intensity in inches/hour.' },
      returnPeriod: { type: 'integer', required: true },
      durationMinutes: { type: 'integer', required: true },
      recommendedDurationMinutes: { type: 'integer', required: true },
      tcMinutes: { type: 'number', description: 'FAA time of concentration when flow path inputs were supplied.' },
      durationSource: {
        type: 'string',
        description: '"time-of-concentration" when the duration followed Tc, otherwise "manual".',
      },
      warnings: { type: 'array', items: { type: 'string' }, required: true },
      citation: { type: 'string', required: true },
      report: {
        type: 'string',
        description: 'Copy-ready calculation report (same text as stormwater_format_report).',
      },
    },
    examples: [
      'User: "What is the 25-year peak flow for 0.5 acre of pavement and 1 acre of lawn?" -> stormwater_compute_runoff({returnPeriod:25, surfaces:[{type:"Pavement and Roofs",areaSqFt:21780},{type:"Lawns",areaSqFt:43560}]})',
      'User: "Size the ditch for the 10-year storm, 500 ft flow path at 2% slope" -> stormwater_compute_runoff({returnPeriod:10, flowLengthFt:500, slopePercent:2, surfaces:[...]})',
      'Civil Drafter needs a conveyance flow before laying out a swale -> askPeer stormwater_compute_runoff and use peakRunoffCfs.',
    ],
  },
  {
    id: 'stormwater_time_of_concentration',
    name: 'Calculate Time of Concentration (FAA)',
    description:
      'Computes the FAA time of concentration (Tc = 1.8 (1.1 - C) L^0.5 / S^0.33) for a small urban ' +
      'drainage area and returns the recommended IDF storm duration. Pass either a composite runoff ' +
      'coefficient or the full surface breakdown.',
    inputs: {
      weightedC: {
        type: 'number',
        description: 'Composite runoff coefficient (0-1). Omit when `surfaces` is supplied.',
      },
      surfaces: {
        type: 'array',
        items: { type: 'object' },
        description: 'Surface breakdown; used to derive the weighted C when weightedC is omitted.',
      },
      flowLengthFt: { type: 'number', required: true, description: 'Longest flow path length in feet.' },
      slopePercent: { type: 'number', required: true, description: 'Average slope along the flow path, percent.' },
    },
    outputs: {
      tcMinutes: { type: 'number', required: true },
      weightedC: { type: 'number', required: true },
      recommendedDurationMinutes: { type: 'integer', required: true },
      method: { type: 'string', required: true },
      note: { type: 'string', required: true },
    },
    examples: [
      'User: "What is my time of concentration for a 600 ft path at 1.5% with C = 0.6?" -> stormwater_time_of_concentration({weightedC:0.6, flowLengthFt:600, slopePercent:1.5})',
    ],
  },
  {
    id: 'stormwater_compute_detention',
    name: 'Estimate Detention Storage',
    type: 'query',
    description:
      'Preliminary detention storage with the Modified Rational Method. Use the same contributing surfaces and ' +
      'return period as stormwater_compute_runoff, plus the allowable release rate (allowableOutflowCfs). ' +
      'Searches every available storm duration for the critical storage volume using ' +
      'Vs = (Qin - Qout) x td, and returns the required storage in cubic feet, acre-feet, and gallons with the ' +
      'governing duration and every trial. Requires latitude/longitude for the full NOAA Atlas 14 curve. ' +
      'Optional safetyFactor (>= 1.0) multiplies the net storage. ' +
      'Screening only - route the design storm (EPA SWMM, HEC-HMS, or an approved local model) before sizing the outlet.',
    inputs: {
      surfaces: {
        type: 'array',
        required: true,
        items: { type: 'object' },
        description: 'One entry per contributing surface ({ type, areaSqFt, coefficient? }).',
      },
      returnPeriod: {
        type: 'integer',
        required: true,
        enum: [2, 5, 10, 25, 50, 100],
        description: 'Design storm return period in years.',
      },
      allowableOutflowCfs: {
        type: 'number',
        required: true,
        description: 'Allowable release rate to the downstream system in cfs (zero or greater).',
      },
      safetyFactor: {
        type: 'number',
        description: 'Optional multiplier on the net storage volume. Must be at least 1.0; defaults to 1.0.',
      },
      flowLengthFt: {
        type: 'number',
        description: 'Longest flow path length in feet. When supplied, the duration search starts at Tc.',
      },
      slopePercent: {
        type: 'number',
        description: 'Average slope along the flow path in percent.',
      },
      location: { type: 'string', description: 'Optional site address or description recorded on the report.' },
      latitude: { type: 'number', description: 'Optional WGS84 latitude for rainfall-data applicability.' },
      longitude: { type: 'number', description: 'Optional WGS84 longitude for rainfall-data applicability.' },
    },
    outputs: {
      requiredStorageCf: { type: 'number', required: true, description: 'Governing storage volume in cubic feet.' },
      requiredStorageAcreFt: { type: 'number', required: true },
      requiredStorageGallons: { type: 'number', required: true },
      allowableOutflowCfs: { type: 'number', required: true },
      safetyFactor: { type: 'number', required: true },
      governingDurationMinutes: { type: 'integer', required: true },
      peakInflowCfs: { type: 'number', required: true },
      trials: {
        type: 'array',
        items: { type: 'object' },
        required: true,
        description: 'Array of { durationMinutes, rainfallIntensity, peakInflowCfs, storageCf }.',
      },
      method: { type: 'string', required: true },
      warnings: { type: 'array', items: { type: 'string' }, required: true },
      report: {
        type: 'string',
        description: 'Copy-ready calculation report including the detention section.',
      },
    },
    examples: [
      'User: "How much detention do I need for the 25-year storm if I can release 0.5 cfs?" -> stormwater_compute_detention({returnPeriod:25, allowableOutflowCfs:0.5, surfaces:[...]})',
      'User: "Size a basin with a 1.25 factor of safety" -> stormwater_compute_detention({returnPeriod:25, allowableOutflowCfs:0.5, safetyFactor:1.25, surfaces:[...]})',
    ],
  },
  {
    id: 'stormwater_generate_hydrograph',
    name: 'Generate Design Hydrograph',
    type: 'query',
    description:
      'Generates a Modified Rational design hydrograph from the site surfaces and NOAA Atlas 14 rainfall. ' +
      'Requires either tcMinutes or both flowLengthFt and slopePercent. Returns peak flow, time to peak, ' +
      'time base, runoff volume, and the time/flow points. Use before detention routing or when the user asks ' +
      'for a hydrograph shape. NOAA Atlas 14 rainfall is fetched from latitude/longitude.',
    inputs: {
      surfaces: { type: 'array', required: true, items: { type: 'object' } },
      returnPeriod: { type: 'integer', required: true, enum: [2, 5, 10, 25, 50, 100] },
      tcMinutes: { type: 'number', description: 'Time of concentration in minutes.' },
      flowLengthFt: { type: 'number', description: 'Longest flow path in feet (FAA Tc).' },
      slopePercent: { type: 'number', description: 'Average slope in percent (FAA Tc).' },
      durationMinutes: { type: 'integer', description: 'Optional storm duration.' },
      latitude: { type: 'number', required: true, description: 'WGS84 latitude for the NOAA lookup.' },
      longitude: { type: 'number', required: true, description: 'WGS84 longitude for the NOAA lookup.' },
    },
    outputs: {
      peakFlowCfs: { type: 'number', required: true },
      timeToPeakMinutes: { type: 'number', required: true },
      timeBaseMinutes: { type: 'number', required: true },
      stormDurationMinutes: { type: 'number', required: true },
      runoffVolumeCf: { type: 'number', required: true },
      points: { type: 'array', items: { type: 'object' }, required: true },
      warnings: { type: 'array', items: { type: 'string' }, required: true },
    },
    examples: [
      'User: "Show the 25-year inflow hydrograph for this site" -> stormwater_generate_hydrograph({returnPeriod:25, latitude:39.95, longitude:-75.16, surfaces:[...]})',
    ],
  },
  {
    id: 'stormwater_route_detention',
    name: 'Route Detention Basin',
    type: 'query',
    description:
      'Routes the design hydrograph through a trapezoidal basin with an orifice and/or rectangular weir ' +
      'outlet using level-pool (Modified Puls) routing. Returns peak outflow, maximum stage and storage, ' +
      'inflow/outflow volumes, pass/fail against the allowable release, and the hydrograph points. ' +
      'Requires NOAA Atlas 14 rainfall via latitude/longitude and either tcMinutes or flowLengthFt + slopePercent. ' +
      'Screening only - confirm with EPA SWMM or HEC-HMS for permit design.',
    inputs: {
      surfaces: { type: 'array', required: true, items: { type: 'object' } },
      returnPeriod: { type: 'integer', required: true, enum: [2, 5, 10, 25, 50, 100] },
      tcMinutes: { type: 'number' },
      flowLengthFt: { type: 'number' },
      slopePercent: { type: 'number' },
      latitude: { type: 'number', required: true },
      longitude: { type: 'number', required: true },
      basin: {
        type: 'object',
        required: true,
        properties: {
          bottomWidthFt: { type: 'number', required: true },
          bottomLengthFt: { type: 'number', required: true },
          sideSlopeHv: { type: 'number', required: true },
          maxDepthFt: { type: 'number', required: true },
        },
      },
      outlet: {
        type: 'object',
        required: true,
        properties: {
          orificeDiameterIn: { type: 'number' },
          weirLengthFt: { type: 'number' },
          weirCrestFt: { type: 'number' },
        },
      },
      allowableOutflowCfs: { type: 'number' },
    },
    outputs: {
      peakInflowCfs: { type: 'number', required: true },
      peakOutflowCfs: { type: 'number', required: true },
      maxStageFt: { type: 'number', required: true },
      maxStorageCf: { type: 'number', required: true },
      maxStorageAcreFt: { type: 'number', required: true },
      passesAllowable: { type: 'boolean' },
      basinExceeded: { type: 'boolean', required: true },
      warnings: { type: 'array', items: { type: 'string' }, required: true },
      points: { type: 'array', items: { type: 'object' } },
    },
    examples: [
      'User: "Will a 40 x 30 ft basin with a 6-inch orifice pass 0.5 cfs?" -> stormwater_route_detention({..., basin:{bottomWidthFt:40,bottomLengthFt:30,sideSlopeHv:2,maxDepthFt:4}, outlet:{orificeDiameterIn:6}, allowableOutflowCfs:0.5})',
    ],
  },
  {
    id: 'stormwater_channel_capacity',
    name: 'Manning Channel Capacity',
    type: 'query',
    description:
      "Computes steady, uniform flow capacity for a rectangular, trapezoidal, triangular, or circular " +
      "section using Manning's equation. Returns area, hydraulic radius, velocity, capacity, Froude number, " +
      'flow regime, critical depth, and normal depth when a design flow is supplied.',
    inputs: {
      shape: { type: 'string', required: true, enum: ['rectangular', 'trapezoidal', 'triangular', 'circular'] },
      bottomWidthFt: { type: 'number' },
      sideSlopeHv: { type: 'number' },
      diameterFt: { type: 'number' },
      depthFt: { type: 'number', required: true },
      slope: { type: 'number', required: true, description: 'Longitudinal slope in ft/ft.' },
      manningsN: { type: 'number', required: true },
      designFlowCfs: { type: 'number', description: 'Optional target flow for the normal-depth solution.' },
    },
    outputs: {
      capacityCfs: { type: 'number', required: true },
      velocityFps: { type: 'number', required: true },
      hydraulicRadiusFt: { type: 'number', required: true },
      normalDepthFt: { type: 'number' },
      criticalDepthFt: { type: 'number' },
      froude: { type: 'number' },
      flowRegime: { type: 'string', required: true },
      warnings: { type: 'array', items: { type: 'string' }, required: true },
    },
    examples: [
      'User: "What does a 4-ft rectangular channel at 0.5% carry?" -> stormwater_channel_capacity({shape:"rectangular",bottomWidthFt:4,depthFt:2,slope:0.005,manningsN:0.013})',
    ],
  },
  {
    id: 'stormwater_surface_catalog',
    name: 'List Runoff Coefficients and Storm Catalog',
    description:
      'Returns the supported surface types with their runoff coefficients, the available return periods, ' +
      'and the available design storm durations. Use before asking the user for coefficients.',
    inputs: {},
    outputs: {
      surfaces: {
        type: 'array',
        items: { type: 'object' },
        required: true,
        description: 'Array of { key, coefficient, description }.',
      },
      returnPeriods: { type: 'array', items: { type: 'integer' }, required: true },
      durationsMinutes: { type: 'array', items: { type: 'integer' }, required: true },
      dataSource: { type: 'string', required: true },
    },
  },
  {
    id: 'stormwater_format_report',
    name: 'Format Stormwater Calculation Report',
    description:
      'Returns the copy-ready engineering report for the most recent runoff calculation in this session, ' +
      'including the detention section when a detention estimate is stored. ' +
      'Use when the user asks to "write it up", "export the calc", or add the calculation to project notes.',
    inputs: {},
    outputs: {
      report: { type: 'string', required: true },
      peakRunoffCfs: { type: 'number' },
      computedAt: { type: 'integer' },
    },
    examples: [
      'User: "Write up the stormwater calc for the report" -> stormwater_format_report({}).',
    ],
  },
  {
    id: 'stormwater_open_quickcheck',
    name: 'Open Stormwater Quick-Check',
    type: 'action',
    description:
      'Opens the Stormwater Quick-Check calculator in chat so the user can enter the site surface ' +
      'breakdown and design storm directly.',
    inputs: {},
    outputs: {
      opened: { type: 'boolean', required: true },
      mounted: { type: 'string', required: true },
    },
  },
  {
    id: 'stormwater_clear_quickcheck',
    name: 'Clear Stormwater Calculation',
    type: 'action',
    description:
      'Clears the stored stormwater runoff, detention, hydrograph, routing, and channel results for this session.',
    inputs: {},
    outputs: {
      cleared: { type: 'boolean', required: true },
    },
  },
];
