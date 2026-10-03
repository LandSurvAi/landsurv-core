import React, { useState, useMemo, useEffect } from 'react';
import type { TinSurface, SteepSlopeRunResult, SteepSlopeBand, InclusionBoundary } from '../types.ts';
import { SlopeIcon } from './icons.tsx';

interface SteepSlopePanelProps {
  tinSurfaces: TinSurface[];
  onToggleTinSurfaceVisibility: (id: string) => void;
  onRunAnalysis: (
    tinId: string,
    minComponentLinearSpan: number,
    bands: SteepSlopeBand[],
    includeBoundaryId: string | null,
  ) => SteepSlopeRunResult | null;
  inclusionBoundaries: InclusionBoundary[];
  steepSlopeSegmentCount: number;
  onToggleGeometryVisibility: () => void;
  onClearGeometry: () => void;
  onOpenReport: () => void;
}

const DEFAULT_BANDS: SteepSlopeBand[] = [
  { id: 'ss-0-15', minPercent: 0, maxPercent: 15, color: '#10b981', layerName: 'SS_0_15' },
  { id: 'ss-15-30', minPercent: 15, maxPercent: 30, color: '#f59e0b', layerName: 'SS_15_30' },
  { id: 'ss-30-plus', minPercent: 30, maxPercent: Number.POSITIVE_INFINITY, color: '#ef4444', layerName: 'SS_30_PLUS' },
];

/**
 * Tools panel for the Steep Slope Agent. Lists the TIN surfaces currently
 * loaded in the project (so an imported TIN is immediately recognized), lets
 * the user pick one, define slope-percent bands (ranges) with per-band layer
 * names and colors, set the minimum component span, optionally clip to an
 * inclusion boundary, and run slope-band analysis. The classified bands are
 * rendered on the canvas by the host.
 */
export const SteepSlopePanel: React.FC<SteepSlopePanelProps> = ({
  tinSurfaces,
  onToggleTinSurfaceVisibility,
  onRunAnalysis,
  inclusionBoundaries,
  steepSlopeSegmentCount,
  onToggleGeometryVisibility,
  onClearGeometry,
  onOpenReport,
}) => {
  const [selectedTinId, setSelectedTinId] = useState<string>('');
  const [minSpan, setMinSpan] = useState<number>(6);
  const [includeBoundaryId, setIncludeBoundaryId] = useState<string>('');
  const [bands, setBands] = useState<SteepSlopeBand[]>(() => DEFAULT_BANDS.map(b => ({ ...b })));
  const [lastRun, setLastRun] = useState<SteepSlopeRunResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Auto-select the first available TIN, and keep selection valid as surfaces
  // are added or removed.
  useEffect(() => {
    if (tinSurfaces.length === 0) {
      if (selectedTinId) setSelectedTinId('');
      return;
    }
    const stillExists = tinSurfaces.some(t => t.id === selectedTinId);
    if (!stillExists) {
      setSelectedTinId(tinSurfaces[0].id);
    }
  }, [tinSurfaces, selectedTinId]);

  const selectedTin = useMemo(
    () => tinSurfaces.find(t => t.id === selectedTinId) ?? null,
    [tinSurfaces, selectedTinId],
  );

  const updateBand = (idx: number, patch: Partial<SteepSlopeBand>) => {
    setBands(prev => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const addBand = () => {
    setBands(prev => {
      const last = prev[prev.length - 1];
      const nextMin = last && Number.isFinite(last.maxPercent) ? last.maxPercent : 0;
      return [
        ...prev,
        {
          id: `ss-band-${Date.now().toString(36)}`,
          minPercent: nextMin,
          maxPercent: nextMin + 15,
          color: '#3b82f6',
          layerName: `SS_${nextMin}_${nextMin + 15}`,
        },
      ];
    });
  };

  const removeBand = (idx: number) => {
    setBands(prev => prev.filter((_, i) => i !== idx));
  };

  const handleRun = () => {
    if (!selectedTin) return;
    setIsRunning(true);
    try {
      const result = onRunAnalysis(
        selectedTin.id,
        minSpan,
        bands,
        includeBoundaryId || null,
      );
      if (result) setLastRun(result);
    } finally {
      setIsRunning(false);
    }
  };

  if (tinSurfaces.length === 0) {
    return (
      <div className="w-full h-full bg-gray-800 text-sm text-gray-300 flex flex-col p-4 light-theme:bg-gray-50 light-theme:text-gray-600">
        <h3 className="text-lg font-semibold text-rose-400 mb-3 flex items-center gap-2 flex-shrink-0">
          <SlopeIcon className="w-5 h-5" /> Steep Slope Tools
        </h3>
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 px-4">
          <SlopeIcon className="w-12 h-12 text-gray-600" />
          <p className="text-sm font-medium text-gray-300">No TIN surface loaded</p>
          <p className="text-xs text-gray-500 leading-snug">
            Import a TIN surface using the <span className="text-rose-300 font-semibold">TIN</span> button
            in the canvas toolbar (supports Carlson <span className="text-gray-300">.tin</span> and
            LandXML). Once a surface is loaded it appears here for slope-band analysis.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-gray-800 text-sm text-gray-300 flex flex-col p-4 overflow-y-auto light-theme:bg-gray-50 light-theme:text-gray-600">
      <h3 className="text-lg font-semibold text-rose-400 mb-3 flex items-center gap-2 flex-shrink-0">
        <SlopeIcon className="w-5 h-5" /> Steep Slope Tools
      </h3>

      <div className="space-y-3 text-xs">
        {/* TIN Source */}
        <div className="rounded border border-gray-700/70 bg-gray-700/20 p-2.5 space-y-2">
          <div className="text-[10px] uppercase tracking-wide text-gray-400">TIN Source</div>
          <div>
            <label htmlFor="ss-tin-select" className="block text-[11px] text-gray-400 mb-1">
              Loaded TIN Surface ({tinSurfaces.length})
            </label>
            <select
              id="ss-tin-select"
              value={selectedTinId}
              onChange={(e) => setSelectedTinId(e.target.value)}
              className="w-full p-2 text-xs bg-gray-700 border border-gray-600 rounded focus:border-rose-500 focus:outline-none"
            >
              {tinSurfaces.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.triangles?.length ?? 0} tris)
                </option>
              ))}
            </select>
          </div>
          {selectedTin && (
            <div className="flex items-center justify-between text-[11px] text-gray-500">
              <span>{selectedTin.vertices?.length ?? 0} vertices</span>
              <button
                type="button"
                onClick={() => onToggleTinSurfaceVisibility(selectedTin.id)}
                className="text-rose-300 hover:text-rose-200 underline"
              >
                {selectedTin.hidden ? 'Show surface' : 'Hide surface'}
              </button>
            </div>
          )}
        </div>

        {/* Run Settings */}
        <div className="rounded border border-gray-700/70 bg-gray-700/20 p-2.5 space-y-2">
          <div className="text-[10px] uppercase tracking-wide text-gray-400">Run Settings</div>
          <div>
            <label htmlFor="ss-min-span" className="block text-[11px] text-gray-400 mb-1">
              Minimum Continuous Span (ft)
            </label>
            <input
              id="ss-min-span"
              type="number"
              min={0}
              step={0.1}
              value={Number.isFinite(minSpan) ? minSpan : 6}
              onChange={(e) => setMinSpan(Math.max(0, Number(e.target.value) || 0))}
              className="w-full p-2 text-xs bg-gray-700 border border-gray-600 rounded focus:border-rose-500 focus:outline-none"
            />
            <p className="text-[10px] text-gray-500 mt-1 leading-snug">
              Connected steep regions shorter than this span are filtered out so isolated noise
              doesn&apos;t clutter the result.
            </p>
          </div>
          <div>
            <label htmlFor="ss-boundary" className="block text-[11px] text-gray-400 mb-1">
              Inclusion Boundary (clip extent)
            </label>
            <select
              id="ss-boundary"
              value={includeBoundaryId}
              onChange={(e) => setIncludeBoundaryId(e.target.value)}
              className="w-full p-2 text-xs bg-gray-700 border border-gray-600 rounded focus:border-rose-500 focus:outline-none"
            >
              <option value="">None (entire TIN)</option>
              {inclusionBoundaries.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Slope Bands (ranges) */}
        <div className="rounded border border-gray-700/70 bg-gray-700/20 p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-wide text-gray-400">Slope Bands (ranges)</div>
            <button
              type="button"
              onClick={addBand}
              className="text-[11px] text-rose-300 hover:text-rose-200 font-semibold"
            >
              + Add
            </button>
          </div>
          <div className="grid grid-cols-12 gap-1.5 text-[9px] uppercase tracking-wide text-gray-500 px-0.5">
            <span className="col-span-2">Min%</span>
            <span className="col-span-2">Max%</span>
            <span className="col-span-4">Layer</span>
            <span className="col-span-2">Color</span>
            <span className="col-span-2" />
          </div>
          {bands.map((band, idx) => (
            <div key={band.id} className="grid grid-cols-12 gap-1.5 items-center">
              <input
                type="number"
                value={band.minPercent}
                onChange={(e) => updateBand(idx, { minPercent: Number(e.target.value) })}
                className="col-span-2 p-1.5 text-xs bg-gray-700 border border-gray-600 rounded"
                title="Min %"
              />
              <input
                type="number"
                value={Number.isFinite(band.maxPercent) ? band.maxPercent : 999}
                onChange={(e) => updateBand(idx, { maxPercent: Number(e.target.value) })}
                className="col-span-2 p-1.5 text-xs bg-gray-700 border border-gray-600 rounded"
                title="Max %"
              />
              <input
                type="text"
                value={band.layerName}
                onChange={(e) => updateBand(idx, { layerName: e.target.value })}
                className="col-span-4 p-1.5 text-xs bg-gray-700 border border-gray-600 rounded"
                title="Layer"
              />
              <input
                type="color"
                value={band.color}
                onChange={(e) => updateBand(idx, { color: e.target.value })}
                className="col-span-2 h-8 p-0.5 bg-gray-700 border border-gray-600 rounded"
                title="Color"
              />
              <button
                type="button"
                onClick={() => removeBand(idx)}
                disabled={bands.length <= 1}
                className="col-span-2 text-[11px] text-gray-400 hover:text-rose-300 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Remove band"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="grid grid-cols-1 gap-2 pt-1">
          <button
            type="button"
            onClick={handleRun}
            disabled={!selectedTin || isRunning}
            className="w-full py-2 text-xs font-semibold rounded border border-rose-500/50 bg-rose-700/30 hover:bg-rose-600/40 disabled:opacity-50 disabled:cursor-not-allowed text-rose-100 transition-colors flex items-center justify-center gap-2"
          >
            <SlopeIcon className="w-4 h-4" />
            {isRunning ? 'Analyzing…' : 'Run Steep Slope Analysis'}
          </button>
          <button
            type="button"
            onClick={onToggleGeometryVisibility}
            disabled={steepSlopeSegmentCount === 0}
            className="w-full py-2 text-xs font-semibold rounded border border-amber-500/40 bg-amber-700/20 hover:bg-amber-600/30 disabled:opacity-50 disabled:cursor-not-allowed text-amber-100 transition-colors"
          >
            Show / Hide Steep Slope Geometry
          </button>
          <button
            type="button"
            onClick={onClearGeometry}
            disabled={steepSlopeSegmentCount === 0}
            className="w-full py-2 text-xs font-semibold rounded border border-gray-500/40 bg-gray-700/20 hover:bg-gray-600/30 disabled:opacity-50 disabled:cursor-not-allowed text-gray-200 transition-colors"
          >
            Clear Rendered Geometry
          </button>
        </div>

        <div className="text-[10px] text-gray-500">
          Rendered segments: {steepSlopeSegmentCount}
        </div>

        {/* Last-run summary */}
        {lastRun && (
          <div className="mt-1 rounded-md border border-gray-700 bg-gray-900/60 p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-300">Last Run</p>
            <div className="grid grid-cols-2 gap-1.5 text-[11px] text-gray-400">
              <span>Analyzed:</span>
              <span className="text-gray-200">{lastRun.analyzedTriangleCount} tris</span>
              <span>Kept:</span>
              <span className="text-emerald-300">{lastRun.keptTriangleCount} tris</span>
              <span>Filtered:</span>
              <span className="text-gray-400">{lastRun.removedTriangleCount} tris</span>
              <span>Components:</span>
              <span className="text-gray-200">{lastRun.components.length}</span>
            </div>
            <div className="pt-1.5 border-t border-gray-700/60 space-y-1">
              {lastRun.settings.bands.map(band => {
                const kept = lastRun.triangles.filter(
                  t => t.bandId === band.id &&
                    lastRun.components.find(c => c.id === t.componentId)?.kept,
                ).length;
                return (
                  <div key={band.id} className="flex items-center gap-2 text-[11px]">
                    <span
                      className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: band.color }}
                    />
                    <span className="text-gray-400 flex-1">
                      {band.minPercent}–{Number.isFinite(band.maxPercent) ? `${band.maxPercent}%` : '∞'}
                    </span>
                    <span className="text-gray-200">{kept} tris</span>
                  </div>
                );
              })}
            </div>
            <button
              onClick={onOpenReport}
              className="mt-2 w-full px-3 py-1.5 text-xs font-semibold rounded-md bg-rose-600 text-white hover:bg-rose-700 transition-colors"
            >
              View Full Report
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
