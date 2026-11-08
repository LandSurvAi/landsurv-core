/**
 * Civil Drafter context management — A2UI surface.
 *
 * The surface is hosted by A2UISurfaceHost, so the host owns the window chrome,
 * minimize/fullscreen controls, and close behavior. This component only owns
 * the context-budget controls and publishes the active config through
 * services/civilDrafterContextConfig.ts.
 */

import React, { useEffect, useId, useState } from 'react';
import { Check, Gauge, RotateCcw } from 'lucide-react';
import {
  type CivilDrafterContextConfig,
  type CivilDrafterContextVolume,
  DEFAULT_CIVIL_DRAFTER_CONTEXT_CONFIG,
  EMPTY_CIVIL_DRAFTER_CONTEXT_VOLUME,
  loadCivilDrafterContextConfig,
  setCivilDrafterContextConfig,
} from '../services/civilDrafterContextConfig.ts';

interface Props {
  volume?: CivilDrafterContextVolume;
  modelName?: string;
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const estimateTextTokens = (chars: number): number => Math.ceil(chars / 4);

const estimateModelWindow = (modelName?: string): number => {
  const normalized = modelName?.toLowerCase() ?? '';
  if (normalized.includes('claude')) return 200_000;
  return 1_000_000;
};

const SwitchRow: React.FC<{
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}> = ({ id, label, hint, checked, disabled, onChange }) => (
  <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p id={`${id}-label`} className="text-[11px] font-semibold text-slate-100">
          {label}
        </p>
        <p id={`${id}-hint`} className="mt-0.5 text-[10px] leading-snug text-slate-500">
          {hint}
        </p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/60 disabled:cursor-not-allowed disabled:opacity-40 ${
          checked
            ? 'border-fuchsia-400/60 bg-fuchsia-500/80'
            : 'border-white/[0.12] bg-white/[0.06]'
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute left-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white text-fuchsia-700 shadow-sm transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        >
          {checked ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : null}
        </span>
      </button>
    </div>
  </div>
);

export const CivilDrafterContextPanel: React.FC<Props> = ({
  volume = EMPTY_CIVIL_DRAFTER_CONTEXT_VOLUME,
  modelName,
}) => {
  const idPrefix = useId();
  const [config, setConfig] = useState<CivilDrafterContextConfig>(() =>
    loadCivilDrafterContextConfig(),
  );

  useEffect(() => {
    setCivilDrafterContextConfig(config);
  }, [config]);

  const update = <K extends keyof CivilDrafterContextConfig>(
    key: K,
    value: CivilDrafterContextConfig[K],
  ) => {
    setConfig(previous => ({ ...previous, [key]: value }));
  };

  const reset = () =>
    setConfig({ ...DEFAULT_CIVIL_DRAFTER_CONTEXT_CONFIG, enabled: config.enabled });

  const controlsDisabled = !config.enabled;
  const fixedTokens = estimateTextTokens(volume.fixedTextChars);
  const retainedTokens = estimateTextTokens(volume.retainedTextChars);
  const estimatedTextTokens = fixedTokens + retainedTokens;
  const modelWindow = estimateModelWindow(modelName);
  const windowPercent = Math.min(100, (estimatedTextTokens / modelWindow) * 100);
  const growthPercent = Math.min(
    100,
    Math.max(
      windowPercent,
      (Math.log10(Math.max(retainedTokens, 1)) / Math.log10(modelWindow)) * 100,
    ),
  );
  const meterTone =
    windowPercent >= 85
      ? 'bg-rose-400'
      : windowPercent >= 60
        ? 'bg-amber-400'
        : 'bg-fuchsia-400';

  const masterSwitchId = `${idPrefix}-enabled`;
  const freshContextId = `${idPrefix}-fresh-context`;
  const pointDatabaseId = `${idPrefix}-point-database`;
  const visionId = `${idPrefix}-vision`;
  const autoResetId = `${idPrefix}-auto-reset`;

  return (
    <div data-testid="civil-drafter-context-surface" className="space-y-3 text-slate-200">
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] pb-3">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-400/25 bg-fuchsia-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-fuchsia-300">
            <Gauge className="h-3 w-3" />
            Civil Drafter
          </span>
          <h2 className="mt-1.5 text-sm font-semibold text-white">Context budget</h2>
          <p className="mt-1 text-[11px] leading-snug text-slate-400">
            Keep each drafting request inside the model window by controlling conversation
            history, point payloads, and vision imagery.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-emerald-300">
          Applies next request
        </span>
      </div>

      <section
        aria-labelledby={`${idPrefix}-budget-heading`}
        className="rounded-xl border border-fuchsia-400/20 bg-fuchsia-400/[0.04] p-3"
      >
        <div className="flex items-center justify-between gap-3">
          <h3
            id={`${idPrefix}-budget-heading`}
            className="text-[10px] font-bold uppercase tracking-[0.14em] text-fuchsia-200"
          >
            Tracked context volume
          </h3>
          <span className="font-mono text-[11px] text-fuchsia-300">
            ~{estimatedTextTokens.toLocaleString()} text tokens
          </span>
        </div>

        <div
          role="progressbar"
          aria-label="Estimated context window usage"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(windowPercent)}
          className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.08]"
          title={`Estimated usage: ${windowPercent.toFixed(1)}% of the model text window`}
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ${meterTone}`}
            style={{ width: `${growthPercent}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-slate-500">
          <span>
            {windowPercent.toFixed(windowPercent < 1 ? 2 : 1)}% of ~
            {(modelWindow / 1000).toLocaleString()}k
          </span>
          <span>
            {volume.retainedTurns} retained turn{volume.retainedTurns === 1 ? '' : 's'}
          </span>
        </div>

        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10.5px]">
          <dt className="text-slate-500">Fixed file baseline</dt>
          <dd className="text-right font-mono text-slate-200">
            ~{fixedTokens.toLocaleString()} tok
          </dd>
          <dt className="text-slate-500">Conversation growth</dt>
          <dd className="text-right font-mono text-fuchsia-300">
            +~{retainedTokens.toLocaleString()} tok
          </dd>
          <dt className="text-slate-500">Retained imagery</dt>
          <dd className="text-right font-mono text-slate-200">
            {volume.retainedImageCount} / {formatBytes(volume.retainedImageBytes)}
          </dd>
          <dt className="text-slate-500">Last request</dt>
          <dd className="text-right font-mono text-slate-200">
            ~{estimateTextTokens(volume.lastRequestTextChars).toLocaleString()} tok
            {volume.lastRequestImageCount > 0
              ? ` + ${volume.lastRequestImageCount} img`
              : ''}
          </dd>
        </dl>

        {volume.resetCount > 0 && (
          <p className="mt-2 text-[10px] text-emerald-300">
            Context dropped {volume.resetCount} time
            {volume.resetCount === 1 ? '' : 's'} this session.
          </p>
        )}
        <p className="mt-2 text-[10px] leading-snug text-slate-500">
          Estimate only: text uses ~4 characters per token. The bar is log-scaled so early
          growth stays visible. Image bytes are separate because vision tokenization varies
          by model and resolution.
        </p>
      </section>

      <section aria-labelledby={`${idPrefix}-retention-heading`} className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3
            id={`${idPrefix}-retention-heading`}
            className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400"
          >
            Retention
          </h3>
          <span className="text-[9.5px] text-slate-500">Host-managed</span>
        </div>

        <SwitchRow
          id={masterSwitchId}
          label="Manage conversation context"
          hint="When off, every request keeps the full prior conversation and can exceed the model input limit."
          checked={config.enabled}
          onChange={value => update('enabled', value)}
        />

        <SwitchRow
          id={freshContextId}
          label="Fresh context on each draw"
          hint='Clears conversation memory before every "draw" or "plot" request. Recommended.'
          checked={config.freshContextPerDraw}
          disabled={controlsDisabled}
          onChange={value => update('freshContextPerDraw', value)}
        />

        <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor={autoResetId} className="text-[11px] font-semibold text-slate-100">
              Auto-reset after
            </label>
            <output htmlFor={autoResetId} className="font-mono text-[11px] text-fuchsia-300">
              {config.autoResetTurns === 0
                ? 'Off'
                : `${config.autoResetTurns} turn${config.autoResetTurns === 1 ? '' : 's'}`}
            </output>
          </div>
          <input
            id={autoResetId}
            type="range"
            min={0}
            max={20}
            step={1}
            value={config.autoResetTurns}
            onChange={event => update('autoResetTurns', parseInt(event.target.value, 10))}
            disabled={controlsDisabled}
            aria-describedby={`${autoResetId}-hint`}
            className="mt-2 w-full accent-fuchsia-400 disabled:opacity-40"
          />
          <p id={`${autoResetId}-hint`} className="mt-1 text-[10px] leading-snug text-slate-500">
            Clears conversation memory once this many turns accumulate. Off keeps memory
            until a draw resets it.
          </p>
        </div>
      </section>

      <section aria-labelledby={`${idPrefix}-payload-heading`} className="space-y-2">
        <h3
          id={`${idPrefix}-payload-heading`}
          className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400"
        >
          Payload
        </h3>
        <SwitchRow
          id={pointDatabaseId}
          label="Send point database each turn"
          hint="The loaded file is already in the system prompt. Turn off to drop the large per-turn point block."
          checked={config.includePointDatabase}
          disabled={controlsDisabled}
          onChange={value => update('includePointDatabase', value)}
        />
        <SwitchRow
          id={visionId}
          label="Attach vision imagery on draw"
          hint="Multi-zoom scene frames and aerial reference. Very token-heavy — turn off if requests still overflow."
          checked={config.attachVisionImagery}
          disabled={controlsDisabled}
          onChange={value => update('attachVisionImagery', value)}
        />
      </section>

      <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
        <button
          type="button"
          onClick={reset}
          disabled={controlsDisabled}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.1] bg-white/[0.03] px-2.5 py-1.5 text-[10.5px] font-semibold text-slate-300 transition-colors hover:border-white/[0.2] hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/60 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset to defaults
        </button>
        <span className="text-[10px] text-slate-500">Applies to next request</span>
      </div>
    </div>
  );
};

export default CivilDrafterContextPanel;
