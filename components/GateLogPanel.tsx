import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type GateLogGate = 'gate-1' | 'gate-2';

export interface GateLogEntry {
  id: string;
  visitorName: string;
  gate: GateLogGate;
  signed: boolean;
  note: string | null;
  createdAt: string;
  createdBy: string | null;
}

interface GateLogPanelProps {
  apiUrl: (path: string) => string;
  sessionToken: string;
  onUnauthorized?: () => void;
}

const GATE_OPTIONS: Array<{ value: GateLogGate; label: string }> = [
  { value: 'gate-1', label: 'Gate 1' },
  { value: 'gate-2', label: 'Gate 2' },
];

const gateLabel = (gate: GateLogGate): string => (
  gate === 'gate-2' ? 'Gate 2' : 'Gate 1'
);

const normalizeEntry = (raw: any): GateLogEntry => ({
  id: String(raw?.id ?? ''),
  visitorName: String(raw?.visitor_name ?? raw?.visitorName ?? 'Unknown visitor'),
  gate: raw?.gate === 'gate-2' ? 'gate-2' : 'gate-1',
  signed: Boolean(raw?.signed),
  note: raw?.note ? String(raw.note) : null,
  createdAt: String(raw?.created_at ?? raw?.createdAt ?? new Date().toISOString()),
  createdBy: raw?.created_by ?? raw?.createdBy ?? null,
});

const responseError = async (response: Response): Promise<string> => {
  const text = await response.text().catch(() => '');
  if (!text) return `HTTP ${response.status}`;
  try {
    const payload = JSON.parse(text);
    return String(payload?.error || text);
  } catch {
    return text;
  }
};

const formatArrival = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const authHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

/**
 * Persistent record of everyone who arrives through either site gate. Staff
 * log the visitor and explicitly mark whether a signature was collected, so a
 * refusal to sign never drops the arrival from the record.
 */
export const GateLogPanel: React.FC<GateLogPanelProps> = ({
  apiUrl,
  sessionToken,
  onUnauthorized,
}) => {
  const [entries, setEntries] = useState<GateLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visitorName, setVisitorName] = useState('');
  const [gate, setGate] = useState<GateLogGate>('gate-1');
  const [signed, setSigned] = useState(false);
  const [note, setNote] = useState('');

  const unauthorizedRef = useRef(onUnauthorized);
  unauthorizedRef.current = onUnauthorized;

  const loadEntries = useCallback(async () => {
    if (!sessionToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(apiUrl('/api/devops/gate-log?limit=300'), {
        cache: 'no-store',
        headers: authHeaders(sessionToken),
      });
      if (response.status === 401) {
        unauthorizedRef.current?.();
        return;
      }
      if (!response.ok) throw new Error(await responseError(response));
      const payload = await response.json();
      setEntries(Array.isArray(payload.entries) ? payload.entries.map(normalizeEntry) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the gate log.');
    } finally {
      setLoading(false);
    }
  }, [apiUrl, sessionToken]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const stats = useMemo(() => {
    const gate1 = entries.filter(entry => entry.gate === 'gate-1').length;
    const gate2 = entries.filter(entry => entry.gate === 'gate-2').length;
    const signedCount = entries.filter(entry => entry.signed).length;
    return {
      total: entries.length,
      gate1,
      gate2,
      signed: signedCount,
      unsigned: entries.length - signedCount,
    };
  }, [entries]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = visitorName.trim();
    if (!name) {
      setError('Enter a visitor name before logging the arrival.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(apiUrl('/api/devops/gate-log'), {
        method: 'POST',
        headers: authHeaders(sessionToken),
        body: JSON.stringify({
          visitorName: name,
          gate,
          signed,
          note: note.trim() || null,
        }),
      });
      if (response.status === 401) {
        unauthorizedRef.current?.();
        return;
      }
      if (!response.ok) throw new Error(await responseError(response));
      const payload = await response.json();
      if (payload?.entry) {
        const entry = normalizeEntry(payload.entry);
        setEntries(prev => [entry, ...prev.filter(existing => existing.id !== entry.id)]);
      } else {
        await loadEntries();
      }
      setVisitorName('');
      setNote('');
      setSigned(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record the arrival.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-testid="gate-log-panel" className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Gate Log</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Every arrival through either gate is recorded here, including visitors who decline to sign.
            This log is private to the DevOps console and uses the same admin session as the other logs.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadEntries()}
          disabled={loading}
          className="rounded-lg bg-cyan-600 px-4 py-2 text-white transition-colors hover:bg-cyan-700 disabled:bg-slate-600"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Arrivals', value: stats.total, tone: 'text-cyan-300' },
          { label: 'Gate 1', value: stats.gate1, tone: 'text-emerald-300' },
          { label: 'Gate 2', value: stats.gate2, tone: 'text-emerald-300' },
          { label: 'Did not sign', value: stats.unsigned, tone: 'text-amber-300' },
        ].map(card => (
          <div key={card.label} className="rounded-lg border border-slate-700 bg-slate-800 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{card.label}</p>
            <p className={`mt-1 text-2xl font-bold ${card.tone}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-lg border border-slate-700 bg-slate-800 p-4"
      >
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_auto_minmax(0,1.4fr)_auto] md:items-end">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Visitor name
            </span>
            <input
              aria-label="Visitor name"
              value={visitorName}
              onChange={event => setVisitorName(event.target.value)}
              maxLength={120}
              required
              placeholder="Full name or description"
              className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-500"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Gate
            </span>
            <select
              aria-label="Gate"
              value={gate}
              onChange={event => setGate(event.target.value as GateLogGate)}
              className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
            >
              {GATE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <div>
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Signature
            </span>
            <div role="group" aria-label="Signature status" className="flex overflow-hidden rounded border border-slate-600">
              <button
                type="button"
                aria-pressed={signed}
                onClick={() => setSigned(true)}
                className={`px-3 py-2 text-xs font-semibold transition-colors ${
                  signed ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Signed
              </button>
              <button
                type="button"
                aria-pressed={!signed}
                onClick={() => setSigned(false)}
                className={`px-3 py-2 text-xs font-semibold transition-colors ${
                  !signed ? 'bg-amber-600 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Did not sign
              </button>
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Note (company / vehicle)
            </span>
            <input
              aria-label="Note (company / vehicle)"
              value={note}
              onChange={event => setNote(event.target.value)}
              maxLength={500}
              placeholder="Optional"
              className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-500"
            />
          </label>

          <button
            type="submit"
            disabled={saving || !visitorName.trim()}
            className="h-[38px] rounded bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-600"
          >
            {saving ? 'Saving…' : 'Log arrival'}
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {error}
          </p>
        )}
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 px-4 py-3">
          <h3 className="font-semibold text-white">Recent arrivals</h3>
          <span className="text-xs text-slate-400">
            {stats.total} recorded · {stats.signed} signed · {stats.unsigned} did not sign
          </span>
        </div>

        {loading ? (
          <div className="px-4 py-12 text-center text-slate-400">Loading gate log…</div>
        ) : entries.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-slate-400">No gate arrivals recorded yet.</p>
            <p className="mt-1 text-xs text-slate-500">Log the first arrival above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="border-b border-slate-700 bg-slate-700/50">
                <tr>
                  {['Arrived', 'Visitor', 'Gate', 'Signature', 'Note'].map(header => (
                    <th
                      key={header}
                      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-300"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map(entry => (
                  <tr
                    key={entry.id || `${entry.createdAt}-${entry.visitorName}`}
                    data-testid={`gate-log-row-${entry.id}`}
                    className="border-b border-slate-700 transition-colors last:border-b-0 hover:bg-slate-700/30"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-300">
                      {formatArrival(entry.createdAt)}
                      {entry.createdBy && (
                        <span className="mt-0.5 block text-[10px] text-slate-500">by {entry.createdBy}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-white">{entry.visitorName}</td>
                    <td className="px-4 py-3">
                      <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-xs font-semibold text-cyan-200">
                        {gateLabel(entry.gate)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded px-2 py-0.5 text-xs font-semibold ${
                        entry.signed
                          ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                          : 'border border-amber-500/40 bg-amber-500/10 text-amber-300'
                      }`}>
                        {entry.signed ? 'Signed' : 'Did not sign'}
                      </span>
                    </td>
                    <td className="max-w-md px-4 py-3 text-sm text-slate-300">{entry.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default GateLogPanel;
