import React, { useEffect } from 'react';
import { APP_VERSION } from '../utils/appVersion.ts';
import {
  TOS_EFFECTIVE_DATE,
  TOS_PUBLISHED_ISO,
  TOS_VERSION,
  TOS_SECTIONS,
  TOS_RELATED_PAGES,
  type TosSectionData,
} from '../data/tosContent.ts';

/**
 * tos.landsurv.ai — Terms of Service Landing Page
 *
 * Standalone full-page component served when the hostname is tos.landsurv.ai.
 * Also embedded inside the SPA under the same subdomain-routing config.
 *
 * Scope: the *full* binding contract between LandSurv.ai (the Pennsylvania-based
 * operator) and any user of the web application, agent landing pages, API
 * endpoints, Claw browser-automation service, Civil 3D connector, and any
 * other service published under landsurv.ai.
 *
 * The companion page at legal.landsurv.ai covers the narrower
 * professional-practice disclaimer and policy index. This page is the
 * commercial/contract layer that sits on top of that and is also rendered
 * directly inside the first-time in-app LegalAgreementGate scroll box.
 */

const SectionCard: React.FC<{ section: TosSectionData }> = ({ section }) => {
  const isConspicuous = Boolean(section.conspicuous);
  const accentColor = section.accent || 'text-cyan-400';

  return (
    <section
      id={section.id}
      className={`mb-5 scroll-mt-24 rounded-xl border p-6 sm:p-7 transition-colors ${
        isConspicuous
          ? 'border-amber-400/25 bg-slate-950/60'
          : 'border-white/[0.08] bg-slate-950/40 hover:border-cyan-500/20'
      }`}
    >
      <div className="flex items-baseline gap-2.5 mb-3">
        <span
          className={`font-mono text-sm font-bold ${
            isConspicuous ? 'text-amber-300' : 'text-cyan-400'
          }`}
        >
          {section.number.padStart(2, '0')}.
        </span>
        <h2 className={`text-lg sm:text-xl font-bold tracking-tight ${accentColor}`}>
          {section.title.replace(/^\d+\.\s*/, '')}
        </h2>
      </div>

      {section.conspicuousNote && (
        <p className="mb-3 border-l-2 border-amber-400 pl-3 text-xs font-mono font-semibold uppercase tracking-wider text-amber-300">
          {section.conspicuousNote}
        </p>
      )}

      <div className="text-gray-300 space-y-3 leading-relaxed text-[15px]">
        {section.paragraphs.map((p, idx) => (
          <p key={idx} className={isConspicuous ? 'font-mono text-[13.5px] leading-relaxed text-gray-200' : ''}>
            {p}
          </p>
        ))}

        {section.bullets && section.bullets.length > 0 && (
          <ul className="space-y-2 pt-1 text-sm text-gray-300">
            {section.bullets.map((b, idx) => (
              <li key={idx} className="flex items-start gap-2.5">
                <span className="text-cyan-400 font-bold mt-0.5 flex-shrink-0" aria-hidden="true">&ndash;</span>
                <span>
                  {b.lead && <strong className="text-white font-semibold">{b.lead} </strong>}
                  {b.text.includes('@landsurv.ai') && !b.text.includes(' ') ? (
                    <a href={`mailto:${b.text}`} className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 font-mono">
                      {b.text}
                    </a>
                  ) : (
                    b.text
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {section.footerParagraphs &&
          section.footerParagraphs.map((fp, idx) => (
            <p key={idx} className="pt-2 text-sm text-gray-300 font-medium border-t border-white/[0.06]">
              {fp}
            </p>
          ))}
      </div>
    </section>
  );
};

export function TosSubdomainPage() {
  // Inject TermsOfService schema for SEO + a BreadcrumbList for the sitemap path.
  useEffect(() => {
    const tosSchema = {
      '@context': 'https://schema.org',
      '@type': 'TermsOfService',
      name: 'LandSurv.ai Terms of Service',
      url: 'https://tos.landsurv.ai',
      datePublished: TOS_PUBLISHED_ISO,
      version: TOS_VERSION,
      inLanguage: 'en-US',
      publisher: {
        '@type': 'Organization',
        name: 'LandSurv.ai',
        url: 'https://landsurv.ai',
      },
    };
    const breadcrumbSchema = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'LandSurv.ai', item: 'https://landsurv.ai' },
        { '@type': 'ListItem', position: 2, name: 'Terms of Service', item: 'https://tos.landsurv.ai' },
      ],
    };
    const tosScript = document.createElement('script');
    tosScript.type = 'application/ld+json';
    tosScript.textContent = JSON.stringify(tosSchema);
    document.head.appendChild(tosScript);

    const crumbScript = document.createElement('script');
    crumbScript.type = 'application/ld+json';
    crumbScript.textContent = JSON.stringify(breadcrumbSchema);
    document.head.appendChild(crumbScript);

    const originalTitle = document.title;
    document.title = 'Terms of Service — LandSurv.ai';

    return () => {
      if (tosScript.parentNode) tosScript.parentNode.removeChild(tosScript);
      if (crumbScript.parentNode) crumbScript.parentNode.removeChild(crumbScript);
      document.title = originalTitle;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950 text-gray-200 selection:bg-cyan-500/30 selection:text-cyan-100">
      {/* Header — mirrors the official homepage / legal-page branding */}
      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-gray-950/85 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-baseline gap-3">
              <a href="https://landsurv.ai" className="text-xl font-extrabold tracking-tighter text-gray-100 hover:opacity-90 transition-opacity">
                Land<span className="text-cyan-400">Surv</span><span className="text-emerald-400">.ai</span>
              </a>
              <span className="text-gray-700" aria-hidden="true">/</span>
              <span className="text-sm font-semibold text-cyan-400 tracking-tight">Terms of Service</span>
              <span className="hidden sm:inline-block font-mono text-xs text-slate-400">
                v{TOS_VERSION}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <a
                href="https://legal.landsurv.ai"
                className="text-xs sm:text-sm font-semibold text-slate-300 hover:text-white transition-colors"
              >
                Legal Center
              </a>
              <a
                href="https://landsurv.ai"
                className="rounded-lg border border-cyan-400/50 bg-slate-900 px-4 py-2 text-xs sm:text-sm font-semibold text-white transition-all hover:border-cyan-300 hover:bg-slate-800"
              >
                Launch Main App &rarr;
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative mx-auto mt-8 max-w-6xl overflow-hidden rounded-xl border border-slate-800 bg-slate-950/80 px-6 py-8 shadow-2xl sm:mt-10 sm:px-10 sm:py-10">
        {/* Subtle technical CAD reticle accent in top-right */}
        <svg
          className="pointer-events-none absolute -right-10 -top-10 h-64 w-64 text-cyan-400/[0.05]"
          viewBox="0 0 100 100"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="50" cy="50" r="42" stroke="currentColor" strokeWidth="0.75" strokeDasharray="3 2" />
          <circle cx="50" cy="50" r="28" stroke="currentColor" strokeWidth="0.75" />
          <circle cx="50" cy="50" r="12" stroke="currentColor" strokeWidth="0.75" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" strokeWidth="0.5" />
          <line x1="50" y1="0" x2="50" y2="100" stroke="currentColor" strokeWidth="0.5" />
        </svg>

        {/* Clean Styled Metadata Line (No Pills) */}
        <p className="relative font-mono text-xs font-semibold uppercase tracking-[0.16em] text-cyan-400 mb-3">
          Version {TOS_VERSION} &nbsp;&middot;&nbsp; Effective {TOS_EFFECTIVE_DATE} &nbsp;&middot;&nbsp; Pennsylvania Governing Law &nbsp;&middot;&nbsp; Build {APP_VERSION}
        </p>

        <h1 className="relative text-3xl sm:text-4xl md:text-5xl font-extrabold text-white mb-3 leading-tight tracking-tight">
          The binding agreement between you and{' '}
          <span className="text-cyan-400">LandSurv</span>
          <span className="text-emerald-400">.ai</span>.
        </h1>
        <p className="relative text-base text-gray-300 max-w-3xl leading-relaxed">
          Clear, thorough commercial and professional-use terms governing the LandSurv.ai web application,
          its 24 specialized AI surveying and civil CAD agents, the LandSurv Claw permissive-source engine,
          the Civil 3D &amp; IntelliCAD connectors, and all companion services published under{' '}
          <span className="font-mono text-cyan-300">landsurv.ai</span>.
        </p>
      </section>

      {/* Read Me First — Critical Notice */}
      <div className="mx-auto max-w-6xl px-4 pb-2 pt-8 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-amber-400/25 bg-amber-950/15 p-6">
          <div className="flex gap-3.5">
            <svg className="w-6 h-6 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="font-bold text-amber-200 mb-1 tracking-tight">Important Notice Before Using LandSurv.ai</p>
              <p className="text-amber-100/90 text-sm leading-relaxed">
                LandSurv.ai is a <strong>software tool</strong>, not a licensed land surveyor, professional engineer, or law firm.
                AI and algorithmic outputs are probabilistic and must be independently verified by a qualified professional
                against authoritative source documents and field measurements before being relied upon for any boundary, design,
                regulatory, construction, or legal purpose. Please note that <strong>Section&nbsp;22</strong> contains a mandatory
                individual arbitration agreement and class-action waiver (with a 30-day opt-out right).
              </p>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
        {/* Table of contents */}
        <nav aria-label="Table of Contents" className="mb-7 rounded-2xl border border-white/[0.08] bg-slate-950/60 p-5 sm:p-6">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-[0.2em]">
              Table of Contents (24 Sections)
            </h3>
            <span className="text-xs text-gray-500">Click any section to jump directly</span>
          </div>
          <ol className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5 text-sm">
            {TOS_SECTIONS.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="group flex items-baseline gap-2 py-0.5 text-gray-300 hover:text-cyan-300 transition-colors"
                >
                  <span className="font-mono text-xs text-cyan-400/80 group-hover:text-cyan-300 w-5 shrink-0">
                    {item.number}.
                  </span>
                  <span className="group-hover:underline underline-offset-2 truncate">
                    {item.title.replace(/^\d+\.\s*/, '')}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* All 24 Authoritative Sections */}
        {TOS_SECTIONS.map((section) => (
          <SectionCard key={section.id} section={section} />
        ))}

        {/* Related pages */}
        <div className="mt-10 rounded-2xl border border-white/[0.08] bg-slate-950/50 p-6 sm:p-7">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Ecosystem Governance</p>
              <h3 className="text-lg font-bold text-white mt-0.5">Companion Legal, Privacy &amp; Open-Standard Pages</h3>
            </div>
            <span className="text-xs text-gray-500">Incorporated by reference where applicable</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            {TOS_RELATED_PAGES.map((page) => {
              const linkAccent =
                page.accent === 'emerald'
                  ? 'text-emerald-400 group-hover:text-emerald-300'
                  : page.accent === 'amber'
                    ? 'text-amber-400 group-hover:text-amber-300'
                    : page.accent === 'teal'
                      ? 'text-teal-400 group-hover:text-teal-300'
                      : 'text-cyan-400 group-hover:text-cyan-300';
              return (
                <a
                  key={page.href}
                  href={page.href}
                  className="group flex flex-col justify-between rounded-xl border border-white/[0.07] bg-slate-900/50 p-4 transition-all hover:border-cyan-400/35 hover:bg-slate-900/90"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-gray-100 group-hover:text-white">{page.title}</span>
                      <span className={`font-mono text-xs ${linkAccent}`}>{page.host} &rarr;</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-400 leading-relaxed">{page.description}</p>
                  </div>
                </a>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-10 text-center">
          <p className="text-gray-500 text-xs">
            &copy; {new Date().getFullYear()} LandSurv.ai. All rights reserved.
            &nbsp;&middot;&nbsp; Terms v{TOS_VERSION} (Effective {TOS_EFFECTIVE_DATE}) &nbsp;&middot;&nbsp; App build {APP_VERSION}
          </p>
        </div>
      </main>
    </div>
  );
}

