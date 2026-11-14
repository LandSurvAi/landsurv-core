import React, { useEffect, useRef, useState } from 'react';

export interface OrientationTupleValue {
  angle: number;
  originX: number;
  originY: number;
  mode?: 'drafting' | 'view';
  draftingAngle?: number;
  draftingOriginX?: number;
  draftingOriginY?: number;
  viewAngle?: number;
  viewOriginX?: number;
  viewOriginY?: number;
  placed?: boolean;
}

interface OrientationTupleControlProps {
  orientationTuple: OrientationTupleValue;
  onSetOrientationTuple: React.Dispatch<React.SetStateAction<OrientationTupleValue>>;
  /** Arms the canvas origin picker (click canvas / snap to a point). */
  onPickOrigin?: () => void;
  /** Arms the canvas line-align picker. */
  onAlignToLine?: () => void;
}

/**
 * Orientation Tuple (OT / UCS) instrument for the canvas toolbar.
 *
 * The trigger carries the live angle so the current drafting orientation is
 * readable without opening the popover. The popover holds the same controls the
 * canvas instrument used to: mode, numeric angle, 90° presets, line alignment
 * and the pivot origin.
 */
export const OrientationTupleControl: React.FC<OrientationTupleControlProps> = ({
  orientationTuple,
  onSetOrientationTuple,
  onPickOrigin,
  onAlignToLine,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const mode = orientationTuple.mode ?? 'drafting';
  const angle = mode === 'drafting'
    ? (orientationTuple.draftingAngle ?? orientationTuple.angle ?? 0)
    : (orientationTuple.viewAngle ?? orientationTuple.angle ?? 0);
  const originX = mode === 'drafting'
    ? (orientationTuple.draftingOriginX ?? orientationTuple.originX ?? 0)
    : (orientationTuple.viewOriginX ?? orientationTuple.originX ?? 0);
  const originY = mode === 'drafting'
    ? (orientationTuple.draftingOriginY ?? orientationTuple.originY ?? 0)
    : (orientationTuple.viewOriginY ?? orientationTuple.originY ?? 0);
  const angleDeg = Math.round((angle * 180) / Math.PI * 100) / 100;
  const angleLabel = Number.isFinite(angleDeg) ? `${angleDeg.toFixed(1)}°` : '0.0°';

  // Close on outside click / Escape so the toolbar flyout behaves like the rest
  // of the header controls without trapping focus.
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const setModeAngle = (rad: number) => {
    onSetOrientationTuple(prev => {
      const nextMode = prev.mode ?? 'drafting';
      return nextMode === 'drafting'
        ? { ...prev, draftingAngle: rad, angle: rad, placed: true }
        : { ...prev, viewAngle: rad, angle: rad, placed: true };
    });
  };

  const setModeOriginX = (val: number) => {
    onSetOrientationTuple(prev => {
      const nextMode = prev.mode ?? 'drafting';
      return nextMode === 'drafting'
        ? { ...prev, draftingOriginX: val, originX: val, placed: true }
        : { ...prev, viewOriginX: val, originX: val, placed: true };
    });
  };

  const setModeOriginY = (val: number) => {
    onSetOrientationTuple(prev => {
      const nextMode = prev.mode ?? 'drafting';
      return nextMode === 'drafting'
        ? { ...prev, draftingOriginY: val, originY: val, placed: true }
        : { ...prev, viewOriginY: val, originY: val, placed: true };
    });
  };

  const resetModeOrigin = () => {
    onSetOrientationTuple(prev => {
      const nextMode = prev.mode ?? 'drafting';
      return nextMode === 'drafting'
        ? { ...prev, draftingOriginX: 0, draftingOriginY: 0, originX: 0, originY: 0, placed: prev.draftingAngle !== 0 }
        : { ...prev, viewOriginX: 0, viewOriginY: 0, originX: 0, originY: 0, placed: prev.viewAngle !== 0 };
    });
  };

  const axisRotation = mode === 'drafting' ? angleDeg : 0;

  return (
    <div ref={rootRef} className="relative flex-shrink-0">
      <button
        ref={triggerRef}
        type="button"
        data-testid="orientation-tuple-trigger"
        onClick={() => setIsOpen(prev => !prev)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={`Origin — ${angleLabel}. Open Origin Tools.`}
        title={`Origin — ${angleLabel}. Click to adjust rotation and origin.`}
        className={`group flex h-9 items-center gap-1.5 rounded-md border px-2 transition-colors ${
          isOpen
            ? 'border-cyan-400/50 bg-cyan-400/[0.12] text-cyan-100'
            : 'border-white/[0.08] bg-white/[0.02] text-slate-300 hover:border-cyan-400/35 hover:bg-white/[0.05] hover:text-cyan-200'
        }`}
      >
        <svg
          className="h-[18px] w-[18px] flex-shrink-0 overflow-visible"
          viewBox="0 0 32 32"
          fill="none"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <g transform={`rotate(${axisRotation} 9 23)`}>
            <path d="M9 6.5A16.5 16.5 0 0 1 25.5 23" stroke="#22d3ee" strokeOpacity="0.28" strokeWidth="0.8" strokeDasharray="1.5 2" />
            <line x1="9" y1="23" x2="27.4" y2="23" stroke="#34d399" />
            <path d="M27.6 23l-4.1-2.2v4.4z" fill="#34d399" stroke="none" />
            <text x="24.6" y="20.4" fontSize="4.1" fontWeight="700" fill="#34d399" stroke="none" fontFamily="ui-monospace, SFMono-Regular, monospace">X</text>
            <line x1="9" y1="23" x2="9" y2="4.6" stroke="#f87171" />
            <path d="M9 4.4L6.8 8.6h4.4z" fill="#f87171" stroke="none" />
            <text x="10.8" y="7.6" fontSize="4.1" fontWeight="700" fill="#f87171" stroke="none" fontFamily="ui-monospace, SFMono-Regular, monospace">Y</text>
            <circle cx="9" cy="23" r="2.4" fill="#0b1119" stroke="#e2e8f0" strokeWidth="1.2" />
            <line x1="7.2" y1="23" x2="10.8" y2="23" stroke="#e2e8f0" strokeWidth="0.9" />
            <line x1="9" y1="21.2" x2="9" y2="24.8" stroke="#e2e8f0" strokeWidth="0.9" />
          </g>
        </svg>
        <span className="font-mono text-[10px] font-semibold tabular-nums tracking-tight text-cyan-200">
          {angleLabel}
        </span>
        <span className="hidden font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-slate-500 sm:inline">
          Origin
        </span>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Origin Tools"
          className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl border border-white/[0.1] bg-[#0b1119]/98 p-3.5 text-xs text-slate-200 shadow-[0_24px_70px_-16px_rgba(0,0,0,0.9)] backdrop-blur-xl"
        >
          <div className="mb-2.5 flex items-center justify-between border-b border-white/[0.07] pb-2">
            <span className="font-bold text-cyan-400">Origin Tools</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded p-0.5 text-slate-400 transition-colors hover:text-white"
              title="Close Origin Tools"
              aria-label="Close Origin Tools"
            >
              ✕
            </button>
          </div>

          <div className="space-y-3.5">
            <div>
              <div className="flex rounded-lg border border-white/[0.08] bg-black/40 p-0.5">
                <button
                  type="button"
                  onClick={() => onSetOrientationTuple(prev => ({ ...prev, mode: 'drafting' }))}
                  className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all ${
                    mode === 'drafting'
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Drafting: geometry and North stay put; new Ortho lines follow the rotation angle"
                >
                  Drafting
                </button>
                <button
                  type="button"
                  onClick={() => onSetOrientationTuple(prev => ({ ...prev, mode: 'view' }))}
                  className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all ${
                    mode === 'view'
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="View: rotates the entire canvas viewport and geometry"
                >
                  View
                </button>
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-400">
                <span className="font-semibold text-slate-300">Rotation Angle:</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="any"
                    value={angleDeg}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      if (!Number.isNaN(val)) setModeAngle((val * Math.PI) / 180);
                    }}
                    className="w-16 rounded border border-white/[0.1] bg-black/40 px-1.5 py-0.5 text-right font-mono text-xs text-cyan-300 focus:border-cyan-400 focus:outline-none"
                    aria-label="Rotation angle in degrees"
                  />
                  <span className="font-mono text-cyan-300">°</span>
                </div>
              </div>
              <input
                type="range"
                min="-180"
                max="180"
                step="0.5"
                value={angleDeg}
                onChange={e => setModeAngle((parseFloat(e.target.value) * Math.PI) / 180)}
                className="w-full cursor-pointer accent-cyan-500"
                aria-label="Rotation angle"
              />
              <div className="flex items-center gap-1 pt-1.5">
                <button
                  type="button"
                  onClick={() => setModeAngle(0)}
                  className="flex-1 rounded bg-white/[0.05] py-0.5 font-mono text-[10px] text-slate-300 transition-colors hover:bg-white/[0.1]"
                >
                  0°
                </button>
                <button
                  type="button"
                  onClick={() => setModeAngle(angle + Math.PI / 2)}
                  className="flex-1 rounded border border-cyan-700/50 bg-cyan-950/70 py-0.5 font-mono text-[10px] text-cyan-200 transition-colors hover:bg-cyan-900"
                  title="+90°"
                >
                  +90°
                </button>
                <button
                  type="button"
                  onClick={() => setModeAngle(angle - Math.PI / 2)}
                  className="flex-1 rounded border border-cyan-700/50 bg-cyan-950/70 py-0.5 font-mono text-[10px] text-cyan-200 transition-colors hover:bg-cyan-900"
                  title="-90°"
                >
                  -90°
                </button>
                <button
                  type="button"
                  onClick={() => setModeAngle(angle + Math.PI)}
                  className="flex-1 rounded border border-cyan-700/50 bg-cyan-950/70 py-0.5 font-mono text-[10px] text-cyan-200 transition-colors hover:bg-cyan-900"
                  title="180°"
                >
                  180°
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  onAlignToLine?.();
                  setIsOpen(false);
                }}
                disabled={!onAlignToLine}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded border border-indigo-500/40 bg-indigo-700/80 py-1 text-xs font-medium text-indigo-100 shadow-sm transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
                title="Click any line or boundary segment on canvas to align rotation to it"
              >
                <span aria-hidden="true">📏</span> Align to Line
              </button>
            </div>

            <div className="border-t border-white/[0.07] pt-2">
              <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-400">
                <span className="font-semibold text-slate-300">Origin:</span>
                <span className="font-mono text-[10px] text-slate-500">World Coords</span>
              </div>
              <div className="mb-2 grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-0.5 block font-mono text-[10px] text-emerald-400" htmlFor="ot-origin-x">
                    X (Easting):
                  </label>
                  <input
                    id="ot-origin-x"
                    type="number"
                    step="any"
                    value={originX}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      setModeOriginX(Number.isNaN(val) ? 0 : val);
                    }}
                    className="w-full rounded border border-white/[0.1] bg-black/40 px-2 py-1 font-mono text-xs text-emerald-300 focus:border-emerald-400 focus:outline-none"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block font-mono text-[10px] text-red-400" htmlFor="ot-origin-y">
                    Y (Northing):
                  </label>
                  <input
                    id="ot-origin-y"
                    type="number"
                    step="any"
                    value={originY}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      setModeOriginY(Number.isNaN(val) ? 0 : val);
                    }}
                    className="w-full rounded border border-white/[0.1] bg-black/40 px-2 py-1 font-mono text-xs text-red-300 focus:border-red-400 focus:outline-none"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onPickOrigin?.();
                    setIsOpen(false);
                  }}
                  disabled={!onPickOrigin}
                  className="flex flex-1 items-center justify-center gap-1 rounded bg-emerald-700 py-1 text-xs font-medium text-white shadow-sm transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Click canvas or snap to a point/line to set the origin"
                >
                  <span aria-hidden="true">🎯</span> Pick Origin
                </button>
                <button
                  type="button"
                  onClick={resetModeOrigin}
                  className="rounded bg-white/[0.05] px-2.5 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-white/[0.1]"
                  title="Reset origin to (0,0)"
                >
                  Reset (0,0)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrientationTupleControl;
