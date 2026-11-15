import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTimelineVisibility } from './timelineVisibility.ts';

const TimelineGlyph: React.FC<{ className?: string }> = ({ className = 'h-3 w-3' }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    className={className}
  >
    <path d="M2 8h12" />
    <circle cx="4" cy="8" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="8" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

const Chevron: React.FC<{ className?: string }> = ({ className = 'h-2.5 w-2.5' }) => (
  <svg aria-hidden="true" viewBox="0 0 12 12" fill="none" className={className}>
    <path d="m2.5 4.5 3.5 3 3.5-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

interface TimelineControlProps {
  /** Lets the command bar stop clipping the popover while either menu is open. */
  onOpenChange?: (open: boolean) => void;
}

export const TimelineControl: React.FC<TimelineControlProps> = ({ onOpenChange }) => {
  const { enabled, visible, enable, disable, toggleVisible } = useTimelineVisibility();
  const [isIntroOpen, setIsIntroOpen] = useState(false);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<{ right: number; bottom: number } | null>(null);

  useEffect(() => {
    if (!isIntroOpen && !isOptionsOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (
        rootRef.current?.contains(event.target as Node)
        || popoverRef.current?.contains(event.target as Node)
      ) return;
      setIsIntroOpen(false);
      setIsOptionsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsIntroOpen(false);
      setIsOptionsOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isIntroOpen, isOptionsOpen]);

  useEffect(() => {
    onOpenChange?.(isIntroOpen || isOptionsOpen);
  }, [isIntroOpen, isOptionsOpen, onOpenChange]);

  useEffect(() => () => onOpenChange?.(false), [onOpenChange]);

  // The popovers are portaled so the command bar's stacking context and the
  // right-hand tool shelf can never cover them. Measure the control so the
  // menu still opens directly above its trigger after the portal render.
  useLayoutEffect(() => {
    if (!isIntroOpen && !isOptionsOpen) {
      setPopoverAnchor(null);
      return;
    }
    if (typeof window === 'undefined') return;

    const update = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPopoverAnchor({
        right: Math.max(8, window.innerWidth - rect.right),
        bottom: Math.max(8, window.innerHeight - rect.top + 8),
      });
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [isIntroOpen, isOptionsOpen]);

  const popoverPosition: React.CSSProperties = {
    right: popoverAnchor?.right ?? 16,
    bottom: popoverAnchor?.bottom ?? 96,
  };

  if (!enabled) {
    return (
      <div ref={rootRef} className="relative flex items-center">
        <button
          type="button"
          data-no-drag
          data-testid="timeline-trigger"
          aria-haspopup="dialog"
          aria-expanded={isIntroOpen}
          onClick={() => setIsIntroOpen(open => !open)}
          className={`inline-flex h-5 items-center gap-1 rounded border px-1.5 text-[9px] font-bold uppercase tracking-wider transition-colors ${
            isIntroOpen
              ? 'border-white/40 bg-white/[0.10] text-white'
              : 'border-white/20 bg-white/[0.04] text-white/75 hover:border-white/40 hover:bg-white/[0.08] hover:text-white'
          }`}
          title="Enable the feature timeline"
        >
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-white/35" />
          <TimelineGlyph />
          <span>Timeline</span>
        </button>

        {isIntroOpen && typeof document !== 'undefined' && createPortal(
          <div
            ref={popoverRef}
            data-testid="timeline-intro"
            role="dialog"
            aria-label="Enable feature timeline"
            style={popoverPosition}
            className="fixed z-[9998] w-[min(20rem,calc(100vw-1rem))] overflow-hidden rounded-lg border border-white/25 bg-[#080e15]/95 text-white shadow-2xl backdrop-blur-md"
          >
            <div className="border-b border-white/10 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded border border-cyan-300/30 bg-cyan-400/10 text-cyan-200">
                  <TimelineGlyph />
                </span>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/85">Feature Timeline</div>
                  <div className="mt-0.5 text-[10px] text-white/45">A visual history of your drawing</div>
                </div>
              </div>
            </div>
            <div className="space-y-2 px-3 py-2.5">
              <p className="text-[11px] leading-relaxed text-white/70">
                Track imports, sketches, questions, shrinkwrap, AOI decisions, and drawing steps as a visual history. Selecting a step only inspects it; the canvas moves only when you choose <span className="font-semibold text-cyan-200">Go to</span>.
              </p>
              <p className="text-[10px] leading-relaxed text-white/40">
                The timeline stays off until you enable it.
              </p>
              <div className="flex items-center justify-end gap-1.5 pt-0.5">
                <button
                  type="button"
                  data-testid="timeline-not-now"
                  onClick={() => setIsIntroOpen(false)}
                  className="rounded border border-white/10 px-2 py-1 text-[10px] font-semibold text-white/55 transition-colors hover:border-white/25 hover:text-white"
                >
                  Not now
                </button>
                <button
                  type="button"
                  data-testid="timeline-enable"
                  onClick={() => {
                    enable();
                    setIsIntroOpen(false);
                  }}
                  className="rounded border border-cyan-300/45 bg-cyan-400/[0.14] px-2.5 py-1 text-[10px] font-bold text-cyan-100 transition-colors hover:bg-cyan-400/[0.24]"
                >
                  Enable timeline
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative flex items-center">
      <button
        type="button"
        data-no-drag
        data-testid="timeline-trigger"
        aria-pressed={visible}
        onClick={() => {
          setIsOptionsOpen(false);
          toggleVisible();
        }}
        className={`inline-flex h-5 items-center gap-1 rounded-l border px-1.5 text-[9px] font-bold uppercase tracking-wider transition-colors ${
          visible
            ? 'border-cyan-400/30 bg-cyan-400/[0.06] text-cyan-100 hover:border-cyan-300/55 hover:bg-cyan-400/[0.12]'
            : 'border-white/15 bg-white/[0.03] text-white/55 hover:border-white/30 hover:text-white/80'
        }`}
        title={visible ? 'Hide the timeline' : 'Show the timeline'}
      >
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${
            visible ? 'bg-cyan-300 shadow-[0_0_6px_#67e8f9]' : 'bg-white/30'
          }`}
        />
        <TimelineGlyph />
        <span>Timeline</span>
      </button>
      <button
        type="button"
        data-no-drag
        data-testid="timeline-options-trigger"
        aria-label="Timeline options"
        aria-haspopup="menu"
        aria-expanded={isOptionsOpen}
        onClick={() => {
          setIsIntroOpen(false);
          setIsOptionsOpen(open => !open);
        }}
        className={`inline-flex h-5 items-center justify-center rounded-r border border-l-0 px-1 transition-colors ${
          isOptionsOpen
            ? 'border-white/40 bg-white/[0.10] text-white'
            : 'border-white/20 bg-white/[0.04] text-white/45 hover:border-white/35 hover:text-white'
        }`}
        title="Timeline options"
      >
        <Chevron className={`h-2.5 w-2.5 transition-transform ${isOptionsOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOptionsOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          data-testid="timeline-options-menu"
          role="menu"
          style={popoverPosition}
          className="fixed z-[9998] w-48 overflow-hidden rounded-lg border border-white/25 bg-[#080e15]/95 text-white shadow-2xl backdrop-blur-md"
        >
          <div className="border-b border-white/10 px-2.5 py-1.5">
            <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/40">Timeline</div>
            <div className="mt-0.5 text-[10px] text-white/65">{visible ? 'Shown on the canvas' : 'Hidden on the canvas'}</div>
          </div>
          <div className="p-1">
            <button
              type="button"
              data-testid="timeline-disable"
              role="menuitem"
              onClick={() => {
                disable();
                setIsOptionsOpen(false);
              }}
              className="w-full rounded px-2 py-1.5 text-left text-[10px] text-white/45 transition-colors hover:bg-rose-400/[0.08] hover:text-rose-200"
            >
              Disable timeline
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default TimelineControl;
