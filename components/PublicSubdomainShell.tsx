import React from 'react';

interface PublicSubdomainShellProps {
  eyebrow: string;
  title: string;
  description: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  actionLabel?: string;
  actionHref?: string;
  contentClassName?: string;
}

export function PublicSubdomainShell({
  eyebrow,
  title,
  description,
  meta,
  children,
  actionLabel = 'Launch App',
  actionHref = 'https://landsurv.ai',
  contentClassName = '',
}: PublicSubdomainShellProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950 text-gray-200">
      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-gray-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <a href="https://landsurv.ai" className="font-extrabold tracking-tighter text-gray-100">
            Land<span className="text-cyan-400">Surv</span><span className="text-emerald-400">.ai</span>
          </a>
          <a
            href={actionHref}
            className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20"
          >
            {actionLabel}
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12 lg:px-8">
        <section className="overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/50 via-gray-900/80 to-emerald-950/35 px-6 py-8 shadow-2xl shadow-cyan-950/20 sm:px-10 sm:py-10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">{eyebrow}</p>
          <h1 className="mt-3 max-w-4xl text-3xl font-extrabold tracking-tight text-white sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-3xl leading-7 text-gray-300">{description}</p>
          {meta && <div className="mt-5 text-sm text-gray-400">{meta}</div>}
        </section>
        <div className={`mt-8 ${contentClassName}`}>{children}</div>
      </main>
    </div>
  );
}
