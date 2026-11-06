import React, { useState } from 'react';
import { 
  XMarkIcon, 
  YouTubeIcon, 
  FacebookIcon,
  LinkedInIcon
} from './icons';
import '@fontsource-variable/inter';
import { getHolidayTheme } from './InitialAgentSelection';

export type WelcomeMode = 'main' | 'free-code';

export interface WelcomeScreenProps {
  onClose: () => void;
  version: string;
  onLaunchAgenticCad?: (mode?: 'blank' | 'sample' | 'existing') => void;
  onGoHome?: () => void;
  /** Opens the deed upload screen (Boundary Agent input) directly. */
  onOpenDeedUpload?: () => void;
  /** Free deeds left on this device (fingerprint ledger); null while loading. */
  freeDeedsRemaining?: number | null;
  /** Total free deeds granted per device. */
  freeDeedsLimit?: number;
  /** True when the user holds a key and deeds are not metered. */
  freeDeedsUnlimited?: boolean;
  hasExistingPoints?: boolean;
  existingPointCount?: number;
  initialMode?: WelcomeMode;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ 
  onClose, 
  version,
  onLaunchAgenticCad,
  onGoHome,
  onOpenDeedUpload,
  freeDeedsRemaining = null,
  freeDeedsLimit = 5,
  freeDeedsUnlimited = false,
  hasExistingPoints = false,
  existingPointCount = 0,
  initialMode = 'main'
}) => {
  const [mode, setMode] = useState<WelcomeMode>(initialMode);
  const [zelleRevealed, setZelleRevealed] = useState(false);

  // Check for holiday theme
  const holidayTheme = getHolidayTheme();
  const isChristmasSeason = holidayTheme === 'christmas';

  const handleAgenticCadClick = () => {
    if (onLaunchAgenticCad) {
      onLaunchAgenticCad('blank');
    } else {
      onClose();
    }
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

            <div className="flex items-baseline gap-3 min-w-0 truncate">
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tighter text-white light-theme:text-gray-900 truncate">
                Land<span className="text-cyan-400">Surv</span><span className="text-green-400">.ai</span>
                <sup className="text-xs font-normal text-gray-500">™</sup>
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
              {/* PRIMARY FEATURE CARD: Agentic CAD */}
              <div 
                onClick={handleAgenticCadClick}
                className="group relative overflow-hidden rounded-lg border border-slate-800 hover:border-cyan-500/50 bg-slate-900/60 hover:bg-slate-900/90 p-5 sm:p-6 transition-all duration-200 cursor-pointer light-theme:bg-gray-50 light-theme:border-cyan-500 light-theme:hover:border-cyan-600"
              >
                <span className="absolute inset-y-0 left-0 w-1 bg-cyan-400" aria-hidden="true" />
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 pl-2">
                  <div className="space-y-1.5">
                    <div className="flex items-baseline gap-3">
                      <h3 className="text-lg sm:text-xl font-bold text-white light-theme:text-gray-900 tracking-tight group-hover:text-cyan-300 light-theme:group-hover:text-cyan-700 transition-colors">
                        Agentic CAD
                      </h3>
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-400/90 light-theme:text-cyan-700">
                        Primary Workspace
                      </span>
                    </div>
                    <p className="hidden sm:block text-sm text-slate-300 light-theme:text-gray-600 leading-relaxed max-w-lg">
                      Open the full CAD environment with the LSAI Agent in command: AI-assisted and manual drafting, COGO solvers, layer management, and Civil 3D sync, all connected to the active project.
                    </p>
                  </div>

                  <div className="shrink-0 flex flex-col items-stretch md:items-end gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAgenticCadClick();
                      }}
                      className="group/btn relative overflow-hidden px-5 py-2.5 rounded-lg font-semibold text-sm text-white bg-slate-950 hover:bg-slate-900 border border-cyan-400/60 hover:border-cyan-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_6px_22px_-4px_rgba(6,182,212,0.3)] transition-all flex items-center justify-center gap-2.5 light-theme:bg-slate-900 light-theme:text-white"
                    >
                      <span>Open CAD Environment</span>
                      <span className="text-cyan-400 transition-transform duration-200 group-hover/btn:translate-x-1" aria-hidden="true">&rarr;</span>
                    </button>
                    {hasExistingPoints && (
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

              {/* SECONDARY DESTINATIONS: Home, Draft Deed & Free Code */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Home Destination */}
                <div 
                  onClick={handleHomeClick}
                  className="group relative overflow-hidden rounded-lg border border-slate-800 hover:border-red-500/50 bg-slate-900/45 hover:bg-slate-900/80 p-4 sm:p-5 transition-all duration-150 cursor-pointer light-theme:bg-gray-50 light-theme:border-red-300 light-theme:hover:border-red-500 flex flex-col justify-between"
                >
                  <span className="absolute inset-y-0 left-0 w-1 bg-red-500" aria-hidden="true" />
                  <div className="space-y-1.5 pl-2">
                    <h4 className="text-base font-bold text-white light-theme:text-gray-900 group-hover:text-red-300 light-theme:group-hover:text-red-700 transition-colors">
                      Home
                    </h4>
                    <p className="hidden sm:block text-sm text-slate-400 light-theme:text-gray-600 leading-relaxed">
                      Browse the full suite of 24 specialized survey, GIS, GNSS, and civil drafting agents.
                    </p>
                  </div>
                  <p className="pl-2 pt-3 text-xs font-semibold text-red-400 group-hover:text-red-300 light-theme:text-red-700">
                    Explore Agent Directory &rarr;
                  </p>
                </div>

                {/* Draft Deed Destination */}
                <div 
                  onClick={handleDeedDraftClick}
                  className="group relative overflow-hidden rounded-lg border border-slate-800 hover:border-emerald-500/50 bg-slate-900/45 hover:bg-slate-900/80 p-4 sm:p-5 transition-all duration-150 cursor-pointer light-theme:bg-gray-50 light-theme:border-emerald-400 light-theme:hover:border-emerald-600 flex flex-col justify-between"
                >
                  <span className="absolute inset-y-0 left-0 w-1 bg-emerald-500" aria-hidden="true" />
                  <div className="space-y-1.5 pl-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-base font-bold text-white light-theme:text-gray-900 group-hover:text-emerald-300 light-theme:group-hover:text-emerald-700 transition-colors">
                        Draft Deed
                      </h4>
                      {!freeDeedsUnlimited && (
                        <span
                          className={`text-[10px] font-mono font-bold uppercase tracking-wider ${
                            (freeDeedsRemaining ?? freeDeedsLimit) > 0
                              ? 'text-emerald-400 light-theme:text-green-800'
                              : 'text-amber-300 light-theme:text-amber-800'
                          }`}
                        >
                          {`🎁 ${freeDeedsLimit} free deeds`}
                        </span>
                      )}
                    </div>
                    <p className="hidden sm:block text-sm text-slate-400 light-theme:text-gray-600 leading-relaxed">
                      Upload a deed PDF or paste a legal description and have the Boundary Agent draft the parcel.
                    </p>
                    {!freeDeedsUnlimited && (
                      <>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <span className="flex items-center gap-1" aria-hidden="true">
                            {Array.from({ length: freeDeedsLimit }).map((_, index) => (
                              <span
                                key={index}
                                className={`h-1.5 w-1.5 rounded-full ${
                                  index < (freeDeedsRemaining ?? freeDeedsLimit) ? 'bg-green-400' : 'bg-gray-600'
                                }`}
                              />
                            ))}
                          </span>
                          <p
                            className={`text-xs font-semibold ${
                              freeDeedsRemaining === null
                                ? 'text-gray-500 light-theme:text-gray-500'
                                : freeDeedsRemaining > 0
                                  ? 'text-green-300 light-theme:text-green-700'
                                  : 'text-amber-300 light-theme:text-amber-700'
                            }`}
                          >
                            {freeDeedsRemaining === null
                              ? `${freeDeedsLimit} free deeds included`
                              : freeDeedsRemaining > 0
                                ? `${freeDeedsRemaining} of ${freeDeedsLimit} free deeds remaining`
                                : 'Free deeds used — add a key to continue'}
                          </p>
                        </div>
                        <p className="pt-1 text-xs font-semibold text-emerald-400 group-hover:text-emerald-300 light-theme:text-green-700 light-theme:group-hover:text-green-800">
                          {freeDeedsRemaining === 0 ? 'Unlock unlimited →' : 'Start free →'}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {/* Free Code Destination */}
                <div 
                  onClick={() => setMode('free-code')}
                  className="group relative overflow-hidden rounded-lg border border-slate-800 hover:border-amber-500/50 bg-slate-900/45 hover:bg-slate-900/80 p-4 sm:p-5 transition-all duration-150 cursor-pointer light-theme:bg-gray-50 light-theme:border-amber-400 light-theme:hover:border-amber-600 flex flex-col justify-between"
                >
                  <span className="absolute inset-y-0 left-0 w-1 bg-amber-500" aria-hidden="true" />
                  <div className="space-y-1.5 pl-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <h4 className="text-base font-bold text-white light-theme:text-gray-900 group-hover:text-amber-300 light-theme:group-hover:text-amber-700 transition-colors">
                        Free Software
                      </h4>
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-400/90 light-theme:text-amber-800">
                        Apache-2.0
                      </span>
                    </div>
                    <p className="hidden sm:block text-sm text-slate-400 light-theme:text-gray-600 leading-relaxed">
                      Open-source software you can use, study, and build on, plus ways to support the project.
                    </p>
                  </div>
                  <p className="pl-2 pt-3 text-xs font-semibold text-amber-400 group-hover:text-amber-300 light-theme:text-amber-700">
                    View Open Source &amp; Support &rarr;
                  </p>
                </div>
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
                  Free Software
                  <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 light-theme:text-emerald-700">Now Open Source</span>
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
        <footer className="px-4 py-3 sm:px-6 bg-gray-950/40 border-t border-gray-800 shrink-0 light-theme:bg-gray-50 light-theme:border-gray-200">
          {mode === 'main' ? (
            <div className="flex flex-col items-center gap-2.5 md:grid md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-10">
              {/* Community links — centered in the fixed bar */}
              <div className="flex items-center justify-center gap-5 md:col-start-2 md:row-start-1">
                <a
                  href="https://www.youtube.com/@LandSurvAI"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-red-500 hover:text-red-400 hover:scale-110 transition-all"
                  title="Watch tutorials on YouTube"
                  aria-label="LandSurv.ai on YouTube"
                >
                  <YouTubeIcon className="w-5 h-5" />
                </a>
                <a
                  href="https://www.facebook.com/profile.php?id=61583326114422"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#1877F2] hover:text-[#4a9bff] hover:scale-110 transition-all"
                  title="Join our Facebook community"
                  aria-label="LandSurv.ai on Facebook"
                >
                  <FacebookIcon className="w-5 h-5" />
                </a>
                <a
                  href="https://www.linkedin.com/in/michael-sersen-b710a2320/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#0A66C2] hover:text-[#3b8fd6] hover:scale-110 transition-all"
                  title="Connect with Michael Sersen on LinkedIn"
                  aria-label="Michael Sersen on LinkedIn"
                >
                  <LinkedInIcon className="w-5 h-5" />
                </a>
              </div>

              {/* Left legal group — 2×2 beside the socials */}
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-gray-500 light-theme:text-gray-600 md:col-start-1 md:row-start-1 md:grid md:grid-cols-2 md:justify-self-end md:justify-items-start">
                {[
                  { label: 'Sitemap', href: 'https://sitemap.landsurv.ai' },
                  { label: 'TOS', href: 'https://tos.landsurv.ai' },
                  { label: 'Legal', href: 'https://legal.landsurv.ai' },
                  { label: 'Privacy', href: 'https://privacy.landsurv.ai' },
                ].map(link => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-white underline-offset-2 hover:underline transition-colors"
                  >
                    {link.label}
                  </a>
                ))}
              </div>

              {/* Right legal group — 2×2 beside the socials */}
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-gray-500 light-theme:text-gray-600 md:col-start-3 md:row-start-1 md:grid md:grid-cols-2 md:justify-self-start md:justify-items-start">
                {[
                  { label: 'Standards', href: 'https://standards.landsurv.ai' },
                  { label: 'DPA', href: 'https://dpa.landsurv.ai' },
                  { label: 'Subprocessors', href: 'https://subprocessors.landsurv.ai' },
                  { label: 'Compliance', href: 'https://compliance.landsurv.ai' },
                ].map(link => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-white underline-offset-2 hover:underline transition-colors"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
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
    </div>
  );
};

export default WelcomeScreen;
