import React, { useEffect, useState } from 'react';

const TOOL_SHELF_TRANSITION_MS = 740;

interface AgentToolShelfProps {
  /** Whether the drawer should be open. */
  isOpen: boolean;
  /** Sidebar width in pixels, or a CSS width expression. */
  width: number | string;
  /** Starts the left-border width drag. */
  onResizeStart?: React.MouseEventHandler<HTMLDivElement>;
  /** Pixels to keep clear at the bottom so the shelf rests on the command bar. */
  bottomOffset?: number;
  /** Pixels to keep clear at the top so the shelf starts below the canvas toolbar. */
  topOffset?: number;
  children: React.ReactNode;
}

/**
 * Right-edge agent tool drawer.
 *
 * It keeps the old side panel's width and draggable left border, but stops at
 * the measured command-bar height instead of covering the command bar.
 */
export const AgentToolShelf: React.FC<AgentToolShelfProps> = ({
  isOpen,
  width,
  onResizeStart,
  bottomOffset = 0,
  topOffset = 0,
  children,
}) => {
  // Keep the drawer mounted through the slide-down animation, then unmount so
  // heavyweight docked tools stop rendering while the shelf is closed.
  const [isMounted, setIsMounted] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setIsMounted(true);
      const timer = window.setTimeout(() => setIsVisible(true), 16);
      return () => window.clearTimeout(timer);
    }
    setIsVisible(false);
    const timer = window.setTimeout(() => setIsMounted(false), TOOL_SHELF_TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  if (!isMounted) return null;

  return (
    <div
      data-testid="agent-tool-shelf"
      data-chat-panel
      aria-hidden={!isVisible}
      className="absolute right-0 z-30 overflow-hidden shadow-[-18px_0_50px_rgba(0,0,0,0.55)]"
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        top: Math.max(0, topOffset),
        bottom: Math.max(0, bottomOffset),
        maxWidth: '92vw',
        pointerEvents: isVisible ? 'auto' : 'none',
        cursor: 'default',
      }}
      onWheel={e => e.stopPropagation()}
    >
      <div
        data-testid="agent-tool-shelf-panel"
        className="relative flex h-full w-full flex-col border-l border-white/[0.07] bg-[#0a0f16] transition-transform duration-700 ease-in-out light-theme:border-gray-300"
        style={{
          transform: isVisible ? 'none' : 'translateY(100%)',
        }}
      >
        {onResizeStart && (
          <div
            data-testid="agent-tool-shelf-resize-handle"
            onMouseDown={onResizeStart}
            className="group absolute left-0 top-0 z-40 flex h-full w-2.5 cursor-col-resize items-center justify-center"
            title="Drag to resize Agent Tools"
            aria-label="Resize Agent Tools"
            role="separator"
            aria-orientation="vertical"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none flex h-14 w-[5px] items-center justify-center rounded-full border border-white/15 bg-[#0b1119]/90 shadow-[0_2px_10px_rgba(0,0,0,0.5)] transition-all duration-150 group-hover:h-16 group-hover:border-cyan-300/60 group-hover:bg-cyan-400/15"
            >
              <span className="h-7 w-px rounded-full bg-white/35 transition-colors group-hover:bg-cyan-200/90" />
            </span>
          </div>
        )}
        <div className="flex h-full min-h-0 w-full flex-col">{children}</div>
      </div>
    </div>
  );
};

export default AgentToolShelf;
