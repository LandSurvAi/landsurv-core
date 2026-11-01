import React, { useEffect, useRef, useState } from 'react';

interface PolarArrayManipulatorProps {
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onActivate: (index: number) => void;
  onSubmit: () => void;
  onCancel: () => void;
  /** Armed center-pick mode: the next canvas left-click sets the rotation center. */
  isPickingCenter: boolean;
  onPickCenter: () => void;
  x: number;
  y: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** UCS-style polar manipulator: the dot on the ring sets the sweep angle. */
export const PolarArrayManipulator: React.FC<PolarArrayManipulatorProps> = ({
  values,
  onChange,
  onActivate,
  onSubmit,
  onCancel,
  isPickingCenter,
  onPickCenter,
  x,
  y,
}) => {
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const angleDragRef = useRef<{ offset: number } | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const [draggingAngle, setDraggingAngle] = useState(false);

  // Coalesce pointer updates to one React update per animation frame so the
  // large canvas does not re-render for every native mousemove.
  const pendingChangeRef = useRef<string | null>(null);
  const changeFrameRef = useRef<number | null>(null);
  const latestOnChangeRef = useRef(onChange);
  latestOnChangeRef.current = onChange;

  const flushPendingChange = () => {
    if (changeFrameRef.current !== null) {
      cancelAnimationFrame(changeFrameRef.current);
      changeFrameRef.current = null;
    }
    const pending = pendingChangeRef.current;
    pendingChangeRef.current = null;
    if (pending !== null) latestOnChangeRef.current('fillAngle', pending);
  };

  const queueAngleChange = (value: number) => {
    pendingChangeRef.current = String(value);
    if (changeFrameRef.current !== null) return;
    changeFrameRef.current = requestAnimationFrame(() => {
      changeFrameRef.current = null;
      const pending = pendingChangeRef.current;
      pendingChangeRef.current = null;
      if (pending !== null) latestOnChangeRef.current('fillAngle', pending);
    });
  };

  const flushPendingRef = useRef<() => void>(() => {});
  flushPendingRef.current = flushPendingChange;

  const readNumber = (key: string, fallback: number): number => {
    const raw = values[key];
    if (raw === undefined || raw.trim() === '') return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const count = clamp(Math.round(readNumber('count', 6)), 2, 1000);
  const fillAngle = clamp(readNumber('fillAngle', 360), 1, 360);

  useEffect(() => {
    const input = inputRefs.current.count;
    input?.focus();
    input?.select();
  }, []);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      onSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };

  const selectOnFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.select();
  };

  const pointerAngle = (clientX: number, clientY: number, cx: number, cy: number) => {
    const radians = Math.atan2(cy - clientY, clientX - cx);
    return (((radians * 180) / Math.PI) + 360) % 360;
  };

  const beginAngleDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const ring = ringRef.current;
    if (!ring) return;
    const rect = ring.getBoundingClientRect();
    const pressedAt = pointerAngle(e.clientX, e.clientY, rect.left + rect.width / 2, rect.top + rect.height / 2);
    // Keep the grab point under the pointer instead of snapping the dot centre
    // to the cursor when the user grabs the edge of the 24 px target.
    angleDragRef.current = { offset: fillAngle - pressedAt };
    setDraggingAngle(true);
    onActivate(1);
  };

  const handleAngleMouseMove = (e: MouseEvent) => {
    const drag = angleDragRef.current;
    const ring = ringRef.current;
    if (!drag || !ring) return;
    e.preventDefault();
    const rect = ring.getBoundingClientRect();
    const pointer = pointerAngle(e.clientX, e.clientY, rect.left + rect.width / 2, rect.top + rect.height / 2);
    const normalized = ((pointer + drag.offset) % 360 + 360) % 360;
    const rounded = Math.round(normalized);
    // 360 and 0 are the same visual position; report a full sweep at the seam.
    queueAngleChange(rounded <= 0 ? 360 : clamp(rounded, 1, 360));
  };

  const latestMouseMoveRef = useRef<(event: MouseEvent) => void>(() => {});
  latestMouseMoveRef.current = handleAngleMouseMove;

  useEffect(() => {
    const handleMove = (event: MouseEvent) => latestMouseMoveRef.current(event);
    const handleUp = () => {
      if (!angleDragRef.current) return;
      flushPendingRef.current();
      angleDragRef.current = null;
      setDraggingAngle(false);
    };
    // Capture: the widget stops React propagation so the canvas stays idle,
    // but dragging must continue while the pointer is over the widget.
    window.addEventListener('mousemove', handleMove, true);
    window.addEventListener('mouseup', handleUp, true);
    return () => {
      window.removeEventListener('mousemove', handleMove, true);
      window.removeEventListener('mouseup', handleUp, true);
      if (changeFrameRef.current !== null) {
        cancelAnimationFrame(changeFrameRef.current);
        changeFrameRef.current = null;
      }
    };
  }, []);

  const handleAngleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const next = clamp(count + (e.deltaY > 0 ? -1 : 1), 2, 1000);
    onChange('count', String(next));
    onActivate(0);
  };

  const ringCenterX = 52;
  const ringCenterY = 72;
  const ringRadius = 20;
  const fillRadians = (fillAngle * Math.PI) / 180;
  // 0° sits on +X and positive angles run counter-clockwise, matching the
  // polar-array rotation used by the command.
  const dotX = ringCenterX + ringRadius * Math.cos(fillRadians);
  const dotY = ringCenterY - ringRadius * Math.sin(fillRadians);
  const fullSweep = fillAngle >= 359.999;
  const sweepPath = `M ${ringCenterX + ringRadius} ${ringCenterY} A ${ringRadius} ${ringRadius} 0 ${
    fillAngle > 180 ? 1 : 0
  } 0 ${dotX} ${dotY}`;

  const inputRowClass =
    'border-b border-cyan-300/40 bg-transparent text-center font-bold text-white outline-none transition-colors focus:border-violet-300';

  return (
    <div
      data-command-prompt
      style={{ left: x, top: y, textShadow: '0 1px 4px rgba(0,0,0,0.95)' }}
      className="absolute z-[60] h-[144px] w-[320px] select-none font-mono text-gray-100"
      onMouseDown={e => e.stopPropagation()}
      onMouseUp={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      onPointerUp={e => e.stopPropagation()}
      onMouseMove={e => e.stopPropagation()}
      onWheel={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
    >
      <svg viewBox="0 0 320 144" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <linearGradient id="polarSweep" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.95" />
          </linearGradient>
        </defs>
        <circle
          cx={ringCenterX}
          cy={ringCenterY}
          r={ringRadius}
          fill="none"
          stroke="#67e8f9"
          strokeOpacity="0.22"
          strokeWidth="2"
        />
        {fullSweep ? (
          <circle
            cx={ringCenterX}
            cy={ringCenterY}
            r={ringRadius}
            fill="none"
            stroke="url(#polarSweep)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        ) : (
          <path
            d={sweepPath}
            fill="none"
            stroke="url(#polarSweep)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        )}
        <line
          x1={ringCenterX}
          y1={ringCenterY}
          x2={dotX}
          y2={dotY}
          stroke="#c4b5fd"
          strokeOpacity="0.55"
          strokeWidth="1.5"
        />
        <circle cx={ringCenterX} cy={ringCenterY} r="2.5" fill="#e0f2fe" />
      </svg>

      <div
        ref={ringRef}
        data-testid="polar-direction-ring"
        aria-hidden="true"
        className="pointer-events-none absolute left-[32px] top-[52px] h-10 w-10 rounded-full"
      />
      <div
        aria-label="Drag polar sweep"
        title="Drag the dot around the ring to set the fill angle · Scroll: item count"
        className={`absolute z-30 h-6 w-6 touch-none rounded-full ${draggingAngle ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ left: dotX - 12, top: dotY - 12 }}
        onMouseDown={beginAngleDrag}
        onWheel={handleAngleWheel}
      >
        <span
          className={`absolute inset-1 rounded-full border-2 transition-all ${
            draggingAngle
              ? 'scale-110 border-white bg-violet-300'
              : 'border-violet-200 bg-gray-950 shadow-[0_0_12px_rgba(196,181,253,0.9)]'
          }`}
        >
          <span className="absolute inset-[4px] rounded-full bg-violet-300" />
        </span>
      </div>

      {/* Item count + sweep */}
      <div className="absolute left-[116px] right-2 top-[14px] flex items-center gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-300">ITEMS</span>
        <input
          ref={node => {
            inputRefs.current.count = node;
          }}
          aria-label="Polar item count"
          value={values.count ?? ''}
          onChange={e => onChange('count', e.target.value)}
          onFocus={e => {
            onActivate(0);
            selectOnFocus(e);
          }}
          onKeyDown={handleInputKeyDown}
          inputMode="numeric"
          className={`${inputRowClass} w-9 text-[15px]`}
        />
        <span className="ml-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-300">FILL</span>
        <input
          aria-label="Polar fill angle"
          value={values.fillAngle ?? ''}
          onChange={e => onChange('fillAngle', e.target.value)}
          onFocus={e => {
            onActivate(1);
            selectOnFocus(e);
          }}
          onKeyDown={handleInputKeyDown}
          inputMode="decimal"
          className={`${inputRowClass} w-10 text-[15px]`}
        />
        <span className="text-[9px] text-cyan-200/80">°</span>
      </div>

      {/* Center point */}
      <div className="absolute left-[116px] right-2 top-[52px] flex items-center gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-300">CENTER</span>
        <input
          aria-label="Polar center"
          value={values.center ?? ''}
          onChange={e => onChange('center', e.target.value)}
          onFocus={e => {
            onActivate(2);
            selectOnFocus(e);
          }}
          onKeyDown={handleInputKeyDown}
          placeholder={isPickingCenter ? 'click a point…' : 'selection center'}
          className={`${inputRowClass} min-w-0 flex-1 text-[13px] placeholder:text-[10px] placeholder:font-normal placeholder:text-gray-500`}
        />
        <button
          type="button"
          aria-label="Pick polar center on canvas"
          aria-pressed={isPickingCenter}
          title="Pick the rotation center on the canvas — free point, entity snap or survey point"
          onClick={onPickCenter}
          className={`flex h-[22px] shrink-0 items-center gap-1 rounded border px-1.5 text-[8px] font-bold uppercase tracking-[0.08em] transition-colors ${
            isPickingCenter
              ? 'border-cyan-300 bg-cyan-400/25 text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,0.5)]'
              : 'border-violet-400/45 bg-gray-900/80 text-violet-200 hover:border-violet-300 hover:text-white'
          }`}
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <circle cx="8" cy="8" r="2.2" />
            <path d="M8 1v3M8 12v3M1 8h3M12 8h3" strokeLinecap="round" />
          </svg>
          {isPickingCenter ? 'PICKING' : 'PICK'}
        </button>
      </div>

      <span className="pointer-events-none absolute left-[122px] top-[82px] text-[8px] uppercase tracking-[0.08em] text-gray-500">
        {isPickingCenter ? 'click canvas · snaps + survey points enabled' : 'blank = selection center'}
      </span>

      <button
        type="button"
        aria-label="Apply polar array"
        onClick={onSubmit}
        className="absolute right-2 top-[102px] flex h-7 items-center gap-1 rounded-lg border border-violet-400/60 bg-violet-500/25 px-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-violet-100 transition-colors hover:bg-violet-500/40"
      >
        <span className="text-[12px] leading-none">↵</span> apply
      </button>

      <div className="absolute bottom-[2px] left-2 right-[88px] text-left text-[9px] uppercase tracking-[0.1em] text-gray-400">
        {isPickingCenter ? 'left-click picks center · MMB pans · esc cancels pick' : 'pick center · drag dot · scroll qty · esc'}
      </div>
    </div>
  );
};

export default PolarArrayManipulator;
