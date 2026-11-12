/**
 * Agent Welcome Messages
 *
 * Single source of truth for the greeting each agent posts when it is
 * initialized. Centralizing the copy keeps the tone, structure, and branding
 * consistent across the whole agent suite.
 *
 * Format (every agent):
 *   Hello! I am the <strong>Agent name</strong> agent. <summary> <detail?>
 *
 * @module services/agentWelcome
 */

import { AgentType } from '../types';
import { agentThemeColors } from '../constants/agents';

export interface AgentWelcomeProfile {
  /** Agent name used in the greeting, matching the name shown in the UI. */
  name: string;
  /** One or two sentences describing the agent's role and capabilities. */
  summary: string;
}

/**
 * Professional, capability-focused copy for each agent. Keep summaries
 * parallel in structure: what the agent does, then what it produces.
 */
export const AGENT_WELCOME_PROFILES: Partial<Record<AgentType, AgentWelcomeProfile>> = {
  [AgentType.LSVZ_AGENT]: {
    name: 'LSAI',
    summary:
      'I keep your project moving across the full LandSurv.ai agent suite. Ask a question in plain language and I will handle the work or bring in the right specialist, with no hand-offs for you to manage. I also own project location: every uploaded point cluster is resolved to its state, county, and municipality and shared with every agent over CACP.',
  },
  [AgentType.RAW_CRAWLER]: {
    name: 'RAW Crawler',
    summary:
      'I parse field <strong>.RAW</strong> survey files, validate the observations, and plot the resulting geometry on the canvas.',
  },
  [AgentType.DEED_READER]: {
    name: 'Boundary',
    summary:
      'I interpret boundary evidence, resolve parcel geometry from legal descriptions, and plot a closed boundary with a closure report.',
  },
  [AgentType.CIVIL_DRAFTER]: {
    name: 'Civil Drafter',
    summary:
      'I produce civil linework from survey data, plan sheets, and natural-language instructions: boundaries, alignments, road corridors, building footprints, and annotation.',
  },
  [AgentType.CIVIL_PLAN_EXPERT]: {
    name: 'Civil Plan Expert',
    summary:
      'I read and synthesize civil plan sheets, extracting dimensions, annotations, and design data for drafting and analysis.',
  },
  [AgentType.DXF_ANALYZER]: {
    name: 'DXF',
    summary:
      'I inspect DXF drawings, report on layers, entities, and geometry, and render the linework onto the canvas.',
  },
  [AgentType.CENTERLINE_STATIONING]: {
    name: 'Stationing & CL',
    summary:
      'I define horizontal alignments from points of intersection, <strong>.cl</strong> files, or a drawn BASELINE, and compute stations, offsets, and curve data. Auto station points follow the canvas P/L switch; point intervals, station prefix/notation, label spacing, and PI/PC/PT/BOP/EOP tag visibility live in Stationing Controls.',
  },
  [AgentType.POINT_EDITOR]: {
    name: 'Point Editor',
    summary:
      'I manage the project point database: importing, editing, filtering, and running coordinate geometry on point sets.',
  },
  [AgentType.GPS_STAKEOUT]: {
    name: 'GPS Rover',
    summary:
      'I support live stakeout and topographic collection, converting between grid and geographic coordinates.',
  },
  [AgentType.IMAGE_ANALYZER]: {
    name: 'Image Analyzer',
    summary:
      'I review site imagery and exhibit photos, describe conditions, and extract visible features for the project record.',
  },
  [AgentType.GIS_AGENT]: {
    name: 'GIS',
    summary:
      'I find, verify, and draw live public GIS layers — county lines, State Plane zones, districts, streams, water bodies, watersheds, parcels — against the active project.',
  },
  [AgentType.CONTOURING_AGENT]: {
    name: 'Contouring',
    summary:
      'I generate contours from the project points using a TIN surface and label them to the interval you specify.',
  },
  [AgentType.STEEP_SLOPE_AGENT]: {
    name: 'Steep Slope',
    summary:
      'I classify terrain by slope-percent bands on a TIN surface, remove components below your threshold, and publish the results as CAD layers.',
  },
  [AgentType.PROFILE_AGENT]: {
    name: 'Profile & Cross Section',
    summary:
      'I generate elevation profiles and cross sections along lines, alignments, and corridors.',
  },
  [AgentType.COGO_AGENT]: {
    name: 'COGO',
    summary:
      'I perform coordinate geometry calculations, including inverses, intersections, and boundary computations.',
  },
  [AgentType.GNSS_AGENT]: {
    name: 'RINEX',
    summary:
      'I process RINEX observation files into precise GNSS positioning solutions, with multi-constellation support and solution-quality analysis.',
  },
  [AgentType.DRONE_AGENT]: {
    name: 'Drone',
    summary:
      'I stage aerial imagery, run photogrammetric processing, and return orthomosaics and surface deliverables to your connected storage.',
  },
  [AgentType.AR_AGENT]: {
    name: 'AR',
    summary:
      'I visualize project points and linework in augmented reality on a Meta Quest headset for field verification and stakeout.',
  },
  [AgentType.ZONING_AGENT]: {
    name: 'Zoning',
    summary:
      'I research zoning districts, maps, and municipal regulations for the project area using live search grounding.',
  },
  [AgentType.TITLE_SEARCH]: {
    name: 'Title Search',
    summary:
      'I assemble the chain of title, flag liens and encumbrances, and summarize ownership history for the property.',
  },
  [AgentType.STANDARDS_COMPLIANCE]: {
    name: 'Standards Compliance',
    summary:
      'I audit plan sheets against your CAD standards for title blocks, layers, linetypes, revisions, and annotation completeness.',
  },
  [AgentType.CAD_MANAGER]: {
    name: 'CAD Manager',
    summary:
      'I align survey codes with your CAD standard, learning aliases and resolving layer, linetype, and block mappings.',
  },
  [AgentType.FLOOD_AGENT]: {
    name: 'Flood Zone',
    summary:
      'I retrieve FEMA NFHL flood-hazard linework, including optional Base Flood Elevation lines, and label the zones for review and exhibit work. Tell me what you need and I will ask about the rest: BFE lines, zone callouts, a written flood-zone report, or notes on the paperspace plan sheet.',
  },
  [AgentType.STRUCTURES_AGENT]: {
    name: 'Structures',
    summary:
      'I retrieve FEMA NSI attributes and OpenStreetMap building polygons, then reconcile the footprints to your surveyed building corners.',
  },
  [AgentType.SOILS_AGENT]: {
    name: 'Soils',
    summary:
      'I retrieve USDA NRCS SSURGO soil map units and attribute reports, including hydrologic group, drainage class, and farmland classification.',
  },
  [AgentType.STORMWATER_AGENT]: {
    name: 'Stormwater',
    summary:
      'I run national stormwater runoff with the Rational Method (Q = C i A), NOAA Atlas 14 rainfall, composite surface coefficients, FAA time of concentration, detention routing, and Manning channel capacity, and I produce a copy-ready report and PDF.',
  },
  [AgentType.DIRT_VOLUME_AGENT]: {
    name: 'Dirt Volume',
    summary:
      'I obtain and compare earthwork volumes: end-area cut/fill from cross sections, TIN-to-TIN surface comparisons, grid takeoffs, and stockpile volumes. I save scenarios, compare design options and haul balances, and produce copy-ready reports and PDFs.',
  },
  [AgentType.ROADING_AGENT]: {
    name: 'Roading',
    summary:
      'I synthesize existing roads from survey points, background imagery, and OpenStreetMap ways, and design proposed road corridors, typical sections, profiles, and cross sections in coordination with the Stationing & CL and Profile agents.',
  },
  [AgentType.REDLINE_AGENT]: {
    name: 'Redline',
    summary:
      'I read reviewer markup on annotated plan PDFs, turn every cloud, callout, and note into a numbered correction item, map each item onto the drawing with an explicit confidence, and work with the Civil Drafter to apply the corrections you approve.',
  },
};

/**
 * Build the standard welcome message for an agent.
 *
 * @param agentType Agent being introduced (selects name and theme color).
 * @param detail Optional follow-up sentence describing loaded data or the next step.
 * @param options Optional overrides for the name and summary copy.
 */
export function buildAgentWelcome(
  agentType: AgentType,
  detail?: string,
  options?: { name?: string; summary?: string }
): string {
  const profile = AGENT_WELCOME_PROFILES[agentType];
  const name = options?.name ?? profile?.name ?? 'LandSurv';
  const color = agentThemeColors[agentType] ?? '#94a3b8';
  const summary = options?.summary ?? profile?.summary ?? '';
  const body = [summary, detail].filter(Boolean).join(' ');

  return `Hello! I am the <strong style="color: ${color};">${name}</strong> agent.${body ? ` ${body}` : ''}`;
}
