import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  FileUp,
  Printer,
  Search,
  X,
} from 'lucide-react';
import { exampleFileContent, exampleFileName } from '../../assets/example.raw';
import { DEMO_RW5_FILE } from '../../services/rawReplay/parser';
import type { RawSummaryRow } from '../../services/rawReplay/summary';
import { RAW_REPLAY_ACCEPT, type EquipmentKind } from '../../services/rawReplay/types';
import { gnssReferenceLabel } from '../../services/rawReplay/baseStations';
import {
  formatDuration,
  type Basemap3DType,
  type CameraFollowMode,
  type EquipmentScaleMode,
  equipmentKindLabel,
  type PointLabelMode,
  type RawReplayController,
  type ReplayMotionMode,
  RAW_REPLAY_EQUIPMENT_KINDS,
  RAW_REPLAY_LINE_TYPES,
  RAW_REPLAY_MARKER_SHAPES,
  type SightRayMode,
  traceEquipmentStyleFor,
} from './useRawReplayController';

interface RawReplayToolPanelProps {
  controller: RawReplayController;
  onRawFileChange: (file: { name: string; content: string }) => void;
  onClose: () => void;
}

type ToolPanelTab = 'summary' | 'shots' | 'settings' | 'style' | 'qa';

const IconButton = ({
  label,
  onClick,
  children,
  disabled = false,
  active = false,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  active?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={label}
    aria-label={label}
    className={`flex h-7 w-7 items-center justify-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-35 ${
      active
        ? 'border-cyan-300/45 bg-cyan-300/15 text-cyan-100'
        : 'border-white/[0.09] bg-white/[0.035] text-slate-400 hover:border-cyan-300/30 hover:bg-cyan-300/[0.07] hover:text-cyan-100'
    }`}
  >
    {children}
  </button>
);

const ToggleChip = ({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-[10px] transition ${
      active
        ? 'border-cyan-300/30 bg-cyan-300/[0.07] text-cyan-100'
        : 'border-white/[0.07] bg-white/[0.02] text-slate-500 hover:border-white/[0.14] hover:text-slate-300'
    }`}
  >
    <span>{label}</span>
    <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-cyan-300' : 'bg-slate-700'}`} />
  </button>
);

const StyleRange = ({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
  ariaLabel,
  accent = 'accent-cyan-300',
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  ariaLabel: string;
  accent?: string;
}) => (
  <label className="block text-[10px] text-slate-400">
    <div className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <span className="font-mono text-slate-300">{display}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={event => onChange(Number(event.target.value))}
      className={`mt-1 h-1.5 w-full cursor-pointer ${accent}`}
      aria-label={ariaLabel}
    />
  </label>
);

const StyleSelect = <T extends string>({
  label,
  value,
  options,
  onChange,
  ariaLabel,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  ariaLabel: string;
}) => (
  <label className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
    <span>{label}</span>
    <select
      value={value}
      onChange={event => onChange(event.target.value as T)}
      className="max-w-[58%] rounded border border-white/10 bg-[#070c12] px-2 py-1 text-[10px] text-slate-200 outline-none"
      aria-label={ariaLabel}
    >
      {options.map(option => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  </label>
);

const StyleColor = ({
  label,
  value,
  onChange,
  ariaLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) => (
  <label className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
    <span>{label}</span>
    <span className="flex items-center gap-1.5">
      <span className="font-mono text-[9px] uppercase text-slate-500">{value}</span>
      <input
        type="color"
        value={value}
        onChange={event => onChange(event.target.value)}
        className="h-6 w-8 cursor-pointer rounded border border-white/15 bg-transparent p-0.5"
        aria-label={ariaLabel}
      />
    </span>
  </label>
);

const LINE_TYPE_OPTIONS = RAW_REPLAY_LINE_TYPES.map(value => ({
  value,
  label: value === 'dash-dot' ? 'Dash-dot' : value.charAt(0).toUpperCase() + value.slice(1),
}));

const SummarySection = ({ title, rows, live = false }: { title: string; rows: RawSummaryRow[]; live?: boolean }) => (
  <section className="border-t border-white/[0.06] px-3 py-3">
    <div className="mb-2 flex items-center gap-2">
      <h3 className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</h3>
      {live && <span className="rounded border border-cyan-300/15 bg-cyan-300/[0.04] px-1 py-px text-[7px] font-semibold uppercase tracking-[0.12em] text-cyan-200/55">Live</span>}
    </div>
    <dl className="space-y-1.5">
      {rows.map(row => (
        <div
          key={`${row.label}-${row.value}`}
          className={`summary-live-row grid grid-cols-[1fr_auto] gap-3 rounded text-[10px] leading-4 ${live ? '-mx-1 px-1' : ''}`}
        >
          <dt className="text-slate-500">{row.label}</dt>
          <dd className="text-right font-medium text-slate-300">
            {row.value}
            {row.note && <span className="block text-[8px] font-normal text-slate-600">{row.note}</span>}
          </dd>
        </div>
      ))}
    </dl>
  </section>
);

export default function RawReplayToolPanel({ controller, onRawFileChange, onClose }: RawReplayToolPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = useState<ToolPanelTab>('summary');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const styleSettings = controller.styleSettings;
  const updateStyleSettings = controller.updateStyleSettings;
  const resetStyleSettings = controller.resetStyleSettings;
  const updateTraceEquipmentStyle = controller.updateTraceEquipmentStyle;

  const {
    rawFile,
    survey,
    parseError,
    loading,
    playhead,
    currentSetup,
    observations,
    cameraFollowMode,
    setCameraFollowMode,
    verticalExaggeration,
    setVerticalExaggeration,
    equipmentScaleMode,
    setEquipmentScaleMode,
    motionMode,
    setMotionMode,
    pointLabelMode,
    setPointLabelMode,
    traceColorMode,
    setTraceColorMode,
    sightRayMode,
    setSightRayMode,
    seek,
    jumpToSetup,
    equipmentOverride,
    setEquipmentOverride,
    showSurveyLines,
    setShowSurveyLines,
    showProjectLines,
    setShowProjectLines,
    showTraverse,
    setShowTraverse,
    showTin,
    setShowTin,
    showTinWireframe,
    setShowTinWireframe,
    showContours,
    setShowContours,
    showSightRays,
    setShowSightRays,
    showTower,
    setShowTower,
    showGrid,
    setShowGrid,
    gridSpacing,
    setGridSpacing,
    gridOpacity,
    setGridOpacity,
    showBasemap,
    setShowBasemap,
    basemapType,
    setBasemapType,
    basemapOpacity,
    setBasemapOpacity,
    searchQuery,
    setSearchQuery,
    selectedSetupFilter,
    setSelectedSetupFilter,
    filteredObservations,
    setupSummaries,
    importOpen,
    setImportOpen,
    importOptions,
    setImportOptions,
    confirmImport,
    flash,
    base,
    summary,
    finalSummary,
    liveObservationCount,
    liveSetups,
    livePoints,
    requestFocusCurrentShot,
  } = controller;

  const equipmentInFile = useMemo(() => {
    if (!survey) return [] as Array<{ kind: EquipmentKind; count: number }>;
    const counts = new Map<EquipmentKind, number>();
    survey.setups.forEach(setup => {
      counts.set(setup.equipment, (counts.get(setup.equipment) ?? 0) + 1);
    });
    return RAW_REPLAY_EQUIPMENT_KINDS
      .filter(kind => counts.has(kind))
      .map(kind => ({ kind, count: counts.get(kind) ?? 0 }));
  }, [survey]);

  const handleFileInput = async (file: File | undefined) => {
    if (!file) return;
    const content = await file.text();
    if (!content.trim()) return;
    onRawFileChange({ name: file.name, content });
  };

  if (!rawFile) {
    return (
      <div className="flex h-full flex-col justify-center overflow-y-auto p-4">
        <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/[0.03] p-4">
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-cyan-300/80">Raw Replay 3D Agent</p>
          <h2 className="mt-1 text-sm font-semibold text-slate-100">Load a field survey record</h2>
          <p className="mt-2 text-[10px] leading-5 text-slate-400">
            Reconstruct Total Station and GNSS RTK surveys in 3D with articulated instruments, sight rays, terrain draping, and a deterministic QA summary.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept={RAW_REPLAY_ACCEPT}
            className="hidden"
            onChange={async event => {
              await handleFileInput(event.target.files?.[0]);
              event.currentTarget.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-3 w-full rounded-md bg-cyan-300 px-3 py-2 text-[10px] font-semibold text-slate-950 transition hover:bg-cyan-200"
          >
            Choose Raw File (.rw5, .raw, .fbk, .gsi)
          </button>

          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => onRawFileChange(DEMO_RW5_FILE)}
              className="rounded border border-cyan-300/25 bg-cyan-300/[0.06] px-2 py-1.5 text-[9px] font-medium text-cyan-100 hover:bg-cyan-300/[0.12]"
            >
              Load Demo RW5 (TS + RTK)
            </button>
            <button
              type="button"
              onClick={() => onRawFileChange({ name: exampleFileName, content: exampleFileContent })}
              className="rounded border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[9px] font-medium text-slate-300 hover:bg-white/[0.07]"
            >
              Load Subdivision Sample
            </button>
          </div>

          <button
            type="button"
            onClick={() => setPasteOpen(v => !v)}
            className="mt-2 w-full rounded border border-white/10 px-2 py-1 text-[9px] text-slate-400 hover:text-slate-200"
          >
            {pasteOpen ? 'Hide Paste Text' : 'Paste Raw Field Records…'}
          </button>

          {pasteOpen && (
            <div className="mt-2 space-y-1.5">
              <textarea
                rows={5}
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder="Paste RW5, TDS, GSI, or SP,PN... records here"
                className="w-full rounded border border-white/15 bg-slate-950 p-2 font-mono text-[9px] text-slate-200 outline-none focus:border-cyan-300/50"
              />
              <button
                type="button"
                disabled={!pasteText.trim()}
                onClick={() => {
                  onRawFileChange({ name: 'pasted_survey.rw5', content: pasteText });
                  setPasteOpen(false);
                }}
                className="w-full rounded bg-emerald-400 py-1.5 text-[10px] font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-40"
              >
                Parse Pasted Records
              </button>
            </div>
          )}

          <p className="mt-2 text-center text-[8px] text-slate-600">
            Read-only until you explicitly add data to the project
          </p>
        </div>
        <button type="button" onClick={onClose} className="mt-3 text-center text-[9px] text-slate-600 hover:text-slate-400">
          Close Raw Replay
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0a0f16] text-slate-200">
      <style>{`
        @keyframes rawSummaryPulse {
          0% { background-color: rgba(34, 211, 238, 0.14); }
          100% { background-color: transparent; }
        }
        .summary-live-row { animation: rawSummaryPulse 850ms ease-out; }
      `}</style>

      <input
        ref={fileInputRef}
        type="file"
        accept={RAW_REPLAY_ACCEPT}
        className="hidden"
        onChange={async event => {
          await handleFileInput(event.target.files?.[0]);
          event.currentTarget.value = '';
        }}
      />

      {/* Panel Header */}
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-white/[0.07] px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200/80">Raw Replay</span>
            <span className="rounded border border-cyan-300/20 bg-cyan-300/[0.06] px-1 py-px text-[8px] uppercase tracking-wide text-cyan-200">
              {summary?.formatLabel ?? '3D'}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[10px] text-slate-400" title={rawFile.name}>{rawFile.name}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton label="Load another raw file" onClick={() => fileInputRef.current?.click()}>
            <FileUp className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="Load Demo RW5 (TS + RTK)" onClick={() => onRawFileChange(DEMO_RW5_FILE)}>
            <span className="text-[8px] font-bold">RW5</span>
          </IconButton>
          <IconButton label="Print field summary report" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="Close replay" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2 text-[10px] text-slate-400">
          <span className="h-3 w-3 animate-spin rounded-full border border-cyan-300 border-t-transparent" />
          Reading field record…
        </div>
      )}
      {parseError && (
        <div className="border-b border-rose-300/15 bg-rose-300/[0.04] px-3 py-2 text-[10px] leading-4 text-rose-100/75">
          {parseError}
        </div>
      )}
      {flash && (
        <div className="border-b border-emerald-300/15 bg-emerald-300/[0.05] px-3 py-2 text-[10px] leading-4 text-emerald-100/80">
          {flash}
        </div>
      )}

      {survey && summary && (
        <>
          {/* Playback transport lives on the canvas bar, not in this panel. */}
          {/* Sub-Navigation Tabs */}
          <div className="grid shrink-0 grid-cols-5 border-b border-white/[0.07] bg-[#080d13] text-[9px] font-semibold uppercase tracking-[0.12em]">
            {([
              ['summary', 'Summary'],
              ['shots', `Shots (${observations.length})`],
              ['settings', '3D & Map'],
              ['style', 'Style'],
              ['qa', `QA (${summary.qualityScore})`],
            ] as Array<[ToolPanelTab, string]>).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`border-b-2 py-2 text-center transition ${
                  activeTab === id
                    ? 'border-cyan-300 bg-cyan-300/[0.06] text-cyan-100'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Tab Content Body */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {activeTab === 'summary' && (
              <>
                <section className="border-b border-white/[0.06] px-3 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-cyan-200/70">Live field narrative</p>
                      <p className="mt-0.5 text-[10px] text-slate-500">{summary.generatedFrom}</p>
                    </div>
                    <span className={`shrink-0 rounded border px-1.5 py-1 text-center ${
                      summary.qualityTone === 'good'
                        ? 'border-emerald-300/30 bg-emerald-300/[0.08] text-emerald-200'
                        : summary.qualityTone === 'caution'
                          ? 'border-amber-300/30 bg-amber-300/[0.08] text-amber-200'
                          : 'border-rose-300/30 bg-rose-300/[0.08] text-rose-200'
                    }`}>
                      <span className="block text-[11px] font-semibold leading-none">{summary.qualityScore}</span>
                      <span className="mt-0.5 block text-[7px] uppercase tracking-wide opacity-80">{summary.qualityLabel}</span>
                    </span>
                  </div>

                  <div className="mt-2 rounded border border-cyan-300/15 bg-cyan-300/[0.035] p-2">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9px] text-slate-500">
                      <span>Observed <b className="float-right font-mono font-medium text-slate-200">{liveObservationCount}</b> <span className="text-slate-600">/ {observations.length}</span></span>
                      <span>Setups <b className="float-right font-mono font-medium text-slate-200">{liveSetups}</b> <span className="text-slate-600">/ {survey.setups.length}</span></span>
                      <span>Points <b className="float-right font-mono font-medium text-slate-200">{livePoints}</b> <span className="text-slate-600">/ {survey.stats.uniquePointCount}</span></span>
                      <span>Window <b className="float-right font-mono font-medium text-slate-200">{formatDuration(survey.stats.fieldSpanMs)}</b></span>
                    </div>
                  </div>

                  <div className="mt-2.5 space-y-1.5 text-[10px] leading-4 text-slate-300">
                    {summary.narrative.map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                  </div>
                </section>

                <SummarySection title="Job Metadata" rows={summary.jobRows} />
                <SummarySection title="Equipment" rows={summary.equipmentRows} live />
                <SummarySection title="Production" rows={summary.productionRows} live />

                {base && (
                  <section className="border-t border-white/[0.06] px-3 py-3">
                    <h3 className="mb-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">Base station / NTRIP</h3>
                    <div className="rounded border border-white/[0.07] bg-white/[0.02] p-2 text-[10px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-200">{base.label}</span>
                        <span className={`text-[8px] uppercase tracking-wide ${base.approximate ? 'text-amber-200/80' : 'text-emerald-200/80'}`}>
                          {base.approximate ? 'Approximate' : 'From file'}
                        </span>
                      </div>
                      <div className="mt-1 text-[8px] uppercase tracking-wide text-cyan-300/70">{gnssReferenceLabel(base.reference)}</div>
                      <div className="mt-1 flex gap-3 font-mono text-slate-400">
                        <span>Azimuth {base.bearingDeg.toFixed(0)}°</span>
                        <span>Dist {(base.distanceM / 1000).toFixed(base.distanceM >= 10000 ? 0 : 1)} km</span>
                      </div>
                      <p className="mt-1 text-[8px] leading-4 text-slate-500">{base.note}</p>
                    </div>
                  </section>
                )}
              </>
            )}

            {activeTab === 'shots' && (
              <div className="p-3">
                {/* Instrument Setups Quick Jump */}
                <h3 className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Instrument Setups ({setupSummaries.length})
                </h3>
                <div className="space-y-1">
                  {setupSummaries.map(item => {
                    const isCurrent = currentSetup?.id === item.setup.id;
                    return (
                      <button
                        key={item.setup.id}
                        type="button"
                        onClick={() => jumpToSetup(item.setup.id)}
                        className={`flex w-full items-center justify-between rounded border px-2.5 py-1.5 text-left text-[10px] transition ${
                          isCurrent
                            ? 'border-amber-300/45 bg-amber-300/10 text-amber-100'
                            : 'border-white/[0.07] bg-white/[0.02] text-slate-300 hover:border-white/15'
                        }`}
                      >
                        <div>
                          <div className="font-semibold">
                            Setup {item.setup.sequence + 1}
                            {item.setup.occupyPoint ? ` · OP ${item.setup.occupyPoint}` : ''}
                          </div>
                          <div className="text-[8px] uppercase tracking-wider text-slate-500">
                            {item.equipment.replace('-', ' ')}
                            {item.setup.backsightPoint ? ` · BS ${item.setup.backsightPoint}` : ''}
                          </div>
                        </div>
                        <div className="text-right font-mono text-[9px] text-slate-400">
                          <div>{item.shotCount} shots</div>
                          <div className="text-[8px] text-slate-600">#{item.firstIndex + 1}–{item.lastIndex + 1}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Search & Filter Observations */}
                <div className="mt-3 border-t border-white/[0.06] pt-3">
                  <div className="flex items-center gap-1.5">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search PN or description…"
                        className="w-full rounded border border-white/10 bg-[#070c12] py-1 pl-6 pr-2 text-[10px] text-slate-200 outline-none focus:border-cyan-300/40"
                      />
                    </div>
                    <select
                      value={selectedSetupFilter}
                      onChange={e => setSelectedSetupFilter(e.target.value)}
                      className="rounded border border-white/10 bg-[#070c12] px-1.5 py-1 text-[10px] text-slate-300 outline-none"
                    >
                      <option value="all">All setups</option>
                      {survey.setups.map(s => (
                        <option key={s.id} value={s.id}>Setup {s.sequence + 1}</option>
                      ))}
                    </select>
                  </div>

                  <div className="mt-2 max-h-72 space-y-1 overflow-y-auto pr-0.5">
                    {filteredObservations.slice(0, 200).map(({ observation: obs, index }) => {
                      const active = index === playhead;
                      return (
                        <button
                          key={obs.id}
                          type="button"
                          onClick={() => {
                            seek(index);
                            requestFocusCurrentShot();
                          }}
                          className={`flex w-full items-center justify-between rounded border px-2 py-1 text-left text-[9px] transition ${
                            active
                              ? 'border-cyan-300/50 bg-cyan-300/12 text-cyan-100'
                              : 'border-white/[0.05] bg-white/[0.015] text-slate-400 hover:border-white/15 hover:text-slate-200'
                          }`}
                        >
                          <div className="min-w-0 truncate">
                            <span className="font-mono font-semibold text-slate-200">
                              {obs.pointNumber ? `PN ${obs.pointNumber}` : `#${obs.sequence}`}
                            </span>
                            {obs.description ? <span className="text-slate-500"> · {obs.description}</span> : null}
                          </div>
                          <span className="ml-2 shrink-0 font-mono text-[8px] text-slate-500">
                            {obs.elevation != null ? `EL ${obs.elevation.toFixed(1)}` : '2D'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="space-y-3 p-3">
                <section>
                  <h3 className="mb-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">3D Scene Layers</h3>
                  <div className="grid grid-cols-2 gap-1.5">
                    <ToggleChip active={showSurveyLines} onClick={() => setShowSurveyLines(!showSurveyLines)} label="Survey trace" />
                    <ToggleChip active={showProjectLines} onClick={() => setShowProjectLines(!showProjectLines)} label="Project linework" />
                    <ToggleChip active={showContours} onClick={() => setShowContours(!showContours)} label="Contour lines" />
                    <ToggleChip active={showTin} onClick={() => setShowTin(!showTin)} label="TIN terrain" />
                    <ToggleChip active={showTinWireframe} onClick={() => setShowTinWireframe(!showTinWireframe)} label="TIN wireframe" />
                    <ToggleChip active={showTraverse} onClick={() => setShowTraverse(!showTraverse)} label="Traverse path" />
                    <ToggleChip active={showSightRays} onClick={() => setShowSightRays(!showSightRays)} label="Sight rays" />
                    <ToggleChip active={showTower} onClick={() => setShowTower(!showTower)} label="Base tower" />
                    <ToggleChip active={showGrid} onClick={() => setShowGrid(!showGrid)} label="CAD grid" />
                  </div>
                </section>

                <section className="border-t border-white/[0.06] pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">CAD Grid</h3>
                    <input
                      type="checkbox"
                      checked={showGrid}
                      onChange={e => setShowGrid(e.target.checked)}
                      className="accent-cyan-400"
                    />
                  </div>
                  <div className="space-y-2 text-[10px]">
                    <label className="block text-slate-400">
                      <div className="flex justify-between">
                        <span>Grid spacing</span>
                        <span className="font-mono text-slate-300">{gridSpacing.toFixed(2)}×</span>
                      </div>
                      <input
                        type="range"
                        min={0.25}
                        max={4}
                        step={0.25}
                        value={gridSpacing}
                        onChange={e => setGridSpacing(Number(e.target.value))}
                        className="mt-1 h-1.5 w-full cursor-pointer accent-cyan-400"
                      />
                    </label>
                    <label className="block text-slate-400">
                      <div className="flex justify-between">
                        <span>Grid opacity</span>
                        <span className="font-mono text-slate-300">{Math.round(gridOpacity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0.05}
                        max={1}
                        step={0.05}
                        value={gridOpacity}
                        onChange={e => setGridOpacity(Number(e.target.value))}
                        className="mt-1 h-1.5 w-full cursor-pointer accent-cyan-400"
                      />
                    </label>
                  </div>
                </section>

                <section className="border-t border-white/[0.06] pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-300/80">3D Background Map & Draping</h3>
                    <input
                      type="checkbox"
                      checked={showBasemap}
                      onChange={e => setShowBasemap(e.target.checked)}
                      className="accent-emerald-400"
                    />
                  </div>
                  <div className="space-y-2 text-[10px]">
                    <label className="flex items-center justify-between text-slate-400">
                      <span>Imagery Source</span>
                      <select
                        value={basemapType}
                        onChange={e => setBasemapType(e.target.value as Basemap3DType)}
                        className="rounded border border-white/10 bg-[#070c12] px-2 py-1 text-[10px] text-slate-200 outline-none"
                      >
                        <option value="naip">USGS NAIP Aerial</option>
                        <option value="hybrid">Google Hybrid</option>
                        <option value="satellite">Google Satellite</option>
                        <option value="terrain">Terrain Shaded</option>
                        <option value="roadmap">Street Roadmap</option>
                      </select>
                    </label>
                    <label className="block text-slate-400">
                      <div className="flex justify-between">
                        <span>Map Opacity</span>
                        <span className="font-mono text-slate-300">{Math.round(basemapOpacity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0.15}
                        max={1}
                        step={0.05}
                        value={basemapOpacity}
                        onChange={e => setBasemapOpacity(Number(e.target.value))}
                        className="mt-1 h-1.5 w-full cursor-pointer accent-emerald-400"
                      />
                    </label>
                  </div>
                </section>

                <section className="border-t border-white/[0.06] pt-3">
                  <h3 className="mb-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">Equipment & 3D Display</h3>
                  <div className="space-y-2 text-[10px]">
                    <label className="flex items-center justify-between text-slate-400">
                      <span>Instrument Model</span>
                      <select
                        value={equipmentOverride}
                        onChange={e => setEquipmentOverride(e.target.value as RawReplayController['equipmentOverride'])}
                        className="rounded border border-white/10 bg-[#070c12] px-2 py-1 text-[10px] text-slate-200 outline-none"
                      >
                        <option value="auto">Auto per setup</option>
                        <option value="total-station">Total Station + Prism</option>
                        <option value="gnss-rover">GNSS base + rover</option>
                      </select>
                    </label>

                    <p className="text-[8px] leading-4 text-slate-500">GNSS sessions are base + rover only. A total station is never rendered for GNSS epochs.</p>

                    <label className="flex items-center justify-between text-slate-400">
                      <span>3D Rig Scale</span>
                      <select
                        value={equipmentScaleMode}
                        onChange={e => setEquipmentScaleMode(e.target.value as EquipmentScaleMode)}
                        className="rounded border border-white/10 bg-[#070c12] px-2 py-1 text-[10px] text-slate-200 outline-none"
                      >
                        <option value="auto">Auto-Readable</option>
                        <option value="true">True 1:1 Scale</option>
                        <option value="2x">2× Enhanced</option>
                        <option value="4x">4× Enhanced</option>
                      </select>
                    </label>

                    <label className="flex items-center justify-between text-slate-400">
                      <span>Pole Motion</span>
                      <select
                        value={motionMode}
                        onChange={e => setMotionMode(e.target.value as ReplayMotionMode)}
                        className="rounded border border-white/10 bg-[#070c12] px-2 py-1 text-[10px] text-slate-200 outline-none"
                      >
                        <option value="glide">Smooth Glide + Arc</option>
                        <option value="step">Instant Step</option>
                      </select>
                    </label>

                    <label className="flex items-center justify-between text-slate-400">
                      <span>Camera Tracking</span>
                      <select
                        value={cameraFollowMode}
                        onChange={e => setCameraFollowMode(e.target.value as CameraFollowMode)}
                        className="rounded border border-white/10 bg-[#070c12] px-2 py-1 text-[10px] text-slate-200 outline-none"
                      >
                        <option value="free">Free CAD Turntable</option>
                        <option value="follow-shot">Follow Active Pole</option>
                        <option value="instrument-pov">Total Station POV</option>
                      </select>
                    </label>

                    <label className="flex items-center justify-between text-slate-400">
                      <span>Sky Time</span>
                      <select
                        value={styleSettings.skyTimeMode}
                        onChange={e => updateStyleSettings({ skyTimeMode: e.target.value as 'recorded' | 'fixed' })}
                        className="rounded border border-white/10 bg-[#070c12] px-2 py-1 text-[10px] text-slate-200 outline-none"
                      >
                        <option value="recorded">Recorded file time</option>
                        <option value="fixed">Force time of day</option>
                      </select>
                    </label>

                    {styleSettings.skyTimeMode === 'fixed' && (
                      <label className="flex items-center justify-between text-slate-400">
                        <span>Sky Clock</span>
                        <input
                          type="time"
                          value={styleSettings.skyTime}
                          onChange={e => updateStyleSettings({ skyTime: e.target.value })}
                          className="rounded border border-white/10 bg-[#070c12] px-2 py-1 text-[10px] text-cyan-200 outline-none"
                          aria-label="Raw Replay forced sky time"
                        />
                      </label>
                    )}

                    {styleSettings.skyTimeMode === 'fixed' && (
                      <p className="text-[8px] leading-4 text-slate-500">
                        Keeps the file date; the sun, stars, sky gradient and scene lighting follow this local time.
                      </p>
                    )}

                    <label className="flex items-center justify-between text-slate-400">
                      <span>Vertical Exaggeration</span>
                      <select
                        value={verticalExaggeration}
                        onChange={e => setVerticalExaggeration(Number(e.target.value))}
                        className="rounded border border-white/10 bg-[#070c12] px-2 py-1 text-[10px] text-cyan-200 outline-none"
                      >
                        {[0.5, 1, 1.5, 2, 3, 5, 10].map(v => (
                          <option key={v} value={v}>{v}× Vertical</option>
                        ))}
                      </select>
                    </label>

                    <div className="flex items-center justify-between text-slate-500">
                      <span>Trace Coloring</span>
                      <span className="text-[9px] text-slate-600">Style tab → Survey Trace</span>
                    </div>

                    <label className="flex items-center justify-between text-slate-400">
                      <span>Ray Mode</span>
                      <select
                        value={sightRayMode}
                        onChange={e => setSightRayMode(e.target.value as SightRayMode)}
                        className="rounded border border-white/10 bg-[#070c12] px-2 py-1 text-[10px] text-slate-200 outline-none"
                      >
                        <option value="live">Live laser only</option>
                        <option value="off">Hidden</option>
                      </select>
                    </label>

                    <label className="flex items-center justify-between text-slate-400">
                      <span>3D Callout Badges</span>
                      <select
                        value={pointLabelMode}
                        onChange={e => setPointLabelMode(e.target.value as PointLabelMode)}
                        className="rounded border border-white/10 bg-[#070c12] px-2 py-1 text-[10px] text-slate-200 outline-none"
                      >
                        <option value="recent">Active Pole + Setup + Tower</option>
                        <option value="active">Active Pole Only</option>
                        <option value="off">Hidden</option>
                      </select>
                    </label>
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'style' && (
              <div
                className="space-y-3 p-3"
                data-testid="raw-replay-style-settings"
                data-settings-schema="raw-replay-style/v1"
                data-settings-scope="agent"
              >
                <section>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">Point Marker Style</h3>
                    <span className="rounded border border-cyan-300/25 bg-cyan-300/[0.08] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.1em] text-cyan-200/85">
                      Agent only
                    </span>
                  </div>
                  <p className="mt-1 text-[9px] leading-4 text-slate-500">
                    Recorded shots use additive glowing X glyphs. These settings live with Raw Replay and never touch project settings.
                  </p>

                  <div className="mt-2.5 space-y-2.5 rounded-md border border-white/[0.07] bg-white/[0.015] p-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-10 w-10 items-center justify-center rounded border border-white/[0.06] bg-[#050a10]">
                        <svg
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                          className="h-6 w-6"
                          style={{
                            color: styleSettings.pointColor,
                            opacity: 0.45 + styleSettings.pointGlow * 0.55,
                            filter: `drop-shadow(0 0 ${4 + styleSettings.pointGlow * 8}px currentColor)`,
                          }}
                        >
                          {styleSettings.pointShape === 'dot'
                            ? <circle cx="12" cy="12" r="5" fill="currentColor" />
                            : <path
                                d={styleSettings.pointShape === 'square'
                                  ? 'M6 6 H18 V18 H6 Z'
                                  : styleSettings.pointShape === 'diamond'
                                    ? 'M12 4 L20 12 L12 20 L4 12 Z'
                                    : styleSettings.pointShape === 'plus'
                                      ? 'M12 4 V20 M4 12 H20'
                                      : 'M5 5 L19 19 M19 5 L5 19'}
                                stroke="currentColor"
                                strokeWidth={1.7 * styleSettings.pointLineWeight}
                                strokeLinecap="round"
                                fill="none"
                              />}
                        </svg>
                      </span>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-slate-200">Simulation marker</p>
                        <p className="text-[8px] text-slate-500">Agent render kit only — never writes project point styles</p>
                      </div>
                    </div>

                    <StyleSelect
                      label="Shape"
                      value={styleSettings.pointShape}
                      options={RAW_REPLAY_MARKER_SHAPES.map(value => ({ value, label: value.toUpperCase() }))}
                      onChange={value => updateStyleSettings({ pointShape: value })}
                      ariaLabel="Raw Replay point marker shape"
                    />
                    <StyleRange
                      label="Marker size"
                      value={styleSettings.pointSize}
                      display={`${styleSettings.pointSize.toFixed(1)}×`}
                      min={0.5}
                      max={2.5}
                      step={0.1}
                      onChange={value => updateStyleSettings({ pointSize: value })}
                      ariaLabel="Raw Replay point marker size"
                      accent="accent-white"
                    />
                    <StyleRange
                      label="Glow"
                      value={styleSettings.pointGlow}
                      display={`${Math.round(styleSettings.pointGlow * 100)}%`}
                      min={0}
                      max={1}
                      step={0.05}
                      onChange={value => updateStyleSettings({ pointGlow: value })}
                      ariaLabel="Raw Replay point marker glow"
                      accent="accent-white"
                    />
                    <StyleRange
                      label="Glyph weight"
                      value={styleSettings.pointLineWeight}
                      display={`${styleSettings.pointLineWeight.toFixed(1)}×`}
                      min={0.5}
                      max={3}
                      step={0.1}
                      onChange={value => updateStyleSettings({ pointLineWeight: value })}
                      ariaLabel="Raw Replay point marker line weight"
                      accent="accent-white"
                    />
                    <StyleRange
                      label="Marker TTL"
                      value={styleSettings.pointTtl}
                      display={styleSettings.pointTtl > 0 ? `${styleSettings.pointTtl.toFixed(0)}s` : 'Persist'}
                      min={0}
                      max={120}
                      step={1}
                      onChange={value => updateStyleSettings({ pointTtl: value })}
                      ariaLabel="Raw Replay point marker time to live in seconds"
                      accent="accent-rose-400"
                    />
                    <StyleColor
                      label="Marker color"
                      value={styleSettings.pointColor}
                      onChange={value => updateStyleSettings({ pointColor: value })}
                      ariaLabel="Raw Replay point marker color"
                    />
                    <label className="flex cursor-pointer items-center justify-between gap-2 text-[10px] text-slate-400">
                      <span>Show future markers</span>
                      <input
                        type="checkbox"
                        checked={styleSettings.showFuturePoints}
                        onChange={e => updateStyleSettings({ showFuturePoints: e.target.checked })}
                        className="accent-cyan-300"
                        aria-label="Show future Raw Replay shot markers"
                      />
                    </label>
                  </div>
                </section>

                <section className="border-t border-white/[0.06] pt-3">
                  <h3 className="mb-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">Survey Trace</h3>
                  <div className="space-y-2.5 rounded-md border border-white/[0.07] bg-white/[0.015] p-2.5">
                    <StyleSelect
                      label="Coloring"
                      value={traceColorMode}
                      options={[
                        { value: 'equipment', label: 'By equipment' },
                        { value: 'setup', label: 'By setup' },
                        { value: 'elevation', label: 'By elevation' },
                        { value: 'custom', label: 'Custom color' },
                      ]}
                      onChange={value => setTraceColorMode(value)}
                      ariaLabel="Raw Replay trace color mode"
                    />
                    {traceColorMode === 'custom' && (
                      <StyleColor
                        label="Custom color"
                        value={styleSettings.traceColor}
                        onChange={value => updateStyleSettings({ traceColor: value })}
                        ariaLabel="Raw Replay trace color"
                      />
                    )}
                    {traceColorMode === 'equipment' && (
                      <div className="space-y-2">
                        <p className="text-[9px] leading-4 text-slate-500">
                          Equipment found in this file. Each row controls that instrument's trace color and line style.
                        </p>
                        {equipmentInFile.map(({ kind, count }) => {
                          const equipmentStyle = traceEquipmentStyleFor(styleSettings.traceEquipmentStyles, kind);
                          const label = equipmentKindLabel(kind);
                          return (
                            <div
                              key={kind}
                              className="space-y-1.5 rounded border border-white/[0.07] bg-white/[0.02] p-2"
                              data-testid={`raw-replay-trace-equipment-${kind}`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-medium text-slate-200">{label}</span>
                                <span className="text-[8px] uppercase tracking-wide text-slate-500">
                                  {count} setup{count === 1 ? '' : 's'}
                                </span>
                              </div>
                              <StyleColor
                                label="Color"
                                value={equipmentStyle.color}
                                onChange={color => updateTraceEquipmentStyle(kind, { color })}
                                ariaLabel={`Raw Replay ${label} trace color`}
                              />
                              <StyleSelect
                                label="Line type"
                                value={equipmentStyle.lineType}
                                options={LINE_TYPE_OPTIONS}
                                onChange={lineType => updateTraceEquipmentStyle(kind, { lineType })}
                                ariaLabel={`Raw Replay ${label} trace line type`}
                              />
                              <StyleRange
                                label="Line weight"
                                value={equipmentStyle.lineWeight}
                                display={`${equipmentStyle.lineWeight.toFixed(1)} px`}
                                min={0.5}
                                max={6}
                                step={0.5}
                                onChange={lineWeight => updateTraceEquipmentStyle(kind, { lineWeight })}
                                ariaLabel={`Raw Replay ${label} trace line weight`}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {(traceColorMode === 'setup' || traceColorMode === 'elevation') && (
                      <p className="text-[9px] leading-4 text-slate-500">
                        {traceColorMode === 'setup'
                          ? 'Segment colors cycle by setup. Line type and weight below apply to every setup.'
                          : 'Segment colors follow the elevation ramp. Line type and weight below apply to the whole trace.'}
                      </p>
                    )}
                    {traceColorMode !== 'equipment' && (
                      <>
                        <StyleSelect
                          label="Line type"
                          value={styleSettings.traceLineType}
                          options={LINE_TYPE_OPTIONS}
                          onChange={value => updateStyleSettings({ traceLineType: value })}
                          ariaLabel="Raw Replay trace line type"
                        />
                        <StyleRange
                          label="Line weight"
                          value={styleSettings.traceLineWeight}
                          display={`${styleSettings.traceLineWeight.toFixed(1)} px`}
                          min={0.5}
                          max={6}
                          step={0.5}
                          onChange={value => updateStyleSettings({ traceLineWeight: value })}
                          ariaLabel="Raw Replay trace line weight"
                        />
                      </>
                    )}
                    <StyleRange
                      label="Trace glow"
                      value={styleSettings.traceGlow}
                      display={`${Math.round(styleSettings.traceGlow * 100)}%`}
                      min={0}
                      max={1}
                      step={0.05}
                      onChange={value => updateStyleSettings({ traceGlow: value })}
                      ariaLabel="Raw Replay live survey trace glow"
                    />
                    <StyleRange
                      label="Trace tail"
                      value={styleSettings.traceTail}
                      display={`${styleSettings.traceTail} shots`}
                      min={10}
                      max={600}
                      step={10}
                      onChange={value => updateStyleSettings({ traceTail: value })}
                      ariaLabel="Raw Replay trace tail length in shots"
                    />
                    <StyleRange
                      label="Trace TTL"
                      value={styleSettings.traceTtl}
                      display={styleSettings.traceTtl > 0 ? `${styleSettings.traceTtl.toFixed(0)}s` : 'Tail only'}
                      min={0}
                      max={120}
                      step={1}
                      onChange={value => updateStyleSettings({ traceTtl: value })}
                      ariaLabel="Raw Replay trace time to live in seconds"
                      accent="accent-rose-400"
                    />
                  </div>
                </section>

                <section className="border-t border-white/[0.06] pt-3">
                  <h3 className="mb-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">Sight Rays</h3>
                  <div className="space-y-2.5 rounded-md border border-white/[0.07] bg-white/[0.015] p-2.5">
                    <StyleColor
                      label="Ray color"
                      value={styleSettings.rayColor}
                      onChange={value => updateStyleSettings({ rayColor: value })}
                      ariaLabel="Raw Replay sight ray color"
                    />
                    <StyleSelect
                      label="Line type"
                      value={styleSettings.rayLineType}
                      options={LINE_TYPE_OPTIONS}
                      onChange={value => updateStyleSettings({ rayLineType: value })}
                      ariaLabel="Raw Replay sight ray line type"
                    />
                    <StyleRange
                      label="Line weight"
                      value={styleSettings.rayLineWeight}
                      display={`${styleSettings.rayLineWeight.toFixed(1)} px`}
                      min={0.5}
                      max={6}
                      step={0.5}
                      onChange={value => updateStyleSettings({ rayLineWeight: value })}
                      ariaLabel="Raw Replay sight ray line weight"
                    />
                    <StyleRange
                      label="Ray TTL"
                      value={styleSettings.rayTtl}
                      display={`${styleSettings.rayTtl.toFixed(1)}s`}
                      min={0.2}
                      max={30}
                      step={0.1}
                      onChange={value => updateStyleSettings({ rayTtl: value })}
                      ariaLabel="Raw Replay live ray time to live in seconds"
                      accent="accent-rose-400"
                    />
                  </div>
                </section>

                <section className="border-t border-white/[0.06] pt-3">
                  <h3 className="mb-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">Traverse</h3>
                  <div className="space-y-2.5 rounded-md border border-white/[0.07] bg-white/[0.015] p-2.5">
                    <StyleColor
                      label="Traverse color"
                      value={styleSettings.traverseColor}
                      onChange={value => updateStyleSettings({ traverseColor: value })}
                      ariaLabel="Raw Replay traverse color"
                    />
                    <StyleSelect
                      label="Line type"
                      value={styleSettings.traverseLineType}
                      options={LINE_TYPE_OPTIONS}
                      onChange={value => updateStyleSettings({ traverseLineType: value })}
                      ariaLabel="Raw Replay traverse line type"
                    />
                    <StyleRange
                      label="Line weight"
                      value={styleSettings.traverseLineWeight}
                      display={`${styleSettings.traverseLineWeight.toFixed(1)} px`}
                      min={0.5}
                      max={6}
                      step={0.5}
                      onChange={value => updateStyleSettings({ traverseLineWeight: value })}
                      ariaLabel="Raw Replay traverse line weight"
                    />
                    <StyleRange
                      label="Traverse glow"
                      value={styleSettings.traverseGlow}
                      display={`${Math.round(styleSettings.traverseGlow * 100)}%`}
                      min={0}
                      max={1}
                      step={0.05}
                      onChange={value => updateStyleSettings({ traverseGlow: value })}
                      ariaLabel="Raw Replay traverse glow"
                    />
                    <StyleRange
                      label="Traverse TTL"
                      value={styleSettings.traverseTtl}
                      display={styleSettings.traverseTtl > 0 ? `${styleSettings.traverseTtl.toFixed(0)}s` : 'Persist'}
                      min={0}
                      max={120}
                      step={1}
                      onChange={value => updateStyleSettings({ traverseTtl: value })}
                      ariaLabel="Raw Replay traverse time to live in seconds"
                      accent="accent-rose-400"
                    />
                  </div>
                </section>

                <section className="border-t border-white/[0.06] pt-3">
                  <h3 className="mb-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">Project Linework</h3>
                  <div className="space-y-2.5 rounded-md border border-white/[0.07] bg-white/[0.015] p-2.5">
                    <StyleSelect
                      label="Color mode"
                      value={styleSettings.projectColorMode}
                      options={[
                        { value: 'source', label: 'Source colors' },
                        { value: 'custom', label: 'One simulation color' },
                      ]}
                      onChange={value => updateStyleSettings({ projectColorMode: value })}
                      ariaLabel="Raw Replay project linework color mode"
                    />
                    <StyleColor
                      label="Override color"
                      value={styleSettings.projectColor}
                      onChange={value => updateStyleSettings({ projectColor: value })}
                      ariaLabel="Raw Replay project linework color"
                    />
                    <StyleSelect
                      label="Line type"
                      value={styleSettings.projectLineType}
                      options={LINE_TYPE_OPTIONS}
                      onChange={value => updateStyleSettings({ projectLineType: value })}
                      ariaLabel="Raw Replay project linework line type"
                    />
                    <StyleRange
                      label="Line weight"
                      value={styleSettings.projectLineWeight}
                      display={`${styleSettings.projectLineWeight.toFixed(1)} px`}
                      min={0.5}
                      max={6}
                      step={0.5}
                      onChange={value => updateStyleSettings({ projectLineWeight: value })}
                      ariaLabel="Raw Replay project linework line weight"
                    />
                    <StyleRange
                      label="Opacity"
                      value={styleSettings.projectOpacity}
                      display={`${Math.round(styleSettings.projectOpacity * 100)}%`}
                      min={0.05}
                      max={1}
                      step={0.05}
                      onChange={value => updateStyleSettings({ projectOpacity: value })}
                      ariaLabel="Raw Replay project linework opacity"
                    />
                    <StyleRange
                      label="Linework TTL"
                      value={styleSettings.projectTtl}
                      display={styleSettings.projectTtl > 0 ? `${styleSettings.projectTtl.toFixed(0)}s` : 'Persist'}
                      min={0}
                      max={120}
                      step={1}
                      onChange={value => updateStyleSettings({ projectTtl: value })}
                      ariaLabel="Raw Replay project linework time to live in seconds"
                      accent="accent-rose-400"
                    />
                  </div>
                </section>

                <section className="border-t border-white/[0.06] pt-3">
                  <h3 className="mb-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">Contours</h3>
                  <div className="space-y-2.5 rounded-md border border-white/[0.07] bg-white/[0.015] p-2.5">
                    <StyleColor
                      label="Minor color"
                      value={styleSettings.contourMinorColor}
                      onChange={value => updateStyleSettings({ contourMinorColor: value })}
                      ariaLabel="Raw Replay minor contour color"
                    />
                    <StyleColor
                      label="Major color"
                      value={styleSettings.contourMajorColor}
                      onChange={value => updateStyleSettings({ contourMajorColor: value })}
                      ariaLabel="Raw Replay major contour color"
                    />
                    <StyleSelect
                      label="Line type"
                      value={styleSettings.contourLineType}
                      options={LINE_TYPE_OPTIONS}
                      onChange={value => updateStyleSettings({ contourLineType: value })}
                      ariaLabel="Raw Replay contour line type"
                    />
                    <StyleRange
                      label="Line weight"
                      value={styleSettings.contourLineWeight}
                      display={`${styleSettings.contourLineWeight.toFixed(1)} px`}
                      min={0.5}
                      max={6}
                      step={0.5}
                      onChange={value => updateStyleSettings({ contourLineWeight: value })}
                      ariaLabel="Raw Replay contour line weight"
                    />
                    <StyleRange
                      label="Opacity"
                      value={styleSettings.contourOpacity}
                      display={`${Math.round(styleSettings.contourOpacity * 100)}%`}
                      min={0.05}
                      max={1}
                      step={0.05}
                      onChange={value => updateStyleSettings({ contourOpacity: value })}
                      ariaLabel="Raw Replay contour opacity"
                    />
                    <StyleRange
                      label="Contour TTL"
                      value={styleSettings.contourTtl}
                      display={styleSettings.contourTtl > 0 ? `${styleSettings.contourTtl.toFixed(0)}s` : 'Persist'}
                      min={0}
                      max={120}
                      step={1}
                      onChange={value => updateStyleSettings({ contourTtl: value })}
                      ariaLabel="Raw Replay contour time to live in seconds"
                      accent="accent-rose-400"
                    />
                  </div>
                </section>

                <section className="border-t border-white/[0.06] pt-3">
                  <h3 className="mb-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">CAD Grid & Callouts</h3>
                  <div className="space-y-2.5 rounded-md border border-white/[0.07] bg-white/[0.015] p-2.5">
                    <StyleColor
                      label="Grid color"
                      value={styleSettings.gridColor}
                      onChange={value => updateStyleSettings({ gridColor: value })}
                      ariaLabel="Raw Replay CAD grid color"
                    />
                    <StyleSelect
                      label="Grid line type"
                      value={styleSettings.gridLineType}
                      options={LINE_TYPE_OPTIONS}
                      onChange={value => updateStyleSettings({ gridLineType: value })}
                      ariaLabel="Raw Replay CAD grid line type"
                    />
                    <StyleRange
                      label="Grid line weight"
                      value={styleSettings.gridLineWeight}
                      display={`${styleSettings.gridLineWeight.toFixed(1)} px`}
                      min={0.5}
                      max={6}
                      step={0.5}
                      onChange={value => updateStyleSettings({ gridLineWeight: value })}
                      ariaLabel="Raw Replay CAD grid line weight"
                    />
                    <StyleRange
                      label="Grid TTL"
                      value={styleSettings.gridTtl}
                      display={styleSettings.gridTtl > 0 ? `${styleSettings.gridTtl.toFixed(0)}s` : 'Persist'}
                      min={0}
                      max={120}
                      step={1}
                      onChange={value => updateStyleSettings({ gridTtl: value })}
                      ariaLabel="Raw Replay CAD grid time to live in seconds"
                      accent="accent-rose-400"
                    />
                    <StyleColor
                      label="Callout text"
                      value={styleSettings.labelColor}
                      onChange={value => updateStyleSettings({ labelColor: value })}
                      ariaLabel="Raw Replay callout text color"
                    />
                    <StyleRange
                      label="Callout scale"
                      value={styleSettings.labelScale}
                      display={`${styleSettings.labelScale.toFixed(1)}×`}
                      min={0.6}
                      max={2.5}
                      step={0.1}
                      onChange={value => updateStyleSettings({ labelScale: value })}
                      ariaLabel="Raw Replay callout scale"
                    />
                    <StyleRange
                      label="Callout TTL"
                      value={styleSettings.labelTtl}
                      display={styleSettings.labelTtl > 0 ? `${styleSettings.labelTtl.toFixed(0)}s` : 'Persist'}
                      min={0}
                      max={120}
                      step={1}
                      onChange={value => updateStyleSettings({ labelTtl: value })}
                      ariaLabel="Raw Replay callout time to live in seconds"
                      accent="accent-rose-400"
                    />
                  </div>
                </section>

                <button
                  type="button"
                  onClick={resetStyleSettings}
                  className="w-full rounded border border-white/10 bg-white/[0.025] px-3 py-1.5 text-[9px] font-semibold text-slate-300 transition hover:border-white/20 hover:bg-white/[0.05]"
                >
                  Reset style to white glowing X
                </button>
              </div>
            )}

            {activeTab === 'qa' && (
              <div>
                <SummarySection title="Quality Control Checks" rows={summary.qaRows} live />

                {survey.warnings.length > 0 && (
                  <section className="border-t border-white/[0.06] px-3 py-3">
                    <h3 className="mb-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-amber-200/75">
                      Field Notes & Warnings ({survey.warnings.length})
                    </h3>
                    <ul className="space-y-1.5">
                      {survey.warnings.map((warning, index) => {
                        const targetObsIdx = warning.recordIndex != null
                          ? observations.findIndex(o => o.sourceRecordIndex === warning.recordIndex)
                          : -1;
                        return (
                          <li key={`${warning.code}-${index}`} className="flex items-start gap-2 rounded border border-white/[0.05] bg-white/[0.015] p-2 text-[9px] leading-4 text-slate-400">
                            <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                              warning.severity === 'error' ? 'bg-rose-400' : warning.severity === 'warning' ? 'bg-amber-400' : 'bg-cyan-400'
                            }`} />
                            <div className="min-w-0 flex-1">
                              <span>{warning.message}</span>
                              {targetObsIdx >= 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    seek(targetObsIdx);
                                    requestFocusCurrentShot();
                                  }}
                                  className="ml-2 text-[8px] font-semibold text-cyan-300 underline hover:text-cyan-200"
                                >
                                  Jump to shot
                                </button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}
              </div>
            )}

            {/* Add to Project Section (Always accessible at bottom of panel) */}
            <section className="border-t border-white/[0.06] px-3 py-3">
              {!importOpen ? (
                <button
                  type="button"
                  onClick={() => setImportOpen(true)}
                  disabled={!survey.usable}
                  className="w-full rounded-md border border-cyan-300/35 bg-cyan-300/[0.1] px-3 py-2 text-[10px] font-semibold text-cyan-100 transition hover:bg-cyan-300/[0.18] disabled:opacity-40"
                >
                  Add Replay Data to Project…
                </button>
              ) : (
                <div className="rounded-md border border-cyan-300/20 bg-cyan-300/[0.035] p-2.5">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-[9px] font-semibold uppercase tracking-[0.14em] text-cyan-100/80">Import from replay</h3>
                    <button type="button" onClick={() => setImportOpen(false)} className="text-[9px] text-slate-500 hover:text-slate-300">Cancel</button>
                  </div>
                  <div className="space-y-1.5">
                    {([
                      ['pointList', 'Shot points', `${survey.stats.coordinateCount} coordinates`],
                      ['traverse', 'Traverse linework', `${survey.stats.traverseLegCount} legs`],
                      ['tin', 'Build 3D TIN Surface', 'Delaunay terrain mesh'],
                      ['attachRaw', 'Attach raw file', rawFile.name],
                    ] as Array<[keyof typeof importOptions, string, string]>).map(([key, label, detail]) => (
                      <label key={key} className="flex cursor-pointer items-start gap-2 rounded border border-white/[0.06] px-2 py-1.5 text-[9px] text-slate-400 hover:border-white/[0.12]">
                        <input
                          type="checkbox"
                          checked={importOptions[key]}
                          onChange={() => setImportOptions(value => ({ ...value, [key]: !value[key] }))}
                          className="mt-0.5 accent-cyan-300"
                        />
                        <span>
                          <span className="block text-slate-300">{label}</span>
                          <span className="block text-[8px] text-slate-600">{detail}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={confirmImport}
                    disabled={!importOptions.pointList && !importOptions.traverse && !importOptions.tin && !importOptions.attachRaw}
                    className="mt-2 w-full rounded bg-cyan-300 px-3 py-1.5 text-[10px] font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:opacity-40"
                  >
                    Add Selected Data
                  </button>
                </div>
              )}
              {finalSummary && (
                <p className="mt-2 text-center text-[8px] text-slate-600">
                  Final QA {finalSummary.qualityScore}/100 · Deterministic summary
                </p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
