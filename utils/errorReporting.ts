// errorReporting.ts
// Central, framework-agnostic error-reporting bus.
//
// This module lets *any* code — React components, hooks, or plain module-level
// handlers (e.g. the global window error / fetch handlers in errorLogger.ts) —
// report an error through a single canonical channel.
//
// The React side (AppStateContext) subscribes to this bus and decides how to
// surface the report:
//   * Always mirror to the notification bell (NotificationCenter).
//   * When the notification bell is NOT currently mounted ("out of scope"),
//     also raise the red FloatingErrorBanner so the user sees it immediately.
//
// Keeping the scope flag + bus here (outside React) means non-React callers can
// participate without needing context access.

export type ReportSeverity = 'info' | 'warning' | 'error';

export interface ErrorReportInput {
  /** Short, human-readable headline. */
  title: string;
  /** Optional detail line. */
  message?: string;
  /** Defaults to 'error'. */
  severity?: ReportSeverity;
  /** Notification "kind" (used for grouping/derived entries). */
  kind?: string;
  /**
   * Stable key used to dedupe repeated reports. Repeats bump the existing
   * notification's count instead of stacking new rows. Defaults to `kind`.
   */
  dedupeKey?: string;
  /** Auto-dismiss the notification after this many ms (transient errors). */
  autoDismissMs?: number;
  /** Invoked when the user clicks the notification / banner. */
  onActivate?: () => void;
  /** Raw error object for logging (stack capture). */
  error?: unknown;
  /** When true, the reporter won't re-log to errorLogger (caller already did). */
  skipLog?: boolean;
}

type Listener = (input: ErrorReportInput) => void;

let listeners: Listener[] = [];

// Synchronous scope flag. The main app shell sets this true while the header
// (and therefore the NotificationCenter bell) is mounted, and false otherwise.
let notificationBarInScope = false;

/** Called by the main app shell marker to toggle bell visibility scope. */
export function setNotificationBarInScope(value: boolean): void {
  notificationBarInScope = value;
}

/** True while the notification bell is mounted and can surface errors. */
export function isNotificationBarInScope(): boolean {
  return notificationBarInScope;
}

/**
 * Subscribe to error reports. Returns an unsubscribe function.
 * AppStateContext uses this to route bus reports into React state.
 */
export function subscribeToErrors(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

/**
 * Report an error from *non-React* code (module-level handlers, services).
 * React code should prefer the `useErrorReporter()` hook, which calls the same
 * underlying reporter with access to `onActivate` closures.
 */
export function emitError(input: ErrorReportInput): void {
  for (const listener of listeners) {
    try {
      listener(input);
    } catch {
      // A failing listener must never break the reporter.
    }
  }
}
