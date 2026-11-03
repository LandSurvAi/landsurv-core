import React from 'react';
import { TOS_VERSION, TOS_EFFECTIVE_DATE } from '../data/tosContent.ts';

const PolicyLink: React.FC<{ href: string; badge: string; title: string; description: string }> = ({
  href,
  badge,
  title,
  description,
}) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="group rounded-xl border border-white/[0.08] bg-slate-900/60 p-5 transition-all hover:-translate-y-0.5 hover:border-cyan-400/40 hover:bg-slate-900 hover:shadow-lg hover:shadow-cyan-950/25"
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        <span className="block font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-400">
          {badge}
        </span>
        <h3 className="mt-1.5 font-bold text-gray-100 group-hover:text-cyan-300 transition-colors">{title}</h3>
        <p className="mt-1.5 text-sm leading-6 text-gray-400">{description}</p>
      </div>
      <span className="text-cyan-400 transition-transform group-hover:translate-x-1 mt-1" aria-hidden="true">→</span>
    </div>
  </a>
);

const Principle: React.FC<{ step: string; title: string; children: React.ReactNode }> = ({ step, title, children }) => (
  <article className="rounded-xl border border-white/[0.08] bg-slate-950/45 p-5 hover:border-emerald-400/30 transition-colors">
    <span className="block font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-400">
      {step}
    </span>
    <h3 className="mt-1.5 font-bold text-gray-100">{title}</h3>
    <p className="mt-2 text-sm leading-6 text-gray-400">{children}</p>
  </article>
);

export function LegalSubdomainPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950 text-gray-200 selection:bg-cyan-500/30 selection:text-cyan-100">
      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-gray-950/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <a href="https://landsurv.ai" className="text-xl font-extrabold tracking-tighter text-gray-100">
              Land<span className="text-cyan-400">Surv</span><span className="text-emerald-400">.ai</span>
            </a>
            <span className="text-gray-700" aria-hidden="true">/</span>
            <span className="text-sm font-semibold text-cyan-400">Legal &amp; Compliance</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://tos.landsurv.ai"
              className="text-xs sm:text-sm font-semibold text-slate-300 hover:text-white transition-colors"
            >
              Terms of Service (v{TOS_VERSION})
            </a>
            <a
              href="https://landsurv.ai"
              className="rounded-lg border border-cyan-400/50 bg-slate-900 px-4 py-2 text-xs sm:text-sm font-semibold text-white transition-all hover:border-cyan-300 hover:bg-slate-800"
            >
              Launch App &rarr;
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950/80 px-6 py-10 shadow-2xl sm:px-10">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">
            Legal &amp; Compliance Center &nbsp;&middot;&nbsp; 63 Pa. C.S. &sect; 501 &amp; RICS Aligned
          </p>
          <h1 className="mt-3 max-w-3xl text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            Built to empower professionals, not replace them.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-gray-300">
            LandSurv.ai is specialized computational and drafting software for land-surveying and civil-engineering workflows.
            It provides mathematical solvers, CAD automation, and AI-assisted analysis; it is not a licensed surveyor,
            professional engineer, or regulated firm.
          </p>
          <div className="mt-7 flex flex-wrap gap-3 text-sm">
            <a href="#professional-use" className="rounded-lg border border-cyan-400/60 bg-slate-900 px-4 py-2.5 font-semibold text-white transition-all hover:border-cyan-300 hover:bg-slate-800">
              Professional-Use Principles
            </a>
            <a href="#policies" className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2.5 font-semibold text-gray-200 transition-colors hover:border-slate-600 hover:bg-slate-800/70">
              Policy Library
            </a>
            <a href="https://tos.landsurv.ai" className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2.5 font-semibold text-cyan-300 transition-colors hover:border-cyan-400/40 hover:text-cyan-200">
              Read Full Terms of Service &rarr;
            </a>
          </div>
        </section>

        <section id="professional-use" className="scroll-mt-24 py-12">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Professional-use principles</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Human judgment and Responsible Charge remain essential.</h2>
            <p className="mt-3 leading-7 text-gray-400">
              Use LandSurv.ai as you would Autodesk Civil 3D, Trimble Business Center, or a scientific calculator: apply qualified
              judgment, cross-check against authoritative record deeds and field monuments, and verify every output before relying
              on it for any legal, regulatory, boundary, design, or construction purpose.
            </p>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <Principle step="PRINCIPLE 01" title="Software, not a firm">
              LandSurv.ai does not perform or offer licensed land-surveying, civil-engineering, title abstracting, or legal services in any jurisdiction.
            </Principle>
            <Principle step="PRINCIPLE 02" title="Verify every output">
              AI-assisted results—including boundary plots, traverse closures, extracted plan coordinates, and GNSS/GIS overlays—are probabilistic and require independent verification.
            </Principle>
            <Principle step="PRINCIPLE 03" title="You control the work product">
              The licensed practitioner using the platform remains in Responsible Charge for all project decisions, stamped drawings, and statutory compliance obligations.
            </Principle>
          </div>
        </section>

        <section className="rounded-2xl border border-amber-400/25 bg-gradient-to-r from-amber-950/25 via-amber-950/15 to-slate-950/40 p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">Statutory &amp; International Notice</p>
          <h2 className="mt-2 text-xl font-bold text-white">No output is a certified plat, sealed drawing, or RICS valuation.</h2>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-gray-300">
            LandSurv.ai complies with Pennsylvania&apos;s Engineer, Land Surveyor and Geologist Registration Law (63 Pa. C.S. &sect; 501 et seq.)
            and analogous state statutes nationwide. Furthermore, LandSurv.ai is not a RICS-regulated entity, and no output constitutes a
            RICS-compliant professional opinion, Red Book valuation, or certified survey report. Consult a qualified licensed professional
            or attorney when professional certification or legal advice is required.
          </p>
        </section>

        <section id="policies" className="scroll-mt-24 pt-12">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Authoritative Policy Library</p>
          <h2 className="mt-2 text-2xl font-bold text-white">Find the governing document you need.</h2>
          <p className="mt-2 max-w-3xl text-gray-400">
            These live documents provide the binding commercial terms, privacy practices, data-processing commitments,
            security posture, and open-source specifications for LandSurv.ai.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <PolicyLink href="https://tos.landsurv.ai" badge={`TOS v${TOS_VERSION} · ${TOS_EFFECTIVE_DATE}`} title="Terms of Service" description="The 24-section binding contract covering eligibility, AI verification, BYOK, billing, the Claw permissive-source policy, and dispute resolution." />
            <PolicyLink href="https://privacy.landsurv.ai" badge="GDPR & CCPA" title="Privacy Policy" description="How personal information, browser local storage, telemetry, and data-subject rights are handled." />
            <PolicyLink href="https://compliance.landsurv.ai" badge="SOC 2 · SAIF · Model Armor" title="Security & Compliance Trust Center" description="Operational overview of security controls, Google Model Armor, Anthropic policy gates, and FedRAMP-readiness alignment." />
            <PolicyLink href="https://dpa.landsurv.ai" badge="Controller / Processor" title="Data Processing Addendum" description="Enterprise data-processing commitments, confidentiality, and incident-response obligations." />
            <PolicyLink href="https://subprocessors.landsurv.ai" badge="Vendor Inventory" title="Subprocessors" description="Current list of third-party cloud, AI inference (Vertex AI, Anthropic), and payment subprocessors." />
            <PolicyLink href="https://standards.landsurv.ai" badge="NAD83 · SPCS · RINEX" title="Industry Standards" description="Reference for geodetic coordinate systems, GNSS formats, CAD compliance, and surveying standards." />
          </div>
        </section>

        <section className="mt-12 border-t border-gray-800 pt-8 text-sm leading-6 text-gray-500">
          <p>
            This page is an informational overview and does not constitute legal advice. The{' '}
            <a href="https://tos.landsurv.ai" className="text-cyan-400 hover:underline">Terms of Service</a> and other linked
            policies control in the event of any conflict between this summary and a binding agreement.
          </p>
        </section>
      </main>
    </div>
  );
}

