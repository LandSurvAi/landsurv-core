import React, { useEffect, useRef, useState } from 'react';
import type { CommandPromptSpec } from '../utils/canvasCommands';

interface CommandPromptHudProps {
  prompt: CommandPromptSpec;
  values: Record<string, string>;
  activeIndex: number;
  x: number;
  y: number;
  onChange: (key: string, value: string) => void;
  onActivate: (index: number) => void;
  /** Returns an error message to keep the prompt open and show inline. */
  onSubmit: (values?: Record<string, string>) => string | void;
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
 * Operation-anchored command input. A single-value command renders as a compact
 * strip; commands with several inputs use the arrow pad. Both stay deliberately
 * flat and neutral so they read as drafting UI rather than a dialog.
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
  const [error, setError] = useState<string | null>(null);

  // Give the widget first crack at the keyboard when a prompt opens. Clicking
  // the command line still hands input back there for typed values.
  useEffect(() => {
    setError(null);
    const timer = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
    return () => window.clearTimeout(timer);
  }, [prompt.id]);

  const fields = prompt.fields;
  if (fields.length === 0) return null;

  const safeIndex = Math.min(Math.max(activeIndex, 0), fields.length - 1);
  const field = fields[safeIndex];
  const positions = padLayout(fields.length);
  const overflow = fields.slice(4);
  const isSingleField = fields.length === 1;

  const activate = (index: number, focus: boolean) => {
    const next = ((index % fields.length) + fields.length) % fields.length;
    onActivate(next);
    if (focus) requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  };

  /**
   * Submit the value currently in the input, not just the last value React has
   * committed to the parent. This keeps Enter/Apply reliable when the field is
   * changed and submitted in the same interaction, and it lets a rejected
   * fillet keep the caret in the radius box instead of silently losing focus.
   */
  const submit = () => {
    const liveValue = inputRef.current?.value;
    const submitted = liveValue === undefined ? values : { ...values, [field.key]: liveValue };
    const message = onSubmit(submitted);
    setError(typeof message === 'string' && message.trim() ? message.trim() : null);
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (safeIndex >= fields.length - 1) submit();
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

  const stopCanvasEvents = {
    onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
    onMouseUp: (e: React.MouseEvent) => e.stopPropagation(),
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onPointerUp: (e: React.PointerEvent) => e.stopPropagation(),
    onMouseMove: (e: React.MouseEvent) => e.stopPropagation(),
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    onDoubleClick: (e: React.MouseEvent) => e.stopPropagation(),
  };

  if (isSingleField) {
    return (
      <div
        data-command-prompt
        style={{ left: x, top: y }}
        title={prompt.hint}
        className="absolute z-[60] w-[236px] select-none font-mono text-slate-100"
        {...stopCanvasEvents}
        onWheel={e => e.stopPropagation()}
      >
        <div className="overflow-hidden rounded-md border border-slate-600/80 bg-[#0b1118]/95 shadow-[0_10px_30px_rgba(0,0,0,0.55)] backdrop-blur-sm">
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-2.5 py-1.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-500/80" aria-hidden="true" />
            <span className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300">
              {field.label}
            </span>
          </div>

          <div className="flex items-center gap-1.5 p-2">
            <div className="flex h-8 min-w-0 flex-1 items-center rounded border border-slate-600/70 bg-black/25 px-2 transition-colors focus-within:border-cyan-600/70">
              <input
                ref={inputRef}
                value={values[field.key] ?? ''}
                onChange={e => {
                  setError(null);
                  onChange(field.key, e.target.value);
                }}
                onFocus={() => onActivate(safeIndex)}
                onKeyDown={handleKeyDown}
                inputMode={field.kind === 'number' ? 'decimal' : 'text'}
                placeholder={field.placeholder}
                className="min-w-0 flex-1 bg-transparent text-right text-[13px] font-medium tracking-wide text-slate-100 outline-none placeholder:text-slate-600"
                aria-label={field.label}
              />
              {field.unit ? (
                <span className="ml-1.5 shrink-0 text-[9px] text-slate-500">{field.unit}</span>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Apply input"
              onMouseDown={e => e.preventDefault()}
              onClick={submit}
              className="flex h-8 shrink-0 items-center gap-1 rounded border border-slate-600/80 bg-slate-700/35 px-2.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-700/65 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-600/70"
            >
              <span className="text-[11px] leading-none text-slate-400">↵</span>
              Apply
            </button>
          </div>

          {error && (
            <div role="alert" className="border-t border-rose-500/20 bg-rose-500/[0.06] px-2.5 py-1 font-sans text-[9px] leading-snug text-rose-300">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-white/[0.05] px-2.5 py-1 text-[8px] uppercase tracking-[0.12em] text-slate-500">
            <span>Enter apply</span>
            <span>Esc cancel</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-command-prompt
      style={{ left: x, top: y, textShadow: '0 1px 4px rgba(0,0,0,0.95)' }}
      title={prompt.hint}
      className="absolute z-[60] w-[232px] select-none font-mono text-gray-100"
      {...stopCanvasEvents}
      onWheel={e => {
        e.stopPropagation();
        if (e.deltaY !== 0) activate(safeIndex + (e.deltaY > 0 ? 1 : -1), false);
      }}
    >
      <div className="mb-1 flex items-baseline gap-2 px-0.5">
        <span className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300">
          {field.label}
        </span>
        <span className="ml-auto shrink-0 text-[9px] tabular-nums text-slate-500">
          {safeIndex + 1}/{fields.length}
        </span>
      </div>

      <div className="relative h-[154px] w-[232px]">
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
              className={`absolute flex h-[42px] w-[58px] flex-col items-center justify-center rounded-lg border transition-colors ${PAD_POSITION[position]} ${
                active
                  ? 'border-cyan-500/80 bg-cyan-500/15 text-cyan-50'
                  : filled
                  ? 'border-slate-500/45 bg-slate-900/90 text-slate-200 hover:border-slate-400/70'
                  : 'border-white/10 bg-slate-900/80 text-slate-400 hover:border-slate-400/60 hover:text-slate-200'
              }`}
            >
              <span className="text-[17px] leading-none">{PAD_GLYPH[position]}</span>
              <span className="mt-1 max-w-[52px] truncate text-[8px] font-semibold uppercase leading-none tracking-[0.08em]">
                {item.shortLabel ?? item.label}
              </span>
            </button>
          );
        })}

        <div className="absolute left-1/2 top-1/2 flex h-[56px] w-[100px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-lg border border-slate-500/60 bg-[#080d13]/95 shadow-[0_6px_18px_rgba(0,0,0,0.35)] transition-colors focus-within:border-cyan-500/75">
          <input
            ref={inputRef}
            value={values[field.key] ?? ''}
            onChange={e => {
              setError(null);
              onChange(field.key, e.target.value);
            }}
            onFocus={() => onActivate(safeIndex)}
            onKeyDown={handleKeyDown}
            inputMode={field.kind === 'number' ? 'decimal' : 'text'}
            placeholder={field.placeholder}
            className="h-7 w-full bg-transparent px-1 text-center text-[16px] font-semibold tracking-wide text-white outline-none placeholder:font-normal placeholder:text-slate-600"
            aria-label={field.label}
          />
          <span className="h-2.5 text-[8px] font-normal text-slate-500">{field.unit ?? ''}</span>
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
              className={`flex h-7 items-center gap-1 rounded-md border px-2 text-[8px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                active
                  ? 'border-cyan-500/75 bg-cyan-500/15 text-cyan-50'
                  : filled
                  ? 'border-slate-500/45 bg-slate-900/85 text-slate-200 hover:border-slate-400/70'
                  : 'border-white/10 bg-slate-900/80 text-slate-400 hover:border-slate-400/60'
              }`}
            >
              <span>{item.shortLabel ?? item.label}</span>
              <span className={`text-[9px] normal-case tracking-normal ${active ? 'text-cyan-100' : 'text-slate-400'}`}>
                {(values[item.key] ?? '').trim() || '—'}
                {item.unit ?? ''}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          aria-label="Apply input"
          onMouseDown={e => e.preventDefault()}
          onClick={submit}
          className="ml-auto flex h-7 shrink-0 items-center gap-1 rounded-md border border-slate-600/80 bg-slate-700/35 px-2 text-[8px] font-semibold uppercase tracking-[0.1em] text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-700/65 hover:text-white"
        >
          <span className="text-[10px] leading-none text-slate-400">↵</span> apply
        </button>
      </div>

      {error && (
        <div role="alert" className="mt-1 rounded border border-rose-500/25 bg-rose-500/[0.07] px-2 py-1 font-sans text-[9px] leading-snug text-rose-300">
          {error}
        </div>
      )}

      <div className="mt-1 flex items-center justify-center gap-1.5 text-[8px] uppercase tracking-[0.13em] text-slate-500">
        <span>scroll</span>
        <span className="text-slate-700">·</span>
        <span>tab</span>
        <span className="text-slate-700">·</span>
        <span>esc</span>
      </div>
    </div>
  );
};

export default CommandPromptHud;
