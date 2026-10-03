/**
 * Claude 4.7 via Vertex AI — API service (v26.05.19.3)
 *
 * Routes requests through the LandSurv backend proxy at /api/claude
 * (Cloud Run service) which holds the GCP service-account credentials.
 * The frontend never holds raw GCP tokens.
 *
 * Backend endpoint spec:
 *   POST /api/claude
 *   Body: { model, region, gcpProject?, systemPrompt, messages, temperature, maxTokens }
 *   Response (streaming): Server-Sent Events in Anthropic delta format
 *   Response (non-streaming): { content: string }
 */

import { type ClaudeConfig, getClaudeConfig } from './claudeConfig.ts';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeCallOptions {
  /** Override config for a single call. */
  configOverride?: Partial<ClaudeConfig>;
}

/**
 * Call Claude 4.7 via the backend proxy.
 * Returns the full assistant response text.
 */
export async function callClaude(
  systemPrompt: string,
  messages: ClaudeMessage[],
  options: ClaudeCallOptions = {}
): Promise<string> {
  const cfg = { ...getClaudeConfig(), ...options.configOverride };

  const response = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.model,
      region: cfg.region,
      gcpProject: cfg.gcpProject || undefined,
      systemPrompt: cfg.systemPromptAddendum
        ? `${systemPrompt}\n\n${cfg.systemPromptAddendum}`
        : systemPrompt,
      messages,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`Claude API error ${response.status}: ${errText}`);
  }

  const data = await response.json() as { content?: string; error?: string };
  if (data.error) throw new Error(data.error);
  return data.content ?? '';
}

/**
 * Stream Claude 4.7 via the backend proxy.
 * Calls `onToken` for each text delta, returns full text when done.
 */
export async function streamClaude(
  systemPrompt: string,
  messages: ClaudeMessage[],
  onToken: (delta: string) => void,
  options: ClaudeCallOptions = {}
): Promise<string> {
  const cfg = { ...getClaudeConfig(), ...options.configOverride };

  const response = await fetch('/api/claude/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.model,
      region: cfg.region,
      gcpProject: cfg.gcpProject || undefined,
      systemPrompt: cfg.systemPromptAddendum
        ? `${systemPrompt}\n\n${cfg.systemPromptAddendum}`
        : systemPrompt,
      messages,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`Claude stream error ${response.status}: ${errText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body for Claude stream');

  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

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
          const event = JSON.parse(payload) as { delta?: { text?: string }; type?: string };
          const delta = event.delta?.text ?? '';
          if (delta) {
            onToken(delta);
            fullText += delta;
          }
        } catch {
          // skip malformed SSE line
        }
      }
    }
  }

  return fullText;
}
