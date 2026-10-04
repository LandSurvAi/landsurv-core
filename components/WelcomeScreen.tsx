import React, { useState } from 'react';
import { 
  XMarkIcon, 
  YouTubeIcon, 
  FacebookIcon
} from './icons';
import '@fontsource-variable/inter';
import { getHolidayTheme } from './InitialAgentSelection';

export type WelcomeMode = 'main' | 'free-code';

export interface WelcomeScreenProps {
  onClose: () => void;
  version: string;
  onLaunchAgenticCad?: (mode?: 'blank' | 'sample' | 'existing') => void;
  onGoHome?: () => void;
  hasExistingPoints?: boolean;
  existingPointCount?: number;
  initialMode?: WelcomeMode;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ 
  onClose, 
  version,
  onLaunchAgenticCad,
  onGoHome,
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

  return (
    <div 
      onClick={onClose} 
      className={`fixed inset-0 z-[101] flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto animate-fade-in ${
        isChristmasSeason 
          ? 'bg-gradient-to-b from-red-950/40 via-gray-950/85 to-green-950/40 backdrop-blur-md' 
          : 'bg-gray-950/85 backdrop-blur-md'
      }`}
    >
      {/* Modal Dialog Card */}
      <div 
        onClick={e => e.stopPropagation()}
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl max-w-3xl w-full flex flex-col my-auto max-h-[92vh] animate-modal-panel-fade-in-down light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-800 text-gray-200 relative overflow-hidden antialiased"
        style={{ fontFamily: "'Inter Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}
      >
        {/* Top Header */}
        <header className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-gray-800 shrink-0 light-theme:border-gray-200">
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            {mode !== 'main' && (
              <button
                type="button"
                onClick={() => setMode('main')}
                className="flex items-center px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-300 bg-gray-800 hover:bg-gray-700 hover:text-white border border-gray-700 transition light-theme:bg-gray-200 light-theme:text-gray-700 light-theme:hover:bg-gray-300"
                title="Back to Welcome Destinations"
              >
                <span>Back</span>
              </button>
            )}

            <div className="flex items-baseline gap-2 min-w-0 truncate">
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tighter text-white light-theme:text-gray-900 truncate">
                Land<span className="text-cyan-400">Surv</span><span className="text-green-400">.ai</span>
                <sup className="text-xs font-normal text-gray-400">™</sup>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button 
              onClick={onClose} 
              className="p-1.5 sm:p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 light-theme:hover:bg-gray-200 light-theme:hover:text-gray-900 transition" 
              aria-label="Close Welcome Screen"
            >
              <XMarkIcon className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-6">
          {/* ============================================================== */}
          {/* MODE 1: MAIN NAVIGATION HUB                                     */}
          {/* ============================================================== */}
          {mode === 'main' && (
            <div className="space-y-6">
              {/* Intro */}
              <div className="space-y-1">
                <h2 className="text-xl font-semibold tracking-tight text-white light-theme:text-gray-900">
                  Get started
                </h2>
                <p className="text-sm text-gray-400 light-theme:text-gray-600">
                  Select where you would like to work.
                </p>
              </div>

              {/* PRIMARY FEATURE CARD: Agentic CAD */}
              <div 
                onClick={handleAgenticCadClick}
                className="group relative overflow-hidden rounded-lg border border-l-0 border-dashed border-cyan-500/60 hover:border-cyan-400 bg-gray-800/50 p-5 sm:p-6 transition-colors duration-150 cursor-pointer light-theme:bg-gray-50 light-theme:border-cyan-500 light-theme:hover:border-cyan-600"
              >
                <span className="absolute inset-y-0 left-0 w-1 bg-cyan-500" aria-hidden="true" />
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 pl-2">
                  <div className="space-y-1.5">
                    <h3 className="text-lg font-semibold text-white light-theme:text-gray-900 tracking-tight">
                      Agentic CAD
                    </h3>
                    <p className="text-sm text-gray-400 light-theme:text-gray-600 leading-relaxed max-w-lg">
                      Open the CAD environment with AI-assisted and manual drafting tools. Starts with a clean workspace.
                    </p>
                  </div>

                  <div className="shrink-0 flex flex-col items-stretch md:items-end gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAgenticCadClick();
                      }}
                      className="px-5 py-2.5 rounded-md font-semibold text-sm text-white bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-900/40 transition-colors"
                    >
                      Open CAD Environment
                    </button>
                    {hasExistingPoints && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onLaunchAgenticCad?.('existing');
                        }}
                        className="text-xs text-gray-400 hover:text-cyan-300 underline-offset-2 hover:underline transition-colors light-theme:text-gray-600"
                      >
                        Continue with {existingPointCount} existing point{existingPointCount !== 1 ? 's' : ''}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* SECONDARY DESTINATIONS: Home & Free Code */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Home Destination */}
                <div 
                  onClick={handleHomeClick}
                  className="group relative overflow-hidden rounded-lg border border-l-0 border-dashed border-red-500/60 hover:border-red-400 bg-gray-800/40 p-4 sm:p-5 transition-colors duration-150 cursor-pointer light-theme:bg-gray-50 light-theme:border-red-400 light-theme:hover:border-red-600"
                >
                  <span className="absolute inset-y-0 left-0 w-1 bg-red-500" aria-hidden="true" />
                  <div className="space-y-1 pl-2">
                    <h4 className="text-base font-semibold text-white light-theme:text-gray-900">
                      Home
                    </h4>
                    <p className="text-sm text-gray-400 light-theme:text-gray-600 leading-relaxed">
                      Browse the full suite of specialized survey and drafting agents.
                    </p>
                  </div>
                </div>

                {/* Free Code Destination */}
                <div 
                  onClick={() => setMode('free-code')}
                  className="group relative overflow-hidden rounded-lg border border-l-0 border-dashed border-emerald-500/60 hover:border-emerald-400 bg-gray-800/40 p-4 sm:p-5 transition-colors duration-150 cursor-pointer light-theme:bg-gray-50 light-theme:border-emerald-500 light-theme:hover:border-emerald-600"
                >
                  <span className="absolute inset-y-0 left-0 w-1 bg-emerald-500" aria-hidden="true" />
                  <div className="space-y-1 pl-2">
                    <h4 className="text-base font-semibold text-white light-theme:text-gray-900 flex items-center gap-2">
                      Free Software
                    </h4>
                    <p className="text-sm text-gray-400 light-theme:text-gray-600 leading-relaxed">
                      Open-source software you can use, study, and build on, plus ways to support the project.
                    </p>
                  </div>
                </div>
              </div>

              {/* COMMUNITY LINKS */}
              <div className="flex flex-col items-center gap-3 pt-5 border-t border-gray-800 light-theme:border-gray-200">
                <p className="text-sm font-medium text-pink-400 light-theme:text-pink-600">
                  Tutorials, workflows and updates
                </p>
                <div className="flex items-center justify-center gap-6">
                  <a
                    href="https://www.youtube.com/@LandSurv"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-red-500 hover:text-red-400 hover:scale-110 transition-all"
                    title="Watch tutorials on YouTube"
                    aria-label="LandSurv.ai on YouTube"
                  >
                    <YouTubeIcon className="w-7 h-7" />
                  </a>
                  <a
                    href="https://www.facebook.com/profile.php?id=61583326114422"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#1877F2] hover:text-[#4a9bff] hover:scale-110 transition-all"
                    title="Join our Facebook community"
                    aria-label="LandSurv.ai on Facebook"
                  >
                    <FacebookIcon className="w-7 h-7" />
                  </a>
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
        <footer className="px-4 py-3 sm:px-6 bg-gray-950/40 flex items-center justify-between gap-2.5 border-t border-gray-800 shrink-0 light-theme:bg-gray-50 light-theme:border-gray-200">
          {mode === 'main' ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 light-theme:text-gray-600">
              <span>v{version}</span>
              {[
                { label: 'TOS', href: 'https://tos.landsurv.ai' },
                { label: 'Legal', href: 'https://legal.landsurv.ai' },
                { label: 'Privacy', href: 'https://privacy.landsurv.ai' },
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
          ) : (
            <button
              type="button"
              onClick={() => setMode('main')}
              className="px-4 py-2 font-semibold text-xs sm:text-sm text-gray-300 hover:text-white bg-gray-700/60 hover:bg-gray-700 rounded-lg transition light-theme:bg-gray-200 light-theme:text-gray-800 light-theme:hover:bg-gray-300"
            >
              Back to Welcome
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};

export default WelcomeScreen;
