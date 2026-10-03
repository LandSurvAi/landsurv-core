/**
 * ProxyGoogleGenAI — drop-in replacement for `@google/genai`'s `GoogleGenAI`
 * client that forwards all calls through the LandSurv.ai backend proxy
 * (`/api/demo/gemini/*`) using the buyer's demo API key for authentication.
 *
 * Surface mimicked:
 *   - .models.generateContent({ model, contents, config? }) -> { text }
 *   - .chats.create({ model, config? }) -> ProxyChat
 *
 * ProxyChat surface (matches `Chat` from @google/genai for our usage):
 *   - .sendMessageStream({ message }) -> AsyncIterable<{ text }>
 *   - .sendMessage({ message }) -> { text }
 *
 * Only the methods actually used by the app are implemented. Anything else
 * throws a clear "not supported in demo mode" error so we fail loud, not silent.
 */

import type { Part } from '../types.ts';

type HistoryEntry = { role: 'user' | 'model'; parts: Array<Part | { text: string }> };
type MessageInput = string | Array<Part | { text: string }>;

export interface StreamChunk { text: string }

interface ChatConfig {
  systemInstruction?: string;
  tools?: any[];
  [key: string]: any;
}

const GEN_ENDPOINT = '/api/demo/gemini/generateContent';
const STREAM_ENDPOINT = '/api/demo/gemini/stream';

function normalizeMessage(message: MessageInput): Array<Part | { text: string }> {
  if (typeof message === 'string') return [{ text: message }];
  return Array.isArray(message) ? message : [message];
}

export class ProxyChat {
  private readonly model: string;
  private readonly config: ChatConfig;
  private readonly apiKey: string;
  private readonly history: HistoryEntry[] = [];

  constructor(apiKey: string, init: { model: string; config?: ChatConfig }) {
    this.apiKey = apiKey;
    this.model = init.model;
    this.config = init.config || {};
  }

  async sendMessageStream(args: { message: MessageInput }): Promise<AsyncIterable<StreamChunk>> {
    const messageParts = normalizeMessage(args.message);
    const historySnapshot = this.history.map(h => ({ ...h, parts: [...h.parts] }));

    const resp = await fetch(STREAM_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        systemInstruction: this.config.systemInstruction,
        generationConfig: this.config,
        history: historySnapshot,
        message: messageParts,
      }),
    });

    if (!resp.ok || !resp.body) {
      const errText = await resp.text().catch(() => `${resp.status} ${resp.statusText}`);
      throw new Error(`Demo Gemini proxy error (${resp.status}): ${errText}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let aggregated = '';
    const userTurn: HistoryEntry = { role: 'user', parts: messageParts };
    const history = this.history;

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
            let evt: { text?: string; done?: boolean; error?: string };
            try { evt = JSON.parse(line); } catch { continue; }
            if (evt.error) throw new Error(evt.error);
            if (evt.done) break;
            if (typeof evt.text === 'string' && evt.text.length > 0) {
              aggregated += evt.text;
              yield { text: evt.text };
            }
          }
        }
      } finally {
        history.push(userTurn);
        history.push({ role: 'model', parts: [{ text: aggregated }] });
      }
    }

    return iterate();
  }

  async sendMessage(args: { message: MessageInput }): Promise<{ text: string }> {
    const stream = await this.sendMessageStream(args);
    let out = '';
    for await (const chunk of stream) out += chunk.text;
    return { text: out };
  }
}

class ProxyModels {
  constructor(private readonly apiKey: string) {}

  async generateContent(args: {
    model: string;
    contents: any;
    config?: any;
  }): Promise<{ text: string }> {
    const resp = await fetch(GEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(args),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => `${resp.status} ${resp.statusText}`);
      throw new Error(`Demo Gemini proxy error (${resp.status}): ${errText}`);
    }
    const data = await resp.json();
    return { text: typeof data?.text === 'string' ? data.text : '' };
  }

  async generateContentStream(_args: any): Promise<any> {
    throw new Error('generateContentStream not supported in demo mode — use chats.create().sendMessageStream() instead');
  }
}

class ProxyChats {
  constructor(private readonly apiKey: string) {}

  create(init: { model: string; config?: ChatConfig }): ProxyChat {
    return new ProxyChat(this.apiKey, init);
  }
}

/**
 * Drop-in `GoogleGenAI` replacement for demo-key users. Shape:
 *   const ai = new ProxyGoogleGenAI(demoKey);
 *   ai.models.generateContent({...})
 *   ai.chats.create({...}).sendMessageStream({...})
 */
export class ProxyGoogleGenAI {
  public readonly models: ProxyModels;
  public readonly chats: ProxyChats;

  constructor(apiKey: string) {
    this.models = new ProxyModels(apiKey);
    this.chats = new ProxyChats(apiKey);
  }
}

export function isDemoApiKey(key: string | undefined | null): boolean {
  return typeof key === 'string' && key.startsWith('lsa_');
}
