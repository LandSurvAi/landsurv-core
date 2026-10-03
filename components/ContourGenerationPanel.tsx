import React, { useMemo, useState } from 'react';
import { ContourIcon } from './icons.tsx';
import { type ContourSettings, type SurveyPoint, type InclusionBoundary, type TinSurface } from '../types.ts';

interface ContourGenerationPanelProps {
  settings: ContourSettings;
  onSettingsChange: (settings: ContourSettings) => void;
  onGenerate: () => void;
  onImportTin?: () => void;
  onCreateTinFromContours?: () => void;
  canCreateTinFromContours?: boolean;
  isGenerating: boolean;
  isImportingTin?: boolean;
  tinImportProgress?: number;
  tinImportStatus?: string | null;
  /** All survey points currently in the project (filtered by ignore-list before triangulation). */
  points: SurveyPoint[];
  /** Whether at least one inclusion boundary line exists on the canvas */
  inclusionSegmentCount?: number;
  /** Number of breakline segments drawn */
  breaklineCount?: number;
  /** Number of exclusion zone segments drawn */
  exclusionSegmentCount?: number;
  /** All known inclusion boundaries — when supplied, a selector is shown. */
  inclusionBoundaries?: InclusionBoundary[];
  /** Active inclusion boundary id (null = use all). */
  activeInclusionBoundaryId?: string | null;
  /** Change the active boundary. */
  onSelectInclusionBoundary?: (id: string | null) => void;
  /** Open the Inclusion Boundaries manager panel. */
  onManageInclusionBoundaries?: () => void;
  /** Loaded TIN surfaces available for direct contour extraction. */
  tinSurfaces?: TinSurface[];
}

/**
 * Floating-dialog version of the Contour Generation tool (v26.05.17.33).
 *
 * Holds the contour-generation settings, the Active Constraints summary, the
 * new "Ignore Points" search + smart-match section, and the Generate button.
 * The ESRI REST tooling has been moved to a separate floating panel.
 */
export const ContourGenerationPanel: React.FC<ContourGenerationPanelProps> = ({
  settings,
  onSettingsChange,
  onGenerate,
  onImportTin,
  onCreateTinFromContours,
  canCreateTinFromContours = false,
  isGenerating,
  isImportingTin = false,
  tinImportProgress = 0,
  tinImportStatus = null,
  points,
  inclusionSegmentCount = 0,
  breaklineCount = 0,
  exclusionSegmentCount = 0,
  inclusionBoundaries = [],
  activeInclusionBoundaryId = null,
  onSelectInclusionBoundary,
  onManageInclusionBoundaries,
  tinSurfaces = [],
}) => {
  const ignored = useMemo(() => new Set(settings.ignoredPointNumbers ?? []), [settings.ignoredPointNumbers]);
  const isTinSource = settings.sourceType === 'tin';
  const [searchTerm, setSearchTerm] = useState('');
  const [smartMatchSeed, setSmartMatchSeed] = useState<string | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    onSettingsChange({
      ...settings,
      [name]: type === 'checkbox' ? checked : (type === 'number' || type === 'range' ? parseFloat(value) : value),
    });
  };

  const setIgnored = (next: Set<string>) => {
    onSettingsChange({ ...settings, ignoredPointNumbers: Array.from(next) });
  };
  const toggleIgnore = (pn: string) => {
    const next = new Set(ignored);
    if (next.has(pn)) next.delete(pn); else next.add(pn);
    setIgnored(next);
  };
  const clearIgnored = () => setIgnored(new Set());

  // Filter point list by the canvas-bar–style search term (matches pn OR description).
  const filteredPoints = useMemo(() => {
    const q = searchTerm.trim().toUpperCase();
    if (!q) return [] as SurveyPoint[];
    return points
      .filter(p =>
        (p.pointNumber || '').toUpperCase().includes(q) ||
        (p.description || '').toUpperCase().includes(q)
      )
      .slice(0, 250);
  }, [points, searchTerm]);

  // Tokenize a description for fuzzy matching: alnum tokens, lower-cased, no stop words.
  const tokenize = (s: string | undefined): Set<string> => {
    if (!s) return new Set();
    const tokens = s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    return new Set(tokens.filter(t => t.length >= 2));
  };
  const jaccard = (a: Set<string>, b: Set<string>) => {
    if (a.size === 0 && b.size === 0) return 0;
    let inter = 0;
    a.forEach(t => { if (b.has(t)) inter++; });
    const union = a.size + b.size - inter;
    return union > 0 ? inter / union : 0;
  };

  /** "AI Smart Match": pick the most-recently-toggled ignored point as the seed and fuzzy-match similar descriptions. */
  const handleSmartMatch = () => {
    const seedPn = smartMatchSeed ?? Array.from(ignored).slice(-1)[0];
    if (!seedPn) return;
    const seed = points.find(p => p.pointNumber === seedPn);
    if (!seed) return;
    const seedTokens = tokenize(seed.description);
    if (seedTokens.size === 0) return;
    const next = new Set(ignored);
    let added = 0;
    points.forEach(p => {
      if (p.pointNumber === seedPn || next.has(p.pointNumber)) return;
      const score = jaccard(seedTokens, tokenize(p.description));
      if (score >= 0.5) { next.add(p.pointNumber); added++; }
    });
    if (added > 0) setIgnored(next);
  };

  const seedDescription = (smartMatchSeed && points.find(p => p.pointNumber === smartMatchSeed)?.description) ?? null;
  const selectedTin = useMemo(
    () => tinSurfaces.find(t => t.id === settings.sourceTinId) ?? null,
    [tinSurfaces, settings.sourceTinId]
  );

  return (
    <div className="w-full text-sm text-gray-300 flex flex-col">
      <div className="space-y-4 pr-1">
        <div className="rounded border border-cyan-700/30 bg-gray-700/20 p-2.5 space-y-2">
          <div className="text-[10px] uppercase font-semibold tracking-wide text-cyan-300/80">Contour Source</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onSettingsChange({ ...settings, sourceType: 'points', sourceTinId: null })}
              className={`rounded border px-2 py-2 text-xs font-medium transition-colors ${!isTinSource ? 'border-amber-500/60 bg-amber-500/15 text-amber-200' : 'border-gray-600 bg-gray-700/40 text-gray-300 hover:border-gray-500'}`}
            >
              Survey Points
            </button>
            <button
              type="button"
              onClick={() => onSettingsChange({ ...settings, sourceType: 'tin', sourceTinId: settings.sourceTinId ?? tinSurfaces[0]?.id ?? null })}
              disabled={tinSurfaces.length === 0}
              className={`rounded border px-2 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${isTinSource ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200' : 'border-gray-600 bg-gray-700/40 text-gray-300 hover:border-gray-500'}`}
            >
              Loaded TIN
            </button>
          </div>
          {isTinSource && (
            <div className="space-y-1.5">
              <label htmlFor="sourceTinId" className="block text-xs font-medium text-gray-400">TIN Surface</label>
              <select
                id="sourceTinId"
                value={settings.sourceTinId ?? ''}
                onChange={e => onSettingsChange({ ...settings, sourceType: 'tin', sourceTinId: e.target.value || null })}
                className="w-full p-2 text-sm bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                {tinSurfaces.length === 0 ? (
                  <option value="">No TIN surfaces loaded</option>
                ) : (
                  tinSurfaces.map(tin => (
                    <option key={tin.id} value={tin.id}>{tin.name}</option>
                  ))
                )}
              </select>
              <p className="text-[10px] text-gray-500">
                {selectedTin
                  ? `${selectedTin.vertices.length} vertices, ${selectedTin.triangles.length} triangles`
                  : 'Import a .TIN or LandXML surface to enable TIN contour extraction.'}
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="contourInterval" className="block text-xs font-medium text-gray-400 mb-1">Contour Interval (ft)</label>
            <input
              type="number" id="contourInterval" name="contourInterval"
              value={settings.contourInterval} onChange={handleInputChange}
              min="0.1" step="0.1"
              className="w-full p-2 text-sm bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <div>
            <label htmlFor="majorInterval" className="block text-xs font-medium text-gray-400 mb-1">Major Interval (ft)</label>
            <input
              type="number" id="majorInterval" name="majorInterval"
              value={settings.majorInterval} onChange={handleInputChange}
              min="1" step="1"
              className="w-full p-2 text-sm bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        <div>
          <label htmlFor="pointFilterDescription" className="block text-xs font-medium text-gray-400 mb-1">Point Description Filter (Optional)</label>
          <input
            type="text" id="pointFilterDescription" name="pointFilterDescription"
            value={settings.pointFilterDescription} onChange={handleInputChange}
            placeholder="e.g., GROUND, TOPO"
            disabled={isTinSource}
            className="w-full p-2 text-sm bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          {isTinSource && (
            <p className="mt-1 text-[10px] text-gray-500">Point filters apply only to survey-point contour generation.</p>
          )}
        </div>

        <div>
          <label htmlFor="smoothing" className="block text-xs font-medium text-gray-400 mb-1">Curve Subdivision Level: {settings.smoothing}</label>
          <input
            type="range" id="smoothing" name="smoothing" min="0" max="4" step="1"
            value={settings.smoothing} onChange={handleInputChange}
            className="w-full accent-amber-500"
          />
          <div className="flex justify-between text-xs text-gray-500 px-1"><span>Sharp</span><span>Smooth</span></div>
        </div>

        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" name="showLabels" checked={settings.showLabels} onChange={handleInputChange} className="w-4 h-4 rounded accent-amber-500"/>
            <span className="text-xs font-medium text-gray-400">Show Contour Labels</span>
          </label>
        </div>

        <div>
          <label htmlFor="labelDensity" className="block text-xs font-medium text-gray-400 mb-1">Label Density: {settings.labelDensity?.toFixed(2) || '0.50'}</label>
          <input
            type="range" id="labelDensity" name="labelDensity" min="0.1" max="2" step="0.1"
            value={settings.labelDensity || 0.5} onChange={handleInputChange}
            className="w-full accent-amber-500" disabled={!settings.showLabels}
          />
        </div>
        <div>
          <label htmlFor="labelScale" className="block text-xs font-medium text-gray-400 mb-1">Label Scale: {settings.labelScale?.toFixed(1) || '1.0'}x</label>
          <input
            type="range" id="labelScale" name="labelScale" min="0.5" max="3" step="0.1"
            value={settings.labelScale || 1} onChange={handleInputChange}
            className="w-full accent-amber-500" disabled={!settings.showLabels}
          />
          <div className="flex justify-between text-xs text-gray-500 px-1"><span>Small</span><span>Large</span></div>
        </div>

        {/* ── Active Constraints summary ─────────────────────── */}
        <div className="rounded border border-gray-700/60 bg-gray-700/20 p-2.5 space-y-1.5">
          <div className="text-[10px] uppercase font-semibold tracking-wide text-gray-400 mb-1">Active Constraints</div>
          <Constraint label="Breaklines"     count={breaklineCount}        emptyHint="draw with Breakline tool"  color="yellow" />
          <Constraint label="Inclusion Zone" count={inclusionSegmentCount} emptyHint="draw with Inclusion tool"  color="green" />
          <Constraint label="Exclusion Zone" count={exclusionSegmentCount} emptyHint="draw with Exclusion tool"  color="rose" />
        </div>

        {/* ── Inclusion Boundary selector ────────────────────── */}
        {inclusionBoundaries.length > 0 && (
          <div className="rounded border border-emerald-700/30 bg-gray-700/20 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase font-semibold tracking-wide text-emerald-300/80">Inclusion Boundary</div>
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
              className="w-full p-1.5 text-xs bg-gray-700 border border-gray-600 rounded"
            >
              <option value="">All inclusion lines (no specific boundary)</option>
              {inclusionBoundaries.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* ── Ignore Points section ──────────────────────────── */}
        <div className={`rounded border bg-gray-700/20 p-2.5 space-y-2 ${isTinSource ? 'border-gray-700/40 opacity-60' : 'border-amber-700/30'}`}>
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase font-semibold tracking-wide text-amber-300/80">Ignore Points</div>
            {ignored.size > 0 && (
              <button type="button" onClick={clearIgnored}
                className="text-[10px] text-gray-400 hover:text-rose-300 underline">
                Clear ({ignored.size})
              </button>
            )}
          </div>

          {/* Canvas-bar-style search */}
          <div className="flex items-center gap-1">
            <span className="text-gray-500 pl-1">🔍</span>
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder='Search points (e.g. "inv", "ep", "control")…'
              disabled={isTinSource}
              className="flex-1 p-1.5 text-xs bg-gray-700 border border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-amber-500 text-gray-200 placeholder-gray-500"
            />
            {searchTerm && (
              <button type="button" onClick={() => setSearchTerm('')}
                className="px-1.5 text-xs text-gray-500 hover:text-gray-300" title="Clear search">✕</button>
            )}
          </div>

          {/* Result list */}
          {isTinSource && (
            <div className="px-2 py-2 text-[10px] text-gray-500 italic rounded border border-gray-700/40 bg-gray-800/40">
              Ignored-point controls are only used when building contours from survey points.
            </div>
          )}
          {!isTinSource && searchTerm && (
            <div className="rounded border border-gray-700/60 bg-gray-800/50 overflow-hidden">
              <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-amber-400/70 font-semibold border-b border-gray-700/60 flex items-center justify-between">
                <span>{filteredPoints.length} match{filteredPoints.length !== 1 ? 'es' : ''}</span>
                {filteredPoints.length > 0 && (
                  <button type="button"
                    onClick={() => {
                      const next = new Set(ignored);
                      filteredPoints.forEach(p => next.add(p.pointNumber));
                      setIgnored(next);
                    }}
                    className="text-[10px] text-amber-300 hover:text-amber-200">
                    Ignore all
                  </button>
                )}
              </div>
              <div className="max-h-48 overflow-y-auto divide-y divide-gray-700/40">
                {filteredPoints.map(p => {
                  const isIgnored = ignored.has(p.pointNumber);
                  return (
                    <button
                      key={p.pointNumber}
                      type="button"
                      onClick={() => { toggleIgnore(p.pointNumber); setSmartMatchSeed(p.pointNumber); }}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-gray-700/40 transition-colors ${isIgnored ? 'bg-amber-900/20' : ''}`}
                      title={isIgnored ? 'Click to include this point again' : 'Click to ignore this point in surface generation'}
                    >
                      <span className={`w-3 h-3 flex-shrink-0 rounded border ${isIgnored ? 'bg-amber-500 border-amber-300' : 'bg-gray-700 border-gray-500'}`}>
                        {isIgnored && <span className="block text-[9px] leading-3 text-center text-gray-900">✓</span>}
                      </span>
                      <span className="w-12 font-mono text-[10px] text-amber-200/80 truncate">{p.pointNumber}</span>
                      <span className="flex-1 text-xs text-gray-300 truncate">{p.description || <span className="italic text-gray-500">(no description)</span>}</span>
                      {typeof p.elevation === 'number' && (
                        <span className="text-[10px] text-gray-500 font-mono">Z={p.elevation.toFixed(2)}</span>
                      )}
                    </button>
                  );
                })}
                {filteredPoints.length === 0 && (
                  <div className="px-2 py-2 text-[10px] text-gray-500 italic">No points match.</div>
                )}
              </div>
            </div>
          )}

          {/* Currently ignored */}
          {!isTinSource && ignored.size > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] text-gray-500">Ignored ({ignored.size}):</div>
              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                {Array.from(ignored).slice(0, 200).map(pn => (
                  <button key={pn} type="button" onClick={() => toggleIgnore(pn)}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-900/40 border border-amber-700/40 text-amber-200 hover:bg-rose-900/40 hover:border-rose-700/40 hover:text-rose-200"
                    title="Click to un-ignore">
                    {pn} ✕
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Smart Match */}
          <div className="pt-1 border-t border-gray-700/40 space-y-1.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSmartMatch}
                disabled={isTinSource || (ignored.size === 0 && !smartMatchSeed)}
                className="flex-1 text-[10px] py-1 px-2 rounded border bg-fuchsia-700/40 hover:bg-fuchsia-600/50 border-fuchsia-500/50 text-fuchsia-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Pick a seed point and let AI fuzzy-match other points with similar descriptions."
              >
                ✨ AI Smart Match
              </button>
            </div>
            <p className="text-[9px] text-gray-500 leading-snug">
              Select one or more points above; Smart Match adds others whose descriptions share ≥50% of the seed's word tokens
              {seedDescription ? <> &nbsp;— seed: <span className="text-amber-300/80">{seedDescription}</span></> : null}.
            </p>
          </div>
        </div>
      </div>

      {/* Generate button */}
      <div className="mt-4">
        <button
          onClick={onImportTin}
          disabled={!onImportTin || isImportingTin}
          className="w-full mb-2 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 transition-colors text-sm disabled:bg-gray-600 disabled:cursor-not-allowed"
          title="Import a .tin, .xml, or .landxml surface and load its vertices into project points"
        >
          {isImportingTin ? 'Importing TIN…' : 'Import .TIN / LandXML'}
        </button>
        {isImportingTin && (
          <div className="mb-3 rounded border border-cyan-700/30 bg-gray-800/70 p-2.5">
            <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-cyan-300/80">
              <span>{tinImportStatus ?? 'Importing TIN...'}</span>
              <span>{Math.round(tinImportProgress)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-700">
              <div
                className="h-full rounded-full bg-cyan-500 transition-all duration-200"
                style={{ width: `${Math.max(2, Math.min(100, tinImportProgress))}%` }}
              />
            </div>
          </div>
        )}
        <button
          onClick={onCreateTinFromContours}
          disabled={!canCreateTinFromContours}
          className="w-full mb-2 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 transition-colors text-sm disabled:bg-gray-600 disabled:cursor-not-allowed"
          title="Create a TIN surface from the latest contour generation and save it to File Manager"
        >
          Create TIN from Contours
        </button>
        <button
          onClick={onGenerate}
          disabled={isGenerating}
          className="w-full py-2 bg-amber-600 text-white font-semibold rounded-md hover:bg-amber-700 transition-colors text-sm disabled:bg-gray-600 flex items-center justify-center gap-2"
        >
          <ContourIcon className="w-5 h-5"/>
          {isGenerating ? 'Generating…' : 'Generate Contours'}
        </button>
        {!isTinSource && ignored.size > 0 && (
          <p className="mt-1 text-[10px] text-amber-400/80 text-center">
            {ignored.size} point{ignored.size !== 1 ? 's' : ''} will be excluded from the TIN
          </p>
        )}
      </div>
    </div>
  );
};

interface ConstraintProps { label: string; count: number; emptyHint: string; color: 'yellow' | 'green' | 'rose'; }
const Constraint: React.FC<ConstraintProps> = ({ label, count, emptyHint, color }) => {
  const dotOn  = color === 'yellow' ? 'bg-yellow-400' : color === 'green' ? 'bg-green-400' : 'bg-rose-400';
  const textOn = color === 'yellow' ? 'text-yellow-300' : color === 'green' ? 'text-green-300' : 'text-rose-300';
  const badge  = color === 'yellow' ? 'text-yellow-400/80 bg-yellow-900/30' : color === 'green' ? 'text-green-400/80 bg-green-900/30' : 'text-rose-400/80 bg-rose-900/30';
  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${count > 0 ? dotOn : 'bg-gray-600'}`} />
      <span className={`text-xs flex-1 ${count > 0 ? textOn : 'text-gray-500'}`}>{label}</span>
      {count > 0
        ? <span className={`text-[10px] font-mono ${badge} px-1.5 py-0.5 rounded`}>{count} seg{count !== 1 ? 's' : ''}</span>
        : <span className="text-[10px] text-gray-600">none — {emptyHint}</span>
      }
    </div>
  );
};

export default ContourGenerationPanel;
