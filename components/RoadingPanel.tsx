import React, { useEffect, useState } from 'react';
import { RoadIcon, ProfileIcon } from './icons.tsx';
import type { Centerline, RoadCorridorRun, RoadTypicalSection } from '../types.ts';

export interface RoadingPanelProps {
  /** Baselines available from Stationing & CL. A road model requires one. */
  centerlines: Centerline[];
  /** Saved road models in this session. */
  roadCorridors: RoadCorridorRun[];
  isWorking?: boolean;
  /** Draw an existing road directly from the loaded survey shots. No baseline or parameters. */
  onSynthesizeExisting?: () => void;
  /** Build and save a road model on the selected baseline. */
  onDesignCorridor: (
    params: RoadTypicalSection & {
      name: string;
      centerlineId: string;
      autoGenerateProfile: boolean;
    },
  ) => void;
  /** Trigger centerline profile & cross section generation via CACP. */
  onGenerateProfileAndSections: (params: {
    centerlineId?: string;
    sampleIntervalFt: number;
    halfWidthFt: number;
    designGradePct?: number;
  }) => void;
  /** Trigger cul-de-sac bulb, intersection fillet, or driveway apron tie-in. */
  onAddTerminusOrTieIn: (params: {
    featureKind: 'cul-de-sac' | 'driveway-apron' | 'intersection-fillet';
    centerlineId?: string;
    atEnd: boolean;
    bulbRadiusFt: number;
    rowBulbRadiusFt: number;
    drivewayWidthFt: number;
  }) => void;
  onClearCorridors?: (corridorId?: string) => void;
  onOpenStationingAgent?: () => void;
  onOpenProfileView?: () => void;
  initialTab?: 'model' | 'profile';
}

/**
 * Roading Studio: road parameters and saved models.
 *
 * This panel intentionally has no "draft from survey points" mode. Existing
 * road linework from field shots belongs to the Civil Drafter; Roading builds
 * a parametric model on a Centerline baseline. Editing that baseline rebuilds
 * the model's edge/curb/sidewalk/ROW linework.
 */
export const RoadingPanel: React.FC<RoadingPanelProps> = ({
  centerlines,
  roadCorridors,
  isWorking = false,
  onSynthesizeExisting,
  onDesignCorridor,
  onGenerateProfileAndSections,
  onAddTerminusOrTieIn,
  onClearCorridors,
  onOpenStationingAgent,
  onOpenProfileView,
  initialTab = 'model',
}) => {
  const [activeTab, setActiveTab] = useState<'model' | 'profile'>(initialTab);

  const [modelName, setModelName] = useState('Proposed Road A');
  const [selectedClId, setSelectedClId] = useState(centerlines[0]?.id ?? '');
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
  const [designGradePct, setDesignGradePct] = useState('-1.5');
  const [autoGenerateProfile, setAutoGenerateProfile] = useState(true);

  const [featureKind, setFeatureKind] = useState<'cul-de-sac' | 'driveway-apron' | 'intersection-fillet'>('cul-de-sac');
  const [bulbRadiusFt, setBulbRadiusFt] = useState(45);
  const [rowBulbRadiusFt, setRowBulbRadiusFt] = useState(55);
  const [drivewayWidthFt, setDrivewayWidthFt] = useState(14);
  const [atEnd, setAtEnd] = useState(true);

  const [sampleIntervalFt, setSampleIntervalFt] = useState(25);
  const [xsHalfWidthFt, setXsHalfWidthFt] = useState(30);

  useEffect(() => {
    if (!centerlines.some(cl => cl.id === selectedClId)) {
      setSelectedClId(centerlines[0]?.id ?? '');
    }
  }, [centerlines, selectedClId]);

  const selectedBaseline = centerlines.find(cl => cl.id === selectedClId);
  const canBuild = Boolean(selectedBaseline) && !isWorking;

  const handleBuildModel = () => {
    if (!selectedBaseline) return;
    const gradeNum = parseFloat(designGradePct);
    onDesignCorridor({
      name: modelName.trim() || 'Proposed Road A',
      centerlineId: selectedBaseline.id,
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
      centerlineId: selectedBaseline?.id,
      sampleIntervalFt,
      halfWidthFt: xsHalfWidthFt,
      designGradePct: Number.isFinite(gradeNum) ? gradeNum : undefined,
    });
  };

  const handleAddFeature = () => {
    onAddTerminusOrTieIn({
      featureKind,
      centerlineId: selectedBaseline?.id,
      atEnd,
      bulbRadiusFt,
      rowBulbRadiusFt,
      drivewayWidthFt,
    });
  };

  return (
    <div className="space-y-3 text-xs text-gray-200">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2">
        <div className="flex items-center gap-2">
          <RoadIcon className="h-4 w-4 text-amber-400" />
          <span className="font-bold uppercase tracking-wider text-amber-300">Road Models</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-gray-400">
          <span className="rounded bg-gray-800 px-1.5 py-0.5 text-purple-300">
            {centerlines.length} baseline{centerlines.length === 1 ? '' : 's'}
          </span>
          <span className="rounded bg-emerald-950/60 border border-emerald-500/40 px-1.5 py-0.5 text-emerald-300">
            Points + Models
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-900/80 p-1 border border-gray-800">
        <button
          type="button"
          onClick={() => setActiveTab('model')}
          className={`rounded-md py-1.5 text-[11px] font-bold transition ${
            activeTab === 'model'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          Road Model
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

      {activeTab === 'model' && (
        <div className="space-y-3 rounded-lg border border-gray-800 bg-gray-900/50 p-3">
          <p className="text-[11px] leading-relaxed text-gray-400">
            Draw an existing road directly from the loaded survey shots, or build a saved parametric
            model on a Stationing &amp; CL baseline below. Existing-road drawing needs no baseline and
            no parameters; model offsets follow the baseline when it is edited.
          </p>

          {onSynthesizeExisting && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5">
              <button
                type="button"
                onClick={onSynthesizeExisting}
                disabled={isWorking}
                className="w-full rounded-md bg-amber-600 py-2 px-4 text-xs font-bold text-white transition hover:bg-amber-500 disabled:opacity-50"
              >
                {isWorking ? 'Drawing Road…' : 'Draw Road from Survey Points'}
              </button>
              <p className="mt-1.5 text-[10px] leading-relaxed text-amber-200/80">
                One click, no parameters. Reads EP, EOP, CL, CURB, TBC and ROW shots; optional
                imagery and OSM refine the width and street name.
              </p>
            </div>
          )}

          {centerlines.length === 0 ? (
            <div className="rounded border border-slate-700 bg-slate-900/60 p-2.5 text-[11px] text-slate-300">
              No baseline loaded. Survey-point drawing still works above. For a parametric model,
              draw or import a Centerline in Stationing &amp; CL first.
              {onOpenStationingAgent && (
                <button
                  type="button"
                  onClick={onOpenStationingAgent}
                  className="mt-2 block rounded bg-purple-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-purple-500"
                >
                  Open Stationing &amp; CL
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-0.5 block text-[10px] font-semibold uppercase text-gray-400">
                    Road / Model Name
                  </label>
                  <input
                    type="text"
                    value={modelName}
                    onChange={e => setModelName(e.target.value)}
                    placeholder="Proposed Road A"
                    className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-gray-100 focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <div>
                  <div className="mb-0.5 flex items-center justify-between">
                    <label className="text-[10px] font-semibold uppercase text-gray-400">Baseline</label>
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
                    onChange={e => setSelectedClId(e.target.value)}
                    className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-gray-100 focus:border-amber-400 focus:outline-none"
                  >
                    {centerlines.map(cl => (
                      <option key={cl.id} value={cl.id}>
                        {cl.name} ({cl.pis.length} PIs)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="mb-0.5 block text-[10px] font-semibold uppercase text-gray-400">Lanes</label>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={laneCount}
                    onChange={e => setLaneCount(parseInt(e.target.value, 10) || 2)}
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
                    onChange={e => setLaneWidthFt(parseFloat(e.target.value) || 12)}
                    className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-100"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] font-semibold uppercase text-gray-400">Crown (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={crownSlopePct}
                    onChange={e => setCrownSlopePct(parseFloat(e.target.value) || 2)}
                    className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="mb-0.5 block text-[10px] font-semibold uppercase text-gray-400">ROW Width (ft, 0 = skip)</label>
                  <input
                    type="number"
                    min={0}
                    max={200}
                    value={rowWidthFt}
                    onChange={e => setRowWidthFt(parseFloat(e.target.value) || 0)}
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
                    onChange={e => setStationIntervalFt(parseFloat(e.target.value) || 50)}
                    className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-100"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] font-semibold uppercase text-gray-400">Grade (%)</label>
                  <input
                    type="text"
                    value={designGradePct}
                    onChange={e => setDesignGradePct(e.target.value)}
                    placeholder="-1.5"
                    className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-100"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between rounded border border-gray-800 bg-gray-950/60 px-2.5 py-1.5">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={includeCurbAndGutter}
                      onChange={e => setIncludeCurbAndGutter(e.target.checked)}
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
                        onChange={e => setGutterWidthFt(parseFloat(e.target.value) || 1.5)}
                        className="w-12 rounded border border-gray-700 bg-gray-900 px-1 py-0.5 text-center"
                      />
                      <span className="text-gray-400">Curb:</span>
                      <input
                        type="number"
                        step="0.25"
                        value={curbWidthFt}
                        onChange={e => setCurbWidthFt(parseFloat(e.target.value) || 0.5)}
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
                      onChange={e => setIncludeSidewalk(e.target.checked)}
                      className="accent-amber-500"
                    />
                    <span>Sidewalks (both sides)</span>
                  </label>
                  {includeSidewalk && (
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className="text-gray-400">Width:</span>
                      <input
                        type="number"
                        step="0.5"
                        value={sidewalkWidthFt}
                        onChange={e => setSidewalkWidthFt(parseFloat(e.target.value) || 5)}
                        className="w-12 rounded border border-gray-700 bg-gray-900 px-1 py-0.5 text-center"
                      />
                      <span className="text-gray-400">Buffer:</span>
                      <input
                        type="number"
                        step="0.5"
                        value={sidewalkOffsetFt}
                        onChange={e => setSidewalkOffsetFt(parseFloat(e.target.value) || 4)}
                        className="w-12 rounded border border-gray-700 bg-gray-900 px-1 py-0.5 text-center"
                      />
                    </div>
                  )}
                </div>

                <label className="flex items-center justify-between gap-2 rounded border border-sky-500/30 bg-sky-950/20 px-2.5 py-1.5 text-sky-200">
                  <span className="flex items-center gap-1.5">
                    <ProfileIcon className="h-3.5 w-3.5 text-sky-400" />
                    Auto-generate profile
                  </span>
                  <input
                    type="checkbox"
                    checked={autoGenerateProfile}
                    onChange={e => setAutoGenerateProfile(e.target.checked)}
                    className="accent-sky-500"
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={handleBuildModel}
                disabled={!canBuild}
                className="w-full rounded-md bg-amber-600 py-2 px-4 text-xs font-bold text-white transition hover:bg-amber-500 disabled:opacity-50"
              >
                {isWorking ? 'Building Road Model…' : `Build ${laneCount * laneWidthFt}' Road Model`}
              </button>
            </>
          )}
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="space-y-3">
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
                  onChange={e => setSampleIntervalFt(parseFloat(e.target.value) || 25)}
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
                  onChange={e => setXsHalfWidthFt(parseFloat(e.target.value) || 30)}
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
                  onChange={e => setDrivewayWidthFt(parseFloat(e.target.value) || 14)}
                  className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-100"
                />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="mb-0.5 block text-[10px] font-semibold uppercase text-gray-400">Pave R (ft)</label>
                  <input
                    type="number"
                    min={15}
                    max={100}
                    value={bulbRadiusFt}
                    onChange={e => setBulbRadiusFt(parseFloat(e.target.value) || 45)}
                    className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-100"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] font-semibold uppercase text-gray-400">ROW R (ft)</label>
                  <input
                    type="number"
                    min={20}
                    max={120}
                    value={rowBulbRadiusFt}
                    onChange={e => setRowBulbRadiusFt(parseFloat(e.target.value) || 55)}
                    className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-100"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] font-semibold uppercase text-gray-400">End</label>
                  <select
                    value={atEnd ? 'end' : 'start'}
                    onChange={e => setAtEnd(e.target.value === 'end')}
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

      {roadCorridors.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-gray-900/60 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-300">
              Saved Road Models ({roadCorridors.length})
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
            {roadCorridors.slice(-4).map(c => (
              <li key={c.id} className="flex items-center justify-between rounded bg-gray-950/60 px-2 py-1">
                <span className="truncate font-medium text-gray-200">{c.name}</span>
                <span className="font-mono text-[10px] text-amber-300">
                  {c.typicalSection.laneCount * c.typicalSection.laneWidthFt}'
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
