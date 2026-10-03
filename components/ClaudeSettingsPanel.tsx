/**
 * ClaudeSettingsPanel (v26.07.01.1)
 *
 * Floating panel for configuring Claude models via Vertex AI.
 * Mirrors the style and behaviour of Gemini3ControlsPanel.
 *
 * The panel publishes to `window.__claudeConfig` (via setClaudeConfig) so any
 * service that reads `getClaudeConfig()` picks up changes immediately.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ANTHROPIC_AUP_VERSION,
  type ClaudeConfig,
  type ClaudeModel,
  DEFAULT_CLAUDE_CONFIG,
  FABLE5_ADDENDUM_VERSION,
  loadClaudeConfig,
  setClaudeConfig,
} from '../services/claudeConfig.ts';

type ClaudeFeature =
  | 'Memory tool (beta)'
  | '1M token context window'
  | 'Enhanced tool orchestration'
  | 'Prompt caching'
  | 'Batch prediction'
  | 'Count tokens'
  | 'Global endpoint'
  | 'Multi-region endpoint';

interface ClaudeModelDetail {
  value: ClaudeModel;
  label: string;
  hint: string;
  releaseDate: string;
  inputTokenLimit: string;
  outputTokenLimit: string;
  outputTokenLimitValue: number;
  supportedInputTypes: string;
  supportedOutputTypes: string;
  features: ClaudeFeature[];
}

const CLAUDE_MODELS: ClaudeModelDetail[] = [
  {
    value: 'claude-sonnet-5',
    label: 'Claude Sonnet 5',
    hint: 'Best balance of intelligence and speed. Recommended for field work and complex analysis.',
    releaseDate: 'Aug 2026',
    inputTokenLimit: '200K',
    outputTokenLimit: '64,000',
    outputTokenLimitValue: 64000,
    supportedInputTypes: 'Text',
    supportedOutputTypes: 'Text',
    features: ['Memory tool (beta)', 'Enhanced tool orchestration', 'Prompt caching', 'Batch prediction', 'Count tokens', 'Global endpoint', 'Multi-region endpoint'],
  },
  {
    value: 'claude-opus-5',
    label: 'Claude Opus 5',
    hint: 'Highest intelligence. Best for nuanced deed interpretation and complex reasoning.',
    releaseDate: 'Aug 2026',
    inputTokenLimit: '200K',
    outputTokenLimit: '64,000',
    outputTokenLimitValue: 64000,
    supportedInputTypes: 'Text',
    supportedOutputTypes: 'Text',
    features: ['Memory tool (beta)', 'Enhanced tool orchestration', 'Prompt caching', 'Batch prediction', 'Count tokens', 'Global endpoint', 'Multi-region endpoint'],
  },
  {
    value: 'claude-fable-5',
    label: 'Claude Fable 5',
    hint: '1M-token context model with multimodal inputs and full Vertex AI capability support.',
    releaseDate: 'June 9, 2026',
    inputTokenLimit: '1M',
    outputTokenLimit: '128,000',
    outputTokenLimitValue: 128000,
    supportedInputTypes: 'Image, PDF, Text',
    supportedOutputTypes: 'Text',
    features: ['Memory tool (beta)', '1M token context window', 'Enhanced tool orchestration', 'Prompt caching', 'Batch prediction', 'Count tokens', 'Global endpoint', 'Multi-region endpoint'],
  },
];

const GCP_REGIONS = [
  { value: 'global', label: 'global (dynamic shared quota — required for Fable 5)' },
  { value: 'us-east5', label: 'us-east5 (Ohio)' },
  { value: 'us-central1', label: 'us-central1 (Iowa)' },
  { value: 'us-west1', label: 'us-west1 (Oregon)' },
  { value: 'europe-west4', label: 'europe-west4 (Netherlands)' },
];

interface Props {
  onClose?: () => void;
  selectedModel?: ClaudeModel;
  lockModel?: boolean;
  /**
   * Called with the selected Claude model whenever it changes (and Claude is
   * enabled). App uses this to route the active agent to the chosen model —
   * without it, the panel selection never reaches the chat routing layer.
   */
  onModelChange?: (model: ClaudeModel) => void;
}

export const ClaudeSettingsPanel: React.FC<Props> = ({ onClose, onModelChange, selectedModel, lockModel = false }) => {
  const [config, setConfig] = useState<ClaudeConfig>(() => ({
    ...loadClaudeConfig(),
    ...(selectedModel ? { enabled: true, model: selectedModel } : {}),
  }));
  const [collapsed, setCollapsed] = useState(false);

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const getDefaultPos = useCallback(() => ({
    x: Math.max(0, window.innerWidth - 336),
    y: 110,
  }), []);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select, textarea')) return;
    e.preventDefault();
    const current = pos ?? getDefaultPos();
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: current.x, origY: current.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 80, dragState.current.origX + ev.clientX - dragState.current.startX)),
        y: Math.max(0, Math.min(window.innerHeight - 40, dragState.current.origY + ev.clientY - dragState.current.startY)),
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

  // Publish on every change
  useEffect(() => {
    setClaudeConfig(config);
  }, [config]);

  useEffect(() => {
    if (!selectedModel) return;
    setConfig(prev => (
      prev.model === selectedModel && prev.enabled
        ? prev
        : { ...prev, enabled: true, model: selectedModel }
    ));
  }, [selectedModel]);

  // Propagate the selected model to the chat routing layer so the active agent
  // actually runs on the chosen Claude model (not just stores it in config).
  useEffect(() => {
    if (config.enabled && onModelChange) {
      onModelChange(config.model);
    }
  }, [config.enabled, config.model, onModelChange]);

  const modelDetail = CLAUDE_MODELS.find(m => m.value === config.model) ?? CLAUDE_MODELS[0];
  const maxOutputTokenLimit = modelDetail.outputTokenLimitValue;

  useEffect(() => {
    if (config.maxTokens > maxOutputTokenLimit) {
      setConfig(prev => ({ ...prev, maxTokens: maxOutputTokenLimit }));
    }
  }, [config.maxTokens, maxOutputTokenLimit]);

  const update = <K extends keyof ClaudeConfig>(key: K, value: ClaudeConfig[K]) =>
    setConfig(prev => ({ ...prev, [key]: value }));

  const isFable5Selected = config.model === 'claude-fable-5';

  // Fable 5 has zero regional per-project quota; it is served via the global
  // endpoint's dynamic shared quota. Auto-switch so users don't hit 429s.
  // Fable 5 is also an extended-thinking model whose reasoning tokens share the
  // max_tokens budget — an 8k default gets fully consumed by thinking on large
  // prompts, yielding an empty answer. Raise the floor so visible output fits.
  useEffect(() => {
    if (isFable5Selected) {
      setConfig(prev => {
        const next = { ...prev };
        let changed = false;
        if (prev.region !== 'global') { next.region = 'global'; changed = true; }
        if (prev.maxTokens < 32000) { next.maxTokens = 32000; changed = true; }
        return changed ? next : prev;
      });
    }
  }, [isFable5Selected, config.region, config.maxTokens]);

  const updateFableConsent = (checked: boolean) => {
    setConfig(prev => ({
      ...prev,
      fable5AddendumAccepted: checked,
      fable5AddendumAcceptedAt: checked ? new Date().toISOString() : '',
      fable5AddendumVersion: checked ? FABLE5_ADDENDUM_VERSION : '',
    }));
  };

  const updateAnthropicAupConsent = (checked: boolean) => {
    setConfig(prev => ({
      ...prev,
      anthropicAupAccepted: checked,
      anthropicAupAcceptedAt: checked ? new Date().toISOString() : '',
      anthropicAupVersion: checked ? ANTHROPIC_AUP_VERSION : '',
    }));
  };

  const reset = () => setConfig({ ...DEFAULT_CLAUDE_CONFIG, enabled: config.enabled });

  const resolvedPos = pos ?? getDefaultPos();

  return (
    <div
      className="fixed z-40 bg-gray-900/95 border border-orange-500/40 rounded-lg shadow-2xl text-sm text-gray-200 backdrop-blur-sm w-80"
      style={{ left: resolvedPos.x, top: resolvedPos.y }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-orange-500/30 cursor-move select-none"
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2">
          <span className="text-orange-300">🤖</span>
          <span className="font-semibold text-orange-200">
            {lockModel ? `${modelDetail.label} Settings` : 'Claude Models · Vertex AI'}
          </span>
          <span className="text-[10px] uppercase tracking-wide bg-orange-700/60 text-orange-100 px-1.5 py-0.5 rounded">
            Anthropic
          </span>
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
          {/* Enable toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={e => update('enabled', e.target.checked)}
              className="accent-orange-500"
            />
            <span className="text-gray-100">Enable Claude Models (Vertex AI)</span>
          </label>
          <p className="text-[11px] text-gray-400 -mt-1 pl-6">
            When enabled, Claude is available as an AI model option in supported agents.
            Requires the /api/claude backend proxy to be deployed.
          </p>

          <div className="rounded border border-orange-500/40 bg-orange-900/20 p-3 space-y-2">
            <p className="text-xs text-orange-100 leading-relaxed">
              Anthropic Usage Policy applies to all Claude models. Prohibited use categories include
              malware/cyber abuse, fraud/deception, illegal activity, privacy/identity abuse, and
              other harmful content classes. High-risk domains require human-in-the-loop review and
              clear AI-use disclosure to end users.
            </p>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.anthropicAupAccepted}
                onChange={e => updateAnthropicAupConsent(e.target.checked)}
                className="mt-0.5 accent-orange-500"
              />
              <span className="text-[11px] text-orange-100">
                I acknowledge and accept Anthropic Usage Policy obligations for Claude model use
                (effective {ANTHROPIC_AUP_VERSION}), including prohibited-use restrictions and
                required human-review/disclosure controls for applicable high-risk use cases.
              </span>
            </label>
            <a
              href="https://www.anthropic.com/legal/aup"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-orange-300 hover:text-orange-200 underline"
            >
              View Anthropic Usage Policy
            </a>
            {config.anthropicAupAcceptedAt && (
              <p className="text-[10px] text-orange-200/80">
                Accepted on this device at {new Date(config.anthropicAupAcceptedAt).toLocaleString()}.
              </p>
            )}
          </div>

          {/* Model */}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">Model</label>
            {lockModel ? (
              <div className="w-full rounded border border-orange-500/30 bg-orange-900/20 px-2 py-1 text-orange-100">
                {modelDetail.label}
              </div>
            ) : (
              <select
                value={config.model}
                onChange={e => update('model', e.target.value as ClaudeModel)}
                disabled={!config.enabled}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-100 disabled:opacity-50"
              >
                {CLAUDE_MODELS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            )}
            <p className="text-[11px] text-gray-400 mt-1">{modelDetail.hint}</p>
          </div>

          {isFable5Selected && (
            <div className="rounded border border-amber-500/40 bg-amber-900/20 p-3 space-y-2">
              <p className="text-xs text-amber-100 leading-relaxed">
                Claude Fable 5 is configured as Advanced AI. Before using it, you must acknowledge
                Google Cloud Advanced AI Safety Addendum conditions for this project, including
                policy-compliant use and temporary safety-retention/review handling for prompts and
                generated output as described by Google.
              </p>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.fable5AddendumAccepted}
                  onChange={e => updateFableConsent(e.target.checked)}
                  className="mt-0.5 accent-amber-500"
                />
                <span className="text-[11px] text-amber-100">
                  I acknowledge and accept the Advanced AI Safety Addendum obligations for Claude Fable 5
                  usage in this project (version {FABLE5_ADDENDUM_VERSION}).
                </span>
              </label>
              <a
                href="https://cloud.google.com/terms/advanced-ai-safety-addendum"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-amber-300 hover:text-amber-200 underline"
              >
                View Google Advanced AI Safety Addendum
              </a>
              {config.fable5AddendumAcceptedAt && (
                <p className="text-[10px] text-amber-200/80">
                  Accepted on this device at {new Date(config.fable5AddendumAcceptedAt).toLocaleString()}.
                </p>
              )}
            </div>
          )}

          <div className="rounded border border-gray-700/50 bg-gray-800/40 p-3 space-y-2">
            <div className="text-xs font-medium text-gray-300">Model Details</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <div className="text-gray-500">Release Date</div>
              <div className="text-gray-200">{modelDetail.releaseDate}</div>
              <div className="text-gray-500">Token Limits</div>
              <div className="text-gray-200">Input: {modelDetail.inputTokenLimit} · Output: {modelDetail.outputTokenLimit}</div>
              <div className="text-gray-500">Input Types</div>
              <div className="text-gray-200">{modelDetail.supportedInputTypes}</div>
              <div className="text-gray-500">Output Types</div>
              <div className="text-gray-200">{modelDetail.supportedOutputTypes}</div>
            </div>
            <div>
              <div className="text-[11px] text-gray-500 mb-1">Feature Support</div>
              <ul className="text-[11px] text-gray-300 space-y-0.5 list-disc pl-4">
                {modelDetail.features.map(feature => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* GCP Region */}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">Vertex AI Region</label>
            <select
              value={config.region}
              onChange={e => update('region', e.target.value)}
              disabled={!config.enabled}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-100 disabled:opacity-50"
            >
              {GCP_REGIONS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {/* GCP Project override */}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              GCP Project ID <span className="text-gray-500 font-normal">(optional override)</span>
            </label>
            <input
              type="text"
              value={config.gcpProject}
              onChange={e => update('gcpProject', e.target.value)}
              disabled={!config.enabled}
              placeholder="defaults to backend GOOGLE_CLOUD_PROJECT"
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-100 text-xs font-mono disabled:opacity-50 placeholder-gray-600"
            />
          </div>

          {/* Temperature */}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Temperature: <span className="font-mono text-orange-300">{config.temperature.toFixed(2)}</span>
            </label>
            <input
              type="range" min={0} max={1} step={0.05}
              value={config.temperature}
              onChange={e => update('temperature', parseFloat(e.target.value))}
              disabled={!config.enabled}
              className="w-full accent-orange-500 disabled:opacity-50"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              {config.temperature < 0.3
                ? 'Very focused — best for structured extraction.'
                : config.temperature < 0.7
                ? 'Balanced — recommended for most tasks.'
                : 'Creative — good for synthesis and writing.'}
            </p>
          </div>

          {/* Max tokens */}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Max Output Tokens: <span className="font-mono text-orange-300">{config.maxTokens.toLocaleString()}</span> <span className="text-gray-500">(model max {maxOutputTokenLimit.toLocaleString()})</span>
            </label>
            <input
              type="range" min={512} max={maxOutputTokenLimit} step={512}
              value={config.maxTokens}
              onChange={e => update('maxTokens', parseInt(e.target.value, 10))}
              disabled={!config.enabled}
              className="w-full accent-orange-500 disabled:opacity-50"
            />
          </div>

          {/* Extra system instructions */}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Extra System Instructions
            </label>
            <textarea
              value={config.systemPromptAddendum}
              onChange={e => update('systemPromptAddendum', e.target.value)}
              disabled={!config.enabled}
              rows={4}
              placeholder='Appended to the active agent system prompt. e.g. "Always include confidence scores."'
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-100 text-xs font-mono disabled:opacity-50 resize-y"
            />
          </div>

          {/* Backend note */}
          <div className="rounded border border-gray-700/50 bg-gray-800/40 p-2 text-[10px] text-gray-500 space-y-0.5">
            <div className="font-medium text-gray-400">Backend proxy required</div>
            <div>Requests route through <code className="text-orange-300/80">/api/claude</code> on your Cloud Run backend.
              Add <code className="text-orange-300/80">ANTHROPIC_VERTEX_REGION</code> and ensure the service account has
              <code className="text-orange-300/80"> roles/aiplatform.user</code> on the GCP project.
            </div>
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

export default ClaudeSettingsPanel;
