// LandSurvAI — Unified Project Knowledge Base
//
// Single source of truth for every fact any agent learns during a session.
// Boundary Agent extracts deed metadata + ROW width → recordFact() here.
// Zoning Agent fetches setbacks → recordFact() here. Civil Drafter wants to
// draw a 33' ROW? It first queries the KB (via CACP) and finds the fact the
// Boundary Agent already extracted — no extra LLM call, no extra API hit.
//
// This is the "super brain" layer that turns CACP + LSVZ from separate
// silos into a coherent multi-agent knowledge graph.

import { AgentType } from '../types.ts';

/** Canonical fact categories. Add new ones here — agents key on these strings. */
export type FactCategory =
  | 'deed.metadata'        // owner / parcelId / book / page
  | 'deed.row'             // right-of-way (road name → width, side)
  | 'deed.parcel'          // area / perimeter / closure misclosure
  | 'deed.adjoiner'        // adjoining parcel ownership / call references
  | 'deed.monument'        // monuments found (iron pin, stone, etc.)
  | 'zoning.requirements'  // district / setbacks / max height / lot coverage
  | 'parcel.gis'           // county GIS tax parcel (id, owner, address)
  | 'cad.layer'            // layer name → purpose mapping
  | 'centerline'           // centerline name → length / stations
  | 'control'              // control point (NGS / project benchmark)
  | 'project'              // project-level facts (jobInfo, datum, etc.)
  | 'fieldbook'            // anything user/agent explicitly logs
  | 'peer.response'        // raw cached peer answer (generic catch-all)
  | 'other';

export interface KnowledgeFact {
  /** Stable id — `${category}:${subject}:${predicate}` when possible. */
  id: string;
  category: FactCategory;
  /** What/who this fact is about (road name, district, parcel id, etc.). */
  subject: string;
  /** Attribute being asserted (width, frontSetback, owner, etc.). */
  predicate: string;
  /** Value of the attribute. Free-form by design. */
  value: unknown;
  /** Optional units (ft, m, deg). */
  units?: string;
  /** Which agent recorded the fact (or 'system' / 'user'). */
  source: AgentType | 'system' | 'user';
  /** Free-form context — file name, deed reference, etc. */
  context?: string;
  /** Confidence 0..1 (1 = directly asserted, 0.5 = inferred). */
  confidence?: number;
  /** When the fact was recorded. */
  timestamp: number;
}

const STORAGE_KEY = 'landsurv-knowledge-base';
const MAX_FACTS = 2000;
const PROMPT_INJECTION_DEFAULT = 30;

type Listener = (facts: KnowledgeFact[]) => void;

class KnowledgeBaseService {
  private facts: KnowledgeFact[] = [];
  private listeners: Listener[] = [];
  private idCounter = 0;

  constructor() {
    this.restore();
  }

  // -- Persistence ----------------------------------------------------------
  private restore() {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage?.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.facts = parsed.slice(-MAX_FACTS);
        this.idCounter = this.facts.length;
      }
    } catch { /* ignore corrupt storage */ }
  }

  private persist() {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(this.facts));
    } catch { /* storage full / disabled — non-fatal */ }
  }

  private notify() {
    for (const fn of this.listeners) {
      try { fn(this.facts); } catch { /* swallow */ }
    }
  }

  public onChange(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => {
      const i = this.listeners.indexOf(fn);
      if (i > -1) this.listeners.splice(i, 1);
    };
  }

  // -- Writes ---------------------------------------------------------------
  /** Record a single fact. Upserts on id (or auto-generated key) — newer wins. */
  public recordFact(fact: Omit<KnowledgeFact, 'id' | 'timestamp'> & { id?: string; timestamp?: number }): KnowledgeFact {
    const id = fact.id ?? `${fact.category}:${fact.subject}:${fact.predicate}`.toLowerCase().replace(/\s+/g, '_');
    const full: KnowledgeFact = {
      id,
      category: fact.category,
      subject: String(fact.subject || '').trim(),
      predicate: String(fact.predicate || '').trim(),
      value: fact.value,
      units: fact.units,
      source: fact.source,
      context: fact.context,
      confidence: fact.confidence ?? 1,
      timestamp: fact.timestamp ?? Date.now(),
    };
    // Upsert: replace any existing entry with same id, then push to end (newest last).
    const existingIdx = this.facts.findIndex(f => f.id === id);
    if (existingIdx >= 0) this.facts.splice(existingIdx, 1);
    this.facts.push(full);
    if (this.facts.length > MAX_FACTS) this.facts = this.facts.slice(-MAX_FACTS);
    this.idCounter++;
    this.persist();
    this.notify();
    return full;
  }

  /** Bulk-record. Returns the count actually written. */
  public recordFacts(facts: Array<Parameters<KnowledgeBaseService['recordFact']>[0]>): number {
    let n = 0;
    for (const f of facts) {
      try { this.recordFact(f); n++; } catch { /* skip bad rows */ }
    }
    return n;
  }

  // -- Reads ----------------------------------------------------------------
  public listAll(): KnowledgeFact[] {
    return this.facts.slice();
  }

  public listRecent(limit = 50): KnowledgeFact[] {
    return this.facts.slice(-limit).reverse();
  }

  /**
   * Multi-dimensional query. All criteria are AND-ed; subject/predicate use
   * case-insensitive substring match. Returns newest first.
   */
  public queryFacts(filter: {
    category?: FactCategory | FactCategory[];
    subject?: string;
    predicate?: string;
    source?: AgentType | 'system' | 'user';
    minConfidence?: number;
    limit?: number;
  } = {}): KnowledgeFact[] {
    const cats = filter.category
      ? (Array.isArray(filter.category) ? filter.category : [filter.category])
      : null;
    const subj = filter.subject?.toLowerCase();
    const pred = filter.predicate?.toLowerCase();
    const out: KnowledgeFact[] = [];
    for (let i = this.facts.length - 1; i >= 0; i--) {
      const f = this.facts[i];
      if (cats && !cats.includes(f.category)) continue;
      if (subj && !f.subject.toLowerCase().includes(subj)) continue;
      if (pred && !f.predicate.toLowerCase().includes(pred)) continue;
      if (filter.source && f.source !== filter.source) continue;
      if (filter.minConfidence != null && (f.confidence ?? 1) < filter.minConfidence) continue;
      out.push(f);
      if (filter.limit && out.length >= filter.limit) break;
    }
    return out;
  }

  /**
   * Free-text search across subject/predicate/value (string-cast).
   * Returns newest-first, scored by match count.
   */
  public search(text: string, limit = 20): KnowledgeFact[] {
    const q = text.toLowerCase().trim();
    if (!q) return [];
    const terms = q.split(/\s+/).filter(Boolean);
    const scored: Array<{ f: KnowledgeFact; score: number }> = [];
    for (const f of this.facts) {
      const hay = `${f.category} ${f.subject} ${f.predicate} ${JSON.stringify(f.value)}`.toLowerCase();
      let score = 0;
      for (const t of terms) if (hay.includes(t)) score++;
      if (score > 0) scored.push({ f, score });
    }
    scored.sort((a, b) => b.score - a.score || b.f.timestamp - a.f.timestamp);
    return scored.slice(0, limit).map(s => s.f);
  }

  /**
   * Build a compact markdown summary for prompt injection.
   * Groups by category, lists the most recent N facts.
   */
  public getSummaryMarkdown(maxFacts = PROMPT_INJECTION_DEFAULT): string {
    if (this.facts.length === 0) return '';
    const recent = this.facts.slice(-maxFacts).reverse();
    const byCat = new Map<FactCategory, KnowledgeFact[]>();
    for (const f of recent) {
      const arr = byCat.get(f.category) ?? [];
      arr.push(f);
      byCat.set(f.category, arr);
    }
    const lines: string[] = [];
    const catOrder: FactCategory[] = [
      'project', 'deed.metadata', 'deed.row', 'deed.parcel', 'deed.adjoiner', 'deed.monument',
      'zoning.requirements', 'parcel.gis', 'centerline', 'control', 'cad.layer',
      'fieldbook', 'peer.response', 'other',
    ];
    for (const cat of catOrder) {
      const arr = byCat.get(cat);
      if (!arr || arr.length === 0) continue;
      lines.push(`**${cat}**`);
      for (const f of arr) {
        const ageSec = Math.max(0, Math.round((Date.now() - f.timestamp) / 1000));
        const valueStr = (typeof f.value === 'string' || typeof f.value === 'number' || typeof f.value === 'boolean')
          ? String(f.value)
          : JSON.stringify(f.value).slice(0, 120);
        const u = f.units ? ` ${f.units}` : '';
        const ctx = f.context ? ` _(${f.context.slice(0, 60)})_` : '';
        lines.push(`- \`${f.subject}\` → **${f.predicate}**: ${valueStr}${u} _(${f.source}, ${ageSec}s ago)_${ctx}`);
      }
    }
    return lines.join('\n');
  }

  // -- Lifecycle ------------------------------------------------------------
  public clear(category?: FactCategory): void {
    if (!category) {
      this.facts = [];
    } else {
      this.facts = this.facts.filter(f => f.category !== category);
    }
    this.persist();
    this.notify();
  }

  /** For LSVZ session export. */
  public exportFacts(): KnowledgeFact[] {
    return this.facts.slice();
  }

  /** For LSVZ session import — replaces the in-memory store. */
  public importFacts(facts: KnowledgeFact[]): void {
    if (!Array.isArray(facts)) return;
    this.facts = facts.slice(-MAX_FACTS);
    this.persist();
    this.notify();
  }

  public stats() {
    const byCategory: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    for (const f of this.facts) {
      byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
      bySource[String(f.source)] = (bySource[String(f.source)] ?? 0) + 1;
    }
    return { total: this.facts.length, byCategory, bySource };
  }
}

export const knowledgeBase = new KnowledgeBaseService();

// ---------------------------------------------------------------------------
// Auto-extractors — pull facts out of common agent payloads. Centralised so
// every callsite uses the same recognition logic.
// ---------------------------------------------------------------------------

/** Pull deed metadata (owner / parcelId / book / page) into the KB. */
export function extractDeedMetadataFacts(
  metadata: Record<string, unknown> | null | undefined,
  fileName?: string
): KnowledgeFact[] {
  if (!metadata) return [];
  const out: KnowledgeFact[] = [];
  const subject = fileName || 'current_deed';
  const ctx = fileName ? `from ${fileName}` : undefined;
  const push = (predicate: string, value: unknown) => {
    if (value == null || value === '') return;
    out.push(knowledgeBase.recordFact({
      category: 'deed.metadata', subject, predicate, value, source: AgentType.DEED_READER, context: ctx,
    }));
  };
  const owner = (metadata as any).owner ?? ((metadata as any).owners?.[0]);
  push('owner', owner);
  push('parcelId', (metadata as any).parcelId);
  push('book', (metadata as any).book ?? (metadata as any).deedBook);
  push('page', (metadata as any).page ?? (metadata as any).deedPage);
  return out;
}

/**
 * Scan deed lines for ROW (right-of-way) calls.
 * Matches patterns like "33' ROW", "ROW = 33 feet", "33 feet wide right of way",
 * and tries to associate the width with a nearby street name from the description.
 */
const ROW_PATTERNS: RegExp[] = [
  /(\d{1,3}(?:\.\d+)?)\s*(?:'|ft\.?|feet|foot)?\s*(?:wide\s+)?(?:r\.?o\.?w\.?|right[\s-]?of[\s-]?way)/i,
  /(?:r\.?o\.?w\.?|right[\s-]?of[\s-]?way)\s*(?:=|:|of|width)?\s*(\d{1,3}(?:\.\d+)?)\s*(?:'|ft\.?|feet|foot)?/i,
];
const STREET_NAME_PATTERN = /\b([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,3})\s+(Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Lane|Ln\.?|Drive|Dr\.?|Boulevard|Blvd\.?|Way|Pike|Highway|Hwy\.?|Court|Ct\.?|Place|Pl\.?|Trail|Tr\.?)\b/;

/** Returns the matched width (number, ft) and street (if any) for a chunk of text. */
export function detectRowInText(text: string): { width: number; street?: string; rawMatch: string } | null {
  if (!text) return null;
  for (const re of ROW_PATTERNS) {
    const m = text.match(re);
    if (m) {
      const width = parseFloat(m[1]);
      if (!isFinite(width)) continue;
      const streetMatch = text.match(STREET_NAME_PATTERN);
      const street = streetMatch ? `${streetMatch[1]} ${streetMatch[2].replace('.', '')}` : undefined;
      return { width, street, rawMatch: m[0] };
    }
  }
  return null;
}

/** Walk an array of deed lines, extract ROW facts. */
export function extractRowFactsFromLines(
  lines: Array<{ from?: string; to?: string; bearing?: string; distance?: string; description?: string }> | null | undefined,
  fileName?: string
): KnowledgeFact[] {
  if (!Array.isArray(lines)) return [];
  const out: KnowledgeFact[] = [];
  for (const line of lines) {
    const text = [line.description, line.from, line.to].filter(Boolean).join(' ');
    const hit = detectRowInText(text);
    if (hit) {
      const subject = hit.street || (fileName ? `${fileName}::ROW` : 'unnamed_road');
      out.push(knowledgeBase.recordFact({
        category: 'deed.row',
        subject,
        predicate: 'width',
        value: hit.width,
        units: 'ft',
        source: AgentType.DEED_READER,
        context: fileName ? `from ${fileName}; "${hit.rawMatch}"` : `from "${hit.rawMatch}"`,
        confidence: hit.street ? 0.9 : 0.6,
      }));
    }
  }
  return out;
}

/** Extract Zoning Agent's structured response. */
export function extractZoningFacts(
  zoning: Record<string, unknown> | null | undefined,
  jurisdiction: { state?: string; county?: string; municipality?: string; district?: string }
): KnowledgeFact[] {
  if (!zoning || typeof zoning !== 'object') return [];
  const subject = [jurisdiction.municipality, jurisdiction.county, jurisdiction.state, jurisdiction.district].filter(Boolean).join('|') || 'current_jurisdiction';
  const ctx = `${jurisdiction.municipality ?? '?'}, ${jurisdiction.county ?? '?'} ${jurisdiction.state ?? ''}`.trim();
  const out: KnowledgeFact[] = [];
  const push = (predicate: string, value: unknown, units?: string) => {
    if (value == null || value === '') return;
    out.push(knowledgeBase.recordFact({
      category: 'zoning.requirements', subject, predicate, value, units,
      source: AgentType.ZONING_AGENT, context: ctx,
    }));
  };
  push('district', (zoning as any).district);
  const sb = (zoning as any).setbacks;
  if (sb && typeof sb === 'object') {
    push('setbackFront', sb.front, 'ft');
    push('setbackSide',  sb.side,  'ft');
    push('setbackRear',  sb.rear,  'ft');
  }
  push('maxHeight',   (zoning as any).maxHeight,   'ft');
  push('minLotArea',  (zoning as any).minLotArea,  'sqft');
  push('lotCoverage', (zoning as any).lotCoverage, '%');
  push('permittedUses', (zoning as any).permittedUses);
  push('sources', (zoning as any).sources);
  return out;
}

// ---------------------------------------------------------------------------
// Devtools — surface KB on window for live introspection
// ---------------------------------------------------------------------------
if (typeof window !== 'undefined') {
  (window as any).__kb = {
    all:    () => { const r = knowledgeBase.listAll(); console.table(r); return r; },
    recent: (n = 20) => { const r = knowledgeBase.listRecent(n); console.table(r); return r; },
    query:  (f: Parameters<KnowledgeBaseService['queryFacts']>[0]) => { const r = knowledgeBase.queryFacts(f); console.table(r); return r; },
    search: (q: string, n?: number) => { const r = knowledgeBase.search(q, n); console.table(r); return r; },
    stats:  () => { const s = knowledgeBase.stats(); console.log(s); return s; },
    clear:  (cat?: FactCategory) => { knowledgeBase.clear(cat); return 'cleared'; },
    summary: (n?: number) => { const s = knowledgeBase.getSummaryMarkdown(n); console.log(s); return s; },
    service: knowledgeBase,
  };
}
