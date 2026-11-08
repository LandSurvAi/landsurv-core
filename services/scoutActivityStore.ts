import type {
  A2UIScoutActivityEvent,
  A2UIScoutActivitySnapshot,
} from '../types.ts';

type Listener = () => void;

const listeners = new Set<Listener>();
let snapshot: A2UIScoutActivitySnapshot | null = null;

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      /* a broken surface must not break a live Scout run */
    }
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

  getSnapshot: (): A2UIScoutActivitySnapshot | null => snapshot,

  begin(input: { id: string; title: string; subtitle?: string }): A2UIScoutActivitySnapshot {
    const now = Date.now();
    snapshot = {
      id: input.id,
      title: input.title,
      subtitle: input.subtitle,
      status: 'running',
      startedAt: now,
      events: [
        {
          at: now,
          phase: 'start',
          message: 'Scout is starting live source discovery.',
          level: 'info',
        },
      ],
    };
    emit();
    return snapshot;
  },

  push(id: string, event: A2UIScoutActivityEvent): void {
    if (!snapshot || snapshot.id !== id || snapshot.status !== 'running') return;
    snapshot = {
      ...snapshot,
      events: [...snapshot.events, event].slice(-80),
    };
    emit();
  },

  finish(
    id: string,
    status: Exclude<A2UIScoutActivitySnapshot['status'], 'running'>,
    summary?: string,
  ): void {
    if (!snapshot || snapshot.id !== id || snapshot.status !== 'running') return;
    snapshot = {
      ...snapshot,
      status,
      summary,
      finishedAt: Date.now(),
    };
    emit();
  },

  cancelCurrent(summary = 'Stopped by the user.'): void {
    if (!snapshot || snapshot.status !== 'running') return;
    snapshot = {
      ...snapshot,
      status: 'cancelled',
      summary,
      finishedAt: Date.now(),
    };
    emit();
  },

  reset(): void {
    snapshot = null;
    emit();
  },
};
