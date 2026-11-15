import React, { useEffect, useRef, useState } from 'react';
import {
  XMarkIcon,
  YouTubeIcon,
  FacebookIcon,
  LinkedInIcon,
  GitHubIcon
} from './icons';
import '@fontsource-variable/inter';
import { getHolidayTheme } from './InitialAgentSelection';
import FreeCadNoSignatureGate from './FreeCadNoSignatureGate.tsx';
import type { FreeCadTrialSnapshot, TrialAcceptanceRecord } from '../services/freeCadTrial.ts';
import { AgentType } from '../types.ts';
import { agentThemeColors } from '../constants/agents.ts';

export type WelcomeMode = 'main' | 'free-code';

const FOOTER_LINK_CLASS = 'flex min-h-8 items-center justify-center whitespace-nowrap border-slate-700/70 px-4 py-2 text-center text-[11px] font-medium tracking-[0.01em] text-slate-400 transition-colors hover:bg-slate-800/50 hover:text-white focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-cyan-400/70 light-theme:border-gray-200 light-theme:text-gray-600 light-theme:hover:bg-gray-100 light-theme:hover:text-gray-900';

const FOOTER_SITE_LINKS = [
  { label: 'Sitemap', href: 'https://sitemap.landsurv.ai' },
  { label: 'TOS', href: 'https://tos.landsurv.ai' },
  { label: 'Legal', href: 'https://legal.landsurv.ai' },
  { label: 'Privacy', href: 'https://privacy.landsurv.ai' },
];

const FOOTER_POLICY_LINKS = [
  { label: 'Standards', href: 'https://standards.landsurv.ai' },
  { label: 'DPA', href: 'https://dpa.landsurv.ai' },
  { label: 'Subprocessors', href: 'https://subprocessors.landsurv.ai' },
  { label: 'Compliance', href: 'https://compliance.landsurv.ai' },
];

const FREE_DETAIL_COPY = (
  <>
    <span className="block font-semibold text-cyan-200 light-theme:text-cyan-800">Free CAD — try the workspace</span>
    <span className="mt-1 block">
      Open a drawing and get to work. Lay out points, draw lines and parcels, and work through
      bearings and distances with the built-in assistant at your side. Bring in FEMA flood maps,
      soils, and parcel lines while you draft. No account and no signature — accept the trial
      terms and start. The assistant is for trial use only — not for business or client work.
      You get 20 questions for the assistant on this device, and up to 5 can process deeds. Ground surfaces, print-ready sheets, and files for other drafting programs
      are included. Once the questions are used, keep drawing, editing, and saving; only the
      assistant pauses.
    </span>
  </>
);

const BUSINESS_DETAIL_COPY = (
  <>
    <span className="block font-semibold text-cyan-200 light-theme:text-cyan-800">Business CAD — the full workspace</span>
    <span className="mt-1 block">
      The whole job in one place. Draft points, lines, and parcels; bring in FEMA flood maps,
      soils, and parcel lines; build ground surfaces; draw deeds; and produce print-ready
      sheets. Ask the built-in assistant as often as you need, and move files to other drafting
      programs when you are done. A quick review and signature of the terms opens it. Your work
      carries over from Free CAD.
    </span>
  </>
);

const DEFAULT_AGENTIC_COPY = 'Open a drawing workspace built for land surveyors. Draft points, lines, and parcels; bring in FEMA flood maps, soils, and parcel lines; draw deeds; and keep the whole job together from the first point to the finished sheet. The built-in assistant is there whenever you need a hand.';

type WelcomeChoice =
  | { label: string; action: 'home' | 'deeds' | 'open-source' }
  | { label: string; agent: AgentType };

const WELCOME_CHOICES: WelcomeChoice[] = [
  { label: 'Home', action: 'home' },
  { label: 'Plot Deeds', action: 'deeds' },
  { label: 'Plot Points', agent: AgentType.POINT_EDITOR },
  { label: 'Contouring', agent: AgentType.CONTOURING_AGENT },
  { label: 'Plot FEMA', agent: AgentType.FLOOD_AGENT },
  { label: 'Plot Soils', agent: AgentType.SOILS_AGENT },
  { label: 'Plot GIS', agent: AgentType.GIS_AGENT },
  { label: 'Plot Parcels', agent: AgentType.DEED_READER },
  { label: 'Slope Analysis', agent: AgentType.STEEP_SLOPE_AGENT },
  { label: 'Stationing', agent: AgentType.CENTERLINE_STATIONING },
  { label: 'Profiling', agent: AgentType.PROFILE_AGENT },
  { label: 'Zoning', agent: AgentType.ZONING_AGENT },
  { label: 'Rover', agent: AgentType.GPS_STAKEOUT },
  { label: 'Dirt Volume', agent: AgentType.DIRT_VOLUME_AGENT },
  { label: 'Mapping', agent: AgentType.LSVZ_AGENT },
  { label: 'Agentic Drafting', agent: AgentType.CIVIL_DRAFTER },
  { label: 'Open Source', action: 'open-source' },
];

const choiceColor = (choice: WelcomeChoice): string => {
  if ('agent' in choice) return agentThemeColors[choice.agent] ?? '#22d3ee';
  if (choice.action === 'home') return '#ef4444';
  if (choice.action === 'deeds') return agentThemeColors[AgentType.DEED_READER] ?? '#34d399';
  return '#f59e0b';
};

const isTouchUi = (): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(hover: none)').matches;
  } catch {
    return false;
  }
};

export interface WelcomeScreenProps {
  onClose: () => void;
  version: string;
  onLaunchAgenticCad?: (mode?: 'blank' | 'sample' | 'existing') => void;
  onGoHome?: () => void;
  /** Opens the deed upload screen (Boundary Agent input) directly. */
  onOpenDeedUpload?: () => void;
  /** Opens a specific agent workspace from a compact destination choice. */
  onSelectAgent?: (agent: AgentType) => void;
  /** Free deeds left on this device (fingerprint ledger); null while loading. */
  freeDeedsRemaining?: number | null;
  /** Total free deeds granted per device. */
  freeDeedsLimit?: number;
  /** True when the user holds a key and deeds are not metered. */
  freeDeedsUnlimited?: boolean;
  hasExistingPoints?: boolean;
  existingPointCount?: number;
  initialMode?: WelcomeMode;
  /** 'free' means the workspace is currently a trial; 'business' means the full path. */
  cadEntryMode?: 'unset' | 'free' | 'business';
  /** Signed devices never see Free CAD. */
  hasLegalSignature?: boolean;
  /** True when the device already accepted the current trial terms. */
  trialAccepted?: boolean;
  trialSnapshot?: FreeCadTrialSnapshot | null;
  onStartFreeCad?: () => void;
  onStartBusinessCad?: () => void;
  onTrialTermsAccepted?: (record: TrialAcceptanceRecord) => void;
  /** A blocked trial capability asked the welcome to highlight Business CAD. */
  onRequestBusiness?: (feature: 'deed', notice: string) => void;
  blockNotice?: string | null;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onClose,
  version,
  onLaunchAgenticCad,
  onGoHome,
  onOpenDeedUpload,
  onSelectAgent,
  hasExistingPoints = false,
  existingPointCount = 0,
  initialMode = 'main',
  hasLegalSignature = false,
  trialAccepted = false,
  trialSnapshot = null,
  onStartFreeCad,
  onStartBusinessCad,
  onTrialTermsAccepted,
  onRequestBusiness,
  blockNotice = null,
}) => {
  const [mode, setMode] = useState<WelcomeMode>(initialMode);
  const [zelleRevealed, setZelleRevealed] = useState(false);
  const [activePathDetail, setActivePathDetail] = useState<'free' | 'business' | null>(null);
  const [selectedPath, setSelectedPath] = useState<'free' | 'business' | null>(null);
  const [showTrialStep, setShowTrialStep] = useState(false);
  const descriptionRef = useRef<HTMLParagraphElement | null>(null);
  const choiceGroupRef = useRef<HTMLDivElement | null>(null);
  const choiceButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const choiceLensFrameRef = useRef<number | null>(null);
  const choiceLensPointRef = useRef<{ x: number; y: number } | null>(null);

  // Keep the card height fixed while the hover/focus copy changes. If the copy
  // overflows, drift it slowly instead of resizing the whole welcome card.
  useEffect(() => {
    const element = descriptionRef.current;
    if (!element) return;
    element.scrollTop = 0;
    if (element.scrollHeight <= element.clientHeight + 2) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    const maxScroll = element.scrollHeight - element.clientHeight;
    const duration = 12000;
    const timer = window.setTimeout(() => {
      const startedAt = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        element.scrollTop = maxScroll * progress;
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, 650);

    return () => {
      clearTimeout(timer);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [activePathDetail]);

  const resetQuickChoiceLens = () => {
    for (const button of choiceButtonRefs.current) {
      if (!button) continue;
      button.style.removeProperty('--welcome-choice-scale');
      button.style.removeProperty('--welcome-choice-lift');
      button.style.zIndex = '';
    }
  };

  const updateQuickChoiceLens = () => {
    const point = choiceLensPointRef.current;
    if (!point) return;

    for (const button of choiceButtonRefs.current) {
      if (!button) continue;
      const width = button.offsetWidth;
      const height = button.offsetHeight;
      if (!width || !height) continue;

      const offsetParent = button.offsetParent as HTMLElement | null;
      const parentRect = offsetParent?.getBoundingClientRect();
      const left = (parentRect?.left ?? 0) - (offsetParent?.scrollLeft ?? 0) + (offsetParent?.clientLeft ?? 0) + button.offsetLeft;
      const top = (parentRect?.top ?? 0) - (offsetParent?.scrollTop ?? 0) + (offsetParent?.clientTop ?? 0) + button.offsetTop;
      const dx = point.x - (left + width / 2);
      const dy = point.y - (top + height / 2);
      const radiusX = Math.max(38, width * 0.9);
      const radiusY = Math.max(14, height * 0.8);
      const influence = Math.exp(-0.5 * ((dx / radiusX) ** 2 + (dy / radiusY) ** 2));

      button.style.setProperty('--welcome-choice-scale', (1 + influence * 0.36).toFixed(3));
      button.style.setProperty('--welcome-choice-lift', `${(-influence * 1.5).toFixed(2)}px`);
      button.style.zIndex = influence > 0.02 ? String(10 + Math.round(influence * 100)) : '';
    }
  };

  const handleQuickChoicePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    if (document.documentElement.getAttribute('data-reduced-motion') === 'true') {
      if (choiceLensFrameRef.current !== null) {
        window.cancelAnimationFrame(choiceLensFrameRef.current);
        choiceLensFrameRef.current = null;
      }
      resetQuickChoiceLens();
      return;
    }

    choiceLensPointRef.current = { x: event.clientX, y: event.clientY };
    if (choiceLensFrameRef.current !== null) return;
    choiceLensFrameRef.current = window.requestAnimationFrame(() => {
      choiceLensFrameRef.current = null;
      updateQuickChoiceLens();
    });
  };

  const handleQuickChoicePointerLeave = () => {
    if (choiceLensFrameRef.current !== null) {
      window.cancelAnimationFrame(choiceLensFrameRef.current);
      choiceLensFrameRef.current = null;
    }
    choiceLensPointRef.current = null;
    resetQuickChoiceLens();
  };

  useEffect(() => () => {
    if (choiceLensFrameRef.current !== null) {
      window.cancelAnimationFrame(choiceLensFrameRef.current);
    }
  }, []);

  // Check for holiday theme
  const holidayTheme = getHolidayTheme();
  const isChristmasSeason = holidayTheme === 'christmas';

  const isSigned = Boolean(hasLegalSignature);
  const trialUsed = trialSnapshot?.used;

  const startFreeCad = () => {
    if (isSigned) {
      onStartBusinessCad?.();
      return;
    }
    if (trialAccepted) {
      onStartFreeCad?.();
      return;
    }
    setShowTrialStep(true);
    setActivePathDetail('free');
  };

  const startBusinessCad = () => {
    setShowTrialStep(false);
    onStartBusinessCad?.();
  };

  const handlePathChoose = (path: 'free' | 'business') => {
    if (isTouchUi() && selectedPath !== path) {
      setSelectedPath(path);
      setActivePathDetail(path);
      return;
    }
    if (path === 'free') startFreeCad();
    else startBusinessCad();
  };

  const closeTrialStep = () => {
    setShowTrialStep(false);
    setActivePathDetail(null);
    setSelectedPath(null);
  };

  const handleTrialStart = (record: TrialAcceptanceRecord) => {
    closeTrialStep();
    onTrialTermsAccepted?.(record);
  };

  const handleHomeClick = () => {
    if (onGoHome) {
      onGoHome();
    } else {
      onClose();
    }
  };

  const handleDeedDraftClick = () => {
    if (onOpenDeedUpload) {
      onOpenDeedUpload();
    } else {
      onClose();
    }
  };

  const handleChoiceClick = (choice: WelcomeChoice) => {
    if ('agent' in choice) {
      onSelectAgent?.(choice.agent);
      return;
    }
    if (choice.action === 'home') {
      handleHomeClick();
      return;
    }
    if (choice.action === 'deeds') {
      handleDeedDraftClick();
      return;
    }
    setMode('free-code');
  };

  return (
    <div
      onClick={onClose}
      className={`fixed inset-0 z-[20000] flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto animate-fade-in ${
        isChristmasSeason
          ? 'bg-gradient-to-b from-red-950/40 via-gray-950/85 to-green-950/40 backdrop-blur-md'
          : 'bg-gray-950/85 backdrop-blur-md'
      }`}
    >
      {/* Modal Dialog Card */}
      <div
        onClick={e => e.stopPropagation()}
        className="bg-slate-950 border border-slate-700/80 rounded-xl shadow-[0_24px_70px_rgba(0,0,0,0.85)] max-w-3xl w-full flex flex-col my-auto max-h-[92vh] animate-modal-panel-fade-in-down light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-800 text-gray-200 relative overflow-hidden antialiased"
        style={{ fontFamily: "'Inter Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}
      >
        {/* Subtle 2px Top Specular Line */}
        <div className="h-[2px] w-full bg-cyan-500/70 shrink-0" />

        {/* Subtle Architectural CAD Reticle Watermark */}
        <svg
          className="pointer-events-none absolute -right-12 -top-12 h-56 w-56 text-cyan-400/[0.04] light-theme:text-cyan-700/[0.04]"
          viewBox="0 0 100 100"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="50" cy="50" r="42" stroke="currentColor" strokeWidth="0.6" strokeDasharray="3 2" />
          <circle cx="50" cy="50" r="28" stroke="currentColor" strokeWidth="0.6" />
          <circle cx="50" cy="50" r="14" stroke="currentColor" strokeWidth="0.6" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" strokeWidth="0.5" />
          <line x1="50" y1="0" x2="50" y2="100" stroke="currentColor" strokeWidth="0.5" />
        </svg>

        {/* Top Header */}
        <header className="relative flex items-center justify-between px-5 py-4 sm:px-7 sm:py-4 border-b border-slate-800/90 bg-slate-950 shrink-0 light-theme:bg-gray-50/80 light-theme:border-gray-200">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {mode !== 'main' && (
              <button
                type="button"
                onClick={() => setMode('main')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-300 bg-slate-900 hover:bg-slate-800 hover:text-white border border-slate-700 transition light-theme:bg-gray-200 light-theme:text-gray-700 light-theme:hover:bg-gray-300"
                title="Back to Welcome Destinations"
              >
                <span>&larr; Back</span>
              </button>
            )}

            <div className="flex items-baseline gap-3 min-w-0">
              <h1 className="shrink-0 whitespace-nowrap text-xl sm:text-2xl font-extrabold tracking-tighter text-white light-theme:text-gray-900">
                Land<span className="text-cyan-400">Surv</span><span className="text-green-400">.ai</span>
                <sup className="ml-0.5 text-[0.55em] font-medium leading-none tracking-normal text-gray-400 light-theme:text-gray-500">™</sup>
              </h1>
              <span className="hidden sm:inline-block text-slate-700 select-none" aria-hidden="true">/</span>
              <span className="hidden sm:inline-block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 light-theme:text-gray-500 truncate">
                AI Surveying &amp; Civil Agentic CAD Suite
              </span>
              <span className="font-mono text-[10px] sm:text-xs font-medium tracking-wide text-slate-500 light-theme:text-gray-500 whitespace-nowrap">
                v{version}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-lg text-gray-400 hover:text-white hover:bg-slate-800 light-theme:hover:bg-gray-200 light-theme:hover:text-gray-900 transition"
              aria-label="Close Welcome Screen"
            >
              <XMarkIcon className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>
        </header>

        {/* Content Body */}
        <main className="relative flex-1 p-5 sm:p-7 overflow-y-auto space-y-5">
          {/* ============================================================== */}
          {/* MODE 1: MAIN NAVIGATION HUB                                     */}
          {/* ============================================================== */}
          {mode === 'main' && (
            <div className="space-y-5">
              {blockNotice && (
                <div
                  role="status"
                  className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-4 py-2.5 text-xs font-medium leading-relaxed text-cyan-200 light-theme:border-cyan-600 light-theme:bg-cyan-50 light-theme:text-cyan-900"
                >
                  {blockNotice}
                </div>
              )}

              {/* PRIMARY FEATURE CARD: Agentic CAD */}
              <div className="relative overflow-hidden rounded-lg border border-slate-800 bg-slate-900/60 p-5 sm:p-6 light-theme:bg-gray-50 light-theme:border-cyan-500">
                <span className="absolute inset-y-0 left-0 w-1 bg-cyan-400" aria-hidden="true" />
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 pl-2">
                    <div className="space-y-1.5">
                      <div className="flex items-baseline gap-3">
                        <h3 className="text-lg sm:text-xl font-bold text-white light-theme:text-gray-900 tracking-tight">
                          Agentic CAD
                        </h3>
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-400/90 light-theme:text-cyan-700">
                          Primary Workspace
                        </span>
                      </div>
                      <p
                        ref={descriptionRef}
                        className="welcome-copy-scroll h-[5.5rem] max-w-lg overflow-y-auto pr-1 text-sm leading-relaxed text-slate-300 light-theme:text-gray-600"
                      >
                        {activePathDetail === 'free' ? FREE_DETAIL_COPY
                          : activePathDetail === 'business' ? BUSINESS_DETAIL_COPY
                          : DEFAULT_AGENTIC_COPY}
                      </p>
                      {isTouchUi() && selectedPath && (
                        <p className="text-[11px] font-semibold text-cyan-300 light-theme:text-cyan-700">
                          Tap again to start {selectedPath === 'free' ? 'Free CAD' : 'Business CAD'}.
                        </p>
                      )}
                    </div>

                    <div className="flex w-full shrink-0 flex-col items-stretch gap-2 md:w-[280px]">
                      {!isSigned && (
                        <button
                          type="button"
                          onMouseEnter={() => setActivePathDetail('free')}
                          onMouseLeave={() => setActivePathDetail(null)}
                          onFocus={() => setActivePathDetail('free')}
                          onBlur={() => setActivePathDetail(null)}
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePathChoose('free');
                          }}
                          aria-label="Start Free CAD trial. No signature required. 20 assistant questions."
                          aria-describedby="free-cad-path-caption"
                          className="group/btn relative flex min-h-11 w-full items-center justify-between gap-3 overflow-visible rounded-lg border border-cyan-400/60 bg-slate-950 px-4 py-2.5 text-left text-sm font-semibold text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_6px_22px_-4px_rgba(6,182,212,0.3)] transition-all hover:border-cyan-300 hover:bg-slate-900 light-theme:bg-slate-900 light-theme:text-white"
                        >
                          <span className="free-cad-chase" aria-hidden="true" />
                          <span className="flex flex-col leading-tight">
                            <span>Free CAD</span>
                            <span id="free-cad-path-caption" className="text-[10px] font-normal text-slate-400">
                              No signature · 20 assistant questions · 5 deeds
                              {typeof trialUsed === 'number' ? ` · ${trialUsed} used` : ''}
                            </span>
                          </span>
                          <span className="text-cyan-400 transition-transform duration-200 group-hover/btn:translate-x-1" aria-hidden="true">&rarr;</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onMouseEnter={() => setActivePathDetail('business')}
                        onMouseLeave={() => setActivePathDetail(null)}
                        onFocus={() => setActivePathDetail('business')}
                        onBlur={() => setActivePathDetail(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePathChoose('business');
                        }}
                        aria-label={isSigned ? 'Open Business CAD. Terms signed.' : 'Open Business CAD. Review and sign the terms first.'}
                        aria-describedby="business-cad-path-caption"
                        className={`group/btn relative flex min-h-11 w-full items-center justify-between gap-3 overflow-hidden rounded-lg border bg-slate-950 px-4 py-2.5 text-left text-sm font-semibold text-white transition-all hover:bg-slate-900 light-theme:bg-slate-900 light-theme:text-white ${
                          blockNotice
                            ? 'border-cyan-300 ring-2 ring-cyan-300/70 ring-offset-2 ring-offset-slate-950 light-theme:ring-offset-white'
                            : 'border-cyan-400/60 hover:border-cyan-300'
                        } shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_6px_22px_-4px_rgba(6,182,212,0.3)]`}
                      >
                        <span className="flex flex-col leading-tight">
                          <span>Business CAD</span>
                          <span id="business-cad-path-caption" className="text-[10px] font-normal text-slate-400">
                            {isSigned ? 'Terms signed' : 'Review and sign terms'}
                          </span>
                        </span>
                        <span className="text-cyan-400 transition-transform duration-200 group-hover/btn:translate-x-1" aria-hidden="true">&rarr;</span>
                      </button>

                      {hasExistingPoints && isSigned && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onLaunchAgenticCad?.('existing');
                          }}
                          className="text-xs font-medium text-cyan-300/90 hover:text-cyan-200 underline-offset-4 hover:underline transition-colors light-theme:text-cyan-700"
                        >
                          Continue with {existingPointCount} existing point{existingPointCount !== 1 ? 's' : ''} &rarr;
                        </button>
                      )}
                  </div>
                </div>
              </div>

              {/* QUICK CHOICES: compact destinations */}
              <div
                ref={choiceGroupRef}
                role="group"
                aria-label="Quick choices"
                onPointerEnter={handleQuickChoicePointerMove}
                onPointerMove={handleQuickChoicePointerMove}
                onPointerLeave={handleQuickChoicePointerLeave}
                className="isolate flex flex-wrap gap-1.5"
              >
                {WELCOME_CHOICES.map((choice, index) => {
                  const color = choiceColor(choice);
                  return (
                    <button
                      key={choice.label}
                      ref={(node) => { choiceButtonRefs.current[index] = node; }}
                      type="button"
                      title={choice.label}
                      onClick={() => handleChoiceClick(choice)}
                      style={{
                        borderColor: `${color}55`,
                        flex: '1 1 6.25rem',
                        transform: 'translateY(var(--welcome-choice-lift, 0px)) scale(var(--welcome-choice-scale, 1))',
                      }}
                      className="group relative flex min-h-7 min-w-0 items-center justify-between gap-1.5 overflow-hidden rounded-md border bg-slate-900/45 py-0.5 pl-2.5 pr-2 text-left text-[10.5px] font-semibold text-white transition-all duration-150 will-change-transform hover:bg-slate-900/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/70 light-theme:bg-gray-50 light-theme:text-gray-900 light-theme:hover:bg-gray-100"
                    >
                      <span
                        className="absolute inset-y-0 left-0 w-0.5"
                        style={{ backgroundColor: color }}
                        aria-hidden="true"
                      />
                      <span className="truncate">{choice.label}</span>
                      <span
                        className="shrink-0 text-[10px] font-semibold transition-transform duration-150 group-hover:translate-x-0.5"
                        style={{ color }}
                        aria-hidden="true"
                      >
                        &rarr;
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* MODE 2: FREE CODE (OPEN SOURCE) & ZELLE SPLIT SCREEN            */}
          {/* ============================================================== */}
          {mode === 'free-code' && (
            <div className="space-y-5 animate-fade-in">
              <div className="space-y-1">
                <h3 className="text-xl font-semibold tracking-tight text-white light-theme:text-gray-900 flex items-center gap-2">
                  Open Source
                  <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 light-theme:text-emerald-700">Apache-2.0</span>
                </h3>
                <p className="text-sm text-gray-400 light-theme:text-gray-600 max-w-xl">
                  The core of LandSurv.ai is open source, free to use, study, and build on. You can help keep the project going with a small contribution.
                </p>
              </div>

              {/* SPLIT CONTAINER: 2 Columns */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
                {/* LEFT COLUMN: Open Source GitHub repo */}
                <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-5 flex flex-col justify-between space-y-4 light-theme:bg-gray-50 light-theme:border-gray-200">
                  <div className="space-y-3.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-base font-semibold text-white light-theme:text-gray-900">
                          landsurv-core
                        </h4>
                        <span className="text-xs text-gray-400">Public on GitHub</span>
                      </div>
                      <a
                        href="https://www.apache.org/licenses/LICENSE-2.0"
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Read the Apache License 2.0"
                        className="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-700/60 text-gray-300 hover:text-white hover:border-gray-400 border border-gray-600 transition-colors light-theme:bg-gray-200 light-theme:text-gray-700 light-theme:border-gray-300"
                      >
                        Apache-2.0
                      </a>
                    </div>

                    <div className="space-y-2 text-sm text-gray-300 light-theme:text-gray-700 leading-relaxed">
                      <p>
                        landsurv-core is free and open-source software (FOSS), usable for personal or commercial work at no cost. It includes the COGO/coordinate-geometry engine, boundary closure, DXF I/O, contouring/TIN, the CAD drawing canvas, point editor, and CAD Manager — runnable entirely locally with your own AI provider key (Gemini, OpenAI, Anthropic, or xAI).
                      </p>
                      <p>
                        The source code is public now — read exactly how it works, adapt it to your own workflow, and contribute improvements back to the community.
                      </p>
                      <p>
                        Released under the permissive Apache 2.0 license, which lets you use, modify, and distribute the software, including in commercial products, with very few restrictions.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    <a
                      href="https://github.com/LandSurvAi/landsurv-core"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2.5 px-4 rounded-md font-semibold text-sm text-white bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-900/40 transition-colors flex items-center justify-center"
                    >
                      View on GitHub
                    </a>
                  </div>
                </div>

                {/* RIGHT COLUMN: Michael Sersen Zelle Payment Card */}
                <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4 sm:p-5 flex flex-col items-center justify-between gap-3 light-theme:bg-gray-50 light-theme:border-gray-200">
                  <div className="text-center space-y-1">
                    <h4 className="text-base font-semibold text-white light-theme:text-gray-900">
                      Support the project
                    </h4>
                    <p className="text-sm text-gray-400 light-theme:text-gray-600 max-w-xs">
                      LandSurv.ai is built independently. If it saves you time, you can chip in with Zelle.
                    </p>
                  </div>

                  <div className="w-full max-w-xs" style={{ perspective: '1000px' }}>
                    {/* 3.5 turns lands on the back face; both faces share one grid cell so height fits the taller one */}
                    <div
                      className="grid"
                      style={{
                        transformStyle: 'preserve-3d',
                        transition: 'transform 1400ms cubic-bezier(0.22, 0.8, 0.3, 1)',
                        transform: zelleRevealed ? 'rotateY(1260deg)' : 'rotateY(0deg)',
                      }}
                    >
                      {/* Front: coin button */}
                      <button
                        type="button"
                        onClick={() => setZelleRevealed(true)}
                        aria-expanded={zelleRevealed}
                        tabIndex={zelleRevealed ? -1 : 0}
                        className="[grid-area:1/1] flex flex-col items-center justify-center gap-4 rounded-xl border border-gray-700 hover:border-amber-400/60 bg-gray-900/60 p-6 text-center transition-colors light-theme:bg-white light-theme:border-gray-300"
                        style={{ backfaceVisibility: 'hidden' }}
                      >
                        <span className="flex items-center justify-center w-24 h-24 rounded-full bg-amber-400 ring-4 ring-amber-300/30 text-5xl font-bold text-amber-900 shadow-lg">
                          $
                        </span>
                        <span className="text-sm font-semibold text-white light-theme:text-gray-900 leading-snug">
                          Click here to support open source software
                        </span>
                      </button>

                      {/* Back: Zelle card */}
                      <div
                        className="[grid-area:1/1] bg-white text-gray-900 rounded-xl p-4 shadow-lg flex flex-col items-center text-center"
                        style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                        aria-hidden={!zelleRevealed}
                      >
                        <h4 className="text-lg sm:text-xl font-extrabold text-[#7414CA] tracking-tight">
                          Send Money with Zelle<span className="text-xs">®</span>
                        </h4>
                        <p className="text-xs text-gray-600 mt-0.5">
                          Scan in your banking app to pay
                        </p>

                        <p className="text-base sm:text-lg font-bold text-gray-900 mt-2">
                          Michael Sersen
                        </p>

                        {/* QR Code Image */}
                        <div className="my-2 p-2 bg-white rounded-xl shadow-inner border border-gray-100 flex items-center justify-center">
                          <img
                            src="/zelle-qr.png"
                            alt="Zelle QR Code for Michael Sersen"
                            className="w-44 h-44 sm:w-48 sm:h-48 object-contain rounded-lg"
                          />
                        </div>

                        {/* Zelle Logo Style */}
                        <div className="mt-1 flex items-center justify-center">
                          <span className="text-[#7414CA] font-extrabold text-2xl tracking-tighter">
                            żelle<span className="text-xs align-top">®</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-gray-400 light-theme:text-gray-500 text-center max-w-xs">
                    Contributions go directly toward new features and upkeep. Thank you.
                  </p>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Footer Bar */}
        <footer className="px-4 py-3 sm:px-6 sm:py-3.5 bg-gray-950/40 border-t border-gray-800 shrink-0 light-theme:bg-gray-50 light-theme:border-gray-200">
          {mode === 'main' ? (
            <div className="flex w-full flex-col overflow-hidden rounded-md border border-slate-700/70 bg-slate-950/35 md:flex-row md:items-stretch light-theme:border-gray-300 light-theme:bg-white">
              <nav aria-label="Site links" className="grid min-w-0 flex-1 grid-cols-2">
                {FOOTER_SITE_LINKS.map((link, index) => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${FOOTER_LINK_CLASS} ${index % 2 === 0 ? 'border-r' : ''} ${index < 2 ? 'border-b' : ''}`}
                  >
                    {link.label}
                  </a>
                ))}
              </nav>

              {/* Community links — equal center column with crisp rules on both sides */}
              <div className="flex items-center justify-center gap-4 border-y border-slate-700/70 bg-slate-900/30 px-5 py-2 md:flex-1 md:basis-0 md:gap-3 md:border-x md:border-y-0 light-theme:border-gray-200 light-theme:bg-gray-50">
                <a
                  href="https://www.youtube.com/@LandSurvAI"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md p-1.5 text-red-500 transition-all hover:scale-110 hover:text-red-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/70"
                  title="Watch tutorials on YouTube"
                  aria-label="LandSurv.ai on YouTube"
                >
                  <YouTubeIcon className="w-5 h-5" />
                </a>
                <a
                  href="https://www.facebook.com/profile.php?id=61583326114422"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md p-1.5 text-[#1877F2] transition-all hover:scale-110 hover:text-[#4a9bff] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/70"
                  title="Join our Facebook community"
                  aria-label="LandSurv.ai on Facebook"
                >
                  <FacebookIcon className="w-5 h-5" />
                </a>
                <a
                  href="https://www.linkedin.com/in/michael-sersen-b710a2320/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md p-1.5 text-[#0A66C2] transition-all hover:scale-110 hover:text-[#3b8fd6] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/70"
                  title="Connect with Michael Sersen on LinkedIn"
                  aria-label="Michael Sersen on LinkedIn"
                >
                  <LinkedInIcon className="w-5 h-5" />
                </a>
                <a
                  href="https://github.com/LandSurvAi/landsurv-core"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md p-1.5 text-gray-300 transition-all hover:scale-110 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/70 light-theme:text-gray-700 light-theme:hover:text-gray-900"
                  title="View the open-source landsurv-core project on GitHub"
                  aria-label="landsurv-core on GitHub"
                >
                  <GitHubIcon className="w-5 h-5" />
                </a>
              </div>

              <nav aria-label="Policy and standards links" className="grid min-w-0 flex-1 grid-cols-2">
                {FOOTER_POLICY_LINKS.map((link, index) => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${FOOTER_LINK_CLASS} ${index % 2 === 0 ? 'border-r' : ''} ${index < 2 ? 'border-b' : ''}`}
                  >
                    {link.label}
                  </a>
                ))}
              </nav>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={() => setMode('main')}
                className="px-4 py-2 font-semibold text-xs sm:text-sm text-gray-300 hover:text-white bg-gray-700/60 hover:bg-gray-700 rounded-lg transition light-theme:bg-gray-200 light-theme:text-gray-800 light-theme:hover:bg-gray-300"
              >
                Back to Welcome
              </button>
            </div>
          )}
        </footer>
      </div>
      <FreeCadNoSignatureGate
        isOpen={showTrialStep}
        onClose={closeTrialStep}
        onAccepted={handleTrialStart}
      />
    </div>
  );
};

export default WelcomeScreen;
