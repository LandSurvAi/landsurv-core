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

export function PrivacyPolicySubdomainPage() {
  return (
    <PublicSubdomainShell
      eyebrow="Privacy center"
      title="Privacy Policy"
      description="How LandSurv.ai collects, uses, discloses, and protects personal data."
      meta="Effective date: July 8, 2026"
      contentClassName="max-w-5xl"
    >
        <div className="mb-5 rounded-2xl border border-cyan-400/20 bg-cyan-950/25 p-6 text-sm text-cyan-100/90">
          This Privacy Policy explains how LandSurv.ai collects, uses, discloses, and protects personal data.
          It supports GDPR-aligned transparency commitments and is intended to be read together with the Terms
          and Legal disclosures.
        </div>

        <Section title="1. Data We Collect">
          <ul className="list-disc pl-6 space-y-1 text-sm">
            <li>Account and profile data (for example: email, display name, account identifiers).</li>
            <li>Operational security data (for example: authentication logs, API usage metadata, IP/user agent).</li>
            <li>User-submitted data necessary to provide services (documents, messages, project artifacts).</li>
            <li>Support and contact data (for example: callback/contact requests and optional voicemail content).</li>
          </ul>
        </Section>

        <Section title="2. How We Use Data">
          <ul className="list-disc pl-6 space-y-1 text-sm">
            <li>To provide, secure, and maintain platform functionality.</li>
            <li>To authenticate users, prevent abuse, and investigate incidents.</li>
            <li>To process support, legal, and compliance requests.</li>
            <li>To comply with legal obligations and enforce platform terms.</li>
          </ul>
        </Section>

        <Section title="3. Legal Bases (GDPR)">
          <p className="text-sm">
            Depending on context, processing is based on contract performance, legitimate interests,
            consent (where required), and legal obligation.
          </p>
        </Section>

        <Section title="4. Data Sharing and Processors">
          <p className="text-sm">
            We share data with service providers acting as processors/subprocessors only where required for
            service delivery, security, communications, and operations. See the Subprocessors page for current listings.
          </p>
          <p className="text-sm">
            <a href="https://subprocessors.landsurv.ai" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">View Subprocessors</a>
          </p>
        </Section>

        <Section title="5. Retention and Deletion">
          <p className="text-sm">
            Data is retained according to operational and legal requirements and deleted or anonymized when no longer needed.
            Retention workflows are enforced through administrative controls.
          </p>
        </Section>

        <Section title="6. Data Subject Rights">
          <p className="text-sm">
            Subject to applicable law, you may request access, correction, export, restriction, objection,
            or deletion of personal data.
          </p>
          <p className="text-sm">
            Submit requests to <a href="mailto:legal@landsurv.ai" className="text-cyan-400 hover:underline">legal@landsurv.ai</a>.
          </p>
        </Section>

        <Section title="7. Security Controls">
          <p className="text-sm">
            LandSurv.ai applies layered controls including access management, audit logging, rate limiting,
            secure transport, and operational monitoring. No system can be guaranteed 100% secure.
          </p>
        </Section>

        <Section title="8. AI-Specific Privacy Safeguards (SAIF-Aligned)">
          <p className="text-sm">
            For AI-assisted features, LandSurv.ai applies data minimization and disclosure-boundary controls aligned with SAIF principles,
            including prompt/response handling controls, least-privilege workflow design, and auditability of security-sensitive operations.
          </p>
          <ul className="list-disc pl-6 space-y-1 text-sm">
            <li>When Google Model Armor is enabled for Vertex AI traffic, prompts and responses are screened at the backend before content is passed through to the model or returned to users.</li>
            <li>Minimize sensitive data included in prompts and operational logs where practical.</li>
            <li>Apply policy gates and user acknowledgements for advanced model/provider terms where required.</li>
            <li>Restrict privileged actions through role-based and workflow-based controls.</li>
            <li>Review retention and deletion operations on a recurring governance cadence.</li>
          </ul>
          <p className="text-xs text-gray-500">
            SAIF alignment statement: this is an operational alignment posture and does not imply SAIF certification.
          </p>
        </Section>

        <Section title="9. Cross-Border Transfers and Updates" accent="text-gray-300">
          <p className="text-sm text-gray-400">
            Where international data transfers occur, LandSurv.ai applies appropriate safeguards as required by law.
            This policy may be updated; material changes will be reflected with a revised effective date.
          </p>
          <p className="text-xs text-gray-500 mt-4">
            Companion documents: <a href="https://legal.landsurv.ai" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">Legal</a> ·{' '}
            <a href="https://compliance.landsurv.ai" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">Compliance</a> ·{' '}
            <a href="https://tos.landsurv.ai" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">Terms</a> ·{' '}
            <a href="https://dpa.landsurv.ai" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">DPA</a>
          </p>
        </Section>
    </PublicSubdomainShell>
  );
}

export default PrivacyPolicySubdomainPage;
