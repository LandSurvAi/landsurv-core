import React, { useState, useEffect, useRef } from 'react';
import { AgentType, type JobInfo } from '../types.ts';
import JobInfoDialog from './JobInfoDialog.tsx';
import { XMarkIcon } from './icons.tsx';
import { RawAgentContent } from './landing/RawAgentContent.tsx';
import { DeedAgentContent } from './landing/DeedAgentContent.tsx';
import { PlanAgentContent } from './landing/PlanAgentContent.tsx';
import { DxfAgentContent } from './landing/DxfAgentContent.tsx';
import { StationAgentContent } from './landing/StationAgentContent.tsx';
import { PointAgentContent } from './landing/PointAgentContent.tsx';
import { GpsAgentContent } from './landing/GpsAgentContent.tsx';
import { ImageAgentContent } from './landing/ImageAgentContent.tsx';
import { GisAgentContent } from './landing/GisAgentContent.tsx';
import { ContourAgentContent, ProfileAgentContent } from './landing/ContourAgentContent.tsx';
import { SteepSlopeAgentContent } from './landing/SteepSlopeAgentContent.tsx';
import { CogoAgentContent } from './landing/CogoAgentContent.tsx';
import { GpxAgentContent } from './landing/GpxAgentContent.tsx';
import { ARAgentContent } from './landing/ARAgentContent.tsx';
import { CadManagerContent } from './landing/CadManagerContent.tsx';
import { CivilDrafterContent } from './landing/CivilDrafterContent.tsx';
import { StandardsComplianceContent } from './landing/StandardsComplianceContent.tsx';
import { RoadingAgentContent } from './landing/RoadingAgentContent.tsx';
import { StormwaterAgentContent } from './landing/StormwaterAgentContent.tsx';
import { StormwaterIcon, DirtVolumeIcon } from './icons.tsx';
import { BrainCircuitIcon, CourthouseIcon, RoadIcon, PlumbBobIcon, DocumentDuplicateIcon, DxfAnalyzerIcon, LsvzIcon, CurrencyDollarIcon, CrosshairsIcon, CogoIcon, FolderIcon, DocumentTextIcon, ArrowUpTrayIcon, DownloadIcon, ScaleIcon, MapPinIcon, CameraIcon, DroneIcon, ClipboardDocumentListIcon, LogClockIcon, BugAntIcon, CpuChipIcon, GisAgentIcon, ContourIcon, ProfileIcon, SatelliteIcon, ARIcon, ZoningIcon, TitleSearchIcon, PlugIcon, LayersIcon, CadManagerIcon, CivilDrafterIcon, KeyIcon, CogIcon, FloodIcon, HomeIcon, StructuresIcon, SoilsIcon, SlopeIcon, StandardsComplianceIcon, EnvelopeIcon, InfoIcon, LegalScaleIcon, ProjectionGlobeIcon } from './icons.tsx';
import { getRetiredAgents, type HomepageAgentType } from '../utils/retiredAgents.ts';
import { useExperimentalAgentEnabled } from '../hooks/useExperimentalAgentEnabled.ts';
import { getGlobalSettings, subscribeGlobalSettings } from '../utils/globalSettings.ts';
import { CacpBadge } from './CacpBadge.tsx';
import CacpManifestModal from './CacpManifestModal.tsx';
import { agentRegistry } from '../services/AgentRegistry';
import { projectionStates, projectionZones } from '../utils/projections.ts';
import { detectProjectionForCoordinates, detectProjectionFromBrowser } from '../utils/autoProjection.ts';
import { ensureCrsRegistered, searchCrs } from '../utils/crs/registry.ts';
import { getBundledCrs } from '../utils/crs/globalCatalog.ts';
import type { CrsDefinition } from '../utils/crs/types.ts';
import { executeContactRecaptcha } from '../utils/recaptcha.ts';
import HolidayEffects from './HolidayEffects.tsx';
import ThanksgivingEffects from './ThanksgivingEffects.tsx';

// Pre-generate bats for Halloween - each flies in once, grows as it approaches, then exits
const generateBats = () => {
  return Array.from({ length: 10 }, (_, i) => {
    const duration = 5.5 + Math.random() * 2.5;
    return {
      top: 4 + Math.random() * 70,
      size: 28 + Math.random() * 24,
      duration,
      flapDuration: 0.3 + Math.random() * 0.25,
      delay: Math.random() * 8,
      fromLeft: i % 2 === 0,
    };
  });
};

const BATS = generateBats();

const CONTACT_EMAIL_LINKS = [
  {
    label: 'General Support',
    email: 'support@landsurv.ai',
    subject: 'LandSurv.ai Support Request',
    description: 'Product help, account access, and general questions',
  },
  {
    label: 'Billing',
    email: 'billing@landsurv.ai',
    subject: 'LandSurv.ai Billing Question',
    description: 'Subscriptions, refunds, invoices, and payment questions',
  },
  {
    label: 'Standards',
    email: 'standards@landsurv.ai',
    subject: 'LandSurv.ai Standards Question',
    description: 'CAD standards, code mapping, and technical configuration',
  },
  {
    label: 'Security',
    email: 'security@landsurv.ai',
    subject: 'LandSurv.ai Security Report',
    description: 'Responsible disclosure and abuse reporting',
  },
  {
    label: 'Legal',
    email: 'legal@landsurv.ai',
    subject: 'LandSurv.ai Legal Inquiry',
    description: 'Terms, privacy, DPA, and formal notices',
  },
  {
    label: 'DMCA',
    email: 'dmca@landsurv.ai',
    subject: 'LandSurv.ai DMCA Notice',
    description: 'Copyright and takedown notices',
  },
];

// Holiday theme type
export type HolidayTheme = 'halloween' | 'thanksgiving' | 'christmas' | 'nye' | null;

// Get holiday theme override from localStorage
const getHolidayThemeOverride = (): HolidayTheme | 'auto' => {
  if (typeof window === 'undefined') return 'auto';
  const override = localStorage.getItem('landsurv-holiday-theme');
  if (override === 'halloween' || override === 'thanksgiving' || override === 'christmas' || override === 'nye' || override === 'none') {
    return override === 'none' ? null : override;
  }
  return 'auto';
};

// Set holiday theme override in localStorage
export const setHolidayThemeOverride = (theme: 'auto' | 'halloween' | 'thanksgiving' | 'christmas' | 'nye' | 'none') => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('landsurv-holiday-theme', theme);
  // Trigger re-render by dispatching a storage event
  window.dispatchEvent(new Event('storage'));
};

// Get the current holiday theme based on date or override
export const getHolidayTheme = (): HolidayTheme => {
  const override = getHolidayThemeOverride();
  if (override !== 'auto') return override;
  
  const now = new Date();
  const month = now.getMonth(); // 0-11
  const day = now.getDate();
  
  // Halloween: October 25 - November 1 (last week of October through the 1st)
  if ((month === 9 && day >= 25) || (month === 10 && day === 1)) {
    return 'halloween';
  }

  // Thanksgiving: November 2 - November 30 (after Halloween, before Christmas)
  if (month === 10 && day >= 2) {
    return 'thanksgiving';
  }

  // NYE: December 26 - January 1
  if ((month === 11 && day >= 26) || (month === 0 && day === 1)) {
    return 'nye';
  }
  
  // Christmas: December 1 - December 25
  if (month === 11 && day >= 1 && day <= 25) {
    return 'christmas';
  }
  
  return null;
};

// Christmas and NYE share the music and star decorations; Halloween has its own bats
const isChristmasSeason = () => {
  const theme = getHolidayTheme();
  return theme === 'christmas' || theme === 'nye';
};

// Check specifically for NYE theme
export const isNewYearsTheme = () => getHolidayTheme() === 'nye';

// Check specifically for Halloween theme
export const isHalloweenTheme = () => getHolidayTheme() === 'halloween';

// Check specifically for Thanksgiving theme
export const isThanksgivingTheme = () => getHolidayTheme() === 'thanksgiving';

// Release stage types and labels
export type ReleaseStage = 'pre-alpha' | 'alpha' | 'beta' | 'rc' | 'ga';

const isReleaseStage = (value: unknown): value is ReleaseStage =>
  value === 'pre-alpha' || value === 'alpha' || value === 'beta' || value === 'rc' || value === 'ga';

export const releaseStageLabels: Record<ReleaseStage, { short: string; full: string; hoverColor: string; hoverBorder: string }> = {
  'pre-alpha': { short: 'PA', full: 'Pre-Alpha', hoverColor: 'hover:text-red-400', hoverBorder: 'hover:border-red-400' },
  'alpha': { short: 'A', full: 'Alpha', hoverColor: 'hover:text-orange-400', hoverBorder: 'hover:border-orange-400' },
  'beta': { short: 'B', full: 'Beta', hoverColor: 'hover:text-yellow-400', hoverBorder: 'hover:border-yellow-400' },
  'rc': { short: 'RC', full: 'Release Candidate', hoverColor: 'hover:text-blue-400', hoverBorder: 'hover:border-blue-400' },
  'ga': { short: 'GA', full: 'General Availability', hoverColor: 'hover:text-green-400', hoverBorder: 'hover:border-green-400' },
};

// Mapping from AgentType to SEO landing page URLs
const agentSeoUrls: Partial<Record<AgentType, string>> = {
  [AgentType.RAW_CRAWLER]: 'https://raw.landsurv.ai',
  [AgentType.DEED_READER]: 'https://deed.landsurv.ai',
  [AgentType.CIVIL_PLAN_EXPERT]: 'https://plan.landsurv.ai',
  [AgentType.DXF_ANALYZER]: 'https://dxf.landsurv.ai',
  [AgentType.CENTERLINE_STATIONING]: 'https://station.landsurv.ai',
  [AgentType.POINT_EDITOR]: 'https://point.landsurv.ai',
  [AgentType.GPS_STAKEOUT]: 'https://gps.landsurv.ai',
  [AgentType.IMAGE_ANALYZER]: 'https://image.landsurv.ai',
  [AgentType.GIS_AGENT]: 'https://gis.landsurv.ai',
  [AgentType.CONTOURING_AGENT]: 'https://contour.landsurv.ai',
  [AgentType.STEEP_SLOPE_AGENT]: 'https://steepslopes.landsurv.ai',
  [AgentType.PROFILE_AGENT]: 'https://profile.landsurv.ai',
  [AgentType.COGO_AGENT]: 'https://cogo.landsurv.ai',
  [AgentType.GNSS_AGENT]: 'https://gpx.landsurv.ai',
  [AgentType.AR_AGENT]: 'https://ar.landsurv.ai',
  [AgentType.CAD_MANAGER]: 'https://cadmanager.landsurv.ai',
  [AgentType.CIVIL_DRAFTER]: 'https://civildrafter.landsurv.ai',
  [AgentType.ROADING_AGENT]: 'https://roading.landsurv.ai',
};

/** SPA info modal: maps each agent to its in-app info content. */
const agentInfoMap: Partial<Record<AgentType, { title: string; content: React.FC }>> = {
  [AgentType.DEED_READER]:           { title: 'Boundary Agent',                 content: DeedAgentContent },
  [AgentType.CIVIL_PLAN_EXPERT]:     { title: 'Civil Plan Expert Agent',         content: PlanAgentContent },
  [AgentType.DXF_ANALYZER]:          { title: 'DXF Agent',                       content: DxfAgentContent },
  [AgentType.CENTERLINE_STATIONING]: { title: 'Stationing & CL Agent',           content: StationAgentContent },
  [AgentType.POINT_EDITOR]:          { title: 'Point Editor Agent',              content: PointAgentContent },
  [AgentType.GPS_STAKEOUT]:          { title: 'GPS Stakeout Agent',              content: GpsAgentContent },
  [AgentType.IMAGE_ANALYZER]:        { title: 'Image Analyzer Agent',            content: ImageAgentContent },
  [AgentType.GIS_AGENT]:             { title: 'GIS Agent',                       content: GisAgentContent },
  [AgentType.CONTOURING_AGENT]:      { title: 'Contouring Agent',               content: ContourAgentContent },
  [AgentType.STEEP_SLOPE_AGENT]:     { title: 'Steep Slope Agent',              content: SteepSlopeAgentContent },
  [AgentType.PROFILE_AGENT]:         { title: 'Profile & Cross Section Agent',   content: ProfileAgentContent },
  [AgentType.COGO_AGENT]:            { title: 'COGO Agent',                      content: CogoAgentContent },
  [AgentType.GNSS_AGENT]:            { title: 'RINEX / GNSS Agent',             content: GpxAgentContent },
  [AgentType.AR_AGENT]:              { title: 'Augmented Reality Agent',         content: ARAgentContent },
  [AgentType.CAD_MANAGER]:           { title: 'CAD Manager',                     content: CadManagerContent },
  [AgentType.CIVIL_DRAFTER]:         { title: 'Civil Drafter Agent',             content: CivilDrafterContent },
  [AgentType.STANDARDS_COMPLIANCE]:  { title: 'Standards Compliance Agent',      content: StandardsComplianceContent },
  [AgentType.ROADING_AGENT]:         { title: 'Roading Agent',                   content: RoadingAgentContent },
  // RAW_CRAWLER intentionally omitted — agent is being phased out
};

// Card type definitions
type AgentCard = {
  type: HomepageAgentType;
  title: string;
  description: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  color: string;
  actionType: 'agent';
  c3dEnabled?: boolean;
  releaseStage?: ReleaseStage;
};

type Card = AgentCard;

interface InitialAgentSelectionProps {
  onSelectAgent: (agent: AgentType) => void;
  /** Called when the user explicitly clicks a tool option chip on a home card (e.g. Calc, Flood Area, From Survey) so the Tool Dock opens for that tool. */
  onSelectAgentToolOption?: (agent: AgentType) => void;
  onLoadSession: () => void;
  onShowSettings: () => void;
  onShowApiKeySettings: () => void;
  onShowUpgrade: () => void;
  // Info & Help props
  onShowDoc: () => void;
  onShowReleaseLog: () => void;
  onShowTech: () => void;
  onShowInvestor: () => void;
  onShowAbout: () => void;
  onShowCivil3D: () => void;
  onShowC3DConnect?: () => void;
  onShowReleaseStages?: () => void;
  onShowLegal: () => void;
  /** When the user clicks the pulsing red "Load Points" CTA on the Point Editor card. Opens the Point Editor and auto-triggers the upload picker. */
  onLoadPoints?: () => void;
  /** When the user clicks the pulsing green "Boundary Editor" CTA on the Boundary Agent card. Starts a blank manual-entry boundary session, skipping the deed-paste step. */
  onOpenBoundaryEditor?: () => void;
  /** When the user clicks the "GIS" link on the Boundary Agent card. Opens the county-parcel GIS panel on the canvas. */
  onOpenBoundaryGis?: () => void;
  /** When the user clicks the pulsing lavender "New Standards" CTA on the CAD Manager card. Starts a blank CAD standards session, bypassing the upload screen. */
  onOpenCadStandards?: () => void;
  /** Whether the CAD Manager already has a loaded standard available for immediate use. */
  cadStandardsLoaded?: boolean;
  /** Hide expensive agent cards for restricted API keys. */
  hideRestrictedFeatures?: boolean;
  /** When the user clicks the blue "Stakeout" CTA on the GPS Rover card. Opens the agent on the Stakeout tab. */
  onOpenGpsStakeout?: () => void;
  /** When the user clicks the blue "Collect" CTA on the GPS Rover card. Opens the agent on the Collect tab. */
  onOpenGpsCollect?: () => void;
  /** When the user clicks the "From GIS" CTA on the Contouring Agent card. Opens the agent and scrolls to the ESRI/GIS contour-source picker. */
  onOpenContouringFromGis?: () => void;
  /** When the user clicks the "From TIN" CTA on the Contouring Agent card. Opens a .tin/.landxml import picker. */
  onOpenContouringFromTin?: () => void;
  /** When the user clicks the Claude AI Settings card. Opens the Claude 4.7 Vertex AI settings panel. */
  onShowClaudeSettings?: () => void;
  /** When the user picks a state-plane zone or a worldwide EPSG from the header Projection dropdown. */
  onProjectionSelect?: (state: string, zoneName: string, epsg: number, proj4def: string, epoch?: number | null) => void;
  /** Currently active projection EPSG (used to show a check / current label in the Projection dropdown). */
  currentProjectionEpsg?: number | null;
  isC3DConnected?: boolean;
  hasApiKey?: boolean;
  // GPS props
  geolocationError: string | null;
  currentPosition: GeolocationPosition | null;
  // Version prop
  version?: string;
  /** Shared project metadata, edited via the Job Info dialog and available to all agents. */
  jobInfo?: JobInfo;
  /** Updater for the shared project metadata. */
  setJobInfo?: (next: JobInfo) => void;
}

export const homepageAgentCards = [
    // === BETA ===
    { 
        type: AgentType.DEED_READER, 
        title: 'Boundary Agent', 
        description: 'Paste a legal description or upload a deed PDF for the AI to interpret, analyze, and plot — or hand-key bearings and distances into the Boundary Editor.',
        icon: CourthouseIcon,
        color: 'green',
        actionType: 'agent' as const,
        c3dEnabled: true,
        releaseStage: 'beta' as ReleaseStage
    },
    { 
        type: AgentType.POINT_EDITOR, 
        title: 'Point Editor', 
        description: 'Import, manually enter, and organize survey point lists with AI-assisted coordinate geometry.',
        icon: PlumbBobIcon,
        color: 'yellow',
        actionType: 'agent' as const,
        c3dEnabled: true,
        releaseStage: 'beta' as ReleaseStage
    },
    // === ALPHA ===
    { 
        type: AgentType.CAD_MANAGER,
        title: 'CAD Manager', 
        description: 'AI-powered code matching system - standardize survey codes using learned aliases and DXF integration.',
        icon: CadManagerIcon,
        color: 'indigo',
        actionType: 'agent' as const,
        c3dEnabled: true,
        releaseStage: 'alpha' as ReleaseStage
    },
      {
        type: AgentType.STANDARDS_COMPLIANCE,
        title: 'Standards Compliance',
        description: 'Audit control and subject PDFs for title block, north arrow, layers, linetypes, revision block, and annotation completeness with optional CAD Manager context.',
        icon: StandardsComplianceIcon,
        color: 'violet',
        actionType: 'agent' as const,
        c3dEnabled: true,
        releaseStage: 'alpha' as ReleaseStage
      },
    { 
        type: AgentType.RAW_CRAWLER, 
        title: 'RAW File Crawler', 
        description: 'Upload a surveyor\'s .RAW file to analyze and visualize its contents using natural language.',
        icon: BrainCircuitIcon,
        color: 'cyan',
        actionType: 'agent' as const,
        releaseStage: 'alpha' as ReleaseStage
    },
    { 
        type: AgentType.CIVIL_DRAFTER, 
        title: 'Civil Drafter', 
        description: 'An advanced AI-powered drafting assistant specializing in intelligent linework recognition, automated plat generation, and seamless CAD workflow integration.',
        icon: CivilDrafterIcon,
        color: 'fuchsia',
        actionType: 'agent' as const,
        c3dEnabled: true,
        releaseStage: 'alpha' as ReleaseStage
    },
    { 
        type: AgentType.ROADING_AGENT, 
        title: 'Roading Agent (Experimental)',
        description: 'Experimental — synthesize existing roads from survey points, background imagery, and OSM ways, or design proposed road corridors, typical sections, profiles, and cross sections. Turn it on in Settings → Experimental Agents.',
        icon: RoadIcon,
        color: 'amber',
        actionType: 'agent' as const,
        c3dEnabled: true,
        releaseStage: 'alpha' as ReleaseStage
    },
    { 
        type: AgentType.CENTERLINE_STATIONING, 
        title: 'Stationing & CL', 
        description: 'Define horizontal alignments by PI or upload a .cl file, then perform station/offset calculations.',
        icon: ScaleIcon,
        color: 'purple',
        actionType: 'agent' as const,
        c3dEnabled: true,
        releaseStage: 'alpha' as ReleaseStage
    },
    { 
        type: AgentType.PROFILE_AGENT, 
        title: 'Profile & Cross Section', 
        description: 'Generate elevation profiles and cross sections along lines or alignments.',
        icon: ProfileIcon,
        color: 'sky',
        actionType: 'agent' as const,
        c3dEnabled: true,
        releaseStage: 'alpha' as ReleaseStage
    },
    // === PRE-ALPHA ===
    { 
        type: AgentType.CIVIL_PLAN_EXPERT, 
        title: 'Civil Plan Expert', 
        description: 'Upload multiple PDF plan sheets for the AI to read, synthesize, and extract design data from.',
        icon: DocumentDuplicateIcon,
        color: 'orange',
        actionType: 'agent' as const,
        c3dEnabled: true,
        releaseStage: 'pre-alpha' as ReleaseStage
    },
    { 
        type: AgentType.DXF_ANALYZER, 
        title: 'DXF Agent', 
        description: 'Upload a .dxf file to draw CAD linework instantly and inspect layers, geometry, and entities with AI.',
        icon: DxfAnalyzerIcon,
        color: 'indigo',
        actionType: 'agent' as const,
        c3dEnabled: true,
        releaseStage: 'pre-alpha' as ReleaseStage
    },
    {
        type: AgentType.GIS_AGENT,
        title: 'GIS Agent',
        description: 'Analyze GeoJSON or ask for live public layers — county lines, State Plane zones, districts, streams, water bodies, watersheds — directly on the canvas.',
        icon: GisAgentIcon,
        color: 'teal',
        actionType: 'agent' as const,
        releaseStage: 'pre-alpha' as ReleaseStage
    },
    { 
        type: AgentType.GPS_STAKEOUT, 
        title: 'GPS Rover', 
        description: 'Use your device\'s GPS for stakeout and topo surveys with AI-powered coordinate conversion.',
        icon: CrosshairsIcon,
        color: 'blue',
        actionType: 'agent' as const,
        releaseStage: 'pre-alpha' as ReleaseStage
    },
    { 
        type: AgentType.CONTOURING_AGENT,
        title: 'Contouring Agent',
        description: 'Generate contour lines from project points using a Triangulated Irregular Network (TIN) model.',
        icon: ContourIcon,
        color: 'amber',
        actionType: 'agent' as const,
        releaseStage: 'pre-alpha' as ReleaseStage
    },
    { 
        type: AgentType.STEEP_SLOPE_AGENT,
        title: 'Steep Slope Agent',
        description: 'Classify terrain by slope-percent bands on a TIN surface. Remove small components and publish slope layers to CAD.',
        icon: SlopeIcon,
        color: 'rose',
        actionType: 'agent' as const,
        releaseStage: 'pre-alpha' as ReleaseStage
    },
    { 
        type: AgentType.GNSS_AGENT,
        title: 'RINEX Agent', 
        description: 'Process RINEX files to generate high-precision GNSS solutions and perform RTK positioning.',
        icon: SatelliteIcon,
        color: 'lime',
        actionType: 'agent' as const,
        releaseStage: 'pre-alpha' as ReleaseStage
    },
    {
      type: AgentType.DRONE_AGENT,
      title: 'Drone Agent',
      description: 'Stage imagery in temporary processing storage, run photogrammetry through NodeODM, and export deliverables back to connected user storage.',
      icon: DroneIcon,
      color: 'amber',
      actionType: 'agent' as const,
      releaseStage: 'pre-alpha' as ReleaseStage
    },
    { 
        type: AgentType.COGO_AGENT, 
        title: 'COGO', 
        description: 'Perform coordinate geometry calculations including inverse and intersection computations.',
        icon: CogoIcon,
        color: 'violet',
        actionType: 'agent' as const,
        releaseStage: 'pre-alpha' as ReleaseStage
    },
     { 
        type: AgentType.IMAGE_ANALYZER,
        title: 'Image Analyzer', 
        description: 'Upload images to get AI-powered descriptions, tags, and perform visual analysis.',
        icon: CameraIcon,
        color: 'red',
        actionType: 'agent' as const,
        releaseStage: 'pre-alpha' as ReleaseStage
    },
    { 
        type: AgentType.AR_AGENT,
        title: 'AR Visualization', 
        description: 'Visualize survey points and data in 3D augmented reality using your Meta Quest headset.',
        icon: ARIcon,
        color: 'rose',
        actionType: 'agent' as const,
        releaseStage: 'pre-alpha' as ReleaseStage
    },
    { 
        type: AgentType.ZONING_AGENT,
        title: 'Zoning Agent', 
        description: 'AI-powered zoning research to find zoning maps, districts, and municipal regulations.',
        icon: ZoningIcon,
        color: 'emerald',
        actionType: 'agent' as const,
        releaseStage: 'pre-alpha' as ReleaseStage
    },
    { 
        type: AgentType.TITLE_SEARCH,
        title: 'Title Search', 
        description: 'Trace property ownership history, identify liens and encumbrances, and establish chain of title.',
        icon: TitleSearchIcon,
        color: 'amber',
        actionType: 'agent' as const,
        releaseStage: 'pre-alpha' as ReleaseStage
    },
    {
        type: AgentType.FLOOD_AGENT,
        title: 'Flood Zone Agent',
        description: 'AI-powered flood hazard research — download georeferenced FEMA NFHL floodplain linework for any project area and import it straight onto the canvas as a flood layer.',
        icon: FloodIcon,
        color: 'cyan',
        actionType: 'agent' as const,
        releaseStage: 'pre-alpha' as ReleaseStage
    },
    {
        type: AgentType.STRUCTURES_AGENT,
        title: 'Structures Agent',
        description: 'Overlay FEMA National Structure Inventory (NSI) buildings over your project area, compare against survey BLDG points, and synthesize rectified building footprints onto the canvas.',
        icon: StructuresIcon,
        color: 'orange',
        actionType: 'agent' as const,
        releaseStage: 'pre-alpha' as ReleaseStage
    },
    {
        type: AgentType.SOILS_AGENT,
        title: 'Soils Agent',
        description: 'Overlay USDA NRCS SSURGO soil survey map-unit polygons for any project area. Fetch tabular reports (hydrologic group, drainage class, farmland classification) and render each map unit as its own CAD layer for professional soils exhibits.',
        icon: SoilsIcon,
        color: 'stone',
        actionType: 'agent' as const,
        releaseStage: 'pre-alpha' as ReleaseStage
    },
    {
        type: AgentType.STORMWATER_AGENT,
        title: 'Stormwater Agent (Experimental)',
        description: 'Experimental — national stormwater runoff with NOAA Atlas 14 rainfall, Rational Method hydrographs, detention routing, and Manning channel capacity. Turn it on in Settings → Experimental Agents.',
        icon: StormwaterIcon,
        color: 'sky',
        actionType: 'agent' as const,
        releaseStage: 'pre-alpha' as ReleaseStage
    },
    {
        type: AgentType.DIRT_VOLUME_AGENT,
        title: 'Dirt Volume Agent',
        description: 'Obtain and compare earthwork quantities — end-area cut/fill from cross sections, TIN-to-TIN surface comparisons, grid takeoffs, and stockpile volumes. Save scenarios, compare design options, and export quantity reports.',
        icon: DirtVolumeIcon,
        color: 'amber',
        actionType: 'agent' as const,
        releaseStage: 'pre-alpha' as ReleaseStage
    },
    {
        type: AgentType.LSVZ_AGENT,
        title: 'LSAI Agent',
        description: 'Your project assistant — ask anything, and it will handle the work or bring in the right specialist.',
        icon: LsvzIcon,
        color: 'cyan',
        actionType: 'agent' as const
    },
] satisfies readonly AgentCard[];

const QUICK_CHIP_CLASS = 'agent-quick-chip relative inline-flex items-center gap-1 rounded-[5px] border border-slate-600/70 bg-slate-800/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-300 transition-colors hover:border-slate-400 hover:bg-slate-700/60 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-slate-400 light-theme:border-gray-300 light-theme:bg-white/70 light-theme:text-gray-600 light-theme:hover:text-gray-900';

const Card: React.FC<{ card: Card, onClick: () => void, onToolOptionClick?: () => void, isC3DConnected?: boolean, onShowReleaseStages?: () => void, onInfoClick?: () => void, pulseDelay?: number, onCacpClick?: (agent: AgentType) => void, onLoadPoints?: () => void, onOpenBoundaryEditor?: () => void, onOpenBoundaryGis?: () => void, onOpenCadStandards?: () => void, onOpenGpsStakeout?: () => void, onOpenGpsCollect?: () => void, onOpenContouringFromGis?: () => void, onOpenContouringFromTin?: () => void, cadStandardsLoaded?: boolean }> = ({ card, onClick, onToolOptionClick, isC3DConnected = false, onShowReleaseStages, onInfoClick, pulseDelay = 0, onCacpClick, onLoadPoints, onOpenBoundaryEditor, onOpenBoundaryGis, onOpenCadStandards, onOpenGpsStakeout, onOpenGpsCollect, onOpenContouringFromGis, onOpenContouringFromTin, cadStandardsLoaded = false }) => {
    const Icon = card.icon;

    // Hex color mapping for fade animation
    const colorHexMap: { [key: string]: string } = {
        'cyan': '#22d3ee',      // cyan-400
        'green': '#34d399',     // green-400
        'orange': '#fb923c',    // orange-400
        'indigo': '#818cf8',    // indigo-400
        'teal': '#2dd4bf',      // teal-400
        'purple': '#c084fc',    // purple-400
        'yellow': '#facc15',    // yellow-400
        'blue': '#60a5fa',      // blue-400
        'amber': '#f59e0b',     // amber-500
        'sky': '#38bdf8',       // sky-400
        'lime': '#84cc16',      // lime-400
        'violet': '#a78bfa',    // violet-400
        'red': '#f87171',       // red-400
        'gray': '#9ca3af',      // gray-400
        'rose': '#fb7185',      // rose-400
        'emerald': '#34d399',   // emerald-400
        'fuchsia': '#e879f9'    // fuchsia-400
    };

    const startColor = colorHexMap[card.color] || '#94a3b8';
    
    // Detect theme for end color - check for light-theme class on body or html
    const isDarkTheme = !document.documentElement.classList.contains('light-theme');
    const endColor = isDarkTheme ? '#d1d5db' : '#4b5563'; // gray-300 dark, gray-600 light

    // Color mapping for title to ensure lime shows properly
    const getTitleColor = () => {
        const colorMap: { [key: string]: string } = {
            'cyan': 'text-cyan-400',
            'green': 'text-green-400',
            'orange': 'text-orange-400',
            'indigo': 'text-indigo-400',
            'teal': 'text-teal-400',
            'purple': 'text-purple-400',
            'yellow': 'text-yellow-400',
            'blue': 'text-blue-400',
            'amber': 'text-amber-400',
            'sky': 'text-sky-400',
            'lime': 'text-lime-400',
            'violet': 'text-violet-400',
            'red': 'text-red-400',
            'gray': 'text-gray-400',
            'rose': 'text-rose-400',
            'emerald': 'text-emerald-400',
            'fuchsia': 'text-fuchsia-400'
        };
        return colorMap[card.color] || 'text-gray-100';
    };

    // Get release stage info
    const releaseStage = card.releaseStage ? releaseStageLabels[card.releaseStage] : null;

    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
          className="thanksgiving-card agent-card group relative flex h-full flex-col items-start rounded-lg border-2 border-slate-700/70 bg-gray-900/50 px-5 pb-12 pt-6 text-left transition-colors duration-200 hover:border-[color:var(--color-start)] hover:bg-gray-800/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-start)] light-theme:border-gray-300 light-theme:bg-gray-100/60 light-theme:hover:bg-white"
            style={{
                '--color-start': startColor,
                '--color-end': endColor
            } as React.CSSProperties & { '--color-start': string; '--color-end': string; }}
        >
            {/* Persistent accent rail — gives the grid rhythm at rest, brightens on hover. */}
            <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-[3px] top-[3px] h-[2px] rounded-full opacity-50 transition-opacity duration-200 group-hover:opacity-100"
                style={{ backgroundColor: startColor }}
            />
            {/* Civil 3D capability — neutral when idle, green only when a session is connected. */}
            {card.c3dEnabled && (
                <div
                    className="absolute right-3 top-2 flex items-center gap-1"
                    title={isC3DConnected ? 'Civil 3D connected' : 'Civil 3D not connected'}
                >
                    <span className={`h-1.5 w-1.5 rounded-full ${isC3DConnected ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                    <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500 light-theme:text-gray-500">C3D</span>
                </div>
            )}

            <div className="mb-2.5 flex w-full items-center gap-3">
                <Icon className="h-9 w-9 shrink-0" style={{ color: startColor }} />
                <h3
                    className="title-pulse min-w-0 flex-1 text-[15px] font-bold leading-snug"
                    style={{
                        '--pulse-color': startColor,
                        '--pulse-delay': `${pulseDelay}s`,
                    } as React.CSSProperties & { '--pulse-color': string; '--pulse-delay': string; }}
                >
                    {card.title}
                </h3>
                {onInfoClick && (
                    <button
                        type="button"
                        aria-label={`About ${card.title}`}
                        title={`About ${card.title}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            onInfoClick();
                        }}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-600/70 text-[10px] font-bold text-slate-400 opacity-60 transition hover:border-[color:var(--color-start)] hover:text-white hover:opacity-100 focus:outline-none focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-[color:var(--color-start)] light-theme:border-gray-300 light-theme:text-gray-500 light-theme:hover:text-gray-900"
                    >
                        i
                    </button>
                )}
            </div>
            <p className="line-clamp-2 flex-grow pr-1 text-[13px] leading-relaxed text-gray-400 light-theme:text-gray-600" title={card.description}>{card.description}</p>
            {/* Load Points CTA — instant client-side point upload, no sign-in required. */}
            {card.actionType === 'agent' && card.type === AgentType.POINT_EDITOR && onLoadPoints && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onLoadPoints(); }}
                    title="Upload a point file (.csv / .txt) and view it instantly — no sign-in required"
                    className={QUICK_CHIP_CLASS}
                >
                    <ArrowUpTrayIcon className="w-3 h-3" />
                    Load Points
                </button>
            )}
            {/* Boundary Agent routes — agentic deed drafting, hand-keyed boundary, or county GIS parcels. */}
            {card.actionType === 'agent' && card.type === AgentType.DEED_READER && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onClick(); }}
                        title="Paste or upload a deed and let the AI draft the boundary"
                        className={QUICK_CHIP_CLASS}
                    >
                        <BrainCircuitIcon className="w-3 h-3" />
                        Agentic
                    </button>
                    {onOpenBoundaryEditor && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onOpenBoundaryEditor(); }}
                            title="Start a blank boundary and key in bearings & distances by hand — no deed required"
                            className={QUICK_CHIP_CLASS}
                        >
                            <CourthouseIcon className="w-3 h-3" />
                            Manual
                        </button>
                    )}
                    {onOpenBoundaryGis && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onOpenBoundaryGis(); }}
                            title="Pull public county tax-parcel boundaries from the GIS parcel panel"
                            className={QUICK_CHIP_CLASS}
                        >
                            <GisAgentIcon className="w-3 h-3" />
                            GIS
                        </button>
                    )}
                </div>
            )}
            {/* New Standards CTA — bypass the upload screen and drop straight into the CAD Standards interface. */}
            {card.actionType === 'agent' && card.type === AgentType.CAD_MANAGER && onOpenCadStandards && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpenCadStandards(); }}
                    title="Start a blank CAD standards session and open the editor — skip the upload screen"
                    className={QUICK_CHIP_CLASS}
                >
                    <CadManagerIcon className="w-3 h-3" />
                    New Standards
                </button>
            )}
            {/* GPS Rover Stakeout / Collect CTAs — jump straight into the relevant tab inside the GPS Rover panel. */}
            {card.actionType === 'agent' && card.type === AgentType.GPS_STAKEOUT && (onOpenGpsStakeout || onOpenGpsCollect) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {onOpenGpsStakeout && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onOpenGpsStakeout(); }}
                            title="Open GPS Rover on the Stakeout tab"
                            className={QUICK_CHIP_CLASS}
                        >
                            <CrosshairsIcon className="w-3 h-3" />
                            Stakeout
                        </button>
                    )}
                    {onOpenGpsCollect && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onOpenGpsCollect(); }}
                            title="Open GPS Rover on the Collect tab"
                            className={QUICK_CHIP_CLASS}
                        >
                            <MapPinIcon className="w-3 h-3" />
                            Collect
                        </button>
                    )}
                </div>
            )}
            {/* Zoning Agent — Gather Zoning CTA opens agent (same as clicking the card). */}
            {card.actionType === 'agent' && card.type === AgentType.ZONING_AGENT && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onClick(); }}
                    title="Gather zoning maps, districts, and municipal regulations for your area"
                    className={QUICK_CHIP_CLASS}
                >
                    <ZoningIcon className="w-3 h-3" />
                    Gather Zoning
                </button>
            )}
            {/* COGO Agent — Calc CTA opens agent tool dock. */}
            {card.actionType === 'agent' && card.type === AgentType.COGO_AGENT && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); (onToolOptionClick ?? onClick)(); }}
                    title="Open the COGO panel — inverse, intersection, and shrinkwrap (boundary hull) tools"
                    className={QUICK_CHIP_CLASS}
                >
                    <CogoIcon className="w-3 h-3" />
                    Calc
                </button>
            )}
            {/* Flood Zone Agent — Flood Area CTA opens agent tool dock. */}
            {card.actionType === 'agent' && card.type === AgentType.FLOOD_AGENT && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); (onToolOptionClick ?? onClick)(); }}
                    title="Download FEMA NFHL flood-hazard linework for your project area"
                    className={QUICK_CHIP_CLASS}
                >
                    <FloodIcon className="w-3 h-3" />
                    Flood Area
                </button>
            )}
            {/* Structures Agent — Overlay Structures CTA opens agent tool dock. */}
            {card.actionType === 'agent' && card.type === AgentType.STRUCTURES_AGENT && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); (onToolOptionClick ?? onClick)(); }}
                    title="Overlay FEMA NSI structures and synthesize building footprints"
                    className={QUICK_CHIP_CLASS}
                >
                    <StructuresIcon className="w-3 h-3" />
                    Overlay Structures
                </button>
            )}
            {/* Stormwater Agent — Runoff Check CTA opens agent tool dock. */}
            {card.actionType === 'agent' && card.type === AgentType.STORMWATER_AGENT && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); (onToolOptionClick ?? onClick)(); }}
                    title="Run a Rational Method runoff quick-check for this site"
                    className={QUICK_CHIP_CLASS}
                >
                    <StormwaterIcon className="w-3 h-3" />
                    Runoff Check
                </button>
            )}
            {/* Dirt Volume Agent — Volume Report CTA opens the agent workspace. */}
            {card.actionType === 'agent' && card.type === AgentType.DIRT_VOLUME_AGENT && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); (onToolOptionClick ?? onClick)(); }}
                    title="Compute and compare earthwork quantities"
                    className={QUICK_CHIP_CLASS}
                >
                    <DirtVolumeIcon className="w-3 h-3" />
                    Volume Report
                </button>
            )}
            {/* Soils Agent — Overlay Soils CTA opens agent tool dock. */}
            {card.actionType === 'agent' && card.type === AgentType.SOILS_AGENT && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); (onToolOptionClick ?? onClick)(); }}
                    title="Overlay USDA NRCS SSURGO soil survey map-unit polygons"
                    className={QUICK_CHIP_CLASS}
                >
                    <SoilsIcon className="w-3 h-3" />
                    Overlay Soils
                </button>
            )}
            {/* Contouring Agent — From Survey / From GIS CTAs. */}
            {card.actionType === 'agent' && card.type === AgentType.CONTOURING_AGENT && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); (onToolOptionClick ?? onClick)(); }}
                        title="Open Contouring Agent and contour from your loaded survey points"
                        className={QUICK_CHIP_CLASS}
                    >
                        <ContourIcon className="w-3 h-3" />
                        From Survey
                    </button>
                    {onOpenContouringFromGis && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onOpenContouringFromGis(); }}
                            title="Open Contouring Agent and pull contours from a public ESRI / GIS service"
                            className={QUICK_CHIP_CLASS}
                        >
                            <GisAgentIcon className="w-3 h-3" />
                            From GIS
                        </button>
                    )}
                        {onOpenContouringFromTin && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onOpenContouringFromTin(); }}
                            title="Import a .tin or LandXML surface and use its vertices for contour generation"
                            className={QUICK_CHIP_CLASS}
                          >
                            <ArrowUpTrayIcon className="w-3 h-3" />
                            From TIN
                          </button>
                        )}
                </div>
            )}
            {/* Civil Drafter AI Draw CTA — same effect as clicking the card; surfaced so users know what the agent does. */}
            {card.actionType === 'agent' && card.type === AgentType.CIVIL_DRAFTER && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onClick(); }}
                    title="Open Civil Drafter and let the AI extract linework from your plan"
                    className={QUICK_CHIP_CLASS}
                >
                    <CivilDrafterIcon className="w-3 h-3" />
                    AI Draw
                </button>
            )}
            {/* Roading Agent — Synthesize & Design Road quick chips. */}
            {card.actionType === 'agent' && card.type === AgentType.ROADING_AGENT && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); (onToolOptionClick ?? onClick)(); }}
                        title="Synthesize existing roads from survey points, background imagery, and OpenStreetMap"
                        className={QUICK_CHIP_CLASS}
                    >
                        <RoadIcon className="w-3 h-3" />
                        Synthesize
                    </button>
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); (onToolOptionClick ?? onClick)(); }}
                        title="Design a proposed road corridor, typical section, and elevation profile"
                        className={QUICK_CHIP_CLASS}
                    >
                        <ScaleIcon className="w-3 h-3" />
                        Design Road
                    </button>
                </div>
            )}
            {/* Profile Agent New Profile CTA — opens Profile tool dock. */}
            {card.actionType === 'agent' && card.type === AgentType.PROFILE_AGENT && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); (onToolOptionClick ?? onClick)(); }}
                    title="Open the Profile & Cross Section workspace"
                    className={QUICK_CHIP_CLASS}
                >
                    <ProfileIcon className="w-3 h-3" />
                    New Profile
                </button>
            )}
            {releaseStage && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onShowReleaseStages?.();
                    }}
                    title={`${releaseStage.full} — click for details`}
                    className="absolute bottom-2 right-2 inline-flex h-[18px] items-center rounded-full border border-slate-600/70 px-1.5 text-[9px] font-bold uppercase leading-none tracking-[0.1em] text-gray-400 transition-colors hover:border-[color:var(--color-start)] hover:text-white light-theme:border-gray-300 light-theme:text-gray-500 light-theme:hover:text-gray-900"
                >
                    {releaseStage.full}
                </button>
            )}
            {/* Bottom-left status pills */}
            {card.actionType === 'agent' && (
              <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1.5">
                {card.type === AgentType.CAD_MANAGER && cadStandardsLoaded && (
                  <span
                    title="Standards Loaded"
                    aria-label="Standards Loaded"
                    className="inline-flex h-[18px] items-center gap-1 rounded-full border border-cyan-500/40 bg-cyan-700/25 px-1.5 text-[9px] font-bold uppercase leading-none tracking-[0.1em] text-cyan-300 light-theme:border-cyan-400 light-theme:bg-cyan-100 light-theme:text-cyan-800"
                  >
                    <svg className="h-2.5 w-2.5 shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M3.5 8.25 6.5 11 12.5 5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Loaded
                  </span>
                )}
                {onCacpClick && agentRegistry.isCacpEnabled(card.type as AgentType) && (
                  <CacpBadge
                    agent={card.type as AgentType}
                    variant="glyph"
                    onClick={onCacpClick}
                  />
                )}
              </div>
            )}
        </div>
    );
};

/** Common non-US CRSs shown before the user types, so worldwide support is discoverable. */
const POPULAR_GLOBAL_CODES = [27700, 2154, 7856, 2193, 3035, 32631];
const POPULAR_GLOBAL_CRS = POPULAR_GLOBAL_CODES
  .map(code => getBundledCrs(code))
  .filter((def): def is CrsDefinition => Boolean(def));

/**
 * Header "Projection" multi-button. Looks like the other menu-bar buttons,
 * but its label rotates "Set" ↔ "Projection" when no projection is set,
 * and shows the active EPSG when one is. Clicking opens a dropdown with
 * US State Plane zones and a worldwide EPSG search.
 */
const ProjectionMenuButton: React.FC<{
  currentEpsg?: number | null;
  currentPosition?: GeolocationPosition | null;
  onSelect?: (state: string, zoneName: string, epsg: number, proj4def: string, epoch?: number | null) => void;
}> = ({ currentEpsg, currentPosition, onSelect }) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'us' | 'global'>('us');
  const [stateCode, setStateCode] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [globalResults, setGlobalResults] = useState<CrsDefinition[]>([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setStateCode(null);
        setQuery('');
        setGlobalError(null);
        setLocateError(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Debounced worldwide search (offline catalogue + full EPSG registry).
  useEffect(() => {
    if (!open || mode !== 'global') return;
    const q = query.trim();
    if (!q) {
      setGlobalResults([]);
      setGlobalLoading(false);
      return;
    }
    let cancelled = false;
    setGlobalLoading(true);
    const timer = setTimeout(() => {
      void searchCrs(q, 12)
        .then(list => {
          if (!cancelled) {
            setGlobalResults(list);
            setGlobalLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setGlobalLoading(false);
            setGlobalError('Worldwide CRS search is unavailable.');
          }
        });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, mode, query]);

  const selectGlobalCrs = async (def: CrsDefinition) => {
    setGlobalError(null);
    try {
      const resolved = await ensureCrsRegistered(def.code, { epoch: def.epoch ?? null }, def);
      if (!resolved?.proj4) {
        setGlobalError(`EPSG:${def.code} could not be registered.`);
        return;
      }
      onSelect?.(def.country || 'International', def.name, def.code, resolved.proj4, def.epoch ?? null);
      setOpen(false);
      setStateCode(null);
      setQuery('');
    } catch (err: any) {
      setGlobalError(err?.message || `Could not load EPSG:${def.code}.`);
    }
  };

  const selectProjectionFromGps = async () => {
    setIsLocating(true);
    setLocateError(null);
    try {
      const detected = currentPosition
        ? await detectProjectionForCoordinates(
            currentPosition.coords.latitude,
            currentPosition.coords.longitude,
          )
        : await detectProjectionFromBrowser();
      const epsg = detected.projection.epsg;
      if (!epsg || !detected.proj4def) {
        throw new Error('The detected projection is missing an EPSG code or proj4 definition.');
      }
      onSelect?.(
        detected.projection.state || 'International',
        detected.projection.zoneName || detected.label,
        epsg,
        detected.proj4def,
        detected.projection.epoch ?? null,
      );
      setOpen(false);
      setStateCode(null);
      setQuery('');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/denied|permission/i.test(message)) {
        setLocateError('Location permission denied. Allow location access or pick a zone manually.');
      } else if (/timed?\s*out/i.test(message)) {
        setLocateError('Location lookup timed out. Try again or pick a zone manually.');
      } else {
        setLocateError(`Could not detect a projection: ${message}`);
      }
    } finally {
      setIsLocating(false);
    }
  };

  const label = currentEpsg
    ? `EPSG:${currentEpsg}`
    : null;

  const zones = stateCode ? (projectionZones[stateCode] || []) : [];
  const stateName = stateCode ? (projectionStates.find(s => s.code === stateCode)?.name || stateCode) : '';

  return (
    <div ref={ref} className="relative flex-1 min-w-[calc(20%-0.5rem)]">
      <button
        onClick={() => { setOpen(o => !o); setLocateError(null); }}
        className="group w-full h-full py-2.5 px-3 welcome-chrome-btn rounded-lg backdrop-blur-md border border-dashed transition-all duration-300 flex items-center justify-center gap-2.5 text-sm font-semibold tracking-tight bg-slate-950/75 hover:bg-slate-900/85 border-slate-400/25 hover:border-emerald-400/50 text-gray-200 hover:text-emerald-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] hover:shadow-lg hover:shadow-emerald-950/30 active:translate-y-0"
        type="button"
        title="Select Coordinate System (US State Plane or Worldwide EPSG)"
      >
        <ProjectionGlobeIcon className="w-[18px] h-[18px] text-emerald-400 flex-shrink-0 transition-transform duration-200 group-hover:scale-105" />
        <span className="truncate">{label || 'Set Projection'}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-80 max-h-96 overflow-y-auto rounded-lg bg-gray-900/95 border border-gray-700 shadow-2xl backdrop-blur-md z-50">
          <div className="p-2 border-b border-gray-700/60">
            <button
              type="button"
              onClick={() => void selectProjectionFromGps()}
              disabled={isLocating}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-600/15 px-2 py-2 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-600/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CrosshairsIcon className="h-4 w-4" />
              <span>{isLocating ? 'Locating…' : 'Use my GPS location'}</span>
            </button>
            {locateError && (
              <p role="alert" className="mt-1.5 text-[10px] leading-snug text-red-400">{locateError}</p>
            )}
          </div>
          <div className="flex border-b border-gray-700/60 sticky top-0 bg-gray-900/95 z-10">
            <button
              type="button"
              onClick={() => { setMode('us'); setStateCode(null); }}
              className={`flex-1 px-2 py-2 text-[10px] font-semibold uppercase tracking-wider ${mode === 'us' ? 'text-emerald-400 bg-emerald-600/10' : 'text-gray-400 hover:text-gray-200'}`}
            >
              US State Plane
            </button>
            <button
              type="button"
              onClick={() => { setMode('global'); setStateCode(null); }}
              className={`flex-1 px-2 py-2 text-[10px] font-semibold uppercase tracking-wider ${mode === 'global' ? 'text-emerald-400 bg-emerald-600/10' : 'text-gray-400 hover:text-gray-200'}`}
            >
              Worldwide / EPSG
            </button>
          </div>

          {mode === 'global' ? (
            <>
              <div className="p-2 border-b border-gray-700/60">
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="EPSG code, country, or projection name"
                  aria-label="Search worldwide coordinate systems"
                  autoFocus
                  className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              {globalError && <div className="px-3 py-2 text-[11px] text-red-400">{globalError}</div>}
              {!query.trim() && (
                <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-emerald-400 border-b border-gray-700/60">Popular worldwide</div>
              )}
              {query.trim() && globalLoading && (
                <div className="px-3 py-2 text-xs text-gray-400">Searching EPSG registry…</div>
              )}
              {query.trim() && !globalLoading && globalResults.length === 0 && (
                <div className="px-3 py-2 text-xs text-gray-400">No matching coordinate systems.</div>
              )}
              {(query.trim() ? globalResults : POPULAR_GLOBAL_CRS).map(def => (
                <button
                  key={def.code}
                  type="button"
                  onClick={() => { void selectGlobalCrs(def); }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-emerald-600/20 ${currentEpsg === def.code ? 'text-emerald-300 font-semibold' : 'text-gray-200 hover:text-emerald-300'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm truncate">{def.name}</div>
                      <div className="text-[10px] text-gray-500 truncate">{def.country || def.area || 'Worldwide'}</div>
                    </div>
                    <span className="text-[10px] text-gray-500 shrink-0">EPSG:{def.code}</span>
                  </div>
                </button>
              ))}
              <div className="px-3 py-1.5 text-[9px] text-gray-600 border-t border-gray-700/60">
                EPSG Geodetic Parameter Dataset · epsg.org
              </div>
            </>
          ) : !stateCode ? (
            <>
              <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-emerald-400 border-b border-gray-700/60">Select State</div>
              {projectionStates.map(s => (
                <button
                  key={s.code}
                  onClick={() => setStateCode(s.code)}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-emerald-600/20 hover:text-emerald-300"
                  type="button"
                >
                  {s.name}
                </button>
              ))}
            </>
          ) : (
            <>
              <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-emerald-400 border-b border-gray-700/60 flex items-center justify-between">
                <span>{stateName} — Zone</span>
                <button
                  onClick={() => setStateCode(null)}
                  className="text-gray-400 hover:text-gray-200"
                  type="button"
                >← back</button>
              </div>
              {zones.length === 0 && (
                <div className="px-3 py-2 text-xs text-gray-400 italic">No zones available.</div>
              )}
              {zones.map(z => {
                const active = currentEpsg === z.epsg;
                return (
                  <button
                    key={z.epsg}
                    onClick={() => {
                      onSelect?.(stateCode!, z.name, z.epsg, z.proj4def);
                      setOpen(false);
                      setStateCode(null);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-emerald-600/20 ${active ? 'text-emerald-300 font-semibold' : 'text-gray-200 hover:text-emerald-300'}`}
                    type="button"
                  >
                    <div className="flex items-center justify-between">
                      <span>{z.name}</span>
                      <span className="text-[10px] text-gray-500">EPSG:{z.epsg}</span>
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
};

// Declared at module scope: defining this inside InitialAgentSelection gave it a new
// component identity on every render, remounting it (and flickering) once per second.
const GpsStatus: React.FC<{
  geolocationError?: string | null;
  currentPosition?: GeolocationPosition | null;
  version?: string;
}> = ({ geolocationError, currentPosition, version }) => {
  let statusText: string;
  let statusColor: string;

  if (geolocationError) {
    statusText = `GPS Error: ${geolocationError}`;
    statusColor = 'text-red-400';
  } else if (currentPosition) {
    statusText = 'GPS Ready';
    statusColor = 'text-green-400';
  } else {
    statusText = 'Initializing GPS...';
    statusColor = 'text-yellow-400';
  }

  return (
    <div className="mt-8 text-sm">
      <p className={`flex items-center justify-center gap-2 ${statusColor}`}>
        <MapPinIcon className="w-4 h-4" />
        {statusText}
        {version && <span className="text-gray-500 ml-2">| v{version}</span>}
      </p>
    </div>
  );
};

const InitialAgentSelection: React.FC<InitialAgentSelectionProps> = ({ 
    onSelectAgent,
    onSelectAgentToolOption,
    onLoadSession,
    onShowSettings,
    onShowApiKeySettings,
    onShowUpgrade,
    onShowDoc,
    onShowReleaseLog,
    onShowTech,
    onShowInvestor, 
    onShowAbout,
    onShowCivil3D,
    onShowC3DConnect,
    onShowReleaseStages,
    onShowLegal,
    onLoadPoints,
    onOpenBoundaryEditor,
    onOpenBoundaryGis,
    onOpenCadStandards,
    onOpenGpsStakeout,
    onOpenGpsCollect,
    onOpenContouringFromGis,
    onOpenContouringFromTin,
    cadStandardsLoaded = false,
    hideRestrictedFeatures = false,
    onShowClaudeSettings,
    onProjectionSelect,
    currentProjectionEpsg,
    isC3DConnected = false,
    hasApiKey = false,
    geolocationError, 
    currentPosition,
    version,
    jobInfo,
    setJobInfo
}) => {
  const experimentalRoadingEnabled = useExperimentalAgentEnabled(AgentType.ROADING_AGENT);
  const experimentalStormwaterEnabled = useExperimentalAgentEnabled(AgentType.STORMWATER_AGENT);
  const [isJobInfoOpen, setIsJobInfoOpen] = useState(false);
  const [activeInfoAgent, setActiveInfoAgent] = useState<AgentType | null>(null);
  const [showCallUsModal, setShowCallUsModal] = useState(false);
  const [callUsName, setCallUsName] = useState('');
  const [callUsEmail, setCallUsEmail] = useState('');
  const [callUsPhone, setCallUsPhone] = useState('');
  const [callUsMessage, setCallUsMessage] = useState('');
  const [isPlayingAgentResponse, setIsPlayingAgentResponse] = useState(false);
  const [callUsSubmitting, setCallUsSubmitting] = useState(false);
  const [callUsError, setCallUsError] = useState<string | null>(null);
  const [callUsSuccess, setCallUsSuccess] = useState<string | null>(null);
  const [isAnsweringMachineConnected, setIsAnsweringMachineConnected] = useState(false);
  const [isRecordingVoicemail, setIsRecordingVoicemail] = useState(false);
  const [voicemailAudioBlob, setVoicemailAudioBlob] = useState<Blob | null>(null);
  const [voicemailAudioUrl, setVoicemailAudioUrl] = useState<string | null>(null);
  const [voicemailAudioMimeType, setVoicemailAudioMimeType] = useState<string | null>(null);
  const [voicemailDurationSeconds, setVoicemailDurationSeconds] = useState<number | null>(null);
  const [recordingTimeLeftSeconds, setRecordingTimeLeftSeconds] = useState<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const answeringMachineAudioRef = useRef<HTMLAudioElement | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const MAX_RECORDING_DURATION_SECONDS = 60;
  // Generate random pulse delays for each card on mount
  const [pulseDelays] = useState<Map<string, number>>(() => {
    const delays = new Map<string, number>();
    homepageAgentCards.forEach(card => {
      delays.set(card.type, Math.random() * 3); // Random delay between 0-3 seconds
    });
    return delays;
  });
  const [showScrollIndicator, setShowScrollIndicator] = useState(true);
  const [retiredAgents, setRetiredAgentsState] = useState<AgentType[]>([]);
  const [agentOrderHome, setAgentOrderHome] = useState<string[] | null>(() => getGlobalSettings().agentOrderHome ?? null);
  const [agentReleaseStages, setAgentReleaseStages] = useState<Record<string, ReleaseStage>>(() => {
    const raw = getGlobalSettings().agentReleaseStages ?? {};
    const next: Record<string, ReleaseStage> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (isReleaseStage(v)) next[k] = v;
    }
    return next;
  });
  const [cacpManifestAgent, setCacpManifestAgent] = useState<AgentType | null>(null);
  
  // Subscribe to global-settings changes so admin-controlled card order updates live.
  useEffect(() => {
    const unsub = subscribeGlobalSettings((env) => {
      setAgentOrderHome(env.settings.agentOrderHome ?? null);
      const next: Record<string, ReleaseStage> = {};
      for (const [k, v] of Object.entries(env.settings.agentReleaseStages ?? {})) {
        if (isReleaseStage(v)) next[k] = v;
      }
      setAgentReleaseStages(next);
    });
    return unsub;
  }, []);
  
  // Load retired agents on mount and listen for changes
  useEffect(() => {
    setRetiredAgentsState(getRetiredAgents());
    
    const handleRetiredAgentsChange = (e: CustomEvent<AgentType[]>) => {
      setRetiredAgentsState(e.detail);
    };
    
    window.addEventListener('retired-agents-changed', handleRetiredAgentsChange as EventListener);
    return () => {
      window.removeEventListener('retired-agents-changed', handleRetiredAgentsChange as EventListener);
    };
  }, []);
  
  // Removed walking highlight effect - titles now pulse continuously with CSS animation
  
  const handleCardClick = (card: Card) => {
    if (
      (card.type === AgentType.ROADING_AGENT && !experimentalRoadingEnabled) ||
      (card.type === AgentType.STORMWATER_AGENT && !experimentalStormwaterEnabled)
    ) {
      onShowSettings();
      return;
    }
    onSelectAgent(card.type);
  };

  const resetCallUsForm = () => {
    setCallUsName('');
    setCallUsEmail('');
    setCallUsPhone('');
    setCallUsMessage('');
    setCallUsError(null);
    setCallUsSuccess(null);
    setVoicemailAudioBlob(null);
    setVoicemailAudioMimeType(null);
    setVoicemailDurationSeconds(null);
    if (voicemailAudioUrl) {
      URL.revokeObjectURL(voicemailAudioUrl);
      setVoicemailAudioUrl(null);
    }
  };

  // Convert base64 audio to a Blob object URL. WebM/Opus audio does not play
  // reliably from data: URIs in Chrome, so we always feed media elements a
  // Blob URL instead.
  const base64ToObjectUrl = (base64: string, mime: string): string => {
    const byteChars = atob(base64);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i += 1) {
      bytes[i] = byteChars.charCodeAt(i);
    }
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  };

  const stopVoicemailCaptureTracks = () => {
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }
  };

  const stopVoicemailRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    setIsRecordingVoicemail(false);
    setRecordingTimeLeftSeconds(null);
  };

  const startVoicemailRecording = async () => {
    try {
      setCallUsError(null);
      if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) || typeof MediaRecorder === 'undefined') {
        setCallUsError('Voice recording is not supported in this browser.');
        return;
      }

      if (voicemailAudioUrl) {
        URL.revokeObjectURL(voicemailAudioUrl);
        setVoicemailAudioUrl(null);
      }
      setVoicemailAudioBlob(null);
      setVoicemailAudioMimeType(null);
      setVoicemailDurationSeconds(null);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const preferredMimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
      const mimeType = preferredMimeTypes.find((t) => MediaRecorder.isTypeSupported(t));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        setIsRecordingVoicemail(false);
        stopVoicemailCaptureTracks();

        const recordedMimeType = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type: recordedMimeType });
        if (blob.size > 0) {
          const nextUrl = URL.createObjectURL(blob);
          setVoicemailAudioBlob(blob);
          setVoicemailAudioMimeType(recordedMimeType);
          setVoicemailAudioUrl(nextUrl);
          if (recordingStartedAtRef.current) {
            const elapsed = (Date.now() - recordingStartedAtRef.current) / 1000;
            setVoicemailDurationSeconds(Math.round(elapsed * 10) / 10);
          }
        }
      };

      recorder.onerror = () => {
        setCallUsError('Recording failed. Please try again.');
        setIsRecordingVoicemail(false);
        stopVoicemailCaptureTracks();
      };

      mediaRecorderRef.current = recorder;
      recordingStartedAtRef.current = Date.now();
      setRecordingTimeLeftSeconds(MAX_RECORDING_DURATION_SECONDS);
      recorder.start();
      setIsRecordingVoicemail(true);

      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      recordingTimerRef.current = setInterval(() => {
        const elapsed = (Date.now() - (recordingStartedAtRef.current || Date.now())) / 1000;
        const remaining = Math.max(0, MAX_RECORDING_DURATION_SECONDS - elapsed);
        setRecordingTimeLeftSeconds(remaining);

        if (remaining <= 0) {
          stopVoicemailRecording();
        }
      }, 100);
    } catch (err) {
      stopVoicemailCaptureTracks();
      const msg = err instanceof Error ? err.message : 'Unable to start recording';
      setCallUsError(msg);
      setIsRecordingVoicemail(false);
    }
  };

  const stopAnsweringMachineGreeting = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (answeringMachineAudioRef.current) {
      answeringMachineAudioRef.current.pause();
      answeringMachineAudioRef.current = null;
    }
  };

  const playCloudTts = async (text: string, profile: 'agent' | 'phone'): Promise<boolean> => {
    if (!text.trim()) return false;
    try {
      const response = await fetch('/api/voice/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, profile }),
      });
      if (!response.ok) return false;
      const payload = await response.json();
      if (!payload?.ok || !payload?.audioBase64) return false;

      if (answeringMachineAudioRef.current) {
        answeringMachineAudioRef.current.pause();
      }
      const audio = new Audio(`data:${payload.mimeType || 'audio/mpeg'};base64,${payload.audioBase64}`);
      answeringMachineAudioRef.current = audio;
      audio.onplay = () => setIsPlayingAgentResponse(true);
      audio.onended = () => setIsPlayingAgentResponse(false);
      audio.onerror = () => setIsPlayingAgentResponse(false);
      await audio.play();
      return true;
    } catch {
      return false;
    }
  };

  const pickPreferredSpeechVoice = (): SpeechSynthesisVoice | null => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    return (
      voices.find((v) => /^en(-|_)?us/i.test(v.lang) && /(neural|aria|jenny|guy|zira|davis|google|samantha|microsoft)/i.test(v.name)) ||
      voices.find((v) => /^en/i.test(v.lang) && /(neural|aria|jenny|guy|zira|google|samantha|microsoft)/i.test(v.name)) ||
      voices.find((v) => /^en/i.test(v.lang)) ||
      null
    );
  };

  const playAgentResponse = async () => {
    const responses = [
      "Thank you for calling LandSurv.ai. Your message has been recorded and saved.",
      "Thank you. We've received your voicemail. Our team will get back to you soon."
    ];
    const response = responses[Math.floor(Math.random() * responses.length)];
    const cloudPlayed = await playCloudTts(response, 'agent');
    if (cloudPlayed) return;

    const utterance = new SpeechSynthesisUtterance(response);
    utterance.rate = 0.96;
    utterance.pitch = 1.0;
    utterance.volume = 0.95;
    const preferredVoice = pickPreferredSpeechVoice();
    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.onstart = () => setIsPlayingAgentResponse(true);
    utterance.onend = () => setIsPlayingAgentResponse(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const playAnsweringMachineGreeting = async () => {
    const greetingText =
      'Thank you for calling LandSurv.ai. We appreciate your interest. Please leave a message after the tone and our team will review it shortly.';

    const playBrowserGreeting = () => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      const synth = window.speechSynthesis;
      const greeting = new SpeechSynthesisUtterance(greetingText);
      greeting.rate = 0.97;
      greeting.pitch = 0.95;
      greeting.volume = 0.95;
      const preferredVoice = pickPreferredSpeechVoice();
      if (preferredVoice) greeting.voice = preferredVoice;
      synth.cancel();
      synth.speak(greeting);
    };

    let fallbackStarted = false;
    let allowCustomPlayback = true;
    const fallbackTimer = typeof window !== 'undefined'
      ? window.setTimeout(() => {
          if (fallbackStarted) return;
          allowCustomPlayback = false;
          fallbackStarted = true;
          playBrowserGreeting();
        }, 2500)
      : null;

    try {
      const response = await fetch('/api/devops/public/voicemail-greeting', { cache: 'no-store' });
      if (response.ok) {
        const payload = await response.json();
        if (payload?.audioBase64 && allowCustomPlayback) {
          if (answeringMachineAudioRef.current) {
            answeringMachineAudioRef.current.pause();
          }
          // WebM/Opus (what MediaRecorder produces) does not reliably play
          // from a data: URI in Chrome — it plays nothing. Use a Blob URL,
          // which is seekable and plays consistently.
          const mime = payload.mimeType || 'audio/webm';
          const objectUrl = base64ToObjectUrl(payload.audioBase64, mime);
          const audio = new Audio(objectUrl);
          answeringMachineAudioRef.current = audio;
          const revoke = () => {
            try { URL.revokeObjectURL(objectUrl); } catch { /* ignore */ }
          };
          audio.onplay = () => {
            setIsPlayingAgentResponse(true);
            if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
          };
          audio.onended = () => {
            setIsPlayingAgentResponse(false);
            revoke();
          };
          audio.onerror = () => {
            setIsPlayingAgentResponse(false);
            revoke();
            if (!fallbackStarted) {
              fallbackStarted = true;
              playBrowserGreeting();
            }
          };
          await audio.play();
          return;
        }
      }
    } catch {
      // Fall through to synthesized greeting.
    }

    if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
    if (!fallbackStarted) {
      fallbackStarted = true;
      playBrowserGreeting();
    }
  };

  const openCallUsMachine = () => {
    setShowCallUsModal(true);
    setCallUsError(null);
    setCallUsSuccess(null);
    setIsAnsweringMachineConnected(true);
  };

  const closeCallUsMachine = () => {
    stopAnsweringMachineGreeting();
    stopVoicemailRecording();
    stopVoicemailCaptureTracks();
    setShowCallUsModal(false);
    setIsAnsweringMachineConnected(false);
    resetCallUsForm();
  };

  useEffect(() => {
    return () => {
      stopAnsweringMachineGreeting();
      stopVoicemailRecording();
      stopVoicemailCaptureTracks();
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (voicemailAudioUrl) {
        URL.revokeObjectURL(voicemailAudioUrl);
      }
    };
  }, [voicemailAudioUrl]);

  const handleSubmitCallUs = async (e: React.FormEvent) => {
    e.preventDefault();
    setCallUsError(null);
    setCallUsSuccess(null);

    const hasVoicemailAudio = Boolean(voicemailAudioBlob);
    const normalizedName = callUsName.trim();
    const normalizedEmail = callUsEmail.trim().toLowerCase();
    const normalizedPhone = callUsPhone.trim();
    const normalizedMessage = callUsMessage.trim();
    const emailLooksValid = !normalizedEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);

    if (!normalizedMessage && !hasVoicemailAudio) {
      setCallUsError('Please enter a message or record a voicemail.');
      return;
    }
    if (!emailLooksValid) {
      setCallUsError('Please enter a valid email address.');
      return;
    }

    try {
      setCallUsSubmitting(true);
      let recaptchaToken: string | null = null;
      try {
        recaptchaToken = await executeContactRecaptcha();
      } catch (recaptchaError) {
        console.warn('[Contact] reCAPTCHA unavailable; server will enforce it if required', recaptchaError);
      }

      const body = new FormData();
      body.append('name', normalizedName || 'Anonymous Caller');
      if (normalizedEmail) body.append('email', normalizedEmail);
      if (normalizedPhone) body.append('phone', normalizedPhone);
      body.append('message', normalizedMessage || '[Voice message]');
      if (voicemailDurationSeconds && voicemailDurationSeconds > 0) {
        body.append('voicemailDurationSeconds', String(voicemailDurationSeconds));
      }
      if (voicemailAudioBlob) {
        const mime = voicemailAudioMimeType || voicemailAudioBlob.type || 'audio/webm';
        const extension = mime.includes('mp4') ? 'm4a' : 'webm';
        body.append('voicemailAudioMimeType', mime);
        body.append('voicemailAudio', voicemailAudioBlob, `voicemail.${extension}`);
      }

      const headers: HeadersInit = {};
      if (recaptchaToken) {
        headers['x-recaptcha-token'] = recaptchaToken;
      }

      const response = await fetch('/api/contact/call-message', {
        method: 'POST',
        headers,
        body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || 'Failed to submit message');
      }

      // Play agent response
      void playAgentResponse();
      resetCallUsForm();
      setCallUsSuccess('Thanks — your message was sent. We will follow up through the contact details you provided.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to submit message';
      setCallUsError(msg);
    } finally {
      setCallUsSubmitting(false);
    }
  };

    return (
    <div className={`flex flex-col h-full relative aesthetic-grid${isThanksgivingTheme() ? ' thanksgiving-ui' : ''}`}>
      {/* C3D Connect + API Key buttons - now rendered inline above chat bar (see scrollable section) */}
      {onShowC3DConnect && null /* moved inline */}

      {/* Load Session button - now rendered inline above chat bar (see scrollable section) */}

      {/* Settings button - now rendered inline above chat bar (see scrollable section) */}

      {/* Modern seasonal effects: one GPU canvas replaces the old star/snow/firework DOM layers */}
      {isChristmasSeason() && (
        <HolidayEffects theme={isNewYearsTheme() ? 'nye' : 'christmas'} />
      )}

      {/* Halloween bats - black silhouettes that fly in, scale toward the viewer, and vanish */}
      {isHalloweenTheme() && (
        <div
          className="fixed inset-0 pointer-events-none overflow-hidden"
          style={{ zIndex: 100 }}
          aria-hidden="true"
        >
          {BATS.map((bat, i) => (
            <div
              key={`bat-${i}`}
              className="absolute"
              style={{
                left: 0,
                top: `${bat.top}%`,
                animation: `${bat.fromLeft ? 'batFly' : 'batFlyReverse'} ${bat.duration}s ease-in-out 1 both`,
                animationDelay: `${bat.delay}s`,
              }}
            >
              {/* Flip right-to-left bats so they face their direction of travel */}
              <div style={{ transform: bat.fromLeft ? 'none' : 'scaleX(-1)' }}>
                <span
                  style={{
                    display: 'inline-block',
                    fontSize: `${bat.size}px`,
                    lineHeight: 1,
                    animation: `batFlap ${bat.flapDuration}s ease-in-out infinite alternate`,
                    filter: 'brightness(0)',
                  }}
                >
                  🦇
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Autumn harvest - wheat, corn, pumpkins, grass, the survey crew and the sky above.
          Thanksgiving adds the blue daytime sky and sun; Halloween keeps the dark backdrop,
          the full moon and its bats. */}
      {(isThanksgivingTheme() || isHalloweenTheme()) && (
        <ThanksgivingEffects theme={isHalloweenTheme() ? 'halloween' : 'thanksgiving'} />
      )}

      <style>{`
        @keyframes yearPulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.05); }
        }
        @keyframes yearGlow {
          0% { 
            filter: brightness(1) drop-shadow(0 0 20px #fbbf24);
          }
          100% { 
            filter: brightness(1.2) drop-shadow(0 0 40px #f59e0b);
          }
        }
        @keyframes glassesToast {
          0%, 100% { 
            transform: rotate(0deg) scale(1);
          }
          25% { 
            transform: rotate(-8deg) scale(1.1);
          }
          50% { 
            transform: rotate(0deg) scale(1.15);
          }
          75% { 
            transform: rotate(8deg) scale(1.1);
          }
        }
        @keyframes glassToastLeft {
          0%, 100% { 
            transform: rotate(-15deg) scale(1);
          }
          50% { 
            transform: rotate(-25deg) scale(1.15);
          }
        }
        @keyframes yearSparkle {
          0%, 100% { opacity: 0.3; transform: rotate(var(--base-angle, 0deg)) translateY(var(--base-distance, -80px)) scale(0.8); }
          50% { opacity: 1; transform: rotate(var(--base-angle, 0deg)) translateY(var(--base-distance, -80px)) scale(1.2); }
        }
        @keyframes batFly {
          0% {
            transform: translateX(-18vw) translateY(0) scale(0.35) rotate(-6deg);
            opacity: 0;
          }
          12% {
            opacity: 1;
          }
          55% {
            transform: translateX(48vw) translateY(-24px) scale(1.15) rotate(5deg);
            opacity: 1;
          }
          100% {
            transform: translateX(120vw) translateY(8px) scale(1.9) rotate(-4deg);
            opacity: 0;
          }
        }
        @keyframes batFlyReverse {
          0% {
            transform: translateX(120vw) translateY(0) scale(0.35) rotate(6deg);
            opacity: 0;
          }
          12% {
            opacity: 1;
          }
          55% {
            transform: translateX(52vw) translateY(-24px) scale(1.15) rotate(-5deg);
            opacity: 1;
          }
          100% {
            transform: translateX(-18vw) translateY(8px) scale(1.9) rotate(4deg);
            opacity: 0;
          }
        }
        @keyframes batFlap {
          0% {
            transform: scaleY(1) scaleX(1);
          }
          100% {
            transform: scaleY(0.55) scaleX(1.1);
          }
        }
        @keyframes receiverFloat {
          0%, 100% {
            transform: translateY(0) rotate(-8deg);
            filter: drop-shadow(0 0 0 rgba(34, 211, 238, 0));
          }
          50% {
            transform: translateY(-1.5px) rotate(-12deg);
            filter: drop-shadow(0 0 6px rgba(34, 211, 238, 0.28));
          }
        }
        /* Thanksgiving only: with the bright sky behind them, cards use their
           hover fill at rest and rely on the edge highlight to signal hover.
           The chrome buttons share the same fill. */
        body:not(.light-theme) .thanksgiving-ui .thanksgiving-card,
        body:not(.light-theme) .thanksgiving-ui .thanksgiving-chrome button {
          background-color: #1f2937 !important;
        }
        body:not(.light-theme) .thanksgiving-ui .thanksgiving-chrome button {
          background-image: none !important;
        }
      `}</style>

      {/* Fixed Blurred Header - positioned over scrolling content */}
      <div className="absolute top-0 left-0 right-0 z-30 text-center pointer-events-none" style={{
        WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 60%, transparent 100%)',
        maskImage: 'linear-gradient(to bottom, black 0%, black 60%, transparent 100%)'
      }}>
        <div className="backdrop-blur-md bg-gradient-to-b from-gray-900/80 via-gray-900/40 to-gray-900/5 p-4 pt-12 md:p-8 pb-14">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tighter leading-none text-gray-200 text-center mb-4">
              <span className="inline-flex items-center gap-2 align-middle">
              <span>Land<span className="text-cyan-400">Surv</span><span className="text-green-400">.ai</span><span className="relative inline-block"><sup>™</sup>{isNewYearsTheme() && (
                <span 
                  className="ml-3 text-3xl sm:text-4xl font-bold align-middle inline-flex items-center gap-2"
                  style={{
                    verticalAlign: 'middle',
                    position: 'relative',
                    top: '-2px',
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'Orbitron', 'Digital-7', monospace",
                      color: '#fbbf24',
                      textShadow: `
                        0 0 8px #fbbf24,
                        0 0 16px #fbbf24,
                        0 0 24px #f59e0b,
                        0 0 32px #f59e0b
                      `,
                      animation: 'yearGlow 2s ease-in-out infinite alternate',
                    }}
                  >
                    {new Date().getFullYear()}
                  </span>
                  {/* Champagne glasses toasting */}
                  <span className="ml-2 inline-flex items-center" style={{ fontSize: '0.85em', position: 'relative', top: '-1px' }}>
                    <span style={{ 
                      display: 'inline-block',
                      animation: 'glassesToast 3s ease-in-out infinite',
                      filter: 'drop-shadow(0 0 6px #fbbf24)',
                    }}>🥂</span>
                  </span>
                </span>
              )}</span></span>
              <a
                href="https://www.youtube.com/@LandSurvAI"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-red-500 hover:bg-red-500/10 rounded-full transition-colors pointer-events-auto"
                title="LandSurv.ai on YouTube — tutorials & walkthroughs"
                aria-label="Open the LandSurv.ai YouTube channel"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              </a>
              <a
                href="https://www.facebook.com/profile.php?id=61583326114422"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2.5 text-blue-500 hover:bg-blue-500/10 rounded-full transition-all duration-300 hover:scale-105 pointer-events-auto -ml-2"
                title="LandSurv.ai on Facebook"
                aria-label="Open the LandSurv.ai Facebook page"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M13.5 21v-8h2.75l.41-3.12H13.5V7.89c0-.9.25-1.51 1.55-1.51h1.66V3.59A22.23 22.23 0 0 0 14.29 3C11.9 3 10.26 4.46 10.26 7.14v2.74H7.5V13h2.76v8h3.24Z" />
                </svg>
              </a>
              </span>
          </h1>
          <p className="text-cyan-300 light-theme:text-cyan-700 max-w-lg mx-auto font-medium">
            Agentic tools for Surveyors and Engineers
          </p>
        </div>
      </div>

            {/* Scrollable Cards Container - scrolls under the header */}
      <div className="flex-1 overflow-y-auto scrollbar-hide relative z-20 aesthetic-grid" onScroll={() => setShowScrollIndicator(false)}>
        <div className="pt-36 pb-8 px-4 md:px-8">
          {/* Menu bar - scrolls with content */}
          <div className="thanksgiving-chrome w-full max-w-5xl mx-auto mb-2.5 flex flex-wrap items-stretch gap-2">
            {onShowC3DConnect && (
              <button
                onClick={onShowC3DConnect}
                className={`group relative flex-1 min-w-[calc(20%-0.5rem)] py-2.5 px-3 welcome-chrome-btn rounded-lg backdrop-blur-md border border-dashed transition-all duration-300 flex items-center justify-center gap-2 text-sm font-semibold tracking-tight shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] hover:shadow-lg active:translate-y-0 ${
                  isC3DConnected
                    ? 'bg-emerald-950/60 hover:bg-emerald-900/70 border-emerald-500/45 hover:border-emerald-400/70 text-emerald-300'
                    : 'bg-slate-950/75 hover:bg-slate-900/85 border-slate-400/25 hover:border-red-400/50 text-red-400 hover:text-red-300'
                }`}
                type="button"
              >
                <PlugIcon className={`w-[18px] h-[18px] flex-shrink-0 transition-transform duration-200 group-hover:scale-105 ${isC3DConnected ? 'text-emerald-400' : 'text-red-400'}`} />
                <span>C3D</span>
              </button>
            )}
            <button
              onClick={onShowApiKeySettings}
              className={`group relative flex-1 min-w-[calc(20%-0.5rem)] py-2.5 px-3 welcome-chrome-btn rounded-lg backdrop-blur-md border border-dashed transition-all duration-300 flex items-center justify-center gap-2 text-sm font-semibold tracking-tight bg-slate-950/75 hover:bg-slate-900/85 border-slate-400/25 ${hasApiKey ? 'text-emerald-400 hover:border-emerald-400/50 hover:text-emerald-300' : 'text-red-400 hover:border-red-400/50 hover:text-red-300'} shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] hover:shadow-lg active:translate-y-0`}
              type="button"
            >
              <KeyIcon className={`w-[18px] h-[18px] flex-shrink-0 transition-transform duration-200 group-hover:scale-105 ${hasApiKey ? 'text-emerald-400' : 'text-red-400'}`} />
              <span>Key</span>
            </button>
            <button
              onClick={onShowUpgrade}
              className="group flex-1 min-w-[calc(20%-0.5rem)] py-2.5 px-3 welcome-chrome-btn rounded-lg backdrop-blur-md border border-dashed transition-all duration-300 flex items-center justify-center gap-2 text-sm font-semibold tracking-tight bg-slate-950/75 hover:bg-slate-900/85 border-slate-400/25 hover:border-emerald-400/50 text-emerald-400 hover:text-emerald-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] hover:shadow-lg active:translate-y-0"
              type="button"
              title="Purchase service access or hosted compute credits"
            >
              <CurrencyDollarIcon className="w-[18px] h-[18px] text-emerald-400 flex-shrink-0 transition-transform duration-200 group-hover:scale-105" />
              <span>Upgrade</span>
            </button>
            <button
              onClick={openCallUsMachine}
              className="group flex-1 min-w-[calc(20%-0.5rem)] py-2.5 px-3 welcome-chrome-btn rounded-lg backdrop-blur-md border border-dashed transition-all duration-300 flex items-center justify-center gap-2 text-sm font-semibold tracking-tight bg-slate-950/75 hover:bg-slate-900/85 border-slate-400/25 hover:border-cyan-400/50 text-gray-200 hover:text-cyan-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] hover:shadow-lg active:translate-y-0"
              type="button"
            >
              <EnvelopeIcon className="w-[18px] h-[18px] text-cyan-400 flex-shrink-0 transition-transform duration-200 group-hover:scale-105" />
              <span>Contact</span>
            </button>
            <button
              onClick={() => window.dispatchEvent(new Event('landsurv:request-install'))}
              className="group flex-1 min-w-[calc(20%-0.5rem)] py-2.5 px-3 welcome-chrome-btn rounded-lg backdrop-blur-md border border-dashed transition-all duration-300 flex items-center justify-center gap-2 text-sm font-semibold tracking-tight bg-slate-950/75 hover:bg-slate-900/85 border-slate-400/25 hover:border-emerald-400/50 text-gray-200 hover:text-emerald-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] hover:shadow-lg active:translate-y-0"
              type="button"
              title="Optional Install"
              aria-label="Optional Install LandSurv.ai"
            >
              <DownloadIcon className="w-[18px] h-[18px] text-emerald-400 flex-shrink-0 transition-transform duration-200 group-hover:scale-105" />
              <span className="group-hover:hidden">Install</span>
              <span className="hidden group-hover:inline">Optional</span>
            </button>
            <button
              onClick={onLoadSession}
              className="group flex-1 min-w-[calc(20%-0.5rem)] py-2.5 px-3 welcome-chrome-btn rounded-lg backdrop-blur-md border border-dashed transition-all duration-300 flex items-center justify-center gap-2 text-sm font-semibold tracking-tight bg-slate-950/75 hover:bg-slate-900/85 border-slate-400/25 hover:border-blue-400/50 text-gray-200 hover:text-blue-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] hover:shadow-lg active:translate-y-0"
              type="button"
            >
              <ArrowUpTrayIcon className="w-[18px] h-[18px] text-blue-400 flex-shrink-0 transition-transform duration-200 group-hover:scale-105" />
              <span>Load</span>
            </button>
            <button
              onClick={onShowAbout}
              className="group flex-1 min-w-[calc(20%-0.5rem)] py-2.5 px-3 welcome-chrome-btn rounded-lg backdrop-blur-md border border-dashed transition-all duration-300 flex items-center justify-center gap-2 text-sm font-semibold tracking-tight bg-slate-950/75 hover:bg-slate-900/85 border-slate-400/25 hover:border-green-400/50 text-gray-200 hover:text-green-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] hover:shadow-lg active:translate-y-0"
              type="button"
            >
              <InfoIcon className="w-[18px] h-[18px] text-green-400 flex-shrink-0 transition-transform duration-200 group-hover:scale-105" />
              <span>About</span>
            </button>
            <button
              onClick={onShowLegal}
              className="group flex-1 min-w-[calc(20%-0.5rem)] py-2.5 px-3 welcome-chrome-btn rounded-lg backdrop-blur-md border border-dashed transition-all duration-300 flex items-center justify-center gap-2 text-sm font-semibold tracking-tight bg-slate-950/75 hover:bg-slate-900/85 border-slate-400/25 hover:border-amber-400/50 text-gray-200 hover:text-amber-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] hover:shadow-lg active:translate-y-0"
              type="button"
              title="Legal & Compliance — LandSurv.ai is a software tool, not a licensed professional practice"
            >
              <LegalScaleIcon className="w-[18px] h-[18px] text-amber-400 flex-shrink-0 transition-transform duration-200 group-hover:scale-105" />
              <span>Legal</span>
            </button>
            <button
              onClick={onShowDoc}
              className="group flex-1 min-w-[calc(20%-0.5rem)] py-2.5 px-3 welcome-chrome-btn rounded-lg backdrop-blur-md border border-dashed transition-all duration-300 flex items-center justify-center gap-2 text-sm font-semibold tracking-tight bg-slate-950/75 hover:bg-slate-900/85 border-slate-400/25 hover:border-cyan-400/50 text-gray-200 hover:text-cyan-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] hover:shadow-lg active:translate-y-0"
              type="button"
            >
              <DocumentTextIcon className="w-[18px] h-[18px] text-cyan-400 flex-shrink-0 transition-transform duration-200 group-hover:scale-105" />
              <span>.lsvz</span>
            </button>
            <button
              onClick={onShowReleaseLog}
              className="group flex-1 min-w-[calc(20%-0.5rem)] py-2.5 px-3 welcome-chrome-btn rounded-lg backdrop-blur-md border border-dashed transition-all duration-300 flex items-center justify-center gap-2 text-sm font-semibold tracking-tight bg-slate-950/75 hover:bg-slate-900/85 border-slate-400/25 hover:border-purple-400/50 text-gray-200 hover:text-purple-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] hover:shadow-lg active:translate-y-0"
              type="button"
              title="What's New / Release Log"
            >
              <LogClockIcon className="w-[18px] h-[18px] text-purple-400 flex-shrink-0 transition-transform duration-200 group-hover:scale-105" />
              <span>Log</span>
            </button>
          </div>
          {/* Project-context row: equal thirds for Job Info / Set Projection / Settings.
              Duplicated here for quick access to the primary project-level entry points.
              `jobInfo` populated here is shared via context with every agent. */}
          <div className="thanksgiving-chrome w-full max-w-5xl mx-auto mb-3 grid grid-cols-3 gap-2">
            <button
              onClick={() => setIsJobInfoOpen(true)}
              className="group py-2.5 px-3 welcome-chrome-btn rounded-lg backdrop-blur-md border border-dashed transition-all duration-300 flex items-center justify-center gap-2.5 text-sm font-semibold tracking-tight bg-slate-950/75 hover:bg-slate-900/85 border-slate-400/25 hover:border-teal-400/50 text-gray-200 hover:text-teal-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] hover:shadow-lg active:translate-y-0"
              type="button"
              title="Edit shared project info — available to all agents"
            >
              <ClipboardDocumentListIcon className="w-[18px] h-[18px] text-teal-400 flex-shrink-0 transition-transform duration-200 group-hover:scale-105" />
              <span>Job Info</span>
            </button>
            <div className="flex">
              <ProjectionMenuButton currentEpsg={currentProjectionEpsg ?? null} currentPosition={currentPosition} onSelect={onProjectionSelect} />
            </div>
            <button
              onClick={onShowSettings}
              className="group py-2.5 px-3 welcome-chrome-btn rounded-lg backdrop-blur-md border border-dashed transition-all duration-300 flex items-center justify-center gap-2.5 text-sm font-semibold tracking-tight bg-slate-950/75 hover:bg-slate-900/85 border-slate-400/25 hover:border-purple-400/50 text-gray-200 hover:text-purple-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] hover:shadow-lg active:translate-y-0"
              type="button"
            >
              <CogIcon className="w-[18px] h-[18px] text-purple-400 flex-shrink-0 transition-transform duration-200 group-hover:scale-105" />
              <span>Settings</span>
            </button>
          </div>
          {isJobInfoOpen && jobInfo && setJobInfo && (
            <JobInfoDialog
              jobInfo={jobInfo}
              onSave={setJobInfo}
              onClose={() => setIsJobInfoOpen(false)}
            />
          )}
          <div className="w-full max-w-5xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
             {(() => {
               const all = homepageAgentCards;
               // Apply admin-controlled ordering when provided. Known ids in the
               // admin order list come first (in that order); unknown / new cards
               // fall through to the static default order at the end.
               const ordered = (() => {
                 if (!agentOrderHome || agentOrderHome.length === 0) return all;
                 const indexOf = new Map<string, number>();
                 agentOrderHome.forEach((id, i) => indexOf.set(id, i));
                 return [...all].sort((a, b) => {
                   const aIsDefaultAgent = a.type === AgentType.LSVZ_AGENT;
                   const bIsDefaultAgent = b.type === AgentType.LSVZ_AGENT;
                   if (aIsDefaultAgent !== bIsDefaultAgent) return aIsDefaultAgent ? 1 : -1;
                   const ai = indexOf.has(a.type) ? indexOf.get(a.type)! : Number.MAX_SAFE_INTEGER;
                   const bi = indexOf.has(b.type) ? indexOf.get(b.type)! : Number.MAX_SAFE_INTEGER;
                   return ai - bi;
                 });
               })();
               return ordered
               .filter(card => {
                 if (retiredAgents.includes(card.type)) {
                   return false;
                 }
                 if (hideRestrictedFeatures && (card.type === AgentType.DRONE_AGENT || card.type === AgentType.GNSS_AGENT)) {
                   return false;
                 }
                 return true;
               })
               .map(card => {
                  const overrideStage = agentReleaseStages[card.type];
                  const cardWithRelease = isReleaseStage(overrideStage)
                    ? ({ ...card, releaseStage: overrideStage } as Card)
                    : card;
                  return (
                <Card 
                  key={card.type}
                  card={cardWithRelease}
                  onClick={() => handleCardClick(cardWithRelease)}
                  onToolOptionClick={onSelectAgentToolOption ? () => {
                    if (
                      (cardWithRelease.type === AgentType.ROADING_AGENT && !experimentalRoadingEnabled) ||
                      (cardWithRelease.type === AgentType.STORMWATER_AGENT && !experimentalStormwaterEnabled)
                    ) {
                      onShowSettings();
                      return;
                    }
                    onSelectAgentToolOption(cardWithRelease.type);
                  } : undefined}
                  isC3DConnected={isC3DConnected} 
                  onShowReleaseStages={onShowReleaseStages}
                  onInfoClick={agentInfoMap[card.type] ? () => setActiveInfoAgent(card.type) : undefined}
                  pulseDelay={pulseDelays.get(card.type) || 0}
                  onCacpClick={setCacpManifestAgent}
                  onLoadPoints={onLoadPoints}
                  onOpenBoundaryEditor={onOpenBoundaryEditor}
                  onOpenBoundaryGis={onOpenBoundaryGis}
                  onOpenCadStandards={onOpenCadStandards}
                  onOpenGpsStakeout={onOpenGpsStakeout}
                  onOpenGpsCollect={onOpenGpsCollect}
                  onOpenContouringFromGis={onOpenContouringFromGis}
                  onOpenContouringFromTin={onOpenContouringFromTin}
                  cadStandardsLoaded={cadStandardsLoaded}
                />
                  );
                });
             })()}
          </div>
        </div>
        </div>
        <GpsStatus geolocationError={geolocationError} currentPosition={currentPosition} version={version} />
      </div>
      
      {/* CACP Manifest modal — opened by clicking the CACP badge on any agent card */}
      {cacpManifestAgent && (
        <CacpManifestModal agent={cacpManifestAgent} onClose={() => setCacpManifestAgent(null)} />
      )}

      {/* Agent Info SPA modal — replaces subdomain navigation when ⓘ is clicked */}
      {activeInfoAgent && agentInfoMap[activeInfoAgent] && (() => {
        const info = agentInfoMap[activeInfoAgent]!;
        const ContentComponent = info.content;
        return (
          <div
            className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in"
            onClick={() => setActiveInfoAgent(null)}
          >
            <div
              className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col animate-modal-panel-fade-in-down light-theme:bg-white light-theme:border-gray-300"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0 light-theme:border-gray-300">
                <h2 className="text-xl font-bold text-cyan-400">{info.title}</h2>
                <button
                  onClick={() => setActiveInfoAgent(null)}
                  className="p-2 rounded-full hover:bg-gray-700 transition-colors light-theme:hover:bg-gray-200"
                  aria-label="Close"
                >
                  <XMarkIcon className="w-6 h-6 text-gray-400" />
                </button>
              </header>
              <main className="flex-grow p-6 overflow-y-auto text-gray-300 space-y-4 light-theme:text-gray-700">
                <ContentComponent />
              </main>
            </div>
          </div>
        );
      })()}

      {showCallUsModal && (
        <div
          className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={closeCallUsMachine}
        >
          <div
            className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-cyan-500/30 bg-slate-950 p-5 shadow-2xl shadow-cyan-500/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-white">Contact LandSurv.ai</h3>
                <p className="mt-1 text-xs text-slate-400">Send a message, leave an optional voicemail, or choose a direct email channel.</p>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-white"
                onClick={closeCallUsMachine}
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(260px,0.75fr)]">
              <form className="space-y-3" onSubmit={handleSubmitCallUs}>
                {callUsError && (
                  <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{callUsError}</p>
                )}
                {callUsSuccess && (
                  <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">{callUsSuccess}</p>
                )}
                {isPlayingAgentResponse && <p className="text-xs text-amber-300 text-center">Agent responding...</p>}

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-cyan-300">
                    Name
                    <input
                      type="text"
                      value={callUsName}
                      onChange={(e) => setCallUsName(e.target.value)}
                      disabled={callUsSubmitting}
                      className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-normal normal-case tracking-normal text-white placeholder-slate-500 outline-none focus:border-cyan-400"
                      placeholder="Your name"
                    />
                  </label>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-cyan-300">
                    Email
                    <input
                      type="email"
                      value={callUsEmail}
                      onChange={(e) => setCallUsEmail(e.target.value)}
                      disabled={callUsSubmitting}
                      className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-normal normal-case tracking-normal text-white placeholder-slate-500 outline-none focus:border-cyan-400"
                      placeholder="you@example.com"
                    />
                  </label>
                </div>

                <label className="block text-xs font-semibold uppercase tracking-wide text-cyan-300">
                  Phone
                  <input
                    type="tel"
                    value={callUsPhone}
                    onChange={(e) => setCallUsPhone(e.target.value)}
                    disabled={callUsSubmitting}
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-normal normal-case tracking-normal text-white placeholder-slate-500 outline-none focus:border-cyan-400"
                    placeholder="Optional callback number"
                  />
                </label>

                <label className="block text-xs font-semibold uppercase tracking-wide text-cyan-300">
                  Message
                  <textarea
                    value={callUsMessage}
                    onChange={(e) => setCallUsMessage(e.target.value)}
                    disabled={callUsSubmitting}
                    maxLength={2000}
                    rows={5}
                    className="mt-1 w-full resize-y rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-normal normal-case tracking-normal text-white placeholder-slate-500 outline-none focus:border-cyan-400"
                    placeholder="Tell us what you need help with..."
                  />
                  <span className="mt-1 block text-right text-[11px] font-normal normal-case tracking-normal text-slate-500">
                    {callUsMessage.length}/2000
                  </span>
                </label>

                <div className="rounded-md border border-slate-700 bg-slate-900/80 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-300">Optional voicemail attachment</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={playAnsweringMachineGreeting}
                        className="text-xs px-2.5 py-1 rounded-md border border-cyan-700/60 text-cyan-300 hover:bg-cyan-500/10"
                      >
                        Play Greeting
                      </button>
                      {!isRecordingVoicemail ? (
                        <button
                          type="button"
                          onClick={startVoicemailRecording}
                          className="text-xs px-2.5 py-1 rounded-md border border-rose-700/70 text-rose-300 hover:bg-rose-500/10"
                        >
                          Record
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={stopVoicemailRecording}
                          className="text-xs px-2.5 py-1 rounded-md border border-amber-700/70 text-amber-300 hover:bg-amber-500/10"
                        >
                          Stop
                        </button>
                      )}
                    </div>
                  </div>
                  {isAnsweringMachineConnected && (
                    <p className="mt-2 text-[11px] text-slate-500">Your message will be securely routed to our internal team.</p>
                  )}
                  {isRecordingVoicemail && (
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-xs text-rose-300">Recording...</p>
                      <p className="text-xs font-semibold text-amber-300 ml-2">
                        {recordingTimeLeftSeconds !== null ? `${Math.ceil(recordingTimeLeftSeconds)}s left` : ''}
                      </p>
                    </div>
                  )}
                  {voicemailAudioUrl && (
                    <div className="mt-2 space-y-2">
                      <audio controls preload="none" src={voicemailAudioUrl} className="w-full" />
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] text-slate-400">
                          {voicemailDurationSeconds ? `Length: ${voicemailDurationSeconds.toFixed(1)}s` : 'Recorded audio attached'}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            if (voicemailAudioUrl) {
                              URL.revokeObjectURL(voicemailAudioUrl);
                            }
                            setVoicemailAudioUrl(null);
                            setVoicemailAudioBlob(null);
                            setVoicemailAudioMimeType(null);
                            setVoicemailDurationSeconds(null);
                          }}
                          className="text-xs text-slate-300 hover:text-white"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={closeCallUsMachine}
                    className="rounded-md bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={callUsSubmitting || isPlayingAgentResponse}
                    className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:bg-slate-600"
                  >
                    {callUsSubmitting ? 'Sending...' : 'Send Message'}
                  </button>
                </div>
              </form>

              <aside className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
                <h4 className="text-sm font-bold uppercase tracking-wide text-slate-200">Direct email links</h4>
                <p className="mt-1 text-xs text-slate-400">Use the channel that best matches your request.</p>
                <div className="mt-3 space-y-2">
                  {CONTACT_EMAIL_LINKS.map((link) => (
                    <a
                      key={link.email}
                      href={`mailto:${link.email}?subject=${encodeURIComponent(link.subject)}`}
                      className="block rounded-lg border border-slate-700 bg-slate-950/70 p-3 transition hover:border-cyan-500/60 hover:bg-cyan-500/10"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-cyan-200">{link.label}</span>
                        <span className="text-[11px] text-cyan-400">{link.email}</span>
                      </span>
                      <span className="mt-1 block text-xs text-slate-400">{link.description}</span>
                    </a>
                  ))}
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}

      {/* Scroll Indicator - fixed to viewport, centered on card grid */}
      {showScrollIndicator && (
        <div className="fixed bottom-32 z-50 animate-bounce opacity-60 pointer-events-none w-20 h-20 flex items-center justify-center" style={{ left: '50%', marginLeft: '-40px' }}>
          <svg className="w-20 h-20 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      )}
    </div>
  );
};

export default InitialAgentSelection;