/**
 * Frontend client for the LandSurv Claw browser-automation MCP server.
 *
 * The agent never talks to the Claw service directly; the Node backend
 * proxies at /api/claw so that the shared CLAW_API_KEY stays server-side.
 */

import { isBlocklisted, recordBlockedAttempt, buildBlockedToolResult } from './clawCompliance';

export type ClawContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: string; data: string };

export interface ClawToolResponse {
  tool: string;
  content: ClawContentPart[];
}

export interface ClawToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const CLAW_BASE = '/api/claw';

// ---------------------------------------------------------------------------
// Per-user browser isolation. Every browser tab gets its own opaque session
// id, forwarded as x-claw-session through the Node proxy to the Claw service,
// which maintains an isolated Chromium context (cookies, storage, current
// page) per id — concurrent users can never see or clobber each other's
// browsing session.
// ---------------------------------------------------------------------------
const CLAW_SESSION: string = (() => {
  try { return `t${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`; }
  catch { return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`; }
})();

/** The tab-scoped Claw session id (also useful as a prefix for auxiliary
 *  sessions like map-preview captures that must not disturb the agent's
 *  browsing state). */
export function getClawSessionId(): string {
  return CLAW_SESSION;
}

// ---------------------------------------------------------------------------
// Lightweight event bus — UI components (ClawStatusBadge) subscribe to learn
// when a tool call is in flight and what it returned. Module-scoped, no
// external dependency on a context provider.
// ---------------------------------------------------------------------------

export interface ClawCallEvent {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  startedAt: number;
  endedAt?: number;
  status: 'running' | 'ok' | 'error';
  error?: string;
  preview?: string;
}

type Listener = (evt: ClawCallEvent) => void;
const listeners = new Set<Listener>();

export function subscribeClawEvents(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(evt: ClawCallEvent): void {
  for (const fn of listeners) {
    try { fn(evt); } catch { /* listener errors are isolated */ }
  }
}

let _seq = 0;
const _nextId = () => `claw-${Date.now()}-${++_seq}`;

// ---------------------------------------------------------------------------
// Resolved-URL tracking. The Claw server (and any upstream redirect like
// Google Vertex AI grounding-api-redirect) can land the browser on a host
// that is NOT the host we asked it to navigate to. We therefore parse the
// resolved URL out of every navigate response and (a) post-check it against
// the blocklist, and (b) cache it so subsequent same-page tools (scrape_text,
// screenshot, get_page_info, etc.) inherit the same gate — you cannot scrape
// a blocked host even by navigating to a redirect that lands on it.
// Tracked PER SESSION — an auxiliary session's navigation (e.g. the map
// preview capture) must not pollute the agent session's gate.
// ---------------------------------------------------------------------------
const _lastResolvedBySession = new Map<string, string | null>();

const RESOLVED_URL_RE = /\burl=(https?:\/\/\S+?)(?:[\s'"`]|$)/;

function extractResolvedUrl(content: ClawContentPart[] | undefined): string | null {
  if (!content) return null;
  for (const p of content) {
    if (p.type === 'text' && p.text) {
      const m = p.text.match(RESOLVED_URL_RE);
      if (m) return m[1];
    }
  }
  return null;
}

/** Tools that read or capture the CURRENT page — they do not take a url arg
 *  but they expose whatever host is loaded. Must inherit the blocklist gate. */
const CURRENT_PAGE_TOOLS = new Set<string>(['scrape_text', 'scrape_html', 'extract_links', 'screenshot', 'get_page_info']);

async function clearBrowserState(session: string = CLAW_SESSION): Promise<void> {
  // Fire-and-forget. We use fetchClawTool (the un-gated raw call) because
  // reset_session has no URL and is not on the blocklist; we just don't want
  // to recursively trip our own checks.
  try { await fetchClawTool('reset_session', {}, session); }
  catch { /* best-effort — if reset fails the next navigate will overwrite state anyway */ }
  _lastResolvedBySession.set(session, null);
}

export async function listClawTools(): Promise<ClawToolSchema[]> {
  const r = await fetch(`${CLAW_BASE}/tools`);
  if (!r.ok) throw new Error(`Claw tools list failed: ${r.status}`);
  const body = await r.json();
  return body.tools || [];
}

/**
 * Raw, single-tool fetch with no policy gating. Used internally. Do NOT
 * call from agent-facing code — go through `callClawTool` so blocklisted
 * hosts are properly short-circuited.
 */
async function fetchClawTool(name: string, args: Record<string, unknown>, session: string = CLAW_SESSION): Promise<ClawToolResponse> {
  const r = await fetch(`${CLAW_BASE}/tools/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-claw-session': session },
    body: JSON.stringify(args),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`Claw tool ${name} failed: ${r.status} ${text}`);
  }
  return r.json() as Promise<ClawToolResponse>;
}

export async function callClawTool(
  name: string,
  args: Record<string, unknown> = {},
  opts?: { session?: string },
): Promise<ClawToolResponse> {
  const session = opts?.session || CLAW_SESSION;
  const id = _nextId();
  const startedAt = Date.now();
  emit({ id, tool: name, args, startedAt, status: 'running' });

  // ------------------------------------------------------------------------
  // PERMISSIVE-SOURCE POLICY — hard block (PRE-FETCH).
  // If the navigate's url arg is itself on the blocklist, never make the
  // request. The agent gets a synthetic [BLOCKED] tool result and the user
  // is notified via the SourceBlockedNotice toast.
  // ------------------------------------------------------------------------
  const targetUrl = typeof args?.url === 'string' ? (args.url as string) : '';
  if (name === 'navigate' && targetUrl && isBlocklisted(targetUrl)) {
    recordBlockedAttempt(targetUrl, name);
    const blockedText = buildBlockedToolResult(targetUrl, name);
    const synthetic: ClawToolResponse = {
      tool: name,
      content: [{ type: 'text', text: blockedText }],
    };
    emit({
      id, tool: name, args, startedAt, endedAt: Date.now(),
      status: 'error',
      error: `Blocked by permissive-source policy: ${targetUrl}`,
      preview: `[blocked by TOS policy] ${targetUrl}`,
    });
    return synthetic;
  }

  // PERMISSIVE-SOURCE POLICY — hard block (CURRENT-PAGE TOOLS).
  // scrape_text / scrape_html / screenshot / extract_links / get_page_info do
  // not take a url arg — they read whatever page is currently loaded. If the
  // previous navigate landed (via redirect) on a blocked host, refuse before
  // we leak that content.
  const lastResolvedUrl = _lastResolvedBySession.get(session) || null;
  if (CURRENT_PAGE_TOOLS.has(name) && lastResolvedUrl && isBlocklisted(lastResolvedUrl)) {
    const blockedUrl = lastResolvedUrl;
    recordBlockedAttempt(blockedUrl, name);
    const blockedText = buildBlockedToolResult(blockedUrl, name);
    const synthetic: ClawToolResponse = {
      tool: name,
      content: [{ type: 'text', text: blockedText }],
    };
    emit({
      id, tool: name, args, startedAt, endedAt: Date.now(),
      status: 'error',
      error: `Blocked by permissive-source policy: current page is ${blockedUrl}`,
      preview: `[blocked by TOS policy] ${blockedUrl}`,
    });
    // Clear so a subsequent navigate to a permissive host isn't penalized.
    void clearBrowserState(session);
    return synthetic;
  }

  try {
    const json = await fetchClawTool(name, args, session);

    // ----------------------------------------------------------------------
    // PERMISSIVE-SOURCE POLICY — hard block (POST-FETCH).
    // navigate() commonly receives an opaque redirect URL (e.g. Google Vertex
    // AI grounding-api-redirect/<token>) whose destination cannot be known
    // until the server follows it. Inspect the resolved URL the Claw server
    // reports in the response text — if it lands on a blocklisted host,
    // wipe browser state and return a synthetic [BLOCKED] result so the
    // ecode360/municode/etc. body never reaches the agent.
    // ----------------------------------------------------------------------
    if (name === 'navigate') {
      const resolved = extractResolvedUrl(json.content);
      if (resolved && isBlocklisted(resolved)) {
        const reportedAs = resolved;
        recordBlockedAttempt(reportedAs, name);
        const blockedText = buildBlockedToolResult(reportedAs, name)
          + `\n\nNote: the request URL (${targetUrl || '<unknown>'}) was not itself on the blocklist, but it redirected to a blocked host (${reportedAs}). The browser session has been reset to prevent leakage to subsequent scrape calls.`;
        const synthetic: ClawToolResponse = {
          tool: name,
          content: [{ type: 'text', text: blockedText }],
        };
        emit({
          id, tool: name, args, startedAt, endedAt: Date.now(),
          status: 'error',
          error: `Blocked by permissive-source policy (redirect target): ${reportedAs}`,
          preview: `[blocked by TOS policy — redirect target] ${reportedAs}`,
        });
        void clearBrowserState(session);
        return synthetic;
      }
      // Track resolved URL for subsequent current-page tool gating.
      _lastResolvedBySession.set(session, resolved);
    } else if (name === 'reset_session') {
      _lastResolvedBySession.set(session, null);
    }

    const firstText = json.content?.find(p => p.type === 'text') as { text?: string } | undefined;
    const preview = (firstText?.text || '').slice(0, 240);
    emit({ id, tool: name, args, startedAt, endedAt: Date.now(), status: 'ok', preview });
    return json;
  } catch (e: any) {
    emit({ id, tool: name, args, startedAt, endedAt: Date.now(), status: 'error', error: String(e?.message || e) });
    throw e;
  }
}

/**
 * Render a tool response back to a short text block suitable for feeding
 * back to the LLM as the result of its tool call. Image content is summarized
 * (the model already issued the screenshot — we don't need to re-attach the
 * bytes, just acknowledge size + mime type).
 */
export function summarizeClawResponse(resp: ClawToolResponse, maxChars = 12000): string {
  const lines: string[] = [];
  for (const part of resp.content) {
    if (part.type === 'text') {
      lines.push(part.text);
    } else if (part.type === 'image') {
      const bytes = Math.floor((part.data?.length || 0) * 0.75);
      lines.push(`[screenshot captured — ${part.mimeType}, ~${bytes} bytes]`);
    }
  }
  let out = lines.join('\n').trim();
  if (out.length > maxChars) {
    out = out.slice(0, maxChars) + `\n…[truncated ${out.length - maxChars} chars]`;
  }
  return out;
}

/**
 * A single tool directive the model emitted inside a ```claw fence.
 * Shape: { "tool": "navigate", "args": { "url": "..." } }
 */
export interface ClawDirective {
  tool: string;
  args?: Record<string, unknown>;
}

const CLAW_FENCE_RE = /```claw\s*\n([\s\S]*?)\n```/g;

export function parseClawDirectives(text: string): ClawDirective[] {
  const out: ClawDirective[] = [];
  for (const m of text.matchAll(CLAW_FENCE_RE)) {
    const raw = (m[1] || '').trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && typeof parsed.tool === 'string') {
        out.push({ tool: parsed.tool, args: parsed.args || {} });
      }
    } catch {
      // Ignore malformed fences — the model will get the parse error on its
      // next turn via a synthetic system message if needed.
    }
  }
  return out;
}

/**
 * Execute every ```claw directive found in `text` and return a single
 * markdown-formatted transcript suitable for sending back to the model
 * as the next user turn.
 */
export async function runClawDirectives(text: string, limit = 4): Promise<string | null> {
  const directives = parseClawDirectives(text).slice(0, limit);
  if (directives.length === 0) return null;

  const blocks: string[] = ['Claw tool results:'];
  for (const d of directives) {
    try {
      const resp = await callClawTool(d.tool, d.args || {});
      const summary = summarizeClawResponse(resp);
      // Detect blocked / dead pages and tell the model to pivot instead of
      // retrying the same URL. The Zoning Agent has repeatedly hammered
      // ecode360.com (Cloudflare-protected) after a 403 instead of switching.
      let hint = '';
      if (/\[BLOCKED — TOS-RESTRICTED HOST\]/.test(summary)) {
        // Already an explicit policy block — the synthetic text carries the
        // pivot instructions; do not re-decorate.
        hint = '';
      } else if (/status=403/i.test(summary) || /cf_chl_rt_tk|cloudflare/i.test(summary)) {
        hint = '\n\n⚠️ **BLOCKED (HTTP 403 / Cloudflare)**: This URL is bot-protected. Do NOT retry the same URL. PIVOT to a different source — Zoneomics, the municipality\'s own .gov site, county GIS, or Google Search snippets.';
      } else if (/status=404/i.test(summary)) {
        hint = '\n\n⚠️ **NOT FOUND (HTTP 404)**: This URL is dead. PIVOT to a different source.';
      } else if (/status=5\d\d/i.test(summary)) {
        hint = '\n\n⚠️ **SERVER ERROR (5xx)**: The host is temporarily failing. PIVOT to a different source.';
      }
      blocks.push(`### ${d.tool}\nArgs: \`${JSON.stringify(d.args || {})}\`\n\n${summary}${hint}`);
    } catch (e: any) {
      blocks.push(`### ${d.tool}\nArgs: \`${JSON.stringify(d.args || {})}\`\n\nERROR: ${e?.message || e}`);
    }
  }
  return blocks.join('\n\n');
}
