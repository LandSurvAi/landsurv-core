import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type {
  A2UIGpsRoverSnapshot,
  A2UIGpsRoverSpec,
} from '../types.ts';

interface A2UIGpsRoverProps {
  spec?: A2UIGpsRoverSpec;
  /** Live snapshot supplied by the App's A2UI host (refreshed ~1 Hz). */
  getSnapshot?: () => A2UIGpsRoverSnapshot | null;
  onOpenPanel?: (mode: 'stakeout' | 'collect' | 'benchmark') => void;
  onSetTarget?: (pointNumber: string) => void;
  onCollectPoint?: (
    pointNumber: string,
    description: string
  ) => Promise<{ ok: boolean; message?: string }> | { ok: boolean; message?: string } | void;
}

type FixQuality = 'none' | 'excellent' | 'good' | 'fair' | 'poor';

const QUALITY_STYLE: Record<FixQuality, string> = {
  none: 'border-slate-500/30 bg-slate-500/10 text-slate-400',
  excellent: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  good: 'border-green-400/30 bg-green-400/10 text-green-200',
  fair: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  poor: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
};

const QUALITY_LABEL: Record<FixQuality, string> = {
  none: 'No fix',
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
};

const CARD = 'rounded-xl border border-white/[0.08] bg-white/[0.025]';
const INPUT =
  'w-full rounded-md border border-white/[0.1] bg-[#060d17] px-2.5 py-1.5 text-[11px] text-slate-100 outline-none transition-colors focus:border-blue-400/60';
const ACTION =
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-blue-400/35 bg-blue-400/10 px-2.5 py-1.5 text-[10.5px] font-semibold text-blue-200 transition-colors hover:border-blue-300/60 hover:bg-blue-400/20 disabled:cursor-not-allowed disabled:opacity-50';

function feet(value: number | null | undefined, precision = 2): string {
  return value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(precision)} ft`;
}

function coordinate(value: number | null | undefined, digits = 6): string {
  return value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits);
}

function qualityFor(accuracyFt: number | null | undefined): FixQuality {
  if (accuracyFt == null || !Number.isFinite(accuracyFt)) return 'none';
  if (accuracyFt <= 5) return 'excellent';
  if (accuracyFt <= 15) return 'good';
  if (accuracyFt <= 50) return 'fair';
  return 'poor';
}

/**
 * A2UI GPS Rover surface.
 *
 * Mirrors the live fix, stakeout guidance, and point collection. Every action
 * routes back through the host so the same dockable/floating surface behaves
 * identically in chat, the tool shelf, and fullscreen. All data also flows
 * through CACP (`gps_get_stakeout_guidance`, `gps_collect_point`,
 * `gps_open_rover`). Project location answers live with the LSAI Agent
 * (`lsvz_project_locations`).
 */
export const A2UIGpsRover: React.FC<A2UIGpsRoverProps> = ({
  spec,
  getSnapshot,
  onOpenPanel,
  onSetTarget,
  onCollectPoint,
}) => {
  const stakeoutListId = useId();
  const [snapshot, setSnapshot] = useState<A2UIGpsRoverSnapshot | null>(null);
  const [targetInput, setTargetInput] = useState(spec?.initialPointNumber ?? '');
  const [collectPointNumber, setCollectPointNumber] = useState(spec?.initialPointNumber ?? '');
  const [collectDescription, setCollectDescription] = useState('GPS');
  const [benchmarkPointNumber, setBenchmarkPointNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const lastSuggestedPointRef = useRef<string | null>(null);

  const readSnapshot = useCallback(() => {
    if (!getSnapshot) {
      setSnapshot(null);
      return;
    }
    try {
      setSnapshot(getSnapshot());
    } catch {
      setSnapshot(null);
    }
  }, [getSnapshot]);

  useEffect(() => {
    readSnapshot();
    if (!getSnapshot) return;
    const timer = window.setInterval(readSnapshot, 1000);
    return () => window.clearInterval(timer);
  }, [getSnapshot, readSnapshot]);

  // Adopt the Point Editor's next number until the user types their own.
  useEffect(() => {
    const suggested = snapshot?.nextPointNumber;
    if (!suggested) return;
    setCollectPointNumber(previous => {
      if (!previous || previous === lastSuggestedPointRef.current) {
        lastSuggestedPointRef.current = suggested;
        return suggested;
      }
      return previous;
    });
  }, [snapshot?.nextPointNumber]);

  const quality = qualityFor(snapshot?.accuracyFt);
  const guidance = snapshot?.guidance ?? null;
  const stakeoutPoints = snapshot?.stakeoutPoints ?? [];

  const mode = spec?.mode ?? 'overview';
  const showStakeout = mode === 'overview' || mode === 'stakeout';
  const showCollect = mode === 'overview' || mode === 'collect';
  const showBenchmark = mode === 'overview' || mode === 'benchmark';
  const benchmarkPoint = stakeoutPoints.find(point => point.pointNumber === benchmarkPointNumber) ?? null;
  const benchmark = useMemo(() => {
    if (
      !benchmarkPoint ||
      benchmarkPoint.northing == null ||
      benchmarkPoint.easting == null ||
      snapshot?.northing == null ||
      snapshot?.easting == null
    ) {
      return null;
    }
    const deltaNorthFt = benchmarkPoint.northing - snapshot.northing;
    const deltaEastFt = benchmarkPoint.easting - snapshot.easting;
    const deltaElevFt = benchmarkPoint.elevation != null && snapshot.altitudeFt != null
      ? benchmarkPoint.elevation - snapshot.altitudeFt
      : null;
    return {
      distanceFt: Math.hypot(deltaNorthFt, deltaEastFt, deltaElevFt ?? 0),
      deltaNorthFt,
      deltaEastFt,
      deltaElevFt,
    };
  }, [benchmarkPoint, snapshot?.northing, snapshot?.easting, snapshot?.altitudeFt]);

  const statusLine = useMemo(() => {
    if (!snapshot?.hasFix) return 'Waiting for a GPS fix — enable location access and step outside.';
    if (!snapshot.epsg) return 'Fix acquired, but no project projection is set. Apply a State Plane / EPSG code in Project Settings.';
    return 'Live fix projected into the project coordinate system.';
  }, [snapshot?.hasFix, snapshot?.epsg]);

  const handleSetTarget = () => {
    const pointNumber = targetInput.trim();
    if (!pointNumber || !onSetTarget) return;
    onSetTarget(pointNumber);
    setFeedback({ ok: true, message: `Stakeout target set to ${pointNumber}.` });
    onOpenPanel?.('stakeout');
  };

  const handleCollect = async () => {
    const pointNumber = collectPointNumber.trim();
    if (!pointNumber || !onCollectPoint) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await onCollectPoint(pointNumber, collectDescription.trim() || 'GPS');
      if (result && typeof result === 'object') {
        setFeedback({ ok: result.ok, message: result.message ?? (result.ok ? `Point ${pointNumber} stored.` : 'Point was not stored.') });
      } else {
        setFeedback({ ok: true, message: `Point ${pointNumber} stored.` });
      }
    } catch (error) {
      setFeedback({ ok: false, message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2.5 p-3" data-testid="a2ui-gps-rover">
      {/* Live fix */}
      <section className={CARD}>
        <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Rover fix
            </p>
            <p className="mt-0.5 truncate text-[11px] text-slate-300">{statusLine}</p>
          </div>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${QUALITY_STYLE[quality]}`}>
            ◉ {QUALITY_LABEL[quality]}
            {snapshot?.accuracyFt != null ? ` ±${snapshot.accuracyFt.toFixed(1)} ft` : ''}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-px bg-white/[0.04] sm:grid-cols-4">
          {[
            ['Latitude', coordinate(snapshot?.latitude)],
            ['Longitude', coordinate(snapshot?.longitude)],
            ['Northing', coordinate(snapshot?.northing, 2)],
            ['Easting', coordinate(snapshot?.easting, 2)],
          ].map(([label, value]) => (
            <div key={label} className="bg-[#070e18]/70 px-3 py-2">
              <dt className="text-[8px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</dt>
              <dd className="mt-0.5 truncate font-mono text-[10.5px] text-slate-200">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center gap-1.5 border-t border-white/[0.06] px-3 py-2">
          <button type="button" className={ACTION} onClick={() => onOpenPanel?.('stakeout')}>
            Open stakeout
          </button>
          <button type="button" className={ACTION} onClick={() => onOpenPanel?.('collect')}>
            Open collect
          </button>
          <button type="button" className={ACTION} onClick={() => onOpenPanel?.('benchmark')}>
            Benchmark check
          </button>
          {snapshot?.projectionLabel && (
            <span className="ml-auto truncate font-mono text-[9px] text-slate-500">
              {snapshot.projectionLabel}
            </span>
          )}
        </div>
      </section>

      {/* Stakeout navigation */}
      {showStakeout && (
        <section className={CARD} data-testid="a2ui-gps-stakeout">
          <div className="border-b border-white/[0.06] px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Stakeout navigation
            </p>
            <div className="mt-1.5 flex gap-1.5">
              <input
                className={INPUT}
                list={stakeoutListId}
                value={targetInput}
                onChange={event => setTargetInput(event.target.value)}
                placeholder="Target point number"
                aria-label="Stakeout target point number"
              />
              <datalist id={stakeoutListId}>
                {stakeoutPoints.map(point => (
                  <option key={point.pointNumber} value={point.pointNumber}>
                    {point.description}
                  </option>
                ))}
              </datalist>
              <button
                type="button"
                className={`${ACTION} shrink-0`}
                onClick={handleSetTarget}
                disabled={!targetInput.trim() || !onSetTarget}
              >
                Set target
              </button>
            </div>
          </div>
          {guidance ? (
            <dl className="grid grid-cols-2 gap-px bg-white/[0.04] sm:grid-cols-4">
              {[
                ['Bearing', `${guidance.bearingDeg.toFixed(1)}°`],
                ['Distance', feet(guidance.distanceFt)],
                ['Δ North', feet(guidance.deltaNorthFt)],
                ['Δ East', feet(guidance.deltaEastFt)],
                ['Cut / Fill', guidance.cutFillFt == null ? '—' : feet(guidance.cutFillFt)],
              ].map(([label, value]) => (
                <div key={label} className="bg-[#070e18]/70 px-3 py-2">
                  <dt className="text-[8px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</dt>
                  <dd className="mt-0.5 truncate font-mono text-[10.5px] text-slate-200">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="px-3 py-2.5 text-[10.5px] text-slate-500">
              {snapshot?.targetPointNumber
                ? `Target ${snapshot.targetPointNumber} loaded — acquire a fix to see bearing, distance, and cut/fill.`
                : 'Choose a project point to navigate to it.'}
            </p>
          )}
        </section>
      )}

      {/* Benchmark check */}
      {showBenchmark && (
        <section className={CARD} data-testid="a2ui-gps-benchmark">
          <div className="border-b border-white/[0.06] px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Benchmark check
            </p>
            <select
              className={`${INPUT} mt-1.5`}
              value={benchmarkPointNumber}
              onChange={event => setBenchmarkPointNumber(event.target.value)}
              aria-label="Benchmark point"
            >
              <option value="">Select a benchmark point...</option>
              {stakeoutPoints.map(point => (
                <option key={point.pointNumber} value={point.pointNumber}>
                  {point.pointNumber} — {point.description}
                </option>
              ))}
            </select>
          </div>
          {benchmark ? (
            <dl className="grid grid-cols-2 gap-px bg-white/[0.04] sm:grid-cols-4">
              {[
                ['3D distance', feet(benchmark.distanceFt)],
                ['Δ North', feet(benchmark.deltaNorthFt)],
                ['Δ East', feet(benchmark.deltaEastFt)],
                ['Δ Elev', benchmark.deltaElevFt == null ? '—' : feet(benchmark.deltaElevFt)],
              ].map(([label, value]) => (
                <div key={label} className="bg-[#070e18]/70 px-3 py-2">
                  <dt className="text-[8px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</dt>
                  <dd className="mt-0.5 truncate font-mono text-[10.5px] text-slate-200">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="px-3 py-2.5 text-[10.5px] text-slate-500">
              {benchmarkPoint
                ? 'Acquire a projected fix to compare against this benchmark.'
                : 'Choose a project point to compare against the live fix.'}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-white/[0.06] px-3 py-2">
            <button type="button" className={ACTION} onClick={() => onOpenPanel?.('benchmark')}>
              Open in Rover
            </button>
            <span className="text-[9px] text-slate-500">Deltas are benchmark − rover.</span>
          </div>
        </section>
      )}

      {/* Collect */}
      {showCollect && (
        <section className={CARD} data-testid="a2ui-gps-collect">
          <p className="border-b border-white/[0.06] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Collect at current fix
          </p>
          <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-[minmax(0,110px)_minmax(0,1fr)_auto]">
            <input
              className={INPUT}
              value={collectPointNumber}
              onChange={event => setCollectPointNumber(event.target.value)}
              placeholder="Point #"
              aria-label="Collect point number"
            />
            <input
              className={INPUT}
              value={collectDescription}
              onChange={event => setCollectDescription(event.target.value)}
              placeholder="Description"
              aria-label="Collect point description"
            />
            <button
              type="button"
              className={`${ACTION} border-emerald-400/35 bg-emerald-400/10 text-emerald-200 hover:border-emerald-300/60 hover:bg-emerald-400/20`}
              onClick={handleCollect}
              disabled={busy || !snapshot?.hasFix || !collectPointNumber.trim() || !onCollectPoint}
            >
              {busy ? 'Storing…' : 'Store point'}
            </button>
          </div>
          {feedback && (
            <p
              className={`border-t border-white/[0.06] px-3 py-2 text-[10.5px] ${
                feedback.ok ? 'text-emerald-200' : 'text-rose-200'
              }`}
            >
              {feedback.message}
            </p>
          )}
        </section>
      )}

      {!snapshot && (
        <p className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[10.5px] text-slate-400">
          The GPS Rover surface is ready. Open the agent panel to start location tracking,
          or ask the LSAI Agent where the project is. Project clusters, state, county,
          and municipality live in the LSAI Project Location tool.
        </p>
      )}
    </div>
  );
};

export default A2UIGpsRover;
