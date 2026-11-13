import type {
  A2UIScoutActivityEvent,
  ScoutCandidateAudit,
  ScoutJurisdictionResolution,
  ScoutNarration,
  ScoutRun,
  ScoutRunStats,
} from '../types.ts';

type Listener = () => void;

const NARRATION_TTL_MS = 9_000;
const MAX_RUNS = 40;
const MAX_EVENTS = 120;
const MAX_CANDIDATES = 30;

interface ScoutStoreState {
  runs: Record<string, ScoutRun>;
  order: string[];
  primaryRunId: string | null;
  narration: ScoutNarration | null;
  stopHandler: (() => void) | null;
}

const listeners = new Set<Listener>();

let state: ScoutStoreState = {
  runs: {},
  order: [],
  primaryRunId: null,
  narration: null,
  stopHandler: null,
};

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      /* a broken surface must not break a live Scout run */
    }
  }
}

function emptyStats(): ScoutRunStats {
  return {
    found: 0,
    accepted: 0,
    rejected: 0,
    verified: 0,
    cacheHit: false,
    browserHops: 0,
  };
}

function activeRunIds(): string[] {
  return state.order.filter(id => state.runs[id]?.status === 'running');
}

function choosePrimary(preferred?: string | null): string | null {
  if (preferred && state.runs[preferred]) return preferred;
  const running = activeRunIds();
  if (running.length > 0) return running[running.length - 1];
  return state.order[state.order.length - 1] ?? null;
}

function pruneRuns(): void {
  if (state.order.length <= MAX_RUNS) return;
  const removable = state.order.filter(id => state.runs[id]?.status !== 'running');
  while (state.order.length > MAX_RUNS && removable.length > 0) {
    const id = removable.shift()!;
    delete state.runs[id];
    state.order = state.order.filter(runId => runId !== id);
    if (state.primaryRunId === id) state.primaryRunId = choosePrimary();
  }
}

/** Module-level live state so an A2UI surface keeps updating across re-renders. */
export const scoutActivityStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getSnapshot: (): ScoutRun | null => {
    const id = state.primaryRunId;
    return id ? state.runs[id] ?? null : null;
  },

  getActiveRunCount: (): number => activeRunIds().length,

  getRun: (id: string | null | undefined): ScoutRun | null =>
    id ? state.runs[id] ?? null : null,

  getRuns: (): ScoutRun[] => state.order.map(id => state.runs[id]).filter(Boolean),

  getActiveRuns: (): ScoutRun[] =>
    activeRunIds().map(id => state.runs[id]).filter(Boolean),

  getNarration: (): ScoutNarration | null => state.narration,

  begin(input: { id: string; title: string; subtitle?: string; sessionId?: string }): ScoutRun {
    const now = Date.now();
    const run: ScoutRun = {
      id: input.id,
      sessionId: input.sessionId,
      title: input.title,
      subtitle: input.subtitle,
      status: 'running',
      startedAt: now,
      events: [
        {
          at: now,
          phase: 'start',
          kind: 'start',
          message: 'Scout is grounding the run to the project footprint.',
          level: 'info',
          runId: input.id,
        },
      ],
      candidates: [],
      warnings: [],
      stats: emptyStats(),
    };
    state.runs[input.id] = run;
    state.order = [...state.order.filter(id => id !== input.id), input.id];
    state.primaryRunId = input.id;
    pruneRuns();
    emit();
    return run;
  },

  push(id: string, event: A2UIScoutActivityEvent): void {
    const run = state.runs[id];
    if (!run || run.status !== 'running') return;
    state.runs[id] = {
      ...run,
      events: [...run.events, { ...event, runId: id }].slice(-MAX_EVENTS),
    };
    emit();
  },

  finish(
    id: string,
    status: Exclude<ScoutRun['status'], 'running'>,
    summary?: string,
  ): void {
    const run = state.runs[id];
    if (!run || run.status !== 'running') return;
    state.runs[id] = {
      ...run,
      status,
      summary,
      finishedAt: Date.now(),
    };
    state.primaryRunId = choosePrimary(state.primaryRunId === id ? null : state.primaryRunId);
    emit();
  },

  cancelCurrent(summary = 'Stopped by the user.'): void {
    const id = state.primaryRunId;
    if (!id) return;
    const run = state.runs[id];
    if (!run || run.status !== 'running') return;
    state.runs[id] = {
      ...run,
      status: 'cancelled',
      summary,
      finishedAt: Date.now(),
    };
    emit();
  },

  cancelRun(id: string, summary = 'Stopped by the user.'): void {
    const run = state.runs[id];
    if (!run || run.status !== 'running') return;
    state.runs[id] = {
      ...run,
      status: 'cancelled',
      summary,
      finishedAt: Date.now(),
    };
    if (state.primaryRunId === id) state.primaryRunId = choosePrimary();
    emit();
  },

  setCandidates(id: string, candidates: ScoutCandidateAudit[]): void {
    const run = state.runs[id];
    if (!run) return;
    const capped = candidates.slice(0, MAX_CANDIDATES);
    state.runs[id] = {
      ...run,
      candidates: capped,
      stats: {
        ...run.stats,
        found: capped.length,
        accepted: capped.filter(candidate => candidate.decision !== 'rejected').length,
        rejected: capped.filter(candidate => candidate.decision === 'rejected').length,
        verified: capped.filter(candidate => candidate.verified).length,
      },
    };
    emit();
  },

  setJurisdiction(id: string, jurisdiction: ScoutJurisdictionResolution): void {
    const run = state.runs[id];
    if (!run) return;
    state.runs[id] = { ...run, jurisdiction };
    emit();
  },

  setWarnings(id: string, warnings: string[]): void {
    const run = state.runs[id];
    if (!run) return;
    state.runs[id] = { ...run, warnings: [...warnings].slice(0, 12) };
    emit();
  },

  setCacheHit(id: string, cacheHit: boolean): void {
    const run = state.runs[id];
    if (!run) return;
    state.runs[id] = { ...run, stats: { ...run.stats, cacheHit } };
    emit();
  },

  narrate(
    runId: string,
    text: string,
    tone: ScoutNarration['tone'] = 'info',
  ): void {
    const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!clean) return;
    const at = Date.now();
    state.narration = {
      runId,
      text: clean.slice(0, 180),
      at,
      expiresAt: at + NARRATION_TTL_MS,
      tone,
    };
    emit();
  },

  clearNarration(): void {
    if (!state.narration) return;
    state.narration = null;
    emit();
  },

  setStopHandler(handler: (() => void) | null): void {
    state.stopHandler = handler;
  },

  requestStop(): void {
    try {
      state.stopHandler?.();
    } catch {
      /* stopping is best-effort; the run also has its own signal */
    }
  },

  reset(): void {
    state = {
      runs: {},
      order: [],
      primaryRunId: null,
      narration: null,
      stopHandler: state.stopHandler,
    };
    emit();
  },
};

export const SCOUT_NARRATION_TTL_MS = NARRATION_TTL_MS;

export default scoutActivityStore;
