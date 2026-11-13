import React, { useEffect, useState } from 'react';
import {
  subscribeA2UIDecisionInspector,
  type A2UIDecisionShadowEvent,
} from '../services/a2uiDecisionClient';
import {
  A2UI_DECISION_CATALOG_VERSION,
  getCatalogEntry,
} from '../services/a2uiDecisionCatalog';
import { useGlobalSettings } from '../utils/globalSettings';

interface ShadowDecision {
  surfaceId: string | null;
  shouldOpen: number;
  confidence: number;
  margin: number;
  needsClarification: number;
  routeRisk: number;
  top3?: Array<{ id: string; p: number }>;
  runnerUpSurfaceId?: string | null;
}

interface ShadowResponse {
  outcome?: string;
  decision?: ShadowDecision | null;
  latencyMs?: number;
  usage?: { inputTokens?: number; costUsd?: number };
  spentUsd?: number;
  capUsd?: number;
  error?: string;
  requestId?: string;
  model?: string;
}

interface A2UIDecisionInspectorProps {
  enabled: boolean;
  onDisable?: () => void;
}

function normalizeSurface(id: string | null | undefined): string | null {
  if (!id) return null;
  return id.replace(/^surface:/, '');
}

function surfaceLabel(id: string | null | undefined): string {
  if (!id) return 'No surface';
  const entry =
    getCatalogEntry(id) ??
    getCatalogEntry(id.startsWith('surface:') ? id : `surface:${id}`);
  return entry?.label ?? id;
}

function pct(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${Math.round(value * 100)}%`;
}

function money(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `$${value.toFixed(value < 0.01 ? 4 : 2)}`;
}

function badgeFor(
  event: A2UIDecisionShadowEvent,
  response: ShadowResponse | null,
  decision: ShadowDecision | null,
  regexSurface: string | null,
  decisionSurface: string | null,
): { label: string; className: string } {
  if (event.error || (event.httpStatus !== null && event.httpStatus >= 400)) {
    return { label: 'ERROR', className: 'border-rose-500/50 bg-rose-500/15 text-rose-300' };
  }
  if (response?.outcome === 'sampled_out') {
    return { label: 'SAMPLED OUT', className: 'border-slate-500/50 bg-slate-500/15 text-slate-300' };
  }
  if (response?.outcome === 'budget_capped') {
    return { label: 'BUDGET CAPPED', className: 'border-amber-500/50 bg-amber-500/15 text-amber-300' };
  }
  if (!decision) {
    return { label: 'NO DECISION', className: 'border-slate-500/50 bg-slate-500/15 text-slate-300' };
  }

  const normalizedRegex = normalizeSurface(regexSurface);
  const normalizedDecision = normalizeSurface(decisionSurface);
  if (normalizedRegex === null && normalizedDecision === null) {
    return { label: 'NO SURFACE', className: 'border-slate-500/50 bg-slate-500/15 text-slate-300' };
  }
  if (normalizedRegex !== null && normalizedDecision !== null && normalizedRegex === normalizedDecision) {
    return { label: 'AGREES', className: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300' };
  }
  if (normalizedDecision !== null && normalizedRegex === null) {
    return { label: 'WOULD TAKE OVER', className: 'border-amber-500/50 bg-amber-500/15 text-amber-300' };
  }
  if (normalizedDecision === null) {
    return { label: 'WOULD NOT OPEN', className: 'border-sky-500/50 bg-sky-500/15 text-sky-300' };
  }
  return { label: 'DIFFERS', className: 'border-amber-500/50 bg-amber-500/15 text-amber-300' };
}

export const A2UIDecisionInspector: React.FC<A2UIDecisionInspectorProps> = ({
  enabled,
  onDisable,
}) => {
  const globalSettings = useGlobalSettings();
  const [lastEvent, setLastEvent] = useState<A2UIDecisionShadowEvent | null>(null);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    setLastEvent(null);
    return subscribeA2UIDecisionInspector(setLastEvent);
  }, [enabled]);

  if (!enabled) return null;

  const flagOn = globalSettings.featureFlags['a2ui.decision.shadow'] === true;
  const response = (lastEvent?.response ?? null) as ShadowResponse | null;
  const decision = response?.decision ?? null;
  const decisionSurface = decision?.surfaceId ?? null;
  const regexSurface = lastEvent?.input.regexSurface ?? null;
  const badge = lastEvent
    ? badgeFor(lastEvent, response, decision, regexSurface, decisionSurface)
    : null;
  const wouldTakeOver = badge?.label === 'WOULD TAKE OVER' || badge?.label === 'DIFFERS';
  const errorMessage = lastEvent?.error ?? response?.error ?? null;

  return (
    <aside
      data-testid="a2ui-decision-inspector"
      className="fixed bottom-4 right-4 z-[9500] w-[min(430px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-cyan-500/30 bg-slate-950/95 text-slate-100 shadow-2xl shadow-cyan-950/50 backdrop-blur"
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">
              Decision 1 Inspector
            </span>
          </div>
          <p className="mt-1 text-[10px] text-slate-400">
            Shadow only — regex still controls every surface
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setExpanded(value => !value)}
            className="rounded px-2 py-1 text-[10px] font-semibold text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            aria-label={expanded ? 'Collapse decision inspector' : 'Expand decision inspector'}
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
          {onDisable && (
            <button
              type="button"
              onClick={onDisable}
              className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-800 hover:text-slate-200"
              aria-label="Disable decision inspector"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {!expanded && lastEvent && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 text-xs">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badge?.className}`}>
            {badge?.label}
          </span>
          <span className="truncate text-slate-400">
            {regexSurface ?? 'none'} → {decisionSurface ?? 'none'}
          </span>
        </div>
      )}

      {expanded && (
        <div className="max-h-[70vh] space-y-3 overflow-y-auto px-4 py-3">
          {!flagOn && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
              The <code className="font-mono">a2ui.decision.shadow</code> flag is off. Enable it in
              DevOps → A2UI to receive shadow results.
            </div>
          )}

          {!lastEvent && (
            <div className="rounded-md border border-slate-800 bg-slate-900/70 px-3 py-4 text-xs text-slate-400">
              <p className="font-semibold text-slate-300">Waiting for the next eligible chat turn…</p>
              <p className="mt-1">
                This inspector only reads the shadow response. It never opens or changes a surface.
              </p>
              <p className="mt-2 text-[10px] text-slate-500">
                The pilot normally samples 10% of turns. Set{' '}
                <code className="font-mono text-cyan-300">A2UI_DECISION_DEBUG_ENABLED=true</code>{' '}
                on the backend to inspect every turn.
              </p>
            </div>
          )}

          {lastEvent && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badge?.className}`}>
                  {badge?.label}
                </span>
                <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
                  SHADOW — NOT APPLIED
                </span>
                {lastEvent.input.debug && (
                  <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-300">
                    DEBUG BYPASS
                  </span>
                )}
                <span className="ml-auto text-[10px] text-slate-500">
                  {new Date(lastEvent.receivedAt).toLocaleTimeString()}
                </span>
              </div>

              <div className="rounded-md border border-slate-800 bg-slate-900/70 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  User message
                </div>
                <p className="mt-1 line-clamp-3 text-xs text-slate-200">
                  {lastEvent.input.utterance || '—'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border border-slate-800 bg-slate-900/70 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Regex chose</div>
                  <div className="mt-1 font-mono text-[11px] text-slate-300">
                    {regexSurface ?? 'none'}
                  </div>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-900/70 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Decision 1 chose</div>
                  <div className={`mt-1 font-mono text-[11px] ${wouldTakeOver ? 'text-amber-300' : 'text-cyan-300'}`}>
                    {decisionSurface ?? 'none'}
                  </div>
                </div>
              </div>

              {response?.outcome === 'sampled_out' && (
                <div className="rounded-md border border-slate-700 bg-slate-900/70 px-3 py-2 text-[11px] text-slate-400">
                  This turn was dropped by the 10% sampler. Set{' '}
                  <code className="font-mono text-cyan-300">A2UI_DECISION_DEBUG_ENABLED=true</code>{' '}
                  on the backend to see every turn.
                </div>
              )}

              {errorMessage && (
                <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">
                  {errorMessage}
                </div>
              )}

              {decision && (
                <>
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                    {[
                      ['Confidence', pct(decision.confidence)],
                      ['Margin', pct(decision.margin)],
                      ['Should open', pct(decision.shouldOpen)],
                      ['Clarify', pct(decision.needsClarification)],
                      ['Route risk', String(decision.routeRisk)],
                      ['Latency', `${eventLatency(lastEvent, response)} ms`],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-md border border-slate-800 bg-slate-900/70 p-2">
                        <div className="text-[9px] uppercase tracking-wide text-slate-500">{label}</div>
                        <div className="mt-0.5 font-semibold text-slate-200">{value}</div>
                      </div>
                    ))}
                  </div>

                  {decision.top3 && decision.top3.length > 0 && (
                    <div className="rounded-md border border-slate-800 bg-slate-900/70 p-3">
                      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Top candidates
                      </div>
                      <div className="space-y-2">
                        {decision.top3.map(item => (
                          <div key={item.id}>
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="truncate text-slate-300">{surfaceLabel(item.id)}</span>
                              <span className="shrink-0 font-mono text-slate-500">{pct(item.p)}</span>
                            </div>
                            <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-800">
                              <div
                                className="h-full rounded-full bg-cyan-400"
                                style={{ width: `${Math.round(Math.max(0, Math.min(1, item.p)) * 100)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 sm:grid-cols-4">
                <div>
                  <div className="uppercase tracking-wide">HTTP</div>
                  <div className="mt-0.5 text-slate-300">{lastEvent.httpStatus ?? 'network'}</div>
                </div>
                <div>
                  <div className="uppercase tracking-wide">Round trip</div>
                  <div className="mt-0.5 text-slate-300">{lastEvent.roundTripMs} ms</div>
                </div>
                <div>
                  <div className="uppercase tracking-wide">Tokens</div>
                  <div className="mt-0.5 text-slate-300">{response?.usage?.inputTokens ?? '—'}</div>
                </div>
                <div>
                  <div className="uppercase tracking-wide">Call cost</div>
                  <div className="mt-0.5 text-slate-300">{money(response?.usage?.costUsd)}</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-2 text-[10px] text-slate-500">
                <span>
                  {response?.model ?? 'gemini-decision-1'} · {A2UI_DECISION_CATALOG_VERSION}
                </span>
                <span>
                  Spend {money(response?.spentUsd)} / cap {money(response?.capUsd)}
                </span>
              </div>

              {decision && (
                <div className="rounded-md border border-slate-800 bg-slate-900/70 px-3 py-2 text-[10px] leading-relaxed text-slate-400">
                  Agent: {lastEvent.input.state.activeAgent ?? 'none'} · Points:{' '}
                  {lastEvent.input.state.pointCountBucket} · Boundary:{' '}
                  {lastEvent.input.state.hasBoundary ? 'yes' : 'no'} · Centerlines:{' '}
                  {lastEvent.input.state.centerlineCountBucket} · CAD standards:{' '}
                  {lastEvent.input.state.cadStandardsLoaded ? 'loaded' : 'not loaded'}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </aside>
  );
};

function eventLatency(
  event: A2UIDecisionShadowEvent,
  response: ShadowResponse | null,
): number {
  return typeof response?.latencyMs === 'number' ? response.latencyMs : event.roundTripMs;
}
