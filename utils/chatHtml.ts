// Small, dependency-free formatter for chat message bodies.
//
// The chat panel renders model text via `dangerouslySetInnerHTML`, so we have
// to do three things ourselves:
//   1. Escape any incoming HTML to prevent injection from model output.
//   2. Render the lightweight markdown the model actually emits
//      (**bold**, *italic*, `code`, [text](url), bullets, headings).
//   3. Auto-link bare URLs and recognized ordinance/source domains so the
//      user can follow citations the model weaves into prose
//      (e.g. "see ecode360.com/PA1234/laws/...").
//
// We deliberately keep this tiny — no full markdown engine, no sanitizer
// library. The escape step in (1) is what guarantees safety; everything
// after only adds back specific known-safe tags.

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => HTML_ESCAPES[ch] || ch);
}

// After escaping, restore a tiny allow-list of presentational tags that the app
// itself emits in agent greetings (e.g. colored agent names). Everything else
// stays escaped, so untrusted model output still can't inject markup — only
// <strong>/<em> and an optional validated hex color survive.
function restoreSafeTags(s: string): string {
  // <strong> with an optional inline color style. The color is validated as a
  // hex literal, so no arbitrary CSS/script can slip through.
  s = s.replace(
    /&lt;strong(?:\s+style=&quot;color:\s*(#[0-9a-fA-F]{3,8});?\s*&quot;)?&gt;/g,
    (_m, color) => (color ? `<strong style="color:${color}">` : '<strong>'),
  );
  s = s.replace(/&lt;\/strong&gt;/g, '</strong>');
  s = s.replace(/&lt;em&gt;/g, '<em>');
  s = s.replace(/&lt;\/em&gt;/g, '</em>');
  return s;
}

// Known domains that the zoning agent frequently cites. We auto-link bare
// mentions like "ecode360.com" or "municode.com/library/..." even when the
// model didn't bother to write the full https:// prefix.
const CITATION_DOMAINS = [
  'ecode360.com',
  'municode.com',
  'codepublishing.com',
  'amlegal.com',
  'sterlingcodifiers.com',
  'generalcode.com',
  'arcgis.com',
  'arcgisonline.com',
  'mapservices.com',
  'census.gov',
  'cityofnewyork.us',
  'phila.gov',
];

// Matches absolute URLs (http/https/www) — the workhorse for explicit links.
// Trailing punctuation that\u2019s almost certainly sentence punctuation, not
// part of the URL, gets stripped after the match.
const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>()"']+[A-Za-z0-9\/])/g;

// Matches bare domain-like tokens (no scheme). Restricted to the citation
// list above so we don\u2019t accidentally turn random product names into links.
const BARE_DOMAIN_RE = new RegExp(
  '\\b(' + CITATION_DOMAINS.map(d => d.replace(/\./g, '\\.')).join('|')
       + ')((?:\\/[A-Za-z0-9_\\-./%#?=&+~,:]*)?)\\b',
  'g',
);

function trimTrailingPunct(href: string): { href: string; trail: string } {
  const m = href.match(/[.,;:!?)]+$/);
  if (!m) return { href, trail: '' };
  return { href: href.slice(0, -m[0].length), trail: m[0] };
}

function linkAttrs(): string {
  return 'target="_blank" rel="noopener noreferrer" class="text-emerald-300 underline decoration-emerald-500/40 underline-offset-2 hover:text-emerald-200 hover:decoration-emerald-300/70 transition"';
}

// We tokenize on `<a>` boundaries so subsequent markdown passes never
// re-process URLs we already linked.
const LINK_PLACEHOLDER = '\u0000L\u0000';

function autoLink(s: string): { text: string; links: string[] } {
  const links: string[] = [];
  const push = (html: string) => {
    links.push(html);
    return `${LINK_PLACEHOLDER}${links.length - 1}${LINK_PLACEHOLDER}`;
  };

  // NOTE: `s` is already HTML-escaped by the caller, so URL substrings will
  // contain `&amp;` rather than raw `&`. We use the matched (escaped) text
  // directly inside both the href and the link label \u2014 do NOT re-escape,
  // or `&amp;` becomes `&amp;amp;` and the link breaks.

  // 1) Explicit markdown links [label](url) \u2014 done first so they win.
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label, url) => {
    return push(`<a href="${url}" ${linkAttrs()}>${label}</a>`);
  });

  // 2) Bare absolute URLs (http/https/www).
  s = s.replace(URL_RE, raw => {
    const { href, trail } = trimTrailingPunct(raw);
    const fullHref = href.startsWith('http') ? href : `https://${href}`;
    return push(`<a href="${fullHref}" ${linkAttrs()}>${href}</a>`) + trail;
  });

  // 3) Bare citation domains (ecode360.com, municode.com, ...).
  s = s.replace(BARE_DOMAIN_RE, (raw, domain, path) => {
    const fullHref = `https://${domain}${path || ''}`;
    return push(`<a href="${fullHref}" ${linkAttrs()}>${raw}</a>`);
  });

  return { text: s, links };
}

function applyMarkdown(s: string): string {
  // Inline code first so its contents are protected from bold/italic passes.
  const codes: string[] = [];
  s = s.replace(/`([^`]+)`/g, (_m, body) => {
    codes.push(body);
    return `\u0000C\u0000${codes.length - 1}\u0000C\u0000`;
  });

  // **bold**
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // *italic* / _italic_ \u2014 keep simple, avoid matching across newlines.
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*([^*\w]|$)/g, '$1<em>$2</em>$3');
  s = s.replace(/(^|[^_\w])_([^_\n]+)_([^_\w]|$)/g, '$1<em>$2</em>$3');

  // Restore code spans.
  s = s.replace(/\u0000C\u0000(\d+)\u0000C\u0000/g, (_m, i) =>
    `<code class="px-1 py-0.5 rounded bg-slate-800/70 text-emerald-200 text-[0.85em]">${codes[Number(i)]}</code>`,
  );
  return s;
}

function applyLineBreaks(s: string): string {
  // Bullets at the start of a line \u2014 visualize them as a leading dot.
  s = s.replace(/^[\s]*[-*]\s+/gm, '<span class="text-emerald-400 mr-1">\u2022</span>');
  return s.replace(/\n/g, '<br />');
}

export function formatChatHtml(raw: string): string {
  if (!raw) return '';
  const escaped = restoreSafeTags(escapeHtml(raw));
  const { text: linked, links } = autoLink(escaped);
  const withMd = applyMarkdown(linked);
  const withBreaks = applyLineBreaks(withMd);
  // Restore <a> tags last so markdown passes can\u2019t mangle their attributes.
  return withBreaks.replace(
    new RegExp(`${LINK_PLACEHOLDER}(\\d+)${LINK_PLACEHOLDER}`, 'g'),
    (_m, i) => links[Number(i)],
  );
}
