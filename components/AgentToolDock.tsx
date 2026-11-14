import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, LayoutGrid, Maximize2, Search, X } from 'lucide-react';
import { AgentType } from '../types.ts';
import type { DockMode } from './DockModeControl.tsx';
import { agentConfig } from '../constants/agents.ts';
import {
  ChevronDownIcon,
  ArrowDownOnSquareIcon,
  LsvzIcon,
} from './icons.tsx';
import { useToolbarDropdown } from './toolbarDropdown.ts';

export interface ShelfDefaultTool {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
}

/** A panel that can be opened as a tab inside the unified tool shelf. */
export interface ShelfPanelCatalogItem {
  id: string;
  title: string;
  icon?: React.ReactNode;
  /** Group heading used inside the searchable All panels menu. */
  group?: string;
  /** Extra search terms for the All panels menu. */
  keywords?: string;
  /** Rendered only while this panel is the active tab. */
  render: () => React.ReactNode;
}

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
  /** Optional close affordance for the tab (only shown when supplied). */
  onClose?: () => void;
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
  /** Workspace panels listed by the shelf header and its no-tools default state (legacy). */
  defaultTools?: ShelfDefaultTool[];
  /** Existing dockable CAD command reference shown in the no-tools default state (legacy). */
  defaultCadCommands?: React.ReactNode;
  /** Panels that can be opened as tabs (the unified shelf catalog). */
  panelCatalog?: ShelfPanelCatalogItem[];
  /** Tabs that are open, in open order. Pass with onOpenPanelIdsChange to control. */
  openPanelIds?: string[];
  /** Called with the next open-tab list whenever a panel tab is opened or closed. */
  onOpenPanelIdsChange?: (ids: string[]) => void;
  /** Initial open tabs when the component manages its own tab list. */
  defaultOpenPanelIds?: string[];
  /** Reports which docked tool is actually visible (drives workflow "away" detection). */
  onActiveTabChange?: (tabId: string | null) => void;
  onClose: () => void;
}

interface ShelfTab {
  id: string;
  title: string;
  icon?: React.ReactNode;
  renderBody: () => React.ReactNode;
  isFloating?: boolean;
  floatingMode?: DockMode;
  onSelect?: () => void;
  onClose?: () => void;
}

const TAB_SCROLL_STEP = 140;

export const AgentToolDock: React.FC<AgentToolDockProps> = ({
  activeAgent,
  items,
  headerControls,
  toolsRowAccessories,
  requestedTabId,
  requestedTabToken,
  hideToolTabs = false,
  defaultTools = [],
  defaultCadCommands,
  panelCatalog = [],
  openPanelIds,
  onOpenPanelIdsChange,
  defaultOpenPanelIds = [],
  onActiveTabChange,
  onClose,
}) => {
  const effectiveAgent = activeAgent || AgentType.LSVZ_AGENT;
  const agentMeta = agentConfig[effectiveAgent];
  const AgentIcon = agentMeta?.icon || LsvzIcon;
  // Keep the shelf visually consistent across agents instead of inheriting
  // agent-specific accent colors.
  const accentColor = '#22d3ee';

  const isInShelf = useCallback(
    (item: DockableToolItem) => (item.dockMode ? item.dockMode === 'toolshelf' : item.isDocked),
    []
  );

  const dockedItems = items.filter(isInShelf);
  const floatingItems = items.filter(item => !isInShelf(item));

  const isControlled = openPanelIds !== undefined;
  const [internalOpenPanelIds, setInternalOpenPanelIds] = useState<string[]>(defaultOpenPanelIds);
  const effectiveOpenPanelIds = isControlled ? openPanelIds : internalOpenPanelIds;
  const setOpenPanelIds = useCallback(
    (next: string[]) => {
      if (!isControlled) setInternalOpenPanelIds(next);
      onOpenPanelIdsChange?.(next);
    },
    [isControlled, onOpenPanelIdsChange]
  );

  const [selectedTabId, setSelectedTabId] = useState<string | null>(
    dockedItems[0]?.id ?? effectiveOpenPanelIds[0] ?? null
  );
  const legacyPanelsMenu = useToolbarDropdown();
  const allPanelsMenu = useToolbarDropdown();
  const [panelQuery, setPanelQuery] = useState('');
  const tabStripRef = useRef<HTMLDivElement>(null);
  const [tabScroll, setTabScroll] = useState({ left: false, right: false });

  const openPanels = effectiveOpenPanelIds
    .map(id => panelCatalog.find(panel => panel.id === id))
    .filter((panel): panel is ShelfPanelCatalogItem => Boolean(panel));

  const tabs: ShelfTab[] = [
    ...dockedItems.map<ShelfTab>(item => ({
      id: item.id,
      title: item.title,
      icon: item.icon,
      renderBody: () => item.content,
      onClose: item.onClose,
    })),
    ...openPanels.map<ShelfTab>(panel => ({
      id: panel.id,
      title: panel.title,
      icon: panel.icon,
      renderBody: panel.render,
      onClose: () => closePanel(panel.id),
    })),
    ...floatingItems.map<ShelfTab>(item => ({
      id: item.id,
      title: item.title,
      icon: item.icon,
      renderBody: () => item.content,
      isFloating: true,
      floatingMode: item.dockMode,
      onSelect: item.onDock,
      onClose: item.onClose,
    })),
  ];
  const tabIdsKey = tabs.map(tab => tab.id).join('|');

  const activeTab = tabs.find(tab => tab.id === selectedTabId) ?? tabs[0] ?? null;
  const activeTabId = activeTab?.id ?? null;
  const activeDockedItem = dockedItems.find(item => item.id === activeTabId) ?? null;

  function closePanel(panelId: string) {
    const next = effectiveOpenPanelIds.filter(id => id !== panelId);
    setOpenPanelIds(next);
    setSelectedTabId(current => {
      if (current !== panelId) return current;
      const remaining = tabs.filter(tab => tab.id !== panelId);
      return remaining[0]?.id ?? null;
    });
  }

  const openPanel = useCallback(
    (panelId: string) => {
      if (!effectiveOpenPanelIds.includes(panelId)) {
        setOpenPanelIds([...effectiveOpenPanelIds, panelId]);
      }
      setSelectedTabId(panelId);
    },
    [effectiveOpenPanelIds, setOpenPanelIds]
  );

  // Drop a stale selection when the open tab list changes, and fall back to the
  // first tab instead of leaving the shelf body empty.
  useEffect(() => {
    if (tabs.length === 0) {
      setSelectedTabId(null);
      return;
    }
    if (!selectedTabId || !tabs.some(tab => tab.id === selectedTabId)) {
      setSelectedTabId(tabs[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabIdsKey, selectedTabId]);

  // When an agent's own tool lands in the shelf, bring that tab forward.
  // Other docked tools stay in place as sibling tabs.
  const agentToolTabId = dockedItems.find(item => item.ownerAgent === activeAgent)?.id ?? null;
  useEffect(() => {
    if (agentToolTabId) setSelectedTabId(agentToolTabId);
  }, [activeAgent, agentToolTabId]);

  // A toolbar button (for example GIS) can request a specific docked panel.
  // Apply it after the default agent-tool selection so the requested tab wins.
  const requestedTabAvailable = Boolean(
    requestedTabId && tabs.some(tab => tab.id === requestedTabId)
  );
  useEffect(() => {
    if (requestedTabAvailable && requestedTabId) {
      setSelectedTabId(requestedTabId);
    }
  }, [requestedTabId, requestedTabToken, requestedTabAvailable]);

  useEffect(() => {
    onActiveTabChange?.(activeTabId);
  }, [activeTabId, onActiveTabChange]);

  const updateTabScroll = useCallback(() => {
    const strip = tabStripRef.current;
    if (!strip) return;
    setTabScroll({
      left: strip.scrollLeft > 2,
      right: strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 2,
    });
  }, []);

  useEffect(() => {
    updateTabScroll();
    const strip = tabStripRef.current;
    if (!strip) return;
    strip.addEventListener('scroll', updateTabScroll, { passive: true });
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateTabScroll)
      : null;
    observer?.observe(strip);
    window.addEventListener('resize', updateTabScroll);
    return () => {
      strip.removeEventListener('scroll', updateTabScroll);
      observer?.disconnect();
      window.removeEventListener('resize', updateTabScroll);
    };
  }, [tabIdsKey, updateTabScroll]);

  // Keep the active tab visible as tabs accumulate.
  useEffect(() => {
    const strip = tabStripRef.current;
    if (!strip || !selectedTabId) return;
    const tab = Array.from(strip.querySelectorAll<HTMLElement>('[data-shelf-tab-id]'))
      .find(node => node.dataset.shelfTabId === selectedTabId);
    tab?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [selectedTabId, tabIdsKey]);

  const scrollTabs = (direction: -1 | 1) => {
    const strip = tabStripRef.current;
    if (!strip) return;
    strip.scrollBy({
      left: direction * Math.max(TAB_SCROLL_STEP, strip.clientWidth * 0.6),
      behavior: 'smooth',
    });
  };

  const selectTab = (tab: ShelfTab) => {
    if (tab.isFloating) tab.onSelect?.();
    setSelectedTabId(tab.id);
  };

  const focusTab = (tabId: string) => {
    window.requestAnimationFrame(() => {
      const node = tabStripRef.current?.querySelector<HTMLButtonElement>(
        `[data-shelf-tab-id="${tabId}"] button[role="tab"]`
      );
      node?.focus();
    });
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (tabs.length === 0) return;
    const currentIndex = Math.max(0, tabs.findIndex(tab => tab.id === activeTabId));
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    selectTab(nextTab);
    focusTab(nextTab.id);
  };

  const renderPanelMenu = () => {
    const query = panelQuery.trim().toLowerCase();
    const matches = panelCatalog.filter(panel => {
      if (!query) return true;
      return `${panel.title} ${panel.group ?? ''} ${panel.keywords ?? ''}`
        .toLowerCase()
        .includes(query);
    });
    const groupOrder: string[] = [];
    const groups = new Map<string, ShelfPanelCatalogItem[]>();
    for (const panel of matches) {
      const group = panel.group?.trim() || 'Panels';
      if (!groups.has(group)) {
        groups.set(group, []);
        groupOrder.push(group);
      }
      groups.get(group)!.push(panel);
    }

    return (
      <div className="relative shrink-0" ref={allPanelsMenu.containerRef}>
        <button
          ref={allPanelsMenu.triggerRef}
          type="button"
          onClick={() => {
            setPanelQuery('');
            if (allPanelsMenu.isOpen) {
              allPanelsMenu.close();
            } else {
              allPanelsMenu.open();
            }
          }}
          className={`flex h-7 items-center gap-1 rounded-md px-2 text-[10px] font-semibold transition-colors ${
            allPanelsMenu.isOpen
              ? 'bg-cyan-500/15 text-cyan-200'
              : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100'
          }`}
          title="Panels — search and open a workspace panel"
          aria-haspopup="dialog"
          aria-expanded={allPanelsMenu.isOpen}
          data-testid="tool-shelf-all-panels"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Panels</span>
          <ChevronDownIcon className={`h-3 w-3 transition-transform ${allPanelsMenu.isOpen ? 'rotate-180' : ''}`} />
        </button>
        {allPanelsMenu.isOpen && (
          <div
            role="dialog"
            aria-label="All panels"
            data-testid="tool-shelf-all-panels-menu"
            className="absolute right-0 top-full z-50 mt-1 w-[280px] overflow-hidden rounded-xl border border-white/10 bg-[#0b1119]/95 text-slate-300 shadow-2xl backdrop-blur-md light-theme:border-gray-300 light-theme:bg-white light-theme:text-gray-700"
          >
            <div className="flex items-center gap-2 border-b border-white/[0.07] px-2.5 py-2 light-theme:border-gray-200">
              <Search className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <input
                autoFocus
                value={panelQuery}
                onChange={event => setPanelQuery(event.target.value)}
                placeholder="Search panels…"
                aria-label="Search panels"
                data-testid="tool-shelf-all-panels-search"
                className="min-w-0 flex-1 bg-transparent text-[11.5px] font-medium text-slate-200 outline-none placeholder:text-slate-600 light-theme:text-gray-800"
              />
              <button
                type="button"
                onClick={allPanelsMenu.close}
                aria-label="Close panel list"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-white/10 hover:text-slate-200 light-theme:hover:bg-gray-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="max-h-[330px] overflow-y-auto p-1.5">
              {matches.length === 0 ? (
                <p className="px-2 py-6 text-center text-[11px] text-slate-500">
                  No panels match “{panelQuery.trim()}”.
                </p>
              ) : (
                groupOrder.map(group => (
                  <div key={group} className="mb-1 last:mb-0">
                    <p className="px-2 pb-1 pt-1 text-[8.5px] font-bold uppercase tracking-[0.18em] text-slate-600 light-theme:text-gray-400">
                      {group}
                    </p>
                    {groups.get(group)!.map(panel => {
                      const isOpen = effectiveOpenPanelIds.includes(panel.id);
                      const isActive = activeTabId === panel.id;
                      return (
                        <button
                          key={panel.id}
                          type="button"
                          role="menuitem"
                          data-testid={`tool-shelf-panel-item-${panel.id}`}
                          onClick={() => {
                            openPanel(panel.id);
                            allPanelsMenu.close();
                          }}
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] font-medium transition-colors ${
                            isActive
                              ? 'bg-cyan-400/10 text-cyan-100 light-theme:bg-cyan-50 light-theme:text-cyan-800'
                              : 'text-slate-300 hover:bg-white/[0.06] hover:text-white light-theme:text-gray-700 light-theme:hover:bg-gray-100'
                          }`}
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-cyan-300/80">
                            {panel.icon}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{panel.title}</span>
                          {isOpen && <Check className="h-3 w-3 shrink-0 text-cyan-300/80" aria-label="Open" />}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
            <p className="border-t border-white/[0.06] px-2.5 py-1.5 text-[9px] font-medium text-slate-600 light-theme:border-gray-200 light-theme:text-gray-400">
              {panelCatalog.length} panels · open as tabs in this shelf
            </p>
          </div>
        )}
      </div>
    );
  };

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
          {defaultTools.length > 0 && panelCatalog.length === 0 && (
            <div className="relative" ref={legacyPanelsMenu.containerRef}>
              <button
                ref={legacyPanelsMenu.triggerRef}
                type="button"
                onClick={() => (legacyPanelsMenu.isOpen ? legacyPanelsMenu.close() : legacyPanelsMenu.open())}
                className={`flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[10px] font-semibold transition-colors ${
                  legacyPanelsMenu.isOpen
                    ? 'bg-cyan-500/15 text-cyan-200'
                    : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100'
                }`}
                title="Panels — open a workspace panel"
                aria-haspopup="menu"
                aria-expanded={legacyPanelsMenu.isOpen}
                data-testid="tool-shelf-panels-menu"
              >
                Panels
                <ChevronDownIcon className={`h-3 w-3 transition-transform ${legacyPanelsMenu.isOpen ? 'rotate-180' : ''}`} />
              </button>
              {legacyPanelsMenu.isOpen && (
                <div
                  role="menu"
                  data-testid="tool-shelf-panels-dropdown"
                  className="absolute right-0 top-full z-50 mt-1 max-h-[60vh] w-60 overflow-y-auto rounded-lg border border-white/10 bg-[#0b1119]/95 p-1.5 text-slate-300 shadow-2xl backdrop-blur-md light-theme:border-gray-300 light-theme:bg-white light-theme:text-gray-700"
                >
                  <div className="px-2 pb-1 pt-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">
                    Panels
                  </div>
                  {defaultTools.map(tool => (
                    <button
                      key={tool.id}
                      type="button"
                      role="menuitem"
                      data-testid={`tool-shelf-panels-item-${tool.id}`}
                      onClick={() => {
                        legacyPanelsMenu.close();
                        tool.onSelect();
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] font-medium transition-colors hover:bg-white/[0.06] hover:text-white light-theme:hover:bg-gray-100"
                    >
                      {tool.icon}
                      <span className="truncate">{tool.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
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

        {/* Unified tab bar: every docked tool and open panel lives on the
            same shelf, with scroll controls and a searchable launcher so the
            strip stays usable with dozens of panels. */}
        {!hideToolTabs && (tabs.length > 0 || panelCatalog.length > 0) && (
          <div className="flex items-center gap-0.5 border-t border-white/[0.05] bg-black/25 px-1 py-1">
            <button
              type="button"
              onClick={() => scrollTabs(-1)}
              disabled={!tabScroll.left}
              aria-label="Scroll tabs left"
              title="Scroll tabs left"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-200 disabled:pointer-events-none disabled:opacity-25"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <div
              ref={tabStripRef}
              role="tablist"
              aria-label="Tool shelf panels"
              onKeyDown={handleTabKeyDown}
              className="scrollbar-hide flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-0.5"
            >
              {tabs.map(tab => {
                const isSelected = activeTabId === tab.id;
                return (
                  <div
                    key={tab.id}
                    data-shelf-tab-id={tab.id}
                    className={`group/tab flex h-7 shrink-0 items-center overflow-hidden rounded-md border transition-colors ${
                      isSelected
                        ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100 shadow-sm'
                        : tab.isFloating
                        ? 'border-dashed border-cyan-500/30 bg-cyan-950/25 text-cyan-300/80 hover:bg-cyan-900/30'
                        : 'border-transparent text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                    }`}
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      tabIndex={isSelected ? 0 : -1}
                      onClick={() => selectTab(tab)}
                      title={
                        tab.isFloating
                          ? `${tab.title} is ${tab.floatingMode === 'chat' ? 'docked in chat' : 'floating on canvas'} — click to move it to the shelf`
                          : `Switch to ${tab.title}`
                      }
                      className="flex h-full min-w-0 items-center gap-1.5 px-2 text-[10.5px] font-semibold outline-none focus-visible:bg-white/[0.06]"
                    >
                      {tab.icon}
                      <span className="max-w-[150px] truncate">{tab.title}</span>
                      {tab.isFloating && (
                        <span className="rounded bg-cyan-500/20 px-1 py-0.5 font-mono text-[8px] uppercase tracking-wide text-cyan-200">
                          {tab.floatingMode === 'chat' ? 'Chat' : 'Float'}
                        </span>
                      )}
                    </button>
                    {tab.onClose && (
                      <button
                        type="button"
                        onClick={event => {
                          event.stopPropagation();
                          tab.onClose?.();
                        }}
                        aria-label={`Close ${tab.title}`}
                        title={`Close ${tab.title}`}
                        className="mr-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-500 opacity-0 transition-opacity hover:bg-white/10 hover:text-slate-100 focus-visible:opacity-100 group-hover/tab:opacity-100"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => scrollTabs(1)}
              disabled={!tabScroll.right}
              aria-label="Scroll tabs right"
              title="Scroll tabs right"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-200 disabled:pointer-events-none disabled:opacity-25"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            {panelCatalog.length > 0 && renderPanelMenu()}
          </div>
        )}
      </header>

      {/* Docked Tool Workspace Area */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col pl-px">
        {activeTab ? (
          <div
            role="tabpanel"
            aria-label={activeTab.title}
            className="flex-1 min-h-0 flex flex-col"
          >
            {activeTab.renderBody()}
          </div>
        ) : defaultCadCommands ? (
          <div data-testid="tool-shelf-default-hybrid" className="flex min-h-0 flex-1 flex-col">
            <div
              data-testid="tool-shelf-default-cad-commands"
              className="min-h-0 flex-[4] overflow-y-auto border-b border-white/[0.07] light-theme:border-gray-200"
            >
              {defaultCadCommands}
            </div>
            {(defaultTools.length > 0 || floatingItems.length > 0) && (
              <div
                data-testid="tool-shelf-default-other-tools"
                className="flex min-h-0 flex-[1] flex-col overflow-y-auto p-2"
              >
                {floatingItems.length > 0 && (
                  <div className="mb-1.5 flex flex-wrap gap-1">
                    {floatingItems.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          item.onDock();
                          setSelectedTabId(item.id);
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-cyan-500/30 bg-cyan-950/30 px-1.5 py-0.5 text-[9.5px] font-semibold text-cyan-200 transition-colors hover:bg-cyan-900/40"
                      >
                        <ArrowDownOnSquareIcon className="h-3 w-3 text-cyan-400" />
                        <span className="max-w-[150px] truncate">Move {item.title}</span>
                      </button>
                    ))}
                  </div>
                )}
                {defaultTools.length > 0 && (
                  <>
                    <div className="mb-1 flex items-center justify-between px-0.5">
                      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">
                        Other tools
                      </p>
                      <span className="font-mono text-[8.5px] tabular-nums text-slate-600">
                        {defaultTools.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {defaultTools.map(tool => (
                        <button
                          key={tool.id}
                          type="button"
                          data-testid={`tool-shelf-default-${tool.id}`}
                          onClick={tool.onSelect}
                          title={tool.label}
                          className="flex min-w-0 items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-left text-[10px] font-medium text-slate-300 transition-colors hover:border-cyan-400/30 hover:bg-cyan-400/[0.06] hover:text-cyan-100 light-theme:border-gray-200 light-theme:bg-white light-theme:text-gray-700 light-theme:hover:bg-gray-100"
                        >
                          {tool.icon}
                          <span className="truncate">{tool.label}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
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
                : defaultTools.length > 0
                ? 'Workspace Panels'
                : 'No Docked Tools Open'}
            </h3>
            <p className="mt-1 max-w-[260px] text-xs leading-relaxed text-slate-500">
              {floatingItems.length > 0
                ? 'Your agent dialogs are currently floating over the canvas. Click below or use the Dock icon on any floating dialog header to dock it back into this station.'
                : defaultTools.length > 0
                ? 'Open a workspace panel below, or launch a tool dialog to dock it in this shelf.'
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
            {defaultTools.length > 0 && (
              <div data-testid="tool-shelf-default-tools" className="mt-4 w-full max-w-[260px] text-left">
                <p className="mb-1.5 px-1 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Open a panel
                </p>
                <div className="grid gap-1">
                  {defaultTools.map(tool => (
                    <button
                      key={tool.id}
                      type="button"
                      data-testid={`tool-shelf-default-${tool.id}`}
                      onClick={tool.onSelect}
                      className="flex w-full items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-left text-[11px] font-medium text-slate-300 transition-colors hover:border-cyan-400/30 hover:bg-cyan-400/[0.06] hover:text-cyan-100 light-theme:border-gray-200 light-theme:bg-white light-theme:text-gray-700 light-theme:hover:bg-gray-100"
                    >
                      {tool.icon}
                      <span className="truncate">{tool.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AgentToolDock;
