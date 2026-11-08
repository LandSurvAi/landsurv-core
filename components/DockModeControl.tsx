import React from 'react';

/**
 * App-wide placement choices for tool dialogs and A2UI surfaces.
 *
 * Keeping this as a single control avoids each dialog inventing its own
 * Dock/Pop-out/Return-to-chat vocabulary.
 */
export type DockMode = 'floating' | 'chat' | 'toolshelf';

export const DOCK_MODE_OPTIONS: ReadonlyArray<{ mode: DockMode; label: string }> = [
  { mode: 'floating', label: 'Floating' },
  { mode: 'chat', label: 'Chat' },
  { mode: 'toolshelf', label: 'Toolshelf' },
];

interface DockModeControlProps {
  mode: DockMode;
  onChange: (mode: DockMode) => void;
  /** Extra classes for embedding in compact dialog headers. */
  className?: string;
  /** Disable interaction while preserving the selected state. */
  disabled?: boolean;
}

export const DockModeControl: React.FC<DockModeControlProps> = ({
  mode,
  onChange,
  className = '',
  disabled = false,
}) => (
  <div
    role="group"
    aria-label="Dock options"
    data-testid="dock-mode-control"
    data-dock-mode={mode}
    className={`inline-flex shrink-0 items-center rounded-md border border-white/15 bg-black/30 p-0.5 ${className}`}
  >
    {DOCK_MODE_OPTIONS.map(option => {
      const selected = option.mode === mode;
      return (
        <button
          key={option.mode}
          type="button"
          data-testid={`dock-mode-${option.mode}`}
          data-no-drag
          aria-pressed={selected}
          disabled={disabled}
          onClick={() => onChange(option.mode)}
          title={`Dock this dialog: ${option.label}`}
          className={`rounded px-1.5 py-0.5 text-[9px] font-semibold leading-none transition-colors disabled:cursor-not-allowed ${
            selected
              ? 'bg-cyan-500/20 text-cyan-200 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.35)]'
              : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'
          }`}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

export default DockModeControl;
