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

/**
 * A rounded left-edge accent that follows the card's corner radius.
 * The 1px inset leaves a hairline of the host surface visible so the chip
 * never collides with the tool-shelf resize handle. The parent card must be
 * relative and overflow-hidden.
 */
export const SectionChip: React.FC<SectionChipProps> = ({ color, className = '' }) => {
  const value = color in SECTION_CHIP_COLORS
    ? SECTION_CHIP_COLORS[color as SectionChipColor]
    : color;

  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-y-0 left-px right-0 z-30 rounded-[inherit] border-l-[3px] ${className}`}
      style={{ borderLeftColor: value }}
    />
  );
};

export default SectionChip;
