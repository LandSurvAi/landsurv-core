import React, { useRef, useState, useEffect } from 'react';
import { parseCanvasCommand, executeCanvasCommand, type CommandContext } from '../utils/canvasCommands';

export interface TerminalEntry {
  id: string;
  type: 'input' | 'output' | 'hint' | 'status';
  text: string;
  timestamp: number;
  tone?: 'normal' | 'ok' | 'error' | 'info';
}

interface CanvasTerminalProps {
  /** Live hint/prompt to display on the active command line (e.g. "LINE: Specify next point...") */
  activePrompt?: string;
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
  /** Snaps and ortho status display */
  statusBadges?: {
    runningOsnaps?: string;
    osnapOverride?: string | null;
    isOrthoEnabled?: boolean;
  };
}

export const CanvasTerminal: React.FC<CanvasTerminalProps> = ({
  activePrompt,
  commandContext,
  onExecuteCommand,
  keyInfo,
  incomingMessage,
  statusBadges,
}) => {
  const [history, setHistory] = useState<TerminalEntry[]>([]);
  const [inputText, setInputText] = useState('');
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem('landsurv-canvas-terminal-expanded') === 'true';
    } catch {
      return false;
    }
  });

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
    };

    setHistory(prev => [...prev.slice(-80), newEntry, outEntry]);
    setIsExpanded(true);
    setIsCollapsePulsing(true);
    try {
      localStorage.setItem('landsurv-canvas-terminal-expanded', 'true');
    } catch { /* ignore */ }
    onExecuteCommand?.(raw);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const raw = inputText.trim();
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

    // If typing "help" or "?", expand the command line and pulse the collapse button
    if (parsed.verb === 'help') {
      setIsExpanded(true);
      setIsCollapsePulsing(true);
      try {
        localStorage.setItem('landsurv-canvas-terminal-expanded', 'true');
      } catch { /* ignore */ }
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
        },
      ]);
      setInputText('');
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
    };

    setHistory(prev => [...prev.slice(-80), newEntry, outEntry]);
    setInputText('');
    onExecuteCommand?.(raw);
  };

  const handleKeyDownInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
      } else if (isExpanded) {
        setIsExpanded(false);
        setIsCollapsePulsing(false);
      } else {
        commandContext.onCancel?.();
      }
    }
  };

  const toggleExpand = () => {
    setIsCollapsePulsing(false);
    setIsExpanded(prev => {
      const next = !prev;
      try {
        localStorage.setItem('landsurv-canvas-terminal-expanded', String(next));
      } catch { /* ignore */ }
      return next;
    });
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

  return (
    <div
      style={{ touchAction: 'none' }}
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
                ? 'text-red-400'
                : item.tone === 'ok'
                ? 'text-emerald-400'
                : item.tone === 'info'
                ? 'text-cyan-300'
                : 'text-gray-300';
            return (
              <div key={item.id} className="flex gap-2">
                <span className="text-gray-600 shrink-0 select-none">
                  {item.type === 'input' ? '>' : item.type === 'hint' ? '·' : '='}
                </span>
                <span className={`break-words ${toneColor}`}>{item.text}</span>
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
            {latestEntry.text}
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

        {/* Live Snaps / Ortho Badges in the history line (no key badge here) */}
        <div className="ml-auto flex items-center gap-2 shrink-0 text-[10px] border-l border-gray-800/60 pl-2">
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

      {/* Line 2: Interactive CAD Command Prompt Line */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 py-1.5 bg-[#080d14]">
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
          placeholder="Type command (L, C, S, T, ZE...) or coord (5000,1000)"
          className="flex-1 bg-transparent text-gray-100 placeholder-gray-500 outline-none font-mono text-xs selection:bg-cyan-500/30"
          spellCheck={false}
          autoComplete="off"
        />
        {keyInfo?.hasServiceAndInference && (
          <span
            onClick={keyInfo.onClick}
            className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider shrink-0 cursor-pointer hover:underline pr-1 hidden sm:inline"
            title="Service & inference active | Click to view key details"
          >
            ● Service &amp; Inference Enabled
          </span>
        )}
      </form>
    </div>
  );
};

export default CanvasTerminal;
