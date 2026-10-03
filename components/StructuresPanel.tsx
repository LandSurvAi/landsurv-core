import React, { useState } from 'react';
import { HomeIcon } from './icons.tsx';
import type { InclusionBoundary } from '../types.ts';
import type { StructuresFetchResult } from '../services/structuresService.ts';
import type { RectifyStats } from '../services/buildingRectifier.ts';
import { nsiOccupancyCategory } from '../services/structuresService.ts';

/**
 * StructuresPanel (v26.05.31) — Structures Agent floating panel.
 *
 * Drives a two-stage workflow:
 *   1. Fetch — pulls FEMA NSI centroids (attributes) AND OSM building polygons
 *      (real geometry) for the inclusion bbox or a geocoded description.
 *      NSI attributes are joined onto OSM polygons via point-in-polygon.
 *   2. Rectify — runs a deterministic, client-side rectifier: OSM polygons are
 *      Helmert-snapped to survey BLDG corners; BLDG-only clusters are completed
 *      via COGO (1/2/3 corners) or minimum-area rectangle (≥4 corners); lone
 *      NSI centroids with sqft are emitted as synthetic squares.
 */

interface StructuresPanelProps {
  onFetchStructures: (mode: 'inclusion' | 'description', descriptionText?: string) => void;
  isFetching: boolean;
  hasInclusionBoundary: boolean;
  inclusionSegmentCount: number;
  lastResult?: StructuresFetchResult | null;
  /** Number of OSM building polygons cached from the most recent fetch. */
  osmFootprintCount?: number;
  /** Rectifier output stats from the most recent Rectify run (null until run). */
  lastRectifyStats?: RectifyStats | null;
  onClearStructures?: () => void;
  onSynthesize?: () => void;
  isSynthesizing?: boolean;
  surveyBldgCount?: number;
  /** Known inclusion boundaries for boundary selector. */
  inclusionBoundaries?: InclusionBoundary[];
  activeInclusionBoundaryId?: string | null;
  onSelectInclusionBoundary?: (id: string | null) => void;
  onManageInclusionBoundaries?: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  'Residential': 'text-amber-300',
  'Commercial': 'text-orange-300',
  'Industrial': 'text-red-400',
  'Agricultural': 'text-lime-400',
  'Government': 'text-blue-300',
  'Education': 'text-purple-300',
  'Religious/Cultural': 'text-pink-300',
  'Other': 'text-gray-400',
};

export const StructuresPanel: React.FC<StructuresPanelProps> = ({
  onFetchStructures,
  isFetching,
  hasInclusionBoundary,
  inclusionSegmentCount,
  lastResult,
  osmFootprintCount = 0,
  lastRectifyStats = null,
  onClearStructures,
  onSynthesize,
  isSynthesizing = false,
  surveyBldgCount = 0,
  inclusionBoundaries = [],
  activeInclusionBoundaryId = null,
  onSelectInclusionBoundary,
  onManageInclusionBoundaries,
}) => {
  const [mode, setMode] = useState<'inclusion' | 'description'>('description');
  const [description, setDescription] = useState('');

  const canFetch =
    !isFetching &&
    ((mode === 'inclusion' && hasInclusionBoundary) ||
     (mode === 'description' && description.trim().length > 2));

  const handleFetch = () => {
    if (!canFetch) return;
    onFetchStructures(mode, mode === 'description' ? description.trim() : undefined);
  };

  const categoryEntries = lastResult
    ? Object.entries(lastResult.categoryCounts).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div className="space-y-4 text-sm">
      {/* Source badge */}
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <HomeIcon className="w-4 h-4 text-orange-400" />
        <span>Sources: FEMA NSI (attributes) + OpenStreetMap (geometry)</span>
      </div>

      {/* Mode toggle */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setMode('description')}
          className={`px-3 py-2 rounded-md text-sm font-semibold border transition ${
            mode === 'description'
              ? 'bg-orange-500/20 border-orange-500 text-orange-200'
              : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'
          }`}
        >
          AI Description
        </button>
        <button
          onClick={() => setMode('inclusion')}
          className={`px-3 py-2 rounded-md text-sm font-semibold border transition ${
            mode === 'inclusion'
              ? 'bg-orange-500/20 border-orange-500 text-orange-200'
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
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-100 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none"
          />
          <p className="text-xs text-gray-500 mt-1">
            Geocoded via OpenStreetMap Nominatim to derive the query bounding box.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {inclusionBoundaries.length > 0 && (
            <div className="bg-gray-900/40 border border-emerald-700/30 rounded-md p-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-semibold tracking-wide text-emerald-300/80">Inclusion Boundary</span>
                {onManageInclusionBoundaries && (
                  <button type="button" onClick={onManageInclusionBoundaries}
                    className="text-[10px] text-emerald-300 hover:text-emerald-200 underline">
                    Manage…
                  </button>
                )}
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
                &#10003; Using inclusion boundary ({inclusionSegmentCount} segments) as the query bbox.
              </span>
            ) : (
              <span className="text-amber-300">
                No inclusion lines drawn. Use the Inclusion tool on the canvas to trace a closed boundary first.
              </span>
            )}
          </div>
        </div>
      )}

      {/* Fetch button */}
      <button
        onClick={handleFetch}
        disabled={!canFetch}
        className="w-full py-2.5 px-4 font-semibold text-white bg-orange-600 rounded-md hover:bg-orange-700 transition-colors disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
      >
        {isFetching ? 'Fetching NSI Structures\u2026' : 'Fetch FEMA Structures'}
      </button>

      {/* Results summary */}
      {lastResult && (
        <div className="bg-gray-900/60 border border-orange-500/20 rounded-md p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-orange-300">
              {lastResult.featureCount} NSI centroid{lastResult.featureCount === 1 ? '' : 's'} · {osmFootprintCount} OSM polygon{osmFootprintCount === 1 ? '' : 's'} · {surveyBldgCount} survey BLDG
            </span>
            {onClearStructures && (
              <button
                onClick={onClearStructures}
                className="text-xs text-gray-400 hover:text-red-400 underline"
              >
                Clear
              </button>
            )}
          </div>
          {lastResult.exceededTransferLimit && (
            <p className="text-[10px] text-amber-400">
              NSI result set may be truncated (&#8805;5,000 features). Zoom in or use a smaller area.
            </p>
          )}
          {osmFootprintCount === 0 && lastResult.featureCount > 0 && (
            <p className="text-[10px] text-amber-400">
              No OSM building polygons found — rectifier will fall back to NSI/COGO synthesis (lower confidence).
            </p>
          )}
          {categoryEntries.length > 0 && (
            <ul className="text-xs space-y-0.5">
              {categoryEntries.map(([cat, count]) => (
                <li key={cat} className="flex items-center justify-between gap-2">
                  <span className={CATEGORY_COLORS[cat] ?? 'text-gray-400'}>{cat}</span>
                  <span className="text-gray-400 font-mono">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Synthesis section */}
      {(lastResult || osmFootprintCount > 0 || surveyBldgCount > 0) && (
        <div className="border border-orange-700/30 rounded-md bg-orange-950/20 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-orange-300 uppercase tracking-wide">Rectify Footprints</span>
          </div>
          <p className="text-[10px] text-gray-400 leading-relaxed">
            Snap OSM polygons to {surveyBldgCount} survey BLDG corner{surveyBldgCount === 1 ? '' : 's'} via Helmert; complete partial BLDG clusters via COGO; fall back to NSI sqft for unmatched centroids. Output lands on the <code className="text-orange-300">STRUCTURES</code> layer (replaces any prior).
          </p>
          <button
            onClick={onSynthesize}
            disabled={isSynthesizing || !onSynthesize}
            className="w-full py-2 px-4 font-semibold text-white bg-orange-700 rounded-md hover:bg-orange-600 transition-colors disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-xs"
          >
            {isSynthesizing ? 'Rectifying\u2026' : '\u2728 Rectify Building Footprints'}
          </button>
          {lastRectifyStats && (
            <div className="mt-2 pt-2 border-t border-orange-800/40 text-[10px] text-gray-400 space-y-0.5">
              <div className="font-semibold text-orange-300 uppercase tracking-wide text-[9px]">Last rectify run</div>
              {lastRectifyStats.osmSnapped > 0 && (
                <div><span className="text-green-400">HIGH</span> · OSM + BLDG snapped: <span className="font-mono text-gray-200">{lastRectifyStats.osmSnapped}</span></div>
              )}
              {lastRectifyStats.cogo3 > 0 && (
                <div><span className="text-green-400">HIGH</span> · 3-corner COGO: <span className="font-mono text-gray-200">{lastRectifyStats.cogo3}</span></div>
              )}
              {lastRectifyStats.cogoMer > 0 && (
                <div><span className="text-green-400">HIGH</span> · ≥4-corner MER: <span className="font-mono text-gray-200">{lastRectifyStats.cogoMer}</span></div>
              )}
              {lastRectifyStats.osmAsIs > 0 && (
                <div><span className="text-amber-400">MED</span> · OSM as-is: <span className="font-mono text-gray-200">{lastRectifyStats.osmAsIs}</span></div>
              )}
              {lastRectifyStats.cogo2 > 0 && (
                <div><span className="text-amber-400">MED</span> · 2-corner extrusion: <span className="font-mono text-gray-200">{lastRectifyStats.cogo2}</span></div>
              )}
              {lastRectifyStats.cogo1 > 0 && (
                <div><span className="text-red-400">LOW</span> · 1-corner square: <span className="font-mono text-gray-200">{lastRectifyStats.cogo1}</span></div>
              )}
              {lastRectifyStats.nsiOnly > 0 && (
                <div><span className="text-red-400">LOW</span> · NSI-only synthetic: <span className="font-mono text-gray-200">{lastRectifyStats.nsiOnly}</span></div>
              )}
              {lastRectifyStats.warnings.length > 0 && (
                <div className="text-amber-400 mt-1">{lastRectifyStats.warnings.length} warning{lastRectifyStats.warnings.length === 1 ? '' : 's'}</div>
              )}
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-gray-500 leading-relaxed border-t border-gray-700 pt-2">
        NSI centroids land on <code className="text-orange-300">FEMA-NSI</code> (points). OSM polygons are held in memory and emitted to <code className="text-orange-300">STRUCTURES</code> only after Rectify. Toggle either via the CAD Manager.
      </p>
    </div>
  );
};

export default StructuresPanel;
