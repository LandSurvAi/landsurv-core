/**
 * Per-session AI output language.
 *
 * The product UI stays English in this phase. Only the model's prose follows
 * this setting; identifiers and machine-readable payloads must remain stable
 * so downstream parsing and CAD output keep working.
 */

export type AiOutputLanguage = 'en' | 'ar' | 'auto';

export function normalizeAiOutputLanguage(value: unknown): AiOutputLanguage {
  if (value === 'ar') return 'ar';
  if (value === 'auto') return 'auto';
  return 'en';
}

const IDENTIFIER_RULES = `
- Keep coordinates, numbers, point IDs, bearings, distances, layer names, EPSG codes, file names, commands, JSON keys, and tool/function names exactly as they are, in Latin characters and digits.
- Never translate or transliterate JSON keys, schema fields, tool names, code identifiers, or CAD layer names; the application parses them.
- Do not add right-to-left control characters inside JSON or code blocks.`;

export function buildAiOutputLanguageInstruction(value: unknown): string {
  const language = normalizeAiOutputLanguage(value);
  if (language === 'en') return '';

  if (language === 'auto') {
    return `## OUTPUT LANGUAGE — Match the user's input

- Reply in the language of the user's most recent message: English or Arabic.
- If that message mixes languages, use the dominant language of the prose while keeping technical identifiers intact.
- If the language is ambiguous, continue in the language of the previous turn; never switch without a reason.
- Arabic replies use Modern Standard Arabic.${IDENTIFIER_RULES}`;
  }

  return `## OUTPUT LANGUAGE — Modern Standard Arabic

- Write every user-facing explanation, question, summary, warning, and table heading in Modern Standard Arabic.
- On first use of a technical surveying term, you may add the English term in parentheses.
- If the user writes in English but selected Arabic, still answer in Arabic unless they explicitly ask you to switch.${IDENTIFIER_RULES}`;
}
