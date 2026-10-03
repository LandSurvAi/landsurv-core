/**
 * AutoDraftPanel — components/CadManager/AutoDraftPanel.tsx
 *
 * Floating overlay panel for the Civil Drafter's one-shot "Auto Draft" feature.
 *
 * Pre-flight is a BRIEF question-and-answer flow (max 6 steps, tap-to-answer):
 *   1. Location    — only asked when the Zoning Agent has no location set;
 *                    uses the same Census state/county/municipality autocomplete
 *                    as the Zoning Agent
 *   2. Site area   — confirm the auto-resolved AOI (shrinkwrap / boundary / geocode)
 *   3. Data pull   — toggle chips for parcels / flood / soils / structures / aerial
 *   4. Terrain     — contours (state GIS service vs. generate from points vs. none)
 *                    and steep-slope banding
 *   5. Field codes — only asked when point descriptions don't resolve to symbols:
 *                    quick code → library-symbol mapping (team-code aliases from the
 *                    CAD standard are consulted automatically before asking)
 *   6. Canvas      — draw parcel / flood / soil linework, road + building labels?
 * "Skip — use defaults" runs immediately with everything ON.
 *
 * When running, shows the live phase timeline.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import type { SurveyPoint, SurveyLine, JobInfo, CustomSymbol, StreetLabel } from '../../types.ts';
import {
  type OrchestratorPhase,
  type ZoningContext,
  type PhaseStatus,
  type AutoDraftImage,
  type SymbolCoverage,
  runAutoDraft,
} from '../../utils/autoDraftOrchestrator.ts';
import { resolveAoi, type AoiResult } from '../../utils/aoiResolver.ts';
import type { StaticMapKeys } from '../../services/staticMapsService.ts';
import { SURVEY_SYMBOL_LIBRARY, findMatchingSymbol } from '../../data/surveySymbolLibrary';
import { loadCountiesForState, loadMunicipalitiesForState, useJurisdictionList, useMunicipalitiesForCounty } from '../../utils/usJurisdictions';
import { ESRI_STATE_SERVICES } from '../../utils/esriStateServices.ts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AutoDraftPanelProps {
  points:       SurveyPoint[];
  lines:        SurveyLine[];
  jobInfo:      JobInfo;
  zoningContext: ZoningContext;
  /** Project coordinate system EPSG (settings.projection.epsg). */
  projectEpsg?: number | null;
  /** Keys for the static-map cascade. */
  mapKeys?:     StaticMapKeys;
  /** Called once per draft stage with the stage prompt (+ map imagery) — wire to
   *  handleSendMessage and RETURN ITS PROMISE so stages run sequentially. */
  onDraft:      (prompt: string, images?: AutoDraftImage[]) => void | Promise<void>;
  /** Current canvas line count — lets the timeline narrate lines added per stage. */
  getCanvasLineCount?: () => number;
  /** Merge fetched GIS linework (parcels / flood) into the canvas. */
  onCanvasLines?: (newLines: SurveyLine[], sourceTag: string) => void;
  /** Full parcel fetch result — reuse the app's parcel label/summary pipeline. */
  onParcelResult?: (result: import('../../services/parcelGisService.ts').ParcelFetchResult) => void;
  /** Road-name + building labels — wire to the app's streetLabels state. */
  onStreetLabels?: (labels: StreetLabel[]) => void;
  /** Symbol coverage for the current points (custom symbols + CAD standard +
   *  team-code aliases). Drives the pre-flight unknown-code step. */
  getSymbolCoverage?: (points: SurveyPoint[]) => SymbolCoverage;
  /** Add/extend custom symbols chosen in the unknown-code step. */
  onAddSymbols?: (symbols: CustomSymbol[]) => void;
  /** Regenerate contours from survey points (wire to the app's contour generator). */
  onGenerateContours?: () => void | Promise<void>;
  /** Fetch the state's published GIS contours clipped to the site. Should throw
   *  a human-readable error when no service is registered for the state. */
  onFetchGisContours?: (ctx: ZoningContext) => Promise<void>;
  /** Build TIN → steep-slope bands → draw. Returns triangle counts. */
  onSteepSlopes?: () => Promise<{ kept: number; analyzed: number } | void>;
  onDismiss:    () => void;
}

type StepId = 'location' | 'aoi' | 'sources' | 'terrain' | 'codes' | 'draw';

const US_STATES = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
  'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
  'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
  'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire',
  'New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio',
  'Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota',
  'Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia',
  'Wisconsin','Wyoming','District of Columbia',
];

interface AoiPreview {
  status: 'resolving' | 'ok' | 'fail';
  result?: AoiResult;
  error?: string;
}

// ─── Phase status indicators ──────────────────────────────────────────────────

const ICON: Record<PhaseStatus, string> = {
  pending: '○',
  running: '◌',
  done:    '✓',
  skipped: '–',
  error:   '✗',
};

const COLOR: Record<PhaseStatus, string> = {
  pending: 'text-gray-500',
  running: 'text-yellow-400',
  done:    'text-green-400',
  skipped: 'text-gray-500',
  error:   'text-red-400',
};

const BG: Record<PhaseStatus, string> = {
  pending: 'bg-gray-800/20 border-gray-700/20',
  running: 'bg-yellow-900/20 border-yellow-500/30',
  done:    'bg-green-900/10 border-green-500/15',
  skipped: 'bg-gray-800/20 border-gray-700/15',
  error:   'bg-red-900/20 border-red-500/20',
};

const CONF_COLOR: Record<'high' | 'medium' | 'low', string> = {
  high:   'text-green-400',
  medium: 'text-yellow-400',
  low:    'text-orange-400',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AutoDraftPanel({
  points, lines, jobInfo, zoningContext, projectEpsg, mapKeys,
  onDraft, getCanvasLineCount, onCanvasLines, onParcelResult, onStreetLabels,
  getSymbolCoverage, onAddSymbols, onGenerateContours, onFetchGisContours, onSteepSlopes, onDismiss,
}: AutoDraftPanelProps) {
  const [phases, setPhases]     = useState<OrchestratorPhase[]>([]);
  const [isRunning, setRunning] = useState(false);
  const [isDone,    setDone]    = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const hasLocation = !!(zoningContext.state && zoningContext.place);

  // Symbol coverage snapshot — frozen at open so the step list stays stable.
  const [coverage] = useState<SymbolCoverage | null>(() => {
    try { return getSymbolCoverage?.(points) ?? null; } catch { return null; }
  });
  const unknownCodes = coverage?.unmatched ?? [];
  const MAX_CODE_ROWS = 12;

  // ── Q&A state ──
  const steps: StepId[] = [
    ...(!hasLocation ? ['location' as StepId] : []),
    'aoi', 'sources', 'terrain',
    ...(unknownCodes.length > 0 ? ['codes' as StepId] : []),
    'draw',
  ];
  const [stepIndex, setStepIndex]   = useState(0);
  // Location — same Census-backed state/county/municipality autocomplete the
  // Zoning Agent uses (utils/usJurisdictions, cached in localStorage).
  const [locState,  setLocState]  = useState(zoningContext.state ?? '');
  const [locCounty, setLocCounty] = useState(zoningContext.county ?? '');
  const [locMuni,   setLocMuni]   = useState(zoningContext.place ?? '');
  const countyList    = useJurisdictionList(loadCountiesForState, locState);
  const muniListState = useJurisdictionList(loadMunicipalitiesForState, locState);
  const countyMatch = locState && locCounty
    ? countyList.list.find(c => c.toLowerCase() === locCounty.replace(/\s+(county|parish|borough)\s*$/i, '').trim().toLowerCase())
    : undefined;
  const muniListCounty = useMunicipalitiesForCounty(locState, countyMatch);
  const muniList = countyMatch && muniListCounty.list.length > 0 ? muniListCounty.list : muniListState.list;
  const locationText = [
    locMuni.trim() || null,
    locCounty.trim() ? `${locCounty.trim().replace(/\s+county\s*$/i, '')} County` : null,
    locState.trim() || null,
  ].filter(Boolean).join(', ');
  const [aoiPreview, setAoiPreview] = useState<AoiPreview>({ status: 'resolving' });
  const [useGis, setUseGis]         = useState(true);
  const [sources, setSources] = useState({ parcels: true, flood: true, soils: true, structures: true, staticMap: true });
  // Terrain — contour source + steep-slope banding. Contours default to
  // point-generation when we have enough elevations to triangulate.
  const canTin = points.filter(p => typeof p.elevation === 'number' && Number.isFinite(p.elevation)).length >= 3;
  const effectiveState = (locState || zoningContext.state || '').trim();
  const gisEntry = ESRI_STATE_SERVICES.find(s =>
    s.state.toLowerCase() === effectiveState.toLowerCase() || s.abbr.toLowerCase() === effectiveState.toLowerCase());
  const gisContoursKnown = (gisEntry?.layers.length ?? 0) > 0;
  const [terrain, setTerrain] = useState<{ contours: 'gis' | 'points' | 'none'; slopes: boolean }>(() => ({
    contours: canTin ? 'points' : 'none',
    slopes: false,
  }));
  const [draw, setDraw]       = useState({ parcels: true, flood: true, soils: true, labels: true });
  const [quality, setQuality] = useState({ buildingReviewChecklist: true });
  /** unknown code → library symbol id ('' = leave without symbol). */
  const [codeMappings, setCodeMappings] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const u of (coverage?.unmatched ?? []).slice(0, MAX_CODE_ROWS)) {
      const suggestion = findMatchingSymbol(u.code);
      if (suggestion) m[u.code] = suggestion.id;
    }
    return m;
  });
  /** Optional freeform description hint entered by the user for fuzzy matching. */
  const [codeDescriptions, setCodeDescriptions] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    for (const u of (coverage?.unmatched ?? []).slice(0, MAX_CODE_ROWS)) {
      d[u.code] = '';
    }
    return d;
  });
  /** Per-code enable/disable switch for applying symbol mapping. */
  const [codeEnabled, setCodeEnabled] = useState<Record<string, boolean>>(() => {
    const e: Record<string, boolean> = {};
    for (const u of (coverage?.unmatched ?? []).slice(0, MAX_CODE_ROWS)) {
      e[u.code] = true;
    }
    return e;
  });

  const applyFuzzySuggestion = (code: string) => {
    const suggestion = findMatchingSymbol(code, codeDescriptions[code]?.trim());
    setCodeMappings((m) => ({ ...m, [code]: suggestion?.id ?? '' }));
  };

  const defaultLocationText = [
    zoningContext.place,
    zoningContext.county ? `${zoningContext.county} County` : null,
    zoningContext.state,
  ].filter(Boolean).join(', ');

  const resolvePreview = useCallback(async (locText?: string) => {
    setAoiPreview({ status: 'resolving' });
    try {
      const result = await resolveAoi({
        points, lines, projectEpsg,
        locationText: locText || undefined,
      });
      setAoiPreview({ status: 'ok', result });
    } catch (e) {
      setAoiPreview({ status: 'fail', error: e instanceof Error ? e.message : String(e) });
    }
     
  }, [points, lines, projectEpsg]);

  // Resolve the AOI in the background as soon as the panel opens.
  useEffect(() => {
    void resolvePreview(defaultLocationText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Zoning-context override built from the location step's three fields. */
  const effectiveZoning = (): ZoningContext => {
    const st = locState.trim();
    const co = locCounty.trim().replace(/\s+(county|parish|borough)\s*$/i, '');
    const mu = locMuni.trim();
    if (!st && !co && !mu) return zoningContext;
    return {
      ...zoningContext,
      state:  st || zoningContext.state,
      county: co || zoningContext.county,
      place:  mu || zoningContext.place,
    };
  };

  const handleRun = async (overrides?: { allDefaults?: boolean }) => {
    const zc = overrides?.allDefaults ? zoningContext : effectiveZoning();
    const gis = overrides?.allDefaults ? true : useGis;
    const src = overrides?.allDefaults
      ? { parcels: true, flood: true, soils: true, structures: true, staticMap: true }
      : { ...sources };
    const drw = overrides?.allDefaults ? { parcels: true, flood: true, soils: true, labels: true } : { ...draw };
    const ter = overrides?.allDefaults
      ? { contours: (canTin ? 'points' : 'none') as 'gis' | 'points' | 'none', slopes: false }
      : { ...terrain };
    const qual = overrides?.allDefaults ? { buildingReviewChecklist: true } : { ...quality };

    // Apply the user's unknown-code → symbol mappings (skipped on all-defaults):
    // one CustomSymbol per library symbol, carrying all mapped codes as terms.
    let effectiveCoverage = coverage ?? undefined;
    if (!overrides?.allDefaults && coverage && onAddSymbols) {
      const applied = Object.entries(codeMappings).filter(([code, libId]) =>
        (codeEnabled[code] ?? true) && !!libId
      );
      if (applied.length > 0) {
        const byLib = new Map<string, string[]>();
        for (const [code, libId] of applied) {
          byLib.set(libId, [...(byLib.get(libId) ?? []), code]);
        }
        const ts = Date.now();
        const newSymbols: CustomSymbol[] = [];
        for (const [libId, codes] of byLib) {
          const lib = SURVEY_SYMBOL_LIBRARY.find(s => s.id === libId);
          if (!lib) continue;
          newSymbols.push({
            id: `autodraft-${libId}-${ts}`,
            name: lib.name,
            description: lib.description,
            associatedTerms: codes,
            svgPath: lib.svgPath,
            fillPath: lib.fillPath,
            viewBox: lib.viewBox,
            scale: 1,
          });
        }
        if (newSymbols.length > 0) onAddSymbols(newSymbols);
        const mapped = new Set(applied.map(([code]) => code));
        const gained = coverage.unmatched.filter(u => mapped.has(u.code)).reduce((s, u) => s + u.count, 0);
        effectiveCoverage = {
          matched: coverage.matched + gained,
          total: coverage.total,
          unmatched: coverage.unmatched.filter(u => !mapped.has(u.code)),
        };
      }
    }

    setRunning(true);
    setDone(false);
    setPhases([]);
    try {
      await runAutoDraft({
        points,
        lines,
        jobInfo,
        zoningContext: zc,
        projectEpsg,
        config: {
          sources: gis
            ? src
            : { parcels: false, flood: false, soils: false, structures: false, staticMap: src.staticMap },
          drawParcels: drw.parcels,
          drawFlood: drw.flood,
          drawSoils: drw.soils,
          labelRoadsAndBuildings: drw.labels,
          contours: ter.contours,
          steepSlopes: ter.slopes,
          buildingReviewChecklist: qual.buildingReviewChecklist,
          symbolCoverage: effectiveCoverage,
          aoiOverride: aoiPreview.status === 'ok' ? aoiPreview.result : undefined,
          mapKeys,
        },
        onPhaseUpdate: (updated) => {
          setPhases([...updated]);
          // Auto-scroll log
          setTimeout(() => {
            logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
          }, 30);
        },
        onDraft,
        getCanvasLineCount,
        onCanvasLines,
        onParcelResult,
        onStreetLabels,
        onGenerateContours,
        onFetchGisContours,
        onSteepSlopes,
      });
    } finally {
      setRunning(false);
      setDone(true);
    }
  };

  const handleReset = () => {
    setPhases([]);
    setDone(false);
    setStepIndex(0);
  };

  const next = () => {
    if (stepIndex < steps.length - 1) {
      // Re-resolve AOI when the user just supplied a location we didn't have.
      if (steps[stepIndex] === 'location' && locationText.trim()) {
        void resolvePreview(locationText.trim());
      }
      setStepIndex(stepIndex + 1);
    } else {
      void handleRun();
    }
  };

  const step = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;
  const inQna = !isRunning && phases.length === 0;

  const Chip = ({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) => (
    <button
      onClick={onToggle}
      className={`px-2.5 py-1.5 rounded-full text-xs font-medium border transition-all ${
        on
          ? 'bg-violet-600/60 border-violet-400/60 text-white'
          : 'bg-gray-800/60 border-gray-600/40 text-gray-500'
      }`}
    >
      {on ? '✓ ' : ''}{label}
    </button>
  );

  return (
    <div className="absolute bottom-24 right-4 z-[60] w-80 bg-gray-900/95 border border-violet-500/40 rounded-xl shadow-2xl overflow-hidden backdrop-blur-sm select-none">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-violet-900/50 border-b border-violet-500/30">
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">⚡</span>
          <span className="text-sm font-bold text-violet-200 tracking-widest">AUTO DRAFT</span>
          {isRunning && (
            <span className="text-xs text-yellow-400 animate-pulse ml-1">running…</span>
          )}
          {isDone && !isRunning && (
            <span className="text-xs text-green-400 ml-1">done</span>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="text-gray-500 hover:text-white text-xs px-1 py-0.5 rounded transition-colors"
          title="Close auto draft panel"
        >
          ✕
        </button>
      </div>

      {/* ── Pre-flight Q&A ── */}
      {inQna && (
        <div className="p-4 space-y-3">

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-1.5">
            {steps.map((s, i) => (
              <span
                key={s}
                className={`h-1.5 rounded-full transition-all ${
                  i === stepIndex ? 'w-5 bg-violet-400' : i < stepIndex ? 'w-1.5 bg-violet-600' : 'w-1.5 bg-gray-700'
                }`}
              />
            ))}
          </div>

          {/* Q: Location — same Census autocomplete as the Zoning Agent */}
          {step === 'location' && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-violet-200">📍 Where is this site?</p>
              <p className="text-xs text-gray-500 leading-snug">
                No location is configured. It enables zoning, parcel and geocode lookups.
              </p>
              <select
                value={locState}
                onChange={(e) => { setLocState(e.target.value); setLocCounty(''); setLocMuni(''); }}
                className="w-full px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-600/50 text-xs text-gray-200 focus:border-violet-500/60 focus:outline-none"
                autoFocus
              >
                <option value="">— Select state —</option>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <input
                type="text"
                list="ad-county-options"
                value={locCounty}
                onChange={(e) => setLocCounty(e.target.value)}
                placeholder={countyList.loading ? 'Loading counties…' : 'County'}
                disabled={!locState}
                className="w-full px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-600/50 text-xs text-gray-200 placeholder-gray-600 focus:border-violet-500/60 focus:outline-none disabled:opacity-50"
              />
              <datalist id="ad-county-options">
                {countyList.list.map(c => <option key={c} value={c} />)}
              </datalist>
              <input
                type="text"
                list="ad-muni-options"
                value={locMuni}
                onChange={(e) => setLocMuni(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') next(); }}
                placeholder={muniListState.loading || muniListCounty.loading ? 'Loading municipalities…' : 'Municipality'}
                disabled={!locState}
                className="w-full px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-600/50 text-xs text-gray-200 placeholder-gray-600 focus:border-violet-500/60 focus:outline-none disabled:opacity-50"
              />
              <datalist id="ad-muni-options">
                {muniList.map(m => <option key={m} value={m} />)}
              </datalist>
            </div>
          )}

          {/* Q: AOI confirm */}
          {step === 'aoi' && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-violet-200">🎯 Site area for GIS data</p>
              {aoiPreview.status === 'resolving' && (
                <p className="text-xs text-yellow-400 animate-pulse">Resolving area of interest…</p>
              )}
              {aoiPreview.status === 'ok' && aoiPreview.result && (
                <div className="rounded-lg bg-gray-800/50 border border-gray-700/40 px-3 py-2 space-y-1">
                  <p className="text-xs text-gray-300 leading-snug">{aoiPreview.result.summary}</p>
                  <p className={`text-xs font-medium ${CONF_COLOR[aoiPreview.result.confidence]}`}>
                    {aoiPreview.result.confidence} confidence · {aoiPreview.result.source.replace('_', ' ')}
                  </p>
                </div>
              )}
              {aoiPreview.status === 'fail' && (
                <p className="text-xs text-orange-400 leading-snug">
                  Couldn't resolve an area ({aoiPreview.error}). GIS fetches will be skipped.
                </p>
              )}
              <div className="flex gap-2">
                <Chip on={useGis} label="Fetch GIS data" onToggle={() => setUseGis(true)} />
                <Chip on={!useGis} label="Skip GIS data" onToggle={() => setUseGis(false)} />
              </div>
            </div>
          )}

          {/* Q: Data sources */}
          {step === 'sources' && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-violet-200">🗂 Pull which data?</p>
              <div className="flex flex-wrap gap-1.5">
                <Chip on={sources.parcels}    label="Tax parcels" onToggle={() => setSources(s => ({ ...s, parcels: !s.parcels }))} />
                <Chip on={sources.flood}      label="Flood zones" onToggle={() => setSources(s => ({ ...s, flood: !s.flood }))} />
                <Chip on={sources.soils}      label="Soils"       onToggle={() => setSources(s => ({ ...s, soils: !s.soils }))} />
                <Chip on={sources.structures} label="Structures"  onToggle={() => setSources(s => ({ ...s, structures: !s.structures }))} />
                <Chip on={sources.staticMap}  label="Aerial view" onToggle={() => setSources(s => ({ ...s, staticMap: !s.staticMap }))} />
              </div>
            </div>
          )}

          {/* Q: Terrain — contours + steep slopes */}
          {step === 'terrain' && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-violet-200">⛰ Terrain</p>
              <p className="text-xs text-gray-500 leading-snug">Contours:</p>
              <div className="flex flex-wrap gap-1.5">
                <Chip on={terrain.contours === 'gis'}    label="Pull GIS contours"    onToggle={() => setTerrain(t => ({ ...t, contours: 'gis' }))} />
                <Chip on={terrain.contours === 'points'} label="Generate from points" onToggle={() => setTerrain(t => ({ ...t, contours: 'points' }))} />
                <Chip on={terrain.contours === 'none'}   label="None"                 onToggle={() => setTerrain(t => ({ ...t, contours: 'none' }))} />
              </div>
              {terrain.contours === 'gis' && !gisContoursKnown && (
                <p className="text-xs text-yellow-500/80 leading-snug">
                  No published contour service is registered for {effectiveState || 'this state'} yet — the fetch may be skipped.
                </p>
              )}
              {terrain.contours === 'points' && !canTin && (
                <p className="text-xs text-yellow-500/80 leading-snug">
                  Fewer than 3 points with elevations — generation will be skipped.
                </p>
              )}
              <p className="text-xs text-gray-500 leading-snug pt-1">Steep-slope analysis (0–15 / 15–30 / 30+ % bands):</p>
              <div className="flex gap-2">
                <Chip on={terrain.slopes}  label="Draw slope bands" onToggle={() => setTerrain(t => ({ ...t, slopes: true }))} />
                <Chip on={!terrain.slopes} label="Skip"             onToggle={() => setTerrain(t => ({ ...t, slopes: false }))} />
              </div>
              {terrain.slopes && !canTin && (
                <p className="text-xs text-yellow-500/80 leading-snug">
                  Needs ≥3 points with elevations to build the TIN.
                </p>
              )}
            </div>
          )}

          {/* Q: Unknown field codes → symbols */}
          {step === 'codes' && coverage && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-violet-200">⚡ Unknown field codes</p>
              <p className="text-xs text-gray-500 leading-snug">
                {coverage.matched} of {coverage.total} points already resolve to a symbol
                (custom symbols, CAD standard &amp; team codes). Map the rest — or leave blank for no symbol.
              </p>
              <div className="max-h-40 overflow-y-auto space-y-1 pr-0.5 scrollbar-thin scrollbar-thumb-gray-700">
                {unknownCodes.slice(0, MAX_CODE_ROWS).map(({ code, count }) => {
                  const enabled = codeEnabled[code] ?? true;
                  const fuzzySuggestion = findMatchingSymbol(code, codeDescriptions[code]?.trim());

                  return (
                    <div key={code} className="rounded-md border border-gray-700/40 bg-gray-800/20 px-1.5 py-1.5 space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setCodeEnabled((prev) => ({ ...prev, [code]: !(prev[code] ?? true) }))}
                          className={`px-1.5 py-0.5 rounded text-[10px] border transition-colors ${
                            enabled
                              ? 'bg-violet-700/40 border-violet-500/50 text-violet-100'
                              : 'bg-gray-800 border-gray-600/50 text-gray-500'
                          }`}
                          title={enabled ? 'Disable this symbol mapping' : 'Enable this symbol mapping'}
                        >
                          {enabled ? 'ON' : 'OFF'}
                        </button>
                        <span className="text-xs font-mono text-gray-300 w-14 truncate flex-shrink-0" title={code}>{code}</span>
                        <span className="text-[10px] text-gray-600 w-7 flex-shrink-0">×{count}</span>
                        <select
                          value={codeMappings[code] ?? ''}
                          onChange={(e) => setCodeMappings(m => ({ ...m, [code]: e.target.value }))}
                          disabled={!enabled}
                          className="flex-1 min-w-0 px-1.5 py-1 rounded bg-gray-800 border border-gray-600/50 text-xs text-gray-200 focus:border-violet-500/60 focus:outline-none disabled:opacity-50"
                        >
                          <option value="">— no symbol —</option>
                          {SURVEY_SYMBOL_LIBRARY.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={codeDescriptions[code] ?? ''}
                          onChange={(e) => setCodeDescriptions((prev) => ({ ...prev, [code]: e.target.value }))}
                          placeholder="Type description for fuzzy match"
                          disabled={!enabled}
                          className="flex-1 min-w-0 px-1.5 py-1 rounded bg-gray-800 border border-gray-600/50 text-xs text-gray-200 placeholder-gray-600 focus:border-violet-500/60 focus:outline-none disabled:opacity-50"
                        />
                        <button
                          onClick={() => applyFuzzySuggestion(code)}
                          disabled={!enabled}
                          className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-[10px] text-gray-200 disabled:opacity-50"
                          title="Use fuzzy suggestion from description"
                        >
                          Suggest
                        </button>
                      </div>
                      {enabled && fuzzySuggestion && (
                        <p className="text-[10px] text-gray-500">
                          Fuzzy match: {fuzzySuggestion.name}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              {unknownCodes.length > MAX_CODE_ROWS && (
                <p className="text-[10px] text-gray-600">
                  +{unknownCodes.length - MAX_CODE_ROWS} more — handle in CAD Standards → Team Codes.
                </p>
              )}
            </div>
          )}

          {/* Q: Draw to canvas */}
          {step === 'draw' && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-violet-200">✏ Draw fetched linework on canvas?</p>
              <div className="flex flex-wrap gap-1.5">
                <Chip on={draw.parcels} label="Parcel lines" onToggle={() => setDraw(d => ({ ...d, parcels: !d.parcels }))} />
                <Chip on={draw.flood}   label="Flood zones"  onToggle={() => setDraw(d => ({ ...d, flood: !d.flood }))} />
                <Chip on={draw.soils}   label="Soil lines"   onToggle={() => setDraw(d => ({ ...d, soils: !d.soils }))} />
                <Chip on={draw.labels}  label="Road + bldg labels" onToggle={() => setDraw(d => ({ ...d, labels: !d.labels }))} />
              </div>
              <p className="text-xs text-gray-500 leading-snug pt-1">Building QA:</p>
              <div className="flex flex-wrap gap-1.5">
                <Chip
                  on={quality.buildingReviewChecklist}
                  label="Confidence + review checklist"
                  onToggle={() => setQuality(q => ({ ...q, buildingReviewChecklist: !q.buildingReviewChecklist }))}
                />
              </div>
              {points.length === 0 && (
                <p className="text-xs text-yellow-500/80 leading-snug">
                  No points loaded — load a RAW file first for best results.
                </p>
              )}
            </div>
          )}

          {/* Nav buttons */}
          <div className="flex gap-2 pt-1">
            {stepIndex > 0 && (
              <button
                onClick={() => setStepIndex(stepIndex - 1)}
                className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs font-medium transition-colors"
              >
                ←
              </button>
            )}
            <button
              onClick={next}
              className="flex-1 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 active:scale-[0.98] text-white font-bold text-xs tracking-widest transition-all shadow-lg shadow-violet-900/40"
            >
              {isLastStep ? '⚡ RUN AUTO DRAFT' : 'NEXT →'}
            </button>
          </div>

          {/* Skip-all escape hatch */}
          <button
            onClick={() => void handleRun({ allDefaults: true })}
            className="w-full text-center text-xs text-gray-500 hover:text-violet-300 transition-colors py-0.5"
          >
            Skip — run with defaults
          </button>
        </div>
      )}

      {/* ── Running / done: phase timeline ── */}
      {(isRunning || phases.length > 0) && (
        <div ref={logRef} className="max-h-80 overflow-y-auto p-3 space-y-1 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">

          {phases.map((phase) => (
            <div
              key={phase.id}
              className={`flex items-start gap-2 rounded-lg px-2.5 py-1.5 border transition-all ${BG[phase.status]}`}
            >
              {/* Status icon */}
              <span
                className={`font-mono text-xs w-3.5 flex-shrink-0 mt-0.5 ${COLOR[phase.status]} ${phase.status === 'running' ? 'animate-spin' : ''}`}
                aria-label={phase.status}
              >
                {ICON[phase.status]}
              </span>

              {/* Phase info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="text-xs leading-none">{phase.icon}</span>
                  <span className={`text-xs font-medium leading-tight ${COLOR[phase.status]}`}>
                    {phase.label}
                  </span>
                </div>
                {phase.summary && (
                  <p
                    className="text-xs text-gray-400 mt-0.5 truncate"
                    title={phase.summary}
                  >
                    {phase.summary}
                  </p>
                )}
              </div>
            </div>
          ))}

          {/* Done footer */}
          {isDone && !isRunning && (
            <div className="pt-2 space-y-2">
              <div className="text-xs text-center py-1.5 rounded-lg bg-green-900/15 border border-green-500/20 text-green-400 font-medium">
                ✓ Prompt dispatched — Civil Drafter is drafting…
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleReset}
                  className="flex-1 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-medium transition-colors"
                >
                  Run Again
                </button>
                <button
                  onClick={onDismiss}
                  className="flex-1 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
