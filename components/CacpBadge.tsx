import React from 'react';
import { agentRegistry } from '../services/AgentRegistry';
import { AgentType } from '../types';
import { OpposingArrowsIcon } from './icons';

interface CacpBadgeProps {
  agent: AgentType;
  className?: string;
  /** When true, render inline-flex with full label; otherwise compact. */
  compact?: boolean;
  /** Visual mode for where the badge is rendered. */
  variant?: 'label' | 'glyph';
  title?: string;
  /** When provided, badge becomes a button that invokes this handler. */
  onClick?: (agent: AgentType) => void;
}

/**
 * Small visual indicator that an agent participates in the CACP
 * (Cross Agent Communications Protocol). Renders nothing if the
 * agent is not registered or not CACP-enabled.
 */
export const CacpBadge: React.FC<CacpBadgeProps> = ({
  agent,
  className = '',
  compact = true,
  variant = 'label',
  title,
  onClick,
}) => {
  if (!agentRegistry.isCacpEnabled(agent)) return null;
  const manifest = agentRegistry.get(agent);
  const skillCount = manifest?.skills.length ?? 0;
  const tooltip =
    title ||
    (onClick
      ? `View CACP manifest • ${skillCount} skill${skillCount === 1 ? '' : 's'}`
      : `CACP Enabled • ${skillCount} skill${skillCount === 1 ? '' : 's'}`);

  const isGlyph = variant === 'glyph';
  const baseClasses = isGlyph
    ? `group inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-700/25 text-emerald-300 border border-emerald-500/40 light-theme:bg-emerald-100 light-theme:text-emerald-800 light-theme:border-emerald-400 overflow-hidden w-[44px] hover:w-[134px] focus-visible:w-[134px] transition-[width,background-color,color] duration-200 ease-out ${className}`
    : `inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-emerald-700/30 text-emerald-300 border border-emerald-500/40 light-theme:bg-emerald-100 light-theme:text-emerald-800 light-theme:border-emerald-400 ${className}`;

  const contents = (
    <>
      <span className="relative flex-shrink-0 w-2 h-2">
        <span className="absolute inset-0 rounded-full bg-emerald-400/60 animate-ping" />
        <span className="relative block w-2 h-2 rounded-full bg-emerald-400 border border-emerald-200/80" />
      </span>
      {isGlyph ? (
        <>
          <OpposingArrowsIcon className="w-3.5 h-3.5 shrink-0 text-emerald-200" aria-hidden="true" />
          <span className="text-[10px] font-bold uppercase tracking-wide whitespace-nowrap max-w-0 opacity-0 group-hover:max-w-[92px] group-hover:opacity-100 group-focus-visible:max-w-[92px] group-focus-visible:opacity-100 transition-all duration-200 ease-out">
            CACP Enabled
          </span>
        </>
      ) : (
        <>{compact ? 'CACP' : 'CACP-enabled'}</>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        title={tooltip}
        aria-label={tooltip}
        onClick={(e) => {
          e.stopPropagation();
          onClick(agent);
        }}
        className={`${baseClasses} cursor-pointer hover:bg-emerald-600/40 hover:text-emerald-100 transition-colors`}
      >
        {contents}
      </button>
    );
  }

  return (
    <span title={tooltip} aria-label={tooltip} className={baseClasses}>
      {contents}
    </span>
  );
};

export default CacpBadge;
