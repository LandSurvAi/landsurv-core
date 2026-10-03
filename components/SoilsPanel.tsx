import React, { useState } from 'react';
import { SoilsIcon } from './icons.tsx';
import type { InclusionBoundary, SoilMapUnit } from '../types.ts';
import type { SoilsFetchResult } from '../services/soilsService.ts';

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
  onClearSoils?: () => void;
  soilMapUnits: SoilMapUnit[];
  onFetchReport?: () => void;
  isFetchingReport?: boolean;
  soilReportData?: Record<string, { hydgrpdcd?: string; drclassdcd?: string; taxclname?: string; farmlndcl?: string }> | null;
  inclusionBoundaries?: InclusionBoundary[];
  activeInclusionBoundaryId?: string | null;
  onSelectInclusionBoundary?: (id: string | null) => void;
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
  onClearSoils,
  soilMapUnits,
  onFetchReport,
  isFetchingReport = false,
  soilReportData,
  inclusionBoundaries = [],
  activeInclusionBoundaryId = null,
  onSelectInclusionBoundary,
}) => {
  const [mode, setMode] = useState<'inclusion' | 'description'>('description');
  const [description, setDescription] = useState('');

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
