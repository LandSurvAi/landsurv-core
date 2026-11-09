/**
 * A2UI Road Paint Studio.
 *
 * A first-class surface for pavement markings: pick a Stationing & CL
 * centerline, choose WL / SWL / DYL, set the offset and station range, preview
 * the true 4-inch bands, then commit through the `road_paint_apply` CACP skill.
 * EP is shown as a reference-only marking and cannot be painted.
 */

import React, { useEffect, useMemo, useState } from 'react';
import type {
  Centerline,
  RoadPaintMarkingId,
  RoadPaintSide,
  RoadPaintSpec,
  SurveyLine,
} from '../types.ts';
import { openA2UISurface } from '../services/a2uiSurfaces.ts';
import {
  ROAD_PAINT_PRESETS,
  buildRoadPaintMarkings,
  resolveRoadPaintSpec,
  type ResolvedRoadPaintSpec,
} from '../utils/roadPaint.ts';
import { calculateCenterlineLength, formatStation } from '../utils/stationing.ts';

export interface RoadPaintApplyOutcome {
  ok: boolean;
  message?: string;
}

export interface A2UIRoadPaintStudioProps {
  centerlines: Centerline[];
  initialSpec?: Partial<RoadPaintSpec>;
  onApply: (spec: RoadPaintSpec) => Promise<RoadPaintApplyOutcome>;
  onOpenStationing?: () => void;
}

type PreviewState =
  | { error: string }
  | {
      resolved: ResolvedRoadPaintSpec;
      built: ReturnType<typeof buildRoadPaintMarkings>;
    };

const numberText = (value: unknown, fallback: number): string =>
  typeof value === 'number' && Number.isFinite(value) ? String(value) : String(fallback);

const parsedNumber = (text: string): number | undefined => {
  if (!text.trim()) return undefined;
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
};

interface PlanStroke {
  key: string;
  color: string;
  points: Array<{ x: number; y: number }>;
}

export const A2UIRoadPaintStudio: React.FC<A2UIRoadPaintStudioProps> = ({
  centerlines,
  initialSpec,
  onApply,
  onOpenStationing,
}) => {
  const usable = useMemo(
    () => centerlines.filter(cl => cl.pis.length >= 2 && calculateCenterlineLength(cl) > 0),
    [centerlines],
  );

  const [marking, setMarking] = useState<RoadPaintMarkingId>(
    (initialSpec?.marking as RoadPaintMarkingId) || 'DYL',
  );
  const [centerlineId, setCenterlineId] = useState<string>(initialSpec?.centerlineId ?? '');
  const [side, setSide] = useState<RoadPaintSide>(initialSpec?.side ?? 'right');
  const [offsetIn, setOffsetIn] = useState<string>(numberText(initialSpec?.offsetIn, 8));
  const [widthIn, setWidthIn] = useState<string>(numberText(initialSpec?.widthIn, 4));
  const [separationIn, setSeparationIn] = useState<string>(numberText(initialSpec?.separationIn, 8));
  const initialStartStation = initialSpec?.startStation;
  const initialEndStation = initialSpec?.endStation;
  const [startStation, setStartStation] = useState<string>(
    initialStartStation === undefined ? '' : String(initialStartStation),
  );
  const [endStation, setEndStation] = useState<string>(
    initialEndStation === undefined ? '' : String(initialEndStation),
  );
  const [annotate, setAnnotate] = useState<boolean>(initialSpec?.annotate !== false);
  const [replaceExisting, setReplaceExisting] = useState<boolean>(initialSpec?.replaceExisting !== false);
  const [layer, setLayer] = useState<string>(initialSpec?.layer ?? '');
  const [lineType, setLineType] = useState<string>(initialSpec?.lineType ?? '');
  const [applying, setApplying] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (centerlineId && usable.some(cl => cl.id === centerlineId)) return;
    if (usable.length > 0) setCenterlineId(usable[0].id);
  }, [centerlineId, usable]);

  const selectedCenterline = usable.find(cl => cl.id === centerlineId) ?? null;
  const markingPreset = ROAD_PAINT_PRESETS.find(preset => preset.id === marking) ?? ROAD_PAINT_PRESETS[3];

  const preview = useMemo<PreviewState>(() => {
    if (!selectedCenterline) {
      return {
        error:
          usable.length === 0
            ? 'No centerline yet. Establish the alignment in Stationing & CL (the CL agent owns stationing), then paint it here.'
            : 'Select the alignment to paint.',
      };
    }
    const draft: RoadPaintSpec = {
      marking,
      centerlineId: selectedCenterline.id,
      side,
      offsetIn: parsedNumber(offsetIn),
      widthIn: parsedNumber(widthIn),
      separationIn: parsedNumber(separationIn),
      startStation: startStation.trim() || undefined,
      endStation: endStation.trim() || undefined,
      annotate,
      replaceExisting,
      layer: layer.trim() || undefined,
      lineType: lineType.trim() || undefined,
    };
    const resolved = resolveRoadPaintSpec(draft, selectedCenterline);
    if ('error' in resolved) return { error: resolved.error };
    return { resolved: resolved.spec, built: buildRoadPaintMarkings(selectedCenterline, resolved.spec) };
  }, [
    selectedCenterline,
    usable.length,
    marking,
    side,
    offsetIn,
    widthIn,
    separationIn,
    startStation,
    endStation,
    annotate,
    replaceExisting,
    layer,
    lineType,
  ]);

  const planView = useMemo(() => {
    if (!preview || 'error' in preview) return null;
    const strokes = new Map<string, PlanStroke>();
    for (const line of preview.built.lines as SurveyLine[]) {
      if (!line.fromPt || !line.toPt) continue;
      const key = line.polylineId ?? line.id ?? 'paint';
      let stroke = strokes.get(key);
      if (!stroke) {
        stroke = { key, color: line.color ?? '#FFFFFF', points: [] };
        strokes.set(key, stroke);
      }
      if (stroke.points.length === 0) stroke.points.push({ x: line.fromPt.x, y: line.fromPt.y });
      stroke.points.push({ x: line.toPt.x, y: line.toPt.y });
    }
    const all = [...strokes.values()].flatMap(stroke => stroke.points);
    if (all.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of all) {
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    }
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const pad = Math.max(width, height) * 0.06;
    return {
      minX: minX - pad,
      minY: minY - pad,
      width: width + pad * 2,
      height: height + pad * 2,
      flipY: minY + maxY,
      strokes: [...strokes.values()],
    };
  }, [preview]);

  const handleApply = async () => {
    if (!preview || 'error' in preview || applying) return;
    const spec: RoadPaintSpec = {
      marking,
      centerlineId: preview.resolved.centerlineId,
      side,
      offsetIn: parsedNumber(offsetIn),
      widthIn: parsedNumber(widthIn),
      separationIn: parsedNumber(separationIn),
      startStation: startStation.trim() || undefined,
      endStation: endStation.trim() || undefined,
      annotate,
      replaceExisting,
      layer: layer.trim() || undefined,
      lineType: lineType.trim() || undefined,
    };
    setApplying(true);
    setStatus(null);
    try {
      const outcome = await onApply(spec);
      setStatus({
        ok: outcome.ok,
        text: outcome.message || (outcome.ok ? 'Paint applied.' : 'Paint could not be applied.'),
      });
    } catch (error) {
      setStatus({ ok: false, text: error instanceof Error ? error.message : String(error) });
    } finally {
      setApplying(false);
    }
  };

  const fieldClass =
    'w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white outline-none focus:border-amber-400/60';
  const labelClass = 'text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400';

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto bg-[#070e18] p-3 text-slate-200">
      <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-2.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">Pavement paint</p>
        <p className="mt-1 text-[11px] leading-snug text-slate-300">
          EP is a surveyed <span className="font-semibold text-amber-200">reference</span>, not paint — the
          centerline is fitted between the EP shots. SWL/WL is one white stripe; DYL is two yellow stripes.
          Each stripe is a true <span className="font-semibold text-white">4 inch</span> band offset{' '}
          <span className="font-semibold text-white">8 inches</span> from the centerline. Stations come from the
          alignment, never from guesswork.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div>
            <div className={labelClass}>Marking</div>
            <div className="mt-1 grid grid-cols-4 gap-1.5">
              {ROAD_PAINT_PRESETS.map(preset => {
                const active = preset.id === marking;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={!preset.paint}
                    onClick={() => preset.paint && setMarking(preset.id)}
                    title={preset.description}
                    className={`rounded-md border px-1 py-2 text-center transition-colors ${
                      active
                        ? 'border-amber-300 bg-amber-400/20 text-white'
                        : preset.paint
                          ? 'border-white/10 bg-white/5 text-slate-300 hover:border-amber-400/50'
                          : 'cursor-not-allowed border-white/5 bg-white/[0.02] text-slate-600'
                    }`}
                  >
                    <div className="text-[11px] font-bold tracking-wide">{preset.abbreviation}</div>
                    <div className="mt-0.5 text-[9px] leading-tight">{preset.label}</div>
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[10px] text-slate-500">{markingPreset.description}</p>
          </div>

          <div>
            <div className={labelClass}>Centerline (Stationing &amp; CL)</div>
            <div className="mt-1 flex gap-1.5">
              <select
                value={centerlineId}
                onChange={event => setCenterlineId(event.target.value)}
                className={fieldClass}
              >
                {usable.length === 0 && <option value="">No alignments available</option>}
                {usable.map(cl => (
                  <option key={cl.id} value={cl.id}>
                    {cl.name} — {formatStation(cl.beginStation)} to{' '}
                    {formatStation(cl.beginStation + calculateCenterlineLength(cl))}
                  </option>
                ))}
              </select>
              {onOpenStationing && (
                <button
                  type="button"
                  onClick={onOpenStationing}
                  className="whitespace-nowrap rounded-md border border-cyan-400/40 bg-cyan-500/10 px-2 text-[10px] font-bold text-cyan-200 hover:bg-cyan-500/20"
                >
                  Stationing
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className={labelClass}>{marking === 'DYL' ? 'Each side of CL (in)' : 'Offset from CL (in)'}</span>
              <input
                type="number"
                step="1"
                min="1"
                value={marking === 'DYL' ? separationIn : offsetIn}
                onChange={event =>
                  marking === 'DYL' ? setSeparationIn(event.target.value) : setOffsetIn(event.target.value)
                }
                className={fieldClass}
              />
            </label>
            <label className="space-y-1">
              <span className={labelClass}>Paint width (in)</span>
              <input
                type="number"
                step="0.5"
                min="1"
                value={widthIn}
                onChange={event => setWidthIn(event.target.value)}
                className={fieldClass}
              />
            </label>
            {marking !== 'DYL' && (
              <label className="space-y-1">
                <span className={labelClass}>Side</span>
                <select
                  value={side}
                  onChange={event => setSide(event.target.value as RoadPaintSide)}
                  className={fieldClass}
                >
                  <option value="right">Right of CL</option>
                  <option value="left">Left of CL</option>
                  <option value="both">Both sides</option>
                </select>
              </label>
            )}
            <label className="space-y-1">
              <span className={labelClass}>Station start</span>
              <input
                type="text"
                placeholder={selectedCenterline ? formatStation(selectedCenterline.beginStation) : '1+00'}
                value={startStation}
                onChange={event => setStartStation(event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="space-y-1">
              <span className={labelClass}>Station end</span>
              <input
                type="text"
                placeholder={
                  selectedCenterline
                    ? formatStation(
                        selectedCenterline.beginStation + calculateCenterlineLength(selectedCenterline),
                      )
                    : '5+00'
                }
                value={endStation}
                onChange={event => setEndStation(event.target.value)}
                className={fieldClass}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className={labelClass}>Layer override</span>
              <input
                type="text"
                placeholder={markingPreset.layer}
                value={layer}
                onChange={event => setLayer(event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="space-y-1">
              <span className={labelClass}>Linetype</span>
              <input
                type="text"
                placeholder={markingPreset.lineType}
                value={lineType}
                onChange={event => setLineType(event.target.value)}
                className={fieldClass}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-3 text-[11px] text-slate-300">
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={annotate}
                onChange={event => setAnnotate(event.target.checked)}
                className="accent-amber-400"
              />
              Station callouts
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={event => setReplaceExisting(event.target.checked)}
                className="accent-amber-400"
              />
              Replace earlier paint
            </label>
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-2">
          <div className="rounded-lg border border-white/10 bg-black/30 p-2">
            <div className="flex items-center justify-between">
              <span className={labelClass}>Preview</span>
              <span className="text-[10px] text-slate-500">Plan view · true band width</span>
            </div>
            {planView ? (
              <svg
                viewBox={`${planView.minX} ${planView.minY} ${planView.width} ${planView.height}`}
                className="mt-1.5 h-40 w-full rounded bg-[#0b1420]"
                role="img"
                aria-label="Road paint preview"
              >
                {planView.strokes.map(stroke => (
                  <polyline
                    key={stroke.key}
                    fill="none"
                    stroke={stroke.color}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    points={stroke.points
                      .map(point => `${point.x},${planView.flipY - point.y}`)
                      .join(' ')}
                  />
                ))}
              </svg>
            ) : (
              <div className="mt-1.5 flex h-40 items-center justify-center rounded bg-[#0b1420] px-4 text-center text-[11px] text-slate-500">
                {preview && 'error' in preview ? preview.error : 'Paint preview appears here.'}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-white/10 bg-black/30 p-2 text-[11px]">
            {preview && !('error' in preview) ? (
              <div className="space-y-1">
                <div className="flex justify-between text-slate-300">
                  <span>Stations</span>
                  <span className="font-mono text-white">
                    {formatStation(preview.resolved.startStation)} – {formatStation(preview.resolved.endStation)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Marking</span>
                  <span className="text-white">
                    {preview.resolved.marking} · {preview.built.stripeCount} stripe
                    {preview.built.stripeCount === 1 ? '' : 's'} · {preview.resolved.widthIn} in
                  </span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Layer / linetype</span>
                  <span className="font-mono text-[10px] text-white">
                    {preview.resolved.layer} · {preview.resolved.lineType}
                  </span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Paint length / area</span>
                  <span className="text-white">
                    {preview.built.lengthFt.toFixed(1)} ft · {preview.built.paintedAreaSqFt.toFixed(1)} sq ft
                  </span>
                </div>
                {preview.built.labels.length > 0 && (
                  <div className="flex justify-between text-slate-300">
                    <span>Callouts</span>
                    <span className="text-white">{preview.built.labels.length} rotated station labels</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-amber-200">{'error' in preview ? preview.error : ''}</p>
            )}
          </div>

          <button
            type="button"
            onClick={handleApply}
            disabled={applying || !preview || 'error' in preview}
            className="rounded-md border border-amber-300/60 bg-amber-400/20 px-3 py-2 text-xs font-bold text-amber-100 transition-colors hover:bg-amber-400/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {applying ? 'Painting…' : `Apply ${marking}`}
          </button>
          {status && (
            <p className={`text-[11px] ${status.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{status.text}</p>
          )}
        </div>
      </div>
    </div>
  );
};

/** Open (or focus) the Road Paint Studio from any component or CACP handler. */
export function openRoadPaintStudioSurface(props: A2UIRoadPaintStudioProps): string {
  return openA2UISurface({
    key: 'road-paint-studio',
    definitionId: 'workspace-road-paint',
    title: 'Road Paint Studio',
    subtitle: 'Stationed WL / SWL / DYL markings offset from the centerline',
    category: 'workspace',
    accent: 'amber',
    size: 'wide',
    source: 'road-paint-studio',
    content: <A2UIRoadPaintStudio {...props} />,
  });
}

export default A2UIRoadPaintStudio;
