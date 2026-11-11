import React, { useEffect, useMemo, useState } from 'react';
import type { TinSurface } from '../types.ts';
import {
  compareDirtVolumeScenarios,
  computeEndAreaVolumes,
  computeTinVolumes,
  deleteDirtVolumeScenario,
  getDirtVolumeScenario,
  listDirtVolumeScenarios,
  saveDirtVolumeResult,
  subscribeDirtVolumeScenarios,
  type DirtVolumeComparison,
  type DirtVolumeScenario,
  type DirtVolumeSummary,
  type VolumeSection,
} from '../services/dirtVolumeService.ts';
import { buildDirtVolumeReportPdf } from '../services/dirtVolumeReportPdf.ts';
import { triggerDownload } from '../utils/download.ts';
import { DownloadIcon, TrashIcon } from './icons.tsx';

export interface DirtVolumePanelProps {
  tinSurfaces?: TinSurface[];
  projectName?: string;
  onClose?: () => void;
  logActionToFieldbook?: (message: string) => void;
  /** 'panel' keeps the local header; 'surface' lets the A2UI shell own the chrome. */
  chrome?: 'panel' | 'surface';
}

interface SectionRow {
  id: string;
  station: string;
  cut: string;
  fill: string;
}

const INPUT_CLASS =
  'w-full rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-100 ' +
  'placeholder:text-gray-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/40 ' +
  'light-theme:border-gray-300 light-theme:bg-white light-theme:text-gray-800';

const LABEL_CLASS = 'text-[10px] font-semibold uppercase tracking-wide text-gray-400 light-theme:text-gray-500';

const CHIP_CLASS = (active: boolean): string =>
  `rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
    active
      ? 'border-amber-400/80 bg-amber-500/25 text-amber-50'
      : 'border-gray-600/60 bg-gray-800/40 text-gray-300 hover:border-amber-400/50 hover:text-amber-100'
  }`;

const createId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `dv-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const makeRow = (station = ''): SectionRow => ({
  id: createId(),
  station,
  cut: '',
  fill: '',
});

const fmt = (value: number, digits = 0): string =>
  Number.isFinite(value)
    ? value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : '0';

function resultCards(result: DirtVolumeSummary): Array<{ label: string; value: string; tone: string }> {
  return [
    { label: 'Cut', value: `${fmt(result.cutCy, 1)} CY`, tone: 'text-rose-300 light-theme:text-rose-700' },
    { label: 'Fill', value: `${fmt(result.fillCy, 1)} CY`, tone: 'text-emerald-300 light-theme:text-emerald-700' },
    {
      label: 'Adjusted net',
      value: `${result.adjustedNetCy >= 0 ? '+' : ''}${fmt(result.adjustedNetCy, 1)} CY`,
      tone: result.adjustedNetCy >= 0 ? 'text-amber-300 light-theme:text-amber-700' : 'text-sky-300 light-theme:text-sky-700',
    },
    {
      label: 'Cut : fill',
      value: result.cutToFillRatio !== null ? `${fmt(result.cutToFillRatio, 2)} : 1` : 'No fill',
      tone: 'text-gray-200 light-theme:text-gray-800',
    },
  ];
}

export const DirtVolumePanel: React.FC<DirtVolumePanelProps> = ({
  tinSurfaces = [],
  projectName,
  onClose,
  logActionToFieldbook,
  chrome = 'panel',
}) => {
  const [method, setMethod] = useState<'end-area' | 'tin'>('end-area');
  const [name, setName] = useState('Grading Option A');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<SectionRow[]>([makeRow('0+00'), makeRow('1+00'), makeRow('2+00')]);
  const [existingSurfaceId, setExistingSurfaceId] = useState('');
  const [proposedSurfaceId, setProposedSurfaceId] = useState('');
  const [spacingFt, setSpacingFt] = useState('');
  const [cutSwellPercent, setCutSwellPercent] = useState('0');
  const [fillShrinkPercent, setFillShrinkPercent] = useState('0');
  const [result, setResult] = useState<DirtVolumeSummary | null>(null);
  const [savedScenarioId, setSavedScenarioId] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<DirtVolumeScenario[]>(() => listDirtVolumeScenarios());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeDirtVolumeScenarios(() => setScenarios(listDirtVolumeScenarios())), []);

  const comparison = useMemo<DirtVolumeComparison | null>(() => {
    if (scenarios.length < 2) return null;
    try {
      return compareDirtVolumeScenarios();
    } catch {
      return null;
    }
  }, [scenarios]);

  const parseStation = (value: string): number => {
    const trimmed = value.trim();
    const stationMatch = trimmed.match(/^(\d+)\+(\d+(?:\.\d+)?)$/);
    if (stationMatch) return Number(stationMatch[1]) * 100 + Number(stationMatch[2]);
    return Number(trimmed);
  };

  const handleCompute = (): void => {
    setError(null);
    try {
      const swell = Number(cutSwellPercent) || 0;
      const shrink = Number(fillShrinkPercent) || 0;
      let next: DirtVolumeSummary;
      if (method === 'end-area') {
        const sections: VolumeSection[] = rows
          .filter((row) => row.station.trim() !== '')
          .map((row) => ({
            station: parseStation(row.station),
            cutAreaSf: Number(row.cut) || 0,
            fillAreaSf: Number(row.fill) || 0,
          }));
        next = computeEndAreaVolumes(sections, {
          cutSwellPercent: swell,
          fillShrinkPercent: shrink,
        });
      } else {
        const existing = tinSurfaces.find((surface) => surface.id === existingSurfaceId);
        const proposed = tinSurfaces.find((surface) => surface.id === proposedSurfaceId);
        if (!existing || !proposed) {
          throw new Error('Select an existing-ground TIN and a proposed TIN.');
        }
        next = computeTinVolumes({
          existing,
          proposed,
          spacingFt: spacingFt.trim() ? Number(spacingFt) : undefined,
          cutSwellPercent: swell,
          fillShrinkPercent: shrink,
        });
      }
      setResult(next);
      setSavedScenarioId(null);
      logActionToFieldbook?.(
        `Dirt Volume Agent: ${next.methodLabel} — cut ${next.cutCy.toFixed(1)} CY, ` +
          `fill ${next.fillCy.toFixed(1)} CY, adjusted net ${next.adjustedNetCy.toFixed(1)} CY.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSave = (): void => {
    if (!result) return;
    setError(null);
    try {
      const scenario = saveDirtVolumeResult(result, name, notes);
      setSavedScenarioId(scenario.id);
      setScenarios(listDirtVolumeScenarios());
      logActionToFieldbook?.(`Dirt Volume Agent: saved scenario "${scenario.name}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleExport = (): void => {
    setError(null);
    try {
      let scenario = savedScenarioId ? getDirtVolumeScenario(savedScenarioId) : undefined;
      if (!scenario) {
        if (!result) throw new Error('Compute a volume before exporting.');
        scenario = saveDirtVolumeResult(result, name, notes);
        setSavedScenarioId(scenario.id);
        setScenarios(listDirtVolumeScenarios());
      }
      const latestScenarios = listDirtVolumeScenarios();
      const exportComparison =
        latestScenarios.length >= 2 ? compareDirtVolumeScenarios() : null;
      const artifact = buildDirtVolumeReportPdf({
        scenario,
        comparison: exportComparison,
        projectName,
      });
      triggerDownload(artifact.blob, artifact.fileName);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = (id: string): void => {
    if (deleteDirtVolumeScenario(id)) {
      setScenarios(listDirtVolumeScenarios());
      if (savedScenarioId === id) setSavedScenarioId(null);
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-gray-900 text-gray-200 light-theme:bg-white light-theme:text-gray-800">
      {chrome === 'panel' && (
        <div className="flex items-center justify-between border-b border-gray-700/50 px-4 py-3 light-theme:border-gray-200">
          <div>
            <h2 className="text-sm font-bold text-amber-200 light-theme:text-amber-800">Dirt Volume</h2>
            <p className="text-[11px] text-gray-400 light-theme:text-gray-500">
              Earthwork takeoffs, scenario comparison, and reports
            </p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-800 hover:text-white light-theme:hover:bg-gray-100 light-theme:hover:text-gray-900"
            >
              Close
            </button>
          )}
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={CHIP_CLASS(method === 'end-area')} onClick={() => setMethod('end-area')}>
            End Area
          </button>
          <button type="button" className={CHIP_CLASS(method === 'tin')} onClick={() => setMethod('tin')}>
            TIN Comparison
          </button>
          <span className="ml-auto text-[10px] text-gray-500">
            Grid and stockpile takeoffs are available in chat.
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1">
            <span className={LABEL_CLASS}>Scenario name</span>
            <input className={INPUT_CLASS} value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="space-y-1">
            <span className={LABEL_CLASS}>Notes</span>
            <input
              className={INPUT_CLASS}
              value={notes}
              placeholder="Optional basis or assumptions"
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        </div>

        {method === 'end-area' ? (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_1fr_1fr_2rem] gap-2">
              <span className={LABEL_CLASS}>Station</span>
              <span className={LABEL_CLASS}>Cut area (SF)</span>
              <span className={LABEL_CLASS}>Fill area (SF)</span>
              <span />
            </div>
            {rows.map((row) => (
              <div key={row.id} className="grid grid-cols-[1fr_1fr_1fr_2rem] items-center gap-2">
                <input
                  className={INPUT_CLASS}
                  value={row.station}
                  placeholder="0+00"
                  onChange={(event) =>
                    setRows((prev) => prev.map((entry) => (entry.id === row.id ? { ...entry, station: event.target.value } : entry)))
                  }
                />
                <input
                  className={INPUT_CLASS}
                  inputMode="decimal"
                  value={row.cut}
                  placeholder="0"
                  onChange={(event) =>
                    setRows((prev) => prev.map((entry) => (entry.id === row.id ? { ...entry, cut: event.target.value } : entry)))
                  }
                />
                <input
                  className={INPUT_CLASS}
                  inputMode="decimal"
                  value={row.fill}
                  placeholder="0"
                  onChange={(event) =>
                    setRows((prev) => prev.map((entry) => (entry.id === row.id ? { ...entry, fill: event.target.value } : entry)))
                  }
                />
                <button
                  type="button"
                  title="Remove section"
                  disabled={rows.length <= 2}
                  onClick={() => setRows((prev) => prev.filter((entry) => entry.id !== row.id))}
                  className="rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-30 light-theme:hover:bg-gray-100"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setRows((prev) => [...prev, makeRow()])}
                className="rounded border border-gray-600 px-2 py-1 text-[11px] font-semibold text-gray-300 hover:border-amber-400 hover:text-amber-200 light-theme:border-gray-300 light-theme:text-gray-600"
              >
                + Add section
              </button>
              <span className="text-[10px] text-gray-500">Stations accept 1+25 or decimal feet.</span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {tinSurfaces.length < 2 ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200 light-theme:text-amber-800">
                Two TIN surfaces are required. Create or import an existing-ground and a proposed surface first.
              </div>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1">
                <span className={LABEL_CLASS}>Existing-ground TIN</span>
                <select
                  className={INPUT_CLASS}
                  value={existingSurfaceId}
                  onChange={(event) => setExistingSurfaceId(event.target.value)}
                >
                  <option value="">Select a surface…</option>
                  {tinSurfaces.map((surface) => (
                    <option key={surface.id} value={surface.id}>
                      {surface.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className={LABEL_CLASS}>Proposed TIN</span>
                <select
                  className={INPUT_CLASS}
                  value={proposedSurfaceId}
                  onChange={(event) => setProposedSurfaceId(event.target.value)}
                >
                  <option value="">Select a surface…</option>
                  {tinSurfaces.map((surface) => (
                    <option key={surface.id} value={surface.id}>
                      {surface.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block max-w-[12rem] space-y-1">
              <span className={LABEL_CLASS}>Sampling spacing (ft)</span>
              <input
                className={INPUT_CLASS}
                inputMode="decimal"
                value={spacingFt}
                placeholder="Auto (~120 nodes)"
                onChange={(event) => setSpacingFt(event.target.value)}
              />
            </label>
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1">
            <span className={LABEL_CLASS}>Cut swell (%)</span>
            <input
              className={INPUT_CLASS}
              inputMode="decimal"
              value={cutSwellPercent}
              onChange={(event) => setCutSwellPercent(event.target.value)}
            />
          </label>
          <label className="space-y-1">
            <span className={LABEL_CLASS}>Fill shrink (%)</span>
            <input
              className={INPUT_CLASS}
              inputMode="decimal"
              value={fillShrinkPercent}
              onChange={(event) => setFillShrinkPercent(event.target.value)}
            />
          </label>
        </div>

        {error && (
          <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-200 light-theme:text-rose-800">
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCompute}
            className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-500"
          >
            Compute volumes
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!result}
            className="rounded-md border border-amber-500/50 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-40 light-theme:text-amber-800"
          >
            Save scenario
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={!result && scenarios.length === 0}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-gray-600 px-3 py-1.5 text-xs font-semibold text-gray-300 hover:border-amber-400 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-40 light-theme:border-gray-300 light-theme:text-gray-600"
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            Export PDF report
          </button>
        </div>

        {result && (
          <div className="space-y-2 rounded-lg border border-gray-700/60 bg-gray-800/40 p-3 light-theme:border-gray-200 light-theme:bg-gray-50">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-gray-200 light-theme:text-gray-800">{result.methodLabel}</span>
              <span className="text-[10px] text-gray-500">{result.calculationMethod}</span>
              {savedScenarioId && (
                <span className="ml-auto rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 light-theme:text-emerald-700">
                  Saved
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {resultCards(result).map((card) => (
                <div key={card.label} className="rounded-md bg-gray-900/60 px-2 py-1.5 light-theme:bg-white">
                  <div className={LABEL_CLASS}>{card.label}</div>
                  <div className={`text-sm font-bold ${card.tone}`}>{card.value}</div>
                </div>
              ))}
            </div>
            <div className="grid gap-1 text-[11px] text-gray-400 sm:grid-cols-2 light-theme:text-gray-600">
              <span>Loose cut: {fmt(result.cutLooseCy, 1)} CY</span>
              <span>Bank-required fill: {fmt(result.fillBankRequiredCy, 1)} CY</span>
              {result.planAreaAcres !== null && <span>Plan area: {fmt(result.planAreaAcres, 3)} ac</span>}
              {result.cellsSkipped !== null && result.cellsSkipped > 0 && (
                <span className="text-amber-300 light-theme:text-amber-700">{result.cellsSkipped} cells skipped</span>
              )}
            </div>
            {result.warnings.length > 0 && (
              <ul className="space-y-1 text-[10px] text-amber-200/90 light-theme:text-amber-800">
                {result.warnings.map((warning) => (
                  <li key={warning}>• {warning}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {scenarios.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-gray-300 light-theme:text-gray-700">Saved scenarios</h3>
              <span className="text-[10px] text-gray-500">{scenarios.length} total</span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-700/60 light-theme:border-gray-200">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-gray-800/70 text-[10px] uppercase tracking-wide text-gray-400 light-theme:bg-gray-100 light-theme:text-gray-500">
                  <tr>
                    <th className="px-2 py-1.5">Scenario</th>
                    <th className="px-2 py-1.5 text-right">Cut CY</th>
                    <th className="px-2 py-1.5 text-right">Fill CY</th>
                    <th className="px-2 py-1.5 text-right">Adj. net</th>
                    <th className="px-2 py-1.5 text-right">dNet</th>
                    <th className="w-8 px-1 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {scenarios.map((scenario) => {
                    const row = comparison?.rows.find((entry) => entry.id === scenario.id);
                    const best = comparison?.bestBalancedId === scenario.id;
                    return (
                      <tr key={scenario.id} className="border-t border-gray-700/40 light-theme:border-gray-200">
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-gray-200 light-theme:text-gray-800">{scenario.name}</span>
                            {best && (
                              <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-300 light-theme:text-emerald-700">
                                Best balance
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-gray-500">{scenario.methodLabel}</div>
                        </td>
                        <td className="px-2 py-1.5 text-right text-rose-300 light-theme:text-rose-700">{fmt(scenario.cutCy, 1)}</td>
                        <td className="px-2 py-1.5 text-right text-emerald-300 light-theme:text-emerald-700">{fmt(scenario.fillCy, 1)}</td>
                        <td className="px-2 py-1.5 text-right font-semibold text-gray-200 light-theme:text-gray-800">
                          {fmt(scenario.adjustedNetCy, 1)}
                        </td>
                        <td className="px-2 py-1.5 text-right text-gray-400 light-theme:text-gray-600">
                          {row ? `${row.deltaNetCy >= 0 ? '+' : ''}${fmt(row.deltaNetCy, 1)}` : '—'}
                        </td>
                        <td className="px-1 py-1.5 text-center">
                          <button
                            type="button"
                            title="Delete scenario"
                            onClick={() => handleDelete(scenario.id)}
                            className="rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-rose-300 light-theme:hover:bg-gray-100"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {comparison && (
              <p className="text-[10px] text-gray-500">
                Compared with {comparison.rows.find((row) => row.id === comparison.baselineId)?.name ?? 'the baseline'}:
                net spread {fmt(comparison.spreadNetCy, 1)} CY.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DirtVolumePanel;
