import React from 'react';
import {
  AlertTriangle,
  ExternalLink,
  Link2,
  ShieldCheck,
} from 'lucide-react';
import type { A2UIZoningSourceLedger } from '../types';

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function safeHttpUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

export const A2UIZoningSources: React.FC<{ ledger: A2UIZoningSourceLedger }> = ({ ledger }) => {
  const citations = ledger.citations ?? [];
  const sources = ledger.sources ?? [];

  return (
    <section
      data-testid="a2ui-zoning-sources"
      className="overflow-hidden rounded-xl border border-emerald-500/30 bg-slate-950/80 shadow-lg shadow-emerald-950/20"
    >
      <header className="border-b border-emerald-500/20 bg-emerald-950/20 px-3.5 py-2.5">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-200">
                Citation ledger
              </h4>
              <span className="rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-emerald-300">
                {citations.length} citation{citations.length === 1 ? '' : 's'}
              </span>
              {ledger.jurisdiction && (
                <span className="truncate text-[10px] text-cyan-300/80">{ledger.jurisdiction}</span>
              )}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              Each citation is paired with the URL returned for it. Unverified means no scrapeable source was
              returned — do not treat it as confirmed.
            </p>
          </div>
        </div>
      </header>

      {citations.length > 0 ? (
        <ul className="divide-y divide-slate-800/80">
          {citations.map((citation, index) => {
            const href = safeHttpUrl(citation.url);
            const isLinked = citation.status === 'linked' && !!href;
            return (
              <li
                key={`${citation.citation}-${index}`}
                data-testid="a2ui-zoning-citation"
                className="px-3.5 py-2.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded border border-cyan-500/25 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-cyan-200">
                    {citation.citation}
                  </span>
                  <span
                    className={
                      isLinked
                        ? 'rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-300'
                        : 'rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-300'
                    }
                  >
                    {isLinked ? 'Linked' : 'Unverified'}
                  </span>
                  {citation.title && (
                    <span className="min-w-0 truncate text-[11px] text-slate-300">{citation.title}</span>
                  )}
                </div>

                {citation.quote && (
                  <blockquote className="mt-1.5 border-l-2 border-emerald-500/30 pl-2 text-[11px] leading-relaxed text-slate-400">
                    {citation.quote}
                  </blockquote>
                )}

                {isLinked && href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open source for ${citation.citation}`}
                    className="mt-1.5 inline-flex max-w-full items-center gap-1 text-[11px] font-medium text-emerald-300 underline-offset-2 hover:text-emerald-200 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    <span className="truncate">{hostOf(href)}</span>
                  </a>
                ) : (
                  <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-300/90">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{citation.note || 'No source URL was returned for this citation.'}</span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-3.5 py-2.5 text-[11px] text-amber-300/90">
          No section-level citations were returned for this answer.
        </p>
      )}

      {sources.length > 0 && (
        <div className="border-t border-slate-800/80 bg-slate-900/40 px-3.5 py-2.5">
          <div className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-slate-400">
            General research sources
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {sources.map((source, index) => {
              const href = safeHttpUrl(source.url);
              if (!href) return null;
              return (
                <a
                  key={`${href}-${index}`}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open general source ${index + 1}`}
                  className="inline-flex max-w-full items-center gap-1 rounded border border-slate-700 bg-slate-800/70 px-1.5 py-0.5 text-[10.5px] text-cyan-300 hover:border-cyan-500/50 hover:text-cyan-200"
                >
                  <Link2 className="h-3 w-3 shrink-0" />
                  <span className="truncate">{source.title || hostOf(href)}</span>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {ledger.note && (
        <p className="border-t border-slate-800/80 px-3.5 py-2 text-[10px] text-slate-500">{ledger.note}</p>
      )}
    </section>
  );
};
