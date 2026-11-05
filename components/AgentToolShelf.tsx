import React, { useEffect, useState } from 'react';

interface AgentToolShelfProps {
  /** Whether the drawer should be open. */
  isOpen: boolean;
  /** Sidebar width in pixels. */
  width: number;
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
    const timer = window.setTimeout(() => setIsMounted(false), 320);
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
        width,
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
        className="relative flex h-full w-full flex-col border-l border-white/[0.07] bg-[#0a0f16] transition-transform duration-300 ease-out light-theme:border-gray-300"
        style={{
          transform: isVisible ? 'translateY(0)' : 'translateY(100%)',
        }}
      >
        {onResizeStart && (
          <div
            onMouseDown={onResizeStart}
            className="absolute left-0 top-0 z-40 h-full w-2 cursor-col-resize bg-transparent transition-colors hover:bg-cyan-400/40"
            title="Drag to resize Agent Tools"
            aria-label="Resize Agent Tools"
            role="separator"
            aria-orientation="vertical"
          />
        )}
        <div className="flex h-full min-h-0 w-full flex-col">{children}</div>
      </div>
    </div>
  );
};

export default AgentToolShelf;
