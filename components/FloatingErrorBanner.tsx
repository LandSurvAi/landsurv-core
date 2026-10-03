import React, { useEffect, useRef, useState } from 'react';

interface FloatingErrorBannerProps {
  message: string;
  onClose: () => void;
  onActivate?: () => void;
  actionLabel?: string;
}

/**
 * Single-line, draggable floating error banner.
 * - Drag by the body (anywhere except the buttons) to reposition.
 * - Roll-up button collapses to a compact pill showing just an icon.
 * - Close button dismisses entirely.
 * Stays red. Replaces the old top-banner error display.
 */
const FloatingErrorBanner: React.FC<FloatingErrorBannerProps> = ({ message, onClose, onActivate, actionLabel }) => {
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 16 });
  const [collapsed, setCollapsed] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ active: boolean; offsetX: number; offsetY: number; startX: number; startY: number; moved: boolean }>({
    active: false,
    offsetX: 0,
    offsetY: 0,
    startX: 0,
    startY: 0,
    moved: false,
  });

  // Center horizontally on first render
  useEffect(() => {
    if (initialized || !containerRef.current) return;
    const w = containerRef.current.offsetWidth;
    setPos({ x: Math.max(8, (window.innerWidth - w) / 2), y: 16 });
    setInitialized(true);
  }, [initialized]);

  // Re-center horizontally only on width changes if not yet moved by user
  useEffect(() => {
    const onResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.offsetWidth;
      setPos((p) => ({ x: Math.min(Math.max(8, p.x), window.innerWidth - w - 8), y: p.y }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    dragState.current = {
      active: true,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current.active || !containerRef.current) return;
    if (Math.abs(e.clientX - dragState.current.startX) > 4 || Math.abs(e.clientY - dragState.current.startY) > 4) {
      dragState.current.moved = true;
    }
    const w = containerRef.current.offsetWidth;
    const h = containerRef.current.offsetHeight;
    const nx = Math.min(
      Math.max(0, e.clientX - dragState.current.offsetX),
      window.innerWidth - w,
    );
    const ny = Math.min(
      Math.max(0, e.clientY - dragState.current.offsetY),
      window.innerHeight - h,
    );
    setPos({ x: nx, y: ny });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragState.current.active = false;
    try { (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  // Strip any leading "Initialization Error:" / similar prefix for cleaner one-line display,
  // but keep the original in the title tooltip.
  const displayMessage = message.replace(/^\s*(Initialization\s+Error|Error):\s*/i, '');

  const activate = () => {
    if (!onActivate) return;
    if (dragState.current.moved) {
      dragState.current.moved = false;
      return;
    }
    onActivate();
  };

  return (
    <div
      ref={containerRef}
      style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 9999 }}
      className="select-none"
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('button')) return;
          activate();
        }}
        onKeyDown={(event) => {
          if (!onActivate || (event.key !== 'Enter' && event.key !== ' ')) return;
          event.preventDefault();
          activate();
        }}
        role={onActivate ? 'button' : undefined}
        tabIndex={onActivate ? 0 : undefined}
        aria-label={onActivate ? actionLabel : undefined}
        title={onActivate ? `${message} Click to open key options; drag to move.` : message}
        className={[
          'flex items-center gap-2 bg-red-800/95 text-red-100 border border-red-600',
          `rounded-md shadow-lg ${onActivate ? 'cursor-pointer hover:bg-red-700/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300' : 'cursor-move'} backdrop-blur-sm`,
          collapsed ? 'px-2 py-1' : 'pl-3 pr-1 py-1',
        ].join(' ')}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="flex-shrink-0"
        >
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>

        {!collapsed && (
          <span
            className="text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis"
            style={{ maxWidth: 'min(70vw, 720px)' }}
          >
            {displayMessage}
          </span>
        )}

        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expand' : 'Roll up'}
          className="ml-1 px-1.5 py-0.5 rounded hover:bg-red-700/70 text-red-100 text-xs leading-none"
        >
          {collapsed ? '▢' : '▁'}
        </button>
        <button
          type="button"
          onClick={onClose}
          title="Dismiss"
          className="px-1.5 py-0.5 rounded hover:bg-red-700/70 text-red-100 text-xs leading-none"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default FloatingErrorBanner;
