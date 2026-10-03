/**
 * AnthropicDirectChat — minimal client-side shim that mimics enough of the
 * `@google/genai` `Chat` interface for our app's chat loop while calling the
 * first-party Anthropic Messages API directly from the browser.
 *
 * Used when the user supplies their own Anthropic key (`sk-ant-…`). The key
 * stays in this browser (localStorage) and is sent only to api.anthropic.com —
 * never to the LandSurv backend. Anthropic allows browser CORS requests when
 * the `anthropic-dangerous-direct-browser-access` header is present.
 *
 * Because the user pays Anthropic directly under their own account terms, the
 * LandSurv-side AUP acknowledgment (required for the Vertex-proxied path in
 * claudeChat.ts) is not enforced here.
 *
 * Only `sendMessageStream({ message })` is implemented because that is the
 * single surface used by App.tsx (`chat.sendMessageStream({...})`).
 */

import type { Part } from '../types.ts';
import type { StreamChunk } from './claudeChat.ts';

interface AnthropicDirectChatInit {
  /** Claude model identifier, e.g. 'claude-sonnet-5'. */
  model: string;
  /** The user's own Anthropic API key (sk-ant-…). */
  apiKey: string;
  systemInstruction?: string;
}

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 8192;

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };
type OutgoingMessage = { role: 'user' | 'assistant'; content: string | AnthropicContentBlock[] };

type AnthropicStreamEvent = {
  type?: string;
  delta?: {
    type?: string;
    text?: string;
  };
};

export class AnthropicDirectChat {
  private readonly model: string;
  private readonly apiKey: string;
  private readonly systemInstruction?: string;
  private readonly history: OutgoingMessage[] = [];

  constructor(init: AnthropicDirectChatInit) {
    this.model = init.model;
    this.apiKey = init.apiKey;
    this.systemInstruction = init.systemInstruction;
  }

  /**
   * Send a single user turn and stream the model's reply.
   * Returns an async iterable of `{ text }` chunks compatible with the
   * existing consumer in App.tsx.
   */
  async sendMessageStream(args: { message: string | Part[] }): Promise<AsyncIterable<StreamChunk>> {
    if (!this.apiKey.trim()) {
      throw new Error(`An Anthropic API key is required to use ${this.model}. Add it in Settings → AI Provider Keys.`);
    }

    const toAnthropicContent = (message: string | Part[]): string | AnthropicContentBlock[] => {
      if (typeof message === 'string') {
        return message;
      }

      const blocks: AnthropicContentBlock[] = [];
      for (const part of message) {
        if ('text' in part && typeof part.text === 'string' && part.text.length > 0) {
          blocks.push({ type: 'text', text: part.text });
          continue;
        }

        if ('inlineData' in part && part.inlineData?.data && part.inlineData.mimeType?.startsWith('image/')) {
          blocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: part.inlineData.mimeType,
              data: part.inlineData.data,
            },
          });
        }
      }

      return blocks.length > 0 ? blocks : '';
    };

    const userContent = toAnthropicContent(args.message);
    const messages: OutgoingMessage[] = [
      ...this.history,
      { role: 'user', content: userContent },
    ];

    const resp = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey.trim(),
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: DEFAULT_MAX_TOKENS,
        stream: true,
        ...(this.systemInstruction ? { system: this.systemInstruction } : {}),
        messages,
      }),
    });

    if (!resp.ok || !resp.body) {
      const errText = await resp.text().catch(() => `${resp.status} ${resp.statusText}`);
      throw new Error(`Anthropic API error (${resp.status}): ${errText}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    const history = this.history;
    const model = this.model;

    async function* iterate(): AsyncIterable<StreamChunk> {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const payload = line.slice(6).trim();
              try {
                const event = JSON.parse(payload) as AnthropicStreamEvent;
                if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
                  fullText += event.delta.text;
                  yield { text: event.delta.text };
                }
              } catch {
                // ignore malformed SSE lines
              }
            }
          }
        }

        if (!fullText.trim()) {
          throw new Error(`Anthropic returned no visible text. Check that ${model} is available on your account and retry.`);
        }
      } finally {
        // Persist the exchange so follow-up turns have full context.
        history.push({ role: 'user', content: userContent });
        if (fullText) {
          history.push({ role: 'assistant', content: fullText });
        }
      }
    }

    return iterate();
  }
}
