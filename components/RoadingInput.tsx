import React, { useState } from 'react';
import { RoadIcon } from './icons.tsx';
import { UploadShell, UploadPanel, UploadPrimaryButton, UploadGhostButton } from './UploadShell.tsx';

export interface RoadingInputProps {
  /** Number of baselines available in Stationing & CL. */
  centerlineCount?: number;
  /** Draw an existing road directly from the loaded survey shots. No baseline or parameters. */
  onSynthesizeExisting?: () => void;
  onDesignCorridor?: (opts: {
    name: string;
    laneCount: number;
    laneWidthFt: number;
    includeCurbAndGutter: boolean;
    includeSidewalk: boolean;
    rowWidthFt: number;
  }) => void;
  onOpenRoadingStudio?: () => void;
  onGoBack?: () => void;
  backButtonTitle?: string;
}

/**
 * Roading intake. Survey-point road drawing is the no-parameter default;
 * a baseline is only needed for the optional parametric road model.
 */
const RoadingInput: React.FC<RoadingInputProps> = ({
  centerlineCount = 0,
  onSynthesizeExisting,
  onDesignCorridor,
  onOpenRoadingStudio,
  onGoBack = () => {},
  backButtonTitle = 'Go to Home Screen',
}) => {
  const [roadName, setRoadName] = useState('Proposed Road A');
  const [laneCount, setLaneCount] = useState(2);
  const [laneWidthFt, setLaneWidthFt] = useState(12);
  const [includeCurb, setIncludeCurb] = useState(true);
  const [includeSidewalk, setIncludeSidewalk] = useState(true);
  const [rowWidthFt, setRowWidthFt] = useState(0);

  return (
    <UploadShell
      icon={RoadIcon}
      accent="#f59e0b"
      title="Roading"
      accentWord=" Agent"
      description="Draw an existing road from survey shots in one click, or build a saved parametric road model on a Stationing & CL baseline. Existing-road drawing needs no baseline and no parameters."
      onGoBack={onGoBack}
      backTitle={backButtonTitle}
    >
      <UploadPanel>
        <div className="space-y-3 text-xs text-slate-200">
          <p className="rounded border border-amber-500/30 bg-amber-950/20 px-2.5 py-1.5 text-[11px] text-amber-200">
            Draw the existing road directly from the loaded shots — no baseline and no parameters.
            A baseline is optional and only needed if you want a saved parametric model below.
          </p>

          {onSynthesizeExisting && (
            <UploadPrimaryButton onClick={onSynthesizeExisting}>
              Draw Road from Survey Points
            </UploadPrimaryButton>
          )}

          {centerlineCount === 0 ? (
            <div className="rounded border border-slate-700 bg-slate-900/60 px-2.5 py-2 text-[11px] text-slate-300">
              No baseline loaded. Survey-point drawing still works above. For a parametric model,
              open Stationing &amp; CL and draw or import a baseline.
            </div>
          ) : (
            <p className="text-[11px] text-slate-400">
              {centerlineCount} baseline{centerlineCount === 1 ? '' : 's'} loaded. The active baseline
              will be used unless another is selected in the full Roading Studio.
            </p>
          )}

          <p className="border-t border-white/[0.08] pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Optional: parametric road model
          </p>

          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">
              Road / Model Name
            </label>
            <input
              type="text"
              value={roadName}
              onChange={e => setRoadName(e.target.value)}
              placeholder="Proposed Road A"
              className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">Lanes</label>
              <input
                type="number"
                value={laneCount}
                onChange={e => setLaneCount(parseInt(e.target.value, 10) || 2)}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">Lane Width (ft)</label>
              <input
                type="number"
                value={laneWidthFt}
                onChange={e => setLaneWidthFt(parseFloat(e.target.value) || 12)}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">
                ROW Width (ft, 0 = skip)
              </label>
              <input
                type="number"
                value={rowWidthFt}
                onChange={e => setRowWidthFt(parseFloat(e.target.value) || 0)}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-300">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={includeCurb}
                onChange={e => setIncludeCurb(e.target.checked)}
                className="accent-amber-500"
              />
              Curb &amp; Gutter
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={includeSidewalk}
                onChange={e => setIncludeSidewalk(e.target.checked)}
                className="accent-amber-500"
              />
              5&apos; Sidewalks
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.08] pt-2">
            {onOpenRoadingStudio && (
              <UploadGhostButton onClick={onOpenRoadingStudio}>Open Full Roading Studio</UploadGhostButton>
            )}
            <UploadPrimaryButton
              disabled={centerlineCount === 0}
              onClick={() =>
                onDesignCorridor?.({
                  name: roadName.trim() || 'Proposed Road A',
                  laneCount,
                  laneWidthFt,
                  includeCurbAndGutter: includeCurb,
                  includeSidewalk,
                  rowWidthFt,
                })
              }
            >
              Build {laneCount * laneWidthFt}&apos; Road Model
            </UploadPrimaryButton>
          </div>
        </div>
      </UploadPanel>
    </UploadShell>
  );
};

export default RoadingInput;
