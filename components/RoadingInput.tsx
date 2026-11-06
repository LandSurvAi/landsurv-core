import React, { useState } from 'react';
import { RoadIcon } from './icons.tsx';
import { UploadShell, UploadPanel, UploadPrimaryButton, UploadGhostButton } from './UploadShell.tsx';

export interface RoadingInputProps {
  existingPointCount?: number;
  centerlineCount?: number;
  onSynthesizeExisting?: (opts: {
    defaultRoadWidthFt: number;
    rowWidthFt: number;
    useSurveyPoints: boolean;
    useBackgroundImagery: boolean;
  }) => void;
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

const RoadingInput: React.FC<RoadingInputProps> = ({
  existingPointCount = 0,
  centerlineCount = 0,
  onSynthesizeExisting,
  onDesignCorridor,
  onOpenRoadingStudio,
  onGoBack = () => {},
  backButtonTitle = 'Go to Home Screen',
}) => {
  const [mode, setMode] = useState<'synthesize' | 'design'>('synthesize');
  const [roadWidthFt, setRoadWidthFt] = useState(24);
  // ROW is optional: 0 draws the road without ROW lines.
  const [rowWidthFt, setRowWidthFt] = useState(0);
  const [laneCount, setLaneCount] = useState(2);
  const [laneWidthFt, setLaneWidthFt] = useState(12);
  const [includeCurb, setIncludeCurb] = useState(true);
  const [includeSidewalk, setIncludeSidewalk] = useState(true);

  return (
    <UploadShell
      icon={RoadIcon}
      accent="#f59e0b"
      title="Roading"
      accentWord=" Agent"
      description="Synthesize existing roads from survey points, background imagery, and OpenStreetMap ways — or design proposed road corridors with Stationing & CL and Profile integration."
      onGoBack={onGoBack}
      backTitle={backButtonTitle}
    >
      <UploadPanel>
        <div className="space-y-3 text-xs text-slate-200">
          <p className="rounded border border-amber-500/30 bg-amber-950/20 px-2.5 py-1.5 text-[11px] text-amber-200">
            All inputs are optional. Press a draw button to use the loaded points with the defaults shown
            — ROW lines are only added when you enter a width.
          </p>
          {/* Mode toggle */}
          <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-slate-900/80 p-1 border border-white/[0.08]">
            <button
              type="button"
              onClick={() => setMode('synthesize')}
              className={`rounded-md py-1.5 text-xs font-bold transition ${
                mode === 'synthesize'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Synthesize Existing Road
            </button>
            <button
              type="button"
              onClick={() => setMode('design')}
              className={`rounded-md py-1.5 text-xs font-bold transition ${
                mode === 'design'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Design Proposed Corridor
            </button>
          </div>

          {mode === 'synthesize' ? (
            <div className="space-y-2.5">
              <p className="text-[11px] text-slate-400">
                Fuses field survey points ({existingPointCount} loaded), background aerial imagery pavement width
                calibration, and OpenStreetMap road ways into CAD layers (<code className="text-amber-300">C-ROAD-CNTR</code>,{' '}
                <code className="text-amber-300">L-ROAD</code>, <code className="text-amber-300">V-ROAD-ROW</code>) and syncs a
                Centerline to Stationing &amp; CL.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">
                    Cartway Width (ft, optional)
                  </label>
                  <input
                    type="number"
                    value={roadWidthFt}
                    onChange={(e) => setRoadWidthFt(parseFloat(e.target.value) || 24)}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">
                    ROW Width (ft, optional · 0 = skip)
                  </label>
                  <input
                    type="number"
                    value={rowWidthFt}
                    onChange={(e) => setRowWidthFt(parseFloat(e.target.value) || 0)}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.08]">
                {onOpenRoadingStudio && (
                  <UploadGhostButton onClick={onOpenRoadingStudio}>
                    Open Full Roading Studio
                  </UploadGhostButton>
                )}
                <UploadPrimaryButton
                  onClick={() =>
                    onSynthesizeExisting?.({
                      defaultRoadWidthFt: roadWidthFt,
                      rowWidthFt,
                      useSurveyPoints: true,
                      useBackgroundImagery: true,
                    })
                  }
                >
                  Synthesize Existing Road
                </UploadPrimaryButton>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-[11px] text-slate-400">
                Designs a horizontal corridor and typical section along your active Stationing &amp; CL alignment (
                {centerlineCount} loaded) and triggers an elevation profile with the Profile Agent.
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">Lanes</label>
                  <input
                    type="number"
                    value={laneCount}
                    onChange={(e) => setLaneCount(parseInt(e.target.value, 10) || 2)}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">
                    Lane Width (ft)
                  </label>
                  <input
                    type="number"
                    value={laneWidthFt}
                    onChange={(e) => setLaneWidthFt(parseFloat(e.target.value) || 12)}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">
                    ROW Width (ft, optional · 0 = skip)
                  </label>
                  <input
                    type="number"
                    value={rowWidthFt}
                    onChange={(e) => setRowWidthFt(parseFloat(e.target.value) || 0)}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
                  />
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-300">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={includeCurb}
                    onChange={(e) => setIncludeCurb(e.target.checked)}
                    className="accent-amber-500"
                  />
                  Curb &amp; Gutter
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={includeSidewalk}
                    onChange={(e) => setIncludeSidewalk(e.target.checked)}
                    className="accent-amber-500"
                  />
                  5&apos; Sidewalks
                </label>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.08]">
                {onOpenRoadingStudio && (
                  <UploadGhostButton onClick={onOpenRoadingStudio}>
                    Open Full Roading Studio
                  </UploadGhostButton>
                )}
                <UploadPrimaryButton
                  onClick={() =>
                    onDesignCorridor?.({
                      name: 'Proposed Road A',
                      laneCount,
                      laneWidthFt,
                      includeCurbAndGutter: includeCurb,
                      includeSidewalk,
                      rowWidthFt,
                    })
                  }
                >
                  Generate {laneCount * laneWidthFt}&apos; Road Corridor
                </UploadPrimaryButton>
              </div>
            </div>
          )}
        </div>
      </UploadPanel>
    </UploadShell>
  );
};

export default RoadingInput;
