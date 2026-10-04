// FUTURE GEMINI: This is the Sidebar component. It is a core navigation element.
// - Its responsive behavior (full sidebar on desktop, slide-out menu on mobile) is CRITICAL. Do not change this without explicit instruction.
// - The `agentConfig` object is the single source of truth for agent icons, labels, and colors. When adding a new agent, add it to `agentConfig`.
// - The `SidebarButton` and `NavButton` components define the consistent look and feel of all menu items. Maintain this consistency.

import React, { useState, useEffect, useRef } from 'react';
import { AgentType, JobInfo, useAgent, useUI } from '../types.ts';
import { 
    BrainCircuitIcon, CourthouseIcon, RoadIcon, PlumbBobIcon, BookOpenIcon, 
    MapIcon, CutSheetIcon, DownloadIcon, ArrowUpTrayIcon, EraserIcon, XMarkIcon, 
    QuestionMarkCircleIcon, DocumentDuplicateIcon, CpuChipIcon, ClipboardDocumentListIcon, CurrencyDollarIcon, CogIcon, SparklesIcon,
    LsvzIcon, DxfAnalyzerIcon, AdjustmentsHorizontalIcon, FolderIcon, DocumentTextIcon, CrosshairsIcon, ScaleIcon, CameraIcon, GlobeAltIcon, BugAntIcon,
    FileIcon,
    GisAgentIcon,
    PencilSquareIcon,
    ContourIcon,
    ProfileIcon,
    LayersIcon,
    SatelliteIcon,
    ARIcon,
    ZoningIcon,
    TitleSearchIcon,
    CadManagerIcon,
    CivilDrafterIcon,
    FloodIcon,
    HomeIcon,
    SoilsIcon,
    SlopeIcon,
} from './icons.tsx';
import { getRetiredAgents } from '../utils/retiredAgents.ts';
import { getGlobalSettings, subscribeGlobalSettings } from '../utils/globalSettings.ts';

interface SidebarProps {
    isSessionActive: boolean;
    onSaveSession: () => void;
    onLoadSession: () => void;
    hasPdfFiles: boolean;
    isMobileMenuOpen: boolean;
    setIsMobileMenuOpen: (isOpen: boolean) => void;
    isDesktop: boolean;
    jobInfo: JobInfo;
    setJobInfo: React.Dispatch<React.SetStateAction<JobInfo>>;
    isLoading: boolean;
    onConnectC3D?: () => void;
    isC3DConnected?: boolean;
    c3dClientVersion?: string | null;
    c3dSessionToken?: string | null;
    onShowC3DDebug?: () => void;
    currentModelName?: string;
    /** True when the 'Auto' smart-routing selector is active (no per-agent override). */
    isAutoRouting?: boolean;
    onModelClick?: () => void;
    availableModels?: string[];
    onModelSelect?: (model: string) => void;
    showQuickModelSelector?: boolean;
    setShowQuickModelSelector?: (show: boolean) => void;
    autoHighThinkingModel?: string;
    autoHighThinkingOptions?: string[];
    onAutoHighThinkingModelChange?: (model: string) => void;
    onShowClaudeSettings?: () => void;
}

const AUTO_SELECTOR_OPTION = 'auto';
const getSelectorModelValue = (modelName: string): string => modelName;
const getSelectorModelLabel = (modelName: string): string => (
    modelName === AUTO_SELECTOR_OPTION ? 'Auto (smart routing)'
    : modelName === 'claude-sonnet-5' ? 'Claude Sonnet 5'
    : modelName === 'claude-opus-5' ? 'Claude Opus 5'
    : modelName === 'claude-fable-5' ? 'Claude Fable 5'
    : modelName === 'gemini-3.7-flash' ? 'Gemini 3.7 Flash'
    : modelName === 'gemini-3.8-flash' ? 'Gemini 3.8 Flash'
    : modelName === 'gemini-3.5-flash-lite' ? 'Gemini 3.5 Flash Lite'
    : modelName
);

// FUTURE GEMINI: This object is the single source of truth for agent UI properties.
// To add or modify an agent's appearance in the sidebar, edit its entry here.
const agentConfig = {
    [AgentType.RAW_CRAWLER]: { icon: BrainCircuitIcon, label: 'RAW Crawler', color: 'cyan' },
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
    [AgentType.PROFILE_AGENT]: { icon: ProfileIcon, label: 'Profile & XS', color: 'sky' },
    [AgentType.COGO_AGENT]: { icon: CrosshairsIcon, label: 'COGO', color: 'violet' },
    [AgentType.IMAGE_ANALYZER]: { icon: CameraIcon, label: 'Image Analyzer', color: 'red' },
    [AgentType.GNSS_AGENT]: { icon: SatelliteIcon, label: 'RINEX', color: 'lime' },
    [AgentType.AR_AGENT]: { icon: ARIcon, label: 'AR View', color: 'rose' },
    [AgentType.ZONING_AGENT]: { icon: ZoningIcon, label: 'Zoning', color: 'emerald' },
    [AgentType.TITLE_SEARCH]: { icon: TitleSearchIcon, label: 'Title Search', color: 'amber' },
    [AgentType.LSVZ_AGENT]: { icon: LsvzIcon, label: 'LSVZ Meta-Agent', color: 'slate' },
    [AgentType.CAD_MANAGER]: { icon: CadManagerIcon, label: 'CAD Manager', color: 'indigo' },
    [AgentType.FLOOD_AGENT]: { icon: FloodIcon, label: 'Flood Zone', color: 'cyan' },
    [AgentType.STRUCTURES_AGENT]: { icon: HomeIcon, label: 'Structures', color: 'orange' },
    [AgentType.SOILS_AGENT]: { icon: SoilsIcon, label: 'Soils Agent', color: 'stone' },
};

const agentThemeColors: { [key in AgentType]?: string } = {
    [AgentType.RAW_CRAWLER]: '#22d3ee', // cyan-400
    [AgentType.CIVIL_DRAFTER]: '#e879f9', // fuchsia-400
    [AgentType.DEED_READER]: '#34d399', // green-400
    [AgentType.CENTERLINE_STATIONING]: '#c084fc', // purple-400
    [AgentType.POINT_EDITOR]: '#facc15', // yellow-400
    [AgentType.GPS_STAKEOUT]: '#60a5fa', // blue-400
    [AgentType.FIELD_BOOK]: '#fb923c', // orange-400
    [AgentType.LSVZ_AGENT]: '#94a3b8', // slate-400
    [AgentType.CIVIL_PLAN_EXPERT]: '#fb923c', // orange-400
    [AgentType.DXF_ANALYZER]: '#818cf8', // indigo-400
    [AgentType.IMAGE_ANALYZER]: '#f87171', // red-400
    [AgentType.GIS_AGENT]: '#2dd4bf', // teal-400
    [AgentType.CONTOURING_AGENT]: '#f59e0b', // amber-500
    [AgentType.STEEP_SLOPE_AGENT]: '#f97316', // orange-500
    [AgentType.PROFILE_AGENT]: '#38bdf8', // sky-400
    [AgentType.COGO_AGENT]: '#a78bfa', // violet-400
    [AgentType.GNSS_AGENT]: '#84cc16', // lime-400
    [AgentType.AR_AGENT]: '#fb7185', // rose-400
    [AgentType.ZONING_AGENT]: '#34d399', // emerald-400
    [AgentType.TITLE_SEARCH]: '#fbbf24', // amber-400
    [AgentType.CAD_MANAGER]: '#818cf8', // indigo-400
    [AgentType.FLOOD_AGENT]: '#22d3ee', // cyan-400
    [AgentType.STRUCTURES_AGENT]: '#fb923c', // orange-400
    [AgentType.SOILS_AGENT]: '#a8a29e', // stone-400
};

const hexToRgb = (hex: string): string => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
        : '148, 163, 184'; // fallback slate-400
};


export const Sidebar = (props: SidebarProps): React.ReactElement => {
    const { isSessionActive, jobInfo, isLoading } = props;
    const { activeAgent, onAgentChange } = useAgent();
    const { activeVisualPanel, showView, showDoc, showTech, showInvestorForm, showReleaseLog, showSettings, showAbout } = useUI();
    const [isInfoOpen, setIsInfoOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'agents' | 'views'>('agents');
    const [retiredAgents, setRetiredAgents] = useState<AgentType[]>([]);
    const [agentOrderSidebar, setAgentOrderSidebar] = useState<string[] | null>(() => getGlobalSettings().agentOrderSidebar ?? null);
    const modelSelectorRef = useRef<HTMLDivElement>(null);
    
    // Close model selector when clicking outside
    useEffect(() => {
        if (!props.showQuickModelSelector) return;
        
        const handleClickOutside = (event: MouseEvent) => {
            if (modelSelectorRef.current && !modelSelectorRef.current.contains(event.target as Node)) {
                props.setShowQuickModelSelector?.(false);
            }
        };
        
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [props.showQuickModelSelector, props.setShowQuickModelSelector]);

    // Load retired agents on mount and listen for changes
    useEffect(() => {
        setRetiredAgents(getRetiredAgents());
        
        const handleRetiredAgentsChange = (e: CustomEvent<AgentType[]>) => {
            setRetiredAgents(e.detail);
        };
        
        window.addEventListener('retired-agents-changed', handleRetiredAgentsChange as EventListener);
        return () => {
            window.removeEventListener('retired-agents-changed', handleRetiredAgentsChange as EventListener);
        };
    }, []);

    // Live-subscribe to admin-controlled sidebar ordering. When the DevOps console
    // updates `agentOrderSidebar`, every connected client picks it up within ~60s
    // and re-renders the menu in the new order without a reload.
    useEffect(() => {
        const unsub = subscribeGlobalSettings((env) => {
            setAgentOrderSidebar(env.settings.agentOrderSidebar ?? null);
        });
        return () => { unsub(); };
    }, []);

    // NOTE: Job info is hidden from the top of the sidebar; kept in settings if needed.

    const SidebarButton = ({ agent, isDesktop, ...rest }: { agent: AgentType, isDesktop: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) => {
        const config = agentConfig[agent];
        const isActive = activeAgent === agent;
        const isThinking = isActive && props.isLoading;
        const color = config.color;

        const hexColor = agentThemeColors[agent] || '#94a3b8'; // slate-400 fallback
        const rgbColor = hexToRgb(hexColor);

        const baseClasses = `flex items-center gap-4 p-3 my-1 rounded-lg transition-all duration-200 relative`;
        const activeClasses = `bg-gray-700/30 border border-${color}-500 text-white`;
        const inactiveClasses = `bg-transparent border border-transparent text-gray-400 hover:bg-gray-800/50 hover:border-${color}-500/50 light-theme:text-gray-500 light-theme:hover:bg-gray-200 light-theme:hover:text-gray-900`;
        const animationClass = isThinking ? 'animate-pulse-thinking' : '';
        const indicatorClasses = `bg-${color}-400`;
        const Icon = config.icon;

        return (
            <div className="relative has-tooltip">
                <button
                    onClick={() => onAgentChange(agent)}
                    className={`${baseClasses} ${isDesktop ? 'w-full justify-center md:justify-start' : 'px-4'} ${isActive ? activeClasses : inactiveClasses} ${animationClass}`}
                    style={{ '--pulse-color': rgbColor } as React.CSSProperties}
                    {...rest}
                >
                    <Icon className="w-6 h-6 flex-shrink-0" style={{ color: hexColor }} />
                    <span className={`font-semibold ${isDesktop ? 'md:hidden lg:inline' : ''}`}>{config.label}</span>
                    {isActive && isDesktop && <div className={`absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full ${indicatorClasses}`}></div>}
                </button>
                 <div className={`tooltip ${isDesktop ? 'invisible absolute left-full ml-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-gray-900 text-white text-sm rounded-md shadow-lg opacity-0 transform -translate-x-2 transition-all duration-200 md:inline lg:hidden' : 'hidden'} light-theme:bg-gray-700 light-theme:text-gray-100`}>
                    {config.label}
                </div>
            </div>
        );
    };
    
    // FUTURE GEMINI: This is the standard button for a View or Action in the sidebar. Do not change its styling.
    const NavButton = ({ label, icon: Icon, onClick, isActive, isDesktop }: { label: string, icon: React.FC<any>, onClick: () => void, isActive?: boolean, isDesktop: boolean }) => {
         const color = agentConfig[activeAgent]?.color || 'slate';
         const activeClasses = `bg-${color}-500 text-white`;
         const inactiveClasses = `text-gray-400 hover:bg-gray-800/50 hover:border-${color}-500/50 light-theme:text-gray-500 light-theme:hover:bg-gray-200 light-theme:hover:text-gray-900`;
        return (
            <div className="relative has-tooltip">
                <button onClick={onClick} className={`flex items-center gap-4 p-3 my-1 rounded-lg transition-colors duration-200 ${isDesktop ? 'w-full justify-center md:justify-start' : 'px-4'} ${isActive ? activeClasses : inactiveClasses}`}>
                    <Icon className="w-6 h-6 flex-shrink-0" />
                    <span className={`font-semibold ${isDesktop ? 'md:hidden lg:inline' : ''}`}>{label}</span>
                </button>
                 <div className={`tooltip ${isDesktop ? 'invisible absolute left-full ml-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-gray-900 text-white text-sm rounded-md shadow-lg opacity-0 transform -translate-x-2 transition-all duration-200 md:inline lg:hidden' : 'hidden'} light-theme:bg-gray-700 light-theme:text-gray-100`}>
                    {label}
                </div>
            </div>
        );
    }

    // C3D Connection Button with pulsing status indicator
    const C3DConnectionButton = ({ onClick, onDebugClick, isConnected, isDesktop, hasToken, version }: { onClick: () => void, onDebugClick?: () => void, isConnected: boolean, isDesktop: boolean, hasToken: boolean, version?: string | null }) => {
        const label = isConnected 
            ? (version ? `C3D v${version}` : 'C3D Connected') 
            : (hasToken ? 'C3D Ready' : 'Connect C3D');
        const dotColor = isConnected ? 'bg-green-500' : (hasToken ? 'bg-yellow-500' : 'bg-red-500');
        const pulseColor = isConnected ? 'bg-green-400' : (hasToken ? 'bg-yellow-400' : 'bg-red-400');
        const textColor = isConnected ? 'text-green-400' : (hasToken ? 'text-yellow-400' : 'text-gray-400');
        const hoverBg = isConnected ? 'hover:bg-green-900/30' : 'hover:bg-gray-800/50';
        
        const handleClick = () => {
            if (isConnected && onDebugClick) {
                // When connected, show debug info
                onDebugClick();
            } else {
                // When not connected, open connect panel
                onClick();
            }
        };
        
        return (
            <div className="relative has-tooltip">
                <button 
                    onClick={handleClick} 
                    className={`flex items-center gap-4 p-3 my-1 rounded-lg transition-colors duration-200 ${isDesktop ? 'w-full justify-center md:justify-start' : 'px-4'} ${textColor} ${hoverBg} light-theme:hover:bg-gray-200`}
                >
                    {/* Icon with status dot */}
                    <div className="relative flex-shrink-0">
                        <CpuChipIcon className={`w-6 h-6 ${isConnected ? 'text-green-400' : (hasToken ? 'text-yellow-400' : 'text-gray-500')}`} />
                        {/* Pulsing status dot */}
                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${pulseColor} opacity-75`}></span>
                            <span className={`relative inline-flex rounded-full h-3 w-3 ${dotColor}`}></span>
                        </span>
                    </div>
                    <span className={`font-semibold ${isDesktop ? 'md:hidden lg:inline' : ''}`}>{label}</span>
                </button>
                <div className={`tooltip ${isDesktop ? 'invisible absolute left-full ml-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-gray-900 text-white text-sm rounded-md shadow-lg opacity-0 transform -translate-x-2 transition-all duration-200 md:inline lg:hidden' : 'hidden'} light-theme:bg-gray-700 light-theme:text-gray-100`}>
                    {isConnected ? (version ? `Connected: v${version}` : 'Click for connection info') : (hasToken ? 'Token ready - waiting for C3D' : 'Click to connect Civil 3D')}
                </div>
            </div>
        );
    };
    
    const handleInfoMenuClick = (action: () => void) => {
        action();
        setIsInfoOpen(false);
    };

    // FUTURE GEMINI: This is the Info/Help dropdown menu. Its contents and structure are important for user guidance.
    // Preserve the links and their respective actions.
    const InfoMenu = () => (
        <div className={`absolute w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl p-2 z-50 ${props.isDesktop ? 'left-full bottom-2 ml-2' : 'bottom-16 left-4'} light-theme:bg-white light-theme:border-gray-300`}>
            <button onClick={() => handleInfoMenuClick(showAbout)} className="w-full text-left flex items-center gap-3 p-2 rounded-md hover:bg-gray-700 transition-colors light-theme:hover:bg-gray-200"><BrainCircuitIcon className="w-5 h-5 text-purple-400"/> About</button>
            <button onClick={() => handleInfoMenuClick(showDoc)} className="w-full text-left flex items-center gap-3 p-2 rounded-md hover:bg-gray-700 transition-colors light-theme:hover:bg-gray-200"><DocumentDuplicateIcon className="w-5 h-5 text-cyan-400"/> .lsvz Format</button>
            <hr className="border-gray-600 my-1"/>
            <button onClick={() => handleInfoMenuClick(showReleaseLog)} className="w-full text-left flex items-center gap-3 p-2 rounded-md hover:bg-gray-700 transition-colors light-theme:hover:bg-gray-200"><ClipboardDocumentListIcon className="w-5 h-5 text-blue-400"/> Release Log</button>
            <button onClick={() => handleInfoMenuClick(showTech)} className="w-full text-left flex items-center gap-3 p-2 rounded-md hover:bg-gray-700 transition-colors light-theme:hover:bg-gray-200"><CpuChipIcon className="w-5 h-5 text-gray-400"/> Technologies</button>
            <hr className="border-gray-600 my-1"/>
            <a href="https://civil3d.landsurv.ai" target="_blank" rel="noopener noreferrer" className="w-full text-left flex items-center gap-3 p-2 rounded-md hover:bg-gray-700 transition-colors light-theme:hover:bg-gray-200"><CpuChipIcon className="w-5 h-5 text-blue-400"/> Civil 3D Plugin</a>
            <a href="https://www.youtube.com/@LandSurv" target="_blank" rel="noopener noreferrer" className="w-full text-left flex items-start gap-3 p-2 rounded-md hover:bg-gray-700 transition-colors light-theme:hover:bg-gray-200">
                <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                <span className="flex flex-col leading-tight">
                    <span>YouTube Tutorials</span>
                    <span className="text-[10px] text-gray-400 font-normal">Learn the app — walkthroughs & tips</span>
                </span>
            </a>
            <hr className="border-gray-600 my-1"/>
            <button onClick={() => handleInfoMenuClick(showInvestorForm)} className="w-full text-left flex items-center gap-3 p-2 rounded-md hover:bg-gray-700 transition-colors light-theme:hover:bg-gray-200"><CurrencyDollarIcon className="w-5 h-5 text-emerald-400"/> Investor Inquiry</button>
            <a href="https://github.com/msersen/Landsurv.ai_Public-/issues" target="_blank" rel="noopener noreferrer" className="w-full text-left flex items-center gap-3 p-2 rounded-md hover:bg-gray-700 transition-colors light-theme:hover:bg-gray-200">
                <BugAntIcon className="w-5 h-5 text-yellow-400"/> Report a Bug
            </a>
            <a href="https://github.com/LandSurvAi/landsurv-core" target="_blank" rel="noopener noreferrer" className="w-full text-left flex items-center gap-3 p-2 rounded-md hover:bg-gray-700 transition-colors light-theme:hover:bg-gray-200">
                <CpuChipIcon className="w-5 h-5 text-emerald-400"/> View Source (Open Source)
            </a>
        </div>
    );

    const viewToAgentMap: { [key: string]: AgentType | undefined } = {
        imageanalyzer: AgentType.IMAGE_ANALYZER,
        profile: AgentType.PROFILE_AGENT,
        gpsstakeout: AgentType.GPS_STAKEOUT,
    };

    const isAgentPanel = (panel: string) => {
        const mapped = viewToAgentMap[panel];
        return mapped ? !!agentConfig[mapped] : false;
    };

    const sidebarContent = (
        <>
            <div className="flex-shrink-0">
                <div className={`p-2 h-10 flex items-center justify-between ${props.isDesktop ? 'md:justify-center lg:justify-center' : ''}`}>
                    <h1 className="text-2xl font-extrabold leading-none tracking-tight text-gray-200 light-theme:text-gray-800">
                        <span className={`bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-green-400 hidden ${props.isDesktop ? 'md:inline lg:hidden' : 'hidden'}`}>
                            LS
                        </span>
                        <span className={`${props.isDesktop ? 'md:hidden lg:inline' : 'inline'}`}>
                            Land<span className="text-cyan-400">Surv</span><span className="text-green-400">.ai</span><sup>™</sup>
                        </span>
                    </h1>
                    <div className="flex items-center gap-2">
                        <button onClick={() => props.setIsMobileMenuOpen(false)} className="p-1 md:hidden flex-shrink-0">
                            <XMarkIcon className="w-6 h-6"/>
                        </button>
                    </div>
                </div>
                
                <div className="px-2 pt-2">
                    <div className="flex border-b border-gray-700 light-theme:border-gray-300">
                        <button
                            onClick={() => setActiveTab('agents')}
                            className={`flex-1 py-2 text-sm font-semibold transition-colors border-b-2 ${
                                activeTab === 'agents'
                                    ? `text-${agentConfig[activeAgent]?.color || 'cyan'}-400 border-${agentConfig[activeAgent]?.color || 'cyan'}-400`
                                    : 'text-gray-400 border-transparent hover:bg-gray-700/50 light-theme:hover:bg-gray-200'
                            }`}
                        >
                            Agents
                        </button>
                        <button
                            onClick={() => setActiveTab('views')}
                            className={`flex-1 py-2 text-sm font-semibold transition-colors border-b-2 ${
                                activeTab === 'views'
                                    ? `text-${agentConfig[activeAgent]?.color || 'cyan'}-400 border-${agentConfig[activeAgent]?.color || 'cyan'}-400`
                                    : 'text-gray-400 border-transparent hover:bg-gray-700/50 light-theme:hover:bg-gray-200'
                            }`}
                        >
                            Views
                        </button>
                    </div>
                </div>
            </div>

            <nav className="flex-grow p-2 overflow-y-auto min-h-0 scrollbar-hide">
                {activeTab === 'agents' && (
                    <div className={!props.isDesktop ? 'flex flex-wrap justify-center gap-2' : ''}>
                        {(() => {
                            const keys = Object.keys(agentConfig);
                            // Apply admin-controlled ordering if present. Known agent
                            // ids in `agentOrderSidebar` come first (in that order);
                            // any agents missing from the saved order fall through to
                            // the static default order at the end.
                            const ordered = (() => {
                                if (!agentOrderSidebar || agentOrderSidebar.length === 0) return keys;
                                const indexOf = new Map<string, number>();
                                agentOrderSidebar.forEach((id, i) => indexOf.set(id, i));
                                return [...keys].sort((a, b) => {
                                    const ai = indexOf.has(a) ? indexOf.get(a)! : Number.MAX_SAFE_INTEGER;
                                    const bi = indexOf.has(b) ? indexOf.get(b)! : Number.MAX_SAFE_INTEGER;
                                    return ai - bi;
                                });
                            })();
                            return ordered.map(agentKey => {
                                const agent = agentKey as AgentType;
                                // Hide LSVZ agent when no session is active
                                if ((agent === AgentType.LSVZ_AGENT) && !isSessionActive) {
                                    return null;
                                }
                                // Hide retired agents from the sidebar
                                if (retiredAgents.includes(agent)) {
                                    return null;
                                }
                                return <SidebarButton key={agentKey} agent={agent} isDesktop={props.isDesktop} />;
                            });
                        })()}
                    </div>
                )}
                
                {activeTab === 'views' && isSessionActive && (
                    <div className={!props.isDesktop ? 'flex flex-wrap justify-center gap-2' : ''}>
                        <NavButton label="Canvas" icon={MapIcon} onClick={() => showView('canvas')} isActive={activeVisualPanel === 'canvas'} isDesktop={props.isDesktop} />
                        <NavButton label="CAD Standards" icon={CadManagerIcon} onClick={() => showView('cadstandards')} isActive={activeVisualPanel === 'cadstandards' || activeVisualPanel === 'cadmanager'} isDesktop={props.isDesktop} />
                        <NavButton label="Drafting Style Library" icon={CadManagerIcon} onClick={() => showView('draftstylelib')} isActive={activeVisualPanel === 'draftstylelib'} isDesktop={props.isDesktop} />
                        <NavButton label="Linetype Manager" icon={CadManagerIcon} onClick={() => showView('linetypemanager')} isActive={activeVisualPanel === 'linetypemanager'} isDesktop={props.isDesktop} />
                        <NavButton label="Sheet View" icon={CadManagerIcon} onClick={() => showView('sheetview')} isActive={activeVisualPanel === 'sheetview'} isDesktop={props.isDesktop} />
                        <NavButton label="AR View" icon={ARIcon} onClick={() => showView('ar')} isActive={activeVisualPanel === 'ar'} isDesktop={props.isDesktop} />
                        <NavButton label="File Manager" icon={FolderIcon} onClick={() => showView('filemanager')} isActive={activeVisualPanel === 'filemanager'} isDesktop={props.isDesktop} />
                        <NavButton label="Symbol Manager" icon={PencilSquareIcon} onClick={() => showView('symbolmanager')} isActive={activeVisualPanel === 'symbolmanager'} isDesktop={props.isDesktop} />
                        <NavButton label="Annotate Manager" icon={PencilSquareIcon} onClick={() => showView('annotatemanager')} isActive={activeVisualPanel === 'annotatemanager'} isDesktop={props.isDesktop} />
                        <NavButton label="Data Visibility" icon={LayersIcon} onClick={() => showView('layermanager')} isActive={activeVisualPanel === 'layermanager'} isDesktop={props.isDesktop} />
                        <NavButton label="Text Editor" icon={DocumentTextIcon} onClick={() => showView('texteditor')} isActive={activeVisualPanel === 'texteditor'} isDesktop={props.isDesktop} />
                        <NavButton label="WMS Manager" icon={GlobeAltIcon} onClick={() => showView('wms')} isActive={activeVisualPanel === 'wms'} isDesktop={props.isDesktop} />
                        <NavButton label="Field Book" icon={BookOpenIcon} onClick={() => showView('fieldbook')} isActive={activeVisualPanel === 'fieldbook'} isDesktop={props.isDesktop} />
                        <NavButton label="Cut Sheet" icon={CutSheetIcon} onClick={() => showView('cutsheet')} isActive={activeVisualPanel === 'cutsheet'} isDesktop={props.isDesktop} />
                        <NavButton label="Closure Reports" icon={ClipboardDocumentListIcon} onClick={() => showView('closurereport')} isActive={activeVisualPanel === 'closurereport'} isDesktop={props.isDesktop} />
                        {/* Image Analyzer is a Gemini-capable agent and therefore not shown in Views */}
                        {props.hasPdfFiles && (
                            <NavButton label="PDF Reviewer" icon={FileIcon} onClick={() => showView('pdfviewer')} isActive={activeVisualPanel === 'pdfviewer'} isDesktop={props.isDesktop} />
                        )}
                    </div>
                )}
            </nav>
            <div className="flex-shrink-0 p-2 border-t border-gray-700 relative light-theme:border-gray-300">
                <div className={`grid gap-2 ${props.isDesktop ? 'md:grid-cols-1 lg:grid-cols-2' : 'grid-cols-2'}`}>
                    <button onClick={props.onSaveSession} disabled={!isSessionActive} className="flex items-center justify-center gap-2 p-2 rounded-md bg-green-600/20 text-green-300 hover:bg-green-600/40 disabled:opacity-50 disabled:cursor-not-allowed">
                        <DownloadIcon className="w-5 h-5" />
                        <span className={`font-semibold text-sm ${props.isDesktop ? 'md:hidden lg:inline' : 'inline'}`}>Save</span>
                    </button>
                    <button onClick={props.onLoadSession} className="flex items-center justify-center gap-2 p-2 rounded-md bg-blue-600/20 text-blue-300 hover:bg-blue-600/40">
                        <ArrowUpTrayIcon className="w-5 h-5" />
                        <span className={`font-semibold text-sm ${props.isDesktop ? 'md:hidden lg:inline' : 'inline'}`}>Load</span>
                    </button>
                </div>
                <div className="mt-2">
                    {props.onConnectC3D && (
                        <C3DConnectionButton 
                            onClick={props.onConnectC3D} 
                            onDebugClick={props.onShowC3DDebug}
                            isConnected={props.isC3DConnected ?? false} 
                            isDesktop={props.isDesktop}
                            hasToken={!!props.c3dSessionToken}
                            version={props.c3dClientVersion}
                        />
                    )}
                </div>
                {/* Model Name Display - Click to show quick model selector */}
                {props.currentModelName && (
                    <div className="mt-2 relative" ref={modelSelectorRef}>
                        {(() => {
                            const selectedModelValue = props.isAutoRouting
                                ? AUTO_SELECTOR_OPTION
                                : getSelectorModelValue(props.currentModelName);
                            const selectedModelLabel = props.isAutoRouting
                                ? 'Auto (Smart)'
                                : getSelectorModelLabel(selectedModelValue);
                            return <>
                        <div className="relative has-tooltip flex items-center gap-1">
                            <button 
                                onClick={() => props.setShowQuickModelSelector?.(!props.showQuickModelSelector)}
                                className={`flex min-w-0 flex-1 items-center gap-4 p-3 my-1 rounded-lg transition-colors duration-200 ${props.isDesktop ? 'justify-center md:justify-start' : 'px-4'} text-gray-400 hover:bg-gray-800/50 light-theme:text-gray-500 light-theme:hover:bg-gray-200`}
                            >
                                <SparklesIcon className="h-6 w-6 text-purple-400 flex-shrink-0" />
                                <span className={`font-semibold tracking-normal whitespace-nowrap ${props.isDesktop ? 'md:hidden lg:inline' : ''}`}>
                                    {selectedModelLabel}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    props.setShowQuickModelSelector?.(false);
                                    props.onModelClick?.();
                                }}
                                className={`my-1 flex-shrink-0 rounded-lg p-3 text-gray-500 transition-colors hover:bg-gray-800/50 hover:text-purple-300 light-theme:text-gray-500 light-theme:hover:bg-gray-200 ${
                                    props.isDesktop ? 'md:hidden lg:inline-flex' : 'inline-flex'
                                }`}
                                title={`${selectedModelLabel} settings`}
                                aria-label={`Open ${selectedModelLabel} settings`}
                            >
                                <CogIcon className="h-4 w-4" />
                            </button>
                            <div className={`tooltip ${props.isDesktop ? 'invisible absolute left-full ml-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-gray-900 text-white text-sm rounded-md shadow-lg opacity-0 transform -translate-x-2 transition-all duration-200 md:inline lg:hidden' : 'hidden'} light-theme:bg-gray-700 light-theme:text-gray-100`}>
                                Click to change model for this agent
                            </div>
                        </div>
                        {/* Quick Model Selector Dropdown */}
                        {props.showQuickModelSelector && props.availableModels && (
                            <div className="absolute left-0 right-0 bottom-full mb-1 bg-gray-800 rounded-lg shadow-xl border border-gray-700 overflow-hidden z-50 light-theme:bg-white light-theme:border-gray-300">
                                <div className="px-3 py-2 border-b border-gray-700 light-theme:border-gray-200 flex items-center justify-between gap-2">
                                    <span className="text-xs text-gray-400 font-medium light-theme:text-gray-500">Select Model for Agent</span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            props.setShowQuickModelSelector?.(false);
                                            props.onModelClick?.();
                                        }}
                                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-gray-400 transition-colors hover:bg-gray-700/50 hover:text-gray-200 light-theme:text-gray-500 light-theme:hover:bg-gray-100"
                                        title="Model options"
                                        aria-label="Open model settings"
                                    >
                                        <CogIcon className="w-3.5 h-3.5" />
                                        Settings
                                    </button>
                                </div>
                                {props.availableModels.map((model) => (
                                    <button
                                        key={model}
                                        onClick={() => {
                                            props.onModelSelect?.(model);
                                            props.setShowQuickModelSelector?.(false);
                                        }}
                                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                                            model === selectedModelValue 
                                                ? 'bg-purple-600/20 text-purple-300 light-theme:bg-purple-100 light-theme:text-purple-700' 
                                                : 'text-gray-300 hover:bg-gray-700/50 light-theme:text-gray-700 light-theme:hover:bg-gray-100'
                                        }`}
                                    >
                                        {getSelectorModelLabel(model)}
                                        {model === selectedModelValue && <span className="ml-2 text-xs">✓</span>}
                                    </button>
                                ))}
                                {selectedModelValue === AUTO_SELECTOR_OPTION && props.autoHighThinkingOptions && props.autoHighThinkingOptions.length > 0 && (
                                    <>
                                        <div className="px-3 py-2 text-xs text-gray-400 font-medium border-t border-gray-700 light-theme:text-gray-500 light-theme:border-gray-200">
                                            Auto High-Thinking Model
                                        </div>
                                        {props.autoHighThinkingOptions.map((model) => (
                                            <button
                                                key={`auto-high-${model}`}
                                                onClick={() => props.onAutoHighThinkingModelChange?.(model)}
                                                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                                                    model === props.autoHighThinkingModel
                                                        ? 'bg-cyan-600/20 text-cyan-300 light-theme:bg-cyan-100 light-theme:text-cyan-700'
                                                        : 'text-gray-300 hover:bg-gray-700/50 light-theme:text-gray-700 light-theme:hover:bg-gray-100'
                                                }`}
                                            >
                                                {getSelectorModelLabel(model)}
                                                {model === props.autoHighThinkingModel && <span className="ml-2 text-xs">✓</span>}
                                            </button>
                                        ))}
                                    </>
                                )}
                                <button
                                    onClick={() => {
                                        props.setShowQuickModelSelector?.(false);
                                        props.onModelClick?.();
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs text-gray-500 hover:bg-gray-700/50 border-t border-gray-700 light-theme:text-gray-400 light-theme:hover:bg-gray-100 light-theme:border-gray-200"
                                >
                                    Open model settings...
                                </button>
                            </div>
                        )}
                            </>;
                        })()}
                    </div>
                )}
                <div className="mt-2">
                    <NavButton label="Info & Help" icon={QuestionMarkCircleIcon} onClick={() => setIsInfoOpen(p => !p)} isDesktop={props.isDesktop} />
                </div>
            </div>

            {isInfoOpen && <InfoMenu />}
        </>
    );

    // FIX: Added the main return statement for the component to fix the "must return a value" error.
    if (props.isDesktop) {
        return (
            <aside className="flex flex-col w-20 lg:w-64 bg-gray-900 border-r border-gray-700 flex-shrink-0 relative light-theme:bg-gray-100 light-theme:border-gray-300">
                {sidebarContent}
            </aside>
        );
    }
    
    // Mobile view
    return (
        <div className={`fixed inset-0 z-40 transform transition-transform duration-300 md:hidden ${props.isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="absolute inset-0 bg-gray-900/50" onClick={() => props.setIsMobileMenuOpen(false)}></div>
            <aside className="relative w-64 h-full bg-gray-900 border-r border-gray-700 flex flex-col light-theme:bg-gray-100 light-theme:border-gray-300">
                {sidebarContent}
            </aside>
        </div>
    );
};