import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { DevOpsTab, DevOpsTabId } from './devopsConsoleNav';

export interface DevOpsSearchTarget {
  tab: DevOpsTabId;
  /** Sub-section understood by the destination panel (SurveyBrain). */
  section?: string;
}

interface DevOpsSearchResult extends DevOpsSearchTarget {
  key: string;
  label: string;
  hint: string;
  kind: 'tab' | 'section';
  keywords: string[];
}

interface DevOpsSearchPaletteProps {
  open: boolean;
  tabs: DevOpsTab[];
  onClose: () => void;
  onNavigate: (target: DevOpsSearchTarget) => void;
}

const MAX_RESULTS = 40;

function buildIndex(tabs: DevOpsTab[]): DevOpsSearchResult[] {
  const results: DevOpsSearchResult[] = [];
  for (const tab of tabs) {
    results.push({
      key: `tab:${tab.id}`,
      tab: tab.id,
      label: tab.label,
      hint: tab.hint,
      kind: 'tab',
      keywords: [tab.group, ...tab.keywords],
    });
    for (const section of tab.sections ?? []) {
      results.push({
        key: `section:${tab.id}:${section.section ?? section.label}`,
        tab: tab.id,
        section: section.section,
        label: section.label,
        hint: `${tab.label} · ${section.section ? 'jump to section' : 'tab section'}`,
        kind: 'section',
        keywords: [...tab.keywords, ...(section.keywords ?? [])],
      });
    }
  }
  return results;
}

/**
 * Ctrl/Cmd-K palette for the whole DevOps console. It indexes every tab plus
 * the named panels/sections inside them, so the console can keep growing
 * without forcing operators to hunt through sticky navigation.
 */
export function DevOpsSearchPalette({
  open,
  tabs,
  onClose,
  onNavigate,
}: DevOpsSearchPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const index = useMemo(() => buildIndex(tabs), [tabs]);

  const results = useMemo(() => {
    const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      return index.filter((item) => item.kind === 'tab').slice(0, MAX_RESULTS);
    }
    return index
      .map((item) => {
        const haystack = [item.label, item.hint, ...item.keywords]
          .join(' ')
          .toLowerCase();
        if (!tokens.every((token) => haystack.includes(token))) return null;
        const label = item.label.toLowerCase();
        const score = tokens.every((token) => label.includes(token))
          ? 0
          : tokens.every((token) => label.startsWith(token))
            ? 1
            : 2;
        return { item, score };
      })
      .filter((entry): entry is { item: DevOpsSearchResult; score: number } => Boolean(entry))
      .sort((a, b) => a.score - b.score || a.item.label.localeCompare(b.item.label))
      .slice(0, MAX_RESULTS)
      .map((entry) => entry.item);
  }, [index, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const choose = (result: DevOpsSearchResult | undefined) => {
    if (!result) return;
    onNavigate({ tab: result.tab, section: result.section });
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center bg-slate-950/70 px-4 pt-[12vh] backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search DevOps console"
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220] shadow-[0_30px_100px_-20px_rgba(0,0,0,0.9)]"
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3.5">
          <span className="text-lg text-cyan-300" aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
              } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex((index) => Math.min(results.length - 1, index + 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex((index) => Math.max(0, index - 1));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                choose(results[activeIndex]);
              }
            }}
            placeholder="Search tabs, panels, settings, SurveyBrain sections…"
            aria-label="Search DevOps console"
            className="min-w-0 flex-1 bg-transparent text-base text-slate-100 outline-none placeholder:text-slate-500"
          />
          <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
            ESC
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <p className="text-sm font-medium text-slate-300">No matching destination</p>
              <p className="mt-1 text-xs text-slate-500">
                Try a service name, setting, or section such as “SurveyBrain ingest”.
              </p>
            </div>
          ) : (
            results.map((result, index) => {
              const active = index === activeIndex;
              return (
                <button
                  key={result.key}
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(result)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                    active ? 'bg-cyan-400/10 text-white' : 'text-slate-300 hover:bg-white/[0.04]'
                  }`}
                >
                  <span
                    className={`grid h-7 w-7 flex-none place-items-center rounded-lg border text-[11px] ${
                      result.kind === 'tab'
                        ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200'
                        : 'border-slate-600 bg-slate-800 text-slate-400'
                    }`}
                    aria-hidden="true"
                  >
                    {result.kind === 'tab' ? '▸' : '↳'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{result.label}</span>
                    <span className="block truncate text-[11px] text-slate-500">{result.hint}</span>
                  </span>
                  {active && (
                    <span className="hidden flex-none font-mono text-[10px] text-slate-500 sm:block">
                      Enter ↵
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 text-[10px] text-slate-500">
          <span>{results.length} destination{results.length === 1 ? '' : 's'}</span>
          <span className="flex items-center gap-3">
            <span>↑↓ move</span>
            <span>↵ open</span>
          </span>
        </div>
      </div>
    </div>
  );
}
