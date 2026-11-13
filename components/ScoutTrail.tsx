import React, { useEffect, useRef, useState } from 'react';
import { ScoutFigure, type ScoutPose } from './ScoutFigure.tsx';
import { ScoutWordmark } from './ScoutWordmark.tsx';
import { scoutActivityStore } from '../services/scoutActivityStore.ts';
import { isScoutAnimationEnabled, SCOUT_ANIMATION_EVENT } from '../utils/scoutSettings.ts';
import type { A2UIScoutActivityEvent, ScoutRun } from '../types.ts';

type PropKind = 'boulder' | 'log' | 'cairn' | 'washout' | 'marker';

interface TrailProp {
  id: string;
  kind: PropKind;
  lane: number;
  addedAt: number;
}

const LANES = [22, 46, 72];
const PROP_TTL_MS = 12_000;
const MAX_PROPS = 3;
const STATIC_STATUS = 'Static mode — live run status';

/**
 * Deliberate field-walk pace. The spec's 70 px/s read as a rushed slide at
 * command-bar scale, especially against the 0.86 s leg cycle; a slower stride
 * keeps the figure planted and lets the walk cycle match the distance walked.
 */
const WALK_PX_PER_SECOND = 36;
/** Distance covered per full four-pose cycle, as a fraction of figure height. */
const STRIDE_HEIGHT_RATIO = 0.5;
/** Spec: walk off the left edge over 1.2 s once the run finishes. */
const EXIT_DURATION_MS = 1_200;
const OFFSCREEN_LEFT_PERCENT = -16;

/**
 * Convert a px/second stride speed into strip-width percent per millisecond.
 * `position.x` is a percentage of the command bar, so the old `* 100` without
 * the `/ 1000` turned a 70 px/s walk into ~1000x that — one frame crossed the
 * whole strip and the figure thrashed between the edge clamps.
 */
function percentPerMs(pxPerSecond: number, viewportWidth: number): number {
  return (pxPerSecond / 1_000 / Math.max(420, viewportWidth)) * 100;
}

/**
 * One animation-frame step of Scout's pacing walk. Pure so the speed and the
 * edge turns can be tested without a browser frame loop.
 */
export function advanceScoutWalk(
  position: { x: number; direction: -1 | 1 },
  dtMs: number,
  viewportWidth: number,
): { x: number; direction: -1 | 1 } {
  const delta = percentPerMs(WALK_PX_PER_SECOND, viewportWidth) * dtMs;
  let x = position.x + position.direction * delta;
  let direction = position.direction;
  // Only the edge ahead of travel turns him. Applying both clamps every frame
  // snapped the 100% entry position down to 92% before he took a step.
  if (direction === -1 && x <= 8) { x = 8; direction = 1; }
  if (direction === 1 && x >= 92) { x = 92; direction = -1; }
  return x === position.x && direction === position.direction
    ? position
    : { x, direction };
}

function propForEvent(event: A2UIScoutActivityEvent): PropKind | null {
  if (event.kind === 'rejected' || event.phase === 'empty') return 'boulder';
  if (event.level === 'error' || event.kind === 'error') return 'washout';
  if (event.kind === 'verified' || event.level === 'success') return 'cairn';
  if (event.kind === 'cache') return 'marker';
  if (/retry|again|second attempt/i.test(event.message)) return 'log';
  return null;
}

function poseForProp(kind: PropKind): ScoutPose {
  if (kind === 'boulder') return 'climb';
  if (kind === 'log') return 'vault';
  if (kind === 'washout') return 'stumble';
  if (kind === 'cairn' || kind === 'marker') return 'tap';
  return 'stride';
}

function PropGlyph({ kind }: { kind: PropKind }) {
  if (kind === 'boulder') {
    return (
      <svg viewBox="0 0 64 48" aria-hidden="true" className="h-full w-full overflow-visible">
        <path d="M6 44 Q3 32 12 26 Q17 16 28 17 Q41 14 48 24 Q58 29 57 44 Z" fill="#475569" stroke="#1e293b" strokeWidth="2" />
        <path d="M17 27 Q24 23 31 26" fill="none" stroke="#94a3b8" strokeWidth="1.5" opacity="0.6" />
        <path d="M38 34 Q44 31 50 35" fill="none" stroke="#94a3b8" strokeWidth="1.4" opacity="0.45" />
      </svg>
    );
  }
  if (kind === 'log') {
    return (
      <svg viewBox="0 0 78 34" aria-hidden="true" className="h-full w-full overflow-visible">
        <rect x="4" y="12" width="70" height="15" rx="7.5" fill="#7c4a1e" stroke="#3f2813" strokeWidth="2" />
        <ellipse cx="73" cy="19.5" rx="6" ry="7.5" fill="#a16207" stroke="#3f2813" strokeWidth="1.6" />
        <path d="M14 17 H58" stroke="#92400e" strokeWidth="1.4" opacity="0.7" />
        <path d="M22 22 H49" stroke="#5b3a1b" strokeWidth="1.2" opacity="0.7" />
      </svg>
    );
  }
  if (kind === 'cairn') {
    return (
      <svg viewBox="0 0 42 52" aria-hidden="true" className="h-full w-full overflow-visible">
        <ellipse cx="21" cy="48" rx="14" ry="3" fill="#0f172a" opacity="0.5" />
        <ellipse cx="21" cy="42" rx="12" ry="5" fill="#64748b" stroke="#334155" strokeWidth="1.4" />
        <ellipse cx="21" cy="33" rx="9" ry="4.4" fill="#94a3b8" stroke="#475569" strokeWidth="1.3" />
        <ellipse cx="21" cy="25" rx="6.5" ry="3.6" fill="#cbd5e1" stroke="#64748b" strokeWidth="1.2" />
        <path d="M14 19 L21 7 L28 19 Z" fill="#67e8f9" opacity="0.85" />
      </svg>
    );
  }
  if (kind === 'washout') {
    return (
      <svg viewBox="0 0 72 38" aria-hidden="true" className="h-full w-full overflow-visible">
        <ellipse cx="36" cy="24" rx="32" ry="11" fill="#1f2937" stroke="#f59e0b" strokeWidth="1.6" />
        <path d="M10 22 Q22 17 31 23 Q42 28 54 21 Q61 18 66 23" fill="none" stroke="#fbbf24" strokeWidth="1.8" opacity="0.8" />
        <path d="M20 28 L25 23 M36 30 L40 24 M51 29 L56 24" stroke="#fbbf24" strokeWidth="1.4" opacity="0.6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 30 50" aria-hidden="true" className="h-full w-full overflow-visible">
      <line x1="15" y1="14" x2="15" y2="47" stroke="#94a3b8" strokeWidth="2.4" />
      <path d="M15 12 L27 17 L15 22 Z" fill="#67e8f9" stroke="#0e7490" strokeWidth="1.2" />
    </svg>
  );
}

/**
 * Scout paces the top edge of the command bar. The strip is width-matched to
 * the bar, pointer-events-none, and disappears when no run is live.
 */
export const ScoutTrail: React.FC = () => {
  const primary = React.useSyncExternalStore(
    scoutActivityStore.subscribe,
    scoutActivityStore.getSnapshot,
    scoutActivityStore.getSnapshot,
  );
  const activeCount = React.useSyncExternalStore(
    scoutActivityStore.subscribe,
    scoutActivityStore.getActiveRunCount,
    scoutActivityStore.getActiveRunCount,
  );
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 1440 : window.innerWidth,
  );
  const [reducedMotion, setReducedMotion] = useState(false);
  const [animationEnabled, setAnimationEnabled] = useState(() => isScoutAnimationEnabled());
  const [position, setPosition] = useState({ x: 100, direction: -1 as -1 | 1 });
  // Exit pace is computed from wherever the run ended, but the effect must not
  // restart every frame just to read the latest position.
  const positionRef = useRef(position);
  positionRef.current = position;
  const [exiting, setExiting] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [props, setProps] = useState<TrailProp[]>([]);
  const [pose, setPose] = useState<ScoutPose>('stride');
  const lastRunId = useRef<string | null>(null);
  const lastEventCount = useRef(0);
  const propSeq = useRef(0);

  const running = activeCount > 0 && primary?.status === 'running';
  const height = viewportWidth >= 1280 ? 200 : viewportWidth >= 768 ? 160 : 96;
  const staticMode = reducedMotion || viewportWidth < 768;
  // One leg cycle per stride of ground covered, so the feet stop skating.
  const stepDurationSeconds = Math.min(3, Math.max(1.2,
    (height * STRIDE_HEIGHT_RATIO) / WALK_PX_PER_SECOND,
  ));

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const sync = () => setAnimationEnabled(isScoutAnimationEnabled());
    window.addEventListener(SCOUT_ANIMATION_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SCOUT_ANIMATION_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  // Reset the walk when a new primary run begins.
  useEffect(() => {
    if (!primary?.id || primary.id === lastRunId.current) return;
    lastRunId.current = primary.id;
    lastEventCount.current = primary.events.length;
    setPosition({ x: 100, direction: -1 });
    setProps([]);
    setPose('stride');
    setExiting(false);
    setHidden(false);
  }, [primary?.id, primary?.events.length]);

  // Pace right-to-left, then back, until the run ends.
  useEffect(() => {
    if (!animationEnabled || !running || staticMode || hidden || exiting) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(64, now - previous);
      previous = now;
      setPosition(current => advanceScoutWalk(current, dt, viewportWidth));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animationEnabled, running, staticMode, hidden, exiting, viewportWidth]);

  // Event-driven props. New events become obstacles ahead of the next pass.
  useEffect(() => {
    if (!primary || staticMode) return;
    const events = primary.events;
    if (events.length < lastEventCount.current) lastEventCount.current = 0;
    const fresh = events.slice(lastEventCount.current);
    lastEventCount.current = events.length;
    if (fresh.length === 0) return;

    const additions: TrailProp[] = [];
    for (const event of fresh) {
      const kind = propForEvent(event);
      if (!kind) continue;
      additions.push({
        id: `prop-${Date.now()}-${propSeq.current++}`,
        kind,
        lane: LANES[propSeq.current % LANES.length],
        addedAt: Date.now(),
      });
    }
    if (additions.length === 0) return;

    setProps(current => [...current, ...additions].slice(-MAX_PROPS));
    const last = additions[additions.length - 1];
    setPose(poseForProp(last.kind));
    const timer = window.setTimeout(() => setPose('stride'), 1_800);
    return () => window.clearTimeout(timer);
  }, [primary, primary?.events.length, staticMode]);

  // Props age out so a long run does not litter the bar.
  useEffect(() => {
    if (props.length === 0) return;
    const timer = window.setInterval(() => {
      const cutoff = Date.now() - PROP_TTL_MS;
      setProps(current => current.filter(prop => prop.addedAt >= cutoff));
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [props.length]);

  // On completion, finish the crossing and walk off the left edge.
  useEffect(() => {
    if (!animationEnabled) return;
    if (running) {
      setExiting(false);
      setHidden(false);
      return;
    }
    if (hidden) return;
    setExiting(true);
    // Drop any event pose so he leaves with a clean stride, not a leftover climb.
    setPose('stride');
    // Face the way he leaves. Without this he moon-walked left while still
    // mirrored to the right, which read as a sideways slide.
    setPosition(current => current.direction === -1 ? current : { ...current, direction: -1 });
    // Cover the remaining distance to the left edge in the spec's 1.2 s. This
    // used to use the same 1000x-fast unit math and hid him in one frame.
    const startX = Math.max(OFFSCREEN_LEFT_PERCENT, positionRef.current.x);
    const exitPercentPerMs = (startX - OFFSCREEN_LEFT_PERCENT) / EXIT_DURATION_MS;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(64, now - previous);
      previous = now;
      setPosition(current => {
        const next = current.x - exitPercentPerMs * dt;
        if (next <= -16) {
          cancelAnimationFrame(frame);
          setHidden(true);
          setExiting(false);
          setProps([]);
          return current;
        }
        return { ...current, x: next };
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animationEnabled, running, hidden, viewportWidth]);

  // Opt-in: when the setting is off, Scout is not mounted at all.
  if (!animationEnabled) return null;
  if (!primary || hidden) return null;

  const phase = exiting ? 'exit' : pose;
  const directionLabel = position.direction === -1 ? 'left' : 'right';
  const status = primary.summary
    || (running ? primary.title : primary.status === 'error' ? 'No live source covered this footprint.' : 'Run complete.');

  if (staticMode) {
    return (
      <div
        data-testid="scout-trail"
        data-phase="static"
        data-direction="none"
        data-props=""
        data-running={running ? 'true' : 'false'}
        data-motion="static"
        aria-label={`Scout. ${status}`}
        className="pointer-events-none absolute bottom-full left-0 right-0 z-20 flex h-[200px] items-end overflow-hidden"
      >
        <div className="relative flex h-full w-full items-end px-5 pb-1">
          <div className="h-[168px] w-[107px] shrink-0 opacity-90">
            <ScoutFigure pose="stride" label={`Scout. ${status}`} className="h-full w-full" />
          </div>
          <div className="mb-5 ml-3 min-w-0 rounded-lg border border-cyan-300/20 bg-[#07111c]/80 px-3 py-2 backdrop-blur-sm">
            <ScoutWordmark size="sm" />
            <div className="mt-1 truncate text-[11px] text-slate-300">{status}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="scout-trail"
      data-phase={phase}
      data-direction={directionLabel}
      data-props={props.map(prop => prop.kind).join(',')}
      data-running={running ? 'true' : 'false'}
      data-motion="full"
      aria-label={`Scout ${running ? 'is checking live public sources' : 'has finished'}. ${status}`}
      className="pointer-events-none absolute bottom-full left-0 right-0 z-20 h-[200px] overflow-hidden"
    >
      <div className="absolute inset-x-0 bottom-0 h-8 bg-[linear-gradient(180deg,transparent,rgba(2,6,23,0.45))]" />
      {props.map((prop, index) => (
        <div
          key={prop.id}
          className="absolute bottom-1"
          style={{ left: `${prop.lane}%`, height: prop.kind === 'log' ? 34 : 48, width: prop.kind === 'log' ? 78 : 64 }}
        >
          <PropGlyph kind={prop.kind} />
        </div>
      ))}
      <div
        className={`absolute bottom-0 ${running || exiting ? 'scout-trail-running' : ''}`}
        style={{
          left: `${position.x}%`,
          height,
          width: height * 0.64,
          transform: 'translateX(-50%)',
          '--scout-step-duration': `${stepDurationSeconds}s`,
        } as React.CSSProperties}
      >
        {activeCount > 1 && (
          <span className="absolute left-1/2 top-1 z-10 -translate-x-1/2 rounded-full border border-cyan-300/40 bg-[#07111c]/90 px-1.5 py-0.5 font-mono text-[9px] font-bold text-cyan-200">
            {activeCount} runs
          </span>
        )}
        <div className="scout-trail-body-bob h-full w-full">
          <ScoutFigure
            direction={position.direction === 1 ? 'right' : 'left'}
            pose={pose}
            className="h-full w-full"
            label={`Scout ${running ? 'walking the command bar while checking public sources' : 'leaving the command bar'}`}
          />
        </div>
      </div>
    </div>
  );
};

export default ScoutTrail;
