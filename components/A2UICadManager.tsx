import React, { useMemo, useState } from 'react';
import { Edit3, PanelRight, Table2 } from 'lucide-react';
import { useCadManager } from '../contexts/CadManagerContext.tsx';
import type { StandardDefinition } from '../contexts/types/CadManager.types.ts';
import { StandardsEditor } from './CadManager/StandardsEditor.tsx';

interface A2UICadManagerProps {
  /** Float the workspace (or dock it from the surface header). */
  onOpenWorkspace?: () => void;
  /** Append the live, filterable standards sheet to the chat. */
  onOpenStandards?: () => void;
  /** Open the full-screen CAD standards spreadsheet editor directly. */
  onOpenSpreadsheetEditor?: () => void;
}

function symbolName(symbol: unknown): string {
  if (typeof symbol === 'string') return symbol.trim();
  if (symbol && typeof symbol === 'object' && 'name' in symbol) {
    return String((symbol as { name?: unknown }).name ?? '').trim();
  }
  return '';
}

/**
 * Compact CAD Manager workspace surface.
 *
 * The chat card is a launch pad and status summary. Popping it out (or docking
 * it into the agent tool shelf) presents the full CadManagerPage inside the
 * same A2UI surface, and "Edit spreadsheet" opens the full portaled
 * StandardsEditor directly.
 */
export const A2UICadManager: React.FC<A2UICadManagerProps> = ({
  onOpenWorkspace,
  onOpenStandards,
  onOpenSpreadsheetEditor,
}) => {
  const { state, dispatch, getAllLayers } = useCadManager();
  const standard = state.standard;
  const codes = standard?.codes ?? [];
  const [isSpreadsheetOpen, setIsSpreadsheetOpen] = useState(false);

  const layers = useMemo(() => getAllLayers(), [getAllLayers]);
  const counts = useMemo(() => {
    const linetypes = new Set(
      codes
        .map(code => code.lineType)
        .filter(lineType => lineType && lineType !== '-' && lineType.toUpperCase() !== 'CONTINUOUS')
    ).size;
    const symbols = new Set(
      codes.map(code => symbolName(code.symbol)).filter(name => name && name !== 'Standard')
    ).size;
    return {
      codes: codes.length,
      layers: layers.length,
      aliases: Object.keys(state.aliases ?? {}).length,
      linetypes,
      symbols,
    };
  }, [codes, layers.length, standard?.linetypes?.length, state.aliases]);

  const handleOpenSpreadsheet = () => {
    if (!standard && typeof dispatch === 'function') {
      const starter: StandardDefinition = {
        name: 'Custom CAD Standard',
        description: 'Created in CAD Standards Spreadsheet Editor',
        codes: [],
        layers: [],
        linetypes: [],
      };
      dispatch({ type: 'SET_STANDARD', payload: starter });
    }
    if (onOpenSpreadsheetEditor) {
      onOpenSpreadsheetEditor();
    } else {
      setIsSpreadsheetOpen(true);
    }
  };

  return (
    <div
      data-testid="a2ui-cad-manager"
      className="overflow-hidden rounded-lg border border-white/[0.1] bg-[#0a111c]"
    >
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
              <Table2 className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <h4 className="truncate text-[12px] font-semibold text-slate-100">
                {standard?.name || 'No CAD standard loaded'}
              </h4>
              <p className="truncate text-[10px] text-slate-500">
                {standard?.description || 'Upload a standard or build one with the agent.'}
              </p>
            </div>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-emerald-300">
          Active
        </span>
      </div>

      <div className="grid grid-cols-5 gap-px border-b border-white/[0.07] bg-white/[0.06]">
        {[
          ['Codes', counts.codes],
          ['Layers', counts.layers],
          ['Aliases', counts.aliases],
          ['Linetypes', counts.linetypes],
          ['Symbols', counts.symbols],
        ].map(([label, value]) => (
          <div key={String(label)} className="bg-[#0a111c] px-1 py-2 text-center">
            <p className="text-sm font-bold tabular-nums text-cyan-300">{value}</p>
            <p className="text-[8.5px] uppercase tracking-[0.08em] text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2.5">
        {onOpenWorkspace && (
          <button
            type="button"
            onClick={onOpenWorkspace}
            className="inline-flex items-center gap-1.5 rounded-md border border-cyan-400/35 bg-cyan-400/10 px-2.5 py-1 text-[10.5px] font-semibold text-cyan-200 transition-colors hover:border-cyan-300/60 hover:bg-cyan-400/20 hover:text-white"
          >
            <PanelRight className="h-3 w-3" />
            Dock workspace
          </button>
        )}
        {onOpenStandards && standard && (
          <button
            type="button"
            onClick={onOpenStandards}
            className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-[10.5px] font-semibold text-cyan-200 transition-colors hover:border-cyan-400 hover:bg-cyan-500/20 hover:text-white"
          >
            <Table2 className="h-3 w-3" />
            Standards sheet
          </button>
        )}
        <button
          type="button"
          onClick={handleOpenSpreadsheet}
          data-testid="a2ui-cad-manager-edit-spreadsheet"
          className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[10.5px] font-semibold text-emerald-200 transition-colors hover:border-emerald-400 hover:bg-emerald-500/20 hover:text-white"
        >
          <Edit3 className="h-3 w-3" />
          Edit spreadsheet
        </button>
        <span className="ml-auto text-[9.5px] text-slate-500">
          Dock for sessions, editing, and Civil 3D exports
        </span>
      </div>

      {isSpreadsheetOpen && (
        <StandardsEditor
          standard={
            standard ?? {
              name: 'Custom CAD Standard',
              description: 'Created in CAD Standards Spreadsheet Editor',
              codes: [],
              layers: [],
              linetypes: [],
            }
          }
          onSave={updated => {
            dispatch?.({ type: 'SET_STANDARD', payload: updated });
            setIsSpreadsheetOpen(false);
          }}
          onClose={() => setIsSpreadsheetOpen(false)}
        />
      )}
    </div>
  );
};

export default A2UICadManager;
