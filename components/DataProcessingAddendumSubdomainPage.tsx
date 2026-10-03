import React from 'react';
import { PublicSubdomainShell } from './PublicSubdomainShell.tsx';

const Section: React.FC<{ title: string; children: React.ReactNode; accent?: string }> = ({
  title,
  children,
  accent = 'text-cyan-400',
}) => (
  <section className="mb-5 rounded-2xl border border-white/[0.08] bg-slate-950/35 p-6 sm:p-7">
    <h2 className={`text-xl font-bold ${accent}`}>{title}</h2>
    <div className="text-gray-300 space-y-3 leading-relaxed text-[15px]">{children}</div>
  </section>
);

export function DataProcessingAddendumSubdomainPage() {
  return (
    <PublicSubdomainShell
      eyebrow="Privacy center"
      title="Data Processing Addendum"
      description="A public summary of LandSurv.ai data-processing commitments for customers and their data."
      meta="Effective date: July 1, 2026"
      contentClassName="max-w-5xl"
    >
        <div className="mb-5 rounded-2xl border border-cyan-400/20 bg-cyan-950/25 p-6 text-sm text-cyan-100/90">
          This page provides a public summary of LandSurv.ai data processing commitments.
          Enterprise customers may request an executable DPA through legal channels.
        </div>

        <Section title="1. Roles and Scope">
          <p className="text-sm">
            Customer acts as controller for customer personal data; LandSurv.ai acts as processor where processing is
            performed on behalf of customer instructions under applicable agreements.
          </p>
        </Section>

        <Section title="2. Processing Instructions">
          <p className="text-sm">
            LandSurv.ai processes personal data only on documented instructions, unless required otherwise by law.
          </p>
        </Section>

        <Section title="3. Confidentiality and Security Measures">
          <ul className="list-disc pl-6 space-y-1 text-sm">
            <li>Access controls and authentication safeguards.</li>
            <li>Operational logging and monitoring.</li>
            <li>Security hardening measures and abuse protections.</li>
            <li>Data minimization and retention/deletion workflows.</li>
          </ul>
        </Section>

        <Section title="4. Subprocessors">
          <p className="text-sm">
            LandSurv.ai may engage subprocessors to provide infrastructure and support services.
            Subprocessors are subject to data protection obligations consistent with this DPA framework.
          </p>
          <p className="text-sm">
            <a href="https://subprocessors.landsurv.ai" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">Current Subprocessors List</a>
          </p>
        </Section>

        <Section title="5. Data Subject Assistance">
          <p className="text-sm">
            LandSurv.ai provides reasonable assistance for verified data subject requests and supervisory authority inquiries,
            consistent with applicable law and contractual scope.
          </p>
        </Section>

        <Section title="6. Incident Response and Notice">
          <p className="text-sm">
            LandSurv.ai maintains incident response procedures and notifies affected customers of confirmed personal-data
            incidents in accordance with legal and contractual obligations.
          </p>
        </Section>

        <Section title="7. Cross-Border Transfers and Return/Deletion" accent="text-gray-300">
          <p className="text-sm text-gray-400">
            For restricted transfers, LandSurv.ai applies appropriate safeguards where required. On termination or request,
            data is returned or deleted according to agreement and legal requirements.
          </p>
          <p className="text-xs text-gray-500 mt-4">
            Request executable DPA terms: <a href="mailto:legal@landsurv.ai" className="text-cyan-400 hover:underline">legal@landsurv.ai</a>
          </p>
        </Section>
    </PublicSubdomainShell>
  );
}

export default DataProcessingAddendumSubdomainPage;
