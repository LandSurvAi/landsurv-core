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
      description="The open-source core of LandSurv.ai: a complete professional surveying CAD platform and multi-agent AI operating environment — interactive drawing canvas, COGO mathematical engine, ALTA/NSPS boundary closure, Delaunay TIN terrain & contouring, Civil 3D integration, open standards (CACP protocol & .lsvz container), and local multi-provider AI support (Gemini, OpenAI, Anthropic, xAI)."
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
          clone it, bring your own AI provider key, and run the entire CAD and agent suite locally.
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

      <Section title="What's included in landsurv-core">
        <p>
          <code>landsurv-core</code> is far more than a set of specifications — it is a complete, production-grade
          surveying CAD drafting and computational system with an autonomous multi-agent operating framework:
        </p>
        <ul className="space-y-3 mt-3">
          <Bullet>
            <strong className="text-gray-100">Interactive CAD Drawing Canvas &amp; Drafting Engine:</strong> Full
            2D/3D graphics canvas, viewport navigation, object snapping, layer manager, point cloud renderer,
            custom symbol library, titleblock editor, sheet views, and DXF R2000–R2021 import/export.
          </Bullet>
          <Bullet>
            <strong className="text-gray-100">Surveying Computation (COGO &amp; Boundary Closure):</strong> Traverse
            computation, inverse calculations, bearing/distance geometry, ALTA/NSPS 2021 closure verification,
            error-of-closure vectors, relative positional precision, and Bowditch (Compass Rule) traverse adjustment.
          </Bullet>
          <Bullet>
            <strong className="text-gray-100">Terrain Modeling, TIN &amp; Contouring:</strong> Delaunay Triangulated
            Irregular Network (TIN) surface generation, interval-based contour line generation, slope aspect calculations,
            and steep-slope environmental analysis reports.
          </Bullet>
          <Bullet>
            <strong className="text-gray-100">Civil Drafting, Stationing &amp; Cut Sheets:</strong> Road centerline alignments,
            stationing with equation offsets, cut/fill grade sheets, utility linework, and automated surveyor fieldbook logging.
          </Bullet>
          <Bullet>
            <strong className="text-gray-100">Point Management &amp; Data Exchange:</strong> Full point editor supporting
            PNEZD, .RAW, and CSV files with sequential auto-numbering, block reservations, and point list management.
          </Bullet>
          <Bullet>
            <strong className="text-gray-100">CAD Manager &amp; Drafting Standards:</strong> Automated Description Key builder,
            feature-code-to-layer translation, and organization-wide drafting standard enforcement.
          </Bullet>
          <Bullet>
            <strong className="text-gray-100">Autonomous Multi-Agent AI Suite (Local BYOK):</strong> Full client-side
            agent system (Point Editor, Boundary &amp; Deed Reader, Civil Drafter, Contouring Agent, CAD Manager, Voice Agent, AR Field HUD)
            runnable directly with your own Gemini, OpenAI, Claude, or Grok keys with zero vendor lock-in.
          </Bullet>
          <Bullet>
            <strong className="text-gray-100">Civil 3D Open Bridge:</strong> The open-source <code>civil3d-client</code> C#/.NET
            plugin enabling bidirectional sync and description key mapping between local Autodesk Civil 3D sessions and the agent bus.
          </Bullet>
          <Bullet>
            <strong className="text-gray-100">Open Protocols &amp; Container Standards:</strong> Full, literal code implementation
            of both the <a href="https://cacp.landsurv.ai" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">CACP inter-agent protocol</a> and
            the <a href="https://lsvz.landsurv.ai" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">.lsvz workspace archive standard</a> (CC BY 4.0).
          </Bullet>
        </ul>
      </Section>

      <Section title="Open Standards & Industry Specifications" accent="text-cyan-400">
        <p>
          LandSurv.ai bridges classical land surveying engineering standards with modern, AI-assisted workflows.
          The codebase conforms to established international geodetic and CAD specifications, while contributing
          two modern open standards (CACP and .lsvz) published with dedicated documentation sites:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
          <div className="rounded-xl border border-white/[0.08] bg-slate-900/60 p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-white text-base">CACP Protocol</h3>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Open Spec
                </span>
              </div>
              <p className="text-sm text-gray-300 mb-3">
                Cross-Agent Communications Protocol: the open standard for inter-agent skill dispatch,
                intent routing, and field-to-CAD orchestration. Implemented in <code>services/CacpSchema.ts</code>,{' '}
                <code>services/cacpIntentRouter.ts</code>, <code>services/cacpRouter.ts</code>, and <code>civil3d-client/CacpEventListener.cs</code>.
              </p>
            </div>
            <a
              href="https://cacp.landsurv.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-cyan-400 hover:text-cyan-300 hover:underline pt-2 border-t border-white/[0.06]"
            >
              Visit cacp.landsurv.ai specification &rarr;
            </a>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-slate-900/60 p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-white text-base">.lsvz File Format</h3>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  CC BY 4.0
                </span>
              </div>
              <p className="text-sm text-gray-300 mb-3">
                The AI-native survey workspace container format: an open, auditable ZIP archive containing
                structured JSON manifests for points, linework, deeds, closures, and CACP state. Implemented in{' '}
                <code>utils/sessionZip.ts</code>, <code>utils/lsvzSchema.ts</code>, and <code>services/LsvzPersistence.ts</code>.
              </p>
            </div>
            <a
              href="https://lsvz.landsurv.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-amber-400 hover:text-amber-300 hover:underline pt-2 border-t border-white/[0.06]"
            >
              Visit lsvz.landsurv.ai specification &rarr;
            </a>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-slate-900/60 p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-white text-base">Industry Standards Directory</h3>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Industry Directory
                </span>
              </div>
              <p className="text-sm text-gray-300 mb-3">
                Our complete standards matrix covering geodesy (EPSG / NGS SPCS83 &amp; SPCS27), traverse standards (ALTA/NSPS 2021),
                data exchange (DXF, GeoJSON RFC 7946, GPX 1.1), and legal boundary guidelines.
              </p>
            </div>
            <a
              href="https://standards.landsurv.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-blue-400 hover:text-blue-300 hover:underline pt-2 border-t border-white/[0.06]"
            >
              Visit standards.landsurv.ai &rarr;
            </a>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-slate-900/60 p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-white text-base">Civil 3D Open Integration</h3>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  .NET / C#
                </span>
              </div>
              <p className="text-sm text-gray-300 mb-3">
                Open C#/.NET bridge (<code>civil3d-client</code>) enabling bidirectional sync between local Autodesk Civil 3D sessions and the open agent bus, with description key mapping.
              </p>
            </div>
            <a
              href="https://civil3d.landsurv.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-indigo-400 hover:text-indigo-300 hover:underline pt-2 border-t border-white/[0.06]"
            >
              Visit civil3d.landsurv.ai &rarr;
            </a>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-slate-900/60 p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-white text-base">Documentation &amp; User Guides</h3>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  User Guides
                </span>
              </div>
              <p className="text-sm text-gray-300 mb-3">
                Comprehensive technical guides, COGO manuals, step-by-step drafting workflows, and agent architecture documentation for field surveyors and CAD drafters.
              </p>
            </div>
            <a
              href="https://docs.landsurv.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-purple-400 hover:text-purple-300 hover:underline pt-2 border-t border-white/[0.06]"
            >
              Visit docs.landsurv.ai &rarr;
            </a>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-slate-900/60 p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-white text-base">Technologies &amp; Libraries</h3>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20">
                  Tech Stack
                </span>
              </div>
              <p className="text-sm text-gray-300 mb-3">
                Complete audit of our open-source dependencies, mathematical libraries (Proj4, JSZip, Leaflet), upstream open-source credits, and software licensing breakdown.
              </p>
            </div>
            <a
              href="https://technologies.landsurv.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-teal-400 hover:text-teal-300 hover:underline pt-2 border-t border-white/[0.06]"
            >
              Visit technologies.landsurv.ai &rarr;
            </a>
          </div>
        </div>
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
