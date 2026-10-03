type PwaEventName =
  | 'pwa_install_prompt_shown'
  | 'pwa_install_clicked'
  | 'pwa_install_accepted'
  | 'pwa_install_dismissed'
  | 'pwa_install_completed'
  | 'pwa_update_available'
  | 'pwa_update_apply_clicked';

type TelemetryParams = Record<string, string | number | boolean | null | undefined>;

type GtagFunction = (command: 'event', eventName: string, params?: Record<string, unknown>) => void;

const isLocalHost = () => {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
};

const getGtag = (): GtagFunction | null => {
  if (typeof window.gtag === 'function') {
    return window.gtag as GtagFunction;
  }

  return null;
};

export const trackPwaEvent = (eventName: PwaEventName, params: TelemetryParams = {}): void => {
  if (isLocalHost()) {
    return;
  }

  const gtag = getGtag();
  if (!gtag) {
    return;
  }

  gtag('event', eventName, {
    event_category: 'pwa',
    ...params,
  });
};
