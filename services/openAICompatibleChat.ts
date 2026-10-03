/**
 * OpenAICompatibleChat — minimal client-side shim that mimics enough of the
 * `@google/genai` `Chat` interface for our app's chat loop while calling an
 * OpenAI-compatible Chat Completions API directly from the browser.
 *
 * One implementation covers two providers:
 *  - OpenAI  → https://api.openai.com/v1/chat/completions
 *  - xAI     → https://api.x.ai/v1/chat/completions  (Grok models)
 *
 * The user's API key stays in this browser (localStorage) and is sent only to
 * the owning provider — never to the LandSurv backend. Both providers allow
 * browser CORS requests.
 *
 * Only `sendMessageStream({ message })` is implemented because that is the
 * single surface used by App.tsx (`chat.sendMessageStream({...})`).
 */

import type { Part } from '../types.ts';
import type { StreamChunk } from './claudeChat.ts';

export type OpenAICompatibleProvider = 'openai' | 'xai';

interface OpenAICompatibleChatInit {
  provider: OpenAICompatibleProvider;
  /** Model identifier, e.g. 'gpt-5.6-terra' or 'grok-4.3'. */
  model: string;
  /** The user's own API key for the provider. */
  apiKey: string;
  systemInstruction?: string;
}

const PROVIDER_CONFIG: Record<OpenAICompatibleProvider, { baseUrl: string; label: string }> = {
  openai: { baseUrl: 'https://api.openai.com/v1', label: 'OpenAI' },
  xai: { baseUrl: 'https://api.x.ai/v1', label: 'Grok (xAI)' },
};

type TextContent = { type: 'text'; text: string };
type ImageContent = { type: 'image_url'; image_url: { url: string } };
type MessageContent = string | Array<TextContent | ImageContent>;
type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: MessageContent };

type OpenAIStreamEvent = {
  choices?: Array<{
    delta?: { content?: string };
    message?: { content?: string };
  }>;
};

export class OpenAICompatibleChat {
  private readonly provider: OpenAICompatibleProvider;
  private readonly model: string;
  private readonly apiKey: string;
  private readonly systemInstruction?: string;
  private readonly history: Array<{ role: 'user' | 'assistant'; content: MessageContent }> = [];

  constructor(init: OpenAICompatibleChatInit) {
    this.provider = init.provider;
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
    const { label, baseUrl } = PROVIDER_CONFIG[this.provider];

    if (!this.apiKey.trim()) {
      throw new Error(`A ${label} API key is required to use ${this.model}. Add it in Settings → AI Provider Keys.`);
    }

    const toContent = (message: string | Part[]): MessageContent => {
      if (typeof message === 'string') {
        return message;
      }

      const parts: Array<TextContent | ImageContent> = [];
      for (const part of message) {
        if ('text' in part && typeof part.text === 'string' && part.text.length > 0) {
          parts.push({ type: 'text', text: part.text });
          continue;
        }
        if ('inlineData' in part && part.inlineData?.data && part.inlineData.mimeType?.startsWith('image/')) {
          parts.push({
            type: 'image_url',
            image_url: { url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` },
          });
        }
      }

      return parts.length > 0 ? parts : '';
    };

    const userContent = toContent(args.message);

    const messages: ChatMessage[] = [
      ...(this.systemInstruction ? [{ role: 'system' as const, content: this.systemInstruction }] : []),
      ...this.history,
      { role: 'user', content: userContent },
    ];

    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: true,
      }),
    });

    if (!resp.ok || !resp.body) {
      const errText = await resp.text().catch(() => `${resp.status} ${resp.statusText}`);
      throw new Error(`${label} API error (${resp.status}): ${errText}`);
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
              if (payload === '[DONE]') continue;
              try {
                const event = JSON.parse(payload) as OpenAIStreamEvent;
                const delta = event.choices?.[0]?.delta?.content
                  ?? event.choices?.[0]?.message?.content
                  ?? '';
                if (delta) {
                  fullText += delta;
                  yield { text: delta };
                }
              } catch {
                // ignore malformed SSE lines
              }
            }
          }
        }

        if (!fullText.trim()) {
          throw new Error(`${label} returned no visible text. Check that ${model} is available on your account and retry.`);
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
