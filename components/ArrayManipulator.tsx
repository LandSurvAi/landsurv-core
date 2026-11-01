import React, { useEffect, useRef, useState } from 'react';

interface ArrayManipulatorProps {
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onActivate: (index: number) => void;
  onSubmit: () => void;
  onCancel: () => void;
  x: number;
  y: number;
  /** Screen pixels for one current linear unit, used by the drag handles. */
  pixelsPerUnit: number;
  unitLabel: string;
}

type Axis = 'x' | 'y';
type DragMode = 'spacing' | 'quantity' | 'span';

interface AxisDrag {
  axis: Axis;
  mode: DragMode;
  startClientX: number;
  startClientY: number;
  startSpacing: number;
  startQuantity: number;
  startSpan: number;
  /** True once an unused axis has been promoted to a visible array count. */
  boosted: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const formatNumber = (value: number): string => String(Number(value.toFixed(2)));

/** UCS-style X/Y manipulator for a rectangular array. */
export const ArrayManipulator: React.FC<ArrayManipulatorProps> = ({
  values,
  onChange,
  onActivate,
  onSubmit,
  onCancel,
  x,
  y,
  pixelsPerUnit,
  unitLabel,
}) => {
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const axisDragRef = useRef<AxisDrag | null>(null);
  const angleDragRef = useRef<{ angle: number; lastPointerAngle: number } | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const [draggingAxis, setDraggingAxis] = useState<Axis | null>(null);
  const [draggingAngle, setDraggingAngle] = useState(false);

  // Coalesce pointer updates to one React update per animation frame. Without
  // this the huge canvas component re-renders on every native mousemove and the
  // handle feels sticky.
  const pendingChangeRef = useRef<Record<string, string> | null>(null);
  const changeFrameRef = useRef<number | null>(null);
  const latestOnChangeRef = useRef(onChange);
  latestOnChangeRef.current = onChange;

  const flushPendingChanges = () => {
    if (changeFrameRef.current !== null) {
      cancelAnimationFrame(changeFrameRef.current);
      changeFrameRef.current = null;
    }
    const pending = pendingChangeRef.current;
    pendingChangeRef.current = null;
    if (!pending) return;
    Object.entries(pending).forEach(([key, value]) => latestOnChangeRef.current(key, value));
  };

  const queueChange = (key: string, value: string) => {
    pendingChangeRef.current = { ...(pendingChangeRef.current ?? {}), [key]: value };
    if (changeFrameRef.current !== null) return;
    changeFrameRef.current = requestAnimationFrame(() => {
      changeFrameRef.current = null;
      const pending = pendingChangeRef.current;
      pendingChangeRef.current = null;
      if (!pending) return;
      Object.entries(pending).forEach(([k, v]) => latestOnChangeRef.current(k, v));
    });
  };

  const flushPendingRef = useRef<() => void>(() => {});
  flushPendingRef.current = flushPendingChanges;

  const readNumber = (key: string, fallback = 0): number => {
    const raw = values[key];
    if (raw === undefined || raw.trim() === '') return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const rows = Math.max(1, Math.round(readNumber('rows', 1)));
  const columns = Math.max(1, Math.round(readNumber('columns', 1)));
  const rowSpacing = readNumber('rowSpacing', 0);
  const columnSpacing = readNumber('columnSpacing', 0);
  const angle = readNumber('angle', 0);
  const xSpan = columns > 1 ? (columns - 1) * columnSpacing : 0;
  const ySpan = rows > 1 ? (rows - 1) * rowSpacing : 0;

  useEffect(() => {
    const input = inputRefs.current.columns;
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

  const beginAxisDrag = (e: React.MouseEvent<HTMLDivElement>, axis: Axis) => {
    e.preventDefault();
    e.stopPropagation();

    const quantityKey = axis === 'x' ? 'columns' : 'rows';
    const spacingKey = axis === 'x' ? 'columnSpacing' : 'rowSpacing';
    const quantity = Math.max(1, Math.round(readNumber(quantityKey, 1)));
    const spacing = readNumber(spacingKey, 0);
    const mode: DragMode = e.altKey ? 'span' : e.shiftKey ? 'quantity' : 'spacing';

    axisDragRef.current = {
      axis,
      mode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startSpacing: spacing,
      startQuantity: quantity,
      startSpan: Math.max(0, (quantity - 1) * spacing),
      boosted: false,
    };
    setDraggingAxis(axis);
    onActivate(mode === 'quantity' ? (axis === 'x' ? 0 : 2) : (axis === 'x' ? 1 : 3));
  };

  const handleAxisMouseMove = (e: MouseEvent) => {
    const drag = axisDragRef.current;
    if (!drag) return;
    e.preventDefault();

    const rawDelta = drag.axis === 'x' ? e.clientX - drag.startClientX : drag.startClientY - e.clientY;
    const unitDelta = rawDelta / Math.max(1e-6, pixelsPerUnit);
    const quantityKey = drag.axis === 'x' ? 'columns' : 'rows';
    const spacingKey = drag.axis === 'x' ? 'columnSpacing' : 'rowSpacing';

    if (drag.mode === 'quantity') {
      queueChange(quantityKey, String(clamp(Math.round(drag.startQuantity + rawDelta / 24), 1, 1000)));
      return;
    }

    // Dragging an axis that has only one item is an implicit request for a
    // visible array, so promote it to three items once. The other axis keeps
    // its preloaded 1 / 0 values and never has to be entered by hand.
    if (drag.startQuantity <= 1 && !drag.boosted) {
      drag.boosted = true;
      queueChange(quantityKey, '3');
    }
    const effectiveQuantity = Math.max(2, drag.startQuantity <= 1 ? 3 : drag.startQuantity);

    if (drag.mode === 'span') {
      const span = Math.max(0, drag.startSpan + unitDelta);
      queueChange(spacingKey, formatNumber(span / (effectiveQuantity - 1)));
      return;
    }
    queueChange(spacingKey, formatNumber(Math.max(0, drag.startSpacing + unitDelta)));
  };

  const handleAxisWheel = (e: React.WheelEvent<HTMLDivElement>, axis: Axis) => {
    e.stopPropagation();
    const quantityKey = axis === 'x' ? 'columns' : 'rows';
    const next = clamp(Math.round(readNumber(quantityKey, 1)) + (e.deltaY > 0 ? -1 : 1), 1, 1000);
    onChange(quantityKey, String(next));
    onActivate(axis === 'x' ? 0 : 2);
  };

  const beginAngleDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const ring = ringRef.current;
    if (!ring) return;
    const rect = ring.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    angleDragRef.current = {
      angle: readNumber('angle', 0),
      lastPointerAngle: (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI,
    };
    setDraggingAngle(true);
    onActivate(4);
  };

  const handleAngleMouseMove = (e: MouseEvent) => {
    const drag = angleDragRef.current;
    const ring = ringRef.current;
    if (!drag || !ring) return;
    e.preventDefault();
    const rect = ring.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const pointerAngle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
    // Accumulate the shortest delta so crossing the ±180° seam doesn't snap.
    const rawDelta = pointerAngle - drag.lastPointerAngle;
    const delta = ((rawDelta + 540) % 360) - 180;
    drag.angle -= delta;
    drag.lastPointerAngle = pointerAngle;
    const normalized = ((drag.angle % 360) + 360) % 360;
    queueChange('angle', String(Math.round(normalized)));
  };

  const latestMouseMoveRef = useRef<(event: MouseEvent) => void>(() => {});
  latestMouseMoveRef.current = (event: MouseEvent) => {
    if (axisDragRef.current) handleAxisMouseMove(event);
    else if (angleDragRef.current) handleAngleMouseMove(event);
  };

  useEffect(() => {
    const handleMove = (event: MouseEvent) => latestMouseMoveRef.current(event);
    const handleUp = () => {
      if (!axisDragRef.current && !angleDragRef.current) return;
      flushPendingRef.current();
      axisDragRef.current = null;
      angleDragRef.current = null;
      setDraggingAxis(null);
      setDraggingAngle(false);
    };
    // Capture: the widget stops propagation of React mouse events so the canvas
    // underneath doesn't react. Listening in the capture phase keeps the drag
    // alive even while the pointer stays over the widget.
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

  const selectOnFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.select();
  };

  const inputRowClass =
    'border-b border-cyan-300/40 bg-transparent text-center font-bold text-white outline-none transition-colors focus:border-violet-300';

  // Compact compass-style manipulator: the ring, the X/Y arrows and the
  // draggable direction dot all share one small origin.
  const ringCenterX = 52;
  const ringCenterY = 72;
  const ringRadius = 20;
  const angleRadians = (angle * Math.PI) / 180;
  // 0° sits on +X (right) and positive angles run counter-clockwise, matching
  // the array direction used by the command.
  const dotX = ringCenterX + ringRadius * Math.cos(angleRadians);
  const dotY = ringCenterY - ringRadius * Math.sin(angleRadians);

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
          <linearGradient id="arrayAxisX" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#67e8f9" stopOpacity="0.35" />
          </linearGradient>
          <linearGradient id="arrayAxisY" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#c4b5fd" stopOpacity="0.35" />
          </linearGradient>
        </defs>
        <line x1="52" y1="72" x2="112" y2="72" stroke="url(#arrayAxisX)" strokeWidth={draggingAxis === 'x' ? 3.5 : 2.5} strokeLinecap="round" />
        <path d="M122 72 L110 66 L110 78 Z" fill="#67e8f9" />
        <line x1="52" y1="72" x2="52" y2="22" stroke="url(#arrayAxisY)" strokeWidth={draggingAxis === 'y' ? 3.5 : 2.5} strokeLinecap="round" />
        <path d="M52 14 L46 26 L58 26 Z" fill="#c4b5fd" />
        <circle cx="52" cy="72" r="2.5" fill="#e0f2fe" />
      </svg>

      {/* X axis drag target */}
      <div
        aria-label="Drag X axis"
        title="Drag: column spacing · Shift: column quantity · Alt: total span · Scroll: quantity"
        className="absolute left-[72px] top-[60px] h-6 w-[50px] cursor-ew-resize touch-none"
        onMouseDown={e => beginAxisDrag(e, 'x')}
        onWheel={e => handleAxisWheel(e, 'x')}
      >
        <span className={`pointer-events-none absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 translate-x-1/2 rounded-full border bg-gray-950 shadow-[0_0_10px_rgba(34,211,238,0.75)] transition-all ${draggingAxis === 'x' ? 'scale-150 border-white' : 'border-cyan-200'}`} />
      </div>

      {/* Y axis drag target */}
      <div
        aria-label="Drag Y axis"
        title="Drag: row spacing · Shift: row quantity · Alt: total span · Scroll: quantity"
        className="absolute left-[40px] top-[8px] h-[46px] w-6 cursor-ns-resize touch-none"
        onMouseDown={e => beginAxisDrag(e, 'y')}
        onWheel={e => handleAxisWheel(e, 'y')}
      >
        <span className={`pointer-events-none absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 rounded-full border bg-gray-950 shadow-[0_0_10px_rgba(167,139,250,0.8)] transition-all ${draggingAxis === 'y' ? 'scale-150 border-white' : 'border-violet-200'}`} />
      </div>

      {/* Direction ring — the dot is the grab handle. */}
      <div
        ref={ringRef}
        data-testid="array-direction-ring"
        aria-hidden="true"
        className="pointer-events-none absolute left-[32px] top-[52px] h-10 w-10 rounded-full border border-cyan-300/50"
      />
      <div
        aria-label="Rotate array direction"
        title="Grab the dot and drag it around the ring"
        className={`absolute z-30 h-6 w-6 touch-none rounded-full ${draggingAngle ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ left: dotX - 12, top: dotY - 12 }}
        onMouseDown={beginAngleDrag}
      >
        <span className={`absolute inset-1 rounded-full border-2 transition-all ${draggingAngle ? 'scale-110 border-white bg-violet-300' : 'border-violet-200 bg-gray-950 shadow-[0_0_12px_rgba(196,181,253,0.9)]'}`}>
          <span className="absolute inset-[4px] rounded-full bg-violet-300" />
        </span>
      </div>

      <span className="pointer-events-none absolute left-[124px] top-[84px] text-[11px] font-black text-cyan-200">X</span>
      <span className="pointer-events-none absolute left-[58px] top-[8px] text-[11px] font-black text-violet-200">Y</span>

      {/* X values */}
      <div className="absolute left-[132px] right-1 top-[16px] flex items-center gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-300">COLS</span>
        <input
          ref={node => {
            inputRefs.current.columns = node;
          }}
          aria-label="Column quantity"
          value={values.columns ?? ''}
          onChange={e => onChange('columns', e.target.value)}
          onFocus={e => {
            onActivate(0);
            selectOnFocus(e);
          }}
          onKeyDown={handleInputKeyDown}
          inputMode="numeric"
          className={`${inputRowClass} w-8 text-[15px]`}
        />
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-300">GAP</span>
        <input
          aria-label="Column spacing"
          value={values.columnSpacing ?? ''}
          onChange={e => onChange('columnSpacing', e.target.value)}
          onFocus={e => {
            onActivate(1);
            selectOnFocus(e);
          }}
          onKeyDown={handleInputKeyDown}
          inputMode="decimal"
          className={`${inputRowClass} w-11 text-[15px]`}
        />
        <span className="text-[9px] text-cyan-200/80">{unitLabel}</span>
        <span className="ml-auto whitespace-nowrap text-[8px] uppercase tracking-[0.06em] text-gray-400">
          span <span className="text-[10px] text-gray-100">{formatNumber(xSpan)}</span>
        </span>
      </div>

      {/* Y values */}
      <div className="absolute left-[132px] right-1 top-[54px] flex items-center gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-300">ROWS</span>
        <input
          aria-label="Row quantity"
          value={values.rows ?? ''}
          onChange={e => onChange('rows', e.target.value)}
          onFocus={e => {
            onActivate(2);
            selectOnFocus(e);
          }}
          onKeyDown={handleInputKeyDown}
          inputMode="numeric"
          className={`${inputRowClass} w-8 text-[15px]`}
        />
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-300">GAP</span>
        <input
          aria-label="Row spacing"
          value={values.rowSpacing ?? ''}
          onChange={e => onChange('rowSpacing', e.target.value)}
          onFocus={e => {
            onActivate(3);
            selectOnFocus(e);
          }}
          onKeyDown={handleInputKeyDown}
          inputMode="decimal"
          className={`${inputRowClass} w-11 text-[15px]`}
        />
        <span className="text-[9px] text-cyan-200/80">{unitLabel}</span>
        <span className="ml-auto whitespace-nowrap text-[8px] uppercase tracking-[0.06em] text-gray-400">
          span <span className="text-[10px] text-gray-100">{formatNumber(ySpan)}</span>
        </span>
      </div>

      {/* Direction */}
      <div className="absolute left-2 top-[104px] flex items-center gap-1">
        <span className="text-[13px] leading-none text-violet-300">⟳</span>
        <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-gray-300">DIR</span>
        <input
          aria-label="Array direction"
          value={values.angle ?? ''}
          onChange={e => onChange('angle', e.target.value)}
          onFocus={e => {
            onActivate(4);
            selectOnFocus(e);
          }}
          onKeyDown={handleInputKeyDown}
          inputMode="decimal"
          className={`${inputRowClass} w-10 text-[15px]`}
        />
        <span className="text-[9px] text-cyan-200/80">°</span>
      </div>

      <button
        type="button"
        aria-label="Apply array"
        onClick={onSubmit}
        className="absolute right-2 top-[102px] flex h-7 items-center gap-1 rounded-lg border border-violet-400/60 bg-violet-500/25 px-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-violet-100 transition-colors hover:bg-violet-500/40"
      >
        <span className="text-[12px] leading-none">↵</span> apply
      </button>

      <div className="absolute inset-x-0 bottom-[2px] text-center text-[9px] uppercase tracking-[0.1em] text-gray-400">
        drag gap · type · shift qty · alt span · esc
      </div>
    </div>
  );
};

export default ArrayManipulator;
