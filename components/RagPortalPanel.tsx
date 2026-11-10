import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * DevOps control room for the private surveybrain Cloud Run service.
 *
 * The panel is deliberately boring about transport: every call goes through
 * /api/rag on the Node backend, which holds the Cloud Run identity token.  The
 * browser only ever sees a DevOps session.
 */

type Section = 'live' | 'overview' | 'corpus' | 'ingest' | 'query';

interface RagPortalPanelProps {
  apiBase: string;
  sessionToken: string;
}

interface RagBudget {
  used: number;
  limit: number;
  remaining: number;
  window_hours: number;
}

interface RagCounts {
  documents: number;
  ingested: number;
  duplicates: number;
  failed: number;
  in_flight: number;
  chunks: number;
  bytes: number;
}

interface RagConfig {
  project: string;
  environment: string;
  vertex_location: string;
  embedding_model: string;
  embedding_dimensions: number;
  daily_token_budget: number;
  budget_window_hours: number;
  max_pages_per_domain: number;
  max_total_pages: number;
  max_depth: number;
  crawl_deadline_seconds: number;
  allowed_domains: string[];
  denied_domains: string[];
  cloud_sql_socket: boolean;
}

interface RagRun {
  run_id: string;
  trigger: string;
  sources: string[];
  outcome: string;
  started_at: string;
  finished_at: string | null;
  duration_seconds: number | null;
  pages_seen: number;
  documents_claimed: number;
  documents_skipped: number;
  duplicates: number;
  failed: number;
  chunks_written: number;
  tokens_reserved: number;
  tokens_billed: number;
  budget_limit: number;
  budget_used_before: number;
  stop_reason: string | null;
  errors: string[];
}

interface RagStatus {
  service: string;
  generated_at: string;
  configured: boolean;
  budget: RagBudget;
  documents: RagCounts;
  last_run: RagRun | null;
  active_run: RagRun | null;
  config: RagConfig;
}

interface RagDocument {
  id: number;
  url: string;
  final_url: string | null;
  source: string;
  doc_type: string;
  title: string | null;
  status: string;
  attempts: number;
  http_status: number | null;
  byte_size: number | null;
  chunk_count: number;
  error: string | null;
  first_seen_at: string;
  last_attempt_at: string;
  ingested_at: string | null;
}

interface RagSource {
  id: string;
  agency: string;
  label: string;
  seeds: string[];
  license: string;
}

interface RagEvent {
  run_id: string;
  seq: number;
  at: string;
  stage: string;
  level: string;
  message: string;
  url: string | null;
  document_id: number | null;
  meta: Record<string, unknown> | null;
}

interface RagHit {
  id: number;
  document_id: number;
  url: string;
  final_url: string | null;
  title: string | null;
  source: string;
  doc_type: string;
  chunk_index: number;
  content: string;
  metadata: Record<string, unknown> | null;
  score: number;
}

interface QueryResponse {
  query: string;
  limit: number;
  source: string | null;
  hits: RagHit[];
  tokens_billed: number;
  embedding_model: string;
  embedding_dimensions: number;
}

interface ActivityResponse {
  run_id: string | null;
  events: RagEvent[];
  next_since: number;
}

class PortalError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'PortalError';
    this.status = status;
  }
}

const numberFormatter = new Intl.NumberFormat('en-US');

function formatNumber(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? numberFormatter.format(value)
    : '—';
}

function formatBytes(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function formatClock(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString([], { hour12: false });
}

function formatDuration(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  if (value < 60) return `${value.toFixed(1)}s`;
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${minutes}m ${seconds}s`;
}

function label(value: string): string {
  return value.replace(/_/g, ' ');
}

function errorMessage(error: unknown): string {
  if (error instanceof PortalError) {
    if (error.status === 401) {
      return 'DevOps session expired. Sign in again to open the SurveyBrain control room.';
    }
    if (error.status === 503) {
      return `${error.message}. Check the SurveyBrain service, DATABASE_URL and the backend service account IAM binding.`;
    }
    if (error.status === 429) {
      return `${error.message}. A cost safeguard or rate limit is active; try again later.`;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : 'Unexpected error';
}

function outcomeTone(outcome: string): string {
  switch (outcome) {
    case 'completed':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
    case 'running':
      return 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300';
    case 'budget_exceeded':
      return 'border-orange-500/40 bg-orange-500/10 text-orange-300';
    case 'already_running':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
    case 'deadline_exceeded':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
    default:
      return 'border-red-500/40 bg-red-500/10 text-red-300';
  }
}

function docStatusTone(status: string): string {
  switch (status) {
    case 'ingested':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
    case 'duplicate':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
    case 'failed':
      return 'border-red-500/40 bg-red-500/10 text-red-300';
    case 'fetched':
      return 'border-violet-500/40 bg-violet-500/10 text-violet-300';
    default:
      return 'border-sky-500/40 bg-sky-500/10 text-sky-300';
  }
}

const STAGE_TONES: Record<string, string> = {
  run: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300',
  fetch: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  dedupe: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  chunk: 'border-violet-500/40 bg-violet-500/10 text-violet-300',
  embed: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300',
  save: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  budget: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
  error: 'border-red-500/40 bg-red-500/10 text-red-300',
};

function stageTone(stage: string): string {
  return STAGE_TONES[stage] || 'border-slate-600 bg-slate-700/40 text-slate-300';
}

function metaChips(meta: Record<string, unknown> | null | undefined): string[] {
  if (!meta) return [];
  return Object.entries(meta)
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
    .filter(([key]) => key !== 'title')
    .slice(0, 6)
    .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${String(value)}`);
}

function Metric({
  label: metricLabel,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="border border-slate-700 bg-slate-800/70 p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
        {metricLabel}
      </p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function BudgetGauge({ budget }: { budget: RagBudget | null }) {
  const percent = budget && budget.limit > 0
    ? Math.min(100, Math.round((budget.used / budget.limit) * 100))
    : 0;
  const tone = percent >= 90 ? 'bg-red-400' : percent >= 70 ? 'bg-amber-400' : 'bg-emerald-400';
  return (
    <section className="border border-slate-700 bg-slate-800 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">Embedding budget</h3>
          <p className="mt-1 text-xs text-slate-400">
            Hard circuit breaker over a rolling {budget?.window_hours ?? 24}-hour window.
          </p>
        </div>
        <span className={`text-2xl font-bold ${percent >= 90 ? 'text-red-300' : percent >= 70 ? 'text-amber-300' : 'text-emerald-300'}`}>
          {percent}%
        </span>
      </div>
      <div
        className="mt-4 h-3 overflow-hidden rounded-full bg-slate-900"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Embedding token budget used"
      >
        <div className={`h-full rounded-full transition-all ${tone}`} style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-400">
        <span>{formatNumber(budget?.used)} used</span>
        <span>{formatNumber(budget?.remaining)} remaining</span>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Limit {formatNumber(budget?.limit)} tokens. A batch is reserved atomically before
        every Vertex AI request; once the limit is crossed, no further API call is made.
      </p>
    </section>
  );
}

function RunSummary({ run, live = false }: { run: RagRun; live?: boolean }) {
  return (
    <section className="border border-slate-700 bg-slate-800 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${outcomeTone(run.outcome)}`}>
              {label(run.outcome)}
            </span>
            {live && (
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-cyan-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
                live
              </span>
            )}
            <span className="text-[10px] uppercase tracking-wide text-slate-500">{run.trigger}</span>
          </div>
          <p className="mt-2 font-mono text-xs text-slate-400">{run.run_id}</p>
        </div>
        <div className="text-right text-xs text-slate-400">
          <p>Started {formatDate(run.started_at)}</p>
          <p className="mt-1">
            {run.finished_at
              ? `Finished ${formatDate(run.finished_at)}`
              : 'In progress'}
            {run.duration_seconds != null ? ` · ${formatDuration(run.duration_seconds)}` : ''}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        <Metric label="Pages" value={formatNumber(run.pages_seen)} />
        <Metric label="Claimed" value={formatNumber(run.documents_claimed)} />
        <Metric label="Deduped" value={formatNumber(run.documents_skipped + run.duplicates)} />
        <Metric label="Chunks" value={formatNumber(run.chunks_written)} />
        <Metric label="Tokens" value={formatNumber(run.tokens_billed)} />
        <Metric label="Failed" value={formatNumber(run.failed)} />
        <Metric label="Budget before" value={`${formatNumber(run.budget_used_before)} / ${formatNumber(run.budget_limit)}`} />
      </div>

      {run.stop_reason && (
        <p className="mt-3 border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Safeguard stopped the run: <span className="font-mono">{run.stop_reason}</span>
        </p>
      )}

      {run.errors && run.errors.length > 0 && (
        <details className="mt-3 border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          <summary className="cursor-pointer font-semibold">
            {run.errors.length} recorded error{run.errors.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-4 font-mono">
            {run.errors.map((item, index) => (
              <li key={`${run.run_id}-error-${index}`}>{item}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function ActivityRow({ event }: { event: RagEvent }) {
  const chips = metaChips(event.meta);
  return (
    <li className="border-b border-slate-800/80 px-4 py-3 last:border-0">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 inline-flex min-w-[62px] justify-center border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${stageTone(event.stage)}`}>
          {event.stage}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-200">{event.message}</p>
          {event.url && (
            <a
              href={event.url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 block truncate text-xs text-cyan-300 hover:underline"
              title={event.url}
            >
              {event.url}
            </a>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
            <span className="font-mono">{formatClock(event.at)}</span>
            {event.document_id != null && <span>doc #{event.document_id}</span>}
            {chips.map((chip) => (
              <span key={`${event.run_id}-${event.seq}-${chip}`} className="bg-slate-700/60 px-1.5 py-0.5 text-slate-400">
                {chip}
              </span>
            ))}
          </div>
        </div>
        {event.level !== 'info' && (
          <span className={`border px-1.5 py-0.5 text-[10px] font-bold uppercase ${outcomeTone(event.level)}`}>
            {event.level}
          </span>
        )}
      </div>
    </li>
  );
}

function DataHandlingPanel({ status }: { status: RagStatus | null }) {
  const counts = status?.documents;
  return (
    <section className="border border-slate-700 bg-slate-800 p-5">
      <h3 className="font-semibold text-white">What the run is saving</h3>
      <p className="mt-1 text-xs leading-5 text-slate-400">
        The crawler holds pages and PDFs in memory only. What survives the run is extracted
        technical text, its vector, provenance, and the audit ledger below.
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="border border-slate-700 bg-slate-900/60 p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Documents</p>
          <p className="mt-0.5 text-lg font-semibold text-white">{formatNumber(counts?.ingested)}</p>
        </div>
        <div className="border border-slate-700 bg-slate-900/60 p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Chunks</p>
          <p className="mt-0.5 text-lg font-semibold text-white">{formatNumber(counts?.chunks)}</p>
        </div>
        <div className="border border-slate-700 bg-slate-900/60 p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Tokens 24h</p>
          <p className="mt-0.5 text-lg font-semibold text-white">{formatNumber(status?.budget.used)}</p>
        </div>
      </div>

      <ol className="mt-4 space-y-2.5 text-xs">
        {[
          'Allowlist check: only BLM / NGS federal hosts are queued; commercial portals are denied before navigation.',
          'In-memory fetch: Playwright extracts visible text or parses a PDF; raw bytes, browser cache and cookies are discarded.',
          'Normalize + chunk: paragraphs are packed to 4,000 characters with 400-character overlap; 400 chunks per document maximum.',
          'Dedupe: the URL fingerprint is checked in the ledger before navigation; content hash is checked before any embedding spend.',
          'Embed: batches are capped at 250 instances / 18,000 tokens, with an atomic token reservation before each Vertex call.',
          'Upsert: chunk text, 768-d vector and provenance are written to pgvector in one transaction.',
          'Audit: ingestion_runs and ingestion_events record the run, safeguards, errors and this live feed.',
        ].map((step, index) => (
          <li key={step} className="flex gap-2 text-slate-300">
            <span className="flex h-5 w-5 flex-none items-center justify-center border border-cyan-500/30 bg-cyan-500/10 text-[10px] font-bold text-cyan-300">
              {index + 1}
            </span>
            <span className="leading-5">{step}</span>
          </li>
        ))}
      </ol>

      <div className="mt-4 border-t border-slate-700 pt-3 text-xs">
        <p className="font-semibold text-slate-300">Stored in PostgreSQL</p>
        <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-400">
          <li><span className="font-mono text-slate-300">scraped_documents</span> — URL fingerprint, content hash, source, title, HTTP/byte counts, status, attempts, timestamps.</li>
          <li><span className="font-mono text-slate-300">document_chunks</span> — extracted text, vector, token count, and source/agency/license/retrieved-at metadata.</li>
          <li><span className="font-mono text-slate-300">embedding_token_usage</span> — reservation and settlement ledger for the rolling budget.</li>
          <li><span className="font-mono text-slate-300">ingestion_runs / ingestion_events</span> — run outcomes and the live progress feed.</li>
        </ul>
        <p className="mt-3 font-semibold text-slate-300">Never stored</p>
        <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-400">
          <li>Raw HTML or PDF bytes, downloaded files, browser cache, cookies or screenshots.</li>
          <li>Page text beyond the bounded chunks, or any commercial/non-permissive content.</li>
          <li>Database passwords, trigger tokens or IAM credentials inside the container image.</li>
        </ul>
      </div>
    </section>
  );
}

function ConfigPanel({ config }: { config: RagConfig | null }) {
  if (!config) {
    return (
      <section className="border border-slate-700 bg-slate-800 p-5 text-sm text-slate-400">
        Configuration is unavailable until the service is reachable.
      </section>
    );
  }
  return (
    <section className="border border-slate-700 bg-slate-800 p-5">
      <h3 className="font-semibold text-white">Crawl and model limits</h3>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
        <div>
          <dt className="text-slate-500">Per-domain pages</dt>
          <dd className="mt-0.5 text-slate-200">{config.max_pages_per_domain}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Total pages</dt>
          <dd className="mt-0.5 text-slate-200">{config.max_total_pages}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Max depth</dt>
          <dd className="mt-0.5 text-slate-200">{config.max_depth}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Deadline</dt>
          <dd className="mt-0.5 text-slate-200">{formatDuration(config.crawl_deadline_seconds)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Embedding model</dt>
          <dd className="mt-0.5 font-mono text-slate-200">{config.embedding_model}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Dimensions</dt>
          <dd className="mt-0.5 text-slate-200">{config.embedding_dimensions}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Vertex region</dt>
          <dd className="mt-0.5 text-slate-200">{config.vertex_location}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Cloud SQL socket</dt>
          <dd className="mt-0.5 text-slate-200">{config.cloud_sql_socket ? 'connected' : 'TCP / local'}</dd>
        </div>
      </dl>
      <div className="mt-4 border-t border-slate-700 pt-3 text-xs">
        <p className="text-slate-500">Allowed federal hosts</p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {config.allowed_domains.map((domain) => (
            <span key={domain} className="border border-slate-600 bg-slate-900/60 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
              {domain}
            </span>
          ))}
        </div>
        <p className="mt-3 text-slate-500">Commercial denylist (never navigated)</p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {config.denied_domains.map((domain) => (
            <span key={domain} className="border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 font-mono text-[10px] text-red-300">
              {domain}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export function RagPortalPanel({ apiBase, sessionToken }: RagPortalPanelProps) {
  const [section, setSection] = useState<Section>('live');
  const [status, setStatus] = useState<RagStatus | null>(null);
  const [runs, setRuns] = useState<RagRun[]>([]);
  const [sources, setSources] = useState<RagSource[]>([]);
  const [documents, setDocuments] = useState<RagDocument[]>([]);
  const [activity, setActivity] = useState<RagEvent[]>([]);
  const [activityRunId, setActivityRunId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [docsLoading, setDocsLoading] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [error, setError] = useState('');
  const [docsError, setDocsError] = useState('');
  const [activityError, setActivityError] = useState('');

  const [docStatus, setDocStatus] = useState('');
  const [docSource, setDocSource] = useState('');

  const [ingestSources, setIngestSources] = useState<string[]>([]);
  const [maxPages, setMaxPages] = useState(5);
  const [confirming, setConfirming] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [ingestError, setIngestError] = useState('');
  const [ingestResult, setIngestResult] = useState<RagRun | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const [queryText, setQueryText] = useState('');
  const [querySource, setQuerySource] = useState('');
  const [queryLimit, setQueryLimit] = useState(10);
  const [querying, setQuerying] = useState(false);
  const [queryError, setQueryError] = useState('');
  const [queryResult, setQueryResult] = useState<QueryResponse | null>(null);

  const [follow, setFollow] = useState(true);

  const activityRef = useRef<HTMLDivElement | null>(null);
  const followRef = useRef(true);
  const sinceRef = useRef(0);
  const activityRunRef = useRef<string | null>(null);
  const activityRequestRef = useRef(false);
  const sourcesInitRef = useRef(false);
  const ingestStartedAtRef = useRef<number | null>(null);

  const api = useCallback(
    async <T,>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> => {
      const controller = new AbortController();
      const timeout = window.setTimeout(
        () => controller.abort(),
        init?.timeoutMs ?? 20_000,
      );
      try {
        const response = await fetch(`${apiBase}${path}`, {
          method: init?.method ?? 'GET',
          body: init?.body,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
          signal: controller.signal,
        });
        const text = await response.text();
        let payload: unknown = null;
        try {
          payload = text ? JSON.parse(text) : null;
        } catch {
          payload = text;
        }
        if (!response.ok) {
          const message = payload && typeof payload === 'object' && 'error' in payload
            ? String((payload as { error: unknown }).error)
            : `Request failed with HTTP ${response.status}`;
          throw new PortalError(response.status, message);
        }
        return payload as T;
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') {
          throw new PortalError(0, 'Request timed out');
        }
        throw caught;
      } finally {
        window.clearTimeout(timeout);
      }
    },
    [apiBase, sessionToken],
  );

  const refresh = useCallback(
    async (quiet = false) => {
      if (!sessionToken) return;
      if (!quiet) setRefreshing(true);
      try {
        const [statusData, runData, sourceData] = await Promise.all([
          api<RagStatus>('/api/rag/status'),
          api<{ runs: RagRun[] }>('/api/rag/runs?limit=25'),
          api<{ sources: RagSource[] }>('/api/rag/sources'),
        ]);
        setStatus(statusData);
        setRuns(runData.runs || []);
        setSources(sourceData.sources || []);
        setError('');
      } catch (caught) {
        setError(errorMessage(caught));
      } finally {
        setLoading(false);
        if (!quiet) setRefreshing(false);
      }
    },
    [api, sessionToken],
  );

  const loadActivity = useCallback(
    async (reset = false) => {
      if (!sessionToken || activityRequestRef.current) return;
      activityRequestRef.current = true;
      setActivityLoading(true);
      if (reset) {
        sinceRef.current = 0;
        activityRunRef.current = null;
      }
      try {
        const params = new URLSearchParams({ limit: '300' });
        if (!reset && sinceRef.current > 0) params.set('since', String(sinceRef.current));
        let data = await api<ActivityResponse>(`/api/rag/activity?${params.toString()}`);

        // A new run may have started since the last poll; load it from seq 0
        // rather than applying the previous run's `since` cursor.
        if (data.run_id && data.run_id !== activityRunRef.current) {
          data = await api<ActivityResponse>(
            `/api/rag/activity?run_id=${encodeURIComponent(data.run_id)}&limit=300`,
          );
        }

        const runChanged = data.run_id !== activityRunRef.current;
        activityRunRef.current = data.run_id;
        setActivityRunId(data.run_id);
        if (data.next_since > sinceRef.current) sinceRef.current = data.next_since;

        setActivity((previous) => {
          const merged = runChanged || reset
            ? (data.events || [])
            : [...previous, ...(data.events || [])];
          const seen = new Set<string>();
          return merged
            .filter((event) => {
              const key = `${event.run_id}:${event.seq}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            })
            .slice(-1200);
        });
        setActivityError('');
      } catch (caught) {
        setActivityError(errorMessage(caught));
      } finally {
        activityRequestRef.current = false;
        setActivityLoading(false);
      }
    },
    [api, sessionToken],
  );

  const loadDocuments = useCallback(async () => {
    if (!sessionToken) return;
    setDocsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (docStatus) params.set('status', docStatus);
      if (docSource) params.set('source', docSource);
      const data = await api<{ documents: RagDocument[] }>(
        `/api/rag/documents?${params.toString()}`,
      );
      setDocuments(data.documents || []);
      setDocsError('');
    } catch (caught) {
      setDocsError(errorMessage(caught));
    } finally {
      setDocsLoading(false);
    }
  }, [api, docSource, docStatus, sessionToken]);

  const startIngest = useCallback(async () => {
    if (ingesting || ingestSources.length === 0) return;
    setIngesting(true);
    setIngestError('');
    setIngestResult(null);
    setConfirming(false);
    setElapsed(0);
    ingestStartedAtRef.current = Date.now();
    sinceRef.current = 0;
    activityRunRef.current = null;
    setActivity([]);
    setActivityRunId(null);
    void loadActivity(true);

    try {
      const report = await api<RagRun>('/api/rag/ingest', {
        method: 'POST',
        body: JSON.stringify({
          sources: ingestSources,
          max_pages_per_domain: maxPages,
        }),
        timeoutMs: 18 * 60 * 1000,
      });
      setIngestResult(report);
    } catch (caught) {
      setIngestError(errorMessage(caught));
    } finally {
      ingestStartedAtRef.current = null;
      setIngesting(false);
      void refresh(true);
      void loadActivity(true);
      void loadDocuments();
    }
  }, [api, ingestSources, ingesting, loadActivity, loadDocuments, maxPages, refresh]);

  const runQuery = useCallback(async () => {
    const trimmed = queryText.trim();
    if (trimmed.length < 2 || querying) return;
    setQuerying(true);
    setQueryError('');
    try {
      const data = await api<QueryResponse>('/api/rag/query', {
        method: 'POST',
        body: JSON.stringify({
          query: trimmed,
          limit: queryLimit,
          ...(querySource ? { source: querySource } : {}),
        }),
        timeoutMs: 45_000,
      });
      setQueryResult(data);
    } catch (caught) {
      setQueryError(errorMessage(caught));
    } finally {
      setQuerying(false);
    }
  }, [api, queryLimit, querySource, queryText, querying]);

  useEffect(() => {
    void refresh();
    void loadActivity(true);
  }, [loadActivity, refresh]);

  useEffect(() => {
    if (!sourcesInitRef.current && sources.length > 0) {
      sourcesInitRef.current = true;
      setIngestSources(sources.map((source) => source.id));
    }
  }, [sources]);

  useEffect(() => {
    if (section === 'corpus' || section === 'live') {
      void loadDocuments();
    }
  }, [loadDocuments, section]);

  useEffect(() => {
    if (!ingesting) return;
    const timer = window.setInterval(() => {
      if (ingestStartedAtRef.current != null) {
        setElapsed(Math.floor((Date.now() - ingestStartedAtRef.current) / 1000));
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [ingesting]);

  useEffect(() => {
    if (!sessionToken) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void refresh(true);
      void loadActivity(false);
    }, ingesting ? 2500 : 15_000);
    return () => window.clearInterval(timer);
  }, [ingesting, loadActivity, refresh, sessionToken]);

  useEffect(() => {
    followRef.current = follow;
    if (follow && activityRef.current) {
      activityRef.current.scrollTop = activityRef.current.scrollHeight;
    }
  }, [activity, follow]);

  const budget = status?.budget ?? null;
  const activeRun = status?.active_run ?? runs.find((run) => run.outcome === 'running') ?? null;
  const latestRun = activeRun ?? runs[0] ?? null;
  const sourceLabel = useCallback(
    (id: string) => sources.find((source) => source.id === id)?.label ?? id,
    [sources],
  );

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const event of activity) counts[event.stage] = (counts[event.stage] || 0) + 1;
    return counts;
  }, [activity]);

  const sections: Array<{ id: Section; label: string; hint: string }> = [
    { id: 'live', label: 'Live', hint: 'Streaming crawl, extraction, spend and what is being written' },
    { id: 'overview', label: 'Overview', hint: 'Budget, corpus health and effective limits' },
    { id: 'corpus', label: 'Corpus', hint: 'Every claimed URL and its ingestion outcome' },
    { id: 'ingest', label: 'Run ingestion', hint: 'Start a bounded, single-flight public-domain crawl' },
    { id: 'query', label: 'Query', hint: 'Semantic search over the ingested chunks' },
  ];

  return (
    <section className="space-y-6" aria-busy={loading}>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-700 pb-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">
            SurveyBrain
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white">Ingestion control room</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
            Live evidence from the private Cloud Run crawler: what it fetched, what it
            deduplicated, what it embedded, and exactly what reached PostgreSQL.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
            status ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-slate-600 bg-slate-800 text-slate-400'
          }`}>
            {status ? 'Private service' : 'Connecting'}
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="SurveyBrain portal sections">
        {sections.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSection(item.id)}
            aria-current={section === item.id ? 'page' : undefined}
            title={item.hint}
            className={`border px-3 py-2 text-xs font-semibold transition-colors ${
              section === item.id
                ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-300'
                : 'border-slate-700 bg-slate-800/60 text-slate-400 hover:text-slate-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void refresh()}
            className="border border-red-400/40 px-2 py-1 text-xs font-semibold text-red-200 hover:bg-red-500/10"
          >
            Retry
          </button>
        </div>
      )}

      {loading && !status ? (
        <div className="space-y-3">
          <div className="h-24 animate-pulse border border-slate-700 bg-slate-800" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-20 animate-pulse border border-slate-700 bg-slate-800" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {section === 'live' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric label="Ingested docs" value={formatNumber(status?.documents.ingested)} hint={formatBytes(status?.documents.bytes)} />
                <Metric label="Stored chunks" value={formatNumber(status?.documents.chunks)} />
                <Metric label="Tokens used / 24h" value={formatNumber(budget?.used)} hint={`limit ${formatNumber(budget?.limit)}`} />
                <Metric label="Failed documents" value={formatNumber(status?.documents.failed)} hint={`${formatNumber(status?.documents.duplicates)} duplicates`} />
              </div>

              {latestRun ? (
                <RunSummary run={latestRun} live={latestRun.outcome === 'running'} />
              ) : (
                <div className="border border-slate-700 bg-slate-800 p-6 text-sm text-slate-400">
                  No ingestion runs yet. Open <button type="button" className="text-cyan-300 underline" onClick={() => setSection('ingest')}>Run ingestion</button> to start a bounded crawl.
                </div>
              )}

              <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
                <section className="border border-slate-700 bg-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 px-4 py-3">
                    <div>
                      <h3 className="font-semibold text-white">Live event ledger</h3>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {activityRunId ? `run ${activityRunId}` : 'waiting for a run'} ·{' '}
                        {formatNumber(activity.length)} events
                        {activityLoading ? ' · syncing…' : ''}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {Object.entries(stageCounts).map(([stage, count]) => `${stage} ${count}`).join(' · ') || 'no events yet'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-slate-400">
                        <input
                          type="checkbox"
                          checked={follow}
                          onChange={(event) => setFollow(event.target.checked)}
                          className="accent-cyan-400"
                        />
                        Follow
                      </label>
                      <button
                        type="button"
                        onClick={() => void loadActivity(true)}
                        disabled={activityLoading}
                        className="border border-slate-600 px-2 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                      >
                        Reload
                      </button>
                    </div>
                  </div>

                  {activityError && (
                    <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-200">
                      {activityError}
                    </div>
                  )}

                  <div
                    ref={activityRef}
                    className="max-h-[620px] overflow-y-auto"
                    aria-live="polite"
                  >
                    {activity.length === 0 ? (
                      <div className="px-4 py-10 text-center text-sm text-slate-500">
                        {activityRunId
                          ? 'Run started. Waiting for the first fetch event…'
                          : 'The ledger is empty. Start a run and events will appear here as each page is handled.'}
                      </div>
                    ) : (
                      <ul>
                        {activity.map((event) => (
                          <ActivityRow key={`${event.run_id}:${event.seq}`} event={event} />
                        ))}
                      </ul>
                    )}
                  </div>
                </section>

                <DataHandlingPanel status={status} />
              </div>
            </div>
          )}

          {section === 'overview' && (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Metric label="Documents seen" value={formatNumber(status?.documents.documents)} />
                <Metric label="Ingested" value={formatNumber(status?.documents.ingested)} />
                <Metric label="Duplicates skipped" value={formatNumber(status?.documents.duplicates)} />
                <Metric label="In flight" value={formatNumber(status?.documents.in_flight)} />
              </div>
              <div className="grid gap-5 lg:grid-cols-2">
                <BudgetGauge budget={budget} />
                <ConfigPanel config={status?.config ?? null} />
              </div>
              <DataHandlingPanel status={status} />
              {latestRun && <RunSummary run={latestRun} live={latestRun.outcome === 'running'} />}
            </div>
          )}

          {section === 'corpus' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">Document ledger</h2>
                  <p className="mt-1 text-xs text-slate-400">
                    The URL-level dedupe ledger. <span className="font-mono">ingested</span> means
                    chunks and embeddings are live; failed rows remain retryable.
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs text-slate-400">
                    Status
                    <select
                      value={docStatus}
                      onChange={(event) => setDocStatus(event.target.value)}
                      className="mt-1 block border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-slate-200"
                    >
                      <option value="">All</option>
                      <option value="ingested">Ingested</option>
                      <option value="duplicate">Duplicate</option>
                      <option value="failed">Failed</option>
                      <option value="claimed">Claimed</option>
                      <option value="fetched">Fetched</option>
                    </select>
                  </label>
                  <label className="text-xs text-slate-400">
                    Source
                    <select
                      value={docSource}
                      onChange={(event) => setDocSource(event.target.value)}
                      className="mt-1 block border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-slate-200"
                    >
                      <option value="">All</option>
                      {sources.map((source) => (
                        <option key={source.id} value={source.id}>{source.label}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => void loadDocuments()}
                    disabled={docsLoading}
                    className="border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                  >
                    {docsLoading ? 'Loading…' : 'Refresh'}
                  </button>
                </div>
              </div>

              {docsError && (
                <div role="alert" className="border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {docsError}
                </div>
              )}

              <div className="overflow-x-auto border border-slate-700">
                <table className="min-w-full divide-y divide-slate-700 text-left text-xs">
                  <thead className="bg-slate-800 text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Document</th>
                      <th className="px-3 py-2 font-semibold">Source</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                      <th className="px-3 py-2 font-semibold">Chunks</th>
                      <th className="px-3 py-2 font-semibold">Size</th>
                      <th className="px-3 py-2 font-semibold">Attempts</th>
                      <th className="px-3 py-2 font-semibold">Last activity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-900/40">
                    {documents.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                          {docsLoading ? 'Loading the ledger…' : 'No documents match these filters.'}
                        </td>
                      </tr>
                    ) : (
                      documents.map((document) => (
                        <tr key={document.id} className="align-top hover:bg-slate-800/50">
                          <td className="max-w-md px-3 py-3">
                            <a
                              href={document.url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="line-clamp-2 font-medium text-cyan-300 hover:underline"
                              title={document.url}
                            >
                              {document.title || document.url}
                            </a>
                            <p className="mt-0.5 truncate font-mono text-[10px] text-slate-500" title={document.url}>
                              {document.doc_type} · {document.url}
                            </p>
                            {document.error && (
                              <p className="mt-1 text-[11px] text-red-300">{document.error}</p>
                            )}
                          </td>
                          <td className="px-3 py-3 text-slate-300">{sourceLabel(document.source)}</td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex border px-1.5 py-0.5 text-[10px] font-bold uppercase ${docStatusTone(document.status)}`}>
                              {document.status}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-slate-300">{formatNumber(document.chunk_count)}</td>
                          <td className="px-3 py-3 text-slate-400">{formatBytes(document.byte_size)}</td>
                          <td className="px-3 py-3 text-slate-400">{document.attempts}</td>
                          <td className="px-3 py-3 text-slate-400">
                            {formatDate(document.ingested_at || document.last_attempt_at)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-500">
                Showing at most 100 rows. Raw page/PDF bytes are not in this table — only the
                dedupe fingerprint, provenance and counters.
              </p>
            </div>
          )}

          {section === 'ingest' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-white">Start a bounded ingestion run</h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
                  The service accepts one run at a time (PostgreSQL advisory lock). The crawl is
                  hard-stopped by the page quotas, loop breaker and absolute deadline; the
                  embedding circuit breaker can stop it earlier without making another API call.
                </p>
              </div>

              <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
                <section className="border border-slate-700 bg-slate-800 p-5">
                  <h3 className="font-semibold text-white">Public-domain sources</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Only these allowlisted federal registries are eligible. Commercial and
                    non-permissive portals are denied in code, not just by convention.
                  </p>
                  <div className="mt-4 space-y-2">
                    {sources.map((source) => {
                      const checked = ingestSources.includes(source.id);
                      return (
                        <label
                          key={source.id}
                          className={`flex cursor-pointer items-start gap-3 border p-3 transition-colors ${
                            checked
                              ? 'border-cyan-500/50 bg-cyan-500/10'
                              : 'border-slate-700 bg-slate-900/40 hover:border-slate-600'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setIngestSources((previous) => previous.includes(source.id)
                                ? previous.filter((item) => item !== source.id)
                                : [...previous, source.id]);
                            }}
                            className="mt-0.5 accent-cyan-400"
                          />
                          <span>
                            <span className="block text-sm font-semibold text-slate-100">{source.label}</span>
                            <span className="mt-0.5 block text-[11px] text-slate-400">{source.agency}</span>
                            <span className="mt-1 block text-[10px] text-slate-500">{source.license}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  <label className="mt-5 block text-xs font-semibold text-slate-300">
                    Max pages per domain
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={maxPages}
                      onChange={(event) => setMaxPages(Math.max(1, Math.min(100, Number(event.target.value) || 1)))}
                      className="mt-1 w-full border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
                    />
                    <span className="mt-1 block font-normal text-slate-500">
                      Request-scoped override, clipped to the service maximum
                      {status?.config ? ` (${status.config.max_pages_per_domain})` : ''}. Total pages
                      are capped at {status?.config?.max_total_pages ?? 200}.
                    </span>
                  </label>
                </section>

                <div className="space-y-4">
                  <BudgetGauge budget={budget} />
                  <section className="border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-100">
                    <p className="font-semibold">Before you start</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4">
                      <li>A run can take up to 15 minutes; this request stays open and the panel polls the ledger.</li>
                      <li>Leaving the page does not stop the run; the Cloud Run request continues server-side.</li>
                      <li>Embedding spend is capped by the rolling token budget shown here.</li>
                      <li>Only BLM / NGS public-domain pages are eligible; robots-restricted portals are never fetched.</li>
                    </ul>
                  </section>
                </div>
              </div>

              {ingestError && (
                <div role="alert" className="border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {ingestError}
                </div>
              )}

              {confirming ? (
                <section className="border border-cyan-500/40 bg-cyan-500/10 p-5">
                  <h3 className="font-semibold text-cyan-100">Confirm this run</h3>
                  <p className="mt-1 text-sm text-cyan-100/80">
                    {ingestSources.length} source{ingestSources.length === 1 ? '' : 's'} · up to{' '}
                    {maxPages} pages/domain · hard {formatNumber(budget?.limit)} token budget.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void startIngest()}
                      disabled={ingesting || ingestSources.length === 0}
                      className="bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
                    >
                      Start ingestion
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      className="border border-cyan-400/40 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/10"
                    >
                      Cancel
                    </button>
                  </div>
                </section>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    disabled={ingesting || ingestSources.length === 0}
                    className="bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
                  >
                    Review run
                  </button>
                  <button
                    type="button"
                    onClick={() => setSection('live')}
                    className="border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700"
                  >
                    Open live view
                  </button>
                  <span className="text-xs text-slate-500">
                    {ingestSources.length === 0
                      ? 'Select at least one source.'
                      : `${ingestSources.length} source${ingestSources.length === 1 ? '' : 's'} selected.`}
                  </span>
                </div>
              )}

              {ingesting && (
                <section className="border border-cyan-500/40 bg-slate-800 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="flex items-center gap-2 font-semibold text-white">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300" />
                        Run in progress
                      </h3>
                      <p className="mt-1 text-xs text-slate-400">
                        Elapsed {formatDuration(elapsed)}. The request stays open until the service
                        finishes; the feed below is live.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSection('live')}
                      className="border border-cyan-500/40 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/10"
                    >
                      Full live view
                    </button>
                  </div>
                  <div className="mt-4 max-h-64 overflow-y-auto border border-slate-700 bg-slate-900/60">
                    {activity.length === 0 ? (
                      <p className="px-3 py-6 text-center text-xs text-slate-500">
                        Waiting for the first event from the crawler…
                      </p>
                    ) : (
                      <ul>
                        {activity.slice(-12).map((event) => (
                          <ActivityRow key={`${event.run_id}:${event.seq}`} event={event} />
                        ))}
                      </ul>
                    )}
                  </div>
                </section>
              )}

              {ingestResult && (
                <div className="space-y-3">
                  <RunSummary run={ingestResult} />
                  <p className="text-xs text-slate-500">
                    The run report is persisted in <span className="font-mono">ingestion_runs</span>.
                    Open Live to replay its event ledger.
                  </p>
                </div>
              )}
            </div>
          )}

          {section === 'query' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-white">Semantic query</h2>
                <p className="mt-1 text-xs text-slate-400">
                  The query is embedded with the same model at retrieval time; results are ranked by
                  cosine similarity over the stored chunks.
                </p>
              </div>

              <section className="border border-slate-700 bg-slate-800 p-5">
                <label htmlFor="rag-query" className="text-xs font-semibold text-slate-300">
                  Query
                </label>
                <textarea
                  id="rag-query"
                  value={queryText}
                  onChange={(event) => setQueryText(event.target.value.slice(0, 2000))}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                      event.preventDefault();
                      void runQuery();
                    }
                  }}
                  rows={3}
                  placeholder="e.g. How is the NAD83(2011) realization related to NATRF2022?"
                  className="mt-1 w-full border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-600"
                />
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <label className="text-xs text-slate-400">
                    Source
                    <select
                      value={querySource}
                      onChange={(event) => setQuerySource(event.target.value)}
                      className="mt-1 block border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-slate-200"
                    >
                      <option value="">All sources</option>
                      {sources.map((source) => (
                        <option key={source.id} value={source.id}>{source.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-slate-400">
                    Results
                    <select
                      value={queryLimit}
                      onChange={(event) => setQueryLimit(Number(event.target.value))}
                      className="mt-1 block border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-slate-200"
                    >
                      {[5, 10, 15, 25].map((value) => (
                        <option key={value} value={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => void runQuery()}
                    disabled={querying || queryText.trim().length < 2}
                    className="bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
                  >
                    {querying ? 'Searching…' : 'Search corpus'}
                  </button>
                  <span className="text-[11px] text-slate-500">Ctrl / Cmd + Enter</span>
                </div>
              </section>

              {queryError && (
                <div role="alert" className="border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {queryError}
                </div>
              )}

              {queryResult && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">
                    {queryResult.hits.length} result{queryResult.hits.length === 1 ? '' : 's'} · query
                    embedding {formatNumber(queryResult.tokens_billed)} tokens ·{' '}
                    {queryResult.embedding_model} ({queryResult.embedding_dimensions}d)
                  </p>
                  {queryResult.hits.length === 0 ? (
                    <div className="border border-slate-700 bg-slate-800 p-6 text-sm text-slate-400">
                      No chunks matched. Ingest the relevant source first, or broaden the query.
                    </div>
                  ) : (
                    queryResult.hits.map((hit) => (
                      <article key={`${hit.document_id}-${hit.chunk_index}`} className="border border-slate-700 bg-slate-800 p-4">
                        <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wide">
                          <span className="border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300">
                            {Math.round(hit.score * 1000) / 10}% match
                          </span>
                          <span className="border border-slate-600 bg-slate-900/60 px-1.5 py-0.5 text-slate-300">
                            {sourceLabel(hit.source)}
                          </span>
                          <span className="text-slate-500">chunk {hit.chunk_index}</span>
                          <span className="text-slate-500">{hit.doc_type}</span>
                        </div>
                        <h3 className="mt-2 font-semibold text-white">{hit.title || hit.url}</h3>
                        <a
                          href={hit.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="mt-1 block truncate text-xs text-cyan-300 hover:underline"
                          title={hit.url}
                        >
                          {hit.url}
                        </a>
                        <details className="mt-3 border-t border-slate-700 pt-2 text-xs text-slate-300">
                          <summary className="cursor-pointer font-semibold text-slate-400">
                            Show extracted chunk text
                          </summary>
                          <p className="mt-2 whitespace-pre-wrap leading-6">{hit.content}</p>
                        </details>
                      </article>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
