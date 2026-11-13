import React from 'react';

interface A2UIDrawMenuProps {
  /** Execute a deterministic canvas command. */
  onRunCommand: (command: string) => void;
  onOpenStationingControls?: () => void;
  onOpenHatchManager?: () => void;
}

interface DrawMenuEntry {
  label: string;
  shortcut?: string;
  run?: string;
  action?: 'stationing' | 'hatch-manager';
}

const GROUPS: Array<{ title: string; entries: DrawMenuEntry[] }> = [
  {
    title: 'Draw & Edit',
    entries: [
      { label: 'Draw Polylines', shortcut: 'L', run: 'l' },
      { label: 'Draw Baseline', shortcut: 'B', run: 'baseline' },
      { label: 'Stationing Controls', action: 'stationing' },
      { label: 'Draw Circle', shortcut: 'C', run: 'c' },
      { label: 'Draw Breaklines', run: 'breakline' },
      { label: 'Draw Inclusion Lines', shortcut: 'I', run: 'i' },
      { label: 'Draw Exclusion Lines', run: 'exclusion' },
      { label: 'Draw Boundary Line', run: 'boundaryline' },
    ],
  },
  {
    title: 'Hatch Tools',
    entries: [
      { label: 'Hatch — Click in Area', shortcut: 'H', run: 'hatch area' },
      { label: 'Hatch — Select Object', shortcut: 'H', run: 'hatch select' },
      { label: 'Open Hatch Manager', action: 'hatch-manager' },
    ],
  },
  {
    title: 'Edit',
    entries: [
      { label: 'Copy Selected', shortcut: 'CP', run: 'cp' },
      { label: 'Offset', shortcut: 'OS', run: 'os' },
      { label: 'Trim Lines', shortcut: 'T', run: 't' },
      { label: 'Extend Lines', shortcut: 'EX', run: 'ex' },
    ],
  },
];

/**
 * Compact A2UI mirror of the canvas Draw menu. The floating menu stays as-is;
 * this is the toolshelf presentation and runs the same deterministic commands.
 */
export const A2UIDrawMenu: React.FC<A2UIDrawMenuProps> = ({
  onRunCommand,
  onOpenStationingControls,
  onOpenHatchManager,
}) => (
  <div data-testid="a2ui-draw-menu" className="space-y-2 p-2.5">
    <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] pb-2">
      <div>
        <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-cyan-300">Draw &amp; Edit</p>
        <p className="mt-0.5 text-[9.5px] text-slate-500">Click a tool to start it on the canvas.</p>
      </div>
      <span className="shrink-0 rounded border border-cyan-400/20 bg-cyan-400/[0.06] px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-wider text-cyan-300">
        A2UI
      </span>
    </div>

    {GROUPS.map(group => (
      <section key={group.title} className="overflow-hidden rounded-md border border-white/[0.08] bg-[#071018]">
        <div className="border-b border-white/[0.06] bg-white/[0.025] px-2 py-1">
          <span className="font-mono text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400">{group.title}</span>
        </div>
        <div className="py-0.5">
          {group.entries.map(entry => {
            const action = entry.action === 'stationing'
              ? onOpenStationingControls
              : entry.action === 'hatch-manager'
                ? onOpenHatchManager
                : undefined;
            if (entry.action && !action) return null;
            return (
              <button
                key={entry.label}
                type="button"
                onClick={() => {
                  if (entry.run) onRunCommand(entry.run);
                  else action?.();
                }}
                className="group flex w-full items-center justify-between gap-2 px-2 py-[4px] text-left text-[10.5px] leading-snug text-slate-300 transition-colors hover:bg-cyan-400/[0.08] hover:text-cyan-100"
              >
                <span className="min-w-0 truncate">{entry.label}</span>
                {entry.shortcut ? (
                  <span className="shrink-0 rounded border border-white/10 bg-white/[0.035] px-1 py-px font-mono text-[8px] font-semibold text-slate-500 group-hover:text-cyan-300">
                    {entry.shortcut}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>
    ))}
  </div>
);

export default A2UIDrawMenu;
