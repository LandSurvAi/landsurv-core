import React, { useEffect, useRef, useState } from 'react';
import type { DockableToolItem } from './AgentToolDock';

interface ChatToolDialogsProps {
  /** Docked tool panels currently relevant to the active agent. */
  items: DockableToolItem[];
}

/**
 * Mirrors the agent's dockable tool panels in the conversation feed.
 *
 * A result-driven dialog (for example Shrinkwrap) is often opened while the
 * tool shelf is closed, which previously left only the shelf able to host it.
 * Keeping a copy here makes those dialogs visible where the agent response is,
 * with tabs when more than one panel is available.
 */
export const ChatToolDialogs: React.FC<ChatToolDialogsProps> = ({ items }) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const previousIdsRef = useRef<string[]>([]);

  useEffect(() => {
    const ids = items.map(item => item.id);
    const previousIds = previousIdsRef.current;
    previousIdsRef.current = ids;

    if (ids.length === 0) {
      if (activeId !== null) setActiveId(null);
      return;
    }

    if (!activeId || !ids.includes(activeId)) {
      setActiveId(ids[0]);
      return;
    }

    // A newly relevant dialog (for example Shrinkwrap after an agent result)
    // should surface immediately instead of leaving a baseline tool selected.
    const addedId = ids.find(id => !previousIds.includes(id));
    if (addedId) setActiveId(addedId);
  }, [activeId, items]);

  if (items.length === 0) return null;
  const active = items.find(item => item.id === activeId) ?? items[0];

  return (
    <div
      data-testid="chat-tool-dialogs"
      className="overflow-hidden rounded-xl border border-white/[0.09] bg-[#0a0f16]"
    >
      {items.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 border-b border-white/[0.07] bg-white/[0.02] px-1.5 py-1.5">
          {items.map(item => {
            const selected = item.id === active.id;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`chat-tool-dialog-tab-${item.id}`}
                aria-pressed={selected}
                onClick={() => setActiveId(item.id)}
                className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold tracking-wide transition-colors ${
                  selected
                    ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                    : 'border-transparent text-slate-400 hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-slate-200'
                }`}
              >
                {item.icon}
                <span className="truncate">{item.title}</span>
              </button>
            );
          })}
        </div>
      )}
      <div data-testid={`chat-tool-dialog-${active.id}`} className="min-h-0">
        {active.content}
      </div>
    </div>
  );
};

export default ChatToolDialogs;
