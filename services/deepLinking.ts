/**
 * Deep Linking Handler for PWA Shortcuts
 * 
 * Enables direct navigation to workflows from:
 * - App shortcuts (manifest.json)
 * - Taskbar/home screen deep links
 * - Query parameters (?agent=raw, ?agent=deed, ?agent=plans)
 */

export interface WorkflowRoute {
  id: string;
  path: string;
  name: string;
  description: string;
}

const WORKFLOW_ROUTES: Record<string, WorkflowRoute> = {
  raw: {
    id: 'raw',
    path: '/raw',
    name: 'Raw Crawler',
    description: 'Raw data processing and coordinate extraction',
  },
  deed: {
    id: 'deed',
    path: '/boundary',
    name: 'Boundary Agent',
    description: 'Deed and boundary analysis',
  },
  plans: {
    id: 'plans',
    path: '/plans',
    name: 'Civil Plans',
    description: 'Plan interpretation and analysis',
  },
};

/**
 * Parse deep link parameters from URL.
 * Handles:
 * - ?agent=raw|deed|plans (workflow shortcut)
 * - ?session=<id> (restore offline session)
 * - ?mode=<mode> (application mode)
 */
export interface DeepLinkParams {
  agent?: string;
  session?: string;
  mode?: string;
  source?: 'shortcut' | 'query' | 'taskbar';
}

export const parseDeepLink = (): DeepLinkParams => {
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash.slice(1);

  return {
    agent: params.get('agent') || undefined,
    session: params.get('session') || undefined,
    mode: params.get('mode') || undefined,
    source: (params.get('source') as any) || 'query',
  };
};

/**
 * Get target route from deep link parameters.
 */
export const getTargetRoute = (params: DeepLinkParams): WorkflowRoute | null => {
  if (!params.agent) return null;

  const route = WORKFLOW_ROUTES[params.agent];
  if (!route) {
    console.warn(`[DeepLink] Unknown agent: ${params.agent}`);
    return null;
  }

  return route;
};

/**
 * Build deep link URL for workflow shortcuts.
 * Used when creating taskbar/home screen shortcuts.
 */
export const buildWorkflowUrl = (agentId: string, baseUrl: string = '/'): string => {
  const route = WORKFLOW_ROUTES[agentId];
  if (!route) {
    console.warn(`[DeepLink] Cannot build URL for unknown agent: ${agentId}`);
    return baseUrl;
  }

  return `${baseUrl}?agent=${agentId}&source=shortcut`;
};

/**
 * Handle deep link navigation on app startup.
 * Called in App.tsx useEffect to route to correct workflow.
 */
export const handleDeepLinkNavigation = (
  params: DeepLinkParams,
  navigateFn: (path: string) => void
): void => {
  const route = getTargetRoute(params);

  if (route) {
    console.log(`[DeepLink] Navigating to ${route.name} (${route.id})`);
    navigateFn(route.path);

    // Track deep link usage for analytics
    trackDeepLinkUsage(params.agent!, params.source || 'query');
  }

  if (params.session) {
    console.log(`[DeepLink] Attempting to restore offline session: ${params.session}`);
    // Session restoration handled by OfflineStore
  }

  // Clear query parameters after handling
  if (params.agent || params.session) {
    window.history.replaceState({}, '', window.location.pathname);
  }
};

/**
 * Track deep link usage for analytics.
 */
export const trackDeepLinkUsage = (agent: string, source: string): void => {
  if (typeof window.gtag !== 'function') return;

  window.gtag('event', 'pwa_deeplink_navigation', {
    agent_id: agent,
    source: source,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Get all available workflow shortcuts for manifest.
 */
export const getWorkflowShortcuts = () => {
  return Object.values(WORKFLOW_ROUTES).map((route) => ({
    name: route.name,
    short_name: route.name.split(' ')[0],
    description: route.description,
    url: buildWorkflowUrl(route.id),
  }));
};

/**
 * Listen for taskbar/home screen shortcut launches.
 * Triggered when user launches app from shortcut instead of home screen icon.
 */
export const onShortcutLaunch = (
  callback: (route: WorkflowRoute) => void
): (() => void) => {
  const handleBeforeInstallPrompt = () => {
    const params = parseDeepLink();
    const route = getTargetRoute(params);

    if (route && params.source === 'shortcut') {
      callback(route);
    }
  };

  // Also handle page visibility changes (when app comes to foreground)
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      const params = parseDeepLink();
      const route = getTargetRoute(params);

      if (route) {
        callback(route);
      }
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
};
