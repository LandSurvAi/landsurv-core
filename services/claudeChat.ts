/**
 * ClaudeChat — minimal client-side shim that mimics enough of the
 * `@google/genai` `Chat` interface for our app's chat loop while routing
 * requests through the backend `/api/claude/stream` proxy.
 *
 * The proxy authenticates with Vertex AI via the Cloud Run service account
 * (Application Default Credentials), so this works without exposing any
 * GCP credentials to the browser.
 *
 * Only `sendMessageStream({ message })` is implemented because that is the
 * single surface used by App.tsx (`chat.sendMessageStream({...})`).
 */

import type { Part } from '../types.ts';
import { ANTHROPIC_AUP_VERSION, type ClaudeConfig, FABLE5_ADDENDUM_VERSION, getClaudeConfig } from './claudeConfig.ts';
import { withOptionalUserApiKeyHeaders } from './apiAuth.ts';

interface ClaudeChatInit {
  /** Claude model identifier, e.g. 'claude-sonnet-5' or 'claude-fable-5'. */
  model: string;
  systemInstruction?: string;
}

export interface StreamChunk { text: string }

type HistoryEntry = { role: 'user' | 'assistant'; content: string };
type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };
type OutgoingMessage = { role: 'user' | 'assistant'; content: string | AnthropicContentBlock[] };

type ClaudeStreamEvent = {
  type?: string;
  delta?: {
    type?: string;
    text?: string;
  };
  content_block?: {
    type?: string;
    text?: string;
  };
  message?: {
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  };
};

export class ClaudeChat {
  private readonly model: string;
  private readonly systemInstruction?: string;
  private readonly history: HistoryEntry[] = [];

  constructor(init: ClaudeChatInit) {
    this.model = init.model;
    this.systemInstruction = init.systemInstruction;
  }

  /**
   * Send a single user turn and stream the model's reply.
   * Returns an async iterable of `{ text }` chunks compatible with the
   * existing consumer in App.tsx.
   */
  async sendMessageStream(args: { message: string | Part[] }): Promise<AsyncIterable<StreamChunk>> {
    const userText = typeof args.message === 'string'
      ? args.message
      : args.message
        .filter((p): p is Extract<Part, { text: string }> => 'text' in p && typeof p.text === 'string')
        .map(p => p.text)
        .join('');

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

      return blocks.length > 0 ? blocks : userText;
    };

    const cfg: ClaudeConfig = getClaudeConfig();

    if (!cfg.anthropicAupAccepted || cfg.anthropicAupVersion !== ANTHROPIC_AUP_VERSION) {
      throw new Error(
        'Claude usage requires Anthropic Usage Policy acknowledgment. Open Claude Settings, review the AUP notice, and check the acceptance box before continuing.'
      );
    }

    if (
      this.model === 'claude-fable-5' &&
      (!cfg.fable5AddendumAccepted || cfg.fable5AddendumVersion !== FABLE5_ADDENDUM_VERSION)
    ) {
      throw new Error(
        'Claude Fable 5 requires Advanced AI Safety Addendum consent. Open Claude Settings, review the addendum notice, and check the acceptance box before continuing.'
      );
    }

    const messages: OutgoingMessage[] = [
      ...this.history,
      { role: 'user', content: toAnthropicContent(args.message) },
    ];

    const systemPrompt = cfg.systemPromptAddendum && cfg.systemPromptAddendum.trim()
      ? `${this.systemInstruction ?? ''}\n\n${cfg.systemPromptAddendum.trim()}`
      : (this.systemInstruction ?? '');

    const resp = await fetch('/api/claude/stream', {
      method: 'POST',
      headers: withOptionalUserApiKeyHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        model: this.model,
        region: cfg.region,
        gcpProject: cfg.gcpProject || undefined,
        anthropicAupAccepted: cfg.anthropicAupAccepted,
        anthropicAupAcceptedAt: cfg.anthropicAupAcceptedAt,
        anthropicAupVersion: cfg.anthropicAupVersion,
        fable5AddendumAccepted: this.model === 'claude-fable-5' ? cfg.fable5AddendumAccepted : undefined,
        fable5AddendumAcceptedAt: this.model === 'claude-fable-5' ? cfg.fable5AddendumAcceptedAt : undefined,
        fable5AddendumVersion: this.model === 'claude-fable-5' ? cfg.fable5AddendumVersion : undefined,
        systemPrompt,
        messages,
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens,
      }),
    });

    if (!resp.ok || !resp.body) {
      const errText = await resp.text().catch(() => `${resp.status} ${resp.statusText}`);
      throw new Error(`Claude proxy error (${resp.status}): ${errText}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    const history = this.history;

    const extractVisibleText = (event: ClaudeStreamEvent): string => {
      if (event.delta?.type === 'text_delta' && event.delta.text) {
        return event.delta.text;
      }
      if (event.delta?.text) {
        return event.delta.text;
      }
      if (event.content_block?.type === 'text' && event.content_block.text) {
        return event.content_block.text;
      }
      const messageText = event.message?.content
        ?.filter(block => block.type === 'text' && typeof block.text === 'string')
        .map(block => block.text as string)
        .join('') ?? '';
      return messageText;
    };

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
                const event = JSON.parse(payload) as ClaudeStreamEvent;
                const delta = extractVisibleText(event);
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
          throw new Error(
            'Claude returned no visible text. If this is Claude Fable 5, increase Max Output Tokens in Claude Settings and retry.'
          );
        }
      } finally {
        // Persist the exchange so follow-up turns have full context.
        history.push({ role: 'user', content: userText });
        if (fullText) {
          history.push({ role: 'assistant', content: fullText });
        }
      }
    }

    return iterate();
  }
}
