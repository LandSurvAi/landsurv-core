import React, { useMemo, useState } from 'react';
import { ContourIcon } from './icons.tsx';
import { type ContourSettings, type SurveyPoint, type InclusionBoundary, type TinSurface } from '../types.ts';
import { classifyContourNonGroundPoint } from '../utils/contouring.ts';
import {
  ChipCard,
  CHIP_INPUT_CLASS,
  CHIP_FIELD_LABEL_CLASS,
  chipButtonClass,
  CHIP_WIDE_ACTION_CLASS,
} from './common/SectionChip.tsx';

interface ContourGenerationPanelProps {
  settings: ContourSettings;
  onSettingsChange: (settings: ContourSettings) => void;
  onGenerate: () => void;
  onImportTin?: () => void;
  onExportTin?: () => void;
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
  /** Number of contour labels currently rendered on the canvas. */
  labelCount?: number;
  /** Active strike-line mode. */
  labelTool?: 'place' | 'erase' | null;
  onSetLabelTool?: (tool: 'place' | 'erase' | null) => void;
  onClearContourLabels?: () => void;
  onAutoLabelContours?: () => void;
}

/**
 * Floating-dialog version of the Contour Generation tool.
 *
 * Every step is a deed-style chip card: a saturated left rail, hairline
 * surface, and black-hole button chrome. The same controls are also exposed as
 * independently addressable A2UI chips (A2UIContourChips.tsx), so an agent can
 * lift any step out of this workflow and into chat.
 */
export const ContourGenerationPanel: React.FC<ContourGenerationPanelProps> = ({
  settings,
  onSettingsChange,
  onGenerate,
  onImportTin,
  onExportTin,
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
  labelCount = 0,
  labelTool = null,
  onSetLabelTool,
  onClearContourLabels,
  onAutoLabelContours,
}) => {
  const ignored = useMemo(() => new Set(settings.ignoredPointNumbers ?? []), [settings.ignoredPointNumbers]);
  const isTinSource = settings.sourceType === 'tin';
  const inclusionMode = settings.inclusionMode ?? 'inside';
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

  const cleanupCounts = useMemo(() => {
    let invert = 0;
    let ffe = 0;
    let structure = 0;
    const flagged = new Set<string>();
    for (const point of points) {
      const categories = classifyContourNonGroundPoint(point);
      if (categories.length === 0) continue;
      flagged.add(point.pointNumber);
      if (categories.includes('invert')) invert++;
      if (categories.includes('ffe')) ffe++;
      if (categories.includes('structure')) structure++;
    }
    return { invert, ffe, structure, total: flagged.size };
  }, [points]);

  const applyPreset = (contourInterval: number, majorInterval: number) => {
    onSettingsChange({ ...settings, contourInterval, majorInterval });
  };

  return (
    <div className="flex w-full flex-col gap-2.5 pr-1 text-[12px] text-slate-300">
      <ChipCard color="summary" title="Contour Source">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onSettingsChange({ ...settings, sourceType: 'points', sourceTinId: null })}
            aria-pressed={!isTinSource}
            className={chipButtonClass('cyan', !isTinSource)}
          >
            Survey Points
          </button>
          <button
            type="button"
            onClick={() => onSettingsChange({ ...settings, sourceType: 'tin', sourceTinId: settings.sourceTinId ?? tinSurfaces[0]?.id ?? null })}
            disabled={tinSurfaces.length === 0}
            aria-pressed={isTinSource}
            className={chipButtonClass('cyan', isTinSource)}
          >
            Loaded TIN
          </button>
        </div>
        {isTinSource && (
          <div className="space-y-1.5">
            <label htmlFor="sourceTinId" className="block text-[9px] font-bold uppercase tracking-[0.12em] text-white/45">
              TIN Surface
            </label>
            <select
              id="sourceTinId"
              value={settings.sourceTinId ?? ''}
              onChange={e => onSettingsChange({ ...settings, sourceType: 'tin', sourceTinId: e.target.value || null })}
              className={CHIP_INPUT_CLASS}
            >
              {tinSurfaces.length === 0 ? (
                <option value="">No TIN surfaces loaded</option>
              ) : (
                tinSurfaces.map(tin => (
                  <option key={tin.id} value={tin.id}>{tin.name}</option>
                ))
              )}
            </select>
            <p className="text-[9.5px] leading-snug text-slate-500">
              {selectedTin
                ? `${selectedTin.vertices.length} vertices, ${selectedTin.triangles.length} triangles`
                : 'Import a .TIN or LandXML surface to enable TIN contour extraction.'}
            </p>
          </div>
        )}
      </ChipCard>

      <ChipCard color="table" title="Contour Intervals">
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { label: "0.5' / 2.5'", minor: 0.5, major: 2.5 },
            { label: "1' / 5'", minor: 1, major: 5 },
            { label: "2' / 10'", minor: 2, major: 10 },
          ].map(preset => {
            const active = settings.contourInterval === preset.minor && settings.majorInterval === preset.major;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset.minor, preset.major)}
                aria-pressed={active}
                className={chipButtonClass('blue', active)}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="contourInterval" className="mb-1 block text-[9px] font-bold uppercase tracking-[0.12em] text-white/45">
              Interval (ft)
            </label>
            <input
              type="number" id="contourInterval" name="contourInterval"
              value={settings.contourInterval} onChange={handleInputChange}
              min="0.1" step="0.1"
              className={CHIP_INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="majorInterval" className="mb-1 block text-[9px] font-bold uppercase tracking-[0.12em] text-white/45">
              Major (ft)
            </label>
            <input
              type="number" id="majorInterval" name="majorInterval"
              value={settings.majorInterval} onChange={handleInputChange}
              min="1" step="1"
              className={CHIP_INPUT_CLASS}
            />
          </div>
        </div>
        <div>
          <label htmlFor="smoothing" className="mb-1 block text-[9px] font-bold uppercase tracking-[0.12em] text-white/45">
            Curve subdivision: {settings.smoothing}
          </label>
          <input
            type="range" id="smoothing" name="smoothing" min="0" max="4" step="1"
            value={settings.smoothing} onChange={handleInputChange}
            className="w-full accent-cyan-400"
          />
          <div className="flex justify-between px-1 text-[9px] text-slate-500"><span>Sharp</span><span>Smooth</span></div>
        </div>
        <div>
          <label htmlFor="pointFilterDescription" className="mb-1 block text-[9px] font-bold uppercase tracking-[0.12em] text-white/45">
            Point description filter
          </label>
          <input
            type="text" id="pointFilterDescription" name="pointFilterDescription"
            value={settings.pointFilterDescription} onChange={handleInputChange}
            placeholder="e.g., GROUND, TOPO"
            disabled={isTinSource}
            className={CHIP_INPUT_CLASS}
          />
          {isTinSource && (
            <p className="mt-1 text-[9.5px] text-slate-500">Point filters apply only to survey-point contour generation.</p>
          )}
        </div>
        <p className="rounded-md border border-amber-400/20 bg-amber-400/[0.05] px-2 py-1.5 text-[9.5px] leading-snug text-amber-200/80">
          Presets only stage the intervals. Nothing is generated until you press Generate Contours.
        </p>
      </ChipCard>

      <ChipCard
        color="closureOk"
        title="Surface Cleanup"
        aside={<span className="font-mono text-[9.5px] text-slate-400">{cleanupCounts.total} flagged</span>}
      >
        <p className="text-[9.5px] leading-snug text-slate-500">
          Non-ground shots are removed before triangulation so they do not spike the TIN or create tight contour rings.
        </p>
        <CleanupToggle
          name="excludeInvertPoints"
          checked={settings.excludeInvertPoints !== false}
          disabled={isTinSource}
          onChange={handleInputChange}
          label="Invert shots"
          hint="INV / SAN.INV / STORM INV"
          count={cleanupCounts.invert}
        />
        <CleanupToggle
          name="excludeFfePoints"
          checked={settings.excludeFfePoints !== false}
          disabled={isTinSource}
          onChange={handleInputChange}
          label="Finished-floor shots"
          hint="FFE / FIRST FLOOR / FINISHED FLOOR"
          count={cleanupCounts.ffe}
        />
        <CleanupToggle
          name="excludeStructureShots"
          checked={settings.excludeStructureShots !== false}
          disabled={isTinSource}
          onChange={handleInputChange}
          label="Structure / top-of shots"
          hint="RIM / MH / CB / TOP OF WALL / FL"
          count={cleanupCounts.structure}
        />
        {isTinSource && (
          <p className="text-[9.5px] italic text-slate-500">Cleanup applies when triangulating survey points; loaded TIN geometry is used as-is.</p>
        )}
      </ChipCard>

      <ChipCard
        color="labels"
        title="Contour Labels"
        aside={<span className="text-[9.5px] text-slate-500">{labelCount} on canvas</span>}
      >
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-white/[0.07] bg-white/[0.02] px-2 py-1.5">
          <input type="checkbox" name="showLabels" checked={settings.showLabels} onChange={handleInputChange} className="h-3.5 w-3.5 rounded accent-teal-400"/>
          <span className="text-[11px] font-medium text-slate-200">Show contour labels</span>
        </label>
        <div>
          <label htmlFor="labelDensity" className="mb-1 block text-[9px] font-bold uppercase tracking-[0.12em] text-white/45">
            Density: {settings.labelDensity?.toFixed(2) || '0.50'}
          </label>
          <input
            type="range" id="labelDensity" name="labelDensity" min="0.1" max="2" step="0.1"
            value={settings.labelDensity || 0.5} onChange={handleInputChange}
            className="w-full accent-teal-400" disabled={!settings.showLabels}
          />
        </div>
        <div>
          <label htmlFor="labelScale" className="mb-1 block text-[9px] font-bold uppercase tracking-[0.12em] text-white/45">
            Scale: {settings.labelScale?.toFixed(1) || '1.0'}x
          </label>
          <input
            type="range" id="labelScale" name="labelScale" min="0.5" max="3" step="0.1"
            value={settings.labelScale || 1} onChange={handleInputChange}
            className="w-full accent-teal-400" disabled={!settings.showLabels}
          />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onSetLabelTool?.(labelTool === 'place' ? null : 'place')}
            aria-pressed={labelTool === 'place'}
            className={chipButtonClass('emerald', labelTool === 'place')}
          >
            {labelTool === 'place' ? 'Stop Placing' : 'Place by Strike'}
          </button>
          <button
            type="button"
            onClick={() => onSetLabelTool?.(labelTool === 'erase' ? null : 'erase')}
            aria-pressed={labelTool === 'erase'}
            className={chipButtonClass('rose', labelTool === 'erase')}
          >
            {labelTool === 'erase' ? 'Stop Erasing' : 'Erase by Strike'}
          </button>
          <button type="button" onClick={onAutoLabelContours} className={chipButtonClass('neutral')}>
            Re-label
          </button>
          <button
            type="button"
            onClick={onClearContourLabels}
            disabled={labelCount === 0}
            className={chipButtonClass('neutral')}
          >
            Clear Labels
          </button>
        </div>
        <p className="text-[9px] leading-snug text-slate-500">
          Drag a line across contours to place a label at every crossing. Press Esc to finish.
        </p>
      </ChipCard>

      <ChipCard color="fields" title="Active Constraints">
        <Constraint label="Breaklines"     count={breaklineCount}        emptyHint="draw with Breakline tool"  color="yellow" />
        <Constraint label="Inclusion Zone" count={inclusionSegmentCount} emptyHint="draw with Inclusion tool"  color="green" />
        <Constraint label="Exclusion Zone" count={exclusionSegmentCount} emptyHint="draw with Exclusion tool"  color="rose" />
      </ChipCard>

      {(inclusionBoundaries.length > 0 || inclusionSegmentCount > 0) && (
        <ChipCard
          color="area"
          title="Inclusion Boundary"
          aside={onManageInclusionBoundaries ? (
            <button
              type="button"
              onClick={onManageInclusionBoundaries}
              className="text-[9.5px] font-semibold text-pink-300 underline decoration-pink-400/30 underline-offset-2 hover:text-pink-200"
            >
              Manage…
            </button>
          ) : undefined}
        >
          {inclusionBoundaries.length > 0 && (
            <select
              value={activeInclusionBoundaryId ?? ''}
              onChange={e => onSelectInclusionBoundary?.(e.target.value || null)}
              className={CHIP_INPUT_CLASS}
              aria-label="Contour inclusion boundary"
            >
              <option value="">All inclusion lines (no specific boundary)</option>
              {inclusionBoundaries.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
          <div className="space-y-1.5 border-t border-white/[0.07] pt-1.5">
            <div className={CHIP_FIELD_LABEL_CLASS}>Contour Scope</div>
            <div className="grid grid-cols-2 gap-1.5">
              {(['inside', 'outside'] as const).map(scope => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => onSettingsChange({ ...settings, inclusionMode: scope })}
                  aria-pressed={inclusionMode === scope}
                  className={chipButtonClass('rose', inclusionMode === scope)}
                >
                  {scope === 'inside' ? 'Inside boundary' : 'Outside boundary'}
                </button>
              ))}
            </div>
            <p className="text-[9px] leading-snug text-slate-500">
              {inclusionMode === 'outside'
                ? 'Uses points outside the boundary and clips contour paths to the exterior — leaving the inclusion area open for GIS contours or a later blend.'
                : 'Uses points inside the boundary and clips contour paths to the polygon.'}
            </p>
          </div>
        </ChipCard>
      )}

      <ChipCard
        color="custom"
        title="Ignore Points"
        aside={ignored.size > 0 ? (
          <button
            type="button"
            onClick={clearIgnored}
            className="text-[9.5px] font-semibold text-slate-400 underline decoration-white/20 underline-offset-2 hover:text-rose-300"
          >
            Clear ({ignored.size})
          </button>
        ) : undefined}
      >
        <div className="flex items-center gap-1.5">
          <span className="pl-1 text-slate-500">🔍</span>
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder='Search points (e.g. "inv", "ep", "control")…'
            disabled={isTinSource}
            className={CHIP_INPUT_CLASS}
            aria-label="Search contour ignore points"
          />
          {searchTerm && (
            <button type="button" onClick={() => setSearchTerm('')}
              className="px-1.5 text-xs text-slate-500 hover:text-slate-300" title="Clear search">✕</button>
          )}
        </div>

        {isTinSource && (
          <div className="rounded-md border border-dashed border-white/10 px-2 py-2 text-[9.5px] italic text-slate-500">
            Ignored-point controls are only used when building contours from survey points.
          </div>
        )}
        {!isTinSource && searchTerm && (
          <div className="overflow-hidden rounded-md border border-white/[0.08]">
            <div className="flex items-center justify-between border-b border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[9px] uppercase tracking-wide text-slate-500">
              <span>{filteredPoints.length} match{filteredPoints.length !== 1 ? 'es' : ''}</span>
              {filteredPoints.length > 0 && (
                <button type="button"
                  onClick={() => {
                    const next = new Set(ignored);
                    filteredPoints.forEach(p => next.add(p.pointNumber));
                    setIgnored(next);
                  }}
                  className="font-semibold text-fuchsia-300 hover:text-fuchsia-200">
                  Ignore all
                </button>
              )}
            </div>
            <div className="max-h-48 divide-y divide-white/[0.05] overflow-y-auto">
              {filteredPoints.map(p => {
                const isIgnored = ignored.has(p.pointNumber);
                return (
                  <button
                    key={p.pointNumber}
                    type="button"
                    onClick={() => { toggleIgnore(p.pointNumber); setSmartMatchSeed(p.pointNumber); }}
                    className={`flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04] ${isIgnored ? 'bg-fuchsia-400/[0.07]' : ''}`}
                    title={isIgnored ? 'Click to include this point again' : 'Click to ignore this point in surface generation'}
                  >
                    <span className={`flex h-3 w-3 flex-none items-center justify-center rounded border text-[8px] ${
                      isIgnored ? 'border-fuchsia-300 bg-fuchsia-400 text-slate-950' : 'border-slate-600 bg-slate-800'
                    }`}>
                      {isIgnored ? '✓' : ''}
                    </span>
                    <span className="w-12 flex-none truncate font-mono text-[9.5px] text-fuchsia-200/80">{p.pointNumber}</span>
                    <span className="min-w-0 flex-1 truncate text-[10.5px] text-slate-300">
                      {p.description || <span className="italic text-slate-500">(no description)</span>}
                    </span>
                    {typeof p.elevation === 'number' && (
                      <span className="font-mono text-[9px] text-slate-500">Z={p.elevation.toFixed(2)}</span>
                    )}
                  </button>
                );
              })}
              {filteredPoints.length === 0 && (
                <div className="px-2 py-3 text-center text-[10px] text-slate-500">No points match.</div>
              )}
            </div>
          </div>
        )}

        {!isTinSource && ignored.size > 0 && (
          <div className="space-y-1">
            <div className="text-[9px] uppercase tracking-wide text-slate-500">Ignored ({ignored.size})</div>
            <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto">
              {Array.from(ignored).slice(0, 200).map(pn => (
                <button key={pn} type="button" onClick={() => toggleIgnore(pn)}
                  className="rounded border border-fuchsia-400/25 bg-fuchsia-400/[0.08] px-1.5 py-0.5 font-mono text-[9.5px] text-fuchsia-200 transition-colors hover:border-rose-400/40 hover:bg-rose-400/10 hover:text-rose-200"
                  title="Click to un-ignore">
                  {pn} ✕
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5 border-t border-white/[0.07] pt-1.5">
          <button
            type="button"
            onClick={handleSmartMatch}
            disabled={isTinSource || (ignored.size === 0 && !smartMatchSeed)}
            className={`${chipButtonClass('violet')} w-full`}
            title="Pick a seed point and let AI fuzzy-match other points with similar descriptions."
          >
            ✨ AI Smart Match
          </button>
          <p className="text-[9px] leading-snug text-slate-500">
            Select one or more points above; Smart Match adds others whose descriptions share ≥50% of the seed's word tokens
            {seedDescription ? <> — seed: <span className="text-amber-300/80">{seedDescription}</span></> : null}.
          </p>
        </div>
      </ChipCard>

      <ChipCard color="brand" title="Contour Actions">
        <div className="rounded-md border border-amber-400/25 bg-amber-400/[0.06] px-2.5 py-2 text-[10px] leading-relaxed text-amber-100/90">
          <div className="font-semibold uppercase tracking-wide">Staged settings</div>
          <div className="mt-0.5 text-[11px]">
            {settings.contourInterval}' minor · {settings.majorInterval}' major · smoothing {settings.smoothing}
          </div>
        </div>
        <button
          onClick={onImportTin}
          disabled={!onImportTin || isImportingTin}
          className={`${chipButtonClass('indigo')} w-full`}
          title="Import a .tin, .xml, or .landxml surface and load its vertices into project points"
        >
          {isImportingTin ? 'Importing TIN…' : 'Import .TIN / LandXML'}
        </button>
        {isImportingTin && (
          <div className="rounded-md border border-cyan-400/20 bg-cyan-400/[0.06] p-2.5">
            <div className="mb-1 flex items-center justify-between text-[9.5px] uppercase tracking-wide text-cyan-300/80">
              <span>{tinImportStatus ?? 'Importing TIN...'}</span>
              <span>{Math.round(tinImportProgress)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-black/40">
              <div
                className="h-full rounded-full bg-cyan-400 transition-all duration-200"
                style={{ width: `${Math.max(2, Math.min(100, tinImportProgress))}%` }}
              />
            </div>
          </div>
        )}
        <button
          onClick={onCreateTinFromContours}
          disabled={!canCreateTinFromContours}
          className={`${chipButtonClass('neutral')} w-full`}
          title="Create a TIN surface from the latest contour generation and save it to File Manager"
        >
          Create TIN from Contours
        </button>
        <button
          onClick={onExportTin}
          disabled={!onExportTin || tinSurfaces.length === 0}
          className={`${chipButtonClass('neutral')} w-full`}
          title="Export the most recent TIN surface as LandXML"
        >
          Export TIN (LandXML)
        </button>
        <button
          onClick={onGenerate}
          disabled={isGenerating}
          className={`${CHIP_WIDE_ACTION_CLASS} mt-1`}
        >
          <ContourIcon className="h-4 w-4"/>
          {isGenerating ? 'Generating…' : 'Generate Contours'}
        </button>
        {!isTinSource && ignored.size > 0 && (
          <p className="text-center text-[9.5px] text-amber-300/80">
            {ignored.size} point{ignored.size !== 1 ? 's' : ''} will be excluded from the TIN
          </p>
        )}
        <p className="text-center text-[9px] leading-snug text-slate-500">
          Settings are reviewed here first. Adjust intervals, cleanup, labels, and constraints, then generate.
        </p>
      </ChipCard>
    </div>
  );
};

interface CleanupToggleProps {
  name: string;
  checked: boolean;
  disabled: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  label: string;
  hint: string;
  count: number;
}
const CleanupToggle: React.FC<CleanupToggleProps> = ({ name, checked, disabled, onChange, label, hint, count }) => (
  <label className={`flex items-center gap-2 rounded-md border border-white/[0.07] bg-white/[0.02] px-2 py-1.5 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
    <input
      type="checkbox"
      name={name}
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      className="h-3.5 w-3.5 rounded accent-lime-400"
    />
    <span className="min-w-0 flex-1">
      <span className="block text-[11px] font-medium text-slate-200">{label}</span>
      <span className="block truncate text-[9px] text-slate-500">{hint}</span>
    </span>
    <span className={`rounded px-1.5 py-0.5 font-mono text-[9.5px] ${count > 0 ? 'bg-lime-400/10 text-lime-300' : 'bg-white/[0.04] text-slate-600'}`}>
      {count}
    </span>
  </label>
);

interface ConstraintProps { label: string; count: number; emptyHint: string; color: 'yellow' | 'green' | 'rose'; }
const Constraint: React.FC<ConstraintProps> = ({ label, count, emptyHint, color }) => {
  const dotOn  = color === 'yellow' ? 'bg-amber-400' : color === 'green' ? 'bg-emerald-400' : 'bg-rose-400';
  const textOn = color === 'yellow' ? 'text-amber-300' : color === 'green' ? 'text-emerald-300' : 'text-rose-300';
  const badge  = color === 'yellow' ? 'text-amber-300 bg-amber-400/10' : color === 'green' ? 'text-emerald-300 bg-emerald-400/10' : 'text-rose-300 bg-rose-400/10';
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${count > 0 ? dotOn : 'bg-slate-600'}`} />
      <span className={`flex-1 text-[11px] ${count > 0 ? textOn : 'text-slate-500'}`}>{label}</span>
      {count > 0
        ? <span className={`rounded px-1.5 py-0.5 font-mono text-[9.5px] ${badge}`}>{count} seg{count !== 1 ? 's' : ''}</span>
        : <span className="text-[9.5px] text-slate-600">none — {emptyHint}</span>
      }
    </div>
  );
};

export default ContourGenerationPanel;
