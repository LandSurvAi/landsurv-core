import React, { useState } from 'react';
import { FloodIcon } from './icons.tsx';
import type { InclusionBoundary, Settings } from '../types.ts';

/**
 * FloodPanel (v26.05.17.16) \u2014 controls for the Flood Zone Agent.
 *
 * Mirrors the Contour Agent's "inclusion or description" UX: the user either
 * draws an inclusion polygon on the canvas first, or types a free-text area
 * description (county, township, address, lat/lon, etc.) and we geocode it
 * via Nominatim. Either way, FEMA NFHL (layer 28) is queried for the bbox
 * and returned polygons are converted to SurveyLines tagged
 * layer='FEMA-FLOOD-<ZONE>', type='flood'.
 *
 * Designed to be rendered inside <FloatingPanel> as the pilot for moving
 * dialogs out of the docked-sidebar paradigm.
 */

interface FloodPanelProps {
  onFetchFloodZones: (mode: 'inclusion' | 'description', descriptionText?: string) => void;
  isFetching: boolean;
  hasInclusionBoundary: boolean;
  inclusionSegmentCount: number;
  /** Last fetch result summary for display — zone code → polygon count. */
  lastResult?: { zoneCounts: Record<string, number>; featureCount: number } | null;
  onClearFloodLines?: () => void;
  /** Known inclusion boundaries — when supplied, a selector is shown. */
  inclusionBoundaries?: InclusionBoundary[];
  activeInclusionBoundaryId?: string | null;
  onSelectInclusionBoundary?: (id: string | null) => void;
  onManageInclusionBoundaries?: () => void;
  /** Current hatch settings from app Settings object. */
  floodHatch?: Settings['floodHatch'];
  /** Called when the user changes a hatch setting. */
  onFloodHatchChange?: (patch: Partial<NonNullable<Settings['floodHatch']>>) => void;
  /** Trigger a FIRMETTE image fetch for the current query area (requires a prior flood fetch). */
  onFetchFirmette?: () => void;
  /** Whether a firmette image is currently being fetched. */
  isFetchingFirmette?: boolean;
  /** Whether a firmette has been stored for this session (shows View button). */
  hasFirmette?: boolean;
  /** Show/open the stored firmette image panel. */
  onViewFirmette?: () => void;
}

const ZONE_BLURBS: Record<string, string> = {
  A:     '1% annual chance \u2014 no BFE determined',
  AE:    '1% annual chance \u2014 BFE determined',
  AH:    '1% annual chance shallow flooding (1\u20133 ft)',
  AO:    '1% annual chance sheet flow (1\u20133 ft)',
  VE:    '1% annual chance \u2014 coastal high hazard (wave action)',
  X:     'Minimal risk \u2014 outside 0.2% annual chance',
  'X-SHADED': '0.2% annual chance (500-year)',
  D:     'Possible but undetermined hazard',
  OPEN:  'Open water',
  AREA: 'Area not included',
};

export const FloodPanel: React.FC<FloodPanelProps> = ({
  onFetchFloodZones,
  isFetching,
  hasInclusionBoundary,
  inclusionSegmentCount,
  lastResult,
  onClearFloodLines,
  inclusionBoundaries = [],
  activeInclusionBoundaryId = null,
  onSelectInclusionBoundary,
  onManageInclusionBoundaries,
  floodHatch,
  onFloodHatchChange,
  onFetchFirmette,
  isFetchingFirmette,
  hasFirmette,
  onViewFirmette,
}) => {
  const [mode, setMode] = useState<'inclusion' | 'description'>('description');
  const [description, setDescription] = useState('');

  const canFetch =
    !isFetching &&
    ((mode === 'inclusion' && hasInclusionBoundary) ||
     (mode === 'description' && description.trim().length > 2));

  const handleFetch = () => {
    if (!canFetch) return;
    onFetchFloodZones(mode, mode === 'description' ? description.trim() : undefined);
  };

  const zoneEntries = lastResult ? Object.entries(lastResult.zoneCounts).sort((a, b) => b[1] - a[1]) : [];

  return (
    <div className="space-y-4 text-sm">
      {/* Source badge */}
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <FloodIcon className="w-4 h-4 text-cyan-400" />
        <span>Source: FEMA National Flood Hazard Layer (NFHL)</span>
      </div>

      {/* Mode toggle */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setMode('description')}
          className={`px-3 py-2 rounded-md text-sm font-semibold border transition ${
            mode === 'description'
              ? 'bg-cyan-500/20 border-cyan-500 text-cyan-200'
              : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'
          }`}
        >
          AI Description
        </button>
        <button
          onClick={() => setMode('inclusion')}
          className={`px-3 py-2 rounded-md text-sm font-semibold border transition ${
            mode === 'inclusion'
              ? 'bg-cyan-500/20 border-cyan-500 text-cyan-200'
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
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-100 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 resize-none"
          />
          <p className="text-xs text-gray-500 mt-1">
            Geocoded via OpenStreetMap Nominatim. A minimum ~11 km area is always queried so small lookups still return surrounding flood zones.
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
                &#10003; Using inclusion boundary ({inclusionSegmentCount} segments) on the canvas as the query bbox.
              </span>
            ) : (
              <span className="text-amber-300">
                No inclusion lines drawn. Switch to the canvas Inclusion tool and trace a closed boundary first, then return here.
              </span>
            )}
          </div>
        </div>
      )}

      {/* Fetch button + FIRMETTE row */}
      <button
        onClick={handleFetch}
        disabled={!canFetch}
        className="w-full py-2.5 px-4 font-semibold text-white bg-cyan-600 rounded-md hover:bg-cyan-700 transition-colors disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
      >
        {isFetching ? 'Fetching FEMA NFHL…' : 'Fetch Flood Zones'}
      </button>

      {/* FIRMETTE row — visible after at least one flood fetch */}
      {(lastResult || hasFirmette) && (onFetchFirmette || onViewFirmette) && (
        <div className="flex gap-2">
          {onFetchFirmette && (
            <button
              onClick={onFetchFirmette}
              disabled={isFetchingFirmette || !lastResult}
              className="flex-1 py-1.5 px-3 text-xs font-semibold rounded-md border transition-colors
                bg-indigo-900/40 border-indigo-500/50 text-indigo-300 hover:bg-indigo-800/50
                disabled:bg-gray-800/40 disabled:border-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
              title="Download and store FEMA FIRMETTE imagery for this area"
            >
              {isFetchingFirmette ? 'Fetching FIRMETTE…' : '🗺 Get FIRMETTE'}
            </button>
          )}
          {hasFirmette && onViewFirmette && (
            <button
              onClick={onViewFirmette}
              className="flex-1 py-1.5 px-3 text-xs font-semibold rounded-md border transition-colors
                bg-violet-900/40 border-violet-500/50 text-violet-300 hover:bg-violet-800/50"
              title="Open the stored FIRMETTE image"
            >
              📄 View FIRMETTE
            </button>
          )}
        </div>
      )}

      {/* Results summary */}
      {lastResult && (
        <div className="bg-gray-900/60 border border-cyan-500/20 rounded-md p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-cyan-300">
              {lastResult.featureCount} polygon{lastResult.featureCount === 1 ? '' : 's'} added
            </span>
            {onClearFloodLines && (
              <button
                onClick={onClearFloodLines}
                className="text-xs text-gray-400 hover:text-red-400 underline"
              >
                Clear flood lines
              </button>
            )}
          </div>
          {zoneEntries.length > 0 && (
            <ul className="text-xs text-gray-300 space-y-1">
              {zoneEntries.map(([zone, count]) => (
                <li key={zone} className="flex items-baseline justify-between gap-2">
                  <span>
                    <span className="font-mono font-bold text-cyan-400">{zone}</span>
                    <span className="text-gray-500 ml-1.5">{ZONE_BLURBS[zone] || ''}</span>
                  </span>
                  <span className="text-gray-400 text-xs whitespace-nowrap">{count}&times;</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Footer hint */}
      {/* Hatch Fill Controls */}
      <div className="border border-cyan-700/30 rounded-md bg-cyan-950/20 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-cyan-300 uppercase tracking-wide">Hatch Fill</span>
          <span className="text-[10px] text-gray-500">drawn inside flood polygons</span>
        </div>

        {/* Style selector */}
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">Pattern</label>
          <div className="grid grid-cols-5 gap-1">
            {(['none', 'lines', 'cross', 'chevron', 'dots'] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => onFloodHatchChange?.({ style: s })}
                className={`py-1 rounded text-[10px] font-semibold border transition-colors
                  ${(floodHatch?.style ?? 'lines') === s
                    ? 'bg-cyan-500/30 border-cyan-400 text-cyan-200'
                    : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-cyan-600'}`}
                title={s}
              >
                {s === 'none' ? '∅' : s === 'lines' ? '///' : s === 'cross' ? '×' : s === 'chevron' ? '~~~' : '···'}
              </button>
            ))}
          </div>
        </div>

        {/* Scale slider */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] uppercase tracking-wide text-gray-400">Spacing</label>
            <span className="text-[10px] font-mono text-cyan-300">{floodHatch?.scale ?? 50} ft</span>
          </div>
          <input
            type="range" min={10} max={200} step={5}
            value={floodHatch?.scale ?? 50}
            onChange={e => onFloodHatchChange?.({ scale: Number(e.target.value) })}
            className="w-full accent-cyan-400"
          />
          <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
            <span>tight</span><span>loose</span>
          </div>
        </div>

        {/* Opacity slider */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] uppercase tracking-wide text-gray-400">Opacity</label>
            <span className="text-[10px] font-mono text-cyan-300">{Math.round((floodHatch?.opacity ?? 0.18) * 100)}%</span>
          </div>
          <input
            type="range" min={3} max={60} step={1}
            value={Math.round((floodHatch?.opacity ?? 0.18) * 100)}
            onChange={e => onFloodHatchChange?.({ opacity: Number(e.target.value) / 100 })}
            className="w-full accent-cyan-400"
          />
        </div>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed border-t border-gray-700 pt-2">
        Each FEMA flood zone is added as its own CAD layer (<code className="text-cyan-300">FEMA-FLOOD-AE</code>,
        <code className="text-cyan-300 ml-1">FEMA-FLOOD-X</code>, etc.) so you can style or hide each from the
        CAD Manager and Data Visibility panels.
      </p>
    </div>
  );
};

export default FloodPanel;
