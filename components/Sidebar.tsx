// FUTURE GEMINI: This is the Sidebar component. It is a core navigation element.
// - Its responsive behavior (full sidebar on desktop, slide-out menu on mobile) is CRITICAL. Do not change this without explicit instruction.
// - The `agentConfig` object is the single source of truth for agent icons, labels, and colors. When adding a new agent, add it to `agentConfig`.
// - The `SidebarButton` and `NavButton` components define the consistent look and feel of all menu items. Maintain this consistency.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AgentType, useAgent, useUI } from '../types.ts';
import { StormwaterIcon, DirtVolumeIcon } from './icons.tsx';
import { useExperimentalAgentEnabled } from '../hooks/useExperimentalAgentEnabled.ts';
import { 
    BrainCircuitIcon, CourthouseIcon, RoadIcon, RedlineIcon, PlumbBobIcon, BookOpenIcon,
    MapIcon, EraserIcon, XMarkIcon,
    DocumentDuplicateIcon,
    LsvzIcon, DxfAnalyzerIcon, AdjustmentsHorizontalIcon, FolderIcon, DocumentTextIcon, CrosshairsIcon, CogoIcon, ScaleIcon, CameraIcon, GlobeAltIcon,
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
    ChevronDoubleRightIcon,
    ChevronLeftIcon,
} from './icons.tsx';
import { getRetiredAgents } from '../utils/retiredAgents.ts';
import { getGlobalSettings, subscribeGlobalSettings } from '../utils/globalSettings.ts';
import { AGENT_SIDEBAR_LAYOUT_EVENT } from '../utils/layoutEvents.ts';

interface SidebarProps {
    isMobileMenuOpen: boolean;
    setIsMobileMenuOpen: (isOpen: boolean) => void;
    isDesktop: boolean;
    /** Height reserved at the bottom for the command bar and an open quick thought. */
    bottomInset?: number;
    isLoading: boolean;
    /** Desktop header navigation — the workspace Back / Home controls live in the rail. */
    canGoBack?: boolean;
    onGoBack?: () => void;
    onGoHome?: () => void;
    /** Reports the desktop rail's collapsed state so the canvas header can take over Back/Home. */
    onCollapsedChange?: (collapsed: boolean) => void;
    /**
     * Surface an experimental agent's opt-in chip in Quick Thought instead of
     * opening Settings. Falls back to Settings when not provided.
     */
    onExperimentalAgentPrompt?: (agent: AgentType) => void;
}

const SIDEBAR_DEFAULT_WIDTH = 264;
const SIDEBAR_MIN_WIDTH = 208;
const SIDEBAR_MAX_WIDTH = 420;
const SIDEBAR_WIDTH_STORAGE_KEY = 'landsurv-agent-sidebar-width';
const SIDEBAR_INTRO_STORAGE_KEY = 'landsurv.agent-sidebar-intro.v1';
const SIDEBAR_INTRO_VISIBLE_MS = 2200;
const SIDEBAR_TRANSITION_MS = 700;

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
    [AgentType.STORMWATER_AGENT]: { icon: StormwaterIcon, label: 'Stormwater Agent', color: 'sky' },
    [AgentType.DIRT_VOLUME_AGENT]: { icon: DirtVolumeIcon, label: 'Dirt Volume Agent', color: 'amber' },
    [AgentType.REDLINE_AGENT]: { icon: RedlineIcon, label: 'Redline Agent', color: 'red' },
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
    [AgentType.STORMWATER_AGENT]: '#38bdf8', // sky-400
    [AgentType.REDLINE_AGENT]: '#ef4444', // red-500
    [AgentType.DIRT_VOLUME_AGENT]: '#d97706', // amber-600
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
const SidebarButton = ({ agent, isDesktop, isActive, isThinking, isExperimentalOff = false, onSelect }: {
    agent: AgentType;
    isDesktop: boolean;
    isActive: boolean;
    isThinking: boolean;
    isExperimentalOff?: boolean;
    onSelect: (agent: AgentType) => void;
}) => {
    const config = agentConfig[agent];
    if (!config) return null;
    const isLocked = isExperimentalOff;

    const hexColor = agentThemeColors[agent] || '#94a3b8'; // slate-400 fallback
    const rgbColor = hexToRgb(hexColor);
    const Icon = config.icon;

    return (
        <div className="relative has-tooltip">
            <button
                type="button"
                onClick={() => onSelect(agent)}
                title={isLocked ? `${config.label} — Experimental; enable in Settings` : config.label}
                className={`group relative flex w-full items-center gap-1.5 rounded-md border px-1.5 py-[6px] text-left transition-colors duration-150 lg:gap-2.5 lg:px-2.5 ${
                    isDesktop ? 'justify-center lg:justify-start' : ''
                } ${
                    isActive
                        ? 'border-transparent text-white'
                        : 'border-transparent text-slate-400 hover:bg-white/[0.045] hover:text-slate-100 light-theme:text-gray-600 light-theme:hover:bg-black/[0.04] light-theme:hover:text-gray-900'
                } ${isLocked ? 'opacity-60 hover:opacity-100' : ''}`}
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
                <span className={`truncate text-[12.5px] font-medium leading-none ${isDesktop ? 'hidden lg:inline' : ''} ${isThinking ? 'animate-thinking-red-text' : ''}`}>
                    {config.label}
                    {isLocked && <span className="ml-1 text-[9px] font-bold uppercase tracking-wide text-amber-300/80">Off</span>}
                </span>
                {isActive && (
                    <span
                        className="ml-auto hidden h-1.5 w-1.5 flex-shrink-0 rounded-full lg:block"
                        style={{ backgroundColor: hexColor, boxShadow: `0 0 8px rgba(${rgbColor},0.75)` }}
                    />
                )}
            </button>
            <div className={`tooltip ${isDesktop ? 'invisible absolute left-full ml-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-gray-900 text-white text-sm rounded-md shadow-lg opacity-0 transform -translate-x-2 transition-all duration-200 md:inline lg:hidden' : 'hidden'} light-theme:bg-gray-700 light-theme:text-gray-100`}>
                {isLocked ? `${config.label} — Experimental (click to enable in Settings)` : config.label}
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

export const Sidebar = (props: SidebarProps): React.ReactElement => {
    const { activeAgent, onAgentChange } = useAgent();
    const experimentalRoadingEnabled = useExperimentalAgentEnabled(AgentType.ROADING_AGENT);
    const experimentalStormwaterEnabled = useExperimentalAgentEnabled(AgentType.STORMWATER_AGENT);
    const experimentalRedlineEnabled = useExperimentalAgentEnabled(AgentType.REDLINE_AGENT);
    const { activeVisualPanel, showSettings } = useUI();

    const handleAgentSelect = (agent: AgentType) => {
        if (
            (agent === AgentType.ROADING_AGENT && !experimentalRoadingEnabled) ||
            (agent === AgentType.STORMWATER_AGENT && !experimentalStormwaterEnabled) ||
            (agent === AgentType.REDLINE_AGENT && !experimentalRedlineEnabled)
        ) {
            if (props.onExperimentalAgentPrompt) props.onExperimentalAgentPrompt(agent);
            else showSettings();
            return;
        }
        onAgentChange(agent);
    };
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

    // While the agent rail is closed, the workspace Back/Home controls slide
    // out into the canvas header bar instead of disappearing with the menu.
    useEffect(() => {
        props.onCollapsedChange?.(isCollapsed);
    }, [isCollapsed, props.onCollapsedChange]);

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
                <div className={`flex h-14 items-center gap-1.5 px-3 ${props.isDesktop ? 'justify-start' : 'justify-between'}`}>
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
                    <div className="flex min-w-0 items-center gap-1.5">
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
                        <div className="ml-auto flex flex-shrink-0 items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => props.onGoHome?.()}
                                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-cyan-300 light-theme:text-gray-500 light-theme:hover:bg-black/[0.04]"
                                title="Go to Home Screen"
                                aria-label="Go to Home Screen"
                            >
                                <HomeIcon className="h-[18px] w-[18px]" />
                            </button>
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
                        </div>
                    )}
                </div>

            </div>

            <nav className="min-h-0 flex-grow overflow-y-auto px-2 pb-2 scrollbar-hide">
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
                                        isExperimentalOff={
                                            (agent === AgentType.ROADING_AGENT && !experimentalRoadingEnabled) ||
                                            (agent === AgentType.STORMWATER_AGENT && !experimentalStormwaterEnabled) ||
            (agent === AgentType.REDLINE_AGENT && !experimentalRedlineEnabled)
                                        }
                                        onSelect={handleAgentSelect}
                                    />
                                );
                            });
                        })()}
                    </div>
            </nav>
        </>
    );

    // Desktop: the compact rail is the resting state. The expanded content stays
    // mounted through the width transition, then the rail swaps in.
    if (props.isDesktop) {
        const railOrder = getOrderedSidebarAgentKeys(agentOrderSidebar);

        const collapsedRail = (
            <>
                <div className="flex h-14 w-full flex-shrink-0 items-center justify-center border-b border-white/[0.06] light-theme:border-gray-300">
                    <button
                        type="button"
                        onClick={() => setIsCollapsedByUser(false)}
                        className={`flex h-8 w-8 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-white/[0.07] hover:text-cyan-200 light-theme:text-gray-500 light-theme:hover:bg-black/[0.04] ${
                            sidebarIntroPulse ? 'sidebar-intro-flash' : ''
                        }`}
                        title="Show agent panel"
                        aria-label="Show agent panel"
                    >
                        <ChevronDoubleRightIcon className="h-[18px] w-[18px]" />
                    </button>
                </div>
                <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto scrollbar-hide px-1.5 py-2">
                    {railOrder.map(agentKey => {
                        if (retiredAgents.includes(agentKey)) return null;
                        const config = agentConfig[agentKey];
                        if (!config) return null;
                        const Icon = config.icon;
                        const hexColor = agentThemeColors[agentKey] || '#94a3b8';
                        const rgbColor = hexToRgb(hexColor);
                        const isActive = activeAgent === agentKey;
                        const isExperimentalOff =
                            (agentKey === AgentType.ROADING_AGENT && !experimentalRoadingEnabled) ||
                            (agentKey === AgentType.STORMWATER_AGENT && !experimentalStormwaterEnabled) ||
                            (agentKey === AgentType.REDLINE_AGENT && !experimentalRedlineEnabled);
                        return (
                            <button
                                key={agentKey}
                                type="button"
                                onClick={() => handleAgentSelect(agentKey)}
                                title={isExperimentalOff ? `${config.label} — Experimental; click to enable in Settings` : config.label}
                                aria-label={isExperimentalOff ? `${config.label} — Experimental; enable in Settings` : config.label}
                                className={`relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md transition-colors ${
                                    isActive ? 'text-white' : 'hover:bg-white/[0.06] light-theme:hover:bg-black/[0.04]'
                                } ${isExperimentalOff ? 'opacity-60 hover:opacity-100' : ''}`}
                                style={isActive ? {
                                    background: `linear-gradient(150deg, rgba(${rgbColor},0.22), rgba(${rgbColor},0.05))`,
                                    boxShadow: `inset 0 0 0 1px rgba(${rgbColor},0.32)`,
                                } : undefined}
                            >
                                <Icon className="h-[18px] w-[18px]" style={{ color: isActive ? hexColor : `rgba(${rgbColor},0.8)` }} />
                                {isExperimentalOff && (
                                    <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
                                )}
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
                style={{
                    '--sidebar-width': `${sidebarWidth}px`,
                    // Stop above the command bar (and an open quick thought) so the
                    // bar reads edge-to-edge; expand back down when the card closes.
                    height: props.bottomInset && props.bottomInset > 0
                        ? `calc(100% - ${props.bottomInset}px)`
                        : undefined,
                } as React.CSSProperties}
                className={`relative z-40 flex flex-shrink-0 flex-col overflow-hidden border-r border-white/[0.07] bg-[#0a0f16] transition-[width] duration-700 ease-in-out ${
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
        <div className={`fixed inset-0 z-[60] transform transition-transform duration-300 md:hidden ${props.isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="absolute inset-0 bg-gray-900/50" onClick={() => props.setIsMobileMenuOpen(false)}></div>
            <aside className="relative flex h-full w-[264px] flex-col border-r border-white/[0.07] bg-[#0a0f16] light-theme:border-gray-300 light-theme:bg-gray-100">
                {sidebarContent}
            </aside>
        </div>
    );
};