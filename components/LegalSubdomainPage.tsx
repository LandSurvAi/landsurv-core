import React from 'react';

const PolicyLink: React.FC<{ href: string; title: string; description: string }> = ({
  href,
  title,
  description,
}) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="group rounded-xl border border-gray-700 bg-gray-900/60 p-5 transition-all hover:-translate-y-0.5 hover:border-cyan-400/40 hover:bg-gray-900 hover:shadow-lg hover:shadow-cyan-950/20"
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="font-bold text-gray-100 group-hover:text-cyan-300">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-gray-400">{description}</p>
      </div>
      <span className="text-cyan-400 transition-transform group-hover:translate-x-1" aria-hidden="true">→</span>
    </div>
  </a>
);

const Principle: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <article className="rounded-xl border border-white/[0.08] bg-slate-950/35 p-5">
    <h3 className="font-bold text-gray-100">{title}</h3>
    <p className="mt-2 text-sm leading-6 text-gray-400">{children}</p>
  </article>
);

export function LegalSubdomainPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950 text-gray-200">
      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-gray-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <a href="https://landsurv.ai" className="font-extrabold tracking-tighter text-gray-100">
            Land<span className="text-cyan-400">Surv</span><span className="text-emerald-400">.ai</span>
          </a>
          <a
            href="https://landsurv.ai"
            className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20"
          >
            Launch App
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/50 via-gray-900/80 to-emerald-950/35 px-6 py-10 shadow-2xl shadow-cyan-950/20 sm:px-10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Legal and compliance center</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Built to support professionals, not replace them.
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-gray-300">
            LandSurv.ai is software for land-surveying and civil-engineering workflows. It provides tools,
            automation, and AI-assisted analysis; it is not a licensed surveyor, engineer, or professional service.
          </p>
          <div className="mt-7 flex flex-wrap gap-3 text-sm">
            <a href="#professional-use" className="rounded-lg bg-cyan-400 px-4 py-2 font-semibold text-gray-950 transition-colors hover:bg-cyan-300">Professional use</a>
            <a href="#policies" className="rounded-lg border border-white/15 px-4 py-2 font-semibold text-gray-200 transition-colors hover:bg-white/10">Policy library</a>
          </div>
        </section>

        <section id="professional-use" className="scroll-mt-24 py-12">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Professional-use principles</p>
            <h2 className="mt-3 text-2xl font-bold text-white">Human judgment remains essential.</h2>
            <p className="mt-3 leading-7 text-gray-400">
              Use LandSurv.ai as you would other professional software: apply qualified judgment, use authoritative
              source material, and verify results before relying on them for any legal, regulatory, design, or construction purpose.
            </p>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <Principle title="Software, not a firm">
              LandSurv.ai does not perform or offer licensed land-surveying, engineering, or other regulated professional services.
            </Principle>
            <Principle title="Review every output">
              AI-assisted results, including calculations, boundary plots, extracted data, and GNSS outputs, can contain errors and require independent verification.
            </Principle>
            <Principle title="You control the work product">
              The licensed professional using the platform remains responsible for the project decisions, work product, and compliance obligations.
            </Principle>
          </div>
        </section>

        <section className="rounded-2xl border border-amber-400/20 bg-amber-950/15 p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">Important notice</p>
          <h2 className="mt-2 text-xl font-bold text-white">No result is a certification or professional opinion.</h2>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-gray-300">
            LandSurv.ai does not issue survey plats, boundary determinations, engineering certifications, or legal opinions.
            Consult a qualified licensed professional or attorney when professional or legal advice is required.
          </p>
        </section>

        <section id="policies" className="scroll-mt-24 pt-12">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Policy library</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Find the document you need.</h2>
          <p className="mt-2 max-w-3xl text-gray-400">
            These documents provide the current legal, privacy, data-processing, security, and service terms for LandSurv.ai.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <PolicyLink href="https://tos.landsurv.ai" title="Terms of Service" description="The binding commercial terms for use of the platform, accounts, access, billing, and acceptable use." />
            <PolicyLink href="https://privacy.landsurv.ai" title="Privacy Policy" description="How personal information, telemetry, and privacy rights are handled." />
            <PolicyLink href="https://compliance.landsurv.ai" title="Security and Compliance" description="An operational overview of security controls and compliance alignment." />
            <PolicyLink href="https://dpa.landsurv.ai" title="Data Processing Addendum" description="Data-processing commitments and controller/processor framework." />
            <PolicyLink href="https://subprocessors.landsurv.ai" title="Subprocessors" description="The current list of third parties that support platform operations." />
            <PolicyLink href="https://standards.landsurv.ai" title="Industry Standards" description="Information about standards-aware workflows and user responsibilities." />
          </div>
        </section>

        <section className="mt-12 border-t border-gray-800 pt-8 text-sm leading-6 text-gray-500">
          <p>
            This page is an informational summary and is not legal advice. The Terms of Service and other linked
            policies control if there is any difference between this summary and a binding document.
          </p>
        </section>
      </main>
    </div>
  );
}
