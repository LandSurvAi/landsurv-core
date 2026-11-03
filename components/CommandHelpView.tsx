import React from 'react';
import type { HelpAccent, HelpGroup } from '../utils/canvasCommands';

/**
 * Structured command reference handed from the command line to the text editor
 * so HELP opens as the same grouped cards instead of a plain-text dump.
 */
export interface CommandReference {
  groups: HelpGroup[];
  notes?: string[];
  /** Plain-text source the reference was rendered from. */
  text?: string;
}

const HELP_ACCENTS: Record<HelpAccent, { text: string; dot: string; rule: string; chip: string }> = {
  cyan: { text: 'text-cyan-300', dot: 'bg-cyan-400', rule: 'border-cyan-500/40', chip: 'bg-cyan-500/10' },
  emerald: { text: 'text-emerald-300', dot: 'bg-emerald-400', rule: 'border-emerald-500/40', chip: 'bg-emerald-500/10' },
  amber: { text: 'text-amber-300', dot: 'bg-amber-400', rule: 'border-amber-500/40', chip: 'bg-amber-500/10' },
  sky: { text: 'text-sky-300', dot: 'bg-sky-400', rule: 'border-sky-500/40', chip: 'bg-sky-500/10' },
  violet: { text: 'text-violet-300', dot: 'bg-violet-400', rule: 'border-violet-500/40', chip: 'bg-violet-500/10' },
  rose: { text: 'text-rose-300', dot: 'bg-rose-400', rule: 'border-rose-500/40', chip: 'bg-rose-500/10' },
};

interface CommandHelpViewProps {
  groups: HelpGroup[];
  notes?: string[];
  className?: string;
  /** The terminal readout shows the "Commands:" caption above the grid. */
  showCaption?: boolean;
}

/** Formatted HELP reference: colored group headers, command chips, italic notes. */
export const CommandHelpView: React.FC<CommandHelpViewProps> = ({
  groups,
  notes,
  className = '',
  showCaption = false,
}) => (
  <div className={`space-y-2 ${className}`}>
    {showCaption && (
      <div className="flex items-center gap-2 font-mono text-[10px] text-gray-500">
        <span className="font-extrabold uppercase tracking-[0.18em] text-gray-300">Commands:</span>
        <span className="text-gray-600">·</span>
        <span className="italic">grouped reference — links below open it in the editor</span>
      </div>
    )}
    <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
      {groups.map(group => {
        const accent = HELP_ACCENTS[group.accent] ?? HELP_ACCENTS.cyan;
        return (
          <div key={group.title} className={`overflow-hidden rounded-md border bg-gray-950/50 ${accent.rule}`}>
            <div className={`flex items-center gap-2 border-b border-gray-800/80 px-2 py-1 ${accent.chip}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
              <span className={`font-mono text-[10px] font-extrabold uppercase tracking-[0.16em] underline decoration-2 underline-offset-4 ${accent.text}`}>
                {group.title}
              </span>
              <span className="ml-auto font-mono text-[9px] font-medium italic text-gray-500">
                {group.entries.length} {group.entries.length === 1 ? 'command' : 'commands'}
              </span>
            </div>
            <div className="divide-y divide-gray-800/50">
              {group.entries.map(entry => (
                <div key={entry.command} className="flex items-baseline gap-2 px-2 py-[3px]">
                  <span className={`w-[108px] shrink-0 truncate font-mono text-[11px] font-bold underline decoration-dotted underline-offset-2 ${accent.text}`} title={entry.command}>
                    {entry.command}
                  </span>
                  <span className="min-w-0 flex-1 font-mono text-[10px] leading-snug text-gray-300">
                    {entry.description}
                    {entry.note ? <span className="ml-1 font-mono text-[9px] italic text-gray-500">{entry.note}</span> : null}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
    {notes?.length ? (
      <div className="rounded-md border border-gray-800 bg-gray-950/40 px-2 py-1.5">
        {notes.map(note => (
          <div key={note} className="flex gap-2 py-[1px] font-mono text-[9px] italic leading-snug text-gray-500">
            <span className="text-cyan-500">›</span>
            <span>{note}</span>
          </div>
        ))}
      </div>
    ) : null}
  </div>
);

export default CommandHelpView;
