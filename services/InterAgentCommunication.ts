/**
 * Inter-Agent Communication Service
 * 
 * Enables agents to communicate with each other through the LSVZ agent as an MCP server.
 * This follows a pub/sub pattern where agents can send messages and subscribe to events.
 */

import { AgentType } from '../types.ts';

export interface AgentMessage {
  id: string;
  from: AgentType;
  to: AgentType | 'broadcast'; // 'broadcast' sends to all agents
  command: string;
  data: Record<string, unknown>;
  timestamp: number;
  metadata?: {
    context?: string; // Additional context from sender
    requiresResponse?: boolean;
    traceId?: string;
    parentMessageId?: string;
  };
}

export interface AgentResponse {
  requestId: string;
  from: AgentType;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  timestamp: number;
}

type MessageHandler = (message: AgentMessage) => Promise<AgentResponse | void>;
type ErrorHandler = (error: Error, message: AgentMessage) => void;
export type CacpPolicyMode = 'off' | 'soft' | 'hard';
export type CacpPolicyStatus = 'pass' | 'warn' | 'blocked';

export interface CacpActivityEvent {
  messageId: string;
  from: AgentType;
  to: AgentType | 'broadcast';
  command: string;
  timestamp: number;
  /** Lifecycle phase that triggered this event. Defaults to 'send' for back-compat. */
  phase?: CacpLogPhase;
  traceId?: string;
}
type ActivityHandler = (event: CacpActivityEvent) => void;

/**
 * One entry in the persistent CACP activity log. Captures every notable phase
 * of a message lifecycle (send / handler-invoked / response / error) plus the
 * raw payload (clipped) so the DevOps console + CLI can replay traffic later.
 */
export type CacpLogPhase = 'send' | 'handler' | 'response' | 'error' | 'no-handler';

export interface CacpLogEntry {
  /** Monotonic local id — useful for stable sort + dedupe. */
  seq: number;
  /** Unix ms. */
  timestamp: number;
  phase: CacpLogPhase;
  messageId: string;
  from: AgentType | 'system';
  to: AgentType | 'broadcast';
  command: string;
  /** Cheap-to-render preview of the payload (truncated JSON). */
  preview: string;
  /** Full payload bytes, kept as-is for export. May be a stringified clip. */
  data?: unknown;
  /** Optional success flag when phase === 'response'. */
  success?: boolean;
  /** Error message when phase === 'error'. */
  error?: string;
  /** Wall-clock ms between this entry and the originating 'send' (response/error only). */
  latencyMs?: number;
  /** Trace id propagated across askPeer chains for causal debugging. */
  traceId?: string;
  /** Policy result for this lifecycle step. */
  policyStatus?: CacpPolicyStatus;
  /** Human-readable policy warnings emitted in soft mode. */
  policyWarnings?: string[];
}

const LOG_MAX = 500;
const LOG_STORAGE_KEY = 'landsurv-cacp-log';
const CACHE_STORAGE_KEY = 'landsurv-cacp-cache-v1';
const POLICY_MODE_STORAGE_KEY = 'landsurv-cacp-policy-mode';
const PREVIEW_MAX_LEN = 240;
const CACHE_MAX = 250;
const BROADCAST_REPLAY_TTL_MS = 120_000;

function safeStringify(value: unknown, maxLen = PREVIEW_MAX_LEN): string {
  try {
    const json = JSON.stringify(value, (_k, v) => {
      if (v instanceof Map) return Object.fromEntries(v);
      if (v instanceof Set) return Array.from(v);
      if (typeof v === 'bigint') return v.toString();
      return v;
    });
    if (!json) return '';
    return json.length > maxLen ? json.slice(0, maxLen - 1) + '…' : json;
  } catch {
    return '[unserializable]';
  }
}

function createTraceId(): string {
  return `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type FieldSchema = {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  required?: boolean;
  items?: FieldSchema;
  properties?: Record<string, FieldSchema>;
  enum?: Array<string | number>;
};

function isValueMatchingSchema(value: unknown, schema: FieldSchema): boolean {
  if (value === undefined || value === null) return !schema.required;
  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') return false;
      if (schema.enum && !schema.enum.includes(value)) return false;
      return true;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      if (!Array.isArray(value)) return false;
      if (!schema.items) return true;
      return value.every(item => isValueMatchingSchema(item, schema.items!));
    case 'object':
      if (typeof value !== 'object' || Array.isArray(value)) return false;
      if (!schema.properties) return true;
      return Object.entries(schema.properties).every(([key, childSchema]) => {
        const childValue = (value as Record<string, unknown>)[key];
        return isValueMatchingSchema(childValue, childSchema);
      });
    default:
      return true;
  }
}

interface PolicyEvaluation {
  allowed: boolean;
  status: CacpPolicyStatus;
  warnings: string[];
}

export interface CacpCachedResult {
  /** Skill / command this entry caches. */
  skillId: string;
  /** Stable cache key (skillId + payload signature) — used for lookups. */
  cacheKey: string;
  /** Original payload (for context-checking before reuse). */
  payload: Record<string, unknown>;
  /** The response data returned by the owning agent. */
  data: Record<string, unknown>;
  /** Agent that produced the data. */
  from: AgentType;
  /** Wall-clock time the entry was stored. */
  cachedAt: number;
  /** Expiry timestamp (Date.now()). */
  expiresAt: number;
}

export class InterAgentCommunicationService {
  private handlers: Map<string, MessageHandler[]> = new Map();
  private errorHandlers: ErrorHandler[] = [];
  private activityHandlers: ActivityHandler[] = [];
  private messageQueue: AgentMessage[] = [];
  private messageIdCounter = 0;
  private responseCallbacks: Map<string, (response: AgentResponse) => void> = new Map();

  // --- Skill result cache ---------------------------------------------------
  // Lets agents reuse a recent peer answer (e.g. Zoning Agent's setbacks) without
  // re-running the costly remote lookup. Keys are `${skillId}::${signature}`.
  private resultCache: Map<string, CacpCachedResult> = new Map();

  // --- CACP activity log ----------------------------------------------------
  private log: CacpLogEntry[] = [];
  private logSeq = 0;
  private logListeners: Array<(entries: CacpLogEntry[]) => void> = [];
  private sendStartTimes: Map<string, number> = new Map();
  private policyMode: CacpPolicyMode = 'soft';
  private commandRateLimitsPerMinute: Map<string, number> = new Map();
  private commandWindow: Map<string, { windowStart: number; count: number }> = new Map();
  private commandTimeoutMs: Map<string, number> = new Map();
  private pendingBroadcasts: Map<string, AgentMessage[]> = new Map();
  private cooperativeYieldMs = 1;

  constructor() {
    this.restoreLog();
    this.restorePolicyMode();
    this.restoreCache();
    // Heavy geometry operations often exceed 5s; establish safer defaults.
    this.commandTimeoutMs.set('cogo_shrinkwrap', 20_000);
    this.commandTimeoutMs.set('cogo_traverse_adjust', 15_000);
    this.commandTimeoutMs.set('cogo_subdivide_parallel', 15_000);
    this.commandTimeoutMs.set('cogo_subdivide_swing', 15_000);
  }

  private restoreLog(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage?.getItem(LOG_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.log = parsed.slice(-LOG_MAX);
        this.logSeq = this.log.reduce((max, e) => Math.max(max, e.seq || 0), 0);
      }
    } catch {
      /* ignore corrupt storage */
    }
  }

  private persistLog(): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage?.setItem(LOG_STORAGE_KEY, JSON.stringify(this.log));
    } catch {
      /* storage may be full or disabled — non-fatal */
    }
  }

  private restorePolicyMode(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage?.getItem(POLICY_MODE_STORAGE_KEY);
      if (raw === 'off' || raw === 'soft' || raw === 'hard') {
        this.policyMode = raw;
      }
    } catch {
      /* ignore corrupt storage */
    }
  }

  private persistPolicyMode(): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage?.setItem(POLICY_MODE_STORAGE_KEY, this.policyMode);
    } catch {
      /* ignore storage write failure */
    }
  }

  private restoreCache(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage?.getItem(CACHE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as CacpCachedResult[];
      if (!Array.isArray(parsed)) return;
      const now = Date.now();
      this.resultCache.clear();
      for (const entry of parsed.slice(-CACHE_MAX)) {
        if (!entry || typeof entry !== 'object') continue;
        if (entry.expiresAt <= now) continue;
        this.resultCache.set(entry.cacheKey, entry);
      }
    } catch {
      /* ignore corrupt storage */
    }
  }

  private persistCache(): void {
    if (typeof window === 'undefined') return;
    try {
      const now = Date.now();
      const entries = Array.from(this.resultCache.values())
        .filter(e => e.expiresAt > now)
        .sort((a, b) => b.cachedAt - a.cachedAt)
        .slice(0, CACHE_MAX);
      window.localStorage?.setItem(CACHE_STORAGE_KEY, JSON.stringify(entries));
    } catch {
      /* ignore storage write failure */
    }
  }

  private pushLog(entry: Omit<CacpLogEntry, 'seq'>): CacpLogEntry {
    const full: CacpLogEntry = { ...entry, seq: ++this.logSeq };
    this.log.push(full);
    if (this.log.length > LOG_MAX) this.log = this.log.slice(-LOG_MAX);
    this.persistLog();
    // Notify subscribers (best-effort, never throw out)
    for (const fn of this.logListeners) {
      try { fn(this.log); } catch { /* swallow */ }
    }
    // Also fan out as an activity event so the in-app indicator reflects
    // every CACP phase (not just initial sends from one agent).
    if (full.from !== 'system') {
      const activityEvent: CacpActivityEvent = {
        messageId: full.messageId,
        from: full.from as AgentType,
        to: full.to,
        command: full.command,
        timestamp: full.timestamp,
        phase: full.phase,
        traceId: full.traceId,
      };
      for (const h of this.activityHandlers) {
        try { h(activityEvent); } catch { /* swallow */ }
      }
    }
    return full;
  }

  /** Record an out-of-band CACP-relevant action (e.g. PointAgent.getNextNumbers direct call). */
  public recordActivity(params: {
    from: AgentType | 'system';
    to: AgentType | 'broadcast';
    command: string;
    data?: Record<string, unknown>;
    phase?: CacpLogPhase;
  }): void {
    const messageId = `local-${++this.messageIdCounter}-${Date.now()}`;
    const traceId = createTraceId();
    const ts = Date.now();
    this.pushLog({
      timestamp: ts,
      phase: params.phase ?? 'send',
      messageId,
      from: params.from,
      to: params.to,
      command: params.command,
      preview: safeStringify(params.data ?? {}),
      data: params.data,
      traceId,
      policyStatus: 'pass',
    });
    // pushLog also fans out as an activity event, but 'system'-originated entries
    // are not surfaced there. Emit an explicit event so direct local calls still
    // light up the bottom-left indicator.
    if (params.from === 'system') {
      const activityEvent: CacpActivityEvent = {
        messageId,
        from: AgentType.POINT_EDITOR,
        to: params.to,
        command: params.command,
        timestamp: ts,
        phase: params.phase ?? 'send',
        traceId,
      };
      this.activityHandlers.forEach(h => { try { h(activityEvent); } catch { /* ignore */ } });
    }
  }

  public setPolicyMode(mode: CacpPolicyMode): void {
    this.policyMode = mode;
    this.persistPolicyMode();
  }

  public getPolicyMode(): CacpPolicyMode {
    return this.policyMode;
  }

  public setCommandRateLimit(command: string, maxPerMinute: number): void {
    if (!command || !Number.isFinite(maxPerMinute) || maxPerMinute <= 0) return;
    this.commandRateLimitsPerMinute.set(command, Math.floor(maxPerMinute));
  }

  public setCommandTimeout(command: string, timeoutMs: number): void {
    if (!command || !Number.isFinite(timeoutMs) || timeoutMs <= 0) return;
    this.commandTimeoutMs.set(command, Math.floor(timeoutMs));
  }

  public getCommandTimeout(command: string): number | undefined {
    return this.commandTimeoutMs.get(command);
  }

  public setCooperativeYieldMs(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.cooperativeYieldMs = Math.floor(ms);
  }

  public getCooperativeYieldMs(): number {
    return this.cooperativeYieldMs;
  }

  private async maybeYieldToEventLoop(): Promise<void> {
    if (this.cooperativeYieldMs <= 0) return;
    await new Promise<void>(resolve => setTimeout(resolve, this.cooperativeYieldMs));
  }

  private async replayPendingBroadcasts(command: string): Promise<void> {
    const pending = this.pendingBroadcasts.get(command);
    if (!pending || pending.length === 0) return;
    this.pendingBroadcasts.delete(command);
    const handlers = this.handlers.get(command) || [];
    if (handlers.length === 0) return;
    for (const queuedMessage of pending) {
      for (const handler of handlers) {
        await this.maybeYieldToEventLoop();
        try {
          this.pushLog({
            timestamp: Date.now(),
            phase: 'handler',
            messageId: queuedMessage.id,
            from: queuedMessage.from,
            to: 'broadcast',
            command: queuedMessage.command,
            preview: 'replaying queued broadcast to newly mounted handler',
            traceId: queuedMessage.metadata?.traceId,
            policyStatus: 'pass',
          });
          const response = await handler(queuedMessage);
          if (response) {
            this.pushLog({
              timestamp: Date.now(),
              phase: 'response',
              messageId: queuedMessage.id,
              from: response.from,
              to: queuedMessage.from,
              command: queuedMessage.command,
              preview: safeStringify(response.data ?? { success: response.success }),
              data: response.data,
              success: response.success,
              traceId: queuedMessage.metadata?.traceId,
              policyStatus: 'pass',
            });
          }
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.pushLog({
            timestamp: Date.now(),
            phase: 'error',
            messageId: queuedMessage.id,
            from: queuedMessage.from,
            to: 'broadcast',
            command: queuedMessage.command,
            preview: `queued broadcast replay failed: ${err.message}`,
            error: err.message,
            traceId: queuedMessage.metadata?.traceId,
            policyStatus: 'warn',
          });
        }
      }
    }
  }

  public listRegisteredCommands(): string[] {
    return Array.from(this.handlers.keys()).sort();
  }

  public getHandlerCount(command: string): number {
    return this.handlers.get(command)?.length ?? 0;
  }

  private checkRateLimit(from: AgentType, command: string): string | null {
    const key = `${from}::${command}`;
    const now = Date.now();
    const windowMs = 60_000;
    const defaultLimit = 180;
    const limit = this.commandRateLimitsPerMinute.get(command) ?? defaultLimit;
    const state = this.commandWindow.get(key);
    if (!state || now - state.windowStart >= windowMs) {
      this.commandWindow.set(key, { windowStart: now, count: 1 });
      return null;
    }
    state.count += 1;
    if (state.count > limit) {
      return `rate-limit warning: ${from} exceeded ${limit}/min for ${command}`;
    }
    return null;
  }

  private async evaluatePolicy(message: AgentMessage): Promise<PolicyEvaluation> {
    if (this.policyMode === 'off') {
      return { allowed: true, status: 'pass', warnings: [] };
    }

    const warnings: string[] = [];
    const { agentRegistry } = await import('./AgentRegistry.ts');
    const owner = agentRegistry.findOwnerOfSkill(message.command);
    const senderManifest = agentRegistry.get(message.from);
    const skill = agentRegistry.findSkill(message.command);

    if (!senderManifest?.cacpEnabled) {
      warnings.push(`sender ${message.from} is not CACP-enabled in registry`);
    }
    if (!owner) {
      warnings.push(`no registered owner found for command ${message.command}`);
    } else if (message.to !== 'broadcast' && message.to !== owner.agent) {
      warnings.push(`target ${message.to} does not match owner ${owner.agent} for ${message.command}`);
    }

    if (skill) {
      for (const [key, schema] of Object.entries(skill.inputs as Record<string, FieldSchema>)) {
        const value = message.data[key];
        if (!isValueMatchingSchema(value, schema)) {
          warnings.push(`payload field ${key} failed ${schema.type} validation for ${message.command}`);
        }
      }
    }

    const rateLimitWarning = this.checkRateLimit(message.from, message.command);
    if (rateLimitWarning) warnings.push(rateLimitWarning);

    if (warnings.length === 0) {
      return { allowed: true, status: 'pass', warnings };
    }

    const hardBlocked = this.policyMode === 'hard';
    return {
      allowed: !hardBlocked,
      status: hardBlocked ? 'blocked' : 'warn',
      warnings,
    };
  }

  /** Return a copy of the current activity log. */
  public getLog(): CacpLogEntry[] {
    return this.log.slice();
  }

  /**
   * Intent gate (CACP overhaul): consult the intent router before an agent acts on
   * a natural-language request.
   *
   * - The request is ALWAYS broadcast to all CACP-enabled agents as a `cacp:offer`
   *   so peers can "speak up" (the ask-around), logged to the CACP activity log.
   * - When the request clearly belongs to a DIFFERENT agent than `fromAgent`, the
   *   result carries a routing suggestion; the caller decides whether to hand off,
   *   ask the user, or proceed. This is advisory (returns a suggestion), not a hard
   *   block — agents keep their existing behavior unless they opt to honor it.
   *
   * Returns the routing decision plus the broadcast's message id.
   */
  public async offerRequest(
    fromAgent: AgentType,
    requestText: string,
    context?: Record<string, unknown>,
  ): Promise<{
    messageId: string;
    handledBy: AgentType;
    suggestedAgent?: { agent: AgentType; displayName: string; matchedOn: string[] };
    alternates?: Array<{ agent: AgentType; displayName: string }>;
    isMismatched: boolean;
    explanation: string;
  }> {
    const { routeIntent } = await import('./cacpIntentRouter.ts');
    const route = routeIntent(requestText, fromAgent);

    // Broadcast the offer so peers can claim it (ask-around). This is a soft
    // signal; peers with a matching intent handler may respond.
    const offerMessage: AgentMessage = {
      id: `offer-${++this.messageIdCounter}-${Date.now()}`,
      from: fromAgent,
      to: 'broadcast',
      command: 'cacp:offer',
      data: { request: requestText, ...(context ?? {}) },
      timestamp: Date.now(),
      metadata: { traceId: createTraceId(), requiresResponse: false },
    };
    this.pushLog({
      timestamp: offerMessage.timestamp,
      phase: 'send',
      messageId: offerMessage.id,
      from: fromAgent,
      to: 'broadcast',
      command: 'cacp:offer',
      preview: safeStringify({ request: requestText.slice(0, 120), route: route.explanation }),
      data: { request: requestText, route: route.explanation },
      traceId: offerMessage.metadata!.traceId,
      policyStatus: 'pass',
    });

    return {
      messageId: offerMessage.id,
      handledBy: route.primary?.agent ?? fromAgent,
      suggestedAgent: route.primary
        ? { agent: route.primary.agent, displayName: route.primary.displayName, matchedOn: route.primary.matchedOn }
        : undefined,
      alternates: route.alternates.map(a => ({ agent: a.agent, displayName: a.displayName })),
      isMismatched: route.isMismatched,
      explanation: route.explanation,
    };
  }

  /**
   * Register a handler that can CLAIM an offered request (a peer "speaking up").
   * The handler returns true if it wants the job. Used by agents that can take
   * over a mismatched request (e.g. Civil Drafter claiming "draw a road").
   */
  public onOfferClaim(handler: (offer: { from: AgentType; request: string; data: Record<string, unknown> }) => boolean | Promise<boolean>): () => void {
    return this.onCommand('cacp:offer', async (message) => {
      const request = typeof message.data?.request === 'string' ? message.data.request : '';
      if (!request) return;
      const wants = await handler({ from: message.from, request, data: message.data });
      if (wants) {
        return {
          requestId: message.id,
          from: (this as unknown as { _selfAgent?: AgentType })._selfAgent ?? message.to as AgentType,
          success: true,
          data: { claims: true, request },
          timestamp: Date.now(),
        };
      }
      return;
    });
  }


  /** Clear the persistent activity log. */
  public clearLog(): void {
    this.log = [];
    this.logSeq = 0;
    this.persistLog();
    for (const fn of this.logListeners) {
      try { fn(this.log); } catch { /* swallow */ }
    }
  }

  /** Subscribe to log changes (returns unsubscribe). */
  public onLog(handler: (entries: CacpLogEntry[]) => void): () => void {
    this.logListeners.push(handler);
    return () => {
      const idx = this.logListeners.indexOf(handler);
      if (idx > -1) this.logListeners.splice(idx, 1);
    };
  }

  /** Serialise the log as pretty JSON (for download / clipboard). */
  public exportLogJson(): string {
    return JSON.stringify(this.log, null, 2);
  }

  /**
   * Register a handler for a specific command
   * Multiple handlers can be registered for the same command
   */
  public onCommand(command: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(command)) {
      this.handlers.set(command, []);
    }
    this.handlers.get(command)!.push(handler);
    // If this command had queued broadcasts while no handlers were mounted,
    // replay them now so startup races don't drop important signals.
    void this.replayPendingBroadcasts(command);

    // Return unsubscribe function
    return () => {
      const handlers = this.handlers.get(command);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  /**
   * Register global error handler
   */
  public onError(handler: ErrorHandler): () => void {
    this.errorHandlers.push(handler);
    return () => {
      const index = this.errorHandlers.indexOf(handler);
      if (index > -1) {
        this.errorHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Subscribe to all inter-agent activity events.
   * Fires once per sendMessage / request call, before handlers run.
   * Returns an unsubscribe function.
   */
  public onActivity(handler: ActivityHandler): () => void {
    this.activityHandlers.push(handler);
    return () => {
      const index = this.activityHandlers.indexOf(handler);
      if (index > -1) this.activityHandlers.splice(index, 1);
    };
  }

  /**
   * Send a message to another agent or broadcast to all agents
   */
  public async sendMessage(
    from: AgentType,
    to: AgentType | 'broadcast',
    command: string,
    data: Record<string, unknown>,
    metadata?: { context?: string; requiresResponse?: boolean; traceId?: string; parentMessageId?: string }
  ): Promise<AgentResponse | void> {
    const traceId = metadata?.traceId || createTraceId();
    const message: AgentMessage = {
      id: `msg-${++this.messageIdCounter}-${Date.now()}`,
      from,
      to,
      command,
      data,
      timestamp: Date.now(),
      metadata: {
        ...metadata,
        traceId,
      },
    };

    console.log(`[InterAgent] ${from} → ${to}: ${command}`, data);

    // Log: send phase
    this.sendStartTimes.set(message.id, message.timestamp);
    const policy = await this.evaluatePolicy(message);
    this.pushLog({
      timestamp: message.timestamp,
      phase: 'send',
      messageId: message.id,
      from,
      to,
      command,
      preview: safeStringify(data),
      data,
      traceId,
      policyStatus: policy.status,
      policyWarnings: policy.warnings.length > 0 ? policy.warnings : undefined,
    });

    if (policy.warnings.length > 0 && this.policyMode !== 'off') {
      console.warn(`[InterAgent][Policy:${this.policyMode}] ${command}`, policy.warnings);
    }

    if (!policy.allowed) {
      const blockedResponse: AgentResponse = {
        requestId: message.id,
        from,
        success: false,
        error: `CACP policy blocked command ${command}: ${policy.warnings.join('; ')}`,
        timestamp: Date.now(),
      };
      this.pushLog({
        timestamp: blockedResponse.timestamp,
        phase: 'error',
        messageId: message.id,
        from,
        to,
        command,
        preview: blockedResponse.error,
        error: blockedResponse.error,
        traceId,
        policyStatus: 'blocked',
        policyWarnings: policy.warnings,
      });
      return blockedResponse;
    }

    try {
      // Add to queue
      this.messageQueue.push(message);

      // Route to handlers
      const handlers = this.handlers.get(command) || [];
      if (handlers.length === 0) {
        console.warn(`[InterAgent] No handlers registered for command: ${command}`);
        if (to === 'broadcast') {
          const queue = this.pendingBroadcasts.get(command) || [];
          queue.push(message);
          const now = Date.now();
          const fresh = queue.filter(m => now - m.timestamp <= BROADCAST_REPLAY_TTL_MS);
          this.pendingBroadcasts.set(command, fresh.slice(-100));
        }
        this.pushLog({
          timestamp: Date.now(),
          phase: 'no-handler',
          messageId: message.id,
          from,
          to,
          command,
          preview: to === 'broadcast' ? 'no handlers registered (queued for replay)' : 'no handlers registered',
          traceId,
          policyStatus: policy.status,
          policyWarnings: policy.warnings.length > 0 ? policy.warnings : undefined,
        });
        return;
      }

      // Execute handlers
      const responses: (AgentResponse | void)[] = [];
      for (const handler of handlers) {
        await this.maybeYieldToEventLoop();
        try {
          this.pushLog({
            timestamp: Date.now(),
            phase: 'handler',
            messageId: message.id,
            from,
            to,
            command,
            preview: `dispatching to handler (${handlers.length} total)`,
            traceId,
            policyStatus: policy.status,
            policyWarnings: policy.warnings.length > 0 ? policy.warnings : undefined,
          });
          const response = await handler(message);
          if (response) {
            responses.push(response);
            const start = this.sendStartTimes.get(message.id);
            this.pushLog({
              timestamp: Date.now(),
              phase: 'response',
              messageId: message.id,
              from: response.from,
              to: from,
              command,
              preview: safeStringify(response.data ?? { success: response.success }),
              data: response.data,
              success: response.success,
              latencyMs: start ? Date.now() - start : undefined,
              traceId,
              policyStatus: policy.status,
              policyWarnings: policy.warnings.length > 0 ? policy.warnings : undefined,
            });
          }
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          const start = this.sendStartTimes.get(message.id);
          this.pushLog({
            timestamp: Date.now(),
            phase: 'error',
            messageId: message.id,
            from,
            to,
            command,
            preview: err.message,
            error: err.message,
            latencyMs: start ? Date.now() - start : undefined,
            traceId,
            policyStatus: policy.status,
            policyWarnings: policy.warnings.length > 0 ? policy.warnings : undefined,
          });
          this.errorHandlers.forEach(h => h(err, message));
        }
      }

      // Return first response if requiresResponse
      this.sendStartTimes.delete(message.id);
      return responses.find(r => r !== undefined);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.pushLog({
        timestamp: Date.now(),
        phase: 'error',
        messageId: message.id,
        from,
        to,
        command,
        preview: err.message,
        error: err.message,
        traceId,
        policyStatus: policy.status,
        policyWarnings: policy.warnings.length > 0 ? policy.warnings : undefined,
      });
      this.errorHandlers.forEach(h => h(err, message));
      throw err;
    }
  }

  /**
   * Send a command expecting a response
   */
  public async request(
    from: AgentType,
    to: AgentType,
    command: string,
    data: Record<string, unknown>,
    timeoutMs: number = 5000,
    metadata?: { context?: string; traceId?: string; parentMessageId?: string }
  ): Promise<AgentResponse> {
    const effectiveTimeoutMs = Math.max(timeoutMs, this.commandTimeoutMs.get(command) ?? 0);
    // sendMessage already returns the first handler's response synchronously;
    // wrap it in a timeout race so callers can't hang on a missing handler.
    const send = this.sendMessage(from, to, command, data, { ...metadata, requiresResponse: true });
    const timeout = new Promise<AgentResponse>((_, reject) =>
      setTimeout(() => reject(new Error(`Request timeout for ${command} after ${effectiveTimeoutMs}ms`)), effectiveTimeoutMs)
    );
    const response = await Promise.race([send, timeout]);
    if (!response) {
      throw new Error(`No handler responded to ${command}`);
    }
    return response as AgentResponse;
  }

  /**
   * Get message history (useful for debugging)
   */
  public getMessageHistory(limit: number = 50): AgentMessage[] {
    return this.messageQueue.slice(-limit);
  }

  // --- Skill result cache ---------------------------------------------------

  /** Build a stable cache key from a skillId + payload (shallow JSON signature). */
  private buildCacheKey(skillId: string, payload: Record<string, unknown>): string {
    try {
      // Sort top-level keys so {a,b} and {b,a} hash to the same signature.
      const keys = Object.keys(payload).sort();
      const sig: Record<string, unknown> = {};
      for (const k of keys) {
        const v = payload[k];
        sig[k] = (v && typeof v === 'object') ? JSON.stringify(v) : v;
      }
      return `${skillId}::${JSON.stringify(sig)}`;
    } catch {
      return `${skillId}::${Date.now()}`;
    }
  }

  /**
   * Cache a peer-skill response so future requests with the same payload can
   * be served instantly. Default TTL is 10 minutes — enough for an agent to
   * reuse a recent zoning lookup mid-conversation without going stale.
   */
  public cacheResult(
    skillId: string,
    payload: Record<string, unknown>,
    data: Record<string, unknown>,
    from: AgentType,
    ttlMs: number = 600_000
  ): void {
    const cacheKey = this.buildCacheKey(skillId, payload);
    const now = Date.now();
    this.resultCache.set(cacheKey, {
      skillId,
      cacheKey,
      payload,
      data,
      from,
      cachedAt: now,
      expiresAt: now + ttlMs,
    });
    this.persistCache();
  }

  /** Return the most recent cached result for a skill (optionally matching payload). Auto-evicts expired entries. */
  public getCachedResult(skillId: string, payload?: Record<string, unknown>): CacpCachedResult | null {
    const now = Date.now();
    let mutated = false;
    // Targeted lookup first
    if (payload) {
      const exact = this.resultCache.get(this.buildCacheKey(skillId, payload));
      if (exact && exact.expiresAt > now) return exact;
    }
    // Fallback: most recent non-expired entry for this skill
    let best: CacpCachedResult | null = null;
    for (const entry of this.resultCache.values()) {
      if (entry.skillId !== skillId) continue;
      if (entry.expiresAt <= now) { this.resultCache.delete(entry.cacheKey); mutated = true; continue; }
      if (!best || entry.cachedAt > best.cachedAt) best = entry;
    }
    if (mutated) this.persistCache();
    return best;
  }

  /** List all currently-valid cached results (for prompt injection / debugging). */
  public listCachedResults(): CacpCachedResult[] {
    const now = Date.now();
    const out: CacpCachedResult[] = [];
    let mutated = false;
    for (const entry of this.resultCache.values()) {
      if (entry.expiresAt <= now) { this.resultCache.delete(entry.cacheKey); mutated = true; continue; }
      out.push(entry);
    }
    if (mutated) this.persistCache();
    return out.sort((a, b) => b.cachedAt - a.cachedAt);
  }

  /** Clear all cached results (or just one skill). */
  public clearCachedResults(skillId?: string): void {
    if (!skillId) {
      this.resultCache.clear();
      this.persistCache();
      return;
    }
    for (const [k, v] of this.resultCache.entries()) {
      if (v.skillId === skillId) this.resultCache.delete(k);
    }
    this.persistCache();
  }

  /**
   * Convenience helper: ask any peer agent for a skill by command name.
   * Looks up the owning agent via the AgentRegistry, returns a cached answer
   * if one exists and `useCache` is true, otherwise dispatches a fresh request.
   *
   * Returns null if no agent owns the skill.
   */
  public async askPeer(
    from: AgentType,
    skillId: string,
    payload: Record<string, unknown> = {},
    options: { timeoutMs?: number; useCache?: boolean; cacheTtlMs?: number; traceId?: string; parentMessageId?: string } = {}
  ): Promise<AgentResponse | null> {
    const {
      timeoutMs = 5000,
      useCache = true,
      cacheTtlMs = 600_000,
      traceId = createTraceId(),
      parentMessageId,
    } = options;
    // Lazy import to avoid circular dep with AgentRegistry.
    const { agentRegistry } = await import('./AgentRegistry.ts');
    const owner = agentRegistry.findOwnerOfSkill(skillId);
    if (!owner) {
      console.warn(`[InterAgent] askPeer: no agent owns skill "${skillId}"`);
      return null;
    }
    // Action skills mutate app/canvas state through their handler's side
    // effects (e.g. cogo_shrinkwrap opens the panel and draws the hull). Serving
    // one from cache would return a stale "success" while the handler never
    // runs — the classic "called it but nothing happened" CACP failure. Force a
    // fresh dispatch for any skill tagged type:'action' and never write its
    // response into the cache, regardless of what the caller requested.
    const skill = owner.skills.find(s => s.id === skillId);
    const isActionSkill = skill?.type === 'action';
    const cacheEnabled = useCache && !isActionSkill;
    if (cacheEnabled) {
      const cached = this.getCachedResult(skillId, payload);
      if (cached) {
        this.recordActivity({
          from,
          to: owner.agent,
          command: skillId,
          data: { cacheHit: true, ageMs: Date.now() - cached.cachedAt },
          phase: 'response',
        });
        return {
          requestId: `cache-${++this.messageIdCounter}-${Date.now()}`,
          from: cached.from,
          success: true,
          data: cached.data,
          timestamp: Date.now(),
        };
      }
    }
    const response = await this.request(from, owner.agent, skillId, payload, timeoutMs, {
      traceId,
      parentMessageId,
    });
    if (cacheEnabled && response?.success && response.data) {
      this.cacheResult(skillId, payload, response.data, response.from, cacheTtlMs);
    }
    return response;
  }


  /**
   * Clear message history
   */
  public clearHistory(): void {
    this.messageQueue = [];
  }

  /**
   * Get statistics
   */
  public getStats() {
    return {
      totalMessages: this.messageQueue.length,
      registeredCommands: Array.from(this.handlers.keys()),
      handlers: Array.from(this.handlers.entries()).map(([cmd, h]) => ({
        command: cmd,
        handlerCount: h.length,
      })),
      policyMode: this.policyMode,
      cooperativeYieldMs: this.cooperativeYieldMs,
      pendingBroadcasts: Array.from(this.pendingBroadcasts.entries()).reduce((acc, [cmd, queue]) => {
        acc[cmd] = queue.length;
        return acc;
      }, {} as Record<string, number>),
      cacheEntries: this.listCachedResults().length,
      commandTimeoutOverrides: Array.from(this.commandTimeoutMs.entries()).reduce((acc, [cmd, ms]) => {
        acc[cmd] = ms;
        return acc;
      }, {} as Record<string, number>),
    };
  }
}

// Export singleton instance
export const interAgentComm = new InterAgentCommunicationService();

// Alias for convenience
export { InterAgentCommunicationService as InterAgentCommunication };

// -- CLI / DevTools console hook ---------------------------------------------
// Surface a stable global so engineers can introspect CACP traffic live from
// the browser DevTools console (or via a headless Playwright/CDP attach).
//
// Usage:
//   __cacp.log()                       // dump entire ring buffer
//   __cacp.log({ command: 'request_next_point_number' })  // filter
//   __cacp.log({ agent: 'POINT_EDITOR' })
//   __cacp.tail(20)                    // last N entries (default 20)
//   __cacp.stats()                     // counts by command + agent pair
//   __cacp.clear()                     // wipe log
//   __cacp.download()                  // save log as JSON file
//   __cacp.watch()                     // live-stream new entries to console
//
if (typeof window !== 'undefined') {
  const filterEntries = (entries: CacpLogEntry[], filter?: { command?: string; agent?: string; phase?: CacpLogPhase }) => {
    if (!filter) return entries;
    return entries.filter(e => {
      if (filter.command && !e.command.toLowerCase().includes(filter.command.toLowerCase())) return false;
      if (filter.phase && e.phase !== filter.phase) return false;
      if (filter.agent) {
        const a = filter.agent.toUpperCase();
        if (String(e.from).toUpperCase() !== a && String(e.to).toUpperCase() !== a) return false;
      }
      return true;
    });
  };

  let liveUnsub: (() => void) | null = null;

  (window as any).__cacp = {
    /** Dump the full or filtered activity log. */
    log: (filter?: { command?: string; agent?: string; phase?: CacpLogPhase }) => {
      const entries = filterEntries(interAgentComm.getLog(), filter);
      // eslint-disable-next-line no-console
      console.table(entries.map(e => ({
        seq: e.seq,
        time: new Date(e.timestamp).toISOString().slice(11, 23),
        phase: e.phase,
        policy: e.policyStatus ?? 'pass',
        from: e.from,
        to: e.to,
        command: e.command,
        traceId: e.traceId ?? '',
        preview: e.preview,
        latencyMs: e.latencyMs ?? '',
      })));
      return entries;
    },
    /** Last N entries (default 20). */
    tail: (n = 20) => {
      const entries = interAgentComm.getLog().slice(-n);
      // eslint-disable-next-line no-console
      console.table(entries);
      return entries;
    },
    /** Counts by command + agent pair. */
    stats: () => {
      const entries = interAgentComm.getLog();
      const byCommand: Record<string, number> = {};
      const byPair: Record<string, number> = {};
      const byPhase: Record<string, number> = {};
      for (const e of entries) {
        byCommand[e.command] = (byCommand[e.command] ?? 0) + 1;
        byPair[`${e.from} → ${e.to}`] = (byPair[`${e.from} → ${e.to}`] ?? 0) + 1;
        byPhase[e.phase] = (byPhase[e.phase] ?? 0) + 1;
      }
      const out = { total: entries.length, byPhase, byCommand, byPair, service: interAgentComm.getStats() };
      // eslint-disable-next-line no-console
      console.log(out);
      return out;
    },
    /** Read or set policy mode: __cacp.policy() / __cacp.policy('hard'). */
    policy: (mode?: CacpPolicyMode) => {
      if (mode) interAgentComm.setPolicyMode(mode);
      return interAgentComm.getPolicyMode();
    },
    /** Read or set cooperative scheduling yield in ms between handler dispatches. */
    yieldMs: (ms?: number) => {
      if (typeof ms === 'number') interAgentComm.setCooperativeYieldMs(ms);
      return interAgentComm.getCooperativeYieldMs();
    },
    /** Read or set command timeout override in ms. */
    timeout: (command: string, ms?: number) => {
      if (typeof ms === 'number') interAgentComm.setCommandTimeout(command, ms);
      return interAgentComm.getCommandTimeout(command) ?? null;
    },
    /** Snapshot resilience configuration and queue/cache health. */
    config: () => interAgentComm.getStats(),
    /** Wipe the log (also removes localStorage copy). */
    clear: () => { interAgentComm.clearLog(); return 'CACP log cleared'; },
    /** Download the log as a JSON file. */
    download: () => {
      try {
        const blob = new Blob([interAgentComm.exportLogJson()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cacp-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return 'download started';
      } catch (e) {
        return `download failed: ${(e as Error).message}`;
      }
    },
    /** Live-stream new entries to the console. Call again to stop. */
    watch: () => {
      if (liveUnsub) { liveUnsub(); liveUnsub = null; return 'stopped'; }
      let lastSeq = interAgentComm.getLog().reduce((m, e) => Math.max(m, e.seq), 0);
      liveUnsub = interAgentComm.onLog(entries => {
        const fresh = entries.filter(e => e.seq > lastSeq);
        if (fresh.length === 0) return;
        lastSeq = entries[entries.length - 1].seq;
        // eslint-disable-next-line no-console
        for (const e of fresh) console.log(`[CACP ${e.phase}] ${e.from} → ${e.to}: ${e.command}`, e.data ?? e.preview);
      });
      return 'watching — call __cacp.watch() again to stop';
    },
    /** Raw access to the service instance (advanced). */
    service: interAgentComm,
  };
}

/**
 * Example usage:
 * 
 * // In Boundary Agent:
 * interAgentComm.onCommand('deed_loaded', async (message) => {
 *   if (message.data.linesCount > 0) {
 *     // Notify other agents that deed is ready
 *     await interAgentComm.sendMessage(
 *       AgentType.DEED_READER,
 *       'broadcast',
 *       'deed_ready',
 *       { vertices: message.data.vertices, parcelName: message.data.parcelName }
 *     );
 *   }
 * });
 * 
 * // In Civil 3D Agent:
 * interAgentComm.onCommand('deed_ready', async (message) => {
 *   console.log('Received deed data from Boundary Agent');
 *   // Push to Civil 3D automatically
 *   const result = await this.sendToC3D('import_deed_polyline', {
 *     vertices: message.data.vertices,
 *     layer: 'L-DEED-BOUNDARY',
 *     closed: true,
 *     parcelName: message.data.parcelName
 *   });
 *   return { success: result.success, data: result };
 * });
 */
