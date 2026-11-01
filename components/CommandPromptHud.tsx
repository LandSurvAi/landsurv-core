import React, { useEffect, useRef } from 'react';
import type { CommandPromptSpec } from '../utils/canvasCommands';

interface CommandPromptHudProps {
  prompt: CommandPromptSpec;
  values: Record<string, string>;
  activeIndex: number;
  x: number;
  y: number;
  onChange: (key: string, value: string) => void;
  onActivate: (index: number) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

type PadPosition = 'top' | 'right' | 'bottom' | 'left';

const PAD_POSITION: Record<PadPosition, string> = {
  top: 'left-1/2 top-0 -translate-x-1/2',
  right: 'right-0 top-1/2 -translate-y-1/2',
  bottom: 'bottom-0 left-1/2 -translate-x-1/2',
  left: 'left-0 top-1/2 -translate-y-1/2',
};

const PAD_GLYPH: Record<PadPosition, string> = {
  top: '▲',
  right: '▶',
  bottom: '▼',
  left: '◀',
};

/** Map up to four fields onto a bold XY-style arrow pad. */
const padLayout = (count: number): PadPosition[] => {
  if (count >= 4) return ['top', 'right', 'bottom', 'left'];
  if (count === 3) return ['top', 'right', 'bottom'];
  if (count === 2) return ['left', 'right'];
  return [];
};

/**
 * Bold, readable field widget. The arrows form an XY pad; clicking one swaps the
 * single centre input to that field. Fields beyond four (for example ARRAY's
 * direction angle) appear as compact chips under the pad. No dialog frame.
 */
export const CommandPromptHud: React.FC<CommandPromptHudProps> = ({
  prompt,
  values,
  activeIndex,
  x,
  y,
  onChange,
  onActivate,
  onSubmit,
  onCancel,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Give the widget first crack at the keyboard when a prompt opens. Clicking
  // the command line still hands input back there for typed values.
  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [prompt.id]);

  const fields = prompt.fields;
  if (fields.length === 0) return null;

  const safeIndex = Math.min(Math.max(activeIndex, 0), fields.length - 1);
  const field = fields[safeIndex];
  const positions = padLayout(fields.length);
  const overflow = fields.slice(4);

  const activate = (index: number, focus: boolean) => {
    const next = ((index % fields.length) + fields.length) % fields.length;
    onActivate(next);
    if (focus) requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (safeIndex >= fields.length - 1) onSubmit();
      else activate(safeIndex + 1, true);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      activate(safeIndex + (e.shiftKey ? -1 : 1), true);
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      activate(safeIndex + (e.key === 'ArrowUp' ? -1 : 1), true);
    }
  };

  return (
    <div
      data-command-prompt
      style={{ left: x, top: y, textShadow: '0 1px 4px rgba(0,0,0,0.95)' }}
      title={prompt.hint}
      className="absolute z-[60] w-[240px] select-none font-mono text-gray-100"
      onMouseDown={e => e.stopPropagation()}
      onMouseUp={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      onPointerUp={e => e.stopPropagation()}
      onMouseMove={e => e.stopPropagation()}
      onWheel={e => {
        e.stopPropagation();
        if (e.deltaY !== 0) activate(safeIndex + (e.deltaY > 0 ? 1 : -1), false);
      }}
      onClick={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
    >
      <div className="mb-1 flex items-baseline gap-2 px-0.5">
        <span className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-violet-200">{field.label}</span>
        <span className="ml-auto shrink-0 text-[10px] tabular-nums text-gray-400">
          {safeIndex + 1}/{fields.length}
        </span>
      </div>

      <div className="relative h-[178px] w-[240px]">
        {positions.map((position, index) => {
          const item = fields[index];
          const active = index === safeIndex;
          const filled = (values[item.key] ?? '').trim().length > 0;
          return (
            <button
              key={item.key}
              type="button"
              aria-label={`Go to ${item.label}`}
              title={item.label}
              onClick={() => activate(index, true)}
              className={`absolute flex h-[48px] w-[62px] flex-col items-center justify-center rounded-xl border transition-all ${PAD_POSITION[position]} ${
                active
                  ? 'border-violet-300/90 bg-violet-500/35 text-white shadow-[0_0_20px_rgba(167,139,250,0.6)]'
                  : filled
                  ? 'border-violet-400/45 bg-gray-900/85 text-violet-100 hover:border-violet-300/80'
                  : 'border-white/15 bg-gray-900/80 text-gray-300 hover:border-violet-400/70 hover:text-violet-100'
              }`}
            >
              <span className="text-[20px] leading-none">{PAD_GLYPH[position]}</span>
              <span className="mt-1 max-w-[56px] truncate text-[9px] font-bold uppercase leading-none tracking-[0.08em]">
                {item.shortLabel ?? item.label}
              </span>
            </button>
          );
        })}

        <div className="absolute left-1/2 top-1/2 flex h-[66px] w-[108px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-2xl border-2 border-cyan-300/60 bg-gray-950/90 shadow-[0_0_24px_rgba(34,211,238,0.2)] transition-colors focus-within:border-violet-300">
          <input
            ref={inputRef}
            value={values[field.key] ?? ''}
            onChange={e => onChange(field.key, e.target.value)}
            onFocus={() => onActivate(safeIndex)}
            onKeyDown={handleKeyDown}
            inputMode={field.kind === 'number' ? 'decimal' : 'text'}
            placeholder={field.placeholder}
            className="h-8 w-full bg-transparent px-1 text-center text-[19px] font-bold tracking-wide text-white outline-none placeholder:font-normal placeholder:text-gray-600"
            aria-label={field.label}
          />
          <span className="h-2.5 text-[9px] font-normal text-cyan-200/85">{field.unit ?? ''}</span>
        </div>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-1">
        {overflow.map((item, offset) => {
          const index = 4 + offset;
          const active = index === safeIndex;
          const filled = (values[item.key] ?? '').trim().length > 0;
          return (
            <button
              key={item.key}
              type="button"
              aria-label={`Go to ${item.label}`}
              title={item.label}
              onClick={() => activate(index, true)}
              className={`flex h-7 items-center gap-1 rounded-lg border px-2 text-[9px] font-bold uppercase tracking-[0.1em] transition-colors ${
                active
                  ? 'border-violet-300 bg-violet-500/35 text-white shadow-[0_0_14px_rgba(167,139,250,0.45)]'
                  : filled
                  ? 'border-violet-400/40 bg-gray-900/85 text-violet-100 hover:border-violet-300/80'
                  : 'border-white/15 bg-gray-900/80 text-gray-300 hover:border-violet-400/70'
              }`}
            >
              <span>{item.shortLabel ?? item.label}</span>
              <span className={`text-[10px] normal-case tracking-normal ${active ? 'text-white' : 'text-gray-300'}`}>
                {(values[item.key] ?? '').trim() || '—'}
                {item.unit ?? ''}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          aria-label="Apply input"
          onClick={onSubmit}
          className="ml-auto flex h-7 shrink-0 items-center gap-1 rounded-lg border border-violet-400/60 bg-violet-500/25 px-2 text-[9px] font-bold uppercase tracking-[0.12em] text-violet-100 transition-colors hover:bg-violet-500/40"
        >
          <span className="text-[11px] leading-none">↵</span> apply
        </button>
      </div>

      <div className="mt-1 text-center text-[9px] uppercase tracking-[0.16em] text-gray-400">
        scroll · tab · esc
      </div>
    </div>
  );
};

export default CommandPromptHud;
