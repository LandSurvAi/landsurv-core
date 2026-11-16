/**
 * Civil Drafter turn diagnostics.
 *
 * A drafting turn spans many moving parts: parcel/OSM grounding, the Surveyor's
 * Eye raster captures, approved-lesson retrieval, the model stream, deterministic
 * take review, the acceptance loop and the final canvas commit. When a turn
 * silently commits nothing, none of those stages leave a user-visible trace.
 *
 * This store keeps the last few turns with per-phase timings and counts so the
 * Surveyor's Eye panel can answer "what happened and where did the time go?"
 * without a browser devtools session.
 */

export type CivilDrafterTraceStatus = 'running' | 'committed' | 'empty' | 'failed';
export type CivilDrafterPhaseStatus = 'running' | 'ok' | 'error' | 'skipped';

export interface CivilDrafterPhaseTrace {
  id: string;
  label: string;
  startedAt: number;
  finishedAt: number | null;
  durationMs: number | null;
  status: CivilDrafterPhaseStatus;
  detail?: string;
}

export interface CivilDrafterVisionTrace {
  captures: number;
  frameCount: number;
  byteSize: number;
  durationMs: number;
  width?: number;
  height?: number;
  pass?: string;
}

export interface CivilDrafterRagTrace {
  status: 'ok' | 'unavailable' | 'skipped';
  hitCount: number;
  latencyMs: number;
  error?: string;
}

export interface CivilDrafterLineTrace {
  attempted: number;
  committed: number;
  unresolved: number;
  byType: Record<string, number>;
}

export interface CivilDrafterTurnTrace {
  id: string;
  agent: string;
  query: string;
  startedAt: number;
  finishedAt: number | null;
  durationMs: number | null;
  status: CivilDrafterTraceStatus;
  phases: CivilDrafterPhaseTrace[];
  vision?: CivilDrafterVisionTrace;
  rag?: CivilDrafterRagTrace;
  lines?: CivilDrafterLineTrace;
  /** Plain-language outcome, especially when nothing was committed. */
  reason?: string;
}

export interface CivilDrafterDiagnosticsSnapshot {
  activeTurnId: string | null;
  turns: CivilDrafterTurnTrace[];
}

const MAX_TURNS = 6;
const MAX_QUERY_CHARS = 240;

let activeTurnId: string | null = null;
let turns: CivilDrafterTurnTrace[] = [];
let snapshot: CivilDrafterDiagnosticsSnapshot = { activeTurnId: null, turns: [] };
const listeners = new Set<() => void>();

function publish(): void {
  snapshot = { activeTurnId, turns };
  for (const listener of listeners) listener();
}

function activeTurn(): CivilDrafterTurnTrace | null {
  if (!activeTurnId) return null;
  return turns.find(turn => turn.id === activeTurnId) ?? null;
}

function replaceTurn(next: CivilDrafterTurnTrace): void {
  turns = turns.map(turn => turn.id === next.id ? next : turn);
}

let sequence = 0;

export const civilDrafterDiagnostics = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): CivilDrafterDiagnosticsSnapshot {
    return snapshot;
  },
  startTurn(input: { agent: string; query: string }): string {
    sequence += 1;
    const id = `draft-${Date.now()}-${sequence}`;
    const turn: CivilDrafterTurnTrace = {
      id,
      agent: input.agent,
      query: (input.query ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_CHARS),
      startedAt: Date.now(),
      finishedAt: null,
      durationMs: null,
      status: 'running',
      phases: [],
    };
    activeTurnId = id;
    turns = [turn, ...turns].slice(0, MAX_TURNS);
    publish();
    return id;
  },
  beginPhase(id: string, label: string): void {
    const turn = activeTurn();
    if (!turn) return;
    replaceTurn({
      ...turn,
      phases: [
        ...turn.phases.filter(phase => phase.id !== id || phase.status !== 'running'),
        {
          id,
          label,
          startedAt: Date.now(),
          finishedAt: null,
          durationMs: null,
          status: 'running',
        },
      ],
    });
    publish();
  },
  endPhase(id: string, status: Exclude<CivilDrafterPhaseStatus, 'running'> = 'ok', detail?: string): void {
    const turn = activeTurn();
    if (!turn) return;
    const phases = [...turn.phases];
    for (let index = phases.length - 1; index >= 0; index -= 1) {
      const phase = phases[index];
      if (phase.id !== id || phase.status !== 'running') continue;
      const finishedAt = Date.now();
      phases[index] = {
        ...phase,
        finishedAt,
        durationMs: finishedAt - phase.startedAt,
        status,
        detail,
      };
      break;
    }
    replaceTurn({ ...turn, phases });
    publish();
  },
  recordVision(patch: {
    pass?: string;
    frameCount: number;
    byteSize: number;
    durationMs: number;
    width?: number;
    height?: number;
  }): void {
    const turn = activeTurn();
    if (!turn) return;
    const previous = turn.vision;
    replaceTurn({
      ...turn,
      vision: {
        captures: (previous?.captures ?? 0) + 1,
        frameCount: (previous?.frameCount ?? 0) + Math.max(0, Math.round(patch.frameCount)),
        byteSize: (previous?.byteSize ?? 0) + Math.max(0, Math.round(patch.byteSize)),
        durationMs: (previous?.durationMs ?? 0) + Math.max(0, Math.round(patch.durationMs)),
        width: patch.width ?? previous?.width,
        height: patch.height ?? previous?.height,
        pass: patch.pass ?? previous?.pass,
      },
    });
    publish();
  },
  recordRag(patch: CivilDrafterRagTrace): void {
    const turn = activeTurn();
    if (!turn) return;
    replaceTurn({ ...turn, rag: patch });
    publish();
  },
  recordLines(patch: CivilDrafterLineTrace): void {
    const turn = activeTurn();
    if (!turn) return;
    replaceTurn({ ...turn, lines: patch });
    publish();
  },
  finishTurn(input: { status?: CivilDrafterTraceStatus; reason?: string } = {}): void {
    const turn = activeTurn();
    if (!turn) return;
    const finishedAt = Date.now();
    replaceTurn({
      ...turn,
      status: input.status ?? (turn.lines && turn.lines.committed > 0 ? 'committed' : 'empty'),
      reason: input.reason ?? turn.reason,
      finishedAt,
      durationMs: finishedAt - turn.startedAt,
    });
    activeTurnId = null;
    publish();
  },
  failTurn(reason: string): void {
    const turn = activeTurn();
    if (!turn) return;
    const finishedAt = Date.now();
    replaceTurn({
      ...turn,
      status: 'failed',
      reason,
      finishedAt,
      durationMs: finishedAt - turn.startedAt,
    });
    activeTurnId = null;
    publish();
  },
  reset(): void {
    activeTurnId = null;
    turns = [];
    publish();
  },
};

/** Plain-text receipt for the clipboard / fieldbook. */
export function formatCivilDrafterTrace(turn: CivilDrafterTurnTrace): string {
  const lines: string[] = [];
  lines.push(`Civil Drafter draft receipt — ${turn.status.toUpperCase()}`);
  lines.push(`Agent: ${turn.agent}`);
  lines.push(`Request: ${turn.query || '(empty)'}`);
  lines.push(`Elapsed: ${turn.durationMs !== null ? `${(turn.durationMs / 1000).toFixed(2)} s` : 'still running'}`);
  if (turn.reason) lines.push(`Outcome: ${turn.reason}`);
  if (turn.lines) {
    const types = Object.entries(turn.lines.byType)
      .filter(([, count]) => count > 0)
      .map(([type, count]) => `${type}:${count}`)
      .join(', ');
    lines.push(
      `Lines: ${turn.lines.committed}/${turn.lines.attempted} committed`
      + (turn.lines.unresolved > 0 ? `, ${turn.lines.unresolved} unresolved endpoint(s)` : '')
      + (types ? ` (${types})` : ''),
    );
  }
  if (turn.vision) {
    lines.push(
      `Surveyor's Eye: ${turn.vision.captures} capture(s), ${turn.vision.frameCount} frame(s), `
      + `${(turn.vision.byteSize / 1024 / 1024).toFixed(2)} MB, ${turn.vision.durationMs} ms`,
    );
  }
  if (turn.rag) {
    lines.push(
      `RAG lessons: ${turn.rag.status} · ${turn.rag.hitCount} hit(s) · ${turn.rag.latencyMs} ms`
      + (turn.rag.error ? ` · ${turn.rag.error}` : ''),
    );
  }
  for (const phase of turn.phases) {
    lines.push(
      `  ${phase.status === 'ok' ? '✓' : phase.status === 'error' ? '✗' : phase.status === 'skipped' ? '–' : '·'} `
      + `${phase.label}: ${phase.durationMs ?? 0} ms`
      + (phase.detail ? ` — ${phase.detail}` : ''),
    );
  }
  return lines.join('\n');
}
