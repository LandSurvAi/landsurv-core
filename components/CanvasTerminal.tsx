import React, { useRef, useState, useEffect, useLayoutEffect, useCallback, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { parseCanvasCommand, executeCanvasCommand, describeCommand, type CommandContext, type CommandResult, type HelpGroup } from '../utils/canvasCommands';
import { CommandHelpView, type CommandReference } from './CommandHelpView';
import { AgentType, MessageRole, type ChatMessage } from '../types';
import { agentConfig, agentThemeColors } from '../constants/agents';
import { sanitizeZoningAnswer } from '../utils/zoningRender';
import { formatChatHtml } from '../utils/chatHtml';
import SuggestedQuestions from './SuggestedQuestions';
import { A2UISurface } from './A2UISurface';
import { A2UIQuickThoughtSurface } from './A2UIQuickThoughtSurface';
import { DockModeControl, type DockMode } from './DockModeControl';
import {
  decomposeMessageForQuickThought,
  getAgentInitialQuickThoughtOptions,
} from '../services/a2uiQuickThought';
import { rememberCanvasPointer } from '../services/canvasFlashes';
import { a2uiSurfaceBus } from '../services/a2uiSurfaces';
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

export interface SnapControlOption {
  id: string;
  label: string;
  enabled: boolean;
}

export interface SnapControls {
  /** Master running-snap switch. */
  enabled: boolean;
  options: SnapControlOption[];
  onToggleEnabled: () => void;
  onToggleOption: (id: string) => void;
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
  /** Number of selected linework entities the Properties dialog can edit. */
  propertiesSelectionCount?: number;
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
  /** Interactive running-snap switch and per-type choices for the SNAP badge. */
  snapControls?: SnapControls;
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
  /** Boundary Agent deed-intake choices for the quick-thought card. */
  boundaryQuickActions?: {
    onUpload: () => void;
    onAuthor: () => void;
    onGis: () => void;
  };
  /** Key of the A2UI surface currently docked in the agent tool shelf. */
  dockedA2UIKey?: string | null;
  /** Key of the A2UI surface currently floating on the canvas. */
  floatingA2UIKey?: string | null;
  /** A2UI surface launched outside chat, presented with the same dock/float/return lifecycle. */
  standaloneA2UIMessage?: ChatMessage | null;
  /** Move an A2UI surface between Floating, Chat, and Toolshelf. */
  onSetA2UIDockMode?: (message: ChatMessage, mode: DockMode) => void;
  /** Toggle an A2UI surface between the chat feed and the agent tool shelf. */
  onToggleA2UIDock?: (message: ChatMessage) => void;
  /** Toggle an A2UI surface between the chat feed and a floating dialog. */
  onToggleA2UIFloat?: (message: ChatMessage) => void;
  /** Docked tool panels relevant to the active agent, rendered under the feed. */
  chatToolDialogs?: DockableToolItem[];
  /** Increment to pull the command bar's agent feed back open (e.g. Return to chat). */
  agentChatOpenSignal?: number;
  /** Reports the command bar height so the tool drawer can rest on its top edge. */
  onHeightChange?: (height: number) => void;
  /** Pixels to extend past the right edge, underneath the open agent tool shelf. */
  rightExtension?: number;
  /** Text size multiplier from Settings → Command Bar. Defaults to 1.15. */
  textScale?: number;
  /** Show the Space / Shift+Space prompts on the resting command rows. */
  showShortcutHints?: boolean;
  /** Show SNAP / ORTHO badges in the command history row. */
  showStatusBadges?: boolean;
}

export const CanvasTerminal: React.FC<CanvasTerminalProps> = ({
  activePrompt,
  focusRequest,
  commandContext,
  onExecuteCommand,
  onOpenProperties,
  propertiesSelectionCount,
  agentDrawMode = 'both',
  agentAnnotMode = 'both',
  onCycleAgentDrawMode,
  onCycleAgentAnnotMode,
  onOpenTextEditor,
  keyInfo,
  incomingMessage,
  statusBadges,
  snapControls,
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
  boundaryQuickActions,
  dockedA2UIKey,
  floatingA2UIKey,
  standaloneA2UIMessage,
  onSetA2UIDockMode,
  onToggleA2UIDock,
  onToggleA2UIFloat,
  chatToolDialogs = [],
  agentChatOpenSignal,
  onHeightChange,
  rightExtension = 0,
  textScale = 1.15,
  showShortcutHints = true,
  showStatusBadges = true,
}) => {
  const openA2UISurfaces = useSyncExternalStore(
    a2uiSurfaceBus.subscribe,
    a2uiSurfaceBus.getSnapshot,
    a2uiSurfaceBus.getSnapshot,
  );
  // Fullscreen surfaces own the whole viewport. The agent dock is portaled to
  // body at a higher z-index than the surface, so hide the command bar rather
  // than letting its glyph and quick-thought card float above the dialog.
  const hasFullscreenA2UISurface = openA2UISurfaces.some(surface => surface.size === 'fullscreen');
  const [history, setHistory] = useState<TerminalEntry[]>([]);
  const [inputText, setInputText] = useState('');
  const [agentInputText, setAgentInputText] = useState('');
  const [inputMode, setInputMode] = useState<'cad' | 'agent'>('agent');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [isSnapMenuOpen, setIsSnapMenuOpen] = useState(false);
  const snapControlRef = useRef<HTMLDivElement | null>(null);
  /** The quick-thought body is measured so only overflowing copy drifts. */
  const thoughtTextRef = useRef<HTMLDivElement | null>(null);
  const [isThoughtOverflowing, setIsThoughtOverflowing] = useState(false);
  const [thoughtDriftSeconds, setThoughtDriftSeconds] = useState(8);
  // One command row: the agent chat is the default face. At rest it advertises
  // the deterministic CAD line, which opens on Space or by clicking that hint.
  const [isCommandLineActive, setIsCommandLineActive] = useState(false);
  // History stays collapsed on load; expansion is a per-session action or auto-expands in Agent mode.
  const [isExpanded, setIsExpanded] = useState(false);
  // Opening to a finished result folds older turns behind one compact disclosure.
  const [showEarlierAgentMessages, setShowEarlierAgentMessages] = useState(false);
  // The agent command line can be pulled out of the bar and floated on the canvas.
  const [isAgentFloating, setIsAgentFloating] = useState(false);
  const [floatingPos, setFloatingPos] = useState({ x: 0, y: 0 });
  // The dock is portaled above every dialog, so it cannot use the command bar's
  // own box for positioning. Measure an in-bar anchor instead: that keeps the
  // glyph exactly in the bar's socket slot and the raised tab centered on it.
  const socketAnchorRef = useRef<HTMLDivElement | null>(null);
  // SVG paint servers reject React's raw useId colons, so strip them.
  const [agentDockPos, setAgentDockPos] = useState<{ left: number; top: number } | null>(null);
  // A phone's software keyboard changes the visual viewport without resizing
  // the bar, so the bar can move (e.g. back down when the keyboard closes)
  // while no ResizeObserver fires. Coalesce viewport churn into a frame-aligned
  // re-measure plus one pass after the keyboard's resize animation settles.
  const dockMeasureFrameRef = useRef(0);
  const dockMeasureSettleRef = useRef(0);
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
  // A dismissed card can be peeked at by hovering the glyph. Unlike the normal
  // notification, a peek is transient and disappears when the pointer leaves.
  const [hoverRevealedThoughtKey, setHoverRevealedThoughtKey] = useState<string | null>(null);
  const hoverRevealedThoughtKeyRef = useRef<string | null>(null);
  const quickThoughtHideTimerRef = useRef<number | null>(null);
  const isPointerOverQuickThoughtRef = useRef(false);

  // Command history navigation with Up/Down arrows
  const commandHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const agentInputRef = useRef<HTMLInputElement | null>(null);
  const terminalRootRef = useRef<HTMLDivElement | null>(null);
  const historyScrollRef = useRef<HTMLDivElement | null>(null);
  const agentFeedScrollRef = useRef<HTMLDivElement | null>(null);
  const latestAgentMessageRef = useRef<HTMLDivElement | null>(null);
  const wasAgentLoadingRef = useRef(isLoading);
  const lastAgentFeedCountRef = useRef(0);
  const lastAgentFeedRoleRef = useRef<MessageRole | null>(null);
  const wasAgentFeedExpandedRef = useRef(false);
  const wasBottomFeedOpenForThoughtRef = useRef(false);
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
  const resolvedTextScale = Number.isFinite(textScale)
    ? Math.min(1.6, Math.max(0.75, textScale))
    : 1.15;
  const propertiesSelectionTotal = propertiesSelectionCount
    ?? commandContext.selectionCount
    ?? (commandContext.hasSelection ? 1 : 0);
  const hasPropertiesSelection = propertiesSelectionTotal > 0;
  const modelLabel = formatModelDisplay(currentModelName);
  const agentWordmark = (
    <span className="uppercase">
      {isSpecialistPluggedIn ? (
        agentLabel
      ) : (
        <>
          <span className="text-white">LSAI</span>
        </>
      )}
    </span>
  );

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

  const focusAgentCommandLine = useCallback(() => {
    setInputMode('agent');
    setIsCommandLineActive(true);
    agentInputRef.current?.focus();
  }, []);

  const activateAgentMode = useCallback(() => {
    focusAgentCommandLine();
    // Only an explicit click on the Agent tab/handle opens the conversation.
    // The compact command line and Shift+Space just start typing.
    if (!isAgentFloating) {
      setShowEarlierAgentMessages(false);
      setIsExpanded(true);
    }
  }, [focusAgentCommandLine, isAgentFloating]);

  // Opens the agent conversation without requiring a second click, optionally at a
  // larger height (used by the thought bubble above the agent socket).
  const openAgentConversation = useCallback((enlarge = false, focusInput = true) => {
    setInputMode('agent');
    setIsCommandLineActive(true);
    setShowEarlierAgentMessages(false);
    setIsExpanded(true);
    if (enlarge) {
      setIsUserSized(true);
      setPanelHeight(prev => Math.max(prev, 380));
    }
    if (focusInput) window.setTimeout(() => agentInputRef.current?.focus(), 0);
  }, []);

  const isBottomAgentChatOpen = isExpanded && inputMode === 'agent' && !isAgentFloating;

  const toggleBottomAgentChat = useCallback(() => {
    if (isAgentFloating) {
      setIsAgentFloating(false);
      setInputMode('agent');
      setIsCommandLineActive(true);
      setShowEarlierAgentMessages(false);
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
    setShowEarlierAgentMessages(false);
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

  // Space activates deterministic CAD mode; Shift+Space focuses the Agent line
  // without opening the chat feed. Opening the conversation is a deliberate click.
  useEffect(() => {
    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'SELECT' || tag === 'A' || target?.isContentEditable;

      if (e.key === ' ' && e.shiftKey) {
        // Allow Shift+Space inside an empty CAD command input to switch directly
        // to the Agent line, but never auto-expand the feed.
        const isEmptyCadInput = target === inputRef.current && !inputText.trim();
        if (isEditable && !isEmptyCadInput) return;
        e.preventDefault();
        focusAgentCommandLine();
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
  }, [activateCommandLine, focusAgentCommandLine, inputText]);

  // Focus the active input as soon as it mounts/switches mode.
  useEffect(() => {
    if (!isCommandLineActive) return;
    if (inputMode === 'agent') {
      agentInputRef.current?.focus();
    } else {
      inputRef.current?.focus();
    }
  }, [isCommandLineActive, inputMode]);

  useEffect(() => {
    if (!isSnapMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (snapControlRef.current?.contains(event.target as Node)) return;
      setIsSnapMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsSnapMenuOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSnapMenuOpen]);

  // Pending questions and A2UI prompts surface as a quick thought; only an
  // explicit socket/tab click opens the full agent feed.
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const latestModelMessage = lastMessage?.role === MessageRole.MODEL ? lastMessage : null;
  const latestModelHasContent = Boolean(
    latestModelMessage &&
      ((latestModelMessage.result || latestModelMessage.text || '').trim() ||
        latestModelMessage.a2ui ||
        (latestModelMessage.questionOptions?.length ?? 0) > 0 ||
        latestModelMessage.quickThoughtText)
  );
  const keepRecentAgentMessages = isLoading ? 2 : 1;
  const shouldCollapseAgentFeed =
    !showEarlierAgentMessages &&
    Boolean(latestModelMessage) &&
    messages.length > 2 &&
    (isLoading || latestModelHasContent);
  const hiddenAgentMessageCount = shouldCollapseAgentFeed
    ? Math.max(0, messages.length - keepRecentAgentMessages)
    : 0;
  const visibleAgentMessages = shouldCollapseAgentFeed
    ? messages.slice(-keepRecentAgentMessages)
    : messages;
  const firstVisibleAgentMessageIndex = messages.length - visibleAgentMessages.length;
  const isLatestResultFocused = Boolean(latestModelHasContent && !showEarlierAgentMessages && messages.length > 1);
  const hasPendingQuestionOptions = Boolean(lastMessage?.questionOptions && lastMessage.questionOptions.length > 0);
  const hasActiveA2UI = Boolean(
    lastMessage?.a2ui &&
      lastMessage.a2ui.status !== 'completed' &&
      lastMessage.a2ui.status !== 'dismissed'
  );
  const baseQuickThoughtBreakdown = decomposeMessageForQuickThought(lastMessage, effectiveAgent);
  // Greetings often arrive without embedded prompts. Give every agent a useful
  // first Quick Thought so its opening state is immediately actionable.
  const initialQuickThoughtOptions =
    messages.length <= 1 &&
    lastMessage?.role === MessageRole.MODEL &&
    !baseQuickThoughtBreakdown.hasActionablePrompt &&
    !lastMessage.quickThoughtText &&
    !hasActiveA2UI
      ? getAgentInitialQuickThoughtOptions(effectiveAgent)
      : [];
  const quickThoughtBreakdown = initialQuickThoughtOptions.length > 0
    ? {
        ...baseQuickThoughtBreakdown,
        hasActionablePrompt: true,
        kind: 'options' as const,
        options: initialQuickThoughtOptions,
        datasetTooLarge: false,
        totalItemCount: initialQuickThoughtOptions.length,
      }
    : baseQuickThoughtBreakdown;
  // Questions (option pills), numbered prose choices, inline checkboxes/forms,
  // and active A2UI prompts all need a deliberate response, so each raises a
  // thought bubble above the agent socket.
  const hasPendingPrompt =
    hasPendingQuestionOptions ||
    hasActiveA2UI ||
    Boolean(lastMessage?.quickThoughtText) ||
    quickThoughtBreakdown.hasActionablePrompt;
  const pendingOptions = lastMessage?.questionOptions ?? quickThoughtBreakdown.options ?? [];
  const thoughtKey = lastMessage
    ? `${effectiveAgent}:${messages.length}:${lastMessage.role}:${lastMessage.quickThoughtText ?? ''}:${lastMessage.quickThoughtLabel ?? ''}:${pendingOptions.join('|')}:${lastMessage.a2ui?.widgetType ?? ''}:${lastMessage.a2ui?.status ?? ''}:${quickThoughtBreakdown.kind ?? ''}`
    : null;
  const quickThoughtLabel = lastMessage?.quickThoughtLabel?.trim() || 'Handoff';
  const isThoughtDismissed = thoughtKey !== null && dismissedThoughtKey === thoughtKey;

  const setHoverReveal = useCallback((key: string | null) => {
    hoverRevealedThoughtKeyRef.current = key;
    setHoverRevealedThoughtKey(key);
  }, []);

  const clearQuickThoughtHideTimer = useCallback(() => {
    if (quickThoughtHideTimerRef.current !== null) {
      window.clearTimeout(quickThoughtHideTimerRef.current);
      quickThoughtHideTimerRef.current = null;
    }
  }, []);

  const scheduleQuickThoughtHide = useCallback(() => {
    if (!hoverRevealedThoughtKeyRef.current) return;
    clearQuickThoughtHideTimer();
    quickThoughtHideTimerRef.current = window.setTimeout(() => {
      quickThoughtHideTimerRef.current = null;
      if (isPointerOverQuickThoughtRef.current) return;
      setHoverReveal(null);
    }, 220);
  }, [clearQuickThoughtHideTimer, setHoverReveal]);

  // Hovering the agent glyph peeks at a dismissed card where it left off. This
  // is intentionally separate from clicking the socket, which opens the full
  // feed and dismisses the card.
  const revealQuickThoughtOnHover = useCallback(() => {
    clearQuickThoughtHideTimer();
    if (!hasPendingPrompt || isBottomAgentChatOpen || !isThoughtDismissed || !thoughtKey) return;
    // A fresh peek starts from the glyph, so any stale inside-card flag from a
    // previously unmounted bubble must not block the pointer-off hide.
    isPointerOverQuickThoughtRef.current = false;
    setHoverReveal(thoughtKey);
  }, [clearQuickThoughtHideTimer, hasPendingPrompt, isBottomAgentChatOpen, isThoughtDismissed, thoughtKey, setHoverReveal]);

  const handleQuickThoughtPointerEnter = useCallback(() => {
    isPointerOverQuickThoughtRef.current = true;
    clearQuickThoughtHideTimer();
  }, [clearQuickThoughtHideTimer]);

  const handleQuickThoughtPointerLeave = useCallback(() => {
    isPointerOverQuickThoughtRef.current = false;
    scheduleQuickThoughtHide();
  }, [scheduleQuickThoughtHide]);

  // Clicking or focusing a peeked card promotes it back to a normal, persistent
  // quick thought. A quick pass over the card without interacting leaves it
  // transient, so pointer-off can put it away.
  const handleQuickThoughtInteraction = useCallback(() => {
    if (hoverRevealedThoughtKeyRef.current !== thoughtKey) return;
    clearQuickThoughtHideTimer();
    setHoverReveal(null);
    setDismissedThoughtKey(current => (current === thoughtKey ? null : current));
  }, [clearQuickThoughtHideTimer, setHoverReveal, thoughtKey]);

  const isQuickThoughtHoverRevealed =
    thoughtKey !== null && hoverRevealedThoughtKey === thoughtKey;
  const isQuickThoughtVisible =
    hasPendingPrompt &&
    !isBottomAgentChatOpen &&
    (!isThoughtDismissed || isQuickThoughtHoverRevealed);

  useEffect(() => () => clearQuickThoughtHideTimer(), [clearQuickThoughtHideTimer]);

  // Opening the full agent feed makes the compact quick-thought card redundant.
  // Dismiss the current notification so closing the feed doesn't resurrect it.
  useEffect(() => {
    if (isBottomAgentChatOpen && !wasBottomFeedOpenForThoughtRef.current && thoughtKey) {
      setDismissedThoughtKey(thoughtKey);
      setHoverReveal(null);
      isPointerOverQuickThoughtRef.current = false;
      clearQuickThoughtHideTimer();
    }
    wasBottomFeedOpenForThoughtRef.current = isBottomAgentChatOpen;
  }, [isBottomAgentChatOpen, thoughtKey, setHoverReveal, clearQuickThoughtHideTimer]);

  const thoughtText = (lastMessage?.quickThoughtText || lastMessage?.result || lastMessage?.text || '')
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
  // The bubble animates through a generous slice; the full agent response is
  // still one click away in the conversation.
  const thoughtScrollText = thoughtText.length > 900
    ? `${thoughtText.slice(0, 900).trimEnd()}…`
    : thoughtText;

  // Measure the preview after it mounts and whenever its copy or width changes.
  // Overflowing copy gets a slow CSS drift; short copy stays still and fully
  // visible. This is deliberately independent of requestAnimationFrame, which
  // browsers can throttle while the canvas is busy.
  useLayoutEffect(() => {
    const el = thoughtTextRef.current;
    if (!el) {
      setIsThoughtOverflowing(false);
      return;
    }
    const measure = () => {
      const overflow = el.scrollHeight - el.clientHeight;
      setIsThoughtOverflowing(overflow > 2);
      setThoughtDriftSeconds(Math.max(4, Math.ceil(overflow / 8)));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    const content = el.firstElementChild;
    if (content) observer.observe(content);
    return () => observer.disconnect();
  }, [thoughtScrollText, hasPendingPrompt, isThoughtDismissed, isQuickThoughtHoverRevealed, hasPendingQuestionOptions]);

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

  // A completed agent turn releases the command-bar feed so the canvas is
  // clear. Pending questions and prompting surfaces stay open because the
  // agent is waiting on the user, not finished.
  useEffect(() => {
    const wasLoading = wasAgentLoadingRef.current;
    wasAgentLoadingRef.current = isLoading;
    if (!wasLoading || isLoading) return;
    if (isAgentFloating || isAgentChatOpen || inputMode !== 'agent') return;
    const finished = messages[messages.length - 1];
    if (!finished || finished.role !== MessageRole.MODEL) return;
    const needsInput = Boolean(
      finished.needsInput ||
        (finished.questionOptions?.length ?? 0) > 0 ||
        finished.a2ui?.status === 'prompting'
    );
    const hasInteractiveA2UI = Boolean(
      finished.a2ui &&
        finished.a2ui.status !== 'completed' &&
        finished.a2ui.status !== 'dismissed'
    );
    if (needsInput || hasInteractiveA2UI) {
      setShowEarlierAgentMessages(false);
      openAgentConversation(false, false);
      const frame = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => scrollAgentFeedToMessageStart('auto'));
      });
      return () => window.cancelAnimationFrame(frame);
    }
    const hasResult = Boolean(
      (finished.result || finished.text || '').trim() ||
        finished.a2ui ||
        finished.quickThoughtText
    );
    if (!hasResult) return;
    setIsExpanded(false);
    setIsCollapsePulsing(false);
  }, [isLoading, messages, isAgentFloating, isAgentChatOpen, inputMode, openAgentConversation, scrollAgentFeedToMessageStart]);

  useEffect(() => {
    if (isLoading) setShowEarlierAgentMessages(false);
  }, [isLoading]);

  useEffect(() => {
    setShowEarlierAgentMessages(false);
  }, [effectiveAgent]);

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

  const resultLinks = (result: CommandResult, rawInput?: string): TerminalLink[] => {
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
            result.helpGroups?.length ? { groups: result.helpGroups, notes: result.helpNotes, text: content, textScale: resolvedTextScale } : undefined,
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
    // An unrecognized deterministic command is usually an AI request typed in
    // the wrong line; offer a one-click hand-off into the agent command line.
    const unknownVerb = rawInput ? parseCanvasCommand(rawInput).verb : '';
    if (unknownVerb && !describeCommand(unknownVerb)) {
      links.push({
        label: `Ask ${isSpecialistPluggedIn ? agentLabel : 'LSAI'}`,
        onClick: () => {
          setAgentInputText(rawInput!);
          focusAgentCommandLine();
        },
      });
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

    // The CAD line stays deterministic: an unknown verb is pointed at the AI
    // line instead of being guessed at.
    const unknownCommand = Boolean(parsed.verb) && !describeCommand(parsed.verb);
    const outEntry: TerminalEntry = {
      id: `out-${Date.now()}`,
      type: 'output',
      text: unknownCommand
        ? `${result.message} Use the AI line (Shift+Space) — ${agentLabel} can interpret free-form requests.`
        : result.message,
      timestamp: Date.now(),
      tone: result.status === 'error' ? 'error' : result.status === 'ok' ? 'ok' : 'info',
      links: resultLinks(result, raw),
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
        setInputMode('agent');
        commandContext.onActivateSelectionMode?.();
        if (isExpanded) {
          setIsExpanded(false);
        }
      }
    }
  };

  const toggleExpand = () => {
    setIsCollapsePulsing(false);
    if (!isExpanded) setShowEarlierAgentMessages(false);
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
  }, [isExpanded, inputMode, messages, history, isLoading, showSuggestions, hasPendingQuestionOptions, hasActiveA2UI, showEarlierAgentMessages]);

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
    // Docking returns the glyph to its socket; it should not also expand the
    // bottom agent chat.
    setIsExpanded(false);
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

  const scheduleAgentDockPositionUpdate = useCallback(() => {
    if (dockMeasureFrameRef.current) cancelAnimationFrame(dockMeasureFrameRef.current);
    // Two frames: the first lets --app-height land, the second measures the
    // reflowed bar. The delayed pass covers the keyboard's slide animation.
    dockMeasureFrameRef.current = requestAnimationFrame(() => {
      dockMeasureFrameRef.current = requestAnimationFrame(() => {
        dockMeasureFrameRef.current = 0;
        updateAgentDockPosition();
      });
    });
    if (dockMeasureSettleRef.current) window.clearTimeout(dockMeasureSettleRef.current);
    dockMeasureSettleRef.current = window.setTimeout(() => {
      dockMeasureSettleRef.current = 0;
      updateAgentDockPosition();
    }, 320);
  }, [updateAgentDockPosition]);

  useLayoutEffect(() => {
    updateAgentDockPosition();
    const viewport = window.visualViewport;
    window.addEventListener('resize', scheduleAgentDockPositionUpdate);
    window.addEventListener('orientationchange', scheduleAgentDockPositionUpdate);
    // iOS and Android change visualViewport.height as the software keyboard
    // opens and closes without firing a window resize on the layout viewport.
    viewport?.addEventListener('resize', scheduleAgentDockPositionUpdate);
    viewport?.addEventListener('scroll', scheduleAgentDockPositionUpdate);
    const root = terminalRootRef.current;
    const observer = typeof ResizeObserver !== 'undefined' && root
      ? new ResizeObserver(updateAgentDockPosition)
      : null;
    if (root && observer) observer.observe(root);
    return () => {
      if (dockMeasureFrameRef.current) cancelAnimationFrame(dockMeasureFrameRef.current);
      if (dockMeasureSettleRef.current) window.clearTimeout(dockMeasureSettleRef.current);
      window.removeEventListener('resize', scheduleAgentDockPositionUpdate);
      window.removeEventListener('orientationchange', scheduleAgentDockPositionUpdate);
      viewport?.removeEventListener('resize', scheduleAgentDockPositionUpdate);
      viewport?.removeEventListener('scroll', scheduleAgentDockPositionUpdate);
      observer?.disconnect();
    };
  }, [scheduleAgentDockPositionUpdate, updateAgentDockPosition]);

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

  const standaloneA2UIKey = standaloneA2UIMessage?.a2ui
    ? `${standaloneA2UIMessage.a2ui.agent}:${standaloneA2UIMessage.a2ui.widgetType}`
    : null;
  const hasChatMessageForStandalone = standaloneA2UIKey
    ? messages.some(
        msg =>
          msg.a2ui &&
          `${msg.a2ui.agent}:${msg.a2ui.widgetType}` === standaloneA2UIKey &&
          msg.a2ui.status !== 'completed' &&
          msg.a2ui.status !== 'dismissed'
      )
    : false;

  /** One renderer for every A2UI card, whether it came from chat or a standalone launch. */
  const renderA2UICard = (message: ChatMessage) => {
    const a2ui = message.a2ui;
    if (!a2ui || a2ui.kind === 'intake-prompt') return null;
    const a2uiKey = `${a2ui.agent}:${a2ui.widgetType}`;
    const isDocked = a2uiKey === dockedA2UIKey;
    const isFloating = a2uiKey === floatingA2UIKey;
    if (isDocked || isFloating) {
      return (
        <div
          data-testid={isDocked ? 'a2ui-docked-placeholder' : 'a2ui-floating-placeholder'}
          className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-[11px] text-white/75"
        >
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <ArrowDownOnSquareIcon className="h-3.5 w-3.5" />
            {isDocked ? 'In Tool Shelf' : 'Floating on canvas'}
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            {onSetA2UIDockMode ? (
              <DockModeControl
                mode={isDocked ? 'toolshelf' : 'floating'}
                onChange={mode => onSetA2UIDockMode(message, mode)}
              />
            ) : (
              <button
                type="button"
                onClick={() => (isDocked ? onToggleA2UIFloat?.(message) : onToggleA2UIDock?.(message))}
                className="rounded border border-white/20 bg-white/[0.04] px-2 py-0.5 text-[10.5px] font-semibold text-white/80 transition-colors hover:border-white/40 hover:bg-white/[0.08] hover:text-white"
              >
                {isDocked ? 'Floating' : 'Toolshelf'}
              </button>
            )}
          </div>
        </div>
      );
    }
    return (
      <A2UISurface
        payload={a2ui}
        onPopOut={onSetA2UIDockMode ? () => {
          onSetA2UIDockMode(message, 'floating');
          setIsCollapsePulsing(false);
        } : onToggleA2UIFloat ? () => {
          onToggleA2UIFloat(message);
          setIsCollapsePulsing(false);
        } : undefined}
        onDock={onSetA2UIDockMode ? () => {
          onSetA2UIDockMode(message, 'toolshelf');
          setIsExpanded(false);
          setIsCollapsePulsing(false);
        } : onToggleA2UIDock ? () => {
          onToggleA2UIDock(message);
          setIsExpanded(false);
          setIsCollapsePulsing(false);
        } : undefined}
        onChat={onSetA2UIDockMode ? () => {
          onSetA2UIDockMode(message, 'chat');
          setIsCollapsePulsing(false);
        } : undefined}
      />
    );
  };

  // The service/inference pill belongs to the command bar, not to one mode's row.
  const keyInfoBadge = keyInfo?.hasServiceAndInference ? (
    <button
      type="button"
      data-no-drag
      data-testid="service-inference-status"
      onClick={keyInfo.onClick}
      aria-haspopup="dialog"
      className="group hidden cursor-pointer shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/20 bg-white/[0.05] px-2 py-[3px] text-[9px] font-bold uppercase leading-none tracking-[0.12em] text-white/80 transition-all duration-200 hover:border-white/40 hover:bg-white/[0.09] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 active:scale-[0.98] sm:inline-flex"
      title="Service & inference active — open the key dialog"
    >
      <span aria-hidden="true" className="command-status-dot h-1 w-1 rounded-full bg-white" />
      <span>Service &amp; Inference Enabled</span>
      <span aria-hidden="true" className="text-white/45 transition-transform duration-200 group-hover:translate-x-0.5">→</span>
    </button>
  ) : null;

  if (hasFullscreenA2UISurface) return null;

  // The terminal sits inside the canvas viewport, whose wheel handler zooms the
  // drawing. Keep wheel events here so scrolling the command history (or just
  // hovering the command line) never changes the scene scale.
  return (
    <div
      ref={terminalRootRef}
      style={{
        touchAction: 'none',
        right: rightExtension > 0
          ? `calc(-1 * var(--tool-shelf-width, ${rightExtension}px))`
          : 8,
        '--command-bar-text-scale': resolvedTextScale,
        backgroundImage: `radial-gradient(120% 180% at 8% 100%, rgba(255,255,255,0.055) 0%, transparent 44%), linear-gradient(180deg, #0a111a 0%, #080d14 52%, #070b11 100%)`,
      } as React.CSSProperties}
      onWheel={e => e.stopPropagation()}
      className="absolute bottom-2 left-2 z-30 select-none overflow-visible rounded-xl border border-white/20 bg-[#080d14] shadow-[0_18px_50px_rgba(0,0,0,0.6)] backdrop-blur-md font-mono text-white flex flex-col transition-colors"
      data-testid="canvas-command-bar"
      data-mode={inputMode}
    >
      {/* Top rail — white chrome. The active agent color starts at its socket and tab. */}
      <div className="relative h-px w-full overflow-hidden rounded-t-xl pointer-events-none">
        <div
          className="absolute inset-0"
          style={{ backgroundColor: 'rgba(255,255,255,0.85)', boxShadow: '0 0 9px rgba(255,255,255,0.28)' }}
        />
        <div className="absolute inset-0 overflow-hidden">
          <div
            aria-hidden="true"
            className="command-rail-sheen absolute inset-y-0 left-0 w-1/3"
            style={{ backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.9) 50%, transparent 100%)' }}
          />
          {isLoading && (
            <div
              data-testid="command-thinking-sweep"
              aria-hidden="true"
              className="command-thinking-sweep absolute inset-y-0 left-0 w-[18%]"
              style={{ backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(239,68,68,0.95) 50%, transparent 100%)' }}
            />
          )}
        </div>
      </div>

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
        className={`tab-bump group absolute bottom-full right-4 z-50 flex h-[20px] w-auto min-w-[40px] items-center justify-center rounded-[10px] border bg-[#0a111b] px-1.5 transition-all duration-200 hover:brightness-125 active:scale-95 ${
          isCollapsePulsing && isExpanded ? 'animate-pulse ring-2 ring-white/40' : ''
        }`}
        style={{
          borderColor: (onToggleToolDock ? isToolDockOpen : isExpanded) ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.25)',
          color: '#fff',
          boxShadow: (onToggleToolDock ? isToolDockOpen : isExpanded)
            ? '0 4px 14px rgba(0,0,0,0.75), 0 0 14px rgba(255,255,255,0.12), inset 0 1px 0 rgba(255,255,255,0.2)'
            : '0 -4px 14px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
      >
        <span className="tab-bump__lift flex items-center justify-center gap-1">
          {onToggleToolDock && !(isCollapsePulsing && isExpanded) && (
            <span className="text-[9px] font-bold uppercase tracking-[0.12em]">Tools</span>
          )}
          {(onToggleToolDock && !(isCollapsePulsing && isExpanded) ? isToolDockOpen : isExpanded)
            ? <ChevronDownIcon className="h-3.5 w-3.5 transition-transform duration-200" />
            : <ChevronUpIcon className="h-3.5 w-3.5 transition-transform duration-200" />}
        </span>
      </button>

      {/* Top resize handle when history / agent feed is expanded */}
      {isExpanded && (
        <div
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          onPointerCancel={handleResizePointerUp}
          className="h-1.5 w-full cursor-ns-resize bg-white/20 hover:bg-white/40 transition-colors"
          title="Drag up/down to adjust command bar height"
        />
      )}

      {/* Expanded Drawer Header Bar (Mode Switcher + Agent Controls & Accessories) */}
      {isExpanded && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] bg-[#0a1019] px-3 py-1.5 font-sans text-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Mode Tabs: CAD History vs Agent Feed */}
            <div className="inline-flex items-center rounded-md border border-white/20 bg-black/40 p-0.5">
              <button
                type="button"
                onClick={() => setInputMode('cad')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  inputMode === 'cad'
                    ? 'bg-white/[0.12] text-white border border-white/30'
                    : 'text-white/50 hover:text-white'
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
                    : 'text-white/50 hover:text-white'
                }`}
                style={
                  inputMode === 'agent'
                    ? { backgroundColor: `${accentColor}26`, borderColor: `${accentColor}66`, color: accentColor }
                    : undefined
                }
              >
                <AgentIcon className="w-3 h-3 shrink-0" style={{ color: accentColor }} />
                <span className="truncate max-w-[140px]">{agentLabel} [~]</span>
                <span aria-hidden="true" className="text-[9px] leading-none text-white/35">⠿</span>
              </button>
            </div>

            {inputMode === 'agent' && (
              <>
                {isLoading && (
                  <span
                    className="flex items-center gap-1 rounded-md border px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-[0.12em]"
                    style={{ borderColor: 'rgba(255,255,255,0.28)', color: '#fff', backgroundColor: 'rgba(255,255,255,0.07)' }}
                  >
                    <span className="h-1.5 w-1.5 animate-pulse rounded-sm" style={{ backgroundColor: accentColor }} />
                    Working ({(thinkingTime / 1000).toFixed(1)}s)
                  </span>
                )}
                <span className="hidden md:inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-white/45">
                  <span>Model:</span>
                  <span className="text-white/80">{modelLabel || 'Auto'}</span>
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
                    ? 'border-white/40 bg-white/[0.10] text-white'
                    : 'border-white/15 bg-white/[0.03] text-white/75 hover:border-white/30 hover:bg-white/[0.06] hover:text-white'
                }`}
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
                className={`flex h-6 w-6 items-center justify-center rounded border border-white/15 bg-white/[0.03] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  copyStatus === 'copied'
                    ? 'text-white border-white/40'
                    : copyStatus === 'error'
                    ? 'text-red-400 border-red-500/40'
                    : 'text-white/55 hover:bg-white/[0.06] hover:text-white'
                }`}
                title={copyStatus === 'copied' ? 'Copied!' : copyStatus === 'error' ? 'Copy failed' : 'Copy conversation'}
              >
                <DocumentDuplicateIcon className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={toggleExpand}
              className="flex h-6 w-6 items-center justify-center rounded border border-white/15 bg-white/[0.03] text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white"
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
          className="overflow-y-auto px-3 py-2 bg-[#05080d]/95 border-b border-white/15 text-[11px] leading-relaxed text-white select-text"
        >
          <div ref={feedContentRef} className="space-y-1">
          {history.map(item => {
            const toneColor = item.tone === 'error' ? 'text-red-300' : 'text-white';
            const tokens = item.text.trim().split(/\s+/);
            return (
              <div key={item.id} className="group flex items-start gap-2 rounded px-1 py-0.5 hover:bg-gray-800/40">
                {item.type === 'input' ? (
                  <>
                    <span className="shrink-0 select-none font-bold text-white">CAD &gt;</span>
                    <span className="break-words text-white/85">
                      <span className="font-semibold text-white">{tokens[0]}</span>
                      {tokens.length > 1 ? <span className="text-white/60"> {tokens.slice(1).join(' ')}</span> : null}
                    </span>
                  </>
                ) : (
                  <>
                    <span className={`shrink-0 select-none ${item.tone === 'error' ? 'text-red-500' : 'text-white/60'}`}>
                      {item.type === 'hint' ? '·' : '='}
                    </span>
                    <div className="min-w-0 flex-1">
                      {item.helpGroups?.length ? (
                        <CommandHelpView groups={item.helpGroups} notes={item.helpNotes} showCaption textScale={resolvedTextScale} className="mt-1" />
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
                      className="rounded border border-white/20 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-white/80 transition-colors hover:border-white/40 hover:bg-white/[0.08] hover:text-white"
                    >
                      {link.label}
                    </button>
                  ))}
                  <span className="text-[9px] tabular-nums text-white/30">
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
          className="overflow-x-hidden overflow-y-auto px-3.5 py-3 bg-[#05080d]/95 border-b border-white/15 font-sans text-xs leading-relaxed text-white select-text"
        >
          <div ref={feedContentRef} className="w-full min-w-0 space-y-3">
          {hiddenAgentMessageCount > 0 && (
            <div className="flex justify-center">
              <button
                type="button"
                data-testid="agent-show-earlier-messages"
                onClick={() => setShowEarlierAgentMessages(true)}
                className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.03] px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-white/55 transition-colors hover:border-white/30 hover:bg-white/[0.06] hover:text-white"
              >
                <ChevronUpIcon className="h-3 w-3" />
                Show {hiddenAgentMessageCount} earlier message{hiddenAgentMessageCount === 1 ? '' : 's'}
              </button>
            </div>
          )}
          {showEarlierAgentMessages && messages.length > 2 && latestModelHasContent && (
            <div className="flex justify-center">
              <button
                type="button"
                data-testid="agent-collapse-to-result"
                onClick={() => {
                  setShowEarlierAgentMessages(false);
                  window.requestAnimationFrame(() => scrollAgentFeedToMessageStart('auto'));
                }}
                className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.03] px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-white/55 transition-colors hover:border-white/30 hover:bg-white/[0.06] hover:text-white"
              >
                <ChevronDownIcon className="h-3 w-3" />
                Collapse to latest result
              </button>
            </div>
          )}
          {messages.length === 0 && !isLoading && (
            <div className="flex min-h-[150px] flex-col items-center justify-center px-4 text-center">
              <div
                className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/[0.03]"
                style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}
              >
                <AgentIcon className="h-5 w-5" style={{ color: accentColor }} />
              </div>
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">
                {isSpecialistPluggedIn ? 'Specialist Agent' : 'Project Assistant'}
              </p>
              <h3
                className="mt-1 text-sm font-black uppercase tracking-[0.16em]"
                style={{ color: accentColor, textShadow: `0 0 18px ${accentColor}55` }}
              >
                {agentLabel}
              </h3>
              <p className="mt-0.5 max-w-md text-[11px] text-white/50">
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
                      className="rounded-md border border-white/15 bg-white/[0.025] px-2.5 py-1 text-left text-[11px] text-white/75 transition-colors hover:border-white/30 hover:bg-white/[0.06] hover:text-white"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {visibleAgentMessages.map((msg, visibleIndex) => {
            const index = firstVisibleAgentMessageIndex + visibleIndex;
            const isLatestAgentMessage = index === messages.length - 1;
            return (
            <div
              key={index}
              ref={isLatestAgentMessage ? latestAgentMessageRef : undefined}
              data-testid={isLatestAgentMessage ? 'agent-latest-message' : `agent-message-${index}`}
              data-latest-result={isLatestAgentMessage && isLatestResultFocused ? 'true' : undefined}
              className={`flex w-full min-w-0 flex-col gap-1 ${msg.role === MessageRole.USER ? 'items-end' : 'items-start'} ${
                isLatestAgentMessage && isLatestResultFocused
                  ? 'rounded-lg bg-white/[0.015] ring-1 ring-inset ring-white/10'
                  : ''
              }`}
            >
              {msg.role === MessageRole.USER ? (
                <span className="px-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white/40">You</span>
              ) : (
                <span className="inline-flex items-center gap-2 px-1">
                  <span
                    aria-hidden="true"
                    className="h-[2px] w-5 rounded-full bg-white/80"
                    style={{ boxShadow: '0 0 8px rgba(255,255,255,0.3)' }}
                  />
                  <span
                    className="text-[10px] font-black uppercase leading-none tracking-[0.22em]"
                    style={{ color: accentColor, textShadow: `0 0 14px ${accentColor}66` }}
                  >
                    {agentLabel}
                  </span>
                  <span aria-hidden="true" className="text-[9px] leading-none" style={{ color: `${accentColor}cc` }}>✦</span>
                </span>
              )}
              <div
                className={`min-w-0 max-w-[94%] md:max-w-3xl p-2.5 rounded-lg overflow-hidden ${
                  msg.role === MessageRole.USER
                    ? 'bg-[#1a2431] text-white rounded-br-none border border-white/15'
                    : 'bg-[#0f1620] text-white/90 rounded-bl-none border border-white/15'
                }`}
              >
                {msg.role === MessageRole.MODEL && formatModelDisplay(msg.model || currentModelName) && (
                  <div className="mb-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide bg-white/[0.06] text-white/80 border border-white/15">
                    <SparklesIcon className="w-3 h-3 text-white/60" />
                    <span>{formatModelDisplay(msg.model || currentModelName)}</span>
                  </div>
                )}
                {msg.thinking && (
                  <div className="mb-2">
                    <button
                      type="button"
                      onClick={() => onToggleExpandMessage?.(index)}
                      className="flex items-center gap-1 text-xs text-white/55 font-semibold mb-1 hover:text-white"
                    >
                      {msg.isExpanded ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
                      AI&apos;s Thought Process
                    </button>
                    {msg.isExpanded && (
                      <p
                        className="text-xs text-white/50 border-l-2 border-white/20 pl-2"
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
                          return '<span class="text-white/40 italic">Researching live ordinance… (see Claw status)</span>';
                        }
                        return formatChatHtml(cleaned);
                      }
                      return formatChatHtml(raw);
                    })(),
                  }}
                />

                {/* A2UI Interactive Upload / Intake Surface */}
                {renderA2UICard(msg)}

                {/* Interactive clarifying question options */}
                {msg.questionOptions && msg.questionOptions.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-white/15">
                    <div className="text-[11px] font-semibold text-white/60 mb-1.5 flex items-center gap-1.5">
                      <LightbulbIcon className="w-3.5 h-3.5 text-white/50" />
                      <span>Select an option:</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {msg.questionOptions.map((opt, optIdx) => (
                        <button
                          key={optIdx}
                          type="button"
                          onClick={() => onSendMessage?.(opt)}
                          disabled={isLoading}
                          className="text-xs px-3 py-1.5 rounded-md font-medium text-left transition-all bg-white/[0.04] text-white border border-white/20 hover:bg-white/[0.08] hover:border-white/35 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Grounding sources */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-white/15">
                    <details className="group">
                      <summary className="cursor-pointer text-xs text-white/70 hover:text-white flex items-center gap-1">
                        <span>View Sources ({msg.sources.length} page{msg.sources.length !== 1 ? 's' : ''})</span>
                      </summary>
                      <div className="mt-1.5 space-y-1">
                        {msg.sources.map((source: any, idx: number) => (
                          <div key={idx} className="text-xs">
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-white/75 hover:text-white hover:underline inline-flex items-center gap-1"
                            >
                              <span>{source.searchTitle || source.url?.split('/').pop() || 'Ordinance Page'}</span>
                            </a>
                            {source.wordCount && (
                              <span className="text-white/35 ml-2">({source.wordCount.toLocaleString()} words)</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                )}
              </div>
            </div>
            );
          })}

          {standaloneA2UIMessage?.a2ui && !hasChatMessageForStandalone && (
            <div
              data-testid="a2ui-standalone-chat-message"
              className="flex w-full min-w-0 flex-col gap-1 items-start"
            >
              <span className="inline-flex items-center gap-2 px-1">
                <span aria-hidden="true" className="h-[2px] w-5 rounded-full bg-emerald-300/80" />
                <span className="text-[10px] font-black uppercase leading-none tracking-[0.22em] text-emerald-300">
                  Interactive Surface
                </span>
              </span>
              <div className="min-w-0 max-w-[94%] md:max-w-3xl p-2.5 rounded-lg overflow-hidden bg-[#0f1620] text-white/90 rounded-bl-none border border-white/15">
                {renderA2UICard(standaloneA2UIMessage)}
              </div>
            </div>
          )}

          {chatToolDialogs.length > 0 && (
            <ChatToolDialogs items={chatToolDialogs} />
          )}

          {isLoading && messages[messages.length - 1]?.role === MessageRole.MODEL && (
            <div className="flex items-start gap-2 justify-start">
              <div className="p-2.5 rounded-lg bg-[#0f1620] text-white/80 rounded-bl-none border border-white/15">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-white/40 rounded-sm animate-pulse" style={{ animationDelay: '0s' }} />
                  <div className="w-2 h-2 bg-white/40 rounded-sm animate-pulse" style={{ animationDelay: '0.2s' }} />
                  <div className="w-2 h-2 bg-white/40 rounded-sm animate-pulse" style={{ animationDelay: '0.4s' }} />
                  <span className="text-xs text-white/40 ml-1">({(thinkingTime / 1000).toFixed(1)}s)</span>
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
      <div className="relative flex items-stretch bg-transparent pl-16 pr-3">
        <div className="command-bar-rows flex min-w-0 flex-1 flex-col border-l border-white/[0.07] pl-1">
          {/* Line 1: Single History / Feedback / Instructional Row */}
          {/* Reserve room for the right-hand drawer tab so links and SNAP/ORTHO
              badges never run underneath its label. */}
          <div
            data-testid="command-history-row"
            className={`flex items-center gap-2 py-1 pl-3 bg-transparent text-[10px] leading-none min-h-[22px] ${
              isSnapMenuOpen ? 'overflow-visible' : 'overflow-hidden'
            } ${onToggleToolDock && !(isCollapsePulsing && isExpanded) ? 'pr-24' : 'pr-14'}`}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${isLoading ? 'animate-pulse' : ''}`}
              style={{
                backgroundColor: inputMode === 'agent' ? accentColor : 'rgba(255,255,255,0.8)',
                boxShadow: `0 0 7px ${inputMode === 'agent' ? accentColor : 'rgba(255,255,255,0.32)'}`,
              }}
            />
            {inputMode === 'agent' && !activePrompt ? (
              <span className="truncate font-medium text-white">
                <span className="mr-1.5 uppercase tracking-wider text-white/50">[{agentLabel}]</span>
                {isLoading
                  ? `Thinking… (${(thinkingTime / 1000).toFixed(1)}s)`
                  : latestAgentPreview || (
                      <span
                        onClick={executeHelp}
                        className="group/help text-white/50 hover:text-white cursor-pointer transition-colors"
                        title="Click to view commands (or type HELP)"
                      >
                        <span className="border-b border-transparent pb-px transition-colors group-hover/help:border-white/40">
                          Type Help for commands
                        </span>
                      </span>
                    )}
              </span>
            ) : historyNavText ? (
              <span className="truncate text-white/80 font-medium">
                {historyNavText}
              </span>
            ) : activePrompt ? (
              <span className="truncate text-white/75 font-medium">
                <span className="uppercase tracking-wider mr-1 opacity-60">Instruction:</span>
                {activePrompt}
              </span>
            ) : latestEntry ? (
              <span
                className={`truncate ${
                  latestEntry.tone === 'error' ? 'text-red-400 font-semibold' : 'text-white/75'
                }`}
              >
                {latestEntry.helpGroups?.length
                  ? `HELP — ${latestEntry.helpGroups.length} groups · ${latestEntry.helpGroups.reduce((total, group) => total + group.entries.length, 0)} commands — see history`
                  : latestEntry.text}
              </span>
            ) : (
              <span
                onClick={executeHelp}
                className="group/help truncate text-white/50 hover:text-white cursor-pointer transition-colors"
                title="Click to view commands (or type HELP)"
              >
                <span className="border-b border-transparent pb-px transition-colors group-hover/help:border-white/40">
                  Type Help for commands
                </span>
              </span>
            )}

            {inputMode === 'cad' && latestEntry?.links?.length ? (
              <span className="flex shrink-0 items-center gap-1.5 border-l border-white/15 pl-2">
                {latestEntry.links.slice(0, 3).map((link, index) => (
                  <button
                    key={`latest-link-${index}`}
                    type="button"
                    onClick={link.onClick}
                    className="rounded border border-white/20 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-white/80 transition-colors hover:border-white/40 hover:bg-white/[0.08] hover:text-white"
                  >
                    {link.label}
                  </button>
                ))}
              </span>
            ) : null}

            {/* Live Snaps / Ortho Badges in the history line */}
            <div className="ml-auto flex items-center gap-2 shrink-0 text-[10px] border-l border-white/15 pl-2">
              {onOpenProperties && (
                <button
                  type="button"
                  data-no-drag
                  data-has-selection={hasPropertiesSelection ? 'true' : 'false'}
                  onClick={onOpenProperties}
                  aria-label={hasPropertiesSelection ? `Properties — ${propertiesSelectionTotal} selected` : 'Properties'}
                  className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-all duration-150 ${
                    hasPropertiesSelection
                      ? 'bg-sky-500/15 font-semibold text-sky-300 ring-1 ring-inset ring-sky-400/60 shadow-[0_0_10px_rgba(56,189,248,0.35)]'
                      : 'text-white/75 hover:bg-white/[0.08] hover:text-white'
                  }`}
                  title={hasPropertiesSelection
                    ? `Properties — ${propertiesSelectionTotal} ${propertiesSelectionTotal === 1 ? 'item' : 'items'} selected; click to inspect and edit (or type PROP)`
                    : 'Properties — inspect and edit selected entities (or type PROP)'}
                >
                  {hasPropertiesSelection ? (
                    <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-300 opacity-60 motion-reduce:animate-none" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sky-300 shadow-[0_0_7px_#38bdf8]" />
                    </span>
                  ) : null}
                  PROPERTIES
                </button>
              )}
              {onCycleAgentDrawMode && (
                <button
                  type="button"
                  data-no-drag
                  onClick={onCycleAgentDrawMode}
                  className="relative inline-flex min-w-[20px] items-center justify-center rounded px-1.5 py-0.5 text-[11px] font-medium leading-none text-white/80 transition-all duration-150 ease-out hover:z-10 hover:scale-110 hover:bg-white/[0.08] hover:font-bold hover:text-white hover:shadow-[0_0_10px_rgba(255,255,255,0.12)]"
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
                  className="relative inline-flex min-w-[20px] items-center justify-center rounded px-1.5 py-0.5 text-[11px] font-medium leading-none text-white/80 transition-all duration-150 ease-out hover:z-10 hover:scale-110 hover:bg-white/[0.08] hover:font-bold hover:text-white hover:shadow-[0_0_10px_rgba(255,255,255,0.12)]"
                  title={`Next-draw annotation output: ${agentAnnotMode === 'both' ? 'Bearing & Distance' : agentAnnotMode === 'bearing' ? 'Bearing only' : 'Distance only'} — click to cycle. Existing labels stay unchanged; AI and CAD exports use this preference.`}
                >
                  {agentAnnotMode === 'both' ? 'B/D' : agentAnnotMode === 'bearing' ? 'B' : 'D'}
                </button>
              )}
              {showStatusBadges && statusBadges?.isOrthoEnabled !== undefined && (
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider transition-colors ${
                    statusBadges.isOrthoEnabled
                      ? 'border-white/25 bg-white/[0.06] text-white/80'
                      : 'border-white/10 bg-white/[0.02] text-white/35'
                  }`}
                  title={`Ortho ${statusBadges.isOrthoEnabled ? 'on' : 'off'}`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-1 w-1 rounded-full ${statusBadges.isOrthoEnabled ? 'bg-white shadow-[0_0_5px_rgba(255,255,255,0.55)]' : 'bg-white/25'}`}
                  />
                  ORTHO
                </span>
              )}
              {showStatusBadges && statusBadges?.runningOsnaps && (() => {
                const snapsEnabled = snapControls?.enabled ?? true;
                const enabledCount = snapControls?.options.filter(option => option.enabled).length ?? 0;
                return (
                  <div ref={snapControlRef} className="relative flex shrink-0 items-center">
                    <div
                      className={`inline-flex items-stretch overflow-hidden rounded border text-[9px] font-semibold uppercase tracking-wider transition-colors ${
                        snapsEnabled
                          ? 'border-white/25 bg-white/[0.06] text-white/80'
                          : 'border-white/10 bg-white/[0.02] text-white/35'
                      }`}
                    >
                      <button
                        type="button"
                        data-no-drag
                        data-testid="snap-global-toggle"
                        aria-pressed={snapsEnabled}
                        aria-label={snapsEnabled ? 'Turn running snaps off' : 'Turn running snaps on'}
                        onClick={() => snapControls?.onToggleEnabled()}
                        title={
                          snapsEnabled
                            ? `Running snaps on${statusBadges.runningOsnaps ? `: ${statusBadges.runningOsnaps}` : ''} — click to turn off`
                            : 'Running snaps off — click to turn on'
                        }
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 transition-colors hover:bg-white/[0.08]"
                      >
                        <span
                          aria-hidden="true"
                          className={`h-1 w-1 shrink-0 rounded-full ${
                            snapsEnabled ? 'bg-white shadow-[0_0_5px_rgba(255,255,255,0.55)]' : 'bg-white/25'
                          }`}
                        />
                        <span>SNAP</span>
                      </button>
                      {snapControls && (
                        <button
                          type="button"
                          data-no-drag
                          data-testid="snap-settings-toggle"
                          aria-label="Choose running snap types"
                          aria-haspopup="menu"
                          aria-expanded={isSnapMenuOpen}
                          onClick={() => setIsSnapMenuOpen(open => !open)}
                          className={`border-l px-1 transition-colors hover:bg-white/[0.08] ${
                            isSnapMenuOpen ? 'border-white/40' : 'border-white/10'
                          }`}
                        >
                          <ChevronDownIcon className={`h-2.5 w-2.5 transition-transform ${isSnapMenuOpen ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                    </div>

                    {isSnapMenuOpen && snapControls && (
                      <div
                        data-testid="snap-settings-menu"
                        role="menu"
                        className="absolute bottom-full right-0 z-[80] mb-2 w-60 rounded-lg border border-white/25 bg-[#080e15]/95 p-2 text-[11px] text-white/80 shadow-2xl backdrop-blur-md"
                      >
                        <div className="flex items-start justify-between gap-3 border-b border-white/15 px-1 pb-1.5">
                          <div>
                            <div className="font-semibold text-white">Running snaps</div>
                            <div className="mt-0.5 text-[9px] uppercase tracking-wider text-white/40">
                              {snapsEnabled ? `${enabledCount} active type${enabledCount === 1 ? '' : 's'}` : 'Globally off'}
                            </div>
                          </div>
                          <button
                            type="button"
                            data-testid="snap-menu-global-toggle"
                            role="switch"
                            aria-checked={snapsEnabled}
                            onClick={() => snapControls.onToggleEnabled()}
                            className={`rounded border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-colors ${
                              snapsEnabled
                                ? 'border-white/35 bg-white/[0.08] text-white'
                                : 'border-white/10 bg-white/[0.03] text-white/40'
                            }`}
                          >
                            {snapsEnabled ? 'On' : 'Off'}
                          </button>
                        </div>
                        <div className="mt-1.5 space-y-0.5">
                          {snapControls.options.map(option => {
                            const isLastSelected = option.enabled && enabledCount <= 1;
                            return (
                              <label
                                key={option.id}
                                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-white/[0.05]"
                                title={isLastSelected ? 'Keep one snap type selected, or turn running snaps off globally.' : undefined}
                              >
                                <input
                                  type="checkbox"
                                  checked={option.enabled}
                                  disabled={isLastSelected}
                                  onChange={() => snapControls.onToggleOption(option.id)}
                                  className="accent-white"
                                />
                                <span>{option.label}</span>
                              </label>
                            );
                          })}
                        </div>
                        <p className="mt-2 border-t border-white/10 px-1 pt-1.5 text-[9px] leading-relaxed text-white/35">
                          Shift + right-click the canvas for a one-pick snap override.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Single command row. Agent chat is the default face; the CAD input
              replaces this row only while the CAD line is active. */}
          {!(isCommandLineActive && inputMode === 'cad') && (
          <div
            data-testid="agent-command-row"
            className="relative flex h-7 items-center gap-2 bg-transparent px-3 transition-colors duration-200"
            style={{
              boxShadow:
                isCommandLineActive && inputMode === 'agent'
                  ? 'inset 0 -1px 0 rgba(255,255,255,0.35)'
                  : undefined,
            }}
          >
            {isCommandLineActive && inputMode === 'agent' && !isAgentFloating ? (
              <form onSubmit={handleAgentSubmit} className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 -mx-1 transition-colors duration-200 focus-within:bg-white/[0.025]">
                <span
                  className="font-bold text-xs shrink-0 tracking-tight flex items-center gap-1"
                  style={{ color: accentColor }}
                >
                  {agentWordmark}
                  <span>&gt;</span>
                </span>
                <span
                  className="shrink-0 rounded border border-white/25 bg-white/[0.06] px-1 py-px text-[8px] font-bold uppercase tracking-[0.14em] text-white/85"
                  title="Press Esc to close the agent command line"
                >
                  Press Esc
                </span>
                <input
                  ref={agentInputRef}
                  data-no-drag
                  type="text"
                  value={agentInputText}
                  onChange={e => setAgentInputText(e.target.value)}
                  onKeyDown={handleKeyDownAgentInput}
                  placeholder={`Ask ${agentLabel} anything...`}
                  className="min-w-0 flex-1 bg-transparent text-white placeholder-white/35 outline-none font-sans text-xs selection:bg-white/20"
                  autoComplete="off"
                />
                {suggestedQuestions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowSuggestions(p => !p)}
                    className="p-1 text-white/60 hover:bg-white/[0.08] hover:text-white rounded transition-colors shrink-0"
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
                    style={{ backgroundColor: 'rgba(255,255,255,0.10)', borderColor: 'rgba(255,255,255,0.30)', color: '#fff' }}
                    title="Send to Agent"
                  >
                    <SendIcon className="h-3 w-3" />
                  </button>
                )}
              </form>
            ) : (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <button
                  type="button"
                  data-no-drag
                  onClick={focusAgentCommandLine}
                  className="group flex min-w-0 items-center gap-1.5 bg-transparent text-left cursor-pointer"
                  title={`Press Shift+Space to talk to ${agentLabel}`}
                  aria-label="Activate agent mode"
                >
                  <span className="font-bold text-xs shrink-0 tracking-tight flex items-center gap-1" style={{ color: accentColor }}>
                    {agentWordmark}
                    <span>&gt;</span>
                  </span>
                  {showShortcutHints && (
                    <span className="truncate font-sans text-[10px] text-white/50 transition-colors group-hover:text-white">
                      Ask the AI agent — Shift+Space
                    </span>
                  )}
                  <span
                    className="shrink-0 rounded border px-1 py-px text-[8px] font-bold uppercase tracking-[0.14em]"
                    style={{
                      borderColor: 'rgba(255,255,255,0.25)',
                      backgroundColor: 'rgba(255,255,255,0.06)',
                      color: 'rgba(255,255,255,0.85)',
                    }}
                    title="AI agent line — free-form requests"
                  >
                    AI
                  </span>
                </button>
                <div
                  data-testid="agent-ephemeral-toolshelf"
                  aria-hidden="true"
                  className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-1"
                />
                {showShortcutHints && (
                  <button
                    type="button"
                    data-no-drag
                    onClick={activateCommandLine}
                    className="shrink-0 whitespace-nowrap rounded-md border border-white/20 bg-white/[0.04] px-2 py-0.5 font-mono text-[9px] font-medium tracking-tight text-white/75 transition-colors hover:border-white/40 hover:bg-white/[0.08] hover:text-white"
                    title="Open the deterministic CAD command bar (Space)"
                    aria-label="Activate command line: Press Space for CAD Command bar"
                  >
                    Press Space for CAD Command bar
                  </button>
                )}
              </div>
            )}
            {keyInfoBadge}
          </div>
          )}

          {/* Deterministic CAD input — takes over the same row only while active. */}
          {isCommandLineActive && inputMode === 'cad' && (
            <div
              data-testid="cad-command-row"
              className="relative flex h-7 items-center gap-2 bg-transparent px-3 transition-colors duration-200"
            >
              <form onSubmit={handleSubmit} className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 -mx-1 transition-colors duration-200 focus-within:bg-white/[0.025] focus-within:shadow-[inset_0_-1px_0_rgba(255,255,255,0.2)]">
                <span className="text-white font-bold text-xs shrink-0 tracking-tight flex items-center gap-1">
                  <span className="text-white">CAD</span>
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
                    // An empty CAD line returns to the agent-first resting row;
                    // typed text stays open until the user clears or closes it.
                    if (!e.currentTarget.value.trim()) setIsCommandLineActive(false);
                  }}
                  placeholder="Type Help for Commands"
                  className="min-w-0 flex-1 bg-transparent text-white placeholder-white/35 outline-none font-mono text-xs selection:bg-white/20"
                  spellCheck={false}
                  autoComplete="off"
                />
                {parsedPreview?.verb ? (
                  <span
                    className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${previewDescription ? 'border-white/25 bg-white/[0.06] text-white/80' : 'border-red-500/40 bg-red-500/10 text-red-300'}`}
                    title={previewDescription ?? 'Unknown deterministic command — type HELP, or press Shift+Space to ask the AI agent'}
                  >
                    {previewDescription ? parsedPreview.verb.replace(/_/g, ' ') : 'unknown'}
                  </span>
                ) : null}
                <span
                  className="inline shrink-0 rounded border border-white/20 bg-white/[0.05] px-1 py-px text-[8px] font-bold uppercase tracking-[0.14em] text-white/70"
                  title="Press Esc to close the CAD command line"
                >
                  Press Esc
                </span>
              </form>
              {keyInfoBadge}
            </div>
          )}
        </div>

        {/* Hidden in-bar socket slot on the left. The visible dock is portaled to <body> so
            the plug and quick-thought card stack above the tool shelf and every
            floating dialog; this anchor keeps that dock at the exact spot the
            command bar was designed around, with the plug's top rising above the
            bar for the accent rail to wrap as a socket tab. */}
        <div
          ref={socketAnchorRef}
          aria-hidden="true"
          data-testid="agent-socket-anchor"
          className="pointer-events-none absolute left-1 bottom-[3px] h-14 w-14"
        />
        {typeof document !== 'undefined' && createPortal(
          <div
            data-testid="agent-dock"
            className="pointer-events-none fixed z-[10020] flex items-center"
            style={agentDockPos
              ? { left: agentDockPos.left, top: agentDockPos.top, width: 56, height: 56 }
              : { left: 4, bottom: 3 }}
          >
        {/* Agent Socket — a raised plug seated into the left of the command bar.
            The bar's accent rail climbs into a socket tab around its exposed top;
            the large square face is the draggable plug. */}
        <div className="pointer-events-auto relative flex items-center">
          {/* The full feed already shows the prompt, so don't duplicate it above the socket. */}
          {isQuickThoughtVisible && (
            <div
              data-testid="agent-thought-bubble"
              role="dialog"
              aria-label="Quick thought"
              onPointerDownCapture={e => {
                rememberCanvasPointer(e.clientX, e.clientY);
                handleQuickThoughtInteraction();
              }}
              onFocusCapture={handleQuickThoughtInteraction}
              onMouseEnter={handleQuickThoughtPointerEnter}
              onMouseLeave={handleQuickThoughtPointerLeave}
              className="absolute bottom-full left-0 z-[10030] mb-6 w-[min(336px,calc(100vw-24px))] animate-fade-in-up overflow-hidden rounded-xl border border-white/20 bg-[#0a1018]/[0.985] font-sans text-white shadow-[0_18px_44px_-12px_rgba(0,0,0,0.85)] backdrop-blur-xl"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.8), rgba(255,255,255,0.12) 55%, transparent)' }}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 w-1"
                style={{ backgroundColor: accentColor }}
              />
              <div className="flex items-center gap-2 px-3 pb-2 pt-2.5">
                <span
                  aria-hidden="true"
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04]"
                >
                  <AgentIcon className="h-3 w-3" style={{ color: accentColor }} />
                </span>
                <span className="truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-white/85">
                  Quick Thought
                </span>
                <span
                  className="max-w-[45%] shrink-0 truncate font-mono text-[10px] font-semibold uppercase tracking-[0.16em]"
                  style={{ color: accentColor }}
                >
                  {lastMessage?.quickThoughtText ? quickThoughtLabel : 'Needs input'}
                </span>
                <button
                  type="button"
                  data-no-drag
                  data-testid="dismiss-agent-notification"
                  onClick={() => {
                    if (thoughtKey) setDismissedThoughtKey(thoughtKey);
                    setHoverReveal(null);
                    clearQuickThoughtHideTimer();
                  }}
                  className="ml-auto -mr-1 shrink-0 rounded p-1 text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white"
                  aria-label="Dismiss quick thought"
                  title="Dismiss quick thought"
                >
                  <XMarkIcon className="h-3 w-3" />
                </button>
              </div>

              <div className="px-3 pb-3">
                <div
                  ref={thoughtTextRef}
                  data-testid="agent-thought-text"
                  title={thoughtText}
                  className="max-h-[52px] overflow-y-auto overscroll-contain text-[12px] leading-[1.5] text-white/70 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  <div
                    className={isThoughtOverflowing ? 'quick-thought-drift' : undefined}
                    style={isThoughtOverflowing ? { animationDuration: `${thoughtDriftSeconds}s` } : undefined}
                  >
                    {thoughtScrollText || (hasPendingQuestionOptions ? 'I have a suggestion for the next step.' : 'I have a quick panel ready for you.')}
                  </div>
                </div>

                {lastMessage && (
                  <A2UIQuickThoughtSurface
                    breakdown={quickThoughtBreakdown}
                    message={lastMessage}
                    isLoading={isLoading}
                    onSendMessage={onSendMessage}
                    onOpenConversation={() => openAgentConversation(true)}
                    onDock={
                      lastMessage.a2ui
                        ? onSetA2UIDockMode
                          ? () => {
                              onSetA2UIDockMode(lastMessage, 'toolshelf');
                              setIsExpanded(false);
                              setIsCollapsePulsing(false);
                            }
                          : onToggleA2UIDock
                            ? () => {
                                onToggleA2UIDock(lastMessage);
                                setIsExpanded(false);
                                setIsCollapsePulsing(false);
                              }
                            : undefined
                        : undefined
                    }
                    onPopOut={
                      lastMessage.a2ui
                        ? onSetA2UIDockMode
                          ? () => {
                              onSetA2UIDockMode(lastMessage, 'floating');
                              setIsCollapsePulsing(false);
                            }
                          : onToggleA2UIFloat
                            ? () => {
                                onToggleA2UIFloat(lastMessage);
                                setIsCollapsePulsing(false);
                              }
                            : undefined
                        : undefined
                    }
                    onChat={
                      onSetA2UIDockMode && lastMessage.a2ui
                        ? () => {
                            onSetA2UIDockMode(lastMessage, 'chat');
                            setIsCollapsePulsing(false);
                          }
                        : undefined
                    }
                    boundaryQuickActions={boundaryQuickActions}
                  />
                )}
              </div>

            </div>
          )}
          {/* Socket Tab — a single stroked collar wrapping the plug's exposed
              top. Stroke radius is the plug radius plus the rail gap, so the
              two curves share a center and stay parallel through the corners. */}
          <svg
            aria-hidden="true"
            data-testid="agent-socket-tab"
            className="pointer-events-none absolute -left-[6px] -top-[6px] h-[30px] w-[68px] overflow-visible"
            viewBox="0 0 68 30"
            fill="none"
          >
            {/* Gasket: fills the collar's breathing gap with the bar's top
                color so the horizontal accent rail stops at the collar instead
                of showing through the gap and crossing the tab line. */}
            <path
              d="M18 1H50A17 17 0 0 1 67 18V29H1V18A17 17 0 0 1 18 1Z"
              fill="#0a111a"
            />
            <path
              d="M2 26V18a16 16 0 0 1 16-16h32a16 16 0 0 1 16 16v8"
              stroke="rgba(255,255,255,0.85)"
              strokeWidth="2"
              strokeLinecap="round"
              style={{ filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.3))' }}
            />
          </svg>
          <button
            type="button"
            data-no-drag
            data-testid="agent-plug-socket"
            onPointerDown={handleAgentDragStart}
            onMouseEnter={revealQuickThoughtOnHover}
            onMouseLeave={scheduleQuickThoughtHide}
            onClick={() => {
              if (Date.now() < suppressAgentClickUntilRef.current) return;
              toggleBottomAgentChat();
              onToggleAgentChat?.();
            }}
            aria-expanded={isBottomAgentChatOpen}
            className={`agent-socket ${isBottomAgentChatOpen || isSpecialistPluggedIn ? 'agent-socket--live' : ''} tab-bump group relative flex h-14 w-14 aspect-square cursor-grab flex-col items-center justify-center gap-1 rounded-xl transition-all duration-200 hover:brightness-110 active:cursor-grabbing active:scale-[0.97] ${
              isLoading ? 'animate-pulse' : ''
            }`}
            style={{ '--socket-accent': accentColor } as React.CSSProperties}
            title={`${isBottomAgentChatOpen ? 'Collapse' : 'Open'} ${agentLabel} chat (drag out to float the command line)`}
            aria-label={`${isBottomAgentChatOpen ? 'Close' : 'Open'} agent chat for ${agentLabel}`}
          >
            {/* Recessed inner rim: inset 3px with a 9px radius so it, too, is
                concentric with the plug face. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-[3px] rounded-[9px] border"
              style={{
                borderColor: `${accentColor}24`,
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -6px 10px rgba(0,0,0,0.35)',
              }}
            />
            <span className="tab-bump__lift relative flex items-center justify-center">
              <AgentIcon
                className="h-10 w-10 transition-transform duration-200 group-hover:scale-105"
                style={{ color: accentColor }}
              />
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
          className="fixed z-[80] w-[min(540px,94vw)] overflow-hidden rounded-xl border border-white/20 font-sans text-white backdrop-blur-xl"
          style={{
            left: floatingPos.x,
            top: floatingPos.y,
            backgroundColor: 'rgba(9, 15, 24, 0.62)',
            boxShadow: '0 22px 60px rgba(0,0,0,0.68), 0 0 0 1px rgba(255,255,255,0.10)',
          }}
        >
          <div
            onPointerDown={handleFloatPointerDown}
            onPointerMove={handleFloatPointerMove}
            onPointerUp={handleFloatPointerUp}
            onPointerCancel={handleFloatPointerUp}
            className="flex cursor-grab select-none items-center gap-2 border-b border-white/15 bg-white/[0.04] px-3 py-1.5 active:cursor-grabbing"
            style={{ touchAction: 'none' }}
          >
            <span aria-hidden="true" className="text-[10px] leading-none text-white/35">⠿</span>
            <AgentIcon className="h-3.5 w-3.5 shrink-0" style={{ color: accentColor }} />
            <span className="truncate text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: accentColor }}>
              {agentWordmark}
            </span>
            <span className="rounded border border-white/20 bg-white/[0.05] px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-[0.12em] text-white/55">
              floating
            </span>
            {isLoading && (
              <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.12em] text-white/70">
                <span className="h-1.5 w-1.5 animate-pulse rounded-sm" style={{ backgroundColor: accentColor }} />
                {(thinkingTime / 1000).toFixed(1)}s
              </span>
            )}
            <span className="ml-auto hidden font-mono text-[9px] uppercase tracking-wider text-white/40 sm:inline">
              {modelLabel || 'Auto'}
            </span>
            <button
              data-no-drag
              type="button"
              onClick={dockAgentBack}
              className="rounded border border-white/20 bg-white/[0.04] p-1 text-white/55 transition-colors hover:border-white/35 hover:text-white"
              title="Dock agent back into the command bar"
              aria-label="Dock agent back into the command bar"
            >
              <ArrowDownOnSquareIcon className="h-3.5 w-3.5" />
            </button>
          </div>

          {latestAgentMessage && (
            <div className="max-h-[26vh] overflow-y-auto px-3 py-2 text-[11.5px] leading-relaxed text-white/85 [overflow-wrap:anywhere]">
              <div className="mb-1 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: accentColor, textShadow: `0 0 12px ${accentColor}55` }}>
                <span aria-hidden="true" className="h-px w-3 rounded-full bg-white/80" />
                {agentLabel}
                <span aria-hidden="true" style={{ color: `${accentColor}cc` }}>✦</span>
              </div>
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

          <form onSubmit={handleAgentSubmit} className="flex items-center gap-2 border-t border-white/15 px-3 py-2">
            <span className="flex shrink-0 items-center gap-1 text-xs font-bold tracking-tight" style={{ color: accentColor }}>
              {agentWordmark}
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
              className="min-w-0 flex-1 bg-transparent text-white placeholder-white/35 outline-none text-xs selection:bg-white/20"
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
                style={{ backgroundColor: 'rgba(255,255,255,0.10)', borderColor: 'rgba(255,255,255,0.30)', color: '#fff' }}
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
