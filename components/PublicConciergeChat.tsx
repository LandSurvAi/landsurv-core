import React, { useState, useRef, useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { askPublicConcierge, PublicChatMessage } from '../services/publicChatService';
import { BrainCircuitIcon, LightbulbIcon, SendIcon } from './icons';
import { useAppState } from '../contexts/AppStateContext.tsx';

/**
 * Public-facing concierge chat ("Ask LandSurv.ai").
 *
 * UX: The input bar is always visible and front-and-center so it's immediately
 * obvious this is an AI chat. Clicking the input (or the lightbulb) expands
 * a panel above showing the conversation, suggestions, and hints.
 * If the user hasn't started a conversation yet and clicks away, the panel
 * collapses back to just the input bar.
 */
const MAX_MESSAGES = 8;
const SUGGESTIONS = [
  'What is LandSurv.ai?',
  'What is LSVZ?',
  'What can the Boundary Agent do?',
  'Do I need my own API key?',
];
const ACCENT = '#22d3ee'; // cyan-400

// ───────────────────────────────────────────────────────────────
// Module-level store for the persistent floating Concierge dialog.
// Lives outside the React tree so the dialog (and its chat history)
// follow the user as they navigate between screens without unmounting.
// ───────────────────────────────────────────────────────────────
interface ConciergeState {
  open: boolean;
  minimized: boolean;
  pos: { x: number; y: number } | null;
  history: PublicChatMessage[];
  input: string;
  busy: boolean;
  error: string | null;
  showSuggestions: boolean;
}
let conciergeState: ConciergeState = {
  open: false,
  minimized: false,
  pos: null,
  history: [],
  input: '',
  busy: false,
  error: null,
  showSuggestions: false,
};
const conciergeListeners = new Set<() => void>();
const getConciergeSnapshot = () => conciergeState;
const subscribeConcierge = (cb: () => void) => { conciergeListeners.add(cb); return () => { conciergeListeners.delete(cb); }; };
const setConciergeState = (patch: Partial<ConciergeState> | ((s: ConciergeState) => Partial<ConciergeState>)) => {
  const next = typeof patch === 'function' ? patch(conciergeState) : patch;
  conciergeState = { ...conciergeState, ...next };
  conciergeListeners.forEach(cb => cb());
};
export const openConcierge = () => setConciergeState({ open: true, minimized: false });
export const closeConcierge = () => setConciergeState({ open: false });
export const toggleConciergeShade = () => setConciergeState(s => ({ minimized: !s.minimized }));
const useConciergeStore = () => useSyncExternalStore(subscribeConcierge, getConciergeSnapshot, getConciergeSnapshot);

export interface PublicConciergeChatProps {
  /** When true, renders only the pulsing yellow lightbulb. Clicking it
   *  opens a sharp floating dialog containing the full chat UI. Used on
   *  the home screen so the bulb can sit beside the LandSurv.ai logo. */
  compact?: boolean;
}

export const PublicConciergeChat: React.FC<PublicConciergeChatProps> = ({ compact = false }) => {
  const [expanded, setExpanded] = useState(false);
  /** Compact-mode floating dialog visibility. */
  const [dialogOpen, setDialogOpen] = useState(false);
  const [history, setHistory] = useState<PublicChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  // Single string used by the smooth horizontal marquee placeholder.
  const MARQUEE_TEXT = 'Ask our LandSurv.ai Concierge general questions';
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const userMessageCount = history.filter(m => m.role === 'user').length;
  const limitReached = userMessageCount >= MAX_MESSAGES;
  const hasConversation = history.length > 0;

  // Auto-scroll messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, busy, showSuggestions]);

  // Rotate placeholder phrases when idle
  // Placeholder is now a CSS-driven horizontal marquee (see overlay below),
  // so no JS interval is needed.

  // Close panel on outside click, but only if no conversation started yet
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        if (!hasConversation) setExpanded(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [expanded, hasConversation]);

  const { addNotification } = useAppState();

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy || limitReached) return;
    setShowSuggestions(false);
    setExpanded(true);
    const next: PublicChatMessage[] = [...history, { role: 'user', text: trimmed }];
    setHistory(next);
    setInput('');
    setBusy(true);
    try {
      const reply = await askPublicConcierge(next);
      setHistory(h => [...h, { role: 'model', text: reply || '(no response)' }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      addNotification({ kind: 'concierge-chat', severity: 'error', title: 'LandSurv.ai Concierge', message: msg });
    } finally {
      setBusy(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const handleFocus = () => {
    setExpanded(true);
    if (!hasConversation && !showSuggestions) setShowSuggestions(true);
  };

  // ── Compact mode: just the pulsing bulb. Clicking opens the persistent
  //    floating dialog (rendered by <ConciergeOverlay /> mounted at App root). ──
  if (compact) {
    const store = useConciergeStore();
    const bulbHasConversation = store.history.length > 0;
    return (
      <button
        type="button"
        onClick={openConcierge}
        className={`p-2 text-yellow-400 hover:bg-yellow-500/10 rounded-full transition-colors pointer-events-auto ${
          !bulbHasConversation ? 'animate-pulse-yellow-glow' : ''
        }`}
        title="Ask LandSurv.ai Concierge"
        aria-label="Open LandSurv.ai Concierge"
      >
        <LightbulbIcon className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div ref={containerRef} className="w-full max-w-5xl mx-auto mb-4 pointer-events-auto">

      {/* ── Expanded panel: messages + suggestions ── */}
      {expanded && (
        <div className="rounded-t-xl bg-gray-900/90 border border-gray-700 border-b-0 backdrop-blur-md overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700/60 bg-gray-800/50">
            <div className="flex items-center gap-2">
              <BrainCircuitIcon className="w-5 h-5" style={{ color: ACCENT }} />
              <span className="text-sm font-bold text-white">Ask LandSurv.ai</span>
              <span className="text-[10px] uppercase tracking-wider text-cyan-300/70 border border-cyan-400/20 rounded px-1.5 py-0.5">free</span>
            </div>
            {hasConversation && (
              <button
                onClick={() => setExpanded(false)}
                className="text-gray-500 hover:text-gray-300 text-xs px-2"
                aria-label="Minimize"
              >
                ▲ minimize
              </button>
            )}
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="max-h-72 overflow-y-auto px-4 py-3 space-y-3 text-sm">
            {history.length === 0 && !showSuggestions && (
              <p className="text-gray-500 text-xs italic text-center py-4">
                Ask anything about the app — agents, LSVZ format, pricing, file types…
              </p>
            )}
            {history.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-lg whitespace-pre-wrap text-sm ${
                  m.role === 'user'
                    ? 'bg-cyan-600/80 text-white rounded-br-sm'
                    : 'bg-gray-800 text-gray-100 rounded-bl-sm border border-white/5'
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-800 border border-white/5">
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0s' }} />
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                </div>
              </div>
            )}
            {/* Suggestions */}
            {showSuggestions && (
              <div className="pt-1">
                <div className="flex items-center gap-2 mb-2">
                  <LightbulbIcon className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                  <span className="text-xs font-semibold text-gray-400">Here are some ideas to get you started:</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SUGGESTIONS.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => { setShowSuggestions(false); send(q); }}
                      className="p-2.5 text-left text-gray-300 bg-gray-900/50 rounded-lg border border-gray-700 hover:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 text-xs transition-colors"
                    >
                      <p className="font-medium">{`"${q}"`}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {!hasConversation && (
            <div className="px-4 pb-1 text-[10px] text-gray-600">
              {MAX_MESSAGES - userMessageCount} free messages this session · public chat — don't share private data
            </div>
          )}
        </div>
      )}

      {/* ── Always-visible input bar ── */}
      <div className={`relative bg-gray-800/70 backdrop-blur-sm border border-gray-700 p-1 transition-all duration-200 pointer-events-auto
        ${expanded ? 'rounded-b-xl border-t-0' : 'rounded-xl hover:border-cyan-500/40 hover:bg-gray-800/90'}
      `}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => { handleFocus(); setIsFocused(true); }}
          onBlur={() => setIsFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder={limitReached ? 'Session limit reached — launch the app to continue.' : ''}
          disabled={busy || limitReached}
          rows={1}
          maxLength={500}
          className={`w-full bg-transparent text-gray-200 resize-none focus:outline-none px-3 py-2 pr-24 text-base placeholder-cyan-400 disabled:opacity-60 text-center focus:text-left font-medium leading-10`}
          style={{ minHeight: '40px' }}
        />
        {/* Smooth horizontal marquee placeholder — visible only when idle.
            Sits absolutely over the textarea and is click-through so the
            textarea still receives focus. */}
        {!isFocused && !input && !limitReached && (
          <div
            className="pointer-events-none absolute inset-y-0 left-3 right-24 flex items-center"
            aria-hidden="true"
          >
            <div className="lsa-marquee-mask w-full text-base font-medium text-cyan-400">
              <div className="lsa-marquee">
                {Array.from({ length: 4 }).map((_, i) => (
                  <span key={i} className="lsa-marquee-item inline-flex items-center gap-2">
                    <LightbulbIcon className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                    <span>{MARQUEE_TEXT}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          <button
            onMouseDown={(e) => e.preventDefault()} // prevent blur before click
            onClick={() => {
              setExpanded(true);
              setShowSuggestions(p => !p);
            }}
            className={`p-2 text-yellow-400 hover:bg-yellow-500/10 rounded-full transition-colors ${
              !showSuggestions && !hasConversation ? 'animate-pulse-yellow-glow' : ''
            }`}
            title="Suggested Questions"
            type="button"
          >
            <LightbulbIcon className="w-5 h-5" />
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => send(input)}
            disabled={busy || limitReached || !input.trim()}
            className="p-2 text-white bg-blue-600 rounded-full hover:bg-blue-700 disabled:bg-gray-600 disabled:text-gray-400 transition-colors"
            title="Send"
            type="button"
          >
            <SendIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Footer shown when expanded and has conversation */}
      {expanded && hasConversation && (
        <div className="px-2 pt-1 text-[10px] text-gray-600 flex justify-between">
          <span>{MAX_MESSAGES - userMessageCount} message(s) left this session</span>
          <span>public chat — don't share private data</span>
        </div>
      )}
    </div>
  );
};

export default PublicConciergeChat;

// ──────────────────────────────────────────────────────────────────────────
// ConciergeOverlay — persistent, draggable, shadeable floating dialog
// driven by the module-level concierge store. Mount ONCE at the App root
// so it follows the user across every screen.
// ──────────────────────────────────────────────────────────────────────────
export const ConciergeOverlay: React.FC = () => {
  const state = useConciergeStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const userMessageCount = state.history.filter(m => m.role === 'user').length;
  const limitReached = userMessageCount >= MAX_MESSAGES;
  const hasConversation = state.history.length > 0;

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [state.history, state.busy, state.showSuggestions, state.open, state.minimized]);

  // Show starter suggestions the first time it opens with no history
  useEffect(() => {
    if (state.open && !hasConversation && !state.showSuggestions && state.history.length === 0) {
      setConciergeState({ showSuggestions: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.open]);

  // Focus textarea when dialog opens / un-shades
  useEffect(() => {
    if (state.open && !state.minimized) {
      const t = setTimeout(() => textareaRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [state.open, state.minimized]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || state.busy || limitReached) return;
    const next: PublicChatMessage[] = [...state.history, { role: 'user', text: trimmed }];
    setConciergeState({ error: null, showSuggestions: false, history: next, input: '', busy: true });
    try {
      const reply = await askPublicConcierge(next);
      setConciergeState(s => ({ history: [...s.history, { role: 'model', text: reply || '(no response)' }] }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setConciergeState({ error: msg });
    } finally {
      setConciergeState({ busy: false });
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  if (!state.open) return null;

  return (
    <ConciergeDialog
      state={state}
      hasConversation={hasConversation}
      limitReached={limitReached}
      userMessageCount={userMessageCount}
      send={send}
      scrollRef={scrollRef}
      textareaRef={textareaRef}
    />
  );
};

// ──────────────────────────────────────────────────────────────────────────
// Internal: the visual dialog. Position is local state but seeded from the
// store so it survives close/reopen.
// ──────────────────────────────────────────────────────────────────────────
interface ConciergeDialogProps {
  state: ConciergeState;
  hasConversation: boolean;
  limitReached: boolean;
  userMessageCount: number;
  send: (text: string) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

const ConciergeDialog: React.FC<ConciergeDialogProps> = ({
  state, hasConversation, limitReached, userMessageCount, send, scrollRef, textareaRef,
}) => {
  const { history, input, busy, error, showSuggestions, minimized } = state;
  const setInput = (v: string) => setConciergeState({ input: v });
  const setShowSuggestions = (v: boolean | ((p: boolean) => boolean)) =>
    setConciergeState(s => ({ showSuggestions: typeof v === 'function' ? v(s.showSuggestions) : v }));
  const onClose = closeConcierge;
  const onShade = toggleConciergeShade;
  const MAX_MESSAGES_LOCAL = 8;
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ active: boolean; ox: number; oy: number }>({ active: false, ox: 0, oy: 0 });
  // Initial position: seeded from store (persists across close/reopen). If
  // no stored position yet, center near the top of the viewport.
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    if (state.pos) return state.pos;
    if (typeof window === 'undefined') return { x: 80, y: 80 };
    const w = Math.min(720, window.innerWidth - 40);
    return { x: Math.max(20, (window.innerWidth - w) / 2), y: 80 };
  });

  const onHeaderDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    dragRef.current = { active: true, ox: e.clientX - pos.x, oy: e.clientY - pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHeaderMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const x = e.clientX - dragRef.current.ox;
    const y = e.clientY - dragRef.current.oy;
    const el = dialogRef.current;
    const w = el?.offsetWidth ?? 720;
    setPos({
      x: Math.max(-w + 80, Math.min(x, window.innerWidth - 80)),
      y: Math.max(0, Math.min(y, window.innerHeight - 40)),
    });
  };
  const onHeaderUp = () => {
    if (dragRef.current.active) {
      dragRef.current.active = false;
      // Persist the position into the store so it follows across screens
      // and survives close/reopen.
      setConciergeState({ pos });
    }
  };

  // Focus is handled by ConciergeOverlay (won't focus while shaded).

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-label="LandSurv.ai Concierge"
      className="fixed flex flex-col rounded-xl overflow-hidden shadow-2xl ring-1 ring-cyan-400/30 bg-gray-900/95 backdrop-blur-xl"
      style={{
        left: pos.x,
        top: pos.y,
        width: 'min(720px, calc(100vw - 24px))',
        height: minimized ? 'auto' : 'min(640px, calc(100vh - 100px))',
        zIndex: 9500,
        boxShadow: '0 20px 60px -10px rgba(0,0,0,0.7), 0 0 0 1px rgba(34,211,238,0.08), 0 0 40px -10px rgba(250,204,21,0.25)',
      }}
    >
      {/* Header — draggable, gradient strip */}
      <div
        className="flex items-center justify-between px-4 py-2.5 select-none cursor-grab active:cursor-grabbing border-b border-cyan-400/20"
        onPointerDown={onHeaderDown}
        onPointerMove={onHeaderMove}
        onPointerUp={onHeaderUp}
        onPointerCancel={onHeaderUp}
        style={{
          background: 'linear-gradient(90deg, rgba(8,47,73,0.95) 0%, rgba(17,24,39,0.95) 50%, rgba(8,47,73,0.95) 100%)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <span className="relative inline-flex items-center justify-center w-7 h-7 rounded-full bg-yellow-400/10 ring-1 ring-yellow-400/40">
            <LightbulbIcon className="w-4 h-4 text-yellow-300" />
            <span className="absolute inset-0 rounded-full animate-pulse-yellow-glow pointer-events-none" />
          </span>
          <span className="text-sm font-bold text-white tracking-tight">
            Ask <span className="text-cyan-300">LandSurv</span><span className="text-emerald-300">.ai</span> Concierge
          </span>
          <span className="text-[10px] uppercase tracking-wider text-cyan-200/80 border border-cyan-300/30 rounded px-1.5 py-0.5">free</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            data-no-drag
            onClick={onShade}
            className="text-gray-300 hover:text-white p-1 rounded hover:bg-white/10 transition-colors"
            aria-label={minimized ? 'Expand' : 'Shade'}
            title={minimized ? 'Expand' : 'Shade'}
          >
            {minimized ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7 7 7-7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
              </svg>
            )}
          </button>
          <button
            data-no-drag
            onClick={onClose}
            className="text-gray-300 hover:text-white p-1 rounded hover:bg-white/10 transition-colors"
            aria-label="Close"
            title="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Body — hidden when shaded so the panel collapses to just the header */}
      {!minimized && (
        <>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
        {history.length === 0 && !showSuggestions && (
          <p className="text-gray-500 text-xs italic text-center py-4">
            Ask anything about the app — agents, LSVZ format, pricing, file types…
          </p>
        )}
        {history.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-3 py-2 rounded-lg whitespace-pre-wrap text-sm ${
              m.role === 'user'
                ? 'bg-cyan-600/80 text-white rounded-br-sm'
                : 'bg-gray-800 text-gray-100 rounded-bl-sm border border-white/5'
            }`}>
              {m.text}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-800 border border-white/5">
              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0s' }} />
              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
            </div>
          </div>
        )}
        {error && (
          <div className="text-xs text-red-300 bg-red-900/30 border border-red-500/30 rounded px-2 py-1">
            {error}
          </div>
        )}
        {showSuggestions && (
          <div className="pt-1">
            <div className="flex items-center gap-2 mb-2">
              <LightbulbIcon className="w-4 h-4 text-yellow-400 flex-shrink-0" />
              <span className="text-xs font-semibold text-gray-400">Here are some ideas to get you started:</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SUGGESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => { setShowSuggestions(false); send(q); }}
                  className="p-2.5 text-left text-gray-300 bg-gray-900/50 rounded-lg border border-gray-700 hover:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 text-xs transition-colors"
                >
                  <p className="font-medium">{`"${q}"`}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="border-t border-gray-700/60 bg-gray-900/80 p-2 relative">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder={limitReached ? 'Session limit reached — launch the app to continue.' : 'Type your question…'}
          disabled={busy || limitReached}
          rows={1}
          maxLength={500}
          className="w-full bg-gray-800/60 text-gray-100 resize-none rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/40 px-3 py-2 pr-20 text-sm placeholder-gray-500 disabled:opacity-60"
          style={{ minHeight: '40px' }}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowSuggestions(p => !p)}
            className={`p-2 text-yellow-400 hover:bg-yellow-500/10 rounded-full transition-colors ${
              !showSuggestions && !hasConversation ? 'animate-pulse-yellow-glow' : ''
            }`}
            title="Suggested Questions"
            type="button"
          >
            <LightbulbIcon className="w-5 h-5" />
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => send(input)}
            disabled={busy || limitReached || !input.trim()}
            className="p-2 text-white bg-blue-600 rounded-full hover:bg-blue-700 disabled:bg-gray-600 disabled:text-gray-400 transition-colors"
            title="Send"
            type="button"
          >
            <SendIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 text-[10px] text-gray-500 flex justify-between border-t border-gray-800/60 bg-gray-950/60">
        <span>{MAX_MESSAGES_LOCAL - userMessageCount} message(s) left this session</span>
        <span>public chat — don't share private data</span>
      </div>
      </>
      )}
    </div>,
    document.body
  );
};
