import React from 'react';
import type { GenerationBlock } from '../types.ts';

interface GenerationBlockSummaryProps {
  generation?: GenerationBlock | null;
  accent?: 'cyan' | 'stone';
}

const ACCENTS = {
  cyan: {
    border: 'border-cyan-500/30',
    background: 'bg-cyan-950/20',
    label: 'text-cyan-300/80',
    title: 'text-cyan-100',
    badge: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
  },
  stone: {
    border: 'border-stone-500/30',
    background: 'bg-stone-950/25',
    label: 'text-stone-300/80',
    title: 'text-stone-100',
    badge: 'border-stone-500/30 bg-stone-500/10 text-stone-300',
  },
} as const;

/**
 * Read-only provenance for the generation currently linked to a canvas block.
 * Editing geometry never destroys this record; rerunning the tool creates or
 * replaces the source generation instead.
 */
export const GenerationBlockSummary: React.FC<GenerationBlockSummaryProps> = ({
  generation,
  accent = 'cyan',
}) => {
  if (!generation) return null;
  const tone = ACCENTS[accent];

  return (
    <div className={`rounded-md border p-3 space-y-2 ${tone.border} ${tone.background}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`text-[10px] font-bold uppercase tracking-wide ${tone.label}`}>
            Linked generation
          </div>
          <div className={`truncate text-xs font-semibold ${tone.title}`} title={generation.name}>
            {generation.name}
          </div>
          <div className="mt-0.5 text-[10px] text-gray-500">
            {new Date(generation.createdAt).toLocaleString()}
          </div>
        </div>
        <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${tone.badge}`}>
          Non-destructive
        </span>
      </div>

      <div className="grid grid-cols-[5.25rem,1fr] gap-x-2 gap-y-1 text-[10px]">
        {generation.parameters.map((parameter, index) => (
          <React.Fragment key={`${parameter.label}-${index}`}>
            <span className="text-gray-500">{parameter.label}</span>
            <span className="break-words text-gray-200">{parameter.value}</span>
          </React.Fragment>
        ))}
      </div>

      <p className="border-t border-white/5 pt-1.5 text-[10px] leading-snug text-gray-500">
        Double-click any line or hatch in this block to return to the tools and inputs that built it.
      </p>
    </div>
  );
};

export default GenerationBlockSummary;
