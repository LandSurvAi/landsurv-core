import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Maximize2,
  Square,
  X,
} from 'lucide-react';
import { A2UIHostContext } from './A2UISurface.tsx';
import { ScoutWordmark } from './ScoutWordmark.tsx';
import { closeA2UISurface, openA2UISurface } from '../services/a2uiSurfaces.ts';
import { scoutActivityStore } from '../services/scoutActivityStore.ts';
import type {
  A2UIScoutActivityEvent,
  ScoutCandidateAudit,
  ScoutRun,
} from '../types.ts';

const STATUS_COPY: Record<ScoutRun['status'], string> = {
  running: 'Live',
  success: 'Complete',
  error: 'Needs attention',
  cancelled: 'Stopped',
  needs_jurisdiction: 'Needs jurisdiction',
};

const STATUS_TONE: Record<ScoutRun['status'], string> = {
  running: 'border-cyan-400/35 bg-cyan-400/10 text-cyan-200',
  success: 'border-emerald-400/35 bg-emerald-400/10 text-emerald-200',
  error: 'border-amber-400/35 bg-amber-400/10 text-amber-200',
  cancelled: 'border-slate-400/25 bg-slate-400/10 text-slate-300',
  needs_jurisdiction: 'border-fuchsia-400/35 bg-fuchsia-400/10 text-fuchsia-200',
};

const DECISION_TONE: Record<ScoutCandidateAudit['decision'], string> = {
  accepted: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  accepted_federal: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
  accepted_neighbor_clip: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  accepted_ranked: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200',
  rejected: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
};

const LEVEL_TONE: Record<NonNullable<A2UIScoutActivityEvent['level']>, string> = {
  info: 'bg-slate-500',
  success: 'bg-emerald-400',
  warn: 'bg-amber-400',
  error: 'bg-rose-400',
};

function formatEventTime(at: number): string {
  try {
    return new Date(at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '';
  }
}

function DecisionBadge({ candidate }: { candidate: ScoutCandidateAudit }) {
  const label = candidate.decision === 'rejected'
    ? candidate.reason?.replace(/_/g, ' ') ?? 'rejected'
    : candidate.decision.replace(/^accepted_?/, '').replace(/_/g, ' ') || 'accepted';
  return (
    <span
      data-testid="scout-candidate-decision"
      className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${DECISION_TONE[candidate.decision]}`}
    >
      {label}
    </span>
  );
}

interface A2UIScoutActivityProps {
  /** Unique bus key for this run, so a new run cannot reopen minimized. */
  surfaceKey?: string;
  /** Inline is the compact Quick Thought summary; surface is the audit panel. */
  variant?: 'surface' | 'inline';
  /** Run to show. Defaults to the primary (newest active) run. */
  runId?: string;
}

/**
 * Scout's data panel. It reads the module-level store so events keep streaming
 * into an already-mounted surface. There is no character here — the wordmark is
 * the only Scout reference; the walking figure lives on the command bar.
 */
export const A2UIScoutActivity: React.FC<A2UIScoutActivityProps> = ({
  surfaceKey = 'scout-activity',
  variant = 'surface',
  runId,
}) => {
  const host = React.useContext(A2UIHostContext);
  const inline = variant === 'inline';
  const run = React.useSyncExternalStore(
    scoutActivityStore.subscribe,
    () => (runId ? scoutActivityStore.getRun(runId) : scoutActivityStore.getSnapshot()),
    () => (runId ? scoutActivityStore.getRun(runId) : scoutActivityStore.getSnapshot()),
  );
  const [tab, setTab] = useState<'overview' | 'candidates' | 'events' | 'raw'>('overview');

  if (!run) {
    if (inline) return null;
    return (
      <div data-testid="a2ui-scout-activity" className="p-4 text-xs text-slate-400">
        No Scout run yet. Scout checks public GIS, parcel, and zoning sources when
        a request needs a live layer. Open a GIS request or run a crawl to populate
        this audit.
      </div>
    );
  }

  const running = run.status === 'running';
  const statusIcon =
    run.status === 'success' ? <CheckCircle2 className="h-3 w-3" />
      : run.status === 'error' ? <AlertTriangle className="h-3 w-3" />
        : running ? <Loader2 className="h-3 w-3 animate-spin" />
          : <Square className="h-2.5 w-2.5" />;

  const popOut = () => {
    const key = `scout-activity-${run.id}`;
    openA2UISurface({
      key,
      definitionId: 'scout-activity',
      title: 'Scout run audit',
      subtitle: run.title,
      category: 'workspace',
      accent: 'cyan',
      size: 'standard',
      source: 'resolver:scout',
      content: <A2UIScoutActivity surfaceKey={key} variant="surface" runId={run.id} />,
    });
  };

  if (inline) {
    return (
      <div
        data-testid="a2ui-scout-inline"
        className="mt-2.5 overflow-hidden rounded-lg border border-cyan-400/20 bg-[#07111c]/85 text-xs text-slate-200"
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] px-2.5 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <ScoutWordmark size="xs" />
            <span className={`rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${STATUS_TONE[run.status]}`}>
              {STATUS_COPY[run.status]}
            </span>
          </div>
          <span className="truncate text-[9px] text-slate-500">{run.title}</span>
        </div>
        <div className="px-2.5 py-2 text-[10px] leading-relaxed text-slate-300">
          {run.summary ?? run.events[run.events.length - 1]?.message ?? 'Scout is checking public sources.'}
        </div>
        <div className="flex items-center justify-end gap-1.5 border-t border-white/[0.08] px-2.5 py-1.5">
          {running && host.onScoutStop && (
            <button
              type="button"
              onClick={() => host.onScoutStop?.()}
              className="inline-flex items-center gap-1 rounded border border-rose-400/30 bg-rose-400/10 px-2 py-1 text-[10px] font-semibold text-rose-200"
            >
              <Square className="h-2.5 w-2.5" /> Stop
            </button>
          )}
          <button
            type="button"
            onClick={popOut}
            className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-[10px] font-semibold text-cyan-200"
          >
            <Maximize2 className="h-2.5 w-2.5" /> View data
          </button>
          <button
            type="button"
            onClick={() => scoutActivityStore.reset()}
            className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-[10px] font-semibold text-slate-400"
          >
            <X className="h-2.5 w-2.5" /> Dismiss
          </button>
        </div>
      </div>
    );
  }

  const rejected = run.candidates.filter(candidate => candidate.decision === 'rejected');
  const accepted = run.candidates.filter(candidate => candidate.decision !== 'rejected');
  const stats = run.stats;

  return (
    <div data-testid="a2ui-scout-activity" className="flex min-h-0 flex-1 flex-col bg-[#070e18]/70 text-xs text-slate-200">
      <div className="border-b border-white/[0.08] px-3.5 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ScoutWordmark size="sm" />
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-slate-500">
                run audit
              </span>
            </div>
            <div className="mt-1 truncate text-[12px] font-semibold text-white">{run.title}</div>
            <div className="mt-0.5 truncate text-[10px] text-slate-400">
              {run.jurisdiction
                ? `${run.jurisdiction.county ? `${run.jurisdiction.county} County, ` : ''}${run.jurisdiction.state} · ${run.jurisdiction.source.replace('-', ' ')}`
                : run.subtitle ?? 'Resolving project jurisdiction'}
            </div>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${STATUS_TONE[run.status]}`}>
            {statusIcon}
            {STATUS_COPY[run.status]}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-slate-500">
          <span>{stats?.found ?? run.candidates.length} found</span>
          <span>·</span>
          <span className="text-emerald-300">{stats?.accepted ?? accepted.length} accepted</span>
          <span>·</span>
          <span className="text-rose-300">{stats?.rejected ?? rejected.length} rejected</span>
          {stats?.cacheHit && <><span>·</span><span className="text-cyan-300">cache</span></>}
        </div>
      </div>

      <div className="flex shrink-0 gap-1 border-b border-white/[0.08] px-2 py-1.5">
        {(['overview', 'candidates', 'events', 'raw'] as const).map(item => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`rounded px-2 py-1 text-[10px] font-semibold capitalize transition-colors ${
              tab === item ? 'bg-cyan-400/15 text-cyan-200' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            {item}
            {item === 'candidates' && run.candidates.length > 0 && (
              <span className="ml-1 font-mono text-[8px] text-slate-500">{run.candidates.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3">
        {tab === 'overview' && (
          <>
            {run.jurisdiction && (
              <div data-testid="scout-jurisdiction-card" className="rounded-lg border border-cyan-400/20 bg-cyan-400/[0.04] px-2.5 py-2">
                <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-cyan-300">Grounded jurisdiction</div>
                <div className="mt-1 text-[11px] font-semibold text-white">
                  {run.jurisdiction.county ? `${run.jurisdiction.county} County, ` : ''}{run.jurisdiction.state}
                </div>
                <div className="mt-0.5 text-[9.5px] text-slate-400">
                  AOI {run.jurisdiction.aoiCentre.latitude.toFixed(5)}, {run.jurisdiction.aoiCentre.longitude.toFixed(5)}
                  {' · '}{run.jurisdiction.confidence} confidence
                  {run.jurisdiction.sampledStates && run.jurisdiction.sampledStates.length > 1
                    ? ` · touches ${run.jurisdiction.sampledStates.join(', ')}`
                    : ''}
                </div>
              </div>
            )}
            <div>
              <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.14em] text-slate-500">Accepted sources</div>
              {accepted.length === 0 ? (
                <div className="rounded border border-white/5 bg-white/[0.02] px-2 py-1.5 text-[10px] text-slate-500">
                  No source has been accepted yet.
                </div>
              ) : (
                <div className="space-y-1">
                  {accepted.map(candidate => (
                    <div key={candidate.id} data-testid="scout-accepted-row" className="rounded border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-[10.5px] font-semibold text-slate-100">{candidate.label}</span>
                        <DecisionBadge candidate={candidate} />
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-2 text-[9px] text-slate-500">
                        <span>{candidate.provider}</span>
                        {candidate.geometryType && <span>{candidate.geometryType.replace('esriGeometry', '')}</span>}
                        {typeof candidate.featureCount === 'number' && <span>{candidate.featureCount.toLocaleString()} features</span>}
                        {candidate.jurisdiction?.state && <span>{candidate.jurisdiction.state}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.14em] text-rose-300/80">Rejected candidates</div>
              {rejected.length === 0 ? (
                <div className="rounded border border-white/5 bg-white/[0.02] px-2 py-1.5 text-[10px] text-slate-500">
                  Nothing was rejected for this footprint.
                </div>
              ) : (
                <div className="space-y-1">
                  {rejected.map(candidate => (
                    <div key={candidate.id} data-testid="scout-rejected-row" className="rounded border border-rose-400/10 bg-rose-400/[0.03] px-2 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-[10.5px] font-semibold text-slate-200">{candidate.label}</span>
                        <DecisionBadge candidate={candidate} />
                      </div>
                      <div className="mt-0.5 text-[9px] leading-relaxed text-slate-500">{candidate.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {run.warnings.length > 0 && (
              <div>
                <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.14em] text-amber-300/80">Warnings</div>
                <ul className="space-y-1 text-[9.5px] leading-relaxed text-amber-100/70">
                  {run.warnings.map((warning, index) => (
                    <li key={`${warning}-${index}`} className="rounded border border-amber-400/10 bg-amber-400/[0.03] px-2 py-1">{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {tab === 'candidates' && (
          <div className="space-y-1">
            {run.candidates.length === 0 ? (
              <div className="text-[10px] text-slate-500">No candidates recorded yet.</div>
            ) : run.candidates.map(candidate => (
              <div key={candidate.id} data-testid="scout-candidate-row" className="rounded border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[10.5px] font-semibold text-slate-100">{candidate.label}</span>
                  <DecisionBadge candidate={candidate} />
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-2 text-[9px] text-slate-500">
                  <span className="text-slate-400">{candidate.provider}</span>
                  <span>{candidate.geometryType?.replace('esriGeometry', '') ?? 'unknown geometry'}</span>
                  {typeof candidate.featureCount === 'number' && <span>{candidate.featureCount.toLocaleString()} in AOI</span>}
                  {candidate.jurisdiction?.county && <span>{candidate.jurisdiction.county} County</span>}
                  {candidate.jurisdiction?.state && <span>{candidate.jurisdiction.state}</span>}
                </div>
                <div className="mt-0.5 break-all text-[8.5px] text-slate-600">{candidate.url}</div>
                {candidate.reason && (
                  <div className="mt-0.5 font-mono text-[8.5px] text-rose-300/80">reason: {candidate.reason}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === 'events' && (
          <div aria-live="polite" className="space-y-1.5">
            {run.events.length === 0 ? (
              <div className="text-[10px] text-slate-500">No events recorded yet.</div>
            ) : run.events.map((event, index) => (
              <div key={`${event.at}-${index}`} className="flex items-start gap-2 rounded border border-white/[0.05] bg-white/[0.02] px-2 py-1.5">
                <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${LEVEL_TONE[event.level ?? 'info']}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-mono text-[8px] uppercase tracking-[0.12em] text-slate-500">
                    <span>{formatEventTime(event.at)}</span>
                    <span className="truncate">{event.phase}</span>
                  </div>
                  <div className="mt-0.5 break-words text-[10px] leading-relaxed text-slate-200">{event.message}</div>
                  {event.url && (
                    <a
                      href={event.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 text-[9px] font-semibold text-cyan-300 hover:text-cyan-100"
                    >
                      Open source <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'raw' && (
          <pre className="overflow-x-auto rounded border border-white/10 bg-black/30 p-2 font-mono text-[9px] leading-relaxed text-slate-300">
            {JSON.stringify(run, null, 2)}
          </pre>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-white/[0.08] px-3.5 py-2.5">
        <span className="truncate text-[10px] text-slate-500">
          {run.summary ?? `${run.events.length} live event${run.events.length === 1 ? '' : 's'}`}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {running && host.onScoutStop && (
            <button
              type="button"
              onClick={() => host.onScoutStop?.()}
              className="inline-flex items-center gap-1 rounded border border-rose-400/30 bg-rose-400/10 px-2 py-1 text-[10px] font-semibold text-rose-200"
            >
              <Square className="h-2.5 w-2.5" /> Stop
            </button>
          )}
          <button
            type="button"
            onClick={() => closeA2UISurface(surfaceKey)}
            className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-[10px] font-semibold text-slate-400 hover:border-white/20 hover:text-slate-200"
          >
            <X className="h-2.5 w-2.5" /> Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default A2UIScoutActivity;
