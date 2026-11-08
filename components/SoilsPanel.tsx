import React, { useEffect, useState } from 'react';
import { SoilsIcon } from './icons.tsx';
import type { AreaHatchSettings, GenerationBlock, InclusionBoundary, SoilMapUnit } from '../types.ts';
import { AreaHatchControls } from './AreaHatchControls.tsx';
import { GenerationBlockSummary } from './GenerationBlockSummary.tsx';
import type { SoilsFetchResult, SoilReportRow } from '../services/soilsService.ts';
import type { SoilLimitationsReport } from '../services/soilLimitationsReport.ts';

/**
 * SoilsPanel (v26.05.20.1) — controls for the Soils Agent.
 *
 * Mirrors the Flood Agent's "inclusion or description" UX: the user either
 * draws an inclusion polygon on the canvas or types a free-text area
 * description, then fetches USDA NRCS SSURGO soil map unit polygons for the
 * derived bounding box. Polygon rings are converted to SurveyLines tagged
 * `layer='SOILS-<MUSYM>'` with a distinct layer per map unit symbol.
 *
 * An optional second "Fetch Soil Report" button queries the USDA Soil Data
 * Access tabular REST API for hydrologic group, drainage class, and farmland
 * classification for every active map unit.
 */

interface SoilsPanelProps {
  onFetchSoils: (mode: 'inclusion' | 'description', descriptionText?: string) => void;
  isFetching: boolean;
  hasInclusionBoundary: boolean;
  lastResult?: SoilsFetchResult | null;
  /** Provenance block for the SSURGO linework currently on the canvas. */
  generation?: GenerationBlock | null;
  onClearSoils?: () => void;
  soilMapUnits: SoilMapUnit[];
  onFetchReport?: () => void;
  isFetchingReport?: boolean;
  /** Download the tabular SSURGO report as a PDF (fetching it first if needed). */
  onDownloadReport?: () => void;
  isDownloadingReport?: boolean;
  soilReportData?: Record<string, SoilReportRow> | null;
  /** PA E&S limitations report compiled from Table E.1 and the loaded soils. */
  soilLimitationsReport?: SoilLimitationsReport | null;
  onCompileLimitations?: () => void;
  isCompilingLimitations?: boolean;
  onDownloadLimitations?: () => void;
  isDownloadingLimitations?: boolean;
  /** Place a compact, wrapped limitations block on the active paper-space sheet. */
  onAddLimitationsToSheet?: () => void;
  inclusionBoundaries?: InclusionBoundary[];
  activeInclusionBoundaryId?: string | null;
  onSelectInclusionBoundary?: (id: string | null) => void;
  /** Current soil hatch settings; applies live to already-fetched areas. */
  soilHatch?: Partial<AreaHatchSettings>;
  onSoilHatchChange?: (patch: Partial<AreaHatchSettings>) => void;
}

const FARMLAND_LABELS: Record<string, string> = {
  'P': 'Prime farmland',
  'S': 'Statewide importance',
  'U': 'Unique farmland',
  'L': 'Local importance',
  'N': 'Not prime',
};

const HYDRO_GROUP_LABELS: Record<string, string> = {
  'A': 'High infiltration (sand/gravel)',
  'B': 'Moderate infiltration',
  'C': 'Slow infiltration',
  'D': 'Very slow infiltration (clay)',
};

export const SoilsPanel: React.FC<SoilsPanelProps> = ({
  onFetchSoils,
  isFetching,
  hasInclusionBoundary,
  lastResult,
  generation = null,
  onClearSoils,
  soilMapUnits,
  onFetchReport,
  isFetchingReport = false,
  onDownloadReport,
  isDownloadingReport = false,
  soilReportData,
  soilLimitationsReport,
  onCompileLimitations,
  isCompilingLimitations = false,
  onDownloadLimitations,
  isDownloadingLimitations = false,
  onAddLimitationsToSheet,
  inclusionBoundaries = [],
  activeInclusionBoundaryId = null,
  onSelectInclusionBoundary,
  soilHatch,
  onSoilHatchChange,
}) => {
  const [mode, setMode] = useState<'inclusion' | 'description'>('description');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!generation) return;
    if (generation.query?.mode === 'inclusion') setMode('inclusion');
    else if (generation.query?.mode) setMode('description');
    if (generation.query?.description) setDescription(generation.query.description);
  }, [generation]);

  const fmtAcres = (value: number): string => {
    if (!Number.isFinite(value)) return '0.00';
    if (value > 0 && value < 0.01) return '<0.01';
    return value.toFixed(2);
  };

  const canFetch =
    !isFetching &&
    ((mode === 'inclusion' && hasInclusionBoundary) ||
     (mode === 'description' && description.trim().length > 2));

  const handleFetch = () => {
    if (!canFetch) return;
    onFetchSoils(mode, mode === 'description' ? description.trim() : undefined);
  };

  // Build display table: merge geometry-side attrs with tabular report if available
  const displayUnits = soilMapUnits.map(u => {
    const report = soilReportData?.[u.mukey];
    return {
      ...u,
      hydgrpdcd: report?.hydgrpdcd ?? u.hydgrpdcd,
      drclassdcd: report?.drclassdcd ?? u.drclassdcd,
      farmlndcl: report?.farmlndcl ?? u.farmlndcl,
      taxclname: report?.taxclname,
    };
  });

  return (
    <div className="space-y-4 text-sm">
      {/* Source badge */}
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <SoilsIcon className="w-4 h-4 text-stone-400" />
        <span>Source: USDA NRCS SSURGO / Soil Data Access</span>
      </div>

      <GenerationBlockSummary generation={generation} accent="stone" />

      {/* Mode toggle */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setMode('description')}
          className={`px-3 py-2 rounded-md text-sm font-semibold border transition ${
            mode === 'description'
              ? 'bg-stone-500/20 border-stone-400 text-stone-200'
              : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'
          }`}
        >
          AI Description
        </button>
        <button
          onClick={() => setMode('inclusion')}
          className={`px-3 py-2 rounded-md text-sm font-semibold border transition ${
            mode === 'inclusion'
              ? 'bg-stone-500/20 border-stone-400 text-stone-200'
              : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'
          }`}
        >
          Inclusion Area
        </button>
      </div>

      {/* Mode body */}
      {mode === 'description' ? (
        <div>
          <label className="block text-xs font-semibold text-gray-400 mb-1">Area to query</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder='e.g. "Lower Merion Township, PA" or "123 Main St, Norristown, PA"'
            rows={3}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-100 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400 resize-none"
          />
          <p className="text-xs text-gray-500 mt-1">
            Geocoded via OpenStreetMap Nominatim. A minimum area is always queried so small lookups return surrounding soil polygons.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {inclusionBoundaries.length > 0 && (
            <div className="bg-gray-900/40 border border-stone-700/30 rounded-md p-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-semibold tracking-wide text-stone-300/80">
                  Inclusion Boundary
                </span>
              </div>
              <select
                value={activeInclusionBoundaryId ?? ''}
                onChange={e => onSelectInclusionBoundary?.(e.target.value || null)}
                className="w-full p-1.5 text-xs bg-gray-900 border border-gray-700 rounded"
              >
                <option value="">All inclusion lines</option>
                {inclusionBoundaries.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="bg-gray-900/40 border border-gray-700 rounded-md p-3 text-xs">
            {hasInclusionBoundary ? (
              <span className="text-green-300">
                &#10003; Using inclusion boundary on the canvas as the query bbox.
              </span>
            ) : (
              <span className="text-amber-300">
                No inclusion lines drawn. Switch to the Inclusion tool on the canvas and trace a closed boundary first.
              </span>
            )}
          </div>
        </div>
      )}

      {/* Fetch button */}
      <button
        onClick={handleFetch}
        disabled={!canFetch}
        className="w-full py-2.5 px-4 font-semibold text-white bg-stone-600 rounded-md hover:bg-stone-700 transition-colors disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
      >
        {isFetching ? 'Fetching SSURGO Soils…' : 'Fetch Soil Map Units'}
      </button>

      {/* Results summary */}
      {lastResult && (
        <div className="bg-gray-900/60 border border-stone-500/20 rounded-md p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-300">
              {lastResult.featureCount} polygon{lastResult.featureCount === 1 ? '' : 's'} — {lastResult.mapUnits.length} map unit{lastResult.mapUnits.length === 1 ? '' : 's'}
            </span>
            {onClearSoils && (
              <button
                onClick={onClearSoils}
                className="text-xs text-gray-400 hover:text-red-400 underline"
              >
                Clear soils
              </button>
            )}
          </div>
          {Object.keys(lastResult.zoneCounts).length > 0 && (
            <ul className="text-xs text-gray-300 space-y-0.5 max-h-24 overflow-y-auto">
              {Object.entries(lastResult.zoneCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([musym, count]) => (
                  <li key={musym} className="flex items-baseline justify-between gap-2">
                    <span className="font-mono font-bold text-stone-400">{musym}</span>
                    <span className="text-gray-400 text-xs whitespace-nowrap">{count}&times;</span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {/* Map units table */}
      {displayUnits.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-300 uppercase tracking-wide">
              Soil Map Units ({displayUnits.length})
            </span>
            {onDownloadReport && (
              <button
                type="button"
                onClick={onDownloadReport}
                disabled={isFetchingReport || isDownloadingReport}
                className="text-xs px-2 py-1 rounded border border-emerald-600/50 bg-emerald-900/30 text-emerald-300 hover:bg-emerald-800/40 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDownloadingReport ? 'Preparing…' : 'Download PDF'}
              </button>
            )}
            {onFetchReport && (
              <button
                onClick={onFetchReport}
                disabled={isFetchingReport}
                className="text-xs px-2 py-1 rounded border border-amber-600/50 bg-amber-900/30 text-amber-300 hover:bg-amber-800/40 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isFetchingReport ? 'Loading…' : 'Fetch Soil Report'}
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-gray-500 border-b border-gray-700">
                  <th className="text-left py-1 pr-2 font-semibold">Symbol</th>
                  <th className="text-left py-1 pr-2 font-semibold">Name</th>
                  <th className="text-left py-1 pr-2 font-semibold">Hydro Grp</th>
                  <th className="text-left py-1 pr-2 font-semibold">Drainage</th>
                  <th className="text-left py-1 font-semibold">Farmland</th>
                </tr>
              </thead>
              <tbody>
                {displayUnits.map(u => (
                  <tr key={u.mukey} className="border-b border-gray-800 hover:bg-gray-800/40">
                    <td className="py-1 pr-2 font-mono font-bold text-stone-400 whitespace-nowrap">{u.musym}</td>
                    <td className="py-1 pr-2 text-gray-300 max-w-[120px] truncate" title={u.muname}>{u.muname}</td>
                    <td className="py-1 pr-2 text-gray-400" title={u.hydgrpdcd ? (HYDRO_GROUP_LABELS[u.hydgrpdcd] || u.hydgrpdcd) : ''}>
                      {u.hydgrpdcd ?? <span className="text-gray-600">—</span>}
                    </td>
                    <td className="py-1 pr-2 text-gray-400 max-w-[90px] truncate" title={u.drclassdcd || ''}>
                      {u.drclassdcd ?? <span className="text-gray-600">—</span>}
                    </td>
                    <td className="py-1 text-gray-400" title={u.farmlndcl ? (FARMLAND_LABELS[u.farmlndcl] || u.farmlndcl) : ''}>
                      {u.farmlndcl ?? <span className="text-gray-600">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {soilReportData && (
            <p className="text-[10px] text-gray-500">
              Tabular data from USDA Soil Data Access (SDA). Hydrologic groups: A = high infiltration, B = moderate, C = slow, D = very slow.
            </p>
          )}
        </div>
      )}

      {/* PA E&S limitations report — Table E.1 limitations + resolutions and
          area of each soil map unit, clipped to the active inclusion boundary. */}
      <div className="space-y-2 border-t border-stone-700/50 pt-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="text-xs font-bold text-stone-300 uppercase tracking-wide">
              PA E&amp;S Limitations Report
            </span>
            <p className="text-[10px] text-gray-500 mt-0.5">
              Table E.1 · {soilLimitationsReport?.chartCached ? 'cached chart' : 'Scout chart on first run'}
            </p>
          </div>
          {onCompileLimitations && (
            <button
              type="button"
              onClick={onCompileLimitations}
              disabled={isCompilingLimitations}
              className="text-xs px-2 py-1 rounded border border-stone-500/60 bg-stone-800/50 text-stone-200 hover:bg-stone-700/60 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isCompilingLimitations ? 'Compiling…' : 'Compile Report'}
            </button>
          )}
        </div>

        {soilLimitationsReport && (
          <div className="space-y-2">
            <div className={`rounded-md border p-2 text-[11px] ${
              soilLimitationsReport.boundaryPresent
                ? 'border-emerald-700/40 bg-emerald-950/20 text-emerald-200'
                : 'border-amber-600/40 bg-amber-950/20 text-amber-200'
            }`}>
              {soilLimitationsReport.boundaryPresent ? (
                <span>
                  Clipped to <strong>{soilLimitationsReport.areaLabel}</strong>:&nbsp;
                  {fmtAcres(soilLimitationsReport.soilAcres)} ac of soil across{' '}
                  {soilLimitationsReport.units.length} map unit{soilLimitationsReport.units.length === 1 ? '' : 's'}.
                </span>
              ) : (
                <span>
                  No inclusion boundary — areas are for the project AOI. Draw a boundary for exact
                  within-boundary areas. {fmtAcres(soilLimitationsReport.soilAcres)} ac across{' '}
                  {soilLimitationsReport.units.length} map unit{soilLimitationsReport.units.length === 1 ? '' : 's'}.
                </span>
              )}
            </div>

            <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
              {soilLimitationsReport.units.map(unit => (
                <details
                  key={`${unit.mukey}-${unit.musym}`}
                  className="rounded border border-gray-700/70 bg-gray-900/50 text-[11px]"
                >
                  <summary className="cursor-pointer px-2 py-1.5 flex items-baseline justify-between gap-2">
                    <span className="min-w-0">
                      <span className="font-mono font-bold text-stone-300">{unit.musym || '—'}</span>{' '}
                      <span className="text-gray-300">{unit.muname || unit.seriesName}</span>
                    </span>
                    <span className="text-gray-400 whitespace-nowrap">{fmtAcres(unit.acres)} ac</span>
                  </summary>
                  <div className="px-2 pb-2 space-y-1.5 border-t border-gray-800 pt-1.5">
                    <p className="text-gray-400">
                      {unit.percent.toFixed(1)}% of area · HSG {unit.hydrologicGroup || '—'} ·{' '}
                      {unit.drainageClass || 'drainage not reported'} · Hydric {unit.hydric || '—'}
                    </p>
                    <p className="text-gray-500">
                      Depth to seasonal HWT: {unit.depthToWaterTableIn == null ? '—' : `${unit.depthToWaterTableIn}"`}
                      {' · '}Depth to bedrock: {unit.depthToBedrockIn == null ? '—' : `${unit.depthToBedrockIn}"`}
                    </p>
                    {unit.limitations.length === 0 ? (
                      <p className="text-gray-400 italic">
                        No Table E.1 limitations marked for this series (absence of an X does not
                        mean no potential limitation).
                      </p>
                    ) : (
                      <>
                        <div>
                          <span className="font-semibold text-amber-300">Limitations: </span>
                          <span className="text-gray-300">
                            {unit.limitations
                              .map(item => item.label + (item.valueLabel ? ` (${item.valueLabel})` : ''))
                              .join('; ')}
                          </span>
                        </div>
                        <div>
                          <span className="font-semibold text-emerald-300">Resolutions:</span>
                          <ol className="list-decimal ml-4 text-gray-300 space-y-0.5 mt-0.5">
                            {unit.resolutions.map(resolution => (
                              <li key={resolution}>{resolution}</li>
                            ))}
                          </ol>
                        </div>
                      </>
                    )}
                  </div>
                </details>
              ))}
            </div>

            {soilLimitationsReport.unmatched.length > 0 && (
              <p className="text-[10px] text-amber-300/90">
                No Table E.1 row matched: {soilLimitationsReport.unmatched.join(', ')}. Verify the
                series name before relying on the limitation list.
              </p>
            )}

            {(onAddLimitationsToSheet || onDownloadLimitations) && (
              <div className="grid grid-cols-2 gap-2">
                {onAddLimitationsToSheet && (
                  <button
                    type="button"
                    onClick={onAddLimitationsToSheet}
                    className="py-2 text-xs font-semibold rounded border border-cyan-600/50 bg-cyan-900/30 text-cyan-200 hover:bg-cyan-800/40"
                    title="Add a compact limitations/resolutions block to the active paper-space sheet"
                  >
                    Add to Sheet
                  </button>
                )}
                {onDownloadLimitations && (
                  <button
                    type="button"
                    onClick={onDownloadLimitations}
                    disabled={isDownloadingLimitations}
                    className="py-2 text-xs font-semibold rounded border border-emerald-600/50 bg-emerald-900/30 text-emerald-200 hover:bg-emerald-800/40 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDownloadingLimitations ? 'Preparing…' : 'Download PDF'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Live hatch + annotation controls — rebuilds editable CanvasHatch
          entities and centroid labels for already-fetched soil areas. */}
      <AreaHatchControls
        kind="soils"
        value={soilHatch}
        areaCount={lastResult?.featureCount ?? 0}
        onChange={onSoilHatchChange}
      />

      {/* Footer */}
      <p className="text-xs text-gray-500 leading-relaxed border-t border-gray-700 pt-2">
        Each soil map unit is added as its own CAD layer (
        <code className="text-stone-400">SOILS-HgB</code>,{' '}
        <code className="text-stone-400">SOILS-MnB2</code>, etc.) so you can style or hide each
        individually from the CAD Manager and Data Visibility panels.
      </p>
    </div>
  );
};

export default SoilsPanel;
