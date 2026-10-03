/**
 * CAD Manager Session Modal
 * 
 * Modal for managing CAD Manager sessions:
 * - View all saved sessions
 * - Load a session
 * - Delete sessions
 * - Rename sessions
 * - Import/Export sessions
 * - Create new session
 */

import React, { useState, useEffect } from 'react';
import {
  getAllSessions,
  getSessionSummaries,
  getSession,
  saveSession,
  deleteSession,
  renameSession,
  duplicateSession,
  exportSessionToFile,
  importSessionFromFile,
  getStorageInfo,
  CadManagerSession,
  CadManagerSessionSummary,
} from './CadManagerSessionStorage';

interface SessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadSession: (session: CadManagerSession) => void;
  onNewSession: () => void;
  currentSessionId?: string | null;
}

export const SessionModal: React.FC<SessionModalProps> = ({
  isOpen,
  onClose,
  onLoadSession,
  onNewSession,
  currentSessionId,
}) => {
  const [sessions, setSessions] = useState<CadManagerSessionSummary[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [storageInfo, setStorageInfo] = useState({ used: 0, sessions: 0 });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Load sessions on open
  useEffect(() => {
    if (isOpen) {
      refreshSessions();
    }
  }, [isOpen]);

  const refreshSessions = () => {
    setSessions(getSessionSummaries());
    setStorageInfo(getStorageInfo());
  };

  const handleLoad = (id: string) => {
    const session = getSession(id);
    if (session) {
      onLoadSession(session);
      onClose();
    }
  };

  const handleDelete = (id: string) => {
    if (confirmDelete === id) {
      deleteSession(id);
      refreshSessions();
      setConfirmDelete(null);
    } else {
      setConfirmDelete(id);
    }
  };

  const handleRename = (id: string) => {
    if (editingId === id && editName.trim()) {
      renameSession(id, editName.trim());
      refreshSessions();
      setEditingId(null);
      setEditName('');
    } else {
      const session = sessions.find(s => s.id === id);
      setEditingId(id);
      setEditName(session?.name || '');
    }
  };

  const handleDuplicate = (id: string) => {
    duplicateSession(id);
    refreshSessions();
  };

  const handleExport = (id: string) => {
    exportSessionToFile(id);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);
    try {
      const imported = await importSessionFromFile(file);
      refreshSessions();
      // Optionally load it immediately
      onLoadSession(imported);
      onClose();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    }
    
    // Reset input
    e.target.value = '';
  };

  const handleNewSession = () => {
    onNewSession();
    onClose();
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              📁 CAD Manager Sessions
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              {storageInfo.sessions} sessions • {formatBytes(storageInfo.used)} used
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg cursor-pointer transition-colors">
              📥 Import
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
              />
            </label>
            <button
              onClick={handleNewSession}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors"
            >
              ➕ New Session
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {importError && (
          <div className="mx-4 mt-4 p-3 bg-red-900/30 border border-red-500/30 rounded-lg text-red-300 text-sm">
            <strong>Import Error:</strong> {importError}
          </div>
        )}

        {/* Session List */}
        <div className="flex-1 overflow-y-auto p-4">
          {sessions.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">📭</div>
              <h3 className="text-gray-300 font-medium">No Saved Sessions</h3>
              <p className="text-gray-500 text-sm mt-2">
                Create standards and click "Save" to store a session
              </p>
              <button
                onClick={handleNewSession}
                className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
              >
                Start New Session
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => {
                const isActive = session.id === currentSessionId;
                const isEditing = editingId === session.id;
                const isConfirmingDelete = confirmDelete === session.id;

                return (
                  <div
                    key={session.id}
                    className={`p-4 rounded-lg border transition-colors ${
                      isActive
                        ? 'bg-indigo-900/30 border-indigo-500/50'
                        : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRename(session.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-indigo-500"
                            autoFocus
                          />
                        ) : (
                          <h3 className="font-medium text-white truncate flex items-center gap-2">
                            {session.name}
                            {isActive && (
                              <span className="text-xs bg-indigo-500 text-white px-2 py-0.5 rounded-full">
                                Current
                              </span>
                            )}
                          </h3>
                        )}
                        
                        {session.description && !isEditing && (
                          <p className="text-sm text-gray-400 truncate mt-0.5">{session.description}</p>
                        )}
                        
                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                          <span>📝 {session.codeCount} codes</span>
                          {session.hasChat && <span>💬 Chat</span>}
                          {session.hasSurvey && <span>📊 Survey</span>}
                          <span>🕐 {formatDate(session.updatedAt)}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1 ml-4">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => handleRename(session.id)}
                              className="p-1.5 text-green-400 hover:bg-green-900/30 rounded transition-colors"
                              title="Save"
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1.5 text-gray-400 hover:bg-gray-700 rounded transition-colors"
                              title="Cancel"
                            >
                              ✕
                            </button>
                          </>
                        ) : isConfirmingDelete ? (
                          <>
                            <span className="text-xs text-red-400 mr-2">Delete?</span>
                            <button
                              onClick={() => handleDelete(session.id)}
                              className="p-1.5 text-red-400 hover:bg-red-900/30 rounded transition-colors"
                              title="Confirm Delete"
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="p-1.5 text-gray-400 hover:bg-gray-700 rounded transition-colors"
                              title="Cancel"
                            >
                              ✕
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleLoad(session.id)}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded transition-colors"
                              title="Load this session"
                            >
                              Load
                            </button>
                            <button
                              onClick={() => handleRename(session.id)}
                              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                              title="Rename"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => handleDuplicate(session.id)}
                              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                              title="Duplicate"
                            >
                              📋
                            </button>
                            <button
                              onClick={() => handleExport(session.id)}
                              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                              title="Export to file"
                            >
                              📤
                            </button>
                            <button
                              onClick={() => handleDelete(session.id)}
                              className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors"
                              title="Delete"
                            >
                              🗑️
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            Sessions are stored locally in your browser
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionModal;
