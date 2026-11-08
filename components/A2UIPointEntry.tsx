/**
 * A2UIPointEntry
 *
 * First-class A2UI surface for adding a survey point. It preserves the CACP
 * PointAgent number authority, supports manual coordinate entry, and can arm
 * the canvas add-point tool with the current number/elevation/description.
 *
 * Rendered inline in chat and inside the global A2UI host (floating, docked,
 * or fullscreen) so every presentation shares the same form and host bridge.
 */

import React, { useId, useState } from 'react';
import type { A2UIPointEntrySpec, SurveyPoint } from '../types.ts';
import { decodePlusCode } from '../utils/plusCode.ts';

export interface A2UIPointEntryResult {
  ok: boolean;
  message?: string;
  pointNumber?: string;
}

export interface A2UIPointEntryProps {
  spec?: A2UIPointEntrySpec;
  /** CACP PointAgent authority for the next available point number. */
  getNextPointNumber?: (excludePointNumber?: string) => string;
  /** Live duplicate check against every point list in the project. */
  isPointNumberTaken?: (pointNumber: string) => boolean;
  /** Store the point through the App host. May return the saved point number. */
  onAddPoint?: (point: SurveyPoint) => A2UIPointEntryResult | void;
  /** Arm the canvas add-point tool with the current form values. */
  onStartCanvasPlacement?: (options: {
    pointNumber: string;
    elevation: string;
    description: string;
  }) => void;
  /** Project from WGS84 to the active CRS, used by Plus Code entry. */
  convertLatLon?: (lat: number, lon: number) => { northing: number; easting: number } | null;
}

const CHIPS = ['CALC', 'PROP', 'MON', 'FND_IP', 'EP', 'BLDG'] as const;

const LABEL = 'mb-0.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400';
const INPUT =
  'w-full rounded-md border border-white/[0.1] bg-[#060d17] px-2.5 py-1.5 text-[11px] text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-emerald-400/60 focus:ring-1 focus:ring-emerald-400/20';
const CARD = 'rounded-xl border border-white/[0.08] bg-white/[0.025] p-3';

export const A2UIPointEntry: React.FC<A2UIPointEntryProps> = ({
  spec,
  getNextPointNumber,
  isPointNumberTaken,
  onAddPoint,
  onStartCanvasPlacement,
  convertLatLon,
}) => {
  const idPrefix = useId();
  // The surface is mounted when it opens; later CACP changes are requested
  // explicitly with the Use CACP Next action.
  const [pointNumber, setPointNumber] = useState(
    () => spec?.pointNumber?.trim() || getNextPointNumber?.() || '1',
  );
  const [northing, setNorthing] = useState(spec?.northing ?? '');
  const [easting, setEasting] = useState(spec?.easting ?? '');
  const [elevation, setElevation] = useState(spec?.elevation ?? '');
  const [description, setDescription] = useState(spec?.description ?? '');
  const [plusCode, setPlusCode] = useState('');
  const [plusCodeLocation, setPlusCodeLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const taken = Boolean(pointNumber.trim()) && Boolean(isPointNumberTaken?.(pointNumber));
  const suggestedNext = getNextPointNumber?.() ?? '';
  const canSubmit = northing.trim().length > 0 && easting.trim().length > 0;

  const handleUseNext = () => {
    const next = getNextPointNumber?.() ?? '';
    if (!next) return;
    setPointNumber(next);
    setFeedback({ ok: true, message: `Point number set to CACP next available: ${next}.` });
  };

  const handlePickOnCanvas = () => {
    const pn = pointNumber.trim() || suggestedNext || '1';
    onStartCanvasPlacement?.({
      pointNumber: pn,
      elevation: elevation.trim(),
      description: description.trim(),
    });
  };

  const handleUsePlusCode = () => {
    const decoded = decodePlusCode(plusCode);
    if (!decoded) {
      setFeedback({ ok: false, message: 'Enter a full Google Plus Code, such as 87G8Q2PQ+5X. Shortened codes need a reference location.' });
      return;
    }
    if (!convertLatLon) {
      setFeedback({ ok: false, message: 'Set a project projection before using a Plus Code.' });
      return;
    }
    const converted = convertLatLon(decoded.latitude, decoded.longitude);
    if (!converted) {
      setFeedback({ ok: false, message: 'The Plus Code could not be converted to project coordinates.' });
      return;
    }
    setNorthing(String(Math.round(converted.northing * 1000) / 1000));
    setEasting(String(Math.round(converted.easting * 1000) / 1000));
    setPlusCodeLocation({ latitude: decoded.latitude, longitude: decoded.longitude });
    setFeedback({
      ok: true,
      message: `Plus Code ${decoded.code} resolved to ${decoded.latitude.toFixed(6)}, ${decoded.longitude.toFixed(6)}.`,
    });
  };

  const handleAdd = () => {
    const n = Number(northing);
    const e = Number(easting);
    if (!northing.trim() || !easting.trim() || !Number.isFinite(n) || !Number.isFinite(e)) {
      setFeedback({ ok: false, message: 'Enter valid Northing and Easting coordinates.' });
      return;
    }
    if (!pointNumber.trim()) {
      setFeedback({ ok: false, message: 'Point number is required.' });
      return;
    }
    if (!onAddPoint) {
      setFeedback({ ok: false, message: 'The point store is not connected to this surface.' });
      return;
    }

    const result = onAddPoint({
      pointNumber: pointNumber.trim(),
      northing: Math.round(n * 1000) / 1000,
      easting: Math.round(e * 1000) / 1000,
      elevation: Number(elevation) || 0,
      description: description.trim(),
      ...(plusCodeLocation
        ? { latitude: plusCodeLocation.latitude, longitude: plusCodeLocation.longitude }
        : {}),
    });
    const outcome = result && typeof result === 'object' ? result : null;

    if (outcome && !outcome.ok) {
      setFeedback({ ok: false, message: outcome.message ?? 'The point could not be added.' });
      return;
    }

    const savedNumber = outcome?.pointNumber ?? pointNumber.trim();
    const next = getNextPointNumber?.(savedNumber) ?? '';
    setFeedback({
      ok: true,
      message:
        outcome?.message ??
        `Added Point ${savedNumber}. The form is ready for the next point.`,
    });
    setPointNumber(next);
    setNorthing('');
    setEasting('');
    setPlusCode('');
    setPlusCodeLocation(null);
  };

  return (
    <div data-testid="a2ui-point-entry" className="space-y-3 p-3 text-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[12px] font-semibold text-emerald-200">Add Survey Point</div>
          <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">
            Enter coordinates or arm the canvas picker. PointAgent CACP checks every number before it is stored.
          </p>
        </div>
        <span
          className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-200"
          title="Point numbering is owned by PointAgent through CACP"
        >
          CACP
        </span>
      </div>

      <div className={CARD}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-300">Point identity</span>
          <span
            data-testid="point-entry-cacp-status"
            className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${
              taken
                ? 'border-amber-400/40 bg-amber-400/10 text-amber-200'
                : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
            }`}
          >
            {taken ? 'Exists — will renumber' : 'CACP available'}
          </span>
        </div>

        <label className={LABEL} htmlFor={`${idPrefix}-point-number`}>
          Point #
        </label>
        <div className="flex items-center gap-1.5">
          <input
            id={`${idPrefix}-point-number`}
            data-testid="point-entry-number"
            type="text"
            value={pointNumber}
            onChange={event => setPointNumber(event.target.value)}
            placeholder={suggestedNext || '1'}
            className={`${INPUT} font-mono ${taken ? 'border-amber-500/70 focus:border-amber-400' : ''}`}
          />
          <button
            type="button"
            onClick={handleUseNext}
            disabled={!suggestedNext}
            className="shrink-0 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2 py-1.5 text-[10px] font-semibold text-cyan-200 transition-colors hover:border-cyan-300/60 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40"
            title="Ask PointAgent CACP for the next available number"
          >
            Use CACP Next
          </button>
        </div>
        <p className="mt-1 text-[9px] text-slate-500">
          {taken
            ? `Point ${pointNumber} already exists. Adding it will renumber to ${suggestedNext || 'the next CACP number'}.`
            : `Next CACP number: ${suggestedNext || '—'}`}
        </p>
      </div>

      <div className={CARD}>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-300">Coordinates</div>
        <div className="mb-2 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.04] p-2">
          <label className={LABEL} htmlFor={`${idPrefix}-plus-code`}>
            Google Plus Code
          </label>
          <div className="flex items-center gap-1.5">
            <input
              id={`${idPrefix}-plus-code`}
              data-testid="point-entry-plus-code"
              type="text"
              value={plusCode}
              onChange={event => {
                setPlusCode(event.target.value);
                setPlusCodeLocation(null);
              }}
              placeholder="87G8Q2PQ+5X"
              className={`${INPUT} font-mono uppercase`}
            />
            <button
              type="button"
              data-testid="point-entry-use-plus-code"
              onClick={handleUsePlusCode}
              disabled={!plusCode.trim()}
              className="shrink-0 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2 py-1.5 text-[10px] font-semibold text-cyan-200 transition-colors hover:border-cyan-300/60 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Use Code
            </button>
          </div>
          <p className="mt-1 text-[9px] text-slate-500">
            {plusCodeLocation
              ? `Resolved to ${plusCodeLocation.latitude.toFixed(6)}, ${plusCodeLocation.longitude.toFixed(6)}`
              : 'Full code only; it fills Northing/Easting in the active projection.'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={LABEL} htmlFor={`${idPrefix}-northing`}>
              Northing (Y)
            </label>
            <input
              id={`${idPrefix}-northing`}
              data-testid="point-entry-northing"
              type="text"
              inputMode="decimal"
              value={northing}
              onChange={event => {
                setNorthing(event.target.value);
                setPlusCodeLocation(null);
              }}
              placeholder="5000.000"
              className={`${INPUT} font-mono`}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor={`${idPrefix}-easting`}>
              Easting (X)
            </label>
            <input
              id={`${idPrefix}-easting`}
              data-testid="point-entry-easting"
              type="text"
              inputMode="decimal"
              value={easting}
              onChange={event => {
                setEasting(event.target.value);
                setPlusCodeLocation(null);
              }}
              placeholder="5000.000"
              className={`${INPUT} font-mono`}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor={`${idPrefix}-elevation`}>
              Elev (Z)
            </label>
            <input
              id={`${idPrefix}-elevation`}
              data-testid="point-entry-elevation"
              type="text"
              inputMode="decimal"
              value={elevation}
              onChange={event => setElevation(event.target.value)}
              placeholder="0.00"
              className={`${INPUT} font-mono`}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor={`${idPrefix}-description`}>
              Description
            </label>
            <input
              id={`${idPrefix}-description`}
              data-testid="point-entry-description"
              type="text"
              value={description}
              onChange={event => setDescription(event.target.value)}
              placeholder="CALC, MON, FND_IP"
              className={INPUT}
            />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {CHIPS.map(chip => (
            <button
              key={chip}
              type="button"
              onClick={() => setDescription(chip)}
              className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold transition-colors ${
                description === chip
                  ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-200'
                  : 'border-white/[0.08] bg-white/[0.03] text-slate-400 hover:border-white/[0.16] hover:text-slate-200'
              }`}
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-200">Canvas placement</div>
        <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
          Arm the add-point tool with this number, elevation, and description, then click the canvas to drop
          points. Press Esc when finished.
        </p>
        <button
          type="button"
          data-testid="point-entry-pick-canvas"
          onClick={handlePickOnCanvas}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1.5 text-[10.5px] font-semibold text-emerald-100 transition-colors hover:border-emerald-300/70 hover:bg-emerald-500/25"
        >
          Pick on Canvas (Osnap Active)
        </button>
      </div>

      <button
        type="button"
        data-testid="point-entry-add"
        onClick={handleAdd}
        disabled={!canSubmit}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-emerald-400/40 bg-emerald-600 px-2.5 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Add Point to Project
      </button>

      {feedback && (
        <div
          data-testid="point-entry-feedback"
          role="status"
          className={`rounded-md border px-2.5 py-1.5 text-[10px] ${
            feedback.ok
              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
              : 'border-rose-400/30 bg-rose-400/10 text-rose-200'
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-white/[0.07] pt-2 text-[8.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        <span>PointAgent CACP authority</span>
        <span className="font-mono normal-case tracking-normal text-slate-600">point-entry</span>
      </div>
    </div>
  );
};

export default A2UIPointEntry;
