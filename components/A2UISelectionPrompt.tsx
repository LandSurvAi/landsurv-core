import React from 'react';
import { MousePointer2, Split } from 'lucide-react';
import type { A2UISelectionPromptSpec } from '../types.ts';

interface A2UISelectionPromptProps {
  prompt: A2UISelectionPromptSpec;
  onStartSelection?: () => void;
  onUseSelection?: () => void;
}

export const A2UISelectionPrompt: React.FC<A2UISelectionPromptProps> = ({
  prompt,
  onStartSelection,
  onUseSelection,
}) => {
  const count = prompt.pointCount;

  return (
    <div
      data-testid="a2ui-selection-prompt"
      className="overflow-hidden rounded-lg border border-white/15 bg-[#08111c]"
    >
      <div className="border-b border-white/10 bg-white/[0.035] px-3 py-2.5">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/20 bg-white/[0.05] text-white/75">
            <MousePointer2 className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <h4 className="text-[12px] font-semibold text-white">
              {prompt.title || 'Select lines and arcs'}
            </h4>
            <p className="mt-0.5 text-[10.5px] leading-snug text-white/55">
              {prompt.description || 'Select lines and arcs on the canvas to be divided.'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 p-3">
        <button
          type="button"
          data-testid="a2ui-selection-start"
          onClick={onStartSelection}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-white/[0.05] px-2.5 py-1.5 text-[10.5px] font-semibold text-white/85 transition-colors hover:border-white/35 hover:bg-white/[0.09] hover:text-white"
        >
          <MousePointer2 className="h-3 w-3" />
          Select on canvas
        </button>
        <button
          type="button"
          data-testid="a2ui-selection-divide"
          onClick={onUseSelection}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-white/[0.08] px-2.5 py-1.5 text-[10.5px] font-semibold text-white transition-colors hover:border-white/40 hover:bg-white/[0.12]"
        >
          <Split className="h-3 w-3" />
          {prompt.actionLabel || `Divide selected${count ? ` into ${count} points` : ''}`}
        </button>
        <span className="text-[9.5px] text-white/40">
          Select one or more lines or arcs, then choose Divide selected.
        </span>
      </div>
    </div>
  );
};
