import React from 'react';

/**
 * Shared palette for the vertical edge rails used on agent cards.
 * Keep these distinct so sibling cards never share the same chip color.
 */
export const SECTION_CHIP_COLORS = {
  brand: '#fb923c',
  file: '#a78bfa',
  summary: '#22d3ee',
  confidence: '#34d399',
  table: '#60a5fa',
  tools: '#e879f9',
  closureOk: '#a3e635',
  closureWarn: '#fb7185',
  query: '#60a5fa',
  location: '#22d3ee',
  service: '#a78bfa',
  custom: '#e879f9',
  discovery: '#818cf8',
  area: '#f472b6',
  labels: '#2dd4bf',
  fields: '#c084fc',
  typography: '#38bdf8',
  preview: '#fb7185',
  parcels: '#34d399',
  status: '#94a3b8',
} as const;

export type SectionChipColor = keyof typeof SECTION_CHIP_COLORS;

interface SectionChipProps {
  color: SectionChipColor | string;
  className?: string;
}

const resolveChipColor = (color: SectionChipColor | string): string =>
  color in SECTION_CHIP_COLORS ? SECTION_CHIP_COLORS[color as SectionChipColor] : color;

/**
 * A rounded left-edge accent that follows the card's corner radius.
 * The 1px inset leaves a hairline of the host surface visible so the chip
 * never collides with the tool-shelf resize handle. The parent card must be
 * relative and overflow-hidden.
 */
export const SectionChip: React.FC<SectionChipProps> = ({ color, className = '' }) => (
  <span
    aria-hidden="true"
    className={`pointer-events-none absolute inset-y-0 left-px right-0 z-30 rounded-[inherit] border-l-[3px] ${className}`}
    style={{ borderLeftColor: resolveChipColor(color) }}
  />
);

// ---------------------------------------------------------------------------
// Deed-draft chip shell and controls
//
// The Deed tools render every workflow step as a compact chip card: dark
// surface, hairlines, a saturated left rail, and black-hole buttons. These
// primitives let the contour tools reuse that language without copying the
// class strings into every panel.
// ---------------------------------------------------------------------------

export type ChipTone =
  | 'neutral'
  | 'cyan'
  | 'emerald'
  | 'amber'
  | 'violet'
  | 'rose'
  | 'indigo'
  | 'blue'
  | 'red';

export const CHIP_CARD_CLASS =
  'panel-surface relative overflow-hidden rounded-xl border border-white/[0.08] bg-[#070e18]/90 py-2 pl-4 pr-3 shadow-sm light-theme:border-gray-300 light-theme:bg-white';

export const CHIP_FIELD_LABEL_CLASS =
  'text-[9px] font-extrabold uppercase tracking-[0.14em] text-white/55 light-theme:text-gray-500';

export const CHIP_INPUT_CLASS =
  'w-full rounded-md border border-white/10 bg-black/25 px-2 py-1.5 text-[11px] text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-40 light-theme:border-gray-300 light-theme:bg-white light-theme:text-gray-900';

export const CHIP_BUTTON_CLASS =
  'black-hole-btn inline-flex h-7 items-center justify-center gap-1 rounded-md px-2 text-[10px] font-semibold text-white/80 transition-colors disabled:cursor-not-allowed disabled:opacity-40';

/** Deed-style chip action. Active controls take the chip's accent. */
export const chipButtonClass = (tone: ChipTone = 'neutral', active = false): string => {
  const applied = active && tone === 'neutral' ? 'cyan' : tone;
  return `${CHIP_BUTTON_CLASS} black-hole-btn--${applied}${active ? ' text-white' : ''}`;
};

/** Wide dashed-footprint action used at the bottom of a chip stack. */
export const CHIP_WIDE_ACTION_CLASS =
  'inline-flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-400/35 bg-cyan-400/[0.07] px-3 py-2 text-[11px] font-bold text-cyan-100 transition-colors hover:border-cyan-300/60 hover:bg-cyan-400/[0.14] hover:text-white disabled:cursor-not-allowed disabled:opacity-40';

interface ChipCardProps {
  color: SectionChipColor | string;
  /** Small uppercase heading, e.g. "Contour Source". */
  title?: string;
  icon?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

/**
 * One deed-style chip card. The rail is decorative; controls stay inside the
 * padded body so they never sit under the accent.
 */
export const ChipCard: React.FC<ChipCardProps> = ({
  color,
  title,
  icon,
  aside,
  children,
  className = '',
  bodyClassName = '',
}) => (
  <section className={`${CHIP_CARD_CLASS} ${className}`}>
    <SectionChip color={color} />
    {(title || aside) && (
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {icon ? (
            <span className="shrink-0" style={{ color: resolveChipColor(color) }}>
              {icon}
            </span>
          ) : null}
          {title ? (
            <span className={CHIP_FIELD_LABEL_CLASS} style={{ color: resolveChipColor(color) }}>
              {title}
            </span>
          ) : null}
        </div>
        {aside}
      </div>
    )}
    <div className={`space-y-2 ${bodyClassName}`}>{children}</div>
  </section>
);

export default SectionChip;
