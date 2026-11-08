import React from 'react';
import type { Settings, StationingSettings } from '../types';
import { formatStationLabel } from '../utils/stationing.ts';

const DEFAULTS: StationingSettings = {
  pointInterval: 100,
  showStationLabels: true,
  labelInterval: 100,
  showGeometryLabels: true,
  labelScale: 1,
  stationPrefix: 'STA',
  showStationPrefix: true,
  stationSuffix: '',
  stationLabelFormat: 'hundreds',
  stationPrecision: 2,
  labelOffsetPx: 8,
  showLabelBackground: true,
  showPiLabels: true,
  showPcPtLabels: true,
  showEndpointLabels: true,
  showStationPointLabels: true,
};

const inputClass =
  'w-full rounded-md border border-white/[0.1] bg-[#060d17] px-2.5 py-1.5 text-[11px] text-slate-100 outline-none transition-colors focus:border-cyan-400/60 disabled:cursor-not-allowed disabled:opacity-45';

const miniInputClass =
  'w-full rounded-md border border-white/[0.1] bg-[#060d17] px-2 py-1 text-[11px] text-slate-100 outline-none transition-colors focus:border-cyan-400/60 disabled:cursor-not-allowed disabled:opacity-45';

const chipClass =
  'rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide';

const fieldLabelClass =
  'mb-1 block text-[9.5px] font-semibold uppercase tracking-wider text-slate-400';

const sectionClass = 'overflow-hidden rounded-lg border border-white/[0.09] bg-white/[0.018]';

const sectionBodyClass = 'space-y-2.5 p-2.5';

interface A2UIStationingControlsProps {
  settings: Settings;
  onSettingsChange: React.Dispatch<React.SetStateAction<Settings>>;
  agentDrawMode: 'both' | 'points' | 'lines';
  onAgentDrawModeChange: (mode: 'both' | 'points' | 'lines') => void;
}

const CheckRow: React.FC<{
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}> = ({ label, hint, checked, onChange, disabled = false, ariaLabel }) => (
  <label
    className={`flex items-start gap-2 ${disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'}`}
  >
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={event => onChange(event.target.checked)}
      aria-label={ariaLabel ?? label}
      className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-cyan-400"
    />
    <span className="min-w-0">
      <span className="block text-[11px] leading-tight text-slate-200">{label}</span>
      {hint && <span className="mt-0.5 block text-[9.5px] leading-snug text-slate-500">{hint}</span>}
    </span>
  </label>
);

const SegButton: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
  disabled?: boolean;
}> = ({ active, onClick, children, title, disabled = false }) => (
  <button
    type="button"
    disabled={disabled}
    title={title}
    aria-pressed={active}
    onClick={onClick}
    className={`rounded-md border px-1.5 py-1.5 text-[10px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
      active
        ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-100'
        : 'border-transparent bg-black/10 text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
    }`}
  >
    {children}
  </button>
);

/**
 * Shared A2UI controls for BASELINE drawings and the Stationing & CL agent.
 * The P/L switch is the master on/off for automatically plotted CL/PI points;
 * the remaining controls tune point placement and publication formatting.
 */
export const A2UIStationingControls: React.FC<A2UIStationingControlsProps> = ({
  settings,
  onSettingsChange,
  agentDrawMode,
  onAgentDrawModeChange,
}) => {
  const stationing: StationingSettings = { ...DEFAULTS, ...(settings.stationing ?? {}) };
  const autoStationPoints = agentDrawMode !== 'lines';
  const preview = formatStationLabel(1234.56, {
    prefix: stationing.stationPrefix,
    showPrefix: stationing.showStationPrefix,
    suffix: stationing.stationSuffix,
    format: stationing.stationLabelFormat,
    precision: stationing.stationPrecision,
  });

  const update = (patch: Partial<StationingSettings>) => {
    onSettingsChange(prev => ({
      ...prev,
      stationing: { ...DEFAULTS, ...(prev.stationing ?? {}), ...patch },
    }));
  };

  const setAutoStationPoints = (enabled: boolean) => {
    onAgentDrawModeChange(enabled ? (agentDrawMode === 'lines' ? 'both' : agentDrawMode) : 'lines');
  };

  return (
    <div data-testid="stationing-controls" className="space-y-3 p-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`${chipClass} ${
            autoStationPoints
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              : 'border-slate-500/40 bg-slate-500/10 text-slate-400'
          }`}
        >
          Auto stations {autoStationPoints ? 'on' : 'off'}
        </span>
        <span className={`${chipClass} border-sky-500/40 bg-sky-500/10 text-sky-300`}>
          Every {stationing.pointInterval}&apos;
        </span>
        <span className={`${chipClass} border-amber-500/40 bg-amber-500/10 text-amber-300`}>
          {stationing.showStationLabels ? 'Labels on' : 'Labels off'}
        </span>
        <span className={`${chipClass} border-cyan-500/40 bg-cyan-500/10 text-cyan-300`}>
          {stationing.showStationPrefix && stationing.stationPrefix.trim()
            ? stationing.stationPrefix.trim()
            : 'No prefix'}
        </span>
      </div>

      <section className={sectionClass}>
        <div className="border-b border-white/[0.07] px-2.5 py-2">
          <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-cyan-200">
            Automatic Station Points
          </h4>
          <p className="mt-0.5 text-[9.5px] leading-snug text-slate-500">
            P/L is the master switch for automatically created CL and PI points.
          </p>
        </div>
        <div className={sectionBodyClass}>
          <CheckRow
            label="Automatically plot station points"
            hint="Places a point on the baseline at the interval below. P/L and P emit points; L keeps linework only."
            checked={autoStationPoints}
            onChange={setAutoStationPoints}
            ariaLabel="Auto station points"
          />

          <div className="grid grid-cols-3 gap-1 rounded-lg border border-white/[0.08] bg-black/20 p-1">
            {([
              ['both', 'P/L', 'Points & lines'],
              ['points', 'P', 'Points only'],
              ['lines', 'L', 'Lines only'],
            ] as const).map(([mode, label, title]) => (
              <button
                key={mode}
                type="button"
                title={title}
                aria-pressed={agentDrawMode === mode}
                onClick={() => onAgentDrawModeChange(mode)}
                className={`rounded-md px-2 py-1.5 text-[10px] font-semibold transition-colors ${
                  agentDrawMode === mode
                    ? 'bg-cyan-500/20 text-cyan-100'
                    : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="a2ui-station-point-interval" className={fieldLabelClass}>
                Point interval (ft)
              </label>
              <input
                id="a2ui-station-point-interval"
                type="number"
                min={1}
                max={1000}
                step={5}
                value={stationing.pointInterval}
                onChange={event =>
                  update({ pointInterval: Math.max(1, Math.min(1000, Number(event.target.value) || 1)) })
                }
                aria-label="Station point interval"
                className={inputClass}
              />
            </div>
            <div className="flex items-end pb-1">
              <CheckRow
                label="CL STA point descriptions"
                hint="Magenta descriptions on generated points."
                checked={stationing.showStationPointLabels}
                onChange={checked => update({ showStationPointLabels: checked })}
              />
            </div>
          </div>
        </div>
      </section>

      <section className={sectionClass}>
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] px-2.5 py-2">
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-cyan-200">
              Station Labels
            </h4>
            <p className="mt-0.5 text-[9.5px] leading-snug text-slate-500">
              Publication formatting for labels drawn along the baseline.
            </p>
          </div>
          <code
            data-testid="station-label-preview"
            className="shrink-0 rounded-md border border-cyan-400/25 bg-cyan-400/[0.08] px-2 py-1 text-[10px] font-semibold text-cyan-100"
            title="Live label preview"
          >
            {preview}
          </code>
        </div>
        <div className={sectionBodyClass}>
          <CheckRow
            label="Station labels along the baseline"
            hint="The value below is drawn at the chosen interval. It is independent of auto station points."
            checked={stationing.showStationLabels}
            onChange={checked => update({ showStationLabels: checked })}
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="a2ui-station-prefix" className={fieldLabelClass}>
                Prefix
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  id="a2ui-station-prefix"
                  type="text"
                  maxLength={16}
                  placeholder="STA"
                  value={stationing.stationPrefix}
                  onChange={event => update({ stationPrefix: event.target.value })}
                  disabled={!stationing.showStationPrefix}
                  aria-label="Station prefix"
                  className={miniInputClass}
                />
                <button
                  type="button"
                  title={stationing.showStationPrefix ? 'Turn station prefix off' : 'Turn station prefix on'}
                  aria-label="Show station prefix"
                  aria-pressed={stationing.showStationPrefix}
                  onClick={() => update({ showStationPrefix: !stationing.showStationPrefix })}
                  className={`shrink-0 rounded-md border px-2 py-1 text-[9px] font-bold uppercase tracking-wide transition-colors ${
                    stationing.showStationPrefix
                      ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
                      : 'border-slate-600/50 bg-slate-700/20 text-slate-400'
                  }`}
                >
                  {stationing.showStationPrefix ? 'On' : 'Off'}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="a2ui-station-suffix" className={fieldLabelClass}>
                Suffix
              </label>
              <input
                id="a2ui-station-suffix"
                type="text"
                maxLength={16}
                placeholder="FT"
                value={stationing.stationSuffix}
                onChange={event => update({ stationSuffix: event.target.value })}
                aria-label="Station suffix"
                className={miniInputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-[1.35fr_1fr] gap-2">
            <div>
              <span className={fieldLabelClass}>Number format</span>
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/[0.08] bg-black/20 p-1">
                <SegButton
                  active={stationing.stationLabelFormat === 'hundreds'}
                  onClick={() => update({ stationLabelFormat: 'hundreds' })}
                  title="Survey station notation"
                >
                  1+00.00
                </SegButton>
                <SegButton
                  active={stationing.stationLabelFormat === 'decimal'}
                  onClick={() => update({ stationLabelFormat: 'decimal' })}
                  title="Plain decimal feet"
                >
                  100.00
                </SegButton>
              </div>
            </div>
            <div>
              <span className={fieldLabelClass}>Decimals</span>
              <div className="grid grid-cols-3 gap-1 rounded-lg border border-white/[0.08] bg-black/20 p-1">
                {([0, 1, 2] as const).map(precision => (
                  <SegButton
                    key={precision}
                    active={stationing.stationPrecision === precision}
                    onClick={() => update({ stationPrecision: precision })}
                    title={`${precision} decimal place${precision === 1 ? '' : 's'}`}
                  >
                    {precision}
                  </SegButton>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="a2ui-station-label-interval" className={fieldLabelClass}>
                Label interval (ft)
              </label>
              <input
                id="a2ui-station-label-interval"
                type="number"
                min={1}
                max={1000}
                step={5}
                value={stationing.labelInterval}
                onChange={event =>
                  update({ labelInterval: Math.max(1, Math.min(1000, Number(event.target.value) || 1)) })
                }
                aria-label="Station label interval"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="a2ui-station-label-offset" className={fieldLabelClass}>
                Vertical offset (px)
              </label>
              <input
                id="a2ui-station-label-offset"
                type="number"
                min={-48}
                max={48}
                step={2}
                value={stationing.labelOffsetPx}
                onChange={event =>
                  update({ labelOffsetPx: Math.max(-48, Math.min(48, Number(event.target.value) || 0)) })
                }
                aria-label="Station label offset"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="a2ui-station-label-scale" className={fieldLabelClass}>
              Text scale
            </label>
            <div className="flex items-center gap-2">
              <input
                id="a2ui-station-label-scale"
                type="range"
                min={0.5}
                max={2.5}
                step={0.05}
                value={stationing.labelScale}
                onChange={event => update({ labelScale: Number(event.target.value) || 1 })}
                aria-label="Centerline annotation text scale"
                className="h-1 flex-1 accent-cyan-400"
              />
              <span className="w-14 text-right font-mono text-[10px] text-slate-400">
                {stationing.labelScale.toFixed(2)}×
              </span>
            </div>
          </div>

          <CheckRow
            label="Label background"
            hint="Contrasting plate behind each station label."
            checked={stationing.showLabelBackground}
            onChange={checked => update({ showLabelBackground: checked })}
          />
        </div>
      </section>

      <section className={sectionClass}>
        <div className="border-b border-white/[0.07] px-2.5 py-2">
          <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-cyan-200">
            Geometry Tags
          </h4>
          <p className="mt-0.5 text-[9.5px] leading-snug text-slate-500">
            Choose exactly which alignment controls print with the baseline.
          </p>
        </div>
        <div className={`${sectionBodyClass} space-y-2`}>
          <CheckRow
            label="Show geometry tags"
            hint="Master visibility for PI, PC/PT, and BOP/EOP labels."
            checked={stationing.showGeometryLabels}
            onChange={checked => update({ showGeometryLabels: checked })}
          />
          <div className="grid grid-cols-3 gap-2 rounded-lg border border-white/[0.06] bg-black/10 p-2">
            <CheckRow
              label="PI labels"
              checked={stationing.showPiLabels}
              onChange={checked => update({ showPiLabels: checked })}
              disabled={!stationing.showGeometryLabels}
            />
            <CheckRow
              label="PC / PT"
              checked={stationing.showPcPtLabels}
              onChange={checked => update({ showPcPtLabels: checked })}
              disabled={!stationing.showGeometryLabels}
            />
            <CheckRow
              label="BOP / EOP"
              checked={stationing.showEndpointLabels}
              onChange={checked => update({ showEndpointLabels: checked })}
              disabled={!stationing.showGeometryLabels}
            />
          </div>
        </div>
      </section>

      <p className="px-0.5 text-[10px] leading-snug text-slate-500">
        Applies to BASELINE drawings and the Stationing &amp; CL agent. Annotation text stays a
        fixed size on screen at every zoom; only geometry scales. Point descriptions are stored
        unchanged, so saved sessions and point filters remain compatible.
      </p>
    </div>
  );
};

export default A2UIStationingControls;
