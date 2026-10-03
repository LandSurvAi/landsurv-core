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

const subprocessorRows = [
  { vendor: 'Google Cloud Platform', purpose: 'Hosting, storage, networking, observability', region: 'Multi-region / region-specific by deployment' },
  { vendor: 'Google Cloud Vertex AI', purpose: 'Managed LLM inference platform (host for Gemini and Anthropic Claude models)', region: 'us-west1 / us-east5 and region-specific by deployment' },
  { vendor: 'Anthropic (via Google Cloud Vertex AI)', purpose: 'Claude model inference (Sonnet, Opus, Haiku, Claude Fable 5), governed by the Anthropic Usage Policy', region: 'Delivered through Google Cloud Vertex AI regions' },
  { vendor: 'Stripe', purpose: 'Billing and subscription payment processing', region: 'As provided by Stripe services' },
  { vendor: 'PayPal', purpose: 'Payment processing for designated purchase flows', region: 'As provided by PayPal services' },
  { vendor: 'Email service providers', purpose: 'Operational email and MFA delivery', region: 'As configured by LandSurv.ai operations' },
];

export function SubprocessorsSubdomainPage() {
  return (
    <PublicSubdomainShell
      eyebrow="Privacy center"
      title="Subprocessors"
      description="The third parties that help operate, secure, and deliver LandSurv.ai."
      meta="Last updated: July 8, 2026"
      contentClassName="max-w-5xl"
    >
        <div className="mb-5 rounded-2xl border border-cyan-400/20 bg-cyan-950/25 p-6 text-sm text-cyan-100/90">
          This list identifies third-party subprocessors used to support LandSurv.ai operations.
          Scope and providers may change over time; this page is updated as changes occur.
        </div>

        <Section title="1. Current Subprocessors">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] overflow-hidden rounded-lg border border-white/[0.1] text-sm">
              <thead className="bg-slate-950/70 text-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 border-b border-gray-700">Vendor</th>
                  <th className="text-left px-4 py-3 border-b border-gray-700">Purpose</th>
                  <th className="text-left px-4 py-3 border-b border-gray-700">Primary Region</th>
                </tr>
              </thead>
              <tbody>
                {subprocessorRows.map((row) => (
                  <tr key={row.vendor} className="border-b border-white/[0.06] last:border-b-0">
                    <td className="px-4 py-3 text-gray-100">{row.vendor}</td>
                    <td className="px-4 py-3">{row.purpose}</td>
                    <td className="px-4 py-3 text-gray-400">{row.region}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="2. Change Management">
          <p className="text-sm">
            Subprocessor additions or material changes are reviewed through internal security/compliance processes.
            Customers may request current subprocessor details through legal channels.
          </p>
          <p className="text-sm">
            Reviews are also included in our quarterly SAIF-aligned AI risk governance cycle for model-consumer controls,
            ensuring provider and processing-purpose statements stay consistent across trust surfaces.
          </p>
        </Section>

        <Section title="3. Related Documents" accent="text-gray-300">
          <p className="text-sm text-gray-400">
            Privacy Policy: <a href="https://privacy.landsurv.ai" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">privacy.landsurv.ai</a>
            <br />
            DPA Summary: <a href="https://dpa.landsurv.ai" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">dpa.landsurv.ai</a>
            <br />
            Legal Disclosures: <a href="https://legal.landsurv.ai" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">legal.landsurv.ai</a>
          </p>
        </Section>
    </PublicSubdomainShell>
  );
}

export default SubprocessorsSubdomainPage;
