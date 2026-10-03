/**
 * Permissive-source policy for the LandSurv Claw browser-automation client.
 *
 * A handful of municipal-code platforms (eCode360, Municode, qcode.us,
 * generalCode, codePublishing, amLegal, sterlingCodifiers, lf-pubs) publish
 * under a Terms-of-Service that prohibits automated retrieval. The underlying
 * ordinance TEXT is generally public-record (see Banks v. Manchester 1888,
 * Georgia v. Public.Resource.Org 2020 — the government-edicts doctrine), but
 * the PLATFORM that hosts and formats it is contractually fenced.
 *
 * Rather than try to thread a needle through "user-consent attestation" (a
 * theory that does not cleanly cure automated retrieval), we take the
 * cleanest legal posture available: the LandSurv Claw makes NO automated
 * request to these hosts. Period. They are hard-blocked at this layer; the
 * agent receives a synthetic [BLOCKED] tool result and pivots to a
 * permissive source (the municipality's own .gov site, Zoneomics, county
 * GIS, planning-department PDFs, etc.).
 *
 * If the user wants to read the restricted host themselves, the blocked-
 * source toast offers an "Open in your browser" link — that request goes
 * from the user's own session under the user's own TOS exposure, exactly as
 * if they had typed the URL into the address bar. Anything they then paste
 * back into the chat input is user-supplied input, not automated retrieval.
 *
 * This file owns: the blocklist registry, the policy predicate, the blocked-
 * attempt event bus, and the devtools introspection handle.
 */

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

/**
 * Hosts whose published Terms-of-Service prohibit unattended automated
 * retrieval. Match is `host === suffix || host.endsWith('.' + suffix)`.
 *
 * Edit this list when a TOS audit changes. Keep entries lowercase.
 */
export const RESTRICTED_HOST_SUFFIXES: ReadonlyArray<string> = [
  'ecode360.com',
  'municode.com',
  'library.qcode.us',
  'qcode.us',
  'generalcode.com',
  'codepublishing.com',
  'amlegal.com',
  'codelibrary.amlegal.com',
  'sterlingcodifiers.com',
  'lf-pubs.com',
];

/** True if `url` is on the permissive-source blocklist. */
export function isBlocklisted(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return RESTRICTED_HOST_SUFFIXES.some(suffix => host === suffix || host.endsWith(`.${suffix}`));
  } catch {
    return false;
  }
}

/** Back-compat alias — older call sites used `requiresConsent`. */
export const requiresConsent = isBlocklisted;

/**
 * Brand/name tokens for the blocklisted codification platforms. Used to scrub
 * plain-language mentions ("consult eCode360", "the Municode portal") out of a
 * finalized answer — not just hyperlinks. Ordered longest-first so multi-word
 * brands match before their bare-domain fallback.
 */
export const RESTRICTED_BRAND_TOKENS: ReadonlyArray<string> = [
  'eCode360', 'ecode360', 'Municode', 'municode', 'General Code', 'generalcode',
  'Code Publishing', 'codepublishing', 'American Legal Publishing', 'amlegal',
  'Sterling Codifiers', 'sterlingcodifiers', 'qcode', 'Quality Code Publishing',
];

/**
 * Deterministically remove every reference to a blocklisted codifier from a
 * finalized answer string: markdown links, bare URLs, and brand-name mentions.
 * The agent must never surface these hosts to the user (TOS/legal risk), even
 * when the model cites them as "the authoritative source". Returns the scrubbed
 * text plus whether anything was removed.
 */
export function scrubBlocklistedFromText(text: string): { text: string; removed: boolean } {
  if (!text) return { text, removed: false };
  let out = text;
  let removed = false;

  // 1) Markdown links whose target is a blocklisted host: [label](url) → label
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (m, label: string, url: string) => {
    if (isBlocklisted(url)) { removed = true; return label; }
    return m;
  });

  // 2) Bare URLs pointing at a blocklisted host.
  out = out.replace(/https?:\/\/[^\s"'`)<>\]}]+/g, (url: string) => {
    const clean = url.replace(/[.,;:!?)\]}>"']+$/, '');
    if (isBlocklisted(clean)) { removed = true; return '[removed — restricted source]'; }
    return url;
  });

  // 3) Plain-language brand mentions.
  for (const token of RESTRICTED_BRAND_TOKENS) {
    const esc = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${esc}\\b`, 'g');
    if (re.test(out)) { removed = true; out = out.replace(re, 'the official municipal ordinance'); }
  }

  // Tidy any doubled phrases the substitutions may have produced.
  out = out.replace(/(the official municipal ordinance)(\s+\1)+/gi, '$1');
  return { text: out, removed };
}

/** Filter an array of URLs down to permissive (non-blocklisted) ones. */
export function stripBlocklistedUrls(urls: unknown[]): string[] {
  return urls.filter((u): u is string => typeof u === 'string' && !isBlocklisted(u));
}

/** Human-readable explanation for the blocked-source toast / agent hint. */
export function getBlocklistReason(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return `${host} publishes municipal codes under a Terms-of-Service that prohibits automated retrieval. The LandSurv Claw will not fetch this URL. You can open the link in your own browser to read it directly — that request leaves your machine under your own TOS, not the app's automation.`;
  } catch {
    return 'This source is on the permissive-source blocklist and cannot be auto-fetched.';
  }
}

/** Synthetic tool-result text the agent sees when it tries to navigate a blocked host. */
export function buildBlockedToolResult(url: string, tool: string): string {
  const host = (() => { try { return new URL(url).hostname.toLowerCase(); } catch { return url; } })();
  return [
    `[BLOCKED — TOS-RESTRICTED HOST] ${host}`,
    `Tool: ${tool} — Target: ${url}`,
    '',
    `${host} is on the LandSurv permissive-source blocklist. Its published Terms-of-Service prohibits automated retrieval, so the LandSurv Claw does not fetch this host. The user has been notified that this attempt was made.`,
    '',
    'Pivot to a permissive source for this jurisdiction:',
    '  1. The municipality\'s own .gov site (search: "<municipality> zoning ordinance site:.gov")',
    '  2. Zoneomics',
    '  3. The county GIS / planning department',
    '  4. State planning office PDFs',
    '  5. Grounded Google Search snippets',
    '',
    'Do NOT retry the same blocked host. Do NOT navigate to any other host on the blocklist.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Blocked-attempt event bus — surfaced in the UI so the operator sees what
// the agent tried, can read the policy, and can open the URL themselves.
// ---------------------------------------------------------------------------

export interface BlockedAttempt {
  id: string;
  url: string;
  host: string;
  tool: string;
  timestamp: number;
  reason: string;
}

type BlockedListener = (evt: BlockedAttempt) => void;
const blockedListeners = new Set<BlockedListener>();
const recentBlocked: BlockedAttempt[] = [];
const RECENT_LIMIT = 50;

export function subscribeBlockedAttempts(fn: BlockedListener): () => void {
  blockedListeners.add(fn);
  // Replay recent attempts so a freshly-mounted UI catches up.
  for (const evt of recentBlocked) { try { fn(evt); } catch { /* isolated */ } }
  return () => { blockedListeners.delete(fn); };
}

export function recordBlockedAttempt(url: string, tool: string): BlockedAttempt {
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch { host = url; }
  const evt: BlockedAttempt = {
    id: `blocked-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    url,
    host,
    tool,
    timestamp: Date.now(),
    reason: getBlocklistReason(url),
  };
  recentBlocked.push(evt);
  if (recentBlocked.length > RECENT_LIMIT) recentBlocked.shift();
  for (const fn of blockedListeners) { try { fn(evt); } catch { /* isolated */ } }
  return evt;
}

export function getRecentBlockedAttempts(limit = 10): ReadonlyArray<BlockedAttempt> {
  return recentBlocked.slice(-limit);
}

/** Devtools introspection — `__clawBlocklist` in the JS console. */
if (typeof window !== 'undefined') {
  (window as any).__clawBlocklist = {
    hosts: RESTRICTED_HOST_SUFFIXES,
    isBlocklisted,
    recent: (n = 10) => getRecentBlockedAttempts(n),
    explain: getBlocklistReason,
  };
}
