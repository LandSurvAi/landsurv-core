import React, { useEffect, useMemo, useState } from 'react';
import { useCadManager } from '../contexts/CadManagerContext.tsx';
import type { A2UIStandardsFacet, A2UIStandardsFilter } from '../types.ts';

const SearchGlyph = () => (
  <svg
    aria-hidden="true"
    className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <circle cx="11" cy="11" r="7" />
    <path strokeLinecap="round" strokeLinejoin="round" d="m20 20-3.5-3.5" />
  </svg>
);

interface A2UIStandardsTableProps {
  filter?: A2UIStandardsFilter;
  onOpenEditor?: () => void;
}

const FACET_LABELS: Record<A2UIStandardsFacet, string> = {
  all: 'All',
  layers: 'Layers',
  codes: 'Codes',
  linetypes: 'Linetypes',
  symbols: 'Symbols',
};

function symbolLabel(symbol: unknown): string {
  if (typeof symbol === 'string') return symbol;
  if (symbol && typeof symbol === 'object' && 'name' in symbol) {
    return String((symbol as { name?: unknown }).name ?? '');
  }
  return '—';
}

/**
 * Compact CAD-standards table used by A2UI surfaces. It reads the live standard
 * from CadManagerContext so it always matches the editor, and starts from the
 * facet/query extracted from the user's question.
 */
export const A2UIStandardsTable: React.FC<A2UIStandardsTableProps> = ({
  filter,
  onOpenEditor,
}) => {
  const { state, getAllLayers } = useCadManager();
  const standard = state.standard;
  const [facet, setFacet] = useState<A2UIStandardsFacet>(filter?.facet ?? 'all');
  const [query, setQuery] = useState(filter?.query ?? '');

  useEffect(() => {
    setFacet(filter?.facet ?? 'all');
    setQuery(filter?.query ?? '');
  }, [filter?.facet, filter?.query]);

  const layers = useMemo(() => {
    if (!standard) return [];
    const byName = new Map((standard.layers ?? []).map(layer => [layer.name.toUpperCase(), layer]));
    return getAllLayers().map(layer => ({
      ...layer,
      linetype: byName.get(layer.name.toUpperCase())?.lineType,
    }));
  }, [standard, getAllLayers]);

  const codes = useMemo(() => standard?.codes ?? [], [standard]);
  const linetypes = useMemo(() => standard?.linetypes ?? [], [standard]);
  const symbols = useMemo(
    () => codes.filter(code => symbolLabel(code.symbol) !== '—'),
    [codes]
  );

  const normalized = query.trim().toLowerCase();
  const matches = (values: Array<string | number | undefined | null>) =>
    !normalized || values.some(value => String(value ?? '').toLowerCase().includes(normalized));

  const filteredCodes = codes.filter(code =>
    matches([
      code.code,
      code.description,
      code.pointLayer,
      code.lineLayer,
      code.lineType,
      code.category,
      symbolLabel(code.symbol),
    ])
  );
  const filteredLayers = layers.filter(layer =>
    matches([layer.name, layer.description, layer.linetype, layer.isPointLayer ? 'point' : '', layer.isLineLayer ? 'line' : ''])
  );
  const filteredLinetypes = linetypes.filter(linetype =>
    matches([linetype.name, linetype.description, linetype.patternLength, linetype.isComplex ? 'complex' : ''])
  );
  const filteredSymbols = symbols.filter(code =>
    matches([code.code, code.description, symbolLabel(code.symbol), code.category])
  );

  if (!standard) {
    return (
      <div className="rounded-lg border border-dashed border-white/[0.1] px-3 py-5 text-center text-[11px] text-slate-500">
        No CAD standard is loaded yet. Upload one to explore its layers and codes here.
      </div>
    );
  }

  const counts: Record<A2UIStandardsFacet, number> = {
    all: codes.length,
    layers: layers.length,
    codes: codes.length,
    linetypes: linetypes.length,
    symbols: symbols.length,
  };

  const resultCount =
    facet === 'layers'
      ? filteredLayers.length
      : facet === 'linetypes'
        ? filteredLinetypes.length
        : facet === 'symbols'
          ? filteredSymbols.length
          : filteredCodes.length;

  const total =
    facet === 'layers'
      ? layers.length
      : facet === 'linetypes'
        ? linetypes.length
        : facet === 'symbols'
          ? symbols.length
          : codes.length;

  const cell = 'px-2 py-1 align-top text-[10px] leading-snug';
  const head = 'sticky top-0 z-10 bg-[#0c1320] px-2 py-1 text-left text-[9px] font-bold uppercase tracking-[0.1em] text-slate-500';

  return (
    <div data-testid="a2ui-standards-table" className="overflow-hidden rounded-lg border border-white/[0.09] bg-[#0a111c]">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-white/[0.07] px-2.5 py-2">
        <span className="mr-auto truncate text-[11px] font-semibold text-slate-200">{standard.name}</span>
        <span className="rounded border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[9px] text-slate-400">
          {codes.length} codes
        </span>
        <span className="rounded border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[9px] text-slate-400">
          {layers.length} layers
        </span>
        {onOpenEditor && (
          <button
            type="button"
            onClick={onOpenEditor}
            className="rounded border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-cyan-300 transition-colors hover:border-cyan-400 hover:bg-cyan-500/20"
          >
            Open editor
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1 px-2.5 py-2">
        <div className="relative min-w-[10rem] flex-1">
          <SearchGlyph />
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Filter layer, code, linetype, symbol…"
            aria-label="Filter CAD standards sheet"
            className="w-full rounded-md border border-white/[0.08] bg-white/[0.03] py-1 pl-7 pr-2 text-[10.5px] text-slate-200 placeholder:text-slate-500 focus:border-cyan-500/40 focus:outline-none"
          />
        </div>
        {(['all', 'layers', 'codes', 'linetypes', 'symbols'] as const).map(option => (
          <button
            key={option}
            type="button"
            aria-pressed={facet === option}
            onClick={() => setFacet(option)}
            className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold transition-colors ${
              facet === option
                ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200'
                : 'border-white/[0.06] bg-white/[0.02] text-slate-400 hover:border-white/[0.14] hover:text-slate-200'
            }`}
          >
            {FACET_LABELS[option]} <span className="font-mono opacity-60">{counts[option]}</span>
          </button>
        ))}
      </div>

      <div className="max-h-56 overflow-y-auto border-t border-white/[0.06]">
        {(facet === 'layers') && (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={head}>Layer</th>
                <th className={head}>Use</th>
                <th className={head}>Linetype</th>
                <th className={head}>Description</th>
              </tr>
            </thead>
            <tbody>
              {filteredLayers.map(layer => (
                <tr key={layer.name} className="border-t border-white/[0.04]">
                  <td className={`${cell} font-mono text-cyan-200`}>{layer.name}</td>
                  <td className={`${cell} text-slate-400`}>
                    {[layer.isPointLayer ? 'point' : '', layer.isLineLayer ? 'line' : ''].filter(Boolean).join(' + ') || '—'}
                  </td>
                  <td className={`${cell} font-mono text-slate-300`}>{layer.linetype || '—'}</td>
                  <td className={`${cell} text-slate-400`}>{layer.description || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {(facet === 'all' || facet === 'codes') && (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={head}>Code</th>
                <th className={head}>Description</th>
                <th className={head}>Point layer</th>
                <th className={head}>Line layer</th>
                <th className={head}>Linetype</th>
                <th className={head}>Category</th>
              </tr>
            </thead>
            <tbody>
              {filteredCodes.map(code => (
                <tr key={code.code} className="border-t border-white/[0.04]">
                  <td className={`${cell} font-mono font-semibold text-cyan-200`}>{code.code}</td>
                  <td className={`${cell} text-slate-300`}>{code.description}</td>
                  <td className={`${cell} font-mono text-slate-400`}>{code.pointLayer || '—'}</td>
                  <td className={`${cell} font-mono text-slate-400`}>{code.lineLayer || '—'}</td>
                  <td className={`${cell} font-mono text-slate-400`}>{code.lineType || 'CONTINUOUS'}</td>
                  <td className={`${cell} text-slate-500`}>{code.category || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {facet === 'linetypes' && (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={head}>Linetype</th>
                <th className={head}>Description</th>
                <th className={head}>Pattern</th>
              </tr>
            </thead>
            <tbody>
              {filteredLinetypes.map(linetype => (
                <tr key={linetype.name} className="border-t border-white/[0.04]">
                  <td className={`${cell} font-mono text-cyan-200`}>{linetype.name}</td>
                  <td className={`${cell} text-slate-300`}>{linetype.description || '—'}</td>
                  <td className={`${cell} font-mono text-slate-400`}>
                    {linetype.isComplex ? 'complex' : `${linetype.pattern?.length ?? 0} dashes`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {facet === 'symbols' && (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={head}>Code</th>
                <th className={head}>Symbol</th>
                <th className={head}>Description</th>
                <th className={head}>Category</th>
              </tr>
            </thead>
            <tbody>
              {filteredSymbols.map(code => (
                <tr key={code.code} className="border-t border-white/[0.04]">
                  <td className={`${cell} font-mono font-semibold text-cyan-200`}>{code.code}</td>
                  <td className={`${cell} font-mono text-slate-300`}>{symbolLabel(code.symbol)}</td>
                  <td className={`${cell} text-slate-400`}>{code.description}</td>
                  <td className={`${cell} text-slate-500`}>{code.category || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {resultCount === 0 && (
          <div className="px-3 py-5 text-center text-[10.5px] text-slate-500">
            No rows match {query.trim() ? `“${query.trim()}”` : 'this filter'}. Adjust the filter above.
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-white/[0.07] px-2.5 py-1.5 text-[9.5px] text-slate-500">
        <span>
          Showing {resultCount} of {total}
        </span>
        <span>Ask about another layer, code, or linetype to refilter</span>
      </div>
    </div>
  );
};

export default A2UIStandardsTable;
