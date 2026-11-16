/**
 * DevOps → Recordings.
 *
 * Issues portable LSR-… keys, opens an unlocked app tab with a two-minute
 * launch token, and lists recorder session metadata. Event bytes never reach
 * this panel or the backend.
 */

import { useCallback, useEffect, useState } from 'react';

interface RecorderKeyRow {
  id: string;
  maskedKey: string;
  label: string;
  ownerEmail: string | null;
  createdBy: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

interface RecorderSessionRow {
  id: string;
  title: string;
  projectLabel: string | null;
  durationMs: number;
  eventCount: number;
  appVersion: string | null;
  createdAt: string;
  maskedKey: string | null;
  ownerEmail: string | null;
}

const apiBase = (): string =>
  String((import.meta as any)?.env?.VITE_API_URL || '').trim().replace(/\/+$/, '');

const apiUrl = (path: string): string => `${apiBase()}/api/recorder${path}`;

const appBaseUrl = (): string => {
  const configured = String((import.meta as any)?.env?.VITE_APP_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  if (window.location.hostname.startsWith('devops.')) return 'https://landsurv.ai';
  return window.location.origin;
};

const formatDuration = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

const formatDate = (value: string | null): string => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
};

const readError = async (response: Response): Promise<string> => {
  try {
    const body = await response.json();
    return String(body?.error || body?.message || `Request failed (${response.status}).`);
  } catch {
    return `Request failed (${response.status}).`;
  }
};

export const DevOpsRecordingsPanel: React.FC = () => {
  const [keys, setKeys] = useState<RecorderKeyRow[]>([]);
  const [sessions, setSessions] = useState<RecorderSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issuedKey, setIssuedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [label, setLabel] = useState('LandSurv recorder');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ttlDays, setTtlDays] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [keysResponse, sessionsResponse] = await Promise.all([
        fetch(apiUrl('/keys'), { credentials: 'include' }),
        fetch(apiUrl('/sessions'), { credentials: 'include' }),
      ]);
      if (!keysResponse.ok) {
        setError(await readError(keysResponse));
        return;
      }
      const keysBody = await keysResponse.json();
      setKeys(Array.isArray(keysBody?.keys) ? keysBody.keys : []);
      if (sessionsResponse.ok) {
        const sessionsBody = await sessionsResponse.json();
        setSessions(Array.isArray(sessionsBody?.sessions) ? sessionsBody.sessions : []);
      }
    } catch {
      setError('Recorder service is unreachable. Check the backend connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const post = async (path: string, body?: unknown): Promise<any> => {
    const response = await fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await readError(response));
    return response.json();
  };

  const createKey = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await post('/keys', { label, ownerEmail: ownerEmail || undefined, ttlDays });
      setIssuedKey(result.key);
      setCopied(false);
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Could not create a recorder key.');
    } finally {
      setBusy(false);
    }
  };

  const launch = async () => {
    // Open the tab while the click is still a user gesture; the async key
    // request would otherwise be blocked as a pop-up.
    const tab = window.open('about:blank', '_blank');
    if (!tab) {
      setError('The launch tab was blocked. Allow pop-ups or copy the key and paste it in the app.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await post('/launch', { label, ownerEmail: ownerEmail || undefined, ttlDays });
      setIssuedKey(result.key);
      setCopied(false);
      const url = `${appBaseUrl()}/?recorderLaunch=${encodeURIComponent(result.launchToken)}`;
      tab.location.href = url;
      await load();
    } catch (launchError) {
      tab.close();
      setError(launchError instanceof Error ? launchError.message : 'Could not create a launch link.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    if (!window.confirm('Revoke this recorder key? The device will lose access on its next check.')) return;
    setBusy(true);
    setError(null);
    try {
      await post(`/keys/${id}/revoke`);
      await load();
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : 'Could not revoke the key.');
    } finally {
      setBusy(false);
    }
  };

  const copyKey = async () => {
    if (!issuedKey) return;
    try {
      await navigator.clipboard.writeText(issuedKey);
      setCopied(true);
    } catch {
      setError('Could not copy the key. Select it and copy manually.');
    }
  };

  return (
    <div className="space-y-4 text-sm text-gray-200">
      <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-amber-200">Session recording access</h2>
            <p className="mt-1 max-w-2xl text-xs text-gray-400">
              Issue a private phone-home key, open the app already unlocked, or review which operator recorded what.
              Recordings stay in the operator&apos;s browser and .lsvz files; this server stores keys and session metadata only.
            </p>
          </div>
          <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-200">
            Keys + registry
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-gray-700 bg-gray-800/60 p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-xs text-gray-400 md:col-span-2">
            Label
            <input
              value={label}
              onChange={event => setLabel(event.target.value)}
              maxLength={80}
              className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-white outline-none focus:border-amber-400"
            />
          </label>
          <label className="text-xs text-gray-400">
            Owner email (optional)
            <input
              value={ownerEmail}
              onChange={event => setOwnerEmail(event.target.value)}
              maxLength={200}
              placeholder="surveyor@example.com"
              className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-white outline-none focus:border-amber-400"
            />
          </label>
          <label className="text-xs text-gray-400">
            Key lifetime
            <select
              value={ttlDays}
              onChange={event => setTtlDays(Number(event.target.value))}
              className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-white outline-none focus:border-amber-400"
            >
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void createKey()}
            disabled={busy}
            className="rounded-md bg-amber-400 px-3 py-1.5 text-xs font-bold text-gray-950 hover:bg-amber-300 disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Create recorder key'}
          </button>
          <button
            type="button"
            onClick={() => void launch()}
            disabled={busy}
            className="rounded-md border border-amber-400/50 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-400/10 disabled:opacity-50"
          >
            Launch unlocked app tab
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-md border border-gray-600 px-3 py-1.5 text-xs font-semibold text-gray-300 hover:border-gray-400 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        {issuedKey && (
          <div className="mt-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3">
            <p className="text-[11px] font-semibold text-emerald-200">
              New recorder key — shown once. Paste it into the app on another device, or keep it private.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="rounded bg-gray-950 px-3 py-1.5 font-mono text-xs text-emerald-200">{issuedKey}</code>
              <button
                type="button"
                onClick={() => void copyKey()}
                className="rounded border border-emerald-400/40 px-2 py-1 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-400/10"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={() => setIssuedKey(null)}
                className="text-[11px] text-gray-400 hover:text-white"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        {error && <p className="mt-3 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
      </div>

      <div className="rounded-lg border border-gray-700 bg-gray-800/40">
        <div className="flex items-center justify-between border-b border-gray-700 px-4 py-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">Recorder keys</h3>
          <span className="text-[10px] text-gray-500">{keys.length} total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-gray-900/60 text-[10px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2">Key</th>
                <th className="px-4 py-2">Label</th>
                <th className="px-4 py-2">Owner</th>
                <th className="px-4 py-2">Expires</th>
                <th className="px-4 py-2">Last used</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {keys.map(key => {
                const revoked = Boolean(key.revokedAt);
                const expired = new Date(key.expiresAt).getTime() < Date.now();
                return (
                  <tr key={key.id} className="border-t border-gray-800">
                    <td className="px-4 py-2 font-mono text-amber-200">{key.maskedKey}</td>
                    <td className="px-4 py-2">{key.label}</td>
                    <td className="px-4 py-2 text-gray-400">{key.ownerEmail || '—'}</td>
                    <td className="px-4 py-2 text-gray-400">{formatDate(key.expiresAt)}</td>
                    <td className="px-4 py-2 text-gray-400">{formatDate(key.lastUsedAt)}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${revoked || expired ? 'bg-rose-500/15 text-rose-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
                        {revoked ? 'revoked' : expired ? 'expired' : 'active'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {!revoked && (
                        <button
                          type="button"
                          onClick={() => void revoke(key.id)}
                          disabled={busy}
                          className="text-[11px] font-semibold text-rose-300 hover:text-rose-200 disabled:opacity-50"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!loading && keys.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-xs text-gray-500">
                    No recorder keys yet. Create one above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-gray-700 bg-gray-800/40">
        <div className="flex items-center justify-between border-b border-gray-700 px-4 py-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">Session registry</h3>
          <span className="text-[10px] text-gray-500">Metadata only · no event bytes</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-gray-900/60 text-[10px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Project</th>
                <th className="px-4 py-2">Duration</th>
                <th className="px-4 py-2">Events</th>
                <th className="px-4 py-2">Key</th>
                <th className="px-4 py-2">Recorded</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(session => (
                <tr key={session.id} className="border-t border-gray-800">
                  <td className="px-4 py-2 font-medium text-gray-200">{session.title || 'Untitled training'}</td>
                  <td className="px-4 py-2 text-gray-400">{session.projectLabel || '—'}</td>
                  <td className="px-4 py-2 font-mono text-gray-400">{formatDuration(session.durationMs)}</td>
                  <td className="px-4 py-2 text-gray-400">{session.eventCount}</td>
                  <td className="px-4 py-2 font-mono text-[10px] text-amber-200">{session.maskedKey || '—'}</td>
                  <td className="px-4 py-2 text-gray-400">{formatDate(session.createdAt)}</td>
                </tr>
              ))}
              {!loading && sessions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-xs text-gray-500">
                    No recording sessions registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DevOpsRecordingsPanel;
