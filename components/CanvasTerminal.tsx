import React, { useRef, useState, useEffect, useCallback } from 'react';
import { parseCanvasCommand, executeCanvasCommand, describeCommand, type CommandContext, type CommandResult, type HelpGroup } from '../utils/canvasCommands';

export interface TerminalLink {
  label: string;
  onClick: () => void;
}

export interface TerminalEntry {
  id: string;
  type: 'input' | 'output' | 'hint' | 'status';
  text: string;
  timestamp: number;
  tone?: 'normal' | 'ok' | 'error' | 'info' | 'warn' | 'command';
  /** Inline actions rendered after the message (open in editor, copy, …). */
  links?: TerminalLink[];
  /** Formatted help sections (HELP); when present they replace the plain text. */
  helpGroups?: HelpGroup[];
  helpNotes?: string[];
}

interface CanvasTerminalProps {
  /** Live hint/prompt to display on the active command line (e.g. "LINE: Specify next point...") */
  activePrompt?: string;
  /** Increment to hand focus back to the command line (e.g. after a command's picks are applied). */
  focusRequest?: number;
  /** Command context providing callbacks to drawing canvas handlers */
  commandContext: CommandContext;
  /** Callback when user executes a command */
  onExecuteCommand?: (input: string) => void;
  /** Key info to display or open on click */
  keyInfo?: {
    label: string;
    detail: string;
    tone?: string;
    onClick?: () => void;
    hasServiceAndInference?: boolean;
    isServiceEnabled?: boolean;
    isInferenceEnabled?: boolean;
  };
  /** External trigger to append a hint or message to the terminal feed */
  incomingMessage?: { text: string; tone?: 'normal' | 'ok' | 'error' | 'info' } | null;
  /** Open the selection Properties dialog (the PROP command does the same). */
  onOpenProperties?: () => void;
  /** Hand a command result to the app's full text editor. */
  onOpenTextEditor?: (content: string) => void;
  /** Snaps and ortho status display */
  statusBadges?: {
    runningOsnaps?: string;
    osnapOverride?: string | null;
    isOrthoEnabled?: boolean;
  };
}

const HELP_ACCENTS: Record<string, { text: string; dot: string; rule: string; chip: string }> = {
  cyan: { text: 'text-cyan-300', dot: 'bg-cyan-400', rule: 'border-cyan-500/40', chip: 'bg-cyan-500/10' },
  emerald: { text: 'text-emerald-300', dot: 'bg-emerald-400', rule: 'border-emerald-500/40', chip: 'bg-emerald-500/10' },
  amber: { text: 'text-amber-300', dot: 'bg-amber-400', rule: 'border-amber-500/40', chip: 'bg-amber-500/10' },
  sky: { text: 'text-sky-300', dot: 'bg-sky-400', rule: 'border-sky-500/40', chip: 'bg-sky-500/10' },
  violet: { text: 'text-violet-300', dot: 'bg-violet-400', rule: 'border-violet-500/40', chip: 'bg-violet-500/10' },
  rose: { text: 'text-rose-300', dot: 'bg-rose-400', rule: 'border-rose-500/40', chip: 'bg-rose-500/10' },
};

/** Formatted HELP reference: colored group headers, command chips, italic notes. */
const CommandHelpView: React.FC<{ groups: HelpGroup[]; notes?: string[] }> = ({ groups, notes }) => (
  <div className="mt-1 space-y-2">
    <div className="flex items-center gap-2 font-mono text-[10px] text-gray-500">
      <span className="font-extrabold uppercase tracking-[0.18em] text-gray-300">Commands:</span>
      <span className="text-gray-600">·</span>
      <span className="italic">grouped reference — links below open it in the editor</span>
    </div>
    <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
      {groups.map(group => {
        const accent = HELP_ACCENTS[group.accent] ?? HELP_ACCENTS.cyan;
        return (
          <div key={group.title} className={`overflow-hidden rounded-md border bg-gray-950/50 ${accent.rule}`}>
            <div className={`flex items-center gap-2 border-b border-gray-800/80 px-2 py-1 ${accent.chip}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
              <span className={`font-mono text-[10px] font-extrabold uppercase tracking-[0.16em] underline decoration-2 underline-offset-4 ${accent.text}`}>
                {group.title}
              </span>
              <span className="ml-auto font-mono text-[9px] font-medium italic text-gray-500">
                {group.entries.length} {group.entries.length === 1 ? 'command' : 'commands'}
              </span>
            </div>
            <div className="divide-y divide-gray-800/50">
              {group.entries.map(entry => (
                <div key={entry.command} className="flex items-baseline gap-2 px-2 py-[3px]">
                  <span className={`w-[108px] shrink-0 truncate font-mono text-[11px] font-bold underline decoration-dotted underline-offset-2 ${accent.text}`} title={entry.command}>
                    {entry.command}
                  </span>
                  <span className="min-w-0 flex-1 font-mono text-[10px] leading-snug text-gray-300">
                    {entry.description}
                    {entry.note ? <span className="ml-1 font-mono text-[9px] italic text-gray-500">{entry.note}</span> : null}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
    {notes?.length ? (
      <div className="rounded-md border border-gray-800 bg-gray-950/40 px-2 py-1.5">
        {notes.map(note => (
          <div key={note} className="flex gap-2 py-[1px] font-mono text-[9px] italic leading-snug text-gray-500">
            <span className="text-cyan-500">›</span>
            <span>{note}</span>
          </div>
        ))}
      </div>
    ) : null}
  </div>
);

export const CanvasTerminal: React.FC<CanvasTerminalProps> = ({
  activePrompt,
  focusRequest,
  commandContext,
  onExecuteCommand,
  onOpenProperties,
  onOpenTextEditor,
  keyInfo,
  incomingMessage,
  statusBadges,
}) => {
  const [history, setHistory] = useState<TerminalEntry[]>([]);
  const [inputText, setInputText] = useState('');
  // Single command line: rests as a lightweight "Press Space" hint and becomes
  // the focused CAD input when Space (or a click) activates it.
  const [isCommandLineActive, setIsCommandLineActive] = useState(false);
  // History stays collapsed on load; expansion is a per-session action.
  const [isExpanded, setIsExpanded] = useState(false);

  const [panelHeight, setPanelHeight] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem('landsurv-canvas-terminal-height'));
      return Number.isFinite(v) && v >= 100 && v <= 500 ? v : 180;
    } catch {
      return 180;
    }
  });

  // Pulsing indicator on the collapse button when Help expands the command line
  const [isCollapsePulsing, setIsCollapsePulsing] = useState(false);

  // Command history navigation with Up/Down arrows
  const commandHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const historyScrollRef = useRef<HTMLDivElement | null>(null);

  // Top border resize handle for expanded history
  const isResizingRef = useRef(false);
  const resizeStartRef = useRef<{ clientY: number; origHeight: number }>({ clientY: 0, origHeight: 0 });

  // Auto-dismiss collapse pulse after 15s if untouched
  useEffect(() => {
    if (!isCollapsePulsing) return;
    const timer = window.setTimeout(() => {
      setIsCollapsePulsing(false);
    }, 15000);
    return () => clearTimeout(timer);
  }, [isCollapsePulsing]);

  const activateCommandLine = useCallback(() => {
    setIsCommandLineActive(true);
    // The input mounts on first activation; the effect below focuses it.
    // When already active but blurred, focus it directly.
    inputRef.current?.focus();
  }, []);

  // Command hand-off: after a command finishes with canvas picks, put the caret
  // back on the command line so the next command can be typed without Space.
  useEffect(() => {
    if (!focusRequest) return;
    setIsCommandLineActive(true);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [focusRequest]);

  // Space activates the resting command line without stealing spaces from text fields.
  useEffect(() => {
    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.code !== 'Space') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'SELECT' || tag === 'A' || target?.isContentEditable) return;
      e.preventDefault();
      activateCommandLine();
    };
    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [activateCommandLine]);

  // Focus the command input as soon as it activates so typing starts immediately.
  useEffect(() => {
    if (isCommandLineActive) {
      inputRef.current?.focus();
    }
  }, [isCommandLineActive]);

  // Append incoming external messages / tool feedback
  useEffect(() => {
    if (!incomingMessage || !incomingMessage.text.trim()) return;
    setHistory(prev => [
      ...prev.slice(-80),
      {
        id: `msg-${Date.now()}-${Math.random()}`,
        type: 'hint',
        text: incomingMessage.text,
        timestamp: Date.now(),
        tone: incomingMessage.tone || 'normal',
      },
    ]);
  }, [incomingMessage]);

  const copyText = (text: string) => {
    try {
      void navigator.clipboard?.writeText(text);
    } catch {
      /* clipboard unavailable */
    }
  };

  const resultLinks = (result: CommandResult): TerminalLink[] => {
    const links: TerminalLink[] = [];
    for (const link of result.links ?? []) {
      if (link.action === 'open-text-editor' && onOpenTextEditor) {
        links.push({ label: link.label ?? 'Open in Text Editor', onClick: () => onOpenTextEditor(link.payload ?? result.message) });
      } else if (link.action === 'open-properties' && commandContext.onOpenProperties) {
        links.push({ label: link.label ?? 'Open Properties', onClick: () => commandContext.onOpenProperties?.() });
      } else if (link.action === 'select-all' && commandContext.onSelectAll) {
        links.push({ label: link.label ?? 'Select All', onClick: () => commandContext.onSelectAll?.() });
      } else if (link.action === 'help') {
        links.push({ label: link.label ?? 'Show Help', onClick: executeHelp });
      }
    }
    links.push({ label: 'Copy', onClick: () => copyText(result.message) });
    return links;
  };

  const executeHelp = () => {
    const raw = 'help';
    commandHistoryRef.current.push(raw);
    historyIndexRef.current = -1;

    const newEntry: TerminalEntry = {
      id: `in-${Date.now()}`,
      type: 'input',
      text: 'HELP',
      timestamp: Date.now(),
    };

    const parsed = parseCanvasCommand(raw);
    const result = executeCanvasCommand(parsed, {
      ...commandContext,
      onClear: () => setHistory([]),
    });

    const outEntry: TerminalEntry = {
      id: `out-${Date.now()}`,
      type: 'output',
      text: result.message,
      timestamp: Date.now(),
      tone: 'info',
      links: resultLinks(result),
      helpGroups: result.helpGroups,
      helpNotes: result.helpNotes,
    };

    setHistory(prev => [...prev.slice(-80), newEntry, outEntry]);
    setIsExpanded(true);
    setIsCollapsePulsing(true);
    onExecuteCommand?.(raw);
  };

  const runCommand = (rawInput: string) => {
    const raw = rawInput.trim();
    if (!raw) return;

    commandHistoryRef.current.push(raw);
    historyIndexRef.current = -1;

    // Log input command
    const newEntry: TerminalEntry = {
      id: `in-${Date.now()}`,
      type: 'input',
      text: raw,
      timestamp: Date.now(),
    };

    const parsed = parseCanvasCommand(raw);
    commandContext.onCommandSubmitted?.(parsed.verb);

    // If typing "help" or "?", expand the command line and pulse the collapse button
    if (parsed.verb === 'help') {
      setIsExpanded(true);
      setIsCollapsePulsing(true);
    } else {
      setIsCollapsePulsing(false);
    }

    // If typing "key" or "key info", log status into history output
    if (parsed.verb === 'key_info' && keyInfo) {
      const isBoth = keyInfo.hasServiceAndInference;
      const msg = isBoth
        ? `Service and inference enabled — ${keyInfo.detail}`
        : `KEY: ${keyInfo.label} — ${keyInfo.detail}`;
      setHistory(prev => [
        ...prev.slice(-80),
        newEntry,
        {
          id: `key-query-${Date.now()}`,
          type: 'output',
          text: msg,
          timestamp: Date.now(),
          tone: isBoth ? 'ok' : 'info',
          links: [{ label: 'Copy', onClick: () => copyText(msg) }],
        },
      ]);
      onExecuteCommand?.(raw);
      return;
    }

    const result = executeCanvasCommand(parsed, {
      ...commandContext,
      onClear: () => setHistory([]),
    });

    const outEntry: TerminalEntry = {
      id: `out-${Date.now()}`,
      type: 'output',
      text: result.message,
      timestamp: Date.now(),
      tone: result.status === 'error' ? 'error' : result.status === 'ok' ? 'ok' : 'info',
      links: resultLinks(result),
      helpGroups: result.helpGroups,
      helpNotes: result.helpNotes,
    };

    setHistory(prev => [...prev.slice(-80), newEntry, outEntry]);
    onExecuteCommand?.(raw);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;
    runCommand(inputText);
    setInputText('');
  };

  const handleKeyDownInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Enter on an empty command line confirms whatever the canvas is waiting on
    // (a command's picks) instead of being a dead key.
    if (e.key === 'Enter' && !inputText.trim()) {
      e.preventDefault();
      commandContext.onApplyPendingSelection?.();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const list = commandHistoryRef.current;
      if (list.length === 0) return;
      const nextIdx = historyIndexRef.current === -1 ? list.length - 1 : Math.max(0, historyIndexRef.current - 1);
      historyIndexRef.current = nextIdx;
      setInputText(list[nextIdx] || '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const list = commandHistoryRef.current;
      if (list.length === 0) return;
      const nextIdx = historyIndexRef.current + 1;
      if (nextIdx >= list.length) {
        historyIndexRef.current = -1;
        setInputText('');
      } else {
        historyIndexRef.current = nextIdx;
        setInputText(list[nextIdx]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (inputText) {
        setInputText('');
      } else {
        // Esc always cancels the active command first, even when the history
        // panel is open — then the panel collapses on the next press.
        setIsCommandLineActive(false);
        commandContext.onCancel?.();
        if (isExpanded) {
          setIsExpanded(false);
          setIsCollapsePulsing(false);
        }
      }
    }
  };

  const toggleExpand = () => {
    setIsCollapsePulsing(false);
    setIsExpanded(prev => !prev);
  };

  // Resize expanded history area
  const handleResizePointerDown = (e: React.PointerEvent) => {
    isResizingRef.current = true;
    resizeStartRef.current = { clientY: e.clientY, origHeight: panelHeight };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const handleResizePointerMove = (e: React.PointerEvent) => {
    if (!isResizingRef.current) return;
    const dy = resizeStartRef.current.clientY - e.clientY;
    const newHeight = Math.max(100, Math.min(500, resizeStartRef.current.origHeight + dy));
    setPanelHeight(newHeight);
  };

  const handleResizePointerUp = (e: React.PointerEvent) => {
    if (!isResizingRef.current) return;
    isResizingRef.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch { /* ignore */ }
    try {
      localStorage.setItem('landsurv-canvas-terminal-height', String(panelHeight));
    } catch { /* ignore */ }
  };

  // Auto scroll expanded history to bottom
  useEffect(() => {
    if (isExpanded && historyScrollRef.current) {
      historyScrollRef.current.scrollTop = historyScrollRef.current.scrollHeight;
    }
  }, [history, isExpanded]);

  // Find latest entry to display in the persistent single-line history/status row
  const latestEntry = history.length > 0 ? history[history.length - 1] : null;
  const historyNavText = historyIndexRef.current >= 0 && commandHistoryRef.current[historyIndexRef.current]
    ? `^ [${historyIndexRef.current + 1}/${commandHistoryRef.current.length}] ${commandHistoryRef.current[historyIndexRef.current]}`
    : null;

  // Live feedback for the command being typed: canonical verb + description,
  // or an "unknown" chip when the alias does not resolve.
  const parsedPreview = inputText.trim() ? parseCanvasCommand(inputText) : null;
  const previewDescription = parsedPreview ? describeCommand(parsedPreview.verb) : undefined;

  // The terminal sits inside the canvas viewport, whose wheel handler zooms the
  // drawing. Keep wheel events here so scrolling the command history (or just
  // hovering the command line) never changes the scene scale.
  return (
    <div
      style={{ touchAction: 'none' }}
      onWheel={e => e.stopPropagation()}
      className="absolute bottom-0 left-0 right-0 z-30 select-none border-t border-cyan-500/50 bg-[#080d14] shadow-[0_-8px_24px_rgba(0,0,0,0.7)] backdrop-blur-md font-mono text-gray-200 overflow-hidden flex flex-col"
    >
      {/* Top resize handle when history is expanded */}
      {isExpanded && (
        <div
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          onPointerCancel={handleResizePointerUp}
          className="h-1.5 w-full cursor-ns-resize bg-cyan-500/30 hover:bg-cyan-400/60 transition-colors"
          title="Drag up/down to adjust history height"
        />
      )}

      {/* Expanded Multi-line History Area */}
      {isExpanded && (
        <div
          ref={historyScrollRef}
          style={{ height: `${panelHeight}px` }}
          className="overflow-y-auto px-3 py-2 space-y-1 bg-[#05080d]/95 border-b border-gray-800/80 text-[11px] leading-relaxed select-text"
        >
          {history.map(item => {
            const toneColor =
              item.tone === 'error'
                ? 'text-red-300'
                : item.tone === 'ok'
                ? 'text-emerald-300'
                : item.tone === 'info'
                ? 'text-sky-300'
                : item.tone === 'warn'
                ? 'text-amber-300'
                : item.tone === 'command'
                ? 'text-cyan-200'
                : 'text-gray-200';
            const tokens = item.text.trim().split(/\s+/);
            return (
              <div key={item.id} className="group flex items-start gap-2 rounded px-1 py-0.5 hover:bg-gray-800/40">
                {item.type === 'input' ? (
                  <>
                    <span className="shrink-0 select-none font-bold text-cyan-500">CAD &gt;</span>
                    <span className="break-words text-gray-300">
                      <span className="font-semibold text-amber-300">{tokens[0]}</span>
                      {tokens.length > 1 ? <span className="text-gray-400"> {tokens.slice(1).join(' ')}</span> : null}
                    </span>
                  </>
                ) : (
                  <>
                    <span className={`shrink-0 select-none ${item.tone === 'error' ? 'text-red-500' : item.tone === 'ok' ? 'text-emerald-500' : 'text-sky-500'}`}>
                      {item.type === 'hint' ? '·' : '='}
                    </span>
                    <div className="min-w-0 flex-1">
                      {item.helpGroups?.length ? (
                        <CommandHelpView groups={item.helpGroups} notes={item.helpNotes} />
                      ) : (
                        <span className={`break-words ${toneColor}`}>{item.text}</span>
                      )}
                    </div>
                  </>
                )}
                <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2">
                  {item.links?.map((link, index) => (
                    <button
                      key={`${item.id}-link-${index}`}
                      type="button"
                      onClick={link.onClick}
                      className="rounded border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-cyan-300 transition-colors hover:border-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-100"
                    >
                      {link.label}
                    </button>
                  ))}
                  <span className="text-[9px] tabular-nums text-gray-600">
                    {new Date(item.timestamp).toLocaleTimeString([], { hour12: false })}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Line 1: Single History / Feedback / Instructional Row (matches CAD prompt background) */}
      <div className="flex items-center gap-2 px-3 py-1 bg-[#080d14] text-[10px] leading-none min-h-[22px] overflow-hidden">
        {/* Clickable caret to expand/collapse history — pulses when Help expands the terminal */}
        <button
          type="button"
          onClick={toggleExpand}
          className={`font-bold shrink-0 p-0.5 rounded transition-all flex items-center gap-1 ${
            isCollapsePulsing && isExpanded
              ? 'text-cyan-200 bg-cyan-500/30 ring-2 ring-cyan-400 animate-pulse px-1.5'
              : 'text-cyan-400 hover:text-cyan-300 hover:bg-gray-800/80'
          }`}
          title={isExpanded ? 'Hide / Collapse command line' : 'Expand command line'}
          aria-label={isExpanded ? 'Hide / Collapse command line' : 'Expand command line'}
        >
          <span className="text-xs font-mono leading-none">{isExpanded ? 'v' : '^'}</span>
          {isCollapsePulsing && isExpanded && (
            <span className="text-[10px] text-cyan-200 font-semibold tracking-wide">Hide</span>
          )}
        </button>

        {historyNavText ? (
          <span className="truncate text-cyan-300 font-medium">
            {historyNavText}
          </span>
        ) : activePrompt ? (
          <span className="truncate text-amber-300 font-medium">
            <span className="text-gray-400 uppercase tracking-wider mr-1">Instruction:</span>
            {activePrompt}
          </span>
        ) : latestEntry ? (
          <span
            className={`truncate ${
              latestEntry.tone === 'error'
                ? 'text-red-400 font-semibold'
                : latestEntry.tone === 'ok'
                ? 'text-emerald-400 font-medium'
                : latestEntry.tone === 'info'
                ? 'text-cyan-300'
                : 'text-gray-300'
            }`}
          >
            {latestEntry.helpGroups?.length
              ? `HELP — ${latestEntry.helpGroups.length} groups · ${latestEntry.helpGroups.reduce((total, group) => total + group.entries.length, 0)} commands — see history`
              : latestEntry.text}
          </span>
        ) : (
          <span
            onClick={executeHelp}
            className="truncate text-gray-400 hover:text-cyan-300 cursor-pointer transition-colors"
            title="Click to view commands (or type HELP)"
          >
            Type Help for commands
          </span>
        )}

        {latestEntry?.links?.length ? (
          <span className="flex shrink-0 items-center gap-1.5 border-l border-gray-800/60 pl-2">
            {latestEntry.links.slice(0, 3).map((link, index) => (
              <button
                key={`latest-link-${index}`}
                type="button"
                onClick={link.onClick}
                className="rounded border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-cyan-300 transition-colors hover:border-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-100"
              >
                {link.label}
              </button>
            ))}
          </span>
        ) : null}

        {/* Live Snaps / Ortho Badges in the history line (no key badge here) */}
        <div className="ml-auto flex items-center gap-2 shrink-0 text-[10px] border-l border-gray-800/60 pl-2">
          {onOpenProperties && (
            <button
              type="button"
              data-no-drag
              onClick={onOpenProperties}
              className="text-cyan-300/90 underline-offset-2 hover:text-cyan-200 hover:underline"
              title="Properties — inspect and edit selected entities (or type PROP)"
            >
              PROPERTIES
            </button>
          )}
          {statusBadges?.isOrthoEnabled !== undefined && (
            <span className={statusBadges.isOrthoEnabled ? 'text-emerald-400 font-bold' : 'text-gray-600'}>
              ORTHO
            </span>
          )}
          {statusBadges?.runningOsnaps && (
            <span className="text-cyan-400 font-medium truncate max-w-[120px]" title={`Running snaps: ${statusBadges.runningOsnaps}`}>
              SNAP
            </span>
          )}
        </div>
      </div>

      {/* Line 2: Single interactive CAD command line — resting hint or active input */}
      <div className="flex h-7 items-center gap-2 px-3 bg-[#080d14]">
        {isCommandLineActive ? (
          <form onSubmit={handleSubmit} className="flex min-w-0 flex-1 items-center gap-2">
            <span className="text-emerald-400 font-bold text-xs shrink-0 tracking-tight flex items-center gap-1">
              <span className="text-cyan-400">CAD</span>
              <span>&gt;</span>
            </span>
            <input
              ref={inputRef}
              data-no-drag
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handleKeyDownInput}
              onBlur={e => {
                // Return the empty line to its "Press Space" resting state when
                // the user clicks back to the canvas; keep typed text active.
                if (!e.currentTarget.value.trim()) setIsCommandLineActive(false);
              }}
              placeholder="Type command (L, C, REC, POL, AR, PA, M, RO, SC...)"
              className="min-w-0 flex-1 bg-transparent text-gray-100 placeholder-gray-500 outline-none font-mono text-xs selection:bg-cyan-500/30"
              spellCheck={false}
              autoComplete="off"
            />
            {parsedPreview?.verb ? (
              <span
                className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${previewDescription ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300' : 'border-red-500/40 bg-red-500/10 text-red-300'}`}
                title={previewDescription ?? 'Unknown command — type HELP for the list'}
              >
                {previewDescription ? parsedPreview.verb.replace(/_/g, ' ') : 'unknown'}
              </span>
            ) : null}
          </form>
        ) : (
          <button
            type="button"
            data-no-drag
            onClick={activateCommandLine}
            className="group flex min-w-0 flex-1 items-center gap-2 bg-transparent text-left cursor-pointer"
            title="Press Space to type a command"
            aria-label="Activate command line"
          >
            <span className="text-emerald-400 font-bold text-xs shrink-0 tracking-tight flex items-center gap-1">
              <span className="text-cyan-400">CAD</span>
              <span>&gt;</span>
            </span>
            <span className="font-mono text-[10px] text-gray-500 transition-colors group-hover:text-gray-300">
              Press Space
            </span>
          </button>
        )}
        {keyInfo?.hasServiceAndInference && (
          <span
            onClick={keyInfo.onClick}
            className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider shrink-0 cursor-pointer hover:underline pr-1 hidden sm:inline"
            title="Service & inference active | Click to view key details"
          >
            ● Service &amp; Inference Enabled
          </span>
        )}
      </div>
    </div>
  );
};

export default CanvasTerminal;
