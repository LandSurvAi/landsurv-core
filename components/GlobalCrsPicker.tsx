import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectionSetting } from '../types.ts';
import type { CrsDefinition, CrsSuggestion } from '../utils/crs/types.ts';
import {
  ensureCrsRegistered,
  loadNtV2Grid,
  searchCrs,
  suggestCrsForLocation,
  suggestCrsLocal,
} from '../utils/crs/registry.ts';

export interface GlobalCrsPickerProps {
  onSelect: (projection: ProjectionSetting, definition: CrsDefinition) => void;
  currentEpsg?: number | null;
  /** WGS84 [west, south, east, north] of the project boundary. */
  bbox?: [number, number, number, number] | null;
  gpsPosition?: { latitude: number; longitude: number } | null;
  placeholder?: string;
}

const shortArea = (area: string | null | undefined, max = 110): string => {
  if (!area) return '';
  return area.length > max ? `${area.slice(0, max - 1)}…` : area;
};

/**
 * Search the global EPSG registry by code, name, country/region or projection
 * type, with auto-suggestions derived from the project boundary or GPS fix.
 */
const GlobalCrsPicker: React.FC<GlobalCrsPickerProps> = ({
  onSelect,
  currentEpsg,
  bbox,
  gpsPosition,
  placeholder = 'Search EPSG code, country, or projection (e.g. 32631, UK, Lambert)',
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CrsDefinition[]>([]);
  const [suggestions, setSuggestions] = useState<CrsSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState<CrsDefinition | null>(null);
  const [epochInput, setEpochInput] = useState('');
  const [gridKey, setGridKey] = useState<string | null>(null);
  const [gridMessage, setGridMessage] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => () => { alive.current = false; }, []);

  const location = useMemo(() => {
    if (gpsPosition && Number.isFinite(gpsPosition.latitude) && Number.isFinite(gpsPosition.longitude)) {
      return { lat: gpsPosition.latitude, lon: gpsPosition.longitude, label: 'your GPS position' };
    }
    if (bbox && bbox.length === 4 && bbox.every(Number.isFinite)) {
      const [west, south, east, north] = bbox;
      const lon = east >= west ? (west + east) / 2 : ((west + east + 360) / 2) % 360 - 180;
      return { lat: (south + north) / 2, lon, label: 'your project area' };
    }
    return null;
  }, [bbox, gpsPosition]);

  useEffect(() => {
    let cancelled = false;
    if (!location) {
      setSuggestions([]);
      return;
    }
    // Instant local suggestions, then enrich with the EPSG-wide registry.
    setSuggestions(suggestCrsLocal(location.lat, location.lon, 6));
    void suggestCrsForLocation(location, 7)
      .then(list => { if (!cancelled && alive.current) setSuggestions(list); })
      .catch(() => { /* local suggestions already shown */ });
    return () => { cancelled = true; };
  }, [location]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      void searchCrs(q, 20)
        .then(list => {
          if (!cancelled && alive.current) {
            setResults(list);
            setLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled && alive.current) setLoading(false);
        });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  const apply = useCallback(async (definition: CrsDefinition, epoch: number | null) => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const resolved = await ensureCrsRegistered(
        definition.code,
        { epoch, nadgridKey: definition.gridShift && gridKey ? gridKey : null },
        definition,
      );
      if (!resolved || !resolved.proj4) {
        setError(`EPSG:${definition.code} has no usable proj4 definition.`);
        return;
      }
      onSelect({
        state: definition.country || 'International',
        zoneName: definition.name,
        epsg: definition.code,
        epoch: epoch ?? definition.epoch ?? null,
      }, resolved);
      setStatus(`Applied EPSG:${definition.code} — ${definition.name}`);
      setPending(null);
    } catch (err: any) {
      setError(err?.message || `Could not register EPSG:${definition.code}`);
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [gridKey, onSelect]);

  const handleRow = (definition: CrsDefinition) => {
    setError(null);
    setStatus(null);
    if (definition.epoch != null || definition.gridShift) {
      setPending(definition);
      setEpochInput(definition.epoch != null ? String(definition.epoch) : '');
      setGridKey(null);
      setGridMessage(null);
      return;
    }
    void apply(definition, null);
  };

  const handleApplyPending = () => {
    if (!pending) return;
    const trimmed = epochInput.trim();
    const epoch = trimmed === '' ? null : Number(trimmed);
    if (epoch !== null && (!Number.isFinite(epoch) || epoch < 1900 || epoch > 2200)) {
      setError('Epoch must be a decimal year between 1900 and 2200 (e.g. 2026.5).');
      return;
    }
    void apply(pending, epoch);
  };

  const handleGridFile = async (file: File | undefined) => {
    if (!file || !pending) return;
    setGridMessage(null);
    try {
      const key = await loadNtV2Grid(file, pending);
      setGridKey(key);
      setGridMessage(`Loaded ${file.name}. Apply to use the grid shift.`);
    } catch (err: any) {
      setGridMessage(`Could not read ${file.name}: ${err?.message || 'invalid NTv2 file'}`);
    }
  };

  const rows: Array<CrsDefinition | CrsSuggestion> = query.trim() ? results : suggestions;
  const showingSuggestions = !query.trim() && rows.length > 0;

  return (
    <div className="rounded-lg border border-gray-600 bg-gray-800/60 p-3 light-theme:border-gray-300 light-theme:bg-gray-50">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-teal-400">Worldwide / EPSG</span>
        {currentEpsg ? (
          <span className="text-[10px] font-mono text-gray-400 light-theme:text-gray-500">Current: EPSG:{currentEpsg}</span>
        ) : null}
      </div>

      <div className="relative">
        <svg
          className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-500 pointer-events-none"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={placeholder}
          aria-label="Search worldwide coordinate systems"
          className="w-full bg-gray-900/70 border border-gray-600 rounded-md pl-8 pr-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900"
        />
      </div>

      {location && showingSuggestions && (
        <p className="mt-2 text-[11px] text-gray-400 light-theme:text-gray-500">
          Suggested for {location.label} ({location.lat.toFixed(4)}, {location.lon.toFixed(4)})
        </p>
      )}

      <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-gray-700/60 divide-y divide-gray-700/40 light-theme:border-gray-300 light-theme:divide-gray-200">
        {loading && (
          <div className="px-3 py-3 text-xs text-gray-400">Searching the EPSG registry…</div>
        )}
        {!loading && rows.length === 0 && (
          <div className="px-3 py-3 text-xs text-gray-400">
            {query.trim()
              ? `No coordinate systems match “${query.trim()}”. Try an EPSG code or country name.`
              : 'Search by EPSG code, country/region, or projection name. Auto-suggestions appear when a project boundary or GPS fix is available.'}
          </div>
        )}
        {rows.map(definition => {
          const suggestion = 'reason' in definition ? definition.reason : null;
          return (
            <button
              key={definition.code}
              type="button"
              onClick={() => handleRow(definition)}
              className="w-full text-left px-3 py-2 hover:bg-teal-600/15 focus:bg-teal-600/20 focus:outline-none transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-200 truncate light-theme:text-gray-900">
                    {definition.name}
                  </div>
                  <div className="text-[11px] text-gray-500 truncate">
                    {suggestion || shortArea(definition.area) || definition.unit || '—'}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[10px] font-mono text-teal-300">EPSG:{definition.code}</div>
                  <div className="text-[9px] uppercase tracking-wide text-gray-500">
                    {definition.kind === 'geographic' ? 'Geographic' : definition.kind === 'projected' ? 'Projected' : 'CRS'}
                  </div>
                </div>
              </div>
              {(definition.epoch != null || definition.gridShift) && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {definition.epoch != null && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
                      {definition.dynamic ? 'Dynamic datum' : 'Reference epoch'} {definition.epoch.toFixed(1)}
                    </span>
                  )}
                  {definition.gridShift && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      NTv2 grid supported
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {pending && (
        <div className="mt-3 rounded-md border border-teal-700/60 bg-teal-900/15 p-3 space-y-2">
          <div className="text-sm font-semibold text-gray-200 light-theme:text-gray-900">
            EPSG:{pending.code} — {pending.name}
          </div>

          {pending.epoch != null && (
            <label className="block text-[11px] text-gray-400 light-theme:text-gray-600">
              Coordinate epoch (decimal year)
              <input
                type="number"
                step="0.1"
                min="1900"
                max="2200"
                value={epochInput}
                onChange={e => setEpochInput(e.target.value)}
                className="mt-1 w-32 bg-gray-900/70 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500 light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900"
              />
            </label>
          )}

          {pending.gridShift && (
            <div className="space-y-1">
              <p className="text-[11px] text-amber-300/90">
                Requires NTv2 grid <span className="font-mono">{pending.gridShift}</span> for cm-level accuracy.
                Load the .gsb file to apply the shift client-side; otherwise a Helmert approximation is used.
              </p>
              <input
                type="file"
                accept=".gsb,.GSB,.dat,.DAT"
                onChange={e => { void handleGridFile(e.target.files?.[0]); e.currentTarget.value = ''; }}
                aria-label="Load NTv2 grid file"
                className="block w-full text-[11px] text-gray-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[11px] file:bg-gray-700 file:text-gray-200 hover:file:bg-gray-600"
              />
              {gridMessage && <p className="text-[11px] text-gray-400">{gridMessage}</p>}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleApplyPending}
              disabled={busy}
              className="px-3 py-1.5 text-xs font-semibold rounded bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50"
            >
              {busy ? 'Applying…' : `Use EPSG:${pending.code}`}
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="px-3 py-1.5 text-xs font-semibold rounded bg-gray-600 hover:bg-gray-500 text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}
      {status && <p className="mt-2 text-[11px] text-emerald-400">{status}</p>}

      <p className="mt-2 text-[9px] text-gray-600 light-theme:text-gray-400">
        Source: EPSG Geodetic Parameter Dataset,{' '}
        <a
          href="https://epsg.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-gray-400"
        >
          epsg.org
        </a>{' '}
        (IOGP).
      </p>
    </div>
  );
};

export default GlobalCrsPicker;
