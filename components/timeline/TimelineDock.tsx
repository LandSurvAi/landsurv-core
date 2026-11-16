import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useOptionalTimeline } from '../../contexts/TimelineContext.tsx';
import { PROJECT_GEOMETRY_EVENT } from '../../utils/referenceGeometry.ts';
import { useOptionalUIState } from '../../contexts/UIStateContext.tsx';
import { COMMAND_DOCK_LAYOUT_EVENT } from '../../utils/layoutEvents.ts';
import { useTimelineVisibility } from './timelineVisibility.ts';
import { useTimelineLayoutInsets } from './useTimelineLayoutInsets.ts';
import { TIMELINE_ICON_LABELS, TimelineGlyph } from './TimelineGlyph.tsx';
import type {
  TimelineFeatureView,
  TimelineIcon,
} from '../../utils/timeline/types.ts';

/** The timeline belongs to the drawing workspace, never the home/landing shell. */
export function shouldShowTimelineDock(ui: {
  pageMode: string | null;
  activeVisualPanel: string;
  isInitialScreen: boolean;
  showWelcome: boolean;
} | null): boolean {
  if (!ui) return true;
  return ui.pageMode === 'app'
    && ui.activeVisualPanel === 'canvas'
    && !ui.isInitialScreen
    && !ui.showWelcome;
}

function toggleGroupExpansion(current: Set<string>, featureId: string): Set<string> {
  const next = new Set(current);
  if (next.has(featureId)) next.delete(featureId);
  else next.add(featureId);
  return next;
}

const KIND_LABELS: Record<string, string> = {
  baseline: 'Base',
  sketch: 'Sketch',
  'manual-feature': 'Feature',
  'ai-turn': 'AI',
  import: 'Import',
  display: 'Display',
  'param-generation': 'Generate',
  event: 'Action',
  utterance: 'Question',
};

const STATUS_LABELS: Record<TimelineFeatureView['status'], string> = {
  applied: 'Applied',
  current: 'Current step',
  future: 'Future step',
  suppressed: 'Suppressed',
  error: 'Replay error',
  pending: 'Waiting',
  stale: 'Needs review',
};

const MAX_COLLAPSED_CHILDREN = 4;

/** `TimelineAuthor.agent` value used by the Stationing & CL agent. */
const STATIONING_AGENT = 'CENTERLINE_STATIONING';

function iconForFeature(feature: TimelineFeatureView): TimelineIcon {
  if (feature.icon) return feature.icon;
  // Alignment work reads as the Stationing & CL agent: an actual centerline
  // delta, or an entry authored by that agent, beats the generic AI glyph.
  if (
    feature.author.agent === STATIONING_AGENT
    || feature.deltas.some(delta => delta.kind === 'centerline')
  ) {
    return 'station';
  }
  switch (feature.kind) {
    case 'baseline': return 'baseline';
    case 'sketch': return 'sketch';
    case 'import': return 'upload';
    case 'display': return 'display';
    case 'param-generation': return 'generate';
    case 'ai-turn': return 'ai';
    case 'utterance': return 'question';
    case 'event': return 'feature';
    default: return 'feature';
  }
}

function statusClasses(status: TimelineFeatureView['status']): string {
  switch (status) {
    case 'current':
      return 'border-cyan-400/70 bg-cyan-400/[0.16] text-cyan-100';
    case 'applied':
      return 'border-white/15 bg-white/[0.055] text-slate-300';
    case 'future':
      return 'border-white/[0.05] bg-transparent text-slate-600 opacity-50';
    case 'suppressed':
      return 'border-amber-400/30 bg-amber-400/[0.05] text-amber-300 opacity-60';
    case 'error':
      return 'border-rose-400/55 bg-rose-400/[0.12] text-rose-200';
    case 'pending':
      return 'border-white/[0.06] bg-white/[0.02] text-slate-500 opacity-60';
    case 'stale':
      return 'border-amber-400/40 bg-amber-400/[0.08] text-amber-200';
    default:
      return 'border-white/10 bg-white/[0.04] text-slate-300';
  }
}

function statusDotClasses(status: TimelineFeatureView['status']): string {
  switch (status) {
    case 'suppressed': return 'bg-amber-300';
    case 'error': return 'bg-rose-300';
    case 'stale': return 'bg-amber-300';
    case 'pending': return 'bg-slate-500';
    default: return '';
  }
}

function statusToneClasses(status: TimelineFeatureView['status']): string {
  switch (status) {
    case 'current': return '';
    case 'future': return 'opacity-35 saturate-50';
    case 'suppressed': return 'opacity-55 saturate-50';
    case 'error': return 'ring-1 ring-rose-400/60';
    case 'pending': return 'opacity-55';
    case 'stale': return 'ring-1 ring-amber-300/50';
    default: return '';
  }
}

function formatFeatureTime(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

type FeatureAccent = {
  chip: string;
  pulse: string;
  group: string;
  card: string;
  iconBox: string;
  title: string;
  ribbon: string;
};

/**
 * Each timeline glyph gets its own accent so a dense history stays scannable:
 * sketches are pink, imports blue, questions violet, generated work amber, etc.
 */
const FEATURE_ACCENTS: Record<TimelineIcon, FeatureAccent> = {
  baseline: {
    chip: 'text-slate-300',
    pulse: '#cbd5e1',
    group: 'border-slate-600/50 bg-slate-950/60',
    card: 'border-slate-400/35',
    iconBox: 'border-slate-400/40 bg-slate-400/[0.12] text-slate-200',
    title: 'text-slate-100',
    ribbon: 'from-slate-400 via-cyan-300 to-slate-500',
  },
  sketch: {
    chip: 'text-fuchsia-400',
    pulse: '#e879f9',
    group: 'border-fuchsia-500/40 bg-fuchsia-950/40',
    card: 'border-fuchsia-400/40',
    iconBox: 'border-fuchsia-400/40 bg-fuchsia-400/[0.14] text-fuchsia-200',
    title: 'text-fuchsia-100',
    ribbon: 'from-fuchsia-400 via-pink-400 to-violet-500',
  },
  upload: {
    chip: 'text-blue-400',
    pulse: '#60a5fa',
    group: 'border-blue-500/40 bg-blue-950/40',
    card: 'border-blue-400/40',
    iconBox: 'border-blue-400/40 bg-blue-400/[0.14] text-blue-200',
    title: 'text-blue-100',
    ribbon: 'from-blue-400 via-sky-400 to-cyan-300',
  },
  deed: {
    chip: 'text-emerald-400',
    pulse: '#34d399',
    group: 'border-emerald-500/40 bg-emerald-950/40',
    card: 'border-emerald-400/40',
    iconBox: 'border-emerald-400/40 bg-emerald-400/[0.13] text-emerald-200',
    title: 'text-emerald-100',
    ribbon: 'from-emerald-400 via-teal-300 to-cyan-400',
  },
  boundary: {
    chip: 'text-lime-400',
    pulse: '#a3e635',
    group: 'border-lime-500/40 bg-lime-950/40',
    card: 'border-lime-400/40',
    iconBox: 'border-lime-400/40 bg-lime-400/[0.12] text-lime-200',
    title: 'text-lime-100',
    ribbon: 'from-lime-400 via-emerald-300 to-teal-400',
  },
  c3d: {
    chip: 'text-sky-400',
    pulse: '#38bdf8',
    group: 'border-sky-500/40 bg-sky-950/40',
    card: 'border-sky-400/40',
    iconBox: 'border-sky-400/40 bg-sky-400/[0.13] text-sky-200',
    title: 'text-sky-100',
    ribbon: 'from-sky-400 via-blue-400 to-indigo-400',
  },
  question: {
    chip: 'text-violet-400',
    pulse: '#a78bfa',
    group: 'border-violet-500/40 bg-violet-950/40',
    card: 'border-violet-400/40',
    iconBox: 'border-violet-400/40 bg-violet-400/[0.14] text-violet-200',
    title: 'text-violet-100',
    ribbon: 'from-violet-400 via-purple-400 to-fuchsia-400',
  },
  shrinkwrap: {
    chip: 'text-amber-400',
    pulse: '#fbbf24',
    group: 'border-amber-500/40 bg-amber-950/40',
    card: 'border-amber-400/40',
    iconBox: 'border-amber-400/40 bg-amber-400/[0.13] text-amber-200',
    title: 'text-amber-100',
    ribbon: 'from-amber-400 via-orange-300 to-yellow-300',
  },
  aoi: {
    chip: 'text-orange-400',
    pulse: '#fb923c',
    group: 'border-orange-500/40 bg-orange-950/40',
    card: 'border-orange-400/40',
    iconBox: 'border-orange-400/40 bg-orange-400/[0.13] text-orange-200',
    title: 'text-orange-100',
    ribbon: 'from-orange-400 via-amber-300 to-yellow-300',
  },
  surface: {
    chip: 'text-teal-400',
    pulse: '#2dd4bf',
    group: 'border-teal-500/40 bg-teal-950/40',
    card: 'border-teal-400/40',
    iconBox: 'border-teal-400/40 bg-teal-400/[0.13] text-teal-200',
    title: 'text-teal-100',
    ribbon: 'from-teal-400 via-cyan-300 to-emerald-400',
  },
  contour: {
    chip: 'text-cyan-400',
    pulse: '#22d3ee',
    group: 'border-cyan-500/40 bg-cyan-950/40',
    card: 'border-cyan-400/40',
    iconBox: 'border-cyan-400/40 bg-cyan-400/[0.13] text-cyan-200',
    title: 'text-cyan-100',
    ribbon: 'from-cyan-400 via-sky-300 to-blue-400',
  },
  station: {
    chip: 'text-purple-300',
    pulse: '#d8b4fe',
    group: 'border-purple-400/45 bg-purple-950/45',
    card: 'border-purple-300/45',
    iconBox: 'border-purple-300/45 bg-purple-300/[0.14] text-purple-200',
    title: 'text-purple-50',
    ribbon: 'from-purple-300 via-violet-400 to-indigo-400',
  },
  export: {
    chip: 'text-rose-400',
    pulse: '#fb7185',
    group: 'border-rose-500/40 bg-rose-950/40',
    card: 'border-rose-400/40',
    iconBox: 'border-rose-400/40 bg-rose-400/[0.13] text-rose-200',
    title: 'text-rose-100',
    ribbon: 'from-rose-400 via-pink-400 to-fuchsia-400',
  },
  display: {
    chip: 'text-indigo-400',
    pulse: '#818cf8',
    group: 'border-indigo-500/40 bg-indigo-950/40',
    card: 'border-indigo-400/40',
    iconBox: 'border-indigo-400/40 bg-indigo-400/[0.13] text-indigo-200',
    title: 'text-indigo-100',
    ribbon: 'from-indigo-400 via-violet-400 to-purple-400',
  },
  generate: {
    chip: 'text-yellow-400',
    pulse: '#facc15',
    group: 'border-yellow-500/40 bg-yellow-950/40',
    card: 'border-yellow-400/40',
    iconBox: 'border-yellow-400/40 bg-yellow-400/[0.13] text-yellow-200',
    title: 'text-yellow-100',
    ribbon: 'from-yellow-300 via-amber-400 to-orange-400',
  },
  ai: {
    chip: 'text-purple-400',
    pulse: '#c084fc',
    group: 'border-purple-500/40 bg-purple-950/40',
    card: 'border-purple-400/40',
    iconBox: 'border-purple-400/40 bg-purple-400/[0.14] text-purple-200',
    title: 'text-purple-100',
    ribbon: 'from-purple-400 via-fuchsia-400 to-pink-400',
  },
  feature: {
    chip: 'text-pink-400',
    pulse: '#f472b6',
    group: 'border-pink-500/40 bg-pink-950/40',
    card: 'border-pink-400/40',
    iconBox: 'border-pink-400/40 bg-pink-400/[0.13] text-pink-200',
    title: 'text-pink-100',
    ribbon: 'from-pink-400 via-rose-400 to-orange-300',
  },
};

const GROUP_TAB_PULSE_SLOTS = 6;

function buildGroupTabPulse(
  children: TimelineFeatureView[],
  fallbackColor: string,
): { animated: boolean; style: React.CSSProperties } {
  const childColors = Array.from(new Set(
    children.map(child => FEATURE_ACCENTS[iconForFeature(child)].pulse),
  ));
  const palette = childColors.length > 0 ? childColors : [fallbackColor];
  const slots = Array.from(
    { length: GROUP_TAB_PULSE_SLOTS },
    (_, index) => palette[index % palette.length],
  );
  return {
    animated: palette.length > 1,
    style: {
      backgroundColor: palette[0],
      '--timeline-group-pulse-1': slots[0],
      '--timeline-group-pulse-2': slots[1],
      '--timeline-group-pulse-3': slots[2],
      '--timeline-group-pulse-4': slots[3],
      '--timeline-group-pulse-5': slots[4],
      '--timeline-group-pulse-6': slots[5],
    } as React.CSSProperties,
  };
}

const HoverCard: React.FC<{
  feature: TimelineFeatureView;
  busy: boolean;
  position: { left: number; bottom: number; width: number };
  onGoTo: (id: string) => void;
  onReopenSketch: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onToggleSuppress: (id: string) => void;
  onDelete: (id: string) => void;
  onKeepOpen: () => void;
  onClose: () => void;
}> = ({
  feature,
  busy,
  position,
  onGoTo,
  onReopenSketch,
  onRename,
  onToggleSuppress,
  onDelete,
  onKeepOpen,
  onClose,
}) => {
  const icon = iconForFeature(feature);
  const accent = FEATURE_ACCENTS[icon];
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftLabel, setDraftLabel] = useState(feature.label);

  const commitRename = () => {
    const trimmed = draftLabel.trim();
    if (trimmed && trimmed !== feature.label) onRename(feature.id, trimmed);
    setIsRenaming(false);
  };

  const cancelRename = () => {
    setDraftLabel(feature.label);
    setIsRenaming(false);
  };

  return (
    <div
      data-testid="timeline-hover-card"
      role="tooltip"
      onMouseEnter={onKeepOpen}
      onMouseLeave={() => {
        if (!isRenaming) onClose();
      }}
      onFocus={onKeepOpen}
      onBlur={event => {
        const next = event.relatedTarget as Node | null;
        if (!event.currentTarget.contains(next)) onClose();
      }}
      style={{
        left: position.left,
        bottom: position.bottom,
        width: position.width,
      }}
      className={`pointer-events-auto fixed z-[70] overflow-hidden rounded-xl border ${accent.card} bg-[#071018]/98 text-white shadow-[0_22px_60px_-20px_rgba(0,0,0,0.98)] backdrop-blur-xl`}
    >
      <div className={`h-0.5 bg-gradient-to-r ${accent.ribbon}`} />

      <div className="flex items-start gap-2 border-b border-white/[0.08] px-2.5 py-2">
        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-current bg-[#0b1119] ${accent.chip}`}>
          <TimelineGlyph icon={icon} className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          {isRenaming ? (
            <form
              onSubmit={event => {
                event.preventDefault();
                commitRename();
              }}
              className="flex items-center gap-1"
            >
              <input
                autoFocus
                value={draftLabel}
                onChange={event => setDraftLabel(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelRename();
                  }
                }}
                disabled={busy}
                aria-label="Feature name"
                className="h-6 min-w-0 flex-1 rounded border border-indigo-400/40 bg-black/30 px-1.5 text-[10px] text-slate-100 outline-none focus:border-indigo-300"
              />
              <button
                type="submit"
                disabled={busy}
                className="h-6 rounded border border-indigo-400/35 bg-indigo-400/[0.10] px-1.5 text-[9px] font-semibold text-indigo-200 hover:bg-indigo-400/[0.18] disabled:opacity-40"
              >
                Save
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={cancelRename}
                className="h-6 rounded border border-white/10 px-1.5 text-[9px] font-semibold text-slate-400 hover:text-slate-200 disabled:opacity-40"
              >
                Cancel
              </button>
            </form>
          ) : (
            <div className="truncate text-[11px] font-semibold text-white">{feature.label}</div>
          )}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[8.5px] uppercase tracking-wider text-slate-500">
            <span className={`rounded border border-current bg-[#0b1119] px-1 py-0.5 ${accent.chip}`}>
              {KIND_LABELS[feature.kind] ?? feature.kind}
            </span>
            <span className="text-slate-400">{TIMELINE_ICON_LABELS[icon]}</span>
            <span aria-hidden="true">·</span>
            <span>{formatFeatureTime(feature.createdAt)}</span>
          </div>
        </div>
        <span className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider ${statusClasses(feature.status)}`}>
          {STATUS_LABELS[feature.status]}
        </span>
      </div>

      <div className="space-y-1.5 px-2.5 py-2">
        {feature.detail && (
          <p className="text-[10px] leading-snug text-slate-300">{feature.detail}</p>
        )}
        <div className="flex flex-wrap items-center gap-1 font-mono text-[8.5px] uppercase tracking-wider">
          <span className="rounded border border-cyan-400/20 bg-cyan-400/[0.05] px-1.5 py-0.5 text-cyan-200/80">
            {feature.deltas.length === 0
              ? 'No geometry change'
              : `${feature.deltas.length} canvas change${feature.deltas.length === 1 ? '' : 's'}`}
          </span>
          {feature.parentFeatureId && (
            <span className="rounded border border-violet-400/25 bg-violet-400/[0.06] px-1.5 py-0.5 text-violet-200">
              Grouped
            </span>
          )}
          {feature.author.type === 'agent' && (
            <span className="rounded border border-fuchsia-400/25 bg-fuchsia-400/[0.06] px-1.5 py-0.5 text-fuchsia-200">
              {feature.author.agent ?? 'Agent'}
            </span>
          )}
        </div>
        {feature.error && (
          <p className="text-[9.5px] leading-snug text-rose-300">{feature.error.message}</p>
        )}
        {feature.stale && !feature.error && (
          <p className="text-[9.5px] leading-snug text-amber-300">
            Replayed against changed upstream geometry; review this step.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-1 pt-0.5">
          {feature.status === 'current' ? (
            <span className={`rounded border px-1.5 py-1 font-mono text-[8.5px] font-bold uppercase tracking-wider ${statusClasses('current')}`}>
              Current
            </span>
          ) : (
            <button
              type="button"
              data-testid="timeline-hover-go-to"
              disabled={busy}
              onClick={() => onGoTo(feature.id)}
              className="rounded border border-cyan-400/35 bg-cyan-400/[0.08] px-2 py-1 text-[9.5px] font-semibold text-cyan-200 transition-colors hover:bg-cyan-400/[0.16] disabled:opacity-40"
            >
              Go to
            </button>
          )}
          {feature.kind === 'sketch' && feature.deltas.length > 0 && (
            <button
              type="button"
              data-testid="timeline-hover-edit-sketch"
              disabled={busy}
              onClick={() => onReopenSketch(feature.id)}
              className="rounded border border-fuchsia-400/30 bg-fuchsia-400/[0.08] px-2 py-1 text-[9.5px] font-semibold text-fuchsia-200 transition-colors hover:bg-fuchsia-400/[0.16] disabled:opacity-40"
            >
              Edit sketch
            </button>
          )}
          <button
            type="button"
            data-testid="timeline-hover-rename"
            disabled={busy || isRenaming}
            onClick={() => {
              setDraftLabel(feature.label);
              setIsRenaming(true);
            }}
            className="rounded border border-indigo-400/25 px-2 py-1 text-[9.5px] font-semibold text-indigo-200 transition-colors hover:border-indigo-400/50 hover:bg-indigo-400/[0.08] disabled:opacity-40"
          >
            Rename
          </button>
          {feature.kind !== 'baseline' && (
            <>
              <button
                type="button"
                data-testid="timeline-hover-suppress"
                disabled={busy}
                onClick={() => onToggleSuppress(feature.id)}
                className="rounded border border-amber-400/25 bg-amber-400/[0.04] px-2 py-1 text-[9.5px] font-semibold text-amber-200 transition-colors hover:border-amber-400/50 hover:bg-amber-400/[0.10] disabled:opacity-40"
              >
                {feature.suppressed ? 'Unsuppress' : 'Suppress'}
              </button>
              <button
                type="button"
                data-testid="timeline-hover-delete"
                disabled={busy}
                onClick={() => onDelete(feature.id)}
                className="rounded border border-rose-400/25 px-2 py-1 text-[9.5px] font-semibold text-rose-300 transition-colors hover:border-rose-400/50 hover:bg-rose-400/[0.08] disabled:opacity-40"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * The persistent single-row feature strip and sketch HUD.
 *
 * Rendered as a fixed overlay so it does not disturb the existing canvas
 * layout. It hides entirely when no TimelineProvider is mounted (standalone
 * canvas tests, embeds, and the public playback shell), and stays out of the
 * landing page, welcome/home screen, upload gates, and non-canvas panels.
 */
export const TimelineDock: React.FC = () => {
  const timeline = useOptionalTimeline();
  const ui = useOptionalUIState();
  const { enabled, visible } = useTimelineVisibility();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoverAnchor, setHoverAnchor] = useState<{ left: number; top: number } | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [commandDockExpanded, setCommandDockExpanded] = useState(false);
  const hoverCloseTimerRef = useRef<number | null>(null);
  const toolShelfOpen = Boolean(ui
    && ui.activeVisualPanel === 'canvas'
    && ui.isToolShelfVisible
    && !ui.isInitialScreen
    && !ui.showWelcome);
  const layoutInsets = useTimelineLayoutInsets(toolShelfOpen, ui?.toolShelfWidth ?? 0);

  const cancelHoverClose = useCallback(() => {
    if (hoverCloseTimerRef.current === null) return;
    window.clearTimeout(hoverCloseTimerRef.current);
    hoverCloseTimerRef.current = null;
  }, []);

  const scheduleHoverClose = useCallback(() => {
    if (hoverCloseTimerRef.current !== null) {
      window.clearTimeout(hoverCloseTimerRef.current);
    }
    // Leave a short bridge so the pointer can travel from the glyph into the
    // card without the card vanishing underneath it.
    hoverCloseTimerRef.current = window.setTimeout(() => {
      hoverCloseTimerRef.current = null;
      setHoveredId(null);
    }, 180);
  }, []);

  useEffect(() => {
    const handleCommandDockLayout = (event: Event) => {
      const detail = (event as CustomEvent<{ expanded?: boolean }>).detail;
      if (typeof detail?.expanded === 'boolean') {
        setCommandDockExpanded(detail.expanded);
      }
    };
    window.addEventListener(COMMAND_DOCK_LAYOUT_EVENT, handleCommandDockLayout);
    return () => window.removeEventListener(COMMAND_DOCK_LAYOUT_EVENT, handleCommandDockLayout);
  }, []);

  useEffect(() => () => {
    if (hoverCloseTimerRef.current !== null) {
      window.clearTimeout(hoverCloseTimerRef.current);
    }
  }, []);

  if (!timeline) return null;
  if (!shouldShowTimelineDock(ui)) return null;

  const hoveredFeature = hoveredId
    ? timeline.features.find(feature => feature.id === hoveredId) ?? null
    : null;

  const busy = Boolean(timeline.activeTransaction);
  const isSketch = Boolean(timeline.activeSketch);
  const isFeature = busy && !isSketch;
  const showDock = enabled && visible;
  // Keep this derived state hook-free: TimelineDock returns early when the
  // canvas is not visible, and adding hooks below those returns crashes on the
  // transition into the canvas with "Rendered more hooks than previously."
  const featureIds = new Set(timeline.features.map(feature => feature.id));
  const childrenByParent = new Map<string, TimelineFeatureView[]>();
  for (const feature of timeline.features) {
    if (!feature.parentFeatureId || !featureIds.has(feature.parentFeatureId)) continue;
    const group = childrenByParent.get(feature.parentFeatureId) ?? [];
    group.push(feature);
    childrenByParent.set(feature.parentFeatureId, group);
  }
  const topLevelFeatures = timeline.features.filter(feature => (
    !feature.parentFeatureId || !featureIds.has(feature.parentFeatureId)
  ));

  const hoverCardPosition = hoveredFeature && hoverAnchor && typeof window !== 'undefined'
    ? (() => {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const regionLeft = Math.max(8, layoutInsets.left + 8);
        const regionRight = Math.max(regionLeft + 200, viewportWidth - layoutInsets.right - 8);
        const width = Math.min(320, regionRight - regionLeft);
        const maxLeft = Math.max(regionLeft, regionRight - width);
        return {
          width,
          left: Math.min(Math.max(hoverAnchor.left, regionLeft), maxLeft),
          bottom: Math.max(8, viewportHeight - hoverAnchor.top + 8),
        };
      })()
    : null;

  const openFeatureHover = (feature: TimelineFeatureView, element: HTMLElement) => {
    cancelHoverClose();
    const rect = element.getBoundingClientRect();
    setHoverAnchor({ left: rect.left, top: rect.top });
    setHoveredId(feature.id);
  };

  const closeHover = () => {
    cancelHoverClose();
    setHoveredId(null);
  };

  const renderFeatureButton = (feature: TimelineFeatureView, isChild = false) => {
    const icon = iconForFeature(feature);
    const accent = FEATURE_ACCENTS[icon];
    const isCurrent = feature.status === 'current';
    return (
      <button
        key={feature.id}
        type="button"
        data-testid={isChild ? 'timeline-child-feature' : 'timeline-feature'}
        data-feature-id={feature.id}
        data-feature-icon={icon}
        aria-label={`${feature.label} — ${KIND_LABELS[feature.kind] ?? feature.kind}`}
        onMouseEnter={event => openFeatureHover(feature, event.currentTarget)}
        onMouseLeave={scheduleHoverClose}
        onFocus={event => openFeatureHover(feature, event.currentTarget)}
        onBlur={scheduleHoverClose}
        title={`${feature.label}${feature.detail ? ` — ${feature.detail}` : ''}${feature.error ? ` — ${feature.error.message}` : ''}${feature.stale ? ' — replayed against changed upstream geometry' : ''}`}
        style={{ borderTopColor: 'currentColor' }}
        className={`group relative flex shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent transition-colors duration-150 focus-visible:outline-none ${accent.chip} ${
          isChild ? 'h-7 w-7 border-t-2' : 'h-8 w-8 border-t-[3px]'
        } ${statusToneClasses(feature.status)} ${
          busy ? 'cursor-default opacity-70' : 'cursor-pointer'
        }`}
      >
        <span
          aria-hidden="true"
          style={{ top: isChild ? 2 : 3 }}
          className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-[4px] border-x border-b border-dashed border-current opacity-0 transition-opacity duration-150 group-hover:opacity-75 group-focus-visible:opacity-75"
        />
        <TimelineGlyph icon={icon} className={`${isChild ? 'h-5 w-5' : 'h-6 w-6'} relative z-10`} />
        {statusDotClasses(feature.status) && (
          <span
            aria-hidden="true"
            className={`absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full ring-1 ring-[#080d14] ${statusDotClasses(feature.status)}`}
          />
        )}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute bottom-[2px] left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-white shadow-[0_0_0_1px_rgba(2,6,23,0.9)] transition-opacity duration-150 ${
            isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
          }`}
        />
      </button>
    );
  };

  return (
    <>
      {showDock && (
        <div
          data-testid="timeline-dock"
          className={`pointer-events-none fixed bottom-[76px] px-2 ${
            commandDockExpanded ? 'z-20' : 'z-40'
          }`}
          style={{
            left: layoutInsets.left,
            right: layoutInsets.right,
          }}
          onMouseLeave={scheduleHoverClose}
        >
          {hoveredFeature && hoverCardPosition && (
            <HoverCard
              key={hoveredFeature.id}
              feature={hoveredFeature}
              busy={busy}
              position={hoverCardPosition}
              onGoTo={id => {
                closeHover();
                timeline.moveCursor(id);
              }}
              onReopenSketch={id => {
                closeHover();
                timeline.reopenSketch(id);
              }}
              onRename={(id, label) => {
                closeHover();
                timeline.renameFeature(id, label);
              }}
              onToggleSuppress={id => {
                closeHover();
                timeline.toggleSuppress(id);
              }}
              onDelete={id => {
                closeHover();
                timeline.deleteFeature(id);
              }}
              onKeepOpen={cancelHoverClose}
              onClose={scheduleHoverClose}
            />
          )}

          <div
            data-testid="timeline-strip"
            className="pointer-events-auto relative mx-auto flex h-9 max-w-6xl items-center gap-2 overflow-hidden rounded-lg border border-slate-700/80 border-t-slate-600 bg-[#080d14]/97 px-2.5 shadow-[0_16px_44px_-22px_rgba(0,0,0,0.95)] backdrop-blur-xl"
          >
            {timeline.lastReplayError && (
              <span
                title={`Replay stopped: ${timeline.lastReplayError.message}`}
                className="hidden shrink-0 rounded border border-rose-500/60 bg-rose-950/70 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-rose-300 md:inline"
              >
                Replay
              </span>
            )}

            <div
              data-testid="timeline-track"
              className="scrollbar-hide flex h-full min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overflow-y-hidden"
            >
              {topLevelFeatures.map(feature => {
                const children = childrenByParent.get(feature.id) ?? [];
                const collapsed = collapsedGroups.has(feature.id);
                const expanded = expandedGroups.has(feature.id);
                const autoGoalGroup = feature.kind === 'event' && children.length > 0;
                const visibleChildren = autoGoalGroup
                  ? (expanded ? children : [])
                  : (expanded ? children : children.slice(0, MAX_COLLAPSED_CHILDREN));
                const hiddenCount = autoGoalGroup
                  ? (expanded ? 0 : children.length)
                  : children.length - visibleChildren.length;
                const groupStepCount = feature.kind === 'sketch' ? children.length : children.length + 1;
                const representative = autoGoalGroup && !expanded
                  ? (feature.status === 'current'
                    ? feature
                    : children.find(child => child.status === 'current') ?? children[children.length - 1] ?? feature)
                  : feature;
                const groupTabPulse = buildGroupTabPulse(
                  children,
                  FEATURE_ACCENTS[iconForFeature(feature)].pulse,
                );
                return (
                  <div
                    key={feature.id}
                    data-testid={children.length > 0 ? 'timeline-feature-group' : undefined}
                    title={children.length > 0
                      ? `${groupStepCount} grouped step${groupStepCount === 1 ? '' : 's'}`
                      : undefined}
                    role={children.length > 0 ? 'group' : undefined}
                    aria-label={children.length > 0
                      ? `${groupStepCount} grouped step${groupStepCount === 1 ? '' : 's'}`
                      : undefined}
                    className={`flex shrink-0 items-center gap-1 ${
                      children.length > 0 && !collapsed
                        ? 'rounded-[7px] border border-slate-700/60 px-0.5'
                        : ''
                    }`}
                  >
                    {children.length > 0 && (
                      <button
                        type="button"
                        data-testid="timeline-group-marker"
                        aria-expanded={!collapsed}
                        aria-label={collapsed ? 'Expand group' : 'Collapse group'}
                        title={collapsed ? 'Expand group' : 'Collapse group'}
                        onClick={() => setCollapsedGroups(current => toggleGroupExpansion(current, feature.id))}
                        className={`h-5 w-[10px] shrink-0 cursor-pointer rounded-[3px] border-0 p-0 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300/70 ${groupTabPulse.animated ? 'timeline-group-tab-pulse' : ''}`}
                        style={groupTabPulse.style}
                      />
                    )}
                    {!collapsed && (autoGoalGroup && !expanded ? (
                      renderFeatureButton(representative)
                    ) : (
                      <>
                        {renderFeatureButton(feature)}
                        {visibleChildren.map(child => renderFeatureButton(child, true))}
                      </>
                    ))}
                    {!collapsed && children.length > 0 && (hiddenCount > 0 || expanded) && (
                      <button
                        type="button"
                        data-testid="timeline-expand-group"
                        aria-expanded={expanded}
                        aria-label={expanded
                          ? `Collapse grouped entries inside ${feature.label}`
                          : `Show ${hiddenCount} more grouped entr${hiddenCount === 1 ? 'y' : 'ies'} inside ${feature.label}`}
                        onClick={() => setExpandedGroups(current => toggleGroupExpansion(current, feature.id))}
                        className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-[4px] border border-slate-700 bg-transparent px-1 font-mono text-[8.5px] font-bold text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200"
                      >
                        {expanded ? '−' : `+${hiddenCount}`}
                      </button>
                    )}
                  </div>
                );
              })}
              {timeline.hasFuture && (
                <span className="flex shrink-0 items-center px-1 font-mono text-[8.5px] uppercase tracking-wider text-slate-500">
                  future
                </span>
              )}
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-1.5 border-l border-slate-800 pl-2">
              {isSketch && (
                <button
                  type="button"
                  data-testid="timeline-project-button"
                  onClick={() => window.dispatchEvent(new Event(PROJECT_GEOMETRY_EVENT))}
                  title="Project existing linework into this sketch as an immutable reference"
                  className="h-6 rounded-md border border-violet-400/40 bg-violet-400/[0.08] px-2 text-[9.5px] font-semibold text-violet-200 transition-colors hover:border-violet-300/70 hover:bg-violet-400/[0.16] hover:text-white"
                >
                  Project
                </button>
              )}
              <button
                type="button"
                data-testid="timeline-sketch-button"
                onClick={isSketch ? timeline.finishSketch : timeline.beginSketch}
                disabled={busy && !isSketch}
                aria-pressed={isSketch}
                aria-label={isSketch ? 'Finish sketch' : 'Sketch'}
                title={isSketch ? 'Finish sketch and add it to the timeline' : 'Enter sketch mode (SS)'}
                className={`h-6 rounded-md px-2 text-[9.5px] font-semibold transition-colors ${
                  isSketch
                    ? 'border border-red-400/80 bg-red-600 text-white shadow-[0_0_12px_rgba(220,38,38,0.55)] hover:border-red-300 hover:bg-red-500'
                    : 'border border-white/10 bg-white/[0.03] text-slate-300 hover:border-cyan-400/35 hover:bg-cyan-400/[0.06] hover:text-cyan-100'
                } ${busy && !isSketch ? 'hidden' : ''}`}
              >
                {isSketch ? 'Finish sketch' : 'Sketch'}
              </button>
              <button
                type="button"
                data-testid="timeline-feature-button"
                onClick={() => timeline.beginFeature()}
                disabled={busy || isFeature}
                aria-pressed={isFeature}
                title={isFeature ? 'Feature mode active' : 'Group the next canvas changes into one feature'}
                className={`h-6 rounded-md px-2 text-[9.5px] font-semibold transition-colors ${
                  isFeature
                    ? 'border border-yellow-400/40 bg-yellow-400/[0.07] text-yellow-200 outline outline-1 outline-offset-1 outline-yellow-300 disabled:cursor-default disabled:opacity-100'
                    : 'border border-white/10 bg-white/[0.03] text-slate-300 hover:border-cyan-400/35 hover:bg-cyan-400/[0.06] hover:text-cyan-100'
                } ${busy && !isFeature ? 'hidden' : ''}`}
              >
                {isFeature ? 'Feature' : '+ Feature'}
              </button>
              {isFeature && (
                <button
                  type="button"
                  onClick={() => timeline.commitFeature()}
                  className="h-6 rounded-md border border-cyan-400/40 bg-cyan-400/[0.10] px-2 text-[9.5px] font-bold text-cyan-100 transition-colors hover:bg-cyan-400/[0.18]"
                >
                  End feature
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default TimelineDock;
