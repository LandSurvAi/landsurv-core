import React, { useEffect, useRef, useState } from 'react';

interface PolygonInputHudProps {
  x: number;
  y: number;
  sides: number;
  typedDiameter: string;
  liveDiameter: number | null;
  unitLabel: string;
  onSidesChange: (sides: number) => void;
  onDiameterChange: (value: string) => void;
  onApply: (diameterText: string) => void;
  onCancel: () => void;
}

const clampSides = (value: number) => Math.max(3, Math.min(256, Math.round(value)));

/** Operation-anchored polygon inputs: side count and circumscribed diameter. */
export const PolygonInputHud: React.FC<PolygonInputHudProps> = ({
  x,
  y,
  sides,
  typedDiameter,
  liveDiameter,
  unitLabel,
  onSidesChange,
  onDiameterChange,
  onApply,
  onCancel,
}) => {
  const [sidesText, setSidesText] = useState(String(sides));
  const [diameterText, setDiameterText] = useState(
    typedDiameter || (liveDiameter !== null ? liveDiameter.toFixed(2) : ''),
  );
  const sidesFocused = useRef(false);
  const diameterFocused = useRef(false);

  useEffect(() => {
    if (!sidesFocused.current) setSidesText(String(sides));
  }, [sides]);

  useEffect(() => {
    if (diameterFocused.current) return;
    setDiameterText(typedDiameter || (liveDiameter !== null ? liveDiameter.toFixed(2) : ''));
  }, [typedDiameter, liveDiameter]);

  const setSides = (next: number) => {
    const safe = clampSides(next);
    setSidesText(String(safe));
    onSidesChange(safe);
  };

  const commitSidesDraft = () => {
    sidesFocused.current = false;
    const parsed = Number(sidesText);
    if (!Number.isFinite(parsed)) {
      setSidesText(String(sides));
      return;
    }
    setSides(parsed);
  };

  const commitDiameterDraft = () => {
    diameterFocused.current = false;
    const parsed = Number(diameterText);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setDiameterText(typedDiameter || (liveDiameter !== null ? liveDiameter.toFixed(2) : ''));
      onDiameterChange('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      onApply(diameterText);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (e.currentTarget.getAttribute('aria-label') !== 'Polygon sides') return;
      e.preventDefault();
      e.stopPropagation();
      const delta = e.key === 'ArrowUp' ? 1 : -1;
      setSides(sides + delta);
    }
  };

  return (
    <div
      data-canvas-ui
      className="absolute z-[70] select-none font-mono text-gray-100"
      style={{ left: x, top: y }}
      onMouseDown={e => e.stopPropagation()}
      onMouseUp={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      onPointerUp={e => e.stopPropagation()}
      onMouseMove={e => e.stopPropagation()}
      onWheel={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 rounded-lg border border-violet-400/55 bg-gray-950/95 px-2 py-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.55)] backdrop-blur-md">
        <span className="rounded border border-violet-400/45 bg-violet-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-violet-200">
          Polygon
        </span>

        <div className="flex items-center gap-1">
          <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-gray-400">Sides</span>
          <button
            type="button"
            aria-label="Decrease polygon sides"
            onClick={() => setSides(sides - 1)}
            className="flex h-5 w-5 items-center justify-center rounded border border-white/15 bg-white/5 text-[13px] leading-none text-gray-300 transition-colors hover:border-violet-300 hover:text-white"
          >
            −
          </button>
          <input
            aria-label="Polygon sides"
            value={sidesText}
            onChange={e => {
              const value = e.target.value;
              setSidesText(value);
              const parsed = Number(value);
              if (Number.isInteger(parsed) && parsed >= 3 && parsed <= 256) onSidesChange(parsed);
            }}
            onFocus={e => {
              sidesFocused.current = true;
              e.currentTarget.select();
            }}
            onBlur={commitSidesDraft}
            onKeyDown={handleKeyDown}
            inputMode="numeric"
            className="h-6 w-8 rounded border border-violet-400/40 bg-gray-900 text-center text-[12px] font-bold text-white outline-none transition-colors focus:border-violet-300"
          />
          <button
            type="button"
            aria-label="Increase polygon sides"
            onClick={() => setSides(sides + 1)}
            className="flex h-5 w-5 items-center justify-center rounded border border-white/15 bg-white/5 text-[13px] leading-none text-gray-300 transition-colors hover:border-violet-300 hover:text-white"
          >
            +
          </button>
        </div>

        <div className="h-5 w-px bg-white/15" />

        <div className="flex items-center gap-1">
          <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-gray-400">DIA</span>
          <input
            aria-label="Polygon diameter"
            title="Diameter"
            value={diameterText}
            onChange={e => {
              const value = e.target.value;
              setDiameterText(value);
              onDiameterChange(value);
            }}
            onFocus={e => {
              diameterFocused.current = true;
              e.currentTarget.select();
            }}
            onBlur={commitDiameterDraft}
            onKeyDown={handleKeyDown}
            inputMode="decimal"
            className="h-6 w-14 rounded border border-cyan-300/40 bg-gray-900 text-center text-[12px] font-bold text-cyan-100 outline-none transition-colors focus:border-cyan-200"
          />
          <span className="text-[8px] uppercase tracking-[0.06em] text-cyan-200/75">{unitLabel}</span>
        </div>

        <button
          type="button"
          aria-label="Apply polygon"
          onClick={() => onApply(diameterText)}
          className="flex h-6 items-center gap-1 rounded border border-violet-400/55 bg-violet-500/25 px-1.5 text-[9px] font-bold uppercase tracking-[0.08em] text-violet-100 transition-colors hover:bg-violet-500/40"
        >
          <span className="text-[11px] leading-none">↵</span>
        </button>
      </div>
      <div className="mt-1 px-1 text-[8px] uppercase tracking-[0.09em] text-gray-500">
        drag edge · enter apply · esc cancel
      </div>
    </div>
  );
};

export default PolygonInputHud;
