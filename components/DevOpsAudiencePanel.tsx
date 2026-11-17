import React, { useMemo, useState } from 'react';

export type AudienceSection = 'visitors' | 'subscribers' | 'legal' | 'apikeys';

export interface AudienceSummary {
  totalVisitors: number;
  pageViews: number;
  identified: number;
  active24h: number;
  signed: number;
  trial: number;
}

export interface AudienceVisitorActivity {
  kind: string;
  at: string;
  path?: string | null;
  label?: string | null;
}

export interface AudienceVisitor {
  fingerprint_id: string;
  fingerprint_source?: 'client' | 'ip-ua';
  fingerprint_score?: number;
  entry_method?: string;
  entry_methods?: string[];
  visits?: number;
  page_views?: number;
  sessions?: number;
  first_entry_method?: string;
  first_seen_at?: string;
  last_seen_at?: string;
  name?: string | null;
  email?: string | null;
  user_agent?: string | null;
  ip_address?: string | null;
  surface?: string | null;
  agreement_version?: string | null;
  terms_version?: string | null;
  first_path?: string | null;
  last_path?: string | null;
  last_referrer?: string | null;
  signals?: Record<string, unknown> | null;
  activity?: AudienceVisitorActivity[] | null;
}

export interface AudienceCounts {
  visitors: number;
  subscribers: number;
  legal: number;
  apiKeys: number;
}

interface AudienceNavProps {
  section: AudienceSection;
  onSectionChange: (section: AudienceSection) => void;
  onRefresh: () => void;
  loading: boolean;
  counts: AudienceCounts;
  summary: AudienceSummary | null;
}

const SECTION_META: Array<{ id: AudienceSection; label: string; hint: string }> = [
  { id: 'visitors', label: 'Visitors', hint: 'Every device and its activity' },
  { id: 'subscribers', label: 'Subscribers', hint: 'Accounts, access and plan state' },
  { id: 'legal', label: 'Legal', hint: 'Signed agreements and consent' },
  { id: 'apikeys', label: 'API keys', hint: 'Issued keys and recent usage' },
];

const number = (value: number): string => value.toLocaleString();

export const AudienceNav: React.FC<AudienceNavProps> = ({
  section,
  onSectionChange,
  onRefresh,
  loading,
  counts,
  summary,
}) => {
  const metrics = [
    { label: 'Visitors', value: number(summary?.totalVisitors ?? counts.visitors), hint: 'Distinct device fingerprints' },
    { label: 'Page views', value: number(summary?.pageViews ?? 0), hint: 'Recorded page loads' },
    { label: 'Identified', value: number(summary?.identified ?? 0), hint: 'Visitor has a name or email' },
    { label: 'Active 24h', value: number(summary?.active24h ?? 0), hint: 'Seen in the last 24 hours' },
    { label: 'Legal signatures', value: number(counts.legal), hint: 'Signed agreements on file' },
    { label: 'API keys', value: number(counts.apiKeys), hint: 'Issued Enabling Keys' },
  ];

  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-cyan-400/20 bg-[#08131e] shadow-xl">
      <div className="border-b border-white/5 bg-gradient-to-r from-cyan-500/10 via-transparent to-transparent px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-300/75">Audience &amp; access</p>
            <h2 className="mt-1 text-2xl font-bold text-white">People and access</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">
              Every device that loads the app, the people behind legal signatures and subscriptions, and the keys they use.
              Fingerprints combine canvas, WebGL, installed fonts, client hints and browser characteristics.
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm text-white transition-colors hover:bg-cyan-700 disabled:bg-slate-700 disabled:text-slate-400"
          >
            {loading ? 'Refreshing…' : 'Refresh all'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-white/5 sm:grid-cols-3 xl:grid-cols-6">
        {metrics.map(metric => (
          <div key={metric.label} className="bg-[#08131e] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{metric.label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-slate-100">{metric.value}</div>
            <div className="mt-0.5 truncate text-[10px] text-slate-500" title={metric.hint}>{metric.hint}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-white/5 px-4 py-3">
        {SECTION_META.map(item => {
          const active = section === item.id;
          const count = counts[item.id === 'visitors' ? 'visitors' : item.id === 'subscribers' ? 'subscribers' : item.id === 'legal' ? 'legal' : 'apiKeys'];
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSectionChange(item.id)}
              aria-pressed={active}
              title={item.hint}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                active
                  ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200'
                  : 'border-slate-700 bg-slate-900/40 text-slate-400 hover:border-slate-500 hover:text-slate-200'
              }`}
            >
              {item.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${active ? 'bg-cyan-300/15 text-cyan-100' : 'bg-slate-800 text-slate-500'}`}>
                {number(count)}
              </span>
            </button>
          );
        })}
        <span className="ml-auto self-center text-[10px] text-slate-500">
          {summary ? `${number(summary.pageViews)} page views · ${number(summary.active24h)} active in 24h` : 'Loading audience totals…'}
        </span>
      </div>
    </section>
  );
};

type VisitorFilter = 'all' | 'identified' | 'signed' | 'trial' | 'anonymous';

const FILTERS: Array<{ id: VisitorFilter; label: string }> = [
  { id: 'all', label: 'Everyone' },
  { id: 'identified', label: 'Identified' },
  { id: 'signed', label: 'Signed legal' },
  { id: 'trial', label: 'Trial' },
  { id: 'anonymous', label: 'Anonymous' },
];

const ACTIVITY_LABELS: Record<string, string> = {
  'page-view': 'Visited a page',
  'legal-signature': 'Signed legal agreement',
  'trial-checkbox': 'Accepted Free CAD trial',
  'agent-open': 'Opened an agent',
  'deed-generated': 'Generated a deed',
  'api-key-used': 'Used an API key',
};

const entryLabel = (kind?: string): string => {
  if (kind === 'legal-signature') return 'legal signature';
  if (kind === 'trial-checkbox') return 'Free CAD trial';
  if (kind === 'page-visit') return 'page visit';
  return kind || 'visitor';
};

const formatDate = (value?: string | null): string => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : '—';
};

const formatShortDate = (value?: string | null): string => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';
};

const shortFingerprint = (value: string): string =>
  value.length > 22 ? `${value.slice(0, 14)}…${value.slice(-6)}` : value;

const formatSignalValue = (value: unknown): string => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value).slice(0, 120);
    } catch {
      return '[object]';
    }
  }
  return String(value).slice(0, 160);
};

interface VisitorDirectoryProps {
  visitors: AudienceVisitor[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export const VisitorDirectory: React.FC<VisitorDirectoryProps> = ({ visitors, loading, error, onRefresh }) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<VisitorFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return visitors.filter(visitor => {
      const methods = visitor.entry_methods ?? (visitor.entry_method ? [visitor.entry_method] : []);
      const identified = Boolean(visitor.name || visitor.email);
      if (filter === 'identified' && !identified) return false;
      if (filter === 'anonymous' && identified) return false;
      if (filter === 'signed' && !methods.includes('legal-signature')) return false;
      if (filter === 'trial' && !methods.includes('trial-checkbox')) return false;
      if (!query) return true;
      const haystack = [
        visitor.fingerprint_id,
        visitor.name,
        visitor.email,
        visitor.ip_address,
        visitor.user_agent,
        visitor.last_path,
        visitor.first_path,
        ...(visitor.activity ?? []).map(activity => `${activity.label || ''} ${activity.path || ''} ${activity.kind}`),
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [filter, search, visitors]);

  return (
    <div className="rounded-xl border border-slate-800 bg-[#08111b]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div>
          <h3 className="text-lg font-semibold text-white">Visitor directory</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Newest first. Open a row for the fingerprint, signal strength and activity trail.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-200 transition-colors hover:bg-cyan-500/20 disabled:border-slate-700 disabled:text-slate-500"
        >
          {loading ? 'Refreshing…' : 'Refresh visitors'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800/80 px-4 py-3">
        <input
          type="search"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search email, fingerprint, IP, path or activity…"
          aria-label="Search visitors"
          className="min-w-[260px] flex-1 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-cyan-500/60 focus:outline-none"
        />
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              aria-pressed={filter === item.id}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                filter === item.id
                  ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200'
                  : 'border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="border-b border-rose-800/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {loading && visitors.length === 0 ? (
        <div className="px-4 py-16 text-center text-sm text-slate-400">Loading visitor directory…</div>
      ) : filtered.length === 0 ? (
        <div className="px-4 py-16 text-center">
          <p className="text-sm text-slate-400">
            {visitors.length === 0 ? 'No visitors recorded yet.' : 'No visitors match this search.'}
          </p>
          <p className="mx-auto mt-2 max-w-lg text-xs text-slate-600">
            {visitors.length === 0
              ? 'The next page load will create a visitor record with its fingerprint and activity.'
              : 'Try clearing the search or switching the filter.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px]">
            <thead className="bg-slate-900/80 text-[10px] uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Visitor</th>
                <th className="px-4 py-3 text-left font-medium">Fingerprint</th>
                <th className="px-4 py-3 text-right font-medium">Views</th>
                <th className="px-4 py-3 text-left font-medium">First / last seen</th>
                <th className="px-4 py-3 text-left font-medium">What they&apos;ve done</th>
                <th className="px-4 py-3 text-left font-medium">Last page</th>
                <th className="px-4 py-3 text-left font-medium">Signals</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(visitor => {
                const methods = visitor.entry_methods ?? (visitor.entry_method ? [visitor.entry_method] : []);
                const latestActivity = visitor.activity?.[0];
                const score = Math.max(0, Math.min(100, Number(visitor.fingerprint_score) || 0));
                const expanded = expandedId === visitor.fingerprint_id;
                return (
                  <React.Fragment key={visitor.fingerprint_id}>
                    <tr
                      onClick={() => setExpandedId(expanded ? null : visitor.fingerprint_id)}
                      className="cursor-pointer border-t border-slate-800/80 align-top transition-colors hover:bg-slate-800/30"
                      aria-expanded={expanded}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-200">
                          {visitor.name || visitor.email || 'Anonymous device'}
                        </div>
                        {visitor.name && visitor.email && (
                          <div className="mt-0.5 text-xs text-cyan-300/80">{visitor.email}</div>
                        )}
                        <div className="mt-1 flex flex-wrap gap-1">
                          {methods.filter(method => method !== 'page-visit').map(method => (
                            <span key={method} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                              {entryLabel(method)}
                            </span>
                          ))}
                          {visitor.fingerprint_source === 'ip-ua' && (
                            <span className="rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] text-amber-300" title="No client fingerprint hash was available">
                              IP+UA fallback
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono text-[11px] text-slate-400" title={visitor.fingerprint_id}>
                          {shortFingerprint(visitor.fingerprint_id)}
                        </div>
                        <div className="mt-1 text-[10px] text-slate-600">
                          {visitor.sessions ?? 0} session{(visitor.sessions ?? 0) === 1 ? '' : 's'} · {visitor.visits ?? 0} touch{(visitor.visits ?? 0) === 1 ? '' : 'es'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="text-lg font-semibold tabular-nums text-slate-200">{visitor.page_views ?? 0}</div>
                        <div className="text-[10px] text-slate-600">page loads</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        <div>{formatShortDate(visitor.first_seen_at)}</div>
                        <div className="mt-1 text-slate-500">{formatShortDate(visitor.last_seen_at)}</div>
                      </td>
                      <td className="max-w-[260px] px-4 py-3 text-xs">
                        {latestActivity ? (
                          <div>
                            <div className="text-slate-300">{ACTIVITY_LABELS[latestActivity.kind] || latestActivity.kind}</div>
                            <div className="mt-0.5 truncate text-[10px] text-slate-600" title={latestActivity.path || undefined}>
                              {latestActivity.path || formatShortDate(latestActivity.at)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-600">No activity recorded</span>
                        )}
                        <div className="mt-1 text-[10px] text-slate-600">
                          {(visitor.activity?.length ?? 0)} event{(visitor.activity?.length ?? 0) === 1 ? '' : 's'}
                        </div>
                      </td>
                      <td className="max-w-[180px] px-4 py-3">
                        <div className="truncate font-mono text-[11px] text-slate-400" title={visitor.last_path || undefined}>
                          {visitor.last_path || '—'}
                        </div>
                        {visitor.last_referrer && (
                          <div className="mt-1 truncate text-[10px] text-slate-600" title={visitor.last_referrer}>
                            from {visitor.last_referrer}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-800">
                            <div
                              className={`h-full rounded-full ${score >= 60 ? 'bg-emerald-400' : score >= 30 ? 'bg-amber-400' : 'bg-rose-400'}`}
                              style={{ width: `${score}%` }}
                            />
                          </div>
                          <span className="text-[10px] tabular-nums text-slate-500">{score}%</span>
                        </div>
                        <div className="mt-1 text-[10px] text-slate-600">{Object.keys(visitor.signals ?? {}).length} captured signals</div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-t border-slate-800 bg-slate-950/60">
                        <td colSpan={7} className="px-4 py-4">
                          <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
                            <div>
                              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Activity trail</div>
                              {(visitor.activity?.length ?? 0) > 0 ? (
                                <ol className="space-y-2">
                                  {(visitor.activity ?? []).slice(0, 20).map((activity, index) => (
                                    <li key={`${activity.kind}-${activity.at}-${index}`} className="flex gap-3 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
                                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
                                      <div className="min-w-0">
                                        <div className="text-xs text-slate-200">{ACTIVITY_LABELS[activity.kind] || activity.kind}</div>
                                        <div className="mt-0.5 truncate text-[10px] text-slate-500">
                                          {formatDate(activity.at)}
                                          {activity.path ? ` · ${activity.path}` : ''}
                                          {activity.label ? ` · ${activity.label}` : ''}
                                        </div>
                                      </div>
                                    </li>
                                  ))}
                                </ol>
                              ) : (
                                <p className="text-xs text-slate-600">No activity recorded for this fingerprint.</p>
                              )}
                            </div>

                            <div>
                              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Fingerprint detail</div>
                              <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-xs">
                                <dt className="text-slate-600">Fingerprint</dt>
                                <dd className="break-all font-mono text-[10px] text-slate-300">{visitor.fingerprint_id}</dd>
                                <dt className="text-slate-600">Source</dt>
                                <dd className="text-slate-300">{visitor.fingerprint_source === 'ip-ua' ? 'IP + user-agent fallback' : 'Client fingerprint'}</dd>
                                <dt className="text-slate-600">First path</dt>
                                <dd className="break-all text-slate-300">{visitor.first_path || '—'}</dd>
                                <dt className="text-slate-600">Referrer</dt>
                                <dd className="break-all text-slate-300">{visitor.last_referrer || '—'}</dd>
                                <dt className="text-slate-600">IP address</dt>
                                <dd className="font-mono text-slate-300">{visitor.ip_address || '—'}</dd>
                                <dt className="text-slate-600">User agent</dt>
                                <dd className="break-all text-[10px] text-slate-500">{visitor.user_agent || '—'}</dd>
                                <dt className="text-slate-600">Entry methods</dt>
                                <dd className="text-slate-300">{methods.length ? methods.map(entryLabel).join(', ') : '—'}</dd>
                                {(visitor.agreement_version || visitor.terms_version) && (
                                  <>
                                    <dt className="text-slate-600">Agreement</dt>
                                    <dd className="text-slate-300">
                                      {[visitor.agreement_version, visitor.terms_version].filter(Boolean).join(' · ') || '—'}
                                    </dd>
                                  </>
                                )}
                              </dl>

                              <div className="mt-3 border-t border-slate-800 pt-3">
                                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                  Signals ({Object.keys(visitor.signals ?? {}).length})
                                </div>
                                <div className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
                                  {Object.entries(visitor.signals ?? {}).map(([key, value]) => (
                                    <div key={key} className="min-w-0 rounded border border-slate-800 bg-slate-900/40 px-2 py-1">
                                      <div className="truncate text-[9px] uppercase tracking-wide text-slate-600">{key}</div>
                                      <div className="truncate text-[10px] text-slate-400" title={formatSignalValue(value)}>{formatSignalValue(value)}</div>
                                    </div>
                                  ))}
                                  {Object.keys(visitor.signals ?? {}).length === 0 && (
                                    <span className="text-xs text-slate-600">No client signals captured.</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-4 py-3 text-[11px] text-slate-500">
        <span>Showing {filtered.length} of {visitors.length} visitor{visitors.length === 1 ? '' : 's'}.</span>
        <span>Fingerprint score reflects how many distinct client signals were captured.</span>
      </div>
    </div>
  );
};
