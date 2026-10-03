/**
 * CAD Manager Session Storage
 * 
 * Manages saving/loading of CAD Manager sessions to localStorage.
 * Each session includes:
 * - Standard definition (codes, layers, etc.)
 * - Chat history from StandardsBuilder
 * - Survey data and unknown codes
 * - Alias mappings
 * - Metadata (name, dates, etc.)
 */

import { StandardDefinition } from '../../contexts/types/CadManager.types';

export interface CadManagerChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface CadManagerSession {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  
  // Standards data
  standard: StandardDefinition | null;
  generatedMarkdown: string | null;
  
  // Chat history
  chatHistory: CadManagerChatMessage[];
  
  // Survey data
  unknownCodes: string[];
  surveyFileName?: string;
  
  // Alias mappings (raw code -> master code)
  aliases: Record<string, string>;
  
  // UI state
  standardsTab: 'upload' | 'build' | 'pull';
}

export interface CadManagerSessionSummary {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  codeCount: number;
  hasChat: boolean;
  hasSurvey: boolean;
}

const STORAGE_KEY = 'landsurv-cad-manager-sessions';
const ACTIVE_SESSION_KEY = 'landsurv-cad-manager-active';

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `cad-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get all saved sessions from localStorage
 */
export function getAllSessions(): CadManagerSession[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch (err) {
    console.error('[CadManagerSessionStorage] Error loading sessions:', err);
    return [];
  }
}

/**
 * Get session summaries (lighter for listing)
 */
export function getSessionSummaries(): CadManagerSessionSummary[] {
  const sessions = getAllSessions();
  return sessions.map(session => ({
    id: session.id,
    name: session.name,
    description: session.description,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    codeCount: session.standard?.codes.length || 0,
    hasChat: session.chatHistory.length > 0,
    hasSurvey: session.unknownCodes.length > 0,
  }));
}

/**
 * Get a specific session by ID
 */
export function getSession(id: string): CadManagerSession | null {
  const sessions = getAllSessions();
  return sessions.find(s => s.id === id) || null;
}

/**
 * Find an existing session by name (case-insensitive).
 *
 * Layer adoption re-runs whenever a drawing is pulled or a sync answers "use
 * layers from CAD", and it always names the session after the drawing. Reusing
 * that record keeps re-pulls from stacking up duplicates in the session list.
 */
export function findSessionIdByName(name: string): string | null {
  const target = (name || '').trim().toLowerCase();
  if (!target) return null;
  const match = getAllSessions().find(s => (s.name || '').trim().toLowerCase() === target);
  return match ? match.id : null;
}

/**
 * Save a new session or update existing
 */
export function saveSession(session: Omit<CadManagerSession, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): CadManagerSession {
  const sessions = getAllSessions();
  const now = new Date().toISOString();
  
  let savedSession: CadManagerSession;
  
  if (session.id) {
    // Update existing
    const idx = sessions.findIndex(s => s.id === session.id);
    if (idx !== -1) {
      savedSession = {
        ...sessions[idx],
        ...session,
        id: session.id,
        updatedAt: now,
      };
      sessions[idx] = savedSession;
    } else {
      // ID provided but not found - create new with this ID
      savedSession = {
        ...session,
        id: session.id,
        createdAt: now,
        updatedAt: now,
      } as CadManagerSession;
      sessions.push(savedSession);
    }
  } else {
    // Create new
    savedSession = {
      ...session,
      id: generateSessionId(),
      createdAt: now,
      updatedAt: now,
    } as CadManagerSession;
    sessions.push(savedSession);
  }
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    console.log(`[CadManagerSessionStorage] Saved session: ${savedSession.name} (${savedSession.id})`);
  } catch (err) {
    console.error('[CadManagerSessionStorage] Error saving session:', err);
    throw new Error('Failed to save session - localStorage may be full');
  }
  
  return savedSession;
}

/**
 * Delete a session
 */
export function deleteSession(id: string): boolean {
  const sessions = getAllSessions();
  const filtered = sessions.filter(s => s.id !== id);
  
  if (filtered.length === sessions.length) {
    return false; // Not found
  }
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    
    // Clear active if this was active
    if (getActiveSessionId() === id) {
      clearActiveSession();
    }
    
    console.log(`[CadManagerSessionStorage] Deleted session: ${id}`);
    return true;
  } catch (err) {
    console.error('[CadManagerSessionStorage] Error deleting session:', err);
    return false;
  }
}

/**
 * Rename a session
 */
export function renameSession(id: string, newName: string, newDescription?: string): boolean {
  const sessions = getAllSessions();
  const idx = sessions.findIndex(s => s.id === id);
  
  if (idx === -1) return false;
  
  sessions[idx].name = newName;
  if (newDescription !== undefined) {
    sessions[idx].description = newDescription;
  }
  sessions[idx].updatedAt = new Date().toISOString();
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    return true;
  } catch (err) {
    console.error('[CadManagerSessionStorage] Error renaming session:', err);
    return false;
  }
}

/**
 * Duplicate a session
 */
export function duplicateSession(id: string, newName?: string): CadManagerSession | null {
  const session = getSession(id);
  if (!session) return null;
  
  const duplicated = saveSession({
    name: newName || `${session.name} (Copy)`,
    description: session.description,
    standard: session.standard,
    generatedMarkdown: session.generatedMarkdown,
    chatHistory: [...session.chatHistory],
    unknownCodes: [...session.unknownCodes],
    surveyFileName: session.surveyFileName,
    aliases: { ...session.aliases },
    standardsTab: session.standardsTab,
  });
  
  return duplicated;
}

/**
 * Content signature used to identify sessions that are byte-for-byte duplicates
 * of one another. Deliberately strict: only sessions holding the same name,
 * description, standard, chat, codes and aliases collapse together.
 */
function sessionSignature(session: CadManagerSession): string {
  return JSON.stringify([
    session.name,
    session.description ?? '',
    session.standard,
    session.generatedMarkdown ?? '',
    session.chatHistory.map(m => [m.role, m.content]),
    [...session.unknownCodes].sort(),
    session.surveyFileName ?? '',
    session.aliases,
    session.standardsTab,
  ]);
}

/**
 * Collapse exact-duplicate sessions, keeping the most recently updated copy of
 * each. Earlier builds created a brand-new record on every save because the
 * active session was not restored when the page remounted, which left users
 * with dozens of identical "Untitled Session" entries.
 *
 * Returns the number of duplicate records removed.
 */
export function dedupeSessions(): number {
  const sessions = getAllSessions();
  if (sessions.length < 2) return 0;

  const newestBySignature = new Map<string, CadManagerSession>();
  for (const session of sessions) {
    const signature = sessionSignature(session);
    const existing = newestBySignature.get(signature);
    if (!existing || session.updatedAt > existing.updatedAt) {
      newestBySignature.set(signature, session);
    }
  }

  const keepIds = new Set(Array.from(newestBySignature.values()).map(s => s.id));
  if (keepIds.size === sessions.length) return 0;

  const kept = sessions.filter(s => keepIds.has(s.id));

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
  } catch (err) {
    console.error('[CadManagerSessionStorage] Error deduping sessions:', err);
    return 0;
  }

  // The active session may have been one of the collapsed copies.
  const activeId = getActiveSessionId();
  if (activeId && !keepIds.has(activeId)) {
    clearActiveSession();
  }

  const removed = sessions.length - kept.length;
  console.log(`[CadManagerSessionStorage] Removed ${removed} duplicate session(s)`);
  return removed;
}

/**
 * Get the active session ID
 */
export function getActiveSessionId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_SESSION_KEY);
  } catch {
    return null;
  }
}

/**
 * Set the active session ID
 */
export function setActiveSessionId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_SESSION_KEY, id);
  } catch (err) {
    console.error('[CadManagerSessionStorage] Error setting active session:', err);
  }
}

/**
 * Clear the active session
 */
export function clearActiveSession(): void {
  try {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch (err) {
    console.error('[CadManagerSessionStorage] Error clearing active session:', err);
  }
}

/**
 * Export session to JSON file
 */
export function exportSessionToFile(id: string): void {
  const session = getSession(id);
  if (!session) {
    console.error('[CadManagerSessionStorage] Session not found for export:', id);
    return;
  }
  
  const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${session.name.replace(/[^a-zA-Z0-9]/g, '-')}-cad-session.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Import session from JSON file
 */
export async function importSessionFromFile(file: File): Promise<CadManagerSession> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        
        // Validate required fields
        if (!data.name || !data.standard) {
          throw new Error('Invalid session file: missing required fields');
        }
        
        // Save with new ID to avoid conflicts
        const imported = saveSession({
          name: `${data.name} (Imported)`,
          description: data.description,
          standard: data.standard,
          generatedMarkdown: data.generatedMarkdown || null,
          chatHistory: data.chatHistory || [],
          unknownCodes: data.unknownCodes || [],
          surveyFileName: data.surveyFileName,
          aliases: data.aliases || {},
          standardsTab: data.standardsTab || 'upload',
        });
        
        resolve(imported);
      } catch (err) {
        reject(new Error(`Failed to import session: ${err instanceof Error ? err.message : 'Unknown error'}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/**
 * Get storage usage info
 */
export function getStorageInfo(): { used: number; sessions: number } {
  const sessions = getAllSessions();
  const data = localStorage.getItem(STORAGE_KEY) || '';
  return {
    used: new Blob([data]).size,
    sessions: sessions.length,
  };
}
