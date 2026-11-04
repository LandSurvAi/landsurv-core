import React, { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { parseCanvasCommand, executeCanvasCommand, describeCommand, type CommandContext, type CommandResult, type HelpGroup } from '../utils/canvasCommands';
import { CommandHelpView, type CommandReference } from './CommandHelpView';
import { AgentType, MessageRole, type ChatMessage } from '../types';
import { agentConfig, agentThemeColors } from '../constants/agents';
import { sanitizeZoningAnswer } from '../utils/zoningRender';
import { formatChatHtml } from '../utils/chatHtml';
import SuggestedQuestions from './SuggestedQuestions';
import { A2UISurface } from './A2UISurface';
import { ChatToolDialogs } from './ChatToolDialogs';
import type { DockableToolItem } from './AgentToolDock';
import {
  SendIcon,
  StopIcon,
  LightbulbIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronLeftIcon,
  DocumentDuplicateIcon,
  ArrowDownOnSquareIcon,
  SparklesIcon,
  LsvzIcon,
  XMarkIcon,
} from './icons';

export interface TerminalLink {
  label: string;
  onClick: () => void;
}

export type TerminalTone = 'normal' | 'ok' | 'error' | 'info' | 'warn' | 'command';

export interface TerminalEntry {
  id: string;
  type: 'input' | 'output' | 'hint' | 'status';
  text: string;
  timestamp: number;
  tone?: TerminalTone;
  /** Inline actions rendered after the message (open in editor, copy, …). */
  links?: TerminalLink[];
  /** Formatted help sections (HELP); when present they replace the plain text. */
  helpGroups?: HelpGroup[];
  helpNotes?: string[];
}

const MODEL_LABELS: Record<string, string> = {
  'gemini-3.7-flash': 'Gemini 3.7 Flash',
  'gemini-3.8-flash': 'Gemini 3.8 Flash',
  'gemini-4-argon': 'Gemini 4 Argon',
  'gemini-3.5-flash-lite': 'Gemini 3.5 Flash Lite',
  'claude-sonnet-5': 'Claude Sonnet 5',
  'claude-opus-5': 'Claude Opus 5',
  'claude-fable-5': 'Claude Fable 5',
};

function formatModelDisplay(id?: string): string {
  if (!id) return '';
  return MODEL_LABELS[id] || id;
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
  /** Agent draw + annotation cycle modes shown as links beside PROPERTIES. */
  agentDrawMode?: 'both' | 'points' | 'lines';
  agentAnnotMode?: 'both' | 'bearing' | 'distance';
  onCycleAgentDrawMode?: () => void;
  onCycleAgentAnnotMode?: () => void;
  /** Hand a command result to the app's full text editor, keeping its tone color
   *  and its formatted reference (HELP) so the editor renders the same cards. */
  onOpenTextEditor?: (content: string, tone?: TerminalTone, reference?: CommandReference) => void;
  /** Snaps and ortho status display */
  statusBadges?: {
    runningOsnaps?: string;
    osnapOverride?: string | null;
    isOrthoEnabled?: boolean;
  };
  /** Unified Agent Mode props (ported from ChatInterface) */
  activeAgent?: AgentType | null;
  messages?: ChatMessage[];
  onSendMessage?: (query: string) => void;
  onStopGenerating?: () => void;
  isLoading?: boolean;
  thinkingTime?: number;
  currentModelName?: string;
  suggestedQuestions?: string[];
  onToggleExpandMessage?: (msgIndex: number) => void;
  headerControls?: React.ReactNode;
  chatBarAccessories?: React.ReactNode;
  toolsRowAccessories?: React.ReactNode;
  /** Toggle the Agent Tool Dock when the current agent has dockable tools */
  hasDockableTools?: boolean;
  isToolDockOpen?: boolean;
  onToggleToolDock?: () => void;
  /** Optional external callback when the docked agent chat socket is toggled. */
  isAgentChatOpen?: boolean;
  onToggleAgentChat?: () => void;
  /** Key of the A2UI surface currently docked in the agent tool shelf. */
  dockedA2UIKey?: string | null;
  /** Toggle an A2UI surface between the chat feed and the agent tool shelf. */
  onToggleA2UIDock?: (message: ChatMessage) => void;
  /** Docked tool panels relevant to the active agent, rendered under the feed. */
  chatToolDialogs?: DockableToolItem[];
  /** Increment to pull the command bar's agent feed back open (e.g. Return to chat). */
  agentChatOpenSignal?: number;
  /** Reports the command bar height so the tool drawer can rest on its top edge. */
  onHeightChange?: (height: number) => void;
  /** Pixels to extend past the right edge, underneath the open agent tool shelf. */
  rightExtension?: number;
}

export const CanvasTerminal: React.FC<CanvasTerminalProps> = ({
  activePrompt,
  focusRequest,
  commandContext,
  onExecuteCommand,
  onOpenProperties,
  agentDrawMode = 'both',
  agentAnnotMode = 'both',
  onCycleAgentDrawMode,
  onCycleAgentAnnotMode,
  onOpenTextEditor,
  keyInfo,
  incomingMessage,
  statusBadges,
  activeAgent,
  messages = [],
  onSendMessage,
  onStopGenerating,
  isLoading = false,
  thinkingTime = 0,
  currentModelName,
  suggestedQuestions = [],
  onToggleExpandMessage,
  headerControls,
  chatBarAccessories,
  toolsRowAccessories,
  hasDockableTools = false,
  isToolDockOpen = false,
  onToggleToolDock,
  isAgentChatOpen = false,
  onToggleAgentChat,
  dockedA2UIKey,
  onToggleA2UIDock,
  chatToolDialogs = [],
  agentChatOpenSignal,
  onHeightChange,
  rightExtension = 0,
}) => {
  const [history, setHistory] = useState<TerminalEntry[]>([]);
  const [inputText, setInputText] = useState('');
  const [agentInputText, setAgentInputText] = useState('');
  const [inputMode, setInputMode] = useState<'cad' | 'agent'>('cad');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  // Single command line: rests as a lightweight "Press Space / Press ~" hint and becomes
  // the focused CAD or Agent input when Space, ~, or a click activates it.
  const [isCommandLineActive, setIsCommandLineActive] = useState(false);
  // History stays collapsed on load; expansion is a per-session action or auto-expands in Agent mode.
  const [isExpanded, setIsExpanded] = useState(false);
  // The agent command line can be pulled out of the bar and floated on the canvas.
  const [isAgentFloating, setIsAgentFloating] = useState(false);
  const [floatingPos, setFloatingPos] = useState({ x: 0, y: 0 });
  // The dock is portaled above every dialog, so it cannot use the command bar's
  // own box for positioning. Measure an in-bar anchor instead: that keeps the
  // glyph exactly in the bar's socket slot and the raised tab centered on it.
  const socketAnchorRef = useRef<HTMLDivElement | null>(null);
  const [agentDockPos, setAgentDockPos] = useState<{ left: number; top: number } | null>(null);
  const agentDragStateRef = useRef<{ pointerId: number; startX: number; startY: number; detached: boolean; offsetX: number; offsetY: number } | null>(null);
  const agentDragCleanupRef = useRef<(() => void) | null>(null);
  const floatDragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const floatingRef = useRef<HTMLDivElement | null>(null);
  // Suppress the socket's click-to-toggle right after a drag detaches the agent.
  const suppressAgentClickUntilRef = useRef(0);

  const [panelHeight, setPanelHeight] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem('landsurv-canvas-terminal-height'));
      return Number.isFinite(v) && v >= 100 && v <= 560 ? v : 240;
    } catch {
      return 240;
    }
  });
  // The drawer opens only as tall as its content needs; dragging the top handle
  // switches it to an explicit, remembered height.
  const [isUserSized, setIsUserSized] = useState<boolean>(() => {
    try {
      return Boolean(localStorage.getItem('landsurv-canvas-terminal-height'));
    } catch {
      return false;
    }
  });
  const [autoFeedHeight, setAutoFeedHeight] = useState(0);
  const feedContentRef = useRef<HTMLDivElement | null>(null);

  const MIN_AUTO_FEED_HEIGHT = 96;
  const MAX_AUTO_FEED_HEIGHT = 340;
  const effectiveFeedHeight = isUserSized
    ? panelHeight
    : Math.max(MIN_AUTO_FEED_HEIGHT, Math.min(MAX_AUTO_FEED_HEIGHT, autoFeedHeight || MIN_AUTO_FEED_HEIGHT));

  // Pulsing indicator on the border-mounted drawer handle when Help expands the command line
  const [isCollapsePulsing, setIsCollapsePulsing] = useState(false);
  // Quick-thought notifications are dismissible until the next agent prompt.
  const [dismissedThoughtKey, setDismissedThoughtKey] = useState<string | null>(null);

  // Command history navigation with Up/Down arrows
  const commandHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const agentInputRef = useRef<HTMLInputElement | null>(null);
  const terminalRootRef = useRef<HTMLDivElement | null>(null);
  const historyScrollRef = useRef<HTMLDivElement | null>(null);
  const agentFeedScrollRef = useRef<HTMLDivElement | null>(null);
  const latestAgentMessageRef = useRef<HTMLDivElement | null>(null);
  const lastAgentFeedCountRef = useRef(0);
  const lastAgentFeedRoleRef = useRef<MessageRole | null>(null);
  const wasAgentFeedExpandedRef = useRef(false);
  const wasToolDockOpenRef = useRef(isToolDockOpen);
  const wasAgentChatOpenRef = useRef(isAgentChatOpen);
  const handledAgentChatOpenSignalRef = useRef(agentChatOpenSignal ?? 0);

  // Top border resize handle for expanded history
  const isResizingRef = useRef(false);
  const resizeStartRef = useRef<{ clientY: number; origHeight: number }>({ clientY: 0, origHeight: 0 });

  // Resolve the active agent (defaults to the LSAI project assistant).
  const effectiveAgent = activeAgent || AgentType.LSVZ_AGENT;
  const isSpecialistPluggedIn = effectiveAgent !== AgentType.LSVZ_AGENT;
  const agentMeta = agentConfig[effectiveAgent];
  const agentLabel = effectiveAgent === AgentType.LSVZ_AGENT
    ? 'LSAI Agent'
    : (agentMeta?.label || effectiveAgent);
  const AgentIcon = agentMeta?.icon || LsvzIcon;
  const accentColor = agentThemeColors[effectiveAgent] || '#38bdf8';
  const modelLabel = formatModelDisplay(currentModelName);

  // Auto-dismiss collapse pulse after 15s if untouched
  useEffect(() => {
    if (!isCollapsePulsing) return;
    const timer = window.setTimeout(() => {
      setIsCollapsePulsing(false);
    }, 15000);
    return () => clearTimeout(timer);
  }, [isCollapsePulsing]);

  const activateCommandLine = useCallback(() => {
    setInputMode('cad');
    setIsCommandLineActive(true);
    inputRef.current?.focus();
  }, []);

  const activateAgentMode = useCallback(() => {
    setInputMode('agent');
    setIsCommandLineActive(true);
    // When the agent line is floating, keep the drawer shut and focus the float.
    if (!isAgentFloating) setIsExpanded(true);
    agentInputRef.current?.focus();
  }, [isAgentFloating]);

  // Opens the agent conversation without requiring a second click, optionally at a
  // larger height (used by the thought bubble above the agent socket).
  const openAgentConversation = useCallback((enlarge = false) => {
    setInputMode('agent');
    setIsCommandLineActive(true);
    setIsExpanded(true);
    if (enlarge) {
      setIsUserSized(true);
      setPanelHeight(prev => Math.max(prev, 380));
    }
    window.setTimeout(() => agentInputRef.current?.focus(), 0);
  }, []);

  const isBottomAgentChatOpen = isExpanded && inputMode === 'agent' && !isAgentFloating;

  const toggleBottomAgentChat = useCallback(() => {
    if (isAgentFloating) {
      setIsAgentFloating(false);
      setInputMode('agent');
      setIsCommandLineActive(true);
      setIsExpanded(true);
      window.setTimeout(() => agentInputRef.current?.focus(), 0);
      return;
    }
    if (isExpanded && inputMode === 'agent') {
      setIsExpanded(false);
      setIsCollapsePulsing(false);
      return;
    }
    setInputMode('agent');
    setIsCommandLineActive(true);
    setIsExpanded(true);
    window.setTimeout(() => agentInputRef.current?.focus(), 0);
  }, [isAgentFloating, isExpanded, inputMode]);

  // A panel opening in the tool shelf takes precedence over the lower chat
  // drawer. Collapse the feed only on the closed -> open transition, so the
  // user can still reopen chat from the thought bubble while the shelf is up.
  useEffect(() => {
    if (isToolDockOpen && !wasToolDockOpenRef.current) {
      setIsExpanded(false);
      setIsCollapsePulsing(false);
    }
    wasToolDockOpenRef.current = isToolDockOpen;
  }, [isToolDockOpen]);

  // The left agent-chat shelf carries the conversation on its own; when it is
  // pulled open, fold the bottom feed so the same thread does not render twice.
  useEffect(() => {
    if (isAgentChatOpen && !wasAgentChatOpenRef.current) {
      setIsExpanded(false);
      setIsCollapsePulsing(false);
    }
    wasAgentChatOpenRef.current = isAgentChatOpen;
  }, [isAgentChatOpen]);

  // The shelf's "Return to chat" hands the A2UI surface back to the feed.
  // The handled-value ref keeps a remount from replaying an old return request.
  useEffect(() => {
    const signal = agentChatOpenSignal ?? 0;
    if (!signal || signal === handledAgentChatOpenSignalRef.current) return;
    handledAgentChatOpenSignalRef.current = signal;
    openAgentConversation(true);
  }, [agentChatOpenSignal, openAgentConversation]);

  // Command hand-off: after a command finishes with canvas picks, put the caret
  // back on the command line so the next command can be typed without Space.
  useEffect(() => {
    if (!focusRequest) return;
    setInputMode('cad');
    setIsCommandLineActive(true);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [focusRequest]);

  // Space activates deterministic CAD mode; ~ or ` activates Agent mode.
  useEffect(() => {
    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'SELECT' || tag === 'A' || target?.isContentEditable;

      if (e.key === '~' || e.key === '`') {
        // Allow pressing ~ inside an empty CAD command input to switch directly into Agent mode
        const isEmptyCadInput = target === inputRef.current && !inputText.trim();
        if (isEditable && !isEmptyCadInput) return;
        e.preventDefault();
        activateAgentMode();
        return;
      }

      if (e.key === ' ' || e.code === 'Space') {
        if (isEditable) return;
        e.preventDefault();
        activateCommandLine();
      }
    };
    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [activateCommandLine, activateAgentMode, inputText]);

  // Focus the active input as soon as it mounts/switches mode.
  useEffect(() => {
    if (!isCommandLineActive) return;
    if (inputMode === 'agent') {
      agentInputRef.current?.focus();
    } else {
      inputRef.current?.focus();
    }
  }, [isCommandLineActive, inputMode]);

  // Auto-expand Agent Mode feed when an agent starts streaming, asks clarifying questions, or presents an A2UI surface.
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const hasPendingQuestionOptions = Boolean(lastMessage?.questionOptions && lastMessage.questionOptions.length > 0);
  const hasActiveA2UI = Boolean(
    lastMessage?.a2ui &&
      lastMessage.a2ui.status !== 'completed' &&
      lastMessage.a2ui.status !== 'dismissed'
  );
  // Not every agent emits structured `questionOptions`; LSAI sometimes answers
  // with a numbered choice list in prose. Treat that as a pending question too,
  // otherwise the agent silently starts a Q&A in the open feed with no
  // notification at the socket.
  const inlinePromptText = lastMessage?.result || lastMessage?.text || '';
  const hasInlineQuestionPrompt = Boolean(
    lastMessage?.role === MessageRole.MODEL &&
    !hasPendingQuestionOptions &&
    !hasActiveA2UI &&
    /\b(?:let me know|which|choose|select|specify|tell me)\b/i.test(inlinePromptText) &&
    /\b1\.\s[\s\S]*\b2\.\s/.test(inlinePromptText)
  );
  // Questions (option pills), numbered prose choices, and active A2UI prompts
  // all need a deliberate response, so each raises a thought bubble above the
  // agent socket.
  const hasPendingPrompt = hasPendingQuestionOptions || hasActiveA2UI || hasInlineQuestionPrompt;
  const pendingOptions = lastMessage?.questionOptions ?? [];
  const thoughtKey = lastMessage
    ? `${effectiveAgent}:${messages.length}:${lastMessage.role}:${pendingOptions.join('|')}:${lastMessage.a2ui?.widgetType ?? ''}:${lastMessage.a2ui?.status ?? ''}`
    : null;
  const isThoughtDismissed = thoughtKey !== null && dismissedThoughtKey === thoughtKey;
  const thoughtText = (lastMessage?.result || lastMessage?.text || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
  const thoughtPreview = thoughtText.length > 160
    ? `${thoughtText.slice(0, 157).trimEnd()}…`
    : thoughtText;
  const hasExpandedA2UIWidget = Boolean(
    messages.some(
      m => m.a2ui?.kind === 'upload-widget' && m.a2ui.status !== 'completed' && m.a2ui.status !== 'dismissed'
    )
  );
  const scrollAgentFeedToMessageStart = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const feed = agentFeedScrollRef.current;
    const message = latestAgentMessageRef.current;
    if (!feed || !message) return;
    const top = Math.max(
      0,
      feed.scrollTop + message.getBoundingClientRect().top - feed.getBoundingClientRect().top - 6
    );
    try {
      if (typeof feed.scrollTo === 'function') feed.scrollTo({ top, behavior });
      else feed.scrollTop = top;
    } catch {
      feed.scrollTop = top;
    }
  }, []);

  const scrollAgentFeedToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const feed = agentFeedScrollRef.current;
    if (!feed) return;
    try {
      if (typeof feed.scrollTo === 'function') feed.scrollTo({ top: feed.scrollHeight, behavior });
      else feed.scrollTop = feed.scrollHeight;
    } catch {
      feed.scrollTop = feed.scrollHeight;
    }
  }, []);

  // When a new tool dialog becomes available, bring it into view at the end of
  // the conversation rather than leaving it below the fold.
  const chatToolDialogKey = chatToolDialogs.map(item => item.id).join('|');
  const previousChatToolDialogKeyRef = useRef('');
  useEffect(() => {
    const previousKey = previousChatToolDialogKeyRef.current;
    previousChatToolDialogKeyRef.current = chatToolDialogKey;
    if (!chatToolDialogKey || chatToolDialogKey === previousKey) return;
    if (!isExpanded || inputMode !== 'agent' || isAgentFloating) return;
    const frame = window.requestAnimationFrame(() => scrollAgentFeedToBottom());
    return () => window.cancelAnimationFrame(frame);
  }, [chatToolDialogKey, isExpanded, inputMode, isAgentFloating, scrollAgentFeedToBottom]);

  // Anchor the first line of a newly arrived agent result instead of chasing every
  // streaming update to the bottom. The user can then read from the beginning at
  // their own pace without the feed yanking them past the start of the answer.
  useEffect(() => {
    if (!isExpanded || inputMode !== 'agent' || isAgentFloating) return;
    const previousCount = lastAgentFeedCountRef.current;
    const previousRole = lastAgentFeedRoleRef.current;
    lastAgentFeedCountRef.current = messages.length;
    lastAgentFeedRoleRef.current = lastMessage?.role ?? null;

    if (!wasAgentFeedExpandedRef.current) {
      wasAgentFeedExpandedRef.current = true;
      if (messages.length > 0) scrollAgentFeedToMessageStart('auto');
      return;
    }

    if (messages.length > previousCount && lastMessage) {
      if (lastMessage.role === MessageRole.USER) {
        scrollAgentFeedToBottom();
      } else if (lastMessage.role === MessageRole.MODEL && previousRole !== MessageRole.MODEL) {
        scrollAgentFeedToMessageStart();
      }
    }
  }, [
    messages,
    lastMessage,
    isExpanded,
    inputMode,
    isAgentFloating,
    scrollAgentFeedToBottom,
    scrollAgentFeedToMessageStart,
  ]);

  useEffect(() => {
    if (!isExpanded || inputMode !== 'agent') wasAgentFeedExpandedRef.current = false;
  }, [isExpanded, inputMode]);

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
    const resultTone: TerminalTone = result.status === 'error' ? 'error' : result.status === 'ok' ? 'ok' : 'info';
    for (const link of result.links ?? []) {
      if (link.action === 'open-text-editor' && onOpenTextEditor) {
        const content = link.payload ?? result.message;
        links.push({
          label: link.label ?? 'Open in Text Editor',
          onClick: () => onOpenTextEditor(
            content,
            resultTone,
            result.helpGroups?.length ? { groups: result.helpGroups, notes: result.helpNotes, text: content } : undefined,
          ),
        });
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
    setInputMode('cad');
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
      setInputMode('cad');
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

  const handleAgentSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = agentInputText.trim();
    if (!q || isLoading) return;
    onSendMessage?.(q);
    setAgentInputText('');
    setShowSuggestions(false);
    setIsExpanded(true);
  };

  const handleCopyConversation = useCallback(async () => {
    const stripHtml = (s: string) => s.replace(/<br\s*\/?>(\s*)/gi, '\n').replace(/<[^>]+>/g, '');
    const lines: string[] = [];
    lines.push('# LandSurv.ai Conversation Export');
    lines.push(`Agent: ${agentLabel} (${effectiveAgent})`);
    lines.push(`Exported: ${new Date().toISOString()}`);
    lines.push(`Messages: ${messages.length}`);
    lines.push('');
    messages.forEach((msg, i) => {
      const role = msg.role === MessageRole.USER ? 'USER' : 'ASSISTANT';
      lines.push(`## [${i + 1}] ${role}`);
      if (msg.thinking) {
        lines.push('<details><summary>thinking</summary>');
        lines.push('');
        lines.push(stripHtml(msg.thinking));
        lines.push('');
        lines.push('</details>');
      }
      const body = msg.result || msg.text || '';
      lines.push(stripHtml(body));
      lines.push('');
    });
    const text = lines.join('\n');
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
    setTimeout(() => setCopyStatus('idle'), 1800);
  }, [messages, agentLabel, effectiveAgent]);

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
      } else if (activePrompt) {
        // An in-progress canvas command owns this Escape; keep the line open so
        // Space / ~ really is the last thing Escape dismisses.
        commandContext.onCancel?.();
      } else {
        // Closing the line hands the canvas back in Selection mode.
        setIsCommandLineActive(false);
        commandContext.onCancel?.();
        commandContext.onActivateSelectionMode?.();
        if (isExpanded) {
          setIsExpanded(false);
          setIsCollapsePulsing(false);
        }
      }
    }
  };

  const handleKeyDownAgentInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (showSuggestions) {
        setShowSuggestions(false);
        return;
      }
      if (agentInputText) {
        setAgentInputText('');
      } else if (activePrompt) {
        // Same rule for the agent line: cancel the live canvas command first.
        commandContext.onCancel?.();
      } else {
        setIsCommandLineActive(false);
        setInputMode('cad');
        commandContext.onActivateSelectionMode?.();
        if (isExpanded) {
          setIsExpanded(false);
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
    const startHeight = isUserSized ? panelHeight : effectiveFeedHeight;
    if (!isUserSized) setPanelHeight(startHeight);
    setIsUserSized(true);
    resizeStartRef.current = { clientY: e.clientY, origHeight: startHeight };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const handleResizePointerMove = (e: React.PointerEvent) => {
    if (!isResizingRef.current) return;
    const dy = resizeStartRef.current.clientY - e.clientY;
    const newHeight = Math.max(100, Math.min(560, resizeStartRef.current.origHeight + dy));
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

  // Auto scroll expanded CAD history to bottom
  useEffect(() => {
    if (isExpanded && inputMode === 'cad' && historyScrollRef.current) {
      historyScrollRef.current.scrollTop = historyScrollRef.current.scrollHeight;
    }
  }, [history, isExpanded, inputMode]);

  // Find latest entry to display in the persistent single-line history/status row
  const latestEntry = history.length > 0 ? history[history.length - 1] : null;
  const historyNavText = historyIndexRef.current >= 0 && commandHistoryRef.current[historyIndexRef.current]
    ? `^ [${historyIndexRef.current + 1}/${commandHistoryRef.current.length}] ${commandHistoryRef.current[historyIndexRef.current]}`
    : null;

  // Latest agent message preview for single-line status when in agent mode
  const latestAgentPreview = lastMessage
    ? (lastMessage.result || lastMessage.text || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    : '';

  // Live feedback for the command being typed: canonical verb + description,
  // or an "unknown" chip when the alias does not resolve.
  const parsedPreview = inputText.trim() ? parseCanvasCommand(inputText) : null;
  const previewDescription = parsedPreview ? describeCommand(parsedPreview.verb) : undefined;

  // Measure the feed content so an un-resized drawer is exactly as tall as what
  // it shows (a single question, one answer) instead of a fixed 240px block.
  useLayoutEffect(() => {
    if (!isExpanded) return;
    const el = feedContentRef.current;
    if (!el) return;
    const verticalPadding = inputMode === 'cad' ? 16 : 24; // container py-2 / py-3
    const measure = () => setAutoFeedHeight(el.getBoundingClientRect().height + verticalPadding);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isExpanded, inputMode, messages, history, isLoading, showSuggestions, hasPendingQuestionOptions, hasActiveA2UI]);

  const clampFloatingPosition = useCallback((x: number, y: number) => {
    const el = floatingRef.current;
    const width = el?.offsetWidth ?? 540;
    const height = el?.offsetHeight ?? 150;
    const margin = 8;
    // Guard against synthetic/partial pointer events that omit coordinates.
    const nextX = Number.isFinite(x) ? x : margin;
    const nextY = Number.isFinite(y) ? y : margin;
    return {
      x: Math.max(margin, Math.min(nextX, Math.max(margin, window.innerWidth - width - margin))),
      y: Math.max(margin, Math.min(nextY, Math.max(margin, window.innerHeight - height - margin))),
    };
  }, []);

  const detachAgentTo = (x: number, y: number) => {
    setIsAgentFloating(true);
    setInputMode('agent');
    setIsCommandLineActive(true);
    setIsExpanded(false);
    setFloatingPos(clampFloatingPosition(x, y));
  };

  const dockAgentBack = () => {
    setIsAgentFloating(false);
    setInputMode('agent');
    setIsCommandLineActive(true);
    setIsExpanded(true);
  };

  // Drag the agent glyph/tab. Past the threshold the agent detaches, and the
  // floating line keeps tracking this same pointer until release — you never
  // have to let go and re-grab the dialog. Tracking lives on window listeners
  // because detaching collapses the drawer, which unmounts the source button
  // (the socket stays mounted, the tab does not).
  const handleAgentDragStart = (e: React.PointerEvent) => {
    if (typeof e.button === 'number' && e.button !== 0) return;

    agentDragCleanupRef.current?.();
    const state = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      detached: false,
      offsetX: 0,
      offsetY: 0,
    };
    agentDragStateRef.current = state;

    const handleMove = (ev: PointerEvent) => {
      const current = agentDragStateRef.current;
      if (!current || ev.pointerId !== current.pointerId) return;
      // Fall back to the last known point when a pointer event has no coords.
      const px = Number.isFinite(ev.clientX) ? ev.clientX : current.startX;
      const py = Number.isFinite(ev.clientY) ? ev.clientY : current.startY;

      if (!current.detached) {
        if (Math.hypot(px - current.startX, py - current.startY) < 14) return;
        current.detached = true;
        suppressAgentClickUntilRef.current = Date.now() + 400;
        const width = floatingRef.current?.offsetWidth ?? 540;
        const height = floatingRef.current?.offsetHeight ?? 150;
        const x = Math.max(8, Math.min(px - Math.min(width / 2, 200), Math.max(8, window.innerWidth - width - 8)));
        const y = Math.max(8, Math.min(py - 26, Math.max(8, window.innerHeight - height - 8)));
        current.offsetX = px - x;
        current.offsetY = py - y;
        detachAgentTo(x, y);
        return;
      }

      // Keep the floater glued to the pointer for the rest of this drag.
      ev.preventDefault();
      setFloatingPos(clampFloatingPosition(px - current.offsetX, py - current.offsetY));
    };

    const handleUp = () => {
      agentDragStateRef.current = null;
      agentDragCleanupRef.current = null;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };

    agentDragCleanupRef.current = handleUp;
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  };

  useEffect(() => () => { agentDragCleanupRef.current?.(); }, []);

  const updateAgentDockPosition = useCallback(() => {
    const anchor = socketAnchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    // jsdom (and a hidden bar) reports a zero box; keep the CSS fallback then.
    if (!rect.width && !rect.height) return;
    setAgentDockPos(prev => (
      prev && Math.abs(prev.left - rect.left) < 0.5 && Math.abs(prev.top - rect.top) < 0.5
        ? prev
        : { left: rect.left, top: rect.top }
    ));
  }, []);

  useLayoutEffect(() => {
    updateAgentDockPosition();
    window.addEventListener('resize', updateAgentDockPosition);
    const root = terminalRootRef.current;
    const observer = typeof ResizeObserver !== 'undefined' && root
      ? new ResizeObserver(updateAgentDockPosition)
      : null;
    if (root && observer) observer.observe(root);
    return () => {
      window.removeEventListener('resize', updateAgentDockPosition);
      observer?.disconnect();
    };
  }, [updateAgentDockPosition]);

  // Report the bar's height (including an expanded feed) so the agent tool
  // drawer can sit with its bottom edge exactly on the top of the command bar.
  useEffect(() => {
    const el = terminalRootRef.current;
    if (!el || !onHeightChange) return;
    const report = () => onHeightChange(el.getBoundingClientRect().height);
    report();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', report);
      return () => window.removeEventListener('resize', report);
    }
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [onHeightChange]);

  const handleFloatPointerDown = (e: React.PointerEvent) => {
    if (typeof e.button === 'number' && e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    floatDragRef.current = { offsetX: e.clientX - floatingPos.x, offsetY: e.clientY - floatingPos.y };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch { /* ignore */ }
  };

  const handleFloatPointerMove = (e: React.PointerEvent) => {
    const drag = floatDragRef.current;
    if (!drag) return;
    const px = Number.isFinite(e.clientX) ? e.clientX : floatingPos.x + drag.offsetX;
    const py = Number.isFinite(e.clientY) ? e.clientY : floatingPos.y + drag.offsetY;
    setFloatingPos(clampFloatingPosition(px - drag.offsetX, py - drag.offsetY));
  };

  const handleFloatPointerUp = (e: React.PointerEvent) => {
    if (!floatDragRef.current) return;
    floatDragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch { /* ignore */ }
  };

  const latestAgentMessage = lastMessage && lastMessage.role === MessageRole.MODEL ? lastMessage : null;

  // The terminal sits inside the canvas viewport, whose wheel handler zooms the
  // drawing. Keep wheel events here so scrolling the command history (or just
  // hovering the command line) never changes the scene scale.
  return (
    <div
      ref={terminalRootRef}
      style={{ touchAction: 'none', right: -rightExtension }}
      onWheel={e => e.stopPropagation()}
      className="absolute bottom-0 left-0 right-0 z-30 select-none bg-[#080d14] shadow-[0_-8px_24px_rgba(0,0,0,0.7)] backdrop-blur-md font-mono text-gray-200 overflow-visible flex flex-col transition-colors"
      data-mode={inputMode}
    >
      {/* Top accent line — always the active agent color, matching its socket glyph. */}
      <div
        className="h-[1px] w-full pointer-events-none"
        style={{ backgroundColor: accentColor }}
      />

      {/* Right-mounted drawer handle. In the workspace it opens/closes the right
          Agent Tool Shelf; in standalone CAD mode (or when Help expands the command
          line) it toggles the command bar drawer. */}
      <button
        type="button"
        data-no-drag
        data-testid="command-bar-expand-handle"
        onClick={() => {
          if (onToggleToolDock && !(isCollapsePulsing && isExpanded)) {
            onToggleToolDock();
            return;
          }
          toggleExpand();
        }}
        aria-expanded={onToggleToolDock && !(isCollapsePulsing && isExpanded) ? isToolDockOpen : isExpanded}
        aria-label={
          onToggleToolDock && !(isCollapsePulsing && isExpanded)
            ? (isToolDockOpen ? 'Close agent tool shelf' : 'Open agent tool shelf')
            : (isExpanded ? 'Hide / Collapse command line' : 'Expand command line')
        }
        title={
          onToggleToolDock && !(isCollapsePulsing && isExpanded)
            ? (isToolDockOpen ? `Close ${agentLabel} tool shelf` : `Open ${agentLabel} tool shelf`)
            : (isExpanded ? 'Collapse command line' : 'Expand command line')
        }
        className={`group absolute right-4 top-0 z-50 flex h-[20px] w-10 -translate-y-1/2 items-center justify-center rounded-full border bg-[#0a111b] shadow-[0_4px_14px_rgba(0,0,0,0.75)] transition-all duration-200 hover:scale-105 hover:brightness-125 active:scale-95 ${
          isCollapsePulsing && isExpanded ? 'animate-pulse ring-2 ring-cyan-400/50' : ''
        }`}
        style={{
          borderColor: (onToggleToolDock ? isToolDockOpen : isExpanded) ? accentColor : `${accentColor}80`,
          color: accentColor,
          boxShadow: (onToggleToolDock ? isToolDockOpen : isExpanded)
            ? `0 4px 14px rgba(0,0,0,0.75), 0 0 14px ${accentColor}38, inset 0 1px 0 ${accentColor}33`
            : `0 4px 14px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.08)`,
        }}
      >
        {(onToggleToolDock && !(isCollapsePulsing && isExpanded) ? isToolDockOpen : isExpanded)
          ? <ChevronDownIcon className="h-3.5 w-3.5 transition-transform duration-200" />
          : <ChevronUpIcon className="h-3.5 w-3.5 transition-transform duration-200" />}
      </button>

      {/* Top resize handle when history / agent feed is expanded */}
      {isExpanded && (
        <div
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          onPointerCancel={handleResizePointerUp}
          className="h-1.5 w-full cursor-ns-resize bg-cyan-500/30 hover:bg-cyan-400/60 transition-colors"
          title="Drag up/down to adjust command bar height"
        />
      )}

      {/* Expanded Drawer Header Bar (Mode Switcher + Agent Controls & Accessories) */}
      {isExpanded && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] bg-[#0a1019] px-3 py-1.5 font-sans text-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Mode Tabs: CAD History vs Agent Feed */}
            <div className="inline-flex items-center rounded-md border border-white/[0.08] bg-black/40 p-0.5">
              <button
                type="button"
                onClick={() => setInputMode('cad')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  inputMode === 'cad'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                CAD [Space]
              </button>
              <button
                type="button"
                data-testid="agent-tab"
                onClick={() => (isAgentFloating ? dockAgentBack() : activateAgentMode())}
                onPointerDown={handleAgentDragStart}
                title="Agent command line — drag out of the bar to float it"
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1 cursor-grab active:cursor-grabbing ${
                  inputMode === 'agent'
                    ? 'text-white border'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                style={
                  inputMode === 'agent'
                    ? { backgroundColor: `${accentColor}26`, borderColor: `${accentColor}66`, color: accentColor }
                    : undefined
                }
              >
                <AgentIcon className="w-3 h-3 shrink-0" style={{ color: accentColor }} />
                <span className="truncate max-w-[140px]">{agentLabel} [~]</span>
                <span aria-hidden="true" className="text-[9px] leading-none text-slate-500">⠿</span>
              </button>
            </div>

            {inputMode === 'agent' && (
              <>
                {isLoading && (
                  <span
                    className="flex items-center gap-1 rounded-md border px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-[0.12em]"
                    style={{ borderColor: `${accentColor}40`, color: accentColor, backgroundColor: `${accentColor}14` }}
                  >
                    <span className="h-1.5 w-1.5 animate-pulse rounded-sm" style={{ backgroundColor: accentColor }} />
                    Working ({(thinkingTime / 1000).toFixed(1)}s)
                  </span>
                )}
                <span className="hidden md:inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  <span>Model:</span>
                  <span className="text-slate-300">{modelLabel || 'Auto'}</span>
                </span>
              </>
            )}
          </div>

          {/* Right-side Agent Header Controls, Accessories & Tool Dock Toggle */}
          <div className="flex items-center gap-1.5 flex-wrap pr-12">
            {inputMode === 'agent' && chatBarAccessories}
            {inputMode === 'agent' && toolsRowAccessories}
            {hasDockableTools && onToggleToolDock && (
              <button
                type="button"
                onClick={onToggleToolDock}
                className={`inline-flex h-6 items-center gap-1.5 rounded border px-2 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors ${
                  isToolDockOpen
                    ? 'bg-white/[0.08]'
                    : 'border-white/[0.08] bg-white/[0.03] hover:border-white/[0.16] hover:bg-white/[0.06]'
                }`}
                style={{
                  color: accentColor,
                  borderColor: isToolDockOpen ? accentColor : undefined,
                }}
                title={isToolDockOpen ? 'Hide Agent Tools Dock' : 'Open Agent Tools Dock'}
              >
                <span>{isToolDockOpen ? 'Hide Tools' : 'Agent Tools'}</span>
              </button>
            )}
            {inputMode === 'agent' && headerControls}
            {inputMode === 'agent' && (
              <button
                type="button"
                onClick={handleCopyConversation}
                disabled={messages.length === 0}
                className={`flex h-6 w-6 items-center justify-center rounded border border-white/[0.08] bg-white/[0.03] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  copyStatus === 'copied'
                    ? 'text-emerald-400 border-emerald-500/40'
                    : copyStatus === 'error'
                    ? 'text-red-400 border-red-500/40'
                    : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'
                }`}
                title={copyStatus === 'copied' ? 'Copied!' : copyStatus === 'error' ? 'Copy failed' : 'Copy conversation'}
              >
                <DocumentDuplicateIcon className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={toggleExpand}
              className="flex h-6 w-6 items-center justify-center rounded border border-white/[0.08] bg-white/[0.03] text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-100"
              title="Collapse command drawer"
              aria-label="Hide / Collapse command line"
            >
              <ChevronDownIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Expanded Multi-line Area: CAD History OR Agent Conversation Feed */}
      {isExpanded && inputMode === 'cad' && (
        <div
          ref={historyScrollRef}
          style={{ height: `${effectiveFeedHeight}px` }}
          className="overflow-y-auto px-3 py-2 bg-[#05080d]/95 border-b border-gray-800/80 text-[11px] leading-relaxed select-text"
        >
          <div ref={feedContentRef} className="space-y-1">
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
                        <CommandHelpView groups={item.helpGroups} notes={item.helpNotes} showCaption className="mt-1" />
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
        </div>
      )}

      {/* Expanded Agent Mode Conversation Feed (All ChatInterface capabilities preserved) */}
      {isExpanded && inputMode === 'agent' && !isAgentFloating && (
        <div
          ref={agentFeedScrollRef}
          style={{ height: `${hasExpandedA2UIWidget ? Math.max(effectiveFeedHeight, 380) : effectiveFeedHeight}px` }}
          className="overflow-y-auto px-3.5 py-3 bg-[#05080d]/95 border-b border-gray-800/80 font-sans text-xs leading-relaxed select-text"
        >
          <div ref={feedContentRef} className="space-y-3">
          {messages.length === 0 && !isLoading && (
            <div className="flex min-h-[150px] flex-col items-center justify-center px-4 text-center">
              <div
                className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03]"
                style={{ boxShadow: `inset 0 0 0 1px ${accentColor}28` }}
              >
                <AgentIcon className="h-5 w-5" style={{ color: accentColor }} />
              </div>
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">
                {isSpecialistPluggedIn ? 'Specialist Agent' : 'Project Assistant'}
              </p>
              <h3 className="mt-1 text-sm font-semibold text-slate-100">{agentLabel}</h3>
              <p className="mt-0.5 max-w-md text-[11px] text-slate-400">
                {isSpecialistPluggedIn
                  ? 'Type below to work directly with this agent. Use the arrow on the right to open the tool shelf, or choose another agent from the side menu.'
                  : 'Ask anything about this project. I will handle the work directly or bring in the right specialist for you.'}
              </p>
              {suggestedQuestions.length > 0 && (
                <div className="mt-3 flex flex-wrap justify-center gap-1.5 max-w-2xl">
                  {suggestedQuestions.slice(0, 4).map(question => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => onSendMessage?.(question)}
                      className="rounded-md border border-white/[0.08] bg-white/[0.025] px-2.5 py-1 text-left text-[11px] text-slate-300 transition-colors hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {messages.map((msg, index) => (
            <div
              key={index}
              ref={index === messages.length - 1 ? latestAgentMessageRef : undefined}
              className={`flex min-w-0 flex-col gap-1 ${msg.role === MessageRole.USER ? 'items-end' : 'items-start'}`}
            >
              <span className="px-1 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
                {msg.role === MessageRole.USER ? 'You' : agentLabel}
              </span>
              <div
                className={`min-w-0 max-w-[94%] md:max-w-3xl p-2.5 rounded-lg overflow-hidden ${
                  msg.role === MessageRole.USER
                    ? 'bg-[#1a2431] text-slate-100 rounded-br-none border border-white/[0.08]'
                    : 'bg-[#0f1620] text-slate-200 rounded-bl-none border border-white/[0.07]'
                }`}
              >
                {msg.role === MessageRole.MODEL && formatModelDisplay(msg.model || currentModelName) && (
                  <div className="mb-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide bg-purple-900/30 text-purple-300 border border-purple-500/20">
                    <SparklesIcon className="w-3 h-3 text-purple-400" />
                    <span>{formatModelDisplay(msg.model || currentModelName)}</span>
                  </div>
                )}
                {msg.thinking && (
                  <div className="mb-2">
                    <button
                      type="button"
                      onClick={() => onToggleExpandMessage?.(index)}
                      className="flex items-center gap-1 text-xs text-gray-400 font-semibold mb-1 hover:text-gray-200"
                    >
                      {msg.isExpanded ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
                      AI&apos;s Thought Process
                    </button>
                    {msg.isExpanded && (
                      <p
                        className="text-xs text-gray-400 border-l-2 border-gray-500 pl-2"
                        dangerouslySetInnerHTML={{ __html: formatChatHtml(msg.thinking) }}
                      />
                    )}
                  </div>
                )}
                <div
                  className="text-[12.5px] leading-relaxed break-words [overflow-wrap:anywhere] [&>*]:max-w-full [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_code]:break-words [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto"
                  dangerouslySetInnerHTML={{
                    __html: (() => {
                      const raw = msg.result || msg.text || '';
                      if (effectiveAgent === AgentType.ZONING_AGENT && msg.role === MessageRole.MODEL) {
                        const cleaned = sanitizeZoningAnswer(raw);
                        if (!cleaned) {
                          return '<span class="text-gray-500 italic">Researching live ordinance… (see Claw status)</span>';
                        }
                        return formatChatHtml(cleaned);
                      }
                      return formatChatHtml(raw);
                    })(),
                  }}
                />

                {/* A2UI Interactive Upload / Intake Surface */}
                {msg.a2ui && (() => {
                  const a2ui = msg.a2ui;
                  if (!a2ui || a2ui.kind === 'intake-prompt') return null;
                  const a2uiKey = `${a2ui.agent}:${a2ui.widgetType}`;
                  const isDocked = a2ui.kind === 'upload-widget' && a2uiKey === dockedA2UIKey;
                  if (isDocked) {
                    return (
                      <div
                        data-testid="a2ui-docked-placeholder"
                        className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[11px] text-cyan-200"
                      >
                        <span className="inline-flex items-center gap-1.5 font-semibold">
                          <ArrowDownOnSquareIcon className="h-3.5 w-3.5" />
                          Docked in Agent Tools
                        </span>
                        <button
                          type="button"
                          onClick={() => onToggleA2UIDock?.(msg)}
                          className="shrink-0 rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-cyan-300 transition-colors hover:border-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-100"
                        >
                          Return to chat
                        </button>
                      </div>
                    );
                  }
                  return (
                    <A2UISurface
                      payload={a2ui}
                      onDock={a2ui.kind === 'upload-widget' && onToggleA2UIDock ? () => {
                        onToggleA2UIDock(msg);
                        setIsExpanded(false);
                        setIsCollapsePulsing(false);
                      } : undefined}
                    />
                  );
                })()}

                {/* Interactive clarifying question options */}
                {msg.questionOptions && msg.questionOptions.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-gray-700/60">
                    <div className="text-[11px] font-semibold text-gray-400 mb-1.5 flex items-center gap-1.5">
                      <LightbulbIcon className="w-3.5 h-3.5 text-yellow-400" />
                      <span>Select an option:</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {msg.questionOptions.map((opt, optIdx) => (
                        <button
                          key={optIdx}
                          type="button"
                          onClick={() => onSendMessage?.(opt)}
                          disabled={isLoading}
                          className="text-xs px-3 py-1.5 rounded-md font-medium text-left transition-all bg-fuchsia-950/40 text-fuchsia-200 border border-fuchsia-500/40 hover:bg-fuchsia-900/60 hover:border-fuchsia-400 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Grounding sources */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-gray-600">
                    <details className="group">
                      <summary className="cursor-pointer text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                        <span>View Sources ({msg.sources.length} page{msg.sources.length !== 1 ? 's' : ''})</span>
                      </summary>
                      <div className="mt-1.5 space-y-1">
                        {msg.sources.map((source: any, idx: number) => (
                          <div key={idx} className="text-xs">
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 hover:underline inline-flex items-center gap-1"
                            >
                              <span>{source.searchTitle || source.url?.split('/').pop() || 'Ordinance Page'}</span>
                            </a>
                            {source.wordCount && (
                              <span className="text-gray-500 ml-2">({source.wordCount.toLocaleString()} words)</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                )}
              </div>
            </div>
          ))}

          {chatToolDialogs.length > 0 && (
            <ChatToolDialogs items={chatToolDialogs} />
          )}

          {isLoading && messages[messages.length - 1]?.role === MessageRole.MODEL && (
            <div className="flex items-start gap-2 justify-start">
              <div className="p-2.5 rounded-lg bg-[#0f1620] text-slate-200 rounded-bl-none border border-white/[0.07]">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-sm animate-pulse" style={{ animationDelay: '0s' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-sm animate-pulse" style={{ animationDelay: '0.2s' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-sm animate-pulse" style={{ animationDelay: '0.4s' }} />
                  <span className="text-xs text-gray-400 ml-1">({(thinkingTime / 1000).toFixed(1)}s)</span>
                </div>
              </div>
            </div>
          )}

          {showSuggestions && suggestedQuestions.length > 0 && (
            <SuggestedQuestions
              questions={suggestedQuestions}
              onQuestionSelect={q => {
                onSendMessage?.(q);
                setShowSuggestions(false);
              }}
              fontSize={13}
              activeAgent={effectiveAgent}
            />
          )}
          </div>
        </div>
      )}

      {/* Bottom Bar Wrapper: houses the docked Rounded-Square Agent Socket on the left and the two command rows on the right */}
      <div className="relative flex items-stretch bg-[#080d14] pl-16 pr-3">
        <div className="flex min-w-0 flex-1 flex-col border-l border-white/[0.07] pl-1">
          {/* Line 1: Single History / Feedback / Instructional Row */}
          <div className="flex items-center gap-2 px-3 py-1 bg-[#080d14] text-[10px] leading-none min-h-[22px] overflow-hidden">
            {inputMode === 'agent' && !activePrompt ? (
              <span className="truncate font-medium" style={{ color: accentColor }}>
                <span className="text-gray-400 uppercase tracking-wider mr-1.5">[{agentLabel}]</span>
                {isLoading
                  ? `Thinking… (${(thinkingTime / 1000).toFixed(1)}s)`
                  : latestAgentPreview || 'Ready — ask anything about this project'}
              </span>
            ) : historyNavText ? (
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

            {inputMode === 'cad' && latestEntry?.links?.length ? (
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

            {/* Live Snaps / Ortho Badges in the history line */}
            <div className="ml-auto flex items-center gap-2 shrink-0 text-[10px] border-l border-gray-800/60 pl-2">
              {hasDockableTools && onToggleToolDock && (
                <button
                  type="button"
                  data-no-drag
                  onClick={onToggleToolDock}
                  aria-expanded={isToolDockOpen}
                  className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-semibold uppercase tracking-wider transition-colors ${
                    isToolDockOpen
                      ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200'
                      : 'border-white/[0.08] bg-white/[0.03] text-slate-400 hover:border-cyan-500/40 hover:text-cyan-200'
                  }`}
                  title={isToolDockOpen ? 'Slide the agent tool shelf down' : 'Slide up the agent tool shelf'}
                  aria-label={isToolDockOpen ? 'Close agent tool shelf' : 'Open agent tool shelf'}
                >
                  <ChevronDownIcon className={`h-3 w-3 transition-transform duration-200 ${isToolDockOpen ? 'rotate-180' : ''}`} />
                  <span>Tools</span>
                </button>
              )}
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
              {onCycleAgentDrawMode && (
                <button
                  type="button"
                  data-no-drag
                  onClick={onCycleAgentDrawMode}
                  className="relative inline-flex min-w-[20px] items-center justify-center rounded px-1.5 py-0.5 text-[11px] font-medium leading-none text-cyan-300/90 transition-all duration-150 ease-out hover:z-10 hover:scale-150 hover:bg-cyan-500/10 hover:font-bold hover:text-cyan-100"
                  title={`Agent draws: ${agentDrawMode === 'both' ? 'Points & Lines' : agentDrawMode === 'points' ? 'Points only' : 'Lines only'} — click to cycle`}
                >
                  {agentDrawMode === 'both' ? 'P/L' : agentDrawMode === 'points' ? 'P' : 'L'}
                </button>
              )}
              {onCycleAgentAnnotMode && (
                <button
                  type="button"
                  data-no-drag
                  onClick={onCycleAgentAnnotMode}
                  className="relative inline-flex min-w-[20px] items-center justify-center rounded px-1.5 py-0.5 text-[11px] font-medium leading-none text-cyan-300/90 transition-all duration-150 ease-out hover:z-10 hover:scale-150 hover:bg-cyan-500/10 hover:font-bold hover:text-cyan-100"
                  title={`Line annotation: ${agentAnnotMode === 'both' ? 'Bearing & Distance' : agentAnnotMode === 'bearing' ? 'Bearing only' : 'Distance only'} — click to cycle`}
                >
                  {agentAnnotMode === 'both' ? 'B/D' : agentAnnotMode === 'bearing' ? 'B' : 'D'}
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

          {/* Line 2: Unified Interactive Command Line — Deterministic CAD (Space) or Agent Mode (~) */}
          <div className="flex h-7 items-center gap-2 px-3 bg-[#080d14]">
            {isCommandLineActive && inputMode === 'cad' ? (
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
                  placeholder="Type help"
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
            ) : isCommandLineActive && inputMode === 'agent' && !isAgentFloating ? (
              <form onSubmit={handleAgentSubmit} className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  className="font-bold text-xs shrink-0 tracking-tight flex items-center gap-1"
                  style={{ color: accentColor }}
                >
                  <span>~</span>
                  <span className="uppercase">{isSpecialistPluggedIn ? agentLabel : 'LSAI'}</span>
                  <span>&gt;</span>
                </span>
                <input
                  ref={agentInputRef}
                  data-no-drag
                  type="text"
                  value={agentInputText}
                  onChange={e => setAgentInputText(e.target.value)}
                  onKeyDown={handleKeyDownAgentInput}
                  placeholder={`Ask ${agentLabel} anything...`}
                  className="min-w-0 flex-1 bg-transparent text-gray-100 placeholder-gray-500 outline-none font-sans text-xs selection:bg-cyan-500/30"
                  autoComplete="off"
                />
                {suggestedQuestions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowSuggestions(p => !p)}
                    className="p-1 text-yellow-400 hover:bg-yellow-500/10 rounded transition-colors shrink-0"
                    title="Suggested Questions"
                  >
                    <LightbulbIcon className="w-3.5 h-3.5" />
                  </button>
                )}
                {isLoading ? (
                  <button
                    type="button"
                    onClick={onStopGenerating}
                    className="p-1 text-red-400 bg-red-900/40 rounded hover:bg-red-800/60 shrink-0"
                    title="Stop Generating"
                  >
                    <StopIcon className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!agentInputText.trim()}
                    className="flex h-5 w-5 items-center justify-center rounded border transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 shrink-0"
                    style={{ backgroundColor: `${accentColor}26`, borderColor: `${accentColor}55`, color: accentColor }}
                    title="Send to Agent"
                  >
                    <SendIcon className="h-3 w-3" />
                  </button>
                )}
              </form>
            ) : (
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <button
                  type="button"
                  data-no-drag
                  onClick={activateCommandLine}
                  className="group flex items-center gap-2 bg-transparent text-left cursor-pointer"
                  title="Press Space to type a deterministic CAD command"
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

                <span className="text-gray-700 select-none">·</span>

                <button
                  type="button"
                  data-no-drag
                  onClick={activateAgentMode}
                  className="group flex min-w-0 items-center gap-1.5 bg-transparent text-left cursor-pointer"
                  title={`Press ~ (tilde) to talk to ${agentLabel}`}
                  aria-label="Activate agent mode"
                >
                  <span className="font-bold text-xs shrink-0 tracking-tight flex items-center gap-1" style={{ color: accentColor }}>
                    <span>~</span>
                    <span className="text-[10px] uppercase">{isSpecialistPluggedIn ? agentLabel : 'LSAI'}</span>
                    <span>&gt;</span>
                  </span>
                  <span className="font-mono text-[10px] text-gray-500 transition-colors group-hover:text-gray-300 truncate">
                    Press ~ for Agent
                  </span>
                </button>
              </div>
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

        {/* Hidden in-bar socket slot on the left. The visible dock is portaled to <body> so
            the socket and quick-thought card stack above the tool shelf and every
            floating dialog; this anchor keeps that dock at the exact spot the
            command bar was designed around. It is 44px inside a 50px bar, so the
            accent rail stays unbroken above it. */}
        <div
          ref={socketAnchorRef}
          aria-hidden="true"
          data-testid="agent-socket-anchor"
          className="pointer-events-none absolute left-3 bottom-[3px] h-11 w-11"
        />
        {typeof document !== 'undefined' && createPortal(
          <div
            data-testid="agent-dock"
            className="pointer-events-none fixed z-[10020] flex items-center"
            style={agentDockPos
              ? { left: agentDockPos.left, top: agentDockPos.top, width: 44, height: 44 }
              : { left: 12, bottom: 3 }}
          >
        {/* Rounded-Square Agent Socket — seated directly on the left of the command bar.
            There is no raised tab: the bar's accent line runs straight through the
            top of the socket, so the dock reads as part of the bar rather than a
            card stepping up out of it. */}
        <div className="pointer-events-auto relative flex items-center">
          {hasPendingPrompt && !isThoughtDismissed && (
            // A fresh question always raises the notification, even if the feed
            // is already open — the compact bubble is the prompt, not a duplicate.
            hasPendingQuestionOptions || hasInlineQuestionPrompt || !isExpanded || inputMode !== 'agent'
          ) && (
            <div
              data-testid="agent-thought-bubble"
              role="dialog"
              aria-label={`${agentLabel} has a suggestion`}
              className="absolute bottom-full left-0 z-[10030] mb-5 w-[min(360px,calc(100vw-24px))] animate-fade-in-up rounded-2xl border p-0 font-sans text-slate-200 shadow-[0_24px_70px_rgba(0,0,0,0.8)] backdrop-blur-xl"
              style={{
                borderColor: `${accentColor}70`,
                background: `radial-gradient(130% 120% at 0% 0%, ${accentColor}2e 0%, rgba(9,15,25,0.98) 48%, rgba(6,10,17,0.99) 100%)`,
                boxShadow: `0 24px 70px rgba(0,0,0,0.8), 0 0 0 1px ${accentColor}22, 0 0 46px ${accentColor}26`,
              }}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
                style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -left-12 -top-14 h-36 w-36 rounded-full blur-2xl"
                style={{ backgroundColor: `${accentColor}26` }}
              />
              <div className="relative p-3.5">
              <div className="flex items-start gap-2.5">
                <span
                  className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
                  style={{ background: `linear-gradient(145deg, ${accentColor}33, ${accentColor}0d)`, borderColor: `${accentColor}66` }}
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 animate-ping rounded-xl opacity-20"
                    style={{ backgroundColor: `${accentColor}66` }}
                  />
                  <SparklesIcon className="relative h-4 w-4" style={{ color: accentColor }} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[9px] font-extrabold uppercase tracking-[0.16em]" style={{ color: accentColor }}>
                      {agentLabel}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] px-1.5 py-[1px] text-[8px] font-bold uppercase tracking-[0.14em] text-slate-300">
                      <span className="h-1 w-1 animate-pulse rounded-full" style={{ backgroundColor: accentColor }} />
                      Quick thought
                    </span>
                    <div className="ml-auto flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        data-no-drag
                        onClick={() => openAgentConversation(true)}
                        className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white"
                        aria-label="Open agent conversation"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        data-no-drag
                        data-testid="dismiss-agent-notification"
                        onClick={() => {
                          if (thoughtKey) setDismissedThoughtKey(thoughtKey);
                        }}
                        className="rounded p-1 text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
                        aria-label="Dismiss agent notification"
                        title="Dismiss notification"
                      >
                        <XMarkIcon className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 max-h-[44px] overflow-hidden text-[12.5px] leading-relaxed text-slate-100">
                    {thoughtPreview || (hasPendingQuestionOptions ? 'I have a suggestion for the next step.' : 'I have a quick panel ready for you.')}
                  </p>
                </div>
              </div>

              {hasPendingQuestionOptions ? (
                <div className="mt-3 flex flex-col gap-1.5">
                  {pendingOptions.map((opt, optIdx) => (
                    <button
                      key={optIdx}
                      type="button"
                      data-no-drag
                      disabled={isLoading}
                      onClick={() => {
                        openAgentConversation(true);
                        onSendMessage?.(opt);
                      }}
                      className="group flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-[11px] font-semibold leading-snug text-slate-100 transition-all hover:translate-x-0.5 hover:brightness-125 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ borderColor: `${accentColor}38`, background: `linear-gradient(90deg, ${accentColor}14, rgba(255,255,255,0.02))` }}
                    >
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border font-mono text-[9px] font-black"
                        style={{ borderColor: `${accentColor}55`, backgroundColor: `${accentColor}1f`, color: accentColor }}
                      >
                        {String.fromCharCode(65 + optIdx)}
                      </span>
                      <span className="min-w-0 flex-1">{opt}</span>
                      <span aria-hidden="true" className="shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: accentColor }}>›</span>
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  type="button"
                  data-no-drag
                  onClick={() => openAgentConversation(true)}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.12em] transition-all hover:brightness-125 active:scale-[0.99]"
                  style={{
                    borderColor: `${accentColor}66`,
                    background: `linear-gradient(90deg, ${accentColor}30, ${accentColor}10)`,
                    color: accentColor,
                    boxShadow: `inset 0 1px 0 ${accentColor}33`,
                  }}
                >
                  <SparklesIcon className="h-3 w-3" />
                  Review the panel
                  <span aria-hidden="true">→</span>
                </button>
              )}

              <div className="mt-2 flex items-center justify-between text-[8.5px] font-bold uppercase tracking-[0.14em] text-slate-500">
                <span>Press ~ to continue</span>
                <button
                  type="button"
                  data-no-drag
                  onClick={() => openAgentConversation(true)}
                  className="transition-colors hover:text-slate-200"
                  style={{ color: `${accentColor}b3` }}
                >
                  Open conversation →
                </button>
              </div>
              </div>

              {/* Thought-bubble tail: two dots stepping down toward the left agent socket. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-1.5 left-4 h-2.5 w-2.5 rounded-full border bg-[#0a111b]"
                style={{ borderColor: `${accentColor}80` }}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-4 left-3 h-1.5 w-1.5 rounded-full border bg-[#0a111b]"
                style={{ borderColor: `${accentColor}80` }}
              />
            </div>
          )}
          <button
            type="button"
            data-no-drag
            data-testid="agent-plug-socket"
            onPointerDown={handleAgentDragStart}
            onClick={() => {
              if (Date.now() < suppressAgentClickUntilRef.current) return;
              toggleBottomAgentChat();
              onToggleAgentChat?.();
            }}
            aria-expanded={isBottomAgentChatOpen}
            className={`group relative flex h-11 w-11 aspect-square items-center justify-center overflow-hidden rounded-xl border transition-all duration-200 hover:brightness-110 active:scale-[0.97] ${
              isLoading ? 'animate-pulse' : ''
            }`}
            style={{
              // Uniform border on all 4 sides — no raised-tab top highlight.
              borderColor: isBottomAgentChatOpen ? accentColor : `${accentColor}66`,
              backgroundImage: `linear-gradient(160deg, ${accentColor}1c 0%, #0a111b 54%, #070c13 100%)`,
              boxShadow: isBottomAgentChatOpen || isSpecialistPluggedIn
                ? `0 6px 18px rgba(0,0,0,0.6), 0 0 16px ${accentColor}30`
                : '0 6px 18px rgba(0,0,0,0.55)',
            }}
            title={`${isBottomAgentChatOpen ? 'Collapse' : 'Open'} ${agentLabel} chat (drag out to float the command line)`}
            aria-label={`${isBottomAgentChatOpen ? 'Close' : 'Open'} agent chat for ${agentLabel}`}
          >
            <span className="relative flex flex-col items-center gap-[3px]">
              <AgentIcon
                className="h-[18px] w-[18px] transition-transform duration-200 group-hover:scale-110"
                style={{ color: accentColor }}
              />
              <span className="flex items-center gap-0.5">
                <span className="text-[7px] font-extrabold uppercase leading-none tracking-[0.16em] text-slate-300 transition-colors group-hover:text-white">
                  {isBottomAgentChatOpen ? 'Hide' : 'Chat'}
                </span>
                <ChevronUpIcon
                  className={`h-2 w-2 shrink-0 transition-transform duration-200 ${isBottomAgentChatOpen ? 'rotate-180' : ''}`}
                  style={{ color: `${accentColor}cc` }}
                  aria-hidden="true"
                />
              </span>
            </span>
          </button>
        </div>
          </div>,
          document.body
        )}
      </div>

      {/* Detached Agent Command Line: translucent, draggable, agent-only */}
      {isAgentFloating && typeof document !== 'undefined' && createPortal(
        <div
          ref={floatingRef}
          data-testid="agent-floating-command-line"
          data-mode="agent"
          className="fixed z-[80] w-[min(540px,94vw)] overflow-hidden rounded-xl border font-sans text-gray-100 backdrop-blur-xl"
          style={{
            left: floatingPos.x,
            top: floatingPos.y,
            borderColor: `${accentColor}59`,
            backgroundColor: 'rgba(9, 15, 24, 0.62)',
            boxShadow: `0 22px 60px rgba(0,0,0,0.68), 0 0 0 1px ${accentColor}1f, 0 0 34px ${accentColor}26`,
          }}
        >
          <div
            onPointerDown={handleFloatPointerDown}
            onPointerMove={handleFloatPointerMove}
            onPointerUp={handleFloatPointerUp}
            onPointerCancel={handleFloatPointerUp}
            className="flex cursor-grab select-none items-center gap-2 border-b border-white/[0.08] bg-white/[0.04] px-3 py-1.5 active:cursor-grabbing"
            style={{ touchAction: 'none' }}
          >
            <span aria-hidden="true" className="text-[10px] leading-none text-slate-500">⠿</span>
            <AgentIcon className="h-3.5 w-3.5 shrink-0" style={{ color: accentColor }} />
            <span className="truncate text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: accentColor }}>
              {agentLabel}
            </span>
            <span className="rounded border border-white/10 bg-white/[0.05] px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              floating
            </span>
            {isLoading && (
              <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: accentColor }}>
                <span className="h-1.5 w-1.5 animate-pulse rounded-sm" style={{ backgroundColor: accentColor }} />
                {(thinkingTime / 1000).toFixed(1)}s
              </span>
            )}
            <span className="ml-auto hidden font-mono text-[9px] uppercase tracking-wider text-slate-500 sm:inline">
              {modelLabel || 'Auto'}
            </span>
            <button
              data-no-drag
              type="button"
              onClick={dockAgentBack}
              className="rounded border border-white/10 bg-white/[0.04] p-1 text-slate-400 transition-colors hover:border-white/20 hover:text-white"
              title="Dock agent back into the command bar"
              aria-label="Dock agent back into the command bar"
            >
              <ArrowDownOnSquareIcon className="h-3.5 w-3.5" />
            </button>
          </div>

          {latestAgentMessage && (
            <div className="max-h-[26vh] overflow-y-auto px-3 py-2 text-[11.5px] leading-relaxed text-slate-200 [overflow-wrap:anywhere]">
              <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">{agentLabel}</div>
              <div
                className="[&>*]:max-w-full [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap"
                dangerouslySetInnerHTML={{
                  __html: formatChatHtml(
                    effectiveAgent === AgentType.ZONING_AGENT
                      ? sanitizeZoningAnswer(latestAgentMessage.result || latestAgentMessage.text || '')
                      : latestAgentMessage.result || latestAgentMessage.text || ''
                  ),
                }}
              />
            </div>
          )}

          <form onSubmit={handleAgentSubmit} className="flex items-center gap-2 border-t border-white/[0.08] px-3 py-2">
            <span className="flex shrink-0 items-center gap-1 text-xs font-bold tracking-tight" style={{ color: accentColor }}>
              <span>~</span>
              <span className="uppercase">{isSpecialistPluggedIn ? agentLabel : 'LSAI'}</span>
              <span>&gt;</span>
            </span>
            <input
              ref={agentInputRef}
              data-no-drag
              type="text"
              value={agentInputText}
              onChange={e => setAgentInputText(e.target.value)}
              onKeyDown={handleKeyDownAgentInput}
              placeholder={`Ask ${agentLabel} anything...`}
              className="min-w-0 flex-1 bg-transparent text-gray-100 placeholder-gray-500 outline-none text-xs selection:bg-cyan-500/30"
              autoComplete="off"
            />
            {isLoading ? (
              <button
                type="button"
                data-no-drag
                onClick={onStopGenerating}
                className="shrink-0 rounded bg-red-900/40 p-1 text-red-400 hover:bg-red-800/60"
                title="Stop Generating"
              >
                <StopIcon className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                type="submit"
                data-no-drag
                disabled={!agentInputText.trim()}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ backgroundColor: `${accentColor}26`, borderColor: `${accentColor}55`, color: accentColor }}
                title="Send to Agent"
              >
                <SendIcon className="h-3 w-3" />
              </button>
            )}
          </form>
        </div>,
        document.body
      )}
    </div>
  );
};

export default CanvasTerminal;
