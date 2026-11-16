import React, { useState } from 'react';
import { AgentType } from '../types.ts';
import {
  XMarkIcon,
  BrainCircuitIcon,
  CourthouseIcon,
  PlumbBobIcon,
  DocumentDuplicateIcon,
  DxfAnalyzerIcon,
  LsvzIcon,
  CrosshairsIcon,
  FolderIcon,
  DocumentTextIcon,
  CameraIcon,
  ScaleIcon,
  MapIcon,
  CutSheetIcon,
  BookOpenIcon,
  QuestionMarkCircleIcon,
  InfoIcon,
  ExclamationTriangleIcon,
  EnvelopeIcon,
  BugAntIcon,
  CpuChipIcon,
  ClipboardDocumentListIcon,
} from './icons.tsx';

interface HelpModalProps {
  onClose: () => void;
  activeAgent: AgentType;
  onShowAbout?: () => void;
  onShowForwardThinking?: () => void;
  onShowTech?: () => void;
  onShowDisclaimer?: () => void;
  onShowErrorConsole?: () => void;
  onShowReleaseLog?: () => void;
  onShowLsvzFormat?: () => void;
}

interface AgentCardInfo {
  type: AgentType;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  title: string;
  description: string;
  color: string;
}

const coreAgents: AgentCardInfo[] = [
  {
    type: AgentType.RAW_CRAWLER,
    icon: BrainCircuitIcon,
    title: 'RAW Crawler',
    description: 'Reads survey .RAW files, checks calculations and helps visualize field observations.',
    color: 'text-cyan-400',
  },
  {
    type: AgentType.DEED_READER,
    icon: CourthouseIcon,
    title: 'Boundary Agent',
    description: 'Builds and edits boundaries from deeds, scanned PDFs, CSV bearing/distance lists, GIS data or hand entry.',
    color: 'text-green-400',
  },
  {
    type: AgentType.CIVIL_PLAN_EXPERT,
    icon: DocumentDuplicateIcon,
    title: 'Civil Plan Expert',
    description: 'Extracts geometry, dimensions and notes from multi-page civil engineering plans.',
    color: 'text-orange-400',
  },
  {
    type: AgentType.CIVIL_DRAFTER,
    icon: DocumentDuplicateIcon,
    title: 'Civil Drafter',
    description: 'Turns project context and your CAD standards into editable linework and drafting detail.',
    color: 'text-amber-400',
  },
  {
    type: AgentType.DXF_ANALYZER,
    icon: DxfAnalyzerIcon,
    title: 'DXF Agent',
    description: 'Imports, inspects and explains CAD geometry from .dxf files.',
    color: 'text-indigo-400',
  },
  {
    type: AgentType.CAD_MANAGER,
    icon: CutSheetIcon,
    title: 'CAD Manager',
    description: 'Maintains standards, layers, linetypes, annotation styles and symbols, and runs compliance checks.',
    color: 'text-emerald-400',
  },
  {
    type: AgentType.CENTERLINE_STATIONING,
    icon: ScaleIcon,
    title: 'Stationing & Centerline',
    description: 'Manages centerline geometry and performs station, offset and curve calculations.',
    color: 'text-purple-400',
  },
  {
    type: AgentType.POINT_EDITOR,
    icon: PlumbBobIcon,
    title: 'Point Editor',
    description: 'Manages, filters and calculates project points, with COGO and stakeout tools.',
    color: 'text-yellow-400',
  },
  {
    type: AgentType.GIS_AGENT,
    icon: MapIcon,
    title: 'GIS Agent',
    description: 'Loads parcels, zoning, flood, soils, roads and other GIS layers around the project area.',
    color: 'text-cyan-300',
  },
  {
    type: AgentType.GNSS_AGENT,
    icon: CrosshairsIcon,
    title: 'GNSS Processor',
    description: 'Post-processes RINEX/GNSS observations into adjusted project coordinates.',
    color: 'text-blue-400',
  },
  {
    type: AgentType.CONTOURING_AGENT,
    icon: MapIcon,
    title: 'Contouring & Surfaces',
    description: 'Generates contours, contour labels and TIN surfaces from point data.',
    color: 'text-teal-300',
  },
  {
    type: AgentType.PROFILE_AGENT,
    icon: ScaleIcon,
    title: 'Profile & Roading',
    description: 'Builds centerline profiles and works with vertical geometry and road tools.',
    color: 'text-violet-300',
  },
  {
    type: AgentType.GPS_STAKEOUT,
    icon: CrosshairsIcon,
    title: 'GPS Rover',
    description: 'Uses the device GPS for point collection, navigation and stakeout.',
    color: 'text-sky-400',
  },
  {
    type: AgentType.LSVZ_AGENT,
    icon: LsvzIcon,
    title: 'LSAI Agent',
    description: 'Coordinates the workspace, answers project questions and routes work to the right specialist.',
    color: 'text-slate-300',
  },
];

const specialistAgents: AgentCardInfo[] = [
  {
    type: AgentType.ZONING_AGENT,
    icon: CourthouseIcon,
    title: 'Zoning Agent',
    description: 'Researches zoning and land-use context.',
    color: 'text-amber-300',
  },
  {
    type: AgentType.TITLE_SEARCH,
    icon: DocumentTextIcon,
    title: 'Title Search',
    description: 'Finds title and parcel records for due diligence.',
    color: 'text-indigo-300',
  },
  {
    type: AgentType.FLOOD_AGENT,
    icon: ExclamationTriangleIcon,
    title: 'Flood & Soils',
    description: 'Fetches FEMA flood zones and SSURGO soils.',
    color: 'text-sky-300',
  },
  {
    type: AgentType.STORMWATER_AGENT,
    icon: MapIcon,
    title: 'Stormwater',
    description: 'Runs quick stormwater checks and reports.',
    color: 'text-cyan-300',
  },
  {
    type: AgentType.DIRT_VOLUME_AGENT,
    icon: ScaleIcon,
    title: 'Dirt Volume',
    description: 'Computes cut/fill and dirt-volume summaries.',
    color: 'text-amber-300',
  },
  {
    type: AgentType.REDLINE_AGENT,
    icon: ExclamationTriangleIcon,
    title: 'Redline Review',
    description: 'Tracks redline items against the drawing.',
    color: 'text-rose-300',
  },
  {
    type: AgentType.AR_AGENT,
    icon: CameraIcon,
    title: 'AR & Drone',
    description: 'Field capture, AR stakeout and drone workflows.',
    color: 'text-blue-300',
  },
  {
    type: AgentType.IMAGE_ANALYZER,
    icon: CameraIcon,
    title: 'Image Analyzer',
    description: 'Reads site photos and ties observations to points.',
    color: 'text-red-300',
  },
  {
    type: AgentType.FILE_MANAGER,
    icon: FolderIcon,
    title: 'File Manager',
    description: 'Shows every file in the current project.',
    color: 'text-slate-300',
  },
  {
    type: AgentType.TEXT_EDITOR,
    icon: DocumentTextIcon,
    title: 'Text Editor',
    description: 'Edits deeds, notes and markdown with AI help.',
    color: 'text-gray-300',
  },
  {
    type: AgentType.FIELD_BOOK,
    icon: BookOpenIcon,
    title: 'Field Book',
    description: 'Session audit log plus space for manual notes.',
    color: 'text-slate-300',
  },
];

const HelpModal: React.FC<HelpModalProps> = ({
  onClose,
  activeAgent,
  onShowAbout,
  onShowForwardThinking,
  onShowTech,
  onShowDisclaimer,
  onShowErrorConsole,
  onShowReleaseLog,
  onShowLsvzFormat,
}) => {
  const [showScrollIndicator, setShowScrollIndicator] = useState(true);
  const themeColor = 'text-cyan-400';
  const themeShadow = 'shadow-cyan-500/20';

  const handleMenuAction = (action: () => void) => {
    onClose();
    action();
  };

  const HelpSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="mb-7">
      <h3 className="mb-3 text-lg font-semibold text-gray-100 light-theme:text-gray-800">{title}</h3>
      <div className="space-y-3 text-sm leading-relaxed text-gray-400 light-theme:text-gray-600">{children}</div>
    </section>
  );

  const AgentCard: React.FC<{ agent: AgentCardInfo }> = ({ agent }) => {
    const Icon = agent.icon;
    const isCurrent = agent.type === activeAgent;
    return (
      <div
        className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
          isCurrent
            ? 'border-cyan-500/40 bg-cyan-500/[0.06]'
            : 'border-gray-700 bg-gray-900/50 light-theme:border-gray-300 light-theme:bg-gray-100/50'
        }`}
      >
        <Icon className={`mt-0.5 h-7 w-7 flex-shrink-0 ${agent.color}`} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h5 className="font-semibold text-gray-200 light-theme:text-gray-800">{agent.title}</h5>
            {isCurrent && (
              <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-cyan-300">
                Current
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-400 light-theme:text-gray-600">{agent.description}</p>
        </div>
      </div>
    );
  };

  const SpecialistRow: React.FC<{ agent: AgentCardInfo }> = ({ agent }) => {
    const Icon = agent.icon;
    const isCurrent = agent.type === activeAgent;
    return (
      <div className={`flex items-start gap-2 rounded-md border px-2.5 py-2 ${
        isCurrent
          ? 'border-cyan-500/30 bg-cyan-500/[0.05]'
          : 'border-gray-700/70 bg-gray-900/30 light-theme:border-gray-300 light-theme:bg-gray-100/40'
      }`}>
        <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${agent.color}`} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h5 className="text-xs font-semibold text-gray-200 light-theme:text-gray-800">{agent.title}</h5>
            {isCurrent && <span className="text-[9px] font-bold uppercase text-cyan-300">current</span>}
          </div>
          <p className="text-[11px] leading-snug text-gray-500 light-theme:text-gray-600">{agent.description}</p>
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center bg-gray-900/80 p-4 backdrop-blur-sm animate-fade-in"
      style={{ zIndex: 9990 }}
      onClick={onClose}
    >
      <div
        className={`flex flex-col max-h-[90vh] w-full max-w-4xl rounded-xl border border-gray-700 bg-gray-800 shadow-2xl ${themeShadow} animate-modal-panel-fade-in-down light-theme:border-gray-300 light-theme:bg-white`}
        onClick={event => event.stopPropagation()}
      >
        <header className="flex flex-shrink-0 items-center justify-between border-b border-gray-700 p-4 light-theme:border-gray-300">
          <div>
            <h2 className={`flex items-center gap-2 text-2xl font-bold ${themeColor}`}>
              <QuestionMarkCircleIcon className="h-7 w-7" /> Help & Info
            </h2>
            <p className="mt-1 text-xs text-gray-500">Current workspace guide · updated for the projection and map status workflow</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 transition-colors hover:bg-gray-700 light-theme:hover:bg-gray-200"
            aria-label="Close"
          >
            <XMarkIcon className="h-6 w-6 text-gray-400" />
          </button>
        </header>

        <div className="flex-shrink-0 border-b border-gray-700 bg-gray-700/30 p-4 light-theme:border-gray-300 light-theme:bg-gray-100/50">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {onShowAbout && (
              <button onClick={() => handleMenuAction(onShowAbout)} className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900/50 p-2.5 transition-colors hover:bg-gray-900 light-theme:border-gray-300 light-theme:bg-white light-theme:hover:bg-gray-50">
                <InfoIcon className="h-5 w-5 text-purple-400" />
                <span className="text-sm font-semibold text-gray-200 light-theme:text-gray-800">About</span>
              </button>
            )}
            {onShowForwardThinking && (
              <button onClick={() => handleMenuAction(onShowForwardThinking)} className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900/50 p-2.5 transition-colors hover:bg-gray-900 light-theme:border-gray-300 light-theme:bg-white light-theme:hover:bg-gray-50">
                <BrainCircuitIcon className="h-5 w-5 text-blue-400" />
                <span className="text-sm font-semibold text-gray-200 light-theme:text-gray-800">Forward Thinking</span>
              </button>
            )}
            {onShowTech && (
              <button onClick={() => handleMenuAction(onShowTech)} className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900/50 p-2.5 transition-colors hover:bg-gray-900 light-theme:border-gray-300 light-theme:bg-white light-theme:hover:bg-gray-50">
                <BookOpenIcon className="h-5 w-5 text-indigo-400" />
                <span className="text-sm font-semibold text-gray-200 light-theme:text-gray-800">Technologies</span>
              </button>
            )}
            {onShowDisclaimer && (
              <button onClick={() => handleMenuAction(onShowDisclaimer)} className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900/50 p-2.5 transition-colors hover:bg-gray-900 light-theme:border-gray-300 light-theme:bg-white light-theme:hover:bg-gray-50">
                <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
                <span className="text-sm font-semibold text-gray-200 light-theme:text-gray-800">Disclaimer</span>
              </button>
            )}
            {onShowErrorConsole && (
              <button onClick={() => handleMenuAction(onShowErrorConsole)} className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900/50 p-2.5 transition-colors hover:bg-gray-900 light-theme:border-gray-300 light-theme:bg-white light-theme:hover:bg-gray-50">
                <BugAntIcon className="h-5 w-5 text-orange-400" />
                <span className="text-sm font-semibold text-gray-200 light-theme:text-gray-800">Error Console</span>
              </button>
            )}
            {onShowReleaseLog && (
              <button onClick={() => handleMenuAction(onShowReleaseLog)} className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900/50 p-2.5 transition-colors hover:bg-gray-900 light-theme:border-gray-300 light-theme:bg-white light-theme:hover:bg-gray-50">
                <ClipboardDocumentListIcon className="h-5 w-5 text-blue-400" />
                <span className="text-sm font-semibold text-gray-200 light-theme:text-gray-800">Release Log</span>
              </button>
            )}
            {onShowLsvzFormat && (
              <button onClick={() => handleMenuAction(onShowLsvzFormat)} className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900/50 p-2.5 transition-colors hover:bg-gray-900 light-theme:border-gray-300 light-theme:bg-white light-theme:hover:bg-gray-50">
                <LsvzIcon className="h-5 w-5 text-emerald-400" />
                <span className="text-sm font-semibold text-gray-200 light-theme:text-gray-800">.lsvz Format</span>
              </button>
            )}
            <a href="mailto:msersen@gmail.com?subject=LandSurv.ai%20Inquiry" onClick={onClose} className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900/50 p-2.5 transition-colors hover:bg-gray-900 light-theme:border-gray-300 light-theme:bg-white light-theme:hover:bg-gray-50">
              <EnvelopeIcon className="h-5 w-5 text-teal-400" />
              <span className="text-sm font-semibold text-gray-200 light-theme:text-gray-800">Contact</span>
            </a>
            <a href="https://github.com/msersen/Landsurv.ai_Public-/issues" target="_blank" rel="noopener noreferrer" onClick={onClose} className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900/50 p-2.5 transition-colors hover:bg-gray-900 light-theme:border-gray-300 light-theme:bg-white light-theme:hover:bg-gray-50">
              <BugAntIcon className="h-5 w-5 text-yellow-400" />
              <span className="text-sm font-semibold text-gray-200 light-theme:text-gray-800">Bug Report</span>
            </a>
            <a href="https://github.com/LandSurvAi/landsurv-core" target="_blank" rel="noopener noreferrer" onClick={onClose} className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900/50 p-2.5 transition-colors hover:bg-gray-900 light-theme:border-gray-300 light-theme:bg-white light-theme:hover:bg-gray-50">
              <CpuChipIcon className="h-5 w-5 text-emerald-400" />
              <span className="text-sm font-semibold text-gray-200 light-theme:text-gray-800">View Source</span>
            </a>
            <a href="https://www.youtube.com/@LandSurvAI" target="_blank" rel="noopener noreferrer" onClick={onClose} className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900/50 p-2.5 transition-colors hover:bg-gray-900 light-theme:border-gray-300 light-theme:bg-white light-theme:hover:bg-gray-50">
              <BookOpenIcon className="h-5 w-5 text-red-400" />
              <span className="text-sm font-semibold text-gray-200 light-theme:text-gray-800">Tutorials</span>
            </a>
          </div>
        </div>

        <main
          className="relative flex-grow overflow-y-auto p-6 text-gray-300 scrollbar-hide light-theme:text-gray-700"
          onScroll={() => setShowScrollIndicator(false)}
        >
          <HelpSection title="Welcome to LandSurv.ai">
            <p>
              LandSurv.ai combines an AI-native survey workspace, CAD drafting tools and project-specific
              specialist agents. The canvas is the center of the project; the side rail and the agent chats
              bring in the tools you need without losing the drawing.
            </p>
            <p className="rounded-lg border border-cyan-500/20 bg-cyan-500/[0.05] p-3 text-xs leading-relaxed text-cyan-100/80 light-theme:border-cyan-600/20 light-theme:bg-cyan-50 light-theme:text-cyan-900">
              <strong>Start here:</strong> load or create a project, set the project coordinate system, then
              work on the canvas or ask the LSAI Agent. Projection is required before map imagery, GIS layers,
              address lookup or GPS stakeout can place data correctly.
            </p>
          </HelpSection>

          <HelpSection title="Project setup & map imagery">
            <p>
              Map imagery, GIS layers, address lookup and stakeout all depend on the project coordinate
              system (CRS / EPSG code). If no projection is set, the canvas cannot place aerial tiles on the
              drawing—they have no correct position or scale.
            </p>
            <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-3 light-theme:border-gray-300 light-theme:bg-gray-100/50">
              <p className="text-xs font-semibold text-gray-200 light-theme:text-gray-800">Set a projection</p>
              <ol className="mt-1 list-inside list-decimal space-y-1 text-xs text-gray-400 light-theme:text-gray-600">
                <li>Open <strong className="text-gray-200 light-theme:text-gray-800">Map</strong> in the canvas header.</li>
                <li>If the flyout says <strong className="text-amber-300">Projection required</strong>, choose <strong>Select projection</strong>.</li>
                <li>Pick a State Plane zone, search a worldwide EPSG code, or use the GPS suggestion.</li>
                <li>The Map flyout then shows tile progress, source and any load failure.</li>
              </ol>
              <p className="mt-2 text-[11px] text-gray-500">
                You can also open Settings → Coordinate System. The map button shows a spinner while imagery
                is loading and turns amber when a projection is missing.
              </p>
            </div>
          </HelpSection>

          <HelpSection title="Core agents">
            <p>Each agent keeps its own context and tools. The highlighted card is the agent you are using now.</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {coreAgents.map(agent => <AgentCard key={agent.type} agent={agent} />)}
            </div>
          </HelpSection>

          <HelpSection title="Specialist workspaces">
            <p>
              These tools open when a project needs them. Availability can depend on the data, your key and
              the features enabled for your workspace.
            </p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {specialistAgents.map(agent => <SpecialistRow key={agent.type} agent={agent} />)}
            </div>
          </HelpSection>

          <HelpSection title="Views & workspace">
            <ul className="list-inside list-disc space-y-2">
              <li><strong className="text-gray-200 light-theme:text-gray-800">Canvas:</strong> points, lines, centerlines, annotations, hatches, underlays, map imagery and the command bar.</li>
              <li><strong className="text-gray-200 light-theme:text-gray-800">Sheet View:</strong> compose and inspect plan sheets and plot output.</li>
              <li><strong className="text-gray-200 light-theme:text-gray-800">CAD Standards:</strong> layers, linetypes, annotation styles, symbols and compliance tools managed by the CAD Manager.</li>
              <li><strong className="text-gray-200 light-theme:text-gray-800">Timeline:</strong> optional and off by default; enable it in Settings. It adds transactional drawing history, sketch boundaries and timeline-owned undo.</li>
              <li><strong className="text-gray-200 light-theme:text-gray-800">Agent workspaces:</strong> profile, GNSS processor, AR, zoning, title search, reports and other dedicated panels.</li>
              <li><strong className="text-gray-200 light-theme:text-gray-800">Field Book:</strong> audit trail of project actions with room for manual notes.</li>
            </ul>
          </HelpSection>

          <HelpSection title="Saving & project files">
            <ul className="list-inside list-disc space-y-2">
              <li><strong className="text-gray-200 light-theme:text-gray-800">Save Session:</strong> use <strong>File → Save Session</strong> to package the project as a <code className="rounded bg-gray-700 px-1 text-xs">.lsvz</code> file.</li>
              <li>The <code className="rounded bg-gray-700 px-1 text-xs">.lsvz</code> archive includes geometry, uploaded files, agent chats and project settings so the work can be reopened later.</li>
              <li>Use <strong>File → Open</strong> to restore an archive. Large projects can take a moment to unpack; wait for the canvas and file list to finish loading.</li>
              <li>Projection and map settings travel with the project. Confirm the CRS when moving a project between regions.</li>
            </ul>
          </HelpSection>

          <HelpSection title="Tips & shortcuts">
            <ul className="list-inside list-disc space-y-2">
              <li><strong className="text-gray-200 light-theme:text-gray-800">Command bar:</strong> press <code className="rounded bg-gray-700 px-1 text-xs">Space</code> on the canvas to focus CAD commands; the Command Reference lists the current aliases.</li>
              <li><strong className="text-gray-200 light-theme:text-gray-800">Scale vs. sketch:</strong> <code className="rounded bg-gray-700 px-1 text-xs">S</code> scales the current selection; double-tap <code className="rounded bg-gray-700 px-1 text-xs">SS</code> starts a timeline sketch when the timeline is enabled.</li>
              <li><strong className="text-gray-200 light-theme:text-gray-800">Move point labels:</strong> hold <code className="rounded bg-gray-700 px-1 text-xs">Ctrl</code> or <code className="rounded bg-gray-700 px-1 text-xs">Cmd</code> and drag a point label.</li>
              <li><strong className="text-gray-200 light-theme:text-gray-800">Map status:</strong> the Map button is the single place for imagery on/off, loading progress, source, failures and projection setup.</li>
              <li><strong className="text-gray-200 light-theme:text-gray-800">Tool surfaces:</strong> dock, float or fullscreen A2UI tool panels from their headers; the canvas keeps its own state.</li>
              <li><strong className="text-gray-200 light-theme:text-gray-800">Suggested questions:</strong> the lightbulb in the chat input offers project-aware starting points when available.</li>
              <li><strong className="text-gray-200 light-theme:text-gray-800">Verify AI output:</strong> this is professional software, but AI-generated geometry, calculations and reports still require review.</li>
            </ul>
          </HelpSection>

          {showScrollIndicator && (
            <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 animate-bounce opacity-60">
              <svg className="h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          )}
        </main>

        <footer className="flex flex-shrink-0 items-center justify-end rounded-b-xl bg-gray-700/50 p-4 light-theme:bg-gray-100/50">
          <button onClick={onClose} className="rounded-lg bg-gray-600 px-6 py-2 font-semibold text-white transition-colors hover:bg-gray-500">
            Close
          </button>
        </footer>
      </div>
    </div>
  );
};

export default HelpModal;
