import React, { useContext, useMemo, useState } from 'react';
import {
  Combine,
  Download,
  Eraser,
  Eye,
  EyeOff,
  FileUp,
  Globe2,
  History,
  Layers,
  Mountain,
  Play,
  Plus,
  RefreshCw,
  Ruler,
  Search,
  Shield,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import type {
  A2UIContourChipId,
  ContourBlendStats,
  ContourGeneration,
  ContourSettings,
  SurveyPoint,
} from '../types.ts';
import { CONTOUR_CHIP_META } from '../services/contourChips.ts';
import { USGS_NATIONAL_CONTOUR_SOURCES } from '../utils/usgsNationalContours.ts';
import { classifyContourNonGroundPoint } from '../utils/contouring.ts';
import { A2UIHostContext, type A2UIHostContextValue } from './A2UISurface.tsx';
import { SectionChip } from './common/SectionChip.tsx';

const CHIP_ICONS: Record<
  A2UIContourChipId,
  React.ComponentType<{ className?: string; style?: React.CSSProperties }>
> = {
  'contour-source': Layers,
  'contour-intervals': Ruler,
  'contour-cleanup': Eraser,
  'contour-scope': Shield,
  'contour-labels': Tag,
  'contour-ignore-points': EyeOff,
  'contour-actions': Play,
  'contour-generations': History,
  'contour-generation': Sparkles,
  'contour-blend': Combine,
  'contour-esri': Globe2,
};

const INPUT_CLASS =
  'w-full rounded-md border border-white/10 bg-black/25 px-2 py-1.5 text-[11px] text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-40';
const BUTTON_CLASS =
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[10.5px] font-semibold text-slate-300 transition-colors hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-40';
const ACTIVE_BUTTON_CLASS =
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-cyan-400/45 bg-cyan-400/12 px-2 py-1.5 text-[10.5px] font-semibold text-cyan-100';

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-slate-500">{children}</div>
);

const EmptyState: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-[10.5px] leading-relaxed text-slate-500">
    {children}
  </div>
);

const CheckboxRow: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  count?: number;
}> = ({ checked, onChange, label, hint, count }) => (
  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-white/[0.07] bg-white/[0.02] px-2 py-1.5">
    <input
      type="checkbox"
      checked={checked}
      onChange={event => onChange(event.target.checked)}
      className="h-3.5 w-3.5 rounded accent-emerald-500"
    />
    <span className="min-w-0 flex-1">
      <span className="block text-[11px] font-medium text-slate-200">{label}</span>
      {hint && <span className="block truncate text-[9px] text-slate-500">{hint}</span>}
    </span>
    {typeof count === 'number' && (
      <span
        className={`rounded px-1.5 py-0.5 font-mono text-[9.5px] ${
          count > 0 ? 'bg-emerald-400/10 text-emerald-300' : 'bg-white/[0.04] text-slate-600'
        }`}
      >
        {count}
      </span>
    )}
  </label>
);

const ChipSection: React.FC<{ title: string; children: React.ReactNode; aside?: React.ReactNode }> = ({
  title,
  children,
  aside,
}) => (
  <section className="space-y-1.5">
    <div className="flex items-center justify-between gap-2">
      <FieldLabel>{title}</FieldLabel>
      {aside}
    </div>
    {children}
  </section>
);

interface ChipBodyProps {
  host: A2UIHostContextValue;
  settings: ContourSettings;
}

const SourceChip: React.FC<ChipBodyProps> = ({ host, settings }) => {
  const isTin = settings.sourceType === 'tin';
  const tinSurfaces = host.tinSurfaces ?? [];
  const points = host.contourPoints ?? [];
  const patch = (next: Partial<ContourSettings>) => host.onContourSettingsChange?.({ ...settings, ...next });

  return (
    <>
      <ChipSection title="Data source">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => patch({ sourceType: 'points', sourceTinId: null })}
            className={!isTin ? ACTIVE_BUTTON_CLASS : BUTTON_CLASS}
          >
            Survey Points
          </button>
          <button
            type="button"
            onClick={() =>
              patch({ sourceType: 'tin', sourceTinId: settings.sourceTinId ?? tinSurfaces[0]?.id ?? null })
            }
            disabled={tinSurfaces.length === 0}
            className={isTin ? ACTIVE_BUTTON_CLASS : BUTTON_CLASS}
          >
            Loaded TIN
          </button>
        </div>
      </ChipSection>

      {isTin && (
        <ChipSection title="TIN surface">
          <select
            aria-label="Contour TIN surface"
            value={settings.sourceTinId ?? ''}
            onChange={event => patch({ sourceType: 'tin', sourceTinId: event.target.value || null })}
            className={INPUT_CLASS}
          >
            {tinSurfaces.length === 0 ? (
              <option value="">No TIN surfaces loaded</option>
            ) : (
              tinSurfaces.map(surface => (
                <option key={surface.id} value={surface.id}>
                  {surface.name}
                </option>
              ))
            )}
          </select>
          <p className="text-[9.5px] leading-snug text-slate-500">
            {tinSurfaces.find(surface => surface.id === settings.sourceTinId)
              ? `${tinSurfaces.find(surface => surface.id === settings.sourceTinId)?.vertices.length ?? 0} vertices · ${
                  tinSurfaces.find(surface => surface.id === settings.sourceTinId)?.triangles.length ?? 0
                } triangles`
              : 'Import a .TIN or LandXML surface to extract contours directly.'}
          </p>
        </ChipSection>
      )}

      <ChipSection title="Point description filter">
        <input
          type="text"
          aria-label="Contour point description filter"
          value={settings.pointFilterDescription}
          onChange={event => patch({ pointFilterDescription: event.target.value })}
          placeholder="e.g. GROUND, TOPO"
          disabled={isTin}
          className={INPUT_CLASS}
        />
        <p className="text-[9.5px] leading-snug text-slate-500">
          {isTin
            ? 'Point filters apply only when contours come from survey points.'
            : 'Only points whose description contains this value feed the triangulation.'}
        </p>
      </ChipSection>

      <div className="flex items-center justify-between rounded-md border border-white/[0.07] bg-white/[0.02] px-2 py-1.5 text-[10px] text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <Mountain className="h-3 w-3 text-cyan-300" />
          {points.length.toLocaleString()} survey point{points.length === 1 ? '' : 's'}
        </span>
        <span>{tinSurfaces.length} TIN surface{tinSurfaces.length === 1 ? '' : 's'}</span>
      </div>
    </>
  );
};

const IntervalsChip: React.FC<ChipBodyProps> = ({ host, settings }) => {
  const patch = (next: Partial<ContourSettings>) => host.onContourSettingsChange?.({ ...settings, ...next });
  const presets = [
    { label: "0.5' / 2.5'", minor: 0.5, major: 2.5 },
    { label: "1' / 5'", minor: 1, major: 5 },
    { label: "2' / 10'", minor: 2, major: 10 },
  ];

  return (
    <>
      <ChipSection title="Presets">
        <div className="grid grid-cols-3 gap-1.5">
          {presets.map(preset => {
            const active =
              settings.contourInterval === preset.minor && settings.majorInterval === preset.major;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => patch({ contourInterval: preset.minor, majorInterval: preset.major })}
                className={active ? ACTIVE_BUTTON_CLASS : BUTTON_CLASS}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </ChipSection>

      <div className="grid grid-cols-2 gap-2">
        <ChipSection title="Minor interval (ft)">
          <input
            type="number"
            aria-label="Minor contour interval"
            min={0.1}
            step={0.1}
            value={settings.contourInterval}
            onChange={event => {
              const value = parseFloat(event.target.value);
              if (Number.isFinite(value)) patch({ contourInterval: value });
            }}
            className={INPUT_CLASS}
          />
        </ChipSection>
        <ChipSection title="Major interval (ft)">
          <input
            type="number"
            aria-label="Major contour interval"
            min={1}
            step={1}
            value={settings.majorInterval}
            onChange={event => {
              const value = parseFloat(event.target.value);
              if (Number.isFinite(value)) patch({ majorInterval: value });
            }}
            className={INPUT_CLASS}
          />
        </ChipSection>
      </div>

      <ChipSection title={`Curve subdivision: ${settings.smoothing}`}>
        <input
          type="range"
          aria-label="Contour curve subdivision"
          min={0}
          max={4}
          step={1}
          value={settings.smoothing}
          onChange={event => patch({ smoothing: parseInt(event.target.value, 10) })}
          className="w-full accent-amber-500"
        />
        <div className="flex justify-between text-[9px] text-slate-500">
          <span>Sharp</span>
          <span>Smooth</span>
        </div>
      </ChipSection>

      <p className="rounded-md border border-amber-400/20 bg-amber-400/[0.05] px-2 py-1.5 text-[9.5px] leading-snug text-amber-200/80">
        Presets only stage the intervals. Nothing is generated until you run Contour Actions.
      </p>
    </>
  );
};

const CleanupChip: React.FC<ChipBodyProps> = ({ host, settings }) => {
  const patch = (next: Partial<ContourSettings>) => host.onContourSettingsChange?.({ ...settings, ...next });
  const points = host.contourPoints ?? [];
  const counts = useMemo(() => {
    let invert = 0;
    let ffe = 0;
    let structure = 0;
    const flagged = new Set<string>();
    for (const point of points) {
      const categories = classifyContourNonGroundPoint(point);
      if (categories.length === 0) continue;
      flagged.add(point.pointNumber);
      if (categories.includes('invert')) invert += 1;
      if (categories.includes('ffe')) ffe += 1;
      if (categories.includes('structure')) structure += 1;
    }
    return { invert, ffe, structure, total: flagged.size };
  }, [points]);

  return (
    <>
      <div className="flex items-center justify-between text-[10px] text-slate-400">
        <span>Non-ground shots removed before triangulation</span>
        <span className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono">{counts.total} flagged</span>
      </div>
      <CheckboxRow
        checked={settings.excludeInvertPoints !== false}
        onChange={checked => patch({ excludeInvertPoints: checked })}
        label="Invert shots"
        hint="INV / SAN.INV / STORM INV"
        count={counts.invert}
      />
      <CheckboxRow
        checked={settings.excludeFfePoints !== false}
        onChange={checked => patch({ excludeFfePoints: checked })}
        label="Finished-floor shots"
        hint="FFE / FIRST FLOOR / FINISHED FLOOR"
        count={counts.ffe}
      />
      <CheckboxRow
        checked={settings.excludeStructureShots !== false}
        onChange={checked => patch({ excludeStructureShots: checked })}
        label="Structure / top-of shots"
        hint="RIM / MH / CB / TOP OF WALL / FL"
        count={counts.structure}
      />

      <ChipSection title="Elevation filter">
        <select
          aria-label="Contour elevation filter mode"
          value={settings.elevationFilterMode ?? 'auto'}
          onChange={event =>
            patch({ elevationFilterMode: event.target.value === 'off' ? 'off' : 'auto' })
          }
          className={INPUT_CLASS}
        >
          <option value="auto">Auto — drop missing and blunder elevations</option>
          <option value="off">Off — use every supplied elevation</option>
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            aria-label="Minimum contour source elevation"
            placeholder="Min Z"
            value={settings.minElevation ?? ''}
            onChange={event => {
              const value = parseFloat(event.target.value);
              patch({ minElevation: Number.isFinite(value) ? value : null });
            }}
            className={INPUT_CLASS}
          />
          <input
            type="number"
            aria-label="Maximum contour source elevation"
            placeholder="Max Z"
            value={settings.maxElevation ?? ''}
            onChange={event => {
              const value = parseFloat(event.target.value);
              patch({ maxElevation: Number.isFinite(value) ? value : null });
            }}
            className={INPUT_CLASS}
          />
        </div>
      </ChipSection>
    </>
  );
};

const ScopeChip: React.FC<ChipBodyProps> = ({ host, settings }) => {
  const patch = (next: Partial<ContourSettings>) => host.onContourSettingsChange?.({ ...settings, ...next });
  const boundaries = host.inclusionBoundaries ?? [];
  const inclusionMode = settings.inclusionMode ?? 'inside';

  return (
    <>
      <ChipSection
        title="Inclusion boundary"
        aside={
          <button
            type="button"
            onClick={() => host.onContourManageBoundaries?.()}
            className="text-[9.5px] font-semibold text-emerald-300 underline decoration-emerald-400/30 underline-offset-2 hover:text-emerald-200"
          >
            Manage…
          </button>
        }
      >
        <select
          aria-label="Contour inclusion boundary"
          value={host.activeInclusionBoundaryId ?? ''}
          onChange={event => host.onContourSelectBoundary?.(event.target.value || null)}
          className={INPUT_CLASS}
        >
          <option value="">All inclusion lines (no specific boundary)</option>
          {boundaries.map(boundary => (
            <option key={boundary.id} value={boundary.id}>
              {boundary.name}
            </option>
          ))}
        </select>
      </ChipSection>

      <ChipSection title="Contour scope">
        <div className="grid grid-cols-2 gap-1.5">
          {(['inside', 'outside'] as const).map(scope => (
            <button
              key={scope}
              type="button"
              aria-pressed={inclusionMode === scope}
              onClick={() => patch({ inclusionMode: scope })}
              className={inclusionMode === scope ? ACTIVE_BUTTON_CLASS : BUTTON_CLASS}
            >
              {scope === 'inside' ? 'Inside boundary' : 'Outside boundary'}
            </button>
          ))}
        </div>
        <p className="text-[9.5px] leading-snug text-slate-500">
          {inclusionMode === 'outside'
            ? 'Uses points outside the boundary and clips contour paths to the exterior — leaving the inclusion area open for GIS contours or a later blend.'
            : 'Uses points inside the boundary and clips contour paths to the polygon.'}
        </p>
      </ChipSection>

      <div className="grid grid-cols-3 gap-1.5 text-center">
        {[
          { label: 'Breaklines', count: host.contourBreaklineCount ?? 0, color: 'text-amber-300' },
          { label: 'Inclusion', count: host.contourInclusionSegmentCount ?? 0, color: 'text-emerald-300' },
          { label: 'Exclusion', count: host.contourExclusionSegmentCount ?? 0, color: 'text-rose-300' },
        ].map(item => (
          <div key={item.label} className="rounded-md border border-white/[0.07] bg-white/[0.02] px-1.5 py-1.5">
            <div className={`font-mono text-[12px] font-bold ${item.count > 0 ? item.color : 'text-slate-600'}`}>
              {item.count}
            </div>
            <div className="text-[8.5px] uppercase tracking-wide text-slate-500">{item.label}</div>
          </div>
        ))}
      </div>
    </>
  );
};

const LabelsChip: React.FC<ChipBodyProps> = ({ host, settings }) => {
  const patch = (next: Partial<ContourSettings>) => host.onContourSettingsChange?.({ ...settings, ...next });
  const labelTool = host.contourLabelTool ?? null;
  const labelCount = host.contourLabelCount ?? 0;

  return (
    <>
      <CheckboxRow
        checked={settings.showLabels}
        onChange={checked => patch({ showLabels: checked })}
        label="Show contour labels"
        hint="Labels follow visible generations"
        count={labelCount}
      />

      <ChipSection title={`Label density: ${(settings.labelDensity ?? 0.5).toFixed(2)}`}>
        <input
          type="range"
          aria-label="Contour label density"
          min={0.1}
          max={2}
          step={0.1}
          value={settings.labelDensity ?? 0.5}
          disabled={!settings.showLabels}
          onChange={event => patch({ labelDensity: parseFloat(event.target.value) })}
          className="w-full accent-amber-500"
        />
      </ChipSection>

      <ChipSection title={`Label scale: ${(settings.labelScale ?? 1).toFixed(1)}x`}>
        <input
          type="range"
          aria-label="Contour label scale"
          min={0.5}
          max={3}
          step={0.1}
          value={settings.labelScale ?? 1}
          disabled={!settings.showLabels}
          onChange={event => patch({ labelScale: parseFloat(event.target.value) })}
          className="w-full accent-amber-500"
        />
      </ChipSection>

      <ChipSection title="Strike tools" aside={<span className="text-[9.5px] text-slate-500">{labelCount} on canvas</span>}>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            aria-pressed={labelTool === 'place'}
            onClick={() => host.onContourSetLabelTool?.(labelTool === 'place' ? null : 'place')}
            className={labelTool === 'place' ? ACTIVE_BUTTON_CLASS : BUTTON_CLASS}
          >
            {labelTool === 'place' ? 'Stop Placing' : 'Place by Strike'}
          </button>
          <button
            type="button"
            aria-pressed={labelTool === 'erase'}
            onClick={() => host.onContourSetLabelTool?.(labelTool === 'erase' ? null : 'erase')}
            className={labelTool === 'erase' ? ACTIVE_BUTTON_CLASS : BUTTON_CLASS}
          >
            {labelTool === 'erase' ? 'Stop Erasing' : 'Erase by Strike'}
          </button>
          <button type="button" onClick={() => host.onContourAutoLabel?.()} className={BUTTON_CLASS}>
            Re-label
          </button>
          <button
            type="button"
            onClick={() => host.onContourClearLabels?.()}
            disabled={labelCount === 0}
            className={BUTTON_CLASS}
          >
            Clear Labels
          </button>
        </div>
        <p className="text-[9px] leading-snug text-slate-500">
          Drag a line across contours to place a label at every crossing. Press Esc to finish.
        </p>
      </ChipSection>
    </>
  );
};

const tokenize = (value: string | undefined): Set<string> => {
  if (!value) return new Set();
  return new Set((value.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(token => token.length >= 2));
};

const jaccard = (left: Set<string>, right: Set<string>): number => {
  if (left.size === 0 && right.size === 0) return 0;
  let intersection = 0;
  left.forEach(token => {
    if (right.has(token)) intersection += 1;
  });
  const union = left.size + right.size - intersection;
  return union > 0 ? intersection / union : 0;
};

const IgnorePointsChip: React.FC<ChipBodyProps> = ({ host, settings }) => {
  const points = host.contourPoints ?? [];
  const ignored = useMemo(() => new Set(settings.ignoredPointNumbers ?? []), [settings.ignoredPointNumbers]);
  const [searchTerm, setSearchTerm] = useState('');
  const [seedPointNumber, setSeedPointNumber] = useState<string | null>(null);

  const filteredPoints = useMemo(() => {
    const query = searchTerm.trim().toUpperCase();
    if (!query) return [] as SurveyPoint[];
    return points
      .filter(
        point =>
          (point.pointNumber || '').toUpperCase().includes(query) ||
          (point.description || '').toUpperCase().includes(query),
      )
      .slice(0, 80);
  }, [points, searchTerm]);

  const setIgnored = (next: Set<string>) =>
    host.onContourSettingsChange?.({ ...settings, ignoredPointNumbers: Array.from(next) });

  const toggleIgnored = (pointNumber: string) => {
    const next = new Set(ignored);
    if (next.has(pointNumber)) next.delete(pointNumber);
    else next.add(pointNumber);
    setSeedPointNumber(pointNumber);
    setIgnored(next);
  };

  const smartMatch = () => {
    const seedPointNumberValue = seedPointNumber ?? Array.from(ignored).slice(-1)[0];
    if (!seedPointNumberValue) return;
    const seed = points.find(point => point.pointNumber === seedPointNumberValue);
    if (!seed) return;
    const seedTokens = tokenize(seed.description);
    if (seedTokens.size === 0) return;
    const next = new Set(ignored);
    points.forEach(point => {
      if (point.pointNumber === seedPointNumberValue || next.has(point.pointNumber)) return;
      if (jaccard(seedTokens, tokenize(point.description)) >= 0.5) next.add(point.pointNumber);
    });
    setIgnored(next);
  };

  return (
    <>
      <ChipSection
        title="Search points"
        aside={
          ignored.size > 0 ? (
            <button
              type="button"
              onClick={() => setIgnored(new Set())}
              className="text-[9.5px] font-semibold text-slate-400 underline decoration-white/20 underline-offset-2 hover:text-rose-300"
            >
              Clear ({ignored.size})
            </button>
          ) : undefined
        }
      >
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              aria-label="Search contour ignore points"
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder='Point number or description, e.g. "inv"'
              className={`${INPUT_CLASS} pl-7`}
            />
          </div>
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              aria-label="Clear contour point search"
              className="rounded-md border border-white/10 p-1.5 text-slate-400 hover:text-white"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </ChipSection>

      {searchTerm && (
        <div className="overflow-hidden rounded-md border border-white/[0.08]">
          <div className="flex items-center justify-between border-b border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[9px] uppercase tracking-wide text-slate-500">
            <span>{filteredPoints.length} match{filteredPoints.length === 1 ? '' : 'es'}</span>
            {filteredPoints.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const next = new Set(ignored);
                  filteredPoints.forEach(point => next.add(point.pointNumber));
                  setIgnored(next);
                }}
                className="font-semibold text-fuchsia-300 hover:text-fuchsia-200"
              >
                Ignore all
              </button>
            )}
          </div>
          <div className="max-h-44 divide-y divide-white/[0.05] overflow-y-auto">
            {filteredPoints.map(point => {
              const isIgnored = ignored.has(point.pointNumber);
              return (
                <button
                  key={point.pointNumber}
                  type="button"
                  onClick={() => toggleIgnored(point.pointNumber)}
                  className={`flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04] ${
                    isIgnored ? 'bg-fuchsia-400/[0.07]' : ''
                  }`}
                >
                  <span
                    className={`flex h-3 w-3 flex-none items-center justify-center rounded border text-[8px] ${
                      isIgnored
                        ? 'border-fuchsia-300 bg-fuchsia-400 text-slate-950'
                        : 'border-slate-600 bg-slate-800'
                    }`}
                  >
                    {isIgnored ? '✓' : ''}
                  </span>
                  <span className="w-12 flex-none truncate font-mono text-[9.5px] text-fuchsia-200/80">
                    {point.pointNumber}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[10.5px] text-slate-300">
                    {point.description || '(no description)'}
                  </span>
                  {typeof point.elevation === 'number' && (
                    <span className="font-mono text-[9px] text-slate-500">Z={point.elevation.toFixed(2)}</span>
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

      {ignored.size > 0 && (
        <ChipSection title={`Ignored points (${ignored.size})`}>
          <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
            {Array.from(ignored).slice(0, 200).map(pointNumber => (
              <button
                key={pointNumber}
                type="button"
                onClick={() => toggleIgnored(pointNumber)}
                aria-label={`Stop ignoring point ${pointNumber}`}
                className="rounded border border-fuchsia-400/25 bg-fuchsia-400/[0.08] px-1.5 py-0.5 font-mono text-[9.5px] text-fuchsia-200 transition-colors hover:border-rose-400/40 hover:bg-rose-400/10 hover:text-rose-200"
              >
                {pointNumber} ×
              </button>
            ))}
          </div>
        </ChipSection>
      )}

      <button
        type="button"
        onClick={smartMatch}
        disabled={ignored.size === 0 && !seedPointNumber}
        className={BUTTON_CLASS}
        title="Add points whose descriptions share at least half of the seed point's tokens."
      >
        <Sparkles className="h-3 w-3 text-fuchsia-300" />
        AI Smart Match
      </button>
      <p className="text-[9px] leading-snug text-slate-500">
        Smart Match uses the most recently toggled point as a seed and ignores others with at least 50% shared
        description tokens.
      </p>
    </>
  );
};

const ActionsChip: React.FC<ChipBodyProps> = ({ host, settings }) => {
  const generationCount = host.contourGenerations?.length ?? 0;
  const tinSurfaces = host.tinSurfaces ?? [];
  const isGenerating = host.isGeneratingContours ?? false;
  const isImporting = host.isImportingTin ?? false;

  return (
    <>
      <div className="rounded-md border border-amber-400/25 bg-amber-400/[0.06] px-2.5 py-2 text-[10px] leading-relaxed text-amber-100/90">
        <div className="font-semibold uppercase tracking-wide">Staged settings</div>
        <div className="mt-0.5 text-[11px]">
          {settings.contourInterval}' minor · {settings.majorInterval}' major · smoothing {settings.smoothing}
        </div>
        <div className="mt-0.5 text-[9.5px] text-amber-200/70">
          {settings.sourceType === 'tin' ? 'Loaded TIN source' : 'Survey point source'} ·{' '}
          {settings.inclusionMode === 'outside' ? 'outside boundary' : 'inside boundary'} ·{' '}
          {(settings.ignoredPointNumbers ?? []).length} ignored
        </div>
      </div>

      <div className="space-y-1.5">
        <button
          type="button"
          onClick={() => host.onGenerateContours?.()}
          disabled={isGenerating}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-amber-400/40 bg-amber-500/20 px-3 py-2 text-[11.5px] font-bold text-amber-100 transition-colors hover:border-amber-300/60 hover:bg-amber-500/30 disabled:cursor-wait disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" />
          {isGenerating ? 'Generating…' : 'Generate Contours'}
        </button>
        <button
          type="button"
          onClick={() => host.onImportTinSurface?.()}
          disabled={isImporting}
          className={`${BUTTON_CLASS} w-full py-2`}
        >
          <FileUp className="h-3.5 w-3.5" />
          {isImporting ? 'Importing TIN…' : 'Import .TIN / LandXML'}
        </button>
        <button
          type="button"
          onClick={() => host.onCreateTinFromContours?.()}
          disabled={generationCount === 0}
          className={`${BUTTON_CLASS} w-full py-2`}
        >
          <Plus className="h-3.5 w-3.5" />
          Create TIN from Contours
        </button>
        <button
          type="button"
          onClick={() => tinSurfaces[0] && host.onExportTinSurface?.(tinSurfaces[0].id, 'landxml')}
          disabled={tinSurfaces.length === 0}
          className={`${BUTTON_CLASS} w-full py-2`}
        >
          <Download className="h-3.5 w-3.5" />
          Export TIN (LandXML)
        </button>
      </div>

      {isImporting && commandStatusText(host.tinImportStatus)}
      <p className="text-center text-[9px] leading-snug text-slate-500">
        Generate writes a new independent contour generation. All settings above remain staged for the next run.
      </p>
    </>
  );
};

const commandStatusText = (status: string | null | undefined) =>
  status ? (
    <p className="rounded-md border border-cyan-400/20 bg-cyan-400/[0.06] px-2 py-1.5 text-[9.5px] text-cyan-200">
      {status}
    </p>
  ) : null;

const GENERATION_COLORS = [
  '#f59e0b',
  '#3b82f6',
  '#10b981',
  '#ef4444',
  '#a855f7',
  '#f97316',
  '#06b6d4',
  '#ec4899',
];

const generationDate = (generation: ContourGeneration): string => {
  const date = new Date(generation.lastGeneratedAt || generation.createdAt);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
};

const GenerationsChip: React.FC<ChipBodyProps> = ({ host }) => {
  const generations = host.contourGenerations ?? [];
  const generating = host.isGeneratingContours ?? false;

  return (
    <>
      <div className="flex items-center justify-between text-[10px] text-slate-400">
        <span>
          {generations.length} generation{generations.length === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          onClick={() => host.onGenerateContours?.()}
          disabled={generating}
          className="inline-flex items-center gap-1 rounded border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 text-[9.5px] font-semibold text-emerald-200 disabled:opacity-40"
        >
          <Plus className="h-3 w-3" />
          {generating ? 'Generating…' : 'New'}
        </button>
      </div>

      {generations.length === 0 ? (
        <EmptyState>
          No contour generations yet. Generate contours from the Contour Actions panel, then every run appears here
          as its own card.
        </EmptyState>
      ) : (
        <div className="space-y-1.5">
          {generations.map((generation, index) => {
            const color = generation.color ?? GENERATION_COLORS[index % GENERATION_COLORS.length];
            return (
              <div
                key={generation.id}
                className="relative overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-2"
                style={{ borderLeft: `3px solid ${color}` }}
              >
                <div className="flex items-start gap-1.5">
                  <input
                    type="text"
                    aria-label={`Rename ${generation.name}`}
                    defaultValue={generation.name}
                    onBlur={event => {
                      const name = event.target.value.trim();
                      if (name && name !== generation.name) host.onContourRenameGeneration?.(generation.id, name);
                    }}
                    onKeyDown={event => {
                      if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
                    }}
                    className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-[11.5px] font-semibold text-slate-100 outline-none transition-colors hover:border-white/10 focus:border-cyan-400/40 focus:bg-black/25"
                  />
                  <button
                    type="button"
                    onClick={() => host.onContourToggleGenerationVisible?.(generation.id, !generation.visible)}
                    aria-label={`${generation.visible ? 'Hide' : 'Show'} ${generation.name}`}
                    aria-pressed={generation.visible}
                    className={`rounded border p-1 ${
                      generation.visible
                        ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200'
                        : 'border-white/10 bg-white/[0.03] text-slate-500'
                    }`}
                  >
                    {generation.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => host.onContourDeleteGeneration?.(generation.id)}
                    aria-label={`Delete ${generation.name}`}
                    className="rounded border border-white/10 bg-white/[0.03] p-1 text-slate-500 transition-colors hover:border-rose-400/40 hover:text-rose-300"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-1 text-[9px] text-slate-500">
                  <span className="rounded bg-white/[0.05] px-1 py-0.5 font-mono uppercase">
                    {generation.source === 'esri' ? 'ESRI' : 'survey'}
                  </span>
                  <span>{generation.pointCount.toLocaleString()} pts</span>
                  <span>
                    {generation.elevationRange
                      ? `Z ${generation.elevationRange.min.toFixed(1)}–${generation.elevationRange.max.toFixed(1)}`
                      : 'no Z range'}
                  </span>
                  <span className="truncate">{generationDate(generation)}</span>
                </div>

                <label className="mt-1.5 flex items-center gap-2 text-[9px] text-slate-500">
                  <span className="w-12 flex-none">Opacity</span>
                  <input
                    type="range"
                    aria-label={`Opacity for ${generation.name}`}
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={generation.opacity ?? 1}
                    onChange={event =>
                      host.onContourSetGenerationOpacity?.(generation.id, parseFloat(event.target.value))
                    }
                    className="min-w-0 flex-1 accent-cyan-500"
                  />
                  <span className="w-8 flex-none text-right font-mono">
                    {Math.round((generation.opacity ?? 1) * 100)}%
                  </span>
                </label>

                <div className="mt-1.5 flex items-center gap-1">
                  {GENERATION_COLORS.map(swatch => (
                    <button
                      key={swatch}
                      type="button"
                      onClick={() => host.onContourSetGenerationColor?.(generation.id, swatch)}
                      aria-label={`Set ${generation.name} color ${swatch}`}
                      className={`h-3 w-3 rounded-full border ${
                        color === swatch ? 'border-white' : 'border-black/40'
                      }`}
                      style={{ backgroundColor: swatch }}
                    />
                  ))}
                  {host.onContourOpenGenerationChip && (
                    <button
                      type="button"
                      onClick={() => host.onContourOpenGenerationChip?.(generation.id)}
                      aria-label={`Open ${generation.name}`}
                      title="Open this generation on its own"
                      className="ml-auto inline-flex items-center gap-1 rounded border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-200 hover:border-emerald-300/60 hover:text-white"
                    >
                      <Sparkles className="h-3 w-3" />
                      Open
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => host.onContourCreateTinFromGeneration?.(generation.id)}
                    disabled={host.creatingContourTinGenerationId === generation.id}
                    className={`${host.onContourOpenGenerationChip ? '' : 'ml-auto '}inline-flex items-center gap-1 rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[9px] font-semibold text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200 disabled:opacity-40`}
                  >
                    <Mountain className="h-3 w-3" />
                    {host.creatingContourTinGenerationId === generation.id ? 'Building…' : 'TIN'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};

const blendStatusText = (stats: ContourBlendStats | undefined): { text: string; className: string } => {
  if (!stats) return { text: 'Recalculating the auto-join…', className: 'text-slate-500' };
  if (stats.status === 'no-boundary') {
    return { text: 'Boundary geometry is unavailable. Reselect or redraw the boundary.', className: 'text-amber-300' };
  }
  if (stats.status === 'no-esri') {
    return { text: 'No visible ESRI/State generation to blend.', className: 'text-amber-300' };
  }
  const rejected = stats.rejectedConnectorCount ?? 0;
  const rejectionNote = rejected > 0
    ? ` ${rejected} implausible join(s) rejected to avoid crossing or looping curves.`
    : '';
  if (stats.connectorCount === 0) {
    return {
      text: rejected > 0
        ? `No rational joins to draw.${rejectionNote}`
        : 'No same-elevation ESRI ends are close enough yet.',
      className: 'text-amber-300',
    };
  }
  const open = stats.unmatchedGisEndpoints > 0 ? ` ${stats.unmatchedGisEndpoints} ESRI end(s) remain open.` : '';
  return {
    text: `Joined ${stats.matchedEndpoints} ESRI end(s) with ${stats.connectorCount} transition curve(s).${open}${rejectionNote}`,
    className: rejected > 0 ? 'text-amber-200' : 'text-emerald-300',
  };
};

const BlendChip: React.FC<ChipBodyProps> = ({ host }) => {
  const generations = (host.contourGenerations ?? []).filter(generation => generation.source !== 'esri');
  const boundaries = host.inclusionBoundaries ?? [];
  const [boundaryDrafts, setBoundaryDrafts] = useState<Record<string, string>>({});

  return (
    <>
      <p className="rounded-md border border-indigo-400/20 bg-indigo-400/[0.06] px-2 py-1.5 text-[9.5px] leading-snug text-indigo-200/80">
        Blending is reviewed before it is applied. The canvas highlights the exact trims, transition curves,
        open ends, and refused joins; nothing changes until you select OK.
      </p>

      {generations.length === 0 ? (
        <EmptyState>
          No survey contour generation is available yet. Generate survey contours first, then bind their outside
          ESRI ends here.
        </EmptyState>
      ) : (
        <div className="space-y-1.5">
          {generations.map(generation => {
            const status = blendStatusText(host.contourBlendStatsById?.[generation.id]);
            const isPreviewing = host.contourBlendPreviewGenerationId === generation.id;
            const fallbackBoundary = generation.esriBlendInclusionPolylineId
              ?? boundaries.find(boundary => boundary.id === host.activeInclusionBoundaryId)?.polylineId
              ?? boundaries[0]?.polylineId
              ?? '';
            const selectedBoundary = boundaryDrafts[generation.id] ?? fallbackBoundary;
            return (
              <div
                key={generation.id}
                className="space-y-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-200">
                    {generation.name}
                  </span>
                  <span className={`rounded-full border px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide ${
                    generation.esriBlendEnabled
                      ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                      : isPreviewing
                        ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200'
                        : 'border-white/10 bg-white/[0.03] text-slate-400'
                  }`}>
                    {generation.esriBlendEnabled ? 'Active' : isPreviewing ? 'Reviewing' : 'Review first'}
                  </span>
                </div>

                {generation.esriBlendEnabled ? (
                  <>
                    <p className={`flex items-start gap-1.5 text-[9.5px] leading-snug ${status.className}`}>
                      <RefreshCw className="mt-0.5 h-3 w-3 flex-none" />
                      {status.text}
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => host.onContourPreviewBlend?.(generation.id)}
                        className={BUTTON_CLASS}
                      >
                        Review / Adjust…
                      </button>
                      <button
                        type="button"
                        onClick={() => host.onContourToggleBlend?.(generation.id, false)}
                        className={BUTTON_CLASS}
                      >
                        Turn Off
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <select
                      aria-label={`Blend boundary for ${generation.name}`}
                      value={selectedBoundary}
                      onChange={event =>
                        setBoundaryDrafts(prev => ({ ...prev, [generation.id]: event.target.value }))
                      }
                      className={INPUT_CLASS}
                    >
                      <option value="">Select boundary…</option>
                      {boundaries.map(boundary => (
                        <option key={boundary.id} value={boundary.polylineId}>
                          {boundary.name}
                        </option>
                      ))}
                    </select>
                    {isPreviewing && (
                      <p className="text-[9.5px] leading-snug text-cyan-200">
                        Preview open on canvas — awaiting OK.
                      </p>
                    )}
                    <button
                      type="button"
                      disabled={!selectedBoundary}
                      onClick={() => host.onContourPreviewBlend?.(
                        generation.id,
                        { boundaryPolylineId: selectedBoundary || null },
                      )}
                      className={`${BUTTON_CLASS} w-full`}
                    >
                      <Combine className="h-3 w-3" />
                      Preview Blend…
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};

const EsriChip: React.FC<ChipBodyProps> = ({ host, settings }) => {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<'inclusion' | 'project'>('inclusion');
  const pinned = settings.esriServiceUrls ?? [];
  const isFetching = host.isFetchingEsriContours ?? false;
  const canFetch = Boolean(host.onContourFetchEsri);

  const addUrl = () => {
    const value = url.trim();
    if (!value || pinned.includes(value)) return;
    host.onContourAddEsriService?.(value);
    setUrl('');
  };

  return (
    <>
      <ChipSection title="Area of interest">
        <div className="grid grid-cols-2 gap-1.5">
          {(['inclusion', 'project'] as const).map(candidate => (
            <button
              key={candidate}
              type="button"
              aria-pressed={mode === candidate}
              onClick={() => setMode(candidate)}
              className={mode === candidate ? ACTIVE_BUTTON_CLASS : BUTTON_CLASS}
            >
              {candidate === 'inclusion' ? 'Inclusion boundary' : 'Project extent'}
            </button>
          ))}
        </div>
        <p className="text-[9px] leading-snug text-slate-500">
          Inclusion is clipped to the active boundary; project extent uses the georeferenced point footprint.
        </p>
      </ChipSection>

      <ChipSection title="USGS National Map (no API key)">
        <div className="space-y-1">
          {USGS_NATIONAL_CONTOUR_SOURCES.map(source => (
            <div
              key={source.id}
              className="flex items-center gap-2 rounded-md border border-white/[0.07] bg-white/[0.02] px-2 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[10.5px] font-medium text-teal-200">{source.name}</div>
                <div className="truncate text-[9px] text-slate-500">{source.notes}</div>
              </div>
              <button
                type="button"
                onClick={() => host.onContourFetchEsri?.(source.url, mode, source.id)}
                disabled={!canFetch || isFetching}
                aria-label={`Fetch ${source.name}`}
                className="flex-none rounded border border-teal-400/30 bg-teal-400/10 px-1.5 py-0.5 text-[9.5px] font-semibold text-teal-200 transition-colors hover:border-teal-300/50 disabled:opacity-40"
              >
                {isFetching ? '…' : 'Fetch'}
              </button>
            </div>
          ))}
        </div>
      </ChipSection>

      <ChipSection title="Pinned ArcGIS services">
        <div className="flex items-center gap-1.5">
          <input
            type="url"
            aria-label="Add ESRI contour service URL"
            value={url}
            onChange={event => setUrl(event.target.value)}
            onKeyDown={event => event.key === 'Enter' && addUrl()}
            placeholder="https://…/MapServer/0"
            className={INPUT_CLASS}
          />
          <button
            type="button"
            onClick={addUrl}
            disabled={!url.trim()}
            aria-label="Add ESRI contour service"
            className="flex-none rounded-md border border-white/10 bg-white/[0.03] p-1.5 text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {pinned.length === 0 ? (
          <p className="text-[9px] leading-snug text-slate-500">
            Paste any ArcGIS REST MapServer or layer URL. Fetched contours become their own ESRI generation.
          </p>
        ) : (
          <div className="space-y-1">
            {pinned.map(serviceUrl => (
              <div
                key={serviceUrl}
                className="flex items-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.02] px-2 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-[9px] text-amber-200/80" title={serviceUrl}>
                  {serviceUrl}
                </span>
                <button
                  type="button"
                  onClick={() => host.onContourFetchEsri?.(serviceUrl, mode)}
                  disabled={!canFetch || isFetching}
                  aria-label={`Fetch contours from ${serviceUrl}`}
                  className="flex-none rounded border border-teal-400/30 bg-teal-400/10 px-1.5 py-0.5 text-[9.5px] font-semibold text-teal-200 disabled:opacity-40"
                >
                  {isFetching ? 'Fetching…' : 'Fetch'}
                </button>
                <button
                  type="button"
                  onClick={() => host.onContourRemoveEsriService?.(serviceUrl)}
                  aria-label={`Remove ${serviceUrl}`}
                  className="flex-none rounded border border-white/10 p-1 text-slate-500 hover:border-rose-400/40 hover:text-rose-300"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </ChipSection>

      {host.isFetchingEsriContours && (
        <p className="flex items-center gap-1.5 rounded-md border border-cyan-400/20 bg-cyan-400/[0.06] px-2 py-1.5 text-[9.5px] text-cyan-200">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Querying contour features and clipping them to the selected area…
        </p>
      )}
    </>
  );
};

const SingleGenerationChip: React.FC<ChipBodyProps & { generationId?: string }> = ({
  host,
  generationId,
}) => {
  const generations = host.contourGenerations ?? [];
  const generation = generationId
    ? generations.find(candidate => candidate.id === generationId)
    : generations[0];

  if (!generation) {
    return (
      <EmptyState>
        {generationId
          ? 'This contour generation is no longer in the project. It may have been deleted.'
          : 'No contour generation yet. Generate contours from Contour Actions, then open that generation here.'}
      </EmptyState>
    );
  }

  const index = Math.max(0, generations.findIndex(candidate => candidate.id === generation.id));
  const color = generation.color ?? GENERATION_COLORS[index % GENERATION_COLORS.length];
  const blend = generation.esriBlendEnabled ? blendStatusText(host.contourBlendStatsById?.[generation.id]) : null;

  return (
    <>
      <div
        data-testid={`a2ui-born-generation-${generation.id}`}
        className="relative overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-2"
        style={{ borderLeft: `3px solid ${color}` }}
      >
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: color }} />
          <input
            type="text"
            aria-label={`Rename ${generation.name}`}
            defaultValue={generation.name}
            onBlur={event => {
              const name = event.target.value.trim();
              if (name && name !== generation.name) host.onContourRenameGeneration?.(generation.id, name);
            }}
            onKeyDown={event => {
              if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
            }}
            className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-[12px] font-bold text-slate-100 outline-none transition-colors hover:border-white/10 focus:border-cyan-400/40 focus:bg-black/25"
          />
          <button
            type="button"
            onClick={() => host.onContourToggleGenerationVisible?.(generation.id, !generation.visible)}
            aria-label={`${generation.visible ? 'Hide' : 'Show'} ${generation.name}`}
            aria-pressed={generation.visible}
            className={`rounded border p-1 ${
              generation.visible
                ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200'
                : 'border-white/10 bg-white/[0.03] text-slate-500'
            }`}
          >
            {generation.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          </button>
          <button
            type="button"
            onClick={() => host.onContourDeleteGeneration?.(generation.id)}
            aria-label={`Delete ${generation.name}`}
            className="rounded border border-white/10 bg-white/[0.03] p-1 text-slate-500 transition-colors hover:border-rose-400/40 hover:text-rose-300"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1 text-[9px] text-slate-500">
          <span className="rounded bg-white/[0.05] px-1 py-0.5 font-mono uppercase">
            {generation.source === 'esri' ? 'ESRI' : 'survey'}
          </span>
          <span>{generation.pointCount.toLocaleString()} pts</span>
          <span>{generation.isoPaths.length.toLocaleString()} polylines</span>
          <span>{generationDate(generation)}</span>
        </div>
      </div>

      <ChipSection title="Appearance">
        <label className="flex items-center gap-2 text-[9px] text-slate-500">
          <span className="w-12 flex-none">Opacity</span>
          <input
            type="range"
            aria-label={`Opacity for ${generation.name}`}
            min={0.1}
            max={1}
            step={0.05}
            value={generation.opacity ?? 1}
            onChange={event => host.onContourSetGenerationOpacity?.(generation.id, parseFloat(event.target.value))}
            className="min-w-0 flex-1 accent-cyan-500"
          />
          <span className="w-8 flex-none text-right font-mono">
            {Math.round((generation.opacity ?? 1) * 100)}%
          </span>
        </label>
        <div className="flex items-center gap-1">
          {GENERATION_COLORS.map(swatch => (
            <button
              key={swatch}
              type="button"
              onClick={() => host.onContourSetGenerationColor?.(generation.id, swatch)}
              aria-label={`Set ${generation.name} color ${swatch}`}
              className={`h-3 w-3 rounded-full border ${color === swatch ? 'border-white' : 'border-black/40'}`}
              style={{ backgroundColor: swatch }}
            />
          ))}
        </div>
      </ChipSection>

      <ChipSection title="ESRI blend">
        <p className="text-[9.5px] leading-snug text-slate-500">
          Review trims, transition curves, open ends, and refused joins before applying. Source generations stay intact.
        </p>
        {host.contourBlendPreviewGenerationId === generation.id && (
          <p className="text-[9.5px] leading-snug text-cyan-200">
            Preview open on canvas — awaiting OK.
          </p>
        )}
        {generation.esriBlendEnabled && blend && (
          <p className={`flex items-start gap-1.5 text-[9.5px] leading-snug ${blend.className}`}>
            <RefreshCw className="mt-0.5 h-3 w-3 flex-none" />
            {blend.text}
          </p>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => host.onContourPreviewBlend?.(generation.id)}
            disabled={(host.inclusionBoundaries ?? []).length === 0}
            className={BUTTON_CLASS}
          >
            <Combine className="h-3 w-3" />
            {generation.esriBlendEnabled ? 'Review / Adjust…' : 'Preview Blend…'}
          </button>
          {generation.esriBlendEnabled && (
            <button
              type="button"
              onClick={() => host.onContourToggleBlend?.(generation.id, false)}
              className={BUTTON_CLASS}
            >
              Turn Off
            </button>
          )}
        </div>
      </ChipSection>

      <button
        type="button"
        onClick={() => host.onContourCreateTinFromGeneration?.(generation.id)}
        disabled={host.creatingContourTinGenerationId === generation.id}
        className={`${BUTTON_CLASS} w-full`}
      >
        <Mountain className="h-3 w-3" />
        {host.creatingContourTinGenerationId === generation.id ? 'Building TIN…' : 'Create TIN From This Generation'}
      </button>
      <p className="text-[9px] leading-snug text-slate-500">
        Appearance changes apply immediately. Blend proposals wait for OK in the review dialog.
        Open Contour Generations for the full history.
      </p>
    </>
  );
};

interface A2UIContourChipProps {
  chip: A2UIContourChipId;
  /** Render one born generation instead of the whole generation list. */
  generationId?: string;
  className?: string;
}

/**
 * One independently addressable contour tool, rendered as an A2UI chip.
 *
 * Chips have no dock/pop-out/fullscreen controls on purpose: A2UI places them
 * inline in a conversation or opens them on the global surface stack on demand.
 * Every chip reads live app state from A2UIHostContext so a catalog-launched
 * chip and a chat-inline chip always operate on the same settings.
 */
export const A2UIContourChip: React.FC<A2UIContourChipProps> = ({ chip, generationId, className = '' }) => {
  const host = useContext(A2UIHostContext);
  const meta = CONTOUR_CHIP_META[chip];
  const Icon = CHIP_ICONS[chip];
  const settings = host.contourSettings;
  const bornGeneration = chip === 'contour-generation'
    ? (generationId
        ? host.contourGenerations?.find(generation => generation.id === generationId)
        : undefined) ?? host.contourGenerations?.[0]
    : undefined;

  const body = (() => {
    if (!settings) {
      return (
        <p className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-2 text-[10.5px] text-slate-400">
          Contour settings are not available on this host. Open a project with the Contouring agent first.
        </p>
      );
    }
    switch (chip) {
      case 'contour-source':
        return <SourceChip host={host} settings={settings} />;
      case 'contour-intervals':
        return <IntervalsChip host={host} settings={settings} />;
      case 'contour-cleanup':
        return <CleanupChip host={host} settings={settings} />;
      case 'contour-scope':
        return <ScopeChip host={host} settings={settings} />;
      case 'contour-labels':
        return <LabelsChip host={host} settings={settings} />;
      case 'contour-ignore-points':
        return <IgnorePointsChip host={host} settings={settings} />;
      case 'contour-actions':
        return <ActionsChip host={host} settings={settings} />;
      case 'contour-generations':
        return <GenerationsChip host={host} settings={settings} />;
      case 'contour-generation':
        return <SingleGenerationChip host={host} settings={settings} generationId={generationId} />;
      case 'contour-blend':
        return <BlendChip host={host} settings={settings} />;
      case 'contour-esri':
        return <EsriChip host={host} settings={settings} />;
      default:
        return null;
    }
  })();

  return (
    <div
      data-testid={`a2ui-contour-chip-${chip}`}
      data-contour-chip={chip}
      className={`relative overflow-hidden rounded-xl border border-white/[0.09] bg-[#070e18]/95 text-slate-200 ${className}`}
    >
      <SectionChip color={meta.color} />
      <div className="border-b border-white/[0.07] px-3.5 py-2.5 pl-4">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
          <span
            className="text-[10.5px] font-bold uppercase tracking-[0.13em]"
            style={{ color: meta.color }}
          >
            {meta.label}
          </span>
        </div>
        <p className="mt-1 text-[10px] leading-snug text-slate-400">
          {bornGeneration ? `${bornGeneration.name} · ${meta.description}` : meta.description}
        </p>
      </div>
      <div className="space-y-2.5 px-3.5 py-3 pl-4">{body}</div>
    </div>
  );
};

export default A2UIContourChip;
