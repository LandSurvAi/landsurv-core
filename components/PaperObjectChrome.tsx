import React from 'react';
import { Lock, Unlock } from 'lucide-react';

interface PaperObjectLockButtonProps {
  locked: boolean;
  /** Human-readable object name used in the tooltip and aria-label. */
  name: string;
  onToggle: () => void;
}

/**
 * Lock toggle shown on every paper-space block. Unlocked, it fades in with the
 * block's hover; locked, it stays visible so the state is never a mystery.
 */
export const PaperObjectLockButton: React.FC<PaperObjectLockButtonProps> = ({
  locked,
  name,
  onToggle,
}) => (
  <button
    type="button"
    aria-label={locked ? `Unlock ${name}` : `Lock ${name}`}
    aria-pressed={locked}
    title={locked
      ? `${name} locked — click to unlock moving and scaling`
      : `Lock ${name} to prevent moving and scaling`}
    onMouseDown={e => e.stopPropagation()}
    onClick={e => {
      e.stopPropagation();
      onToggle();
    }}
    className={`absolute right-1 top-1 z-10 flex h-[18px] w-[18px] items-center justify-center rounded border shadow-sm transition-opacity ${
      locked
        ? 'border-cyan-400/50 bg-slate-950/90 text-cyan-300 opacity-100'
        : 'border-white/25 bg-slate-950/90 text-slate-200 opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
    }`}
  >
    {locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
  </button>
);

interface PaperResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
  title: string;
}

/** Bottom-right proportional scale handle for a paper-space block. */
export const PaperResizeHandle: React.FC<PaperResizeHandleProps> = ({ onMouseDown, title }) => (
  <div
    role="separator"
    aria-label={title}
    title={title}
    onMouseDown={onMouseDown}
    className="absolute bottom-0 right-0 z-10 h-2.5 w-2.5 cursor-nwse-resize rounded-sm border border-amber-700 bg-amber-400 opacity-0 transition-opacity group-hover:opacity-100"
  />
);
