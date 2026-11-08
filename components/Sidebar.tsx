// FUTURE GEMINI: This is the Sidebar component. It is a core navigation element.
// - Its responsive behavior (full sidebar on desktop, slide-out menu on mobile) is CRITICAL. Do not change this without explicit instruction.
// - The `agentConfig` object is the single source of truth for agent icons, labels, and colors. When adding a new agent, add it to `agentConfig`.
// - The `SidebarButton` and `NavButton` components define the consistent look and feel of all menu items. Maintain this consistency.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AgentType, JobInfo, useAgent, useUI } from '../types.ts';
import { 
    BrainCircuitIcon, CourthouseIcon, RoadIcon, PlumbBobIcon, BookOpenIcon, 
    MapIcon, CutSheetIcon, DownloadIcon, ArrowUpTrayIcon, EraserIcon, XMarkIcon, 
    QuestionMarkCircleIcon, DocumentDuplicateIcon, CpuChipIcon, ClipboardDocumentListIcon, CurrencyDollarIcon, CogIcon,
    LsvzIcon, DxfAnalyzerIcon, AdjustmentsHorizontalIcon, FolderIcon, DocumentTextIcon, CrosshairsIcon, CogoIcon, ScaleIcon, CameraIcon, GlobeAltIcon, BugAntIcon,
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
    StructuresIcon,
    SoilsIcon,
    SlopeIcon,
    SheetViewIcon,
    ChevronDoubleRightIcon,
    ChevronLeftIcon,
} from './icons.tsx';
import {
    ModelSelectIcon,
    C3DLinkIcon,
    ViewCanvasIcon,
    StyleLibraryIcon,
    LinetypeManagerIcon,
    HatchManagerIcon,
    FileManagerIcon,
    SymbolManagerIcon,
    AnnotateManagerIcon,
    TextEditorToolIcon,
    WmsManagerIcon,
    FieldBookToolIcon,
    ClosureReportIcon,
    PdfReviewerIcon,
    ToolbarLayersIcon,
    ToolbarStandardsIcon,
    ToolbarDrawToolsIcon,
} from './toolbarIcons.tsx';
import { AgentConstellationIcon } from './icons.tsx';
import { AdjustableWrenchIcon } from './toolbarIcons.tsx';
import { getRetiredAgents } from '../utils/retiredAgents.ts';
import { getGlobalSettings, subscribeGlobalSettings } from '../utils/globalSettings.ts';
import { AGENT_SIDEBAR_LAYOUT_EVENT } from '../utils/layoutEvents.ts';

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
    /** Desktop header navigation — the workspace Back / Home controls live in the rail. */
    canGoBack?: boolean;
    onGoBack?: () => void;
    onGoHome?: () => void;
}

const SIDEBAR_DEFAULT_WIDTH = 264;
const SIDEBAR_MIN_WIDTH = 208;
const SIDEBAR_MAX_WIDTH = 420;
const SIDEBAR_WIDTH_STORAGE_KEY = 'landsurv-agent-sidebar-width';
const SIDEBAR_INTRO_STORAGE_KEY = 'landsurv.agent-sidebar-intro.v1';
const SIDEBAR_INTRO_VISIBLE_MS = 2200;
const SIDEBAR_TRANSITION_MS = 700;

const AUTO_SELECTOR_OPTION = 'auto';
const getSelectorModelValue = (modelName: string): string => modelName;
const getSelectorModelLabel = (modelName: string): string => (
    modelName === AUTO_SELECTOR_OPTION ? 'Auto (smart routing)'
    : modelName === 'claude-sonnet-5' ? 'Claude Sonnet 5'
    : modelName === 'claude-opus-5' ? 'Claude Opus 5'
    : modelName === 'claude-fable-5' ? 'Claude Fable 5'
    : modelName === 'gemini-3.7-flash' ? 'Gemini 3.7 Flash'
    : modelName === 'gemini-3.8-flash' ? 'Gemini 3.8 Flash'
    : modelName === 'gemini-4-argon' ? 'Gemini 4 Argon'
    : modelName === 'gemini-3.5-flash-lite' ? 'Gemini 3.5 Flash Lite'
    : modelName
);

// FUTURE GEMINI: This object is the single source of truth for agent UI properties.
// To add or modify an agent's appearance in the sidebar, edit its entry here.
type SidebarAgentEntry = { icon: React.FC<any>; label: string; color: string };

const agentConfig: Partial<Record<AgentType, SidebarAgentEntry>> = {
    [AgentType.RAW_CRAWLER]: { icon: BrainCircuitIcon, label: 'RAW Crawler', color: 'cyan' },
    [AgentType.CIVIL_DRAFTER]: { icon: CivilDrafterIcon, label: 'Civil Drafter', color: 'fuchsia' },
    [AgentType.DEED_READER]: { icon: CourthouseIcon, label: 'Boundary Agent', color: 'green' },
    [AgentType.CIVIL_PLAN_EXPERT]: { icon: DocumentDuplicateIcon, label: 'Civil Plan Expert', color: 'orange' },
    [AgentType.DXF_ANALYZER]: { icon: DxfAnalyzerIcon, label: 'DXF Agent', color: 'indigo' },
    [AgentType.GIS_AGENT]: { icon: GisAgentIcon, label: 'GIS Agent', color: 'teal' },
    [AgentType.CENTERLINE_STATIONING]: { icon: ScaleIcon, label: 'Stationing & CL', color: 'purple' },
    [AgentType.ROADING_AGENT]: { icon: RoadIcon, label: 'Roading Agent', color: 'amber' },
    [AgentType.POINT_EDITOR]: { icon: PlumbBobIcon, label: 'Point Editor', color: 'yellow' },
    [AgentType.GPS_STAKEOUT]: { icon: CrosshairsIcon, label: 'GPS Rover', color: 'blue' },
    [AgentType.CONTOURING_AGENT]: { icon: ContourIcon, label: 'Contouring', color: 'amber' },
    [AgentType.STEEP_SLOPE_AGENT]: { icon: SlopeIcon, label: 'Steep Slope', color: 'red' },
    [AgentType.PROFILE_AGENT]: { icon: ProfileIcon, label: 'Profile & XS', color: 'sky' },
    [AgentType.COGO_AGENT]: { icon: CogoIcon, label: 'COGO', color: 'violet' },
    [AgentType.IMAGE_ANALYZER]: { icon: CameraIcon, label: 'Image Analyzer', color: 'red' },
    [AgentType.GNSS_AGENT]: { icon: SatelliteIcon, label: 'RINEX', color: 'lime' },
    [AgentType.AR_AGENT]: { icon: ARIcon, label: 'AR View', color: 'rose' },
    [AgentType.ZONING_AGENT]: { icon: ZoningIcon, label: 'Zoning', color: 'emerald' },
    [AgentType.TITLE_SEARCH]: { icon: TitleSearchIcon, label: 'Title Search', color: 'amber' },
    [AgentType.CAD_MANAGER]: { icon: CadManagerIcon, label: 'CAD Manager', color: 'indigo' },
    [AgentType.FLOOD_AGENT]: { icon: FloodIcon, label: 'Flood Zone', color: 'cyan' },
    [AgentType.STRUCTURES_AGENT]: { icon: StructuresIcon, label: 'Structures', color: 'orange' },
    [AgentType.SOILS_AGENT]: { icon: SoilsIcon, label: 'Soils Agent', color: 'stone' },
    [AgentType.LSVZ_AGENT]: { icon: LsvzIcon, label: 'LSAI Agent', color: 'cyan' },
};

/**
 * Sidebar order shared by the expanded menu and collapsed rail. LSAI is always
 * pinned last so the project assistant closes the list regardless of an
 * admin-saved custom order.
 */
export const getOrderedSidebarAgentKeys = (agentOrderSidebar: string[] | null): AgentType[] => {
    const keys = Object.keys(agentConfig) as AgentType[];
    if (!agentOrderSidebar || agentOrderSidebar.length === 0) return keys;

    const indexOf = new Map<string, number>();
    agentOrderSidebar.forEach((id, i) => indexOf.set(id, i));

    return [...keys].sort((a, b) => {
        const aIsLast = a === AgentType.LSVZ_AGENT;
        const bIsLast = b === AgentType.LSVZ_AGENT;
        if (aIsLast !== bIsLast) return aIsLast ? 1 : -1;
        const ai = indexOf.get(a) ?? Number.MAX_SAFE_INTEGER;
        const bi = indexOf.get(b) ?? Number.MAX_SAFE_INTEGER;
        return ai - bi;
    });
};

const agentThemeColors: { [key in AgentType]?: string } = {
    [AgentType.RAW_CRAWLER]: '#22d3ee', // cyan-400
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
    [AgentType.AR_AGENT]: '#fb7185', // rose-400
    [AgentType.ZONING_AGENT]: '#34d399', // emerald-400
    [AgentType.TITLE_SEARCH]: '#fbbf24', // amber-400
    [AgentType.CAD_MANAGER]: '#818cf8', // indigo-400
    [AgentType.FLOOD_AGENT]: '#22d3ee', // cyan-400
    [AgentType.STRUCTURES_AGENT]: '#fb923c', // orange-400
    [AgentType.SOILS_AGENT]: '#a8a29e', // stone-400
    [AgentType.ROADING_AGENT]: '#f59e0b', // amber-500
};

const hexToRgb = (hex: string): string => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
        : '148, 163, 184'; // fallback slate-400
};

// These rows live at module scope on purpose. Declaring them inside Sidebar
// gives them a new identity on every render, which remounts the whole agent
// list and can drop a click that spans a re-render.
const SidebarButton = ({ agent, isDesktop, isActive, isThinking, onSelect }: {
    agent: AgentType;
    isDesktop: boolean;
    isActive: boolean;
    isThinking: boolean;
    onSelect: (agent: AgentType) => void;
}) => {
    const config = agentConfig[agent];
    if (!config) return null;

    const hexColor = agentThemeColors[agent] || '#94a3b8'; // slate-400 fallback
    const rgbColor = hexToRgb(hexColor);
    const Icon = config.icon;

    return (
        <div className="relative has-tooltip">
            <button
                type="button"
                onClick={() => onSelect(agent)}
                className={`group relative flex w-full items-center gap-1.5 rounded-md border px-1.5 py-[6px] text-left transition-colors duration-150 lg:gap-2.5 lg:px-2.5 ${
                    isDesktop ? 'justify-center lg:justify-start' : ''
                } ${
                    isActive
                        ? 'border-transparent text-white'
                        : 'border-transparent text-slate-400 hover:bg-white/[0.045] hover:text-slate-100 light-theme:text-gray-600 light-theme:hover:bg-black/[0.04] light-theme:hover:text-gray-900'
                }`}
                style={{
                    ...(isActive ? {
                        background: `linear-gradient(90deg, rgba(${rgbColor},0.16), rgba(${rgbColor},0.03))`,
                        boxShadow: `inset 0 0 0 1px rgba(${rgbColor},0.24)`,
                    } : {}),
                } as React.CSSProperties}
            >
                {isActive && (
                    <span
                        className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full"
                        style={{ backgroundColor: hexColor }}
                    />
                )}
                <Icon
                    className="h-[18px] w-[18px] flex-shrink-0"
                    style={{ color: isActive ? hexColor : `rgba(${rgbColor},0.82)` }}
                />
                <span className={`truncate text-[12.5px] font-medium leading-none ${isDesktop ? 'hidden lg:inline' : ''} ${isThinking ? 'animate-thinking-red-text' : ''}`}>{config.label}</span>
                {isActive && (
                    <span
                        className="ml-auto hidden h-1.5 w-1.5 flex-shrink-0 rounded-full lg:block"
                        style={{ backgroundColor: hexColor, boxShadow: `0 0 8px rgba(${rgbColor},0.75)` }}
                    />
                )}
            </button>
            <div className={`tooltip ${isDesktop ? 'invisible absolute left-full ml-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-gray-900 text-white text-sm rounded-md shadow-lg opacity-0 transform -translate-x-2 transition-all duration-200 md:inline lg:hidden' : 'hidden'} light-theme:bg-gray-700 light-theme:text-gray-100`}>
                {config.label}
            </div>
        </div>
    );
};

// Standard View / Action row. Same grid and accent system as the agent rows.
const NavButton = ({ label, icon: Icon, onClick, isActive, isDesktop }: { label: string, icon: React.FC<any>, onClick: () => void, isActive?: boolean, isDesktop: boolean }) => {
    return (
        <div className="relative has-tooltip">
            <button
                type="button"
                onClick={onClick}
                className={`group relative flex w-full items-center gap-1.5 rounded-md border px-1.5 py-[6px] text-left transition-colors duration-150 lg:gap-2.5 lg:px-2.5 ${
                    isDesktop ? 'justify-center lg:justify-start' : ''
                } ${
                    isActive
                        ? 'border-cyan-400/25 bg-cyan-400/[0.10] text-white'
                        : 'border-transparent text-slate-400 hover:bg-white/[0.045] hover:text-slate-100 light-theme:text-gray-600 light-theme:hover:bg-black/[0.04] light-theme:hover:text-gray-900'
                }`}
            >
                {isActive && <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full bg-cyan-300" />}
                <Icon className="h-[18px] w-[18px] flex-shrink-0" style={{ color: isActive ? '#67e8f9' : 'rgba(148,163,184,0.8)' }} />
                <span className={`truncate text-[12.5px] font-medium leading-none ${isDesktop ? 'hidden lg:inline' : ''}`}>{label}</span>
            </button>
            <div className={`tooltip ${isDesktop ? 'invisible absolute left-full ml-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-gray-900 text-white text-sm rounded-md shadow-lg opacity-0 transform -translate-x-2 transition-all duration-200 md:inline lg:hidden' : 'hidden'} light-theme:bg-gray-700 light-theme:text-gray-100`}>
                {label}
            </div>
        </div>
    );
};

// C3D Connection Button with pulsing status indicator
const C3DConnectionButton = ({ onClick, onDebugClick, isConnected, isDesktop, hasToken, version }: { onClick: () => void, onDebugClick?: () => void, isConnected: boolean, isDesktop: boolean, hasToken: boolean, version?: string | null }) => {
    const label = isConnected
        ? (version ? `C3D v${version}` : 'C3D Connected')
        : (hasToken ? 'C3D Ready' : 'Connect C3D');
    const statusColor = isConnected ? '#34d399' : (hasToken ? '#fbbf24' : '#f87171');

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
                type="button"
                onClick={handleClick}
                className={`group flex w-full items-center gap-1.5 rounded-md border border-transparent px-1.5 py-[6px] text-left text-slate-400 transition-colors duration-150 hover:bg-white/[0.045] hover:text-slate-100 lg:gap-2.5 lg:px-2.5 ${isDesktop ? 'justify-center lg:justify-start' : ''} light-theme:text-gray-600 light-theme:hover:bg-black/[0.04]`}
            >
                <span className="relative flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center">
                    <C3DLinkIcon className="h-[18px] w-[18px]" style={{ color: isConnected ? '#34d399' : (hasToken ? '#fbbf24' : '#94a3b8') }} />
                    <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2">
                        {!isConnected && (
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ backgroundColor: statusColor }} />
                        )}
                        <span className="relative inline-flex h-2 w-2 rounded-full ring-2 ring-[#0a0f16] light-theme:ring-gray-50" style={{ backgroundColor: statusColor }} />
                    </span>
                </span>
                <span className={`truncate text-[12.5px] font-medium leading-none ${isDesktop ? 'hidden lg:inline' : ''}`} style={{ color: isConnected ? '#6ee7b7' : (hasToken ? '#fcd34d' : undefined) }}>{label}</span>
                {isConnected && <span className="ml-auto hidden text-[8px] font-bold uppercase tracking-[0.16em] text-emerald-400/80 lg:inline">Live</span>}
            </button>
            <div className={`tooltip ${isDesktop ? 'invisible absolute left-full ml-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-gray-900 text-white text-sm rounded-md shadow-lg opacity-0 transform -translate-x-2 transition-all duration-200 md:inline lg:hidden' : 'hidden'} light-theme:bg-gray-700 light-theme:text-gray-100`}>
                {isConnected ? (version ? `Connected: v${version}` : 'Click for connection info') : (hasToken ? 'Token ready - waiting for C3D' : 'Click to connect Civil 3D')}
            </div>
        </div>
    );
};

export const Sidebar = (props: SidebarProps): React.ReactElement => {
    const { isSessionActive, jobInfo, isLoading } = props;
    const { activeAgent, onAgentChange } = useAgent();
    const { activeVisualPanel, showView, showDoc, showTech, showInvestorForm, showReleaseLog, showSettings, showAbout } = useUI();
    const [isInfoOpen, setIsInfoOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'agents' | 'views'>('agents');
    const [isCollapsed, setIsCollapsed] = useState(true);
    const [showCollapsedRail, setShowCollapsedRail] = useState(true);
    const [sidebarIntroPulse, setSidebarIntroPulse] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
        try {
            const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
            if (Number.isFinite(saved) && saved >= SIDEBAR_MIN_WIDTH) {
                return Math.min(saved, SIDEBAR_MAX_WIDTH);
            }
        } catch { /* ignore */ }
        return SIDEBAR_DEFAULT_WIDTH;
    });
    const [isResizingSidebar, setIsResizingSidebar] = useState(false);
    const sidebarRef = useRef<HTMLElement | null>(null);
    const sidebarIntroPlayedRef = useRef(false);
    const sidebarIntroTimersRef = useRef<number[]>([]);
    const railSwapTimerRef = useRef<number | null>(null);

    const clearSidebarIntroTimers = useCallback(() => {
        sidebarIntroTimersRef.current.forEach(timer => window.clearTimeout(timer));
        sidebarIntroTimersRef.current = [];
    }, []);

    const setIsCollapsedByUser = useCallback((collapsed: boolean) => {
        clearSidebarIntroTimers();
        setSidebarIntroPulse(false);
        setIsCollapsed(collapsed);
    }, [clearSidebarIntroTimers]);

    // The command bar's agent socket is portaled to <body> and measured from an
    // in-bar anchor. A width-only sidebar change moves the bar without resizing
    // it, so announce the layout change and let the bar re-measure the anchor.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.dispatchEvent(new Event(AGENT_SIDEBAR_LAYOUT_EVENT));
    }, [isCollapsed, sidebarWidth, props.isDesktop]);

    // Keep the expanded content mounted until the width animation finishes, then
    // swap in the compact rail so the close reads as a slide rather than a snap.
    useEffect(() => {
        if (railSwapTimerRef.current !== null) {
            window.clearTimeout(railSwapTimerRef.current);
            railSwapTimerRef.current = null;
        }
        if (isCollapsed) {
            railSwapTimerRef.current = window.setTimeout(() => {
                railSwapTimerRef.current = null;
                setShowCollapsedRail(true);
            }, SIDEBAR_TRANSITION_MS);
        } else {
            setShowCollapsedRail(false);
        }
        return () => {
            if (railSwapTimerRef.current !== null) {
                window.clearTimeout(railSwapTimerRef.current);
                railSwapTimerRef.current = null;
            }
        };
    }, [isCollapsed]);

    // First entry into the drawing area: reveal the panel briefly, settle it
    // closed, then flash the re-open control. Stored so it only runs once.
    useEffect(() => {
        if (sidebarIntroPlayedRef.current) return;
        if (activeVisualPanel !== 'canvas') return;
        sidebarIntroPlayedRef.current = true;

        try {
            if (localStorage.getItem(SIDEBAR_INTRO_STORAGE_KEY) === '1') return;
            localStorage.setItem(SIDEBAR_INTRO_STORAGE_KEY, '1');
        } catch { /* private mode — still run once this session */ }

        setIsCollapsed(false);
        const closeTimer = window.setTimeout(() => {
            setIsCollapsed(true);
            const pulseDelay = SIDEBAR_TRANSITION_MS + 60;
            const pulseTimer = window.setTimeout(() => setSidebarIntroPulse(true), pulseDelay);
            const pulseEndTimer = window.setTimeout(
                () => setSidebarIntroPulse(false),
                pulseDelay + 3600
            );
            sidebarIntroTimersRef.current.push(pulseTimer, pulseEndTimer);
        }, SIDEBAR_INTRO_VISIBLE_MS);
        sidebarIntroTimersRef.current.push(closeTimer);
    }, [activeVisualPanel]);
    const sidebarResizeState = useRef<{ startX: number; startWidth: number; latestWidth: number } | null>(null);
    const sidebarResizeFrame = useRef<number | null>(null);
    const [retiredAgents, setRetiredAgents] = useState<AgentType[]>([]);
    const [agentOrderSidebar, setAgentOrderSidebar] = useState<string[] | null>(() => getGlobalSettings().agentOrderSidebar ?? null);
    const modelSelectorRef = useRef<HTMLDivElement>(null);

    // Resize the agent panel directly on the DOM during the drag so the rest of
    // the app does not re-render at pointer rate. State is committed on release.
    useEffect(() => {
        if (!isResizingSidebar) return;

        const handleMove = (event: MouseEvent) => {
            const drag = sidebarResizeState.current;
            if (!drag) return;
            const maxWidth = Math.min(
                SIDEBAR_MAX_WIDTH,
                Math.max(SIDEBAR_MIN_WIDTH, window.innerWidth * 0.42)
            );
            const nextWidth = Math.max(
                SIDEBAR_MIN_WIDTH,
                Math.min(maxWidth, drag.startWidth + event.clientX - drag.startX)
            );
            drag.latestWidth = nextWidth;

            if (sidebarResizeFrame.current !== null) {
                cancelAnimationFrame(sidebarResizeFrame.current);
            }
            sidebarResizeFrame.current = requestAnimationFrame(() => {
                sidebarResizeFrame.current = null;
                sidebarRef.current?.style.setProperty('--sidebar-width', `${nextWidth}px`);
            });
        };

        const finishResize = () => {
            if (sidebarResizeFrame.current !== null) {
                cancelAnimationFrame(sidebarResizeFrame.current);
                sidebarResizeFrame.current = null;
            }
            const drag = sidebarResizeState.current;
            if (drag) {
                sidebarRef.current?.style.setProperty('--sidebar-width', `${drag.latestWidth}px`);
                setSidebarWidth(drag.latestWidth);
                try {
                    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(drag.latestWidth));
                } catch { /* ignore */ }
            }
            sidebarResizeState.current = null;
            setIsResizingSidebar(false);
        };

        const previousCursor = document.body.style.cursor;
        const previousUserSelect = document.body.style.userSelect;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', finishResize);
        window.addEventListener('blur', finishResize);
        return () => {
            document.body.style.cursor = previousCursor;
            document.body.style.userSelect = previousUserSelect;
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', finishResize);
            window.removeEventListener('blur', finishResize);
        };
    }, [isResizingSidebar]);

    const handleSidebarResizeMouseDown = (event: React.MouseEvent) => {
        if (!props.isDesktop) return;
        event.preventDefault();
        event.stopPropagation();
        sidebarResizeState.current = {
            startX: event.clientX,
            startWidth: sidebarWidth,
            latestWidth: sidebarWidth,
        };
        setIsResizingSidebar(true);
    };
    
    // Escape closes the sidebar's menus, including the model selector.
    useEffect(() => {
        if (!isInfoOpen && !props.showQuickModelSelector) return;

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            setIsInfoOpen(false);
            props.setShowQuickModelSelector?.(false);
        };

        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [isInfoOpen, props.showQuickModelSelector, props.setShowQuickModelSelector]);

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

    // Standard View / Action row. Same grid and accent system as the agent rows.
    // C3D Connection Button with pulsing status indicator
    const handleInfoMenuClick = (action: () => void) => {
        action();
        setIsInfoOpen(false);
    };

    // FUTURE GEMINI: This is the Info/Help dropdown menu. Its contents and structure are important for user guidance.
    // Preserve the links and their respective actions.
    const InfoMenu = () => (
        <div className={`absolute z-50 w-64 rounded-lg border border-white/10 bg-[#0b1119]/95 p-1.5 text-[12px] text-slate-300 shadow-2xl backdrop-blur-md ${props.isDesktop ? 'left-full bottom-2 ml-2' : 'bottom-16 left-4'} light-theme:border-gray-300 light-theme:bg-white light-theme:text-gray-700`}>
            <button onClick={() => handleInfoMenuClick(showAbout)} className="w-full text-left flex items-center gap-3 p-2 rounded-md hover:bg-white/[0.06] transition-colors light-theme:hover:bg-gray-200"><BrainCircuitIcon className="h-[18px] w-[18px] text-purple-400"/> About</button>
            <button onClick={() => handleInfoMenuClick(showDoc)} className="w-full text-left flex items-center gap-3 p-2 rounded-md hover:bg-white/[0.06] transition-colors light-theme:hover:bg-gray-200"><DocumentDuplicateIcon className="h-[18px] w-[18px] text-cyan-400"/> .lsvz Format</button>
            <hr className="border-white/[0.07] my-1"/>
            <button onClick={() => handleInfoMenuClick(showReleaseLog)} className="w-full text-left flex items-center gap-3 p-2 rounded-md hover:bg-white/[0.06] transition-colors light-theme:hover:bg-gray-200"><ClipboardDocumentListIcon className="h-[18px] w-[18px] text-blue-400"/> Release Log</button>
            <button onClick={() => handleInfoMenuClick(showTech)} className="w-full text-left flex items-center gap-3 p-2 rounded-md hover:bg-white/[0.06] transition-colors light-theme:hover:bg-gray-200"><CpuChipIcon className="h-[18px] w-[18px] text-gray-400"/> Technologies</button>
            <hr className="border-white/[0.07] my-1"/>
            <a href="https://civil3d.landsurv.ai" target="_blank" rel="noopener noreferrer" className="w-full text-left flex items-center gap-3 p-2 rounded-md hover:bg-white/[0.06] transition-colors light-theme:hover:bg-gray-200"><CpuChipIcon className="h-[18px] w-[18px] text-blue-400"/> Civil 3D Plugin</a>
            <a href="https://www.youtube.com/@LandSurvAI" target="_blank" rel="noopener noreferrer" className="w-full text-left flex items-start gap-3 p-2 rounded-md hover:bg-white/[0.06] transition-colors light-theme:hover:bg-gray-200">
                <svg className="h-[18px] w-[18px] text-red-500 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                <span className="flex flex-col leading-tight">
                    <span>YouTube Tutorials</span>
                    <span className="text-[10px] text-gray-400 font-normal">Learn the app — walkthroughs & tips</span>
                </span>
            </a>
            <hr className="border-white/[0.07] my-1"/>
            <button onClick={() => handleInfoMenuClick(showInvestorForm)} className="w-full text-left flex items-center gap-3 p-2 rounded-md hover:bg-white/[0.06] transition-colors light-theme:hover:bg-gray-200"><CurrencyDollarIcon className="h-[18px] w-[18px] text-emerald-400"/> Investor Inquiry</button>
            <a href="https://github.com/msersen/Landsurv.ai_Public-/issues" target="_blank" rel="noopener noreferrer" className="w-full text-left flex items-center gap-3 p-2 rounded-md hover:bg-white/[0.06] transition-colors light-theme:hover:bg-gray-200">
                <BugAntIcon className="h-[18px] w-[18px] text-yellow-400"/> Report a Bug
            </a>
            <a href="https://github.com/LandSurvAi/landsurv-core" target="_blank" rel="noopener noreferrer" className="w-full text-left flex items-center gap-3 p-2 rounded-md hover:bg-white/[0.06] transition-colors light-theme:hover:bg-gray-200">
                <CpuChipIcon className="h-[18px] w-[18px] text-emerald-400"/> View Source (Open Source)
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
                <div className={`flex h-14 items-center gap-2 px-3 ${props.isDesktop ? 'justify-start' : 'justify-between'}`}>
                    {props.isDesktop && (
                        <button
                            type="button"
                            onClick={() => setIsCollapsedByUser(true)}
                            className="hidden h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-cyan-300 light-theme:text-gray-500 light-theme:hover:bg-black/[0.04] lg:flex"
                            title="Hide agent panel"
                            aria-label="Hide agent panel"
                        >
                            <ChevronDoubleRightIcon className="h-[18px] w-[18px] rotate-180" />
                        </button>
                    )}
                    <div className="flex min-w-0 items-center gap-2">
                        <span className={`h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-400/[0.08] ${props.isDesktop ? 'hidden md:flex lg:hidden' : 'flex'}`}>
                            <span className="font-mono text-[10px] font-extrabold tracking-tight text-cyan-300">LS</span>
                        </span>
                        <h1 className="text-[19px] font-bold leading-none tracking-tight text-slate-100 light-theme:text-gray-800">
                            <span className={`${props.isDesktop ? 'hidden lg:inline' : 'inline'}`}>
                                Land<span className="text-cyan-400">Surv</span><span className="text-emerald-400">.ai</span><sup className="ml-0.5 align-super text-[8px] font-semibold text-slate-500">™</sup>
                            </span>
                        </h1>
                        <button onClick={() => props.setIsMobileMenuOpen(false)} className="ml-auto rounded p-1 text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-200 md:hidden">
                            <XMarkIcon className="h-[18px] w-[18px]"/>
                        </button>
                    </div>
                    {props.isDesktop && (
                        <div className="ml-auto flex flex-shrink-0 items-center gap-0.5">
                            {props.canGoBack && (
                                <button
                                    type="button"
                                    onClick={() => props.onGoBack?.()}
                                    className="flex h-8 w-8 items-center justify-center rounded-md text-cyan-300 transition-colors hover:bg-white/[0.06] hover:text-cyan-200 light-theme:text-cyan-600 light-theme:hover:bg-black/[0.04]"
                                    title="Go Back"
                                    aria-label="Go Back"
                                >
                                    <ChevronLeftIcon className="h-[18px] w-[18px]" />
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => props.onGoHome?.()}
                                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-cyan-300 light-theme:text-gray-500 light-theme:hover:bg-black/[0.04]"
                                title="Go to Home Screen"
                                aria-label="Go to Home Screen"
                            >
                                <HomeIcon className="h-[18px] w-[18px]" />
                            </button>
                        </div>
                    )}
                </div>

                <div className="px-2 pb-2.5">
                    <div className="flex items-center gap-0.5 rounded-md border border-white/[0.06] bg-black/25 p-0.5 light-theme:border-gray-300 light-theme:bg-white">
                        <button
                            onClick={() => setActiveTab('agents')}
                            className={`flex flex-1 items-center justify-center gap-1.5 rounded-[5px] px-2 py-[6px] text-[10px] font-bold uppercase tracking-[0.14em] transition-colors ${
                                activeTab === 'agents'
                                    ? 'bg-white/[0.08] text-cyan-200 ring-1 ring-inset ring-cyan-400/25 light-theme:bg-gray-100 light-theme:text-cyan-700'
                                    : 'text-slate-500 hover:text-slate-300 light-theme:text-gray-500 light-theme:hover:text-gray-800'
                            }`}
                        >
                            <AgentConstellationIcon className="h-[18px] w-[18px]" />
                            <span className="hidden lg:inline">Agents</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('views')}
                            className={`flex flex-1 items-center justify-center gap-1.5 rounded-[5px] px-2 py-[6px] text-[10px] font-bold uppercase tracking-[0.14em] transition-colors ${
                                activeTab === 'views'
                                    ? 'bg-white/[0.08] text-cyan-200 ring-1 ring-inset ring-cyan-400/25 light-theme:bg-gray-100 light-theme:text-cyan-700'
                                    : 'text-slate-500 hover:text-slate-300 light-theme:text-gray-500 light-theme:hover:text-gray-800'
                            }`}
                        >
                            <AdjustableWrenchIcon className="h-[18px] w-[18px]" />
                            <span className="hidden lg:inline">Tools</span>
                        </button>
                    </div>
                </div>
            </div>

            <nav className="min-h-0 flex-grow overflow-y-auto px-2 pb-2 scrollbar-hide">
                {activeTab === 'agents' && (
                    <>
                    <div className="hidden px-2 pb-1 pt-1 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500 lg:block">Agent Workspaces</div>
                    <div className={!props.isDesktop ? 'flex flex-wrap justify-center gap-2' : ''}>
                        {(() => {
                            const ordered = getOrderedSidebarAgentKeys(agentOrderSidebar);
                            return ordered.map(agentKey => {
                                const agent = agentKey as AgentType;
                                // Hide retired agents from the sidebar
                                if (retiredAgents.includes(agent)) {
                                    return null;
                                }
                                return (
                                    <SidebarButton
                                        key={agentKey}
                                        agent={agent}
                                        isDesktop={props.isDesktop}
                                        isActive={agent === activeAgent}
                                        isThinking={agent === activeAgent && props.isLoading}
                                        onSelect={onAgentChange}
                                    />
                                );
                            });
                        })()}
                    </div>
                    </>
                )}

                {activeTab === 'views' && isSessionActive && (
                    <>
                    <div className="hidden px-2 pb-1 pt-1 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500 lg:block">Tools &amp; Panels</div>
                    <div className={!props.isDesktop ? 'flex flex-wrap justify-center gap-2' : ''}>
                        <NavButton label="Canvas" icon={ViewCanvasIcon} onClick={() => showView('canvas')} isActive={activeVisualPanel === 'canvas'} isDesktop={props.isDesktop} />
                        <NavButton label="CAD Standards" icon={ToolbarStandardsIcon} onClick={() => showView('cadstandards')} isActive={activeVisualPanel === 'cadstandards' || activeVisualPanel === 'cadmanager'} isDesktop={props.isDesktop} />
                        <NavButton label="Drafting Style Library" icon={StyleLibraryIcon} onClick={() => showView('draftstylelib')} isActive={activeVisualPanel === 'draftstylelib'} isDesktop={props.isDesktop} />
                        <NavButton label="Linetype Manager" icon={LinetypeManagerIcon} onClick={() => showView('linetypemanager')} isActive={activeVisualPanel === 'linetypemanager'} isDesktop={props.isDesktop} />
                        <NavButton label="Hatch Manager" icon={HatchManagerIcon} onClick={() => showView('hatchmanager')} isActive={activeVisualPanel === 'hatchmanager'} isDesktop={props.isDesktop} />
                        <NavButton label="Sheet View" icon={SheetViewIcon} onClick={() => showView('sheetview')} isActive={activeVisualPanel === 'sheetview'} isDesktop={props.isDesktop} />
                        <NavButton label="AR View" icon={ARIcon} onClick={() => showView('ar')} isActive={activeVisualPanel === 'ar'} isDesktop={props.isDesktop} />
                        <NavButton label="File Manager" icon={FileManagerIcon} onClick={() => showView('filemanager')} isActive={activeVisualPanel === 'filemanager'} isDesktop={props.isDesktop} />
                        <NavButton label="Symbol Manager" icon={SymbolManagerIcon} onClick={() => showView('symbolmanager')} isActive={activeVisualPanel === 'symbolmanager'} isDesktop={props.isDesktop} />
                        <NavButton label="Annotate Manager" icon={AnnotateManagerIcon} onClick={() => showView('annotatemanager')} isActive={activeVisualPanel === 'annotatemanager'} isDesktop={props.isDesktop} />
                        <NavButton label="Data Visibility" icon={ToolbarLayersIcon} onClick={() => showView('layermanager')} isActive={activeVisualPanel === 'layermanager'} isDesktop={props.isDesktop} />
                        <NavButton label="Text Editor" icon={TextEditorToolIcon} onClick={() => showView('texteditor')} isActive={activeVisualPanel === 'texteditor'} isDesktop={props.isDesktop} />
                        <NavButton label="WMS Manager" icon={WmsManagerIcon} onClick={() => showView('wms')} isActive={activeVisualPanel === 'wms'} isDesktop={props.isDesktop} />
                        <NavButton label="Field Book" icon={FieldBookToolIcon} onClick={() => showView('fieldbook')} isActive={activeVisualPanel === 'fieldbook'} isDesktop={props.isDesktop} />
                        <NavButton label="Cut Sheet" icon={CutSheetIcon} onClick={() => showView('cutsheet')} isActive={activeVisualPanel === 'cutsheet'} isDesktop={props.isDesktop} />
                        <NavButton label="Closure Reports" icon={ClosureReportIcon} onClick={() => showView('closurereport')} isActive={activeVisualPanel === 'closurereport'} isDesktop={props.isDesktop} />
                        {/* Image Analyzer is a Gemini-capable agent and therefore not shown in Views */}
                        {props.hasPdfFiles && (
                            <NavButton label="PDF Reviewer" icon={PdfReviewerIcon} onClick={() => showView('pdfviewer')} isActive={activeVisualPanel === 'pdfviewer'} isDesktop={props.isDesktop} />
                        )}
                    </div>
                    </>
                )}
            </nav>
            <div className="relative flex-shrink-0 border-t border-white/[0.07] bg-black/20 p-2 light-theme:border-gray-300 light-theme:bg-gray-50">
                <div className="mb-1.5 hidden px-1 text-[8px] font-bold uppercase tracking-[0.2em] text-slate-500 lg:block">Session</div>
                <div className={`grid gap-1.5 ${props.isDesktop ? 'md:grid-cols-1 lg:grid-cols-2' : 'grid-cols-2'}`}>
                    <button
                        onClick={props.onSaveSession}
                        disabled={!isSessionActive}
                        title="Save session"
                        className="group relative flex h-10 items-center justify-center gap-2 overflow-hidden rounded-md border border-emerald-400/20 bg-gradient-to-b from-emerald-400/[0.10] to-emerald-400/[0.02] px-2 text-left transition-colors hover:border-emerald-400/45 disabled:cursor-not-allowed disabled:opacity-40 lg:justify-start light-theme:border-emerald-300/60 light-theme:from-emerald-50 light-theme:to-white"
                    >
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded border border-emerald-400/25 bg-emerald-400/10 text-emerald-300 transition-colors group-hover:border-emerald-400/50 light-theme:border-emerald-300 light-theme:bg-emerald-100 light-theme:text-emerald-700">
                            <DownloadIcon className="h-[18px] w-[18px]" />
                        </span>
                        <span className={`flex min-w-0 flex-col leading-none ${props.isDesktop ? 'hidden lg:flex' : 'flex'}`}>
                            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-200 light-theme:text-emerald-700">Save</span>
                            <span className="mt-1 text-[8px] font-semibold uppercase tracking-[0.16em] text-emerald-400/60 light-theme:text-emerald-600">Session</span>
                        </span>
                        <span aria-hidden="true" className="pointer-events-none absolute inset-x-2 bottom-0 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                    <button
                        onClick={props.onLoadSession}
                        title="Load session"
                        className="group relative flex h-10 items-center justify-center gap-2 overflow-hidden rounded-md border border-sky-400/20 bg-gradient-to-b from-sky-400/[0.10] to-sky-400/[0.02] px-2 text-left transition-colors hover:border-sky-400/45 lg:justify-start light-theme:border-sky-300/60 light-theme:from-sky-50 light-theme:to-white"
                    >
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded border border-sky-400/25 bg-sky-400/10 text-sky-300 transition-colors group-hover:border-sky-400/50 light-theme:border-sky-300 light-theme:bg-sky-100 light-theme:text-sky-700">
                            <ArrowUpTrayIcon className="h-[18px] w-[18px]" />
                        </span>
                        <span className={`flex min-w-0 flex-col leading-none ${props.isDesktop ? 'hidden lg:flex' : 'flex'}`}>
                            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-sky-200 light-theme:text-sky-700">Load</span>
                            <span className="mt-1 text-[8px] font-semibold uppercase tracking-[0.16em] text-sky-400/60 light-theme:text-sky-600">Session</span>
                        </span>
                        <span aria-hidden="true" className="pointer-events-none absolute inset-x-2 bottom-0 h-px bg-gradient-to-r from-transparent via-sky-400/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                </div>
                <div className="mt-1.5">
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
                                className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-transparent px-1.5 py-[6px] text-left text-slate-400 transition-colors duration-150 hover:bg-white/[0.045] hover:text-slate-100 lg:gap-2.5 lg:px-2.5 light-theme:text-gray-600 light-theme:hover:bg-black/[0.04] ${props.isDesktop ? 'justify-center lg:justify-start' : ''}`}
                            >
                                <ModelSelectIcon className="h-[18px] w-[18px] flex-shrink-0 text-violet-300" />
                                <span className={`truncate text-[12.5px] font-medium leading-none ${props.isDesktop ? 'hidden lg:inline' : ''}`}>
                                    {selectedModelLabel}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    props.setShowQuickModelSelector?.(false);
                                    props.onModelClick?.();
                                }}
                                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-violet-300 light-theme:text-gray-500 light-theme:hover:bg-black/[0.04] ${
                                    props.isDesktop ? 'md:hidden lg:inline-flex' : 'inline-flex'
                                }`}
                                title={`${selectedModelLabel} settings`}
                                aria-label={`Open ${selectedModelLabel} settings`}
                            >
                                <CogIcon className="h-[18px] w-[18px]" />
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
                                        <CogIcon className="h-[18px] w-[18px]" />
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

    // Desktop: the compact rail is the resting state. The expanded content stays
    // mounted through the width transition, then the rail swaps in.
    if (props.isDesktop) {
        const railOrder = getOrderedSidebarAgentKeys(agentOrderSidebar);

        const collapsedRail = (
            <>
                <button
                    type="button"
                    onClick={() => setIsCollapsedByUser(false)}
                    className={`flex h-11 w-full flex-shrink-0 items-center justify-center border-b border-white/[0.06] text-slate-300 transition-colors hover:bg-white/[0.07] hover:text-cyan-200 light-theme:border-gray-300 light-theme:text-gray-500 light-theme:hover:bg-black/[0.04] ${
                        sidebarIntroPulse ? 'sidebar-intro-flash' : ''
                    }`}
                    title="Show agent panel"
                    aria-label="Show agent panel"
                >
                    <ChevronDoubleRightIcon className="h-[18px] w-[18px]" />
                </button>
                <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto scrollbar-hide px-1.5 py-2">
                    {railOrder.map(agentKey => {
                        if (retiredAgents.includes(agentKey)) return null;
                        const config = agentConfig[agentKey];
                        if (!config) return null;
                        const Icon = config.icon;
                        const hexColor = agentThemeColors[agentKey] || '#94a3b8';
                        const rgbColor = hexToRgb(hexColor);
                        const isActive = activeAgent === agentKey;
                        return (
                            <button
                                key={agentKey}
                                type="button"
                                onClick={() => onAgentChange(agentKey)}
                                title={config.label}
                                aria-label={config.label}
                                className={`relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md transition-colors ${
                                    isActive ? 'text-white' : 'hover:bg-white/[0.06] light-theme:hover:bg-black/[0.04]'
                                }`}
                                style={isActive ? {
                                    background: `linear-gradient(150deg, rgba(${rgbColor},0.22), rgba(${rgbColor},0.05))`,
                                    boxShadow: `inset 0 0 0 1px rgba(${rgbColor},0.32)`,
                                } : undefined}
                            >
                                <Icon className="h-[18px] w-[18px]" style={{ color: isActive ? hexColor : `rgba(${rgbColor},0.8)` }} />
                                {isActive && (
                                    <span
                                        className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full"
                                        style={{ backgroundColor: hexColor }}
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>
            </>
        );

        return (
            <aside
                ref={sidebarRef}
                style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}
                className={`relative flex flex-shrink-0 flex-col overflow-hidden border-r border-white/[0.07] bg-[#0a0f16] transition-[width] duration-700 ease-in-out ${
                    isCollapsed ? 'w-12' : 'w-20 lg:w-[var(--sidebar-width)]'
                } light-theme:border-gray-300 light-theme:bg-gray-100`}
                onTransitionEnd={(event) => {
                    if (event.target !== event.currentTarget || event.propertyName !== 'width') return;
                    window.dispatchEvent(new Event(AGENT_SIDEBAR_LAYOUT_EVENT));
                }}
            >
                {isCollapsed && showCollapsedRail ? collapsedRail : sidebarContent}
                {!isCollapsed && (
                    <div
                        data-testid="agent-sidebar-resize-handle"
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Resize agent panel"
                        title="Drag to resize agent panel"
                        onMouseDown={handleSidebarResizeMouseDown}
                        className="group absolute -right-[3px] top-0 z-30 hidden h-full w-[7px] cursor-col-resize lg:block"
                    >
                        <span
                            aria-hidden="true"
                            className={`pointer-events-none absolute left-1/2 top-1/2 flex w-[5px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border shadow-[0_2px_10px_rgba(0,0,0,0.5)] transition-all duration-150 light-theme:bg-white ${
                                isResizingSidebar
                                    ? 'h-16 border-cyan-300/70 bg-cyan-400/20'
                                    : 'h-14 border-white/15 bg-[#0b1119]/90 group-hover:h-16 group-hover:border-cyan-300/60 group-hover:bg-cyan-400/15'
                            }`}
                        >
                            <span
                                className={`h-7 w-px rounded-full transition-colors light-theme:bg-gray-400 ${
                                    isResizingSidebar ? 'bg-cyan-200' : 'bg-white/35 group-hover:bg-cyan-200/90'
                                }`}
                            />
                        </span>
                    </div>
                )}
            </aside>
        );
    }
    
    // Mobile view
    return (
        <div className={`fixed inset-0 z-40 transform transition-transform duration-300 md:hidden ${props.isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="absolute inset-0 bg-gray-900/50" onClick={() => props.setIsMobileMenuOpen(false)}></div>
            <aside className="relative flex h-full w-[264px] flex-col border-r border-white/[0.07] bg-[#0a0f16] light-theme:border-gray-300 light-theme:bg-gray-100">
                {sidebarContent}
            </aside>
        </div>
    );
};