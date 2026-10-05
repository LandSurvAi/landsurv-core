import React, { useEffect, useState, useCallback, useRef } from 'react';
import { interAgentComm, type CacpActivityEvent } from '../services/InterAgentCommunication';
import { agentRegistry } from '../services/AgentRegistry';
import { AgentType } from '../types';

const DISPLAY_DURATION_MS = 2800;
const MAX_VISIBLE = 4;

interface ActivityEntry extends CacpActivityEvent {
  key: number;
  exiting: boolean;
}

/** Best-effort short display name for an agent. */
function agentShortName(agent: AgentType | 'broadcast'): string {
  if (agent === 'broadcast') return 'Broadcast';
  const manifest = agentRegistry.get(agent);
  if (manifest) {
    // Trim long names: "Centerline Stationing" → "Stationing"
    const parts = manifest.displayName.split(' ');
    return parts.length > 2 ? parts.slice(-1).join(' ') : manifest.displayName;
  }
  // Fallback: prettify the enum key
  return agent
    .split('_')
    .map(w => w[0] + w.slice(1).toLowerCase())
    .join(' ');
}

/** Trim a command id to a readable label — strip agent prefix, capitalize. */
function commandLabel(command: string): string {
  // e.g. "cad_get_layer_for_code" → "Get Layer For Code"
  //      "deed_loaded" → "Deed Loaded"
  return command
    .replace(/^[a-z]+_/, match => {
      // strip known agent prefixes like "cad_", "lsvz_"
      const known = ['cad_', 'lsvz_', 'dxf_', 'deed_', 'civil_', 'point_'];
      return known.some(p => match === p) ? '' : match;
    })
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

let keyCounter = 0;

interface CacpActivityIndicatorProps {
  /** When false, render nothing. Default true (back-compat). */
  enabled?: boolean;
  /** When true, include internal handler-phase events in pills. */
  includeHandlerPhase?: boolean;
}

export const CacpActivityIndicator: React.FC<CacpActivityIndicatorProps> = ({
  enabled = true,
  includeHandlerPhase = false,
}) => {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const scheduleExit = useCallback((key: number) => {
    const t = setTimeout(() => {
      setEntries(prev => prev.map(e => e.key === key ? { ...e, exiting: true } : e));
      // Remove fully after CSS transition
      const t2 = setTimeout(() => {
        setEntries(prev => prev.filter(e => e.key !== key));
        timers.current.delete(key);
      }, 400);
      timers.current.set(key, t2);
    }, DISPLAY_DURATION_MS);
    timers.current.set(key, t);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const unsub = interAgentComm.onActivity((event: CacpActivityEvent) => {
      // Suppress internal 'handler' dispatch phase — keep send/response/error/no-handler.
      if (!includeHandlerPhase && event.phase === 'handler') return;
      const key = ++keyCounter;
      const entry: ActivityEntry = { ...event, key, exiting: false };
      setEntries(prev => {
        // Keep at most MAX_VISIBLE; drop oldest if needed
        const trimmed = prev.length >= MAX_VISIBLE ? prev.slice(-(MAX_VISIBLE - 1)) : prev;
        return [...trimmed, entry];
      });
      scheduleExit(key);
    });

    const activeTimers = timers.current;
    return () => {
      unsub();
      activeTimers.forEach(t => clearTimeout(t));
      activeTimers.clear();
    };
  }, [scheduleExit, enabled, includeHandlerPhase]);

  if (!enabled || entries.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 left-4 z-[9980] flex flex-col gap-1 pointer-events-none"
      aria-live="polite"
      aria-label="CACP inter-agent activity"
      style={{ maxWidth: 'calc(100vw - 2rem)' }}
    >
      {entries.map(entry => (
        <div
          key={entry.key}
          className={`
            inline-flex items-center gap-1.5 pl-2 pr-3 py-1 rounded-md
            bg-gray-950/95 backdrop-blur-sm
            border border-gray-700/60
            shadow-md shadow-black/40
            text-[10px] font-medium
            transition-all duration-400 ease-in-out
            overflow-hidden
            ${entry.exiting ? 'opacity-0 translate-x-[-8px]' : 'opacity-100 translate-x-0'}
          `}
          style={{ maxWidth: 260 }}
        >
          {/* Pulsing dot */}
          <span className="relative flex-shrink-0 w-1.5 h-1.5">
            <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-40" />
            <span className="relative block w-1.5 h-1.5 rounded-full bg-emerald-500" />
          </span>

          {/* CACP label */}
          <span className="text-gray-500 font-semibold tracking-widest uppercase text-[8px] flex-shrink-0">
            CACP
          </span>

          {/* From → To */}
          <span className="text-gray-400 truncate flex-shrink-0 max-w-[56px]">{agentShortName(entry.from)}</span>
          <span className="text-gray-600 flex-shrink-0">→</span>
          <span className="text-gray-400 truncate flex-shrink-0 max-w-[56px]">{agentShortName(entry.to)}</span>

          {/* Command */}
          <span className="text-gray-500 font-mono truncate ml-0.5">
            {commandLabel(entry.command)}
          </span>
        </div>
      ))}
    </div>
  );
};

export default CacpActivityIndicator;
