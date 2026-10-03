import React from 'react';

interface AboutPageContentProps {
  onClose?: () => void;
  onShowTech?: () => void;
  onShowDoc?: () => void;
  onShowReleaseLog?: () => void;
}

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-xl border border-white/10 bg-gray-950/35 px-4 py-3 light-theme:border-gray-200 light-theme:bg-gray-50">
    <p className="text-lg font-bold text-cyan-300 light-theme:text-cyan-700">{value}</p>
    <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
  </div>
);

export const AboutPageContent: React.FC<AboutPageContentProps> = ({
  onClose,
  onShowTech,
  onShowDoc,
  onShowReleaseLog,
}) => {
  const InteractiveLink: React.FC<{
    href: string;
    onClick?: () => void;
    children: React.ReactNode;
  }> = ({ href, onClick, children }) => (
    <a
      href={href}
      target={onClick ? undefined : '_blank'}
      rel={onClick ? undefined : 'noopener noreferrer'}
      onClick={(event) => {
        if (!onClick) return;
        event.preventDefault();
        onClose?.();
        setTimeout(onClick, 0);
      }}
      className="inline-flex items-center gap-1 font-semibold text-cyan-300 transition-colors hover:text-cyan-200 hover:underline light-theme:text-cyan-700 light-theme:hover:text-cyan-800"
    >
      {children}
      <span aria-hidden="true">→</span>
    </a>
  );

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/45 via-gray-900/80 to-emerald-950/35 p-6 shadow-xl shadow-cyan-950/20 light-theme:from-cyan-50 light-theme:via-white light-theme:to-emerald-50">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300 light-theme:text-cyan-700">Built for the work behind the lines</p>
        <h3 className="mt-3 max-w-2xl text-3xl font-extrabold tracking-tight text-white light-theme:text-gray-900">
          AI-native tools for survey and civil teams.
        </h3>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-300 light-theme:text-gray-700">
          LandSurv.ai brings specialized AI agents, spatial tools, and connected CAD workflows into one professional workspace. It helps teams move from field data and legal descriptions to reviewable, exportable project information with less friction.
        </p>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat value="AI agents" label="Specialized workflows" />
          <Stat value=".lsvz" label="Portable project context" />
          <Stat value="Civil 3D" label="Connected drafting" />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-xl border border-gray-700 bg-gray-900/50 p-5 light-theme:border-gray-200 light-theme:bg-gray-50">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">The platform</p>
          <h4 className="mt-2 text-lg font-bold text-gray-100 light-theme:text-gray-900">Designed around real workflows</h4>
          <p className="mt-2 text-sm leading-6 text-gray-400 light-theme:text-gray-600">
            Work with boundary descriptions, point data, CAD standards, plan sheets, GIS layers, GNSS/RINEX files, contour surfaces, zoning research, and more. Each agent is purpose-built while sharing project context where it matters.
          </p>
        </article>
        <article className="rounded-xl border border-gray-700 bg-gray-900/50 p-5 light-theme:border-gray-200 light-theme:bg-gray-50">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-300">Professional control</p>
          <h4 className="mt-2 text-lg font-bold text-gray-100 light-theme:text-gray-900">Review stays with your team</h4>
          <p className="mt-2 text-sm leading-6 text-gray-400 light-theme:text-gray-600">
            LandSurv.ai is a software tool, not a licensed surveying or engineering service. Its outputs are designed to support professional workflows and must be reviewed and verified by qualified users before project use.
          </p>
        </article>
      </section>

      <section className="rounded-xl border border-emerald-400/20 bg-emerald-950/20 p-5 light-theme:bg-emerald-50">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300 light-theme:text-emerald-700">Access that fits your workflow</p>
        <h4 className="mt-2 text-lg font-bold text-gray-100 light-theme:text-gray-900">Flexible AI access, clear choices</h4>
        <p className="mt-2 text-sm leading-6 text-gray-300 light-theme:text-gray-700">
          LandSurv.ai is a paid platform. Use a purchased LandSurv Enabling Key for hosted access, or connect a personal Google Gemini API key when bring-your-own-key access is appropriate for your organization. Never share a key in public chat.
        </p>
      </section>

      <section className="rounded-xl border border-gray-700 bg-gray-900/50 p-5 light-theme:border-gray-200 light-theme:bg-gray-50">
        <h4 className="text-lg font-bold text-gray-100 light-theme:text-gray-900">Explore LandSurv.ai</h4>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <InteractiveLink href="https://agents.landsurv.ai">All agents</InteractiveLink>
          <InteractiveLink href="https://civil3d.landsurv.ai">Civil 3D integration</InteractiveLink>
          <InteractiveLink href="https://lsvz.landsurv.ai" onClick={onShowDoc}>.lsvz documentation</InteractiveLink>
          <InteractiveLink href="https://release.landsurv.ai" onClick={onShowReleaseLog}>Release log</InteractiveLink>
          <InteractiveLink href="https://technologies.landsurv.ai" onClick={onShowTech}>Technologies and licenses</InteractiveLink>
          <InteractiveLink href="https://legal.landsurv.ai">Legal and professional-practice information</InteractiveLink>
        </div>
      </section>
    </div>
  );
};
