/**
 * CACP Activity Log Panel
 *
 * DevOps-side viewer for inter-agent communication traffic. Subscribes to
 * the InterAgentCommunication ring buffer (last 500 events, persisted to
 * localStorage) and renders a filterable, exportable table.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { interAgentComm, type CacpLogEntry, type CacpLogPhase } from '../services/InterAgentCommunication';
import { useErrorReporter } from '../contexts/AppStateContext';

const PHASE_COLORS: Record<CacpLogPhase, string> = {
  send: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  handler: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30',
  response: 'text-blue-300 bg-blue-500/10 border-blue-500/30',
  error: 'text-red-300 bg-red-500/10 border-red-500/30',
  'no-handler': 'text-yellow-300 bg-yellow-500/10 border-yellow-500/30',
};

const formatTime = (ts: number) => {
  const d = new Date(ts);
  return d.toISOString().slice(11, 23);
};

const downloadJson = (reportError: ReturnType<typeof useErrorReporter>['reportError']) => {
  try {
    const blob = new Blob([interAgentComm.exportLogJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cacp-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    reportError({ title: 'Download failed', message: e instanceof Error ? e.message : String(e), error: e });
  }
};

const copyJson = async () => {
  try {
    await navigator.clipboard.writeText(interAgentComm.exportLogJson());
    return true;
  } catch {
    return false;
  }
};

export const CacpActivityLogPanel: React.FC = () => {
  const [entries, setEntries] = useState<CacpLogEntry[]>(() => interAgentComm.getLog());
  const { reportError } = useErrorReporter();
  const [filterCommand, setFilterCommand] = useState('');
  const [filterAgent, setFilterAgent] = useState('');
  const [filterTrace, setFilterTrace] = useState('');
  const [filterPhase, setFilterPhase] = useState<CacpLogPhase | 'all'>('all');
  const [autoFollow, setAutoFollow] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [copyFlash, setCopyFlash] = useState(false);
  const [registeredCommands, setRegisteredCommands] = useState<string[]>(() => interAgentComm.listRegisteredCommands());
  const [policyMode, setPolicyMode] = useState<'off' | 'soft' | 'hard'>(() => interAgentComm.getPolicyMode());
  const [yieldMs, setYieldMs] = useState<number>(() => interAgentComm.getCooperativeYieldMs());
  const [timeoutCommand, setTimeoutCommand] = useState('cogo_shrinkwrap');
  const [timeoutMsInput, setTimeoutMsInput] = useState<number>(() => interAgentComm.getCommandTimeout('cogo_shrinkwrap') ?? 20000);
  const [controlFlash, setControlFlash] = useState<string>('');

  type RuntimePreset = 'safe' | 'balanced' | 'strict';

  useEffect(() => {
    const unsub = interAgentComm.onLog(setEntries);
    return unsub;
  }, []);

  useEffect(() => {
    setRegisteredCommands(interAgentComm.listRegisteredCommands());
  }, [entries]);

  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (filterCommand && !e.command.toLowerCase().includes(filterCommand.toLowerCase())) return false;
      if (filterPhase !== 'all' && e.phase !== filterPhase) return false;
      if (filterTrace && !(e.traceId || '').toLowerCase().includes(filterTrace.toLowerCase())) return false;
      if (filterAgent) {
        const a = filterAgent.toUpperCase();
        if (String(e.from).toUpperCase() !== a && String(e.to).toUpperCase() !== a) return false;
      }
      return true;
    });
  }, [entries, filterCommand, filterAgent, filterPhase, filterTrace]);

  // Stats
  const stats = useMemo(() => {
    const byPhase: Record<string, number> = {};
    const byCommand: Record<string, number> = {};
    for (const e of entries) {
      byPhase[e.phase] = (byPhase[e.phase] ?? 0) + 1;
      byCommand[e.command] = (byCommand[e.command] ?? 0) + 1;
    }
    const topCommands = Object.entries(byCommand)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    return { total: entries.length, byPhase, topCommands };
  }, [entries]);

  const visible = autoFollow ? filtered.slice(-200) : filtered;

  const applyPolicyMode = (mode: 'off' | 'soft' | 'hard') => {
    interAgentComm.setPolicyMode(mode);
    setPolicyMode(interAgentComm.getPolicyMode());
    setControlFlash(`Policy mode set to ${mode}`);
    setTimeout(() => setControlFlash(''), 1600);
  };

  const applyYieldMs = () => {
    const safe = Number.isFinite(yieldMs) ? Math.max(0, Math.floor(yieldMs)) : 0;
    interAgentComm.setCooperativeYieldMs(safe);
    setYieldMs(interAgentComm.getCooperativeYieldMs());
    setControlFlash(`Yield set to ${safe}ms`);
    setTimeout(() => setControlFlash(''), 1600);
  };

  const applyTimeoutOverride = () => {
    const safe = Number.isFinite(timeoutMsInput) ? Math.max(1000, Math.floor(timeoutMsInput)) : 5000;
    if (!timeoutCommand.trim()) return;
    interAgentComm.setCommandTimeout(timeoutCommand.trim(), safe);
    setTimeoutMsInput(interAgentComm.getCommandTimeout(timeoutCommand.trim()) ?? safe);
    setControlFlash(`Timeout for ${timeoutCommand.trim()} set to ${safe}ms`);
    setTimeout(() => setControlFlash(''), 1600);
  };

  const applyPreset = (preset: RuntimePreset) => {
    if (preset === 'safe') {
      interAgentComm.setPolicyMode('soft');
      interAgentComm.setCooperativeYieldMs(2);
      interAgentComm.setCommandTimeout('cogo_shrinkwrap', 25000);
      interAgentComm.setCommandTimeout('cogo_traverse_adjust', 18000);
      interAgentComm.setCommandTimeout('cogo_subdivide_parallel', 18000);
      interAgentComm.setCommandTimeout('cogo_subdivide_swing', 18000);
    } else if (preset === 'balanced') {
      interAgentComm.setPolicyMode('soft');
      interAgentComm.setCooperativeYieldMs(1);
      interAgentComm.setCommandTimeout('cogo_shrinkwrap', 20000);
      interAgentComm.setCommandTimeout('cogo_traverse_adjust', 15000);
      interAgentComm.setCommandTimeout('cogo_subdivide_parallel', 15000);
      interAgentComm.setCommandTimeout('cogo_subdivide_swing', 15000);
    } else {
      interAgentComm.setPolicyMode('hard');
      interAgentComm.setCooperativeYieldMs(0);
      interAgentComm.setCommandTimeout('cogo_shrinkwrap', 12000);
      interAgentComm.setCommandTimeout('cogo_traverse_adjust', 10000);
      interAgentComm.setCommandTimeout('cogo_subdivide_parallel', 10000);
      interAgentComm.setCommandTimeout('cogo_subdivide_swing', 10000);
    }
    setPolicyMode(interAgentComm.getPolicyMode());
    setYieldMs(interAgentComm.getCooperativeYieldMs());
    setTimeoutMsInput(interAgentComm.getCommandTimeout(timeoutCommand) ?? timeoutMsInput);
    setControlFlash(`Applied ${preset} preset`);
    setTimeout(() => setControlFlash(''), 1800);
  };

  const runtimeStats = interAgentComm.getStats();

  const toggleExpand = (seq: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(seq)) next.delete(seq); else next.add(seq);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Stats summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
          <div className="text-xs text-slate-400">Total events</div>
          <div className="text-2xl font-bold text-cyan-400">{stats.total}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
          <div className="text-xs text-slate-400">Sends</div>
          <div className="text-2xl font-bold text-emerald-400">{stats.byPhase.send ?? 0}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
          <div className="text-xs text-slate-400">Responses</div>
          <div className="text-2xl font-bold text-blue-400">{stats.byPhase.response ?? 0}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
          <div className="text-xs text-slate-400">Errors / No-Handler</div>
          <div className="text-2xl font-bold text-red-400">
            {(stats.byPhase.error ?? 0) + (stats.byPhase['no-handler'] ?? 0)}
          </div>
        </div>
      </div>

      {/* Top commands */}
      {stats.topCommands.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-2">Top commands</div>
          <div className="flex flex-wrap gap-2 text-xs">
            {stats.topCommands.map(([cmd, count]) => (
              <button
                key={cmd}
                onClick={() => setFilterCommand(cmd)}
                className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 font-mono"
                title="Click to filter"
              >
                {cmd} <span className="text-cyan-400 ml-1">{count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={filterCommand}
          onChange={e => setFilterCommand(e.target.value)}
          placeholder="Filter command (e.g. point, deed, zoning)"
          className="flex-1 min-w-[180px] px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
        />
        <input
          type="text"
          value={filterAgent}
          onChange={e => setFilterAgent(e.target.value)}
          placeholder="Filter agent (POINT_EDITOR, DEED_READER, …)"
          className="flex-1 min-w-[180px] px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
        />
        <input
          type="text"
          value={filterTrace}
          onChange={e => setFilterTrace(e.target.value)}
          placeholder="Filter trace id"
          className="flex-1 min-w-[180px] px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
        />
        <select
          value={filterPhase}
          onChange={e => setFilterPhase(e.target.value as CacpLogPhase | 'all')}
          className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
        >
          <option value="all">All phases</option>
          <option value="send">send</option>
          <option value="handler">handler</option>
          <option value="response">response</option>
          <option value="error">error</option>
          <option value="no-handler">no-handler</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-300 select-none">
          <input
            type="checkbox"
            checked={autoFollow}
            onChange={e => setAutoFollow(e.target.checked)}
            className="accent-cyan-500"
          />
          Tail last 200
        </label>
        <button
          onClick={async () => { const ok = await copyJson(); setCopyFlash(ok); setTimeout(() => setCopyFlash(false), 1500); }}
          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-sm"
          title="Copy log JSON to clipboard"
        >
          {copyFlash ? '✓ Copied' : 'Copy JSON'}
        </button>
        <button
          onClick={() => downloadJson(reportError)}
          className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded text-sm"
          title="Download log as .json file"
        >
          ⬇ Download
        </button>
        <button
          onClick={() => { if (window.confirm('Clear the CACP activity log? This cannot be undone.')) interAgentComm.clearLog(); }}
          className="px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded text-sm"
        >
          Clear
        </button>
      </div>

      {/* Runtime hardening controls */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-400">Runtime controls</div>
          {controlFlash && <div className="text-xs text-emerald-300">{controlFlash}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-slate-400 mr-1">Presets</span>
          <button
            onClick={() => applyPreset('safe')}
            className="px-2 py-1 rounded text-xs bg-emerald-800/70 hover:bg-emerald-700 text-emerald-100 border border-emerald-600/50"
            title="Soft policy, stronger yielding, longer heavy-command timeouts"
          >
            Safe
          </button>
          <button
            onClick={() => applyPreset('balanced')}
            className="px-2 py-1 rounded text-xs bg-cyan-800/70 hover:bg-cyan-700 text-cyan-100 border border-cyan-600/50"
            title="Soft policy with default balanced performance settings"
          >
            Balanced
          </button>
          <button
            onClick={() => applyPreset('strict')}
            className="px-2 py-1 rounded text-xs bg-amber-800/70 hover:bg-amber-700 text-amber-100 border border-amber-600/50"
            title="Hard policy, minimal yielding, tighter timeouts (use after telemetry soak)"
          >
            Strict
          </button>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900/60 px-2 py-1.5 text-[11px] text-slate-300">
          <span className="text-slate-400">Active:</span> policy=<span className="font-mono text-emerald-300">{runtimeStats.policyMode}</span>
          {' · '}yield=<span className="font-mono text-cyan-300">{runtimeStats.cooperativeYieldMs}ms</span>
          {' · '}cache=<span className="font-mono text-violet-300">{runtimeStats.cacheEntries}</span>
          {' · '}queued broadcasts=<span className="font-mono text-amber-300">{Object.values(runtimeStats.pendingBroadcasts).reduce((sum, n) => sum + n, 0)}</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="rounded border border-slate-700 p-2">
            <div className="text-[11px] text-slate-400 mb-1">Policy mode</div>
            <div className="flex items-center gap-2">
              <select
                value={policyMode}
                onChange={e => setPolicyMode(e.target.value as 'off' | 'soft' | 'hard')}
                className="flex-1 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200"
              >
                <option value="off">off</option>
                <option value="soft">soft</option>
                <option value="hard">hard</option>
              </select>
              <button
                onClick={() => applyPolicyMode(policyMode)}
                className="px-2 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-xs"
              >
                Apply
              </button>
            </div>
          </div>

          <div className="rounded border border-slate-700 p-2">
            <div className="text-[11px] text-slate-400 mb-1">Cooperative yield (ms)</div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={1}
                value={yieldMs}
                onChange={e => setYieldMs(parseInt(e.target.value, 10) || 0)}
                className="w-24 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200"
              />
              <button
                onClick={applyYieldMs}
                className="px-2 py-1.5 bg-cyan-700 hover:bg-cyan-600 text-white rounded text-xs"
              >
                Apply
              </button>
            </div>
          </div>

          <div className="rounded border border-slate-700 p-2">
            <div className="text-[11px] text-slate-400 mb-1">Command timeout override</div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={timeoutCommand}
                onChange={e => setTimeoutCommand(e.target.value)}
                placeholder="command id"
                className="flex-1 min-w-[120px] px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 font-mono"
              />
              <input
                type="number"
                min={1000}
                step={500}
                value={timeoutMsInput}
                onChange={e => setTimeoutMsInput(parseInt(e.target.value, 10) || 5000)}
                className="w-24 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200"
              />
              <button
                onClick={applyTimeoutOverride}
                className="px-2 py-1.5 bg-violet-700 hover:bg-violet-600 text-white rounded text-xs"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Handler registry inspector */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-slate-400">Handler registry</div>
          <div className="text-xs text-slate-500">{registeredCommands.length} command(s)</div>
        </div>
        <div className="max-h-40 overflow-y-auto rounded border border-slate-700">
          <table className="w-full text-xs">
            <thead className="bg-slate-900 text-slate-400 border-b border-slate-700">
              <tr>
                <th className="text-left px-2 py-1.5">Command</th>
                <th className="text-right px-2 py-1.5 w-24">Handlers</th>
              </tr>
            </thead>
            <tbody>
              {registeredCommands.map(command => (
                <tr key={command} className="border-b border-slate-700/40 hover:bg-slate-700/30">
                  <td className="px-2 py-1 text-emerald-300 font-mono truncate">{command}</td>
                  <td className="px-2 py-1 text-right text-slate-300 font-mono">{interAgentComm.getHandlerCount(command)}</td>
                </tr>
              ))}
              {registeredCommands.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-2 py-2 text-slate-500 text-center">No handlers registered yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CLI hint */}
      <div className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-3 text-xs text-slate-400">
        <span className="text-cyan-400 font-mono">CLI:</span> open DevTools (F12) and use{' '}
        <code className="text-emerald-300 font-mono">__cacp.log()</code>,{' '}
        <code className="text-emerald-300 font-mono">__cacp.tail(50)</code>,{' '}
        <code className="text-emerald-300 font-mono">__cacp.stats()</code>,{' '}
        <code className="text-emerald-300 font-mono">__cacp.policy('soft')</code>,{' '}
        <code className="text-emerald-300 font-mono">__cacp.yieldMs(1)</code>,{' '}
        <code className="text-emerald-300 font-mono">__cacp.timeout('cogo_shrinkwrap', 20000)</code>,{' '}
        <code className="text-emerald-300 font-mono">__cacp.config()</code>,{' '}
        <code className="text-emerald-300 font-mono">__cacp.watch()</code>,{' '}
        <code className="text-emerald-300 font-mono">__cacp.download()</code>, or{' '}
        <code className="text-emerald-300 font-mono">__cacp.clear()</code>. The same buffer is exported here.
      </div>

      {/* Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-slate-900 text-slate-400 border-b border-slate-700">
              <tr>
                <th className="text-left px-2 py-2 w-12">#</th>
                <th className="text-left px-2 py-2 w-24">Time</th>
                <th className="text-left px-2 py-2 w-24">Phase</th>
                <th className="text-left px-2 py-2 w-24">Policy</th>
                <th className="text-left px-2 py-2 w-32">From</th>
                <th className="text-left px-2 py-2 w-32">To</th>
                <th className="text-left px-2 py-2">Command</th>
                <th className="text-left px-2 py-2">Preview</th>
                <th className="text-left px-2 py-2">Trace</th>
                <th className="text-right px-2 py-2 w-16">ms</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center text-slate-500 py-12">
                    No CACP traffic recorded yet. Interact with the app — try the Boundary Agent, Point Editor, or Zoning agent.
                  </td>
                </tr>
              )}
              {visible.map(e => {
                const isOpen = expanded.has(e.seq);
                return (
                  <React.Fragment key={e.seq}>
                    <tr
                      onClick={() => toggleExpand(e.seq)}
                      className="border-b border-slate-700/40 hover:bg-slate-700/30 cursor-pointer"
                    >
                      <td className="px-2 py-1 text-slate-500 font-mono">{e.seq}</td>
                      <td className="px-2 py-1 text-slate-400 font-mono">{formatTime(e.timestamp)}</td>
                      <td className="px-2 py-1">
                        <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-mono ${PHASE_COLORS[e.phase]}`}>
                          {e.phase}
                        </span>
                      </td>
                      <td className="px-2 py-1">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-mono ${
                            e.policyStatus === 'blocked'
                              ? 'text-red-300 bg-red-500/10 border-red-500/30'
                              : e.policyStatus === 'warn'
                                ? 'text-amber-300 bg-amber-500/10 border-amber-500/30'
                                : 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
                          }`}
                        >
                          {e.policyStatus ?? 'pass'}
                        </span>
                      </td>
                      <td className="px-2 py-1 text-slate-200 font-mono truncate max-w-[140px]">{String(e.from)}</td>
                      <td className="px-2 py-1 text-slate-200 font-mono truncate max-w-[140px]">{String(e.to)}</td>
                      <td className="px-2 py-1 text-emerald-300 font-mono truncate max-w-[260px]">{e.command}</td>
                      <td className="px-2 py-1 text-slate-400 font-mono truncate max-w-[400px]">{e.preview}</td>
                      <td className="px-2 py-1 text-slate-500 font-mono truncate max-w-[180px]">{e.traceId ?? ''}</td>
                      <td className="px-2 py-1 text-right text-slate-400 font-mono">{e.latencyMs ?? ''}</td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-900/60 border-b border-slate-700/40">
                        <td colSpan={10} className="px-3 py-2">
                          <pre className="text-[11px] text-slate-300 font-mono whitespace-pre-wrap break-all">
{JSON.stringify({
  messageId: e.messageId,
  traceId: e.traceId,
  policyStatus: e.policyStatus,
  policyWarnings: e.policyWarnings,
  success: e.success,
  error: e.error,
  data: e.data,
}, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {autoFollow && filtered.length > 200 && (
        <div className="text-xs text-slate-500 text-center">
          Showing last 200 of {filtered.length} matching entries · uncheck “Tail last 200” to see all
        </div>
      )}
    </div>
  );
};

export default CacpActivityLogPanel;
