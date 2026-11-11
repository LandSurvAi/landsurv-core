/**
 * Agent Configuration Constants
 * 
 * Extracted from App.tsx as part of the Strangler Pattern refactoring.
 * These are the single source of truth for agent UI properties.
 * 
 * Migration Status: ✅ EXTRACTED
 * Next Step: Update App.tsx to import from here
 */

import { AgentType } from '../types.ts';
import { StormwaterIcon, DirtVolumeIcon } from '../components/icons.tsx';
import {
  BrainCircuitIcon,
  CivilDrafterIcon,
  CourthouseIcon,
  DocumentDuplicateIcon,
  DxfAnalyzerIcon,
  GisAgentIcon,
  ScaleIcon,
  PlumbBobIcon,
  CrosshairsIcon,
  CogoIcon,
  CameraIcon,
  DroneIcon,
  LsvzIcon,
  ContourIcon,
  ProfileIcon,
  SatelliteIcon,
  ARIcon,
  ZoningIcon,
  TitleSearchIcon,
  LayersIcon,
  StandardsComplianceIcon,
  CadManagerIcon,
  FloodIcon,
  HomeIcon,
  StructuresIcon,
  SoilsIcon,
  SlopeIcon,
  RoadIcon,
} from '../components/icons.tsx';

// ============================================================================
// Agent Configuration
// ============================================================================

export interface AgentConfig {
  icon: React.FC<any>;
  label: string;
  color: string;
}

export const agentConfig: { [key in AgentType]?: AgentConfig } = {
  [AgentType.RAW_CRAWLER]: { icon: BrainCircuitIcon, label: 'RAW Crawler', color: 'cyan' },
  [AgentType.VOICE_AGENT]: { icon: LsvzIcon, label: 'Voice Agent', color: 'cyan' },
  [AgentType.CIVIL_DRAFTER]: { icon: CivilDrafterIcon, label: 'Civil Drafter', color: 'fuchsia' },
  [AgentType.DEED_READER]: { icon: CourthouseIcon, label: 'Boundary Agent', color: 'green' },
  [AgentType.CIVIL_PLAN_EXPERT]: { icon: DocumentDuplicateIcon, label: 'Civil Plan Expert', color: 'orange' },
  [AgentType.DXF_ANALYZER]: { icon: DxfAnalyzerIcon, label: 'DXF Agent', color: 'indigo' },
  [AgentType.GIS_AGENT]: { icon: GisAgentIcon, label: 'GIS Agent', color: 'teal' },
  [AgentType.CENTERLINE_STATIONING]: { icon: ScaleIcon, label: 'Stationing & CL', color: 'purple' },
  [AgentType.POINT_EDITOR]: { icon: PlumbBobIcon, label: 'Point Editor', color: 'yellow' },
  [AgentType.GPS_STAKEOUT]: { icon: CrosshairsIcon, label: 'GPS Rover', color: 'blue' },
  [AgentType.CONTOURING_AGENT]: { icon: ContourIcon, label: 'Contouring', color: 'amber' },
  [AgentType.STEEP_SLOPE_AGENT]: { icon: SlopeIcon, label: 'Steep Slope', color: 'red' },
  [AgentType.IMAGE_ANALYZER]: { icon: CameraIcon, label: 'Image Analyzer', color: 'red' },
  [AgentType.LSVZ_AGENT]: { icon: LsvzIcon, label: 'LSAI Agent', color: 'cyan' },
  [AgentType.PROFILE_AGENT]: { icon: ProfileIcon, label: 'Profile & XS', color: 'sky' },
  [AgentType.COGO_AGENT]: { icon: CogoIcon, label: 'COGO', color: 'violet' },
  [AgentType.GNSS_AGENT]: { icon: SatelliteIcon, label: 'RINEX', color: 'lime' },
  [AgentType.DRONE_AGENT]: { icon: DroneIcon, label: 'Drone', color: 'amber' },
  [AgentType.AR_AGENT]: { icon: ARIcon, label: 'AR View', color: 'rose' },
  [AgentType.ZONING_AGENT]: { icon: ZoningIcon, label: 'Zoning', color: 'emerald' },
  [AgentType.TITLE_SEARCH]: { icon: TitleSearchIcon, label: 'Title Search', color: 'amber' },
  [AgentType.CAD_MANAGER]: { icon: CadManagerIcon, label: 'CAD Manager', color: 'indigo' },
  [AgentType.STANDARDS_COMPLIANCE]: { icon: StandardsComplianceIcon, label: 'Standards Compliance', color: 'violet' },
  [AgentType.FLOOD_AGENT]: { icon: FloodIcon, label: 'Flood Zone', color: 'cyan' },
  [AgentType.STRUCTURES_AGENT]: { icon: StructuresIcon, label: 'Structures', color: 'orange' },
  [AgentType.SOILS_AGENT]: { icon: SoilsIcon, label: 'Soils Agent', color: 'stone' },
  [AgentType.ROADING_AGENT]: { icon: RoadIcon, label: 'Roading Agent', color: 'amber' },
  [AgentType.STORMWATER_AGENT]: { icon: StormwaterIcon, label: 'Stormwater Agent', color: 'sky' },
  [AgentType.DIRT_VOLUME_AGENT]: { icon: DirtVolumeIcon, label: 'Dirt Volume Agent', color: 'amber' },
};

// ============================================================================
// Tool Shelf Activation
// ============================================================================

/**
 * Dockable tool key that should be surfaced the first time an agent is opened.
 * Keys match the ids built in App.tsx's `dockableToolItems`.
 */
export const agentPrimaryToolKey: Partial<Record<AgentType, string>> = {
  [AgentType.CIVIL_DRAFTER]: 'autoDraft',
  [AgentType.DEED_READER]: 'boundary-deed',
  [AgentType.CENTERLINE_STATIONING]: 'stationing',
  [AgentType.POINT_EDITOR]: 'pointEditor',
  [AgentType.GPS_STAKEOUT]: 'gpsStakeout',
  [AgentType.CONTOURING_AGENT]: 'contourGen',
  [AgentType.STEEP_SLOPE_AGENT]: 'steepSlope',
  [AgentType.PROFILE_AGENT]: 'profileGen',
  [AgentType.COGO_AGENT]: 'cogo',
  [AgentType.GNSS_AGENT]: 'gnss',
  [AgentType.DRONE_AGENT]: 'drone',
  [AgentType.GIS_AGENT]: 'streams',
  [AgentType.FLOOD_AGENT]: 'flood',
  [AgentType.STRUCTURES_AGENT]: 'structures',
  [AgentType.SOILS_AGENT]: 'soils',
  [AgentType.ROADING_AGENT]: 'roading',
  [AgentType.STORMWATER_AGENT]: 'stormwater',
};

// ============================================================================
// Theme Colors (Hex Values)
// ============================================================================

export const agentThemeColors: { [key in AgentType]?: string } = {
  [AgentType.RAW_CRAWLER]: '#22d3ee', // cyan-400
  [AgentType.VOICE_AGENT]: '#22d3ee', // cyan-400
  [AgentType.CIVIL_DRAFTER]: '#e879f9', // fuchsia-400
  [AgentType.DEED_READER]: '#34d399', // green-400
  [AgentType.CENTERLINE_STATIONING]: '#c084fc', // purple-400
  [AgentType.POINT_EDITOR]: '#facc15', // yellow-400
  [AgentType.GPS_STAKEOUT]: '#60a5fa', // blue-400
  [AgentType.FIELD_BOOK]: '#fb923c', // orange-400
  [AgentType.LSVZ_AGENT]: '#22d3ee', // cyan-400 — LandSurv "Surv"
  [AgentType.CIVIL_PLAN_EXPERT]: '#fb923c', // orange-400
  [AgentType.DXF_ANALYZER]: '#818cf8', // indigo-400
  [AgentType.IMAGE_ANALYZER]: '#f87171', // red-400
  [AgentType.GIS_AGENT]: '#2dd4bf', // teal-400
  [AgentType.CONTOURING_AGENT]: '#f59e0b', // amber-500
  [AgentType.STEEP_SLOPE_AGENT]: '#f97316', // orange-500
  [AgentType.PROFILE_AGENT]: '#38bdf8', // sky-400
  [AgentType.COGO_AGENT]: '#a78bfa', // violet-400
  [AgentType.GNSS_AGENT]: '#84cc16', // lime-400
  [AgentType.DRONE_AGENT]: '#fbbf24', // amber-400
  [AgentType.AR_AGENT]: '#fb7185', // rose-400
  [AgentType.ZONING_AGENT]: '#34d399', // emerald-400
  [AgentType.TITLE_SEARCH]: '#fbbf24', // amber-400
  [AgentType.CAD_MANAGER]: '#818cf8', // indigo-400
  [AgentType.STANDARDS_COMPLIANCE]: '#a78bfa', // violet-400
  [AgentType.FLOOD_AGENT]: '#22d3ee', // cyan-400
  [AgentType.STRUCTURES_AGENT]: '#fb923c', // orange-400
  [AgentType.SOILS_AGENT]: '#a8a29e', // stone-400 (earthy, distinct)
  [AgentType.ROADING_AGENT]: '#f59e0b', // amber-500
  [AgentType.STORMWATER_AGENT]: '#38bdf8', // sky-400
  [AgentType.DIRT_VOLUME_AGENT]: '#d97706', // amber-600
};

/**
 * Secondary highlight color used alongside an agent's primary accent.
 * LSAI uses the LandSurv.ai wordmark palette: cyan for the "LS" half and
 * emerald for the "AI" half, mirroring cyan "Surv" and green ".ai".
 */
export const agentSecondaryThemeColors: { [key in AgentType]?: string } = {
  [AgentType.LSVZ_AGENT]: '#34d399', // emerald-400 — LandSurv ".ai"
};

// ============================================================================
// Icon Components
// ============================================================================

export const agentIcons: { [key in AgentType]?: React.FC<any> } = {
  [AgentType.RAW_CRAWLER]: BrainCircuitIcon,
  [AgentType.VOICE_AGENT]: LsvzIcon,
  [AgentType.CIVIL_DRAFTER]: CivilDrafterIcon,
  [AgentType.DEED_READER]: CourthouseIcon,
  [AgentType.CIVIL_PLAN_EXPERT]: DocumentDuplicateIcon,
  [AgentType.DXF_ANALYZER]: DxfAnalyzerIcon,
  [AgentType.GIS_AGENT]: GisAgentIcon,
  [AgentType.CENTERLINE_STATIONING]: ScaleIcon,
  [AgentType.POINT_EDITOR]: PlumbBobIcon,
  [AgentType.GPS_STAKEOUT]: CrosshairsIcon,
  [AgentType.IMAGE_ANALYZER]: CameraIcon,
  [AgentType.LSVZ_AGENT]: LsvzIcon,
  [AgentType.CONTOURING_AGENT]: ContourIcon,
  [AgentType.STEEP_SLOPE_AGENT]: SlopeIcon,
  [AgentType.PROFILE_AGENT]: ProfileIcon,
  [AgentType.COGO_AGENT]: CogoIcon,
  [AgentType.GNSS_AGENT]: SatelliteIcon,
  [AgentType.DRONE_AGENT]: DroneIcon,
  [AgentType.AR_AGENT]: ARIcon,
  [AgentType.ZONING_AGENT]: ZoningIcon,
  [AgentType.TITLE_SEARCH]: TitleSearchIcon,
  [AgentType.CAD_MANAGER]: CadManagerIcon,
  [AgentType.STANDARDS_COMPLIANCE]: StandardsComplianceIcon,
  [AgentType.FLOOD_AGENT]: FloodIcon,
  [AgentType.STRUCTURES_AGENT]: StructuresIcon,
  [AgentType.SOILS_AGENT]: SoilsIcon,
  [AgentType.ROADING_AGENT]: RoadIcon,
  [AgentType.STORMWATER_AGENT]: StormwaterIcon,
  [AgentType.DIRT_VOLUME_AGENT]: DirtVolumeIcon,
};

// ============================================================================
// Gradient Classes (Tailwind)
// ============================================================================

export const agentGradientClasses: { [key in AgentType]?: string } = {
  [AgentType.RAW_CRAWLER]: 'from-cyan-500 to-blue-600',
  [AgentType.VOICE_AGENT]: 'from-cyan-500 to-blue-600',
  [AgentType.CIVIL_DRAFTER]: 'from-fuchsia-500 to-purple-600',
  [AgentType.DEED_READER]: 'from-green-500 to-emerald-600',
  [AgentType.CENTERLINE_STATIONING]: 'from-purple-500 to-violet-600',
  [AgentType.POINT_EDITOR]: 'from-yellow-500 to-amber-600',
  [AgentType.GPS_STAKEOUT]: 'from-blue-500 to-indigo-600',
  [AgentType.FIELD_BOOK]: 'from-orange-500 to-red-600',
  [AgentType.LSVZ_AGENT]: 'from-cyan-500 to-emerald-500',
  [AgentType.CIVIL_PLAN_EXPERT]: 'from-orange-500 to-amber-600',
  [AgentType.DXF_ANALYZER]: 'from-indigo-500 to-violet-600',
  [AgentType.IMAGE_ANALYZER]: 'from-red-500 to-orange-600',
  [AgentType.GIS_AGENT]: 'from-teal-500 to-cyan-600',
  [AgentType.CONTOURING_AGENT]: 'from-amber-500 to-yellow-600',
  [AgentType.STEEP_SLOPE_AGENT]: 'from-orange-500 to-red-600',
  [AgentType.PROFILE_AGENT]: 'from-sky-500 to-blue-600',
  [AgentType.COGO_AGENT]: 'from-violet-500 to-purple-600',
  [AgentType.GNSS_AGENT]: 'from-indigo-500 to-blue-600',
  [AgentType.DRONE_AGENT]: 'from-amber-400 to-orange-600',
  [AgentType.AR_AGENT]: 'from-rose-500 to-pink-600',
  [AgentType.ZONING_AGENT]: 'from-emerald-500 to-green-600',
  [AgentType.TITLE_SEARCH]: 'from-amber-500 to-orange-600',
  [AgentType.CAD_MANAGER]: 'from-indigo-500 to-violet-600',
  [AgentType.STANDARDS_COMPLIANCE]: 'from-violet-500 to-fuchsia-600',
  [AgentType.FLOOD_AGENT]: 'from-cyan-500 to-blue-600',
  [AgentType.STRUCTURES_AGENT]: 'from-orange-500 to-amber-600',
  [AgentType.SOILS_AGENT]: 'from-stone-400 to-amber-700',
  [AgentType.ROADING_AGENT]: 'from-amber-500 to-orange-600',
  [AgentType.STORMWATER_AGENT]: 'from-sky-500 to-blue-600',
  [AgentType.DIRT_VOLUME_AGENT]: 'from-amber-600 to-stone-700',
};

// ============================================================================
// Add Data Button Labels
// ============================================================================

export const addDataButtonLabels: { [key in AgentType]?: string } = {
  [AgentType.RAW_CRAWLER]: 'Replace RAW File...',
  [AgentType.CIVIL_DRAFTER]: 'Replace Point/PDF File...',
  [AgentType.DEED_READER]: 'Upload Deed',
  [AgentType.CIVIL_PLAN_EXPERT]: 'Add Plan Sheets...',
  [AgentType.DXF_ANALYZER]: 'Replace DXF File...',
  [AgentType.GIS_AGENT]: 'Replace GeoJSON File...',
  [AgentType.CENTERLINE_STATIONING]: 'Replace CL File...',
  [AgentType.POINT_EDITOR]: 'Import Points...',
  [AgentType.IMAGE_ANALYZER]: 'Add Images...',
  [AgentType.TITLE_SEARCH]: 'Add Deeds...',
  [AgentType.STANDARDS_COMPLIANCE]: 'Upload Compliance PDFs...',
  [AgentType.CAD_MANAGER]: 'Upload Standards File...',
  [AgentType.ZONING_AGENT]: 'Set Jurisdiction...',
  [AgentType.ROADING_AGENT]: 'Configure Road...',
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert hex color to RGB string for CSS custom properties
 */
export const hexToRgb = (hex: string): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : '148, 163, 184'; // fallback slate-400
};

/**
 * Get agent configuration by type with fallback
 */
export const getAgentConfig = (agentType: AgentType): AgentConfig => {
  return agentConfig[agentType] || {
    icon: LsvzIcon,
    label: 'Unknown Agent',
    color: 'gray',
  };
};

/**
 * Get agent theme color with fallback
 */
export const getAgentThemeColor = (agentType: AgentType): string => {
  return agentThemeColors[agentType] || '#94a3b8';
};

/**
 * Get agent gradient class with fallback
 */
export const getAgentGradientClass = (agentType: AgentType): string => {
  return agentGradientClasses[agentType] || 'from-slate-500 to-gray-600';
};
