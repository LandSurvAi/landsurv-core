import React, { useState, useEffect } from 'react';
import { AgentType } from '../types.ts';
import { agentConfig, agentThemeColors } from '../constants/agents.ts';
import {
  ChevronDownIcon,
  ArrowDownOnSquareIcon,
  LsvzIcon,
} from './icons.tsx';

export interface DockableToolItem {
  id: string;
  title: string;
  icon?: React.ReactNode;
  /** Rendered content when docked inside the station. */
  content: React.ReactNode;
  /** True when the tool is currently docked in the station; false when popped out on the canvas. */
  isDocked: boolean;
  /** Callback to dock the tool into the station (or toggle dock). */
  onDock: () => void;
  /** Callback to pop out the tool onto the canvas. */
  onUndock?: () => void;
}

interface AgentToolDockProps {
  activeAgent: AgentType | null;
  items: DockableToolItem[];
  headerControls?: React.ReactNode;
  toolsRowAccessories?: React.ReactNode;
  onClose: () => void;
}

export const AgentToolDock: React.FC<AgentToolDockProps> = ({
  activeAgent,
  items,
  headerControls,
  toolsRowAccessories,
  onClose,
}) => {
  const effectiveAgent = activeAgent || AgentType.LSVZ_AGENT;
  const agentMeta = agentConfig[effectiveAgent];
  const agentLabel =
    effectiveAgent === AgentType.LSVZ_AGENT
      ? 'LSAI Agent'
      : agentMeta?.label || effectiveAgent;
  const AgentIcon = agentMeta?.icon || LsvzIcon;
  const accentColor = agentThemeColors[effectiveAgent] || '#38bdf8';

  const dockedItems = items.filter(i => i.isDocked);
  const floatingItems = items.filter(i => !i.isDocked);

  const [selectedTabId, setSelectedTabId] = useState<string | null>(
    dockedItems[0]?.id ?? null
  );

  useEffect(() => {
    if (dockedItems.length === 0) {
      setSelectedTabId(null);
      return;
    }
    if (!selectedTabId || !dockedItems.some(i => i.id === selectedTabId)) {
      setSelectedTabId(dockedItems[0].id);
    }
  }, [dockedItems, selectedTabId]);

  const activeDockedItem =
    dockedItems.find(i => i.id === selectedTabId) ?? dockedItems[0] ?? null;

  return (
    <div className="flex flex-col h-full bg-[#0a0f16] text-gray-200 light-theme:bg-gray-100 light-theme:text-gray-800">
      {/* Tool Docking Station Header */}
      <header className="flex-shrink-0 border-b border-white/[0.06] bg-[#080d14] light-theme:border-gray-300/40 light-theme:bg-white">
        <div className="flex h-12 items-center justify-between gap-2 px-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-white/[0.1] bg-white/[0.03]"
              style={{ borderColor: `${accentColor}55` }}
            >
              <AgentIcon className="h-4 w-4" style={{ color: accentColor }} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-200 light-theme:text-gray-800">
                  {agentLabel}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">
                <span>Tool Shelf</span>
              </div>
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-100"
              title="Close the tool shelf"
              aria-label="Close the tool shelf"
            >
              <ChevronDownIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {(headerControls || toolsRowAccessories) && (
          <div className="scrollbar-hide flex flex-wrap items-center gap-1.5 overflow-x-auto border-t border-white/[0.04] px-3 py-1.5">
            {toolsRowAccessories}
            {headerControls}
          </div>
        )}

        {/* Tool Tabs when multiple tools are registered for the active workspace */}
        {items.length > 1 && (
          <div className="flex items-center gap-1 overflow-x-auto border-t border-white/[0.05] bg-[#060a10] px-2.5 py-1.5">
            {items.map(item => {
              const isSelected = activeDockedItem?.id === item.id && item.isDocked;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (!item.isDocked) {
                      item.onDock();
                    }
                    setSelectedTabId(item.id);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-all ${
                    isSelected
                      ? 'bg-white/[0.08] text-white'
                      : item.isDocked
                      ? 'border-white/[0.08] bg-white/[0.02] text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                      : 'border-cyan-500/40 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900/50'
                  }`}
                  style={
                    isSelected
                      ? { borderColor: accentColor, color: accentColor }
                      : undefined
                  }
                  title={
                    item.isDocked
                      ? `Switch to ${item.title}`
                      : `${item.title} is floating on canvas — click to dock here`
                  }
                >
                  {item.icon}
                  <span className="truncate max-w-[130px]">{item.title}</span>
                  {!item.isDocked && (
                    <span className="ml-0.5 rounded bg-cyan-500/20 px-1 py-0.2 font-mono text-[9px] text-cyan-200">
                      Float
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* Docked Tool Workspace Area */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        {activeDockedItem ? (
          <div className="flex-1 min-h-0 flex flex-col">
            {activeDockedItem.content}
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
            <div
              className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03]"
              style={{ boxShadow: `inset 0 0 0 1px ${accentColor}22` }}
            >
              <AgentIcon className="h-5 w-5" style={{ color: accentColor }} />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
              Agent Tool Dock
            </p>
            <h3 className="mt-1 text-sm font-semibold text-slate-200">
              {floatingItems.length > 0
                ? 'Tools Undocked (Floating on Canvas)'
                : `No Docked Tools Open for ${agentLabel}`}
            </h3>
            <p className="mt-1 max-w-[260px] text-xs leading-relaxed text-slate-500">
              {floatingItems.length > 0
                ? 'Your agent dialogs are currently floating over the canvas. Click below or use the Dock icon on any floating dialog header to dock it back into this station.'
                : 'Press Shift+Space to chat with this agent in the unified Command Bar below, or launch a tool dialog to dock it here.'}
            </p>
            {floatingItems.length > 0 && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {floatingItems.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      item.onDock();
                      setSelectedTabId(item.id);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-950/50 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-900/60 transition-colors"
                  >
                    <ArrowDownOnSquareIcon className="w-4 h-4 text-cyan-400" />
                    <span>Dock {item.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AgentToolDock;
