import type {
  A2UIZoningCitation,
  A2UIZoningSourceLedger,
  A2UIZoningSourceLink,
} from '../types.ts';
import { isBlocklisted } from './clawCompliance.ts';
import { extractZoningJsonBlock } from './zoningRender.ts';

export interface BuildZoningSourceLedgerInput {
  answerText: string;
  json?: string | Record<string, unknown> | null;
  jurisdiction?: string;
}

const MAX_CITATIONS = 24;
const MAX_SOURCES = 12;
const MAX_QUOTE = 280;

interface NormalizedUrl {
  url: string;
  host: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseJson(input: BuildZoningSourceLedgerInput['json']): Record<string, unknown> | null {
  if (!input) return null;
  if (typeof input === 'object') return asRecord(input);

  const trimmed = input.trim();
  if (!trimmed) return null;

  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return asRecord(JSON.parse(unfenced));
  } catch {
    return extractZoningJsonBlock(input);
  }
}

function normalizeHttpUrl(value: unknown): NormalizedUrl | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim().replace(/[.,;:!?)\]}>"']+$/, '');
  if (!/^https?:\/\//i.test(raw)) return null;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!parsed.hostname.includes('.')) return null;
    return {
      url: parsed.toString(),
      host: parsed.hostname.replace(/^www\./i, ''),
    };
  } catch {
    return null;
  }
}

function isRestrictedUrl(url: string): boolean {
  if (isBlocklisted(url)) return true;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'vertexaisearch.cloud.google.com'
      || host.endsWith('.vertexaisearch.cloud.google.com');
  } catch {
    return true;
  }
}

/** Normalize a model-supplied section/article label for display. */
export function normalizeZoningCitationLabel(raw: string): string {
  let value = raw.trim().replace(/\s+/g, ' ');
  value = value.replace(/^(?:sections?|secs?\.?)\s+/i, '').replace(/^§+\s*/, '');
  value = value.replace(/\s*([-.–])\s*/g, '$1');

  const named = value.match(/^(article|chapter|table|appendix)\s+(.+)$/i);
  if (named) {
    const word = `${named[1][0].toUpperCase()}${named[1].slice(1).toLowerCase()}`;
    const suffix = /^[ivxlcdm]+$/i.test(named[2]) ? named[2].toUpperCase() : named[2];
    return `${word} ${suffix}`;
  }

  return `§${value}`;
}

function citationKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/^§+\s*/, '')
    .replace(/\b(?:sections?|secs?\.?)\b/g, '')
    .replace(/[\s–—]/g, '')
    .replace(/[.;]+$/, '');
}

/**
 * Extract every explicit citation from prose. This intentionally does not
 * infer a source URL: a citation without a matching JSON entry must remain
 * visibly unverified rather than borrow an unrelated link.
 */
export function extractZoningCitations(text: string): string[] {
  if (!text) return [];

  const prose = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/[^\s<>"'`]+/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

  const hits: Array<{ index: number; label: string }> = [];
  const add = (index: number, raw: string) => {
    const label = normalizeZoningCitationLabel(raw);
    if (label.length > 1) hits.push({ index, label });
  };

  for (const match of prose.matchAll(/(?:§{1,2}\s*|(?:Sections?|Secs?\.?)\s+)(\d[0-9A-Za-z]*(?:\s*[-–.]\s*[0-9A-Za-z]+)+)/gi)) {
    add(match.index ?? 0, match[1]);
  }
  for (const match of prose.matchAll(/\b(\d{1,4}(?:-\d{1,4})+(?:\.[0-9A-Za-z]+)?)\b/g)) {
    add(match.index ?? 0, match[1]);
  }
  for (const match of prose.matchAll(/\b(Article|Chapter|Table|Appendix)\s+([IVXLCDM]+|\d+(?:[.-]\d+)*)\b/gi)) {
    add(match.index ?? 0, `${match[1]} ${match[2]}`);
  }

  const seen = new Set<string>();
  return hits
    .sort((a, b) => a.index - b.index)
    .map(hit => hit.label)
    .filter(label => {
      const key = citationKey(label);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildCitation(
  citationRaw: string,
  urlRaw: unknown,
  titleRaw: unknown,
  quoteRaw: unknown,
): A2UIZoningCitation {
  const citation = normalizeZoningCitationLabel(citationRaw);
  const normalizedUrl = normalizeHttpUrl(urlRaw);
  const title = typeof titleRaw === 'string' && titleRaw.trim()
    ? titleRaw.trim().slice(0, 160)
    : undefined;
  const quote = typeof quoteRaw === 'string' && quoteRaw.trim()
    ? quoteRaw.trim().replace(/\s+/g, ' ').slice(0, MAX_QUOTE)
    : undefined;

  if (!normalizedUrl) {
    return {
      citation,
      status: 'unverified',
      title,
      quote,
      note: 'No source URL was returned for this citation.',
    };
  }

  if (isRestrictedUrl(normalizedUrl.url)) {
    return {
      citation,
      status: 'unverified',
      title,
      quote,
      note: `Restricted host (${normalizedUrl.host}) — not machine-verified.`,
    };
  }

  return {
    citation,
    url: normalizedUrl.url,
    title,
    quote,
    status: 'linked',
  };
}

function buildSourceLink(value: unknown): A2UIZoningSourceLink | null {
  const record = asRecord(value);
  const urlRaw = typeof value === 'string'
    ? value
    : record?.url ?? record?.sourceUrl ?? record?.href ?? record?.source;
  const titleRaw = record?.title ?? record?.label ?? record?.name;
  const normalizedUrl = normalizeHttpUrl(urlRaw);
  if (!normalizedUrl || isRestrictedUrl(normalizedUrl.url)) return null;

  return {
    url: normalizedUrl.url,
    title: typeof titleRaw === 'string' && titleRaw.trim()
      ? titleRaw.trim().slice(0, 160)
      : undefined,
  };
}

export function buildZoningSourceLedger(
  input: BuildZoningSourceLedgerInput,
): A2UIZoningSourceLedger | null {
  const parsed = parseJson(input.json);
  const mapped = new Map<string, A2UIZoningCitation>();

  const addCitation = (citation: A2UIZoningCitation) => {
    const key = citationKey(citation.citation);
    if (!key) return;
    const existing = mapped.get(key);
    // A late, linked entry upgrades an earlier unverified declaration; the
    // reverse never downgrades a citation that already has a real URL.
    if (!existing || (existing.status === 'unverified' && citation.status === 'linked')) {
      mapped.set(key, citation);
    }
  };

  const rawCitations = Array.isArray(parsed?.citations) ? parsed.citations : [];
  for (const raw of rawCitations) {
    if (typeof raw === 'string') {
      addCitation(buildCitation(raw, null, null, null));
      continue;
    }
    const record = asRecord(raw);
    if (!record) continue;
    const citationRaw = record.citation ?? record.section ?? record.label ?? record.code;
    if (typeof citationRaw !== 'string' || !citationRaw.trim()) continue;
    addCitation(buildCitation(
      citationRaw,
      record.url ?? record.sourceUrl ?? record.source,
      record.title ?? record.sourceTitle,
      record.quote ?? record.excerpt,
    ));
  }

  // A prose citation that the model did not map to a URL is still shown, but
  // never assigned a guessed source. This is the "no funny business" guard.
  for (const citation of extractZoningCitations(input.answerText)) {
    const key = citationKey(citation);
    if (!key || mapped.has(key)) continue;
    mapped.set(key, {
      citation,
      status: 'unverified',
      note: 'No citation-to-source mapping was returned for this section.',
    });
  }

  const rawSources = Array.isArray(parsed?.sources)
    ? parsed.sources
    : parsed?.sources
      ? [parsed.sources]
      : [];
  const sources: A2UIZoningSourceLink[] = [];
  const seenSources = new Set<string>();
  for (const raw of rawSources) {
    const link = buildSourceLink(raw);
    if (!link || seenSources.has(link.url)) continue;
    seenSources.add(link.url);
    sources.push(link);
  }

  const citations = [...mapped.values()].slice(0, MAX_CITATIONS);
  if (citations.length === 0 && sources.length === 0) return null;

  return {
    citations,
    sources: sources.slice(0, MAX_SOURCES),
    jurisdiction: input.jurisdiction?.trim() || undefined,
    note: sources.length > MAX_SOURCES
      ? `Showing the first ${MAX_SOURCES} general sources.`
      : undefined,
  };
}
