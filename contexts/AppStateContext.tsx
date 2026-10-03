// AppStateContext.tsx
// Phase 6: Application-level state including settings, agents, text editor, and timing
// This context manages top-level application state that doesn't fit into other specific contexts

import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from 'react';
import { AgentType, JobInfo, Settings, type AppNotification } from '../types';
import { errorLogger } from '../utils/errorLogger';
import {
  subscribeToErrors,
  isNotificationBarInScope,
  emitError,
  type ErrorReportInput,
} from '../utils/errorReporting';

interface AppStateContextType {
  // Job and Settings
  jobInfo: JobInfo;
  setJobInfo: React.Dispatch<React.SetStateAction<JobInfo>>;
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  
  // Agent State
  initializedAgents: Set<AgentType>;
  setInitializedAgents: React.Dispatch<React.SetStateAction<Set<AgentType>>>;
  activeAgent: AgentType;
  setActiveAgent: React.Dispatch<React.SetStateAction<AgentType>>;
  lastActiveAgent: AgentType;
  setLastActiveAgent: React.Dispatch<React.SetStateAction<AgentType>>;
  activeModel: string;
  setActiveModel: React.Dispatch<React.SetStateAction<string>>;
  
  // Text Editor State
  textEditorContent: string;
  setTextEditorContent: React.Dispatch<React.SetStateAction<string>>;
  activeTextEditorFile: string | null;
  setActiveTextEditorFile: React.Dispatch<React.SetStateAction<string | null>>;
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: React.Dispatch<React.SetStateAction<boolean>>;
  
  // Timing State
  thinkingTime: number;
  setThinkingTime: React.Dispatch<React.SetStateAction<number>>;

  // App Notifications
  notifications: AppNotification[];
  addNotification: (notification: Omit<AppNotification, 'id'> & { id?: string }) => string;
  dismissNotification: (id: string) => void;
  clearNotifications: () => void;

  // Unified error reporting. Always mirrors to the notification bell; when the
  // bell is out of scope, `criticalError` is also set so a red dialog can show.
  reportError: (input: ErrorReportInput) => string;
  /** Companion for non-error status messages (defaults to severity 'info'). */
  notify: (input: ErrorReportInput) => string;
  /** Red-dialog message shown when an error is reported out of the bell's scope. */
  criticalError: string | null;
  dismissCriticalError: () => void;
}

const AppStateContext = createContext<AppStateContextType | undefined>(undefined);

interface AppStateProviderProps {
  children: ReactNode;
  availableModels: string[];
}

export const AppStateProvider: React.FC<AppStateProviderProps> = ({ children, availableModels }) => {
  // Job and Settings
  const [jobInfo, setJobInfo] = useState<JobInfo>({ 
    jobName: 'Project Name', 
    jobNo: 'Project No.' 
  });

  // Persisted per-browser (localStorage) so the user's chosen State Plane
  // projection carries over between sessions instead of re-prompting every
  // time a new GIS/Boundary/Stakeout session starts.
  const PROJECTION_STORAGE_KEY = 'landsurv_projection';
  const loadStoredProjection = (): { state: string | null; zoneName: string | null; epsg: number | null } => {
    try {
      const raw = localStorage.getItem(PROJECTION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return {
            state: parsed.state ?? null,
            zoneName: parsed.zoneName ?? null,
            epsg: typeof parsed.epsg === 'number' ? parsed.epsg : null,
          };
        }
      }
    } catch {
      // Ignore malformed/unavailable localStorage — fall back to defaults.
    }
    return { state: null, zoneName: null, epsg: null };
  };
  
  const [settings, setSettings] = useState<Settings>({
    theme: 'dark',
    coordinatePrecision: 2,
    projection: loadStoredProjection(),
    defaultCutSheetInfo: {
      companyName: 'Your Company',
      crewChief: 'Crew Chief',
    },
    ntrip: {
      enabled: false,
      host: '',
      port: 2101,
      mountpoint: '',
      username: '',
      password: '',
    },
    zoomToPointLevel: 20,
    northArrowStyle: 'classic',
    northArrowPosition: 'right',
    pointLabelingSettings: {
      style: 'numeric',
      prefix: '',
      nextNumber: 1,
    },
    uncertaintySensitivity: 'medium',
    pointAttributeScaling: 'screen', // Default to screen-relative scaling
    showPointSymbols: false,
    debugPreflightEstimate: false,
    debugGimbalHud: false,
    showCacpNotifications: false,
    showCacpHandlerNotifications: false,
    notion: {
      enabled: false,
    },
    googleMaps: {
      enabled: false,
      apiKey: '',
      mapType: 'naip',
      opacity: 1.0,
      scale: 2,
      showLabels: true,
    },
  });

  // Persist the selected projection to localStorage whenever it changes so
  // it's remembered per-browser across sessions/reloads.
  useEffect(() => {
    try {
      localStorage.setItem(PROJECTION_STORAGE_KEY, JSON.stringify(settings.projection));
    } catch {
      // Ignore storage failures (private browsing, quota, etc.)
    }
  }, [settings.projection]);
  
  // Agent State
  const [initializedAgents, setInitializedAgents] = useState<Set<AgentType>>(new Set());
  const [activeAgent, setActiveAgent] = useState<AgentType>(AgentType.RAW_CRAWLER);
  const [lastActiveAgent, setLastActiveAgent] = useState<AgentType>(AgentType.RAW_CRAWLER);
  const [activeModel, setActiveModel] = useState<string>(availableModels[0]);
  
  // Text Editor State
  const [textEditorContent, setTextEditorContent] = useState('');
  const [activeTextEditorFile, setActiveTextEditorFile] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // Timing State
  const [thinkingTime, setThinkingTime] = useState<number>(0);

  // Notifications
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  // Mirror of notifications for synchronous dedupe lookups.
  const notificationsRef = useRef<AppNotification[]>([]);
  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  // Red-dialog message for out-of-scope errors (see reportError).
  const [criticalError, setCriticalError] = useState<string | null>(null);

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  }, []);

  const dismissByKey = useCallback((key: string) => {
    setNotifications(prev => prev.filter(notification => notification.dedupeKey !== key));
  }, []);

  const addNotification = useCallback((notification: Omit<AppNotification, 'id'> & { id?: string }) => {
    const dedupeKey = notification.dedupeKey;
    const createdAt = notification.createdAt ?? new Date().toISOString();

    // Resolve the effective id synchronously (existing entry when deduping).
    let effectiveId = notification.id ?? `notification_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (dedupeKey) {
      const existing = notificationsRef.current.find(n => n.dedupeKey === dedupeKey);
      if (existing) {
        effectiveId = existing.id;
      }
    }

    setNotifications(prev => {
      if (dedupeKey) {
        const idx = prev.findIndex(n => n.dedupeKey === dedupeKey);
        if (idx >= 0) {
          const existing = prev[idx];
          const merged: AppNotification = {
            ...existing,
            ...notification,
            id: existing.id,
            createdAt,
            count: (existing.count ?? 1) + (notification.count ?? 1),
          };
          const copy = [...prev];
          copy[idx] = merged;
          return copy;
        }
      }
      return [...prev, { ...notification, id: effectiveId, createdAt }];
    });

    if (notification.autoDismissMs && notification.autoDismissMs > 0) {
      const ms = notification.autoDismissMs;
      setTimeout(() => {
        if (dedupeKey) {
          dismissByKey(dedupeKey);
        } else {
          dismissNotification(effectiveId);
        }
      }, ms);
    }

    return effectiveId;
  }, [dismissByKey, dismissNotification]);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const dismissCriticalError = useCallback(() => {
    setCriticalError(null);
  }, []);

  const reportError = useCallback((input: ErrorReportInput): string => {
    const severity = input.severity ?? 'error';
    const dedupeKey = input.dedupeKey ?? input.kind;

    if (severity === 'error' && !input.skipLog) {
      try {
        errorLogger.logError({
          type: 'error',
          message: input.message ? `${input.title}: ${input.message}` : input.title,
          stack: input.error instanceof Error ? input.error.stack : undefined,
          details: input.error,
        });
      } catch {
        // Logging must never break reporting.
      }
    }

    const id = addNotification({
      kind: input.kind ?? 'app-error',
      severity,
      title: input.title,
      message: input.message,
      onActivate: input.onActivate,
      dedupeKey,
      autoDismissMs: input.autoDismissMs,
    });

    // Out of the bell's scope → also surface the red dialog so the user sees it.
    if (severity === 'error' && !isNotificationBarInScope()) {
      setCriticalError(input.message ? `${input.title}: ${input.message}` : input.title);
    }

    return id;
  }, [addNotification]);

  const notify = useCallback((input: ErrorReportInput): string => {
    return reportError({ ...input, severity: input.severity ?? 'info' });
  }, [reportError]);

  // Route non-React error reports (global handlers, services) into React state.
  useEffect(() => {
    const unsubscribe = subscribeToErrors((input) => {
      reportError(input);
    });
    return unsubscribe;
  }, [reportError]);

  const value: AppStateContextType = {
    jobInfo,
    setJobInfo,
    settings,
    setSettings,
    initializedAgents,
    setInitializedAgents,
    activeAgent,
    setActiveAgent,
    lastActiveAgent,
    setLastActiveAgent,
    activeModel,
    setActiveModel,
    textEditorContent,
    setTextEditorContent,
    activeTextEditorFile,
    setActiveTextEditorFile,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    thinkingTime,
    setThinkingTime,
    notifications,
    addNotification,
    dismissNotification,
    clearNotifications,
    reportError,
    notify,
    criticalError,
    dismissCriticalError,
  };

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
};

export const useAppState = (): AppStateContextType => {
  const context = useContext(AppStateContext);
  if (context === undefined) {
    throw new Error('useAppState must be used within an AppStateProvider');
  }
  return context;
};

/**
 * Convenience hook for reporting errors / status from components.
 * Routes through the module-level error bus so it works even when rendered
 * outside an AppStateProvider (e.g. isolated tests): the provider is the single
 * subscriber that mirrors reports to the bell and, when out of scope, the red
 * dialog. `reportError` reports at severity 'error'; `notify` at 'info'.
 */
export const useErrorReporter = () => {
  return React.useMemo(() => ({
    reportError: (input: ErrorReportInput): void => {
      emitError({ ...input, severity: input.severity ?? 'error' });
    },
    notify: (input: ErrorReportInput): void => {
      emitError({ ...input, severity: input.severity ?? 'info' });
    },
  }), []);
};
