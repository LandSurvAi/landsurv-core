import React from 'react';
import type { A2UISoilLimitationsSpec } from '../types.ts';

function fmtAcres(value: number): string {
  if (!Number.isFinite(value)) return '0.00';
  if (value > 0 && value < 0.01) return '<0.01';
  return value.toFixed(2);
}

interface A2UISoilLimitationsProps {
  spec: A2UISoilLimitationsSpec;
  isDownloading?: boolean;
  onDownload?: () => void;
  onAddToSheet?: () => void;
}

/**
 * Chat-hosted PA E&S Table E.1 report. The surface is a snapshot owned by the
 * message so it can stay inline, float, or go fullscreen without recompiling.
 */
export const A2UISoilLimitations: React.FC<A2UISoilLimitationsProps> = ({
  spec,
  isDownloading = false,
  onDownload,
  onAddToSheet,
}) => {
  const unitCount = spec.units.length;

  return (
    <div data-testid="a2ui-soil-limitations" className="space-y-2.5 p-3 text-xs text-slate-300">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300">
            PA E&amp;S Table E.1
          </p>
          <h3 className="mt-0.5 text-sm font-semibold text-stone-100">
            Soil limitations &amp; resolutions
          </h3>
          <p className="mt-0.5 text-[10px] text-slate-500">
            {spec.chartCached ? 'Cached chart' : 'Scout chart'} · generated{' '}
            {new Date(spec.generatedAt).toLocaleString()}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-lg font-semibold text-amber-200">
            {fmtAcres(spec.soilAcres)}{' '}
            <span className="text-[10px] font-normal text-slate-400">ac</span>
          </p>
          <p className="text-[10px] text-slate-500">
            {unitCount} map unit{unitCount === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <div
        className={`rounded-lg border p-2 text-[11px] ${
          spec.boundaryPresent
            ? 'border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-100'
            : 'border-amber-500/35 bg-amber-500/[0.07] text-amber-100'
        }`}
      >
        {spec.boundaryPresent ? (
          <span>
            Clipped to <strong>{spec.areaLabel}</strong>: {fmtAcres(spec.soilAcres)} ac of soil
            across {unitCount} map unit{unitCount === 1 ? '' : 's'}.
          </span>
        ) : (
          <span>
            {spec.boundaryAdvisory ||
              'No inclusion or deed boundary is present. Areas cover the project AOI; draw a boundary for exact within-AOI areas.'}{' '}
            {fmtAcres(spec.soilAcres)} ac across {unitCount} map unit
            {unitCount === 1 ? '' : 's'}.
          </span>
        )}
      </div>

      {unitCount === 0 ? (
        <p className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-[11px] text-slate-400">
          No SSURGO soil map units intersect this report area.
        </p>
      ) : (
        <div className="max-h-[min(46vh,420px)] space-y-1.5 overflow-y-auto pr-0.5">
          {spec.units.map((unit, index) => {
            const limitationLabels = unit.limitations.map(item =>
              item.label + (item.valueLabel ? ` (${item.valueLabel})` : ''),
            );
            return (
              <details
                key={`${unit.mukey}-${unit.musym}-${index}`}
                className="rounded-lg border border-white/10 bg-white/[0.025]"
              >
                <summary className="cursor-pointer list-none px-2.5 py-2 [&::-webkit-details-marker]:hidden">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate">
                      <span className="font-mono font-semibold text-stone-200">
                        {unit.musym || '—'}
                      </span>{' '}
                      <span className="text-slate-300">
                        {unit.muname || unit.seriesName || 'Unnamed map unit'}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] text-slate-400">
                      {fmtAcres(unit.acres)} ac
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    {unit.percent.toFixed(1)}% of area · HSG {unit.hydrologicGroup || '—'} ·{' '}
                    {unit.drainageClass || 'drainage not reported'} · Hydric {unit.hydric || '—'}
                  </p>
                  <p
                    className="mt-1 truncate text-[10px] text-amber-200/85"
                    title={
                      limitationLabels.length > 0
                        ? limitationLabels.join('; ')
                        : 'No Table E.1 limitations marked'
                    }
                  >
                    {limitationLabels.length > 0
                      ? limitationLabels.join('; ')
                      : 'No Table E.1 limitations marked'}
                  </p>
                </summary>
                <div className="space-y-2 border-t border-white/[0.07] px-2.5 py-2">
                  <p className="text-[10px] text-slate-500">
                    Depth to seasonal HWT:{' '}
                    {unit.depthToWaterTableIn == null ? '—' : `${unit.depthToWaterTableIn}"`}
                    {' · '}Depth to bedrock:{' '}
                    {unit.depthToBedrockIn == null ? '—' : `${unit.depthToBedrockIn}"`}
                  </p>
                  {unit.limitations.length === 0 ? (
                    <p className="text-[11px] italic text-slate-400">
                      No Table E.1 limitations marked for this series (absence of an X does not
                      mean no potential limitation).
                    </p>
                  ) : (
                    <>
                      <div>
                        <span className="font-semibold text-amber-300">Limitations: </span>
                        <span className="text-slate-300">{limitationLabels.join('; ')}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-emerald-300">Resolutions:</span>
                        <ol className="ml-4 mt-0.5 list-decimal space-y-0.5 text-slate-300">
                          {unit.resolutions.map((resolution, resolutionIndex) => (
                            <li key={`${resolution}-${resolutionIndex}`}>{resolution}</li>
                          ))}
                        </ol>
                      </div>
                    </>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}

      {spec.unmatched.length > 0 && (
        <p className="text-[10px] text-amber-300/90">
          No Table E.1 row matched: {spec.unmatched.join(', ')}. Verify the series name before
          relying on the limitation list.
        </p>
      )}

      {(onAddToSheet || onDownload) && (
        <div className="grid grid-cols-2 gap-2 border-t border-white/[0.08] pt-2.5">
          {onAddToSheet && (
            <button
              type="button"
              onClick={onAddToSheet}
              className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1.5 text-[10.5px] font-semibold text-cyan-100 transition-colors hover:border-cyan-300/60 hover:bg-cyan-500/20"
              title="Add a compact limitations/resolutions block to the active paper-space sheet"
            >
              Add to sheet
            </button>
          )}
          {onDownload && (
            <button
              type="button"
              onClick={onDownload}
              disabled={isDownloading}
              className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-[10.5px] font-semibold text-emerald-100 transition-colors hover:border-emerald-300/60 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDownloading ? 'Preparing…' : 'Download PDF'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default A2UISoilLimitations;
