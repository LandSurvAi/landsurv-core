import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SignatureForm, SignatureRecord, LEGAL_AGREEMENT_VERSION } from './SignatureForm.tsx';
import {
  TOS_EFFECTIVE_DATE,
  TOS_VERSION,
  TOS_SECTIONS,
} from '../data/tosContent.ts';

/**
 * LegalAgreementGate — first-time user agreement modal.
 *
 * Shown the FIRST time a user clicks an agent (after splash + API key screen).
 * Blocks all app use until the user scrolls through the full Terms of Service
 * & Professional Practice Agreement inside a dedicated fixed-height scroll box
 * (step 1) and then enters name + email and draws an electronic signature (step 2).
 * After signing, hasSignedLegalAgreement() returns true and this gate never
 * appears again on this device.
 */

interface LegalAgreementGateProps {
  onSigned: (record: SignatureRecord) => void;
}

export const LegalAgreementGate: React.FC<LegalAgreementGateProps> = ({ onSigned }) => {
  const [acknowledged, setAcknowledged] = useState(false);
  const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);
  const [scrollPercent, setScrollPercent] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const checkScrolledToEnd = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 12) {
      setScrollPercent(100);
      setHasScrolledToEnd(true);
      return;
    }
    const pct = Math.min(100, Math.max(0, Math.round((el.scrollTop / maxScroll) * 100)));
    setScrollPercent(pct);
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= 16) {
      setHasScrolledToEnd(true);
      setScrollPercent(100);
    }
  }, []);

  useEffect(() => {
    if (acknowledged) return;
    checkScrolledToEnd();
    window.addEventListener('resize', checkScrolledToEnd);
    return () => window.removeEventListener('resize', checkScrolledToEnd);
  }, [acknowledged, checkScrolledToEnd]);

  const handleNudgeScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ top: Math.max(240, Math.floor(el.clientHeight * 0.8)), behavior: 'smooth' });
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-gray-950/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-fade-in">
      <div className="relative bg-slate-950 border border-slate-700/80 rounded-xl shadow-[0_24px_70px_rgba(0,0,0,0.85)] w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden text-gray-200">
        {/* Subtle 1px Top Specular Line */}
        <div className="h-[2px] w-full bg-cyan-500/70 flex-shrink-0" />

        {/* Header */}
        <div className="px-6 py-4 sm:px-8 sm:py-5 border-b border-slate-800/90 bg-slate-950 flex-shrink-0">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div className="flex flex-wrap items-baseline gap-3">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter text-white">
                Land<span className="text-cyan-400">Surv</span><span className="text-emerald-400">.ai</span>
                <sup className="text-xs font-normal text-gray-500">™</sup>
              </h1>
              <span className="hidden sm:inline-block text-slate-700 select-none" aria-hidden="true">/</span>
              <span className="text-xs sm:text-sm font-semibold uppercase tracking-[0.14em] text-cyan-400">
                Terms of Service &amp; Professional Use Agreement
              </span>
            </div>

            {/* Clean Typographic Step Indicator (No Pills) */}
            <div className="flex items-center gap-3 text-xs font-mono tracking-wider uppercase">
              <span className={!acknowledged ? 'text-white font-bold border-b-2 border-cyan-400 pb-0.5' : 'text-emerald-400 font-semibold'}>
                {acknowledged ? '✓ 01. Terms Reviewed' : '01. Review Terms'}
              </span>
              <span className="text-slate-600" aria-hidden="true">/</span>
              <span className={acknowledged ? 'text-white font-bold border-b-2 border-cyan-400 pb-0.5' : 'text-slate-500'}>
                02. Electronic Signature
              </span>
            </div>
          </div>

          <p className="text-xs sm:text-sm text-slate-400 mt-1.5">
            {acknowledged
              ? 'Conditions acknowledged. Enter your full legal name, email address, and signature below to unlock the workspace.'
              : 'Please scroll through the complete Terms of Service below before signing. This is a one-time requirement on this device.'}
          </p>
        </div>

        {acknowledged ? (
          <SignatureForm onSigned={onSigned} onBack={() => setAcknowledged(false)} compact />
        ) : (
          <>
            {/* Body Container */}
            <div className="px-6 py-4 sm:px-8 sm:py-5 overflow-y-auto flex-1 min-h-0 flex flex-col gap-3.5">
              {/* Fixed-Height Modern Scrollable TOS Document Box */}
              <div className="relative flex flex-col rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
                {/* Document Top Metadata Bar (Clean Styled Text, No Pills) */}
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-900/95 border-b border-slate-800 text-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-semibold text-slate-200 truncate">
                      Master Terms of Service &amp; Professional Practice Disclosures
                    </span>
                    <span className="hidden md:inline-block text-slate-600" aria-hidden="true">&middot;</span>
                    <span className="hidden md:inline-block font-mono text-[11px] text-slate-400">
                      v{TOS_VERSION} &middot; Effective {TOS_EFFECTIVE_DATE}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <a
                      href="https://tos.landsurv.ai"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:text-cyan-300 underline underline-offset-4 text-[11px] font-medium transition-colors"
                    >
                      Open full page &#8599;
                    </a>
                    <span className="text-slate-700" aria-hidden="true">|</span>
                    <span
                      className={`font-mono text-[11px] font-semibold tracking-wider uppercase ${
                        hasScrolledToEnd ? 'text-emerald-400' : 'text-cyan-400'
                      }`}
                    >
                      {hasScrolledToEnd ? '✓ 100% Read' : `${scrollPercent}% Read`}
                    </span>
                  </div>
                </div>

                {/* Ultra-Crisp 2px Reading Progress Bar */}
                <div className="h-[2px] w-full bg-slate-800/80 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-150 ${
                      hasScrolledToEnd ? 'bg-emerald-400' : 'bg-cyan-400'
                    }`}
                    style={{ width: `${hasScrolledToEnd ? 100 : Math.max(3, scrollPercent)}%` }}
                  />
                </div>

                {/* Fixed-Height Scrollable Contract Viewport */}
                <div
                  ref={scrollRef}
                  onScroll={checkScrolledToEnd}
                  tabIndex={0}
                  role="region"
                  aria-label="Terms of Service Scrollable Document"
                  className="h-[320px] sm:h-[380px] md:h-[410px] overflow-y-auto px-5 py-5 sm:px-7 sm:py-6 space-y-6 text-xs sm:text-[13px] leading-relaxed text-slate-300 focus:outline-none"
                >
                  {/* Preamble Notice */}
                  <div className="border-l-2 border-amber-400 pl-4 py-0.5 space-y-1">
                    <p className="font-bold text-amber-300 text-xs uppercase tracking-wider">
                      Important Notice — Software Tool Only
                    </p>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      LandSurv.ai is a <strong>software tool</strong>, not a licensed land surveyor, professional engineer, or law firm.
                      Anyone may use it — no professional license is required. However, all AI and algorithmic outputs are probabilistic
                      and must be independently verified by a qualified professional before being relied upon for any boundary, design,
                      regulatory, or construction purpose.
                    </p>
                  </div>

                  {/* Core Compliance Highlights Checklist */}
                  <div className="rounded-md border border-slate-800 bg-slate-950/60 p-4 space-y-2.5">
                    <h3 className="text-[11px] font-mono font-bold uppercase tracking-widest text-cyan-400">
                      Summary of Core Conditions
                    </h3>
                    <ul className="space-y-2 text-xs text-slate-300">
                      <li className="flex gap-2.5">
                        <span className="text-emerald-400 font-bold shrink-0">✓</span>
                        <span>
                          <strong className="text-white">Productivity Software Instrument:</strong> Comparable to Civil 3D, AutoCAD, or a scientific calculator — available to professionals, students, and the public alike. <strong>No license is required to use the software.</strong>
                        </span>
                      </li>
                      <li className="flex gap-2.5">
                        <span className="text-red-400 font-bold shrink-0">✗</span>
                        <span>
                          <strong className="text-white">Not a Regulated Firm:</strong> LandSurv.ai does <strong>not</strong> practice land surveying or civil engineering, and does <strong>not</strong> produce legally binding surveys, plats, or certifications.
                        </span>
                      </li>
                      <li className="flex gap-2.5">
                        <span className="text-emerald-400 font-bold shrink-0">✓</span>
                        <span>
                          <strong className="text-white">Independent Verification Required:</strong> Any output relied upon for <strong>legal, regulatory, boundary, design, or construction</strong> purposes must be independently verified by a qualified licensed professional.
                        </span>
                      </li>
                      <li className="flex gap-2.5">
                        <span className="text-emerald-400 font-bold shrink-0">✓</span>
                        <span>
                          <strong className="text-white">Pennsylvania &amp; Multi-State Compliance:</strong> Operated from Pennsylvania in compliance with 63 Pa. C.S. &sect; 501 et seq., state licensing statutes, and international RICS standards disclosures.
                        </span>
                      </li>
                      <li className="flex gap-2.5">
                        <span className="text-emerald-400 font-bold shrink-0">✓</span>
                        <span>
                          <strong className="text-white">SOC 2, GDPR &amp; AI Safety Governance:</strong> Protected by access controls, audit logging, Google Model Armor screening, and Anthropic Usage Policy / Claude Fable 5 Advanced AI Safety Addendum rules.
                        </span>
                      </li>
                    </ul>
                  </div>

                  {/* Full 24 Sections of the Terms of Service — Clean Architectural Typography */}
                  <div className="divide-y divide-slate-800/80 border-t border-slate-800/80">
                    {TOS_SECTIONS.map((sec) => (
                      <div key={sec.id} className="py-4 first:pt-4 last:pb-1 space-y-2">
                        <h4 className={`font-bold text-sm tracking-tight ${sec.accent || 'text-white'}`}>
                          <span className="font-mono text-xs text-cyan-400 mr-2">
                            {sec.number.padStart(2, '0')}.
                          </span>
                          {sec.title.replace(/^\d+\.\s*/, '')}
                        </h4>

                        {sec.conspicuousNote && (
                          <p className="text-[11px] font-mono font-semibold uppercase tracking-wider text-amber-300/90">
                            {sec.conspicuousNote}
                          </p>
                        )}

                        {sec.paragraphs.map((p, idx) => (
                          <p
                            key={idx}
                            className={
                              sec.conspicuous
                                ? 'font-mono text-[11.5px] text-slate-200 leading-relaxed bg-amber-950/15 border-l-2 border-amber-500/40 pl-3 py-1'
                                : 'text-slate-300 leading-relaxed'
                            }
                          >
                            {p}
                          </p>
                        ))}

                        {sec.bullets && sec.bullets.length > 0 && (
                          <ul className="space-y-1.5 pl-3 pt-1">
                            {sec.bullets.map((b, idx) => (
                              <li key={idx} className="flex items-start gap-2 text-slate-300">
                                <span className="text-cyan-400 font-bold mt-0.5 shrink-0">&ndash;</span>
                                <span>
                                  {b.lead && <strong className="text-slate-100">{b.lead} </strong>}
                                  {b.text}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}

                        {sec.footerParagraphs &&
                          sec.footerParagraphs.map((fp, idx) => (
                            <p key={idx} className="pt-1 text-slate-200 font-medium">
                              {fp}
                            </p>
                          ))}
                      </div>
                    ))}
                  </div>

                  {/* End-of-Document Confirmation Marker (Clean Typographic Divider, No Pill) */}
                  <div className="border-t border-slate-800 pt-5 pb-1 text-center space-y-1.5">
                    <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-400">
                      &mdash; End of Terms of Service (v{TOS_VERSION}) &mdash;
                    </p>
                    <p className="text-xs text-slate-400">
                      Agreement Version <span className="font-mono text-slate-200">{LEGAL_AGREEMENT_VERSION}</span>.
                      Permanent copies are published at{' '}
                      <a href="https://tos.landsurv.ai" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
                        tos.landsurv.ai
                      </a>
                      ,{' '}
                      <a href="https://legal.landsurv.ai" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
                        legal.landsurv.ai
                      </a>
                      , and{' '}
                      <a href="https://privacy.landsurv.ai" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
                        privacy.landsurv.ai
                      </a>
                      .
                    </p>
                  </div>
                </div>

                {/* Bottom Fade + Sleek Architectural Scroll Bar Prompt when not yet scrolled to bottom */}
                {!hasScrolledToEnd && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent flex items-end justify-between px-5 pb-2.5">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                      Scroll required to unlock acceptance
                    </span>
                    <button
                      type="button"
                      onClick={handleNudgeScroll}
                      className="pointer-events-auto inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-300 hover:text-white transition-colors"
                    >
                      <span>Continue reading ({scrollPercent}%)</span>
                      <svg className="w-3.5 h-3.5 text-cyan-400 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {/* Clean Footer Metadata Line */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 px-0.5">
                <span>
                  <strong className="text-slate-200 font-semibold">One-time device record:</strong> Your electronic signature, name, and email are stored as proof of acceptance.
                </span>
                <span className="space-x-2">
                  <a href="https://tos.landsurv.ai" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 hover:underline">
                    TOS
                  </a>
                  <span className="text-slate-700">&middot;</span>
                  <a href="https://legal.landsurv.ai" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 hover:underline">
                    Legal
                  </a>
                  <span className="text-slate-700">&middot;</span>
                  <a href="https://privacy.landsurv.ai" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 hover:underline">
                    Privacy
                  </a>
                  <span className="text-slate-700">&middot;</span>
                  <a href="https://compliance.landsurv.ai" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 hover:underline">
                    Compliance
                  </a>
                </span>
              </div>
            </div>

            {/* Fixed footer — Next-Level Precision Architectural Button */}
            <div className="px-6 py-4 sm:px-8 border-t border-slate-800/90 bg-slate-950 flex-shrink-0">
              <button
                type="button"
                disabled={!hasScrolledToEnd}
                onClick={() => setAcknowledged(true)}
                className={`group relative w-full overflow-hidden rounded-lg transition-all duration-200 focus:outline-none ${
                  hasScrolledToEnd
                    ? 'bg-slate-900 hover:bg-slate-800/95 text-white border border-cyan-400/50 hover:border-cyan-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_8px_28px_-6px_rgba(6,182,212,0.3)] cursor-pointer'
                    : 'bg-slate-900/50 text-slate-500 border border-slate-800 cursor-not-allowed'
                }`}
              >
                {/* Left status bar accent */}
                <span
                  className={`absolute inset-y-0 left-0 w-1 transition-colors ${
                    hasScrolledToEnd ? 'bg-cyan-400 group-hover:bg-emerald-400' : 'bg-slate-700'
                  }`}
                  aria-hidden="true"
                />

                <div className="flex items-center justify-between px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    {hasScrolledToEnd ? (
                      <span className="flex h-5 w-5 items-center justify-center rounded bg-cyan-400/15 text-cyan-300 border border-cyan-400/40">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                    ) : (
                      <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    )}
                    <span className="font-semibold text-sm sm:text-[15px] tracking-tight">
                      {hasScrolledToEnd
                        ? 'I have read and acknowledge the Terms of Service'
                        : 'Scroll to the bottom of the Terms of Service to unlock'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono text-xs uppercase tracking-wider ${
                        hasScrolledToEnd ? 'text-cyan-300 group-hover:text-white font-semibold' : 'text-slate-600'
                      }`}
                    >
                      {hasScrolledToEnd ? 'Continue to Sign' : `${scrollPercent}%`}
                    </span>
                    {hasScrolledToEnd && (
                      <span className="text-cyan-400 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true">
                        &rarr;
                      </span>
                    )}
                  </div>
                </div>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default LegalAgreementGate;


