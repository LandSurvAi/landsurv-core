/**
 * Experimental controls for Gemini 3 preview models.
 *
 * Renders only when the active agent is Civil Plan Expert and the active
 * model is a Gemini 3.x preview. Exposes thinking level, media resolution,
 * temperature, max output tokens, and a freeform system-prompt addendum.
 *
 * The active config is published to `window.__gemini3Config` so
 * services/geminiService.ts can pick it up at chat-creation time.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  type Gemini3Config,
  type ThinkingLevel,
  type MediaResolution,
  DEFAULT_GEMINI3_CONFIG,
  loadGemini3Config,
  setGemini3Config,
} from '../services/gemini3Config.ts';
import { AgentType } from '../types.ts';

const THINKING_LEVELS: { value: ThinkingLevel; label: string; hint: string }[] = [
  { value: 'MINIMAL', label: 'Minimal', hint: 'Near-zero thinking. Fastest, cheapest. Good for raw extraction.' },
  { value: 'LOW',     label: 'Low',     hint: 'Light reasoning. High throughput.' },
  { value: 'MEDIUM',  label: 'Medium',  hint: 'Balanced. Some reasoning, lower latency than HIGH.' },
  { value: 'HIGH',    label: 'High',    hint: 'Deep reasoning. Higher latency and token use.' },
];

const MEDIA_RESOLUTIONS: { value: MediaResolution; label: string; hint: string }[] = [
  { value: 'UNSPECIFIED', label: 'Auto',       hint: 'Let Gemini choose.' },
  { value: 'LOW',         label: 'Low (280)',  hint: 'Cheapest. Misses fine text.' },
  { value: 'MEDIUM',      label: 'Medium (560)', hint: 'Decent for clean plan sheets.' },
  { value: 'HIGH',        label: 'High (1120)',  hint: 'Recommended for plan sheets.' },
  { value: 'ULTRA_HIGH',  label: 'Ultra (2240)', hint: 'Maximum detail. Best for dense scanned PDFs.' },
];

interface Props {
  /** Optional close handler if the host wants to render this as a popover. */
  onClose?: () => void;
  /** The currently active agent, used to reflect per-agent overrides. */
  activeAgent?: AgentType;
}

export const Gemini3ControlsPanel: React.FC<Props> = ({ onClose, activeAgent }) => {
  const [config, setConfig] = useState<Gemini3Config>(() => loadGemini3Config());
  const [collapsed, setCollapsed] = useState<boolean>(false);

  const isCivilDrafter = activeAgent === AgentType.CIVIL_DRAFTER;

  // Drag state
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const getDefaultPos = useCallback(() => ({
    x: window.innerWidth - 336, // 320px panel + 16px right margin
    y: 80,                       // ~top-20
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
    setGemini3Config(config);
  }, [config]);

  const update = <K extends keyof Gemini3Config>(key: K, value: Gemini3Config[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const reset = () => setConfig({ ...DEFAULT_GEMINI3_CONFIG, enabled: config.enabled });

  const resolvedPos = pos ?? getDefaultPos();

  return (
    <div
      className="fixed z-40 bg-gray-900/95 border border-purple-500/40 rounded-lg shadow-2xl text-sm text-gray-200 backdrop-blur-sm w-80"
      style={{ left: resolvedPos.x, top: resolvedPos.y }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-purple-500/30 cursor-move select-none"
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2">
          <span className="text-purple-300">🧪</span>
          <span className="font-semibold text-purple-200">Gemini 3 Experimental</span>
          <span className="text-[10px] uppercase tracking-wide bg-purple-700/60 text-purple-100 px-1.5 py-0.5 rounded">Preview</span>
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
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={e => update('enabled', e.target.checked)}
              className="accent-purple-500"
            />
            <span className="text-gray-100">Enable Gemini 3 controls</span>
          </label>
          <p className="text-[11px] text-gray-400 -mt-1 pl-6">
            When off, the model uses balanced defaults (MEDIUM thinking and media resolution).
          </p>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">Thinking Level</label>
            <select
              value={config.thinkingLevel}
              onChange={e => update('thinkingLevel', e.target.value as ThinkingLevel)}
              disabled={!config.enabled}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-100 disabled:opacity-50"
            >
              {THINKING_LEVELS.map(l => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">
              {isCivilDrafter
                ? `${THINKING_LEVELS.find(l => l.value === config.thinkingLevel)?.hint} Applies to the next Civil Drafter chat.`
                : THINKING_LEVELS.find(l => l.value === config.thinkingLevel)?.hint}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">Media Resolution</label>
            <select
              value={config.mediaResolution}
              onChange={e => update('mediaResolution', e.target.value as MediaResolution)}
              disabled={!config.enabled}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-100 disabled:opacity-50"
            >
              {MEDIA_RESOLUTIONS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">
              {MEDIA_RESOLUTIONS.find(r => r.value === config.mediaResolution)?.hint}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Temperature: <span className="font-mono text-purple-300">{config.temperature.toFixed(2)}</span>
            </label>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={config.temperature}
              onChange={e => update('temperature', parseFloat(e.target.value))}
              disabled={!config.enabled}
              className="w-full accent-purple-500 disabled:opacity-50"
            />
            {config.temperature !== 1.0 && (
              <p className="text-[11px] text-amber-400 mt-1">
                ⚠ Google recommends 1.0 for Gemini 3 — other values can cause looping.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Max Output Tokens: <span className="font-mono text-purple-300">{config.maxOutputTokens.toLocaleString()}</span>
            </label>
            <input
              type="range"
              min={1024}
              max={64000}
              step={1024}
              value={config.maxOutputTokens}
              onChange={e => update('maxOutputTokens', parseInt(e.target.value, 10))}
              disabled={!config.enabled}
              className="w-full accent-purple-500 disabled:opacity-50"
            />
            {config.thinkingLevel === 'HIGH' && config.maxOutputTokens < 49152 && (
              <p className="text-[11px] text-amber-400 mt-1">
                ⚠ High thinking counts against this budget — drafting requests can get truncated before any linework is produced. Recommend 49k+ (max 64k).
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Extra System Instructions
            </label>
            <textarea
              value={config.systemPromptAddendum}
              onChange={e => update('systemPromptAddendum', e.target.value)}
              disabled={!config.enabled}
              rows={4}
              placeholder="Appended to the Civil Plan Expert prompt. Try: &quot;Treat the provided context as the absolute limit of truth.&quot;"
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-100 text-xs font-mono disabled:opacity-50 resize-y"
            />
          </div>

          <div className="flex justify-between pt-1">
            <button
              onClick={reset}
              className="text-xs text-gray-400 hover:text-white underline disabled:opacity-50"
              disabled={!config.enabled}
            >Reset to defaults</button>
            <span className="text-[11px] text-gray-500">Applies to next chat turn</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Gemini3ControlsPanel;
