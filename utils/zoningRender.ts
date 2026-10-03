// Helpers for rendering Zoning Agent responses cleanly.
//
// The Zoning Agent's raw turn stream tends to include:
//   - ```claw``` fences (browser-automation directives we already executed)
//   - ```json``` fences (structured facts for the KB)
//   - "THINKING\n...RESULT\n..." chain-of-thought narration
//
// None of those are useful in the user-facing chat or the Research Summary.
// `sanitizeZoningAnswer` strips all three; `extractZoningJsonBlock` returns
// the structured payload so we can pin it to the KnowledgeBase.

const CLAW_FENCE = /```claw\s*\n[\s\S]*?\n```/g;
// Accept any fence opener — case-insensitive language tag, optional leading
// newline. Captures everything up to the closing ``` (with or without a
// preceding newline).
const JSON_FENCE = /```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```/g;

export function sanitizeZoningAnswer(text: string): string {
  if (!text) return text;
  let out = text.replace(CLAW_FENCE, '').replace(JSON_FENCE, '');
  // Drop the model's "THINKING…RESULT" narration. Case-sensitive on purpose:
  // we only target the ALL-CAPS marker convention, never the natural English
  // word "thinking". Require BOTH markers — if the closing RESULT is missing
  // we leave the text alone (better to show extra prose than blank a bubble).
  out = out.replace(/THINKING\b[\s\S]*?RESULT\b\s*/g, '');
  // Strip any leftover bare RESULT markers at line start.
  out = out.replace(/^[ \t]*RESULT[ \t]*\n?/gm, '');
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  // If the sanitize left only filler (dots, ellipses, whitespace), drop entirely.
  if (/^[.…\s]*$/.test(out)) return '';
  return out;
}

// Extract a structured JSON payload from a model response. Tries, in order:
//   1. Every ```json``` / ```JSON``` / ``` (no lang) ``` fenced block.
//   2. Any bare top-level `{...}` JSON object spanning the longest match.
// Returns the LAST parseable object found (most recent restated answer wins).
export function extractZoningJsonBlock(text: string): Record<string, unknown> | null {
  if (!text) return null;

  let last: Record<string, unknown> | null = null;

  // (1) Fenced blocks.
  const re = new RegExp(JSON_FENCE.source, JSON_FENCE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const body = (m[1] || '').trim();
    if (!body) continue;
    // The fence might wrap something that ISN'T JSON (e.g. a code sample);
    // skip silently if parse fails.
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        last = parsed as Record<string, unknown>;
      }
    } catch { /* try next fence */ }
  }
  if (last) return last;

  // (2) Bare {...} fallback — scan for the largest balanced object that
  // contains one of the expected zoning keys, in case the model forgot the
  // fence entirely.
  const candidates = [...text.matchAll(/\{[\s\S]*?\}/g)].map(mm => mm[0]);
  // Try longest-first; many short matches will fail JSON.parse, but the
  // outermost object usually parses successfully.
  candidates.sort((a, b) => b.length - a.length);
  for (const c of candidates) {
    if (!/(zoningMapUrl|zoningMapImage|zoningDistricts|sources)/i.test(c)) continue;
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch { /* keep looking */ }
  }
  return null;
}
