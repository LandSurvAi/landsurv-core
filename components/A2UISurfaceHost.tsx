import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { ChevronUp, Maximize2, Minimize2, Minus, Sparkles, X } from 'lucide-react';
import {
  a2uiSurfaceBus,
  closeA2UISurface,
  openA2UISurface,
  type A2UISurfaceAccent,
  type A2UISurfaceAudience,
  type A2UISurfaceDefinition,
  type A2UISurfaceInstance,
} from '../services/a2uiSurfaces.ts';
import type { A2UISurfaceSize } from '../types.ts';
import { A2UISurfaceConsole } from './A2UISurfaceConsole.tsx';

const ACCENT_STYLES: Record<
  A2UISurfaceAccent,
  { dot: string; border: string; text: string; glow: string; chip: string }
> = {
  cyan: {
    dot: 'bg-cyan-400',
    border: 'border-cyan-400/25',
    text: 'text-cyan-300',
    glow: 'shadow-[0_18px_60px_-20px_rgba(34,211,238,0.35)]',
    chip: 'border-cyan-400/25 bg-cyan-400/10 text-cyan-200',
  },
  emerald: {
    dot: 'bg-emerald-400',
    border: 'border-emerald-400/25',
    text: 'text-emerald-300',
    glow: 'shadow-[0_18px_60px_-20px_rgba(52,211,153,0.35)]',
    chip: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
  },
  amber: {
    dot: 'bg-amber-400',
    border: 'border-amber-400/25',
    text: 'text-amber-300',
    glow: 'shadow-[0_18px_60px_-20px_rgba(251,191,36,0.35)]',
    chip: 'border-amber-400/25 bg-amber-400/10 text-amber-200',
  },
  fuchsia: {
    dot: 'bg-fuchsia-400',
    border: 'border-fuchsia-400/25',
    text: 'text-fuchsia-300',
    glow: 'shadow-[0_18px_60px_-20px_rgba(232,121,249,0.35)]',
    chip: 'border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-200',
  },
  sky: {
    dot: 'bg-sky-400',
    border: 'border-sky-400/25',
    text: 'text-sky-300',
    glow: 'shadow-[0_18px_60px_-20px_rgba(56,189,248,0.35)]',
    chip: 'border-sky-400/25 bg-sky-400/10 text-sky-200',
  },
  rose: {
    dot: 'bg-rose-400',
    border: 'border-rose-400/25',
    text: 'text-rose-300',
    glow: 'shadow-[0_18px_60px_-20px_rgba(251,113,133,0.35)]',
    chip: 'border-rose-400/25 bg-rose-400/10 text-rose-200',
  },
};

const SIZE_CLASSES: Record<A2UISurfaceSize, string> = {
  compact: 'w-[min(94vw,380px)]',
  standard: 'w-[min(95vw,560px)]',
  wide: 'w-[min(97vw,920px)]',
  fullscreen: 'w-[calc(100vw-1.5rem)]',
};

const SIZE_CYCLE: A2UISurfaceSize[] = ['compact', 'standard', 'wide'];

export interface OpenSurfaceConsoleOptions {
  audience: A2UISurfaceAudience;
  onLaunch?: (definition: A2UISurfaceDefinition) => void;
  defaultSize?: A2UISurfaceSize;
}

const isSize = (value: unknown): value is A2UISurfaceSize =>
  value === 'compact' || value === 'standard' || value === 'wide' || value === 'fullscreen';

/**
 * Open the catalog console in the global surface stack. Safe to call from any
 * dialog, settings section, or bridge; no host props required.
 */
export function openSurfaceConsole({
  audience,
  onLaunch,
  defaultSize = 'standard',
}: OpenSurfaceConsoleOptions): string {
  return openA2UISurface({
    key: 'surface-console',
    definitionId: 'surface-console',
    title: 'Surface console',
    subtitle: 'Search and launch every surface in this context',
    category: 'system',
    accent: 'cyan',
    size: defaultSize,
    source: 'surface-console',
    content: (
      <A2UISurfaceConsole
        audience={audience}
        onLaunch={definition => {
          closeA2UISurface('surface-console');
          onLaunch?.(definition);
        }}
      />
    ),
  });
}

/** Imperative launcher API for components that are not the host. */
export function useA2UISurfaceLauncher(audience: A2UISurfaceAudience = 'workspace') {
  return useMemo(
    () => ({
      open: openA2UISurface,
      close: closeA2UISurface,
      closeAll: () => a2uiSurfaceBus.closeAll(),
      openConsole: (options?: Partial<Omit<OpenSurfaceConsoleOptions, 'audience'>>) =>
        openSurfaceConsole({ audience, ...options }),
    }),
    [audience],
  );
}

interface A2UISurfaceHostProps {
  audience: A2UISurfaceAudience;
  /** Show the persistent floating launcher. Default: false; surfaces are latent. */
  launcher?: boolean;
  launcherLabel?: string;
  defaultSize?: A2UISurfaceSize;
  /** Workspace catalog launcher: switch agents, open dialogs, open surfaces. */
  onLaunchDefinition?: (definition: A2UISurfaceDefinition) => void;
  /** Public or bespoke launcher: return content for a catalog definition. */
  renderSurface?: (definition: A2UISurfaceDefinition) => React.ReactNode | null;
}

/**
 * Global host for A2UI surfaces.
 *
 * Mount once per app shell (workspace + public pages). It renders every surface
 * opened through `openA2UISurface`/`useA2UISurfaceLauncher`, keeps one window
 * stack with tabs, and supports Escape, minimize, resize, and the Ctrl+Shift+A
 * console shortcut.
 */
export const A2UISurfaceHost: React.FC<A2UISurfaceHostProps> = ({
  audience,
  launcher = false,
  launcherLabel = 'Surfaces',
  defaultSize = 'standard',
  onLaunchDefinition,
  renderSurface,
}) => {
  const surfaces = useSyncExternalStore(
    a2uiSurfaceBus.subscribe,
    a2uiSurfaceBus.getSnapshot,
    a2uiSurfaceBus.getSnapshot,
  );
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [minimized, setMinimized] = useState<Set<string>>(() => new Set());
  const [surfaceOffsets, setSurfaceOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const dragRef = useRef<{
    key: string;
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const launchDefinition = useCallback(
    (definition: A2UISurfaceDefinition) => {
      const content = renderSurface?.(definition);
      if (content) {
        openA2UISurface({
          key: definition.id,
          definitionId: definition.id,
          title: definition.title,
          subtitle: definition.description,
          category: definition.category,
          accent: definition.accent,
          size: defaultSize,
          source: `catalog:${audience}`,
          content,
        });
        return;
      }
      onLaunchDefinition?.(definition);
    },
    [audience, defaultSize, onLaunchDefinition, renderSurface],
  );

  const openConsole = useCallback(() => {
    openSurfaceConsole({ audience, onLaunch: launchDefinition, defaultSize });
  }, [audience, defaultSize, launchDefinition]);

  useEffect(() => {
    if (surfaces.length === 0) {
      if (activeKey !== null) setActiveKey(null);
      return;
    }
    if (!activeKey || !surfaces.some(surface => surface.key === activeKey)) {
      setActiveKey(surfaces[surfaces.length - 1].key);
    }
  }, [activeKey, surfaces]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (launcher && (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        openConsole();
        return;
      }
      if (event.key === 'Escape' && surfaces.length > 0) {
        const target = activeKey ?? surfaces[surfaces.length - 1].key;
        const surface = surfaces.find(item => item.key === target);
        if (surface?.dismissible !== false) closeA2UISurface(target);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeKey, launcher, openConsole, surfaces]);

  const activeSurface: A2UISurfaceInstance | undefined =
    surfaces.find(surface => surface.key === activeKey) ?? surfaces[surfaces.length - 1];

  const toggleMinimized = (key: string) => {
    setMinimized(previous => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const cycleSize = (surface: A2UISurfaceInstance) => {
    const index = SIZE_CYCLE.indexOf(surface.size);
    const next = SIZE_CYCLE[(index + 1) % SIZE_CYCLE.length];
    a2uiSurfaceBus.setSize(surface.key, next);
  };

  const styles = ACCENT_STYLES[activeSurface?.accent ?? 'cyan'];
  const isMinimized = activeSurface ? minimized.has(activeSurface.key) : false;
  const isFullscreen = activeSurface?.size === 'fullscreen';
  const surfaceOffset = activeSurface ? surfaceOffsets[activeSurface.key] ?? { x: 0, y: 0 } : { x: 0, y: 0 };

  const handleDragStart = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || isFullscreen) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, input, select, textarea')) return;
    const key = activeSurface?.key;
    if (!key) return;
    const origin = surfaceOffsets[key] ?? { x: 0, y: 0 };
    dragRef.current = {
      key,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: origin.x,
      originY: origin.y,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is unavailable in some test environments.
    }
  };

  const handleDragMove = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setSurfaceOffsets(previous => ({
      ...previous,
      [drag.key]: {
        x: drag.originX + event.clientX - drag.startX,
        y: drag.originY + event.clientY - drag.startY,
      },
    }));
  };

  const handleDragEnd = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture is unavailable in some test environments.
    }
  };

  return (
    <>
      <div
        data-testid="a2ui-surface-host"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[9950] flex flex-col items-end gap-2 p-3 sm:p-4"
      >
        {surfaces.length > 1 && (
          <div className="pointer-events-auto flex max-w-[97vw] items-center gap-1 overflow-x-auto rounded-lg border border-white/[0.09] bg-[#070e18]/95 p-1 backdrop-blur">
            {surfaces.map(surface => {
              const selected = surface.key === activeSurface?.key;
              return (
                <button
                  key={surface.key}
                  type="button"
                  onClick={() => setActiveKey(surface.key)}
                  aria-pressed={selected}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors ${
                    selected
                      ? `${ACCENT_STYLES[surface.accent].chip}`
                      : 'border-transparent text-slate-400 hover:border-white/[0.1] hover:bg-white/[0.04] hover:text-slate-200'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${ACCENT_STYLES[surface.accent].dot}`} />
                  <span className="max-w-[11rem] truncate">{surface.title}</span>
                </button>
              );
            })}
          </div>
        )}

        {activeSurface && (
          <section
            role="dialog"
            aria-modal="false"
            aria-label={activeSurface.title}
            data-testid={`a2ui-hosted-surface-${activeSurface.definitionId ?? activeSurface.key}`}
            data-size={activeSurface.size}
            style={isFullscreen ? undefined : { transform: `translate(${surfaceOffset.x}px, ${surfaceOffset.y}px)` }}
            className={`pointer-events-auto flex flex-col overflow-hidden rounded-xl border bg-[#070e18]/97 text-slate-200 backdrop-blur-md ${styles.border} ${styles.glow} ${
              isFullscreen
                ? 'fixed inset-3 z-[10000] h-[calc(100dvh-1.5rem)] max-h-none'
                : `max-h-[76vh] ${SIZE_CLASSES[activeSurface.size]}`
            }`}
          >
            <header
              data-testid="a2ui-hosted-surface-drag-handle"
              onPointerDown={handleDragStart}
              onPointerMove={handleDragMove}
              onPointerUp={handleDragEnd}
              onPointerCancel={handleDragEnd}
              className="flex shrink-0 cursor-grab touch-none select-none items-start justify-between gap-2 border-b border-white/[0.08] bg-white/[0.02] px-3 py-2 active:cursor-grabbing"
            >
              <div className="flex min-w-0 items-start gap-2">
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border font-mono text-[9px] font-bold ${styles.chip}`}>
                  {(activeSurface.definitionId && getDefinitionGlyph(activeSurface.definitionId)) || '◇'}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-[12px] font-semibold text-slate-100">{activeSurface.title}</h2>
                  <p className="mt-0.5 truncate text-[9.5px] text-slate-500">
                    {activeSurface.subtitle ?? 'Surface'}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => a2uiSurfaceBus.setSize(activeSurface.key, isFullscreen ? 'wide' : 'fullscreen')}
                  aria-label={isFullscreen ? 'Exit surface fullscreen' : 'Open surface fullscreen'}
                  title={isFullscreen ? 'Exit fullscreen' : 'Open fullscreen'}
                  className="rounded border border-white/[0.07] p-1 text-slate-400 transition-colors hover:border-white/[0.16] hover:text-slate-200"
                >
                  {isFullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                </button>
                <button
                  type="button"
                  onClick={() => cycleSize(activeSurface)}
                  title={`Size: ${activeSurface.size}. Click to resize.`}
                  aria-label={`Resize surface (current: ${activeSurface.size})`}
                  className="rounded border border-white/[0.07] px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase text-slate-400 transition-colors hover:border-white/[0.16] hover:text-slate-200"
                >
                  {activeSurface.size.slice(0, 1)}
                </button>
                <button
                  type="button"
                  onClick={() => toggleMinimized(activeSurface.key)}
                  aria-label={isMinimized ? 'Expand surface' : 'Minimize surface'}
                  className="rounded border border-white/[0.07] p-1 text-slate-400 transition-colors hover:border-white/[0.16] hover:text-slate-200"
                >
                  {isMinimized ? <ChevronUp className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                </button>
                {activeSurface.dismissible !== false && (
                  <button
                    type="button"
                    onClick={() => closeA2UISurface(activeSurface.key)}
                    aria-label={`Close ${activeSurface.title}`}
                    data-testid="a2ui-hosted-surface-close"
                    className="rounded border border-white/[0.07] p-1 text-slate-400 transition-colors hover:border-rose-400/30 hover:bg-rose-500/10 hover:text-rose-300"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </header>

            {!isMinimized && (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto">{activeSurface.content}</div>
                <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-white/[0.07] bg-black/20 px-3 py-1.5">
                  <span className="inline-flex items-center gap-1.5 text-[8.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    <span className={`h-1 w-1 rounded-full ${styles.dot}`} />
                    Surface
                  </span>
                  <span className="truncate font-mono text-[8.5px] text-slate-600">
                    {activeSurface.source ?? 'workspace'}
                  </span>
                </footer>
              </>
            )}
          </section>
        )}

        {launcher && (
          <button
            type="button"
            onClick={openConsole}
            data-testid="a2ui-launcher"
            title="Open surface console (Ctrl+Shift+A)"
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-cyan-400/35 bg-[#071019]/95 px-3 py-1.5 text-[10.5px] font-semibold text-cyan-200 shadow-lg shadow-cyan-950/40 backdrop-blur transition-colors hover:border-cyan-300/60 hover:bg-cyan-400/10 hover:text-white"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {launcherLabel}
            {surfaces.length > 0 && (
              <span className="rounded-full border border-cyan-400/30 bg-cyan-400/15 px-1.5 font-mono text-[9px] text-cyan-100">
                {surfaces.length}
              </span>
            )}
          </button>
        )}
      </div>
    </>
  );
};

function getDefinitionGlyph(definitionId: string): string | undefined {
  // Small helper kept local to avoid importing the whole catalog at render time.
  const glyphs: Record<string, string> = {
    'surface-console': '⌘',
    'cacp-manifests': '⇄',
    'cacp-review': '!',
    'cacp-inspector': '◎',
    'page-guide': 'i',
    settings: '⚙',
    help: '?',
    'workspace-cad-manager': '⚙',
    'workspace-raster-underlay': '🖼',
    'workspace-text-editor': 'T',
    'workspace-spreadsheet': '▦',
    'point-entry': 'P',
    'explore-cad-standards': '≡',
    'explore-zoning': 'Z',
  };
  return glyphs[definitionId];
}

export default A2UISurfaceHost;
