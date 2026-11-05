import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Search, Sparkles, X } from 'lucide-react';
import {
  searchA2UISurfaces,
  type A2UISurfaceAudience,
  type A2UISurfaceCategory,
  type A2UISurfaceDefinition,
} from '../services/a2uiSurfaces.ts';

interface A2UISurfaceConsoleProps {
  audience: A2UISurfaceAudience;
  onLaunch: (definition: A2UISurfaceDefinition) => void;
  onClose?: () => void;
  /** Override the default "Surface console" heading. */
  title?: string;
}

const CATEGORY_LABELS: Record<A2UISurfaceCategory, string> = {
  capture: 'Capture',
  explore: 'Explore',
  workspace: 'Workspace',
  protocol: 'CACP',
  dialog: 'Dialogs',
  system: 'System',
};

const ACCENT_DOT: Record<string, string> = {
  cyan: 'bg-cyan-400',
  emerald: 'bg-emerald-400',
  amber: 'bg-amber-400',
  fuchsia: 'bg-fuchsia-400',
  sky: 'bg-sky-400',
  rose: 'bg-rose-400',
};

/**
 * Searchable launcher for every A2UI surface in the current context.
 *
 * It is deliberately data-driven: the catalog is the single source of truth,
 * so adding a surface anywhere in the product automatically makes it
 * discoverable here.
 */
export const A2UISurfaceConsole: React.FC<A2UISurfaceConsoleProps> = ({
  audience,
  onLaunch,
  onClose,
  title = 'Surface console',
}) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<A2UISurfaceCategory | 'all'>('all');

  // The console itself is not a destination; keep it out of its own catalog.
  const available = useMemo(
    () => searchA2UISurfaces('', audience).filter(definition => definition.id !== 'surface-console'),
    [audience],
  );
  const categories = useMemo(() => {
    const present = new Set(available.map(definition => definition.category));
    return Array.from(present);
  }, [available]);

  const results = useMemo(() => {
    const matches = searchA2UISurfaces(query, audience);
    return category === 'all' ? matches : matches.filter(definition => definition.category === category);
  }, [audience, category, query]);

  return (
    <div data-testid="a2ui-surface-console" className="flex min-h-0 flex-col">
      <div className="border-b border-white/[0.08] px-3.5 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300">
              <Sparkles className="h-3 w-3" />
              {title}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-slate-400">
              {audience === 'public'
                ? 'Inspect CACP and this page without leaving it. No project required.'
                : 'Every interactive surface, in one place. Launch without hunting through chat.'}
            </p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close surface console"
              className="rounded-md border border-white/[0.08] p-1 text-slate-400 transition-colors hover:border-white/[0.18] hover:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="relative mt-2.5">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search surfaces, agents, skills…"
            aria-label="Search A2UI surfaces"
            className="w-full rounded-md border border-white/[0.09] bg-white/[0.03] py-1.5 pl-8 pr-2.5 text-[11.5px] text-slate-100 placeholder:text-slate-500 outline-none transition-colors focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/15"
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setCategory('all')}
            aria-pressed={category === 'all'}
            className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide transition-colors ${
              category === 'all'
                ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-200'
                : 'border-white/[0.07] bg-white/[0.02] text-slate-400 hover:border-white/[0.14] hover:text-slate-200'
            }`}
          >
            All <span className="font-mono opacity-60">{available.length}</span>
          </button>
          {categories.map(option => (
            <button
              key={option}
              type="button"
              onClick={() => setCategory(option)}
              aria-pressed={category === option}
              className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide transition-colors ${
                category === option
                  ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-200'
                  : 'border-white/[0.07] bg-white/[0.02] text-slate-400 hover:border-white/[0.14] hover:text-slate-200'
              }`}
            >
              {CATEGORY_LABELS[option]}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {results.length === 0 ? (
          <p className="px-2 py-6 text-center text-[11px] text-slate-500">
            No surfaces match “{query}”. Try “CACP”, “points”, or “zoning”.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {results.map(definition => (
              <button
                key={definition.id}
                type="button"
                data-testid={`a2ui-surface-catalog-${definition.id}`}
                onClick={() => onLaunch(definition)}
                className="group flex w-full items-start gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2 text-left transition-colors hover:border-cyan-400/35 hover:bg-cyan-400/[0.06]"
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/[0.09] bg-[#050b13] font-mono text-[10px] font-bold text-slate-300 group-hover:border-cyan-400/30 group-hover:text-cyan-200">
                  {definition.glyph}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[11.5px] font-semibold text-slate-100">{definition.title}</span>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ACCENT_DOT[definition.accent] ?? ACCENT_DOT.cyan}`} />
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-snug text-slate-400">{definition.description}</span>
                  <span className="mt-1 flex items-center gap-1.5 text-[8.5px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                    {CATEGORY_LABELS[definition.category]}
                    {definition.agent && <span className="text-slate-600">·</span>}
                    {definition.agent && <span className="normal-case tracking-normal text-slate-500">{definition.agent}</span>}
                  </span>
                </span>
                <ArrowUpRight className="mt-0.5 h-3 w-3 shrink-0 text-slate-600 transition-colors group-hover:text-cyan-300" />
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="border-t border-white/[0.07] px-3 py-2 text-[9px] text-slate-500">
        Shortcut: <kbd className="rounded border border-white/[0.1] bg-white/[0.04] px-1 py-px font-mono text-[9px] text-slate-300">Ctrl</kbd> +{' '}
        <kbd className="rounded border border-white/[0.1] bg-white/[0.04] px-1 py-px font-mono text-[9px] text-slate-300">Shift</kbd> +{' '}
        <kbd className="rounded border border-white/[0.1] bg-white/[0.04] px-1 py-px font-mono text-[9px] text-slate-300">A</kbd>
      </p>
    </div>
  );
};

export default A2UISurfaceConsole;
