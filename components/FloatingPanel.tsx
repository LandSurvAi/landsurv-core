import React, { useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import { Maximize2 } from 'lucide-react';
import { ArrowTopRightOnSquareIcon, ArrowDownOnSquareIcon } from './icons.tsx';
import { DockModeControl, type DockMode } from './DockModeControl.tsx';

/**
 * FloatingPanel — reusable draggable / floatable / dockable dialog wrapper.
 *
 * Supports both floating on the canvas (`isDocked = false`) and docking into
 * the right-hand Agent Tool Docking Station (`isDocked = true`), matching the
 * Boundary Agent Deed Draft dialog UX across all agent tools.
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
  /** Whether the panel is docked inside the Agent Tool Docking Station instead of floating. */
  isDocked?: boolean;
  /** Callback to dock/undock the panel between the Tool Docking Station and the canvas. */
  onToggleDock?: () => void;
  /** Tri-state placement. Overrides isDocked when supplied. */
  dockMode?: DockMode;
  /** Move this dialog between Floating, Chat, and Toolshelf. */
  onDockModeChange?: (mode: DockMode) => void;
  /** Expand the hosted tool to its fullscreen presentation from the header. */
  onFullscreen?: () => void;
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
  isDocked: isDockedProp = false,
  onToggleDock,
  dockMode,
  onDockModeChange,
  onFullscreen,
}) => {
  const mode: DockMode = dockMode ?? (isDockedProp ? 'toolshelf' : 'floating');
  const isDocked = mode !== 'floating';
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
    // Measure the live canvas header so dialogs never tuck under it — this
    // includes the environment banner above the header when one is shown.
    const header = typeof document !== 'undefined'
      ? document.querySelector<HTMLElement>('[data-canvas-header]')
      : null;
    const headerSafeTop = Math.max(viewportMargin, (header?.getBoundingClientRect().bottom ?? 56) + 12);
    return {
      x: Math.max(viewportMargin, Math.min(x, maxX)),
      y: Math.max(headerSafeTop, Math.min(y, maxY)),
    };
  }, [viewportMargin]);

  useLayoutEffect(() => {
    if (mode !== 'floating') return;
    setPos((current) => clampToViewport(current.x, current.y));
  }, [clampToViewport, initialX, initialY, mode]);

  const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode !== 'floating') return;
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    dragState.current = {
      active: true,
      offsetX: e.clientX - pos.x,
      offsetY: e.clientY - pos.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode !== 'floating' || !dragState.current.active) return;
    const next = clampToViewport(e.clientX - dragState.current.offsetX, e.clientY - dragState.current.offsetY);
    setPos(next);
  };
  const onHeaderPointerUp = () => { dragState.current.active = false; };

  useEffect(() => {
    if (mode !== 'floating') return;
    // Re-clamp on window resize so panel stays visible.
    const handler = () => setPos(p => clampToViewport(p.x, p.y));
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [clampToViewport, mode]);

  return (
    <div
      ref={mode === 'floating' ? panelRef : undefined}
      data-dock-mode={mode}
      className={
        isDocked
          ? `w-full flex flex-col overflow-hidden border-b border-gray-800 bg-gray-900/95 ${
              mode === 'chat' ? 'rounded-lg border border-white/[0.08]' : ''
            }`
          : `fixed bg-gray-800 border ${accentBorder} rounded-lg shadow-2xl flex flex-col`
      }
      style={
        isDocked
          ? undefined
          : {
              left: pos.x,
              top: pos.y,
              width,
              maxWidth: 'calc(100vw - 16px)',
              maxHeight: minimized ? undefined : maxHeight,
              zIndex,
            }
      }
      role="dialog"
      aria-label={title}
    >
      <div
        className={`px-3.5 py-2.5 flex items-center justify-between gap-2 select-none bg-gray-950/80 ${
          mode !== 'floating'
            ? 'cursor-default border-b border-gray-800/80'
            : `cursor-grab active:cursor-grabbing ${minimized ? 'rounded-lg' : 'rounded-t-lg border-b border-gray-700'}`
        }`}
        style={{ touchAction: mode === 'floating' ? 'none' : 'auto' }}
        onPointerDown={mode === 'floating' ? onHeaderPointerDown : undefined}
        onPointerMove={mode === 'floating' ? onHeaderPointerMove : undefined}
        onPointerUp={mode === 'floating' ? onHeaderPointerUp : undefined}
        onPointerCancel={mode === 'floating' ? onHeaderPointerUp : undefined}
      >
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-gray-200 truncate">
          {mode === 'floating' && (
            <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
          <span className="truncate">{title}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {(onDockModeChange || onToggleDock) && (
            onDockModeChange ? (
              <DockModeControl mode={mode} onChange={onDockModeChange} />
            ) : (
              <button
                data-no-drag
                type="button"
                onClick={onToggleDock}
                className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-cyan-400 transition-colors"
                title={isDocked ? `Pop out ${title} to a floating window on canvas` : `Dock ${title} into Agent Tool Station`}
                aria-label={isDocked ? `Pop out ${title}` : `Dock ${title}`}
              >
                {isDocked ? (
                  <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                ) : (
                  <ArrowDownOnSquareIcon className="w-4 h-4" />
                )}
              </button>
            )
          )}
          {onFullscreen && (
            <button
              data-no-drag
              type="button"
              onClick={onFullscreen}
              data-testid="floating-panel-fullscreen"
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-cyan-950/60 hover:text-cyan-300"
              title={`Open ${title} fullscreen`}
              aria-label={`Open ${title} fullscreen`}
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}
          {onToggleMinimize && (
            <button
              data-no-drag
              type="button"
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
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-rose-400 p-1 rounded hover:bg-rose-950/60 transition-colors"
              aria-label="Close"
              title={`Close ${title}`}
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
