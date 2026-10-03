// Tiny event bus that lets the silent zoning bootstrap report its progress
// to whatever UI wants to display it (today: the Map & Districts card in
// the ZoningResultsPanel). Replaces the previous opaque "researching\u2026"
// label with stage-by-stage feedback.

export type BootstrapStage =
  | 'idle'                  // nothing in progress
  | 'starting'              // about to fire the bootstrap prompt
  | 'streaming'             // model is generating the initial response
  | 'tool-call'             // Claw tool call in flight (hop N)
  | 'streaming-followup'    // model is consuming a Claw result and writing more output
  | 'parsing'               // we received the final text and are parsing the JSON
  | 'pinning'               // writing facts to the KnowledgeBase
  | 'done'                  // success
  | 'failed';               // unrecoverable error

export interface BootstrapStatus {
  stage: BootstrapStage;
  /** Wall-clock ms when this run started. Use Date.now() - startedAt for elapsed. */
  startedAt: number;
  /** Short human label, e.g. "Tool call: scrape_text (hop 2)". */
  message: string;
  /** Optional detail line. */
  detail?: string;
  /** Streaming progress \u2014 char count of the running response. */
  bytes?: number;
  /** Current hop number for Claw multi-step calls. */
  hop?: number;
}

type Listener = (s: BootstrapStatus) => void;

const listeners = new Set<Listener>();
let current: BootstrapStatus = { stage: 'idle', startedAt: 0, message: 'Idle' };

export function setBootstrapStatus(partial: Partial<BootstrapStatus> & { stage: BootstrapStage }) {
  const startedAt =
    partial.stage === 'starting'
      ? Date.now()
      : (current.stage === 'idle' || current.startedAt === 0 ? Date.now() : current.startedAt);
  current = {
    stage: partial.stage,
    startedAt,
    message: partial.message ?? current.message,
    detail: partial.detail,
    bytes: partial.bytes,
    hop: partial.hop,
  };
  for (const l of listeners) {
    try { l(current); } catch { /* listener crash should never break the bus */ }
  }
}

export function subscribeBootstrap(fn: Listener): () => void {
  listeners.add(fn);
  // Push current state immediately so late subscribers see what's happening.
  try { fn(current); } catch { /* ignore */ }
  return () => { listeners.delete(fn); };
}

export function getBootstrapStatus(): BootstrapStatus { return current; }

/** Pretty stage label for UI. */
export function stageLabel(s: BootstrapStage): string {
  switch (s) {
    case 'idle': return 'Idle';
    case 'starting': return 'Starting research\u2026';
    case 'streaming': return 'Searching for zoning map & district list\u2026';
    case 'tool-call': return 'Fetching from the municipality\u2019s website\u2026';
    case 'streaming-followup': return 'Analyzing fetched content\u2026';
    case 'parsing': return 'Extracting structured data\u2026';
    case 'pinning': return 'Saving to project knowledge base\u2026';
    case 'done': return 'Done';
    case 'failed': return 'Lookup failed';
  }
}
