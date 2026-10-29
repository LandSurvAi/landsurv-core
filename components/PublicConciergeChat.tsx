import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { askPublicConcierge, PublicChatMessage } from '../services/publicChatService';
import { ChevronDownIcon, ChevronRightIcon, ChevronUpIcon, LightbulbIcon, XMarkIcon } from './icons';
import { useAppState } from '../contexts/AppStateContext.tsx';
import { useUIState } from '../contexts/UIStateContext.tsx';

/**
 * Public-facing concierge chat ("Ask LandSurv.ai").
 *
 * Two surfaces:
 *  - `PublicConciergeChat` — the inline launcher used on the lock screen. The
 *    input is visible up front; focusing it reveals the conversation above.
 *  - `ConciergeOverlay` — a persistent dialog (desktop: draggable window,
 *    phone: bottom sheet) driven by a module-level store, so the history and
 *    position follow the user between screens.
 *
 * Keyboard behaviour: nothing here focuses the input on touch devices. Opening
 * the dialog on a phone must not raise the software keyboard unprompted — the
 * user taps the field when they want to type, so the conversation stays
 * visible instead of being covered by the keyboard.
 */
const MAX_MESSAGES = 8;
const SUGGESTIONS = [
  'What is LandSurv.ai?',
  'What is LSVZ?',
  'What can the Boundary Agent do?',
  'Do I need my own API key?',
];

/** Devices with a hardware pointer — the only ones where autofocus is safe. */
const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';
/** Below this width the floating dialog becomes a bottom sheet. */
const SHEET_QUERY = '(max-width: 640px)';

const hasFinePointer = (): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(FINE_POINTER_QUERY).matches;
};

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    // Safari < 14
    mql.addListener?.(onChange);
    return () => mql.removeListener?.(onChange);
  }, [query]);

  return matches;
}

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
const subscribeConcierge = (cb: () => void) => {
  conciergeListeners.add(cb);
  return () => {
    conciergeListeners.delete(cb);
  };
};
const setConciergeState = (
  patch: Partial<ConciergeState> | ((s: ConciergeState) => Partial<ConciergeState>),
) => {
  const next = typeof patch === 'function' ? patch(conciergeState) : patch;
  conciergeState = { ...conciergeState, ...next };
  conciergeListeners.forEach((cb) => cb());
};
export const openConcierge = () => setConciergeState({ open: true, minimized: false });
export const closeConcierge = () => setConciergeState({ open: false });
export const toggleConciergeShade = () => setConciergeState((s) => ({ minimized: !s.minimized }));
const useConciergeStore = () =>
  useSyncExternalStore(subscribeConcierge, getConciergeSnapshot, getConciergeSnapshot);

// ───────────────────────────────────────────────────────────────
// Shared presentation
// ───────────────────────────────────────────────────────────────

const SURFACE = 'border-white/10 bg-gray-950/95';

/** Brand mark used in the header, launcher and assistant messages. */
const ConciergeMark: React.FC<{ size?: 'sm' | 'md' }> = ({ size = 'md' }) => (
  <span
    className={`grid flex-shrink-0 place-items-center rounded-lg bg-gradient-to-br from-amber-400/20 to-yellow-400/5 ring-1 ring-inset ring-white/10 ${
      size === 'sm' ? 'h-6 w-6' : 'h-9 w-9 rounded-xl'
    }`}
  >
    <LightbulbIcon
      className={size === 'sm' ? 'h-3 w-3 text-amber-300' : 'h-4 w-4 text-amber-300'}
    />
  </span>
);

const ArrowUpIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={2.4}
    stroke="currentColor"
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);

const IconButton: React.FC<{
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  noDrag?: boolean;
}> = ({ onClick, label, children, noDrag }) => (
  <button
    type="button"
    data-no-drag={noDrag ? '' : undefined}
    onClick={onClick}
    aria-label={label}
    title={label}
    className="grid h-7 w-7 place-items-center rounded-md text-gray-400 transition-colors hover:bg-white/5 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
  >
    {children}
  </button>
);

const SuggestionGrid: React.FC<{ onPick: (question: string) => void }> = ({ onPick }) => (
  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
    {SUGGESTIONS.map((question) => (
      <button
        key={question}
        type="button"
        onClick={() => onPick(question)}
        className="group flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 text-left text-[12.5px] leading-snug text-gray-300 transition-colors hover:border-cyan-400/40 hover:bg-white/[0.05] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
      >
        <span>{question}</span>
        <ChevronRightIcon className="h-3.5 w-3.5 flex-shrink-0 text-gray-600 transition-colors group-hover:text-cyan-300" />
      </button>
    ))}
  </div>
);

interface MessageListProps {
  history: PublicChatMessage[];
  busy: boolean;
  error: string | null;
  showSuggestions: boolean;
  onPickSuggestion: (question: string) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  className?: string;
}

const MessageList: React.FC<MessageListProps> = ({
  history,
  busy,
  error,
  showSuggestions,
  onPickSuggestion,
  scrollRef,
  className = '',
}) => {
  const empty = history.length === 0;

  return (
    <div
      ref={scrollRef}
      aria-live="polite"
      className={`flex-1 overflow-y-auto px-4 py-4 ${className}`}
    >
      {empty && (
        <div className="mb-4 px-1">
          <p className="text-[15px] font-semibold text-white">How can I help?</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-gray-500">
            Ask about the agents, LSVZ, pricing or supported files. This is a public
            assistant — don't share private data.
          </p>
        </div>
      )}

      {!empty && (
        <div className="space-y-3">
          {history.map((message, index) =>
            message.role === 'user' ? (
              <div key={index} className="flex justify-end">
                <div className="max-w-[82%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-cyan-500/15 px-3.5 py-2 text-[13px] leading-relaxed text-cyan-50 ring-1 ring-inset ring-cyan-400/20">
                  {message.text}
                </div>
              </div>
            ) : (
              <div key={index} className="flex items-start gap-2.5">
                <ConciergeMark size="sm" />
                <div className="max-w-[82%] whitespace-pre-wrap rounded-2xl rounded-tl-md bg-white/[0.04] px-3.5 py-2 text-[13px] leading-relaxed text-gray-100 ring-1 ring-inset ring-white/10">
                  {message.text}
                </div>
              </div>
            ),
          )}
        </div>
      )}

      {busy && (
        <div className="mt-3 flex items-start gap-2.5">
          <ConciergeMark size="sm" />
          <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-md bg-white/[0.04] px-3.5 py-3 ring-1 ring-inset ring-white/10">
            {[0, 1, 2].map((dot) => (
              <span
                key={dot}
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300/80"
                style={{ animationDelay: `${dot * 0.18}s` }}
              />
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] leading-relaxed text-red-200">
          {error}
        </div>
      )}

      {showSuggestions && (
        <div className={empty ? 'mt-1' : 'mt-4 border-t border-white/5 pt-3'}>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">
            <LightbulbIcon className="h-3 w-3 text-amber-300/80" />
            Suggested questions
          </p>
          <SuggestionGrid onPick={onPickSuggestion} />
        </div>
      )}
    </div>
  );
};

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onToggleSuggestions: () => void;
  showSuggestions: boolean;
  busy: boolean;
  limitReached: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  placeholder: string;
  /** Inline launcher on the lock screen: taller field, centred text. */
  variant?: 'panel' | 'standalone';
  onFocus?: () => void;
  onBlur?: () => void;
}

const Composer: React.FC<ComposerProps> = ({
  value,
  onChange,
  onSend,
  onToggleSuggestions,
  showSuggestions,
  busy,
  limitReached,
  textareaRef,
  placeholder,
  variant = 'panel',
  onFocus,
  onBlur,
}) => {
  const standalone = variant === 'standalone';
  const disabled = busy || limitReached;
  const canSend = Boolean(value.trim()) && !disabled;

  return (
    <div
      className={`flex items-end gap-2 ${
        standalone
          ? 'rounded-2xl border border-white/10 bg-gray-900/80 px-2.5 py-2 shadow-lg shadow-black/30 backdrop-blur-md transition-colors focus-within:border-cyan-400/40'
          : 'rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 transition-colors focus-within:border-cyan-400/40 focus-within:ring-2 focus-within:ring-cyan-400/10'
      }`}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          const el = event.currentTarget;
          el.style.height = 'auto';
          el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
        }}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            onSend();
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        maxLength={500}
        enterKeyHint="send"
        autoComplete="off"
        className={`flex-1 resize-none bg-transparent leading-relaxed text-gray-100 placeholder-gray-500 focus:outline-none disabled:opacity-60 ${
          standalone ? 'px-1.5 py-2 text-[14px]' : 'px-1 py-1.5 text-[13px]'
        }`}
      />

      <div className="flex flex-shrink-0 items-center gap-1 pb-0.5">
        <button
          type="button"
          // Prevent the textarea blurring before the click lands.
          onMouseDown={(event) => event.preventDefault()}
          onClick={onToggleSuggestions}
          aria-pressed={showSuggestions}
          aria-label="Suggested questions"
          title="Suggested questions"
          className={`grid place-items-center rounded-lg p-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 ${
            showSuggestions
              ? 'bg-white/[0.07] text-amber-300'
              : 'text-gray-500 hover:bg-white/5 hover:text-amber-300'
          }`}
        >
          <LightbulbIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onSend}
          disabled={!canSend}
          aria-label="Send message"
          title="Send message"
          className={`grid h-8 w-8 place-items-center rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 ${
            canSend
              ? 'bg-cyan-400 text-slate-950 hover:bg-cyan-300'
              : 'cursor-not-allowed bg-white/5 text-gray-600'
          }`}
        >
          <ArrowUpIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

const MetaRow: React.FC<{ remaining: number; hint: string }> = ({ remaining, hint }) => (
  <div className="flex items-center justify-between gap-3 text-[10.5px] text-gray-600">
    <span className="truncate">{hint}</span>
    <span className={`flex-shrink-0 tabular-nums ${remaining <= 2 ? 'text-amber-400/80' : ''}`}>
      {remaining} of {MAX_MESSAGES} free
    </span>
  </div>
);

export interface PublicConciergeChatProps {
  /** When true, renders only a compact launcher pill. Clicking it opens the
   *  persistent floating dialog. Used on the home screen beside the logo. */
  compact?: boolean;
}

export const PublicConciergeChat: React.FC<PublicConciergeChatProps> = ({ compact = false }) => {
  const store = useConciergeStore();
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<PublicChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const userMessageCount = history.filter((message) => message.role === 'user').length;
  const limitReached = userMessageCount >= MAX_MESSAGES;
  const hasConversation = history.length > 0;

  // Auto-scroll messages
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history, busy, showSuggestions]);

  // Close the revealed panel on outside click, but only before a conversation
  // has started — once there is history, collapsing would hide the answers.
  useEffect(() => {
    if (!expanded) return;
    const handler = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
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
      setHistory((previous) => [...previous, { role: 'model', text: reply || '(no response)' }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addNotification({
        kind: 'concierge-chat',
        severity: 'error',
        title: 'LandSurv Concierge',
        message,
      });
    } finally {
      setBusy(false);
    }
  };

  // ── Compact launcher — still just an entry point; the dialog itself is
  //    rendered by <ConciergeOverlay /> at the App root. ──
  if (compact) {
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
    <div ref={containerRef} className="pointer-events-auto mx-auto mb-4 w-full max-w-xl">
      {/* Revealed panel */}
      {expanded && (
        <div className={`overflow-hidden rounded-t-2xl border border-b-0 backdrop-blur-xl ${SURFACE}`}>
          <div className="flex items-center justify-between border-b border-white/5 px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <ConciergeMark size="sm" />
              <span className="text-[13px] font-semibold tracking-tight text-white">
                LandSurv Concierge
              </span>
              <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/20">
                Free
              </span>
            </div>
            {hasConversation && (
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="text-[11px] text-gray-500 transition-colors hover:text-gray-300"
                aria-label="Collapse conversation"
              >
                Collapse
              </button>
            )}
          </div>

          <MessageList
            history={history}
            busy={busy}
            error={null}
            showSuggestions={showSuggestions}
            onPickSuggestion={(question) => {
              setShowSuggestions(false);
              void send(question);
            }}
            scrollRef={scrollRef}
            className="max-h-[min(44vh,340px)]"
          />

          <div className="border-t border-white/5 px-3.5 py-2">
            <MetaRow
              remaining={MAX_MESSAGES - userMessageCount}
              hint="Public assistant — don't share private data"
            />
          </div>
        </div>
      )}

      {/* Launcher / composer */}
      <div>
        <Composer
          variant="standalone"
          value={input}
          onChange={setInput}
          onSend={() => void send(input)}
          onToggleSuggestions={() => {
            setExpanded(true);
            setShowSuggestions((previous) => !previous);
          }}
          showSuggestions={showSuggestions}
          busy={busy}
          limitReached={limitReached}
          textareaRef={textareaRef}
          placeholder={
            limitReached
              ? 'Session limit reached — launch the app to continue'
              : 'Ask the concierge anything — agents, LSVZ, pricing…'
          }
          onFocus={() => {
            setIsFocused(true);
            setExpanded(true);
            if (!hasConversation && !showSuggestions) setShowSuggestions(true);
          }}
          onBlur={() => setIsFocused(false)}
        />
        {!expanded && !isFocused && (
          <div className="mt-1.5 px-1">
            <MetaRow
              remaining={MAX_MESSAGES - userMessageCount}
              hint="Public assistant — don't share private data"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicConciergeChat;

// ──────────────────────────────────────────────────────────────────────────
// ConciergeOverlay — persistent floating dialog driven by the module-level
// store. Mount ONCE at the App root so it follows the user across screens.
// ──────────────────────────────────────────────────────────────────────────
export const ConciergeOverlay: React.FC = () => {
  const state = useConciergeStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isSheet = useMediaQuery(SHEET_QUERY);

  const userMessageCount = state.history.filter((message) => message.role === 'user').length;
  const limitReached = userMessageCount >= MAX_MESSAGES;
  const hasConversation = state.history.length > 0;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [state.history, state.busy, state.showSuggestions, state.open, state.minimized]);

  // Offer starter questions the first time it opens with no history.
  useEffect(() => {
    if (state.open && !hasConversation && !state.showSuggestions) {
      setConciergeState({ showSuggestions: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.open]);

  // Desktop only: put the caret in the field so typing starts immediately.
  // On phones the keyboard would slide over the conversation, so the user taps
  // the field themselves.
  useEffect(() => {
    if (!state.open || state.minimized || isSheet || !hasFinePointer()) return;
    const timer = setTimeout(() => textareaRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, [state.open, state.minimized, isSheet]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || state.busy || limitReached) return;
    const next: PublicChatMessage[] = [...state.history, { role: 'user', text: trimmed }];
    setConciergeState({
      error: null,
      showSuggestions: false,
      history: next,
      input: '',
      busy: true,
    });
    try {
      const reply = await askPublicConcierge(next);
      setConciergeState((current) => ({
        history: [...current.history, { role: 'model', text: reply || '(no response)' }],
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setConciergeState({ error: message });
    } finally {
      setConciergeState({ busy: false });
      if (!isSheet && hasFinePointer()) textareaRef.current?.focus();
    }
  };

  const uiState = useUIState();
  const showWelcome = uiState?.showWelcome;

  if (!state.open || showWelcome) return null;

  return (
    <ConciergeDialog
      state={state}
      isSheet={isSheet}
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
// store so it survives close/reopen. Dragging is desktop-only; on phones it is
// a bottom sheet that clears the screen's own chrome.
// ──────────────────────────────────────────────────────────────────────────
interface ConciergeDialogProps {
  state: ConciergeState;
  isSheet: boolean;
  hasConversation: boolean;
  limitReached: boolean;
  userMessageCount: number;
  send: (text: string) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

const ConciergeDialog: React.FC<ConciergeDialogProps> = ({
  state,
  isSheet,
  hasConversation,
  limitReached,
  userMessageCount,
  send,
  scrollRef,
  textareaRef,
}) => {
  const { history, input, busy, error, showSuggestions, minimized } = state;
  const setInput = (value: string) => setConciergeState({ input: value });
  const setShowSuggestions = (value: boolean | ((previous: boolean) => boolean)) =>
    setConciergeState((current) => ({
      showSuggestions: typeof value === 'function' ? value(current.showSuggestions) : value,
    }));
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ active: boolean; ox: number; oy: number }>({ active: false, ox: 0, oy: 0 });
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    if (state.pos) return state.pos;
    if (typeof window === 'undefined') return { x: 80, y: 80 };
    const width = Math.min(680, window.innerWidth - 40);
    return { x: Math.max(20, (window.innerWidth - width) / 2), y: 72 };
  });

  const onHeaderDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isSheet) return;
    if ((event.target as HTMLElement).closest('[data-no-drag]')) return;
    dragRef.current = { active: true, ox: event.clientX - pos.x, oy: event.clientY - pos.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onHeaderMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const el = dialogRef.current;
    const width = el?.offsetWidth ?? 680;
    const x = event.clientX - dragRef.current.ox;
    const y = event.clientY - dragRef.current.oy;
    setPos({
      x: Math.max(-width + 80, Math.min(x, window.innerWidth - 80)),
      y: Math.max(0, Math.min(y, window.innerHeight - 48)),
    });
  };
  const onHeaderUp = () => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    setConciergeState({ pos });
  };

  const frameStyle: React.CSSProperties = isSheet
    ? {
        left: 0,
        right: 0,
        bottom: 0,
        top: 'auto',
        width: '100%',
        height: minimized ? 'auto' : 'min(86dvh, 720px)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        zIndex: 9500,
        boxShadow: '0 -20px 50px -18px rgba(0,0,0,0.75)',
      }
    : {
        left: pos.x,
        top: pos.y,
        width: 'min(680px, calc(100vw - 24px))',
        height: minimized ? 'auto' : 'min(640px, calc(100vh - 100px))',
        zIndex: 9500,
        boxShadow: '0 28px 70px -28px rgba(0,0,0,0.85)',
      };

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal={isSheet}
      aria-label="LandSurv Concierge"
      className={`fixed flex flex-col overflow-hidden border border-white/10 bg-gray-950/95 backdrop-blur-xl ${
        isSheet ? 'rounded-t-2xl' : 'rounded-2xl'
      }`}
      style={frameStyle}
    >
      {/* Header — drag handle on desktop only */}
      <div
        className={`flex items-center justify-between gap-3 border-b border-white/5 bg-gray-900/70 px-4 py-3 ${
          isSheet ? '' : 'cursor-grab select-none active:cursor-grabbing'
        }`}
        onPointerDown={onHeaderDown}
        onPointerMove={onHeaderMove}
        onPointerUp={onHeaderUp}
        onPointerCancel={onHeaderUp}
      >
        <div className="flex min-w-0 items-center gap-3">
          <ConciergeMark />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-[13px] font-semibold tracking-tight text-white">
                LandSurv Concierge
              </h2>
              <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/20">
                Free
              </span>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-gray-500">
              App help, LSVZ and agent questions
            </p>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <IconButton
            noDrag
            onClick={toggleConciergeShade}
            label={minimized ? 'Expand' : 'Minimize'}
          >
            {minimized ? (
              <ChevronUpIcon className="h-4 w-4" />
            ) : (
              <ChevronDownIcon className="h-4 w-4" />
            )}
          </IconButton>
          <IconButton noDrag onClick={closeConcierge} label="Close">
            <XMarkIcon className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      {!minimized && (
        <>
          {isSheet && (
            <div className="flex justify-center pt-2" aria-hidden="true">
              <span className="h-1 w-10 rounded-full bg-white/15" />
            </div>
          )}

          <MessageList
            history={history}
            busy={busy}
            error={error}
            showSuggestions={showSuggestions}
            onPickSuggestion={(question) => {
              setShowSuggestions(false);
              send(question);
            }}
            scrollRef={scrollRef}
            className="min-h-0"
          />

          <div className="border-t border-white/5 bg-gray-900/50 px-3 pb-3 pt-3">
            <Composer
              value={input}
              onChange={setInput}
              onSend={() => send(input)}
              onToggleSuggestions={() => setShowSuggestions((previous) => !previous)}
              showSuggestions={showSuggestions}
              busy={busy}
              limitReached={limitReached}
              textareaRef={textareaRef}
              placeholder={
                limitReached
                  ? 'Session limit reached — launch the app to continue'
                  : hasConversation
                    ? 'Ask a follow-up…'
                    : 'Ask about the app, LSVZ, pricing…'
              }
            />
            <div className="mt-2 px-1">
              <MetaRow
                remaining={MAX_MESSAGES - userMessageCount}
                hint={
                  isSheet
                    ? "Public assistant — don't share private data"
                    : "Enter to send · Shift+Enter for a new line · public chat, don't share private data"
                }
              />
            </div>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
};
