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
    ? `group/badge inline-flex h-[18px] w-[24px] shrink-0 items-center overflow-hidden rounded-full border border-emerald-500/40 bg-emerald-700/25 px-1.5 text-[9px] font-bold uppercase leading-none tracking-[0.1em] text-emerald-300 transition-[width,background-color,border-color,color,box-shadow] duration-300 ease-out hover:w-[62px] hover:border-emerald-400/70 hover:bg-emerald-600/40 hover:text-emerald-100 hover:shadow-[0_0_16px_-6px_rgba(52,211,153,0.55)] focus-visible:w-[62px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-300/60 motion-reduce:transition-none light-theme:bg-emerald-100 light-theme:text-emerald-800 light-theme:border-emerald-400 ${className}`
    : `inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-emerald-700/30 text-emerald-300 border border-emerald-500/40 transition-colors hover:bg-emerald-600/40 hover:text-emerald-100 light-theme:bg-emerald-100 light-theme:text-emerald-800 light-theme:border-emerald-400 ${className}`;

  const contents = (
    <>
      {!isGlyph && (
        <span className="relative flex-shrink-0 w-2 h-2">
          <span className="absolute inset-0 rounded-full bg-emerald-400/60 animate-ping" />
          <span className="relative block w-2 h-2 rounded-full bg-emerald-400 border border-emerald-200/80" />
        </span>
      )}
      {isGlyph ? (
        <>
          <OpposingArrowsIcon className="w-2.5 h-2.5 shrink-0 transition-transform duration-300 ease-out group-hover/badge:-translate-x-px motion-reduce:transition-none" aria-hidden="true" />
          <span className="inline-block max-w-0 shrink-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity,margin-left] duration-300 ease-out group-hover/badge:ml-1 group-hover/badge:max-w-[40px] group-hover/badge:opacity-100 group-focus-visible/badge:ml-1 group-focus-visible/badge:max-w-[40px] group-focus-visible/badge:opacity-100 motion-reduce:transition-none">
            CACP
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
        className={`${baseClasses} cursor-pointer`}
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
