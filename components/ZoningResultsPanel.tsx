// Zoning Agent — Smart Results Panel (v1.3)
//
// Replaces the old flat "Research Summary" with a structured, live-updating
// view that extracts key facts (setbacks / uses / citations / sources) from
// every answer and pins them into a project-level snapshot at the top.
//
// Three layers, top-down:
//   1. Hero header   — jurisdiction + live Claw status (Researching / Synthesizing / Idle)
//   2. Snapshot card — aggregated KB facts for the current jurisdiction
//   3. Timeline      — per-question card with auto-extracted highlights + body

import React, { useEffect, useMemo, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import {
  Building2, MapPin, Search, Loader2, CheckCircle2, AlertCircle,
  ExternalLink, Ruler, Maximize2, ShieldCheck, ChevronDown, ChevronUp,
  BookOpen, Sparkles, Layers, X, Download, Braces, Database, Check, Image as ImageIcon,
} from 'lucide-react';
import { ChatMessage, MessageRole } from '../types';
import { sanitizeZoningAnswer, extractZoningJsonBlock } from '../utils/zoningRender';
import { subscribeClawEvents, ClawCallEvent, callClawTool, getClawSessionId } from '../utils/clawClient';
import { knowledgeBase, KnowledgeFact } from '../services/KnowledgeBase';
import { subscribeBootstrap, BootstrapStatus, stageLabel } from '../utils/zoningBootstrap';
import { openSourcePolicyExplainer } from './PermissiveSourcesExplainer';
import { isBlocklisted } from '../utils/clawCompliance';
import ArcGISZoningMap from './ArcGISZoningMap';

interface Props {
  chatHistory: ChatMessage[];
  place?: string;
  county?: string;
  state?: string;
  district?: string;
  /** Wire a district-chip click into the active Zoning chat. */
  onAskQuestion?: (q: string) => void;
  /** Set the active district (e.g. when a district chip is clicked) so the
   *  summary area switches to that district's requirement snapshot. */
  onSelectDistrict?: (code: string) => void;
}

interface DistrictEntry { code: string; name?: string }

/** Structured record pinned by the bootstrap as `zoningResearchSummary`. */
interface ResearchSummary {
  completedAt?: string;
  jurisdiction?: string;
  searchProvider?: string;
  candidatesConsidered?: number;
  candidatesVerified?: number;
  map?: { url?: string; kind?: string; contentType?: string; muniMatched?: boolean; fromSearch?: boolean } | null;
  districtsCount?: number;
  districtsSource?: string | null;
  sourceCount?: number;
  dropped?: string[];
  narrative?: string;
}

interface ResearchTurn {
  q: string;
  a: string;
  loading: boolean;
  zoningJson: Record<string, unknown> | null;
  citations: string[];
  numbers: Array<{ label: string; value: string }>;
  uses: string[];
  urls: string[];
}

// Citations: §27-405.A, § 176-1001.A.21, Section 4.5, Article X
const CITATION_RE = /(?:§\s*\d[\d.\-A-Za-z]*|Section\s+\d[\d.\-A-Za-z]*|Article\s+[IVXLCDM]+(?:[:.]\s*[\w ]+)?)/g;
const URL_RE = /https?:\/\/[^\s)\]<>"']+/g;

function uniq<T>(a: T[]): T[] { return Array.from(new Set(a)); }

function hostOf(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; }
}

function isPdfUrl(u?: string): boolean {
  return !!u && /\.pdf(\?|#|$)/i.test(u);
}

// If the pinned GIS URL is (or contains) an ArcGIS MapServer endpoint we can
// render the zoning layers natively in-app via the service's REST API — no
// iframe, no leaving the app. FeatureServer/viewer-app URLs return null and
// fall through to iframe / screenshot strategies.
function arcgisServiceOf(u?: string): string | null {
  if (!u) return null;
  const m = u.match(/^(https?:\/\/[^?#]*?\/MapServer)(?:\/\d+)?(?:[/?#]|$)/i);
  return m ? m[1] : null;
}

// Wrap a cross-origin URL with our backend fetch-proxy so the browser will
// embed responses that the upstream host blocks via X-Frame-Options or CSP.
// Same-origin and non-http(s) URLs are returned unchanged.
function proxiedUrl(u?: string): string | undefined {
  if (!u) return undefined;
  try {
    const parsed = new URL(u, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return u;
    if (typeof window !== 'undefined' && parsed.origin === window.location.origin) return u;
    return `/api/proxy-fetch?url=${encodeURIComponent(parsed.toString())}`;
  } catch {
    return u;
  }
}

function buildTurns(history: ChatMessage[]): ResearchTurn[] {
  const out: ResearchTurn[] = [];
  for (let i = 0; i < history.length; i++) {
    if (history[i].role !== MessageRole.USER) continue;
    const answer = history[i + 1];
    const rawA = answer ? (answer.result || answer.text || '') : '';
    const sanitized = sanitizeZoningAnswer(rawA);
    const json = extractZoningJsonBlock(rawA);

    const citations = uniq(Array.from(sanitized.matchAll(CITATION_RE), m => m[0].trim()));
    const urlsFromText = Array.from(sanitized.matchAll(URL_RE), m => m[0]);
    const urlsFromJson = json && Array.isArray((json as any).sources)
      ? ((json as any).sources as any[]).map(String)
      : [];
    const urls = uniq([...urlsFromJson, ...urlsFromText]);

    const numbers: Array<{ label: string; value: string }> = [];
    if (json) {
      const j = json as any;
      const sb = j.setbacks;
      if (sb && typeof sb === 'object') {
        if (sb.front != null) numbers.push({ label: 'Front setback', value: `${sb.front} ft` });
        if (sb.side != null) numbers.push({ label: 'Side setback', value: `${sb.side} ft` });
        if (sb.rear != null) numbers.push({ label: 'Rear setback', value: `${sb.rear} ft` });
      }
      if (j.maxHeight != null) numbers.push({ label: 'Max height', value: `${j.maxHeight} ft` });
      if (j.minLotArea != null) numbers.push({ label: 'Min lot area', value: `${j.minLotArea}` });
      if (j.lotCoverage != null) numbers.push({ label: 'Lot coverage', value: `${j.lotCoverage}` });
    }

    const uses = json && Array.isArray((json as any).permittedUses)
      ? ((json as any).permittedUses as any[]).map(String)
      : [];

    out.push({
      q: history[i].text,
      a: sanitized,
      loading: !!answer && (answer.text === '' || answer.text === undefined),
      zoningJson: json,
      citations,
      numbers,
      uses,
      urls,
    });
  }
  return out;
}

// --- Inline rich-text rendering ----------------------------------------------
function inline(text: string, keyBase = ''): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|\[([^\]]+)\]\((https?:\/\/[^)]+)\)|(https?:\/\/[^\s)\]<>"']+)|((?:§\s*\d[\d.\-A-Za-z]*|Section\s+\d[\d.\-A-Za-z]*))/g;
  let last = 0; let m: RegExpExecArray | null; let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1]) parts.push(<strong key={`${keyBase}-b-${k++}`} className="text-white font-semibold">{m[1]}</strong>);
    else if (m[2]) parts.push(<em key={`${keyBase}-i-${k++}`}>{m[2]}</em>);
    else if (m[3] && m[4]) parts.push(<a key={`${keyBase}-a-${k++}`} href={m[4]} target="_blank" rel="noopener noreferrer" className="text-emerald-300 hover:text-emerald-200 underline decoration-dotted underline-offset-2">{m[3]}</a>);
    else if (m[5]) parts.push(<a key={`${keyBase}-u-${k++}`} href={m[5]} target="_blank" rel="noopener noreferrer" className="text-emerald-300 hover:text-emerald-200 underline decoration-dotted underline-offset-2 break-all">{m[5]}</a>);
    else if (m[6]) parts.push(<span key={`${keyBase}-c-${k++}`} className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-300 font-mono text-xs mx-0.5">{m[6]}</span>);
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function renderRich(text: string): React.ReactNode[] {
  if (!text) return [];
  const out: React.ReactNode[] = [];
  const paras = text.split(/\n{2,}/);
  paras.forEach((p, pi) => {
    const lines = p.split(/\n/).filter(l => l.length > 0);
    const isList = lines.length > 1 && lines.every(l => /^\s*([*\-•]|\d+\.)\s+/.test(l));
    if (isList) {
      const items = lines.map(l => l.replace(/^\s*([*\-•]|\d+\.)\s+/, ''));
      out.push(
        <ul key={`l-${pi}`} className="list-disc list-inside space-y-1 text-gray-300 text-sm leading-relaxed mb-3 marker:text-emerald-500/60">
          {items.map((li, ii) => <li key={ii}>{inline(li, `${pi}-${ii}`)}</li>)}
        </ul>
      );
    } else {
      const looksLikeHeader = /^\*\*[^*]+:\*\*$/.test(p.trim()) || /^#{1,4}\s/.test(p.trim());
      if (looksLikeHeader) {
        const cleaned = p.replace(/^#{1,4}\s+/, '').replace(/^\*\*([^*]+):\*\*$/, '$1');
        out.push(<h4 key={`h-${pi}`} className="text-sm font-bold text-emerald-200 uppercase tracking-wider mt-3 mb-1.5">{cleaned}</h4>);
      } else {
        out.push(<p key={`p-${pi}`} className="text-gray-300 text-sm leading-relaxed mb-3 whitespace-pre-wrap">{inline(p, `${pi}`)}</p>);
      }
    }
  });
  return out;
}

// --- Live status pill --------------------------------------------------------
const LiveStatus: React.FC<{ active: ClawCallEvent | null; last: ClawCallEvent | null; loading: boolean }> = ({ active, last, loading }) => {
  if (active) {
    const u = (active.args?.url as string) || '';
    const host = u ? hostOf(u) : '';
    return (
      <div className="flex-shrink-0 px-3 py-2 rounded-lg bg-gradient-to-br from-emerald-600/40 to-teal-600/40 border border-emerald-400/50 shadow-lg shadow-emerald-500/30 min-w-[200px]">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
          </span>
          <span className="text-[11px] text-emerald-100 font-bold uppercase tracking-wider">Researching live</span>
        </div>
        <p className="text-xs text-emerald-50 font-mono truncate">{active.tool}{host ? ` → ${host}` : ''}</p>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex-shrink-0 px-3 py-2 rounded-lg bg-gradient-to-br from-blue-600/30 to-cyan-600/30 border border-blue-400/40 shadow-lg min-w-[200px]">
        <div className="flex items-center gap-2 mb-0.5">
          <Loader2 className="w-3 h-3 text-blue-300 animate-spin" />
          <span className="text-[11px] text-blue-200 font-bold uppercase tracking-wider">Synthesizing</span>
        </div>
        <p className="text-xs text-blue-50/80">Building answer…</p>
      </div>
    );
  }
  if (last) {
    const ok = last.status === 'ok';
    const u = (last.args?.url as string) || '';
    const host = u ? hostOf(u) : '';
    return (
      <div className={`flex-shrink-0 px-3 py-2 rounded-lg border min-w-[200px] ${ok ? 'bg-slate-800/60 border-slate-700' : 'bg-amber-950/40 border-amber-700/40'}`}>
        <div className="flex items-center gap-2 mb-0.5">
          {ok ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <AlertCircle className="w-3 h-3 text-amber-400" />}
          <span className={`text-[11px] font-bold uppercase tracking-wider ${ok ? 'text-emerald-300' : 'text-amber-300'}`}>{ok ? 'Last call · ok' : 'Last call · issue'}</span>
        </div>
        <p className="text-xs text-gray-300 font-mono truncate">{last.tool}{host ? ` → ${host}` : ''}</p>
      </div>
    );
  }
  return (
    <div className="flex-shrink-0 px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700 min-w-[200px]">
      <div className="flex items-center gap-2 mb-0.5">
        <div className="w-2 h-2 rounded-full bg-slate-500" />
        <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Idle</span>
      </div>
      <p className="text-xs text-slate-500">Awaiting question</p>
    </div>
  );
};

// --- Snapshot card -----------------------------------------------------------
interface SnapshotShape {
  front?: KnowledgeFact; side?: KnowledgeFact; rear?: KnowledgeFact;
  height?: KnowledgeFact; area?: KnowledgeFact; cov?: KnowledgeFact;
  uses: string[]; sources: string[]; hasAnything: boolean;
}

const StatTile: React.FC<{ label: string; value: React.ReactNode; units?: string; icon: React.ReactNode; accent: string; source?: string }> = ({ label, value, units, icon, accent, source }) => (
  <div className={`relative rounded-xl border ${accent} bg-gradient-to-br from-slate-900/80 to-slate-950 p-4 overflow-hidden group hover:border-opacity-80 transition`}>
    <div className="flex items-start justify-between mb-2">
      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</span>
      <div className="opacity-60 group-hover:opacity-100 transition">{icon}</div>
    </div>
    <div className="flex items-baseline gap-1.5">
      <span className="text-2xl font-bold text-white tabular-nums">{value}</span>
      {units && <span className="text-xs text-gray-400 font-medium">{units}</span>}
    </div>
    {source && (
      <a href={source} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-0.5 text-[10px] text-emerald-400/70 hover:text-emerald-300 truncate max-w-full">
        <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" /><span className="truncate">{hostOf(source)}</span>
      </a>
    )}
  </div>
);

const SnapshotCard: React.FC<{ snapshot: SnapshotShape }> = ({ snapshot }) => (
  <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 border border-emerald-800/40 shadow-2xl overflow-hidden">
    <div className="px-5 py-3 border-b border-emerald-800/30 bg-emerald-950/30 flex items-center gap-2">
      <ShieldCheck className="w-4 h-4 text-emerald-400" />
      <h3 className="text-sm font-bold text-white uppercase tracking-wider">Project Zoning Snapshot</h3>
      <span className="text-[11px] text-emerald-300/70 hidden sm:inline">auto-pinned from verified research</span>
    </div>
    <div className="p-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {snapshot.front && <StatTile label="Front Setback" value={String(snapshot.front.value)} units={snapshot.front.units} icon={<Ruler className="w-4 h-4 text-emerald-400" />} accent="border-emerald-700/40" source={snapshot.front.source as string} />}
      {snapshot.side && <StatTile label="Side Setback" value={String(snapshot.side.value)} units={snapshot.side.units} icon={<Ruler className="w-4 h-4 text-emerald-400" />} accent="border-emerald-700/40" source={snapshot.side.source as string} />}
      {snapshot.rear && <StatTile label="Rear Setback" value={String(snapshot.rear.value)} units={snapshot.rear.units} icon={<Ruler className="w-4 h-4 text-emerald-400" />} accent="border-emerald-700/40" source={snapshot.rear.source as string} />}
      {snapshot.height && <StatTile label="Max Height" value={String(snapshot.height.value)} units={snapshot.height.units} icon={<Maximize2 className="w-4 h-4 text-amber-400" />} accent="border-amber-700/40" source={snapshot.height.source as string} />}
      {snapshot.area && <StatTile label="Min Lot Area" value={String(snapshot.area.value)} units={snapshot.area.units} icon={<Layers className="w-4 h-4 text-teal-400" />} accent="border-teal-700/40" source={snapshot.area.source as string} />}
      {snapshot.cov && <StatTile label="Lot Coverage" value={String(snapshot.cov.value)} units={snapshot.cov.units} icon={<Maximize2 className="w-4 h-4 text-cyan-400" />} accent="border-cyan-700/40" source={snapshot.cov.source as string} />}
    </div>
    {snapshot.uses.length > 0 && (
      <div className="px-5 pb-4 border-t border-slate-800 pt-4">
        <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 mb-2">Permitted Uses</div>
        <div className="flex flex-wrap gap-1.5">
          {snapshot.uses.map((u, i) => (
            <span key={i} className="px-2 py-1 rounded-md bg-slate-800 border border-slate-700 text-xs text-gray-200">{u}</span>
          ))}
        </div>
      </div>
    )}
    {snapshot.sources.length > 0 && (
      <div className="px-5 pb-4 pt-3 border-t border-slate-800">
        <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 mb-2">Sources</div>
        <div className="flex flex-wrap gap-2">
          {snapshot.sources.map((s, i) => (
            <a key={i} href={s} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-950/40 border border-emerald-800/40 text-xs text-emerald-300 hover:bg-emerald-900/40 hover:border-emerald-700">
              <ExternalLink className="w-3 h-3" /> {hostOf(s)}
            </a>
          ))}
        </div>
      </div>
    )}
  </div>
);

const EmptySnapshot: React.FC<{ loading: boolean }> = ({ loading }) => (
  <div className="rounded-2xl border border-dashed border-emerald-800/40 bg-emerald-950/10 p-6 text-center">
    {loading ? (
      <>
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mx-auto mb-2" />
        <p className="text-emerald-200 text-sm font-medium">Researching live ordinance…</p>
        <p className="text-gray-500 text-xs mt-1">Facts will populate here as the agent verifies them.</p>
      </>
    ) : (
      <>
        <ShieldCheck className="w-8 h-8 text-emerald-700 mx-auto mb-2" />
        <p className="text-emerald-300 text-sm font-medium">No verified facts yet for this jurisdiction.</p>
        <p className="text-gray-500 text-xs mt-1">Ask about setbacks, permitted uses, height, or lot coverage to populate the snapshot.</p>
      </>
    )}
  </div>
);

// --- Per-question card -------------------------------------------------------
const TurnCard: React.FC<{ turn: ResearchTurn; index: number }> = ({ turn, index }) => {
  const [expanded, setExpanded] = useState(true);
  const longBody = turn.a.length > 800;
  const [showAll, setShowAll] = useState(false);
  const visibleBody = !showAll && longBody ? turn.a.slice(0, 800).replace(/\s+\S*$/, '') + '…' : turn.a;
  const hasHighlights = turn.citations.length > 0 || turn.numbers.length > 0 || turn.uses.length > 0 || turn.urls.length > 0;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur overflow-hidden shadow-lg hover:border-slate-700 transition-colors">
      <button onClick={() => setExpanded(e => !e)} className="w-full flex items-start gap-3 px-5 py-4 hover:bg-slate-800/30 text-left transition-colors">
        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-center mt-0.5">{index + 1}</span>
        <span className="flex-1 text-sm font-medium text-white leading-snug">{turn.q}</span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {turn.loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
              <span className="text-[11px] text-emerald-300 font-semibold uppercase tracking-wider hidden sm:inline">Searching</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[11px] text-emerald-300 font-semibold uppercase tracking-wider hidden sm:inline">Verified</span>
            </>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 pt-2 space-y-4">
          {hasHighlights && (
            <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3 space-y-3">
              {turn.numbers.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 mb-1.5">Key Values</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {turn.numbers.map((n, i) => (
                      <div key={i} className="rounded-md bg-slate-900 border border-slate-800 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wider text-gray-500">{n.label}</div>
                        <div className="text-sm font-bold text-white tabular-nums">{n.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {turn.citations.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 mb-1.5">Citations</div>
                  <div className="flex flex-wrap gap-1.5">
                    {turn.citations.map((c, i) => (
                      <span key={i} className="px-2 py-1 rounded bg-blue-500/10 border border-blue-500/40 text-blue-300 font-mono text-xs">{c}</span>
                    ))}
                  </div>
                </div>
              )}
              {turn.uses.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 mb-1.5">Permitted Uses</div>
                  <div className="flex flex-wrap gap-1.5">
                    {turn.uses.map((u, i) => (
                      <span key={i} className="px-2 py-1 rounded-md bg-slate-800 border border-slate-700 text-xs text-gray-200">{u}</span>
                    ))}
                  </div>
                </div>
              )}
              {turn.urls.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 mb-1.5">Sources</div>
                  <div className="flex flex-wrap gap-2">
                    {turn.urls.map((s, i) => (
                      <a key={i} href={s} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-950/40 border border-emerald-800/40 text-xs text-emerald-300 hover:bg-emerald-900/40 hover:border-emerald-700">
                        <ExternalLink className="w-3 h-3" /> {hostOf(s)}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {turn.loading && !turn.a ? (
            <div className="flex items-center gap-2 text-emerald-300/80 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Live research in progress — see Claw status badge for current tool.</span>
            </div>
          ) : turn.a ? (
            <div>
              {renderRich(visibleBody)}
              {longBody && (
                <button onClick={() => setShowAll(s => !s)} className="text-xs text-emerald-400 hover:text-emerald-300 font-medium mt-1">
                  {showAll ? '— Show less' : '+ Show full answer'}
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-500 italic">Answer pending — see chat panel.</p>
          )}
        </div>
      )}
    </div>
  );
};

const SourcePolicyFooter: React.FC = () => (
  <div className="mt-6 pt-4 border-t border-slate-800/60 text-center">
    <button onClick={() => openSourcePolicyExplainer()} className="text-xs text-gray-500 hover:text-emerald-300 inline-flex items-center gap-1.5 transition-colors">
      <ShieldCheck className="w-3 h-3" /> How we source data — permissive-only policy
    </button>
  </div>
);

// --- Main panel --------------------------------------------------------------
const ZoningResultsPanel: React.FC<Props> = ({ chatHistory, place, county, state, district, onAskQuestion, onSelectDistrict }) => {
  const turns = useMemo(() => buildTurns(chatHistory), [chatHistory]);
  const lastTurn = turns[turns.length - 1];

  const [activeCall, setActiveCall] = useState<ClawCallEvent | null>(null);
  const [lastDone, setLastDone] = useState<ClawCallEvent | null>(null);
  useEffect(() => subscribeClawEvents(evt => {
    if (evt.status === 'running') setActiveCall(evt);
    else {
      setActiveCall(prev => (prev && prev.id === evt.id ? null : prev));
      setLastDone(evt);
    }
  }), []);

  const [facts, setFacts] = useState<KnowledgeFact[]>(() => knowledgeBase.queryFacts({ category: 'zoning.requirements' }));
  useEffect(() => knowledgeBase.onChange(() => setFacts(knowledgeBase.queryFacts({ category: 'zoning.requirements' }))), []);

  // Subscribe to the silent bootstrap status bus so we can show stage-by-stage
  // progress in the Map & Districts card instead of an opaque spinner.
  const [bootstrap, setBootstrap] = useState<BootstrapStatus | null>(null);
  useEffect(() => subscribeBootstrap(s => setBootstrap(s)), []);

  const projectFacts = useMemo(() => {
    // Subjects are pinned as `${muni}|${county}|${state}`. The municipality is
    // the only unique key — county+state are shared by every town in the
    // county, so matching on those would leak (e.g. a Pennsburg map showing up
    // under neighboring Green Lane, both in Montgomery County PA). Gate on the
    // place when we have one; only fall back to county/state when place is
    // absent.
    const placeKey = place ? (place as string).toLowerCase().trim() : '';
    const fallbackKeys = [county, state].filter(Boolean).map(s => (s as string).toLowerCase());
    if (!placeKey && fallbackKeys.length === 0) return facts;
    return facts.filter(f => {
      const s = f.subject.toLowerCase();
      if (placeKey) return s.includes(placeKey);
      return fallbackKeys.every(k => s.includes(k));
    });
  }, [facts, place, county, state]);

  const snapshot: SnapshotShape = useMemo(() => {
    const get = (pred: string) => projectFacts.find(f => f.predicate.toLowerCase() === pred.toLowerCase());
    const front = get('setbackFront');
    const side = get('setbackSide');
    const rear = get('setbackRear');
    const height = get('maxHeight');
    const area = get('minLotArea');
    const cov = get('lotCoverage');
    const usesFact = get('permittedUses');
    const srcFact = get('sources');
    const normUse = (u: any): string => {
      if (typeof u === 'string') return u;
      if (u && typeof u === 'object') return String(u.use ?? u.name ?? u.label ?? u.description ?? Object.values(u)[0] ?? '').trim();
      return String(u ?? '').trim();
    };
    const uses = Array.isArray(usesFact?.value) ? (usesFact!.value as any[]).map(normUse).filter(Boolean) : [];
    const sources = Array.isArray(srcFact?.value) ? (srcFact!.value as any[]).map(String).filter(s => !isBlocklisted(s)) : [];
    return {
      front, side, rear, height, area, cov, uses, sources,
      hasAnything: !!(front || side || rear || height || area || cov || uses.length || sources.length),
    };
  }, [projectFacts]);

  // ---- Map + districts (populated by the silent bootstrap query) -----------
  const mapInfo = useMemo(() => {
    const get = (pred: string) => projectFacts.find(f => f.predicate.toLowerCase() === pred.toLowerCase());
    const mapUrl = get('zoningMapUrl');
    const mapImg = get('zoningMapImage');
    const mapCt = get('zoningMapContentType');
    const mapKindFact = get('zoningMapKind');
    const frameEmbFact = get('zoningMapFrameEmbeddable');
    const summaryFact = get('zoningResearchSummary');
    const districtsFact = get('zoningDistricts');
    const mapSources = get('zoningMapSources');
    const districts: DistrictEntry[] = Array.isArray(districtsFact?.value)
      ? (districtsFact!.value as any[]).map(d => {
          if (typeof d === 'string') return { code: d };
          if (d && typeof d === 'object') return { code: String((d as any).code ?? ''), name: (d as any).name ? String((d as any).name) : undefined };
          return { code: '' };
        }).filter(d => d.code)
      : [];
    return {
      mapUrl: typeof mapUrl?.value === 'string' ? mapUrl!.value as string : undefined,
      mapImg: typeof mapImg?.value === 'string' ? mapImg!.value as string : undefined,
      mapIsPdf: typeof mapCt?.value === 'string' ? /pdf/i.test(mapCt!.value as string) : false,
      mapKind: typeof mapKindFact?.value === 'string' ? mapKindFact!.value as string : undefined,
      mapFrameEmbeddable: typeof frameEmbFact?.value === 'boolean' ? frameEmbFact!.value as boolean : undefined,
      summary: (summaryFact && summaryFact.value && typeof summaryFact.value === 'object') ? summaryFact.value as ResearchSummary : null,
      districts,
      sources: Array.isArray(mapSources?.value) ? (mapSources!.value as any[]).map(String) : [],
      hasAnything: !!(mapUrl || mapImg || districts.length),
    };
  }, [projectFacts]);

  return (
    <div className="h-full w-full flex flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-auto" id="zoning-results-area">
      <div className="sticky top-0 z-10 bg-gradient-to-br from-emerald-950/95 via-slate-900/95 to-teal-950/95 backdrop-blur-md border-b border-emerald-800/60 shadow-2xl">
        <div className="px-6 py-4">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <Building2 className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h2 className="text-xl font-bold text-white tracking-tight">Zoning Research</h2>
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/40 text-[10px] text-emerald-200 font-bold uppercase tracking-wider">CACP</span>
                <span className="px-2 py-0.5 rounded-md bg-blue-500/20 border border-blue-400/40 text-[10px] text-blue-200 font-bold uppercase tracking-wider flex items-center gap-1">
                  <Search className="w-2.5 h-2.5" /> Google Search
                </span>
                <span className="px-2 py-0.5 rounded-md bg-purple-500/20 border border-purple-400/40 text-[10px] text-purple-200 font-bold uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" /> Live Claw
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-100/90 text-sm flex-wrap">
                <MapPin className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                {place && <span className="font-semibold">{place}</span>}
                {county && <><span className="text-emerald-700">·</span><span>{county} County</span></>}
                {state && <><span className="text-emerald-700">·</span><span>{state}</span></>}
                {district && (
                  <span className="ml-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/40 text-amber-200 text-[11px] font-semibold">
                    {district}
                  </span>
                )}
              </div>
            </div>
            <LiveStatus active={activeCall} last={lastDone} loading={!!lastTurn?.loading} />
          </div>
        </div>
      </div>

      {/* Body fills the full visual panel area (whatever width is left between
            the agents sidebar and the chat panel). No max-width \u2014 the cards
            stretch edge-to-edge so there is no leftover empty space to make the
            layout look off-center. */}
      <div className="flex-1 w-full min-h-0">
        <div className="w-full px-6 py-5 space-y-5">
        <ZoningMapDistrictsCard
          info={mapInfo}
          place={place}
          loading={!!lastTurn?.loading || !!activeCall}
          onAskQuestion={onAskQuestion}
          onSelectDistrict={onSelectDistrict}
          bootstrap={bootstrap}
        />
        {mapInfo.summary && <ResearchSummaryCard summary={mapInfo.summary} />}
        {/* Requirement snapshot is district-specific — only show it once a
            district is actually selected (clicking a chip or asking a
            district-specific question both set it). The Research Timeline of
            Q&A turns can surface independently so typed questions are visible. */}
        {district ? (
          <>
            {snapshot.hasAnything ? <SnapshotCard snapshot={snapshot} /> : <EmptySnapshot loading={!!lastTurn?.loading} />}

            {turns.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <BookOpen className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Research Timeline</h3>
                  <span className="text-xs text-gray-500">· {turns.length} question{turns.length === 1 ? '' : 's'}</span>
                </div>
                {turns.map((t, idx) => <TurnCard key={idx} turn={t} index={idx} />)}
              </div>
            )}

            {turns.length === 0 && !snapshot.hasAnything && (
              <div className="rounded-xl border border-emerald-700/30 bg-emerald-950/20 p-8 text-center">
                <Search className="w-10 h-10 text-emerald-500/60 mx-auto mb-3" />
                <p className="text-emerald-100 text-sm mb-1">Ready to research <span className="font-semibold text-amber-200">{district}</span>.</p>
                <p className="text-gray-500 text-xs">Ask in the chat about setbacks, permitted uses, height limits, lot coverage…</p>
              </div>
            )}
          </>
        ) : turns.length > 0 ? (
          /* No district selected yet, but the user has asked general questions —
             show the Q&A timeline without the district-specific snapshot. */
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <BookOpen className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Research Timeline</h3>
              <span className="text-xs text-gray-500">· {turns.length} question{turns.length === 1 ? '' : 's'}</span>
            </div>
            {turns.map((t, idx) => <TurnCard key={idx} turn={t} index={idx} />)}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-amber-700/40 bg-amber-950/10 p-8 text-center">
            <Layers className="w-10 h-10 text-amber-500/60 mx-auto mb-3" />
            <p className="text-amber-100 text-sm font-semibold mb-1">Select a zoning district above to begin.</p>
            <p className="text-gray-500 text-xs">Setbacks, permitted uses, height, and lot coverage are district-specific — pick one to see its requirements.</p>
          </div>
        )}

        <SourcePolicyFooter />
        </div>
      </div>
    </div>
  );
};

export default ZoningResultsPanel;

// ---------------------------------------------------------------------------
// Zoning Map & Districts card — populated by the silent bootstrap query that
// runs as soon as the jurisdiction is loaded. Renders an empty/loading skeleton
// until the KnowledgeBase facts appear, then shows the map preview/link on the
// left and clickable district chips on the right.
// ---------------------------------------------------------------------------
interface MapInfo {
  mapUrl?: string;
  mapImg?: string;
  mapIsPdf?: boolean;
  mapKind?: string;
  /** Whether the GIS viewer host permits third-party iframing (from the probe). */
  mapFrameEmbeddable?: boolean;
  summary?: ResearchSummary | null;
  districts: DistrictEntry[];
  sources: string[];
  hasAnything: boolean;
}

// ---------------------------------------------------------------------------
// PDF map preview — renders page 1 of the official zoning-map PDF to a canvas
// with pdf.js and shows it as an inline image. This replaces the old
// <object type="application/pdf"> embed, which silently fell back to "PDF
// preview unavailable" in browsers/webviews without a native PDF plugin.
// ---------------------------------------------------------------------------
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  // Use the locally bundled worker asset so preview rendering works without
  // third-party worker hosts and respects strict CSP deployments.
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}
const _pdfPreviewCache = new Map<string, string>(); // url → rendered data URL

const PdfMapPreview: React.FC<{ url: string; place?: string }> = ({ url, place }) => {
  const cached = _pdfPreviewCache.get(url) || null;
  const [img, setImg] = useState<string | null>(cached);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>(cached ? 'ready' : 'loading');

  useEffect(() => {
    const hit = _pdfPreviewCache.get(url);
    if (hit) { setImg(hit); setState('ready'); return; }
    let cancelled = false;
    (async () => {
      try {
        setState('loading');
        const src = proxiedUrl(url) || url;
        const r = await fetch(src, { signal: AbortSignal.timeout(45_000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const buf = await r.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        try {
          const pg = await pdf.getPage(1);
          const base = pg.getViewport({ scale: 1 });
          // Render sharp enough to read the district legend, capped for memory.
          const scale = Math.min(3, Math.max(1, 2400 / Math.max(base.width, base.height)));
          const vp = pg.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(vp.width);
          canvas.height = Math.ceil(vp.height);
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('no 2d context');
          await pg.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
          const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
          _pdfPreviewCache.set(url, dataUrl);
          if (!cancelled) { setImg(dataUrl); setState('ready'); }
        } finally {
          try { await pdf.destroy(); } catch { /* ignore */ }
        }
      } catch (e) {
        console.warn('[Zoning] pdf.js map preview failed:', e);
        if (!cancelled) setState('failed');
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  if (state === 'failed') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4 text-center">
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-cyan-500/15 border border-cyan-400/40">
          <ImageIcon className="w-7 h-7 text-cyan-300" />
        </div>
        <p className="text-xs text-gray-300">PDF preview unavailable.</p>
        <p className="text-[10px] text-gray-500">Use the button below to open it in a new tab.</p>
      </div>
    );
  }
  if (state === 'loading') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4 text-center">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-cyan-500/30 blur-lg animate-pulse" />
          <Loader2 className="relative w-10 h-10 text-cyan-300 animate-spin" />
        </div>
        <p className="text-xs font-medium text-cyan-100">Rendering the zoning map…</p>
        <p className="text-[10px] text-gray-500">Drawing the official PDF in-app.</p>
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block group relative w-full h-full" title="Open the official zoning map PDF">
      <img
        src={img!}
        alt={`${place || 'Municipality'} zoning map (PDF page 1)`}
        className="w-full h-full object-contain bg-white"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="inline-flex items-center gap-1 text-[10px] text-white bg-slate-900/80 px-2 py-1 rounded-md border border-cyan-400/40">
          <ExternalLink className="w-3 h-3" /> Open full PDF
        </span>
      </div>
    </a>
  );
};

// ---------------------------------------------------------------------------
// Claw screenshot preview — fallback for GIS viewers that block iframing and
// aren't ArcGIS MapServer-backed. The Claw's headless browser (in its own
// isolated session, so it never disturbs the agent's browsing state) loads
// the live viewer and captures a retina-resolution snapshot that we show
// in-app with a click-through to the live map.
// ---------------------------------------------------------------------------
const _previewCache = new Map<string, string>(); // url → data URL

const ClawMapPreview: React.FC<{ url: string; place?: string }> = ({ url, place }) => {
  const cached = _previewCache.get(url) || null;
  const [img, setImg] = useState<string | null>(cached);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>(cached ? 'ready' : 'loading');

  useEffect(() => {
    const hit = _previewCache.get(url);
    if (hit) { setImg(hit); setState('ready'); return; }
    let cancelled = false;
    (async () => {
      try {
        setState('loading');
        // Isolated auxiliary session — must never clobber the agent's page.
        const session = `pv${getClawSessionId()}`.slice(0, 64);
        await callClawTool('navigate', { url, wait_until: 'networkidle' }, { session });
        const shot = await callClawTool('screenshot', { full_page: false }, { session });
        const part = shot.content.find(p => p.type === 'image') as { mimeType?: string; data?: string } | undefined;
        if (!part?.data) throw new Error('no image content');
        const dataUrl = `data:${part.mimeType || 'image/png'};base64,${part.data}`;
        _previewCache.set(url, dataUrl);
        if (!cancelled) { setImg(dataUrl); setState('ready'); }
      } catch {
        if (!cancelled) setState('failed');
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  if (state === 'failed') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4 text-center">
        <MapPin className="w-10 h-10 text-gray-600" />
        <p className="text-xs text-gray-300">Live preview unavailable — the viewer blocks embedding and the snapshot failed.</p>
        <p className="text-[10px] text-gray-500">Use the button below to open the interactive map.</p>
      </div>
    );
  }
  if (state === 'loading') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4 text-center">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-cyan-500/30 blur-lg animate-pulse" />
          <Loader2 className="relative w-10 h-10 text-cyan-300 animate-spin" />
        </div>
        <p className="text-xs font-medium text-cyan-100">Capturing the live GIS map…</p>
        <p className="text-[10px] text-gray-500">The Claw is loading the viewer and taking a high-resolution snapshot.</p>
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block group relative w-full h-full" title="Open the live interactive map">
      <img
        src={img!}
        alt={`${place || 'Municipality'} zoning map (live snapshot)`}
        className="w-full h-full object-cover object-top"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="inline-flex items-center gap-1 text-[10px] text-white bg-slate-900/80 px-2 py-1 rounded-md border border-cyan-400/40">
          <ExternalLink className="w-3 h-3" /> Open live interactive map
        </span>
      </div>
      <div className="absolute top-0 inset-x-0 px-2 py-1 text-[9px] text-gray-200 bg-slate-950/60 backdrop-blur-sm text-center pointer-events-none">
        Live snapshot of the official GIS viewer — click to interact
      </div>
    </a>
  );
};

const ZoningMapDistrictsCard: React.FC<{
  info: MapInfo;
  place?: string;
  loading: boolean;
  onAskQuestion?: (q: string) => void;
  onSelectDistrict?: (code: string) => void;
  bootstrap: BootstrapStatus | null;
}> = ({ info, place, loading, onAskQuestion, onSelectDistrict, bootstrap }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState<number | null>(null);
  // Native ArcGIS render can fail at runtime (CORS, export disabled) — when
  // it does we fall back to the Claw screenshot preview.
  const [nativeFailed, setNativeFailed] = useState(false);
  // Tick once a second so the elapsed-time display in the progress strip
  // stays current while the bootstrap is running.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!bootstrap || bootstrap.stage === 'idle' || bootstrap.stage === 'done' || bootstrap.stage === 'failed') return;
    const id = window.setInterval(() => setTick(t => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [bootstrap?.stage]);

  // Reset dismissal when a fresh bootstrap run begins, so the next completion
  // banner shows up again.
  useEffect(() => {
    if (bootstrap?.stage === 'starting') setBannerDismissed(null);
  }, [bootstrap?.startedAt, bootstrap?.stage]);

  const isBootstrapActive = !!bootstrap && bootstrap.stage !== 'idle' && bootstrap.stage !== 'done' && bootstrap.stage !== 'failed';
  const elapsedSec = bootstrap && bootstrap.startedAt ? Math.max(0, Math.floor((Date.now() - bootstrap.startedAt) / 1000)) : 0;

  // ---- Fulfillment check ("did we get what we asked for?") ----------------
  const fulfillment = useMemo(() => {
    // A "preview" exists whenever the panel can render the map inline — that's
    // a raster image, an embeddable PDF (the proxied <object>), or an
    // interactive GIS viewer (best-effort iframe). The old check counted only
    // a raster zoningMapImage, so a perfectly-rendered PDF map wrongly showed
    // "Preview image ✗".
    const hasPreview = !!info.mapImg || isPdfUrl(info.mapUrl) || isPdfUrl(info.mapImg) || info.mapIsPdf || info.mapKind === 'gis';
    const checks = [
      { key: 'mapUrl',     label: 'Official map URL',  ok: !!info.mapUrl },
      { key: 'mapImage',   label: 'Map preview',       ok: hasPreview },
      { key: 'districts',  label: `District list${info.districts.length ? ` (${info.districts.length})` : ''}`, ok: info.districts.length > 0 },
      { key: 'sources',    label: `Sources${info.sources.length ? ` (${info.sources.length})` : ''}`, ok: info.sources.length > 0 },
    ];
    const found = checks.filter(c => c.ok).length;
    const missing = checks.filter(c => !c.ok);
    return {
      checks,
      found,
      total: checks.length,
      missing,
      tone: found === checks.length ? 'success'
          : found >= 2              ? 'partial'
          : found >= 1              ? 'minimal'
          :                           'empty',
    } as const;
  }, [info]);

  const showBanner = bootstrap?.stage === 'done' && bannerDismissed !== bootstrap.startedAt;
  const showFailureBanner = bootstrap?.stage === 'failed' && bannerDismissed !== bootstrap.startedAt;

  // Don't render anything until we know there's something to show OR research
  // is actively running OR it just finished and we have a status to display.
  if (!info.hasAnything && !loading && !isBootstrapActive && !showBanner && !showFailureBanner) return null;

  const askDistrict = (d: DistrictEntry) => {
    if (!onAskQuestion) return;
    // Select the district first so the summary area switches to its snapshot
    // and the header reflects the active district.
    onSelectDistrict?.(d.code);
    const q = d.name
      ? `Tell me about the ${d.code} (${d.name}) zoning district — permitted uses, setbacks, height limit, and lot coverage. Cite the section number(s).`
      : `Tell me about the ${d.code} zoning district — permitted uses, setbacks, height limit, and lot coverage. Cite the section number(s).`;
    onAskQuestion(q);
  };

  return (
    <div className="relative rounded-2xl border border-emerald-700/40 bg-gradient-to-br from-emerald-950/40 via-slate-900/50 to-teal-950/30 shadow-xl shadow-emerald-950/30 overflow-hidden animate-fade-in-up">
      {/* Accent stripe down the left edge */}
      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-emerald-400 via-teal-400 to-cyan-500" />

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-emerald-800/40 bg-gradient-to-r from-emerald-900/30 via-slate-900/40 to-transparent">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500/30 to-teal-500/30 border border-emerald-400/40">
          <Layers className="w-4 h-4 text-emerald-300" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-white tracking-wide">Zoning Map & Districts</h3>
          <p className="text-[10px] text-emerald-300/70 uppercase tracking-wider">Auto-research • background bootstrap</p>
        </div>
        {bootstrap?.stage === 'done' && fulfillment.found > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-200 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/40">
            <CheckCircle2 className="w-3.5 h-3.5" /> Ready{elapsedSec > 0 && <span className="text-emerald-400/60 font-mono"> · {elapsedSec}s</span>}
          </span>
        )}
        {isBootstrapActive && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-sky-200 px-2.5 py-1 rounded-full bg-sky-500/15 border border-sky-400/40">
            <Loader2 className="w-3 h-3 animate-spin" /> Running{elapsedSec > 0 && <span className="text-sky-400/60 font-mono"> · {elapsedSec}s</span>}
          </span>
        )}
      </div>

      {/* Active progress strip with stepped indicator */}
      {isBootstrapActive && bootstrap && (
        <BootstrapProgressStrip bootstrap={bootstrap} elapsedSec={elapsedSec} />
      )}

      {/* Completion banner — fulfillment summary */}
      {showBanner && bootstrap && (
        <CompletionBanner
          fulfillment={fulfillment}
          elapsedSec={elapsedSec}
          onDismiss={() => setBannerDismissed(bootstrap.startedAt)}
        />
      )}

      {/* Failure banner */}
      {showFailureBanner && bootstrap && (
        <div className="flex items-start gap-3 px-5 py-3 border-b border-rose-700/40 bg-gradient-to-r from-rose-900/30 via-rose-950/20 to-transparent">
          <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-rose-200">Auto-research couldn’t complete</p>
            <p className="text-[11px] text-rose-300/80 mt-0.5">{bootstrap.detail || bootstrap.message}</p>
            <p className="text-[11px] text-gray-400 mt-1">You can still ask the agent directly in the chat — try “What are the zoning districts in {place || 'this municipality'}?”</p>
          </div>
          <button onClick={() => setBannerDismissed(bootstrap.startedAt)} className="text-rose-300/60 hover:text-rose-200 transition" aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main content. Layout adapts to what the bootstrap actually returned:
            \u2022 While research is in progress AND neither side has data yet:
              2-col grid with both placeholders so the user sees both queries
              running.
            \u2022 As soon as one side has data, the empty side is dropped and
              the populated side renders full width \u2014 even if bootstrap is
              still working. This keeps the card visually centered. */}
      {(() => {
        const hasMap        = !!(info.mapUrl || info.mapImg);
        const hasDistricts  = info.districts.length > 0;
        const showMap       = hasMap       || (isBootstrapActive && !hasDistricts);
        const showDistricts = hasDistricts || (isBootstrapActive && !hasMap);
        const useTwoCols    = showMap && showDistricts;
        const gridClass = useTwoCols ? 'grid grid-cols-1 md:grid-cols-2 gap-5 p-5' : 'p-5';
        return (
      <div className={gridClass}>
        {showMap && (
        /* Map column \u2014 preview / link */
        <div className="min-w-0 space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-cyan-500/15 border border-cyan-400/40">
              <MapPin className="w-3.5 h-3.5 text-cyan-300" />
            </div>
            <span className="text-[11px] font-semibold text-cyan-200 uppercase tracking-wider">Zoning Map</span>
          </div>
          {(info.mapImg && !imgFailed) ? (
            <a href={info.mapUrl || info.mapImg} target="_blank" rel="noopener noreferrer" className="block group relative">
              <div className="rounded-xl overflow-hidden border border-cyan-700/40 bg-slate-900/40 aspect-[4/3] flex items-center justify-center shadow-inner">
                <img
                  src={info.mapImg}
                  alt={`${place || 'Municipality'} zoning map`}
                  className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-[1.03]"
                  onError={() => setImgFailed(true)}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="inline-flex items-center gap-1 text-[10px] text-white bg-slate-900/80 px-2 py-1 rounded-md border border-cyan-400/40">
                    <ExternalLink className="w-3 h-3" /> Open full size
                  </span>
                </div>
              </div>
            </a>
          ) : isPdfUrl(info.mapUrl) || isPdfUrl(info.mapImg) || info.mapIsPdf ? (
            <div className="rounded-xl overflow-hidden border border-cyan-700/40 bg-slate-900/40 aspect-[4/3] shadow-inner">
              <PdfMapPreview
                url={(isPdfUrl(info.mapUrl) ? info.mapUrl : isPdfUrl(info.mapImg) ? info.mapImg : (info.mapUrl || info.mapImg))!}
                place={place}
              />
            </div>
          ) : (info.mapKind === 'gis' && arcgisServiceOf(info.mapUrl) && !nativeFailed) ? (
            /* OPTION 1 — the map is backed by an ArcGIS MapServer: render the
               official zoning layers natively in-app (interactive, no iframe,
               no leaving the app). */
            <div className="rounded-xl overflow-hidden border border-cyan-700/40 bg-slate-900/40 aspect-[4/3] shadow-inner relative">
              <ArcGISZoningMap
                serviceUrl={arcgisServiceOf(info.mapUrl)!}
                title={`${place || 'Municipality'} zoning map`}
                onFailed={() => setNativeFailed(true)}
              />
            </div>
          ) : (info.mapKind === 'gis' && info.mapFrameEmbeddable === false && info.mapUrl) ? (
            /* OPTION 2 — viewer blocks iframing and isn't MapServer-backed:
               the Claw captures a retina-resolution snapshot of the live
               viewer, shown in-app with click-through to the real map. */
            <div className="rounded-xl overflow-hidden border border-cyan-700/40 bg-slate-900/40 aspect-[4/3] shadow-inner relative">
              <ClawMapPreview url={info.mapUrl} place={place} />
            </div>
          ) : (info.mapImg || info.mapUrl) ? (
            /* OPTION 3 — the host permits framing (or we don't know): embed
               the live viewer directly. */
            <div className="rounded-xl overflow-hidden border border-cyan-700/40 bg-slate-900/40 aspect-[4/3] shadow-inner relative">
              <iframe
                src={info.mapImg || info.mapUrl}
                title={`${place || 'Municipality'} zoning map`}
                className="w-full h-full bg-white"
                referrerPolicy="no-referrer"
                sandbox="allow-same-origin allow-scripts allow-popups"
                loading="lazy"
              />
              <div className="absolute bottom-0 inset-x-0 px-2 py-1 text-[10px] text-gray-300 bg-slate-950/70 backdrop-blur-sm border-t border-cyan-700/40 text-center pointer-events-none">
                If the preview is blank, the host blocks embedding — use the button below.
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-cyan-700/30 bg-gradient-to-br from-cyan-950/20 via-slate-900/40 to-slate-900/40 aspect-[4/3] flex flex-col items-center justify-center gap-3 p-4 text-center">
              {isBootstrapActive ? (
                <>
                  <div className="relative">
                    <div className="absolute inset-0 rounded-full bg-cyan-500/30 blur-lg animate-pulse" />
                    <Loader2 className="relative w-10 h-10 text-cyan-300 animate-spin" />
                  </div>
                  <p className="text-xs font-medium text-cyan-100">Searching for the official zoning map…</p>
                  <p className="text-[10px] text-gray-500">It will appear here as soon as it’s found.</p>
                </>
              ) : (
                <>
                  <MapPin className="w-10 h-10 text-gray-600" />
                  <p className="text-xs text-gray-500">No zoning map found yet.</p>
                </>
              )}
            </div>
          )}
          {info.mapUrl && (
            <a
              href={info.mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500/15 via-cyan-500/20 to-cyan-500/15 hover:from-cyan-500/25 hover:via-cyan-500/30 hover:to-cyan-500/25 border border-cyan-400/40 hover:border-cyan-300/70 text-cyan-100 text-xs font-semibold transition-all justify-center group"
            >
              <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              {info.mapKind === 'gis' ? 'Open interactive GIS zoning map' : 'Open official zoning map'}
            </a>
          )}
          {info.sources.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Sources</p>
              <div className="flex flex-wrap gap-1.5">
                {info.sources.slice(0, 6).map((s, i) => (
                  <a key={i} href={s} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-cyan-300 px-1.5 py-0.5 rounded bg-slate-800/40 hover:bg-slate-800/70 border border-slate-700/40 hover:border-cyan-400/40 transition truncate max-w-[180px]" title={s}>
                    <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                    <span className="truncate">{hostOf(s)}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
        )}

        {showDistricts && (
        /* Districts column */
        <div className="min-w-0 space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-violet-500/15 border border-violet-400/40">
              <Building2 className="w-3.5 h-3.5 text-violet-300" />
            </div>
            <span className="text-[11px] font-semibold text-violet-200 uppercase tracking-wider">Zoning Districts</span>
            {info.districts.length > 0 && (
              <span className="text-[10px] text-violet-300/70 font-mono px-1.5 py-0.5 rounded bg-violet-500/10 border border-violet-400/30">{info.districts.length}</span>
            )}
          </div>
          {info.districts.length === 0 ? (
            <div className="rounded-xl border border-violet-700/30 bg-gradient-to-br from-violet-950/20 via-slate-900/40 to-slate-900/40 aspect-[4/3] flex flex-col items-center justify-center gap-3 p-4 text-center">
              {isBootstrapActive ? (
                <>
                  <div className="relative">
                    <div className="absolute inset-0 rounded-full bg-violet-500/30 blur-lg animate-pulse" />
                    <Loader2 className="relative w-10 h-10 text-violet-300 animate-spin" />
                  </div>
                  <p className="text-xs font-medium text-violet-100">Compiling district list…</p>
                  <p className="text-[10px] text-gray-500">Districts will populate here automatically.</p>
                </>
              ) : (
                <>
                  <Building2 className="w-10 h-10 text-gray-600" />
                  <p className="text-xs text-gray-500">No districts found yet. Try asking the agent for the full list.</p>
                </>
              )}
            </div>
          ) : (
            <>
              {onAskQuestion && (
                <div className="rounded-lg border border-violet-500/50 bg-gradient-to-r from-violet-500/15 via-violet-500/10 to-fuchsia-500/15 px-3 py-2 flex items-center gap-2 shadow-sm shadow-violet-500/10">
                  <Sparkles className="w-4 h-4 text-violet-300 flex-shrink-0" />
                  <p className="text-xs text-violet-100 font-medium">
                    Click any zoning district below to research its rules and pin them to your project.
                  </p>
                </div>
              )}
              <div className={
                'grid gap-1.5 max-h-[340px] overflow-y-auto pr-1 custom-scroll '
                + (useTwoCols
                    ? 'grid-cols-2 sm:grid-cols-3'
                    : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6')
              }>
                {info.districts.map((d, i) => (
                  <button
                    key={`${d.code}-${i}`}
                    type="button"
                    onClick={() => askDistrict(d)}
                    disabled={!onAskQuestion}
                    className="group text-left rounded-lg border border-violet-700/30 hover:border-violet-400/70 hover:bg-violet-500/15 bg-gradient-to-br from-slate-900/60 to-slate-900/30 px-2.5 py-2 transition-all hover:shadow-md hover:shadow-violet-500/10 hover:-translate-y-0.5 disabled:cursor-default disabled:hover:translate-y-0 disabled:hover:shadow-none disabled:hover:border-violet-700/30 disabled:hover:bg-gradient-to-br"
                    title={onAskQuestion ? `Ask about ${d.code}` : undefined}
                  >
                    <div className="text-sm font-bold text-violet-200 group-hover:text-violet-100 truncate">{d.code}</div>
                    {d.name && (
                      <div className="text-[10px] text-gray-400 truncate group-hover:text-gray-200">{d.name}</div>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        )}
      </div>
        );
      })()}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Research Summary card — a plain-language record of what the auto-research
// actually found, rendered in the MAIN APP WINDOW (not chat) so the user never
// has to dig through transcript bubbles to learn whether the map & districts
// were located, where they came from, and what was rejected.
// ---------------------------------------------------------------------------
const SummaryChip: React.FC<{ ok: boolean; label: string }> = ({ ok, label }) => (
  <span className={
    'inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border '
    + (ok
        ? 'bg-emerald-500/10 border-emerald-400/40 text-emerald-200'
        : 'bg-slate-800/50 border-slate-600/50 text-gray-400')
  }>
    {ok ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" /> : <X className="w-3 h-3 flex-shrink-0" />}
    <span className="truncate max-w-[260px]">{label}</span>
  </span>
);

const ResearchSummaryCard: React.FC<{ summary: ResearchSummary }> = ({ summary }) => {
  const m = summary.map;
  const kindLabel = m?.kind === 'pdf' ? 'PDF' : m?.kind === 'gis' ? 'GIS viewer' : m?.kind === 'image' ? 'Image' : 'Link';
  const districtsOk = (summary.districtsCount ?? 0) > 0;
  return (
    <div className="relative rounded-2xl border border-sky-700/40 bg-gradient-to-br from-sky-950/30 via-slate-900/50 to-slate-950/40 shadow-lg shadow-sky-950/20 overflow-hidden animate-fade-in-up">
      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-sky-400 via-cyan-400 to-teal-500" />
      <div className="flex items-center gap-3 px-5 py-3 border-b border-sky-800/40 bg-gradient-to-r from-sky-900/30 via-slate-900/40 to-transparent">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-sky-500/20 border border-sky-400/40">
          <BookOpen className="w-4 h-4 text-sky-300" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-white tracking-wide">Research Summary</h3>
          <p className="text-[10px] text-sky-300/70 uppercase tracking-wider">
            What the auto-research found
            {summary.completedAt ? ` · ${new Date(summary.completedAt).toLocaleString()}` : ''}
          </p>
        </div>
        {typeof summary.candidatesVerified === 'number' && typeof summary.candidatesConsidered === 'number' && summary.candidatesConsidered > 0 && (
          <span className="text-[10px] font-mono text-sky-300/80 px-2 py-1 rounded-full bg-sky-500/10 border border-sky-400/30 flex-shrink-0">
            {summary.candidatesVerified}/{summary.candidatesConsidered} links verified
          </span>
        )}
      </div>
      <div className="px-5 py-4 space-y-3">
        {summary.narrative && (
          <p className="text-sm text-gray-200 leading-relaxed">{summary.narrative}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <SummaryChip
            ok={!!m}
            label={m ? `Map · ${kindLabel} · ${hostOf(m.url || '')}` : 'Map · not found'}
          />
          <SummaryChip
            ok={districtsOk}
            label={districtsOk
              ? `Districts · ${summary.districtsCount}${summary.districtsSource ? ` (from ${summary.districtsSource})` : ''}`
              : 'Districts · not found'}
          />
          <SummaryChip ok={(summary.sourceCount ?? 0) > 0} label={`Sources · ${summary.sourceCount ?? 0}`} />
          {m && m.muniMatched === false && (
            <SummaryChip ok={false} label="Municipality match unconfirmed — verify coverage" />
          )}
        </div>
        {summary.dropped && summary.dropped.length > 0 && (
          <div className="text-[11px] text-amber-300/80 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>Not used: {summary.dropped.join('; ')}</span>
          </div>
        )}
        <p className="text-[10px] text-gray-500">
          Verified via {summary.searchProvider === 'google-search' ? 'server-side Google search + reachability probe' : 'model grounding + reachability probe'}.
          {summary.jurisdiction ? ` Jurisdiction: ${summary.jurisdiction}.` : ''}
        </p>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Stepped progress strip — shows the four-stage pipeline (Search → Fetch →
// Parse → Save) with per-stage coloring so the user can see exactly where in
// the pipeline we are and how long each step has taken.
// ---------------------------------------------------------------------------
type StepKey = 'search' | 'fetch' | 'parse' | 'save';

const STEP_DEFS: Array<{ key: StepKey; label: string; icon: React.ComponentType<{ className?: string }>; accent: string; bg: string; border: string }> = [
  { key: 'search', label: 'Search', icon: Search,   accent: 'text-sky-200',     bg: 'from-sky-500/30 to-sky-600/20',         border: 'border-sky-400/60' },
  { key: 'fetch',  label: 'Fetch',  icon: Download, accent: 'text-amber-200',   bg: 'from-amber-500/30 to-orange-500/20',    border: 'border-amber-400/60' },
  { key: 'parse',  label: 'Parse',  icon: Braces,   accent: 'text-violet-200',  bg: 'from-violet-500/30 to-purple-500/20',   border: 'border-violet-400/60' },
  { key: 'save',   label: 'Save',   icon: Database, accent: 'text-emerald-200', bg: 'from-emerald-500/30 to-teal-500/20',    border: 'border-emerald-400/60' },
];

function stageToStepIndex(s: BootstrapStatus['stage']): number {
  switch (s) {
    case 'idle':
    case 'starting':
    case 'streaming':           return 0;
    case 'tool-call':
    case 'streaming-followup':  return 1;
    case 'parsing':             return 2;
    case 'pinning':             return 3;
    case 'done':                return 4;
    case 'failed':              return -1;
  }
}

const BootstrapProgressStrip: React.FC<{ bootstrap: BootstrapStatus; elapsedSec: number }> = ({ bootstrap, elapsedSec }) => {
  const activeIdx = stageToStepIndex(bootstrap.stage);
  const activeStep = STEP_DEFS[activeIdx] ?? STEP_DEFS[0];
  return (
    <div className="px-5 py-4 border-b border-emerald-800/30 bg-gradient-to-r from-slate-950/60 via-slate-900/40 to-slate-950/60">
      {/* Step indicator row */}
      <div className="flex items-center gap-1.5">
        {STEP_DEFS.map((step, i) => {
          const Icon = step.icon;
          const state: 'done' | 'active' | 'pending' = i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'pending';
          return (
            <React.Fragment key={step.key}>
              <div className={
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all '
                + (state === 'active'
                    ? `bg-gradient-to-r ${step.bg} border ${step.border} ${step.accent} ${
                        step.key === 'search' ? 'shadow-lg shadow-sky-500/20'
                        : step.key === 'fetch'  ? 'shadow-lg shadow-amber-500/20'
                        : step.key === 'parse'  ? 'shadow-lg shadow-violet-500/20'
                        :                         'shadow-lg shadow-emerald-500/20'
                      }`
                    : state === 'done'
                      ? `bg-emerald-500/10 border border-emerald-400/30 text-emerald-300`
                      : `bg-slate-800/40 border border-slate-700/40 text-gray-500`)
              }>
                {state === 'done'
                  ? <Check className="w-3 h-3" />
                  : state === 'active'
                    ? <Icon className="w-3 h-3 animate-pulse" />
                    : <Icon className="w-3 h-3 opacity-50" />}
                <span>{step.label}</span>
              </div>
              {i < STEP_DEFS.length - 1 && (
                <div className={
                  'flex-1 h-px transition-colors '
                  + (i < activeIdx ? 'bg-emerald-400/40' : 'bg-slate-700/40')
                } />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Live stage detail */}
      <div className="mt-3 flex items-baseline gap-2 flex-wrap">
        <span className={`text-sm font-semibold ${activeStep.accent}`}>{stageLabel(bootstrap.stage)}</span>
        <span className="text-[11px] text-gray-500 font-mono">{elapsedSec}s</span>
        {bootstrap.bytes != null && bootstrap.bytes > 0 && (
          <span className="text-[11px] text-gray-500 font-mono">· {bootstrap.bytes.toLocaleString()} chars</span>
        )}
        {bootstrap.hop != null && bootstrap.hop > 0 && (
          <span className="text-[10px] uppercase tracking-wider text-amber-300 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/40 font-semibold">
            Hop {bootstrap.hop}
          </span>
        )}
      </div>
      {bootstrap.detail && (
        <div className="text-[11px] text-gray-400 mt-1 truncate">{bootstrap.detail}</div>
      )}

      {/* Animated bar */}
      <div className="mt-3 h-1 rounded-full overflow-hidden bg-slate-800/80">
        <div className={
          'h-full w-1/3 animate-pulse-slide bg-gradient-to-r '
          + (activeStep.key === 'search' ? 'from-sky-400 via-sky-200 to-sky-400'
           : activeStep.key === 'fetch'  ? 'from-amber-400 via-amber-200 to-amber-400'
           : activeStep.key === 'parse'  ? 'from-violet-400 via-violet-200 to-violet-400'
           :                                'from-emerald-400 via-emerald-200 to-emerald-400')
        } />
      </div>
      {elapsedSec >= 15 && (
        <p className="text-[10px] text-gray-500 mt-2 italic flex items-center gap-1">
          <Sparkles className="w-2.5 h-2.5" /> This can take 20–60 seconds when the model fetches live pages. Hang tight.
        </p>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Completion banner — shown when bootstrap finishes successfully; reports
// what was fulfilled and what wasn’t with checkmarks, and can be dismissed.
// ---------------------------------------------------------------------------
interface FulfillmentSummary {
  checks: Array<{ key: string; label: string; ok: boolean }>;
  found: number;
  total: number;
  missing: Array<{ key: string; label: string; ok: boolean }>;
  tone: 'success' | 'partial' | 'minimal' | 'empty';
}

const CompletionBanner: React.FC<{ fulfillment: FulfillmentSummary; elapsedSec: number; onDismiss: () => void }> = ({ fulfillment, elapsedSec, onDismiss }) => {
  const { checks, found, total, tone } = fulfillment;

  const toneStyles = {
    success: { bg: 'from-emerald-600/30 via-teal-600/20 to-cyan-600/20', border: 'border-emerald-400/50', icon: 'text-emerald-300', title: 'text-emerald-100', Icon: CheckCircle2 },
    partial: { bg: 'from-amber-600/25 via-yellow-600/15 to-orange-600/20', border: 'border-amber-400/50', icon: 'text-amber-300',   title: 'text-amber-100',   Icon: CheckCircle2 },
    minimal: { bg: 'from-orange-600/25 via-amber-600/15 to-yellow-600/20', border: 'border-orange-400/50', icon: 'text-orange-300',  title: 'text-orange-100',  Icon: AlertCircle  },
    empty:   { bg: 'from-rose-600/25 via-rose-700/15 to-rose-800/20',     border: 'border-rose-400/50',   icon: 'text-rose-300',    title: 'text-rose-100',    Icon: AlertCircle  },
  }[tone];

  const headline =
    tone === 'success' ? 'Auto-research complete — everything found!'
    : tone === 'partial' ? `Auto-research complete — ${found} of ${total} items found`
    : tone === 'minimal' ? `Partial result — only ${found} of ${total} items found`
    : 'No structured data returned';

  return (
    <div className={`relative px-5 py-3.5 border-b ${toneStyles.border} bg-gradient-to-r ${toneStyles.bg} animate-fade-in-up`}>
      <div className="flex items-start gap-3">
        <toneStyles.Icon className={`w-5 h-5 ${toneStyles.icon} flex-shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className={`text-sm font-bold ${toneStyles.title}`}>{headline}</p>
            {elapsedSec > 0 && (
              <span className="text-[11px] text-gray-300/70 font-mono">in {elapsedSec}s</span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {checks.map(c => (
              <span key={c.key} className={
                'inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium '
                + (c.ok
                    ? 'bg-emerald-500/20 text-emerald-100 border border-emerald-400/40'
                    : 'bg-slate-700/40 text-gray-400 border border-slate-600/40 line-through')
              }>
                {c.ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                {c.label}
              </span>
            ))}
          </div>
          {tone === 'partial' && (
            <p className="text-[11px] text-gray-300/80 mt-2">
              The missing pieces may simply not be published online — you can ask the chat agent to dig deeper.
            </p>
          )}
          {tone === 'minimal' && (
            <p className="text-[11px] text-gray-300/80 mt-2">
              Most data is missing. Try asking the agent directly, or verify the municipality spelling.
            </p>
          )}
          {tone === 'empty' && (
            <p className="text-[11px] text-gray-300/80 mt-2">
              The model couldn’t locate this jurisdiction’s zoning data online. Try a manual search in the chat.
            </p>
          )}
        </div>
        <button onClick={onDismiss} className="text-gray-400 hover:text-white transition flex-shrink-0" aria-label="Dismiss banner">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
