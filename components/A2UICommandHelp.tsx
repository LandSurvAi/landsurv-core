import React from 'react';
import type { HelpAccent, HelpGroup } from '../utils/canvasCommands';

const ACCENTS: Record<HelpAccent, { text: string; dot: string; border: string }> = {
  cyan: { text: 'text-cyan-300', dot: 'bg-cyan-300', border: 'border-cyan-500/25' },
  emerald: { text: 'text-emerald-300', dot: 'bg-emerald-300', border: 'border-emerald-500/25' },
  amber: { text: 'text-amber-300', dot: 'bg-amber-300', border: 'border-amber-500/25' },
  sky: { text: 'text-sky-300', dot: 'bg-sky-300', border: 'border-sky-500/25' },
  violet: { text: 'text-violet-300', dot: 'bg-violet-300', border: 'border-violet-500/25' },
  rose: { text: 'text-rose-300', dot: 'bg-rose-300', border: 'border-rose-500/25' },
};

interface A2UICommandHelpProps {
  groups: HelpGroup[];
  /** Run a deterministic command from the docked reference. */
  onRunCommand: (command: string) => void;
}

/**
 * Docked presentation of the command reference. It deliberately drops the
 * full descriptions used by the terminal: groups stay stacked, while each
 * runnable command becomes a compact link that executes immediately.
 */
export const A2UICommandHelp: React.FC<A2UICommandHelpProps> = ({ groups, onRunCommand }) => {
  const commandCount = groups.reduce((total, group) => total + group.entries.length, 0);

  return (
    <div data-testid="a2ui-command-help" className="space-y-2 p-2.5">
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] pb-2">
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-cyan-300">Command Reference</p>
          <p className="mt-0.5 text-[9.5px] text-slate-500">Click a command to run it on the canvas.</p>
        </div>
        <span className="shrink-0 rounded border border-white/10 bg-white/[0.035] px-1.5 py-0.5 font-mono text-[8.5px] font-semibold tabular-nums text-slate-400">
          {groups.length} groups · {commandCount}
        </span>
      </div>

      <div className="space-y-1.5">
        {groups.map(group => {
          const accent = ACCENTS[group.accent] ?? ACCENTS.cyan;
          return (
            <section key={group.title} className={`overflow-hidden rounded-md border bg-[#071018] ${accent.border}`}>
              <div className="flex items-center gap-1.5 border-b border-white/[0.06] bg-white/[0.025] px-2 py-1">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${accent.dot}`} />
                <span className={`min-w-0 truncate font-mono text-[9px] font-extrabold uppercase tracking-[0.14em] ${accent.text}`}>
                  {group.title}
                </span>
                <span className="ml-auto font-mono text-[8.5px] tabular-nums text-slate-500">{group.entries.length}</span>
              </div>
              <div className="py-0.5">
                {group.entries.map(entry => entry.run ? (
                  <button
                    key={entry.command}
                    type="button"
                    data-testid={`a2ui-help-run-${entry.run}`}
                    onClick={() => onRunCommand(entry.run as string)}
                    title={entry.description}
                    className="group flex w-full items-center justify-between gap-2 px-2 py-[3px] text-left font-mono text-[10.5px] leading-snug text-slate-300 transition-colors hover:bg-cyan-400/[0.08] hover:text-cyan-100"
                  >
                    <span className="min-w-0 truncate underline decoration-slate-600 decoration-dotted underline-offset-2 group-hover:decoration-cyan-300">
                      {entry.command}
                    </span>
                    <span className="shrink-0 text-[8px] font-bold uppercase tracking-wider text-cyan-300 opacity-0 transition-opacity group-hover:opacity-100">
                      Run
                    </span>
                  </button>
                ) : (
                  <div
                    key={entry.command}
                    title={entry.description}
                    className="px-2 py-[3px] font-mono text-[10.5px] leading-snug text-slate-500"
                  >
                    {entry.command}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default A2UICommandHelp;
