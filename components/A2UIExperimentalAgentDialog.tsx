import React from 'react';
import type { AgentType, A2UIExperimentalAgentSpec } from '../types.ts';
import { agentThemeColors } from '../constants/agents.ts';
import { getExperimentalAgentDetails } from '../utils/experimentalAgents.ts';

export interface A2UIExperimentalAgentDialogProps {
  agent: AgentType;
  /** Pre-built copy; falls back to the shared experimental-agent details. */
  spec?: A2UIExperimentalAgentSpec | null;
  /** True when the agent is currently available on this browser. */
  enabled?: boolean;
  /** `surface` fills a floating/docked A2UI host; `inline` is a settings card. */
  presentation?: 'inline' | 'surface';
  onEnable?: () => void;
  onDismiss?: () => void;
}

/**
 * A2UI experimental-agent explainer.
 *
 * The same component renders inside the A2UI surface host (floating dialog),
 * in Quick Thought, and inline in Settings, so the warning and the opt-in
 * action never drift apart.
 */
export const A2UIExperimentalAgentDialog: React.FC<A2UIExperimentalAgentDialogProps> = ({
  agent,
  spec,
  enabled = false,
  presentation = 'inline',
  onEnable,
  onDismiss,
}) => {
  const details = spec ?? getExperimentalAgentDetails(agent);
  if (!details) return null;

  const isSurface = presentation === 'surface';
  const accent = agentThemeColors[agent] ?? '#94a3b8';
  const accentBorder = `${accent}73`;
  const accentSoft = `${accent}1f`;
  const accentFaint = `${accent}0d`;

  return (
    <div
      role="dialog"
      aria-label={`${details.label} experimental details`}
      data-testid={`a2ui-experimental-agent-${agent}`}
      className={
        isSurface
          ? 'p-4 text-slate-200'
          : 'rounded-lg border p-3 text-slate-200'
      }
      style={isSurface ? undefined : { borderColor: accentBorder, backgroundColor: accentFaint }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em]"
          style={{ borderColor: accentBorder, backgroundColor: accentSoft, color: accent }}
        >
          Experimental
        </span>
        <h3 className="text-sm font-semibold text-white">{details.label}</h3>
        {enabled && (
          <span className="ml-auto rounded border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-emerald-200">
            Enabled
          </span>
        )}
      </div>

      <p className="mt-2 text-[11px] leading-snug text-white/70">{details.summary}</p>

      <ul className="mt-2 space-y-1">
        {details.capabilities.map(item => (
          <li key={item} className="flex gap-1.5 text-[10.5px] leading-snug text-white/65">
            <span aria-hidden="true" className="mt-[3px] h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <p
        className="mt-2 rounded border px-2 py-1.5 text-[10px] leading-snug text-white/75"
        style={{ borderColor: `${accent}40`, backgroundColor: accentFaint }}
      >
        {details.warning}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!enabled && onEnable && (
          <button
            type="button"
            data-no-drag
            onClick={onEnable}
            data-testid={`a2ui-experimental-agent-enable-${agent}`}
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10.5px] font-semibold text-white transition hover:brightness-110"
            style={{ borderColor: accentBorder, backgroundColor: accentSoft }}
          >
            Enable {details.label}
            <span aria-hidden="true">→</span>
          </button>
        )}
        {enabled && (
          <span className="text-[10.5px] font-medium text-emerald-200">
            Available in this browser.
          </span>
        )}
        {onDismiss && (
          <button
            type="button"
            data-no-drag
            onClick={onDismiss}
            className="inline-flex items-center rounded-md border border-white/15 px-2.5 py-1.5 text-[10.5px] font-semibold text-white/60 transition-colors hover:border-white/30 hover:text-white"
          >
            Not now
          </button>
        )}
      </div>
    </div>
  );
};

export default A2UIExperimentalAgentDialog;
