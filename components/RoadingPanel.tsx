import React, { useState } from 'react';
import { RoadIcon, ScaleIcon, ProfileIcon } from './icons.tsx';
import type { Centerline, RoadCorridorRun, RoadTypicalSection } from '../types.ts';

export interface RoadingPanelProps {
  /** Count of road-relevant survey points (EP, EOP, CL, CURB, TBC, ROW) in the session. */
  roadSurveyPointCount: number;
  /** Total survey points in the session. */
  totalPointCount: number;
  /** Available horizontal centerlines from Stationing & CL. */
  centerlines: Centerline[];
  /** Saved road synthesis & corridor runs in this session. */
  roadCorridors: RoadCorridorRun[];
  /** Whether background map imagery is currently enabled. */
  hasBackgroundImagery: boolean;
  /** Busy flags. */
  isWorking?: boolean;
  /** Trigger existing road synthesis via CACP (`roading_synthesize_existing`). */
  onSynthesizeExisting: (params: {
    defaultRoadWidthFt: number;
    rowWidthFt: number;
    useSurveyPoints: boolean;
    useBackgroundImagery: boolean;
    useOsmWays: boolean;
    syncCenterline: boolean;
  }) => void;
  /** Trigger proposed corridor & typical section design via CACP (`roading_design_corridor`). */
  onDesignCorridor: (
    params: RoadTypicalSection & {
      name: string;
      centerlineId?: string;
      pointNumbers?: string[];
      autoGenerateProfile: boolean;
    },
  ) => void;
  /** Trigger centerline profile & cross section generation via CACP (`roading_generate_profile_and_sections`). */
  onGenerateProfileAndSections: (params: {
    centerlineId?: string;
    sampleIntervalFt: number;
    halfWidthFt: number;
    designGradePct?: number;
  }) => void;
  /** Trigger cul-de-sac bulb, intersection fillet, or driveway apron tie-in via CACP (`roading_add_culdesac_or_fillet`). */
  onAddTerminusOrTieIn: (params: {
    featureKind: 'cul-de-sac' | 'driveway-apron' | 'intersection-fillet';
    centerlineId?: string;
    atEnd: boolean;
    bulbRadiusFt: number;
    rowBulbRadiusFt: number;
    drivewayWidthFt: number;
  }) => void;
  /** Clear generated road corridor linework via CACP (`roading_clear`). */
  onClearCorridors?: (corridorId?: string) => void;
  /** Switch to the Stationing & CL agent to edit PIs/curves. */
  onOpenStationingAgent?: () => void;
  /** Switch to the Profile View panel. */
  onOpenProfileView?: () => void;
  /** Initial tab selection. */
  initialTab?: 'synthesize' | 'corridor' | 'profile';
}

export const RoadingPanel: React.FC<RoadingPanelProps> = ({
  roadSurveyPointCount,
  totalPointCount,
  centerlines,
  roadCorridors,
  hasBackgroundImagery,
  isWorking = false,
  onSynthesizeExisting,
  onDesignCorridor,
  onGenerateProfileAndSections,
  onAddTerminusOrTieIn,
  onClearCorridors,
  onOpenStationingAgent,
  onOpenProfileView,
  initialTab = 'synthesize',
}) => {
  const [activeTab, setActiveTab] = useState<'synthesize' | 'corridor' | 'profile'>(initialTab);

  // Existing Synthesis state
  const [synthWidthFt, setSynthWidthFt] = useState(24);
  // No assumed ROW: the user must enter the deeded width (0 = no ROW lines).
  const [synthRowFt, setSynthRowFt] = useState(0);
  const [useSurveyPts, setUseSurveyPts] = useState(true);
  const [useImagery, setUseImagery] = useState(true);
  const [useOsm, setUseOsm] = useState(true);
  const [syncCl, setSyncCl] = useState(true);

  // Corridor Design state
  const [corridorName, setCorridorName] = useState('Proposed Road A');
  const [selectedClId, setSelectedClId] = useState<string>(centerlines[0]?.id ?? '');
  const [pointChainInput, setPointChainInput] = useState('');
  const [laneCount, setLaneCount] = useState(2);
  const [laneWidthFt, setLaneWidthFt] = useState(12);
  const [crownSlopePct, setCrownSlopePct] = useState(2.0);
  const [includeCurbAndGutter, setIncludeCurbAndGutter] = useState(true);
  const [curbWidthFt, setCurbWidthFt] = useState(0.5);
  const [gutterWidthFt, setGutterWidthFt] = useState(1.5);
  const [includeSidewalk, setIncludeSidewalk] = useState(true);
  const [sidewalkWidthFt, setSidewalkWidthFt] = useState(5.0);
  const [sidewalkOffsetFt, setSidewalkOffsetFt] = useState(4.0);
  const [rowWidthFt, setRowWidthFt] = useState(0);
  const [stationIntervalFt, setStationIntervalFt] = useState(50);
  const [designGradePct, setDesignGradePct] = useState<string>('-1.5');
  const [autoGenerateProfile, setAutoGenerateProfile] = useState(true);

  // Cul-de-sac / Apron state
  const [featureKind, setFeatureKind] = useState<'cul-de-sac' | 'driveway-apron' | 'intersection-fillet'>('cul-de-sac');
  const [bulbRadiusFt, setBulbRadiusFt] = useState(45);
  const [rowBulbRadiusFt, setRowBulbRadiusFt] = useState(55);
  const [drivewayWidthFt, setDrivewayWidthFt] = useState(14);
  const [atEnd, setAtEnd] = useState(true);

  // Profile & XS state
  const [sampleIntervalFt, setSampleIntervalFt] = useState(25);
  const [xsHalfWidthFt, setXsHalfWidthFt] = useState(30);

  const handleRunSynthesis = () => {
    onSynthesizeExisting({
      defaultRoadWidthFt: synthWidthFt,
      rowWidthFt: synthRowFt,
      useSurveyPoints: useSurveyPts,
      useBackgroundImagery: useImagery,
      useOsmWays: useOsm,
      syncCenterline: syncCl,
    });
  };

  const handleRunDesign = () => {
    const parsedChain = pointChainInput
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const gradeNum = parseFloat(designGradePct);
    onDesignCorridor({
      name: corridorName.trim() || 'Proposed Road A',
      centerlineId: selectedClId || undefined,
      pointNumbers: parsedChain.length >= 2 ? parsedChain : undefined,
      laneCount,
      laneWidthFt,
      crownSlopePct,
      includeCurbAndGutter,
      curbWidthFt,
      gutterWidthFt,
      includeSidewalk,
      sidewalkWidthFt,
      sidewalkOffsetFt,
      rowWidthFt,
      stationIntervalFt,
      designGradePct: Number.isFinite(gradeNum) ? gradeNum : undefined,
      autoGenerateProfile,
    });
  };

  const handleRunProfile = () => {
    const gradeNum = parseFloat(designGradePct);
    onGenerateProfileAndSections({
      centerlineId: selectedClId || undefined,
      sampleIntervalFt,
      halfWidthFt: xsHalfWidthFt,
      designGradePct: Number.isFinite(gradeNum) ? gradeNum : undefined,
    });
  };

  const handleAddFeature = () => {
    onAddTerminusOrTieIn({
      featureKind,
      centerlineId: selectedClId || undefined,
      atEnd,
      bulbRadiusFt,
      rowBulbRadiusFt,
      drivewayWidthFt,
    });
  };

  return (
    <div className="space-y-3 text-xs text-gray-200">
      {/* Header status bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2">
        <div className="flex items-center gap-2">
          <RoadIcon className="h-4 w-4 text-amber-400" />
          <span className="font-bold uppercase tracking-wider text-amber-300">Roading Studio</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-gray-400">
          <span className="rounded bg-gray-800 px-1.5 py-0.5 text-amber-200">
            {roadSurveyPointCount}/{totalPointCount} road pts
          </span>
          <span className="rounded bg-gray-800 px-1.5 py-0.5 text-purple-300">
            {centerlines.length} CL
          </span>
          {hasBackgroundImagery && (
            <span className="rounded bg-emerald-950/60 border border-emerald-500/40 px-1.5 py-0.5 text-emerald-300">
              Imagery Active
            </span>
          )}
        </div>
      </div>

      {/* Tab selector */}
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-gray-900/80 p-1 border border-gray-800">
        <button
          type="button"
          onClick={() => setActiveTab('synthesize')}
          className={`rounded-md py-1.5 text-[11px] font-bold transition ${
            activeTab === 'synthesize'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          Existing Road
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('corridor')}
          className={`rounded-md py-1.5 text-[11px] font-bold transition ${
            activeTab === 'corridor'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          Design Corridor
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`rounded-md py-1.5 text-[11px] font-bold transition ${
            activeTab === 'profile'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          Profile &amp; Tie-Ins
        </button>
      </div>

      {/* TAB 1: EXISTING ROAD SYNTHESIS */}
      {activeTab === 'synthesize' && (
        <div className="space-y-3 rounded-lg border border-gray-800 bg-gray-900/50 p-3">
          <p className="text-[11px] leading-relaxed text-gray-400">
            Synthesizes existing roads by fusing field survey shots (<code className="text-amber-300">EP</code>,{' '}
            <code className="text-amber-300">CL</code>, <code className="text-amber-300">CURB</code>,{' '}
            <code className="text-amber-300">TBC</code>), background aerial imagery pavement width calibration, and
            OpenStreetMap road geometry. All fields are optional — press Synthesize to draw immediately with the defaults
            shown.
          </p>

          <div className="space-y-1.5">
            <label className="flex items-center justify-between gap-2 rounded border border-gray-800 bg-gray-950/60 px-2.5 py-1.5">
              <span>Use Survey Points ({roadSurveyPointCount} road shots)</span>
              <input
                type="checkbox"
                checked={useSurveyPts}
                onChange={(e) => setUseSurveyPts(e.target.checked)}
                className="accent-amber-500"
              />
            </label>
            <label className="flex items-center justify-between gap-2 rounded border border-gray-800 bg-gray-950/60 px-2.5 py-1.5">
              <span>Calibrate Width from Background Imagery</span>
              <input
                type="checkbox"
                checked={useImagery}
                onChange={(e) => setUseImagery(e.target.checked)}
                className="accent-amber-500"
              />
            </label>
            <label className="flex items-center justify-between gap-2 rounded border border-gray-800 bg-gray-950/60 px-2.5 py-1.5">
              <span>Fuse OpenStreetMap Road Network</span>
              <input
                type="checkbox"
                checked={useOsm}
                onChange={(e) => setUseOsm(e.target.checked)}
                className="accent-amber-500"
              />
            </label>
            <label className="flex items-center justify-between gap-2 rounded border border-purple-500/30 bg-purple-950/20 px-2.5 py-1.5 text-purple-200">
              <span className="flex items-center gap-1.5">
                <ScaleIcon className="h-3.5 w-3.5 text-purple-400" />
                Sync Centerline to Stationing &amp; CL
              </span>
              <input
                type="checkbox"
                checked={syncCl}
                onChange={(e) => setSyncCl(e.target.checked)}
                className="accent-purple-500"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-0.5 block text-[10px] font-semibold uppercase text-gray-400">
                Fallback Cartway (ft)
              </label>
              <input
                type="number"
                min={10}
                max={120}
                value={synthWidthFt}
                onChange={(e) => setSynthWidthFt(parseFloat(e.target.value) || 24)}
                className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-gray-100 focus:border-amber-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] font-semibold uppercase text-gray-400">
                ROW Width (ft, optional · 0 = skip)
              </label>
              <input
                type="number"
                min={0}
                max={200}
                value={synthRowFt}
                onChange={(e) => setSynthRowFt(parseFloat(e.target.value) || 0)}
                className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-gray-100 focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleRunSynthesis}
            disabled={isWorking}
            className="w-full rounded-md bg-amber-600 py-2 px-4 text-xs font-bold text-white transition hover:bg-amber-500 disabled:opacity-50"
          >
            {isWorking ? 'Synthesizing Road\u2026' : '\u2728 Synthesize Existing Road'}
          </button>
        </div>
      )}

      {/* TAB 2: CORRIDOR & TYPICAL SECTION DESIGNER */}
      {activeTab === 'corridor' && (
        <div className="space-y-3 rounded-lg border border-gray-800 bg-gray-900/50 p-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-0.5 block text-[10px] font-semibold uppercase text-gray-400">
                Road Name
              </label>
              <input
                type="text"
                value={corridorName}
                onChange={(e) => setCorridorName(e.target.value)}
                placeholder="Proposed Road A"
                className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-gray-100 focus:border-amber-400 focus:outline-none"
              />
            </div>
            <div>
              <div className="mb-0.5 flex items-center justify-between">
                <label className="text-[10px] font-semibold uppercase text-gray-400">Centerline</label>
                {onOpenStationingAgent && (
                  <button
                    type="button"
                    onClick={onOpenStationingAgent}
                    className="text-[10px] text-purple-300 hover:underline"
                  >
                    PI Editor
                  </button>
                )}
              </div>
              <select
                value={selectedClId}
                onChange={(e) => setSelectedClId(e.target.value)}
                className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-gray-100 focus:border-amber-400 focus:outline-none"
              >
                <option value="">Active / Auto Centerline</option>
                {centerlines.map((cl) => (
                  <option key={cl.id} value={cl.id}>
                    {cl.name} ({cl.pis.length} PIs)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-0.5 block text-[10px] font-semibold uppercase text-gray-400">
              Or Build CL from Point Numbers (optional)
            </label>
            <input
              type="text"
              value={pointChainInput}
              onChange={(e) => setPointChainInput(e.target.value)}
              placeholder="e.g. 101, 102, 103"
              className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-gray-100 focus:border-amber-400 focus:outline-none"
            />
          </div>

          {/* Typical Section Grid */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="mb-0.5 block text-[10px] font-semibold uppercase text-gray-400">Lanes</label>
              <input
                type="number"
                min={1}
                max={8}
                value={laneCount}
                onChange={(e) => setLaneCount(parseInt(e.target.value, 10) || 2)}
                className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-100"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] font-semibold uppercase text-gray-400">Lane Width (ft)</label>
              <input
                type="number"
                step="0.5"
                min={8}
                max={20}
                value={laneWidthFt}
                onChange={(e) => setLaneWidthFt(parseFloat(e.target.value) || 12)}
                className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-100"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] font-semibold uppercase text-gray-400">Crown (%)</label>
              <input
                type="number"
                step="0.5"
                value={crownSlopePct}
                onChange={(e) => setCrownSlopePct(parseFloat(e.target.value) || 2.0)}
                className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="mb-0.5 block text-[10px] font-semibold uppercase text-gray-400">ROW Width (ft, optional · 0 = skip)</label>
              <input
                type="number"
                min={20}
                max={200}
                value={rowWidthFt}
                onChange={(e) => setRowWidthFt(parseFloat(e.target.value) || 0)}
                className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-100"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] font-semibold uppercase text-gray-400">Sta Interval (ft)</label>
              <input
                type="number"
                min={10}
                max={500}
                value={stationIntervalFt}
                onChange={(e) => setStationIntervalFt(parseFloat(e.target.value) || 50)}
                className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-100"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] font-semibold uppercase text-gray-400">Grade (%)</label>
              <input
                type="text"
                value={designGradePct}
                onChange={(e) => setDesignGradePct(e.target.value)}
                placeholder="-1.5"
                className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-100"
              />
            </div>
          </div>

          {/* Curb & Sidewalk Toggles */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between rounded border border-gray-800 bg-gray-950/60 px-2.5 py-1.5">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeCurbAndGutter}
                  onChange={(e) => setIncludeCurbAndGutter(e.target.checked)}
                  className="accent-amber-500"
                />
                <span>Curb &amp; Gutter</span>
              </label>
              {includeCurbAndGutter && (
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="text-gray-400">Gutter:</span>
                  <input
                    type="number"
                    step="0.25"
                    value={gutterWidthFt}
                    onChange={(e) => setGutterWidthFt(parseFloat(e.target.value) || 1.5)}
                    className="w-12 rounded border border-gray-700 bg-gray-900 px-1 py-0.5 text-center"
                  />
                  <span className="text-gray-400">Curb:</span>
                  <input
                    type="number"
                    step="0.25"
                    value={curbWidthFt}
                    onChange={(e) => setCurbWidthFt(parseFloat(e.target.value) || 0.5)}
                    className="w-12 rounded border border-gray-700 bg-gray-900 px-1 py-0.5 text-center"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between rounded border border-gray-800 bg-gray-950/60 px-2.5 py-1.5">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeSidewalk}
                  onChange={(e) => setIncludeSidewalk(e.target.checked)}
                  className="accent-amber-500"
                />
                <span>Sidewalks (Both Sides)</span>
              </label>
              {includeSidewalk && (
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="text-gray-400">Width:</span>
                  <input
                    type="number"
                    step="0.5"
                    value={sidewalkWidthFt}
                    onChange={(e) => setSidewalkWidthFt(parseFloat(e.target.value) || 5)}
                    className="w-12 rounded border border-gray-700 bg-gray-900 px-1 py-0.5 text-center"
                  />
                  <span className="text-gray-400">Buffer:</span>
                  <input
                    type="number"
                    step="0.5"
                    value={sidewalkOffsetFt}
                    onChange={(e) => setSidewalkOffsetFt(parseFloat(e.target.value) || 4)}
                    className="w-12 rounded border border-gray-700 bg-gray-900 px-1 py-0.5 text-center"
                  />
                </div>
              )}
            </div>

            <label className="flex items-center justify-between gap-2 rounded border border-sky-500/30 bg-sky-950/20 px-2.5 py-1.5 text-sky-200">
              <span className="flex items-center gap-1.5">
                <ProfileIcon className="h-3.5 w-3.5 text-sky-400" />
                Auto-Generate Profile via Profile Agent
              </span>
              <input
                type="checkbox"
                checked={autoGenerateProfile}
                onChange={(e) => setAutoGenerateProfile(e.target.checked)}
                className="accent-sky-500"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={handleRunDesign}
            disabled={isWorking}
            className="w-full rounded-md bg-amber-600 py-2 px-4 text-xs font-bold text-white transition hover:bg-amber-500 disabled:opacity-50"
          >
            {isWorking ? 'Designing Corridor\u2026' : `\u25B6 Generate ${laneCount * laneWidthFt}' Road Corridor`}
          </button>
        </div>
      )}

      {/* TAB 3: PROFILE, CROSS SECTIONS & TERMINUS TIE-INS */}
      {activeTab === 'profile' && (
        <div className="space-y-3">
          {/* Profile & Cross Sections */}
          <div className="space-y-2.5 rounded-lg border border-sky-500/30 bg-sky-950/15 p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-sky-300">
                <ProfileIcon className="h-4 w-4 text-sky-400" />
                Centerline Profile &amp; Cross Sections
              </span>
              {onOpenProfileView && (
                <button
                  type="button"
                  onClick={onOpenProfileView}
                  className="text-[10px] font-semibold text-sky-300 underline hover:text-white"
                >
                  Open Profile View
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-0.5 block text-[10px] font-semibold uppercase text-gray-400">
                  Sample Interval (ft)
                </label>
                <input
                  type="number"
                  min={5}
                  max={200}
                  value={sampleIntervalFt}
                  onChange={(e) => setSampleIntervalFt(parseFloat(e.target.value) || 25)}
                  className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-100"
                />
              </div>
              <div>
                <label className="mb-0.5 block text-[10px] font-semibold uppercase text-gray-400">
                  XS Half-Width (ft)
                </label>
                <input
                  type="number"
                  min={10}
                  max={150}
                  value={xsHalfWidthFt}
                  onChange={(e) => setXsHalfWidthFt(parseFloat(e.target.value) || 30)}
                  className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-100"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleRunProfile}
              disabled={isWorking}
              className="w-full rounded-md bg-sky-600 py-1.5 px-3 text-xs font-bold text-white transition hover:bg-sky-500 disabled:opacity-50"
            >
              Compute Road Profile &amp; Cross Sections
            </button>
          </div>

          {/* Cul-de-Sac / Fillet / Driveway Apron */}
          <div className="space-y-2.5 rounded-lg border border-gray-800 bg-gray-900/50 p-3">
            <span className="block text-xs font-bold text-amber-300">
              Cul-de-Sacs, Curb Fillets &amp; Driveway Aprons
            </span>
            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  ['cul-de-sac', 'Cul-de-Sac'],
                  ['driveway-apron', 'Driveway Apron'],
                  ['intersection-fillet', 'Curb Fillet'],
                ] as const
              ).map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setFeatureKind(kind)}
                  className={`rounded border py-1 text-[10px] font-semibold transition ${
                    featureKind === kind
                      ? 'border-amber-500 bg-amber-500/20 text-amber-200'
                      : 'border-gray-700 bg-gray-950 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {featureKind === 'driveway-apron' ? (
              <div>
                <label className="mb-0.5 block text-[10px] font-semibold uppercase text-gray-400">
                  Driveway Width (ft)
                </label>
                <input
                  type="number"
                  min={8}
                  max={40}
                  value={drivewayWidthFt}
                  onChange={(e) => setDrivewayWidthFt(parseFloat(e.target.value) || 14)}
                  className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-100"
                />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="mb-0.5 block text-[10px] font-semibold uppercase text-gray-400">
                    Pave R (ft)
                  </label>
                  <input
                    type="number"
                    min={15}
                    max={100}
                    value={bulbRadiusFt}
                    onChange={(e) => setBulbRadiusFt(parseFloat(e.target.value) || 45)}
                    className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-100"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] font-semibold uppercase text-gray-400">
                    ROW R (ft)
                  </label>
                  <input
                    type="number"
                    min={20}
                    max={120}
                    value={rowBulbRadiusFt}
                    onChange={(e) => setRowBulbRadiusFt(parseFloat(e.target.value) || 55)}
                    className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-100"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] font-semibold uppercase text-gray-400">
                    End
                  </label>
                  <select
                    value={atEnd ? 'end' : 'start'}
                    onChange={(e) => setAtEnd(e.target.value === 'end')}
                    className="w-full rounded border border-gray-700 bg-gray-950 px-1.5 py-1 text-xs text-gray-100"
                  >
                    <option value="end">End STA</option>
                    <option value="start">Start STA</option>
                  </select>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleAddFeature}
              disabled={isWorking}
              className="w-full rounded-md bg-amber-700 py-1.5 px-3 text-xs font-bold text-white transition hover:bg-amber-600 disabled:opacity-50"
            >
              Add {featureKind === 'cul-de-sac' ? 'Cul-de-Sac Bulb' : featureKind === 'driveway-apron' ? 'Driveway Apron' : 'Intersection Fillet'}
            </button>
          </div>
        </div>
      )}

      {/* Active Corridors Summary */}
      {roadCorridors.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-gray-900/60 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-300">
              Active Road Corridors ({roadCorridors.length})
            </span>
            {onClearCorridors && (
              <button
                type="button"
                onClick={() => onClearCorridors()}
                className="text-[10px] text-gray-400 underline hover:text-red-400"
              >
                Clear All
              </button>
            )}
          </div>
          <ul className="space-y-1 text-[11px]">
            {roadCorridors.slice(-4).map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded bg-gray-950/60 px-2 py-1">
                <span className="truncate font-medium text-gray-200">{c.name}</span>
                <span className="font-mono text-[10px] text-amber-300">
                  {c.typicalSection.laneCount * c.typicalSection.laneWidthFt}&apos;
                  {c.typicalSection.rowWidthFt > 0 ? ` / ${c.typicalSection.rowWidthFt}' ROW` : ' / ROW not set'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default RoadingPanel;
