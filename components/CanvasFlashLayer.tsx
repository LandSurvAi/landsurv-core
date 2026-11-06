import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, X } from 'lucide-react';
import {
  canvasFlashBus,
  closeCanvasFlashInput,
  type CanvasFlashInput,
  type CanvasFlashMessage,
  type CanvasFlashState,
} from '../services/canvasFlashes.ts';
import {
  buildA2UIInputInitialValues,
  buildA2UIInputSubmission,
  validateA2UIInputValues,
} from '../utils/a2uiInputForm.ts';

const EDGE_MARGIN = 8;
const CURSOR_X_OFFSET = 14;
const CURSOR_Y_OFFSET = 16;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max));

const fieldClass =
  'h-6 min-w-0 flex-1 rounded border border-white/[0.1] bg-black/40 px-1.5 text-[10.5px] text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-400/60 focus:bg-black/55';

const TONE_STYLES: Record<CanvasFlashMessage['tone'], { dot: string; text: string }> = {
  info: { dot: 'bg-sky-400', text: 'text-slate-200' },
  success: { dot: 'bg-emerald-400', text: 'text-emerald-100' },
  error: { dot: 'bg-rose-400', text: 'text-rose-100' },
};

/**
 * Host for cursor-anchored canvas surfaces. Mounted once inside the drawing
 * canvas; portals to <body> so no canvas transform or stacking context can
 * clip the inputs. Everything here is intentionally smaller than the command
 * bar chrome — these exist only to collect a value without a trip across the
 * screen.
 */
export const CanvasFlashLayer: React.FC = () => {
  const state = useSyncExternalStore<CanvasFlashState>(
    canvasFlashBus.subscribe,
    canvasFlashBus.getSnapshot,
    canvasFlashBus.getSnapshot,
  );
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const hasContent = Boolean(state.input || state.message);
  const activeKey = state.input
    ? `input:${state.input.id}`
    : state.message
      ? `message:${state.message.id}`
      : '';

  const place = useCallback(() => {
    const panel = panelRef.current;
    if (!panel || !hasContent) return;
    const anchor = state.anchor ?? {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    let left = clamp(
      anchor.x + CURSOR_X_OFFSET,
      EDGE_MARGIN,
      Math.max(EDGE_MARGIN, window.innerWidth - width - EDGE_MARGIN),
    );
    let top = clamp(
      anchor.y + CURSOR_Y_OFFSET,
      EDGE_MARGIN,
      Math.max(EDGE_MARGIN, window.innerHeight - height - EDGE_MARGIN),
    );

    // Avoid overlapping the bottom-left Quick Thought bubble when both are visible.
    if (typeof document !== 'undefined') {
      const thoughtEl = document.querySelector('[data-testid="agent-thought-bubble"]');
      if (thoughtEl) {
        const rect = thoughtEl.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const overlapsX = left < rect.right + 8 && left + width > rect.left - 8;
          const overlapsY = top < rect.bottom + 8 && top + height > rect.top - 8;
          if (overlapsX && overlapsY) {
            left = clamp(
              rect.right + 12,
              EDGE_MARGIN,
              Math.max(EDGE_MARGIN, window.innerWidth - width - EDGE_MARGIN),
            );
            top = clamp(
              Math.min(top, rect.top),
              EDGE_MARGIN,
              Math.max(EDGE_MARGIN, window.innerHeight - height - EDGE_MARGIN),
            );
          }
        }
      }
    }

    setPosition({ left, top });
  }, [hasContent, state.anchor]);

  useLayoutEffect(() => {
    place();
  }, [place, activeKey]);

  // Address bars and the software keyboard move the visible viewport without
  // moving the canvas, so re-clamp whenever the visual viewport changes.
  useEffect(() => {
    if (!hasContent) return;
    const viewport = window.visualViewport;
    window.addEventListener('resize', place);
    viewport?.addEventListener('resize', place);
    viewport?.addEventListener('scroll', place);
    return () => {
      window.removeEventListener('resize', place);
      viewport?.removeEventListener('resize', place);
      viewport?.removeEventListener('scroll', place);
    };
  }, [hasContent, place]);

  if (!hasContent || typeof document === 'undefined') return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[10015]">
      <div
        ref={panelRef}
        data-testid="canvas-flash"
        className="pointer-events-auto absolute"
        style={{ left: position.left, top: position.top }}
      >
        {state.message && (
          <CanvasFlashMessagePill
            message={state.message}
            className={state.input ? 'mb-1' : undefined}
          />
        )}
        {state.input && <CanvasFlashInputSurface key={state.input.id} input={state.input} />}
      </div>
    </div>,
    document.body,
  );
};

const CanvasFlashMessagePill: React.FC<{
  message: CanvasFlashMessage;
  className?: string;
}> = ({ message, className }) => {
  const tone = TONE_STYLES[message.tone];
  return (
    <div
      data-testid="canvas-flash-message"
      role="status"
      className={`pointer-events-none flex max-w-[240px] items-center gap-1.5 rounded-md border border-white/[0.12] bg-[#071019]/95 px-2 py-1 font-mono text-[9.5px] leading-none shadow-[0_8px_20px_rgba(0,0,0,0.5)] backdrop-blur ${tone.text} ${className ?? ''}`}
    >
      <span aria-hidden="true" className={`h-1 w-1 shrink-0 rounded-full ${tone.dot}`} />
      <span className="truncate">{message.text}</span>
    </div>
  );
};

const CanvasFlashInputSurface: React.FC<{ input: CanvasFlashInput }> = ({ input }) => {
  const formId = useId().replace(/:/g, '');
  const [values, setValues] = useState<Record<string, string>>(() =>
    buildA2UIInputInitialValues({
      fields: input.fields,
      requireOneOf: input.requireOneOf,
    }),
  );
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLElement | null>(null);
  const hasHeader = Boolean(input.title || input.hint);

  // Desktop only: the surface exists to be typed into, but a phone must not
  // raise its software keyboard unprompted. Tapping a field still focuses it.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.matchMedia?.('(pointer: fine)')?.matches) return;
    const timer = window.setTimeout(
      () => firstFieldRef.current?.focus({ preventScroll: true }),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [input.id]);

  const updateValue = (id: string, value: string) => {
    setValues(previous => ({ ...previous, [id]: value }));
    setError(null);
  };

  const submit = () => {
    const formLike = { fields: input.fields, requireOneOf: input.requireOneOf };
    const validationError = validateA2UIInputValues(formLike, values);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (
      input.fields.length === 1 &&
      input.fields[0].id === 'answer' &&
      input.fields[0].type !== 'checkbox'
    ) {
      const single = (values.answer ?? '').trim();
      if (single) {
        input.onSubmit(single);
        closeCanvasFlashInput(input.id);
        return;
      }
    }
    input.onSubmit(buildA2UIInputSubmission(formLike, values));
    closeCanvasFlashInput(input.id);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLFormElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeCanvasFlashInput(input.id);
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      submit();
    }
  };

  const captureFirstField = (node: HTMLInputElement | HTMLSelectElement | null) => {
    firstFieldRef.current = node;
  };

  return (
    <form
      data-testid="canvas-flash-input"
      onSubmit={event => {
        event.preventDefault();
        submit();
      }}
      onKeyDown={handleKeyDown}
      onMouseDown={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
      onWheel={event => event.stopPropagation()}
      className="w-[232px] max-w-[calc(100vw-16px)] overflow-hidden rounded-md border border-cyan-400/25 bg-[#071019]/[0.97] font-mono text-slate-200 shadow-[0_14px_34px_rgba(0,0,0,0.62)] backdrop-blur-md"
    >
      {hasHeader && (
        <div className="flex items-start gap-1.5 px-2 pb-1 pt-1.5">
          <div className="min-w-0 flex-1">
            {input.title && (
              <div
                className="truncate text-[8.5px] font-bold uppercase tracking-[0.12em] text-cyan-300/90"
                title={input.title}
              >
                {input.title}
              </div>
            )}
            {input.hint && (
              <div
                className={`truncate text-[8.5px] leading-snug text-slate-500 ${input.title ? 'mt-0.5' : ''}`}
                title={input.hint}
              >
                {input.hint}
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => closeCanvasFlashInput(input.id)}
            className="-mr-0.5 -mt-0.5 rounded p-0.5 text-slate-500 transition-colors hover:text-slate-200"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      )}

      <div
        className={`flex flex-col gap-1 px-2 ${hasHeader ? '' : 'pt-1.5'} ${input.fields.length === 0 ? 'pb-1.5' : ''}`}
        style={{ maxHeight: '44vh', overflowY: 'auto' }}
      >
        {input.options && input.options.length > 0 && (
          <div className="flex flex-col gap-1">
            {input.options.map((opt, optIdx) => (
              <button
                key={optIdx}
                type="button"
                onClick={() => {
                  input.onSubmit(opt);
                  closeCanvasFlashInput(input.id);
                }}
                className="flex min-h-[22px] w-full items-center gap-1.5 rounded border border-white/15 bg-white/[0.04] px-1.5 py-1 text-left text-[9.5px] font-medium leading-snug text-slate-100 transition-colors hover:border-cyan-400/45 hover:bg-cyan-400/15 hover:text-white"
              >
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[2px] border border-white/20 bg-white/[0.06] font-mono text-[7.5px] font-bold text-cyan-200">
                  {String.fromCharCode(65 + optIdx)}
                </span>
                <span className="line-clamp-2 min-w-0 flex-1">{opt}</span>
              </button>
            ))}
          </div>
        )}
        {input.fields.map((field, index) => {
          const value = values[field.id] ?? '';
          if (field.type === 'checkbox') {
            return (
              <label key={field.id} className="flex min-w-0 cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={value === 'true'}
                  onChange={event => updateValue(field.id, event.target.checked ? 'true' : 'false')}
                  className="h-3 w-3 accent-cyan-400"
                />
                <span className="truncate text-[9px] text-slate-300">{field.label}</span>
              </label>
            );
          }

          const inputId = `${formId}-${field.id}`;
          return (
            <label key={field.id} htmlFor={inputId} className="flex min-w-0 items-center gap-1.5">
              <span
                className="w-[72px] shrink-0 truncate text-[7.5px] font-semibold uppercase tracking-[0.06em] text-slate-400"
                title={field.label}
              >
                {field.label}
                {field.required ? ' *' : ''}
              </span>
              {field.type === 'select' ? (
                <select
                  id={inputId}
                  ref={index === 0 ? captureFirstField : undefined}
                  value={value}
                  onChange={event => updateValue(field.id, event.target.value)}
                  className={`${fieldClass} appearance-none`}
                >
                  {(field.options ?? []).map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="relative min-w-0 flex-1">
                  <input
                    id={inputId}
                    ref={index === 0 ? captureFirstField : undefined}
                    type={field.type === 'number' ? 'number' : 'text'}
                    inputMode={field.type === 'number' ? 'decimal' : undefined}
                    step={field.type === 'number' ? 'any' : undefined}
                    value={value}
                    onChange={event => updateValue(field.id, event.target.value)}
                    placeholder={field.placeholder}
                    autoComplete="off"
                    spellCheck={false}
                    className={`${fieldClass} ${field.unit ? 'pr-7' : ''}`}
                  />
                  {field.unit && (
                    <span className="pointer-events-none absolute inset-y-0 right-1 flex items-center text-[7px] uppercase tracking-wide text-slate-500">
                      {field.unit}
                    </span>
                  )}
                </div>
              )}
            </label>
          );
        })}
      </div>

      {error && (
        <div role="alert" className="px-2 pt-1 text-[8px] leading-snug text-rose-300">
          {error}
        </div>
      )}

      {input.fields.length > 0 && (
        <div className="p-1 pt-1.5">
          <button
            type="submit"
            className="flex h-[22px] w-full items-center justify-center gap-1 rounded border border-cyan-400/35 bg-cyan-400/15 px-2 text-[8.5px] font-bold uppercase tracking-[0.12em] text-cyan-100 transition-colors hover:bg-cyan-400/25 hover:text-white"
          >
            {input.submitLabel || 'Send'}
            <ArrowRight className="h-2.5 w-2.5" />
          </button>
        </div>
      )}
    </form>
  );
};

export default CanvasFlashLayer;
