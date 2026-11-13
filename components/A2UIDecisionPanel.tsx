import React, { useCallback, useEffect, useState } from 'react';

interface A2UIDecisionSummary {
  decisions: number;
  ok: number;
  timeouts: number;
  errors: number;
  agreementRate: number;
  p95LatencyMs: number | null;
  spendUsd: number;
}

interface A2UIDecisionRow {
  id: string;
  createdAt: string;
  latencyMs: number | null;
  outcome: string | null;
  utterance: string;
  regexSurface: string | null;
  decisionSurface: string | null;
  confidence: number | null;
  margin: number | null;
  shouldOpen: number | null;
  costUsd: number | null;
}

interface A2UIDecisionPanelProps {
  apiBase: string;
  token: string;
}

const FLAG = 'a2ui.decision.shadow';

function money(value: number): string {
  return `$${value.toFixed(value < 0.01 ? 4 : 2)}`;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function A2UIDecisionPanel({ apiBase, token }: A2UIDecisionPanelProps) {
  const [summary, setSummary] = useState<A2UIDecisionSummary | null>(null);
  const [rows, setRows] = useState<A2UIDecisionRow[]>([]);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [version, setVersion] = useState(0);
  const [flagOn, setFlagOn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setError('DevOps session token missing.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [decisionsRes, settingsRes] = await Promise.all([
        fetch(`${apiBase}/api/devops/a2ui-decisions?days=14&limit=50`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${apiBase}/api/devops/global-settings`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!decisionsRes.ok) throw new Error(`Decisions request failed (HTTP ${decisionsRes.status})`);
      const decisionsBody = await decisionsRes.json();
      setSummary(decisionsBody.summary ?? null);
      setRows(Array.isArray(decisionsBody.rows) ? decisionsBody.rows : []);
      setDegraded(Boolean(decisionsBody.degraded));

      if (settingsRes.ok) {
        const settingsBody = await settingsRes.json();
        const nextSettings = settingsBody.settings && typeof settingsBody.settings === 'object'
          ? settingsBody.settings
          : {};
        setSettings(nextSettings);
        setVersion(Number(settingsBody.version) || 0);
        setFlagOn(nextSettings.featureFlags?.[FLAG] === true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load A2UI decision data');
    } finally {
      setLoading(false);
    }
  }, [apiBase, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleShadow = useCallback(async () => {
    if (!token || saving) return;
    setSaving(true);
    setError(null);
    try {
      const currentFlags =
        settings.featureFlags && typeof settings.featureFlags === 'object'
          ? (settings.featureFlags as Record<string, boolean>)
          : {};
      // The backend merges partial settings, so do not echo back the full blob
      // (it can include a multi-megabyte voicemail recording).
      const nextFlags = { ...currentFlags, [FLAG]: !flagOn };
      const response = await fetch(`${apiBase}/api/devops/global-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ settings: { featureFlags: nextFlags }, expectedVersion: version }),
      });
      if (!response.ok) throw new Error(`Save failed (HTTP ${response.status})`);
      const body = await response.json().catch(() => null);
      setSettings(prev => ({ ...prev, featureFlags: nextFlags }));
      setFlagOn(!flagOn);
      if (body && typeof body.version === 'number') setVersion(body.version);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the shadow flag');
    } finally {
      setSaving(false);
    }
  }, [apiBase, flagOn, saving, settings, token, version]);

  return (
    <section className="mb-8 rounded-lg border border-slate-700 bg-slate-900/60 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">A2UI Decision 1 Pilot</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Shadow-only measurement of regex misses and false opens. Decisions never change the UI.
            The backend also requires <code className="font-mono text-cyan-300">A2UI_DECISION_ENABLED=true</code>{' '}
            and a Decisions API key.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-xs text-slate-400">
            <div>Shadow flag</div>
            <div className={flagOn ? 'text-emerald-300' : 'text-slate-500'}>
              {loading ? 'Loading…' : flagOn ? 'Enabled' : 'Disabled'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void toggleShadow()}
            disabled={loading || saving || !token}
            className={`rounded-md px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${
              flagOn ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            {saving ? 'Saving…' : flagOn ? 'Disable shadow' : 'Enable shadow'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {error}
        </div>
      )}
      {degraded && (
        <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Telemetry is unavailable, so decision rows cannot be shown. The app is unaffected.
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['Decisions', summary ? String(summary.decisions) : '—'],
          ['OK', summary ? String(summary.ok) : '—'],
          ['Timeouts', summary ? String(summary.timeouts) : '—'],
          ['Regex agreement', summary ? percent(summary.agreementRate) : '—'],
          ['p95 latency', summary?.p95LatencyMs != null ? `${Math.round(summary.p95LatencyMs)} ms` : '—'],
          ['Spend', summary ? money(summary.spendUsd) : '—'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-slate-700 bg-slate-800/60 p-3">
            <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
            <div className="mt-1 text-lg font-semibold text-white">{value}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-700">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-800 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Utterance</th>
              <th className="px-3 py-2">Regex</th>
              <th className="px-3 py-2">Decision</th>
              <th className="px-3 py-2">Conf.</th>
              <th className="px-3 py-2">Latency</th>
              <th className="px-3 py-2">Outcome</th>
              <th className="px-3 py-2">Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-slate-400" colSpan={8}>
                  {loading ? 'Loading…' : 'No shadow decisions yet. Enable the flag, then use the app.'}
                </td>
              </tr>
            )}
            {rows.map(row => (
              <tr key={row.id} className="align-top text-slate-200">
                <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-400">
                  {row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}
                </td>
                <td className="max-w-md px-3 py-2">
                  <div className="truncate" title={row.utterance}>{row.utterance || '—'}</div>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-400">{row.regexSurface || '—'}</td>
                <td className="px-3 py-2 font-mono text-xs text-cyan-300">{row.decisionSurface || 'NONE'}</td>
                <td className="px-3 py-2 text-xs">
                  {row.confidence != null ? percent(row.confidence) : '—'}
                </td>
                <td className="px-3 py-2 text-xs">{row.latencyMs != null ? `${row.latencyMs} ms` : '—'}</td>
                <td className="px-3 py-2 text-xs">{row.outcome || '—'}</td>
                <td className="px-3 py-2 text-xs">{row.costUsd != null ? money(row.costUsd) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
