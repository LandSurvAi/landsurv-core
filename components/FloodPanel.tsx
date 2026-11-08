import React, { useMemo, useState } from 'react';
import { FloodIcon } from './icons.tsx';
import type { AreaHatchSettings, InclusionBoundary, MapAreaFeature } from '../types.ts';
import { AreaHatchControls } from './AreaHatchControls.tsx';
import { buildFloodSheetNotes, buildFloodZoneReport } from '../services/floodReport.ts';

/**
 * FloodPanel — controls for the Flood Zone Agent.
 *
 * Mirrors the Contour Agent's "inclusion or description" UX: the user either
 * draws an inclusion polygon on the canvas first, or types a free-text area
 * description (county, township, address, lat/lon, etc.) and we geocode it
 * via Nominatim. Either way, FEMA NFHL is queried for the bbox and returned
 * polygons are converted to SurveyLines tagged
 * layer='FEMA-FLOOD-<ZONE>', type='flood'.
 *
 * The agent is deliberately inquisitive: before fetching it asks whether BFE
 * lines should come along, and after fetching it offers zone callouts, a
 * written flood-zone report, and a notes block for the plan sheet.
 */

interface FloodFetchOptions {
  /** Also fetch FEMA Base Flood Elevation linework (NFHL layer 16). */
  includeBfe?: boolean;
}

interface FloodPanelProps {
  onFetchFloodZones: (
    mode: 'inclusion' | 'description',
    descriptionText?: string,
    options?: FloodFetchOptions,
  ) => void;
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
  floodHatch?: Partial<AreaHatchSettings>;
  /** Called when the user changes a hatch setting; applies live to fetched areas. */
  onFloodHatchChange?: (patch: Partial<AreaHatchSettings>) => void;
  /** Closed FEMA polygons from the last fetch — powers the report + notes. */
  floodAreas?: MapAreaFeature[];
  /** Optional BFE linework summary from the last fetch. */
  bfeSummary?: { count: number; datum?: string | null; error?: string } | null;
  /** Append a notes block to the active paperspace sheet titleblock. */
  onAddSheetNotes?: (notes: string) => void;
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
  A:     '1% annual chance — no BFE determined',
  AE:    '1% annual chance — BFE determined',
  AH:    '1% annual chance shallow flooding (1–3 ft)',
  AO:    '1% annual chance sheet flow (1–3 ft)',
  VE:    '1% annual chance — coastal high hazard (wave action)',
  X:     'Minimal risk — outside 0.2% annual chance',
  'X-SHADED': '0.2% annual chance (500-year)',
  D:     'Possible but undetermined hazard',
  OPEN:  'Open water',
  AREA:  'Area not included',
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
  floodAreas = [],
  bfeSummary,
  onAddSheetNotes,
  onFetchFirmette,
  isFetchingFirmette,
  hasFirmette,
  onViewFirmette,
}) => {
  const [mode, setMode] = useState<'inclusion' | 'description'>('description');
  const [description, setDescription] = useState('');
  /** Asked up-front so the agent can bring BFE lines in the same pass. */
  const [includeBfe, setIncludeBfe] = useState(true);
  const [showReport, setShowReport] = useState(false);
  const [copied, setCopied] = useState(false);

  const canFetch =
    !isFetching &&
    ((mode === 'inclusion' && hasInclusionBoundary) ||
     (mode === 'description' && description.trim().length > 2));

  const handleFetch = () => {
    if (!canFetch) return;
    onFetchFloodZones(
      mode,
      mode === 'description' ? description.trim() : undefined,
      { includeBfe },
    );
  };

  const zoneEntries = lastResult ? Object.entries(lastResult.zoneCounts).sort((a, b) => b[1] - a[1]) : [];
  const calloutsEnabled = floodHatch?.showLabels !== false;

  const reportInput = useMemo(() => ({
    areas: floodAreas,
    zoneCounts: lastResult?.zoneCounts ?? {},
    featureCount: lastResult?.featureCount ?? 0,
    bfeCount: bfeSummary?.count ?? 0,
    bfeDatum: bfeSummary?.datum ?? null,
    bfeError: bfeSummary?.error ?? null,
  }), [floodAreas, lastResult, bfeSummary]);

  const reportText = useMemo(
    () => buildFloodZoneReport(reportInput),
    [reportInput],
  );
  const sheetNotes = useMemo(
    () => buildFloodSheetNotes(reportInput),
    [reportInput],
  );

  const copyReport = () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    void navigator.clipboard.writeText(reportText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => { /* clipboard blocked — download still works */ });
  };

  const downloadReport = () => {
    if (typeof document === 'undefined') return;
    const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fema-flood-zone-report.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

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

      {/* Inquisitive deliverables checklist — asked before the fetch */}
      <div className="rounded-md border border-cyan-700/30 bg-cyan-950/20 p-3 space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-wide text-cyan-300">
          Before I fetch — what do you want with it?
        </div>
        <label className="flex items-start gap-2 text-[11px] text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={includeBfe}
            onChange={e => setIncludeBfe(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 accent-cyan-400"
          />
          <span>
            <span className="font-semibold text-cyan-200">Base Flood Elevation (BFE) lines</span>
            <span className="block text-[10px] text-gray-500">
              Dashed elevation lines with BFE callouts on layer FEMA-BFE. Slower, but gives you the regulatory elevations.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-[11px] text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={calloutsEnabled}
            onChange={e => onFloodHatchChange?.({ showLabels: e.target.checked })}
            className="mt-0.5 h-3.5 w-3.5 accent-cyan-400"
          />
          <span>
            <span className="font-semibold text-cyan-200">FEMA zone callouts</span>
            <span className="block text-[10px] text-gray-500">
              Centroid labels such as “FEMA ZONE AE / BFE 12.5 FT”.
            </span>
          </span>
        </label>
        <p className="text-[10px] leading-relaxed text-gray-500">
          After the fetch I can also write a flood-zone report or drop a notes block onto the paperspace plan sheet.
        </p>
      </div>

      {/* Fetch button */}
      <button
        onClick={handleFetch}
        disabled={!canFetch}
        className="w-full py-2.5 px-4 font-semibold text-white bg-cyan-600 rounded-md hover:bg-cyan-700 transition-colors disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
      >
        {isFetching ? 'Fetching FEMA NFHL…' : includeBfe ? 'Fetch Flood Zones + BFEs' : 'Fetch Flood Zones'}
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
                Clear flood areas
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
          <div className="flex items-center justify-between text-[11px] border-t border-gray-700/60 pt-1.5">
            <span className="text-gray-400">BFE lines</span>
            <span className={bfeSummary?.count ? 'font-mono text-blue-300' : 'text-gray-500'}>
              {bfeSummary?.count
                ? `${bfeSummary.count}${bfeSummary.datum ? ` · ${bfeSummary.datum}` : ''}`
                : 'none'}
            </span>
          </div>
          {bfeSummary?.error && (
            <p className="text-[10px] text-amber-300/90">
              BFE layer unavailable for this area: {bfeSummary.error}
            </p>
          )}
        </div>
      )}

      {/* Inquisitive follow-up — the agent asks what else to produce */}
      {lastResult && (
        <div className="rounded-md border border-gray-700/70 bg-gray-900/50 p-3 space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
            Want me to take it further?
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setShowReport(v => !v)}
              className={`px-2 py-1.5 text-[11px] font-semibold rounded border transition ${
                showReport
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                  : 'bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-500'
              }`}
            >
              {showReport ? 'Hide report' : 'Flood report'}
            </button>
            <button
              type="button"
              onClick={() => onAddSheetNotes?.(sheetNotes)}
              disabled={!onAddSheetNotes}
              className="px-2 py-1.5 text-[11px] font-semibold rounded border border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Notes → plan sheet
            </button>
          </div>
          {!bfeSummary?.count && (
            <button
              type="button"
              onClick={() => {
                setIncludeBfe(true);
                if (mode === 'description' && description.trim().length > 2) {
                  onFetchFloodZones('description', description.trim(), { includeBfe: true });
                } else if (hasInclusionBoundary) {
                  onFetchFloodZones('inclusion', undefined, { includeBfe: true });
                }
              }}
              disabled={isFetching || (mode === 'description' ? description.trim().length <= 2 : !hasInclusionBoundary)}
              className="w-full px-2 py-1.5 text-[11px] font-semibold rounded border border-blue-500/40 bg-blue-900/30 text-blue-300 hover:bg-blue-800/40 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add BFE lines to this area
            </button>
          )}
          <p className="text-[10px] text-gray-500 leading-relaxed">
            I can also label the zones one by one, clip the floodplain to your boundary, or include FIRMETTE imagery.
          </p>
        </div>
      )}

      {/* Report preview */}
      {showReport && lastResult && (
        <div className="rounded-md border border-cyan-500/25 bg-gray-950/70 p-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wide text-cyan-300">Flood zone report</span>
            <div className="flex gap-2">
              <button type="button" onClick={copyReport} className="text-[10px] text-gray-400 hover:text-cyan-300 underline">
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button type="button" onClick={downloadReport} className="text-[10px] text-gray-400 hover:text-cyan-300 underline">
                Download
              </button>
            </div>
          </div>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-gray-300">
            {reportText}
          </pre>
        </div>
      )}

      {/* Live hatch + annotation controls — rebuilds editable CanvasHatch
          entities and centroid labels for already-fetched flood areas. */}
      <AreaHatchControls
        kind="flood"
        value={floodHatch}
        areaCount={lastResult?.featureCount ?? 0}
        onChange={onFloodHatchChange}
      />

      <p className="text-xs text-gray-500 leading-relaxed border-t border-gray-700 pt-2">
        Each FEMA flood zone is added as its own CAD layer (<code className="text-cyan-300">FEMA-FLOOD-AE</code>,
        <code className="text-cyan-300 ml-1">FEMA-FLOOD-X</code>, etc.) and BFE linework lands on{' '}
        <code className="text-blue-300">FEMA-BFE</code> so you can style or hide each independently.
      </p>
    </div>
  );
};

export default FloodPanel;
