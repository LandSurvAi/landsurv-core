/**
 * Ultimate Debug Panel
 * 
 * Comprehensive debugging interface for monitoring:
 * - Inter-agent communication
 * - AI inner thoughts and reasoning
 * - Connector app logs and events
 * - Real-time message flow
 * - Connection status and performance
 */

import React, { useState, useEffect, useRef } from 'react';
import { AgentType } from '../types.ts';
import { interAgentComm, AgentMessage, AgentResponse } from '../services/InterAgentCommunication.ts';
import { XMarkIcon, FolderIcon, TrashIcon } from './icons.tsx';

interface DebugLog {
  id: string;
  timestamp: number;
  type: 'message' | 'response' | 'error' | 'connector' | 'ai-thought';
  source: string;
  target?: string;
  command?: string;
  data?: unknown;
  message?: string;
  severity?: 'info' | 'warning' | 'error' | 'success';
}

interface FilterOptions {
  showMessages: boolean;
  showResponses: boolean;
  showErrors: boolean;
  showConnector: boolean;
  showAIThoughts: boolean;
  searchQuery: string;
}

export const UltimateDebugPanel: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const [logs, setLogs] = useState<DebugLog[]>([]);
  const [filters, setFilters] = useState<FilterOptions>({
    showMessages: true,
    showResponses: true,
    showErrors: true,
    showConnector: true,
    showAIThoughts: true,
    searchQuery: '',
  });
  const [isPaused, setIsPaused] = useState(false);
  const [stats, setStats] = useState({
    totalMessages: 0,
    totalErrors: 0,
    messageRate: 0,
    connectorConnected: false,
  });
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const logCounterRef = useRef(0);

  // Subscribe to inter-agent communication
  useEffect(() => {
    if (!isOpen) return;

    const unsubscribeError = interAgentComm.onError((error, message) => {
      if (!isPaused) {
        const newLog: DebugLog = {
          id: `err-${++logCounterRef.current}`,
          timestamp: Date.now(),
          type: 'error',
          source: message.from,
          target: message.to,
          command: message.command,
          message: error.message,
          severity: 'error',
        };
        setLogs(prev => [newLog, ...prev.slice(0, 499)]);
        setStats(prev => ({ ...prev, totalErrors: prev.totalErrors + 1 }));
      }
    });

    return unsubscribeError;
  }, [isOpen, isPaused]);

  // Add connector log handler
  useEffect(() => {
    if (!isOpen) return;

    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    const captureLog = (type: 'log' | 'warn' | 'error', ...args: unknown[]) => {
      const message = args
        .map(arg => (typeof arg === 'string' ? arg : JSON.stringify(arg, null, 2)))
        .join(' ');

      // Only capture LandSurv and InterAgent logs
      if (message.includes('[') && (message.includes('Landsurv') || message.includes('InterAgent'))) {
        if (!isPaused) {
          const newLog: DebugLog = {
            id: `log-${++logCounterRef.current}`,
            timestamp: Date.now(),
            type: 'connector',
            source: message.includes('Landsurv') ? 'C3D Connector' : 'Inter-Agent System',
            message,
            severity: type === 'error' ? 'error' : type === 'warn' ? 'warning' : 'info',
          };
          setLogs(prev => [newLog, ...prev.slice(0, 499)]);
        }
      }
    };

    console.log = (...args) => {
      originalLog(...args);
      captureLog('log', ...args);
    };
    console.warn = (...args) => {
      originalWarn(...args);
      captureLog('warn', ...args);
    };
    console.error = (...args) => {
      originalError(...args);
      captureLog('error', ...args);
    };

    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    };
  }, [isOpen, isPaused]);

  // Simulate AI inner thoughts (in real implementation, these would come from Gemini API)
  useEffect(() => {
    if (!isOpen || isPaused) return;

    const interval = setInterval(() => {
      // This is where real AI thoughts would be captured from the chat
      // For now, we'll listen to message history
      const history = interAgentComm.getMessageHistory(1);
      if (history.length > 0) {
        const lastMessage = history[0];
        if (!logs.some(log => log.id === `thought-${lastMessage.id}`)) {
          const newLog: DebugLog = {
            id: `thought-${lastMessage.id}`,
            timestamp: lastMessage.timestamp,
            type: 'ai-thought',
            source: `${lastMessage.from} AI`,
            message: `Processing command: ${lastMessage.command}\nData: ${JSON.stringify(lastMessage.data, null, 2)}`,
            severity: 'info',
          };
          setLogs(prev => [newLog, ...prev.slice(0, 499)]);
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isOpen, isPaused, logs]);

  // Update stats
  useEffect(() => {
    if (!isOpen) return;

    const interval = setInterval(() => {
      const commStats = interAgentComm.getStats();
      setStats(prev => ({
        ...prev,
        totalMessages: logs.length,
        messageRate: logs.length > 0 ? (logs.length / 60).toFixed(2) as any : 0,
        connectorConnected: logs.some(log => 
          log.source === 'C3D Connector' && 
          log.message?.includes('Connected')
        ),
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, logs]);

  // Auto-scroll to latest logs
  useEffect(() => {
    if (logsContainerRef.current && !isPaused) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, isPaused]);

  const filteredLogs = logs.filter(log => {
    // Type filters
    if (log.type === 'message' && !filters.showMessages) return false;
    if (log.type === 'response' && !filters.showResponses) return false;
    if (log.type === 'error' && !filters.showErrors) return false;
    if (log.type === 'connector' && !filters.showConnector) return false;
    if (log.type === 'ai-thought' && !filters.showAIThoughts) return false;

    // Search filter
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      const text = `${log.source} ${log.target} ${log.command} ${log.message}`.toLowerCase();
      if (!text.includes(query)) return false;
    }

    return true;
  });

  const getLogColor = (type: DebugLog['type'], severity?: string) => {
    if (severity === 'error') return 'bg-red-900/30 border-red-500/50 text-red-300';
    if (severity === 'warning') return 'bg-yellow-900/30 border-yellow-500/50 text-yellow-300';
    if (type === 'ai-thought') return 'bg-purple-900/30 border-purple-500/50 text-purple-300';
    if (type === 'connector') return 'bg-cyan-900/30 border-cyan-500/50 text-cyan-300';
    if (type === 'response') return 'bg-green-900/30 border-green-500/50 text-green-300';
    return 'bg-gray-900/30 border-gray-500/50 text-gray-300';
  };

  const getLogIcon = (type: DebugLog['type']) => {
    switch (type) {
      case 'ai-thought':
        return '🧠';
      case 'connector':
        return '🔌';
      case 'error':
        return '❌';
      case 'response':
        return '✅';
      case 'message':
        return '📨';
      default:
        return '•';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-950 rounded-lg shadow-2xl max-w-6xl w-full h-[90vh] mx-4 border border-gray-700 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-900/50">
          <div className="flex items-center gap-3">
            <span className="text-xl">🧠</span>
            <h2 className="text-xl font-bold text-white">Ultimate Debug Panel</h2>
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${stats.connectorConnected ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>
              <span>📡</span>
              {stats.connectorConnected ? 'Connector Connected' : 'Connector Offline'}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-5 gap-4 p-3 bg-gray-900/30 border-b border-gray-700 text-sm">
          <div className="text-center">
            <div className="text-gray-400">Total Messages</div>
            <div className="text-cyan-400 font-mono text-lg">{stats.totalMessages}</div>
          </div>
          <div className="text-center">
            <div className="text-gray-400">Errors</div>
            <div className={`font-mono text-lg ${stats.totalErrors > 0 ? 'text-red-400' : 'text-green-400'}`}>
              {stats.totalErrors}
            </div>
          </div>
          <div className="text-center">
            <div className="text-gray-400">Message Rate</div>
            <div className="text-yellow-400 font-mono text-lg">{stats.messageRate} msg/min</div>
          </div>
          <div className="text-center">
            <div className="text-gray-400">Agents</div>
            <div className="text-purple-400 font-mono text-lg">{Object.keys(AgentType).length}</div>
          </div>
          <div className="text-center">
            <div className="text-gray-400">Status</div>
            <div className="text-green-400 font-mono text-lg">Live</div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-2 p-3 border-b border-gray-700 bg-gray-900/20 flex-wrap items-center">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`px-3 py-1.5 rounded text-sm font-semibold transition-colors ${
              isPaused
                ? 'bg-yellow-900/50 hover:bg-yellow-900/70 text-yellow-300 border border-yellow-600'
                : 'bg-green-900/50 hover:bg-green-900/70 text-green-300 border border-green-600'
            }`}
          >
            {isPaused ? '⏸ Paused' : '▶ Live'}
          </button>

          <button
            onClick={() => {
              setLogs([]);
              setStats(prev => ({ ...prev, totalErrors: 0 }));
            }}
            className="px-3 py-1.5 rounded text-sm font-semibold bg-red-900/50 hover:bg-red-900/70 text-red-300 border border-red-600 transition-colors flex items-center gap-2"
          >
            <TrashIcon className="w-4 h-4" />
            Clear
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-2 text-sm">
            <span>🔍</span>
            <label className="flex items-center gap-2 cursor-pointer text-gray-300 hover:text-white">
              <input
                type="checkbox"
                checked={filters.showMessages}
                onChange={e => setFilters(prev => ({ ...prev, showMessages: e.target.checked }))}
                className="rounded"
              />
              Messages
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-gray-300 hover:text-white">
              <input
                type="checkbox"
                checked={filters.showResponses}
                onChange={e => setFilters(prev => ({ ...prev, showResponses: e.target.checked }))}
                className="rounded"
              />
              Responses
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-gray-300 hover:text-white">
              <input
                type="checkbox"
                checked={filters.showErrors}
                onChange={e => setFilters(prev => ({ ...prev, showErrors: e.target.checked }))}
                className="rounded"
              />
              Errors
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-gray-300 hover:text-white">
              <input
                type="checkbox"
                checked={filters.showConnector}
                onChange={e => setFilters(prev => ({ ...prev, showConnector: e.target.checked }))}
                className="rounded"
              />
              Connector
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-gray-300 hover:text-white">
              <input
                type="checkbox"
                checked={filters.showAIThoughts}
                onChange={e => setFilters(prev => ({ ...prev, showAIThoughts: e.target.checked }))}
                className="rounded"
              />
              AI Thoughts
            </label>
          </div>

          <input
            type="text"
            placeholder="Search logs..."
            value={filters.searchQuery}
            onChange={e => setFilters(prev => ({ ...prev, searchQuery: e.target.value }))}
            className="px-2 py-1 text-sm rounded bg-gray-800 border border-gray-600 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Logs Container */}
        <div
          ref={logsContainerRef}
          className="flex-1 overflow-y-auto p-3 space-y-2 font-mono text-xs"
        >
          {filteredLogs.length === 0 ? (
            <div className="text-gray-500 text-center py-20">
              {logs.length === 0
                ? 'Waiting for messages... Enable inter-agent communication in your app.'
                : 'No logs match the current filters.'}
            </div>
          ) : (
            filteredLogs.map(log => (
              <div
                key={log.id}
                className={`p-2 rounded border ${getLogColor(log.type, log.severity)} transition-colors hover:bg-opacity-70 cursor-copy`}
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(log, null, 2));
                }}
                title="Click to copy to clipboard"
              >
                <div className="flex gap-2 items-start">
                  <span className="flex-shrink-0">{getLogIcon(log.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex gap-2 flex-wrap text-xs text-gray-400 mb-1">
                      <span className="text-gray-500">{new Date(log.timestamp).toLocaleTimeString()}.{(log.timestamp % 1000).toString().padStart(3, '0')}</span>
                      <span className="text-cyan-300 font-semibold">{log.source}</span>
                      {log.target && log.target !== 'broadcast' && (
                        <>
                          <span className="text-gray-500">→</span>
                          <span className="text-green-300">{log.target}</span>
                        </>
                      )}
                      {log.command && <span className="text-purple-300">{log.command}</span>}
                    </div>
                    {log.message && (
                      <div className="text-gray-100 break-words whitespace-pre-wrap max-h-20 overflow-y-auto">
                        {log.message}
                      </div>
                    )}
                    {log.data && (
                      <details className="text-gray-300 mt-1">
                        <summary className="cursor-pointer hover:text-white">View Data</summary>
                        <pre className="mt-1 bg-black/30 p-2 rounded overflow-x-auto max-h-32 overflow-y-auto">
                          {JSON.stringify(log.data, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-700 bg-gray-900/30 text-xs text-gray-400 flex justify-between">
          <span>
            Showing {filteredLogs.length} of {logs.length} logs • Refresh rate: {isPaused ? 'Paused' : 'Real-time'}
          </span>
          <span>
            Click any log entry to copy its JSON. Inter-agent communication enabled.
          </span>
        </div>
      </div>
    </div>
  );
};

export default UltimateDebugPanel;
