import React, { useEffect } from 'react';
import { AgentType } from '../../types';
import { useGlobalSettings } from '../../utils/globalSettings';
import {
  CourthouseIcon,
  DocumentDuplicateIcon,
  DxfAnalyzerIcon,
  GisAgentIcon,
  ScaleIcon,
  PlumbBobIcon,
  CrosshairsIcon,
  CameraIcon,
  LsvzIcon,
  ContourIcon,
  ProfileIcon,
  CivilDrafterIcon,
  SatelliteIcon,
  ARIcon,
  ZoningIcon,
  TitleSearchIcon,
  CadManagerIcon,
} from '../icons';

export const AgentsPageContent: React.FC = () => {
  const { retiredAgents } = useGlobalSettings();
  const agentCatalog = [
    {
      type: AgentType.CIVIL_DRAFTER,
      host: 'civildrafter',
      name: 'Civil Drafter Agent',
      icon: CivilDrafterIcon,
      color: 'purple',
      description: 'AI-assisted linework and drafting workflows.',
      details: 'Interpret drafting intent, apply your firm standards, and prepare consistent CAD-ready linework and annotations.',
    },
    {
      type: AgentType.DEED_READER,
      host: 'deed',
      name: 'Boundary Agent (formerly Deed Reader & Plotter)',
      icon: CourthouseIcon,
      color: 'green',
      description: 'Construct, edit, and plot property boundaries from deeds, CSV, or hand entry.',
      details:
        'Read deed documents, extract boundary descriptions, perform inverse calculations, and plot property lines with complete descriptions. Also handles CSV bearing/distance lists, multi-tract deeds, and hand-keyed traverses via the floating Boundary Editor.',
    },
    {
      type: AgentType.CIVIL_PLAN_EXPERT,
      host: 'plan',
      name: 'Civil Plan Expert Agent',
      icon: DocumentDuplicateIcon,
      color: 'orange',
      description: 'Your civil engineering assistant.',
      details:
        'Analyze civil engineering plans, extract coordinates from drawings, identify design elements, and assist in plan interpretation.',
    },
    {
      type: AgentType.DXF_ANALYZER,
      host: 'dxf',
      name: 'DXF Analyzer Agent',
      icon: DxfAnalyzerIcon,
      color: 'indigo',
      description: 'Transform CAD data into surveying intelligence.',
      details:
        'Parse DXF files, extract coordinates and geometry, identify design elements, and convert CAD data for surveying purposes.',
    },
    {
      type: AgentType.GIS_AGENT,
      host: 'gis',
      name: 'GIS Agent',
      icon: GisAgentIcon,
      color: 'teal',
      description: 'Spatial data analysis and mapping.',
      details:
        'Work with GeoJSON data, perform spatial analysis, create maps, and integrate geographic information seamlessly.',
    },
    {
      type: AgentType.CENTERLINE_STATIONING,
      host: 'station',
      name: 'Stationing & Centerline Agent',
      icon: ScaleIcon,
      color: 'purple',
      description: 'Master alignment design and stationing.',
      details:
        'Analyze centerline files, calculate stations and offsets, perform stationing calculations, and manage alignment data.',
    },
    {
      type: AgentType.POINT_EDITOR,
      host: 'point',
      name: 'Point Editor Agent',
      icon: PlumbBobIcon,
      color: 'yellow',
      description: 'Precise point management and editing.',
      details:
        'Import, edit, and manage survey points, perform coordinate transformations, validate point data, and generate reports.',
    },
    {
      type: AgentType.GPS_STAKEOUT,
      host: 'gps',
      name: 'GPS Stakeout Agent',
      icon: CrosshairsIcon,
      color: 'blue',
      description: 'On-site positioning and stakeout guidance.',
      details:
        'Generate stakeout data, calculate positions and offsets, guide field operations, and integrate with GPS receivers.',
    },
    {
      type: AgentType.CONTOURING_AGENT,
      host: 'contour',
      name: 'Contouring Agent',
      icon: ContourIcon,
      color: 'amber',
      description: 'Elevation analysis and contour mapping.',
      details:
        'Generate contour lines, analyze topography, create elevation maps, and visualize terrain data in real-time.',
    },
    {
      type: AgentType.IMAGE_ANALYZER,
      host: 'image',
      name: 'Image Analyzer Agent',
      icon: CameraIcon,
      color: 'red',
      description: 'Extract data from photos and images.',
      details:
        'Analyze site photos, extract coordinates and measurements, identify features, and interpret visual survey documentation.',
    },
    {
      type: AgentType.PROFILE_AGENT,
      host: 'profile',
      name: 'Profile & Cross Section Agent',
      icon: ProfileIcon,
      color: 'sky',
      description: 'Profile and cross-section generation.',
      details:
        'Generate profile views along alignments, create cross-sections at stations, visualize vertical geometry, and prepare profile drawings.',
    },
    {
      type: AgentType.COGO_AGENT,
      host: 'cogo',
      name: 'COGO Agent',
      icon: LsvzIcon,
      color: 'violet',
      description: 'Coordinate geometry calculations.',
      details:
        'Perform inverse and direct calculations, compute intersections, calculate areas and closures, and solve geometric problems.',
    },
    {
      type: AgentType.GNSS_AGENT,
      host: 'rinex',
      name: 'RINEX Agent',
      icon: SatelliteIcon,
      color: 'lime',
      description: 'High-precision GNSS processing.',
      details: 'Process RINEX observations with multi-constellation support, quality checks, and survey-ready GNSS outputs.',
    },
    {
      type: AgentType.AR_AGENT,
      host: 'ar',
      name: 'AR Visualization Agent',
      icon: ARIcon,
      color: 'rose',
      description: 'Spatial project visualization in augmented reality.',
      details: 'Visualize survey points and project geometry in 3D augmented-reality workflows for field orientation and review.',
    },
    {
      type: AgentType.ZONING_AGENT,
      host: 'zoning',
      name: 'Zoning Agent',
      icon: ZoningIcon,
      color: 'emerald',
      description: 'Property zoning research and analysis.',
      details: 'Find districts, maps, regulations, and zoning context to support project due diligence.',
    },
    {
      type: AgentType.TITLE_SEARCH,
      host: 'title',
      name: 'Title Search Agent',
      icon: TitleSearchIcon,
      color: 'amber',
      description: 'Ownership and title-research support.',
      details: 'Organize title-search research around ownership history, liens, encumbrances, and related property records.',
    },
    {
      type: AgentType.CAD_MANAGER,
      host: 'cadmanager',
      name: 'CAD Manager',
      icon: CadManagerIcon,
      color: 'indigo',
      description: 'Description-key and drafting-standard management.',
      details: 'Build, standardize, and manage CAD layers, field codes, linetypes, symbols, and annotation rules.',
    },
  ];
  const agents = agentCatalog.filter((agent) => !retiredAgents.includes(agent.type));

  const getColorClasses = (color: string) => {
    const colors: { [key: string]: { text: string; bg: string; border: string } } = {
      cyan: {
        text: 'text-cyan-400',
        bg: 'bg-cyan-950/30',
        border: 'border-cyan-900/50',
      },
      green: {
        text: 'text-green-400',
        bg: 'bg-green-950/30',
        border: 'border-green-900/50',
      },
      orange: {
        text: 'text-orange-400',
        bg: 'bg-orange-950/30',
        border: 'border-orange-900/50',
      },
      indigo: {
        text: 'text-indigo-400',
        bg: 'bg-indigo-950/30',
        border: 'border-indigo-900/50',
      },
      teal: {
        text: 'text-teal-400',
        bg: 'bg-teal-950/30',
        border: 'border-teal-900/50',
      },
      purple: {
        text: 'text-purple-400',
        bg: 'bg-purple-950/30',
        border: 'border-purple-900/50',
      },
      yellow: {
        text: 'text-yellow-400',
        bg: 'bg-yellow-950/30',
        border: 'border-yellow-900/50',
      },
      blue: {
        text: 'text-blue-400',
        bg: 'bg-blue-950/30',
        border: 'border-blue-900/50',
      },
      amber: {
        text: 'text-amber-400',
        bg: 'bg-amber-950/30',
        border: 'border-amber-900/50',
      },
      rose: {
        text: 'text-rose-400',
        bg: 'bg-rose-950/30',
        border: 'border-rose-900/50',
      },
      red: {
        text: 'text-red-400',
        bg: 'bg-red-950/30',
        border: 'border-red-900/50',
      },
      sky: {
        text: 'text-sky-400',
        bg: 'bg-sky-950/30',
        border: 'border-sky-900/50',
      },
      violet: {
        text: 'text-violet-400',
        bg: 'bg-violet-950/30',
        border: 'border-violet-900/50',
      },
      lime: {
        text: 'text-lime-400',
        bg: 'bg-lime-950/30',
        border: 'border-lime-900/50',
      },
      slate: {
        text: 'text-slate-400',
        bg: 'bg-slate-950/30',
        border: 'border-slate-900/50',
      },
    };
    return colors[color] || colors.slate;
  };

  // Inject structured data for SEO
  useEffect(() => {
    const agentSchema = {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'LandSurv.ai Agents',
      description: 'Specialized AI agents for surveying and geospatial data analysis',
      url: 'https://landsurv.ai?page=agents',
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: agents.map((agent, index) => ({
          '@type': 'Product',
          position: index + 1,
          name: agent.name,
          description: agent.details,
          brand: { '@type': 'Brand', name: 'LandSurv.ai' },
        })),
      },
    };

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(agentSchema);
    document.head.appendChild(script);

    return () => {
      if (script.parentNode) script.parentNode.removeChild(script);
    };
  }, [agents]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 bg-gray-900/40 backdrop-blur rounded-lg border border-gray-700/30">
        <h1 className="text-4xl font-bold text-cyan-400 mb-2">LandSurv.ai Agents</h1>
        <p className="text-lg text-gray-300">
          Specialized AI agents designed to handle every aspect of surveying and geospatial data analysis.
        </p>
      </div>

      {/* Introduction */}
      <div className="space-y-4 text-gray-300">
        <p>
          LandSurv.ai provides a comprehensive suite of specialized agents, each optimized for different surveying and
          geospatial tasks. From analyzing civil plans to performing complex coordinate-geometry calculations, the available
          agents are ready to assist.
        </p>
        <p>
          Each agent understands surveying terminology and workflows, making it easy to interact using natural language. Simply
          upload your data and ask questions—the agents will provide insights, calculations, and visualizations in real-time.
        </p>
      </div>

      {/* Agents Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {agents.map((agent) => {
          const IconComponent = agent.icon;
          const colors = getColorClasses(agent.color);

          return (
            <div
              key={agent.name}
              className={`p-4 rounded-lg transition-all ${colors.bg} hover:border-opacity-100`}
            >
              <div className="flex gap-3 mb-3">
                <IconComponent className={`w-10 h-10 ${colors.text} flex-shrink-0 mt-1`} />
                <div className="min-w-0">
                  <h3 className={`font-bold text-lg ${colors.text}`}>{agent.name}</h3>
                  <p className="text-sm text-gray-400">{agent.description}</p>
                </div>
              </div>
              <p className="text-sm text-gray-300">{agent.details}</p>
            </div>
          );
        })}
      </div>

      {/* Key Features */}
      <div className="space-y-3 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
        <h2 className="text-xl font-bold text-cyan-400">Key Capabilities</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-gray-300">
          <div className="flex gap-2">
            <span className="text-cyan-400 font-bold">→</span>
            <span>Natural language interaction with specialized AI agents</span>
          </div>
          <div className="flex gap-2">
            <span className="text-cyan-400 font-bold">→</span>
            <span>Real-time data visualization and analysis</span>
          </div>
          <div className="flex gap-2">
            <span className="text-cyan-400 font-bold">→</span>
            <span>Support for multiple data formats including DXF, GeoJSON, images, PDFs, and RINEX</span>
          </div>
          <div className="flex gap-2">
            <span className="text-cyan-400 font-bold">→</span>
            <span>Coordinate geometry and mathematical calculations</span>
          </div>
          <div className="flex gap-2">
            <span className="text-cyan-400 font-bold">→</span>
            <span>Error detection and data validation</span>
          </div>
          <div className="flex gap-2">
            <span className="text-cyan-400 font-bold">→</span>
            <span>Export and reporting capabilities</span>
          </div>
        </div>
      </div>

      {/* Getting Started */}
      <div className="space-y-3 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
        <h2 className="text-xl font-bold text-cyan-400">Getting Started</h2>
        <ol className="space-y-2 text-gray-300 list-decimal list-inside">
          <li>Select an agent from the main interface or visit its dedicated subdomain</li>
          <li>Upload your project data (deed document, CAD file, images, RINEX, and more)</li>
          <li>Ask the agent questions about your data in natural language</li>
          <li>Visualize results on the drawing canvas or export data in various formats</li>
          <li>Use the tools drawer to access agent-specific features and controls</li>
        </ol>
      </div>

      {/* Agent Subdomains */}
      <div className="space-y-3 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
        <h2 className="text-xl font-bold text-cyan-400">Access Agent Subdomains</h2>
        <p className="text-gray-300 mb-3">Available agents with a dedicated subdomain:</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          {agents.filter((agent) => agent.host !== 'zoning' && agent.host !== 'title').map((agent) => (
            <a
              key={agent.type}
              href={`https://${agent.host}.landsurv.ai`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 transition-colors hover:text-cyan-300"
            >
              <span className="text-cyan-300">{agent.host}.</span>landsurv.ai
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};
