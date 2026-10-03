import React, { useEffect, useRef, useState } from 'react';
import { Globe, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp, GripVertical, Scale } from 'lucide-react';
import { subscribeClawEvents, type ClawCallEvent } from '../utils/clawClient';
import { openSourcePolicyExplainer } from './PermissiveSourcesExplainer';

interface ClawStatusBadgeProps {
  /** Render only when the relevant agent is active. */
  visible?: boolean;
  /** How many recent calls to retain in the history dropdown. */
  historyLimit?: number;
}

const POS_STORAGE_KEY = 'clawBadge.pos';
// Default dock: bottom-left of the canvas area. The visualPanel sidebar is
// ~380px wide, so 400px leaves a small gap. The user can drag from here.
const DEFAULT_POS = { left: 400, bottom: 16 };

interface BadgePos { left: number; bottom: number; }

/**
 * Floating status badge showing live LandSurv Claw browser-tool activity.
 *
 * Subscribes to the clawClient event bus and renders:
 *   - a pulsing "Browsing…" pill while any call is in flight
 *   - the current tool name + (URL | selector) preview
 *   - a collapsible history of the last N calls (ok / error / duration)
 *
 * Draggable by its grip handle; position persists in localStorage.
 */
const ClawStatusBadge: React.FC<ClawStatusBadgeProps> = ({ visible = true, historyLimit = 8 }) => {
  const [events, setEvents] = useState<ClawCallEvent[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [pos, setPos] = useState<BadgePos>(() => {
    try {
      const raw = localStorage.getItem(POS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.left === 'number' && typeof parsed?.bottom === 'number') return parsed;
      }
    } catch { /* ignore */ }
    return DEFAULT_POS;
  });
  // Mirror pos in a ref so the mouseup handler can persist the latest value
  // without re-binding on every pixel of drag.
  const posRef = useRef(pos);
  posRef.current = pos;

  useEffect(() => {
    const unsub = subscribeClawEvents((evt) => {
      setEvents((prev) => {
        const next = [...prev];
        const idx = next.findIndex((e) => e.id === evt.id);
        if (idx >= 0) next[idx] = evt;
        else next.push(evt);
        return next.slice(-historyLimit);
      });
    });
    return () => { unsub(); };
  }, [historyLimit]);

  const onDragMouseDown = (e: React.MouseEvent) => {
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = posRef.current.left;
    const startBottom = posRef.current.bottom;
    let didMove = false;

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!didMove && Math.hypot(dx, dy) < 3) return;
      didMove = true;
      setPos({
        left: Math.max(0, Math.min(window.innerWidth - 80, startLeft + dx)),
        bottom: Math.max(0, Math.min(window.innerHeight - 30, startBottom - dy)),
      });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (didMove) {
        try { localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(posRef.current)); } catch { /* ignore */ }
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    e.preventDefault();
    e.stopPropagation();
  };

  if (!visible) return null;
  if (events.length === 0) return null;

  const running = events.filter((e) => e.status === 'running');
  const latest = events[events.length - 1];
  const isActive = running.length > 0;

  const argHint = (evt: ClawCallEvent): string => {
    const a = evt.args || {};
    if (typeof a.url === 'string') return a.url as string;
    if (typeof a.selector === 'string') return a.selector as string;
    if (typeof a.text === 'string') return `"${(a.text as string).slice(0, 32)}"`;
    return '';
  };

  return (
    <div
      className="fixed z-50 max-w-md pointer-events-auto"
      style={{ left: pos.left, bottom: pos.bottom }}
    >
      <div className="rounded-xl shadow-2xl border border-emerald-600/50 bg-gray-900/95 backdrop-blur text-gray-100 overflow-hidden">
        {/* Header — drag handle + collapse/expand toggle */}
        <div
          className={`w-full flex items-center gap-1 transition-colors ${
            isActive ? 'bg-emerald-900/40' : 'bg-gray-800/60'
          }`}
        >
          <div
            onMouseDown={onDragMouseDown}
            className="px-1.5 py-2 cursor-move text-gray-400 hover:text-gray-200 flex-shrink-0"
            title="Drag to move"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={`flex-1 flex items-center gap-2 pr-3 py-2 text-left transition-colors ${
              isActive ? 'hover:bg-emerald-900/60' : 'hover:bg-gray-700/60'
            }`}
          >
            {isActive ? (
              <Loader2 className="w-4 h-4 text-emerald-400 animate-spin flex-shrink-0" />
            ) : latest.status === 'error' ? (
              <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            )}
            <Globe className="w-4 h-4 text-cyan-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
                LandSurv Claw {isActive ? '— browsing' : '— idle'}
              </div>
              <div className="text-xs text-gray-400 truncate">
                <span className="text-gray-200 font-medium">{latest.tool}</span>
                {argHint(latest) && <span className="ml-1 text-gray-500">· {argHint(latest)}</span>}
              </div>
            </div>
            {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
          </button>
        </div>

        {/* History list */}
        {expanded && (
          <div className="max-h-72 overflow-y-auto border-t border-gray-700 divide-y divide-gray-800">
            {[...events].reverse().map((evt) => {
              const dur = evt.endedAt ? evt.endedAt - evt.startedAt : Date.now() - evt.startedAt;
              return (
                <div key={evt.id} className="px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    {evt.status === 'running' && <Loader2 className="w-3 h-3 text-emerald-400 animate-spin" />}
                    {evt.status === 'ok' && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                    {evt.status === 'error' && <XCircle className="w-3 h-3 text-red-400" />}
                    <span className="font-semibold text-gray-200">{evt.tool}</span>
                    <span className="ml-auto text-gray-500">{dur}ms</span>
                  </div>
                  {argHint(evt) && (
                    <div className="text-gray-400 truncate mt-0.5 ml-5">{argHint(evt)}</div>
                  )}
                  {evt.status === 'error' && evt.error && (
                    <div className="text-red-400 mt-0.5 ml-5 line-clamp-2">{evt.error}</div>
                  )}
                  {evt.status === 'ok' && evt.preview && (
                    <div className="text-gray-500 mt-0.5 ml-5 line-clamp-2 italic">{evt.preview}</div>
                  )}
                </div>
              );
            })}
            {/* Source-policy footer link — always visible when expanded. */}
            <div className="px-3 py-2 bg-slate-950/60 border-t border-slate-800">
              <button
                type="button"
                onClick={openSourcePolicyExplainer}
                className="w-full inline-flex items-center justify-center gap-1.5 text-[11px] text-slate-400 hover:text-emerald-300 transition"
                title="How LandSurv sources external data"
              >
                <Scale className="w-3 h-3" />
                <span>How we source data — permissive-only policy</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClawStatusBadge;
