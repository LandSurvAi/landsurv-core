// ErrorConsole.tsx
// Hidden error console for debugging issues

import React, { useState, useEffect } from 'react';
import { XMarkIcon } from './icons';
import { errorLogger, ErrorLogEntry } from '../utils/errorLogger';
import { useErrorReporter } from '../contexts/AppStateContext';

interface ErrorConsoleProps {
  isOpen: boolean;
  onClose: () => void;
}

const ErrorConsole: React.FC<ErrorConsoleProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<ErrorLogEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'error' | 'warning' | 'network' | 'api'>('all');
  const { notify } = useErrorReporter();

  useEffect(() => {
    if (isOpen) {
      setLogs(errorLogger.getLogs());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredLogs = filter === 'all' 
    ? logs 
    : logs.filter(log => log.type === filter);

  const getTypeColor = (type: ErrorLogEntry['type']) => {
    switch (type) {
      case 'error': return 'text-red-400';
      case 'warning': return 'text-yellow-400';
      case 'network': return 'text-blue-400';
      case 'api': return 'text-purple-400';
      default: return 'text-gray-400';
    }
  };

  const handleClearLogs = () => {
    errorLogger.clearLogs();
    setLogs([]);
  };

  const handleCopyLogs = () => {
    const logText = filteredLogs.map(log => 
      `[${log.timestamp}] ${log.type.toUpperCase()}: ${log.message}\n${log.stack || ''}\n${log.url || ''}\n---`
    ).join('\n');
    
    navigator.clipboard.writeText(logText).then(() => {
      notify({ title: 'Copied', message: 'Logs copied to clipboard!' });
    });
  };

  const handleSearchError = (message: string, stack?: string) => {
    // Create a search query combining the error message and first line of stack trace
    const searchQuery = stack 
      ? `${message} ${stack.split('\n')[0]}`
      : message;
    
    // Open Google search in a new tab
    const encodedQuery = encodeURIComponent(searchQuery);
    window.open(`https://www.google.com/search?q=${encodedQuery}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 rounded-lg shadow-2xl w-full max-w-6xl h-[80vh] mx-4 border border-gray-700 flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-orange-600 p-4 rounded-t-lg flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              🐛 Error Console
            </h2>
            <p className="text-sm text-red-100 mt-1">
              {filteredLogs.length} {filter === 'all' ? 'total' : filter} log{filteredLogs.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="p-4 border-b border-gray-700 flex gap-2 flex-wrap items-center">
          <div className="flex gap-1">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                filter === 'all' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              All ({logs.length})
            </button>
            <button
              onClick={() => setFilter('error')}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                filter === 'error' 
                  ? 'bg-red-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Errors ({logs.filter(l => l.type === 'error').length})
            </button>
            <button
              onClick={() => setFilter('network')}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                filter === 'network' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Network ({logs.filter(l => l.type === 'network').length})
            </button>
            <button
              onClick={() => setFilter('warning')}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                filter === 'warning' 
                  ? 'bg-yellow-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Warnings ({logs.filter(l => l.type === 'warning').length})
            </button>
          </div>
          
          <div className="ml-auto flex gap-2">
            <button
              onClick={handleCopyLogs}
              className="px-3 py-1 rounded text-sm bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              📋 Copy Logs
            </button>
            <button
              onClick={handleClearLogs}
              className="px-3 py-1 rounded text-sm bg-red-600 hover:bg-red-700 text-white transition-colors"
            >
              🗑️ Clear All
            </button>
          </div>
        </div>

        {/* Log List */}
        <div className="flex-1 overflow-y-auto p-4 font-mono text-xs">
          {filteredLogs.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <p className="text-lg">✨ No {filter === 'all' ? '' : filter} logs yet</p>
              <p className="text-sm mt-2">Errors will appear here when they occur</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredLogs.map((log, idx) => (
                <div key={idx} className="bg-gray-800 rounded p-3 border-l-4" style={{
                  borderLeftColor: log.type === 'error' ? '#ef4444' : 
                                   log.type === 'warning' ? '#eab308' : 
                                   log.type === 'network' ? '#3b82f6' : '#a855f7'
                }}>
                  <div className="flex justify-between items-start mb-1">
                    <span className={`font-bold ${getTypeColor(log.type)}`}>
                      [{log.type.toUpperCase()}]
                    </span>
                    <span className="text-gray-500 text-xs">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-gray-300 mb-2 break-words whitespace-pre-wrap">{log.message}</div>
                  <div className="flex gap-2 mb-2 flex-wrap">
                    <button
                      onClick={() => handleSearchError(log.message, log.stack)}
                      className="px-2 py-1 rounded text-xs bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                      title="Search this error on Google"
                    >
                      🔍 Investigate Error
                    </button>
                  </div>
                  {log.url && (
                    <div className="text-blue-400 text-xs mb-1 break-words">
                      URL: {log.url}
                    </div>
                  )}
                  {log.statusCode && (
                    <div className="text-orange-400 text-xs mb-1">
                      Status: {log.statusCode}
                    </div>
                  )}
                  {log.stack && (
                    <details className="mt-2">
                      <summary className="text-gray-500 cursor-pointer hover:text-gray-400">
                        Stack Trace
                      </summary>
                      <pre className="text-xs text-gray-400 mt-2 overflow-x-auto bg-gray-900 p-2 rounded break-words whitespace-pre-wrap">
                        {log.stack}
                      </pre>
                    </details>
                  )}
                  {log.details && (
                    <details className="mt-2">
                      <summary className="text-gray-500 cursor-pointer hover:text-gray-400">
                        Details
                      </summary>
                      <pre className="text-xs text-gray-400 mt-2 overflow-x-auto bg-gray-900 p-2 rounded break-words whitespace-pre-wrap">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-800 rounded-b-lg">
          <p className="text-xs text-gray-400 text-center">
            💡 Tip: Copy these logs and share them with support if you need help debugging an issue
          </p>
        </div>
      </div>
    </div>
  );
};

export default ErrorConsole;
