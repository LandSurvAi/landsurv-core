import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useCadManager } from '../contexts/CadManagerContext.tsx';
import type { CodeDefinition, StandardDefinition } from '../contexts/types/CadManager.types.ts';
import { scoreStandardsMatch } from '../services/standardsA2UI.ts';
import type { A2UIStandardsFacet, A2UIStandardsFilter } from '../types.ts';
import { StandardsEditor } from './CadManager/StandardsEditor.tsx';

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
  onOpenSpreadsheetEditor?: () => void;
}

type EditableCodeField = 'code' | 'description' | 'pointLayer' | 'lineLayer' | 'lineType' | 'category' | 'symbol';

interface ActiveCellEdit {
  kind: 'code' | 'layer' | 'linetype';
  key: string;
  field: string;
  value: string;
}

const FACET_LABELS: Record<A2UIStandardsFacet, string> = {
  all: 'All',
  layers: 'Layers',
  codes: 'Codes',
  linetypes: 'Linetypes',
  symbols: 'Symbols',
};

function symbolLabel(symbol: unknown): string {
  if (typeof symbol === 'string') return symbol || '—';
  if (symbol && typeof symbol === 'object' && 'name' in symbol) {
    return String((symbol as { name?: unknown }).name ?? '') || '—';
  }
  return '—';
}

/**
 * Interactive CAD-standards spreadsheet table used by A2UI surfaces.
 *
 * Supports:
 * - Instant inline cell editing (click or double-click any cell to edit)
 * - Adding and deleting code/layer rows inline with Undo/Redo
 * - Launching the full-screen portaled StandardsEditor (including direct jumps
 *   to F2F Settings, Team Codes, and Auto-Assign Symbols)
 */
export const A2UIStandardsTable: React.FC<A2UIStandardsTableProps> = ({
  filter,
  onOpenEditor,
  onOpenSpreadsheetEditor,
}) => {
  const cadManager = useCadManager();
  const standard = cadManager.state?.standard ?? null;
  const dispatch = cadManager.dispatch;
  const getAllLayers = cadManager.getAllLayers;

  const datalistId = useId();
  const [facet, setFacet] = useState<A2UIStandardsFacet>(filter?.facet ?? 'all');
  const [query, setQuery] = useState(filter?.query ?? '');
  const [activeEdit, setActiveEdit] = useState<ActiveCellEdit | null>(null);
  const [undoStack, setUndoStack] = useState<StandardDefinition[]>([]);
  const [redoStack, setRedoStack] = useState<StandardDefinition[]>([]);
  const [localStandardOverride, setLocalStandardOverride] = useState<StandardDefinition | null>(null);
  const [fullEditorModal, setFullEditorModal] = useState<'editor' | 'f2f' | 'team-codes' | 'auto-assign' | null>(null);

  const effectiveStandard = localStandardOverride ?? standard;

  useEffect(() => {
    setLocalStandardOverride(null);
  }, [standard]);

  useEffect(() => {
    setFacet(filter?.facet ?? 'all');
    setQuery(filter?.query ?? '');
  }, [filter?.facet, filter?.query]);

  const commitStandard = useCallback(
    (next: StandardDefinition, recordUndo = true) => {
      if (recordUndo && effectiveStandard) {
        setUndoStack(prev => [...prev.slice(-19), effectiveStandard]);
        setRedoStack([]);
      }
      if (typeof dispatch === 'function') {
        dispatch({ type: 'SET_STANDARD', payload: next });
        setLocalStandardOverride(null);
      } else {
        setLocalStandardOverride(next);
      }
    },
    [dispatch, effectiveStandard],
  );

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0 || !effectiveStandard) return;
    const previous = undoStack[undoStack.length - 1];
    setRedoStack(prev => [...prev, effectiveStandard]);
    setUndoStack(prev => prev.slice(0, -1));
    commitStandard(previous, false);
  }, [undoStack, effectiveStandard, commitStandard]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0 || !effectiveStandard) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(prev => [...prev, effectiveStandard]);
    setRedoStack(prev => prev.slice(0, -1));
    commitStandard(next, false);
  }, [redoStack, effectiveStandard, commitStandard]);

  const layers = useMemo(() => {
    if (!effectiveStandard) return [];
    const byName = new Map(
      (effectiveStandard.layers ?? []).map(layer => [layer.name.toUpperCase(), layer]),
    );
    const rawLayers = typeof getAllLayers === 'function' ? getAllLayers() : [];
    const merged = rawLayers.map(layer => ({
      ...layer,
      linetype: byName.get(layer.name.toUpperCase())?.lineType,
      description: byName.get(layer.name.toUpperCase())?.description ?? layer.description,
    }));
    const seen = new Set(merged.map(l => l.name.toUpperCase()));
    for (const explicit of effectiveStandard.layers ?? []) {
      if (!seen.has(explicit.name.toUpperCase())) {
        merged.push({
          name: explicit.name,
          isPointLayer: false,
          isLineLayer: true,
          linetype: explicit.lineType,
          description: explicit.description,
        });
      }
    }
    return merged;
  }, [effectiveStandard, getAllLayers]);

  const codes = useMemo(() => effectiveStandard?.codes ?? [], [effectiveStandard]);
  const linetypes = useMemo(() => effectiveStandard?.linetypes ?? [], [effectiveStandard]);
  const symbols = useMemo(
    () => codes.filter(code => symbolLabel(code.symbol) !== '—'),
    [codes],
  );

  const availableLayerNames = useMemo(() => {
    const names = new Set<string>();
    for (const l of layers) if (l.name) names.add(l.name);
    for (const c of codes) {
      if (c.pointLayer && c.pointLayer !== '-') names.add(c.pointLayer);
      if (c.lineLayer && c.lineLayer !== '-') names.add(c.lineLayer);
    }
    return [...names].sort();
  }, [layers, codes]);

  const availableLinetypeNames = useMemo(() => {
    const names = new Set<string>(['CONTINUOUS', 'DASHED', 'HIDDEN', 'CENTER', 'PHANTOM', 'FENCELINE']);
    for (const lt of linetypes) if (lt.name) names.add(lt.name);
    for (const c of codes) if (c.lineType && c.lineType !== '-') names.add(c.lineType);
    return [...names].sort();
  }, [linetypes, codes]);

  const availableCategories = useMemo(() => {
    const cats = new Set<string>(['Control', 'Topo', 'Pavement', 'Utilities', 'Boundary', 'Structures', 'Vegetation', 'Misc']);
    for (const c of codes) if (c.category) cats.add(c.category);
    return [...cats].sort();
  }, [codes]);

  const startCodeEdit = (codeKey: string, field: EditableCodeField, currentValue: string) => {
    setActiveEdit({
      kind: 'code',
      key: codeKey,
      field,
      value: currentValue === '—' ? '' : currentValue,
    });
  };

  const startLayerEdit = (layerName: string, field: 'linetype' | 'description', currentValue: string) => {
    setActiveEdit({
      kind: 'layer',
      key: layerName,
      field,
      value: currentValue === '—' ? '' : currentValue,
    });
  };

  const startLinetypeEdit = (ltName: string, currentValue: string) => {
    setActiveEdit({
      kind: 'linetype',
      key: ltName,
      field: 'description',
      value: currentValue === '—' ? '' : currentValue,
    });
  };

  const saveActiveEdit = () => {
    if (!activeEdit || !effectiveStandard) {
      setActiveEdit(null);
      return;
    }
    const trimmed = activeEdit.value.trim();

    if (activeEdit.kind === 'code') {
      const idx = codes.findIndex(c => c.code === activeEdit.key);
      if (idx !== -1) {
        const current = codes[idx];
        const field = activeEdit.field as EditableCodeField;
        const prevVal = field === 'symbol' ? symbolLabel(current.symbol) : String(current[field] ?? '');
        if (prevVal !== trimmed) {
          const nextCodes = [...codes];
          const updated: CodeDefinition = { ...current };
          if (field === 'symbol') {
            updated.symbol = trimmed || undefined;
          } else {
            (updated as any)[field] = trimmed || (field === 'lineLayer' ? '-' : '');
          }
          updated.userEdits = {
            ...(updated.userEdits || {}),
            [field]: {
              editedAt: new Date().toISOString(),
              originalValue: prevVal,
            },
          };
          nextCodes[idx] = updated;
          commitStandard({ ...effectiveStandard, codes: nextCodes });
        }
      }
    } else if (activeEdit.kind === 'layer') {
      const existingLayers = [...(effectiveStandard.layers ?? [])];
      const idx = existingLayers.findIndex(l => l.name.toUpperCase() === activeEdit.key.toUpperCase());
      const baseLayer = idx >= 0
        ? existingLayers[idx]
        : { name: activeEdit.key, color: 7, lineType: 'CONTINUOUS', description: '' };
      const updatedLayer = {
        ...baseLayer,
        ...(activeEdit.field === 'linetype' ? { lineType: trimmed || 'CONTINUOUS' } : { description: trimmed }),
      };
      if (idx >= 0) existingLayers[idx] = updatedLayer;
      else existingLayers.push(updatedLayer);
      commitStandard({ ...effectiveStandard, layers: existingLayers });
    } else if (activeEdit.kind === 'linetype') {
      const nextLinetypes = (effectiveStandard.linetypes ?? []).map(lt =>
        lt.name === activeEdit.key ? { ...lt, description: trimmed } : lt,
      );
      commitStandard({ ...effectiveStandard, linetypes: nextLinetypes });
    }

    setActiveEdit(null);
  };

  const handleAddRow = () => {
    const base: StandardDefinition = effectiveStandard ?? {
      name: 'Custom CAD Standard',
      description: 'Created in A2UI Standards Sheet',
      codes: [],
      layers: [],
      linetypes: [],
    };
    let suffix = (base.codes?.length ?? 0) + 1;
    let newCodeName = `NEW${suffix}`;
    const existingNames = new Set((base.codes ?? []).map(c => c.code.toUpperCase()));
    while (existingNames.has(newCodeName.toUpperCase())) {
      suffix += 1;
      newCodeName = `NEW${suffix}`;
    }
    const newRow: CodeDefinition = {
      code: newCodeName,
      description: 'New Description Key',
      pointLayer: 'V-SURV-PNTS',
      lineLayer: '-',
      lineType: 'CONTINUOUS',
      symbol: 'POINT',
      category: 'Misc',
    };
    commitStandard({
      ...base,
      codes: [newRow, ...(base.codes ?? [])],
    });
    if (facet !== 'all' && facet !== 'codes') {
      setFacet('codes');
    }
    setQuery('');
    setActiveEdit({
      kind: 'code',
      key: newCodeName,
      field: 'code',
      value: newCodeName,
    });
  };

  const handleDeleteCodeRow = (codeKey: string) => {
    if (!effectiveStandard) return;
    commitStandard({
      ...effectiveStandard,
      codes: (effectiveStandard.codes ?? []).filter(c => c.code !== codeKey),
    });
  };

  const handleOpenFullSpreadsheet = (modal: 'editor' | 'f2f' | 'team-codes' | 'auto-assign' = 'editor') => {
    if (!effectiveStandard) {
      commitStandard({
        name: 'Custom CAD Standard',
        description: 'Created in CAD Standards Spreadsheet Editor',
        codes: [],
        layers: [],
        linetypes: [],
      }, false);
    }
    setFullEditorModal(modal);
    if (modal === 'editor') {
      if (onOpenSpreadsheetEditor) {
        onOpenSpreadsheetEditor();
      } else {
        onOpenEditor?.();
      }
    }
  };

  const normalized = query.trim();
  const rank = (values: Array<string | number | undefined | null>) =>
    scoreStandardsMatch(values, normalized);
  const ranked = <T,>(rows: T[], values: (row: T) => Array<string | number | undefined | null>): T[] =>
    rows
      .map(row => ({ row, score: rank(values(row)) }))
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(entry => entry.row);

  const filteredCodes = ranked(codes, code => [
    code.code,
    code.description,
    code.pointLayer,
    code.lineLayer,
    code.lineType,
    code.category,
    symbolLabel(code.symbol),
  ]);
  const filteredLayers = ranked(layers, layer => [
    layer.name,
    layer.description,
    layer.linetype,
    layer.isPointLayer ? 'point' : '',
    layer.isLineLayer ? 'line' : '',
  ]);
  const filteredLinetypes = ranked(linetypes, linetype => [
    linetype.name,
    linetype.description,
    linetype.patternLength,
    linetype.isComplex ? 'complex' : '',
  ]);
  const filteredSymbols = ranked(symbols, code => [
    code.code,
    code.description,
    symbolLabel(code.symbol),
    code.category,
  ]);

  if (!effectiveStandard) {
    return (
      <>
        <div className="flex flex-col items-center gap-2.5 rounded-lg border border-dashed border-white/[0.1] px-3 py-5 text-center text-[11px] text-slate-500">
          <p>No CAD standard is loaded yet. Upload one or start a blank spreadsheet right here.</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={handleAddRow}
              data-testid="a2ui-standards-create-inline"
              className="rounded border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-semibold text-cyan-300 transition-colors hover:border-cyan-400 hover:bg-cyan-500/20"
            >
              + Add first code row
            </button>
            <button
              type="button"
              onClick={() => handleOpenFullSpreadsheet('editor')}
              data-testid="a2ui-standards-open-full-editor"
              className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300 transition-colors hover:border-emerald-400 hover:bg-emerald-500/20"
            >
              Open full spreadsheet editor
            </button>
          </div>
        </div>
        {fullEditorModal && effectiveStandard && (
          <StandardsEditor
            standard={effectiveStandard}
            initialModal={fullEditorModal === 'editor' ? null : fullEditorModal}
            onSave={updated => {
              commitStandard(updated);
              setFullEditorModal(null);
            }}
            onClose={() => setFullEditorModal(null)}
          />
        )}
      </>
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
  const editableCell = `${cell} cursor-pointer transition-colors hover:bg-cyan-500/[0.08]`;
  const head = 'sticky top-0 z-10 bg-[#0c1320] px-2 py-1 text-left text-[9px] font-bold uppercase tracking-[0.1em] text-slate-500';

  const renderInlineInput = (listId?: string) => {
    if (!activeEdit) return null;
    return (
      <input
        type="text"
        autoFocus
        list={listId}
        aria-label={`Edit ${activeEdit.field} for ${activeEdit.key}`}
        value={activeEdit.value}
        onChange={e => setActiveEdit(prev => (prev ? { ...prev, value: e.target.value } : null))}
        onBlur={saveActiveEdit}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            saveActiveEdit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setActiveEdit(null);
          }
        }}
        className="w-full min-w-[4.5rem] rounded border border-cyan-400/60 bg-[#060d17] px-1.5 py-0.5 font-mono text-[10px] text-white outline-none focus:ring-1 focus:ring-cyan-400"
      />
    );
  };

  return (
    <div data-testid="a2ui-standards-table" className="overflow-hidden rounded-lg border border-white/[0.09] bg-[#0a111c]">
      <datalist id={`${datalistId}-layers`}>
        {availableLayerNames.map(name => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <datalist id={`${datalistId}-linetypes`}>
        {availableLinetypeNames.map(name => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <datalist id={`${datalistId}-categories`}>
        {availableCategories.map(name => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-white/[0.07] px-2.5 py-2">
        <span className="mr-auto truncate text-[11px] font-semibold text-slate-200">{effectiveStandard.name}</span>
        <span className="rounded border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[9px] text-slate-400">
          {codes.length} codes
        </span>
        <span className="rounded border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[9px] text-slate-400">
          {layers.length} layers
        </span>
        <button
          type="button"
          onClick={handleAddRow}
          data-testid="a2ui-standards-add-row"
          title="Add a new description key row inline"
          className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300 transition-colors hover:border-emerald-400 hover:bg-emerald-500/20"
        >
          + Add row
        </button>
        {undoStack.length > 0 && (
          <button
            type="button"
            onClick={handleUndo}
            title="Undo inline edit"
            className="rounded border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-semibold text-slate-300 hover:bg-white/[0.08]"
          >
            Undo
          </button>
        )}
        {redoStack.length > 0 && (
          <button
            type="button"
            onClick={handleRedo}
            title="Redo inline edit"
            className="rounded border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-semibold text-slate-300 hover:bg-white/[0.08]"
          >
            Redo
          </button>
        )}
        <button
          type="button"
          onClick={() => handleOpenFullSpreadsheet('f2f')}
          title="Open Field-to-Finish Settings"
          className="rounded border border-white/[0.1] bg-white/[0.03] px-1.5 py-0.5 text-[9px] font-semibold text-slate-300 transition-colors hover:border-cyan-400/40 hover:text-cyan-200"
        >
          F2F
        </button>
        <button
          type="button"
          onClick={() => handleOpenFullSpreadsheet('team-codes')}
          title="Open Surveyor Team Code Matcher"
          className="rounded border border-white/[0.1] bg-white/[0.03] px-1.5 py-0.5 text-[9px] font-semibold text-slate-300 transition-colors hover:border-cyan-400/40 hover:text-cyan-200"
        >
          Team Codes
        </button>
        <button
          type="button"
          onClick={() => handleOpenFullSpreadsheet('editor')}
          data-testid="a2ui-standards-open-editor"
          className="rounded border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-cyan-300 transition-colors hover:border-cyan-400 hover:bg-cyan-500/20"
        >
          Open editor
        </button>
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

      <div className="max-h-64 overflow-x-auto overflow-y-auto border-t border-white/[0.06]">
        {facet === 'layers' && (
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
              {filteredLayers.map(layer => {
                const isEditingLinetype =
                  activeEdit?.kind === 'layer' && activeEdit.key === layer.name && activeEdit.field === 'linetype';
                const isEditingDesc =
                  activeEdit?.kind === 'layer' && activeEdit.key === layer.name && activeEdit.field === 'description';
                return (
                  <tr key={layer.name} className="border-t border-white/[0.04]">
                    <td className={`${cell} font-mono text-cyan-200`}>{layer.name}</td>
                    <td className={`${cell} text-slate-400`}>
                      {[layer.isPointLayer ? 'point' : '', layer.isLineLayer ? 'line' : ''].filter(Boolean).join(' + ') || '—'}
                    </td>
                    <td
                      className={`${editableCell} font-mono text-slate-300`}
                      title="Click to edit layer linetype"
                      onClick={() => !isEditingLinetype && startLayerEdit(layer.name, 'linetype', layer.linetype || 'CONTINUOUS')}
                    >
                      {isEditingLinetype ? renderInlineInput(`${datalistId}-linetypes`) : (layer.linetype || '—')}
                    </td>
                    <td
                      className={`${editableCell} text-slate-400`}
                      title="Click to edit layer description"
                      onClick={() => !isEditingDesc && startLayerEdit(layer.name, 'description', layer.description || '')}
                    >
                      {isEditingDesc ? renderInlineInput() : (layer.description || '—')}
                    </td>
                  </tr>
                );
              })}
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
                <th className={`${head} w-7 text-right`} aria-label="Row actions" />
              </tr>
            </thead>
            <tbody>
              {filteredCodes.map(code => {
                const isEditing = (field: EditableCodeField) =>
                  activeEdit?.kind === 'code' && activeEdit.key === code.code && activeEdit.field === field;
                return (
                  <tr key={code.code} className="group border-t border-white/[0.04] hover:bg-white/[0.015]">
                    <td
                      className={`${editableCell} font-mono font-semibold text-cyan-200`}
                      title="Click to edit code"
                      onClick={() => !isEditing('code') && startCodeEdit(code.code, 'code', code.code)}
                    >
                      {isEditing('code') ? renderInlineInput() : code.code}
                    </td>
                    <td
                      className={`${editableCell} text-slate-300`}
                      title="Click to edit description"
                      onClick={() => !isEditing('description') && startCodeEdit(code.code, 'description', code.description)}
                    >
                      {isEditing('description') ? renderInlineInput() : code.description}
                    </td>
                    <td
                      className={`${editableCell} font-mono text-slate-400`}
                      title="Click to edit point layer"
                      onClick={() => !isEditing('pointLayer') && startCodeEdit(code.code, 'pointLayer', code.pointLayer || '')}
                    >
                      {isEditing('pointLayer') ? renderInlineInput(`${datalistId}-layers`) : (code.pointLayer || '—')}
                    </td>
                    <td
                      className={`${editableCell} font-mono text-slate-400`}
                      title="Click to edit line layer"
                      onClick={() => !isEditing('lineLayer') && startCodeEdit(code.code, 'lineLayer', code.lineLayer || '')}
                    >
                      {isEditing('lineLayer') ? renderInlineInput(`${datalistId}-layers`) : (code.lineLayer || '—')}
                    </td>
                    <td
                      className={`${editableCell} font-mono text-slate-400`}
                      title="Click to edit linetype"
                      onClick={() => !isEditing('lineType') && startCodeEdit(code.code, 'lineType', code.lineType || 'CONTINUOUS')}
                    >
                      {isEditing('lineType') ? renderInlineInput(`${datalistId}-linetypes`) : (code.lineType || 'CONTINUOUS')}
                    </td>
                    <td
                      className={`${editableCell} text-slate-500`}
                      title="Click to edit category"
                      onClick={() => !isEditing('category') && startCodeEdit(code.code, 'category', code.category || '')}
                    >
                      {isEditing('category') ? renderInlineInput(`${datalistId}-categories`) : (code.category || '—')}
                    </td>
                    <td className={`${cell} text-right`}>
                      <button
                        type="button"
                        onClick={() => handleDeleteCodeRow(code.code)}
                        aria-label={`Delete code ${code.code}`}
                        title={`Delete ${code.code}`}
                        className="rounded px-1 text-[10px] text-slate-600 opacity-0 transition-opacity hover:bg-rose-500/20 hover:text-rose-300 group-hover:opacity-100 focus:opacity-100"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
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
              {filteredLinetypes.map(linetype => {
                const isEditingDesc =
                  activeEdit?.kind === 'linetype' && activeEdit.key === linetype.name;
                return (
                  <tr key={linetype.name} className="border-t border-white/[0.04]">
                    <td className={`${cell} font-mono text-cyan-200`}>{linetype.name}</td>
                    <td
                      className={`${editableCell} text-slate-300`}
                      title="Click to edit linetype description"
                      onClick={() => !isEditingDesc && startLinetypeEdit(linetype.name, linetype.description || '')}
                    >
                      {isEditingDesc ? renderInlineInput() : (linetype.description || '—')}
                    </td>
                    <td className={`${cell} font-mono text-slate-400`}>
                      {linetype.isComplex ? 'complex' : `${linetype.pattern?.length ?? 0} dashes`}
                    </td>
                  </tr>
                );
              })}
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
              {filteredSymbols.map(code => {
                const isEditingSym =
                  activeEdit?.kind === 'code' && activeEdit.key === code.code && activeEdit.field === 'symbol';
                return (
                  <tr key={code.code} className="border-t border-white/[0.04]">
                    <td className={`${cell} font-mono font-semibold text-cyan-200`}>{code.code}</td>
                    <td
                      className={`${editableCell} font-mono text-slate-300`}
                      title="Click to edit symbol name"
                      onClick={() => !isEditingSym && startCodeEdit(code.code, 'symbol', symbolLabel(code.symbol))}
                    >
                      {isEditingSym ? renderInlineInput() : symbolLabel(code.symbol)}
                    </td>
                    <td className={`${cell} text-slate-400`}>{code.description}</td>
                    <td className={`${cell} text-slate-500`}>{code.category || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {resultCount === 0 && (
          <div className="px-3 py-5 text-center text-[10.5px] text-slate-500">
            No rows match {query.trim() ? `“${query.trim()}”` : 'this filter'} — even with related-term search. Adjust the filter above.
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-white/[0.07] px-2.5 py-1.5 text-[9.5px] text-slate-500">
        <span>
          Showing {resultCount} of {total}
        </span>
        <span>Click any cell to edit inline · or click Open editor for full spreadsheet</span>
      </div>

      {fullEditorModal && effectiveStandard && (
        <StandardsEditor
          standard={effectiveStandard}
          initialModal={fullEditorModal === 'editor' ? null : fullEditorModal}
          onSave={updated => {
            commitStandard(updated);
            setFullEditorModal(null);
          }}
          onClose={() => setFullEditorModal(null)}
        />
      )}
    </div>
  );
};

export default A2UIStandardsTable;

