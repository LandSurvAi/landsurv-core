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
import { BrainCircuitIcon, CourthouseIcon, RoadIcon, PlumbBobIcon, DocumentDuplicateIcon, DxfAnalyzerIcon, LsvzIcon, CurrencyDollarIcon, CrosshairsIcon, FolderIcon, DocumentTextIcon, ArrowUpTrayIcon, DownloadIcon, ScaleIcon, MapPinIcon, CameraIcon, DroneIcon, ClipboardDocumentListIcon, LogClockIcon, BugAntIcon, CpuChipIcon, GisAgentIcon, ContourIcon, ProfileIcon, SatelliteIcon, ARIcon, ZoningIcon, TitleSearchIcon, PlugIcon, LayersIcon, CadManagerIcon, CivilDrafterIcon, KeyIcon, CogIcon, FloodIcon, HomeIcon, SoilsIcon, SlopeIcon, StandardsComplianceIcon } from './icons.tsx';
import { getRetiredAgents, type HomepageAgentType } from '../utils/retiredAgents.ts';
import { getGlobalSettings, subscribeGlobalSettings } from '../utils/globalSettings.ts';
import PublicConciergeChat from './PublicConciergeChat.tsx';
import { CacpBadge } from './CacpBadge.tsx';
import CacpManifestModal from './CacpManifestModal.tsx';
import { agentRegistry } from '../services/AgentRegistry';
import { projectionStates, projectionZones } from '../utils/projections.ts';
import { executeContactRecaptcha } from '../utils/recaptcha.ts';

// Pre-generate stars to avoid re-rendering animation issues
const generateStars = () => {
  // North Star (Polaris) - the Christmas star, extra bright and prominent
  const northStar = {
    left: 85,
    top: 8,
    size: 22,
    duration: 4,
    delay: 0,
    isBright: true,
    isNorthStar: true,
  };

  // Big Dipper constellation (fixed positions)
  const bigDipper = [
    { left: 15, top: 15, size: 12, duration: 6 + Math.random() * 6, delay: Math.random() * 3, isBright: true, isNorthStar: false }, // Dubhe
    { left: 22, top: 18, size: 11, duration: 6 + Math.random() * 6, delay: Math.random() * 3, isBright: true, isNorthStar: false }, // Merak
    { left: 28, top: 22, size: 10, duration: 6 + Math.random() * 6, delay: Math.random() * 3, isBright: false, isNorthStar: false },
    { left: 32, top: 28, size: 10, duration: 6 + Math.random() * 6, delay: Math.random() * 3, isBright: false, isNorthStar: false },
    { left: 35, top: 35, size: 10, duration: 6 + Math.random() * 6, delay: Math.random() * 3, isBright: false, isNorthStar: false },
    { left: 30, top: 40, size: 9, duration: 6 + Math.random() * 6, delay: Math.random() * 3, isBright: false, isNorthStar: false },
    { left: 25, top: 42, size: 10, duration: 6 + Math.random() * 6, delay: Math.random() * 3, isBright: true, isNorthStar: false }, // Alkaid
  ];

  // Generate random background stars avoiding overlap
  const backgroundStars: typeof bigDipper = [];
  const minDistance = 6; // Minimum distance between stars in %
  const maxAttempts = 100;

  while (backgroundStars.length < 43) {
    let attempts = 0;
    let valid = false;

    while (attempts < maxAttempts && !valid) {
      const left = Math.random() * 100;
      const top = Math.random() * 100;

      // Check distance from all existing stars (including Big Dipper and North Star)
      valid = true;
      for (const star of [northStar, ...bigDipper, ...backgroundStars]) {
        const distance = Math.sqrt((left - star.left) ** 2 + (top - star.top) ** 2);
        if (distance < minDistance) {
          valid = false;
          break;
        }
      }

      if (valid) {
        backgroundStars.push({
          left,
          top,
          size: 3 + Math.random() * 10,
          duration: 6 + Math.random() * 6,
          delay: Math.random() * 3,
          isBright: false,
          isNorthStar: false,
        });
      }
      attempts++;
    }
  }

  return [northStar, ...bigDipper, ...backgroundStars];
};

const STARS = generateStars();

// Pre-generate snowflakes to avoid re-rendering animation issues
const generateSnowflakes = () => {
  return Array.from({ length: 20 }, () => {
    const duration = 8 + Math.random() * 6;
    return {
      left: Math.random() * 100,
      size: 12 + Math.random() * 20.4,
      duration,
      delay: -(Math.random() * duration), // Negative delay for pre-positioning
    };
  });
};

const SNOWFLAKES = generateSnowflakes();

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

// Pre-generate fireworks for NYE - slow digital rain style with varied sizes
const generateFireworks = () => {
  const fireworks = [];
  const colors = [
    { core: '#fbbf24', glow: 'rgba(251, 191, 36, 0.9)' }, // Gold
    { core: '#22d3ee', glow: 'rgba(34, 211, 238, 0.9)' }, // Cyan
    { core: '#a78bfa', glow: 'rgba(167, 139, 250, 0.9)' }, // Purple
    { core: '#f472b6', glow: 'rgba(244, 114, 182, 0.9)' }, // Pink
    { core: '#34d399', glow: 'rgba(52, 211, 153, 0.9)' }, // Emerald
    { core: '#fb7185', glow: 'rgba(251, 113, 133, 0.9)' }, // Rose
    { core: '#38bdf8', glow: 'rgba(56, 189, 248, 0.9)' }, // Sky
    { core: '#facc15', glow: 'rgba(250, 204, 21, 0.9)' }, // Yellow
  ];
  
  // 9 fireworks with orchestrated flow - evenly distributed across screen
  const configs = [
    // Wave 1: Opening (0-5s) - far left and far right
    { left: 8, top: 16, scale: 'large', delayBase: 0 },
    { left: 88, top: 18, scale: 'medium', delayBase: 2.5 },
    // Wave 2: Building (5-12s) - left-center and right-center
    { left: 32, top: 14, scale: 'huge', delayBase: 6 },
    { left: 72, top: 22, scale: 'medium', delayBase: 8 },
    // Wave 3: Climax (12-20s) - center massive, left and right companions
    { left: 50, top: 12, scale: 'massive', delayBase: 13 },
    { left: 18, top: 20, scale: 'huge', delayBase: 15 },
    { left: 85, top: 16, scale: 'large', delayBase: 17 },
    // Wave 4: Afterglow (20-28s) - fill gaps
    { left: 42, top: 18, scale: 'large', delayBase: 21 },
    { left: 62, top: 20, scale: 'medium', delayBase: 24 },
  ];
  
  configs.forEach((cfg, i) => {
    const color = colors[i % colors.length];
    const scaleSettings = {
      medium: { size: 450, particles: 50, duration: 14 },
      large: { size: 650, particles: 70, duration: 16 },
      huge: { size: 850, particles: 90, duration: 18 },
      massive: { size: 1100, particles: 120, duration: 20 },
    };
    const settings = scaleSettings[cfg.scale as keyof typeof scaleSettings];
    
    fireworks.push({
      left: cfg.left + (Math.random() * 8 - 4),
      top: cfg.top + (Math.random() * 6 - 3),
      delay: cfg.delayBase + Math.random() * 1.5,
      duration: settings.duration,
      size: settings.size,
      particleCount: settings.particles,
      scale: cfg.scale,
      color,
    });
  });
  return fireworks;
};

const FIREWORKS = generateFireworks();

// Holiday theme type
export type HolidayTheme = 'christmas' | 'nye' | null;

// Get holiday theme override from localStorage
const getHolidayThemeOverride = (): HolidayTheme | 'auto' => {
  if (typeof window === 'undefined') return 'auto';
  const override = localStorage.getItem('landsurv-holiday-theme');
  if (override === 'christmas' || override === 'nye' || override === 'none') {
    return override === 'none' ? null : override;
  }
  return 'auto';
};

// Set holiday theme override in localStorage
export const setHolidayThemeOverride = (theme: 'auto' | 'christmas' | 'nye' | 'none') => {
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

// Legacy function for backward compatibility
const isChristmasSeason = () => getHolidayTheme() !== null;

// Check specifically for NYE theme
export const isNewYearsTheme = () => getHolidayTheme() === 'nye';

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
  /** When the user picks a state-plane zone from the header Projection dropdown. */
  onProjectionSelect?: (state: string, zoneName: string, epsg: number, proj4def: string) => void;
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
        description: 'Upload a .geojson file to analyze GIS features, query properties, and plot data on the canvas.',
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
        icon: CrosshairsIcon,
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
        icon: HomeIcon,
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
] satisfies readonly AgentCard[];

const Card: React.FC<{ card: Card, onClick: () => void, isC3DConnected?: boolean, onShowReleaseStages?: () => void, onInfoClick?: () => void, pulseDelay?: number, onCacpClick?: (agent: AgentType) => void, onLoadPoints?: () => void, onOpenBoundaryEditor?: () => void, onOpenCadStandards?: () => void, onOpenGpsStakeout?: () => void, onOpenGpsCollect?: () => void, onOpenContouringFromGis?: () => void, onOpenContouringFromTin?: () => void, cadStandardsLoaded?: boolean }> = ({ card, onClick, isC3DConnected = false, onShowReleaseStages, onInfoClick, pulseDelay = 0, onCacpClick, onLoadPoints, onOpenBoundaryEditor, onOpenCadStandards, onOpenGpsStakeout, onOpenGpsCollect, onOpenContouringFromGis, onOpenContouringFromTin, cadStandardsLoaded = false }) => {
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
          className={`relative px-6 pt-6 pb-12 text-left bg-gray-900/50 rounded-lg transition-all duration-300 border-2 focus:outline-none focus:ring-2 flex flex-col items-start h-full light-theme:bg-gray-100/50`}
            style={{
                borderColor: '#374151',
                '--color-start': startColor,
                '--color-end': endColor
            } as React.CSSProperties & { '--color-start': string; '--color-end': string; }}
            onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = startColor;
                e.currentTarget.style.backgroundColor = '#1f2937';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#374151';
                e.currentTarget.style.backgroundColor = 'rgba(17, 24, 39, 0.5)';
            }}
        >
            {/* Info Icon - Opens in-app SPA dialog */}
            {onInfoClick && (
                <div 
                    className="absolute top-1/2 -translate-y-1/2 right-2 group"
                    onClick={(e) => {
                        e.stopPropagation();
                        onInfoClick();
                    }}
                >
                    <div className="flex items-center justify-center w-5 h-5 rounded-full border border-gray-500 text-gray-400 text-xs font-bold cursor-pointer hover:border-white hover:text-white hover:scale-110 transition-all">
                        i
                    </div>
                    <div className="absolute -top-8 right-0 bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        Learn more
                    </div>
                </div>
            )}
            
            {/* C3D Status Indicator */}
            {card.c3dEnabled && (
                <div className="absolute top-2 right-2 group">
                    <div className="relative flex items-center justify-center">
                        <span className={`inline-flex rounded-full h-2.5 w-2.5 ${isC3DConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    </div>
                    <div className="absolute -top-8 right-0 bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        C3D Enabled App
                    </div>
                </div>
            )}
            
            {/* Release Stage Badge */}
            {releaseStage && (
                <div 
                    className="absolute bottom-2 right-2 group"
                    onClick={(e) => {
                        e.stopPropagation();
                        onShowReleaseStages?.();
                    }}
                >
                    <div className={`flex items-center justify-center w-5 h-5 rounded-full border border-white/60 text-[10px] font-bold text-white cursor-pointer hover:scale-110 transition-all ${releaseStage.hoverColor} ${releaseStage.hoverBorder}`}>
                        {releaseStage.short}
                    </div>
                    <div className="absolute -top-8 right-0 bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        {releaseStage.full} - Click for details
                    </div>
                </div>
            )}
            
            <div className="flex items-center gap-3 mb-3">
                <Icon className="w-8 h-8" style={{ color: startColor }} />
                <h3 
                    className="font-bold text-lg title-pulse"
                    style={{
                        '--pulse-color': startColor,
                        '--pulse-delay': `${pulseDelay}s`,
                    } as React.CSSProperties & { '--pulse-color': string; '--pulse-delay': string; }}
                >
                    {card.title}
                </h3>
            </div>
            <p className="text-sm text-gray-400 flex-grow pr-6 light-theme:text-gray-500">{card.description}</p>
            {/* Load Points CTA — instant client-side point upload, no sign-in required. */}
            {card.actionType === 'agent' && card.type === AgentType.POINT_EDITOR && onLoadPoints && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onLoadPoints(); }}
                    title="Upload a point file (.csv / .txt) and view it instantly — no sign-in required"
                    className="shimmer-yellow-cta animate-pulse-yellow-cta relative mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-gray-900 bg-gradient-to-br from-yellow-300 via-yellow-400 to-amber-500 border border-yellow-200/70 hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 focus:outline-none focus:ring-1 focus:ring-yellow-200/70"
                >
                    <ArrowUpTrayIcon className="w-3 h-3" />
                    Load Points
                </button>
            )}
            {/* Boundary Editor CTA — jump straight into manual bearing/distance entry, skipping the deed-paste step. */}
            {card.actionType === 'agent' && card.type === AgentType.DEED_READER && onOpenBoundaryEditor && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpenBoundaryEditor(); }}
                    title="Start a blank boundary and key in bearings & distances by hand — no deed required"
                    className="shimmer-green-cta animate-pulse-green-cta relative mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-white bg-gradient-to-br from-green-500 via-emerald-600 to-green-700 border border-green-400/60 hover:from-green-400 hover:via-emerald-500 hover:to-green-600 focus:outline-none focus:ring-1 focus:ring-green-300/70"
                >
                    <CourthouseIcon className="w-3 h-3" />
                    Boundary Editor
                </button>
            )}
            {/* New Standards CTA — bypass the upload screen and drop straight into the CAD Standards interface. */}
            {card.actionType === 'agent' && card.type === AgentType.CAD_MANAGER && onOpenCadStandards && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpenCadStandards(); }}
                    title="Start a blank CAD standards session and open the editor — skip the upload screen"
                    className="shimmer-indigo-cta animate-pulse-indigo-cta relative mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-white bg-gradient-to-br from-indigo-400 via-indigo-500 to-indigo-700 border border-indigo-300/60 hover:from-indigo-300 hover:via-indigo-400 hover:to-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-200/70"
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
                            className="relative inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-white bg-gradient-to-br from-blue-400 via-blue-500 to-blue-700 border border-blue-300/60 hover:from-blue-300 hover:via-blue-400 hover:to-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-200/70"
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
                            className="relative inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-white bg-gradient-to-br from-blue-400 via-blue-500 to-blue-700 border border-blue-300/60 hover:from-blue-300 hover:via-blue-400 hover:to-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-200/70"
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
                    className="relative mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-white bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-700 border border-emerald-300/60 hover:from-emerald-300 hover:via-emerald-400 hover:to-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-200/70"
                >
                    <ZoningIcon className="w-3 h-3" />
                    Gather Zoning
                </button>
            )}
            {/* COGO Agent — Calc CTA opens agent (same as clicking the card). */}
            {card.actionType === 'agent' && card.type === AgentType.COGO_AGENT && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onClick(); }}
                    title="Open the COGO panel — inverse, intersection, and shrinkwrap (boundary hull) tools"
                    className="relative mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-white bg-gradient-to-br from-violet-400 via-violet-500 to-violet-700 border border-violet-300/60 hover:from-violet-300 hover:via-violet-400 hover:to-violet-600 focus:outline-none focus:ring-1 focus:ring-violet-200/70"
                >
                    <CrosshairsIcon className="w-3 h-3" />
                    Calc
                </button>
            )}
            {/* Flood Zone Agent — Flood Area CTA opens agent (same as clicking the card). */}
            {card.actionType === 'agent' && card.type === AgentType.FLOOD_AGENT && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onClick(); }}
                    title="Download FEMA NFHL flood-hazard linework for your project area"
                    className="relative mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-white bg-gradient-to-br from-cyan-400 via-cyan-500 to-cyan-700 border border-cyan-300/60 hover:from-cyan-300 hover:via-cyan-400 hover:to-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-200/70"
                >
                    <FloodIcon className="w-3 h-3" />
                    Flood Area
                </button>
            )}
            {/* Structures Agent — Overlay Structures CTA opens agent. */}
            {card.actionType === 'agent' && card.type === AgentType.STRUCTURES_AGENT && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onClick(); }}
                    title="Overlay FEMA NSI structures and synthesize building footprints"
                    className="relative mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-white bg-gradient-to-br from-orange-400 via-orange-500 to-amber-700 border border-orange-300/60 hover:from-orange-300 hover:via-orange-400 hover:to-amber-600 focus:outline-none focus:ring-1 focus:ring-orange-200/70"
                >
                    <HomeIcon className="w-3 h-3" />
                    Overlay Structures
                </button>
            )}
            {/* Soils Agent — Overlay Soils CTA opens agent. */}
            {card.actionType === 'agent' && card.type === AgentType.SOILS_AGENT && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onClick(); }}
                    title="Overlay USDA NRCS SSURGO soil survey map-unit polygons"
                    className="relative mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-white bg-gradient-to-br from-stone-400 via-stone-500 to-amber-700 border border-stone-300/60 hover:from-stone-300 hover:via-stone-400 hover:to-amber-600 focus:outline-none focus:ring-1 focus:ring-stone-200/70"
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
                        onClick={(e) => { e.stopPropagation(); onClick(); }}
                        title="Open Contouring Agent and contour from your loaded survey points"
                        className="relative inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-white bg-gradient-to-br from-amber-400 via-amber-500 to-amber-700 border border-amber-300/60 hover:from-amber-300 hover:via-amber-400 hover:to-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-200/70"
                    >
                        <ContourIcon className="w-3 h-3" />
                        From Survey
                    </button>
                    {onOpenContouringFromGis && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onOpenContouringFromGis(); }}
                            title="Open Contouring Agent and pull contours from a public ESRI / GIS service"
                            className="relative inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-white bg-gradient-to-br from-teal-400 via-teal-500 to-teal-700 border border-teal-300/60 hover:from-teal-300 hover:via-teal-400 hover:to-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-200/70"
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
                            className="relative inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-white bg-gradient-to-br from-indigo-400 via-indigo-500 to-indigo-700 border border-indigo-300/60 hover:from-indigo-300 hover:via-indigo-400 hover:to-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-200/70"
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
                    className="shimmer-fuchsia-cta animate-pulse-fuchsia-cta relative mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-white bg-gradient-to-br from-fuchsia-400 via-fuchsia-500 to-pink-600 border border-fuchsia-300/60 hover:from-fuchsia-300 hover:via-fuchsia-400 hover:to-pink-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-200/70"
                >
                    <CivilDrafterIcon className="w-3 h-3" />
                    AI Draw
                </button>
            )}
            {/* Profile Agent New Profile CTA — same effect as clicking the card (view agent, no upload screen). */}
            {card.actionType === 'agent' && card.type === AgentType.PROFILE_AGENT && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onClick(); }}
                    title="Open the Profile & Cross Section workspace"
                    className="shimmer-sky-cta animate-pulse-sky-cta relative mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-white bg-gradient-to-br from-sky-400 via-sky-500 to-blue-600 border border-sky-300/60 hover:from-sky-300 hover:via-sky-400 hover:to-blue-500 focus:outline-none focus:ring-1 focus:ring-sky-200/70"
                >
                    <ProfileIcon className="w-3 h-3" />
                    New Profile
                </button>
            )}
            {/* Bottom-left status pills */}
            {card.actionType === 'agent' && (
              <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1.5">
                {card.type === AgentType.CAD_MANAGER && cadStandardsLoaded && (
                  <span
                    title="Standards Loaded"
                    aria-label="Standards Loaded"
                    className="group inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-cyan-700/25 text-cyan-300 border border-cyan-500/40 light-theme:bg-cyan-100 light-theme:text-cyan-800 light-theme:border-cyan-400 overflow-hidden w-[38px] hover:w-[136px] focus-visible:w-[136px] transition-[width,background-color,color] duration-200 ease-out"
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border border-cyan-300/70 bg-cyan-400/15">
                      <svg className="h-3 w-3 text-cyan-200" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M3.5 8.25 6.5 11 12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wide whitespace-nowrap max-w-0 opacity-0 group-hover:max-w-[92px] group-hover:opacity-100 group-focus-visible:max-w-[92px] group-focus-visible:opacity-100 transition-all duration-200 ease-out">
                      Standards Loaded
                    </span>
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

/**
 * Header "Projection" multi-button. Looks like the other menu-bar buttons,
 * but its label rotates "Set" ↔ "Projection" when no projection is set,
 * and shows the active EPSG when one is. Clicking opens a small dropdown
 * with state → zone selection.
 */
const ProjectionMenuButton: React.FC<{
  currentEpsg?: number | null;
  onSelect?: (state: string, zoneName: string, epsg: number, proj4def: string) => void;
}> = ({ currentEpsg, onSelect }) => {
  const [open, setOpen] = useState(false);
  const [stateCode, setStateCode] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setStateCode(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const label = currentEpsg
    ? `EPSG:${currentEpsg}`
    : null;

  const zones = stateCode ? (projectionZones[stateCode] || []) : [];
  const stateName = stateCode ? (projectionStates.find(s => s.code === stateCode)?.name || stateCode) : '';

  return (
    <div ref={ref} className="relative flex-1 min-w-[calc(20%-0.5rem)]">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full h-full py-2 rounded-lg backdrop-blur-sm border transition-all duration-200 flex items-center justify-center gap-2 text-sm font-semibold bg-gradient-to-b from-gray-800/80 to-gray-900/80 hover:from-gray-700/90 hover:to-gray-800/90 border-white/[0.06] hover:border-white/[0.12] text-gray-300 hover:text-emerald-400 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] hover:shadow-emerald-500/5 hover:-translate-y-px hover:shadow-lg active:translate-y-0 active:shadow-sm"
        type="button"
        title="Select State-Plane Projection (NAD83 / US Survey Feet)"
      >
        {label ? (
          <>
            <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18zM3.6 9h16.8M3.6 15h16.8M12 3a13.5 13.5 0 010 18M12 3a13.5 13.5 0 000 18" />
            </svg>
            <span className="truncate">{label}</span>
          </>
        ) : (
          // Smooth horizontal marquee — duplicate the icon+phrase so the loop is seamless.
          <div className="lsa-marquee-mask flex-1 min-w-0">
            <div className="lsa-marquee">
              {Array.from({ length: 4 }).map((_, i) => (
                <span key={i} className="lsa-marquee-item inline-flex items-center gap-2">
                  <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18zM3.6 9h16.8M3.6 15h16.8M12 3a13.5 13.5 0 010 18M12 3a13.5 13.5 0 000 18" />
                  </svg>
                  <span>Set Projection</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-64 max-h-80 overflow-y-auto rounded-lg bg-gray-900/95 border border-gray-700 shadow-2xl backdrop-blur-md z-50">
          {!stateCode ? (
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
  
  // Christmas music state
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);

  const toggleMusic = () => {
    const audio = audioRef.current;
    if (!audio) return;
    
    if (isMusicPlaying) {
      audio.pause();
      setIsMusicPlaying(false);
    } else {
      audio.volume = 0.3;
      audio.muted = false;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setIsMusicPlaying(true))
          .catch((error) => {
            console.error('Audio playback failed:', error);
            audio.currentTime = 0;
            audio.play().then(() => setIsMusicPlaying(true)).catch(() => {});
          });
      }
    }
  };

  // Removed walking highlight effect - titles now pulse continuously with CSS animation
  
  const handleCardClick = (card: Card) => {
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
      "Thank you. We've received your voicemail. Our team will get back to you soon.",
      "Your message is important to us. Thank you for calling LandSurv.ai."
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
    <div className="flex flex-col h-full relative aesthetic-grid">
      {/* Holiday audio element */}
      {isChristmasSeason() && (
        <audio
          ref={audioRef}
          src={isNewYearsTheme() 
            ? "https://ia600208.us.archive.org/5/items/78_auld-lang-syne_guy-lombardo-and-his-royal-canadians-robert-burns_gbia0020296a/Auld%20Lang%20Syne%20-%20Guy%20Lombardo%20and%20his%20Royal%20Canadians.mp3"
            : "https://dn721608.ca.archive.org/0/items/78_sleigh-bells_gbia0033131b/Sleigh%20Bells.mp3"
          }
          loop
          playsInline
          preload="none"
          style={{ display: 'none' }}
        />
      )}
      
      {/* C3D Connect + API Key buttons - now rendered inline above chat bar (see scrollable section) */}
      {onShowC3DConnect && null /* moved inline */}

      {/* Load Session button - now rendered inline above chat bar (see scrollable section) */}

      {/* Settings button - now rendered inline above chat bar (see scrollable section) */}

      {/* Holiday music toggle button - fixed position top-right (shifts left when present) */}
      {isChristmasSeason() && (
        <button
          onClick={toggleMusic}
          className="fixed top-4 right-44 z-50 p-3 rounded-full bg-gray-800/80 hover:bg-gray-700 transition-colors active:bg-gray-600 text-xl backdrop-blur-sm border border-gray-600"
          aria-label={isMusicPlaying 
            ? (isNewYearsTheme() ? 'Mute New Year music' : 'Mute Christmas music') 
            : (isNewYearsTheme() ? 'Play New Year music' : 'Play Christmas music')
          }
          type="button"
        >
          {isMusicPlaying ? (isNewYearsTheme() ? '🎉' : '🎵') : '🔇'}
        </button>
      )}

      {/* Holiday snowfall background - Christmas only (Dec 1-25), not NYE */}
      {isChristmasSeason() && !isNewYearsTheme() && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          {SNOWFLAKES.map((flake, i) => (
            <div
              key={i}
              className="absolute"
              style={{
                left: `${flake.left}%`,
                top: `-10px`,
                width: `${flake.size}px`,
                height: `${flake.size}px`,
                animation: `snowfall ${flake.duration}s linear infinite`,
                animationDelay: `${flake.delay}s`,
                zIndex: 5,
              }}
            >
              {/* Gradient glow background */}
              <div 
                className="absolute inset-0 rounded-full"
                style={{
                  background: 'radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.4) 40%, rgba(200,220,255,0.2) 70%, transparent 100%)',
                  boxShadow: '0 0 6px 2px rgba(255,255,255,0.3)',
                }}
              />
              {/* Snowflake shape overlay */}
              <div 
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  transform: `rotate(${(i * 30) % 360}deg)`,
                }}
              >
                {/* Vertical line */}
                <div className="absolute bg-white/80" style={{ width: '1px', height: '80%' }} />
                {/* Horizontal line */}
                <div className="absolute bg-white/80" style={{ width: '80%', height: '1px' }} />
                {/* Diagonal lines */}
                <div className="absolute bg-white/60" style={{ width: '1px', height: '60%', transform: 'rotate(45deg)' }} />
                <div className="absolute bg-white/60" style={{ width: '1px', height: '60%', transform: 'rotate(-45deg)' }} />
                {/* Center dot */}
                <div className="absolute bg-white rounded-full" style={{ width: '20%', height: '20%' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Holiday stars - gold for Christmas, colorful fireworks for NYE - twinkle only, no movement */}
      {isChristmasSeason() && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          {STARS.map((star, i) => {
            // NYE firework colors - cycle through vibrant colors
            const nyeColors = [
              { core: '#ff6b6b', glow: 'rgba(255, 107, 107, 0.9)', mid: 'rgba(255, 107, 107, 0.6)' }, // Red
              { core: '#4ecdc4', glow: 'rgba(78, 205, 196, 0.9)', mid: 'rgba(78, 205, 196, 0.6)' }, // Teal
                  { core: '#ffe66d', glow: 'rgba(255, 230, 109, 0.9)', mid: 'rgba(255, 230, 109, 0.6)' }, // Yellow
                  { core: '#ff85a2', glow: 'rgba(255, 133, 162, 0.9)', mid: 'rgba(255, 133, 162, 0.6)' }, // Pink
                  { core: '#a78bfa', glow: 'rgba(167, 139, 250, 0.9)', mid: 'rgba(167, 139, 250, 0.6)' }, // Purple
                  { core: '#67e8f9', glow: 'rgba(103, 232, 249, 0.9)', mid: 'rgba(103, 232, 249, 0.6)' }, // Cyan
                  { core: '#86efac', glow: 'rgba(134, 239, 172, 0.9)', mid: 'rgba(134, 239, 172, 0.6)' }, // Green
                ];
                const nyeColor = nyeColors[i % nyeColors.length];
                const isNYE = isNewYearsTheme();
                
                // For NYE, skip the north star special treatment - render all as regular fireworks
                // For Christmas, north star gets special prominent rendering
                return star.isNorthStar && !isNYE ? (
                  // North Star (Christmas only) - custom CSS star with rays
                  <div
                    key={`star-${i}`}
                    className="absolute"
                    style={{
                      left: `${star.left}%`,
                      top: `${star.top}%`,
                      width: `${star.size}px`,
                      height: `${star.size}px`,
                      animation: `northStarPulse ${star.duration}s ease-in-out infinite`,
                      animationDelay: `${star.delay}s`,
                      zIndex: 10,
                    }}
                  >
                    {/* Central glowing core */}
                    <div 
                      className="absolute rounded-full"
                      style={{
                        width: '12px',
                        height: '12px',
                        left: '50%',
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        background: isNYE 
                          ? `radial-gradient(circle, #fff 0%, ${nyeColor.core} 40%, ${nyeColor.mid} 70%, transparent 100%)`
                          : 'radial-gradient(circle, #fffef0 0%, #fef08a 40%, #facc15 70%, transparent 100%)',
                        boxShadow: isNYE
                          ? `0 0 15px 8px ${nyeColor.glow}, 0 0 30px 15px ${nyeColor.mid}, 0 0 50px 25px ${nyeColor.mid.replace('0.6', '0.3')}`
                          : '0 0 15px 8px rgba(254, 240, 138, 0.9), 0 0 30px 15px rgba(250, 204, 21, 0.6), 0 0 50px 25px rgba(234, 179, 8, 0.3)',
                      }}
                    />
                    {/* Main vertical ray */}
                    <div 
                      className="absolute"
                      style={{
                        width: '3px',
                        height: '80px',
                        left: '50%',
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        background: isNYE
                          ? `linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.1) 20%, ${nyeColor.glow} 45%, #fff 50%, ${nyeColor.glow} 55%, rgba(255,255,255,0.1) 80%, transparent 100%)`
                          : 'linear-gradient(to bottom, transparent 0%, rgba(255,255,240,0.1) 20%, rgba(254,240,138,0.9) 45%, #fffef0 50%, rgba(254,240,138,0.9) 55%, rgba(255,255,240,0.1) 80%, transparent 100%)',
                        animation: 'rayPulse 4s ease-in-out infinite',
                      }}
                    />
                    {/* Main horizontal ray */}
                    <div 
                      className="absolute"
                      style={{
                        width: '80px',
                        height: '3px',
                        left: '50%',
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        background: isNYE
                          ? `linear-gradient(to right, transparent 0%, rgba(255,255,255,0.1) 20%, ${nyeColor.glow} 45%, #fff 50%, ${nyeColor.glow} 55%, rgba(255,255,255,0.1) 80%, transparent 100%)`
                          : 'linear-gradient(to right, transparent 0%, rgba(255,255,240,0.1) 20%, rgba(254,240,138,0.9) 45%, #fffef0 50%, rgba(254,240,138,0.9) 55%, rgba(255,255,240,0.1) 80%, transparent 100%)',
                        animation: 'rayPulse 4s ease-in-out infinite',
                      }}
                    />
                    {/* Diagonal ray 1 */}
                    <div 
                      className="absolute"
                      style={{
                        width: '2px',
                        height: '50px',
                        left: '50%',
                        top: '50%',
                        transform: 'translate(-50%, -50%) rotate(45deg)',
                        background: isNYE
                          ? `linear-gradient(to bottom, transparent 0%, ${nyeColor.mid} 40%, ${nyeColor.core} 50%, ${nyeColor.mid} 60%, transparent 100%)`
                          : 'linear-gradient(to bottom, transparent 0%, rgba(254,240,138,0.6) 40%, #fef9c3 50%, rgba(254,240,138,0.6) 60%, transparent 100%)',
                        animation: 'rayPulse 4s ease-in-out infinite 0.5s',
                      }}
                    />
                    {/* Diagonal ray 2 */}
                    <div 
                      className="absolute"
                      style={{
                        width: '2px',
                        height: '50px',
                        left: '50%',
                        top: '50%',
                        transform: 'translate(-50%, -50%) rotate(-45deg)',
                        background: isNYE
                          ? `linear-gradient(to bottom, transparent 0%, ${nyeColor.mid} 40%, ${nyeColor.core} 50%, ${nyeColor.mid} 60%, transparent 100%)`
                          : 'linear-gradient(to bottom, transparent 0%, rgba(254,240,138,0.6) 40%, #fef9c3 50%, rgba(254,240,138,0.6) 60%, transparent 100%)',
                        animation: 'rayPulse 4s ease-in-out infinite 0.5s',
                      }}
                    />
                  </div>
                ) : (
                  // Regular stars - glow blur with crystalline star shape overlay
                  <div
                    key={`star-${i}`}
                    className="absolute"
                    style={{
                      left: `${star.left}%`,
                      top: `${star.top}%`,
                      width: `${star.size * 2}px`,
                      height: `${star.size * 2}px`,
                      animation: `twinkle ${star.duration}s ease-in-out infinite`,
                      animationDelay: `${star.delay}s`,
                      zIndex: 3,
                    }}
                  >
                    {/* Glow blur background */}
                    <div 
                      className="absolute rounded-full"
                      style={{
                        width: '100%',
                        height: '100%',
                        left: '0',
                        top: '0',
                        background: isNYE
                          ? (star.isBright 
                              ? `radial-gradient(circle, rgba(255, 255, 255, 0.9) 0%, ${nyeColor.glow} 30%, ${nyeColor.mid} 60%, transparent 100%)`
                              : `radial-gradient(circle, rgba(255, 255, 255, 0.8) 0%, ${nyeColor.mid} 40%, transparent 100%)`)
                          : (star.isBright 
                              ? 'radial-gradient(circle, rgba(254, 252, 232, 0.9) 0%, rgba(254, 240, 138, 0.6) 30%, rgba(250, 204, 21, 0.3) 60%, transparent 100%)'
                              : 'radial-gradient(circle, rgba(254, 249, 195, 0.8) 0%, rgba(253, 224, 71, 0.4) 40%, transparent 100%)'),
                        filter: 'blur(1px)',
                      }}
                    />
                    {/* Crystalline star shape overlay */}
                    <div 
                      className="absolute"
                      style={{
                        width: '100%',
                        height: '100%',
                        left: '0',
                        top: '0',
                      }}
                    >
                      {/* Vertical ray */}
                      <div 
                        className="absolute"
                        style={{
                          width: '1px',
                          height: '100%',
                          left: '50%',
                          top: '0',
                          transform: 'translateX(-50%)',
                          background: isNYE
                            ? (star.isBright 
                                ? `linear-gradient(to bottom, transparent 0%, ${nyeColor.glow} 30%, #fff 50%, ${nyeColor.glow} 70%, transparent 100%)`
                                : `linear-gradient(to bottom, transparent 0%, ${nyeColor.mid} 30%, ${nyeColor.core} 50%, ${nyeColor.mid} 70%, transparent 100%)`)
                            : (star.isBright 
                                ? 'linear-gradient(to bottom, transparent 0%, rgba(254, 240, 138, 0.9) 30%, #fffef0 50%, rgba(254, 240, 138, 0.9) 70%, transparent 100%)'
                                : 'linear-gradient(to bottom, transparent 0%, rgba(253, 224, 71, 0.7) 30%, #fef9c3 50%, rgba(253, 224, 71, 0.7) 70%, transparent 100%)'),
                        }}
                      />
                      {/* Horizontal ray */}
                      <div 
                        className="absolute"
                        style={{
                          width: '100%',
                          height: '1px',
                          left: '0',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: isNYE
                            ? (star.isBright 
                                ? `linear-gradient(to right, transparent 0%, ${nyeColor.glow} 30%, #fff 50%, ${nyeColor.glow} 70%, transparent 100%)`
                                : `linear-gradient(to right, transparent 0%, ${nyeColor.mid} 30%, ${nyeColor.core} 50%, ${nyeColor.mid} 70%, transparent 100%)`)
                            : (star.isBright 
                                ? 'linear-gradient(to right, transparent 0%, rgba(254, 240, 138, 0.9) 30%, #fffef0 50%, rgba(254, 240, 138, 0.9) 70%, transparent 100%)'
                                : 'linear-gradient(to right, transparent 0%, rgba(253, 224, 71, 0.7) 30%, #fef9c3 50%, rgba(253, 224, 71, 0.7) 70%, transparent 100%)'),
                        }}
                      />
                      {/* Diagonal ray 1 */}
                      <div 
                        className="absolute"
                        style={{
                          width: '1px',
                          height: '70%',
                          left: '50%',
                          top: '15%',
                          transform: 'translateX(-50%) rotate(45deg)',
                          background: isNYE
                            ? (star.isBright 
                                ? `linear-gradient(to bottom, transparent 0%, ${nyeColor.mid} 30%, ${nyeColor.core} 50%, ${nyeColor.mid} 70%, transparent 100%)`
                                : `linear-gradient(to bottom, transparent 0%, ${nyeColor.mid.replace('0.6', '0.5')} 30%, ${nyeColor.core} 50%, ${nyeColor.mid.replace('0.6', '0.5')} 70%, transparent 100%)`)
                            : (star.isBright 
                                ? 'linear-gradient(to bottom, transparent 0%, rgba(254, 240, 138, 0.7) 30%, #fef9c3 50%, rgba(254, 240, 138, 0.7) 70%, transparent 100%)'
                                : 'linear-gradient(to bottom, transparent 0%, rgba(253, 224, 71, 0.5) 30%, #fef9c3 50%, rgba(253, 224, 71, 0.5) 70%, transparent 100%)'),
                        }}
                      />
                      {/* Diagonal ray 2 */}
                      <div 
                        className="absolute"
                        style={{
                          width: '1px',
                          height: '70%',
                          left: '50%',
                          top: '15%',
                          transform: 'translateX(-50%) rotate(-45deg)',
                          background: isNYE
                            ? (star.isBright 
                                ? `linear-gradient(to bottom, transparent 0%, ${nyeColor.mid} 30%, ${nyeColor.core} 50%, ${nyeColor.mid} 70%, transparent 100%)`
                                : `linear-gradient(to bottom, transparent 0%, ${nyeColor.mid.replace('0.6', '0.5')} 30%, ${nyeColor.core} 50%, ${nyeColor.mid.replace('0.6', '0.5')} 70%, transparent 100%)`)
                            : (star.isBright 
                                ? 'linear-gradient(to bottom, transparent 0%, rgba(254, 240, 138, 0.7) 30%, #fef9c3 50%, rgba(254, 240, 138, 0.7) 70%, transparent 100%)'
                                : 'linear-gradient(to bottom, transparent 0%, rgba(253, 224, 71, 0.5) 30%, #fef9c3 50%, rgba(253, 224, 71, 0.5) 70%, transparent 100%)'),
                        }}
                      />
                      {/* Bright center dot */}
                      <div 
                        className="absolute rounded-full"
                        style={{
                          width: '2px',
                          height: '2px',
                          left: '50%',
                          top: '50%',
                          transform: 'translate(-50%, -50%)',
                          background: isNYE ? '#fff' : '#fffef0',
                          boxShadow: isNYE
                            ? (star.isBright 
                                ? `0 0 3px 1px ${nyeColor.glow}`
                                : `0 0 2px 0px ${nyeColor.mid}`)
                            : (star.isBright 
                                ? '0 0 2px 1px rgba(255, 254, 240, 0.9)'
                                : '0 0 1px 0px rgba(255, 254, 240, 0.7)'),
                        }}
                      />
                    </div>
                  </div>
                );
              })}
        </div>
      )}

      {/* NYE Digital Fireworks - pixelated burst then digital rain */}
      {isNewYearsTheme() && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          {FIREWORKS.map((fw, i) => {
            // Scale multipliers based on explosion size
            const scaleMultiplier = fw.scale === 'massive' ? 3.0 : fw.scale === 'huge' ? 2.4 : fw.scale === 'large' ? 1.8 : 1.3;
            const spreadRange = fw.scale === 'massive' ? 550 : fw.scale === 'huge' ? 440 : fw.scale === 'large' ? 340 : 250;
            const fallRange = fw.scale === 'massive' ? 950 : fw.scale === 'huge' ? 780 : fw.scale === 'large' ? 600 : 450;
            // Flash size should be similar to particles, not much larger
            const flashSize = fw.scale === 'massive' ? 6 : fw.scale === 'huge' ? 5 : fw.scale === 'large' ? 4 : 3;
            const glowSize = fw.scale === 'massive' ? 12 : fw.scale === 'huge' ? 10 : fw.scale === 'large' ? 8 : 6;
            
            return (
              <div
                key={`firework-${i}`}
                className="absolute"
                style={{
                  left: `${fw.left}%`,
                  top: `${fw.top}%`,
                  width: `${fw.size}px`,
                  height: `${fw.size}px`,
                  animation: `fireworkBurst ${fw.duration}s ease-out infinite`,
                  animationDelay: `${fw.delay}s`,
                }}
              >
                {/* Digital rain - diamond/triangle shaped pixels falling */}
                {Array.from({ length: fw.particleCount }).map((_, j) => {
                  // Randomize spread - not just a line but scattered
                  const spreadX = (Math.random() - 0.5) * spreadRange * 2;
                  const fallDelay = Math.random() * 1.2;
                  const pixelSize = (2 + Math.floor(Math.random() * 3)) * scaleMultiplier;
                  const isTriangle = j % 3 === 0;
                  const isDiamond = j % 3 === 1;
                  // Random upward burst height - varied per particle (higher ceiling)
                  const burstHeight = 80 + Math.random() * 160;
                  
                  return (
                    <div
                      key={`pixel-${i}-${j}`}
                      className="absolute"
                      style={{
                        left: '50%',
                        top: '50%',
                        width: 0,
                        height: 0,
                        // Triangle pointing down for rain effect
                        ...(isTriangle ? {
                          borderLeft: `${pixelSize}px solid transparent`,
                          borderRight: `${pixelSize}px solid transparent`,
                          borderTop: `${pixelSize * 1.5}px solid ${fw.color.core}`,
                          filter: `drop-shadow(0 0 ${pixelSize}px rgba(251, 191, 36, 0.9)) drop-shadow(0 0 ${pixelSize * 2}px rgba(251, 191, 36, 0.6))`,
                        } : isDiamond ? {
                          // Diamond shape
                          width: `${pixelSize}px`,
                          height: `${pixelSize}px`,
                          background: fw.color.core,
                          transform: `rotate(45deg)`,
                          boxShadow: `0 0 ${pixelSize * 2}px rgba(251, 191, 36, 0.9), 0 0 ${pixelSize * 4}px rgba(251, 191, 36, 0.6)`,
                        } : {
                          // Small square pixel
                          width: `${pixelSize * 0.8}px`,
                          height: `${pixelSize * 0.8}px`,
                          background: fw.color.core,
                          boxShadow: `0 0 ${pixelSize}px rgba(251, 191, 36, 0.9), 0 0 ${pixelSize * 2}px rgba(251, 191, 36, 0.6)`,
                        }),
                        animation: `digitalRain ${fw.duration}s ease-in infinite`,
                        animationDelay: `${fw.delay + fallDelay}s`,
                        animationFillMode: 'backwards',
                        '--spread-x': `${spreadX}px`,
                        '--burst-height': `-${burstHeight}px`,
                        '--fall-distance': `${fallRange + Math.random() * (fallRange * 0.5)}px`,
                      } as React.CSSProperties}
                    />
                  );
                })}
                {/* Secondary smaller white pixels for sparkle depth */}
                {Array.from({ length: Math.floor(fw.particleCount * 0.6) }).map((_, j) => {
                  const spreadX = (Math.random() - 0.5) * spreadRange * 1.6;
                  const fallDelay = 0.1 + Math.random() * 0.8;
                  const size = 2 * scaleMultiplier;
                  const burstHeight = 60 + Math.random() * 120;
                  return (
                    <div
                      key={`spark-${i}-${j}`}
                      className="absolute"
                      style={{
                        left: '50%',
                        top: '50%',
                        width: 0,
                        height: 0,
                        borderLeft: `${size}px solid transparent`,
                        borderRight: `${size}px solid transparent`,
                        borderTop: `${size * 1.2}px solid #fff`,
                        filter: `drop-shadow(0 0 ${size}px rgba(251, 191, 36, 0.9)) drop-shadow(0 0 ${size * 2}px rgba(251, 191, 36, 0.6))`,
                        animation: `digitalRain ${fw.duration * 0.85}s ease-in infinite`,
                        animationDelay: `${fw.delay + fallDelay}s`,
                        animationFillMode: 'backwards',
                        '--spread-x': `${spreadX}px`,
                        '--burst-height': `-${burstHeight}px`,
                        '--fall-distance': `${fallRange * 0.8 + Math.random() * (fallRange * 0.4)}px`,
                      } as React.CSSProperties}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
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
        @keyframes snowfall {
          0% {
            transform: translateY(-100vh) translateX(0px);
            opacity: 0.8;
          }
          10% {
            opacity: 0.8;
          }
          90% {
            opacity: 0.6;
          }
          100% {
            transform: translateY(100vh) translateX(50px);
            opacity: 0;
          }
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        @keyframes northStarPulse {
          0%, 100% { 
            opacity: 0.9; 
            transform: scale(1);
          }
          50% { 
            opacity: 1; 
            transform: scale(1.15);
          }
        }
        @keyframes rayPulse {
          0%, 100% { 
            opacity: 0.4;
            transform: translate(-50%, -50%) scaleY(0.8);
          }
          50% { 
            opacity: 0.8;
            transform: translate(-50%, -50%) scaleY(1.2);
          }
        }
        @keyframes fireworkBurst {
          0% {
            opacity: 0;
            transform: scale(0);
          }
          5% {
            opacity: 1;
            transform: scale(0.5);
          }
          15% {
            opacity: 1;
            transform: scale(1);
          }
          100% {
            opacity: 0;
            transform: scale(1);
          }
        }
        @keyframes digitalRain {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) translateX(var(--spread-x)) translateY(0);
          }
          6% {
            opacity: 0.9;
            transform: translate(-50%, -50%) translateX(var(--spread-x)) translateY(var(--burst-height));
          }
          15% {
            opacity: 0.85;
            transform: translate(-50%, -50%) translateX(var(--spread-x)) translateY(calc(var(--burst-height) * 0.85));
          }
          35% {
            opacity: 0.7;
            transform: translate(-50%, -50%) translateX(var(--spread-x)) translateY(calc(var(--burst-height) * 0.5));
          }
          70% {
            opacity: 0.4;
            transform: translate(-50%, -50%) translateX(var(--spread-x)) translateY(var(--fall-distance));
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) translateX(var(--spread-x)) translateY(var(--fall-distance));
          }
        }
        @keyframes pixelFlash {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0);
          }
          4% {
            opacity: 0.7;
            transform: translate(-50%, -50%) scale(1.8);
          }
          10% {
            opacity: 0.5;
            transform: translate(-50%, -50%) scale(1.2);
          }
          25% {
            opacity: 0.3;
            transform: translate(-50%, -50%) scale(1);
          }
          50% {
            opacity: 0.15;
            transform: translate(-50%, -50%) scale(0.6);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0);
          }
        }
        @keyframes particleBurst {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) rotate(var(--angle)) translateY(0);
          }
          15% {
            opacity: 1;
            transform: translate(-50%, -50%) rotate(var(--angle)) translateY(0);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) rotate(var(--angle)) translateY(calc(var(--distance) * -1));
          }
        }
        @keyframes sparkBurst {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) rotate(var(--angle)) translateY(0);
          }
          20% {
            opacity: 1;
            transform: translate(-50%, -50%) rotate(var(--angle)) translateY(0);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) rotate(var(--angle)) translateY(calc(var(--distance) * -1.5));
          }
        }
        @keyframes centerFlash {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0);
          }
          10% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1.5);
          }
          30% {
            opacity: 0.8;
            transform: translate(-50%, -50%) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.5);
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
      `}</style>

      {/* Fixed Blurred Header - positioned over scrolling content */}
      <div className="absolute top-0 left-0 right-0 z-30 text-center pointer-events-none" style={{
        WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 60%, transparent 100%)',
        maskImage: 'linear-gradient(to bottom, black 0%, black 60%, transparent 100%)'
      }}>
        <div className="backdrop-blur-md bg-gradient-to-b from-gray-900/80 via-gray-900/40 to-gray-900/5 p-4 pt-12 md:p-8 pb-24">
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
              )}{isChristmasSeason() && !isNewYearsTheme() && (
                <div className="absolute" style={{ top: '-28px', left: '3px', width: '45px', height: '34px' }}>
                  {/* Santa hat base - triangle shape (Christmas only, not NYE) */}
                  <div className="absolute" style={{
                    width: '0',
                    height: '0',
                    borderLeft: '14px solid transparent',
                    borderRight: '14px solid transparent',
                    borderBottom: '20px solid #dc2626',
                    left: '0',
                    top: '6px',
                    transform: 'rotate(-5deg)',
                  }} />
                  {/* Droopy part of hat curving right */}
                  <div className="absolute" style={{
                    width: '24px',
                    height: '14px',
                    background: '#dc2626',
                    left: '10px',
                    top: '2px',
                    borderRadius: '0 0 16px 4px',
                    transform: 'rotate(25deg)',
                  }} />
                  {/* Hat brim (white fur) */}
                  <div className="absolute rounded-sm" style={{
                    width: '32px',
                    height: '6px',
                    background: 'linear-gradient(to bottom, #ffffff, #e5e5e5)',
                    left: '-2px',
                    top: '24px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                    borderRadius: '2px',
                  }} />
                  {/* Pom-pom at droopy end */}
                  <div className="absolute rounded-full" style={{
                    width: '9px',
                    height: '9px',
                    background: 'radial-gradient(circle at 30% 30%, #ffffff, #e5e5e5)',
                    left: '30px',
                    top: '6px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  }} />
                </div>
              )}</span></span>
              <PublicConciergeChat compact />
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
          <p className="text-gray-300 max-w-lg mx-auto">
            The AI-native toolkit for land surveyors and civil engineers.
          </p>
          <p className="mt-3 max-w-2xl mx-auto leading-snug">
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-gray-900/60 border border-gray-700/70 backdrop-blur-sm text-xs sm:text-sm font-medium text-cyan-300 light-theme:bg-white/70 light-theme:border-gray-300 light-theme:text-cyan-700">
              Agentic CAD built from the ground up, with you in mind.
            </span>
          </p>
        </div>
      </div>

            {/* Scrollable Cards Container - scrolls under the header */}
      <div className="flex-1 overflow-y-auto scrollbar-hide relative z-20 aesthetic-grid" onScroll={() => setShowScrollIndicator(false)}>
        <div className="pt-48 pb-8 px-4 md:px-8">
          {/* Menu bar - scrolls with content */}
          <div className="w-full max-w-5xl mx-auto mb-3 flex flex-wrap items-stretch gap-2">
            {onShowC3DConnect && (
              <button
                onClick={onShowC3DConnect}
                className={`flex-1 min-w-[calc(20%-0.5rem)] py-2 rounded-lg backdrop-blur-sm border transition-all duration-200 flex items-center justify-center gap-2 text-sm font-semibold shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] hover:-translate-y-px hover:shadow-lg active:translate-y-0 active:shadow-sm ${
                  isC3DConnected
                    ? 'bg-gradient-to-b from-green-900/60 to-green-950/60 hover:from-green-800/70 hover:to-green-900/70 border-green-500/40 hover:border-green-400/60 text-green-400 hover:shadow-green-500/10'
                    : 'bg-gradient-to-b from-gray-800/80 to-gray-900/80 hover:from-gray-700/90 hover:to-gray-800/90 border-white/[0.06] hover:border-white/[0.12] text-gray-300 hover:text-cyan-400 hover:shadow-cyan-500/5'
                }`}
                type="button"
              >
                <div className="relative flex-shrink-0">
                  <PlugIcon className={`w-4 h-4 ${isC3DConnected ? 'text-green-400' : 'text-gray-400'}`} />
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isC3DConnected ? 'bg-green-400' : 'bg-red-400'}`}></span>
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${isC3DConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  </span>
                </div>
                C3D
              </button>
            )}
            <button
              onClick={onShowApiKeySettings}
              className="flex-1 min-w-[calc(20%-0.5rem)] py-2 rounded-lg backdrop-blur-sm border transition-all duration-200 flex items-center justify-center gap-2 text-sm font-semibold bg-gradient-to-b from-gray-800/80 to-gray-900/80 hover:from-gray-700/90 hover:to-gray-800/90 border-white/[0.06] hover:border-white/[0.12] text-gray-300 hover:text-amber-400 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] hover:shadow-amber-500/5 hover:-translate-y-px hover:shadow-lg active:translate-y-0 active:shadow-sm"
              type="button"
            >
              <div className="relative flex-shrink-0">
                <KeyIcon className="w-4 h-4 text-amber-400" />
                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${hasApiKey ? 'bg-green-400' : 'bg-red-400'}`}></span>
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${hasApiKey ? 'bg-green-500' : 'bg-red-500'}`}></span>
                </span>
              </div>
              Key
            </button>
            <button
              onClick={onShowUpgrade}
              className="flex-1 min-w-[calc(20%-0.5rem)] py-2 rounded-lg backdrop-blur-sm border transition-all duration-200 flex items-center justify-center gap-1.5 text-sm font-semibold bg-gradient-to-b from-gray-800/80 to-gray-900/80 hover:from-gray-700/90 hover:to-gray-800/90 border-white/[0.06] hover:border-emerald-500/40 text-emerald-400 hover:text-emerald-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] hover:shadow-emerald-500/10 hover:-translate-y-px hover:shadow-lg active:translate-y-0 active:shadow-sm"
              type="button"
              title="Purchase service access or hosted compute credits"
            >
              <svg className="w-5 h-5 text-emerald-400 hover:text-emerald-300 transition-colors flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="2" x2="12" y2="22" />
                <path d="M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              <span>Upgrade</span>
            </button>
            <button
              onClick={openCallUsMachine}
              className="flex-1 min-w-[calc(20%-0.5rem)] py-2 rounded-lg backdrop-blur-sm border transition-all duration-200 flex items-center justify-center gap-2 text-sm font-semibold bg-gradient-to-b from-gray-800/80 to-gray-900/80 hover:from-gray-700/90 hover:to-gray-800/90 border-white/[0.06] hover:border-white/[0.12] text-gray-300 hover:text-cyan-400 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] hover:shadow-cyan-500/5 hover:-translate-y-px hover:shadow-lg active:translate-y-0 active:shadow-sm"
              type="button"
            >
              <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25H4.5a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5H4.5a2.25 2.25 0 00-2.25 2.25m19.5 0l-9.75 6.75L2.25 6.75" /></svg>
              Contact
            </button>
            <button
              onClick={() => window.dispatchEvent(new Event('landsurv:request-install'))}
              className="group flex-1 min-w-[calc(20%-0.5rem)] py-2 rounded-lg backdrop-blur-sm border transition-all duration-200 flex items-center justify-center gap-2 text-sm font-semibold bg-gradient-to-b from-gray-800/80 to-gray-900/80 hover:from-gray-700/90 hover:to-gray-800/90 border-white/[0.06] hover:border-emerald-400/40 text-gray-300 hover:text-emerald-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] hover:shadow-emerald-500/10 hover:-translate-y-px hover:shadow-lg active:translate-y-0 active:shadow-sm"
              type="button"
              title="Optional Install"
              aria-label="Optional Install LandSurv.ai"
            >
              <DownloadIcon className="w-4 h-4 text-emerald-400" />
              <span className="group-hover:hidden">Install</span>
              <span className="hidden group-hover:inline">Optional</span>
            </button>
            <button
              onClick={onLoadSession}
              className="flex-1 min-w-[calc(20%-0.5rem)] py-2 rounded-lg backdrop-blur-sm border transition-all duration-200 flex items-center justify-center gap-2 text-sm font-semibold bg-gradient-to-b from-gray-800/80 to-gray-900/80 hover:from-gray-700/90 hover:to-gray-800/90 border-white/[0.06] hover:border-white/[0.12] text-gray-300 hover:text-blue-400 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] hover:shadow-blue-500/5 hover:-translate-y-px hover:shadow-lg active:translate-y-0 active:shadow-sm"
              type="button"
            >
              <ArrowUpTrayIcon className="w-4 h-4 text-blue-400" />
              Load
            </button>
            <button
              onClick={onShowAbout}
              className="flex-1 min-w-[calc(20%-0.5rem)] py-2 rounded-lg backdrop-blur-sm border transition-all duration-200 flex items-center justify-center gap-2 text-sm font-semibold bg-gradient-to-b from-gray-800/80 to-gray-900/80 hover:from-gray-700/90 hover:to-gray-800/90 border-white/[0.06] hover:border-white/[0.12] text-gray-300 hover:text-green-400 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] hover:shadow-green-500/5 hover:-translate-y-px hover:shadow-lg active:translate-y-0 active:shadow-sm"
              type="button"
            >
              <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
              About
            </button>
            <button
              onClick={onShowLegal}
              className="flex-1 min-w-[calc(20%-0.5rem)] py-2 rounded-lg backdrop-blur-sm border transition-all duration-200 flex items-center justify-center gap-2 text-sm font-semibold bg-gradient-to-b from-gray-800/80 to-gray-900/80 hover:from-gray-700/90 hover:to-gray-800/90 border-white/[0.06] hover:border-white/[0.12] text-gray-300 hover:text-amber-400 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] hover:shadow-amber-500/5 hover:-translate-y-px hover:shadow-lg active:translate-y-0 active:shadow-sm"
              type="button"
              title="Legal & Compliance — LandSurv.ai is a software tool, not a licensed professional practice"
            >
              <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>
              Legal
            </button>
            <button
              onClick={onShowDoc}
              className="flex-1 min-w-[calc(20%-0.5rem)] py-2 rounded-lg backdrop-blur-sm border transition-all duration-200 flex items-center justify-center gap-2 text-sm font-semibold bg-gradient-to-b from-gray-800/80 to-gray-900/80 hover:from-gray-700/90 hover:to-gray-800/90 border-white/[0.06] hover:border-white/[0.12] text-gray-300 hover:text-cyan-400 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] hover:shadow-cyan-500/5 hover:-translate-y-px hover:shadow-lg active:translate-y-0 active:shadow-sm"
              type="button"
            >
              <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
              .lsvz
            </button>
            <button
              onClick={onShowReleaseLog}
              className="flex-1 min-w-[calc(20%-0.5rem)] py-2 rounded-lg backdrop-blur-sm border transition-all duration-200 flex items-center justify-center gap-2 text-sm font-semibold bg-gradient-to-b from-gray-800/80 to-gray-900/80 hover:from-gray-700/90 hover:to-gray-800/90 border-white/[0.06] hover:border-white/[0.12] text-gray-300 hover:text-purple-400 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] hover:shadow-purple-500/5 hover:-translate-y-px hover:shadow-lg active:translate-y-0 active:shadow-sm"
              type="button"
              title="What's New / Release Log"
            >
              <LogClockIcon className="w-4 h-4 text-purple-400" />
              Log
            </button>
          </div>
          {/* Project-context row: equal thirds for Job Info / Set Projection / Settings.
              Duplicated here for quick access to the primary project-level entry points.
              `jobInfo` populated here is shared via context with every agent. */}
          <div className="w-full max-w-5xl mx-auto mb-3 grid grid-cols-3 gap-2">
            <button
              onClick={() => setIsJobInfoOpen(true)}
              className="py-3 rounded-lg backdrop-blur-sm border transition-all duration-200 flex items-center justify-center gap-2 text-sm font-semibold bg-gradient-to-b from-gray-800/80 to-gray-900/80 hover:from-gray-700/90 hover:to-gray-800/90 border-white/[0.06] hover:border-white/[0.12] text-gray-300 hover:text-teal-400 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] hover:shadow-teal-500/5 hover:-translate-y-px hover:shadow-lg active:translate-y-0 active:shadow-sm"
              type="button"
              title="Edit shared project info — available to all agents"
            >
              <ClipboardDocumentListIcon className="w-4 h-4 text-teal-400" />
              Job Info
            </button>
            <div className="flex">
              <ProjectionMenuButton currentEpsg={currentProjectionEpsg ?? null} onSelect={onProjectionSelect} />
            </div>
            <button
              onClick={onShowSettings}
              className="py-3 rounded-lg backdrop-blur-sm border transition-all duration-200 flex items-center justify-center gap-2 text-sm font-semibold bg-gradient-to-b from-gray-800/80 to-gray-900/80 hover:from-gray-700/90 hover:to-gray-800/90 border-white/[0.06] hover:border-white/[0.12] text-gray-300 hover:text-purple-400 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] hover:shadow-purple-500/5 hover:-translate-y-px hover:shadow-lg active:translate-y-0 active:shadow-sm"
              type="button"
            >
              <CogIcon className="w-4 h-4 text-purple-400" />
              Settings
            </button>
          </div>
          {/* Public LSVZ Lite concierge chat — now rendered as a compact pulsing
              bulb next to the LandSurv.ai logo (see header above). The full
              chat surfaces in a floating dialog on click. */}
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
                  isC3DConnected={isC3DConnected} 
                  onShowReleaseStages={onShowReleaseStages}
                  onInfoClick={agentInfoMap[card.type] ? () => setActiveInfoAgent(card.type) : undefined}
                  pulseDelay={pulseDelays.get(card.type) || 0}
                  onCacpClick={setCacpManifestAgent}
                  onLoadPoints={onLoadPoints}
                  onOpenBoundaryEditor={onOpenBoundaryEditor}
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
      
      {/* Large Christmas trees at bottom left and right (Christmas only, not NYE) */}
      {isChristmasSeason() && !isNewYearsTheme() && (
        <>
          <div className="fixed bottom-0 left-0 opacity-50 pointer-events-none text-9xl z-0">🎄</div>
          <div className="fixed bottom-0 right-0 opacity-50 pointer-events-none text-9xl z-0">🎄</div>
        </>
      )}

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