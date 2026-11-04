// Models sometimes emit their clarifying question inside the thought trace
// (the text before the `---` delimiter) instead of the answer body. The chat
// then renders raw JSON inside "AI's Thought Process" with no way to reply.
//
// This helper finds a `{ question, options }` object anywhere in a text blob,
// validates it, and returns the question, option labels, and the text with the
// JSON removed so the caller can render clickable reply pills instead.

export interface ExtractedClarifyingQuestion {
  question: string;
  options: string[];
  /** Source text with the question JSON (and any empty ```json fence) removed. */
  text: string;
}

const OPTION_KEYS = ['options', 'suggestedQuestions', 'clarifyingQuestions', 'questionOptions'] as const;

function findMatchingBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function stripQuestionBlock(raw: string, block: string): string {
  return raw
    .replace(block, '')
    .replace(/```(?:json)?\s*```/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Scans `raw` for the first JSON object that looks like a clarifying question
 * (a `question` string and/or an options array). Returns null when there is
 * nothing to lift, so callers can leave ordinary thoughts untouched.
 */
export function extractClarifyingQuestion(raw: string | null | undefined): ExtractedClarifyingQuestion | null {
  if (!raw) return null;

  for (let start = raw.indexOf('{'); start !== -1; start = raw.indexOf('{', start + 1)) {
    const end = findMatchingBrace(raw, start);
    if (end === -1) continue;

    const candidate = raw.slice(start, end + 1);
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;

    const record = parsed as Record<string, unknown>;
    const question = typeof record.question === 'string' ? record.question.trim() : '';
    const options: string[] = [];
    for (const key of OPTION_KEYS) {
      const value = record[key];
      if (!Array.isArray(value)) continue;
      for (const item of value) {
        if (typeof item === 'string' && item.trim()) options.push(item.trim());
      }
      if (options.length > 0) break;
    }

    if (!question && options.length === 0) continue;

    return { question, options, text: stripQuestionBlock(raw, candidate) };
  }

  return null;
}
