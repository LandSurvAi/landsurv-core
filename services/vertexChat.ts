/**
 * VertexChat — minimal client-side shim that mimics enough of the
 * `@google/genai` `Chat` interface for our app's chat loop while routing
 * requests through the backend `/api/vertex/stream` proxy.
 *
 * The proxy authenticates with Vertex AI via the Cloud Run service account
 * (Application Default Credentials), so this works for Vertex-only models
 * such as `gemini-3.7-flash` without exposing a server credential to
 * the browser.
 *
 * Only `sendMessageStream({ message })` is implemented because that is the
 * single surface used by App.tsx (`chat.sendMessageStream({...})`).
 */

import type { Part } from '../types.ts';

type HistoryEntry = { role: 'user' | 'model'; parts: Array<Part | { text: string }> };

interface VertexChatInit {
  model: string;
  systemInstruction?: string;
  generationConfig?: Record<string, unknown>;
  /** Override default `/api/vertex/stream` endpoint (e.g. for local dev). */
  endpoint?: string;
}

export interface StreamChunk { text: string }

function buildVertexProxyError(status: number, statusText: string, rawBody: string, degradedHeader: string | null): Error {
  let parsed: { error?: unknown; degraded?: unknown } | null = null;
  try {
    parsed = rawBody ? JSON.parse(rawBody) as { error?: unknown; degraded?: unknown } : null;
  } catch {
    parsed = null;
  }

  const bodyError = typeof parsed?.error === 'string' ? parsed.error : '';
  const isDegraded = parsed?.degraded === true || degradedHeader === '1';
  const isBackendOffline = isDegraded && /backend\s*offline/i.test(bodyError || rawBody);

  if (status === 503 && isBackendOffline) {
    return new Error(
      'Local Vertex backend is offline. Start the backend API service (expected at http://127.0.0.1:3001) or switch to a non-Vertex model (for example gemini-3.7-flash) while developing locally.'
    );
  }

  const safeBody = bodyError || rawBody || `${status} ${statusText}`;
  return new Error(`Vertex proxy error (${status}): ${safeBody}`);
}

export class VertexChat {
  private readonly model: string;
  private readonly systemInstruction?: string;
  private readonly generationConfig?: Record<string, unknown>;
  private readonly endpoint: string;
  private readonly history: HistoryEntry[] = [];

  constructor(init: VertexChatInit) {
    this.model = init.model;
    this.systemInstruction = init.systemInstruction;
    this.generationConfig = init.generationConfig;
    this.endpoint = init.endpoint || '/api/vertex/stream';
  }

  /**
   * Send a single user turn and stream the model's reply.
   * Returns an async iterable of `{ text }` chunks compatible with the
   * existing consumer in App.tsx (`for await (const chunk of stream) { chunk.text }`).
   */
  async sendMessageStream(args: { message: string | Array<Part | { text: string }> }): Promise<AsyncIterable<StreamChunk>> {
    const messageParts = typeof args.message === 'string'
      ? [{ text: args.message }]
      : args.message;

    const historySnapshot = this.history.map(h => ({ ...h, parts: [...h.parts] }));

    const resp = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        systemInstruction: this.systemInstruction,
        generationConfig: this.generationConfig,
        history: historySnapshot,
        message: messageParts,
      }),
    });

    if (!resp.ok || !resp.body) {
      const errText = await resp.text().catch(() => `${resp.status} ${resp.statusText}`);
      throw buildVertexProxyError(resp.status, resp.statusText, errText, resp.headers.get('X-Dev-Proxy-Degraded'));
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let aggregated = '';
    let finishReason: string | null = null;
    let modelPartsFromServer: Array<Part | { text: string }> | null = null;
    const userTurn: HistoryEntry = { role: 'user', parts: messageParts };
    const history = this.history;
    const self = this;

    async function* iterate(): AsyncIterable<StreamChunk> {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl = buffer.indexOf('\n');
          while (nl !== -1) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            nl = buffer.indexOf('\n');
            if (!line) continue;
            let evt: { text?: string; done?: boolean; error?: string; modelParts?: Array<Part | { text: string }>; finishReason?: string };
            try {
              evt = JSON.parse(line);
            } catch {
              continue;
            }
            if (evt.error) {
              const errMsg = /invalid_grant/i.test(evt.error)
                ? "Vertex AI authentication failed: Google Cloud Application Default Credentials (ADC) expired or invalid ('invalid_grant'). Run `gcloud auth application-default login` in your terminal or add a Gemini API key in Settings."
                : evt.error;
              throw new Error(errMsg);
            }
            if (typeof evt.finishReason === 'string') {
              finishReason = evt.finishReason;
              continue;
            }
            if (evt.modelParts && Array.isArray(evt.modelParts)) {
              modelPartsFromServer = evt.modelParts;
              continue;
            }
            if (evt.done) break;
            if (typeof evt.text === 'string' && evt.text.length > 0) {
              aggregated += evt.text;
              yield { text: evt.text };
            }
          }
        }
        // Truncation / abnormal-stop warning — without this the chat silently
        // "stops mid-thought" when Gemini 3 exhausts its output budget on
        // thinking tokens and never reaches the drawable JSON.
        if (finishReason && finishReason !== 'STOP') {
          console.warn('[VertexChat] abnormal finishReason=%s (aggregated=%d chars)', finishReason, aggregated.length);
          const warn = finishReason === 'MAX_TOKENS'
            ? '\n\n⚠️ **Response truncated — the model hit its Max Output Tokens limit before it could finish.** Gemini 3 thinking tokens count against this budget, so long reasoning can consume it all before any linework JSON is produced. Raise “Max Output Tokens” to the 64k max (or lower the Thinking Level) in the Gemini 3 controls panel, then ask again.'
            : `\n\n⚠️ **Response ended early (${finishReason}).** The model did not complete its answer — try again or rephrase the request.`;
          yield { text: warn };
        }
      } finally {
        // Persist this turn into history so the next call has full context.
        // Prefer the server-provided full parts (they include `thoughtSignature`
        // values which Gemini 3 requires us to round-trip for reasoning continuity).
        history.push(userTurn);
        const modelTurnParts = modelPartsFromServer ?? [{ text: aggregated }];
        history.push({ role: 'model', parts: modelTurnParts });
        // Diagnostic: surface what Vertex actually returned so JSON-handoff bugs are visible.
        try {
          const sigCount = modelPartsFromServer
            ? modelPartsFromServer.filter((p: any) => p && p.thoughtSignature).length
            : 0;
          console.log('[VertexChat] stream complete. length=%d parts=%d signatures=%d finishReason=%s head=%s',
            aggregated.length,
            modelPartsFromServer ? modelPartsFromServer.length : 1,
            sigCount,
            finishReason ?? '-',
            aggregated.slice(0, 300));
          const hasFence = /```json/i.test(aggregated);
          const hasBrace = aggregated.indexOf('{') !== -1 || aggregated.indexOf('[') !== -1;
          console.log('[VertexChat] hasJsonFence=%s hasBracket=%s', hasFence, hasBrace);
        } catch { /* ignore logging errors */ }
        // touch self to satisfy lint about unused capture
        void self;
      }
    }

    return iterate();
  }

  /** Convenience: collect a streamed reply into a single text response. */
  async sendMessage(args: { message: string | Array<Part | { text: string }> }): Promise<{ text: string }> {
    const stream = await this.sendMessageStream(args);
    let out = '';
    for await (const chunk of stream) out += chunk.text;
    return { text: out };
  }
}
