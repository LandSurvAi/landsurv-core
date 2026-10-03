import React, { useCallback, useMemo, useRef, useState } from 'react';
import { parseDxfForSymbol } from '../utils/dxfParser.ts';
import { getSymbolCategories, type LibrarySymbol } from '../data/surveySymbolLibrary.ts';

/*
 * Starter Symbol Library Builder (DevOps)
 * ───────────────────────────────────────
 * Upload/organize tool for assembling the baked-in starter symbol pack. You
 * drop .dxf files, name/categorize/tag each glyph, and export the whole set as
 * a ready-to-bake `LibrarySymbol[]` (JSON or a paste-ready .ts snippet) that
 * can be dropped into data/surveySymbolLibrary.ts.
 *
 * Storage is intentionally local (localStorage) for now — this is an authoring
 * surface, not a runtime feature. Nothing here ships to end users until the
 * exported array is committed into the library source.
 */

const STORAGE_KEY = 'landsurv.devops.starterSymbols.v1';

/** A starter symbol is a LibrarySymbol plus a stable draft key for editing. */
interface DraftSymbol extends LibrarySymbol {
  /** Internal editor key (not exported). */
  _key: string;
}

const slugify = (s: string): string =>
  s.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'symbol';

const loadDrafts = (): DraftSymbol[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((s): s is LibrarySymbol => !!s && typeof s.svgPath === 'string')
      .map((s, i) => ({
        id: s.id || slugify(s.name || `symbol-${i}`),
        name: s.name || 'Untitled',
        description: s.description || '',
        category: s.category || 'Uncategorized',
        svgPath: s.svgPath,
        fillPath: s.fillPath,
        viewBox: s.viewBox || '0 0 24 24',
        tags: Array.isArray(s.tags) ? s.tags : [],
        _key: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
      }));
  } catch {
    return [];
  }
};

const toLibrarySymbol = (d: DraftSymbol): LibrarySymbol => ({
  id: d.id,
  name: d.name,
  description: d.description,
  category: d.category,
  svgPath: d.svgPath,
  ...(d.fillPath ? { fillPath: d.fillPath } : {}),
  viewBox: d.viewBox,
  tags: d.tags,
});

const download = (filename: string, content: string, mime: string) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const SymbolPreview: React.FC<{ svgPath: string; fillPath?: string; viewBox: string; size?: number }> = ({ svgPath, fillPath, viewBox, size = 56 }) => (
  <svg width={size} height={size} viewBox={viewBox} className="text-cyan-300">
    <path d={svgPath} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    {fillPath && <path d={fillPath} fill="currentColor" stroke="none" />}
  </svg>
);

export const StarterSymbolLibraryTab: React.FC = () => {
  const [drafts, setDrafts] = useState<DraftSymbol[]>(() => loadDrafts());
  const [isParsing, setIsParsing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState('all');
  const [search, setSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const persist = useCallback((next: DraftSymbol[]) => {
    setDrafts(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next.map(toLibrarySymbol)));
    } catch {
      /* quota / privacy mode — the in-memory list still works this session */
    }
  }, []);

  const categories = useMemo(() => {
    const base = new Set<string>(getSymbolCategories());
    drafts.forEach(d => { if (d.category) base.add(d.category); });
    return Array.from(base).sort();
  }, [drafts]);

  const existingIds = useMemo(() => drafts.map(d => d.id), [drafts]);
  const duplicateIds = useMemo(() => {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    existingIds.forEach(id => { if (seen.has(id)) dupes.add(id); else seen.add(id); });
    return dupes;
  }, [existingIds]);

  const uniqueId = useCallback((base: string, taken: Set<string>): string => {
    let id = base;
    let n = 2;
    while (taken.has(id)) { id = `${base}-${n}`; n++; }
    return id;
  }, []);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    setError(null);
    setIsParsing(true);
    const taken = new Set(existingIds);
    const added: DraftSymbol[] = [];
    const failures: string[] = [];
    for (const file of Array.from(files)) {
      if (!file.name.toLowerCase().endsWith('.dxf')) {
        failures.push(`${file.name} (not a .dxf)`);
        continue;
      }
      try {
        const content = await file.text();
        const { svgPath, viewBox } = parseDxfForSymbol(content);
        if (!svgPath) {
          failures.push(`${file.name} (no LINE/LWPOLYLINE geometry found)`);
          continue;
        }
        const baseName = file.name.replace(/\.[^/.]+$/, '');
        const id = uniqueId(slugify(baseName), taken);
        taken.add(id);
        added.push({
          _key: `${Date.now()}-${added.length}-${Math.random().toString(36).slice(2, 8)}`,
          id,
          name: baseName,
          description: '',
          category: 'Uncategorized',
          svgPath,
          viewBox,
          tags: [],
        });
      } catch (e) {
        failures.push(`${file.name} (${e instanceof Error ? e.message : 'parse error'})`);
      }
    }
    if (added.length > 0) persist([...drafts, ...added]);
    if (failures.length > 0) setError(`Skipped ${failures.length} file(s): ${failures.join(', ')}`);
    setIsParsing(false);
  }, [drafts, existingIds, persist, uniqueId]);

  const updateDraft = useCallback((key: string, patch: Partial<LibrarySymbol>) => {
    persist(drafts.map(d => (d._key === key ? { ...d, ...patch } : d)));
  }, [drafts, persist]);

  const removeDraft = useCallback((key: string) => {
    persist(drafts.filter(d => d._key !== key));
  }, [drafts, persist]);

  const moveDraft = useCallback((key: string, dir: -1 | 1) => {
    const idx = drafts.findIndex(d => d._key === key);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= drafts.length) return;
    const next = [...drafts];
    [next[idx], next[target]] = [next[target], next[idx]];
    persist(next);
  }, [drafts, persist]);

  const handleImport = useCallback(async (file: File) => {
    setError(null);
    try {
      const text = await file.text();
      const arr = JSON.parse(text);
      if (!Array.isArray(arr)) throw new Error('Expected a JSON array of symbols');
      const taken = new Set(existingIds);
      const imported: DraftSymbol[] = arr
        .filter((s: unknown): s is LibrarySymbol => !!s && typeof (s as LibrarySymbol).svgPath === 'string')
        .map((s: LibrarySymbol, i: number) => {
          const id = uniqueId(s.id || slugify(s.name || `symbol-${i}`), taken);
          taken.add(id);
          return {
            _key: `${Date.now()}-imp-${i}-${Math.random().toString(36).slice(2, 8)}`,
            id,
            name: s.name || 'Untitled',
            description: s.description || '',
            category: s.category || 'Uncategorized',
            svgPath: s.svgPath,
            fillPath: s.fillPath,
            viewBox: s.viewBox || '0 0 24 24',
            tags: Array.isArray(s.tags) ? s.tags : [],
          };
        });
      if (imported.length === 0) throw new Error('No valid symbols in file');
      persist([...drafts, ...imported]);
    } catch (e) {
      setError(`Import failed: ${e instanceof Error ? e.message : 'invalid file'}`);
    }
  }, [drafts, existingIds, persist, uniqueId]);

  const exportJson = useCallback(() => {
    download('starter-symbols.json', JSON.stringify(drafts.map(toLibrarySymbol), null, 2), 'application/json');
  }, [drafts]);

  const exportTs = useCallback(() => {
    const body = drafts.map(toLibrarySymbol).map(s => {
      const lines = [
        `  {`,
        `    id: ${JSON.stringify(s.id)},`,
        `    name: ${JSON.stringify(s.name)},`,
        `    description: ${JSON.stringify(s.description)},`,
        `    category: ${JSON.stringify(s.category)},`,
        `    svgPath: ${JSON.stringify(s.svgPath)},`,
        ...(s.fillPath ? [`    fillPath: ${JSON.stringify(s.fillPath)},`] : []),
        `    viewBox: ${JSON.stringify(s.viewBox)},`,
        `    tags: ${JSON.stringify(s.tags)},`,
        `  },`,
      ];
      return lines.join('\n');
    }).join('\n');
    const file =
      `import type { LibrarySymbol } from './surveySymbolLibrary';\n\n` +
      `// Generated by DevOps → Starter Symbols. Paste these into\n` +
      `// SURVEY_SYMBOL_LIBRARY in surveySymbolLibrary.ts to bake them in.\n` +
      `export const STARTER_SYMBOLS: LibrarySymbol[] = [\n${body}\n];\n`;
    download('starterSymbols.ts', file, 'text/plain');
  }, [drafts]);

  const clearAll = useCallback(() => {
    if (window.confirm('Remove all uploaded starter symbols? This cannot be undone.')) persist([]);
  }, [persist]);

  const visible = useMemo(() => {
    const q = search.toLowerCase().trim();
    return drafts.filter(d => {
      if (filterCategory !== 'all' && d.category !== filterCategory) return false;
      if (!q) return true;
      return d.name.toLowerCase().includes(q)
        || d.id.toLowerCase().includes(q)
        || d.description.toLowerCase().includes(q)
        || d.tags.some(t => t.toLowerCase().includes(q));
    });
  }, [drafts, filterCategory, search]);

  return (
    <main className="flex-1 bg-slate-900 overflow-auto p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">🧩 Starter Symbol Library</h2>
            <p className="text-slate-400 text-sm mt-1 max-w-2xl">
              Upload .dxf glyphs and organize them into the baked-in starter pack. Export the finished set as JSON or a
              paste-ready <code className="text-cyan-300">LibrarySymbol[]</code> for <code className="text-cyan-300">surveySymbolLibrary.ts</code>.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={exportTs} disabled={drafts.length === 0} className="px-3 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-md disabled:bg-slate-600 disabled:cursor-not-allowed">Export .ts snippet</button>
            <button onClick={exportJson} disabled={drafts.length === 0} className="px-3 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-md disabled:bg-slate-600 disabled:cursor-not-allowed">Export JSON</button>
            <label className="px-3 py-2 text-sm font-semibold bg-slate-700 hover:bg-slate-600 text-white rounded-md cursor-pointer">
              Import JSON
              <input type="file" accept=".json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ''; }} />
            </label>
            <button onClick={clearAll} disabled={drafts.length === 0} className="px-3 py-2 text-sm font-semibold bg-red-700/70 hover:bg-red-700 text-white rounded-md disabled:bg-slate-600 disabled:cursor-not-allowed">Clear all</button>
          </div>
        </div>

        {/* Upload dropzone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }}
          className={`cursor-pointer flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg transition-colors mb-4 ${isDragging ? 'border-cyan-400 bg-slate-800/60' : 'border-slate-600 hover:border-cyan-500 bg-slate-800/30'}`}
        >
          <input ref={fileInputRef} type="file" accept=".dxf" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }} />
          {isParsing ? (
            <div className="w-7 h-7 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <span className="text-3xl mb-2">⬆️</span>
              <span className="text-white font-semibold">Drop .dxf files here</span>
              <span className="text-slate-400 text-xs mt-1">or click to browse — multiple files supported</span>
            </>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-md bg-amber-900/40 border border-amber-700/50 text-amber-200 text-sm">{error}</div>
        )}

        {/* Filters + count */}
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <span className="text-slate-300 text-sm font-medium">{drafts.length} symbol{drafts.length === 1 ? '' : 's'}</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name / id / tag…"
            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-md text-white text-sm focus:border-cyan-500 focus:outline-none"
          />
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-md text-white text-sm focus:border-cyan-500 focus:outline-none">
            <option value="all">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {duplicateIds.size > 0 && (
            <span className="text-amber-400 text-xs">⚠ {duplicateIds.size} duplicate id{duplicateIds.size === 1 ? '' : 's'} — fix before exporting</span>
          )}
        </div>

        {drafts.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <p className="text-sm">No starter symbols yet. Drop some .dxf files above to begin.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visible.map((d, i) => {
              const isDup = duplicateIds.has(d.id);
              return (
                <div key={d._key} className="bg-slate-800 rounded-lg border border-slate-700 p-4 flex gap-4">
                  <div className="flex-shrink-0 flex flex-col items-center gap-2">
                    <div className="w-20 h-20 bg-slate-900 rounded-md flex items-center justify-center">
                      <SymbolPreview svgPath={d.svgPath} fillPath={d.fillPath} viewBox={d.viewBox} />
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => moveDraft(d._key, -1)} disabled={i === 0 && filterCategory === 'all' && !search} title="Move up" className="px-2 py-0.5 text-xs bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-30">↑</button>
                      <button onClick={() => moveDraft(d._key, 1)} title="Move down" className="px-2 py-0.5 text-xs bg-slate-700 hover:bg-slate-600 rounded">↓</button>
                      <button onClick={() => removeDraft(d._key)} title="Delete" className="px-2 py-0.5 text-xs bg-red-800/70 hover:bg-red-700 rounded">✕</button>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div>
                      <label className="block text-[11px] uppercase tracking-wide text-slate-500 mb-0.5">Name</label>
                      <input value={d.name} onChange={(e) => updateDraft(d._key, { name: e.target.value })} className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-sm focus:border-cyan-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-[11px] uppercase tracking-wide text-slate-500 mb-0.5">Id {isDup && <span className="text-amber-400 normal-case">· duplicate</span>}</label>
                      <input value={d.id} onChange={(e) => updateDraft(d._key, { id: slugify(e.target.value) })} className={`w-full px-2 py-1 bg-slate-900 border rounded text-white text-sm font-mono focus:outline-none ${isDup ? 'border-amber-500' : 'border-slate-700 focus:border-cyan-500'}`} />
                    </div>
                    <div>
                      <label className="block text-[11px] uppercase tracking-wide text-slate-500 mb-0.5">Category</label>
                      <input list="starter-categories" value={d.category} onChange={(e) => updateDraft(d._key, { category: e.target.value })} className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-sm focus:border-cyan-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-[11px] uppercase tracking-wide text-slate-500 mb-0.5">Description</label>
                      <input value={d.description} onChange={(e) => updateDraft(d._key, { description: e.target.value })} className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-sm focus:border-cyan-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-[11px] uppercase tracking-wide text-slate-500 mb-0.5">Tags (comma-separated)</label>
                      <input value={d.tags.join(', ')} onChange={(e) => updateDraft(d._key, { tags: e.target.value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) })} className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-sm focus:border-cyan-500 focus:outline-none" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <datalist id="starter-categories">
          {categories.map(c => <option key={c} value={c} />)}
        </datalist>
      </div>
    </main>
  );
};

export default StarterSymbolLibraryTab;
