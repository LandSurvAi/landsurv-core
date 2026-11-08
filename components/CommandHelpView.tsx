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
  /** Command-bar text scale, carried into the editor view. */
  textScale?: number;
}

const HELP_ACCENTS: Record<HelpAccent, { text: string; dot: string; rule: string; chip: string }> = {
  cyan: { text: 'text-cyan-300', dot: 'bg-cyan-300', rule: 'border-cyan-500/45', chip: 'bg-cyan-500/[0.09]' },
  emerald: { text: 'text-emerald-300', dot: 'bg-emerald-300', rule: 'border-emerald-500/45', chip: 'bg-emerald-500/[0.09]' },
  amber: { text: 'text-amber-300', dot: 'bg-amber-300', rule: 'border-amber-500/45', chip: 'bg-amber-500/[0.09]' },
  sky: { text: 'text-sky-300', dot: 'bg-sky-300', rule: 'border-sky-500/45', chip: 'bg-sky-500/[0.09]' },
  violet: { text: 'text-violet-300', dot: 'bg-violet-300', rule: 'border-violet-500/45', chip: 'bg-violet-500/[0.09]' },
  rose: { text: 'text-rose-300', dot: 'bg-rose-300', rule: 'border-rose-500/45', chip: 'bg-rose-500/[0.09]' },
};

interface CommandHelpViewProps {
  groups: HelpGroup[];
  notes?: string[];
  className?: string;
  /** The terminal readout shows the \"Commands:\" caption above the grid. */
  showCaption?: boolean;
  /** Matches the command bar's text-size setting. */
  textScale?: number;
}

/** Formatted HELP reference: colored group cards, readable rows, and notes. */
export const CommandHelpView: React.FC<CommandHelpViewProps> = ({
  groups,
  notes,
  className = '',
  showCaption = false,
  textScale,
}) => {
  const scale = Number.isFinite(textScale)
    ? Math.min(1.6, Math.max(0.75, textScale as number))
    : 1.15;
  const px = (size: number) => `${(size * scale).toFixed(2)}px`;
  const commandCount = groups.reduce((total, group) => total + group.entries.length, 0);

  return (
    <div className={`space-y-2.5 ${className}`}>
      {showCaption && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-white/15 pb-2 font-mono">
          <span style={{ fontSize: px(10.5) }} className="font-extrabold uppercase tracking-[0.2em] text-cyan-300">
            Commands:
          </span>
          <span style={{ fontSize: px(10) }} className="font-semibold text-slate-300">
            Command reference
          </span>
          <span className="text-slate-500">·</span>
          <span style={{ fontSize: px(9.5) }} className="text-slate-400">
            grouped by workflow
          </span>
          <span
            style={{ fontSize: px(9.5) }}
            className="ml-auto rounded border border-white/15 bg-white/[0.04] px-1.5 py-0.5 font-semibold tabular-nums text-slate-300"
          >
            {groups.length} groups · {commandCount} commands
          </span>
        </div>
      )}
      <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-2">
        {groups.map(group => {
          const accent = HELP_ACCENTS[group.accent] ?? HELP_ACCENTS.cyan;
          return (
            <div key={group.title} className={`overflow-hidden rounded-md border bg-[#071018] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${accent.rule}`}>
              <div className={`flex items-center gap-2 border-b px-2.5 py-1.5 ${accent.rule} ${accent.chip}`}>
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${accent.dot}`} />
                <span style={{ fontSize: px(10.5) }} className={`font-mono font-extrabold uppercase tracking-[0.16em] ${accent.text}`}>
                  {group.title}
                </span>
                <span
                  style={{ fontSize: px(9) }}
                  className="ml-auto rounded border border-white/10 bg-black/20 px-1.5 py-0.5 font-mono font-semibold tabular-nums text-slate-300"
                >
                  {group.entries.length}
                </span>
              </div>
              <div>
                {group.entries.map(entry => (
                  <div
                    key={entry.command}
                    className="grid items-start gap-2 border-b border-white/[0.045] px-2.5 py-[4px] last:border-b-0 odd:bg-white/[0.018] hover:bg-white/[0.055]"
                    style={{ gridTemplateColumns: `${Math.round(118 * scale)}px minmax(0, 1fr)` }}
                  >
                    <span
                      style={{ fontSize: px(11) }}
                      className={`break-words font-mono font-bold leading-snug underline decoration-dotted underline-offset-2 ${accent.text}`}
                      title={entry.command}
                    >
                      {entry.command}
                    </span>
                    <span style={{ fontSize: px(10.5) }} className="min-w-0 break-words font-mono leading-snug text-slate-100">
                      {entry.description}
                      {entry.note ? (
                        <span style={{ fontSize: px(9.5) }} className="ml-1.5 font-mono italic text-slate-400">
                          {entry.note}
                        </span>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {notes?.length ? (
        <div className="rounded-md border border-white/15 bg-white/[0.035] px-2.5 py-2">
          <div style={{ fontSize: px(9) }} className="mb-1 font-mono font-extrabold uppercase tracking-[0.18em] text-slate-300">
            Notes
          </div>
          {notes.map(note => (
            <div key={note} style={{ fontSize: px(9.5) }} className="flex gap-2 py-[2px] font-mono leading-snug text-slate-300">
              <span className="shrink-0 text-cyan-300">›</span>
              <span>{note}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default CommandHelpView;
