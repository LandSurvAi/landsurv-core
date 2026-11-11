import React from 'react';
import { Eye, EyeOff, PencilRuler, Route, SlidersHorizontal } from 'lucide-react';
import type { Centerline } from '../types.ts';
import { calculateCenterlineLength, formatStation } from '../utils/stationing.ts';

export interface A2UICenterlineListProps {
  centerlines: Centerline[];
  /** The alignment currently used by Stationing & CL (centerlines[0] by convention). */
  activeCenterlineId?: string;
  centerlinesVisible?: boolean;
  onSelect?: (centerlineId: string) => void;
  /** Double-click a chip, or use its tools button, to open alignment tools. */
  onOpenTools?: (centerlineId: string) => void;
  onOpenStationingControls?: () => void;
  onToggleVisibility?: () => void;
}

const chipClass =
  'rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide';

/**
 * A2UI chip list of every generated or drawn centerline / BASELINE.
 *
 * The first alignment is the active Stationing & CL alignment, so selecting a
 * chip reorders that alignment to the front. Double-click (or the tools badge)
 * opens the same Stationing tools the canvas uses.
 */
export const A2UICenterlineList: React.FC<A2UICenterlineListProps> = ({
  centerlines,
  activeCenterlineId,
  centerlinesVisible = true,
  onSelect,
  onOpenTools,
  onOpenStationingControls,
  onToggleVisibility,
}) => {
  const active = centerlines.find(centerline => centerline.id === activeCenterlineId) ?? centerlines[0];

  return (
    <div data-testid="centerline-list" className="space-y-3 p-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`${chipClass} border-cyan-400/40 bg-cyan-400/10 text-cyan-200`}>
          {centerlines.length} alignment{centerlines.length === 1 ? '' : 's'}
        </span>
        {active && (
          <span className={`${chipClass} border-emerald-400/40 bg-emerald-400/10 text-emerald-200`}>
            Active: {active.name}
          </span>
        )}
        {onToggleVisibility && (
          <button
            type="button"
            onClick={onToggleVisibility}
            aria-pressed={centerlinesVisible}
            className={`${chipClass} inline-flex items-center gap-1 transition-colors ${
              centerlinesVisible
                ? 'border-sky-400/40 bg-sky-400/10 text-sky-200 hover:bg-sky-400/20'
                : 'border-slate-500/40 bg-slate-500/10 text-slate-400 hover:text-slate-200'
            }`}
          >
            {centerlinesVisible ? <Eye className="h-2.5 w-2.5" /> : <EyeOff className="h-2.5 w-2.5" />}
            {centerlinesVisible ? 'CL visible' : 'CL hidden'}
          </button>
        )}
        {onOpenStationingControls && (
          <button
            type="button"
            onClick={onOpenStationingControls}
            className={`${chipClass} ml-auto inline-flex items-center gap-1 border-white/10 bg-white/[0.03] text-slate-300 transition-colors hover:border-cyan-400/35 hover:text-white`}
          >
            <SlidersHorizontal className="h-2.5 w-2.5" />
            Stationing controls
          </button>
        )}
      </div>

      {centerlines.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-3 py-5 text-center">
          <Route className="mx-auto h-5 w-5 text-cyan-300/70" />
          <p className="mt-2 text-[11.5px] font-semibold text-slate-200">No centerlines or baselines yet</p>
          <p className="mt-1 text-[10px] leading-snug text-slate-500">
            Draw a BASELINE with the <code className="text-cyan-300">B</code> command or load a{' '}
            <code className="text-cyan-300">.cl</code> file. Every alignment you draw or generate appears here
            as a chip.
          </p>
        </div>
      ) : (
        <div role="list" className="space-y-1">
          {centerlines.map(centerline => {
            const isActive = centerline.id === active?.id;
            const length = calculateCenterlineLength(centerline);
            const endStation = centerline.beginStation + length;
            return (
              <div key={centerline.id} role="listitem" className="flex items-stretch gap-1">
                <button
                  type="button"
                  onClick={() => onSelect?.(centerline.id)}
                  onDoubleClick={() => onOpenTools?.(centerline.id)}
                  aria-pressed={isActive}
                  title={`${centerline.name} — click to activate, double-click to open tools`}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                    isActive
                      ? 'border-cyan-400/55 bg-cyan-400/[0.12] text-cyan-100'
                      : 'border-white/10 bg-white/[0.025] text-slate-300 hover:border-cyan-400/35 hover:bg-cyan-400/[0.06] hover:text-white'
                  }`}
                >
                  <Route
                    className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-cyan-300' : 'text-slate-500'}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-semibold">{centerline.name}</span>
                    <span className="mt-0.5 block truncate font-mono text-[9px] text-slate-500">
                      {formatStation(centerline.beginStation)} – {formatStation(endStation)} ·{' '}
                      {centerline.pis.length} PI{centerline.pis.length === 1 ? '' : 's'}
                    </span>
                  </span>
                  {isActive && (
                    <span className="shrink-0 rounded-full border border-cyan-400/40 bg-cyan-400/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-cyan-200">
                      Active
                    </span>
                  )}
                </button>
                {onOpenTools && (
                  <button
                    type="button"
                    onClick={() => onOpenTools(centerline.id)}
                    aria-label={`Open tools for ${centerline.name}`}
                    title={`Open ${centerline.name} tools`}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 text-[9px] font-semibold text-slate-400 transition-colors hover:border-cyan-400/35 hover:bg-cyan-400/[0.08] hover:text-cyan-100"
                  >
                    <PencilRuler className="h-3 w-3" />
                    Tools
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {centerlines.length > 0 && (
        <p className="border-t border-white/[0.06] pt-2 text-[9px] leading-snug text-slate-500">
          Click a chip to make it the active alignment. Double-click a chip to open its Stationing tools.
        </p>
      )}
    </div>
  );
};

export default A2UICenterlineList;
