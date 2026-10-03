import React, { useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';

/**
 * FloatingPanel (v26.05.17.16) \u2014 reusable draggable / floatable dialog wrapper.
 *
 * Pilot for the "move all dialogs to floating" initiative. Wraps any child
 * content in a fixed-position card with a draggable header bar, configurable
 * initial position, optional close button, and an optional resize handle.
 *
 * Drag is implemented with pointer events (mouse + touch + pen) and bounded
 * to the viewport so the panel can't be dragged off-screen.
 *
 * Usage:
 *   <FloatingPanel title="Flood Tools" onClose={...} initialX={120} initialY={80}>
 *      <FloodPanel ... />
 *   </FloatingPanel>
 */

interface FloatingPanelProps {
  title: string;
  onClose?: () => void;
  children: React.ReactNode;
  /** Initial top-left X in pixels (default: 80). */
  initialX?: number;
  /** Initial top-left Y in pixels (default: 80). */
  initialY?: number;
  /** Optional CSS width (default 'min(420px, 92vw)'). */
  width?: string;
  /** Optional CSS max-height (default '80vh'). */
  maxHeight?: string;
  /** Tailwind accent class for the header bar (default 'border-cyan-500/30'). */
  accentBorder?: string;
  /** z-index override (default 9000 \u2014 below modals like LegalGate but above panels). */
  zIndex?: number;
  /** When true, the panel collapses to a small "shaded-text" chip at the bottom of the viewport. */
  minimized?: boolean;
  /** Toggle minimize/restore. When omitted, the minimize chevron in the header is hidden. */
  onToggleMinimize?: () => void;
  /** Horizontal position of the minimized chip ('left' | 'center' | 'right'). Default 'right'. */
  minimizedAnchor?: 'left' | 'center' | 'right';
  /** Bottom offset in px for the minimized chip stack — used to stack multiple chips. Default 16. */
  minimizedOffset?: number;
}

export const FloatingPanel: React.FC<FloatingPanelProps> = ({
  title,
  onClose,
  children,
  initialX = 80,
  initialY = 80,
  width = 'min(440px, 94vw)',
  maxHeight = '82vh',
  accentBorder = 'border-cyan-500/30',
  zIndex = 9000,
  minimized = false,
  onToggleMinimize,
  minimizedAnchor = 'right',
  minimizedOffset = 16,
}) => {
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: initialX, y: initialY });
  const dragState = useRef<{ active: boolean; offsetX: number; offsetY: number }>({ active: false, offsetX: 0, offsetY: 0 });
  const panelRef = useRef<HTMLDivElement | null>(null);
  const viewportMargin = 8;

  const clampToViewport = useCallback((x: number, y: number) => {
    const el = panelRef.current;
    if (!el) return { x, y };
    const rect = el.getBoundingClientRect();
    const maxX = Math.max(viewportMargin, window.innerWidth - rect.width - viewportMargin);
    const maxY = Math.max(viewportMargin, window.innerHeight - rect.height - viewportMargin);
    return {
      x: Math.max(viewportMargin, Math.min(x, maxX)),
      y: Math.max(viewportMargin, Math.min(y, maxY)),
    };
  }, [viewportMargin]);

  useLayoutEffect(() => {
    setPos((current) => clampToViewport(current.x, current.y));
  }, [clampToViewport, initialX, initialY]);

  const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    dragState.current = {
      active: true,
      offsetX: e.clientX - pos.x,
      offsetY: e.clientY - pos.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current.active) return;
    const next = clampToViewport(e.clientX - dragState.current.offsetX, e.clientY - dragState.current.offsetY);
    setPos(next);
  };
  const onHeaderPointerUp = () => { dragState.current.active = false; };

  useEffect(() => {
    // Re-clamp on window resize so panel stays visible.
    const handler = () => setPos(p => clampToViewport(p.x, p.y));
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [clampToViewport]);

  return (
    <div
      ref={panelRef}
      className={`fixed bg-gray-800 border ${accentBorder} rounded-lg shadow-2xl flex flex-col`}
      style={{
        left: pos.x,
        top: pos.y,
        width,
        maxWidth: 'calc(100vw - 16px)',
        maxHeight: minimized ? undefined : maxHeight,
        zIndex,
      }}
      role="dialog"
      aria-label={title}
    >
      <div
        className={`px-4 py-2.5 flex items-center justify-between cursor-grab active:cursor-grabbing select-none bg-gray-900/60 ${minimized ? 'rounded-lg' : 'rounded-t-lg border-b border-gray-700'}`}
        style={{ touchAction: 'none' }}
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-200">
          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          {title}
        </div>
        <div className="flex items-center gap-1">
          {onToggleMinimize && (
            <button
              data-no-drag
              onClick={onToggleMinimize}
              className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-700/60 transition-colors"
              aria-label={minimized ? 'Restore' : 'Shade'}
              title={minimized ? `Restore ${title}` : 'Shade (collapse in place)'}
            >
              {minimized ? (
                // Chevron down — restore
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7 7 7-7" />
                </svg>
              ) : (
                // Horizontal bar — shade
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                </svg>
              )}
            </button>
          )}
          {onClose && (
            <button
              data-no-drag
              onClick={onClose}
              className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-700/60 transition-colors"
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {!minimized && (
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
      )}
    </div>
  );
};

export default FloatingPanel;
