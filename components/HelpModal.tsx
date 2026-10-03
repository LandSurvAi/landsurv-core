import React, { useState } from 'react';
import { AgentType } from '../types.ts';
import { XMarkIcon, BrainCircuitIcon, CourthouseIcon, RoadIcon, PlumbBobIcon, DocumentDuplicateIcon, DxfAnalyzerIcon, LsvzIcon, CrosshairsIcon, FolderIcon, DocumentTextIcon, CameraIcon, ScaleIcon, MapIcon, CutSheetIcon, BookOpenIcon, QuestionMarkCircleIcon, InfoIcon, ExclamationTriangleIcon, EnvelopeIcon, BugAntIcon, CpuChipIcon } from './icons.tsx';

interface HelpModalProps {
  onClose: () => void;
  activeAgent: AgentType;
  onShowAbout?: () => void;
  onShowForwardThinking?: () => void;
  onShowTech?: () => void;
  onShowDisclaimer?: () => void;
  onShowErrorConsole?: () => void;
  onShowReleaseLog?: () => void;
}

const getAgentColorClass = (agentType: AgentType) => {
    switch (agentType) {
        case AgentType.RAW_CRAWLER: return 'text-cyan-400';
        case AgentType.DEED_READER: return 'text-green-400';
        case AgentType.CIVIL_PLAN_EXPERT: return 'text-orange-400';
        case AgentType.DXF_ANALYZER: return 'text-indigo-400';
        case AgentType.CENTERLINE_STATIONING: return 'text-purple-400';
        case AgentType.POINT_EDITOR: return 'text-yellow-400';
        case AgentType.GPS_STAKEOUT: return 'text-blue-400';
        case AgentType.IMAGE_ANALYZER: return 'text-red-400';
        case AgentType.FILE_MANAGER: return 'text-slate-400';
        case AgentType.TEXT_EDITOR: return 'text-gray-400';
        case AgentType.LSVZ_AGENT: return 'text-slate-400';
        default: return 'text-gray-400';
    }
}

const agentInfo = [
    { type: AgentType.RAW_CRAWLER, icon: BrainCircuitIcon, title: 'RAW Crawler', description: 'Analyzes surveyor .RAW files for errors, calculations, and visualization.' },
    { type: AgentType.DEED_READER, icon: CourthouseIcon, title: 'Boundary Agent', description: 'Interprets, plots, and edits property boundaries — from deeds (text or scanned PDFs), CSV bearing/distance lists, or hand entry.' },
    { type: AgentType.CIVIL_PLAN_EXPERT, icon: DocumentDuplicateIcon, title: 'Civil Plan Expert', description: 'Extracts data and features from multi-page civil engineering plans.' },
    { type: AgentType.DXF_ANALYZER, icon: DxfAnalyzerIcon, title: 'DXF Analyzer', description: 'Queries and visualizes geometry from .dxf files.' },
    { type: AgentType.CENTERLINE_STATIONING, icon: ScaleIcon, title: 'Stationing & CL', description: 'Manages centerline geometry and performs station/offset calculations.' },
    { type: AgentType.POINT_EDITOR, icon: PlumbBobIcon, title: 'Point Editor', description: 'A structured interface for managing, organizing, and calculating project points.' },
    { type: AgentType.GPS_STAKEOUT, icon: CrosshairsIcon, title: 'GPS Rover', description: 'Uses your device\'s GPS for point collection and stakeout.' },
    { type: AgentType.IMAGE_ANALYZER, icon: CameraIcon, title: 'Image Analyzer', description: 'Analyzes site photos, adds tags, and associates them with points.' },
    { type: AgentType.FILE_MANAGER, icon: FolderIcon, title: 'File Manager', description: 'Provides an overview of all files in the current session.' },
    { type: AgentType.TEXT_EDITOR, icon: DocumentTextIcon, title: 'Text Editor', description: 'A simple text editor with an AI assistant for modifying files.' },
    { type: AgentType.LSVZ_AGENT, icon: LsvzIcon, title: 'LSVZ Meta-Agent', description: 'A high-level agent that can see and reason about the entire project.' },
];

const HelpModal: React.FC<HelpModalProps> = ({ onClose, activeAgent, onShowAbout, onShowForwardThinking, onShowTech, onShowDisclaimer, onShowErrorConsole }) => {
    const [showScrollIndicator, setShowScrollIndicator] = useState(true);
    const themeColor = 'text-blue-400';
    const themeShadow = 'shadow-blue-500/20';

    const handleMenuAction = (action: () => void) => {
        onClose();
        action();
    };

    const HelpSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
        <section className="mb-6">
            <h3 className="text-xl font-semibold text-gray-100 mb-3 light-theme:text-gray-800">{title}</h3>
            <div className="space-y-3 text-gray-400 light-theme:text-gray-600">{children}</div>
        </section>
    );

    const AgentCard: React.FC<{ agent: typeof agentInfo[0] }> = ({ agent }) => {
        const Icon = agent.icon;
        return (
            <div className="flex items-start gap-4 p-3 bg-gray-900/50 rounded-lg border border-gray-700 light-theme:bg-gray-100/50 light-theme:border-gray-300">
                <Icon className={`w-8 h-8 ${getAgentColorClass(agent.type)} flex-shrink-0 mt-1`} />
                <div>
                    <h5 className="font-semibold text-gray-200 light-theme:text-gray-800">{agent.title}</h5>
                    <p className="text-sm text-gray-400 light-theme:text-gray-600">{agent.description}</p>
                </div>
            </div>
        );
    }
    
  return (
    <div 
      className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div 
        className={`bg-gray-800 border border-gray-700 rounded-lg shadow-2xl ${themeShadow} max-w-3xl w-full max-h-[90vh] flex flex-col animate-modal-panel-fade-in-down light-theme:bg-white light-theme:border-gray-300`}
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0 light-theme:border-gray-300">
          <h2 className={`text-2xl font-bold ${themeColor} flex items-center gap-2`}><QuestionMarkCircleIcon className="w-7 h-7" /> Help & Info</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700 transition-colors" aria-label="Close">
            <XMarkIcon className="w-6 h-6 text-gray-400" />
          </button>
        </header>
        
        {/* Quick Action Menu */}
        <div className="p-4 bg-gray-700/30 border-b border-gray-700 light-theme:bg-gray-100/50 light-theme:border-gray-300">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {onShowAbout && (
              <button onClick={() => handleMenuAction(onShowAbout)} className="flex items-center gap-2 p-3 bg-gray-900/50 hover:bg-gray-900 rounded-lg border border-gray-700 transition-colors light-theme:bg-white light-theme:hover:bg-gray-50 light-theme:border-gray-300">
                <InfoIcon className="w-5 h-5 text-purple-400" />
                <span className="text-sm font-semibold text-gray-200 light-theme:text-gray-800">About</span>
              </button>
            )}
            {onShowForwardThinking && (
              <button onClick={() => handleMenuAction(onShowForwardThinking)} className="flex items-center gap-2 p-3 bg-gray-900/50 hover:bg-gray-900 rounded-lg border border-gray-700 transition-colors light-theme:bg-white light-theme:hover:bg-gray-50 light-theme:border-gray-300">
                <BrainCircuitIcon className="w-5 h-5 text-blue-400" />
                <span className="text-sm font-semibold text-gray-200 light-theme:text-gray-800">Forward Thinking</span>
              </button>
            )}
            {onShowTech && (
              <button onClick={() => handleMenuAction(onShowTech)} className="flex items-center gap-2 p-3 bg-gray-900/50 hover:bg-gray-900 rounded-lg border border-gray-700 transition-colors light-theme:bg-white light-theme:hover:bg-gray-50 light-theme:border-gray-300">
                <BookOpenIcon className="w-5 h-5 text-indigo-400" />
                <span className="text-sm font-semibold text-gray-200 light-theme:text-gray-800">Technologies</span>
              </button>
            )}
            {onShowDisclaimer && (
              <button onClick={() => handleMenuAction(onShowDisclaimer)} className="flex items-center gap-2 p-3 bg-gray-900/50 hover:bg-gray-900 rounded-lg border border-gray-700 transition-colors light-theme:bg-white light-theme:hover:bg-gray-50 light-theme:border-gray-300">
                <ExclamationTriangleIcon className="w-5 h-5 text-red-400" />
                <span className="text-sm font-semibold text-gray-200 light-theme:text-gray-800">Disclaimer</span>
              </button>
            )}
            {onShowErrorConsole && (
              <button onClick={() => handleMenuAction(onShowErrorConsole)} className="flex items-center gap-2 p-3 bg-gray-900/50 hover:bg-gray-900 rounded-lg border border-gray-700 transition-colors light-theme:bg-white light-theme:hover:bg-gray-50 light-theme:border-gray-300">
                <BugAntIcon className="w-5 h-5 text-orange-400" />
                <span className="text-sm font-semibold text-gray-200 light-theme:text-gray-800">Error Console</span>
              </button>
            )}
            <a href="mailto:msersen@gmail.com?subject=LandSurv.ai%20Inquiry" onClick={onClose} className="flex items-center gap-2 p-3 bg-gray-900/50 hover:bg-gray-900 rounded-lg border border-gray-700 transition-colors light-theme:bg-white light-theme:hover:bg-gray-50 light-theme:border-gray-300">
              <EnvelopeIcon className="w-5 h-5 text-teal-400" />
              <span className="text-sm font-semibold text-gray-200 light-theme:text-gray-800">Contact</span>
            </a>
            <a href="https://github.com/msersen/Landsurv.ai_Public-/issues" target="_blank" rel="noopener noreferrer" onClick={onClose} className="flex items-center gap-2 p-3 bg-gray-900/50 hover:bg-gray-900 rounded-lg border border-gray-700 transition-colors light-theme:bg-white light-theme:hover:bg-gray-50 light-theme:border-gray-300">
              <BugAntIcon className="w-5 h-5 text-yellow-400" />
              <span className="text-sm font-semibold text-gray-200 light-theme:text-gray-800">Bug Report</span>
            </a>
            <a href="https://github.com/LandSurvAi/landsurv-core" target="_blank" rel="noopener noreferrer" onClick={onClose} className="flex items-center gap-2 p-3 bg-gray-900/50 hover:bg-gray-900 rounded-lg border border-gray-700 transition-colors light-theme:bg-white light-theme:hover:bg-gray-50 light-theme:border-gray-300">
              <CpuChipIcon className="w-5 h-5 text-emerald-400" />
              <span className="text-sm font-semibold text-gray-200 light-theme:text-gray-800">View Source (Open Source)</span>
            </a>
          </div>
        </div>
        
        <main className="flex-grow p-6 overflow-y-auto scrollbar-hide text-gray-300 light-theme:text-gray-700 relative" onScroll={() => setShowScrollIndicator(false)}>
            <HelpSection title="Welcome to LandSurv.ai!">
                <p>This is your AI-powered toolkit for surveying and civil engineering. The application is built around specialized <strong className="text-gray-200 light-theme:text-gray-800">AI Agents</strong>, each designed for a specific task. You can switch between agents using the main sidebar.</p>
            </HelpSection>
            
            <HelpSection title="The Agents">
                <p>Each agent has its own context and memory. Here's a quick overview:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {agentInfo.map(agent => <AgentCard key={agent.type} agent={agent} />)}
                </div>
            </HelpSection>

            <HelpSection title="The Views">
                <p>After loading data, you can switch between different views using the sidebar:</p>
                 <div className="space-y-2">
                    <p><strong className="text-gray-200 light-theme:text-gray-800"><MapIcon className="w-4 h-4 inline-block mr-1"/> Canvas:</strong> The main drawing area where points, lines, and centerlines are visualized.</p>
                    <p><strong className="text-gray-200 light-theme:text-gray-800"><CutSheetIcon className="w-4 h-4 inline-block mr-1"/> Cut Sheet:</strong> View cut/fill reports generated by the AI.</p>
                    <p><strong className="text-gray-200 light-theme:text-gray-800"><BookOpenIcon className="w-4 h-4 inline-block mr-1"/> Fieldbook:</strong> A log of all major actions taken during the session, plus a space for your own manual notes.</p>
                </div>
            </HelpSection>

            <HelpSection title="Tips & Tricks">
                <ul className="list-disc list-inside space-y-2">
                    <li><strong className="text-gray-200 light-theme:text-gray-800">Save Your Session:</strong> Use the "Save Session" button to download a <code className="text-xs bg-gray-700 px-1 rounded">.lsvz</code> file. This file contains your entire project and can be reloaded later.</li>
                    <li><strong className="text-gray-200 light-theme:text-gray-800">Move Point Labels:</strong> In the Canvas view, hold down <code className="text-xs bg-gray-700 px-1 rounded">Ctrl</code> or <code className="text-xs bg-gray-700 px-1 rounded">Cmd</code> and drag a point's label to reposition it.</li>
                    <li><strong className="text-gray-200 light-theme:text-gray-800">Use Suggested Questions:</strong> If you're unsure what to ask, click the <strong className="text-yellow-400">lightbulb icon</strong> in the chat input to see some ideas.</li>
                    <li><strong className="text-gray-200 light-theme:text-gray-800">Check the Disclaimer:</strong> This is beta software. Always verify AI-generated data with professional judgment.</li>
                </ul>
            </HelpSection>
            
            {/* Scroll Indicator */}
            {showScrollIndicator && (
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20 animate-bounce opacity-60 pointer-events-none">
                <svg className="w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            )}
        </main>
         <footer className="p-4 bg-gray-700/50 flex items-center justify-end rounded-b-lg light-theme:bg-gray-100/50">
            <button onClick={onClose} className="px-6 py-2 font-semibold text-white bg-gray-600 rounded-lg hover:bg-gray-500 transition-colors">
                Close
            </button>
        </footer>
      </div>
    </div>
  );
};

export default HelpModal;
