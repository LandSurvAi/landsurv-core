import React from 'react';
import { PublicSubdomainShell } from './PublicSubdomainShell.tsx';

/**
 * opensource.landsurv.ai — landsurv-core public release
 *
 * Public landing page for the landsurv-core open-source repository:
 * https://github.com/LandSurvAi/landsurv-core (Apache-2.0).
 */

const Section: React.FC<{ title: string; children: React.ReactNode; accent?: string }> = ({
  title,
  children,
  accent = 'text-emerald-400',
}) => (
  <section className="mb-5 rounded-2xl border border-white/[0.08] bg-slate-950/35 p-6 sm:p-7">
    <h2 className={`text-xl font-bold ${accent}`}>{title}</h2>
    <div className="text-gray-300 space-y-3 leading-relaxed text-[15px]">{children}</div>
  </section>
);

const Bullet: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="flex items-start gap-2">
    <span className="text-emerald-400 mt-0.5">•</span>
    <span>{children}</span>
  </li>
);

export function OpenSourceSubdomainPage() {
  return (
    <PublicSubdomainShell
      eyebrow="Open source release"
      title="landsurv-core"
      description="The open-source core of LandSurv.ai: COGO/coordinate-geometry math, boundary closure, DXF I/O, contouring/TIN/steep-slope, the CAD drawing canvas, point editor, and CAD Manager — runnable entirely locally with your own AI provider key (Gemini, OpenAI, Anthropic, or xAI)."
      actionLabel="View on GitHub"
      actionHref="https://github.com/LandSurvAi/landsurv-core"
      contentClassName="max-w-5xl"
    >
      <div className="mb-5 rounded-2xl border border-emerald-400/20 bg-emerald-950/25 p-6">
        <p className="font-bold text-emerald-300 mb-1">Apache-2.0 — public now</p>
        <p className="text-emerald-100/85 text-sm leading-relaxed">
          <a
            href="https://github.com/LandSurvAi/landsurv-core"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-300 hover:underline"
          >
            github.com/LandSurvAi/landsurv-core
          </a>{' '}
          is free and open-source software. No backend server, account, or billing is required — just
          clone it, bring your own AI provider key, and run it locally.
        </p>
      </div>

      <Section title="Why open source">
        <p>
          Surveying and civil engineering firms depend on their tools for legal, load-bearing work —
          boundary closures and plan annotations end up in recorded deeds and stamped drawings. Software
          that decides those numbers shouldn't be a black box.
        </p>
        <ul className="space-y-2">
          <Bullet>
            <strong className="text-gray-100">Verifiable math.</strong> You can read the exact COGO,
            closure, and TIN/contouring algorithms producing your results instead of trusting a vendor's
            word for it — critical when a closure report or boundary call might be challenged.
          </Bullet>
          <Bullet>
            <strong className="text-gray-100">No vendor lock-in.</strong> The core tools keep working even
            if LandSurv.ai the company disappears tomorrow. You can fork it, patch it, and keep using it
            indefinitely under Apache-2.0.
          </Bullet>
          <Bullet>
            <strong className="text-gray-100">Community-hardened.</strong> Public code gets more eyes on
            it. Bugs in coordinate math or DXF parsing get found and fixed faster when anyone can read the
            source and open a pull request.
          </Bullet>
          <Bullet>
            <strong className="text-gray-100">Free as in free.</strong> Firms that can't justify a SaaS
            subscription can still run the core tools locally, at zero cost, with their own AI provider key.
          </Bullet>
          <Bullet>
            <strong className="text-gray-100">Healthy incentives.</strong> The commercially hosted product
            at landsurv.ai earns its keep through the parts that genuinely require infrastructure — licensed
            GNSS/geodetic data, drone processing compute, and support — not by locking up the math everyone
            needs.
          </Bullet>
        </ul>
      </Section>

      <Section title="Quick start">
        <pre className="rounded-lg border border-white/[0.08] bg-slate-900/70 p-4 text-sm text-gray-200 overflow-x-auto">
          <code>{`git clone https://github.com/LandSurvAi/landsurv-core.git\ncd landsurv-core\nnpm install\nnpm run dev:oss`}</code>
        </pre>
        <p className="mt-3">
          Open the app, go to Settings, and paste your own AI provider API key. No backend server,
          account, or billing is required.
        </p>
      </Section>

      <Section title="What's included">
        <ul className="space-y-2">
          <Bullet>COGO / coordinate-geometry calculations and boundary closure reports</Bullet>
          <Bullet>DXF import/export</Bullet>
          <Bullet>Contouring, TIN, and steep-slope analysis</Bullet>
          <Bullet>The CAD drawing canvas and point editor</Bullet>
          <Bullet>CAD Manager (description key builder)</Bullet>
        </ul>
      </Section>

      <Section title="What's not included" accent="text-amber-400">
        <p>
          GNSS/RINEX processing, drone photogrammetry, and zoning/flood/structures/soils research call a
          hosted backend with licensed data sources and are not part of this repository. The DevOps
          console and billing surfaces are also excluded — those are specific to the commercially hosted{' '}
          <a href="https://landsurv.ai" className="text-emerald-400 hover:underline">landsurv.ai</a> product.
        </p>
      </Section>

      <p className="text-sm text-gray-500">
        Issues and contributions are welcome on{' '}
        <a
          href="https://github.com/LandSurvAi/landsurv-core"
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-400 hover:underline"
        >
          GitHub
        </a>.
      </p>
    </PublicSubdomainShell>
  );
}
