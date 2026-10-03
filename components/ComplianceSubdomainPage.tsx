import React from 'react';
import { PublicSubdomainShell } from './PublicSubdomainShell.tsx';

/**
 * compliance.landsurv.ai — Security & Compliance Trust Center
 *
 * This page is intentionally non-contractual. It summarizes operational
 * controls and links users to the legally binding documents on legal/tos.
 */

const Section: React.FC<{ title: string; children: React.ReactNode; accent?: string }> = ({
  title,
  children,
  accent = 'text-teal-400',
}) => (
  <section className="mb-5 rounded-2xl border border-white/[0.08] bg-slate-950/35 p-6 sm:p-7">
    <h2 className={`text-xl font-bold ${accent}`}>{title}</h2>
    <div className="text-gray-300 space-y-3 leading-relaxed text-[15px]">{children}</div>
  </section>
);

const Bullet: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="flex items-start gap-2">
    <span className="text-teal-400 mt-0.5">•</span>
    <span>{children}</span>
  </li>
);

export function ComplianceSubdomainPage() {
  return (
    <PublicSubdomainShell
      eyebrow="Trust center"
      title="Security & Compliance"
      description="A transparent view of the safeguards, governance practices, and standards alignment behind LandSurv.ai."
      contentClassName="max-w-5xl"
    >
        <div className="mb-5 rounded-2xl border border-teal-400/20 bg-teal-950/25 p-6">
          <p className="font-bold text-teal-300 mb-1">Implementation Status</p>
          <p className="text-teal-100/85 text-sm leading-relaxed">
            LandSurv.ai maintains a compliance program aligned with SOC 2 Trust Services Criteria and GDPR principles.
            We are also aligned with Google Secure AI Framework (SAIF) principles for model-consumer risk management.
            FedRAMP status: LandSurv.ai is not currently FedRAMP Authorized; we maintain a FedRAMP-readiness control program,
            and any claim of authorization will only be made after a completed assessment and formal authorization package.
            This page summarizes technical and operational controls. Binding legal terms remain on legal and terms pages.
          </p>
          <p className="text-teal-100/70 text-xs mt-2">
            SAIF alignment statement: this is an operational alignment claim, not a certification or third-party attestation.
          </p>
        </div>

        <Section title="1. Framework Coverage">
          <ul className="space-y-2 text-sm">
            <Bullet>SOC 2 alignment: Security, Availability, Confidentiality, Processing Integrity, Privacy-supporting controls.</Bullet>
            <Bullet>GDPR alignment: lawfulness/transparency, minimization, storage limitation, integrity/confidentiality, accountability.</Bullet>
            <Bullet>SAIF alignment: prompt injection, sensitive data disclosure, rogue actions, insecure integrated components, insecure model output, and denial-of-service risk controls.</Bullet>
            <Bullet>FedRAMP-readiness alignment: NIST SP 800-53 Rev. 5 control families mapped for cloud SaaS operations, with implementation and POA&amp;M tracking.</Bullet>
            <Bullet>RICS and professional-practice disclaimers remain available at legal.landsurv.ai.</Bullet>
          </ul>
        </Section>

        <Section title="2. FedRAMP Readiness (Current State)" accent="text-amber-300">
          <p className="text-sm">
            Current designation: <span className="font-semibold text-amber-200">FedRAMP readiness in progress</span>.
            We do not claim an active FedRAMP ATO at this time.
          </p>
          <ul className="space-y-2 text-sm mt-2">
            <Bullet>
              <span className="text-gray-100 font-semibold">Implemented hardening controls.</span> Production startup can enforce FIPS mode (`FEDRAMP_FIPS_REQUIRED=true`),
              QR-session cryptography requires environment-provided secrets in production, and sensitive API surfaces use no-store cache controls with transport/browser hardening headers.
            </Bullet>
            <Bullet>
              <span className="text-gray-100 font-semibold">Operational controls in progress.</span> SSP/POA&amp;M documentation,
              vulnerability-management SLA evidence, access-review cadence, and incident-response/testing evidence are maintained as part of our audit lifecycle.
            </Bullet>
            <Bullet>
              <span className="text-gray-100 font-semibold">Authorization gating.</span> FedRAMP authorization language is prohibited in customer-facing claims
              until independent assessment and sponsor authorization are complete.
            </Bullet>
          </ul>
        </Section>

        <Section title="3. Core Technical Controls">
          <ul className="space-y-2 text-sm">
            <Bullet>Authentication and role-restricted admin workflows.</Bullet>
            <Bullet>Audit logging on critical administrative and security-sensitive operations.</Bullet>
            <Bullet>Rate limiting and abuse controls on public and privileged endpoints.</Bullet>
            <Bullet>Transport and browser-hardening headers, including HSTS in production deployments.</Bullet>
            <Bullet>No-store caching policy on sensitive API surfaces.</Bullet>
          </ul>
        </Section>

        <Section title="4. SAIF Agent Security Controls">
          <ul className="space-y-2 text-sm">
            <Bullet>
              <span className="text-gray-100 font-semibold">Agent permissions (least privilege).</span> Tools and privileged workflows are constrained to only the capabilities required for a task.
            </Bullet>
            <Bullet>
              <span className="text-gray-100 font-semibold">Agent user control.</span> High-risk actions are user-driven and policy-gated, with explicit acknowledgement requirements for advanced model usage.
            </Bullet>
            <Bullet>
              <span className="text-gray-100 font-semibold">Agent observability.</span> Security-sensitive operations and policy acknowledgements are logged for auditability and incident response.
            </Bullet>
            <Bullet>
              <span className="text-gray-100 font-semibold">Input/output safeguards.</span> Prompt and response handling applies validation/sanitization patterns to reduce injection and insecure-output risk.
            </Bullet>
          </ul>
        </Section>

        <Section title="5. Data Rights & Retention Operations">
          <p>
            Data subject rights workflows are available for authorized operators, including export,
            delete/anonymize operations, and retention cleanup preview/execute operations.
          </p>
          <ul className="space-y-2 text-sm">
            <Bullet>Subject data export workflow.</Bullet>
            <Bullet>Subject data deletion or anonymization workflow.</Bullet>
            <Bullet>Retention cleanup workflow with preview and execution modes.</Bullet>
          </ul>
        </Section>

        <Section title="6. AI Governance &amp; Model Provider Compliance" accent="text-orange-400">
          <p className="text-sm">
            LandSurv.ai uses large language models exclusively through Google Cloud Vertex AI, including
            Anthropic Claude models (Sonnet, Opus, Haiku, and Claude Fable 5). We operate these models in
            accordance with the terms and acceptable-use policies of both providers.
          </p>
          <ul className="space-y-2 text-sm">
            <Bullet>
              <span className="text-gray-100 font-semibold">Google Model Armor for Vertex AI traffic.</span> Where enabled, Google-hosted model requests are screened before and after model execution using per-request Model Armor templates, so prompt and response inspection can block or sanitize unsafe content at the backend.
            </Bullet>
            <Bullet>
              <span className="text-gray-100 font-semibold">Anthropic Usage Policy enforcement.</span> All Claude
              requests require explicit acknowledgement of the Anthropic Usage Policy before use. The backend
              rejects any Claude request lacking recorded consent (HTTP 412), capturing the accepted policy
              version and timestamp for accountability.
            </Bullet>
            <Bullet>
              <span className="text-gray-100 font-semibold">Advanced AI Safety Addendum (Claude Fable 5).</span>{' '}
              Claude Fable 5 additionally requires acceptance of an Advanced AI Safety Addendum. The backend
              blocks Fable 5 inference (HTTP 412) until this addendum is acknowledged, with version and
              timestamp logged.
            </Bullet>
            <Bullet>
              <span className="text-gray-100 font-semibold">Prohibited-use controls.</span> Prohibited-use
              categories under the Anthropic Usage Policy (including malware/cyber abuse, fraud/deception,
              illegal activity, and privacy/identity abuse) are surfaced to operators, with human-review and
              AI-use disclosure expectations for applicable high-risk use cases.
            </Bullet>
            <Bullet>
              <span className="text-gray-100 font-semibold">Google Cloud / Vertex AI terms.</span> Model
              inference runs on Google Cloud Vertex AI under the Google Cloud Platform Terms of Service and the
              Vertex AI / Generative AI acceptable-use and data-governance terms.
            </Bullet>
          </ul>
          <p className="text-sm">
            Providers are named in our subprocessor list:{' '}
            <a className="text-cyan-400 hover:underline" href="https://subprocessors.landsurv.ai" target="_blank" rel="noopener noreferrer">subprocessors.landsurv.ai</a>.
          </p>
        </Section>

        <Section title="7. Legal and Policy References">
          <p className="text-sm">
            Legal and contractual references:
          </p>
          <ul className="space-y-2 text-sm">
            <Bullet>
              Legal and professional-practice disclosures: <a className="text-cyan-400 hover:underline" href="https://legal.landsurv.ai" target="_blank" rel="noopener noreferrer">legal.landsurv.ai</a>
            </Bullet>
            <Bullet>
              Privacy Policy: <a className="text-cyan-400 hover:underline" href="https://privacy.landsurv.ai" target="_blank" rel="noopener noreferrer">privacy.landsurv.ai</a>
            </Bullet>
            <Bullet>
              Data Processing Addendum: <a className="text-cyan-400 hover:underline" href="https://dpa.landsurv.ai" target="_blank" rel="noopener noreferrer">dpa.landsurv.ai</a>
            </Bullet>
            <Bullet>
              Subprocessors: <a className="text-cyan-400 hover:underline" href="https://subprocessors.landsurv.ai" target="_blank" rel="noopener noreferrer">subprocessors.landsurv.ai</a>
            </Bullet>
            <Bullet>
              Terms of Service: <a className="text-cyan-400 hover:underline" href="https://tos.landsurv.ai" target="_blank" rel="noopener noreferrer">tos.landsurv.ai</a>
            </Bullet>
          </ul>
        </Section>

        <Section title="8. Contact and Security Reporting" accent="text-gray-300">
          <p className="text-sm text-gray-400">
            For compliance and security questions, use the official LandSurv.ai support and legal contact channels.
            Do not send sensitive secrets or credentials over public forms.
          </p>
          <p className="text-sm text-gray-400 mt-2">
            Legal and compliance contact: <a className="text-cyan-400 hover:underline" href="mailto:legal@landsurv.ai">legal@landsurv.ai</a>
          </p>
          <p className="text-xs text-gray-500">
            Last updated: August 14, 2026.
          </p>
        </Section>
    </PublicSubdomainShell>
  );
}

export default ComplianceSubdomainPage;
