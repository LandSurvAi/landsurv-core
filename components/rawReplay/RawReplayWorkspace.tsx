import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { SurveyLine, SurveyPoint, TinSurface } from '../../types';
import { parseRawSurvey } from '../../services/rawReplay/parser';
import { buildRawSummary, buildRawSummaryAt, type RawSummaryRow } from '../../services/rawReplay/summary';
import { gnssReferenceLabel, resolveBase } from '../../services/rawReplay/baseStations';
import type { RawImportOptions, RawSurvey } from '../../services/rawReplay/types';
import { RAW_REPLAY_ACCEPT } from '../../services/rawReplay/types';

const RawReplayScene = lazy(() => import('./RawReplayScene'));

type EquipmentOverride = 'auto' | 'total-station' | 'gnss-rover';

interface RawReplayWorkspaceProps {
  rawFile: { name: string; content: string } | null;
  projectPoints: SurveyPoint[];
  projectLines: SurveyLine[];
  tinSurfaces: TinSurface[];
  onClose: () => void;
  onRawFileChange: (file: { name: string; content: string }) => void;
  onImport: (survey: RawSurvey, options: RawImportOptions) => void;
  /** Reserves the app command bar and open Quick Thought below the replay. */
  bottomInset?: number;
}

const formatClock = (ms: number | undefined): string => {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const date = new Date(ms);
  // Raw timestamps are the recorded local clock, encoded as a stable epoch.
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')}`;
};

const formatDuration = (ms: number | undefined): string => {
  if (ms == null || !Number.isFinite(ms)) return 'not recorded';
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};

const Section = ({ title, rows, live = false }: { title: string; rows: RawSummaryRow[]; live?: boolean }) => (
  <section className="border-t border-slate-700/60 pt-4">
    <h3 className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300/80">
      {title}
      {live && <span className="rounded border border-cyan-300/20 px-1 py-px text-[7px] font-medium tracking-[0.12em] text-cyan-200/60">LIVE</span>}
    </h3>
    <dl className="space-y-1.5">
      {rows.map(row => (
        <div
          key={`${row.label}-${row.value}`}
          className={`grid grid-cols-[1fr_auto] gap-3 rounded text-[11px] leading-4 ${live ? 'summary-live-row -mx-1 px-1' : ''}`}
        >
          <dt className="text-slate-400">{row.label}</dt>
          <dd className="text-right font-medium text-slate-100">
            {row.value}
            {row.note && <span className="block text-[9px] font-normal text-slate-500">{row.note}</span>}
          </dd>
        </div>
      ))}
    </dl>
  </section>
);

const Toggle = ({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`rounded border px-2 py-1 text-[10px] font-medium transition ${
      active
        ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-200'
        : 'border-slate-600/60 bg-slate-900/30 text-slate-400 hover:text-slate-200'
    }`}
  >
    {label}
  </button>
);

export default function RawReplayWorkspace({
  rawFile,
  projectPoints,
  projectLines,
  tinSurfaces,
  onClose,
  onRawFileChange,
  onImport,
  bottomInset = 0,
}: RawReplayWorkspaceProps) {
  const [survey, setSurvey] = useState<RawSurvey | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [equipmentOverride, setEquipmentOverride] = useState<EquipmentOverride>('auto');
  const [showProjectLines, setShowProjectLines] = useState(true);
  const [showSurveyLines, setShowSurveyLines] = useState(true);
  const [showTraverse, setShowTraverse] = useState(false);
  const [showTin, setShowTin] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [gridSpacing, setGridSpacing] = useState(1);
  const [gridOpacity, setGridOpacity] = useState(1);
  const [showSightRays, setShowSightRays] = useState(true);
  const [showTower, setShowTower] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [importOptions, setImportOptions] = useState<RawImportOptions>({
    pointList: true,
    traverse: true,
    tin: false,
    attachRaw: true,
  });
  const [flash, setFlash] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!rawFile) {
      setSurvey(null);
      setParseError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setParseError(null);
    setSurvey(null);
    setPlayhead(0);
    setPlaying(false);
    const timer = window.setTimeout(() => {
      try {
        const parsed = parseRawSurvey(rawFile.name, rawFile.content);
        setSurvey(parsed);
        setLoading(false);
      } catch (error) {
        setParseError(error instanceof Error ? error.message : 'The raw file could not be parsed.');
        setLoading(false);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [rawFile]);

  useEffect(() => {
    if (!survey) return;
    setPlayhead(0);
    setPlaying(false);
    setEquipmentOverride('auto');
  }, [survey]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 4500);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const observations = survey?.observations ?? [];
  const lastIndex = Math.max(0, observations.length - 1);
  const current = observations[Math.min(playhead, lastIndex)];
  const currentSetup = current ? survey?.setups.find(setup => setup.id === current.setupId) : undefined;
  const base = useMemo(() => (survey ? resolveBase(survey) : null), [survey]);
  const summary = useMemo(() => (survey ? buildRawSummaryAt(survey, playhead) : null), [survey, playhead]);
  const finalSummary = useMemo(() => (survey ? buildRawSummary(survey) : null), [survey]);
  const liveObservationCount = observations.length > 0 ? Math.min(observations.length, playhead + 1) : 0;
  const progressPercent = observations.length > 0
    ? Math.round((Math.min(playhead, lastIndex) + 1) / observations.length * 100)
    : 0;
  const liveSetups = useMemo(() => {
    if (!survey) return 0;
    const seen = new Set(
      survey.observations
        .slice(0, liveObservationCount)
        .map(observation => observation.setupId),
    );
    return survey.setups.filter(setup => seen.has(setup.id)).length;
  }, [survey, liveObservationCount]);
  const livePoints = useMemo(() => {
    if (!survey) return 0;
    return new Set(
      survey.observations
        .slice(0, liveObservationCount)
        .map(observation => observation.pointNumber ?? observation.id),
    ).size;
  }, [survey, liveObservationCount]);

  useEffect(() => {
    if (!playing || observations.length === 0) return;
    const interval = window.setInterval(() => {
      setPlayhead(value => {
        if (value >= observations.length - 1) {
          setPlaying(false);
          return value;
        }
        return value + 1;
      });
    }, Math.max(45, 1250 / speed));
    return () => window.clearInterval(interval);
  }, [playing, speed, observations.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      if (event.key === ' ') {
        event.preventDefault();
        if (observations.length === 0) return;
        setPlaying(value => !value);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setPlaying(false);
        setPlayhead(value => Math.min(lastIndex, value + 1));
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setPlaying(false);
        setPlayhead(value => Math.max(0, value - 1));
      } else if (event.key === 'Home') {
        event.preventDefault();
        setPlaying(false);
        setPlayhead(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        setPlaying(false);
        setPlayhead(lastIndex);
      } else if (event.key === 'Escape') {
        if (importOpen) setImportOpen(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [importOpen, lastIndex, observations.length, onClose]);

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const content = await file.text();
    if (!content.trim()) {
      setParseError('That file is empty.');
      return;
    }
    onRawFileChange({ name: file.name, content });
  };

  const togglePlay = () => {
    if (observations.length === 0) return;
    if (playhead >= lastIndex) setPlayhead(0);
    setPlaying(value => !value);
  };

  const confirmImport = () => {
    if (!survey) return;
    onImport(survey, importOptions);
    setImportOpen(false);
    setFlash('Raw Replay data added to this project. The raw file remains attached.');
  };

  return (
    <div
      className="absolute inset-0 z-[70] flex flex-col overflow-hidden bg-[#061019] text-slate-100"
      style={{ bottom: bottomInset }}
    >
      <style>{`
        @keyframes rawSummaryPulse {
          0% { background-color: rgba(34, 211, 238, 0.16); }
          100% { background-color: transparent; }
        }
        .summary-live-row { animation: rawSummaryPulse 850ms ease-out; }
        .summary-live-value { display: inline-block; animation: rawSummaryPulse 850ms ease-out; border-radius: 3px; padding: 0 2px; }
        .transport-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 28px;
          min-width: 28px;
          padding: 0 6px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          color: #cbd5e1;
          font-size: 11px;
        }
        .transport-button:hover {
          border-color: rgba(34, 211, 238, 0.45);
          color: #ecfeff;
        }
        .transport-button-primary {
          background: #22d3ee;
          border-color: #22d3ee;
          color: #020617;
          font-weight: 700;
        }
        @media print {
          body * { visibility: hidden !important; }
          #raw-replay-summary, #raw-replay-summary * { visibility: visible !important; }
          #raw-replay-summary { position: absolute; inset: 0; width: 100%; background: #fff; color: #111; padding: 28px; overflow: visible; }
          #raw-replay-summary .summary-card { border-color: #cbd5e1 !important; background: #fff !important; color: #111 !important; }
          #raw-replay-summary .summary-muted { color: #475569 !important; }
        }
      `}</style>

      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-cyan-400/15 bg-[#07131d] px-4">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded border border-cyan-400/30 bg-cyan-400/10 text-[10px] font-bold tracking-tighter text-cyan-200">
            RR
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h1 className="truncate text-sm font-semibold tracking-wide text-slate-100">Raw Replay</h1>
              <span className="rounded border border-cyan-300/20 bg-cyan-300/[0.04] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-cyan-200/70">Agent</span>
              {survey && <span className="hidden rounded border border-slate-600/50 px-1.5 py-0.5 text-[9px] text-slate-400 sm:inline">{summary?.formatLabel}</span>}
            </div>
            <p className="truncate text-[10px] text-slate-500">{rawFile?.name ?? 'No raw file loaded'}</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <select
            value={equipmentOverride}
            onChange={event => setEquipmentOverride(event.target.value as EquipmentOverride)}
            className="hidden rounded border border-slate-600/60 bg-[#0a1822] px-2 py-1 text-[10px] text-slate-300 outline-none focus:border-cyan-400/60 md:block"
            aria-label="Equipment override"
          >
            <option value="auto">Equipment · auto</option>
            <option value="total-station">Equipment · total station</option>
            <option value="gnss-rover">Equipment · GNSS base + rover</option>
          </select>
          <button
            type="button"
            onClick={() => setSummaryOpen(value => !value)}
            className="rounded border border-slate-600/60 px-2 py-1 text-[10px] text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200"
          >
            {summaryOpen ? 'Hide summary' : 'Show summary'}
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            disabled={!survey || !survey.usable}
            className="rounded border border-cyan-400/40 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold text-cyan-100 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add to project
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-600/60 px-2.5 py-1 text-[10px] text-slate-300 hover:border-rose-400/40 hover:text-rose-200"
          >
            Close
          </button>
        </div>
      </header>

      {flash && (
        <div className="absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded border border-emerald-400/40 bg-emerald-950/90 px-4 py-2 text-xs text-emerald-100 shadow-xl">
          {flash}
        </div>
      )}

      {!rawFile || !survey ? (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
          <div className="w-full max-w-2xl">
            <div
              onDragOver={event => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={event => {
                event.preventDefault();
                setDragging(false);
                void handleFiles(event.dataTransfer.files);
              }}
              className={`rounded-xl border-2 border-dashed p-8 transition ${
                dragging ? 'border-cyan-400/70 bg-cyan-400/10' : 'border-slate-600/60 bg-[#08141e]'
              }`}
            >
              <div className="mb-5 flex items-start justify-between gap-6">
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300/80">Read-only field replay</p>
                  <h2 className="text-xl font-semibold text-slate-100">Drop a raw survey file into Raw Replay</h2>
                  <p className="mt-2 max-w-xl text-xs leading-5 text-slate-400">
                    RW5 is the primary format. TDS / Survey Pro, legacy RAW point dumps, Leica GSI and simple text surveys are also recognised.
                    Raw Replay reads the field record; it does not recompute, adjust or overwrite coordinates.
                  </p>
                </div>
                <div className="hidden shrink-0 rounded border border-slate-600/50 bg-slate-900/50 px-3 py-2 text-right text-[10px] text-slate-500 sm:block">
                  <div className="text-cyan-300">Right-drag / Ctrl + drag</div>
                  <div>orbit</div>
                  <div className="mt-1 text-cyan-300">Wheel</div>
                  <div>zoom</div>
                  <div className="mt-1 text-cyan-300">Alt + drag</div>
                  <div>pan</div>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={RAW_REPLAY_ACCEPT}
                className="hidden"
                onChange={event => { void handleFiles(event.target.files); event.currentTarget.value = ''; }}
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
                >
                  Choose raw file
                </button>
                <span className="text-[10px] text-slate-500">or drop it here · .rw5 .raw .fbk .gsi .txt</span>
              </div>
            </div>

            {loading && (
              <div className="mt-5 flex items-center gap-3 text-xs text-slate-400">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                Parsing field record…
              </div>
            )}
            {parseError && (
              <div className="mt-5 rounded border border-rose-500/35 bg-rose-500/10 p-4 text-xs text-rose-100">
                <div className="font-semibold">Could not open this raw file</div>
                <p className="mt-1 text-rose-100/80">{parseError}</p>
              </div>
            )}
            {rawFile && !loading && parseError && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-3 rounded border border-slate-600 px-3 py-1.5 text-[10px] text-slate-300 hover:border-cyan-400/40"
              >
                Choose a different file
              </button>
            )}
            <div className="mt-4 grid gap-2 text-[10px] text-slate-500 sm:grid-cols-3">
              <div className="rounded border border-slate-700/50 p-3"><span className="text-slate-300">Deterministic summary</span><br />No AI, no chat, no invented measurements.</div>
              <div className="rounded border border-slate-700/50 p-3"><span className="text-slate-300">Observation-order replay</span><br />Timestamps label and compress; they never reorder the field sequence.</div>
              <div className="rounded border border-slate-700/50 p-3"><span className="text-slate-300">Read-only by default</span><br />Import is explicit and goes through the project history.</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1">
              <Suspense
                fallback={(
                  <div className="flex h-full items-center justify-center bg-[#071018] text-xs text-slate-400">
                    <span className="mr-3 h-4 w-4 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                    Loading 3D replay…
                  </div>
                )}
              >
                <RawReplayScene
                  survey={survey}
                  base={base}
                  playhead={playhead}
                  equipmentOverride={equipmentOverride}
                  showProjectLines={showProjectLines}
                  showSurveyLines={showSurveyLines}
                  showTraverse={showTraverse}
                  showSightRays={showSightRays}
                  showTower={showTower}
                  showGrid={showGrid}
                  gridSpacing={gridSpacing}
                  gridOpacity={gridOpacity}
                  showTin={showTin}
                  projectPoints={projectPoints}
                  projectLines={projectLines}
                  tinSurfaces={tinSurfaces}
                />
              </Suspense>

              <div className="absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1.5 rounded-lg border border-cyan-300/15 bg-[#07131d]/88 p-1.5 shadow-lg backdrop-blur">
                <span className="hidden px-1 text-[8px] font-semibold uppercase tracking-[0.16em] text-slate-500 sm:inline">Display</span>
                <Toggle active={showSurveyLines} onClick={() => setShowSurveyLines(value => !value)} label="Survey trace" />
                <Toggle active={showProjectLines} onClick={() => setShowProjectLines(value => !value)} label="Project" />
                <Toggle active={showTraverse} onClick={() => setShowTraverse(value => !value)} label="Traverse" />
                <Toggle active={showTin} onClick={() => setShowTin(value => !value)} label="TIN" />
                <Toggle active={showSightRays} onClick={() => setShowSightRays(value => !value)} label="Sight rays" />
                <Toggle active={showTower} onClick={() => setShowTower(value => !value)} label="Base tower" />
                <Toggle active={showGrid} onClick={() => setShowGrid(value => !value)} label="Grid" />
              </div>

              {survey.stats.coordinateCount === 0 && (
                <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded border border-amber-400/30 bg-amber-950/80 p-3 text-[11px] text-amber-100">
                  This file contains GNSS records but no local grid coordinates. The Summary is complete; the scene will place points once N/E values are present.
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-slate-700/70 bg-[#08141e] px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
                  <button type="button" aria-label="Stop and rewind" onClick={() => { setPlaying(false); setPlayhead(0); }} className="transport-button">■</button>
                  <button type="button" aria-label="Previous observation" onClick={() => { setPlaying(false); setPlayhead(value => Math.max(0, value - 1)); }} className="transport-button">◀</button>
                  <button type="button" aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay} className="transport-button transport-button-primary">
                    {playing ? '❚❚' : '▶'}
                  </button>
                  <button type="button" aria-label="Next observation" onClick={() => { setPlaying(false); setPlayhead(value => Math.min(lastIndex, value + 1)); }} className="transport-button">▶|</button>
                  <button type="button" aria-label="Go to end" onClick={() => { setPlaying(false); setPlayhead(lastIndex); }} className="transport-button">▶▶</button>
                </div>

                <div className="min-w-[180px] flex-1 px-2">
                  <input
                    type="range"
                    min={0}
                    max={lastIndex}
                    value={Math.min(playhead, lastIndex)}
                    onChange={event => { setPlaying(false); setPlayhead(Number(event.target.value)); }}
                    className="h-1.5 w-full cursor-pointer accent-cyan-400"
                    aria-label="Replay position"
                  />
                  <div className="mt-1 flex justify-between text-[9px] text-slate-500">
                    <span>{current ? `Shot ${current.sequence} / ${observations.length}` : 'No observations'}</span>
                    <span>{Math.round(observations.length > 1 ? (playhead / lastIndex) * 100 : 0)}%</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  <span className="hidden sm:inline">Speed</span>
                  <select
                    value={speed}
                    onChange={event => setSpeed(Number(event.target.value))}
                    className="rounded border border-slate-600/60 bg-[#0a1822] px-1.5 py-1 text-[10px] text-slate-200 outline-none"
                    aria-label="Replay speed"
                  >
                    {[0.5, 1, 2, 4, 8].map(value => <option key={value} value={value}>{value}×</option>)}
                  </select>
                  <span className="hidden items-center gap-1 border-l border-slate-700 pl-2 md:flex">
                    <span className="text-slate-500">Clock</span>
                    <span className="font-mono text-slate-300">{formatClock(current?.fieldTimeMs)}</span>
                  </span>
                </div>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500">
                <span>
                  <span className="text-slate-300">{current?.pointNumber ? `PN ${current.pointNumber}` : current ? `Shot ${current.sequence}` : '—'}</span>
                  {current?.description ? ` · ${current.description}` : ''}
                </span>
                <span>{currentSetup ? `Setup ${currentSetup.sequence + 1} · ${currentSetup.equipment.replace('-', ' ')}` : 'Setup not resolved'}</span>
                <span>{current?.gnss ? `GNSS ${current.gnss.quality ?? 'quality unknown'}${current.gnss.satellites != null ? ` · ${current.gnss.satellites} sats` : ''}` : current?.timeQuality ? `Time ${current.timeQuality}` : ''}</span>
                <span className="ml-auto">{formatDuration(survey.stats.fieldSpanMs)} field window · {formatDuration(survey.stats.replayDurationMs)} normalized</span>
              </div>
            </div>
          </div>

          {summaryOpen && summary && (
            <aside
              id="raw-replay-summary"
              className="absolute inset-y-0 right-0 z-30 flex w-[min(88vw,360px)] shrink-0 flex-col overflow-y-auto border-l border-slate-700/70 bg-[#08141e] shadow-2xl xl:static xl:z-auto xl:w-[390px] xl:shadow-none"
            >
              <div className="summary-card border-b border-slate-700/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-cyan-300/70">Live deterministic summary</p>
                    <h2 className="mt-1 text-base font-semibold text-slate-100">{summary.title}</h2>
                    <p className="summary-muted mt-0.5 text-[10px] text-slate-500">{summary.generatedFrom}</p>
                  </div>
                  <div className={`shrink-0 rounded-full border px-2.5 py-1 text-center ${
                    summary.qualityTone === 'good'
                      ? 'border-emerald-400/35 bg-emerald-400/10 text-emerald-200'
                      : summary.qualityTone === 'caution'
                        ? 'border-amber-400/35 bg-amber-400/10 text-amber-200'
                        : 'border-rose-400/35 bg-rose-400/10 text-rose-200'
                  }`}>
                    <div className="text-sm font-semibold">{summary.qualityScore}</div>
                    <div className="text-[8px] uppercase tracking-wide">{summary.qualityLabel}</div>
                    {finalSummary && <div className="mt-0.5 text-[7px] uppercase tracking-[0.1em] opacity-60">Final QA</div>}
                  </div>
                </div>

                <div className="mt-3 rounded border border-cyan-300/20 bg-cyan-300/[0.045] p-2.5">
                  <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.14em] text-slate-500">
                    <span>At this position</span>
                    <span className="font-mono text-cyan-200">{progressPercent}%</span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-cyan-400 transition-[width] duration-150" style={{ width: `${progressPercent}%` }} />
                  </div>
                  <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] text-slate-500">
                    <span>Observed <b key={`obs-${liveObservationCount}`} className="summary-live-value float-right font-mono font-medium text-slate-200">{liveObservationCount}</b> <span className="text-slate-600">/ {observations.length}</span></span>
                    <span>Setups <b key={`setups-${liveSetups}`} className="summary-live-value float-right font-mono font-medium text-slate-200">{liveSetups}</b> <span className="text-slate-600">/ {survey.setups.length}</span></span>
                    <span>Points <b key={`points-${livePoints}`} className="summary-live-value float-right font-mono font-medium text-slate-200">{livePoints}</b> <span className="text-slate-600">/ {survey.stats.uniquePointCount}</span></span>
                    <span>Time <b key={`clock-${current?.fieldTimeMs ?? 'none'}`} className="summary-live-value float-right font-mono font-medium text-slate-200">{formatClock(current?.fieldTimeMs)}</b></span>
                  </div>
                  <div className="mt-2 border-t border-cyan-300/10 pt-2 text-[10px] text-slate-400">
                    <span className="text-slate-500">Now</span>{' '}
                    <span className="text-slate-200">{current?.pointNumber ? `PN ${current.pointNumber}` : current ? `Shot ${current.sequence}` : 'No observation'}</span>
                    {current?.description ? <span className="text-slate-500"> · {current.description}</span> : null}
                  </div>
                </div>

                <div className="mt-3 space-y-2 text-[11px] leading-[1.65] text-slate-300">
                  {summary.narrative.map((paragraph, index) => (
                    <p key={index} className="summary-muted">{paragraph}</p>
                  ))}
                </div>
              </div>

              {survey.warnings.length > 0 && (
                <div className="border-b border-slate-700/60 p-4">
                  <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300/80">Field notes</h3>
                  <ul className="space-y-1.5">
                    {survey.warnings.map((warning, index) => (
                      <li key={`${warning.code}-${index}`} className="flex gap-2 text-[10px] leading-4">
                        <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                          warning.severity === 'error' ? 'bg-rose-400' : warning.severity === 'warning' ? 'bg-amber-400' : 'bg-slate-500'
                        }`} />
                        <span className="summary-muted text-slate-400">{warning.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-4 p-4">
                <Section title="Job" rows={summary.jobRows} />
                <Section title="Equipment" rows={summary.equipmentRows} live />
                <Section title="Production" rows={summary.productionRows} live />
                <Section title="Quality control" rows={summary.qaRows} live />

                {base && (
                  <section className="border-t border-slate-700/60 pt-4">
                    <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300/80">Base station</h3>
                    <div className="rounded border border-slate-700/60 bg-slate-900/30 p-3">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-medium text-slate-200">{base.label}</span>
                        <span className={`rounded border px-1.5 py-0.5 text-[8px] uppercase tracking-wide ${
                          base.approximate
                            ? 'border-amber-400/35 bg-amber-400/10 text-amber-200'
                            : 'border-emerald-400/35 bg-emerald-400/10 text-emerald-200'
                        }`}>
                          {base.approximate ? 'Approximate' : 'From file'}
                        </span>
                      </div>
                      <div className="mt-1 text-[9px] uppercase tracking-wide text-cyan-300/70">{gnssReferenceLabel(base.reference)}</div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-slate-400">
                        <div>Bearing <span className="float-right text-slate-200">{base.bearingDeg.toFixed(0)}°</span></div>
                        <div>Distance <span className="float-right text-slate-200">{(base.distanceM / 1000).toFixed(base.distanceM >= 10000 ? 0 : 1)} km</span></div>
                      </div>
                      <p className="summary-muted mt-2 text-[9px] leading-4 text-slate-500">{base.note}</p>
                    </div>
                  </section>
                )}

                <div className="border-t border-slate-700/60 pt-4">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="w-full rounded border border-slate-600/60 px-3 py-1.5 text-[10px] text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200"
                  >
                    Print summary
                  </button>
                  <p className="mt-2 text-center text-[9px] text-slate-600">Deterministic output · no AI-generated measurements</p>
                </div>
              </div>
            </aside>
          )}
        </div>
      )}

      {importOpen && survey && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-600/70 bg-[#0a1721] p-5 shadow-2xl">
            <h2 className="text-sm font-semibold text-slate-100">Add Raw Replay data to this project</h2>
            <p className="mt-1 text-[11px] leading-5 text-slate-400">
              This is the explicit write step. The raw file is read-only; the selected objects are added through the project history so they can be undone.
            </p>
            <div className="mt-4 space-y-2">
              {([
                ['pointList', 'Shot point list', `${survey.stats.coordinateCount} coordinate${survey.stats.coordinateCount === 1 ? '' : 's'}`],
                ['traverse', 'Traverse linework', `${survey.stats.traverseLegCount} setup leg${survey.stats.traverseLegCount === 1 ? '' : 's'}`],
                ['tin', 'Build TIN from imported points', 'Terrain is generated only when selected'],
                ['attachRaw', 'Attach raw file to the project', rawFile?.name ?? 'Raw file'],
              ] as Array<[keyof RawImportOptions, string, string]>).map(([key, label, detail]) => (
                <label key={key} className="flex cursor-pointer items-start gap-3 rounded border border-slate-700/50 p-3 hover:border-slate-500/70">
                  <input
                    type="checkbox"
                    checked={importOptions[key]}
                    onChange={() => setImportOptions(value => ({ ...value, [key]: !value[key] }))}
                    className="mt-0.5 accent-cyan-400"
                  />
                  <span>
                    <span className="block text-[11px] font-medium text-slate-200">{label}</span>
                    <span className="block text-[9px] text-slate-500">{detail}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setImportOpen(false)} className="rounded border border-slate-600 px-3 py-1.5 text-[10px] text-slate-300">Cancel</button>
              <button
                type="button"
                onClick={confirmImport}
                disabled={!importOptions.pointList && !importOptions.traverse && !importOptions.tin && !importOptions.attachRaw}
                className="rounded bg-cyan-500 px-3 py-1.5 text-[10px] font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-40"
              >
                Add selected data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
