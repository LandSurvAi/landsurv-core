/**
 * Civil Drafter context-management controls.
 *
 * A small draggable dialog that lets the user decide how much conversation
 * context the Civil Drafter carries between turns. This directly addresses the
 * "input exceeds maximum tokens" (400) failures that appear after several
 * back-to-back draw requests: with a large point database and vision imagery
 * attached each turn, the retained history grows until it overflows the model's
 * input window.
 *
 * The active config is published to `window.__civilDrafterContextConfig` (see
 * services/civilDrafterContextConfig.ts) so App.tsx can read it at send time.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  type CivilDrafterContextConfig,
  type CivilDrafterContextVolume,
  DEFAULT_CIVIL_DRAFTER_CONTEXT_CONFIG,
  EMPTY_CIVIL_DRAFTER_CONTEXT_VOLUME,
  loadCivilDrafterContextConfig,
  setCivilDrafterContextConfig,
} from '../services/civilDrafterContextConfig.ts';

interface Props {
  /** Close handler — the host renders this as a floating popover. */
  onClose?: () => void;
  volume?: CivilDrafterContextVolume;
  modelName?: string;
}

const Toggle: React.FC<{
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, hint, checked, disabled, onChange }) => (
  <div>
    <label className={`flex items-center gap-2 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        className="accent-fuchsia-500"
      />
      <span className="text-gray-100">{label}</span>
    </label>
    <p className="text-[11px] text-gray-400 mt-0.5 pl-6">{hint}</p>
  </div>
);

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

export const CivilDrafterContextPanel: React.FC<Props> = ({
  onClose,
  volume = EMPTY_CIVIL_DRAFTER_CONTEXT_VOLUME,
  modelName,
}) => {
  const [config, setConfig] = useState<CivilDrafterContextConfig>(() => loadCivilDrafterContextConfig());
  const [collapsed, setCollapsed] = useState<boolean>(false);

  // Drag state
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const getDefaultPos = useCallback(() => ({
    x: window.innerWidth - 336, // 320px panel + 16px right margin
    y: 80,
  }), []);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select, textarea')) return;
    e.preventDefault();
    const current = pos ?? getDefaultPos();
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: current.x, origY: current.y };

    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      const dx = ev.clientX - dragState.current.startX;
      const dy = ev.clientY - dragState.current.startY;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 80, dragState.current.origX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 40, dragState.current.origY + dy)),
      });
    };
    const onUp = () => {
      dragState.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pos, getDefaultPos]);

  // Publish on every change.
  useEffect(() => {
    setCivilDrafterContextConfig(config);
  }, [config]);

  const update = <K extends keyof CivilDrafterContextConfig>(key: K, value: CivilDrafterContextConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const reset = () => setConfig({ ...DEFAULT_CIVIL_DRAFTER_CONTEXT_CONFIG, enabled: config.enabled });

  const resolvedPos = pos ?? getDefaultPos();
  const controlsDisabled = !config.enabled;
  const fixedTokens = estimateTextTokens(volume.fixedTextChars);
  const retainedTokens = estimateTextTokens(volume.retainedTextChars);
  const estimatedTextTokens = fixedTokens + retainedTokens;
  const modelWindow = estimateModelWindow(modelName);
  const windowPercent = Math.min(100, (estimatedTextTokens / modelWindow) * 100);
  const growthPercent = Math.min(100, Math.max(
    windowPercent,
    Math.log10(Math.max(retainedTokens, 1)) / Math.log10(modelWindow) * 100,
  ));
  const meterTone = windowPercent >= 85
    ? 'bg-red-500'
    : windowPercent >= 60
      ? 'bg-amber-400'
      : 'bg-fuchsia-500';

  return (
    <div
      className="fixed z-40 bg-gray-900/95 border border-fuchsia-500/40 rounded-lg shadow-2xl text-sm text-gray-200 backdrop-blur-sm w-80"
      style={{ left: resolvedPos.x, top: resolvedPos.y }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-fuchsia-500/30 cursor-move select-none"
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2">
          <span className="text-fuchsia-300">🧠</span>
          <span className="font-semibold text-fuchsia-200">Civil Drafter Context</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCollapsed(c => !c)}
            className="text-xs text-gray-400 hover:text-white"
            title={collapsed ? 'Expand' : 'Collapse'}
          >{collapsed ? '▾' : '▴'}</button>
          {onClose && (
            <button onClick={onClose} className="text-xs text-gray-400 hover:text-white" title="Close">✕</button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="p-3 space-y-3 max-h-[70vh] overflow-y-auto">
          <div className="rounded-md border border-fuchsia-500/30 bg-gray-950/60 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-fuchsia-200">Tracked context volume</span>
              <span className="font-mono text-xs text-fuchsia-300">
                ~{estimatedTextTokens.toLocaleString()} text tokens
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-700" title={`Log-scaled growth; numeric usage is ${windowPercent.toFixed(1)}% of the estimated model text window`}>
              <div
                className={`h-full rounded-full transition-all duration-500 ${meterTone}`}
                style={{ width: `${growthPercent}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-gray-500">
              <span>{windowPercent.toFixed(windowPercent < 1 ? 2 : 1)}% of ~{(modelWindow / 1000).toLocaleString()}k</span>
              <span>{volume.retainedTurns} retained turn{volume.retainedTurns === 1 ? '' : 's'}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <span className="text-gray-400">Fixed file baseline</span>
              <span className="text-right font-mono text-gray-200">~{fixedTokens.toLocaleString()} tok</span>
              <span className="text-gray-400">Conversation growth</span>
              <span className="text-right font-mono text-fuchsia-300">+~{retainedTokens.toLocaleString()} tok</span>
              <span className="text-gray-400">Retained imagery</span>
              <span className="text-right font-mono text-gray-200">
                {volume.retainedImageCount} / {formatBytes(volume.retainedImageBytes)}
              </span>
              <span className="text-gray-400">Last request</span>
              <span className="text-right font-mono text-gray-200">
                ~{estimateTextTokens(volume.lastRequestTextChars).toLocaleString()} tok
                {volume.lastRequestImageCount > 0 ? ` + ${volume.lastRequestImageCount} img` : ''}
              </span>
            </div>
            {volume.resetCount > 0 && (
              <p className="mt-2 text-[10px] text-emerald-400">
                Context dropped {volume.resetCount} time{volume.resetCount === 1 ? '' : 's'} this session.
              </p>
            )}
            <p className="mt-2 text-[10px] leading-tight text-gray-500">
              Estimate only: text uses ~4 characters/token. The bar is log-scaled so early growth stays visible. Image bytes are separate because vision tokenization varies by model and resolution.
            </p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={e => update('enabled', e.target.checked)}
              className="accent-fuchsia-500"
            />
            <span className="text-gray-100">Manage conversation context</span>
          </label>
          <p className="text-[11px] text-gray-400 -mt-1 pl-6">
            When off, every request keeps the full prior conversation — after several draws the input can exceed the model's limit (a 400 error).
          </p>

          <div className="border-t border-gray-700/60 pt-3">
            <Toggle
              label="Fresh context on each draw"
              hint='Clears conversation memory before every "draw"/"plot" request so each one runs clean. Recommended.'
              checked={config.freshContextPerDraw}
              disabled={controlsDisabled}
              onChange={v => update('freshContextPerDraw', v)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Auto-reset after:{' '}
              <span className="font-mono text-fuchsia-300">
                {config.autoResetTurns === 0 ? 'Off' : `${config.autoResetTurns} turn${config.autoResetTurns === 1 ? '' : 's'}`}
              </span>
            </label>
            <input
              type="range"
              min={0}
              max={20}
              step={1}
              value={config.autoResetTurns}
              onChange={e => update('autoResetTurns', parseInt(e.target.value, 10))}
              disabled={controlsDisabled}
              className="w-full accent-fuchsia-500 disabled:opacity-50"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Clears conversation memory once this many turns accumulate. 0 keeps memory until a draw resets it (above).
            </p>
          </div>

          <div className="border-t border-gray-700/60 pt-3">
            <Toggle
              label="Send point database each turn"
              hint="The loaded file is already in the system prompt. Turn off to drop the large per-turn point block and shrink requests."
              checked={config.includePointDatabase}
              disabled={controlsDisabled}
              onChange={v => update('includePointDatabase', v)}
            />
          </div>

          <div>
            <Toggle
              label="Attach vision imagery on draw"
              hint="Multi-zoom scene frames + aerial reference. Very token-heavy — turn off if requests still overflow."
              checked={config.attachVisionImagery}
              disabled={controlsDisabled}
              onChange={v => update('attachVisionImagery', v)}
            />
          </div>

          <div className="flex justify-between pt-1">
            <button
              onClick={reset}
              className="text-xs text-gray-400 hover:text-white underline disabled:opacity-50"
              disabled={controlsDisabled}
            >Reset to defaults</button>
            <span className="text-[11px] text-gray-500">Applies to next request</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default CivilDrafterContextPanel;
