import React from 'react';

interface ScoutWordmarkProps {
  /** Visual size; the wordmark must read at 96 px and 200 px strip heights. */
  size?: 'xs' | 'sm' | 'md';
  /** Hide the literal name when the surrounding heading already says Scout. */
  label?: boolean;
  className?: string;
}

const SIZE: Record<NonNullable<ScoutWordmarkProps['size']>, string> = {
  xs: 'text-[9px] gap-1',
  sm: 'text-[10px] gap-1.5',
  md: 'text-[11px] gap-1.5',
};

/**
 * Scout's wordmark: a radar ring and the name. This is the only character
 * reference inside Quick Thought and the audit panel — no walking figure.
 */
export const ScoutWordmark: React.FC<ScoutWordmarkProps> = ({
  size = 'sm',
  label = true,
  className = '',
}) => (
  <span
    data-testid="scout-wordmark"
    className={`inline-flex items-center font-black uppercase tracking-[0.14em] text-cyan-300 ${SIZE[size]} ${className}`.trim()}
  >
    <span
      aria-hidden="true"
      className="relative flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-cyan-300/50"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
      <span className="absolute left-1/2 top-1/2 h-[1px] w-2.5 -translate-x-1/2 -translate-y-1/2 bg-cyan-200/70" />
      <span className="absolute left-1/2 top-1/2 h-2.5 w-[1px] -translate-x-1/2 -translate-y-1/2 bg-cyan-200/70" />
    </span>
    {label && <span>Scout</span>}
  </span>
);

export default ScoutWordmark;
