import React, { useState, useEffect } from 'react';
import { Maximize2 } from 'lucide-react';
import { AgentType } from '../types.ts';
import type { DockMode } from './DockModeControl.tsx';
import { agentConfig } from '../constants/agents.ts';
import {
  ChevronDownIcon,
  ArrowDownOnSquareIcon,
  LsvzIcon,
} from './icons.tsx';

export interface DockableToolItem {
  id: string;
  title: string;
  /** Agent whose first visit should bring this tool's tab forward. */
  ownerAgent?: AgentType;
  icon?: React.ReactNode;
  /** Rendered content when docked inside the station. */
  content: React.ReactNode;
  /** True when the tool is currently docked in the station; false when popped out on the canvas. */
  isDocked: boolean;
  /** Tri-state placement for the same tool across chat, canvas, and shelf. */
  dockMode?: DockMode;
  /** Callback to dock the tool into the station (or toggle dock). */
  onDock: () => void;
  /** Callback to pop out the tool onto the canvas. */
  onUndock?: () => void;
  /** Optional header actions for the active tool (for example placement controls). */
  headerActions?: React.ReactNode;
  /** Optional header action that expands the active tool to fullscreen. */
  onFullscreen?: () => void;
}

interface AgentToolDockProps {
  activeAgent: AgentType | null;
  items: DockableToolItem[];
  headerControls?: React.ReactNode;
  toolsRowAccessories?: React.ReactNode;
  /** Select this docked tool after a toolbar action. */
  requestedTabId?: string | null;
  /** Bump this token to re-apply the requested tab even when the id is unchanged. */
  requestedTabToken?: number;
  /** Hide the tab strip when the toolbar already switches between the docked tools. */
  hideToolTabs?: boolean;
  /** Reports which docked tool is actually visible (drives workflow "away" detection). */
  onActiveTabChange?: (tabId: string | null) => void;
  onClose: () => void;
}

export const AgentToolDock: React.FC<AgentToolDockProps> = ({
  activeAgent,
  items,
  headerControls,
  toolsRowAccessories,
  requestedTabId,
  requestedTabToken,
  hideToolTabs = false,
  onActiveTabChange,
  onClose,
}) => {
  const effectiveAgent = activeAgent || AgentType.LSVZ_AGENT;
  const agentMeta = agentConfig[effectiveAgent];
  const AgentIcon = agentMeta?.icon || LsvzIcon;
  // Keep the shelf visually consistent across agents instead of inheriting
  // agent-specific accent colors.
  const accentColor = '#22d3ee';

  const isInShelf = (item: DockableToolItem) =>
    item.dockMode ? item.dockMode === 'toolshelf' : item.isDocked;
  const dockedItems = items.filter(isInShelf);
  const floatingItems = items.filter(item => !isInShelf(item));

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

  // When an agent's own tool lands in the shelf, bring that tab forward.
  // Other docked tools stay in place as sibling tabs.
  const agentToolTabId =
    dockedItems.find(item => item.ownerAgent === activeAgent)?.id ?? null;
  useEffect(() => {
    if (agentToolTabId) setSelectedTabId(agentToolTabId);
  }, [activeAgent, agentToolTabId]);

  // A toolbar button (for example GIS) can request a specific docked panel.
  // Apply it after the default agent-tool selection so the requested tab wins.
  const requestedTabAvailable = Boolean(
    requestedTabId && dockedItems.some(item => item.id === requestedTabId)
  );
  useEffect(() => {
    if (requestedTabAvailable && requestedTabId) {
      setSelectedTabId(requestedTabId);
    }
  }, [requestedTabId, requestedTabToken, requestedTabAvailable]);

  const activeDockedItem =
    dockedItems.find(i => i.id === selectedTabId) ?? dockedItems[0] ?? null;

  useEffect(() => {
    onActiveTabChange?.(activeDockedItem?.id ?? null);
  }, [activeDockedItem?.id, onActiveTabChange]);

  return (
    <div className="flex flex-col h-full bg-[#0a0f16] text-gray-200 light-theme:bg-gray-100 light-theme:text-gray-800">
      {/* Tools-first header: no title strip, so the shelf starts with controls. */}
      <header className="flex-shrink-0 border-b border-white/[0.06] bg-[#080d14] light-theme:border-gray-300/40 light-theme:bg-white">
        <div className="flex items-center gap-1.5 px-2 py-1.5">
          <div className="scrollbar-hide flex min-w-0 flex-1 flex-wrap items-center gap-1.5 overflow-x-auto">
            {toolsRowAccessories}
            {headerControls}
          </div>
          {activeDockedItem?.headerActions}
          {activeDockedItem?.onFullscreen && (
            <button
              type="button"
              onClick={activeDockedItem.onFullscreen}
              data-testid="agent-tool-fullscreen"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-cyan-500/10 hover:text-cyan-300"
              title={`Open ${activeDockedItem.title} fullscreen`}
              aria-label={`Open ${activeDockedItem.title} fullscreen`}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-100"
            title="Collapse the tool shelf"
            aria-label="Collapse the tool shelf"
          >
            <ChevronDownIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Tool Tabs when multiple tools are registered for the active workspace */}
        {!hideToolTabs && items.length > 1 && (
          <div className="scrollbar-hide flex items-center gap-1 overflow-x-auto border-t border-white/[0.05] bg-black/20 px-2 py-1.5">
            {items.map(item => {
              const inShelf = isInShelf(item);
              const isSelected = activeDockedItem?.id === item.id && inShelf;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (!inShelf) {
                      item.onDock();
                    }
                    setSelectedTabId(item.id);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10.5px] font-semibold transition-all ${
                    isSelected
                      ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100 shadow-sm'
                      : inShelf
                      ? 'border-transparent bg-transparent text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                      : 'border-cyan-500/40 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900/50'
                  }`}
                  title={
                    inShelf
                      ? `Switch to ${item.title}`
                      : `${item.title} is ${item.dockMode === 'chat' ? 'docked in chat' : 'floating on canvas'} — click to move it to the Toolshelf`
                  }
                >
                  {item.icon}
                  <span className="truncate max-w-[110px]">{item.title}</span>
                  {!inShelf && (
                    <span className="ml-0.5 rounded bg-cyan-500/20 px-1 py-0.2 font-mono text-[9px] text-cyan-200">
                      {item.dockMode === 'chat' ? 'Chat' : 'Floating'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* Docked Tool Workspace Area */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col pl-px">
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
                : 'No Docked Tools Open'}
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
                    <span>Move {item.title} to Toolshelf</span>
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
