/**
 * Streaming JSON Parser — extract completed `points` / `lines` objects
 * out of a partial LLM response so the canvas can render them live as the
 * model is still generating.
 *
 * Strategy: walk the text character-by-character, find the `"points":` and
 * `"lines":` array openings, then for each subsequent `{ ... }` whose braces
 * balance, attempt JSON.parse. Anything that parses cleanly is yielded.
 * The tail (a partially-written object after the last complete one) is
 * deliberately ignored — it will be picked up on a later chunk once its
 * closing `}` arrives.
 *
 * Robust to:
 *   - Markdown ```json fences (we don't require them).
 *   - Leading `thinking` prose before the JSON block.
 *   - Comments inside string values that contain `{` or `}`.
 *   - Backslash-escaped quotes inside strings.
 *   - Multiple top-level objects (e.g. `{ "points": [...] }` followed by junk).
 *
 * Tradeoffs:
 *   - We only look at the FIRST `"points":` / `"lines":` occurrence inside
 *     the first balanced JSON candidate. The final committer in App.tsx
 *     does the authoritative full parse and may override / re-render.
 *   - We do not attempt to incrementally parse curve geometry corrections;
 *     preview lines render with whatever raw fields the model emitted.
 *     Final correction passes (tangent continuity etc.) happen on commit.
 */

/** Generic record returned by the parser. Callers narrow the shape themselves. */
export type StreamingRecord = Record<string, unknown>;

/** Result of a single parse pass over a partial response. */
export interface StreamingExtraction {
  points: StreamingRecord[];
  lines: StreamingRecord[];
}

/**
 * Find the index just after `"<key>"\s*:\s*[` in `text`, or -1 if not found.
 * Quote-aware: only matches the key at top-level positions (not inside a string).
 */
const findArrayStart = (text: string, key: string): number => {
  // Build a simple regex: "key" optional whitespace : optional whitespace [
  const re = new RegExp(`"${key}"\\s*:\\s*\\[`, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    // Verify the match is not inside a string literal by scanning preceding text
    // for an odd number of unescaped quotes. This is cheap enough at chunk scale.
    let quoteCount = 0;
    let escape = false;
    for (let i = 0; i < match.index; i++) {
      const ch = text[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') quoteCount++;
    }
    if (quoteCount % 2 === 0) {
      return match.index + match[0].length; // position just after '['
    }
  }
  return -1;
};

/**
 * Starting at `arrayBodyStart` (inside an array body), pull out every fully
 * closed `{ ... }` object. Stops at the first character that isn't part of a
 * completed object (e.g. partially streamed `{ "pointNumber": "1`).
 */
const extractCompletedObjects = (text: string, arrayBodyStart: number): StreamingRecord[] => {
  const out: StreamingRecord[] = [];
  let i = arrayBodyStart;
  const n = text.length;

  while (i < n) {
    // Skip whitespace + commas between objects.
    while (i < n && (text[i] === ' ' || text[i] === '\n' || text[i] === '\r' || text[i] === '\t' || text[i] === ',')) {
      i++;
    }
    if (i >= n) break;
    // End of array.
    if (text[i] === ']') break;
    // Must be the start of an object.
    if (text[i] !== '{') break;

    // Walk forward to find the matching closing brace.
    let depth = 0;
    let inStr = false;
    let escape = false;
    let end = -1;
    for (let j = i; j < n; j++) {
      const ch = text[j];
      if (inStr) {
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) { end = j; break; }
      }
    }

    if (end === -1) break; // object not finished streaming yet
    const objText = text.substring(i, end + 1);
    try {
      const parsed = JSON.parse(objText) as StreamingRecord;
      out.push(parsed);
    } catch {
      // Malformed (rare — model usually emits valid JSON between commas).
      // Skip ahead so we don't get stuck in an infinite loop.
    }
    i = end + 1;
  }

  return out;
};

/**
 * Extract whatever `points` and `lines` are already complete in the partial text.
 * Cheap enough to call on every streaming chunk.
 */
export const extractStreamingPointsAndLines = (text: string): StreamingExtraction => {
  if (!text || text.length < 16) return { points: [], lines: [] };

  const ptsStart = findArrayStart(text, 'points');
  const lnsStart = findArrayStart(text, 'lines');

  const points = ptsStart >= 0 ? extractCompletedObjects(text, ptsStart) : [];
  const lines  = lnsStart >= 0 ? extractCompletedObjects(text, lnsStart) : [];

  return { points, lines };
};
