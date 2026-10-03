// Silent error logging system
// Captures errors without showing them to users, stores them for debugging

import { emitError } from './errorReporting';

export interface ErrorLogEntry {
  timestamp: string;
  type: 'error' | 'warning' | 'network' | 'api';
  message: string;
  stack?: string;
  url?: string;
  statusCode?: number;
  details?: any;
}

const MAX_LOG_ENTRIES = 100;
const ERROR_LOG_KEY = 'landsurv_error_log';

// Substrings of benign/noisy errors we never want to surface to the user.
const BENIGN_ERROR_PATTERNS = [
  'ResizeObserver loop',
  'Script error.',
  'Non-Error promise rejection captured',
];

// Minimum time between surfacing the same error key to the notification bell.
const SURFACE_THROTTLE_MS = 15000;

class ErrorLogger {
  private logs: ErrorLogEntry[] = [];
  private lastSurfaced: Map<string, number> = new Map();

  constructor() {
    this.loadLogs();
    this.setupGlobalHandlers();
  }

  private isBenign(message: string): boolean {
    return BENIGN_ERROR_PATTERNS.some(p => message.includes(p));
  }

  // Surface an unexpected error to the notification bell (throttled + deduped).
  // errorLogger already recorded the entry, so skipLog avoids double logging.
  private surface(key: string, title: string, message: string): void {
    if (!message || this.isBenign(message)) return;
    const now = Date.now();
    const last = this.lastSurfaced.get(key) ?? 0;
    if (now - last < SURFACE_THROTTLE_MS) return;
    this.lastSurfaced.set(key, now);
    try {
      emitError({
        title,
        message,
        severity: 'error',
        kind: key,
        dedupeKey: key,
        autoDismissMs: 12000,
        skipLog: true,
      });
    } catch {
      // Never let surfacing break logging.
    }
  }

  private loadLogs() {
    try {
      const stored = localStorage.getItem(ERROR_LOG_KEY);
      if (stored) {
        this.logs = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to load error logs', e);
    }
  }

  private saveLogs() {
    try {
      // Keep only the most recent entries
      const recentLogs = this.logs.slice(-MAX_LOG_ENTRIES);
      localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(recentLogs));
      this.logs = recentLogs;
    } catch (e) {
      console.warn('Failed to save error logs', e);
    }
  }

  private setupGlobalHandlers() {
    // Capture unhandled errors
    window.addEventListener('error', (event) => {
      this.logError({
        type: 'error',
        message: event.message || 'Unknown error',
        stack: event.error?.stack,
        url: event.filename,
        details: {
          lineno: event.lineno,
          colno: event.colno,
        }
      });
      this.surface('unhandled-error', 'Unexpected error', event.message || 'An unexpected error occurred.');
    });

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.logError({
        type: 'error',
        message: `Unhandled Promise Rejection: ${event.reason}`,
        stack: event.reason?.stack,
        details: event.reason
      });
      const reasonMsg = event.reason?.message || (typeof event.reason === 'string' ? event.reason : String(event.reason ?? ''));
      this.surface('unhandled-rejection', 'Unexpected error', reasonMsg);
    });

    // Intercept fetch to log network errors
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args);
        if (!response.ok) {
          const urlStr = typeof args[0] === 'string' ? args[0] : (args[0] instanceof Request ? args[0].url : String(args[0]));
          this.logError({
            type: 'network',
            message: `HTTP ${response.status}: ${response.statusText}`,
            url: urlStr,
            statusCode: response.status,
            details: {
              method: typeof args[0] === 'object' && 'method' in args[0] ? args[0].method : 'GET',
              headers: response.headers,
            }
          });
        }
        return response;
      } catch (error: any) {
        const urlStr = typeof args[0] === 'string' ? args[0] : (args[0] instanceof Request ? args[0].url : String(args[0]));
        this.logError({
          type: 'network',
          message: `Network request failed: ${error.message}`,
          url: urlStr,
          stack: error.stack,
          details: error
        });
        // Surface genuine connectivity failures (not user-cancelled aborts or
        // analytics beacons) so the user learns the app is offline/unreachable.
        const isAbort = error?.name === 'AbortError';
        const isAnalytics = typeof urlStr === 'string' && urlStr.includes('google-analytics');
        if (!isAbort && !isAnalytics) {
          this.surface('network-failure', 'Network problem', 'A network request failed. Check your connection and try again.');
        }
        throw error;
      }
    };
  }

  logError(entry: Omit<ErrorLogEntry, 'timestamp'>) {
    // Filter out analytics errors in development - they don't need to be logged
    if (entry.url && entry.url.includes('google-analytics') && window.location.hostname === 'localhost') {
      return;
    }
    
    const logEntry: ErrorLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };
    
    this.logs.push(logEntry);
    this.saveLogs();
    
    // Still log to console in development for non-analytics errors
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      console.error('[ErrorLogger]', logEntry);
    }
  }

  getLogs(): ErrorLogEntry[] {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
    localStorage.removeItem(ERROR_LOG_KEY);
  }

  getLogCount(): number {
    return this.logs.length;
  }
}

// Singleton instance
export const errorLogger = new ErrorLogger();
