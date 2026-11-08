import React from 'react';

export type QuickChipTone = 'neutral' | 'accent' | 'danger';

export interface QuickChipProps {
  label: string;
  onClick: () => void;
  tone?: QuickChipTone;
  title?: string;
  disabled?: boolean;
}

const TONE_CLASS: Record<QuickChipTone, string> = {
  neutral:
    'border-white/15 bg-white/[0.04] text-slate-300 hover:border-teal-400/60 hover:text-teal-200',
  accent:
    'border-teal-400/50 bg-teal-500/15 text-teal-200 hover:bg-teal-500/25',
  danger:
    'border-rose-400/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20',
};

/** Small pill action used by Quick Thought-style rows. */
export const QuickChip: React.FC<QuickChipProps> = ({
  label,
  onClick,
  tone = 'neutral',
  title,
  disabled = false,
}) => (
  <button
    type="button"
    data-no-drag
    onClick={onClick}
    title={title ?? label}
    disabled={disabled}
    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${TONE_CLASS[tone]}`}
  >
    {label}
  </button>
);

export default QuickChip;
