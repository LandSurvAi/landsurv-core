import React, { useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { type SurveyPoint, AgentType } from '../types.ts';
import { inverse, formatBearing } from '../utils/cogo.ts';
import { useErrorReporter } from '../contexts/AppStateContext';
import { CogoSkillLibrary } from './CogoSkillLibrary.tsx';

interface CogoPanelProps {
  pointLists: { id: string; name: string; points: SurveyPoint[]; isVisible: boolean }[];
  onAddPoint: (point: SurveyPoint) => void;
  activeAgent: AgentType;
  settings: {
    coordinatePrecision: number;
  };
  onPointSelect?: (point: SurveyPoint) => void;
  isSelectingFromCanvas?: boolean;
  /** Launch a selected COGO skill in the agent chat. */
  onRunCogoSkill?: (prompt: string) => void;
}

export interface CogoPanelHandles {
  handleCanvasPointSelect: (point: SurveyPoint) => void;
}

export const CogoPanel = forwardRef<CogoPanelHandles, CogoPanelProps>(({
  pointLists,
  onAddPoint,
  activeAgent,
  settings,
  onRunCogoSkill,
}, ref) => {
  const [inversePoint1, setInversePoint1] = useState<string>('');
  const [inversePoint2, setInversePoint2] = useState<string>('');
  const [inverseResult, setInverseResult] = useState<{ distance: number; bearing: string } | null>(null);
  const [selectingPoint, setSelectingPoint] = useState<'point1' | 'point2' | null>(null);
  const { reportError } = useErrorReporter();

  const allPoints = pointLists.flatMap(list => list.points);

  const handleCanvasPointSelect = useCallback((point: SurveyPoint) => {
    if (selectingPoint === 'point1') {
      setInversePoint1(point.pointNumber);
      setSelectingPoint(null);
    } else if (selectingPoint === 'point2') {
      setInversePoint2(point.pointNumber);
      setSelectingPoint(null);
    }
  }, [selectingPoint]);

  useImperativeHandle(ref, () => ({
    handleCanvasPointSelect,
  }), [handleCanvasPointSelect]);

  const handleCalculateInverse = useCallback(() => {
    const point1 = allPoints.find(p => p.pointNumber === inversePoint1);
    const point2 = allPoints.find(p => p.pointNumber === inversePoint2);

    if (!point1 || !point2) {
      reportError({ title: 'Invalid points', message: 'Please select valid points for both Point 1 and Point 2.' });
      return;
    }

    const result = inverse(
      { northing: point1.northing, easting: point1.easting },
      { northing: point2.northing, easting: point2.easting }
    );

    setInverseResult({
      distance: result.distance,
      bearing: formatBearing(result.bearing),
    });
  }, [allPoints, inversePoint1, inversePoint2, reportError]);

  const handleClearInverse = useCallback(() => {
    setInversePoint1('');
    setInversePoint2('');
    setInverseResult(null);
  }, []);

  const handleSelectFromCanvas = useCallback((pointType: 'point1' | 'point2') => {
    setSelectingPoint(pointType);
  }, []);

  const handleRunSkill = useCallback((prompt: string) => {
    if (!onRunCogoSkill) {
      reportError({
        title: 'COGO chat unavailable',
        message: 'Open the COGO agent chat to run this skill.',
      });
      return;
    }
    onRunCogoSkill(prompt);
  }, [onRunCogoSkill, reportError]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#0b111a] text-sm text-slate-200 light-theme:bg-gray-50 light-theme:text-gray-700">
      <div className="flex-1 space-y-4 overflow-y-auto p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-100">COGO console</h2>
              <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-violet-300">
                Precision
              </span>
            </div>
            <p className="mt-0.5 text-[10.5px] text-slate-400">
              {allPoints.length.toLocaleString()} points available · {pointLists.length} lists
            </p>
          </div>
          <span className="rounded-md border border-white/[0.07] bg-white/[0.025] px-1.5 py-0.5 font-mono text-[9px] text-slate-500">
            COGO / CACP
          </span>
        </div>

        <section className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-300">Inverse between points</h3>
              <p className="mt-1 text-[11px] leading-snug text-slate-400">
                Bearing and distance from any two points in the project.
              </p>
            </div>
            {inverseResult && (
              <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">
                Ready
              </span>
            )}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[10.5px] font-semibold text-slate-300">
                Point 1
              </label>
              <select
                value={inversePoint1}
                onChange={event => setInversePoint1(event.target.value)}
                className="w-full rounded-lg border border-white/[0.08] bg-[#0d1522] px-2 py-1.5 text-[11px] text-slate-200 focus:border-violet-500/40 focus:outline-none"
              >
                <option value="">Select Point 1...</option>
                {allPoints.map((point, index) => (
                  <option key={`${point.pointNumber}-${index}`} value={point.pointNumber}>
                    {point.pointNumber} - {point.description || 'No description'}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handleSelectFromCanvas('point1')}
                className={`mt-1.5 w-full rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors ${
                  selectingPoint === 'point1'
                    ? 'border-violet-400/60 bg-violet-500/20 text-violet-200'
                    : 'border-white/[0.07] bg-white/[0.03] text-slate-400 hover:border-white/[0.14] hover:text-slate-200'
                }`}
              >
                {selectingPoint === 'point1' ? 'Click point on canvas' : 'Select from canvas'}
              </button>
            </div>

            <div>
              <label className="mb-1.5 block text-[10.5px] font-semibold text-slate-300">
                Point 2
              </label>
              <select
                value={inversePoint2}
                onChange={event => setInversePoint2(event.target.value)}
                className="w-full rounded-lg border border-white/[0.08] bg-[#0d1522] px-2 py-1.5 text-[11px] text-slate-200 focus:border-violet-500/40 focus:outline-none"
              >
                <option value="">Select Point 2...</option>
                {allPoints.map((point, index) => (
                  <option key={`${point.pointNumber}-${index}`} value={point.pointNumber}>
                    {point.pointNumber} - {point.description || 'No description'}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handleSelectFromCanvas('point2')}
                className={`mt-1.5 w-full rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors ${
                  selectingPoint === 'point2'
                    ? 'border-violet-400/60 bg-violet-500/20 text-violet-200'
                    : 'border-white/[0.07] bg-white/[0.03] text-slate-400 hover:border-white/[0.14] hover:text-slate-200'
                }`}
              >
                {selectingPoint === 'point2' ? 'Click point on canvas' : 'Select from canvas'}
              </button>
            </div>
          </div>

          {selectingPoint && (
            <div className="mt-2.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-2 text-[10.5px] font-medium text-violet-200">
              Click a point on the canvas to set {selectingPoint === 'point1' ? 'Point 1' : 'Point 2'}.
            </div>
          )}

          <div className="mt-3 flex gap-1.5">
            <button
              type="button"
              onClick={handleCalculateInverse}
              disabled={!inversePoint1 || !inversePoint2}
              className="flex-1 rounded-md border border-violet-400/30 bg-violet-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Calculate inverse
            </button>
            <button
              type="button"
              onClick={handleClearInverse}
              className="rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-slate-300 transition-colors hover:bg-white/[0.07]"
            >
              Clear
            </button>
          </div>

          {inverseResult && (
            <div className="mt-2.5 grid grid-cols-2 gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] p-2.5">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-400/80">Distance</div>
                <div className="mt-0.5 font-mono text-sm text-emerald-200">
                  {inverseResult.distance.toFixed(settings.coordinatePrecision)}'
                </div>
              </div>
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-400/80">Bearing</div>
                <div className="mt-0.5 font-mono text-sm text-emerald-200">{inverseResult.bearing}</div>
              </div>
            </div>
          )}

          {allPoints.length === 0 && (
            <p className="mt-2.5 text-[10.5px] text-slate-500">
              Add or upload points to enable the inverse calculator.
            </p>
          )}
        </section>

        <CogoSkillLibrary onRunSkill={handleRunSkill} />
      </div>
    </div>
  );
});

CogoPanel.displayName = 'CogoPanel';
